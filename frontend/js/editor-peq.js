// Equalizador paramétrico (como o Parametric Equalizer do Premiere / Pro-Q): efeito de áudio "peq" no clipe
// (Controles de efeito › "Editar no painel") e no Rack da trilha (Mixer). O painel "Equalizador" mostra a curva, os
// pontos de cada banda (arrastar = frequência e ganho; rodinha = Q ou inclinação; duplo clique no vazio = banda nova;
// duplo clique no ponto = liga/desliga; botão direito ou Delete = remove) e o espectro do som tocando por trás.
// Bandas: v.b = [{t: 'hp'|'ls'|'pk'|'hs'|'lp'|'notch', f (Hz), g (dB), q, s (dB/oitava dos cortes: 12|24|48), on}],
// v.out = ganho de saída (dB). Filtros biquad RBJ com os MESMOS coeficientes na prévia (veAprCoef, editor-afx-pr.js) e
// na exportação (video_cutter._filtros_afx "peq" → efeitos_pr.coef → biquad do ffmpeg): o som é o mesmo.
// O EQ antigo de 3 faixas ("eq") ganhou a prévia com os filtros reais também (vePeqSecoesEq = equalizer do ffmpeg).

const VE_PEQ_TIPOS = {
    hp: { nome: 'Corte de graves', ic: '⟋', corte: true }, ls: { nome: 'Prateleira de graves', ic: '⌐' },
    pk: { nome: 'Sino', ic: '∩' }, notch: { nome: 'Notch', ic: '∨', corte: true },
    hs: { nome: 'Prateleira de agudos', ic: '¬' }, lp: { nome: 'Corte de agudos', ic: '⟍', corte: true },
};
const VE_PEQ_CORES = ['#ff5d8f', '#ffb84d', '#ffe066', '#5ee38c', '#4dd2ff', '#8c8cff', '#d07dff', '#ff7a5c'];
const VE_PEQ_MAX = 8, VE_PEQ_DB = 18, VE_PEQ_F0 = 20, VE_PEQ_F1 = 20000;
const vePeqPadrao = () => ({ out: 0, b: [
    { t: 'hp', f: 40, g: 0, q: 0.707, s: 24, on: false }, { t: 'ls', f: 120, g: 0, q: 0.707, on: true },
    { t: 'pk', f: 500, g: 0, q: 1, on: true }, { t: 'pk', f: 2500, g: 0, q: 1, on: true },
    { t: 'hs', f: 8000, g: 0, q: 0.707, on: true }, { t: 'lp', f: 18000, g: 0, q: 0.707, s: 24, on: false }] });
// presets pensados para vídeo (voz, ruído, efeitos)
const VE_PEQ_PRESETS = {
    'Voz mais clara': { out: 0, b: [{ t: 'hp', f: 80, g: 0, q: 0.707, s: 24, on: true }, { t: 'pk', f: 250, g: -3, q: 1.2, on: true }, { t: 'pk', f: 3000, g: 3, q: 1, on: true }, { t: 'hs', f: 10000, g: 2, q: 0.707, on: true }] },
    'Tirar ronco e vento': { out: 0, b: [{ t: 'hp', f: 120, g: 0, q: 0.707, s: 48, on: true }, { t: 'pk', f: 180, g: -2, q: 1.4, on: true }] },
    'Voz de podcast (encorpada)': { out: 0, b: [{ t: 'hp', f: 60, g: 0, q: 0.707, s: 24, on: true }, { t: 'ls', f: 120, g: 3, q: 0.707, on: true }, { t: 'pk', f: 320, g: -2, q: 1.1, on: true }, { t: 'pk', f: 4500, g: 2, q: 0.9, on: true }, { t: 'hs', f: 9000, g: 1.5, q: 0.707, on: true }] },
    'Rádio / telefone': { out: 2, b: [{ t: 'hp', f: 300, g: 0, q: 0.707, s: 24, on: true }, { t: 'pk', f: 1500, g: 4, q: 0.8, on: true }, { t: 'lp', f: 3400, g: 0, q: 0.707, s: 24, on: true }] },
    'Tirar chiado (de-hiss)': { out: 0, b: [{ t: 'hs', f: 7000, g: -6, q: 0.707, on: true }, { t: 'lp', f: 14000, g: 0, q: 0.707, s: 12, on: true }] },
    'Tirar zumbido de 60 Hz': { out: 0, b: [{ t: 'notch', f: 60, g: 0, q: 12, on: true }, { t: 'notch', f: 120, g: 0, q: 12, on: true }, { t: 'notch', f: 180, g: 0, q: 12, on: true }] },
    'Música atrás da voz (abre espaço)': { out: 0, b: [{ t: 'pk', f: 2000, g: -4, q: 0.7, on: true }, { t: 'pk', f: 300, g: -1.5, q: 1, on: true }] },
};

