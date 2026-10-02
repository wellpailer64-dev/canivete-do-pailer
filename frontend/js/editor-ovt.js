// =========================================================
// Pocket Editor — transições de sobreposição (estilo Mister Horse / Motion Bro)
// Uma camada de ajuste por cima do corte com um efeito que muda com o tempo: até o corte deforma/ilumina o clipe
// que sai, depois dele o que entra; o pico (zoom máximo, giro mais rápido, flash) cai no corte e o esconde.
// Ficam em c.fx da camada de ajuste como efeitos marcados `ovt` (Controles de efeito mostra os parâmetros).
//
// Como cada quadro é feito (a mesma conta em Functions/transicoes.py, que a exportação usa):
//   1. veOvtParams: no instante u (0..1 da camada) e com o corte em uc, K amostras de "obturador" (instantes
//      vizinhos) — cada uma é uma matriz 2×2 + deslocamento + redemoinho + lente; mais os globais (ondulação,
//      pixel, aberração cromática, glitch, flash, flare, vazamento de luz). Coordenadas em unidades da meia diagonal.
//   2. o shader: para cada pixel, os K pontos de origem com borda espelhada (o "Mirror Edges" dos packs), média =
//      desfoque de movimento de verdade (zoom vira desfoque radial, giro vira rotacional, pan vira direcional);
//      depois a luz em modo Tela.
// Curvas: o corte fica em 0,5 do tempo da transição; zoom/giro/pan usam uma curva só que passa pelo corte (o lado
// que entra continua o movimento do que sai — no zoom a escala é contínua em log), easeInOutQuint: lento nas pontas,
// rapidíssimo no corte.
// Exportação: veOvtProntas renderiza (Python) o trecho de cada camada a partir das trilhas de baixo; o plano troca a
// camada pelo vídeo pronto (veOvtNoPlano).
// =========================================================

