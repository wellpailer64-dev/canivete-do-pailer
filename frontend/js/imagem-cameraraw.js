// =========================================================
// Editor de Imagem — Filtro > Filtro Camera Raw (Shift+Ctrl+A), em janela própria como o do Photoshop:
// a foto à esquerda (zoom, mão, antes/depois) e os ajustes à direita, com histograma e as seções do ACR —
// Básico (balanço de branco, tom, Textura, Claridade, Remover névoa, Vibratilidade, Saturação), Curva (RGB e canais),
// Detalhes (Nitidez com raio/detalhe/mascaramento, Redução de ruído de luminância e de cor), Mistura de cores (HSL nas
// 8 cores), Gradação de cores (rodas de Sombras, Meios-tons, Realces e Global) e Efeitos (Granulação, Vinheta).
// A cor (WB, tom, curvas, HSL, rodas) é a mesma conta do Luz e Cor do editor de vídeo (veLcBuildLut → LUT 3D);
// o resto é local (desfoques na luma). A prévia calcula só a área visível na escala do zoom (raios × e).
// Barras finas com "resistência": arrastar anda metade do mouse (Shift = fino), clique solto pula, duplo clique zera.
// vals antigos (temp, ..., sharp, vig, curva) continuam valendo (filtros inteligentes salvos).
// =========================================================

const IE_CR_HSL = [['r', 'Vermelhos', 0, '#e0413a'], ['o', 'Laranjas', 30, '#ee8a2c'], ['y', 'Amarelos', 60, '#e8d33a'], ['g', 'Verdes', 120, '#3fbf4a'],
    ['a', 'Águas', 180, '#3ac6c8'], ['b', 'Azuis', 240, '#3a6ee0'], ['p', 'Roxos', 270, '#8a4fe0'], ['m', 'Magentas', 300, '#d84fc4']];
// [id, rótulo, min, max, padrão, passo, fundo da barra]
const IE_CR_SECOES = [
    ['basico', 'Básico', [
        ['_', 'Balanço de branco'], ['temp', 'Temperatura', -100, 100, 0, 1, 'linear-gradient(90deg,#3a6fd8,#d8d8d8,#e0b23a)'], ['tint', 'Matiz', -100, 100, 0, 1, 'linear-gradient(90deg,#3fbf4a,#d8d8d8,#d84fc4)'],
        ['_', 'Tom'], ['exp', 'Exposição', -5, 5, 0, 0.05, 'linear-gradient(90deg,#111,#eee)'], ['ct', 'Contraste', -100, 100, 0], ['hi', 'Realces', -100, 100, 0], ['sh', 'Sombras', -100, 100, 0],
        ['wh', 'Brancos', -100, 100, 0], ['bl', 'Pretos', -100, 100, 0],
        ['_', 'Presença'], ['tex', 'Textura', -100, 100, 0], ['clar', 'Claridade', -100, 100, 0], ['nevoa', 'Remover névoa', -100, 100, 0],
        ['vib', 'Vibratilidade', -100, 100, 0, 1, 'linear-gradient(90deg,#888,#c06,#fc0,#0c6,#06c)'], ['sat', 'Saturação', -100, 100, 0, 1, 'linear-gradient(90deg,#888,#e33,#ee3,#3e3,#3ee,#33e,#e3e)']]],
    ['curva', 'Curva', 'curva'],
    ['detalhes', 'Detalhes', [
        ['_', 'Nitidez'], ['nitQ', 'Nitidez', 0, 150, 0], ['nitR', 'Raio', 0.5, 3, 1, 0.1], ['nitD', 'Detalhe', 0, 100, 25], ['nitM', 'Mascaramento', 0, 100, 0],
        ['_', 'Redução de ruído'], ['ruidoL', 'Redução de ruído', 0, 100, 0], ['ruidoLD', 'Detalhe', 0, 100, 50], ['ruidoC', 'Redução de ruído de cor', 0, 100, 0]]],
    ['hsl', 'Mistura de cores', 'hsl'],
    ['grad', 'Gradação de cores', 'rodas'],
    ['efeitos', 'Efeitos', [
        ['_', 'Granulação'], ['grao', 'Granulação', 0, 100, 0], ['graoT', 'Tamanho', 0, 100, 25], ['graoA', 'Aspereza', 0, 100, 50],
        ['_', 'Vinheta'], ['vig', 'Vinheta', -100, 100, 0, 1, 'linear-gradient(90deg,#111,#888,#eee)'], ['vigM', 'Ponto médio', 0, 100, 50], ['vigR', 'Arredondamento', -100, 100, 0], ['vigD', 'Difusão', 0, 100, 50]]],
];
const IE_CR_RODAS = [['s', 'Sombras'], ['m', 'Meios-tons'], ['h', 'Realces'], ['o', 'Global']];
function ieCrPadrao() {
    const v = {};
    IE_CR_SECOES.forEach(([, , cs]) => Array.isArray(cs) && cs.forEach(c => { if (c[0] !== '_') v[c[0]] = c[4]; }));
    v.curva = [[0, 0], [255, 255]]; v.curvaR = [[0, 0], [255, 255]]; v.curvaG = [[0, 0], [255, 255]]; v.curvaB = [[0, 0], [255, 255]];
    v.hsl = {}; v.rodas = {}; v.rl = {};
    return v;
}
function ieCrNorm(v) {
    const o = { ...ieCrPadrao(), ...(v || {}) };
    if (v && v.sharp != null && v.nitQ == null) o.nitQ = v.sharp;   // vals antigos
    o.hsl = { ...(v && v.hsl) }; o.rodas = { ...(v && v.rodas) }; o.rl = { ...(v && v.rl) };
    return o;
}

