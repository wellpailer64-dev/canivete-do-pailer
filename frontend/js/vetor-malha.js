// Vetor Kanivete — MALHA DE DEGRADÊ (Gradient Mesh, ferramenta U do Illustrator).
// {tipo:'malha', nos: [[[x, y], ...colunas+1] ...linhas+1] (pt do documento), cores: mesma grade de cores}.
// A cor varia por interpolação bilinear em cada célula (Coons com bordas retas). Tela: célula subdividida; PDF: ShadingType 6
// (vetorial, CMYK, aceito em X-1a). criar_malha recorta pela forma original (grupo com máscara).
VK_FERR.malha = { nome: 'Malha (clique numa forma cria; num nó pinta com a cor atual; arraste move o nó)', tecla: 'U', cursor: 'crosshair' };
VK_ICO.malha = '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10c5-2 11 2 16 0M4 15c5-2 11 2 16 0M10 4c-2 5 2 11 0 16M15 4c-2 5 2 11 0 16"/>';

function vkMalhaCor(c) { if (!c) return [0, 0, 0, 0]; if (c.k === 'cmyk') return c.v; if (c.k === 'spot') return c.v.map(x => x * (c.tint ?? 100) / 100); if (c.k === 'grad') return vkMalhaCor(c.paradas[0].cor);
    if (c.k === 'rgb') { const [r, g, b] = c.v.map(x => x / 255), k = 1 - Math.max(r, g, b); return k >= 1 ? [0, 0, 0, 100] : [(1 - r - k) / (1 - k) * 100, (1 - g - k) / (1 - k) * 100, (1 - b - k) / (1 - k) * 100, k * 100]; }
    return [0, 0, 0, 100]; }
