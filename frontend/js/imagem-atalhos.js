// =========================================================
// Editor de Imagem — atalhos padrão do Photoshop (Windows), conferidos na referência oficial da Adobe:
//   "Keyboard shortcuts | Photoshop" (helpx.adobe.com/.../photoshop-keyboard-shortcuts.pdf) e
//   "Adobe Photoshop CC — Windows Keyboard Shortcuts Reference" (helpx.adobe.com/.../PhotoshopCC-KBSC.pdf).
// Aqui ficam os que faltavam no imagem-paineis.js (IE_ATALHOS): teclas de função, documentos, seleção de camadas,
// modos de mesclagem (Shift+Alt+letra), opacidade com dois dígitos, Ctrl = ferramenta Mover temporária, ` = borracha
// temporária com o pincel, modos de tela (F, Tab), máscara (\, Alt+clique), formatação de texto, Último filtro,
// Transformar de novo, Selecionar novamente, ajustes automáticos, grade e extras. Ajuda > Atalhos do teclado
// (Alt+Shift+Ctrl+K) lista tudo, inclusive o que o editor ainda não tem.
// Nomes das teclas como o ieTeclaNome monta: Alt, Shift, Ctrl, tecla (nessa ordem).
// =========================================================

const IE_BM_LETRA = {
    N: 'NORMAL', I: 'DISSOLVE', K: 'DARKEN', M: 'MULTIPLY', B: 'COLOR_BURN', A: 'LINEAR_BURN', G: 'LIGHTEN', S: 'SCREEN',
    D: 'COLOR_DODGE', W: 'LINEAR_DODGE', O: 'OVERLAY', F: 'SOFT_LIGHT', H: 'HARD_LIGHT', V: 'VIVID_LIGHT', J: 'LINEAR_LIGHT',
    Z: 'PIN_LIGHT', L: 'HARD_MIX', E: 'DIFFERENCE', X: 'EXCLUSION', U: 'HUE', T: 'SATURATION', C: 'COLOR', Y: 'LUMINOSITY',
};

Object.assign(IE_ATALHOS, {
    // teclas de função
    F2: 'recortar', F3: 'copiar', F4: 'colar', F12: 'reverter', 'Shift+F7': 'selInverter',
    // arquivo e documentos
    'Alt+Ctrl+W': 'fecharTodos', 'Alt+Ctrl+P': 'fecharOutros', 'Ctrl+Tab': 'docProximo', 'Shift+Ctrl+Tab': 'docAnterior',
    'Alt+Ctrl+S': 'salvarComo', 'Alt+Shift+Ctrl+S': 'exportar', 'Alt+Ctrl+O': 'abrir', 'Alt+Shift+Ctrl+O': 'abrir',
    // editar
    'Shift+Ctrl+T': 'transfDeNovo', 'Shift+Backspace': 'preencher', 'Shift+Delete': 'preencher',
    'Alt+Shift+Backspace': 'preencherFrenteTransp', 'Shift+Ctrl+Backspace': 'preencherFundoTransp',
    'Alt+Shift+Ctrl+K': 'atalhos',
    // imagem
    'Shift+Ctrl+L': 'autoTom', 'Alt+Shift+Ctrl+L': 'autoContraste', 'Shift+Ctrl+B': 'autoCor',
    // camadas
    'Alt+Ctrl+A': 'camTodas', 'Alt+.': 'camTopo', 'Alt+,': 'camBase', 'Alt+Shift+[': 'camAddAbaixo', 'Alt+Shift+]': 'camAddAcima',
    'Alt+Shift+Ctrl+E': 'carimbarVisiveis', 'Ctrl+2': 'alvoCamada', 'Ctrl+\\': 'alvoMascara', '/': 'travaTransp',
    '\\': 'mascaraRubi', '+': 'bmProximo', 'Shift+-': 'bmAnterior',
    // seleção
    'Shift+Ctrl+D': 'selRefazer',
    // filtro
    'Ctrl+F': 'filtroUltimo',
    // exibir
    'Ctrl+H': 'extras', "Ctrl+'": 'grade', 'F': 'telaProxima', 'Shift+F': 'telaAnterior', Tab: 'paineisTodos', 'Shift+Tab': 'paineisLado',
    Home: 'vistaInicio', End: 'vistaFim', PageUp: 'vistaCima', PageDown: 'vistaBaixo', 'Ctrl+PageUp': 'vistaEsq', 'Ctrl+PageDown': 'vistaDir',
    'Shift+PageUp': 'vistaCima10', 'Shift+PageDown': 'vistaBaixo10',
});
for (const [l, bm] of Object.entries(IE_BM_LETRA)) IE_ATALHOS['Alt+Shift+' + l] = 'bm:' + bm;

// ─────────────────────────── comandos novos ───────────────────────────
function ieAplicarProc(nome, proc) {
    return (async () => {
        const doc = IE.doc, L = ieAtiva(doc);
        if (!doc || !(await iePodePintar(L, 'aplicar o ajuste')) || !L.c) return;
        const Rantes = ieRCamada(L);
        const r = ieProcessarCamada(L, proc, 0, doc);
        ieGravavel(L);
        L.c = r.c; L.x = r.x; L.y = r.y; L.sujoPx = true;
        ieCamadaMudou(L, Rantes);
        ieHist(ieT(nome));
    })();
}