// ─────────────────────────── a conta ───────────────────────────
const ieCrCurvaId = p => !p || p.every(([a, b]) => Math.abs(a - b) < 0.5);
function ieCrLc(v) {   // valores → parâmetros do Luz e Cor (o que vira LUT)
    const c = p => (ieCrCurvaId(p) ? undefined : p.map(([a, b]) => [a / 255, b / 255]));
    const hc = {}, hsl = v.hsl || {};
    const pts = (k, f) => { const l = IE_CR_HSL.map(([id, , g]) => [g / 360, 0.5 + f((hsl[id] || [])[k] || 0)]); return l.some(p => Math.abs(p[1] - 0.5) > 1e-4) ? l : undefined; };
    hc.hh = pts(0, x => x / 100 * (30 / 360)); hc.hs = pts(1, x => x / 200); hc.hl = pts(2, x => x / 100 * 0.3125);
    const cw = {};
    IE_CR_RODAS.forEach(([k]) => { const p = v.rodas && v.rodas[k]; if (p && (p[0] || p[1])) cw[k] = p; });
    return { temp: v.temp, tint: v.tint, exp: v.exp, ct: v.ct, hi: v.hi, sh: v.sh, wh: v.wh, bl: v.bl, sat: 100 + v.sat, fade: v.fade || 0, vib: v.vib, piv: 50, hue: 0,
        ls: (v.rl && v.rl.s) || 0, lm: (v.rl && v.rl.m) || 0, lh: (v.rl && v.rl.h) || 0, lo: (v.rl && v.rl.o) || 0, cw,
        cv: { m: c(v.curva), r: c(v.curvaR), g: c(v.curvaG), b: c(v.curvaB) }, hc };
}
const IE_CR_LUTS = new Map();
function ieCrLut(v) {
    const lc = ieCrLc(v), k = JSON.stringify(lc);
    if (IE_CR_LUTS.has(k)) return IE_CR_LUTS.get(k);
    const N = Object.values(lc.hc).some(Boolean) ? 49 : 33;
    const lut = typeof veLcColorNeutral === 'function' && veLcColorNeutral(lc) ? null : { lut: veLcBuildLut(lc, N), N };
    if (IE_CR_LUTS.size > 12) IE_CR_LUTS.clear();
    IE_CR_LUTS.set(k, lut);
    return lut;
}
// luz da névoa (cor do ar): das partes mais claras do canal escuro, numa miniatura da imagem inteira
function ieCrAtmosfera(c) {
    const k = Math.min(1, 256 / Math.max(c.width, c.height)), m = ieCanvas(Math.max(1, c.width * k), Math.max(1, c.height * k));
    ieCtx(m).drawImage(c, 0, 0, m.width, m.height);
    const d = ieCtx(m).getImageData(0, 0, m.width, m.height).data, n = m.width * m.height, esc = new Float32Array(n);
    for (let i = 0; i < n; i++) esc[i] = d[i * 4 + 3] ? Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) : -1;
    const ord = Array.from(esc.keys()).sort((a, b) => esc[b] - esc[a]).slice(0, Math.max(1, Math.round(n * 0.002)));
    const A = [0, 0, 0];
    ord.forEach(i => { A[0] += d[i * 4]; A[1] += d[i * 4 + 1]; A[2] += d[i * 4 + 2]; });
    return A.map(x => Math.max(64, x / ord.length));
}
// LUT 3D trilinear sem funções por pixel (é o passo que roda a cada movimento de barra)
function ieCrLut3d(d, lut, N) {
    const n1 = N - 1, s = n1 / 255, N2 = N * N;
    for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const fr = d[i] * s, fg = d[i + 1] * s, fb = d[i + 2] * s;
        const r0 = Math.min(fr | 0, n1 - 1), g0 = Math.min(fg | 0, n1 - 1), b0 = Math.min(fb | 0, n1 - 1), tr = fr - r0, tg = fg - g0, tb = fb - b0;
        const p000 = ((b0 * N2) + g0 * N + r0) * 3, p100 = p000 + 3, p010 = p000 + N * 3, p110 = p010 + 3, p001 = p000 + N2 * 3, p101 = p001 + 3, p011 = p001 + N * 3, p111 = p011 + 3;
        const w000 = (1 - tr) * (1 - tg) * (1 - tb), w100 = tr * (1 - tg) * (1 - tb), w010 = (1 - tr) * tg * (1 - tb), w110 = tr * tg * (1 - tb);
        const w001 = (1 - tr) * (1 - tg) * tb, w101 = tr * (1 - tg) * tb, w011 = (1 - tr) * tg * tb, w111 = tr * tg * tb;
        for (let c = 0; c < 3; c++) d[i + c] = (lut[p000 + c] * w000 + lut[p100 + c] * w100 + lut[p010 + c] * w010 + lut[p110 + c] * w110 + lut[p001 + c] * w001 + lut[p101 + c] * w101 + lut[p011 + c] * w011 + lut[p111 + c] * w111) * 255 + 0.5;
    }
}
function ieCrHash(d) { const q = new Uint32Array(d.buffer, d.byteOffset, d.length >> 2); let h = 2166136261; for (let i = 0; i < q.length; i++) h = Math.imul(h ^ q[i], 16777619); return h >>> 0; }
// processa os pixels d (RGBA, no lugar) de um recorte (na escala e) cujo canto está em (ox, oy) da imagem inteira
// escalada (tw × th); A = cor do ar (névoa). C = cache (objeto): as partes pesadas (redução de ruído, desfoques da
// Claridade/Textura, mapa da névoa, nitidez, grão) saem do que está embaixo e ficam guardadas enquanto ele não muda —
// mexer numa barra refaz só a cor (LUT) e as somas. Os contrastes locais olham a luma de antes da cor.
function ieCrDados(d, w, h, v, e = 1, ox = 0, oy = 0, tw = w, th = h, A = null, C = null) {
    const n = w * h, chave = [w, h, ox, oy, tw, th, e].join();
    if (C) { const hs = ieCrHash(d); if (C.chave !== chave || C.hash !== hs) { for (const k of Object.keys(C)) delete C[k]; C.chave = chave; C.hash = hs; } }
    const pega = (nome, k, fn) => { if (!C) return fn(); const x = C[nome]; if (x && x.k === k) return x.v; const r = fn(); C[nome] = { k, v: r }; return r; };
    // 1) redução de ruído (antes de tudo, como no ACR): luma com filtro guiado, cor com desfoque do Cb/Cr
    const temNr = v.ruidoL > 0 || v.ruidoC > 0, kNr = temNr ? [v.ruidoL, v.ruidoLD, v.ruidoC].join() : '-';
    const base = !temNr ? null : pega('nr', kNr, () => {
        const o = new Uint8ClampedArray(d), Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
        for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], y = r * 0.299 + g * 0.587 + b * 0.114; Y[i] = y; Cb[i] = b - y; Cr[i] = r - y; }
        let Yn = Y;
        if (v.ruidoL > 0) { const s = ieFGuiado(Y, w, h, Math.max(1, Math.round(2.5 * e)), (v.ruidoL / 100) ** 2 * 900), det = v.ruidoLD / 100 * 0.6; Yn = s.map((q, i) => q + (Y[i] - q) * det); }
        const rc = v.ruidoC / 100 * 8 * e, Cbn = rc >= 0.5 ? gfDesf(Cb, w, h, rc) : Cb, Crn = rc >= 0.5 ? gfDesf(Cr, w, h, rc) : Cr;
        for (let i = 0; i < n; i++) { const y = Yn[i], r = Crn[i] + y, b = Cbn[i] + y; o[i * 4] = r; o[i * 4 + 2] = b; o[i * 4 + 1] = (y - 0.299 * r - 0.114 * b) / 0.587; }
        return o;
    });
    const src = base || d, S = Math.min(tw, th);
    const Y0 = (v.clar || v.tex || v.nitQ > 0) ? pega('y0', kNr, () => { const Y = new Float32Array(n); for (let i = 0; i < n; i++) Y[i] = src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114; return Y; }) : null;
    const dClar = v.clar ? pega('clar', kNr, () => { const b = gfDesf(Y0, w, h, Math.max(1, S * 0.015)); return Y0.map((y, i) => (y - b[i]) * 4 * (y / 255) * (1 - y / 255)); }) : null;
    const dTex = v.tex ? pega('tex', kNr, () => { const b = gfDesf(Y0, w, h, Math.max(1, S * 0.0035)); return Y0.map((y, i) => y - b[i]); }) : null;
    const dNit = v.nitQ > 0 ? pega('nit', [kNr, v.nitR, v.nitD, v.nitM].join(), () => {
        const b = gfDesf(Y0, w, h, Math.max(0.5, v.nitR * e)), lim = (100 - v.nitD) * 0.06;
        let msk = null;
        if (v.nitM > 0) { const m = gfSobel(gfDesf(Y0, w, h, e), w, h).m, t0 = v.nitM / 100 * 30; msk = m.map(q => gfSs(t0, t0 + 6, q)); }
        return Y0.map((y, i) => { const df = y - b[i]; return Math.abs(df) <= lim ? 0 : (df - Math.sign(df) * lim) * (msk ? msk[i] : 1); });
    }) : null;
    const Ar = A || [235, 235, 235];
    const tNev = v.nevoa > 0 ? pega('nev', [kNr, Ar.map(Math.round)].join(), () => {
        const esc = new Float32Array(n);
        for (let i = 0; i < n; i++) esc[i] = Math.min(src[i * 4] / Ar[0], src[i * 4 + 1] / Ar[1], src[i * 4 + 2] / Ar[2]);
        const r = Math.max(1, Math.round(7 * e));
        return gfDesf(ieFMinMax(esc, w, h, r, false), w, h, r * 2).map(t => Math.max(0.15, 1 - 0.95 * t));
    }) : null;
    const grao = v.grao > 0 ? pega('grao', [v.graoT, v.graoA].join(), () => {
        const P = { w, h, ox, oy }, liso = gfSuave(P, Math.max(0.6, (1 + v.graoT / 100 * 3) * e), 71), fino = gfRuido(P, 72), ra = v.graoA / 100;
        return liso.map((l, i) => l * (1 - ra) + (fino[i] * 2 - 1) * ra);
    }) : null;
    const vinh = v.vig ? pega('vig', [v.vigM, v.vigR, v.vigD].join(), () => {
        const p = 2 * Math.pow(3, -v.vigR / 100), m = 0.25 + v.vigM / 100 * 0.9, f = 0.05 + v.vigD / 100 * 0.9, o = new Float32Array(n);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const u = Math.abs(((i + ox) / tw - 0.5) * 2), q = Math.abs(((j + oy) / th - 0.5) * 2); o[j * w + i] = gfSs(m, m + f, Math.pow(Math.pow(u, p) + Math.pow(q, p), 1 / p)); }
        return o;
    }) : null;
    // daqui para baixo é barato: cor, somas e misturas
    if (base) d.set(base);
    const L = ieCrLut(v);
    if (L) ieCrLut3d(d, L.lut, L.N);
    const kC = v.clar / 100 * 1.2, kT = v.tex / 100 * 0.9, kN = v.nitQ / 100 * 1.4, aN = v.nevoa / 100, aV = v.vig / 100, aG = v.grao / 100 * 38;
    for (let i = 0, o = 0; i < n; i++, o += 4) {
        if (!d[o + 3]) continue;
        let r = d[o], g = d[o + 1], b = d[o + 2];
        const dl = (dClar ? dClar[i] * kC : 0) + (dTex ? dTex[i] * kT : 0) + (dNit ? dNit[i] * kN : 0);
        if (dl) { r += dl; g += dl; b += dl; }
        if (tNev) { const tt = tNev[i]; r += ((r - Ar[0]) / tt + Ar[0] - r) * aN; g += ((g - Ar[1]) / tt + Ar[1] - g) * aN; b += ((b - Ar[2]) / tt + Ar[2] - b) * aN; }
        else if (aN < 0) { r += (Ar[0] - r) * -aN * 0.55; g += (Ar[1] - g) * -aN * 0.55; b += (Ar[2] - b) * -aN * 0.55; }
        if (vinh) { const t = vinh[i] * aV; if (aV < 0) { r *= 1 + t; g *= 1 + t; b *= 1 + t; } else { r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; } }
        if (grao) { const y = Math.min(1, Math.max(0, (r * 0.299 + g * 0.587 + b * 0.114) / 255)), q = grao[i] * aG * (0.35 + 2.6 * y * (1 - y)); r += q; g += q; b += q; }
        d[o] = r; d[o + 1] = g; d[o + 2] = b;
    }
}
function ieCrProcessar(c, v, e = 1, ox = 0, oy = 0, tw = c.width, th = c.height, A = null, C = null) {
    const w = c.width, h = c.height, img = ieCtx(c).getImageData(0, 0, w, h), out = ieCanvas(w, h);
    ieCrDados(img.data, w, h, v, e, ox, oy, tw, th, A, C);
    ieCtx(out).putImageData(img, 0, 0);
    return out;
}
// balanço de branco automático: meios-tons pouco saturados viram neutros (média R = G = B), medindo e corrigindo
// Temperatura (azul↔amarelo) e Matiz (verde↔magenta) pela mesma conta do filtro
function ieCrAutoBalanco(c) {
    const k = Math.min(1, 200 / Math.max(c.width, c.height)), a = ieCanvas(Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k)));
    ieCtx(a).drawImage(c, 0, 0, a.width, a.height);
    const base = ieCtx(a).getImageData(0, 0, a.width, a.height).data, v = { temp: 0, tint: 0 };
    const medir = () => {
        const d = new Uint8ClampedArray(base);
        ieCrDados(d, a.width, a.height, ieCrNorm(v), 1);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 220) continue;
            const [, s, l] = ieRgbHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
            if (l < 0.2 || l > 0.85 || s > 0.5) continue;
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        return n ? [r / n, g / n, b / n] : null;
    };
    for (let it = 0; it < 10; it++) {
        const m = medir();
        if (!m) break;
        const dt = (m[0] - m[2]) / 255, dg = (m[1] - (m[0] + m[2]) / 2) / 255;
        if (Math.abs(dt) < 0.004 && Math.abs(dg) < 0.004) break;
        v.temp = ieClamp(Math.round(v.temp - dt * 140), -100, 100);
        v.tint = ieClamp(Math.round(v.tint + dg * 160), -100, 100);
    }
    return v;
}
function ieCrProc(v0) { const v = ieCrNorm(v0); return c => ieCrProcessar(c, v, 1, 0, 0, c.width, c.height, v.nevoa ? ieCrAtmosfera(c) : null); }
// ─────────────────────────── barra fina com resistência ───────────────────────────
// el = .ie-cr-sl; aoMudar(v); arrastar = metade do mouse (Shift: 1/6); clique sem arrastar pula; duplo clique zera
function ieCrBarra(el, c, valor, aoMudar) {
    const [id, , min, max, padrao, passo = 1] = c, trilho = el.querySelector('.ie-cr-tr'), bola = el.querySelector('.ie-cr-bola'), num = el.querySelector('input');
    let v = valor;
    const dec = (String(passo).split('.')[1] || '').length;
    const mostrar = () => {
        const t = (v - min) / (max - min), z = (0 - min) / (max - min);
        bola.style.left = t * 100 + '%';
        el.querySelector('.ie-cr-ench').style.cssText = min < 0 ? `left:${Math.min(t, z) * 100}%;width:${Math.abs(t - z) * 100}%` : `left:0;width:${t * 100}%`;
        if (document.activeElement !== num) num.value = (v > 0 && min < 0 ? '+' : '') + v.toFixed(dec);
        el.classList.toggle('mod', v !== padrao);
    };
    const definir = nv => { nv = ieClamp(Math.round(nv / passo) * passo, min, max); if (Math.abs(nv - v) < 1e-9) return; v = +nv.toFixed(4); mostrar(); aoMudar(v); };
    let arr = null;
    trilho.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        trilho.setPointerCapture(ev.pointerId);
        arr = { x: ev.clientX, v0: v, mexeu: false, w: trilho.getBoundingClientRect().width };
        el.classList.add('arr');
    });
    trilho.addEventListener('pointermove', ev => {
        if (!arr) return;
        const dx = ev.clientX - arr.x;
        if (!arr.mexeu && Math.abs(dx) < 3) return;
        if (!arr.mexeu) { arr.mexeu = true; arr.x = ev.clientX; return; }
        const k = ev.shiftKey ? 1 / 6 : 0.5;
        definir(arr.v0 + dx / arr.w * (max - min) * k);
    });
    const soltar = ev => {
        if (!arr) return;
        if (!arr.mexeu) { const r = trilho.getBoundingClientRect(); definir(min + ieClamp((ev.clientX - r.left) / r.width, 0, 1) * (max - min)); }
        arr = null; el.classList.remove('arr');
    };
    trilho.addEventListener('pointerup', soltar);
    trilho.addEventListener('pointercancel', () => { arr = null; el.classList.remove('arr'); });
    const zerar = () => { v = padrao; mostrar(); aoMudar(v); };
    trilho.addEventListener('dblclick', zerar);
    el.querySelector('.ie-cr-rot').addEventListener('dblclick', zerar);
    num.addEventListener('change', () => { const q = parseFloat(num.value); if (isFinite(q)) definir(q); else mostrar(); });
    num.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); definir(v + (ev.key === 'ArrowUp' ? 1 : -1) * passo * (ev.shiftKey ? 10 : 1)); }
    });
    num.addEventListener('blur', mostrar);
    mostrar();
    return { definir: q => { v = q; mostrar(); } };
}
const ieCrBarraHtml = (c, extra = '') => `<div class="ie-cr-sl" data-k="${c[0]}"${extra}><div class="ie-cr-cab"><span class="ie-cr-rot" title="${ieT('Duplo clique: zerar')}">${ieT(c[1])}</span><input type="text" spellcheck="false"></div>
    <div class="ie-cr-tr"${c[6] ? ` style="--trilho:${c[6]}"` : ''}><i class="ie-cr-fundo${c[6] ? ' cor' : ''}"></i><i class="ie-cr-ench"></i><i class="ie-cr-bola"></i></div></div>`;

