// =========================================================
// Pocket Editor — Luz e Cor (painel de correção de cor, no estilo do Lumetri do Premiere)
// É o efeito 'lc' do clipe (c.fx): parâmetros numéricos + curvas (v.cv = {m, r, g, b}: pontos [x, y] de 0 a 1).
// Toda a parte de cor vira uma LUT 3D (VE_LC_N³) calculada aqui: a prévia aplica a LUT por WebGL e a exportação
// recebe a MESMA LUT (lut3d do ffmpeg, interpolação trilinear) — a conta existe num lugar só.
// Nitidez (unsharp 5×5 na luma) e vinheta (vignette do ffmpeg) rodam depois da LUT, com a mesma fórmula do ffmpeg.
// Clareza (Clarity do Camera Raw): contraste local nos meios-tons, Y += k·(Y − desfoque gaussiano de Y)·4Y(1−Y), também
// depois da LUT — prévia em WebGL (desfoque em 2 passadas) e exportação com gblur + lut2 no ffmpeg (video_cutter).
// =========================================================

const VE_LC_N = 33;          // LUT normal
const VE_LC_N_HC = 65;       // com curvas de matiz (mudam a cor em faixas estreitas: 33 pontos fariam degraus)
const VE_LC_CURVAS = ['m', 'r', 'g', 'b'];
const VE_LC_ID = [[0, 0], [1, 1]];
// Curvas de Matiz/Saturação do Lumetri: [chave, nome curto, eixo x, título]. y = 0,5 é neutro.
const VE_LC_HC = [
    ['hs', 'Matiz × Sat', 'h', 'Matiz × Saturação: mais ou menos cor em cada matiz'],
    ['hh', 'Matiz × Matiz', 'h', 'Matiz × Matiz: troca uma cor por outra'],
    ['hl', 'Matiz × Luz', 'h', 'Matiz × Luminância: clareia ou escurece cada matiz'],
    ['ls', 'Luz × Sat', 'l', 'Luminância × Saturação: cor nas sombras / nos realces'],
    ['ss', 'Sat × Sat', 's', 'Saturação × Saturação: mexe só no que já tem pouca ou muita cor'],
];
const VE_LC_CLAR_SIGMA = 0.015;   // raio do desfoque da Clareza: fração do lado menor da mídia

// Seções do painel (a ordem dos parâmetros aqui é só de interface; a ordem da conta está em veLcBuildLut)
const VE_LC_SECOES = [
    { id: 'basic', nome: 'Correção básica', grupos: [
        { nome: 'Balanço de branco', ks: ['temp', 'tint'] },
        { nome: 'Tom', ks: ['exp', 'ct', 'piv', 'hi', 'sh', 'wh', 'bl'] },
        { nome: 'Presença', ks: ['clar', 'vib', 'sat'] },
    ] },
    { id: 'creative', nome: 'Criativo', grupos: [{ nome: null, ks: ['fade', 'sharp', 'hue'] }] },
    { id: 'curves', nome: 'Curvas', curvas: true },
    { id: 'wheels', nome: 'Rodas de cor', rodas: true },
    { id: 'vignette', nome: 'Vinheta', grupos: [{ nome: null, ks: ['vig'] }] },
];

const VELC = {
    open: new Set(['basic', 'creative', 'curves', 'wheels', 'vignette']),
    ch: 'm',            // curva RGB em edição
    ct: 'rgb',          // aba das curvas: 'rgb' ou uma curva de matiz (VE_LC_HC)
    key: '', built: false,
    luts: new Map(),    // cache: JSON dos valores → {f32, u16}
    gl: null,
    drag: null,
};

// ── cor ──
const veLcDec = x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
const veLcEnc = x => x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
const veLcSmooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const veLcLuma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ── rodas de cor (primárias do DaVinci Resolve: Lift / Gamma / Gain / Offset) ──
// Ponto da roda = direção de cor no plano Cb/Cr (BT.709): x → Cb (azul/amarelo), y → Cr (vermelho/ciano) —
// a mesma orientação do vetorscópio. A cor vira um deslocamento RGB que não mexe na luma (Y = 0).
// [chave da cor em v.cw, nome, chave da luz, onde age]. As 3 primeiras são as Sombras/Meios-tons/Realces de antes.
const VE_LC_RODAS = [['s', 'Lift', 'ls', 'sombras'], ['m', 'Gamma', 'lm', 'meios-tons'], ['h', 'Gain', 'lh', 'realces'],
                     ['o', 'Offset', 'lo', 'a imagem toda']];
// Ângulo (no plano Cb/Cr) do vermelho puro: o 0 do eixo de matiz das curvas (vermelho → amarelo → verde...)
const VE_LC_HUE0 = Math.atan2((1 - 0.2126) / 1.5748, -0.2126 / 1.8556);
function veLcRodaRGB(p) {
    if (!p || (Math.abs(p[0]) < 1e-4 && Math.abs(p[1]) < 1e-4)) return null;
    const cb = p[0], cr = p[1];
    return [1.5748 * cr, -0.1873 * cb - 0.4681 * cr, 1.8556 * cb];
}
function veLcRodasNeutras(v) {
    const cw = v.cw || {};
    return VE_LC_RODAS.every(([w, , k]) => !veLcRodaRGB(cw[w]) && !(v[k] || 0));
}

