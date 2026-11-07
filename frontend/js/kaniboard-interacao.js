// =========================================================
// KaniBoard — interação: monta a tela, ferramentas (V H N T S L P E F), mouse (mover, alças, seleção por área, setas
// que grudam, caneta, borracha), roda (zoom no Miro: roda = zoom; touchpad = rolar), teclado, copiar/colar, arrastar
// imagens, barra de contexto sobre a seleção, menu do botão direito, painel de frames e apresentação.
// =========================================================
const KB_ICO = {
    sel: '<path d="M5 3l14 8-6 1.6L9.6 19z"/>',
    mao: '<path d="M8 11V5.5a1.5 1.5 0 013 0V10m0-5.5V4a1.5 1.5 0 013 0v6m0-4.5a1.5 1.5 0 013 0V13c0 4-2.5 7-6.5 7S6 17.5 4.6 14.5L3.4 12a1.4 1.4 0 012.3-1.5L8 13"/>',
    nota: '<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>',
    texto: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    forma: '<rect x="3" y="3" width="10" height="10" rx="1.5"/><circle cx="16" cy="16" r="5"/>',
    seta: '<path d="M5 19C5 10 10 6 19 6"/><path d="M14 3l5 3-4 4"/>',
    caneta: '<path d="M4 20l1.2-4.4L16 4.8a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.4 18.8z"/><path d="M14 7l3 3"/>',
    frame: '<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
    imagem: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
    desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    refazer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
    frente: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M4 16V5a1 1 0 011-1h11"/>',
    tras: '<rect x="4" y="4" width="12" height="12" rx="1.5"/><path d="M20 8v11a1 1 0 01-1 1H8"/>',
    trava: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    destrava: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/>',
    duplicar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    mais: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    voltar: '<path d="M15 5l-7 7 7 7"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    frames: '<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/>',
    ajustar: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    mapa: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    borracha: '<path d="M8 20h12M5.5 14.5l8-8a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L12 18H8z"/>',
    marca: '<path d="M9 15l-3 3h4l1-1M9 15l6-9 3 2-6 9z"/>',
    alinhar: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
};
const kbSvg = (k, extra = '') => `<svg class="kbo-i" viewBox="0 0 24 24" ${extra}>${KB_ICO[k] || ''}</svg>`;
const KB_FRAMES = [['16:9', 'Apresentação 16:9', 1600, 900], ['9:16', 'Reels / Story 9:16', 720, 1280], ['4:5', 'Post 4:5', 1080, 1350],
    ['1:1', 'Quadrado 1:1', 1080, 1080], ['a4', 'A4 em pé', 1191, 1684], ['livre', 'Livre (arraste)', 0, 0]];

// ───────────── montar a tela ─────────────
function kbMontar() {
    const pg = kbEl('page-kaniboard'); if (!pg || pg.dataset.ok) return;
    pg.dataset.ok = '1';
    pg.innerHTML = `<div class="kbo" id="kbo">
      <section class="kl" id="kbo-inicio" style="--kl-top:0px"></section>
      <div class="kbo-editor" id="kbo-editor" hidden>
        <div class="kbo-vp" id="kbo-vp" tabindex="-1">
          <div class="kbo-mundo" id="kbo-mundo">
            <div id="kbo-frames"></div>
            <svg id="kbo-setas" class="kbo-svg"></svg>
            <div id="kbo-itens"></div>
            <div id="kbo-rotulos"></div>
            <svg id="kbo-rascunho" class="kbo-svg"></svg>
          </div>
          <div class="kbo-ui" id="kbo-ui"></div>
        </div>
        <header class="kbo-painel kbo-topo">
          <button class="kbo-b" data-a="voltar" title="Voltar para os quadros">${kbSvg('voltar')}</button>
          <span class="app-logo al-kb app-logo-marca">Kb</span>
          <input id="kbo-nome" class="kbo-nome" spellcheck="false" title="Nome do quadro">
          <button class="kbo-b" data-a="menu" title="Opções do quadro">${kbSvg('mais')}</button>
          <span class="kbo-status" id="kbo-status"></span>
        </header>
        <div class="kbo-painel kbo-topo-dir">
          <button class="kbo-b kbo-b-txt" data-a="frames" title="Frames do quadro">${kbSvg('frames')} Frames</button>
          <button class="kbo-b kbo-b-pri" data-a="apresentar" title="Apresentar os frames em tela cheia">${kbSvg('play')} Apresentar</button>
        </div>
        <nav class="kbo-painel kbo-barra" id="kbo-barra">
          <button class="kbo-fe" data-f="sel" title="Selecionar (V)">${kbSvg('sel')}</button>
          <button class="kbo-fe" data-f="mao" title="Mão (H) · ou segure Espaço / botão do meio / botão direito">${kbSvg('mao')}</button>
          <i class="kbo-sep"></i>
          <button class="kbo-fe" data-f="nota" title="Nota adesiva (N)">${kbSvg('nota')}<i class="kbo-fe-cor" id="kbo-fe-cor"></i></button>
          <button class="kbo-fe" data-f="texto" title="Texto (T)">${kbSvg('texto')}</button>
          <button class="kbo-fe" data-f="forma" title="Formas (S)">${kbSvg('forma')}</button>
          <button class="kbo-fe" data-f="seta" title="Seta / conector (L)">${kbSvg('seta')}</button>
          <button class="kbo-fe" data-f="caneta" title="Caneta (P) · marca-texto · borracha (E)">${kbSvg('caneta')}</button>
          <button class="kbo-fe" data-f="frame" title="Frame (F)">${kbSvg('frame')}</button>
          <button class="kbo-fe" data-a="imagem" title="Imagem ou GIF (também dá para colar ou arrastar)">${kbSvg('imagem')}</button>
          <i class="kbo-sep"></i>
          <button class="kbo-fe" data-a="desfazer" title="Desfazer (Ctrl+Z)">${kbSvg('desfazer')}</button>
          <button class="kbo-fe" data-a="refazer" title="Refazer (Ctrl+Shift+Z)">${kbSvg('refazer')}</button>
        </nav>
        <div class="kbo-painel kbo-fly" id="kbo-fly" hidden></div>
        <div class="kbo-painel kbo-ctx" id="kbo-ctx" hidden></div>
        <div class="kbo-painel kbo-pop" id="kbo-pop" hidden></div>
        <div class="kbo-painel kbo-menu" id="kbo-menu" hidden></div>
        <div class="kbo-painel kbo-zoom">
          <button class="kbo-b" data-a="mapa" title="Minimapa">${kbSvg('mapa')}</button>
          <i class="kbo-sep-v"></i>
          <button class="kbo-b" data-a="zoom-" title="Afastar (Ctrl+−)">−</button>
          <button class="kbo-b kbo-zoom-txt" id="kbo-zoom-txt" data-a="zoommenu" title="Zoom">100%</button>
          <button class="kbo-b" data-a="zoom+" title="Aproximar (Ctrl+=)">+</button>
          <button class="kbo-b" data-a="ajustar" title="Ver tudo (Shift+1)">${kbSvg('ajustar')}</button>
        </div>
        <canvas class="kbo-painel kbo-mini" id="kbo-mini" width="220" height="140" hidden></canvas>
        <aside class="kbo-painel kbo-fpainel" id="kbo-fpainel" hidden></aside>
        <div class="kbo-show-masc" id="kbo-show-masc" hidden></div>
        <div class="kbo-show-hud" id="kbo-show-hud" hidden></div>
      </div>
    </div>`;
    const raiz = kbEl('kbo'), vp = kbEl('kbo-vp');
    raiz.addEventListener('click', kbClique);
    vp.addEventListener('pointerdown', kbDown);
    vp.addEventListener('pointermove', kbMove);
    vp.addEventListener('pointerup', kbUp);
    vp.addEventListener('pointercancel', kbUp);
    vp.addEventListener('lostpointercapture', e => { if (KB.gesto && KB.gesto.pid === e.pointerId) kbUp(e); });
    vp.addEventListener('pointerleave', () => { KB.mouse.dentro = false; });
    vp.addEventListener('pointerenter', () => { KB.mouse.dentro = true; });
    vp.addEventListener('wheel', kbRoda, { passive: false });
    vp.addEventListener('dblclick', kbDuplo);
    vp.addEventListener('contextmenu', kbMenuContexto);
    vp.addEventListener('dragover', e => { if (KB.doc && [...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    vp.addEventListener('drop', kbSoltar);
    kbEl('kbo-ui').addEventListener('pointerdown', e => { if (e.target.closest('[data-mais]')) e.stopPropagation(); }, true);
    kbEl('kbo-ui').addEventListener('click', e => { const b = e.target.closest('[data-mais]'); if (b) kbMaisRapido(b.dataset.mais); });
    const nome = kbEl('kbo-nome');
    nome.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') nome.value = KB.doc.nome; nome.blur(); } e.stopPropagation(); });
    nome.addEventListener('change', () => kbRenomear(nome.value));
    nome.addEventListener('blur', () => { if (KB.doc && nome.value.trim() !== KB.doc.nome) kbRenomear(nome.value); });
    const ctx = kbEl('kbo-ctx');
    ctx.addEventListener('pointerdown', e => { if (!e.target.closest('input')) e.preventDefault(); });   // não tira o foco do texto em edição
    ctx.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) kbCtxAcao(b.dataset.c, b); });
    kbEl('kbo-pop').addEventListener('pointerdown', e => { if (!e.target.closest('input')) e.preventDefault(); });
    const mini = kbEl('kbo-mini');
    mini.addEventListener('pointerdown', e => { mini.setPointerCapture(e.pointerId); kbMiniIr(e); mini.onpointermove = kbMiniIr; });
    mini.addEventListener('pointerup', () => { mini.onpointermove = null; });
    document.addEventListener('pointerdown', e => {
        if (!e.target.closest('#kbo-pop,[data-c],[data-pop]')) kbPopFechar();
        if (!e.target.closest('#kbo-menu')) kbEl('kbo-menu').hidden = true;
        if (!e.target.closest('#kbo-fly,.kbo-fe')) kbFlyFechar();
    }, true);
    new ResizeObserver(() => { if (KB.doc) { kbPintarUi(); kbMinimapa(); } }).observe(vp);
    KB.prefs.roda = kbPref('roda') || 'zoom';
    const cn = kbPref('nota'); if (cn) KB.corNota = cn;
    kbEl('kbo-fe-cor').style.background = KB.corNota;
    if (kbPref('mini') === '1') kbEl('kbo-mini').hidden = false;
}

// ───────────── cliques nos botões fixos ─────────────
function kbClique(e) {
    const f = e.target.closest('#kbo-barra [data-f]');
    if (f) { kbFerramenta(f.dataset.f, true); return; }
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'voltar') kbFecharQuadro();
    else if (a === 'menu') kbMenuQuadro(b);
    else if (a === 'frames') kbPainelFrames();
    else if (a === 'apresentar') kbApresentar();
    else if (a === 'imagem') kbImagemArquivo();
    else if (a === 'desfazer') kbDesfazer();
    else if (a === 'refazer') kbDesfazer(true);
    else if (a === 'zoom+') kbZoomEm(KB.cam.z * 1.25);
    else if (a === 'zoom-') kbZoomEm(KB.cam.z / 1.25);
    else if (a === 'ajustar') kbAjustarTudo();
    else if (a === 'mapa') { const m = kbEl('kbo-mini'); m.hidden = !m.hidden; kbPref('mini', m.hidden ? '0' : '1'); kbMinimapa(); }
    else if (a === 'zoommenu') kbPop(b, `<div class="kbo-lista-pop">
        <button data-p="z:ajustar">Ver tudo <kbd>Shift+1</kbd></button><button data-p="z:sel">Ir para a seleção <kbd>Shift+2</kbd></button>
        <hr>${[25, 50, 100, 150, 200, 400].map(z => `<button data-p="z:${z}">${z}%${z === 100 ? ' <kbd>Ctrl+0</kbd>' : ''}</button>`).join('')}</div>`, v => {
        const z = v.slice(2);
        if (z === 'ajustar') kbAjustarTudo(); else if (z === 'sel') kbIrSelecao(); else kbZoomEm(+z / 100);
        kbPopFechar();
    }, 'cima');
}

async function kbRenomear(nome) {
    nome = (nome || '').trim() || 'Sem título';
    if (!KB.doc || nome === KB.doc.nome) return;
    KB.doc.nome = nome; kbEl('kbo-nome').value = nome;
    kbAgendarSalvar(200);
}

