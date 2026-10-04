// Vetor Kanivete — interface: menus, ferramentas, painéis e diálogos (visual do Photo Kanivete: classes ie-*).
// Os botões só chamam comandos (vkCmd) — nada aqui muda o documento por fora deles.
const VK_ICO = {
    selecao: '<path d="M5 3l12 8-6 1.5L8 19z"/>', direta: '<path d="M5 3l12 8-6 1.5L8 19z" fill="currentColor"/>',
    caneta: '<path d="M12 3l6 9-6 9-6-9z"/><circle cx="12" cy="12" r="1.6"/>', texto: '<path d="M5 5h14M12 5v14M9 19h6"/>',
    retangulo: '<rect x="4" y="6" width="16" height="12"/>', elipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    poligono: '<path d="M12 4l7 5-2.7 9H7.7L5 9z"/>', estrela: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    linha: '<path d="M5 19L19 5"/>', contagotas: '<path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/>',
    prancheta: '<rect x="6" y="6" width="12" height="12"/><path d="M3 6h3M18 6h3M3 18h3M18 18h3M6 3v3M6 18v3M18 3v3M18 18v3"/>',
    mao: '<path d="M8 12V6a1.5 1.5 0 013 0v5V4.5a1.5 1.5 0 013 0V11V6a1.5 1.5 0 013 0v8a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5z"/>',
    zoom: '<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5"/>',
};
const vkI = n => `<svg class="ie-i" viewBox="0 0 24 24">${VK_ICO[n] || ''}</svg>`;
const vkEl = id => document.getElementById(id);
const vkEsc_ = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function vkMontar() {
    const raiz = vkEl('vk'); if (!raiz || raiz.dataset.ok) return;
    raiz.dataset.ok = '1';
    raiz.innerHTML = `
    <header class="ie-top">
        <div class="ie-brand"><span class="ie-brand-mark"><svg class="i"><use href="#i-sparkles"/></svg></span> Vetor Kanivete</div>
        <nav class="ie-mbar" id="vk-mbar"></nav>
        <div class="ie-top-spacer"></div>
        <span class="ie-top-info" id="vk-top-info"></span>
        <button class="ie-btn" onclick="vkPainelFechamento(true)" title="Fechamento de arquivo (preflight)"><svg class="i"><use href="#i-shield"/></svg> Fechamento</button>
        <button class="ie-btn" onclick="vkExportarDialogo()" title="PDF para gráfica, PNG, JPG, SVG"><svg class="i"><use href="#i-download"/></svg> Exportar</button>
        <button class="ie-btn ie-btn-primario" onclick="vkCmdUi('salvar', {})" title="Salvar .aknv (Ctrl+S)"><svg class="i"><use href="#i-save"/></svg> Salvar</button>
    </header>
    <div class="ie-opcoes" id="vk-opcoes"></div>
    <div class="ie-corpo vk-corpo">
        <aside class="ie-ferr" id="vk-ferr"></aside>
        <section class="ie-centro">
            <div class="ie-vista vk-vista" id="vk-vista">
                <canvas id="vk-canvas"></canvas>
                <textarea id="vk-texto-edit" class="vk-texto-edit" spellcheck="false" hidden></textarea>
                <div class="ie-inicio" id="vk-inicio">
                    <div class="ie-inicio-box">
                        <div class="ie-inicio-ico"><svg class="i"><use href="#i-sparkles"/></svg></div>
                        <h2>Vetor Kanivete</h2>
                        <p>Vetores para impressão: abra PDF, AI, SVG ou PowerPoint, ou comece do zero. Fecha o arquivo em PDF/X para a gráfica.</p>
                        <div class="ie-inicio-acoes">
                            <button class="ie-btn ie-btn-primario" onclick="vkCmdUi('abrir', {})"><svg class="i"><use href="#i-folder"/></svg> Abrir...</button>
                            <button class="ie-btn" onclick="vkNovoDialogo()"><svg class="i"><use href="#i-file"/></svg> Novo documento</button>
                        </div>
                        <div class="ie-recentes" id="vk-recentes"></div>
                    </div>
                </div>
                <div class="ie-carregando" id="vk-carregando" hidden><div class="ie-carregando-box"><span>Abrindo...</span><div class="ie-barra"><i style="width:60%"></i></div></div></div>
                <div class="vk-avisos" id="vk-avisos"></div>
            </div>
            <footer class="ie-status" id="vk-status"><span id="vk-status-pos"></span><span id="vk-status-info"></span></footer>
        </section>
        <aside class="ie-paineis vk-paineis" id="vk-paineis">
            <section class="ie-painel"><header class="ie-painel-cab">Propriedades</header><div class="ie-painel-corpo vk-props" id="vk-props"></div></section>
            <section class="ie-painel vk-p-abas">
                <header class="ie-painel-cab vk-abas" id="vk-abas">
                    <button data-a="camadas" class="on">Camadas</button><button data-a="pranchetas">Pranchetas</button><button data-a="amostras">Amostras</button><button data-a="fechamento">Fechamento</button>
                </header>
                <div class="ie-painel-corpo vk-aba" id="vk-aba"></div>
            </section>
        </aside>
    </div>
    <div class="ie-modal" id="vk-modal" hidden></div>
    <div class="ie-pop" id="vk-pop" hidden></div>`;
    // ferramentas
    const grupos = [['selecao', 'direta'], ['caneta', 'texto'], ['retangulo', 'elipse', 'poligono', 'estrela', 'linha'], ['contagotas', 'prancheta'], ['mao', 'zoom']];
    vkEl('vk-ferr').innerHTML = `<div class="ie-ferr-lista">${grupos.map(g => g.map(f => `<button class="ie-ferr-btn" data-f="${f}" title="${VK_FERR[f].nome}${VK_FERR[f].tecla ? ' (' + VK_FERR[f].tecla + ')' : ''}">${vkI(f)}</button>`).join('')).join('<div class="ie-ferr-sep"></div>')}</div>
        <div class="vk-cores-ferr" id="vk-cores-ferr"></div>`;
    vkEl('vk-ferr').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) vkFerramenta(b.dataset.f); });
    vkEl('vk-abas').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; VK.aba = b.dataset.a; vkUiAtualizar(); });
    vkMenus();
    vkEventos();
    vkRecentesUi();
}