// ── contas (as mesmas da exportação) ──
const vePeqLimpa = b => ({ t: VE_PEQ_TIPOS[b.t] ? b.t : 'pk', f: Math.min(VE_PEQ_F1, Math.max(VE_PEQ_F0, +b.f || 1000)),
    g: Math.min(VE_PEQ_DB, Math.max(-VE_PEQ_DB, +b.g || 0)), q: Math.min(30, Math.max(0.1, +b.q || 0.707)),
    s: [12, 24, 48].includes(+b.s) ? +b.s : 12, on: b.on !== false });
// seções biquad [b0, b1, b2, a1, a2] de uma banda (cortes de 24/48 dB: Butterworth em cascata)
function vePeqSecoesBanda(b) {
    b = vePeqLimpa(b);
    if (!b.on) return [];
    if (b.t === 'pk') return Math.abs(b.g) < 0.01 ? [] : [veAprCoef('peak', b.f, b.q, b.g)];
    if (b.t === 'ls' || b.t === 'hs') return Math.abs(b.g) < 0.01 ? [] : [veAprCoef(b.t === 'ls' ? 'low' : 'high', b.f, b.q, b.g)];
    if (b.t === 'notch') return [veAprCoef('notch', b.f, b.q)];
    const n = b.s / 6, tipo = b.t;   // ordem do Butterworth
    if (n === 2) return [veAprCoef(tipo, b.f, b.q)];
    return Array.from({ length: n / 2 }, (_, k) => veAprCoef(tipo, b.f, 1 / (2 * Math.cos((2 * k + 1) * Math.PI / (2 * n)))));
}
function vePeqSecoes(v) { return ((v && v.b) || []).flatMap(vePeqSecoesBanda); }
// EQ de 3 faixas antigo: o equalizer do ffmpeg (sino com largura em oitavas) — Q tirado da largura
function vePeqSecoesEq(v) {
    return [[120, 2, v.lo], [1000, 1, v.mid], [6500, 2, v.hi]].filter(([, , g]) => Math.abs(g || 0) > 0.01).map(([f, bw, g]) => {
        const w = 2 * Math.PI * f / VE_APR_SR, q = 1 / (2 * Math.sinh(Math.LN2 / 2 * bw * w / Math.sin(w)));
        return veAprCoef('peak', f, q, g);
    });
}
// prévia: um passo (estado por efeito, como os do Premiere); chamado pelo veAudioFxProcess
function vePeqProcessar(f, j, l, r, st) {
    if (!st) return [l, r];
    const k = 'peq' + j;
    let P = st[k];
    if (!P || P._f !== f) {
        const cs = f.t === 'eq' ? vePeqSecoesEq(f.v || {}) : vePeqSecoes(f.v);
        P = st[k] = { k: 'bq', cs, z: cs.map(() => [0, 0, 0, 0]), ganho: Math.pow(10, ((f.t === 'peq' && +f.v.out) || 0) / 20), _f: f };
    }
    if (P.cs.length) [l, r] = veAprPasso(P, l, r);
    return P.ganho !== 1 ? [l * P.ganho, r * P.ganho] : [l, r];
}
// resposta em dB de uma lista de seções na frequência f
function vePeqDb(cs, f) {
    const w = 2 * Math.PI * f / VE_APR_SR, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    let db = 0;
    for (const [b0, b1, b2, a1, a2] of cs) {
        const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = 1 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
        db += 10 * Math.log10(Math.max(1e-20, (nr * nr + ni * ni) / Math.max(1e-20, dr * dr + di * di)));
    }
    return db;
}