// níveis automáticos: corta 0,1% de cada ponta (como o Photoshop), por canal ou em conjunto
function ieAutoNiveis(modo) {
    return c => {
        const n = ieClonar(c), x = ieCtx(n), img = x.getImageData(0, 0, n.width, n.height), d = img.data;
        const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
        let tot = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 8) continue;
            tot++;
            hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++;
            hist[3][Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
        }
        if (!tot) return n;
        const pontas = h => {
            const corte = tot * 0.001;
            let a = 0, b = 255, s = 0;
            for (; a < 255; a++) { s += h[a]; if (s > corte) break; }
            s = 0;
            for (; b > 0; b--) { s += h[b]; if (s > corte) break; }
            return b > a ? [a, b] : [0, 255];
        };
        const lim = modo === 'contraste' ? [0, 1, 2].map(() => pontas(hist[3])) : [0, 1, 2].map(k => pontas(hist[k]));
        const luts = lim.map(([a, b]) => { const t = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) t[v] = (v - a) * 255 / (b - a); return t; });
        if (modo === 'cor') {
            // cor automática: depois de esticar cada canal, puxa os meios-tons para o cinza (média de cada canal → 128)
            const soma = [0, 0, 0];
            for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 8) for (let k = 0; k < 3; k++) soma[k] += luts[k][d[i + k]];
            const med = soma.map(s => s / tot), alvo = (med[0] + med[1] + med[2]) / 3;
            luts.forEach((t, k) => {
                const g = Math.log(Math.max(1, alvo) / 255) / Math.log(Math.max(1, Math.min(254, med[k])) / 255);
                const gg = ieClamp(isFinite(g) ? g : 1, 0.6, 1.6);
                for (let v = 0; v < 256; v++) t[v] = 255 * Math.pow(t[v] / 255, gg);
            });
        }
        for (let i = 0; i < d.length; i += 4) { d[i] = luts[0][d[i]]; d[i + 1] = luts[1][d[i + 1]]; d[i + 2] = luts[2][d[i + 2]]; }
        x.putImageData(img, 0, 0);
        return n;
    };
}

function ieVistaRolar(dx, dy) {
    const doc = IE.doc;
    if (!doc) return;
    doc.px += dx; doc.py += dy;
    ieDesenharVista(); ieDesenharSobre();
}

// modos de tela (F): 0 normal, 1 tela cheia com menus, 2 tela cheia (só a imagem); Tab: esconde ferramentas, opções e painéis
IE.telaModo = 0;
function ieTelaModo(m) {
    IE.telaModo = (m + 3) % 3;
    const ie = ieEl('ie');
    ie.classList.toggle('ie-tela-1', IE.telaModo === 1);
    ie.classList.toggle('ie-tela-2', IE.telaModo === 2);
    ieToast([ieT('Modo de tela padrão'), ieT('Tela cheia com menus'), ieT('Tela cheia (F volta)')][IE.telaModo]);
    setTimeout(() => ieAjustarVista(), 60);
}

