// =========================================================
// Slider Kanivete — INTERFACE: lobby, menus, barra, lista de slides (arrastar para reordenar), mesa (selecionar, mover,
// redimensionar, girar, encaixe com guias, editar texto no lugar), painéis Design (propriedades do objeto/slide/tema)
// e Camadas, notas do apresentador. Tudo que muda o documento passa por sdCmd (slider.js) — o mesmo caminho do agente.
// =========================================================
const SDU = { z: 1, ajustar: true, vivo: false, mapa: new Map(), clip: null, menu: null, aba: 'design', fontes: [], guias: true, slideArr: null };
const sdEl = id => document.getElementById(id);
const SD_FORMAS = [['ret', 'Retângulo'], ['elipse', 'Elipse'], ['tri', 'Triângulo'], ['losango', 'Losango'], ['estrela', 'Estrela'], ['hexagono', 'Hexágono'],
    ['seta', 'Seta'], ['linha', 'Linha'], ['coracao', 'Coração'], ['balao', 'Balão de fala']];
const SD_ANIMS = [['nenhuma', 'Nenhuma'], ['esmaecer', 'Esmaecer'], ['subir', 'Subir'], ['descer', 'Descer'], ['esquerda', 'Da esquerda'], ['direita', 'Da direita'], ['zoom', 'Zoom'], ['girar', 'Girar']];
const SD_TRANS = [['nenhuma', 'Nenhuma'], ['esmaecer', 'Esmaecer'], ['deslizar', 'Deslizar'], ['empurrar', 'Empurrar'], ['zoom', 'Zoom'], ['cobrir', 'Cobrir']];
const SD_MESCLAS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'luminosity'];
const SD_EXT_IMG = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i, SD_EXT_VID = /\.(mp4|mov|webm|m4v|mkv)$/i;

function sdToast(m, tipo) { if (typeof toast === 'function') toast(m, tipo); else console.log(m); }
async function sdUi(nome, a = {}) {
    try { return await sdCmd(nome, a); } catch (e) { sdToast(e.message || String(e), 'erro'); return null; }
}

// ───────────── entrada (switchTool) ─────────────
function sdAoTrocar(id) {
    if (id !== 'slider-kanivete') { document.querySelectorAll('#sd-palco video').forEach(v => v.pause()); return; }
    if (SDU.semLobby) return;
    sdMontarUI();
    if (!SD.doc || SDU.noLobby) sdLobby(); else sdMostrarEditor();
}
function sdMontarUI() {
    const pg = sdEl('page-slider-kanivete'); if (!pg || pg.dataset.ok) return;
    pg.dataset.ok = '1';
    pg.innerHTML = `<div class="sd" id="sd">
      <header class="sd-top">
        <div class="sd-marca"><span class="app-logo al-sd app-logo-marca">Sd</span> Slider Kanivete</div>
        <nav class="sd-menus">${['Arquivo', 'Editar', 'Inserir', 'Slide', 'Organizar', 'Exibir'].map(m => `<button class="sd-mn" data-menu="${m.toLowerCase()}">${m}</button>`).join('')}</nav>
        <div class="sd-titulo" id="sd-titulo"></div>
        <div class="sd-top-dir">
          <button class="sd-btn" data-menu="exportar"><svg class="i"><use href="#i-download"/></svg> Exportar</button>
          <button class="sd-btn sd-pri" data-a="apresentar" title="Apresentar (F5)">▶ Apresentar</button>
        </div>
      </header>
      <div class="sd-barra" id="sd-barra">
        <button class="sd-fe" data-a="texto" title="Texto (T)"><b>T</b><span>Texto</span></button>
        <button class="sd-fe" data-menu="formas" title="Formas"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="10" height="10" rx="2"/><circle cx="16" cy="16" r="5"/></svg><span>Forma</span></button>
        <button class="sd-fe" data-a="imagem" title="Imagem ou GIF"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg><span>Imagem</span></button>
        <button class="sd-fe" data-a="video" title="Vídeo"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2v8l-4-2z"/></svg><span>Vídeo</span></button>
        <i class="sd-sep"></i>
        <button class="sd-ic" data-a="desfazer" title="Desfazer (Ctrl+Z)">↶</button><button class="sd-ic" data-a="refazer" title="Refazer (Ctrl+Shift+Z)">↷</button>
        <i class="sd-sep"></i>
        <span class="sd-grupo" id="sd-fmt"></span>
        <span class="sd-grupo sd-alinhar">${[['esq', '⇤', 'Alinhar à esquerda'], ['centro', '↔', 'Centralizar na horizontal'], ['dir', '⇥', 'Alinhar à direita'], ['topo', '⤒', 'Alinhar no topo'], ['meio', '↕', 'Centralizar na vertical'], ['base', '⤓', 'Alinhar na base']]
            .map(([k, s, t]) => `<button class="sd-ic" data-alinhar="${k}" title="${t}">${s}</button>`).join('')}
            <button class="sd-ic" data-distribuir="h" title="Distribuir na horizontal">⋯</button><button class="sd-ic" data-distribuir="v" title="Distribuir na vertical">⋮</button></span>
        <span class="sd-flex"></span>
        <button class="sd-ic" data-a="zoom-" title="Reduzir (Ctrl+−)">−</button><button class="sd-zoom" data-a="ajustar" id="sd-zoom" title="Ajustar à tela (Ctrl+0)">100%</button><button class="sd-ic" data-a="zoom+" title="Ampliar (Ctrl+=)">+</button>
      </div>
      <div class="sd-corpo">
        <aside class="sd-lista" id="sd-lista"></aside>
        <main class="sd-mesa" id="sd-mesa"><div class="sd-papel" id="sd-papel"><div class="sd-palco" id="sd-palco"></div><div class="sd-sobre" id="sd-sobre"></div></div></main>
        <aside class="sd-lado">
          <div class="sd-abas"><button data-aba="design" class="on">Design</button><button data-aba="camadas">Camadas</button></div>
          <div class="sd-painel" id="sd-props"></div><div class="sd-painel" id="sd-camadas" hidden></div>
        </aside>
      </div>
      <footer class="sd-rodape"><textarea id="sd-notas" placeholder="Notas do apresentador (aparecem na visão do apresentador e vão para o PPTX)…"></textarea><div class="sd-status" id="sd-status"></div></footer>
      <div class="sd-prog" id="sd-prog" hidden><span></span><i><b></b></i></div>
      <section class="kl" id="sd-inicio" hidden style="--kl-top:0px"></section>
      <datalist id="sd-fontes"></datalist>
    </div>`;
    const raiz = sdEl('sd');
    raiz.addEventListener('click', sdClique);
    sdEl('sd-notas').addEventListener('input', e => { const s = sdSlide(); if (s) { s.notas = e.target.value; SD.sujo = true; clearTimeout(SD.tg); SD.tg = setTimeout(sdGuardarRascunho, 1200); } });
    sdEl('sd-notas').addEventListener('change', () => sdTitulo());
    sdMontarMesa(); sdMontarLista(); sdMontarPaineis();
    SD.ouvintes.push(sdAoMudar);
    new ResizeObserver(() => { if (SDU.ajustar) sdAjustarZoom(); }).observe(sdEl('sd-mesa'));
    sdApi() && sdApi().ve_fontes().then(r => { SDU.fontes = (r && r.fontes) || []; sdEl('sd-fontes').innerHTML = SDU.fontes.map(f => `<option value="${sdEsc(f)}">`).join(''); }).catch(() => {});
}
function sdAoMudar(q) {
    if (q && typeof q === 'object') { sdProgresso(q); return; }
    if (!sdEl('sd') || !SD.doc) return;
    if (q === 'posters') { clearTimeout(SDU.tp); SDU.tp = setTimeout(() => sdRenderLista(), 300); return; }
    if (q === 'arquivo') { sdTitulo(); return; }
    if (q === 'sel') { sdRenderSobre(); sdRenderPaineis(); sdBarraFmt(); return; }
    if (q === 'atual') { sdRenderMesa(true); sdMarcarLista(); sdRenderPaineis(); sdRenderNotas(); return; }
    if (q === 'camadas' || q === 'slide') { sdRenderMesa(); sdRenderPaineis(); sdBarraFmt(); sdMiniAgendar(sdSlide()); sdTitulo(); return; }
    sdRenderTudo();
}
function sdRenderTudo() { sdRenderMesa(true); sdRenderLista(); sdRenderPaineis(); sdRenderNotas(); sdTitulo(); sdBarraFmt(); }
function sdTitulo() {
    const t = sdEl('sd-titulo'); if (!t || !SD.doc) return;
    t.innerHTML = `${sdEsc(SD.arquivo ? sdNomeArq(SD.arquivo) : SD.doc.nome)}<small>${SD.arquivo ? '.dknv' : ''}${SD.sujo ? ' •' : ''}</small>`;
    sdEl('sd-status').textContent = `Slide ${SD.atual + 1} de ${SD.doc.slides.length} · ${SD.doc.largura}×${SD.doc.altura}`;
}
function sdProgresso(q) {
    const b = sdEl('sd-prog'); if (!b) return;
    if (q.progresso == null) { b.hidden = true; return; }
    b.hidden = false; b.querySelector('span').textContent = q.texto || ''; b.querySelector('b').style.width = Math.round(q.progresso * 100) + '%';
}