// ─────────────────────────── a janela ───────────────────────────
function ieCrJanela(fonte, atual) {
    if (IE._auto) { const a = IE._auto; IE._auto = null; return Promise.resolve(ieCrNorm(a)); }
    return new Promise(resolve => {
        const src = fonte.c, W = src.width, H = src.height, v = ieCrNorm(atual), Ar = ieCrAtmosfera(src);
        const abertas = new Set(iePref('crAbertas', ['basico']));
        const ie = ieEl('ie'), box = document.createElement('div');
        box.className = 'ie-dv ie-cr';
        const secao = ([id, nome, cs]) => {
            let corpo;
            if (cs === 'curva') corpo = `<div class="ie-segm ie-cr-cabas">${[['curva', 'RGB'], ['curvaR', 'Vermelho'], ['curvaG', 'Verde'], ['curvaB', 'Azul']].map(([k, r], i) => `<button data-cab="${k}" class="${i ? '' : 'on'}">${ieT(r)}</button>`).join('')}</div><div class="ie-cr-curva"></div>`;
            else if (cs === 'hsl') corpo = `<div class="ie-segm ie-cr-habas">${[['0', 'Matiz'], ['1', 'Saturação'], ['2', 'Luminância']].map(([k, r], i) => `<button data-hab="${k}" class="${i ? '' : 'on'}">${ieT(r)}</button>`).join('')}</div>
                ${IE_CR_HSL.map(([k, r, , cor]) => ieCrBarraHtml([k, r, -100, 100, 0, 1, ''], ` data-hsl="${k}" style="--cor-hsl:${cor}"`)).join('')}`;
            else if (cs === 'rodas') corpo = `<div class="ie-cr-rodas">${IE_CR_RODAS.map(([k, r]) => `<div class="ie-cr-roda" data-roda="${k}"><span>${ieT(r)}</span><canvas></canvas><em class="ie-cr-rodav"></em>${ieCrBarraHtml(['rl_' + k, 'Luminância', -100, 100, 0])}</div>`).join('')}</div>`;
            else corpo = cs.map(c => (c[0] === '_' ? `<div class="ie-cr-sub">${ieT(c[1])}${c[1] === 'Balanço de branco' ? `<button class="ie-btn ie-btn-mini ie-cr-auto" title="${ieT('Balanço de branco automático (meios-tons neutros)')}">${ieT('Automático')}</button>` : ''}</div>` : ieCrBarraHtml(c))).join('');
            return `<section class="ie-cr-sec ${abertas.has(id) ? 'aberta' : ''}" data-sec="${id}"><button class="ie-cr-sect"><span>${ieT(nome)}</span><i class="ie-cr-seta"></i></button><div class="ie-cr-secc">${corpo}</div></section>`;
        };
        box.innerHTML = `<div class="ie-dv-vista ie-cr-vista"><canvas class="ie-gal-cv"></canvas><div class="ie-gal-calc" hidden>${ieT('Calculando...')}</div>
                <div class="ie-dv-zoom"><button class="ie-ico-btn" data-z="-">−</button><span class="ie-dv-zv"></span><button class="ie-ico-btn" data-z="+">+</button><button class="ie-btn" data-z="ajustar">${ieT('Ajustar na tela')}</button><button class="ie-btn" data-z="100">100%</button>
                <i class="ie-op-sep"></i><button class="ie-btn" data-z="antes" title="${ieT('Antes/depois lado a lado (Y)')}">${ieT('Antes / depois')}</button><button class="ie-btn" data-z="previa" title="${ieT('Mostrar o original enquanto segura (P alterna)')}">${ieT('Original')}</button></div></div>
            <div class="ie-dv-lado ie-cr-lado">
                <div class="ie-cr-topo"><h3>${ieT('Camera Raw')}</h3><canvas class="ie-cr-hist"></canvas></div>
                <div class="ie-cr-corpo">${IE_CR_SECOES.map(secao).join('')}</div>
                <div class="ie-cr-rod"><button class="ie-btn" data-r="zerar" title="${ieT('Voltar tudo ao padrão')}">${ieT('Redefinir')}</button><span class="ie-op-esp"></span><button class="ie-btn" data-r="0">${ieT('Cancelar')}</button><button class="ie-btn ie-btn-primario" data-r="1">${ieT('OK')}</button></div>
            </div>`;
        ie.appendChild(box);
        const vista = box.querySelector('.ie-cr-vista'), cv = box.querySelector('.ie-gal-cv'), cx = ieCtx(cv), calc = box.querySelector('.ie-gal-calc'), hist = box.querySelector('.ie-cr-hist');

        // ── vista ──
        const V = { esc: 1, ox: 0, oy: 0, dpr: 1, modo: 'depois', original: false };
        let ult = null, quadro = 0, sujo = true;
        const cache = {};
        const tamanho = () => { V.dpr = window.devicePixelRatio || 1; const w = Math.max(1, Math.round(vista.clientWidth * V.dpr)), h = Math.max(1, Math.round(vista.clientHeight * V.dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } };
        const ajustar = () => { V.esc = Math.min(1 * V.dpr, (cv.width - 40 * V.dpr) / W, (cv.height - 40 * V.dpr) / H); V.ox = (cv.width - W * V.esc) / 2; V.oy = (cv.height - H * V.esc) / 2; };
        const pintar = () => {
            cx.setTransform(1, 0, 0, 1, 0, 0);
            cx.fillStyle = '#1c1c1c'; cx.fillRect(0, 0, cv.width, cv.height);
            const x = V.ox, y = V.oy, w = W * V.esc, h = H * V.esc;
            cx.fillStyle = ieXadrezPadrao(cx); cx.fillRect(x, y, w, h);
            cx.imageSmoothingEnabled = V.esc < 1;
            const depois = () => { if (ult) cx.drawImage(ult.c, x + ult.x0 * V.esc, y + ult.y0 * V.esc, (ult.x1 - ult.x0) * V.esc, (ult.y1 - ult.y0) * V.esc); else cx.drawImage(src, x, y, w, h); };
            if (V.original) cx.drawImage(src, x, y, w, h);
            else if (V.modo === 'lado') {   // antes à esquerda, depois à direita, mesma área (divisória no meio da vista)
                const meio = cv.width / 2;
                cx.save(); cx.beginPath(); cx.rect(meio, 0, cv.width - meio, cv.height); cx.clip(); depois(); cx.restore();
                cx.save(); cx.beginPath(); cx.rect(0, 0, meio, cv.height); cx.clip(); cx.drawImage(src, x, y, w, h); cx.restore();
                cx.fillStyle = 'rgba(255,255,255,.85)'; cx.fillRect(meio - V.dpr / 2, 0, V.dpr, cv.height);
                cx.font = `${11 * V.dpr}px sans-serif`; cx.fillStyle = 'rgba(0,0,0,.55)';
                [[ieT('Antes'), meio - 64 * V.dpr], [ieT('Depois'), meio + 10 * V.dpr]].forEach(([t, px]) => { cx.fillRect(px - 4 * V.dpr, 8 * V.dpr, 58 * V.dpr, 18 * V.dpr); cx.fillStyle = '#fff'; cx.fillText(t, px, 21 * V.dpr); cx.fillStyle = 'rgba(0,0,0,.55)'; });
            } else depois();
            box.querySelector('.ie-dv-zv').textContent = Math.round(V.esc / V.dpr * 100) + '%';
        };
        const histograma = c => {
            const d = ieCtx(c).getImageData(0, 0, c.width, c.height).data, H3 = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
            const passo = Math.max(1, Math.floor(d.length / 4 / 250000)) * 4;
            for (let i = 0; i < d.length; i += passo) if (d[i + 3]) { H3[0][d[i]]++; H3[1][d[i + 1]]++; H3[2][d[i + 2]]++; }
            const dpr = window.devicePixelRatio || 1, hw = Math.round(hist.clientWidth * dpr), hh = Math.round(hist.clientHeight * dpr);
            if (hist.width !== hw || hist.height !== hh) { hist.width = hw; hist.height = hh; }
            const g = ieCtx(hist); g.clearRect(0, 0, hw, hh);
            let mx = 1; H3.forEach(a => { for (let i = 2; i < 254; i++) mx = Math.max(mx, a[i]); });
            g.globalCompositeOperation = 'lighter';
            ['rgba(230,60,60,.75)', 'rgba(60,200,80,.75)', 'rgba(70,110,240,.8)'].forEach((cor, k) => {
                g.fillStyle = cor; g.beginPath(); g.moveTo(0, hh);
                for (let i = 0; i < 256; i++) g.lineTo(i / 255 * hw, hh - Math.min(1, Math.sqrt(H3[k][i] / mx)) * hh * 0.95);
                g.lineTo(hw, hh); g.closePath(); g.fill();
            });
            g.globalCompositeOperation = 'source-over';
        };
        const calcular = () => {
            const e = Math.min(1, V.esc), M = 8 / e;
            const x0 = Math.max(0, Math.floor(-V.ox / V.esc - M)), y0 = Math.max(0, Math.floor(-V.oy / V.esc - M));
            const x1 = Math.min(W, Math.ceil((cv.width - V.ox) / V.esc + M)), y1 = Math.min(H, Math.ceil((cv.height - V.oy) / V.esc + M));
            if (x1 <= x0 || y1 <= y0) return;
            const cw = Math.max(1, Math.round((x1 - x0) * e)), ch = Math.max(1, Math.round((y1 - y0) * e));
            let rec = ult && ult.chave === [x0, y0, x1, y1, e].join() ? ult.rec : null;
            if (!rec) { rec = ieCanvas(cw, ch); const rx = ieCtx(rec); rx.imageSmoothingQuality = 'high'; rx.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, cw, ch); }
            const t0 = performance.now(), c = ieCrProcessar(rec, v, e, x0 * e, y0 * e, Math.round(W * e), Math.round(H * e), Ar, cache);
            ult = { c, rec, x0, y0, x1, y1, chave: [x0, y0, x1, y1, e].join(), ms: performance.now() - t0 };
            calc.hidden = true; pintar(); histograma(c);
        };
        let tm = 0;
        const agendar = (lento) => {   // ajuste: no próximo quadro; mexer na vista: espera parar
            sujo = true; clearTimeout(tm);
            if (lento) { calc.hidden = false; tm = setTimeout(() => agendar(false), 120); return; }
            if (quadro) return;
            quadro = requestAnimationFrame(() => { quadro = 0; if (sujo) { sujo = false; calcular(); } });
        };

        // ── controles ──
        const barras = {};
        box.querySelectorAll('.ie-cr-sec').forEach(s => {
            s.querySelector('.ie-cr-sect').onclick = () => { s.classList.toggle('aberta'); if (s.classList.contains('aberta')) abertas.add(s.dataset.sec); else abertas.delete(s.dataset.sec); iePrefGravar('crAbertas', [...abertas]); if (s.dataset.sec === 'grad') desenharRodas(); };
        });
        const defs = Object.fromEntries(IE_CR_SECOES.flatMap(([, , cs]) => (Array.isArray(cs) ? cs.filter(c => c[0] !== '_').map(c => [c[0], c]) : [])));
        box.querySelectorAll('.ie-cr-sl[data-k]').forEach(el => {
            const k = el.dataset.k;
            if (el.dataset.hsl) return;
            if (k.startsWith('rl_')) { const r = k.slice(3); barras[k] = ieCrBarra(el, [k, '', -100, 100, 0], v.rl[r] || 0, q => { v.rl[r] = q; agendar(); }); return; }
            barras[k] = ieCrBarra(el, defs[k], v[k], q => { v[k] = q; agendar(); });
        });
        box.querySelector('.ie-cr-auto')?.addEventListener('click', () => {
            const wb = ieCrAutoBalanco(src);
            v.temp = wb.temp; v.tint = wb.tint; barras.temp.definir(wb.temp); barras.tint.definir(wb.tint); agendar();
        });
        // Mistura de cores: uma barra por cor, para a aba (matiz / saturação / luminância)
        let aba = 0;
        const hslBarras = {};
        box.querySelectorAll('.ie-cr-sl[data-hsl]').forEach(el => {
            const id = el.dataset.hsl;
            hslBarras[id] = ieCrBarra(el, [id, '', -100, 100, 0], (v.hsl[id] || [])[aba] || 0, q => { const a = [...(v.hsl[id] || [0, 0, 0])]; a[aba] = q; v.hsl[id] = a; agendar(); });
        });
        const hslTrilhos = () => box.querySelectorAll('.ie-cr-sl[data-hsl]').forEach(el => {
            const [, , g] = IE_CR_HSL.find(x => x[0] === el.dataset.hsl), cor = l => `hsl(${(g + 360) % 360},${l})`;
            el.querySelector('.ie-cr-fundo').classList.add('cor');
            el.querySelector('.ie-cr-tr').style.setProperty('--trilho', aba === 0 ? `linear-gradient(90deg,hsl(${g - 30},75%,55%),hsl(${g},75%,55%),hsl(${g + 30},75%,55%))` : aba === 1 ? `linear-gradient(90deg,#888,${cor('85%,55%')})` : `linear-gradient(90deg,#111,${cor('70%,50%')},#eee)`);
        });
        box.querySelectorAll('[data-hab]').forEach(b => {
            b.onclick = () => { aba = +b.dataset.hab; box.querySelectorAll('[data-hab]').forEach(x => x.classList.toggle('on', x === b)); Object.entries(hslBarras).forEach(([id, br]) => br.definir((v.hsl[id] || [])[aba] || 0)); hslTrilhos(); };
        });
        hslTrilhos();
        // Curva: RGB e os canais
        let cab = 'curva';
        const montarCurva = () => {
            const ca = box.querySelector('.ie-cr-curva');
            ca.innerHTML = '<canvas width="256" height="256"></canvas>';
            ieCurvaEditor(ca.querySelector('canvas'), v[cab], pts => { v[cab] = pts; agendar(); });
        };
        box.querySelectorAll('[data-cab]').forEach(b => { b.onclick = () => { cab = b.dataset.cab; box.querySelectorAll('[data-cab]').forEach(x => x.classList.toggle('on', x === b)); montarCurva(); }; });
        montarCurva();
        // Gradação de cores: rodas (ponto anda metade do mouse, Shift fino, duplo clique zera)
        const desenharRodas = () => box.querySelectorAll('.ie-cr-roda').forEach(r => {
            const c = r.querySelector('canvas'), k = r.dataset.roda, dpr = window.devicePixelRatio || 1, px = Math.round(c.clientWidth * dpr);
            if (!px) return;
            if (c.width !== px) { c.width = c.height = px; }
            const g = ieCtx(c), R = px / 2, ri = R - 2 * dpr;
            g.clearRect(0, 0, px, px);
            if (typeof veLcRodaDisco === 'function') g.drawImage(veLcRodaDisco(Math.round(ri * 2)), R - ri, R - ri);
            g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = dpr;
            g.beginPath(); g.moveTo(R - ri, R); g.lineTo(R + ri, R); g.moveTo(R, R - ri); g.lineTo(R, R + ri); g.stroke();
            const p = v.rodas[k] || [0, 0], x = R + p[0] * ri, y = R - p[1] * ri, mod = !!(p[0] || p[1]);
            if (mod) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(R, R); g.lineTo(x, y); g.stroke(); }
            g.beginPath(); g.arc(x, y, 4.5 * dpr, 0, Math.PI * 2); g.fillStyle = mod ? '#fff' : 'rgba(255,255,255,.6)'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.2 * dpr; g.stroke();
            const ang = Math.round(((Math.atan2(p[1], p[0]) - (typeof VE_LC_HUE0 === 'number' ? VE_LC_HUE0 : 0)) * 180 / Math.PI + 720) % 360);
            r.querySelector('.ie-cr-rodav').textContent = mod ? `${ieT('Matiz')} ${ang}° · ${ieT('Sat.')} ${Math.round(Math.hypot(p[0], p[1]) * 100)}` : '';
        });
        box.querySelectorAll('.ie-cr-roda canvas').forEach(c => {
            const k = c.closest('[data-roda]').dataset.roda;
            let arr = null;
            c.addEventListener('pointerdown', ev => { c.setPointerCapture(ev.pointerId); arr = { x: ev.clientX, y: ev.clientY, p: [...(v.rodas[k] || [0, 0])], R: c.getBoundingClientRect().width / 2 }; });
            c.addEventListener('pointermove', ev => {
                if (!arr) return;
                const s = (ev.shiftKey ? 1 / 6 : 0.5) / arr.R;
                let px = arr.p[0] + (ev.clientX - arr.x) * s, py = arr.p[1] - (ev.clientY - arr.y) * s;
                const m = Math.hypot(px, py); if (m > 1) { px /= m; py /= m; }
                v.rodas[k] = [+px.toFixed(4), +py.toFixed(4)]; desenharRodas(); agendar();
            });
            c.addEventListener('pointerup', () => { arr = null; });
            c.addEventListener('dblclick', () => { delete v.rodas[k]; desenharRodas(); agendar(); });
        });

        // ── vista: mão, zoom, antes/depois ──
        let mao = null;
        cv.style.cursor = 'grab';
        cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); mao = { x: ev.clientX, y: ev.clientY, ox: V.ox, oy: V.oy }; cv.style.cursor = 'grabbing'; });
        cv.addEventListener('pointermove', ev => { if (!mao) return; V.ox = mao.ox + (ev.clientX - mao.x) * V.dpr; V.oy = mao.oy + (ev.clientY - mao.y) * V.dpr; pintar(); });
        const soltarMao = () => { if (!mao) return; mao = null; cv.style.cursor = 'grab'; agendar(true); };
        cv.addEventListener('pointerup', soltarMao); cv.addEventListener('pointercancel', soltarMao);
        const zoomEm = (k, sx, sy) => { const e = ieClamp(V.esc * k, 0.02 * V.dpr, 16 * V.dpr), px = (sx - V.ox) / V.esc, py = (sy - V.oy) / V.esc; V.esc = e; V.ox = sx - px * e; V.oy = sy - py * e; pintar(); agendar(true); };
        cv.addEventListener('wheel', ev => {
            ev.preventDefault();
            const r = cv.getBoundingClientRect(), sx = (ev.clientX - r.left) * V.dpr, sy = (ev.clientY - r.top) * V.dpr;
            if (ev.ctrlKey || ev.altKey) zoomEm(ev.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy);
            else { V.ox -= (ev.shiftKey ? ev.deltaY : ev.deltaX) * V.dpr; V.oy -= (ev.shiftKey ? 0 : ev.deltaY) * V.dpr; pintar(); agendar(true); }
        }, { passive: false });
        const alternarLado = () => { V.modo = V.modo === 'lado' ? 'depois' : 'lado'; box.querySelector('[data-z="antes"]').classList.toggle('on', V.modo === 'lado'); pintar(); };
        const alternarOriginal = (on = !V.original) => { V.original = on; box.querySelector('[data-z="previa"]').classList.toggle('on', on); pintar(); };
        box.querySelectorAll('[data-z]').forEach(b => {
            const z = b.dataset.z;
            if (z === 'previa') { b.onclick = () => alternarOriginal(); return; }
            b.onclick = () => {
                if (z === 'ajustar') { ajustar(); pintar(); agendar(true); }
                else if (z === '100') zoomEm(V.dpr / V.esc, cv.width / 2, cv.height / 2);
                else if (z === 'antes') alternarLado();
                else zoomEm(z === '+' ? 1.5 : 1 / 1.5, cv.width / 2, cv.height / 2);
            };
        });

        // ── teclado (modal) ──
        const tecla = ev => {
            const emTexto = ev.target.tagName === 'INPUT' && ev.target.type === 'text';
            ev.stopImmediatePropagation();
            if (ev.key === 'Escape') { ev.preventDefault(); fim(false); return; }
            if (ev.key === 'Enter') { ev.preventDefault(); if (emTexto) ev.target.blur(); else fim(true); return; }
            if (emTexto) return;
            const k = ev.key.toLowerCase();
            if (k === 'y' && !ev.ctrlKey) { ev.preventDefault(); alternarLado(); }
            else if (k === 'p' && !ev.ctrlKey) { ev.preventDefault(); alternarOriginal(); }
            else if (ev.ctrlKey && (k === '+' || k === '=')) { ev.preventDefault(); zoomEm(1.5, cv.width / 2, cv.height / 2); }
            else if (ev.ctrlKey && k === '-') { ev.preventDefault(); zoomEm(1 / 1.5, cv.width / 2, cv.height / 2); }
            else if (ev.ctrlKey && k === '0') { ev.preventDefault(); ajustar(); pintar(); agendar(true); }
        };
        window.addEventListener('keydown', tecla, true);
        const ro = new ResizeObserver(() => { tamanho(); pintar(); desenharRodas(); agendar(true); });
        ro.observe(vista);
        const fim = ok => {
            clearTimeout(tm); cancelAnimationFrame(quadro);
            window.removeEventListener('keydown', tecla, true); ro.disconnect();
            box.remove();
            resolve(ok ? JSON.parse(JSON.stringify(v)) : null);
        };
        box.querySelector('[data-r="0"]').onclick = () => fim(false);
        box.querySelector('[data-r="1"]').onclick = () => fim(true);
        box.querySelector('[data-r="zerar"]').onclick = () => {
            Object.assign(v, ieCrPadrao());
            Object.entries(barras).forEach(([k, b]) => b.definir(k.startsWith('rl_') ? 0 : v[k]));
            Object.values(hslBarras).forEach(b => b.definir(0));
            montarCurva(); desenharRodas(); agendar();
        };
        IE._cr = { v, V, fim, agendar, ultimo: () => ult, calcular, alternarLado };   // testes (modo agente)

        tamanho(); ajustar(); pintar(); desenharRodas(); agendar();
    }).finally(() => { IE._cr = null; });
}

