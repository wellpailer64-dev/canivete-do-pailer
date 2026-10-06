// =========================================================
// Editor de Imagem — interface: menus, barra de ferramentas, barra de opções, painéis (Propriedades, Camadas,
// Histórico), seletor de cor, diálogos, abas dos documentos, barra de status e atalhos (os do Photoshop).
// =========================================================

// ─────────────────────────── ícones das ferramentas (traço 24x24) ───────────────────────────
const IE_ICONES = {
    pointer: '<path d="M5 3v14l4-4 3 7 2.5-1-3-7h6z"/><path d="M19 15v6M16 18h6"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v5h-5"/>',
    lassoPoli: '<path d="M5 17 4 7l9-4 7 6-5 9z"/><path d="M5 17c0 2 1 4 3 4"/>',
    rotEsq: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 3v5h5"/>',
    espelharH: '<path d="M12 3v18"/><path d="M8 7 3 12l5 5zM16 7l5 5-5 5z"/>',
    marquee: '<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 2.4"/>',
    lasso: '<path d="M7 17c-3-1-4-4-3-7 2-5 12-7 15-3 2 3-1 7-6 8-3 .5-5 0-6-1"/><path d="M7 17c0 2 1 4 3 4"/>',
    wand: '<path d="m4 20 11-11M13 7l4 4M18 2v4M16 4h4M8 3v2M7 4h2M20 12v3M18.5 13.5h3"/>',
    crop: '<path d="M6 2v16h16"/><path d="M2 6h16v16"/>',
    dropper: '<path d="m14 6 4 4M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4z"/><path d="M4 20l1-2"/>',
    stamp: '<path d="M9 13V9a3 3 0 1 1 6 0v4"/><path d="M5 13h14v4H5zM6 20h12"/>',
    brush: '<path d="M9.5 14.5 19 5a2.1 2.1 0 0 1 3 3l-9.5 9.5"/><path d="M7 15c-2 0-3.5 1.5-3.5 3.5 0 1.2-.5 2-1.5 2.5 3 .5 7-.5 7-4 0-1.1-.9-2-2-2z"/>',
    eraser: '<path d="m7 21-4-4 11-11 7 7-8 8z"/><path d="M7 21h13M9 11l7 7"/>',
    gradient: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 5v14M11 5v14" opacity=".55"/><path d="M15 5v14" opacity=".3"/>',
    bucket: '<path d="m19 11-8-8-8.5 8.5a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0z"/><path d="M5 2l3 3M2.5 13h15M21 16s2 2.4 2 3.5a2 2 0 0 1-4 0c0-1.1 2-3.5 2-3.5z"/>',
    type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    shape: '<rect x="3" y="11" width="10" height="10" rx="1.5"/><circle cx="16" cy="8" r="5"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8M10.5 7.5v6M7.5 10.5h6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    plus: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    mask: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4.5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    travaTransp: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z" fill="currentColor" stroke="none"/>',
    travaPx: '<path d="M9.5 14.5 19 5a2.1 2.1 0 0 1 3 3l-9.5 9.5"/><path d="M7 15c-2 0-3.5 1.5-3.5 3.5 0 1.2-.5 2-1.5 2.5 3 .5 7-.5 7-4 0-1.1-.9-2-2-2z"/>',
    travaPos: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
    slice: '<path d="M4 20 20 4"/><path d="M14 4h6v6"/><path d="M4 14v6h6"/>',
    raw: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18" opacity=".5"/><circle cx="12" cy="12" r="3.5"/>',
    clip: '<path d="M6 4v9a4 4 0 0 0 4 4h8"/><path d="m15 13 4 4-4 4"/>',
    fx: '<path d="M6 20c2 0 2.5-2 3-5l1.5-8c.5-2.5 1.5-3 3-3M7 10h7M14 12l6 7M20 12l-6 7"/>',
    smart: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M14 4v6h6"/>',
    adj: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    swap: '<path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alinE: '<path d="M4 3v18M8 7h12v4H8zM8 14h7v4H8z"/>', alinCH: '<path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/>', alinD: '<path d="M20 3v18M4 7h12v4H4zM9 14h7v4H9z"/>',
    alinT: '<path d="M3 4h18M7 8v12h4V8zM14 8v7h4V8z"/>', alinCV: '<path d="M3 12h18M7 6v12h4V6zM14 8v8h4V8z"/>', alinB: '<path d="M3 20h18M7 4v12h4V4zM14 9v7h4V9z"/>',
};
const ieIco = (n, cls = '') => `<svg class="ie-i ${cls}" viewBox="0 0 24 24">${IE_ICONES[n] || ''}</svg>`;

// ─────────────────────────── barra de ferramentas ───────────────────────────
function ieUiFerr() {
    const box = ieEl('ie-ferr');
    if (!box) return;
    if (!box._ok) {
        box._ok = true;
        box.innerHTML = IE_FERR_ORDEM.map(n => n === '|' ? '<i class="ie-ferr-sep"></i>' :
            `<button class="ie-ferr-btn" data-f="${n}" title="${ieT(IE_FERR[n].nome)} (${IE_FERR[n].tecla})">${ieIco(IE_FERR[n].icone)}</button>`).join('') +
            `<div class="ie-cores" title="${ieT('Cor de frente e de fundo (D: padrão, X: trocar)')}">
                <button class="ie-cor ie-cor-frente" id="ie-cor0" onclick="ieEscolherCor(0, this)"></button>
                <button class="ie-cor ie-cor-fundo" id="ie-cor1" onclick="ieEscolherCor(1, this)"></button>
                <button class="ie-cor-troca" onclick="ieTrocarCores()" title="${ieT('Trocar (X)')}">${ieIco('swap')}</button>
                <button class="ie-cor-padrao" onclick="ieCoresPadrao()" title="${ieT('Padrão (D)')}"><i></i><i></i></button>
            </div>`;
        box.addEventListener('click', ev => { const b = ev.target.closest('.ie-ferr-btn'); if (b) ieEscolherFerr(b.dataset.f); });
    }
    box.querySelectorAll('.ie-ferr-btn').forEach(b => b.classList.toggle('on', b.dataset.f === IE.ferr));
    ieUiCores();
}
function ieUiCores() {
    const a = ieEl('ie-cor0'), b = ieEl('ie-cor1');
    if (a) a.style.background = IE.cor[0];
    if (b) b.style.background = IE.cor[1];
}
function ieTrocarCores() { IE.cor = [IE.cor[1], IE.cor[0]]; ieUiCores(); }
function ieCoresPadrao() { IE.cor = ['#000000', '#ffffff']; ieUiCores(); }

// ─────────────────────────── barra de opções ───────────────────────────
const ieNum = (rotulo, k, obj, min, max, passo = 1, suf = '', larg = 54) =>
    `<label class="ie-op-campo">${ieT(rotulo)} <input type="number" data-k="${k}" data-o="${obj}" min="${min}" max="${max}" step="${passo}" value="${IE.op[obj][k]}" style="width:${larg}px">${suf}</label>`;
const ieChk = (rotulo, k, obj) => `<label class="ie-op-chk"><input type="checkbox" data-k="${k}" data-o="${obj}" ${IE.op[obj][k] ? 'checked' : ''}> ${ieT(rotulo)}</label>`;
const ieSegm = (k, obj, opcoes) => `<div class="ie-segm">${opcoes.map(([v, r]) => `<button data-k="${k}" data-o="${obj}" data-v="${v}" class="${IE.op[obj][k] === v ? 'on' : ''}">${ieT(r)}</button>`).join('')}</div>`;

