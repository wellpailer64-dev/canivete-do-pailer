// =========================================================
// Editor de Imagem — efeitos de camada (Estilo de camada do Photoshop): modelo e desenho.
//
// L.fx = { <tipo>: [instância, ...], outros: [nomes que o editor não desenha], ... }   (todos com {on, ...})
//   chanfro (Chanfro e entalhe, com contorno e textura), tracado (+), sombraInt (+), brilhoInt, acetinado,
//   corSob (+), degSob (+), padraoSob, brilho, sombra (+).   (+) = o Photoshop deixa ter várias.
// Ordem de desenho (de baixo para cima) = a lista do diálogo de baixo para cima: sombra, brilho externo, [conteúdo
// com o Preenchimento], padrão, degradê, cor, acetinado, brilho interno, sombra interna, traçado, chanfro.
// Sombra e brilho externo saem como "ext" (desenhados antes da camada, cada um com o seu modo de mesclagem, por cima
// do que está embaixo); a parte de fora do chanfro externo/entalhe sai como "acima". O resto fica no canvas da camada.
// Opções de mesclagem avançadas ficam na própria camada (L.canais, L.vazamento, L.mescSe, L.misturaInterior,
// L.misturaCorte, L.mascaraOcultaFx...) e são aplicadas na composição (imagem-nucleo.js).
// =========================================================

const IE_FX_TIPOS = [   // [chave, nome, várias instâncias?] na ordem do diálogo
    ['chanfro', 'Chanfro e entalhe', false], ['tracado', 'Traçado', true], ['sombraInt', 'Sombra interna', true],
    ['brilhoInt', 'Brilho interno', false], ['acetinado', 'Acetinado', false], ['corSob', 'Sobreposição de cor', true],
    ['degSob', 'Sobreposição de degradê', true], ['padraoSob', 'Sobreposição de padrão', false], ['brilho', 'Brilho externo', false],
    ['sombra', 'Sombra projetada', true],
];
const IE_FX_NOME = Object.fromEntries(IE_FX_TIPOS.map(([k, n]) => [k, n]));
// opções de mesclagem avançadas guardadas na camada (vão e voltam do PSD: Functions/editor_imagem.py _ler_mescla)
const IE_MESCLA_CHAVES = ['vazamento', 'misturaInterior', 'misturaCorte', 'formaTransp', 'mascaraOcultaFx', 'vetorOcultaFx', 'canais', 'mescSe'];

const IE_GRAD_PADRAO = () => ({ cores: [[0, '#000000'], [1, '#ffffff']], ops: [[0, 100], [1, 100]] });
// padrões do Photoshop para cada efeito novo
const IE_FX_PADRAO = {
    chanfro: () => ({ estilo: 'interno', tecnica: 'suave', prof: 100, dir: 'cima', tam: 5, suav: 0, ang: 120, alt: 30, global: true,
        hBm: 'SCREEN', hCor: '#ffffff', hOp: 50, sBm: 'MULTIPLY', sCor: '#000000', sOp: 50,
        contorno: { on: false, forma: 'linear', intervalo: 50 }, textura: { on: false, padrao: 'xadrez', escala: 100, prof: 100, inverter: false } }),
    tracado: () => ({ tam: 3, pos: 'fora', bm: 'NORMAL', op: 100, tipo: 'cor', cor: '#000000', grad: IE_GRAD_PADRAO(), estilo: 'linear', ang: 90, escala: 100, inverter: false }),
    sombraInt: () => ({ bm: 'MULTIPLY', cor: '#000000', op: 35, ang: 120, global: true, dist: 5, choke: 0, tam: 5 }),
    brilhoInt: () => ({ bm: 'SCREEN', cor: '#ffffbe', op: 75, choke: 0, tam: 5, fonte: 'borda', tecnica: 'suave' }),
    acetinado: () => ({ bm: 'MULTIPLY', cor: '#000000', op: 50, ang: 19, dist: 11, tam: 14, inverter: true }),
    corSob: () => ({ bm: 'NORMAL', cor: '#ff0000', op: 100 }),
    degSob: () => ({ bm: 'NORMAL', op: 100, grad: IE_GRAD_PADRAO(), estilo: 'linear', ang: 90, escala: 100, inverter: false, alinhar: true, ofx: 0, ofy: 0 }),
    padraoSob: () => ({ bm: 'NORMAL', op: 100, padrao: 'xadrez', escala: 100 }),
    brilho: () => ({ bm: 'SCREEN', cor: '#ffffbe', op: 75, spread: 0, tam: 5, tecnica: 'suave' }),
    sombra: () => ({ bm: 'MULTIPLY', cor: '#000000', op: 35, ang: 120, global: true, dist: 5, spread: 0, tam: 5, ocultar: true }),
};
// padrões salvos pelo usuário ("Tornar padrão" no diálogo) por cima dos do Photoshop
function ieFxNovo(tipo) {
    const u = (iePref('fxPadrao', {}) || {})[tipo];
    return { on: true, ...IE_FX_PADRAO[tipo](), ...(u ? JSON.parse(JSON.stringify(u)) : {}) };
}

