// =========================================================
// Sound Kanivete — motor de reprodução. Cada áudio é lido em trechos de 10 s de PCM (sk_trecho → Functions/
// sound_kanivete.trecho, cache em disco) e os trechos são agendados no WebAudio com antecedência (AudioBufferSource
// .start(quando)), então a agulha e os cortes caem na amostra certa e gravações de horas não ocupam memória.
// Ganho por clipe com fades + micro-fade de 5 ms + crossfade automático nas sobreposições (skFades = fades_efetivos
// do Python, igual na exportação). Grafo: clipe → barramento da faixa (EQ → compressor → volume → medidor) → master
// (medidores L/R, LUFS aproximado pela ponderação K) → saída.
// =========================================================
const SK_SEG = 10, SK_ANTES = 1.5, SK_BUSCA = 6, SK_MICRO = 0.005, SK_MAX_BUF = 48;
SK.mt = { buf: new Map(), fontes: [], feitos: new Set(), timer: 0, blocos: [], picoMax: -Infinity, clipe: 0 };
SK.bus = {};

function skCtx() {
    if (!SK.ctx) { SK.ctx = new (window.AudioContext || window.webkitAudioContext)(); skMaster(); }
    return SK.ctx;
}
function skMaster() {
    const ctx = SK.ctx, m = SK.master = {};
    // soma das faixas → volume do master → limitador → saída (medidores depois do limitador = o que sai no arquivo)
    m.ent = ctx.createGain(); m.vol = ctx.createGain(); m.lim = ctx.createDynamicsCompressor(); m.out = ctx.createGain();
    m.ent.connect(m.vol); m.vol.connect(m.lim); m.lim.connect(m.out); m.out.connect(ctx.destination);
    const sp = ctx.createChannelSplitter(2); m.out.connect(sp);
    m.L = ctx.createAnalyser(); m.R = ctx.createAnalyser(); m.L.fftSize = m.R.fftSize = 2048;
    sp.connect(m.L, 0); sp.connect(m.R, 1);
    // ponderação K (BS.1770): passa-alta ~38 Hz + prateleira +4 dB em 1,5 kHz → janela de ~0,34 s = LUFS momentâneo
    const hp = ctx.createBiquadFilter(), hs = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
    hs.type = 'highshelf'; hs.frequency.value = 1500; hs.gain.value = 4;
    const sk = ctx.createChannelSplitter(2); m.out.connect(hp); hp.connect(hs); hs.connect(sk);
    m.kL = ctx.createAnalyser(); m.kR = ctx.createAnalyser(); m.kL.fftSize = m.kR.fftSize = 16384;
    sk.connect(m.kL, 0); sk.connect(m.kR, 1);
    m.buf = new Float32Array(16384);
    // gate e de-esser rodam num AudioWorklet (aproximam o agate/sidechaincompress da exportação)
    SK.dynPronto = ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([SK_DYN_JS], { type: 'application/javascript' }))).then(() => { SK.dynOk = true; }).catch(() => {});
    skMasterAplicar();
}
function skMasterAplicar() {
    const m = SK.master; if (!m) return;
    const ms = (SK.proj && SK.proj.master) || {}, lim = ms.lim || {};
    m.vol.gain.value = ms.vol ?? 1;
    if (lim.ativo) { m.lim.threshold.value = lim.teto ?? -1; m.lim.knee.value = 0; m.lim.ratio.value = 20; m.lim.attack.value = 0.003; m.lim.release.value = 0.05; }
    else { m.lim.threshold.value = 0; m.lim.ratio.value = 1; m.lim.knee.value = 0; }
}
const SK_DYN_JS = `class SkDyn extends AudioWorkletProcessor {
    static get parameterDescriptors() { return [{ name: 'gate', defaultValue: 0 }, { name: 'gLim', defaultValue: 0.003 }, { name: 'deess', defaultValue: 0 }, { name: 'dQ', defaultValue: 0.5 }]; }
    constructor() { super(); this.env = 0; this.g = 1; this.hp = [0, 0]; this.px = [0, 0]; this.de = 0; }
    process(inp, out, P) {
        const i = inp[0], o = out[0]; if (!i || !i.length) return true;
        const n = i[0].length, sr = sampleRate, gate = P.gate[0] > 0.5, lim = P.gLim[0], de = P.deess[0] > 0.5, q = P.dQ[0];
        const aAt = Math.exp(-1 / (0.005 * sr)), aRe = Math.exp(-1 / (0.1 * sr)), dAt = Math.exp(-1 / (0.001 * sr)), dRe = Math.exp(-1 / (0.06 * sr)), c = Math.exp(-2 * Math.PI * 5000 / sr);
        for (let s = 0; s < n; s++) {
            let m = 0, h = 0;
            for (let ch = 0; ch < i.length; ch++) { const x = i[ch][s]; if (Math.abs(x) > m) m = Math.abs(x); const y = c * (this.hp[ch] + x - this.px[ch]); this.hp[ch] = y; this.px[ch] = x; if (Math.abs(y) > h) h = Math.abs(y); }
            let g = 1;
            if (gate) { this.env = m > this.env ? m : this.env * aRe; const alvo = this.env < lim ? 0.03 : 1; this.g = alvo > this.g ? alvo + (this.g - alvo) * aAt : alvo + (this.g - alvo) * aRe; g *= this.g; }
            if (de) { this.de = h > this.de ? h + (this.de - h) * dAt : h + (this.de - h) * dRe; if (this.de > 0.05) g *= Math.pow(0.05 / this.de, q); }
            for (let ch = 0; ch < o.length; ch++) o[ch][s] = (i[ch] || i[0])[s] * g;
        }
        return true;
    }
}
registerProcessor('sk-dyn', SkDyn);`;
const SK_GEQ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
SK.irs = {};
function skIrRev(tamanho) {   // IR do reverb gerada no Python (a mesma da exportação)
    const k = (+tamanho || 1.2).toFixed(1);
    return SK.irs[k] || (SK.irs[k] = skApi().sk_ir(+k).then(r => fetch(r.url)).then(r => r.arrayBuffer()).then(b => skCtx().decodeAudioData(b)));
}
function skBus(f) {
    const ctx = skCtx(); let b = SK.bus[f.id];
    if (!b) {
        const N = t => ctx[t]();
        b = { ent: N('createGain'), hpf: N('createBiquadFilter'), gr: N('createBiquadFilter'), me: N('createBiquadFilter'), ag: N('createBiquadFilter'),
            geq: SK_GEQ.map(() => N('createBiquadFilter')), comp: N('createDynamicsCompressor'), ganho: N('createGain'), seco: N('createGain'), conv: N('createConvolver'),
            molhado: N('createGain'), vol: N('createGain'), an: N('createAnalyser') };
        b.hpf.type = 'highpass'; b.hpf.Q.value = 0.7071;
        b.gr.type = 'lowshelf'; b.gr.frequency.value = 120; b.me.type = 'peaking'; b.me.frequency.value = 2500; b.me.Q.value = 0.7; b.ag.type = 'highshelf'; b.ag.frequency.value = 8000;
        b.geq.forEach((q, i) => { q.type = 'peaking'; q.frequency.value = SK_GEQ[i]; q.Q.value = 1.414; });
        b.conv.normalize = false; b.an.fftSize = 2048;
        b.ent.connect(b.hpf); let ant = b.hpf;
        if (SK.dynOk) { b.dyn = new AudioWorkletNode(ctx, 'sk-dyn', { outputChannelCount: [2] }); ant.connect(b.dyn); ant = b.dyn; }
        for (const n of [b.gr, b.me, b.ag, ...b.geq, b.comp, b.ganho]) { ant.connect(n); ant = n; }
        b.ganho.connect(b.seco); b.ganho.connect(b.conv); b.conv.connect(b.molhado); b.seco.connect(b.vol); b.molhado.connect(b.vol);
        b.vol.connect(SK.master.ent); b.vol.connect(b.an);
        SK.bus[f.id] = b;
    }
    const fx = f.fx || {}, eq = fx.eq || {}, c = fx.comp || {}, h = fx.hpf || {}, g = fx.gate || {}, d = fx.deess || {}, geq = fx.geq || {}, rv = fx.rev || {};
    b.hpf.frequency.value = h.ativo ? (h.freq || 80) : 1;
    if (b.dyn) { const P = b.dyn.parameters; P.get('gate').value = g.ativo ? 1 : 0; P.get('gLim').value = Math.pow(10, (g.limiar ?? -50) / 20); P.get('deess').value = d.ativo ? 1 : 0; P.get('dQ').value = d.quant ?? 0.5; }
    b.gr.gain.value = eq.grave || 0; b.me.gain.value = eq.medio || 0; b.ag.gain.value = eq.agudo || 0;
    b.geq.forEach((q, i) => { q.gain.value = geq.ativo ? (geq.bandas || [])[i] || 0 : 0; });
    if (c.ativo) { b.comp.threshold.value = c.limiar ?? -20; b.comp.ratio.value = c.razao ?? 3; b.comp.attack.value = 0.01; b.comp.release.value = 0.15; b.ganho.gain.value = Math.pow(10, (c.ganho || 0) / 20); }
    else { b.comp.threshold.value = 0; b.comp.ratio.value = 1; b.ganho.gain.value = 1; }
    const mix = rv.ativo ? (rv.mix ?? 0.25) : 0;
    b.seco.gain.value = 1 - mix; b.molhado.gain.value = mix;
    if (mix > 0 && b.irK !== (rv.tamanho ?? 1.2)) { const k = b.irK = rv.tamanho ?? 1.2; skIrRev(k).then(buf => { if (b.irK === k) b.conv.buffer = buf; }).catch(() => {}); }
    return b;
}
function skVolFaixa(f, solo) { return f.mudo || (solo && !f.solo) ? 0 : f.vol; }