// ───────────── ferramentas ─────────────
function kbFerramenta(f, doBotao) {
    if (doBotao && KB.ferramenta === f && ['nota', 'forma', 'caneta', 'frame'].includes(f)) { kbFlyAbrir(f); return; }
    kbSairEdicao();
    KB.ferramenta = f;
    document.querySelectorAll('#kbo-barra .kbo-fe[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    const vp = kbEl('kbo-vp'); if (vp) vp.dataset.f = f === 'caneta' ? 'caneta-' + KB.caneta.modo : f;
    if (['nota', 'forma', 'caneta', 'frame'].includes(f)) kbFlyAbrir(f); else kbFlyFechar();
    KB.hover = null;
    kbPintarUi();
}
function kbFlyFechar() { const f = kbEl('kbo-fly'); if (f) f.hidden = true; }
function kbFlyAbrir(f) {
    const fly = kbEl('kbo-fly'), bt = document.querySelector(`#kbo-barra [data-f="${f}"]`); if (!fly || !bt) return;
    let h = '';
    if (f === 'nota') h = `<div class="kbo-fly-tit">Cor da nota</div><div class="kbo-cores kbo-cores-nota">${KB_CORES_NOTA.map(c => `<button data-fly="nota:${c}" class="${c === KB.corNota ? 'on' : ''}" style="--c:${c}"></button>`).join('')}</div>
        <p class="kbo-fly-dica">Clique no quadro para colar a nota. <kbd>Tab</kbd> enquanto escreve cria a próxima.</p>`;
    else if (f === 'forma') h = `<div class="kbo-fly-tit">Formas</div><div class="kbo-formas">${KB_FORMAS.map(([k, n]) => `<button data-fly="forma:${k}" class="${k === KB.forma ? 'on' : ''}" title="${n}">
        <svg viewBox="0 0 30 22"><path d="${kbFormaPath(k, 30, 22, 1.6)}"/></svg></button>`).join('')}</div><p class="kbo-fly-dica">Clique ou arraste no quadro.</p>`;
    else if (f === 'caneta') {
        const c = KB.caneta;
        h = `<div class="kbo-fly-modos">${[['caneta', 'Caneta (P)'], ['marca', 'Marca-texto'], ['borracha', 'Borracha (E)']].map(([k, n]) => `<button data-fly="modo:${k}" class="${c.modo === k ? 'on' : ''}" title="${n}">${kbSvg(k)}</button>`).join('')}</div>
        ${c.modo === 'borracha' ? '<p class="kbo-fly-dica">Passe sobre os traços para apagar.</p>' : `
        <div class="kbo-cores">${(c.modo === 'marca' ? ['#ffe066', '#b2f2bb', '#a5d8ff', '#fcc2d7', '#ffc078', '#e5b3ff'] : KB_CORES).map(k => `<button data-fly="cor:${k}" class="${k === c.cor ? 'on' : ''}" style="--c:${k}"></button>`).join('')}</div>
        <div class="kbo-esps">${(c.modo === 'marca' ? [12, 20, 32] : [2, 3, 5, 8, 14]).map(w => `<button data-fly="esp:${w}" class="${w === c.esp ? 'on' : ''}"><i style="width:${Math.min(w, 16)}px;height:${Math.min(w, 16)}px"></i></button>`).join('')}</div>`}`;
    } else if (f === 'frame') h = `<div class="kbo-fly-tit">Frame</div><div class="kbo-lista-pop">${KB_FRAMES.map(([k, n, w, hh]) => `<button data-fly="frame:${k}" class="${(KB.framePreset || '16:9') === k ? 'on' : ''}">${n}${w ? `<small>${w}×${hh}</small>` : ''}</button>`).join('')}</div>
        <p class="kbo-fly-dica">Clique para criar no tamanho escolhido ou arraste para desenhar.</p>`;
    fly.innerHTML = h; fly.hidden = false;
    const r = bt.getBoundingClientRect(), base = kbEl('kbo-editor').getBoundingClientRect();
    fly.style.left = (r.right - base.left + 10) + 'px';
    fly.style.top = Math.max(8, Math.min(r.top - base.top - 8, base.height - fly.offsetHeight - 8)) + 'px';
    fly.onclick = e => {
        const b = e.target.closest('[data-fly]'); if (!b) return;
        const [k, v] = b.dataset.fly.split(/:(.*)/);
        if (k === 'nota') { KB.corNota = v; kbPref('nota', v); kbEl('kbo-fe-cor').style.background = v; kbFlyFechar(); }
        else if (k === 'forma') { KB.forma = v; kbFlyFechar(); }
        else if (k === 'modo') {
            const c = KB.caneta; c.modo = v;
            if (v === 'marca') { c.cor = '#ffe066'; c.esp = 20; } else if (v === 'caneta' && (c.esp > 14 || c.cor === '#ffe066')) { c.cor = kbTema().tinta; c.esp = 3; }
            kbEl('kbo-vp').dataset.f = 'caneta-' + v; kbFlyAbrir('caneta');
        }
        else if (k === 'cor') { KB.caneta.cor = v; kbFlyAbrir('caneta'); }
        else if (k === 'esp') { KB.caneta.esp = +v; kbFlyAbrir('caneta'); }
        else if (k === 'frame') { KB.framePreset = v; kbFlyFechar(); }
    };
}

// ───────────── camada de tela: seleção, alças, guias ─────────────
function kbSelItens() { return [...KB.sel].map(kbItem).filter(Boolean); }
function kbCaixaTela(cx) { const [x, y] = kbParaTela(cx.x, cx.y); return { x, y, w: cx.w * KB.cam.z, h: cx.h * KB.cam.z }; }
function kbPintarUi() {
    const ui = kbEl('kbo-ui'); if (!ui || !KB.doc) return;
    const sel = kbSelItens(), g = KB.gesto, partes = [];
    const ocupado = g && ['mover', 'redim', 'caneta', 'borracha', 'pan', 'seta', 'pontaSeta', 'criar'].includes(g.tipo) && g.ativo;
    sel.forEach(it => {
        if (it.tipo === 'seta') return;
        const c = kbCaixaTela(kbCaixa(it));
        partes.push(`<div class="kbo-sel-it${it.lock ? ' trava' : ''}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px"></div>`);
    });
    // setas: pontas arrastáveis
    sel.filter(it => it.tipo === 'seta').forEach(s => {
        const gm = kbSetaGeo(s); if (!gm) return;
        partes.push(`<svg class="kbo-sel-seta"><path d="${kbPathTela(gm.d)}"/></svg>`);
        if (sel.length === 1 && !s.lock) [['a', gm.fimA[0]], ['b', gm.fimB[0]]].forEach(([k, p]) => {
            const [x, y] = kbParaTela(p[0], p[1]), presa = s[k] && s[k].id;
            partes.push(`<i class="kbo-ponta${presa ? ' presa' : ''}" data-ponta="${k}" style="left:${x}px;top:${y}px"></i>`);
        });
    });
    const soltos = sel.filter(it => it.tipo !== 'seta');
    if (soltos.length && !ocupado) {
        const cx = kbCaixaTela(kbUniao(soltos.map(kbCaixa)));
        if (soltos.length > 1 || sel.length > 1) partes.push(`<div class="kbo-sel-caixa" style="left:${cx.x}px;top:${cx.y}px;width:${cx.w}px;height:${cx.h}px"></div>`);
        const travado = soltos.every(i => i.lock);
        if (!travado && !KB.editando) {
            const so1 = soltos.length === 1 && sel.length === 1 ? soltos[0] : null;
            const hs = so1 && so1.tipo === 'texto' ? ['nw', 'ne', 'se', 'sw', 'e', 'w'] : so1 && so1.tipo === 'caneta' ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
            const pos = { nw: [0, 0], n: [.5, 0], ne: [1, 0], e: [1, .5], se: [1, 1], s: [.5, 1], sw: [0, 1], w: [0, .5] };
            hs.forEach(h => partes.push(`<i class="kbo-alca kbo-alca-${h}" data-h="${h}" style="left:${cx.x + cx.w * pos[h][0]}px;top:${cx.y + cx.h * pos[h][1]}px"></i>`));
            if (so1 && (so1.tipo === 'nota' || so1.tipo === 'forma') && cx.w > 30) {
                [['t', .5, 0, 0, -1], ['r', 1, .5, 1, 0], ['b', .5, 1, 0, 1], ['l', 0, .5, -1, 0]].forEach(([k, fx, fy, dx, dy]) =>
                    partes.push(`<button class="kbo-mais" data-mais="${k}" title="Criar ligado" style="left:${cx.x + cx.w * fx + dx * 34}px;top:${cx.y + cx.h * fy + dy * 34}px">+</button>`));
            }
        }
    }
    // pontos de ligação (passar o mouse por cima, ou ferramenta seta)
    const hv = KB.hover && kbItem(KB.hover);
    if (hv && hv.tipo !== 'seta' && hv.tipo !== 'frame' && hv.tipo !== 'caneta' && (!g || g.tipo === 'seta' || g.tipo === 'pontaSeta') && !KB.editando) {
        const c = kbCaixaTela(hv), off = KB.sel.has(hv.id) ? 16 : 0;
        [['t', .5, 0, 0, -1], ['r', 1, .5, 1, 0], ['b', .5, 1, 0, 1], ['l', 0, .5, -1, 0]].forEach(([k, fx, fy, dx, dy]) =>
            partes.push(`<i class="kbo-ancora${g && g.alvoLado === k && g.alvo === hv.id ? ' on' : ''}" data-ancora="${hv.id}:${k}" style="left:${c.x + c.w * fx + dx * off}px;top:${c.y + c.h * fy + dy * off}px"></i>`));
        if (g && (g.tipo === 'seta' || g.tipo === 'pontaSeta') && g.alvo === hv.id) partes.push(`<div class="kbo-alvo" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px"></div>`);
    }
    if (g && g.tipo === 'marquee' && g.ativo) {
        const x = Math.min(g.sx, g.ex), y = Math.min(g.sy, g.ey);
        partes.push(`<div class="kbo-marquee" style="left:${x}px;top:${y}px;width:${Math.abs(g.ex - g.sx)}px;height:${Math.abs(g.ey - g.sy)}px"></div>`);
    }
    if (g && g.guias) g.guias.forEach(([eixo, v, a, b]) => {
        if (eixo === 'x') { const [x, y1] = kbParaTela(v, a), y2 = kbParaTela(v, b)[1]; partes.push(`<i class="kbo-guia" style="left:${x}px;top:${y1}px;width:1px;height:${y2 - y1}px"></i>`); }
        else { const [x1, y] = kbParaTela(a, v), x2 = kbParaTela(b, v)[0]; partes.push(`<i class="kbo-guia" style="left:${x1}px;top:${y}px;width:${x2 - x1}px;height:1px"></i>`); }
    });
    if (g && g.tipo === 'borracha') { const [x, y] = [g.ex, g.ey]; partes.push(`<i class="kbo-borracha" style="left:${x}px;top:${y}px"></i>`); }
    ui.innerHTML = partes.join('');
    kbPintarCtx(ocupado);
    if (KB.show) kbShowMascara();
}
function kbPathTela(d) {   // caminho do mundo → tela (para o contorno da seta selecionada)
    const { x, y, z } = KB.cam; let i = 0;
    return d.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, n => ((i++ % 2 ? +n * z + y : +n * z + x)).toFixed(1));
}

// ───────────── mouse ─────────────
function kbAlvo(e) {
    const t = e.target;
    if (t.closest('#kbo-ui')) return null;
    const el = t.closest('[data-id]'); if (!el || !kbEl('kbo-mundo').contains(el)) return null;
    return { it: kbItem(el.dataset.id), el, nomeFrame: !!t.closest('.kbo-frame-nome'), corpoFrame: !!t.closest('.kbo-frame-corpo'), rotulo: !!el.dataset.rot };
}
function kbGrupo(it) { return it.g ? KB.doc.itens.filter(i => i.g === it.g) : [it]; }
function kbSelecionar(ids, somar) {
    if (!somar) KB.sel.clear();
    ids.forEach(id => KB.sel.add(id));
    kbPintarUi();
    if (typeof kbFramesMarcar === 'function') kbFramesMarcar();
}

