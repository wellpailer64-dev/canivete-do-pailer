// =========================================================
// Editor de Imagem — painéis móveis (como no Photoshop/Premiere): arrastar o título do painel para a outra coluna
// (esquerda ou direita), para cima/baixo de outro painel, ou para cima da imagem (vira janela solta). Duplo clique no
// título recolhe; × fecha (Janela no menu reabre); a divisória entre painéis e a borda da coluna mudam o tamanho.
// Layout nas preferências do editor (iePref 'paineis', %APPDATA%): {esq: [ids], dir: [ids], soltos: {id: {x, y, w, h}}, fechados: [ids],
// recolhidos: [ids], alturas: {id: px}, largEsq, largDir}.
// =========================================================

const IE_DOCK_PAINEIS = { props: 'Propriedades', camadas: 'Camadas', hist: 'Histórico' };
const IE_DOCK_PADRAO = { esq: [], dir: ['props', 'camadas', 'hist'], soltos: {}, fechados: [], recolhidos: [], alturas: {}, largEsq: 260, largDir: 292 };
const IE_DOCK = { lay: null, arr: null };

function ieDockLer() {
    const l0 = iePref('paineis', null);
    let l = l0 ? JSON.parse(JSON.stringify(l0)) : null;
    l = Object.assign(JSON.parse(JSON.stringify(IE_DOCK_PADRAO)), l || {});
    // painel novo (versão mais nova do app) ou perdido: volta para a direita
    const todos = new Set([...l.esq, ...l.dir, ...Object.keys(l.soltos), ...l.fechados]);
    for (const id of Object.keys(IE_DOCK_PAINEIS)) if (!todos.has(id)) l.dir.push(id);
    for (const k of ['esq', 'dir']) l[k] = l[k].filter(id => IE_DOCK_PAINEIS[id]);
    return l;
}
function ieDockGravar() { iePrefGravar('paineis', JSON.parse(JSON.stringify(IE_DOCK.lay))); }
const ieDockPainel = id => ieEl('ie-p-' + id);

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
    // bordas das colunas: arrastar muda a largura
    for (const lado of ['esq', 'dir']) {
        const b = document.createElement('div');
        b.className = 'ie-dock-borda ie-dock-borda-' + lado;
        b.title = ieT('Arrastar: largura dos painéis');
        ieDockColuna(lado).appendChild(b);
        b.addEventListener('pointerdown', ev => {
            ev.preventDefault(); b.setPointerCapture(ev.pointerId);
            const x0 = ev.clientX, w0 = IE_DOCK.lay[lado === 'esq' ? 'largEsq' : 'largDir'];
            b.onpointermove = e => {
                const d = (e.clientX - x0) * (lado === 'esq' ? 1 : -1);
                IE_DOCK.lay[lado === 'esq' ? 'largEsq' : 'largDir'] = ieClamp(Math.round(w0 + d), 200, 560);
                ieDockAplicar(false);
            };
            b.onpointerup = () => { b.onpointermove = null; ieDockGravar(); };
        });
    }
    ieDockAplicar();
}

const ieDockColuna = lado => ieEl(lado === 'esq' ? 'ie-paineis-esq' : 'ie-paineis');