// fades que valem de fato (pedido, micro-fade, crossfade na sobreposição) — igual a sound_kanivete.fades_efetivos
function skFades(c, f) {
    const ini = c.ini, dur = Math.max(0.01, c.dur); let fi = c.fade_in || 0, fo = c.fade_out || 0;
    for (const o of f.clipes) {
        if (o === c) continue;
        const oi = o.ini, of = o.ini + o.dur;
        if (oi < ini && ini < of) fi = Math.max(fi, Math.min(of, ini + dur) - ini);
        if (ini < oi && oi < ini + dur && ini + dur < of) fo = Math.max(fo, ini + dur - oi);
    }
    fi = Math.max(fi, SK_MICRO); fo = Math.max(fo, SK_MICRO);
    if (fi + fo > dur) { const k = dur / (fi + fo); fi *= k; fo *= k; }
    return [fi, fo];
}
function skGanho(c, fi, fo, t) { const d = t - c.ini; return c.vol * Math.max(0, Math.min(1, d / fi, (c.dur - d) / fo)) * skCurvaEm(c, d); }

// ── trechos de PCM (cache em memória com descarte dos menos usados) ──
function skPedaco(arq, k) {
    const ch = arq + '|' + k; let e = SK.mt.buf.get(ch);
    if (e) { e.uso = performance.now(); return e; }
    e = { uso: performance.now(), b: null };
    const ctx = skCtx();
    e.p = (async () => {
        const r = await skApi().sk_trecho(arq, k, ctx.sampleRate);
        if (!r || !r.success) throw new Error((r && r.error) || 'trecho');
        const s = new Int16Array(await (await fetch(r.url)).arrayBuffer()), n = s.length >> 1;
        if (!n) { e.vazio = true; return; }
        const b = ctx.createBuffer(2, n, ctx.sampleRate), L = b.getChannelData(0), R = b.getChannelData(1);
        for (let i = 0, j = 0; i < n; i++, j += 2) { L[i] = s[j] / 32768; R[i] = s[j + 1] / 32768; }
        e.b = b;
    })().catch(err => { e.erro = err; SK.mt.buf.delete(ch); });
    SK.mt.buf.set(ch, e);
    if (SK.mt.buf.size > SK_MAX_BUF) {
        const velhos = [...SK.mt.buf.entries()].filter(([, v]) => v.b).sort((a, b) => a[1].uso - b[1].uso);
        for (const [kk] of velhos.slice(0, SK.mt.buf.size - SK_MAX_BUF)) SK.mt.buf.delete(kk);
    }
    return e;
}
// trechos de cada clipe ativo entre a agulha e agulha + janela: [{c, f, k, a, b}] (a, b em segundos do arquivo)
function skPedacosNaJanela(ph, janela) {
    const out = [], solo = SK.proj.faixas.some(f => f.solo);
    for (const f of SK.proj.faixas) {
        if (f.mudo || (solo && !f.solo)) continue;
        for (const c of f.clipes) {
            if (c.ini + c.dur <= ph || c.ini > ph + janela || !SK.picos[c.arq]) continue;
            const a0 = c.de + Math.max(0, ph - c.ini), b0 = c.de + Math.min(c.dur, ph + janela - c.ini);
            for (let k = Math.floor(a0 / SK_SEG); k * SK_SEG < b0; k++) {
                const a = Math.max(k * SK_SEG, c.de), b = Math.min((k + 1) * SK_SEG, c.de + c.dur);
                if (b > a) out.push({ c, f, k, a, b });
            }
        }
    }
    return out;
}

