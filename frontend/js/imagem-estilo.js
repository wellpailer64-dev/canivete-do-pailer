// =========================================================
// Editor de Imagem — janela Estilo de camada (como a do Photoshop): Estilos, Opções de mesclagem (gerais e
// avançadas, canais, vazamento, Misturar se) e os 10 efeitos (imagem-fx.js), com "+" nos que podem repetir,
// setas para reordenar, lixeira, menu fx, Tornar padrão / Redefinir, Novo estilo, Visualizar e a amostra.
// Abre por: botão direito na camada > Opções de mesclagem..., duplo clique na camada, botão fx do painel,
// Camada > Estilo de camada. Tudo vai para o PSD (Functions/editor_imagem.py: _gravar_efeitos, _gravar_mescla).
// =========================================================

const IE_LS = { st: null };   // estado da janela aberta

// termos oficiais do Photoshop em inglês (app em inglês): a janela já sai traduzida, então o tradutor automático da
// página (i18n.js) não troca palavras que lá significam outra coisa ("Suave" = Ease, "Contorno" = Stroke)
const IE_LS_EN = {
    'Estilo de camada': 'Layer Style', 'Nome': 'Name', 'Estilos': 'Styles', 'Opções de mesclagem': 'Blending Options', 'Opções de mesclagem...': 'Blending Options...',
    'Chanfro e entalhe': 'Bevel & Emboss', 'Contorno': 'Contour', 'Textura': 'Texture', 'Traçado': 'Stroke', 'Sombra interna': 'Inner Shadow',
    'Brilho interno': 'Inner Glow', 'Acetinado': 'Satin', 'Sobreposição de cor': 'Color Overlay', 'Sobreposição de degradê': 'Gradient Overlay',
    'Sobreposição de padrão': 'Pattern Overlay', 'Brilho externo': 'Outer Glow', 'Sombra projetada': 'Drop Shadow',
    'Mesclagem geral': 'General Blending', 'Mesclagem avançada': 'Advanced Blending', 'Modo de mesclagem': 'Blend Mode', 'Opacidade': 'Opacity',
    'Opacidade do preenchimento': 'Fill Opacity', 'Canais': 'Channels', 'Vazamento': 'Knockout', 'Nenhum': 'None', 'Raso': 'Shallow', 'Profundo': 'Deep',
    'Mesclar efeitos internos como grupo': 'Blend Interior Effects as Group', 'Mesclar camadas cortadas como grupo': 'Blend Clipped Layers as Group',
    'Camada de forma transparente': 'Transparency Shapes Layer', 'A máscara de camada oculta os efeitos': 'Layer Mask Hides Effects',
    'A máscara vetorial oculta os efeitos': 'Vector Mask Hides Effects', 'Misturar se': 'Blend If', 'Cinza': 'Gray', 'Vermelho': 'Red', 'Verde': 'Green', 'Azul': 'Blue',
    'Esta camada': 'This Layer', 'Camada subjacente': 'Underlying Layer', 'Alt+arrastar separa a metade da seta (transição suave)': 'Alt+drag splits the slider (smooth transition)',
    'Estrutura': 'Structure', 'Qualidade': 'Quality', 'Elementos': 'Elements', 'Sombreamento': 'Shading', 'Cor': 'Color', 'Degradê': 'Gradient', 'Padrão': 'Pattern',
    'Ângulo': 'Angle', 'Usar luz global': 'Use Global Light', 'Distância': 'Distance', 'Espalhamento': 'Spread', 'Tamanho': 'Size', 'Contração': 'Choke',
    'A camada vaza a sombra projetada': 'Layer Knocks Out Drop Shadow', 'Técnica': 'Technique', 'Mais suave': 'Softer', 'Precisa': 'Precise', 'Origem': 'Source',
    'Centro': 'Center', 'Borda': 'Edge', 'Estilo': 'Style', 'Chanfro externo': 'Outer Bevel', 'Chanfro interno': 'Inner Bevel', 'Entalhe': 'Emboss',
    'Entalhe em almofada': 'Pillow Emboss', 'Entalhe do traçado': 'Stroke Emboss', 'Suave': 'Smooth', 'Cinzel duro': 'Chisel Hard', 'Cinzel suave': 'Chisel Soft',
    'Profundidade': 'Depth', 'Direção': 'Direction', 'Para cima': 'Up', 'Para baixo': 'Down', 'Suavizar': 'Soften', 'Altitude': 'Altitude',
    'Modo de realce': 'Highlight Mode', 'Modo de sombra': 'Shadow Mode', 'Intervalo': 'Range', 'Escala': 'Scale', 'Inverter': 'Invert', 'Alinhar com a camada': 'Align with Layer',
    'Linear': 'Linear', 'Radial': 'Radial', 'Refletido': 'Reflected', 'Diamante': 'Diamond', 'Deslocar X': 'Offset X', 'Deslocar Y': 'Offset Y',
    'Redefinir alinhamento': 'Reset Alignment', 'Tornar padrão': 'Make Default', 'Redefinir para o padrão': 'Reset to Default', 'Posição': 'Position',
    'Fora': 'Outside', 'Dentro': 'Inside', 'Tipo de preenchimento': 'Fill Type', 'Preencher com': 'Fill Type', 'Cancelar': 'Cancel', 'Novo estilo...': 'New Style...',
    'Visualizar': 'Preview', 'Adicionar efeito': 'Add a layer style', 'Mover para cima': 'Move up', 'Mover para baixo': 'Move down', 'Excluir efeito': 'Delete effect',
    'Adicionar outro': 'Add another', 'Copiar estilo de camada': 'Copy Layer Style', 'Colar estilo de camada': 'Paste Layer Style', 'Limpar estilo de camada': 'Clear Layer Style',
    'Redefinir tudo para o padrão': 'Reset All to Default', 'Predefinições': 'Presets', 'Paradas': 'Stops', 'Local': 'Location',
    'em cima: opacidade · embaixo: cor · clique na barra acrescenta, arraste para fora tira': 'top: opacity · bottom: color · click adds a stop, drag off to remove',
    'Clique para editar o degradê': 'Click to edit the gradient', 'Nome do estilo': 'Style name', 'Incluir opções de mesclagem': 'Include Layer Blending Options',
    'Clique para aplicar. "Novo estilo..." guarda o estilo atual aqui.': 'Click to apply. "New Style..." saves the current style here.', 'botão direito: excluir': 'right-click: delete',
    'Xadrez': 'Checker', 'Listras': 'Stripes', 'Diagonais': 'Diagonals', 'Pontos': 'Dots', 'Grade': 'Grid', 'Ruído': 'Noise', 'Tijolos': 'Bricks', 'Ondas': 'Waves',
    'Cone': 'Cone', 'Cone invertido': 'Cone - Inverted', 'Côncavo fundo': 'Cove - Deep', 'Gaussiano': 'Gaussian', 'Meio círculo': 'Half Round', 'Anel': 'Ring',
    'Ondulado': 'Rolling Slope', 'Degrau': 'Step', 'Estilo salvo': 'Style saved', 'Estilo copiado': 'Style copied', 'Padrão salvo': 'Default saved', 'Efeitos': 'Effects',
};
const ieLsIngles = () => typeof I18N !== 'undefined' && I18N.lang === 'en';
function ieLsT(s) { return ieLsIngles() ? (IE_LS_EN[s] || ieT(s)) : s; }
const ieClone = v => JSON.parse(JSON.stringify(v ?? null));

