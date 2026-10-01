// =========================================================
// Pocket Editor — comandos, atalhos do teclado (personalizáveis) e barra de menus
// Cada ação do editor é um comando: nome, menu, teclas padrão e o que faz. A barra de menus (Arquivo, Editar,
// Clipe, Sequência, Marcadores, Exibir, Janela, Ajuda — como no Premiere) e o teclado usam a mesma lista.
// As teclas mudadas pelo usuário ficam em PREFS.atalhos = {idDoComando: ['Ctrl+K', ...]} (só as diferentes do padrão).
// Teclas no formato "Ctrl+Alt+Shift+Tecla"; letras e números pela posição física (e.code), símbolos pelo caractere.
// =========================================================

const veSel = () => VE.sel >= 0 || (typeof veSelLista === 'function' && veSelLista().length > 0) ||
    (typeof VETX !== 'undefined' && VETX.legSel >= 0 && (VE.legendas || [])[VETX.legSel]);

// grupo = menu onde aparece (sem menu: só atalho). sempre = funciona sem projeto aberto.
// pode() = habilitado; marcado() = ✓ no menu. sep = linha antes do item no menu.
const VE_CMDS = [
    // ── Arquivo ──
    { id: 'novo-projeto', grupo: 'arquivo', nome: 'Novo projeto', teclas: ['Ctrl+Alt+N'], sempre: true, fn: () => { if (veConfirmDiscard()) veCloseProject(); } },
    { id: 'nova-timeline', grupo: 'arquivo', nome: 'Nova timeline', teclas: ['Ctrl+N'], sempre: true, fn: () => (VE.ready ? veCreateTimeline() : veToast('Abra um projeto antes de criar uma timeline')) },
    { id: 'novo-ajuste', grupo: 'arquivo', nome: 'Nova camada de ajuste', teclas: [], fn: () => veAddAdjust(), pode: () => !(VE.info && VE.info.audio_only) },
    { id: 'abrir', grupo: 'arquivo', nome: 'Abrir projeto ou vídeo...', teclas: ['Ctrl+O'], sempre: true, sep: true, fn: () => veOpenFile() },
    { id: 'fechar', grupo: 'arquivo', nome: 'Fechar projeto', teclas: ['Ctrl+Shift+W'], fn: () => { if (veConfirmDiscard()) veCloseProject(); } },
    { id: 'salvar', grupo: 'arquivo', nome: 'Salvar', teclas: ['Ctrl+S'], sempre: true, sep: true, fn: () => veSaveProject(false) },
    { id: 'salvar-como', grupo: 'arquivo', nome: 'Salvar como...', teclas: ['Ctrl+Shift+S'], sempre: true, fn: () => veSaveProject(true) },
    { id: 'importar', grupo: 'arquivo', nome: 'Importar...', teclas: ['Ctrl+I'], sempre: true, sep: true, fn: () => vePjImportarDialogo() },
    { id: 'importar-timeline', grupo: 'arquivo', nome: 'Importar na timeline...', teclas: [], fn: () => veImportTimelineFile() },
    { id: 'imagem', grupo: 'arquivo', nome: 'Adicionar imagem na timeline...', teclas: [], fn: () => vePickImage() },
    { id: 'exportar', grupo: 'arquivo', nome: 'Exportar mídia...', teclas: ['Ctrl+M', 'Ctrl+E'], sep: true, fn: () => veOpenExport() },
    { id: 'exportar-legendas', grupo: 'arquivo', nome: 'Exportar legendas...', teclas: [], fn: () => veAbrirTexto('leg') },
    { id: 'exportar-transcricao', grupo: 'arquivo', nome: 'Exportar transcrição...', teclas: [], fn: () => veAbrirTexto('trans') },
    { id: 'sair', grupo: 'arquivo', nome: 'Sair', teclas: ['Ctrl+Q'], sempre: true, sep: true, fn: () => appSair() },

    // ── Editar ──
    { id: 'desfazer', grupo: 'editar', nome: 'Desfazer', teclas: ['Ctrl+Z'], fn: () => veUndo(), pode: () => VE.history.length > 0 },
    { id: 'refazer', grupo: 'editar', nome: 'Refazer', teclas: ['Ctrl+Shift+Z', 'Ctrl+Y'], fn: () => veRedo(), pode: () => VE.future.length > 0 },
    { id: 'recortar', grupo: 'editar', nome: 'Recortar', teclas: ['Ctrl+X'], sep: true, fn: () => { veCopiar(true); veCeMarcarCopia(); }, pode: veSel },
    { id: 'copiar', grupo: 'editar', nome: 'Copiar', teclas: ['Ctrl+C'], fn: () => { veCopiar(false); veCeMarcarCopia(); }, pode: veSel },
    { id: 'colar', grupo: 'editar', nome: 'Colar', teclas: ['Ctrl+V'], fn: () => veColarTudo() },   // também o copiado fora do editor
    { id: 'apagar', grupo: 'editar', nome: 'Apagar', teclas: ['Delete', 'Backspace', 'D'], fn: () => veDeleteSelected(false), pode: () => veSel() || !!VE.gapSel },
    { id: 'apagar-ripple', grupo: 'editar', nome: 'Apagar e fechar o espaço', teclas: ['Shift+Delete', 'Shift+Backspace', 'Shift+D'], fn: () => veDeleteSelected(true), pode: () => veSel() || !!VE.gapSel },
    { id: 'desselecionar', grupo: 'editar', nome: 'Desmarcar tudo', teclas: ['Esc'], fn: () => { VE.sel = -1; VETX.legSel = -1; VE.selx = null; VE.trSel = null; VE.bordaSel = null; veRenderClips(); veDraw(); } },
    { id: 'atalhos', grupo: 'editar', nome: 'Atalhos do teclado...', teclas: ['Ctrl+Alt+K'], sempre: true, sep: true, fn: () => veAtalhosAbrir() },
    { id: 'preferencias', grupo: 'editar', nome: 'Preferências...', teclas: [], sempre: true, fn: () => prefsOpen() },

    // ── Clipe ──
    { id: 'sb-aplicar', grupo: 'clipe', nome: 'Aplicar som do Soundboard na agulha', teclas: ['Shift+1'], fn: () => veSbAplicarSelecionado() },
    { id: 'ganho', grupo: 'clipe', nome: 'Ganho de áudio...', teclas: ['G'], fn: () => veOpenGain(), pode: veSel },
    { id: 'cortar-selecionados', grupo: 'clipe', nome: 'Cortar selecionados na agulha', teclas: ['E'], fn: () => veCortarSelecionados(), pode: veSel },
    { id: 'aparar-inicio', grupo: 'clipe', nome: 'Aparar início até a agulha', teclas: ['Q'], sep: true, fn: () => veRippleTrimStart() },
    { id: 'aparar-fim', grupo: 'clipe', nome: 'Aparar fim até a agulha', teclas: ['W'], fn: () => veRippleTrimEnd() },
    { id: 'trilha-acima', grupo: 'clipe', nome: 'Mover para a trilha de cima', teclas: ['Alt+Up'], sep: true, fn: () => veTrocarTrilha(1), pode: veSel },
    { id: 'trilha-abaixo', grupo: 'clipe', nome: 'Mover para a trilha de baixo', teclas: ['Alt+Down'], fn: () => veTrocarTrilha(-1), pode: veSel },
    { id: 'easy-ease', grupo: 'clipe', sep: true, nome: 'Easy Ease (quadros-chave)', teclas: ['F9'], fn: () => veKlEasy('ambos') },
    { id: 'easy-ease-in', grupo: 'clipe', nome: 'Easy Ease de entrada', teclas: ['Shift+F9'], fn: () => veKlEasy('in') },
    { id: 'easy-ease-out', grupo: 'clipe', nome: 'Easy Ease de saída', teclas: ['Ctrl+Shift+F9'], fn: () => veKlEasy('out') },
    { id: 'copiar-efeitos', grupo: 'clipe', nome: 'Copiar efeitos', teclas: ['Ctrl+Alt+C'], sep: true, fn: () => veCpEfeitosCopiar(), pode: () => VE.sel >= 0 },
    { id: 'colar-efeitos', grupo: 'clipe', nome: 'Colar efeitos', teclas: ['Ctrl+Alt+V'], fn: () => veCpEfeitosColar(), pode: () => !!VECP.fx && veSel() },
    { id: 'ativar', grupo: 'clipe', nome: 'Ativar', teclas: ['Ctrl+Shift+E'], sep: true, fn: () => veAlternarAtivo(), pode: veSel, marcado: () => !!VE.clips[VE.sel] && !veClipOff(VE.clips[VE.sel]) },
    { id: 'criar-comp', grupo: 'clipe', nome: 'Criar Comp...', teclas: ['Ctrl+Shift+C'], sep: true, fn: () => veCompDialogo(), pode: veSel },
    { id: 'descompactar-comp', grupo: 'clipe', nome: 'Descompactar Comp', teclas: [], fn: () => veCompDescompactar(VE.clips[VE.sel]),
      pode: () => !!VE.clips[VE.sel] && veEhComp(veMediaOf(VE.clips[VE.sel])) },
    { id: 'inverter', grupo: 'clipe', nome: 'Inverter clipe (Reverse Speed)', teclas: [], fn: () => veInverterClipes(), pode: veSel, marcado: () => veInvertido(VE.clips[VE.sel]) },
    { id: 'vinculo', grupo: 'clipe', nome: 'Seleção vinculada', teclas: [], sep: true, fn: () => veToggleVinculo(), marcado: () => VE.vinculo },

    // ── Sequência ──
    { id: 'seq-config', grupo: 'sequencia', nome: 'Configurações da sequência...', teclas: [], fn: () => veSeqConfigAbrir() },
    { id: 'cortar-tudo', grupo: 'sequencia', sep: true, nome: 'Cortar todas as trilhas na agulha', teclas: ['Ctrl+K', 'S', "'"], fn: () => veSplitAtPlayhead() },
    { id: 'extrair', grupo: 'sequencia', nome: 'Remover trecho In→Out', teclas: ['X'], fn: () => veExtractInOut(), pode: () => VE.inPt != null && VE.outPt != null },
    { id: 'trans-video', grupo: 'sequencia', nome: 'Aplicar transição de vídeo padrão', teclas: ['Ctrl+D'], sep: true, fn: () => veTransPadrao(false) },
    { id: 'trans-audio', grupo: 'sequencia', nome: 'Aplicar transição de áudio padrão', teclas: ['Ctrl+Shift+D', 'Ctrl+Shift+9'], fn: () => veTransPadrao(true) },
    { id: 'ima', grupo: 'sequencia', nome: 'Ímã (encaixar)', teclas: ['N'], sep: true, fn: () => veToggleSnap(), marcado: () => VE.snap },
    { id: 'render-inout', grupo: 'sequencia', sep: true, nome: 'Renderizar prévia (In a Out)', teclas: ['Enter'], fn: () => vePrRenderizar() },
    { id: 'render-cancelar', grupo: 'sequencia', nome: 'Cancelar render da prévia', teclas: [], fn: () => vePrCancelar(), pode: () => !!(VEPR.atual || VEPR.fila.length) },
    { id: 'render-apagar', grupo: 'sequencia', nome: 'Apagar arquivos de render do projeto', teclas: [], fn: () => vePrApagarProjeto(), pode: () => VEPR.files.size > 0 },
    { id: 'restaurar', grupo: 'sequencia', nome: 'Voltar ao vídeo original', teclas: [], sep: true, fn: () => veResetEdits() },

    // ── Marcadores ──
    { id: 'marcar-in', grupo: 'marcadores', nome: 'Marcar entrada', teclas: ['I'], fn: () => veMarkIn() },
    { id: 'marcar-out', grupo: 'marcadores', nome: 'Marcar saída', teclas: ['O'], fn: () => veMarkOut() },
    { id: 'marcador-add', grupo: 'marcadores', nome: 'Adicionar marcador', teclas: ['M'], sep: true, fn: () => veAddMarker() },
    { id: 'marcador-prox', grupo: 'marcadores', nome: 'Ir para o próximo marcador', teclas: ['Shift+M'], fn: () => veJumpMarker(1), pode: () => (VE.markers || []).length > 0 },
    { id: 'marcador-ant', grupo: 'marcadores', nome: 'Ir para o marcador anterior', teclas: ['Ctrl+Shift+M'], fn: () => veJumpMarker(-1), pode: () => (VE.markers || []).length > 0 },
    { id: 'marcador-apagar', grupo: 'marcadores', nome: 'Apagar marcador na agulha', teclas: ['Alt+M'], fn: () => veRemoveMarkerAtPlayhead(), pode: () => (VE.markers || []).length > 0 },
    { id: 'ir-in', grupo: 'marcadores', nome: 'Ir para a entrada', teclas: ['Shift+I'], sep: true, fn: () => veSeek(VE.inPt), pode: () => VE.inPt != null },
    { id: 'ir-out', grupo: 'marcadores', nome: 'Ir para a saída', teclas: ['Shift+O'], fn: () => veSeek(VE.outPt), pode: () => VE.outPt != null },
    { id: 'limpar-in', grupo: 'marcadores', nome: 'Limpar entrada', teclas: ['Ctrl+Shift+I'], sep: true, fn: () => veLimparInOut(true, false), pode: () => VE.inPt != null },
    { id: 'limpar-out', grupo: 'marcadores', nome: 'Limpar saída', teclas: ['Ctrl+Shift+O'], fn: () => veLimparInOut(false, true), pode: () => VE.outPt != null },
    { id: 'limpar-inout', grupo: 'marcadores', nome: 'Limpar entrada e saída', teclas: ['Ctrl+Shift+X'], fn: () => veLimparInOut(true, true), pode: () => VE.inPt != null || VE.outPt != null },

    // ── Exibir ──
    { id: 'play', grupo: 'exibir', nome: 'Reproduzir / Pausar', teclas: ['Space'], fn: () => veTogglePlay() },
    { id: 'tela-cheia', grupo: 'exibir', nome: 'Reproduzir em tela cheia', teclas: ['Alt+Enter'], fn: () => veTelaCheia() },
    { id: 'mudo', grupo: 'exibir', nome: 'Som da prévia', teclas: ['Ctrl+Alt+M'], fn: () => veToggleMute(), marcado: () => !VE.muted },
    { id: 'zoom-mais', grupo: 'exibir', nome: 'Mais zoom na timeline', teclas: ['+', '='], sep: true, fn: () => veZoomBy(1.5) },
    { id: 'zoom-menos', grupo: 'exibir', nome: 'Menos zoom na timeline', teclas: ['-'], fn: () => veZoomBy(1 / 1.5) },
    { id: 'zoom-ajustar', grupo: 'exibir', nome: 'Ajustar a timeline à tela', teclas: ['\\'], fn: () => veZoomFit() },
    { id: 'monitor-fit', grupo: 'exibir', nome: 'Monitor: ajustar à tela', teclas: [], sep: true, fn: () => veMonitorFit() },
    { id: 'monitor-100', grupo: 'exibir', nome: 'Monitor: 100%', teclas: [], fn: () => veMonitorZoomTo(1) },
    { id: 'reguas', grupo: 'exibir', nome: 'Réguas', teclas: ['Ctrl+R'], sep: true, sempre: true, fn: () => veToggleRulers(), marcado: () => VEM.rulers },
    { id: 'guias-mostrar', grupo: 'exibir', nome: 'Mostrar guias', teclas: ['Ctrl+;'], sempre: true, fn: () => veGuiasMostrar(), marcado: () => VEG.show },
    { id: 'guias-travar', grupo: 'exibir', nome: 'Travar guias', teclas: ['Ctrl+Alt+;'], sempre: true, fn: () => veGuiasTravar(), marcado: () => VEG.lock },
    { id: 'guias-encaixe', grupo: 'exibir', nome: 'Encaixar nas guias', teclas: [], sempre: true, fn: () => veGuiasEncaixe(), marcado: () => VEG.snap },
    { id: 'guias-limpar', grupo: 'exibir', nome: 'Limpar guias', teclas: [], fn: () => veGuiasLimpar(), pode: () => veGuias().length > 0 },
    { id: 'res-full', grupo: 'exibir', nome: 'Resolução da prévia: Full', teclas: [], sep: true, fn: () => veSetPreviewRes(1), marcado: () => VEM.res === 1 },
    { id: 'res-half', grupo: 'exibir', nome: 'Resolução da prévia: 1/2', teclas: [], fn: () => veSetPreviewRes(0.5), marcado: () => VEM.res !== 1 },

    // ── só atalho: reprodução e navegação ──
    { id: 'parar', grupo: 'reproducao', nome: 'Parar', teclas: ['K'], fn: () => { veStop(); veSetRate(1); } },
    { id: 'acelerar', grupo: 'reproducao', nome: 'Reproduzir mais rápido (1,5x · 2x · 3x)', teclas: ['L'], fn: () => {
        if (!VE.playing) { veSetRate(1.5); vePlay(); } else veSetRate({ 1: 1.5, 1.5: 2, 2: 3, 3: 1 }[VE.rate] || 1);
        veToast(VE.rate === 1 ? 'Velocidade normal' : `Velocidade ${String(VE.rate).replace('.', ',')}x`);
    } },
    { id: 'voltar-5s', grupo: 'reproducao', nome: 'Voltar 5 segundos', teclas: ['J'], fn: () => veSeek(VE.playhead - 5) },
    { id: 'quadro-ant', grupo: 'reproducao', nome: 'Voltar 1 quadro', teclas: ['Left'], fn: () => veStepFrames(-1) },
    { id: 'quadro-prox', grupo: 'reproducao', nome: 'Avançar 1 quadro', teclas: ['Right'], fn: () => veStepFrames(1) },
    { id: 'seg-ant', grupo: 'reproducao', nome: 'Voltar 1 segundo', teclas: ['Shift+Left'], fn: () => veSeek(VE.playhead - 1) },
    { id: 'seg-prox', grupo: 'reproducao', nome: 'Avançar 1 segundo', teclas: ['Shift+Right'], fn: () => veSeek(VE.playhead + 1) },
    { id: 'corte-ant', grupo: 'reproducao', nome: 'Ir para o corte anterior', teclas: ['Up'], fn: () => veJumpEdit(-1) },
    { id: 'corte-prox', grupo: 'reproducao', nome: 'Ir para o próximo corte', teclas: ['Down'], fn: () => veJumpEdit(1) },
    { id: 'inicio', grupo: 'reproducao', nome: 'Ir para o início', teclas: ['Home'], fn: () => veSeek(0) },
    { id: 'fim', grupo: 'reproducao', nome: 'Ir para o fim', teclas: ['End'], fn: () => veSeek(VE.dur) },

    // ── só atalho: ferramentas ──
    { id: 'ferr-selecao', grupo: 'ferramentas', nome: 'Ferramenta Seleção', teclas: ['V'], fn: () => veSetTool('select') },
    { id: 'ferr-lamina', grupo: 'ferramentas', nome: 'Ferramenta Lâmina', teclas: ['C'], fn: () => veSetTool('razor') },
    { id: 'ferr-mao', grupo: 'ferramentas', nome: 'Ferramenta Mão', teclas: ['H'], fn: () => veSetTool('hand') },
    { id: 'ferr-zoom', grupo: 'ferramentas', nome: 'Ferramenta Zoom', teclas: ['Z'], fn: () => veSetTool('zoom') },
    { id: 'ferr-velocidade', grupo: 'ferramentas', nome: 'Ferramenta Velocidade', teclas: ['R'], fn: () => { veSetTool('rate'); veToast('Velocidade (R): arraste a borda de um clipe'); } },
    { id: 'ferr-frente', grupo: 'ferramentas', nome: 'Selecionar faixa para a frente', teclas: ['A'], fn: () => { veSetTool('fwd'); veToast('Faixa para a frente (A): clique para pegar tudo dali em diante · Shift: só a trilha'); } },
    { id: 'ferr-tras', grupo: 'ferramentas', nome: 'Selecionar faixa para trás', teclas: ['Shift+A'], fn: () => { veSetTool('bwd'); veToast('Faixa para trás (Shift+A): clique para pegar tudo dali para trás · Shift: só a trilha'); } },
    { id: 'ferr-forma', grupo: 'ferramentas', nome: 'Ferramenta Forma', teclas: ['Y'], fn: () => { veSetTool('forma'); veToast('Forma (Y): arraste no monitor · Shift: proporção 1:1'); } },
    { id: 'ferr-pincel', grupo: 'ferramentas', nome: 'Ferramenta Pincel', teclas: ['B'], fn: () => { veSetTool('pincel'); veToast('Pincel (B): pinte no monitor'); } },
    { id: 'ferr-texto', grupo: 'ferramentas', nome: 'Ferramenta Texto', teclas: ['T'], fn: () => { veSetTool('texto'); veToast('Texto (T): clique no monitor para escrever'); } },

    // ── Ajuda ──
    { id: 'ajuda-atalhos', grupo: 'ajuda', nome: 'Atalhos do teclado...', teclas: [], sempre: true, fn: () => veAtalhosAbrir() },
    { id: 'ajuda-dicas', grupo: 'ajuda', nome: 'Dicas do editor (painel Atalhos)', teclas: [], sempre: true, fn: () => vedShow('keys') },
];
const VE_CMD = Object.fromEntries(VE_CMDS.map(c => [c.id, c]));

