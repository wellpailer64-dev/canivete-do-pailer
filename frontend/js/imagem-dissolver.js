// =========================================================
// Editor de Imagem — Filtro > Dissolver (Liquify), como no Photoshop (Shift+Ctrl+X).
// Janela própria: ferramentas à esquerda, a camada no meio (WebGL2 deforma na GPU, ao vivo), propriedades à direita.
// A deformação é um campo numa grade (passo G.g px): cada nó guarda de onde vem o conteúdo (mapeamento inverso), o
// pixel p mostra a origem p + D(p). Os pincéis mexem só nos nós da área do pincel (CPU) e sobem só as linhas sujas.
// OK aplica na CPU (ieDvAplicar), que também é o proc do filtro inteligente: vals = {w, h, g, gw, gh, d} (d = base64
// de Int16 em 1/8 px) ou, por automação (KNV.cmd('f:dissolver', {ops})), a lista de pinceladas refeita do zero.
// =========================================================

const IE_DV_FERR = [   // [id, nome, tecla, ícone]
    ['deformar', 'Ferramenta Deformação para frente', 'W', '<path d="M4 18c4-1 5-6 9-8s5-3 7-6"/><path d="m16 4 4 0 0 4"/>'],
    ['reconstruir', 'Ferramenta Reconstruir', 'R', '<path d="M5 12a7 7 0 1 0 2-5"/><path d="M5 3v4h4"/>'],
    ['suavizar', 'Ferramenta Suavizar', 'E', '<path d="M3 14c3-4 5 4 9 0s6 4 9 0"/><path d="M3 9c3-2 5 2 9 0s6 2 9 0" opacity=".5"/>'],
    ['torcer', 'Ferramenta Torcer no sentido horário (Alt: anti-horário)', 'C', '<path d="M12 12a2 2 0 1 1 2-2 4 4 0 0 1-4 6 6 6 0 0 1-6-6 8 8 0 0 1 8-8"/><path d="m11 2 2 2-2 2"/>'],
    ['comprimir', 'Ferramenta Comprimir (Alt: inchar)', 'S', '<circle cx="12" cy="12" r="9" stroke-dasharray="2 2"/><path d="M12 4v5M12 20v-5M4 12h5M20 12h-5"/><path d="m10 7 2 2 2-2M10 17l2-2 2 2M7 10l2 2-2 2M17 10l-2 2 2 2"/>'],
    ['inchar', 'Ferramenta Inchar (Alt: comprimir)', 'B', '<circle cx="12" cy="12" r="9" stroke-dasharray="2 2"/><path d="M12 9V3M12 15v6M9 12H3M15 12h6"/><path d="m10 5 2-2 2 2M10 19l2 2 2-2M5 10l-2 2 2 2M19 10l2 2-2 2"/>'],
    ['esquerda', 'Ferramenta Empurrar para a esquerda (Alt: direita)', 'O', '<path d="M12 21V8"/><path d="M12 8 7 13"/><path d="M4 5h8l-3-3M4 5l3 3"/>'],
    ['congelar', 'Ferramenta Congelar máscara', 'F', '<path d="M4 20 16 8"/><path d="M14 4l6 6-3 3-6-6z" fill="currentColor" fill-opacity=".35"/><path d="M4 20l3-1-2-2z"/>'],
    ['descongelar', 'Ferramenta Descongelar máscara', 'D', '<path d="M4 20 16 8"/><path d="M14 4l6 6-3 3-6-6z"/><path d="M4 20l3-1-2-2z"/>'],
    ['mao', 'Ferramenta Mão', 'H', null],
    ['zoom', 'Ferramenta Zoom', 'Z', null],
];
const IE_DV_CONTINUAS = { reconstruir: 1, suavizar: 1, torcer: 1, comprimir: 1, inchar: 1, congelar: 1, descongelar: 1 };

