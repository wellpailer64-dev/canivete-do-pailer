// Vetor Kanivete — SÍMBOLOS (painel Símbolos do Illustrator): a arte é definida uma vez (doc.simbolos = {id: {nome, itens}},
// centrada na origem) e usada em instâncias {tipo:'instancia', simbolo, m}. Redefinir o símbolo muda todas as instâncias;
// soltar a instância vira grupo comum. No PDF cada instância desenha a definição com a sua matriz.
function vkSimbolo(id) { return (VK.doc.simbolos || {})[id]; }
const vkCoresSimOrig = vkCores;
vkCores = function (o) { const out = vkCoresSimOrig(o); if (o.tipo === 'instancia') for (const f of (vkSimbolo(o.simbolo) || { itens: [] }).itens) out.push(...vkCores(f)); return out; };
(() => {
    const achar = n => { const k = String(n || '').toLowerCase(); const e = Object.entries(VK.doc.simbolos || {}).find(([id, S]) => id === n || S.nome.toLowerCase() === k);
        if (!e) throw new Error(`símbolo "${n}" não existe; há: ${Object.values(VK.doc.simbolos || {}).map(S => S.nome).join(', ') || 'nenhum'}`); return e; };
    const definicao = objs => {   // clones centrados na origem
        const b = vkBoxUniao(objs); if (!b) throw new Error('nada selecionado');
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, reid = o => { o.id = vkId(); if (o.itens) o.itens.forEach(reid); return o; };
        const itens = objs.map(o => reid(vkClone(o))); itens.forEach(o => vkTransformar(o, [1, 0, 0, 1, -cx, -cy]));
        return { itens, cx, cy };
    };
    // criar_simbolo: a seleção vira símbolo; substituir (padrão true) troca a seleção por uma instância no mesmo lugar
    vkRegistrar('criar_simbolo', 'criar símbolo', a => {
        const objs = vkTxAlvos(a).filter(o => o.tipo !== 'instancia' || true), d = definicao(objs);
        const id = vkId('s'), nome = a.nome || `Símbolo ${Object.keys(VK.doc.simbolos || {}).length + 1}`;
        VK.doc.simbolos = VK.doc.simbolos || {}; VK.doc.simbolos[id] = { nome, itens: d.itens };
        let inst = null;
        if (a.substituir !== false) {
            const ultimo = objs[objs.length - 1], l = vkListaDe(ultimo.id);
            inst = { id: vkId(), tipo: 'instancia', simbolo: id, m: [1, 0, 0, 1, d.cx, d.cy], nome };
            l.splice(l.indexOf(ultimo) + 1, 0, inst);
            objs.forEach(o => { const ll = vkListaDe(o.id); ll.splice(ll.indexOf(o), 1); });
            VK.sel = [inst.id];
        }
        return { id, nome, instancia: inst && inst.id };
    });
    // colocar_simbolo: nome, x, y (centro, mm), escala %, angulo
    vkRegistrar('colocar_simbolo', 'colocar símbolo', a => {
        const [id, S] = achar(a.nome || a.simbolo), p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0];
        const X = a.un === 'pt' ? +(a.x || 0) : p.x + vkPT(+(a.x || 0)), Y = a.un === 'pt' ? +(a.y || 0) : p.y + vkPT(+(a.y || 0));
        const s = (a.escala || 100) / 100, r = -(a.angulo || 0) * Math.PI / 180;
        const o = { id: vkId(), tipo: 'instancia', simbolo: id, m: [Math.cos(r) * s, Math.sin(r) * s, -Math.sin(r) * s, Math.cos(r) * s, X, Y], nome: a.nome_obj || S.nome };
        const cam = VK.doc.camadas.find(c => c.id === VK.camadaAtiva && !c.trava) || VK.doc.camadas.filter(c => !c.trava).pop();
        cam.itens.push(o); VK.sel = [o.id];
        return { id: o.id, simbolo: S.nome, caixa_mm: vkCaixaMM(o) };
    });
    // redefinir_simbolo: nome + objetos (ids/nomes) = a nova arte; todas as instâncias mudam
    vkRegistrar('redefinir_simbolo', 'redefinir símbolo', a => {
        const [id, S] = achar(a.simbolo || a.nome_simbolo), objs = vkTxAlvos(a).filter(o => !(o.tipo === 'instancia' && o.simbolo === id));
        S.itens = definicao(objs).itens;
        if (a.apagar_originais) objs.forEach(o => { const l = vkListaDe(o.id); l.splice(l.indexOf(o), 1); });
        return { simbolo: S.nome, instancias: vkTodos().filter(x => x.o.tipo === 'instancia' && x.o.simbolo === id).length };
    });
    // soltar_simbolo: instâncias viram grupos comuns (editáveis), sem o vínculo
    vkRegistrar('soltar_simbolo', 'soltar símbolo', a => {
        const ids = [];
        for (const o of vkTxAlvos(a).filter(o => o.tipo === 'instancia')) {
            const S = vkSimbolo(o.simbolo); if (!S) continue;
            const reid = x => { x.id = vkId(); if (x.itens) x.itens.forEach(reid); return x; };
            const itens = S.itens.map(f => reid(vkClone(f))); itens.forEach(f => vkTransformar(f, o.m));
            const g = { id: vkId(), tipo: 'grupo', nome: o.nome || S.nome, itens, ...(o.op != null ? { op: o.op } : {}) };
            const l = vkListaDe(o.id); l.splice(l.indexOf(o), 1, g); ids.push(g.id);
        }
        VK.sel = ids; return { soltos: ids.length };
    });
    vkRegistrar('simbolos', 'símbolos', () => ({ simbolos: Object.entries(VK.doc.simbolos || {}).map(([id, S]) => ({ id, nome: S.nome, objetos: S.itens.length,
        instancias: vkTodos().filter(x => x.o.tipo === 'instancia' && x.o.simbolo === id).length })) }), true);
})();
// exportar: texto dentro dos símbolos também leva o spec pronto
async function vkSimDocPy(d) {
    for (const [id, S] of Object.entries(d.simbolos || {})) {
        const src = vkSimbolo(id); if (!src) continue;
        const anda = (a, b) => a.forEach((o, i) => { if (o.tipo === 'texto') { const sp = vkTxSpec(o); if (sp) b[i]._spec = sp; } if (o.itens) anda(o.itens, b[i].itens); });
        for (const o of src.itens) if (o.tipo === 'texto') await vkGeoPronta(o);
        anda(src.itens, S.itens);
    }
}