// ─────────────────────────── menus ───────────────────────────
const VK_MENUS = [
    ['Arquivo', [['Novo...', 'Ctrl+N', () => vkNovoDialogo()], ['Abrir...', 'Ctrl+O', () => vkCmdUi('abrir', {})], ['Colocar (importar)...', 'Shift+Ctrl+P', () => vkCmdUi('importar', {})], '-',
        ['Salvar', 'Ctrl+S', () => vkCmdUi('salvar', {})], ['Salvar como...', 'Shift+Ctrl+S', () => vkCmdUi('salvar', { como: true })], '-',
        ['Exportar PDF para gráfica...', '', () => vkExportarDialogo('pdf')], ['Exportar PNG/JPG...', '', () => vkExportarDialogo('img')], ['Exportar SVG...', '', () => vkCmdUi('exportar_svg', {})], '-',
        ['Configurar documento...', '', () => vkDocDialogo()]]],
    ['Editar', [['Desfazer', 'Ctrl+Z', vkDesfazer], ['Refazer', 'Shift+Ctrl+Z', vkRefazer], '-', ['Duplicar', 'Ctrl+D', () => vkCmdUi('duplicar', { dx: vkPT(5), dy: vkPT(5) })],
        ['Apagar', 'Del', () => vkCmdUi('apagar', {})], ['Selecionar tudo', 'Ctrl+A', () => { VK.sel = vkTodosDaCamada(); vkMudou(); }], '-',
        ['Converter cores para CMYK', '', () => vkCmdUi('converter_cmyk', {})]]],
    ['Objeto', [['Agrupar', 'Ctrl+G', () => vkCmdUi('agrupar', {})], ['Desagrupar', 'Shift+Ctrl+G', () => vkCmdUi('desagrupar', {})], '-',
        ['Trazer para frente', 'Shift+Ctrl+]', () => vkCmdUi('organizar', { modo: 'frente' })], ['Avançar', 'Ctrl+]', () => vkCmdUi('organizar', { modo: 'acima' })],
        ['Recuar', 'Ctrl+[', () => vkCmdUi('organizar', { modo: 'abaixo' })], ['Enviar para trás', 'Shift+Ctrl+[', () => vkCmdUi('organizar', { modo: 'tras' })], '-',
        ['Máscara de corte', 'Ctrl+7', () => vkCmdUi('mascara', {})], ['Soltar máscara', 'Alt+Ctrl+7', () => vkCmdUi('soltar_mascara', {})],
        ['Caminho composto', 'Ctrl+8', () => vkCmdUi('composto', {})], '-',
        ['Refletir na vertical', '', () => vkCmdUi('refletir', { eixo: 'vertical' })], ['Refletir na horizontal', '', () => vkCmdUi('refletir', { eixo: 'horizontal' })],
        ['Girar 90°', '', () => vkCmdUi('girar', { graus: 90 })], '-', ['Travar', 'Ctrl+2', () => vkCmdUi('alterar', { trava: true })], ['Ocultar', 'Ctrl+3', () => vkCmdUi('alterar', { visivel: false })],
        ['Limpar pontos soltos', '', () => vkCmdUi('limpar', {})]]],
    ['Texto', [['Criar contornos', 'Shift+Ctrl+O', () => vkCmdUi('contornos', {})], ['Textos pretos em 100K', '', () => vkCmdUi('preto_texto', {})]]],
    ['Exibir', [['Ajustar prancheta', 'Ctrl+0', () => vkEnquadrar()], ['Ajustar tudo', 'Alt+Ctrl+0', () => vkEnquadrar(vkBoxUniao(VK.doc.pranchetas.map(p => ({ tipo: 'caminho', subs: vkRetSubs(p.x, p.y, p.w, p.h) }))))],
        ['Tamanho real', 'Ctrl+1', () => vkZoom(1 / VK.vista.z * 96 / 72)], '-', ['Contornos (sem cor)', 'Ctrl+Y', () => { VK.contorno = !VK.contorno; vkMudou(); }],
        ['Mostrar sangria', '', () => { VK.mostrarSangria = !VK.mostrarSangria; vkMudou(); }]]],
];
function vkMenus() {
    const nav = vkEl('vk-mbar'), pop = vkEl('vk-pop');
    nav.innerHTML = VK_MENUS.map(([r], i) => `<button class="ie-mbar-btn" data-m="${i}">${r}</button>`).join('');
    let aberto = null;
    const fechar = () => { aberto = null; pop.hidden = true; nav.querySelectorAll('.ie-mbar-btn').forEach(b => b.classList.remove('on')); };
    const abrir = i => {
        aberto = i; const b = nav.querySelector(`[data-m="${i}"]`), r = b.getBoundingClientRect(), rr = vkEl('vk').getBoundingClientRect();
        nav.querySelectorAll('.ie-mbar-btn').forEach(x => x.classList.toggle('on', x === b));
        pop.innerHTML = `<div class="ie-menu">${VK_MENUS[i][1].map((it, k) => it === '-' ? '<div class="ie-menu-sep"></div>' : `<button class="ie-menu-item" data-k="${k}"><span>${it[0]}</span><kbd>${it[1]}</kbd></button>`).join('')}</div>`;
        Object.assign(pop.style, { left: (r.left - rr.left) + 'px', top: (r.bottom - rr.top) + 'px' }); pop.hidden = false;
        pop.onclick = e => { const it = e.target.closest('[data-k]'); if (!it) return; const f = VK_MENUS[i][1][+it.dataset.k][2]; fechar(); if (VK.doc || /Novo|Abrir/.test(VK_MENUS[i][1][+it.dataset.k][0])) f(); };
    };
    nav.addEventListener('click', e => { const b = e.target.closest('.ie-mbar-btn'); if (!b) return; aberto === +b.dataset.m ? fechar() : abrir(+b.dataset.m); });
    nav.addEventListener('mouseover', e => { const b = e.target.closest('.ie-mbar-btn'); if (b && aberto !== null && aberto !== +b.dataset.m) abrir(+b.dataset.m); });
    document.addEventListener('pointerdown', e => { if (aberto !== null && !pop.contains(e.target) && !nav.contains(e.target)) fechar(); });
}

// ─────────────────────────── atualização da interface ───────────────────────────
function vkUiAtualizar() {
    if (!vkEl('vk')) return;
    vkEl('vk-inicio').hidden = !!VK.doc;
    vkEl('vk-ferr').querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === VK.ferr));
    vkEl('vk-abas').querySelectorAll('[data-a]').forEach(b => b.classList.toggle('on', b.dataset.a === (VK.aba || 'camadas')));
    vkCoresFerr(); vkOpcoes();
    if (!VK.doc) { vkEl('vk-props').innerHTML = ''; vkEl('vk-aba').innerHTML = ''; vkEl('vk-top-info').textContent = ''; return; }
    const d = VK.doc;
    vkEl('vk-top-info').textContent = `${d.nome}${VK.sujo ? ' •' : ''} — ${d.modoCor.toUpperCase()} · ${d.perfil} · sangria ${vkR(vkMM(d.sangria), 1)} mm`;
    vkEl('vk-status-info').textContent = `${Math.round(VK.vista.z * 72 / 96 * 100)}%  ·  ${VK.sel.length ? VK.sel.length + ' selecionado(s)' : ''}${VK.contorno ? '  ·  CONTORNOS' : ''}`;
    vkProps();
    ({ camadas: vkAbaCamadas, pranchetas: vkAbaPranchetas, amostras: vkAbaAmostras, fechamento: vkAbaFechamento })[VK.aba || 'camadas']();
}
function vkCorSw(c, extra = '') {
    const bg = !c ? 'linear-gradient(to top right, transparent 46%, #e33 47% 53%, transparent 54%), #fff'
        : c.k === 'grad' ? `linear-gradient(90deg, ${c.paradas.map(p => vkCss(p.cor) + ' ' + p.p * 100 + '%').join(',')})` : vkCss(c);
    return `<span class="vk-sw ${extra}" style="background:${bg}"></span>`;
}
function vkCoresFerr() {
    const el = vkEl('vk-cores-ferr'); if (!el) return;
    el.innerHTML = `<button class="vk-cf vk-cf-p ${VK.focoTraco ? '' : 'on'}" title="Preenchimento (X alterna)" data-c="p">${vkCorSw(VK.preench)}</button>
        <button class="vk-cf vk-cf-t ${VK.focoTraco ? 'on' : ''}" title="Traço (X alterna)" data-c="t">${vkCorSw(VK.traco)}<i></i></button>`;
    el.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; VK.focoTraco = b.dataset.c === 't'; vkCorPopup(b, VK.focoTraco ? VK.traco : VK.preench, c => {
        if (VK.sel.length) vkCmdUi('alterar', VK.focoTraco ? { traco: c } : { preench: c }); if (VK.focoTraco) VK.traco = c; else VK.preench = c; vkUiAgendar(); }); };
}
function vkOpcoes() {
    const el = vkEl('vk-opcoes'), f = VK.ferr;
    let h = `<span class="ie-op-tit">${VK_FERR[f].nome}</span>`;
    if (f === 'retangulo') h += `<label class="ie-op-campo">Raio do canto <input type="number" min="0" step="0.5" value="${vkR(vkMM(VK_OPC.raio), 2)}" data-o="raio"> mm</label>`;
    if (f === 'poligono') h += `<label class="ie-op-campo">Lados <input type="number" min="3" max="64" value="${VK_OPC.lados}" data-o="lados"></label>`;
    if (f === 'estrela') h += `<label class="ie-op-campo">Pontas <input type="number" min="3" max="64" value="${VK_OPC.pontas}" data-o="pontas"></label>`;
    if (f === 'caneta') h += `<span class="ie-op-dica">clique = canto · arraste = curva · clique no 1º ponto fecha · Enter termina · clique num segmento selecionado = novo ponto</span>`;
    if (f === 'direta') h += `<span class="ie-op-dica">arraste pontos/alças · Alt na alça = quebra a curva · Shift soma pontos</span>`;
    if (f === 'selecao') h += `<span class="ie-op-dica">Shift = proporcional/eixo · Alt+arraste = duplica · Alt na alça = a partir do centro · fora do canto = girar</span>`;
    if (f === 'texto') h += `<span class="ie-op-dica">clique = texto de ponto · arraste = caixa de texto · Esc/Ctrl+Enter termina</span>`;
    if (el.dataset.f === f && el.innerHTML) return;
    el.dataset.f = f; el.innerHTML = h;
    el.oninput = e => { const k = e.target.dataset.o; if (!k) return; VK_OPC[k] = k === 'raio' ? vkPT(+e.target.value || 0) : Math.max(3, +e.target.value || 3); };
}

