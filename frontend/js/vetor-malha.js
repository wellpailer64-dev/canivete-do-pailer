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
function vkMalhaDesenhar(ctx, o) {   // desenhada num canvas à parte na resolução da tela (cache por malha + zoom), fatias de ~3 px
    const T = ctx.getTransform(), k = Math.hypot(T.a, T.b) || 1, b = vkBox(o), W = Math.ceil((b[2] - b[0]) * k) + 2, H = Math.ceil((b[3] - b[1]) * k) + 2;
    if (W < 1 || H < 1 || W * H > 5e7) return;
    const chave = JSON.stringify([o.nos, o.cores, Math.round(k * 100), VK.corTela.size]);
    let cv = VK.malhaCache.get(o.id);
    if (!cv || cv._chave !== chave) {
        cv = new OffscreenCanvas(W, H); cv._chave = chave; const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, -b[0] * k + 1, -b[1] * k + 1);
        const N = o.nos, C = o.cores, lerp = (a, bb, t) => a.map((v, i) => v + (bb[i] - v) * t);
        for (let i = 0; i < N.length - 1; i++) for (let j = 0; j < N[0].length - 1; j++) {
            const p00 = N[i][j], p01 = N[i][j + 1], p10 = N[i + 1][j], p11 = N[i + 1][j + 1];
            const c00 = vkMalhaCor(C[i][j]), c01 = vkMalhaCor(C[i][j + 1]), c10 = vkMalhaCor(C[i + 1][j]), c11 = vkMalhaCor(C[i + 1][j + 1]);
            const lado = Math.max(Math.hypot(p01[0] - p00[0], p01[1] - p00[1]), Math.hypot(p10[0] - p00[0], p10[1] - p00[1]), Math.hypot(p11[0] - p10[0], p11[1] - p10[1])) * k;
            const n = Math.max(o.auto3d ? 1 : 6, Math.min(80, Math.ceil(lado / 3)));
            const P = (u, v) => lerp(lerp(p00, p01, u), lerp(p10, p11, u), v), K = (u, v) => lerp(lerp(c00, c01, u), lerp(c10, c11, u), v);
            for (let a = 0; a < n; a++) for (let bb = 0; bb < n; bb++) {
                const u0 = bb / n, u1 = (bb + 1) / n, v0 = a / n, v1 = (a + 1) / n, q = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
                const css = vkCss({ k: 'cmyk', v: K((u0 + u1) / 2, (v0 + v1) / 2).map(x => Math.round(x * 2) / 2) });
                c.beginPath(); c.moveTo(...q[0]); c.lineTo(...q[1]); c.lineTo(...q[2]); c.lineTo(...q[3]); c.closePath();
                c.fillStyle = css; c.strokeStyle = css; c.lineWidth = 0.8 / k; c.fill(); c.stroke();   // traço da mesma cor: sem fresta
            }
        }
        VK.malhaCache.set(o.id, cv);
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cv, Math.round(T.a * b[0] + T.c * b[1] + T.e) - 1, Math.round(T.b * b[0] + T.d * b[1] + T.f) - 1); ctx.restore();
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
