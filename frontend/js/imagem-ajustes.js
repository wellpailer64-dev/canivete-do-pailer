// =========================================================
// Editor de Imagem — ajustes de cor e filtros.
// ieAjustar(dados RGBA, ajuste) aplica no lugar: serve para as camadas de ajuste vindas do PSD (Brilho/Contraste,
// Níveis, Curvas, Matiz/Saturação, Equilíbrio de cores, Vibratilidade, Filtro de fotos, Cor seletiva, Preto e
// branco, Mapa de degradê, Misturador de canais, Exposição, Inverter, Posterizar, Limiar) e para os ajustes do menu
// Imagem, que pintam na camada (com prévia). Os filtros (desfoque, nitidez, ruído, mosaico, desfoque de movimento)
// trabalham num canvas e respeitam a seleção.
// =========================================================

const IE_LUM = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const ieS2L = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const ieL2S = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function ieLut(fn) {
    const l = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) l[i] = Math.round(ieClamp(fn(i / 255), 0, 1) * 255);
    return l;
}
function ieAplicarLuts(d, lr, lg, lb) {
    for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]];
    }
}

// spline monotônica (curvas): pontos [[x, y], ...] em 0..255
function ieCurvaLut(pts) {
    pts = (pts || []).map(p => [ieClamp(+p[0], 0, 255), ieClamp(+p[1], 0, 255)]).sort((a, b) => a[0] - b[0]);
    if (pts.length < 2) return ieLut(v => v);
    const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = Math.max(1e-6, xs[i + 1] - xs[i]); m[i] = (ys[i + 1] - ys[i]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
        const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
        if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    const l = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
        if (v <= xs[0]) { l[v] = ys[0]; continue; }
        if (v >= xs[n - 1]) { l[v] = ys[n - 1]; continue; }
        let i = 0;
        while (i < n - 2 && v > xs[i + 1]) i++;
        const h = dx[i], u = (v - xs[i]) / h;
        const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
        l[v] = Math.round(h00 * ys[i] + h10 * h * t[i] + h01 * ys[i + 1] + h11 * h * t[i + 1]);
    }
    return l;
}

function ieNiveisLut(c) {   // [entrada preto, entrada branco, saída preto, saída branco, gama]
    if (!c) return null;
    const [i0, i1, o0, o1, g] = c;
    return ieLut(v => {
        const x = ieClamp((v * 255 - i0) / Math.max(1, i1 - i0), 0, 1);
        return (o0 + (o1 - o0) * Math.pow(x, 1 / Math.max(0.01, g || 1))) / 255;
    });
}
function ieCompLut(a, b) { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = b[a[i]]; return l; }

function ieRgbHsl(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
}
function ieHslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