// ── Propriedades (contextual) ──
const vkNum = (rot, val, attr, unid = '', step = 0.1) => `<label class="vk-campo"><span>${rot}</span><input type="number" step="${step}" value="${val}" ${attr}>${unid ? `<em>${unid}</em>` : ''}</label>`;
function vkProps() {
    const el = vkEl('vk-props'), objs = vkSelObjs();
    if (document.activeElement && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // não atrapalha quem está digitando
    if (!objs.length) {
        const p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0];
        el.innerHTML = `<div class="vk-sec"><div class="vk-sec-t">Documento</div>
            <div class="vk-grade">${vkNum('L', vkR(vkMM(p.w)), 'data-pr="larg"', 'mm')}${vkNum('A', vkR(vkMM(p.h)), 'data-pr="alt"', 'mm')}${vkNum('Sangria', vkR(vkMM(VK.doc.sangria)), 'data-doc="sangria"', 'mm')}</div>
            <div class="vk-linha">Perfil <select data-doc="perfil">${['FOGRA39', 'FOGRA29', 'GRACOL', 'SWOP'].map(k => `<option ${k === VK.doc.perfil ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
            <div class="vk-acoes"><button class="ie-btn" onclick="vkDocDialogo()">Configurar documento</button><button class="ie-btn" onclick="vkPainelFechamento(true)">Fechamento</button></div></div>`;
        el.onchange = e => { const t = e.target;
            if (t.dataset.pr) vkCmdUi('prancheta', { prancheta: p.id, [t.dataset.pr]: +t.value, un: 'mm' });
            if (t.dataset.doc) vkCmdUi('documento', { [t.dataset.doc]: t.dataset.doc === 'sangria' ? +t.value : t.value }); };
        return;
    }
    const b = vkBoxUniao(objs), p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0], o = objs[0];
    const tx = objs.every(x => x.tipo === 'texto') ? o : null;
    const temCor = objs.some(x => x.tipo !== 'imagem');
    let h = `<div class="vk-sec"><div class="vk-sec-t">${objs.length > 1 ? objs.length + ' objetos' : ({ caminho: 'Caminho', texto: 'Texto', imagem: 'Imagem', grupo: o.clip ? 'Máscara de corte' : 'Grupo' })[o.tipo]}${o.nome && objs.length === 1 ? ' · ' + vkEsc_(o.nome) : ''}</div>
        <div class="vk-grade">${vkNum('X', vkR(vkMM(b[0] - p.x)), 'data-t="x"', 'mm')}${vkNum('Y', vkR(vkMM(b[1] - p.y)), 'data-t="y"', 'mm')}
        ${vkNum('L', vkR(vkMM(b[2] - b[0])), 'data-t="larg"', 'mm')}${vkNum('A', vkR(vkMM(b[3] - b[1])), 'data-t="alt"', 'mm')}${vkNum('∠', 0, 'data-t="girar"', '°', 1)}</div></div>`;
    if (temCor) {
        const pr = o.tipo === 'grupo' && !o.clip ? (o.itens[0] || {}).preench : o.preench, tr = o.tipo === 'grupo' && !o.clip ? (o.itens[0] || {}).traco : o.traco;
        h += `<div class="vk-sec"><div class="vk-sec-t">Aparência</div>
        <div class="vk-linha"><button class="vk-cor-btn" data-cor="preench">${vkCorSw(pr)}<span>Preenchimento</span><small>${vkCorTexto(pr)}</small></button></div>
        <div class="vk-linha"><button class="vk-cor-btn" data-cor="traco">${vkCorSw(tr && tr.cor, 'vk-sw-traco')}<span>Traço</span><small>${tr ? vkCorTexto(tr.cor) : 'nenhum'}</small></button>
            ${vkNum('', tr ? vkR(tr.larg, 3) : 0, 'data-a="espessura" min="0"', 'pt', 0.25)}</div>
        ${tr ? `<div class="vk-linha vk-mini">Ponta <select data-a="cap">${['butt', 'round', 'square'].map(v => `<option value="${v}" ${tr.cap === v ? 'selected' : ''}>${{ butt: 'reta', round: 'redonda', square: 'projetada' }[v]}</option>`).join('')}</select>
            Canto <select data-a="junc">${['miter', 'round', 'bevel'].map(v => `<option value="${v}" ${tr.junc === v ? 'selected' : ''}>${{ miter: 'vivo', round: 'redondo', bevel: 'chanfro' }[v]}</option>`).join('')}</select>
            Tracejado <input type="text" data-a="tracejado" placeholder="ex. 4 2" value="${(tr.tracejado || []).map(v => vkR(v, 2)).join(' ')}" style="width:56px"></div>` : ''}
        <div class="vk-linha">${vkNum('Opacidade', Math.round((o.op ?? 1) * 100), 'data-a="opacidade" min="0" max="100"', '%', 1)}
            <select data-a="mesclagem" title="Modo de mesclagem">${['normal', ...Object.keys(VK_BM)].map(v => `<option value="${v}" ${(o.bm || 'normal') === v ? 'selected' : ''}>${v.replace('_', ' ')}</option>`).join('')}</select></div>
        <label class="vk-chk"><input type="checkbox" data-a="sobreimprimir" ${o.sobre && (o.sobre.p || o.sobre.t) ? 'checked' : ''}> Sobreimprimir</label></div>`;
    }
    if (tx) {
        const fams = (typeof IE !== 'undefined' && IE.fontes) || [];
        h += `<div class="vk-sec"><div class="vk-sec-t">Caractere</div>
        <div class="vk-linha"><input list="vk-fontes" data-a="fonte" value="${vkEsc_(tx.fam)}" class="vk-fonte"><datalist id="vk-fontes">${fams.slice(0, 900).map(f => `<option value="${vkEsc_(f)}">`).join('')}</datalist>
            <select data-a="estilo">${vkEstilosDe(tx.fam).map(s => `<option ${s === tx.estilo ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="vk-grade">${vkNum('Tam', vkR(tx.tam, 2), 'data-a="tamanho" min="1"', 'pt', 0.5)}${vkNum('Entrel.', tx.entrelinha ? vkR(tx.entrelinha, 2) : '', 'data-a="entrelinha" placeholder="auto"', 'pt', 0.5)}${vkNum('Track', tx.track || 0, 'data-a="track"', '', 10)}</div>
        <div class="ie-segm vk-segm">${['esq', 'centro', 'dir', 'just'].map(a => `<button data-alin="${a}" class="${tx.alin === a ? 'on' : ''}">${{ esq: '⟸', centro: '⟺', dir: '⟹', just: '☰' }[a]}</button>`).join('')}</div>
        <div class="vk-acoes"><button class="ie-btn" onclick="vkCmdUi('contornos', {})">Criar contornos</button></div></div>`;
    }
    if (o.tipo === 'imagem' && objs.length === 1) { const im = VK.doc.imagens[o.img] || {}; h += `<div class="vk-sec"><div class="vk-sec-t">Imagem</div><div class="vk-nota">${vkEsc_(im.nome)} · ${im.w}×${im.h} px · ${im.modo} · <b>${Math.round(72 / vkEsc(o.m))} ppi</b> efetivos</div></div>`; }
    h += `<div class="vk-sec"><div class="vk-sec-t">Alinhar ${objs.length === 1 ? '(à prancheta)' : ''}</div><div class="vk-bts">
        ${[['esquerda', '⇤'], ['centro_h', '⇹'], ['direita', '⇥'], ['topo', '⤒'], ['centro_v', '⇳'], ['base', '⤓']].map(([m, s]) => `<button class="ie-btn ie-btn-mini" data-al="${m}" title="${m}">${s}</button>`).join('')}
        ${objs.length > 2 ? '<button class="ie-btn ie-btn-mini" data-dist="horizontal" title="distribuir">↔</button><button class="ie-btn ie-btn-mini" data-dist="vertical" title="distribuir">↕</button>' : ''}</div></div>`;
    if (objs.length > 1) h += `<div class="vk-sec"><div class="vk-sec-t">Pathfinder</div><div class="vk-bts">
        ${[['unir', 'Unir'], ['subtrair', 'Subtrair'], ['intersecao', 'Interseção'], ['excluir', 'Excluir']].map(([op, n]) => `<button class="ie-btn ie-btn-mini" data-pf="${op}">${n}</button>`).join('')}</div></div>`;
    h += `<div class="vk-sec"><div class="vk-bts"><button class="ie-btn ie-btn-mini" onclick="vkCmdUi('${objs.length > 1 ? 'agrupar' : 'desagrupar'}', {})">${objs.length > 1 ? 'Agrupar' : 'Desagrupar'}</button>
        ${objs.length > 1 ? `<button class="ie-btn ie-btn-mini" onclick="vkCmdUi('mascara', {})">Máscara</button>` : ''}<button class="ie-btn ie-btn-mini" onclick="vkCmdUi('duplicar', {dx: ${vkPT(5)}, dy: ${vkPT(5)}})">Duplicar</button></div></div>`;
    el.innerHTML = h;
    el.onchange = e => {
        const t = e.target, a = t.dataset.a, tr = t.dataset.t;
        if (tr) {
            const v = +t.value;
            if (tr === 'x' || tr === 'y') vkCmdUi('posicionar', { [tr]: vkPT(v) + (tr === 'x' ? p.x : p.y) });
            else if (tr === 'larg' || tr === 'alt') vkCmdUi('redimensionar', e.shiftKey ? { [tr]: vkPT(v) } : { [tr === 'larg' ? 'sx' : 'sy']: vkPT(v) / ((tr === 'larg' ? b[2] - b[0] : b[3] - b[1]) || 1) * 100, ancora: 'topo-esq' });
            else if (tr === 'girar' && v) vkCmdUi('girar', { graus: v });
            return;
        }
        if (!a) return;
        let v = t.type === 'checkbox' ? t.checked : t.value;
        if (a === 'tracejado') v = String(v).split(/[ ,]+/).filter(Boolean).map(Number);
        else if (['espessura', 'opacidade', 'tamanho', 'track'].includes(a)) v = +v;
        else if (a === 'entrelinha') v = v === '' ? null : +v;
        if (a === 'espessura' && v > 0 && !objs.some(x => x.traco)) { vkCmdUi('alterar', { traco: VK.traco || '100K', espessura: v }); return; }
        vkCmdUi('alterar', { [a]: v });
    };
    el.onclick = e => {
        const c = e.target.closest('[data-cor]'), al = e.target.closest('[data-al]'), pf = e.target.closest('[data-pf]'), ds = e.target.closest('[data-dist]'), an = e.target.closest('[data-alin]');
        if (c) { const k = c.dataset.cor, atual = k === 'preench' ? (o.tipo === 'grupo' ? (o.itens[0] || {}).preench : o.preench) : ((o.tipo === 'grupo' ? (o.itens[0] || {}).traco : o.traco) || {}).cor;
            vkCorPopup(c, atual, cor => vkCmdUi('alterar', { [k]: cor })); }
        if (al) vkCmdUi('alinhar', { modo: al.dataset.al, relativo: objs.length === 1 ? 'prancheta' : 'selecao', prancheta: VK.ativa });
        if (ds) vkCmdUi('distribuir', { eixo: ds.dataset.dist });
        if (pf) vkCmdUi('pathfinder', { op: pf.dataset.pf });
        if (an) vkCmdUi('alterar', { alin: an.dataset.alin });
    };
}
function vkEstilosDe(fam) {
    const l = (typeof IE !== 'undefined' && IE.estilos && IE.estilos[fam]) || [];
    return l.length ? l.map(e => e.estilo) : ['Regular', 'Bold', 'Italic', 'Bold Italic'];
}

// ── seletor de cor (CMYK / RGB / especial / degradê / amostras) ──
function vkCorPopup(ancora, atual, aplicar) {
    const pop = vkEl('vk-pop'), rr = vkEl('vk').getBoundingClientRect(), r = ancora.getBoundingClientRect();
    let c = atual ? vkClone(atual) : { k: 'cmyk', v: [0, 0, 0, 100] };
    const desenhar = () => {
        const modo = c.k === 'grad' ? 'grad' : c.k;
        let corpo = '';
        if (c.k === 'cmyk' || c.k === 'spot') corpo = ['C', 'M', 'Y', 'K'].map((n, i) => `<label class="vk-sl"><b>${n}</b><input type="range" min="0" max="100" step="0.5" value="${c.v[i]}" data-i="${i}"><input type="number" min="0" max="100" step="0.5" value="${vkR(c.v[i], 1)}" data-n="${i}"></label>`).join('')
            + (c.k === 'spot' ? `<label class="vk-sl"><b>Nome</b><input type="text" value="${vkEsc_(c.nome)}" data-nome></label><label class="vk-sl"><b>Tint</b><input type="range" min="0" max="100" value="${c.tint ?? 100}" data-tint><input type="number" value="${c.tint ?? 100}" data-tintn></label>` : '');
        if (c.k === 'rgb') corpo = `<label class="vk-sl"><b>#</b><input type="text" value="${vkCorTexto(c).slice(1)}" data-hex></label>` + ['R', 'G', 'B'].map((n, i) => `<label class="vk-sl"><b>${n}</b><input type="range" min="0" max="255" value="${c.v[i]}" data-i="${i}"><input type="number" min="0" max="255" value="${c.v[i]}" data-n="${i}"></label>`).join('');
        if (c.k === 'grad') corpo = `<div class="vk-linha"><select data-gt><option value="lin" ${c.tipo === 'lin' ? 'selected' : ''}>Linear</option><option value="rad" ${c.tipo === 'rad' ? 'selected' : ''}>Radial</option></select>
            ${c.tipo === 'lin' ? `Ângulo <input type="number" data-ang value="${Math.round(Math.atan2(-(c.b[1] - c.a[1]), c.b[0] - c.a[0]) * 180 / Math.PI)}" style="width:52px">°` : ''}</div>
            <div class="vk-grad-barra" style="background:linear-gradient(90deg, ${c.paradas.map(p => vkCss(p.cor) + ' ' + p.p * 100 + '%').join(',')})"></div>
            ${c.paradas.map((p, i) => `<div class="vk-linha vk-mini"><button class="vk-cor-btn" data-parada="${i}">${vkCorSw(p.cor)}<small>${vkCorTexto(p.cor)}</small></button><input type="number" min="0" max="100" value="${Math.round(p.p * 100)}" data-pp="${i}" style="width:48px">%${c.paradas.length > 2 ? `<button class="ie-btn ie-btn-mini" data-tira="${i}">×</button>` : ''}</div>`).join('')}
            <button class="ie-btn ie-btn-mini" data-mais>+ cor</button>`;
        pop.innerHTML = `<div class="ie-menu vk-cp">
            <div class="ie-segm vk-segm">${[['cmyk', 'CMYK'], ['rgb', 'RGB'], ['spot', 'Especial'], ['grad', 'Degradê'], ['nenhum', 'Nenhum']].map(([k, n]) => `<button data-modo="${k}" class="${modo === k ? 'on' : ''}">${n}</button>`).join('')}</div>
            <div class="vk-cp-prev">${vkCorSw(c)}<span>${vkCorTexto(c)}</span></div>${corpo}
            <div class="vk-cp-am">${VK.doc.amostras.map((a, i) => `<button title="${vkEsc_(a.nome)}" data-am="${i}">${vkCorSw(a.cor)}</button>`).join('')}<button title="Guardar como amostra" data-salvar>＋</button></div>
            <div class="vk-acoes"><button class="ie-btn ie-btn-primario" data-ok>Aplicar</button></div></div>`;
    };
    desenhar();
    Object.assign(pop.style, { left: Math.max(4, Math.min(rr.width - 270, r.left - rr.left - 250)) + 'px', top: Math.max(4, Math.min(rr.height - 420, r.top - rr.top)) + 'px' }); pop.hidden = false;
    const vivo = () => { pop.querySelector('.vk-cp-prev').innerHTML = `${vkCorSw(c)}<span>${vkCorTexto(c)}</span>`; };
    pop.oninput = e => {
        const t = e.target;
        if (t.dataset.i != null) { c.v[+t.dataset.i] = +t.value; const n = pop.querySelector(`[data-n="${t.dataset.i}"]`); if (n) n.value = t.value; }
        if (t.dataset.n != null) { c.v[+t.dataset.n] = +t.value; const s = pop.querySelector(`[data-i="${t.dataset.n}"]`); if (s) s.value = t.value; }
        if (t.dataset.hex != null && /^[0-9a-f]{6}$/i.test(t.value)) c = vkCorDe('#' + t.value);
        if (t.dataset.nome != null) c.nome = t.value;
        if (t.dataset.tint != null || t.dataset.tintn != null) c.tint = +t.value;
        if (t.dataset.pp != null) { c.paradas[+t.dataset.pp].p = Math.max(0, Math.min(1, +t.value / 100)); }
        vivo();
    };
    pop.onchange = e => {
        const t = e.target;
        if (t.dataset.gt != null) { c.tipo = t.value; desenhar(); }
        if (t.dataset.ang != null) { const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) || 100, cx = (c.a[0] + c.b[0]) / 2, cy = (c.a[1] + c.b[1]) / 2, a = +t.value * Math.PI / 180;
            c.a = [cx - L / 2 * Math.cos(a), cy + L / 2 * Math.sin(a)]; c.b = [cx + L / 2 * Math.cos(a), cy - L / 2 * Math.sin(a)]; desenhar(); }
    };
    pop.onclick = e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.modo) {
            const m = t.dataset.modo, base = c.k === 'grad' ? c.paradas[0].cor : c;
            const cmyk = base.k === 'rgb' ? [0, 0, 0, 100] : (base.v || [0, 0, 0, 100]);
            if (m === 'nenhum') { pop.hidden = true; aplicar(null); return; }
            if (m === 'cmyk') c = { k: 'cmyk', v: [...cmyk] };
            if (m === 'rgb') c = base.k === 'rgb' ? { ...base } : { k: 'rgb', v: (vkCss(base).match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number) };
            if (m === 'spot') c = { k: 'spot', nome: base.nome || 'PANTONE ', v: [...cmyk], tint: 100 };
            if (m === 'grad') { const objs = vkSelObjs(), b = vkBoxUniao(objs) || [0, 0, 100, 100], ym = (b[1] + b[3]) / 2;
                c = { k: 'grad', tipo: 'lin', a: [b[0], ym], b: [b[2], ym], f: null, r: (b[2] - b[0]) / 2, paradas: [{ p: 0, cor: base.k === 'grad' ? base : { ...base } }, { p: 1, cor: { k: 'cmyk', v: [0, 0, 0, 0] } }] };
                c.paradas[0].cor = base.k === 'grad' ? { k: 'cmyk', v: [0, 0, 0, 100] } : vkClone(base); c.f = null; delete c.f; }
            desenhar(); return;
        }
        if (t.dataset.am != null) { const a = VK.doc.amostras[+t.dataset.am].cor; if (c.k === 'grad' && VK._parada != null) c.paradas[VK._parada].cor = vkClone(a); else c = vkClone(a); desenhar(); return; }
        if (t.dataset.parada != null) { VK._parada = +t.dataset.parada; const sub = c.paradas[VK._parada].cor; const salvo = c; vkCorPopup(t, sub, nova => { salvo.paradas[VK._parada].cor = nova || { k: 'cmyk', v: [0, 0, 0, 0] }; vkCorPopup(ancora, salvo, aplicar); }); return; }
        if (t.dataset.tira != null) { c.paradas.splice(+t.dataset.tira, 1); desenhar(); return; }
        if (t.dataset.mais != null) { c.paradas.push({ p: 1, cor: vkClone(c.paradas.at(-1).cor) }); c.paradas.sort((x, y) => x.p - y.p); desenhar(); return; }
        if (t.dataset.salvar != null) { if (c.k !== 'grad') vkCmdUi('amostra', { cor: c, nome: c.k === 'spot' ? c.nome : vkCorTexto(c), especial: c.k === 'spot' }).then(desenhar); return; }
        if (t.dataset.ok != null) { pop.hidden = true; aplicar(vkClone(c)); }
    };
    setTimeout(() => document.addEventListener('pointerdown', function fora(e) { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener('pointerdown', fora); } }), 0);
}