const VE_OVT_NB = 24, VE_OVT_KMAX = 16, VE_OVT_OURO = 2.399963229728653;
const VE_OVT_RND = (() => { let x = 12345; const o = []; for (let i = 0; i < 64; i++) { x = (x * 16807) % 2147483647; o.push(x / 2147483647); } return o; })();
const veOvtMod = (i, n) => ((i % n) + n) % n;
const veOvtCl = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const veOvtEq = x => { x = veOvtCl(x); return x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2; };
const veOvtEc = x => { x = veOvtCl(x); return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; };
const veOvtPico = x => { x = veOvtCl(x); return Math.sin(Math.PI * x) ** 2; };
const veOvtPicoFlash = x => { x = veOvtCl(x); return (1 - Math.abs(2 * x - 1)) ** 3; };
function veOvtRuido(x, canal) {
    const i = Math.floor(x);
    let f = x - i;
    f = f * f * (3 - 2 * f);
    const a = VE_OVT_RND[veOvtMod(i + canal * 17, 64)], b = VE_OVT_RND[veOvtMod(i + 1 + canal * 17, 64)];
    return (a + (b - a) * f) * 2 - 1;
}
const veOvtHex = (s, padrao) => {
    s = /^#[0-9a-f]{6}$/i.test(s || '') ? s : padrao;
    return [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
};

const veOvtMb = def => ({ k: 'mb', nome: 'Desfoque de movimento', min: 0, max: 100, step: 1, def, un: '%' });
const VE_OVT_MB = { zoomin: 70, zoomout: 70, spin: 70, panblur: 80, stretch: 60, twirl: 50, lens: 40, shake: 60 };
const VE_OVT = {
    zoomin: { nome: 'Zoom para dentro', tag: 'Zoom In', params: [{ k: 'amt', nome: 'Zoom', min: 110, max: 1000, step: 5, def: 300, un: '%' }, veOvtMb(70)] },
    zoomout: { nome: 'Zoom para fora', tag: 'Zoom Out', params: [{ k: 'amt', nome: 'Zoom', min: 110, max: 1000, step: 5, def: 300, un: '%' }, veOvtMb(70)] },
    spin: { nome: 'Giro', tag: 'Spin', params: [{ k: 'ang', nome: 'Giro', min: -1080, max: 1080, step: 5, def: 360, un: '°' }, { k: 'zoom', nome: 'Zoom no corte', min: 0, max: 100, step: 1, def: 20, un: '%' }, veOvtMb(70)] },
    panblur: { nome: 'Pan com desfoque', tag: 'Slide Blur', params: [{ k: 'ang', nome: 'Direção', min: 0, max: 360, step: 5, def: 0, un: '°' }, veOvtMb(80)] },
    stretch: { nome: 'Esticar', tag: 'Stretch', params: [{ k: 'amt', nome: 'Esticar', min: 110, max: 1000, step: 5, def: 400, un: '%' }, { k: 'ang', nome: 'Direção', min: 0, max: 180, step: 5, def: 0, un: '°' }, veOvtMb(60)] },
    twirl: { nome: 'Redemoinho', tag: 'Twirl', params: [{ k: 'amt', nome: 'Giro', min: -1080, max: 1080, step: 5, def: 270, un: '°' }, { k: 'zoom', nome: 'Zoom no corte', min: 0, max: 100, step: 1, def: 15, un: '%' }, veOvtMb(50)] },
    lens: { nome: 'Distorção de lente', tag: 'Lens Distortion', params: [{ k: 'amt', nome: 'Distorção', min: 0, max: 100, step: 1, def: 60, un: '%' }, { k: 'ca', nome: 'Aberração cromática', min: 0, max: 100, step: 1, def: 30, un: '%' }, veOvtMb(40)] },
    ripple: { nome: 'Ondulação', tag: 'Ripple', params: [{ k: 'amt', nome: 'Amplitude', min: 0, max: 100, step: 1, def: 50, un: '%' }, { k: 'freq', nome: 'Ondas', min: 1, max: 20, step: 0.5, def: 6, un: '' }] },
    glitch: { nome: 'Glitch', tag: 'Glitch RGB', params: [{ k: 'amt', nome: 'Intensidade', min: 0, max: 100, step: 1, def: 70, un: '%' }, { k: 'ca', nome: 'Separação RGB', min: 0, max: 100, step: 1, def: 50, un: '%' }] },
    pixel: { nome: 'Pixelar', tag: 'Pixelate', params: [{ k: 'amt', nome: 'Tamanho', min: 0, max: 100, step: 1, def: 50, un: '%' }] },
    shake: { nome: 'Tremor', tag: 'Shake', params: [{ k: 'amt', nome: 'Força', min: 0, max: 100, step: 1, def: 60, un: '%' }, veOvtMb(60)] },
    blurx: { nome: 'Desfoque', tag: 'Blur', params: [{ k: 'amt', nome: 'Desfoque', min: 0, max: 100, step: 1, def: 60, un: '%' }] },
    flash: { nome: 'Flash', tag: 'Flash', params: [{ k: 'amt', nome: 'Intensidade', min: 0, max: 100, step: 1, def: 100, un: '%' }, { k: 'cor', nome: 'Cor', tipo: 'cor', def: '#ffffff', gotas: false }] },
    flare: { nome: 'Lens flare', tag: 'Lens Flare', params: [{ k: 'amt', nome: 'Brilho', min: 0, max: 200, step: 1, def: 100, un: '%' }, { k: 'ang', nome: 'Direção', min: 0, max: 360, step: 5, def: 0, un: '°' }, { k: 'cor', nome: 'Cor', tipo: 'cor', def: '#ffb060', gotas: false }] },
    leak: { nome: 'Vazamento de luz', tag: 'Light Leak', params: [{ k: 'amt', nome: 'Brilho', min: 0, max: 200, step: 1, def: 100, un: '%' }, { k: 'cor', nome: 'Cor 1', tipo: 'cor', def: '#ff6a20', gotas: false }, { k: 'cor2', nome: 'Cor 2', tipo: 'cor', def: '#ffc860', gotas: false }] },
};
// entram no VE_FX (Controles de efeito, veFxValues); a prévia não passa pelo draw deles (veOvtAplicar)
Object.entries(VE_OVT).forEach(([t, d]) => {
    VE_FX[t] = { nome: d.nome, cat: 'Transição de sobreposição', tag: d.tag, params: d.params, ovt: true, neutro: () => false, draw: a => a };
});
const veOvtFx = c => ((c && c.fx) || []).filter(f => f.on !== false && VE_OVT[f.t]);
const veOvtNome = c => { const f = veIsAdj(c) && veOvtFx(c)[0]; return f ? veT(VE_OVT[f.t].nome) : ''; };

// Parâmetros do núcleo no instante u (0..1 da camada), corte em uc — igual a parametros() de transicoes.py
function veOvtParams(t, v, u, uc, dur, fps, W, H) {
    uc = veOvtCl(uc, 0.02, 0.98);
    dur = Math.max(dur, 1e-3); fps = Math.max(fps, 1);
    const ladoB = u >= uc - 0.25 / (fps * dur);
    const tau = x => { x = veOvtCl(x); return x < uc ? 0.5 * x / uc : 0.5 + 0.5 * (x - uc) / (1 - uc); };
    const T = tau(u), S = 0.5 * Math.hypot(W, H);
    const num = (k, lo, hi, padrao) => { const x = v && Number.isFinite(+v[k]) ? +v[k] : padrao; return Math.max(lo, Math.min(hi, x)); };
    const p = { K: 1, M: [], W: [], g1: [0, 0, 0, 0], g2: [0, 0, 0, 0], flashC: [1, 1, 1], fl: [0, 0, 0, 0], flC: [1, 1, 1],
                lk: [0, 0, 0, 0, 0, 0], lkC1: [1, 1, 1], lkC2: [1, 1, 1], gb: new Array(VE_OVT_NB).fill(0), gl: 0 };
    const mb = num('mb', 0, 100, VE_OVT_MB[t] || 0);
    let K = VE_OVT_MB[t] != null && mb > 0.5 ? 12 : 1;
    const span = mb / 100 * 2 / (fps * dur);
    const tks = K === 1 ? [T] : Array.from({ length: K }, (_, k) => tau(u + (k / (K - 1) - 0.5) * span));
    const M = [], Wv = [], iso = z => [1 / z, 0, 0, 1 / z], rad = g => g * Math.PI / 180;
    if (t === 'zoomin' || t === 'zoomout') {
        const L = Math.log(num('amt', 110, 1000, 300) / 100), sg = t === 'zoomin' ? 1 : -1;
        tks.forEach(tk => { M.push(iso(Math.exp(sg * (2 * L * veOvtEq(tk) - (ladoB ? 2 * L : 0))))); Wv.push([0, 0, 0, 0]); });
    } else if (t === 'spin') {
        const ang = rad(num('ang', -1080, 1080, 360)), zm = num('zoom', 0, 100, 20) / 100;
        tks.forEach(tk => {
            const th = ang * veOvtEq(tk) - (ladoB ? ang : 0), z = 1 + zm * Math.sin(Math.PI * veOvtCl(tk));
            const c = Math.cos(th) / z, s = Math.sin(th) / z;
            M.push([c, s, -s, c]); Wv.push([0, 0, 0, 0]);
        });
    } else if (t === 'panblur') {
        const a = rad(num('ang', 0, 360, 0)), dx = Math.cos(a), dy = Math.sin(a), D = (W * Math.abs(dx) + H * Math.abs(dy)) / S;
        tks.forEach(tk => { const o = D * veOvtEq(tk) - (ladoB ? D : 0); M.push([1, 0, 0, 1]); Wv.push([-o * dx, -o * dy, 0, 0]); });
    } else if (t === 'stretch') {
        const L = Math.log(num('amt', 110, 1000, 400) / 100), a = rad(num('ang', 0, 180, 0)), c = Math.cos(a), s = Math.sin(a);
        tks.forEach(tk => {
            const k = Math.exp(-(2 * L * veOvtEc(tk) - (ladoB ? 2 * L : 0)));
            M.push([k * c * c + s * s, (k - 1) * c * s, (k - 1) * c * s, k * s * s + c * c]); Wv.push([0, 0, 0, 0]);
        });
    } else if (t === 'twirl') {
        const A = rad(num('amt', -1080, 1080, 270)), zm = num('zoom', 0, 100, 15) / 100;
        tks.forEach(tk => { M.push(iso(1 + zm * Math.sin(Math.PI * veOvtCl(tk)))); Wv.push([0, 0, 2 * A * veOvtEc(tk) - (ladoB ? 2 * A : 0), 0]); });
    } else if (t === 'lens') {
        const a = num('amt', 0, 100, 60) / 100;
        tks.forEach(tk => { const P = veOvtPico(tk); M.push(iso(1 + 0.3 * a * P)); Wv.push([0, 0, 0, 1.5 * a * P]); });
        p.g2[0] = num('ca', 0, 100, 30) / 100 * 0.04 * veOvtPico(T);
    } else if (t === 'shake') {
        const a = num('amt', 0, 100, 60) / 100;
        tks.forEach(tk => {
            const P = veOvtPico(tk), x = tk * dur * 12, r = veOvtRuido(x, 2) * 0.06 * a * P, z = 1 + 0.08 * a * P;
            M.push([Math.cos(r) / z, Math.sin(r) / z, -Math.sin(r) / z, Math.cos(r) / z]);
            Wv.push([veOvtRuido(x, 0) * 0.05 * a * P, veOvtRuido(x, 1) * 0.05 * a * P, 0, 0]);
        });
    } else if (t === 'blurx') {
        const R = 0.05 * num('amt', 0, 100, 60) / 100 * veOvtPico(T);
        if (R > 1e-4) {
            K = 16;
            for (let k = 0; k < K; k++) {
                const q = R * Math.sqrt((k + 0.5) / K);
                M.push([1, 0, 0, 1]); Wv.push([q * Math.cos(k * VE_OVT_OURO), q * Math.sin(k * VE_OVT_OURO), 0, 0]);
            }
        }
    }
    if (!M.length) { K = 1; M.push([1, 0, 0, 1]); Wv.push([0, 0, 0, 0]); }
    if (t === 'ripple') {
        const a = num('amt', 0, 100, 50) / 100;
        p.g1[0] = 0.06 * a * veOvtPico(T); p.g1[1] = num('freq', 1, 20, 6); p.g1[2] = T * 3;
    } else if (t === 'glitch') {
        const gl = num('amt', 0, 100, 70) / 100 * veOvtPico(T), seed = Math.floor(T * dur * 15), R = VE_OVT_RND;
        for (let b = 0; b < VE_OVT_NB; b++) {
            const r1 = R[veOvtMod(b * 7 + seed, 64)], r2 = R[veOvtMod(b * 13 + seed * 3 + 5, 64)];
            p.gb[b] = r2 < 0.35 + 0.4 * gl ? (r1 - 0.5) * 2 * 0.15 * gl : 0;
        }
        p.gl = gl > 1e-4 ? 1 : 0;
        Wv[0] = [(R[veOvtMod(seed * 5 + 1, 64)] - 0.5) * 0.06 * gl, (R[veOvtMod(seed * 11 + 2, 64)] - 0.5) * 0.03 * gl, 0, 0];
        p.g2[0] = num('ca', 0, 100, 50) / 100 * 0.03 * gl;
    } else if (t === 'pixel') {
        const b = 0.15 * num('amt', 0, 100, 50) / 100 * veOvtPico(T);
        p.g1[3] = b >= 0.004 ? b : 0;
    } else if (t === 'flash') {
        p.g2[1] = num('amt', 0, 100, 100) / 100 * veOvtPicoFlash(T);
        p.flashC = veOvtHex(v && v.cor, '#ffffff');
    } else if (t === 'flare') {
        const a = num('amt', 0, 200, 100) / 100, ang = rad(num('ang', 0, 360, 0)), pos = (-1.1 + 2.2 * T) * 0.9;
        p.g2[2] = a * (0.25 + 0.75 * veOvtPico(T)) * Math.min(1, Math.sin(Math.PI * T) * 3);
        p.fl = [Math.cos(ang) * pos, Math.sin(ang) * pos, a * veOvtPicoFlash(T) * 0.85, 0];
        p.flC = veOvtHex(v && v.cor, '#ffb060');
    } else if (t === 'leak') {
        const a = num('amt', 0, 200, 100) / 100;
        p.g2[3] = a * Math.sin(Math.PI * T) ** 1.5 * 0.8;
        p.lk = [-0.9 + 1.6 * T, -0.25, 0.85 - 1.5 * T, 0.3, -0.7 + 0.9 * T, 0.35 * veOvtPicoFlash(T) * a];
        p.lkC1 = veOvtHex(v && v.cor, '#ff6a20');
        p.lkC2 = veOvtHex(v && v.cor2, '#ffc860');
    }
    p.K = K; p.M = M; p.W = Wv;
    return p;
}

// ── núcleo (WebGL) ──
const VE_OVT_FS = `precision highp float;
uniform sampler2D uT; uniform vec2 uRes; uniform float uS; uniform int uK;
uniform vec4 uM[16]; uniform vec4 uW[16]; uniform vec4 uG1; uniform vec4 uG2;
uniform vec3 uFlashC; uniform vec4 uFl; uniform vec3 uFlC;
uniform vec4 uLk1; uniform vec2 uLk2; uniform vec3 uLkC1; uniform vec3 uLkC2;
uniform float uGb[24]; uniform float uGl;
vec2 mir(vec2 p) { vec2 t = mod(p, 2.0 * uRes); return min(t, 2.0 * uRes - t); }
vec3 amostra(vec2 n) { return texture2D(uT, mir(0.5 * uRes + n * uS) / uRes).rgb; }
float disco(vec2 n, vec2 c, float r) { return 1.0 - smoothstep(r * 0.7, r, length(n - c)); }
vec3 flare(vec2 n) {
    vec2 L = uFl.xy, d = n - L; float d2 = dot(d, d), q = (sqrt(d2) - 0.3) / 0.02;
    float br = exp(-d2 / 0.004) + exp(-d2 / 0.06) * 0.45 + exp(-d2 / 0.5) * 0.15 + exp(-q * q) * 0.12;
    float rs = exp(-(d.y * d.y) / 0.00012) * exp(-abs(d.x) / 0.7) * 0.7;
    float fa = disco(n, L * -0.35, 0.05) * 0.22 + disco(n, L * -0.7, 0.1) * 0.14 + disco(n, L * 0.45, 0.035) * 0.25 + disco(n, L * -1.15, 0.16) * 0.10;
    float I = uG2.z;
    return uFlC * br * I + vec3(0.7, 0.82, 1.0) * rs * I + vec3(0.55, 0.85, 1.0) * fa * I + uFlC * uFl.z;
}
vec3 leak(vec2 n) {
    vec2 a = n - uLk1.xy, b = n - uLk1.zw, c = n - vec2(0.15, uLk2.x);
    return (uLkC1 * exp(-dot(a, a) / 0.36) + uLkC2 * exp(-dot(b, b) / 0.25) + (uLkC1 + uLkC2) * 0.5 * exp(-dot(c, c) / 0.2025)) * uG2.w + uLkC2 * uLk2.y;
}
void main() {
    vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    vec2 n0 = (p - 0.5 * uRes) / uS, q = p;
    if (uG1.w > 0.0) { float B = uG1.w * uS; q = (floor(q / B) + 0.5) * B; }
    vec2 n = (q - 0.5 * uRes) / uS;
    if (uGl > 0.5) {
        float fb = clamp(floor(q.y / uRes.y * 24.0), 0.0, 23.0);
        for (int j = 0; j < 24; j++) if (float(j) == fb) n.x += uGb[j];
    }
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 16; k++) {
        if (k >= uK) break;
        vec4 m = uM[k], w = uW[k];
        vec2 P = vec2(m.x * n.x + m.y * n.y + w.x, m.z * n.x + m.w * n.y + w.y);
        if (w.w != 0.0) P *= 1.0 + w.w * dot(P, P);
        if (w.z != 0.0) { float r = clamp(1.0 - length(P), 0.0, 1.0), ph = w.z * r * r, c = cos(ph), s = sin(ph); P = vec2(P.x * c - P.y * s, P.x * s + P.y * c); }
        if (uG1.x != 0.0) { float r = length(P); P += P * (uG1.x * sin(6.283185307 * (r * uG1.y - uG1.z)) / max(r, 1e-6)); }
        if (uG2.x > 0.0) acc += vec3(amostra(P * (1.0 + uG2.x)).r, amostra(P).g, amostra(P * (1.0 - uG2.x)).b);
        else acc += amostra(P);
    }
    vec3 c = acc / float(uK);
    if (uG2.y > 0.0) c = 1.0 - (1.0 - c) * (1.0 - uG2.y * uFlashC);
    if (uG2.z > 0.0 || uFl.z > 0.0) c = 1.0 - (1.0 - c) * (1.0 - clamp(flare(n0), 0.0, 1.0));
    if (uG2.w > 0.0 || uLk2.y > 0.0) c = 1.0 - (1.0 - c) * (1.0 - clamp(leak(n0), 0.0, 1.0));
    gl_FragColor = vec4(c, 1.0);
}`;

const VEOVT = { cv: null, gl: null, u: null, falhou: false, arq: new Map() };
function veOvtGl() {
    if (VEOVT.gl || VEOVT.falhou) return VEOVT.gl;
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) { VEOVT.falhou = true; return null; }
    const sh = (tipo, src) => {
        const s = gl.createShader(tipo);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[ovt] shader:', gl.getShaderInfoLog(s));
        return s;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, VE_OVT_FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('[ovt] link:', gl.getProgramInfoLog(pr)); VEOVT.falhou = true; return null; }
    gl.useProgram(pr);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const lp = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 8, 0);
    VEOVT.u = {};
    ['uT', 'uRes', 'uS', 'uK', 'uM', 'uW', 'uG1', 'uG2', 'uFlashC', 'uFl', 'uFlC', 'uLk1', 'uLk2', 'uLkC1', 'uLkC2', 'uGb', 'uGl']
        .forEach(n => { VEOVT.u[n] = gl.getUniformLocation(pr, n); });
    VEOVT.cv = cv;
    VEOVT.gl = gl;
    return gl;
}

