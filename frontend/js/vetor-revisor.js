// Vetor Kanivete — REVISOR (VKN.revisar / comando revisar): o que um diretor de arte apontaria, em texto curto, para o agente
// não precisar abrir imagem a cada rodada. Regras: texto fora da prancheta/margem, textos sobrepostos, contraste baixo
// (WCAG: 4,5 texto normal, 3 texto grande), texto pequeno, texto que transborda a caixa, objeto solto fora das pranchetas,
// prancheta vazia. Devolve {ok, n, itens: [{regra, prancheta, id, quem, msg}]} (máx. 40 itens).
function vkRevLum(c) {   // luminância relativa da cor como aparece na tela (prova de cor)
    const m = String(vkCss(c && c.k === 'grad' ? c.paradas[0].cor : c) || 'rgb(0,0,0)').match(/\d+(\.\d+)?/g) || [0, 0, 0];
    const f = v => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
}
function vkRevContraste(a, b) { const x = vkRevLum(a), y = vkRevLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
async function vkRevisar(a = {}) {
    await vkGeosProntas();
    const itens = [], grupos = new Map();
    const add = (regra, p, o, msg, chave, nivel = 'aviso') => {
        const it = { regra, nivel, prancheta: p ? p.nome : null, id: o ? o.id : null, quem: o ? (o.nome || (o.tipo === 'texto' ? String(o.conteudo).replace(/\s+/g, ' ').slice(0, 24) : o.tipo)) : null, msg };
        if (!chave) return itens.push(it);
        const g = grupos.get(chave); if (g) { g.vezes++; if (g.onde.length < 4 && !g.onde.includes(it.prancheta)) g.onde.push(it.prancheta); return; }
        it.vezes = 1; it.onde = [it.prancheta]; grupos.set(chave, it); itens.push(it);
    };
    const todos = vkTodos().filter(x => x.o.visivel !== false && x.cam.visivel !== false).map(x => x.o);
    const topo = VK.doc.camadas.flatMap(c => c.visivel === false ? [] : c.itens.filter(o => o.visivel !== false));   // objetos de 1º nível (grupos inteiros)
    const P = VK.doc.pranchetas, tela = VK.doc.destino === 'tela', margem = a.margem != null ? vkPT(+a.margem) : null;
    const dentroDe = b => P.find(p => (b[0] + b[2]) / 2 >= p.x && (b[0] + b[2]) / 2 <= p.x + p.w && (b[1] + b[3]) / 2 >= p.y && (b[1] + b[3]) / 2 <= p.y + p.h);
    const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]), inter = (p, q) => [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.min(p[2], q[2]), Math.min(p[3], q[3])];
    const textos = todos.filter(o => o.tipo === 'texto');
    for (const o of topo) { const b = vkBox(o); if (!isFinite(b[0])) continue; if (!P.some(p => b[2] > p.x - (VK.doc.sangria || 0) && b[0] < p.x + p.w + (VK.doc.sangria || 0) && b[3] > p.y && b[1] < p.y + p.h)) add('solto', null, o, 'objeto fora de todas as pranchetas'); }
    for (const p of P) if (!topo.some(o => { const b = vkBox(o); return isFinite(b[0]) && b[2] > p.x && b[0] < p.x + p.w && b[3] > p.y && b[1] < p.y + p.h; })) add('vazia', p, null, 'prancheta vazia');
    for (const o of textos) {
        const g = vkGeo(o), b = vkBox(o), p = dentroDe(b); if (!p || !isFinite(b[0])) continue;
        const t = vkTxRaiz(o), tam = (t.tam || 12) * (vkEsc(o.m) || 1);
        if (!String(t.conteudo || '').trim()) { add('vazio', p, o, 'texto vazio'); continue; }
        if (g && g.transborda) add('transborda', p, o, 'o texto não cabe na caixa (aumente a caixa ou encadeie)');
        if (b[0] < p.x - 0.5 || b[1] < p.y - 0.5 || b[2] > p.x + p.w + 0.5 || b[3] > p.y + p.h + 0.5) add('fora', p, o, 'texto passa da borda da prancheta');
        else { const m = margem ?? Math.min(p.w, p.h) * (tela ? 0.04 : 0.03) + (tela ? 0 : vkPT(3));
            if (b[0] < p.x + m - 0.5 || b[1] < p.y + m - 0.5 || b[2] > p.x + p.w - m + 0.5 || b[3] > p.y + p.h - m + 0.5) add('margem', p, o, `texto a menos de ${vkR(vkMM(m), 1)} mm da borda`); }
        if (b[0] < p.x - 0.5 || b[2] > p.x + p.w + 0.5) itens.at(-1) && itens.at(-1).regra === 'fora' && (itens.at(-1).nivel = 'erro');
        if (tam < (tela ? 5 : 6)) add('pequeno', p, o, `texto de ${vkR(tam, 1)} pt`, `p|${vkR(tam, 1)}`);
        // contraste: cor do texto × o que está logo abaixo do centro (o objeto mais alto sob o ponto; nada = papel)
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, i0 = todos.indexOf(o);
        const baixo = todos.slice(0, i0).reverse().find(x => x.tipo !== 'texto' && x.tipo !== 'grupo' && (x.preench || x.tipo === 'imagem' || x.tipo === 'malha') && vkAcerta(x, cx, cy, 0));
        if (baixo && (baixo.tipo === 'imagem' || baixo.tipo === 'malha')) continue;   // foto/malha: contraste varia, o olho decide
        const fundo = baixo ? baixo.preench : { k: 'cmyk', v: [0, 0, 0, 0] }, cor = t.preench;
        if (cor && fundo && cor.k !== 'pad' && fundo.k !== 'pad') { const r = vkRevContraste(cor, fundo), min = tam >= 18 ? 3 : 4.5;
            if (r < min) add('contraste', p, o, `${vkCorTexto(cor)} sobre ${vkCorTexto(fundo)}: ${vkR(r, 2)}:1 (mínimo ${min}:1${min === 3 ? ', texto grande' : ''})`,
                `c|${vkCorTexto(cor)}|${vkCorTexto(fundo)}|${min}`, r < 3 ? 'erro' : 'aviso'); }
    }
    for (let i = 0; i < textos.length; i++) for (let j = i + 1; j < textos.length; j++) {   // textos sobrepostos
        const p = vkBox(textos[i]), q = vkBox(textos[j]), r = inter(p, q), s = area(r);
        if (s > 0.15 * Math.min(area(p), area(q)) && !textos[i].anterior && !textos[j].anterior) add('sobreposto', dentroDe(p), textos[j], `encosta em "${String(vkTxRaiz(textos[i]).conteudo).slice(0, 20)}"`);
    }
    for (const it of itens) if (['solto', 'transborda', 'sobreposto'].includes(it.regra)) it.nivel = 'erro';
    const ordem = ['solto', 'fora', 'transborda', 'sobreposto', 'contraste', 'margem', 'pequeno', 'vazio', 'vazia'];
    itens.sort((x, y) => (x.nivel === 'erro' ? 0 : 1) - (y.nivel === 'erro' ? 0 : 1) || ordem.indexOf(x.regra) - ordem.indexOf(y.regra));
    const cont = {}; itens.forEach(x => cont[x.regra] = (cont[x.regra] || 0) + (x.vezes || 1));
    const erros = itens.filter(x => x.nivel === 'erro').length;
    return { ok: !erros, erros, avisos: itens.length - erros, por_regra: cont, itens: itens.slice(0, a.max || 40) };
}
vkRegistrar('revisar', 'revisar (diretor de arte)', a => vkRevisar(a || {}), true);
window.VKN && (VKN.revisar = a => vkRevisar(a || {}));
