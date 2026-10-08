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

// Brilho/Contraste moderno = curvas MEDIDAS no Photoshop (rampa de cinza, grade brilho -150..150 × contraste -50..100 de
// 25 em 25; 13×7 curvas de 256 bytes; não depende do conteúdo da imagem). Entre pontos da grade: bilinear (erro ≤ ~3).
// Remedir: D:/kanivete_testes/ps_bc/grade.py. Antes era uma fórmula que, com contraste negativo, levava o preto ao cinza.
const IE_BC_PS = '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/v7+/v7+/v7+/v7+/v7+/v7+////////////////////////AAEDBAYHCQoMDQ8REhQWGBkbHR8hIyUnKSstLzE0Njg6PT9BREZJS05QU1VYWl1gY2Voa25xdHd5fH+DhoiLjpGUl5mcn6GkpqmrrbCytLa4ury+wMHDxcbIysvNzs/R0tPV1tfY2drb3N3e3+Dh4uPk5OXm5+fo6enq6+vs7O3t7u7v7/Dw8fHy8vLz8/P09PT19fX29vb29/f39/j4+Pj5+fn5+fn6+vr6+vr7+/v7+/v7+/z8/Pz8/Pz8/Pz9/f39/f39/f39/f39/f3+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7//////////////////////////////wABAgMEBQYICQoMDQ4QERMVFhgaHB0fISMlJykrLjAyNDc5PD5BQ0ZIS05RU1ZZXF9iZWhsb3J1eXx/g4aKjZCTlpqdoKKlqKutsLK1t7m7vsDCxMXHycvMztDR09TV19jZ2tzd3t/g4eLj5OXm5ufo6enq6+vs7e3u7u/v8PDx8fLy8/Pz9PT09fX19vb29/f39/j4+Pj4+fn5+fn6+vr6+vr7+/v7+/v7+/z8/Pz8/Pz8/Pz9/f39/f39/f39/f39/f3+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v////////////////////////////////////////8AAQECAwMEBQYHCAkKDA0OEBETFBYYGhsdHyEjJSgqLC4xMzY4Oz5AQ0ZJTE9SVVhcX2JmaW1wdHh8f4OHi46SlpmcoKOmqayvsrW3ury/wcPFx8nLzc/R0tTW19na293e3+Di4+Tl5ufo6Onq6+zs7e7u7/Dw8fHy8vPz9PT09fX19vb29/f3+Pj4+Pn5+fn6+vr6+vr7+/v7+/v7/Pz8/Pz8/Pz8/f39/f39/f39/f39/f39/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v//////////////////////////////////////////////////////////AAQHCg4RFRgbHiIlKCsuMTQ3Ojw/QkVHSkxPUVRWWVtdYGJkZmhqbG5wcnR2eHp7fX+AgoOFh4mKjI6QkZOVl5manJ6goqSlp6mrra6wsrO1t7i6u72+wMHDxMXHyMnLzM3O0NHS09TV1tfY2drb3N3e3+Dh4eLj5OTl5ufn6Onp6urr6+zt7e7u7+/w8PDx8fLy8vPz8/T09PX19fb29vf39/f4+Pj4+Pn5+fn5+vr6+vr6+vv7+/v7+/v8/Pz8/Pz8/Pz8/f39/f39/f39/f39/f39/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/////////////////////////wADBgkMDxIVGBseICMmKSwuMTQ3OTw/QURGSUtOUVNVWFpdX2FkZmhrbW9xdHZ4enx+gIOFh4mLjY+Rk5WXmZudn6Gjpaepq62vsbK0tri5u72+wMHDxMbHyMrLzM7P0NHS1NXW19jZ2tvc3d7f3+Dh4uPj5OXm5ufo6Onq6uvr7Ozt7e7u7+/w8PHx8vLy8/Pz9PT09fX19vb29vf39/f4+Pj4+fn5+fn5+vr6+vr6+/v7+/v7+/v8/Pz8/Pz8/Pz8/f39/f39/f39/f39/f39/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v////////////////////////////8AAwUICg0PEhUXGhwfISQnKSwuMTM2OTs+QENFSEtNUFJVV1pdX2JkZ2psb3F0dnl8foGDhoiLjZCSlJeZm56goqSnqautr7Gztbe4ury+v8HDxMbHycrLzc7P0dLT1NXW2Nna29zd3t7f4OHi4+Pk5ebm5+jo6erq6+vs7e3u7u/v8PDw8fHy8vLz8/T09PT19fX29vb39/f39/j4+Pj5+fn5+fr6+vr6+vr7+/v7+/v7+/z8/Pz8/Pz8/Pz9/f39/f39/f39/f39/f3+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7/////////////////////////////////AAIEBggLDQ8RFBYYGh0fISQmKSsuMDM1ODo9P0JFR0pNUFJVWFtdYGNmaWxvcnV4e36BhIeKjY+SlZianZ+ipKeprK6wsrW3ubu9vsDCxMXHycrMzc/Q0dPU1dbX2drb3N3e3+Dh4eLj5OXl5ufo6Onq6uvr7O3t7u7v7/Dw8PHx8vLy8/P09PT19fX19vb29/f39/j4+Pj4+fn5+fn6+vr6+vr7+/v7+/v7+/z8/Pz8/Pz8/Pz8/f39/f39/f39/f39/f39/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7//////////////////////////////////////wACAwUHCAoMDhASFBYYGhwfISMlKCotLzI0Nzk8P0JER0pNUFNWWVxfY2ZpbHBzd3p+gYWIi4+SlZibnqGkpqmsrrGztri6vL/Bw8TGyMrLzc/Q0tPU1tfY2tvc3d7f4OHi4+Tl5ebn6Ojp6urr7Ozt7e7u7+/w8PHx8vLz8/P09PT19fX29vb29/f39/j4+Pj5+fn5+fr6+vr6+vr7+/v7+/v7/Pz8/Pz8/Pz8/Pz9/f39/f39/f39/f39/f3+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+//////////////////////////////////////////////8AAQIEBQYICQsMDhASExUXGRseICIkJyksLjEzNjk8P0JFSEtOUVVYXF9jZmpucnV5fYGFiY2RlJibnqKlqKuusLO2ubu+wMLExsjKzM7Q0tPV1tjZ2tzd3t/g4eLj5OXm5+jp6err7Ozt7u7v7/Dw8fHy8vPz8/T09fX19vb29vf39/j4+Pj4+fn5+fn6+vr6+vr7+/v7+/v7/Pz8/Pz8/Pz8/P39/f39/f39/f39/f39/f3+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+////////////////////////////////////////////////////////////AAEBAgMEBQYHCQoMDQ8QEhQWGBocHiEjJigrLTAzNjk8P0NGSU1QVFhcYGRobHB0eX2ChoqOkpaanqKlqayvsrW4u77Bw8bIyszO0NLU1tjZ29ze3+Di4+Tl5ufo6err6+zt7u7v8PDx8fLy8/P09PX19fb29/f39/j4+Pn5+fn5+vr6+vr7+/v7+/v7/Pz8/Pz8/Pz8/f39/f39/f39/f39/f3+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v///////////////////////////////////////////////////////////////////////////////w==';
let _ieBcTab = null;
function ieBcModerno(br, ct) {
    if (!_ieBcTab) _ieBcTab = Uint8Array.from(atob(IE_BC_PS), c => c.charCodeAt(0));
    const bi = (ieClamp(br, -150, 150) + 150) / 25, ci = (ieClamp(ct, -50, 100) + 50) / 25;
    const b0 = Math.min(11, Math.floor(bi)), c0 = Math.min(5, Math.floor(ci)), fb = bi - b0, fc = ci - c0;
    const T = (b, c, v) => _ieBcTab[(b * 7 + c) * 256 + v], l = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) l[v] = Math.round((T(b0, c0, v) * (1 - fc) + T(b0, c0 + 1, v) * fc) * (1 - fb) + (T(b0 + 1, c0, v) * (1 - fc) + T(b0 + 1, c0 + 1, v) * fc) * fb);
    return l;
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
            } else lut = ieBcModerno(br, ct);
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
    const antes = { c: L.c, x: L.x, y: L.y };   // para o Editar › Atenuar
    L.c = r.c; L.x = r.x; L.y = r.y;
    L.sujoPx = true;
    ieCamadaMudou(L, Rantes);
    ieHist(ieT(titulo));
    if (typeof ieAtenuavel === 'function') ieAtenuavel(L, 'c', antes, titulo, doc);
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
    const antes = { c: L.c, x: L.x, y: L.y };
    L.c = r.c; L.x = r.x; L.y = r.y; L.sujoPx = true;
    ieCamadaMudou(L, Rantes);
    ieHist(ieT(u.titulo));
    if (typeof ieAtenuavel === 'function') ieAtenuavel(L, 'c', antes, u.titulo, doc);
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
    const antes = { c: L.c, x: L.x, y: L.y };
    L.c = r.c; L.x = r.x; L.y = r.y; L.sujoPx = true;
    ieCamadaMudou(L, Rantes);
    ieHist(ieT(nome));
    if (typeof ieAtenuavel === 'function') ieAtenuavel(L, 'c', antes, nome, doc);
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

// o Filtro Camera Raw (janela, conta e barras) está em imagem-cameraraw.js
