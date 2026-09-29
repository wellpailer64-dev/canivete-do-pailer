// =========================================================
// Pocket Editor — motor de áudio em tempo real (todas as trilhas somadas)
// Como Premiere e DaVinci Resolve (Fairlight): o áudio da fonte é "conformado" ao abrir (PCM puro em disco,
// como os .cfa do Premiere) e um mixer soma as trilhas bloco a bloco enquanto toca, lendo só os trechos
// necessários (HTTP Range). Nada é renderizado de novo ao editar: a edição vale a partir do próximo bloco,
// sem parar o som. A placa de som é o relógio da reprodução; os players de vídeo tocam mudos e seguem.
// A exportação faz a mesma conta no ffmpeg (_grafo_mix em video_cutter.py): soma, ganho em dB, 48 kHz.
// =========================================================

const VE_AU_SR = 48000;
const VE_AU_BLOCO = 48000;          // quadros por bloco lido do disco (1 s)
const VE_AU_CHUNK = 1024;           // quadros por pedaço mandado ao processador de áudio (~21 ms)
const VE_AU_ADIANTE = 0.3;          // segundos já mixados na fila (o "buffer de reprodução")
const VE_AU_PREVER = 3;             // segundos lidos do disco à frente da agulha
const VE_AU_MANTER = 0.05;          // ao editar tocando, o que já está na fila e continua (s)

const VEAU = {
    ctx: null, node: null, ganho: null, falhou: false,
    fontes: new Map(),   // id da mídia → { url, quadros, blocos, pedidos } (0 = vídeo aberto; demais = áudios soltos)
    tocando: false, esperando: false, base: 0, taxa: 1, escritos: 0, lidos: 0, lidosCt: 0,
    wt: 0, clipes: [], chave: '', timer: 0, fila: 0,
};

// Processador (roda na thread de áudio): fila de pedaços → saída; conta o que tocou de verdade
const VE_AU_WORKLET = `
class VeMixer extends AudioWorkletProcessor {
    constructor() {
        super();
        this.q = []; this.off = 0; this.lidos = 0; this.n = 0; this.fila = 0;
        this.port.onmessage = e => {
            const m = e.data;
            if (m.t === 'dados') { this.q.push(m); this.fila += m.l.length; }
            else if (m.t === 'parar') { this.q = []; this.off = 0; this.fila = 0; this.lidos = 0; }
            else if (m.t === 'cortar') {
                // mantém só os primeiros m.manter quadros da fila (o resto vai ser mixado de novo)
                let resta = m.manter, nova = [], off = this.off;
                for (const c of this.q) {
                    const disp = c.l.length - off;
                    if (resta <= 0) break;
                    if (disp <= resta) { nova.push(off ? { l: c.l.subarray(off), r: c.r.subarray(off) } : c); resta -= disp; }
                    else { nova.push({ l: c.l.subarray(off, off + resta), r: c.r.subarray(off, off + resta) }); resta = 0; }
                    off = 0;
                }
                this.q = nova; this.off = 0; this.fila = nova.reduce((s, c) => s + c.l.length, 0);
                this.port.postMessage({ t: 'cortado', lidos: this.lidos, fila: this.fila });
            }
        };
    }
    process(inputs, outputs) {
        const L = outputs[0][0], R = outputs[0][1] || outputs[0][0];
        for (let i = 0; i < L.length; i++) {
            const c = this.q[0];
            if (!c) { L[i] = 0; R[i] = 0; continue; }
            L[i] = c.l[this.off]; R[i] = c.r[this.off];
            this.off++; this.lidos++; this.fila--;
            if (this.off >= c.l.length) { this.q.shift(); this.off = 0; }
        }
        if (++this.n % 4 === 0) this.port.postMessage({ t: 'pos', lidos: this.lidos, fila: this.fila, ct: currentTime });
        return true;
    }
}
registerProcessor('ve-mixer', VeMixer);`;