function kbDown(e) {
    if (!KB.doc) return;
    if (KB.show) { if (e.button === 0) kbShowIr(1); else if (e.button === 2) kbShowIr(-1); return; }
    if (e.target.isContentEditable || e.target.closest('[contenteditable="true"],[contenteditable="plaintext-only"]')) return;
    kbEl('kbo-vp').focus({ preventScroll: true });
    if (KB.editando) kbSairEdicao();
    kbMenuFechar();
    const [wx, wy] = kbParaMundo(e.clientX, e.clientY);
    const r = kbEl('kbo-vp').getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const base = { pid: e.pointerId, sx, sy, ex: sx, ey: sy, wx, wy, ativo: false, botao: e.button };
    const capturar = () => { try { kbEl('kbo-vp').setPointerCapture(e.pointerId); } catch (er) { /* já solto */ } };
    // pan: botão do meio, direito, espaço ou mão
    if (e.button === 1 || e.button === 2 || (e.button === 0 && (KB.espaco || KB.ferramenta === 'mao'))) {
        e.preventDefault();
        KB.gesto = { ...base, tipo: 'pan', cam: { ...KB.cam }, direita: e.button === 2 };
        capturar(); kbEl('kbo-vp').classList.add('kbo-pan'); return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    const ui = e.target.closest('#kbo-ui [data-h],#kbo-ui [data-ponta],#kbo-ui [data-ancora]');
    if (ui) {
        if (ui.dataset.h) { kbIniciarRedim(base, ui.dataset.h, e.shiftKey); capturar(); return; }
        if (ui.dataset.ponta) { const s = kbSelItens()[0]; KB.gesto = { ...base, tipo: 'pontaSeta', id: s.id, ponta: ui.dataset.ponta, antes: kbSnap(), ativo: true }; capturar(); return; }
        if (ui.dataset.ancora) { const [id, lado] = ui.dataset.ancora.split(':'); KB.gesto = { ...base, tipo: 'seta', de: { id, lado }, ativo: true }; capturar(); kbPintarUi(); return; }
    }
    const alvo = kbAlvo(e), f = KB.ferramenta;
    if (f === 'nota' || f === 'texto') {
        const it = f === 'nota' ? kbNovoItem('nota', { x: wx - 100, y: wy - 100 }) : kbNovoItem('texto', { x: wx, y: wy - 18 });
        kbMudar(() => KB.doc.itens.push(it));
        kbFerramenta('sel'); kbSelecionar([it.id]); kbEditar(it.id, { novo: true });
        return;
    }
    if (f === 'forma' || f === 'frame') { KB.gesto = { ...base, tipo: 'criar', qual: f }; capturar(); return; }
    if (f === 'seta') {
        const de = alvo && alvo.it && !['seta', 'frame'].includes(alvo.it.tipo) ? { id: alvo.it.id, lado: 'auto' } : { x: wx, y: wy };
        KB.gesto = { ...base, tipo: 'seta', de, ativo: true }; capturar(); return;
    }
    if (f === 'caneta') {
        if (KB.caneta.modo === 'borracha') { KB.gesto = { ...base, tipo: 'borracha', ativo: true, apagar: new Set() }; kbApagarEm(wx, wy); capturar(); kbPintarUi(); return; }
        KB.gesto = { ...base, tipo: 'caneta', ativo: true, pts: [wx, wy] }; capturar(); kbRascunhoCaneta(); return;
    }
    // selecionar
    if (alvo && alvo.it) {
        const it = alvo.it;
        if (it.tipo === 'frame' && alvo.corpoFrame && !KB.sel.has(it.id)) {
            KB.gesto = { ...base, tipo: 'marquee', base: e.shiftKey ? new Set(KB.sel) : new Set(), cliqueFrame: it.id };
            if (!e.shiftKey) { KB.sel.clear(); kbPintarUi(); }
            capturar(); return;
        }
        const grupo = kbGrupo(it).map(i => i.id);
        if (e.shiftKey) {
            if (KB.sel.has(it.id)) { grupo.forEach(id => KB.sel.delete(id)); kbPintarUi(); return; }
            kbSelecionar(grupo, true);
        } else if (!KB.sel.has(it.id)) kbSelecionar(grupo);
        KB.gesto = { ...base, tipo: 'mover', alt: e.altKey }; capturar(); kbPintarUi();
        return;
    }
    KB.gesto = { ...base, tipo: 'marquee', base: e.shiftKey ? new Set(KB.sel) : new Set() };
    if (!e.shiftKey && KB.sel.size) { KB.sel.clear(); kbPintarUi(); }
    capturar();
}

function kbMove(e) {
    if (!KB.doc) return;
    const r = kbEl('kbo-vp').getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const [wx, wy] = kbParaMundo(e.clientX, e.clientY);
    KB.mouse = { x: wx, y: wy, dentro: true };
    const g = KB.gesto;
    if (!g) { kbHover(e, sx, sy); return; }
    if (g.pid !== e.pointerId) return;
    const dx = sx - g.ex, dy = sy - g.ey;
    g.ex = sx; g.ey = sy;
    if (!g.ativo && Math.hypot(sx - g.sx, sy - g.sy) < 4) return;
    const primeiro = !g.ativo; g.ativo = true;
    if (g.tipo === 'pan') { KB.cam.x += dx; KB.cam.y += dy; g.moveu = true; kbCamAgendar(); return; }
    if (g.tipo === 'marquee') {
        const a = kbParaMundo(g.sx + r.left, g.sy + r.top), x1 = Math.min(a[0], wx), y1 = Math.min(a[1], wy), x2 = Math.max(a[0], wx), y2 = Math.max(a[1], wy);
        const ids = new Set(g.base);
        KB.doc.itens.forEach(it => {
            const c = kbCaixa(it);
            const dentro = c.x >= x1 && c.y >= y1 && c.x + c.w <= x2 && c.y + c.h <= y2;
            const toca = c.x <= x2 && c.x + c.w >= x1 && c.y <= y2 && c.y + c.h >= y1;
            if (it.tipo === 'frame' ? dentro : toca) kbGrupo(it).forEach(i => ids.add(i.id));
        });
        KB.sel = ids; kbPintarUi(); return;
    }
    if (g.tipo === 'mover') { if (primeiro) kbIniciarMover(g); kbMover(g, wx, wy, e); return; }
    if (g.tipo === 'redim') { kbRedim(g, wx, wy, e.shiftKey); return; }
    if (g.tipo === 'criar') { kbRascunhoCaixa(g, wx, wy, e.shiftKey); return; }
    if (g.tipo === 'caneta') {
        const p = g.pts, lx = p[p.length - 2], ly = p[p.length - 1];
        if (Math.hypot(wx - lx, wy - ly) * KB.cam.z >= 1.5) { p.push(wx, wy); kbRascunhoCaneta(); }
        return;
    }
    if (g.tipo === 'borracha') { kbApagarEm(wx, wy); kbPintarUi(); return; }
    if (g.tipo === 'seta' || g.tipo === 'pontaSeta') { kbSetaArrastar(g, e, wx, wy); return; }
}

function kbUp(e) {
    const g = KB.gesto; if (!g || (e.pointerId != null && g.pid !== e.pointerId)) return;
    KB.gesto = null;
    try { kbEl('kbo-vp').releasePointerCapture(g.pid); } catch (er) { /* já solto */ }
    kbEl('kbo-vp').classList.remove('kbo-pan');
    kbEl('kbo-rascunho').innerHTML = '';
    if (g.tipo === 'pan') { if (g.direita) KB.semMenu = g.moveu; }
    else if (g.tipo === 'marquee') {
        if (!g.ativo && g.cliqueFrame) kbSelecionar([g.cliqueFrame]);
        kbFramesMarcar();
    }
    else if (g.tipo === 'mover') {
        if (g.ativo) { kbRenderTudo(); kbGuardar(g.antes); }
        else if (!e.shiftKey) {   // clique simples num item já selecionado no meio de vários: fica só ele (ou o grupo)
            const alvo = kbAlvo(e);
            if (alvo && alvo.it && KB.sel.size > 1 && !alvo.it.g) kbSelecionar([alvo.it.id]);
        }
    }
    else if (g.tipo === 'redim') { if (g.ativo) { kbRenderTudo(); kbGuardar(g.antes); } }
    else if (g.tipo === 'criar') kbCriarFim(g);
    else if (g.tipo === 'caneta') kbCanetaFim(g);
    else if (g.tipo === 'borracha') {
        if (g.apagar.size) kbMudar(() => { KB.doc.itens = KB.doc.itens.filter(i => !g.apagar.has(i.id)); });
    }
    else if (g.tipo === 'seta') kbSetaFim(g);
    else if (g.tipo === 'pontaSeta') { kbRenderTudo(); kbGuardar(g.antes); }
    KB.hover = null;
    kbPintarUi();
}

function kbHover(e, sx, sy) {
    if (KB.editando || KB.show) return;
    const f = KB.ferramenta;
    if (f !== 'sel' && f !== 'seta') { if (KB.hover) { KB.hover = null; kbPintarUi(); } return; }
    let id = null;
    const alvo = kbAlvo(e);
    if (alvo && alvo.it && !['seta', 'frame', 'caneta'].includes(alvo.it.tipo)) id = alvo.it.id;
    else if (e.target.closest('#kbo-ui [data-ancora]')) id = KB.hover;
    else if (KB.hover) {   // perto da borda do item ainda vale (para alcançar os pontos de ligação)
        const it = kbItem(KB.hover);
        if (it) { const c = kbCaixaTela(it), m = 26; if (sx > c.x - m && sx < c.x + c.w + m && sy > c.y - m && sy < c.y + c.h + m) id = it.id; }
    }
    if (id !== KB.hover) { KB.hover = id; kbPintarUi(); }
}

// ───────────── mover (com guias de alinhamento) ─────────────
function kbIniciarMover(g) {
    g.antes = kbSnap();
    if (g.alt) {   // Alt+arrastar duplica
        const novos = kbCopiarItens(kbSelItens(), 0, 0);
        KB.doc.itens.push(...novos);
        KB.sel = new Set(novos.map(i => i.id));
        kbRenderTudo();
    }
    const sel = kbSelItens().filter(i => !i.lock);
    const mov = new Map(sel.map(i => [i.id, i]));
    // itens dentro dos frames selecionados vão junto
    sel.filter(i => i.tipo === 'frame').forEach(fr => KB.doc.itens.forEach(it => {
        if (mov.has(it.id) || it.lock || it.tipo === 'seta') return;
        const c = kbCaixa(it), cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        if (cx > fr.x && cx < fr.x + fr.w && cy > fr.y && cy < fr.y + fr.h && (it.tipo !== 'frame' || c.w < fr.w)) mov.set(it.id, it);
    }));
    // setas: pontas soltas de setas selecionadas, e setas com as duas pontas em itens que se movem
    KB.doc.itens.forEach(s => {
        if (s.tipo !== 'seta' || s.lock) return;
        if (mov.has(s.id) || (s.a.id && mov.has(s.a.id) && s.b.id && mov.has(s.b.id))) mov.set(s.id, s);
    });
    g.itens = [...mov.values()].map(it => ({ it, x: it.x, y: it.y, a: it.a && !it.a.id ? { ...it.a } : null, b: it.b && !it.b.id ? { ...it.b } : null }));
    const cxs = g.itens.filter(o => o.it.tipo !== 'seta').map(o => kbCaixa(o.it));
    g.caixa = kbUniao(cxs) || { x: g.wx, y: g.wy, w: 0, h: 0 };
    const fora = new Set(mov.keys());
    // linhas candidatas dos itens visíveis
    const vp = kbEl('kbo-vp'), vis = { x: -KB.cam.x / KB.cam.z, y: -KB.cam.y / KB.cam.z, w: vp.clientWidth / KB.cam.z, h: vp.clientHeight / KB.cam.z };
    g.linhas = { x: [], y: [] };
    KB.doc.itens.forEach(it => {
        if (fora.has(it.id) || it.tipo === 'seta' || it.tipo === 'caneta') return;
        const c = kbCaixa(it);
        if (c.x > vis.x + vis.w || c.x + c.w < vis.x || c.y > vis.y + vis.h || c.y + c.h < vis.y) return;
        [c.x, c.x + c.w / 2, c.x + c.w].forEach(v => g.linhas.x.push([v, c.y, c.y + c.h]));
        [c.y, c.y + c.h / 2, c.y + c.h].forEach(v => g.linhas.y.push([v, c.x, c.x + c.w]));
    });
    kbPintarUi();
}
function kbMover(g, wx, wy, e) {
    let dx = wx - g.wx, dy = wy - g.wy;
    g.guias = [];
    if (!e.ctrlKey && g.caixa) {
        const tol = 6 / KB.cam.z, c = g.caixa;
        const px = [c.x + dx, c.x + dx + c.w / 2, c.x + dx + c.w], py = [c.y + dy, c.y + dy + c.h / 2, c.y + dy + c.h];
        let bx = null, by = null;
        g.linhas.x.forEach(([v, a, b]) => px.forEach(p => { const d = v - p; if (Math.abs(d) <= tol && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, v, a, b }; }));
        g.linhas.y.forEach(([v, a, b]) => py.forEach(p => { const d = v - p; if (Math.abs(d) <= tol && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, v, a, b }; }));
        if (bx) { dx += bx.d; g.guias.push(['x', bx.v, Math.min(bx.a, c.y + dy), Math.max(bx.b, c.y + dy + c.h)]); }
        if (by) { dy += by.d; g.guias.push(['y', by.v, Math.min(by.a, c.x + dx), Math.max(by.b, c.x + dx + c.w)]); }
    }
    g.itens.forEach(o => {
        if (o.it.tipo === 'seta') {
            if (o.a) { o.it.a.x = o.a.x + dx; o.it.a.y = o.a.y + dy; }
            if (o.b) { o.it.b.x = o.b.x + dx; o.it.b.y = o.b.y + dy; }
        } else { o.it.x = o.x + dx; o.it.y = o.y + dy; kbAtualizar(o.it); }
    });
    kbRenderSetas();
    kbPintarUi();
}

// ───────────── redimensionar ─────────────
function kbIniciarRedim(base, h, shift) {
    const sel = kbSelItens().filter(i => !i.lock);
    const soltos = sel.filter(i => i.tipo !== 'seta');
    const cx = kbUniao(soltos.map(kbCaixa)); if (!cx) return;
    KB.gesto = { ...base, tipo: 'redim', h, caixa: cx, antes: kbSnap(),
        itens: sel.map(it => ({ it, o: kbClone(it) })), so1: soltos.length === 1 && sel.length === 1 ? soltos[0] : null };
}
function kbRedim(g, wx, wy, shift) {
    const c = g.caixa, h = g.h, min = 16;
    let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
    if (h.includes('w')) x1 = Math.min(wx, x2 - min); if (h.includes('e')) x2 = Math.max(wx, x1 + min);
    if (h.includes('n')) y1 = Math.min(wy, y2 - min); if (h.includes('s')) y2 = Math.max(wy, y1 + min);
    const canto = h.length === 2, so = g.so1;
    const proporcao = canto && (shift !== !!(so ? ['imagem', 'texto', 'caneta'].includes(so.tipo) : true));
    if (proporcao) {
        const k = Math.max((x2 - x1) / c.w, (y2 - y1) / c.h);
        const nw = c.w * k, nh = c.h * k;
        if (h.includes('w')) x1 = x2 - nw; else x2 = x1 + nw;
        if (h.includes('n')) y1 = y2 - nh; else y2 = y1 + nh;
    }
    const sx = (x2 - x1) / c.w, sy = (y2 - y1) / c.h;
    const mapX = v => x1 + (v - c.x) * sx, mapY = v => y1 + (v - c.y) * sy;
    g.itens.forEach(({ it, o }) => {
        if (it.tipo === 'seta') {
            if (!o.a.id) { it.a.x = mapX(o.a.x); it.a.y = mapY(o.a.y); }
            if (!o.b.id) { it.b.x = mapX(o.b.x); it.b.y = mapY(o.b.y); }
            return;
        }
        it.x = mapX(o.x); it.y = mapY(o.y); it.w = Math.max(4, o.w * sx);
        if (it.tipo === 'texto') { if (canto) it.fs = Math.max(6, Math.round((o.fs || 24) * sx * 10) / 10); }
        else it.h = Math.max(4, o.h * sy);
        if (canto && o.fs && it.tipo !== 'texto' && proporcao) it.fs = Math.max(6, Math.round(o.fs * sx));
        kbAtualizar(it);
    });
    kbRenderSetas();
    kbPintarUi();
}

// ───────────── criar forma/frame arrastando ─────────────
function kbRascunhoCaixa(g, wx, wy, shift) {
    let w = wx - g.wx, h = wy - g.wy;
    if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    g.cx = { x: Math.min(g.wx, g.wx + w), y: Math.min(g.wy, g.wy + h), w: Math.abs(w), h: Math.abs(h) };
    const z = KB.cam.z;
    kbEl('kbo-rascunho').innerHTML = g.qual === 'forma'
        ? `<path d="${kbFormaPath(KB.forma, g.cx.w, g.cx.h, 2 / z)}" transform="translate(${g.cx.x} ${g.cx.y})" fill="rgba(255,255,255,.6)" stroke="${veAccSeguro()}" stroke-width="${2 / z}"/>`
        : `<rect x="${g.cx.x}" y="${g.cx.y}" width="${g.cx.w}" height="${g.cx.h}" fill="rgba(255,255,255,.7)" stroke="${veAccSeguro()}" stroke-width="${1.5 / z}"/>`;
}
function kbCriarFim(g) {
    let it;
    if (g.qual === 'forma') {
        const cx = g.ativo && g.cx && g.cx.w > 8 && g.cx.h > 8 ? g.cx : { x: g.wx - 90, y: g.wy - 55, w: 180, h: KB.forma === 'elipse' || KB.forma === 'estrela' ? 180 : 110 };
        if (!g.ativo && (KB.forma === 'elipse' || KB.forma === 'estrela')) cx.y = g.wy - 90;
        it = kbNovoItem('forma', cx);
    } else {
        const pr = KB_FRAMES.find(p => p[0] === (KB.framePreset || '16:9')) || KB_FRAMES[0];
        const n = KB.doc.itens.filter(i => i.tipo === 'frame').length + 1;
        const cx = g.ativo && g.cx && g.cx.w > 20 && g.cx.h > 20 ? g.cx : { x: g.wx - (pr[2] || 1600) / 2, y: g.wy - (pr[3] || 900) / 2, w: pr[2] || 1600, h: pr[3] || 900 };
        it = kbNovoItem('frame', { ...cx, nome: 'Frame ' + n });
    }
    kbMudar(() => { if (it.tipo === 'frame') KB.doc.itens.unshift(it); else KB.doc.itens.push(it); });
    kbFerramenta('sel'); kbSelecionar([it.id]);
    if (it.tipo === 'frame' && it.w * KB.cam.z > kbEl('kbo-vp').clientWidth) kbVoar(kbCamPara(it, 80, 1));
}

// ───────────── caneta e borracha ─────────────
function kbRascunhoCaneta() {
    const g = KB.gesto, c = KB.caneta, p = g.pts;
    let d = `M${p[0]} ${p[1]}`;
    for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
    if (p.length === 2) d += `L${p[0] + .01} ${p[1]}`;
    kbEl('kbo-rascunho').innerHTML = `<path d="${d}" fill="none" stroke="${c.cor}" stroke-width="${c.esp}" stroke-linecap="round" stroke-linejoin="round" opacity="${c.modo === 'marca' ? .38 : 1}"/>`;
}
function kbCanetaFim(g) {
    const p = g.pts; if (p.length < 2) return;
    if (p.length === 2) p.push(p[0] + .01, p[1]);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < p.length; i += 2) { x1 = Math.min(x1, p[i]); x2 = Math.max(x2, p[i]); y1 = Math.min(y1, p[i + 1]); y2 = Math.max(y2, p[i + 1]); }
    const w = Math.max(1, x2 - x1), h = Math.max(1, y2 - y1);
    const rel = p.map((v, i) => Math.round((i % 2 ? v - y1 : v - x1) * 10) / 10);
    const c = KB.caneta;
    const it = kbNovoItem('caneta', { x: x1, y: y1, w, h, w0: w, h0: h, pts: rel, cor: c.cor, esp: c.esp, marca: c.modo === 'marca' });
    kbMudar(() => KB.doc.itens.push(it));
}
function kbApagarEm(wx, wy) {
    const g = KB.gesto, r = 10 / KB.cam.z;
    KB.doc.itens.forEach(it => {
        if (it.tipo !== 'caneta' || g.apagar.has(it.id) || it.lock) return;
        const m = r + (it.esp || 3) / 2;
        if (wx < it.x - m || wx > it.x + it.w + m || wy < it.y - m || wy > it.y + it.h + m) return;
        const sx = it.w / (it.w0 || it.w), sy = it.h / (it.h0 || it.h), p = it.pts;
        for (let i = 0; i < p.length - 2; i += 2) {
            const ax = it.x + p[i] * sx, ay = it.y + p[i + 1] * sy, bx = it.x + p[i + 2] * sx, by = it.y + p[i + 3] * sy;
            if (kbDistSeg(wx, wy, ax, ay, bx, by) <= m) { g.apagar.add(it.id); const el = KB.els.get(it.id); if (el) el.style.opacity = '.15'; break; }
        }
    });
}
function kbDistSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ───────────── setas: criar e religar pontas ─────────────
function kbAlvoSeta(e, excluir) {
    const pilha = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of pilha) {
        const anc = el.closest && el.closest('#kbo-ui [data-ancora]');
        if (anc) { const [id, lado] = anc.dataset.ancora.split(':'); if (id !== excluir) return { id, lado }; }
        const d = el.closest && el.closest('#kbo-mundo [data-id]');
        if (d) { const it = kbItem(d.dataset.id); if (it && it.id !== excluir && !['seta', 'frame', 'caneta'].includes(it.tipo)) return { id: it.id, lado: 'auto' }; }
    }
    return null;
}
function kbSetaArrastar(g, e, wx, wy) {
    const s = g.tipo === 'pontaSeta' ? kbItem(g.id) : null;
    const excluir = s ? (g.ponta === 'a' ? s.b.id : s.a.id) : g.de.id;
    const alvo = kbAlvoSeta(e, excluir);
    // perto de um ponto de ligação do alvo: gruda nele
    let fim = { x: wx, y: wy };
    if (alvo) {
        const it = kbItem(alvo.id); let lado = alvo.lado;
        if (lado === 'auto') {
            let melhor = null;
            ['t', 'r', 'b', 'l'].forEach(k => { const p = kbPontoLado(it, k), d = Math.hypot(p[0] - wx, p[1] - wy) * KB.cam.z; if (d < 22 && (!melhor || d < melhor.d)) melhor = { k, d }; });
            if (melhor) lado = melhor.k;
        }
        fim = { id: alvo.id, lado };
        g.alvo = alvo.id; g.alvoLado = lado;
    } else { g.alvo = null; g.alvoLado = null; }
    KB.hover = alvo ? alvo.id : null;
    g.fim = fim;
    if (s) { s[g.ponta] = fim; kbAtualizar(s); }
    else {
        const tmp = kbNovoItem('seta', { a: g.de, b: fim });
        const geo = kbSetaGeo(tmp);
        kbEl('kbo-rascunho').innerHTML = `<path d="${geo.d}" fill="none" stroke="${tmp.cor}" stroke-width="${tmp.esp}"/><path d="${kbPontaPath('seta', geo.fimB[0], geo.fimB[1], tmp.esp)}" fill="${tmp.cor}"/>`;
    }
    kbPintarUi();
}
function kbSetaFim(g) {
    if (!g.ativo || !g.fim) return;
    const ini = g.de.id ? kbPontoLado(kbItem(g.de.id), g.de.lado === 'auto' ? 't' : g.de.lado) : [g.de.x, g.de.y];
    if (!g.fim.id && !g.de.id && Math.hypot(g.fim.x - ini[0], g.fim.y - ini[1]) * KB.cam.z < 8) return;
    if (g.fim.id && g.fim.id === g.de.id) return;
    const s = kbNovoItem('seta', { a: g.de, b: g.fim, estilo: KB.estiloSeta || 'curva' });
    kbMudar(() => KB.doc.itens.push(s));
    if (KB.ferramenta === 'seta') kbFerramenta('sel');
    kbSelecionar([s.id]);
}