// os 4 modos de seleção do Photoshop (Nova / Adicionar / Subtrair / Interseção), com o ícone de cada um
function ieSelModos() {
    const ic = { nova: '<rect x="4" y="4" width="12" height="12"/>', somar: '<rect x="3" y="3" width="10" height="10"/><rect x="9" y="9" width="10" height="10"/>',
        subtrair: '<rect x="3" y="3" width="10" height="10"/><rect x="9" y="9" width="10" height="10" stroke-dasharray="2 2"/>', cruzar: '<rect x="3" y="3" width="10" height="10" stroke-dasharray="2 2"/><rect x="9" y="9" width="10" height="10" stroke-dasharray="2 2"/><rect x="9" y="9" width="4" height="4" fill="currentColor"/>' };
    const nomes = { nova: 'Nova seleção', somar: 'Adicionar à seleção (Shift)', subtrair: 'Subtrair da seleção (Alt)', cruzar: 'Interseção com a seleção (Shift+Alt)' };
    return `<div class="ie-segm ie-sel-modos">${Object.keys(ic).map(k => `<button data-k="modo" data-o="sel" data-v="${k}" class="${IE.op.sel.modo === k ? 'on' : ''}" title="${ieT(nomes[k])}"><svg class="ie-i" viewBox="0 0 22 22">${ic[k]}</svg></button>`).join('')}</div><i class="ie-op-sep"></i>`;
}
function ieOpcoesRender(soValores) {
    const box = ieEl('ie-opcoes');
    if (!box) return;
    const doc = IE.doc;
    if (IE.transf) {
        const t = IE.transf, M = ieTransfMat(t);
        const html = `<span class="ie-op-tit">${ieT('Transformação livre')}</span>
            <label class="ie-op-campo">X <input type="number" data-t="cx" value="${Math.round(t.cx)}" style="width:64px"></label>
            <label class="ie-op-campo">Y <input type="number" data-t="cy" value="${Math.round(t.cy)}" style="width:64px"></label>
            <label class="ie-op-campo">L <input type="number" data-t="sx" value="${(t.sx * 100).toFixed(1)}" step="0.1" style="width:64px">%</label>
            <label class="ie-op-campo">A <input type="number" data-t="sy" value="${(t.sy * 100).toFixed(1)}" step="0.1" style="width:64px">%</label>
            <label class="ie-op-campo">${ieT('Ângulo')} <input type="number" data-t="rot" value="${(t.rot * 180 / Math.PI).toFixed(1)}" step="0.1" style="width:64px">°</label>
            <span class="ie-op-dica">${ieT('Shift: sem proporção · Alt: pelo centro · fora da caixa: girar')}</span>
            <div class="ie-op-esp"></div>
            <button class="ie-btn ie-btn-mini" onclick="ieTransfCancelar()" title="Esc">${ieIco('x')} ${ieT('Cancelar')}</button>
            <button class="ie-btn ie-btn-mini ie-btn-primario" onclick="ieTransfAplicar()" title="Enter">${ieIco('check')} ${ieT('Aplicar')}</button>`;
        if (soValores && box.dataset.modo === 'transf') {
            box.querySelectorAll('input[data-t]').forEach(i => {
                if (document.activeElement === i) return;
                const k = i.dataset.t;
                i.value = k === 'cx' || k === 'cy' ? Math.round(t[k]) : k === 'rot' ? (t.rot * 180 / Math.PI).toFixed(1) : (t[k] * 100).toFixed(1);
            });
            void M;
            return;
        }
        box.dataset.modo = 'transf';
        box.innerHTML = html;
        return;
    }
    box.dataset.modo = IE.ferr;
    const f = IE_FERR[IE.ferr];
    let h = `<span class="ie-op-ico">${ieIco(f.icone)}</span>`;
    switch (IE.ferr) {
        case 'mover':
            IE.op.mover.alvo = IE.op.mover.alvo || 'camada';
            h += ieChk('Seleção automática', 'auto', 'mover') +
                `<span class="ie-op-dica">${ieT('Selecionar')}</span>` + ieSegm('alvo', 'mover', [['camada', 'Camada'], ['grupo', 'Grupo']]) +
                ieChk('Mostrar controles de transformação', 'controles', 'mover') +
                `<i class="ie-op-sep"></i><span class="ie-op-dica">${ieT('Alinhar')}</span>` +
                [['alinE', 'esq'], ['alinCH', 'ch'], ['alinD', 'dir'], ['alinT', 'topo'], ['alinCV', 'cv'], ['alinB', 'base']]
                    .map(([i, a]) => `<button class="ie-ico-btn" onclick="ieAlinhar('${a}')" title="${ieT('Alinhar')}">${ieIco(i)}</button>`).join('') +
                ieBotoesGirar() +
                `<span class="ie-op-dica">${ieT('Ctrl: escolher camada · Alt: duplicar · setas: 1 px (Shift: 10) · perto dos cantos: girar')}</span>`;
            break;
        case 'girar':
            h += ieBotoesGirar(true) + `<span class="ie-op-dica">${ieT('Arraste para girar a camada em volta do centro · Shift: de 15 em 15° · Enter aplica, Esc cancela')}</span>`;
            break;
        case 'letreiro':
            h += ieSelModos() + ieSegm('forma', 'letreiro', [['ret', 'Retângulo'], ['eli', 'Elipse']]) + ieNum('Suavizar', 'suav', 'letreiro', 0, 250, 1, ' px') +
                `<span class="ie-op-dica">${ieT('Shift: somar · Alt: subtrair · Shift+Alt: cruzar')}</span>`;
            break;
        case 'laco':
            h += ieSelModos() + ieNum('Suavizar', 'suav', 'laco', 0, 250, 1, ' px') +
                `<span class="ie-op-dica">${ieT('Clique e arraste para desenhar · Shift: adicionar · Alt: subtrair · Shift+Alt: interseção')}</span>`;
            break;
        case 'lacoPoli':
            h += ieSelModos() + ieNum('Suavizar', 'suav', 'laco', 0, 250, 1, ' px') +
                `<span class="ie-op-dica">${ieT('Clique os pontos · clique no início, duplo clique ou Enter fecha · Backspace apaga o último')}</span>`;
            break;
        case 'varinha':
            h += ieSelModos() + ieNum('Tolerância', 'tol', 'varinha', 0, 255) + ieChk('Contíguo', 'contiguo', 'varinha') + ieChk('Todas as camadas', 'todas', 'varinha');
            break;
        case 'corte': {
            const r = IE.corte && IE.corte.r;
            h += `<span class="ie-op-dica">${r ? `${r.w} × ${r.h} px` : ''}</span>` + ieChk('Apagar pixels cortados', 'apagar', 'corte') +
                `<div class="ie-op-esp"></div><button class="ie-btn ie-btn-mini" onclick="IE_CORTE.ativar(IE.doc)">${ieIco('x')} ${ieT('Desfazer caixa')}</button>
                <button class="ie-btn ie-btn-mini ie-btn-primario" onclick="ieCorteAplicar()">${ieIco('check')} ${ieT('Cortar')}</button>`;
            break;
        }
        case 'fatia': {
            const f = ieFatiaSel(doc);
            h += (f ? `<span class="ie-op-dica">${ieT('Fatia')} ${doc.fatias.indexOf(f) + 1}: ${f.w} × ${f.h} px</span>` : `<span class="ie-op-dica">${ieT('Arraste para criar · clique para escolher · duplo clique: opções')}</span>`) +
                `<button class="ie-btn ie-btn-mini" onclick="ieCmd('fatiasGuias')" ${doc && (doc.guias || []).length ? '' : 'disabled'} title="${ieT('Uma fatia por célula entre as guias (apaga as fatias que existem)')}">${ieT('Fatias das guias')}</button>` +
                `<button class="ie-btn ie-btn-mini" onclick="ieCmd('fatiasCamadas')" title="${ieT('Uma fatia do tamanho de cada camada selecionada')}">${ieT('Das camadas')}</button>` +
                `<button class="ie-btn ie-btn-mini" onclick="ieCmd('fatiaDividir')" ${f ? '' : 'disabled'}>${ieT('Dividir...')}</button>` +
                `<button class="ie-btn ie-btn-mini" onclick="ieCmd('fatiaOpcoes')" ${f ? '' : 'disabled'}>${ieT('Opções...')}</button>` +
                `<button class="ie-btn ie-btn-mini" onclick="ieCmd('fatiaExcluir')" ${f ? '' : 'disabled'}>${ieIco('trash')} ${ieT('Excluir')}</button>` +
                `<button class="ie-btn ie-btn-mini" onclick="ieCmd('fatiasExcluir')" ${doc && doc.fatias.length ? '' : 'disabled'}>${ieT('Excluir todas')}</button>` +
                `<div class="ie-op-esp"></div><button class="ie-btn ie-btn-mini ie-btn-primario" onclick="ieCmd('exportarFatias')" ${doc && doc.fatias.length ? '' : 'disabled'}>${ieIco('check')} ${ieT('Exportar fatias...')}</button>`;
            break;
        }
        case 'contagotas':
            h += ieSegm('todas', 'contagotas', [[true, 'Todas as camadas'], [false, 'Camada atual']]);
            break;
        case 'carimbo':
            h += ieNum('Tamanho', 'tam', 'carimbo', 1, 2500, 1, ' px') + ieNum('Dureza', 'dureza', 'carimbo', 0, 100, 1, '%') +
                ieNum('Opacidade', 'opac', 'carimbo', 1, 100, 1, '%') + ieNum('Fluxo', 'fluxo', 'carimbo', 1, 100, 1, '%') +
                ieChk('Alinhado', 'alinhado', 'carimbo') + ieChk('Todas as camadas', 'todas', 'carimbo') +
                `<span class="ie-op-dica">${ieT('Alt+clique: origem')}</span>`;
            break;
        case 'pincel': case 'borracha':
            h += ieNum('Tamanho', 'tam', IE.ferr, 1, 2500, 1, ' px') + ieNum('Dureza', 'dureza', IE.ferr, 0, 100, 1, '%') +
                ieNum('Opacidade', 'opac', IE.ferr, 1, 100, 1, '%') + ieNum('Fluxo', 'fluxo', IE.ferr, 1, 100, 1, '%') +
                `<span class="ie-op-dica">${ieT('[ ]: tamanho · Shift+clique: linha reta')}${IE.ferr === 'pincel' ? ' · ' + ieT('Alt: conta-gotas') : ''}</span>`;
            break;
        case 'degrade':
            h += ieSegm('tipo', 'degrade', [['linear', 'Linear'], ['radial', 'Radial'], ['refletido', 'Refletido']]) +
                ieSegm('cores', 'degrade', [['frente-fundo', 'Frente → fundo'], ['frente-transp', 'Frente → transparente'], ...(IE.op.degrade.grad ? [['personalizado', 'Personalizado']] : [])]) +
                ieChk('Inverter', 'inverter', 'degrade') + ieNum('Opacidade', 'opac', 'degrade', 1, 100, 1, '%');
            break;
        case 'borrachaMagica':
            h += ieNum('Tolerância', 'tol', 'borrachaMagica', 0, 255) + ieChk('Suavização de serrilhado', 'suave', 'borrachaMagica') + ieChk('Contíguo', 'contiguo', 'borrachaMagica') +
                ieChk('Amostrar todas as camadas', 'todas', 'borrachaMagica') + ieNum('Opacidade', 'opac', 'borrachaMagica', 1, 100, 1, '%');
            break;
        case 'borrachaFundo':
            h += ieNum('Tamanho', 'tam', 'borrachaFundo', 1, 2500, 1, 'px') + ieSegm('amostra', 'borrachaFundo', [['continuo', 'Amostra contínua'], ['uma', 'Amostra uma vez']]) +
                ieSegm('limites', 'borrachaFundo', [['contiguo', 'Contíguo'], ['descontiguo', 'Descontíguo']]) + ieNum('Tolerância', 'tol', 'borrachaFundo', 0, 255) +
                ieChk('Proteger a cor de frente', 'proteger', 'borrachaFundo');
            break;
        case 'balde':
            h += ieNum('Tolerância', 'tol', 'balde', 0, 255) + ieChk('Contíguo', 'contiguo', 'balde') + ieChk('Todas as camadas', 'todas', 'balde') +
                ieNum('Opacidade', 'opac', 'balde', 1, 100, 1, '%');
            break;
        case 'texto': {
            const L = IE.edTexto ? IE.edTexto.L : ieAtiva(doc);
            const t = L && L.txt ? L.txt : null;
            const o = IE.op.texto;
            const fam = t ? t.fam : (o.fam || 'Arial'), est = t ? t.estilo : (o.estilo || 'Regular');
            const tam = t ? t.tam : o.tam, alin = t ? t.alin : o.alin, cor = t ? t.cor : IE.cor[0];
            const estilos = ((IE.estilos || {})[fam] || []).map(e => e.estilo);
            h += `<input class="ie-op-fonte" list="ie-fontes-lista" value="${ieEsc(fam)}" data-tx="fam" title="${ieT('Fonte')}">
                <select data-tx="estilo" title="${ieT('Estilo')}">${(estilos.length ? estilos : [est]).map(e => `<option ${e === est ? 'selected' : ''}>${ieEsc(e)}</option>`).join('')}</select>
                <label class="ie-op-campo"><input type="number" data-tx="tamEf" value="${+(tam * (t ? ieTextoEscala(t) : 1)).toFixed(2)}" min="1" max="5000" step="0.5" style="width:62px"> px</label>
                <div class="ie-segm">${[['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.']].map(([v, r]) => `<button data-tx="alin" data-v="${v}" class="${alin === v ? 'on' : ''}">${ieT(r)}</button>`).join('')}</div>
                <button class="ie-cor ie-cor-op" data-tx="cor" style="background:${cor}" title="${ieT('Cor do texto')}"></button>
                <label class="ie-op-campo" title="${ieT('Espaçamento entre letras')}">VA <input type="number" data-tx="esp" value="${Math.round(t ? t.esp : o.esp)}" step="10" style="width:56px"></label>
                <label class="ie-op-campo" title="${ieT('Entrelinha (0 = automática)')}">${ieT('Entrelinha')} <input type="number" data-tx="ent" value="${Math.round(t ? t.ent : o.ent)}" min="0" style="width:56px"></label>` +
                (IE.edTexto ? `<div class="ie-op-esp"></div><button class="ie-btn ie-btn-mini" onclick="ieTextoEncerrar(false)">${ieIco('x')}</button><button class="ie-btn ie-btn-mini ie-btn-primario" onclick="ieTextoEncerrar(true)" title="Ctrl+Enter / Esc">${ieIco('check')}</button>` : '');
            if (!ieEl('ie-fontes-lista')) {
                const dl = document.createElement('datalist');
                dl.id = 'ie-fontes-lista';
                document.body.appendChild(dl);
                ieCarregarFontes().then(e => { dl.innerHTML = Object.keys(e).map(f => `<option value="${ieEsc(f)}">`).join(''); if (IE.ferr === 'texto') ieOpcoesRender(); });
            }
            break;
        }
        case 'forma':
            h += ieSegm('tipo', 'forma', [['ret', 'Retângulo'], ['eli', 'Elipse'], ['linha', 'Linha'], ...(IE.op.forma.custom ? [['custom', 'Personalizada']] : [])]) +
                (IE.op.forma.tipo === 'linha' ? ieNum('Espessura', 'contorno', 'forma', 1, 500, 1, ' px') : ieNum('Cantos', 'raio', 'forma', 0, 2000, 1, ' px')) +
                `<span class="ie-op-dica">${ieT('Usa a cor de frente · Shift: proporcional')}</span>`;
            break;
        case 'mao': case 'zoom':
            h += `<button class="ie-btn ie-btn-mini" onclick="ieZoomReal(1)">100%</button><button class="ie-btn ie-btn-mini" onclick="ieAjustarVista()">${ieT('Ajustar à tela')}</button>` +
                (IE.ferr === 'zoom' ? `<span class="ie-op-dica">${ieT('Clique: aproximar · Alt+clique: afastar · arrastar: zoom contínuo')}</span>` : '');
            break;
        default:   // ferramentas de outros arquivos (Caneta, recuperação...) registram ieOpcoesXxx em IE_OPCOES_EXTRA
            for (const fn of (window.IE_OPCOES_EXTRA || [])) h += fn(IE.ferr) || '';
    }
    box.innerHTML = h;
}

function ieOpcoesInstalar() {
    const box = ieEl('ie-opcoes');
    if (!box || box._ok) return;
    box._ok = true;
    const ler = el => {
        if (el.dataset.t && IE.transf) {
            const t = IE.transf, v = parseFloat(el.value);
            if (!isFinite(v)) return;
            if (el.dataset.t === 'rot') t.rot = v * Math.PI / 180;
            else if (el.dataset.t === 'sx' || el.dataset.t === 'sy') t[el.dataset.t] = (v / 100) || 0.001;
            else t[el.dataset.t] = v;
            ieTransfPrevia();
            return;
        }
        if (el.dataset.tx) {
            const k = el.dataset.tx;
            if (k === 'cor') return;
            let v = el.dataset.v !== undefined ? el.dataset.v : el.value;
            if (k === 'tam' || k === 'tamEf' || k === 'esp' || k === 'ent') v = parseFloat(v) || 0;
            if (k === 'fam') { if (!(IE.estilos || {})[v]) return; ieTextoEstilo({ fam: v, estilo: 'Regular' }); ieOpcoesRender(); return; }
            ieTextoEstilo({ [k]: v });
            if (k === 'alin') ieOpcoesRender();
            return;
        }
        const o = el.dataset.o, k = el.dataset.k;
        if (!o || !k) return;
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.dataset.v !== undefined) v = el.dataset.v === 'true' ? true : el.dataset.v === 'false' ? false : el.dataset.v;
        else if (el.tagName === 'SELECT') v = el.value;
        else v = parseFloat(el.value);
        if (typeof v === 'number' && !isFinite(v)) return;
        IE.op[o][k] = v;
        if (el.dataset.v !== undefined) ieOpcoesRender();
        ieDesenharSobre();
    };
    box.addEventListener('change', ev => ler(ev.target));
    box.addEventListener('input', ev => { if (ev.target.type === 'number' && !ev.target.dataset.tx) ler(ev.target); });
    box.addEventListener('click', ev => {
        const b = ev.target.closest('button[data-v], button[data-tx]');
        if (!b) return;
        if (b.dataset.tx === 'cor') {
            const L = IE.edTexto ? IE.edTexto.L : ieAtiva(IE.doc);
            ieSeletorCor(b, (L && L.txt && L.txt.cor) || IE.cor[0], c => { b.style.background = c; ieTextoEstilo({ cor: c }); });
            return;
        }
        ler(b);
    });
    box.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.target.blur(); } ev.stopPropagation(); });
}

// ─────────────────────────── painel de camadas ───────────────────────────
const IE_TRAVA = { transp: 1, pixels: 2, pos: 4, tudo: 0x80000000 };

function ieCamadaAbrirPais(doc, id) {
    if (!doc || id == null) return;
    const busca = (lista, pais) => {
        for (const L of lista) {
            if (L.id === id) {
                pais.forEach(P => { if (P.filhos) P.aberto = true; });
                return true;
            }
            if (L.filhos && busca(L.filhos, [...pais, L])) return true;
        }
        return false;
    };
    busca(doc.camadas, []);
}