// ─────────────────────────── campo (grade) ───────────────────────────
function ieDvGrade(w, h) {
    const g = Math.max(1, Math.ceil(Math.max(w, h) / 1200));   // até ~1200 nós no lado maior
    const gw = Math.floor((w - 1) / g) + 2, gh = Math.floor((h - 1) / g) + 2;
    return { w, h, g, gw, gh, d: new Float32Array(gw * gh * 2), m: new Float32Array(gw * gh) };
}
// deslocamento no ponto (x, y) da imagem, bilinear entre os nós; no(ix, iy, k) lê o valor do nó
function ieDvAmostrar(G, no, x, y, out) {
    const gx = ieClamp(x / G.g, 0, G.gw - 1), gy = ieClamp(y / G.g, 0, G.gh - 1);
    const x0 = Math.min(G.gw - 2, Math.floor(gx)), y0 = Math.min(G.gh - 2, Math.floor(gy)), fx = gx - x0, fy = gy - y0;
    for (let k = 0; k < 2; k++) {
        const a = no(x0, y0, k) * (1 - fx) + no(x0 + 1, y0, k) * fx, b = no(x0, y0 + 1, k) * (1 - fx) + no(x0 + 1, y0 + 1, k) * fx;
        out[k] = a + (b - a) * fy;
    }
    return out;
}
// queda do pincel: miolo cheio (Densidade) e borda em cosseno
function ieDvQueda(t, dens) {
    if (t >= 1) return 0;
    const miolo = ieClamp(dens / 100, 0, 1) * 0.85;
    return t <= miolo ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (t - miolo) / (1 - miolo));
}
// uma pincelada (dab) em (cx, cy) com raio R; o = {dens, pressao, taxa, bordas}; v = vetor (Deformar/Empurrar);
// inv = Alt. Devolve as linhas mexidas [j0, j1] ou null.
function ieDvPincel(G, f, cx, cy, R, o, v, inv) {
    const g = G.g, gw = G.gw, gh = G.gh, D = G.d, M = G.m;
    const i0 = Math.max(0, Math.floor((cx - R) / g)), i1 = Math.min(gw - 1, Math.ceil((cx + R) / g));
    const j0 = Math.max(0, Math.floor((cy - R) / g)), j1 = Math.min(gh - 1, Math.ceil((cy + R) / g));
    if (i0 > i1 || j0 > j1) return null;
    const pr = o.pressao / 100, taxa = o.taxa / 100;
    if (f === 'inchar' && inv) f = 'comprimir'; else if (f === 'comprimir' && inv) f = 'inchar';
    if (f === 'congelar' && inv) f = 'descongelar'; else if (f === 'descongelar' && inv) f = 'congelar';
    // cópia das linhas que a conta lê (o resultado não pode ler o que acabou de escrever)
    const marg = Math.ceil((R + Math.hypot(v ? v[0] : 0, v ? v[1] : 0)) / g) + 2;
    const r0 = Math.max(0, j0 - marg), r1 = Math.min(gh, j1 + marg + 1), velho = D.slice(r0 * gw * 2, r1 * gw * 2);
    const no = (ix, iy, k) => (iy >= r0 && iy < r1 ? velho[((iy - r0) * gw + ix) * 2 + k] : D[(iy * gw + ix) * 2 + k]);
    const s = [0, 0];
    const ang = (inv ? -1 : 1) * taxa * 0.06, esc = taxa * 0.03;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = i * g, py = j * g, dx = px - cx, dy = py - cy, t = Math.hypot(dx, dy) / R;
        if (t >= 1) continue;
        const n = j * gw + i, q = ieDvQueda(t, o.dens) * pr;
        if (f === 'congelar') { M[n] = Math.min(1, M[n] + q); continue; }
        if (f === 'descongelar') { M[n] = Math.max(0, M[n] - q); continue; }
        const w = q * (1 - M[n]);
        if (w <= 0) continue;
        let qx, qy;
        if (f === 'deformar' || f === 'esquerda') { qx = px - v[0] * w; qy = py - v[1] * w; }
        else if (f === 'torcer') { const a = ang * w, co = Math.cos(a), si = Math.sin(a); qx = cx + dx * co + dy * si; qy = cy - dx * si + dy * co; }
        else if (f === 'comprimir' || f === 'inchar') { const k = 1 + (f === 'comprimir' ? 1 : -1) * esc * w; qx = cx + dx * k; qy = cy + dy * k; }
        else if (f === 'reconstruir') { const k = 1 - Math.min(1, taxa * 0.12 * w); D[n * 2] = no(i, j, 0) * k; D[n * 2 + 1] = no(i, j, 1) * k; continue; }
        else if (f === 'suavizar') {
            const k = Math.min(1, taxa * 0.5 * w);
            for (let c = 0; c < 2; c++) {
                let soma = 0, cont = 0;
                for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
                    const x = i + a, y = j + b;
                    if (x >= 0 && y >= 0 && x < gw && y < gh) { soma += no(x, y, c); cont++; }
                }
                const atual = no(i, j, c);
                D[n * 2 + c] = atual + (soma / cont - atual) * k;
            }
            continue;
        } else continue;
        ieDvAmostrar(G, no, qx, qy, s);
        D[n * 2] = qx + s[0] - px; D[n * 2 + 1] = qy + s[1] - py;
    }
    if (o.bordas) ieDvFixarBordas(G, j0, j1);
    return [j0, j1];
}
// Fixar bordas: os nós da borda da imagem não se mexem (não entra transparente pelas laterais)
function ieDvFixarBordas(G, j0 = 0, j1 = G.gh - 1) {
    const { gw, gh, g, w, h, d } = G, ult = Math.floor((w - 1) / g), base = Math.floor((h - 1) / g);
    for (let j = j0; j <= j1; j++) for (let i = 0; i < gw; i++) {
        if (j === 0 || j >= base || i === 0 || i >= ult) { d[(j * gw + i) * 2] = 0; d[(j * gw + i) * 2 + 1] = 0; }
    }
    void gh;
}
// uma pincelada inteira (automação / refazer): pts em px da imagem; contínuas aplicam `passos` dabs em cada ponto
function ieDvTraco(G, op) {
    const R = Math.max(1, (op.tam || 100) / 2), o = { dens: op.dens ?? 50, pressao: op.pressao ?? 100, taxa: op.taxa ?? 80, bordas: op.bordas ?? true };
    const pts = op.pts || [], f = op.f || 'deformar';
    if (IE_DV_CONTINUAS[f]) { for (const [x, y] of pts) for (let k = 0; k < (op.passos || 10); k++) ieDvPincel(G, f, x, y, R, o, null, !!op.alt); return; }
    for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k], dist = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(dist / (R * 0.2)));
        for (let s = 1; s <= n; s++) {
            const x = ax + (bx - ax) * s / n, y = ay + (by - ay) * s / n;
            let v = [(bx - ax) / n, (by - ay) / n];
            if (f === 'esquerda') v = ieDvEsquerda(v, o.pressao, !!op.alt);
            ieDvPincel(G, f, x, y, R, o, v, !!op.alt);
        }
    }
}
// Empurrar para a esquerda: o conteúdo anda para a esquerda de quem arrasta (Alt: direita); ritmo pela Pressão
function ieDvEsquerda(v, pressao, alt) { const k = (alt ? -1 : 1) * 0.6; return [v[1] * k, -v[0] * k]; }

