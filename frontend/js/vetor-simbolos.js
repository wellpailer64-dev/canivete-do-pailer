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

// ─────────────────────────── MÁSCARA DE OPACIDADE (painel Transparência › Criar máscara) ───────────────────────────
// grupo {opmask: objeto-máscara, opmask_inv, itens}: a LUMINOSIDADE da máscara vira a opacidade da arte (branco mostra,
// preto esconde; fora da máscara = escondido, como "Recortar" ligado no Illustrator). PDF: SMask Luminosity (só X-4).
function vkOpMaskDesenhar(ctx, o, cam) {
    const T = ctx.getTransform(), W = ctx.canvas.width, H = ctx.canvas.height;
    const b = vkBox(o.opmask); if (!isFinite(b[0])) return true;
    const cs = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => [T.a * x + T.c * y + T.e, T.b * x + T.d * y + T.f]);
    const x0 = Math.max(0, Math.floor(Math.min(...cs.map(p => p[0])))), y0 = Math.max(0, Math.floor(Math.min(...cs.map(p => p[1]))));
    const x1 = Math.min(W, Math.ceil(Math.max(...cs.map(p => p[0])))), y1 = Math.min(H, Math.ceil(Math.max(...cs.map(p => p[1]))));
    const w = x1 - x0, h = y1 - y0; if (w < 1 || h < 1) return true;
    const arte = new OffscreenCanvas(w, h), ma = new OffscreenCanvas(w, h), ca = arte.getContext('2d'), cm = ma.getContext('2d');
    for (const c of [ca, cm]) c.setTransform(T.a, T.b, T.c, T.d, T.e - x0, T.f - y0);
    o.itens.forEach(f => vkDesenharObj(ca, f, cam));
    vkDesenharObj(cm, o.opmask, cam);
    const im = cm.getImageData(0, 0, w, h), d = im.data;
    // a prova de cor mostra 100K como cinza-escuro (não 0): normaliza preto de impressão → 0 e papel → 255 (= o SMask do PDF)
    const pk = (String(vkCss({ k: 'cmyk', v: [0, 0, 0, 100] })).match(/\d+/g) || [0, 0, 0]).map(Number), Lk = 0.299 * pk[0] + 0.587 * pk[1] + 0.114 * pk[2], esc = 255 / Math.max(1, 255 - Lk);
    for (let i = 0; i < d.length; i += 4) { const L = Math.max(0, Math.min(255, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - Lk) * esc)) * d[i + 3] / 255; d[i + 3] = o.opmask_inv ? (d[i + 3] ? 255 - L : 0) : L; }
    cm.putImageData(im, 0, 0);
    ca.setTransform(1, 0, 0, 1, 0, 0); ca.globalCompositeOperation = 'destination-in'; ca.drawImage(ma, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(arte, x0, y0); ctx.restore();
    return true;
}
(() => {
    // mascara_opacidade: o objeto de CIMA vira a máscara dos outros (ids/nomes ou seleção); inverter
    vkRegistrar('mascara_opacidade', 'máscara de opacidade', a => {
        const ordem = vkTodos().map(x => x.o), objs = vkTxAlvos(a).sort((p, q) => ordem.indexOf(p) - ordem.indexOf(q));
        if (objs.length < 2) throw new Error('máscara de opacidade: selecione a arte e, por cima, a máscara (branco mostra, preto esconde)');
        const mask = objs.at(-1), arte = objs.slice(0, -1), l = vkListaDe(mask.id), pos = l.indexOf(mask);
        const g = { id: vkId(), tipo: 'grupo', nome: a.nome || 'Máscara de opacidade', itens: arte, opmask: mask, ...(a.inverter ? { opmask_inv: true } : {}) };
        l.splice(pos, 1, g);
        arte.forEach(o => { const ll = vkListaDe(o.id); ll.splice(ll.indexOf(o), 1); });
        VK.sel = [g.id]; return { id: g.id, arte: arte.length };
    });
    vkRegistrar('soltar_mascara_opacidade', 'soltar máscara de opacidade', a => {
        const ids = [];
        for (const g of vkTxAlvos(a).filter(o => o.opmask)) { const l = vkListaDe(g.id); l.splice(l.indexOf(g), 1, ...g.itens, g.opmask); ids.push(...g.itens.map(o => o.id), g.opmask.id); }
        VK.sel = ids; return { soltos: ids.length };
    });
})();
const vkCoresOpOrig = vkCores;
vkCores = function (o) { const out = vkCoresOpOrig(o); if (o.opmask) out.push(...vkCores(o.opmask)); return out; };