// Roda o núcleo sobre src (canvas/vídeo do tamanho do quadro). Devolve o canvas WebGL (ou null sem WebGL)
function veOvtKernel(src, prm, w = src.width, h = src.height) {
    const gl = veOvtGl();
    if (!gl || !w || !h) return null;
    const cv = VEOVT.cv, U = VEOVT.u;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { return null; }
    const K = Math.max(1, Math.min(VE_OVT_KMAX, prm.K)), M = new Float32Array(64), Wf = new Float32Array(64);
    for (let k = 0; k < K; k++) { M.set(prm.M[k], k * 4); Wf.set(prm.W[k], k * 4); }
    gl.uniform1i(U.uT, 0);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uS, 0.5 * Math.hypot(w, h));
    gl.uniform1i(U.uK, K);
    gl.uniform4fv(U.uM, M);
    gl.uniform4fv(U.uW, Wf);
    gl.uniform4fv(U.uG1, prm.g1);
    gl.uniform4fv(U.uG2, prm.g2);
    gl.uniform3fv(U.uFlashC, prm.flashC);
    gl.uniform4fv(U.uFl, prm.fl);
    gl.uniform3fv(U.uFlC, prm.flC);
    gl.uniform4fv(U.uLk1, prm.lk.slice(0, 4));
    gl.uniform2fv(U.uLk2, prm.lk.slice(4, 6));
    gl.uniform3fv(U.uLkC1, prm.lkC1);
    gl.uniform3fv(U.uLkC2, prm.lkC2);
    gl.uniform1fv(U.uGb, new Float32Array(prm.gb));
    gl.uniform1f(U.uGl, prm.gl);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return cv;
}