function ieCamadaRolarAte(lista, id) {
    if (!lista || id == null) return;
    requestAnimationFrame(() => {
        lista.querySelector(`.ie-cam[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
}

function ieUiCamadas() {
    const doc = IE.doc, lista = ieEl('ie-cam-lista'), topo = ieEl('ie-cam-topo'), rod = ieEl('ie-cam-rodape');
    if (!lista) return;
    if (!doc) { lista.innerHTML = ''; topo.innerHTML = ''; rod.innerHTML = ''; ieUiProps(); return; }
    const revelar = doc._revelarCamada;
    if (revelar != null) ieCamadaAbrirPais(doc, revelar);
    const L = ieAtiva(doc);
    // topo: mesclagem, opacidade, travas, preenchimento
    const bm = L ? L.bm : 'NORMAL';
    const opts = (L && L.tipo === 'grupo' ? [['PASS_THROUGH', 'Passagem']] : []).concat(IE_BM.map(b => b || null));
    // filtro (como o do Photoshop): por tipo (pixels, ajuste, texto, forma, objeto inteligente) ou pelo nome
    const F = IE.filtroCam || (IE.filtroCam = { modo: 'tipo', tipos: [], nome: '', on: true });
    const FT = [['pixel', 'Filtro de camadas de pixels', 'image'], ['ajuste', 'Filtro de camadas de ajuste', 'adj'], ['texto', 'Filtro de camadas de texto', 'type'], ['forma', 'Filtro de camadas de forma', 'shape'], ['inteligente', 'Filtro de objetos inteligentes', 'smart']];
    const filtroHtml = `<div class="ie-cam-filtro ${F.on ? '' : 'off'}">
        <select data-fmodo title="${ieT('Filtrar camadas por')}"><option value="tipo" ${F.modo === 'tipo' ? 'selected' : ''}>${ieT('Tipo')}</option><option value="nome" ${F.modo === 'nome' ? 'selected' : ''}>${ieT('Nome')}</option></select>
        ${F.modo === 'nome' ? `<input type="search" data-fnome value="${ieEsc(F.nome)}" placeholder="${ieT('Nome da camada')}">`
            : FT.map(([k, t, ic]) => `<button class="ie-cam-fbt ${F.tipos.includes(k) ? 'on' : ''}" data-ftipo="${k}" title="${ieT(t)}">${k === 'texto' ? '<b>T</b>' : ieIco(ic === 'image' ? 'brush' : ic)}</button>`).join('')}
        <button class="ie-cam-fon ${F.on ? 'on' : ''}" data-fon title="${ieT('Ligar/desligar o filtro')}"></button></div>`;
    topo.innerHTML = filtroHtml + `
        <select id="ie-cam-bm" ${L ? '' : 'disabled'} title="${ieT('Modo de mesclagem')}">${opts.map(b => b ? `<option value="${b[0]}" ${b[0] === bm ? 'selected' : ''}>${ieT(b[1])}${b[3] ? ' ≈' : ''}</option>` : '<option disabled>──────</option>').join('')}</select>
        <label class="ie-cam-num">${ieT('Opacidade')} <input type="number" id="ie-cam-op" min="0" max="100" value="${L ? Math.round(L.op * 100) : 100}" ${L ? '' : 'disabled'}>%</label>
        <div class="ie-cam-travas"><span>${ieT('Travar')}</span>
            ${[['transp', 'pixels transparentes', 'travaTransp'], ['pixels', 'pixels da imagem', 'travaPx'], ['pos', 'posição', 'travaPos'], ['tudo', 'tudo', 'lock']].map(([k, r, ic]) =>
                `<button class="ie-trava ${L && L.travas & IE_TRAVA[k] ? 'on' : ''}" data-trava="${k}" title="${ieT('Travar')} ${ieT(r)}">${ieIco(ic)}</button>`).join('')}
        </div>
        <label class="ie-cam-num">${ieT('Preench.')} <input type="number" id="ie-cam-fill" min="0" max="100" value="${L && L.tipo !== 'grupo' ? Math.round(L.fill * 100) : 100}" ${L && L.tipo !== 'grupo' ? '' : 'disabled'}>%</label>`;
    // lista: de cima para baixo
    const linhas = [];
    const filtra = F.on && (F.modo === 'tipo' ? F.tipos.length > 0 : !!F.nome.trim());
    const passa = X => F.modo === 'tipo' ? F.tipos.includes(X.tipo === 'preenchimento' ? 'forma' : X.tipo) : X.nome.toLowerCase().includes(F.nome.trim().toLowerCase());
    const visitar = (camadas, nivel) => {
        for (let i = camadas.length - 1; i >= 0; i--) {
            const X = camadas[i];
            if (!filtra || passa(X)) linhas.push({ X, nivel: filtra ? 0 : nivel });
            if (X.filhos && (X.aberto || filtra)) visitar(X.filhos, nivel + 1);
        }
    };
    visitar(doc.camadas, 0);
    const sel = new Set(doc.selIds.length ? doc.selIds : [doc.ativa]);
    lista.innerHTML = linhas.map(({ X, nivel }) => {
        const tipoIco = X.tipo === 'texto' ? '<b class="ie-cam-t">T</b>' : X.tipo === 'inteligente' ? '' :
            X.tipo === 'ajuste' ? ieIco('adj', 'ie-cam-tipo') : X.tipo === 'forma' || X.tipo === 'preenchimento' ? ieIco('shape', 'ie-cam-tipo') : '';
        const miniatura = X.tipo === 'grupo'
            ? `<button class="ie-cam-seta ${X.aberto ? 'aberta' : ''}" data-abrir="${X.id}">${ieIco('chev')}</button>${ieIco('folder', 'ie-cam-pasta')}`
            : X.tipo === 'ajuste' ? `<span class="ie-cam-mini ie-cam-mini-aj ${doc.mascaraAlvo && X.id === doc.ativa ? '' : 'alvo'}" data-alvo="px">${ieIco('adj')}</span>`
            : `<span class="ie-cam-mini-box"><canvas class="ie-cam-mini ${!(doc.mascaraAlvo && X.id === doc.ativa) ? 'alvo' : ''}" data-alvo="px" data-mini="${X.id}" width="40" height="40"></canvas>${X.tipo === 'inteligente' ? `<i class="ie-cam-selo" title="${ieT('Objeto inteligente')}">${ieIco('smart')}</i>` : ''}</span>`;
        const masc = X.m ? `<canvas class="ie-cam-mini ie-cam-masc ${X.m.desativada ? 'off' : ''} ${doc.mascaraAlvo && X.id === doc.ativa ? 'alvo' : ''}" data-alvo="m" data-mmini="${X.id}" width="40" height="40" title="${ieT('Máscara (Shift+clique: desativar)')}"></canvas>` : '';
        return `<div class="ie-cam ${sel.has(X.id) ? 'sel' : ''} ${X.id === doc.ativa ? 'ativa' : ''} ${X.visivel ? '' : 'oculta'} ${X.clip ? 'clip' : ''}" data-id="${X.id}" draggable="true" style="--nivel:${nivel}">
            <button class="ie-cam-olho ${X.visivel ? 'on' : ''}" data-olho="${X.id}" title="${ieT('Mostrar/ocultar (Alt+clique: só esta)')}">${X.visivel ? ieIco('eye') : ''}</button>
            <span class="ie-cam-recuo"></span>${X.clip ? `<span class="ie-cam-clip">${ieIco('clip')}</span>` : ''}
            ${miniatura}${masc}
            <span class="ie-cam-nome" data-nome="${X.id}">${ieEsc(X.nome)}</span>
            ${tipoIco}${X.tipo === 'inteligente' && (X.filtrosInt || []).length ? `<button class="ie-cam-fx ${X.filtrosAberto ? 'aberto' : ''}" data-fiabrir="${X.id}" title="${ieT('Filtros inteligentes (clique: mostrar a lista)')}">${ieIco('smart')} ${ieIco('chev')}</button>` : ''}${ieFxLista(X.fx).length ? `<button class="ie-cam-fx ${X.fxAberto ? 'aberto' : ''}" data-fxabrir="${X.id}" title="${ieT('Efeitos de camada (clique: mostrar a lista)')}">fx ${ieIco('chev')}</button>` : ''}${X.travas ? ieIco('lock', 'ie-cam-cad') : ''}
        </div>` + (X.fxAberto && ieFxLista(X.fx).length ? `<div class="ie-cam-fxl" style="--nivel:${nivel}" data-id="${X.id}">
            <div class="ie-cam-fxi" data-fxi="todos"><button class="ie-cam-olho ${X.fxOculto ? '' : 'on'}" data-fxolho="todos">${X.fxOculto ? '' : ieIco('eye')}</button><span>${ieLsT('Efeitos')}</span></div>
            ${ieFxLista(X.fx).map(({ tipo, i, e }) => `<div class="ie-cam-fxi" data-fxi="${tipo}:${i}"><button class="ie-cam-olho ${e.on ? 'on' : ''}" data-fxolho="${tipo}:${i}">${e.on ? ieIco('eye') : ''}</button><span>${ieLsT(IE_FX_NOME[tipo])}</span></div>`).join('')}
        </div>` : '') + (X.tipo === 'inteligente' && X.filtrosAberto && (X.filtrosInt || []).length ? `<div class="ie-cam-fxl ie-cam-fil" style="--nivel:${nivel}" data-id="${X.id}">
            <div class="ie-cam-fxi" data-fii="todos"><button class="ie-cam-olho ${X.filtrosOff ? '' : 'on'}" data-fiolho="todos">${X.filtrosOff ? '' : ieIco('eye')}</button><span>${ieT('Filtros inteligentes')}</span></div>
            ${X.filtrosInt.map((f, i) => `<div class="ie-cam-fxi" data-fii="${i}" title="${ieT('Duplo clique: editar')}"><button class="ie-cam-olho ${f.on ? 'on' : ''}" data-fiolho="${i}">${f.on ? ieIco('eye') : ''}</button><span>${ieEsc(ieT(f.titulo || f.cmd))}</span><button class="ie-cam-fidel" data-fidel="${i}" title="${ieT('Excluir filtro inteligente')}">×</button></div>`).join('')}
        </div>` : '');
    }).join('') || `<div class="ie-vazio">${ieT('Sem camadas')}</div>`;
    rod.innerHTML = `
        <button class="ie-ico-btn" data-fxmenu title="${ieT('Adicionar um estilo de camada')}">${ieIco('fx')}</button>
        <button class="ie-ico-btn" onclick="ieCmd('mascara')" title="${ieT('Adicionar máscara de camada')}">${ieIco('mask')}</button>
        <button class="ie-ico-btn" data-ajmenu title="${ieT('Criar nova camada de ajuste')}">${ieIco('adj')}</button>
        <button class="ie-ico-btn" onclick="ieCmd('corte')" title="${ieT('Criar/soltar máscara de corte (Alt+Ctrl+G)')}">${ieIco('clip')}</button>
        <button class="ie-ico-btn" onclick="ieCmd('grupoNovo')" title="${ieT('Novo grupo')}">${ieIco('folder')}</button>
        <button class="ie-ico-btn" onclick="ieCmd('novaCamada')" title="${ieT('Nova camada (Shift+Ctrl+N)')}">${ieIco('plus')}</button>
        <button class="ie-ico-btn" onclick="ieCmd('excluirCamada')" title="${ieT('Excluir camada')}">${ieIco('trash')}</button>`;
    topo.querySelector('[data-fmodo]').onchange = e => { F.modo = e.target.value; ieUiCamadas(); };
    topo.querySelectorAll('[data-ftipo]').forEach(b => b.onclick = () => { const k = b.dataset.ftipo; F.tipos = F.tipos.includes(k) ? F.tipos.filter(x => x !== k) : [...F.tipos, k]; F.on = true; ieUiCamadas(); });
    topo.querySelector('[data-fon]').onclick = () => { F.on = !F.on; ieUiCamadas(); };
    const fn = topo.querySelector('[data-fnome]');
    if (fn) { fn.addEventListener('input', () => { F.nome = fn.value; clearTimeout(IE._fnT); IE._fnT = setTimeout(() => { ieUiCamadas(); const n = ieEl('ie-cam-topo').querySelector('[data-fnome]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); }); fn.addEventListener('keydown', e => e.stopPropagation()); }
    if (filtra && !linhas.length) lista.innerHTML = `<div class="ie-vazio">${ieT('Nenhuma camada passa no filtro')}</div>`;
    if (revelar != null) {
        ieCamadaRolarAte(lista, revelar);
        doc._revelarCamada = null;
    }
    ieMiniaturas(true);
    ieUiProps();
}

// xadrez miúdo e cinza médio: conteúdo branco e preto aparecem na miniatura
let ieXadrezMini = null;
function ieXadrezMiniPadrao(ctx, q) {
    if (!ieXadrezMini || ieXadrezMini.width !== q * 2) {
        const c = ieCanvas(q * 2, q * 2), x = ieCtx(c);
        x.fillStyle = '#a3a3a3'; x.fillRect(0, 0, q * 2, q * 2);
        x.fillStyle = '#7d7d7d'; x.fillRect(0, 0, q, q); x.fillRect(q, q, q, q);
        ieXadrezMini = c;
    }
    return ctx.createPattern(ieXadrezMini, 'repeat');
}

function ieMiniatura(cv, L, mascara) {
    const dpr = window.devicePixelRatio || 1, css = cv.clientWidth || 40;
    const tam = Math.round(css * dpr);
    if (cv.width !== tam) { cv.width = tam; cv.height = tam; }
    const x = ieCtx(cv), W = cv.width, H = cv.height, doc = IE.doc;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, W, H);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    if (!mascara) {
        // como o "Limites da camada" do Photoshop: o conteúdo da camada (com efeitos) ocupa a miniatura
        const r = ieRasterTudo(L) || (L.c ? { c: L.c, x: L.x, y: L.y } : null);
        x.fillStyle = ieXadrezMiniPadrao(x, Math.max(3, Math.round(4 * dpr)));
        x.fillRect(0, 0, W, H);
        if (!r || !r.c) return;
        const b = ieLimites(r.c, r.x, r.y) || { x: r.x, y: r.y, w: r.c.width, h: r.c.height };
        const pad = 2 * dpr, k = Math.min((W - 2 * pad) / b.w, (H - 2 * pad) / b.h);
        const dw = b.w * k, dh = b.h * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
        // redução em passos (miniatura nítida mesmo de camada grande)
        let src = r.c, sx = b.x - r.x, sy = b.y - r.y, sw = b.w, sh = b.h;
        while (dw < sw / 2 && sw > 2 && sh > 2) {
            const n = ieCanvas(Math.ceil(sw / 2), Math.ceil(sh / 2)), nx = ieCtx(n);
            nx.imageSmoothingQuality = 'high';
            nx.drawImage(src, sx, sy, sw, sh, 0, 0, n.width, n.height);
            src = n; sx = 0; sy = 0; sw = n.width; sh = n.height;
        }
        x.drawImage(src, sx, sy, sw, sh, ox, oy, dw, dh);
        return;
    }
    // máscara: o documento inteiro (preto = oculta)
    const k = Math.min(W / doc.w, H / doc.h), dw = doc.w * k, dh = doc.h * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
    x.fillStyle = '#000'; x.fillRect(ox, oy, dw, dh);
    const c = ieMascaraRegiao(L.m, ieRDoc(doc));
    x.drawImage(c, ox, oy, dw, dh);
}
let ieMiniTimer = 0;
function ieMiniaturas(ja) {
    clearTimeout(ieMiniTimer);
    const fazer = () => {
        const doc = IE.doc;
        if (!doc) return;
        document.querySelectorAll('#ie-cam-lista canvas[data-mini]').forEach(cv => {
            const L = ieAchar(doc, +cv.dataset.mini)?.L;
            if (L && (cv._v !== L._v || cv._c !== L.c)) { cv._v = L._v; cv._c = L.c; ieMiniatura(cv, L, false); }
        });
        document.querySelectorAll('#ie-cam-lista canvas[data-mmini]').forEach(cv => {
            const L = ieAchar(doc, +cv.dataset.mmini)?.L;
            if (L && L.m && (cv._v !== L._v || cv._c !== L.m.c)) { cv._v = L._v; cv._c = L.m.c; ieMiniatura(cv, L, true); }
        });
    };
    if (ja) fazer(); else ieMiniTimer = setTimeout(fazer, 250);
}

function ieCamadasInstalar() {
    const lista = ieEl('ie-cam-lista'), topo = ieEl('ie-cam-topo');
    if (!lista || lista._ok) return;
    lista._ok = true;
    // Alt + divisa entre duas camadas (como no Photoshop): o cursor vira o ícone de corte e o clique prende a de cima
    // na de baixo (máscara de corte); na divisa de uma já presa, solta
    const divisa = ev => {
        const doc = IE.doc, row = ev.target.closest && ev.target.closest('.ie-cam');
        if (!doc || !ev.altKey || !row || ev.target.closest('[data-olho]')) return null;
        const r = row.getBoundingClientRect(), y = ev.clientY - r.top, lin = [...lista.querySelectorAll('.ie-cam')], i = lin.indexOf(row);
        const par = y < 6 ? [lin[i - 1], row] : y > r.height - 6 ? [row, lin[i + 1]] : null;
        if (!par || !par[0] || !par[1]) return null;
        const a = ieAchar(doc, +par[0].dataset.id), b = ieAchar(doc, +par[1].dataset.id);
        if (!a || !b || a.lista !== b.lista || a.i !== b.i + 1) return null;   // irmãs vizinhas na pilha
        return { cima: a.L, baixo: b.L };
    };
    const cursorCorte = ev => lista.classList.toggle('ie-cam-corte', !!divisa(ev));
    lista.addEventListener('mousemove', cursorCorte);
    lista.addEventListener('mouseleave', () => lista.classList.remove('ie-cam-corte'));
    window.addEventListener('keyup', ev => { if (ev.key === 'Alt') lista.classList.remove('ie-cam-corte'); });
    // a lista é redesenhada entre o mousedown e o click (o click chega solto, fora dela): o corte age já no mousedown
    // (captura) e o Alt+clique de enquadrar a camada, no documento, é ignorado para esse clique
    lista.addEventListener('mousedown', ev => {
        const dv = ev.button === 0 && divisa(ev);
        if (!dv) return;
        ev.stopPropagation(); ev.preventDefault();
        IE._corteClique = Date.now();
        dv.cima.clip = !dv.cima.clip;
        ieTudo(IE.doc); ieHist(ieT(dv.cima.clip ? 'Criar máscara de corte' : 'Soltar máscara de corte')); ieUiCamadas();
    }, true);
    lista.addEventListener('click', ev => {
        const doc = IE.doc;
        if (!doc) return;
        const olho = ev.target.closest('[data-olho]');
        if (olho) {
            const L = ieAchar(doc, +olho.dataset.olho)?.L;
            if (!L) return;
            if (ev.altKey) {   // só esta
                const outras = ieTodas(doc).filter(X => X !== L && !ieAncestral(doc, X, L) && !ieAncestral(doc, L, X));
                const algum = outras.some(X => X.visivel);
                outras.forEach(X => (X.visivel = !algum));
                L.visivel = true;
            } else L.visivel = !L.visivel;
            ieTudo(doc);
            ieHist(ieT(L.visivel ? 'Mostrar camada' : 'Ocultar camada'));
            return;
        }
        const fia = ev.target.closest('[data-fiabrir]');
        if (fia) { const L = ieAchar(doc, +fia.dataset.fiabrir)?.L; if (L) { L.filtrosAberto = !L.filtrosAberto; ieUiCamadas(); } return; }
        const fio = ev.target.closest('[data-fiolho], [data-fidel]');
        if (fio) {
            const L = ieAchar(doc, +fio.closest('.ie-cam-fil').dataset.id)?.L;
            if (!L) return;
            const R = ieRCamada(L);
            if (fio.dataset.fidel != null) L.filtrosInt = L.filtrosInt.filter((f, i) => i !== +fio.dataset.fidel);
            else if (fio.dataset.fiolho === 'todos') L.filtrosOff = !L.filtrosOff;
            else L.filtrosInt = L.filtrosInt.map((f, i) => (i === +fio.dataset.fiolho ? { ...f, on: !f.on } : f));
            ieIntAtualizar(L, R);
            ieHist(ieT(fio.dataset.fidel != null ? 'Excluir filtro inteligente' : 'Mostrar/ocultar filtro inteligente'));
            ieUiCamadas();
            return;
        }
        const fxa = ev.target.closest('[data-fxabrir]');
        if (fxa) { const L = ieAchar(doc, +fxa.dataset.fxabrir)?.L; if (L) { L.fxAberto = !L.fxAberto; ieUiCamadas(); } return; }
        const fxo = ev.target.closest('[data-fxolho]');
        if (fxo) {
            const L = ieAchar(doc, +fxo.closest('.ie-cam-fxl').dataset.id)?.L;
            if (!L) return;
            const R = ieRCamada(L);
            if (fxo.dataset.fxolho === 'todos') L.fxOculto = !L.fxOculto;
            else { const [t, i] = fxo.dataset.fxolho.split(':'); const e = L.fx[t][+i]; e.on = !e.on; }
            L.fxMudou = true;
            ieCamadaMudou(L, R);
            ieHist(ieT('Mostrar/ocultar efeito'));
            ieUiCamadas();
            return;
        }
        if (ev.target.closest('.ie-cam-fxl')) { ieAtivar(+ev.target.closest('.ie-cam-fxl').dataset.id, doc); ieUiCamadas(); return; }
        const abrir = ev.target.closest('[data-abrir]');
        if (abrir) { const L = ieAchar(doc, +abrir.dataset.abrir)?.L; if (L) { L.aberto = !L.aberto; ieUiCamadas(); } return; }
        const linha = ev.target.closest('.ie-cam');
        if (!linha) return;
        const id = +linha.dataset.id;
        const L = ieAchar(doc, id)?.L;
        const alvo = ev.target.closest('[data-alvo]');
        if (alvo && ev.ctrlKey && L) { ieSelDaCamada(L, alvo.dataset.alvo === 'm'); return; }
        if (alvo && alvo.dataset.alvo === 'm' && ev.shiftKey && L && L.m) {
            L.m.desativada = !L.m.desativada; ieCamadaMudou(L); ieHist(ieT(L.m.desativada ? 'Desativar máscara' : 'Ativar máscara')); ieUiCamadas(); return;
        }
        ieAtivar(id, doc, { somar: ev.ctrlKey, faixa: ev.shiftKey });
        if (alvo) doc.mascaraAlvo = alvo.dataset.alvo === 'm' && !!(L && L.m);
        else if (!(L && L.m)) doc.mascaraAlvo = false;
        ieUiCamadas();
        ieOpcoesRender();
    });
    lista.addEventListener('dblclick', ev => {
        const doc = IE.doc;
        const nome = ev.target.closest('[data-nome]');
        if (nome && doc) { ieRenomear(+nome.dataset.nome, nome); return; }
        const fii = ev.target.closest('[data-fii]');
        if (fii && doc && fii.dataset.fii !== 'todos') {
            const L = ieAchar(doc, +fii.closest('.ie-cam-fil').dataset.id)?.L, i = +fii.dataset.fii, f = L && L.filtrosInt[i];
            const def = f && ieIntDef(f.cmd);
            if (def) { ieAtivar(L.id, doc); ieIntFiltro(L, def, f.cmd, i); }
            return;
        }
        const fxi = ev.target.closest('[data-fxi]');
        if (fxi && doc) {
            const L = ieAchar(doc, +fxi.closest('.ie-cam-fxl').dataset.id)?.L;
            const v = fxi.dataset.fxi;
            if (L) ieEstiloCamada(L, v === 'todos' ? 'mescla' : { tipo: v.split(':')[0], i: +v.split(':')[1] });
            return;
        }
        const linha = ev.target.closest('.ie-cam');
        const L = linha && ieAchar(doc, +linha.dataset.id)?.L;
        if (L && (L.txt || L.texto) && ev.target.closest('[data-alvo]')) { ieEscolherFerr('texto'); ieTextoEditar(L); return; }
        // duplo clique no resto da linha (ou no fx): Estilo de camada, como no Photoshop
        if (L && !ev.target.closest('[data-alvo], [data-olho], [data-abrir]')) ieEstiloCamada(L);
    });
    lista.addEventListener('contextmenu', ev => {
        const linha = ev.target.closest('.ie-cam');
        if (!linha) return;
        ev.preventDefault();
        const doc = IE.doc;
        if (!doc.selIds.includes(+linha.dataset.id)) ieAtivar(+linha.dataset.id, doc);
        ieMenuContexto(ev, true);
    });
    // arrastar para reordenar (acima/abaixo de outra camada ou para dentro de um grupo)
    let arrast = null;
    lista.addEventListener('dragstart', ev => {
        const linha = ev.target.closest('.ie-cam');
        if (!linha) return;
        const doc = IE.doc, id = +linha.dataset.id;
        if (!doc.selIds.includes(id)) ieAtivar(id, doc);
        arrast = [...doc.selIds];
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/x-ie-camada', String(id));
    });
    lista.addEventListener('dragover', ev => {
        if (!arrast) return;
        ev.preventDefault();
        lista.querySelectorAll('.ie-cam').forEach(l => l.classList.remove('drop-acima', 'drop-abaixo', 'drop-dentro'));
        const linha = ev.target.closest('.ie-cam');
        if (!linha) return;
        const r = linha.getBoundingClientRect(), y = (ev.clientY - r.top) / r.height;
        const L = ieAchar(IE.doc, +linha.dataset.id)?.L;
        linha.classList.add(L && L.tipo === 'grupo' && y > 0.3 && y < 0.7 ? 'drop-dentro' : y < 0.5 ? 'drop-acima' : 'drop-abaixo');
    });
    lista.addEventListener('dragleave', ev => { if (!lista.contains(ev.relatedTarget)) lista.querySelectorAll('.ie-cam').forEach(l => l.classList.remove('drop-acima', 'drop-abaixo', 'drop-dentro')); });
    lista.addEventListener('drop', ev => {
        if (!arrast) return;
        ev.preventDefault();
        ev.stopPropagation();
        const linha = ev.target.closest('.ie-cam');
        const modo = linha ? (linha.classList.contains('drop-dentro') ? 'dentro' : linha.classList.contains('drop-acima') ? 'acima' : 'abaixo') : 'fundo';
        lista.querySelectorAll('.ie-cam').forEach(l => l.classList.remove('drop-acima', 'drop-abaixo', 'drop-dentro'));
        ieReordenar(arrast, linha ? +linha.dataset.id : null, modo);
        arrast = null;
    });
    lista.addEventListener('dragend', () => { arrast = null; });

    topo.addEventListener('change', ev => {
        const doc = IE.doc, sel = ieSelecionadas(doc);
        if (!sel.length) return;
        const el = ev.target;
        if (el.id === 'ie-cam-bm') { sel.forEach(L => { L.bm = el.value === 'PASS_THROUGH' && L.tipo !== 'grupo' ? 'NORMAL' : el.value; ieInvalidar(L); }); ieTudo(doc); ieHist(ieT('Modo de mesclagem')); }
        if (el.id === 'ie-cam-op') { const v = ieClamp(+el.value || 0, 0, 100) / 100; sel.forEach(L => (L.op = v)); ieTudo(doc); ieHist(ieT('Opacidade')); }
        if (el.id === 'ie-cam-fill') { const v = ieClamp(+el.value || 0, 0, 100) / 100; sel.forEach(L => { if (L.tipo !== 'grupo') { L.fill = v; ieInvalidar(L); } }); ieTudo(doc); ieHist(ieT('Preenchimento')); }
    });
    topo.addEventListener('input', ev => {   // prévia ao rolar o número
        const doc = IE.doc, sel = ieSelecionadas(doc), el = ev.target;
        if (el.id === 'ie-cam-op') { sel.forEach(L => (L.op = ieClamp(+el.value || 0, 0, 100) / 100)); ieAgendar(null, doc); }
    });
    topo.addEventListener('click', ev => {
        const b = ev.target.closest('[data-trava]');
        if (!b) return;
        const doc = IE.doc, sel = ieSelecionadas(doc);
        const bit = IE_TRAVA[b.dataset.trava];
        const ligar = !(sel[0] && sel[0].travas & bit);
        sel.forEach(L => { L.travas = ligar ? (L.travas | bit) : (L.travas & ~bit); });
        ieHist(ieT('Travar camada'));
        ieUiCamadas();
    });
    topo.addEventListener('keydown', ev => ev.stopPropagation());
}

function ieAncestral(doc, g, L) {   // g é grupo acima de L?
    if (!g.filhos) return false;
    let achou = false;
    iePercorrer(g.filhos, X => { if (X === L) { achou = true; return false; } });
    return achou;
}

function ieRenomear(id, el) {
    const doc = IE.doc, L = ieAchar(doc, id)?.L;
    if (!L) return;
    const inp = document.createElement('input');
    inp.className = 'ie-cam-renomear';
    inp.value = L.nome;
    el.replaceWith(inp);
    inp.focus(); inp.select();
    const fim = ok => {
        if (inp._fim) return;
        inp._fim = true;
        if (ok && inp.value.trim() && inp.value !== L.nome) { L.nome = inp.value.trim(); L._nomeAuto = false; ieHist(ieT('Renomear camada')); }
        ieUiCamadas();
    };
    inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') fim(true); if (ev.key === 'Escape') fim(false); });
    inp.addEventListener('blur', () => fim(true));
}

function ieReordenar(ids, alvoId, modo) {
    const doc = IE.doc;
    if (!doc) return;
    const movidas = ids.map(id => ieAchar(doc, id)?.L).filter(Boolean);
    if (alvoId != null && movidas.some(L => L.id === alvoId || ieAncestral(doc, L, ieAchar(doc, alvoId)?.L))) return;
    // tira da árvore (de trás para frente para não mexer nos índices)
    const ordem = ieTodas(doc).filter(L => movidas.includes(L));
    ordem.forEach(L => { const a = ieAchar(doc, L.id); a.lista.splice(a.i, 1); });
    if (alvoId == null) doc.camadas.unshift(...ordem);
    else {
        const a = ieAchar(doc, alvoId);
        if (!a) { doc.camadas.push(...ordem); }
        else if (modo === 'dentro') { a.L.filhos.push(...ordem); a.L.aberto = true; }
        else a.lista.splice(modo === 'acima' ? a.i + 1 : a.i, 0, ...ordem);
    }
    ieTudo(doc);
    ieHist(ieT('Mover camada'));
}

function ieSelDaCamada(L, mascara) {
    const doc = IE.doc;
    const c = ieSelNova(doc), x = ieCtx(c);
    if (mascara && L.m) x.drawImage(ieMascaraRegiao(L.m, ieRDoc(doc)), 0, 0);
    else { const r = L.tipo === 'grupo' ? { c: ieAchatar(doc, [L]), x: 0, y: 0 } : (L.c ? { c: L.c, x: L.x, y: L.y } : null); if (r) x.drawImage(r.c, r.x, r.y); }
    ieSelDefinir(doc, c);
    ieHist(ieT('Carregar seleção'));
}

// ─────────────────────────── propriedades ───────────────────────────
const IE_NOME_TIPO = { pixel: 'Camada de pixels', texto: 'Camada de texto', inteligente: 'Objeto inteligente', forma: 'Camada de forma',
    preenchimento: 'Camada de preenchimento', ajuste: 'Camada de ajuste', grupo: 'Grupo' };
const IE_NOME_AJ = { brightnesscontrast: 'Brilho/Contraste', levels: 'Níveis', curves: 'Curvas', exposure: 'Exposição', vibrance: 'Vibratilidade',
    huesaturation: 'Matiz/Saturação', colorbalance: 'Equilíbrio de cores', blackandwhite: 'Preto e branco', photofilter: 'Filtro de fotos',
    channelmixer: 'Misturador de canais', colorlookup: 'Pesquisa de cores', invert: 'Inverter', posterize: 'Posterizar', threshold: 'Limiar',
    selectivecolor: 'Cor seletiva', gradientmap: 'Mapa de degradê' };

function ieUiProps() {
    const box = ieEl('ie-props');
    if (!box) return;
    const doc = IE.doc;
    if (!doc) { box.innerHTML = `<div class="ie-vazio">${ieT('Nenhum documento')}</div>`; return; }
    const L = ieAtiva(doc);
    if (!L) {
        box.innerHTML = `<div class="ie-prop-tit">${ieT('Documento')}</div>
            <div class="ie-prop-grade"><span>${ieT('Tamanho')}</span><b>${doc.w} × ${doc.h} px</b><span>${ieT('Resolução')}</span><b>${doc.dpi} ppi</b><span>${ieT('Modo')}</span><b>${ieEsc(doc.modo)} ${doc.bits} bits</b></div>
            <div class="ie-prop-acoes"><button class="ie-btn ie-btn-mini" onclick="ieCmd('tamImagem')">${ieT('Tamanho da imagem...')}</button><button class="ie-btn ie-btn-mini" onclick="ieCmd('tamTela')">${ieT('Tamanho da tela...')}</button></div>`;
        return;
    }
    const R = L.tipo === 'ajuste' ? null : ieCaixaCamada(L);
    let h = `<div class="ie-prop-tit">${ieT(IE_NOME_TIPO[L.tipo] || 'Camada')}${doc.mascaraAlvo && L.m ? ' · ' + ieT('Máscara') : ''}</div>`;
    // Transformar (como o "Alinhar e transformar" do editor de vídeo): posição e tamanho dos pixels, sem os efeitos
    if (R) h += `<div class="ie-prop-sub2">${ieT('Transformar')}</div><div class="ie-prop-grade ie-prop-pos">
        <label>X <input type="number" data-pp="x" value="${Math.round(R.x)}"></label><label>Y <input type="number" data-pp="y" value="${Math.round(R.y)}"></label>
        <label>L <input type="number" data-pp="w" min="1" value="${Math.round(R.w)}"></label><label>A <input type="number" data-pp="h" min="1" value="${Math.round(R.h)}"></label></div>
        <div class="ie-prop-acoes">
            <button class="ie-btn ie-btn-mini ${IE.propElo === false ? '' : 'on'}" data-ppelo title="${ieT('Manter a proporção de L e A')}">⛓ ${ieT('Proporção')}</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('fh')" title="${ieT('Inverter horizontal')}">⇋</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('fv')" title="${ieT('Inverter vertical')}">⇵</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('g90a')" title="${ieT('Girar 90° anti-horário')}">⟲</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('g90h')" title="${ieT('Girar 90° horário')}">⟳</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('transformar')" title="Ctrl+T">${ieT('Transformação livre')}</button></div>`;
    if (doc.mascaraAlvo && L.m) {
        h += `<div class="ie-prop-acoes">
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('mascaraInverter')">${ieT('Inverter')}</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('mascaraDesativar')">${ieT(L.m.desativada ? 'Ativar' : 'Desativar')}</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('mascaraAplicar')">${ieT('Aplicar')}</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('mascaraExcluir')">${ieT('Excluir')}</button></div>`;
    }
    if (L.tipo === 'texto') {
        if (!L.txt && L.texto && !L._lendoTxt && !L._txtPsd) {   // texto do PSD: lê o estilo (fonte de verdade) para mostrar aqui
            L._lendoTxt = true;
            ieTextoDoPsd(L).then(t => { L._lendoTxt = false; L._txtPsd = t; if (ieAtiva() === L) ieUiProps(); });
        }
        const t = L.txt || L._txtPsd, tx = L.texto;
        const run = tx && tx.runs ? tx.runs[0] : null;
        h += ieTextoPropsHtml(t, run) + `
            <textarea class="ie-prop-texto" id="ie-prop-texto" rows="3">${ieEsc(t ? t.s : tx ? tx.texto : '')}</textarea>
            <div class="ie-prop-acoes"><button class="ie-btn ie-btn-mini" onclick="ieEscolherFerr('texto'); ieTextoEditar(ieAtiva())">${ieT('Editar na tela')}</button>
            <button class="ie-btn ie-btn-mini" onclick="ieCmd('rasterizar')">${ieT('Rasterizar texto')}</button></div>`;
    }
    if (L.tipo === 'ajuste') {
        const a = L.ajuste;
        h += `<div class="ie-prop-grade"><span>${ieT('Ajuste')}</span><b>${ieT(IE_NOME_AJ[L.kind] || L.kind || '')}</b></div>` +
            (a ? `<div class="ie-prop-nota">${ieT('Mostrado aqui e mantido no arquivo; os valores se editam no Photoshop.')}</div>` :
                `<div class="ie-prop-nota ie-aviso">${ieT('Este ajuste fica no arquivo, mas o editor ainda não mostra o efeito dele.')}</div>`);
    }
    if (L.tipo === 'inteligente' || L.tipo === 'forma' || L.tipo === 'preenchimento') {
        h += `<div class="ie-prop-nota">${ieT('Mover e transformar mantêm a camada editável no Photoshop. Pintar pede para rasterizar.')}</div>
            <div class="ie-prop-acoes"><button class="ie-btn ie-btn-mini" onclick="ieCmd('rasterizar')">${ieT('Rasterizar camada')}</button></div>`;
    }
    if (L.fx && ieFxLista(L.fx).length) {
        const nomes = ieFxLista(L.fx).map(({ tipo, e }) => [tipo, IE_FX_NOME[tipo] + (e.on ? '' : ' (' + ieT('desligado') + ')')]);
        h += `<div class="ie-prop-tit ie-prop-sub">${ieT('Efeitos')}</div>
            <label class="ie-op-chk"><input type="checkbox" id="ie-prop-fx" ${L.fxOculto ? '' : 'checked'}> ${ieT('Mostrar efeitos')}</label>
            <div class="ie-prop-acoes"><button class="ie-btn ie-btn-mini" onclick="ieEstiloCamada()">fx ${ieT('Editar efeitos...')}</button></div>
            <ul class="ie-prop-lista">${nomes.map(([, n]) => `<li>${ieT(n)}</li>`).join('')}${(L.fx.outros || []).map(n => `<li class="ie-aviso">${ieEsc(n)} (${ieT('não exibido')})</li>`).join('')}</ul>`;
    }
    if (L.tipo !== 'grupo' && L.tipo !== 'ajuste' && !(L.fx && ieFxLista(L.fx).length))
        h += `<div class="ie-prop-acoes"><button class="ie-btn ie-btn-mini" onclick="ieEstiloCamada()">fx ${ieT('Adicionar efeito...')}</button></div>`;
    box.innerHTML = h;
    box.querySelector('[data-ppelo]')?.addEventListener('click', () => { IE.propElo = IE.propElo === false; ieUiProps(); });
    ieTextoPropsInstalar(box);
    box.querySelectorAll('input[data-pp]').forEach(inp => inp.addEventListener('change', () => {
        const v = Math.round(+inp.value || 0), R2 = ieCaixaCamada(L);
        if (!R2) return;
        if (inp.dataset.pp === 'w' || inp.dataset.pp === 'h') {
            // tamanho: escala a partir do canto de cima à esquerda (Transformação livre aplicada na hora)
            if (v < 1) { ieUiProps(); return; }
            let sx = inp.dataset.pp === 'w' ? v / R2.w : 1, sy = inp.dataset.pp === 'h' ? v / R2.h : 1;
            if (IE.propElo !== false) { if (inp.dataset.pp === 'w') sy = sx; else sx = sy; }
            ieTransfIniciar([sx, 0, 0, sy, R2.x - sx * R2.x, R2.y - sy * R2.y]);
            setTimeout(ieUiProps, 0);
            return;
        }
        const dx = inp.dataset.pp === 'x' ? v - R2.x : 0, dy = inp.dataset.pp === 'y' ? v - R2.y : 0;
        const Ra = ieRCamada(L);
        ieMoverCamada(L, dx, dy);
        L.movido = true;
        ieAgendar(ieRUniao(Ra, ieRCamada(L)), doc);
        ieHist(ieT('Mover'));
    }));
    box.querySelectorAll('input, textarea').forEach(i => i.addEventListener('keydown', ev => ev.stopPropagation()));
    const fxc = ieEl('ie-prop-fx');
    if (fxc) fxc.addEventListener('change', () => { L.fxOculto = !fxc.checked; L.fxMudou = true; ieCamadaMudou(L, ieRCamada(L)); ieHist(ieT(L.fxOculto ? 'Ocultar efeitos' : 'Mostrar efeitos')); });
    const ta = ieEl('ie-prop-texto');
    if (ta) ta.addEventListener('change', async () => {
        if (!L.txt) { L.txt = await ieTextoDoPsd(L); if (!L.txt) return; }
        const Ra = ieRCamada(L);
        L.txt.s = ta.value;
        if (L.ref != null && L.texto) { L.textoNovo = ta.value; L.textoEstilo = ieEstiloMudado(L.txt); delete L.c0; }
        ieTextoRender(L);
        ieAgendar(ieRUniao(Ra, ieRCamada(L)), doc);
        ieHist(ieT('Editar texto'));
    });
}
function ieUiPropsPos() {
    const doc = IE.doc, L = ieAtiva(doc), R = L && ieCaixaCamada(L);
    if (!R) return;
    document.querySelectorAll('#ie-props input[data-pp]').forEach(i => { if (document.activeElement !== i) i.value = Math.round(R[i.dataset.pp]); });
}

// ─────────────────────────── histórico ───────────────────────────
function ieHistRender() {
    const box = ieEl('ie-hist');
    if (!box) return;
    const doc = IE.doc;
    if (!doc) { box.innerHTML = ''; return; }
    const h = doc.hist;
    box.innerHTML = h.itens.map((it, i) => `<div class="ie-hist-item ${i === h.i ? 'atual' : ''} ${i > h.i ? 'futuro' : ''}" data-i="${i}">${ieEsc(it.nome)}</div>`).join('');
    box.querySelector('.atual')?.scrollIntoView({ block: 'nearest' });
    if (!box._ok) { box._ok = true; box.addEventListener('click', ev => { const it = ev.target.closest('[data-i]'); if (it) ieIrHist(+it.dataset.i); }); }
}

// ─────────────────────────── abas e status ───────────────────────────
function ieAbasRender() {
    const box = ieEl('ie-abas');
    if (!box) return;
    box.innerHTML = IE.docs.map(d => `<div class="ie-aba ${d === IE.doc ? 'on' : ''}" data-doc="${d.id}" title="${ieEsc(d.psdPath || d.path || d.nome)}">
        <span>${ieEsc(d.nome)}${d.psdPath || d.path ? '' : ''} @ ${Math.round(ieZoomTela(d) * 100)}%${d.sujo ? ' •' : ''}</span>
        <button class="ie-aba-x" data-fechar="${d.id}" title="${ieT('Fechar (Ctrl+W)')}">${ieIco('x')}</button></div>`).join('');
    if (!box._ok) {
        box._ok = true;
        box.addEventListener('click', ev => {
            const x = ev.target.closest('[data-fechar]');
            if (x) { ieFecharDoc(IE.docs.find(d => d.id === +x.dataset.fechar)); return; }
            const a = ev.target.closest('[data-doc]');
            if (a) ieMostrarDoc(IE.docs.find(d => d.id === +a.dataset.doc));
        });
        box.addEventListener('auxclick', ev => { const a = ev.target.closest('[data-doc]'); if (a && ev.button === 1) ieFecharDoc(IE.docs.find(d => d.id === +a.dataset.doc)); });
    }
    const salvar = ieEl('ie-btn-salvar'), exp = ieEl('ie-btn-exportar');
    if (salvar) salvar.disabled = !IE.doc;
    if (exp) exp.disabled = !IE.doc;
    const ini = ieEl('ie-inicio');
    if (ini) ini.hidden = !!IE.doc;
    if (!IE.doc) ieRecentesRender?.();
    if (typeof renderTabs === 'function') renderTabs();
}

function ieStatusRender() {
    const box = ieEl('ie-status');
    if (!box) return;
    const doc = IE.doc;
    box.style.visibility = doc ? '' : 'hidden';
    if (!doc) return;
    if (!box._ok) {
        box._ok = true;
        box.innerHTML = `<input class="ie-status-zoom" id="ie-st-zoom"><span id="ie-st-doc"></span><span id="ie-st-pos"></span><span id="ie-st-cor"></span><span class="ie-status-dica" id="ie-st-dica"></span>`;
        const z = ieEl('ie-st-zoom');
        z.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') { const v = parseFloat(z.value); if (v > 0) ieZoomReal(v / 100); z.blur(); } });
    }
    const z = ieEl('ie-st-zoom');
    const zt = ieZoomTela(doc) * 100;
    if (document.activeElement !== z) z.value = (zt >= 10 ? Math.round(zt) : zt.toFixed(2)) + '%';
    ieEl('ie-st-doc').textContent = `${doc.w} × ${doc.h} px · ${doc.dpi} ppi`;
    ieAbasZoom();
}
function ieAbasZoom() { const a = document.querySelector('.ie-aba.on span'); const d = IE.doc; if (a && d) a.textContent = `${d.nome} @ ${Math.round(ieZoomTela(d) * 100)}%${d.sujo ? ' •' : ''}`; }
function ieStatusMouse(p) {
    const doc = IE.doc, pos = ieEl('ie-st-pos'), cor = ieEl('ie-st-cor');
    if (!doc || !pos) return;
    const dentro = p.x >= 0 && p.y >= 0 && p.x < doc.w && p.y < doc.h;
    pos.textContent = dentro ? `X ${Math.floor(p.x)}  Y ${Math.floor(p.y)}` : '';
    if (dentro && cor) {
        const d = ieCtx(doc.comp).getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
        cor.innerHTML = d[3] ? `<i style="background:rgb(${d[0]},${d[1]},${d[2]})"></i>${ieRgbHex(d[0], d[1], d[2])}` : '';
    } else if (cor) cor.innerHTML = '';
}

// ─────────────────────────── seletor de cor ───────────────────────────
function ieEscolherCor(i, el) { ieSeletorCor(el, IE.cor[i], c => { IE.cor[i] = c; ieUiCores(); }); }

function ieSeletorCor(ancora, inicial, aoMudar) {
    const pop = ieEl('ie-pop');
    let [r, g, b] = ieHexRgb(inicial);
    const hsv = (() => {
        const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
        let h = 0;
        if (d) h = mx === r / 255 ? ((g - b) / 255 / d) % 6 : mx === g / 255 ? (b - r) / 255 / d + 2 : (r - g) / 255 / d + 4;
        return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx];
    })();
    let [H, S, V] = hsv;
    pop.innerHTML = `<div class="ie-cp">
        <canvas class="ie-cp-sv" width="200" height="160"></canvas><canvas class="ie-cp-h" width="18" height="160"></canvas>
        <div class="ie-cp-lado"><div class="ie-cp-amostras"><i class="ie-cp-novo"></i><i class="ie-cp-velho" style="background:${inicial}"></i></div>
            <label># <input class="ie-cp-hex" maxlength="7"></label>
            <label>R <input type="number" class="ie-cp-c" data-c="0" min="0" max="255"></label>
            <label>G <input type="number" class="ie-cp-c" data-c="1" min="0" max="255"></label>
            <label>B <input type="number" class="ie-cp-c" data-c="2" min="0" max="255"></label>
            <button class="ie-btn ie-btn-mini ie-btn-primario ie-cp-ok">OK</button></div></div>`;
    const sv = pop.querySelector('.ie-cp-sv'), hc = pop.querySelector('.ie-cp-h');
    const hsvRgb = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5) * 255, f(3) * 255, f(1) * 255]; };
    const desenhar = () => {
        const x = ieCtx(sv);
        const [hr, hg, hb] = hsvRgb(H, 1, 1);
        x.fillStyle = `rgb(${hr},${hg},${hb})`; x.fillRect(0, 0, 200, 160);
        let gr = x.createLinearGradient(0, 0, 200, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 200, 160);
        gr = x.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); x.fillStyle = gr; x.fillRect(0, 0, 200, 160);
        x.strokeStyle = V > 0.5 ? '#000' : '#fff'; x.beginPath(); x.arc(S * 200, (1 - V) * 160, 5, 0, Math.PI * 2); x.stroke();
        const y = ieCtx(hc);
        const gh = y.createLinearGradient(0, 0, 0, 160);
        for (let k = 0; k <= 6; k++) { const [a, b2, c] = hsvRgb(k * 60, 1, 1); gh.addColorStop(k / 6, `rgb(${a},${b2},${c})`); }
        y.fillStyle = gh; y.fillRect(0, 0, 18, 160);
        y.strokeStyle = '#fff'; y.lineWidth = 2; y.strokeRect(1, H / 360 * 160 - 2, 16, 4);
        [r, g, b] = hsvRgb(H, S, V).map(Math.round);
        const hex = ieRgbHex(r, g, b);
        pop.querySelector('.ie-cp-novo').style.background = hex;
        const hx = pop.querySelector('.ie-cp-hex');
        if (document.activeElement !== hx) hx.value = hex.slice(1);
        pop.querySelectorAll('.ie-cp-c').forEach(i => { if (document.activeElement !== i) i.value = [r, g, b][+i.dataset.c]; });
        aoMudar(hex);
    };
    const deRgb = (rr, gg, bb) => {
        const mx = Math.max(rr, gg, bb) / 255, mn = Math.min(rr, gg, bb) / 255, d = mx - mn;
        let h = H;
        if (d) h = (((mx === rr / 255 ? ((gg - bb) / 255 / d) % 6 : mx === gg / 255 ? (bb - rr) / 255 / d + 2 : (rr - gg) / 255 / d + 4) * 60) + 360) % 360;
        H = h; S = mx ? d / mx : 0; V = mx;
        desenhar();
    };
    const arrastar = (el, fn) => el.addEventListener('pointerdown', ev => {
        el.setPointerCapture(ev.pointerId);
        const mv = e => { const rc = el.getBoundingClientRect(); fn(ieClamp((e.clientX - rc.left) / rc.width, 0, 1), ieClamp((e.clientY - rc.top) / rc.height, 0, 1)); desenhar(); };
        mv(ev);
        el.onpointermove = mv;
        el.onpointerup = () => { el.onpointermove = null; };
    });
    arrastar(sv, (u, v) => { S = u; V = 1 - v; });
    arrastar(hc, (u, v) => { H = v * 360; });
    pop.querySelector('.ie-cp-hex').addEventListener('input', ev => { const v = ev.target.value.replace('#', ''); if (/^[0-9a-f]{6}$/i.test(v)) deRgb(...ieHexRgb(v)); });
    pop.querySelectorAll('.ie-cp-c').forEach(i => i.addEventListener('input', () => { const c = [r, g, b]; c[+i.dataset.c] = ieClamp(+i.value || 0, 0, 255); deRgb(...c); }));
    pop.querySelectorAll('input').forEach(i => i.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') fechar(); }));
    const fechar = () => { pop.hidden = true; document.removeEventListener('pointerdown', fora, true); };
    const fora = ev => { if (!pop.contains(ev.target) && ev.target !== ancora) fechar(); };
    pop.querySelector('.ie-cp-ok').onclick = fechar;
    pop.hidden = false;
    const ra = ancora.getBoundingClientRect(), rb = ieEl('ie').getBoundingClientRect();
    pop.style.left = Math.min(rb.width - 340, ra.right - rb.left + 6) + 'px';
    pop.style.top = Math.min(rb.height - 200, Math.max(4, ra.top - rb.top)) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
    desenhar();
}