function ieAjustar(d, a) {
    if (!a) return;
    switch (a.t) {
        case 'brightnesscontrast': {
            const br = a.br || 0, ct = a.ct || 0;
            let lut;
            if (a.legado) {
                const k = ct > 0 ? 1 / Math.max(0.01, 1 - ct / 100) : 1 + ct / 100;
                lut = ieLut(v => (v + br / 255 - 0.5) * k + 0.5);
            } else {
                const ex = br >= 0 ? 1 / (1 + br / 100) : 1 - br / 100;
                const p = 1 + Math.max(0, ct) / 100 * 1.4;
                lut = ieLut(v => {
                    v = Math.pow(v, ex);
                    if (ct >= 0) return v < 0.5 ? 0.5 * Math.pow(2 * v, p) : 1 - 0.5 * Math.pow(2 * (1 - v), p);
                    return 0.5 + (v - 0.5) * (1 + ct / 100);
                });
            }
            return ieAplicarLuts(d, lut, lut, lut);
        }
        case 'levels': {
            const c = a.canais || [];
            const comp = ieNiveisLut(c[0]) || ieLut(v => v);
            const lr = ieCompLut(ieNiveisLut(c[1]) || ieLut(v => v), comp);
            const lg = ieCompLut(ieNiveisLut(c[2]) || ieLut(v => v), comp);
            const lb = ieCompLut(ieNiveisLut(c[3]) || ieLut(v => v), comp);
            return ieAplicarLuts(d, lr, lg, lb);
        }
        case 'curves': {
            const c = a.canais || {};
            const comp = c[0] ? ieCurvaLut(c[0]) : ieLut(v => v);
            const f = k => ieCompLut(c[k] ? ieCurvaLut(c[k]) : ieLut(v => v), comp);
            return ieAplicarLuts(d, f(1), f(2), f(3));
        }
        case 'exposure': {
            const k = Math.pow(2, a.exp || 0), off = a.off || 0, g = 1 / Math.max(0.01, a.gama || 1);
            const lut = ieLut(v => ieL2S(Math.pow(Math.max(0, ieS2L(v) * k + off), g)));
            return ieAplicarLuts(d, lut, lut, lut);
        }
        case 'invert': { const l = ieLut(v => 1 - v); return ieAplicarLuts(d, l, l, l); }
        case 'posterize': {
            const n = Math.max(2, a.n || 4);
            const l = ieLut(v => Math.round(v * (n - 1)) / (n - 1));
            return ieAplicarLuts(d, l, l, l);
        }
        case 'threshold': {
            const n = a.n ?? 128;
            for (let i = 0; i < d.length; i += 4) { const v = IE_LUM(d[i], d[i + 1], d[i + 2]) >= n ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
            return;
        }
        case 'desaturar': {
            for (let i = 0; i < d.length; i += 4) {
                const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
                d[i] = d[i + 1] = d[i + 2] = (mx + mn) / 2;
            }
            return;
        }
        case 'huesaturation': return ieMatizSat(d, a);
        case 'vibrance': {
            // ajustado contra o achatado do Photoshop (portfólio): saturação pela metade, vibratilidade fraca
            const vib = (a.vib || 0) / 100, sat = (a.sat || 0) / 100;
            for (let i = 0; i < d.length; i += 4) {
                if (!d[i + 3]) continue;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
                const L = IE_LUM(r, g, b);
                const k = 1 + sat * 0.5 + vib * 0.25 * (1 - s) * (1 - s);
                d[i] = L + (r - L) * k; d[i + 1] = L + (g - L) * k; d[i + 2] = L + (b - L) * k;
            }
            return;
        }
        case 'colorbalance': {
            const sh = a.sombras || [0, 0, 0], md = a.medios || [0, 0, 0], hl = a.luzes || [0, 0, 0];
            const luts = [0, 1, 2].map(c => ieLut(v => {
                const wS = Math.pow(1 - v, 2.2), wH = Math.pow(v, 2.2), wM = Math.max(0, 1 - wS - wH);
                return v + (sh[c] * wS * 0.5 + md[c] * wM * 0.75 + hl[c] * wH * 0.5) / 100 * 0.6;
            }));
            for (let i = 0; i < d.length; i += 4) {
                if (!d[i + 3]) continue;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                let nr = luts[0][r], ng = luts[1][g], nb = luts[2][b];
                if (a.lum) {
                    const l0 = (Math.max(r, g, b) + Math.min(r, g, b)) / 2, l1 = (Math.max(nr, ng, nb) + Math.min(nr, ng, nb)) / 2;
                    const dl = l0 - l1;
                    nr += dl; ng += dl; nb += dl;
                }
                d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
            }
            return;
        }
        case 'photofilter': {
            // multiplica pela cor na densidade e devolve a luminância (somando), como o achatado do Photoshop
            const [cr, cg, cb] = a.cor || [236, 138, 0], dens = (a.dens ?? 25) / 100;
            for (let i = 0; i < d.length; i += 4) {
                if (!d[i + 3]) continue;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                let nr = r * (1 - dens + dens * cr / 255), ng = g * (1 - dens + dens * cg / 255), nb = b * (1 - dens + dens * cb / 255);
                if (a.lum) { const dl = IE_LUM(r, g, b) - IE_LUM(nr, ng, nb); nr += dl; ng += dl; nb += dl; }
                d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
            }
            return;
        }
        case 'selectivecolor': return ieCorSeletiva(d, a);
        case 'blackandwhite': {
            const p = (a.p || [40, 60, 40, 60, 20, 80]).map(v => v / 100);   // vermelho, amarelo, verde, ciano, azul, magenta
            const tint = a.tint;
            for (let i = 0; i < d.length; i += 4) {
                if (!d[i + 3]) continue;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b), md = r + g + b - mx - mn;
                let wMx, wMd;
                if (mx === r) { wMx = p[0]; wMd = g >= b ? p[1] : p[5]; }
                else if (mx === g) { wMx = p[2]; wMd = r >= b ? p[1] : p[3]; }
                else { wMx = p[4]; wMd = r >= g ? p[5] : p[3]; }
                let v = mn + (md - mn) * wMd + (mx - md) * wMx;
                if (tint) {
                    const [h, s] = ieRgbHsl(tint[0] / 255, tint[1] / 255, tint[2] / 255);
                    const c = ieHslRgb(h, s, ieClamp(v / 255, 0, 1));
                    d[i] = c[0] * 255; d[i + 1] = c[1] * 255; d[i + 2] = c[2] * 255;
                } else d[i] = d[i + 1] = d[i + 2] = v;
            }
            return;
        }
        case 'gradientmap': {
            const st = (a.stops || []).slice().sort((x, y) => x[0] - y[0]);
            if (!st.length) return;
            const lut = [];
            for (let k = 0; k < 256; k++) {
                let t = k / 255;
                if (a.inv) t = 1 - t;
                let c = st[0][1];
                if (t >= st[st.length - 1][0]) c = st[st.length - 1][1];
                else for (let j = 0; j < st.length - 1; j++) {
                    if (t >= st[j][0] && t <= st[j + 1][0]) {
                        const u = (t - st[j][0]) / Math.max(1e-6, st[j + 1][0] - st[j][0]);
                        c = st[j][1].map((v, q) => v + (st[j + 1][1][q] - v) * u);
                        break;
                    }
                }
                lut.push(c);
            }
            for (let i = 0; i < d.length; i += 4) {
                if (!d[i + 3]) continue;
                const c = lut[Math.round(IE_LUM(d[i], d[i + 1], d[i + 2]))];
                d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
            }
            return;
        }
        case 'channelmixer': {
            const m = a.dados || [];
            const lin = k => m[k] || [k === 0 ? 100 : 0, k === 1 ? 100 : 0, k === 2 ? 100 : 0, 0];
            const R = lin(0), G = a.mono ? lin(0) : lin(1), B = a.mono ? lin(0) : lin(2);
            for (let i = 0; i < d.length; i += 4) {
                if (!d[i + 3]) continue;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                d[i] = (r * R[0] + g * R[1] + b * R[2]) / 100 + (R[3] || 0) * 2.55;
                d[i + 1] = (r * G[0] + g * G[1] + b * G[2]) / 100 + (G[3] || 0) * 2.55;
                d[i + 2] = (r * B[0] + g * B[1] + b * B[2]) / 100 + (B[3] || 0) * 2.55;
            }
            return;
        }
    }
}

function ieMatizSat(d, a) {
    const H = a.h || 0, S = (a.s || 0) / 100, Lx = (a.l || 0) / 100;
    const faixas = (a.faixas || []).filter(f => f.v && (f.v[0] || f.v[1] || f.v[2]));
    const peso = (h, f) => {   // trapézio em graus (a, b, c, d) com volta no 360
        let [p0, p1, p2, p3] = f;
        const dentro = x => {
            if (x >= p1 && x <= p2) return 1;
            if (x > p0 && x < p1) return (x - p0) / Math.max(1, p1 - p0);
            if (x > p2 && x < p3) return (p3 - x) / Math.max(1, p3 - p2);
            return 0;
        };
        return Math.max(dentro(h), dentro(h + 360), dentro(h - 360));
    };
    const ajSat = (s, k) => (k >= 0 ? s + (1 - s) * k * s : s * (1 + k));
    const ajLum = (l, k) => (k >= 0 ? l + (1 - l) * k : l * (1 + k));
    for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        let [h, s, l] = ieRgbHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
        if (a.colorir) {
            const c = a.col || [0, 25, 0];
            h = c[0]; s = c[1] / 100; l = ajLum(l, (c[2] || 0) / 100);
        } else {
            for (const f of faixas) {
                const w = peso(h, f.f);
                if (!w) continue;
                h += f.v[0] * w; s = ajSat(s, f.v[1] / 100 * w); l = ajLum(l, f.v[2] / 100 * w);
            }
            h += H; s = ajSat(s, S); l = ajLum(l, Lx);
        }
        const c = ieHslRgb(h, ieClamp(s, 0, 1), ieClamp(l, 0, 1));
        d[i] = c[0] * 255; d[i + 1] = c[1] * 255; d[i + 2] = c[2] * 255;
    }
}