// ───────────── lobby ─────────────
function sdLobby() {
    sdMontarUI();
    const el = sdEl('sd-inicio'), r = sdRascunho(), rec = sdRecentes();
    const nome = SD.doc ? (SD.arquivo ? sdNomeArq(SD.arquivo) : SD.doc.nome) : r && r.doc && r.doc.nome;
    el.innerHTML = `<div class="ie-inicio-box kl-inner">
      <div class="kl-hero"><img class="kl-hero-bg" src="img/home/banner-sd.webp" alt="" aria-hidden="true" onload="this.classList.add('pronto')">
        <div class="kl-hero-txt"><span class="app-logo al-sd app-logo-grande">Sd</span><h2>Comece sua apresentação</h2>
          <p>Slides 16:9 com camadas, vídeo e GIF, temas prontos e modo apresentação. Abra um PowerPoint, comece de um modelo ou do zero, e exporte em PDF, PPTX, PNG ou vídeo.</p></div>
        <div class="kl-acoes"><button class="ie-btn ie-btn-primario kl-novo" data-sdl="nova"><svg class="i"><use href="#i-file"/></svg> Nova apresentação</button>
          <div class="kl-mais"><button class="ie-btn" data-sdl="abrir"><svg class="i"><use href="#i-folder"/></svg> Abrir…</button>
          <button class="ie-btn" data-sdl="pptx">Importar PowerPoint…</button></div></div></div>
      <div class="sd-modelos"><div class="ie-recentes-tit">Modelos</div><div class="sd-modelos-lista">${Object.entries(SD_TEMAS).map(([k, t]) => `
        <button class="sd-modelo" data-sdl="tema:${k}" style="--f:${t.cores.fundo};--t:${t.cores.tinta};--d:${t.cores.destaque}">
          <span class="sd-modelo-arte"><i style="font-family:'${t.titulo}'">Aa</i><em></em></span><b>${t.nome}</b><small>${t.titulo} · ${t.texto}</small></button>`).join('')}</div></div>
      ${nome ? `<div class="ie-inicio-abertos"><div class="ie-recentes-tit">Abertos</div><div class="ie-inicio-abertos-lista">
        <button class="ie-btn" data-sdl="continuar">› Continuar: ${sdEsc(nome)}${(SD.doc ? SD.sujo : r && r.sujo) ? ' •' : ''}</button></div></div>` : ''}
      <div class="ie-recentes kl-lista">${rec.length ? '<div class="ie-recentes-tit">Recentes</div>' + rec.map(p => `<button class="ie-recente" data-sdl="arq:${sdEsc(p)}" title="${sdEsc(p)}">${sdEsc(sdNomeArq(p))}</button>`).join('') : ''}</div>
    </div>`;
    el.hidden = false; SDU.noLobby = true;
    if (!el.dataset.ok) {
        el.dataset.ok = '1';
        el.addEventListener('click', async e => {
            const b = e.target.closest('[data-sdl]'); if (!b) return;
            const a = b.dataset.sdl;
            if (a === 'nova') { if (await sdPodeDescartar()) { await sdUi('novo', {}); sdMostrarEditor(); } }
            else if (a === 'abrir' || a === 'pptx') { const r2 = await sdUi('abrir', a === 'pptx' ? { caminho: await sdApi().vk_dialogo('abrir', ['PowerPoint (*.pptx)']) || '' } : {}); if (r2 && !r2.cancelado) { sdRelatorio(r2); sdMostrarEditor(); } }
            else if (a === 'continuar') { if (!SD.doc) { const r3 = sdRascunho(); await sdPrepararUrls(r3.doc); sdCarregar(r3.doc, r3.arquivo); SD.sujo = !!r3.sujo; } sdMostrarEditor(); }
            else if (a.startsWith('tema:')) { if (await sdPodeDescartar()) { await sdUi('modelo', { tema: a.slice(5) }); sdMostrarEditor(); } }
            else if (a.startsWith('arq:')) { const r4 = await sdUi('abrir', { caminho: a.slice(4) }); if (r4 && !r4.cancelado) sdMostrarEditor(); }
        });
    }
    if (typeof KL_API === 'object') KL_API.aplicar();
}
function sdRelatorio(r) { if (r && r.relatorio && r.relatorio.length) sdToast(`PowerPoint importado. ${r.relatorio.length} item(ns) não vieram: ${r.relatorio.slice(0, 3).join('; ')}`, 'aviso'); }
async function sdPodeDescartar() {
    if (!SD.doc || !SD.sujo) return true;
    if (typeof appConfirm === 'function') {
        const v = await appConfirm({ titulo: 'Apresentação com mudanças', texto: 'A apresentação aberta tem mudanças não salvas. O rascunho fica guardado até você começar outra.',
            botoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Salvar antes', valor: 'salvar', tipo: 'secundario' }, { rotulo: 'Começar outra', valor: true, tipo: 'perigo' }] });
        if (v === 'salvar') { const r = await sdUi('salvar', {}); return !!(r && !r.cancelado); }
        return !!v;
    }
    return confirm('Descartar as mudanças não salvas?');
}
function sdMostrarEditor() {
    sdMontarUI(); sdEl('sd-inicio').hidden = true; SDU.noLobby = false;
    if (typeof switchTool === 'function' && document.querySelector('.menu-item.active')?.dataset.tool !== 'slider-kanivete') { SDU.semLobby = true; switchTool('slider-kanivete'); SDU.semLobby = false; }
    sdRenderTudo(); sdAjustarZoom();
}
function sdFechar() { sdGuardarRascunho(); SD.sel = []; sdLobby(); }

// ───────────── cliques gerais (barra, menus, abas) ─────────────
async function sdClique(e) {
    const b = e.target.closest('[data-a],[data-menu],[data-alinhar],[data-distribuir],[data-aba],[data-fmt]'); if (!b || !sdEl('sd').contains(b)) return;
    if (b.dataset.menu) { sdAbrirMenu(b.dataset.menu, b); return; }
    if (b.dataset.alinhar) { await sdUi('alinhar', { como: b.dataset.alinhar }); return; }
    if (b.dataset.distribuir) { await sdUi('distribuir', { eixo: b.dataset.distribuir }); return; }
    if (b.dataset.aba) { SDU.aba = b.dataset.aba; document.querySelectorAll('.sd-abas button').forEach(x => x.classList.toggle('on', x === b)); sdEl('sd-props').hidden = SDU.aba !== 'design'; sdEl('sd-camadas').hidden = SDU.aba !== 'camadas'; sdRenderPaineis(); return; }
    if (b.dataset.fmt) { sdFmt(b.dataset.fmt, b); return; }
    sdAcao(b.dataset.a);
}
async function sdAcao(a) {
    if (a === 'apresentar') return sdApresentar(0);
    if (a === 'apresentar-aqui') return sdApresentar(SD.atual);
    if (a === 'texto') return sdUi('texto', { html: 'Clique duas vezes para editar' });
    if (a === 'titulo') return sdUi('texto', { html: 'Título', tam: 96, peso: 600, fonte: SD.doc.tema.titulo, w: 1400, h: 140 });
    if (a === 'imagem' || a === 'video') {
        const p = await sdApi().vk_dialogo('abrir', a === 'imagem' ? ['Imagens e GIF (*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp;*.svg)', 'Todos (*.*)'] : ['Vídeos (*.mp4;*.mov;*.webm;*.m4v;*.mkv)', 'Todos (*.*)']);
        if (p) return sdUi(a, { src: p.replace(/\\/g, '/') });
        return;
    }
    if (a === 'desfazer') return sdDesfazer();
    if (a === 'refazer') return sdDesfazer(true);
    if (a === 'zoom+' || a === 'zoom-') { SDU.ajustar = false; SDU.z = Math.max(0.1, Math.min(4, SDU.z * (a === 'zoom+' ? 1.25 : 0.8))); return sdAplicarZoom(); }
    if (a === 'ajustar') { SDU.ajustar = true; return sdAjustarZoom(); }
    if (a === 'z100') { SDU.ajustar = false; SDU.z = 1; return sdAplicarZoom(); }
}

// ───────────── menus ─────────────
function sdItensMenu(m) {
    const temSel = SD.sel.length > 0, s = sdSlide(), rec = sdRecentes();
    const exp = [['PDF', '', () => sdUi('exportar', { formato: 'pdf' })], ['PowerPoint editável (.pptx)', '', () => sdExportarPptx()], ['PowerPoint em imagens (.pptx)', '', () => sdUi('exportar', { formato: 'pptx_imagens' })],
        ['Imagens PNG (um por slide)', '', () => sdUi('exportar', { formato: 'png' })], ['Vídeo MP4 (com transições)', '', () => sdUi('exportar', { formato: 'mp4' })], ['Slide atual em PNG', '', () => sdUi('exportar', { formato: 'png', slides: 'atual' })]];
    const L = {
        arquivo: [['Nova apresentação', 'Ctrl+N', async () => { if (await sdPodeDescartar()) sdUi('novo', {}); }], ['Abrir…', 'Ctrl+O', async () => { const r = await sdUi('abrir', {}); sdRelatorio(r); }],
            ['Importar PowerPoint…', '', async () => { const p = await sdApi().vk_dialogo('abrir', ['PowerPoint (*.pptx)']); if (p) sdRelatorio(await sdUi('abrir', { caminho: p })); }],
            ...(rec.length ? [['—Recentes'], ...rec.slice(0, 6).map(p => [sdNomeArq(p), '', () => sdUi('abrir', { caminho: p })])] : []),
            ['-'], ['Salvar', 'Ctrl+S', () => sdSalvarUi()], ['Salvar como…', 'Ctrl+Shift+S', () => sdSalvarUi(true)], ['-'], ['—Exportar'], ...exp, ['-'], ['Fechar (voltar ao início)', '', sdFechar]],
        exportar: exp,
        editar: [['Desfazer', 'Ctrl+Z', () => sdDesfazer()], ['Refazer', 'Ctrl+Shift+Z', () => sdDesfazer(true)], ['-'], ['Recortar', 'Ctrl+X', () => { sdCopiar(); sdUi('apagar', {}); }, !temSel],
            ['Copiar', 'Ctrl+C', sdCopiar, !temSel], ['Colar', 'Ctrl+V', sdColar, !SDU.clip], ['Duplicar', 'Ctrl+D', () => sdUi('duplicar', {}), !temSel], ['Apagar', 'Del', () => sdUi('apagar', {}), !temSel],
            ['-'], ['Selecionar tudo', 'Ctrl+A', () => sdUi('selecionar', { ids: s.camadas.filter(c => !c.trava).map(c => c.id) })]],
        inserir: [['Texto', 'T', () => sdAcao('texto')], ['Título', '', () => sdAcao('titulo')], ['Imagem ou GIF…', '', () => sdAcao('imagem')], ['Vídeo…', '', () => sdAcao('video')],
            ['—Tabela'], ...[[2, 2], [3, 3], [4, 3], [5, 4]].map(([l, k]) => [`Tabela ${l} × ${k}`, '', () => sdUi('tabela', { linhas: l, colunas: k })]), ['-'], ['—Formas'],
            ...SD_FORMAS.map(([k, n]) => [n, '', () => sdUi('forma', { forma: k })])],
        formas: SD_FORMAS.map(([k, n]) => [n, '', () => sdUi('forma', { forma: k })]),
        slide: [['—Novo slide'], ...Object.entries(SD_LAYOUTS).map(([k, n]) => [n, k === 'titulo_texto' ? 'Ctrl+M' : '', () => sdUi('slide_novo', { layout: k })]), ['-'],
            ['Duplicar slide', '', () => sdUi('slide_duplicar', {})], [s && s.oculto ? 'Mostrar slide' : 'Ocultar slide', '', () => sdUi('slide_props', { oculto: !(s && s.oculto) })],
            ['Apagar slide', '', () => sdUi('slide_apagar', {}), SD.doc.slides.length < 2], ['-'], ['Este fundo em todos os slides', '', () => sdUi('slide_fundo', { ...s.fundo, todos: true })],
            ['Esta transição em todos os slides', '', () => sdUi('slide_transicao', { ...(s.transicao || {}), todos: true })]],
        organizar: [['Trazer para a frente', 'Ctrl+]', () => sdUi('ordem', { para: 'frente' }), !temSel], ['Enviar para trás', 'Ctrl+[', () => sdUi('ordem', { para: 'tras' }), !temSel],
            ['Trazer para o topo', 'Ctrl+Shift+]', () => sdUi('ordem', { para: 'topo' }), !temSel], ['Enviar para o fundo', 'Ctrl+Shift+[', () => sdUi('ordem', { para: 'fundo' }), !temSel], ['-'],
            ...[['esq', 'Alinhar à esquerda'], ['centro', 'Centralizar na horizontal'], ['dir', 'Alinhar à direita'], ['topo', 'Alinhar no topo'], ['meio', 'Centralizar na vertical'], ['base', 'Alinhar na base']]
                .map(([k, n]) => [n, '', () => sdUi('alinhar', { como: k }), !temSel]),
            ['Distribuir na horizontal', '', () => sdUi('distribuir', { eixo: 'h' }), SD.sel.length < 3], ['Distribuir na vertical', '', () => sdUi('distribuir', { eixo: 'v' }), SD.sel.length < 3], ['-'],
            ['Agrupar', 'Ctrl+G', () => sdUi('agrupar', {}), SD.sel.length < 2], ['Desagrupar', 'Ctrl+Shift+G', () => sdUi('desagrupar', {}), !sdAlvos({}).some(c => c.grupo)], ['-'],
            ['Travar / destravar', 'Ctrl+L', () => sdAlternar('trava'), !temSel], ['Ocultar / mostrar', 'Ctrl+H', () => sdAlternar('oculto'), !temSel]],
        exibir: [['Apresentar do início', 'F5', () => sdApresentar(0)], ['Apresentar deste slide', 'Shift+F5', () => sdApresentar(SD.atual)], ['-'],
            ['Ajustar à tela', 'Ctrl+0', () => sdAcao('ajustar')], ['Tamanho real (100%)', 'Ctrl+1', () => sdAcao('z100')], ['Ampliar', 'Ctrl+=', () => sdAcao('zoom+')], ['Reduzir', 'Ctrl+−', () => sdAcao('zoom-')], ['-'],
            [(SDU.guias ? '✓ ' : '') + 'Guias inteligentes', '', () => { SDU.guias = !SDU.guias; }], [(sdEl('sd').classList.contains('sem-notas') ? '' : '✓ ') + 'Notas do apresentador', '', () => sdEl('sd').classList.toggle('sem-notas')]],
    };
    return L[m] || [];
}
function sdAbrirMenu(m, ancora, xy) {
    sdFecharMenu();
    const box = document.createElement('div'); box.className = 'sd-pop';
    box.innerHTML = sdItensMenu(m).map((it, i) => it[0] === '-' ? '<hr>' : it[0].startsWith('—') ? `<div class="sd-pop-tit">${sdEsc(it[0].slice(1))}</div>`
        : `<button data-i="${i}"${it[3] ? ' disabled' : ''}><span>${sdEsc(it[0])}</span><kbd>${sdEsc(it[1] || '')}</kbd></button>`).join('');
    document.body.appendChild(box);
    const r = ancora ? ancora.getBoundingClientRect() : { left: xy[0], bottom: xy[1], right: xy[0] };
    let x = r.left, y = r.bottom + 4;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    if (x + bw > innerWidth - 6) x = Math.max(6, (ancora ? r.right : x) - bw);
    if (y + bh > innerHeight - 6) y = Math.max(6, innerHeight - bh - 6);
    box.style.left = x + 'px'; box.style.top = y + 'px';
    const itens = sdItensMenu(m);
    box.onclick = ev => { const b = ev.target.closest('button[data-i]'); if (!b) return; sdFecharMenu(); itens[+b.dataset.i][2](); };
    SDU.menu = box;
    setTimeout(() => document.addEventListener('mousedown', sdFecharMenuFora, true), 0);
}
function sdFecharMenuFora(e) { if (SDU.menu && !SDU.menu.contains(e.target)) sdFecharMenu(); }
function sdFecharMenu() { if (SDU.menu) SDU.menu.remove(); SDU.menu = null; document.removeEventListener('mousedown', sdFecharMenuFora, true); }
async function sdSalvarUi(como = false) { const r = await sdUi('salvar', { como }); if (r && r.caminho) sdToast('Salvo: ' + sdNomeArq(r.caminho) + '.dknv'); }
async function sdExportarPptx() { const r = await sdUi('exportar', { formato: 'pptx' }); if (r && r.caminho) sdToast('PowerPoint salvo' + (r.avisos && r.avisos.length ? ` (${r.avisos.length} aviso(s): ${r.avisos[0]})` : '')); }
function sdAlternar(k) { const cs = sdAlvos({}); const v = !cs.every(c => c[k]); return sdUi('editar', { [k]: v || null }); }

// ───────────── zoom ─────────────
function sdAjustarZoom() {
    const m = sdEl('sd-mesa'); if (!m || !SD.doc || !m.clientWidth) return;
    SDU.z = Math.max(0.05, Math.min((m.clientWidth - 64) / SD.doc.largura, (m.clientHeight - 64) / SD.doc.altura));
    sdAplicarZoom();
}
function sdAplicarZoom() {
    const p = sdEl('sd-papel'), palco = sdEl('sd-palco'); if (!p || !SD.doc) return;
    p.style.width = SD.doc.largura * SDU.z + 'px'; p.style.height = SD.doc.altura * SDU.z + 'px';
    palco.style.transform = `scale(${SDU.z})`;
    sdEl('sd-zoom').textContent = Math.round(SDU.z * 100) + '%';
    sdRenderSobre();
}

// ───────────── mesa: desenho incremental (vídeo não recarrega quando só a posição muda) ─────────────
function sdRenderMesa(tudo = false) {
    const palco = sdEl('sd-palco'), s = sdSlide(); if (!palco || !s) return;
    if (tudo || palco.dataset.slide !== s.id || !palco.firstElementChild) {
        palco.innerHTML = ''; SDU.mapa.clear(); palco.dataset.slide = s.id;
        const el = sdMontarSlide(s, 'edit'); palco.appendChild(el);
        for (const c of s.camadas) SDU.mapa.set(c.id, { el: el.querySelector(`[data-id="${c.id}"]`), js: JSON.stringify(c) });
        sdAplicarZoom();
        return;
    }
    const raiz = palco.firstElementChild, fundoNovo = sdFundoEl(s, 'edit'), fundoVelho = raiz.querySelector('.sd-fundo');
    if (fundoVelho.outerHTML !== fundoNovo.outerHTML) raiz.replaceChild(fundoNovo, fundoVelho);
    const vivos = new Set();
    let ant = raiz.querySelector('.sd-fundo');
    for (const c of s.camadas) {
        vivos.add(c.id);
        const js = JSON.stringify(c), m = SDU.mapa.get(c.id);
        let el = m && m.el;
        if (!m || m.js !== js) {
            const novo = sdCamadaEl(c, 'edit');
            if (el && c.tipo === 'video' && JSON.parse(m.js).src === c.src) { el.style.cssText = novo.style.cssText; el.className = novo.className; const v = el.querySelector('video'); if (v) { v.loop = !!c.loop; v.style.objectFit = novo.querySelector('video').style.objectFit; v.style.borderRadius = novo.querySelector('video').style.borderRadius; } }
            else if (el && SDU.editando === c.id) { /* editando: não troca */ }
            else { if (el) el.replaceWith(novo); el = novo; }
            SDU.mapa.set(c.id, { el, js });
        }
        if (ant.nextElementSibling !== el) ant.after(el);
        ant = el;
    }
    for (const [id, m] of SDU.mapa) if (!vivos.has(id)) { m.el.remove(); SDU.mapa.delete(id); }
    sdRenderSobre();
}

// sobreposição: caixa da seleção, alças, giro, guias e laço
function sdRenderSobre() {
    const sob = sdEl('sd-sobre'), s = sdSlide(); if (!sob || !s) return;
    const z = SDU.z, cs = SD.sel.map(id => sdCamada(id, s)).filter(Boolean);
    let h = '';
    for (const c of cs) {
        const um = cs.length === 1 && !c.trava && SDU.editando !== c.id, peq = c.w * z < 44 || c.h * z < 44;
        h += `<div class="sd-caixa${c.trava ? ' trava' : ''}${peq ? ' peq' : ''}" data-cx="${c.id}" style="left:${c.x * z}px;top:${c.y * z}px;width:${c.w * z}px;height:${c.h * z}px;transform:rotate(${+c.rot || 0}deg)">` +
            (um ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(k => `<i class="sd-alca a-${k}" data-alca="${k}"></i>`).join('') + '<i class="sd-giro" data-alca="giro"></i>' : '') + '</div>';
    }
    if (SDU.laco) { const [x0, y0, x1, y1] = SDU.laco; h += `<div class="sd-laco" style="left:${Math.min(x0, x1) * z}px;top:${Math.min(y0, y1) * z}px;width:${Math.abs(x1 - x0) * z}px;height:${Math.abs(y1 - y0) * z}px"></div>`; }
    for (const g of SDU.guiasAtivas || []) h += g.x != null ? `<div class="sd-guia v" style="left:${g.x * z}px"></div>` : `<div class="sd-guia h" style="top:${g.y * z}px"></div>`;
    if (SDU.medida) h += `<div class="sd-medida" style="left:${SDU.medida.x * z}px;top:${SDU.medida.y * z}px">${SDU.medida.t}</div>`;
    sob.innerHTML = h;
}
function sdMontarMesa() {
    const mesa = sdEl('sd-mesa'), papel = sdEl('sd-papel');
    const pos = e => { const r = papel.getBoundingClientRect(); return [(e.clientX - r.left) / SDU.z, (e.clientY - r.top) / SDU.z]; };
    mesa.addEventListener('mousedown', e => {
        if (e.button !== 0 || !SD.doc) return;
        if (SDU.editando && e.target.closest('.sd-txt[contenteditable="true"]')) return;
        if (SDU.editando) sdFimEdicao();
        const s = sdSlide(), [mx, my] = pos(e);
        const alca = e.target.closest('[data-alca]');
        if (alca) { sdArrastar(e, alca.dataset.alca === 'giro' ? 'giro' : 'alca', alca.dataset.alca, mx, my); return; }
        const camEl = e.target.closest('#sd-palco .sd-c'), cx = e.target.closest('[data-cx]');
        let id = camEl ? camEl.dataset.id : cx ? cx.dataset.cx : null;
        // clique em cima de um selecionado ganha do que está por baixo (permite arrastar o grupo)
        const naSel = SD.sel.map(i => sdCamada(i, s)).find(c => c && sdDentro(c, mx, my));
        if (naSel && !e.shiftKey) id = naSel.id;
        const c = id && sdCamada(id, s);
        if (c && c.trava && !SD.sel.includes(c.id)) id = null;
        if (id) {
            // grupo: o clique pega o grupo inteiro; Ctrl+clique pega só o item
            const doGrupo = c.grupo && !e.ctrlKey ? s.camadas.filter(x => x.grupo === c.grupo).map(x => x.id) : [id];
            if (e.shiftKey) { const tem = SD.sel.includes(id); SD.sel = tem ? SD.sel.filter(i => !doGrupo.includes(i)) : [...new Set([...SD.sel, ...doGrupo])]; sdAvisar('sel'); return; }
            if (!SD.sel.includes(id) || (e.ctrlKey && SD.sel.length > 1)) { SD.sel = doGrupo; sdAvisar('sel'); }
            if (!sdCamada(id, s).trava) sdArrastar(e, 'mover', null, mx, my);
            return;
        }
        if (!e.shiftKey && SD.sel.length) { SD.sel = []; sdAvisar('sel'); }
        sdArrastar(e, 'laco', null, mx, my);
    });
    mesa.addEventListener('dblclick', e => {
        const camEl = e.target.closest('#sd-palco .sd-c') || (e.target.closest('[data-cx]') && SDU.mapa.get(e.target.closest('[data-cx]').dataset.cx)?.el);
        const c = camEl && sdCamada(camEl.dataset.id, sdSlide());
        if (c && c.tipo === 'texto' && !c.trava) sdEditarTexto(c);
        else if (c && (c.tipo === 'imagem' || c.tipo === 'video')) sdTrocarMidia(c);
    });
    mesa.addEventListener('contextmenu', e => {
        e.preventDefault();
        const camEl = e.target.closest('#sd-palco .sd-c'); if (camEl && !SD.sel.includes(camEl.dataset.id)) { SD.sel = [camEl.dataset.id]; sdAvisar('sel'); }
        SDU.ctx = SD.sel.length ? 'objeto' : 'mesa';
        sdAbrirMenuItens(SD.sel.length ? [['Recortar', 'Ctrl+X', () => { sdCopiar(); sdUi('apagar', {}); }], ['Copiar', 'Ctrl+C', sdCopiar], ['Colar', 'Ctrl+V', sdColar, !SDU.clip], ['Duplicar', 'Ctrl+D', () => sdUi('duplicar', {})], ['Apagar', 'Del', () => sdUi('apagar', {})], ['-'],
            ['Trazer para a frente', 'Ctrl+]', () => sdUi('ordem', { para: 'frente' })], ['Enviar para trás', 'Ctrl+[', () => sdUi('ordem', { para: 'tras' })], ['Trazer para o topo', '', () => sdUi('ordem', { para: 'topo' })], ['Enviar para o fundo', '', () => sdUi('ordem', { para: 'fundo' })], ['-'],
            ['Travar / destravar', 'Ctrl+L', () => sdAlternar('trava')], ['Ocultar / mostrar', 'Ctrl+H', () => sdAlternar('oculto')], ['Usar como fundo do slide', '', () => sdComoFundo(), !SD.sel.map(i => sdCamada(i)).some(c => c && c.tipo === 'imagem')]]
            : [['Colar', 'Ctrl+V', sdColar, !SDU.clip], ['Texto', 'T', () => sdAcao('texto')], ['Imagem ou GIF…', '', () => sdAcao('imagem')], ['Vídeo…', '', () => sdAcao('video')], ['-'], ['Novo slide', 'Ctrl+M', () => sdUi('slide_novo', {})], ['Selecionar tudo', 'Ctrl+A', () => sdUi('selecionar', { ids: sdSlide().camadas.map(c => c.id) })]], [e.clientX, e.clientY]);
    });
    mesa.addEventListener('wheel', e => {
        if (!e.ctrlKey) return; e.preventDefault();
        SDU.ajustar = false; SDU.z = Math.max(0.1, Math.min(4, SDU.z * (e.deltaY < 0 ? 1.1 : 0.9))); sdAplicarZoom();
    }, { passive: false });
    // arrastar arquivos do Explorer (imagem, GIF, vídeo, .pptx/.dknv)
    mesa.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); mesa.classList.add('solta'); } });
    mesa.addEventListener('dragleave', () => mesa.classList.remove('solta'));
    mesa.addEventListener('drop', async e => {
        mesa.classList.remove('solta');
        const fs = [...(e.dataTransfer && e.dataTransfer.files || [])]; if (!fs.length) return;
        e.preventDefault(); e.stopPropagation();
        const [mx, my] = pos(e);
        let k = 0;
        for (const f of fs) {
            let p = (f.pywebviewFullPath || f.path || '').replace(/\\/g, '/');
            if (/\.(pptx|dknv)$/i.test(p)) { if (await sdPodeDescartar()) sdRelatorio(await sdUi('abrir', { caminho: p })); return; }
            if (!p && /^image\//.test(f.type)) { const d = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); const r = await sdApi().sd_gravar_midia(d, f.name || 'imagem'); p = r && r.path; }
            if (!p) continue;
            const tipo = SD_EXT_VID.test(p) ? 'video' : SD_EXT_IMG.test(p) ? 'imagem' : null; if (!tipo) continue;
            const r = await sdUi(tipo, { src: p });
            if (r) { const c = sdCamada(r.id, sdSlide()); c.x = Math.round(mx - c.w / 2 + k * 30); c.y = Math.round(my - c.h / 2 + k * 30); k++; sdMudou('camadas'); }
        }
    });
}
function sdAbrirMenuItens(itens, xy) {
    sdFecharMenu();
    const box = document.createElement('div'); box.className = 'sd-pop';
    box.innerHTML = itens.map((it, i) => it[0] === '-' ? '<hr>' : `<button data-i="${i}"${it[3] ? ' disabled' : ''}><span>${sdEsc(it[0])}</span><kbd>${sdEsc(it[1] || '')}</kbd></button>`).join('');
    document.body.appendChild(box);
    box.style.left = Math.min(xy[0], innerWidth - box.offsetWidth - 6) + 'px'; box.style.top = Math.min(xy[1], innerHeight - box.offsetHeight - 6) + 'px';
    box.onclick = ev => { const b = ev.target.closest('button[data-i]'); if (!b) return; sdFecharMenu(); itens[+b.dataset.i][2](); };
    SDU.menu = box; setTimeout(() => document.addEventListener('mousedown', sdFecharMenuFora, true), 0);
}
function sdDentro(c, x, y) {   // ponto dentro da caixa girada
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2, a = -(+c.rot || 0) * Math.PI / 180;
    const dx = x - cx, dy = y - cy, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= c.w / 2 && Math.abs(ly) <= c.h / 2;
}
async function sdComoFundo() {
    const c = SD.sel.map(i => sdCamada(i)).find(x => x && x.tipo === 'imagem'); if (!c) return;
    await sdUi('slide_fundo', { tipo: 'imagem', img: c.src, ajuste: 'cobrir' }); await sdUi('apagar', { ids: [c.id] });
}
async function sdTrocarMidia(c) {
    const p = await sdApi().vk_dialogo('abrir', c.tipo === 'imagem' ? ['Imagens e GIF (*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp;*.svg)'] : ['Vídeos (*.mp4;*.mov;*.webm;*.m4v;*.mkv)']);
    if (!p) return; await sdUrl(p.replace(/\\/g, '/')); sdUi('editar', { ids: [c.id], src: p.replace(/\\/g, '/') });
}