// ─────────────────────────── diálogos ───────────────────────────
// campos: [{id, rotulo, tipo: 'faixa'(padrão)|'numero'|'check'|'select'|'cor'|'texto'|'area'|'nota'|'curva', min, max, passo, valor, opcoes}]
function ieDialogo({ titulo, campos, previa, ok = 'OK', largura, lado }) {
    return new Promise(resolve => {
        const box = ieEl('ie-modal');
        const vals = Object.fromEntries(campos.filter(c => c.tipo !== 'titulo' && c.tipo !== 'nota').map(c => [c.id, c.valor]));
        // automação (KNV.cmd, imagem-api.js): valores prontos, sem abrir a janela — como uma Ação gravada do Photoshop
        if (IE._auto) { const a = IE._auto; IE._auto = null; resolve({ ...vals, ...a }); return; }
        const campoHtml = c => {
            const t = c.tipo || 'faixa';
            if (t === 'titulo') return `<div class="ie-dlg-tit">${ieT(c.rotulo)}</div>`;
            if (t === 'check') return `<label class="ie-dlg-chk"><input type="checkbox" data-id="${c.id}" ${c.valor ? 'checked' : ''}> ${ieT(c.rotulo)}</label>`;
            if (t === 'select') return `<label class="ie-dlg-lin"><span>${ieT(c.rotulo)}</span><select data-id="${c.id}">${c.opcoes.map(([v, r]) => `<option value="${v}" ${v === c.valor ? 'selected' : ''}>${ieT(r)}</option>`).join('')}</select></label>`;
            if (t === 'cor') return `<label class="ie-dlg-lin"><span>${ieT(c.rotulo)}</span><button class="ie-cor ie-dlg-cor" data-id="${c.id}" style="background:${c.valor}"></button></label>`;
            if (t === 'texto') return `<label class="ie-dlg-lin"><span>${ieT(c.rotulo)}</span><input type="text" data-id="${c.id}" value="${ieEsc(c.valor)}"></label>`;
            if (t === 'area') return `<label class="ie-dlg-area"><span>${ieT(c.rotulo)}</span><textarea data-id="${c.id}" rows="${c.linhas || 4}" placeholder="${ieEsc(ieT(c.dica || ''))}">${ieEsc(c.valor)}</textarea></label>`;
            if (t === 'nota') return `<div class="ie-prop-nota">${ieT(c.rotulo)}</div>`;
            if (t === 'numero') return `<label class="ie-dlg-lin"><span>${ieT(c.rotulo)}</span><input type="number" data-id="${c.id}" min="${c.min ?? ''}" max="${c.max ?? ''}" step="${c.passo || 1}" value="${c.valor}">${c.suf ? `<em>${ieT(c.suf)}</em>` : ''}</label>`;
            if (t === 'curva') return `<div class="ie-dlg-curva"><canvas data-id="${c.id}" width="256" height="256"></canvas><div class="ie-prop-nota">${ieT('Clique para pôr pontos, arraste para mover, duplo clique para tirar')}</div></div>`;
            return `<label class="ie-dlg-faixa"><span>${ieT(c.rotulo)}</span><input type="range" data-id="${c.id}" min="${c.min}" max="${c.max}" step="${c.passo || 1}" value="${c.valor}">
                <input type="number" data-num="${c.id}" min="${c.min}" max="${c.max}" step="${c.passo || 1}" value="${c.valor}"></label>`;
        };
        box.classList.toggle('lado', !!lado);   // painel na lateral (a imagem fica à vista, como no Camera Raw)
        box.innerHTML = `<div class="ie-dlg" style="${largura ? `width:${largura}px` : ''}"><h3>${ieT(titulo)}</h3><div class="ie-dlg-corpo">${campos.map(campoHtml).join('')}</div>
            <div class="ie-dlg-rod">${previa ? `<label class="ie-dlg-chk"><input type="checkbox" class="ie-dlg-previa" checked> ${ieT('Visualizar')}</label>` : ''}<div class="ie-op-esp"></div>
            <button class="ie-btn" data-r="0">${ieT('Cancelar')}</button><button class="ie-btn ie-btn-primario" data-r="1">${ieT(ok)}</button></div></div>`;
        box.hidden = false;
        let tm = 0;
        const atualizar = () => {
            if (!previa || tm === -1) return;   // fechado: prévia atrasada não desfaz o OK
            clearTimeout(tm);
            tm = setTimeout(() => { if (tm === -1) return; if (box.querySelector('.ie-dlg-previa')?.checked) previa({ ...vals }); else previa(null); }, 60);
        };
        box.querySelectorAll('[data-id]').forEach(el => {
            const id = el.dataset.id, c = campos.find(x => x.id === id);
            if (el.tagName === 'CANVAS') { ieCurvaEditor(el, vals[id], pts => { vals[id] = pts; atualizar(); }); return; }
            if (el.classList.contains('ie-dlg-cor')) { el.onclick = () => ieSeletorCor(el, vals[id], cc => { el.style.background = cc; vals[id] = cc; atualizar(); }); return; }
            el.addEventListener('input', () => {
                vals[id] = el.type === 'checkbox' ? el.checked : (c.tipo === 'select' || c.tipo === 'texto' || c.tipo === 'area') ? el.value : parseFloat(el.value);
                const n = box.querySelector(`[data-num="${id}"]`); if (n) n.value = el.value;
                atualizar();
            });
        });
        box.querySelectorAll('[data-num]').forEach(el => el.addEventListener('input', () => {
            const r = box.querySelector(`[data-id="${el.dataset.num}"]`); r.value = el.value; vals[el.dataset.num] = parseFloat(el.value) || 0; atualizar();
        }));
        box.querySelector('.ie-dlg-previa')?.addEventListener('change', atualizar);
        const fim = v => { clearTimeout(tm); tm = -1; box.hidden = true; box.innerHTML = ''; box.classList.remove('lado'); document.removeEventListener('keydown', tecla, true); resolve(v); };
        const tecla = ev => {
            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fim(null); }
            if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); ev.stopPropagation(); fim({ ...vals }); }
        };
        document.addEventListener('keydown', tecla, true);
        box.querySelector('[data-r="0"]').onclick = () => fim(null);
        box.querySelector('[data-r="1"]').onclick = () => fim({ ...vals });
        if (previa) atualizar();
        box.querySelector('input, select')?.focus();
    });
}

