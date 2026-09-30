// =========================================================
// Pocket Editor — efeitos (painel "Efeitos" e a parte de efeitos do "Controles de efeito")
// Cada clipe guarda c.fx = [{id, t, on, v: {parâmetro: valor}}], aplicados de cima para baixo no
// tamanho original da mídia, ANTES de escala/posição/rotação/opacidade (como no Premiere).
// Efeito novo: acrescente em VE_FX (parâmetros + draw da prévia) e em _filtros_fx (Functions/video_cutter.py).
// A prévia e a exportação precisam fazer a mesma conta.
// =========================================================

const VE_KEY_PADRAO = '#00b140';   // verde de chroma key (Chroma Key, mais abaixo)

const VE_FX = {
    blur: {
        nome: 'Desfoque gaussiano', cat: 'Desfoque e nitidez', tag: 'Blur',
        params: [{ k: 'amt', nome: 'Desfoque', min: 0, max: 100, step: 0.5, def: 20, un: '%' }],
        neutro: v => !(v.amt > 0),
        // 100% = sigma de 5% do lado menor da mídia; bordas repetidas (não escurecem, igual ao ffmpeg gblur)
        draw(a, v, env) {
            const sp = v.amt * Math.min(env.mw, env.mh) / 2000 * env.q;
            if (sp < 0.05) return a;
            const p = Math.ceil(sp * 3) + 1, { w, h } = env;
            const P = veFxCanvas(2, w + 2 * p, h + 2 * p), x = P.ctx, s = a.cv;
            x.clearRect(0, 0, w + 2 * p, h + 2 * p);
            x.drawImage(s, p, p);
            x.drawImage(s, 0, 0, 1, h, 0, p, p, h);              // esquerda
            x.drawImage(s, w - 1, 0, 1, h, p + w, p, p, h);      // direita
            x.drawImage(s, 0, 0, w, 1, p, 0, w, p);              // cima
            x.drawImage(s, 0, h - 1, w, 1, p, p + h, w, p);      // baixo
            x.drawImage(s, 0, 0, 1, 1, 0, 0, p, p);              // cantos
            x.drawImage(s, w - 1, 0, 1, 1, p + w, 0, p, p);
            x.drawImage(s, 0, h - 1, 1, 1, 0, p + h, p, p);
            x.drawImage(s, w - 1, h - 1, 1, 1, p + w, p + h, p, p);
            const b = veFxOther(a, w, h);
            b.ctx.clearRect(0, 0, w, h);
            b.ctx.filter = `blur(${sp}px)`;
            b.ctx.drawImage(P.cv, -p, -p);
            b.ctx.filter = 'none';
            return b;
        },
    },
    bc: {
        nome: 'Brilho e contraste', cat: 'Correção de cor', tag: 'Cor',
        params: [
            { k: 'br', nome: 'Brilho', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'ct', nome: 'Contraste', min: -100, max: 100, step: 1, def: 0, un: '' },
        ],
        neutro: v => !v.br && !v.ct,
        draw(a, v, env) {
            const b = veFxOther(a, env.w, env.h);
            b.ctx.clearRect(0, 0, env.w, env.h);
            b.ctx.filter = `brightness(${1 + (v.br || 0) / 100}) contrast(${1 + (v.ct || 0) / 100})`;
            b.ctx.drawImage(a.cv, 0, 0);
            b.ctx.filter = 'none';
            return b;
        },
    },
    // Luz e Cor: editado no painel próprio (editor-lc.js); a parte de cor vai para a exportação como LUT 3D
    lc: {
        nome: 'Luz e Cor', cat: 'Correção de cor', tag: 'Lumetri', painel: 'lc',
        params: [
            { k: 'temp', nome: 'Temperatura', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'tint', nome: 'Matiz', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'exp', nome: 'Exposição', min: -4, max: 4, step: 0.05, def: 0, un: 'EV' },
            { k: 'ct', nome: 'Contraste', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'hi', nome: 'Realces', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'sh', nome: 'Sombras', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'wh', nome: 'Brancos', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'bl', nome: 'Pretos', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'sat', nome: 'Saturação', min: 0, max: 200, step: 1, def: 100, un: '' },
            { k: 'fade', nome: 'Filme desbotado', min: 0, max: 100, step: 1, def: 0, un: '' },
            { k: 'sharp', nome: 'Nitidez', min: 0, max: 100, step: 1, def: 0, un: '' },
            { k: 'vib', nome: 'Vibração', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'vig', nome: 'Quantidade', min: 0, max: 100, step: 1, def: 0, un: '' },
            // rodas de cor: luminância de sombras / meios-tons / realces (a cor fica em v.cw)
            { k: 'ls', nome: 'Sombras (luz)', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'lm', nome: 'Meios-tons (luz)', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'lh', nome: 'Realces (luz)', min: -100, max: 100, step: 1, def: 0, un: '' },
        ],
        extra: ['cv', 'cw'],
        neutro: v => veLcColorNeutral(v) && !(v.sharp > 0) && !(v.vig > 0),
        draw: (a, v, env) => veLcDraw(a, v, env),
        exportar: v => {
            const o = { sharp: veLcSharpAmt(v), vig: veLcVigAngle(v) };
            if (!veLcColorNeutral(v)) { o.n = VE_LC_N; o.lut = veLcLutB64(v); }
            return o;
        },
    },
    key: {
        nome: 'Chroma Key', cat: 'Chaveamento', tag: 'Keylight', soClipe: true,
        params: [
            { k: 'cor', nome: 'Cor da tela', tipo: 'cor', def: VE_KEY_PADRAO },
            { k: 'ganho', nome: 'Ganho da tela', min: 0, max: 200, step: 1, def: 100, un: '%' },
            { k: 'bal', nome: 'Equilíbrio', min: 0, max: 100, step: 1, def: 50, un: '%' },
            { k: 'preto', nome: 'Recorte do preto', min: 0, max: 99, step: 0.5, def: 0, un: '%' },
            { k: 'branco', nome: 'Recorte do branco', min: 1, max: 100, step: 0.5, def: 100, un: '%' },
            { k: 'encolher', nome: 'Encolher / expandir', min: -10, max: 10, step: 1, def: 0, un: 'px' },
            { k: 'suave', nome: 'Suavizar borda', min: 0, max: 20, step: 0.5, def: 0, un: 'px' },
            { k: 'spill', nome: 'Remover reflexo', min: 0, max: 100, step: 1, def: 100, un: '%' },
            { k: 'matte', nome: 'Mostrar matte (só na prévia)', tipo: 'bool', def: 0 },
        ],
        neutro: () => false,
        draw: (a, v, env) => veKeyDraw(a, v, env),
        exportar: v => {
            const k = veKeyCalc(v), e = k.eq, c = 1 - e;
            // coeficientes do colorchannelmixer para o alfa (aa = 0,5 com o alfa de entrada 255 = constante)
            const mix = k.azul ? { ar: 0.5 * e, ag: 0.5 * c, ab: -0.5 } : { ar: 0.5 * e, ag: -0.5, ab: 0.5 * c };
            return { azul: k.azul ? 1 : 0, ...mix, dk: k.dk, ganho: k.ganho, cb: k.cb, cw: k.cw, eq: e,
                     spill: k.spill, choke: k.choke, suave: k.suave };
        },
    },
    crop: {
        nome: 'Cortar', cat: 'Transformar', tag: 'Crop',
        params: [
            { k: 'l', nome: 'Esquerda', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 't', nome: 'Superior', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 'r', nome: 'Direita', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 'b', nome: 'Inferior', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
        ],
        neutro: v => !v.l && !v.t && !v.r && !v.b,
        // a área cortada fica transparente: aparece o que estiver na trilha de baixo
        draw(a, v, env) {
            const { w, h } = env, x = a.ctx;
            const px = (f, n) => f > 0 ? Math.max(1, Math.floor(n * f / 100)) : 0;
            const l = px(v.l, w), r = px(v.r, w), t = px(v.t, h), b = px(v.b, h);
            if (l) x.clearRect(0, 0, l, h);
            if (r) x.clearRect(w - r, 0, r, h);
            if (t) x.clearRect(0, 0, w, t);
            if (b) x.clearRect(0, h - b, w, b);
            return a;
        },
    },
};

const VE_AFX = {
    denoise: {
        nome: 'Limpeza de ruído', cat: 'Áudio · Restauração', tag: 'Noise cleanup',
        params: [
            { k: 'amt', nome: 'Redução', min: 0, max: 100, step: 1, def: 35, un: '%' },
            { k: 'floor', nome: 'Piso do ruído', min: -75, max: -25, step: 1, def: -50, un: 'dB' },
        ],
        neutro: v => !(v.amt > 0),
    },
    // Hard Limiter (Premiere/Audition): editor-audio.js (VeLimitador) e video_cutter._hard_limiter fazem a mesma conta
    limiter: {
        nome: 'Hard Limiter', cat: 'Áudio · Amplitude e compressão', tag: 'Limitador rígido de picos',
        params: [
            { k: 'ceil', nome: 'Amplitude máxima', min: -30, max: 0, step: 0.1, def: -1, un: 'dB' },   // -1: folga para o AAC do mp4
            { k: 'boost', nome: 'Ganho de entrada', min: -12, max: 30, step: 0.1, def: 0, un: 'dB' },
            { k: 'look', nome: 'Antecipação', min: 0.1, max: 10, step: 0.1, def: 3, un: 'ms' },
            { k: 'rel', nome: 'Soltura', min: 10, max: 1000, step: 1, def: 80, un: 'ms' },
            { k: 'link', nome: 'Vincular canais', tipo: 'bool', def: 1 },
        ],
        neutro: () => false,
    },
    dereverb: {
        nome: 'Secar ambiente', cat: 'Áudio · Restauração', tag: 'Room dryer',
        params: [{ k: 'amt', nome: 'Intensidade', min: 0, max: 100, step: 1, def: 40, un: '%' }],
        neutro: v => !(v.amt > 0),
    },
    reverb: {
        nome: 'Ambiência', cat: 'Áudio · Espaço', tag: 'Reverb',
        params: [
            { k: 'mix', nome: 'Mistura', min: 0, max: 60, step: 1, def: 18, un: '%' },
            { k: 'size', nome: 'Tamanho', min: 0, max: 100, step: 1, def: 45, un: '%' },
        ],
        neutro: v => !(v.mix > 0),
    },
    eq: {
        nome: 'Equalizador gráfico', cat: 'Áudio · EQ', tag: 'EQ',
        params: [
            { k: 'lo', nome: 'Graves', min: -12, max: 12, step: 0.5, def: 0, un: 'dB' },
            { k: 'mid', nome: 'Médios', min: -12, max: 12, step: 0.5, def: 0, un: 'dB' },
            { k: 'hi', nome: 'Agudos', min: -12, max: 12, step: 0.5, def: 0, un: 'dB' },
        ],
        neutro: v => !v.lo && !v.mid && !v.hi,
    },
};

// ── Chroma Key (como Keylight / Ultra Key) ──
// Matte por DIFERENÇA DE COR (o núcleo do Keylight e do IBK do Nuke), não por distância de cor: a transparência vem
// de quanto o canal da tela (G ou B) passa dos outros dois, medido em relação à cor da tela. Preserva cabelo, desfoque
// de movimento e semitransparência melhor que "chave por tolerância". Passos (iguais aos do ffmpeg, _filtros_fx):
//   1. bruto = 0,5 + 0,5·(eq·R − G + (1−eq)·B) (tela azul: troca G↔B)   → colorchannelmixer (alfa, 8 bits)
//   2. d = 1 − 2·bruto; alfa = 1 − ganho·d/dk; recorte preto/branco      → lutrgb no alfa
//   3. reflexo: s = max(G − (R·eq + B·(1−eq)), 0); G −= quant·s          → despill
//   4. encolher/expandir (mínimo/máximo 3×3, n vezes) e suavizar (gaussiano) só no alfa → erosion/dilation, gblur
function veKeyCalc(v) {
    const hx = /^#[0-9a-f]{6}$/i.test(v.cor) ? v.cor : VE_KEY_PADRAO;
    const kr = parseInt(hx.slice(1, 3), 16) / 255, kg = parseInt(hx.slice(3, 5), 16) / 255, kb = parseInt(hx.slice(5, 7), 16) / 255;
    const azul = kb > kg, eq = v.bal / 100;
    // canal da tela S e os outros dois (o1 pesa eq, o2 pesa 1−eq)
    const dk = Math.max(0.05, azul ? kb - (eq * kr + (1 - eq) * kg) : kg - (eq * kr + (1 - eq) * kb));
    const cb = Math.min(v.preto, v.branco - 1) / 100, cw = Math.max(v.branco, v.preto + 1) / 100;
    const ganho = v.ganho / 100;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
        const a = 1 - ganho * (1 - 2 * i / 255) / dk;
        lut[i] = Math.round(Math.min(1, Math.max(0, (a - cb) / (cw - cb))) * 255);
    }
    return { azul, eq, dk, cb, cw, ganho, lut, spill: v.spill / 100, choke: Math.round(v.encolher), suave: v.suave };
}
const VEKEY = { a: null, b: null, m: null, m2: null };
function veKeyCv(k, w, h) {
    if (!VEKEY[k]) { const cv = document.createElement('canvas'); VEKEY[k] = { cv, ctx: cv.getContext('2d', { willReadFrequently: true }) }; }
    const o = VEKEY[k];
    if (o.cv.width !== w || o.cv.height !== h) { o.cv.width = w; o.cv.height = h; }
    return o;
}
// n passes de mínimo (encolher, n > 0) ou máximo (expandir, n < 0) 3×3 no alfa (separável)
function veKeyMorf(al, w, h, n) {
    const tmp = new Uint8ClampedArray(al.length), f = n > 0 ? Math.min : Math.max;
    for (let p = 0; p < Math.abs(n); p++) {
        for (let y = 0; y < h; y++) {
            const o = y * w;
            for (let x = 0; x < w; x++) tmp[o + x] = f(al[o + Math.max(0, x - 1)], al[o + x], al[o + Math.min(w - 1, x + 1)]);
        }
        for (let y = 0; y < h; y++) {
            const a = Math.max(0, y - 1) * w, o = y * w, b = Math.min(h - 1, y + 1) * w;
            for (let x = 0; x < w; x++) al[o + x] = f(tmp[a + x], tmp[o + x], tmp[b + x]);
        }
    }
}
function veKeyDraw(a, v, env) {
    const k = veKeyCalc(v), { w, h } = env;
    const A = veKeyCv('a', w, h);
    A.ctx.clearRect(0, 0, w, h);
    A.ctx.drawImage(a.cv, 0, 0);
    const img = A.ctx.getImageData(0, 0, w, h), d = img.data, n = w * h, al = new Uint8ClampedArray(n);
    const eq = k.eq, ceq = 1 - eq, amt = k.spill, lut = k.lut;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
        const r = d[j], g = d[j + 1], b = d[j + 2];
        const bruto = k.azul ? 0.5 * eq * r + 0.5 * ceq * g - 0.5 * b + 127.5 : 0.5 * eq * r - 0.5 * g + 0.5 * ceq * b + 127.5;
        const src = d[j + 3];
        al[i] = src === 0 ? 0 : Math.round(lut[Math.max(0, Math.min(255, Math.round(bruto)))] * src / 255);
        if (amt > 0) {
            if (k.azul) { const s = b - (r * eq + g * ceq); if (s > 0) d[j + 2] = b - amt * s; }
            else { const s = g - (r * eq + b * ceq); if (s > 0) d[j + 1] = g - amt * s; }
        }
        d[j + 3] = 255;
    }
    const ch = Math.round(k.choke * env.q);
    if (ch) veKeyMorf(al, w, h, ch);
    // máscara (branco com o alfa): serve para suavizar e para "Mostrar matte"
    const M = veKeyCv('m', w, h), mi = M.ctx.createImageData(w, h), md = mi.data;
    for (let i = 0, j = 0; i < n; i++, j += 4) { md[j] = md[j + 1] = md[j + 2] = 255; md[j + 3] = al[i]; }
    M.ctx.putImageData(mi, 0, 0);
    let mask = M.cv;
    const sp = k.suave * env.q;
    if (sp >= 0.05) {
        const M2 = veKeyCv('m2', w, h);
        M2.ctx.clearRect(0, 0, w, h);
        M2.ctx.filter = `blur(${sp}px)`;
        M2.ctx.drawImage(M.cv, 0, 0);
        M2.ctx.filter = 'none';
        mask = M2.cv;
    }
    const out = veFxOther(a, w, h);
    out.ctx.globalCompositeOperation = 'source-over';
    if (v.matte) {
        out.ctx.fillStyle = '#000';
        out.ctx.fillRect(0, 0, w, h);
        out.ctx.drawImage(mask, 0, 0);
        return out;
    }
    A.ctx.putImageData(img, 0, 0);   // RGB sem o reflexo, opaco
    out.ctx.clearRect(0, 0, w, h);
    out.ctx.drawImage(A.cv, 0, 0);
    out.ctx.globalCompositeOperation = 'destination-in';
    out.ctx.drawImage(mask, 0, 0);
    out.ctx.globalCompositeOperation = 'source-over';
    return out;
}

