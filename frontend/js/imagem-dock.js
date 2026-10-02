// =========================================================
// Editor de Imagem — painéis móveis (como no Photoshop/Premiere), em colunas lado a lado.
// Cada lado da imagem (esq/dir) tem 0 ou mais colunas; cada coluna, uma pilha de painéis e a sua largura.
// Arrastar o título: para cima/baixo de outro painel = empilha; na borda esquerda/direita de uma coluna = coluna nova
// ao lado; na faixa da borda da imagem = coluna nova colada à imagem; sobre a imagem = janela solta.
// Duplo clique no título recolhe; × fecha (Janela no menu reabre); divisórias mudam altura (entre painéis) e
// largura (borda de cada coluna).
// Layout nas preferências (iePref 'paineis', %APPDATA%): {esq: [[ids]], dir: [[ids]], largEsq: [px], largDir: [px],
// soltos: {id: {x, y, w, h}}, fechados: [ids], recolhidos: [ids], alturas: {id: px}}.
// (O formato antigo, uma lista só por lado, vira uma coluna.)
// =========================================================

const IE_DOCK_PAINEIS = { props: 'Propriedades', camadas: 'Camadas', hist: 'Histórico' };
const IE_DOCK_PADRAO = { esq: [], dir: [['props', 'camadas', 'hist']], largEsq: [], largDir: [292], soltos: {}, fechados: [], recolhidos: [], alturas: {} };
const IE_DOCK = { lay: null, arr: null };
const IE_DOCK_LARG = 270;

// layout em qualquer formato → colunas, sem painéis que não existem e com as larguras certas
function ieDockNormalizar(l) {
    l = Object.assign(JSON.parse(JSON.stringify(IE_DOCK_PADRAO)), l ? JSON.parse(JSON.stringify(l)) : {});
    for (const lado of ['esq', 'dir']) {
        const lk = lado === 'esq' ? 'largEsq' : 'largDir';
        let cols = l[lado] || [];
        if (cols.length && !Array.isArray(cols[0])) cols = [cols];   // formato antigo
        let larg = Array.isArray(l[lk]) ? l[lk] : (typeof l[lk] === 'number' ? [l[lk]] : []);
        const out = [], outL = [];
        cols.forEach((c, i) => { const ids = (c || []).filter(id => IE_DOCK_PAINEIS[id]); if (ids.length) { out.push(ids); outL.push(ieClamp(+larg[i] || IE_DOCK_LARG, 180, 600)); } });
        l[lado] = out; l[lk] = outL;
    }
    l.soltos = Object.fromEntries(Object.entries(l.soltos || {}).filter(([id]) => IE_DOCK_PAINEIS[id]));
    l.fechados = (l.fechados || []).filter(id => IE_DOCK_PAINEIS[id]);
    return l;
}
const ieDockIds = l => [...l.esq.flat(), ...l.dir.flat(), ...Object.keys(l.soltos), ...l.fechados];

function ieDockLer(padrao) {
    const l = ieDockNormalizar(padrao ? null : iePref('paineis', null));
    // painel novo (versão mais nova do app) ou perdido: os do padrão voltam à direita, os outros começam fechados
    const todos = new Set(ieDockIds(l));
    for (const id of Object.keys(IE_DOCK_PAINEIS)) {
        if (todos.has(id)) continue;
        if (IE_DOCK_PADRAO.dir.flat().includes(id)) { if (!l.dir.length) { l.dir.push([]); l.largDir.push(292); } l.dir[l.dir.length - 1].push(id); }
        else l.fechados.push(id);
    }
    return l;
}
function ieDockGravar() { iePrefGravar('paineis', JSON.parse(JSON.stringify(IE_DOCK.lay))); }
// os elementos ficam guardados: enquanto o layout é refeito eles saem do documento (getElementById não acha)
const IE_DOCK_EL = {};
const ieDockPainel = id => IE_DOCK_EL[id] || (IE_DOCK_EL[id] = ieEl('ie-p-' + id));
const ieDockLado = lado => ieEl(lado === 'esq' ? 'ie-paineis-esq' : 'ie-paineis');