// formato antigo ({sombra: {...}, brilho: {...}, contorno: {...}, sobreposicao: {...}}) → listas
function ieFxNorm(fx) {
    if (!fx) return null;
    if (fx._v2) return fx;
    const n = { _v2: true };
    for (const [k] of IE_FX_TIPOS) {
        const v = fx[k];
        if (Array.isArray(v)) n[k] = v.map(e => ({ on: true, ...IE_FX_PADRAO[k](), ...e }));
    }
    const um = (k, v, conv) => { if (v && !Array.isArray(v)) n[k] = [{ on: true, ...IE_FX_PADRAO[k](), ...conv(v) }]; };
    um('sombra', fx.sombra, v => ({ cor: v.cor, op: v.op ?? 75, ang: v.ang ?? 120, dist: v.dist || 0, tam: v.tam || 0, global: false, bm: v.bm || 'MULTIPLY' }));
    um('brilho', fx.brilho, v => ({ cor: v.cor, op: v.op ?? 75, tam: v.tam || 0, bm: v.bm || 'SCREEN' }));
    um('tracado', fx.contorno, v => ({ cor: v.cor, op: v.op ?? 100, tam: v.larg || 3, pos: String(v.pos || '').includes('inside') ? 'dentro' : String(v.pos || '').includes('center') ? 'centro' : 'fora' }));
    um('corSob', fx.sobreposicao, v => ({ cor: v.cor, op: v.op ?? 100 }));
    if (fx.outros && fx.outros.length) n.outros = [...fx.outros];
    return n;
}

function ieTemFx(fx) {
    fx = ieFxNorm(fx);
    return !!fx && IE_FX_TIPOS.some(([k]) => (fx[k] || []).some(e => e.on));
}
function ieFxLista(fx) {   // [{tipo, i, e}] na ordem do diálogo
    fx = ieFxNorm(fx);
    const out = [];
    if (fx) for (const [k] of IE_FX_TIPOS) (fx[k] || []).forEach((e, i) => out.push({ tipo: k, i, e }));
    return out;
}

// ─────────────────────────── padrões (Sobreposição de padrão e Textura) ───────────────────────────
const IE_PADROES = {
    xadrez: ['Xadrez', (x, t) => { x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, t, t); x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, t / 2, t / 2); x.fillRect(t / 2, t / 2, t / 2, t / 2); }],
    listras: ['Listras', (x, t) => { x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, t, t); x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, t, t / 4); x.fillRect(0, t / 2, t, t / 4); }],
    diagonais: ['Diagonais', (x, t) => { x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, t, t); x.strokeStyle = '#606060'; x.lineWidth = t / 6; x.beginPath(); for (let k = -t; k <= 2 * t; k += t / 2) { x.moveTo(k, 0); x.lineTo(k + t, t); } x.stroke(); }],
    pontos: ['Pontos', (x, t) => { x.fillStyle = '#e0e0e0'; x.fillRect(0, 0, t, t); x.fillStyle = '#555'; for (const [a, b] of [[.25, .25], [.75, .75]]) { x.beginPath(); x.arc(a * t, b * t, t / 8, 0, Math.PI * 2); x.fill(); } }],
    grade: ['Grade', (x, t) => { x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, t, t); x.strokeStyle = '#707070'; x.lineWidth = 2; x.strokeRect(1, 1, t - 2, t - 2); }],
    ruido: ['Ruído', (x, t) => { const im = x.createImageData(t, t); let s = 7; for (let i = 0; i < im.data.length; i += 4) { s = (s * 16807) % 2147483647; const v = 90 + (s % 120); im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } x.putImageData(im, 0, 0); }],
    tijolos: ['Tijolos', (x, t) => { x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, t, t); x.fillStyle = '#d4d4d4'; const h = t / 2; for (let r = 0; r < 2; r++) for (let c = -1; c < 2; c++) x.fillRect(c * t / 2 + (r % 2 ? t / 4 : 0) + 1, r * h + 1, t / 2 - 2, h - 2); }],
    ondas: ['Ondas', (x, t) => { const im = x.createImageData(t, t); for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) { const v = 128 + 90 * Math.sin((i + Math.sin(j / t * Math.PI * 2) * t / 6) / t * Math.PI * 4); const k = (j * t + i) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = v; im.data[k + 3] = 255; } x.putImageData(im, 0, 0); }],
};
const iePadraoCache = {};
function iePadraoCanvas(nome) {
    if (iePadraoCache[nome]) return iePadraoCache[nome];
    const t = 64, c = ieCanvas(t, t);
    (IE_PADROES[nome] || IE_PADROES.xadrez)[1](ieCtx(c), t);
    return (iePadraoCache[nome] = c);
}