const VEFX = { pool: [], collapsed: new Set(), key: '', drag: null };

// Canvases reaproveitados (0 e 1 alternam entre os passos; 2 = área com borda do desfoque)
function veFxCanvas(n, w, h) {
    while (VEFX.pool.length <= n) {
        const cv = document.createElement('canvas');
        VEFX.pool.push({ cv, ctx: cv.getContext('2d', { willReadFrequently: false }) });
    }
    const o = VEFX.pool[n];
    if (o.cv.width !== w || o.cv.height !== h) { o.cv.width = w; o.cv.height = h; }
    return o;
}
function veFxOther(a, w, h) { return veFxCanvas(a === VEFX.pool[0] ? 1 : 0, w, h); }

function veFxValues(f) {
    const d = VE_FX[f.t], v = {};
    d.params.forEach(p => {
        if (p.tipo === 'cor') v[p.k] = f.v && /^#[0-9a-f]{6}$/i.test(f.v[p.k]) ? f.v[p.k] : p.def;
        else v[p.k] = f.v && isFinite(f.v[p.k]) ? +f.v[p.k] : p.def;
    });
    (d.extra || []).forEach(k => { v[k] = f.v && f.v[k] != null ? f.v[k] : {}; });
    return v;
}

function veAfxValues(f) {
    const d = VE_AFX[f.t], v = {};
    d.params.forEach(p => {
        if (p.tipo === 'bool') v[p.k] = f.v && f.v[p.k] ? 1 : 0;
        else v[p.k] = f.v && isFinite(f.v[p.k]) ? +f.v[p.k] : p.def;
    });
    return v;
}