// Curva monótona (Fritsch–Carlson) amostrada em tabela; pontos [x, y] de 0 a 1
function veLcCurveTable(pts) {
    const T = new Float32Array(1025);
    const p = (pts && pts.length >= 2 ? pts : VE_LC_ID).slice().sort((a, b) => a[0] - b[0]);
    const n = p.length, xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    const d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
    if (n === 2) { m[0] = m[1] = d[0]; }
    else {
        m[0] = d[0]; m[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
        for (let i = 0; i < n - 1; i++) {
            if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
            const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
            if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
        }
    }
    let k = 0;
    for (let j = 0; j <= 1024; j++) {
        const x = j / 1024;
        let y;
        if (x <= xs[0]) y = ys[0];
        else if (x >= xs[n - 1]) y = ys[n - 1];
        else {
            while (k < n - 2 && x > xs[k + 1]) k++;
            const h = Math.max(1e-6, xs[k + 1] - xs[k]), t = (x - xs[k]) / h, t2 = t * t, t3 = t2 * t;
            y = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
        }
        T[j] = Math.min(1, Math.max(0, y));
    }
    return T;
}
function veLcCurveAt(T, x) {
    const f = Math.min(1, Math.max(0, x)) * 1024, i = Math.min(1023, Math.floor(f));
    return T[i] + (T[i + 1] - T[i]) * (f - i);
}
function veLcCurveId(pts) {
    return !pts || pts.every(q => Math.abs(q[0] - q[1]) < 1e-4);
}

// Curvas de matiz: Hermite monótona pelos pontos (y de 0 a 1, 0,5 = neutro), em tabela de 1025. No eixo de matiz a curva é
// periódica (passa do magenta de volta ao vermelho); nos de luz/saturação, fora dos pontos fica reta (a do ponto da ponta).
// Sem pontos = reta no meio (neutra).
function veLcHcTable(pts, periodica) {
    const T = new Float32Array(1025);
    const p = (pts || []).slice().sort((a, b) => a[0] - b[0]);
    if (!p.length) { T.fill(0.5); return T; }
    if (p.length === 1) { T.fill(p[0][1]); return T; }
    const P = periodica ? [[p[p.length - 2][0] - 1, p[p.length - 2][1]], [p[p.length - 1][0] - 1, p[p.length - 1][1]], ...p,
                           [p[0][0] + 1, p[0][1]], [p[1][0] + 1, p[1][1]]]
                        : [[p[0][0] - 1, p[0][1]], [-1e-3, p[0][1]], ...p, [1 + 1e-3, p[p.length - 1][1]], [p[p.length - 1][0] + 1, p[p.length - 1][1]]];
    let k = 1;
    for (let j = 0; j <= 1024; j++) {
        const x = j / 1024;
        if (!periodica && x <= p[0][0]) { T[j] = p[0][1]; continue; }
        if (!periodica && x >= p[p.length - 1][0]) { T[j] = p[p.length - 1][1]; continue; }
        while (k < P.length - 3 && x > P[k + 1][0]) k++;
        const p0 = P[k - 1], p1 = P[k], p2 = P[k + 1], p3 = P[k + 2];
        const h = Math.max(1e-6, p2[0] - p1[0]), t = Math.min(1, Math.max(0, (x - p1[0]) / h));
        // tangentes monótonas (Fritsch–Butland): zero num pico/vale ou ao lado de um trecho reto — entre dois pontos
        // neutros a curva fica neutra (Catmull-Rom "embalava" e mexia em todos os outros matizes)
        const inc = (a, b) => (b[1] - a[1]) / Math.max(1e-6, b[0] - a[0]);
        const tg = (dL, dR) => (dL * dR <= 0 ? 0 : 2 / (1 / dL + 1 / dR));
        const d0 = inc(p0, p1), d1 = inc(p1, p2), d2 = inc(p2, p3);
        const m1 = tg(d0, d1) * h, m2 = tg(d1, d2) * h;
        const t2 = t * t, t3 = t2 * t;
        const y = (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
        T[j] = Math.min(1, Math.max(0, y));
    }
    return T;
}
const veLcHcId = pts => !pts || !pts.length || pts.every(q => Math.abs(q[1] - 0.5) < 1e-4);
const veLcHcAtivo = v => VE_LC_HC.some(([k]) => !veLcHcId(v.hc && v.hc[k]));

// Valores efetivos das rodas por canal (a mesma conta da LUT e dos números do painel, como no Resolve):
// lift (soma, mais no escuro), gain (multiplica, mais no claro), gamma (expoente) e offset (soma em tudo)
function veLcRodaParams(v) {
    const cw = v.cw || {}, o = w => veLcRodaRGB(cw[w]);
    const oS = o('s'), oM = o('m'), oH = o('h'), oO = o('o');
    return {
        lift: [0, 1, 2].map(i => (v.ls || 0) / 100 * 0.25 + (oS ? oS[i] * 0.14 : 0)),
        gain: [0, 1, 2].map(i => 1 + (v.lh || 0) / 100 * 0.5 + (oH ? oH[i] * 0.2 : 0)),
        gama: [0, 1, 2].map(i => Math.pow(2, -((v.lm || 0) / 100 * 0.7 + (oM ? oM[i] * 0.35 : 0)))),
        off: [0, 1, 2].map(i => (v.lo || 0) / 100 * 0.2 + (oO ? oO[i] * 0.1 : 0)),
    };
}

// Conta da cor: valores → LUT 3D (Float32Array N³×3, r varia mais rápido, depois g, depois b —
// igual ao .cube e à textura 3D). Roda a cada movimento de slider: só variáveis soltas, sem arrays por voxel.
// Balanço de branco, exposição e contraste agem em cada canal sozinho: saem de uma tabela por canal (N valores).
function veLcBuildLut(v, N) {
    const kT = v.temp / 100, kG = v.tint / 100, ex = Math.pow(2, v.exp);
    const gain = [Math.pow(2, 0.35 * kT + 0.1 * kG) * ex, Math.pow(2, -0.22 * kG) * ex, Math.pow(2, -0.35 * kT + 0.1 * kG) * ex];
    const wbOn = kT || kG || v.exp;
    const kC = v.ct / 100, kH = v.hi / 100, kS = v.sh / 100, kW = v.wh / 100, kB = v.bl / 100;
    const sat = v.sat / 100, kF = v.fade / 100, kV = v.vib / 100;
    const cv = v.cv || {}, tab = {};
    VE_LC_CURVAS.forEach(ch => { if (!veLcCurveId(cv[ch])) tab[ch] = veLcCurveTable(cv[ch]); });
    const tM = tab.m, tR = tab.r, tG = tab.g, tB = tab.b;
    const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
    // rodas: lift (soma, mais no escuro), gain (multiplica, mais no claro), gamma (curva o meio), offset (soma), por canal
    const rodas = !veLcRodasNeutras(v);
    const { lift, gain: gainR, gama, off } = veLcRodaParams(v);
    const roda = (x, i) => { x = cl(x + lift[i] * (1 - x)); x = cl(x * gainR[i]); return cl(Math.pow(x, gama[i]) + off[i]); };
    // 1) balanço de branco e exposição (em luz linear); 2) contraste: curva em S em volta do pivô
    // (pivô 0,5 = a curva de antes: 2x² / 1 − 2(1−x)²)
    const pv = Math.min(0.95, Math.max(0.05, (v.piv ?? 50) / 100));
    const sCurva = x => x < pv ? pv * (x / pv) * (x / pv) : 1 - (1 - pv) * ((1 - x) / (1 - pv)) * ((1 - x) / (1 - pv));
    const canal = [0, 1, 2].map(i => {
        const t = new Float64Array(N);
        for (let j = 0; j < N; j++) {
            let x = j / (N - 1);
            if (wbOn) x = veLcEnc(veLcDec(x) * gain[i]);
            if (kC && x >= 0 && x <= 1) x += kC * (sCurva(x) - x);
            t[j] = x;
        }
        return t;
    });
    // rotação de matiz (gira a cor no plano Cb/Cr: a luma não muda) e curvas de matiz/saturação
    const rot = (v.hue || 0) * Math.PI / 180, cR0 = Math.cos(rot), sR0 = Math.sin(rot);
    const hc = v.hc || {}, H = {};
    VE_LC_HC.forEach(([k, , eixo]) => { if (!veLcHcId(hc[k])) H[k] = veLcHcTable(hc[k], eixo === 'h'); });
    const hcOn = Object.keys(H).length > 0, giro = Math.abs(rot) > 1e-6, DPI = Math.PI * 2;
    const [cR, cG, cB] = canal;
    const vW = x => x + kW * 0.25 * Math.pow(cl(x), 2.5);
    const vB = x => { const y = 1 - cl(x); return x + kB * 0.2 * y * y * y; };
    const out = new Float32Array(N * N * N * 3);
    let o = 0;
    for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
        let r = cR[ri], g = cG[gi], b = cB[bi], L;
        // 3) realces (escala a luz das partes claras) e sombras (soma nas partes escuras, sem mexer no preto puro)
        if (kH || kS) {
            L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (kH && L > 1e-4) {
                let k = (L + kH * 0.3 * veLcSmooth(0.3, 1, L) * Math.max(1, L)) / L;
                if (k < 0) k = 0;
                r *= k; g *= k; b *= k;
            }
            if (kS) {
                const d = kS * 0.25 * (1 - veLcSmooth(0, 0.7, L)) * Math.min(1, Math.max(0, L) / 0.08);
                r += d; g += d; b += d;
            }
        }
        // 4) brancos e pretos: puxam as pontas
        if (kW) { r = vW(r); g = vW(g); b = vW(b); }
        if (kB) { r = vB(r); g = vB(g); b = vB(b); }
        // 5) saturação
        if (sat !== 1) {
            L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = L + (r - L) * sat; g = L + (g - L) * sat; b = L + (b - L) * sat;
        }
        // 6) criativo: filme desbotado (levanta o preto, tira um pouco de cor) e vibração (satura o que tem pouca cor)
        if (kF) {
            const m = 1 - 0.18 * kF, a = 0.18 * kF;
            r = r * m + a; g = g * m + a; b = b * m + a;
            L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const f = 1 - 0.2 * kF;
            r = L + (r - L) * f; g = L + (g - L) * f; b = L + (b - L) * f;
        }
        if (kV) {
            const R = cl(r), G = cl(g), B = cl(b);
            const s = Math.max(R, G, B) - Math.min(R, G, B);
            L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const f = Math.max(0, 1 + kV * (1 - s) * (kV > 0 ? 1 : 1.2));
            r = L + (r - L) * f; g = L + (g - L) * f; b = L + (b - L) * f;
        }
        r = cl(r); g = cl(g); b = cl(b);
        // 7) curvas: RGB (todas) e depois cada canal
        if (tM) { r = veLcCurveAt(tM, r); g = veLcCurveAt(tM, g); b = veLcCurveAt(tM, b); }
        if (tR) r = veLcCurveAt(tR, r);
        if (tG) g = veLcCurveAt(tG, g);
        if (tB) b = veLcCurveAt(tB, b);
        // 7b) rotação de matiz e curvas de Matiz/Saturação (como no Lumetri, depois das curvas RGB): no plano Y/Cb/Cr
        if (giro || hcOn) {
            let Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Cb = (b - Y) / 1.8556, Cr = (r - Y) / 1.5748;
            if (giro) { const a = Cb * cR0 - Cr * sR0; Cr = Cb * sR0 + Cr * cR0; Cb = a; }
            if (hcOn) {
                const C = Math.hypot(Cb, Cr);
                // cinza não tem matiz: as curvas por matiz entram aos poucos conforme a cor aparece
                const wC = veLcSmooth(0, 0.06, C);
                let h = (Math.atan2(Cr, Cb) - VE_LC_HUE0) / DPI;
                h -= Math.floor(h);
                let k = 1, gira = 0;
                if (H.hs) k *= 1 + (veLcCurveAt(H.hs, h) * 2 - 1) * wC;              // 0 → sem cor, 1 → dobro
                if (H.ls) k *= veLcCurveAt(H.ls, cl(Y)) * 2;
                if (H.ss) k *= veLcCurveAt(H.ss, Math.min(1, C * 2)) * 2;
                if (H.hh) gira = (veLcCurveAt(H.hh, h) - 0.5) * DPI * wC;            // ±180°
                if (H.hl) Y = Math.max(0, Y * (1 + (veLcCurveAt(H.hl, h) - 0.5) * 1.6 * wC));
                if (gira) { const cg = Math.cos(gira), sg = Math.sin(gira), a = Cb * cg - Cr * sg; Cr = Cb * sg + Cr * cg; Cb = a; }
                Cb *= k; Cr *= k;
            }
            r = Y + 1.5748 * Cr; b = Y + 1.8556 * Cb; g = (Y - 0.2126 * r - 0.0722 * b) / 0.7152;
            r = cl(r); g = cl(g); b = cl(b);
        }
        // 8) rodas de cor (depois das curvas, como no Lumetri)
        if (rodas) { r = roda(r, 0); g = roda(g, 1); b = roda(b, 2); }
        out[o++] = r; out[o++] = g; out[o++] = b;
    }
    return out;
}

// Parte de cor dos valores (o que entra na LUT)
const VE_LC_FORA_LUT = new Set(['sharp', 'vig', 'clar']);   // rodam depois da LUT, na imagem
function veLcColorKey(v) {
    const o = {};
    VE_FX.lc.params.forEach(p => { if (!VE_LC_FORA_LUT.has(p.k)) o[p.k] = v[p.k] ?? p.def; });
    o.cv = {};
    VE_LC_CURVAS.forEach(ch => { if (!veLcCurveId(v.cv && v.cv[ch])) o.cv[ch] = v.cv[ch]; });
    o.cw = {};
    VE_LC_RODAS.forEach(([w]) => { if (veLcRodaRGB(v.cw && v.cw[w])) o.cw[w] = v.cw[w]; });
    o.hc = {};
    VE_LC_HC.forEach(([k]) => { if (!veLcHcId(v.hc && v.hc[k])) o.hc[k] = v.hc[k]; });
    return JSON.stringify(o);
}
function veLcColorNeutral(v) {
    return VE_FX.lc.params.every(p => VE_LC_FORA_LUT.has(p.k) || (v[p.k] ?? p.def) === p.def)
        && VE_LC_CURVAS.every(ch => veLcCurveId(v.cv && v.cv[ch])) && veLcRodasNeutras(v) && !veLcHcAtivo(v);
}

// LUT 3D com cache (arrastar um slider volta a valores já vistos)
function veLcLut(v) {
    const key = veLcColorKey(v);
    let L = VELC.luts.get(key);
    if (L) return L;
    const n = veLcHcAtivo(v) ? VE_LC_N_HC : VE_LC_N;
    L = { key, n, f32: veLcBuildLut(v, n), b64: null };
    VELC.luts.set(key, L);
    if (VELC.luts.size > 24) VELC.luts.delete(VELC.luts.keys().next().value);
    return L;
}

// Para a exportação: LUT em Uint16 (0..65535), little-endian, base64
function veLcLutB64(v) {
    const L = veLcLut(v);
    if (!L.b64) {
        const u = new Uint16Array(L.f32.length);
        for (let i = 0; i < u.length; i++) u[i] = Math.round(L.f32[i] * 65535);
        const bytes = new Uint8Array(u.buffer);
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        L.b64 = btoa(s);
    }
    return L.b64;
}

// ── prévia por WebGL2, em passadas (texturas intermediárias em meio-float quando a placa deixa):
// 1) LUT (trilinear) → 2) Clareza: luma desfocada (gaussiano em 2 passadas, numa resolução menor) e
// Y += k·(Y − desfoque)·4Y(1−Y) → 3) nitidez (unsharp 5×5 binomial na luma, como o ffmpeg) → vinheta ──
const VE_LC_VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const VE_LC_FS_LUT = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 uv; out vec4 o;
uniform sampler2D img; uniform sampler3D lut; uniform float useLut, N;
void main() {
    vec4 s = texture(img, vec2(uv.x, 1.0 - uv.y));
    vec3 c = useLut > 0.5 ? texture(lut, s.rgb * ((N - 1.0) / N) + 0.5 / N).rgb : s.rgb;
    o = vec4(c, s.a);
}`;
// desfoque gaussiano de uma direção; luma = 1 lê a luma da imagem, senão o canal R (2ª passada)
const VE_LC_FS_BLUR = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 dir; uniform float sig, luma; uniform int K;
void main() {
    float acc = 0.0, ws = 0.0;
    for (int i = -64; i <= 64; i++) {
        if (i < -K || i > K) continue;
        float w = exp(-0.5 * float(i * i) / (sig * sig));
        vec4 q = texture(src, uv + dir * float(i));
        acc += w * (luma > 0.5 ? dot(q.rgb, vec3(0.2126, 0.7152, 0.0722)) : q.r);
        ws += w;
    }
    o = vec4(acc / ws, 0.0, 0.0, 1.0);
}`;
const VE_LC_FS_CLAR = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src, blur; uniform float k;
void main() {
    vec4 s = texture(src, uv);
    float Y = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722)), t = clamp(Y, 0.0, 1.0);
    o = vec4(clamp(s.rgb + k * (Y - texture(blur, uv).r) * 4.0 * t * (1.0 - t), 0.0, 1.0), s.a);
}`;
const VE_LC_FS_FIM = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform float sharp, ang;
uniform vec2 px, msz;
void main() {
    vec4 s = texture(src, uv);
    vec3 c = s.rgb;
    if (sharp > 0.0) {
        float w[5] = float[5](1.0, 4.0, 6.0, 4.0, 1.0), bl = 0.0;
        for (int j = 0; j < 5; j++) for (int i = 0; i < 5; i++)
            bl += w[i] * w[j] * dot(texture(src, uv + vec2(float(i - 2), float(j - 2)) * px).rgb, vec3(0.299, 0.587, 0.114));
        c += sharp * (dot(c, vec3(0.299, 0.587, 0.114)) - bl / 256.0);
    }
    if (ang > 0.0) {
        vec2 d = (vec2(uv.x, 1.0 - uv.y) - 0.5) * msz;
        float k = cos(ang * length(d) / length(msz * 0.5));
        c *= k * k * k * k;
    }
    o = vec4(clamp(c, 0.0, 1.0), s.a);
}`;