// contornos (Chanfro > Contorno): perfil da altura
const IE_CONTORNOS = {
    linear: ['Linear', t => t], cone: ['Cone', t => (t < 0.5 ? 2 * t : 2 - 2 * t)], coneInv: ['Cone invertido', t => 1 - (t < 0.5 ? 2 * t : 2 - 2 * t)],
    concavo: ['Côncavo fundo', t => t * t], gauss: ['Gaussiano', t => t * t * (3 - 2 * t)], meiaLua: ['Meio círculo', t => Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)))],
    anel: ['Anel', t => Math.sin(t * Math.PI)], ondas: ['Ondulado', t => 0.5 - 0.5 * Math.cos(t * Math.PI * 4)], degrau: ['Degrau', t => (t < 0.5 ? 0.15 : 0.85) + (t - 0.5) * 0.1],
};

// degradês prontos (o primeiro usa as cores de frente e fundo)
const IE_GRADS = () => [
    { nome: 'Frente para fundo', cores: [[0, IE.cor[0]], [1, IE.cor[1]]], ops: [[0, 100], [1, 100]] },
    { nome: 'Frente para transparente', cores: [[0, IE.cor[0]], [1, IE.cor[0]]], ops: [[0, 100], [1, 0]] },
    { nome: 'Preto, branco', cores: [[0, '#000000'], [1, '#ffffff']], ops: [[0, 100], [1, 100]] },
    { nome: 'Cromado', cores: [[0, '#2a3d6b'], [0.48, '#e8f1ff'], [0.5, '#4a3b24'], [1, '#f4e3b8']], ops: [[0, 100], [1, 100]] },
    { nome: 'Pôr do sol', cores: [[0, '#2b1055'], [0.5, '#d7263d'], [1, '#f9c80e']], ops: [[0, 100], [1, 100]] },
    { nome: 'Arco-íris', cores: [[0, '#ff0000'], [0.17, '#ffff00'], [0.33, '#00ff00'], [0.5, '#00ffff'], [0.67, '#0000ff'], [0.83, '#ff00ff'], [1, '#ff0000']], ops: [[0, 100], [1, 100]] },
    { nome: 'Dourado', cores: [[0, '#7a4f12'], [0.35, '#f5d77a'], [0.6, '#a8741a'], [1, '#fff1b8']], ops: [[0, 100], [1, 100]] },
    { nome: 'Azul neon', cores: [[0, '#00e5ff'], [1, '#7a00ff']], ops: [[0, 100], [1, 100]] },
];