// Efeitos que mudam a imagem (ligados, conhecidos e fora do valor neutro)
function veFxActive(c) {
    return ((c && c.fx) || []).filter(f => f.on !== false && VE_FX[f.t] && !VE_FX[f.t].neutro(veFxValues(f)));
}
function veHasFx(c) { return !!(c && c.fx && c.fx.length); }
function veAfxActive(c) {
    return ((c && c.afx) || []).filter(f => f.on !== false && VE_AFX[f.t] && !VE_AFX[f.t].neutro(veAfxValues(f)));
}
function veHasAfx(c) { return !!(c && c.afx && c.afx.length); }

// Clipe de vídeo "puro": ocupa o quadro todo, sem efeitos (vai direto na base da exportação)
function veIsPlain(c) { return veIsDefaultProps(c) && !veFxActive(c).length; }

// Prévia: aplica os efeitos na mídia e devolve o que desenhar no lugar dela.
// alvo = pixels do monitor por pixel da mídia: os efeitos rodam só na resolução em que a mídia aparece
// (em degraus de 1/8, para não recriar os canvases a cada quadro de uma escala animada)
function veFxRender(c, src, sz, alvo) {
    const fx = veFxActive(c);
    if (!fx.length) return src;
    let q = Math.min(1, 1920 / Math.max(sz.w, sz.h));
    if (alvo > 0) q = Math.min(q, Math.max(0.125, Math.ceil(alvo * 8) / 8));
    const w = Math.max(1, Math.round(sz.w * q)), h = Math.max(1, Math.round(sz.h * q));
    let a = veFxCanvas(0, w, h);
    a.ctx.clearRect(0, 0, w, h);
    a.ctx.drawImage(src, 0, 0, w, h);
    const env = { w, h, q, mw: sz.w, mh: sz.h };
    fx.forEach(f => { a = VE_FX[f.t].draw(a, veFxValues(f), env); });
    return a.cv;
}

