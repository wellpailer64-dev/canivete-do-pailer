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
        mover: { auto: true, controles: true },
        letreiro: { forma: 'ret', suav: 0 },
        laco: { modo: 'livre', suav: 0 },
        varinha: { tol: 32, contiguo: true, todas: false },
        corte: { apagar: false },
        contagotas: { todas: true },
        carimbo: { tam: 60, dureza: 50, opac: 100, fluxo: 100, alinhado: true, todas: false },
        pincel: { tam: 30, dureza: 80, opac: 100, fluxo: 100 },
        borracha: { tam: 40, dureza: 80, opac: 100, fluxo: 100 },
        degrade: { tipo: 'linear', cores: 'frente-fundo', opac: 100, inverter: false },
        balde: { tol: 32, contiguo: true, todas: false, opac: 100 },
        texto: { fonte: 'Arial', gdi: 'Arial', peso: 400, ital: false, tam: 72, alin: 'left', esp: 0, ent: 0 },
        forma: { tipo: 'ret', raio: 0, contorno: 0 },
        mao: {}, zoom: {},
    },
};

// ─────────────────────────── utilidades ───────────────────────────
const ieEl = id => document.getElementById(id);
const ieT = s => (typeof veT === 'function' ? veT(s) : s);
const ieClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ieEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ieCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
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
    L._raster = null;
    L._v = (L._v || 0) + 1;
    L._thumbV = -1;
}
function ieMudouDoc(doc = IE.doc) {
    if (!doc) return;
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
const IE_HIST_MAX = 60, IE_HIST_BYTES = 1.6e9;
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
        fatias: (doc.fatias || []).map(f => ({ ...f })), fatiaSel: doc.fatiaSel,
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
    let bytes = 0;
    const vistos = new Set();
    const conta = lista => lista.forEach(s => {
        for (const c of [s.c, s.m && s.m.c]) if (c && !vistos.has(c)) { vistos.add(c); bytes += c.width * c.height * 4; }
        if (s.filhos) conta(s.filhos);
    });
    for (let i = h.itens.length - 1; i >= 0; i--) {
        conta(h.itens[i].foto.camadas);
        if (bytes > IE_HIST_BYTES && i > 0 && i < h.i) { h.itens.splice(1, i); h.i -= i; break; }
    }
    if (nome !== 'Abrir' && nome !== 'Novo') ieMudouDoc(doc);
    ieHistRender?.();
}

