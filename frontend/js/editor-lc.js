// =========================================================
// Pocket Editor — Luz e Cor (painel de correção de cor, no estilo do Lumetri do Premiere)
// É o efeito 'lc' do clipe (c.fx): parâmetros numéricos + curvas (v.cv = {m, r, g, b}: pontos [x, y] de 0 a 1).
// Toda a parte de cor vira uma LUT 3D (VE_LC_N³) calculada aqui: a prévia aplica a LUT por WebGL e a exportação
// recebe a MESMA LUT (lut3d do ffmpeg, interpolação trilinear) — a conta existe num lugar só.
// Nitidez (unsharp 5×5 na luma) e vinheta (vignette do ffmpeg) rodam depois da LUT, com a mesma fórmula do ffmpeg.
// =========================================================

const VE_LC_N = 33;
const VE_LC_CURVAS = ['m', 'r', 'g', 'b'];
const VE_LC_ID = [[0, 0], [1, 1]];

// Seções do painel (a ordem dos parâmetros aqui é só de interface; a ordem da conta está em veLcBuildLut)
const VE_LC_SECOES = [
    { id: 'basic', nome: 'Correção básica', grupos: [
        { nome: 'Balanço de branco', ks: ['temp', 'tint'] },
        { nome: 'Tom', ks: ['exp', 'ct', 'hi', 'sh', 'wh', 'bl'] },
        { nome: null, ks: ['sat'] },
    ] },
    { id: 'creative', nome: 'Criativo', grupos: [{ nome: null, ks: ['fade', 'sharp', 'vib'] }] },
    { id: 'curves', nome: 'Curvas', curvas: true },
    { id: 'vignette', nome: 'Vinheta', grupos: [{ nome: null, ks: ['vig'] }] },
];

const VELC = {
    open: new Set(['basic', 'creative', 'curves', 'vignette']),
    ch: 'm',            // curva em edição
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
    // 1) balanço de branco e exposição (em luz linear); 2) contraste: curva em S, pivô no meio
    const canal = [0, 1, 2].map(i => {
        const t = new Float64Array(N);
        for (let j = 0; j < N; j++) {
            let x = j / (N - 1);
            if (wbOn) x = veLcEnc(veLcDec(x) * gain[i]);
            if (kC && x >= 0 && x <= 1) x += kC * ((x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)) - x);
            t[j] = x;
        }
        return t;
    });
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
        out[o++] = r; out[o++] = g; out[o++] = b;
    }
    return out;
}

// Parte de cor dos valores (o que entra na LUT)
function veLcColorKey(v) {
    const o = {};
    VE_FX.lc.params.forEach(p => { if (p.k !== 'sharp' && p.k !== 'vig') o[p.k] = v[p.k]; });
    o.cv = {};
    VE_LC_CURVAS.forEach(ch => { if (!veLcCurveId(v.cv && v.cv[ch])) o.cv[ch] = v.cv[ch]; });
    return JSON.stringify(o);
}
function veLcColorNeutral(v) {
    return VE_FX.lc.params.every(p => p.k === 'sharp' || p.k === 'vig' || v[p.k] === p.def)
        && VE_LC_CURVAS.every(ch => veLcCurveId(v.cv && v.cv[ch]));
}

