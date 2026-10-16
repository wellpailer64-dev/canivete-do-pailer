// =========================================================
// Lux Kanivete — interface no padrão das ferramentas profissionais (inspirada no Blender): barra de menus (Arquivo,
// Editar, Adicionar, Objeto, Render, Janela, Ajuda), barra de ferramentas vertical, Cena (outliner) e Propriedades em
// abas de ícone (Render, Mundo, Câmera, Objeto, Embalagem, Material, Luz). A estrutura fica em editor-3d-tela.js; aqui
// o conteúdo dos menus e das abas, Sólido/Material, os atalhos da Lux (Shift+A, Ctrl+S/O/N) e o projeto .lknv.
// =========================================================

// ── projeto .lknv (Functions/lux_projeto.py) ──
const LUX_RECENTES = 'lux-recentes';
function luxRecentes() { try { return JSON.parse(localStorage.getItem(LUX_RECENTES) || '[]'); } catch (e) { return []; } }
function luxRecenteAdd(p) { try { localStorage.setItem(LUX_RECENTES, JSON.stringify([p, ...luxRecentes().filter(x => x !== p)].slice(0, 8))); } catch (e) { /* só nesta sessão */ } }
const luxNomeArq = p => (p || '').split(/[\\/]/).pop().replace(/\.lknv$/i, '');

async function luxSalvar(como = false) {
    const c = ve3dTelaClipe(), m = c && veMediaOf(c); if (!ve3dEh(m)) return;
    let p = !como && m.lux && m.lux.arquivo;
    if (!p) { p = await window.pywebview.api.vk_dialogo('salvar', ['Projeto da Lux Kanivete (*.lknv)'], (m.name || 'Cena') + '.lknv'); if (!p) return; }
    if (!/\.lknv$/i.test(p)) p += '.lknv';
    let previa = null;
    try {   // miniatura do quadro na agulha
        const q = ve3dQuadro(c, Math.max(0, veSrcAt(c, V3.t)), 1), k = 480 / Math.max(q.width, q.height), cv = document.createElement('canvas');
        cv.width = Math.round(q.width * k); cv.height = Math.round(q.height * k); cv.getContext('2d').drawImage(q, 0, 0, cv.width, cv.height); previa = cv.toDataURL('image/png');
    } catch (e) { /* sem miniatura */ }
    const dados = { nome: luxNomeArq(p), c3d: m.c3d, largura: V3.w, altura: V3.h, fps: V3.fps || 30, duracao: +m.dur || (veEnd(c) - c.st) };
    const r = await window.pywebview.api.lux_salvar(p, JSON.stringify(dados), previa);
    if (!r || !r.success) { veToast(veT('Não foi possível salvar') + ': ' + ((r && r.error) || '')); return; }
    m.lux = { arquivo: r.path }; m.name = luxNomeArq(r.path); luxRecenteAdd(r.path); VE3T.lux_sujo = false; if (m._lux) { LUXC.sujo = false; luxGuardar(); }
    ve3dTelaTitulo(); veToast(`${veT('Projeto salvo')}: ${luxNomeArq(r.path)}.lknv` + (r.recursos ? ` · ${r.recursos} ${veT('arquivo(s) copiados para dentro')}` : ''));
}
async function luxAbrirArquivo(p) {
    if (!p) return;
    // já aberto nesta sessão: só mostra
    const a = LUXC.m && LUXC.m.lux && LUXC.m.lux.arquivo;
    if (a && a.toLowerCase() === p.toLowerCase()) { await luxAbrir({ continuar: true }); return; }
    const r = await window.pywebview.api.lux_abrir(p);
    if (!r || !r.success) throw new Error(veT('Não abriu o projeto') + ': ' + ((r && r.error) || p));
    await luxAbrir({ dados: r.dados, arquivo: r.path });
    luxRecenteAdd(r.path);
}
async function luxAbrirDialogo() {
    const p = await window.pywebview.api.vk_dialogo('abrir', ['Projeto da Lux Kanivete (*.lknv)', 'Todos (*.*)']);
    if (p) luxAbrirArquivo(p).catch(e => veToast(e.message || String(e)));
}
function ve3dTelaTitulo() {
    const m = ve3dTelaMidia(); if (!VE3T.titulo || !m) return;
    VE3T.titulo.innerHTML = `<span class="app-logo al-lk">Lk</span>Lux Kanivete <small>· ${veEsc(m.name || veT('Cena 3D'))}${m.lux && m.lux.arquivo ? '.lknv' : ''}</small>`;
}