// Para a exportação: [{t, v}] só dos efeitos ativos
function veFxExport(c) {
    return veFxActive(c).map(f => {
        const d = VE_FX[f.t], v = veFxValues(f);
        return { t: f.t, v: d.exportar ? d.exportar(v) : v };
    });
}

function veAfxExport(c) {
    return veAfxActive(c).map(f => ({ t: f.t, v: veAfxValues(f) }));
}

// ── aplicar / editar ──
function veFxNewId() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Aplicar num clipe que faz parte da seleção (arrastar até ele ou duplo clique na lista) vale para TODOS os
// selecionados, como no Premiere; os que não aceitam o efeito (travados, sem som...) ficam de fora.
// Os Controles de efeito continuam mostrando o clipe principal.
function veFxAlvos(c) {
    const sel = veSelLista();
    return sel.length > 1 && sel.includes(c) ? sel : [c];
}
function veFxMsgVarios(nome, ok, lista) {
    const fora = lista.length - ok.length;
    return `${nome} ${veT('aplicado em')} ${ok.length} ${veT('clipes')}` + (fora ? ` (${fora} ${veT('não aceitam o efeito')})` : '');
}

function veFxAdd(i, t) {
    const c = VE.clips[i];
    if (!c || !VE_FX[t]) return;
    if (VE.info && VE.info.audio_only) { veToast('Efeitos de vídeo precisam de um vídeo ou imagem'); return; }
    const painel = VE_FX[t].painel, lista = veFxAlvos(c);
    const aceita = x => !veLocked(x) && !veIsAudio(x) && !(VE_FX[t].soClipe && veIsAdj(x));
    if (lista.length === 1) {
        if (veLocked(c)) { veAvisoBloqueio(); return; }
        if (veIsAudio(c)) { veToast('Efeitos de vídeo não se aplicam a um clipe de áudio'); return; }
        if (VE_FX[t].soClipe && veIsAdj(c)) { veToast(`${VE_FX[t].nome} não se aplica a uma camada de ajuste`); return; }
        if (painel && c.fx && c.fx.some(f => f.t === t)) {   // um só por clipe: abre o painel dele
            VE.sel = i;
            vedShow(painel);
            veRefresh();
            return;
        }
    }
    // efeito de painel (um só por clipe): entra só nos que ainda não têm
    const ok = lista.filter(x => aceita(x) && !(painel && x.fx && x.fx.some(f => f.t === t)));
    if (!ok.length) { veToast(`${VE_FX[t].nome}: ${veT('nenhum clipe selecionado aceita o efeito')}`); return; }
    vePushHistory();
    ok.forEach(x => {
        const v = {};
        VE_FX[t].params.forEach(p => { v[p.k] = p.def; });
        x.fx = [...(x.fx || []), { id: veFxNewId(), t, on: true, v }];
    });
    if (lista.length === 1) VE.sel = i;
    vedShow(painel || 'props');
    veRefresh();
    veToast(lista.length > 1 ? veFxMsgVarios(VE_FX[t].nome, ok, lista) : `${VE_FX[t].nome} aplicado em ${veNomeClipe(c)} ${i + 1}`);
}