// LUT 3D com cache (arrastar um slider volta a valores já vistos)
function veLcLut(v) {
    const key = veLcColorKey(v);
    let L = VELC.luts.get(key);
    if (L) return L;
    L = { key, f32: veLcBuildLut(v, VE_LC_N), b64: null };
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

// ── prévia por WebGL2: LUT (trilinear) → nitidez (unsharp 5×5 binomial na luma, como o ffmpeg) → vinheta ──
const VE_LC_VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const VE_LC_FS = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 uv; out vec4 o;
uniform sampler2D img; uniform sampler3D lut;
uniform float useLut, sharp, ang, N;
uniform vec2 px, msz;
vec3 L(vec3 c) { return useLut > 0.5 ? texture(lut, c * ((N - 1.0) / N) + 0.5 / N).rgb : c; }
void main() {
    vec2 t = vec2(uv.x, 1.0 - uv.y);
    vec4 s = texture(img, t);
    vec3 c = L(s.rgb);
    if (sharp > 0.0) {
        float w[5] = float[5](1.0, 4.0, 6.0, 4.0, 1.0), bl = 0.0;
        for (int j = 0; j < 5; j++) for (int i = 0; i < 5; i++) {
            vec3 q = L(texture(img, t + vec2(float(i - 2), float(j - 2)) * px).rgb);
            bl += w[i] * w[j] * dot(q, vec3(0.299, 0.587, 0.114));
        }
        c += sharp * (dot(c, vec3(0.299, 0.587, 0.114)) - bl / 256.0);
    }
    if (ang > 0.0) {
        vec2 d = (t - 0.5) * msz;
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
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, VE_LC_VS));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, VE_LC_FS));
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        gl.useProgram(pr);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pr, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const tex = (unit, target) => {
            const t = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(target, t);
            [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach(w => gl.texParameteri(target, w, gl.CLAMP_TO_EDGE));
            gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, target === gl.TEXTURE_3D ? gl.LINEAR : gl.NEAREST);
            gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, target === gl.TEXTURE_3D ? gl.LINEAR : gl.NEAREST);
            return t;
        };
        const img = tex(0, gl.TEXTURE_2D), lut = tex(1, gl.TEXTURE_3D);
        const u = n => gl.getUniformLocation(pr, n);
        gl.uniform1i(u('img'), 0);
        gl.uniform1i(u('lut'), 1);
        gl.uniform1f(u('N'), VE_LC_N);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);   // linhas da LUT (33 × 6 bytes) não são múltiplas de 4
        VELC.gl = { cv, gl, img, lut, lutKey: null, u: { useLut: u('useLut'), sharp: u('sharp'), ang: u('ang'), px: u('px'), msz: u('msz') } };
    } catch (e) {
        console.warn('[Luz e Cor] WebGL2 indisponível:', e);
        VELC.gl = false;
    }
    return VELC.gl;
}

// draw do efeito (ver VE_FX.lc em editor-fx.js)
function veLcDraw(a, v, env) {
    const G = veLcGL();
    if (!G) return a;
    const { cv, gl } = G, { w, h } = env;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    const cor = !veLcColorNeutral(v);
    if (cor) {
        const L = veLcLut(v);
        if (G.lutKey !== L.key) {
            if (!L.f16) L.f16 = veLcHalf(L.f32);
            gl.activeTexture(gl.TEXTURE1);
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, VE_LC_N, VE_LC_N, VE_LC_N, 0, gl.RGB, gl.HALF_FLOAT, L.f16);
            G.lutKey = L.key;
        }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.cv);
    gl.uniform1f(G.u.useLut, cor ? 1 : 0);
    gl.uniform1f(G.u.sharp, veLcSharpAmt(v));
    gl.uniform1f(G.u.ang, veLcVigAngle(v));
    // vizinhos da nitidez em pixels da MÍDIA (a prévia pode estar reduzida)
    gl.uniform2f(G.u.px, 1 / env.q / w, 1 / env.q / h);
    gl.uniform2f(G.u.msz, env.mw, env.mh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const b = veFxOther(a, w, h);
    b.ctx.clearRect(0, 0, w, h);
    b.ctx.drawImage(cv, 0, 0);
    return b;
}
const veLcSharpAmt = v => v.sharp / 100 * 2.5;             // luma_amount do unsharp
const veLcVigAngle = v => v.vig / 100 * Math.PI / 2;       // angle do vignette

// ── painel ──
function veLcClip() {
    const c = VE.clips[VE.sel];
    return c && !(VE.info && VE.info.audio_only) ? c : null;
}
function veLcFx(c) { return c && c.fx ? c.fx.find(f => f.t === 'lc') : null; }

