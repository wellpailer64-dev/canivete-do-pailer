// =========================================================
// Pocket Editor — atributos de vários clipes de uma vez (como no Premiere)
// 1) Remover atributos…: botão direito num clipe (com vários selecionados, vale para todos) → lista tudo que está
//    aplicado neles (efeitos de vídeo, efeitos de áudio, movimento, opacidade, mesclagem, volume, transições), cada
//    um com caixinha e em quantos clipes está; Remover tira os marcados de todos (Ctrl+Z volta).
// 2) Ajuste em grupo: com vários clipes selecionados, mexer num parâmetro de um efeito nos Controles de efeito leva o
//    mesmo valor para o mesmo efeito em todos os selecionados (o 1º daquele tipo de cada clipe ↔ o 1º, o 2º ↔ o 2º...).
// =========================================================
const VE_ATR_MOV = ['x', 'y', 'sc', 'sx', 'sy', 'rot'];
const VE_ATR_GRUPOS = ['Efeitos de vídeo', 'Efeitos de áudio', 'Movimento e opacidade', 'Áudio', 'Transições'];

function veAtrDoClipe(c) {   // [[chave, nome, grupo]] do que está aplicado no clipe
    const out = [], visto = new Set(), add = (k, n, g) => { if (!visto.has(k)) { visto.add(k); out.push([k, n, g]); } };
    for (const f of c.fx || []) add('fx:' + f.t, (VE_FX[f.t] && VE_FX[f.t].nome) || f.t, 'Efeitos de vídeo');
    for (const f of c.afx || []) add('afx:' + f.t, (typeof VE_AFX !== 'undefined' && VE_AFX[f.t] && VE_AFX[f.t].nome) || f.t, 'Efeitos de áudio');
    if (!veIsAudio(c)) {
        const d = veDefProps(c), p = c.p || {}, dif = k => p[k] != null && Math.abs(+p[k] - +d[k]) > 1e-6;
        if (['x', 'y', 'sc', 'rot'].some(dif) || p.sx != null || p.sy != null || p.ax != null || p.ay != null || VE_ATR_MOV.some(k => veKfOn(c, k)))
            add('mov', 'Movimento (posição, escala, rotação)', 'Movimento e opacidade');
        if (dif('op') || veKfOn(c, 'op')) add('opa', 'Opacidade', 'Movimento e opacidade');
        if (c.bm && (typeof veBmAtivo !== 'function' || veBmAtivo(c))) add('bm', 'Modo de mesclagem', 'Movimento e opacidade');
    }
    if (c.g) add('vol', 'Volume (ganho de áudio)', 'Áudio');
    if (c.tin || c.tout) add('trv', 'Transições de vídeo', 'Transições');
    if (c.atin || c.atout) add('tra', 'Transições de áudio', 'Transições');
    return out;
}
function veAtrLista(clips) {
    const m = new Map();
    for (const c of clips) for (const [k, n, g] of veAtrDoClipe(c)) { const e = m.get(k) || { k, nome: n, grupo: g, n: 0 }; e.n++; m.set(k, e); }
    return [...m.values()].sort((a, b) => VE_ATR_GRUPOS.indexOf(a.grupo) - VE_ATR_GRUPOS.indexOf(b.grupo) || a.nome.localeCompare(b.nome));
}
function veAtrRemover(clips, chaves) {
    clips = clips.filter(c => !veLocked(c));
    if (!clips.length || !chaves.length) return 0;
    vePushHistory();
    let n = 0;
    for (const c of clips) {
        const antes = JSON.stringify(c);
        for (const k of chaves) {
            if (k.startsWith('fx:')) { c.fx = (c.fx || []).filter(f => 'fx:' + f.t !== k); if (!c.fx.length) delete c.fx; }
            else if (k.startsWith('afx:')) { c.afx = (c.afx || []).filter(f => 'afx:' + f.t !== k); if (!c.afx.length) delete c.afx; }
            else if (k === 'mov' && c.p) {
                const d = veDefProps(c);
                Object.assign(c.p, { x: d.x, y: d.y, sc: d.sc, rot: d.rot });
                ['sx', 'sy', 'ax', 'ay'].forEach(q => delete c.p[q]);
                if (c.k) VE_ATR_MOV.forEach(q => delete c.k[q]);
            } else if (k === 'mov' && c.k) VE_ATR_MOV.forEach(q => delete c.k[q]);
            else if (k === 'opa') { if (c.p) c.p.op = 100; if (c.k) delete c.k.op; }
            else if (k === 'bm') delete c.bm;
            else if (k === 'vol') delete c.g;
            else if (k === 'trv') { delete c.tin; delete c.tout; }
            else if (k === 'tra') { delete c.atin; delete c.atout; }
        }
        if (c.k && !Object.keys(c.k).length) delete c.k;
        if (JSON.stringify(c) !== antes) n++;
    }
    if (!n) { VE.history.pop(); veUpdateUndo(); return 0; }
    veRefresh();
    if (typeof veRenderFxControls === 'function') { VEFX.key = ''; veRenderFxControls(); }
    if (veMixAtivo()) veAudioEditou();
    veDrawMonitorSoon();
    return n;
}
function veAtrDialogo(clips = veSelLista()) {
    clips = clips.filter(Boolean);
    const lista = veAtrLista(clips);
    if (!lista.length) { veToast(clips.length > 1 ? 'Os clipes selecionados não têm atributos para remover' : 'Este clipe não tem atributos para remover'); return; }
    $ve('ve-atr')?.remove();
    const m = document.createElement('div');
    m.className = 've-modal'; m.id = 've-atr';
    let html = '', g0 = '';
    for (const a of lista) {
        if (a.grupo !== g0) { html += `<div class="ve-atr-grupo"><label><input type="checkbox" data-grupo="${veEsc(a.grupo)}" checked> ${veEsc(a.grupo)}</label></div>`; g0 = a.grupo; }
        html += `<label class="ve-atr-item"><input type="checkbox" data-k="${veEsc(a.k)}" data-g="${veEsc(a.grupo)}" checked> <span>${veEsc(a.nome)}</span>${clips.length > 1 ? `<small>${a.n} de ${clips.length} clipe(s)</small>` : ''}</label>`;
    }
    m.innerHTML = `<div class="ve-modal-box ve-atr-box">
        <div class="ve-modal-head"><span>Remover atributos</span><button class="ve-icon-btn" data-x title="Cancelar"><svg class="i"><use href="#i-x"/></svg></button></div>
        <div class="ve-modal-body"><div class="ve-atr-info">${clips.length} clipe(s) selecionado(s). Marque o que vai sair de todos eles.</div>
            <div class="ve-atr-lista">${html}</div></div>
        <div class="ve-modal-foot"><button class="ve-btn ve-btn-ghost" data-x>Cancelar</button><button class="ve-btn ve-btn-primary" data-ok>Remover</button></div></div>`;
    $ve('ve').appendChild(m);
    const caixas = () => [...m.querySelectorAll('[data-k]')];
    const atualizar = () => { m.querySelectorAll('[data-grupo]').forEach(g => { const it = caixas().filter(x => x.dataset.g === g.dataset.grupo), n = it.filter(x => x.checked).length; g.checked = n === it.length; g.indeterminate = n > 0 && n < it.length; });
        m.querySelector('[data-ok]').disabled = !caixas().some(x => x.checked); };
    m.addEventListener('change', e => { const g = e.target.dataset.grupo; if (g) caixas().filter(x => x.dataset.g === g).forEach(x => { x.checked = e.target.checked; }); atualizar(); });
    m.addEventListener('click', e => {
        if (e.target === m || e.target.closest('[data-x]')) { m.remove(); return; }
        if (e.target.closest('[data-ok]')) {
            const n = veAtrRemover(clips, caixas().filter(x => x.checked).map(x => x.dataset.k));
            m.remove();
            veToast(n ? `Atributos removidos de ${n} clipe(s)` : 'Nada mudou');
        }
    });
    const esc = e => { if (e.key === 'Escape' && m.isConnected) { m.remove(); document.removeEventListener('keydown', esc, true); } };
    document.addEventListener('keydown', esc, true);
    atualizar();
    return m;
}