// ── o efeito ──
VE_AFX.peq = {
    nome: 'Equalizador paramétrico', cat: 'Áudio · Filtro e EQ', tag: 'Parametric Equalizer', livre: true,
    painel: 'peq', params: [], novo: vePeqPadrao,
    abrir: (c, f) => vePeqAbrir({ tipo: 'clipe', c, id: f.id }),
    neutro: v => !(Math.abs(+v.out || 0) > 0.01) && !vePeqSecoes(v).length,
};
if (VE_AFX.eq) VE_AFX.eq.nome = 'Equalizador simples (3 faixas)';

// ── painel ──
const VEPEQ = { alvo: null, sel: 0, el: null, cv: null, an: null, raf: 0, arrasto: null, tMud: 0 };

function vePeqEfeito() {
    const a = VEPEQ.alvo; if (!a) return null;
    if (a.tipo === 'clipe') { const f = ((a.c && a.c.afx) || []).find(x => x.id === a.id); return f && VE.clips.includes(a.c) ? f : null; }
    return (((VE_TRK.a || [])[a.k] || {}).fx || []).find(x => x.id === a.id) || null;
}
function vePeqTitulo() {
    const a = VEPEQ.alvo; if (!a) return '';
    if (a.tipo === 'clipe') { const i = VE.clips.indexOf(a.c); return `${veT('Clipe')} ${i + 1}${a.c && veIsAudio(a.c) ? ' · ' + veT('áudio') : ''}`; }
    return `${veT('Trilha')} A${a.k + 1} · Rack`;
}
// grava o efeito mudado (sem desfazer a cada movimento: o desfazer guarda o início do gesto)
function vePeqMudar(fn, historia) {
    const a = VEPEQ.alvo, f = vePeqEfeito(); if (!f) return;
    if (historia) vePushHistory();
    const novo = { ...f, v: fn(JSON.parse(JSON.stringify(f.v))) };
    if (a.tipo === 'clipe') a.c.afx = a.c.afx.map(x => x.id === a.id ? novo : x);
    else { const st = veTrackState('a', a.k); st.fx = st.fx.map(x => x.id === a.id ? novo : x); }
    if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
    cancelAnimationFrame(VEPEQ.tMud);
    VEPEQ.tMud = requestAnimationFrame(() => {   // som: remixa no próximo quadro (vários movimentos = uma vez)
        if (a.tipo === 'trilha') veMixMudou(); else if (veMixAtivo()) veAudioEditou();
        if (a.tipo === 'clipe' && typeof veRenderFxControls === 'function') veRenderFxControls();
    });
    vePeqDesenhar(); vePeqLista();
}