// ── menus ──
function luxItensMenu(nome) {
    const m = ve3dTelaMidia(), md = ve3dTelaModeloSel && ve3dTelaModeloSel(), add = k => () => ve3dTelaAdicionar(k), c = ve3dTelaClipe();
    const est = k => () => ve3dEstudioExecutar(c, k, VE3T.el.querySelector('[data-3trender]'));
    const t = s => ['#', s];
    const M = {
        arquivo: [['Nova cena', 'Ctrl+N', () => luxAbrir({ nova: true })], ['Abrir projeto…', 'Ctrl+O', luxAbrirDialogo],
            ...luxRecentes().length ? [t('Recentes'), ...luxRecentes().map(p => [luxNomeArq(p) + '.lknv', '', () => luxAbrirArquivo(p).catch(e => veToast(e.message || String(e)))])] : [],
            ['-'], ['Salvar', 'Ctrl+S', () => VE3T.lux || (m && m.lux) ? luxSalvar() : (typeof veSaveProject === 'function' && veSaveProject(false))],
            ['Salvar como .lknv…', 'Ctrl+Shift+S', () => luxSalvar(true)],
            ['-'], ['Importar modelo 3D…', '', add('arquivo')], ['Exportar foto (Full HD)', '', est('estudio')], ['Exportar vídeo (prévia)', '', est('video:previa')],
            ['-'], [VE3T.lux ? 'Fechar a Lux' : 'Voltar à timeline', 'Esc', ve3dTelaFechar]],
        editar: [['Desfazer', 'Ctrl+Z', () => V3.casa ? luxDesfazer() : typeof veUndo === 'function' && veUndo()], ['Refazer', 'Ctrl+Shift+Z', () => V3.casa ? luxDesfazer(true) : typeof veRedo === 'function' && veRedo()],
            ['-'], ['Duplicar', 'Ctrl+D', ve3dTelaDuplicar, !md], ['Apagar', 'Del', () => VE3T.kfSel.length ? ve3dKfApagar() : ve3dTelaApagar(), !md && !VE3T.kfSel.length],
            ['Esconder / mostrar', 'H', () => md && ve3dTelaEsconder(md.id), !md], ['Renomear', 'F2', () => luxRenomear(), !md]],
        adicionar: [t('Embalagem'), ['Pote', '', add('emb:pote')], ['Bastão', '', add('emb:bastao')],
            t('Luz'), ['Softbox', '', add('luz:softbox')], ['Spot', '', add('luz:spot')], ['Ponto', '', add('luz:ponto')], ['Sol', '', add('luz:sol')], ['Estúdio 3 pontos', '', add('luz:estudio')],
            t('Forma'), ...VE3D_FORMAS.map(f => [f[0].toUpperCase() + f.slice(1), '', add(f)]),
            ['-'], ['Importar modelo 3D…', '', add('arquivo')]],
        objeto: [['Mover', 'W', () => ve3dTelaModo('translate')], ['Girar', 'E', () => ve3dTelaModo('rotate')], ['Escala', 'R', () => ve3dTelaModo('scale')],
            ['-'], ['Eixo do objeto / do mundo', 'Q', ve3dTelaEspaco], ['Ímã (passos fixos)', 'Ctrl', () => ve3dTelaIma(!VE3T.ima)], ['Enquadrar', 'F', ve3dTelaEnquadrar],
            ['-'], ['Para a frente', '[', () => typeof ve3dEmpurrarPasso === 'function' && ve3dEmpurrarPasso(1 / 1.12), !md], ['Para o fundo', ']', () => typeof ve3dEmpurrarPasso === 'function' && ve3dEmpurrarPasso(1.12), !md],
            ['Apoiar no chão', '', () => { VE3DAPI.zerar(md.id, { chao: true }, m.id); ve3dTelaLado(); }, !md], ['Zerar posição', '', () => { VE3DAPI.zerar(md.id, {}, m.id); ve3dTelaLado(); }, !md]],
        render: [t('Foto (a cena na agulha)'), ...Object.entries(VE3D_ESTUDIO_Q).map(([k, q]) => [q.nome, '', est(k)]),
            t('Vídeo (a animação inteira)'), ['Vídeo prévia (~3 s por quadro)', '', est('video:previa')], ['Vídeo final (~6 s por quadro)', '', est('video:final')], ['Vídeo EEVEE (sem bolhas)', '', est('video:eevee')],
            ['-'], ['Abrir a pasta dos renders', '', luxPastaRenders]],
        janela: [['Câmera da cena', 'C', () => ve3dTelaLivre(false)], ['Vista livre', 'C', () => ve3dTelaLivre(true)],
            ['-'], ['Sólido', '', () => luxSombreado('solido')], ['Material', '', () => luxSombreado('material')],
            ['-'], ['Faixas de tempo: altura automática', '', () => ve3dTelaAltura(0, true)]],
        ajuda: [['Atalhos da Lux', '', luxAtalhos]],
    };
    return M[nome] || [];
}
const LUX_MENUS = [['arquivo', 'Arquivo'], ['editar', 'Editar'], ['adicionar', 'Adicionar'], ['objeto', 'Objeto'], ['render', 'Render'], ['janela', 'Janela'], ['ajuda', 'Ajuda']];
function luxMontarMenus(nav) {
    nav.innerHTML = LUX_MENUS.map(([k, n]) => `<button data-luxmenu="${k}">${veT(n)}</button>`).join('');
    nav.addEventListener('mouseover', e => { const b = e.target.closest('[data-luxmenu]'); if (b && VE3T.menuAberto && VE3T.menuAberto !== b.dataset.luxmenu) luxMenu(b.dataset.luxmenu, b); });
}
function luxMenu(nome, ancora, xy) {
    veClipMenuFechar();
    const m = document.createElement('div'); m.className = 've-ctx lux-ctx'; VE3T.menuAberto = nome;
    const itens = luxItensMenu(nome), acoes = [];
    m.innerHTML = itens.map(it => {
        if (it[0] === '-') return '<div class="ve-ctx-sep"></div>';
        if (it[0] === '#') return `<div class="ve-ctx-sub">${veT(it[1])}</div>`;
        acoes.push(it[2]);
        return `<button class="ve-ctx-item" data-luxi="${acoes.length - 1}"${it[3] ? ' disabled' : ''}>${veT(it[0])}${it[1] ? `<kbd>${it[1]}</kbd>` : ''}</button>`;
    }).join('');
    document.body.appendChild(m);
    if (xy) veCtxPosicionar(m, xy[0], xy[1], document);
    else { const r = ancora.getBoundingClientRect(); veCtxPosicionar(m, r.left, r.bottom + 2, document); }
    if (ancora) ancora.classList.add('on');
    m.addEventListener('click', e => { const b = e.target.closest('[data-luxi]'); if (!b || b.disabled) return; veClipMenuFechar(); const f = acoes[+b.dataset.luxi]; if (f) Promise.resolve(f()).catch(er => veToast(er.message || String(er))); });
    const fora = e => { if (!m.contains(e.target) && !(e.target.closest && e.target.closest('[data-luxmenu]'))) veClipMenuFechar(); };
    const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); veClipMenuFechar(); } };
    setTimeout(() => { document.addEventListener('pointerdown', fora, true); document.addEventListener('keydown', tecla, true); }, 0);
    VE._ctx = { m, fechar: () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', tecla, true); m.remove(); if (ancora) ancora.classList.remove('on'); VE3T.menuAberto = null; } };
}
function luxRenomear() { const b = VE3T.lista && VE3T.lista.querySelector(`[data-3tsel="${CSS.escape(VE3T.so)}"]`); if (b) ve3dTelaRenomear(b); }
function luxPastaRenders() { const d = typeof vePrPrefs === 'function' && vePrPrefs().dir; window.pywebview.api.open_file(d ? d.replace(/[\\/]+$/, '') + '/Estudio' : ''); }
function luxSombreado(modo) {
    VE3T.solido = modo === 'solido'; VE3T.chave = '';
    VE3T.el.querySelectorAll('[data-3tsomb]').forEach(b => b.classList.toggle('on', b.dataset['3tsomb'] === modo));
}
function luxAtalhos() {
    const linhas = [['W / E / R', 'Mover / girar / escala'], ['Shift+A', 'Adicionar'], ['C', 'Câmera da cena ↔ vista livre'], ['F', 'Enquadrar'], ['Q', 'Eixo objeto/mundo'],
        ['H', 'Esconder/mostrar'], ['Ctrl+D', 'Duplicar'], ['Delete', 'Apagar (ou os ◆ selecionados)'], ['[ ]', 'Profundidade sem mudar o tamanho'], ['Espaço', 'Play'],
        ['U', 'Propriedades animadas na faixa'], ['F9', 'Easy Ease nos ◆'], ['Ctrl+S', 'Salvar .lknv'], ['Ctrl+O', 'Abrir projeto'], ['Ctrl+Z', 'Desfazer']];
    const d = document.createElement('div'); d.className = 'lux-atalhos';
    d.innerHTML = `<div><b>${veT('Atalhos da Lux Kanivete')}</b>${linhas.map(([k, v]) => `<p><kbd>${k}</kbd><span>${veT(v)}</span></p>`).join('')}<small>${veT('Clique para fechar')}</small></div>`;
    d.addEventListener('click', () => d.remove()); document.body.appendChild(d);
}

