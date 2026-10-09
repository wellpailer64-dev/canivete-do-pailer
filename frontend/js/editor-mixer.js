// =========================================================
// Pocket Editor — Mixer de trilhas de áudio (Audio Track Mixer do Premiere)
// Uma coluna por trilha de áudio: pan (balanço −100..100), M (mudo), S (solo), fader de volume (−∞..+15 dB, na escala
// do Premiere) com medidor L/R; e a coluna Mix (Master). Os valores ficam no estado da trilha (VE_TRK.a[k]: vol, pan,
// mute, solo) e em VE.master.vol — salvos no projeto, fora do desfazer (como no Premiere). O som sai de
// editor.js: veTrkAfx (a mesma conta na prévia e na exportação); Premiere ida e volta: Functions/premiere.py e
// premiere_xml.py. Duplo clique no fader ou no botão de pan volta ao 0; Shift arrasta fino; clique no número digita.
// =========================================================
const VEMIX = { fila: [], niv: {}, raf: 0, t: 0, arrasto: null, pend: 0 };

// posição do fader (0 = embaixo, 1 = topo) × dB: as marcas do fader do Premiere, medidas no print do Pailer
const VE_MIX_ESC = [[-96, 0], [-60, 0.03], [-34, 0.077], [-28, 0.116], [-22, 0.176], [-19, 0.213], [-16, 0.257],
    [-13, 0.314], [-10, 0.385], [-7, 0.49], [-4, 0.574], [-2, 0.655], [0, 0.752], [2, 0.791], [4, 0.829], [6, 0.864],
    [10, 0.923], [15, 1]];
const VE_MIX_MARCAS = [15, 10, 6, 4, 2, 0, -2, -4, -7, -10, -13, -16, -19, -22, -28, -34];
const VE_MIX_MED = [0, -6, -12, -18, -24, -30, -36, -42, -48, -54];

function veMixU(db) {
    if (db == null) db = 0;
    if (db <= VE_MIX_MIN) return 0;
    for (let i = 1; i < VE_MIX_ESC.length; i++) {
        const [d1, u1] = VE_MIX_ESC[i], [d0, u0] = VE_MIX_ESC[i - 1];
        if (db <= d1) return u0 + (u1 - u0) * (db - d0) / (d1 - d0);
    }
    return 1;
}
function veMixDbDe(u) {
    if (u <= 0.002) return VE_MIX_MIN;
    for (let i = 1; i < VE_MIX_ESC.length; i++) {
        const [d1, u1] = VE_MIX_ESC[i], [d0, u0] = VE_MIX_ESC[i - 1];
        if (u <= u1) return Math.round((d0 + (d1 - d0) * (u - u0) / (u1 - u0)) * 10) / 10;
    }
    return 15;
}
const veMixFmt = db => db == null ? '0,0' : db <= VE_MIX_MIN ? '-∞' : (Math.round(db * 10) / 10).toFixed(1).replace('.', ',');
const veMixFmtPan = p => (Math.round((p || 0) * 10) / 10).toFixed(1).replace('.', ',');

// ── estado ──
function veMixAlvo(k) { return k < 0 ? (VE.master = VE.master || {}) : veTrackState('a', k); }
function veMixPor(k, campo, v) {
    const s = veMixAlvo(k);
    if (campo === 'vol') v = Math.max(VE_MIX_MIN, Math.min(15, v));
    if (campo === 'pan') v = Math.max(-100, Math.min(100, Math.round(v * 10) / 10));
    if (s[campo] === v) return false;
    if ((campo === 'vol' || campo === 'pan') && !v) delete s[campo]; else s[campo] = v;
    return true;
}
// arrastando: o som é refeito no máximo uma vez por quadro de tela
function veMixAgendarSom() {
    if (VEMIX.pend) return;
    VEMIX.pend = requestAnimationFrame(() => { VEMIX.pend = 0; veMixMudou(); });
}