function veAfxAdd(i, t) {
    const c = VE.clips[i];
    if (!c || !VE_AFX[t]) return;
    const lista = veFxAlvos(c);
    if (lista.length === 1) {
        if (veLocked(c)) { veAvisoBloqueio(); return; }
        if (!veOcupaA(c) || !veTemSom(c)) { veToast('Efeitos de áudio precisam de um clipe com som'); return; }
    }
    const ok = lista.filter(x => !veLocked(x) && veOcupaA(x) && veTemSom(x));
    if (!ok.length) { veToast('Efeitos de áudio precisam de um clipe com som'); return; }
    vePushHistory();
    ok.forEach(x => {
        const v = {};
        VE_AFX[t].params.forEach(p => { v[p.k] = p.def; });
        x.afx = [...(x.afx || []), { id: veFxNewId(), t, on: true, v }];
    });
    if (lista.length === 1) VE.sel = i;
    vedShow('props');
    veRefresh();
    if (veMixAtivo()) veAudioEditou();
    veToast(lista.length > 1 ? veFxMsgVarios(VE_AFX[t].nome, ok, lista) : `${VE_AFX[t].nome} aplicado em ${veNomeClipe(c)} ${i + 1}`);
}

// Troca o efeito `id` do clipe selecionado sem mexer no array antigo (clipes cortados compartilham)
function veFxEdit(id, fn) {
    const c = VE.clips[VE.sel];
    if (!c || !c.fx) return null;
    c.fx = c.fx.map(f => f.id === id ? fn({ ...f, v: { ...f.v } }) : f);
    return c;
}

function veAfxEdit(id, fn) {
    const c = VE.clips[VE.sel];
    if (!c || !c.afx) return null;
    c.afx = c.afx.map(f => f.id === id ? fn({ ...f, v: { ...f.v } }) : f);
    return c;
}

