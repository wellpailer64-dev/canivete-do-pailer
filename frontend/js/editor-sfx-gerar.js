// =========================================================
// Pocket Editor — Gerar efeito sonoro por texto (IA local): caixa no topo do painel Soundboard.
// Motor: Functions/gerador_sfx.py (EzAudio XL em ONNX, DirectML, sem login; modelo ≈ 4 GB baixado no 1º uso do
// release sfx-v1). A Kani reescreve o pedido POR BAIXO no formato que o modelo gera melhor (inglês, estilo AudioCaps:
// gerador_sfx.melhorar_pedido); quem pediu não vê. Sem a Kani, o pedido vai como veio (em inglês funciona melhor).
// O efeito pronto entra no Projeto (pasta "Efeitos gerados") e na timeline, na agulha, na primeira trilha livre.
// =========================================================
const VESFX = { estado: null, baixando: null, gerando: null, ultimo: null };
const VESFX_EXEMPLOS = ['whoosh rápido de transição', 'porta de madeira rangendo', 'chuva forte no telhado', 'impacto grave cinematográfico',
                        'passos no cascalho', 'teclado mecânico digitando', 'explosão distante', 'multidão aplaudindo'];

function veSfxApi() { return window.pywebview && window.pywebview.api; }

function veSfxCarregar() {
    const api = veSfxApi();
    if (!api || !api.ve_sfx_estado) return;
    api.ve_sfx_estado().then(r => { VESFX.estado = r; veSfxRender(); });
}

function veSfxRender() {
    const box = $ve('ve-sfx');
    if (!box) return;
    const e = VESFX.estado;
    if (!box._montado) {
        box._montado = true;
        box.innerHTML = `<details class="ve-sfx-caixa" open><summary>✨ ${veT('Gerar efeito (IA)')}</summary><div class="ve-sfx-corpo"></div></details>`;
        box.addEventListener('click', veSfxClique);
        box.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 've-sfx-texto') { ev.preventDefault(); veSfxGerar(); } ev.stopPropagation(); });
    }
    const corpo = box.querySelector('.ve-sfx-corpo');
    if (!e) { corpo.innerHTML = `<small>${veT('Carregando...')}</small>`; return; }
    if (VESFX.baixando || e.baixando) {
        const b = VESFX.baixando || { pct: 0, msg: veT('Baixando...') };
        corpo.innerHTML = `<div class="ve-sfx-barra"><i style="width:${b.pct}%"></i></div><small class="ve-sfx-msg">${b.msg || ''}</small>`;
        return;
    }
    if (!e.instalado) {
        corpo.innerHTML = `<small>${veT('Cria ruídos e efeitos a partir de uma descrição, no seu computador. Precisa baixar o gerador uma vez')} (≈ ${e.tamanho_gb} GB).</small>
            <button class="ve-btn ve-btn-sm" data-sfx="baixar">${veT('Baixar gerador')}</button>`;
        return;
    }
    const g = VESFX.gerando;
    corpo.innerHTML = `<input type="text" id="ve-sfx-texto" placeholder="${veT('Descreva o som (ex.: porta de madeira rangendo)')}" ${g ? 'disabled' : ''}>
        <div class="ve-sfx-linha">
            <select id="ve-sfx-seg" title="${veT('Duração')}" ${g ? 'disabled' : ''}>${[2, 3, 4, 5, 6, 8, 10].map(s => `<option value="${s}" ${s === 5 ? 'selected' : ''}>${s} s</option>`).join('')}</select>
            <button class="ve-btn ve-btn-sm ve-btn-primary" data-sfx="gerar" ${g ? 'disabled' : ''}>${g ? veT('Gerando...') : veT('Gerar')}</button>
        </div>
        ${g ? `<div class="ve-sfx-barra"><i style="width:${g.pct || 0}%"></i></div><small class="ve-sfx-msg">${g.msg || ''}</small>` : ''}
        ${!g && VESFX.ultimo ? `<small class="ve-sfx-msg">✓ ${veT('Pronto')}: ${VESFX.ultimo.pedido}</small>` : ''}
        ${!g ? `<div class="ve-sfx-ex">${VESFX_EXEMPLOS.map(t => `<button data-sfx-ex="${t}">${t}</button>`).join('')}</div>` : ''}`;
}

function veSfxClique(ev) {
    const b = ev.target.closest('[data-sfx]'), ex = ev.target.closest('[data-sfx-ex]');
    if (ex) { const i = $ve('ve-sfx-texto'); if (i) { i.value = ex.dataset.sfxEx; i.focus(); } return; }
    if (!b) return;
    if (b.dataset.sfx === 'baixar') veSfxBaixar();
    if (b.dataset.sfx === 'gerar') veSfxGerar();
}

