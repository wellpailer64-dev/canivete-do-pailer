// =========================================================
// Sound Kanivete — painéis móveis, o mesmo mecanismo do Photo/Vetor (imagem-dock.js, vetor-dock.js) e as mesmas
// classes visuais. Cada ferramenta é um painel: Mídia, Sons, Texto para Voz, Gravar, Clipe, Faixa, Transcrição,
// Exportar. Colunas à esquerda e à direita do Monitor + timeline; cada coluna, uma pilha. Arrastar o título: em
// cima/embaixo de outro = empilha; borda esquerda/direita de uma coluna = coluna nova; perto da borda do centro = coluna
// nova colada; faixa de cima do Monitor, a divisória Monitor/timeline e o pé da timeline = áreas horizontais (cima, meio,
// baixo: painéis lado a lado, altura pela borda); sobre o centro = janela solta. Duplo clique recolhe; × fecha (botão
// Painéis reabre); divisórias mudam altura e largura. Layout em iePref('sk_paineis') (%APPDATA%, como o do Photo e do Vetor).
// Os painéis renderizam pelas funções skUi*(el) (som-paineis.js, som-gravar.js), cada uma no corpo do seu painel.
// =========================================================
const SK_DOCK_PAINEIS = { midia: 'Mídia', sons: 'Sons', tts: 'Texto para Voz', gravar: 'Gravar', clipe: 'Clipe', faixa: 'Faixa', texto: 'Transcrição', exportar: 'Exportar' };
const SK_DOCK_REND = { midia: el => skUiMidia(el), sons: el => skUiSons(el), tts: el => skUiTts(el), gravar: el => skUiGravar(el),
    clipe: el => skUiClipe(el), faixa: el => skUiFaixa(el), texto: el => skUiTexto(el), exportar: el => skUiExportar(el) };
const SK_DOCK_PRECISA_PROJ = ['clipe', 'faixa', 'texto', 'exportar'];
const SK_DOCK_H = ['cima', 'meio', 'baixo'];   // áreas horizontais no centro
const SK_DOCK_PADRAO = { esq: [['midia', 'sons']], dir: [['clipe', 'faixa'], ['exportar', 'gravar']], largEsq: [290], largDir: [300, 290],
    cima: [], meio: [], baixo: ['tts'], altH: { cima: 220, meio: 240, baixo: 330 },
    soltos: {}, fechados: ['texto'], recolhidos: ['sons', 'gravar'], alturas: {} };
const SK_DOCK = { lay: null, arr: null, el: {} };
const SK_DOCK_LARG = 290;
const skClampD = (v, a, b) => Math.max(a, Math.min(b, v));

function skDockNormalizar(l) {
    l = Object.assign(JSON.parse(JSON.stringify(SK_DOCK_PADRAO)), l ? JSON.parse(JSON.stringify(l)) : {});
    for (const lado of ['esq', 'dir']) {
        const lk = lado === 'esq' ? 'largEsq' : 'largDir', larg = Array.isArray(l[lk]) ? l[lk] : [], out = [], outL = [];
        (l[lado] || []).forEach((c, i) => { const ids = (c || []).filter(id => SK_DOCK_PAINEIS[id]); if (ids.length) { out.push(ids); outL.push(skClampD(+larg[i] || SK_DOCK_LARG, 200, 560)); } });
        l[lado] = out; l[lk] = outL;
    }
    for (const h of SK_DOCK_H) l[h] = (l[h] || []).filter(id => SK_DOCK_PAINEIS[id]);
    l.altH = Object.assign({ cima: 220, meio: 240, baixo: 330 }, l.altH || {});
    l.soltos = Object.fromEntries(Object.entries(l.soltos || {}).filter(([id]) => SK_DOCK_PAINEIS[id]));
    l.fechados = (l.fechados || []).filter(id => SK_DOCK_PAINEIS[id]);
    l.recolhidos = (l.recolhidos || []).filter(id => SK_DOCK_PAINEIS[id]);
    const todos = new Set([...l.esq.flat(), ...l.dir.flat(), ...SK_DOCK_H.flatMap(h => l[h]), ...Object.keys(l.soltos), ...l.fechados]);
    for (const id of Object.keys(SK_DOCK_PAINEIS)) if (!todos.has(id)) l.fechados.push(id);
    return l;
}
const skDockPref = () => (typeof iePref === 'function' ? iePref('sk_paineis', null) : null);
// só grava depois de carregar as preferências: o iePrefGravar salva o arquivo INTEIRO (apagaria as do Photo)
function skDockGravar() { if (SK_DOCK.prefsOk && typeof iePrefGravar === 'function') iePrefGravar('sk_paineis', JSON.parse(JSON.stringify(SK_DOCK.lay))); }
const skDockPainel = id => SK_DOCK.el[id];
const skDockLado = lado => skEl(lado === 'esq' ? 'sk-dock-esq' : 'sk-dock-dir');