function ieDockInstalar() {
    const ie = ieEl('ie');
    if (!ie || IE_DOCK.lay) return;
    IE_DOCK.lay = ieDockLer();
    // cabeçalhos: título + recolher + fechar
    for (const id of Object.keys(IE_DOCK_PAINEIS)) {
        const p = ieDockPainel(id), cab = p && p.querySelector('.ie-painel-cab');
        if (!cab) continue;
        p.dataset.painel = id;
        cab.innerHTML = `<span class="ie-dock-tit">${ieT(IE_DOCK_PAINEIS[id])}</span>
            <button class="ie-dock-btn" data-dock="recolher" title="${ieT('Recolher (duplo clique no título)')}">${ieIco('chev')}</button>
            <button class="ie-dock-btn" data-dock="fechar" title="${ieT('Fechar (Janela no menu reabre)')}">${ieIco('x')}</button>`;
        cab.addEventListener('pointerdown', ev => ieDockArrIni(ev, id));
        cab.addEventListener('dblclick', ev => { if (!ev.target.closest('button')) ieDockRecolher(id); });
        cab.querySelector('[data-dock=recolher]').onclick = () => ieDockRecolher(id);
        cab.querySelector('[data-dock=fechar]').onclick = () => ieDockFechar(id);
    }
    ieDockObservar();
    ieDockAplicar();
}

// põe cada painel no lugar do layout
function ieDockAplicar(gravar = true) {
    const l = IE_DOCK.lay, ie = ieEl('ie');
    if (!l || !ie) return;
    const guarda = document.createDocumentFragment();   // tira os painéis do lugar antes de refazer as colunas
    for (const id of Object.keys(IE_DOCK_PAINEIS)) { const p = ieDockPainel(id); if (p) guarda.appendChild(p); }
    for (const lado of ['esq', 'dir']) {
        const box = ieDockLado(lado), lk = lado === 'esq' ? 'largEsq' : 'largDir';
        box.innerHTML = '';
        l[lado].forEach((ids, ci) => {
            const col = document.createElement('div');
            col.className = 'ie-dock-col';
            col.dataset.lado = lado; col.dataset.col = ci;
            col.style.width = l[lk][ci] + 'px';
            ids.forEach((id, i) => {
                const p = ieDockPainel(id);
                p.classList.remove('solto');
                p.style.left = p.style.top = p.style.width = p.style.height = '';
                if (i) { const d = document.createElement('div'); d.className = 'ie-dock-div'; d.dataset.acima = ids[i - 1]; col.appendChild(d); ieDockDivisoria(d); }
                col.appendChild(p);
                p.classList.toggle('ultimo', i === ids.length - 1);   // o último ocupa o resto da coluna
            });
            const b = document.createElement('div');   // borda de largura (do lado da imagem)
            b.className = 'ie-dock-borda ie-dock-borda-' + lado;
            b.title = ieT('Arrastar: largura da coluna');
            col.appendChild(b);
            ieDockBorda(b, lado, ci);
            box.appendChild(col);
        });
        box.classList.toggle('vazia', !l[lado].length);
        ie.style.setProperty(lado === 'esq' ? '--ie-esq-w' : '--ie-dir-w', l[lk].reduce((a, b) => a + b + 1, 0) + 'px');
    }
    for (const [id, r] of Object.entries(l.soltos)) {
        const p = ieDockPainel(id);
        p.classList.add('solto');
        ie.appendChild(p);
        Object.assign(p.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    }
    for (const id of Object.keys(IE_DOCK_PAINEIS)) {
        const p = ieDockPainel(id);
        if (!p.parentNode || p.parentNode === guarda) ieDockLado('dir').appendChild(p);   // fechado: fica guardado escondido
        p.hidden = l.fechados.includes(id);
        p.classList.toggle('recolhido', l.recolhidos.includes(id));
        const h = l.alturas[id];
        p.style.flex = !l.soltos[id] && h && !l.recolhidos.includes(id) ? `0 0 ${h}px` : '';
    }
    if (gravar) ieDockGravar();
    ieDesenharVista?.(); ieDesenharSobre?.();
    if (typeof ieJanAtualizar === 'function') ieJanAtualizar();
}

function ieDockBorda(b, lado, ci) {
    b.addEventListener('pointerdown', ev => {
        ev.preventDefault(); b.setPointerCapture(ev.pointerId);
        const lk = lado === 'esq' ? 'largEsq' : 'largDir', x0 = ev.clientX, w0 = IE_DOCK.lay[lk][ci];
        b.onpointermove = e => {
            IE_DOCK.lay[lk][ci] = ieClamp(Math.round(w0 + (e.clientX - x0) * (lado === 'esq' ? 1 : -1)), 180, 600);
            b.parentNode.style.width = IE_DOCK.lay[lk][ci] + 'px';
            ieEl('ie').style.setProperty(lado === 'esq' ? '--ie-esq-w' : '--ie-dir-w', IE_DOCK.lay[lk].reduce((a, c) => a + c + 1, 0) + 'px');
        };
        b.onpointerup = () => { b.onpointermove = null; ieDockGravar(); ieDesenharVista(); ieDesenharSobre(); ieJanAtualizar?.(); };
    });
}

// divisória entre dois painéis: arrastar muda a altura do de cima
function ieDockDivisoria(d) {
    d.addEventListener('pointerdown', ev => {
        ev.preventDefault(); d.setPointerCapture(ev.pointerId);
        const id = d.dataset.acima, p = ieDockPainel(id), y0 = ev.clientY, h0 = p.getBoundingClientRect().height;
        d.onpointermove = e => { IE_DOCK.lay.alturas[id] = Math.max(60, Math.round(h0 + e.clientY - y0)); p.style.flex = `0 0 ${IE_DOCK.lay.alturas[id]}px`; };
        d.onpointerup = () => { d.onpointermove = null; ieDockGravar(); };
    });
    d.addEventListener('dblclick', () => { delete IE_DOCK.lay.alturas[d.dataset.acima]; ieDockAplicar(); });
}

function ieDockTirar(id) {
    const l = IE_DOCK.lay;
    for (const lado of ['esq', 'dir']) {
        const lk = lado === 'esq' ? 'largEsq' : 'largDir';
        for (const c of l[lado]) { const k = c.indexOf(id); if (k >= 0) c.splice(k, 1); }   // no lugar: quem guardou a coluna continua com ela
        for (let i = l[lado].length - 1; i >= 0; i--) if (!l[lado][i].length) { l[lado].splice(i, 1); l[lk].splice(i, 1); }   // coluna vazia some
    }
    delete l.soltos[id];
    l.fechados = l.fechados.filter(x => x !== id);
}
function ieDockRecolher(id) {
    const l = IE_DOCK.lay;
    l.recolhidos = l.recolhidos.includes(id) ? l.recolhidos.filter(x => x !== id) : [...l.recolhidos, id];
    ieDockAplicar();
}
function ieDockFechar(id) { ieDockTirar(id); IE_DOCK.lay.fechados.push(id); ieDockAplicar(); }
function ieDockAlternar(id) {
    const l = IE_DOCK.lay;
    if (l.fechados.includes(id)) {   // abre na coluna da direita mais perto da borda da janela
        ieDockTirar(id);
        if (!l.dir.length) { l.dir.push([]); l.largDir.push(IE_DOCK_LARG); }
        l.dir[l.dir.length - 1].push(id);
        l.recolhidos = l.recolhidos.filter(x => x !== id);
    } else ieDockFechar(id);
    ieDockAplicar();
}
function ieDockRedefinir() { IE_DOCK.lay = ieDockLer(true); ieDockAplicar(); }

// ─────────────────────────── arrastar pelo título ───────────────────────────
function ieDockArrIni(ev, id) {
    if (ev.button !== 0 || ev.target.closest('button')) return;
    ev.preventDefault();
    const p = ieDockPainel(id), r = p.getBoundingClientRect();
    IE_DOCK.arr = { id, x0: ev.clientX, y0: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top, w: r.width, h: Math.max(160, r.height), ativo: false };
    const mv = e => ieDockArrMove(e), up = e => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); ieDockArrFim(e); };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
}

