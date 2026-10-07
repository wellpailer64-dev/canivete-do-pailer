// =========================================================
// Vetor Kanivete — painéis móveis, o mesmo mecanismo do Photo Kanivete (imagem-dock.js) e as mesmas classes visuais.
// As abas antigas (Camadas, Pranchetas, Amostras, Separações, Vínculos, Fechamento) viram painéis próprios, como no
// Illustrator. Cada lado do desenho (esq/dir) tem colunas; cada coluna, uma pilha de painéis. Arrastar o título: em
// cima/embaixo de outro = empilha; borda esquerda/direita de uma coluna = coluna nova; faixa da borda do desenho = coluna
// nova colada; sobre o desenho = janela solta. Duplo clique recolhe; × fecha (menu Janela reabre); divisórias mudam
// altura e largura. Layout em iePref('vk_paineis') (%APPDATA%, como o do Photo).
// Os painéis renderizam pelas funções vkAba* de sempre: vkEl('vk-aba') aponta para o corpo do painel da vez (VK._abaEl).
// =========================================================
const VK_DOCK_PAINEIS = { props: 'Propriedades', camadas: 'Camadas', pranchetas: 'Pranchetas', amostras: 'Amostras', separacoes: 'Separações', vinculos: 'Vínculos', fechamento: 'Fechamento' };
const VK_DOCK_REND = { camadas: () => vkAbaCamadas(), pranchetas: () => vkAbaPranchetas(), amostras: () => vkAbaAmostras(), separacoes: () => vkAbaSeparacoes(), vinculos: () => vkAbaVinculos(), fechamento: () => vkAbaFechamento() };
// padrão: Propriedades e Amostras numa coluna, Camadas e Pranchetas em outra, à direita (Separações, Vínculos e
// Fechamento ficam no menu Janela; o botão Fechamento e Alt+Shift+Ctrl+Y abrem os deles)
const VK_DOCK_PADRAO = { esq: [], dir: [['props', 'amostras'], ['camadas', 'pranchetas']], largEsq: [], largDir: [270, 260],
    soltos: {}, fechados: ['separacoes', 'vinculos', 'fechamento'], recolhidos: [], alturas: { amostras: 220 } };
const VK_DOCK = { lay: null, arr: null, el: {} };
const VK_DOCK_LARG = 270;
const vkClampD = (v, a, b) => Math.max(a, Math.min(b, v));

function vkDockNormalizar(l) {
    l = Object.assign(JSON.parse(JSON.stringify(VK_DOCK_PADRAO)), l ? JSON.parse(JSON.stringify(l)) : {});
    for (const lado of ['esq', 'dir']) {
        const lk = lado === 'esq' ? 'largEsq' : 'largDir', larg = Array.isArray(l[lk]) ? l[lk] : [], out = [], outL = [];
        (l[lado] || []).forEach((c, i) => { const ids = (c || []).filter(id => VK_DOCK_PAINEIS[id]); if (ids.length) { out.push(ids); outL.push(vkClampD(+larg[i] || VK_DOCK_LARG, 180, 600)); } });
        l[lado] = out; l[lk] = outL;
    }
    l.soltos = Object.fromEntries(Object.entries(l.soltos || {}).filter(([id]) => VK_DOCK_PAINEIS[id]));
    l.fechados = (l.fechados || []).filter(id => VK_DOCK_PAINEIS[id]);
    l.recolhidos = (l.recolhidos || []).filter(id => VK_DOCK_PAINEIS[id]);
    const todos = new Set([...l.esq.flat(), ...l.dir.flat(), ...Object.keys(l.soltos), ...l.fechados]);
    for (const id of Object.keys(VK_DOCK_PAINEIS)) if (!todos.has(id)) l.fechados.push(id);   // painel novo: começa fechado
    return l;
}
const vkDockPref = () => (typeof iePref === 'function' ? iePref('vk_paineis', null) : null);
// só grava depois de carregar as preferências: o iePrefGravar salva o arquivo INTEIRO (apagaria as do Photo)
function vkDockGravar() { if (VK_DOCK.prefsOk && typeof iePrefGravar === 'function') iePrefGravar('vk_paineis', JSON.parse(JSON.stringify(VK_DOCK.lay))); }
const vkDockPainel = id => VK_DOCK.el[id];
const vkDockLado = lado => vkEl(lado === 'esq' ? 'vk-paineis-esq' : 'vk-paineis');

