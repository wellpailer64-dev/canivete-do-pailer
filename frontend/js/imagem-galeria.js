// =========================================================
// Editor de Imagem — Filtro > Galeria de filtros, como no Photoshop: prévia grande, pastas com miniaturas
// (Artístico, Traçados de pincel, Distorção, Esboço, Estilização, Textura: 47 filtros) e camadas de efeito empilhadas
// (cada uma um filtro com seus valores; olho, nova, excluir). Esboço usa as cores de frente e de fundo, como no PS.
// Os filtros recebem P = {w, h, R, G, B, A (Float32), ox, oy, tw, th} e e = escala: a prévia calcula só a área
// visível na escala do zoom (e < 1) e os tamanhos em pixel dos parâmetros vão multiplicados por e. Ruído e texturas
// dependem da posição absoluta (ox, oy), então a prévia bate com o resultado e não "anda" ao arrastar a vista.
// vals = {pilha: [{f, v, on}]}: objeto inteligente → filtro inteligente; automação: KNV.cmd('f:galeria', {pilha}).
// =========================================================

// ─────────────────────────── utilidades ───────────────────────────
const gfCl01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const gfSs = (a, b, x) => { const t = gfCl01((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
function gfDe(c, ox = 0, oy = 0, tw = c.width, th = c.height) {
    const img = ieFImg(c), d = img.data, n = c.width * c.height;
    const P = { w: c.width, h: c.height, ox, oy, tw, th, R: new Float32Array(n), G: new Float32Array(n), B: new Float32Array(n), A: new Float32Array(n) };
    for (let i = 0; i < n; i++) { P.R[i] = d[i * 4]; P.G[i] = d[i * 4 + 1]; P.B[i] = d[i * 4 + 2]; P.A[i] = d[i * 4 + 3]; }
    return P;
}
function gfPara(P) {
    const img = new ImageData(P.w, P.h), d = img.data;
    for (let i = 0, n = P.w * P.h; i < n; i++) { d[i * 4] = P.R[i]; d[i * 4 + 1] = P.G[i]; d[i * 4 + 2] = P.B[i]; d[i * 4 + 3] = P.A[i]; }
    return ieFTela(img);
}
const gfCom = (P, R, G, B) => ({ ...P, R, G, B });
const gfCanais = (P, fn) => gfCom(P, fn(P.R, 0), fn(P.G, 1), fn(P.B, 2));
function gfLum(P) { const L = new Float32Array(P.w * P.h); for (let i = 0; i < L.length; i++) L[i] = P.R[i] * 0.299 + P.G[i] * 0.587 + P.B[i] * 0.114; return L; }
function gfDesf(a, w, h, r) {   // ~gaussiano (3 caixas)
    if (!(r >= 0.5)) return Float32Array.from(a);
    const k = Math.max(1, Math.round(r));
    return ieFBox(ieFBox(ieFBox(a, w, h, k), w, h, k), w, h, k);
}
function gfSobel(a, w, h) {
    const m = new Float32Array(w * h), gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    const v = (x, y) => a[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const X = v(x + 1, y - 1) + 2 * v(x + 1, y) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x - 1, y) - v(x - 1, y + 1);
        const Y = v(x - 1, y + 1) + 2 * v(x, y + 1) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x, y - 1) - v(x + 1, y - 1);
        const i = y * w + x; gx[i] = X / 4; gy[i] = Y / 4; m[i] = Math.hypot(X, Y) / 4;
    }
    return { m, gx, gy };
}
function gfHash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
function gfRuido(P, s) {   // branco 0..1, preso à posição absoluta
    const o = new Float32Array(P.w * P.h), ox = Math.round(P.ox), oy = Math.round(P.oy);
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) o[y * P.w + x] = gfHash(x + ox, y + oy, s);
    return o;
}
function gfSuave(P, cel, s) {   // ruído de valor −1..1 (grade de `cel` px, cosseno)
    const o = new Float32Array(P.w * P.h), c = Math.max(1, cel);
    const sv = t => (1 - Math.cos(t * Math.PI)) / 2;
    for (let y = 0; y < P.h; y++) {
        const Y = (y + P.oy) / c, y0 = Math.floor(Y), ty = sv(Y - y0);
        for (let x = 0; x < P.w; x++) {
            const X = (x + P.ox) / c, x0 = Math.floor(X), tx = sv(X - x0);
            const a = gfHash(x0, y0, s) + (gfHash(x0 + 1, y0, s) - gfHash(x0, y0, s)) * tx;
            const b = gfHash(x0, y0 + 1, s) + (gfHash(x0 + 1, y0 + 1, s) - gfHash(x0, y0 + 1, s)) * tx;
            o[y * P.w + x] = (a + (b - a) * ty) * 2 - 1;
        }
    }
    return o;
}
function gfNorm(a) {   // média 0,5 e espalhado em 0..1
    let s = 0, s2 = 0; const n = a.length;
    for (let i = 0; i < n; i++) { s += a[i]; s2 += a[i] * a[i]; }
    const m = s / n, dp = Math.sqrt(Math.max(1e-9, s2 / n - m * m)), o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = gfCl01((a[i] - m) / (3 * dp) + 0.5);
    return o;
}
// média ao longo de uma reta (dx, dy ∈ −1..1): janela 2L+1 com soma corrida, bordas repetidas — O(n)
function gfDir(a, w, h, dx, dy, L) {
    L = Math.round(L);
    if (L < 1) return Float32Array.from(a);
    const o = new Float32Array(w * h), idx = new Int32Array(w + h + 2), k = 2 * L + 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x - dx, py = y - dy;
        if (px >= 0 && py >= 0 && px < w && py < h) continue;   // não é o começo de uma reta
        let n = 0;
        for (let cx = x, cy = y; cx >= 0 && cy >= 0 && cx < w && cy < h; cx += dx, cy += dy) idx[n++] = cy * w + cx;
        const at = i => a[idx[i < 0 ? 0 : i >= n ? n - 1 : i]];
        let s = 0;
        for (let i = -L; i <= L; i++) s += at(i);
        for (let i = 0; i < n; i++) { o[idx[i]] = s / k; s += at(i + L + 1) - at(i - L); }
    }
    return o;
}
const GF_LUZ = [['baixo', 'Baixo'], ['baixoEsq', 'Inferior esquerda'], ['esq', 'Esquerda'], ['cimaEsq', 'Superior esquerda'], ['cima', 'Topo'], ['cimaDir', 'Superior direita'], ['dir', 'Direita'], ['baixoDir', 'Inferior direita']];
const GF_LUZV = { baixo: [0, 1], baixoEsq: [-1, 1], esq: [-1, 0], cimaEsq: [-1, -1], cima: [0, -1], cimaDir: [1, -1], dir: [1, 0], baixoDir: [1, 1] };
// sombreado de um relevo H: 0 = plano, + voltado para a luz, − de costas
function gfRelevo(H, w, h, luz, k) {
    const [lx0, ly0] = GF_LUZV[luz] || GF_LUZV.cima, ln = Math.hypot(lx0, ly0), lx = lx0 / ln * 0.7071, ly = ly0 / ln * 0.7071, lz = 0.7071;
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const gx = (H[y * w + Math.min(w - 1, x + 1)] - H[y * w + Math.max(0, x - 1)]) / 2 * k, gy = (H[Math.min(h - 1, y + 1) * w + x] - H[Math.max(0, y - 1) * w + x]) / 2 * k;
        const nn = Math.hypot(gx, gy, 1);
        o[i] = (gx * lx + gy * ly + lz) / nn - lz;
    }
    return o;
}
const gfMod = (a, p) => ((a % p) + p) % p;
function gfTextura(P, tipo, esc) {   // 0..1
    const s = Math.max(0.25, esc), w = P.w, h = P.h, o = new Float32Array(w * h), r = gfRuido(P, 31);
    if (tipo === 'arenito') { const g = gfSuave(P, 2.5 * s, 32); for (let i = 0; i < o.length; i++) o[i] = gfCl01(0.5 + g[i] * 0.3 + (r[i] - 0.5) * 0.35); return o; }
    if (tipo === 'fosco') return gfNorm(gfDesf(r, w, h, 1.2 * s));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const X = x + P.ox, Y = y + P.oy, i = y * w + x;
        let v;
        if (tipo === 'tijolo') {
            const bw = 48 * s, bh = 20 * s, lin = Math.floor(Y / bh), fx = gfMod(X + (lin & 1) * bw / 2, bw), fy = gfMod(Y, bh);
            v = gfSs(0, 2.5 * s, Math.min(fx, bw - fx, fy, bh - fy)) * (0.8 + 0.2 * r[i]);
        } else if (tipo === 'blocos') { const p = 26 * s; v = Math.sin(gfMod(X, p) / p * Math.PI) * Math.sin(gfMod(Y, p) / p * Math.PI); }
        else if (tipo === 'lentes') { const p = 9 * s, dx = gfMod(X, p) / p - 0.5, dy = gfMod(Y, p) / p - 0.5; v = Math.sqrt(Math.max(0, 1 - (dx * dx + dy * dy) * 4)); }
        else {   // tela (padrão) e aniagem: fios cruzados
            const p = (tipo === 'aniagem' ? 7 : 4) * s, cx = Math.floor(X / p), cy = Math.floor(Y / p), a = (cx + cy) & 1;
            v = a ? Math.sin(gfMod(X, p) / p * Math.PI) : Math.sin(gfMod(Y, p) / p * Math.PI);
            if (tipo === 'aniagem') v *= 0.65 + 0.35 * gfHash(cx, cy, 33);
            v = 0.2 + 0.7 * v + (r[i] - 0.5) * 0.12;
        }
        o[i] = gfCl01(v);
    }
    return o;
}
function gfVoronoi(P, t, s) {   // células com semente por posição absoluta; f1/f2 = distâncias à 1ª e 2ª semente
    const w = P.w, h = P.h, ci0 = Math.floor(P.ox / t) - 1, cj0 = Math.floor(P.oy / t) - 1;
    const gw = Math.floor((P.ox + w) / t) + 2 - ci0, gh = Math.floor((P.oy + h) / t) + 2 - cj0;
    const sx = new Float32Array(gw * gh), sy = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { sx[j * gw + i] = (ci0 + i + gfHash(ci0 + i, cj0 + j, s)) * t - P.ox; sy[j * gw + i] = (cj0 + j + gfHash(ci0 + i, cj0 + j, s + 1)) * t - P.oy; }
    const dono = new Int32Array(w * h), f1 = new Float32Array(w * h), f2 = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ci = Math.floor((x + P.ox) / t) - ci0, cj = Math.floor((y + P.oy) / t) - cj0;
        let a = Infinity, b = Infinity, k1 = 0;
        for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
            if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
            const k = j * gw + i, d = (sx[k] - x) ** 2 + (sy[k] - y) ** 2;
            if (d < a) { b = a; a = d; k1 = k; } else if (d < b) b = d;
        }
        const n = y * w + x; dono[n] = k1; f1[n] = Math.sqrt(a); f2[n] = Math.sqrt(b);
    }
    return { dono, f1, f2, n: gw * gh };
}
function gfMediaCelula(P, dono, nc) {   // cor média de cada célula
    const s = new Float64Array(nc * 4), R = new Float32Array(P.w * P.h), G = new Float32Array(R.length), B = new Float32Array(R.length);
    for (let i = 0; i < R.length; i++) { const k = dono[i] * 4; s[k] += P.R[i]; s[k + 1] += P.G[i]; s[k + 2] += P.B[i]; s[k + 3]++; }
    for (let i = 0; i < R.length; i++) { const k = dono[i] * 4, q = s[k + 3] || 1; R[i] = s[k] / q; G[i] = s[k + 1] / q; B[i] = s[k + 2] / q; }
    return gfCom(P, R, G, B);
}
function gfDuo(P, t) {   // t = 1 → cor de frente, 0 → cor de fundo (filtros de Esboço)
    const F = ieHexRgb(IE.cor[0]), B = ieHexRgb(IE.cor[1]), n = P.w * P.h, R = new Float32Array(n), G = new Float32Array(n), Bb = new Float32Array(n);
    for (let i = 0; i < n; i++) { const k = t[i]; R[i] = B[0] + (F[0] - B[0]) * k; G[i] = B[1] + (F[1] - B[1]) * k; Bb[i] = B[2] + (F[2] - B[2]) * k; }
    return gfCom(P, R, G, Bb);
}
function gfDeslocar(P, dx, dy) { const c = ieDeslocar(gfPara(P), (x, y) => { const i = y * P.w + x; return [dx[i], dy[i]]; }); return { ...gfDe(c, P.ox, P.oy, P.tw, P.th) }; }
function gfKuw(P, r) { return { ...gfDe(ieFKuwahara(gfPara(P), Math.max(1, Math.round(r))), P.ox, P.oy, P.tw, P.th), A: P.A }; }
const gfPoster = (x, lv) => Math.round(gfCl01(x / 255) * (lv - 1)) / (lv - 1) * 255;
function gfNitidez(P, q, r) { if (!q) return P; return gfCanais(P, a => { const b = gfDesf(a, P.w, P.h, r), o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] + (a[i] - b[i]) * q; return o; }); }
// aplica fn(x, i, canal) em cada pixel de cada canal
function gfPix(P, fn) { return gfCanais(P, (a, c) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = fn(a[i], i, c); return o; }); }

