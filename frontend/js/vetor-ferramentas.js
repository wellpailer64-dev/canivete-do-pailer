// Vetor Kanivete — ferramentas de mouse e atalhos. Durante o arraste a mudança é só prévia; ao soltar, vira COMANDO
// (vkCmd: 'matriz', 'definir_subs', 'retangulo'...) — o mesmo caminho do Claude/Worker, com histórico.
const VK_FERR = {
    selecao: { nome: 'Seleção', tecla: 'V', cursor: 'default' }, direta: { nome: 'Seleção direta', tecla: 'A', cursor: 'default' },
    caneta: { nome: 'Caneta', tecla: 'P', cursor: 'crosshair' }, texto: { nome: 'Texto', tecla: 'T', cursor: 'text' },
    retangulo: { nome: 'Retângulo', tecla: 'M', cursor: 'crosshair' }, elipse: { nome: 'Elipse', tecla: 'L', cursor: 'crosshair' },
    poligono: { nome: 'Polígono', tecla: '', cursor: 'crosshair' }, estrela: { nome: 'Estrela', tecla: '', cursor: 'crosshair' },
    linha: { nome: 'Linha', tecla: '\\', cursor: 'crosshair' }, contagotas: { nome: 'Conta-gotas', tecla: 'I', cursor: 'copy' },
    prancheta: { nome: 'Prancheta', tecla: 'Shift+O', cursor: 'default' }, mao: { nome: 'Mão', tecla: 'H', cursor: 'grab' },
    zoom: { nome: 'Zoom', tecla: 'Z', cursor: 'zoom-in' },
    construtor: { nome: 'Construtor de formas (Alt = apagar)', tecla: 'Shift+M', cursor: 'crosshair' }, tesoura: { nome: 'Tesoura', tecla: 'C', cursor: 'crosshair' },
    faca: { nome: 'Faca', tecla: '', cursor: 'crosshair' },
};
const VK_OPC = { lados: 6, pontas: 5, raio: 0 };
let VKA = null;   // arraste em andamento
let VKG = [];     // guias inteligentes visíveis

// comando genérico de geometria (a Seleção direta e a Caneta terminam aqui; agentes também podem usar)
vkRegistrar('definir_subs', 'editar pontos', a => {
    const o = vkObj(a.id); if (!o || o.tipo !== 'caminho') throw new Error('definir_subs: id de um caminho');
    o.subs = vkClone(a.subs); return { id: o.id, pontos: o.subs.reduce((s, x) => s + x.pts.length, 0) };
});
vkRegistrar('mover_prancheta', 'mover prancheta', a => {
    const p = VK.doc.pranchetas.find(q => q.id === a.prancheta || q.nome === a.prancheta) || VK.doc.pranchetas.find(q => q.id === VK.ativa);
    const dx = a.un === 'pt' ? +a.dx : vkPT(+a.dx || 0), dy = a.un === 'pt' ? +a.dy : vkPT(+a.dy || 0);
    if (a.com_arte !== false) for (const c of VK.doc.camadas) for (const o of c.itens) { const b = vkBox(o); if (b[0] >= p.x - 0.5 && b[1] >= p.y - 0.5 && b[2] <= p.x + p.w + 0.5 && b[3] <= p.y + p.h + 0.5) vkTransformar(o, [1, 0, 0, 1, dx, dy]); }
    p.x += dx; p.y += dy; return { prancheta: p.nome };
});

function vkFerramenta(n) {
    if (!VK_FERR[n]) return;
    if (VK.ferr === 'caneta' && n !== 'caneta') vkCanetaFim();
    vkTextoFim();
    VK.ferr = n; VK.selPts = null;
    const cv = vkCanvas(); if (cv) cv.style.cursor = VK_FERR[n].cursor;
    vkUiAgendar(); vkDesenhar();
}
const vkSelObjs = () => VK.sel.map(vkObj).filter(Boolean);
const vkCmdUi = (n, a) => vkCmd(n, { un: 'pt', ...a }, 'ui').catch(e => vkToast(e.message));

// ── prévia: guardar e restaurar o estado dos objetos durante o arraste ──
function vkGuardar(objs) { return objs.map(o => [o, vkClone(o)]); }
function vkVoltar(g) { for (const [o, c] of g) { for (const k of Object.keys(o)) if (k[0] !== '_') delete o[k]; Object.assign(o, vkClone(c)); } }

