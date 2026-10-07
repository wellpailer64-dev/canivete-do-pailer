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
    'Alt+Ctrl+S': 'salvarComo', 'Alt+Shift+Ctrl+S': 'exportar', 'Alt+Ctrl+O': 'abrir', 'Alt+Shift+Ctrl+O': 'abrir', 'Shift+Ctrl+O': 'abrirCaminho',
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
    // resto da referência da Adobe: justificar, maiúsculas, versalete, sobrescrito/subscrito, sublinhado, tachado, escala 100%
    if (c && s && !a && code === 'KeyJ') { ieTextoEstilo({ alin: 'justify-left' }); return true; }
    if (c && s && !a && code === 'KeyF') { ieTextoEstilo({ alin: 'justify-all' }); return true; }
    if (c && s && !a && code === 'KeyK') { ieTextoEstilo({ caixaAlta: !t.caixaAlta }); return true; }
    if (c && s && !a && code === 'KeyH') { ieTextoEstilo({ versalete: !t.versalete }); return true; }
    if (c && s && code === 'Equal') { const v = a ? 'subscrito' : 'sobrescrito'; ieTextoEstilo({ pos: t.pos === v ? '' : v }); return true; }
    if (c && s && !a && code === 'KeyU') { ieTextoEstilo({ sublinhado: !t.sublinhado }); return true; }
    if (c && s && !a && code === 'Slash') { ieTextoEstilo({ tachado: !t.tachado }); return true; }
    if (c && s && code === 'KeyX') { ieTextoEstilo(a ? { escV: 100 } : { escH: 100 }); return true; }
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
    if (ev.altKey && IE._corteClique && Date.now() - IE._corteClique < 800) { IE._corteClique = 0; return; }   // Alt+clique na divisa = corte
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
    ['Menus', 'Alt+Shift+Ctrl+W / Alt+Shift+Ctrl+S', 'Exportar como', 1], ['Menus', 'Shift+Ctrl+,', 'Exportar a(s) camada(s) selecionada(s) em PNG', 1], ['Menus', 'Shift+Ctrl+.', 'Exportar tudo em PNG (uma por fatia ou prancheta)', 1], ['Menus', 'Ctrl+W / Alt+Ctrl+W', 'Fechar / fechar tudo', 1],
    ['Menus', 'Shift+Ctrl+Z / Alt+Ctrl+Z', 'Avançar / voltar no histórico', 1], ['Menus', 'Shift+Ctrl+T', 'Transformar de novo', 1],
    ['Menus', 'Shift+Ctrl+C / Shift+Ctrl+V', 'Copiar mesclado / colar no lugar', 1],
    ['Menus', 'Ctrl+L / M / U / B / I', 'Níveis, curvas, matiz/saturação, equilíbrio de cores, inverter', 1], ['Menus', 'Alt+Shift+Ctrl+B / Shift+Ctrl+U', 'Preto e branco / dessaturar', 1],
    ['Menus', 'Shift+Ctrl+L / Alt+Shift+Ctrl+L / Shift+Ctrl+B', 'Tom, contraste e cor automáticos', 1], ['Menus', 'Alt+Ctrl+I / Alt+Ctrl+C', 'Tamanho da imagem / da tela', 1],
    ['Menus', 'Ctrl+F', 'Último filtro', 1], ['Menus', 'Shift+Ctrl+A', 'Filtro Camera Raw', 1], ['Menus', 'Shift+Ctrl+X', 'Dissolver', 1], ['Menus', 'Shift+Ctrl+R', 'Correção de lente', 1], ['Menus', 'Alt+Ctrl+V', 'Ponto de fuga', 0],
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

// ─────────────────────────── Editar › Atenuar (Shift+Ctrl+F), como no Photoshop ───────────────────────────
// Logo depois de um filtro, ajuste ou pincelada (pincel, borracha, carimbo — na camada ou na máscara): mistura o
// "antes" e o "depois" com opacidade e modo de mesclagem. IE.atenuar = {doc, L, alvo, titulo, antes, depois, fundo,
// histI}; só vale enquanto o histórico estiver no passo daquela operação (qualquer outra coisa depois invalida).
const IE_ATENUAR_MODOS = [['source-over', 'Normal'], ['darken', 'Escurecer'], ['multiply', 'Multiplicação'], ['color-burn', 'Superexposição de cores'],
    ['lighten', 'Clarear'], ['screen', 'Tela'], ['color-dodge', 'Subexposição de cores'], ['overlay', 'Sobrepor'], ['soft-light', 'Luz suave'],
    ['hard-light', 'Luz direta'], ['difference', 'Diferença'], ['exclusion', 'Exclusão'], ['hue', 'Matiz'], ['saturation', 'Saturação'], ['color', 'Cor'],
    ['luminosity', 'Luminosidade']];