// ─────────────────────────── MALA DIRETA (Variáveis do Illustrator: crachá, convite com nome, etiqueta numerada) ───────────────────────────
// csv (caminho; ; ou , detectado) ou linhas [{coluna: valor}]; campos {coluna: nome do objeto} (sem: colunas com o mesmo
// nome de um objeto). Texto troca o conteúdo; imagem troca o arquivo; grupo "QR…" refaz o QR com o valor.
// Cada linha vira uma página (pelo exportar_pdf, com o fechamento e a verificação) e no fim vira um PDF só.
vkRegistrar('mala_direta', 'mala direta', async a => {
    const api = vkApi();
    let linhas = a.linhas;
    if (!linhas) { if (!a.csv) throw new Error('mala_direta: passe csv (caminho) ou linhas'); const r = await api.vk_ler_csv(a.csv); if (!r || !r.success) throw new Error((r && r.error) || 'não leu o CSV'); linhas = r.linhas; }
    if (!linhas.length) throw new Error('mala_direta: nenhuma linha');
    if (a.limite) linhas = linhas.slice(0, +a.limite);
    const porNome = n => vkTodos().find(x => (x.o.nome || '').toLowerCase() === String(n).toLowerCase());
    const campos = a.campos || Object.fromEntries(Object.keys(linhas[0]).filter(c => porNome(c)).map(c => [c, c]));
    if (!Object.keys(campos).length) throw new Error(`mala_direta: nenhuma coluna bate com o nome de um objeto; colunas: ${Object.keys(linhas[0]).join(', ')}`);
    for (const nome of Object.values(campos)) if (!porNome(nome)) throw new Error(`mala_direta: objeto "${nome}" não existe`);
    const saida = a.saida || await api.vk_dialogo('salvar', ['PDF (*.pdf)'], (VK.doc.nome || 'mala direta') + '.pdf');
    if (!saida) return { cancelado: true };
    const original = vkClone(VK.doc), sel = VK.sel, paginas = [];
    try {
        for (let i = 0; i < linhas.length; i++) {
            VK.doc = vkClone(original);
            for (const [col, nome] of Object.entries(campos)) {
                const v = String(linhas[i][col] ?? ''), o = porNome(nome).o;
                if (o.tipo === 'texto') { const r = vkTxRaiz(o); vkTxRemap(r, String(r.conteudo), v); }
                else if (o.tipo === 'imagem' && v) { const inf = await api.vk_imagem_info(v); if (inf && inf.success) { const iid = vkId('i'); VK.doc.imagens[iid] = { arquivo: inf.arquivo, w: inf.w, h: inf.h, modo: inf.modo, url: inf.url, nome: inf.nome, alfa: inf.alfa };
                    const s = vkEsc(o.m) * (VK.doc.imagens[o.img] ? VK.doc.imagens[o.img].w / inf.w : 1); o.m = [s, 0, 0, s, o.m[4], o.m[5]]; o.img = iid; } }
                else if (o.tipo === 'grupo' && /^qr/i.test(o.nome || '') && v) {
                    const b = vkBox(o), l = vkListaDe(o.id); l.splice(l.indexOf(o), 1);
                    const r = await VK_CMDS.qrcode.fn({ un: 'pt', conteudo: v, x: b[0], y: b[1], tamanho: b[2] - b[0], nome: o.nome }); vkObj(r.id).id = o.id;
                }
            }
            const tmp = saida.replace(/\.pdf$/i, '') + `__${String(i + 1).padStart(4, '0')}.pdf`;
            const r = await VK_CMDS.exportar_pdf.fn({ caminho: tmp, padrao: a.padrao || 'x4', forcar: true, ...(a.sangria != null ? { sangria: a.sangria } : {}), ...(a.marcas != null ? { marcas: a.marcas } : {}) });
            if (!r || r.cancelado) throw new Error('exportação da página ' + (i + 1) + ' falhou');
            paginas.push(tmp);
        }
    } finally { VK.doc = original; VK.sel = sel; vkMudou(); }
    const j = await api.vk_juntar_pdfs(paginas, saida, a.padrao || 'x4');
    return { arquivo: j.path, paginas: j.paginas, verificado: !!(j.verificacao && (j.verificacao.ok ?? !j.verificacao.problemas?.length)), problemas: (j.verificacao && j.verificacao.problemas) || [] };
});