function ieCurvaEditor(cv, pts, aoMudar) {
    pts = pts.map(p => [...p]);
    const x = ieCtx(cv);
    const desenhar = () => {
        x.fillStyle = '#111'; x.fillRect(0, 0, 256, 256);
        x.strokeStyle = '#333'; x.beginPath();
        for (let k = 64; k < 256; k += 64) { x.moveTo(k, 0); x.lineTo(k, 256); x.moveTo(0, k); x.lineTo(256, k); }
        x.stroke();
        const lut = ieCurvaLut(pts);
        x.strokeStyle = '#eee'; x.beginPath();
        for (let i = 0; i < 256; i++) (i ? x.lineTo(i, 255 - lut[i]) : x.moveTo(i, 255 - lut[i]));
        x.stroke();
        x.fillStyle = '#D4814A';
        pts.forEach(([a, b]) => { x.fillRect(a - 3, 255 - b - 3, 6, 6); });
    };
    let ativo = -1;
    const pos = ev => { const r = cv.getBoundingClientRect(); return [ieClamp(Math.round((ev.clientX - r.left) / r.width * 255), 0, 255), ieClamp(Math.round(255 - (ev.clientY - r.top) / r.height * 255), 0, 255)]; };
    cv.addEventListener('pointerdown', ev => {
        const [a, b] = pos(ev);
        ativo = pts.findIndex(p => Math.abs(p[0] - a) < 8 && Math.abs(p[1] - b) < 8);
        if (ativo < 0) { pts.push([a, b]); pts.sort((p, q) => p[0] - q[0]); ativo = pts.findIndex(p => p[0] === a && p[1] === b); }
        cv.setPointerCapture(ev.pointerId);
        desenhar(); aoMudar(pts.map(p => [...p]));
    });
    cv.addEventListener('pointermove', ev => {
        if (ativo < 0 || !ev.buttons) return;
        const [a, b] = pos(ev);
        const min = ativo > 0 ? pts[ativo - 1][0] + 1 : 0, max = ativo < pts.length - 1 ? pts[ativo + 1][0] - 1 : 255;
        pts[ativo] = [ieClamp(a, min, max), b];
        desenhar(); aoMudar(pts.map(p => [...p]));
    });
    cv.addEventListener('pointerup', () => { ativo = -1; });
    cv.addEventListener('dblclick', ev => {
        const [a, b] = pos(ev);
        const i = pts.findIndex(p => Math.abs(p[0] - a) < 8 && Math.abs(p[1] - b) < 8);
        if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); desenhar(); aoMudar(pts.map(p => [...p])); }
    });
    desenhar();
}