function veLcHalf(f32) {
    // float32 → float16 (para a textura 3D filtrável)
    const out = new Uint16Array(f32.length), fb = new Float32Array(1), ib = new Uint32Array(fb.buffer);
    for (let i = 0; i < f32.length; i++) {
        fb[0] = f32[i];
        const x = ib[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
        out[i] = e <= 0 ? s : e >= 31 ? s | 0x7c00 : s | (e << 10) | ((m + 0x1000) >> 13);
    }
    return out;
}

function veLcGL() {
    if (VELC.gl !== null) return VELC.gl;
    try {
        const cv = document.createElement('canvas');
        const gl = cv.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
        if (!gl) throw new Error('sem WebGL2');
        const meio = !!gl.getExtension('EXT_color_buffer_float');   // texturas intermediárias em meio-float
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const vs = sh(gl.VERTEX_SHADER, VE_LC_VS);
        const prog = (fs, nomes) => {
            const pr = gl.createProgram();
            gl.attachShader(pr, vs);
            gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
            gl.bindAttribLocation(pr, 0, 'p');
            gl.linkProgram(pr);
            if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
            const u = {};
            nomes.forEach(n => { u[n] = gl.getUniformLocation(pr, n); });
            return { pr, u };
        };
        const P = {
            lut: prog(VE_LC_FS_LUT, ['img', 'lut', 'useLut', 'N']),
            blur: prog(VE_LC_FS_BLUR, ['src', 'dir', 'sig', 'luma', 'K']),
            clar: prog(VE_LC_FS_CLAR, ['src', 'blur', 'k']),
            fim: prog(VE_LC_FS_FIM, ['src', 'sharp', 'ang', 'px', 'msz']),
        };
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const tex = (target, linear) => {
            const t = gl.createTexture();
            gl.bindTexture(target, t);
            [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach(w => gl.texParameteri(target, w, gl.CLAMP_TO_EDGE));
            gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
            gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
            return t;
        };
        const img = tex(gl.TEXTURE_2D, false), lut = tex(gl.TEXTURE_3D, true);
        // alvos intermediários: a imagem com a LUT (A), com a clareza (B) e o desfoque em 2 passadas (H, V)
        const alvo = linear => ({ t: tex(gl.TEXTURE_2D, linear), fb: gl.createFramebuffer(), w: 0, h: 0 });
        const T = { A: alvo(false), B: alvo(false), H: alvo(true), V: alvo(true) };
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);   // linhas da LUT (33 × 6 bytes) não são múltiplas de 4
        const linear = gl.createSampler();
        gl.samplerParameteri(linear, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.samplerParameteri(linear, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.samplerParameteri(linear, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.samplerParameteri(linear, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        VELC.gl = { cv, gl, P, img, lut, T, meio, linear, lutKey: null };
    } catch (e) {
        console.warn('[Luz e Cor] WebGL2 indisponível:', e);
        VELC.gl = false;
    }
    return VELC.gl;
}

// Garante o tamanho de um alvo intermediário e o deixa como destino do desenho
function veLcAlvo(G, A, w, h) {
    const gl = G.gl;
    if (A.w !== w || A.h !== h) {
        // numa unidade só para isso: na 0 está a entrada da passada (trocá-la fazia a passada ler a própria saída)
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, A.t);
        if (G.meio) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, A.t, 0);
        A.w = w; A.h = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb);
    gl.viewport(0, 0, w, h);
}
function veLcUsar(G, unidade, t) {
    const gl = G.gl;
    gl.activeTexture(gl.TEXTURE0 + unidade);
    gl.bindTexture(gl.TEXTURE_2D, t);
}

// draw do efeito (ver VE_FX.lc em editor-fx.js)
function veLcDraw(a, v, env) {
    const G = veLcGL();
    if (!G) return a;
    const { cv, gl, P, T } = G, { w, h } = env;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const cor = !veLcColorNeutral(v);
    let n = VE_LC_N;
    if (cor) {
        const L = veLcLut(v);
        n = L.n;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, G.lut);
        if (G.lutKey !== L.key) {
            if (!L.f16) L.f16 = veLcHalf(L.f32);
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, n, n, n, 0, gl.RGB, gl.HALF_FLOAT, L.f16);
            G.lutKey = L.key;
        }
    }
    // 1) LUT → A
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, G.img);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.cv);
    veLcAlvo(G, T.A, w, h);
    gl.useProgram(P.lut.pr);
    gl.uniform1i(P.lut.u.img, 0);
    gl.uniform1i(P.lut.u.lut, 1);
    gl.uniform1f(P.lut.u.useLut, cor ? 1 : 0);
    gl.uniform1f(P.lut.u.N, n);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    let fonte = T.A;
    // 2) Clareza: desfoque da luma (sigma em pixels da prévia: o da mídia × escala) numa grade reduzida → B
    const kc = veLcClarAmt(v);
    if (kc) {
        const sig = VE_LC_CLAR_SIGMA * Math.min(env.mw, env.mh) * env.q;
        // grade reduzida só para raios grandes (passo de até sigma/6: a imagem não serrilha o desfoque)
        const ds = Math.max(1, Math.floor(sig / 6)), sw = Math.max(1, Math.ceil(w / ds)), shh = Math.max(1, Math.ceil(h / ds));
        const sigT = sig / ds, K = Math.min(64, Math.ceil(sigT * 3));
        gl.useProgram(P.blur.pr);
        gl.uniform1i(P.blur.u.src, 0);
        gl.uniform1f(P.blur.u.sig, sigT);
        gl.uniform1i(P.blur.u.K, K);
        veLcAlvo(G, T.H, sw, shh);           // horizontal: lê a imagem inteira em passos de ds pixels
        veLcUsar(G, 0, T.A.t);
        gl.bindSampler(0, G.linear);         // lê a imagem com filtro linear (A é NEAREST para a nitidez)
        gl.uniform2f(P.blur.u.dir, ds / w, 0);
        gl.uniform1f(P.blur.u.luma, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindSampler(0, null);
        veLcAlvo(G, T.V, sw, shh);           // vertical, na grade reduzida
        veLcUsar(G, 0, T.H.t);
        gl.uniform2f(P.blur.u.dir, 0, 1 / shh);
        gl.uniform1f(P.blur.u.luma, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        veLcAlvo(G, T.B, w, h);
        gl.useProgram(P.clar.pr);
        veLcUsar(G, 0, T.A.t);
        veLcUsar(G, 2, T.V.t);
        gl.uniform1i(P.clar.u.src, 0);
        gl.uniform1i(P.clar.u.blur, 2);
        gl.uniform1f(P.clar.u.k, kc);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        fonte = T.B;
    }
    // 3) nitidez e vinheta → tela
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(P.fim.pr);
    veLcUsar(G, 0, fonte.t);
    gl.uniform1i(P.fim.u.src, 0);
    gl.uniform1f(P.fim.u.sharp, veLcSharpAmt(v));
    gl.uniform1f(P.fim.u.ang, veLcVigAngle(v));
    // vizinhos da nitidez em pixels da MÍDIA (a prévia pode estar reduzida)
    gl.uniform2f(P.fim.u.px, 1 / env.q / w, 1 / env.q / h);
    gl.uniform2f(P.fim.u.msz, env.mw, env.mh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const b = veFxOther(a, w, h);
    b.ctx.clearRect(0, 0, w, h);
    b.ctx.drawImage(cv, 0, 0);
    return b;
}
const veLcSharpAmt = v => v.sharp / 100 * 2.5;             // luma_amount do unsharp
const veLcVigAngle = v => v.vig / 100 * Math.PI / 2;       // angle do vignette
const veLcClarAmt = v => (v.clar || 0) / 100 * 1.2;        // k da Clareza (negativo suaviza)

// ── painel ──
function veLcClip() {
    const c = VE.clips[VE.sel];
    return c && !(VE.info && VE.info.audio_only) && !veIsAudio(c) ? c : null;
}
function veLcFx(c) { return c && c.fx ? c.fx.find(f => f.t === 'lc') : null; }

// Clipes que o painel edita: o selecionado e, com vários selecionados, todos os que aceitam cor (como aplicar um
// efeito). Cada mudança vale para cada um: o que foi mexido fica igual em todos, o resto de cada clipe continua dele.
function veLcAlvos() {
    const c = veLcClip();
    if (!c) return [];
    return [c, ...veSelLista().filter(x => x !== c && !veIsAudio(x) && !veLocked(x))];
}

// Garante o efeito Luz e Cor no clipe (entra no fim da lista, como no Premiere)
function veLcEnsureEm(c) {
    let f = veLcFx(c);
    if (!f) {
        const v = {};
        VE_FX.lc.params.forEach(p => { v[p.k] = p.def; });
        f = { id: veFxNewId(), t: 'lc', on: true, v };
        c.fx = [...(c.fx || []), f];
    }
    return f;
}
function veLcEnsure() {
    const c = veLcClip();
    return c ? veLcEnsureEm(c).id : null;
}

// Aplica fn (recebe uma cópia do efeito e a devolve) no Luz e Cor de cada clipe alvo (cria onde faltar)
function veLcEditarTodos(fn, criar = true) {
    veLcAlvos().forEach(c => {
        const f = criar ? veLcEnsureEm(c) : veLcFx(c);
        if (f) c.fx = c.fx.map(x => (x.id === f.id ? fn({ ...x, v: { ...x.v } }) : x));
    });
}

function veLcParam(k) { return VE_FX.lc.params.find(p => p.k === k); }

function veLcBuild() {
    const box = $ve('ve-lc-body');
    if (!box) return;
    const row = p => `
        <div class="ve-prop ve-lc-row" data-lk="${p.k}">
            <label title="Duplo clique restaura">${p.nome}</label>
            <input type="range" class="ve-lc-range ve-lc-${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" data-lk="${p.k}" title="Duplo clique restaura">
            <span class="ve-prop-num"><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" data-lk="${p.k}"><i>${p.un}</i></span>
        </div>`;
    box.innerHTML = VE_LC_SECOES.map(s => `
        <div class="ve-lc-sec${VELC.open.has(s.id) ? '' : ' collapsed'}" data-sec="${s.id}">
            <div class="ve-lc-sec-head" data-la="sec"><span class="ve-lc-caret">▾</span><b>${s.nome}</b><button data-la="resetsec" title="Restaurar esta seção">↺</button></div>
            <div class="ve-lc-sec-body">${s.curvas ? `
                <div class="ve-lc-ctabs">
                    <button class="ve-lc-ctab" data-la="ctab" data-ct="rgb" title="Curvas RGB: luz de todas as cores ou de cada canal">RGB</button>
                    ${VE_LC_HC.map(([k, nome, , tit]) => `<button class="ve-lc-ctab" data-la="ctab" data-ct="${k}" title="${tit}">${nome}</button>`).join('')}
                </div>
                <div class="ve-lc-chs">${VE_LC_CURVAS.map(ch => `<button class="ve-lc-ch ch-${ch}" data-la="ch" data-ch="${ch}" title="${ch === 'm' ? 'Curva RGB (todas as cores)' : 'Curva só do ' + { r: 'vermelho', g: 'verde', b: 'azul' }[ch]}">${ch === 'm' ? 'RGB' : ch.toUpperCase()}</button>`).join('')}</div>
                <canvas class="ve-lc-curve" id="ve-lc-curve"></canvas>
                <div class="ve-lc-hint" id="ve-lc-curve-hint"></div>`
                : s.rodas ? `<div class="ve-lc-rodas">${VE_LC_RODAS.map(([w, nome, k, onde]) => `
                    <div class="ve-lc-roda" data-w="${w}">
                        <div class="ve-lc-roda-top"><b title="Age em ${onde}">${nome}</b><button data-la="rodareset" data-w="${w}" title="Zerar ${nome}">↺</button></div>
                        <canvas class="ve-lc-roda-cv" data-w="${w}" title="${nome} (${onde}): arraste dentro da roda · Shift: ajuste fino · duplo clique zera"></canvas>
                        <div class="ve-lc-roda-num" data-wn="${w}"></div>
                        <input type="range" class="ve-lc-range ve-lc-roda-luz" min="-100" max="100" step="1" data-lk="${k}" title="Luz de ${nome} (${onde}) · duplo clique zera">
                    </div>`).join('')}</div>
                <div class="ve-lc-hint">Lift: sombras · Gamma: meios-tons · Gain: realces · Offset: tudo. A barra embaixo de cada roda é a luz.</div>`
                : s.grupos.map(g => (g.nome ? `<div class="ve-lc-grp">${g.nome}</div>` : '') + g.ks.map(k => row(veLcParam(k))).join('')).join('')}
            </div>
        </div>`).join('');
    VELC.built = true;
    VELC.key = '';
}

function veLcRender() {
    const pane = $ve('ve-lc');
    if (!pane) return;
    if (!VELC.built) veLcBuild();
    const c = veLcClip(), f = veLcFx(c);
    $ve('ve-lc-empty').hidden = !!c;
    pane.hidden = !c;
    if (!c) { VELC.key = ''; return; }
    const v = f ? veFxValues(f) : veLcDefaults();
    const key = VE.sel + '|' + veLcAlvos().length + '|' + (f ? f.id + (f.on !== false) : '') + '|' + JSON.stringify(v) + VELC.ch + VELC.ct;
    if (key === VELC.key) return;
    VELC.key = key;
    const nAlvos = veLcAlvos().length;
    $ve('ve-lc-title').innerHTML = `${veNomeClipe(c)} ${VE.sel + 1}<span>${nAlvos > 1 ? `${veT('e mais')} ${nAlvos - 1} · ${veT('as mudanças valem para os')} ${nAlvos} ${veT('selecionados')}`
        : f ? (f.on === false ? 'desligado' : 'Luz e Cor aplicado') : 'sem ajustes'}</span>`;
    const on = $ve('ve-lc-on');
    on.classList.toggle('off', !!f && f.on === false);
    on.disabled = !f;
    pane.classList.toggle('off', !!f && f.on === false);
    pane.querySelectorAll('input[data-lk]').forEach(inp => {
        const p = veLcParam(inp.dataset.lk), val = v[p.k] ?? p.def;
        if (inp.ownerDocument.activeElement !== inp) inp.value = veFxFmt(p, val);
        const row = inp.closest('.ve-lc-row');
        if (row) row.classList.toggle('mod', val !== p.def);
    });
    pane.querySelectorAll('[data-sec]').forEach(s => {
        const sec = VE_LC_SECOES.find(x => x.id === s.dataset.sec);
        s.classList.toggle('mod', !veLcSecNeutral(sec, v));
    });
    const rgb = VELC.ct === 'rgb';
    pane.querySelectorAll('.ve-lc-ctab').forEach(b => {
        const k = b.dataset.ct;
        b.classList.toggle('active', k === VELC.ct);
        b.classList.toggle('mod', k === 'rgb' ? VE_LC_CURVAS.some(ch => !veLcCurveId(v.cv && v.cv[ch])) : !veLcHcId(v.hc && v.hc[k]));
    });
    const chs = pane.querySelector('.ve-lc-chs');
    if (chs) chs.hidden = !rgb;
    pane.querySelectorAll('.ve-lc-ch').forEach(b => {
        b.classList.toggle('active', b.dataset.ch === VELC.ch);
        b.classList.toggle('mod', !veLcCurveId(v.cv && v.cv[b.dataset.ch]));
    });
    const dica = $ve('ve-lc-curve-hint');
    if (dica) dica.textContent = rgb ? 'Clique para criar um ponto e arraste · duplo clique (ou Ctrl+clique) no ponto remove'
        : 'Clique na linha para criar um ponto (o primeiro vem com dois vizinhos que seguram o resto) e arraste para cima ou para baixo · duplo clique remove';
    veLcDrawCurve(v);
    veLcDrawRodas(v);
}

function veLcDefaults() {
    const v = { cv: {} };
    VE_FX.lc.params.forEach(p => { v[p.k] = p.def; });
    return v;
}
function veLcSecNeutral(sec, v) {
    if (sec.curvas) return VE_LC_CURVAS.every(ch => veLcCurveId(v.cv && v.cv[ch])) && !veLcHcAtivo(v);
    if (sec.rodas) return veLcRodasNeutras(v);
    return sec.grupos.every(g => g.ks.every(k => (v[k] ?? veLcParam(k).def) === veLcParam(k).def));
}

// Muda o efeito do clipe selecionado (cria se preciso); fn recebe o efeito já copiado
function veLcChange(fn) {
    if (!veLcClip()) return;
    veLcEditarTodos(x => { fn(x); return x; });   // todos os clipes selecionados (veLcAlvos)
    veRenderFxControls();
    veLcRender();
    veDrawMonitorSoon();
}

function veLcSet(k, val) {
    const p = veLcParam(k);
    if (!p || !isFinite(val)) return;
    val = Math.min(Math.max(val, p.min), p.max);
    veLcChange(f => { f.v[k] = val; });
}

// ── curvas (RGB e de Matiz/Saturação: o mesmo canvas, conforme a aba) ──
const veLcHcEixo = k => (VE_LC_HC.find(x => x[0] === k) || [])[2];
function veLcCurvePts(v, ch) {
    if (VE_LC_HC.some(x => x[0] === ch)) return ((v.hc && v.hc[ch]) || []).map(q => q.slice()).sort((a, b) => a[0] - b[0]);
    const pts = v.cv && v.cv[ch];
    return (pts && pts.length >= 2 ? pts : VE_LC_ID).map(q => q.slice()).sort((a, b) => a[0] - b[0]);
}
const veLcCurvaAtual = () => (VELC.ct === 'rgb' ? VELC.ch : VELC.ct);

// Cor do matiz h (0..1, a partir do vermelho) para desenhar o eixo: a mesma direção usada na conta (VE_LC_HUE0)
function veLcCorMatiz(h, Y = 0.55, C = 0.26) {
    const a = VE_LC_HUE0 + h * Math.PI * 2, Cb = Math.cos(a) * C, Cr = Math.sin(a) * C;
    const r = Y + 1.5748 * Cr, b = Y + 1.8556 * Cb, g = (Y - 0.2126 * r - 0.0722 * b) / 0.7152;
    const m = Math.max(r, g, b, 1e-6), lo = Math.min(r, g, b);
    // estica para a cor ficar viva no desenho (só o eixo; a conta não passa por aqui)
    const k = x => Math.round(Math.max(0, Math.min(1, (x - lo) / Math.max(1e-6, m - lo) * 0.85 + 0.12)) * 255);
    return `rgb(${k(r)},${k(g)},${k(b)})`;
}

function veLcDrawCurve(v) {
    const cv = $ve('ve-lc-curve');
    if (!cv || !cv.offsetParent) return;
    const dpr = cv.ownerDocument.defaultView.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const P = VE_LC_PAD, w = W - 2 * P, h = H - 2 * P;
    x.fillStyle = '#0c0c0e';
    x.fillRect(P, P, w, h);
    const ch = veLcCurvaAtual(), eixo = veLcHcEixo(ch);
    if (eixo) {
        // fundo: o eixo de baixo em cor (matiz, luz ou saturação), forte numa faixa e fraco na área toda
        const gr = x.createLinearGradient(P, 0, P + w, 0);
        for (let i = 0; i <= 24; i++) {
            const t = i / 24;
            gr.addColorStop(t, eixo === 'h' ? veLcCorMatiz(t) : eixo === 'l' ? `rgb(${Math.round(t * 255)},${Math.round(t * 255)},${Math.round(t * 255)})`
                : veLcCorMatiz(0, 0.5, 0.26 * t));
        }
        x.globalAlpha = 0.16;
        x.fillStyle = gr;
        x.fillRect(P, P, w, h);
        x.globalAlpha = 1;
        x.fillRect(P, P + h - 8, w, 8);
        if (ch === 'hh') {   // Matiz × Matiz: o eixo vertical é a cor de destino
            const gv = x.createLinearGradient(0, P + h, 0, P);
            for (let i = 0; i <= 24; i++) gv.addColorStop(i / 24, veLcCorMatiz(i / 24 - 0.5 + 1));
            x.fillStyle = gv;
            x.fillRect(P, P, 6, h - 8);
        }
    }
    x.strokeStyle = 'rgba(255,255,255,0.07)';
    x.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        x.beginPath(); x.moveTo(P + w * i / 4 + 0.5, P); x.lineTo(P + w * i / 4 + 0.5, P + h); x.stroke();
        x.beginPath(); x.moveTo(P, P + h * i / 4 + 0.5); x.lineTo(P + w, P + h * i / 4 + 0.5); x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,0.14)';
    x.beginPath();
    if (eixo) { x.moveTo(P, P + h / 2); x.lineTo(P + w, P + h / 2); } else { x.moveTo(P, P + h); x.lineTo(P + w, P); }
    x.stroke();
    const cor = { m: '#e5e5e5', r: '#ef4444', g: '#22c55e', b: '#3b82f6' };
    const traca = (k, alpha, lw) => {
        const T = veLcHcEixo(k) ? veLcHcTable(veLcCurvePts(v, k), veLcHcEixo(k) === 'h') : veLcCurveTable(veLcCurvePts(v, k));
        x.globalAlpha = alpha;
        x.strokeStyle = cor[k] || '#f5f5f5';
        x.lineWidth = lw;
        x.beginPath();
        for (let i = 0; i <= w; i++) {
            const y = P + h - veLcCurveAt(T, i / w) * h;
            i ? x.lineTo(P + i, y) : x.moveTo(P, y);
        }
        x.stroke();
        x.globalAlpha = 1;
    };
    if (!eixo) VE_LC_CURVAS.forEach(k => { if (k !== VELC.ch && !veLcCurveId(v.cv && v.cv[k])) traca(k, 0.35, 1); });
    traca(ch, 1, 1.6);
    veLcCurvePts(v, ch).forEach((q, i) => {
        x.beginPath();
        x.arc(P + q[0] * w, P + h - q[1] * h, 4, 0, Math.PI * 2);
        x.fillStyle = VELC.drag && VELC.drag.i === i ? (cor[ch] || '#fff') : '#0c0c0e';
        x.fill();
        x.strokeStyle = cor[ch] || '#fff';
        x.lineWidth = 1.5;
        x.stroke();
    });
}
const VE_LC_PAD = 6;

function veLcCurvePos(cv, e) {
    const r = cv.getBoundingClientRect(), P = VE_LC_PAD;
    return [Math.min(1, Math.max(0, (e.clientX - r.left - P) / (r.width - 2 * P))),
            Math.min(1, Math.max(0, 1 - (e.clientY - r.top - P) / (r.height - 2 * P)))];
}
function veLcCurveHit(cv, pts, e) {
    const r = cv.getBoundingClientRect(), P = VE_LC_PAD, w = r.width - 2 * P, h = r.height - 2 * P;
    let best = -1, bd = 9;
    pts.forEach((q, i) => {
        const d = Math.hypot(r.left + P + q[0] * w - e.clientX, r.top + P + h - q[1] * h - e.clientY);
        if (d < bd) { bd = d; best = i; }
    });
    return best;
}

function veLcSetCurve(ch, pts) {
    veLcChange(f => {
        if (veLcHcEixo(ch)) {
            const hc = { ...(f.v.hc || {}) };
            if (veLcHcId(pts)) delete hc[ch]; else hc[ch] = pts.map(q => [+q[0].toFixed(4), +q[1].toFixed(4)]);
            f.v.hc = hc;
            return;
        }
        const cv = { ...(f.v.cv || {}) };
        if (veLcCurveId(pts)) delete cv[ch]; else cv[ch] = pts.map(q => [+q[0].toFixed(4), +q[1].toFixed(4)]);
        f.v.cv = cv;
    });
}

function veLcCurveInit(cv) {
    const valores = () => { const f = veLcFx(veLcClip()); return f ? veFxValues(f) : veLcDefaults(); };
    const pontos = () => veLcCurvePts(valores(), veLcCurvaAtual());
    // remover: Ctrl+clique ou duplo clique no ponto (RGB: as pontas voltam para a diagonal)
    const remover = e => {
        const ch = veLcCurvaAtual(), pts = pontos(), i = veLcCurveHit(cv, pts, e);
        if (i < 0) return false;
        vePushHistory();
        if (veLcHcEixo(ch)) pts.splice(i, 1);
        else if (i === 0) pts[0] = [0, 0]; else if (i === pts.length - 1) pts[i] = [1, 1]; else pts.splice(i, 1);
        veLcSetCurve(ch, pts);
        veRenderClips();
        veDraw();
        return true;
    };
    cv.addEventListener('dblclick', remover);
    cv.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !veLcClip()) return;
        if (e.ctrlKey) { remover(e); return; }
        const ch = veLcCurvaAtual(), eixo = veLcHcEixo(ch), pts = pontos();
        let i = veLcCurveHit(cv, pts, e), hist = false;
        if (i < 0) {
            if (pts.length >= 16) { veToast('Máximo de 16 pontos por curva'); return; }
            const q = veLcCurvePos(cv, e);
            if (eixo) {
                // o ponto nasce em cima da linha; o primeiro vem com dois vizinhos neutros que seguram o resto
                q[1] = veLcCurveAt(veLcHcTable(pts, eixo === 'h'), q[0]);
                if (!pts.length) {
                    const d = 0.1, viz = eixo === 'h' ? [(q[0] - d + 1) % 1, (q[0] + d) % 1] : [q[0] - d, q[0] + d].filter(x => x > 0 && x < 1);
                    viz.forEach(x => pts.push([x, 0.5]));
                }
            }
            pts.push(q);
            pts.sort((a, b) => a[0] - b[0]);
            i = pts.indexOf(q);
            vePushHistory();
            hist = true;
            veLcSetCurve(ch, pts);
        }
        VELC.drag = { i, pts, hist, ch };
        cv.setPointerCapture(e.pointerId);
        VELC.key = '';
        veLcRender();
    });
    cv.addEventListener('pointermove', e => {
        const d = VELC.drag;
        if (!d) return;
        if (!d.hist) { vePushHistory(); d.hist = true; }   // o desfazer só entra quando o ponto anda
        const q = veLcCurvePos(cv, e), n = d.pts.length, eixo = veLcHcEixo(d.ch);
        const lo = d.i ? d.pts[d.i - 1][0] + 0.01 : 0, hi = d.i < n - 1 ? d.pts[d.i + 1][0] - 0.01 : 1;
        let y = q[1];
        if (eixo && Math.abs(y - 0.5) < 0.015) y = 0.5;   // encaixa no neutro
        d.pts[d.i] = [Math.min(hi, Math.max(lo, q[0])), y];
        veLcSetCurve(d.ch, d.pts);
    });
    const fim = () => {
        if (!VELC.drag) return;
        VELC.drag = null;
        VELC.key = '';
        veLcRender();
        veRenderClips();
        veDraw();
    };
    cv.addEventListener('pointerup', fim);
    cv.addEventListener('pointercancel', fim);
}

