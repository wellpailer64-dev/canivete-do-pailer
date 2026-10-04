// Vetor Kanivete — CONSTRUIR FORMAS: Construtor de formas (Shift+M), Pathfinder Dividir/Aparar/Mesclar/Cortar/Menos fundo,
// Tesoura (C), Faca, Juntar (Ctrl+J) e Média (Alt+Ctrl+J). Tudo como comando (vkCmd): interface, Claude e Worker iguais.
// As áreas atômicas (regiões) vêm do Python (skia-pathops: vetor_kanivete.regioes); o resto é geometria de Bézier aqui.

// ── apoio ──
function vkcOrdem(objs) { const ordem = vkTodos().map(x => x.o); return [...objs].sort((p, q) => ordem.indexOf(p) - ordem.indexOf(q)); }
function vkcAlvos(a, filtro = o => o.tipo === 'caminho' || o.tipo === 'texto') {
    let ids = a.ids || (a.id ? [a.id] : null);
    if (!ids && a.nomes) { const t = vkTodos(); ids = [].concat(a.nomes).map(n => { const r = t.find(x => (x.o.nome || '').toLowerCase() === String(n).toLowerCase()); if (!r) throw new Error(`objeto "${n}" não existe`); return r.o.id; }); }
    return vkcOrdem((ids || VK.sel).map(vkObj).filter(o => o && filtro(o)));
}
function vkcPt(a, x, y) {   // ponto da API (mm na prancheta, ou pt com un:'pt') → pt do documento
    if (a.un === 'pt') return [+x, +y];
    const P = VK.doc.pranchetas, p = (a.prancheta != null && (P.find(q => q.id === a.prancheta || q.nome === a.prancheta) || P[+a.prancheta - 1])) || P.find(q => q.id === VK.ativa) || P[0];
    return [p.x + vkPT(+x), p.y + vkPT(+y)];
}
async function vkcForma(o) {   // caminho ou texto (em curvas) → {subs, regra} no documento
    if (o.tipo !== 'texto') return { subs: o.subs, regra: o.regra || 'nonzero' };
    const g = await vkGeoPronta(o);
    return { subs: g.subs.map(s => ({ fechado: true, pts: s.pts.map(p => [...vkAp(o.m, p[0], p[1]), ...vkAp(o.m, p[2], p[3]), ...vkAp(o.m, p[4], p[5])]) })), regra: 'nonzero' };
}
function vkcNovo(base, subs, extra = {}) {   // caminho novo com o estilo de base
    return { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs, preench: base.preench ? vkClone(base.preench) : null, traco: base.traco ? vkClone(base.traco) : null,
        ...(base.op != null ? { op: base.op } : {}), ...(base.bm ? { bm: base.bm } : {}), ...(base.sobre ? { sobre: vkClone(base.sobre) } : {}), ...extra };
}
function vkcTrocar(objs, novos) {   // tira objs e põe novos no lugar do de cima
    const topo = objs.at(-1), l = vkListaDe(topo.id), pos = l.indexOf(topo);
    l.splice(pos + 1, 0, ...novos);
    for (const o of objs) { const ll = vkListaDe(o.id); ll.splice(ll.indexOf(o), 1); }
    VK.sel = novos.map(o => o.id);
}
let vkcHit = null;
function vkcDentro(subs, x, y) { if (!vkcHit) vkcHit = document.createElement('canvas').getContext('2d'); return vkcHit.isPointInPath(vkPath2d(subs), x, y, 'nonzero'); }
async function vkcRegioes(objs) {
    const formas = await Promise.all(objs.map(vkcForma));
    return (await vkApi().vk_regioes(formas)).map(r => ({ ...r, topo: objs[Math.max(...r.fontes)] }));
}
// Bézier
const vkcLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function vkcSeg(s, i) { const a = s.pts[i], b = s.pts[(i + 1) % s.pts.length]; return [[a[0], a[1]], [a[4], a[5]], [b[2], b[3]], [b[0], b[1]]]; }
function vkcEm(P, t) { const u = 1 - t; return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]; }
function vkcMaisPerto(o, x, y) {   // → {si, i, t, d} do segmento mais próximo
    let m = null;
    o.subs.forEach((s, si) => {
        const n = s.fechado ? s.pts.length : s.pts.length - 1;
        for (let i = 0; i < n; i++) {
            const P = vkcSeg(s, i);
            let bt = 0, bd = Infinity;
            for (let k = 0; k <= 64; k++) { const t = k / 64, q = vkcEm(P, t), d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; bt = t; } }
            for (let h = 1 / 128; h > 1e-6; h /= 2) for (const t of [bt - h, bt + h]) { if (t < 0 || t > 1) continue; const q = vkcEm(P, t), d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; bt = t; } }
            if (!m || bd < m.d) m = { si, i, t: bt, d: bd };
        }
    });
    return m;
}
function vkcDividirSeg(s, i, t) {   // insere um nó no segmento i em t (de Casteljau) → índice do nó novo
    const P = vkcSeg(s, i), a = s.pts[i], b = s.pts[(i + 1) % s.pts.length];
    const p01 = vkcLerp(P[0], P[1], t), p12 = vkcLerp(P[1], P[2], t), p23 = vkcLerp(P[2], P[3], t), p012 = vkcLerp(p01, p12, t), p123 = vkcLerp(p12, p23, t), q = vkcLerp(p012, p123, t);
    a[4] = p01[0]; a[5] = p01[1]; b[2] = p23[0]; b[3] = p23[1];
    s.pts.splice(i + 1, 0, [q[0], q[1], p012[0], p012[1], p123[0], p123[1]]);
    return i + 1;
}
function vkcInverter(s) { return { ...s, pts: s.pts.slice().reverse().map(p => [p[0], p[1], p[4], p[5], p[2], p[3]]) }; }