// ─────────────────────────── utilidades de canvas ───────────────────────────
function ieFxCv(w, h) { return ieCanvas(w, h); }
function ieFxBlur(c, sigma) {
    if (!(sigma > 0.05)) return c;
    const n = ieFxCv(c.width, c.height), x = ieCtx(n);
    x.filter = `blur(${sigma}px)`;
    x.drawImage(c, 0, 0);
    return n;
}
function ieFxCor(a, cor, op = 1) {   // silhueta colorida
    const n = ieFxCv(a.width, a.height), x = ieCtx(n);
    x.drawImage(a, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.globalAlpha = op;
    x.fillStyle = cor;
    x.fillRect(0, 0, n.width, n.height);
    return n;
}
function ieFxDilatar(a, r) {
    if (!(r > 0.3)) return a;
    const n = ieFxCv(a.width, a.height), x = ieCtx(n);
    x.drawImage(a, 0, 0);
    const passo = Math.max(1, r / 3);
    for (let raio = r; raio > 0.3; raio -= passo) {
        const k = Math.max(8, Math.ceil(2 * Math.PI * raio / 1.5));
        for (let i = 0; i < k; i++) { const t = i / k * Math.PI * 2; x.drawImage(a, Math.cos(t) * raio, Math.sin(t) * raio); }
    }
    return n;
}
function ieFxInverter(a) {
    const n = ieFxCv(a.width, a.height), x = ieCtx(n);
    x.fillStyle = '#fff'; x.fillRect(0, 0, n.width, n.height);
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(a, 0, 0);
    return n;
}
function ieFxErodir(a, r) {
    if (!(r > 0.3)) return a;
    const fora = ieFxDilatar(ieFxInverter(a), r);
    const n = ieFxCv(a.width, a.height), x = ieCtx(n);
    x.drawImage(a, 0, 0);
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(fora, 0, 0);
    return n;
}
function ieFxMenos(a, b) { const n = ieFxCv(a.width, a.height), x = ieCtx(n); x.drawImage(a, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(b, 0, 0); return n; }
function ieFxDentro(a, mascara) { const n = ieFxCv(a.width, a.height), x = ieCtx(n); x.drawImage(a, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(mascara, 0, 0); return n; }
function ieFxDesloc(a, dx, dy) { const n = ieFxCv(a.width, a.height); ieCtx(n).drawImage(a, dx, dy); return n; }
function ieFxAng(e, doc) { return ((e.global && doc && doc.luzGlobal ? doc.luzGlobal.ang : e.ang) ?? 120) * Math.PI / 180; }

// degradê (estilo linear/radial/angular/refletido/diamante) num retângulo B, num canvas W×H
function ieFxDegrade(W, H, B, g, estilo, angGraus, escala = 100, inverter = false, ofx = 0, ofy = 0) {
    const c = ieFxCv(W, H), x = ieCtx(c);
    const cx = B.x + B.w / 2 + ofx / 100 * B.w, cy = B.y + B.h / 2 + ofy / 100 * B.h;
    const a = angGraus * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a);
    // meio comprimento = metade da corda da caixa pelo centro na direção do ângulo (o menor entre L/|cos| e A/|sen|),
    // como o Photoshop (medido 2026-10-07: linear 30° num 600×400 = 346,4; em 0° e 90° dá o mesmo que antes)
    const meio = Math.min(Math.abs(ux) > 1e-6 ? B.w / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? B.h / Math.abs(uy) : Infinity) / 2 * escala / 100 || 1;
    let cores = g.cores.map(([p, cor]) => [inverter ? 1 - p : p, cor]).sort((p, q) => p[0] - q[0]);
    let ops = (g.ops || [[0, 100], [1, 100]]).map(([p, o]) => [inverter ? 1 - p : p, o]).sort((p, q) => p[0] - q[0]);
    const amostra = t => {   // cor (rgba) no ponto t (0..1), juntando paradas de cor e de opacidade
        const lerp = (l, f) => { if (t <= l[0][0]) return f(l[0][1], l[0][1], 0); for (let i = 1; i < l.length; i++) if (t <= l[i][0]) { const k = (t - l[i - 1][0]) / ((l[i][0] - l[i - 1][0]) || 1); return f(l[i - 1][1], l[i][1], k); } return f(l[l.length - 1][1], l[l.length - 1][1], 0); };
        const rgb = lerp(cores, (p, q, k) => { const A = ieHexRgb(p), Bc = ieHexRgb(q); return A.map((v, i) => v + (Bc[i] - v) * k); });
        const o = lerp(ops, (p, q, k) => p + (q - p) * k);
        return `rgba(${rgb.map(Math.round).join(',')},${o / 100})`;
    };
    const pontos = [...new Set([...cores.map(p => p[0]), ...ops.map(p => p[0]), 0, 0.25, 0.5, 0.75, 1])].sort((p, q) => p - q);
    const comParadas = (gr, f = t => t) => { for (const t of pontos) gr.addColorStop(f(t), amostra(t)); return gr; };
    if (estilo === 'radial') {
        // raio = metade do lado MENOR, como o Photoshop (medido nele em 2026-10-07: preenchimento e Sobreposição de
        // degradê radial num 600×400 ficam com raio 200; antes o editor usava o lado maior)
        const r = Math.min(B.w, B.h) / 2 * escala / 100 || 1;
        x.fillStyle = comParadas(x.createRadialGradient(cx, cy, 0, cx, cy, r));
    } else if (estilo === 'angulo') {
        const gr = x.createConicGradient(-a, cx, cy);
        x.fillStyle = comParadas(gr);
    } else if (estilo === 'refletido') {
        const gr = x.createLinearGradient(cx - ux * meio, cy - uy * meio, cx + ux * meio, cy + uy * meio);
        for (const t of pontos) { const s = amostra(t); gr.addColorStop(0.5 + t / 2, s); gr.addColorStop(0.5 - t / 2, s); }
        x.fillStyle = gr;
    } else if (estilo === 'diamante') {
        const img = x.createImageData(W, H), d = img.data, tab = [];
        for (let i = 0; i <= 255; i++) { const s = amostra(i / 255).match(/[\d.]+/g).map(Number); tab.push(s); }
        const vx = -uy, vy = ux, r = Math.max(B.w, B.h) / 2 * escala / 100 || 1;   // diamante: lado MAIOR (medido no Photoshop)
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const px = i + 0.5 - cx, py = j + 0.5 - cy;
            const t = Math.min(1, (Math.abs(px * ux + py * uy) + Math.abs(px * vx + py * vy)) / r);
            const s = tab[Math.round(t * 255)], k = (j * W + i) * 4;
            d[k] = s[0]; d[k + 1] = s[1]; d[k + 2] = s[2]; d[k + 3] = s[3] * 255;
        }
        x.putImageData(img, 0, 0);
        return c;
    } else {
        x.fillStyle = comParadas(x.createLinearGradient(cx - ux * meio, cy - uy * meio, cx + ux * meio, cy + uy * meio));
    }
    x.fillRect(0, 0, W, H);
    return c;
}

// ─────────────────────────── chanfro e entalhe (mapa de altura → luz e sombra) ───────────────────────────
function ieFxDistancias(alfa, W, H) {   // distância (chanfro 3-4) até o lado oposto: dentro e fora
    const INF = 1e9, din = new Float32Array(W * H), dout = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { const dentro = alfa[i] >= 128; din[i] = dentro ? INF : 0; dout[i] = dentro ? 0 : INF; }
    const passar = d => {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x; let v = d[i];
            if (x > 0) v = Math.min(v, d[i - 1] + 1);
            if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + 1.4142); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 1.4142); }
            d[i] = v;
        }
        for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
            const i = y * W + x; let v = d[i];
            if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
            if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 1.4142); if (x > 0) v = Math.min(v, d[i + W - 1] + 1.4142); }
            d[i] = v;
        }
    };
    passar(din); passar(dout);
    return { din, dout };
}