// Cor seletiva: dados = 10 linhas (vermelhos, amarelos, verdes, cianos, azuis, magentas, brancos, neutros, pretos)
// de [ciano, magenta, amarelo, preto] em -100..100 (a 1ª linha do arquivo é reservada)
function ieCorSeletiva(d, a) {
    const linhas = a.dados || [];
    const off = linhas.length >= 10 ? 1 : 0;
    const L = k => (linhas[k + off] || [0, 0, 0, 0]).map(v => v / 100);
    const cls = [L(0), L(1), L(2), L(3), L(4), L(5), L(6), L(7), L(8)];
    if (cls.every(c => c.every(v => !v))) return;
    const abs = !!a.abs;
    for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), md = r + g + b - mx - mn;
        const w = new Array(9).fill(0);
        if (mx === r) w[0] = mx - md;
        if (mn === b) w[1] = md - mn;
        if (mx === g) w[2] = mx - md;
        if (mn === r) w[3] = md - mn;
        if (mx === b) w[4] = mx - md;
        if (mn === g) w[5] = md - mn;
        w[6] = Math.max(0, (mn - 0.5) * 2);
        w[8] = Math.max(0, (0.5 - mx) * 2);
        w[7] = Math.max(0, 1 - (Math.abs(mx - 0.5) + Math.abs(mn - 0.5)));
        const cmy = [1 - r, 1 - g, 1 - b];
        const out = cmy.slice();
        for (let k = 0; k < 9; k++) {
            if (!w[k]) continue;
            const [ac, am, ay, ak] = cls[k];
            if (!ac && !am && !ay && !ak) continue;
            [ac, am, ay].forEach((adj, ch) => {
                const v = cmy[ch];
                const total = abs ? adj + ak : adj * (adj < 0 ? v : 1 - v) + ak * (ak < 0 ? v : 1 - v) * (1 - v);
                out[ch] += (abs ? total * 1 : total) * w[k] * (abs ? 1 : 1);
            });
        }
        d[i] = (1 - ieClamp(out[0], 0, 1)) * 255; d[i + 1] = (1 - ieClamp(out[1], 0, 1)) * 255; d[i + 2] = (1 - ieClamp(out[2], 0, 1)) * 255;
    }
}

// ─────────────────────────── aplicar numa camada (com seleção e prévia) ───────────────────────────
// o plano que o proc recebe: a camada crescida pela margem (dentro do documento)
function ieComMargem(L, margem, doc = IE.doc) {
    const o = { c: L.c, x: L.x, y: L.y };
    if (!(margem > 0)) return o;
    const R = ieRInter({ x: L.x - margem, y: L.y - margem, w: L.c.width + 2 * margem, h: L.c.height + 2 * margem }, ieRDoc(doc)) || ieRPlano(o);
    return ieCrescer({ ...o }, ieRUniao(ieRPlano(o), R), 0);
}
// proc(canvas) devolve um canvas novo do mesmo tamanho com o resultado; margem = quanto o efeito espalha
function ieProcessarCamada(L, proc, margem = 0, doc = IE.doc) {
    if (!L || !L.c) return null;
    const o = ieComMargem(L, margem, doc);
    const res = proc(o.c);
    if (!doc.sel) return { c: res, x: o.x, y: o.y };
    const R = ieRPlano(o);
    const s = ieSelRegiao(doc, R);
    const A = ieClonar(o.c), ax = ieCtx(A);
    ax.globalCompositeOperation = 'destination-out';
    ax.drawImage(s, 0, 0);
    const B = ieClonar(res), bx = ieCtx(B);
    bx.globalCompositeOperation = 'destination-in';
    bx.drawImage(s, 0, 0);
    ax.globalCompositeOperation = 'lighter';
    ax.drawImage(B, 0, 0);
    return { c: A, x: o.x, y: o.y };
}

function iePorPixel(ajuste) {
    return c => {
        const n = ieClonar(c), x = ieCtx(n);
        const img = x.getImageData(0, 0, n.width, n.height);
        ieAjustar(img.data, ajuste);
        x.putImageData(img, 0, 0);
        return n;
    };
}

// camada que dá para pintar? texto/objeto inteligente/forma pedem rasterizar (como o Photoshop)
async function iePodePintar(L, acao = 'editar os pixels') {
    if (!L) { ieToast(ieT('Selecione uma camada')); return false; }
    if (L.tipo === 'grupo' || L.tipo === 'ajuste') { ieToast(ieT('Selecione uma camada de pixels')); return false; }
    if (L.travas & 1 || L.travas & 0x80000000) { ieToast(ieT('Camada travada')); return false; }
    if (L.tipo !== 'pixel') {
        const nomes = { texto: 'de texto', inteligente: 'objeto inteligente', forma: 'de forma', preenchimento: 'de preenchimento' };
        const ok = await appConfirm({
            titulo: ieT('Rasterizar a camada?'),
            texto: `${ieT('Para')} ${ieT(acao)}, ${ieT('a camada')} ${ieT(nomes[L.tipo] || '')} "${L.nome}" ${ieT('vira uma camada de pixels (no Photoshop também deixa de ser editável).')}`,
            botoes: [{ rotulo: ieT('Cancelar'), valor: null }, { rotulo: ieT('Rasterizar'), valor: 1, tipo: 'primario' }],
        });
        if (!ok) return false;
        ieRasterizar(L);
    }
    return true;
}
function ieRasterizar(L, doc = IE.doc) {
    if (!L || L.tipo === 'pixel' || L.tipo === 'grupo' || L.tipo === 'ajuste') return;
    L.tipo = 'pixel';
    L.rasterizar = true;
    L.sujoPx = true;
    delete L.txt; delete L.texto; delete L.c0; delete L.tf; delete L.tfBase; delete L.textoNovo;
    ieInvalidar(L);
    ieUiCamadas?.();
}