// arrastos: mover (com encaixe), alças (com giro e proporção), giro (Shift = 15°), laço
function sdArrastar(e, modo, alca, mx, my) {
    e.preventDefault();
    const s = sdSlide(), W = SD.doc.largura, H = SD.doc.altura, papel = sdEl('sd-papel');
    const cs = SD.sel.map(i => sdCamada(i, s)).filter(c => c && !c.trava);
    const ini = cs.map(c => ({ c, x: c.x, y: c.y, w: c.w, h: c.h, rot: +c.rot || 0 }));
    let mudou = false, histFeito = false;
    const hist = () => { if (!histFeito) { sdHist(); histFeito = true; } };
    const outros = s.camadas.filter(c => !SD.sel.includes(c.id) && !c.oculto);
    const alvosX = [0, W / 2, W, ...outros.flatMap(c => [c.x, c.x + c.w / 2, c.x + c.w])], alvosY = [0, H / 2, H, ...outros.flatMap(c => [c.y, c.y + c.h / 2, c.y + c.h])];
    const mm = ev => {
        const r = papel.getBoundingClientRect(), x = (ev.clientX - r.left) / SDU.z, y = (ev.clientY - r.top) / SDU.z;
        let dx = x - mx, dy = y - my;
        if (modo === 'laco') { SDU.laco = [mx, my, x, y]; sdRenderSobre(); return; }
        if (!mudou && Math.hypot(dx, dy) * SDU.z < 3) return;
        mudou = true; hist();
        SDU.guiasAtivas = []; SDU.medida = null;
        if (modo === 'mover') {
            if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
            const bx = Math.min(...ini.map(o => o.x)) + dx, by = Math.min(...ini.map(o => o.y)) + dy;
            const bw = Math.max(...ini.map(o => o.x + o.w)) - Math.min(...ini.map(o => o.x)), bh = Math.max(...ini.map(o => o.y + o.h)) - Math.min(...ini.map(o => o.y));
            if (SDU.guias && !ev.altKey) {
                const lim = 7 / SDU.z;
                let melhor = null; for (const [k, v] of [[0, bx], [bw / 2, bx + bw / 2], [bw, bx + bw]]) for (const a of alvosX) { const d = a - v; if (Math.abs(d) < lim && (!melhor || Math.abs(d) < Math.abs(melhor.d))) melhor = { d, a }; }
                if (melhor) { dx += melhor.d; SDU.guiasAtivas.push({ x: melhor.a }); }
                melhor = null; for (const [k, v] of [[0, by], [bh / 2, by + bh / 2], [bh, by + bh]]) for (const a of alvosY) { const d = a - v; if (Math.abs(d) < lim && (!melhor || Math.abs(d) < Math.abs(melhor.d))) melhor = { d, a }; }
                if (melhor) { dy += melhor.d; SDU.guiasAtivas.push({ y: melhor.a }); }
            }
            ini.forEach(o => { o.c.x = Math.round(o.x + dx); o.c.y = Math.round(o.y + dy); });
            const c0 = ini[0] && ini[0].c; if (c0) SDU.medida = { x: c0.x, y: c0.y - 34 / SDU.z, t: `${c0.x}, ${c0.y}` };
        } else if (modo === 'alca' && ini.length === 1) {
            const o = ini[0], a = o.rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
            const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
            const sx = alca.includes('e') ? 1 : alca.includes('w') ? -1 : 0, sy = alca.includes('s') ? 1 : alca.includes('n') ? -1 : 0;
            let w = Math.max(8, o.w + sx * lx), h = Math.max(8, o.h + sy * ly);
            const prop = (o.c.tipo === 'imagem' || o.c.tipo === 'video') ? !ev.shiftKey : ev.shiftKey;
            if (prop && sx && sy) { const k = Math.max(w / o.w, h / o.h); w = o.w * k; h = o.h * k; }
            if (ev.altKey) { o.c.w = Math.round(w + (w - o.w) * (sx ? 1 : 0)); o.c.h = Math.round(h + (h - o.h) * (sy ? 1 : 0)); o.c.x = Math.round(o.x + o.w / 2 - o.c.w / 2); o.c.y = Math.round(o.y + o.h / 2 - o.c.h / 2); }
            else {
                const dw = w - o.w, dh = h - o.h, cxo = o.x + o.w / 2 + (sx * dw / 2) * cos - (sy * dh / 2) * sin, cyo = o.y + o.h / 2 + (sx * dw / 2) * sin + (sy * dh / 2) * cos;
                o.c.w = Math.round(w); o.c.h = Math.round(h); o.c.x = Math.round(cxo - w / 2); o.c.y = Math.round(cyo - h / 2);
            }
            SDU.medida = { x: o.c.x + o.c.w, y: o.c.y + o.c.h + 8 / SDU.z, t: `${o.c.w} × ${o.c.h}` };
        } else if (modo === 'giro' && ini.length === 1) {
            const o = ini[0], cx = o.x + o.w / 2, cy = o.y + o.h / 2;
            let ang = o.rot + (Math.atan2(y - cy, x - cx) - Math.atan2(my - cy, mx - cx)) * 180 / Math.PI;
            ang = ((ang % 360) + 540) % 360 - 180;
            if (ev.shiftKey) ang = Math.round(ang / 15) * 15; else for (const g of [-180, -90, 0, 90, 180]) if (Math.abs(ang - g) < 3) ang = g;
            o.c.rot = Math.round(ang * 10) / 10;
            SDU.medida = { x: cx, y: o.y - 50 / SDU.z, t: `${o.c.rot}°` };
        }
        sdRenderMesa();
    };
    const mu = ev => {
        removeEventListener('mousemove', mm); removeEventListener('mouseup', mu);
        SDU.guiasAtivas = []; SDU.medida = null;
        if (modo === 'laco') {
            const L = SDU.laco; SDU.laco = null;
            if (L) {
                const [x0, x1] = [Math.min(L[0], L[2]), Math.max(L[0], L[2])], [y0, y1] = [Math.min(L[1], L[3]), Math.max(L[1], L[3])];
                const ids = s.camadas.filter(c => !c.trava && !c.oculto && c.x < x1 && c.x + c.w > x0 && c.y < y1 && c.y + c.h > y0).map(c => c.id);
                SD.sel = ev.shiftKey ? [...new Set([...SD.sel, ...ids])] : ids;
            }
            sdAvisar('sel'); return;
        }
        if (mudou) sdMudou('camadas'); else sdRenderSobre();
    };
    addEventListener('mousemove', mm); addEventListener('mouseup', mu);
}