function vkDockInstalar() {
    const vk = vkEl('vk'), dir = vkEl('vk-paineis');
    if (!vk || !dir || VK_DOCK.lay) return;
    // coluna da esquerda (entre as ferramentas e o desenho) e um painel por aba
    const esq = document.createElement('aside');
    esq.className = 'ie-paineis ie-paineis-esq vk-paineis'; esq.id = 'vk-paineis-esq';
    vk.querySelector('.vk-corpo').insertBefore(esq, vk.querySelector('.vk-corpo .ie-centro'));
    const props = vkEl('vk-props');
    dir.innerHTML = '';
    for (const id of Object.keys(VK_DOCK_PAINEIS)) {
        const s = document.createElement('section');
        s.className = 'ie-painel'; s.dataset.painel = id;
        s.innerHTML = `<header class="ie-painel-cab"><span class="ie-dock-tit">${VK_DOCK_PAINEIS[id]}</span>
            <button class="ie-dock-btn" data-dock="recolher" title="Recolher (duplo clique no título)">▾</button>
            <button class="ie-dock-btn" data-dock="fechar" title="Fechar (Janela no menu reabre)">×</button></header>`;
        if (id === 'props') s.appendChild(props);
        else { const c = document.createElement('div'); c.className = 'ie-painel-corpo vk-aba'; c.id = 'vk-aba-' + id; s.appendChild(c); }
        const cab = s.querySelector('.ie-painel-cab');
        cab.addEventListener('pointerdown', ev => vkDockArrIni(ev, id));
        cab.addEventListener('dblclick', ev => { if (!ev.target.closest('button')) vkDockRecolher(id); });
        cab.querySelector('[data-dock=recolher]').onclick = () => vkDockRecolher(id);
        cab.querySelector('[data-dock=fechar]').onclick = () => vkDockFechar(id);
        VK_DOCK.el[id] = s;
    }
    VK_DOCK.lay = vkDockNormalizar(vkDockPref());
    vkDockObservar();
    vkDockAplicar(false);
    // preferências do %APPDATA% chegam um instante depois (se o Photo ainda não carregou nesta sessão)
    const pronto = () => { VK_DOCK.prefsOk = true; const p = vkDockPref(); if (p) { VK_DOCK.lay = vkDockNormalizar(p); vkDockAplicar(false); } };
    if (typeof iePrefsCarregar === 'function' && !(IE.prefs && Object.keys(IE.prefs).length)) iePrefsCarregar().then(pronto, pronto); else pronto();
}

// renderiza os painéis abertos (as funções vkAba* escrevem em vkEl('vk-aba') = o corpo do painel da vez)
function vkDockRenderUm(id) {
    const l = VK_DOCK.lay, f = VK_DOCK_REND[id], el = vkEl('vk-aba-' + id);
    if (!l || !f || !el || l.fechados.includes(id) || l.recolhidos.includes(id) || !VK.doc) return;
    VK._abaEl = el;
    try { f(); } catch (e) { console.error(e); } finally { VK._abaEl = null; }
}
function vkDockRender() {
    const l = VK_DOCK.lay; if (!l) return;
    if (VK.aba && VK.aba !== VK._abaUlt) {   // alguém pediu um painel (botão Fechamento, Alt+Shift+Ctrl+Y...): abre e desdobra
        VK._abaUlt = VK.aba;
        if (l.fechados.includes(VK.aba) || l.recolhidos.includes(VK.aba)) { l.recolhidos = l.recolhidos.filter(x => x !== VK.aba); if (l.fechados.includes(VK.aba)) vkDockAbrir(VK.aba); else vkDockAplicar(); }
    }
    for (const id of Object.keys(VK_DOCK_REND)) vkDockRenderUm(id);
}
function vkDockLimpar() { for (const id of Object.keys(VK_DOCK_REND)) { const el = vkEl('vk-aba-' + id); if (el) el.innerHTML = ''; } }