function veFxAction(id, act) {
    const c = VE.clips[VE.sel];
    if (!c || !c.fx) return;
    const j = c.fx.findIndex(f => f.id === id);
    if (j < 0) return;
    if (act === 'open') { vedShow(VE_FX[c.fx[j].t].painel); return; }
    if (act === 'gotas') { veKeyGotas(id); return; }
    if (act === 'fold') {
        VEFX.collapsed.has(id) ? VEFX.collapsed.delete(id) : VEFX.collapsed.add(id);
        VEFX.key = '';
        veRenderFxControls();
        return;
    }
    vePushHistory();
    if (act === 'on') veFxEdit(id, f => ({ ...f, on: f.on === false }));
    else if (act === 'reset') veFxEdit(id, f => { VE_FX[f.t].params.forEach(p => { f.v[p.k] = p.def; }); (VE_FX[f.t].extra || []).forEach(k => delete f.v[k]); return f; });
    else if (act === 'del') { c.fx = c.fx.filter(f => f.id !== id); if (!c.fx.length) delete c.fx; }
    else if (act === 'up' || act === 'down') {
        const k = act === 'up' ? j - 1 : j + 1;
        if (k < 0 || k >= c.fx.length) return;
        const a = [...c.fx];
        [a[j], a[k]] = [a[k], a[j]];
        c.fx = a;
    }
    veRefresh();
}

function veAfxAction(id, act) {
    const c = VE.clips[VE.sel];
    if (!c || !c.afx) return;
    const j = c.afx.findIndex(f => f.id === id);
    if (j < 0) return;
    if (act === 'fold') {
        VEFX.collapsed.has(id) ? VEFX.collapsed.delete(id) : VEFX.collapsed.add(id);
        VEFX.key = '';
        veRenderFxControls();
        return;
    }
    vePushHistory();
    if (act === 'on') veAfxEdit(id, f => ({ ...f, on: f.on === false }));
    else if (act === 'reset') veAfxEdit(id, f => { VE_AFX[f.t].params.forEach(p => { f.v[p.k] = p.def; }); return f; });
    else if (act === 'del') { c.afx = c.afx.filter(f => f.id !== id); if (!c.afx.length) delete c.afx; }
    else if (act === 'up' || act === 'down') {
        const k = act === 'up' ? j - 1 : j + 1;
        if (k < 0 || k >= c.afx.length) return;
        const a = [...c.afx];
        [a[j], a[k]] = [a[k], a[j]];
        c.afx = a;
    }
    veRefresh();
    if (veMixAtivo()) veAudioEditou();
}

// ── Controles de efeito: lista dos efeitos do clipe selecionado ──
function veFxFmt(p, v) { return String(veRound(v, p.step < 1 ? 1 : 0)); }

function veRenderFxControls() {
    const box = $ve('ve-fxc');
    if (!box) return;
    const c = VE.clips[VE.sel];
    const fx = (c && c.fx) || [], afx = (c && c.afx) || [];
    const kfx = fx.map(f => 'v' + f.id + f.t + (f.on !== false) + VEFX.collapsed.has(f.id)).join(',');
    const kafx = afx.map(f => 'a' + f.id + f.t + (f.on !== false) + VEFX.collapsed.has(f.id)).join(',');
    const key = VE.sel + '|' + kfx + '|' + kafx;
    if (key !== VEFX.key) {
        VEFX.key = key;
        const render = (lista, defs, tipo, titulo) => !lista.length ? '' :
            `<div class="ve-fxc-title">${titulo}</div>` + lista.map((f, j) => {
            const d = defs[f.t];
            if (!d) return '';
            const off = f.on === false;
            const attr = tipo === 'a' ? 'data-afx' : 'data-fx';
            const marca = tipo === 'a' ? 'aud' : 'fx';
            return `<div class="ve-fxe${off ? ' off' : ''}${VEFX.collapsed.has(f.id) ? ' collapsed' : ''}" ${attr}="${f.id}">
                <div class="ve-fxe-head">
                    <button class="ve-fxe-on" data-fa="on" title="${off ? 'Ligar' : 'Desligar'} efeito">${marca}</button>
                    <b data-fa="fold" title="Recolher/expandir">${d.nome}</b>
                    <button data-fa="up" title="Aplicar antes (subir)" ${j ? '' : 'disabled'}>▲</button>
                    <button data-fa="down" title="Aplicar depois (descer)" ${j < lista.length - 1 ? '' : 'disabled'}>▼</button>
                    <button data-fa="reset" title="Restaurar valores">↺</button>
                    <button data-fa="del" title="Remover efeito">✕</button>
                </div>
                <div class="ve-fxe-body">${d.painel ? `
                    <button class="ve-btn ve-btn-sm ve-fxe-open" data-fa="open">Editar no painel ${d.nome}</button>` : d.params.map(p => p.tipo === 'cor' ? `
                    <div class="ve-prop ve-prop-cor">
                        <label>${p.nome}</label>
                        <input type="color" data-fk="${p.k}">
                        <button class="ve-btn ve-btn-sm" data-fa="gotas" title="Conta-gotas: clique na tela verde/azul no monitor">⌖ Conta-gotas</button>
                    </div>` : p.tipo === 'bool' ? `
                    <label class="ve-prop-bool"><input type="checkbox" data-fk="${p.k}"> ${p.nome}</label>` : `
                    <div class="ve-prop">
                        <label>${p.nome}</label>
                        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" data-fk="${p.k}">
                        <span class="ve-prop-num"><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" data-fk="${p.k}"><i>${p.un}</i></span>
                    </div>`).join('')}
                </div></div>`;
        }).join('');
        box.innerHTML = render(fx, VE_FX, 'v', 'Efeitos de vídeo') + render(afx, VE_AFX, 'a', 'Efeitos de áudio');
    }
    fx.forEach(f => {
        const d = VE_FX[f.t], el = box.querySelector(`[data-fx="${f.id}"]`);
        if (!d || !el) return;
        const v = veFxValues(f);
        d.params.forEach(p => el.querySelectorAll(`[data-fk="${p.k}"]`).forEach(inp => {
            if (p.tipo === 'bool') inp.checked = !!v[p.k];
            else if (p.tipo === 'cor') { if (inp.ownerDocument.activeElement !== inp) inp.value = v[p.k]; }
            else if (inp.ownerDocument.activeElement !== inp) inp.value = veFxFmt(p, v[p.k]);
        }));
    });
    afx.forEach(f => {
        const d = VE_AFX[f.t], el = box.querySelector(`[data-afx="${f.id}"]`);
        if (!d || !el) return;
        const v = veAfxValues(f);
        d.params.forEach(p => el.querySelectorAll(`[data-fk="${p.k}"]`).forEach(inp => {
            if (p.tipo === 'bool') inp.checked = !!v[p.k];
            else if (inp.ownerDocument.activeElement !== inp) inp.value = veFxFmt(p, v[p.k]);
        }));
    });
}