// ── comandos ──
(() => {
    // Construtor de formas: juntar = pontos (as regiões tocadas viram uma forma só); apagar = pontos (Alt no Illustrator)
    vkRegistrar('construtor', 'construtor de formas', async a => {
        const objs = vkcAlvos(a); if (!objs.length) throw new Error('construtor de formas: selecione as formas');
        const regs = await vkcRegioes(objs);
        let ordem = 0;   // a forma juntada fica com a cor da 1ª região tocada (onde o arraste começou)
        const marca = (pts, m) => [].concat(pts || []).forEach(([x, y]) => { const [X, Y] = vkcPt(a, x, y); regs.forEach(r => { if (!r.m && vkcDentro(r.subs, X, Y)) { r.m = m; r.ordem = ordem++; } }); });
        marca(a.apagar, 'apagar'); marca(a.juntar, 'juntar');
        const jun = regs.filter(r => r.m === 'juntar').sort((p, q) => p.ordem - q.ordem), novos = [];
        for (const r of regs) if (!r.m) novos.push(vkcNovo(r.topo, r.subs));
        if (jun.length) {
            const u = jun.length > 1 ? (await vkApi().vk_booleana('unir', jun.map(r => ({ subs: r.subs, regra: 'nonzero' })))).subs : jun[0].subs;
            const n = vkcNovo(jun[0].topo, u); if ('preench' in a) n.preench = vkCorDe(a.preench); novos.push(n);
        }
        vkcTrocar(objs, novos);
        return { regioes: regs.length, juntadas: jun.length, apagadas: regs.filter(r => r.m === 'apagar').length, ids: VK.sel };
    });
    // Pathfinder (Efeitos de forma do painel de baixo): dividir, aparar, mesclar, cortar, menos_fundo
    vkRegistrar('pathfinder2', 'Pathfinder', async a => {
        const objs = vkcAlvos(a); if (objs.length < 2) throw new Error('Pathfinder: selecione 2+ formas');
        const api = vkApi(), op = a.op, formas = await Promise.all(objs.map(vkcForma));
        let novos = [];
        if (op === 'dividir') novos = (await vkcRegioes(objs)).map(r => vkcNovo(r.topo, r.subs));
        else if (op === 'aparar' || op === 'mesclar') {   // cada um perde o que está escondido pelos de cima; o traço sai
            for (let i = 0; i < objs.length; i++) {
                const r = i === objs.length - 1 ? { subs: formas[i].subs } : await api.vk_booleana('subtrair', [formas[i], ...formas.slice(i + 1)]);
                if (r.subs.length) novos.push(vkcNovo(objs[i], r.subs, { traco: null }));
            }
            if (op === 'mesclar') {   // mesma cor de preenchimento → uma forma só
                const grupos = new Map();
                for (const n of novos) { const k = JSON.stringify(n.preench); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(n); }
                novos = [];
                for (const g of grupos.values()) novos.push(g.length > 1 ? vkcNovo(g[0], (await api.vk_booleana('unir', g.map(n => ({ subs: n.subs })))).subs, { traco: null }) : g[0]);
            }
        } else if (op === 'cortar') {   // o de cima recorta os de baixo e some
            const corte = formas.at(-1);
            for (let i = 0; i < objs.length - 1; i++) { const r = await api.vk_booleana('intersecao', [formas[i], corte]); if (r.subs.length) novos.push(vkcNovo(objs[i], r.subs, { traco: null })); }
        } else if (op === 'menos_fundo') {   // o de cima menos todos os de baixo
            const r = await api.vk_booleana('subtrair', [formas.at(-1), ...formas.slice(0, -1)]);
            novos = [vkcNovo(objs.at(-1), r.subs)];
        } else throw new Error('op: dividir, aparar, mesclar, cortar ou menos_fundo');
        novos = novos.filter(n => n.subs.length);
        if (op !== 'menos_fundo' && novos.length > 1) { const g = { id: vkId(), tipo: 'grupo', itens: novos }; vkcTrocar(objs, [g]); }
        else vkcTrocar(objs, novos);
        return { op, pecas: novos.length, ids: VK.sel };
    });
    // Tesoura: corta o caminho no ponto (x, y) mais perto. Fechado vira aberto; aberto vira dois caminhos
    vkRegistrar('tesoura', 'tesoura', a => {
        const [x, y] = vkcPt(a, a.x, a.y);
        let alvos = vkcAlvos(a, o => o.tipo === 'caminho');
        if (!alvos.length) alvos = vkTodos().map(t => t.o).filter(o => o.tipo === 'caminho');
        let o = null, m = null;
        for (const c of alvos) { const r = vkcMaisPerto(c, x, y); if (r && (!m || r.d < m.d)) { m = r; o = c; } }
        const tol = a.tol != null ? vkPT(a.tol) : 6 / VK.vista.z;
        if (!o || m.d > tol) throw new Error('tesoura: clique em cima de um caminho');
        const s = o.subs[m.si];
        let k;
        if (m.t < 1e-4) k = m.i; else if (m.t > 1 - 1e-4) k = (m.i + 1) % s.pts.length; else k = vkcDividirSeg(s, m.i, m.t);
        const novos = [];
        if (s.fechado) {   // começa e termina no corte
            const pts = [...s.pts.slice(k), ...s.pts.slice(0, k + 1)].map(p => [...p]);
            pts[0] = [pts[0][0], pts[0][1], pts[0][0], pts[0][1], pts[0][4], pts[0][5]];
            const u = pts.at(-1); pts[pts.length - 1] = [u[0], u[1], u[2], u[3], u[0], u[1]];
            o.subs[m.si] = { fechado: false, pts };
        } else {
            if (k === 0 || k === s.pts.length - 1) throw new Error('tesoura: isso já é a ponta do caminho');
            const p1 = s.pts.slice(0, k + 1).map(p => [...p]), p2 = s.pts.slice(k).map(p => [...p]);
            p1[p1.length - 1] = [p1.at(-1)[0], p1.at(-1)[1], p1.at(-1)[2], p1.at(-1)[3], p1.at(-1)[0], p1.at(-1)[1]];
            p2[0] = [p2[0][0], p2[0][1], p2[0][0], p2[0][1], p2[0][4], p2[0][5]];
            o.subs[m.si] = { fechado: false, pts: p1 };
            const n = vkcNovo(o, [{ fechado: false, pts: p2 }], { nome: o.nome ? o.nome + ' 2' : undefined });
            const l = vkListaDe(o.id); l.splice(l.indexOf(o) + 1, 0, n); novos.push(n.id);
        }
        VK.sel = [o.id, ...novos]; return { ids: VK.sel };
    });
    // Faca: linha à mão livre [[x,y],...] corta as formas fechadas (as selecionadas; sem seleção, todas sob a linha)
    vkRegistrar('faca', 'faca', async a => {
        const linha = (a.linha || []).map(([x, y]) => vkcPt(a, x, y)); if (linha.length < 2) throw new Error('faca: linha com 2+ pontos');
        let objs = vkcAlvos(a, o => o.tipo === 'caminho' && o.preench && o.subs.some(s => s.fechado));
        if (!objs.length) {
            const bx = [Math.min(...linha.map(p => p[0])), Math.min(...linha.map(p => p[1])), Math.max(...linha.map(p => p[0])), Math.max(...linha.map(p => p[1]))];
            objs = vkcOrdem(vkTodos().filter(({ o, cam }) => o.tipo === 'caminho' && o.preench && !vkTravado(o, cam)).map(t => t.o).filter(o => { const b = vkBox(o); return b[2] >= bx[0] && b[0] <= bx[2] && b[3] >= bx[1] && b[1] <= bx[3]; }));
        }
        if (!objs.length) return { cortados: 0 };
        const r = await vkApi().vk_faca(await Promise.all(objs.map(vkcForma)), linha);
        const ids = []; let cortados = 0;
        objs.forEach((o, k) => {
            if (r[k].length < 2) return;
            cortados++;
            const novos = r[k].map(subs => vkcNovo(o, subs, o.nome ? { nome: o.nome } : {}));
            const l = vkListaDe(o.id); l.splice(l.indexOf(o), 1, ...novos); ids.push(...novos.map(n => n.id));
        });
        VK.sel = ids; return { cortados, pecas: ids.length };
    });
    // Juntar: 2 pontas selecionadas (Seleção direta) ou 2 caminhos abertos (pontas mais próximas); 1 caminho aberto = fecha
    vkRegistrar('juntar', 'juntar', a => {
        const pontas = [];
        for (const [id, set] of Object.entries(VK.selPts || {})) {
            const o = vkObj(id); if (!o || o.tipo !== 'caminho') continue;
            for (const k of set) { const [si, i] = k.split(':').map(Number), s = o.subs[si]; if (s && !s.fechado && (i === 0 || i === s.pts.length - 1)) pontas.push({ o, si, fim: i !== 0 }); }
        }
        let A, B;
        if (pontas.length === 2) [A, B] = pontas;
        else {
            const objs = vkcAlvos(a, o => o.tipo === 'caminho' && o.subs.some(s => !s.fechado));
            if (objs.length === 1 && objs[0].subs.filter(s => !s.fechado).length === 1) {
                const o = objs[0], si = o.subs.findIndex(s => !s.fechado); A = { o, si, fim: true }; B = { o, si, fim: false };
            } else if (objs.length === 2) {
                const c = [];
                for (const fa of [false, true]) for (const fb of [false, true]) {
                    const sa = objs[0].subs.findIndex(s => !s.fechado), sb = objs[1].subs.findIndex(s => !s.fechado);
                    const pa = objs[0].subs[sa].pts[fa ? objs[0].subs[sa].pts.length - 1 : 0], pb = objs[1].subs[sb].pts[fb ? objs[1].subs[sb].pts.length - 1 : 0];
                    c.push({ d: Math.hypot(pa[0] - pb[0], pa[1] - pb[1]), A: { o: objs[0], si: sa, fim: fa }, B: { o: objs[1], si: sb, fim: fb } });
                }
                ({ A, B } = c.sort((p, q) => p.d - q.d)[0]);
            } else throw new Error('juntar: selecione 2 pontas (Seleção direta) ou 1–2 caminhos abertos');
        }
        if (A.o === B.o && A.si === B.si) {   // fecha o caminho (pontas no mesmo lugar viram um nó só)
            const s = A.o.subs[A.si], p0 = s.pts[0], pn = s.pts.at(-1);
            if (s.pts.length > 2 && Math.hypot(p0[0] - pn[0], p0[1] - pn[1]) < 0.01) { p0[2] = pn[2]; p0[3] = pn[3]; s.pts.pop(); }
            s.fechado = true; VK.selPts = null; VK.sel = [A.o.id]; return { fechado: true };
        }
        // A termina → B começa
        let sa = A.o.subs[A.si], sb = B.o.subs[B.si];
        if (!A.fim) sa = vkcInverter(sa);
        if (B.fim) sb = vkcInverter(sb);
        const pa = sa.pts.at(-1), pb = sb.pts[0];
        let pts;
        if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 0.01) pts = [...sa.pts.slice(0, -1), [pb[0], pb[1], pa[2], pa[3], pb[4], pb[5]], ...sb.pts.slice(1)];
        else pts = [...sa.pts, ...sb.pts];
        A.o.subs[A.si] = { fechado: false, pts };
        if (A.o === B.o) A.o.subs.splice(B.si, 1);
        else { B.o.subs.splice(B.si, 1); if (!B.o.subs.length) { const l = vkListaDe(B.o.id); l.splice(l.indexOf(B.o), 1); } }
        VK.selPts = null; VK.sel = [A.o.id]; return { juntado: true, pontos: pts.length };
    });
    // Média: os nós selecionados (Seleção direta) vão para a posição média — eixo: h (mesmo y), v (mesmo x), ambos
    vkRegistrar('media', 'média', a => {
        const eixo = a.eixo || 'ambos', lista = [];
        for (const [id, set] of Object.entries(VK.selPts || {})) { const o = vkObj(id); if (o && o.subs) for (const k of set) { const [si, i] = k.split(':').map(Number); if (o.subs[si] && o.subs[si].pts[i]) lista.push(o.subs[si].pts[i]); } }
        if (lista.length < 2) throw new Error('média: selecione 2+ nós com a Seleção direta');
        const mx = lista.reduce((s, p) => s + p[0], 0) / lista.length, my = lista.reduce((s, p) => s + p[1], 0) / lista.length;
        for (const p of lista) { const dx = eixo === 'h' ? 0 : mx - p[0], dy = eixo === 'v' ? 0 : my - p[1]; for (const j of [0, 2, 4]) { p[j] += dx; p[j + 1] += dy; } }
        return { nos: lista.length };
    });
})();