// alvo: {lado, col, i} empilha na coluna; {lado, nova: k} cria coluna na posição k; com a marca (retângulo) para mostrar
function ieDockAlvo(ev) {
    const l = IE_DOCK.lay, x = ev.clientX, y = ev.clientY, BORDA = 30;
    const centro = document.querySelector('#ie .ie-centro').getBoundingClientRect();
    for (const lado of ['esq', 'dir']) {
        const cols = [...ieDockLado(lado).querySelectorAll('.ie-dock-col')];
        for (const col of cols) {
            const r = col.getBoundingClientRect(), ci = +col.dataset.col;
            if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
            if (x < r.left + BORDA) return { lado, nova: ci, marca: { left: r.left, top: r.top, width: 4, height: r.height } };
            if (x > r.right - BORDA) return { lado, nova: ci + 1, marca: { left: r.right - 4, top: r.top, width: 4, height: r.height } };
            const ids = l[lado][ci].filter(id => id !== IE_DOCK.arr.id);
            let i = ids.length;
            for (let k = 0; k < ids.length; k++) { const pr = ieDockPainel(ids[k]).getBoundingClientRect(); if (y < pr.top + pr.height / 2) { i = k; break; } }
            const yy = !ids.length ? r.top : i < ids.length ? ieDockPainel(ids[i]).getBoundingClientRect().top : ieDockPainel(ids[ids.length - 1]).getBoundingClientRect().bottom;
            return { lado, col: ci, i, marca: { left: r.left, top: yy - 2, width: r.width, height: 4 } };
        }
    }
    // faixas na borda da imagem: coluna nova colada à imagem
    if (y >= centro.top && y <= centro.bottom) {
        if (x >= centro.left && x <= centro.left + 48) return { lado: 'esq', nova: l.esq.length, marca: { left: centro.left, top: centro.top, width: 4, height: centro.height } };
        if (x <= centro.right && x >= centro.right - 48) return { lado: 'dir', nova: 0, marca: { left: centro.right - 4, top: centro.top, width: 4, height: centro.height } };
    }
    return null;
}