// ─────────────────────────── filtros inteligentes (objeto inteligente) ───────────────────────────
// Como no Photoshop: filtro/ajuste num objeto inteligente não mexe nos pixels — entra em L.filtrosInt =
// [{cmd: 'f:gaussiano' | 'aj:niveis' | 'direto:Inverter', titulo, vals, on}] e a camada é refeita do original (L.c0)
// com a transformação (L.tf) e os filtros na ordem. Lista embaixo da camada (seta), olho por filtro, duplo clique edita.
function ieIntDef(cmd) {
    IE._intDefs = IE._intDefs || {};
    if (IE._intDefs[cmd]) return IE._intDefs[cmd];
    let def = null;
    if (cmd.startsWith('direto:')) def = IE._intDiretos?.[cmd] || null;
    else {
        const fn = cmd.startsWith('aj:') ? IE_AJUSTES[cmd.slice(3)] : cmd.startsWith('f:') ? IE_FILTROS[cmd.slice(2)] : null;
        if (fn) { IE._capturar = true; IE._capturado = null; try { fn(); } catch (e) { /* sem definição */ } finally { IE._capturar = false; } def = IE._capturado; }
    }
    if (def) IE._intDefs[cmd] = def;
    return def;
}
function ieIntPlano(L, tf = L.tf, lista = L.filtrosInt) {
    let o = ieTransformarPlano({ c: L.c0.c, x: L.c0.x, y: L.c0.y }, tf || IE_ID) || { c: L.c0.c, x: L.c0.x, y: L.c0.y };
    if (L.filtrosOff) return o;
    const sem = { w: IE.doc.w, h: IE.doc.h, sel: null };   // filtro inteligente vale na camada toda
    for (const f of lista || []) {
        const def = f.on && ieIntDef(f.cmd);
        if (!def) continue;
        const p = def.proc ? def.proc(f.vals) : iePorPixel(def.ajuste(f.vals));
        o = ieProcessarCamada(o, p, def.margem ? def.margem(f.vals) : 0, sem) || o;
    }
    return o;
}
function ieIntAtualizar(L, Rantes = ieRCamada(L)) {
    const o = ieIntPlano(L);
    L.c = o.c; L.x = o.x; L.y = o.y; L.sujoPx = true;
    ieInvalidar(L); ieCamadaMudou(L, Rantes);
}
// novo filtro inteligente (idx < 0) ou editar o idx-ésimo, com o diálogo do filtro e prévia ao vivo
async function ieIntFiltro(L, def, cmd, idx = -1) {
    const Rantes = ieRCamada(L), atual = idx >= 0 ? L.filtrosInt[idx] : null;
    const campos = (def.campos || []).map(c => (atual && c.id in atual.vals ? { ...c, valor: atual.vals[c.id] } : c));
    const lista = vals => { const l = (L.filtrosInt || []).map((f, i) => (i === idx ? { ...f, vals } : f)); if (idx < 0) l.push({ cmd, vals, on: true }); return l; };
    let vals = {};
    if (def.janela) {   // janela própria (Dissolver): recebe o plano como chega a este filtro (com os de antes dele)
        const antes = ieIntPlano(L, L.tf, (L.filtrosInt || []).slice(0, idx < 0 ? undefined : idx));
        vals = await def.janela(ieComMargem(antes, def.margem ? def.margem({}) : 0, { w: IE.doc.w, h: IE.doc.h }), atual && atual.vals);
        if (!vals) return;
    } else if (campos.length) {
        vals = await ieDialogo({ titulo: def.titulo, campos, largura: def.largura, lado: def.lado, previa: v => { L._tfPrev = ieIntPlano(L, L.tf, lista(v)); ieCamadaMudou(L, Rantes); } });
        L._tfPrev = null;
        if (!vals) { ieCamadaMudou(L, Rantes); return; }
    }
    L.filtrosInt = lista(vals).map((f, i) => (i === (idx < 0 ? L.filtrosInt?.length || 0 : idx) ? { ...f, titulo: def.titulo } : f));
    L.filtrosAberto = true;
    ieIntAtualizar(L, Rantes);
    ieHist(ieT(def.titulo));
    ieUiCamadas?.();
}

// aplica um processamento destrutivo na camada ativa, com diálogo e prévia (objeto inteligente: filtro inteligente)
async function ieAplicarComDialogo(def) {
    if (IE._capturar) { IE._capturado = def; return; }   // ieIntDef: só quer a definição
    const { titulo, campos, ajuste, proc, margem, largura, lado } = def;
    const doc = IE.doc, L = ieAtiva(doc);
    if (!doc) return;
    if (doc.mascaraAlvo && L && L.m) { ieToast(ieT('Ajustes valem para os pixels: clique na miniatura da camada')); return; }
    if (L && L.tipo === 'inteligente' && L.c0 && IE._cmdAtual) return ieIntFiltro(L, def, IE._cmdAtual);
    if (!(await iePodePintar(L, 'aplicar o ajuste'))) return;
    if (!L.c) { ieToast(ieT('A camada está vazia')); return; }
    const fazer = vals => {
        const p = proc ? proc(vals) : iePorPixel(ajuste(vals));
        return ieProcessarCamada(L, p, margem ? margem(vals) : 0, doc);
    };
    const Rantes = ieRCamada(L);
    const ok = def.janela ? await def.janela(ieComMargem(L, margem ? margem({}) : 0, doc), null, doc) : !campos || !campos.length ? {} : await ieDialogo({   // sem parâmetros (Média, Faceta...): aplica direto, como no Photoshop
        titulo, campos, largura, lado,
        previa: vals => { L._tfPrev = fazer(vals); ieCamadaMudou(L, Rantes); },
    });
    const vals = ok;
    L._tfPrev = null;
    if (!vals) { ieCamadaMudou(L, Rantes); return; }
    const r = fazer(vals);
    ieGravavel(L);
    L.c = r.c; L.x = r.x; L.y = r.y;
    L.sujoPx = true;
    ieCamadaMudou(L, Rantes);
    ieHist(ieT(titulo));
    IE.ultimoFiltro = { titulo, ajuste, proc, margem, vals, cmd: IE._cmdAtual };   // Filtro > Último filtro (Ctrl+F)
}