function vePeqAbrir(alvo) {
    VEPEQ.alvo = alvo; VEPEQ.sel = 0;
    if (!VED.el.peq) {
        const el = document.createElement('div');
        el.className = 've-panel ve-peq-painel'; el.dataset.panel = 'peq'; el.dataset.title = veT('Equalizador');
        el.innerHTML = `<div class="ve-peq">
            <div class="ve-peq-topo"><b data-pq="titulo"></b>
                <label class="ve-peq-on"><input type="checkbox" data-pq="on"> ${veT('ligado')}</label>
                <select data-pq="preset"><option value="">${veT('Presets…')}</option>${Object.keys(VE_PEQ_PRESETS).map(n => `<option>${veEsc(veT(n))}</option>`).join('')}<option value="__zerar">${veT('Zerar (plano)')}</option></select>
                <span class="ve-peq-esp"></span>
                <label class="ve-peq-saida">${veT('Saída')} <input type="range" min="-18" max="18" step="0.1" data-pq="out"><i data-pq="outv"></i></label></div>
            <div class="ve-peq-area"><canvas></canvas><div class="ve-peq-dica" data-pq="dica"></div></div>
            <div class="ve-peq-bandas" data-pq="bandas"></div></div>`;
        document.getElementById('ve-dock-store').appendChild(el);
        VED.ids.push('peq'); VED.el.peq = el;
        VEPEQ.el = el; VEPEQ.cv = el.querySelector('canvas');
        vePeqLigar(el);
        if (!vedFloat('peq', { x: window.screenX + 220, y: window.screenY + 180, w: 980, h: 520 })) vedShow('peq');
    } else vedShow('peq');
    vePeqLista(); vePeqDesenhar(); vePeqLaco();
}

// ── geometria ──
function vePeqGeo() {
    const cv = VEPEQ.cv, area = cv.parentElement, dpr = cv.ownerDocument.defaultView.devicePixelRatio || 1;
    const W = Math.max(100, area.clientWidth), H = Math.max(80, area.clientHeight);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const m = { l: 34, r: 10, t: 10, b: 20 };
    const x = f => m.l + Math.log(f / VE_PEQ_F0) / Math.log(VE_PEQ_F1 / VE_PEQ_F0) * (W - m.l - m.r);
    const f = px => VE_PEQ_F0 * Math.pow(VE_PEQ_F1 / VE_PEQ_F0, (px - m.l) / (W - m.l - m.r));
    const y = db => m.t + (VE_PEQ_DB - db) / (2 * VE_PEQ_DB) * (H - m.t - m.b);
    const db = py => VE_PEQ_DB - (py - m.t) / (H - m.t - m.b) * 2 * VE_PEQ_DB;
    return { W, H, dpr, m, x, f, y, db };
}
const vePeqPontoDb = b => (VE_PEQ_TIPOS[b.t].corte ? 0 : b.g);