// botões de girar (barra de opções do Mover e da ferramenta Girar): 90° para cada lado, 180°, espelhar e um ângulo livre
function ieBotoesGirar(comAngulo) {
    const b = (ico, tipo, tit) => `<button class="ie-ico-btn" onclick="ieTransfRapida('${tipo}')" title="${ieT(tit)}">${ieIco(ico)}</button>`;
    return `<i class="ie-op-sep"></i><span class="ie-op-dica">${ieT('Girar')}</span>` + b('rotEsq', 'g90a', 'Girar 90° anti-horário') + b('rotate', 'g90h', 'Girar 90° horário') +
        b('espelharH', 'fh', 'Inverter na horizontal') +
        (comAngulo ? `<label class="ie-op-num">${ieT('Ângulo')} <input type="number" step="1" value="0" style="width:56px" onkeydown="if(event.key==='Enter'){ieGirarAngulo(+this.value);event.stopPropagation()}" onchange="ieGirarAngulo(+this.value)"> °</label>` : '');
}

// ─────────────────────────── menus ───────────────────────────
// [rótulo, comando, atalho] | '-' | [rótulo, [submenu]]
const IE_MENUS = [
    ['Arquivo', [['Novo...', 'novo', 'Ctrl+N'], ['Abrir...', 'abrir', 'Ctrl+O'], ['Colocar imagem...', 'colocar', 'Shift+Ctrl+P'], ['Gerar imagem com IA...', 'gerarImagem', ''], '-',
        ['Salvar', 'salvar', 'Ctrl+S'], ['Salvar como...', 'salvarComo', 'Shift+Ctrl+S'], ['Exportar como...', 'exportar', 'Alt+Shift+Ctrl+W'], ['Exportar fatias...', 'exportarFatias'], '-', ['Animar no Editor Kanivete...', 'ponteLevar'], ['Animar a tira inteira (carrossel)...', 'ponteLevarInteiro'], '-',
        ['Fechar', 'fechar', 'Ctrl+W']]],
    ['Editar', [['Desfazer', 'desfazer', 'Ctrl+Z'], ['Refazer', 'refazer', 'Shift+Ctrl+Z'], '-',
        ['Recortar', 'recortar', 'Ctrl+X'], ['Copiar', 'copiar', 'Ctrl+C'], ['Copiar mesclado', 'copiarMesclado', 'Shift+Ctrl+C'], ['Colar', 'colar', 'Ctrl+V'],
        ['Colar no lugar', 'colarLugar', 'Shift+Ctrl+V'], ['Limpar', 'limpar', 'Delete'], '-',
        ['Preencher...', 'preencher', 'Shift+F5'], ['Traçar...', 'tracar', ''], '-',
        ['Transformação livre', 'transformar', 'Ctrl+T'],
        ['Transformar', [['Girar 180°', 'g180'], ['Girar 90° horário', 'g90h'], ['Girar 90° anti-horário', 'g90a'], '-', ['Inverter horizontal', 'fh'], ['Inverter vertical', 'fv']]]]],
    ['Imagem', [['Ajustes', [['Brilho/Contraste...', 'aj:brilho'], ['Níveis...', 'aj:niveis', 'Ctrl+L'], ['Curvas...', 'aj:curvas', 'Ctrl+M'], ['Exposição...', 'aj:exposicao'], '-',
        ['Vibratilidade...', 'aj:vibratilidade'], ['Matiz/Saturação...', 'aj:matiz', 'Ctrl+U'], ['Equilíbrio de cores...', 'aj:equilibrio', 'Ctrl+B'],
        ['Preto e branco...', 'aj:pb', 'Alt+Shift+Ctrl+B'], ['Filtro de fotos...', 'aj:filtroFoto'], '-',
        ['Inverter', 'aj:inverter', 'Ctrl+I'], ['Posterizar...', 'aj:posterizar'], ['Limiar...', 'aj:limiar'], '-', ['Dessaturar', 'aj:dessaturar', 'Shift+Ctrl+U']]], '-',
        ['Tamanho da imagem...', 'tamImagem', 'Alt+Ctrl+I'], ['Tamanho da tela...', 'tamTela', 'Alt+Ctrl+C'],
        ['Rotação da imagem', [['180°', 'img:g180'], ['90° horário', 'img:g90h'], ['90° anti-horário', 'img:g90a'], '-', ['Inverter tela na horizontal', 'img:fh'], ['Inverter tela na vertical', 'img:fv']]], '-',
        ['Cortar na seleção', 'cortarSel'], ['Aparar transparência', 'aparar']]],
    ['Camada', [['Nova camada', 'novaCamada', 'Shift+Ctrl+N'], ['Duplicar camada', 'duplicar', 'Ctrl+J'], ['Camada via recorte', 'viaRecorte', 'Shift+Ctrl+J'], ['Excluir camada', 'excluirCamada'], '-',
        ['Máscara de camada', [['Revelar tudo', 'mascara'], ['Ocultar tudo', 'mascaraOcultar'], ['Revelar seleção', 'mascaraSel'], ['Ocultar seleção', 'mascaraSelOcultar'], '-',
            ['Inverter máscara', 'mascaraInverter'], ['Desativar/ativar', 'mascaraDesativar'], ['Aplicar', 'mascaraAplicar'], ['Excluir', 'mascaraExcluir']]],
        ['Objetos inteligentes', [['Converter em objeto inteligente', 'objetoInteligente'], ['Editar conteúdo no Vetor', 'editarNoVetor'], ['Rasterizar', 'rasterizar'], '-',
            ['Enviar documento ao Vetor (vínculo vivo)', 'enviarAoVetor']]],
        ['Remover plano de fundo', 'removerFundo'],
        ['Criar máscara de corte', 'corte', 'Alt+Ctrl+G'], '-',
        ['Agrupar camadas', 'agrupar', 'Ctrl+G'], ['Desagrupar camadas', 'desagrupar', 'Shift+Ctrl+G'], ['Novo grupo', 'grupoNovo'], '-',
        ['Organizar', [['Trazer para a frente', 'frente', 'Shift+Ctrl+]'], ['Avançar', 'avancar', 'Ctrl+]'], ['Recuar', 'recuar', 'Ctrl+['], ['Enviar para trás', 'tras', 'Shift+Ctrl+[']]],
        ['Rasterizar camada', 'rasterizar'], '-',
        ['Mesclar para baixo', 'mesclarBaixo', 'Ctrl+E'], ['Mesclar visíveis', 'mesclarVisiveis', 'Shift+Ctrl+E'], ['Achatar imagem', 'achatar']]],
    ['Selecionar', [['Tudo', 'selTudo', 'Ctrl+A'], ['Desmarcar', 'selNada', 'Ctrl+D'], ['Inverter', 'selInverter', 'Shift+Ctrl+I'], '-',
        ['Pixels da camada', 'selCamada'], ['Assunto', 'selAssunto'], ['Modificar', [['Expandir...', 'selExpandir'], ['Contrair...', 'selContrair'], ['Suavizar...', 'selSuavizar', 'Shift+F6']]]]],
    ['Filtro', [['Filtro Camera Raw...', 'f:cameraRaw', 'Shift+Ctrl+A'], '-', ['Desfoque gaussiano...', 'f:gaussiano'], ['Desfoque de movimento...', 'f:movimento'], ['Máscara de nitidez...', 'f:nitidez'], ['Adicionar ruído...', 'f:ruido'], ['Mosaico...', 'f:mosaico'], '-',
        ['Distorcer', [['Ondulação...', 'f:ondulacao'], ['Respingos...', 'f:respingos'], ['Torcer...', 'f:torcer']]]]],
    ['Exibir', [['Aproximar', 'zoomMais', 'Ctrl++'], ['Afastar', 'zoomMenos', 'Ctrl+-'], ['Ajustar à tela', 'zoomAjustar', 'Ctrl+0'], ['100%', 'zoom100', 'Ctrl+1'], '-',
        ['Fatias', 'verFatias'], ['Comparar com a imagem salva no PSD', 'verAchatado'], ['Avisos da abertura', 'avisos']]],
];