Object.assign(IE_CMDS, {
    reverter: async doc => {
        const p = doc.path;
        if (!p || !(await ieApi()?.ie_existe(p))?.existe) { ieToast(ieT('O documento ainda não foi salvo')); return; }
        if (doc.sujo) {
            const ok = await appConfirm({ titulo: ieT('Reverter?'), texto: ieT('As mudanças desde o último salvamento serão perdidas.'),
                botoes: [{ rotulo: ieT('Cancelar'), valor: null }, { rotulo: ieT('Reverter'), valor: 1, tipo: 'primario' }] });
            if (!ok) return;
        }
        await ieFecharDoc(doc, true);
        await ieAbrirArquivo(p);
    },
    fecharTodos: async () => { for (const d of [...IE.docs]) if (!(await ieFecharDoc(d))) return; },
    fecharOutros: async doc => { for (const d of IE.docs.filter(x => x !== doc)) if (!(await ieFecharDoc(d))) return; ieMostrarDoc(doc); },
    docProximo: doc => { const i = IE.docs.indexOf(doc); if (IE.docs.length > 1) ieMostrarDoc(IE.docs[(i + 1) % IE.docs.length]); },
    docAnterior: doc => { const i = IE.docs.indexOf(doc); if (IE.docs.length > 1) ieMostrarDoc(IE.docs[(i - 1 + IE.docs.length) % IE.docs.length]); },
    transfDeNovo: () => { if (IE.ultimaTransf) ieTransfIniciar(IE.ultimaTransf); else ieToast(ieT('Nenhuma transformação para repetir')); },
    preencherFrenteTransp: doc => ieCmdPreencherTransp(doc, IE.cor[0]),
    preencherFundoTransp: doc => ieCmdPreencherTransp(doc, IE.cor[1]),
    autoTom: () => ieAplicarProc('Tom automático', ieAutoNiveis('tom')),
    autoContraste: () => ieAplicarProc('Contraste automático', ieAutoNiveis('contraste')),
    autoCor: () => ieAplicarProc('Cor automática', ieAutoNiveis('cor')),
    camTodas: doc => { const t = ieTodas(doc).filter(L => L.tipo !== 'grupo'); if (!t.length) return; doc.selIds = t.map(L => L.id); doc.ativa = t[t.length - 1].id; ieUiCamadas(); ieDesenharSobre(); },
    camTopo: doc => { const t = ieTodas(doc); if (t.length) ieAtivar(t[t.length - 1].id, doc); },
    camBase: doc => { const t = ieTodas(doc); if (t.length) ieAtivar(t[0].id, doc); },
    camAddAcima: doc => { const t = ieTodas(doc), i = t.findIndex(L => L.id === doc.ativa); if (t[i + 1]) ieAtivar(t[i + 1].id, doc, { somar: true }); },
    camAddAbaixo: doc => { const t = ieTodas(doc), i = t.findIndex(L => L.id === doc.ativa); if (i > 0) ieAtivar(t[i - 1].id, doc, { somar: true }); },
    alvoCamada: doc => { doc.mascaraAlvo = false; ieUiCamadas(); ieOpcoesRender(); },
    alvoMascara: doc => { const L = ieAtiva(doc); if (L && L.m) { doc.mascaraAlvo = true; ieUiCamadas(); ieOpcoesRender(); } },
    travaTransp: doc => {
        const sel = ieSelecionadas(doc).filter(L => L.tipo !== 'grupo');
        if (!sel.length) return;
        const ligar = !(sel[0].travas & 1);
        sel.forEach(L => { L.travas = ligar ? (L.travas | 1) : (L.travas & ~1); });
        ieHist(ieT(ligar ? 'Travar pixels transparentes' : 'Destravar pixels transparentes'));
        ieUiCamadas();
    },
    mascaraRubi: doc => { const L = ieAtiva(doc); if (!L || !L.m) return; doc.verMascara = doc.verMascara === 'rubi' ? null : 'rubi'; ieDesenharVista(); },
    bmProximo: doc => ieBmPasso(doc, 1),
    bmAnterior: doc => ieBmPasso(doc, -1),
    selRefazer: doc => { if (!doc.selAnterior) return; ieSelDefinir(doc, doc.selAnterior.c, doc.selAnterior.forma); ieHist(ieT('Selecionar novamente')); },
    filtroUltimo: () => ieRepetirFiltro(),
    extras: () => { IE.semExtras = !IE.semExtras; ieDesenharSobre(); },
    grade: () => { IE.grade = !IE.grade; ieDesenharSobre(); },
    telaProxima: () => ieTelaModo(IE.telaModo + 1),
    telaAnterior: () => ieTelaModo(IE.telaModo - 1),
    paineisTodos: () => { ieEl('ie').classList.toggle('ie-sem-paineis'); ieEl('ie').classList.remove('ie-sem-lado'); setTimeout(() => { ieDesenharVista(); ieDesenharSobre(); }, 30); },
    paineisLado: () => { ieEl('ie').classList.toggle('ie-sem-lado'); setTimeout(() => { ieDesenharVista(); ieDesenharSobre(); }, 30); },
    vistaInicio: doc => { doc.px = 20; doc.py = 20; ieDesenharVista(); ieDesenharSobre(); },
    vistaFim: doc => { const v = ieVistaTam(); doc.px = v.w - 20 - doc.w * doc.zoom; doc.py = v.h - 20 - doc.h * doc.zoom; ieDesenharVista(); ieDesenharSobre(); },
    vistaCima: () => ieVistaRolar(0, ieVistaTam().h * 0.9), vistaBaixo: () => ieVistaRolar(0, -ieVistaTam().h * 0.9),
    vistaEsq: () => ieVistaRolar(ieVistaTam().w * 0.9, 0), vistaDir: () => ieVistaRolar(-ieVistaTam().w * 0.9, 0),
    vistaCima10: () => ieVistaRolar(0, 10 * IE.doc.zoom), vistaBaixo10: () => ieVistaRolar(0, -10 * IE.doc.zoom),
    atalhos: () => ieAtalhosDialogo(),
});

async function ieCmdPreencherTransp(doc, cor) {
    const L = ieAtiva(doc);
    if (!(await iePodePintar(L, 'preencher'))) return;
    const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
    x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h);
    iePintarCobertura(doc, L, c, doc.sel ? doc.sel.bbox : ieRDoc(doc), 'Preencher', { cor, preservar: true });
}

function ieBmPasso(doc, dir) {
    const L = ieAtiva(doc);
    if (!L) return;
    const lista = (L.tipo === 'grupo' ? ['PASS_THROUGH'] : []).concat(IE_BM.filter(Boolean).map(b => b[0]));
    const i = lista.indexOf(L.bm);
    ieDefinirBm(doc, lista[(i + dir + lista.length) % lista.length]);
}
function ieDefinirBm(doc, bm) {
    const sel = ieSelecionadas(doc);
    if (!sel.length) return;
    sel.forEach(L => { L.bm = bm === 'PASS_THROUGH' && L.tipo !== 'grupo' ? 'NORMAL' : bm; ieInvalidar(L); });
    ieTudo(doc);
    const nome = (IE_BM_MAP[bm] || [0, 'Passagem'])[1];
    ieHist(`${ieT('Modo de mesclagem')}: ${ieT(nome)}`);
    ieToast(`${ieT('Mesclagem')}: ${ieT(nome)}`);
}

// ieCmd entende 'bm:CHAVE'
(function () {
    const orig = ieCmd;
    ieCmd = async function (c) {
        if (typeof c === 'string' && c.startsWith('bm:')) { if (IE.doc) ieDefinirBm(IE.doc, c.slice(3)); return; }
        return orig(c);
    };
})();

// ─────────────────────────── teclas especiais ───────────────────────────
// números: opacidade (Shift: fluxo) do pincel/borracha/carimbo/balde/degradê; com as outras ferramentas, a opacidade
// da camada. Dois números rápidos = valor exato (4 e 5 = 45%), como no Photoshop.
IE.numAnt = null;
function ieTeclaNumero(ev) {
    const doc = IE.doc;
    if (!doc) return false;
    const n = +ev.code.slice(-1);
    const agora = Date.now();
    let v;
    if (IE.numAnt && agora - IE.numAnt.t < 600) { v = IE.numAnt.n * 10 + n; IE.numAnt = null; if (v === 0) v = 0; }
    else { v = n === 0 ? 100 : n * 10; IE.numAnt = { n, t: agora }; }
    const f = IE.op[IE.ferr];
    if (f && f.opac !== undefined) {
        if (ev.shiftKey && f.fluxo !== undefined) f.fluxo = Math.max(1, v); else f.opac = Math.max(1, v);
        ieOpcoesRender();
        return true;
    }
    if (ev.shiftKey) return false;
    const sel = ieSelecionadas(doc);
    if (!sel.length) return true;
    sel.forEach(L => (L.op = v / 100));
    ieTudo(doc);
    clearTimeout(IE.numT);
    IE.numT = setTimeout(() => ieHist(ieT('Opacidade')), 650);
    return true;
}

