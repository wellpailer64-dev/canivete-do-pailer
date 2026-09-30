// =========================================================
// Pocket Editor — Escopos (Lumetri Scopes do Premiere): medem a imagem do monitor Programa
//   Forma de onda: brilho (luma BT.709) de cada coluna da imagem, de 0 a 100 — preto esmagado embaixo, estouro em cima
//   Parade RGB:     a forma de onda de cada canal lado a lado — dominante de cor aparece como um canal mais alto
//   Vetorscópio:    cor (ângulo) e saturação (distância do centro) no plano Cb/Cr; alvos das 6 cores a 75% e a linha
//                   do tom de pele (pele de qualquer etnia cai perto dela)
//   Histograma:     quantos pixels em cada nível, por canal
// Lê o quadro já composto do monitor (com efeitos e Luz e Cor), reduzido para ~360 px, no máximo ~12 vezes por
// segundo e só com o painel visível.
// =========================================================

const VESC = { modo: 'onda', ultimo: -1, t: 0, raf: 0, amostra: null, ctxA: null, n: 0, tc: 0 };
const VE_SC_W = 360;   // largura da amostra lida do monitor

function veScModo(m) {
    VESC.modo = m;
    veLsSet('ve-sc-modo', m);
    document.querySelectorAll('[data-sc-modo]').forEach(b => b.classList.toggle('active', b.dataset.scModo === m));
    VESC.ultimo = -1;
    veScAgendar();
}

function veScVisivel() {
    const cv = $ve('ve-sc-cv');
    return !!(cv && cv.offsetParent && cv.clientWidth > 20 && !cv.ownerDocument.hidden);
}

// Laço leve: redesenha quando o monitor mudou (VE._monN) e o painel está à vista
function veScAgendar() {
    if (VESC.raf) return;
    const cv = $ve('ve-sc-cv');
    if (!cv) return;
    VESC.raf = veRaf(cv, () => {
        VESC.raf = 0;
        if (!veScVisivel()) return;
        const agora = performance.now();
        if (VESC.n !== VESC.ultimo && agora - VESC.t > 80) {
            VESC.ultimo = VESC.n;
            VESC.t = agora;
            veScDesenhar();
        }
        veScAgendar();
    });
}

// Chamado pelo monitor (veTfDesenhar) com o quadro pronto e ANTES das alças de seleção: a amostra é só a imagem
function veScCaptura(mon) {
    if (!mon || !mon.width || !veScVisivel()) return;
    const agora = performance.now();
    if (agora - VESC.tc < 70) return;
    VESC.tc = agora;
    const w = Math.min(VE_SC_W, mon.width), h = Math.max(1, Math.round(mon.height * w / mon.width));
    if (!VESC.amostra) {
        VESC.amostra = document.createElement('canvas');
        VESC.ctxA = VESC.amostra.getContext('2d', { willReadFrequently: true });
    }
    const a = VESC.amostra;
    if (a.width !== w || a.height !== h) { a.width = w; a.height = h; }
    VESC.ctxA.drawImage(mon, 0, 0, w, h);
    VESC.n++;
    veScAgendar();
}

function veScLer() {
    if (!VE.ready) return null;
    if (!VESC.amostra) { VESC.tc = 0; veScCaptura($ve('ve-canvas')); }
    if (!VESC.amostra) return null;
    try { return VESC.ctxA.getImageData(0, 0, VESC.amostra.width, VESC.amostra.height); } catch (e) { return null; }
}

function veScDesenhar() {
    const cv = $ve('ve-sc-cv');
    if (!cv) return;
    const dpr = cv.ownerDocument.defaultView.devicePixelRatio || 1;
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#08090b';
    g.fillRect(0, 0, W, H);
    const img = veScLer();
    if (!img) {
        g.fillStyle = '#555';
        g.font = `${12 * dpr}px Segoe UI`;
        g.textAlign = 'center';
        g.fillText(veT('Abra um vídeo para ver os escopos'), W / 2, H / 2);
        return;
    }
    const f = { onda: veScOnda, parade: veScParade, vetor: veScVetor, histo: veScHisto }[VESC.modo] || veScOnda;
    f(g, img, W, H, dpr);
}

// ── forma de onda / parade ──
const VE_SC_PAD = 26;   // espaço para a escala à esquerda (px de tela)
function veScGrade(g, x0, y0, w, h, dpr, rotulos) {
    g.save();
    g.font = `${9.5 * dpr}px Cascadia Mono, Consolas, monospace`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    [0, 25, 50, 75, 100].forEach(n => {
        const y = Math.round(y0 + h - h * n / 100) + 0.5;
        g.strokeStyle = n === 0 || n === 100 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)';
        g.lineWidth = dpr;
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke();
        if (rotulos) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillText(String(n), x0 - 4 * dpr, y); }
    });
    g.restore();
}