function ieFxChanfro(A, e, doc) {
    const W = A.width, H = A.height, tam = Math.max(1, e.tam);
    const alfa = new Uint8ClampedArray(W * H);
    { const d = ieCtx(A).getImageData(0, 0, W, H).data; for (let i = 0; i < W * H; i++) alfa[i] = d[i * 4 + 3]; }
    const { din, dout } = ieFxDistancias(alfa, W, H);
    const estilo = e.estilo || 'interno', tec = e.tecnica || 'suave';
    const forma = (IE_CONTORNOS[(e.contorno && e.contorno.on && e.contorno.forma) || 'linear'] || IE_CONTORNOS.linear)[1];
    const faixa = e.contorno && e.contorno.on ? Math.max(1, e.contorno.intervalo || 50) / 50 : 1;
    const perfil = t => { t = ieClamp(t * faixa, 0, 1); if (tec === 'suave') t = t * t * (3 - 2 * t); return forma(t); };
    const Hm = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
        const dentro = alfa[i] >= 128;
        if (estilo === 'externo') Hm[i] = dentro ? 1 : 1 - perfil(Math.min(1, dout[i] / tam));
        else if (estilo === 'entalhe' || estilo === 'traco') Hm[i] = dentro ? 0.5 + 0.5 * perfil(Math.min(1, din[i] / (tam / 2))) : 0.5 - 0.5 * perfil(Math.min(1, dout[i] / (tam / 2)));
        else if (estilo === 'almofada') Hm[i] = dentro ? perfil(Math.min(1, din[i] / tam)) : perfil(Math.min(1, dout[i] / tam));
        else Hm[i] = dentro ? perfil(Math.min(1, din[i] / tam)) : 0;
    }
    // textura: o padrão em tons de cinza mexe na altura
    if (e.textura && e.textura.on) {
        const pc = iePadraoCanvas(e.textura.padrao), pd = ieCtx(pc).getImageData(0, 0, pc.width, pc.height).data;
        const k = (e.textura.escala || 100) / 100, prof = (e.textura.prof ?? 100) / 100 * (e.textura.inverter ? -1 : 1) * 0.35;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (alfa[i] < 8) continue;
            const px = Math.floor(x / k) % pc.width, py = Math.floor(y / k) % pc.height;
            Hm[i] += prof * (pd[(py * pc.width + px) * 4] / 255 - 0.5);
        }
    }
    if (tec === 'suave') {   // alisa o mapa de altura (técnica Suave)
        const t = ieFxCv(W, H), tx = ieCtx(t), img = tx.createImageData(W, H);
        for (let i = 0; i < W * H; i++) { const v = ieClamp(Hm[i], 0, 1) * 255; img.data[i * 4] = v; img.data[i * 4 + 3] = 255; }
        tx.putImageData(img, 0, 0);
        const b = ieCtx(ieFxBlur(t, Math.max(0.6, tam / 6))).getImageData(0, 0, W, H).data;
        for (let i = 0; i < W * H; i++) Hm[i] = b[i * 4] / 255 + (Hm[i] - ieClamp(Hm[i], 0, 1));
    }
    const ang = ieFxAng(e, doc), alt = ((e.global && doc && doc.luzGlobal ? doc.luzGlobal.alt : e.alt) ?? 30) * Math.PI / 180;
    const Lx = Math.cos(alt) * Math.cos(ang), Ly = -Math.cos(alt) * Math.sin(ang), Lz = Math.sin(alt);
    const forca = (e.prof ?? 100) / 100 * tam * (e.dir === 'baixo' ? -1 : 1);
    const novo = () => { const c = ieFxCv(W, H); return { c, img: ieCtx(c).createImageData(W, H) }; };
    const pDentro = [novo(), novo()], pFora = [novo(), novo()];   // [luz, sombra]
    const [hr, hg, hb] = ieHexRgb(e.hCor), [sr, sg, sb] = ieHexRgb(e.sCor);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const dentro = alfa[i] >= 128, a = alfa[i] / 255;
        if (!dentro && (estilo === 'interno' || dout[i] > tam + 1)) continue;
        if (dentro && estilo === 'externo') continue;
        let gx = (Hm[i + 1] - Hm[i - 1]) / 2 * forca, gy = (Hm[i + W] - Hm[i - W]) / 2 * forca;
        if (estilo === 'almofada' && !dentro) { gx = -gx; gy = -gy; }
        const n = 1 / Math.hypot(gx, gy, 1);
        const s = (-gx * Lx - gy * Ly + Lz) * n - Lz;
        const luz = s > 0 ? Math.min(1, s / Math.max(0.05, 1 - Lz)) : 0, sombra = s < 0 ? Math.min(1, -s / Math.max(0.05, Lz)) : 0;
        const peso = dentro ? a : (1 - a);
        const p = dentro ? pDentro : pFora, k = i * 4;
        if (luz > 0) { const d = p[0].img.data; d[k] = hr; d[k + 1] = hg; d[k + 2] = hb; d[k + 3] = luz * peso * 255; }
        if (sombra > 0) { const d = p[1].img.data; d[k] = sr; d[k + 1] = sg; d[k + 2] = sb; d[k + 3] = sombra * peso * 255; }
    }
    const fim = (p, op) => { ieCtx(p.c).putImageData(p.img, 0, 0); const b = ieFxBlur(p.c, (e.suav || 0) / 2); return { c: b, op }; };
    return {
        dentro: [fim(pDentro[0], (e.hOp ?? 50) / 100), fim(pDentro[1], (e.sOp ?? 50) / 100)],
        fora: estilo === 'interno' ? null : [fim(pFora[0], (e.hOp ?? 50) / 100), fim(pFora[1], (e.sOp ?? 50) / 100)],
    };
}