// "+" ao lado de nota/forma: cria a próxima ligada
function kbMaisRapido(lado) {
    const it = kbSelItens()[0]; if (!it) return;
    const gap = 80, d = KB_NORMAL[lado];
    const novo = kbClone(it); novo.id = kbId(); novo.html = ''; delete novo.g; delete novo.lock;
    novo.x = it.x + d[0] * (it.w + gap); novo.y = it.y + d[1] * (it.h + gap);
    // não cair em cima de outro: empurra na direção perpendicular
    for (let i = 0; i < 12 && KB.doc.itens.some(o => o.tipo !== 'seta' && o.tipo !== 'frame' && o.id !== it.id && kbSobrepoe(o, novo)); i++) {
        if (d[0]) novo.y += it.h + 30; else novo.x += it.w + 30;
    }
    const opo = { t: 'b', b: 't', l: 'r', r: 'l' }[lado];
    const s = kbNovoItem('seta', { a: { id: it.id, lado }, b: { id: novo.id, lado: opo }, estilo: KB.estiloSeta || 'curva' });
    kbMudar(() => KB.doc.itens.push(novo, s));
    kbSelecionar([novo.id]); kbEditar(novo.id, { novo: true });
    const c = kbCaixaTela(novo), vp = kbEl('kbo-vp');
    if (c.x < 0 || c.y < 0 || c.x + c.w > vp.clientWidth || c.y + c.h > vp.clientHeight) kbVoar({ z: KB.cam.z, x: vp.clientWidth / 2 - (novo.x + novo.w / 2) * KB.cam.z, y: vp.clientHeight / 2 - (novo.y + novo.h / 2) * KB.cam.z }, 300);
}
const kbSobrepoe = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ───────────── roda do mouse ─────────────
function kbRoda(e) {
    if (!KB.doc || KB.show) { e.preventDefault(); return; }
    if (e.target.closest('[contenteditable="true"]') && !e.ctrlKey) return;
    e.preventDefault();
    const r = kbEl('kbo-vp').getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 33 : e.deltaX;
    const touchpad = e.deltaMode === 0 && (dx !== 0 || !Number.isInteger(dy) || Math.abs(dy) < 40);
    if (e.ctrlKey || (KB.prefs.roda === 'zoom' && !touchpad && !e.shiftKey)) {
        const k = Math.exp(-dy * (e.ctrlKey && touchpad ? .004 : .0007));
        kbZoomRoda(KB.cam.z * k, sx, sy);
    } else {
        if (e.shiftKey && !dx) { KB.cam.x -= dy; } else { KB.cam.x -= dx; KB.cam.y -= dy; }
        kbCamAgendar();
    }
}

// ───────────── duplo clique: editar ou nova nota ─────────────
function kbDuplo(e) {
    if (!KB.doc || KB.show || e.target.closest('#kbo-ui [data-mais]')) return;
    if (e.target.isContentEditable) return;
    const alvo = kbAlvo(e);
    if (alvo && alvo.it) {
        const it = alvo.it;
        if (it.lock) return;
        if (it.tipo === 'frame') { if (alvo.nomeFrame) kbEditar(it.id); return; }
        if (['nota', 'forma', 'texto', 'seta'].includes(it.tipo)) { kbSelecionar([it.id]); kbEditar(it.id, { ponto: [e.clientX, e.clientY] }); }
        return;
    }
    if (KB.ferramenta !== 'sel') return;
    const [wx, wy] = kbParaMundo(e.clientX, e.clientY);
    const it = kbNovoItem('nota', { x: wx - 100, y: wy - 100 });
    kbMudar(() => KB.doc.itens.push(it));
    kbSelecionar([it.id]); kbEditar(it.id, { novo: true });
}