// ── abas: Camadas / Pranchetas / Amostras / Fechamento ──
function vkAbaCamadas() {
    const el = vkEl('vk-aba'), d = VK.doc;
    const linha = (o, n) => {
        const sel = VK.sel.includes(o.id) ? ' on' : '';
        const nome = o.nome || (o.tipo === 'texto' ? o.conteudo.slice(0, 28) : o.tipo === 'grupo' ? (o.clip ? '<Máscara de corte>' : '<Grupo>') : o.tipo === 'imagem' ? '<Imagem>' : '<Caminho>');
        let h = `<div class="vk-cam-o${sel}" data-o="${o.id}" style="padding-left:${14 + n * 12}px"><button class="vk-olho" data-vis="${o.id}">${o.visivel === false ? '○' : '●'}</button><span>${vkEsc_(nome)}</span>${o.trava ? '<b class="vk-trava" data-trv="' + o.id + '">🔒</b>' : ''}</div>`;
        if (o.tipo === 'grupo' && VK.abertos && VK.abertos.has(o.id)) h += [...o.itens].reverse().map(f => linha(f, n + 1)).join('');
        return h;
    };
    el.innerHTML = `<div class="vk-cam-lista">${[...d.camadas].reverse().map(c => `<div class="vk-cam${c.id === VK.camadaAtiva ? ' ativa' : ''}" data-c="${c.id}">
        <button class="vk-olho" data-cvis="${c.id}">${c.visivel === false ? '○' : '●'}</button><button class="vk-olho" data-ctr="${c.id}">${c.trava ? '🔒' : '·'}</button>
        <span class="vk-cam-nome" data-cren="${c.id}">${vkEsc_(c.nome)}</span>${c.imprimir === false ? '<small>não imprime</small>' : ''}<small>${c.itens.length}</small></div>
        ${c.itens.length < 400 ? [...c.itens].reverse().map(o => linha(o, 0)).join('') : `<div class="vk-nota">${c.itens.length} objetos</div>`}`).join('')}</div>
        <div class="vk-acoes"><button class="ie-btn ie-btn-mini" data-nova>+ Camada</button><button class="ie-btn ie-btn-mini" data-sobe>↑</button><button class="ie-btn ie-btn-mini" data-desce>↓</button>
        <button class="ie-btn ie-btn-mini" data-mov>Mover seleção para cá</button><button class="ie-btn ie-btn-mini" data-imp>Imprimir on/off</button><button class="ie-btn ie-btn-mini" data-apaga>Apagar camada</button></div>`;
    el.onclick = e => {
        const t = e.target, ca = VK.camadaAtiva;
        if (t.dataset.cvis) { const c = d.camadas.find(x => x.id === t.dataset.cvis); vkCmdUi('camada', { camada: c.id, visivel: c.visivel === false }); return; }
        if (t.dataset.ctr) { const c = d.camadas.find(x => x.id === t.dataset.ctr); vkCmdUi('camada', { camada: c.id, trava: !c.trava }); return; }
        if (t.dataset.vis) { const o = vkObj(t.dataset.vis); vkCmdUi('alterar', { ids: [o.id], visivel: o.visivel === false }); return; }
        if (t.dataset.trv) { vkCmdUi('alterar', { ids: [t.dataset.trv], trava: false }); return; }
        if (t.dataset.nova != null) return vkCmdUi('nova_camada', {});
        if (t.dataset.mov != null) return vkCmdUi('mover_para_camada', { camada: ca });
        if (t.dataset.sobe != null || t.dataset.desce != null) { const i = d.camadas.findIndex(x => x.id === ca); return vkCmdUi('camada', { camada: ca, posicao: i + (t.dataset.sobe != null ? 1 : -1) }); }
        if (t.dataset.imp != null) { const c = d.camadas.find(x => x.id === ca); return vkCmdUi('camada', { camada: ca, imprimir: c.imprimir === false }); }
        if (t.dataset.apaga != null) return vkCmdUi('camada', { camada: ca, apagar: true });
        const lo = t.closest('[data-o]'), lc = t.closest('[data-c]');
        if (lo) { const id = lo.dataset.o, o = vkObj(id);
            if (e.detail === 2 && o.tipo === 'grupo') { VK.abertos = VK.abertos || new Set(); VK.abertos.has(id) ? VK.abertos.delete(id) : VK.abertos.add(id); }
            VK.sel = e.shiftKey ? [...new Set([...VK.sel, id])] : [id]; VK.camadaAtiva = vkCamadaDe(id).id; vkMudou(); return; }
        if (lc) { VK.camadaAtiva = lc.dataset.c; vkUiAgendar(); }
    };
    el.ondblclick = e => { const t = e.target.closest('[data-cren]'); if (!t) return; const c = d.camadas.find(x => x.id === t.dataset.cren); const n = prompt('Nome da camada', c.nome); if (n) vkCmdUi('camada', { camada: c.id, novo_nome: n }); };
}
function vkAbaPranchetas() {
    const el = vkEl('vk-aba'), d = VK.doc;
    el.innerHTML = `<div class="vk-cam-lista">${d.pranchetas.map((p, i) => `<div class="vk-cam${p.id === VK.ativa ? ' ativa' : ''}" data-p="${p.id}"><small>${i + 1}</small><span class="vk-cam-nome">${vkEsc_(p.nome)}</span><small>${vkR(vkMM(p.w), 1)} × ${vkR(vkMM(p.h), 1)} mm</small></div>`).join('')}</div>
        <div class="vk-linha"><select id="vk-pr-preset">${Object.keys(VK_PRESETS).map(k => `<option>${k}</option>`).join('')}</select><button class="ie-btn ie-btn-mini" data-nova>+ Prancheta</button><button class="ie-btn ie-btn-mini" data-ren>Renomear</button><button class="ie-btn ie-btn-mini" data-apaga>Apagar</button></div>`;
    el.onclick = e => {
        const t = e.target, lp = t.closest('[data-p]');
        if (lp) { VK.ativa = lp.dataset.p; vkEnquadrar(); return; }
        if (t.dataset.nova != null) return vkCmdUi('nova_prancheta', { preset: vkEl('vk-pr-preset').value }).then(() => vkEnquadrar());
        if (t.dataset.ren != null) { const p = d.pranchetas.find(q => q.id === VK.ativa); const n = prompt('Nome da prancheta', p.nome); if (n) vkCmdUi('prancheta', { prancheta: p.id, novo_nome: n }); }
        if (t.dataset.apaga != null) vkCmdUi('prancheta', { prancheta: VK.ativa, apagar: true });
    };
}
function vkAbaAmostras() {
    const el = vkEl('vk-aba'), d = VK.doc;
    const usadas = new Set(); for (const { o } of vkTodos()) vkCores(o).forEach(c => c.k === 'spot' && usadas.add(c.nome));
    el.innerHTML = `<div class="vk-am-grade">${d.amostras.map((a, i) => `<button class="vk-am" data-am="${i}" title="${vkEsc_(a.nome)} — ${vkCorTexto(a.cor)}">${vkCorSw(a.cor)}${a.cor.k === 'spot' ? '<i>●</i>' : ''}</button>`).join('')}</div>
        <div class="vk-nota">Clique aplica no ${VK.focoTraco ? 'traço' : 'preenchimento'} (X alterna). Cores especiais usadas: ${[...usadas].join(', ') || 'nenhuma'}.</div>
        <div class="vk-acoes"><button class="ie-btn ie-btn-mini" data-nova>+ Amostra da cor atual</button></div>`;
    el.onclick = e => {
        const b = e.target.closest('[data-am]');
        if (b) { const c = vkClone(d.amostras[+b.dataset.am].cor); if (VK.sel.length) vkCmdUi('alterar', VK.focoTraco ? { traco: c } : { preench: c }); if (VK.focoTraco) VK.traco = c; else VK.preench = c; vkUiAgendar(); }
        if (e.target.dataset.nova != null) { const c = VK.focoTraco ? VK.traco : VK.preench; if (c) vkCmdUi('amostra', { cor: c }); }
    };
}
function vkAbaFechamento() {
    const el = vkEl('vk-aba'), f = vkFechamento({ padrao: VK.padraoPdf || 'x4' });
    const item = x => `<div class="vk-fc vk-fc-${x.nivel}"><b>${x.nivel === 'erro' ? '✖' : '⚠'}</b><span>${vkEsc_(x.msg)}${x.n > 1 ? ` <small>(${x.n})</small>` : ''}</span>
        ${x.ids.length ? `<button class="ie-btn ie-btn-mini" data-ver="${x.cod}">Ver</button>` : ''}${x.corrigir ? `<button class="ie-btn ie-btn-mini" data-fix="${x.corrigir}">Corrigir</button>` : ''}</div>`;
    el.innerHTML = `<div class="vk-linha">Padrão <select id="vk-fc-padrao">${[['x4', 'PDF/X-4 (recomendado)'], ['x1a', 'PDF/X-1a'], ['cmyk', 'PDF CMYK'], ['rgb', 'PDF digital (RGB)']].map(([k, n]) => `<option value="${k}" ${k === (VK.padraoPdf || 'x4') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="vk-fc-res ${f.ok ? 'ok' : 'ruim'}">${f.ok ? (f.avisos.length ? `Pronto para a gráfica, com ${f.avisos.length} alerta(s)` : 'Pronto para a gráfica ✓') : `${f.erros.length} erro(s) impedem o fechamento`}</div>
        ${f.erros.map(item).join('')}${f.avisos.map(item).join('')}
        <div class="vk-nota">Perfil ${f.perfil} · tinta máx. ${f.tac_max}% · sangria ${f.info.sangria_mm} mm${f.info.spots.length ? ' · especiais: ' + vkEsc_(f.info.spots.join(', ')) : ''}</div>
        <div class="vk-acoes"><button class="ie-btn ie-btn-primario" onclick="vkExportarDialogo('pdf')">Exportar PDF…</button></div>`;
    el.onchange = e => { if (e.target.id === 'vk-fc-padrao') { VK.padraoPdf = e.target.value; vkUiAgendar(); } };
    el.onclick = e => {
        const v = e.target.dataset.ver, fx = e.target.dataset.fix;
        if (v) { const it = [...f.erros, ...f.avisos].find(x => x.cod === v); VK.sel = [...new Set(it.ids.map(id => (vkTopo(id) || {}).id).filter(Boolean))]; vkMudou(); const b = vkBoxUniao(vkSelObjs()); if (b) vkEnquadrar([b[0] - 20, b[1] - 20, b[2] + 20, b[3] + 20]); }
        if (fx) vkCmdUi(fx, {});
    };
}
function vkPainelFechamento() { if (!VK.doc) return; VK.aba = 'fechamento'; vkUiAgendar(); }

// ─────────────────────────── diálogos ───────────────────────────
function vkModal(html, montar) {
    const m = vkEl('vk-modal'); m.innerHTML = `<div class="ie-dlg vk-dlg">${html}</div>`; m.hidden = false;
    const fechar = () => { m.hidden = true; m.innerHTML = ''; };
    m.onclick = e => { if (e.target === m || e.target.closest('[data-x]')) fechar(); };
    montar && montar(m, fechar);
}
function vkNovoDialogo() {
    vkModal(`<div class="ie-dlg-tit">Novo documento</div><div class="ie-dlg-corpo">
        <div class="vk-linha"><span>Nome</span><input id="vkn-nome" value="Sem título"></div>
        <div class="vk-linha"><span>Formato</span><select id="vkn-preset">${Object.keys(VK_PRESETS).map(k => `<option>${k}</option>`).join('')}<option>Personalizado</option></select></div>
        <div class="vk-grade">${vkNum('Largura', 210, 'id="vkn-l"', 'mm', 1)}${vkNum('Altura', 297, 'id="vkn-a"', 'mm', 1)}${vkNum('Pranchetas', 1, 'id="vkn-n" min="1"', '', 1)}${vkNum('Sangria', 3, 'id="vkn-s" min="0"', 'mm', 0.5)}</div>
        <div class="vk-linha"><span>Cor</span><select id="vkn-cor"><option value="cmyk">CMYK (impressão)</option><option value="rgb">RGB (tela)</option></select>
            <span>Perfil</span><select id="vkn-perfil"><option>FOGRA39</option><option>FOGRA29</option><option>GRACOL</option><option>SWOP</option></select></div>
        <div class="vk-nota">Impressão no Brasil: CMYK + FOGRA39 (papel couché) ou FOGRA29 (papel offset/não revestido), sangria de 3 mm.</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="vkn-ok">Criar</button></div>`, (m, fechar) => {
        const ps = m.querySelector('#vkn-preset');
        ps.onchange = () => { const v = VK_PRESETS[ps.value]; if (v) { m.querySelector('#vkn-l').value = vkR(v[0], 2); m.querySelector('#vkn-a').value = vkR(v[1], 2); } };
        m.querySelector('#vkn-ok').onclick = () => { const g = id => m.querySelector(id).value; fechar();
            vkCmdUi('novo', { nome: g('#vkn-nome'), larg: +g('#vkn-l'), alt: +g('#vkn-a'), pranchetas: +g('#vkn-n'), sangria: +g('#vkn-s'), modoCor: g('#vkn-cor'), perfil: g('#vkn-perfil') }); };
    });
}
function vkDocDialogo() {
    if (!VK.doc) return;
    const d = VK.doc;
    vkModal(`<div class="ie-dlg-tit">Configurar documento</div><div class="ie-dlg-corpo">
        <div class="vk-linha"><span>Nome</span><input id="vkd-nome" value="${vkEsc_(d.nome)}"></div>
        <div class="vk-grade">${vkNum('Sangria', vkR(vkMM(d.sangria), 2), 'id="vkd-s" min="0"', 'mm', 0.5)}</div>
        <div class="vk-linha"><span>Perfil de saída</span><select id="vkd-p">${['FOGRA39', 'FOGRA29', 'GRACOL', 'SWOP'].map(k => `<option ${k === d.perfil ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <label class="vk-chk"><input type="checkbox" id="vkd-esc" ${VK.pref.escalarTracos ? 'checked' : ''}> Escalar traços ao redimensionar</label>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="vkd-ok">OK</button></div>`, (m, fechar) => {
        m.querySelector('#vkd-ok').onclick = () => { VK.pref.escalarTracos = m.querySelector('#vkd-esc').checked; vkCmdUi('documento', { nome: m.querySelector('#vkd-nome').value, sangria: +m.querySelector('#vkd-s').value, perfil: m.querySelector('#vkd-p').value }); fechar(); };
    });
}
function vkExportarDialogo(qual = 'pdf') {
    if (!VK.doc) return;
    const f = vkFechamento({ padrao: VK.padraoPdf || 'x4' });
    vkModal(`<div class="ie-dlg-tit">Exportar</div><div class="ie-dlg-corpo">
        <div class="ie-segm vk-segm" id="vke-tipo"><button data-t="pdf" class="${qual === 'pdf' ? 'on' : ''}">PDF para gráfica</button><button data-t="img" class="${qual === 'img' ? 'on' : ''}">PNG / JPG</button><button data-t="svg">SVG</button></div>
        <div id="vke-pdf" ${qual === 'pdf' ? '' : 'hidden'}>
            <div class="vk-linha"><span>Padrão</span><select id="vke-padrao">${[['x4', 'PDF/X-4:2010 (recomendado — transparência viva)'], ['x1a', 'PDF/X-1a:2001 (gráficas antigas — só CMYK, sem transparência)'], ['cmyk', 'PDF CMYK (gráfica rápida)'], ['rgb', 'PDF digital RGB (tela, sem marcas)']].map(([k, n]) => `<option value="${k}" ${k === (VK.padraoPdf || 'x4') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="vk-grade">${vkNum('Sangria', vkR(vkMM(VK.doc.sangria), 2), 'id="vke-s" min="0"', 'mm', 0.5)}</div>
            <label class="vk-chk"><input type="checkbox" id="vke-marcas" checked> Marcas de corte (cor de registro, fora da sangria)</label>
            <label class="vk-chk"><input type="checkbox" id="vke-spots"> Converter cores especiais em CMYK</label>
            <div class="vk-linha"><span>Pranchetas</span><select id="vke-pr"><option value="">Todas</option>${VK.doc.pranchetas.map(p => `<option value="${p.id}">${vkEsc_(p.nome)}</option>`).join('')}</select></div>
            <div class="vk-nota">Textos saem em curvas · RGB vira CMYK pelo perfil ${VK.doc.perfil} (preto puro → 100K) · TrimBox/BleedBox · perfil de saída embutido · o PDF é relido e conferido.</div>
            <div class="vk-fc-res ${f.ok ? 'ok' : 'ruim'}">${f.ok ? `Fechamento ok${f.avisos.length ? ` (${f.avisos.length} alerta(s))` : ''}` : `${f.erros.length} erro(s) no fechamento — veja a aba Fechamento`}</div>
        </div>
        <div id="vke-img" ${qual === 'img' ? '' : 'hidden'}>
            <div class="vk-grade">${vkNum('Resolução', 300, 'id="vke-ppi" min="36" max="1200"', 'ppi', 1)}</div>
            <label class="vk-chk"><input type="checkbox" id="vke-todas"> Todas as pranchetas (um arquivo por prancheta)</label>
            <label class="vk-chk"><input type="checkbox" id="vke-transp"> Fundo transparente (PNG)</label>
        </div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="vke-ok">Exportar...</button></div>`, (m, fechar) => {
        let tipo = qual;
        m.querySelector('#vke-tipo').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; tipo = b.dataset.t; m.querySelectorAll('#vke-tipo button').forEach(x => x.classList.toggle('on', x === b)); m.querySelector('#vke-pdf').hidden = tipo !== 'pdf'; m.querySelector('#vke-img').hidden = tipo !== 'img'; };
        m.querySelector('#vke-ok').onclick = async () => {
            const g = id => m.querySelector(id);
            fechar();
            try {
                if (tipo === 'pdf') {
                    VK.padraoPdf = g('#vke-padrao').value;
                    const pr = g('#vke-pr').value;
                    let r;
                    try { r = await vkCmd('exportar_pdf', { padrao: VK.padraoPdf, sangria: +g('#vke-s').value, marcas: g('#vke-marcas').checked, spotsParaProcesso: g('#vke-spots').checked, ...(pr ? { pranchetas: [pr] } : {}) }); }
                    catch (e) { if (e.fechamento && confirm(e.message + '\n\nExportar mesmo assim?')) r = await vkCmd('exportar_pdf', { padrao: VK.padraoPdf, forcar: true, sangria: +g('#vke-s').value, marcas: g('#vke-marcas').checked, ...(pr ? { pranchetas: [pr] } : {}) }); else if (!e.fechamento) throw e; else { VK.aba = 'fechamento'; vkUiAgendar(); } }
                    if (r && r.caminho) vkResultadoPdf(r);
                } else if (tipo === 'img') await vkCmd('exportar_imagem', { ppi: +g('#vke-ppi').value, todas: g('#vke-todas').checked, fundo: g('#vke-transp').checked ? 'transparente' : 'branco' });
                else await vkCmd('exportar_svg', {});
            } catch (e) { vkToast(e.message); }
        };
    });
}
function vkResultadoPdf(r) {
    vkModal(`<div class="ie-dlg-tit">PDF pronto</div><div class="ie-dlg-corpo">
        <div class="vk-fc-res ${r.verificado ? 'ok' : 'ruim'}">${r.verificado ? 'Verificado: caixas, perfil de saída, cores e fontes ok ✓' : 'Verificação: ' + vkEsc_(r.problemas.join('; '))}</div>
        <div class="vk-nota">${vkEsc_(r.caminho)}<br>${r.paginas} página(s) · PDF ${vkEsc_(r.info.versao)} · cores: ${vkEsc_(r.info.cores.join(', '))}${r.info.spots.length ? ' · especiais: ' + vkEsc_(r.info.spots.filter(s => s !== 'All').join(', ') || '—') : ''} · ${r.info.imagens} imagem(ns) · ${r.info.fontes} fontes (textos em curvas)</div>
        ${r.avisos.length ? `<div class="vk-nota">${r.avisos.map(vkEsc_).join('<br>')}</div>` : ''}
        </div><div class="ie-dlg-rod"><button class="ie-btn ie-btn-primario" data-x>OK</button></div>`);
}
function vkMostrarRelatorio() {
    if (!VK.relatorio.length) return;
    vkModal(`<div class="ie-dlg-tit">Importação</div><div class="ie-dlg-corpo"><div class="vk-nota">${VK.relatorio.map(vkEsc_).join('<br>')}</div></div><div class="ie-dlg-rod"><button class="ie-btn ie-btn-primario" data-x>OK</button></div>`);
}
function vkAviso(t) {
    const box = vkEl('vk-avisos'); if (!box) return;
    const el = document.createElement('div'); el.className = 'vk-aviso'; el.textContent = t; box.appendChild(el); while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 3800);
}
function vkAvisoAgente(t) { const box = vkEl('vk-avisos'); if (!box) return; const el = document.createElement('div'); el.className = 'vk-aviso vk-aviso-ag'; el.textContent = '✦ ' + t; box.appendChild(el); while (box.children.length > 4) box.firstChild.remove(); setTimeout(() => el.remove(), 3000); }
function vkRecentesUi() {
    const el = vkEl('vk-recentes'); if (!el) return;
    let l = []; try { l = JSON.parse(localStorage.getItem('vk-recentes') || '[]'); } catch (e) { /* sem storage */ }
    el.innerHTML = l.length ? `<div class="ie-recentes-tit">Recentes</div>${l.map(c => `<button class="ie-recente" data-c="${vkEsc_(c)}">${vkEsc_(c.split(/[\\/]/).pop())}</button>`).join('')}` : '';
    el.onclick = e => { const b = e.target.closest('[data-c]'); if (b) vkCmdUi('abrir', { caminho: b.dataset.c }); };
}
// monta quando a página abre pela 1ª vez (e carrega a lista de fontes do Photo Kanivete, se ainda não veio)
document.addEventListener('DOMContentLoaded', () => {
    const pg = vkEl('page-vetor-kanivete'); if (!pg) return;
    const ver = () => { if (pg.classList.contains('active')) { vkMontar(); vkUiAtualizar(); vkDesenhar(); if (typeof ieCarregarFontes === 'function' && !(typeof IE !== 'undefined' && IE.fontes)) ieCarregarFontes(); } };
    new MutationObserver(ver).observe(pg, { attributes: true, attributeFilter: ['class'] });
    ver();
});