// estilos prontos (o usuário acrescenta os dele com "Novo estilo...")
const IE_ESTILOS_PRONTOS = [
    { nome: 'Sombra suave', fx: { sombra: [{ on: true, bm: 'MULTIPLY', cor: '#000000', op: 45, ang: 120, dist: 8, spread: 0, tam: 18, global: false, ocultar: true }] } },
    { nome: 'Contorno grosso', fx: { tracado: [{ on: true, tam: 8, pos: 'fora', bm: 'NORMAL', op: 100, tipo: 'cor', cor: '#000000' }] } },
    { nome: 'Título com sombra', fx: { tracado: [{ on: true, tam: 5, pos: 'fora', bm: 'NORMAL', op: 100, tipo: 'cor', cor: '#111111' }],
        sombra: [{ on: true, bm: 'MULTIPLY', cor: '#000000', op: 70, ang: 120, dist: 10, spread: 20, tam: 10, global: false, ocultar: true }] } },
    { nome: 'Neon', fx: { brilho: [{ on: true, bm: 'SCREEN', cor: '#00e5ff', op: 90, spread: 10, tam: 22, tecnica: 'suave' }],
        brilhoInt: [{ on: true, bm: 'SCREEN', cor: '#ffffff', op: 70, choke: 0, tam: 4, fonte: 'centro', tecnica: 'suave' }], corSob: [{ on: true, bm: 'NORMAL', cor: '#7df9ff', op: 100 }] } },
    { nome: 'Botão chanfrado', fx: { chanfro: [{ ...IE_FX_PADRAO.chanfro(), on: true, tam: 7, prof: 140, global: false }],
        degSob: [{ ...IE_FX_PADRAO.degSob(), on: true, bm: 'OVERLAY', op: 60 }], sombra: [{ ...IE_FX_PADRAO.sombra(), on: true, op: 50, dist: 4, tam: 8, global: false }] } },
    { nome: 'Relevo', fx: { chanfro: [{ ...IE_FX_PADRAO.chanfro(), on: true, estilo: 'entalhe', tam: 6, prof: 200, global: false }] } },
    { nome: 'Carimbado', fx: { chanfro: [{ ...IE_FX_PADRAO.chanfro(), on: true, estilo: 'almofada', tam: 5, prof: 150, global: false }], sombraInt: [{ ...IE_FX_PADRAO.sombraInt(), on: true, global: false }] } },
    { nome: 'Dourado', fx: { degSob: [{ ...IE_FX_PADRAO.degSob(), on: true, grad: { cores: [[0, '#7a4f12'], [0.35, '#f5d77a'], [0.6, '#a8741a'], [1, '#fff1b8']], ops: [[0, 100], [1, 100]] } }],
        chanfro: [{ ...IE_FX_PADRAO.chanfro(), on: true, tam: 4, prof: 180, global: false }], sombra: [{ ...IE_FX_PADRAO.sombra(), on: true, op: 55, dist: 5, tam: 7, global: false }] } },
    { nome: 'Cromado', fx: { degSob: [{ ...IE_FX_PADRAO.degSob(), on: true, grad: { cores: [[0, '#2a3d6b'], [0.48, '#e8f1ff'], [0.5, '#4a3b24'], [1, '#f4e3b8']], ops: [[0, 100], [1, 100]] } }],
        acetinado: [{ ...IE_FX_PADRAO.acetinado(), on: true, op: 35 }], tracado: [{ ...IE_FX_PADRAO.tracado(), on: true, tam: 2, cor: '#ffffff', op: 60 }] } },
    { nome: 'Sombra longa', fx: { sombra: [1, 2, 3, 4, 5, 6].map(k => ({ on: true, bm: 'NORMAL', cor: '#1a1a1a', op: 100 - k * 12, ang: 135, dist: k * 4, spread: 100, tam: 0, global: false, ocultar: true })) } },
    { nome: 'Vidro', fx: { sombraInt: [{ ...IE_FX_PADRAO.sombraInt(), on: true, cor: '#ffffff', bm: 'SCREEN', op: 60, ang: 90, dist: 3, tam: 6, global: false }],
        brilho: [{ ...IE_FX_PADRAO.brilho(), on: true, cor: '#ffffff', op: 35, tam: 10 }] }, mescla: { fill: 0.15 } },
    { nome: 'Adesivo', fx: { tracado: [{ ...IE_FX_PADRAO.tracado(), on: true, tam: 10, cor: '#ffffff' }], sombra: [{ ...IE_FX_PADRAO.sombra(), on: true, op: 40, dist: 6, tam: 10, global: false }] } },
];

// ─────────────────────────── abrir / aplicar ───────────────────────────
async function ieEstiloCamada(L = ieAtiva(), foco) {
    const doc = IE.doc;
    if (!doc || !L) return;
    if (L.tipo === 'ajuste') { ieToast(ieLsT('Camada de ajuste não tem estilo de camada')); return; }
    ieTextoEncerrar?.(true);
    const fx = ieFxNorm(ieClone(L.fx)) || { _v2: true };
    const mescla = { bm: L.bm, op: L.op, fill: L.fill ?? 1, nome: L.nome, fxOculto: !!L.fxOculto,
        ...Object.fromEntries(IE_MESCLA_CHAVES.map(k => [k, ieClone(L[k])])) };
    if (!mescla.canais) mescla.canais = { r: true, g: true, b: true };
    if (!mescla.mescSe) mescla.mescSe = {};
    if (mescla.misturaCorte === undefined || mescla.misturaCorte === null) mescla.misturaCorte = true;
    if (mescla.formaTransp === undefined || mescla.formaTransp === null) mescla.formaTransp = true;
    if (!mescla.vazamento) mescla.vazamento = 'nenhum';
    const st = IE_LS.st = {
        L, doc, fx, mescla, luz: { ...(doc.luzGlobal || { ang: 120, alt: 30 }) },
        orig: { fx: ieClone(L.fx), mescla: ieClone(mescla), luz: { ...(doc.luzGlobal || { ang: 120, alt: 30 }) }, Rantes: ieRCamada(L) },
        sel: 'mescla', canalMescSe: 'cinza', previa: true,
    };
    if (foco && typeof foco === 'object') st.sel = foco;
    else if (foco === 'estilos' || foco === 'mescla') st.sel = foco;
    else if (foco && IE_FX_NOME[foco]) { if (!(fx[foco] || []).length) fx[foco] = [ieFxNovo(foco)]; else fx[foco][0].on = true; st.sel = { tipo: foco, i: 0 }; }
    ieLsMontar();
    ieLsAplicar();
}

let ieLsTimer = 0;
function ieLsAplicar(ja) {
    const st = IE_LS.st;
    if (!st) return;
    clearTimeout(ieLsTimer);
    const f = () => {
        const { L, doc } = st;
        const usar = st.previa ? st : { fx: st.orig.fx, mescla: st.orig.mescla, luz: st.orig.luz };
        const R = ieRCamada(L);
        L.fx = ieClone(usar.fx);
        const m = usar.mescla;
        L.bm = m.bm; L.op = m.op; L.fill = m.fill; L.fxOculto = !!m.fxOculto;
        for (const k of IE_MESCLA_CHAVES) L[k] = ieClone(m[k]);
        const luzMudou = JSON.stringify(doc.luzGlobal) !== JSON.stringify(usar.luz);
        doc.luzGlobal = { ...usar.luz };
        if (luzMudou) ieTudo(doc);
        else { ieInvalidar(L); ieAgendar(ieRUniao(ieRUniao(st.orig.Rantes, R), ieRCamada(L)) || ieRDoc(doc), doc); }
        ieLsAmostra();
    };
    if (ja) f(); else ieLsTimer = setTimeout(f, 40);
}

function ieLsFechar(ok) {
    const st = IE_LS.st;
    if (!st) return;
    const box = ieEl('ie-modal');
    box.hidden = true; box.innerHTML = ''; box.classList.remove('lado');
    document.removeEventListener('keydown', ieLsTecla, true);
    clearTimeout(ieLsTimer);
    IE_LS.st = null;
    const { L, doc } = st;
    if (!ok) {
        st.previa = false;
        IE_LS.st = st; ieLsAplicar(true); IE_LS.st = null;
        return;
    }
    st.previa = true;
    IE_LS.st = st; ieLsAplicar(true); IE_LS.st = null;
    if (st.mescla.nome && st.mescla.nome.trim() && st.mescla.nome !== L.nome) { L.nome = st.mescla.nome.trim(); L._nomeAuto = false; }
    // o que sobrou vazio sai da lista
    for (const [k] of IE_FX_TIPOS) if (L.fx && L.fx[k] && !L.fx[k].length) delete L.fx[k];
    if (L.fx && !ieFxLista(L.fx).length && !(L.fx.outros || []).length) L.fx = null;
    L.fxMudou = true; L.mesclaMudou = true;
    if (JSON.stringify(st.luz) !== JSON.stringify(st.orig.luz)) doc.luzMudou = true;
    ieHist(ieLsT('Estilo de camada'));
    ieUiCamadas();
}
function ieLsTecla(ev) {
    if (!IE_LS.st) return;
    const t = ev.target;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); ieLsFechar(false); return; }
    if (ev.key === 'Enter' && !(t && (t.tagName === 'INPUT' && t.type === 'text'))) { ev.preventDefault(); ev.stopPropagation(); if (t && t.tagName === 'INPUT') t.blur(); ieLsFechar(true); return; }
    ev.stopPropagation();
}