// ── montar ──
function veMixColuna(k) {
    const st = k < 0 ? (VE.master || {}) : veTrackState('a', k), mestre = k < 0;
    const pan = mestre ? '' : `<div class="ve-mix-pan" data-mk="${k}" title="${veT('Pan (balanço): arraste · duplo clique = centro')}">
            <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15"/><line class="ve-mix-agulha" x1="20" y1="20" x2="20" y2="6"/></svg>
            <span class="ve-mix-lr"><i>L</i><i>R</i></span></div>
        <b class="ve-mix-pv" data-mk="${k}" data-campo="pan" title="${veT('Clique para digitar')}"></b>`;
    const ms = mestre ? '<div class="ve-mix-ms"></div>' : `<div class="ve-mix-ms">
            <button data-mk="${k}" data-mbt="mute" title="${veT('Mudo')}">M</button>
            <button data-mk="${k}" data-mbt="solo" title="${veT('Solo')}">S</button></div>`;
    const marcas = VE_MIX_MARCAS.map(d => `<i style="bottom:${veMixU(d) * 100}%">${d}</i>`).join('') + '<i style="bottom:0">-∞</i>';
    const med = VE_MIX_MED.map(d => `<i style="bottom:${(1 - d / VE_MED_MIN) * 100}%">${d}</i>`).join('');
    // rack de efeitos (5 espaços, como no Premiere): a trilha soma os clipes e passa por eles antes do fader
    const rack = `<div class="ve-mix-rack">${mestre ? '<small>' + veT('Master: só o Hard Limiter (LIM, nos Medidores)') + '</small>'
        : Array.from({ length: VE_MIX_SLOTS }, (_, i) => `<button class="ve-mix-slot" data-mk="${k}" data-slot="${i}"></button>`).join('')}</div>`;
    return `<div class="ve-mix-col${mestre ? ' mestre' : ''}" data-mcol="${k}">${rack}
        <div class="ve-mix-topo">${pan}</div>${ms}
        <div class="ve-mix-corpo">
            <div class="ve-mix-esc">${marcas}</div>
            <div class="ve-mix-fader" data-mk="${k}" title="${veT('Volume da trilha: arraste · duplo clique = 0 dB · Shift = fino')}"><span class="ve-mix-trilho"></span><span class="ve-mix-botao"></span></div>
            <div class="ve-mix-med"><span><b></b><s></s></span><span><b></b><s></s></span></div>
            <div class="ve-mix-esc ve-mix-esc-med">${med}</div>
        </div>
        <b class="ve-mix-vv" data-mk="${k}" data-campo="vol" title="${veT('Clique para digitar')}"></b>
        <div class="ve-mix-nome">${mestre ? 'Mix' : `<span>A${k + 1}</span>${veT('Áudio')} ${k + 1}`}</div>
    </div>`;
}

function veMixUi() {
    const el = $ve('ve-mixer');
    if (!el || !VE_TRK) return;
    const n = VE_TRK.a.length;
    if (el._n !== n || !el.firstChild) {
        el.innerHTML = `<button class="ve-mix-rackbt" title="${veT('Mostrar/ocultar os efeitos das trilhas')}">fx</button>`
            + `<div class="ve-mix-cols">${Array.from({ length: n }, (_, k) => veMixColuna(k)).join('')}</div>${veMixColuna(-1)}`;
        el._n = n;
        if (!el._ligado) veMixLigar(el);
    }
    el.classList.toggle('rack', veMixRackAberto());
    el.querySelectorAll('.ve-mix-slot').forEach(b => {
        const f = ((VE_TRK.a[+b.dataset.mk] || {}).fx || [])[+b.dataset.slot], d = f && VE_AFX[f.t];
        b.textContent = d ? d.nome : '';
        b.title = d ? `${d.nome}${f.on === false ? ' · ' + veT('desligado') : ''} · ${veT('clique para ajustar')}` : veT('Escolher efeito');
        b.classList.toggle('cheio', !!d);
        b.classList.toggle('off', !!d && f.on === false);
        b.classList.toggle('semsom', !!d && !!d.pr && !d.som);
    });
    el.querySelectorAll('[data-mcol]').forEach(col => {
        const k = +col.dataset.mcol, st = k < 0 ? (VE.master || {}) : (VE_TRK.a[k] || {});
        col.querySelector('.ve-mix-botao').style.bottom = `calc(${veMixU(st.vol) * 100}% - 9px)`;
        col.querySelector('.ve-mix-vv').textContent = veMixFmt(st.vol);
        if (k >= 0) {
            const p = st.pan || 0;
            col.querySelector('.ve-mix-agulha').setAttribute('transform', `rotate(${p * 1.35} 20 20)`);
            col.querySelector('.ve-mix-pv').textContent = veMixFmtPan(p);
            col.querySelector('[data-mbt="mute"]').classList.toggle('on', !!st.mute);
            // M vazado = calada pelo solo de outra trilha (como no Premiere)
            col.querySelector('[data-mbt="mute"]').classList.toggle('solo-off', !st.mute && veTrkMuted(k));
            col.querySelector('[data-mbt="solo"]').classList.toggle('on', !!st.solo);
            col.classList.toggle('off', veTrkMuted(k));
        }
    });
}