// Ctrl segurado = ferramenta Mover temporária (exceto Mão, Zoom, Forma, Texto); ` segurado com o pincel = borracha
const IE_SEM_CTRL_MOVER = ['mover', 'mao', 'zoom', 'forma', 'texto'];

(function () {
    const orig = ieTecla;
    ieTecla = function (ev) {
        if (!ieAtivoVisivel() || !ieEl('ie-modal').hidden || ieDigitando(ev) || IE.edTexto) return orig(ev);
        const doc = IE.doc;
        if (ev.key === 'Control' && doc && !IE.ponteiro && !IE.transf && !IE.ferrTemp && !IE_SEM_CTRL_MOVER.includes(IE.ferr)) {
            IE.ferrTemp = 'mover'; IE.ctrlMover = true; ieCursor(ev); ieDesenharSobre();
        }
        if ((ev.code === 'Backquote' || ev.key === '`' || ev.key === '~') && IE.ferr === 'pincel' && !IE.ponteiro) {
            ev.preventDefault();
            if (IE.ferrTemp !== 'borracha') { IE.ferrTemp = 'borracha'; ieCursor(ev); }
            return;
        }
        // formatação de texto com a ferramenta Texto e uma camada de texto selecionada
        if (IE.ferr === 'texto' && doc && ieTextoAtalho(ev)) { ev.preventDefault(); ev.stopPropagation(); return; }
        // números (opacidade/fluxo; dois dígitos rápidos)
        if (/^Digit\d$/.test(ev.code || '') && !ev.ctrlKey && !ev.altKey && !ev.metaKey && doc) {
            if (ieTeclaNumero(ev)) { ev.preventDefault(); return; }
        }
        // Enter sem nada em andamento: vai para o primeiro campo da barra de opções
        if (ev.key === 'Enter' && !ev.ctrlKey && !ev.altKey && !IE.transf && !IE.laco && !(IE.ferr === 'corte' && IE.corte) && IE.ferr !== 'texto') {
            const campo = ieEl('ie-opcoes')?.querySelector('input:not([type=checkbox]), select');
            if (campo) { ev.preventDefault(); campo.focus(); campo.select?.(); return; }
        }
        const nome = ieTeclaNome(ev);
        if (nome === 'Tab' || nome === 'Shift+Tab') ev.preventDefault();
        return orig(ev);
    };
    const origSolta = ieTeclaSolta;
    ieTeclaSolta = function (ev) {
        if (ev.key === 'Control' && IE.ctrlMover) { IE.ctrlMover = false; if (IE.ferrTemp === 'mover' && !IE.ponteiro) IE.ferrTemp = null; ieCursor(ev); ieDesenharSobre(); }
        if ((ev.code === 'Backquote' || ev.key === '`' || ev.key === '~') && IE.ferrTemp === 'borracha') { IE.ferrTemp = null; ieCursor(ev); }
        return origSolta(ev);
    };
    window.addEventListener('blur', () => { if (IE.ctrlMover) { IE.ctrlMover = false; IE.ferrTemp = null; } });
})();
// ferramenta temporária solta o ponteiro: volta para a escolhida (Ctrl já foi solto no meio do arrasto)
document.addEventListener('pointerup', () => { setTimeout(() => { if (IE.ferrTemp === 'mover' && !IE.ctrlMover && !IE.ponteiro) { IE.ferrTemp = null; ieCursor({}); } }, 0); }, true);

// formatação de texto (Format type / Select and edit text da referência da Adobe)
function ieTextoAtalho(ev) {
    const doc = IE.doc;
    if (!doc) return false;
    const ed = IE.edTexto;
    const alvo = ed ? ed.L : ieSelecionadas(doc).find(L => L.txt || L.texto);
    if (!alvo) return false;
    const t = alvo.txt || alvo._txtPsd || {};
    const c = ev.ctrlKey || ev.metaKey, s = ev.shiftKey, a = ev.altKey, code = ev.code;
    if (c && s && !a && code === 'KeyL') { ieTextoEstilo({ alin: 'left' }); return true; }
    if (c && s && !a && code === 'KeyC') { ieTextoEstilo({ alin: 'center' }); return true; }
    if (c && s && !a && code === 'KeyR') { ieTextoEstilo({ alin: 'right' }); return true; }
    if (c && s && !a && code === 'KeyQ') { ieTextoEstilo({ esp: 0 }); return true; }
    if (c && s && a && code === 'KeyA') { ieTextoEstilo({ ent: 0 }); return true; }
    if (c && s && (code === 'Period' || code === 'Comma')) {
        const d = (code === 'Period' ? 1 : -1) * (a ? 10 : 2);
        ieTextoEstilo({ tamEf: Math.max(1, (t.tam || 72) * ieTextoEscala(t) + d) });
        return true;
    }
    if (a && !s && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
        const base = t.ent > 0 ? t.ent : (t.tam || 72) * 1.2;
        ieTextoEstilo({ ent: Math.max(1, Math.round(base + (ev.key === 'ArrowDown' ? 1 : -1) * (c ? 10 : 2))) });
        return true;
    }
    if (a && !s && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
        ieTextoEstilo({ esp: Math.round((t.esp || 0) + (ev.key === 'ArrowRight' ? 1 : -1) * (c ? 100 : 20)) });
        return true;
    }
    return false;
}

