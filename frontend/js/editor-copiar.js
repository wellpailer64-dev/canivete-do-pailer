// =========================================================
// Pocket Editor — copiar e colar estilo de legenda e efeitos de clipe (como o "Colar atributos" do Premiere)
// Legenda: Propriedades → Copiar estilo; depois Colar estilo nesta legenda ou em todas.
// Clipe: Controles de efeito → Copiar efeitos (Ctrl+Alt+C); Colar efeitos (Ctrl+Alt+V) vale para todos os
// selecionados e troca os efeitos de vídeo, os de áudio e o modo de mesclagem pelos copiados.
// =========================================================

const VECP = { fx: null, leg: null };
const veCpClone = o => JSON.parse(JSON.stringify(o));

// ── efeitos de clipe ──
function veCpEfeitosCopiar() {
    const c = VE.clips[VE.sel];
    if (!c) { veToast(veT('Selecione um clipe para copiar os efeitos')); return; }
    const fx = veCpClone(c.fx || []), afx = veCpClone(c.afx || []), bm = veBmAtivo(c) ? c.bm : null;
    const n = fx.length + afx.length + (bm ? 1 : 0);
    if (!n) { veToast(veT('Este clipe não tem efeitos para copiar')); return; }
    VECP.fx = { fx, afx, bm, n };
    veToast(`${veT('Efeitos copiados')} (${n}) · ${veT('selecione os clipes e clique em Colar efeitos (Ctrl+Alt+V)')}`);
    veCpBarra();
}

function veCpEfeitosColar() {
    const cp = VECP.fx;
    if (!cp) { veToast(veT('Copie os efeitos de um clipe primeiro')); return; }
    const lista = veSelLista().filter(x => !veLocked(x));
    if (!lista.length) { veToast(veT('Selecione os clipes que vão receber os efeitos')); return; }
    const novo = f => ({ ...veCpClone(f), id: veFxNewId() });
    let ok = 0;
    vePushHistory();
    lista.forEach(x => {
        const img = !veIsAudio(x), adj = veIsAdj(x), som = veOcupaA(x) && veTemSom(x);
        let mudou = false;
        if (img && cp.fx.length) {
            x.fx = cp.fx.filter(f => VE_FX[f.t] && !(VE_FX[f.t].soClipe && adj)).map(novo);
            mudou = true;
        }
        if (som && cp.afx.length) { x.afx = cp.afx.map(novo); mudou = true; }
        if (img && !adj && (cp.fx.length || cp.bm)) {
            if (cp.bm) x.bm = cp.bm; else delete x.bm;
            mudou = true;
        }
        if (mudou) ok++;
    });
    if (!ok) { VE.history.pop(); veUpdateUndo(); veToast(veT('Nenhum clipe selecionado aceita esses efeitos')); return; }
    veRefresh();
    if (veMixAtivo()) veAudioEditou();
    veToast(`${veT('Efeitos colados em')} ${ok} ${veT(ok > 1 ? 'clipes' : 'clipe')}`);
}

// ── efeitos escolhidos um a um (como no Premiere) ──
// Nos Controles de efeito, clicar no título de um efeito o seleciona e Ctrl+clique junta outros; Ctrl+C copia só
// esses e Ctrl+V cola nos clipes selecionados. 'mov' = Movimento (escala, posição, rotação, ancoragem e os quadros-chave
// deles), 'opa' = Opacidade (a opacidade, os quadros-chave dela e o modo de mesclagem), ou o id de um efeito.
// Colar ACRESCENTA os efeitos (os do clipe ficam) e TROCA o Movimento e a Opacidade pelos copiados.
// A seleção vale para o clipe em que foi feita: trocou de clipe, ela some (e o Ctrl+V cola o que foi copiado).
VECP.sel = new Set();
VECP.selClip = null;
VECP.ef = null;
VECP.ultimo = null;   // 'ef' | 'clip': o que o Ctrl+V cola (o copiado por último)
const VE_CP_MOV = ['sc', 'x', 'y', 'rot', 'ax', 'ay', 'sx', 'sy'];

function veCpSelValida() {
    const c = VE.clips[VE.sel];
    if (VECP.selClip !== c) { VECP.sel.clear(); VECP.selClip = c || null; }
    return !!c && VECP.sel.size > 0;
}

function veCpSelClicar(id, junto) {
    const c = VE.clips[VE.sel];
    if (!c) return;
    veCpSelValida();
    if (!junto) VECP.sel = new Set([id]);
    else if (VECP.sel.has(id)) VECP.sel.delete(id);
    else VECP.sel.add(id);
    VECP.selClip = c;
    veCpSelPintar();
}