// Onde fica o corte dentro da camada (0..1): a borda de clipe das trilhas de baixo mais perto do meio
function veOvtCorte(c, clips = VE.clips) {
    const a = c.st, b = veEnd(c), meio = (a + b) / 2;
    let melhor = null;
    clips.forEach(o => {
        if (o === c || o.tr >= c.tr || veIsAudio(o) || veOculto(o) || veIsAdj(o)) return;
        [o.st, veEnd(o)].forEach(t => {
            if (t > a + VE_EPS && t < b - VE_EPS && (melhor == null || Math.abs(t - meio) < Math.abs(melhor - meio))) melhor = t;
        });
    });
    return melhor == null ? 0.5 : (melhor - a) / (b - a);
}

// Prévia: as transições da camada sobre o quadro já composto (cv = canvas do monitor). Devolve o que desenhar.
function veOvtAplicar(c, cv, T) {
    const lista = veOvtFx(c), len = veLen(c);
    if (!lista.length || len <= 0) return cv;
    const u = (T - c.st) / len, uc = veOvtCorte(c), fps = VE.fps || 30;
    let src = cv;
    lista.forEach((f, i) => {
        if (i > 0) {   // a próxima lê o resultado da anterior: copia para fora do canvas WebGL
            const p = veFxCanvas(3, cv.width, cv.height);
            p.ctx.drawImage(src, 0, 0);
            src = p.cv;
        }
        src = veOvtKernel(src, veOvtParams(f.t, veFxValues(f), u, uc, len, fps, VE.seqW, VE.seqH), cv.width, cv.height) || src;
    });
    return src;
}