// ───────────── editar texto ─────────────
function kbTxtDe(it) {
    const el = KB.els.get(it.id); if (!el) return null;
    if (it.tipo === 'seta') return el._rot.querySelector('.kbo-txt');
    if (it.tipo === 'frame') return el.querySelector('.kbo-frame-nome');
    return el.querySelector('.kbo-txt');
}
function kbEditar(id, { novo, ponto, inserir } = {}) {
    const it = kbItem(id); if (!it || it.lock) return;
    if (KB.editando && KB.editando !== id) kbSairEdicao();
    const txt = kbTxtDe(it); if (!txt) return;
    KB.editando = id;
    KB.editAntes = novo && KB.hist.length ? KB.hist.pop() : kbSnap();   // recém-criado: criar + escrever = um passo só no desfazer
    const el = KB.els.get(id); el.classList.add('kbo-editando');
    if (it.tipo === 'seta') { el._rot.hidden = false; el._rot.classList.add('kbo-editando'); }
    txt.contentEditable = it.tipo === 'frame' ? 'plaintext-only' : 'true';
    txt.spellcheck = false;
    txt.focus({ preventScroll: true });
    const s = getSelection(), rg = document.createRange();
    let posto = false;
    if (ponto && document.caretRangeFromPoint) {
        const c = document.caretRangeFromPoint(ponto[0], ponto[1]);
        if (c && txt.contains(c.startContainer)) { s.removeAllRanges(); s.addRange(c); posto = true; }
    }
    if (!posto) { rg.selectNodeContents(txt); if (!(it.tipo === 'frame' || (!novo && !inserir && it.tipo === 'texto'))) rg.collapse(false); s.removeAllRanges(); s.addRange(rg); }
    if (inserir) document.execCommand('insertText', false, inserir);
    txt.oninput = () => {
        if (it.tipo === 'nota' || it.tipo === 'forma') kbAjustarFonte(txt, it, el.querySelector('.kbo-caixa'));
        if (it.tipo === 'texto') { it.h = el.offsetHeight; }
        kbPintarUi();
    };
    txt.onkeydown = ev => {
        ev.stopPropagation();
        if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); kbSairEdicao(); kbEl('kbo-vp').focus(); }
        else if (ev.key === 'Enter' && it.tipo === 'frame') { ev.preventDefault(); kbSairEdicao(); }
        else if (ev.key === 'Tab' && it.tipo === 'nota') { ev.preventDefault(); kbProximaNota(it, ev.shiftKey); }
    };
    txt.onpaste = ev => { ev.preventDefault(); ev.stopPropagation(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain')); };
    txt.onblur = () => setTimeout(() => { if (KB.editando === id && document.activeElement !== txt && !document.activeElement.closest('#kbo-ctx,#kbo-pop')) kbSairEdicao(); }, 0);
    kbPintarUi();
}
function kbSairEdicao(semGuardar) {
    const id = KB.editando; if (!id) return;
    KB.editando = null;
    const it = kbItem(id), el = KB.els.get(id);
    if (el) { el.classList.remove('kbo-editando'); if (el._rot) el._rot.classList.remove('kbo-editando'); }
    if (!it) return;
    const txt = kbTxtDe(it);
    if (txt) {
        txt.contentEditable = 'false'; txt.oninput = txt.onkeydown = txt.onblur = txt.onpaste = null;
        if (it.tipo === 'frame') it.nome = (txt.textContent || '').trim() || 'Frame';
        else if (it.tipo === 'seta') it.rotulo = kbLimparHtml(txt.innerHTML).replace(/^(<br>|\s)+|(<br>|\s)+$/g, '');
        else it.html = kbLimparHtml(txt.innerHTML);
    }
    if (it.tipo === 'texto' && !kbTextoPuro(it.html).trim()) { KB.doc.itens = KB.doc.itens.filter(i => i !== it); KB.sel.delete(id); }
    if (el) el._sig = '';
    try { getSelection().removeAllRanges(); } catch (e) { /* nada */ }
    kbRenderTudo();
    if (KB.editAntes) kbGuardar(KB.editAntes);
    KB.editAntes = null;
    if (typeof kbFramesLista === 'function' && it.tipo === 'frame') kbFramesLista();
}
function kbProximaNota(it, antes) {
    kbSairEdicao();
    const novo = kbClone(it); novo.id = kbId(); novo.html = ''; delete novo.g; delete novo.lock; delete novo.fs;
    novo.x = it.x + (antes ? -(it.w + 24) : it.w + 24);
    kbMudar(() => KB.doc.itens.push(novo));
    kbSelecionar([novo.id]); kbEditar(novo.id, { novo: true });
}

// ───────────── barra de contexto (sobre a seleção) ─────────────
function kbPintarCtx(ocupado) {
    const ctx = kbEl('kbo-ctx'); if (!ctx) return;
    const sel = kbSelItens();
    if (!sel.length || ocupado || KB.show) { ctx.hidden = true; KB.ctxSig = ''; return; }
    const sig = JSON.stringify(sel.slice(0, 40).map(i => [i.id, i.tipo, i.cor, i.preench, i.borda, i.esp, i.fs, i.forma, i.alinhar, i.lock, i.estilo, i.pontaA, i.pontaB, i.tracejado, i.negrito, i.italico, i.sublinhado, i.riscado, i.corTexto, i.g])) + sel.length + KB.editando;
    if (sig !== KB.ctxSig) { KB.ctxSig = sig; ctx.innerHTML = kbCtxHtml(sel); }
    ctx.hidden = false;
    const soltos = sel.filter(i => i.tipo !== 'seta');
    const cxm = kbUniao(sel.map(kbCaixa)); if (!cxm) { ctx.hidden = true; return; }
    const c = kbCaixaTela(soltos.length ? kbUniao(soltos.map(kbCaixa)) : cxm), vp = kbEl('kbo-vp');
    const W = ctx.offsetWidth, H = ctx.offsetHeight;
    let x = c.x + c.w / 2 - W / 2, y = c.y - H - 18;
    if (y < 64) y = c.y + c.h + 18;
    if (y + H > vp.clientHeight - 60) y = Math.max(64, Math.min(vp.clientHeight - H - 60, c.y + 10));
    x = Math.max(70, Math.min(vp.clientWidth - W - 10, x));
    ctx.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
}
function kbCtxHtml(sel) {
    const tipos = new Set(sel.map(i => i.tipo)), um = sel.length === 1 ? sel[0] : null, b = [];
    const travado = sel.every(i => i.lock);
    const bt = (c, conteudo, tit, on) => `<button class="kbo-cb${on ? ' on' : ''}" data-c="${c}" title="${tit}">${conteudo}</button>`;
    const bola = cor => `<i class="kbo-bola" style="--c:${cor || 'transparent'}"></i>`;
    if (travado) {
        b.push(bt('trava', kbSvg('destrava') + '<span>Destravar</span>', 'Destravar (Ctrl+Shift+L)'));
        return b.join('');
    }
    const p = sel[0];
    if (tipos.size === 1 && tipos.has('nota')) {
        b.push(bt('cor', bola(p.cor), 'Cor da nota'));
        b.push(bt('fonte', `<span class="kbo-cb-t">${p.fs ? p.fs : 'Auto'}</span>`, 'Tamanho do texto'));
        b.push(bt('negrito', '<b>B</b>', 'Negrito (Ctrl+B)', p.negrito)); b.push(bt('alinhar', kbSvg('alinhar'), 'Alinhamento'));
    } else if (tipos.size === 1 && tipos.has('forma')) {
        b.push(bt('formaTipo', `<svg class="kbo-i" viewBox="0 0 30 22"><path d="${kbFormaPath(p.forma, 30, 22, 1.8)}" fill="none" stroke="currentColor"/></svg>`, 'Trocar forma'));
        b.push(bt('cor', bola(p.preench), 'Preenchimento'));
        b.push(bt('borda', `<i class="kbo-bola kbo-bola-borda" style="--c:${+p.esp ? p.borda : 'transparent'}"></i>`, 'Borda'));
        b.push(bt('corTexto', `<span class="kbo-cb-a" style="--c:${p.corTexto}">A</span>`, 'Cor do texto'));
        b.push(bt('fonte', `<span class="kbo-cb-t">${p.fs ? p.fs : 'Auto'}</span>`, 'Tamanho do texto'));
        b.push(bt('negrito', '<b>B</b>', 'Negrito', p.negrito)); b.push(bt('alinhar', kbSvg('alinhar'), 'Alinhamento'));
    } else if (tipos.size === 1 && tipos.has('texto')) {
        b.push(bt('fonte', `<span class="kbo-cb-t">${Math.round(p.fs || 24)}</span>`, 'Tamanho do texto'));
        b.push(bt('cor', `<span class="kbo-cb-a" style="--c:${p.cor}">A</span>`, 'Cor do texto'));
        b.push(bt('negrito', '<b>B</b>', 'Negrito (Ctrl+B)', p.negrito)); b.push(bt('italico', '<i>I</i>', 'Itálico (Ctrl+I)', p.italico));
        b.push(bt('sublinhado', '<u>U</u>', 'Sublinhado (Ctrl+U)', p.sublinhado)); b.push(bt('riscado', '<s>S</s>', 'Riscado', p.riscado));
        b.push(bt('alinhar', kbSvg('alinhar'), 'Alinhamento'));
    } else if (tipos.size === 1 && tipos.has('seta')) {
        b.push(bt('estilo', `<span class="kbo-cb-t">${{ curva: 'Curva', reta: 'Reta', cotovelo: 'Cotovelo' }[p.estilo] || 'Curva'}</span>`, 'Tipo de linha'));
        b.push(bt('pontas', `<span class="kbo-cb-t">${p.pontaA !== 'nada' ? '◂' : '—'}—${p.pontaB !== 'nada' ? '▸' : '—'}</span>`, 'Pontas'));
        b.push(bt('cor', bola(p.cor), 'Cor')); b.push(bt('esp', `<span class="kbo-cb-t">${p.esp}px</span>`, 'Espessura'));
        b.push(bt('tracejado', '<span class="kbo-cb-t">┄</span>', 'Tracejada', p.tracejado));
        if (um) b.push(bt('rotulo', '<span class="kbo-cb-t">Aa</span>', 'Texto na seta (duplo clique)'));
    } else if (tipos.size === 1 && tipos.has('caneta')) {
        b.push(bt('cor', bola(p.cor), 'Cor')); b.push(bt('esp', `<span class="kbo-cb-t">${p.esp}px</span>`, 'Espessura'));
    } else if (tipos.size === 1 && tipos.has('frame')) {
        if (um) b.push(bt('nomeFrame', `<span class="kbo-cb-t kbo-cb-nome">${kbEsc(p.nome)}</span>`, 'Renomear'));
        b.push(bt('cor', bola(p.cor), 'Cor do fundo do frame'));
        if (um) b.push(bt('tamFrame', '<span class="kbo-cb-t">Tamanho</span>', 'Tamanho do frame'));
    } else if (tipos.size === 1 && tipos.has('imagem')) {
        if (um) b.push(bt('tamReal', '<span class="kbo-cb-t">Tamanho original</span>', 'Voltar ao tamanho original da imagem'));
    } else if (![...tipos].every(t => t === 'imagem')) {
        b.push(bt('cor', bola(p.cor || p.preench), 'Cor'));
    }
    if (b.length) b.push('<i class="kbo-sep-v"></i>');
    if (sel.length > 1) b.push(bt('agrupar', `<span class="kbo-cb-t">${sel.every(i => i.g && i.g === p.g) ? 'Desagrupar' : 'Agrupar'}</span>`, 'Agrupar (Ctrl+G) / Desagrupar (Ctrl+Shift+G)'));
    b.push(bt('frente', kbSvg('frente'), 'Trazer para frente (Ctrl+])'));
    b.push(bt('tras', kbSvg('tras'), 'Enviar para trás (Ctrl+[)'));
    b.push(bt('trava', kbSvg('trava'), 'Travar (Ctrl+Shift+L)'));
    b.push(bt('duplicar', kbSvg('duplicar'), 'Duplicar (Ctrl+D)'));
    b.push(bt('apagar', kbSvg('lixo'), 'Apagar (Delete)'));
    return b.join('');
}
function kbAplicarSel(fn, filtro) { kbMudar(() => kbSelItens().filter(i => !filtro || filtro(i)).forEach(fn)); }
function kbPaleta(cores, atual, extra = '') {
    return `<div class="kbo-cores">${cores.map(c => `<button data-p="${c}" class="${(atual || '').toLowerCase() === c.toLowerCase() ? 'on' : ''}" style="--c:${c}"></button>`).join('')}</div>
        <label class="kbo-cor-livre">Outra cor <input type="color" value="${/^#[0-9a-f]{6}$/i.test(atual || '') ? atual : '#888888'}" data-livre></label>${extra}`;
}
function kbCtxAcao(c, btn) {
    const sel = kbSelItens(); if (!sel.length) return;
    const p = sel[0], tipos = new Set(sel.map(i => i.tipo));
    const corCampo = it => ({ nota: 'cor', forma: 'preench', texto: 'cor', caneta: 'cor', seta: 'cor', frame: 'cor' }[it.tipo]);
    if (c === 'cor') {
        const lista = tipos.size === 1 && tipos.has('nota') ? KB_CORES_NOTA
            : tipos.size === 1 && tipos.has('frame') ? ['#ffffff', '#f8f9fa', '#fff9db', '#fff4e6', '#ffe3e3', '#f3f0ff', '#e7f5ff', '#e6fcf5', '#ebfbee', '#212529', '#343a40', '#1b1b1e']
                : tipos.size === 1 && tipos.has('forma') ? ['transparent', ...KB_CORES, ...KB_CORES_NOTA.slice(0, 8)] : KB_CORES;
        const atual = p[corCampo(p)];
        kbPop(btn, kbPaleta(lista, atual), v => { kbAplicarSel(it => { const k = corCampo(it); if (k) it[k] = v === 'transparent' ? 'none' : v; if (it.tipo === 'nota') { KB.corNota = v; kbPref('nota', v); kbEl('kbo-fe-cor').style.background = v; } }); });
    } else if (c === 'corTexto') kbPop(btn, kbPaleta(KB_CORES, p.corTexto), v => kbAplicarSel(it => { it.corTexto = v; }, i => i.tipo === 'forma'));
    else if (c === 'borda') {
        kbPop(btn, kbPaleta(KB_CORES, p.borda, `<div class="kbo-esps">${[0, 1, 2, 4, 6, 10].map(w => `<button data-p="esp:${w}" class="${+p.esp === w ? 'on' : ''}">${w ? `<i style="width:16px;height:${Math.max(1, w)}px;border-radius:1px"></i>` : '∅'}</button>`).join('')}</div>
            <label class="kbo-chk"><input type="checkbox" data-p="tracejado" ${p.tracejado ? 'checked' : ''}> Borda tracejada</label>`), v => {
            if (v.startsWith('esp:')) kbAplicarSel(it => { it.esp = +v.slice(4); }, i => i.tipo === 'forma');
            else if (v === 'tracejado') kbAplicarSel(it => { it.tracejado = !it.tracejado; }, i => i.tipo === 'forma');
            else kbAplicarSel(it => { it.borda = v; if (!+it.esp) it.esp = 2; }, i => i.tipo === 'forma');
            kbPopReabrir(btn, c);
        });
    } else if (c === 'fonte') {
        const auto = tipos.has('nota') || tipos.has('forma');
        kbPop(btn, `<div class="kbo-lista-pop kbo-lista-num">${auto ? `<button data-p="0" class="${!p.fs ? 'on' : ''}">Automático</button>` : ''}
            ${[10, 12, 14, 18, 24, 32, 40, 48, 64, 80, 96, 128].map(n => `<button data-p="${n}" class="${Math.round(p.fs) === n ? 'on' : ''}">${n}</button>`).join('')}</div>`,
            v => { kbAplicarSel(it => { if (['nota', 'forma', 'texto'].includes(it.tipo)) { if (+v) it.fs = +v; else if (it.tipo !== 'texto') delete it.fs; } }); kbPopFechar(); });
    } else if (['negrito', 'italico', 'sublinhado', 'riscado'].includes(c)) {
        if (KB.editando) { document.execCommand({ negrito: 'bold', italico: 'italic', sublinhado: 'underline', riscado: 'strikeThrough' }[c]); return; }
        const v = !p[c]; kbAplicarSel(it => { if (['nota', 'forma', 'texto'].includes(it.tipo)) it[c] = v; });
    } else if (c === 'alinhar') {
        const prox = { left: 'center', center: 'right', right: 'left' }[p.alinhar || (p.tipo === 'texto' ? 'left' : 'center')];
        kbAplicarSel(it => { if (['nota', 'forma', 'texto'].includes(it.tipo)) it.alinhar = prox; });
    } else if (c === 'formaTipo') {
        kbPop(btn, `<div class="kbo-formas">${KB_FORMAS.map(([k, n]) => `<button data-p="${k}" class="${k === p.forma ? 'on' : ''}" title="${n}"><svg viewBox="0 0 30 22"><path d="${kbFormaPath(k, 30, 22, 1.6)}"/></svg></button>`).join('')}</div>`,
            v => { kbAplicarSel(it => { it.forma = v; }, i => i.tipo === 'forma'); KB.forma = v; kbPopFechar(); });
    } else if (c === 'estilo') {
        kbPop(btn, `<div class="kbo-lista-pop">${[['curva', 'Curva'], ['reta', 'Reta'], ['cotovelo', 'Cotovelo']].map(([k, n]) => `<button data-p="${k}" class="${p.estilo === k ? 'on' : ''}">${n}</button>`).join('')}</div>`,
            v => { kbAplicarSel(it => { it.estilo = v; }, i => i.tipo === 'seta'); KB.estiloSeta = v; kbPopFechar(); });
    } else if (c === 'pontas') {
        const ops = [['nada', 'Nada'], ['seta', 'Seta'], ['linha', 'Seta aberta'], ['circulo', 'Bolinha']];
        kbPop(btn, `<div class="kbo-pop-col"><div class="kbo-fly-tit">Início</div><div class="kbo-lista-pop">${ops.map(([k, n]) => `<button data-p="a:${k}" class="${p.pontaA === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
            <div class="kbo-pop-col"><div class="kbo-fly-tit">Fim</div><div class="kbo-lista-pop">${ops.map(([k, n]) => `<button data-p="b:${k}" class="${p.pontaB === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
            <button class="kbo-pop-larga" data-p="inverter">⇄ Inverter direção</button>`, v => {
            if (v === 'inverter') kbAplicarSel(it => { [it.a, it.b] = [it.b, it.a]; }, i => i.tipo === 'seta');
            else { const [k, t] = v.split(':'); kbAplicarSel(it => { it[k === 'a' ? 'pontaA' : 'pontaB'] = t; }, i => i.tipo === 'seta'); }
            kbPopReabrir(btn, c);
        });
    } else if (c === 'esp') {
        kbPop(btn, `<div class="kbo-esps">${[1, 2, 3, 5, 8, 12, 20].map(w => `<button data-p="${w}" class="${+p.esp === w ? 'on' : ''}"><i style="width:${Math.min(w, 16)}px;height:${Math.min(w, 16)}px"></i></button>`).join('')}</div>`,
            v => { kbAplicarSel(it => { it.esp = +v; }, i => i.tipo === 'seta' || i.tipo === 'caneta'); kbPopFechar(); });
    } else if (c === 'tracejado') kbAplicarSel(it => { it.tracejado = !p.tracejado; }, i => i.tipo === 'seta');
    else if (c === 'rotulo' || c === 'nomeFrame') kbEditar(p.id);
    else if (c === 'tamFrame') {
        kbPop(btn, `<div class="kbo-lista-pop">${KB_FRAMES.filter(f => f[2]).map(([k, n, w, h]) => `<button data-p="${w}x${h}">${n}<small>${w}×${h}</small></button>`).join('')}</div>`,
            v => { const [w, h] = v.split('x').map(Number); kbAplicarSel(it => { it.w = w; it.h = h; }, i => i.tipo === 'frame'); kbPopFechar(); });
    } else if (c === 'tamReal') {
        const im = kbImg(p.src);
        if (im && im.naturalWidth) kbMudar(() => { p.w = im.naturalWidth; p.h = im.naturalHeight; });
    }
    else if (c === 'agrupar') kbAgrupar(!(sel.every(i => i.g && i.g === p.g)));
    else if (c === 'frente') kbOrdem(1);
    else if (c === 'tras') kbOrdem(-1);
    else if (c === 'trava') kbTravar();
    else if (c === 'duplicar') kbDuplicar();
    else if (c === 'apagar') kbApagarSel();
}

// popover genérico
function kbPop(btn, html, aoEscolher, lado) {
    const pop = kbEl('kbo-pop'); if (!pop) return;
    if (!pop.hidden && pop._de === btn && !pop._reabrir) { kbPopFechar(); return; }
    pop._reabrir = false;
    pop.innerHTML = html; pop.hidden = false; pop._de = btn;
    const r = btn.getBoundingClientRect(), base = kbEl('kbo-editor').getBoundingClientRect();
    const W = pop.offsetWidth, H = pop.offsetHeight;
    let x = r.left - base.left + r.width / 2 - W / 2, y = lado === 'cima' ? r.top - base.top - H - 8 : r.bottom - base.top + 8;
    if (y + H > base.height - 8) y = r.top - base.top - H - 8;
    x = Math.max(8, Math.min(base.width - W - 8, x)); y = Math.max(8, y);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    pop.onclick = e => { const b = e.target.closest('[data-p]'); if (b && b.type !== 'checkbox') aoEscolher(b.dataset.p); };
    pop.onchange = e => { if (e.target.dataset.livre !== undefined) aoEscolher(e.target.value); else if (e.target.dataset.p) aoEscolher(e.target.dataset.p); };
}
function kbPopReabrir(btn, c) {
    setTimeout(() => {
        const pop = kbEl('kbo-pop'); pop._reabrir = true;
        const novo = document.querySelector(`#kbo-ctx [data-c="${c}"]`);
        if (novo) kbCtxAcao(c, novo); else kbPopFechar();
    }, 0);
}
function kbPopFechar() { const p = kbEl('kbo-pop'); if (p) { p.hidden = true; p._de = null; } }

// ───────────── ações de edição ─────────────
function kbApagarSel() {
    const ids = new Set([...KB.sel].filter(id => { const i = kbItem(id); return i && !i.lock; }));
    if (!ids.size) return;
    kbMudar(() => {
        KB.doc.itens = KB.doc.itens.filter(i => !ids.has(i.id) && !(i.tipo === 'seta' && ((i.a.id && ids.has(i.a.id)) || (i.b.id && ids.has(i.b.id)))));
        KB.sel.clear();
    });
}
function kbOrdem(dir) {
    const ids = new Set(KB.sel);
    kbMudar(() => {
        const sel = KB.doc.itens.filter(i => ids.has(i.id)), resto = KB.doc.itens.filter(i => !ids.has(i.id));
        KB.doc.itens = dir > 0 ? [...resto, ...sel] : [...sel, ...resto];
    });
}
function kbTravar() {
    const sel = kbSelItens(), v = !sel.every(i => i.lock);
    kbMudar(() => sel.forEach(i => { if (v) i.lock = true; else delete i.lock; }));
}
function kbAgrupar(juntar) {
    const sel = kbSelItens(); if (sel.length < 2 && juntar) return;
    const g = 'g' + kbId();
    kbMudar(() => sel.forEach(i => { if (juntar) i.g = g; else delete i.g; }));
}
// cópia com ids novos (setas religadas entre as cópias; ponta presa fora da cópia vira ponto solto)
function kbCopiarItens(itens, dx, dy) {
    const mapa = {}, grupos = {};
    itens.forEach(i => { mapa[i.id] = kbId(); });
    const fora = id => !mapa[id];
    return itens.map(i => {
        const n = kbClone(i); n.id = mapa[i.id];
        if (n.g) n.g = grupos[n.g] = grupos[n.g] || 'g' + kbId();
        delete n.lock;
        if (n.tipo === 'seta') {
            ['a', 'b'].forEach(k => {
                const e = n[k];
                if (e.id && !fora(e.id)) e.id = mapa[e.id];
                else if (e.id) { const orig = kbItem(e.id); const pt = orig ? kbPontoLado(orig, e.lado && e.lado !== 'auto' ? e.lado : kbLadoAuto(orig, kbCentroPonta(i[k === 'a' ? 'b' : 'a']))) : [0, 0]; n[k] = { x: pt[0] + dx, y: pt[1] + dy }; }
                else { e.x += dx; e.y += dy; }
            });
        } else { n.x += dx; n.y += dy; }
        return n;
    });
}
function kbDuplicar() {
    const sel = kbSelItens(); if (!sel.length) return;
    const novos = kbCopiarItens(sel, 24, 24);
    kbMudar(() => KB.doc.itens.push(...novos));
    kbSelecionar(novos.map(i => i.id));
}
function kbNudge(dx, dy) {
    const sel = kbSelItens().filter(i => !i.lock); if (!sel.length) return;
    if (!KB.nudgeAntes) KB.nudgeAntes = kbSnap();
    sel.forEach(it => { if (it.tipo === 'seta') { ['a', 'b'].forEach(k => { if (!it[k].id) { it[k].x += dx; it[k].y += dy; } }); } else { it.x += dx; it.y += dy; } });
    kbRenderTudo();
    clearTimeout(KB.nudgeT); KB.nudgeT = setTimeout(() => { kbGuardar(KB.nudgeAntes); KB.nudgeAntes = null; }, 500);
}

// ───────────── copiar / colar / arrastar arquivos ─────────────
function kbAtivo() {
    const pg = kbEl('page-kaniboard');
    return !!(pg && pg.classList.contains('active') && KB.doc && !kbEl('kbo-editor').hidden);
}
function kbPontoColar() {
    if (KB.mouse.dentro) return [KB.mouse.x, KB.mouse.y];
    const vp = kbEl('kbo-vp'); return kbParaMundo(vp.getBoundingClientRect().left + vp.clientWidth / 2, vp.getBoundingClientRect().top + vp.clientHeight / 2);
}
document.addEventListener('copy', e => kbCopiar(e, false));
document.addEventListener('cut', e => kbCopiar(e, true));
function kbCopiar(e, cortar) {
    if (!kbAtivo() || KB.editando || e.target.closest('input,textarea,[contenteditable="true"]')) return;
    const sel = kbSelItens(); if (!sel.length) return;
    e.preventDefault();
    const dados = JSON.stringify({ kaniboard: 1, itens: sel, midia: KB.midiaUrl, bid: KB.bid });
    KB.clip = dados;
    const texto = sel.map(i => kbTextoPuro(i.html || i.rotulo || '')).filter(Boolean).join('\n\n') || ' ';
    KB.clipTexto = texto;
    e.clipboardData.setData('text/plain', texto);
    try { e.clipboardData.setData('application/x-kaniboard', dados); } catch (er) { /* sem formato próprio */ }
    if (cortar) kbApagarSel();
}
document.addEventListener('paste', e => {
    if (!kbAtivo() || KB.editando || e.target.closest('input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]')) return;
    e.preventDefault();
    const cd = e.clipboardData;
    let dados = ''; try { dados = cd.getData('application/x-kaniboard'); } catch (er) { /* nada */ }
    const texto = cd.getData('text/plain');
    if (!dados && KB.clip && texto === KB.clipTexto) dados = KB.clip;
    if (dados) { try { return kbColarItens(JSON.parse(dados)); } catch (er) { /* segue */ } }
    const arquivos = [...(cd.files || [])].filter(f => f.type.startsWith('image/'));
    if (arquivos.length) { kbInserirArquivos(arquivos, kbPontoColar()); return; }
    if (texto && texto.trim()) {
        const [x, y] = kbPontoColar();
        const linhas = texto.trim().split(/\r?\n/);
        const html = linhas.map(l => kbEsc(l)).join('<br>');
        const it = kbNovoItem('texto', { x, y, html, w: Math.min(600, Math.max(160, Math.max(...linhas.map(l => l.length)) * 12)) });
        kbMudar(() => KB.doc.itens.push(it)); kbSelecionar([it.id]);
    }
});
async function kbColarItens(d) {
    const itens = d.itens || []; if (!itens.length) return;
    // imagens vindas de outro quadro: copia o arquivo para este
    if (d.bid && d.bid !== KB.bid) {
        for (const it of itens) if (it.tipo === 'imagem' && it.src && it.src.startsWith('midia/')) {
            try {
                const resp = await fetch(d.midia + encodeURIComponent(it.src.slice(6))); const blob = await resp.blob();
                const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
                const res = await kbApi().kb_midia(KB.bid, url, it.src.slice(6)); if (res && res.success) it.src = res.src;
            } catch (er) { console.warn('[KaniBoard] imagem não veio', er); }
        }
    }
    const cx = kbUniao(itens.filter(i => i.tipo !== 'seta').map(i => ({ x: i.x, y: i.y, w: i.w, h: i.h }))) || { x: 0, y: 0, w: 0, h: 0 };
    const [px, py] = kbPontoColar();
    let dx = px - (cx.x + cx.w / 2), dy = py - (cx.y + cx.h / 2);
    if (!KB.mouse.dentro && d.bid === KB.bid) { dx = 24; dy = 24; }
    const novos = kbCopiarItens(itens, dx, dy);
    kbMudar(() => KB.doc.itens.push(...novos));
    kbSelecionar(novos.map(i => i.id));
}
function kbSoltar(e) {
    if (!KB.doc) return;
    const arquivos = [...(e.dataTransfer.files || [])].filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(f.name));
    if (!arquivos.length) return;
    e.preventDefault();
    kbInserirArquivos(arquivos, kbParaMundo(e.clientX, e.clientY));
}
async function kbInserirArquivos(arquivos, [x, y]) {
    const novos = [];
    for (const f of arquivos.slice(0, 30)) {
        const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(''); fr.readAsDataURL(f); });
        if (!url) continue;
        const res = await kbApi().kb_midia(KB.bid, url, f.name || 'colado');
        if (!res || !res.success) { kbToast('Imagem não entrou: ' + ((res && res.error) || ''), 'erro'); continue; }
        const it = await kbItemImagem(res.src, x, y);
        novos.push(it); x += it.w + 24;
    }
    if (novos.length) { kbMudar(() => KB.doc.itens.push(...novos)); kbSelecionar(novos.map(i => i.id)); }
}
async function kbItemImagem(src, x, y) {
    const im = kbImg(src);
    await new Promise(r => { if (im.complete && im.naturalWidth) r(); else { im.onload = im.onerror = r; setTimeout(r, 4000); } });
    const vp = kbEl('kbo-vp'), maxW = Math.max(200, vp.clientWidth / KB.cam.z * .45);
    let w = im.naturalWidth || 400, h = im.naturalHeight || 300;
    if (w > maxW) { h = h * maxW / w; w = maxW; }
    return kbNovoItem('imagem', { src, x: x - w / 2, y: y - h / 2, w: Math.round(w), h: Math.round(h) });
}
async function kbImagemArquivo() {
    const a = kbApi(); if (!a || !KB.bid) return;
    const r = await a.kb_midia_arquivo(KB.bid, '');
    if (!r || !r.success) { if (r && !r.cancelado) kbToast('Imagem não entrou: ' + (r.error || ''), 'erro'); return; }
    const vp = kbEl('kbo-vp'), b = vp.getBoundingClientRect();
    const [x, y] = kbParaMundo(b.left + vp.clientWidth / 2, b.top + vp.clientHeight / 2);
    const it = await kbItemImagem(r.src, x, y);
    kbMudar(() => KB.doc.itens.push(it)); kbSelecionar([it.id]);
}

