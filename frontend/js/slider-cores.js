// =========================================================
// Slider Kanivete — PAINEL CORES: paletas por cliente (como as Amostras do Photoshop, com grupos e nomes). A lista é a
// MESMA do painel Amostras do Photo Kanivete (IE.prefs.amostrasLista, gravada em %APPDATA% pelo ie_prefs): paleta salva
// aqui aparece lá e vice-versa. Importa as do Photoshop instalado (Swatches.psp, com os grupos) e arquivos .aco/.ase;
// exporta .ase (Photoshop/Illustrator: Amostras › Importar amostras). Clique = cor do texto / preenchimento / cores do
// gráfico; Alt+clique = contorno (forma) ou fundo da caixa (texto); sem seleção = fundo do slide.
// API do agente: SDK.cmd('paletas') lista; 'paleta_salvar' {nome, cores}; 'paleta_tema' {nome} aplica como tema.
// =========================================================
const SDC = { carregando: false, aberta: {}, editando: null, cor: '#16b8a6' };
const sdcIE = () => (typeof IE !== 'undefined' ? IE : null);
const sdcLista = () => (sdcIE() && IE.prefs && Array.isArray(IE.prefs.amostrasLista) ? IE.prefs.amostrasLista : null);
function sdcGravar(lista) { if (typeof iePrefGravar === 'function') iePrefGravar('amostrasLista', lista); else IE.prefs.amostrasLista = lista; }
async function sdcGarantir() {   // as preferências precisam estar carregadas antes de gravar (o ie_prefs grava o arquivo inteiro)
    if (sdcIE() && IE.prefs && Object.keys(IE.prefs).length) return true;
    if (typeof iePrefsCarregar !== 'function') return false;
    if (!SDC.prefsP) SDC.prefsP = iePrefsCarregar().catch(() => null);
    await SDC.prefsP; return true;
}
async function sdcPrimeiraVez() {
    if (sdcLista() || SDC.carregando) return;
    SDC.carregando = true;
    try {
        await sdcGarantir();
        if (!sdcLista()) {
            const r = sdApi() ? await sdApi().ie_amostras('photoshop').catch(() => null) : null;
            sdcGravar(r && r.success ? r.lista : [{ g: 'Básicas', cores: ['#000000', '#ffffff', '#ed1c24', '#f7941d', '#fff200', '#39b54a', '#00aeef', '#2e3192', '#92278f', '#ec008c'].map(c => ({ c, n: '' })) }]);
        }
    } finally { SDC.carregando = false; sdcRender(); }
}
function sdcCoresDoc() {   // cores já usadas na apresentação (para salvar como paleta do cliente)
    const vistas = new Map(), add = v => { const h = sdHex6(v); if (v && v !== 'none' && /^#/.test(sdCorHex(v))) vistas.set(h, (vistas.get(h) || 0) + 1); };
    for (const s of SD.doc.slides) { add(s.fundo && s.fundo.cor); if (s.fundo && s.fundo.tipo === 'degrade') add(s.fundo.cor2);
        for (const c of s.camadas) { ['cor', 'preench', 'preench2', 'traco', 'fundo', 'corTexto'].forEach(k => add(c[k])); (c.cores || []).forEach(add); } }
    return [...vistas.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 24);
}
// aplicar uma cor: o que faz depende do que está selecionado
async function sdcAplicar(cor, alt) {
    const cs = sdAlvos({});
    if (!cs.length) return sdUi('slide_fundo', alt ? { tipo: 'degrade', cor2: cor } : { tipo: 'cor', cor });
    sdHist();
    for (const c of cs) {
        if (c.tipo === 'texto') { if (alt) c.fundo = cor; else { c.cor = cor; if (c.html) c.html = c.html.replace(/(^|[;"\s])color:\s*[^;"]+;?/gi, '$1'); } }
        else if (c.tipo === 'forma') { if (alt || c.forma === 'linha') { c.traco = cor; if (!+c.espessura) c.espessura = 4; } else c.preench = cor; }
        else if (c.tipo === 'grafico') { if (alt) c.corTexto = cor; else { const k = SDC.grafK || 0; const L = [...sdGrafCores(c)]; L[k] = cor; c.cores = L; (c.series || []).forEach(s => { delete s.cor; delete s.cores; }); } }
        else if (c.tipo === 'imagem' || c.tipo === 'video') c.borda = { esp: (c.borda && +c.borda.esp) || 8, cor };
    }
    sdMudou('camadas');
}
// ───────────── comandos (o agente usa os mesmos) ─────────────
sdRegistrar('paletas', 'lista as paletas salvas (as mesmas do painel Amostras do Photo): [{nome, cores: [#hex]}]', async () => {
    await sdcGarantir(); if (!sdcLista()) await sdcPrimeiraVez();
    return { paletas: (sdcLista() || []).filter(x => x.cores).map(x => ({ nome: x.g, cores: x.cores.map(c => c.c) })) };
}, { leitura: true, semDoc: true });
sdRegistrar('paleta_salvar', 'salva/atualiza a paleta de um cliente {nome, cores: [#hex | {c, n}] (padrão: cores do tema), substituir}', async a => {
    await sdcGarantir(); if (!sdcLista()) await sdcPrimeiraVez();
    if (!a.nome) throw new Error('falta o nome do cliente');
    const T = SD.doc.tema.cores, cores = (a.cores || ['fundo', 'tinta', 'destaque', 'suave', 'apoio'].map(k => ({ c: T[k], n: { fundo: 'Fundo', tinta: 'Texto', destaque: 'Destaque', suave: 'Suave', apoio: 'Apoio' }[k] })))
        .map(x => typeof x === 'string' ? { c: sdHex6(x), n: '' } : { c: sdHex6(x.c), n: x.n || '' });
    const lista = [...sdcLista()], i = lista.findIndex(x => x.cores && x.g.toLowerCase() === a.nome.toLowerCase());
    if (i >= 0 && !a.substituir) lista[i] = { ...lista[i], cores: [...lista[i].cores, ...cores.filter(c => !lista[i].cores.some(o => o.c === c.c))] };
    else if (i >= 0) lista[i] = { ...lista[i], cores }; else lista.unshift({ g: a.nome, cores });
    sdcGravar(lista); sdcRender();
    return { nome: a.nome, cores: cores.length };
}, { leitura: true });
sdRegistrar('paleta_tema', 'usa uma paleta salva como tema {nome, aplicar (troca as cores antigas nos slides, padrão true)}: papéis pelo contraste (mais clara = fundo, mais escura = texto, mais viva = destaque; tema escuro inverte)', async a => {
    await sdcGarantir();
    const p = (sdcLista() || []).find(x => x.cores && x.g.toLowerCase() === String(a.nome || '').toLowerCase()); if (!p) throw new Error('paleta não encontrada: ' + a.nome);
    return sdCmd('tema', { cores: sdcComoTema(p.cores.map(c => c.c)), aplicar: a.aplicar !== false });
}, { leitura: true });
function sdcComoTema(cs) {   // papéis pelo contraste (a ordem das amostras no Photoshop é qualquer uma): mantém o tema claro ou escuro
    const u = [...new Set(cs.map(sdHex6))];
    const por = [...u].sort((a, b) => sdLum(b) - sdLum(a)), sat = h => { const [r, g, b] = sdHexRgb(h); return Math.max(r, g, b) - Math.min(r, g, b); };
    const escuro = SD.doc && sdLum(SD.doc.tema.cores.fundo) < sdLum(SD.doc.tema.cores.tinta);
    if (escuro) por.reverse();
    const fundo = por[0] || (escuro ? '#111111' : '#ffffff'), tinta = por.at(-1) && por.at(-1) !== fundo ? por.at(-1) : (escuro ? '#ffffff' : '#111111');
    const resto = u.filter(x => x !== fundo && x !== tinta).sort((a, b) => sat(b) - sat(a)), destaque = resto[0] || sdMistura(tinta, fundo, 0.3);
    return { fundo, tinta, destaque, suave: resto[1] || sdMistura(fundo, tinta, 0.07), apoio: resto[2] || sdMistura(tinta, fundo, 0.4) };
}

// ───────────── painel ─────────────
function sdcRender() {
    const P = sdEl('sd-cores'); if (!P || P.hidden || !SD.doc) return;
    const lista = sdcLista();
    if (!lista) { P.innerHTML = '<p class="sd-vazio">Carregando as amostras do Photoshop…</p>'; sdcPrimeiraVez(); return; }
    const T = SD.doc.tema.cores, q = (SDC.busca || '').toLowerCase();
    const am = (c, n, at = '') => `<button class="sd-am" style="background:${sdEsc(c)}" data-am="${sdEsc(c)}" title="${sdEsc((n ? n + ' · ' : '') + c)}  —  clique: aplicar · Alt+clique: contorno/fundo · botão direito: opções"${at}></button>`;
    const cs = sdAlvos({}), graf = cs.length === 1 && cs[0].tipo === 'grafico' ? cs[0] : null;
    let h = `<section class="sd-sec"><h5>Aplicar em ${cs.length ? (cs.length > 1 ? cs.length + ' objetos' : ({ texto: 'texto', forma: 'forma', grafico: 'gráfico', imagem: 'imagem (borda)', video: 'vídeo (borda)' }[cs[0].tipo])) : 'fundo do slide'}</h5>
        ${graf ? `<div class="sd-am-alvo">Série/fatia: ${sdGrafCores(graf).slice(0, Math.max((graf.series || []).length, ['pizza', 'rosca', 'funil'].includes(graf.grafico) ? (graf.rotulos || []).length : 1)).map((c, k) => `<button class="sd-am${(SDC.grafK || 0) === k ? ' sel' : ''}" style="background:${c}" data-grafk="${k}" title="aplicar nesta"></button>`).join('')}</div>` : ''}
        <div class="sd-am-linha"><label class="sd-cor-grande" title="Escolher uma cor"><input type="color" data-sdc-cor value="${sdHex6(SDC.cor)}"><b style="background:${sdEsc(SDC.cor)}"></b></label>
        <input type="text" data-sdc-hex value="${sdEsc(SDC.cor)}" spellcheck="false" title="Hex"><button class="sd-ic" data-sdc="aplicar-atual" title="Aplicar esta cor">✓</button></div></section>
      <section class="sd-sec"><h5>Tema desta apresentação</h5><div class="sd-am-grade">${['fundo', 'tinta', 'destaque', 'suave', 'apoio'].map(k => am(T[k], { fundo: 'Fundo', tinta: 'Texto', destaque: 'Destaque', suave: 'Suave', apoio: 'Apoio' }[k])).join('')}</div>
        <div class="sd-am-uso">Usadas nos slides:</div><div class="sd-am-grade">${sdcCoresDoc().map(c => am(c, '')).join('')}</div></section>
      <section class="sd-sec"><h5>Paletas de clientes</h5>
        <div class="sd-am-linha"><input type="text" data-sdc-nome placeholder="Nome do cliente" spellcheck="false"><button class="sd-btn" data-sdc="nova" title="Salva as cores do tema (ou as usadas nos slides, com Alt) como paleta deste cliente">Salvar paleta</button></div>
        <div class="sd-am-linha"><input type="search" data-sdc-busca placeholder="Buscar paleta ou cor" value="${sdEsc(SDC.busca || '')}"></div>
        <div class="sd-am-lista">`;
    let soltas = '';
    const fechar = () => { if (soltas) { h += `<div class="sd-am-grade sd-am-solta">${soltas}</div>`; soltas = ''; } };
    lista.forEach((x, gi) => {
        if (!x.cores) { if (!q || x.c.includes(q) || (x.n || '').toLowerCase().includes(q)) soltas += am(x.c, x.n, ` data-gi="${gi}"`); return; }
        fechar();
        const casa = !q || x.g.toLowerCase().includes(q) || x.cores.some(c => c.c.includes(q) || (c.n || '').toLowerCase().includes(q));
        if (!casa) return;
        const aberta = q || SDC.aberta[x.g] !== false;
        h += `<div class="sd-am-g" data-gi="${gi}"><button class="sd-am-seta" data-sdc="dobra">${aberta ? '⌄' : '›'}</button>` +
            (SDC.editando === gi ? `<input class="sd-am-ren" data-sdc-ren value="${sdEsc(x.g)}">` : `<span class="sd-am-nome" data-sdc="renomear" title="Clique duas vezes para renomear">${sdEsc(x.g)}</span>`) +
            `<span class="sd-am-qt">${x.cores.length}</span><button class="sd-cam-b" data-sdc="tema" title="Usar como tema da apresentação">Aa</button><button class="sd-cam-b" data-sdc="exportar" title="Exportar esta paleta (.ase para o Photoshop/Illustrator)">⇩</button><button class="sd-cam-b" data-sdc="apagar" title="Apagar a paleta">✕</button></div>` +
            (aberta ? `<div class="sd-am-grade">${x.cores.map((c, ci) => am(c.c, c.n, ` data-gi="${gi}" data-ci="${ci}"`)).join('')}<button class="sd-am sd-am-mais" data-sdc="mais" data-gi="${gi}" title="Adicionar a cor escolhida acima a esta paleta">+</button></div>` : '');
    });
    fechar();
    h += `</div><div class="sd-am-botoes"><button class="sd-btn" data-sdc="photoshop" title="Lê o Swatches.psp do Photoshop instalado (com os grupos de cada cliente)">Importar do Photoshop</button>
        <button class="sd-btn" data-sdc="arquivo" title="Arquivo de amostras do Adobe (.aco ou .ase)">Importar .aco/.ase</button><button class="sd-btn" data-sdc="exportar-tudo" title="Todas as paletas num .ase (no Photoshop: Amostras › Importar amostras)">Exportar todas (.ase)</button></div>
        <p class="sd-vazio">As paletas são as mesmas do painel Amostras do Photo Kanivete.</p></section>`;
    P.innerHTML = h;
}
function sdcMontar() {
    const P = sdEl('sd-cores'); if (!P || P.dataset.ok) return; P.dataset.ok = '1';
    P.addEventListener('click', async e => {
        const k = e.target.closest('[data-grafk]'); if (k) { SDC.grafK = +k.dataset.grafk; sdcRender(); return; }
        const b = e.target.closest('[data-sdc]'), sw = e.target.closest('[data-am]');
        if (sw && !b) { SDC.cor = sw.dataset.am; await sdcAplicar(sw.dataset.am, e.altKey); return; }
        if (!b) return;
        const a = b.dataset.sdc, gi = +(b.closest('[data-gi]') || {}).dataset?.gi, lista = [...(sdcLista() || [])];
        if (a === 'aplicar-atual') return sdcAplicar(SDC.cor, e.altKey);
        if (a === 'dobra') { const g = lista[gi].g; SDC.aberta[g] = SDC.aberta[g] === false; return sdcRender(); }
        if (a === 'nova') {
            const nome = P.querySelector('[data-sdc-nome]').value.trim(); if (!nome) { sdToast('Digite o nome do cliente', 'aviso'); P.querySelector('[data-sdc-nome]').focus(); return; }
            await sdUi('paleta_salvar', e.altKey ? { nome, cores: sdcCoresDoc() } : { nome }); sdToast(`Paleta "${nome}" salva`); return;
        }
        if (a === 'mais') { lista[gi] = { ...lista[gi], cores: [...lista[gi].cores, { c: sdHex6(SDC.cor), n: '' }] }; sdcGravar(lista); return sdcRender(); }
        if (a === 'tema') { await sdUi('paleta_tema', { nome: lista[gi].g }); sdToast(`Tema com as cores de "${lista[gi].g}"`); return; }
        if (a === 'apagar') {
            const ok = typeof appConfirm === 'function' ? await appConfirm({ titulo: 'Apagar paleta', texto: `Apagar a paleta "${lista[gi].g}"? Ela some também do Photo Kanivete.`, botoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Apagar', valor: true, tipo: 'perigo' }] }) : true;
            if (ok) { lista.splice(gi, 1); sdcGravar(lista); sdcRender(); } return;
        }
        if (a === 'exportar' || a === 'exportar-tudo') {
            const sel = a === 'exportar' ? [lista[gi]] : lista, nome = a === 'exportar' ? lista[gi].g : 'Paletas Kanivete';
            const p = await sdApi().vk_dialogo('salvar', ['Amostras do Adobe (*.ase)'], nome + '.ase'); if (!p) return;
            const r = await sdApi().ie_amostras_gravar(p, sel); if (r && r.success) sdToast('Paleta exportada: ' + sdNomeArq(r.path)); else sdToast('Não exportou: ' + ((r && r.error) || ''), 'erro');
            return;
        }
        if (a === 'photoshop' || a === 'arquivo') {
            await sdcGarantir();
            const r = await sdApi().ie_amostras(a).catch(() => null);
            if (!r || !r.success) { if (r && !r.cancelled) sdToast('Amostras não importadas: ' + (r.error || ''), 'erro'); return; }
            const atual = [...(sdcLista() || [])], nomes = new Set(atual.filter(x => x.cores).map(x => x.g.toLowerCase()));
            const novos = a === 'photoshop' ? r.lista : [{ g: r.origem, cores: r.lista.flatMap(x => x.cores ? x.cores : [x]) }];
            let n = 0; for (const x of novos) { if (x.cores && nomes.has(x.g.toLowerCase())) { const i = atual.findIndex(y => y.cores && y.g.toLowerCase() === x.g.toLowerCase()); atual[i] = x; } else atual.push(x); n++; }
            sdcGravar(atual); sdcRender(); sdToast(`${n} paleta(s)/amostra(s) importada(s) de ${r.origem}`); return;
        }
    });
    P.addEventListener('dblclick', e => { const n = e.target.closest('[data-sdc="renomear"]'); if (!n) return; SDC.editando = +n.closest('[data-gi]').dataset.gi; sdcRender(); const i = P.querySelector('[data-sdc-ren]'); if (i) { i.focus(); i.select(); } });
    P.addEventListener('contextmenu', e => {
        const sw = e.target.closest('[data-am]'); if (!sw) return; e.preventDefault();
        const gi = sw.dataset.gi != null ? +sw.dataset.gi : null, ci = sw.dataset.ci != null ? +sw.dataset.ci : null, cor = sw.dataset.am;
        sdAbrirMenuItens([['Aplicar', '', () => sdcAplicar(cor)], ['Aplicar no contorno / fundo da caixa', 'Alt+clique', () => sdcAplicar(cor, true)], ['Fundo do slide', '', () => sdUi('slide_fundo', { tipo: 'cor', cor })],
            ['Copiar código (' + cor + ')', '', () => { try { navigator.clipboard.writeText(cor); } catch (x) { /* sem área */ } }], ['-'],
            ['Remover da paleta', '', () => { const L = [...sdcLista()]; if (ci != null) { L[gi] = { ...L[gi], cores: L[gi].cores.filter((_, k) => k !== ci) }; } else L.splice(gi, 1); sdcGravar(L); sdcRender(); }, gi == null]], [e.clientX, e.clientY]);
    });
    const fimRen = inp => { const gi = SDC.editando; SDC.editando = null; const v = inp.value.trim(), L = [...sdcLista()]; if (v && L[gi]) { L[gi] = { ...L[gi], g: v }; sdcGravar(L); } sdcRender(); };
    P.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.target.matches('[data-sdc-ren]')) { if (e.key === 'Enter') fimRen(e.target); if (e.key === 'Escape') { SDC.editando = null; sdcRender(); } }
        if (e.target.matches('[data-sdc-nome]') && e.key === 'Enter') P.querySelector('[data-sdc="nova"]').click();
    });
    P.addEventListener('focusout', e => { if (e.target.matches('[data-sdc-ren]') && SDC.editando != null) fimRen(e.target); });
    P.addEventListener('input', e => {
        if (e.target.matches('[data-sdc-busca]')) { SDC.busca = e.target.value; const pos = e.target.selectionStart; sdcRender(); const i = P.querySelector('[data-sdc-busca]'); i.focus(); i.setSelectionRange(pos, pos); }
        if (e.target.matches('[data-sdc-cor]')) { SDC.cor = e.target.value; P.querySelector('[data-sdc-hex]').value = SDC.cor; e.target.nextElementSibling.style.background = SDC.cor; }
    });
    P.addEventListener('change', e => {
        if (e.target.matches('[data-sdc-hex]')) { const v = e.target.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(v)) { SDC.cor = (v[0] === '#' ? v : '#' + v).toLowerCase(); sdcRender(); } }
    });
}