// Menus da barra (Janela abre o menu de painéis/workspaces de editor-dock.js)
const VE_MENUS = [['arquivo', 'Arquivo'], ['editar', 'Editar'], ['clipe', 'Clipe'], ['sequencia', 'Sequência'],
    ['marcadores', 'Marcadores'], ['exibir', 'Exibir'], ['janela', 'Janela'], ['ajuda', 'Ajuda']];
const VE_GRUPOS_ATALHO = [...VE_MENUS.filter(([g]) => g !== 'janela'), ['reproducao', 'Reprodução e navegação'], ['ferramentas', 'Ferramentas']];

// ─────────────────────────── teclas ───────────────────────────
const VE_TECLA_NOMES = { ' ': 'Space', arrowleft: 'Left', arrowright: 'Right', arrowup: 'Up', arrowdown: 'Down', escape: 'Esc',
    delete: 'Delete', backspace: 'Backspace', enter: 'Enter', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', tab: 'Tab', insert: 'Insert' };

// evento → "Ctrl+Shift+K" (null para uma tecla modificadora sozinha)
function veTeclaCombo(e) {
    let k = e.key;
    if (!k || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(k)) return null;
    let simbolo = false, shiftNum = false;
    if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
    else if (/^Digit\d$/.test(e.code)) k = e.code.slice(5);
    // Shift + número do numpad: o Windows solta o Shift e manda PageUp/End...; o Shift estava apertado
    else if (/^Numpad\d$/.test(e.code)) { k = e.code.slice(6); shiftNum = !/^\d$/.test(e.key) && e.getModifierState('NumLock'); }
    else if (e.ctrlKey && e.shiftKey && (k === ')' || k === '(')) k = '9';
    else if (k === 'Dead' && e.code === 'Backquote') { k = "'"; simbolo = true; }   // ' no ABNT2 internacional
    else if (VE_TECLA_NOMES[k.toLowerCase()]) k = VE_TECLA_NOMES[k.toLowerCase()];
    else if (/^F\d{1,2}$/.test(k)) { /* F1..F12 */ }
    else if (k.length === 1) simbolo = true;           // + - = \ ' ...: o caractere já inclui o Shift
    else return null;
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if ((e.shiftKey || shiftNum) && !simbolo) mods.push('Shift');
    return [...mods, k].join('+');
}

const veCmdTeclas = c => (PREFS.atalhos && Array.isArray(PREFS.atalhos[c.id]) ? PREFS.atalhos[c.id] : c.teclas);
function veMapaTeclas() {
    const mapa = {};
    VE_CMDS.forEach(c => veCmdTeclas(c).forEach(t => { if (!mapa[t]) mapa[t] = c; }));
    return mapa;
}
const veTeclaTexto = t => t.replace('Space', 'Espaço').replace('Left', '←').replace('Right', '→').replace(/\bUp\b/, '↑').replace(/\bDown\b/, '↓');

// Chamado por veOnKey (editor.js) depois das verificações de foco/modais: true se a tecla era um atalho
function veExecTecla(e) {
    const combo = veTeclaCombo(e);
    if (!combo) return false;
    const c = veMapaTeclas()[combo];
    if (!c) return false;
    e.preventDefault();
    if (!c.sempre && !VE.ready) return true;
    if (c.pode && VE.ready && !c.pode()) return true;
    c.fn();
    return true;
}

// ─────────────────────────── ações novas ───────────────────────────
function veLimparInOut(entrada, saida) {
    if (entrada) VE.inPt = null;
    if (saida) VE.outPt = null;
    veDraw();
    veToast(entrada && saida ? 'Entrada e saída limpas' : entrada ? 'Entrada limpa' : 'Saída limpa');
}

// Mostra o painel Texto na aba pedida (a exportação escolhe o formato lá)
function veAbrirTexto(aba) {
    vedShow('texto');
    VETX.aba = aba;
    veTxRender();
    veToast('Escolha o formato e clique em Exportar');
}

// Alt+Enter: o monitor em tela cheia, reproduzindo a partir da agulha. Esc (ou Alt+Enter) sai e pausa.
// O main.py deixa a janela sem borda e maximizada enquanto o WebView2 tem um elemento em tela cheia.
function veTelaCheia() {
    const tela = $ve('ve-screen'), doc = tela.ownerDocument;
    if (doc.fullscreenElement) { doc.exitFullscreen(); return; }
    if (!tela._telaCheia) {
        tela._telaCheia = true;
        doc.addEventListener('fullscreenchange', () => {
            if (!doc.fullscreenElement && VE.playing) veStop();
            setTimeout(() => { if (typeof veApplyMonitor === 'function') veApplyMonitor(); veDraw(); }, 60);
        });
    }
    tela.requestFullscreen().then(() => { if (!VE.playing) vePlay(); })
        .catch(err => veToast('Não foi possível abrir a tela cheia: ' + (err && err.message || err)));
}

// ─────────────────────────── barra de menus ───────────────────────────
const VEMB = { aberto: null, el: null };

function veMenuBarInit() {
    const bar = $ve('ve-mbar');
    if (!bar) return;
    bar.innerHTML = VE_MENUS.map(([g, n]) => `<button class="ve-mbar-item" data-menu="${g}">${n}</button>`).join('');
    bar.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-menu]');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        if (VEMB.aberto === b.dataset.menu) veMenuFechar(); else veMenuAbrir(b);
    });
    // com um menu aberto, passar o mouse pelos outros troca de menu (como nos apps da Adobe)
    bar.addEventListener('pointerover', e => {
        const b = e.target.closest('[data-menu]');
        if (b && VEMB.aberto && VEMB.aberto !== b.dataset.menu) veMenuAbrir(b);
    });
}