IE_FILTROS.cameraRaw = () => ieAplicarComDialogo({ titulo: 'Filtro Camera Raw', janela: ieCrJanela, proc: v => ieCrProc(v) });

// ─────────────────────────── camada de ajuste Camera Raw ───────────────────────────
// Como a camada de ajuste do editor de vídeo: fica acima das outras e muda ao vivo tudo o que está embaixo (luz, cor,
// Claridade, Textura, Névoa, Nitidez, Granulação, Vinheta...), com opacidade, modo e máscara de camada de ajuste.
// Vinheta e grão usam o documento inteiro como referência. Painel Propriedades: barras rápidas + "Abrir no Camera Raw"
// (a janela completa com o que está embaixo da camada). Não vai para o PSD (o Photoshop não tem esse tipo de camada).
// quanto a conta olha em volta (px do documento): a composição por regiões pega essa margem
function ieCrMargem(v, W, H) {
    const S = Math.min(W, H);
    let m = 0;
    if (v.clar) m = Math.max(m, S * 0.015 * 3);
    if (v.tex) m = Math.max(m, S * 0.0035 * 3 + 2);
    if (v.nevoa) m = Math.max(m, 7 + 14 * 3);
    if (v.nitQ > 0) m = Math.max(m, v.nitR * 3 + 3);
    if (v.ruidoL > 0) m = Math.max(m, 8);
    if (v.ruidoC > 0) m = Math.max(m, v.ruidoC / 100 * 8 * 3 + 2);
    return Math.ceil(m);
}
function ieCrMargemDoc(doc) {
    let m = 0;
    iePercorrer(doc.camadas, L => { if (L.visivel && L.tipo === 'ajuste' && L.ajuste && L.ajuste.t === 'cameraRaw') m = Math.max(m, ieCrMargem(L.ajuste.v, doc.w, doc.h)); });
    return m;
}
// aplica na região já composta (img = ImageData do que está embaixo; o = canto dela no documento)
const IE_CR_CAMADA = new WeakMap();   // L → {cache, A}
function ieCrAjusteImg(img, L, o) {
    const doc = IE.doc, v = L.ajuste.v;
    let s = IE_CR_CAMADA.get(L);
    if (!s) IE_CR_CAMADA.set(L, s = { cache: {}, A: null });
    if (v.nevoa && !s.A) { const c = ieCanvas(img.width, img.height); ieCtx(c).putImageData(img, 0, 0); s.A = ieCrAtmosfera(c); }   // cor do ar: guardada
    ieCrDados(img.data, img.width, img.height, v, 1, o.x, o.y, doc.w, doc.h, s.A, s.cache);
}// o documento achatado só com o que está embaixo da camada L (fonte da janela do Camera Raw)
function ieAchatarAbaixo(doc, L) {
    IE._pararEm = L; IE._parou = false;
    try { return ieAchatar(doc); } finally { IE._pararEm = null; IE._parou = false; }
}
async function ieCrAbrirCamada(L, doc = IE.doc) {
    const fonte = { c: ieAchatarAbaixo(doc, L), x: 0, y: 0 };
    const vals = await ieCrJanela(fonte, L.ajVals);
    if (!vals) return;
    L.ajVals = vals; L.ajuste = IE_AJ_CAMADAS.cameraRaw.aj(vals); IE_CR_CAMADA.delete(L);
    ieInvalidar(L); ieAgendar(null, doc); ieHist(ieT('Camera Raw')); ieUiProps?.();
}
const IE_CR_RAPIDAS = [['_', 'Luz'], 'exp', 'ct', 'hi', 'sh', 'wh', 'bl', ['_', 'Cor'], 'temp', 'tint', 'vib', 'sat', ['_', 'Presença'], 'tex', 'clar', 'nevoa',
    ['_', 'Acabamento'], 'nitQ', 'grao', 'vig'];