// ─────────────────────────── montagem da janela ───────────────────────────
function ieLsMontar() {
    const st = IE_LS.st, box = ieEl('ie-modal');
    box.classList.remove('lado');
    box.innerHTML = `<div class="ie-dlg ie-ls">
        <div class="ie-ls-cab"><h3>${ieLsT('Estilo de camada')}</h3><label class="ie-ls-nome">${ieLsT('Nome')}: <input type="text" data-ls-nome value="${ieEsc(st.mescla.nome)}"></label></div>
        <div class="ie-ls-corpo">
            <div class="ie-ls-esq"><div class="ie-ls-lista"></div>
                <div class="ie-ls-rod"><button class="ie-ls-ico" data-ls="menu" title="${ieLsT('Adicionar efeito')}">fx</button>
                <button class="ie-ls-ico" data-ls="cima" title="${ieLsT('Mover para cima')}">▲</button><button class="ie-ls-ico" data-ls="baixo" title="${ieLsT('Mover para baixo')}">▼</button>
                <div class="ie-op-esp"></div><button class="ie-ls-ico" data-ls="lixo" title="${ieLsT('Excluir efeito')}">${ieIco('trash')}</button></div></div>
            <div class="ie-ls-meio"></div>
            <div class="ie-ls-dir">
                <button class="ie-btn ie-btn-primario" data-ls="ok">OK</button>
                <button class="ie-btn" data-ls="cancelar">${ieLsT('Cancelar')}</button>
                <button class="ie-btn" data-ls="novoEstilo">${ieLsT('Novo estilo...')}</button>
                <label class="ie-dlg-chk"><input type="checkbox" data-ls="previa" ${st.previa ? 'checked' : ''}> ${ieLsT('Visualizar')}</label>
                <canvas class="ie-ls-amostra" width="240" height="240"></canvas>
            </div>
        </div></div>`;
    box.hidden = false;
    document.addEventListener('keydown', ieLsTecla, true);
    box.querySelector('[data-ls-nome]').addEventListener('input', ev => { st.mescla.nome = ev.target.value; });
    box.querySelector('.ie-ls').addEventListener('click', ieLsClique);
    box.querySelector('[data-ls=previa]').addEventListener('change', ev => { st.previa = ev.target.checked; ieLsAplicar(); });
    ieLsLista();
    ieLsMeio();
}

function ieLsSelIgual(a, b) { return a === b || (a && b && typeof a === 'object' && typeof b === 'object' && a.tipo === b.tipo && a.i === b.i && a.sub === b.sub); }

function ieLsLista() {
    const st = IE_LS.st, box = document.querySelector('.ie-ls-lista');
    if (!box) return;
    const lin = (sel, rotulo, ligado, extra = '', recuo = false, mais = false) => `<div class="ie-ls-item ${ieLsSelIgual(st.sel, sel) ? 'sel' : ''} ${recuo ? 'recuo' : ''}" data-sel='${JSON.stringify(sel)}'>
        ${ligado === null ? '' : `<input type="checkbox" data-liga ${ligado ? 'checked' : ''}>`}<span>${ieLsT(rotulo)}${extra}</span>${mais ? `<button class="ie-ls-mais" data-mais title="${ieLsT('Adicionar outro')}">+</button>` : ''}</div>`;
    let h = lin('estilos', 'Estilos', null) + lin('mescla', 'Opções de mesclagem', null);
    for (const [k, nome, multi] of IE_FX_TIPOS) {
        const lista = st.fx[k] || [];
        if (!lista.length) h += lin({ tipo: k, i: 0 }, nome, false, '', false, multi);
        else lista.forEach((e, i) => { h += lin({ tipo: k, i }, nome, !!e.on, lista.length > 1 ? ` <em>${i + 1}</em>` : '', false, multi && i === 0); });
        if (k === 'chanfro') {
            const e = (st.fx.chanfro || [])[0];
            h += lin({ tipo: 'chanfro', i: 0, sub: 'contorno' }, 'Contorno', !!(e && e.contorno && e.contorno.on), '', true);
            h += lin({ tipo: 'chanfro', i: 0, sub: 'textura' }, 'Textura', !!(e && e.textura && e.textura.on), '', true);
        }
    }
    box.innerHTML = h;
}

function ieLsGarantir(sel) {   // instância do efeito selecionado (cria se não existe)
    const st = IE_LS.st;
    if (!sel || typeof sel !== 'object') return null;
    const l = st.fx[sel.tipo] || (st.fx[sel.tipo] = []);
    if (!l[sel.i]) { l[sel.i] = ieFxNovo(sel.tipo); l[sel.i].on = true; }
    return l[sel.i];
}

function ieLsClique(ev) {
    const st = IE_LS.st;
    const b = ev.target.closest('[data-ls]');
    if (b && b.tagName === 'BUTTON') {
        const a = b.dataset.ls;
        if (a === 'ok') return ieLsFechar(true);
        if (a === 'cancelar') return ieLsFechar(false);
        if (a === 'novoEstilo') return ieLsNovoEstilo();
        if (a === 'menu') return ieLsMenuFx(b);
        if (a === 'cima' || a === 'baixo' || a === 'lixo') return ieLsMover(a);
    }
    const item = ev.target.closest('.ie-ls-item');
    if (item) {
        const sel = JSON.parse(item.dataset.sel);
        if (ev.target.closest('[data-mais]')) {   // + : outra instância logo abaixo (como no Photoshop)
            const l = st.fx[sel.tipo] || (st.fx[sel.tipo] = []);
            const nova = l.length ? { ...ieClone(l[0]) } : ieFxNovo(sel.tipo);
            nova.on = true;
            l.unshift(nova);
            st.sel = { tipo: sel.tipo, i: 0 };
            ieLsLista(); ieLsMeio(); ieLsAplicar();
            return;
        }
        if (ev.target.matches('[data-liga]')) {   // caixa: liga/desliga sem trocar de seção
            if (sel.sub) { const e = ieLsGarantir(sel); e[sel.sub] = { ...(e[sel.sub] || {}), on: ev.target.checked }; if (ev.target.checked) e.on = true; }
            else { const e = ieLsGarantir(sel); e.on = ev.target.checked; }
            ieLsLista(); ieLsAplicar();
            return;
        }
        st.sel = sel;
        if (typeof sel === 'object') {   // clicar no nome liga o efeito e mostra as opções
            const e = ieLsGarantir(sel);
            e.on = true;
            if (sel.sub) e[sel.sub] = { ...(e[sel.sub] || {}), on: true };
            ieLsAplicar();
        }
        ieLsLista(); ieLsMeio();
    }
}

function ieLsMover(acao) {
    const st = IE_LS.st, s = st.sel;
    if (!s || typeof s !== 'object' || s.sub) return;
    const l = st.fx[s.tipo] || [];
    if (acao === 'lixo') {
        if (!l[s.i]) return;
        l.splice(s.i, 1);
        st.sel = l.length ? { tipo: s.tipo, i: Math.min(s.i, l.length - 1) } : 'mescla';
    } else {
        const j = s.i + (acao === 'cima' ? -1 : 1);
        if (!l[s.i] || j < 0 || j >= l.length) return;
        [l[s.i], l[j]] = [l[j], l[s.i]];
        st.sel = { tipo: s.tipo, i: j };
    }
    ieLsLista(); ieLsMeio(); ieLsAplicar();
}

function ieLsMenuFx(btn) {
    const st = IE_LS.st;
    const pop = document.createElement('div');
    pop.className = 'ie-menu ie-ls-pop';
    pop.innerHTML = [['mescla', 'Opções de mesclagem...'], '-', ...IE_FX_TIPOS.map(([k, n]) => [k, n + '...']), '-',
        ['_copiar', 'Copiar estilo de camada'], ['_colar', 'Colar estilo de camada'], ['_limpar', 'Limpar estilo de camada'], '-',
        ['_padrao', 'Redefinir tudo para o padrão']]
        .map(it => it === '-' ? '<i class="ie-menu-sep"></i>' : `<button class="ie-menu-item" data-k="${it[0]}"><span>${ieLsT(it[1])}</span></button>`).join('');
    const r = btn.getBoundingClientRect(), rb = ieEl('ie').getBoundingClientRect();
    pop.style.left = r.left - rb.left + 'px';
    pop.style.top = Math.max(4, r.top - rb.top - 380) + 'px';
    ieEl('ie').appendChild(pop);
    const fora = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', fora, true); } };
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
    pop.addEventListener('click', e => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        const k = b.dataset.k;
        pop.remove(); document.removeEventListener('pointerdown', fora, true);
        if (k === 'mescla') st.sel = 'mescla';
        else if (k === '_copiar') { IE.estiloCopiado = { fx: ieClone(st.fx), mescla: ieClone(st.mescla) }; ieToast(ieLsT('Estilo copiado')); return; }
        else if (k === '_colar') { if (!IE.estiloCopiado) return; st.fx = ieFxNorm(ieClone(IE.estiloCopiado.fx)) || { _v2: true }; }
        else if (k === '_limpar') { st.fx = { _v2: true }; st.sel = 'mescla'; }
        else if (k === '_padrao') { for (const [t] of IE_FX_TIPOS) (st.fx[t] || []).forEach((e, i) => { st.fx[t][i] = { ...ieFxNovo(t), on: e.on }; }); }
        else { const l = st.fx[k] || (st.fx[k] = []); if (!l.length) l.push(ieFxNovo(k)); l[0].on = true; st.sel = { tipo: k, i: 0 }; }
        ieLsLista(); ieLsMeio(); ieLsAplicar();
    });
}

