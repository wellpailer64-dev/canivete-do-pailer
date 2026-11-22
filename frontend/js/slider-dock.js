// =========================================================
// Slider — painéis móveis (como no Photo): colunas à esquerda/direita da mesa; cada coluna é uma pilha de grupos
// e cada grupo tem abas. Arrastar uma aba: na barra de abas ou no meio de outro grupo = junta ao grupo; no terço de
// cima/baixo = grupo novo acima/abaixo; na borda de uma coluna = coluna nova ao lado; na borda da mesa = coluna nova.
// Divisória entre grupos muda a altura; borda da coluna muda a largura. Layout no localStorage 'sd_dock'.
// =========================================================
function sdDockNomes() { return { design: 'Design', efeitos: 'Efeitos', cores: 'Cores', camadas: 'Camadas' }; }
function sdDockElId(id) { return { design: 'sd-props', efeitos: 'sd-efeitos', cores: 'sd-cores', camadas: 'sd-camadas' }[id]; }
function sdDockPadrao() { return { esq: [], dir: [[{ abas: ['design', 'efeitos', 'cores'], on: 'design' }, { abas: ['camadas'], on: 'camadas', h: 300 }]], larg: { esq: [], dir: [290] } }; }
function sdDockLer() {
    let l = null; try { l = JSON.parse(localStorage.getItem('sd_dock') || 'null'); } catch (e) { /* padrão */ }
    if (!l || !l.dir || !l.esq || !l.larg) l = sdDockPadrao();
    const N = sdDockNomes(), visto = new Set();
    for (const lado of ['esq', 'dir']) {
        l.larg[lado] = l.larg[lado] || [];
        l[lado] = l[lado].map((col, ci) => (col || []).map(g => ({ ...g, abas: (g.abas || []).filter(id => N[id] && !visto.has(id) && visto.add(id)) })).filter(g => g.abas.length));
        l.larg[lado] = l[lado].map((c, ci) => Math.min(600, Math.max(200, +l.larg[lado][ci] || 290)));
        const keep = l[lado].map(c => c.length > 0); l[lado] = l[lado].filter((c, i) => keep[i]); l.larg[lado] = l.larg[lado].filter((c, i) => keep[i]);
    }
    for (const id of Object.keys(N)) if (!visto.has(id)) {   // painel novo: entra no primeiro grupo da direita
        if (!l.dir.length) { l.dir.push([{ abas: [], on: id }]); l.larg.dir.push(290); }
        l.dir[0][0].abas.push(id);
    }
    for (const g of [...l.esq.flat(), ...l.dir.flat()]) if (!g.abas.includes(g.on)) g.on = g.abas[0];
    return l;
}
function sdDockGravar() { try { localStorage.setItem('sd_dock', JSON.stringify(SDU.dock)); } catch (e) { /* ok */ } }
function sdDockGrupos() { const l = SDU.dock; return l ? [...l.esq.flat(), ...l.dir.flat()] : []; }
function sdDockVisivel(id) { return sdDockGrupos().some(g => g.on === id); }
function sdDockAtivar(id) { const g = sdDockGrupos().find(g => g.abas.includes(id)); if (g) { g.on = id; SDU.aba = id; sdDockAplicar(); } }
function sdDockRedefinir() { SDU.dock = sdDockPadrao(); sdDockAplicar(); }