// ───────────── teclado ─────────────
document.addEventListener('keydown', e => {
    if (!kbAtivo()) return;
    if (KB.show) { kbShowTecla(e); return; }
    const alvo = e.target, k = e.key, kl = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (alvo.closest && (alvo.closest('input,textarea,select') || alvo.isContentEditable)) return;
    if (document.querySelector('#app-confirm:not([hidden])')) return;
    const feito = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === ' ' && !e.repeat) { KB.espaco = true; kbEl('kbo-vp').classList.add('kbo-espaco'); feito(); return; }
    if (k === ' ') { feito(); return; }
    if (ctrl && kl === 'z') { feito(); kbDesfazer(e.shiftKey); return; }
    if (ctrl && kl === 'y') { feito(); kbDesfazer(true); return; }
    if (ctrl && kl === 'a') { feito(); kbSelecionar(KB.doc.itens.map(i => i.id)); return; }
    if (ctrl && kl === 'd') { feito(); kbDuplicar(); return; }
    if (ctrl && kl === 'g') { feito(); kbAgrupar(!e.shiftKey); return; }
    if (ctrl && e.shiftKey && kl === 'l') { feito(); kbTravar(); return; }
    if (ctrl && (k === ']' || k === '}')) { feito(); kbOrdem(1); return; }
    if (ctrl && (k === '[' || k === '{')) { feito(); kbOrdem(-1); return; }
    if (k === 'PageUp') { feito(); kbOrdem(1); return; }
    if (k === 'PageDown') { feito(); kbOrdem(-1); return; }
    if (ctrl && (k === '=' || k === '+')) { feito(); kbZoomEm(KB.cam.z * 1.25); return; }
    if (ctrl && k === '-') { feito(); kbZoomEm(KB.cam.z / 1.25); return; }
    if (ctrl && k === '0') { feito(); kbZoomEm(1); return; }
    if (e.shiftKey && (e.code === 'Digit1')) { feito(); kbAjustarTudo(); return; }
    if (e.shiftKey && (e.code === 'Digit2')) { feito(); kbIrSelecao(); return; }
    if (k === 'Delete' || k === 'Backspace') { feito(); kbApagarSel(); return; }
    if (k === 'Escape') {
        feito();
        if (KB.gesto) { const g = KB.gesto; KB.gesto = null; kbEl('kbo-rascunho').innerHTML = ''; if (g.antes) { KB.doc.itens = JSON.parse(g.antes); KB.els.forEach(el => { el._sig = ''; }); kbRenderTudo(); } kbPintarUi(); return; }
        if (!kbEl('kbo-pop').hidden) { kbPopFechar(); return; }
        if (KB.ferramenta !== 'sel') { kbFerramenta('sel'); return; }
        KB.sel.clear(); kbPintarUi(); return;
    }
    if (k.startsWith('Arrow') && KB.sel.size) {
        feito(); const p = (e.shiftKey ? 20 : 2) / KB.cam.z;
        kbNudge(k === 'ArrowLeft' ? -p : k === 'ArrowRight' ? p : 0, k === 'ArrowUp' ? -p : k === 'ArrowDown' ? p : 0); return;
    }
    if (ctrl || e.altKey) return;
    const um = KB.sel.size === 1 ? kbSelItens()[0] : null;
    if (k === 'Enter' && um && ['nota', 'forma', 'texto', 'frame'].includes(um.tipo)) { feito(); kbEditar(um.id); return; }
    // digitar com uma nota/forma/texto selecionada começa a escrever nela (como no Miro)
    if (k.length === 1 && um && ['nota', 'forma', 'texto'].includes(um.tipo) && !um.lock && /\S/.test(k) && !e.repeat && KB.digitarDireto !== false) {
        feito(); kbEditar(um.id, { inserir: k }); return;
    }
    const atalhos = { v: 'sel', h: 'mao', n: 'nota', t: 'texto', s: 'forma', r: 'forma', o: 'forma', l: 'seta', p: 'caneta', f: 'frame', e: 'caneta' };
    if (atalhos[kl]) {
        feito();
        if (kl === 'e') KB.caneta.modo = 'borracha'; else if (kl === 'p' && KB.caneta.modo === 'borracha') KB.caneta.modo = 'caneta';
        if (kl === 'r') KB.forma = 'ret'; if (kl === 'o') KB.forma = 'elipse';
        kbFerramenta(atalhos[kl]);
    }
});
document.addEventListener('keyup', e => { if (e.key === ' ' && KB.espaco) { KB.espaco = false; const vp = kbEl('kbo-vp'); if (vp) vp.classList.remove('kbo-espaco'); } });
window.addEventListener('blur', () => { KB.espaco = false; const vp = kbEl('kbo-vp'); if (vp) vp.classList.remove('kbo-espaco'); });