// ─────────────────────────── campos ───────────────────────────
const ieLsBmOpcoes = (atual, comPassagem) => (comPassagem ? [['PASS_THROUGH', 'Passagem']] : []).concat(IE_BM.map(b => b || null))
    .map(b => b ? `<option value="${b[0]}" ${b[0] === atual ? 'selected' : ''}>${ieLsIngles() ? ieBmIngles(b[0]) : b[1]}</option>` : '<option disabled>──────</option>').join('');
function ieBmIngles(k) { return k === 'PASS_THROUGH' ? 'Pass Through' : k.toLowerCase().split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ').replace('Linear Dodge', 'Linear Dodge (Add)'); }

// cada campo: [tipo, chave, rótulo, ...]; o valor vive em obj[chave]
function ieLsCampos(obj, campos) {
    return campos.map(c => {
        const [tipo, k, rot] = c;
        const v = obj[k];
        if (tipo === 'titulo') return `<div class="ie-ls-tit">${ieLsT(rot)}</div>`;
        if (tipo === 'faixa') { const [, , , min, max, un = '', passo = 1] = c; return `<label class="ie-ls-faixa"><span>${ieLsT(rot)}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${passo}" value="${v ?? min}"><input type="number" data-n="${k}" min="${min}" max="${max}" step="${passo}" value="${+(+(v ?? min)).toFixed(2)}"><em>${un}</em></label>`; }
        if (tipo === 'bmcor') return `<label class="ie-ls-lin"><span>${ieLsT(rot)}</span><select data-k="${k}">${ieLsBmOpcoes(v)}</select>${c[3] ? `<button class="ie-cor ie-ls-cor" data-cor="${c[3]}" style="background:${obj[c[3]]}" title="${ieLsT('Cor')}"></button>` : ''}</label>`;
        if (tipo === 'cor') return `<label class="ie-ls-lin"><span>${ieLsT(rot)}</span><button class="ie-cor ie-ls-cor" data-cor="${k}" style="background:${v}"></button></label>`;
        if (tipo === 'select') return `<label class="ie-ls-lin"><span>${ieLsT(rot)}</span><select data-k="${k}">${c[3].map(([a, b]) => `<option value="${a}" ${a === v ? 'selected' : ''}>${ieLsT(b)}</option>`).join('')}</select></label>`;
        if (tipo === 'check') return `<label class="ie-ls-chk"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${ieLsT(rot)}</label>`;
        if (tipo === 'radio') return `<div class="ie-ls-lin"><span>${ieLsT(rot)}</span><div class="ie-segm">${c[3].map(([a, b]) => `<button data-radio="${k}" data-v="${a}" class="${a === v ? 'on' : ''}">${ieLsT(b)}</button>`).join('')}</div></div>`;
        if (tipo === 'angulo') return `<div class="ie-ls-lin ie-ls-ang"><span>${ieLsT(rot)}</span><canvas class="ie-ls-dial" data-dial="${k}" width="68" height="68"></canvas>
            <input type="number" data-n="${k}" min="-180" max="360" step="1" value="${Math.round(v ?? 120)}"><em>°</em>
            ${c[3] ? `<label class="ie-ls-chk"><input type="checkbox" data-k="global" ${obj.global ? 'checked' : ''}> ${ieLsT('Usar luz global')}</label>` : ''}</div>`;
        if (tipo === 'grad') return `<div class="ie-ls-lin"><span>${ieLsT(rot)}</span><div class="ie-ls-grad" data-grad="${k}" title="${ieLsT('Clique para editar o degradê')}"></div>
            ${c[3] ? `<label class="ie-ls-chk"><input type="checkbox" data-k="inverter" ${obj.inverter ? 'checked' : ''}> ${ieLsT('Inverter')}</label>` : ''}</div>`;
        if (tipo === 'padrao') return `<div class="ie-ls-lin"><span>${ieLsT(rot)}</span><div class="ie-ls-padroes">${Object.entries(IE_PADROES).map(([n, [nome]]) => `<button class="ie-ls-padrao ${n === v ? 'on' : ''}" data-padrao="${k}" data-v="${n}" title="${ieLsT(nome)}"></button>`).join('')}</div></div>`;
        if (tipo === 'contorno') return `<div class="ie-ls-lin"><span>${ieLsT(rot)}</span><div class="ie-ls-padroes">${Object.entries(IE_CONTORNOS).map(([n, [nome]]) => `<button class="ie-ls-contorno ${n === v ? 'on' : ''}" data-contorno="${k}" data-v="${n}" title="${ieLsT(nome)}"></button>`).join('')}</div></div>`;
        if (tipo === 'botoes') return `<div class="ie-ls-botoes">${c[3].map(([a, b]) => `<button class="ie-btn ie-btn-mini" data-acao="${a}">${ieLsT(b)}</button>`).join('')}</div>`;
        if (tipo === 'num') { const [, , , min, max, un = ''] = c; return `<label class="ie-ls-lin"><span>${ieLsT(rot)}</span><input type="number" data-n="${k}" data-solto min="${min}" max="${max}" value="${+(+(v ?? 0)).toFixed(1)}"><em>${un}</em></label>`; }
        return '';
    }).join('');
}

const IE_LS_PADRAO_BOTOES = ['botoes', '', '', [['tornarPadrao', 'Tornar padrão'], ['redefinir', 'Redefinir para o padrão']]];
const IE_LS_SECOES = {
    sombra: e => [['titulo', '', 'Estrutura'], ['bmcor', 'bm', 'Modo de mesclagem', 'cor'], ['faixa', 'op', 'Opacidade', 0, 100, '%'], ['angulo', 'ang', 'Ângulo', true],
        ['faixa', 'dist', 'Distância', 0, 300, 'px'], ['faixa', 'spread', 'Espalhamento', 0, 100, '%'], ['faixa', 'tam', 'Tamanho', 0, 250, 'px'],
        ['titulo', '', 'Qualidade'], ['check', 'ocultar', 'A camada vaza a sombra projetada'], IE_LS_PADRAO_BOTOES],
    sombraInt: e => [['titulo', '', 'Estrutura'], ['bmcor', 'bm', 'Modo de mesclagem', 'cor'], ['faixa', 'op', 'Opacidade', 0, 100, '%'], ['angulo', 'ang', 'Ângulo', true],
        ['faixa', 'dist', 'Distância', 0, 300, 'px'], ['faixa', 'choke', 'Contração', 0, 100, '%'], ['faixa', 'tam', 'Tamanho', 0, 250, 'px'], IE_LS_PADRAO_BOTOES],
    brilho: e => [['titulo', '', 'Estrutura'], ['bmcor', 'bm', 'Modo de mesclagem', 'cor'], ['faixa', 'op', 'Opacidade', 0, 100, '%'],
        ['titulo', '', 'Elementos'], ['select', 'tecnica', 'Técnica', [['suave', 'Mais suave'], ['precisa', 'Precisa']]],
        ['faixa', 'spread', 'Espalhamento', 0, 100, '%'], ['faixa', 'tam', 'Tamanho', 0, 250, 'px'], IE_LS_PADRAO_BOTOES],
    brilhoInt: e => [['titulo', '', 'Estrutura'], ['bmcor', 'bm', 'Modo de mesclagem', 'cor'], ['faixa', 'op', 'Opacidade', 0, 100, '%'],
        ['titulo', '', 'Elementos'], ['select', 'tecnica', 'Técnica', [['suave', 'Mais suave'], ['precisa', 'Precisa']]],
        ['radio', 'fonte', 'Origem', [['centro', 'Centro'], ['borda', 'Borda']]], ['faixa', 'choke', 'Contração', 0, 100, '%'], ['faixa', 'tam', 'Tamanho', 0, 250, 'px'], IE_LS_PADRAO_BOTOES],
    chanfro: e => [['titulo', '', 'Estrutura'],
        ['select', 'estilo', 'Estilo', [['externo', 'Chanfro externo'], ['interno', 'Chanfro interno'], ['entalhe', 'Entalhe'], ['almofada', 'Entalhe em almofada'], ['traco', 'Entalhe do traçado']]],
        ['select', 'tecnica', 'Técnica', [['suave', 'Suave'], ['cinzelDuro', 'Cinzel duro'], ['cinzelSuave', 'Cinzel suave']]],
        ['faixa', 'prof', 'Profundidade', 1, 1000, '%'], ['radio', 'dir', 'Direção', [['cima', 'Para cima'], ['baixo', 'Para baixo']]],
        ['faixa', 'tam', 'Tamanho', 0, 250, 'px'], ['faixa', 'suav', 'Suavizar', 0, 16, 'px'],
        ['titulo', '', 'Sombreamento'], ['angulo', 'ang', 'Ângulo', true], ['faixa', 'alt', 'Altitude', 0, 90, '°'],
        ['bmcor', 'hBm', 'Modo de realce', 'hCor'], ['faixa', 'hOp', 'Opacidade', 0, 100, '%'],
        ['bmcor', 'sBm', 'Modo de sombra', 'sCor'], ['faixa', 'sOp', 'Opacidade', 0, 100, '%'], IE_LS_PADRAO_BOTOES],
    'chanfro.contorno': e => [['titulo', '', 'Contorno'], ['contorno', 'forma', 'Contorno'], ['faixa', 'intervalo', 'Intervalo', 1, 100, '%']],
    'chanfro.textura': e => [['titulo', '', 'Textura'], ['padrao', 'padrao', 'Padrão'], ['faixa', 'escala', 'Escala', 1, 1000, '%'], ['faixa', 'prof', 'Profundidade', -1000, 1000, '%'], ['check', 'inverter', 'Inverter']],
    acetinado: e => [['titulo', '', 'Estrutura'], ['bmcor', 'bm', 'Modo de mesclagem', 'cor'], ['faixa', 'op', 'Opacidade', 0, 100, '%'], ['angulo', 'ang', 'Ângulo', false],
        ['faixa', 'dist', 'Distância', 1, 250, 'px'], ['faixa', 'tam', 'Tamanho', 0, 250, 'px'], ['check', 'inverter', 'Inverter'], IE_LS_PADRAO_BOTOES],
    corSob: e => [['titulo', '', 'Cor'], ['bmcor', 'bm', 'Modo de mesclagem', 'cor'], ['faixa', 'op', 'Opacidade', 0, 100, '%'], IE_LS_PADRAO_BOTOES],
    degSob: e => [['titulo', '', 'Degradê'], ['bmcor', 'bm', 'Modo de mesclagem'], ['faixa', 'op', 'Opacidade', 0, 100, '%'], ['grad', 'grad', 'Degradê', true],
        ['select', 'estilo', 'Estilo', [['linear', 'Linear'], ['radial', 'Radial'], ['angulo', 'Ângulo'], ['refletido', 'Refletido'], ['diamante', 'Diamante']]],
        ['check', 'alinhar', 'Alinhar com a camada'], ['angulo', 'ang', 'Ângulo', false], ['faixa', 'escala', 'Escala', 10, 150, '%'],
        ['num', 'ofx', 'Deslocar X', -100, 100, '%'], ['num', 'ofy', 'Deslocar Y', -100, 100, '%'],
        ['botoes', '', '', [['realinhar', 'Redefinir alinhamento'], ['tornarPadrao', 'Tornar padrão'], ['redefinir', 'Redefinir para o padrão']]]],
    padraoSob: e => [['titulo', '', 'Padrão'], ['bmcor', 'bm', 'Modo de mesclagem'], ['faixa', 'op', 'Opacidade', 0, 100, '%'], ['padrao', 'padrao', 'Padrão'],
        ['faixa', 'escala', 'Escala', 1, 1000, '%'], IE_LS_PADRAO_BOTOES],
    tracado: e => [['titulo', '', 'Estrutura'], ['faixa', 'tam', 'Tamanho', 1, 250, 'px'],
        ['select', 'pos', 'Posição', [['fora', 'Fora'], ['dentro', 'Dentro'], ['centro', 'Centro']]], ['bmcor', 'bm', 'Modo de mesclagem'], ['faixa', 'op', 'Opacidade', 0, 100, '%'],
        ['titulo', '', 'Tipo de preenchimento'], ['select', 'tipo', 'Preencher com', [['cor', 'Cor'], ['degrade', 'Degradê'], ['padrao', 'Padrão']]],
        ...(e.tipo === 'degrade' ? [['grad', 'grad', 'Degradê', true], ['select', 'estilo', 'Estilo', [['linear', 'Linear'], ['radial', 'Radial'], ['angulo', 'Ângulo'], ['refletido', 'Refletido'], ['diamante', 'Diamante']]],
            ['angulo', 'ang', 'Ângulo', false], ['faixa', 'escala', 'Escala', 10, 150, '%']]
            : e.tipo === 'padrao' ? [['padrao', 'padrao', 'Padrão']] : [['cor', 'cor', 'Cor']]), IE_LS_PADRAO_BOTOES],
};

function ieLsMeio() {
    const st = IE_LS.st, box = document.querySelector('.ie-ls-meio');
    if (!box) return;
    const s = st.sel;
    let obj, html;
    if (s === 'estilos') { ieLsEstilos(box); return; }
    if (s === 'mescla') {
        obj = st.mescla;
        const ms = (obj.mescSe[st.canalMescSe] = obj.mescSe[st.canalMescSe] || { atual: [0, 0, 255, 255], baixo: [0, 0, 255, 255] });
        html = `<div class="ie-ls-tit">${ieLsT('Mesclagem geral')}</div>
            <label class="ie-ls-lin"><span>${ieLsT('Modo de mesclagem')}</span><select data-k="bm">${ieLsBmOpcoes(obj.bm, st.L.tipo === 'grupo')}</select></label>
            <label class="ie-ls-faixa"><span>${ieLsT('Opacidade')}</span><input type="range" data-k="op" data-pct min="0" max="100" value="${Math.round(obj.op * 100)}"><input type="number" data-n="op" data-pct min="0" max="100" value="${Math.round(obj.op * 100)}"><em>%</em></label>
            <div class="ie-ls-tit">${ieLsT('Mesclagem avançada')}</div>
            <label class="ie-ls-faixa"><span>${ieLsT('Opacidade do preenchimento')}</span><input type="range" data-k="fill" data-pct min="0" max="100" value="${Math.round(obj.fill * 100)}"><input type="number" data-n="fill" data-pct min="0" max="100" value="${Math.round(obj.fill * 100)}"><em>%</em></label>
            <div class="ie-ls-lin"><span>${ieLsT('Canais')}</span>${['r', 'g', 'b'].map(c => `<label class="ie-ls-chk"><input type="checkbox" data-canal="${c}" ${obj.canais[c] !== false ? 'checked' : ''}> ${c.toUpperCase()}</label>`).join('')}</div>
            <label class="ie-ls-lin"><span>${ieLsT('Vazamento')}</span><select data-k="vazamento">${[['nenhum', 'Nenhum'], ['raso', 'Raso'], ['profundo', 'Profundo']].map(([a, b]) => `<option value="${a}" ${a === obj.vazamento ? 'selected' : ''}>${ieLsT(b)}</option>`).join('')}</select></label>
            ${[['misturaInterior', 'Mesclar efeitos internos como grupo'], ['misturaCorte', 'Mesclar camadas cortadas como grupo'], ['formaTransp', 'Camada de forma transparente'],
                ['mascaraOcultaFx', 'A máscara de camada oculta os efeitos'], ['vetorOcultaFx', 'A máscara vetorial oculta os efeitos']]
                .map(([k, r]) => `<label class="ie-ls-chk"><input type="checkbox" data-k="${k}" ${obj[k] ? 'checked' : ''}> ${ieLsT(r)}</label>`).join('')}
            <div class="ie-ls-tit">${ieLsT('Misturar se')}: <select data-mescse>${[['cinza', 'Cinza'], ['r', 'Vermelho'], ['g', 'Verde'], ['b', 'Azul']].map(([a, b]) => `<option value="${a}" ${a === st.canalMescSe ? 'selected' : ''}>${ieLsT(b)}</option>`).join('')}</select></div>
            <div class="ie-ls-mescse"><span>${ieLsT('Esta camada')}: <b data-ms-txt="atual">${ieLsTxtFaixa(ms.atual)}</b></span><canvas data-ms="atual" width="360" height="34"></canvas>
            <span>${ieLsT('Camada subjacente')}: <b data-ms-txt="baixo">${ieLsTxtFaixa(ms.baixo)}</b></span><canvas data-ms="baixo" width="360" height="34"></canvas>
            <em class="ie-prop-nota">${ieLsT('Alt+arrastar separa a metade da seta (transição suave)')}</em></div>`;
    } else {
        const e = ieLsGarantir(s);
        if (e.global) { e.ang = st.luz.ang; if (s.tipo === 'chanfro') e.alt = st.luz.alt; }   // "Usar luz global": mostra a luz do documento
        obj = s.sub ? (e[s.sub] = { ...(s.sub === 'contorno' ? { on: true, forma: 'linear', intervalo: 50 } : { on: true, padrao: 'xadrez', escala: 100, prof: 100, inverter: false }), ...(e[s.sub] || {}) }) : e;
        html = `<div class="ie-ls-titulo">${ieLsT(s.sub ? (s.sub === 'contorno' ? 'Contorno' : 'Textura') : IE_FX_NOME[s.tipo])}</div>` +
            ieLsCampos(obj, IE_LS_SECOES[s.sub ? s.tipo + '.' + s.sub : s.tipo](obj));
    }
    box.innerHTML = html;
    box._obj = obj;
    ieLsLigarCampos(box, obj);
}

const ieLsTxtFaixa = f => `${f[0] === f[1] ? f[0] : f[0] + '/' + f[1]}  ${f[2] === f[3] ? f[2] : f[2] + '/' + f[3]}`;

function ieLsLigarCampos(box, obj) {
    const st = IE_LS.st;
    const mudou = (redesenhar) => { ieLsAplicar(); if (redesenhar) { ieLsLista(); ieLsMeio(); } };
    box.querySelectorAll('input[type=range][data-k]').forEach(el => el.addEventListener('input', () => {
        const k = el.dataset.k, v = parseFloat(el.value);
        obj[k] = el.dataset.pct !== undefined ? v / 100 : v;
        if (obj.global && (k === 'ang' || k === 'alt')) st.luz[k] = v;
        const n = box.querySelector(`[data-n="${k}"]`); if (n) n.value = el.value;
        mudou();
    }));
    box.querySelectorAll('input[type=number][data-n]').forEach(el => el.addEventListener('input', () => {
        const k = el.dataset.n, v = parseFloat(el.value);
        if (!isFinite(v)) return;
        obj[k] = el.dataset.pct !== undefined ? v / 100 : v;
        const r = box.querySelector(`input[type=range][data-k="${k}"]`); if (r) r.value = el.value;
        if (el.closest('.ie-ls-ang')) ieLsDial(box.querySelector(`[data-dial="${k}"]`), obj, k);
        if ((k === 'ang' || k === 'alt') && obj.global) st.luz[k] = v;
        mudou();
    }));
    box.querySelectorAll('select[data-k]').forEach(el => el.addEventListener('change', () => { obj[el.dataset.k] = el.value; mudou(el.dataset.k === 'tipo'); }));
    box.querySelectorAll('input[type=checkbox][data-k]').forEach(el => el.addEventListener('change', () => {
        obj[el.dataset.k] = el.checked;
        if (el.dataset.k === 'global' && el.checked) { obj.ang = st.luz.ang; if (obj.alt !== undefined) obj.alt = st.luz.alt; mudou(true); return; }
        mudou();
    }));
    box.querySelectorAll('[data-canal]').forEach(el => el.addEventListener('change', () => { obj.canais = { ...obj.canais, [el.dataset.canal]: el.checked }; mudou(); }));
    box.querySelectorAll('[data-radio]').forEach(el => el.addEventListener('click', () => { obj[el.dataset.radio] = el.dataset.v; mudou(true); }));
    box.querySelectorAll('[data-cor]').forEach(el => el.addEventListener('click', () => ieSeletorCor(el, obj[el.dataset.cor], c => { el.style.background = c; obj[el.dataset.cor] = c; mudou(); })));
    box.querySelectorAll('[data-padrao]').forEach(el => {
        const c = iePadraoCanvas(el.dataset.v); el.style.backgroundImage = `url(${c.toDataURL()})`;
        el.addEventListener('click', () => { obj[el.dataset.padrao] = el.dataset.v; mudou(true); });
    });
    box.querySelectorAll('[data-contorno]').forEach(el => {
        const cv = ieCanvas(32, 32), x = ieCtx(cv), f = IE_CONTORNOS[el.dataset.v][1];
        x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, 32, 32); x.strokeStyle = '#ddd'; x.lineWidth = 2; x.beginPath();
        for (let i = 0; i <= 28; i++) { const t = i / 28; (i ? x.lineTo : x.moveTo).call(x, 2 + i, 30 - f(t) * 28); }
        x.stroke(); el.style.backgroundImage = `url(${cv.toDataURL()})`;
        el.addEventListener('click', () => { obj[el.dataset.contorno] = el.dataset.v; mudou(true); });
    });
    box.querySelectorAll('[data-grad]').forEach(el => { ieLsGradDesenhar(el, obj[el.dataset.grad]); el.addEventListener('click', () => ieLsGradEditor(el, obj, el.dataset.grad, mudou)); });
    box.querySelectorAll('[data-dial]').forEach(cv => { ieLsDial(cv, obj, cv.dataset.dial); ieLsDialArrastar(cv, obj, cv.dataset.dial, box, mudou); });
    box.querySelectorAll('[data-acao]').forEach(el => el.addEventListener('click', () => {
        const s = st.sel, a = el.dataset.acao;
        if (a === 'realinhar') { obj.ofx = 0; obj.ofy = 0; mudou(true); return; }
        if (typeof s !== 'object') return;
        if (a === 'tornarPadrao') { const p = { ...(iePref('fxPadrao', {}) || {}) }; const c = ieClone(obj); delete c.on; p[s.tipo] = c; iePrefGravar('fxPadrao', p); ieToast(ieLsT('Padrão salvo')); return; }
        if (a === 'redefinir') { st.fx[s.tipo][s.i] = { ...ieFxNovo(s.tipo), on: obj.on !== false }; mudou(true); }
    }));
    box.querySelector('[data-mescse]')?.addEventListener('change', ev => { st.canalMescSe = ev.target.value; ieLsMeio(); });
    box.querySelectorAll('[data-ms]').forEach(cv => ieLsMescSeWidget(cv, obj, mudou));
    box.querySelectorAll('input, select').forEach(el => el.addEventListener('keydown', ev => { if (ev.key !== 'Escape' && ev.key !== 'Enter') ev.stopPropagation(); }));
}