// ── alças da seleção (tela) ──
function vkAlcas() {
    const b = vkBoxUniao(vkSelObjs()); if (!b) return null;
    const [x0, y0] = vkTela(b[0], b[1]), [x1, y1] = vkTela(b[2], b[3]);
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    return { b, r: [x0, y0, x1, y1], h: { nw: [x0, y0], n: [xm, y0], ne: [x1, y0], e: [x1, ym], se: [x1, y1], s: [xm, y1], sw: [x0, y1], w: [x0, ym] } };
}
function vkAlcaEm(sx, sy) {
    const A = vkAlcas(); if (!A) return null;
    for (const [k, [x, y]] of Object.entries(A.h)) if (Math.abs(sx - x) < 6 && Math.abs(sy - y) < 6) return { k, A };
    for (const k of ['nw', 'ne', 'se', 'sw']) { const [x, y] = A.h[k]; const d = Math.hypot(sx - x, sy - y); if (d >= 6 && d < 20) return { k: 'rot', A }; }
    return null;
}
// ── guias inteligentes: encaixe nas bordas/centros das pranchetas e de outros objetos ──
function vkEncaixe(b, excluir) {
    const tol = 6 / VK.vista.z, xs = [], ys = [];
    for (const p of VK.doc.pranchetas) { xs.push(p.x, p.x + p.w / 2, p.x + p.w); ys.push(p.y, p.y + p.h / 2, p.y + p.h); }
    let n = 0;
    for (const c of VK.doc.camadas) { if (c.visivel === false) continue; for (const o of c.itens) { if (excluir.has(o.id) || ++n > 400) continue; const q = vkBox(o); if (!isFinite(q[0])) continue; xs.push(q[0], (q[0] + q[2]) / 2, q[2]); ys.push(q[1], (q[1] + q[3]) / 2, q[3]); } }
    const melhor = (vals, alvos) => { let m = null; for (const v of vals) for (const t of alvos) { const d = t - v; if (Math.abs(d) <= tol && (!m || Math.abs(d) < Math.abs(m.d))) m = { d, t }; } return m; };
    const mx = melhor([b[0], (b[0] + b[2]) / 2, b[2]], xs), my = melhor([b[1], (b[1] + b[3]) / 2, b[3]], ys);
    VKG = []; if (mx) VKG.push({ eixo: 'x', pos: mx.t }); if (my) VKG.push({ eixo: 'y', pos: my.t });
    return [mx ? mx.d : 0, my ? my.d : 0];
}
// ── pontos (Seleção direta) ──
function vkPontoEm(sx, sy) {   // âncora ou alça de um caminho selecionado
    for (const o of vkSelObjs()) {
        if (o.tipo !== 'caminho') continue;
        for (let si = 0; si < o.subs.length; si++) for (let i = 0; i < o.subs[si].pts.length; i++) {
            const p = o.subs[si].pts[i];
            for (const [qual, ix] of [['a', 0], ['in', 2], ['out', 4]]) {
                if (qual !== 'a' && !(VK.selPts && VK.selPts[o.id] && VK.selPts[o.id].has(`${si}:${i}`))) continue;
                const [x, y] = vkTela(p[ix], p[ix + 1]); if (Math.abs(sx - x) < 5 && Math.abs(sy - y) < 5) return { o, si, i, qual };
            }
        }
    }
    return null;
}