// Ctrl+F: o último filtro/ajuste com os mesmos valores, sem abrir o diálogo
async function ieRepetirFiltro() {
    const u = IE.ultimoFiltro, doc = IE.doc, L = ieAtiva(doc);
    if (!u || !doc) { ieToast(ieT('Nenhum filtro aplicado ainda')); return; }
    if (L && L.tipo === 'inteligente' && L.c0 && u.cmd) {
        const R = ieRCamada(L);
        L.filtrosInt = [...(L.filtrosInt || []), { cmd: u.cmd, titulo: u.titulo, vals: u.vals, on: true }];
        L.filtrosAberto = true; ieIntAtualizar(L, R); ieHist(ieT(u.titulo)); ieUiCamadas?.(); return;
    }
    if (!(await iePodePintar(L, 'aplicar o filtro'))) return;
    if (!L.c) return;
    const Rantes = ieRCamada(L);
    const r = ieProcessarCamada(L, u.proc ? u.proc(u.vals) : iePorPixel(u.ajuste(u.vals)), u.margem ? u.margem(u.vals) : 0, doc);
    ieGravavel(L);
    L.c = r.c; L.x = r.x; L.y = r.y; L.sujoPx = true;
    ieCamadaMudou(L, Rantes);
    ieHist(ieT(u.titulo));
}

const IE_AJUSTES = {
    brilho: () => ieAplicarComDialogo({
        titulo: 'Brilho/Contraste',
        campos: [{ id: 'br', rotulo: 'Brilho', min: -150, max: 150, valor: 0 }, { id: 'ct', rotulo: 'Contraste', min: -50, max: 100, valor: 0 },
            { id: 'legado', rotulo: 'Usar legado', tipo: 'check', valor: false }],
        ajuste: v => ({ t: 'brightnesscontrast', br: v.br, ct: v.ct, legado: v.legado }),
    }),
    niveis: () => ieAplicarComDialogo({
        titulo: 'Níveis',
        campos: [{ id: 'i0', rotulo: 'Entrada: preto', min: 0, max: 253, valor: 0 }, { id: 'g', rotulo: 'Entrada: meios-tons (gama)', min: 0.1, max: 9.99, passo: 0.01, valor: 1 },
            { id: 'i1', rotulo: 'Entrada: branco', min: 2, max: 255, valor: 255 }, { id: 'o0', rotulo: 'Saída: preto', min: 0, max: 255, valor: 0 },
            { id: 'o1', rotulo: 'Saída: branco', min: 0, max: 255, valor: 255 }],
        ajuste: v => ({ t: 'levels', canais: [[v.i0, Math.max(v.i0 + 2, v.i1), v.o0, v.o1, v.g]] }),
    }),
    curvas: () => ieAplicarComDialogo({
        titulo: 'Curvas',
        campos: [{ id: 'curva', rotulo: 'Curva (RGB)', tipo: 'curva', valor: [[0, 0], [255, 255]] }],
        ajuste: v => ({ t: 'curves', canais: { 0: v.curva } }),
    }),
    exposicao: () => ieAplicarComDialogo({
        titulo: 'Exposição',
        campos: [{ id: 'exp', rotulo: 'Exposição', min: -5, max: 5, passo: 0.01, valor: 0 }, { id: 'off', rotulo: 'Deslocamento', min: -0.5, max: 0.5, passo: 0.001, valor: 0 },
            { id: 'gama', rotulo: 'Correção de gama', min: 0.01, max: 9.99, passo: 0.01, valor: 1 }],
        ajuste: v => ({ t: 'exposure', exp: v.exp, off: v.off, gama: v.gama }),
    }),
    vibratilidade: () => ieAplicarComDialogo({
        titulo: 'Vibratilidade',
        campos: [{ id: 'vib', rotulo: 'Vibratilidade', min: -100, max: 100, valor: 0 }, { id: 'sat', rotulo: 'Saturação', min: -100, max: 100, valor: 0 }],
        ajuste: v => ({ t: 'vibrance', vib: v.vib, sat: v.sat }),
    }),
    matiz: () => ieAplicarComDialogo({
        titulo: 'Matiz/Saturação',
        campos: [{ id: 'h', rotulo: 'Matiz', min: -180, max: 180, valor: 0 }, { id: 's', rotulo: 'Saturação', min: -100, max: 100, valor: 0 },
            { id: 'l', rotulo: 'Luminosidade', min: -100, max: 100, valor: 0 }, { id: 'colorir', rotulo: 'Colorir', tipo: 'check', valor: false }],
        ajuste: v => (v.colorir ? { t: 'huesaturation', colorir: true, col: [((v.h % 360) + 360) % 360, Math.max(0, v.s) || 25, v.l] } : { t: 'huesaturation', h: v.h, s: v.s, l: v.l }),
    }),
    equilibrio: () => ieAplicarComDialogo({
        titulo: 'Equilíbrio de cores',
        campos: [{ id: 'tom', rotulo: 'Tons', tipo: 'select', opcoes: [['medios', 'Meios-tons'], ['sombras', 'Sombras'], ['luzes', 'Realces']], valor: 'medios' },
            { id: 'cr', rotulo: 'Ciano ↔ Vermelho', min: -100, max: 100, valor: 0 }, { id: 'mg', rotulo: 'Magenta ↔ Verde', min: -100, max: 100, valor: 0 },
            { id: 'yb', rotulo: 'Amarelo ↔ Azul', min: -100, max: 100, valor: 0 }, { id: 'lum', rotulo: 'Preservar luminosidade', tipo: 'check', valor: true }],
        ajuste: v => ({ t: 'colorbalance', [v.tom]: [v.cr, v.mg, v.yb], lum: v.lum }),
    }),
    pb: () => ieAplicarComDialogo({
        titulo: 'Preto e branco',
        campos: [['r', 'Vermelhos', 40], ['y', 'Amarelos', 60], ['g', 'Verdes', 40], ['c', 'Cianos', 60], ['b', 'Azuis', 20], ['m', 'Magentas', 80]]
            .map(([id, rotulo, valor]) => ({ id, rotulo, min: -200, max: 300, valor })),
        ajuste: v => ({ t: 'blackandwhite', p: [v.r, v.y, v.g, v.c, v.b, v.m] }),
    }),
    filtroFoto: () => ieAplicarComDialogo({
        titulo: 'Filtro de fotos',
        campos: [{ id: 'cor', rotulo: 'Cor', tipo: 'cor', valor: '#ec8a00' }, { id: 'dens', rotulo: 'Densidade', min: 1, max: 100, valor: 25 },
            { id: 'lum', rotulo: 'Preservar luminosidade', tipo: 'check', valor: true }],
        ajuste: v => ({ t: 'photofilter', cor: ieHexRgb(v.cor), dens: v.dens, lum: v.lum }),
    }),
    limiar: () => ieAplicarComDialogo({ titulo: 'Limiar', campos: [{ id: 'n', rotulo: 'Nível de limiar', min: 1, max: 255, valor: 128 }], ajuste: v => ({ t: 'threshold', n: v.n }) }),
    posterizar: () => ieAplicarComDialogo({ titulo: 'Posterizar', campos: [{ id: 'n', rotulo: 'Níveis', min: 2, max: 255, valor: 4 }], ajuste: v => ({ t: 'posterize', n: v.n }) }),
    inverter: () => ieAplicarDireto('Inverter', { t: 'invert' }),
    dessaturar: () => ieAplicarDireto('Dessaturar', { t: 'desaturar' }),
};