function ieAtenuavel(L, alvo, antes, titulo, doc = IE.doc) {
    const o = alvo === 'm' ? L && L.m : L;
    if (!doc || !o || !o.c) { IE.atenuar = null; return; }
    IE.atenuar = { doc, L, alvo, titulo, antes: antes && antes.c ? { c: antes.c, x: antes.x, y: antes.y } : null,
        depois: { c: ieClonar(o.c), x: o.x, y: o.y }, fundo: alvo === 'm' ? (L.m.fundo || 0) : 0, histI: doc.hist.i };
}
// plano {c, x, y} levado para o retângulo R (fora dele vale o "fundo" da máscara)
function ieAtenuarPlano(p, R, fundo) {
    const c = ieCanvas(R.w, R.h), x = ieCtx(c);
    if (fundo) { x.fillStyle = '#fff'; x.globalAlpha = fundo / 255; x.fillRect(0, 0, R.w, R.h); x.globalAlpha = 1; if (p) x.clearRect(p.x - R.x, p.y - R.y, p.c.width, p.c.height); }
    if (p) x.drawImage(p.c, p.x - R.x, p.y - R.y);
    return c;
}
function ieAtenuarCompor(a, k, modo) {
    const R = ieRInt(ieRUniao(ieRPlano(a.depois), a.antes ? ieRPlano(a.antes) : null));
    const A = ieAtenuarPlano(a.antes, R, a.fundo);
    let B = ieAtenuarPlano(a.depois, R, a.fundo);
    if (modo && modo !== 'source-over') {   // o "depois" no modo escolhido, sobre o "antes"
        const M = ieClonar(A), mx = ieCtx(M);
        mx.globalCompositeOperation = modo; mx.drawImage(B, 0, 0);
        B = M;
    }
    // (1-k)·antes + k·depois, somando em pré-multiplicado ('lighter'): mistura certa também no alfa (borracha atenuada)
    const c = ieCanvas(R.w, R.h), x = ieCtx(c);
    x.globalAlpha = 1 - k; x.drawImage(A, 0, 0);
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = k; x.drawImage(B, 0, 0);
    return { c, x: R.x, y: R.y };
}
async function ieAtenuar(doc, vals) {
    const a = IE.atenuar;
    if (!doc || !a || a.doc !== doc || doc.hist.i !== a.histI || ieAtiva(doc) !== a.L) {
        ieToast(ieT('Nada para atenuar: use logo depois de um filtro, ajuste ou pincelada')); return false;
    }
    const L = a.L, Rantes = ieRCamada(L);
    const por = r => {
        const o = a.alvo === 'm' ? L.m : L;
        o.c = r.c; o.x = r.x; o.y = r.y;
        if (a.alvo === 'm') L.sujoM = true; else L.sujoPx = true;
        ieInvalidar(L); ieCamadaMudou(L, Rantes);
    };
    const original = () => ({ c: ieClonar(a.depois.c), x: a.depois.x, y: a.depois.y });
    const v = vals || await ieDialogo({
        titulo: `${ieT('Atenuar')}: ${ieT(a.titulo)}`,
        campos: [{ id: 'op', rotulo: 'Opacidade (%)', min: 0, max: 100, valor: 100 }, { id: 'modo', rotulo: 'Modo', tipo: 'select', opcoes: IE_ATENUAR_MODOS, valor: 'source-over' }],
        previa: p => por(p ? ieAtenuarCompor(a, p.op / 100, p.modo) : original()),
    });
    if (!v) { por(original()); return false; }
    por(ieAtenuarCompor(a, ieClamp((v.op ?? 100) / 100, 0, 1), v.modo || 'source-over'));
    ieHist(ieT('Atenuar') + ' ' + ieT(a.titulo));
    IE.atenuar = null;
    return true;
}

// ─────────────────────────── Editar › Colar especial › Colar dentro / Colar fora ───────────────────────────
// Como o Photoshop: cola o que está na área de transferência numa camada nova, centrada na seleção, com a máscara da
// seleção (dentro) ou da seleção invertida (fora), com a corrente solta (mover a camada mexe só na imagem) e desmarca.
async function ieColarDentro(doc, fora = false) {
    if (!doc || !doc.sel) { ieToast(ieT('Faça uma seleção antes: ela vira a máscara do que for colado')); return false; }
    const B = { ...doc.sel.bbox }, antes = ieTodas(doc).length;
    await ieColar(true);
    const L = ieAtiva(doc);
    if (ieTodas(doc).length === antes || !L || !L.c) return false;
    const dx = Math.round(B.x + B.w / 2 - (L.x + L.c.width / 2)), dy = Math.round(B.y + B.h / 2 - (L.y + L.c.height / 2));
    if (dx || dy) ieMoverCamada(L, dx, dy);
    await ieMascaraNova(doc, !fora, true);
    if (L.m) L.m.solta = true;
    doc.mascaraAlvo = false;
    ieSelNada();
    ieInvalidar(L); ieTudo(doc);
    ieHist(ieT(fora ? 'Colar fora' : 'Colar dentro'));
    ieUiCamadas?.();
    return true;
}