IE_AJ_CAMADAS.cameraRaw = {
    nome: 'Camera Raw', kind: 'cameraRaw', campos: [],
    padrao: () => ieCrPadrao(),
    aj: v => ({ t: 'cameraRaw', v: ieCrNorm(v) }),
    propsUi(L, box, doc) {
        const defs = Object.fromEntries(IE_CR_SECOES.flatMap(([, , cs]) => (Array.isArray(cs) ? cs.filter(c => c[0] !== '_').map(c => [c[0], c]) : [])));
        const div = document.createElement('div');
        div.className = 'ie-pn-ajprops ie-cr-props';
        div.innerHTML = `<button class="ie-btn ie-btn-primario ie-cr-abrir">${ieT('Abrir no Camera Raw...')}</button>
            <div class="ie-prop-nota">${ieT('Muda tudo o que está embaixo desta camada, ao vivo. A janela tem também curva, HSL, rodas de cor, ruído e granulação completos.')}</div>` +
            IE_CR_RAPIDAS.map(k => (Array.isArray(k) ? `<div class="ie-cr-sub">${ieT(k[1])}</div>` : ieCrBarraHtml(defs[k]))).join('');
        box.appendChild(div);
        div.querySelector('.ie-cr-abrir').onclick = () => ieCrAbrirCamada(L, doc);
        const aplicar = () => { L.ajuste = IE_AJ_CAMADAS.cameraRaw.aj(L.ajVals); ieInvalidar(L); ieAgendar(null, doc); clearTimeout(L._ajT); L._ajT = setTimeout(() => ieHist(ieT('Camera Raw')), 500); };
        div.querySelectorAll('.ie-cr-sl[data-k]').forEach(el => { const k = el.dataset.k; ieCrBarra(el, defs[k], L.ajVals[k] ?? defs[k][4], q => { L.ajVals[k] = q; aplicar(); }); });
        div.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    },
};
if (typeof IE_NOME_AJ === 'object') IE_NOME_AJ.cameraRaw = 'Camera Raw';
// botão ◐ do painel Camadas (como no Photoshop): menu das camadas de ajuste, Camera Raw primeiro
Object.keys(IE_AJ_CAMADAS).forEach(k => { IE_CMDS['ajuste:' + k] = () => ieAjNova(k); });
document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ajmenu]');
    if (!b || !IE.doc) return;
    ev.stopPropagation();
    const pop = ieEl('ie-pop'), rb = ieEl('ie').getBoundingClientRect(), r = b.getBoundingClientRect();
    pop.innerHTML = ieMenuHtml([['Camera Raw (luz, cor, claridade, textura...)', 'ajuste:cameraRaw'], '-',
        ...Object.entries(IE_AJ_CAMADAS).filter(([k]) => k !== 'cameraRaw').map(([k, d]) => [d.nome + '...', 'ajuste:' + k])]);
    pop.hidden = false;
    pop.style.left = Math.min(rb.width - 280, r.left - rb.left) + 'px';
    pop.style.top = Math.max(4, r.top - rb.top - pop.offsetHeight - 4) + 'px';
    const fora = e => { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener('pointerdown', fora, true); } };
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
}, true);