// ─────────────────────────── desenho: máscara, grade e extras ───────────────────────────
(function () {
    const orig = ieDesenharVista;
    ieDesenharVista = function () {
        orig();
        const doc = IE.doc, c = ieEl('ie-canvas');
        if (!doc || !c || !doc.verMascara || !ieAtivoVisivel()) return;
        const L = ieAtiva(doc);
        if (!L || !L.m) { doc.verMascara = null; return; }
        if (!L._mascaraVista || L._mascaraVista.v !== L._v || L._mascaraVista.modo !== doc.verMascara || L._mascaraVista.c0 !== L.m.c) {
            const m = ieMascaraRegiao(L.m, ieRDoc(doc));
            const o = ieCanvas(doc.w, doc.h), x = ieCtx(o);
            if (doc.verMascara === 'so') {   // só a máscara, em tons de cinza
                x.fillStyle = '#000'; x.fillRect(0, 0, doc.w, doc.h); x.drawImage(m, 0, 0);
            } else {                          // rubi: vermelho 50% onde a máscara esconde
                x.fillStyle = 'rgba(255,0,0,.5)'; x.fillRect(0, 0, doc.w, doc.h);
                x.globalCompositeOperation = 'destination-out'; x.drawImage(m, 0, 0);
            }
            L._mascaraVista = { v: L._v, modo: doc.verMascara, c0: L.m.c, c: o };
        }
        const ctx = ieCtx(c), dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = doc.zoom < 1;
        ctx.drawImage(L._mascaraVista.c, doc.px, doc.py, doc.w * doc.zoom, doc.h * doc.zoom);
        ctx.restore();
    };
    const origSobre = ieDesenharSobre;
    ieDesenharSobre = function () {
        const doc = IE.doc;
        const esc = doc && doc._esconderSel;
        if (doc && IE.semExtras) doc._esconderSel = true;
        const verF = doc && doc.verFatias;
        if (doc && IE.semExtras) doc.verFatias = false;
        try { origSobre(); } finally { if (doc) { doc._esconderSel = esc; doc.verFatias = verF; } }
        const c = ieEl('ie-sobre');
        if (!doc || !c || !IE.grade || IE.semExtras || !ieAtivoVisivel()) return;
        // grade: linha a cada 100 px com 4 divisões (o padrão do Photoshop é 1 pol./4)
        const ctx = ieCtx(c), dpr = window.devicePixelRatio || 1, z = doc.zoom;
        let passo = 25;
        while (passo * z < 6) passo *= 4;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        ctx.rect(doc.px, doc.py, doc.w * z, doc.h * z);
        ctx.clip();
        for (const [forte, k] of [[false, passo], [true, passo * 4]]) {
            ctx.strokeStyle = forte ? 'rgba(120,160,255,.55)' : 'rgba(120,160,255,.22)';
            ctx.beginPath();
            for (let x = 0; x <= doc.w; x += k) { const s = Math.round(doc.px + x * z) + 0.5; ctx.moveTo(s, doc.py); ctx.lineTo(s, doc.py + doc.h * z); }
            for (let y = 0; y <= doc.h; y += k) { const s = Math.round(doc.py + y * z) + 0.5; ctx.moveTo(doc.px, s); ctx.lineTo(doc.px + doc.w * z, s); }
            ctx.stroke();
        }
        ctx.restore();
    };
})();

// ─────────────────────────── painel Camadas: cliques com modificadores ───────────────────────────
// Ctrl+clique na miniatura = carregar seleção (Shift soma, Alt subtrai, Shift+Alt cruza); Alt+clique na miniatura da
// máscara = ver só a máscara; Alt+clique na camada = ajustar a camada na tela; Ctrl+clique em Nova camada = abaixo;
// Alt+clique em Adicionar máscara = máscara que esconde tudo.
document.addEventListener('click', ev => {
    if (!ieAtivoVisivel()) return;
    const doc = IE.doc;
    if (!doc) return;
    const lista = ev.target.closest('#ie-cam-lista');
    if (lista && (ev.ctrlKey || ev.altKey)) {
        const linha = ev.target.closest('.ie-cam'), alvo = ev.target.closest('[data-alvo]');
        const L = linha && ieAchar(doc, +linha.dataset.id)?.L;
        if (!L || ev.target.closest('[data-olho]')) return;
        if (alvo && ev.ctrlKey) {
            ev.stopPropagation(); ev.preventDefault();
            const op = ev.shiftKey && ev.altKey ? 'cruzar' : ev.shiftKey ? 'somar' : ev.altKey ? 'subtrair' : 'nova';
            ieSelDaCamadaOp(L, alvo.dataset.alvo === 'm', op);
            return;
        }
        if (alvo && alvo.dataset.alvo === 'm' && ev.altKey && L.m) {
            ev.stopPropagation(); ev.preventDefault();
            ieAtivar(L.id, doc);
            doc.verMascara = doc.verMascara === 'so' ? null : 'so';
            ieDesenharVista();
            return;
        }
        if (ev.altKey && !ev.ctrlKey && !alvo) {
            ev.stopPropagation(); ev.preventDefault();
            const R = ieCaixaCamada(L);
            if (!R) return;
            const v = ieVistaTam(), z = ieClamp(Math.min((v.w - 80) / R.w, (v.h - 80) / R.h), 0.01, 32);
            doc.zoom = z; doc.px = Math.round(v.w / 2 - (R.x + R.w / 2) * z); doc.py = Math.round(v.h / 2 - (R.y + R.h / 2) * z);
            ieDesenharVista(); ieDesenharSobre(); ieStatusRender();
        }
        return;
    }
    const rod = ev.target.closest('#ie-cam-rodape button');
    if (rod && ev.ctrlKey && /novaCamada/.test(rod.getAttribute('onclick') || '')) {
        ev.stopPropagation(); ev.preventDefault();
        const ref = ieAtiva(doc);
        IE_CMDS.novaCamada(doc);
        const N = ieAtiva(doc), a = ieAchar(doc, N.id), b = ref && ieAchar(doc, ref.id);
        if (a && b && a.lista === b.lista) { a.lista.splice(a.i, 1); b.lista.splice(b.lista.indexOf(ref), 0, N); ieTudo(doc); }
        return;
    }
    if (rod && ev.altKey && /'mascara'/.test(rod.getAttribute('onclick') || '')) {
        ev.stopPropagation(); ev.preventDefault();
        ieCmd(doc.sel ? 'mascaraSelOcultar' : 'mascaraOcultar');
    }
}, true);