// ── abas de propriedades ──
const LUX_ABAS = { render: ['render', 'Render'], mundo: ['mundo', 'Mundo'], camera: ['camera', 'Câmera'], objeto: ['objeto', 'Objeto'], embalagem: ['caixa', 'Embalagem'], material: ['material', 'Material'], luz: ['luz', 'Luz'] };
function luxAbas(c) {
    const m = veMediaOf(c), so = VE3T.so, md = m.c3d.modelos.find(x => x.id === so), tipo = md && (md.fonte || {}).tipo;
    const lista = ['render', 'mundo'];
    if (so === 'camera') lista.push('camera');
    else if (md && tipo === 'luz') lista.push('luz');
    else if (md) { lista.push('objeto'); if (tipo === 'embalagem') lista.push('embalagem'); if (tipo !== 'vetor') lista.push('material'); }
    // a aba fica quando dá; se a seleção mudou de tipo, vai para a primeira do objeto (como o Blender)
    if (VE3T.selAnt !== so) { VE3T.selAnt = so; if (!lista.includes(VE3T.aba) || ['render', 'mundo'].includes(VE3T.aba)) VE3T.aba = so === 'cenario' ? 'mundo' : lista[2] || VE3T.aba || 'render'; }
    if (!lista.includes(VE3T.aba)) VE3T.aba = lista[2] || 'render';
    const barra = lista.map(k => `<button class="${k === VE3T.aba ? 'on' : ''}" data-luxaba="${k}" title="${veT(LUX_ABAS[k][1])}">${VE3T_ICO[LUX_ABAS[k][0]]}</button>`).join('') + `<span class="lux-aba-nome">${veT(LUX_ABAS[VE3T.aba][1])}</span>`;
    return { barra, html: luxAbaHtml(c, VE3T.aba, md) };
}
function luxAbaHtml(c, aba, md) {
    if (aba === 'render') return luxAbaRender(c);
    if (aba === 'mundo') return ve3dPainelHtml(c, 'cenario') + ve3dPainelHtml(c, 'luz') +
        `<small class="ve-pp-dica lux-dica">${veT('A "Luz" acima é a luz automática: vale quando a cena não tem luzes próprias (softbox, spot…).')}</small>`;
    if (aba === 'camera') return ve3dPainelHtml(c, 'camera');
    if (aba === 'luz') return ve3dPainelHtml(c, md.id);
    if (aba === 'objeto') { const ap = ve3dAparenciaHtml; ve3dAparenciaHtml = () => ''; try { return ve3dPainelHtml(c, md.id); } finally { ve3dAparenciaHtml = ap; } }
    if (aba === 'embalagem') return ve3dEmbPainel(md, 'emb');
    if (aba === 'material') return (md.fonte || {}).tipo === 'embalagem' ? ve3dEmbPainel(md, 'mat') : ve3dAparenciaHtml(md);
    return '';
}
function luxAbaRender(c) {
    const W = V3.w || 1920, H = V3.h || 1080, cn = ve3dCenario(veMediaOf(c).c3d), Q = VE3D_ESTUDIO_Q;
    const tam = q => { if (!q.lado) return `${W}×${H}`; const k = q.lado / Math.max(W, H); return `${Math.round(W * k)}×${Math.round(H * k)}`; };
    return vePpSec(veT('Foto'), `<div class="lux-render-lista">${Object.entries(Q).map(([k, q]) => `<button class="lux-render-op" data-luxrender="${k}"><b>${veT(q.nome.split(' (')[0])}</b><small>${tam(q)} · ${q.amostras} ${veT('amostras')}</small></button>`).join('')}</div>
            <small class="ve-pp-dica">${veT('A cena como está na agulha, no motor Cycles (luz de verdade). Mesma cena = não renderiza de novo.')}</small>`) +
        vePpSec(veT('Vídeo'), `<div class="lux-render-lista"><button class="lux-render-op" data-luxrender="video:previa"><b>${veT('Prévia')}</b><small>~3 s ${veT('por quadro')} · 16 ${veT('amostras')}</small></button>
            <button class="lux-render-op" data-luxrender="video:final"><b>${veT('Final')}</b><small>~6 s ${veT('por quadro')} · 32 ${veT('amostras')}</small></button></div>
            <small class="ve-pp-dica">${veT('A animação inteira (◆ de objetos, câmera e luzes). Sai em MP4; sem fundo, MOV com transparência.')}</small>`) +
        vePpSec(veT('Saída'), `<div class="ve-pp-l"><label>${veT('Fundo')}</label><span>${cn.p.estudio ? veT('estúdio infinito') + ` <i class="lux-amostra" style="background:${veEsc(cn.p.estudioCor || '#e9e4dc')}"></i>` : veT('transparente (PNG/MOV com alfa)')}</span></div>
            <div class="ve-pp-botoes"><button class="ve-btn ve-btn-sm ve-btn-ghost" data-luxpasta>${veT('Abrir a pasta dos renders')}</button></div>`);
}