function ieIrHist(i, doc = IE.doc) {
    if (!doc) return;
    const h = doc.hist;
    if (i < 0 || i >= h.itens.length || i === h.i) return;
    ieTextoEncerrar?.(true);
    ieFerrCancelar?.();
    const f = h.itens[i].foto;
    h.i = i;
    const mudouTam = f.w !== doc.w || f.h !== doc.h;
    doc.w = f.w; doc.h = f.h;
    doc.camadas = ieRestaurarCamadas(f.camadas);
    doc.ativa = f.ativa; doc.selIds = [...f.selIds]; doc.mascaraAlvo = !!f.mascaraAlvo;
    doc.fatias = (f.fatias || []).map(x => ({ ...x })); doc.fatiaSel = f.fatiaSel ?? null;
    doc.sel = f.sel ? { c: f.sel.c, bbox: { ...f.sel.bbox }, forma: f.sel.forma } : null;
    if (doc.sel) ieSelContorno(doc);
    if (mudouTam) { doc.comp = ieCanvas(doc.w, doc.h); ieAjustarVista(doc); }
    ieMudouDoc(doc);
    ieTudo(doc);
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
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.filter = 'none';
    x.clearRect(0, 0, w, h);
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
function ieTemFx(fx) { return !!(fx && (fx.sombra || fx.brilho || fx.contorno || fx.sobreposicao)); }

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

// pixels finais da camada (máscara, preenchimento e efeitos), guardados até a camada mudar
function ieRaster(L) {
    const src = L._tfPrev || (L.c ? { c: L.c, x: L.x, y: L.y } : null);
    if (!src || !src.c) return null;
    if (L._raster && L._raster.src === src.c) return L._raster;
    const mask = L.m && !L.m.desativada ? L.m : null;
    const fx = L.fxOculto ? null : (ieTemFx(L.fx) ? L.fx : null);
    if (!mask && !fx && L.fill >= 1) return src;
    const w = src.c.width, h = src.c.height;
    let base = src.c;
    if (mask) {
        base = ieCanvas(w, h);
        const x = ieCtx(base);
        x.drawImage(src.c, 0, 0);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(ieMascaraRegiao(mask, { x: src.x, y: src.y, w, h }), 0, 0);
    }
    if (!fx) {
        const c = ieCanvas(w, h), x = ieCtx(c);
        x.globalAlpha = L.fill;
        x.drawImage(base, 0, 0);
        return (L._raster = { c, x: src.x, y: src.y, src: src.c });
    }
    // margem para sombra, brilho e traçado
    const s = fx.sombra, g = fx.brilho, t = fx.contorno, o = fx.sobreposicao;
    let mg = 2;
    if (s) mg = Math.max(mg, Math.ceil((s.tam || 0) * 1.5 + (s.dist || 0)) + 4);
    if (g) mg = Math.max(mg, Math.ceil((g.tam || 0) * 1.5) + 4);
    if (t) mg = Math.max(mg, Math.ceil(t.larg || 0) + 3);
    const F = ieCanvas(w + 2 * mg, h + 2 * mg), fc = ieCtx(F);
    const longe = 20000;
    const sombra = (cor, op, blur, dx, dy) => {
        fc.save();
        fc.shadowColor = ieRgba(cor, op);
        fc.shadowBlur = blur;
        fc.shadowOffsetX = dx + longe;
        fc.shadowOffsetY = dy;
        fc.drawImage(base, mg - longe, mg);
        fc.restore();
    };
    if (s) {
        const ang = (s.ang ?? 120) * Math.PI / 180, d = s.dist || 0;
        sombra(s.cor || '#000', (s.op ?? 75) / 100, s.tam || 0, -Math.cos(ang) * d, Math.sin(ang) * d);
    }
    if (g) { sombra(g.cor || '#ffffbe', (g.op ?? 75) / 100, g.tam || 0, 0, 0); }
    if (t && t.larg > 0) {
        // traçado por fora: silhueta repetida em volta (dilatação)
        const r = t.pos && t.pos.includes('inside') ? 0 : (t.pos && t.pos.includes('center') ? t.larg / 2 : t.larg);
        if (r > 0) {
            const sil = ieSilhueta(base, t.cor || '#000');
            const tc = ieCanvas(F.width, F.height), tx = ieCtx(tc);
            const passos = Math.max(8, Math.ceil(2 * Math.PI * r / 1.5));
            for (let raio = r; raio > 0; raio -= Math.max(1, r / 3)) {
                for (let k = 0; k < passos; k++) {
                    const a = k / passos * Math.PI * 2;
                    tx.drawImage(sil, mg + Math.cos(a) * raio, mg + Math.sin(a) * raio);
                }
            }
            fc.globalAlpha = (t.op ?? 100) / 100;
            fc.drawImage(tc, 0, 0);
            fc.globalAlpha = 1;
        }
    }
    let px = base;
    if (o) {
        px = ieCanvas(w, h);
        const x = ieCtx(px);
        x.drawImage(base, 0, 0);
        x.globalCompositeOperation = 'source-atop';
        x.globalAlpha = (o.op ?? 100) / 100;
        x.fillStyle = o.cor || '#000';
        x.fillRect(0, 0, w, h);
    }
    fc.globalAlpha = L.fill;
    fc.drawImage(px, mg, mg);
    fc.globalAlpha = 1;
    if (t && t.larg > 0 && t.pos && t.pos.includes('inside')) {
        // traçado por dentro: borda da silhueta por cima dos pixels
        const sil = ieSilhueta(base, t.cor || '#000', (t.op ?? 100) / 100);
        const ero = ieCanvas(w, h), ex = ieCtx(ero);
        ex.drawImage(base, 0, 0);
        const passos = Math.max(8, Math.ceil(2 * Math.PI * t.larg / 1.5));
        ex.globalCompositeOperation = 'destination-in';
        for (let k = 0; k < passos; k++) {
            const a = k / passos * Math.PI * 2;
            ex.drawImage(base, Math.cos(a) * t.larg, Math.sin(a) * t.larg);
        }
        const sx = ieCtx(sil);
        sx.globalCompositeOperation = 'destination-out';
        sx.drawImage(ero, 0, 0);
        fc.drawImage(sil, mg, mg);
    }
    return (L._raster = { c: F, x: src.x - mg, y: src.y - mg, src: src.c });
}

// o = deslocamento do contexto: ponto (X, Y) do documento cai em (X - o.x, Y - o.y) no canvas
function ieComporLista(ctx, lista, R, o, prof) {
    for (let i = 0; i < lista.length; i++) {
        const L = lista[i];
        let j = i + 1;
        if (!L.clip) while (j < lista.length && lista[j].clip) j++;
        if (L.visivel) {
            const clipados = lista.slice(i + 1, j).filter(c => c.visivel);
            if (clipados.length && L.tipo !== 'ajuste') ieComporCorte(ctx, L, clipados, R, o, prof);
            else ieComporCamada(ctx, L, R, o, prof);
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

function ieComporCamada(ctx, L, R, o, prof, forcarNormal) {
    if (L.tipo === 'grupo') {
        const mask = L.m && !L.m.desativada ? L.m : null;
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
    ctx.save();
    ctx.globalAlpha = forcarNormal ? 1 : L.op;
    ctx.globalCompositeOperation = forcarNormal ? 'source-over' : ieGco(L.bm);
    ctx.drawImage(r.c, r.x, r.y);
    ctx.restore();
}

// base + camadas com máscara de corte: compostas à parte e limitadas ao alfa da base
function ieComporCorte(ctx, base, clipados, R, o, prof) {
    const t = ieTemp(prof + 1, R.w, R.h), tc = ieCtx(t);
    tc.setTransform(1, 0, 0, 1, -R.x, -R.y);
    ieComporCamada(tc, base, R, { x: R.x, y: R.y }, prof + 3, true);
    const b = ieTemp(prof + 2, R.w, R.h), bc = ieCtx(b);
    bc.drawImage(t, 0, 0, R.w, R.h, 0, 0, R.w, R.h);
    for (const c of clipados) ieComporCamada(tc, c, R, { x: R.x, y: R.y }, prof + 3);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(b, 0, 0, R.w, R.h, 0, 0, R.w, R.h);
    tc.globalCompositeOperation = 'source-over';
    ieDesenhar(ctx, t, 0, 0, R.w, R.h, R.x, R.y, base.op, ieGco(base.bm));
}

function ieComporAjuste(ctx, L, R, o, prof) {
    if (!L.ajuste || typeof ieAjustar !== 'function') return;
    const x0 = R.x - o.x, y0 = R.y - o.y;
    let img;
    try { img = ctx.getImageData(x0, y0, R.w, R.h); } catch (e) { return; }
    ieAjustar(img.data, L.ajuste);
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

function ieCompor(doc, R) {
    R = ieRInter(ieRInt(R || ieRDoc(doc)), ieRDoc(doc));
    if (!R) return;
    if (doc.comp.width !== doc.w || doc.comp.height !== doc.h) doc.comp = ieCanvas(doc.w, doc.h);
    const ctx = ieCtx(doc.comp);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(R.x, R.y, R.w, R.h);
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    ieComporLista(ctx, doc.camadas, R, { x: 0, y: 0 }, 0);
    ctx.restore();
}

// imagem achatada de uma lista de camadas num canvas novo do tamanho do documento
function ieAchatar(doc, lista = doc.camadas, R = ieRDoc(doc)) {
    const c = ieCanvas(R.w, R.h), ctx = ieCtx(c);
    ctx.setTransform(1, 0, 0, 1, -R.x, -R.y);
    ieComporLista(ctx, lista, R, { x: R.x, y: R.y }, 10);
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
    if (doc && doc._sujo) {
        const R = doc._sujo;
        doc._sujo = null;
        try { ieCompor(doc, R); } catch (e) { console.error('[editor de imagem] compor', e); }
        ieMiniaturas?.();   // miniaturas acompanham a pintura (só as camadas que mudaram, com atraso)
    }
    ieDesenharVista();
    ieDesenharSobre();
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
const IE_ZOOMS = [0.01, 0.02, 0.03, 0.05, 0.0667, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32];

function ieVistaTam() {
    const v = ieEl('ie-vista');
    return v ? { w: v.clientWidth, h: v.clientHeight } : { w: 800, h: 600 };
}
function ieAjustarVista(doc = IE.doc) {
    if (!doc) return;
    const { w, h } = ieVistaTam();
    const z = Math.min((w - 60) / doc.w, (h - 60) / doc.h, 1);
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
    const z = doc.zoom;
    const prox = dir > 0 ? IE_ZOOMS.find(v => v > z * 1.001) : [...IE_ZOOMS].reverse().find(v => v < z / 1.001);
    if (prox) ieZoomEm(prox, sx, sy);
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
    if (!doc) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = doc.px, y = doc.py, w = doc.w * doc.zoom, h = doc.h * doc.zoom;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.fillStyle = ieXadrezPadrao(ctx);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.imageSmoothingEnabled = doc.zoom < 1;
    ctx.imageSmoothingQuality = 'high';
    const fonte = doc._verAchatado && doc.achatadoC ? doc.achatadoC : doc.comp;
    ctx.drawImage(fonte, x, y, w, h);
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
    ieUiCamadas?.();
    ieDesenharSobre();   // caixa de controles da ferramenta Mover
}

// ─────────────────────────── eventos da vista ───────────────────────────
IE.ponteiro = null;   // {id, ferr}
IE.espaco = false;

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
        if (ev.button === 1 || (ev.button === 0 && IE.espaco)) { IE.ferrTemp = 'mao'; }
        else if (ev.button !== 0) return;
        ev.preventDefault();
        ieEl('ie')?.focus({ preventScroll: true });
        sobre.setPointerCapture(ev.pointerId);
        const f = ieFerrAtual();
        IE.ponteiro = { id: ev.pointerId, f, ini: ieTelaDoc(ev) };
        try { f?.down?.(ieTelaDoc(ev), ev, doc); } catch (e) { console.error('[editor de imagem]', e); IE.ponteiro = null; }
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
            try { for (const e of (evs.length ? evs : [ev])) IE.ponteiro.f?.move?.(ieTelaDoc(e), e, doc); } catch (e) { console.error('[editor de imagem]', e); }
        } else ieFerrAtual()?.hover?.(p, ev, doc);
        ieCursor(ev);
        if (ieFerrAtual()?.cursorPincel) ieDesenharSobre();
    });
    const fim = ev => {
        const doc = IE.doc;
        if (!IE.ponteiro || IE.ponteiro.id !== ev.pointerId) return;
        const f = IE.ponteiro.f;
        IE.ponteiro = null;
        try { f?.up?.(ieTelaDoc(ev), ev, doc); } catch (e) { console.error('[editor de imagem]', e); }
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
            ieZoomEm(doc.zoom * f, p.sx, p.sy);
        } else {
            const k = ev.deltaMode ? 30 : 1;
            if (ev.shiftKey) doc.px -= (ev.deltaY || ev.deltaX) * k;
            else { doc.px -= ev.deltaX * k; doc.py -= ev.deltaY * k; }
            ieDesenharVista(); ieDesenharSobre();
        }
    }, { passive: false });
    sobre.addEventListener('contextmenu', ev => { ev.preventDefault(); ieMenuContexto?.(ev); });
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