// ───────────── texto no lugar ─────────────
function sdEditarTexto(c) {
    const m = SDU.mapa.get(c.id); if (!m) return;
    const t = m.el.querySelector('.sd-txt'); if (!t) return;
    SDU.editando = c.id; SD.sel = [c.id];
    t.contentEditable = 'true'; t.spellcheck = true; m.el.classList.add('editando');
    t.focus();
    const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents(t); sel.removeAllRanges(); sel.addRange(rg);
    document.execCommand('styleWithCSS', false, true);
    sdRenderSobre(); sdBarraFmt(); sdRenderPaineis();
    t.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); sdFimEdicao(); } }, { once: false });
}
function sdLimparHtml(h) {
    const d = document.createElement('div'); d.innerHTML = h;
    d.querySelectorAll('div,p').forEach(el => { if (el.previousSibling) el.before(document.createElement('br')); el.replaceWith(...el.childNodes); });
    d.querySelectorAll('*').forEach(el => {
        if (!/^(B|STRONG|I|EM|U|BR|SPAN|FONT)$/.test(el.tagName)) { el.replaceWith(...el.childNodes); return; }
        if (el.tagName === 'FONT') { const sp = document.createElement('span'); if (el.color) sp.style.color = el.color; sp.append(...el.childNodes); el.replaceWith(sp); return; }
        const keep = {}; for (const k of ['color', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'font-family', 'background-color']) if (el.style && el.style.getPropertyValue(k)) keep[k] = el.style.getPropertyValue(k);
        [...el.attributes].forEach(a => el.removeAttribute(a.name));
        const st = Object.entries(keep).map(([k, v]) => `${k}:${v}`).join(';'); if (st) el.setAttribute('style', st);
    });
    return d.innerHTML.replace(/(<br>)+$/, '');
}
function sdFimEdicao() {
    const id = SDU.editando; if (!id) return;
    SDU.editando = null;
    const m = SDU.mapa.get(id), c = sdCamada(id, sdSlide());
    if (!m || !c) return;
    const t = m.el.querySelector('.sd-txt'); t.contentEditable = 'false'; m.el.classList.remove('editando');
    const h = sdLimparHtml(t.innerHTML), alt = Math.ceil(t.scrollHeight + (+c.pad || 0) * 2);
    getSelection().removeAllRanges();
    const props = {}; if (h !== (c.html || '')) props.html = h; if (alt > c.h + 1) props.h = alt;
    if (Object.keys(props).length) sdUi('editar', { ids: [id], ...props }); else { SDU.mapa.delete(id); sdRenderMesa(); }
    sdBarraFmt();
}
// barra de formatação do texto: com o texto em edição, vale para o trecho selecionado; senão, para a camada inteira
function sdBarraFmt() {
    const g = sdEl('sd-fmt'); if (!g) return;
    const cs = SD.sel.map(i => sdCamada(i, sdSlide())).filter(Boolean), txt = cs.length && cs.every(c => c.tipo === 'texto');
    g.hidden = !txt; if (!txt) { g.innerHTML = ''; return; }
    const c = cs[0];
    g.innerHTML = `<input class="sd-fonte" list="sd-fontes" value="${sdEsc(c.fonte || '')}" data-fk="fonte" title="Fonte">
        <input class="sd-tam" type="number" min="6" max="600" value="${Math.round(c.tam || 40)}" data-fk="tam" title="Tamanho (px)">
        <button class="sd-ic" data-fmt="bold" title="Negrito (Ctrl+B)"><b>N</b></button><button class="sd-ic" data-fmt="italic" title="Itálico (Ctrl+I)"><i>I</i></button><button class="sd-ic" data-fmt="underline" title="Sublinhado (Ctrl+U)"><u>S</u></button>
        <label class="sd-cor" title="Cor do texto"><input type="color" value="${sdHex6(c.cor)}" data-fk="cor"><b style="background:${sdEsc(c.cor)}"></b></label>
        ${['esq', 'centro', 'dir', 'just'].map(k => `<button class="sd-ic${c.alin === k ? ' on' : ''}" data-fmt="alin:${k}" title="${{ esq: 'À esquerda', centro: 'Centralizado', dir: 'À direita', just: 'Justificado' }[k]}">${{ esq: '☰', centro: '≡', dir: '☰', just: '▤' }[k]}</button>`).join('')}`;
    g.querySelectorAll('[data-fk]').forEach(inp => inp.addEventListener('change', () => {
        const k = inp.dataset.fk, v = k === 'tam' ? +inp.value : inp.value;
        if (SDU.editando && k === 'cor') { document.execCommand('foreColor', false, v); return; }
        if (SDU.editando && k === 'tam') { sdTamTrecho(v); return; }
        sdUi('editar', { [k]: v });
    }));
}
function sdTamTrecho(px) {
    const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) { const c = sdCamada(SDU.editando, sdSlide()); if (c) { c.tam = px; SDU.mapa.get(c.id).el.querySelector('.sd-txt').style.fontSize = px + 'px'; } return; }
    const sp = document.createElement('span'); sp.style.fontSize = px + 'px';
    try { sp.appendChild(sel.getRangeAt(0).extractContents()); sel.getRangeAt(0).insertNode(sp); } catch (e) { /* seleção estranha */ }
}
function sdFmt(f) {
    if (f.startsWith('alin:')) return sdUi('editar', { alin: f.slice(5) });
    if (SDU.editando) { document.execCommand(f); return; }
    const k = { bold: 'peso', italic: 'italico', underline: 'sublinhado' }[f], cs = sdAlvos({});
    if (k === 'peso') return sdUi('editar', { peso: cs.every(c => +c.peso >= 600) ? 400 : 700 });
    return sdUi('editar', { [k]: cs.every(c => c[k]) ? null : true });
}
const sdHex6 = c => { const s = sdCorHex(c || '#000000'); return /^#[0-9a-f]{6}$/i.test(s) ? s : /^#[0-9a-f]{3}$/i.test(s) ? '#' + [...s.slice(1)].map(x => x + x).join('') : '#000000'; };

// ───────────── lista de slides ─────────────
function sdMontarLista() {
    const L = sdEl('sd-lista');
    L.addEventListener('click', e => {
        const n = e.target.closest('[data-novo]'); if (n) { sdAbrirMenu('slide', n); return; }
        const it = e.target.closest('[data-si]'); if (!it) return;
        if (SDU.editando) sdFimEdicao();
        SD.atual = +it.dataset.si; SD.sel = []; sdAvisar('atual');
    });
    L.addEventListener('contextmenu', e => {
        const it = e.target.closest('[data-si]'); if (!it) return; e.preventDefault();
        SD.atual = +it.dataset.si; SD.sel = []; sdAvisar('atual');
        sdAbrirMenuItens([['Novo slide', 'Ctrl+M', () => sdUi('slide_novo', {})], ['Duplicar', '', () => sdUi('slide_duplicar', {})], [sdSlide().oculto ? 'Mostrar' : 'Ocultar', '', () => sdUi('slide_props', { oculto: !sdSlide().oculto })],
            ['-'], ['Mover para cima', '', () => sdUi('slide_mover', { para: SD.atual }), SD.atual === 0], ['Mover para baixo', '', () => sdUi('slide_mover', { para: SD.atual + 2 }), SD.atual === SD.doc.slides.length - 1],
            ['-'], ['Apresentar daqui', 'Shift+F5', () => sdApresentar(SD.atual)], ['Apagar', 'Del', () => sdUi('slide_apagar', {}), SD.doc.slides.length < 2]], [e.clientX, e.clientY]);
    });
    L.addEventListener('dragstart', e => { const it = e.target.closest('[data-si]'); if (!it) return; SDU.slideArr = +it.dataset.si; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'sd'); });
    L.addEventListener('dragover', e => {
        if (SDU.slideArr == null) return; e.preventDefault();
        const it = e.target.closest('[data-si]'); L.querySelectorAll('.antes,.depois').forEach(x => x.classList.remove('antes', 'depois'));
        if (it) { const r = it.getBoundingClientRect(); it.classList.add(e.clientY < r.top + r.height / 2 ? 'antes' : 'depois'); }
    });
    L.addEventListener('drop', e => {
        if (SDU.slideArr == null) return; e.preventDefault();
        const it = e.target.closest('[data-si]'), de = SDU.slideArr; SDU.slideArr = null;
        L.querySelectorAll('.antes,.depois').forEach(x => x.classList.remove('antes', 'depois'));
        if (!it) return;
        const r = it.getBoundingClientRect(); let para = +it.dataset.si + (e.clientY < r.top + r.height / 2 ? 0 : 1);
        if (para > de) para--;
        if (para !== de) sdUi('slide_mover', { slide: de + 1, para: para + 1 });
    });
    L.addEventListener('dragend', () => { SDU.slideArr = null; });
}
function sdRenderLista() {
    const L = sdEl('sd-lista'); if (!L || !SD.doc) return;
    const k = 176 / SD.doc.largura;
    L.innerHTML = SD.doc.slides.map((s, i) => `<div class="sd-it${i === SD.atual ? ' on' : ''}${s.oculto ? ' oculto' : ''}" data-si="${i}" draggable="true">
        <span class="sd-n">${i + 1}</span><div class="sd-mini" style="width:${SD.doc.largura * k}px;height:${SD.doc.altura * k}px"><div class="sd-mini-in" data-mini="${s.id}" style="transform:scale(${k})"></div></div></div>`).join('') +
        '<button class="sd-novo" data-novo="1">+ Novo slide</button>';
    SD.doc.slides.forEach(s => sdMini(s));
    sdMarcarLista();
}
function sdMini(s) {
    const box = document.querySelector(`[data-mini="${s.id}"]`); if (!box) return;
    box.innerHTML = ''; box.appendChild(sdMontarSlide(s, 'mini'));
}
function sdMiniAgendar(s) { if (!s) return; clearTimeout(SDU.tm); SDU.tm = setTimeout(() => sdMini(s), 250); }
function sdMarcarLista() {
    document.querySelectorAll('#sd-lista .sd-it').forEach((el, i) => el.classList.toggle('on', i === SD.atual));
    const on = document.querySelector('#sd-lista .sd-it.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    sdTitulo();
}
function sdRenderNotas() { const n = sdEl('sd-notas'), s = sdSlide(); if (n && s && document.activeElement !== n) n.value = s.notas || ''; }

// ───────────── painéis Design e Camadas ─────────────
function sdMontarPaineis() {
    const P = sdEl('sd-props');
    const valor = inp => inp.type === 'checkbox' ? (inp.checked || null) : inp.type === 'number' || inp.type === 'range' ? (inp.value === '' ? null : +inp.value * (+inp.dataset.k_ || 1)) : inp.value;
    const aplicar = (inp, final) => {
        const k = inp.dataset.p, alvo = inp.dataset.alvo || 'camada', v = valor(inp);
        if (!final && !SDU.vivo) { sdHist(); SDU.vivo = true; }
        const set = (o, path, val) => { const ks = path.split('.'); let x = o; for (const q of ks.slice(0, -1)) x = x[q] = x[q] || {}; if (val === null || val === '') delete x[ks.at(-1)]; else x[ks.at(-1)] = val; };
        if (alvo === 'camada') sdAlvos({}).forEach(c => set(c, k, v));
        else if (alvo === 'slide') set(sdSlide(), k, v);
        else if (alvo === 'tema') set(SD.doc, k, v);
        if (final) { if (!SDU.vivo) sdHist(); SDU.vivo = false; sdMudou(alvo === 'tema' ? 'tudo' : alvo === 'slide' ? 'slide' : 'camadas'); }
        else { sdRenderMesa(); const r = inp.closest('.sd-row'); const o = r && r.querySelector('output'); if (o) o.textContent = inp.value; }
    };
    P.addEventListener('input', e => { const inp = e.target.closest('[data-p]'); if (inp && inp.type !== 'checkbox' && inp.tagName !== 'SELECT') aplicar(inp, false); });
    P.addEventListener('change', e => { const inp = e.target.closest('[data-p]'); if (inp) { aplicar(inp, true); } });
    P.addEventListener('click', async e => {
        const b = e.target.closest('[data-pa]'); if (!b) return;
        const a = b.dataset.pa;
        if (a === 'fundo-img') { const p = await sdApi().vk_dialogo('abrir', ['Imagens (*.png;*.jpg;*.jpeg;*.gif;*.webp)']); if (p) sdUi('slide_fundo', { tipo: 'imagem', img: p.replace(/\\/g, '/') }); }
        else if (a === 'fundo-todos') sdUi('slide_fundo', { ...sdSlide().fundo, todos: true });
        else if (a === 'trans-todos') sdUi('slide_transicao', { ...(sdSlide().transicao || {}), todos: true });
        else if (a.startsWith('tema:')) { const T = sdClone(SD_TEMAS[a.slice(5)]); delete T.nome; await sdUi('tema', { ...T, aplicar: true }); }
        else if (a === 'tema-aplicar') { const T = SD.doc.tema; SD.doc.tema = SDU.temaAntes || T; await sdUi('tema', { ...sdClone(T), aplicar: true }); SDU.temaAntes = null; }
        else if (a === 'sombra') { const cs = sdAlvos({}); sdUi('editar', { sombra: cs.every(c => c.sombra) ? null : { x: 0, y: 12, desf: 36, cor: 'rgba(0,0,0,.35)' } }); }
        else if (a === 'trocar') { const c = sdAlvos({})[0]; if (c) sdTrocarMidia(c); }
        else if (a === 'anim-ver') { sdApresentar(SD.atual, { soEste: true }); }
    });
    P.addEventListener('focusin', e => { if (e.target.closest('[data-alvo="tema"]') && !SDU.temaAntes) SDU.temaAntes = sdClone(SD.doc.tema); });
    const C = sdEl('sd-camadas');
    C.addEventListener('click', e => {
        const b = e.target.closest('[data-cv]'); if (b) { e.stopPropagation(); const c = sdCamada(b.dataset.id, sdSlide()); sdUi('editar', { ids: [c.id], [b.dataset.cv]: c[b.dataset.cv] ? null : true }); return; }
        const it = e.target.closest('[data-ci]'); if (!it) return;
        const id = it.dataset.ci;
        SD.sel = e.shiftKey || e.ctrlKey ? (SD.sel.includes(id) ? SD.sel.filter(i => i !== id) : [...SD.sel, id]) : [id];
        sdAvisar('sel');
    });
    C.addEventListener('dblclick', e => {
        const it = e.target.closest('[data-ci]'); if (!it) return;
        const c = sdCamada(it.dataset.ci, sdSlide()), nome = prompt('Nome da camada', c.nome || '');
        if (nome != null) sdUi('agrupar_nome', { id: c.id, nome });
    });
    C.addEventListener('dragstart', e => { const it = e.target.closest('[data-ci]'); if (it) { SDU.camArr = it.dataset.ci; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'c'); } });
    C.addEventListener('dragover', e => { if (SDU.camArr) e.preventDefault(); });
    C.addEventListener('drop', e => {
        if (!SDU.camArr) return; e.preventDefault();
        const it = e.target.closest('[data-ci]'), id = SDU.camArr; SDU.camArr = null; if (!it || it.dataset.ci === id) return;
        const L = sdSlide().camadas, alvo = L.findIndex(c => c.id === it.dataset.ci);
        sdUi('ordem', { ids: [id], para: alvo });
    });
}
function sdRenderPaineis() {
    if (!SD.doc) return;
    const P = sdEl('sd-props'), C = sdEl('sd-camadas'); if (!P) return;
    if (SDU.aba === 'camadas') sdRenderCamadas(C);
    if (P.contains(document.activeElement) && document.activeElement.matches('input[type=text],input[type=number],textarea')) return;
    const cs = sdAlvos({});
    P.innerHTML = cs.length ? sdPainelCamada(cs) : sdPainelSlide();
}
function sdRenderCamadas(C) {
    const s = sdSlide(), ic = { texto: 'T', forma: '◆', imagem: '▣', video: '▶' };
    C.innerHTML = s.camadas.length ? [...s.camadas].reverse().map(c => `<div class="sd-cam${SD.sel.includes(c.id) ? ' on' : ''}${c.oculto ? ' oculta' : ''}" data-ci="${c.id}" draggable="true">
        <span class="sd-cam-ic">${ic[c.tipo] || '•'}</span>${c.grupo ? '<span class="sd-cam-g" title="Em grupo">⧉</span>' : ''}<span class="sd-cam-n">${sdEsc(c.nome || (c.tipo === 'texto' ? sdTextoPuro(c).slice(0, 30) : c.tipo))}</span>
        <button class="sd-cam-b${c.oculto ? ' off' : ''}" data-cv="oculto" data-id="${c.id}" title="Ocultar / mostrar">${c.oculto ? '◌' : '●'}</button>
        <button class="sd-cam-b${c.trava ? ' on' : ''}" data-cv="trava" data-id="${c.id}" title="Travar / destravar">${c.trava ? '🔒' : '🔓'}</button></div>`).join('')
        : '<p class="sd-vazio">Slide sem camadas. Use a barra acima para inserir texto, formas, imagens e vídeos.</p>';
}
// linhas de propriedades
const sdN = (p, rot, v, o = {}) => `<label class="sd-row"><span>${rot}</span><input type="number" data-p="${p}" value="${v ?? ''}" step="${o.step || 1}"${o.min != null ? ` min="${o.min}"` : ''}${o.max != null ? ` max="${o.max}"` : ''}${o.alvo ? ` data-alvo="${o.alvo}"` : ''}></label>`;
const sdR = (p, rot, v, min, max, step = 1, o = {}) => `<label class="sd-row"><span>${rot}</span><input type="range" data-p="${p}" min="${min}" max="${max}" step="${step}" value="${v ?? min}"${o.k ? ` data-k_="${o.k}"` : ''}${o.alvo ? ` data-alvo="${o.alvo}"` : ''}><output>${o.mostra != null ? o.mostra : v ?? ''}</output></label>`;
const sdCor = (p, rot, v, o = {}) => `<label class="sd-row"><span>${rot}</span><span class="sd-corin"><input type="color" data-p="${p}" value="${sdHex6(v)}"${o.alvo ? ` data-alvo="${o.alvo}"` : ''}><input type="text" data-p="${p}" value="${sdEsc(v || '')}"${o.alvo ? ` data-alvo="${o.alvo}"` : ''} placeholder="nenhuma"></span></label>`;
const sdS = (p, rot, v, ops, o = {}) => `<label class="sd-row"><span>${rot}</span><select data-p="${p}"${o.alvo ? ` data-alvo="${o.alvo}"` : ''}>${ops.map(([k, n]) => `<option value="${k}"${String(k) === String(v ?? '') ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
const sdC = (p, rot, v, o = {}) => `<label class="sd-row sd-chk"><input type="checkbox" data-p="${p}"${v ? ' checked' : ''}${o.alvo ? ` data-alvo="${o.alvo}"` : ''}><span>${rot}</span></label>`;
const sdT = (p, rot, v, o = {}) => `<label class="sd-row"><span>${rot}</span><input type="text" data-p="${p}" value="${sdEsc(v ?? '')}"${o.list ? ` list="${o.list}"` : ''}${o.alvo ? ` data-alvo="${o.alvo}"` : ''}></label>`;
const sdSec = (t, h) => `<section class="sd-sec"><h5>${t}</h5>${h}</section>`;
function sdPainelCamada(cs) {
    const c = cs[0], tipos = new Set(cs.map(x => x.tipo)), um = tipos.size === 1 ? c.tipo : null;
    let h = sdSec(cs.length > 1 ? `${cs.length} objetos` : ({ texto: 'Texto', forma: 'Forma', imagem: c.src && /\.gif$/i.test(c.src) ? 'GIF' : 'Imagem', video: 'Vídeo' }[c.tipo]),
        `<div class="sd-grade2">${sdN('x', 'X', Math.round(c.x))}${sdN('y', 'Y', Math.round(c.y))}${sdN('w', 'Larg.', Math.round(c.w), { min: 1 })}${sdN('h', 'Alt.', Math.round(c.h), { min: 1 })}${sdN('rot', 'Giro °', c.rot || 0, { step: 1 })}</div>
        ${sdR('opac', 'Opacidade', Math.round((c.opac ?? 1) * 100), 0, 100, 1, { k: 0.01, mostra: Math.round((c.opac ?? 1) * 100) + '%' })}`);
    if (um === 'texto') h += sdSec('Tipografia', `${sdT('fonte', 'Fonte', c.fonte, { list: 'sd-fontes' })}<div class="sd-grade2">${sdN('tam', 'Tamanho', c.tam, { min: 4 })}${sdS('peso', 'Peso', c.peso || 400, [[100, 'Fino'], [200, 'Extraleve'], [300, 'Leve'], [400, 'Normal'], [500, 'Médio'], [600, 'Seminegrito'], [700, 'Negrito'], [800, 'Extranegrito'], [900, 'Preto']])}</div>
        ${sdCor('cor', 'Cor', c.cor)}<div class="sd-grade2">${sdS('alin', 'Alinhar', c.alin || 'esq', [['esq', 'Esquerda'], ['centro', 'Centro'], ['dir', 'Direita'], ['just', 'Justificado']])}${sdS('valin', 'Vertical', c.valin || 'topo', [['topo', 'Topo'], ['meio', 'Meio'], ['base', 'Base']])}</div>
        <div class="sd-grade2">${sdN('entrelinha', 'Entrelinha', c.entrelinha || 1.2, { step: 0.05, min: 0.6 })}${sdN('espaco', 'Espaçamento', c.espaco || 0, { step: 0.5 })}</div>
        ${sdS('caixa', 'Caixa', c.caixa || '', [['', 'Como digitado'], ['alta', 'MAIÚSCULAS'], ['baixa', 'minúsculas']])}${sdC('italico', 'Itálico', c.italico)}`) +
        sdSec('Caixa do texto', `${sdCor('fundo', 'Fundo', c.fundo)}<div class="sd-grade2">${sdN('pad', 'Margem', c.pad || 0, { min: 0 })}${sdN('raio', 'Cantos', c.raio || 0, { min: 0 })}</div>`);
    if (um === 'forma') h += sdSec('Forma', `${sdS('forma', 'Tipo', c.forma, SD_FORMAS)}${sdCor('preench', 'Preenchimento', c.preench)}${sdCor('preench2', 'Degradê até', c.preench2)}${c.preench2 ? sdR('angulo', 'Ângulo', c.angulo ?? 90, 0, 360) : ''}
        ${sdCor('traco', 'Contorno', c.traco)}<div class="sd-grade2">${sdN('espessura', 'Espessura', c.espessura || 0, { min: 0 })}${c.forma === 'ret' || c.forma === 'balao' ? sdN('raio', 'Cantos', c.raio || 0, { min: 0 }) : ''}</div>
        ${c.forma === 'linha' ? sdS('ponta', 'Ponta', c.ponta || '', [['', 'Nenhuma'], ['seta', 'Seta']]) : ''}${sdC('tracejado', 'Tracejado', c.tracejado)}`);
    if (um === 'imagem' || um === 'video') h += sdSec(um === 'video' ? 'Vídeo' : 'Imagem', `<button class="sd-btn sd-larga" data-pa="trocar">Trocar arquivo…</button>
        ${sdS('ajuste', 'Ajuste', c.ajuste || 'cobrir', [['cobrir', 'Preencher (cortar)'], ['conter', 'Caber inteira'], ['esticar', 'Esticar']])}${sdN('raio', 'Cantos', c.raio || 0, { min: 0 })}
        ${(c.ajuste || 'cobrir') === 'cobrir' ? sdR('focoX', 'Foco ↔', c.focoX ?? 50, 0, 100) + sdR('focoY', 'Foco ↕', c.focoY ?? 50, 0, 100) : ''}
        ${um === 'video' ? sdC('auto', 'Tocar sozinho ao entrar no slide', c.auto) + sdC('loop', 'Repetir', c.loop) + sdC('mudo', 'Sem som', c.mudo) + sdN('ini', 'Começar em (s)', c.ini || 0, { step: 0.1, min: 0 }) : ''}
        ${um === 'imagem' ? sdR('filtros.brilho', 'Brilho', c.filtros?.brilho ?? 100, 0, 200) + sdR('filtros.contraste', 'Contraste', c.filtros?.contraste ?? 100, 0, 200) + sdR('filtros.saturacao', 'Saturação', c.filtros?.saturacao ?? 100, 0, 200) + sdR('filtros.pb', 'Preto e branco', c.filtros?.pb ?? 0, 0, 100) : ''}
        ${sdN('borda.esp', 'Borda', c.borda?.esp || 0, { min: 0 })}${sdCor('borda.cor', 'Cor da borda', c.borda?.cor || '#ffffff')}`);
    h += sdSec('Efeitos', `<button class="sd-btn sd-larga${cs.every(x => x.sombra) ? ' on' : ''}" data-pa="sombra">${cs.every(x => x.sombra) ? '✓ ' : ''}Sombra</button>
        ${c.sombra ? `<div class="sd-grade2">${sdN('sombra.x', 'Sombra X', c.sombra.x || 0)}${sdN('sombra.y', 'Sombra Y', c.sombra.y ?? 12)}${sdN('sombra.desf', 'Desfoque', c.sombra.desf ?? 36, { min: 0 })}</div>${sdCor('sombra.cor', 'Cor da sombra', c.sombra.cor || 'rgba(0,0,0,.35)')}` : ''}
        ${sdN('desfoque', 'Desfocar', c.desfoque || 0, { min: 0 })}${sdS('mescla', 'Mesclagem', c.mescla || 'normal', SD_MESCLAS.map(m => [m, { normal: 'Normal', multiply: 'Multiplicar', screen: 'Tela', overlay: 'Sobrepor', darken: 'Escurecer', lighten: 'Clarear', 'color-dodge': 'Subexposição', 'color-burn': 'Superexposição', 'soft-light': 'Luz suave', 'hard-light': 'Luz forte', difference: 'Diferença', luminosity: 'Luminosidade' }[m]]))}`);
    h += sdSec('Animação de entrada', `${sdS('anim.tipo', 'Efeito', c.anim?.tipo || 'nenhuma', SD_ANIMS)}${c.anim && c.anim.tipo !== 'nenhuma' ? `<div class="sd-grade2">${sdN('anim.dur', 'Duração (s)', c.anim.dur ?? 0.6, { step: 0.1, min: 0.1 })}${sdN('anim.atraso', 'Atraso (s)', c.anim.atraso || 0, { step: 0.1, min: 0 })}</div>${sdC('anim.clique', 'Esperar o clique (passo da apresentação)', c.anim.clique)}<button class="sd-btn sd-larga" data-pa="anim-ver">▶ Ver no slide</button>` : ''}`);
    h += sdSec('Camada', `${sdC('trava', 'Travada (não seleciona na mesa)', c.trava)}${sdC('oculto', 'Oculta', c.oculto)}`);
    return h;
}
function sdPainelSlide() {
    const s = sdSlide(), f = s.fundo || {}, tr = s.transicao || {}, T = SD.doc.tema;
    return sdSec(`Slide ${SD.atual + 1}`, `${sdS('fundo.tipo', 'Fundo', f.tipo || 'cor', [['cor', 'Cor'], ['degrade', 'Degradê'], ['imagem', 'Imagem']], { alvo: 'slide' })}
        ${sdCor('fundo.cor', f.tipo === 'degrade' ? 'Cor 1' : 'Cor', f.cor, { alvo: 'slide' })}
        ${f.tipo === 'degrade' ? sdCor('fundo.cor2', 'Cor 2', f.cor2, { alvo: 'slide' }) + sdR('fundo.angulo', 'Ângulo', f.angulo ?? 135, 0, 360, 1, { alvo: 'slide' }) : ''}
        ${f.tipo === 'imagem' ? `<button class="sd-btn sd-larga" data-pa="fundo-img">${f.img ? 'Trocar imagem…' : 'Escolher imagem…'}</button>${sdS('fundo.ajuste', 'Ajuste', f.ajuste || 'cobrir', [['cobrir', 'Preencher'], ['conter', 'Caber']], { alvo: 'slide' })}${sdR('fundo.escurecer', 'Escurecer', f.escurecer || 0, 0, 0.9, 0.05, { alvo: 'slide' })}` : ''}
        <button class="sd-btn sd-larga" data-pa="fundo-todos">Usar este fundo em todos</button>`) +
        sdSec('Transição', `${sdS('transicao.tipo', 'Efeito', tr.tipo || 'nenhuma', SD_TRANS, { alvo: 'slide' })}${sdN('transicao.dur', 'Duração (s)', tr.dur ?? 0.5, { step: 0.1, min: 0.1, alvo: 'slide' })}
        <button class="sd-btn sd-larga" data-pa="trans-todos">Usar em todos os slides</button>${sdN('dur', 'Tempo no vídeo (s)', s.dur || 5, { step: 0.5, min: 0.5, alvo: 'slide' })}${sdC('oculto', 'Ocultar na apresentação', s.oculto, { alvo: 'slide' })}`) +
        sdSec('Tema da apresentação', `<div class="sd-temas">${Object.entries(SD_TEMAS).map(([k, t]) => `<button class="sd-tema" data-pa="tema:${k}" title="Aplicar o tema ${t.nome} em todos os slides" style="--f:${t.cores.fundo};--t:${t.cores.tinta};--d:${t.cores.destaque}"><i style="font-family:'${t.titulo}'">Aa</i><small>${t.nome}</small></button>`).join('')}</div>
        ${sdT('tema.titulo', 'Fonte dos títulos', T.titulo, { list: 'sd-fontes', alvo: 'tema' })}${sdT('tema.texto', 'Fonte do texto', T.texto, { list: 'sd-fontes', alvo: 'tema' })}
        ${['fundo', 'tinta', 'destaque', 'suave', 'apoio'].map(k => sdCor('tema.cores.' + k, { fundo: 'Fundo', tinta: 'Texto', destaque: 'Destaque', suave: 'Suave', apoio: 'Apoio' }[k], T.cores[k], { alvo: 'tema' })).join('')}
        <button class="sd-btn sd-larga" data-pa="tema-aplicar">Aplicar as mudanças do tema em todos os slides</button>`);
}

// ───────────── área de transferência ─────────────
function sdCopiar() {
    const cs = sdAlvos({}); if (!cs.length) return;
    SDU.clip = sdClone(cs);
    try { localStorage.setItem('sd-clip', JSON.stringify(SDU.clip)); } catch (e) { /* ok */ }
}
async function sdColar() {
    if (!SDU.clip) { try { SDU.clip = JSON.parse(localStorage.getItem('sd-clip') || 'null'); } catch (e) { /* ok */ } }
    if (!SDU.clip) return;
    sdHist();
    const s = sdSlide(), novos = [];
    for (const c of sdClone(SDU.clip)) {
        c.id = sdId(); if (s.camadas.some(x => x.x === c.x && x.y === c.y)) { c.x += 30; c.y += 30; }
        if (c.src) await sdUrl(c.src);
        s.camadas.push(c); novos.push(c.id);
    }
    SD.sel = novos; sdMudou('camadas');
}

// ───────────── teclado ─────────────
document.addEventListener('keydown', e => {
    if (!document.getElementById('page-slider-kanivete')?.classList.contains('active') || !SD.doc || SDU.noLobby) return;
    if (typeof SDS !== 'undefined' && SDS.on) return;   // apresentação tem o teclado dela
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, alvo = e.target;
    const digitando = alvo.closest && (alvo.closest('input,textarea,select') || alvo.isContentEditable);
    const feito = () => { e.preventDefault(); e.stopPropagation(); };
    if (ctrl && k === 's') { feito(); sdSalvarUi(e.shiftKey); return; }
    if (ctrl && k === 'o') { feito(); sdUi('abrir', {}).then(sdRelatorio); return; }
    if (e.key === 'F5') { feito(); sdApresentar(e.shiftKey ? SD.atual : 0); return; }
    if (digitando) return;
    if (ctrl && k === 'z') { feito(); sdDesfazer(e.shiftKey); return; }
    if (ctrl && k === 'y') { feito(); sdDesfazer(true); return; }
    if (ctrl && k === 'n') { feito(); sdPodeDescartar().then(ok => ok && sdUi('novo', {})); return; }
    if (ctrl && k === 'm') { feito(); sdUi('slide_novo', {}); return; }
    if (ctrl && k === 'c') { feito(); sdCopiar(); return; }
    if (ctrl && k === 'x') { feito(); sdCopiar(); sdUi('apagar', {}); return; }
    if (ctrl && k === 'v') { if (SDU.clip || localStorage.getItem('sd-clip')) { feito(); sdColar(); } return; }
    if (ctrl && k === 'd') { feito(); sdUi('duplicar', {}); return; }
    if (ctrl && k === 'a') { feito(); sdUi('selecionar', { ids: sdSlide().camadas.filter(c => !c.trava && !c.oculto).map(c => c.id) }); return; }
    if (ctrl && k === 'g') { feito(); sdUi(e.shiftKey ? 'desagrupar' : 'agrupar', {}); return; }
    if (ctrl && k === 'l') { feito(); sdAlternar('trava'); return; }
    if (ctrl && k === 'h') { feito(); sdAlternar('oculto'); return; }
    if (ctrl && (k === ']' || k === '[' || k === '}' || k === '{')) { feito(); sdUi('ordem', { para: (k === ']' || k === '}') ? (e.shiftKey ? 'topo' : 'frente') : (e.shiftKey ? 'fundo' : 'tras') }); return; }
    if (ctrl && (k === '=' || k === '+')) { feito(); sdAcao('zoom+'); return; }
    if (ctrl && k === '-') { feito(); sdAcao('zoom-'); return; }
    if (ctrl && k === '0') { feito(); sdAcao('ajustar'); return; }
    if (ctrl && k === '1') { feito(); sdAcao('z100'); return; }
    if (ctrl && (k === 'b' || k === 'i' || k === 'u') && SD.sel.length) { feito(); sdFmt({ b: 'bold', i: 'italic', u: 'underline' }[k]); return; }
    if ((k === 'delete' || k === 'backspace')) { feito(); if (SD.sel.length) sdUi('apagar', {}); else if (document.activeElement && document.activeElement.closest('#sd-lista')) sdUi('slide_apagar', {}); return; }
    if (k === 'escape') { if (SD.sel.length) { feito(); SD.sel = []; sdAvisar('sel'); } return; }
    if (k === 't' && !ctrl) { feito(); sdAcao('texto'); return; }
    if (k === 'enter' && SD.sel.length === 1) { const c = sdCamada(SD.sel[0], sdSlide()); if (c && c.tipo === 'texto') { feito(); sdEditarTexto(c); } return; }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) {
        feito();
        if (!SD.sel.length) { const n = SD.atual + (k === 'arrowdown' || k === 'arrowright' ? 1 : -1); if (n >= 0 && n < SD.doc.slides.length) { SD.atual = n; sdAvisar('atual'); } return; }
        const p = e.shiftKey ? 10 : 1;
        if (!SDU.setaHist) { sdHist(); SDU.setaHist = true; }
        sdAlvos({}).forEach(c => { if (k === 'arrowleft') c.x -= p; if (k === 'arrowright') c.x += p; if (k === 'arrowup') c.y -= p; if (k === 'arrowdown') c.y += p; });
        sdRenderMesa(); clearTimeout(SDU.tsh); SDU.tsh = setTimeout(() => { SDU.setaHist = false; sdMudou('camadas'); }, 400);
    }
}, true);
// colar imagem do sistema (print, navegador): grava em <dados>/Slider/colados e insere
document.addEventListener('paste', async e => {
    if (!document.getElementById('page-slider-kanivete')?.classList.contains('active') || !SD.doc || SDU.noLobby) return;
    if (e.target.closest && (e.target.closest('input,textarea') || e.target.isContentEditable)) return;
    const it = [...(e.clipboardData && e.clipboardData.items || [])].find(i => i.type.startsWith('image/')); if (!it) return;
    e.preventDefault();
    const f = it.getAsFile(), d = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    const r = await sdApi().sd_gravar_midia(d, 'colado'); if (r && r.path) sdUi('imagem', { src: r.path });
});
window.SDK_UI = { lobby: sdLobby, editor: sdMostrarEditor, fechar: sdFechar, zoom: () => SDU.z };