function vePeqDesenhar() {
    if (!VEPEQ.cv || !VEPEQ.el || VEPEQ.el.offsetParent === null) return;
    const f = vePeqEfeito(), G = vePeqGeo(), x = VEPEQ.cv.getContext('2d');
    x.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    x.fillStyle = '#121214'; x.fillRect(0, 0, G.W, G.H);
    // grade
    x.font = '10px ' + (getComputedStyle(VEPEQ.el).getPropertyValue('--ve-ui') || 'sans-serif');
    x.lineWidth = 1;
    [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(hz => {
        const px = Math.round(G.x(hz)) + 0.5;
        x.strokeStyle = 'rgba(255,255,255,0.06)'; x.beginPath(); x.moveTo(px, G.m.t); x.lineTo(px, G.H - G.m.b); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillText(hz >= 1000 ? hz / 1000 + 'k' : String(hz), hz === 20000 ? px - 24 : px + 2, G.H - 6);
    });
    for (let d = -VE_PEQ_DB; d <= VE_PEQ_DB; d += 6) {
        const py = Math.round(G.y(d)) + 0.5;
        x.strokeStyle = d === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'; x.beginPath(); x.moveTo(G.m.l, py); x.lineTo(G.W - G.m.r, py); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillText((d > 0 ? '+' : '') + d, 4, py + 3);
    }
    // espectro do som tocando (a saída do editor)
    if (VEPEQ.an && VE.playing) {
        const an = VEPEQ.an, dados = VEPEQ.buf || (VEPEQ.buf = new Float32Array(an.frequencyBinCount));
        an.getFloatFrequencyData(dados);
        const sr = an.context.sampleRate, n = dados.length;
        x.beginPath(); x.moveTo(G.m.l, G.H - G.m.b);
        for (let px = G.m.l; px <= G.W - G.m.r; px += 2) {
            const i = Math.min(n - 1, Math.round(G.f(px) / (sr / 2) * n));
            const v = Math.max(-100, Math.min(0, dados[i]));
            x.lineTo(px, G.m.t + (-v / 100) * (G.H - G.m.t - G.m.b));
        }
        x.lineTo(G.W - G.m.r, G.H - G.m.b); x.closePath();
        x.fillStyle = 'rgba(120,160,255,0.14)'; x.fill();
    }
    if (!f) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillText(veT('O equalizador deste clipe/trilha foi removido'), G.m.l + 10, G.m.t + 20); return; }
    const v = f.v, off = f.on === false;
    // curva de cada banda (fraca) e a soma (forte)
    (v.b || []).forEach((b, i) => {
        const cs = vePeqSecoesBanda(b); if (!cs.length) return;
        x.strokeStyle = VE_PEQ_CORES[i % VE_PEQ_CORES.length] + '55'; x.lineWidth = 1; x.beginPath();
        for (let px = G.m.l; px <= G.W - G.m.r; px += 2) { const py = G.y(Math.max(-VE_PEQ_DB - 6, vePeqDb(cs, G.f(px)))); px === G.m.l ? x.moveTo(px, py) : x.lineTo(px, py); }
        x.stroke();
    });
    const cs = vePeqSecoes(v), out = +v.out || 0;
    x.strokeStyle = off ? 'rgba(255,255,255,0.35)' : (getComputedStyle(VEPEQ.el).getPropertyValue('--primary').trim() || '#d4814a');
    x.lineWidth = 2.2; x.beginPath();
    for (let px = G.m.l; px <= G.W - G.m.r; px += 1.5) { const py = G.y(Math.max(-VE_PEQ_DB - 6, vePeqDb(cs, G.f(px)) + out)); px === G.m.l ? x.moveTo(px, py) : x.lineTo(px, py); }
    x.stroke();
    // pontos
    (v.b || []).forEach((b0, i) => {
        const b = vePeqLimpa(b0), px = G.x(b.f), py = G.y(vePeqPontoDb(b)), cor = VE_PEQ_CORES[i % VE_PEQ_CORES.length];
        x.beginPath(); x.arc(px, py, i === VEPEQ.sel ? 8 : 6.5, 0, Math.PI * 2);
        x.fillStyle = b.on ? cor : '#2a2a2e'; x.fill();
        x.lineWidth = i === VEPEQ.sel ? 2.5 : 1.5; x.strokeStyle = b.on ? '#fff' : cor; x.stroke();
        x.fillStyle = b.on ? '#111' : cor; x.font = 'bold 9px sans-serif'; x.textAlign = 'center'; x.fillText(String(i + 1), px, py + 3); x.textAlign = 'left';
    });
}

// espectro só com o painel à vista e tocando (leve com o app parado)
function vePeqLaco() {
    if (VEPEQ.raf) return;
    const passo = () => {
        VEPEQ.raf = 0;
        if (!VEPEQ.el || !VED.el.peq || VEPEQ.el.offsetParent === null) return;
        if (VE.playing) {
            if (!VEPEQ.an && VEAU.ctx && VEAU.ganho) {
                VEPEQ.an = VEAU.ctx.createAnalyser(); VEPEQ.an.fftSize = 8192; VEPEQ.an.smoothingTimeConstant = 0.8;
                VEAU.ganho.connect(VEPEQ.an);
            }
            vePeqDesenhar();
        }
        VEPEQ.raf = requestAnimationFrame(passo);
    };
    VEPEQ.raf = requestAnimationFrame(passo);
}