// ── ajuste em grupo: o mesmo parâmetro no mesmo efeito de todos os selecionados ──
function veAtrGrupo(lista, id, k, val, campo) {   // campo: 'fx' | 'afx'
    const prim = VE.clips[VE.sel], f0 = prim && (prim[campo] || []).find(x => x.id === id);
    if (!f0) return 0;
    const ordem = (prim[campo] || []).filter(x => x.t === f0.t).indexOf(f0);   // 1º blur ↔ 1º blur
    let n = 0;
    for (const c of lista) {
        if (c === prim || veLocked(c)) continue;
        const iguais = (c[campo] || []).filter(x => x.t === f0.t), alvo = iguais[ordem] || iguais[0];
        if (!alvo) continue;
        c[campo] = c[campo].map(x => x === alvo ? { ...x, v: { ...x.v, [k]: val } } : x);
        n++;
    }
    return n;
}
(function () {
    const sel = () => veSelLista().filter(c => c !== VE.clips[VE.sel]);
    const pfx = veFxSetParam;
    veFxSetParam = function (id, k, val) {
        pfx(id, k, val);
        const f = (VE.clips[VE.sel]?.fx || []).find(x => x.id === id);   // o valor já validado (limites) do clipe principal
        if (f && sel().length) { veAtrGrupo(veSelLista(), id, k, f.v[k], 'fx'); veDrawMonitorSoon(); }
    };
    const pafx = veAfxSetParam;
    veAfxSetParam = function (id, k, val) {
        pafx(id, k, val);
        const f = (VE.clips[VE.sel]?.afx || []).find(x => x.id === id);
        if (f && sel().length) { veAtrGrupo(veSelLista(), id, k, f.v[k], 'afx'); if (veMixAtivo()) veAudioEditou(); }
    };
    // menu do botão direito: "Remover atributos…" (para o grupo selecionado, se o clipe faz parte dele)
    const menu = veClipMenu;
    veClipMenu = function (i, x, y, doc) {
        menu(i, x, y, doc);
        const m = VE._ctx && VE._ctx.m, c = VE.clips[i]; if (!m || !c) return;
        const alvos = veSelLista().includes(c) ? veSelLista() : [c];
        const b = doc.createElement('button');
        b.className = 've-ctx-item'; b.dataset.atr = '1';
        b.textContent = alvos.length > 1 ? `Remover atributos… (${alvos.length} clipes)` : 'Remover atributos…';
        b.onclick = e => { e.stopPropagation(); veClipMenuFechar(); veAtrDialogo(alvos); };
        const ref = m.querySelector('[data-ctx="off"]');
        m.insertBefore(b, ref || m.querySelector('[data-ctx="del"]'));
        veCtxPosicionar(m, x, y, doc);   // o menu cresceu: reposiciona para não cortar embaixo
    };
})();
window.VEATR_API = { lista: () => veAtrLista(veSelLista()), remover: chaves => veAtrRemover(veSelLista(), chaves), dialogo: () => veAtrDialogo() };