// põe cada painel no lugar do layout
function ieDockAplicar(gravar = true) {
    const l = IE_DOCK.lay, ie = ieEl('ie');
    if (!l || !ie) return;
    for (const lado of ['esq', 'dir']) {
        const col = ieDockColuna(lado), borda = col.querySelector('.ie-dock-borda');
        col.querySelectorAll('.ie-dock-div').forEach(d => d.remove());
        l[lado].forEach((id, i) => {
            const p = ieDockPainel(id);
            p.classList.remove('solto');
            p.style.left = p.style.top = p.style.width = p.style.height = '';
            if (i) { const d = document.createElement('div'); d.className = 'ie-dock-div'; d.dataset.acima = l[lado][i - 1]; col.insertBefore(d, borda); ieDockDivisoria(d); }
            col.insertBefore(p, borda);
            p.classList.toggle('ultimo', i === l[lado].length - 1);   // o último ocupa o resto da coluna
        });
        col.classList.toggle('vazia', !l[lado].length);
    }
    ie.style.setProperty('--ie-esq-w', l.esq.length ? l.largEsq + 'px' : '0px');
    ie.style.setProperty('--ie-dir-w', l.dir.length ? l.largDir + 'px' : '0px');
    for (const [id, r] of Object.entries(l.soltos)) {
        const p = ieDockPainel(id);
        p.classList.add('solto');
        ie.appendChild(p);
        Object.assign(p.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    }
    for (const id of Object.keys(IE_DOCK_PAINEIS)) {
        const p = ieDockPainel(id);
        p.hidden = l.fechados.includes(id);
        p.classList.toggle('recolhido', l.recolhidos.includes(id));
        const h = l.alturas[id];
        p.style.flex = !l.soltos[id] && h && !l.recolhidos.includes(id) ? `0 0 ${h}px` : '';
    }
    if (gravar) ieDockGravar();
    ieDesenharVista?.(); ieDesenharSobre?.();
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
    l.esq = l.esq.filter(x => x !== id); l.dir = l.dir.filter(x => x !== id);
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
    if (l.fechados.includes(id)) { ieDockTirar(id); l.dir.push(id); l.recolhidos = l.recolhidos.filter(x => x !== id); }
    else ieDockFechar(id);
    ieDockAplicar();
}
function ieDockRedefinir() { IE_DOCK.lay = JSON.parse(JSON.stringify(IE_DOCK_PADRAO)); ieDockAplicar(); }

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

function ieDockAlvo(ev) {
    // coluna sob o ponteiro (ou a faixa da borda da área central, para criar a coluna vazia)
    const centro = document.querySelector('#ie .ie-centro').getBoundingClientRect();
    for (const lado of ['esq', 'dir']) {
        const col = ieDockColuna(lado);
        let r = col.getBoundingClientRect();
        const vazia = !IE_DOCK.lay[lado].filter(x => x !== IE_DOCK.arr.id).length;
        if (vazia) r = lado === 'esq' ? { left: centro.left, right: centro.left + 48, top: centro.top, bottom: centro.bottom } : { left: centro.right - 48, right: centro.right, top: centro.top, bottom: centro.bottom };
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
            const ids = IE_DOCK.lay[lado].filter(x => x !== IE_DOCK.arr.id);
            let i = ids.length;
            for (let k = 0; k < ids.length; k++) {
                const pr = ieDockPainel(ids[k]).getBoundingClientRect();
                if (ev.clientY < pr.top + pr.height / 2) { i = k; break; }
            }
            let y;
            if (!ids.length) y = r.top;
            else if (i < ids.length) y = ieDockPainel(ids[i]).getBoundingClientRect().top;
            else y = ieDockPainel(ids[ids.length - 1]).getBoundingClientRect().bottom;
            return { lado, i, r, y };
        }
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
    if (a.alvo) Object.assign(a.marca.style, { display: 'block', left: a.alvo.r.left - rb.left + 'px', width: a.alvo.r.right - a.alvo.r.left + 'px', top: a.alvo.y - rb.top - 2 + 'px' });
    else a.marca.style.display = 'none';
}

function ieDockArrFim(ev) {
    const a = IE_DOCK.arr;
    IE_DOCK.arr = null;
    if (!a || !a.ativo) return;
    a.fantasma.remove(); a.marca.remove();
    const l = IE_DOCK.lay, rb = ieEl('ie').getBoundingClientRect();
    ieDockTirar(a.id);
    if (a.alvo) l[a.alvo.lado].splice(a.alvo.i, 0, a.id);
    else l.soltos[a.id] = {
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
