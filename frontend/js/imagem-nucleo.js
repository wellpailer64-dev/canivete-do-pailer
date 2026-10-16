// =========================================================
// Editor de Imagem — núcleo: documento, camadas, histórico, composição e a vista.
//
// Modelo (igual ao do PSD): cada camada tem os próprios pixels num canvas do tamanho dela (L.c) na posição L.x/L.y
// (pode passar da borda do documento), máscara de pixel separada (L.m: canvas em que o alfa é o valor da máscara,
// com a cor "fundo" fora do retângulo dela), opacidade, preenchimento, modo de mesclagem (chave do Photoshop),
// máscara de corte (L.clip: a camada aparece só onde a de baixo tem pixel) e efeitos de camada (L.fx). Listas de
// camadas vão de baixo para cima (como no arquivo); o painel mostra invertido.
// Tipos: pixel, texto, inteligente (objeto inteligente), forma, preenchimento, ajuste, grupo. Texto/inteligente/forma
// vindos do PSD guardam os pixels originais (L.c0) e a transformação acumulada (L.tf): mover ou transformar não
// rasteriza; o Python atualiza a matriz/os caminhos ao salvar (Functions/editor_imagem.py).
//
// Histórico: cada estado é uma foto da árvore (propriedades copiadas, canvases por referência). Canvas que entrou
// numa foto fica "congelado": quem for pintar nele chama ieGravavel() antes e ganha uma cópia (copy-on-write).
// =========================================================

const IE = {
    docs: [], doc: null, ferr: 'mover', cor: ['#000000', '#ffffff'], temps: [], seqDoc: 0,
    fontes: null, estilos: null, area: null,   // área de transferência interna {c, x, y, nome}
    op: {
        mover: { auto: true, alvo: 'camada', controles: true },
        letreiro: { forma: 'ret', suav: 0 },
        laco: { modo: 'livre', suav: 0 },
        varinha: { tol: 32, contiguo: true, todas: false },
        corte: { apagar: false },
        contagotas: { todas: true },
        carimbo: { tam: 60, dureza: 50, opac: 100, fluxo: 100, alinhado: true, todas: false },
        pincel: { tam: 30, dureza: 80, opac: 100, fluxo: 100, forma: 'redondo', espaco: 18, angulo: 0, redondeza: 100, varTam: 0, varAng: 0, dispersao: 0 },
        borracha: { tam: 40, dureza: 80, opac: 100, fluxo: 100, forma: 'redondo', espaco: 18, angulo: 0, redondeza: 100, varTam: 0, varAng: 0, dispersao: 0 },
        degrade: { tipo: 'linear', cores: 'frente-fundo', opac: 100, inverter: false },
        balde: { tol: 32, contiguo: true, todas: false, opac: 100 },
        borrachaMagica: { tol: 32, contiguo: true, todas: false, opac: 100, suave: true },
        borrachaFundo: { tam: 80, tol: 40, limites: 'contiguo', amostra: 'continuo', proteger: false },
        texto: { fonte: 'Arial', gdi: 'Arial', peso: 400, ital: false, tam: 72, alin: 'left', esp: 0, ent: 0 },
        forma: { tipo: 'ret', raio: 0, contorno: 0, lados: 6 },
        mao: {}, zoom: {},
    },
};

// ─────────────────────────── preferências (%APPDATA%, via ie_prefs: o localStorage do WebView não sobrevive) ───────────────────────────
IE.prefs = {};
async function iePrefsCarregar() {
    try { const r = await window.pywebview.api.ie_prefs(); if (r && r.success) IE.prefs = r.prefs || {}; } catch (e) { /* sem API */ }
    return IE.prefs;
}
function iePref(k, padrao) { return IE.prefs[k] !== undefined ? IE.prefs[k] : padrao; }
function iePrefGravar(k, v) {
    IE.prefs[k] = v;
    clearTimeout(IE.prefsT);
    IE.prefsT = setTimeout(() => { try { window.pywebview.api.ie_prefs(IE.prefs); } catch (e) { /* sem API */ } }, 400);
}

// ─────────────────────────── utilidades ───────────────────────────
const ieEl = id => document.getElementById(id);
const ieT = s => (typeof veT === 'function' ? veT(s) : s);
const ieClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ieEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ieCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    // todos na memória comum (o editor lê pixels o tempo todo): misturar canvas da placa com canvas da memória obrigava
    // o navegador a esperar a placa a cada desenho — grupo com recorte 73 ms → 23 ms, mesclagem 23 → 2 ms (2026-10-13)
    c.getContext('2d', { willReadFrequently: true });
    return c;
}
function ieCtx(c) { return c.getContext('2d'); }
function ieClonar(c) {
    if (!c) return null;
    const n = ieCanvas(c.width, c.height);
    ieCtx(n).drawImage(c, 0, 0);
    return n;
}