function sdDockAplicar() {
    const corpo = document.querySelector('#sd .sd-corpo'), mesa = sdEl('sd-mesa'); if (!corpo || !mesa) return;
    if (!SDU.dock) SDU.dock = sdDockLer();
    const l = SDU.dock, N = sdDockNomes(), guarda = document.createDocumentFragment();
    for (const id of Object.keys(N)) { const p = sdEl(sdDockElId(id)) || (SDU.dockEl || {})[id]; if (p) { (SDU.dockEl = SDU.dockEl || {})[id] = p; guarda.appendChild(p); } }
    corpo.querySelectorAll(':scope > .sd-lado, :scope > .sd-dock-lado').forEach(x => x.remove());
    const tam = {};
    for (const lado of ['esq', 'dir']) {
        const box = document.createElement('div'); box.className = 'sd-dock-lado ' + lado; box.dataset.lado = lado;
        l[lado].forEach((col, ci) => {
            const cd = document.createElement('div'); cd.className = 'sd-dock-col'; cd.style.width = l.larg[lado][ci] + 'px'; cd.dataset.lado = lado; cd.dataset.col = ci;
            col.forEach((g, gi) => {
                if (gi) { const d = document.createElement('div'); d.className = 'sd-dock-div'; cd.appendChild(d); sdDockDivisoria(d, col[gi - 1], cd); }
                const gd = document.createElement('div'); gd.className = 'sd-dock-gr'; gd._g = g;
                const livre = col.findIndex(x => !x.h) < 0 ? col.length - 1 : col.findIndex(x => !x.h); gd.style.flex = g.h && gi !== livre ? `0 0 ${g.h}px` : '1 1 0';
                const ab = document.createElement('div'); ab.className = 'sd-abas';
                for (const id of g.abas) {
                    const b = document.createElement('button'); b.textContent = N[id]; b.dataset.dk = id; b.className = id === g.on ? 'on' : ''; b.title = 'Clique: mostrar · arraste: mover o painel';
                    b.addEventListener('pointerdown', ev => sdDockArrIni(ev, id));
                    ab.appendChild(b);
                }
                gd.appendChild(ab);
                for (const id of g.abas) { const p = SDU.dockEl[id]; if (p) { p.hidden = id !== g.on; gd.appendChild(p); } }
                cd.appendChild(gd);
            });
            const bo = document.createElement('div'); bo.className = 'sd-dock-borda ' + lado; bo.title = 'Arrastar: largura'; cd.appendChild(bo); sdDockBorda(bo, lado, ci);
            box.appendChild(cd);
        });
        tam[lado] = l.larg[lado].reduce((a, b) => a + b, 0);
        if (lado === 'esq') corpo.insertBefore(box, mesa); else corpo.appendChild(box);
    }
    corpo.style.gridTemplateColumns = `216px ${tam.esq}px 1fr ${tam.dir}px`;
    const on = sdDockGrupos().map(g => g.on); if (!on.includes(SDU.aba)) SDU.aba = on[0] || 'design';
    sdDockGravar(); sdRenderPaineis(); if (typeof sdAjustarZoom === 'function') sdAjustarZoom(); else if (typeof sdRenderMesa === 'function') sdRenderMesa();
}
function sdDockBorda(b, lado, ci) {
    b.addEventListener('pointerdown', ev => {
        ev.preventDefault(); b.setPointerCapture(ev.pointerId); const x0 = ev.clientX, w0 = SDU.dock.larg[lado][ci], corpo = document.querySelector('#sd .sd-corpo');
        b.onpointermove = e => {
            SDU.dock.larg[lado][ci] = Math.min(600, Math.max(200, Math.round(w0 + (e.clientX - x0) * (lado === 'esq' ? 1 : -1)))); b.parentNode.style.width = SDU.dock.larg[lado][ci] + 'px';
            const t = s => SDU.dock.larg[s].reduce((a, c) => a + c, 0); corpo.style.gridTemplateColumns = `216px ${t('esq')}px 1fr ${t('dir')}px`;
        };
        b.onpointerup = () => { b.onpointermove = null; sdDockGravar(); if (typeof sdRenderMesa === 'function') sdRenderMesa(); };
    });
}
function sdDockDivisoria(d, gCima, cd) {
    d.addEventListener('pointerdown', ev => {
        ev.preventDefault(); d.setPointerCapture(ev.pointerId); const el = d.previousElementSibling, ba = d.nextElementSibling, y0 = ev.clientY, h0 = el.getBoundingClientRect().height, hb = ba.getBoundingClientRect().height;
        const usaBaixo = ba._g.h && !gCima.h, g = usaBaixo ? ba._g : gCima, alvo = usaBaixo ? ba : el;   // muda quem tem altura fixa
        d.onpointermove = e => { const dy = e.clientY - y0; g.h = Math.max(80, Math.min(cd.clientHeight - 80, Math.round(usaBaixo ? hb - dy : h0 + dy))); alvo.style.flex = `0 0 ${g.h}px`; };
        d.onpointerup = () => { d.onpointermove = null; sdDockGravar(); };
    });
    d.addEventListener('dblclick', () => { delete gCima.h; delete d.nextElementSibling._g.h; sdDockAplicar(); });
}
function sdDockTirar(id) {
    const l = SDU.dock;
    for (const lado of ['esq', 'dir']) {
        for (const col of l[lado]) for (const g of col) { const k = g.abas.indexOf(id); if (k >= 0) { g.abas.splice(k, 1); if (g.on === id) g.on = g.abas[0]; } }
        l[lado] = l[lado].map(col => col.filter(g => g.abas.length));
        for (let i = l[lado].length - 1; i >= 0; i--) if (!l[lado][i].length) { l[lado].splice(i, 1); l.larg[lado].splice(i, 1); }
    }
}
// ───── arrastar a aba ─────
function sdDockArrIni(ev, id) {
    if (ev.button !== 0) return;
    const a = SDU.dockArr = { id, x0: ev.clientX, y0: ev.clientY, ativo: false };
    const mv = e => sdDockArrMove(e), up = e => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); sdDockArrFim(e); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function sdDockAlvo(ev) {
    const x = ev.clientX, y = ev.clientY, B = 26, id = SDU.dockArr.id;
    for (const cd of document.querySelectorAll('#sd .sd-dock-col')) {
        const r = cd.getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const lado = cd.dataset.lado, ci = +cd.dataset.col;
        if (x < r.left + B) return { lado, nova: ci, m: [r.left, r.top, 4, r.height] };
        if (x > r.right - B) return { lado, nova: ci + 1, m: [r.right - 4, r.top, 4, r.height] };
        for (const gd of cd.querySelectorAll('.sd-dock-gr')) {
            const g = gd._g, q = gd.getBoundingClientRect(); if (y < q.top || y > q.bottom) continue;
            const ab = gd.querySelector('.sd-abas').getBoundingClientRect(), so = g.abas.length === 1 && g.abas[0] === id;
            if (y <= ab.bottom || (y > q.top + q.height * .3 && y < q.bottom - q.height * .3)) return so ? null : { g, m: [q.left, q.top, q.width, q.height], cheio: 1 };
            const cima = y < q.top + q.height / 2;
            return { col: SDU.dock[lado][ci], g, cima, m: [q.left, cima ? q.top - 2 : q.bottom - 2, q.width, 4] };
        }
    }
    const me = sdEl('sd-mesa').getBoundingClientRect();
    if (y > me.top && y < me.bottom) {
        if (x > me.left && x < me.left + 60) return { lado: 'esq', nova: SDU.dock.esq.length, m: [me.left, me.top, 4, me.height] };
        if (x < me.right && x > me.right - 60) return { lado: 'dir', nova: 0, m: [me.right - 4, me.top, 4, me.height] };
    }
    return null;
}
function sdDockArrMove(ev) {
    const a = SDU.dockArr; if (!a) return;
    if (!a.ativo) { if (Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 6) return; a.ativo = true; a.marca = document.createElement('div'); a.marca.className = 'sd-dock-marca'; document.body.appendChild(a.marca); document.body.style.cursor = 'grabbing'; }
    a.alvo = sdDockAlvo(ev); const m = a.alvo && a.alvo.m;
    Object.assign(a.marca.style, m ? { display: 'block', left: m[0] + 'px', top: m[1] + 'px', width: m[2] + 'px', height: m[3] + 'px', opacity: a.alvo.cheio ? .25 : 1 } : { display: 'none' });
}
function sdDockArrFim() {
    const a = SDU.dockArr; SDU.dockArr = null; if (!a) return;
    if (!a.ativo) { sdDockAtivar(a.id); return; }   // clique simples: mostra a aba
    a.marca.remove(); document.body.style.cursor = '';
    const t = a.alvo; if (!t) return;
    const l = SDU.dock;
    sdDockTirar(a.id);
    if (t.cheio) { if (!t.g.abas.length) return sdDockAplicar(); t.g.abas.push(a.id); t.g.on = a.id; }
    else if (t.col) {
        const lado = l.esq.includes(t.col) ? 'esq' : l.dir.includes(t.col) ? 'dir' : null;
        const k = t.col.indexOf(t.g), novo = { abas: [a.id], on: a.id };
        if (lado && k >= 0) t.col.splice(t.cima ? k : k + 1, 0, novo); else { l.dir.push([novo]); l.larg.dir.push(290); }
    } else { const k = Math.min(t.nova, l[t.lado].length); l[t.lado].splice(k, 0, [{ abas: [a.id], on: a.id }]); l.larg[t.lado].splice(k, 0, 280); }
    SDU.aba = a.id; sdDockAplicar();
}