function veMenuFechar() {
    if (VEMB.el) VEMB.el.remove();
    document.querySelector('.ve-menu')?.remove();     // o de Janela (editor-dock.js)
    VEMB.el = null;
    VEMB.aberto = null;
    document.querySelectorAll('.ve-mbar-item.on').forEach(x => x.classList.remove('on'));
    document.removeEventListener('pointerdown', veMenuFora, true);
    document.removeEventListener('keydown', veMenuTecla, true);
}
function veMenuFora(e) { if (!e.target.closest('.ve-mbar-menu, .ve-menu, .ve-mbar')) veMenuFechar(); }
function veMenuTecla(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); veMenuFechar(); } }

function veMenuAbrir(btn) {
    veMenuFechar();
    const g = btn.dataset.menu;
    VEMB.aberto = g;
    btn.classList.add('on');
    document.addEventListener('pointerdown', veMenuFora, true);
    document.addEventListener('keydown', veMenuTecla, true);
    if (g === 'janela') { veDockMenu({ currentTarget: btn, stopPropagation() {} }); return; }
    const m = document.createElement('div');
    m.className = 've-mbar-menu';
    m.innerHTML = VE_CMDS.filter(c => c.grupo === g).map((c, i) => {
        const ok = (c.sempre || VE.ready) && (!c.pode || !VE.ready || c.pode());
        const t = veCmdTeclas(c)[0];
        return (c.sep && i ? '<hr>' : '') + `<button data-cmd="${c.id}"${ok ? '' : ' disabled'}><b>${c.marcado && VE.ready && c.marcado() ? '✓' : ''}</b>` +
            `<span>${c.nome}</span><kbd>${t ? veEsc(veTeclaTexto(t)) : ''}</kbd></button>`;
    }).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.top = r.bottom + 2 + 'px';
    m.style.left = Math.max(4, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
    m.addEventListener('click', e => {
        const b = e.target.closest('[data-cmd]');
        if (!b || b.disabled) return;
        veMenuFechar();
        VE_CMD[b.dataset.cmd].fn();
    });
    VEMB.el = m;
}

// ─────────────────────────── janela Atalhos do teclado ───────────────────────────
const VEAT = { aberto: false, gravando: null, busca: '', aviso: '' };

function veAtalhosAbrir() {
    veMenuFechar();
    let md = $ve('ve-atalhos');
    if (!md) {
        md = document.createElement('div');
        md.className = 've-modal';
        md.id = 've-atalhos';
        md.innerHTML = `<div class="ve-modal-box ve-at-box" tabindex="-1">
            <div class="ve-modal-head"><span>Atalhos do teclado</span><button class="ve-icon-btn" data-at="fechar" title="Fechar (Esc)"><svg class="i"><use href="#i-x"/></svg></button></div>
            <div class="ve-at-topo"><div class="ve-fx-search"><svg class="i"><use href="#i-search"/></svg><input id="ve-at-busca" placeholder="Buscar comando ou tecla" autocomplete="off"></div></div>
            <div class="ve-at-lista" id="ve-at-lista"></div>
            <div class="ve-at-aviso" id="ve-at-aviso"></div>
            <div class="ve-modal-foot"><button class="ve-btn ve-btn-ghost" data-at="padrao">Restaurar padrões</button><span class="ve-top-spacer"></span><button class="ve-btn ve-btn-primary" data-at="fechar">Fechar</button></div>
        </div>`;
        $ve('ve').appendChild(md);
        md.addEventListener('click', veAtalhosClique);
        md.querySelector('#ve-at-busca').addEventListener('input', e => { VEAT.busca = e.target.value; veAtalhosRender(); });
        // gravando uma tecla: a próxima combinação vira o atalho (Esc cancela); fora disso, Esc fecha
        md.addEventListener('keydown', e => {
            if (VEAT.gravando) {
                e.preventDefault(); e.stopPropagation();
                if (e.key === 'Escape') { VEAT.gravando = null; veAtalhosRender(); return; }
                const combo = veTeclaCombo(e);
                if (combo) veAtalhoDefinir(VEAT.gravando, combo);
                return;
            }
            if (e.key === 'Escape') { e.stopPropagation(); veAtalhosFechar(); }
            else if (e.target.id !== 've-at-busca') e.stopPropagation();
        });
    }
    md.hidden = false;
    VEAT.aberto = true;
    VEAT.aviso = '';
    veAtalhosRender();
    md.querySelector('#ve-at-busca').focus();
}

function veAtalhosFechar() {
    const md = $ve('ve-atalhos');
    if (md) md.hidden = true;
    VEAT.aberto = false;
    VEAT.gravando = null;
}

function veAtalhosRender() {
    const box = $ve('ve-at-lista');
    if (!box) return;
    const q = VEAT.busca.trim().toLowerCase();
    const bate = c => !q || veT(c.nome).toLowerCase().includes(q) || c.nome.toLowerCase().includes(q) ||
        veCmdTeclas(c).some(t => t.toLowerCase().includes(q) || veTeclaTexto(t).toLowerCase().includes(q));
    box.innerHTML = VE_GRUPOS_ATALHO.map(([g, n]) => {
        const cs = VE_CMDS.filter(c => c.grupo === g && bate(c));
        if (!cs.length) return '';
        return `<div class="ve-at-grupo">${n}</div>` + cs.map(c => {
            const ts = veCmdTeclas(c), mudou = PREFS.atalhos && Array.isArray(PREFS.atalhos[c.id]);
            return `<div class="ve-at-row${VEAT.gravando === c.id ? ' gravando' : ''}" data-id="${c.id}"><span class="ve-at-nome">${c.nome}</span>
                <span class="ve-at-teclas">${ts.map(t => `<span class="ve-at-kbd">${veEsc(veTeclaTexto(t))}<button data-at="tirar" data-t="${veEsc(t)}" title="Remover este atalho">×</button></span>`).join('')}
                ${VEAT.gravando === c.id ? '<span class="ve-at-kbd rec">Pressione as teclas... (Esc cancela)</span>' : `<button class="ve-at-add" data-at="add" title="Adicionar atalho">+</button>`}
                ${mudou ? '<button class="ve-at-add" data-at="volta" title="Voltar ao padrão">↺</button>' : ''}</span></div>`;
        }).join('');
    }).join('') || `<div class="ve-clips-empty">Nada encontrado</div>`;
    $ve('ve-at-aviso').textContent = VEAT.aviso;
}

function veAtalhoSalvar(id, teclas) {
    PREFS.atalhos = PREFS.atalhos || {};
    const c = VE_CMD[id];
    if (JSON.stringify(teclas) === JSON.stringify(c.teclas)) delete PREFS.atalhos[id]; else PREFS.atalhos[id] = teclas;
}

// nova tecla para o comando; se outro comando usava a mesma, ela sai de lá (e avisa)
function veAtalhoDefinir(id, combo) {
    VEAT.gravando = null;
    const dono = VE_CMDS.find(c => c.id !== id && veCmdTeclas(c).includes(combo));
    if (dono) veAtalhoSalvar(dono.id, veCmdTeclas(dono).filter(t => t !== combo));
    const atuais = veCmdTeclas(VE_CMD[id]);
    if (!atuais.includes(combo)) veAtalhoSalvar(id, [...atuais, combo]);
    VEAT.aviso = dono ? `${veTeclaTexto(combo)} foi tirado de "${veT(dono.nome)}" e agora é de "${veT(VE_CMD[id].nome)}".` : '';
    prefsSave();
    veAtalhosRender();
}

function veAtalhosClique(e) {
    const b = e.target.closest('[data-at]');
    if (!b) { if (e.target === e.currentTarget) veAtalhosFechar(); return; }
    const a = b.dataset.at, row = b.closest('[data-id]'), id = row && row.dataset.id;
    if (a === 'fechar') { veAtalhosFechar(); return; }
    if (a === 'padrao') { PREFS.atalhos = {}; VEAT.aviso = 'Todos os atalhos voltaram ao padrão.'; prefsSave(); veAtalhosRender(); return; }
    if (a === 'add') { VEAT.gravando = id; VEAT.aviso = ''; veAtalhosRender(); $ve('ve-atalhos').querySelector('.ve-at-box').focus(); return; }
    if (a === 'tirar') { veAtalhoSalvar(id, veCmdTeclas(VE_CMD[id]).filter(t => t !== b.dataset.t)); VEAT.aviso = ''; prefsSave(); veAtalhosRender(); return; }
    if (a === 'volta') { delete PREFS.atalhos[id]; VEAT.aviso = ''; prefsSave(); veAtalhosRender(); }
}

document.addEventListener('DOMContentLoaded', veMenuBarInit);