// Destaca os escolhidos; Movimento/Opacidade só aparecem onde valem (áudio não tem; camada de ajuste só opacidade)
function veCpSelPintar() {
    const box = $ve('ve-props');
    if (!box) return;
    veCpSelValida();
    const c = VE.clips[VE.sel], aud = !!c && veIsAudio(c), adj = !!c && veIsAdj(c);
    box.querySelectorAll('[data-efsel]').forEach(el => {
        el.classList.toggle('efsel', VECP.sel.has(el.dataset.efsel));
        el.hidden = aud || (adj && el.dataset.efsel === 'mov');
    });
    box.querySelectorAll('.ve-fxe').forEach(el => el.classList.toggle('efsel', VECP.sel.has(el.dataset.fx || el.dataset.afx)));
}

// quadros-chave de uma propriedade levados para outro clipe: mesmo instante contado do início de cada clipe
function veCpKfPara(ks, de, x) {
    return ks.map(q => ({ ...veCpClone(q), t: +(x.s + (q.t - de.s) / de.vel * veVel(x)).toFixed(5) }));
}

// Ctrl+C / Ctrl+X com efeitos escolhidos. false = nada escolhido (o Ctrl+C copia o clipe)
function veCpSelCopiar(recortar) {
    if (!veCpSelValida()) return false;
    const c = VE.clips[VE.sel], s = VECP.sel, de = { s: c.s, vel: veVel(c) };
    const fx = (c.fx || []).filter(f => s.has(f.id)).map(veCpClone), afx = (c.afx || []).filter(f => s.has(f.id)).map(veCpClone);
    const ef = { fx, afx, n: fx.length + afx.length };
    const p = veStaticProps(c);
    if (s.has('mov') && !veIsAudio(c) && !veIsAdj(c)) {
        const k = {};
        VE_CP_MOV.forEach(q => { if (veKfOn(c, q)) k[q] = veCpClone(c.k[q]); });
        ef.mov = { p: Object.fromEntries(VE_CP_MOV.filter(q => p[q] != null).map(q => [q, p[q]])), k, de };
        ef.n++;
    }
    if (s.has('opa') && !veIsAudio(c)) {
        ef.opa = { op: p.op, k: veKfOn(c, 'op') ? veCpClone(c.k.op) : null, bm: veBmAtivo(c) ? c.bm : null, de };
        ef.n++;
    }
    if (!ef.n) return false;
    VECP.ef = ef;
    VECP.ultimo = 'ef';
    const nomes = [ef.mov && veT('Movimento'), ef.opa && veT('Opacidade'), ...fx.map(f => VE_FX[f.t] && VE_FX[f.t].nome),
                   ...afx.map(f => VE_AFX[f.t] && VE_AFX[f.t].nome)].filter(Boolean).join(', ');
    if (recortar && (fx.length || afx.length)) {
        vePushHistory();
        if (fx.length) { c.fx = c.fx.filter(f => !s.has(f.id)); if (!c.fx.length) delete c.fx; }
        if (afx.length) { c.afx = c.afx.filter(f => !s.has(f.id)); if (!c.afx.length) delete c.afx; }
        VECP.sel.clear();
        veRefresh();
        if (veMixAtivo()) veAudioEditou();
        veToast(`${veT('Recortado')}: ${nomes} · ${veT('selecione outro clipe e Ctrl+V')}`);
    } else veToast(`${veT('Copiado')}: ${nomes} · ${veT('selecione outro clipe e Ctrl+V')}`);
    return true;
}

function veCpSelColar() {
    const ef = VECP.ef;
    if (!ef) return;
    const lista = veSelLista().filter(x => !veLocked(x));
    if (!lista.length) { veToast(veT('Selecione os clipes que vão receber o que foi copiado')); return; }
    const novo = f => ({ ...veCpClone(f), id: veFxNewId() });
    let ok = 0;
    vePushHistory();
    lista.forEach(x => {
        const img = !veIsAudio(x), adj = veIsAdj(x), som = veOcupaA(x) && veTemSom(x);
        let mudou = false;
        if (img && ef.fx.length) {
            const add = ef.fx.filter(f => VE_FX[f.t] && !(VE_FX[f.t].soClipe && adj)).map(novo);
            if (add.length) { x.fx = [...(x.fx || []), ...add]; mudou = true; }
        }
        if (som && ef.afx.length) { x.afx = [...(x.afx || []), ...ef.afx.map(novo)]; mudou = true; }
        if (img && !adj && ef.mov) {
            const p = { ...veStaticProps(x) };
            VE_CP_MOV.forEach(q => { if (q in ef.mov.p) p[q] = ef.mov.p[q]; else delete p[q]; });
            x.p = p;
            x.k = x.k || {};
            VE_CP_MOV.forEach(q => { delete x.k[q]; if (ef.mov.k[q]) x.k[q] = veCpKfPara(ef.mov.k[q], ef.mov.de, x); });
            mudou = true;
        }
        if (img && ef.opa) {
            x.p = { ...veStaticProps(x), op: ef.opa.op };
            x.k = x.k || {};
            delete x.k.op;
            if (ef.opa.k) x.k.op = veCpKfPara(ef.opa.k, ef.opa.de, x);
            if (!adj) { if (ef.opa.bm) x.bm = ef.opa.bm; else delete x.bm; }
            mudou = true;
        }
        if (x.k && !Object.keys(x.k).length) delete x.k;
        if (mudou) ok++;
    });
    if (!ok) { VE.history.pop(); veUpdateUndo(); veToast(veT('Nenhum clipe selecionado aceita o que foi copiado')); return; }
    veRefresh();
    if (veMixAtivo()) veAudioEditou();
    veToast(`${veT('Colado em')} ${ok} ${veT(ok > 1 ? 'clipes' : 'clipe')}`);
}