function veSfxBaixar() {
    const api = veSfxApi();
    VESFX.baixando = { pct: 0, msg: veT('Começando o download...') };
    veSfxRender();
    api.ve_sfx_baixar().then(r => { if (!r || !r.success) { VESFX.baixando = null; veToast((r && r.error) || veT('Não foi possível baixar')); veSfxRender(); } });
}

function veSfxBaixarProgresso(d) {
    if (d.fim) { VESFX.baixando = null; veToast(veT('Gerador de efeitos pronto')); veSfxCarregar(); return; }
    if (d.erro) { VESFX.baixando = null; veToast(d.erro); veSfxCarregar(); return; }
    VESFX.baixando = { pct: d.pct, msg: d.msg };
    const barra = document.querySelector('#ve-sfx .ve-sfx-barra i') || (typeof vedFind === 'function' && vedFind('ve-sfx') && vedFind('ve-sfx').querySelector('.ve-sfx-barra i'));
    if (barra) { barra.style.width = d.pct + '%'; const m = barra.parentElement.nextElementSibling; if (m) m.textContent = d.msg || ''; } else veSfxRender();
}

function veSfxGerar() {
    const api = veSfxApi(), inp = $ve('ve-sfx-texto');
    const texto = inp && inp.value.trim();
    if (!texto) { veToast(veT('Descreva o som que você quer')); inp && inp.focus(); return; }
    const seg = +($ve('ve-sfx-seg') || {}).value || 5;
    VESFX.gerando = { pct: 0, msg: veT('Começando...'), texto, seg };
    veSfxRender();
    api.ve_sfx_gerar(texto, seg).then(r => {
        if (!r || !r.success) { VESFX.gerando = null; veToast((r && r.error) || veT('Não foi possível gerar')); veSfxRender(); }
    });
}

async function veSfxProgresso(d) {
    if (d.erro) { VESFX.gerando = null; veToast(d.erro); veSfxRender(); return; }
    if (!d.fim) {
        VESFX.gerando = { ...(VESFX.gerando || {}), pct: d.pct, msg: d.msg };
        const box = $ve('ve-sfx'), barra = box && box.querySelector('.ve-sfx-barra i');
        if (barra) { barra.style.width = d.pct + '%'; const m = barra.parentElement.nextElementSibling; if (m) m.textContent = d.msg || ''; } else veSfxRender();
        return;
    }
    const pedido = VESFX.gerando || {};
    VESFX.gerando = null;
    VESFX.ultimo = { nome: d.nome, pedido: pedido.texto || d.nome };
    veSfxRender();
    await veSfxInserir(d.path, pedido.texto || d.nome);
}

// mesmo caminho do Soundboard (veSbInserir): importa no Projeto e põe na agulha, na primeira trilha de áudio livre
async function veSfxInserir(path, nome) {
    if (!VE.ready) { veToast(veT('Efeito salvo em efeitos_gerados (abra um vídeo para usar na timeline)')); return; }
    let b = (VE.bins || []).find(b => b.nome === 'Efeitos gerados' && !b.pai);
    if (!b) b = vePjNovoBin('Efeitos gerados');
    const n = VE.media.length;
    if (!await vePjImportarArquivo(path, b.id) || VE.media.length === n) { veToast(veT('Não foi possível abrir o efeito gerado')); return; }
    const m = VE.media[VE.media.length - 1];
    m.nome = nome;
    const st = veSnapFrame(VE.playhead), novo = { m: m.id };
    const tr = veTrackIndexes().find(t => !veTrkLocked(t) && veTrackFree(t, st, st + m.dur, novo));
    vePjAudioEm(m, st, tr ?? -1);
    vePjAlterou();
    veToast(`${veT('Efeito gerado na agulha')}: ${nome}`);
}

function veSfxInit() {
    if (!$ve('ve-sfx')) return;
    veSfxRender();
    const tenta = () => (veSfxApi() && veSfxApi().ve_sfx_estado ? veSfxCarregar() : setTimeout(tenta, 800));
    tenta();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', veSfxInit); else veSfxInit();
window.VESFX_API = { gerar: (t, s) => { const i = $ve('ve-sfx-texto'); if (i) i.value = t; const sel = $ve('ve-sfx-seg'); if (sel && s) sel.value = s; veSfxGerar(); }, estado: () => VESFX };