function ieSelDaCamadaOp(L, mascara, op) {
    const doc = IE.doc;
    const r = mascara && L.m ? { c: ieMascaraRegiao(L.m, ieRDoc(doc)), x: 0, y: 0 }
        : L.tipo === 'grupo' ? { c: ieAchatar(doc, [L]), x: 0, y: 0 } : (L.c ? ((ieRaster(L) || {}).forma || { c: L.c, x: L.x, y: L.y }) : null);
    if (!r) return;
    ieSelAplicar(doc, x => { x.drawImage(r.c, r.x, r.y); }, op);
    ieHist(ieT('Carregar seleção'));
}

// ─────────────────────────── menus ───────────────────────────
(function () {
    const menu = n => IE_MENUS.find(m => m[0] === n)[1];
    const depois = (lista, cmd, ...itens) => { const i = lista.findIndex(it => Array.isArray(it) && it[1] === cmd); lista.splice(i + 1, 0, ...itens); };
    const arq = menu('Arquivo');
    depois(arq, 'salvarComo', ['Reverter', 'reverter', 'F12']);
    depois(arq, 'fechar', ['Fechar tudo', 'fecharTodos', 'Alt+Ctrl+W'], ['Fechar os outros', 'fecharOutros', 'Alt+Ctrl+P']);
    const edt = menu('Editar');
    const transf = edt.find(it => Array.isArray(it) && it[0] === 'Transformar')[1];
    transf.unshift(['De novo', 'transfDeNovo', 'Shift+Ctrl+T'], '-');
    const img = menu('Imagem');
    const i = img.findIndex(it => Array.isArray(it) && it[0] === 'Ajustes');
    img.splice(i + 1, 0, ['Tom automático', 'autoTom', 'Shift+Ctrl+L'], ['Contraste automático', 'autoContraste', 'Alt+Shift+Ctrl+L'], ['Cor automática', 'autoCor', 'Shift+Ctrl+B']);
    const sel = menu('Selecionar');
    depois(sel, 'selNada', ['Selecionar novamente', 'selRefazer', 'Shift+Ctrl+D']);
    depois(sel, 'selInverter', ['Todas as camadas', 'camTodas', 'Alt+Ctrl+A']);
    menu('Filtro').unshift(['Último filtro', 'filtroUltimo', 'Ctrl+F']);
    const ex = menu('Exibir');
    ex.push('-', ['Extras', 'extras', 'Ctrl+H'], ['Grade', 'grade', "Ctrl+'"], ['Modo de tela', [['Padrão', 'tela0'], ['Tela cheia com menus', 'tela1'], ['Tela cheia', 'tela2']]],
        ['Máscara em rubi', 'mascaraRubi', '\\']);
    IE_MENUS.push(['Ajuda', [['Atalhos do teclado...', 'atalhos', 'Alt+Shift+Ctrl+K']]]);
    Object.assign(IE_CMDS, { tela0: () => ieTelaModo(0), tela1: () => ieTelaModo(1), tela2: () => ieTelaModo(2) });
})();