// ─────────────────────────── os 47 filtros ───────────────────────────
const gN = (id, rotulo, min, max, valor) => ({ id, rotulo, min, max, valor });
const gS = (id, rotulo, opcoes, valor) => ({ id, rotulo, tipo: 'select', opcoes, valor });
const gC = (id, rotulo, valor = false) => ({ id, rotulo, tipo: 'check', valor });
const gTex = (rel = 4) => [gS('tex', 'Textura', [['tela', 'Tela'], ['tijolo', 'Tijolo'], ['aniagem', 'Aniagem'], ['arenito', 'Arenito']], 'tela'), gN('esc', 'Escala (%)', 50, 200, 100),
    gN('rel', 'Relevo', 0, 50, rel), gS('luz', 'Luz', GF_LUZ, 'cima'), gC('inv', 'Inverter')];
function gfTexturaRel(P, v, e, k = 2.5) { let T = gfTextura(P, v.tex, v.esc / 100 * e); if (v.inv) T = T.map(x => 1 - x); return gfRelevo(T, P.w, P.h, v.luz, k); }

const IE_GAL = [
    ['Artístico', [
        { id: 'lapisCor', nome: 'Lápis de cor', campos: [gN('larg', 'Largura do lápis', 1, 24, 4), gN('pressao', 'Pressão do traço', 0, 15, 8), gN('papel', 'Brilho do papel', 0, 50, 25)],
            fn(P, v, e) {
                const { w, h } = P, L = gfLum(P), m = gfSobel(gfDesf(L, w, h, 0.7 * e), w, h).m, r = gfRuido(P, 1), len = Math.max(1, v.larg * e * 1.5);
                const h1 = gfNorm(gfDir(r, w, h, 1, 1, len)), h2 = gfNorm(gfDir(r, w, h, 1, -1, len)), papel = v.papel * 5.1, pr = 0.35 + v.pressao / 15 * 0.9;
                return gfPix(P, (x, i) => { const esc = 1 - L[i] / 255, hc = esc > 0.5 ? Math.max(h1[i], h2[i]) : h1[i]; const t = gfCl01((esc * pr + m[i] / 90) * (0.35 + hc * 1.1)); return papel + (x - papel) * t; });
            } },
        { id: 'recorte', nome: 'Recorte', campos: [gN('niveis', 'Número de níveis', 2, 8, 4), gN('simpl', 'Simplicidade da aresta', 0, 10, 4), gN('fidel', 'Fidelidade da aresta', 1, 3, 2)],
            fn(P, v, e) {
                const { w, h } = P, n = w * h, r = v.simpl * 0.9 * e, B = gfCanais(P, a => gfDesf(a, w, h, r)), L = gfLum(B), N = v.niveis, q = new Uint8Array(n), s = new Float64Array(N * 4);
                for (let i = 0; i < n; i++) { const k = Math.min(N - 1, Math.floor(L[i] / 256 * N)); q[i] = k; s[k * 4] += B.R[i]; s[k * 4 + 1] += B.G[i]; s[k * 4 + 2] += B.B[i]; s[k * 4 + 3]++; }
                const a = (v.fidel - 1) * 0.2;
                return gfPix(B, (x, i, c) => { const k = q[i] * 4; return (s[k + c] / (s[k + 3] || 1)) * (1 - a) + x * a; });
            } },
        { id: 'pincelSeco', nome: 'Pincel seco', campos: [gN('tam', 'Tamanho do pincel', 0, 10, 2), gN('det', 'Detalhe do pincel', 0, 10, 8), gN('tex', 'Textura', 1, 3, 1)],
            fn(P, v, e) { const K = gfKuw(P, (v.tam + 1.5) * e), lv = 3 + v.det, r = gfRuido(P, 3); return gfPix(K, (x, i) => x * 0.6 + gfPoster(x, lv) * 0.4 + (r[i] - 0.5) * v.tex * 10); } },
        { id: 'granuladoFilme', nome: 'Granulação de filme', campos: [gN('grao', 'Granulação', 0, 20, 4), gN('realce', 'Área de realce', 0, 20, 0), gN('int', 'Intensidade', 0, 10, 10)],
            fn(P, v, e) {
                const L = gfLum(P), r1 = gfRuido(P, 4), r2 = gfRuido(P, 5);
                return gfPix(P, (x, i) => { const l = L[i] / 255, g = (r1[i] + r2[i] - 1) * v.grao * 4 * (0.4 + 4 * l * (1 - l)), hl = v.realce ? gfSs(1 - v.realce / 25, 1, l) * v.int / 10 : 0; const y = x + g; return y + (255 - y) * hl * 0.7; });
            } },
        { id: 'afresco', nome: 'Afresco', campos: [gN('tam', 'Tamanho do pincel', 0, 10, 2), gN('det', 'Detalhe do pincel', 0, 10, 8), gN('tex', 'Textura', 1, 3, 1)],
            fn(P, v, e) { const K = gfKuw(P, (v.tam + 2) * e), m = gfSobel(gfLum(K), P.w, P.h).m, r = gfRuido(P, 6); return gfPix(K, (x, i) => 128 + (x - 128) * 1.35 - m[i] * (0.45 - v.det * 0.03) + (r[i] - 0.5) * v.tex * 12); } },
        { id: 'neon', nome: 'Brilho neon', campos: [gN('tam', 'Tamanho do brilho', -24, 24, 5), gN('brilho', 'Brilho', 0, 50, 15), { id: 'cor', rotulo: 'Cor do brilho', tipo: 'cor', valor: '#2a7fff' }],
            fn(P, v, e) {
                const { w, h } = P, L = gfLum(P), m = gfSobel(gfDesf(L, w, h, e), w, h).m, g0 = gfDesf(m, w, h, Math.abs(v.tam) * e * 0.6 + 0.5), cor = ieHexRgb(v.cor);
                return gfPix(P, (x, i, c) => { let g = gfCl01(g0[i] / 35); if (v.tam < 0) g = 1 - g; return L[i] * (0.2 + v.brilho / 120) + cor[c] * g * (0.5 + v.brilho / 50); });
            } },
        { id: 'pinceladas', nome: 'Pinceladas', campos: [gN('tam', 'Tamanho do pincel', 1, 50, 8), gN('nit', 'Nitidez', 0, 40, 7),
            gS('tipo', 'Tipo de pincel', [['simples', 'Simples'], ['claraAspera', 'Clara áspera'], ['escuraAspera', 'Escura áspera'], ['larga', 'Larga e nítida'], ['desfocada', 'Larga e desfocada'], ['centelha', 'Centelha']], 'simples')],
            fn(P, v, e) {
                let K = gfKuw(P, Math.max(1, v.tam * e * (v.tipo === 'larga' || v.tipo === 'desfocada' ? 0.8 : 0.45)));
                if (v.tipo === 'desfocada') K = gfCanais(K, a => gfDesf(a, P.w, P.h, 1.5 * e));
                K = gfNitidez(K, v.nit / 40 * 2.5, Math.max(1, v.tam * e * 0.3));
                const r = gfRuido(P, 7), L = gfLum(K);
                return gfPix(K, (x, i) => v.tipo === 'claraAspera' ? x + (255 - x) * r[i] * 0.25 : v.tipo === 'escuraAspera' ? x - x * r[i] * 0.3 : v.tipo === 'centelha' && L[i] > 190 && r[i] > 0.85 ? 255 : x);
            } },
        { id: 'espatula', nome: 'Espátula', campos: [gN('tam', 'Tamanho do traço', 1, 50, 25), gN('det', 'Detalhe do traço', 1, 3, 3), gN('suav', 'Suavidade', 0, 10, 0)],
            fn(P, v, e) { const r = Math.max(1, Math.round(v.tam * e * 0.25)), lv = 2 + v.det * 3; return gfCanais(P, a => { const m = ieFMediana(a, P.w, P.h, r); for (let i = 0; i < m.length; i++) m[i] = m[i] * 0.5 + gfPoster(m[i], lv) * 0.5; return gfDesf(m, P.w, P.h, v.suav * e * 0.3); }); } },
        { id: 'plastico', nome: 'Plástico filme', campos: [gN('forca', 'Força do realce', 0, 20, 15), gN('det', 'Detalhe', 1, 15, 9), gN('suav', 'Suavidade', 1, 15, 7)],
            fn(P, v, e) {
                const H = gfDesf(gfLum(P), P.w, P.h, (v.suav + 1) * e * 1.2), sh = gfRelevo(H, P.w, P.h, 'cimaEsq', v.det / 15 * 0.15 / Math.max(0.2, e) * e * 1.5);
                return gfPix(P, (x, i) => { const hl = gfCl01((sh[i] - 0.12) * 5) * v.forca / 20, sb = gfCl01(-sh[i] - 0.2) * 0.3; return (x + (255 - x) * hl) * (1 - sb); });
            } },
        { id: 'bordasPost', nome: 'Bordas posterizadas', campos: [gN('esp', 'Espessura da aresta', 0, 10, 2), gN('int', 'Intensidade da aresta', 0, 10, 1), gN('post', 'Posterização', 0, 6, 2)],
            fn(P, v, e) {
                const { w, h } = P, m = gfSobel(gfDesf(gfLum(P), w, h, 0.8 * e), w, h).m, th = 30 - v.int * 2, lv = v.post + 2;
                let ed = m.map(x => gfCl01((x - th) / 15));
                if (v.esp > 0) ed = gfDesf(ed, w, h, v.esp * e * 0.4).map(x => gfCl01(x * 2.2));
                const dk = 0.5 + v.int * 0.05;
                return gfPix(P, (x, i) => gfPoster(x, lv) * (1 - ed[i] * dk));
            } },
        { id: 'pasteis', nome: 'Pastéis ásperos', campos: [gN('comp', 'Comprimento do traço', 0, 40, 6), gN('det', 'Detalhe do traço', 1, 20, 4), ...gTex(20)],
            fn(P, v, e) { const S = gfNitidez(gfCanais(P, a => gfDir(a, P.w, P.h, 1, -1, v.comp * e * 0.5)), v.det / 20, 1), sh = gfTexturaRel(P, v, e); return gfPix(S, (x, i) => x * (1 + sh[i] * v.rel / 25)); } },
        { id: 'esfregar', nome: 'Esfregar', campos: [gN('comp', 'Comprimento do traço', 0, 10, 2), gN('realce', 'Área de realce', 0, 20, 0), gN('int', 'Intensidade', 0, 10, 10)],
            fn(P, v, e) {
                const S = gfCanais(P, a => gfDir(a, P.w, P.h, 1, 1, (v.comp * 1.5 + 1) * e)), L = gfLum(S);
                return gfPix(S, (x, i) => { const l = L[i] / 255, y = x * (0.75 + 0.25 * l), hl = v.realce ? gfSs(1 - v.realce / 25, 1, l) * v.int / 10 : 0; return y + (255 - y) * hl * 0.7; });
            } },
        { id: 'esponja', nome: 'Esponja', campos: [gN('tam', 'Tamanho do pincel', 0, 10, 2), gN('def', 'Definição', 0, 25, 12), gN('suav', 'Suavidade', 1, 15, 5)],
            fn(P, v, e) { const b = gfNorm(gfDesf(gfRuido(P, 8), P.w, P.h, (v.tam + 1) * e)), B = gfCanais(P, a => gfDesf(a, P.w, P.h, v.suav * 0.25 * e)), k = v.def / 25 * 1.2; return gfPix(B, (x, i) => x * (1 - (b[i] - 0.5) * k)); } },
        { id: 'pinturaBase', nome: 'Pintura de base', campos: [gN('tam', 'Tamanho do pincel', 0, 40, 6), gN('cob', 'Cobertura da textura', 0, 40, 16), ...gTex(4)],
            fn(P, v, e) { const B = gfCanais(P, a => gfDesf(a, P.w, P.h, v.tam * 0.5 * e)), sh = gfTexturaRel(P, v, e); return gfPix(B, (x, i, c) => (x * 0.75 + P[['R', 'G', 'B'][c]][i] * 0.25) * (1 + sh[i] * v.rel / 25 * (v.cob / 40 + 0.2) * 3)); } },
        { id: 'aquarela', nome: 'Aquarela', campos: [gN('det', 'Detalhe do pincel', 1, 14, 9), gN('sombra', 'Intensidade da sombra', 0, 10, 1), gN('tex', 'Textura', 1, 3, 1)],
            fn(P, v, e) {
                const K = gfKuw(P, Math.max(1, (15 - v.det) * 0.5 * e + 1)), L = gfLum(K), m = gfSobel(L, P.w, P.h).m, t = gfDesf(gfRuido(P, 9), P.w, P.h, 0.7 * e);
                return gfPix(K, (x, i) => { const s = L[i] + (x - L[i]) * 1.25, dk = gfCl01(m[i] / 120) * (0.35 + v.sombra * 0.06); return (s * (1 - dk) - v.sombra * 4) * (1 + (t[i] - 0.5) * 0.15 * v.tex); });
            } },
    ]],
    ['Traçados de pincel', [
        { id: 'bordasAcent', nome: 'Bordas acentuadas', campos: [gN('larg', 'Largura da aresta', 1, 14, 2), gN('brilho', 'Brilho da aresta', 0, 50, 38), gN('suav', 'Suavidade', 1, 15, 5)],
            fn(P, v, e) { const { w, h } = P, m = gfSobel(gfDesf(gfLum(P), w, h, v.suav * 0.25 * e), w, h).m, ed = gfDesf(m, w, h, v.larg * e * 0.4), b = (v.brilho - 25) / 25; return gfPix(P, (x, i) => { const k = gfCl01(ed[i] / 35); return x + k * (b > 0 ? (255 - x) * b : x * b); }); } },
        { id: 'tracosAng', nome: 'Traços angulados', campos: [gN('bal', 'Equilíbrio de direção', 0, 100, 50), gN('comp', 'Comprimento do traço', 3, 50, 15), gN('nit', 'Nitidez', 0, 10, 3)],
            fn(P, v, e) {
                const { w, h } = P, L = gfLum(P), len = v.comp * e * 0.5, A1 = gfCanais(P, a => gfDir(a, w, h, 1, 1, len)), A2 = gfCanais(P, a => gfDir(a, w, h, 1, -1, len)), bal = 1 - v.bal / 100, k = ['R', 'G', 'B'];
                return gfNitidez(gfPix(P, (x, i, c) => { const t = gfSs(bal - 0.15, bal + 0.15, L[i] / 255); return A1[k[c]][i] * t + A2[k[c]][i] * (1 - t); }), v.nit * 0.25, 1);
            } },
        { id: 'hachuras', nome: 'Hachuras', campos: [gN('comp', 'Comprimento do traço', 3, 50, 9), gN('nit', 'Nitidez', 0, 20, 6), gN('forca', 'Força', 1, 3, 1)],
            fn(P, v, e) { const { w, h } = P, r = gfRuido(P, 10), len = v.comp * e * 0.6, h1 = gfNorm(gfDir(r, w, h, 1, 1, len)), h2 = gfNorm(gfDir(r, w, h, 1, -1, len)); return gfNitidez(gfPix(P, (x, i) => x + (h1[i] + h2[i] - 1) * v.forca * 22), v.nit * 0.12, 1); } },
        { id: 'tracosEsc', nome: 'Traços escuros', campos: [gN('bal', 'Equilíbrio', 0, 10, 5), gN('preto', 'Intensidade do preto', 0, 10, 6), gN('branco', 'Intensidade do branco', 0, 10, 2)],
            fn(P, v, e) {
                const { w, h } = P, L = gfLum(P), S1 = gfCanais(P, a => gfDir(a, w, h, 1, 1, 2 * e)), S2 = gfCanais(P, a => gfDir(a, w, h, 1, -1, 6 * e)), bal = v.bal / 10, k = ['R', 'G', 'B'];
                return gfPix(P, (x, i, c) => { const t = gfSs(bal - 0.1, bal + 0.1, L[i] / 255), a = S1[k[c]][i] * (1 - v.preto * 0.06), b = S2[k[c]][i]; return a * (1 - t) + (b + (255 - b) * v.branco * 0.05) * t; });
            } },
        { id: 'contornosTinta', nome: 'Contornos de tinta', campos: [gN('comp', 'Comprimento do traço', 1, 50, 4), gN('escuro', 'Intensidade escura', 0, 50, 20), gN('claro', 'Intensidade clara', 0, 50, 10)],
            fn(P, v, e) {
                const { w, h } = P, L = gfLum(P), S = gfCanais(P, a => gfDir(a, w, h, 1, -1, v.comp * e * 0.5)), m = gfSobel(gfDesf(L, w, h, 0.7 * e), w, h).m;
                return gfPix(S, (x, i) => { const y = x * (1 - gfCl01(m[i] / 50) * v.escuro / 50) * (1 - gfCl01(0.3 - L[i] / 255) * v.escuro / 40); return y + (255 - y) * gfSs(0.6, 1, L[i] / 255) * v.claro / 50; });
            } },
        { id: 'borrifar', nome: 'Borrifar', campos: [gN('raio', 'Raio do borrifo', 0, 25, 10), gN('suav', 'Suavidade', 1, 15, 5)],
            fn(P, v, e) { const k = v.raio * e, f = s => gfNorm(gfDesf(gfRuido(P, s), P.w, P.h, v.suav * 0.3 * e)).map(x => (x - 0.5) * 2 * k); return k ? gfDeslocar(P, f(11), f(12)) : P; } },
        { id: 'tracosBorrif', nome: 'Traços borrifados', campos: [gN('comp', 'Comprimento do traço', 0, 20, 12), gN('raio', 'Raio do borrifo', 0, 25, 7),
            gS('dir', 'Direção do traço', [['diagDir', 'Diagonal direita'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['diagEsq', 'Diagonal esquerda']], 'diagDir')],
            fn(P, v, e) {
                const [dx, dy] = { diagDir: [1, -1], horizontal: [1, 0], vertical: [0, 1], diagEsq: [1, 1] }[v.dir] || [1, -1], S = gfCanais(P, a => gfDir(a, P.w, P.h, dx, dy, v.comp * e * 0.5)), k = v.raio * e * 0.6;
                if (!k) return S;
                const f = s => gfNorm(gfDesf(gfRuido(P, s), P.w, P.h, e)).map(x => (x - 0.5) * 2 * k);
                return gfDeslocar(S, f(13), f(14));
            } },
        { id: 'sumie', nome: 'Sumi-e', campos: [gN('larg', 'Largura do traço', 3, 15, 10), gN('pressao', 'Pressão do traço', 0, 15, 2), gN('contraste', 'Contraste', 0, 40, 16)],
            fn(P, v, e) { const B = gfCanais(P, a => gfDesf(a, P.w, P.h, v.larg * 0.15 * e)), m = gfSobel(gfLum(B), P.w, P.h).m; return gfPix(B, (x, i) => (128 + (x - 128) * (1 + v.contraste / 20)) * (1 - v.pressao * 0.025) - gfCl01(m[i] / 60) * 60); } },
    ]],
    ['Distorção', [
        { id: 'brilhoDifuso', nome: 'Brilho difuso', campos: [gN('grao', 'Granulação', 0, 10, 6), gN('brilho', 'Quantidade de brilho', 0, 20, 10), gN('limpo', 'Quantidade de limpeza', 0, 20, 15)],
            fn(P, v, e) {
                const L = gfLum(P), lo = 0.95 - v.brilho * 0.03, hi = lo + 0.1 + v.limpo * 0.02, g = gfDesf(L.map(l => gfSs(lo, hi, l / 255)), P.w, P.h, 2 * e), r = gfRuido(P, 15), bg = ieHexRgb(IE.cor[1]);
                return gfPix(P, (x, i, c) => x + (bg[c] - x) * g[i] * 0.85 + (r[i] - 0.5) * v.grao * 25 * g[i]);
            } },
        { id: 'vidro', nome: 'Vidro', campos: [gN('dist', 'Distorção', 0, 20, 5), gN('suav', 'Suavidade', 1, 15, 3),
            gS('tex', 'Textura', [['blocos', 'Blocos'], ['tela', 'Tela'], ['fosco', 'Fosco'], ['lentes', 'Lentes pequenas']], 'fosco'), gN('esc', 'Escala (%)', 50, 200, 100), gC('inv', 'Inverter')],
            fn(P, v, e) {
                const { w, h } = P;
                let T = gfTextura(P, v.tex, v.esc / 100 * e); if (v.inv) T = T.map(x => 1 - x);
                T = gfDesf(T, w, h, v.suav * 0.3 * e);
                const k = v.dist * e * 10, dx = new Float32Array(w * h), dy = new Float32Array(w * h);
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; dx[i] = (T[y * w + Math.min(w - 1, x + 1)] - T[y * w + Math.max(0, x - 1)]) / 2 * k; dy[i] = (T[Math.min(h - 1, y + 1) * w + x] - T[Math.max(0, y - 1) * w + x]) / 2 * k; }
                return k ? gfDeslocar(P, dx, dy) : P;
            } },
        { id: 'ondulacaoOceanica', nome: 'Ondulação oceânica', campos: [gN('tam', 'Tamanho da ondulação', 1, 15, 9), gN('mag', 'Magnitude da ondulação', 0, 20, 9)],
            fn(P, v, e) { const c = (v.tam * 2 + 3) * e, k = v.mag * e * 0.8; return k ? gfDeslocar(P, gfSuave(P, c, 16).map(x => x * k), gfSuave(P, c, 17).map(x => x * k)) : P; } },
    ]],
    ['Esboço', [
        { id: 'baixoRelevo', nome: 'Baixo-relevo', campos: [gN('det', 'Detalhe', 1, 15, 13), gN('suav', 'Suavidade', 1, 15, 3), gS('luz', 'Luz', GF_LUZ, 'baixo')],
            fn(P, v, e) { const sh = gfRelevo(gfDesf(gfLum(P), P.w, P.h, v.suav * 0.4 * e), P.w, P.h, v.luz, 0.02 * v.det); return gfDuo(P, sh.map(s => gfCl01(0.5 - s * 1.5))); } },
        { id: 'gizCarvao', nome: 'Giz e carvão', campos: [gN('carvao', 'Área de carvão', 0, 20, 6), gN('giz', 'Área de giz', 0, 20, 6), gN('pressao', 'Pressão do traço', 0, 5, 1)],
            fn(P, v, e) {
                const { w, h } = P, L = gfLum(P), r = gfRuido(P, 18), sA = gfNorm(gfDir(r, w, h, 1, 1, 4 * e)), sB = gfNorm(gfDir(r, w, h, 1, -1, 4 * e)), F = ieHexRgb(IE.cor[0]), B = ieHexRgb(IE.cor[1]), k = 0.4 + v.pressao * 0.15;
                return gfPix(P, (x, i, c) => {
                    const l = L[i] / 255, tc = gfSs(0.4, 0.6, (1 - l) * (0.5 + v.carvao / 20) + (sA[i] - 0.5) * k), tg = gfSs(0.4, 0.6, l * (0.5 + v.giz / 20) + (sB[i] - 0.5) * k), s = Math.max(1, tc + tg);
                    return 128 + (F[c] - 128) * tc / s + (B[c] - 128) * tg / s;
                });
            } },
        { id: 'carvao', nome: 'Carvão', campos: [gN('esp', 'Espessura do carvão', 1, 7, 1), gN('det', 'Detalhe', 0, 5, 5), gN('bal', 'Equilíbrio claro/escuro', 0, 100, 50)],
            fn(P, v, e) {
                const { w, h } = P, L = gfLum(P), s = gfNorm(gfDir(gfRuido(P, 19), w, h, 1, 1, (v.esp * 2 + 2) * e)), m = gfSobel(gfDesf(L, w, h, 0.7 * e), w, h).m;
                return gfDuo(P, L.map((l, i) => Math.max(gfSs(0.4, 0.6, v.bal / 100 - l / 255 + 0.5 + (s[i] - 0.5) * 0.5), gfCl01(m[i] / 80) * v.det / 5)));
            } },
        { id: 'cromo', nome: 'Cromo', campos: [gN('det', 'Detalhe', 0, 10, 4), gN('suav', 'Suavidade', 0, 10, 7)],
            fn(P, v, e) { const L = gfDesf(gfLum(P), P.w, P.h, (v.suav * 0.8 + 0.5) * e), f = 1 + v.det * 0.35, g = L.map(l => (0.5 - 0.5 * Math.cos(l / 255 * Math.PI * 2 * f)) * 255); return gfCom(P, g, g, g); } },
        { id: 'conte', nome: 'Crayon Conté', campos: [gN('frente', 'Nível do primeiro plano', 1, 15, 11), gN('fundo', 'Nível do plano de fundo', 1, 15, 7), ...gTex(4)],
            fn(P, v, e) {
                const L = gfLum(P), F = ieHexRgb(IE.cor[0]), B = ieHexRgb(IE.cor[1]), sh = gfTexturaRel(P, v, e);
                return gfPix(P, (x, i, c) => { const l = L[i] / 255, a = gfCl01((1 - l - 0.35) * v.frente / 8), b = gfCl01((l - 0.45) * v.fundo / 6), mid = (F[c] + B[c]) / 2; return (mid + (F[c] - mid) * a + (B[c] - mid) * b) * (1 + sh[i] * v.rel / 12); });
            } },
        { id: 'canetaGrafica', nome: 'Caneta gráfica', campos: [gN('comp', 'Comprimento do traço', 1, 15, 15), gN('bal', 'Equilíbrio claro/escuro', 0, 100, 50),
            gS('dir', 'Direção do traço', [['diagDir', 'Diagonal direita'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['diagEsq', 'Diagonal esquerda']], 'diagDir')],
            fn(P, v, e) {
                const [dx, dy] = { diagDir: [1, -1], horizontal: [1, 0], vertical: [0, 1], diagEsq: [1, 1] }[v.dir] || [1, -1], L = gfLum(P), s = gfNorm(gfDir(gfRuido(P, 20), P.w, P.h, dx, dy, v.comp * e));
                return gfDuo(P, L.map((l, i) => gfSs(-0.08, 0.08, v.bal / 100 - l / 255 + (s[i] - 0.5) * 0.9)));
            } },
        { id: 'meioTomPadrao', nome: 'Padrão de meio-tom', campos: [gN('tam', 'Tamanho', 1, 12, 1), gN('contraste', 'Contraste', 0, 50, 5), gS('tipo', 'Tipo de padrão', [['ponto', 'Ponto'], ['circulo', 'Círculo'], ['linha', 'Linha']], 'ponto')],
            fn(P, v, e) {
                const p = Math.max(2, (v.tam * 2 + 3) * e), L = gfLum(P), t = new Float32Array(L.length), k = 2 + v.contraste, cx = P.tw / 2, cy = P.th / 2;
                for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
                    const X = x + P.ox, Y = y + P.oy, i = y * P.w + x;
                    let pv;
                    if (v.tipo === 'linha') pv = Math.abs(gfMod(Y, p) / p - 0.5) * 2;
                    else if (v.tipo === 'circulo') pv = Math.abs(gfMod(Math.hypot(X - cx, Y - cy), p) / p - 0.5) * 2;
                    else { const dx = gfMod(X, p) / p - 0.5, dy = gfMod(Y, p) / p - 0.5; pv = Math.hypot(dx, dy) * 1.41; }
                    t[i] = gfCl01((1 - L[i] / 255 - pv) * k + 0.5);
                }
                return gfDuo(P, t);
            } },
        { id: 'papelCarta', nome: 'Papel de carta', campos: [gN('bal', 'Equilíbrio da imagem', 0, 50, 25), gN('grao', 'Granulação', 0, 20, 10), gN('rel', 'Relevo', 0, 25, 11)],
            fn(P, v, e) {
                const { w, h } = P, L = gfLum(P), b = v.bal / 50, t = L.map(l => 1 - gfSs(b - 0.03, b + 0.03, l / 255)), r = gfRuido(P, 21), H = gfDesf(t, w, h, e).map((x, i) => x * 255 + (r[i] - 0.5) * v.grao * 6);
                const sh = gfRelevo(H, w, h, 'cimaEsq', 0.02 * v.rel / 11), D = gfDuo(P, t);
                return gfPix(D, (x, i) => x * (1 + sh[i] * 0.5));
            } },
        { id: 'fotocopia', nome: 'Fotocópia', campos: [gN('det', 'Detalhe', 1, 24, 7), gN('escuro', 'Escurecimento', 1, 50, 8)],
            fn(P, v, e) { const L = gfLum(P), Lb = gfDesf(L, P.w, P.h, v.det * e * 0.8 + 0.5); return gfDuo(P, L.map((l, i) => gfCl01((Lb[i] - l) / 255 * v.escuro * 1.2 + (l < 38 ? (38 - l) / 255 * v.escuro * 0.2 : 0)))); } },
        { id: 'gesso', nome: 'Gesso', campos: [gN('bal', 'Equilíbrio da imagem', 0, 50, 20), gN('suav', 'Suavidade', 1, 15, 2), gS('luz', 'Luz', GF_LUZ, 'cima')],
            fn(P, v, e) {
                const { w, h } = P, b = v.bal / 50, m = gfDesf(gfLum(P), w, h, v.suav * 0.5 * e).map(l => 1 - gfSs(b - 0.05, b + 0.05, l / 255)), H = gfDesf(m, w, h, 2 * e).map(x => x * 255);
                const sh = gfRelevo(H, w, h, v.luz, 0.03);
                return gfDuo(P, sh.map((s, i) => gfCl01(0.5 - s * 1.2 + (m[i] - 0.5) * 0.3)));
            } },
        { id: 'reticulacao', nome: 'Reticulação', campos: [gN('dens', 'Densidade', 0, 50, 12), gN('frente', 'Nível do primeiro plano', 0, 50, 40), gN('fundo', 'Nível do plano de fundo', 0, 50, 5)],
            fn(P, v, e) { const L = gfLum(P), n = gfNorm(gfDesf(gfRuido(P, 22), P.w, P.h, 0.8 * e)); return gfDuo(P, L.map((l, i) => { const t = gfSs(0.45, 0.55, 1 - l / 255 + (n[i] - 0.5) * v.dens / 25); return t * v.frente / 50 + (1 - t) * v.fundo / 50; })); } },
        { id: 'carimbo', nome: 'Carimbo', campos: [gN('bal', 'Equilíbrio claro/escuro', 0, 50, 25), gN('suav', 'Suavidade', 1, 50, 5)],
            fn(P, v, e) { const b = v.bal / 50; return gfDuo(P, gfDesf(gfLum(P), P.w, P.h, v.suav * 0.3 * e).map(l => 1 - gfSs(b - 0.02, b + 0.02, l / 255))); } },
        { id: 'bordasRasg', nome: 'Bordas rasgadas', campos: [gN('bal', 'Equilíbrio da imagem', 0, 50, 25), gN('suav', 'Suavidade', 1, 15, 11), gN('contr', 'Contraste', 1, 25, 17)],
            fn(P, v, e) { const nz = gfSuave(P, 3 * e + 1, 23), r = gfRuido(P, 24), Lb = gfDesf(gfLum(P), P.w, P.h, v.suav * 0.25 * e); return gfDuo(P, Lb.map((l, i) => gfCl01((v.bal / 50 - (l / 255 + (nz[i] * 0.5 + (r[i] - 0.5) * 0.5) * 0.15)) * v.contr * 0.6 + 0.5))); } },
        { id: 'papelMolhado', nome: 'Papel molhado', campos: [gN('fibra', 'Comprimento da fibra', 3, 50, 15), gN('brilho', 'Brilho', 0, 100, 60), gN('contr', 'Contraste', 0, 100, 80)],
            fn(P, v, e) {
                const { w, h } = P, len = v.fibra * 0.5 * e, f1 = gfNorm(gfDir(gfRuido(P, 25), w, h, 1, 1, len)), f2 = gfNorm(gfDir(gfRuido(P, 26), w, h, 1, -1, len)), B = gfCanais(P, a => gfDesf(a, w, h, v.fibra * 0.06 * e));
                return gfPix(B, (x, i) => ((x - 128) * v.contr / 80 + 128 + (v.brilho - 60) * 1.5) * (0.92 + (f1[i] + f2[i]) * 0.08));
            } },
    ]],
    ['Estilização', [
        { id: 'arestasBrilh', nome: 'Arestas brilhantes', campos: [gN('larg', 'Largura da aresta', 1, 14, 2), gN('brilho', 'Brilho da aresta', 0, 20, 6), gN('suav', 'Suavidade', 1, 15, 5)],
            fn(P, v, e) { return gfCanais(P, a => { const m = gfDesf(gfSobel(gfDesf(a, P.w, P.h, v.suav * 0.2 * e), P.w, P.h).m, P.w, P.h, v.larg * 0.3 * e); for (let i = 0; i < m.length; i++) m[i] *= 0.5 + v.brilho * 0.2; return m; }); } },
    ]],
    ['Textura', [
        { id: 'craquele', nome: 'Craquelê', campos: [gN('esp', 'Espaçamento das rachaduras', 2, 100, 15), gN('prof', 'Profundidade das rachaduras', 0, 10, 6), gN('brilho', 'Brilho das rachaduras', 0, 10, 9)],
            fn(P, v, e) {
                const t = Math.max(4, v.esp * 1.2 * e), V = gfVoronoi(P, t, 27), cr = new Float32Array(P.w * P.h);
                for (let i = 0; i < cr.length; i++) cr[i] = gfSs(0, Math.max(1, 1.2 * e), (V.f2[i] - V.f1[i]) / 2) * 0.75 + (1 - V.f1[i] / t) * 0.25;
                const sh = gfRelevo(gfDesf(cr, P.w, P.h, 0.7 * e).map(x => x * 255), P.w, P.h, 'cimaEsq', 0.01 * v.prof);
                return gfPix(P, (x, i) => x * (0.6 + v.brilho * 0.045) * (1 + sh[i] * 0.6) * (0.55 + 0.45 * gfSs(0, 0.5, cr[i])));
            } },
        { id: 'granulacao', nome: 'Granulação', campos: [gN('int', 'Intensidade', 0, 100, 40), gN('contr', 'Contraste', 0, 100, 50),
            gS('tipo', 'Tipo de granulação', [['comum', 'Comum'], ['suave', 'Suave'], ['polvilhado', 'Polvilhado'], ['aglomerado', 'Aglomerado'], ['contrastado', 'Contrastado'], ['ampliado', 'Ampliado'], ['pontilhado', 'Pontilhado'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['mancha', 'Mancha']], 'comum')],
            fn(P, v, e) {
                const { w, h } = P, a = v.int * 0.9, c = 0.5 + v.contr / 100, t = v.tipo, F = ieHexRgb(IE.cor[0]), B = ieHexRgb(IE.cor[1]);
                if (t === 'pontilhado') { const L = gfLum(P), r = gfRuido(P, 28); return gfDuo(P, L.map((l, i) => (r[i] * 255 > l + (a - 45) ? 1 : 0))); }
                const rs = [gfRuido(P, 29), gfRuido(P, 30), gfRuido(P, 31)];
                const ruido = k => {
                    let r = rs[t === 'comum' ? k : 0];
                    if (t === 'suave') r = gfNorm(gfDesf(r, w, h, e));
                    else if (t === 'aglomerado') r = gfNorm(gfDesf(r, w, h, 2 * e));
                    else if (t === 'ampliado') r = gfNorm(gfDesf(r, w, h, 3 * e));
                    else if (t === 'horizontal') r = gfNorm(gfDir(r, w, h, 1, 0, 5 * e));
                    else if (t === 'vertical') r = gfNorm(gfDir(r, w, h, 0, 1, 5 * e));
                    else if (t === 'contrastado') r = r.map(x => (x > 0.5 ? 1 : 0));
                    return r;
                };
                const R = [0, 1, 2].map(k => (t === 'comum' || k === 0 ? ruido(k) : null)), rr = k => R[k] || R[0];
                return gfPix(P, (x, i, k) => {
                    let y = x;
                    if (t === 'polvilhado') { if (rs[0][i] < a / 700) y = B[k]; }
                    else if (t === 'mancha') { if (rs[0][i] < a / 500) y = F[k]; }
                    else y = x + (rr(k)[i] - 0.5) * a * 2.2;
                    return 128 + (y - 128) * c;
                });
            } },
        { id: 'mosaicoLadr', nome: 'Ladrilhos de mosaico', campos: [gN('tam', 'Tamanho do ladrilho', 2, 100, 12), gN('rej', 'Largura do rejunte', 1, 15, 3), gN('clarear', 'Clarear rejunte', 0, 10, 9)],
            fn(P, v, e) {
                const t = Math.max(3, v.tam * 1.4 * e), jx = gfSuave(P, t * 1.5, 34), jy = gfSuave(P, t * 1.5, 35), g0 = v.rej * e * 0.5, n = P.w * P.h, gr = new Float32Array(n), bv = new Float32Array(n);
                for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
                    const i = y * P.w + x, X = x + P.ox + jx[i] * t * 0.12, Y = y + P.oy + jy[i] * t * 0.12, fx = gfMod(X, t), fy = gfMod(Y, t), d = Math.min(fx, t - fx, fy, t - fy);
                    gr[i] = 1 - gfSs(g0, g0 + 1, d); bv[i] = gfCl01(d / (2 * e + 1));
                }
                return gfPix(P, (x, i) => x * (0.85 + 0.15 * bv[i]) * (1 - gr[i]) + gr[i] * (x * 0.3 + 255 * 0.7 * v.clarear / 10));
            } },
        { id: 'colcha', nome: 'Colcha de retalhos', campos: [gN('tam', 'Tamanho do quadrado', 0, 10, 4), gN('rel', 'Relevo', 0, 25, 8)],
            fn(P, v, e) {
                const t = Math.max(2, (v.tam * 2 + 4) * e), ci0 = Math.floor(P.ox / t), cj0 = Math.floor(P.oy / t), gw = Math.floor((P.ox + P.w) / t) - ci0 + 1, n = P.w * P.h, dono = new Int32Array(n), sh = new Float32Array(n);
                for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
                    const X = x + P.ox, Y = y + P.oy, ci = Math.floor(X / t), cj = Math.floor(Y / t), fx = X / t - ci, fy = Y / t - cj, i = y * P.w + x;
                    dono[i] = (cj - cj0) * gw + (ci - ci0);
                    const borda = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.15 ? 1 : 0;
                    sh[i] = ((0.5 - fx) + (0.5 - fy)) * borda + (gfHash(ci, cj, 36) - 0.5) * 0.3;
                }
                const M = gfMediaCelula(P, dono, gw * (Math.floor((P.oy + P.h) / t) - cj0 + 1));
                return gfPix(M, (x, i) => x * (1 + sh[i] * v.rel / 25 * 0.6));
            } },
        { id: 'vitral', nome: 'Vitral', campos: [gN('tam', 'Tamanho da célula', 2, 50, 10), gN('borda', 'Espessura da borda', 1, 20, 4), gN('luz', 'Intensidade da luz', 0, 10, 3)],
            fn(P, v, e) {
                const t = Math.max(4, v.tam * 1.6 * e), V = gfVoronoi(P, t, 37), M = gfMediaCelula(P, V.dono, V.n), F = ieHexRgb(IE.cor[0]), b = v.borda * 0.5 * e, cx = P.tw / 2, cy = P.th / 2, md = Math.hypot(cx, cy) || 1;
                return gfPix(M, (x, i, c) => {
                    const ed = 1 - gfSs(b, b + 1, (V.f2[i] - V.f1[i]) / 2), X = i % P.w + P.ox, Y = Math.floor(i / P.w) + P.oy, k = 1 + v.luz * 0.06 * (1 - Math.hypot(X - cx, Y - cy) / md);
                    return (x * (1 - ed) + F[c] * ed) * k;
                });
            } },
        { id: 'texturizador', nome: 'Texturizador', campos: [...gTex(4)],
            fn(P, v, e) { const sh = gfTexturaRel(P, v, e); return gfPix(P, (x, i) => x * (1 + sh[i] * v.rel * 0.08)); } },
    ]],
];
const IE_GAL_F = {};
IE_GAL.forEach(([cat, l]) => l.forEach(f => { f.cat = cat; IE_GAL_F[f.id] = f; }));
const ieGalPadrao = f => Object.fromEntries((IE_GAL_F[f]?.campos || []).map(c => [c.id, c.valor]));
function ieGalNorm(vals) {
    const p = (vals && vals.pilha || []).filter(x => x && IE_GAL_F[x.f]).map(x => ({ f: x.f, on: x.on !== false, v: { ...ieGalPadrao(x.f), ...(x.v || {}) } }));
    return { pilha: p.length ? p : [{ f: 'pincelSeco', on: true, v: ieGalPadrao('pincelSeco') }] };
}
// roda a pilha num canvas: (ox, oy) = canto na imagem inteira escalada; tw/th = tamanho dela
function ieGalRodar(c, pilha, e = 1, ox = 0, oy = 0, tw = c.width, th = c.height) {
    let P = gfDe(c, ox, oy, tw, th);
    const A = P.A;
    for (const x of pilha) if (x.on && IE_GAL_F[x.f]) { P = IE_GAL_F[x.f].fn(P, x.v, e); P.A = A; }
    return gfPara(P);
}
function ieGalProc(v) { const p = ieGalNorm(v).pilha; return c => ieGalRodar(c, p); }