function skDockInstalar() {
    if (SK_DOCK.lay || !skEl('sk-dock-dir')) return;
    for (const id of Object.keys(SK_DOCK_PAINEIS)) {
        const s = document.createElement('section');
        s.className = 'ie-painel sk-pnl'; s.dataset.painel = id;
        s.innerHTML = `<header class="ie-painel-cab notranslate" translate="no"><span class="ie-dock-tit">${SK_DOCK_PAINEIS[id]}</span>
            <button class="ie-dock-btn" data-dock="recolher" title="Recolher (duplo clique no título)">▾</button>
            <button class="ie-dock-btn" data-dock="fechar" title="Fechar (o botão Painéis reabre)">×</button></header>
            <div class="ie-painel-corpo sk-pn-corpo" id="sk-p-${id}"></div>`;
        const cab = s.querySelector('.ie-painel-cab');
        cab.addEventListener('pointerdown', ev => skDockArrIni(ev, id));
        cab.addEventListener('dblclick', ev => { if (!ev.target.closest('button')) skDockRecolher(id); });
        cab.querySelector('[data-dock=recolher]').onclick = () => skDockRecolher(id);
        cab.querySelector('[data-dock=fechar]').onclick = () => skDockFechar(id);
        SK_DOCK.el[id] = s;
    }
    SK_DOCK.lay = skDockNormalizar(skDockPref());
    skDockObservar();
    skDockAplicar(false);
    const pronto = () => { SK_DOCK.prefsOk = true; const p = skDockPref(); if (p) { SK_DOCK.lay = skDockNormalizar(p); skDockAplicar(false); } };
    if (typeof iePrefsCarregar === 'function' && !(window.IE && IE.prefs && Object.keys(IE.prefs).length)) iePrefsCarregar().then(pronto, pronto); else pronto();
}
const skDockVisivel = id => { const l = SK_DOCK.lay; return !!l && !l.fechados.includes(id) && !l.recolhidos.includes(id); };
function skDockRenderUm(id) {
    const el = skEl('sk-p-' + id); if (!el) return;
    if (!skDockVisivel(id)) return;
    if (!SK.proj && SK_DOCK_PRECISA_PROJ.includes(id)) { el.onclick = el.oninput = el.onchange = null; el.innerHTML = '<div class="sk-p-info">Abra ou crie um projeto.</div>'; return; }
    try { SK_DOCK_REND[id](el); } catch (e) { console.error(e); }
}
function skDockRender(ids = Object.keys(SK_DOCK_PAINEIS)) { for (const id of ids) skDockRenderUm(id); }
function skDockMostrar(id) {   // alguém pediu um painel (Ctrl+E, Transcrever...): abre, desdobra e desenha
    const l = SK_DOCK.lay; if (!l) return;
    if (l.fechados.includes(id)) skDockAbrir(id);
    else if (l.recolhidos.includes(id)) { l.recolhidos = l.recolhidos.filter(x => x !== id); skDockAplicar(); }
    else skDockRenderUm(id);
    skDockPainel(id)?.scrollIntoView?.({ block: 'nearest' });
}