// ── eventos da interface nova (cliques fora do listener da tela) e atalhos da Lux ──
document.addEventListener('click', e => {
    if (!VE3T.el || VE3T.el.hidden || !VE3T.el.contains(e.target)) return;
    const mn = e.target.closest('[data-luxmenu]'), ab = e.target.closest('[data-luxaba]'), so = e.target.closest('[data-3tsomb]'), rd = e.target.closest('[data-luxrender]'), pa = e.target.closest('[data-luxpasta]');
    if (mn) { if (VE3T.menuAberto === mn.dataset.luxmenu) veClipMenuFechar(); else luxMenu(mn.dataset.luxmenu, mn); }
    else if (ab) { VE3T.aba = ab.dataset.luxaba; ve3dTelaLado(); }
    else if (so) luxSombreado(so.dataset['3tsomb']);
    else if (rd) ve3dEstudioExecutar(ve3dTelaClipe(), rd.dataset.luxrender, rd);
    else if (pa) luxPastaRenders();
});
window.addEventListener('keydown', e => {   // registrado antes da tela: Ctrl+S/O/N da Lux não vão para o Editor
    if (!VE3T.el || VE3T.el.hidden || VE._ctx) return;
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), m = ve3dTelaMidia(), feito = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.shiftKey && !ctrl && k === 'a') { luxMenu('adicionar', null, [VE3T.mouse ? VE3T.mouse[0] : innerWidth / 2, VE3T.mouse ? VE3T.mouse[1] : innerHeight / 2]); feito(); return; }
    if (!ctrl && !e.shiftKey && k === 'f2') { luxRenomear(); feito(); return; }
    if (!ctrl) return;
    if (V3.casa && (k === 'z' || k === 'y')) { luxDesfazer(k === 'y' || e.shiftKey); feito(); return; }   // desfazer da Lux (o do Editor não vê a cena)
    const projetoLux = VE3T.lux || (m && m.lux);
    if (k === 's' && (projetoLux || e.shiftKey)) { luxSalvar(e.shiftKey); feito(); }
    else if (k === 'o' && VE3T.lux) { luxAbrirDialogo(); feito(); }
    else if (k === 'n' && VE3T.lux) { luxAbrir({ nova: true }); feito(); }
}, true);
document.addEventListener('pointermove', e => { VE3T.mouse = [e.clientX, e.clientY]; }, { passive: true });