async function ieAplicarDireto(nome, ajuste) {
    const cmd = 'direto:' + nome;
    (IE._intDiretos = IE._intDiretos || {})[cmd] = { titulo: nome, campos: [], ajuste: () => ajuste };
    if (IE._capturar) { IE._capturado = IE._intDiretos[cmd]; return; }
    const doc = IE.doc, L = ieAtiva(doc);
    if (!doc) return;
    if (L && L.tipo === 'inteligente' && L.c0 && !doc.mascaraAlvo) return ieIntFiltro(L, IE._intDiretos[cmd], cmd);
    if (doc.mascaraAlvo && L && L.m) {   // inverter na máscara (Ctrl+I com a máscara selecionada)
        if (ajuste.t !== 'invert') return;
        ieGravavel(L, 'm');
        const R = { x: Math.min(L.m.x, 0), y: Math.min(L.m.y, 0), w: 0, h: 0 };
        ieCrescer(L.m, ieRUniao(ieRDoc(doc), ieRPlano(L.m) || R), L.m.fundo);
        const c = ieCanvas(L.m.c.width, L.m.c.height), x = ieCtx(c);
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'destination-out';
        x.drawImage(L.m.c, 0, 0);
        L.m.c = c; L.m.fundo = 255 - (L.m.fundo || 0);
        L.sujoM = true;
        ieCamadaMudou(L, ieRDoc(doc));
        ieHist(ieT('Inverter máscara'));
        return;
    }
    if (!(await iePodePintar(L, 'aplicar o ajuste'))) return;
    if (!L.c) return;
    const Rantes = ieRCamada(L);
    const r = ieProcessarCamada(L, iePorPixel(ajuste), 0, doc);
    ieGravavel(L);
    L.c = r.c; L.x = r.x; L.y = r.y; L.sujoPx = true;
    ieCamadaMudou(L, Rantes);
    ieHist(ieT(nome));
}

// ─────────────────────────── filtros ───────────────────────────
function ieDesfocar(c, raio) {
    const n = ieCanvas(c.width, c.height), x = ieCtx(n);
    if (raio <= 0) { x.drawImage(c, 0, 0); return n; }
    x.filter = `blur(${raio}px)`;
    x.drawImage(c, 0, 0);
    return n;
}

// ── Distorcer (Ondulação, Respingos, Torcer, como no Photoshop) ──
// Ruído suave −1..1 (ruído de valor: grade aleatória a cada `cel` pixels, interpolada em cosseno; 2 oitavas)
function ieRuidoSuave(w, h, cel, semente) {
    const out = new Float32Array(w * h);
    let s = semente >>> 0 || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
    [[cel, 0.7], [Math.max(1, cel / 2.7), 0.3]].forEach(([c, peso]) => {
        const gw = Math.ceil(w / c) + 2, gh = Math.ceil(h / c) + 2, g = new Float32Array(gw * gh);
        for (let i = 0; i < g.length; i++) g[i] = rnd();
        const suave = t => (1 - Math.cos(t * Math.PI)) / 2;
        for (let y = 0; y < h; y++) {
            const gy = y / c, y0 = Math.floor(gy), ty = suave(gy - y0);
            for (let x = 0; x < w; x++) {
                const gx = x / c, x0 = Math.floor(gx), tx = suave(gx - x0), k = y0 * gw + x0;
                const a = g[k] + (g[k + 1] - g[k]) * tx, b = g[k + gw] + (g[k + gw + 1] - g[k + gw]) * tx;
                out[y * w + x] += (a + (b - a) * ty) * peso;
            }
        }
    });
    return out;
}
// Desloca cada pixel: o pixel (x, y) do resultado vem de (x + dx, y + dy) da imagem (bilinear, fora = transparente)
function ieDeslocar(c, dxy) {
    const w = c.width, h = c.height, src = ieCtx(c).getImageData(0, 0, w, h).data;
    const n = ieCanvas(w, h), nx = ieCtx(n), img = nx.createImageData(w, h), o = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const [dx, dy] = dxy(x, y), sx = x + dx, sy = y + dy;
        const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, j = (y * w + x) * 4;
        let r = 0, g = 0, b = 0, a = 0;
        for (const [px, py, wt] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) {
            if (px < 0 || py < 0 || px >= w || py >= h || !wt) continue;
            const i = (py * w + px) * 4, al = src[i + 3] * wt;
            r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al;
        }
        if (a > 0) { o[j] = r / a; o[j + 1] = g / a; o[j + 2] = b / a; o[j + 3] = a; }
    }
    nx.putImageData(img, 0, 0);
    return n;
}