// ── inserir na timeline ──
const VE_OVT_DUR = { fast: 0.5, medium: 0.8, slow: 1.2 };
const veOvtDur = () => VE_OVT_DUR[(typeof veTrCfgBase === 'function' && veTrCfgBase().speed) || 'fast'] || 0.5;

// Cortes (bordas de clipes de imagem) perto de t
function veOvtCorteMaisPerto(t) {
    let melhor = null;
    VE.clips.forEach(o => {
        if (veIsAudio(o) || veOculto(o) || veIsAdj(o)) return;
        [o.st, veEnd(o)].forEach(x => { if (x > VE_EPS && (melhor == null || Math.abs(x - t) < Math.abs(melhor - t))) melhor = x; });
    });
    return melhor;
}

// Põe a transição `t` centrada no corte (segundos). opts: {d: duração, tr: trilha, v: parâmetros}. Devolve o clipe.
function veOvtAdd(t, corte, opts = {}) {
    if (!VE_OVT[t] || !VE.ready) return null;
    if (VE.info && VE.info.audio_only) { veToast('Transição de sobreposição precisa de um vídeo'); return null; }
    const d = Math.max(veFrame() * 2, +opts.d || veOvtDur());
    const st = Math.max(0, veSnapFrame(corte - d / 2)), b = Math.max(st + veFrame(), veSnapFrame(corte + d / 2));
    // logo acima da imagem mais alta no corte (textos/gráficos acima dela continuam por cima, se houver trilha livre)
    let tr = opts.tr;
    if (tr == null) {
        const midia = VE.clips.filter(o => !veIsAudio(o) && !veIsAdj(o) && !veIsTexto(o) && !(typeof veEhGrafico === 'function' && veEhGrafico(o))
            && o.st < b - VE_EPS && veEnd(o) > st + VE_EPS);
        const topo = midia.length ? Math.max(...midia.map(o => o.tr)) : 0;
        tr = veTrackIndexes().find(k => k > topo && !veTrkLocked(k) && veTrackFree(k, st, b));
        if (tr == null) tr = Math.max(topo + 1, veTrackCount());
    }
    veEnsureTrackIndex(tr);
    if (veTrkLocked(tr)) { veAvisoBloqueio(); return null; }
    let m = VE.media.find(x => x.kind === 'ajuste');
    vePushHistory();
    if (!m) { m = { id: VE.media.length, kind: 'ajuste', name: 'Camada de ajuste' }; VE.media.push(m); }
    const clip = { tr, st, s: 0, e: b - st, m: m.id, fx: [{ id: veFxNewId(), t, on: true, v: Object.assign({}, opts.v || {}) }] };
    clip.p = veDefProps(clip);
    VE.clips = veCarve(VE.clips, tr, st, b, -1, clip);
    VE.clips.push(clip);
    veRelayout();
    VE.sel = VE.clips.indexOf(clip);
    veAfterEdit(VE.playhead);
    if (!opts.quieto) veToast(`${veT(VE_OVT[t].nome)} (${veShort(b - st)}) em V${tr + 1}`);
    return clip;
}