async function veAudioIniciar() {
    if (VEAU.ctx || VEAU.falhou) return !!VEAU.ctx;
    try {
        const ctx = new AudioContext({ sampleRate: VE_AU_SR, latencyHint: 'interactive' });
        const url = URL.createObjectURL(new Blob([VE_AU_WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, 've-mixer', { numberOfInputs: 0, outputChannelCount: [2] });
        const ganho = ctx.createGain();
        node.connect(ganho).connect(ctx.destination);
        node.port.onmessage = e => veAudioMsg(e.data);
        Object.assign(VEAU, { ctx, node, ganho });
        return true;
    } catch (e) {
        console.warn('[áudio] mixer em tempo real indisponível:', e);
        VEAU.falhou = true;
        return false;
    }
}

function veAudioMsg(m) {
    if (m.t === 'pos') { VEAU.lidos = m.lidos; VEAU.lidosCt = m.ct; VEAU.fila = m.fila; }
    else if (m.t === 'cortado') {
        // a fila foi aparada: volta a mixar a partir do fim do que ficou
        VEAU.lidos = m.lidos; VEAU.lidosCt = VEAU.ctx.currentTime;
        VEAU.escritos = m.lidos + m.fila;
        VEAU.wt = VEAU.base + VEAU.escritos / VE_AU_SR * VEAU.taxa;
        VEAU.esperando = false;
        veAudioAlimentar();
    }
}

// Registra uma fonte de som (áudio conformado) no mixer: id 0 = vídeo aberto; demais = áudios soltos
function veAudioRegistrar(id, url, quadros) {
    VEAU.fontes.set(id, { url, quadros, blocos: new Map(), pedidos: new Map() });
    VEAU.chave = '';
    return veAudioIniciar().then(ok => { if (ok) { veApplyAudioGain(); veAudioPrever(VE.playhead); veAudioEditou(); } return ok; });
}

// Fonte aberta: pede o áudio conformado ao Python
function veAudioFonte() {
    if (!window.pywebview || !window.pywebview.api.video_cutter_audio_fonte) return;
    const pedido = VE.path;
    window.pywebview.api.video_cutter_audio_fonte().then(r => {
        if (!r || !r.success || VE.path !== pedido) return;
        veAudioRegistrar(0, r.url, r.quadros);
    });
}

function veAudioReset() {
    veAudioParar();
    VEAU.fontes.clear();
    VEAU.clipes = [];
    VEAU.chave = '';
}

// O mixer em tempo real manda no som (alguma fonte conformada e processador de áudio funcionando)
function veAudioPronto() { return !!(VEAU.fontes.size && VEAU.ctx); }

// ── leitura do áudio conformado em blocos de 1 s (com cache por fonte) ──
function veAudioBloco(F, k) {
    if (k < 0 || k * VE_AU_BLOCO >= F.quadros) return null;
    const b = F.blocos.get(k);
    if (b) { F.blocos.delete(k); F.blocos.set(k, b); return b; }   // LRU
    if (!F.pedidos.has(k)) {
        const ini = k * VE_AU_BLOCO * 4, fim = Math.min(F.quadros, (k + 1) * VE_AU_BLOCO) * 4 - 1;
        const p = fetch(F.url, { headers: { Range: `bytes=${ini}-${fim}` } })
            .then(r => r.arrayBuffer())
            .then(buf => {
                F.blocos.set(k, new Int16Array(buf));
                if (F.blocos.size > 160) F.blocos.delete(F.blocos.keys().next().value);
            })
            .catch(() => {})
            .finally(() => F.pedidos.delete(k));
        F.pedidos.set(k, p);
    }
    return null;
}

// Pede ao disco os blocos que a timeline vai precisar entre t e t + VE_AU_PREVER
function veAudioPrever(t) {
    const esperas = [];
    const a = t, b = t + VE_AU_PREVER * VEAU.taxa;
    (VEAU.clipes.length ? VEAU.clipes : veAudioClipes()).forEach(([st, s0, e0, , id, v]) => {
        const F = VEAU.fontes.get(id), fimC = st + (e0 - s0) / v;
        if (!F || fimC <= a || st >= b) return;
        // (com folga de um grão: a mudança de velocidade lê um pouco além do ponto)
        const i0 = Math.max(0, s0 + Math.max(0, a - st) * v - 0.05), i1 = s0 + (Math.min(fimC, b) - st) * v + 0.05;
        for (let k = Math.floor(i0 * VE_AU_SR / VE_AU_BLOCO); k <= Math.floor(i1 * VE_AU_SR / VE_AU_BLOCO); k++) {
            if (!F.blocos.has(k)) { veAudioBloco(F, k); if (F.pedidos.has(k)) esperas.push(F.pedidos.get(k)); }
        }
    });
    return esperas;
}

// Clipes com som, prontos para o mixer: [início, entrada, saída, ganho linear, id da fonte, velocidade, manter tom,
// fade de entrada (s), fade de saída (s), efeitos de áudio]
function veAudioClipes() {
    return veMixClipes().map(([st, s0, e0, g, id, v, tom, fi, fo, afx]) => [st, s0, e0, Math.pow(10, g / 20), id, v || 1, tom !== 0, fi || 0, fo || 0, afx || []]);
}

// Ganho do fade no instante u (s desde o início do clipe na timeline): Potência constante = seno / cosseno
// (o mesmo do afade curve=qsin do ffmpeg na exportação)
function veAudioFade(u, dur, fi, fo) {
    let g = 1;
    if (fi > 0 && u < fi) g *= Math.sin(Math.PI / 2 * Math.max(0, u) / fi);
    if (fo > 0 && u > dur - fo) g *= Math.sin(Math.PI / 2 * Math.max(0, dur - u) / fo);
    return g;
}

// Amostra (esquerda, direita) da fonte F no quadro fracionário f, ou null se o bloco ainda não chegou
function veAudioAmostra(F, f) {
    const q = Math.floor(f), fr = f - q;
    const k = Math.floor(q / VE_AU_BLOCO), b = F.blocos.get(k);
    if (!b || q < 0) return null;
    const j = (q - k * VE_AU_BLOCO) * 2;
    let l = b[j], r = b[j + 1];
    if (fr > 0 && j + 3 < b.length) { l += (b[j + 2] - l) * fr; r += (b[j + 3] - r) * fr; }
    return [l, r];
}

function veAudioFxDb(db) { return Math.pow(10, db / 20); }
function veAudioFxTap(F, quadro, k) {
    const x = veAudioAmostra(F, quadro);
    return x ? [x[0] * k, x[1] * k] : [0, 0];
}
function veAudioFxLimiter(x, lim) {
    const a = Math.abs(x);
    return a <= lim ? x : Math.sign(x) * (lim + (a - lim) * 0.08);
}
function veAudioFxProcess(l, r, fx, tap) {
    if (!fx || !fx.length) return [l, r];
    for (const f of fx) {
        const v = f.v || {};
        if (f.t === 'denoise') {
            const amt = Math.max(0, Math.min(1, (v.amt || 0) / 100));
            const thr = veAudioFxDb(v.floor || -50);
            const a = Math.max(Math.abs(l), Math.abs(r));
            if (amt && a < thr) {
                const k = Math.max(0.03, 1 - amt * (1 - a / Math.max(1e-6, thr)));
                l *= k; r *= k;
            }
        } else if (f.t === 'dereverb') {
            const amt = Math.max(0, Math.min(1, (v.amt || 0) / 100));
            if (!amt) continue;
            if (tap) {
                const a = tap(0.045), b = tap(0.095);
                l = l * (1 + amt * 0.08) - (a[0] * 0.22 + b[0] * 0.12) * amt;
                r = r * (1 + amt * 0.08) - (a[1] * 0.22 + b[1] * 0.12) * amt;
            } else {
                const thr = veAudioFxDb(-34), a = Math.max(Math.abs(l), Math.abs(r));
                if (a < thr) { const k = 1 - amt * 0.45; l *= k; r *= k; }
            }
        } else if (f.t === 'reverb') {
            const wet = Math.max(0, Math.min(0.8, (v.mix || 0) / 100));
            if (!wet || !tap) continue;
            const sz = Math.max(0, Math.min(1, (v.size || 0) / 100));
            const a = tap(0.030 + sz * 0.050), b = tap(0.070 + sz * 0.090), c = tap(0.120 + sz * 0.150);
            l = l * (1 - wet * 0.20) + wet * (a[0] * 0.40 + b[0] * 0.25 + c[0] * 0.16);
            r = r * (1 - wet * 0.20) + wet * (a[1] * 0.40 + b[1] * 0.25 + c[1] * 0.16);
        } else if (f.t === 'eq') {
            const gl = veAudioFxDb(v.lo || 0), gm = veAudioFxDb(v.mid || 0), gh = veAudioFxDb(v.hi || 0);
            if (tap) {
                const a = tap(0.006), b = tap(0.012), h = tap(0.0008);
                const lowL = (l + a[0] + b[0]) / 3, lowR = (r + a[1] + b[1]) / 3;
                const hiL = l - (l + h[0]) / 2, hiR = r - (r + h[1]) / 2;
                const midL = l - lowL - hiL, midR = r - lowR - hiR;
                l = lowL * gl + midL * gm + hiL * gh;
                r = lowR * gl + midR * gm + hiR * gh;
            } else {
                l *= gm; r *= gm;
            }
        } else if (f.t === 'limiter') {
            const lim = veAudioFxDb(Math.min(0, v.ceil == null ? -1 : v.ceil));
            l = veAudioFxLimiter(l, lim);
            r = veAudioFxLimiter(r, lim);
        }
    }
    return [l, r];
}

// Velocidade mantendo o tom na prévia: grãos de 40 ms tocados na velocidade normal, cada um começando no ponto
// da fonte que corresponde ao seu instante, somados com janela Hann (50% de sobreposição soma 1). Não guarda
// estado: a amostra de qualquer instante sai só da conta — como o mixer, que refaz trechos ao editar.
// A exportação usa o atempo do ffmpeg (mesma ideia, com busca de encaixe da onda).
const VE_AU_GRAO = 960;   // meio grão (20 ms): distância entre grãos na saída
const VE_AU_HANN = (() => {
    const w = new Float32Array(VE_AU_GRAO * 2);
    for (let i = 0; i < w.length; i++) w[i] = 0.5 - 0.5 * Math.cos(Math.PI * i / VE_AU_GRAO);
    return w;
})();

// ── mixagem ──
// Mixa n quadros de saída a partir do instante t da timeline (avançando `taxa` s da timeline por s de som)
function veAudioMixar(t, n) {
    const L = new Float32Array(n), R = new Float32Array(n), passo = VEAU.taxa / VE_AU_SR;
    for (const [st, s0, e0, g, id, v, tom, fi, fo, fx] of VEAU.clipes) {
        const F = VEAU.fontes.get(id), fimC = st + (e0 - s0) / v, tFim = t + n * passo;
        if (!F || fimC <= t || st >= tFim) continue;
        const i0 = Math.max(0, Math.ceil((st - t) / passo)), i1 = Math.min(n, Math.ceil((fimC - t) / passo));
        const k0 = g / 32768, a0 = s0 * VE_AU_SR, durC = fimC - st, fade = fi > 0 || fo > 0;
        if (v === 1 || !tom) {
            // normal, ou velocidade que muda o tom junto (como fita mais rápida)
            for (let i = i0; i < i1; i++) {
                const frame = a0 + (t + i * passo - st) * v * VE_AU_SR;
                const x = veAudioAmostra(F, frame);
                if (!x) continue;                                   // bloco ainda não lido: silêncio (raro, há previsão)
                const k = fade ? k0 * veAudioFade(t + i * passo - st, durC, fi, fo) : k0;
                const y = veAudioFxProcess(x[0] * k, x[1] * k, fx, d => veAudioFxTap(F, frame - d * v * VE_AU_SR, k));
                L[i] += y[0];
                R[i] += y[1];
            }
            continue;
        }
        for (let i = i0; i < i1; i++) {
            const u = (t + i * passo - st) * VE_AU_SR;           // quadros desde o início do clipe (na saída)
            const g1 = Math.floor(u / VE_AU_GRAO);
            let l = 0, r = 0;
            for (let gi = g1 - 1; gi <= g1; gi++) {
                if (gi < 0) continue;                            // no começo do clipe: entra suave (meio grão)
                const ug = gi * VE_AU_GRAO, o = u - ug;
                const x = veAudioAmostra(F, a0 + ug * v + o);
                if (!x) continue;
                const w = VE_AU_HANN[Math.min(VE_AU_HANN.length - 1, Math.floor(o))];
                l += x[0] * w; r += x[1] * w;
            }
            const k = fade ? k0 * veAudioFade(t + i * passo - st, durC, fi, fo) : k0;
            const y = veAudioFxProcess(l * k, r * k, fx, null);
            L[i] += y[0];
            R[i] += y[1];
        }
    }
    return { l: L, r: R };
}

// Mantém ~VE_AU_ADIANTE s mixados na fila do processador
function veAudioAlimentar() {
    if (!VEAU.tocando || VEAU.esperando) return;
    const alvo = VE_AU_ADIANTE * VE_AU_SR;
    let guarda = 64;
    while (VEAU.escritos - VEAU.lidos < alvo && guarda-- > 0) {
        const m = veAudioMixar(VEAU.wt, VE_AU_CHUNK);
        VEAU.node.port.postMessage({ t: 'dados', l: m.l, r: m.r }, [m.l.buffer, m.r.buffer]);
        VEAU.escritos += VE_AU_CHUNK;
        VEAU.wt += VE_AU_CHUNK / VE_AU_SR * VEAU.taxa;
    }
    veAudioPrever(VEAU.wt);
}

// Instante da timeline que está SAINDO na caixa de som agora
function veAudioPos() {
    const ctx = VEAU.ctx;
    const extra = Math.min(0.05, Math.max(0, ctx.currentTime - VEAU.lidosCt));
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    const tocado = Math.max(0, VEAU.lidos / VE_AU_SR + extra - lat);
    return VEAU.base + Math.min(tocado, VEAU.escritos / VE_AU_SR) * VEAU.taxa;
}

async function veAudioTocar(t) {
    if (!veAudioPronto()) return false;
    veAudioParar();
    VEAU.tocando = true;
    VEAU.taxa = VE.rate;
    VEAU.clipes = veAudioClipes();
    VEAU.chave = JSON.stringify(VEAU.clipes);
    VEAU.base = VEAU.wt = t;
    VEAU.escritos = VEAU.lidos = 0;
    VEAU.lidosCt = VEAU.ctx.currentTime;
    if (VEAU.ctx.state === 'suspended') VEAU.ctx.resume().catch(() => {});
    // espera só os primeiros blocos (disco local: poucos ms) para não começar com silêncio
    const esperas = veAudioPrever(t);
    if (esperas.length) await Promise.race([Promise.all(esperas), new Promise(r => setTimeout(r, 400))]);
    if (!VEAU.tocando || VEAU.base !== t) return true;
    veAudioAlimentar();
    clearInterval(VEAU.timer);
    VEAU.timer = setInterval(veAudioAlimentar, 20);
    return true;
}

function veAudioParar() {
    VEAU.tocando = false;
    VEAU.esperando = false;
    clearInterval(VEAU.timer);
    if (VEAU.node) VEAU.node.port.postMessage({ t: 'parar' });
    VEAU.lidos = VEAU.escritos = 0;
}

// A timeline mudou: tocando, o que ainda não tocou é mixado de novo (sem parar o som)
function veAudioEditou() {
    const cl = veAudioClipes(), chave = JSON.stringify(cl);
    if (chave === VEAU.chave) return;
    VEAU.clipes = cl;
    VEAU.chave = chave;
    if (!VEAU.tocando) { veAudioPrever(VE.playhead); return; }
    VEAU.esperando = true;
    VEAU.node.port.postMessage({ t: 'cortar', manter: Math.round(VE_AU_MANTER * VE_AU_SR) });
}

function veAudioMudo(m) { if (VEAU.ganho) VEAU.ganho.gain.value = m ? 0 : 1; }