// ─────────────────────────── Editar › Localizar e substituir texto ───────────────────────────
// Troca em todas as camadas de texto (ou só na ativa), como o Photoshop: texto do editor guarda os trechos de estilo;
// texto vindo do PSD vira texto editado (continua camada de texto no Photoshop, via textoNovo). Texto do PSD com
// estilos misturados ou sem a fonte instalada não é tocado (viraria um estilo só) — a lista volta no aviso.
function ieLsRegex(busca, { maiusc = false, palavra = false } = {}) {
    const esc = String(busca).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(palavra ? `(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])` : esc, 'gu' + (maiusc ? '' : 'i'));
}
async function ieSubstituirTexto(doc, busca, troca, { todas = true, maiusc = false, palavra = false } = {}) {
    if (!doc || !busca) return { trocas: 0, camadas: 0, puladas: [] };
    const re = ieLsRegex(busca, { maiusc, palavra });
    const ativa = ieAtiva(doc);
    const alvo = ieTodas(doc).filter(L => L.tipo === 'texto' && (L.txt || L.texto) && (todas || L === ativa));
    let trocas = 0, camadas = 0;
    const puladas = [];
    for (const L of alvo) {
        let t = L.txt, convertido = false;
        if (!t) {   // texto do PSD ainda não editado
            const s0 = String(L.texto?.texto ?? '');
            re.lastIndex = 0;
            if (!re.test(s0)) continue;
            t = await ieTextoDoPsd(L, true);
            if (!t || t.misto || t.semFonte) { puladas.push(L.nome); continue; }
            L._rasterAntes = { c: L.c, x: L.x, y: L.y };
            L.txt = t; convertido = true;
        }
        const antes = String(t.s ?? '');
        re.lastIndex = 0;
        const achados = [...antes.matchAll(re)];
        if (!achados.length) { if (convertido) delete L.txt; continue; }
        let cur = antes, desloc = 0;
        for (const m of achados) {   // uma troca por vez: os trechos de estilo acompanham cada uma
            const i = m.index + desloc, prox = cur.slice(0, i) + troca + cur.slice(i + m[0].length);
            ieTxTrechosEditar(t, cur, prox);
            cur = prox; desloc += troca.length - m[0].length;
        }
        t.s = cur; trocas += achados.length; camadas++;
        if (L.ref != null && L.texto) { L.textoNovo = t.s; L.textoEstilo = ieEstiloMudado(t); delete L.c0; }
        if (L._nomeAuto) L.nome = String(t.s).split(IE_NL)[0].slice(0, 40) || ieT('Texto');
        const R0 = ieRCamada(L);
        ieTextoRender(L);
        ieAgendar(ieRUniao(R0, ieRCamada(L)), doc);
    }
    if (trocas) { ieHist(ieT('Localizar e substituir texto'), doc); ieUiCamadas?.(); }
    return { trocas, camadas, puladas };
}
async function ieLocalizarTextoDialogo(doc) {
    if (!doc) return;
    if (!ieTodas(doc).some(L => L.tipo === 'texto')) { ieToast(ieT('Nenhuma camada de texto no documento')); return; }
    const v = await ieDialogo({
        titulo: 'Localizar e substituir texto', ok: 'Alterar tudo',
        campos: [{ id: 'busca', rotulo: 'Localizar', tipo: 'texto', valor: IE._lsBusca || '' }, { id: 'troca', rotulo: 'Alterar para', tipo: 'texto', valor: IE._lsTroca || '' },
            { id: 'todas', rotulo: 'Pesquisar todas as camadas', tipo: 'check', valor: true }, { id: 'maiusc', rotulo: 'Diferenciar maiúsculas de minúsculas', tipo: 'check', valor: false },
            { id: 'palavra', rotulo: 'Somente palavra inteira', tipo: 'check', valor: false }],
    });
    if (!v || !v.busca) return;
    IE._lsBusca = v.busca; IE._lsTroca = v.troca;
    const r = await ieSubstituirTexto(doc, v.busca, v.troca || '', v);
    ieToast(r.trocas ? `${r.trocas} ${ieT(r.trocas > 1 ? 'ocorrências alteradas em' : 'ocorrência alterada em')} ${r.camadas} ${ieT(r.camadas > 1 ? 'camadas' : 'camada')}`
        : ieT('Nenhuma ocorrência encontrada'));
    if (r.puladas.length) setTimeout(() => ieToast(`${ieT('Não alterado (estilos misturados ou fonte ausente, edite no Photoshop)')}: ${r.puladas.slice(0, 4).join(', ')}`), 2200);
}

Object.assign(IE_CMDS, {
    atenuar: doc => ieAtenuar(doc),
    colarDentro: doc => ieColarDentro(doc, false),
    colarFora: doc => ieColarDentro(doc, true),
    localizarTexto: doc => ieLocalizarTextoDialogo(doc),
});
Object.assign(IE_ATALHOS, { 'Shift+Ctrl+F': 'atenuar', 'Alt+Shift+Ctrl+V': 'colarDentro' });
(function () {
    const edt = IE_MENUS.find(m => m[0] === 'Editar')[1];
    const depois = (cmd, ...itens) => { const i = edt.findIndex(it => Array.isArray(it) && it[1] === cmd); edt.splice(i + 1, 0, ...itens); };
    depois('refazer', '-', ['Atenuar...', 'atenuar', 'Shift+Ctrl+F']);
    depois('colarLugar', ['Colar especial', [['Colar dentro', 'colarDentro', 'Alt+Shift+Ctrl+V'], ['Colar fora', 'colarFora']]]);
    depois('tracar', '-', ['Localizar e substituir texto...', 'localizarTexto']);
})();

