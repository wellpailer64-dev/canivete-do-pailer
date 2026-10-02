// =========================================================
// Editor de Imagem — Estilo de camada (fx): Sombra projetada, Brilho externo, Traçado e Sobreposição de cor, com
// prévia na hora. L.fx = {sombra?, brilho?, contorno?, sobreposicao?, outros?} (o mesmo formato que vem do PSD).
// Mudou: L.fxMudou e o Python reescreve só esses 4 efeitos no PSD (Functions/editor_imagem.py: _gravar_efeitos),
// os outros efeitos da camada ficam como estavam.
// =========================================================

const IE_FX_PADRAO = {
    sombra: { cor: '#000000', op: 75, ang: 120, dist: 10, tam: 10 },
    brilho: { cor: '#ffffbe', op: 75, tam: 15 },
    contorno: { cor: '#000000', op: 100, larg: 3, pos: 'outside' },
    sobreposicao: { cor: '#ff0000', op: 100 },
};

function ieFxDosValores(v, fx0) {
    const fx = { outros: (fx0 && fx0.outros) || undefined };
    if (v.s_on) fx.sombra = { cor: v.s_cor, op: v.s_op, ang: v.s_ang, dist: v.s_dist, tam: v.s_tam };
    if (v.b_on) fx.brilho = { cor: v.b_cor, op: v.b_op, tam: v.b_tam };
    if (v.t_on) fx.contorno = { cor: v.t_cor, op: v.t_op, larg: v.t_larg, pos: v.t_pos };
    if (v.o_on) fx.sobreposicao = { cor: v.o_cor, op: v.o_op };
    if (!fx.outros) delete fx.outros;
    return fx;
}

async function ieEstiloCamada(L = ieAtiva(), foco) {
    const doc = IE.doc;
    if (!doc || !L) return;
    if (L.tipo === 'grupo' || L.tipo === 'ajuste') { ieToast(ieT('Estilo de camada vale para camadas com pixels, texto ou forma')); return; }
    const fx0 = L.fx ? JSON.parse(JSON.stringify(L.fx)) : null, oculto0 = !!L.fxOculto;
    const f = fx0 || {};
    const s = { ...IE_FX_PADRAO.sombra, ...(f.sombra || {}) }, b = { ...IE_FX_PADRAO.brilho, ...(f.brilho || {}) };
    const t = { ...IE_FX_PADRAO.contorno, ...(f.contorno || {}) }, o = { ...IE_FX_PADRAO.sobreposicao, ...(f.sobreposicao || {}) };
    const pos = String(t.pos || '').includes('inside') ? 'inside' : String(t.pos || '').includes('center') ? 'center' : 'outside';
    const Rantes = ieRCamada(L);
    const aplicar = v => {
        const R = ieRCamada(L);
        L.fx = v ? ieFxDosValores(v, fx0) : fx0;
        L.fxOculto = v ? false : oculto0;
        ieCamadaMudou(L, ieRUniao(Rantes, R));
    };
    const v = await ieDialogo({
        titulo: 'Estilo de camada', largura: 340, lado: true,
        campos: [
            { id: 's_on', rotulo: 'Sombra projetada', tipo: 'check', valor: !!f.sombra || foco === 'sombra' },
            { id: 's_cor', rotulo: 'Cor', tipo: 'cor', valor: s.cor }, { id: 's_op', rotulo: 'Opacidade (%)', min: 0, max: 100, valor: Math.round(s.op) },
            { id: 's_ang', rotulo: 'Ângulo (°)', min: -180, max: 180, valor: Math.round(s.ang) }, { id: 's_dist', rotulo: 'Distância (px)', min: 0, max: 300, valor: Math.round(s.dist) },
            { id: 's_tam', rotulo: 'Tamanho (px)', min: 0, max: 250, valor: Math.round(s.tam) },
            { id: '_1', tipo: 'titulo', rotulo: '' },
            { id: 'b_on', rotulo: 'Brilho externo', tipo: 'check', valor: !!f.brilho || foco === 'brilho' },
            { id: 'b_cor', rotulo: 'Cor', tipo: 'cor', valor: b.cor }, { id: 'b_op', rotulo: 'Opacidade (%)', min: 0, max: 100, valor: Math.round(b.op) },
            { id: 'b_tam', rotulo: 'Tamanho (px)', min: 0, max: 250, valor: Math.round(b.tam) },
            { id: '_2', tipo: 'titulo', rotulo: '' },
            { id: 't_on', rotulo: 'Traçado', tipo: 'check', valor: !!f.contorno || foco === 'contorno' },
            { id: 't_cor', rotulo: 'Cor', tipo: 'cor', valor: t.cor }, { id: 't_op', rotulo: 'Opacidade (%)', min: 0, max: 100, valor: Math.round(t.op) },
            { id: 't_larg', rotulo: 'Tamanho (px)', min: 1, max: 250, valor: Math.round(t.larg) },
            { id: 't_pos', rotulo: 'Posição', tipo: 'select', valor: pos, opcoes: [['outside', 'Fora'], ['inside', 'Dentro'], ['center', 'Centro']] },
            { id: '_3', tipo: 'titulo', rotulo: '' },
            { id: 'o_on', rotulo: 'Sobreposição de cor', tipo: 'check', valor: !!f.sobreposicao || foco === 'sobreposicao' },
            { id: 'o_cor', rotulo: 'Cor', tipo: 'cor', valor: o.cor }, { id: 'o_op', rotulo: 'Opacidade (%)', min: 0, max: 100, valor: Math.round(o.op) },
        ],
        previa: vals => aplicar(vals),
    });
    if (!v) { aplicar(null); return; }
    aplicar(v);
    L.fxMudou = true;
    if (!ieTemFx(L.fx)) L.fx = L.fx && L.fx.outros ? { outros: L.fx.outros } : null;
    ieHist(ieT('Estilo de camada'));
    ieUiCamadas();
}

Object.assign(IE_CMDS, { estiloCamada: () => ieEstiloCamada(), limparEstilo: doc => {
    const L = ieAtiva(doc);
    if (!L || !L.fx) return;
    const R = ieRCamada(L);
    L.fx = L.fx.outros ? { outros: L.fx.outros } : null;
    L.fxMudou = true;
    ieCamadaMudou(L, R);
    ieHist(ieT('Limpar estilo de camada'));
    ieUiCamadas();
} });
{
    const cam = IE_MENUS.find(m => m[0] === 'Camada');
    const i = cam[1].findIndex(it => Array.isArray(it) && it[1] === 'corte');
    cam[1].splice(i + 1, 0, ['Estilo de camada', [['Opções de mesclagem e efeitos...', 'estiloCamada'], ['Limpar estilo de camada', 'limparEstilo']]]);
}