// retângulos {x, y, w, h} em px do documento
const ieR = (x, y, w, h) => ({ x, y, w, h });
function ieRVazio(r) { return !r || r.w <= 0 || r.h <= 0; }
function ieRUniao(a, b) {
    if (ieRVazio(a)) return b ? { ...b } : null;
    if (ieRVazio(b)) return { ...a };
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
function ieRInter(a, b) {
    if (ieRVazio(a) || ieRVazio(b)) return null;
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
}
function ieRInt(r) {   // arredonda para fora
    const x = Math.floor(r.x), y = Math.floor(r.y);
    return { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y };
}
function ieRContem(a, b) { return a && b && b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h; }
const ieRDoc = doc => ({ x: 0, y: 0, w: doc.w, h: doc.h });
const ieRPlano = o => (o && o.c ? { x: o.x, y: o.y, w: o.c.width, h: o.c.height } : null);

function ieHexRgb(h) {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const ieRgbHex = (r, g, b) => '#' + [r, g, b].map(v => ieClamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

function ieToast(msg, tipo) {
    if (typeof veToast === 'function') return veToast(msg);
    if (typeof toast === 'function') return toast(msg, tipo || 'info');
    console.log(msg);
}

// ─────────────────────────── modos de mesclagem ───────────────────────────
// chave do Photoshop → operação do canvas; as sem equivalente usam a mais parecida (e ficam marcadas no painel)
const IE_BM = [
    ['NORMAL', 'Normal', 'source-over'], ['DISSOLVE', 'Dissolver', 'source-over', 1], null,
    ['DARKEN', 'Escurecer', 'darken'], ['MULTIPLY', 'Multiplicação', 'multiply'], ['COLOR_BURN', 'Superexposição de cores', 'color-burn'],
    ['LINEAR_BURN', 'Superexposição linear', 'multiply', 1], ['DARKER_COLOR', 'Cor mais escura', 'darken', 1], null,
    ['LIGHTEN', 'Clarear', 'lighten'], ['SCREEN', 'Divisão', 'screen'], ['COLOR_DODGE', 'Subexposição de cores', 'color-dodge'],
    ['LINEAR_DODGE', 'Subexposição linear (Adicionar)', 'lighter'], ['LIGHTER_COLOR', 'Cor mais clara', 'lighten', 1], null,
    ['OVERLAY', 'Sobreposição', 'overlay'], ['SOFT_LIGHT', 'Luz suave', 'soft-light'], ['HARD_LIGHT', 'Luz direta', 'hard-light'],
    ['VIVID_LIGHT', 'Luz brilhante', 'hard-light', 1], ['LINEAR_LIGHT', 'Luz linear', 'hard-light', 1], ['PIN_LIGHT', 'Luz do pino', 'hard-light', 1],
    ['HARD_MIX', 'Mistura sólida', 'hard-light', 1], null,
    ['DIFFERENCE', 'Diferença', 'difference'], ['EXCLUSION', 'Exclusão', 'exclusion'], ['SUBTRACT', 'Subtrair', 'difference', 1],
    ['DIVIDE', 'Dividir', 'color-dodge', 1], null,
    ['HUE', 'Matiz', 'hue'], ['SATURATION', 'Saturação', 'saturation'], ['COLOR', 'Cor', 'color'], ['LUMINOSITY', 'Luminosidade', 'luminosity'],
];
const IE_BM_MAP = Object.fromEntries(IE_BM.filter(Boolean).map(b => [b[0], b]));
function ieGco(bm) {
    if (!bm || bm === 'PASS_THROUGH') return 'source-over';
    return (IE_BM_MAP[bm] || IE_BM_MAP.NORMAL)[2];
}

// ─────────────────────────── documento e camadas ───────────────────────────
function ieNovoDoc(o) {
    const doc = {
        id: ++IE.seqDoc, nome: o.nome || 'Sem título', w: o.w, h: o.h, dpi: o.dpi || 72, path: o.path || null,
        psdPath: o.psdPath || null, pyId: o.pyId || null, bits: o.bits || 8, modo: o.modo || 'RGB',
        camadas: [], ativa: null, selIds: [], sel: null, seq: 0, sujo: false, avisos: o.avisos || [],
        achatado: null, zoom: 1, px: 0, py: 0, hist: { itens: [], i: -1 }, mascaraAlvo: false,
        fatias: [], seqFatia: 0, fatiaSel: null, fatiasOrig: '[]',   // ferramenta Fatia (imagem-fatias.js)
        luzGlobal: { ang: 120, alt: 30 },   // "Usar luz global" dos efeitos (vai para o PSD)
    };
    doc.comp = ieCanvas(doc.w, doc.h);
    return doc;
}

function ieNovaCamada(doc, p = {}) {
    const L = {
        id: ++doc.seq, uid: 'u' + doc.id + '_' + doc.seq + '_' + Math.random().toString(36).slice(2, 7),
        tipo: 'pixel', nome: 'Camada', visivel: true, op: 1, fill: 1, bm: 'NORMAL', clip: false, travas: 0,
        c: null, x: 0, y: 0, m: null, fx: null, ref: null, kind: null, sujoPx: false, sujoM: false,
        ...p,
    };
    if (L.tipo === 'grupo') { L.filhos = L.filhos || []; if (!p.bm) L.bm = 'PASS_THROUGH'; if (L.aberto === undefined) L.aberto = true; }
    return L;
}

// percorre a árvore: fn(L, lista, i, pai) — de baixo para cima, grupos antes dos filhos
function iePercorrer(lista, fn, pai = null) {
    for (let i = 0; i < lista.length; i++) {
        const L = lista[i];
        if (fn(L, lista, i, pai) === false) return false;
        if (L.filhos && iePercorrer(L.filhos, fn, L) === false) return false;
    }
}
function ieAchar(doc, id) {
    let r = null;
    iePercorrer(doc.camadas, (L, lista, i, pai) => { if (L.id === id) { r = { L, lista, i, pai }; return false; } });
    return r;
}
function ieTodas(doc) { const out = []; iePercorrer(doc.camadas, L => { out.push(L); }); return out; }
function ieAtiva(doc = IE.doc) { return doc && doc.ativa != null ? ieAchar(doc, doc.ativa)?.L || null : null; }
function ieSelecionadas(doc = IE.doc) {
    if (!doc) return [];
    const ids = doc.selIds.length ? doc.selIds : (doc.ativa != null ? [doc.ativa] : []);
    return ids.map(id => ieAchar(doc, id)?.L).filter(Boolean);
}
function ieVisivelDeFato(doc, L) {   // camada e todos os grupos acima visíveis
    let ok = true;
    const busca = (lista, pais) => {
        for (const x of lista) {
            if (x === L) { ok = x.visivel && pais.every(p => p.visivel); return true; }
            if (x.filhos && busca(x.filhos, [...pais, x])) return true;
        }
        return false;
    };
    busca(doc.camadas, []);
    return ok;
}
const ieRaster0 = L => L && ['pixel', 'texto', 'inteligente', 'forma', 'preenchimento'].includes(L.tipo);
const ieVivo = L => L && ['texto', 'inteligente', 'forma', 'preenchimento'].includes(L.tipo) && L.ref != null;

// ─────────────────────────── copy-on-write e invalidação ───────────────────────────
function ieGravavel(L, alvo = 'c') {
    const o = alvo === 'm' ? L.m : L;
    if (o && o.c && o.c._congelado) o.c = ieClonar(o.c);
    return o;
}
function ieInvalidar(L) {
    if (!L) return;
    if (IE._cong && !IE._cong.ids.has(L.id)) IE._cong = null;   // mudou algo parado: o arraste rápido refaz o que guardou
    L._raster = null;
    L._v = (L._v || 0) + 1;
    L._thumbV = -1;
}
function ieMudouDoc(doc = IE.doc) {
    if (!doc) return;
    if (doc.sujo) return;   // a aba já mostra "não salvo": redesenhar as abas a cada clique custava 12–30 ms
    doc.sujo = true;
    ieAbasRender?.();
}

// aumenta o canvas do plano (pixels ou máscara) para cobrir R; fora do que existia vale "fundo" (0 = transparente)
function ieCrescer(o, R, fundo = 0) {
    R = ieRInt(R);
    const cur = ieRPlano(o);
    if (cur && ieRContem(cur, R)) return o;
    const U = cur ? ieRUniao(cur, R) : R;
    const n = ieCanvas(U.w, U.h), x = ieCtx(n);
    if (fundo) {
        x.fillStyle = '#fff';
        x.globalAlpha = fundo / 255;
        x.fillRect(0, 0, U.w, U.h);
        x.globalAlpha = 1;
        if (cur) x.clearRect(cur.x - U.x, cur.y - U.y, cur.w, cur.h);
    }
    if (o.c) x.drawImage(o.c, cur.x - U.x, cur.y - U.y);
    o.c = n; o.x = U.x; o.y = U.y;
    return o;
}

// retângulo do que tem pixel (alfa > 0) num plano; null = vazio
function ieLimites(c, x0 = 0, y0 = 0) {
    if (!c) return null;
    const w = c.width, h = c.height;
    const d = ieCtx(c).getImageData(0, 0, w, h).data;
    let x1 = w, y1 = h, x2 = -1, y2 = -1;
    for (let y = 0; y < h; y++) {
        const lin = y * w * 4;
        for (let x = 0; x < w; x++) {
            if (d[lin + x * 4 + 3]) {
                if (x < x1) x1 = x;
                if (x > x2) x2 = x;
                if (y < y1) y1 = y;
                y2 = y;
            }
        }
    }
    if (x2 < 0) return null;
    return { x: x0 + x1, y: y0 + y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}
function ieAparar(o) {   // corta a borda transparente do plano (economiza memória e arquivo)
    if (!o || !o.c) return o;
    const b = ieLimites(o.c, o.x, o.y);
    if (!b) { o.c = null; return o; }
    if (b.w === o.c.width && b.h === o.c.height) return o;
    const n = ieCanvas(b.w, b.h);
    ieCtx(n).drawImage(o.c, o.x - b.x, o.y - b.y);
    o.c = n; o.x = b.x; o.y = b.y;
    return o;
}

// ─────────────────────────── histórico ───────────────────────────
// IE_HIST_BYTES vale para TODOS os documentos abertos juntos (antes era 1,6 GB por documento: 4 arquivos grandes abertos
// passavam de 6 GB e o editor caía) e conta também os originais dos objetos inteligentes e as máscaras
const IE_HIST_MAX = 60, IE_HIST_BYTES = 2.5e9;
function ieCongelar(c) { if (c) c._congelado = true; return c; }

// cópia de dados simples; canvases vão por referência (congelados)
function ieCopiaDados(v, congelar) {
    if (v instanceof HTMLCanvasElement) return congelar ? ieCongelar(v) : v;
    if (Array.isArray(v)) return v.map(x => ieCopiaDados(x, congelar));
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = ieCopiaDados(v[k], congelar); return o; }
    return v;
}
function ieFotoCamadas(lista) {
    return lista.map(L => {
        const s = {};
        for (const k in L) {
            if (k[0] === '_') continue;
            const v = L[k];
            if (k === 'filhos') s.filhos = ieFotoCamadas(v);
            else if (k === 'm') s.m = v ? { ...v, c: ieCongelar(v.c) } : null;
            else if (v instanceof HTMLCanvasElement) s[k] = ieCongelar(v);
            else if (v && typeof v === 'object') s[k] = ieCopiaDados(v, true);
            else s[k] = v;
        }
        return s;
    });
}
function ieRestaurarCamadas(lista) {
    return lista.map(s => {
        const L = {};
        for (const k in s) {
            const v = s[k];
            if (k === 'filhos') L.filhos = ieRestaurarCamadas(v);
            else if (k === 'm') L.m = v ? { ...v } : null;
            else if (v instanceof HTMLCanvasElement) L[k] = v;
            else if (v && typeof v === 'object') L[k] = ieCopiaDados(v, false);
            else L[k] = v;
        }
        return L;
    });
}

function ieFoto(doc) {
    return {
        w: doc.w, h: doc.h, ativa: doc.ativa, selIds: [...doc.selIds], mascaraAlvo: doc.mascaraAlvo,
        fatias: (doc.fatias || []).map(f => ({ ...f })), fatiaSel: doc.fatiaSel, guias: (doc.guias || []).map(g => ({ ...g })), dems: doc.dems ? JSON.parse(JSON.stringify(doc.dems)) : null, demAtivo: doc.demAtivo ?? null,
        camadas: ieFotoCamadas(doc.camadas),
        sel: doc.sel ? { c: ieCongelar(doc.sel.c), bbox: { ...doc.sel.bbox }, forma: doc.sel.forma || null } : null,
    };
}

function ieHist(nome, doc = IE.doc) {
    if (!doc) return;
    const h = doc.hist;
    h.itens.splice(h.i + 1);
    h.itens.push({ nome, foto: ieFoto(doc), t: Date.now() });
    h.i = h.itens.length - 1;
    // limite de estados e de memória (canvases contados uma vez)
    while (h.itens.length > IE_HIST_MAX) { h.itens.splice(1, 1); h.i--; }
    ieHistCompactarLogo(doc);
    ieHistPodar(doc);
    if (nome !== 'Abrir' && nome !== 'Novo') ieMudouDoc(doc);
    ieHistRender?.();
}

// memória de todos os históricos abertos (cada canvas contado uma vez: o que não mudou é compartilhado entre estados;
// um retalho conta o pedaço dele e segue para a base)
function ieHistBytes() {
    const vistos = new Set();
    let bytes = 0;
    const soma = c => {
        while (c && !vistos.has(c)) {
            vistos.add(c);
            if (c.retalho) { if (c.px) bytes += c.px.width * c.px.height * 4; c = c.base; }
            else { if (c.width) bytes += c.width * c.height * 4; return; }
        }
    };
    const conta = lista => lista.forEach(s => {
        for (const c of [s.c, s.m && s.m.c, s.c0 && s.c0.c]) soma(c);
        if (s.filhos) conta(s.filhos);
    });
    for (const d of IE.docs || []) for (const it of d.hist.itens) conta(it.foto.camadas);
    return bytes;
}

// ── histórico em retalhos (ideia dos ladrilhos do PhotoCraft) ──
// Cada passo guardava a camada INTEIRA: numa foto de 6000×4000, 96 MB por pincelada, ~26 passos no limite. Agora, com o
// editor parado, o estado anterior troca a camada inteira por um retalho: só o retângulo que mudou, em cima da camada
// do estado seguinte ({retalho, base, x, y, w, h, px}). Desfazer remonta com uma cópia só (ieHistMontar).
const IE_RETALHO_MIN = 1e6;   // camadas menores que 1 Mpx ficam inteiras (não compensa)
function ieHistSlots(doc, fn) {   // fn(objeto, chave) para cada canvas guardado no histórico (camada e máscara)
    const anda = lista => lista.forEach(s => {
        if (s.c) fn(s, 'c');
        if (s.m && s.m.c) fn(s.m, 'c');
        if (s.filhos) anda(s.filhos);
    });
    for (const it of doc.hist.itens) anda(it.foto.camadas);
}
// troca `velho` por `novo` em todo o histórico (estados que compartilham a camada e retalhos que se apoiam nela)
function ieHistTrocar(velho, novo) {
    const retalhos = new Set();
    for (const d of IE.docs || []) ieHistSlots(d, (o, k) => {
        if (o[k] === velho) o[k] = novo;
        for (let c = o[k]; c && c.retalho && !retalhos.has(c); c = c.base) retalhos.add(c);
    });
    retalhos.forEach(r => { if (r.base === velho && r !== novo) r.base = novo; });
}
function ieHistMontar(v) {   // retalho → canvas (uma cópia da camada inteira mais próxima e os pedaços por cima)
    if (!v || !v.retalho) return v;
    const cadeia = [];
    for (let c = v; c.retalho; c = c.base) cadeia.push(c);
    if (cadeia.every(r => !r.w)) return cadeia[cadeia.length - 1].base;   // nada mudou: a própria camada (congelada)
    const n = ieClonar(cadeia[cadeia.length - 1].base), x = ieCtx(n);
    for (let i = cadeia.length - 1; i >= 0; i--) {
        const r = cadeia[i];
        if (!r.w) continue;
        x.clearRect(r.x, r.y, r.w, r.h);
        x.drawImage(r.px, r.x, r.y);
    }
    return ieCongelar(n);
}
// antes de voltar a um estado: os retalhos dele viram canvas de novo (e quem se apoiava neles passa a usar o canvas)
function ieHistMontarEstado(foto) {
    const anda = lista => lista.forEach(s => {
        if (s.c && s.c.retalho) ieHistTrocar(s.c, ieHistMontar(s.c));
        if (s.m && s.m.c && s.m.c.retalho) ieHistTrocar(s.m.c, ieHistMontar(s.m.c));
        if (s.filhos) anda(s.filhos);
    });
    anda(foto.camadas);
}
function ieHistCompactarLogo(doc) {
    clearTimeout(doc._compT);
    doc._compT = setTimeout(() => ieHistCompactar(doc), 600);
}
// pares (anterior, atual) da mesma camada que mudaram; o diff anda em faixas com pausa, para não travar o pincel
async function ieHistCompactar(doc) {
    const h = doc.hist, n = h.itens.length;
    if (n < 2 || h.i !== n - 1 || doc._compactando) return;
    doc._compactando = true;
    try {
        const vivos = new Set();
        for (const d of IE.docs || []) iePercorrer(d.camadas, L => { if (L.c) vivos.add(L.c); if (L.m && L.m.c) vivos.add(L.m.c); });
        const pares = [];
        const junta = (a, b) => {
            const ids = new Map(b.map(s => [s.id, s]));
            a.forEach(s => {
                const t = ids.get(s.id);
                if (!t) return;
                if (s.c && t.c && s.c !== t.c && s.x === t.x && s.y === t.y) pares.push([s.c, t.c]);
                if (s.m && t.m && s.m.c && t.m.c && s.m.c !== t.m.c && s.m.x === t.m.x && s.m.y === t.m.y) pares.push([s.m.c, t.m.c]);
                if (s.filhos && t.filhos) junta(s.filhos, t.filhos);
            });
        };
        // do mais antigo para o mais novo: o retalho de j se apoia no canvas de j+1, que vira retalho em seguida (ieHistTrocar
        // passa a base adiante)
        const itens = [...h.itens];
        for (let j = 0; j < n - 1; j++) junta(itens[j].foto.camadas, itens[j + 1].foto.camadas);
        const mexeu = () => h.itens.length !== n || itens.some((it, j) => h.itens[j] !== it);
        for (const [A, B] of pares) {
            if (A.retalho || B.retalho || vivos.has(A) || A.width !== B.width || A.height !== B.height || A.width * A.height < IE_RETALHO_MIN) continue;
            const R = await ieHistDiff(A, B);
            if (R === false || mexeu()) return;   // mexeram no histórico: o próximo passo compacta de novo
            if (R && R.w * R.h > A.width * A.height * 0.6) continue;   // mudou quase tudo: inteira mesmo
            const r = { retalho: true, base: B, x: 0, y: 0, w: 0, h: 0, px: null };
            if (R) {
                r.x = R.x; r.y = R.y; r.w = R.w; r.h = R.h;
                r.px = ieCanvas(R.w, R.h);
                ieCtx(r.px).drawImage(A, -R.x, -R.y);
            }
            ieHistTrocar(A, r);
        }
    } finally { doc._compactando = false; }
}
// retângulo onde A e B diferem (null = iguais; false = desistiu)
async function ieHistDiff(A, B) {
    const w = A.width, H = A.height, xa = ieCtx(A), xb = ieCtx(B), FAIXA = 256;
    let x0 = w, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y += FAIXA) {
        const fh = Math.min(FAIXA, H - y);
        let a, b;
        try { a = new Uint32Array(xa.getImageData(0, y, w, fh).data.buffer); b = new Uint32Array(xb.getImageData(0, y, w, fh).data.buffer); }
        catch (e) { return false; }
        for (let j = 0; j < fh; j++) {
            const L = j * w;
            let i = 0;
            while (i < w && a[L + i] === b[L + i]) i++;
            if (i === w) continue;
            let k = w - 1;
            while (a[L + k] === b[L + k]) k--;
            if (i < x0) x0 = i;
            if (k > x1) x1 = k;
            if (y + j < y0) y0 = y + j;
            y1 = y + j;
        }
        await new Promise(r => setTimeout(r, 0));
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// passou do limite: tira os estados mais antigos, primeiro dos documentos que não estão em uso; no atual sempre ficam
// o estado de abertura e os 2 últimos (como o Photoshop encurta o histórico em vez de cair)
function ieHistPodar(atual) {
    let podou = 0;
    for (let n = 0; n < 500 && ieHistBytes() > IE_HIST_BYTES; n++) {
        const outro = (IE.docs || []).find(d => d !== atual && d.hist.itens.length > 1 && (d.hist.i > 1 || d.hist.itens.length > d.hist.i + 1));
        const d = outro || (atual.hist.i > 2 ? atual : null);
        if (!d) break;
        const h = d.hist;
        if (h.i > 1) { h.itens.splice(1, 1); h.i--; } else h.itens.splice(h.i + 1, 1);   // sem antigos: o refazer mais distante
        podou++;
    }
    if (podou && !IE._avisoHist) { IE._avisoHist = true; ieToast?.(ieT('Memória alta: o histórico mais antigo foi descartado para o editor não travar')); }
    if (podou) ieHistRender?.();
}

function ieIrHist(i, doc = IE.doc) {
    if (!doc) return;
    const h = doc.hist;
    if (i < 0 || i >= h.itens.length || i === h.i) return;
    ieTextoEncerrar?.(true);
    ieFerrCancelar?.();
    const f = h.itens[i].foto;
    ieHistMontarEstado(f);
    h.i = i;
    const mudouTam = f.w !== doc.w || f.h !== doc.h, antes = doc.camadas;
    doc.w = f.w; doc.h = f.h;
    doc.camadas = ieRestaurarCamadas(f.camadas);
    doc.ativa = f.ativa; doc.selIds = [...f.selIds]; doc.mascaraAlvo = !!f.mascaraAlvo;
    doc.fatias = (f.fatias || []).map(x => ({ ...x })); doc.fatiaSel = f.fatiaSel ?? null;
    if (f.guias) doc.guias = f.guias.map(x => ({ ...x }));
    if (f.dems) { doc.dems = JSON.parse(JSON.stringify(f.dems)); doc.demAtivo = f.demAtivo; }
    doc.sel = f.sel ? { c: f.sel.c, bbox: { ...f.sel.bbox }, forma: f.sel.forma } : null;
    if (doc.sel) ieSelContorno(doc);
    if (mudouTam) { doc.comp = ieCanvas(doc.w, doc.h); ieAjustarVista(doc); }
    ieMudouDoc(doc);
    IE._cong = null;
    const R = mudouTam ? undefined : ieHistDiferenca(antes, doc.camadas);
    if (R === undefined) return ieTudo(doc);   // a pilha mudou (camada nova, apagada, reordenada): compõe tudo
    if (R) ieAgendar(ieRInter(ieRInt(R), ieRDoc(doc)) || ieRDoc(doc), doc); else ieQuadroPedir();
    ieUiTudo?.();
}
// desfazer/refazer: camada restaurada igual à atual (mesmos dados e os mesmos canvas) herda os caches dela (efeitos,
// texto rasterizado, miniatura) e só o que mudou é recomposto — antes recompunha o documento inteiro (~230 ms no PSB de
// pranchetas da Magnetus). Devolve a região a recompor, null (nada mudou na imagem) ou undefined (a pilha mudou)
function ieHistDiferenca(antes, depois) {
    const igual = (a, b) => {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || a instanceof HTMLCanvasElement || b instanceof HTMLCanvasElement) return false;
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        const ka = Object.keys(a).filter(k => k[0] !== '_' && k !== 'filhos'), kb = Object.keys(b).filter(k => k[0] !== '_' && k !== 'filhos');
        return ka.length === kb.length && ka.every(k => igual(a[k], b[k]));
    };
    let R = null;
    const anda = (la, lb) => {   // true = algo mudou dentro; null = pilha diferente
        if (la.length !== lb.length) return null;
        let mudou = false;
        for (let i = 0; i < la.length; i++) {
            const a = la[i], b = lb[i];
            if (a.id !== b.id || !!a.filhos !== !!b.filhos) return null;
            const dentro = a.filhos ? anda(a.filhos, b.filhos) : false;
            if (dentro === null) return null;
            const eq = igual(a, b);
            if (eq && !dentro) { for (const k in a) if (k[0] === '_') b[k] = a[k]; continue; }
            mudou = true;
            if (!eq) { const r1 = ieRCamada(a), r2 = ieRCamada(b); R = ieRUniao(ieRUniao(R, r1), r2); if (!r1 || !r2) R = ieRUniao(R, { x: -1e7, y: -1e7, w: 2e7, h: 2e7 }); }
        }
        return mudou;
    };
    const m = anda(antes, depois);
    return m === null ? undefined : m ? R : null;
}
function ieDesfazer() { const d = IE.doc; if (d) ieIrHist(d.hist.i - 1, d); }
function ieRefazer() { const d = IE.doc; if (d) ieIrHist(d.hist.i + 1, d); }

// ─────────────────────────── composição ───────────────────────────
function ieTemp(k, w, h) {
    let c = IE.temps[k];
    if (!c || c.width < w || c.height < h) {
        c = ieCanvas(Math.max(w, c ? c.width : 0), Math.max(h, c ? c.height : 0));
        IE.temps[k] = c;
    }
    const x = ieCtx(c);
    if (c._recorte) x.restore();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.filter = 'none';
    x.clearRect(0, 0, w, h);
    // só o pedaço pedido: a folha guardada cresce até o maior pedido (o documento inteiro) e as operações que apagam
    // fora da forma (destination-in, source-in) percorriam a folha INTEIRA a cada recorte (~20 ms cada, mesmo longe)
    x.save(); x.beginPath(); x.rect(0, 0, w, h); x.clip();
    c._recorte = true;
    return c;
}

// máscara (alfa) recortada num retângulo do documento, com "fundo" fora do retângulo dela
function ieMascaraRegiao(m, R, alvo) {
    const c = alvo || ieCanvas(R.w, R.h), x = ieCtx(c);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.clearRect(0, 0, R.w, R.h);
    if (m.fundo) {
        x.fillStyle = '#fff';
        x.globalAlpha = m.fundo / 255;
        x.fillRect(0, 0, R.w, R.h);
        x.globalAlpha = 1;
        if (m.c) x.clearRect(m.x - R.x, m.y - R.y, m.c.width, m.c.height);
    }
    if (m.c) x.drawImage(m.c, m.x - R.x, m.y - R.y);
    return c;
}

// efeitos de camada: algum para desenhar?

function ieRgba(hex, a) { const [r, g, b] = ieHexRgb(hex); return `rgba(${r},${g},${b},${a})`; }

// silhueta colorida (cor sólida com o alfa da camada)
function ieSilhueta(base, cor, alfa = 1) {
    const s = ieCanvas(base.width, base.height), x = ieCtx(s);
    x.drawImage(base, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = cor;
    x.globalAlpha = alfa;
    x.fillRect(0, 0, s.width, s.height);
    return s;
}

// pixels finais da camada (máscara, preenchimento e efeitos), guardados até a camada mudar.
// {c, x, y, src, ext: [{c, bm, op}] (sombra/brilho, por baixo), acima: [...] (fora do chanfro), forma: {c, x, y}}
function ieRaster(L) {
    const src = L._tfPrev || (L.c ? { c: L.c, x: L.x, y: L.y } : null);
    if (!src || !src.c) return null;
    if (L._raster && L._raster.src === src.c) return L._raster;
    const mask = L.m && !L.m.desativada ? (L._tfPrev && L._mPrev) || L.m : null;
    const fx = L.fxOculto ? null : (ieTemFx(L.fx) ? L.fx : null);
    if (!mask && !fx && L.fill >= 1) return src;
    const w = src.c.width, h = src.c.height;
    let base = src.c, mreg = null;
    if (mask) {
        mreg = ieMascaraRegiao(mask, { x: src.x, y: src.y, w, h });
        if (!(fx && L.mascaraOcultaFx)) {
            base = ieCanvas(w, h);
            const x = ieCtx(base);
            x.drawImage(src.c, 0, 0);
            x.globalCompositeOperation = 'destination-in';
            x.drawImage(mreg, 0, 0);
        }
    }
    if (!fx) {
        const c = ieCanvas(w, h), x = ieCtx(c);
        x.globalAlpha = L.fill;
        x.drawImage(base, 0, 0);
        return (L._raster = { c, x: src.x, y: src.y, src: src.c, forma: { c: base, x: src.x, y: src.y } });
    }
    const r = ieFxRender(base, fx, { fill: L.fill, interiorComFill: !!L.misturaInterior, doc: IE.doc, org: { x: src.x, y: src.y } });
    if (mreg && L.mascaraOcultaFx) {
        // "a máscara oculta os efeitos": efeitos feitos da camada inteira e a máscara corta tudo
        const W = r.c.width, H = r.c.height, M = ieCanvas(W, H), mx = ieCtx(M);
        mx.fillStyle = '#fff'; mx.globalAlpha = (mask.fundo || 0) / 255; mx.fillRect(0, 0, W, H); mx.globalAlpha = 1;
        mx.clearRect(r.mg, r.mg, w, h);
        mx.drawImage(mreg, r.mg, r.mg);
        for (const c of [r.c, ...r.ext.map(e => e.c), ...r.acima.map(e => e.c)]) { const x = ieCtx(c); x.globalCompositeOperation = 'destination-in'; x.drawImage(M, 0, 0); x.globalCompositeOperation = 'source-over'; }
        base = ieCanvas(w, h);
        const bx = ieCtx(base); bx.drawImage(src.c, 0, 0); bx.globalCompositeOperation = 'destination-in'; bx.drawImage(mreg, 0, 0);
    }
    return (L._raster = { c: r.c, x: src.x - r.mg, y: src.y - r.mg, src: src.c, ext: r.ext, acima: r.acima, forma: { c: base, x: src.x, y: src.y } });
}

// Atualiza só a região D (px do documento) do cache da camada (máscara e preenchimento, SEM efeitos) em vez de jogá-lo
// fora: pintar na máscara de uma camada grande refazia a camada inteira a cada movimento do pincel (2026-10-07: num
// 8640×1440 eram travadas de 120–150 ms por movimento). Devolve false quando não dá (sem cache, com efeitos, canvas da
// camada trocado/crescido, transformação em prévia) — aí quem chama invalida a camada inteira como antes.
function ieRasterRegiao(L, D) {
    const r = L._raster;
    if (!r || !L.c || r.src !== L.c || L._tfPrev || (r.ext && r.ext.length) || (r.acima && r.acima.length)) return false;
    if (!L.fxOculto && ieTemFx(L.fx)) return false;
    const R = ieRInter(ieRInt(D), { x: L.x, y: L.y, w: L.c.width, h: L.c.height });
    if (R) {
        const mask = L.m && !L.m.desativada ? L.m : null;
        const t = ieTemp(31, R.w, R.h), tx = ieCtx(t);
        tx.save(); tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over';
        tx.clearRect(0, 0, R.w, R.h);
        tx.drawImage(L.c, R.x - L.x, R.y - L.y, R.w, R.h, 0, 0, R.w, R.h);
        if (mask) { tx.globalCompositeOperation = 'destination-in'; tx.drawImage(ieMascaraRegiao(mask, R), 0, 0); }
        tx.restore();
        const lx = R.x - r.x, ly = R.y - r.y;
        if (r.forma && r.forma.c && r.forma.c !== L.c) {
            const fx = ieCtx(r.forma.c);
            fx.save(); fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalAlpha = 1; fx.globalCompositeOperation = 'source-over';
            fx.clearRect(R.x - r.forma.x, R.y - r.forma.y, R.w, R.h); fx.drawImage(t, 0, 0, R.w, R.h, R.x - r.forma.x, R.y - r.forma.y, R.w, R.h);
            fx.restore();
        }
        const cx = ieCtx(r.c);
        cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'source-over';
        cx.clearRect(lx, ly, R.w, R.h); cx.globalAlpha = L.fill ?? 1; cx.drawImage(t, 0, 0, R.w, R.h, lx, ly, R.w, R.h);
        cx.restore();
    }
    L._v = (L._v || 0) + 1;
    L._thumbV = -1;
    return true;
}

// a camada inteira achatada (sombra, conteúdo e o resto), para miniatura e seleção
function ieRasterTudo(L) {
    const r = ieRaster(L);
    if (!r || (!(r.ext && r.ext.length) && !(r.acima && r.acima.length))) return r;
    const c = ieCanvas(r.c.width, r.c.height), x = ieCtx(c);
    for (const e of [...r.ext, { c: r.c, bm: 'NORMAL', op: 1 }, ...r.acima]) { x.globalAlpha = e.op; x.drawImage(e.c, 0, 0); }
    return { c, x: r.x, y: r.y };
}

// fundo do documento (para o Vazamento profundo): a camada Fundo, se houver
function ieFundoDoc(doc) {
    const L = doc && doc.camadas[0];
    if (!L || L.tipo !== 'pixel' || !L.visivel || !(L.fundo || /^(fundo|background|plano de fundo)$/i.test(L.nome))) return null;
    return ieRaster(L);
}

// o = deslocamento do contexto: ponto (X, Y) do documento cai em (X - o.x, Y - o.y) no canvas.
// o.base = como estava o canvas no começo desta lista (Vazamento raso dentro de um grupo).
function ieComporLista(ctx, lista, R, o, prof) {
    if (lista.some(L => L.visivel && L.vazamento && L.vazamento !== 'nenhum')) {
        const b = ieCanvas(R.w, R.h);
        ieCtx(b).drawImage(ctx.canvas, R.x - o.x, R.y - o.y, R.w, R.h, 0, 0, R.w, R.h);
        o = { ...o, base: { c: b, x: R.x, y: R.y } };
    }
    for (let i = 0; i < lista.length; i++) {
        const L = lista[i];
        if (IE._pararEm === L) { IE._parou = true; return; }   // ieAchatarAbaixo: só o que está embaixo de L
        let j = i + 1;
        if (!L.clip) while (j < lista.length && lista[j].clip) j++;
        // camada (e o recorte preso nela) que não toca a região: nada a desenhar. Antes cada recorte longe dali ainda
        // custava ~2 ms por quadro. Grupos não entram (os efeitos do grupo passam da caixa dos filhos).
        if (L.visivel && L.tipo !== 'grupo' && L.tipo !== 'ajuste' && !(L.vazamento && L.vazamento !== 'nenhum')) {
            const Rl = ieRCamada(L);
            if (!Rl || !ieRInter(Rl, R)) { i = j - 1; continue; }
        }
        if (L.visivel) {
            const clipados = lista.slice(i + 1, j).filter(c => c.visivel);
            if (clipados.length && L.tipo !== 'ajuste') ieComporCorte(ctx, L, clipados, R, o, prof);
            else ieComporCamada(ctx, L, R, o, prof);
            if (IE._parou) return;
        }
        i = j - 1;
    }
}

function ieDesenhar(ctx, c, sx, sy, sw, sh, dx, dy, alfa, gco) {
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.globalCompositeOperation = gco;
    ctx.drawImage(c, sx, sy, sw, sh, dx, dy, sw, sh);
    ctx.restore();
}

// Misturar se (Blend If): quanto da camada fica, pelo valor dela e pelo de baixo. faixa = [preto0, preto1, branco0, branco1]
function ieFaixaMescSe(v, f) {
    if (!f) return 1;
    const [b0, b1, w0, w1] = f;
    if (v < b0) return 0;
    if (v < b1) return (v - b0) / (b1 - b0);
    if (v <= w0) return 1;
    if (v <= w1) return w1 > w0 ? (w1 - v) / (w1 - w0) : 0;
    return 0;
}
const ieMescSeNeutro = m => !m || ['cinza', 'r', 'g', 'b'].every(k => !m[k] || [m[k].atual, m[k].baixo].every(f => !f || (f[0] <= 0 && f[1] <= 0 && f[2] >= 255 && f[3] >= 255)));
const ieCanaisTodos = c => !c || (c.r !== false && c.g !== false && c.b !== false);

// desenho com contas por pixel: Misturar se e canais R/G/B desligados
function ieDesenharEspecial(ctx, L, c, x0, y0, R, o, alfa, gco) {
    const Ri = ieRInter(ieRInt({ x: x0, y: y0, w: c.width, h: c.height }), R);
    if (!Ri) return;
    const ix = Ri.x - o.x, iy = Ri.y - o.y;
    let fundo;
    try { fundo = ctx.getImageData(ix, iy, Ri.w, Ri.h); } catch (e) { return; }
    const T = ieCanvas(Ri.w, Ri.h), tx = ieCtx(T);
    tx.drawImage(c, Ri.x - x0, Ri.y - y0, Ri.w, Ri.h, 0, 0, Ri.w, Ri.h);
    const m = L.mescSe;
    if (!ieMescSeNeutro(m)) {
        const img = tx.getImageData(0, 0, Ri.w, Ri.h), d = img.data, f = fundo.data;
        const lum = (p, k) => 0.299 * p[k] + 0.587 * p[k + 1] + 0.114 * p[k + 2];
        for (let k = 0; k < d.length; k += 4) {
            if (!d[k + 3]) continue;
            let a = ieFaixaMescSe(lum(d, k), m.cinza && m.cinza.atual) * ieFaixaMescSe(lum(f, k), m.cinza && m.cinza.baixo);
            for (const [ch, q] of [['r', 0], ['g', 1], ['b', 2]]) if (m[ch]) a *= ieFaixaMescSe(d[k + q], m[ch].atual) * ieFaixaMescSe(f[k + q], m[ch].baixo);
            d[k + 3] *= a;
        }
        tx.putImageData(img, 0, 0);
    }
    const Bk = ieCanvas(Ri.w, Ri.h), bx = ieCtx(Bk);
    bx.putImageData(fundo, 0, 0);
    bx.globalAlpha = alfa; bx.globalCompositeOperation = gco;
    bx.drawImage(T, 0, 0);
    const res = bx.getImageData(0, 0, Ri.w, Ri.h);
    const can = L.canais;
    if (!ieCanaisTodos(can)) {
        const d = res.data, f = fundo.data, liga = [can.r !== false, can.g !== false, can.b !== false];
        for (let k = 0; k < d.length; k += 4) for (let q = 0; q < 3; q++) if (!liga[q]) d[k + q] = f[k + q];
    }
    ctx.putImageData(res, ix, iy);
}

// Vazamento (Knockout): onde a camada tem forma, aparece o começo do grupo (raso) ou o fundo (profundo)
function ieVazar(ctx, L, r, o) {
    const f = r.forma;
    if (!f) return;
    const base = L.vazamento === 'profundo' || !o.base ? (IE._fundoComp || null) : o.base;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(f.c, f.x, f.y);
    if (base) {
        const T = ieCanvas(f.c.width, f.c.height), tx = ieCtx(T);
        tx.drawImage(base.c, base.x - f.x, base.y - f.y);
        tx.globalCompositeOperation = 'destination-in';
        tx.drawImage(f.c, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(T, f.x, f.y);
    }
    ctx.restore();
}

// assinatura do conteúdo de um grupo (versões, posições, visibilidade, opacidade e efeitos dos filhos), para o cache
// dos efeitos do grupo saber quando refazer
function ieGrupoAssin(L) {
    return L.filhos.map(X => [X.id, X._v || 0, X.x, X.y, X.visivel ? 1 : 0, X.op, X.bm, X.fill, X.clip ? 1 : 0,
        X.fxOculto ? 0 : JSON.stringify(X.fx || null), X.m ? (X.m._v || 0) + ':' + (X.m.desativada ? 1 : 0) : '',
        X.tipo === 'grupo' ? ieGrupoAssin(X) : ''].join(',')).join('|');
}

// Grupo com efeitos de camada (sombra, traçado, brilho... no próprio grupo, como no Photoshop): os filhos são compostos
// à parte na caixa inteira do grupo e esse resultado passa pelo mesmo ieFxRender das camadas. Antes os efeitos do grupo
// eram ignorados: a sombra não aparecia nem na prévia da janela de estilo (2026-10-13, selo do carrossel Carlinhos).
function ieRasterGrupoFx(L, mask, prof) {
    const C = ieCaixaCamada(L);
    if (!C || C.w < 1 || C.h < 1) return null;
    const assin = [ieGrupoAssin(L), C.x, C.y, C.w, C.h, JSON.stringify(L.fx), L.fill, mask ? (mask._v || 0) : ''].join('#');
    if (L._grupoFx && L._grupoFx.assin === assin) return L._grupoFx.r;
    const G = ieCanvas(C.w, C.h), gc = ieCtx(G);
    gc.setTransform(1, 0, 0, 1, -C.x, -C.y);
    ieComporLista(gc, L.filhos, C, { x: C.x, y: C.y }, prof + 4);
    gc.setTransform(1, 0, 0, 1, 0, 0);
    if (mask) { gc.globalCompositeOperation = 'destination-in'; gc.drawImage(ieMascaraRegiao(mask, C), 0, 0); gc.globalCompositeOperation = 'source-over'; }
    const f = ieFxRender(G, L.fx, { fill: L.fill ?? 1, interiorComFill: !!L.misturaInterior, doc: IE.doc, org: { x: C.x, y: C.y } });
    const r = { c: f.c, x: C.x - f.mg, y: C.y - f.mg, ext: f.ext, acima: f.acima };
    L._grupoFx = { assin, r };
    return r;
}

function ieComporCamada(ctx, L, R, o, prof, forcarNormal, semExt) {
    if (L.tipo === 'grupo') {
        const mask = L.m && !L.m.desativada ? L.m : null;
        if (!L.fxOculto && ieTemFx(L.fx)) {
            const r = ieRasterGrupoFx(L, mask, prof);
            if (!r) return;
            const op = forcarNormal ? 1 : L.op, gco = forcarNormal ? 'source-over' : ieGco(L.bm === 'PASS_THROUGH' ? 'NORMAL' : L.bm);
            const extra = lista => { for (const e of lista || []) { ctx.save(); ctx.globalAlpha = e.op * op; ctx.globalCompositeOperation = ieGco(e.bm); ctx.drawImage(e.c, r.x, r.y); ctx.restore(); } };
            if (!semExt) extra(r.ext);
            ctx.save(); ctx.globalAlpha = op; ctx.globalCompositeOperation = gco; ctx.drawImage(r.c, r.x, r.y); ctx.restore();
            extra(r.acima);
            return;
        }
        if (L.bm === 'PASS_THROUGH' && L.op >= 1 && !mask && !forcarNormal) return ieComporLista(ctx, L.filhos, R, o, prof);
        const t = ieTemp(prof + 1, R.w, R.h), tc = ieCtx(t);
        tc.setTransform(1, 0, 0, 1, -R.x, -R.y);
        ieComporLista(tc, L.filhos, R, { x: R.x, y: R.y }, prof + 1);
        tc.setTransform(1, 0, 0, 1, 0, 0);
        if (mask) {
            tc.globalCompositeOperation = 'destination-in';
            tc.drawImage(ieMascaraRegiao(mask, R, ieTemp(prof + 2, R.w, R.h)), 0, 0, R.w, R.h, 0, 0, R.w, R.h);
            tc.globalCompositeOperation = 'source-over';
        }
        ieDesenhar(ctx, t, 0, 0, R.w, R.h, R.x, R.y, forcarNormal ? 1 : L.op, forcarNormal ? 'source-over' : ieGco(L.bm));
        return;
    }
    if (L.tipo === 'ajuste') return ieComporAjuste(ctx, L, R, o, prof);
    const r = ieRaster(L);
    if (!r) return;
    const op = forcarNormal ? 1 : L.op, gco = forcarNormal ? 'source-over' : ieGco(L.bm);
    const extra = (lista) => { for (const e of lista || []) { ctx.save(); ctx.globalAlpha = e.op * op; ctx.globalCompositeOperation = ieGco(e.bm); ctx.drawImage(e.c, r.x, r.y); ctx.restore(); } };
    if (!forcarNormal && L.vazamento && L.vazamento !== 'nenhum') ieVazar(ctx, L, r, o);
    if (!semExt) extra(r.ext);
    if (!ieMescSeNeutro(L.mescSe) || !ieCanaisTodos(L.canais)) ieDesenharEspecial(ctx, L, r.c, r.x, r.y, R, o, op, gco);
    else { ctx.save(); ctx.globalAlpha = op; ctx.globalCompositeOperation = gco; ctx.drawImage(r.c, r.x, r.y); ctx.restore(); }
    extra(r.acima);
}

// base + camadas com máscara de corte. "Mesclar camadas cortadas como grupo" (padrão): compostas à parte e limitadas
// ao alfa da base; desligado: cada cortada mistura direto com o que está embaixo, recortada pela base
function ieComporCorte(ctx, base, clipados, R, o, prof) {
    if (base.misturaCorte === false && base.tipo !== 'grupo') {
        ieComporCamada(ctx, base, R, o, prof);
        const rb = ieRaster(base), f = rb && rb.forma;
        if (!f) return;
        for (const c of clipados) {
            const t = ieTemp(prof + 1, R.w, R.h), tc = ieCtx(t);
            tc.setTransform(1, 0, 0, 1, -R.x, -R.y);
            ieComporCamada(tc, c, R, { x: R.x, y: R.y }, prof + 3, true);
            tc.globalCompositeOperation = 'destination-in';
            tc.drawImage(f.c, f.x, f.y);
            tc.setTransform(1, 0, 0, 1, 0, 0);
            tc.globalCompositeOperation = 'source-over';
            ieDesenhar(ctx, t, 0, 0, R.w, R.h, R.x, R.y, c.op, ieGco(c.bm));
        }
        return;
    }
    // a base desenha os efeitos de baixo (sombra, brilho) direto; o recorte usa só a forma dela
    const rb = base.tipo !== 'grupo' ? ieRaster(base) : null, f = rb && rb.forma;
    if (rb) for (const e of rb.ext || []) { ctx.save(); ctx.globalAlpha = e.op * base.op; ctx.globalCompositeOperation = ieGco(e.bm); ctx.drawImage(e.c, rb.x, rb.y); ctx.restore(); }
    const t = ieTemp(prof + 1, R.w, R.h), tc = ieCtx(t);
    tc.setTransform(1, 0, 0, 1, -R.x, -R.y);
    ieComporCamada(tc, base, R, { x: R.x, y: R.y }, prof + 3, true, true);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    const b = ieTemp(prof + 2, R.w, R.h), bc = ieCtx(b);
    bc.drawImage(t, 0, 0, R.w, R.h, 0, 0, R.w, R.h);
    bc.setTransform(1, 0, 0, 1, -R.x, -R.y);
    for (const c of clipados) ieComporCamada(bc, c, R, { x: R.x, y: R.y }, prof + 3);
    bc.globalCompositeOperation = 'destination-in';
    if (f) bc.drawImage(f.c, f.x, f.y);
    else { bc.setTransform(1, 0, 0, 1, 0, 0); bc.drawImage(t, 0, 0, R.w, R.h, 0, 0, R.w, R.h); }
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.globalCompositeOperation = 'source-over';
    if (f) {   // fora da forma fica o que a base tem de efeito (traçado, chanfro); dentro, base + cortadas
        tc.setTransform(1, 0, 0, 1, -R.x, -R.y);
        tc.globalCompositeOperation = 'destination-out';
        tc.drawImage(f.c, f.x, f.y);
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.globalCompositeOperation = 'source-over';
        tc.drawImage(b, 0, 0, R.w, R.h, 0, 0, R.w, R.h);
        ieDesenhar(ctx, t, 0, 0, R.w, R.h, R.x, R.y, base.op, ieGco(base.bm));
    } else ieDesenhar(ctx, b, 0, 0, R.w, R.h, R.x, R.y, base.op, ieGco(base.bm));
}

function ieComporAjuste(ctx, L, R, o, prof) {
    if (!L.ajuste || typeof ieAjustar !== 'function') return;
    const x0 = R.x - o.x, y0 = R.y - o.y;
    let img;
    try { img = ctx.getImageData(x0, y0, R.w, R.h); } catch (e) { return; }
    if (L.ajuste.t === 'cameraRaw') { if (typeof ieCrAjusteImg === 'function') ieCrAjusteImg(img, L, { x: R.x, y: R.y }); }   // imagem-cameraraw.js
    else ieAjustar(img.data, L.ajuste);
    const mask = L.m && !L.m.desativada ? L.m : null;
    if (!mask && L.op >= 1 && (L.bm === 'NORMAL' || !L.bm)) { ctx.putImageData(img, x0, y0); return; }
    const t = ieTemp(prof + 1, R.w, R.h), tc = ieCtx(t);
    tc.putImageData(img, 0, 0);
    if (mask) {
        tc.globalCompositeOperation = 'destination-in';
        tc.drawImage(ieMascaraRegiao(mask, R, ieTemp(prof + 2, R.w, R.h)), 0, 0, R.w, R.h, 0, 0, R.w, R.h);
        tc.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = L.op;
    ctx.globalCompositeOperation = ieGco(L.bm);
    ctx.drawImage(t, 0, 0, R.w, R.h, x0, y0, R.w, R.h);
    ctx.restore();
}

// composição em blocos de no máximo 2048 px: as folhas de rascunho (ieTemp) crescem até o maior pedaço pedido e ficam
// guardadas; compor o documento inteiro de uma vez as deixava do tamanho dele (4 folhas de 400 MB num canvas 10k × 10k)
const IE_COMP_BLOCO = 2048;
function ieCompor(doc, R) {
    R = ieRInter(ieRInt(R || ieRDoc(doc)), ieRDoc(doc));
    if (!R) return;
    if (doc.comp.width !== doc.w || doc.comp.height !== doc.h) doc.comp = ieCanvas(doc.w, doc.h);
    const B = IE_COMP_BLOCO;
    if (R.w <= B && R.h <= B) return ieComporPedaco(doc, R);
    for (let y = R.y; y < R.y + R.h; y += B) for (let x = R.x; x < R.x + R.w; x += B)
        ieComporPedaco(doc, { x, y, w: Math.min(B, R.x + R.w - x), h: Math.min(B, R.y + R.h - y) });
}
function ieComporPedaco(doc, R) {
    const ctx = ieCtx(doc.comp);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(R.x, R.y, R.w, R.h);
    doc._compV = (doc._compV || 0) + 1;   // a tela reduzida (ieMipmap) refaz as etapas
    IE._fundoComp = ieTodas(doc).some(L => L.vazamento && L.vazamento !== 'nenhum') ? ieFundoDoc(doc) : null;
    // camada de ajuste que olha os vizinhos (Camera Raw com Claridade, Névoa...): compõe a região com uma margem
    // num canvas à parte e copia só o miolo (senão a borda da região sai diferente e aparece a emenda)
    const M = typeof ieCrMargemDoc === 'function' ? ieCrMargemDoc(doc) : 0, R2 = M && ieRInter(ieRInt({ x: R.x - M, y: R.y - M, w: R.w + 2 * M, h: R.h + 2 * M }), ieRDoc(doc));
    if (R2 && (R2.w > R.w || R2.h > R.h)) {
        const t = ieCanvas(R2.w, R2.h), tc = ieCtx(t);
        tc.setTransform(1, 0, 0, 1, -R2.x, -R2.y);
        ieComporLista(tc, doc.camadas, R2, { x: R2.x, y: R2.y, base: IE._fundoComp }, 0);
        ctx.drawImage(t, R.x - R2.x, R.y - R2.y, R.w, R.h, R.x, R.y, R.w, R.h);
        ctx.restore();
        return;
    }
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    const cg = ieCongAtual(doc);
    if (cg) ieComporCong(ctx, doc, R, cg);
    else ieComporLista(ctx, doc.camadas, R, { x: 0, y: 0, base: IE._fundoComp }, 0);
    ctx.restore();
}

// ─────────────────────────── arraste rápido ───────────────────────────
// Arrastando no Mover ou no Ctrl+T, só as camadas que se movem mudam: o que está embaixo delas e (quando não depende do
// que está embaixo) o que está por cima ficam guardados prontos e cada quadro desenha 3 coisas em vez da pilha toda.
// Guardado em blocos de 256 px só por onde a camada passa (não o documento inteiro), então começar a arrastar não
// trava e a memória acompanha o caminho do arraste. Mesmo resultado da composição normal: "sobre" é associativo, e o
// de cima só é guardado se for todo Normal/isolado.
const IE_CONG_BLOCO = 256;
function ieCongAlvos() {
    if (IE.transf) return IE.transf.alvos;
    const m = IE.mov;
    return m && m.alvos && !m.flut && !m.caixa && !m.transf ? m.alvos : null;
}
function ieGrupoPlano(L) {   // grupo que se desenha como se os filhos estivessem soltos na lista de cima
    return L.tipo === 'grupo' && L.visivel && L.bm === 'PASS_THROUGH' && L.op >= 1 && !(L.m && !L.m.desativada) && !(!L.fxOculto && ieTemFx(L.fx));
}
// a lista não depende do que está embaixo dela (pode ser composta à parte e posta por cima)
function ieListaIndep(lista) {
    let base = null;
    for (const L of lista) {
        if (!L.clip) base = L;
        if (!L.visivel) continue;
        if (L.clip && base && !(base.misturaCorte === false && base.tipo !== 'grupo')) continue;   // mistura dentro do recorte
        if (L.tipo === 'ajuste' || (L.vazamento && L.vazamento !== 'nenhum') || !ieMescSeNeutro(L.mescSe) || !ieCanaisTodos(L.canais)) return false;
        if (ieGrupoPlano(L)) { if (!ieListaIndep(L.filhos)) return false; continue; }
        if (L.bm && L.bm !== 'NORMAL' && L.bm !== 'PASS_THROUGH') return false;
    }
    return true;
}
function ieCongAtual(doc) {
    const alvos = ieCongAlvos();
    if (!alvos || !alvos.length || IE._fundoComp || IE.congDesligado) { IE._cong = null; return null; }
    const ids = new Set();
    for (const X of alvos) iePercorrer([X], Y => { ids.add(Y.id); });
    const chave = doc.id + '|' + doc.hist.i + '|' + [...ids].sort((a, b) => a - b).join(',');
    if (IE._cong && IE._cong.doc === doc && IE._cong.chave === chave) return IE._cong.ok ? IE._cong : null;
    IE._cong = { doc, chave, ids, ok: false };
    if (typeof ieCrMargemDoc === 'function' && ieCrMargemDoc(doc)) return null;
    if (ieTodas(doc).some(L => L.visivel && L.vazamento && L.vazamento !== 'nenhum')) return null;
    const contem = L => ids.has(L.id) || (L.tipo === 'grupo' && L.filhos.some(contem));
    let falhou = false;
    const abrir = lista => {
        const out = [];
        for (let i = 0; i < lista.length; i++) {
            const L = lista[i];
            if (!ids.has(L.id) && ieGrupoPlano(L) && contem(L)) {
                // recorte que começa no grupo ou logo depois dele mudaria de base se os filhos fossem soltos
                if ((L.filhos[0] && L.filhos[0].clip) || (lista[i + 1] && lista[i + 1].clip)) { falhou = true; return out; }
                out.push(...abrir(L.filhos));
            } else out.push(L);
        }
        return out;
    };
    const plano = abrir(doc.camadas);
    if (falhou) return null;
    let lo = -1, hi = -1;
    plano.forEach((L, i) => { if (contem(L)) { if (lo < 0) lo = i; hi = i; } });
    if (lo < 0) return null;
    while (lo > 0 && plano[lo].clip) lo--;
    while (hi + 1 < plano.length && plano[hi + 1].clip) hi++;
    const acimaOk = ieListaIndep(plano.slice(hi + 1));
    Object.assign(IE._cong, { ok: true, plano, lo, hi, acimaOk, blocos: new Map() });
    return IE._cong;
}
function ieComporCong(ctx, doc, R, cg) {
    const B = IE_CONG_BLOCO, o = { x: 0, y: 0 }, lista = [];
    // blocos da região que ainda não foram guardados: compõe uma vez o retângulo que os cobre e recorta em blocos
    let U = null;
    for (let by = Math.floor(R.y / B); by * B < R.y + R.h; by++) for (let bx = Math.floor(R.x / B); bx * B < R.x + R.w; bx++) {
        const k = bx + ',' + by;
        if (!cg.blocos.has(k)) { cg.blocos.set(k, null); U = ieRUniao(U, { x: bx * B, y: by * B, w: B, h: B }); }
        lista.push(k);
    }
    if (U && (U = ieRInter(U, ieRDoc(doc)))) {
        const partes = [[cg.plano.slice(0, cg.lo), 'ab']];
        if (cg.acimaOk) partes.push([cg.plano.slice(cg.hi + 1), 'ac']);
        for (const [camadas, lado] of partes) {
            const t = ieCanvas(U.w, U.h), tx = ieCtx(t);
            tx.setTransform(1, 0, 0, 1, -U.x, -U.y);
            ieComporLista(tx, camadas, U, { x: U.x, y: U.y }, 0);
            for (const [k, b] of cg.blocos) {
                if (b && b[lado]) continue;
                const [bx, by] = k.split(',').map(Number), X = bx * B, Y = by * B;
                if (X < U.x || Y < U.y || X >= U.x + U.w || Y >= U.y + U.h) continue;
                const c = ieCanvas(B, B);
                ieCtx(c).drawImage(t, X - U.x, Y - U.y, B, B, 0, 0, B, B);
                const blk = cg.blocos.get(k) || {}; blk[lado] = c; cg.blocos.set(k, blk);
            }
        }
    }
    const pinta = lado => { for (const k of lista) { const b = cg.blocos.get(k); if (b && b[lado]) { const [bx, by] = k.split(',').map(Number); ctx.drawImage(b[lado], bx * B, by * B); } } };
    pinta('ab');   // ctx já está recortado na região R
    ieComporLista(ctx, cg.plano.slice(cg.lo, cg.hi + 1), R, o, 0);
    if (cg.acimaOk) pinta('ac');
    else ieComporLista(ctx, cg.plano.slice(cg.hi + 1), R, o, 0);
}

// imagem achatada de uma lista de camadas num canvas novo do tamanho do documento
function ieAchatar(doc, lista = doc.camadas, R = ieRDoc(doc)) {
    const c = ieCanvas(R.w, R.h), ctx = ieCtx(c), B = IE_COMP_BLOCO;
    ctx.setTransform(1, 0, 0, 1, -R.x, -R.y);
    for (let y = R.y; y < R.y + R.h; y += B) for (let x = R.x; x < R.x + R.w; x += B) {   // em blocos (ver ieCompor)
        const Rb = { x, y, w: Math.min(B, R.x + R.w - x), h: Math.min(B, R.y + R.h - y) };
        ctx.save(); ctx.beginPath(); ctx.rect(Rb.x, Rb.y, Rb.w, Rb.h); ctx.clip();
        ieComporLista(ctx, lista, Rb, { x: R.x, y: R.y }, 10);
        ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return c;
}

// ─────────────────────────── agendamento de desenho ───────────────────────────
let ieQuadroPedido = false;
function ieAgendar(R, doc = IE.doc) {
    if (!doc) return;
    doc._sujo = R === undefined || R === null ? ieRDoc(doc) : (doc._sujo ? ieRUniao(doc._sujo, R) : R);
    ieQuadroPedir();
}
function ieQuadroPedir() {
    if (ieQuadroPedido) return;
    ieQuadroPedido = true;
    requestAnimationFrame(ieQuadro);
}
function ieQuadro() {
    ieQuadroPedido = false;
    const doc = IE.doc;
    let R = null;
    if (doc && doc._sujo) {
        R = doc._sujo;
        doc._sujo = null;
        try { ieCompor(doc, R); } catch (e) { console.error('[editor de imagem] compor', e); }
        ieMiniaturas?.();   // miniaturas acompanham a pintura (só as camadas que mudaram, com atraso)
    }
    // só um pedaço mudou e a vista é a mesma: redesenha só esse pedaço da tela (arrastar em tempo real num documento
    // grande: antes cada quadro reduzia a composição inteira — 15 MP no carrossel — e ficava em ~30 fps)
    if (R && doc && ieVistaParcialOk(doc, R)) { ieDesenharVistaParcial(doc, R); ieVistaFinal(); }
    else ieDesenharVista();
    ieDesenharSobre();
}
function ieVistaEstado(doc) {
    const c = ieEl('ie-canvas');
    return c && doc ? `${doc.id}|${doc.zoom}|${doc.px}|${doc.py}|${c.width}x${c.height}|${doc._verAchatado ? 1 : 0}` : '';
}
function ieVistaParcialOk(doc, R) {   // máscara/canal na tela: os envoltórios de ieDesenharVista desenham por cima
    return IE._vistaEst && IE._vistaEst === ieVistaEstado(doc) && R.w * R.h < doc.w * doc.h * 0.4 && !doc.verMascara && !doc.verCanal;
}
// fundo da vista (branco + xadrez e a sombra): em CSS por baixo do canvas, um quadro por prancheta (com pranchetas, fora
// delas é a área de montagem, sem xadrez). Pintado no canvas, o xadrez custava 10–30 ms por quadro de zoom/rolagem/arraste
// (PSB 2262×3449 com 4 pranchetas) e obrigava a vista inteira a cada quadro; em CSS o compositor desenha à parte.
function ieVistaFundo(doc) {
    const v = ieEl('ie-vista');
    if (!v) return;
    let f = v.querySelector(':scope > .ie-fundo');
    if (!f) { f = document.createElement('div'); f.className = 'ie-fundo'; v.insertBefore(f, v.firstChild); }
    const areas = !doc ? [] : doc.camadas.some(L => L.prancheta) ? doc.camadas.filter(L => L.prancheta && L.visivel).map(L => L.prancheta) : [{ x: 0, y: 0, w: doc.w, h: doc.h }];
    while (f.children.length > areas.length) f.lastChild.remove();
    while (f.children.length < areas.length) f.appendChild(document.createElement('i'));
    areas.forEach((P, i) => {
        const st = f.children[i].style, css = `left:${doc.px + P.x * doc.zoom}px;top:${doc.py + P.y * doc.zoom}px;width:${P.w * doc.zoom}px;height:${P.h * doc.zoom}px`;
        if (st.cssText !== css) st.cssText = css;
    });
}
function ieDesenharVistaParcial(doc, R) {
    const c = ieEl('ie-canvas'), ctx = ieCtx(c), dpr = window.devicePixelRatio || 1, s = doc.zoom * dpr;
    const dx = Math.round(doc.px * dpr), dy = Math.round(doc.py * dpr), dw = Math.round(doc.w * s), dh = Math.round(doc.h * s), kx = dw / doc.w, ky = dh / doc.h;
    let x0 = Math.floor(dx + (R.x - 2) * kx), y0 = Math.floor(dy + (R.y - 2) * ky), x1 = Math.ceil(dx + (R.x + R.w + 2) * kx), y1 = Math.ceil(dy + (R.y + R.h + 2) * ky);
    x0 = Math.max(x0, dx, 0); y0 = Math.max(y0, dy, 0); x1 = Math.min(x1, dx + dw, c.width); y1 = Math.min(y1, dy + dh, c.height);
    if (x1 <= x0 || y1 <= y0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);   // o xadrez fica por baixo, em CSS (ieVistaFundo)
    const fonte = doc._verAchatado && doc.achatadoC ? doc.achatadoC : doc.comp;
    ctx.imageSmoothingEnabled = !(Math.abs(s - 1) < 1e-3 || s >= 3 || (s > 1 && Math.abs(s - Math.round(s)) < 1e-3));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fonte, (x0 - dx) / kx, (y0 - dy) / ky, (x1 - x0) / kx, (y1 - y0) / ky, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
}
// parou de mexer: redesenha a vista inteira na qualidade máxima (redução em etapas, sem emendas)
function ieVistaFinal() {
    clearTimeout(IE._vistaT);
    IE._vistaT = setTimeout(() => {
        if (IE.mov || IE._zAnim || performance.now() - (IE._interagindo || 0) < 140) return ieVistaFinal();
        IE._vistaEst = null; IE._interagindo = 0; ieDesenharVista(); ieDesenharSobre();
    }, 180);
}
// mudou tudo (abrir, desfazer, mudar estrutura): compõe inteiro e redesenha painéis
function ieTudo(doc = IE.doc) {
    if (!doc) { ieDesenharVista(); ieDesenharSobre(); ieUiTudo?.(); return; }
    iePercorrer(doc.camadas, L => ieInvalidar(L));
    ieAgendar(null, doc);
    ieUiTudo?.();
}
// mudou uma camada: refaz só a região dela (antes e depois)
function ieCamadaMudou(L, Rantes, doc = IE.doc) {
    ieInvalidar(L);
    let R = Rantes || null;
    const r = L.tipo === 'grupo' || L.tipo === 'ajuste' ? ieRDoc(doc) : (ieRaster(L) ? ieRPlano(ieRaster(L)) : null);
    R = ieRUniao(R, r);
    ieAgendar(R || ieRDoc(doc), doc);
}
function ieRCamada(L) {   // região que a camada ocupa na tela (com efeitos)
    if (!L) return null;
    if (L.tipo === 'grupo') { let R = null; iePercorrer(L.filhos, x => { R = ieRUniao(R, ieRCamada(x)); }); return R; }
    if (L.tipo === 'ajuste') return IE.doc ? ieRDoc(IE.doc) : null;
    const r = ieRaster(L);
    return r ? ieRPlano(r) : null;
}

// ─────────────────────────── vista (zoom e rolagem) ───────────────────────────
// doc.zoom é em pixels de CSS; o que o usuário vê (e os passos) é em pixels da tela: zoom × devicePixelRatio.
// Assim "100%" é 1 pixel da imagem por pixel da tela, como no Photoshop (com a escala do Windows em 192%, o 100%
// antigo esticava 1,92× sem suavizar e serrilhava).
const ieDpr = () => window.devicePixelRatio || 1;
const ieZoomTela = (doc = IE.doc) => (doc ? doc.zoom * ieDpr() : 1);
function ieZoomReal(z, sx, sy) { ieZoomEm(z / ieDpr(), sx, sy); }
const IE_ZOOMS = [0.01, 0.02, 0.03, 0.05, 0.0667, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32];

function ieVistaTam() {
    const v = ieEl('ie-vista');
    return v ? { w: v.clientWidth, h: v.clientHeight } : { w: 800, h: 600 };
}
function ieAjustarVista(doc = IE.doc) {
    if (!doc) return;
    const { w, h } = ieVistaTam();
    const z = Math.min((w - 60) / doc.w, (h - 60) / doc.h, 1 / ieDpr());   // no máximo 100% (de verdade)
    doc.zoom = Math.max(0.01, z);
    doc.px = Math.round((w - doc.w * doc.zoom) / 2);
    doc.py = Math.round((h - doc.h * doc.zoom) / 2);
    ieDesenharVista(); ieDesenharSobre(); ieStatusRender?.();
}
function ieZoomEm(z, sx, sy, doc = IE.doc) {   // sx, sy = ponto da tela que fica parado
    if (!doc) return;
    z = ieClamp(z, 0.01, 32);
    const { w, h } = ieVistaTam();
    if (sx === undefined) { sx = w / 2; sy = h / 2; }
    const dx = (sx - doc.px) / doc.zoom, dy = (sy - doc.py) / doc.zoom;
    doc.zoom = z;
    doc.px = Math.round(sx - dx * z);
    doc.py = Math.round(sy - dy * z);
    ieDesenharVista(); ieDesenharSobre(); ieStatusRender?.();
}
function ieZoomPasso(dir, sx, sy) {
    const doc = IE.doc;
    if (!doc) return;
    const z = (IE._zAnim && IE._zAnim.doc === doc ? IE._zAnim.alvo : doc.zoom) * ieDpr();   // clique seguido: parte do alvo
    const prox = dir > 0 ? IE_ZOOMS.find(v => v > z * 1.001) : [...IE_ZOOMS].reverse().find(v => v < z / 1.001);
    if (prox) ieZoomSuave(prox / ieDpr(), sx, sy);
}
// zoom suave: anima até o alvo em escala logarítmica (~150 ms); pedidos no meio (roda do mouse) só mudam o alvo
function ieZoomSuave(z, sx, sy, doc = IE.doc) {
    if (!doc) return;
    const andando = IE._zAnim && IE._zAnim.doc === doc;
    IE._zAnim = { doc, alvo: ieClamp(z, 0.01, 32), sx, sy };
    if (andando) return;
    const passo = () => {
        const A = IE._zAnim;
        if (!A || A.doc !== IE.doc) { IE._zAnim = null; return; }
        const lz = Math.log(A.doc.zoom), la = Math.log(A.alvo);
        const nz = Math.abs(la - lz) < 0.003 ? A.alvo : Math.exp(lz + (la - lz) * 0.38);
        IE._interagindo = performance.now();
        ieZoomEm(nz, A.sx, A.sy, A.doc);
        if (nz === A.alvo) { IE._zAnim = null; ieVistaFinal(); } else requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
}
function ieTelaDoc(ev, doc = IE.doc) {
    const r = ieEl('ie-canvas').getBoundingClientRect();
    return { x: (ev.clientX - r.left - doc.px) / doc.zoom, y: (ev.clientY - r.top - doc.py) / doc.zoom, sx: ev.clientX - r.left, sy: ev.clientY - r.top };
}
const ieDocTela = (x, y, doc = IE.doc) => ({ x: doc.px + x * doc.zoom, y: doc.py + y * doc.zoom });

let ieXadrez = null;
function ieXadrezPadrao(ctx) {
    if (!ieXadrez) {
        const c = ieCanvas(16, 16), x = ieCtx(c);
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, 16, 16);
        x.fillStyle = '#cccccc'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
        ieXadrez = c;
    }
    return ctx.createPattern(ieXadrez, 'repeat');
}

function ieTamCanvas(c) {
    const v = ieEl('ie-vista');
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(v.clientWidth * dpr)), h = Math.max(1, Math.round(v.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return dpr;
}

function ieDesenharVista() {
    const c = ieEl('ie-canvas');
    if (!c || !ieAtivoVisivel()) return;
    const dpr = ieTamCanvas(c);
    const ctx = ieCtx(c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const doc = IE.doc;
    ieVistaFundo(doc);
    if (!doc) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fonte = doc._verAchatado && doc.achatadoC ? doc.achatadoC : doc.comp;
    ieDesenharNitido(ctx, fonte, doc, dpr);
    IE._vistaEst = ieVistaEstado(doc);
}

// a imagem na tela em pixels da tela (origem alinhada ao pixel): 1:1 sem reamostrar; ampliar por número inteiro ou
// muito (≥ 300%) sem suavizar (pixels nítidos, como no Photoshop); ampliar quebrado suavizado (sem escadinha);
// reduzir em etapas de metade (nítido, sem serrilhar)
function ieDesenharNitido(ctx, fonte, doc, dpr) {
    const s = doc.zoom * dpr;
    const dx = Math.round(doc.px * dpr), dy = Math.round(doc.py * dpr);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (Math.abs(s - 1) < 1e-3) { ctx.imageSmoothingEnabled = false; ctx.drawImage(fonte, dx, dy); ctx.restore(); return; }
    const dw = Math.round(doc.w * s), dh = Math.round(doc.h * s);
    if (s > 1) {
        ctx.imageSmoothingEnabled = !(s >= 3 || Math.abs(s - Math.round(s)) < 1e-3);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(fonte, dx, dy, dw, dh);
        ctx.restore();
        return;
    }
    // zoom/rolagem em andamento: qualidade rápida (e a redução guardada mais perto); parou → ieVistaFinal refaz em alta
    const rapido = performance.now() - (IE._interagindo || 0) < 140;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = rapido ? 'low' : 'high';
    ctx.drawImage(rapido && s < 0.5 ? ieMipmap(fonte, doc, s * 2) : ieMipmap(fonte, doc, s), dx, dy, dw, dh);
    ctx.restore();
    if (rapido) ieVistaFinal();
}
// reduções pela metade da composição, guardadas até ela mudar (doc._compV)
function ieMipmap(fonte, doc, s) {
    if (s >= 0.5) return fonte;
    const chave = (fonte === doc.comp ? 'c' + (doc._compV || 0) : 'a') + ':' + fonte.width;
    if (!doc._mip || doc._mip.chave !== chave) doc._mip = { chave, niveis: [fonte] };
    const nv = doc._mip.niveis;
    let k = 0;
    while (s * Math.pow(2, k + 1) <= 1 && nv[k].width > 2 && nv[k].height > 2) {
        if (!nv[k + 1]) {
            const a = nv[k], n = ieCanvas(Math.ceil(a.width / 2), Math.ceil(a.height / 2)), x = ieCtx(n);
            x.imageSmoothingQuality = 'high';
            x.drawImage(a, 0, 0, n.width, n.height);
            nv[k + 1] = n;
        }
        k++;
    }
    return nv[k];
}

// camada de cima: seleção, alças, cursor do pincel, prévias das ferramentas
let ieFormigas = 0;
function ieDesenharSobre() {
    const c = ieEl('ie-sobre');
    if (!c || !ieAtivoVisivel()) return;
    const dpr = ieTamCanvas(c);
    const ctx = ieCtx(c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const doc = IE.doc;
    if (!doc) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (doc.sel && doc.sel.contorno && !doc._esconderSel) {
        ctx.save();
        ctx.translate(doc.px, doc.py);
        ctx.scale(doc.zoom, doc.zoom);
        ctx.lineWidth = 1 / doc.zoom;
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([]);
        ctx.stroke(doc.sel.contorno);
        ctx.strokeStyle = '#000';
        ctx.setLineDash([4 / doc.zoom, 4 / doc.zoom]);
        ctx.lineDashOffset = -ieFormigas / doc.zoom;
        ctx.stroke(doc.sel.contorno);
        ctx.restore();
    }
    const f = IE.transf ? null : IE_FERR?.[IE.ferrTemp || IE.ferr];
    try { f?.sobre?.(ctx, doc); } catch (e) { console.error(e); }
    IE.transf && ieTransfSobre?.(ctx, doc);
    if (typeof ieGISobre === 'function') ieGISobre(ctx, doc);   // guias inteligentes (imagem-guias.js)
}
setInterval(() => {
    const d = IE.doc;
    if (d && d.sel && ieAtivoVisivel() && !document.hidden) { ieFormigas = (ieFormigas + 1) % 8; ieDesenharSobre(); }
}, 140);

function ieAtivoVisivel() { return !!ieEl('page-editor-imagem')?.classList.contains('active'); }

// ─────────────────────────── seleção ───────────────────────────
// doc.sel = {c: canvas do tamanho do documento (alfa = seleção), bbox, contorno: Path2D, forma?}
function ieSelNova(doc) { return ieCanvas(doc.w, doc.h); }

// op: 'nova' | 'somar' | 'subtrair' | 'cruzar'; desenhar(ctx) pinta a forma em branco
function ieSelAplicar(doc, desenhar, op = 'nova', forma = null, suav = 0) {
    const s = ieSelNova(doc), sc = ieCtx(s);
    sc.fillStyle = '#fff';
    sc.strokeStyle = '#fff';
    desenhar(sc);
    if (suav > 0) {
        const b = ieCanvas(doc.w, doc.h), bc = ieCtx(b);
        bc.filter = `blur(${suav / 2}px)`;
        bc.drawImage(s, 0, 0);
        sc.clearRect(0, 0, doc.w, doc.h);
        sc.drawImage(b, 0, 0);
        forma = null;
    }
    let c;
    if (op === 'nova' || !doc.sel) {
        if (op === 'subtrair' || op === 'cruzar') { if (!doc.sel) return; }
        c = s;
    } else {
        c = ieClonar(doc.sel.c);
        const x = ieCtx(c);
        x.globalCompositeOperation = op === 'somar' ? 'source-over' : op === 'subtrair' ? 'destination-out' : 'destination-in';
        x.drawImage(s, 0, 0);
        forma = null;
    }
    ieSelDefinir(doc, c, forma);
}

function ieSelDefinir(doc, c, forma = null) {
    if (!c) { doc.sel = null; ieDesenharSobre(); return; }
    const b = ieLimites(c);
    if (!b) { doc.sel = null; ieDesenharSobre(); return; }
    doc.sel = { c, bbox: b, forma };
    ieSelContorno(doc);
    ieDesenharSobre();
}

// contorno das formigas: bordas entre pixels dentro (alfa >= 128) e fora
function ieSelContorno(doc) {
    const s = doc.sel;
    if (!s) return;
    const p = new Path2D();
    if (s.forma && s.forma.t === 'ret') { const f = s.forma; p.rect(f.x, f.y, f.w, f.h); s.contorno = p; return; }
    if (s.forma && s.forma.t === 'eli') { const f = s.forma; p.ellipse(f.x + f.w / 2, f.y + f.h / 2, Math.abs(f.w / 2), Math.abs(f.h / 2), 0, 0, Math.PI * 2); s.contorno = p; return; }
    const b = s.bbox, W = b.w + 2, H = b.h + 2;
    const d = ieCtx(s.c).getImageData(b.x - 1, b.y - 1, W, H).data;
    const dentro = (x, y) => d[(y * W + x) * 4 + 3] >= 128;
    // bordas horizontais (entre a linha y-1 e y), em trechos contínuos
    for (let y = 1; y < H; y++) {
        let ini = -1;
        for (let x = 0; x <= W; x++) {
            const borda = x < W && dentro(x, y - 1) !== dentro(x, y);
            if (borda && ini < 0) ini = x;
            if (!borda && ini >= 0) { p.moveTo(b.x - 1 + ini, b.y - 1 + y); p.lineTo(b.x - 1 + x, b.y - 1 + y); ini = -1; }
        }
    }
    for (let x = 1; x < W; x++) {
        let ini = -1;
        for (let y = 0; y <= H; y++) {
            const borda = y < H && dentro(x - 1, y) !== dentro(x, y);
            if (borda && ini < 0) ini = y;
            if (!borda && ini >= 0) { p.moveTo(b.x - 1 + x, b.y - 1 + ini); p.lineTo(b.x - 1 + x, b.y - 1 + y); ini = -1; }
        }
    }
    s.contorno = p;
}

function ieSelTudo() {
    const d = IE.doc; if (!d) return;
    ieSelAplicar(d, x => x.fillRect(0, 0, d.w, d.h), 'nova', { t: 'ret', x: 0, y: 0, w: d.w, h: d.h });
    ieHist('Selecionar tudo');
}
function ieSelNada() {
    const d = IE.doc; if (!d || !d.sel) return;
    d.selAnterior = d.sel;   // Selecionar novamente (Shift+Ctrl+D)
    d.sel = null; ieDesenharSobre(); ieHist('Desmarcar');
}
function ieSelInverter() {
    const d = IE.doc; if (!d) return;
    const c = ieSelNova(d), x = ieCtx(c);
    x.fillStyle = '#fff';
    x.fillRect(0, 0, d.w, d.h);
    if (d.sel) { x.globalCompositeOperation = 'destination-out'; x.drawImage(d.sel.c, 0, 0); }
    ieSelDefinir(d, c);
    ieHist('Inverter seleção');
}
// recorte (alfa) da seleção num retângulo do documento; null = sem seleção (tudo liberado)
function ieSelRegiao(doc, R) {
    if (!doc.sel) return null;
    const c = ieCanvas(R.w, R.h);
    ieCtx(c).drawImage(doc.sel.c, -R.x, -R.y);
    return c;
}

// ─────────────────────────── estrutura (camadas) ───────────────────────────
function ieInserirAcima(doc, L, ref) {
    // insere L logo acima de ref (ou no topo da raiz); grupo selecionado aberto = dentro dele, no topo
    const alvo = ref ? ieAchar(doc, ref.id) : null;
    if (alvo && alvo.L.tipo === 'grupo' && alvo.L.aberto && alvo.L.filhos) alvo.L.filhos.push(L);
    else if (alvo) alvo.lista.splice(alvo.i + 1, 0, L);
    else doc.camadas.push(L);
    doc.ativa = L.id;
    doc.selIds = [L.id];
    doc.mascaraAlvo = false;
}
function ieNomeLivre(doc, base) {
    const nomes = new Set(ieTodas(doc).map(L => L.nome));
    let n = 1;
    while (nomes.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
}

function ieAtivar(id, doc = IE.doc, { somar = false, faixa = false } = {}) {
    if (!doc) return;
    ieTextoEncerrar?.(true);
    if (somar) {
        const i = doc.selIds.indexOf(id);
        if (i >= 0 && doc.selIds.length > 1) { doc.selIds.splice(i, 1); doc.ativa = doc.selIds[doc.selIds.length - 1]; }
        else { if (!doc.selIds.length && doc.ativa != null) doc.selIds = [doc.ativa]; doc.selIds.push(id); doc.ativa = id; }
    } else if (faixa && doc.ativa != null) {
        const ordem = ieTodas(doc).map(L => L.id);
        const a = ordem.indexOf(doc.ativa), b = ordem.indexOf(id);
        doc.selIds = ordem.slice(Math.min(a, b), Math.max(a, b) + 1);
        doc.ativa = id;
    } else { doc.ativa = id; doc.selIds = [id]; }
    const L = ieAtiva(doc);
    doc.mascaraAlvo = !!(L && L.m && doc.mascaraAlvo && doc.selIds.length === 1);
    doc._revelarCamada = doc.ativa;
    ieUiCamadas?.();
    ieDesenharSobre();   // caixa de controles da ferramenta Mover
}

function ieLimparCamadas(doc = IE.doc) {
    if (!doc || (doc.ativa == null && !doc.selIds.length && !doc.mascaraAlvo)) return false;
    ieTextoEncerrar?.(true);
    doc.ativa = null;
    doc.selIds = [];
    doc.mascaraAlvo = false;
    ieUiCamadas?.();
    ieOpcoesRender?.();
    ieDesenharSobre();
    return true;
}

// ─────────────────────────── eventos da vista ───────────────────────────
IE.ponteiro = null;   // {id, ferr}
IE.espaco = false;

// Exibir > Ajustar: o ponteiro das ferramentas de retângulo encaixa nas guias/camadas/fatias (imagem-guias.js)
function ieAjustarPt(p, f) { return typeof ieAjustarPonto === 'function' ? ieAjustarPonto(p, f) : p; }
function ieFerrAtual() {
    if (IE.transf && !IE.ferrTemp) return IE_TRANSF;
    return IE_FERR[IE.ferrTemp || IE.ferr];
}

function ieInstalarVista() {
    const vista = ieEl('ie-vista'), c = ieEl('ie-canvas');
    if (!vista || !c || vista._ok) return;
    vista._ok = true;
    const sobre = document.createElement('canvas');
    sobre.id = 'ie-sobre';
    sobre.className = 'ie-sobre';
    c.after(sobre);
    new ResizeObserver(() => { ieDesenharVista(); ieDesenharSobre(); }).observe(vista);

    sobre.addEventListener('pointerdown', ev => {
        const doc = IE.doc;
        if (!doc) return;
        // Alt + botão direito no pincel: ajuste de tamanho, não o conta-gotas temporário do Alt
        if (ev.button === 2 && ev.altKey && IE.ferrTemp === 'contagotas' && IE_FERR[IE.ferr]?.rightDown) IE.ferrTemp = null;
        const f0 = ieFerrAtual();
        if (ev.button === 2 && f0?.rightDown) {
            ev.preventDefault();
            IE._ctxBloqueado = true;
            ieEl('ie')?.focus({ preventScroll: true });
            sobre.setPointerCapture(ev.pointerId);
            IE.ponteiro = { id: ev.pointerId, f: f0, ini: ieTelaDoc(ev), direito: true };
            IE._ajCache = null;
            try { f0.rightDown(ieAjustarPt(ieTelaDoc(ev), f0), ev, doc); } catch (e) { console.error('[editor de imagem]', e); IE.ponteiro = null; }
            ieCursor(ev);
            return;
        }
        if (ev.button === 1 || (ev.button === 0 && IE.espaco)) { IE.ferrTemp = 'mao'; }
        else if (ev.button !== 0) return;
        ev.preventDefault();
        ieEl('ie')?.focus({ preventScroll: true });
        sobre.setPointerCapture(ev.pointerId);
        const f = ieFerrAtual();
        IE.ponteiro = { id: ev.pointerId, f, ini: ieTelaDoc(ev) };
        IE._ajCache = null;
        try { f?.down?.(ieAjustarPt(ieTelaDoc(ev), f), ev, doc); } catch (e) { console.error('[editor de imagem]', e); IE.ponteiro = null; }
        ieCursor(ev);
    });
    sobre.addEventListener('pointermove', ev => {
        const doc = IE.doc;
        if (!doc) return;
        const p = ieTelaDoc(ev);
        IE.mouse = p;
        ieStatusMouse?.(p);
        if (IE.ponteiro && IE.ponteiro.id === ev.pointerId) {
            const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
            const acao = IE.ponteiro.direito && IE.ponteiro.f?.rightMove ? IE.ponteiro.f.rightMove : IE.ponteiro.f?.move;
            try { for (const e of (evs.length ? evs : [ev])) acao?.call(IE.ponteiro.f, ieAjustarPt(ieTelaDoc(e), IE.ponteiro.f), e, doc); } catch (e) { console.error('[editor de imagem]', e); }
        } else ieFerrAtual()?.hover?.(p, ev, doc);
        ieCursor(ev);
        if (ieFerrAtual()?.cursorPincel) ieDesenharSobre();
    });
    const fim = ev => {
        const doc = IE.doc;
        if (!IE.ponteiro || IE.ponteiro.id !== ev.pointerId) return;
        const f = IE.ponteiro.f;
        const direito = IE.ponteiro.direito;
        IE.ponteiro = null;
        const acao = direito && f?.rightUp ? f.rightUp : f?.up;
        try { acao?.call(f, ieAjustarPt(ieTelaDoc(ev), f), ev, doc); } catch (e) { console.error('[editor de imagem]', e); }
        if (IE.ferrTemp === 'mao' && !IE.espaco) IE.ferrTemp = null;
        ieCursor(ev);
    };
    sobre.addEventListener('pointerup', fim);
    sobre.addEventListener('pointercancel', fim);
    sobre.addEventListener('pointerleave', () => { IE.mouse = null; ieDesenharSobre(); });
    sobre.addEventListener('dblclick', ev => { const doc = IE.doc; if (doc) ieFerrAtual()?.dbl?.(ieTelaDoc(ev), ev, doc); });
    sobre.addEventListener('wheel', ev => {
        const doc = IE.doc;
        if (!doc) return;
        ev.preventDefault();
        const p = ieTelaDoc(ev);
        if (ev.ctrlKey || ev.altKey) {
            const f = Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.0018));
            const base = IE._zAnim && IE._zAnim.doc === doc ? IE._zAnim.alvo : doc.zoom;
            ieZoomSuave(base * f, p.sx, p.sy);   // roda anima até o alvo (sem degraus)
        } else {
            IE._interagindo = performance.now();
            const k = ev.deltaMode ? 30 : 1;
            if (ev.shiftKey) doc.px -= (ev.deltaY || ev.deltaX) * k;
            else { doc.px -= ev.deltaX * k; doc.py -= ev.deltaY * k; }
            ieDesenharVista(); ieDesenharSobre();
        }
    }, { passive: false });
    sobre.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        if (IE._ctxBloqueado) { IE._ctxBloqueado = false; return; }
        if (IE.transf && typeof ieTransfMenuContexto === 'function') return ieTransfMenuContexto(ev);
        ieMenuContexto?.(ev);
    });
}

function ieCursor(ev) {
    const s = ieEl('ie-sobre');
    if (!s) return;
    const f = ieFerrAtual();
    let cur = 'default';
    if (IE.ferrTemp === 'mao' || IE.espaco) cur = IE.ponteiro ? 'grabbing' : 'grab';
    else if (f) cur = typeof f.cursor === 'function' ? f.cursor(ev) : (f.cursor || 'default');
    if (s.style.cursor !== cur) s.style.cursor = cur;
}
