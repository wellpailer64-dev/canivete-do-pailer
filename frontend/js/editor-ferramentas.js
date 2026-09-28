// =========================================================
// Pocket Editor — painel Ferramentas (como o Tools do Premiere)
// Painel encaixável como os outros: fica na vertical ou na horizontal conforme o formato que ele tiver. Ferramentas
// da mesma família ficam num grupo (o botão mostra a última usada; o triângulo no canto indica que há outras):
// segurar o clique ou clicar com o botão direito abre o grupo.
// =========================================================

const VE_FERR = [
    [{ id: 'select', ic: 'i-pointer', nome: 'Seleção', tecla: 'V' }],
    [{ id: 'rate', ic: 'i-rate', nome: 'Velocidade (Rate Stretch)', tecla: 'R' }],
    [{ id: 'razor', ic: 'i-scissors', nome: 'Lâmina', tecla: 'C' }],
    [{ id: 'hand', ic: 'i-hand', nome: 'Mão', tecla: 'H' }, { id: 'zoom', ic: 'i-zoom', nome: 'Zoom', tecla: 'Z' }],
    [{ id: 'texto', ic: 'i-type', nome: 'Texto', tecla: 'T' }],
];
const VEFR = { mostrada: {}, menu: null };   // grupo → ferramenta que aparece no botão

function veFerrRender() {
    const box = $ve('ve-tools');
    if (!box) return;
    box.innerHTML = VE_FERR.map((g, gi) => {
        const f = g.find(x => x.id === VE.tool) || g.find(x => x.id === VEFR.mostrada[gi]) || g[0];
        return `<button class="ve-tool${g.some(x => x.id === VE.tool) ? ' active' : ''}${g.length > 1 ? ' grupo' : ''}" data-g="${gi}" data-tool="${f.id}"
            title="${veT(f.nome)} (${f.tecla})${g.length > 1 ? ' · ' + veT('segure para ver as outras') : ''}"><svg class="i"><use href="#${f.ic}"/></svg></button>`;
    }).join('');
}

function veFerrMenu(gi, botao) {
    veFerrMenuFechar();
    const doc = botao.ownerDocument, r = botao.getBoundingClientRect();
    const m = doc.createElement('div');
    m.className = 've-ctx ve-tool-menu';
    m.innerHTML = VE_FERR[gi].map(f => `<button class="ve-ctx-item${f.id === VE.tool ? ' on' : ''}" data-tool="${f.id}">
        <svg class="i"><use href="#${f.ic}"/></svg> ${veT(f.nome)}<kbd>${f.tecla}</kbd></button>`).join('');
    doc.body.appendChild(m);
    const w = doc.defaultView, mr = m.getBoundingClientRect();
    m.style.left = Math.min(r.right + 4, w.innerWidth - mr.width - 6) + 'px';
    m.style.top = Math.min(r.top, w.innerHeight - mr.height - 6) + 'px';
    m.addEventListener('click', e => {
        const b = e.target.closest('[data-tool]');
        if (!b) return;
        VEFR.mostrada[gi] = b.dataset.tool;
        veSetTool(b.dataset.tool);
        veFerrMenuFechar();
    });
    const fora = e => { if (!m.contains(e.target)) veFerrMenuFechar(); };
    setTimeout(() => doc.addEventListener('pointerdown', fora, true), 0);
    VEFR.menu = { m, fechar: () => { doc.removeEventListener('pointerdown', fora, true); m.remove(); } };
}
function veFerrMenuFechar() { if (VEFR.menu) { VEFR.menu.fechar(); VEFR.menu = null; } }

function veFerrInit() {
    const box = $ve('ve-tools');
    if (!box) return;
    let segura = null;
    box.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-g]');
        if (!b || e.button !== 0) return;
        clearTimeout(segura);
        if (VE_FERR[+b.dataset.g].length > 1) segura = setTimeout(() => { segura = 'menu'; veFerrMenu(+b.dataset.g, b); }, 400);
    });
    box.addEventListener('pointerup', e => {
        const b = e.target.closest('[data-g]');
        if (segura === 'menu') { segura = null; return; }
        clearTimeout(segura);
        segura = null;
        if (b && e.button === 0) veSetTool(b.dataset.tool);
    });
    box.addEventListener('contextmenu', e => {
        const b = e.target.closest('[data-g]');
        e.preventDefault();
        if (b && VE_FERR[+b.dataset.g].length > 1) veFerrMenu(+b.dataset.g, b);
    });
    // vertical ou horizontal conforme o formato do painel
    new ResizeObserver(() => {
        const r = box.getBoundingClientRect();
        box.classList.toggle('horizontal', r.width > r.height);
    }).observe(box);
    veFerrRender();
}

document.addEventListener('DOMContentLoaded', veFerrInit);