// ─────────────────────────── guardar nos valores do filtro ───────────────────────────
function ieDvB64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
}
function ieDvVals(G) {
    const q = new Int16Array(G.d.length);
    for (let i = 0; i < q.length; i++) q[i] = ieClamp(Math.round(G.d[i] * 8), -32767, 32767);
    return { w: G.w, h: G.h, g: G.g, gw: G.gw, gh: G.gh, d: ieDvB64(q.buffer) };
}
function ieDvDeVals(v) {
    if (!v) return null;
    if (IE._dvCache && IE._dvCache.v === v.d && v.d) return IE._dvCache.G;
    if (v.d) {
        const bin = atob(v.d), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const q = new Int16Array(u.buffer), G = { w: v.w, h: v.h, g: v.g, gw: v.gw, gh: v.gh, d: new Float32Array(q.length), m: new Float32Array(v.gw * v.gh) };
        for (let i = 0; i < q.length; i++) G.d[i] = q[i] / 8;
        IE._dvCache = { v: v.d, G };
        return G;
    }
    return null;
}
function ieDvVazio(G) { for (let i = 0; i < G.d.length; i++) if (G.d[i]) return false; return true; }

// aplica o campo num canvas (CPU). Canvas de outro tamanho (objeto inteligente transformado): o campo estica junto
function ieDvAplicar(c, G) {
    const w = c.width, h = c.height, sx = G.w / w, sy = G.h / h;
    const src = ieCtx(c).getImageData(0, 0, w, h).data, n = ieCanvas(w, h), nx = ieCtx(n), img = nx.createImageData(w, h), o = img.data;
    const D = G.d, gw = G.gw, no = (ix, iy, k) => D[(iy * gw + ix) * 2 + k], s = [0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        ieDvAmostrar(G, no, x * sx, y * sy, s);
        const j = (y * w + x) * 4;
        if (Math.abs(s[0]) < 1e-3 && Math.abs(s[1]) < 1e-3) { o[j] = src[j]; o[j + 1] = src[j + 1]; o[j + 2] = src[j + 2]; o[j + 3] = src[j + 3]; continue; }
        const fx0 = x + s[0] / sx, fy0 = y + s[1] / sy;
        const x0 = Math.floor(fx0), y0 = Math.floor(fy0), fx = fx0 - x0, fy = fy0 - y0;
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < 4; k++) {
            const px = x0 + (k & 1), py = y0 + (k >> 1), wt = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
            if (px < 0 || py < 0 || px >= w || py >= h || !wt) continue;
            const i = (py * w + px) * 4, al = src[i + 3] * wt;
            r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al;
        }
        if (a > 0) { o[j] = r / a; o[j + 1] = g / a; o[j + 2] = b / a; o[j + 3] = a; }
    }
    nx.putImageData(img, 0, 0);
    return n;
}
function ieDvProc(v) {
    return c => {
        let G = ieDvDeVals(v);
        if (!G && v && v.ops) { G = ieDvGrade(c.width, c.height); v.ops.forEach(op => ieDvTraco(G, op)); }
        return G && !ieDvVazio(G) ? ieDvAplicar(c, G) : ieClonar(c);
    };
}

// ─────────────────────────── a janela ───────────────────────────
const IE_DV_VS = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }`;
const IE_DV_FS = `#version 300 es
precision highp float;
uniform sampler2D uImg; uniform highp sampler2D uCampo; uniform sampler2D uMasc;
uniform vec2 uTam; uniform ivec2 uGrade; uniform float uG; uniform vec3 uVista; uniform float uAltura;
uniform int uUsar; uniform float uMascA; uniform vec3 uMascCor; uniform float uMalha; uniform vec3 uMalhaCor;
out vec4 cor;
vec2 campo(vec2 p) {
    vec2 q = clamp(p / uG, vec2(0.), vec2(uGrade - 1));
    ivec2 a = ivec2(min(floor(q), vec2(uGrade - 2)));
    vec2 f = q - vec2(a);
    vec2 c00 = texelFetch(uCampo, a, 0).rg, c10 = texelFetch(uCampo, a + ivec2(1, 0), 0).rg;
    vec2 c01 = texelFetch(uCampo, a + ivec2(0, 1), 0).rg, c11 = texelFetch(uCampo, a + ivec2(1, 1), 0).rg;
    return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}