// mostrador de ângulo (arrastar gira; com "Usar luz global" muda a luz de todas as camadas)
function ieLsDial(cv, obj, k) {
    if (!cv) return;
    const x = ieCtx(cv), r = 30, c = 34, a = (obj[k] ?? 120) * Math.PI / 180;
    x.clearRect(0, 0, 68, 68);
    x.fillStyle = '#1b1b1b'; x.strokeStyle = '#777'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.fill(); x.stroke();
    x.strokeStyle = '#eee'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * r, c - Math.sin(a) * r); x.stroke();
    x.fillStyle = '#eee'; x.beginPath(); x.arc(c, c, 2.5, 0, Math.PI * 2); x.fill();
}
function ieLsDialArrastar(cv, obj, k, box, mudou) {
    cv.addEventListener('pointerdown', ev => {
        cv.setPointerCapture(ev.pointerId);
        const mv = e => {
            const r = cv.getBoundingClientRect();
            let a = Math.round(Math.atan2(-(e.clientY - r.top - r.height / 2), e.clientX - r.left - r.width / 2) * 180 / Math.PI);
            if (e.shiftKey) a = Math.round(a / 15) * 15;
            obj[k] = a;
            if (obj.global) IE_LS.st.luz.ang = a;
            const n = box.querySelector(`[data-n="${k}"]`); if (n) n.value = a;
            ieLsDial(cv, obj, k);
            mudou();
        };
        mv(ev);
        cv.onpointermove = mv;
        cv.onpointerup = () => { cv.onpointermove = null; };
    });
}

