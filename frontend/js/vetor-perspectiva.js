// Vetor Kanivete — GRADE DE PERSPECTIVA (Shift+P do Illustrator): 1 ou 2 pontos de fuga, planos esquerdo / direito / chão.
// Câmera de verdade (pinhole): o canto onde os planos se encontram fica no chão em (centro, solo) e ali 1 mm = 1 mm; tudo o que
// vai para o fundo encolhe na proporção certa. doc.perspectiva = {tipo, horizonte, pf1, pf2, centro, solo (pt absolutos), mostrar}.
// Arte colocada num plano é projetada ponto a ponto (curvas subdivididas) — vetorial.
function vkPersp() {
    const g = VK.doc && VK.doc.perspectiva; if (!g) return null;
    const cx = g.centro, hy = g.horizonte, eye = g.solo - hy; let D1, D2, f;
    if (g.tipo === 1) { f = g.focal || 600; D1 = [-1, 0, 0]; D2 = [0, 0, 1]; }
    else { const a = g.pf1 - cx, b = g.pf2 - cx; f = Math.sqrt(Math.max(1, -a * b)); const n1 = Math.hypot(a, f), n2 = Math.hypot(b, f); D1 = [a / n1, 0, f / n1]; D2 = [b / n2, 0, f / n2]; }
    const C = [0, 0, f], Up = [0, 1, 0];
    const proj = P => { const Z = Math.max(1e-3, P[2]); return [cx + f * P[0] / Z, hy - f * (P[1] - eye) / Z]; };
    const em = (plano, u, v) => {   // coordenadas do plano (pt) → ponto 3D
        const [A, B] = plano === 'esquerdo' ? [D1, Up] : plano === 'chao' ? [D2, D1] : [D2, Up];
        return [C[0] + A[0] * u + B[0] * v, C[1] + A[1] * u + B[1] * v, C[2] + A[2] * u + B[2] * v];
    };
    return { g, cx, hy, f, D1, D2, C, proj, em, P: (plano, u, v) => proj(em(plano, u, v)) };
}
function vkPerspDesenhar(ctx) {   // a grade na tela (azul = esquerdo, laranja = direito, verde = chão)
    const K = vkPersp(); if (!K || K.g.mostrar === false) return;
    const L = (a, b, cor, w = 1) => { const p = vkTela(...a), q = vkTela(...b); ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke(); };
    ctx.save(); const passo = vkPT(K.g.passo_mm || 10), N = K.g.celulas || 14, ALT = K.g.altura_celulas || 8;
    const pr = VK.doc.pranchetas.find(p => K.cx >= p.x && K.cx <= p.x + p.w) || VK.doc.pranchetas[0];
    L([pr.x - 2000, K.hy], [pr.x + pr.w + 2000, K.hy], 'rgba(120,120,120,.8)', 1);
    for (const [plano, cor] of [['esquerdo', 'rgba(47,120,255,.45)'], ['direito', 'rgba(255,120,40,.45)']]) {
        for (let i = 0; i <= N; i++) L(K.P(plano, i * passo, 0), K.P(plano, i * passo, ALT * passo), cor);
        for (let j = 0; j <= ALT; j++) L(K.P(plano, 0, j * passo), K.P(plano, N * passo, j * passo), cor);
    }
    for (let i = 0; i <= N; i++) { L(K.P('chao', i * passo, 0), K.P('chao', i * passo, N * passo), 'rgba(40,170,90,.35)'); L(K.P('chao', 0, i * passo), K.P('chao', N * passo, i * passo), 'rgba(40,170,90,.35)'); }
    ctx.fillStyle = '#ff2fd0'; for (const x of (K.g.tipo === 1 ? [K.cx] : [K.g.pf1, K.g.pf2])) { const [sx, sy] = vkTela(x, K.hy); ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill(); }
    ctx.restore();
}
const vkMalhaSobSemPersp = vkMalhaSobreposicao;
vkMalhaSobreposicao = function (ctx) { vkMalhaSobSemPersp(ctx); vkPerspDesenhar(ctx); };
function vkPerspQuad(K, plano, u, v, w, h) { const pts = [K.P(plano, u, v), K.P(plano, u + w, v), K.P(plano, u + w, v + h), K.P(plano, u, v + h)]; return [{ fechado: true, pts: pts.map(p => [p[0], p[1], p[0], p[1], p[0], p[1]]) }]; }
(() => {
    const exige = () => { const K = vkPersp(); if (!K) throw new Error('crie a grade antes: grade_perspectiva'); return K; };
    // grade_perspectiva: tipo 1|2, horizonte (mm, do topo da prancheta), pf1/pf2 (mm, x dos pontos de fuga; 2 pontos), centro (x do canto,
    // padrão o meio entre os pontos), solo (mm, linha do chão no canto), passo_mm (tamanho da célula), mostrar, apagar
    vkRegistrar('grade_perspectiva', 'grade de perspectiva', a => {
        if (a.apagar) { delete VK.doc.perspectiva; return { apagada: true }; }
        const p = (a.prancheta && VK.doc.pranchetas.find(q => q.id === a.prancheta || q.nome === a.prancheta)) || VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0];
        const X = v => p.x + vkPT(+v), Y = v => p.y + vkPT(+v), g0 = VK.doc.perspectiva || {}, mmW = vkMM(p.w), mmH = vkMM(p.h);
        const tipo = +(a.tipo || g0.tipo || 2), pf1 = a.pf1 != null ? X(a.pf1) : g0.pf1 ?? X(-mmW * 0.25), pf2 = a.pf2 != null ? X(a.pf2) : g0.pf2 ?? X(mmW * 1.25);
        const centro = a.centro != null ? X(a.centro) : (a.pf1 != null || a.pf2 != null || g0.centro == null) ? (tipo === 1 ? (a.pf1 != null ? pf1 : X(mmW / 2)) : (pf1 + pf2) / 2) : g0.centro;
        VK.doc.perspectiva = { tipo, pf1, pf2, centro, horizonte: a.horizonte != null ? Y(a.horizonte) : g0.horizonte ?? Y(mmH * 0.4), solo: a.solo != null ? Y(a.solo) : g0.solo ?? Y(mmH * 0.85),
            passo_mm: +(a.passo_mm || g0.passo_mm || 10), mostrar: a.mostrar ?? g0.mostrar ?? true, ...(a.focal ? { focal: vkPT(+a.focal) } : g0.focal ? { focal: g0.focal } : {}) };
        const K = vkPersp(); return { tipo, foco_mm: vkR(vkMM(K.f), 1), mostrar: VK.doc.perspectiva.mostrar };
    });
    const conv = a => (v => a.un === 'pt' ? +v : vkPT(+v));
    // perspectiva_colocar: arte (ids/nomes ou seleção) → plano esquerdo|direito|chao, na posição u (mm ao longo do plano, a partir do canto)
    // e v (mm de altura; no chão = profundidade), escala %. Os originais saem (manter: true deixa)
    vkRegistrar('perspectiva_colocar', 'colocar na perspectiva', a => {
        const K = exige(), D = conv(a), plano = a.plano || 'direito', objs = vkTxAlvos(a), b = vkBoxUniao(objs);
        if (!['esquerdo', 'direito', 'chao'].includes(plano)) throw new Error('perspectiva_colocar: plano esquerdo | direito | chao');
        const s = (a.escala ?? 100) / 100, u0 = D(a.u || 0), v0 = D(a.v || 0);
        const M = (x, y) => K.P(plano, plano === 'esquerdo' ? u0 + (b[2] - x) * s : u0 + (x - b[0]) * s, v0 + (b[3] - y) * s);
        const cams = vk3dArteCaminhos(objs).map(c => ({ ...c, id: vkId(), subs: c.subs.map(sb => { const d = vkSubdividir(sb, 6); return { fechado: d.fechado, pts: d.pts.map(q => [...M(q[0], q[1]), ...M(q[2], q[3]), ...M(q[4], q[5])]) }; }),
            ...(c.traco && c.traco.larg ? { traco: { ...c.traco, larg: c.traco.larg * s } } : {}) }));
        const g = { id: vkId(), tipo: 'grupo', nome: (a.nome || 'Arte') + ` (perspectiva ${plano})`, itens: cams };
        const l = vkListaDe(objs.at(-1).id); l.splice(l.indexOf(objs.at(-1)) + 1, 0, g);
        if (!a.manter) for (const o of objs) { const ll = vkListaDe(o.id); ll.splice(ll.indexOf(o), 1); }
        VK.sel = [g.id]; return { id: g.id, caminhos: cams.length };
    });
    // perspectiva_retangulo: plano, u, v, larg, alt (mm), preench/traco/nome — já desenhado em perspectiva
    vkRegistrar('perspectiva_retangulo', 'retângulo em perspectiva', a => {
        const K = exige(), D = conv(a), o = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkPerspQuad(K, a.plano || 'direito', D(a.u || 0), D(a.v || 0), D(a.larg || 50), D(a.alt || 30)),
            preench: a.preench ? vkCorDe(a.preench) : vkCorDe('0K'), traco: a.traco && a.traco !== 'nenhum' ? { cor: vkCorDe(a.traco), larg: 0.5, cap: 'butt', junc: 'miter', miter: 4, tracejado: [], fase: 0 } : null, ...(a.nome ? { nome: a.nome } : {}) };
        const cam = VK.doc.camadas.find(c => c.id === VK.camadaAtiva) || VK.doc.camadas.at(-1); cam.itens.push(o); VK.sel = [o.id]; return { id: o.id };
    });
    // perspectiva_caixa: bloco no chão — u (mm ao longo do plano direito), w (ao longo do esquerdo), larg (direito), prof (esquerdo), alt;
    // cor (lateral direita); esquerda e topo saem sombreadas a partir dela (ou cor_esquerda/cor_topo)
    vkRegistrar('perspectiva_caixa', 'caixa em perspectiva', a => {
        const K = exige(), D = conv(a), u = D(a.u || 0), w = D(a.w || 0), L = D(a.larg || 40), Pf = D(a.prof || 30), Hh = D(a.alt || 30);
        const base = vkCorDe(a.cor || 'C100 M55 Y35 K45'), sh = l => vk3dTom(base, { l, s: 0 });
        const pt3 = (du, dw, h) => [K.C[0] + K.D2[0] * (u + du) + K.D1[0] * (w + dw), h, K.C[2] + K.D2[2] * (u + du) + K.D1[2] * (w + dw)];
        const quad = ps => [{ fechado: true, pts: ps.map(P => K.proj(P)).map(p => [p[0], p[1], p[0], p[1], p[0], p[1]]) }];
        const faces = [
            { nome: 'lado direito', subs: quad([pt3(0, 0, 0), pt3(L, 0, 0), pt3(L, 0, Hh), pt3(0, 0, Hh)]), cor: a.cor_direita ? vkCorDe(a.cor_direita) : sh(1) },
            { nome: 'lado esquerdo', subs: quad([pt3(0, 0, 0), pt3(0, Pf, 0), pt3(0, Pf, Hh), pt3(0, 0, Hh)]), cor: a.cor_esquerda ? vkCorDe(a.cor_esquerda) : sh(0.72) },
        ];
        const eye = K.g.solo - K.g.horizonte; if (Hh < eye) faces.push({ nome: 'topo', subs: quad([pt3(0, 0, Hh), pt3(L, 0, Hh), pt3(L, Pf, Hh), pt3(0, Pf, Hh)]), cor: a.cor_topo ? vkCorDe(a.cor_topo) : sh(1.18) });
        const g = { id: vkId(), tipo: 'grupo', nome: a.nome || 'Caixa em perspectiva', itens: faces.map(f => ({ id: vkId(), tipo: 'caminho', regra: 'nonzero', nome: f.nome, subs: f.subs, preench: f.cor, traco: { cor: f.cor, larg: 0.2, cap: 'butt', junc: 'round', miter: 4, tracejado: [], fase: 0 } })) };
        const cam = VK.doc.camadas.find(c => c.id === VK.camadaAtiva) || VK.doc.camadas.at(-1); cam.itens.push(g); VK.sel = [g.id];
        return { id: g.id, faces: faces.map(f => f.nome) };
    });
})();
(() => {
    const m = VK_MENUS.find(x => x[0] === 'Exibir'); if (m) m[1].push('-', ['Grade de perspectiva (2 pontos)', 'Shift+Ctrl+I', () => vkCmdUi('grade_perspectiva', VK.doc.perspectiva ? { mostrar: VK.doc.perspectiva.mostrar === false } : { tipo: 2 })],
        ['Grade de perspectiva (1 ponto)', '', () => vkCmdUi('grade_perspectiva', { tipo: 1 })], ['Apagar grade de perspectiva', '', () => vkCmdUi('grade_perspectiva', { apagar: true })]);
    const o = VK_MENUS.find(x => x[0] === 'Objeto'); if (!o) return;
    const colocar = plano => { const K = vkPersp(); if (!K) return vkToast('Crie a grade: Exibir › Grade de perspectiva'); const b = vkBoxUniao(VK.sel.map(vkObj).filter(Boolean));
        const u = plano === 'esquerdo' ? Math.max(0, K.cx - b[2]) : Math.max(0, b[0] - K.cx), v = Math.max(0, K.g.solo - b[3]);
        vkCmdUi('perspectiva_colocar', { plano, u, v }); };
    o[1].push('-', ['Perspectiva: colocar no plano direito', '', () => colocar('direito')], ['Perspectiva: colocar no plano esquerdo', '', () => colocar('esquerdo')], ['Perspectiva: colocar no chão', '', () => colocar('chao')]);
})();
