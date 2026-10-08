// =========================================================
// Kanivete Encoder (Ke) — a janela do Exportar + fila (editor-fila.js) com identidade própria: logo Ke, janela solta
// (arrasta pelo cabeçalho, redimensiona pelo canto, sem escurecer o editor: dá para continuar editando com ela
// aberta), minimizar para uma barrinha com o progresso da fila (clique restaura), fechar sem parar a fila.
// Posição e tamanho lembrados (localStorage 've-ke-janela'). Plano do encoder: Instructions/agente/plano-kanivete-encoder.md.
// =========================================================
const VEKE = { min: false };
const veKeEl = () => $ve('ve-export');
const veKeBox = () => veKeEl() && veKeEl().querySelector('.ve-modal-box');
function veKeLer() { try { return JSON.parse(veLsGet('ve-ke-janela') || 'null'); } catch (e) { return null; } }
function veKeGravar() {
    const b = veKeBox(); if (!b || veKeEl().hidden) return;
    try { veLsSet('ve-ke-janela', JSON.stringify({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight })); } catch (e) { /* sem storage */ }
}
function veKePosicionar() {
    const el = veKeEl(), b = veKeBox(); if (!el || !b) return;
    const W = el.clientWidth, H = el.clientHeight, j = veKeLer();
    if (j && j.w) { b.style.width = Math.min(j.w, W - 16) + 'px'; b.style.height = Math.min(j.h, H - 16) + 'px'; }
    const w = b.offsetWidth, h = b.offsetHeight;
    const x = j ? j.x : (W - w) / 2, y = j ? j.y : Math.max(8, (H - h) / 2);
    b.style.left = Math.max(0, Math.min(W - Math.min(w, 120), x)) + 'px';
    b.style.top = Math.max(0, Math.min(H - 40, y)) + 'px';
}
function veKeMontar() {
    const el = veKeEl(); if (!el || el.dataset.ke) return;
    el.dataset.ke = '1';
    el.classList.add('ve-ke');
    const head = el.querySelector('.ve-modal-head');
    head.innerHTML = `<span class="ve-ke-tit"><span class="app-logo al-ke app-logo-marca">Ke</span> Kanivete Encoder</span>
        <span class="ve-ke-bts"><button class="ve-icon-btn" data-ke="min" title="Minimizar (a fila continua)">—</button>
        <button class="ve-icon-btn" data-ke="fechar" title="Fechar (a fila continua; o botão Fila reabre)"><svg class="i"><use href="#i-x"/></svg></button></span>`;
    head.querySelector('[data-ke="min"]').onclick = () => veKeMinimizar();
    head.querySelector('[data-ke="fechar"]').onclick = () => veCloseExport();
    // arrastar pelo cabeçalho
    head.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const b = veKeBox(), x0 = e.clientX, y0 = e.clientY, l0 = b.offsetLeft, t0 = b.offsetTop, W = el.clientWidth, H = el.clientHeight;
        head.setPointerCapture(e.pointerId); head.classList.add('arrastando');
        head.onpointermove = ev => {
            b.style.left = Math.max(-b.offsetWidth + 120, Math.min(W - 120, l0 + ev.clientX - x0)) + 'px';
            b.style.top = Math.max(0, Math.min(H - 40, t0 + ev.clientY - y0)) + 'px';
        };
        head.onpointerup = () => { head.onpointermove = null; head.classList.remove('arrastando'); veKeGravar(); };
    });
    head.addEventListener('dblclick', e => { if (!e.target.closest('button')) veKeMinimizar(); });
    // tamanho (canto de baixo à direita) lembrado
    let t = 0;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(veKeGravar, 300); }).observe(veKeBox());
    // barrinha minimizada
    const mini = document.createElement('button');
    mini.className = 've-ke-mini'; mini.id = 've-ke-mini'; mini.hidden = true; mini.title = 'Kanivete Encoder — clique para abrir';
    mini.innerHTML = '<span class="app-logo al-ke">Ke</span><span class="ve-ke-mini-txt" id="ve-ke-mini-txt">Kanivete Encoder</span><span class="ve-ke-mini-barra"><i id="ve-ke-mini-fill"></i></span>';
    mini.onclick = () => veKeRestaurar();
    $ve('ve').appendChild(mini);
}
function veKeMinimizar() { VEKE.min = true; veKeGravar(); veKeEl().hidden = true; veKeMini(); }
function veKeRestaurar() { VEKE.min = false; $ve('ve-ke-mini').hidden = true; veOpenExport(); }
function veKeMini() {   // barrinha: aparece minimizada; com a fila rodando mostra "2 de 5 · 43%"
    const m = $ve('ve-ke-mini'); if (!m) return;
    m.hidden = !VEKE.min;
    const it = VEFILA.atual, total = VEFILA.itens.filter(x => x.estado !== 'cancelado').length;
    const pos = it ? VEFILA.itens.filter(x => x.estado !== 'cancelado').indexOf(it) + 1 : 0;
    $ve('ve-ke-mini-txt').textContent = it ? `${it.cfg.nome} · ${pos} de ${total} · ${Math.round(it.pct)}%`
        : VEFILA.itens.some(x => x.estado === 'espera') ? `Fila: ${VEFILA.itens.filter(x => x.estado === 'espera').length} esperando` : 'Kanivete Encoder';
    $ve('ve-ke-mini-fill').style.width = (it ? it.pct : 0) + '%';
    m.classList.toggle('rodando', !!it);
}

(function () {
    const abrir = veOpenExport;
    veOpenExport = function () {
        abrir();
        if (veKeEl().hidden) return;
        veKeMontar();
        VEKE.min = false; $ve('ve-ke-mini').hidden = true;
        veKePosicionar();
    };
    const fechar = veCloseExport;
    veCloseExport = function () { veKeGravar(); VEKE.min = false; const m = $ve('ve-ke-mini'); if (m) m.hidden = true; return fechar(); };
    // a barrinha acompanha a fila
    const r = veFilaRender, ri = veFilaRenderItem;
    veFilaRender = function () { r(); veKeMini(); };
    veFilaRenderItem = function (it) { ri(it); veKeMini(); };
    window.addEventListener('resize', () => { if (veKeEl() && !veKeEl().hidden && veKeEl().dataset.ke) veKePosicionar(); });
})();
window.VEKE_API = { minimizar: () => veKeMinimizar(), restaurar: () => veKeRestaurar(), estado: () => ({ aberto: !veKeEl().hidden, min: VEKE.min, janela: veKeLer() }) };