// ───────────── menu do botão direito ─────────────
function kbMenuFechar() { const m = kbEl('kbo-menu'); if (m) m.hidden = true; }
function kbMenuContexto(e) {
    e.preventDefault();
    if (!KB.doc || KB.show) return;
    if (KB.semMenu) { KB.semMenu = false; return; }
    const alvo = kbAlvo(e);
    if (alvo && alvo.it && !KB.sel.has(alvo.it.id)) kbSelecionar(kbGrupo(alvo.it).map(i => i.id));
    const tem = KB.sel.size > 0, [wx, wy] = kbParaMundo(e.clientX, e.clientY);
    const it = (t, a, atalho, off) => `<button data-m="${a}"${off ? ' disabled' : ''}>${t}${atalho ? `<kbd>${atalho}</kbd>` : ''}</button>`;
    const sel = kbSelItens(), grupo = sel.length > 1 && sel.every(i => i.g && i.g === sel[0].g);
    const h = tem ? [
        it('Copiar', 'copiar', 'Ctrl+C'), it('Recortar', 'recortar', 'Ctrl+X'), it('Colar', 'colar', 'Ctrl+V', !KB.clip), it('Duplicar', 'duplicar', 'Ctrl+D'), '<hr>',
        it('Trazer para frente', 'frente', 'Ctrl+]'), it('Enviar para trás', 'tras', 'Ctrl+['),
        sel.length > 1 ? it(grupo ? 'Desagrupar' : 'Agrupar', grupo ? 'desagrupar' : 'agrupar', grupo ? 'Ctrl+Shift+G' : 'Ctrl+G') : '',
        it(sel.every(i => i.lock) ? 'Destravar' : 'Travar', 'travar', 'Ctrl+Shift+L'), it('Ir para a seleção', 'irsel', 'Shift+2'),
        it('Exportar seleção (PNG)', 'expsel'), '<hr>', it('Apagar', 'apagar', 'Del'),
    ] : [
        it('Colar aqui', 'colar', 'Ctrl+V', !KB.clip), it('Nova nota aqui', 'nota', 'N'), it('Novo texto aqui', 'texto', 'T'), '<hr>',
        it('Selecionar tudo', 'tudo', 'Ctrl+A'), it('Ver tudo', 'ajustar', 'Shift+1'),
    ];
    const m = kbEl('kbo-menu'); m.innerHTML = h.join(''); m.hidden = false;
    const base = kbEl('kbo-editor').getBoundingClientRect();
    let x = e.clientX - base.left, y = e.clientY - base.top;
    if (x + m.offsetWidth > base.width - 8) x -= m.offsetWidth; if (y + m.offsetHeight > base.height - 8) y = base.height - m.offsetHeight - 8;
    m.style.left = x + 'px'; m.style.top = Math.max(8, y) + 'px';
    m.onclick = ev => {
        const b = ev.target.closest('[data-m]'); if (!b) return;
        m.hidden = true;
        const a = b.dataset.m;
        if (a === 'copiar' || a === 'recortar') { KB.clip = JSON.stringify({ kaniboard: 1, itens: kbSelItens(), midia: KB.midiaUrl, bid: KB.bid }); KB.clipTexto = null; if (a === 'recortar') kbApagarSel(); }
        else if (a === 'colar') { KB.mouse = { x: wx, y: wy, dentro: true }; if (KB.clip) kbColarItens(JSON.parse(KB.clip)); }
        else if (a === 'duplicar') kbDuplicar();
        else if (a === 'frente') kbOrdem(1); else if (a === 'tras') kbOrdem(-1);
        else if (a === 'agrupar') kbAgrupar(true); else if (a === 'desagrupar') kbAgrupar(false);
        else if (a === 'travar') kbTravar(); else if (a === 'irsel') kbIrSelecao();
        else if (a === 'expsel') kbExportar(true);
        else if (a === 'apagar') kbApagarSel();
        else if (a === 'nota') { const n = kbNovoItem('nota', { x: wx - 100, y: wy - 100 }); kbMudar(() => KB.doc.itens.push(n)); kbSelecionar([n.id]); kbEditar(n.id, { novo: true }); }
        else if (a === 'texto') { const n = kbNovoItem('texto', { x: wx, y: wy - 18 }); kbMudar(() => KB.doc.itens.push(n)); kbSelecionar([n.id]); kbEditar(n.id, { novo: true }); }
        else if (a === 'tudo') kbSelecionar(KB.doc.itens.map(i => i.id));
        else if (a === 'ajustar') kbAjustarTudo();
    };
}