// Ctrl+V do editor (sem nada mais novo copiado fora dele): o que foi copiado por último — efeitos ou clipes
function veColarInterno() {
    if (VECP.ultimo === 'ef' && VECP.ef) veCpSelColar();
    else veColar();
}

function veCpSelInit() {
    const box = $ve('ve-props');
    if (!box) return;
    box.addEventListener('click', e => {
        if (e.target.closest('[data-fa]') || e.target.closest('input, select, button')) return;
        const g = e.target.closest('[data-efsel]');
        const h = !g && e.target.closest('.ve-fxe-head');
        const fe = h && h.closest('.ve-fxe');
        const id = g ? g.dataset.efsel : fe ? (fe.dataset.fx || fe.dataset.afx) : null;
        if (id) veCpSelClicar(id, e.ctrlKey || e.metaKey);
    });
}
document.addEventListener('DOMContentLoaded', veCpSelInit);

// Linha no alto do Controles de efeito
function veCpBarra() {
    const box = $ve('ve-fxclip');
    if (!box) return;
    const c = VE.clips[VE.sel];
    box.hidden = !c;
    if (!c) return;
    const chave = (VECP.fx ? VECP.fx.n : 0) + '|' + veSelLista().length;
    if (box._chave === chave) return;
    box._chave = chave;
    const n = veSelLista().length;
    box.innerHTML = `
        <div class="ve-cp-linha"><span>${veT('Copiar efeitos')}</span>
            <button class="ve-cp-btn" onclick="veCpEfeitosCopiar()" title="${veT('Copiar os efeitos, o áudio e o modo de mesclagem deste clipe')} (Ctrl+Alt+C)"><svg class="i"><use href="#i-copy"/></svg></button></div>
        ${VECP.fx ? `<div class="ve-cp-linha"><span>${veT('Colar efeitos')} <small>(${VECP.fx.n})</small></span>
            <button class="ve-btn ve-btn-sm" onclick="veCpEfeitosColar()" title="${veT('Troca os efeitos dos clipes selecionados pelos copiados')} (Ctrl+Alt+V)">${n > 1 ? `${veT('Nos')} ${n} ${veT('selecionados')}` : veT('Neste clipe')}</button></div>` : ''}`;
}

// ── estilo de legenda ──
function veCpLegCopiar() {
    const i = VETX.legSel;
    if (i < 0 || !(VE.legendas || [])[i]) return;
    VECP.leg = veCpClone(veTxEstiloLegenda(i));
    veToast(veT('Estilo copiado: escolha "Nesta" em outra legenda ou "Em todas"'));
    VEPP.chave = '';
    vePpRender();
}

function veCpLegColar(todas) {
    if (!VECP.leg) return;
    vePushHistory();
    if (todas) {
        // vira o estilo de todas: o padrão passa a ser o copiado e as legendas perdem o que tinham só para elas
        VE.legEstilo = veCpClone(VECP.leg);
        VE.legendas = (VE.legendas || []).map(l => { const n = { ...l }; delete n.estilo; return n; });
    } else {
        const idx = veLegSelIdx();   // a selecionada ou todas as selecionadas
        if (!idx.length) { VE.history.pop(); veUpdateUndo(); return; }
        idx.forEach(i => veTxSetEstiloLegenda(i, veCpClone(VECP.leg)));
        if (idx.length > 1) { veRefresh(); veToast(`${veT('Estilo aplicado em')} ${idx.length} ${veT('legendas')}`); return; }
    }
    veRefresh();
    veToast(todas ? `${veT('Estilo aplicado em')} ${(VE.legendas || []).length} ${veT('legendas')}` : veT('Estilo aplicado nesta legenda'));
}

// HTML da linha do painel Propriedades (legenda selecionada)
function veCpLegHtml() {
    return `<div class="ve-cp-linha"><span>${veT('Copiar estilo')}</span>
            <button class="ve-cp-btn" data-ppcp="leg-copiar" title="${veT('Copiar o estilo desta legenda')}"><svg class="i"><use href="#i-copy"/></svg></button></div>
        ${VECP.leg ? `<div class="ve-cp-linha"><span>${veT('Colar estilo')}</span>
            <span class="ve-cp-botoes"><button class="ve-btn ve-btn-sm" data-ppcp="leg-colar">${veLegSelIdx().length > 1 ? `${veT('Nas')} ${veLegSelIdx().length} ${veT('selecionadas')}` : veT('Nesta')}</button>
            <button class="ve-btn ve-btn-sm" data-ppcp="leg-colar-todas">${veT('Em todas')}</button></span></div>` : ''}`;
}