// ── rodas (estilo DaVinci): anel de matiz, miolo escuro com um toque da cor, ponto com rastro e valores R/G/B ──
const VELCR = { disco: new Map(), drag: null };
// disco da roda (cache por tamanho): anel de matiz na borda, miolo escuro levemente colorido na direção de cada cor
function veLcRodaDisco(px) {
    let im = VELCR.disco.get(px);
    if (im) return im;
    im = document.createElement('canvas');
    im.width = im.height = px;
    const g = im.getContext('2d'), d = g.createImageData(px, px), R = px / 2, anel = Math.max(4, px * 0.06);
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
        const u = (x + 0.5 - R) / R, w = (R - y - 0.5) / R, r = Math.hypot(u, w), i = (y * px + x) * 4;
        if (r > 1) continue;
        const dir = r > 1e-6 ? [u / r, w / r] : [0, 0];
        const noAnel = r > 1 - anel / R;
        // cor da direção (a mesma conta das rodas), viva no anel e bem fraca no miolo
        const o = veLcRodaRGB([dir[0] * 0.5, dir[1] * 0.5]) || [0, 0, 0];
        const base = noAnel ? 0.5 : 0.11, forca = noAnel ? 1.25 : 0.22 * Math.min(1, r * 1.3);
        d.data[i] = Math.max(0, Math.min(255, (base + o[0] * forca) * 255));
        d.data[i + 1] = Math.max(0, Math.min(255, (base + o[1] * forca) * 255));
        d.data[i + 2] = Math.max(0, Math.min(255, (base + o[2] * forca) * 255));
        d.data[i + 3] = r > 0.985 ? Math.round((1 - r) / 0.015 * 255) : 255;
    }
    g.putImageData(d, 0, 0);
    VELCR.disco.set(px, im);
    return im;
}