function vkEventos() {
    const cv = vkCanvas(), vista = cv.parentElement;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    vista.addEventListener('wheel', e => {
        if (!VK.doc) return; e.preventDefault();
        const [sx, sy] = pos(e);
        if (e.ctrlKey || e.altKey) vkZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy);
        else { VK.vista.x -= e.shiftKey ? e.deltaY : e.deltaX; VK.vista.y -= e.shiftKey ? 0 : e.deltaY; vkDesenhar(); }
    }, { passive: false });
    cv.addEventListener('pointerdown', e => {
        if (!VK.doc) return;
        document.getElementById('vk').focus({ preventScroll: true });
        cv.setPointerCapture(e.pointerId);
        const [sx, sy] = pos(e), [x, y] = vkDoc(sx, sy);
        const f = (e.button === 1 || VK.espaco) ? 'mao' : VK.ferr;
        VKA = { f, sx, sy, x, y, alt: e.altKey, shift: e.shiftKey };
        if (f === 'mao') { VKA.vx = VK.vista.x; VKA.vy = VK.vista.y; return; }
        if (f === 'zoom') { vkZoom(e.altKey ? 1 / 1.5 : 1.5, sx, sy); VKA = null; return; }
        if (f === 'selecao') {
            const al = vkAlcaEm(sx, sy);
            if (al) { VKA.modo = al.k === 'rot' ? 'girar' : 'escala'; VKA.alca = al.k; VKA.b = al.A.b; VKA.g = vkGuardar(vkSelObjs()); return; }
            const o = vkObjEm(x, y);
            if (o) {
                if (e.shiftKey) VK.sel = VK.sel.includes(o.id) ? VK.sel.filter(i => i !== o.id) : [...VK.sel, o.id];
                else if (!VK.sel.includes(o.id)) VK.sel = [o.id];
                else if (VK.sel.length > 1) VKA.chaveCand = o.id;   // clicar de novo num selecionado = objeto-chave (sem arrastar)
                VKA.modo = 'mover'; VKA.g = vkGuardar(vkSelObjs()); VKA.b = vkBoxUniao(vkSelObjs());
            } else { if (!e.shiftKey) VK.sel = []; VKA.modo = 'laco'; }
            vkUiAgendar(); vkDesenhar(); return;
        }
        if (f === 'direta') {
            const pt = vkPontoEm(sx, sy);
            if (pt) {
                const k = `${pt.si}:${pt.i}`;
                VK.selPts = VK.selPts || {};
                if (pt.qual === 'a') { if (e.shiftKey) { VK.selPts[pt.o.id] = VK.selPts[pt.o.id] || new Set(); VK.selPts[pt.o.id].has(k) ? VK.selPts[pt.o.id].delete(k) : VK.selPts[pt.o.id].add(k); } else if (!(VK.selPts[pt.o.id] && VK.selPts[pt.o.id].has(k))) VK.selPts = { [pt.o.id]: new Set([k]) }; }
                VKA.modo = 'ponto'; VKA.pt = pt; VKA.g = vkGuardar(vkSelObjs()); vkDesenhar(); return;
            }
            const o = vkObjEm(x, y, true);
            if (o) {
                if (!VK.sel.includes(o.id)) { VK.sel = e.shiftKey ? [...VK.sel, o.id] : [o.id]; VK.selPts = null; }
                VKA.modo = 'mover'; VKA.g = vkGuardar(vkSelObjs()); VKA.b = vkBoxUniao(vkSelObjs());
            } else { if (!e.shiftKey) { VK.sel = []; VK.selPts = null; } VKA.modo = 'laco'; }
            vkUiAgendar(); vkDesenhar(); return;
        }
        if (f === 'caneta') { vkCanetaDown(x, y, e); return; }
        if (f === 'contagotas') {
            const o = vkObjEm(x, y, true); VKA = null;
            if (o && VK.sel.length) vkCmdUi('alterar', { ids: VK.sel.filter(i => i !== o.id), preench: o.preench ?? null, traco: o.traco ? o.traco.cor : null, ...(o.traco ? { espessura: o.traco.larg } : {}) });
            else if (o) { VK.preench = o.preench ? vkClone(o.preench) : null; VK.traco = o.traco ? vkClone(o.traco.cor) : null; vkUiAgendar(); }
            return;
        }
        if (f === 'prancheta') {
            const p = VK.doc.pranchetas.slice().reverse().find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
            if (p) { VK.ativa = p.id; VKA.modo = 'prancheta'; VKA.p = p; VKA.px = p.x; VKA.py = p.y; vkUiAgendar(); vkDesenhar(); } else VKA = null;
            return;
        }
        if (f === 'texto') {
            const o = vkObjEm(x, y, true);
            if (o && o.tipo === 'texto') { VKA = null; VK.sel = [o.id]; vkTextoEditar(o); return; }
            VKA.modo = 'texto'; return;
        }
        if (f === 'construtor' || f === 'tesoura' || f === 'faca') { if (vkcDown(VKA, x, y) === null) VKA = null; vkDesenhar(); return; }
        VKA.modo = 'forma';   // retângulo, elipse, polígono, estrela, linha
    });
    cv.addEventListener('pointermove', e => {
        const [sx, sy] = pos(e), [x, y] = vkDoc(sx, sy);
        VK.mouse = [x, y];
        if (VK.ferr === 'caneta' && VK.caneta) vkDesenhar();
        if (!VKA) { vkStatus(x, y); if (VK.sep && VK.sep.ativo) vkSepStatus(x, y); vkcHover(x, y); return; }
        VKA.mx = x; VKA.my = y; VKA.msx = sx; VKA.msy = sy; VKA.shift = e.shiftKey; VKA.alt = e.altKey; VKA.moveu = VKA.moveu || Math.hypot(sx - VKA.sx, sy - VKA.sy) > 3;
        if (VKA.f === 'mao') { VK.vista.x = VKA.vx + sx - VKA.sx; VK.vista.y = VKA.vy + sy - VKA.sy; vkDesenhar(); return; }
        if (VKA.trilha) { vkcMove(VKA, x, y); vkDesenhar(); return; }
        if (!VKA.moveu) return;
        let dx = x - VKA.x, dy = y - VKA.y;
        if (VKA.modo === 'mover') {
            if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
            const b = VKA.b, [ex, ey] = vkEncaixe([b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy], new Set(VK.sel));
            dx += ex; dy += ey; VKA.m = [1, 0, 0, 1, dx, dy];
            vkVoltar(VKA.g); VKA.g.forEach(([o]) => vkTransformar(o, VKA.m));
        } else if (VKA.modo === 'escala') {
            const b = VKA.b, k = VKA.alca, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
            const ox = e.altKey ? cx : k.includes('w') ? b[2] : b[0], oy = e.altKey ? cy : k.includes('n') ? b[3] : b[1];
            let sxv = k === 'n' || k === 's' ? 1 : (x - ox) / ((k.includes('w') ? b[0] : b[2]) - ox || 1);
            let syv = k === 'e' || k === 'w' ? 1 : (y - oy) / ((k.includes('n') ? b[1] : b[3]) - oy || 1);
            if (e.shiftKey) { const s = Math.abs(sxv) > Math.abs(syv) || k === 'e' || k === 'w' ? sxv : syv; sxv = syv = s; if (k === 'n' || k === 's') sxv = syv; }
            VKA.m = [sxv, 0, 0, syv, ox - sxv * ox, oy - syv * oy];
            vkVoltar(VKA.g); VKA.g.forEach(([o]) => vkTransformar(o, VKA.m));
        } else if (VKA.modo === 'girar') {
            const b = VKA.b, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
            let ang = Math.atan2(y - cy, x - cx) - Math.atan2(VKA.y - cy, VKA.x - cx);
            if (e.shiftKey) ang = Math.round(ang / (Math.PI / 4)) * Math.PI / 4;
            const c = Math.cos(ang), s = Math.sin(ang);
            VKA.m = vkMul(vkMul([1, 0, 0, 1, -cx, -cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, cx, cy]); VKA.ang = ang;
            vkVoltar(VKA.g); VKA.g.forEach(([o]) => vkTransformar(o, VKA.m));
        } else if (VKA.modo === 'ponto') {
            vkVoltar(VKA.g);
            const { o, si, i, qual } = VKA.pt, oo = vkObj(o.id);
            if (qual === 'a') {
                for (const [id, set] of Object.entries(VK.selPts || {})) { const ob = vkObj(id); if (!ob) continue;
                    ob.subs = ob.subs.map((s, k) => ({ ...s, pts: s.pts.map((p, j) => set.has(`${k}:${j}`) ? [p[0] + dx, p[1] + dy, p[2] + dx, p[3] + dy, p[4] + dx, p[5] + dy] : p) })); }
            } else {
                const s = oo.subs.map(q => ({ ...q, pts: q.pts.map(p => [...p]) })), p = s[si].pts[i];
                const [hx, hy] = qual === 'in' ? [p[2] + dx, p[3] + dy] : [p[4] + dx, p[5] + dy];
                if (qual === 'in') { p[2] = hx; p[3] = hy; } else { p[4] = hx; p[5] = hy; }
                if (!e.altKey) {   // ponto suave: a outra alça acompanha o ângulo (mantém o comprimento)
                    const ox = qual === 'in' ? 4 : 2, L = Math.hypot(p[ox] - p[0], p[ox + 1] - p[1]), a = Math.atan2(hy - p[1], hx - p[0]) + Math.PI;
                    if (L > 0.01) { p[ox] = p[0] + L * Math.cos(a); p[ox + 1] = p[1] + L * Math.sin(a); }
                }
                oo.subs = s;
            }
        }
        vkDesenhar();
    });
    const soltar = async e => {
        if (!VKA) return;
        const A = VKA; VKA = null; VKG = [];
        const [ex, ey] = [A.mx ?? A.x, A.my ?? A.y];
        if (A.f === 'mao') return;
        if (A.modo === 'mover' || A.modo === 'escala' || A.modo === 'girar') {
            if (!A.moveu || !A.m) { if (A.chaveCand) { VK.chave = VK.chave === A.chaveCand ? null : A.chaveCand; vkUiAgendar(); } vkDesenhar(); return; }
            vkVoltar(A.g);
            if (A.modo === 'mover' && A.alt) { const r = await vkCmdUi('duplicar', { ids: VK.sel }); if (r) await vkCmdUi('matriz', { ids: r.ids, m: A.m }); }
            else await vkCmdUi('matriz', { ids: VK.sel, m: A.m });
            return;
        }
        if (A.modo === 'ponto') {
            if (!A.moveu) return;
            const novos = Object.keys(VK.selPts || { [A.pt.o.id]: 1 }).concat(A.pt.qual !== 'a' ? [A.pt.o.id] : []).filter((v, i, l) => l.indexOf(v) === i).map(id => [id, vkClone(vkObj(id).subs)]);
            vkVoltar(A.g);
            VK._antes = vkSnap(); for (const [id, subs] of novos) vkObj(id).subs = subs;
            vkHistorico('editar pontos'); vkMudou(); return;
        }
        if (A.modo === 'laco') {
            if (!A.moveu) { vkDesenhar(); return; }
            const r = [Math.min(A.x, ex), Math.min(A.y, ey), Math.max(A.x, ex), Math.max(A.y, ey)];
            if (A.f === 'direta') {
                VK.selPts = {};
                for (const { o, cam } of vkTodos()) { if (o.tipo !== 'caminho' || vkTravado(o, cam)) continue;
                    o.subs.forEach((s, si) => s.pts.forEach((p, i) => { if (p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3]) { (VK.selPts[o.id] = VK.selPts[o.id] || new Set()).add(`${si}:${i}`); } })); }
                VK.sel = Object.keys(VK.selPts);
            } else {
                const ids = [];
                for (const c of VK.doc.camadas) { if (c.visivel === false || c.trava) continue; for (const o of c.itens) { if (o.trava || o.visivel === false) continue; const b = vkBox(o); if (b[2] >= r[0] && b[0] <= r[2] && b[3] >= r[1] && b[1] <= r[3]) ids.push(o.id); } }
                VK.sel = A.shift ? [...new Set([...VK.sel, ...ids])] : ids;
            }
            vkUiAgendar(); vkDesenhar(); return;
        }
        if (A.modo === 'prancheta') {
            if (A.moveu) await vkCmdUi('mover_prancheta', { prancheta: A.p.id, dx: ex - A.x, dy: ey - A.y });
            return;
        }
        if (A.f === 'caneta') { vkCanetaUp(ex, ey); return; }
        if (A.modo === 'construir' || A.modo === 'faca') { await vkcUp(A, ex, ey); vkDesenhar(); return; }
        if (A.modo === 'texto') {
            const caixa = A.moveu ? Math.abs(ex - A.x) : null;
            const r = await vkCmdUi('texto', { x: Math.min(A.x, ex), y: A.moveu ? Math.min(A.y, ey) : A.y, conteudo: '', caixa, fonte: VK.txPadrao?.fam, estilo: VK.txPadrao?.estilo, tamanho: VK.txPadrao?.tam });
            if (r) { const o = vkObj(r.id); o._novo = true; vkTextoEditar(o); }
            return;
        }
        if (A.modo === 'forma') {
            let [x0, y0, x1, y1] = [A.x, A.y, ex, ey];
            if (!A.moveu) { x1 = x0 + 72; y1 = y0 + 72; }   // clique sem arrastar: 1 polegada
            let w = x1 - x0, h = y1 - y0;
            if (A.shift && A.f !== 'linha') { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
            if (A.alt && A.f !== 'linha') { x0 -= w; y0 -= h; w *= 2; h *= 2; }
            const X = Math.min(x0, x0 + w), Y = Math.min(y0, y0 + h), W = Math.abs(w), H = Math.abs(h);
            if (A.f === 'retangulo') await vkCmdUi('retangulo', { x: X, y: Y, larg: W, alt: H, raio: VK_OPC.raio });
            else if (A.f === 'elipse') await vkCmdUi('elipse', { x: X, y: Y, larg: W, alt: H });
            else if (A.f === 'poligono') await vkCmdUi('poligono', { cx: A.x, cy: A.y, raio: Math.hypot(ex - A.x, ey - A.y) || 36, lados: VK_OPC.lados });
            else if (A.f === 'estrela') await vkCmdUi('estrela', { cx: A.x, cy: A.y, raio: Math.hypot(ex - A.x, ey - A.y) || 36, pontas: VK_OPC.pontas });
            else if (A.f === 'linha') {
                let [lx, ly] = [ex, ey];
                if (A.shift) { const ang = Math.round(Math.atan2(ey - A.y, ex - A.x) / (Math.PI / 4)) * Math.PI / 4, L = Math.hypot(ex - A.x, ey - A.y); lx = A.x + L * Math.cos(ang); ly = A.y + L * Math.sin(ang); }
                await vkCmdUi('linha', { x1: A.x, y1: A.y, x2: lx, y2: ly, traco: VK.traco || { k: 'cmyk', v: [0, 0, 0, 100] } });
            }
        }
    };
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', soltar);
    cv.addEventListener('dblclick', e => {
        const [sx, sy] = pos(e), [x, y] = vkDoc(sx, sy);
        if (VK.ferr === 'selecao' || VK.ferr === 'direta') { const o = vkObjEm(x, y, true); if (o && o.tipo === 'texto') { VK.sel = [o.id]; vkTextoEditar(o); } }
        if (VK.ferr === 'caneta') vkCanetaFim();
    });
    new ResizeObserver(() => vkDesenhar()).observe(vista);
    document.addEventListener('keydown', vkTeclas, true);
    document.addEventListener('keyup', e => { if (e.code === 'Space') { VK.espaco = false; const cv2 = vkCanvas(); if (cv2) cv2.style.cursor = VK_FERR[VK.ferr].cursor; } });
}