// barra do Misturar se: 4 valores [preto0, preto1, branco0, branco1]; Alt separa as metades
function ieLsMescSeWidget(cv, obj, mudou) {
    const st = IE_LS.st, qual = cv.dataset.ms, ch = st.canalMescSe;
    const faixa = () => obj.mescSe[ch][qual];
    const W = cv.width, H = cv.height, m = 8, larg = W - 2 * m;
    const pos = v => m + v / 255 * larg;
    const desenhar = () => {
        const x = ieCtx(cv), f = faixa();
        x.clearRect(0, 0, W, H);
        const g = x.createLinearGradient(m, 0, W - m, 0);
        g.addColorStop(0, '#000'); g.addColorStop(1, ch === 'r' ? '#f00' : ch === 'g' ? '#0f0' : ch === 'b' ? '#00f' : '#fff');
        x.fillStyle = g; x.fillRect(m, 2, larg, 14);
        const seta = (v, cor, meia) => { const p = pos(v); x.fillStyle = cor; x.strokeStyle = '#888'; x.beginPath(); x.moveTo(p, 18); x.lineTo(p - (meia === 'e' ? 6 : meia === 'd' ? 0 : 6), 30); x.lineTo(p + (meia === 'd' ? 6 : meia === 'e' ? 0 : 6), 30); x.closePath(); x.fill(); x.stroke(); };
        const sep = (a, b) => a !== b;
        if (sep(f[0], f[1])) { seta(f[0], '#222', 'e'); seta(f[1], '#222', 'd'); } else seta(f[0], '#222');
        if (sep(f[2], f[3])) { seta(f[2], '#eee', 'e'); seta(f[3], '#eee', 'd'); } else seta(f[2], '#eee');
    };
    desenhar();
    cv.addEventListener('pointerdown', ev => {
        const r = cv.getBoundingClientRect(), f = faixa();
        const v0 = (ev.clientX - r.left) / r.width * W;
        const val = px => Math.round(ieClamp((px - m) / larg * 255, 0, 255));
        const dist = f.map(v => Math.abs(pos(v) - v0));
        let i = dist.indexOf(Math.min(...dist));
        const preto = i < 2, junto = preto ? f[0] === f[1] : f[2] === f[3];
        cv.setPointerCapture(ev.pointerId);
        cv.onpointermove = e => {
            const v = val((e.clientX - r.left) / r.width * W), g = faixa();
            if (junto && !e.altKey) { if (preto) { g[0] = g[1] = Math.min(v, g[2]); } else { g[2] = g[3] = Math.max(v, g[1]); } }
            else {
                if (junto && e.altKey) i = preto ? (v < g[0] ? 0 : 1) : (v < g[2] ? 2 : 3);
                g[i] = v;
                g[0] = Math.min(g[0], g[1]); g[2] = Math.min(g[2], g[3]);
                if (g[1] > g[2]) { if (preto) g[1] = g[2]; else g[2] = g[1]; }
            }
            const t = document.querySelector(`[data-ms-txt="${qual}"]`); if (t) t.textContent = ieLsTxtFaixa(g);
            desenhar(); mudou();
        };
        cv.onpointerup = () => { cv.onpointermove = null; };
    });
}