function veFxSetParam(id, k, val) {
    const c = VE.clips[VE.sel];
    const f = c && c.fx && c.fx.find(x => x.id === id);
    const p = f && VE_FX[f.t] && VE_FX[f.t].params.find(x => x.k === k);
    if (!p) return;
    if (p.tipo === 'cor') { if (!/^#[0-9a-f]{6}$/i.test(val)) return; }
    else if (p.tipo === 'bool') val = val ? 1 : 0;
    else { if (!isFinite(val)) return; val = Math.min(Math.max(val, p.min), p.max); }
    veFxEdit(id, x => { x.v[k] = val; return x; });
    veRenderFxControls();
    veDrawMonitorSoon();
}

function veAfxSetParam(id, k, val) {
    const c = VE.clips[VE.sel];
    const f = c && c.afx && c.afx.find(x => x.id === id);
    const p = f && VE_AFX[f.t] && VE_AFX[f.t].params.find(x => x.k === k);
    if (!p) return;
    if (p.tipo === 'bool') val = val ? 1 : 0;
    else { if (!isFinite(val)) return; val = Math.min(Math.max(val, p.min), p.max); }
    veAfxEdit(id, x => { x.v[k] = val; return x; });
    veRenderFxControls();
    if (veMixAtivo()) veAudioEditou();
}

// ── painel Efeitos: lista, busca, arrastar até um clipe ──
function veRenderFxList() {
    const q = ($ve('ve-fx-q').value || '').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cats = {};
    const add = (t, d, tipo) => {
        const alvo = (d.nome + ' ' + d.tag + ' ' + d.cat).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (q && !alvo.includes(q)) return;
        (cats[d.cat] = cats[d.cat] || []).push([t, d, tipo]);
    };
    Object.entries(VE_FX).forEach(([t, d]) => add(t, d, 'v'));
    Object.entries(VE_AFX).forEach(([t, d]) => add(t, d, 'a'));
    const html = Object.entries(cats).map(([cat, list]) => `<div class="ve-fx-cat">${cat}</div>` +
        list.map(([t, d, tipo]) => `<div class="ve-fx-item" data-${tipo === 'a' ? 'aft' : 'fxt'}="${t}" title="Arraste até um clipe · duplo clique aplica no clipe selecionado"><i>${tipo === 'a' ? 'aud' : 'fx'}</i><span>${d.nome}</span><small>${d.tag}</small></div>`).join('')).join('');
    $ve('ve-fx-list').innerHTML = html || '<div class="ve-clips-empty">Nenhum efeito encontrado.</div>';
}

// Clipe da timeline sob o ponto (-1 se nenhum); doc = documento do ponto (timeline pode estar em janela solta)
function veClipAtClient(x, y, doc) {
    const wrap = $ve('ve-tl-wrap'), r = wrap.getBoundingClientRect();
    if (!VE.ready || wrap.ownerDocument !== doc || !wrap.offsetParent || x < r.left || x > r.right || y < r.top || y > r.bottom) return -1;
    const row = veRowAt(y - r.top);
    if (!row) return -1;
    const i = veClipAtTrack(VE.view + (x - r.left) / VE.pps, veTrackIndex(row), row.kind);
    return i;
}

function veFxInit() {
    veRenderFxList();
    $ve('ve-fx-q').addEventListener('input', veRenderFxList);
    $ve('ve-fx-q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; veRenderFxList(); e.target.blur(); } e.stopPropagation(); });
    const list = $ve('ve-fx-list');
    list.addEventListener('dblclick', e => {
        const it = e.target.closest('[data-fxt],[data-aft]');
        if (!it) return;
        if (VE.sel < 0) { veToast('Selecione um clipe na timeline (ou arraste o efeito até ele)'); return; }
        if (it.dataset.aft) veAfxAdd(VE.sel, it.dataset.aft);
        else veFxAdd(VE.sel, it.dataset.fxt);
    });
    // arrastar o efeito: solta num clipe da timeline ou no Controles de efeito (clipe selecionado)
    list.addEventListener('pointerdown', e => {
        const it = e.target.closest('[data-fxt],[data-aft]');
        if (!it || e.button !== 0) return;
        const win = list.ownerDocument.defaultView, doc = list.ownerDocument;   // painel pode estar em janela solta
        VEFX.drag = { t: it.dataset.aft || it.dataset.fxt, tipo: it.dataset.aft ? 'a' : 'v', x0: e.clientX, y0: e.clientY, on: false, ghost: null };
        const move = ev => {
            const d = VEFX.drag;
            if (!d.on) {
                if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return;
                d.on = true;
                d.ghost = doc.createElement('div');
                d.ghost.className = 've-dghost';
                d.ghost.textContent = (d.tipo === 'a' ? 'aud  ' : 'fx  ') + (d.tipo === 'a' ? VE_AFX[d.t].nome : VE_FX[d.t].nome);
                doc.body.appendChild(d.ghost);
                doc.body.classList.add('ve-fx-dragging');
            }
            d.ghost.style.left = ev.clientX + 12 + 'px';
            d.ghost.style.top = ev.clientY + 10 + 'px';
            const i = veClipAtClient(ev.clientX, ev.clientY, doc);
            $ve('ve-tl-wrap').classList.toggle('fx-drop', i >= 0);
            if (i !== VE.fxHover) { VE.fxHover = i; veDraw(); }
        };
        const up = ev => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            const d = VEFX.drag;
            VEFX.drag = null;
            VE.fxHover = -1;
            $ve('ve-tl-wrap').classList.remove('fx-drop');
            doc.body.classList.remove('ve-fx-dragging');
            if (!d || !d.on) return;
            d.ghost.remove();
            veDraw();
            const i = veClipAtClient(ev.clientX, ev.clientY, doc);
            const props = doc.elementFromPoint(ev.clientX, ev.clientY)?.closest('#ve-pane-props');
            const aplica = idx => d.tipo === 'a' ? veAfxAdd(idx, d.t) : veFxAdd(idx, d.t);
            if (i >= 0) aplica(i);
            else if (props && VE.sel >= 0) aplica(VE.sel);
            else if (props) veToast('Selecione um clipe na timeline primeiro');
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });

    // Controles: botões e sliders dos efeitos aplicados (um passo de desfazer por gesto)
    const box = $ve('ve-fxc');
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-fa]');
        if (!b) return;
        const a = b.closest('[data-afx]');
        if (a) veAfxAction(a.dataset.afx, b.dataset.fa);
        else veFxAction(b.closest('[data-fx]').dataset.fx, b.dataset.fa);
    });
    box.addEventListener('input', e => {
        const el = e.target.closest('[data-fk]');
        if (!el) return;
        if (!VE._fxEdit) { vePushHistory(); VE._fxEdit = true; }
        const val = el.type === 'checkbox' ? el.checked : el.type === 'color' ? el.value : parseFloat(String(el.value).replace(',', '.'));
        const a = el.closest('[data-afx]');
        if (a) veAfxSetParam(a.dataset.afx, el.dataset.fk, val);
        else veFxSetParam(el.closest('[data-fx]').dataset.fx, el.dataset.fk, val);
        if (el.type === 'checkbox') { VE._fxEdit = false; veDrawMonitor(); if (veMixAtivo()) veAudioEditou(); }
    });
    box.addEventListener('change', () => { VE._fxEdit = false; veRenderClips(); veDraw(); if (veMixAtivo()) veAudioEditou(); });
}