function veLcDrawRodas(v) {
    const pane = $ve('ve-lc');
    if (!pane) return;
    pane.querySelectorAll('.ve-lc-roda-cv').forEach(cv => veLcDrawRoda(cv, v));
    // valores efetivos por canal, como embaixo das rodas do Resolve (neutro: Lift 0, Gamma 0, Gain 1, Offset 0)
    const P = veLcRodaParams(v);
    const num = {
        s: P.lift, m: P.gama.map(x => -Math.log2(x)), h: P.gain, o: P.off,
    };
    pane.querySelectorAll('[data-wn]').forEach(el => {
        const vs = num[el.dataset.wn] || [0, 0, 0];
        el.innerHTML = vs.map((x, i) => `<span class="c${i}">${x.toFixed(2)}</span>`).join('');
        el.closest('.ve-lc-roda').classList.toggle('mod', !!veLcRodaRGB(v.cw && v.cw[el.dataset.wn])
            || !!(v[VE_LC_RODAS.find(r => r[0] === el.dataset.wn)[2]] || 0));
    });
}
function veLcDrawRoda(cv, v) {
    if (!cv.offsetParent) return;
    const dpr = cv.ownerDocument.defaultView.devicePixelRatio || 1, S = cv.clientWidth;
    if (!S) return;
    const px = Math.round(S * dpr);
    if (cv.width !== px || cv.height !== px) { cv.width = cv.height = px; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    const R = px / 2, ri = R - 2 * dpr;
    g.drawImage(veLcRodaDisco(Math.round(ri * 2)), R - ri, R - ri);
    // cruz e anéis de referência (como as marcas do Resolve)
    const miolo = ri * (1 - Math.max(4, ri * 2 * 0.06) / ri);
    g.strokeStyle = 'rgba(255,255,255,0.09)';
    g.lineWidth = dpr;
    g.beginPath(); g.moveTo(R - miolo, R); g.lineTo(R + miolo, R); g.moveTo(R, R - miolo); g.lineTo(R, R + miolo); g.stroke();
    [0.33, 0.66].forEach(k => { g.beginPath(); g.arc(R, R, miolo * k, 0, Math.PI * 2); g.stroke(); });
    const p = (v.cw && v.cw[cv.dataset.w]) || [0, 0], x = R + p[0] * miolo, y = R - p[1] * miolo, mod = !!veLcRodaRGB(p);
    if (mod) {
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 1.5 * dpr;
        g.beginPath(); g.moveTo(R, R); g.lineTo(x, y); g.stroke();
    }
    g.beginPath();
    g.arc(R, R, 2 * dpr, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fill();
    g.beginPath();
    g.arc(x, y, 5.5 * dpr, 0, Math.PI * 2);
    g.fillStyle = mod ? '#fff' : 'rgba(255,255,255,0.6)';
    g.fill();
    g.strokeStyle = '#000';
    g.lineWidth = 1.5 * dpr;
    g.stroke();
}

function veLcSetRoda(w, p) {
    veLcChange(f => {
        const cw = { ...(f.v.cw || {}) };
        if (!veLcRodaRGB(p)) delete cw[w]; else cw[w] = [+p[0].toFixed(4), +p[1].toFixed(4)];
        f.v.cw = cw;
    });
}

function veLcRodasInit(pane) {
    const pos = (cv, e) => {
        const r = cv.getBoundingClientRect(), R = r.width / 2 * 0.9;
        return [(e.clientX - r.left - r.width / 2) / R, (r.top + r.height / 2 - e.clientY) / R];
    };
    pane.addEventListener('pointerdown', e => {
        const cv = e.target.closest('.ve-lc-roda-cv');
        if (!cv || e.button !== 0 || !veLcClip()) return;
        e.preventDefault();
        const f = veLcFx(veLcClip()), v = f ? veFxValues(f) : veLcDefaults();
        const p0 = (v.cw && v.cw[cv.dataset.w]) || [0, 0];
        VELCR.drag = { cv, w: cv.dataset.w, p0: p0.slice(), a0: pos(cv, e), hist: false };
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* solto */ }
    });
    pane.addEventListener('pointermove', e => {
        const d = VELCR.drag;
        if (!d) return;
        if (!d.hist) { vePushHistory(); d.hist = true; VE._fxEdit = true; }
        const a = pos(d.cv, e);
        // como no Resolve: o ponto anda JUNTO com o mouse a partir de onde estava (não pula para o clique), mais
        // devagar que ele; Shift = bem fino
        const k = e.shiftKey ? 0.12 : 0.5;
        let p = [d.p0[0] + (a[0] - d.a0[0]) * k, d.p0[1] + (a[1] - d.a0[1]) * k];
        const n = Math.hypot(p[0], p[1]);
        if (n > 1) p = [p[0] / n, p[1] / n];
        if (n < 0.015) p = [0, 0];   // encaixa no centro
        veLcSetRoda(d.w, p);
    });
    const fim = () => {
        if (!VELCR.drag) return;
        VELCR.drag = null;
        VE._fxEdit = false;
        veRenderClips();
        veDraw();
    };
    pane.addEventListener('pointerup', fim);
    pane.addEventListener('pointercancel', fim);
    pane.addEventListener('dblclick', e => {
        const cv = e.target.closest('.ve-lc-roda-cv'), luz = e.target.closest('.ve-lc-roda-luz');
        if ((!cv && !luz) || !veLcClip()) return;
        vePushHistory();
        if (cv) veLcSetRoda(cv.dataset.w, [0, 0]);
        else veLcSet(luz.dataset.lk, 0);
        veRenderClips();
        veDraw();
    });
}

function veLcAction(el) {
    const a = el.dataset.la;
    if (a === 'sec') {
        const s = el.closest('[data-sec]'), id = s.dataset.sec;
        VELC.open.has(id) ? VELC.open.delete(id) : VELC.open.add(id);
        s.classList.toggle('collapsed', !VELC.open.has(id));
        VELC.key = '';
        veLcRender();
        return;
    }
    if (a === 'ch') { VELC.ch = el.dataset.ch; VELC.key = ''; veLcRender(); return; }
    if (a === 'ctab') { VELC.ct = el.dataset.ct; VELC.key = ''; veLcRender(); return; }
    // vale para todos os clipes selecionados que têm Luz e Cor (o principal decide liga/desliga)
    const c = veLcClip(), f = veLcFx(c);
    if (!f) return;
    vePushHistory();
    if (a === 'on') {
        const on = f.on === false;
        veLcEditarTodos(x => ({ ...x, on }), false);
    } else if (a === 'reset') {
        veLcEditarTodos(x => { x.v = veLcDefaults(); return x; }, false);
    } else if (a === 'rodareset') {
        const r = VE_LC_RODAS.find(x => x[0] === el.dataset.w);
        veLcEditarTodos(x => { const cw = { ...(x.v.cw || {}) }; delete cw[r[0]]; x.v.cw = cw; x.v[r[2]] = 0; return x; }, false);
    } else if (a === 'resetsec') {
        const sec = VE_LC_SECOES.find(x => x.id === el.closest('[data-sec]').dataset.sec);
        veLcEditarTodos(x => {
            if (sec.curvas) { x.v.cv = {}; x.v.hc = {}; }
            else if (sec.rodas) { x.v.cw = {}; VE_LC_RODAS.forEach(([, , k]) => { x.v[k] = 0; }); }
            else sec.grupos.forEach(g => g.ks.forEach(k => { x.v[k] = veLcParam(k).def; }));
            return x;
        }, false);
    }
    veRefresh();
}

function veLcInit() {
    const pane = $ve('ve-lc');
    if (!pane) return;
    veLcBuild();
    veLcCurveInit($ve('ve-lc-curve'));
    veLcRodasInit(pane);
    pane.addEventListener('click', e => {
        const b = e.target.closest('[data-la]');
        if (!b || (b.dataset.la === 'sec' && e.target.closest('button'))) return;
        e.stopPropagation();
        veLcAction(b);
    });
    // um passo de desfazer por gesto; duplo clique no nome ou no slider restaura o padrão
    pane.addEventListener('input', e => {
        const el = e.target.closest('input[data-lk]');
        if (!el || !veLcClip()) return;
        if (!VE._fxEdit) { vePushHistory(); VE._fxEdit = true; }
        veLcSet(el.dataset.lk, parseFloat(String(el.value).replace(',', '.')));
    });
    pane.addEventListener('change', () => { VE._fxEdit = false; veRenderClips(); veDraw(); });
    pane.addEventListener('dblclick', e => {
        const row = e.target.closest('.ve-lc-row');
        if (!row || e.target.closest('input[type=number]') || !veLcClip()) return;
        const p = veLcParam(row.dataset.lk), f = veLcFx(veLcClip());
        if (!f || veFxValues(f)[p.k] === p.def) return;
        vePushHistory();
        veLcSet(p.k, p.def);
        veRenderClips();
        veDraw();
    });
    pane.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); if (e.target.matches('input')) e.stopPropagation(); });
    // o painel pode mudar de tamanho (docking): redesenha a curva
    new ResizeObserver(() => { VELC.key = ''; veLcRender(); }).observe($ve('ve-lc-curve'));
}

document.addEventListener('DOMContentLoaded', veLcInit);