function skDockAplicar(gravar = true) {
    const l = SK_DOCK.lay, raiz = skEl('sk');
    if (!l || !raiz) return;
    const guarda = document.createDocumentFragment();
    for (const id of Object.keys(SK_DOCK_PAINEIS)) guarda.appendChild(skDockPainel(id));
    for (const lado of ['esq', 'dir']) {
        const box = skDockLado(lado), lk = lado === 'esq' ? 'largEsq' : 'largDir';
        box.innerHTML = '';
        l[lado].forEach((ids, ci) => {
            const col = document.createElement('div');
            col.className = 'ie-dock-col'; col.dataset.lado = lado; col.dataset.col = ci; col.style.width = l[lk][ci] + 'px';
            const abertos = ids.filter(id => !l.recolhidos.includes(id));
            const cresce = abertos.find(id => !l.alturas[id]) || abertos[abertos.length - 1];
            ids.forEach((id, i) => {
                const p = skDockPainel(id);
                p.classList.remove('solto'); p.style.left = p.style.top = p.style.width = p.style.height = '';
                if (i) { const d = document.createElement('div'); d.className = 'ie-dock-div'; d.dataset.acima = ids[i - 1]; col.appendChild(d); skDockDivisoria(d); }
                col.appendChild(p); p.classList.toggle('ultimo', id === cresce);
            });
            const b = document.createElement('div');
            b.className = 'ie-dock-borda ie-dock-borda-' + lado; b.title = 'Arrastar: largura da coluna';
            col.appendChild(b); skDockBorda(b, lado, ci);
            box.appendChild(col);
        });
        box.classList.toggle('vazia', !l[lado].length);
    }
    for (const h of SK_DOCK_H) {   // áreas horizontais: painéis lado a lado
        const box = skEl('sk-dock-' + h); if (!box) continue;
        box.innerHTML = ''; box.hidden = !l[h].length;
        box.style.height = l.altH[h] + 'px';
        l[h].forEach((id, i) => {
            const p = skDockPainel(id);
            p.classList.remove('solto', 'ultimo'); p.style.left = p.style.top = p.style.width = p.style.height = '';
            if (i) box.appendChild(Object.assign(document.createElement('div'), { className: 'sk-dockh-sep' }));
            box.appendChild(p);
        });
        const al = Object.assign(document.createElement('div'), { className: 'sk-dockh-alt sk-dockh-alt-' + (h === 'cima' ? 'baixo' : 'cima'), title: 'Arrastar: altura da área' });
        box.appendChild(al); skDockAlturaH(al, h);
    }
    for (const [id, r] of Object.entries(l.soltos)) {
        const p = skDockPainel(id);
        p.classList.add('solto'); raiz.appendChild(p);
        Object.assign(p.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    }
    for (const id of Object.keys(SK_DOCK_PAINEIS)) {
        const p = skDockPainel(id);
        if (!p.parentNode || p.parentNode === guarda) skDockLado('dir').appendChild(p);
        p.hidden = l.fechados.includes(id);
        p.classList.toggle('recolhido', l.recolhidos.includes(id));
        const h = l.alturas[id];
        p.style.flex = !l.soltos[id] && h && !l.recolhidos.includes(id) && !p.classList.contains('ultimo') ? `0 0 ${h}px` : '';
    }
    if (gravar) skDockGravar();
    skDockRender();
    skUiMenuPaineis();
    requestAnimationFrame(() => { skDesenhar(); skUiMonitor(); });
}
function skDockBorda(b, lado, ci) {
    b.addEventListener('pointerdown', ev => {
        ev.preventDefault(); b.setPointerCapture(ev.pointerId);
        const lk = lado === 'esq' ? 'largEsq' : 'largDir', x0 = ev.clientX, w0 = SK_DOCK.lay[lk][ci];
        b.onpointermove = e => { SK_DOCK.lay[lk][ci] = skClampD(Math.round(w0 + (e.clientX - x0) * (lado === 'esq' ? 1 : -1)), 200, 560); b.parentNode.style.width = SK_DOCK.lay[lk][ci] + 'px'; skDesenhar(); };
        b.onpointerup = () => { b.onpointermove = null; skDockGravar(); skDesenhar(); skUiMonitor(); };
    });
}
function skDockAlturaH(al, h) {
    al.addEventListener('pointerdown', ev => {
        ev.preventDefault(); al.setPointerCapture(ev.pointerId);
        const y0 = ev.clientY, h0 = SK_DOCK.lay.altH[h], box = al.parentNode, sinal = h === 'cima' ? 1 : -1;
        al.onpointermove = e => { SK_DOCK.lay.altH[h] = skClampD(Math.round(h0 + sinal * (e.clientY - y0)), 90, 700); box.style.height = SK_DOCK.lay.altH[h] + 'px'; skDesenhar(); };
        al.onpointerup = () => { al.onpointermove = null; skDockGravar(); skDesenhar(); skUiMonitor(); };
    });
}
function skDockDivisoria(d) {
    d.addEventListener('pointerdown', ev => {
        ev.preventDefault(); d.setPointerCapture(ev.pointerId);
        const cima = skDockPainel(d.dataset.acima), baixo = d.nextElementSibling;
        const usarBaixo = cima.classList.contains('ultimo') && baixo && baixo.dataset.painel;
        const p = usarBaixo ? baixo : cima, id = p.dataset.painel, y0 = ev.clientY, h0 = p.getBoundingClientRect().height, sinal = usarBaixo ? -1 : 1;
        d.onpointermove = e => { SK_DOCK.lay.alturas[id] = Math.max(60, Math.round(h0 + sinal * (e.clientY - y0))); p.style.flex = `0 0 ${SK_DOCK.lay.alturas[id]}px`; };
        d.onpointerup = () => { d.onpointermove = null; skDockGravar(); skDockAplicar(); };
    });
    d.addEventListener('dblclick', () => { delete SK_DOCK.lay.alturas[d.dataset.acima]; skDockAplicar(); });
}
function skDockTirar(id) {
    const l = SK_DOCK.lay;
    for (const lado of ['esq', 'dir']) {
        const lk = lado === 'esq' ? 'largEsq' : 'largDir';
        for (const c of l[lado]) { const k = c.indexOf(id); if (k >= 0) c.splice(k, 1); }
        for (let i = l[lado].length - 1; i >= 0; i--) if (!l[lado][i].length) { l[lado].splice(i, 1); l[lk].splice(i, 1); }
    }
    for (const h of SK_DOCK_H) l[h] = l[h].filter(x => x !== id);
    delete l.soltos[id];
    l.fechados = l.fechados.filter(x => x !== id);
}
function skDockRecolher(id) { const l = SK_DOCK.lay; l.recolhidos = l.recolhidos.includes(id) ? l.recolhidos.filter(x => x !== id) : [...l.recolhidos, id]; skDockAplicar(); }
function skDockFechar(id) { skDockTirar(id); SK_DOCK.lay.fechados.push(id); skDockAplicar(); if (id === 'gravar' && typeof skMonitorarEntrada === 'function') skMonitorarEntrada(false); }
function skDockAbrir(id) {
    const l = SK_DOCK.lay;
    skDockTirar(id);
    if (!l.dir.length) { l.dir.push([]); l.largDir.push(SK_DOCK_LARG); }
    l.dir[l.dir.length - 1].push(id);
    l.recolhidos = l.recolhidos.filter(x => x !== id);
    skDockAplicar();
}
function skDockAlternar(id) { if (SK_DOCK.lay.fechados.includes(id)) skDockAbrir(id); else skDockFechar(id); }
function skDockRedefinir() { SK_DOCK.lay = skDockNormalizar(null); skDockAplicar(); }
function skUiMenuPaineis() {   // botão Painéis: abre/fecha cada um e redefine
    const m = skEl('sk-menu-pn'); if (!m || !SK_DOCK.lay) return;
    m.innerHTML = Object.entries(SK_DOCK_PAINEIS).map(([id, n]) => `<button data-pn="${id}" class="${SK_DOCK.lay.fechados.includes(id) ? '' : 'on'}">${n}</button>`).join('') + '<hr><button data-pn="__redefinir">Redefinir painéis</button>';
}

// ── arrastar pelo título ──
function skDockArrIni(ev, id) {
    if (ev.button !== 0 || ev.target.closest('button')) return;
    ev.preventDefault();
    const r = skDockPainel(id).getBoundingClientRect();
    SK_DOCK.arr = { id, x0: ev.clientX, y0: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top, w: r.width, h: Math.max(160, r.height), ativo: false };
    const mv = e => skDockArrMove(e), up = e => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); skDockArrFim(e); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
function skDockAlvo(ev) {
    const l = SK_DOCK.lay, x = ev.clientX, y = ev.clientY, BORDA = 30;
    const centro = skEl('sk-centro').getBoundingClientRect();
    for (const h of SK_DOCK_H) {   // dentro de uma área horizontal com painéis: entra antes/depois pelo x
        const box = skEl('sk-dock-' + h); if (!box || box.hidden) continue;
        const r = box.getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const ids = l[h].filter(id => id !== SK_DOCK.arr.id);
        let i = ids.length; for (let k = 0; k < ids.length; k++) { const pr = skDockPainel(ids[k]).getBoundingClientRect(); if (x < pr.left + pr.width / 2) { i = k; break; } }
        const xx = !ids.length ? r.left : i < ids.length ? skDockPainel(ids[i]).getBoundingClientRect().left : skDockPainel(ids[ids.length - 1]).getBoundingClientRect().right;
        return { area: h, i, marca: { left: xx - 2, top: r.top, width: 4, height: r.height } };
    }
    for (const lado of ['esq', 'dir']) {
        for (const col of skDockLado(lado).querySelectorAll('.ie-dock-col')) {
            const r = col.getBoundingClientRect(), ci = +col.dataset.col;
            if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
            if (x < r.left + BORDA) return { lado, nova: ci, marca: { left: r.left, top: r.top, width: 4, height: r.height } };
            if (x > r.right - BORDA) return { lado, nova: ci + 1, marca: { left: r.right - 4, top: r.top, width: 4, height: r.height } };
            const ids = l[lado][ci].filter(id => id !== SK_DOCK.arr.id);
            let i = ids.length;
            for (let k = 0; k < ids.length; k++) { const pr = skDockPainel(ids[k]).getBoundingClientRect(); if (y < pr.top + pr.height / 2) { i = k; break; } }
            const yy = !ids.length ? r.top : i < ids.length ? skDockPainel(ids[i]).getBoundingClientRect().top : skDockPainel(ids[ids.length - 1]).getBoundingClientRect().bottom;
            return { lado, col: ci, i, marca: { left: r.left, top: yy - 2, width: r.width, height: 4 } };
        }
    }
    if (y >= centro.top && y <= centro.bottom && x > centro.left + 48 && x < centro.right - 48) {   // faixas de encaixe no centro
        const mon = skEl('sk-centro').querySelector('.sk-monitor').getBoundingClientRect(), dv = skEl('sk-div').getBoundingClientRect(), tl = skEl('sk-centro').querySelector('.sk-corpo').getBoundingClientRect();
        const faixa = (h, top) => ({ area: h, i: l[h].length, marca: { left: centro.left, top, width: centro.width, height: 4 } });
        if (y <= mon.top + 36) return faixa('cima', mon.top);
        if (Math.abs(y - (dv.top + dv.height / 2)) <= 28) return faixa('meio', dv.top);
        if (y >= tl.bottom - 48) return faixa('baixo', tl.bottom - 4);
    }
    if (y >= centro.top && y <= centro.bottom) {
        if (x >= centro.left && x <= centro.left + 48) return { lado: 'esq', nova: l.esq.length, marca: { left: centro.left, top: centro.top, width: 4, height: centro.height } };
        if (x <= centro.right && x >= centro.right - 48) return { lado: 'dir', nova: 0, marca: { left: centro.right - 4, top: centro.top, width: 4, height: centro.height } };
    }
    return null;
}
function skDockArrMove(ev) {
    const a = SK_DOCK.arr;
    if (!a || (!a.ativo && Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 6)) return;
    const raiz = skEl('sk'), rb = raiz.getBoundingClientRect();
    if (!a.ativo) {
        a.ativo = true;
        a.fantasma = Object.assign(document.createElement('div'), { className: 'ie-dock-fantasma', textContent: SK_DOCK_PAINEIS[a.id] });
        a.marca = Object.assign(document.createElement('div'), { className: 'ie-dock-marca' });
        raiz.append(a.fantasma, a.marca);
    }
    a.alvo = skDockAlvo(ev);
    Object.assign(a.fantasma.style, { left: ev.clientX - rb.left - a.dx + 'px', top: ev.clientY - rb.top - a.dy + 'px', width: a.w + 'px', height: (a.alvo ? 30 : a.h) + 'px' });
    a.fantasma.classList.toggle('solto', !a.alvo);
    if (a.alvo) { const m = a.alvo.marca; Object.assign(a.marca.style, { display: 'block', left: m.left - rb.left + 'px', top: m.top - rb.top + 'px', width: m.width + 'px', height: m.height + 'px' }); }
    else a.marca.style.display = 'none';
}
function skDockArrFim(ev) {
    const a = SK_DOCK.arr;
    SK_DOCK.arr = null;
    if (!a || !a.ativo) return;
    a.fantasma.remove(); a.marca.remove();
    const l = SK_DOCK.lay, rb = skEl('sk').getBoundingClientRect(), alvo = a.alvo;
    const destinoCol = alvo && alvo.col !== undefined ? l[alvo.lado][alvo.col] : null;
    const largura = Math.round(Math.max(220, Math.min(400, a.w)));
    skDockTirar(a.id);
    if (alvo && alvo.area) l[alvo.area].splice(Math.min(alvo.i, l[alvo.area].length), 0, a.id);
    else if (alvo && destinoCol) {
        if (l[alvo.lado].indexOf(destinoCol) >= 0) destinoCol.splice(Math.min(alvo.i, destinoCol.length), 0, a.id);
        else { l[alvo.lado].push([a.id]); l[alvo.lado === 'esq' ? 'largEsq' : 'largDir'].push(largura); }
    } else if (alvo) {
        const lk = alvo.lado === 'esq' ? 'largEsq' : 'largDir', k = Math.min(alvo.nova, l[alvo.lado].length);
        l[alvo.lado].splice(k, 0, [a.id]); l[lk].splice(k, 0, largura);
    } else l.soltos[a.id] = {
        x: skClampD(Math.round(ev.clientX - rb.left - a.dx), 0, rb.width - 120), y: skClampD(Math.round(ev.clientY - rb.top - a.dy), 0, rb.height - 40),
        w: Math.round(Math.max(260, a.w)), h: Math.round(a.h),
    };
    skDockAplicar();
}
function skDockObservar() {
    const ro = new ResizeObserver(ents => {
        const l = SK_DOCK.lay; if (!l) return;
        for (const e of ents) { const id = e.target.dataset.painel; if (id && l.soltos[id] && e.target.classList.contains('solto')) { l.soltos[id].w = Math.round(e.target.offsetWidth); l.soltos[id].h = Math.round(e.target.offsetHeight); } }
        clearTimeout(SK_DOCK.tGravar); SK_DOCK.tGravar = setTimeout(skDockGravar, 300);
    });
    for (const id of Object.keys(SK_DOCK_PAINEIS)) ro.observe(skDockPainel(id));
}