// Acumula: colunas (largura cw) × 256 níveis, uma contagem por pixel; depois pinta com brilho logarítmico
function veScTraco(g, img, canal, x0, y0, w, h, cor) {
    const cw = Math.max(1, Math.min(img.width, Math.round(w))), bins = new Uint32Array(cw * 256), d = img.data;
    const fx = cw / img.width;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const v = canal === 'y' ? Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) : d[i + canal];
        bins[Math.floor(x * fx) * 256 + v]++;
    }
    const out = g.createImageData(cw, 256), o = out.data, k = 255 / Math.log(1 + img.height * 0.35);
    for (let c = 0; c < cw; c++) for (let v = 0; v < 256; v++) {
        const n = bins[c * 256 + v];
        if (!n) continue;
        const a = Math.min(255, Math.log(1 + n) * k), j = ((255 - v) * cw + c) * 4;
        o[j] = cor[0]; o[j + 1] = cor[1]; o[j + 2] = cor[2]; o[j + 3] = a;
    }
    const tmp = document.createElement('canvas');
    tmp.width = cw; tmp.height = 256;
    tmp.getContext('2d').putImageData(out, 0, 0);
    g.save();
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'lighter';
    g.drawImage(tmp, x0, y0, w, h);
    g.restore();
}

function veScOnda(g, img, W, H, dpr) {
    const p = VE_SC_PAD * dpr, t = 8 * dpr, w = W - p - t, h = H - 2 * t;
    veScGrade(g, p, t, w, h, dpr, true);
    veScTraco(g, img, 'y', p, t, w, h, [120, 255, 150]);
}

function veScParade(g, img, W, H, dpr) {
    const p = VE_SC_PAD * dpr, t = 8 * dpr, gap = 6 * dpr, w = (W - p - t - 2 * gap) / 3, h = H - 2 * t;
    [[0, [255, 80, 80]], [1, [80, 255, 110]], [2, [90, 150, 255]]].forEach(([ch, cor], k) => {
        const x = p + k * (w + gap);
        veScGrade(g, x, t, w, h, dpr, k === 0);
        veScTraco(g, img, ch, x, t, w, h, cor);
    });
}