// ─────────────────────────── degradê: amostra e editor ───────────────────────────
function ieLsGradDesenhar(el, g) {
    const c = ieFxDegrade(240, 20, { x: 0, y: 0, w: 240, h: 20 }, g || IE_GRAD_PADRAO(), 'linear', 0);
    const x = ieCanvas(240, 20), xc = ieCtx(x);
    xc.fillStyle = ieXadrezPadrao(xc); xc.fillRect(0, 0, 240, 20); xc.drawImage(c, 0, 0);
    el.style.backgroundImage = `url(${x.toDataURL()})`;
}
function ieLsGradEditor(ancora, obj, k, mudou) {
    const g = obj[k] = ieClone(obj[k] || IE_GRAD_PADRAO());
    const pop = document.createElement('div');
    pop.className = 'ie-ls-pop ie-ls-gradpop';
    pop.innerHTML = `<div class="ie-ls-tit">${ieLsT('Predefinições')}</div><div class="ie-ls-grads">${IE_GRADS().map((p, i) => `<button class="ie-ls-gradp" data-p="${i}" title="${ieEsc(ieLsT(p.nome))}"></button>`).join('')}</div>
        <div class="ie-ls-tit">${ieLsT('Paradas')} <em class="ie-prop-nota">${ieLsT('em cima: opacidade · embaixo: cor · clique na barra acrescenta, arraste para fora tira')}</em></div>
        <canvas class="ie-ls-gradbar" width="320" height="64"></canvas>
        <div class="ie-ls-gradsel"></div><div class="ie-ls-botoes"><button class="ie-btn ie-btn-mini ie-btn-primario" data-fim>OK</button></div>`;
    const rb = ieEl('ie').getBoundingClientRect(), ra = ancora.getBoundingClientRect();
    pop.style.left = Math.min(rb.width - 360, ra.left - rb.left) + 'px';
    pop.style.top = Math.min(rb.height - 300, ra.bottom - rb.top + 4) + 'px';
    ieEl('ie').appendChild(pop);
    pop.querySelectorAll('[data-p]').forEach(b => { ieLsGradDesenhar(b, IE_GRADS()[+b.dataset.p]); b.onclick = () => { const p = IE_GRADS()[+b.dataset.p]; g.cores = ieClone(p.cores); g.ops = ieClone(p.ops); g.nome = p.nome; sel = null; tudo(); }; });
    const cv = pop.querySelector('.ie-ls-gradbar'), W = cv.width, m = 10, larg = W - 2 * m;
    let sel = null;   // {lista: 'cores'|'ops', i}
    const desenhar = () => {
        const x = ieCtx(cv);
        x.clearRect(0, 0, W, 64);
        x.fillStyle = ieXadrezPadrao(x); x.fillRect(m, 18, larg, 26);
        x.drawImage(ieFxDegrade(larg, 26, { x: 0, y: 0, w: larg, h: 26 }, g, 'linear', 0), m, 18);
        g.ops.forEach(([p, o], i) => { const px = m + p * larg; x.fillStyle = `rgba(255,255,255,${o / 100})`; x.strokeStyle = sel && sel.lista === 'ops' && sel.i === i ? '#4aa3ff' : '#888'; x.beginPath(); x.moveTo(px, 16); x.lineTo(px - 6, 4); x.lineTo(px + 6, 4); x.closePath(); x.fill(); x.stroke(); });
        g.cores.forEach(([p, c], i) => { const px = m + p * larg; x.fillStyle = c; x.strokeStyle = sel && sel.lista === 'cores' && sel.i === i ? '#4aa3ff' : '#888'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, 46); x.lineTo(px - 6, 58); x.lineTo(px + 6, 58); x.closePath(); x.fill(); x.stroke(); });
    };
    const painelSel = () => {
        const box = pop.querySelector('.ie-ls-gradsel');
        if (!sel) { box.innerHTML = ''; return; }
        const it = g[sel.lista][sel.i];
        box.innerHTML = sel.lista === 'cores'
            ? `<label class="ie-ls-lin"><span>${ieLsT('Cor')}</span><button class="ie-cor ie-ls-cor" data-gc style="background:${it[1]}"></button></label><label class="ie-ls-lin"><span>${ieLsT('Local')}</span><input type="number" data-gl min="0" max="100" value="${Math.round(it[0] * 100)}"><em>%</em></label>`
            : `<label class="ie-ls-lin"><span>${ieLsT('Opacidade')}</span><input type="number" data-go min="0" max="100" value="${Math.round(it[1])}"><em>%</em></label><label class="ie-ls-lin"><span>${ieLsT('Local')}</span><input type="number" data-gl min="0" max="100" value="${Math.round(it[0] * 100)}"><em>%</em></label>`;
        box.querySelector('[data-gc]')?.addEventListener('click', ev => ieSeletorCor(ev.target, it[1], c => { it[1] = c; ev.target.style.background = c; tudo(true); }));
        box.querySelector('[data-gl]')?.addEventListener('input', ev => { it[0] = ieClamp((+ev.target.value || 0) / 100, 0, 1); tudo(true); });
        box.querySelector('[data-go]')?.addEventListener('input', ev => { it[1] = ieClamp(+ev.target.value || 0, 0, 100); tudo(true); });
        box.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    };
    const tudo = (semPainel) => { desenhar(); if (!semPainel) painelSel(); ieLsGradDesenhar(ancora, g); mudou(); };
    cv.addEventListener('pointerdown', ev => {
        const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W, y = (ev.clientY - r.top) / r.height * 64;
        const lista = y < 32 ? 'ops' : 'cores';
        let i = g[lista].findIndex(([p]) => Math.abs(m + p * larg - x) < 7);
        if (i < 0) {   // nova parada (cor/opacidade do ponto)
            const p = ieClamp((x - m) / larg, 0, 1);
            const amostra = ieCtx(ieFxDegrade(larg, 1, { x: 0, y: 0, w: larg, h: 1 }, g, 'linear', 0)).getImageData(Math.min(larg - 1, Math.round(p * larg)), 0, 1, 1).data;
            g[lista].push(lista === 'cores' ? [p, ieRgbHex(amostra[0], amostra[1], amostra[2])] : [p, Math.round(amostra[3] / 2.55)]);
            i = g[lista].length - 1;
        }
        sel = { lista, i };
        cv.setPointerCapture(ev.pointerId);
        cv.onpointermove = e => {
            const it = g[lista][sel.i];
            it[0] = ieClamp(((e.clientX - r.left) / r.width * W - m) / larg, 0, 1);
            const fora = Math.abs((e.clientY - r.top) / r.height * 64 - 32) > 46;
            it._tirar = fora && g[lista].length > 2;
            tudo(true);
        };
        cv.onpointerup = () => {
            cv.onpointermove = null;
            const it = g[lista][sel.i];
            if (it && it._tirar) { g[lista].splice(sel.i, 1); sel = null; }
            g[lista].forEach(x => delete x._tirar);
            tudo();
        };
        tudo();
    });
    const fim = () => { pop.remove(); document.removeEventListener('pointerdown', fora, true); g.cores.sort((a, b) => a[0] - b[0]); g.ops.sort((a, b) => a[0] - b[0]); };
    const fora = e => { if (!pop.contains(e.target) && e.target !== ancora && !ieEl('ie-pop').contains(e.target)) fim(); };
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
    pop.querySelector('[data-fim]').onclick = fim;
    tudo();
}