// ── exportação: o trecho de cada camada renderizado a partir das trilhas de baixo ──
async function veOvtJob(c) {
    const a = c.st, b = veEnd(c), abaixo = VE.clips.filter(o => o !== c && o.tr < c.tr);
    const noTrecho = o => o.st < b && veEnd(o) > a;
    const mapa = abaixo.some(o => (veIsTexto(o) || veEhGrafico(o)) && noTrecho(o)) ? await veTxPngs(noTrecho, abaixo, false) : new Map();
    const orig = VE.clips, ant = VE._txPng;
    VE.clips = abaixo;
    VE._txPng = mapa;
    try {
        const plano = veExportPlan(false, { a, b });
        return { path: VE.path, base: plano.base, camadas: plano.camadas, dur: b - a, quadro: [VE.seqW, VE.seqH],
                 fx: veOvtFx(c).map(f => ({ t: f.t, v: veFxValues(f) })), uc: veOvtCorte(c, orig) };
    } finally { VE.clips = orig; VE._txPng = ant; }
}

// Assinatura do que a camada usa: ela + os clipes de baixo no trecho dela (+ as mídias). O arquivo pronto fica em
// VEOVT.arq (assinatura → caminho) e não é zerado: a prévia renderizada e a exportação chamam veOvtProntas ao mesmo
// tempo, e uma não pode apagar o que a outra preparou.
const veOvtLimpo = c => { const o = {}; for (const k in c) if (k[0] !== '_') o[k] = c[k]; return o; };
function veOvtSig(c) {
    const o = c._o || c, a = o.st, b = veEnd(o);
    const abaixo = VE.clips.filter(x => x !== o && x.tr < o.tr && x.st < b && veEnd(x) > a)
        .map(x => { const m = VE.media[x.m || 0]; return [veOvtLimpo(x), m ? [m.kind, m.path || '', m.fill || ''] : null]; });
    return vePrHash(JSON.stringify([1, veOvtLimpo(o), abaixo, VE.seqW, VE.seqH, VE.fps, VE.path || '']));
}

