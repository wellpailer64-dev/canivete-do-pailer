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