// menu "⋯" do quadro
function kbMenuQuadro(btn) {
    const d = KB.doc;
    kbPop(btn, `<div class="kbo-lista-pop">
        <button data-p="exportar">Exportar quadro (PNG)</button>
        <button data-p="duplicar">Duplicar quadro</button><hr>
        <div class="kbo-fly-tit">Fundo</div>
        <div class="kbo-seg">${[['pontos', 'Pontos'], ['grade', 'Grade'], ['liso', 'Liso']].map(([k, n]) => `<button data-p="fundo:${k}" class="${(d.fundo || 'pontos') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="kbo-seg">${[['claro', 'Claro'], ['escuro', 'Escuro']].map(([k, n]) => `<button data-p="tema:${k}" class="${(d.tema || 'claro') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="kbo-fly-tit">Roda do mouse</div>
        <div class="kbo-seg">${[['zoom', 'Zoom'], ['rolar', 'Rolar']].map(([k, n]) => `<button data-p="roda:${k}" class="${KB.prefs.roda === k ? 'on' : ''}">${n}</button>`).join('')}</div><hr>
        <button data-p="atalhos">Atalhos do teclado</button></div>`, async v => {
        if (v === 'exportar') { kbPopFechar(); kbExportar(false); }
        else if (v === 'duplicar') { kbPopFechar(); await kbSalvarJa(true); const r = await kbApi().kb_duplicar(KB.bid); if (r && r.success) { kbToast('Cópia criada: ' + d.nome + ' (cópia)'); kbAbrir(r.id); } }
        else if (v.startsWith('fundo:')) { d.fundo = v.slice(6); kbAplicarCam(); kbAgendarSalvar(); kbPopReabrirMenu(btn); }
        else if (v.startsWith('tema:')) { d.tema = v.slice(5); kbAplicarCam(); KB.els.forEach(el => { el._sig = ''; }); kbRenderTudo(); kbAgendarSalvar(); kbPopReabrirMenu(btn); }
        else if (v.startsWith('roda:')) { KB.prefs.roda = v.slice(5); kbPref('roda', KB.prefs.roda); kbPopReabrirMenu(btn); }
        else if (v === 'atalhos') { kbPopFechar(); kbAtalhos(); }
    });
}
function kbPopReabrirMenu(btn) { setTimeout(() => { kbEl('kbo-pop')._reabrir = true; kbMenuQuadro(btn); }, 0); }
function kbAtalhos() {
    const l = [['V', 'Selecionar'], ['H / Espaço / botão direito', 'Mover a tela'], ['N', 'Nota adesiva'], ['T', 'Texto'], ['S · R · O', 'Forma · retângulo · círculo'],
        ['L', 'Seta'], ['P · E', 'Caneta · borracha'], ['F', 'Frame'], ['Roda / Ctrl+roda', 'Zoom'], ['Shift+1 · Shift+2', 'Ver tudo · ir para seleção'],
        ['Duplo clique', 'Escrever / nova nota'], ['Tab (na nota)', 'Próxima nota'], ['Alt+arrastar', 'Duplicar arrastando'], ['Shift+arrastar alça', 'Manter proporção'],
        ['Ctrl+arrastar', 'Sem grudar nas guias'], ['Ctrl+D · Ctrl+G · Ctrl+Shift+L', 'Duplicar · agrupar · travar'], ['Ctrl+] · Ctrl+[', 'Frente · trás'], ['Ctrl+Z · Ctrl+Shift+Z', 'Desfazer · refazer']];
    const m = kbEl('kbo-menu');
    m.innerHTML = `<div class="kbo-atalhos"><b>Atalhos do KaniBoard</b>${l.map(([a, b]) => `<div><kbd>${a}</kbd><span>${b}</span></div>`).join('')}</div>`;
    m.hidden = false; m.style.left = '50%'; m.style.top = '80px'; m.style.transform = 'translateX(-50%)';
    m.onclick = () => { m.hidden = true; m.style.transform = ''; };
}

// exportar PNG (quadro inteiro ou seleção), em alta
async function kbExportar(soSel) {
    const itens = soSel ? kbSelItens() : KB.doc.itens;
    if (!itens.length) { kbToast('Nada para exportar.'); return; }
    await kbEsperarImgs(itens, 5000);
    const cx = kbCaixaTudo(itens), m = 40, area = { x: cx.x - m, y: cx.y - m, w: cx.w + m * 2, h: cx.h + m * 2 };
    const esc = Math.min(3, 8000 / Math.max(area.w, area.h));
    let cv = kbRaster(itens, area, Math.round(area.w * esc), Math.round(area.h * esc), { pontos: false }), url;
    try { url = cv.toDataURL('image/png'); } catch (e) { cv = kbRaster(itens, area, Math.round(area.w * esc), Math.round(area.h * esc), { pontos: false, imagens: false }); url = cv.toDataURL('image/png'); }
    const r = await kbApi().kb_exportar_png(url, (KB.doc.nome || 'KaniBoard').replace(/[\\/:*?"<>|]+/g, '_'));
    if (r && r.success) kbToast('Imagem salva: ' + r.caminho, 'sucesso'); else if (r && !r.cancelado) kbToast('Não salvou: ' + (r.error || ''), 'erro');
}

// minimapa: clicar/arrastar leva a vista
function kbMiniIr(e) {
    const cv = kbEl('kbo-mini'), m = cv._map; if (!m) return;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
    const wx = (x - m.ox) / m.z, wy = (y - m.oy) / m.z, vp = kbEl('kbo-vp');
    KB.cam.x = vp.clientWidth / 2 - wx * KB.cam.z; KB.cam.y = vp.clientHeight / 2 - wy * KB.cam.z;
    kbCamAgendar();
}

// ───────────── painel de frames ─────────────
function kbPainelFrames(abrir) {
    const p = kbEl('kbo-fpainel'); if (!p) return;
    p.hidden = abrir === undefined ? !p.hidden : !abrir;
    document.querySelector('#kbo-editor [data-a="frames"]')?.classList.toggle('on', !p.hidden);
    if (!p.hidden) kbFramesLista();
}
function kbFramesLista() {
    const p = kbEl('kbo-fpainel'); if (!p || p.hidden || !KB.doc) return;
    const frames = KB.doc.itens.filter(i => i.tipo === 'frame');
    p.innerHTML = `<div class="kbo-fp-topo"><b>Frames</b><span>${frames.length}</span><button class="kbo-b" data-fp="novo" title="Novo frame no centro da tela">+</button><button class="kbo-b" data-fp="fechar" title="Fechar">✕</button></div>
      <div class="kbo-fp-lista">${frames.length ? frames.map((f, i) => `<div class="kbo-fp-item${KB.sel.has(f.id) ? ' on' : ''}" data-fp="ir:${f.id}">
        <canvas width="200" height="${Math.round(200 * Math.min(1.6, f.h / f.w))}" data-fid="${f.id}"></canvas>
        <div class="kbo-fp-info"><span class="kbo-fp-n">${i + 1}</span><b>${kbEsc(f.nome)}</b>
          <button class="kbo-b" data-fp="sobe:${f.id}" title="Mais cedo na apresentação" ${i ? '' : 'disabled'}>↑</button><button class="kbo-b" data-fp="desce:${f.id}" title="Mais tarde" ${i < frames.length - 1 ? '' : 'disabled'}>↓</button></div></div>`).join('')
        : '<p class="kbo-fp-vazio">Nenhum frame ainda. Frames separam partes do quadro e viram os slides da apresentação. Use a ferramenta Frame (F).</p>'}</div>`;
    p.querySelectorAll('canvas[data-fid]').forEach(cv => {
        const f = kbItem(cv.dataset.fid);
        const dentro = KB.doc.itens.filter(i => { if (i.id === f.id) return true; const c = kbCaixa(i); return i.tipo !== 'frame' && c.x < f.x + f.w && c.x + c.w > f.x && c.y < f.y + f.h && c.y + c.h > f.y; });
        const src = kbRaster(dentro, f, cv.width, cv.height, { pontos: false });
        cv.getContext('2d').drawImage(src, 0, 0);
    });
    p.onclick = e => {
        const b = e.target.closest('[data-fp]'); if (!b) return;
        e.stopPropagation();
        const [a, id] = b.dataset.fp.split(':');
        if (a === 'fechar') kbPainelFrames(false);
        else if (a === 'novo') {
            const vp = kbEl('kbo-vp'), [cx, cy] = kbParaMundo(vp.getBoundingClientRect().left + vp.clientWidth / 2, vp.getBoundingClientRect().top + vp.clientHeight / 2);
            const pr = KB_FRAMES.find(q => q[0] === (KB.framePreset || '16:9')) || KB_FRAMES[0], w = pr[2] || 1600, h = pr[3] || 900;
            const n = kbNovoItem('frame', { x: cx - w / 2, y: cy - h / 2, w, h, nome: 'Frame ' + (frames.length + 1) });
            kbMudar(() => KB.doc.itens.unshift(n)); kbSelecionar([n.id]); kbVoar(kbCamPara(n, 80, 1)); kbFramesLista();
        }
        else if (a === 'ir') { const f = kbItem(id); kbSelecionar([id]); kbVoar(kbCamPara(f, 60, 4)); }
        else if (a === 'sobe' || a === 'desce') {
            kbMudar(() => {
                const it = KB.doc.itens, i = it.findIndex(x => x.id === id), fs = it.map((x, k) => x.tipo === 'frame' ? k : -1).filter(k => k >= 0);
                const pos = fs.indexOf(i), j = fs[pos + (a === 'sobe' ? -1 : 1)]; if (j == null) return;
                [it[i], it[j]] = [it[j], it[i]];
            });
            kbFramesLista();
        }
    };
    p.ondblclick = e => { const it = e.target.closest('.kbo-fp-item'); if (it) { const id = it.dataset.fp.slice(3); kbSelecionar([id]); kbEditar(id); } };
}
function kbFramesMarcar() { document.querySelectorAll('#kbo-fpainel .kbo-fp-item').forEach(el => el.classList.toggle('on', KB.sel.has(el.dataset.fp.slice(3)))); }

// ───────────── apresentação (frames em tela cheia) ─────────────
function kbApresentar() {
    const frames = KB.doc.itens.filter(i => i.tipo === 'frame');
    if (!frames.length) { kbToast('Crie frames (F) para apresentar: cada frame vira um slide.', 'aviso'); return; }
    kbSairEdicao(); kbPopFechar();
    let i = 0; const s = kbSelItens()[0];
    if (s && s.tipo === 'frame') i = Math.max(0, frames.indexOf(s));
    KB.sel.clear();
    KB.show = { frames, i, camAntes: { ...KB.cam } };
    const raiz = kbEl('kbo-editor'); raiz.classList.add('kbo-apresentando');
    kbEl('kbo-show-masc').hidden = false; kbEl('kbo-show-hud').hidden = false;
    // tela cheia: a do navegador (precisa de clique) ou, se recusar, a da janela do app (como no Slider)
    const pelaApi = () => { try { const a = kbApi(); if (a && a.toggle_fullscreen) { a.toggle_fullscreen(); KB.show.cheiaApi = true; } } catch (e) { /* janela normal */ } };
    try { if (raiz.requestFullscreen) raiz.requestFullscreen().catch(() => { if (KB.show) pelaApi(); }); else pelaApi(); } catch (e) { pelaApi(); }
    setTimeout(() => kbShowIr(0), 160);
    document.addEventListener('fullscreenchange', kbShowFsSaiu);
}
function kbShowFsSaiu() { if (!document.fullscreenElement && KB.show) kbShowSair(); }
function kbShowIr(d) {
    const s = KB.show; if (!s) return;
    const n = s.i + d;
    if (n < 0) return;
    if (n >= s.frames.length) { kbShowSair(); return; }
    s.i = n;
    const f = s.frames[n];
    kbVoar(kbCamPara(f, 0, 20), d ? 520 : 1);
    kbEl('kbo-show-hud').innerHTML = `<b>${kbEsc(f.nome)}</b><span>${n + 1} / ${s.frames.length}</span><small>← → navega · Esc sai</small>`;
}
function kbShowMascara() {
    const s = KB.show, m = kbEl('kbo-show-masc'); if (!s || !m) return;
    const c = kbCaixaTela(s.frames[s.i]);
    Object.assign(m.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
}
function kbShowTecla(e) {
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); kbShowIr(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); kbShowIr(-1); }
    else if (k === 'Home') { e.preventDefault(); KB.show.i = 0; kbShowIr(0); }
    else if (k === 'Escape') { e.preventDefault(); kbShowSair(); }
}
function kbShowSair() {
    const s = KB.show; if (!s) return;
    KB.show = null;
    document.removeEventListener('fullscreenchange', kbShowFsSaiu);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (s.cheiaApi) { try { kbApi().toggle_fullscreen(); } catch (e) { /* nada */ } }
    kbEl('kbo-editor').classList.remove('kbo-apresentando');
    kbEl('kbo-show-masc').hidden = true; kbEl('kbo-show-hud').hidden = true;
    setTimeout(() => kbVoar(s.camAntes, 300), 150);
}