// Assinaturas das camadas com sobreposição, com os clipes reais (veExportPlan chama antes de trocar VE.clips)
function veOvtSigs() {
    return new Map(VE.clips.filter(c => veIsAdj(c) && veOvtFx(c).length).map(c => [c, veOvtSig(c)]));
}

// Renderiza (ou reaproveita) as camadas de sobreposição no trecho `faixa` ({a, b}; null = tudo). msg(texto) = progresso
async function veOvtProntas(faixa, msg) {
    const api = window.pywebview && window.pywebview.api;
    const lista = VE.clips.filter(c => veIsAdj(c) && !veOculto(c) && veOvtFx(c).length && (!faixa || (c.st < faixa.b && veEnd(c) > faixa.a)))
        .sort((x, y) => x.tr - y.tr || x.st - y.st);   // de baixo para cima: a de cima usa as de baixo já prontas
    if (!lista.length || !api || !api.ve_ovt_render) return;
    for (let i = 0; i < lista.length; i++) {
        const c = lista[i], sig = veOvtSig(c);
        if (VEOVT.arq.has(sig)) continue;
        if (msg) msg(`${veT('Transições de sobreposição')} ${i + 1}/${lista.length}...`);
        try {
            const job = await veOvtJob(c);
            const r = await api.ve_ovt_render(vePrPrefs().dir, 'ovt.' + vePrHash(JSON.stringify([3, job])), job);
            if (r && r.success) VEOVT.arq.set(sig, r.path);
            else if (!(r && r.cancelled)) veToast(`${veT('Falha na transição')} ${veOvtNome(c)}: ${(r && r.error) || ''}`);
        } catch (e) {
            veToast(`${veT('Falha na transição')} ${veOvtNome(c)}: ${(e && e.message) || e}`);
        }
    }
}

// Plano de exportação (veExportPlanClips): a camada vira o vídeo pronto do trecho (com os outros efeitos dela)
function veOvtNoPlano(c, o) {
    const sig = VEOVT.sigs && VEOVT.sigs.get(c._o || c), arq = sig && veIsAdj(c) && veOvtFx(c).length && VEOVT.arq.get(sig);
    if (!arq) return o;
    const off = Math.max(0, (c.s || 0) - ((c._o || c).s || 0));
    return Object.assign(o, { tipo: 'video', path: arq, s: off, e: off + veLen(c), sc: 100, x: VE.seqW / 2, y: VE.seqH / 2, rot: 0,
                              mw: VE.seqW, mh: VE.seqH, v: 1, ox: 0, oy: 0, kf: o.kf && o.kf.op ? { op: o.kf.op } : {} });
}