void main() {
    vec2 s = vec2(gl_FragCoord.x, uAltura - gl_FragCoord.y);
    vec2 p = (s - uVista.xy) / uVista.z;
    if (p.x < 0. || p.y < 0. || p.x > uTam.x || p.y > uTam.y) { cor = vec4(0.11, 0.11, 0.11, 1.); return; }
    vec2 o = p + (uUsar == 1 ? campo(p) : vec2(0.));
    vec4 c = (o.x < 0. || o.y < 0. || o.x > uTam.x || o.y > uTam.y) ? vec4(0.) : texture(uImg, o / uTam);
    vec2 ck = floor(s / 8.);
    vec3 rgb = mix(vec3(mod(ck.x + ck.y, 2.) < 1. ? .8 : 1.), c.rgb, c.a);
    if (uMascA > 0.) { float m = texture(uMasc, (p / uG + .5) / vec2(uGrade)).r; rgb = mix(rgb, uMascCor, m * uMascA); }
    if (uMalha > 0.) {
        vec2 q = o / uMalha, d = abs(fract(q - .5) - .5) / max(fwidth(q), vec2(1e-4));
        rgb = mix(rgb, uMalhaCor, (1. - min(min(d.x, d.y), 1.)) * .85);
    }
    cor = vec4(rgb, 1.);
}`;

// fonte = {c, x, y} (o plano que o filtro recebe); atual = vals de antes (editar filtro inteligente); doc → seleção
function ieDvJanela(fonte, atual, doc) {
    if (IE._auto) { const a = IE._auto; IE._auto = null; return Promise.resolve(a); }
    return new Promise(resolve => {
        const W = fonte.c.width, H = fonte.c.height;
        let G = ieDvDeVals(atual);
        G = G && G.w === W && G.h === H ? { ...G, d: G.d.slice(), m: new Float32Array(G.gw * G.gh) } : ieDvGrade(W, H);
        const op = Object.assign({ f: 'deformar', tam: Math.round(Math.max(20, Math.min(W, H) / 8)), dens: 50, pressao: 100, taxa: 80, bordas: true,
            malha: false, malhaTam: 'm', malhaCor: '#7f7f7f', verMasc: true, mascCor: '#ff3030', previa: true, reconstruir: 100 }, iePref('dissolver', {}));
        // seleção: o que está fora entra congelado (como no Photoshop)
        if (doc && doc.sel) {
            const sc = ieSelRegiao(doc, { x: fonte.x, y: fonte.y, w: W, h: H }), sd = ieCtx(sc).getImageData(0, 0, W, H).data;
            for (let j = 0; j < G.gh; j++) for (let i = 0; i < G.gw; i++) {
                const x = Math.min(W - 1, i * G.g), y = Math.min(H - 1, j * G.g);
                G.m[j * G.gw + i] = 1 - sd[(y * W + x) * 4 + 3] / 255;
            }
        }
        const sombra = { d: G.d.slice(), m: G.m.slice() }, desfazer = [], refazer = [];

        const ie = ieEl('ie'), box = document.createElement('div');
        box.className = 'ie-dv';
        const ico = (f) => { const d = IE_DV_FERR.find(x => x[0] === f); return d[3] ? `<svg class="ie-i" viewBox="0 0 24 24">${d[3]}</svg>` : ieIco(f === 'mao' ? 'hand' : 'zoom'); };
        const faixa = (id, rot, min, max) => `<label class="ie-dlg-faixa"><span>${ieT(rot)}</span><input type="range" data-op="${id}" min="${min}" max="${max}" value="${op[id]}"><input type="number" data-opn="${id}" min="${min}" max="${max}" value="${op[id]}"></label>`;
        box.innerHTML = `<div class="ie-dv-ferr">${IE_DV_FERR.map(([f, nome, t]) => `<button class="ie-ferr-btn" data-f="${f}" title="${ieEsc(ieT(nome))} (${t})">${ico(f)}</button>`).join('')}</div>
            <div class="ie-dv-vista"><canvas class="ie-dv-gl"></canvas><canvas class="ie-dv-sobre"></canvas>
                <div class="ie-dv-zoom"><button class="ie-ico-btn" data-z="-">−</button><span class="ie-dv-zv"></span><button class="ie-ico-btn" data-z="+">+</button><button class="ie-btn" data-z="ajustar">${ieT('Ajustar na tela')}</button></div></div>
            <div class="ie-dv-lado ie-dlg">
                <div class="ie-dv-topo"><h3>${ieT('Dissolver')}</h3><button class="ie-btn" data-r="0">${ieT('Cancelar')}</button><button class="ie-btn ie-btn-primario" data-r="1">${ieT('OK')}</button></div>
                <div class="ie-dv-corpo">
                    <div class="ie-dlg-tit">${ieT('Opções do pincel')}</div>
                    ${faixa('tam', 'Tamanho', 1, 3000)}${faixa('dens', 'Densidade', 0, 100)}${faixa('pressao', 'Pressão', 1, 100)}${faixa('taxa', 'Taxa', 0, 100)}
                    <label class="ie-dlg-chk"><input type="checkbox" data-op="bordas" ${op.bordas ? 'checked' : ''}> ${ieT('Fixar bordas')}</label>
                    <div class="ie-dlg-tit">${ieT('Reconstrução do pincel')}</div>
                    ${faixa('reconstruir', 'Quantidade', 0, 100)}
                    <div class="ie-dv-bts"><button class="ie-btn" data-acao="reconstruir">${ieT('Reconstruir')}</button><button class="ie-btn" data-acao="restaurar">${ieT('Restaurar tudo')}</button></div>
                    <div class="ie-dlg-tit">${ieT('Opções de máscara')}</div>
                    <div class="ie-dv-bts"><button class="ie-btn" data-acao="mNenhuma">${ieT('Nenhuma')}</button><button class="ie-btn" data-acao="mTudo">${ieT('Mascarar tudo')}</button><button class="ie-btn" data-acao="mInverter">${ieT('Inverter tudo')}</button></div>
                    <div class="ie-dlg-tit">${ieT('Opções de exibição')}</div>
                    <label class="ie-dlg-chk"><input type="checkbox" data-op="malha" ${op.malha ? 'checked' : ''}> ${ieT('Mostrar malha')}</label>
                    <label class="ie-dlg-lin"><span>${ieT('Tamanho da malha')}</span><select data-op="malhaTam">${[['p', 'Pequeno'], ['m', 'Médio'], ['g', 'Grande']].map(([v, r]) => `<option value="${v}" ${v === op.malhaTam ? 'selected' : ''}>${ieT(r)}</option>`).join('')}</select></label>
                    <label class="ie-dlg-chk"><input type="checkbox" data-op="verMasc" ${op.verMasc ? 'checked' : ''}> ${ieT('Mostrar máscara')}</label>
                    <label class="ie-dlg-chk"><input type="checkbox" data-op="previa" ${op.previa ? 'checked' : ''}> ${ieT('Visualizar')}</label>
                    <div class="ie-prop-nota">${ieT('[ e ] mudam o tamanho; Alt inverte a ferramenta; Ctrl+Z desfaz a última pincelada; espaço = Mão; Ctrl+espaço = Zoom.')}</div>
                </div></div>`;
        ie.appendChild(box);
        const vista = box.querySelector('.ie-dv-vista'), cv = box.querySelector('.ie-dv-gl'), sobre = box.querySelector('.ie-dv-sobre');
        const gl = cv.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
        if (!gl) { box.remove(); ieToast(ieT('Dissolver precisa de WebGL2')); resolve(null); return; }

        // ── GL ──
        const sh = (tipo, src) => { const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, IE_DV_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, IE_DV_FS)); gl.linkProgram(prog); gl.useProgram(prog);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
        const U = n => gl.getUniformLocation(prog, n);
        const tex = (un, filtro) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + un); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro === gl.NEAREST ? gl.NEAREST : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        tex(0, gl.LINEAR_MIPMAP_LINEAR);
        let img = fonte.c;
        const maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (Math.max(W, H) > maxT) { const k = maxT / Math.max(W, H); img = ieCanvas(Math.floor(W * k), Math.floor(H * k)); ieCtx(img).drawImage(fonte.c, 0, 0, img.width, img.height); }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
        tex(1, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, G.gw, G.gh, 0, gl.RG, gl.FLOAT, G.d);
        tex(2, gl.LINEAR);
        const m8 = new Uint8Array(G.gw * G.gh);
        const subirMasc = (j0, j1) => { for (let i = j0 * G.gw; i < (j1 + 1) * G.gw; i++) m8[i] = G.m[i] * 255; gl.activeTexture(gl.TEXTURE2); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, j0, G.gw, j1 - j0 + 1, gl.RED, gl.UNSIGNED_BYTE, m8.subarray(j0 * G.gw, (j1 + 1) * G.gw)); };
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, G.gw, G.gh, 0, gl.RED, gl.UNSIGNED_BYTE, m8);
        const subirCampo = (j0, j1) => { gl.activeTexture(gl.TEXTURE1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, j0, G.gw, j1 - j0 + 1, gl.RG, gl.FLOAT, G.d.subarray(j0 * G.gw * 2, (j1 + 1) * G.gw * 2)); };
        subirMasc(0, G.gh - 1);
        gl.uniform1i(U('uImg'), 0); gl.uniform1i(U('uCampo'), 1); gl.uniform1i(U('uMasc'), 2);
        gl.uniform2f(U('uTam'), W, H); gl.uniform2i(U('uGrade'), G.gw, G.gh); gl.uniform1f(U('uG'), G.g);
        const rgb = h => { const [r, g, b] = ieHexRgb(h); return [r / 255, g / 255, b / 255]; };

        // ── vista ──
        const V = { esc: 1, ox: 0, oy: 0, dpr: 1 };
        const ajustar = () => {
            const k = Math.min((cv.width - 40 * V.dpr) / W, (cv.height - 40 * V.dpr) / H);
            V.esc = Math.max(0.01, Math.min(k, 1 * V.dpr * 4)); V.ox = (cv.width - W * V.esc) / 2; V.oy = (cv.height - H * V.esc) / 2;
        };
        const tamanho = () => {
            V.dpr = window.devicePixelRatio || 1;
            const w = Math.max(1, Math.round(vista.clientWidth * V.dpr)), h = Math.max(1, Math.round(vista.clientHeight * V.dpr));
            for (const c of [cv, sobre]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        };
        let quadro = 0;
        const desenhar = () => {
            if (quadro) return;
            quadro = requestAnimationFrame(() => {
                quadro = 0;
                gl.viewport(0, 0, cv.width, cv.height);
                gl.uniform3f(U('uVista'), V.ox, V.oy, V.esc); gl.uniform1f(U('uAltura'), cv.height);
                gl.uniform1i(U('uUsar'), op.previa ? 1 : 0);
                gl.uniform1f(U('uMascA'), op.verMasc ? 0.5 : 0); gl.uniform3f(U('uMascCor'), ...rgb(op.mascCor));
                const passoMalha = { p: 16, m: 32, g: 64 }[op.malhaTam] * Math.max(1, Math.max(W, H) / 1500);
                gl.uniform1f(U('uMalha'), op.malha ? passoMalha : 0); gl.uniform3f(U('uMalhaCor'), ...rgb(op.malhaCor));
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                box.querySelector('.ie-dv-zv').textContent = Math.round(V.esc / V.dpr * 100) + '%';
                desenharCursor();
            });
        };
        let mouse = null;
        const desenharCursor = () => {
            const x = ieCtx(sobre);
            x.clearRect(0, 0, sobre.width, sobre.height);
            if (!mouse || ferr() === 'mao' || ferr() === 'zoom') return;
            const r = op.tam / 2 * V.esc;
            x.lineWidth = V.dpr;
            for (const [cor, rr] of [['rgba(0,0,0,.6)', r + V.dpr], ['rgba(255,255,255,.9)', r]]) { x.strokeStyle = cor; x.beginPath(); x.arc(mouse.sx, mouse.sy, Math.max(1, rr), 0, Math.PI * 2); x.stroke(); }
            const miolo = r * op.dens / 100 * 0.85;
            if (miolo > 2) { x.setLineDash([3 * V.dpr, 3 * V.dpr]); x.strokeStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.arc(mouse.sx, mouse.sy, miolo, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); }
        };
        const zoomEm = (k, sx, sy) => {
            const e = ieClamp(V.esc * k, 0.02 * V.dpr, 32 * V.dpr), px = (sx - V.ox) / V.esc, py = (sy - V.oy) / V.esc;
            V.esc = e; V.ox = sx - px * e; V.oy = sy - py * e; desenhar();
        };

        // ── ferramentas e pinceladas ──
        let ferrSel = op.f, temp = null;
        const ferr = () => temp || ferrSel;
        const marcar = () => box.querySelectorAll('.ie-dv-ferr [data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === ferr()));
        const cursorCss = () => { const f = ferr(); sobre.style.cursor = f === 'mao' ? (arr && arr.tipo === 'mao' ? 'grabbing' : 'grab') : f === 'zoom' ? 'zoom-in' : 'none'; };
        const escolher = f => { ferrSel = f; if (f !== 'mao' && f !== 'zoom') op.f = f; marcar(); cursorCss(); desenhar(); };
        let arr = null, sujo = null;
        const sujar = r => { if (!r) return; sujo = sujo ? [Math.min(sujo[0], r[0]), Math.max(sujo[1], r[1])] : [...r]; };
        const pos = ev => { const b = sobre.getBoundingClientRect(), sx = (ev.clientX - b.left) * V.dpr, sy = (ev.clientY - b.top) * V.dpr; return { sx, sy, x: (sx - V.ox) / V.esc, y: (sy - V.oy) / V.esc }; };
        const dab = (f, x, y, v, alt) => {
            const r = ieDvPincel(G, f, x, y, op.tam / 2, op, v, alt);
            if (r) { (f === 'congelar' || f === 'descongelar' ? subirMasc : subirCampo)(r[0], r[1]); if (f !== 'congelar' && f !== 'descongelar' && G.m) { /* nada */ } sujar(r); }
        };
        const fecharTraco = nome => {   // passo de desfazer = as linhas mexidas, como estavam antes
            if (!sujo) return;
            const [j0, j1] = sujo, a = j0 * G.gw, b = (j1 + 1) * G.gw;
            desfazer.push({ j0, j1, d: sombra.d.slice(a * 2, b * 2), m: sombra.m.slice(a, b), nome });
            if (desfazer.length > 40) desfazer.shift();
            refazer.length = 0;
            sombra.d.set(G.d.subarray(a * 2, b * 2), a * 2); sombra.m.set(G.m.subarray(a, b), a);
            sujo = null;
        };
        const trocar = (de, para) => {   // desfazer/refazer: troca as linhas guardadas com as atuais
            const e = de.pop();
            if (!e) return;
            const a = e.j0 * G.gw, b = (e.j1 + 1) * G.gw, d = G.d.slice(a * 2, b * 2), m = G.m.slice(a, b);
            G.d.set(e.d, a * 2); G.m.set(e.m, a); sombra.d.set(e.d, a * 2); sombra.m.set(e.m, a);
            para.push({ ...e, d, m });
            subirCampo(e.j0, e.j1); subirMasc(e.j0, e.j1); desenhar();
        };
        const tudo = (fn, nome) => { sujo = [0, G.gh - 1]; fn(); fecharTraco(nome); subirCampo(0, G.gh - 1); subirMasc(0, G.gh - 1); desenhar(); };

        let laco = 0;
        const continuo = () => {   // Torcer, Comprimir, Inchar, Reconstruir...: agem enquanto o botão está apertado, mesmo parado
            laco = 0;
            if (!arr || arr.tipo !== 'pincel' || !IE_DV_CONTINUAS[arr.f]) return;
            dab(arr.f, arr.x, arr.y, null, arr.alt);
            desenhar();
            laco = requestAnimationFrame(continuo);
        };
        sobre.addEventListener('pointerdown', ev => {
            if (ev.button !== 0 && ev.button !== 1) return;
            sobre.setPointerCapture(ev.pointerId);
            const p = pos(ev), f = ev.button === 1 ? 'mao' : ferr();
            if (f === 'mao') { arr = { tipo: 'mao', sx: p.sx, sy: p.sy, ox: V.ox, oy: V.oy }; cursorCss(); return; }
            if (f === 'zoom') { zoomEm(ev.altKey ? 1 / 1.5 : 1.5, p.sx, p.sy); return; }
            arr = { tipo: 'pincel', f, x: p.x, y: p.y, alt: ev.altKey };
            if (IE_DV_CONTINUAS[f]) continuo();
        });
        sobre.addEventListener('pointermove', ev => {
            const p = pos(ev);
            mouse = p;
            if (!arr) { desenhar(); return; }
            if (arr.tipo === 'mao') { V.ox = arr.ox + p.sx - arr.sx; V.oy = arr.oy + p.sy - arr.sy; desenhar(); return; }
            arr.alt = ev.altKey;
            if (IE_DV_CONTINUAS[arr.f]) { arr.x = p.x; arr.y = p.y; desenhar(); return; }
            const R = op.tam / 2, dx = p.x - arr.x, dy = p.y - arr.y, dist = Math.hypot(dx, dy), n = Math.ceil(dist / Math.max(0.5, R * 0.2));
            if (!n) return;
            for (let s = 1; s <= n; s++) {
                let v = [dx / n, dy / n];
                if (arr.f === 'esquerda') v = ieDvEsquerda(v, op.pressao, ev.altKey);
                dab(arr.f, arr.x + dx * s / n, arr.y + dy * s / n, v, ev.altKey);
            }
            arr.x = p.x; arr.y = p.y;
            desenhar();
        });
        const soltar = () => {
            if (!arr) return;
            if (arr.tipo === 'pincel') { cancelAnimationFrame(laco); laco = 0; fecharTraco(arr.f); }
            arr = null; cursorCss();
        };
        sobre.addEventListener('pointerup', soltar);
        sobre.addEventListener('pointercancel', soltar);
        sobre.addEventListener('pointerleave', () => { mouse = null; desenhar(); });
        sobre.addEventListener('wheel', ev => {
            ev.preventDefault();
            const p = pos(ev);
            if (ev.ctrlKey || ev.altKey) zoomEm(ev.deltaY < 0 ? 1.15 : 1 / 1.15, p.sx, p.sy);
            else { V.ox -= (ev.shiftKey ? ev.deltaY : ev.deltaX) * V.dpr; V.oy -= (ev.shiftKey ? 0 : ev.deltaY) * V.dpr; desenhar(); }
        }, { passive: false });
        sobre.addEventListener('contextmenu', ev => ev.preventDefault());

        // ── painel ──
        box.querySelectorAll('.ie-dv-ferr [data-f]').forEach(b => { b.onclick = () => escolher(b.dataset.f); });
        const ligarOp = el => {
            const id = el.dataset.op;
            el.addEventListener('input', () => {
                op[id] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
                const n = box.querySelector(`[data-opn="${id}"]`); if (n) n.value = el.value;
                desenhar();
            });
        };
        box.querySelectorAll('[data-op]').forEach(ligarOp);
        box.querySelectorAll('[data-opn]').forEach(el => el.addEventListener('input', () => {
            const id = el.dataset.opn, r = box.querySelector(`[data-op="${id}"]`), v = parseFloat(el.value);
            if (!isFinite(v)) return; op[id] = v; r.value = v; desenhar();
        }));
        const setTam = v => { op.tam = Math.round(ieClamp(v, 1, 3000)); box.querySelector('[data-op="tam"]').value = op.tam; box.querySelector('[data-opn="tam"]').value = op.tam; desenhar(); };
        box.querySelectorAll('[data-acao]').forEach(b => {
            b.onclick = () => ({
                reconstruir: () => tudo(() => { const k = op.reconstruir / 100; for (let n = 0; n < G.gw * G.gh; n++) { const w = k * (1 - G.m[n]); G.d[n * 2] *= 1 - w; G.d[n * 2 + 1] *= 1 - w; } }, 'reconstruir'),
                restaurar: () => tudo(() => G.d.fill(0), 'restaurar'),
                mNenhuma: () => tudo(() => G.m.fill(0), 'mascara'),
                mTudo: () => tudo(() => G.m.fill(1), 'mascara'),
                mInverter: () => tudo(() => { for (let n = 0; n < G.m.length; n++) G.m[n] = 1 - G.m[n]; }, 'mascara'),
            })[b.dataset.acao]();
        });
        box.querySelectorAll('[data-z]').forEach(b => {
            b.onclick = () => { const z = b.dataset.z; if (z === 'ajustar') { ajustar(); desenhar(); } else zoomEm(z === '+' ? 1.5 : 1 / 1.5, cv.width / 2, cv.height / 2); };
        });

        // ── teclado (a janela é modal: nada vaza para o editor) ──
        const teclas = Object.fromEntries(IE_DV_FERR.map(([f, , t]) => [t, f]));
        const tecla = ev => {
            const emCampo = /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName) && ev.target.type !== 'checkbox' && ev.target.type !== 'range';
            if (ev.type === 'keyup') {
                ev.stopImmediatePropagation();
                if (ev.code === 'Space' && temp) { temp = null; marcar(); cursorCss(); desenhar(); }
                return;
            }
            ev.stopImmediatePropagation();
            if (ev.key === 'Escape') { ev.preventDefault(); fim(null); return; }
            if (ev.key === 'Enter') { ev.preventDefault(); fim(true); return; }
            if (emCampo) return;
            const k = ev.key.toLowerCase();
            if (ev.ctrlKey && k === 'z') { ev.preventDefault(); if (ev.shiftKey || ev.altKey) trocar(refazer, desfazer); else trocar(desfazer, refazer); return; }
            if (ev.ctrlKey && (k === '+' || k === '=')) { ev.preventDefault(); zoomEm(1.5, cv.width / 2, cv.height / 2); return; }
            if (ev.ctrlKey && k === '-') { ev.preventDefault(); zoomEm(1 / 1.5, cv.width / 2, cv.height / 2); return; }
            if (ev.ctrlKey && k === '0') { ev.preventDefault(); ajustar(); desenhar(); return; }
            if (ev.code === 'Space') { ev.preventDefault(); if (!temp) { temp = ev.ctrlKey ? 'zoom' : 'mao'; marcar(); cursorCss(); desenhar(); } return; }
            if (ev.key === '[' || ev.key === ']') { ev.preventDefault(); const p = op.tam < 10 ? 1 : op.tam < 100 ? 10 : op.tam < 300 ? 25 : 50; setTam(op.tam + (ev.key === ']' ? p : -p)); return; }
            if (!ev.ctrlKey && !ev.altKey && teclas[ev.key.toUpperCase()]) { ev.preventDefault(); escolher(teclas[ev.key.toUpperCase()]); }
        };
        window.addEventListener('keydown', tecla, true);   // window: antes dos atalhos do editor (document)
        window.addEventListener('keyup', tecla, true);
        const ro = new ResizeObserver(() => { tamanho(); desenhar(); });
        ro.observe(vista);

        const fim = ok => {
            if (arr) soltar();
            cancelAnimationFrame(quadro); cancelAnimationFrame(laco);
            window.removeEventListener('keydown', tecla, true); window.removeEventListener('keyup', tecla, true);
            ro.disconnect();
            try { iePrefGravar('dissolver', { f: op.f, tam: op.tam, dens: op.dens, pressao: op.pressao, taxa: op.taxa, bordas: op.bordas, malha: op.malha, malhaTam: op.malhaTam, verMasc: op.verMasc, reconstruir: op.reconstruir }); } catch (e) { /* preferência é conveniência */ }
            gl.getExtension('WEBGL_lose_context')?.loseContext();
            box.remove();
            resolve(ok ? ieDvVals(G) : null);
        };
        box.querySelector('[data-r="0"]').onclick = () => fim(null);
        box.querySelector('[data-r="1"]').onclick = () => fim(true);
        IE._dv = { G, op, V, fim, escolher, dab, desenhar, fecharTraco, pos: (x, y) => ({ sx: V.ox + x * V.esc, sy: V.oy + y * V.esc }) };   // testes (modo agente)

        tamanho(); ajustar(); escolher(ferrSel); desenhar();
    }).finally(() => { IE._dv = null; });
}

IE_FILTROS.dissolver = () => ieAplicarComDialogo({
    titulo: 'Dissolver',
    janela: ieDvJanela,
    proc: v => ieDvProc(v),
    margem: () => 1e5,   // a camada pode ser empurrada para a área vazia do documento
});
