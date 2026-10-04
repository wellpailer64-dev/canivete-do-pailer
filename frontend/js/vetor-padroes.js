// Vetor Kanivete — AMOSTRAS DE PADRÃO (Objeto › Padrão › Criar, do Illustrator).
// doc.padroes = {id: {nome, w, h (pt, a "peça" que se repete), itens: [objetos em coordenadas da peça]}}.
// Cor de padrão: {k:'pad', id, esc (%), ang (graus), dx, dy (pt)} — vai no preenchimento ou no traço como qualquer cor.
// Tela: a peça renderizada num canvas na resolução do zoom → createPattern. PDF: tiling pattern vetorial (vetor_exportar).
VK.padCache = new Map();
function vkPad(id) { return (VK.doc.padroes || {})[id]; }
function vkPadMatriz(c) {   // peça → documento (escala, giro, deslocamento), ancorado na origem do documento
    const s = (c.esc || 100) / 100, r = (c.ang || 0) * Math.PI / 180, cs = Math.cos(r) * s, sn = Math.sin(r) * s;
    return [cs, sn, -sn, cs, c.dx || 0, c.dy || 0];
}
function vkPadCanvas(id, k) {
    const P = vkPad(id); if (!P) return null;
    k = Math.min(16, Math.max(0.25, k)); if (P.w * k > 2048 || P.h * k > 2048) k = 2048 / Math.max(P.w, P.h);
    const chave = `${id}|${Math.round(k * 8) / 8}|${P._v || 0}|${VK.corTela.size}`;   // muda quando a prova de cor (ICC) chega
    let cv = VK.padCache.get(chave); if (cv) return { cv, k };
    cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(P.w * k)); cv.height = Math.max(1, Math.round(P.h * k));
    const cx = cv.getContext('2d'); cx.scale(cv.width / P.w, cv.height / P.h);
    for (const o of P.itens) vkDesenharObj(cx, o);
    if (P.itens.some(o => o.tipo === 'texto' && !vkGeo(o))) return { cv, k };   // texto ainda vindo: não guarda (redesenha depois)
    if (VK.padCache.size > 60) VK.padCache.clear();
    VK.padCache.set(chave, cv); return { cv, k };
}
// vkEstiloCanvas com padrão (m = matriz do texto: o padrão está em coordenadas do documento)
const vkEstiloCanvasOrig = vkEstiloCanvas;
vkEstiloCanvas = function (ctx, c, m = null) {
    if (!c || c.k !== 'pad') return vkEstiloCanvasOrig(ctx, c, m);
    const T = ctx.getTransform(), dev = Math.hypot(T.a, T.b), esc = (c.esc || 100) / 100;
    const r = vkPadCanvas(c.id, dev * esc); if (!r) return '#888';
    const pat = ctx.createPattern(r.cv, 'repeat'); const P = vkPad(c.id);
    let M = vkMul([P.w / r.cv.width, 0, 0, P.h / r.cv.height, 0, 0], vkPadMatriz(c));
    if (m) M = vkMul(M, vkInv(m));
    pat.setTransform(new DOMMatrix(M));
    return pat;
};
// texto e cor
const vkCorDeOrig = vkCorDe;
vkCorDe = function (s) {
    if (typeof s === 'string' && /^padr[aã]o:/i.test(s.trim())) {
        const n = s.trim().slice(s.indexOf(':') + 1).trim().toLowerCase();
        const e = Object.entries(VK.doc.padroes || {}).find(([id, P]) => id === n || P.nome.toLowerCase() === n);
        if (!e) throw new Error(`padrão "${n}" não existe; há: ${Object.values(VK.doc.padroes || {}).map(P => P.nome).join(', ') || 'nenhum (crie com criar_padrao)'}`);
        return { k: 'pad', id: e[0] };
    }
    return vkCorDeOrig(s);
};
const vkCorTextoOrig = vkCorTexto;
vkCorTexto = function (c) { return c && c.k === 'pad' ? `padrão ${(vkPad(c.id) || {}).nome || '?'}${c.esc && c.esc !== 100 ? ' ' + c.esc + '%' : ''}${c.ang ? ' ' + c.ang + '°' : ''}` : vkCorTextoOrig(c); };
const vkCssOrig = vkCss;
vkCss = function (c) {   // amostra pequena / prova: a cor do 1º objeto da peça
    if (c && c.k === 'pad') { const P = vkPad(c.id), o = P && P.itens.find(x => x.preench || (x.traco && x.traco.cor)); return o ? vkCssOrig(o.preench || o.traco.cor) : '#888'; }
    return vkCssOrig(c);
};
// fechamento/separações: as cores de dentro da peça contam
const vkCoresOrig = vkCores;
vkCores = function (o) {
    const out = vkCoresOrig(o).filter(c => c.k !== 'pad');
    for (const c of [o.preench, o.traco && o.traco.cor]) if (c && c.k === 'pad') for (const x of (vkPad(c.id) || { itens: [] }).itens) out.push(...vkCores(x));
    return out;
};
(() => {
    // criar_padrao: objetos selecionados (ids/nomes) viram a peça; espaco = folga em mm em volta; larg/alt = tamanho da peça (mm)
    vkRegistrar('criar_padrao', 'criar padrão', a => {
        const objs = vkTxAlvos(a); const b = vkBoxUniao(objs); if (!b) throw new Error('criar_padrao: nada para virar padrão');
        const g = a.un === 'pt' ? +(a.espaco || 0) : vkPT(+(a.espaco || 0));
        const w = a.larg ? (a.un === 'pt' ? +a.larg : vkPT(+a.larg)) : b[2] - b[0] + g, h = a.alt ? (a.un === 'pt' ? +a.alt : vkPT(+a.alt)) : b[3] - b[1] + g;
        const reid = o => { o.id = vkId(); if (o.itens) o.itens.forEach(reid); return o; };
        const itens = objs.map(o => reid(vkClone(o)));
        itens.forEach(o => vkTransformar(o, [1, 0, 0, 1, -b[0] + (w - (b[2] - b[0])) / 2, -b[1] + (h - (b[3] - b[1])) / 2]));
        const id = vkId('p'), nome = a.nome || `Padrão ${Object.keys(VK.doc.padroes || {}).length + 1}`;
        VK.doc.padroes = VK.doc.padroes || {}; VK.doc.padroes[id] = { nome, w, h, itens };
        VK.doc.amostras.push({ id: vkId('a'), nome, cor: { k: 'pad', id } });
        if (a.apagar_originais) objs.forEach(o => { const l = vkListaDe(o.id); l.splice(l.indexOf(o), 1); });
        return { id, nome, larg_mm: vkR(vkMM(w)), alt_mm: vkR(vkMM(h)), objetos: itens.length };
    });
    // padrao: aplica o padrão (nome) no preenchimento (ou traço: traco true), com escala %, angulo, dx/dy (mm)
    vkRegistrar('padrao', 'aplicar padrão', a => {
        const base = vkCorDe('padrao:' + (a.nome || a.padrao || ''));
        const c = { ...base, ...(a.escala ? { esc: +a.escala } : {}), ...(a.angulo ? { ang: +a.angulo } : {}),
            ...(a.dx ? { dx: a.un === 'pt' ? +a.dx : vkPT(+a.dx) } : {}), ...(a.dy ? { dy: a.un === 'pt' ? +a.dy : vkPT(+a.dy) } : {}) };
        const objs = vkTxAlvos(a);
        for (const o of objs) { if (a.traco) { if (o.traco) o.traco = { ...o.traco, cor: vkClone(c) }; } else if (o.tipo !== 'imagem') o.preench = vkClone(c); }
        return { aplicado: objs.length, cor: vkCorTexto(c) };
    });
})();
// exportar: texto dentro das peças também leva o spec pronto
async function vkPadDocPy(d) {
    for (const [id, P] of Object.entries(d.padroes || {})) {
        const src = vkPad(id); if (!src) continue;
        for (let i = 0; i < src.itens.length; i++) if (src.itens[i].tipo === 'texto') { await vkGeoPronta(src.itens[i]); const sp = vkTxSpec(src.itens[i]); if (sp) P.itens[i]._spec = sp; }
    }
}