const IE_FILTROS = {
    // Ondulação: ondas irregulares (borda de papel rasgado, água); tamanho = largura das ondas
    ondulacao: () => ieAplicarComDialogo({
        titulo: 'Ondulação',
        campos: [{ id: 'q', rotulo: 'Quantidade (%)', min: -999, max: 999, valor: 100 },
            { id: 'tam', rotulo: 'Tamanho', tipo: 'select', opcoes: [['p', 'Pequeno'], ['m', 'Médio'], ['g', 'Grande']], valor: 'm' }],
        proc: v => c => {
            const cel = { p: 6, m: 14, g: 32 }[v.tam] || 14, amp = v.q / 100 * cel * 0.45;
            const nx = ieRuidoSuave(c.width, c.height, cel, 101), ny = ieRuidoSuave(c.width, c.height, cel, 202);
            return ieDeslocar(c, (x, y) => { const k = y * c.width + x; return [nx[k] * amp, ny[k] * amp]; });
        },
        margem: v => Math.ceil(Math.abs(v.q) / 100 * 15),
    }),
    // Respingos: cada pixel vem de um ponto sorteado em volta (raio), alisado pela suavização: borda áspera e fibrosa
    respingos: () => ieAplicarComDialogo({
        titulo: 'Respingos',
        campos: [{ id: 'r', rotulo: 'Raio de borrifo', min: 0, max: 25, valor: 10 }, { id: 'suave', rotulo: 'Suavização', min: 1, max: 15, valor: 5 }],
        proc: v => c => {
            const cel = Math.max(1, v.suave * 0.6);
            const nx = ieRuidoSuave(c.width, c.height, cel, 303), ny = ieRuidoSuave(c.width, c.height, cel, 404);
            return ieDeslocar(c, (x, y) => { const k = y * c.width + x; return [nx[k] * v.r, ny[k] * v.r]; });
        },
        margem: v => Math.ceil(v.r),
    }),
    // Torcer: gira mais no centro e nada na borda do círculo inscrito
    torcer: () => ieAplicarComDialogo({
        titulo: 'Torcer',
        campos: [{ id: 'ang', rotulo: 'Ângulo (°)', min: -999, max: 999, valor: 50 }],
        proc: v => c => {
            const cx = c.width / 2, cy = c.height / 2, R = Math.min(cx, cy), a0 = v.ang * Math.PI / 180;
            return ieDeslocar(c, (x, y) => {
                const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
                if (d >= R) return [0, 0];
                const a = a0 * (1 - d / R), cs = Math.cos(a), sn = Math.sin(a);
                return [dx * cs - dy * sn - dx, dx * sn + dy * cs - dy];
            });
        },
    }),
    gaussiano: () => ieAplicarComDialogo({
        titulo: 'Desfoque gaussiano',
        campos: [{ id: 'r', rotulo: 'Raio (px)', min: 0.1, max: 250, passo: 0.1, valor: 4 }],
        proc: v => c => ieDesfocar(c, v.r),
        margem: v => Math.ceil(v.r * 3),
    }),
    movimento: () => ieAplicarComDialogo({
        titulo: 'Desfoque de movimento',
        campos: [{ id: 'ang', rotulo: 'Ângulo', min: -90, max: 90, valor: 0 }, { id: 'd', rotulo: 'Distância (px)', min: 1, max: 500, valor: 20 }],
        proc: v => c => {
            const n = ieCanvas(c.width, c.height), x = ieCtx(n);
            const passos = Math.min(64, Math.max(4, Math.round(v.d / 2)));
            const a = -v.ang * Math.PI / 180;
            for (let k = 0; k < passos; k++) {
                const t = (k / (passos - 1) - 0.5) * v.d;
                x.globalAlpha = 1 / (k + 1);
                x.drawImage(c, Math.cos(a) * t, Math.sin(a) * t);
            }
            return n;
        },
        margem: v => Math.ceil(v.d),
    }),
    nitidez: () => ieAplicarComDialogo({
        titulo: 'Máscara de nitidez',
        campos: [{ id: 'q', rotulo: 'Quantidade (%)', min: 1, max: 500, valor: 80 }, { id: 'r', rotulo: 'Raio (px)', min: 0.1, max: 100, passo: 0.1, valor: 1.5 },
            { id: 'lim', rotulo: 'Limiar', min: 0, max: 255, valor: 0 }],
        proc: v => c => {
            const b = ieDesfocar(c, v.r);
            const n = ieClonar(c), x = ieCtx(n);
            const A = x.getImageData(0, 0, n.width, n.height), B = ieCtx(b).getImageData(0, 0, n.width, n.height);
            const a = A.data, bd = B.data, k = v.q / 100;
            for (let i = 0; i < a.length; i += 4) {
                if (!a[i + 3]) continue;
                for (let q = 0; q < 3; q++) {
                    const dif = a[i + q] - bd[i + q];
                    if (Math.abs(dif) >= v.lim) a[i + q] = a[i + q] + dif * k;
                }
            }
            x.putImageData(A, 0, 0);
            return n;
        },
    }),
    ruido: () => ieAplicarComDialogo({
        titulo: 'Adicionar ruído',
        campos: [{ id: 'q', rotulo: 'Quantidade (%)', min: 0.1, max: 400, passo: 0.1, valor: 10 }, { id: 'mono', rotulo: 'Monocromático', tipo: 'check', valor: false }],
        proc: v => c => {
            const n = ieClonar(c), x = ieCtx(n);
            const A = x.getImageData(0, 0, n.width, n.height), a = A.data, k = v.q / 100 * 255;
            let s = 12345;
            const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
            for (let i = 0; i < a.length; i += 4) {
                if (!a[i + 3]) continue;
                if (v.mono) { const r = rnd() * k; a[i] += r; a[i + 1] += r; a[i + 2] += r; }
                else { a[i] += rnd() * k; a[i + 1] += rnd() * k; a[i + 2] += rnd() * k; }
            }
            x.putImageData(A, 0, 0);
            return n;
        },
    }),
    mosaico: () => ieAplicarComDialogo({
        titulo: 'Mosaico',
        campos: [{ id: 't', rotulo: 'Tamanho da célula (px)', min: 2, max: 200, valor: 10 }],
        proc: v => c => {
            const w = Math.max(1, Math.round(c.width / v.t)), h = Math.max(1, Math.round(c.height / v.t));
            const p = ieCanvas(w, h), px = ieCtx(p);
            px.imageSmoothingQuality = 'high';
            px.drawImage(c, 0, 0, w, h);
            const n = ieCanvas(c.width, c.height), x = ieCtx(n);
            x.imageSmoothingEnabled = false;
            x.drawImage(p, 0, 0, c.width, c.height);
            return n;
        },
    }),
};