// ─────────────────────────── Ajuda > Atalhos do teclado ───────────────────────────
// [seção, teclas, o que faz, existe no editor?] — da referência oficial da Adobe (Windows)
const IE_REF_ATALHOS = [
    ['Mais usados', 'Ctrl+T', 'Transformação livre', 1], ['Mais usados', 'Ctrl+D', 'Desmarcar', 1], ['Mais usados', '[ / ]', 'Diminuir / aumentar o pincel', 1],
    ['Mais usados', 'Shift+[ / Shift+]', 'Dureza do pincel', 1], ['Mais usados', 'Ctrl+Z', 'Desfazer', 1], ['Mais usados', 'D / X', 'Cores padrão / trocar frente e fundo', 1],
    ['Mais usados', 'Ctrl+J / Shift+Ctrl+J', 'Camada via cópia / via recorte', 1], ['Mais usados', 'Alt+clique na camada', 'Ajustar a camada na tela', 1],
    ['Mais usados', 'Ctrl+clique (Mover)', 'Liga/desliga a seleção automática', 1], ['Mais usados', 'Alt+Ctrl+P', 'Fechar os outros documentos', 1],
    ['Mais usados', '` (segurar, com o pincel)', 'Pincel vira borracha enquanto segura', 1], ['Mais usados', 'Enter', 'Primeiro campo da barra de opções', 1],
    ['Teclas de função', 'F2 / F3 / F4', 'Recortar / copiar / colar', 1], ['Teclas de função', 'F7', 'Painel Camadas', 1], ['Teclas de função', 'F12', 'Reverter', 1],
    ['Teclas de função', 'Shift+F5', 'Preencher', 1], ['Teclas de função', 'Shift+F6', 'Suavizar seleção', 1], ['Teclas de função', 'Shift+F7', 'Inverter seleção', 1],
    ['Teclas de função', 'F5 / F6 / F8 / F9', 'Painéis Pincel, Cor, Informações, Ações', 0],
    ['Ferramentas', 'V', 'Mover', 1], ['Ferramentas', 'M (Shift+M)', 'Letreiro retangular / elíptico', 1], ['Ferramentas', 'L (Shift+L)', 'Laço / laço poligonal', 1],
    ['Ferramentas', 'W', 'Varinha mágica', 1], ['Ferramentas', 'C (Shift+C)', 'Corte / Fatia', 1], ['Ferramentas', 'I', 'Conta-gotas', 1],
    ['Ferramentas', 'S', 'Carimbo', 1], ['Ferramentas', 'B', 'Pincel', 1], ['Ferramentas', 'E', 'Borracha', 1], ['Ferramentas', 'G (Shift+G)', 'Degradê / balde', 1],
    ['Ferramentas', 'T', 'Texto', 1], ['Ferramentas', 'U (Shift+U)', 'Retângulo / elipse / linha', 1], ['Ferramentas', 'H / Espaço', 'Mão', 1], ['Ferramentas', 'Z', 'Zoom', 1],
    ['Ferramentas', 'Ctrl (segurar)', 'Mover temporário com qualquer ferramenta', 1],
    ['Ferramentas', 'J / Y / O / P / A / R / K / Q', 'Recuperação, Pincel de histórico, Subexposição, Caneta, Seleção de caminho, Girar vista, Quadro, Máscara rápida', 0],
    ['Ferramentas', ', . < >', 'Pincel anterior / próximo / primeiro / último', 0],
    ['Ver', 'Ctrl+Tab / Shift+Ctrl+Tab', 'Próximo / documento anterior', 1], ['Ver', 'F / Shift+F', 'Modos de tela', 1], ['Ver', 'Tab / Shift+Tab', 'Esconder painéis / só os da lateral', 1],
    ['Ver', 'Ctrl++ / Ctrl+- / Ctrl+0 / Ctrl+1', 'Aproximar / afastar / ajustar / 100%', 1], ['Ver', 'Duplo clique na Mão / no Zoom', 'Ajustar / 100%', 1],
    ['Ver', 'Page Up / Page Down (Ctrl: lados, Shift: 10 px)', 'Rolar a imagem', 1], ['Ver', 'Home / End', 'Canto de cima à esquerda / de baixo à direita', 1],
    ['Ver', '\\', 'Máscara em rubi', 1], ['Ver', 'Ctrl+H', 'Extras (seleção, fatias, alças)', 1], ["Ver", "Ctrl+'", 'Grade', 1], ['Ver', 'Ctrl+R / Ctrl+;', 'Réguas / guias', 0],
    ['Seleção', 'Shift / Alt / Shift+Alt + arrastar', 'Somar / subtrair / cruzar', 1], ['Seleção', 'Shift+arrastar / Alt+arrastar', 'Quadrado ou círculo / a partir do centro', 1],
    ['Seleção', 'Setas (Shift: 10 px)', 'Mover seleção ou camada', 1], ['Seleção', 'Alt+arrastar (Mover)', 'Mover uma cópia', 1], ['Seleção', 'Shift+Ctrl+D', 'Selecionar novamente', 1],
    ['Seleção', 'Ctrl+A / Shift+Ctrl+I', 'Tudo / inverter', 1], ['Seleção', 'Alt+Ctrl+R', 'Selecionar e máscara', 0],
    ['Pintura', 'Alt (pincel, balde, degradê, forma)', 'Conta-gotas temporário', 1], ['Pintura', '0–9 (dois números = valor exato)', 'Opacidade da ferramenta (ou da camada)', 1],
    ['Pintura', 'Shift+0–9', 'Fluxo', 1], ['Pintura', 'Shift+clique', 'Linha reta', 1], ['Pintura', 'Alt+Backspace / Ctrl+Backspace', 'Preencher com a cor de frente / fundo', 1],
    ['Pintura', 'Shift+ (Alt ou Ctrl)+Backspace', 'Preencher mantendo a transparência', 1], ['Pintura', 'Shift+Backspace', 'Diálogo Preencher', 1],
    ['Pintura', '/', 'Travar pixels transparentes', 1],
    ['Mesclagem', 'Shift++ / Shift+-', 'Próximo / anterior modo de mesclagem (da camada)', 1],
    ...Object.entries(IE_BM_LETRA).map(([l, bm]) => ['Mesclagem', 'Shift+Alt+' + l, (IE_BM_MAP[bm] || [])[1] || bm, 1]),
    ['Texto', 'Ctrl+Shift+L / C / R', 'Alinhar à esquerda / centro / direita', 1], ['Texto', 'Ctrl+Shift+< / > (Alt: 10)', 'Tamanho −2 / +2', 1],
    ['Texto', 'Alt+↑ / ↓ (Ctrl: 10)', 'Entrelinha', 1], ['Texto', 'Alt+← / → (Ctrl: 100)', 'Espaçamento entre letras (20/1000 eme)', 1],
    ['Texto', 'Ctrl+Shift+Q / Ctrl+Shift+Alt+A', 'Espaçamento 0 / entrelinha automática', 1], ['Texto', 'Ctrl+Enter / Esc', 'Confirmar o texto', 1],
    ['Texto', 'Ctrl+Shift+X / J / F', 'Escala 100%, justificar', 0],
    ['Camadas', 'Shift+Ctrl+N', 'Nova camada', 1], ['Camadas', 'Ctrl+G / Shift+Ctrl+G', 'Agrupar / desagrupar', 1], ['Camadas', 'Alt+Ctrl+G', 'Máscara de corte', 1],
    ['Camadas', 'Alt+Ctrl+A', 'Selecionar todas as camadas', 1], ['Camadas', 'Ctrl+E / Shift+Ctrl+E', 'Mesclar para baixo / visíveis', 1],
    ['Camadas', 'Alt+Shift+Ctrl+E', 'Carimbar visíveis numa camada nova', 1], ['Camadas', 'Alt+[ / ] (Shift: somar)', 'Camada de baixo / de cima', 1],
    ['Camadas', 'Alt+. / Alt+,', 'Camada do topo / da base', 1], ['Camadas', 'Ctrl+[ / ] (Shift: até o fim)', 'Recuar / avançar a camada', 1],
    ['Camadas', 'Ctrl+clique na miniatura (Shift/Alt)', 'Carregar seleção (somar/subtrair/cruzar)', 1], ['Camadas', 'Alt+clique no olho', 'Mostrar só esta', 1],
    ['Camadas', 'Shift+clique / Alt+clique na máscara', 'Desativar máscara / ver só a máscara', 1], ['Camadas', 'Ctrl+2 / Ctrl+\\', 'Editar a camada / a máscara', 1],
    ['Camadas', 'Duplo clique na camada / no nome', 'Estilo de camada / renomear', 1], ['Camadas', 'Ctrl+clique em Nova camada', 'Nova camada abaixo', 1],
    ['Camadas', 'Alt+clique em Adicionar máscara', 'Máscara que esconde', 1],
    ['Menus', 'Ctrl+N / Ctrl+O / Ctrl+S', 'Novo / abrir / salvar', 1], ['Menus', 'Shift+Ctrl+S (ou Alt+Ctrl+S)', 'Salvar como (.iknv ou .psd)', 1],
    ['Menus', 'Alt+Shift+Ctrl+W / Alt+Shift+Ctrl+S', 'Exportar como', 1], ['Menus', 'Ctrl+W / Alt+Ctrl+W', 'Fechar / fechar tudo', 1],
    ['Menus', 'Shift+Ctrl+Z / Alt+Ctrl+Z', 'Avançar / voltar no histórico', 1], ['Menus', 'Shift+Ctrl+T', 'Transformar de novo', 1],
    ['Menus', 'Shift+Ctrl+C / Shift+Ctrl+V', 'Copiar mesclado / colar no lugar', 1],
    ['Menus', 'Ctrl+L / M / U / B / I', 'Níveis, curvas, matiz/saturação, equilíbrio de cores, inverter', 1], ['Menus', 'Alt+Shift+Ctrl+B / Shift+Ctrl+U', 'Preto e branco / dessaturar', 1],
    ['Menus', 'Shift+Ctrl+L / Alt+Shift+Ctrl+L / Shift+Ctrl+B', 'Tom, contraste e cor automáticos', 1], ['Menus', 'Alt+Ctrl+I / Alt+Ctrl+C', 'Tamanho da imagem / da tela', 1],
    ['Menus', 'Ctrl+F', 'Último filtro', 1], ['Menus', 'Shift+Ctrl+A', 'Filtro Camera Raw', 1], ['Menus', 'Shift+Ctrl+X / Shift+Ctrl+R / Alt+Ctrl+V', 'Dissolver, correção de lente, ponto de fuga', 0],
    ['Menus', 'Ctrl+K / Ctrl+P / Ctrl+Y', 'Preferências, imprimir, prova de cores', 0],
];