// ─────────────────────────── Caneta ───────────────────────────
function vkCanetaDown(x, y, e) {
    const c = VK.caneta;
    if (c && c.pts.length > 2) {   // clicar no 1º ponto fecha
        const [sx, sy] = vkTela(c.pts[0][0], c.pts[0][1]), [mx, my] = vkTela(x, y);
        if (Math.hypot(sx - mx, sy - my) < 7) { c.fechar = true; VKA.ponto = c.pts[0]; return; }
    }
    if (!c) {   // caminho aberto selecionado + clique na ponta: continua ele
        VK.caneta = { pts: [] };
        // clique num segmento de caminho selecionado: acrescenta ponto (Caneta adiciona ponto, como no Illustrator)
        const o = vkSelObjs().find(q => q.tipo === 'caminho');
        if (o && vkCanetaInserir(o, x, y)) { VK.caneta = null; VKA = null; return; }
    }
    const p = vkPt(x, y); VK.caneta.pts.push(p); VKA.ponto = p;
}
function vkCanetaUp(x, y) {
    const c = VK.caneta; if (!c) return;
    if (VKA === null && c.fechar) { /* nada */ }
    const p = c.fechar ? c.pts[0] : c.pts.at(-1);
    if (Math.hypot(x - p[0], y - p[1]) * VK.vista.z > 3) { p[4] = x; p[5] = y; p[2] = 2 * p[0] - x; p[3] = 2 * p[1] - y; }   // arrastou: ponto suave
    if (c.fechar) vkCanetaFim(true);
    vkDesenhar();
}
function vkCanetaFim(fechar = false) {
    const c = VK.caneta; VK.caneta = null;
    if (!c || c.pts.length < 2) { vkDesenhar(); return; }
    vkCmdUi('caminho', { subs: [{ fechado: !!(fechar || c.fechar), pts: c.pts }], preench: fechar || c.fechar ? VK.preench : null, traco: VK.traco || { k: 'cmyk', v: [0, 0, 0, 100] } });
}
function vkCanetaInserir(o, x, y) {   // divide o segmento sob o clique (de Casteljau) num ponto novo
    const tol = 5 / VK.vista.z;
    for (let si = 0; si < o.subs.length; si++) {
        const P = o.subs[si].pts, n = o.subs[si].fechado ? P.length : P.length - 1;
        for (let i = 0; i < n; i++) {
            const a = P[i], b = P[(i + 1) % P.length];
            for (let k = 1; k < 40; k++) {
                const t = k / 40, u = 1 - t;
                const bx = u * u * u * a[0] + 3 * u * u * t * a[4] + 3 * u * t * t * b[2] + t * t * t * b[0], by = u * u * u * a[1] + 3 * u * u * t * a[5] + 3 * u * t * t * b[3] + t * t * t * b[1];
                if (Math.hypot(bx - x, by - y) > tol) continue;
                const L = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
                const p01 = L([a[0], a[1]], [a[4], a[5]]), p12 = L([a[4], a[5]], [b[2], b[3]]), p23 = L([b[2], b[3]], [b[0], b[1]]);
                const q0 = L(p01, p12), q1 = L(p12, p23), m = L(q0, q1);
                const subs = vkClone(o.subs), S = subs[si].pts;
                S[i][4] = p01[0]; S[i][5] = p01[1]; S[(i + 1) % S.length][2] = p23[0]; S[(i + 1) % S.length][3] = p23[1];
                S.splice(i + 1, 0, [m[0], m[1], q0[0], q0[1], q1[0], q1[1]]);
                vkCmdUi('definir_subs', { id: o.id, subs });
                return true;
            }
        }
    }
    return false;
}