// Garante o efeito Luz e Cor no clipe selecionado (entra no fim da lista, como no Premiere)
function veLcEnsure() {
    const c = veLcClip();
    if (!c) return null;
    let f = veLcFx(c);
    if (!f) {
        const v = {};
        VE_FX.lc.params.forEach(p => { v[p.k] = p.def; });
        f = { id: veFxNewId(), t: 'lc', on: true, v };
        c.fx = [...(c.fx || []), f];
    }
    return f.id;
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
                <div class="ve-lc-chs">${VE_LC_CURVAS.map(ch => `<button class="ve-lc-ch ch-${ch}" data-la="ch" data-ch="${ch}" title="${ch === 'm' ? 'Curva RGB (todas as cores)' : 'Curva só do ' + { r: 'vermelho', g: 'verde', b: 'azul' }[ch]}">${ch === 'm' ? 'RGB' : ch.toUpperCase()}</button>`).join('')}</div>
                <canvas class="ve-lc-curve" id="ve-lc-curve"></canvas>
                <div class="ve-lc-hint">Clique para criar um ponto e arraste · duplo clique (ou Ctrl+clique) no ponto remove</div>`
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
    const key = VE.sel + '|' + (f ? f.id + (f.on !== false) : '') + '|' + JSON.stringify(v) + VELC.ch;
    if (key === VELC.key) return;
    VELC.key = key;
    $ve('ve-lc-title').innerHTML = `${veNomeClipe(c)} ${VE.sel + 1}<span>${f ? (f.on === false ? 'desligado' : 'Luz e Cor aplicado') : 'sem ajustes'}</span>`;
    const on = $ve('ve-lc-on');
    on.classList.toggle('off', !!f && f.on === false);
    on.disabled = !f;
    pane.classList.toggle('off', !!f && f.on === false);
    pane.querySelectorAll('input[data-lk]').forEach(inp => {
        const p = veLcParam(inp.dataset.lk);
        if (inp.ownerDocument.activeElement !== inp) inp.value = veFxFmt(p, v[p.k]);
        inp.closest('.ve-lc-row').classList.toggle('mod', v[p.k] !== p.def);
    });
    pane.querySelectorAll('[data-sec]').forEach(s => {
        const sec = VE_LC_SECOES.find(x => x.id === s.dataset.sec);
        s.classList.toggle('mod', !veLcSecNeutral(sec, v));
    });
    pane.querySelectorAll('.ve-lc-ch').forEach(b => {
        b.classList.toggle('active', b.dataset.ch === VELC.ch);
        b.classList.toggle('mod', !veLcCurveId(v.cv && v.cv[b.dataset.ch]));
    });
    veLcDrawCurve(v);
}

function veLcDefaults() {
    const v = { cv: {} };
    VE_FX.lc.params.forEach(p => { v[p.k] = p.def; });
    return v;
}
function veLcSecNeutral(sec, v) {
    if (sec.curvas) return VE_LC_CURVAS.every(ch => veLcCurveId(v.cv && v.cv[ch]));
    return sec.grupos.every(g => g.ks.every(k => v[k] === veLcParam(k).def));
}

// Muda o efeito do clipe selecionado (cria se preciso); fn recebe o efeito já copiado
function veLcChange(fn) {
    const id = veLcEnsure();
    if (!id) return;
    veFxEdit(id, x => { fn(x); return x; });
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

// ── curvas ──
function veLcCurvePts(v, ch) {
    const pts = v.cv && v.cv[ch];
    return (pts && pts.length >= 2 ? pts : VE_LC_ID).map(q => q.slice()).sort((a, b) => a[0] - b[0]);
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
    x.strokeStyle = 'rgba(255,255,255,0.07)';
    x.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        x.beginPath(); x.moveTo(P + w * i / 4 + 0.5, P); x.lineTo(P + w * i / 4 + 0.5, P + h); x.stroke();
        x.beginPath(); x.moveTo(P, P + h * i / 4 + 0.5); x.lineTo(P + w, P + h * i / 4 + 0.5); x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,0.12)';
    x.beginPath(); x.moveTo(P, P + h); x.lineTo(P + w, P); x.stroke();
    const cor = { m: '#e5e5e5', r: '#ef4444', g: '#22c55e', b: '#3b82f6' };
    const traca = (ch, alpha, lw) => {
        const T = veLcCurveTable(veLcCurvePts(v, ch));
        x.globalAlpha = alpha;
        x.strokeStyle = cor[ch];
        x.lineWidth = lw;
        x.beginPath();
        for (let i = 0; i <= w; i++) {
            const y = P + h - veLcCurveAt(T, i / w) * h;
            i ? x.lineTo(P + i, y) : x.moveTo(P, y);
        }
        x.stroke();
        x.globalAlpha = 1;
    };
    VE_LC_CURVAS.forEach(ch => { if (ch !== VELC.ch && !veLcCurveId(v.cv && v.cv[ch])) traca(ch, 0.35, 1); });
    traca(VELC.ch, 1, 1.6);
    veLcCurvePts(v, VELC.ch).forEach((q, i) => {
        x.beginPath();
        x.arc(P + q[0] * w, P + h - q[1] * h, 4, 0, Math.PI * 2);
        x.fillStyle = VELC.drag && VELC.drag.i === i ? cor[VELC.ch] : '#0c0c0e';
        x.fill();
        x.strokeStyle = cor[VELC.ch];
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
        const cv = { ...(f.v.cv || {}) };
        if (veLcCurveId(pts)) delete cv[ch]; else cv[ch] = pts.map(q => [+q[0].toFixed(4), +q[1].toFixed(4)]);
        f.v.cv = cv;
    });
}

function veLcCurveInit(cv) {
    const pontos = () => { const f = veLcFx(veLcClip()); return veLcCurvePts(f ? veFxValues(f) : veLcDefaults(), VELC.ch); };
    // remover: Ctrl+clique ou duplo clique no ponto (as pontas voltam para a diagonal)
    const remover = e => {
        const pts = pontos(), i = veLcCurveHit(cv, pts, e);
        if (i < 0) return false;
        vePushHistory();
        if (i === 0) pts[0] = [0, 0]; else if (i === pts.length - 1) pts[i] = [1, 1]; else pts.splice(i, 1);
        veLcSetCurve(VELC.ch, pts);
        veRenderClips();
        veDraw();
        return true;
    };
    cv.addEventListener('dblclick', remover);
    cv.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !veLcClip()) return;
        if (e.ctrlKey) { remover(e); return; }
        const pts = pontos();
        let i = veLcCurveHit(cv, pts, e), hist = false;
        if (i < 0) {
            if (pts.length >= 16) { veToast('Máximo de 16 pontos por curva'); return; }
            const q = veLcCurvePos(cv, e);
            pts.push(q);
            pts.sort((a, b) => a[0] - b[0]);
            i = pts.indexOf(q);
            vePushHistory();
            hist = true;
            veLcSetCurve(VELC.ch, pts);
        }
        VELC.drag = { i, pts, hist };
        cv.setPointerCapture(e.pointerId);
        VELC.key = '';
        veLcRender();
    });
    cv.addEventListener('pointermove', e => {
        const d = VELC.drag;
        if (!d) return;
        if (!d.hist) { vePushHistory(); d.hist = true; }   // o desfazer só entra quando o ponto anda
        const q = veLcCurvePos(cv, e), n = d.pts.length;
        const lo = d.i ? d.pts[d.i - 1][0] + 0.01 : 0, hi = d.i < n - 1 ? d.pts[d.i + 1][0] - 0.01 : 1;
        d.pts[d.i] = [Math.min(hi, Math.max(lo, q[0])), q[1]];
        veLcSetCurve(VELC.ch, d.pts);
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
    const c = veLcClip(), f = veLcFx(c);
    if (!f) return;
    vePushHistory();
    if (a === 'on') {
        veFxEdit(f.id, x => ({ ...x, on: x.on === false }));
    } else if (a === 'reset') {
        veFxEdit(f.id, x => { x.v = veLcDefaults(); return x; });
    } else if (a === 'resetsec') {
        const sec = VE_LC_SECOES.find(x => x.id === el.closest('[data-sec]').dataset.sec);
        veFxEdit(f.id, x => {
            if (sec.curvas) x.v.cv = {};
            else sec.grupos.forEach(g => g.ks.forEach(k => { x.v[k] = veLcParam(k).def; }));
            return x;
        });
    }
    veRefresh();
}

function veLcInit() {
    const pane = $ve('ve-lc');
    if (!pane) return;
    veLcBuild();
    veLcCurveInit($ve('ve-lc-curve'));
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