function ieAtalhosDialogo() {
    const box = ieEl('ie-modal');
    const secoes = [...new Set(IE_REF_ATALHOS.map(a => a[0]))];
    const linhas = q => secoes.map(s => {
        const it = IE_REF_ATALHOS.filter(a => a[0] === s && (!q || (a[1] + ' ' + a[2]).toLowerCase().includes(q)));
        if (!it.length) return '';
        return `<div class="ie-at-sec">${ieT(s)}</div>` + it.map(([, k, o, ok]) =>
            `<div class="ie-at-lin ${ok ? '' : 'falta'}"><kbd>${ieEsc(k)}</kbd><span>${ieEsc(ieT(o))}${ok ? '' : ` <em>${ieT('(ainda não tem no editor)')}</em>`}</span></div>`).join('');
    }).join('') || `<div class="ie-vazio">${ieT('Nenhum atalho')}</div>`;
    box.innerHTML = `<div class="ie-dlg ie-at" style="width:640px"><h3>${ieT('Atalhos do teclado')}</h3>
        <div class="ie-at-busca"><input placeholder="${ieT('Buscar (ex.: camada, Ctrl+J, texto)')}"></div>
        <div class="ie-dlg-corpo ie-at-lista">${linhas('')}</div>
        <div class="ie-dlg-rod"><span class="ie-prop-nota">${ieT('Padrão do Photoshop no Windows (referência oficial da Adobe).')}</span><div class="ie-op-esp"></div><button class="ie-btn ie-btn-primario" data-r="1">OK</button></div></div>`;
    box.hidden = false;
    const inp = box.querySelector('input'), lista = box.querySelector('.ie-at-lista');
    inp.addEventListener('input', () => { lista.innerHTML = linhas(inp.value.trim().toLowerCase()); });
    const fim = () => { box.hidden = true; box.innerHTML = ''; document.removeEventListener('keydown', tecla, true); };
    const tecla = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fim(); } else if (ev.target === inp) ev.stopPropagation(); };
    document.addEventListener('keydown', tecla, true);
    box.querySelector('[data-r="1"]').onclick = fim;
    setTimeout(() => inp.focus(), 0);
}
