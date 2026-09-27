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
    url: null, quadros: 0, blocos: new Map(), pedidos: new Map(),
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

// Fonte aberta: pede o áudio conformado ao Python
function veAudioFonte() {
    veAudioReset();
    if (!window.pywebview || !window.pywebview.api.video_cutter_audio_fonte) return;
    const pedido = VE.path;
    window.pywebview.api.video_cutter_audio_fonte().then(r => {
        if (!r || !r.success || VE.path !== pedido) return;
        VEAU.url = r.url;
        VEAU.quadros = r.quadros;
        veAudioIniciar().then(ok => { if (ok) { veApplyAudioGain(); veAudioPrever(VE.playhead); } });
    });
}

function veAudioReset() {
    veAudioParar();
    VEAU.url = null;
    VEAU.quadros = 0;
    VEAU.blocos.clear();
    VEAU.pedidos.clear();
    VEAU.chave = '';
}

// O mixer em tempo real manda no som (conformado pronto e processador de áudio funcionando)
function veAudioPronto() { return !!(VEAU.url && VEAU.ctx); }

// ── leitura do áudio conformado em blocos de 1 s (com cache) ──
function veAudioBloco(k) {
    if (k < 0 || k * VE_AU_BLOCO >= VEAU.quadros) return null;
    const b = VEAU.blocos.get(k);
    if (b) { VEAU.blocos.delete(k); VEAU.blocos.set(k, b); return b; }   // LRU
    if (!VEAU.pedidos.has(k)) {
        const ini = k * VE_AU_BLOCO * 4, fim = Math.min(VEAU.quadros, (k + 1) * VE_AU_BLOCO) * 4 - 1;
        const url = VEAU.url;
        const p = fetch(url, { headers: { Range: `bytes=${ini}-${fim}` } })
            .then(r => r.arrayBuffer())
            .then(buf => {
                if (VEAU.url !== url) return;
                VEAU.blocos.set(k, new Int16Array(buf));
                if (VEAU.blocos.size > 240) VEAU.blocos.delete(VEAU.blocos.keys().next().value);
            })
            .catch(() => {})
            .finally(() => VEAU.pedidos.delete(k));
        VEAU.pedidos.set(k, p);
    }
    return null;
}

// Pede ao disco os blocos que a timeline vai precisar entre t e t + VE_AU_PREVER
function veAudioPrever(t) {
    if (!VEAU.url) return [];
    const esperas = [];
    const a = t, b = t + VE_AU_PREVER * VEAU.taxa;
    (VEAU.clipes.length ? VEAU.clipes : veAudioClipes()).forEach(([st, s0, e0]) => {
        const fimC = st + (e0 - s0);
        if (fimC <= a || st >= b) return;
        const i0 = s0 + Math.max(0, a - st), i1 = s0 + Math.min(fimC, b) - st;
        for (let k = Math.floor(i0 * VE_AU_SR / VE_AU_BLOCO); k <= Math.floor(i1 * VE_AU_SR / VE_AU_BLOCO); k++) {
            if (!VEAU.blocos.has(k)) { veAudioBloco(k); if (VEAU.pedidos.has(k)) esperas.push(VEAU.pedidos.get(k)); }
        }
    });
    return esperas;
}

// Clipes com som, prontos para o mixer: [início, entrada, saída, ganho linear]
function veAudioClipes() {
    return veMixClipes().map(([st, s0, e0, g]) => [st, s0, e0, Math.pow(10, g / 20)]);
}

// ── mixagem ──
// Mixa n quadros de saída a partir do instante t da timeline (avançando `taxa` s da timeline por s de som)
function veAudioMixar(t, n) {
    const L = new Float32Array(n), R = new Float32Array(n), passo = VEAU.taxa / VE_AU_SR;
    for (const [st, s0, e0, g] of VEAU.clipes) {
        const fimC = st + (e0 - s0), tFim = t + n * passo;
        if (fimC <= t || st >= tFim) continue;
        const i0 = Math.max(0, Math.ceil((st - t) / passo)), i1 = Math.min(n, Math.ceil((fimC - t) / passo));
        for (let i = i0; i < i1; i++) {
            const f = (s0 + (t + i * passo - st)) * VE_AU_SR;   // quadro da fonte (fracionário)
            const q = Math.floor(f), fr = f - q;
            const k = Math.floor(q / VE_AU_BLOCO), b = VEAU.blocos.get(k);
            if (!b) continue;                                   // bloco ainda não lido: silêncio (raro, há previsão)
            const j = (q - k * VE_AU_BLOCO) * 2;
            let l = b[j], r = b[j + 1];
            if (fr > 0 && j + 3 < b.length) { l += (b[j + 2] - l) * fr; r += (b[j + 3] - r) * fr; }
            L[i] += l * g / 32768;
            R[i] += r * g / 32768;
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