// ── ferramentas com o mouse: Construtor de formas, Tesoura, Faca ──
const VKC = { regs: null, chave: '', hover: -1, calc: false };
async function vkcPreparar() {   // regiões da seleção atual (recalcula quando seleção ou documento mudam)
    const objs = vkcAlvos({}); const chave = objs.map(o => o.id).join(',') + '|' + (VK.versaoDoc || 0);
    if (chave === VKC.chave || VKC.calc) return;
    VKC.chave = chave; VKC.regs = null;
    if (!objs.length) { vkDesenhar(); return; }
    VKC.calc = true;
    try { VKC.regs = await vkcRegioes(objs); } catch (e) { VKC.regs = null; } finally { VKC.calc = false; }
    vkDesenhar();
}
function vkcRegiaoEm(x, y) { return VKC.regs ? VKC.regs.findIndex(r => vkcDentro(r.subs, x, y)) : -1; }
function vkcDown(A, x, y) {
    if (A.f === 'construtor') { vkcPreparar(); A.modo = 'construir'; A.trilha = [[x, y]]; return; }
    if (A.f === 'faca') { A.modo = 'faca'; A.trilha = [[x, y]]; return; }
    if (A.f === 'tesoura') { vkCmdUi('tesoura', { x, y }); return null; }
}
function vkcMove(A, x, y) { if (A.trilha) { const u = A.trilha.at(-1); if (Math.hypot(u[0] - x, u[1] - y) * VK.vista.z > 3) A.trilha.push([x, y]); } }
function vkcHover(x, y) { if (VK.ferr !== 'construtor') return; vkcPreparar(); const h = vkcRegiaoEm(x, y); if (h !== VKC.hover) { VKC.hover = h; vkDesenhar(); } }
async function vkcUp(A, x, y) {
    if (A.modo === 'construir') {
        if (!VKC.regs) return;
        const pts = A.trilha.concat([[x, y]]);
        await vkCmdUi('construtor', A.alt ? { apagar: pts } : { juntar: pts });
        VKC.chave = ''; vkcPreparar();
    } else if (A.modo === 'faca') {
        if (A.trilha.length < 2) return;
        await vkCmdUi('faca', { linha: A.trilha.concat([[x, y]]), ids: VK.sel.length ? VK.sel : undefined });
    }
}
function vkcSobreposicao(ctx, A) {
    const ch = typeof vkChaveAtiva === 'function' && vkChaveAtiva();
    if (ch) { const b = vkBox(vkObj(ch)), [x0, y0] = vkTela(b[0], b[1]), [x1, y1] = vkTela(b[2], b[3]); ctx.save(); ctx.strokeStyle = '#2f8cff'; ctx.lineWidth = 3; ctx.strokeRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3); ctx.restore(); }
    if (VK.ferr === 'construtor' && VKC.regs) {
        ctx.save(); const z = VK.vista.z;
        ctx.setTransform(z * (window.devicePixelRatio || 1), 0, 0, z * (window.devicePixelRatio || 1), VK.vista.x * (window.devicePixelRatio || 1), VK.vista.y * (window.devicePixelRatio || 1));
        ctx.lineWidth = 0.5 / z; ctx.setLineDash([3 / z, 3 / z]); ctx.strokeStyle = 'rgba(47,140,255,.7)';
        VKC.regs.forEach(r => ctx.stroke(vkPath2d(r.subs)));
        ctx.setLineDash([]);
        const marcadas = new Set(); if (A && A.trilha) A.trilha.forEach(([px, py]) => { const k = vkcRegiaoEm(px, py); if (k >= 0) marcadas.add(k); });
        if (VKC.hover >= 0) marcadas.add(VKC.hover);
        ctx.fillStyle = A && A.alt ? 'rgba(230,40,40,.35)' : 'rgba(120,120,120,.45)';
        marcadas.forEach(k => ctx.fill(vkPath2d(VKC.regs[k].subs)));
        ctx.restore();
    }
    if (A && A.trilha && A.trilha.length > 1) {
        ctx.save(); ctx.strokeStyle = A.modo === 'faca' ? '#ff2f2f' : '#2f8cff'; ctx.lineWidth = 1.5; ctx.beginPath();
        A.trilha.forEach(([px, py], i) => { const [sx, sy] = vkTela(px, py); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.stroke(); ctx.restore();
    }
}