// lista de bandas embaixo (o selecionado com os números)
function vePeqLista() {
    const el = VEPEQ.el; if (!el) return;
    const f = vePeqEfeito(), q = k => el.querySelector(`[data-pq="${k}"]`);
    q('titulo').textContent = `${veT('Equalizador')} · ${vePeqTitulo()}`;
    if (!f) { q('bandas').innerHTML = ''; return; }
    q('on').checked = f.on !== false;
    if (el.ownerDocument.activeElement !== q('out')) q('out').value = +f.v.out || 0;
    q('outv').textContent = `${(+f.v.out || 0) > 0 ? '+' : ''}${(+f.v.out || 0).toFixed(1)} dB`;
    const bs = f.v.b || [];
    if (VEPEQ.sel >= bs.length) VEPEQ.sel = Math.max(0, bs.length - 1);
    q('bandas').innerHTML = bs.map((b0, i) => {
        const b = vePeqLimpa(b0), T = VE_PEQ_TIPOS[b.t], cor = VE_PEQ_CORES[i % VE_PEQ_CORES.length];
        return `<div class="ve-peq-b${i === VEPEQ.sel ? ' sel' : ''}${b.on ? '' : ' off'}" data-b="${i}" style="--c:${cor}">
            <button class="ve-peq-n" data-bact="on" title="${veT('Liga/desliga a banda')}">${i + 1}</button>
            <select data-bk="t" title="${veT('Tipo de filtro')}">${Object.entries(VE_PEQ_TIPOS).map(([k, d]) => `<option value="${k}"${k === b.t ? ' selected' : ''}>${d.ic} ${veT(d.nome)}</option>`).join('')}</select>
            <label>Hz<input data-bk="f" value="${b.f >= 1000 ? (b.f / 1000).toFixed(2) + 'k' : Math.round(b.f)}"></label>
            ${T.corte && b.t !== 'notch' ? `<label>dB/oit<select data-bk="s">${[12, 24, 48].map(s => `<option${s === b.s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>`
                : `<label>dB<input data-bk="g" value="${b.g.toFixed(1)}"${T.corte ? ' disabled' : ''}></label>`}
            <label>Q<input data-bk="q" value="${b.q.toFixed(2)}"></label>
            <button class="ve-peq-x" data-bact="del" title="${veT('Remover a banda')}">✕</button></div>`;
    }).join('') + (bs.length < VE_PEQ_MAX ? `<button class="ve-peq-mais" data-bact="add" title="${veT('Banda nova (ou duplo clique na curva)')}">+</button>` : '');
}

function vePeqNum(txt) {
    const s = String(txt).trim().toLowerCase().replace(',', '.');
    const k = /k$/.test(s), n = parseFloat(s);
    return isFinite(n) ? n * (k ? 1000 : 1) : NaN;
}

function vePeqLigar(el) {
    const q = k => el.querySelector(`[data-pq="${k}"]`);
    q('on').addEventListener('change', e => {
        const a = VEPEQ.alvo, f = vePeqEfeito(); if (!f) return;
        if (a.tipo === 'clipe') { vePushHistory(); a.c.afx = a.c.afx.map(x => x.id === a.id ? { ...x, on: e.target.checked } : x); if (veMixAtivo()) veAudioEditou(); veRenderFxControls(); }
        else { const st = veTrackState('a', a.k); st.fx = st.fx.map(x => x.id === a.id ? { ...x, on: e.target.checked } : x); veMixMudou(); }
        vePeqDesenhar();
    });
    q('out').addEventListener('pointerdown', () => vePushHistory());
    q('out').addEventListener('input', e => vePeqMudar(v => ({ ...v, out: +e.target.value })));
    q('preset').addEventListener('change', e => {
        const n = e.target.value; e.target.value = ''; if (!n) return;
        const p = n === '__zerar' ? { out: 0, b: vePeqPadrao().b } : JSON.parse(JSON.stringify(VE_PEQ_PRESETS[Object.keys(VE_PEQ_PRESETS).find(k => veT(k) === n || k === n)]));
        VEPEQ.sel = 0;
        vePeqMudar(() => p, true);
    });
    const bandas = q('bandas');
    bandas.addEventListener('click', e => {
        const a = e.target.closest('[data-bact]'), row = e.target.closest('[data-b]');
        if (row && !a) { VEPEQ.sel = +row.dataset.b; vePeqLista(); vePeqDesenhar(); return; }
        if (!a) return;
        if (a.dataset.bact === 'add') { vePeqNova(1000, 0); return; }
        const i = +row.dataset.b;
        if (a.dataset.bact === 'on') vePeqMudar(v => { v.b[i].on = v.b[i].on === false; return v; }, true);
        if (a.dataset.bact === 'del') vePeqMudar(v => { v.b.splice(i, 1); return v; }, true);
    });
    bandas.addEventListener('change', e => {
        const row = e.target.closest('[data-b]'), k = e.target.dataset.bk; if (!row || !k) return;
        const i = +row.dataset.b, val = k === 't' ? e.target.value : k === 's' ? +e.target.value : vePeqNum(e.target.value);
        if (k !== 't' && !isFinite(val)) { vePeqLista(); return; }
        VEPEQ.sel = i;
        vePeqMudar(v => { v.b[i] = vePeqLimpa({ ...v.b[i], [k]: val }); return v; }, true);
    });
    bandas.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
    // curva: arrastar pontos, rodinha = Q, duplo clique = nova / liga-desliga, botão direito = remove
    const cv = VEPEQ.cv;
    const acha = (ev, G) => {
        const f = vePeqEfeito(); if (!f) return -1;
        const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
        let melhor = -1, d0 = 14 * 14;
        (f.v.b || []).forEach((b0, i) => { const b = vePeqLimpa(b0), dx = G.x(b.f) - mx, dy = G.y(vePeqPontoDb(b)) - my, d = dx * dx + dy * dy; if (d < d0) { d0 = d; melhor = i; } });
        return melhor;
    };
    cv.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        const G = vePeqGeo(), i = acha(ev, G); if (i < 0) return;
        ev.preventDefault(); cv.setPointerCapture(ev.pointerId);
        VEPEQ.sel = i; vePushHistory();
        const r = cv.getBoundingClientRect(), b0 = vePeqLimpa(vePeqEfeito().v.b[i]);
        VEPEQ.arrasto = { i, x0: ev.clientX, y0: ev.clientY, f0: b0.f, g0: b0.g, r };
        vePeqLista(); vePeqDesenhar();
    });
    cv.addEventListener('pointermove', ev => {
        const G = vePeqGeo(), A = VEPEQ.arrasto;
        if (!A) {
            const i = acha(ev, G), f = vePeqEfeito(), r = cv.getBoundingClientRect();
            cv.style.cursor = i >= 0 ? 'grab' : 'crosshair';
            q('dica').textContent = i >= 0 && f ? (() => { const b = vePeqLimpa(f.v.b[i]); return `${i + 1} · ${veT(VE_PEQ_TIPOS[b.t].nome)} · ${b.f >= 1000 ? (b.f / 1000).toFixed(2) + ' kHz' : Math.round(b.f) + ' Hz'}${VE_PEQ_TIPOS[b.t].corte ? '' : ` · ${b.g > 0 ? '+' : ''}${b.g.toFixed(1)} dB`} · Q ${b.q.toFixed(2)}`; })()
                : `${Math.round(G.f(ev.clientX - r.left))} Hz · ${veT('duplo clique: banda nova')}`;
            return;
        }
        const fino = ev.shiftKey ? 0.2 : 1, mx = G.x(A.f0) + (ev.clientX - A.x0) * fino, my = G.y(A.g0) + (ev.clientY - A.y0) * fino;
        vePeqMudar(v => {
            const b = v.b[A.i], corte = VE_PEQ_TIPOS[vePeqLimpa(b).t].corte;
            v.b[A.i] = vePeqLimpa({ ...b, f: G.f(mx), g: corte ? b.g : Math.round(G.db(my) * 10) / 10 });
            return v;
        });
    });
    const solta = () => { VEPEQ.arrasto = null; };
    cv.addEventListener('pointerup', solta); cv.addEventListener('pointercancel', solta);
    cv.addEventListener('wheel', ev => {
        const G = vePeqGeo(), i = acha(ev, G) >= 0 ? acha(ev, G) : VEPEQ.sel, f = vePeqEfeito(); if (!f || !f.v.b[i]) return;
        ev.preventDefault();
        const b = vePeqLimpa(f.v.b[i]), sobe = ev.deltaY < 0;
        VEPEQ.sel = i;
        vePeqMudar(v => {
            if (VE_PEQ_TIPOS[b.t].corte && b.t !== 'notch') { const ss = [12, 24, 48], k = ss.indexOf(b.s); v.b[i] = { ...b, s: ss[Math.max(0, Math.min(2, k + (sobe ? 1 : -1)))] }; }
            else v.b[i] = vePeqLimpa({ ...b, q: b.q * (sobe ? 1.12 : 1 / 1.12) });
            return v;
        });
    }, { passive: false });
    cv.addEventListener('dblclick', ev => {
        const G = vePeqGeo(), i = acha(ev, G), r = cv.getBoundingClientRect();
        if (i >= 0) { vePeqMudar(v => { v.b[i].on = v.b[i].on === false; return v; }, true); return; }
        vePeqNova(G.f(ev.clientX - r.left), Math.round(G.db(ev.clientY - r.top) * 10) / 10);
    });
    cv.addEventListener('contextmenu', ev => {
        const i = acha(ev, vePeqGeo()); if (i < 0) return;
        ev.preventDefault(); vePeqMudar(v => { v.b.splice(i, 1); return v; }, true);
    });
    el.addEventListener('keydown', ev => {
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && !/INPUT|SELECT/.test(ev.target.tagName)) {
            ev.preventDefault(); ev.stopPropagation();
            const i = VEPEQ.sel; vePeqMudar(v => { v.b.splice(i, 1); return v; }, true);
        }
    });
    el.tabIndex = -1;
    if (window.ResizeObserver) new (el.ownerDocument.defaultView.ResizeObserver || ResizeObserver)(() => vePeqDesenhar()).observe(cv.parentElement);
}
function vePeqNova(f, g) {
    const v0 = vePeqEfeito(); if (!v0) return;
    if ((v0.v.b || []).length >= VE_PEQ_MAX) { veToast(veT('No máximo 8 bandas')); return; }
    vePeqMudar(v => { v.b = [...(v.b || []), vePeqLimpa({ t: 'pk', f, g, q: 1, on: true })]; VEPEQ.sel = v.b.length - 1; return v; }, true);
}

// a timeline mudou (desfazer, outro clipe): a curva acompanha
document.addEventListener('ve-historia', () => { if (VEPEQ.alvo) { vePeqLista(); vePeqDesenhar(); } });

// API (testes e a Kani): VEPEQ_API.abrirClipe(i, id), .abrirTrilha(k, id), .secoes(v), .db(v, f)
window.VEPEQ_API = {
    abrirClipe: (i, id) => vePeqAbrir({ tipo: 'clipe', c: VE.clips[i], id }),
    abrirTrilha: (k, id) => vePeqAbrir({ tipo: 'trilha', k, id }),
    secoes: v => vePeqSecoes(v), db: (v, f) => vePeqDb(vePeqSecoes(v), f) + (+v.out || 0),
    presets: () => Object.keys(VE_PEQ_PRESETS), preset: n => JSON.parse(JSON.stringify(VE_PEQ_PRESETS[n])),
};