// ─────────────────────────── acetinado ───────────────────────────
function ieFxAcetinado(A, e) {
    const W = A.width, H = A.height, a = (e.ang ?? 19) * Math.PI / 180, d = e.dist || 0;
    const ox = Math.cos(a) * d, oy = -Math.sin(a) * d;
    const borrado = ieFxBlur(ieFxCor(A, '#fff'), (e.tam || 0) / 2);
    const P = ieFxCv(W, H), x = ieCtx(P);
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.drawImage(borrado, ox, oy);
    const Q = ieFxCv(W, H), q = ieCtx(Q);
    q.fillStyle = '#000'; q.fillRect(0, 0, W, H);
    q.drawImage(borrado, -ox, -oy);
    x.globalCompositeOperation = 'difference';
    x.drawImage(Q, 0, 0);
    const img = x.getImageData(0, 0, W, H), dd = img.data, [r, g, b] = ieHexRgb(e.cor);
    for (let i = 0; i < dd.length; i += 4) { const v = e.inverter ? 255 - dd[i] : dd[i]; dd[i] = r; dd[i + 1] = g; dd[i + 2] = b; dd[i + 3] = v; }
    x.globalCompositeOperation = 'source-over';
    x.putImageData(img, 0, 0);
    return ieFxDentro(P, A);
}