// ─────────────────────────── Editar › Preenchimento sensível ao conteúdo (LaMa, Functions/preencher_conteudo.py) ───────────────────────────
// Como o Photoshop: a seleção é preenchida pelo que está em volta. Amostra = camada atual ou todas as camadas; saída =
// camada nova (padrão, não destrutiva) ou a própria camada (aí vale o Atenuar). O Python expande a área alguns pixels
// (sem isso a borda do objeto vaza) e devolve o trecho preenchido + a área usada. Primeira vez: baixa o modelo (~200 MB).
window.ieConteudoProgresso = d => { if (IE._conteudoAtivo) ieCarregando(ieT(d && d.msg || 'Preenchendo pelo conteúdo...'), d && d.p); };
function ieCinzaParaAlfa(img) {   // PNG em tons de cinza → canvas branco com alfa = cinza
    const c = ieCanvas(img.width, img.height), x = ieCtx(c);
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { p[i + 3] = p[i]; p[i] = p[i + 1] = p[i + 2] = 255; }
    x.putImageData(d, 0, 0);
    return c;
}
async function iePreencherConteudo(doc, { amostra, saida = 'nova', expandir = 0 } = {}) {
    if (!doc || !doc.sel) { ieToast(ieT('Selecione o que quer tirar: a seleção é preenchida pelo que está em volta')); return false; }
    const api = ieApi(), L = ieAtiva(doc);
    if (!api) return false;
    amostra = amostra || (L && L.c && L.tipo === 'pixel' ? 'atual' : 'todas');
    if (saida === 'atual' && !(await iePodePintar(L, 'preencher pelo conteúdo'))) return false;
    if (amostra === 'atual' && (!L || !L.c)) { ieToast(ieT('A camada está vazia: use "Todas as camadas"')); return false; }
    const b = doc.sel.bbox, mg = Math.max(64, Math.round(Math.max(b.w, b.h) * 0.8));
    const R = ieRInter(ieRInt({ x: b.x - mg, y: b.y - mg, w: b.w + 2 * mg, h: b.h + 2 * mg }), ieRDoc(doc));
    if (!R) return false;
    const reg = ieCanvas(R.w, R.h), rx = ieCtx(reg);
    if (amostra === 'todas') { ieCompor(doc, ieRDoc(doc)); rx.drawImage(doc.comp, -R.x, -R.y); }
    else rx.drawImage(L.c, L.x - R.x, L.y - R.y);
    const m = ieCanvas(R.w, R.h); ieCtx(m).drawImage(doc.sel.c, -R.x, -R.y);
    IE._conteudoAtivo = true;
    ieCarregando(ieT('Preenchendo pelo conteúdo...'), 5);
    let r;
    try { r = await api.ie_preencher_ia(reg.toDataURL('image/png'), m.toDataURL('image/png'), expandir || null); }
    finally { IE._conteudoAtivo = false; ieCarregando(false); }
    if (!r || !r.success) { ieToast(`${ieT('Não preencheu')}: ${(r && r.error) || ''}`); return false; }
    const carregar = async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); return im; };
    const im = await carregar(r.png), area = ieCinzaParaAlfa(await carregar(r.alfa));
    // só a área preenchida (expandida + borda suave)
    const so = ieCanvas(R.w, R.h), sx = ieCtx(so);
    sx.drawImage(im, 0, 0); sx.globalCompositeOperation = 'destination-in'; sx.drawImage(area, 0, 0);
    const nome = 'Preenchimento sensível ao conteúdo';
    if (saida === 'nova') {
        const N = ieNovaCamada(doc, { nome: ieNomeLivre(doc, ieT('Preenchimento de conteúdo')), c: so, x: R.x, y: R.y, sujoPx: true });
        ieInserirAcima(doc, N, L || null);
        ieAtivar(N.id, doc);
        ieCamadaMudou(N);
        ieHist(ieT(nome));
    } else {
        const Rantes = ieRCamada(L), antes = L.c ? { c: ieClonar(L.c), x: L.x, y: L.y } : null;
        ieGravavel(L); ieCrescer(L, R, 0);
        const x = ieCtx(L.c);
        x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
        // camada × (1 − área) + preenchido × área, em pré-multiplicado
        x.globalCompositeOperation = 'destination-out'; x.drawImage(area, R.x - L.x, R.y - L.y);
        x.globalCompositeOperation = 'lighter'; x.drawImage(so, R.x - L.x, R.y - L.y);
        x.restore();
        L.sujoPx = true;
        ieInvalidar(L); ieCamadaMudou(L, ieRUniao(Rantes, R));
        ieHist(ieT(nome));
        if (typeof ieAtenuavel === 'function') ieAtenuavel(L, 'c', antes, nome, doc);
    }
    ieUiCamadas?.();
    return true;
}
async function iePreencherConteudoDialogo(doc) {
    if (!doc || !doc.sel) { ieToast(ieT('Selecione o que quer tirar: a seleção é preenchida pelo que está em volta')); return; }
    const L = ieAtiva(doc);
    const v = await ieDialogo({
        titulo: 'Preenchimento sensível ao conteúdo', ok: 'Preencher',
        campos: [{ id: 'amostra', rotulo: 'Amostra', tipo: 'select', opcoes: [['atual', 'Camada atual'], ['todas', 'Todas as camadas']], valor: L && L.c && L.tipo === 'pixel' ? 'atual' : 'todas' },
            { id: 'saida', rotulo: 'Saída', tipo: 'select', opcoes: [['nova', 'Nova camada'], ['atual', 'Camada atual']], valor: 'nova' },
            { id: 'expandir', rotulo: 'Expandir a seleção (px, 0 = automático)', tipo: 'numero', min: 0, max: 200, valor: 0 },
            { id: 'n', tipo: 'nota', rotulo: 'IA no próprio computador (LaMa). Na primeira vez baixa o modelo (~200 MB).' }],
    });
    if (v) await iePreencherConteudo(doc, v);
}
Object.assign(IE_CMDS, { preencherConteudo: doc => iePreencherConteudoDialogo(doc) });
(function () {
    const edt = IE_MENUS.find(m => m[0] === 'Editar')[1];
    const i = edt.findIndex(it => Array.isArray(it) && it[1] === 'preencher');
    edt.splice(i + 1, 0, ['Preenchimento sensível ao conteúdo...', 'preencherConteudo']);
})();

// ─────────────────────────── Editar › Substituição de céu (Functions/ceu.py, SkySeg) ───────────────────────────
// Como o Photoshop: acha o céu da foto (composição visível) e cria o grupo "Substituição de céu" acima da camada ativa:
// "Iluminação do primeiro plano" (cor do céu novo em modo Cor, máscara = o que não é céu) e "Céu" (objeto inteligente,
// cobre o céu até a linha do horizonte, máscara = céu). Tudo editável depois (mover/escalar o céu sem perda, pintar a
// máscara). Com uma seleção ativa, ela vira a área do céu (quando o modelo não acha: céu cercado de parede, por ex.).
// Céu de um arquivo ou gerado pela IA local (ieGeradorPronto/ie_gerar).
const IE_CEUS_IA = [['azul', 'Azul com nuvens', 'wide landscape photo of a clear blue sky with soft white cumulus clouds, bright daylight, no ground, no buildings, high detail'],
    ['por', 'Pôr do sol', 'wide landscape photo of a golden sunset sky, warm orange and pink clouds near the horizon, no ground, no buildings, high detail'],
    ['dramatico', 'Nuvens dramáticas', 'wide landscape photo of a dramatic sky with dark storm clouds and sun rays breaking through, no ground, high detail'],
    ['rosado', 'Fim de tarde rosado', 'wide landscape photo of a soft pastel pink and lilac evening sky with thin clouds, no ground, high detail'],
    ['noite', 'Noite estrelada', 'wide landscape photo of a clear night sky full of stars and the milky way, deep blue, no ground, high detail']];
