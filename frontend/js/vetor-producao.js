// Vetor Kanivete — PRODUÇÃO: faca de embalagem (corte + vinco como cores especiais em sobreimpressão, camada "Faca") e
// PINTURA DINÂMICA (Live Paint: pinta a região fechada por traços/formas sobrepostos sem mexer nas linhas).
const VK_FACA = { corte: 'spot:CutContour:0,100,0,0', vinco: 'spot:Vinco:100,0,0,0' };
function vkFacaCamada() {
    let c = VK.doc.camadas.find(x => x.nome === 'Faca');
    if (!c) { c = { id: vkId('c'), nome: 'Faca', visivel: true, trava: false, itens: [] }; VK.doc.camadas.push(c); }
    return c;
}
function vkFacaLinha(pts, tipo, fechado = false, nome) {
    const cor = vkCorDe(VK_FACA[tipo]);
    return { id: vkId(), tipo: 'caminho', regra: 'nonzero', nome: nome || (tipo === 'corte' ? 'faca (corte)' : 'vinco'), sobre: { p: false, t: true },
        subs: [{ fechado, pts: pts.map(([x, y]) => [x, y, x, y, x, y]) }], preench: null,
        traco: { cor, larg: 0.5, cap: 'butt', junc: 'miter', miter: 4, tracejado: tipo === 'vinco' ? [vkPT(3), vkPT(2)] : [], fase: 0 } };
}
(() => {
    // faca_caixa: caixa de abas invertidas (reverse tuck end, a mais comum em gráfica). larg × alt × prof (mm, a caixa montada),
    // x, y (canto do painel lateral esquerdo, mm da prancheta), cola (aba de cola, mm), aba (aba de encaixe, mm).
    // Corte = CutContour (magenta 100), vinco = Vinco (ciano 100, tracejado), ambos em sobreimpressão na camada "Faca".
    // Devolve os painéis (frente, verso, laterais, tampa, fundo) em mm para posicionar a arte.
    vkRegistrar('faca_caixa', 'faca de caixa', a => {
        const p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0], X = v => p.x + vkPT(+v), Y = v => p.y + vkPT(+v), D_ = v => vkPT(+v);
        const W = D_(a.larg || 60), H = D_(a.alt || 90), D = D_(a.prof || 30), g = D_(a.cola ?? 12), t = D_(a.aba ?? Math.min(15, (a.prof || 30) * 0.5)), h = D * 0.55, r = Math.min(t * 0.6, D_(5));
        const x0 = a.x != null ? X(a.x) : p.x + vkPT(10), y0 = a.y != null ? Y(a.y) : p.y + D + t + vkPT(10);
        const A = x0 + g, B = A + D, Cc = B + W, E = Cc + D, F = E + W, y1 = y0 + H;
        const arco = (xa, xb, ya, yt) => [[xa, ya], [xa, yt + r * 0.4], [xa + r * 0.3, yt + r * 0.1], [xa + r, yt], [xb - r, yt], [xb - r * 0.3, yt + r * 0.1], [xb, yt + r * 0.4], [xb, ya]];
        const contorno = [
            [A, y0], [A + 1.5, y0 - h], [B - 0.35 * D, y0 - h], [B - 0.6, y0 - 1.5], [B, y0],                 // aba contra pó esquerda (topo)
            [B, y0 - D], ...arco(B + 2, Cc - 2, y0 - D, y0 - D - t), [Cc, y0 - D], [Cc, y0],                   // tampa + aba de encaixe
            [Cc + 0.6, y0 - 1.5], [Cc + 0.35 * D, y0 - h], [E - 1.5, y0 - h], [E, y0], [F, y0],               // contra pó direita; verso
            [F, y1], [F, y1 + D], ...arco(F - 2, E + 2, y1 + D, y1 + D + t), [E, y1 + D], [E, y1],           // fundo (no verso) + encaixe
            [E - 0.6, y1 + 1.5], [E - 0.35 * D, y1 + h], [Cc + 1.5, y1 + h], [Cc, y1], [B, y1],               // contra pó direita (fundo)
            [B - 0.6, y1 + 1.5], [B - 0.35 * D, y1 + h], [A + 1.5, y1 + h], [A, y1],                         // contra pó esquerda (fundo)
            [x0, y1 - D_(4)], [x0, y0 + D_(4)]];                                                              // aba de cola
        const vincos = [[[A, y0], [A, y1]], [[B, y0], [B, y1]], [[Cc, y0], [Cc, y1]], [[E, y0], [E, y1]],
            [[B, y0], [Cc, y0]], [[B + 2, y0 - D], [Cc - 2, y0 - D]], [[A, y0], [B, y0]], [[Cc, y0], [E, y0]],
            [[E, y1], [F, y1]], [[E + 2, y1 + D], [F - 2, y1 + D]], [[A, y1], [B, y1]], [[Cc, y1], [E, y1]]];
        const cam = vkFacaCamada();
        const itens = [vkFacaLinha(contorno, 'corte', true), ...vincos.map(v => vkFacaLinha(v, 'vinco'))];
        const grp = { id: vkId(), tipo: 'grupo', nome: a.nome || `Faca ${a.larg || 60}×${a.alt || 90}×${a.prof || 30}`, itens };
        cam.itens.push(grp); VK.sel = [grp.id];
        const mm = (x, y, w, hh) => ({ x: vkR(vkMM(x - p.x)), y: vkR(vkMM(y - p.y)), larg: vkR(vkMM(w)), alt: vkR(vkMM(hh)) });
        return { id: grp.id, paineis: { lateral_esq: mm(A, y0, D, H), frente: mm(B, y0, W, H), lateral_dir: mm(Cc, y0, D, H), verso: mm(E, y0, W, H),
            tampa: mm(B, y0 - D, W, D), fundo: mm(E, y1, W, D), cola: mm(x0, y0, g, H) }, total_mm: mm(x0, y0 - D - t, F - x0, H + 2 * (D + t)) };
    });
    // pintura_dinamica: formas/traços (ids ou seleção) + pontos [[x,y]...] (mm) + cor → cada região fechada sob um ponto vira uma
    // forma pintada ATRÁS das linhas (as linhas continuam como estão, como no Live Paint)
    vkRegistrar('pintura_dinamica', 'pintura dinâmica', async a => {
        const objs = vkcAlvos(a); if (!objs.length) throw new Error('pintura_dinamica: selecione as formas/traços');
        const regs = await vkcRegioes(objs), cor = vkCorDe(a.cor || a.preench || 'C0 M68 Y72 K0'), novos = [];
        for (const [x, y] of [].concat(a.pontos || [])) {
            const [X, Y] = vkcPt(a, x, y), r = regs.find(q => vkcDentro(q.subs, X, Y)); if (!r) continue;
            novos.push({ id: vkId(), tipo: 'caminho', regra: 'nonzero', nome: 'pintura dinâmica', subs: r.subs, preench: cor, traco: null });
        }
        if (!novos.length) throw new Error('pintura_dinamica: nenhum ponto caiu numa região fechada');
        const ordem = vkTodos().map(x => x.o), base = objs.sort((p, q) => ordem.indexOf(p) - ordem.indexOf(q))[0], l = vkListaDe(base.id);
        l.splice(l.indexOf(base), 0, ...novos); VK.sel = novos.map(n => n.id);
        return { regioes: novos.length, ids: novos.map(n => n.id) };
    });
})();
function vkFacaDialogo() {
    vkModal(`<div class="ie-dlg-tit">Faca de caixa (abas invertidas)</div><div class="ie-dlg-corpo">
        <div class="vk-grade">${vkNum('Largura', 60, 'id="vkf-l" min="5"', 'mm', 1)}${vkNum('Altura', 90, 'id="vkf-a" min="5"', 'mm', 1)}${vkNum('Profund.', 30, 'id="vkf-p" min="5"', 'mm', 1)}${vkNum('Aba de cola', 12, 'id="vkf-c" min="5"', 'mm', 1)}</div>
        <div class="vk-nota">Medidas da caixa montada. Corte = CutContour (magenta) e vinco = Vinco (ciano tracejado), em sobreimpressão, na camada Faca.</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="vkf-ok">Criar</button></div>`, (m, fechar) => {
        m.querySelector('#vkf-ok').onclick = () => { const g = id => +m.querySelector(id).value; fechar(); vkCmdUi('faca_caixa', { larg: g('#vkf-l'), alt: g('#vkf-a'), prof: g('#vkf-p'), cola: g('#vkf-c') }); };
    });
}
// ferramenta Pintura dinâmica (K): com as formas selecionadas, o clique pinta a região fechada sob o cursor com a cor de preenchimento
VK_FERR.pintura = { nome: 'Pintura dinâmica (selecione as formas; clique nas regiões)', tecla: 'K', cursor: 'cell' };
VK_ICO.pintura = '<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14 7l3 3"/><circle cx="18" cy="18" r="2"/>';
const vkDsDownSemPintura = vkDsDown;
vkDsDown = function (A, x, y) {
    if (A.f !== 'pintura') return vkDsDownSemPintura(A, x, y);
    if (!VK.sel.length) { vkToast('Selecione as formas/traços que fecham as regiões'); return 'nada'; }
    const sel = VK.sel.slice(); vkCmdUi('pintura_dinamica', { ids: sel, pontos: [[x, y]], un: 'pt', cor: vkClone(VK.preench || { k: 'cmyk', v: [0, 68, 72, 0] }) }).then(() => { VK.sel = sel; vkDesenhar(); });
    return 'nada';
};
(() => {
    const o = VK_MENUS.find(x => x[0] === 'Objeto'); if (!o) return;
    o[1].push('-', ['Faca de caixa (abas invertidas)…', '', () => vkFacaDialogo()], ['Pintura dinâmica (ferramenta)', 'K', () => vkFerramenta('pintura')]);
})();