// ─────────────────────────── desenho da camada com os efeitos ───────────────────────────
// base = pixels da camada já com a máscara (w×h). Devolve {c, mg, ext: [{c, bm, op}], acima: [...]} — todos os
// canvases do mesmo tamanho (w + 2mg) e na mesma origem (x - mg, y - mg).
function ieFxMargem(fx, doc) {
    let mg = 2;
    for (const { tipo, e } of ieFxLista(fx)) {
        if (!e.on) continue;
        if (tipo === 'sombra') mg = Math.max(mg, Math.ceil((e.tam || 0) * 1.6 + (e.dist || 0)) + 4);
        if (tipo === 'brilho') mg = Math.max(mg, Math.ceil((e.tam || 0) * 1.6) + 4);
        if (tipo === 'tracado' && e.pos !== 'dentro') mg = Math.max(mg, Math.ceil(e.tam || 0) + 3);
        if (tipo === 'chanfro' && e.estilo !== 'interno') mg = Math.max(mg, Math.ceil(e.tam || 0) + 3);
    }
    void doc;
    return mg;
}

function ieFxRender(base, fx, { fill = 1, interiorComFill = false, doc = IE.doc, semMascaraBase = null, org = { x: 0, y: 0 } } = {}) {
    fx = ieFxNorm(fx);
    const w = base.width, h = base.height, mg = ieFxMargem(fx, doc), W = w + 2 * mg, H = h + 2 * mg;
    const fonte = semMascaraBase || base;   // "a máscara oculta os efeitos": efeitos da camada sem a máscara
    const A = ieFxCv(W, H);
    ieCtx(A).drawImage(fonte, mg, mg);
    const Abranco = ieFxCor(A, '#fff');
    const F = ieFxCv(W, H), fc = ieCtx(F);
    const ext = [], acima = [];
    const on = k => (fx[k] || []).filter(e => e.on);
    const B = { x: mg, y: mg, w, h };   // caixa da camada (alinhar com a camada)
    // 1) sombras projetadas e brilho externo (por baixo, cada um com o seu modo)
    for (const e of on('sombra').reverse()) {
        const ang = ieFxAng(e, doc), d = e.dist || 0, tam = e.tam || 0, r = tam * (e.spread || 0) / 100;
        let S = ieFxBlur(ieFxDilatar(Abranco, r), (tam - r) / 2);
        S = ieFxDesloc(ieFxCor(S, e.cor), -Math.cos(ang) * d, Math.sin(ang) * d);
        if (e.ocultar !== false) S = ieFxMenos(S, A);
        ext.push({ c: S, bm: e.bm, op: (e.op ?? 35) / 100 });
    }
    for (const e of on('brilho')) {
        const tam = e.tam || 0, sp = e.tecnica === 'precisa' ? Math.max(e.spread || 0, 40) : (e.spread || 0), r = tam * sp / 100;
        const G = ieFxCor(ieFxBlur(ieFxDilatar(Abranco, r), (tam - r) / 2), e.cor);
        ext.push({ c: e.tecnica === 'precisa' ? G : G, bm: e.bm, op: (e.op ?? 75) / 100 });
    }
    // 2) conteúdo com o Preenchimento
    fc.globalAlpha = fill;
    fc.drawImage(base, mg, mg);
    fc.globalAlpha = 1;
    const kInt = interiorComFill ? fill : 1;
    const pintar = (c, bm, op) => { fc.save(); fc.globalAlpha = op; fc.globalCompositeOperation = ieGco(bm); fc.drawImage(c, 0, 0); fc.restore(); };
    // 3) efeitos de dentro, de baixo para cima
    for (const e of on('padraoSob')) {
        const P = ieFxCv(W, H), x = ieCtx(P), pat = x.createPattern(iePadraoCanvas(e.padrao), 'repeat');
        pat.setTransform(new DOMMatrix().scale((e.escala || 100) / 100));
        x.fillStyle = pat; x.fillRect(0, 0, W, H);
        pintar(ieFxDentro(P, A), e.bm, (e.op ?? 100) / 100 * kInt);
    }
    for (const e of on('degSob').reverse()) {
        const caixa = e.alinhar === false && doc ? { x: mg - org.x, y: mg - org.y, w: doc.w, h: doc.h } : B;
        pintar(ieFxDentro(ieFxDegrade(W, H, caixa, e.grad || IE_GRAD_PADRAO(), e.estilo, e.ang ?? 90, e.escala, e.inverter, e.ofx, e.ofy), A), e.bm, (e.op ?? 100) / 100 * kInt);
    }
    for (const e of on('corSob').reverse()) pintar(ieFxCor(A, e.cor), e.bm, (e.op ?? 100) / 100 * kInt);
    for (const e of on('acetinado')) pintar(ieFxAcetinado(A, e), e.bm, (e.op ?? 50) / 100 * kInt);
    for (const e of on('brilhoInt')) {
        const tam = e.tam || 0, r = tam * (e.choke || 0) / 100;
        const borda = ieFxBlur(ieFxDilatar(ieFxInverter(Abranco), r), (tam - r) / 2);
        const G = e.fonte === 'centro' ? ieFxMenos(Abranco, borda) : ieFxDentro(borda, A);
        pintar(ieFxCor(G, e.cor), e.bm, (e.op ?? 75) / 100 * kInt);
    }
    for (const e of on('sombraInt').reverse()) {
        const ang = ieFxAng(e, doc), d = e.dist || 0, tam = e.tam || 0, r = tam * (e.choke || 0) / 100;
        const fora = ieFxDesloc(ieFxInverter(Abranco), -Math.cos(ang) * d, Math.sin(ang) * d);
        // o que o deslocamento descobriu na borda do canvas também é "fora"
        const fx2 = ieCtx(fora); fx2.fillStyle = '#fff';
        const dx = -Math.cos(ang) * d, dy = Math.sin(ang) * d;
        if (dx > 0) fx2.fillRect(0, 0, Math.ceil(dx), H); else if (dx < 0) fx2.fillRect(W + Math.floor(dx), 0, W, H);
        if (dy > 0) fx2.fillRect(0, 0, W, Math.ceil(dy)); else if (dy < 0) fx2.fillRect(0, H + Math.floor(dy), W, H);
        const S = ieFxDentro(ieFxBlur(ieFxDilatar(fora, r), (tam - r) / 2), A);
        pintar(ieFxCor(S, e.cor), e.bm, (e.op ?? 35) / 100);
    }
    for (const e of on('tracado').reverse()) {
        const t = e.tam || 0;
        let R;
        if (e.pos === 'dentro') R = ieFxMenos(Abranco, ieFxErodir(Abranco, t));
        else if (e.pos === 'centro') R = ieFxMenos(ieFxDilatar(Abranco, t / 2), ieFxErodir(Abranco, t / 2));
        else R = ieFxMenos(ieFxDilatar(Abranco, t), A);
        let tinta;
        if (e.tipo === 'degrade') tinta = ieFxDentro(ieFxDegrade(W, H, { x: mg - t, y: mg - t, w: w + 2 * t, h: h + 2 * t }, e.grad || IE_GRAD_PADRAO(), e.estilo, e.ang ?? 90, e.escala, e.inverter), R);
        else if (e.tipo === 'padrao') { const P = ieFxCv(W, H), x = ieCtx(P); x.fillStyle = x.createPattern(iePadraoCanvas(e.padrao || 'xadrez'), 'repeat'); x.fillRect(0, 0, W, H); tinta = ieFxDentro(P, R); }
        else tinta = ieFxCor(R, e.cor);
        pintar(tinta, e.bm, (e.op ?? 100) / 100);
    }
    for (const e of on('chanfro')) {
        const r = ieFxChanfro(A, e, doc);
        pintar(r.dentro[1].c, e.sBm, r.dentro[1].op);
        pintar(r.dentro[0].c, e.hBm, r.dentro[0].op);
        if (r.fora) { acima.push({ c: r.fora[1].c, bm: e.sBm, op: r.fora[1].op }); acima.push({ c: r.fora[0].c, bm: e.hBm, op: r.fora[0].op }); }
    }
    return { c: F, mg, ext, acima };
}