function veMixLigar(el) {
    el._ligado = true;
    el.addEventListener('pointerdown', e => {
        const f = e.target.closest('.ve-mix-fader'), p = e.target.closest('.ve-mix-pan');
        if (!f && !p) return;
        e.preventDefault();
        const k = +(f || p).dataset.mk, st = veMixAlvo(k);
        const alvo = f || p;
        if (f && !e.target.closest('.ve-mix-botao')) {   // clique no trilho: o botão vai até ali
            const r = f.getBoundingClientRect();
            if (veMixPor(k, 'vol', veMixDbDe(1 - (e.clientY - r.top) / r.height))) { veMixUi(); veMixAgendarSom(); }
        }
        VEMIX.arrasto = { k, tipo: f ? 'vol' : 'pan', y: e.clientY, x: e.clientX, u: veMixU(veMixAlvo(k).vol), p: st.pan || 0,
                          h: (f || p).getBoundingClientRect().height };
        alvo.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
        const a = VEMIX.arrasto;
        if (!a) return;
        const fino = e.shiftKey ? 0.2 : 1;
        const mudou = a.tipo === 'vol'
            ? veMixPor(a.k, 'vol', veMixDbDe(Math.max(0, Math.min(1, a.u - (e.clientY - a.y) / a.h * fino))))
            : veMixPor(a.k, 'pan', a.p + ((e.clientX - a.x) - (e.clientY - a.y)) * fino);
        if (mudou) { veMixUi(); veMixAgendarSom(); }
    });
    const solta = () => { if (VEMIX.arrasto) { VEMIX.arrasto = null; veMixMudou(); } };
    el.addEventListener('pointerup', solta);
    el.addEventListener('pointercancel', solta);
    el.addEventListener('dblclick', e => {
        const f = e.target.closest('.ve-mix-fader'), p = e.target.closest('.ve-mix-pan');
        if (!f && !p) return;
        if (veMixPor(+(f || p).dataset.mk, f ? 'vol' : 'pan', 0)) veMixMudou();
    });
    el.addEventListener('click', e => {
        if (e.target.closest('.ve-mix-rackbt')) { veMixRackAberto(!veMixRackAberto()); veMixUi(); return; }
        const sl = e.target.closest('.ve-mix-slot');
        if (sl) { veMixSlot(sl, +sl.dataset.mk, +sl.dataset.slot); return; }
        const b = e.target.closest('[data-mbt]');
        if (b) { veTrackToggle('a', +b.dataset.mk, b.dataset.mbt); return; }
        const v = e.target.closest('[data-campo]');
        if (v && !v.querySelector('input')) veMixDigitar(v);
    });
}

// clique no número: vira um campo (Enter aplica, Esc desiste)
function veMixDigitar(v) {
    const k = +v.dataset.mk, campo = v.dataset.campo, doc = v.ownerDocument;
    const inp = doc.createElement('input');
    inp.value = v.textContent;
    v.textContent = '';
    v.appendChild(inp);
    inp.focus(); inp.select();
    let feito = false;
    const fim = ok => {
        if (feito) return;
        feito = true;
        const txt = inp.value.trim().replace(',', '.');
        const num = /^-?(∞|inf)/i.test(txt) ? VE_MIX_MIN : parseFloat(txt);
        if (ok && isFinite(num) && veMixPor(k, campo, num)) veMixMudou(); else veMixUi();
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
    inp.addEventListener('blur', () => fim(true));
}

// ── medidores por trilha: o pico de cada pedaço mixado (editor-audio.js) aparece quando ele é ouvido ──
function veMixPicos(ate, pk) {
    const el = $ve('ve-mixer');
    if (!el || !el.offsetParent) return;
    VEMIX.fila.push([ate, pk]);
    if (VEMIX.fila.length > 400) VEMIX.fila.splice(0, 200);
    veMixAgendarMed();
}
function veMixAgendarMed() {
    const el = $ve('ve-mixer');
    if (!el || VEMIX.raf) return;
    VEMIX.raf = veRaf(el, veMixQuadro);
}
function veMixQuadro() {
    VEMIX.raf = 0;
    const el = $ve('ve-mixer');
    if (!el || !el.offsetParent) { VEMIX.fila.length = 0; VEMIX.niv = {}; return; }
    const agora = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, agora - (VEMIX.t || agora)));
    VEMIX.t = agora;
    const lidos = typeof VEAU !== 'undefined' && VEAU.tocando ? VEAU.lidos : Infinity, novo = {};
    let n = 0;
    while (n < VEMIX.fila.length && VEMIX.fila[n][0] <= lidos + VE_AU_CHUNK) {
        const pk = VEMIX.fila[n++][1];
        for (const tr in pk) {
            const a = novo[tr] || (novo[tr] = [0, 0]);
            a[0] = Math.max(a[0], pk[tr][0]); a[1] = Math.max(a[1], pk[tr][1]);
        }
    }
    if (n) VEMIX.fila.splice(0, n);
    let ativo = VEMIX.fila.length > 0;
    el.querySelectorAll('[data-mcol]').forEach(col => {
        const k = col.dataset.mcol;
        let nv;
        if (+k < 0) nv = typeof VEMED !== 'undefined' ? VEMED.nivel : [VE_MED_MIN, VE_MED_MIN];
        else {
            const v = VEMIX.niv[k] || [VE_MED_MIN, VE_MED_MIN], x = novo[k] || [0, 0];
            nv = VEMIX.niv[k] = [0, 1].map(c => Math.max(veMedDb(x[c]), v[c] - VE_MED_QUEDA * dt));
        }
        if (nv.some(d => d > VE_MED_MIN)) ativo = true;
        col.querySelectorAll('.ve-mix-med s').forEach((s, c) => {
            s.style.height = `${(1 - Math.max(0, (nv[c] - VE_MED_MIN) / -VE_MED_MIN)) * 100}%`;
        });
    });
    if (ativo || (typeof VE !== 'undefined' && VE.playing)) veMixAgendarMed();
    else VEMIX.t = 0;
}