// Conta-gotas do Chroma Key: o próximo clique no monitor pega a cor (média 5×5) com o efeito desligado
function veKeyGotas(id) {
    VEFX.gotas = { id, sel: VE.sel };
    $ve('ve-screen').classList.add('ve-gotas');
    veToast('Clique na tela verde/azul no monitor (Esc cancela)');
}
function veKeyGotasFim() {
    VEFX.gotas = null;
    $ve('ve-screen')?.classList.remove('ve-gotas');
}
function veKeyGotasInit() {
    const scr = $ve('ve-screen');
    if (!scr) return;
    scr.addEventListener('pointerdown', e => {
        const g = VEFX.gotas;
        if (!g) return;
        e.stopImmediatePropagation(); e.preventDefault();   // o clique não move a camada nem dá play
        veKeyGotasFim();
        if (e.button !== 0 || VE.sel !== g.sel) return;
        const cv = $ve('ve-canvas'), r = cv.getBoundingClientRect();
        const x = Math.round((e.clientX - r.left) / r.width * cv.width), y = Math.round((e.clientY - r.top) / r.height * cv.height);
        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
        if (typeof veCacheInvalidate === 'function') veCacheInvalidate();
        veFxEdit(g.id, f => ({ ...f, on: false }));
        veDrawMonitor();
        const px = cv.getContext('2d').getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
        veFxEdit(g.id, f => ({ ...f, on: true }));
        let s = [0, 0, 0], n = 0;
        for (let i = 0; i < px.length; i += 4) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; n++; }
        const hx = '#' + s.map(c => Math.round(c / n).toString(16).padStart(2, '0')).join('');
        vePushHistory();
        veFxSetParam(g.id, 'cor', hx);
        veRefresh();
        veToast('Cor da tela: ' + hx);
    }, true);
    scr.ownerDocument.addEventListener('keydown', e => { if (e.key === 'Escape' && VEFX.gotas) veKeyGotasFim(); }, true);
}

document.addEventListener('DOMContentLoaded', veFxInit);
document.addEventListener('DOMContentLoaded', veKeyGotasInit);