// ─────────────────────────── Filtro Camera Raw ───────────────────────────
// Mesma conta do painel Luz e Cor do editor de vídeo (veLcBuildLut, editor-lc.js): os ajustes de cor viram uma
// LUT 3D aplicada aqui por interpolação trilinear; nitidez (máscara de nitidez na luma) e vinheta vêm depois.
function ieAplicarLut3d(d, lut, N) {
    const n1 = N - 1, s = n1 / 255;
    for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const fr = d[i] * s, fg = d[i + 1] * s, fb = d[i + 2] * s;
        const r0 = Math.min(fr | 0, n1 - 1), g0 = Math.min(fg | 0, n1 - 1), b0 = Math.min(fb | 0, n1 - 1);
        const tr = fr - r0, tg = fg - g0, tb = fb - b0;
        for (let c = 0; c < 3; c++) {
            const at = (r, g, b) => lut[((b * N + g) * N + r) * 3 + c];
            const c00 = at(r0, g0, b0) * (1 - tr) + at(r0 + 1, g0, b0) * tr;
            const c10 = at(r0, g0 + 1, b0) * (1 - tr) + at(r0 + 1, g0 + 1, b0) * tr;
            const c01 = at(r0, g0, b0 + 1) * (1 - tr) + at(r0 + 1, g0, b0 + 1) * tr;
            const c11 = at(r0, g0 + 1, b0 + 1) * (1 - tr) + at(r0 + 1, g0 + 1, b0 + 1) * tr;
            const v = (c00 * (1 - tg) + c10 * tg) * (1 - tb) + (c01 * (1 - tg) + c11 * tg) * tb;
            d[i + c] = v * 255 + 0.5;
        }
    }
}

const IE_RAW_CAMPOS = [
    ['Balanço de branco', [['temp', 'Temperatura', -100, 100, 0], ['tint', 'Matiz', -100, 100, 0]]],
    ['Tom', [['exp', 'Exposição', -4, 4, 0, 0.05], ['ct', 'Contraste', -100, 100, 0], ['hi', 'Realces', -100, 100, 0], ['sh', 'Sombras', -100, 100, 0],
        ['wh', 'Brancos', -100, 100, 0], ['bl', 'Pretos', -100, 100, 0]]],
    ['Presença', [['vib', 'Vibração', -100, 100, 0], ['sat', 'Saturação', -100, 100, 0]]],
    ['Efeitos', [['fade', 'Filme desbotado', 0, 100, 0], ['sharp', 'Nitidez', 0, 150, 0], ['vig', 'Vinheta', -100, 100, 0]]],
];

function ieCameraRawProc(v) {
    const lc = { temp: v.temp, tint: v.tint, exp: v.exp, ct: v.ct, hi: v.hi, sh: v.sh, wh: v.wh, bl: v.bl, sat: 100 + v.sat, fade: v.fade, vib: v.vib,
        ls: 0, lm: 0, lh: 0, cw: {}, cv: { m: (v.curva || [[0, 0], [255, 255]]).map(([a, b]) => [a / 255, b / 255]) } };
    const neutro = typeof veLcColorNeutral === 'function' && veLcColorNeutral(lc);
    const lut = !neutro && typeof veLcBuildLut === 'function' ? veLcBuildLut(lc, 33) : null;
    return c => {
        let n = ieClonar(c);
        let x = ieCtx(n);
        if (lut) {
            const img = x.getImageData(0, 0, n.width, n.height);
            ieAplicarLut3d(img.data, lut, 33);
            x.putImageData(img, 0, 0);
        }
        if (v.sharp > 0) {
            const b = ieDesfocar(n, 1 + v.sharp / 150);
            const A = x.getImageData(0, 0, n.width, n.height), B = ieCtx(b).getImageData(0, 0, n.width, n.height);
            const a = A.data, bd = B.data, k = v.sharp / 100 * 1.2;
            for (let i = 0; i < a.length; i += 4) {
                if (!a[i + 3]) continue;
                // só na luma (não cria franja colorida)
                const dl = (0.2126 * (a[i] - bd[i]) + 0.7152 * (a[i + 1] - bd[i + 1]) + 0.0722 * (a[i + 2] - bd[i + 2])) * k;
                a[i] += dl; a[i + 1] += dl; a[i + 2] += dl;
            }
            x.putImageData(A, 0, 0);
        }
        if (v.vig) {
            // vinheta pós-corte: escurece (ou clareia) as bordas da camada, com o alfa preservado
            const w = n.width, h = n.height, g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) / 2);
            const k = Math.abs(v.vig) / 100;
            g.addColorStop(0, v.vig < 0 ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)');
            g.addColorStop(1, v.vig < 0 ? `rgba(0,0,0,${k})` : `rgba(255,255,255,${k})`);
            x.globalCompositeOperation = 'source-atop';
            x.fillStyle = g;
            x.fillRect(0, 0, w, h);
            x.globalCompositeOperation = 'source-over';
        }
        return n;
    };
}

IE_FILTROS.cameraRaw = () => ieAplicarComDialogo({
    titulo: 'Filtro Camera Raw',
    largura: 340, lado: true,
    campos: IE_RAW_CAMPOS.flatMap(([grupo, cs]) => [{ id: '_' + grupo, rotulo: grupo, tipo: 'titulo' },
        ...cs.map(([id, rotulo, min, max, valor, passo]) => ({ id, rotulo, min, max, valor, passo }))])
        .concat([{ id: '_curva', rotulo: 'Curva de tons', tipo: 'titulo' }, { id: 'curva', rotulo: 'Curva', tipo: 'curva', valor: [[0, 0], [255, 255]] }]),
    proc: v => ieCameraRawProc(v),
});