function veMixMontar() {
    if ($ve('ve-mixer')) veMixUi();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', veMixMontar); else veMixMontar();

// API para o agente/testes: VEMIX_API.por(0, 'vol', -6); VEMIX_API.estado()
window.VEMIX_API = {
    por(k, campo, v) { const m = (campo === 'mute' || campo === 'solo') ? veMixPor(k, campo, !!v) : veMixPor(k, campo, +v); if (m) veMixMudou(); return m; },
    estado: () => ({ trilhas: VE_TRK.a.map((t, k) => ({ k, vol: t.vol || 0, pan: t.pan || 0, mute: !!t.mute, solo: !!t.solo, calada: veTrkMuted(k) })),
                     master: (VE.master && VE.master.vol) || 0 }),
    u: veMixU, db: veMixDbDe,
};

// ── rack de efeitos da trilha ──
const VE_MIX_SLOTS = 5;
function veMixRackAberto(v) {
    try {
        if (v !== undefined) localStorage.setItem('ve-mix-rack', v ? '1' : '0');
        return localStorage.getItem('ve-mix-rack') === '1';
    } catch (e) { return !!v; }
}
function veMixPop(ancora, html) {
    const doc = ancora.ownerDocument;
    doc.querySelectorAll('.ve-mix-pop').forEach(p => p.remove());
    const pop = doc.createElement('div');
    pop.className = 've-mix-pop';
    pop.innerHTML = html;
    doc.body.appendChild(pop);
    const r = ancora.getBoundingClientRect(), W = doc.documentElement.clientWidth, H = doc.documentElement.clientHeight;
    pop.style.left = Math.max(4, Math.min(r.left, W - pop.offsetWidth - 4)) + 'px';
    pop.style.top = Math.max(4, Math.min(r.bottom + 2, H - pop.offsetHeight - 4)) + 'px';
    const fora = e => { if (!pop.contains(e.target)) { pop.remove(); doc.removeEventListener('pointerdown', fora, true); } };
    setTimeout(() => doc.addEventListener('pointerdown', fora, true), 0);
    return pop;
}
// espaço vazio: menu de efeitos por categoria (os do Premiere e os do Kanivete); cheio: os controles do efeito
function veMixSlot(sl, k, i) {
    const fx = (VE_TRK.a[k] || {}).fx || [];
    if (fx[i]) { veMixEditor(sl, k, i); return; }
    const cats = {};
    Object.entries(VE_AFX).forEach(([t, d]) => { if (t !== 'antinoise') (cats[d.cat] = cats[d.cat] || []).push([t, d]); });
    const html = `<input class="ve-mix-busca" placeholder="${veT('Buscar efeito')}">`
        + `<div class="ve-mix-lista">${Object.entries(cats).sort().map(([c, l]) => `<div class="ve-mix-cat">${c.replace('Áudio · ', '')}</div>`
            + l.map(([t, d]) => `<div class="ve-mix-ef${d.pr && !d.som ? ' semsom' : ''}" data-t="${t}" title="${d.tag || ''}">${d.nome}</div>`).join('')).join('')}</div>`;
    const pop = veMixPop(sl, html), busca = pop.querySelector('.ve-mix-busca');
    busca.focus();
    busca.addEventListener('input', () => {
        const q = busca.value.trim().toLowerCase();
        pop.querySelectorAll('.ve-mix-ef').forEach(x => { x.hidden = !!q && !x.textContent.toLowerCase().includes(q); });
    });
    busca.addEventListener('keydown', e => e.stopPropagation());
    pop.addEventListener('click', e => {
        const it = e.target.closest('.ve-mix-ef');
        if (!it) return;
        const t = it.dataset.t, v = {};
        VE_AFX[t].params.forEach(p => { v[p.k] = p.def; });
        const st = veTrackState('a', k);
        st.fx = [...(st.fx || []), { id: veFxNewId(), t, on: true, v }].slice(0, VE_MIX_SLOTS);
        pop.remove();
        veMixMudou();
        veToast(`${VE_AFX[t].nome} ${veT('na trilha')} A${k + 1}`);
    });
}
function veMixEditor(sl, k, i) {
    const st = veTrackState('a', k), f = st.fx[i], d = VE_AFX[f.t];
    const ps = d.params.filter(p => !p.oculto && p.tipo !== 'cor');
    const linha = p => p.tipo === 'bool'
        ? `<label class="ve-mix-ed-bool"><input type="checkbox" data-k="${p.k}"> ${p.nome}</label>`
        : `<div class="ve-mix-ed-p"><span>${p.nome}</span><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" data-k="${p.k}">`
          + `<input type="text" data-k="${p.k}" data-num="1"><i>${p.un || ''}</i></div>`;
    const html = `<div class="ve-mix-ed-topo"><b>${d.nome}</b> <small>A${k + 1}</small>`
        + `<label><input type="checkbox" data-on="1" ${f.on === false ? '' : 'checked'}> ${veT('ligado')}</label>`
        + `<button data-acao="esq" title="${veT('Antes')}">◀</button><button data-acao="dir" title="${veT('Depois')}">▶</button>`
        + `<button data-acao="del" title="${veT('Remover')}">✕</button></div>`
        + (d.pr && !d.som ? `<div class="ve-mix-aviso">${veT('Sem prévia no Kanivete: os valores vão e voltam intactos para o Premiere.')}</div>` : '')
        + `<div class="ve-mix-ed-params">${ps.map(linha).join('')}</div>`;
    const pop = veMixPop(sl, html);
    const pintar = () => {
        const v = veAfxValues(st.fx[i]);
        ps.forEach(p => pop.querySelectorAll(`[data-k="${p.k}"]`).forEach(inp => {
            if (inp.type === 'checkbox') { inp.checked = !!v[p.k]; return; }
            if (inp.ownerDocument.activeElement === inp) return;
            inp.value = inp.dataset.num ? (p.vis ? p.vis(v[p.k]) : veFxFmt(p, v[p.k])) : v[p.k];
        }));
    };
    pintar();
    const por = (kk, val) => {
        const p = d.params.find(x => x.k === kk);
        if (p.tipo === 'bool') val = val ? 1 : 0; else val = Math.min(p.max, Math.max(p.min, val));
        st.fx = st.fx.map((x, j) => j === i ? { ...x, v: { ...x.v, [kk]: val } } : x);
        pintar();
        veMixAgendarSom();
    };
    pop.addEventListener('input', e => {
        const inp = e.target;
        if (inp.dataset.on) { st.fx = st.fx.map((x, j) => j === i ? { ...x, on: inp.checked } : x); veMixMudou(); return; }
        if (!inp.dataset.k || inp.dataset.num) return;
        por(inp.dataset.k, inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value));
    });
    pop.addEventListener('change', e => {
        const inp = e.target;
        if (!inp.dataset.num) return;
        const p = d.params.find(x => x.k === inp.dataset.k), txt = String(inp.value).trim().replace(',', '.');
        let val = /^-?(∞|inf)/i.test(txt) ? (p.inv ? 0 : p.min) : parseFloat(txt);
        if (!isFinite(val)) { pintar(); return; }
        if (p.inv) val = p.inv(val);
        por(p.k, val);
    });
    pop.addEventListener('keydown', e => e.stopPropagation());
    pop.addEventListener('click', e => {
        const a = e.target.closest('[data-acao]');
        if (!a) return;
        const fx = [...st.fx];
        if (a.dataset.acao === 'del') fx.splice(i, 1);
        else {
            const j = a.dataset.acao === 'esq' ? i - 1 : i + 1;
            if (j < 0 || j >= fx.length) return;
            [fx[i], fx[j]] = [fx[j], fx[i]];
        }
        if (fx.length) st.fx = fx; else delete st.fx;
        pop.remove();
        veMixMudou();
    });
}