// ─────────────────────────── edição de texto (caixa por cima do canvas) ───────────────────────────
let vkTxEd = null;
function vkTextoEditar(o) {
    vkTextoFim();
    const ta = document.getElementById('vk-texto-edit'); if (!ta) return;
    const b = vkBox(o), [sx, sy] = vkTela(isFinite(b[0]) ? b[0] : o.m[4], isFinite(b[1]) ? b[1] : o.m[5] - o.tam);
    vkTxEd = { o, antes: o.conteudo };
    Object.assign(ta.style, { left: sx + 'px', top: sy + 'px', minWidth: Math.max(60, (o.caixa || 0) * VK.vista.z) + 'px', fontSize: Math.max(11, Math.min(40, o.tam * vkEsc(o.m) * VK.vista.z)) + 'px' });
    ta.value = o.conteudo; ta.hidden = false; ta.focus(); ta.select();
    ta.oninput = () => { o.conteudo = ta.value; vkDesenhar(); };
    ta.onkeydown = e => { if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) { e.preventDefault(); vkTextoFim(); } e.stopPropagation(); };
    ta.onblur = () => setTimeout(vkTextoFim, 0);
}
function vkTextoFim() {
    const ta = document.getElementById('vk-texto-edit'); if (!ta || !vkTxEd) return;
    const { o, antes } = vkTxEd; vkTxEd = null; ta.hidden = true;
    const novo = ta.value;
    o.conteudo = antes;
    if (!novo.trim()) { if (o._novo || !antes.trim()) { VK._antes = null; vkCmdUi('apagar', { ids: [o.id] }); } return; }
    delete o._novo;
    if (novo !== antes) vkCmdUi('alterar', { ids: [o.id], conteudo: novo });
}