// ── painel Animação → Sobreposição: cartões com o exemplo animado ──
const VEOVTP = { anim: new Map(), A: null, B: null };
function veOvtDemo(u) {
    // dois "clipes" do exemplo: fundo com degradê + o logo (o mesmo das transições comuns)
    const W = VE_TRV_W, H = VE_TRV_H;
    if (!VEOVTP.A && VETRV.B && VETRV.B !== 'carregando') {
        const faz = (logo, c1, c2) => {
            const cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            const x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, W, H);
            g.addColorStop(0, c1); g.addColorStop(1, c2);
            x.fillStyle = g; x.fillRect(0, 0, W, H);
            x.drawImage(logo, 0, 0, W, H);
            return cv;
        };
        VEOVTP.A = faz(VETRV.A, '#24364d', '#0b0f17');
        VEOVTP.B = faz(VETRV.B, '#5a2a12', '#140a08');
    }
    return VEOVTP.A ? (u < 0.5 ? VEOVTP.A : VEOVTP.B) : null;
}
function veOvtCardDesenhar(cv, t, u) {
    const x = cv.getContext('2d');
    const src = veOvtDemo(u);
    if (!src) { x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, cv.width, cv.height); return; }
    const v = {};
    VE_OVT[t].params.forEach(p => { v[p.k] = p.def; });
    const r = veOvtKernel(src, veOvtParams(t, v, u, 0.5, 0.8, 30, cv.width, cv.height));
    x.drawImage(r || src, 0, 0, cv.width, cv.height);
}
function veOvtRender() {
    const box = $ve('ve-ovt-list');
    if (!box) return;
    const q = veCaNorm((($ve('ve-tr-q') || {}).value || '').trim());
    [...VEOVTP.anim.keys()].forEach(veOvtParar);
    const lista = Object.keys(VE_OVT).filter(t => !q || veCaNorm(veT(VE_OVT[t].nome) + ' ' + VE_OVT[t].nome + ' ' + VE_OVT[t].tag + ' sobreposicao overlay').includes(q));
    box.innerHTML = lista.map(t => `<div class="ve-tr-card" data-ovt="${t}" title="${veT('Arraste até o corte entre dois clipes · duplo clique põe no corte mais perto da agulha · ajustes no Controles de efeito da camada')}">
        <canvas width="${VE_TRV_W}" height="${VE_TRV_H}"></canvas><span>${veT(VE_OVT[t].nome)}</span><small>${VE_OVT[t].tag}</small></div>`).join('');
    const sec = $ve('ve-ovt-sec');
    if (sec) sec.hidden = !lista.length;
    box.querySelectorAll('[data-ovt]').forEach(el => veOvtCardDesenhar(el.querySelector('canvas'), el.dataset.ovt, 0.42));
}
function veOvtAnimar(el) {
    if (VEOVTP.anim.has(el)) return;
    const win = el.ownerDocument.defaultView, cv = el.querySelector('canvas'), t0 = performance.now();
    const passo = () => {
        if (!VEOVTP.anim.has(el)) return;
        const c = ((performance.now() - t0) / 1000) % 2.2;
        veOvtCardDesenhar(cv, el.dataset.ovt, Math.min(1, Math.max(0, (c - 0.5) / 1.2)));
        VEOVTP.anim.set(el, win.requestAnimationFrame(passo));
    };
    VEOVTP.anim.set(el, win.requestAnimationFrame(passo));
}
function veOvtParar(el) {
    const id = VEOVTP.anim.get(el);
    if (id == null) return;
    el.ownerDocument.defaultView.cancelAnimationFrame(id);
    VEOVTP.anim.delete(el);
    veOvtCardDesenhar(el.querySelector('canvas'), el.dataset.ovt, 0.42);
}

// Corte sob o ponteiro (evento do painel; a timeline pode estar em outra janela): a borda do clipe mais perto
function veOvtAlvoEvento(ev, doc) {
    const alvo = veTrAlvoEvento(ev, doc);
    if (!alvo) return null;
    return alvo.lado === 'in' ? alvo.c.st : veEnd(alvo.c);
}

function veOvtInit() {
    const box = $ve('ve-ovt-list');
    if (!box) return;
    veOvtRender();
    // os cartões esperam o logo do exemplo (veTrvPrep)
    const espera = setInterval(() => { if (VETRV.B && VETRV.B !== 'carregando') { clearInterval(espera); veOvtRender(); } }, 200);
    setTimeout(() => clearInterval(espera), 10000);
    $ve('ve-tr-q').addEventListener('input', veOvtRender);
    box.addEventListener('pointerover', e => { const el = e.target.closest('[data-ovt]'); if (el) veOvtAnimar(el); });
    box.addEventListener('pointerout', e => { const el = e.target.closest('[data-ovt]'); if (el && !el.contains(e.relatedTarget)) veOvtParar(el); });
    box.addEventListener('dblclick', e => {
        const el = e.target.closest('[data-ovt]');
        if (!el) return;
        const t = veOvtCorteMaisPerto(VE.playhead);
        if (t == null) { veToast(veT('Nenhum corte na timeline')); return; }
        veOvtAdd(el.dataset.ovt, t);
    });
    box.addEventListener('pointerdown', e => {
        const el = e.target.closest('[data-ovt]');
        if (!el || e.button !== 0) return;
        const doc = box.ownerDocument, win = doc.defaultView, t = el.dataset.ovt, x0 = e.clientX, y0 = e.clientY;
        let ghost = null;
        const move = ev => {
            if (!ghost) {
                if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
                ghost = doc.createElement('div');
                ghost.className = 've-dghost';
                ghost.textContent = '✦  ' + veT(VE_OVT[t].nome);
                doc.body.appendChild(ghost);
                doc.body.classList.add('ve-fx-dragging');
            }
            ghost.style.left = ev.clientX + 12 + 'px';
            ghost.style.top = ev.clientY + 10 + 'px';
            $ve('ve-tl-wrap').classList.toggle('fx-drop', veOvtAlvoEvento(ev, doc) != null);
        };
        const up = ev => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            $ve('ve-tl-wrap').classList.remove('fx-drop');
            doc.body.classList.remove('ve-fx-dragging');
            if (!ghost) return;
            ghost.remove();
            const corte = veOvtAlvoEvento(ev, doc);
            if (corte != null) veOvtAdd(t, corte);
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });
}
document.addEventListener('DOMContentLoaded', veOvtInit);