// ── agendamento ──
function skAgendar() {
    if (!SK.tocando || !SK.proj) return;
    const ctx = SK.ctx, agora = ctx.currentTime, ph = Math.max(0, agora - SK.t0), solo = SK.proj.faixas.some(f => f.solo);
    for (const f of SK.proj.faixas) { const b = skBus(f); b.vol.gain.setTargetAtTime(skVolFaixa(f, solo), agora, 0.01); }
    for (const p of skPedacosNaJanela(ph, SK_BUSCA)) {
        const e = skPedaco(p.c.arq, p.k);
        const tl = p.c.ini + (p.a - p.c.de), chave = p.c.id + '|' + p.k;
        if (tl > ph + SK_ANTES || SK.mt.feitos.has(chave) || !e.b) continue;
        let quando = SK.t0 + tl, off = p.a - p.k * SK_SEG, dur = p.b - p.a, pulo = 0;
        if (quando < agora + 0.01) { pulo = agora + 0.01 - quando; off += pulo; dur -= pulo; quando += pulo; }
        dur = Math.min(dur, e.b.duration - off);
        SK.mt.feitos.add(chave);
        if (dur <= 0.002) continue;
        const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = e.b; src.connect(g); g.connect(skBus(p.f).ent);
        const [fi, fo] = skFades(p.c, p.f), t0 = quando - SK.t0, t1 = t0 + dur;
        if (pulo > 0) { g.gain.setValueAtTime(0, quando); g.gain.linearRampToValueAtTime(skGanho(p.c, fi, fo, t0 + 0.01), quando + 0.01); }   // entrou no meio: sobe em 10 ms
        else g.gain.setValueAtTime(skGanho(p.c, fi, fo, t0), quando);
        for (const t of [p.c.ini + fi, p.c.ini + p.c.dur - fo, ...(p.c.curva || []).map(q => p.c.ini + q[0]), t1].filter(t => t > t0 + (pulo > 0 ? 0.01 : 0) && t <= t1 + 1e-9).sort((x, y) => x - y))
            g.gain.linearRampToValueAtTime(skGanho(p.c, fi, fo, t), SK.t0 + t);
        src.start(quando, off, dur);
        const fonte = { src, g }; SK.mt.fontes.push(fonte);
        src.onended = () => { const i = SK.mt.fontes.indexOf(fonte); if (i >= 0) SK.mt.fontes.splice(i, 1); try { g.disconnect(); } catch (er) { /* já solto */ } };
    }
    // busca adiantada dos trechos seguintes (mesmo parado longe deles)
    for (const p of skPedacosNaJanela(ph + SK_ANTES, SK_BUSCA)) skPedaco(p.c.arq, p.k);
}
function skCalar(rampa = 0.012) {   // solta o que está tocando com uma descida curta (sem estalo)
    const ctx = SK.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    for (const { src, g } of SK.mt.fontes) { try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + rampa); src.stop(t + rampa + 0.005); } catch (e) { /* já parou */ } }
    SK.mt.fontes = []; SK.mt.feitos = new Set();
}
async function skTocar() {
    if (!SK.proj || SK.tocando) return;
    const ctx = skCtx(); ctx.resume();
    if (SK.ph >= skFim() && !SK.grav) SK.ph = 0;
    SK.tocando = true; skUi();
    // espera os primeiros trechos (até 2 s) para não começar mudo
    await SK.dynPronto;
    skMasterAplicar(); for (const f of SK.proj.faixas) skBus(f);
    await Promise.race([Promise.all(skPedacosNaJanela(SK.ph, SK_ANTES).map(p => skPedaco(p.c.arq, p.k).p)), new Promise(r => setTimeout(r, 2000))]);
    if (!SK.tocando) return;
    SK.t0 = ctx.currentTime + 0.03 - SK.ph;
    SK.mt.blocos = []; SK.mt.picoMax = -Infinity;
    skAgendar(); clearInterval(SK.mt.timer); SK.mt.timer = setInterval(skAgendar, 100);
    const passo = () => {
        if (!SK.tocando) return;
        SK.ph = Math.max(0, ctx.currentTime - SK.t0 - (ctx.outputLatency || 0));
        if (SK.ph >= skFim() + 0.2 && !SK.grav) { skParar(); return; }
        skSeguir(); skDesenhar(); skUiTempo(); skMedirAgora(); skUiMonitor?.();
        SK.raf = requestAnimationFrame(passo);
    };
    SK.raf = requestAnimationFrame(passo);
}
function skParar() {
    if (SK.grav) { skGravarParar(); return; }   // parar durante a gravação fecha a gravação
    SK.tocando = false; cancelAnimationFrame(SK.raf); clearInterval(SK.mt.timer);
    skCalar();
    SK.med = null;
    skUi?.(); skDesenhar?.(); if (typeof skUiMonitor === 'function') skUiMonitor();
}
function skMotorMudou() { if (SK.tocando) { skCalar(); skAgendar(); } }   // projeto mudou tocando: reagenda daqui em diante
function skSeguir() { const cv = skEl('sk-tl'); if (!cv) return; const x = (SK.ph - SK.x0) * SK.z, w = cv.clientWidth; if (x > w * 0.9 || x < 0) SK.x0 = Math.max(0, SK.ph - w * 0.1 / SK.z); }
function skIr(t) {
    SK.ph = Math.max(0, t);
    if (SK.tocando) { SK.t0 = SK.ctx.currentTime + 0.02 - SK.ph; skCalar(); skAgendar(); }
    else if (SK.proj) for (const p of skPedacosNaJanela(SK.ph, SK_ANTES)) skPedaco(p.c.arq, p.k);   // já deixa pronto
    skDesenhar(); skUiTempo();
}