// ─────────────────────────── sobreposição (tela): seleção, pontos, prévias, guias ───────────────────────────
function vkDesenharSobreposicao(ctx) {
    const AZ = '#2f8cff';
    ctx.lineWidth = 1;
    // contorno dos objetos selecionados + caixa com alças
    const sel = vkSelObjs();
    ctx.strokeStyle = AZ;
    for (const o of sel) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dpr = window.devicePixelRatio || 1; ctx.setTransform(VK.vista.z * dpr, 0, 0, VK.vista.z * dpr, VK.vista.x * dpr, VK.vista.y * dpr);
        ctx.lineWidth = 1 / VK.vista.z;
        const contorna = x => { if (x.tipo === 'caminho') ctx.stroke(vkPath2d(x.subs)); else if (x.tipo === 'grupo') x.itens.forEach(contorna); else if (x.tipo === 'texto') { const g = vkGeo(x); if (g) { ctx.save(); ctx.transform(...x.m); ctx.lineWidth = 1 / VK.vista.z / vkEsc(x.m); const lb = vkSubsBox(g.subs); ctx.beginPath(); for (const l of g.linhas) { ctx.moveTo(l.x, l.base); ctx.lineTo(l.x + l.larg, l.base); } ctx.stroke(); ctx.restore(); } } };
        contorna(o); ctx.restore();
    }
    if (sel.length && VK.ferr === 'selecao') {
        const A = vkAlcas();
        if (A) { const [x0, y0, x1, y1] = A.r; ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0); ctx.fillStyle = '#fff';
            for (const [x, y] of Object.values(A.h)) { ctx.fillRect(x - 3.5, y - 3.5, 7, 7); ctx.strokeRect(x - 3.5, y - 3.5, 7, 7); } }
    }
    // pontos de ancoragem (Seleção direta / Caneta)
    if (VK.ferr === 'direta' || VK.ferr === 'caneta') {
        for (const o of sel) { if (o.tipo !== 'caminho') continue;
            o.subs.forEach((s, si) => s.pts.forEach((p, i) => {
                const on = VK.selPts && VK.selPts[o.id] && VK.selPts[o.id].has(`${si}:${i}`);
                const [x, y] = vkTela(p[0], p[1]);
                if (on) for (const ix of [2, 4]) if (p[ix] !== p[0] || p[ix + 1] !== p[1]) { const [hx, hy] = vkTela(p[ix], p[ix + 1]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke(); ctx.beginPath(); ctx.arc(hx, hy, 3, 0, 7); ctx.fillStyle = AZ; ctx.fill(); }
                ctx.fillStyle = on ? AZ : '#fff'; ctx.fillRect(x - 3, y - 3, 6, 6); ctx.strokeRect(x - 3, y - 3, 6, 6);
            })); }
    }
    // caneta em andamento
    if (VK.caneta && VK.caneta.pts.length) {
        const c = VK.caneta, dpr = window.devicePixelRatio || 1;
        ctx.save(); ctx.setTransform(VK.vista.z * dpr, 0, 0, VK.vista.z * dpr, VK.vista.x * dpr, VK.vista.y * dpr);
        const pts = VK.mouse && !VKA ? [...c.pts, vkPt(...VK.mouse)] : c.pts;
        ctx.lineWidth = 1 / VK.vista.z; ctx.strokeStyle = AZ; ctx.stroke(vkPath2d([{ fechado: false, pts }])); ctx.restore();
        for (const p of c.pts) { const [x, y] = vkTela(p[0], p[1]); ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, y - 3, 6, 6); ctx.strokeRect(x - 3, y - 3, 6, 6);
            if (p[4] !== p[0] || p[5] !== p[1]) for (const ix of [2, 4]) { const [hx, hy] = vkTela(p[ix], p[ix + 1]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke(); } }
    }
    // prévias de arraste
    if (VKA && VKA.moveu) {
        const [x0, y0] = [VKA.sx, VKA.sy], [x1, y1] = [VKA.msx, VKA.msy];
        ctx.setLineDash(VKA.modo === 'laco' ? [3, 3] : []);
        if (VKA.modo === 'laco') ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
        else if (VKA.modo === 'forma' || VKA.modo === 'texto') {
            ctx.beginPath();
            if (VKA.f === 'elipse') ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, 7);
            else if (VKA.f === 'linha') { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
            else if (VKA.f === 'poligono' || VKA.f === 'estrela') { const r = Math.hypot(x1 - x0, y1 - y0); ctx.arc(x0, y0, r, 0, 7); }
            else ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
            ctx.stroke();
            const w = Math.abs(VKA.mx - VKA.x), h = Math.abs(VKA.my - VKA.y);
            ctx.fillStyle = 'rgba(20,20,20,.85)'; ctx.fillRect(x1 + 12, y1 + 10, 112, 20); ctx.fillStyle = '#fff'; ctx.font = '11px system-ui';
            ctx.fillText(`L ${vkR(vkMM(w), 1)} mm  A ${vkR(vkMM(h), 1)} mm`, x1 + 18, y1 + 24);
        } else if (VKA.modo === 'mover' && VKA.m) {
            ctx.fillStyle = 'rgba(20,20,20,.85)'; ctx.fillRect(x1 + 12, y1 + 10, 120, 20); ctx.fillStyle = '#fff'; ctx.font = '11px system-ui';
            ctx.fillText(`dX ${vkR(vkMM(VKA.m[4]), 1)}  dY ${vkR(vkMM(VKA.m[5]), 1)} mm`, x1 + 18, y1 + 24);
        }
        ctx.setLineDash([]);
    }
    if (typeof vkcSobreposicao === 'function') vkcSobreposicao(ctx, VKA);
    // guias inteligentes
    ctx.strokeStyle = '#ff2fd0';
    for (const g of VKG) { ctx.beginPath(); if (g.eixo === 'x') { const [x] = vkTela(g.pos, 0); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, 99999); } else { const [, y] = vkTela(0, g.pos); ctx.moveTo(0, y + 0.5); ctx.lineTo(99999, y + 0.5); } ctx.stroke(); }
}