async function ieCanvasDeArquivo(path) {
    const api = ieApi(), r = await api.ie_abrir(path);
    if (!r || !r.success) throw new Error((r && r.error) || 'não abriu ' + path);
    try {
        const url = r.achatado || (r.camadas && r.camadas[0] && r.camadas[0].url);
        return url ? await ieImagemDeUrl(url) : null;
    } finally { api.ie_fechar(r.doc); }
}
async function ieCeuGerado(chave) {
    const api = ieApi(), p = IE_CEUS_IA.find(c => c[0] === chave);
    if (!p || !(await ieGeradorPronto('zimage'))) return null;
    ieCarregando(ieT('Gerando o céu com IA...'), 1);
    let r;
    try { r = await api.ie_gerar({ prompt: p[2], largura: 1344, altura: 768, semente: -1, refs: [] }); } finally { ieGerLimparBarra?.(); ieCarregando(false); }
    if (!r || !r.success) { ieToast(`${ieT('Não gerou')}: ${(r && r.error) || ''}`); return null; }
    return ieCanvasDeArquivo(r.path);
}
async function ieSubstituirCeu(doc, { ceu = 'arquivo', caminho = null, escala = 100, deslocar = 0, esmaecer = 4, luz = 40, inverter = false } = {}) {
    const api = ieApi();
    if (!doc || !api) return false;
    // 1. a área do céu: seleção ativa ou o modelo
    let area = null, B = null;
    if (doc.sel) {
        area = ieCanvas(doc.w, doc.h);
        const x = ieCtx(area);
        if (esmaecer > 0) x.filter = `blur(${esmaecer / 2}px)`;
        x.drawImage(doc.sel.c, 0, 0);
        B = { ...doc.sel.bbox };
    } else {
        ieCompor(doc, ieRDoc(doc));
        IE._conteudoAtivo = true;
        ieCarregando(ieT('Procurando o céu...'), 10);
        let r;
        try { r = await api.ie_ceu_mascara(doc.comp.toDataURL('image/png'), deslocar, esmaecer); }
        finally { IE._conteudoAtivo = false; ieCarregando(false); }
        if (!r || !r.success) { ieToast(ieT((r && r.error) || 'Não encontrei o céu')); return false; }
        const im = new Image(); im.src = 'data:image/png;base64,' + r.png; await im.decode();
        area = ieCinzaParaAlfa(im);
        B = { x: r.caixa[0], y: r.caixa[1], w: r.caixa[2], h: r.caixa[3] };
    }
    // 2. o céu novo
    let ceuC = null;
    if (ceu === 'arquivo') {
        let p = caminho;
        if (!p) { const d = await api.ie_dialogo_abrir(false); if (!d || !d.success || !d.paths || !d.paths.length) return false; p = d.paths[0]; }
        ceuC = await ieCanvasDeArquivo(p);
    } else ceuC = await ieCeuGerado(ceu);
    if (!ceuC) return false;
    // 3. encaixe: cobre a largura do documento e o céu até o fim da área (o horizonte do céu novo na base dela)
    const fundoCeu = B.y + B.h, sw = ceuC.width, sh = ceuC.height;
    const k = Math.max(doc.w / sw, fundoCeu / sh) * Math.max(0.1, escala / 100);
    const x0 = (doc.w - sw * k) / 2, y0 = Math.min(0, fundoCeu - sh * k);
    const tf = inverter ? [-k, 0, 0, k, x0 + sw * k, y0] : [k, 0, 0, k, x0, y0];
    const pl = ieTransformarPlano({ c: ceuC, x: 0, y: 0 }, tf);
    const Lceu = ieNovaCamada(doc, { tipo: 'inteligente', nome: ieT('Céu'), c: pl.c, x: pl.x, y: pl.y, c0: { c: ceuC, x: 0, y: 0 }, tf, tfBase: [...IE_ID], sujoPx: true });
    Lceu.m = { c: area, x: 0, y: 0, fundo: 0 };
    // 4. a luz do céu novo no primeiro plano: cor da base do céu, modo Cor, máscara = o que não é céu
    let cor = '#808080';
    try { const r = await api.ie_ceu_cor(ceuC.toDataURL('image/png')); if (r && r.success) cor = r.cor; } catch (e) { /* fica cinza */ }
    const inv = ieCanvas(doc.w, doc.h), ix = ieCtx(inv);
    ix.fillStyle = '#fff'; ix.fillRect(0, 0, doc.w, doc.h); ix.globalCompositeOperation = 'destination-out'; ix.drawImage(area, 0, 0);
    const Lluz = ieNovaCamada(doc, { tipo: 'preenchimento', nome: ieT('Iluminação do primeiro plano'), pre: { tipo: 'cor', cor }, sujoPx: true });
    iePreRender(Lluz, doc);
    Lluz.m = { c: inv, x: 0, y: 0, fundo: 0 };
    Lluz.bm = 'COLOR'; Lluz.op = ieClamp(luz / 100, 0, 1) * 0.5;
    // 5. o grupo, acima da camada ativa
    const G = ieNovaCamada(doc, { tipo: 'grupo', nome: ieT('Substituição de céu'), filhos: [Lluz, Lceu], aberto: true });
    const a = ieAtiva(doc), ref = a ? ieAchar(doc, a.id) : null;
    if (ref) ref.lista.splice(ref.i + 1, 0, G); else doc.camadas.push(G);
    doc.ativa = Lceu.id; doc.selIds = [Lceu.id];
    if (doc.sel) ieSelNada();
    [Lceu, Lluz, G].forEach(ieInvalidar);
    ieTudo(doc);
    ieHist(ieT('Substituição de céu'));
    ieUiCamadas?.();
    return true;
}
async function ieSubstituirCeuDialogo(doc) {
    if (!doc) return;
    const v = await ieDialogo({
        titulo: 'Substituição de céu', ok: 'OK',
        campos: [{ id: 'ceu', rotulo: 'Céu', tipo: 'select', opcoes: [['arquivo', 'Foto do computador...'], ...IE_CEUS_IA.map(c => [c[0], 'IA: ' + c[1]])], valor: 'arquivo' },
            { id: 'deslocar', rotulo: 'Deslocar borda (px)', min: -60, max: 60, valor: 0 },
            { id: 'esmaecer', rotulo: 'Esmaecer borda (px)', min: 0, max: 60, valor: 4 },
            { id: 'escala', rotulo: 'Escala do céu (%)', min: 50, max: 300, valor: 100 },
            { id: 'luz', rotulo: 'Iluminação do primeiro plano (%)', min: 0, max: 100, valor: 40 },
            { id: 'inverter', rotulo: 'Inverter o céu', tipo: 'check', valor: false },
            { id: 'n', tipo: 'nota', rotulo: doc.sel ? 'A seleção ativa vira a área do céu.' : 'O céu é achado por IA no próprio computador (na primeira vez baixa o modelo, ~170 MB). Se não achar, selecione o céu e use de novo.' }],
    });
    if (v) await ieSubstituirCeu(doc, v);
}
Object.assign(IE_CMDS, { substituirCeu: doc => ieSubstituirCeuDialogo(doc) });
(function () {
    const edt = IE_MENUS.find(m => m[0] === 'Editar')[1];
    const i = edt.findIndex(it => Array.isArray(it) && it[0] === 'Transformar');
    edt.splice(i + 1, 0, '-', ['Substituição de céu...', 'substituirCeu']);
})();