// ─────────────────────────── a janela ───────────────────────────
function ieGalJanela(fonte, atual) {
    if (IE._auto) { const a = IE._auto; IE._auto = null; return Promise.resolve(ieGalNorm(a)); }
    return new Promise(resolve => {
        const src = fonte.c, W = src.width, H = src.height;
        let pilha = ieGalNorm(atual || iePref('galeria', null)).pilha, sel = pilha.length - 1;
        const ie = ieEl('ie'), box = document.createElement('div');
        box.className = 'ie-dv ie-gal';
        const opcoes = IE_GAL.map(([cat, l]) => `<optgroup label="${ieEsc(ieT(cat))}">${l.map(f => `<option value="${f.id}">${ieEsc(ieT(f.nome))}</option>`).join('')}</optgroup>`).join('');
        box.innerHTML = `<div class="ie-dv-vista ie-gal-vista"><canvas class="ie-gal-cv"></canvas><div class="ie-gal-calc" hidden>${ieT('Calculando...')}</div>
                <div class="ie-dv-zoom"><button class="ie-ico-btn" data-z="-">−</button><span class="ie-dv-zv"></span><button class="ie-ico-btn" data-z="+">+</button><button class="ie-btn" data-z="ajustar">${ieT('Ajustar na tela')}</button><button class="ie-btn" data-z="100">100%</button></div></div>
            <div class="ie-gal-lista">${IE_GAL.map(([cat, l]) => `<details open><summary>${ieEsc(ieT(cat))}</summary><div class="ie-gal-grade">${l.map(f => `<button class="ie-gal-mini" data-f="${f.id}" title="${ieEsc(ieT(f.nome))}"><canvas width="96" height="72"></canvas><span>${ieEsc(ieT(f.nome))}</span></button>`).join('')}</div></details>`).join('')}</div>
            <div class="ie-dv-lado ie-dlg">
                <div class="ie-dv-topo"><h3>${ieT('Galeria de filtros')}</h3><button class="ie-btn" data-r="0">${ieT('Cancelar')}</button><button class="ie-btn ie-btn-primario" data-r="1">${ieT('OK')}</button></div>
                <div class="ie-dv-corpo"><select class="ie-gal-filtro">${opcoes}</select><div class="ie-gal-campos"></div></div>
                <div class="ie-gal-pilha"><div class="ie-gal-itens"></div>
                    <div class="ie-gal-pbts"><button class="ie-ico-btn" data-p="nova" title="${ieT('Nova camada de efeito')}">＋</button><button class="ie-ico-btn" data-p="excluir" title="${ieT('Excluir camada de efeito')}">${ieIco('trash') || '×'}</button></div></div>
            </div>`;
        ie.appendChild(box);
        const vista = box.querySelector('.ie-gal-vista'), cv = box.querySelector('.ie-gal-cv'), cx = ieCtx(cv), calc = box.querySelector('.ie-gal-calc');

        // ── vista e prévia (só a área visível, na escala do zoom) ──
        const V = { esc: 1, ox: 0, oy: 0, dpr: 1 };
        let ult = null, tm = 0, versao = 0;
        const tamanho = () => { V.dpr = window.devicePixelRatio || 1; const w = Math.max(1, Math.round(vista.clientWidth * V.dpr)), h = Math.max(1, Math.round(vista.clientHeight * V.dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } };
        const ajustar = () => { V.esc = Math.min(1 * V.dpr, (cv.width - 40 * V.dpr) / W, (cv.height - 40 * V.dpr) / H); V.ox = (cv.width - W * V.esc) / 2; V.oy = (cv.height - H * V.esc) / 2; };
        const pintar = () => {
            cx.setTransform(1, 0, 0, 1, 0, 0);
            cx.fillStyle = '#1c1c1c'; cx.fillRect(0, 0, cv.width, cv.height);
            const x = V.ox, y = V.oy, w = W * V.esc, h = H * V.esc;
            cx.fillStyle = ieXadrezPadrao?.(cx) || '#fff'; cx.fillRect(x, y, w, h);
            cx.imageSmoothingEnabled = V.esc < 1;
            if (ult) cx.drawImage(ult.c, x + ult.x0 * V.esc, y + ult.y0 * V.esc, (ult.x1 - ult.x0) * V.esc, (ult.y1 - ult.y0) * V.esc);
            else cx.drawImage(src, x, y, w, h);
            box.querySelector('.ie-dv-zv').textContent = Math.round(V.esc / V.dpr * 100) + '%';
        };
        const calcular = () => {
            const e = Math.min(1, V.esc), M = 24 / e;
            const x0 = Math.max(0, Math.floor(-V.ox / V.esc - M)), y0 = Math.max(0, Math.floor(-V.oy / V.esc - M));
            const x1 = Math.min(W, Math.ceil((cv.width - V.ox) / V.esc + M)), y1 = Math.min(H, Math.ceil((cv.height - V.oy) / V.esc + M));
            if (x1 <= x0 || y1 <= y0) return;
            const cw = Math.max(1, Math.round((x1 - x0) * e)), ch = Math.max(1, Math.round((y1 - y0) * e)), rec = ieCanvas(cw, ch), rx = ieCtx(rec);
            rx.imageSmoothingQuality = 'high';
            rx.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, cw, ch);
            const t0 = performance.now();
            const c = ieGalRodar(rec, pilha, e, x0 * e, y0 * e, Math.round(W * e), Math.round(H * e));
            ult = { c, x0, y0, x1, y1, ms: performance.now() - t0 };
            calc.hidden = true; pintar();
        };
        const agendar = (rapido) => {
            const v = ++versao; clearTimeout(tm); calc.hidden = false;
            tm = setTimeout(() => { if (v === versao) calcular(); }, rapido ? 30 : 140);
        };

        // ── miniaturas: um pedaço do centro da camada, um por vez ──
        const mini = (() => {
            const e = 0.4, sw = Math.round(96 / e), sh = Math.round(72 / e), sx = Math.max(0, Math.round((W - sw) / 2)), sy = Math.max(0, Math.round((H - sh) / 2));
            const rec = ieCanvas(96, 72); ieCtx(rec).drawImage(src, sx, sy, Math.min(sw, W), Math.min(sh, H), 0, 0, 96, 72);
            return { rec, e, sx: sx * e, sy: sy * e };
        })();
        const fila = [...box.querySelectorAll('.ie-gal-mini')];
        const proxMini = () => {
            if (!box.isConnected || !fila.length) return;
            const b = fila.shift(), f = IE_GAL_F[b.dataset.f];
            try { const c = ieGalRodar(mini.rec, [{ f: f.id, on: true, v: ieGalPadrao(f.id) }], mini.e, mini.sx, mini.sy, Math.round(W * mini.e), Math.round(H * mini.e)); ieCtx(b.querySelector('canvas')).drawImage(c, 0, 0); } catch (err) { console.warn('miniatura', f.id, err); }
            setTimeout(proxMini, 0);
        };
        setTimeout(proxMini, 200);

        // ── painel: filtro da camada de efeito selecionada, campos, pilha ──
        const campoHtml = c => {
            const t = c.tipo || 'faixa', val = pilha[sel].v[c.id];
            if (t === 'check') return `<label class="ie-dlg-chk"><input type="checkbox" data-c="${c.id}" ${val ? 'checked' : ''}> ${ieT(c.rotulo)}</label>`;
            if (t === 'select') return `<label class="ie-dlg-lin"><span>${ieT(c.rotulo)}</span><select data-c="${c.id}">${c.opcoes.map(([v, r]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${ieT(r)}</option>`).join('')}</select></label>`;
            if (t === 'cor') return `<label class="ie-dlg-lin"><span>${ieT(c.rotulo)}</span><button class="ie-cor ie-dlg-cor" data-c="${c.id}" style="background:${val}"></button></label>`;
            return `<label class="ie-dlg-faixa"><span>${ieT(c.rotulo)}</span><input type="range" data-c="${c.id}" min="${c.min}" max="${c.max}" value="${val}"><input type="number" data-cn="${c.id}" min="${c.min}" max="${c.max}" value="${val}"></label>`;
        };
        const ui = () => {
            const it = pilha[sel], f = IE_GAL_F[it.f];
            box.querySelector('.ie-gal-filtro').value = it.f;
            box.querySelectorAll('.ie-gal-mini').forEach(b => b.classList.toggle('on', b.dataset.f === it.f));
            const cp = box.querySelector('.ie-gal-campos');
            cp.innerHTML = f.campos.map(campoHtml).join('');
            cp.querySelectorAll('[data-c]').forEach(el => {
                const id = el.dataset.c, c = f.campos.find(x => x.id === id);
                if (el.classList.contains('ie-dlg-cor')) { el.onclick = () => ieSeletorCor(el, it.v[id], cc => { el.style.background = cc; it.v[id] = cc; agendar(); }); return; }
                el.addEventListener('input', () => {
                    it.v[id] = el.type === 'checkbox' ? el.checked : c.tipo === 'select' ? el.value : parseFloat(el.value);
                    const n = cp.querySelector(`[data-cn="${id}"]`); if (n) n.value = el.value;
                    agendar();
                });
            });
            cp.querySelectorAll('[data-cn]').forEach(el => el.addEventListener('input', () => { const v = parseFloat(el.value); if (!isFinite(v)) return; it.v[el.dataset.cn] = v; cp.querySelector(`[data-c="${el.dataset.cn}"]`).value = v; agendar(); }));
            box.querySelector('.ie-gal-itens').innerHTML = pilha.map((x, i) => `<div class="ie-gal-item ${i === sel ? 'on' : ''}" data-i="${i}"><button class="ie-cam-olho ${x.on ? 'on' : ''}" data-olho="${i}">${x.on ? ieIco('eye') : ''}</button><span>${ieEsc(ieT(IE_GAL_F[x.f].nome))}</span></div>`).reverse().join('');
        };
        const escolherFiltro = id => { const it = pilha[sel]; if (it.f === id) return; pilha[sel] = { f: id, on: true, v: ieGalPadrao(id) }; ui(); agendar(true); };
        box.querySelector('.ie-gal-filtro').addEventListener('change', ev => escolherFiltro(ev.target.value));
        fila.forEach(b => { b.onclick = () => escolherFiltro(b.dataset.f); });
        box.querySelector('.ie-gal-itens').addEventListener('click', ev => {
            const o = ev.target.closest('[data-olho]');
            if (o) { const it = pilha[+o.dataset.olho]; it.on = !it.on; ui(); agendar(true); return; }
            const it = ev.target.closest('[data-i]');
            if (it) { sel = +it.dataset.i; ui(); }
        });
        box.querySelector('[data-p="nova"]').onclick = () => { const it = pilha[sel]; pilha.splice(sel + 1, 0, { f: it.f, on: true, v: { ...it.v } }); sel++; ui(); agendar(true); };
        box.querySelector('[data-p="excluir"]').onclick = () => { if (pilha.length < 2) return; pilha.splice(sel, 1); sel = Math.min(sel, pilha.length - 1); ui(); agendar(true); };

        // ── mão e zoom na prévia ──
        let arr = null;
        cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); arr = { x: ev.clientX, y: ev.clientY, ox: V.ox, oy: V.oy }; cv.style.cursor = 'grabbing'; });
        cv.addEventListener('pointermove', ev => { if (!arr) return; V.ox = arr.ox + (ev.clientX - arr.x) * V.dpr; V.oy = arr.oy + (ev.clientY - arr.y) * V.dpr; pintar(); });
        const soltar = () => { if (!arr) return; arr = null; cv.style.cursor = 'grab'; agendar(); };
        cv.addEventListener('pointerup', soltar); cv.addEventListener('pointercancel', soltar);
        const zoomEm = (k, sx, sy) => { const e = ieClamp(V.esc * k, 0.02 * V.dpr, 16 * V.dpr), px = (sx - V.ox) / V.esc, py = (sy - V.oy) / V.esc; V.esc = e; V.ox = sx - px * e; V.oy = sy - py * e; pintar(); agendar(); };
        cv.addEventListener('wheel', ev => {
            ev.preventDefault();
            const r = cv.getBoundingClientRect(), sx = (ev.clientX - r.left) * V.dpr, sy = (ev.clientY - r.top) * V.dpr;
            if (ev.ctrlKey || ev.altKey) zoomEm(ev.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy);
            else { V.ox -= (ev.shiftKey ? ev.deltaY : ev.deltaX) * V.dpr; V.oy -= (ev.shiftKey ? 0 : ev.deltaY) * V.dpr; pintar(); agendar(); }
        }, { passive: false });
        cv.style.cursor = 'grab';
        box.querySelectorAll('[data-z]').forEach(b => {
            b.onclick = () => {
                const z = b.dataset.z;
                if (z === 'ajustar') { ajustar(); pintar(); agendar(true); }
                else if (z === '100') zoomEm(V.dpr / V.esc, cv.width / 2, cv.height / 2);
                else zoomEm(z === '+' ? 1.5 : 1 / 1.5, cv.width / 2, cv.height / 2);
            };
        });

        // ── teclado (modal) ──
        const tecla = ev => {
            ev.stopImmediatePropagation();
            if (ev.key === 'Escape') { ev.preventDefault(); fim(false); return; }
            if (ev.key === 'Enter' && ev.target.tagName !== 'SELECT') { ev.preventDefault(); fim(true); return; }
            const k = ev.key.toLowerCase();
            if (ev.ctrlKey && (k === '+' || k === '=')) { ev.preventDefault(); zoomEm(1.5, cv.width / 2, cv.height / 2); }
            else if (ev.ctrlKey && k === '-') { ev.preventDefault(); zoomEm(1 / 1.5, cv.width / 2, cv.height / 2); }
            else if (ev.ctrlKey && k === '0') { ev.preventDefault(); ajustar(); pintar(); agendar(true); }
        };
        window.addEventListener('keydown', tecla, true);
        const ro = new ResizeObserver(() => { tamanho(); pintar(); agendar(); });
        ro.observe(vista);
        const fim = ok => {
            clearTimeout(tm); versao++; fila.length = 0;
            window.removeEventListener('keydown', tecla, true); ro.disconnect();
            box.remove();
            const vals = { pilha: pilha.map(x => ({ f: x.f, on: x.on, v: { ...x.v } })) };
            if (ok) iePrefGravar('galeria', vals);
            resolve(ok ? vals : null);
        };
        box.querySelector('[data-r="0"]').onclick = () => fim(false);
        box.querySelector('[data-r="1"]').onclick = () => fim(true);
        IE._gal = { get pilha() { return pilha; }, set sel(i) { sel = i; ui(); }, escolherFiltro, fim, V, ultimo: () => ult, calcular };   // testes (modo agente)

        tamanho(); ajustar(); ui(); pintar(); agendar(true);
    }).finally(() => { IE._gal = null; });
}

IE_FILTROS.galeria = () => ieAplicarComDialogo({ titulo: 'Galeria de filtros', janela: ieGalJanela, proc: v => ieGalProc(v) });