function vkDockAplicar(gravar = true) {
    const l = VK_DOCK.lay, vk = vkEl('vk');
    if (!l || !vk) return;
    const guarda = document.createDocumentFragment();
    for (const id of Object.keys(VK_DOCK_PAINEIS)) guarda.appendChild(vkDockPainel(id));
    for (const lado of ['esq', 'dir']) {
        const box = vkDockLado(lado), lk = lado === 'esq' ? 'largEsq' : 'largDir';
        box.innerHTML = '';
        l[lado].forEach((ids, ci) => {
            const col = document.createElement('div');
            col.className = 'ie-dock-col'; col.dataset.lado = lado; col.dataset.col = ci; col.style.width = l[lk][ci] + 'px';
            const abertos = ids.filter(id => !l.recolhidos.includes(id));
            const cresce = !l.alturas[abertos[abertos.length - 1]] ? abertos[abertos.length - 1] : (abertos.find(id => !l.alturas[id]) || abertos[abertos.length - 1]);
            ids.forEach((id, i) => {
                const p = vkDockPainel(id);
                p.classList.remove('solto'); p.style.left = p.style.top = p.style.width = p.style.height = '';
                if (i) { const d = document.createElement('div'); d.className = 'ie-dock-div'; d.dataset.acima = ids[i - 1]; col.appendChild(d); vkDockDivisoria(d); }
                col.appendChild(p); p.classList.toggle('ultimo', id === cresce);
            });
            const b = document.createElement('div');
            b.className = 'ie-dock-borda ie-dock-borda-' + lado; b.title = 'Arrastar: largura da coluna';
            col.appendChild(b); vkDockBorda(b, lado, ci);
            box.appendChild(col);
        });
        box.classList.toggle('vazia', !l[lado].length);
        vk.style.setProperty(lado === 'esq' ? '--vk-esq-w' : '--vk-dir-w', l[lk].reduce((a, b) => a + b + 1, 0) + 'px');
    }
    for (const [id, r] of Object.entries(l.soltos)) {
        const p = vkDockPainel(id);
        p.classList.add('solto'); vk.appendChild(p);
        Object.assign(p.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    }
    for (const id of Object.keys(VK_DOCK_PAINEIS)) {
        const p = vkDockPainel(id);
        if (!p.parentNode || p.parentNode === guarda) vkDockLado('dir').appendChild(p);
        p.hidden = l.fechados.includes(id);
        p.classList.toggle('recolhido', l.recolhidos.includes(id));
        const h = l.alturas[id];
        p.style.flex = !l.soltos[id] && h && !l.recolhidos.includes(id) && !p.classList.contains('ultimo') ? `0 0 ${h}px` : '';
    }
    if (gravar) vkDockGravar();
    vkDockRender();
    if (typeof vkRedimensionar === 'function') vkRedimensionar(); else window.dispatchEvent(new Event('resize'));
}

function vkDockBorda(b, lado, ci) {
    b.addEventListener('pointerdown', ev => {
        ev.preventDefault(); b.setPointerCapture(ev.pointerId);
        const lk = lado === 'esq' ? 'largEsq' : 'largDir', x0 = ev.clientX, w0 = VK_DOCK.lay[lk][ci];
        b.onpointermove = e => {
            VK_DOCK.lay[lk][ci] = vkClampD(Math.round(w0 + (e.clientX - x0) * (lado === 'esq' ? 1 : -1)), 180, 600);
            b.parentNode.style.width = VK_DOCK.lay[lk][ci] + 'px';
            vkEl('vk').style.setProperty(lado === 'esq' ? '--vk-esq-w' : '--vk-dir-w', VK_DOCK.lay[lk].reduce((a, c) => a + c + 1, 0) + 'px');
        };
        b.onpointerup = () => { b.onpointermove = null; vkDockGravar(); window.dispatchEvent(new Event('resize')); };
    });
}
function vkDockDivisoria(d) {
    d.addEventListener('pointerdown', ev => {
        ev.preventDefault(); d.setPointerCapture(ev.pointerId);
        const cima = vkDockPainel(d.dataset.acima), baixo = d.nextElementSibling;
        const usarBaixo = cima.classList.contains('ultimo') && baixo && baixo.dataset.painel;
        const p = usarBaixo ? baixo : cima, id = p.dataset.painel, y0 = ev.clientY, h0 = p.getBoundingClientRect().height, sinal = usarBaixo ? -1 : 1;
        d.onpointermove = e => { VK_DOCK.lay.alturas[id] = Math.max(60, Math.round(h0 + sinal * (e.clientY - y0))); p.style.flex = `0 0 ${VK_DOCK.lay.alturas[id]}px`; };
        d.onpointerup = () => { d.onpointermove = null; vkDockGravar(); vkDockAplicar(); };
    });
    d.addEventListener('dblclick', () => { delete VK_DOCK.lay.alturas[d.dataset.acima]; vkDockAplicar(); });
}
function vkDockTirar(id) {
    const l = VK_DOCK.lay;
    for (const lado of ['esq', 'dir']) {
        const lk = lado === 'esq' ? 'largEsq' : 'largDir';
        for (const c of l[lado]) { const k = c.indexOf(id); if (k >= 0) c.splice(k, 1); }
        for (let i = l[lado].length - 1; i >= 0; i--) if (!l[lado][i].length) { l[lado].splice(i, 1); l[lk].splice(i, 1); }
    }
    delete l.soltos[id];
    l.fechados = l.fechados.filter(x => x !== id);
}
function vkDockRecolher(id) { const l = VK_DOCK.lay; l.recolhidos = l.recolhidos.includes(id) ? l.recolhidos.filter(x => x !== id) : [...l.recolhidos, id]; vkDockAplicar(); }
function vkDockFechar(id) { vkDockTirar(id); VK_DOCK.lay.fechados.push(id); if (VK.aba === id) VK.aba = VK._abaUlt = null; vkDockAplicar(); }
function vkDockAbrir(id) {
    const l = VK_DOCK.lay;
    vkDockTirar(id);
    if (!l.dir.length) { l.dir.push([]); l.largDir.push(VK_DOCK_LARG); }
    l.dir[l.dir.length - 1].push(id);
    l.recolhidos = l.recolhidos.filter(x => x !== id);
    vkDockAplicar();
}
function vkDockAlternar(id) { if (VK_DOCK.lay.fechados.includes(id)) vkDockAbrir(id); else vkDockFechar(id); }
function vkDockRedefinir() { VK_DOCK.lay = vkDockNormalizar(null); vkDockAplicar(); }

// ── arrastar pelo título ──
function vkDockArrIni(ev, id) {
    if (ev.button !== 0 || ev.target.closest('button')) return;
    ev.preventDefault();
    const r = vkDockPainel(id).getBoundingClientRect();
    VK_DOCK.arr = { id, x0: ev.clientX, y0: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top, w: r.width, h: Math.max(160, r.height), ativo: false };
    const mv = e => vkDockArrMove(e), up = e => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); vkDockArrFim(e); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
function vkDockAlvo(ev) {
    const l = VK_DOCK.lay, x = ev.clientX, y = ev.clientY, BORDA = 30;
    const centro = vkEl('vk').querySelector('.ie-centro').getBoundingClientRect();
    for (const lado of ['esq', 'dir']) {
        for (const col of vkDockLado(lado).querySelectorAll('.ie-dock-col')) {
            const r = col.getBoundingClientRect(), ci = +col.dataset.col;
            if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
            if (x < r.left + BORDA) return { lado, nova: ci, marca: { left: r.left, top: r.top, width: 4, height: r.height } };
            if (x > r.right - BORDA) return { lado, nova: ci + 1, marca: { left: r.right - 4, top: r.top, width: 4, height: r.height } };
            const ids = l[lado][ci].filter(id => id !== VK_DOCK.arr.id);
            let i = ids.length;
            for (let k = 0; k < ids.length; k++) { const pr = vkDockPainel(ids[k]).getBoundingClientRect(); if (y < pr.top + pr.height / 2) { i = k; break; } }
            const yy = !ids.length ? r.top : i < ids.length ? vkDockPainel(ids[i]).getBoundingClientRect().top : vkDockPainel(ids[ids.length - 1]).getBoundingClientRect().bottom;
            return { lado, col: ci, i, marca: { left: r.left, top: yy - 2, width: r.width, height: 4 } };
        }
    }
    if (y >= centro.top && y <= centro.bottom) {
        if (x >= centro.left && x <= centro.left + 48) return { lado: 'esq', nova: l.esq.length, marca: { left: centro.left, top: centro.top, width: 4, height: centro.height } };
        if (x <= centro.right && x >= centro.right - 48) return { lado: 'dir', nova: 0, marca: { left: centro.right - 4, top: centro.top, width: 4, height: centro.height } };
    }
    return null;
}
function vkDockArrMove(ev) {
    const a = VK_DOCK.arr;
    if (!a || (!a.ativo && Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 6)) return;
    const vk = vkEl('vk'), rb = vk.getBoundingClientRect();
    if (!a.ativo) {
        a.ativo = true;
        a.fantasma = Object.assign(document.createElement('div'), { className: 'ie-dock-fantasma', textContent: VK_DOCK_PAINEIS[a.id] });
        a.marca = Object.assign(document.createElement('div'), { className: 'ie-dock-marca' });
        vk.append(a.fantasma, a.marca);
    }
    a.alvo = vkDockAlvo(ev);
    Object.assign(a.fantasma.style, { left: ev.clientX - rb.left - a.dx + 'px', top: ev.clientY - rb.top - a.dy + 'px', width: a.w + 'px', height: (a.alvo ? 30 : a.h) + 'px' });
    a.fantasma.classList.toggle('solto', !a.alvo);
    if (a.alvo) { const m = a.alvo.marca; Object.assign(a.marca.style, { display: 'block', left: m.left - rb.left + 'px', top: m.top - rb.top + 'px', width: m.width + 'px', height: m.height + 'px' }); }
    else a.marca.style.display = 'none';
}
function vkDockArrFim(ev) {
    const a = VK_DOCK.arr;
    VK_DOCK.arr = null;
    if (!a || !a.ativo) return;
    a.fantasma.remove(); a.marca.remove();
    const l = VK_DOCK.lay, rb = vkEl('vk').getBoundingClientRect(), alvo = a.alvo;
    const destinoCol = alvo && alvo.col !== undefined ? l[alvo.lado][alvo.col] : null;
    const largura = Math.round(Math.max(200, Math.min(400, a.w)));
    vkDockTirar(a.id);
    if (alvo && destinoCol) {
        if (l[alvo.lado].indexOf(destinoCol) >= 0) destinoCol.splice(Math.min(alvo.i, destinoCol.length), 0, a.id);
        else { l[alvo.lado].push([a.id]); l[alvo.lado === 'esq' ? 'largEsq' : 'largDir'].push(largura); }
    } else if (alvo) {
        const lk = alvo.lado === 'esq' ? 'largEsq' : 'largDir', k = Math.min(alvo.nova, l[alvo.lado].length);
        l[alvo.lado].splice(k, 0, [a.id]); l[lk].splice(k, 0, largura);
    } else l.soltos[a.id] = {
        x: vkClampD(Math.round(ev.clientX - rb.left - a.dx), 0, rb.width - 120), y: vkClampD(Math.round(ev.clientY - rb.top - a.dy), 0, rb.height - 40),
        w: Math.round(Math.max(240, a.w)), h: Math.round(a.h),
    };
    vkDockAplicar();
}
function vkDockObservar() {
    const ro = new ResizeObserver(ents => {
        const l = VK_DOCK.lay; if (!l) return;
        for (const e of ents) { const id = e.target.dataset.painel; if (id && l.soltos[id] && e.target.classList.contains('solto')) { l.soltos[id].w = Math.round(e.target.offsetWidth); l.soltos[id].h = Math.round(e.target.offsetHeight); } }
        clearTimeout(VK_DOCK.tGravar); VK_DOCK.tGravar = setTimeout(vkDockGravar, 300);
    });
    for (const id of Object.keys(VK_DOCK_PAINEIS)) ro.observe(vkDockPainel(id));
}

(function () {
    const montar = vkMontar;
    vkMontar = function () { montar(); vkDockInstalar(); };
    VK_MENUS.push(['Janela', [...Object.entries(VK_DOCK_PAINEIS).map(([id, n]) => [n, '', () => vkDockAlternar(id)]), '-', ['Redefinir painéis', '', () => vkDockRedefinir()]]]);
})();
if (vkEl('vk') && vkEl('vk').dataset.ok) vkDockInstalar();   // o Vetor já estava montado (recarregar a página com ele aberto)