// ─────────────────────────── Preenchimento generativo e Expansão generativa (FLUX.2 klein local) ───────────────────────────
// Como o Photoshop (Firefly, inpainting/outpainting): gera SÓ dentro de uma área, guiado pelo entorno (imagem inicial +
// máscara no sd-server, força 1) e pela própria foto como referência (klein). Sem texto, o preenchimento remove pelo
// conteúdo (LaMa) — o klein com a foto de referência redesenhava o objeto que era para sair (testado 2026-10-07).
// Resultado numa camada nova com L.generativo = {prompt, R, area, variacoes: [{c, semente}], atual}: "Gerar outra" e
// ◀ ▶ no painel Propriedades (as variações do Photoshop). Geração em ~1 MP (múltiplos de 16) e ampliada para a área.
const IE_GEN_COMPL = ', seamless, matching the lighting, perspective, colors and style of the photo, photorealistic';
const IE_GEN_EXPANDIR = 'continue the scene naturally beyond the borders, same place, same lighting, wide photo';
function ieGenTamanho(w, h, mp = 0.85e6) {   // ~0,85 MP: com a referência junto, 1 MP no story (768×1360) estourava 8 GB
    const k = Math.sqrt(mp / (w * h));
    return [ieClamp(Math.round(w * k / 16) * 16, 256, 2048), ieClamp(Math.round(h * k / 16) * 16, 256, 2048)];
}
// desfoca a área de R repetindo a borda do quadro (o blur comum puxa a borda para transparente e deixava frestas no canto)
function ieGenBorrar(area, R, raio, w = R.w, h = R.h) {
    const P = Math.ceil(raio * 3) + 2, sx = w / R.w, sy = h / R.h;
    const pad = ieCanvas(w + 2 * P, h + 2 * P), px = ieCtx(pad);
    const d = (x, y, ww, hh, X, Y, WW, HH) => px.drawImage(area, R.x + x, R.y + y, ww, hh, X, Y, WW, HH);
    d(0, 0, R.w, R.h, P, P, w, h);
    d(0, 0, R.w, 1, P, 0, w, P); d(0, R.h - 1, R.w, 1, P, P + h, w, P);
    d(0, 0, 1, R.h, 0, P, P, h); d(R.w - 1, 0, 1, R.h, P + w, P, P, h);
    d(0, 0, 1, 1, 0, 0, P, P); d(R.w - 1, 0, 1, 1, P + w, 0, P, P); d(0, R.h - 1, 1, 1, 0, P + h, P, P); d(R.w - 1, R.h - 1, 1, 1, P + w, P + h, P, P);
    const c = ieCanvas(w, h), cx = ieCtx(c);
    cx.filter = `blur(${raio}px)`; cx.drawImage(pad, -P, -P);
    return c;
}
// gera dentro de `area` (canvas do tamanho do documento, alfa = onde gerar) olhando o retângulo R da composição visível
// refR: o pedaço da composição que serve de referência (na expansão, só a foto antiga: com as faixas lisas da tela nova
// na referência o klein copiava as faixas)
// alfa: recorte final (canvas do documento) quando difere da máscara — a expansão usa um degradê na costura
async function ieGerarArea(doc, R, area, prompt, semente = -1, refR = R, alfa = null) {
    const api = ieApi();
    if (!(await ieGeradorPronto('klein'))) return null;
    ieCompor(doc, ieRDoc(doc));
    const [gw, gh] = ieGenTamanho(R.w, R.h);
    // contexto: a composição de R; transparente (tela nova da expansão) vira a cor média, para a referência não ter buraco
    const ctx = ieCanvas(R.w, R.h), cx = ieCtx(ctx);
    cx.drawImage(doc.comp, -R.x, -R.y);
    const pequeno = ieCanvas(1, 1), px = ieCtx(pequeno); px.drawImage(ctx, 0, 0, 1, 1);
    const m1 = px.getImageData(0, 0, 1, 1).data, a1 = m1[3] / 255 || 1;
    const init = ieCanvas(gw, gh), ix = ieCtx(init);
    ix.fillStyle = `rgb(${Math.round(m1[0] / a1)},${Math.round(m1[1] / a1)},${Math.round(m1[2] / a1)})`; ix.fillRect(0, 0, gw, gh);
    ix.imageSmoothingQuality = 'high'; ix.drawImage(ctx, 0, 0, gw, gh);
    // máscara (branco = gerar), um pouco folgada para costurar
    const msk = ieCanvas(gw, gh), mx = ieCtx(msk);
    mx.fillStyle = '#000'; mx.fillRect(0, 0, gw, gh);
    const mb = ieGenBorrar(area, R, 4, gw, gh);
    for (let i = 0; i < 3; i++) mx.drawImage(mb, 0, 0);
    const initPng = init.toDataURL('image/png');
    // referência pequena (~0,25 MP): só passa estilo/cores; do tamanho da geração ela dobrava a memória e falhava
    const kr = Math.min(1, Math.sqrt(0.25e6 / (refR.w * refR.h))), ref = ieCanvas(Math.max(64, Math.round(refR.w * kr / 16) * 16), Math.max(64, Math.round(refR.h * kr / 16) * 16));
    ieCtx(ref).drawImage(doc.comp, refR.x, refR.y, refR.w, refR.h, 0, 0, ref.width, ref.height);
    const r = await (async () => { try { return await api.ie_gerar({ prompt, largura: gw, altura: gh, semente, refs: [ref.toDataURL('image/png')], init: initPng, mascara: msk.toDataURL('image/png'), motor: 'klein' }); } finally { ieGerLimparBarra?.(); } })();
    if (!r || !r.success) {
        if (r && /cancel/i.test(r.error || '')) ieToast(ieT('Geração cancelada'));
        else ieToast(`${ieT('Não gerou')}: ${(r && r.error) || ''}`);
        return null;
    }
    const out = await ieCanvasDeArquivo(r.path);
    // de volta ao tamanho de R, só dentro da área (borda suave)
    const c = ieCanvas(R.w, R.h), x = ieCtx(c);
    x.imageSmoothingQuality = 'high'; x.drawImage(out, 0, 0, R.w, R.h);
    const a = alfa ? (() => { const c2 = ieCanvas(R.w, R.h); ieCtx(c2).drawImage(alfa, -R.x, -R.y); return c2; })() : ieGenBorrar(area, R, 3);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(a, 0, 0);
    return { c, semente: r.semente };
}
function ieGenCamada(doc, g, info, nome) {
    const L = ieNovaCamada(doc, { nome: ieNomeLivre(doc, ieT(nome)), c: g.c, x: info.R.x, y: info.R.y, sujoPx: true });
    L.generativo = { ...info, variacoes: [{ c: g.c, semente: g.semente }], atual: 0 };
    const a = ieAtiva(doc);
    ieInserirAcima(doc, L, a || null);
    ieAtivar(L.id, doc);
    ieCamadaMudou(L);
    return L;
}
async function iePreenchimentoGenerativo(doc, prompt = '', { semente = -1 } = {}) {
    if (!doc || !doc.sel) { ieToast(ieT('Selecione onde gerar: a seleção é preenchida com o que você escrever')); return false; }
    prompt = String(prompt || '').trim();
    if (!prompt) return iePreencherConteudo(doc, { amostra: 'todas', saida: 'nova' });   // sem texto: tira o que está lá
    const b = doc.sel.bbox, mg = Math.max(64, Math.round(Math.max(b.w, b.h) * 0.6));
    const R = ieRInter(ieRInt({ x: b.x - mg, y: b.y - mg, w: b.w + 2 * mg, h: b.h + 2 * mg }), ieRDoc(doc));
    if (!R) return false;
    const area = ieClonar(doc.sel.c);
    const g = await ieGerarArea(doc, R, area, prompt + IE_GEN_COMPL, semente);
    if (!g) return false;
    ieGenCamada(doc, g, { prompt, R, area, texto: prompt + IE_GEN_COMPL }, 'Generativo');
    ieHist(ieT('Preenchimento generativo'));
    ieUiCamadas?.();
    return true;
}
// formato: 'story' | 'feed' | 'quadrado' | 'paisagem' | 'margem' (margem %, em volta) | largura/altura (px)
async function ieExpansaoGenerativa(doc, { formato = 'story', largura, altura, margem = 20, ancora = 'c', prompt = '', semente = -1 } = {}) {
    if (!doc) return false;
    const W0 = doc.w, H0 = doc.h, prop = { story: 9 / 16, feed: 4 / 5, quadrado: 1, paisagem: 16 / 9 }[formato];
    let W = W0, H = H0;
    if (prop) { if (W0 / H0 > prop) H = Math.round(W0 / prop); else W = Math.round(H0 * prop); }
    else if (formato === 'margem') { W = Math.round(W0 * (1 + 2 * margem / 100)); H = Math.round(H0 * (1 + 2 * margem / 100)); }
    else { W = Math.max(W0, Math.round(largura || W0)); H = Math.max(H0, Math.round(altura || H0)); }
    if (W === W0 && H === H0) { ieToast(ieT('O documento já tem esse formato: nada para expandir')); return false; }
    if (!(await ieGeradorPronto('klein'))) return false;
    const fx = ancora.includes('l') ? 0 : ancora.includes('r') ? 1 : 0.5, fy = ancora.includes('t') ? 0 : ancora.includes('b') ? 1 : 0.5;
    const ox = Math.round((W - W0) * fx), oy = Math.round((H - H0) * fy);
    ieRedimTela(doc, -ox, -oy, W, H, false);
    // área nova = fora do retângulo antigo, entrando uma faixa curta (~2% do lado menor, 16–40 px) nos lados que cresceram;
    // o recorte final passa da foto à geração num degradê nela. Faixa larga (6%) deixava manga/corpo meio transparente
    // (a IA redesenha a faixa diferente da foto e o degradê mostra as duas)
    const s = Math.round(ieClamp(Math.min(W0, H0) * 0.02, 16, 40));
    const area = ieCanvas(W, H), ax = ieCtx(area);
    ax.fillStyle = '#fff'; ax.fillRect(0, 0, W, H);
    const l = ox > 0 ? s : 0, t = oy > 0 ? s : 0, r = W - W0 - ox > 0 ? s : 0, bb = H - H0 - oy > 0 ? s : 0;
    ax.clearRect(ox + l, oy + t, W0 - l - r, H0 - t - bb);
    const alfa = ieCanvas(W, H), fx2 = ieCtx(alfa);
    fx2.fillStyle = '#fff'; fx2.fillRect(0, 0, W, H); fx2.clearRect(ox, oy, W0, H0);
    fx2.globalCompositeOperation = 'lighten';
    const rampa = (x0, y0, x1, y1, rx, ry, rw, rh) => { const g = fx2.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); fx2.fillStyle = g; fx2.fillRect(rx, ry, rw, rh); };
    if (l) rampa(ox, 0, ox + s, 0, ox, oy, s, H0);
    if (r) rampa(ox + W0, 0, ox + W0 - s, 0, ox + W0 - s, oy, s, H0);
    if (t) rampa(0, oy, 0, oy + s, ox, oy, W0, s);
    if (bb) rampa(0, oy + H0, 0, oy + H0 - s, ox, oy + H0 - s, W0, s);
    const R = { x: 0, y: 0, w: W, h: H };
    const texto = (String(prompt || '').trim() ? String(prompt).trim() + ', ' : '') + IE_GEN_EXPANDIR + IE_GEN_COMPL;
    const refR = { x: ox, y: oy, w: W0, h: H0 };
    const g = await ieGerarArea(doc, R, area, texto, semente, refR, alfa);
    if (!g) { ieHist(ieT('Tamanho da tela')); return false; }
    ieGenCamada(doc, g, { prompt: String(prompt || '').trim() || ieT('(expansão)'), R, area, texto, refR, alfa }, 'Expansão generativa');
    ieHist(ieT('Expansão generativa'));
    ieUiCamadas?.();
    return true;
}
// outra variação da mesma camada generativa (o mesmo pedido, outra semente)
async function ieGenOutra(doc, L) {
    const G = L && L.generativo;
    if (!G) return false;
    const g = await ieGerarArea(doc, G.R, G.area, G.texto, -1, G.refR || G.R, G.alfa || null);
    if (!g) return false;
    G.variacoes.push({ c: g.c, semente: g.semente });
    return ieGenVariacao(doc, L, G.variacoes.length - 1);
}
function ieGenVariacao(doc, L, i) {
    const G = L && L.generativo;
    if (!G || !G.variacoes[i]) return false;
    const R0 = ieRCamada(L);
    G.atual = i;
    L.c = G.variacoes[i].c; L.x = G.R.x; L.y = G.R.y; L.sujoPx = true;
    ieInvalidar(L); ieCamadaMudou(L, R0);
    ieHist(ieT('Variação') + ` ${i + 1}`);
    ieUiProps?.(); ieUiCamadas?.();
    return true;
}
async function iePreenchimentoGenerativoDialogo(doc) {
    if (!doc || !doc.sel) { ieToast(ieT('Selecione onde gerar: a seleção é preenchida com o que você escrever')); return; }
    const v = await ieDialogo({
        titulo: 'Preenchimento generativo', ok: 'Gerar',
        campos: [{ id: 'prompt', rotulo: 'O que gerar na seleção', tipo: 'area', linhas: 3, dica: 'ex.: um balão de ar quente; vazio = tirar o que está lá (espinha, mancha, fio: deixe vazio)', valor: IE._genPrompt || '' },
            { id: 'n', tipo: 'nota', rotulo: 'IA no próprio computador (FLUX.2 klein), ~40 s. Depois: "Gerar outra" no painel Propriedades.' }],
    });
    if (!v) return;
    IE._genPrompt = v.prompt;
    await iePreenchimentoGenerativo(doc, v.prompt);
}
async function ieExpansaoGenerativaDialogo(doc) {
    if (!doc) return;
    const v = await ieDialogo({
        titulo: 'Expansão generativa', ok: 'Expandir',
        campos: [{ id: 'formato', rotulo: 'Formato', tipo: 'select', valor: 'story', opcoes: [['story', 'Story 9:16'], ['feed', 'Feed 4:5'], ['quadrado', 'Quadrado 1:1'],
            ['paisagem', 'Paisagem 16:9'], ['margem', 'Margem em volta'], ['px', 'Tamanho (px)']] },
            { id: 'margem', rotulo: 'Margem em volta (%)', tipo: 'numero', min: 1, max: 100, valor: 20 },
            { id: 'largura', rotulo: 'Largura (px)', tipo: 'numero', min: 1, max: 8000, valor: doc.w },
            { id: 'altura', rotulo: 'Altura (px)', tipo: 'numero', min: 1, max: 8000, valor: doc.h },
            { id: 'ancora', rotulo: 'A foto fica', tipo: 'select', valor: 'c', opcoes: [['c', 'No centro'], ['t', 'Em cima'], ['b', 'Embaixo'], ['l', 'À esquerda'], ['r', 'À direita']] },
            { id: 'prompt', rotulo: 'Descrever o que aparece (opcional)', tipo: 'texto', valor: '' },
            { id: 'n', tipo: 'nota', rotulo: 'A tela cresce e a IA (FLUX.2 klein, no computador) completa o que falta, ~40 s.' }],
    });
    if (v) await ieExpansaoGenerativa(doc, v);
}
Object.assign(IE_CMDS, {
    preenchGenerativo: doc => iePreenchimentoGenerativoDialogo(doc),
    expansaoGenerativa: doc => ieExpansaoGenerativaDialogo(doc),
    genOutra: doc => ieGenOutra(doc, ieAtiva(doc)),
});
(function () {
    const edt = IE_MENUS.find(m => m[0] === 'Editar')[1];
    const i = edt.findIndex(it => Array.isArray(it) && it[1] === 'preencherConteudo');
    edt.splice(i + 1, 0, ['Preenchimento generativo...', 'preenchGenerativo']);
    const img = IE_MENUS.find(m => m[0] === 'Imagem')[1];
    const j = img.findIndex(it => Array.isArray(it) && it[1] === 'tamTela');
    img.splice(j + 1, 0, ['Expansão generativa...', 'expansaoGenerativa']);
})();