function ieMenusRender() {
    const nav = ieEl('ie-mbar');
    if (!nav || nav._ok) return;
    nav._ok = true;
    nav.innerHTML = IE_MENUS.map(([r], i) => `<button class="ie-mbar-btn" data-m="${i}">${ieT(r)}</button>`).join('');
    let aberto = null;
    const abrir = i => {
        const pop = ieEl('ie-pop');
        if (aberto === i) { fechar(); return; }
        aberto = i;
        nav.querySelectorAll('.ie-mbar-btn').forEach(b => b.classList.toggle('on', +b.dataset.m === i));
        const btn = nav.querySelector(`[data-m="${i}"]`), rb = ieEl('ie').getBoundingClientRect(), ra = btn.getBoundingClientRect();
        const def = IE_MENUS[i];
        pop.innerHTML = ieMenuHtml(typeof def[2] === 'function' ? def[2]() : def[1]);
        pop.hidden = false;
        pop.style.left = ra.left - rb.left + 'px';
        pop.style.top = ra.bottom - rb.top + 2 + 'px';
    };
    const fechar = () => { aberto = null; ieEl('ie-pop').hidden = true; nav.querySelectorAll('.ie-mbar-btn').forEach(b => b.classList.remove('on')); };
    nav.addEventListener('click', ev => { const b = ev.target.closest('.ie-mbar-btn'); if (b) abrir(+b.dataset.m); });
    nav.addEventListener('mouseover', ev => { const b = ev.target.closest('.ie-mbar-btn'); if (b && aberto !== null && +b.dataset.m !== aberto) { aberto = null; abrir(+b.dataset.m); } });
    document.addEventListener('pointerdown', ev => {
        const pop = ieEl('ie-pop');
        if (aberto !== null && !pop.contains(ev.target) && !nav.contains(ev.target)) fechar();
    }, true);
    ieEl('ie-pop').addEventListener('click', ev => {
        const it = ev.target.closest('[data-cmd]');
        if (!it || it.classList.contains('off')) return;
        ieEl('ie-pop').hidden = true;
        fechar();
        ieCmd(it.dataset.cmd);
    });
    IE.menuFechar = fechar;
}
function ieMenuHtml(itens) {
    return `<div class="ie-menu">${itens.map(it => {
        if (it === '-') return '<i class="ie-menu-sep"></i>';
        const [r, c, at, marcado] = it;
        if (Array.isArray(c)) return `<div class="ie-menu-sub"><i class="ie-menu-chk"></i><span>${ieT(r)}</span><b>›</b>${ieMenuHtml(c)}</div>`;
        const off = !ieCmdPode(c);
        const mk = marcado || (typeof ieCmdMarcado === 'function' && ieCmdMarcado(c));
        return `<button class="ie-menu-item ${off ? 'off' : ''}" data-cmd="${c}"><i class="ie-menu-chk">${mk ? '✓' : ''}</i><span>${ieT(r)}</span><kbd>${at || ''}</kbd></button>`;
    }).join('')}</div>`;
}