// ─────────────────────────── amostra (quadrado cinza com o estilo, como no Photoshop) ───────────────────────────
function ieLsRenderAmostra(cv, fx, mescla) {
    const W = cv.width, H = cv.height, x = ieCtx(cv);
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, W, H);
    const t = Math.round(W * 0.42), base = ieCanvas(t, t), bx = ieCtx(base);
    bx.fillStyle = '#9a9a9a'; bx.fillRect(0, 0, t, t);
    try {
        const r = ieFxRender(base, fx, { fill: mescla ? mescla.fill : 1, interiorComFill: !!(mescla && mescla.misturaInterior), doc: IE.doc });
        const o = Math.round((W - t) / 2) - r.mg;
        for (const e of [...r.ext, { c: r.c, bm: 'NORMAL', op: 1 }, ...r.acima]) { x.save(); x.globalAlpha = e.op * (mescla ? mescla.op : 1); x.globalCompositeOperation = ieGco(e.bm); x.drawImage(e.c, o, o); x.restore(); }
    } catch (e) { console.error(e); }
}
function ieLsAmostra() {
    const st = IE_LS.st, cv = document.querySelector('.ie-ls-amostra');
    if (st && cv) ieLsRenderAmostra(cv, st.fx, st.mescla);
}

// ─────────────────────────── Estilos (prontos + do usuário) ───────────────────────────
function ieLsEstilosLista() { return [...IE_ESTILOS_PRONTOS.map(e => ({ ...e, pronto: true })), ...(iePref('estilos', []) || [])]; }
function ieLsEstilos(box) {
    const st = IE_LS.st, lista = ieLsEstilosLista();
    box.innerHTML = `<div class="ie-ls-titulo">${ieLsT('Estilos')}</div><div class="ie-ls-estilos">${lista.map((e, i) =>
        `<button class="ie-ls-estilo" data-estilo="${i}" title="${ieEsc(e.nome)}${e.pronto ? '' : ' — ' + ieLsT('botão direito: excluir')}"><canvas width="72" height="72"></canvas><span>${ieEsc(e.nome)}</span></button>`).join('')}</div>
        <div class="ie-prop-nota">${ieLsT('Clique para aplicar. "Novo estilo..." guarda o estilo atual aqui.')}</div>`;
    box.querySelectorAll('[data-estilo]').forEach(b => {
        const e = lista[+b.dataset.estilo];
        ieLsRenderAmostra(b.querySelector('canvas'), ieFxNorm(ieClone(e.fx)), { op: 1, fill: (e.mescla && e.mescla.fill) ?? 1 });
        b.addEventListener('click', () => {
            st.fx = ieFxNorm(ieClone(e.fx)) || { _v2: true };
            if (e.mescla) Object.assign(st.mescla, ieClone(e.mescla));
            ieLsLista(); ieLsAplicar();
        });
        b.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            if (e.pronto) return;
            const meus = (iePref('estilos', []) || []).filter(x => x.nome !== e.nome);
            iePrefGravar('estilos', meus);
            ieLsEstilos(box);
        });
    });
}
function ieLsNovoEstilo() {
    const st = IE_LS.st;
    const dir = document.querySelector('.ie-ls-dir');
    if (dir.querySelector('.ie-ls-novo')) return;
    const f = document.createElement('div');
    f.className = 'ie-ls-novo';
    f.innerHTML = `<input type="text" placeholder="${ieLsT('Nome do estilo')}" value="${ieEsc(ieLsT('Estilo') + ' ' + ((iePref('estilos', []) || []).length + 1))}">
        <label class="ie-ls-chk"><input type="checkbox" data-mesc checked> ${ieLsT('Incluir opções de mesclagem')}</label>
        <div class="ie-ls-botoes"><button class="ie-btn ie-btn-mini" data-nao>${ieLsT('Cancelar')}</button><button class="ie-btn ie-btn-mini ie-btn-primario" data-sim>OK</button></div>`;
    dir.insertBefore(f, dir.querySelector('.ie-ls-amostra'));
    const inp = f.querySelector('input[type=text]');
    inp.focus(); inp.select();
    inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') f.querySelector('[data-sim]').click(); });
    f.querySelector('[data-nao]').onclick = () => f.remove();
    f.querySelector('[data-sim]').onclick = () => {
        const nome = inp.value.trim() || ieLsT('Estilo');
        const novo = { nome, fx: ieClone(st.fx) };
        if (f.querySelector('[data-mesc]').checked) novo.mescla = { fill: st.mescla.fill, misturaInterior: st.mescla.misturaInterior };
        iePrefGravar('estilos', [...(iePref('estilos', []) || []).filter(x => x.nome !== nome), novo]);
        f.remove();
        ieToast(`${ieLsT('Estilo salvo')}: ${nome}`);
        if (st.sel === 'estilos') ieLsMeio();
    };
}

// ─────────────────────────── comandos, menu de contexto e Camada > Estilo de camada ───────────────────────────
Object.assign(IE_CMDS, {
    estiloCamada: () => ieEstiloCamada(),
    opcoesMescla: () => ieEstiloCamada(ieAtiva(), 'mescla'),
    copiarEstilo: doc => { const L = ieAtiva(doc); if (!L) return; IE.estiloCopiado = { fx: ieClone(ieFxNorm(L.fx)), mescla: Object.fromEntries(['fill', ...IE_MESCLA_CHAVES].map(k => [k, ieClone(L[k])])) }; ieToast(ieT('Estilo de camada copiado')); },
    colarEstilo: doc => {
        const c = IE.estiloCopiado;
        if (!c) return;
        for (const L of ieSelecionadas(doc)) {
            if (L.tipo === 'ajuste') continue;
            const R = ieRCamada(L);
            L.fx = ieClone(c.fx);
            for (const [k, v] of Object.entries(c.mescla || {})) if (v !== undefined && v !== null) L[k] = ieClone(v);
            L.fxMudou = true; L.mesclaMudou = true;
            ieCamadaMudou(L, R);
        }
        ieHist(ieT('Colar estilo de camada'));
        ieUiCamadas();
    },
    limparEstilo: doc => {
        for (const L of ieSelecionadas(doc)) {
            if (!L.fx) continue;
            const R = ieRCamada(L);
            L.fx = L.fx.outros && L.fx.outros.length ? { _v2: true, outros: L.fx.outros } : null;
            L.fxMudou = true;
            ieCamadaMudou(L, R);
        }
        ieHist(ieT('Limpar estilo de camada'));
        ieUiCamadas();
    },
});
{
    const cam = IE_MENUS.find(m => m[0] === 'Camada');
    const i = cam[1].findIndex(it => Array.isArray(it) && it[1] === 'corte');
    cam[1].splice(i + 1, 0, ['Estilo de camada', [['Opções de mesclagem...', 'opcoesMescla'], '-', ...IE_FX_TIPOS.map(([k, n]) => [n + '...', 'fx:' + k]), '-',
        ['Copiar estilo de camada', 'copiarEstilo'], ['Colar estilo de camada', 'colarEstilo'], ['Limpar estilo de camada', 'limparEstilo']]]);
    for (const [k] of IE_FX_TIPOS) IE_CMDS['fx:' + k] = () => ieEstiloCamada(ieAtiva(), k);
}
// ieCmd entende 'fx:tipo' (IE_CMDS já tem as chaves; o ieCmd separa só 'aj:', 'f:' e 'img:')

// botão fx do painel Camadas: menu com os efeitos (como no Photoshop)
document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-fxmenu]');
    if (!b || !IE.doc) return;
    ev.stopPropagation();
    const pop = ieEl('ie-pop'), rb = ieEl('ie').getBoundingClientRect(), r = b.getBoundingClientRect();
    pop.innerHTML = ieMenuHtml([['Opções de mesclagem...', 'opcoesMescla'], '-', ...IE_FX_TIPOS.map(([k, n]) => [n + '...', 'fx:' + k])]);
    pop.hidden = false;
    pop.style.left = Math.min(rb.width - 240, r.left - rb.left) + 'px';
    pop.style.top = Math.max(4, r.top - rb.top - pop.offsetHeight - 4) + 'px';
    const fora = e => { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener('pointerdown', fora, true); } };
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
}, true);