function ieDockArrMove(ev) {
    const a = IE_DOCK.arr;
    if (!a) return;
    if (!a.ativo && Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 6) return;
    const ie = ieEl('ie'), rb = ie.getBoundingClientRect();
    if (!a.ativo) {
        a.ativo = true;
        a.fantasma = document.createElement('div');
        a.fantasma.className = 'ie-dock-fantasma';
        a.fantasma.textContent = ieT(IE_DOCK_PAINEIS[a.id]);
        a.marca = document.createElement('div');
        a.marca.className = 'ie-dock-marca';
        ie.append(a.fantasma, a.marca);
    }
    a.alvo = ieDockAlvo(ev);
    Object.assign(a.fantasma.style, { left: ev.clientX - rb.left - a.dx + 'px', top: ev.clientY - rb.top - a.dy + 'px', width: a.w + 'px', height: (a.alvo ? 30 : a.h) + 'px' });
    a.fantasma.classList.toggle('solto', !a.alvo);
    if (a.alvo) { const m = a.alvo.marca; Object.assign(a.marca.style, { display: 'block', left: m.left - rb.left + 'px', top: m.top - rb.top + 'px', width: m.width + 'px', height: m.height + 'px' }); }
    else a.marca.style.display = 'none';
}

function ieDockArrFim(ev) {
    const a = IE_DOCK.arr;
    IE_DOCK.arr = null;
    if (!a || !a.ativo) return;
    a.fantasma.remove(); a.marca.remove();
    const l = IE_DOCK.lay, rb = ieEl('ie').getBoundingClientRect();
    const alvo = a.alvo;
    let destinoCol = null;
    if (alvo && alvo.col !== undefined) destinoCol = l[alvo.lado][alvo.col];   // guarda a coluna antes de tirar (os índices mudam)
    const largura = Math.round(Math.max(200, Math.min(400, a.w)));
    ieDockTirar(a.id);
    if (alvo && destinoCol) {
        const ci = l[alvo.lado].indexOf(destinoCol);
        if (ci >= 0) destinoCol.splice(Math.min(alvo.i, destinoCol.length), 0, a.id);
        else { l[alvo.lado].push([a.id]); l[alvo.lado === 'esq' ? 'largEsq' : 'largDir'].push(largura); }
    } else if (alvo) {
        const lk = alvo.lado === 'esq' ? 'largEsq' : 'largDir', k = Math.min(alvo.nova, l[alvo.lado].length);
        l[alvo.lado].splice(k, 0, [a.id]); l[lk].splice(k, 0, largura);
    } else l.soltos[a.id] = {
        x: ieClamp(Math.round(ev.clientX - rb.left - a.dx), 0, rb.width - 120), y: ieClamp(Math.round(ev.clientY - rb.top - a.dy), 0, rb.height - 40),
        w: Math.round(Math.max(240, a.w)), h: Math.round(a.h),
    };
    ieDockAplicar();
}

// janela solta: redimensionar pelo canto (CSS resize) grava o tamanho
function ieDockObservar() {
    const ro = new ResizeObserver(ents => {
        const l = IE_DOCK.lay;
        if (!l) return;
        for (const e of ents) {
            const id = e.target.dataset.painel;
            if (id && l.soltos[id] && e.target.classList.contains('solto')) { l.soltos[id].w = Math.round(e.target.offsetWidth); l.soltos[id].h = Math.round(e.target.offsetHeight); }
        }
        clearTimeout(IE_DOCK.tGravar);
        IE_DOCK.tGravar = setTimeout(ieDockGravar, 300);
    });
    for (const id of Object.keys(IE_DOCK_PAINEIS)) { const p = ieDockPainel(id); if (p) ro.observe(p); }
}

Object.assign(IE_CMDS, {
    janelaProps: () => ieDockAlternar('props'),
    janelaCamadas: () => ieDockAlternar('camadas'),
    janelaHist: () => ieDockAlternar('hist'),
    janelaRedefinir: () => ieDockRedefinir(),
});
IE_MENUS.splice(IE_MENUS.length, 0, ['Janela', [['Propriedades', 'janelaProps'], ['Camadas', 'janelaCamadas', 'F7'], ['Histórico', 'janelaHist'], '-',
    ['Redefinir espaço de trabalho', 'janelaRedefinir']]]);
IE_ATALHOS.F7 = 'janelaCamadas';
