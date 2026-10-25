// Photo — harmonização aproximada por camadas de ajuste padrão, sem alterar os pixels do assunto.
function ieHarmAmostra(L) {
    const r = ieRaster(L), fonte = r && (r.forma || r);
    if (!fonte?.c) throw new Error('A camada não tem pixels para analisar');
    const k = Math.min(1, 192 / Math.max(fonte.c.width, fonte.c.height));
    const c = ieCanvas(Math.max(1, Math.round(fonte.c.width * k)), Math.max(1, Math.round(fonte.c.height * k))), x = ieCtx(c);
    x.drawImage(fonte.c, 0, 0, c.width, c.height);
    const p = x.getImageData(0, 0, c.width, c.height).data, soma = [0, 0, 0];
    let peso = 0, luz = 0;
    for (let i = 0; i < p.length; i += 4) {
        const a = p[i + 3] / 255;
        if (!a) continue;
        peso += a;
        for (let j = 0; j < 3; j++) soma[j] += p[i + j] * a;
        luz += (0.2126 * ieS2L(p[i] / 255) + 0.7152 * ieS2L(p[i + 1] / 255) + 0.0722 * ieS2L(p[i + 2] / 255)) * a;
    }
    if (!peso) throw new Error('A camada está totalmente transparente');
    const rgb = soma.map(v => v / peso), lum = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    return { luz: luz / peso, croma: rgb.map(v => v - lum) };
}
function ieHarmPode(doc, L) {
    const a = L && ieAchar(doc, L.id);
    return !!(a && ['pixel', 'inteligente'].includes(L.tipo) && L.c && L.op > 0 && (L.fill ?? 1) > 0 && ieVisivelDeFato(doc, L) && !L.clip &&
        !a.lista[a.i + 1]?.clip && (!L.bm || L.bm === 'NORMAL') && !ieTemFx(L.fx) && ieMescSeNeutro(L.mescSe) &&
        ieCanaisTodos(L.canais) && (!L.vazamento || L.vazamento === 'nenhum'));
}
function ieHarmMontar(doc, assunto, referencia, luz, cor, amostras) {
    if (assunto === referencia) throw new Error('Escolha camadas diferentes para assunto e referência');
    if (!ieHarmPode(doc, assunto) || !ieHarmPode(doc, referencia)) throw new Error('Use imagens visíveis em Normal, sem efeitos ou cadeia de recorte');
    const amostra = L => { if (!amostras.has(L.id)) amostras.set(L.id, ieHarmAmostra(L)); return amostras.get(L.id); };
    const a = amostra(assunto), b = amostra(referencia);
    const exp = ieClamp(Math.log2(Math.max(b.luz, 0.0001) / Math.max(a.luz, 0.0001)), -2, 2) * ieClamp(Number(luz) || 0, 0, 100) / 100;
    const cores = a.croma.map((v, i) => ieClamp((b.croma[i] - v) * 1.5, -100, 100) * ieClamp(Number(cor) || 0, 0, 100) / 100);
    const camada = (chave, nome, valores) => ieNovaCamada(doc, { tipo: 'ajuste', nome, kind: IE_AJ_CAMADAS[chave].kind,
        ajChave: chave, ajVals: valores, ajuste: IE_AJ_CAMADAS[chave].aj(valores) });
    const tonal = camada('exposicao', ieT('Harmonização · Luz'), { exp, off: 0, gama: 1 });
    const cromatica = camada('equilibrio', ieT('Harmonização · Cor'), { cr: cores[0], mg: cores[1], yb: cores[2], lum: true });
    const G = ieNovaCamada(doc, { tipo: 'grupo', nome: ieNomeLivre(doc, ieT('Harmonização') + ' · ' + assunto.nome), bm: 'NORMAL', filhos: [assunto, tonal, cromatica], aberto: true });
    const lugar = ieAchar(doc, assunto.id);
    lugar.lista.splice(lugar.i, 1, G);
    ieTudo(doc);
    return { G, assunto, tonal, lista: lugar.lista };
}
async function ieHarmonizar(doc) {
    if (!doc) return false;
    const imagens = ieTodas(doc).filter(L => ieHarmPode(doc, L));
    if (imagens.length < 2) { ieToast(ieT('Tenha duas imagens visíveis em Normal, sem efeitos ou cadeia de recorte')); return false; }
    const ativa = ieAtiva(doc), inicial = imagens.includes(ativa) ? ativa : imagens[imagens.length - 1];
    const referencia = imagens.find(L => L !== inicial), opcoes = imagens.map(L => [String(L.id), L.nome + ' (#' + L.id + ')']);
    const amostras = new Map();
    let estado = null;
    const limpar = () => {
        if (!estado) return;
        const i = estado.lista.indexOf(estado.G);
        if (i >= 0) estado.lista.splice(i, 1, estado.assunto);
        estado = null; ieTudo(doc);
    };
    const montar = v => ieHarmMontar(doc, imagens.find(L => String(L.id) === String(v.assunto)), imagens.find(L => String(L.id) === String(v.referencia)), v.luz, v.cor, amostras);
    const mostrar = v => {
        limpar();
        let erro = '';
        if (v) { try { estado = montar(v); } catch (e) { erro = e.message; } }
        const nota = ieEl('ie-modal')?.querySelector('[data-harm-erro]'); if (nota) nota.textContent = erro;
    };
    let vals;
    try {
        const promessa = ieDialogo({ titulo: 'Harmonizar com cenário', lado: true,
            campos: [{ id: 'assunto', rotulo: 'Assunto', tipo: 'select', valor: String(inicial.id), opcoes },
                { id: 'referencia', rotulo: 'Referência', tipo: 'select', valor: String(referencia.id), opcoes },
                { id: 'luz', rotulo: 'Luminosidade (%)', min: 0, max: 100, valor: 50 },
                { id: 'cor', rotulo: 'Cor (%)', min: 0, max: 100, valor: 50 },
                { id: 'nota', tipo: 'nota', rotulo: 'Aproximação pelas cores e tons visíveis das duas camadas. Cria um grupo isolado com o assunto, Exposição e Equilíbrio de cores. Ajuste o resultado depois em Propriedades.' }],
            previa: mostrar });
        const corpo = ieEl('ie-modal')?.querySelector('.ie-dlg-corpo');
        if (corpo) { const nota = document.createElement('div'); nota.className = 'ie-prop-nota'; nota.dataset.harmErro = ''; corpo.appendChild(nota); }
        vals = await promessa;
    } finally { limpar(); }
    if (!vals || (!Number(vals.luz) && !Number(vals.cor))) return false;
    try { estado = montar(vals); } catch (e) { ieToast(ieT(e.message)); return false; }
    ieAtivar(estado.tonal.id, doc); doc.mascaraAlvo = false;
    ieHist(ieT('Harmonizar com cenário'), doc); ieUiCamadas(); ieUiProps();
    return true;
}
Object.assign(IE_CMDS, { harmonizar: doc => ieHarmonizar(doc) });
(function () {
    const menu = IE_MENUS.find(m => m[0] === 'Camada')[1];
    const i = menu.findIndex(m => Array.isArray(m) && m[1] === 'removerFundo');
    menu.splice(i, 0, ['Harmonizar com cenário...', 'harmonizar']);
})();