// ── medidores: pico/RMS por faixa, L/R do master, LUFS momentâneo e integrado (aprox., portas -70 e -10) ──
const skDbV = v => v > 1e-6 ? 20 * Math.log10(v) : -120;
function skNivel(an, buf) {
    an.getFloatTimeDomainData(buf.subarray(0, an.fftSize));
    let p = 0, s = 0; for (let i = 0; i < an.fftSize; i++) { const v = buf[i]; s += v * v; if (v > p) p = v; else if (-v > p) p = -v; }
    return { pico: skDbV(p), rms: skDbV(Math.sqrt(s / an.fftSize)), ms: s / an.fftSize };
}
function skMedirAgora() {
    const m = SK.master; if (!m || !SK.proj) return null;
    const L = skNivel(m.L, m.buf), R = skNivel(m.R, m.buf), kL = skNivel(m.kL, m.buf), kR = skNivel(m.kR, m.buf);
    const M = kL.ms + kR.ms > 1e-10 ? -0.691 + 10 * Math.log10(kL.ms + kR.ms) : -120;
    const agora = performance.now();
    if (M > -70 && (!SK.mt.ultBloco || agora - SK.mt.ultBloco > 100)) { SK.mt.blocos.push(kL.ms + kR.ms); SK.mt.ultBloco = agora; }
    let I = null;
    if (SK.mt.blocos.length) {
        const lu = v => -0.691 + 10 * Math.log10(v), med = a => a.reduce((x, y) => x + y, 0) / a.length;
        const rel = lu(med(SK.mt.blocos)) - 10, ok = SK.mt.blocos.filter(v => lu(v) > rel);
        I = ok.length ? lu(med(ok)) : null;
    }
    const pico = Math.max(L.pico, R.pico);
    SK.mt.picoMax = Math.max(SK.mt.picoMax, pico);
    if (pico >= -0.1) SK.mt.clipe = agora;
    const faixas = {};
    for (const f of SK.proj.faixas) { const b = SK.bus[f.id]; if (b) faixas[f.id] = skNivel(b.an, m.buf); }
    return SK.med = { L, R, M, I, picoMax: SK.mt.picoMax, clipou: agora - SK.mt.clipe < 2000, faixas };
}