// ── vetorscópio ──
const veScCbCr = (r, g, b) => {   // BT.709, entradas 0..1 → Cb/Cr em −0,5..0,5
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [(b - y) / 1.8556, (r - y) / 1.5748];
};
function veScVetor(g, img, W, H, dpr) {
    const S = Math.min(W, H) - 16 * dpr, cx = W / 2, cy = H / 2, R = S / 2;
    // escala: raio = 0,5 de Cb/Cr (saturação máxima possível ~ 0,5)
    const N = Math.max(64, Math.round(S)), bins = new Uint32Array(N * N), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const [cb, cr] = veScCbCr(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
        const x = Math.round((cb / 0.5 * 0.5 + 0.5) * (N - 1)), y = Math.round((0.5 - cr / 0.5 * 0.5) * (N - 1));
        if (x >= 0 && y >= 0 && x < N && y < N) bins[y * N + x]++;
    }
    // fundo: círculo e eixos
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = dpr;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    // linha do tom de pele (eixo I, ~123° a partir de +Cb)
    const ang = 123 * Math.PI / 180;
    g.strokeStyle = 'rgba(251,191,36,0.55)';
    g.setLineDash([4 * dpr, 3 * dpr]);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * R, cy - Math.sin(ang) * R); g.stroke();
    g.setLineDash([]);
    // alvos das cores a 75%
    g.font = `${9.5 * dpr}px Cascadia Mono, Consolas, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [['R', [0.75, 0, 0]], ['Mg', [0.75, 0, 0.75]], ['B', [0, 0, 0.75]], ['Cy', [0, 0.75, 0.75]], ['G', [0, 0.75, 0]], ['Yl', [0.75, 0.75, 0]]]
        .forEach(([n, c]) => {
            const [cb, cr] = veScCbCr(...c), x = cx + cb / 0.5 * R, y = cy - cr / 0.5 * R, q = 5 * dpr;
            g.strokeStyle = 'rgba(255,255,255,0.35)';
            g.strokeRect(x - q, y - q, 2 * q, 2 * q);
            g.fillStyle = 'rgba(255,255,255,0.5)';
            const k = 1 + 14 * dpr / Math.hypot(x - cx, y - cy);
            g.fillText(n, cx + (x - cx) * k, cy + (y - cy) * k);
        });
    g.restore();
    // pontos, com a própria cor (como o vetorscópio colorido do Premiere)
    const out = g.createImageData(N, N), o = out.data, k = 255 / Math.log(1 + img.width * img.height * 0.002);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const n = bins[y * N + x];
        if (!n) continue;
        const cb = (x / (N - 1) - 0.5) * 0.5 / 0.5, cr = (0.5 - y / (N - 1)) * 0.5 / 0.5;
        const Y = 0.6, r = Y + 1.5748 * cr, gg = Y - 0.1873 * cb - 0.4681 * cr, b = Y + 1.8556 * cb, j = (y * N + x) * 4;
        o[j] = Math.max(60, Math.min(255, r * 255)); o[j + 1] = Math.max(60, Math.min(255, gg * 255)); o[j + 2] = Math.max(60, Math.min(255, b * 255));
        o[j + 3] = Math.min(255, 40 + Math.log(1 + n) * k);
    }
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = N;
    tmp.getContext('2d').putImageData(out, 0, 0);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.drawImage(tmp, cx - R, cy - R, 2 * R, 2 * R);
    g.restore();
}

// ── histograma ──
function veScHisto(g, img, W, H, dpr) {
    const p = 8 * dpr, w = W - 2 * p, h = H - 2 * p, d = img.data;
    const hs = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let i = 0; i < d.length; i += 4) {
        hs[0][d[i]]++; hs[1][d[i + 1]]++; hs[2][d[i + 2]]++;
        hs[3][Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
    }
    const max = Math.max(1, ...hs.map(a => Math.max(...a.subarray(1, 255))));   // ignora as pontas (fundos chapados)
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.09)';
    g.lineWidth = dpr;
    [0.25, 0.5, 0.75].forEach(f => { const x = Math.round(p + w * f) + 0.5; g.beginPath(); g.moveTo(x, p); g.lineTo(x, p + h); g.stroke(); });
    g.globalCompositeOperation = 'lighter';
    [[hs[0], 'rgba(239,68,68,0.55)'], [hs[1], 'rgba(34,197,94,0.55)'], [hs[2], 'rgba(59,130,246,0.6)'], [hs[3], 'rgba(220,220,220,0.25)']].forEach(([a, cor]) => {
        g.fillStyle = cor;
        g.beginPath();
        g.moveTo(p, p + h);
        for (let v = 0; v < 256; v++) g.lineTo(p + w * v / 255, p + h - Math.min(1, a[v] / max) * h);
        g.lineTo(p + w, p + h);
        g.closePath();
        g.fill();
    });
    g.restore();
}

// Abre os Escopos sem esconder o Luz e Cor: vira aba no grupo de Efeitos/Transições (lado a lado com o Luz e Cor)
function veScAbrir() {
    if (typeof vedLocate !== 'function') return;
    if (vedLocate('scopes')) { vedShow('scopes'); return; }
    const lc = vedLocate('lc'), vizinho = ['fx', 'trans', 'keys', 'monitor'].map(vedLocate).find(l => l && (!lc || l.g !== lc.g));
    if (vizinho) {
        vizinho.g.p.push('scopes');
        vizinho.g.a = 'scopes';
        vedRender();
        if (typeof vedSave === 'function') vedSave();
    } else vedShow('scopes');
}

function veScInit() {
    const cv = $ve('ve-sc-cv');
    if (!cv) return;
    const m = veLsGet('ve-sc-modo');
    veScModo(['onda', 'parade', 'vetor', 'histo'].includes(m) ? m : 'onda');
    $ve('ve-sc-modos').addEventListener('click', e => { const b = e.target.closest('[data-sc-modo]'); if (b) veScModo(b.dataset.scModo); });
    new ResizeObserver(() => { VESC.ultimo = -1; veScAgendar(); if (VE.ready) veDrawMonitorSoon(); }).observe(cv);
    // o painel pode aparecer depois (aba escolhida, janela solta): confere de vez em quando
    setInterval(() => {
        if (VESC.raf || !veScVisivel()) return;
        if (!VESC.amostra && VE.ready) veDrawMonitorSoon();   // primeira vez à vista: pede um quadro
        veScAgendar();
    }, 500);
}

document.addEventListener('DOMContentLoaded', veScInit);