function ieMenuContexto(ev, painelCamadas) {
    const doc = IE.doc;
    if (!doc) return;
    const pop = ieEl('ie-pop'), rb = ieEl('ie').getBoundingClientRect();
    const itens = [...(painelCamadas ? [['Opções de mesclagem...', 'opcoesMescla'], '-'] : []),['Duplicar camada', 'duplicar'], ['Excluir camada', 'excluirCamada'], '-', ['Mesclar para baixo', 'mesclarBaixo'], ['Rasterizar camada', 'rasterizar'],
        ['Criar máscara de corte', 'corte'], ['Adicionar máscara', 'mascara'], '-', ['Selecionar pixels', 'selCamada'], ['Transformação livre', 'transformar'],
        ...(painelCamadas ? ['-', ['Copiar estilo de camada', 'copiarEstilo'], ['Colar estilo de camada', 'colarEstilo'], ['Limpar estilo de camada', 'limparEstilo']] : [])];
    if (doc.sel) itens.unshift(['Desmarcar', 'selNada'], ['Inverter seleção', 'selInverter'], ['Camada via cópia', 'duplicar'], '-');
    pop.innerHTML = ieMenuHtml(itens);
    pop.hidden = false;
    pop.style.left = Math.min(rb.width - 240, ev.clientX - rb.left) + 'px';
    pop.style.top = Math.min(rb.height - 300, ev.clientY - rb.top) + 'px';
    const fora = e => { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener('pointerdown', fora, true); } };
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
}

// ─────────────────────────── atalhos ───────────────────────────
const IE_ATALHOS = {
    'Ctrl+N': 'novo', 'Ctrl+O': 'abrir', 'Shift+Ctrl+P': 'colocar', 'Ctrl+S': 'salvar', 'Shift+Ctrl+S': 'salvarComo', 'Alt+Shift+Ctrl+W': 'exportar', 'Ctrl+W': 'fechar',
    'Ctrl+Z': 'desfazer', 'Shift+Ctrl+Z': 'refazer', 'Alt+Ctrl+Z': 'desfazer', 'Ctrl+Y': 'refazer',
    'Ctrl+X': 'recortar', 'Ctrl+C': 'copiar', 'Shift+Ctrl+C': 'copiarMesclado', 'Shift+Ctrl+V': 'colarLugar',
    'Delete': 'limpar', 'Backspace': 'limpar', 'Shift+F5': 'preencher', 'Alt+Backspace': 'preencherFrente', 'Ctrl+Backspace': 'preencherFundo', 'Alt+Delete': 'preencherFrente', 'Ctrl+Delete': 'preencherFundo',
    'Ctrl+T': 'transformar', 'Ctrl+L': 'aj:niveis', 'Ctrl+M': 'aj:curvas', 'Ctrl+U': 'aj:matiz', 'Ctrl+B': 'aj:equilibrio', 'Alt+Shift+Ctrl+B': 'aj:pb',
    'Ctrl+I': 'aj:inverter', 'Shift+Ctrl+U': 'aj:dessaturar', 'Alt+Ctrl+I': 'tamImagem', 'Alt+Ctrl+C': 'tamTela',
    'Shift+Ctrl+N': 'novaCamada', 'Ctrl+J': 'duplicar', 'Shift+Ctrl+J': 'viaRecorte', 'Alt+Ctrl+G': 'corte', 'Ctrl+G': 'agrupar', 'Shift+Ctrl+G': 'desagrupar',
    'Shift+Ctrl+]': 'frente', 'Ctrl+]': 'avancar', 'Ctrl+[': 'recuar', 'Shift+Ctrl+[': 'tras', 'Ctrl+E': 'mesclarBaixo', 'Shift+Ctrl+E': 'mesclarVisiveis',
    'Ctrl+A': 'selTudo', 'Ctrl+D': 'selNada', 'Shift+Ctrl+I': 'selInverter', 'Shift+F6': 'selSuavizar',
    'Ctrl+=': 'zoomMais', 'Ctrl++': 'zoomMais', 'Ctrl+-': 'zoomMenos', 'Ctrl+0': 'zoomAjustar', 'Ctrl+1': 'zoom100', 'Alt+Ctrl+0': 'zoom100',
    'Shift+Ctrl+A': 'f:cameraRaw', 'Alt+[': 'camAbaixo', 'Alt+]': 'camAcima',
};

function ieTeclaNome(ev) {
    let k = ev.key;
    if (k === ' ') k = 'Space';
    if (k.length === 1) k = k.toUpperCase();
    if (ev.code && /^Bracket(Left|Right)$/.test(ev.code)) k = ev.code === 'BracketLeft' ? '[' : ']';
    if (ev.code === 'Equal') k = ev.shiftKey ? '+' : '=';
    if (ev.code === 'Minus') k = '-';
    if (ev.code === 'Comma') k = ',';    // Shift+, vira "<" (e Shift+. vira ">") conforme o teclado: vale a tecla física
    if (ev.code === 'Period') k = '.';
    if (ev.code === 'NumpadAdd') k = '+';
    if (ev.code === 'NumpadSubtract') k = '-';
    if (/^Digit\d$/.test(ev.code || '')) k = ev.code.slice(5);
    const p = [];
    if (ev.altKey) p.push('Alt');
    if (ev.shiftKey && k !== '+') p.push('Shift');
    if (ev.ctrlKey || ev.metaKey) p.push('Ctrl');
    p.push(k);
    return p.join('+');
}

function ieDigitando(ev) {
    const t = ev.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function ieTecla(ev) {
    if (!ieAtivoVisivel()) return;
    if (!ieEl('ie-modal').hidden) return;
    if (ieDigitando(ev)) return;
    if (IE.edTexto) return;
    const doc = IE.doc;
    const nome = ieTeclaNome(ev);
    // espaço = mão; Alt com pincel/balde/degradê = conta-gotas
    if (ev.code === 'Space') { ev.preventDefault(); if (!IE.espaco) { IE.espaco = true; ieCursor(ev); } return; }
    if (ev.key === 'Alt') { ev.preventDefault(); if (['pincel', 'balde', 'degrade', 'forma'].includes(IE.ferr) && !IE.ponteiro) { IE.ferrTemp = 'contagotas'; ieCursor(ev); } return; }
    if (ev.key === 'Enter') {
        if (IE.transf) { ev.preventDefault(); ieTransfAplicar(); return; }
        if (IE.ferr === 'corte' && IE.corte) { ev.preventDefault(); ieCorteAplicar(); return; }
        if (IE.laco && IE.laco.poli) { ev.preventDefault(); ieLacoFechar(doc); return; }
        if (doc && IE.ferr === 'texto') { const L = ieAtiva(doc); if (L && (L.txt || L.texto)) { ev.preventDefault(); ieTextoEditar(L); } return; }
    }
    if (ev.key === 'Escape') {
        if (IE.transf) { ev.preventDefault(); ieTransfCancelar(); return; }
        if (IE.laco) { IE.laco = null; ieDesenharSobre(); return; }
        if (IE.ferr === 'corte') { IE_CORTE.ativar(doc); return; }
        if (IE.ferr === 'fatia' && doc && doc.fatiaSel != null) { doc.fatiaSel = null; ieDesenharSobre(); ieOpcoesRender(); return; }
        return;
    }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && IE.ferr === 'fatia' && doc && ieFatiaSel(doc) && !ev.ctrlKey && !ev.altKey) { ev.preventDefault(); ieFatiaExcluir(doc); return; }
    if (ev.key === 'Backspace' && IE.laco && IE.laco.poli) { ev.preventDefault(); IE.laco.pts.pop(); ieDesenharSobre(); return; }
    const cmd = IE_ATALHOS[nome];
    if (cmd) { ev.preventDefault(); ev.stopPropagation(); ieCmd(cmd); return; }
    if (ev.ctrlKey || ev.metaKey) return;
    // ferramentas e cores
    const k = ev.key.toUpperCase();
    if (!ev.altKey && k.length === 1) {
        if (k === 'D') { ieCoresPadrao(); return; }
        if (k === 'X') { ieTrocarCores(); return; }
        if (k === '[' || k === ']' || ev.code === 'BracketLeft' || ev.code === 'BracketRight') {
            const f = IE.op[IE.ferr];
            if (f && f.tam !== undefined) {
                const mais = ev.code === 'BracketRight' || k === ']';
                if (ev.shiftKey) f.dureza = ieClamp(f.dureza + (mais ? 25 : -25), 0, 100);
                else f.tam = ieClamp(Math.round(f.tam + (mais ? 1 : -1) * Math.max(1, f.tam < 10 ? 1 : f.tam < 50 ? 5 : f.tam < 100 ? 10 : 25)), 1, 2500);
                ieOpcoesRender(); ieDesenharSobre();
            }
            return;
        }
        // números: opacidade (do pincel ou da camada com a ferramenta Mover)
        if (/^[0-9]$/.test(ev.key) && doc) {
            const v = ev.key === '0' ? 100 : +ev.key * 10;
            const f = IE.op[IE.ferr];
            if (f && f.opac !== undefined) { f.opac = v; ieOpcoesRender(); }
            else { ieSelecionadas(doc).forEach(L => (L.op = v / 100)); ieTudo(doc); ieHist(ieT('Opacidade')); }
            return;
        }
        const alvo = Object.keys(IE_FERR).filter(n => IE_FERR[n].tecla === k);
        if (alvo.length) {
            ev.preventDefault();
            // Shift+tecla alterna variantes (letreiro ret/elipse, laço livre/poligonal, degradê/balde, formas)
            if (ev.shiftKey) {
                if (k === 'M') { IE.op.letreiro.forma = IE.op.letreiro.forma === 'ret' ? 'eli' : 'ret'; ieEscolherFerr('letreiro'); return; }
                if (k === 'U') { const t = ['ret', 'eli', 'linha']; IE.op.forma.tipo = t[(t.indexOf(IE.op.forma.tipo) + 1) % 3]; ieEscolherFerr('forma'); return; }
                if (k === 'G') { ieEscolherFerr(IE.ferr === 'degrade' ? 'balde' : 'degrade'); return; }
                if (k === 'C') { ieEscolherFerr(IE.ferr === 'corte' ? 'fatia' : 'corte'); return; }
            }
            if (ev.shiftKey && alvo.length > 1) { ieEscolherFerr(alvo[(alvo.indexOf(IE.ferr) + 1) % alvo.length]); return; }
            ieEscolherFerr(alvo.includes(IE.ferr) ? IE.ferr : alvo[0]);
            return;
        }
    }
    // setas: empurrar com a ferramenta Mover
    if (doc && ev.key.startsWith('Arrow') && (IE.ferr === 'mover' || IE.transf)) {
        ev.preventDefault();
        const passo = ev.shiftKey ? 10 : 1;
        const dx = ev.key === 'ArrowLeft' ? -passo : ev.key === 'ArrowRight' ? passo : 0, dy = ev.key === 'ArrowUp' ? -passo : ev.key === 'ArrowDown' ? passo : 0;
        if (IE.transf) { IE.transf.cx += dx; IE.transf.cy += dy; ieTransfPrevia(); ieOpcoesRender(true); return; }
        const alvos = ieAlvosMover(doc);
        const Ra = alvos.reduce((R, X) => ieRUniao(R, ieRCamada(X)), null);
        alvos.forEach(L => { ieMoverCamada(L, dx, dy); L.movido = true; });
        ieAgendar(ieRUniao(Ra, alvos.reduce((R, X) => ieRUniao(R, ieRCamada(X)), null)), doc);
        clearTimeout(IE.empurrarT);
        IE.empurrarT = setTimeout(() => ieHist(ieT('Empurrar')), 400);
        ieUiPropsPos();
    }
}
function ieTeclaSolta(ev) {
    if (ev.code === 'Space' && IE.espaco) { IE.espaco = false; if (!IE.ponteiro && IE.ferrTemp === 'mao') IE.ferrTemp = null; ieCursor(ev); }
    if (ev.key === 'Alt' && IE.ferrTemp === 'contagotas') { IE.ferrTemp = null; ieCursor(ev); }
}

// ─────────────────────────── comandos ───────────────────────────
function ieCmdPode(c) {
    const doc = IE.doc, L = doc && ieAtiva(doc);
    if (['novo', 'abrir'].includes(c)) return true;
    if (!doc) return false;
    if (c === 'desfazer') return doc.hist.i > 0;
    if (c === 'refazer') return doc.hist.i < doc.hist.itens.length - 1;
    if (['colar', 'colarLugar'].includes(c)) return true;
    if (['recortar', 'copiar', 'limpar'].includes(c)) return !!L;
    if (c === 'mesclarBaixo') { const a = L && ieAchar(doc, L.id); return !!(a && a.i > 0); }
    if (c.startsWith('mascara') && c !== 'mascara' && c !== 'mascaraOcultar' && !c.startsWith('mascaraSel')) return !!(L && L.m);
    if (c === 'verAchatado') return !!doc.achatado;
    if (c === 'exportarFatias' || c === 'fatiasExcluir') return !!(doc.fatias && doc.fatias.length);
    if (c === 'cortarSel' || c === 'selExpandir' || c === 'selContrair' || c === 'selSuavizar' || c === 'mascaraSel' || c === 'mascaraSelOcultar' || c === 'selNada' || c === 'selInverter') return !!doc.sel;
    if (c === 'rasterizar') return !!(L && ieRaster0(L) && L.tipo !== 'pixel');
    return true;
}

async function ieCmd(c) {
    const doc = IE.doc;
    IE.menuFechar?.();
    if (c.startsWith('aj:') || c.startsWith('f:')) {   // o nome vai junto: num objeto inteligente vira filtro inteligente
        IE._cmdAtual = c;
        try { return await (c.startsWith('aj:') ? IE_AJUSTES[c.slice(3)] : IE_FILTROS[c.slice(2)])?.(); } finally { IE._cmdAtual = null; }
    }
    if (c.startsWith('img:')) return ieGirarImagem(c.slice(4));
    if (['g180', 'g90h', 'g90a', 'fh', 'fv'].includes(c)) return ieTransfRapida(c);
    const fn = IE_CMDS[c];
    if (!fn) return;
    if (!doc && !['novo', 'abrir', 'colar'].includes(c)) return;
    if (IE.transf && !['transformar'].includes(c)) ieTransfAplicar();
    try { await fn(doc); } catch (e) { console.error('[editor de imagem] comando', c, e); ieToast(`${ieT('Erro')}: ${e.message || e}`); }
}

function ieUiTudo() { ieUiCamadas(); ieHistRender(); ieStatusRender(); ieAbasRender(); }