VK.malhaCache = new Map();
// Teto de pixels da imagem da malha na tela. A malha é cor suave (sem borda nítida por dentro): acima disso ela é pintada
// menor e ampliada na tela, sem diferença visível — antes, no zoom 4× de uma IDV com malhas grandes, a imagem chegava a
// dezenas de milhões de pixels em fatias de 3 px e o 1º redesenho levava 26 s (2026-10-10). O PDF continua vetorial.
const VK_MALHA_MAX_PX = 2e6;
function vkMalhaRgb(c) {   // cor de tela de um nó (prova de cor do perfil: vkCmykCss) → [r, g, b]
    const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(vkCss({ k: 'cmyk', v: vkMalhaCor(c).map(x => Math.round(x * 2) / 2) }) || '');
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}
// Pinta a malha ponto a ponto: para cada pixel, acha (u, v) dentro da célula (inversa bilinear, Í. Quílez) e mistura as
// cores dos 4 nós. Antes eram fatias de ~3 px (fill + stroke cada): numa IDV com 7 malhas 3D (8.580 células) o 1º redesenho
// depois de um zoom 4× levava 21–26 s; agora a conta é por pixel da imagem (≤ VK_MALHA_MAX_PX). A prova de cor vale nos nós.
function vkMalhaRaster(o, kr, b, W, H) {
    const img = new ImageData(W, H), d = img.data, N = o.nos, R = o.cores.map(l => l.map(vkMalhaRgb));
    const X = p => (p[0] - b[0]) * kr + 1, Y = p => (p[1] - b[1]) * kr + 1, cr = (ax, ay, bx, by) => ax * by - ay * bx;
    for (let i = 0; i < N.length - 1; i++) for (let j = 0; j < N[0].length - 1; j++) {
        const ax = X(N[i][j]), ay = Y(N[i][j]), bx = X(N[i][j + 1]), by = Y(N[i][j + 1]);
        const cx = X(N[i + 1][j + 1]), cy = Y(N[i + 1][j + 1]), dx = X(N[i + 1][j]), dy = Y(N[i + 1][j]);
        const ex = bx - ax, ey = by - ay, fx = dx - ax, fy = dy - ay, gx = ax - bx + cx - dx, gy = ay - by + cy - dy;
        const k2 = cr(gx, gy, fx, fy), c00 = R[i][j], c01 = R[i][j + 1], c10 = R[i + 1][j], c11 = R[i + 1][j + 1];
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx, dx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx, dx)));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy, dy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy, dy)));
        for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
            const hx = px + 0.5 - ax, hy = py + 0.5 - ay;
            const k1 = cr(ex, ey, fx, fy) + cr(hx, hy, gx, gy), k0 = cr(hx, hy, ex, ey);
            let u, v;
            if (Math.abs(k2) < 1e-9) { if (Math.abs(k1) < 1e-12) continue; v = -k0 / k1; }
            else { let w = k1 * k1 - 4 * k0 * k2; if (w < 0) continue; w = Math.sqrt(w); v = (-k1 - w) / (2 * k2); if (v < -0.01 || v > 1.01) v = (-k1 + w) / (2 * k2); }
            const dX = ex + gx * v, dY = ey + gy * v, porX = Math.abs(dX) >= Math.abs(dY);
            if (Math.abs(porX ? dX : dY) < 1e-12) continue;
            u = porX ? (hx - fx * v) / dX : (hy - fy * v) / dY;
            if (u < -0.01 || u > 1.01 || v < -0.01 || v > 1.01) continue;
            u = Math.min(1, Math.max(0, u)); v = Math.min(1, Math.max(0, v));
            const a = (1 - u) * (1 - v), bb = u * (1 - v), cc = u * v, dd = (1 - u) * v, q = (py * W + px) * 4;
            d[q] = c00[0] * a + c01[0] * bb + c11[0] * cc + c10[0] * dd;
            d[q + 1] = c00[1] * a + c01[1] * bb + c11[1] * cc + c10[1] * dd;
            d[q + 2] = c00[2] * a + c01[2] * bb + c11[2] * cc + c10[2] * dd;
            d[q + 3] = 255;
        }
    }
    return img;
}
function vkMalhaDesenhar(ctx, o) {   // desenhada numa imagem à parte (cache por malha + escala), pixel a pixel
    const T = ctx.getTransform(), k = Math.hypot(T.a, T.b) || 1, b = vkBox(o);
    const Wt = Math.ceil((b[2] - b[0]) * k) + 2, Ht = Math.ceil((b[3] - b[1]) * k) + 2;   // tamanho na tela
    if (Wt < 1 || Ht < 1) return;
    const kr = Wt * Ht > VK_MALHA_MAX_PX ? k * Math.sqrt(VK_MALHA_MAX_PX / (Wt * Ht)) : k;   // escala em que é pintada
    const W = Math.ceil((b[2] - b[0]) * kr) + 2, H = Math.ceil((b[3] - b[1]) * kr) + 2;
    const chave = JSON.stringify([o.nos, o.cores, Math.round(kr * 100), VK.corTela.size]);
    let cv = VK.malhaCache.get(o.id);
    if (!cv || cv._chave !== chave) {
        cv = new OffscreenCanvas(W, H); cv._chave = chave;
        cv.getContext('2d').putImageData(vkMalhaRaster(o, kr, b, W, H), 0, 0);
        VK.malhaCache.set(o.id, cv);
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const x0 = Math.round(T.a * b[0] + T.c * b[1] + T.e) - 1, y0 = Math.round(T.b * b[0] + T.d * b[1] + T.f) - 1;
    if (kr === k) ctx.drawImage(cv, x0, y0);
    else { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cv, x0, y0, W * k / kr, H * k / kr); }
    ctx.restore();
}
// caixa e clique
const vkBoxSemMalha = vkBox;
vkBox = function (o, c) { if (o.tipo !== 'malha') return vkBoxSemMalha(o, c); const b = [Infinity, Infinity, -Infinity, -Infinity]; o.nos.flat().forEach(p => vkBoxAdd(b, p[0], p[1])); return b; };
const vkAcertaSemMalha = vkAcerta;
vkAcerta = function (o, x, y, tol) { if (o.tipo !== 'malha') return vkAcertaSemMalha(o, x, y, tol); const b = vkBox(o); return x >= b[0] - tol && x <= b[2] + tol && y >= b[1] - tol && y <= b[3] + tol; };
const vkCoresSemMalha = vkCores;
vkCores = function (o) { const out = vkCoresSemMalha(o); if (o.tipo === 'malha') o.cores.flat().forEach(c => c && out.push(c)); return out; };