// ─────────────────────────── teclado ───────────────────────────
function vkAtivo() { const p = document.getElementById('page-vetor-kanivete'); return p && p.classList.contains('active'); }
function vkTeclas(e) {
    if (!vkAtivo()) return;
    const alvo = e.target, digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
    if (digitando) return;
    const C = e.ctrlKey || e.metaKey, S = e.shiftKey, A = e.altKey, k = e.key.toLowerCase();
    const faz = (f) => { e.preventDefault(); e.stopPropagation(); f(); };
    if (e.code === 'Space' && !C) { if (!VK.espaco) { VK.espaco = true; const cv = vkCanvas(); if (cv) cv.style.cursor = 'grab'; } e.preventDefault(); return; }
    if (C) {
        if (k === 'z' && !S) return faz(vkDesfazer);
        if (k === 'z' && S) return faz(vkRefazer);   // Ctrl+Y é Contornos (como no Illustrator)
        if (k === 'n') return faz(() => vkNovoDialogo && vkNovoDialogo());
        if (k === 'o' && !S) return faz(() => vkCmdUi('abrir', {}));
        if (k === 's') return faz(() => vkCmdUi('salvar', S ? { como: true } : {}));
        if (k === 'p' && S) return faz(() => vkCmdUi('importar', {}));
        if (!VK.doc) return;
        if (k === 'a') return faz(() => { VK.sel = vkTodosDaCamada(); vkMudou(); });
        if (k === 'c' || k === 'x') return faz(() => { VK.clip = vkSelObjs().map(vkClone); if (k === 'x') vkCmdUi('apagar', {}); });
        if (k === 'v' || (k === 'f' && !S) || (k === 'b' && !S)) return faz(async () => {
            if (!VK.clip || !VK.clip.length) return;
            VK._antes = vkSnap();
            const cam = VK.doc.camadas.find(c => c.id === VK.camadaAtiva) || VK.doc.camadas.at(-1);
            const reid = o => { o.id = vkId(); if (o.itens) o.itens.forEach(reid); return o; };
            const novos = VK.clip.map(o => reid(vkClone(o)));
            if (k === 'v' && !S) { const b = vkBoxUniao(novos), cv = vkCanvas().getBoundingClientRect(), [cx, cy] = vkDoc(cv.width / 2, cv.height / 2); novos.forEach(o => vkTransformar(o, [1, 0, 0, 1, cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2])); }
            if (k === 'b') cam.itens.unshift(...novos); else cam.itens.push(...novos);
            VK.sel = novos.map(o => o.id); vkHistorico('colar'); vkMudou();
        });
        if (k === 'd' && A && S) return faz(() => vkTransformarCadaDialogo());
        if (k === 'd') return faz(() => vkCmdUi(VK.ultimaTransf ? 'repetir' : 'duplicar', VK.ultimaTransf ? {} : { dx: vkPT(5), dy: vkPT(5) }));   // Ctrl+D = repetir transformação
        if (k === 'g') return faz(() => vkCmdUi(S ? 'desagrupar' : 'agrupar', {}));
        if (k === '7') return faz(() => vkCmdUi(A ? 'soltar_mascara' : 'mascara', {}));
        if (k === '8') return faz(() => vkCmdUi('composto', {}));
        if (k === 'j') return faz(() => vkCmdUi(A ? 'media' : 'juntar', A ? { eixo: 'ambos' } : {}));
        if (k === ']' || e.code === 'BracketRight') return faz(() => vkCmdUi('organizar', { modo: S ? 'frente' : 'acima' }));
        if (k === '[' || e.code === 'BracketLeft') return faz(() => vkCmdUi('organizar', { modo: S ? 'tras' : 'abaixo' }));
        if (k === '2') return faz(() => A ? vkCmdUi('alterar', { ids: vkTodos().filter(x => x.o.trava).map(x => x.o.id), trava: false }) : vkCmdUi('alterar', { trava: true }).then(() => { VK.sel = []; vkMudou(); }));
        if (k === '3') return faz(() => A ? vkCmdUi('alterar', { ids: vkTodos().filter(x => x.o.visivel === false).map(x => x.o.id), visivel: true }) : vkCmdUi('alterar', { visivel: false }).then(() => { VK.sel = []; vkMudou(); }));
        if (k === 'o' && S) return faz(() => vkCmdUi('contornos', {}));
        if (k === 'y' && A && S) return faz(() => { VK.aba = 'separacoes'; vkCmdUi('separacoes', { ativo: !(VK.sep && VK.sep.ativo) }); });
        if (k === 'y') return faz(() => { VK.contorno = !VK.contorno; vkDesenhar(); vkUiAgendar(); });
        if (k === '0') return faz(() => vkEnquadrar(A ? vkBoxUniao(VK.doc.pranchetas.map(p => ({ tipo: 'caminho', subs: vkRetSubs(p.x, p.y, p.w, p.h) }))) : null));
        if (k === '1') return faz(() => { const cv = vkCanvas().getBoundingClientRect(); vkZoom(1 / VK.vista.z * (96 / 72), cv.width / 2, cv.height / 2); });
        if (k === '=' || k === '+') return faz(() => vkZoom(1.25));
        if (k === '-') return faz(() => vkZoom(0.8));
        if (k === 'r') return faz(() => { VK.reguas = !VK.reguas; vkUiAgendar(); });
        return;
    }
    if (!VK.doc) return;
    if (k === 'delete' || k === 'backspace') return faz(() => VK.sel.length && vkCmdUi('apagar', {}));
    if (k === 'escape') return faz(() => { if (VK.caneta) vkCanetaFim(); else { VK.sel = []; VK.selPts = null; vkMudou(); } });
    if (k === 'enter' && VK.caneta) return faz(() => vkCanetaFim());
    if (k.startsWith('arrow') && VK.sel.length) {
        const p = (S ? 10 : 1) * VK.pref.passo, d = { arrowleft: [-p, 0], arrowright: [p, 0], arrowup: [0, -p], arrowdown: [0, p] }[k];
        return faz(() => vkCmdUi('mover', { dx: d[0], dy: d[1] }));
    }
    if (S && k === 'o') return faz(() => vkFerramenta('prancheta'));
    if (S && k === 'm') return faz(() => vkFerramenta('construtor'));
    if (S && k === 'x') return faz(() => { [VK.preench, VK.traco] = [VK.traco, VK.preench]; vkUiAgendar(); });
    if (k === 'd' && !S) return faz(() => { VK.preench = { k: 'cmyk', v: [0, 0, 0, 0] }; VK.traco = { k: 'cmyk', v: [0, 0, 0, 100] }; vkUiAgendar(); });
    if (k === 'x' && !S) return faz(() => { VK.focoTraco = !VK.focoTraco; vkUiAgendar(); });
    if (k === '/') return faz(() => { if (VK.sel.length) vkCmdUi('alterar', VK.focoTraco ? { traco: null } : { preench: null }); else { if (VK.focoTraco) VK.traco = null; else VK.preench = null; vkUiAgendar(); } });
    const mapa = { v: 'selecao', a: 'direta', p: 'caneta', t: 'texto', m: 'retangulo', l: 'elipse', '\\': 'linha', i: 'contagotas', h: 'mao', z: 'zoom', c: 'tesoura' };
    if (!S && !A && mapa[k]) return faz(() => vkFerramenta(mapa[k]));
}
function vkStatus(x, y) { const el = document.getElementById('vk-status-pos'); if (el) el.textContent = `X ${vkR(vkMM(x - ((VK.doc.pranchetas.find(p => p.id === VK.ativa) || {}).x || 0)), 1)}  Y ${vkR(vkMM(y - ((VK.doc.pranchetas.find(p => p.id === VK.ativa) || {}).y || 0)), 1)} mm`; }