(() => {
    // criar_malha: forma (ids/nomes) → malha linhas × colunas na caixa dela, recortada pela forma; cor = a da forma
    // (centro um pouco mais claro: clarear %, padrão 0)
    vkRegistrar('criar_malha', 'criar malha', a => {
        const f = vkTxAlvos(a).find(o => o.tipo === 'caminho'); if (!f) throw new Error('criar_malha: escolha uma forma');
        const L = Math.max(1, Math.min(20, +(a.linhas || 2))), Cc = Math.max(1, Math.min(20, +(a.colunas || 2))), b = vkBox(f);
        const base = vkMalhaCor(f.preench || { k: 'cmyk', v: [0, 0, 0, 20] }), cl = +(a.clarear || 0) / 100;
        const nos = [], cores = [];
        for (let i = 0; i <= L; i++) { nos.push([]); cores.push([]); for (let j = 0; j <= Cc; j++) {
            nos[i].push([b[0] + (b[2] - b[0]) * j / Cc, b[1] + (b[3] - b[1]) * i / L]);
            const centro = i > 0 && i < L && j > 0 && j < Cc; cores[i].push({ k: 'cmyk', v: centro && cl ? base.map(x => x * (1 - cl)) : base.slice() }); } }
        const m = { id: vkId(), tipo: 'malha', nos, cores, nome: a.nome || 'Malha' };
        const corte = { ...vkClone(f), id: vkId(), preench: null, traco: null };
        const g = { id: vkId(), tipo: 'grupo', clip: true, nome: (a.nome || 'Malha') + ' (recortada)', itens: [corte, m] };
        const l = vkListaDe(f.id); l.splice(l.indexOf(f), 1, g); VK.sel = [g.id];
        return { id: m.id, grupo: g.id, nos: (L + 1) * (Cc + 1) };
    });
    // malha_no: id da malha, i (linha), j (coluna) → cor e/ou x, y (mm da prancheta | pt com un)
    vkRegistrar('malha_no', 'nó da malha', a => {
        const m = vkObj(a.id); if (!m || m.tipo !== 'malha') throw new Error('malha_no: id de uma malha');
        const i = +a.i, j = +a.j; if (!m.nos[i] || !m.nos[i][j]) throw new Error(`malha_no: nó ${i},${j} não existe (${m.nos.length}×${m.nos[0].length})`);
        if (a.cor !== undefined) m.cores[i][j] = vkCorDe(a.cor);
        if (a.x != null || a.y != null) { const p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0], D = (v, o0) => a.un === 'pt' ? +v : o0 + vkPT(+v);
            m.nos[i][j] = [a.x != null ? D(a.x, p.x) : m.nos[i][j][0], a.y != null ? D(a.y, p.y) : m.nos[i][j][1]]; }
        return { no: [i, j], cor: vkCorTexto(m.cores[i][j]) };
    });
})();
// transformar (mover, girar, escala): os nós acompanham
const vkTransformarSemMalha = vkTransformar;
vkTransformar = function (o, M) { if (o.tipo === 'malha') { o.nos = o.nos.map(l => l.map(p => vkAp(M, p[0], p[1]))); return; } return vkTransformarSemMalha(o, M); };

// ferramenta Malha (U): clique numa forma cria; clique num nó pinta com a cor de preenchimento atual; arraste move o nó
function vkMalhaNoEm(sx, sy) {
    for (const { o } of vkTodos()) { if (o.tipo !== 'malha' || o.visivel === false) continue;
        for (let i = 0; i < o.nos.length; i++) for (let j = 0; j < o.nos[i].length; j++) { const [x, y] = vkTela(...o.nos[i][j]); if (Math.hypot(x - sx, y - sy) < 7) return { o, i, j }; } }
    return null;
}
const vkDsDownSemMalha = vkDsDown;
vkDsDown = function (A, x, y) {
    if (A.f !== 'malha') return vkDsDownSemMalha(A, x, y);
    const [sx, sy] = vkTela(x, y), no = vkMalhaNoEm(sx, sy);
    if (no) { A.modo = 'malha_no'; A.no = no; return true; }
    const f = vkObjEm(x, y, true);
    if (f && f.tipo === 'caminho') { vkCmdUi('criar_malha', { ids: [f.id], linhas: 2, colunas: 2, clarear: 40 }); return 'nada'; }
    vkToast('Clique numa forma para criar a malha, ou num nó para pintar'); return 'nada';
};
const vkDsMoveSemMalha = vkDsMove;
vkDsMove = function (A, x, y) { if (A.modo !== 'malha_no') return vkDsMoveSemMalha(A, x, y); A.para = [x, y]; vkDesenhar(); return true; };
const vkDsUpSemMalha = vkDsUp;
vkDsUp = async function (A, x, y) {
    if (A.modo !== 'malha_no') return vkDsUpSemMalha(A, x, y);
    const { o, i, j } = A.no;
    if (A.moveu) await vkCmdUi('malha_no', { id: o.id, i, j, x, y });
    else await vkCmdUi('malha_no', { id: o.id, i, j, cor: vkClone(VK.preench || { k: 'cmyk', v: [0, 0, 0, 0] }) });
};
// nós na tela (com a ferramenta Malha ou malha selecionada)
function vkMalhaSobreposicao(ctx) {
    if (VK.ferr !== 'malha' && VK.ferr !== 'direta') return;
    for (const { o } of vkTodos()) { if (o.tipo !== 'malha') continue;
        ctx.save(); ctx.strokeStyle = 'rgba(47,140,255,.7)'; ctx.lineWidth = 1;
        for (let i = 0; i < o.nos.length; i++) { ctx.beginPath(); o.nos[i].forEach((p, j) => { const q = vkTela(...p); j ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke(); }
        for (let j = 0; j < o.nos[0].length; j++) { ctx.beginPath(); o.nos.forEach((l, i) => { const q = vkTela(...l[j]); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke(); }
        ctx.fillStyle = '#fff'; o.nos.flat().forEach(p => { const [x, y] = vkTela(...p); ctx.fillRect(x - 3, y - 3, 6, 6); ctx.strokeRect(x - 3, y - 3, 6, 6); });
        ctx.restore(); }
}
