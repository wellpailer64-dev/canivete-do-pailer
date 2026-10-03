// =========================================================
// Editor de Imagem — menu Filtro completo, na ordem e com os nomes do Photoshop (pt-BR).
// Cada filtro: diálogo com prévia (ieAplicarComDialogo), respeita a seleção, vale como filtro inteligente num objeto
// inteligente e entra no Último filtro (Ctrl+F). Sem parâmetro (Média, Desfoque, Faceta...) aplica direto.
// Os que ainda não existem aparecem desabilitados no lugar do Photoshop.
// =========================================================

// ─────────────────────────── utilidades de pixel ───────────────────────────
function ieFImg(c) { return ieCtx(c).getImageData(0, 0, c.width, c.height); }
function ieFTela(img) { const n = ieCanvas(img.width, img.height); ieCtx(n).putImageData(img, 0, 0); return n; }
function ieFCanais(img) {   // Float32 por canal (R, G, B) + alfa
    const n = img.width * img.height, d = img.data, ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) { ch[0][i] = d[i * 4]; ch[1][i] = d[i * 4 + 1]; ch[2][i] = d[i * 4 + 2]; }
    return ch;
}
function ieFJuntar(img, ch) {   // canais de volta numa cópia (alfa intacto)
    const o = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = o.data;
    for (let i = 0, n = img.width * img.height; i < n; i++) { d[i * 4] = ch[0][i]; d[i * 4 + 1] = ch[1][i]; d[i * 4 + 2] = ch[2][i]; }
    return o;
}
// média em caixa (2r+1)², separável com soma corrida, bordas repetidas
function ieFBox(a, w, h, r) {
    if (r < 1) return Float32Array.from(a);
    const t = new Float32Array(w * h), o = new Float32Array(w * h), k = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        const L = y * w;
        let s = a[L] * (r + 1);
        for (let x = 1; x <= r; x++) s += a[L + Math.min(x, w - 1)];
        for (let x = 0; x < w; x++) { t[L + x] = s / k; s += a[L + Math.min(x + r + 1, w - 1)] - a[L + Math.max(x - r, 0)]; }
    }
    for (let x = 0; x < w; x++) {
        let s = t[x] * (r + 1);
        for (let y = 1; y <= r; y++) s += t[Math.min(y, h - 1) * w + x];
        for (let y = 0; y < h; y++) { o[y * w + x] = s / k; s += t[Math.min(y + r + 1, h - 1) * w + x] - t[Math.max(y - r, 0) * w + x]; }
    }
    return o;
}
// filtro guiado (He et al.) com a própria imagem de guia: alisa e preserva bordas (superfície, inteligente, ruído)
function ieFGuiado(I, w, h, r, eps) {
    const m = ieFBox(I, w, h, r), I2 = new Float32Array(I.length);
    for (let i = 0; i < I.length; i++) I2[i] = I[i] * I[i];
    const m2 = ieFBox(I2, w, h, r), a = new Float32Array(I.length), b = new Float32Array(I.length);
    for (let i = 0; i < I.length; i++) { const v = m2[i] - m[i] * m[i]; a[i] = v / (v + eps); b[i] = m[i] - a[i] * m[i]; }
    const ma = ieFBox(a, w, h, r), mb = ieFBox(b, w, h, r), o = new Float32Array(I.length);
    for (let i = 0; i < I.length; i++) o[i] = ma[i] * I[i] + mb[i];
    return o;
}
// mediana (histograma corrido, Huang) num canal 0..255
function ieFMediana(a, w, h, r) {
    const o = new Float32Array(w * h), meio = ((2 * r + 1) ** 2 - 1) / 2;
    const v = (x, y) => a[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] | 0;
    for (let y = 0; y < h; y++) {
        const hist = new Int32Array(256);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) hist[v(dx, y + dy)]++;
        let m = 0, menor = 0;
        while (menor + hist[m] <= meio) { menor += hist[m]; m++; }
        for (let x = 0; x < w; x++) {
            o[y * w + x] = m;
            if (x === w - 1) break;
            for (let dy = -r; dy <= r; dy++) {
                const sai = v(x - r, y + dy), entra = v(x + r + 1, y + dy);
                hist[sai]--; if (sai < m) menor--;
                hist[entra]++; if (entra < m) menor++;
            }
            while (menor > meio) { m--; menor -= hist[m]; }
            while (menor + hist[m] <= meio) { menor += hist[m]; m++; }
        }
    }
    return o;
}
function ieFMinMax(a, w, h, r, max) {   // separável
    const t = new Float32Array(w * h), o = new Float32Array(w * h), f = max ? Math.max : Math.min;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = a[y * w + x]; for (let d = -r; d <= r; d++) m = f(m, a[y * w + Math.min(w - 1, Math.max(0, x + d))]); t[y * w + x] = m; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = t[y * w + x]; for (let d = -r; d <= r; d++) m = f(m, t[Math.min(h - 1, Math.max(0, y + d)) * w + x]); o[y * w + x] = m; }
    return o;
}
// convolução k×k em cada canal (escala e deslocamento como o Personalizado do Photoshop)
function ieFConv(c, K, n, escala = 1, desloc = 0) {
    const img = ieFImg(c), w = img.width, h = img.height, s = img.data, o = new ImageData(new Uint8ClampedArray(s), w, h), d = o.data, r = (n - 1) / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let R = 0, G = 0, B = 0;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const k = K[j * n + i]; if (!k) continue;
            const p = (Math.min(h - 1, Math.max(0, y + j - r)) * w + Math.min(w - 1, Math.max(0, x + i - r))) * 4;
            R += s[p] * k; G += s[p + 1] * k; B += s[p + 2] * k;
        }
        const q = (y * w + x) * 4;
        d[q] = R / escala + desloc; d[q + 1] = G / escala + desloc; d[q + 2] = B / escala + desloc;
    }
    return ieFTela(o);
}
function ieFPorCanal(c, fn) { const img = ieFImg(c); return ieFTela(ieFJuntar(img, ieFCanais(img).map(a => fn(a, img.width, img.height)))); }
function ieFNitidez(c, q, r, lim = 0) {   // máscara de nitidez
    const b = ieDesfocar(c, r), A = ieFImg(c), B = ieFImg(b), a = A.data, bd = B.data, k = q / 100;
    for (let i = 0; i < a.length; i += 4) for (let j = 0; j < 3; j++) { const dif = a[i + j] - bd[i + j]; if (Math.abs(dif) >= lim) a[i + j] = a[i + j] + dif * k; }
    return ieFTela(A);
}
function ieFAcumular(c, passos, fn) {   // média de cópias transformadas (movimento, radial, lente)
    const n = ieCanvas(c.width, c.height), x = ieCtx(n);
    for (let k = 0; k < passos; k++) { x.save(); x.globalAlpha = 1 / (k + 1); fn(x, k); x.restore(); }
    return n;
}
const ieFLum = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
function ieFRng(s) { s = s >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function ieFAbs(c, fn) { return ieDeslocar(c, (x, y) => { const [sx, sy] = fn(x, y); return [sx - x, sy - y]; }); }   // mapa absoluto
function ieFCor(hex) { return ieHexRgb(hex); }

// ─────────────────────────── os filtros ───────────────────────────
const ieFd = (titulo, campos, proc, margem) => () => ieAplicarComDialogo({ titulo, campos, proc, margem });
const ieN = (id, rotulo, min, max, valor, passo) => ({ id, rotulo, min, max, valor, passo });
const ieSel = (id, rotulo, opcoes, valor) => ({ id, rotulo, tipo: 'select', opcoes, valor });

Object.assign(IE_FILTROS, {
    // ── Desfoque ──
    media: ieFd('Média', [], () => c => {
        const img = ieFImg(c), d = img.data; let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; r += d[i] * a; g += d[i + 1] * a; b += d[i + 2] * a; n += a; }
        for (let i = 0; i < d.length; i += 4) { d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; }
        return ieFTela(img);
    }),
    desfoque: ieFd('Desfoque', [], () => c => ieDesfocar(c, 0.8), () => 3),
    desfoqueMais: ieFd('Desfoque mais', [], () => c => ieDesfocar(c, 2), () => 6),
    caixa: ieFd('Desfoque de caixa', [ieN('r', 'Raio (px)', 1, 500, 10)], v => c => ieFPorCanal(c, (a, w, h) => ieFBox(ieFBox(a, w, h, Math.round(v.r / 2)), w, h, Math.round(v.r / 2))), v => v.r),
    lente: ieFd('Desfoque de lente', [ieN('r', 'Raio da íris (px)', 1, 100, 15), ieN('brilho', 'Brilho dos realces', 0, 100, 30), ieN('lim', 'Limiar dos realces', 128, 255, 220)], v => c => {
        // bokeh: a média num disco (não gaussiana) com os pontos de luz realçados antes
        const img = ieFImg(c), d = img.data, ganho = 1 + v.brilho / 25;
        for (let i = 0; i < d.length; i += 4) if (ieFLum(d, i) >= v.lim) { d[i] = Math.min(255, d[i] * ganho); d[i + 1] = Math.min(255, d[i + 1] * ganho); d[i + 2] = Math.min(255, d[i + 2] * ganho); }
        const fonte = ieFTela(img), pts = [[0, 0]];
        for (const [raio, n] of [[0.35, 6], [0.7, 12], [1, 18]]) for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; pts.push([Math.cos(a) * v.r * raio, Math.sin(a) * v.r * raio]); }
        return ieFAcumular(fonte, pts.length, (x, k) => x.drawImage(fonte, pts[k][0], pts[k][1]));
    }, v => v.r),
    radial: ieFd('Desfoque radial', [ieN('q', 'Quantidade', 1, 100, 10), ieSel('modo', 'Método', [['giro', 'Giro'], ['zoom', 'Zoom']], 'giro'),
        ieN('cx', 'Centro X (%)', 0, 100, 50), ieN('cy', 'Centro Y (%)', 0, 100, 50)], v => c => {
        const cx = c.width * v.cx / 100, cy = c.height * v.cy / 100, n = Math.min(48, 8 + v.q);
        return ieFAcumular(c, n, (x, k) => {
            const t = (k / (n - 1) - 0.5);
            x.translate(cx, cy);
            if (v.modo === 'giro') x.rotate(t * v.q * Math.PI / 180); else { const s = 1 + t * v.q / 100; x.scale(s, s); }
            x.translate(-cx, -cy); x.drawImage(c, 0, 0);
        });
    }),
    inteligente: ieFd('Desfoque inteligente', [ieN('r', 'Raio', 1, 100, 3), ieN('lim', 'Limiar', 1, 100, 25)], v => c => ieFPorCanal(c, (a, w, h) => ieFGuiado(a, w, h, Math.round(v.r), (v.lim * 2) ** 2))),
    superficie: ieFd('Desfoque de superfície', [ieN('r', 'Raio (px)', 1, 100, 5), ieN('lim', 'Limiar (níveis)', 2, 255, 15)], v => c => ieFPorCanal(c, (a, w, h) => ieFGuiado(a, w, h, Math.round(v.r), v.lim ** 2))),
    // ── Galeria de desfoque ──
    campo: ieFd('Desfoque de campo', [ieN('r', 'Desfoque (px)', 0.1, 500, 15, 0.1)], v => c => ieDesfocar(c, v.r), v => Math.ceil(v.r * 3)),
    iris: ieFd('Desfoque de íris', [ieN('r', 'Desfoque (px)', 1, 500, 15), ieN('cx', 'Centro X (%)', 0, 100, 50), ieN('cy', 'Centro Y (%)', 0, 100, 50),
        ieN('rx', 'Raio horizontal (%)', 1, 100, 30), ieN('ry', 'Raio vertical (%)', 1, 100, 30), ieN('trans', 'Transição (%)', 1, 100, 40)], v => c => {
        const b = ieDesfocar(c, v.r), m = ieCanvas(c.width, c.height), x = ieCtx(m), rx = c.width * v.rx / 100, ry = c.height * v.ry / 100;
        const g = x.createRadialGradient(0, 0, 0, 0, 0, 1), dentro = Math.max(0, 1 - v.trans / 100);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(dentro, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
        x.fillStyle = '#000'; x.fillRect(0, 0, m.width, m.height);
        x.globalCompositeOperation = 'destination-out'; x.save(); x.translate(c.width * v.cx / 100, c.height * v.cy / 100); x.scale(rx, ry);
        const g2 = x.createRadialGradient(0, 0, 0, 0, 0, 1); g2.addColorStop(0, '#000'); g2.addColorStop(dentro, '#000'); g2.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g2; x.beginPath(); x.arc(0, 0, 1, 0, Math.PI * 2); x.fill(); x.restore();
        const bx = ieCtx(b); bx.globalCompositeOperation = 'destination-in'; bx.drawImage(m, 0, 0);
        const o = ieClonar(c); ieCtx(o).drawImage(b, 0, 0); return o;
    }, v => Math.ceil(v.r * 3)),
    tiltShift: ieFd('Tilt-Shift', [ieN('r', 'Desfoque (px)', 1, 500, 15), ieN('cy', 'Centro (%)', 0, 100, 50), ieN('faixa', 'Faixa nítida (%)', 0, 100, 15),
        ieN('trans', 'Transição (%)', 1, 100, 20), ieN('ang', 'Ângulo (°)', -90, 90, 0)], v => c => {
        const b = ieDesfocar(c, v.r), w = c.width, h = c.height, x = ieCtx(b), a = v.ang * Math.PI / 180;
        const cx = w / 2, cy = h * v.cy / 100, L = Math.hypot(w, h), nx = -Math.sin(a), ny = Math.cos(a);
        const f = h * v.faixa / 200, t = h * v.trans / 100;
        const g = x.createLinearGradient(cx - nx * (f + t), cy - ny * (f + t), cx + nx * (f + t), cy + ny * (f + t)), tot = 2 * (f + t);
        g.addColorStop(0, '#000'); g.addColorStop(t / tot, 'rgba(0,0,0,0)'); g.addColorStop(1 - t / tot, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
        x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(-L, -L, 3 * L, 3 * L);
        const o = ieClonar(c); ieCtx(o).drawImage(b, 0, 0); return o;
    }, v => Math.ceil(v.r * 3)),
    giratorio: ieFd('Desfoque giratório', [ieN('ang', 'Ângulo do desfoque (°)', 1, 360, 15), ieN('cx', 'Centro X (%)', 0, 100, 50), ieN('cy', 'Centro Y (%)', 0, 100, 50)], v => c => {
        const cx = c.width * v.cx / 100, cy = c.height * v.cy / 100, n = 32;
        return ieFAcumular(c, n, (x, k) => { x.translate(cx, cy); x.rotate((k / (n - 1) - 0.5) * v.ang * Math.PI / 180); x.translate(-cx, -cy); x.drawImage(c, 0, 0); });
    }),
    // ── Distorção ──
    comprimir: ieFd('Comprimir', [ieN('q', 'Quantidade (%)', -100, 100, 50)], v => c => {
        const cx = c.width / 2, cy = c.height / 2, R = Math.min(cx, cy), e = 1 - v.q / 100 * 0.6;
        return ieFAbs(c, (x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d >= R || !d) return [x, y]; const k = R * Math.pow(d / R, e) / d; return [cx + dx * k, cy + dy * k]; });
    }),
    polares: ieFd('Coordenadas polares', [ieSel('modo', 'Converter', [['rp', 'Retangular para polar'], ['pr', 'Polar para retangular']], 'rp')], v => c => {
        const w = c.width, h = c.height, cx = w / 2, cy = h / 2, R = Math.min(cx, cy);
        return ieFAbs(c, (x, y) => {
            if (v.modo === 'rp') { const dx = x - cx, dy = y - cy, a = (Math.atan2(dx, -dy) + Math.PI) / (2 * Math.PI), d = Math.hypot(dx, dy) / R; return [a * (w - 1), d * (h - 1)]; }
            const a = x / w * 2 * Math.PI - Math.PI, d = y / h * R; return [cx + Math.sin(a) * d, cy - Math.cos(a) * d];
        });
    }),
    cisalhamento: ieFd('Cisalhamento', [ieN('q', 'Curva (%)', -100, 100, 40)], v => c => ieFAbs(c, (x, y) => [x - v.q / 100 * c.width * 0.25 * Math.sin(Math.PI * y / c.height), y])),
    esferizacao: ieFd('Esferização', [ieN('q', 'Quantidade (%)', -100, 100, 100), ieSel('modo', 'Modo', [['n', 'Normal'], ['h', 'Só horizontal'], ['v', 'Só vertical']], 'n')], v => c => {
        const cx = c.width / 2, cy = c.height / 2, e = 1 + v.q / 100 * 0.7;
        return ieFAbs(c, (x, y) => {
            const nx = v.modo === 'v' ? 0 : (x - cx) / cx, ny = v.modo === 'h' ? 0 : (y - cy) / cy, d = Math.hypot(nx, ny);
            if (d >= 1 || !d) return [x, y];
            const k = Math.pow(d, e) / d;
            return [v.modo === 'v' ? x : cx + (x - cx) * k, v.modo === 'h' ? y : cy + (y - cy) * k];
        });
    }),
    onda: ieFd('Onda', [ieN('ger', 'Geradores', 1, 10, 3), ieN('l0', 'Comprimento mín.', 1, 999, 40), ieN('l1', 'Comprimento máx.', 1, 999, 120),
        ieN('a0', 'Amplitude mín.', 0, 999, 5), ieN('a1', 'Amplitude máx.', 0, 999, 20), ieSel('tipo', 'Tipo', [['seno', 'Senoidal'], ['tri', 'Triângulo'], ['quad', 'Quadrado']], 'seno'), ieN('sem', 'Aleatorizar', 1, 999, 7)], v => c => {
        const rnd = ieFRng(v.sem), ondas = Array.from({ length: v.ger }, () => ({ l: v.l0 + rnd() * Math.max(0, v.l1 - v.l0), a: v.a0 + rnd() * Math.max(0, v.a1 - v.a0), f: rnd() * 6.28, eixo: rnd() < 0.5 }));
        const fw = t => v.tipo === 'tri' ? 2 / Math.PI * Math.asin(Math.sin(t)) : v.tipo === 'quad' ? Math.sign(Math.sin(t)) : Math.sin(t);
        return ieFAbs(c, (x, y) => { let dx = 0, dy = 0; for (const o of ondas) { if (o.eixo) dx += o.a * fw(2 * Math.PI * y / o.l + o.f); else dy += o.a * fw(2 * Math.PI * x / o.l + o.f); } return [x + dx, y + dy]; });
    }, v => v.a1 * v.ger),
    ziguezague: ieFd('Ziguezague', [ieN('q', 'Quantidade', -100, 100, 10), ieN('cristas', 'Cristas', 1, 20, 5)], v => c => {
        const cx = c.width / 2, cy = c.height / 2, R = Math.min(cx, cy);
        return ieFAbs(c, (x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d >= R || !d) return [x, y]; const t = d / R, dr = v.q / 100 * R * 0.08 * Math.sin(2 * Math.PI * v.cristas * t) * (1 - t); return [x + dx / d * dr, y + dy / d * dr]; });
    }),
    // ── Ruído ──
    diminuirManchas: ieFd('Diminuir manchas', [], () => c => ieFPorCanal(c, (a, w, h) => ieFGuiado(a, w, h, 1, 120))),
    poeira: ieFd('Poeira e arranhões', [ieN('r', 'Raio (px)', 1, 16, 2), ieN('lim', 'Limiar (níveis)', 0, 255, 10)], v => c => ieFPorCanal(c, (a, w, h) => {
        const m = ieFMediana(a, w, h, Math.round(v.r)), o = new Float32Array(a.length);
        for (let i = 0; i < a.length; i++) o[i] = Math.abs(a[i] - m[i]) > v.lim ? m[i] : a[i];
        return o;
    })),
    mediana: ieFd('Mediana', [ieN('r', 'Raio (px)', 1, 16, 2)], v => c => ieFPorCanal(c, (a, w, h) => ieFMediana(a, w, h, Math.round(v.r)))),
    reduzirRuido: ieFd('Reduzir ruído', [ieN('forca', 'Intensidade', 0, 10, 6), ieN('det', 'Preservar detalhes (%)', 0, 100, 60), ieN('cor', 'Reduzir ruído da cor (%)', 0, 100, 45), ieN('nit', 'Tornar os detalhes mais nítidos (%)', 0, 100, 25)], v => c => {
        const img = ieFImg(c), w = img.width, h = img.height, ch = ieFCanais(img), eps = (v.forca * 6) ** 2;
        // luz alisada preservando bordas; cor (crominância) alisada mais forte
        const Y = new Float32Array(w * h); for (let i = 0; i < Y.length; i++) Y[i] = ch[0][i] * 0.299 + ch[1][i] * 0.587 + ch[2][i] * 0.114;
        const Ys = ieFGuiado(Y, w, h, 2, eps), k = v.det / 100, rc = Math.round(1 + v.cor / 15);
        const Yo = Y.map((y, i) => Ys[i] + (y - Ys[i]) * k * 0.6);
        const out = ch.map(a => { const cr = a.map((x, i) => x - Y[i]); const crs = ieFBox(cr, w, h, rc); return a.map((x, i) => Yo[i] + cr[i] + (crs[i] - cr[i]) * v.cor / 100); });
        let n = ieFTela(ieFJuntar(img, out));
        if (v.nit > 0) n = ieFNitidez(n, v.nit * 1.5, 1);
        return n;
    }),
    // ── Pixelização ──
    meioTom: ieFd('Meio-tom em cores', [ieN('r', 'Raio máximo (px)', 4, 127, 8), ieN('a1', 'Canal 1 (C) °', -360, 360, 108), ieN('a2', 'Canal 2 (M) °', -360, 360, 162), ieN('a3', 'Canal 3 (Y) °', -360, 360, 90)], v => c => {
        const w = c.width, h = c.height, img = ieFImg(c), d = img.data, n = ieCanvas(w, h), x = ieCtx(n), cel = v.r * 2;
        x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'multiply';
        [[v.a1, '#00ffff', 0], [v.a2, '#ff00ff', 1], [v.a3, '#ffff00', 2]].forEach(([ang, cor, k]) => {
            const a = ang * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), L = Math.hypot(w, h);
            x.fillStyle = cor;
            for (let v2 = -L; v2 < L; v2 += cel) for (let u = -L; u < L; u += cel) {
                const px = w / 2 + u * cs - v2 * sn, py = h / 2 + u * sn + v2 * cs;
                if (px < -cel || py < -cel || px > w + cel || py > h + cel) continue;
                const i = (Math.min(h - 1, Math.max(0, py | 0)) * w + Math.min(w - 1, Math.max(0, px | 0))) * 4;
                const tinta = 1 - d[i + k] / 255, r = Math.sqrt(tinta) * v.r * 1.15;
                if (r > 0.3) { x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
            }
        });
        x.globalCompositeOperation = 'destination-in'; x.drawImage(c, 0, 0);
        return n;
    }),
    cristalizar: ieFd('Cristalizar', [ieN('t', 'Tamanho da célula', 3, 300, 10)], v => c => ieFCelulas(c, v.t, 'cristal')),
    faceta: ieFd('Faceta', [], () => c => ieFPorCanal(c, (a, w, h) => ieFGuiado(ieFMediana(a, w, h, 2), w, h, 3, 900))),
    fragmento: ieFd('Fragmento', [], () => c => ieFAcumular(c, 4, (x, k) => x.drawImage(c, [4, -4, 0, 0][k], [0, 0, 4, -4][k])), () => 4),
    meiaTinta: ieFd('Meia-tinta', [ieSel('tipo', 'Tipo', [['finos', 'Pontos finos'], ['medios', 'Pontos médios'], ['traços', 'Traços curtos'], ['longos', 'Traços longos']], 'finos')], v => c => {
        const img = ieFImg(c), d = img.data, w = img.width, rnd = ieFRng(99), traco = { 'traços': 6, longos: 18 }[v.tipo] || 0, grao = v.tipo === 'medios' ? 2 : 1;
        for (let y = 0; y < img.height; y += grao) for (let x = 0; x < w; x += traco || grao) {
            const lim = rnd() * 255;
            for (let k = 0; k < 3; k++) {
                const i0 = (y * w + x) * 4, val = d[i0 + k] > lim ? 255 : 0;
                for (let dy = 0; dy < grao; dy++) for (let dx = 0; dx < Math.max(grao, traco); dx++) { const xx = x + dx, yy = y + dy; if (xx < w && yy < img.height) d[(yy * w + xx) * 4 + k] = val; }
            }
        }
        return ieFTela(img);
    }),
    pontilhismo: ieFd('Pontilhismo', [ieN('t', 'Tamanho da célula', 3, 300, 8)], v => c => ieFCelulas(c, v.t, 'pontos')),
    // ── Acabamento ──
    nuvens: ieFd('Nuvens', [], () => c => ieFNuvens(c, false)),
    nuvensDif: ieFd('Nuvens por diferença', [], () => c => ieFNuvens(c, true)),
    fibras: ieFd('Fibras', [ieN('var', 'Variação', 1, 64, 16), ieN('forca', 'Intensidade', 1, 64, 4), ieN('sem', 'Aleatorizar', 1, 999, 5)], v => c => {
        const w = c.width, h = c.height, hh = Math.max(4, Math.round(h / (v.forca * 8))), r = ieRuidoSuave(w, hh, Math.max(1, 6 - v.var / 16), v.sem);
        const p = ieCanvas(w, hh), px = ieCtx(p), im = px.createImageData(w, hh), f = ieFCor(IE.cor[0]), b = ieFCor(IE.cor[1]);
        for (let i = 0; i < w * hh; i++) { const t = Math.min(1, Math.max(0, 0.5 + r[i] * 0.8)); im.data[i * 4] = b[0] + (f[0] - b[0]) * t; im.data[i * 4 + 1] = b[1] + (f[1] - b[1]) * t; im.data[i * 4 + 2] = b[2] + (f[2] - b[2]) * t; im.data[i * 4 + 3] = 255; }
        px.putImageData(im, 0, 0);
        const n = ieCanvas(w, h), x = ieCtx(n); x.drawImage(p, 0, 0, w, h); x.globalCompositeOperation = 'destination-in'; x.drawImage(c, 0, 0);
        return n;
    }),
    reflexo: ieFd('Reflexo de lente', [ieN('cx', 'Centro X (%)', 0, 100, 30), ieN('cy', 'Centro Y (%)', 0, 100, 25), ieN('brilho', 'Brilho (%)', 10, 300, 100),
        ieSel('tipo', 'Tipo de lente', [['zoom', 'Zoom 50-300 mm'], ['35', 'Primária 35 mm'], ['105', 'Primária 105 mm'], ['filme', 'Filme']], 'zoom')], v => c => ieFReflexo(c, v)),
    iluminacao: ieFd('Efeitos de iluminação', [ieSel('tipo', 'Tipo', [['spot', 'Holofote'], ['ponto', 'Ponto'], ['infinita', 'Infinita']], 'spot'),
        ieN('cx', 'Luz X (%)', 0, 100, 50), ieN('cy', 'Luz Y (%)', 0, 100, 35), ieN('raio', 'Alcance (%)', 5, 200, 60), ieN('int', 'Intensidade', -100, 100, 35),
        ieN('amb', 'Ambiente', -100, 100, 8), { id: 'cor', rotulo: 'Cor da luz', tipo: 'cor', valor: '#ffffff' }, ieN('ang', 'Ângulo da infinita (°)', -180, 180, 120)], v => c => {
        const img = ieFImg(c), d = img.data, w = img.width, h = img.height, cor = ieFCor(v.cor), lx = w * v.cx / 100, ly = h * v.cy / 100, R = Math.hypot(w, h) * v.raio / 200;
        const amb = 0.5 + v.amb / 200, int = 1 + v.int / 50, a = v.ang * Math.PI / 180;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let f;
            if (v.tipo === 'infinita') f = 0.5 + 0.5 * Math.cos(Math.atan2(y - h / 2, x - w / 2) - a) * 0.6;
            else { const t = Math.hypot(x - lx, (y - ly) * (v.tipo === 'spot' ? 1.4 : 1)) / R; f = t >= 1 ? 0 : (1 - t * t) ** 2; }
            const i = (y * w + x) * 4, k = amb + f * int;
            d[i] = d[i] * k * (0.6 + 0.4 * cor[0] / 255); d[i + 1] = d[i + 1] * k * (0.6 + 0.4 * cor[1] / 255); d[i + 2] = d[i + 2] * k * (0.6 + 0.4 * cor[2] / 255);
        }
        return ieFTela(img);
    }),
    // ── Nitidez ──
    tornarNitido: ieFd('Tornar nítido', [], () => c => ieFNitidez(c, 45, 0.8)),
    nitidezBordas: ieFd('Nitidez de bordas', [], () => c => ieFNitidez(c, 90, 1, 12)),
    maisNitidez: ieFd('Mais nitidez', [], () => c => ieFNitidez(c, 110, 0.8)),
    nitidezInteligente: ieFd('Nitidez inteligente', [ieN('q', 'Quantidade (%)', 1, 500, 150), ieN('r', 'Raio (px)', 0.1, 64, 1, 0.1), ieN('ruido', 'Reduzir ruído (%)', 0, 100, 10),
        ieSel('tirar', 'Remover', [['gauss', 'Desfoque gaussiano'], ['lente', 'Desfoque de lente'], ['mov', 'Desfoque de movimento']], 'lente')], v => c => {
        const base = v.ruido > 0 ? ieFPorCanal(c, (a, w, h) => ieFGuiado(a, w, h, 1, (v.ruido * 2) ** 2)) : c;
        return v.tirar === 'lente' ? ieFNitidez(ieFNitidez(base, v.q * 0.6, v.r * 0.6), v.q * 0.4, v.r * 1.4) : ieFNitidez(base, v.q, v.r);
    }),
    // ── Estilização ──
    difusao: ieFd('Difusão', [ieSel('modo', 'Modo', [['normal', 'Normal'], ['escuro', 'Clarear só escuros'], ['claro', 'Escurecer só claros']], 'normal')], v => c => {
        const img = ieFImg(c), s = img.data, w = img.width, h = img.height, o = new Uint8ClampedArray(s), rnd = ieFRng(7);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const xx = Math.min(w - 1, Math.max(0, x + Math.round((rnd() - 0.5) * 4))), yy = Math.min(h - 1, Math.max(0, y + Math.round((rnd() - 0.5) * 4)));
            const i = (y * w + x) * 4, j = (yy * w + xx) * 4, lj = ieFLum(s, j), li = ieFLum(s, i);
            if (v.modo === 'escuro' && lj > li) continue; if (v.modo === 'claro' && lj < li) continue;
            o[i] = s[j]; o[i + 1] = s[j + 1]; o[i + 2] = s[j + 2];
        }
        return ieFTela(new ImageData(o, w, h));
    }),
    entalhe: ieFd('Entalhe', [ieN('ang', 'Ângulo (°)', -180, 180, 135), ieN('alt', 'Altura (px)', 1, 10, 3), ieN('q', 'Quantidade (%)', 1, 500, 100)], v => c => {
        const img = ieFImg(c), s = img.data, w = img.width, h = img.height, o = new ImageData(new Uint8ClampedArray(s), w, h), d = o.data;
        const a = v.ang * Math.PI / 180, dx = Math.round(Math.cos(a) * v.alt), dy = Math.round(-Math.sin(a) * v.alt), k = v.q / 100;
        const L = (x, y) => ieFLum(s, (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const g = 128 + (L(x + dx, y + dy) - L(x - dx, y - dy)) * k, i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = g; }
        return ieFTela(o);
    }),
    arestas: ieFd('Indicação de arestas', [], () => c => {
        const img = ieFImg(c), s = img.data, w = img.width, h = img.height, o = new ImageData(new Uint8ClampedArray(s), w, h), d = o.data;
        const p = (x, y, k) => s[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4 + k];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) {
            const gx = p(x + 1, y - 1, k) + 2 * p(x + 1, y, k) + p(x + 1, y + 1, k) - p(x - 1, y - 1, k) - 2 * p(x - 1, y, k) - p(x - 1, y + 1, k);
            const gy = p(x - 1, y + 1, k) + 2 * p(x, y + 1, k) + p(x + 1, y + 1, k) - p(x - 1, y - 1, k) - 2 * p(x, y - 1, k) - p(x + 1, y - 1, k);
            d[(y * w + x) * 4 + k] = 255 - Math.hypot(gx, gy) * 0.5;
        }
        return ieFTela(o);
    }),
    oleo: ieFd('Pintura a óleo', [ieN('r', 'Estilização (raio)', 1, 20, 5), ieN('limp', 'Limpeza (%)', 0, 100, 40), ieN('brilho', 'Brilho do relevo', 0, 10, 2)], v => c => {
        let n = ieFKuwahara(c, Math.round(v.r));
        if (v.limp > 0) n = ieFPorCanal(n, (a, w, h) => ieFGuiado(a, w, h, 2, (v.limp * 0.8) ** 2));
        if (v.brilho > 0) {   // relevo leve das pinceladas (luz de cima à esquerda)
            const img = ieFImg(n), s = img.data, w = img.width, h = img.height, k = v.brilho * 0.25, base = new Uint8ClampedArray(s);
            const L = (x, y) => ieFLum(base, (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = (L(x - 1, y - 1) - L(x + 1, y + 1)) * k, i = (y * w + x) * 4; s[i] += e; s[i + 1] += e; s[i + 2] += e; }
            n = ieFTela(img);
        }
        return n;
    }),
    solarizacao: ieFd('Solarização', [], () => c => { const img = ieFImg(c), d = img.data; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) if (d[i + k] > 127) d[i + k] = 255 - d[i + k]; return ieFTela(img); }),
    ladrilhos: ieFd('Ladrilhos', [ieN('n', 'Número de ladrilhos (lado menor)', 1, 99, 10), ieN('desl', 'Deslocamento máx. (%)', 1, 99, 10), ieSel('fundo', 'Preencher área vazia com', [['cor', 'Cor de fundo'], ['frente', 'Cor de frente'], ['transp', 'Transparente'], ['orig', 'Imagem original']], 'cor')], v => c => {
        const w = c.width, h = c.height, t = Math.max(2, Math.min(w, h) / v.n), n = ieCanvas(w, h), x = ieCtx(n), rnd = ieFRng(3), m = t * v.desl / 100;
        if (v.fundo === 'orig') x.drawImage(c, 0, 0); else if (v.fundo !== 'transp') { x.fillStyle = v.fundo === 'cor' ? IE.cor[1] : IE.cor[0]; x.fillRect(0, 0, w, h); }
        for (let y = 0; y < h; y += t) for (let x0 = 0; x0 < w; x0 += t) x.drawImage(c, x0, y, t, t, x0 + (rnd() - 0.5) * 2 * m, y + (rnd() - 0.5) * 2 * m, t, t);
        return n;
    }),
    contorno: ieFd('Traçado de contorno', [ieN('n', 'Nível', 0, 255, 128), ieSel('borda', 'Borda', [['inf', 'Inferior'], ['sup', 'Superior']], 'inf')], v => c => {
        const img = ieFImg(c), s = img.data, w = img.width, h = img.height, o = new ImageData(new Uint8ClampedArray(s), w, h), d = o.data;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) {
            const i = (y * w + x) * 4 + k, a = s[i] >= v.n, b = x + 1 < w ? s[i + 4] >= v.n : a, cc = y + 1 < h ? s[i + w * 4] >= v.n : a;
            const cruza = v.borda === 'inf' ? (!a && (b || cc)) : (a && (!b || !cc));
            d[i] = cruza ? 0 : 255;
        }
        return ieFTela(o);
    }),
    vento: ieFd('Vento', [ieSel('metodo', 'Método', [['vento', 'Vento'], ['explosao', 'Explosão'], ['rajada', 'Rajada']], 'vento'), ieSel('dir', 'Direção', [['dir', 'Da direita'], ['esq', 'Da esquerda']], 'dir')], v => c => {
        const img = ieFImg(c), d = img.data, w = img.width, h = img.height, decai = { vento: 0.9, explosao: 0.96, rajada: 0.82 }[v.metodo], rnd = ieFRng(11);
        for (let y = 0; y < h; y++) {
            const ac = [0, 0, 0];
            for (let k = 0; k < w; k++) {
                const x = v.dir === 'dir' ? w - 1 - k : k, i = (y * w + x) * 4, dc = decai * (0.9 + rnd() * 0.1);
                for (let q = 0; q < 3; q++) { ac[q] = Math.max(d[i + q], ac[q] * dc); d[i + q] = ac[q]; }
            }
        }
        return ieFTela(img);
    }),
    // ── Vídeo ──
    desentrelacar: ieFd('Desentrelaçar', [ieSel('campo', 'Eliminar', [['impar', 'Campos ímpares'], ['par', 'Campos pares']], 'impar'), ieSel('criar', 'Criar novos campos por', [['dup', 'Duplicação'], ['interp', 'Interpolação']], 'interp')], v => c => {
        const img = ieFImg(c), d = img.data, w = img.width, h = img.height, ini = v.campo === 'impar' ? 1 : 0;
        for (let y = ini; y < h; y += 2) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) {
            const i = (y * w + x) * 4 + k, a = y > 0 ? d[i - w * 4] : d[i + w * 4], b = y + 1 < h ? d[i + w * 4] : a;
            d[i] = v.criar === 'dup' ? a : (a + b) / 2;
        }
        return ieFTela(img);
    }),
    ntsc: ieFd('Cores NTSC', [], () => c => {
        const img = ieFImg(c), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2], Y = 0.299 * r + 0.587 * g + 0.114 * b, I = 0.596 * r - 0.274 * g - 0.322 * b, Q = 0.211 * r - 0.523 * g + 0.312 * b;
            const m = Math.hypot(I, Q), k = m > 110 ? 110 / m : 1, i2 = I * k, q2 = Q * k;
            d[i] = Y + 0.956 * i2 + 0.621 * q2; d[i + 1] = Y - 0.272 * i2 - 0.647 * q2; d[i + 2] = Y - 1.106 * i2 + 1.703 * q2;
        }
        return ieFTela(img);
    }),
    // ── Outros ──
    personalizado: ieFd('Personalizado', [...Array.from({ length: 9 }, (_, k) => ({ id: 'k' + k, rotulo: `Matriz ${Math.floor(k / 3) + 1},${k % 3 + 1}`, tipo: 'numero', min: -999, max: 999, valor: k === 4 ? 5 : [1, 3, 5, 7].includes(k) ? -1 : 0 })),
        { id: 'esc', rotulo: 'Escala', tipo: 'numero', min: 1, max: 9999, valor: 1 }, { id: 'desl', rotulo: 'Deslocamento', tipo: 'numero', min: -9999, max: 9999, valor: 0 }],
        v => c => ieFConv(c, Array.from({ length: 9 }, (_, k) => +v['k' + k] || 0), 3, +v.esc || 1, +v.desl || 0)),
    passaAlta: ieFd('Passa-alta', [ieN('r', 'Raio (px)', 0.1, 1000, 10, 0.1)], v => c => {
        const b = ieDesfocar(c, v.r), A = ieFImg(c), B = ieFImg(b), a = A.data, bd = B.data;
        for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) a[i + k] = a[i + k] - bd[i + k] + 128;
        return ieFTela(A);
    }, v => Math.ceil(v.r * 3)),
    hsb: ieFd('HSB/HSL', [ieSel('ent', 'Modo de entrada', [['rgb', 'RGB']], 'rgb'), ieSel('linha', 'Ordem das linhas', [['hsb', 'HSB'], ['hsl', 'HSL']], 'hsb')], v => c => {
        const img = ieFImg(c), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
            let hh = 0; if (df) hh = mx === r ? ((g - b) / df + 6) % 6 : mx === g ? (b - r) / df + 2 : (r - g) / df + 4;
            const l = (mx + mn) / 2;
            d[i] = hh / 6 * 255;
            d[i + 1] = (v.linha === 'hsb' ? (mx ? df / mx : 0) : (df ? df / (1 - Math.abs(2 * l - 1)) : 0)) * 255;
            d[i + 2] = (v.linha === 'hsb' ? mx : l) * 255;
        }
        return ieFTela(img);
    }),
    maximo: ieFd('Máximo', [ieN('r', 'Raio (px)', 1, 500, 2)], v => c => ieFPorCanal(c, (a, w, h) => ieFMinMax(a, w, h, Math.round(v.r), true)), v => v.r),
    minimo: ieFd('Mínimo', [ieN('r', 'Raio (px)', 1, 500, 2)], v => c => ieFPorCanal(c, (a, w, h) => ieFMinMax(a, w, h, Math.round(v.r), false)), v => v.r),
    deslocamento: ieFd('Deslocamento', [ieN('dx', 'Horizontal (px à direita)', -9999, 9999, 100), ieN('dy', 'Vertical (px para baixo)', -9999, 9999, 0),
        ieSel('area', 'Áreas indefinidas', [['envolver', 'Envolver'], ['repetir', 'Repetir pixels da borda'], ['transp', 'Transparente']], 'envolver')], v => c => {
        const w = c.width, h = c.height, n = ieCanvas(w, h), x = ieCtx(n), dx = ((v.dx % w) + w) % w, dy = ((v.dy % h) + h) % h;
        if (v.area === 'envolver') { for (const ox of [dx - w, dx]) for (const oy of [dy - h, dy]) x.drawImage(c, ox, oy); return n; }
        if (v.area === 'transp') { x.drawImage(c, v.dx, v.dy); return n; }
        return ieFAbs(c, (px, py) => [Math.min(w - 1, Math.max(0, px - v.dx)), Math.min(h - 1, Math.max(0, py - v.dy))]);
    }),
    // ── Correção de lente (aba Personalizado): distorção, aberração cromática, vinheta ──
    correcaoLente: ieFd('Correção de lente', [ieN('dist', 'Remover distorção', -100, 100, 0), ieN('ca', 'Corrigir franja ciano/vermelho', -100, 100, 0),
        ieN('vin', 'Vinheta: quantidade', -100, 100, 0), ieN('meio', 'Vinheta: ponto médio', 0, 100, 50)], v => c => {
        const w = c.width, h = c.height, cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy), kd = -v.dist / 100 * 0.35;
        const base = v.dist ? ieFAbs(c, (x, y) => { const nx = (x - cx) / R, ny = (y - cy) / R, r2 = nx * nx + ny * ny, f = 1 + kd * r2; return [cx + nx * f * R, cy + ny * f * R]; }) : c;
        const img = ieFImg(base), d = img.data, s = new Uint8ClampedArray(d), kc = v.ca / 100 * 0.006;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, t = Math.hypot(x - cx, y - cy) / R;
            if (kc) {   // vermelho e azul em escalas um pouco diferentes
                for (const [k, esc] of [[0, 1 + kc], [2, 1 - kc]]) { const sx = Math.round(cx + (x - cx) * esc), sy = Math.round(cy + (y - cy) * esc); if (sx >= 0 && sy >= 0 && sx < w && sy < h) d[i + k] = s[(sy * w + sx) * 4 + k]; }
            }
            if (v.vin) { const m = Math.max(0.05, v.meio / 100), f = Math.min(1, Math.max(0, (t - m * 0.7) / (1 - m * 0.7))), g = 1 + v.vin / 100 * f * f; d[i] *= g; d[i + 1] *= g; d[i + 2] *= g; }
        }
        return ieFTela(img);
    }),
});

// células (Cristalizar = Voronoi com a cor média; Pontilhismo = pontos dessa cor sobre a cor de fundo)
function ieFCelulas(c, t, modo) {
    const img = ieFImg(c), d = img.data, w = img.width, h = img.height, gw = Math.ceil(w / t), gh = Math.ceil(h / t), rnd = ieFRng(17);
    const sx = new Float32Array(gw * gh), sy = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { sx[j * gw + i] = (i + rnd()) * t; sy[j * gw + i] = (j + rnd()) * t; }
    const dono = new Int32Array(w * h), soma = new Float64Array(gw * gh * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ci = Math.floor(x / t), cj = Math.floor(y / t);
        let melhor = -1, md = Infinity;
        for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
            if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
            const k = j * gw + i, dd = (sx[k] - x) ** 2 + (sy[k] - y) ** 2;
            if (dd < md) { md = dd; melhor = k; }
        }
        const p = (y * w + x) * 4; dono[y * w + x] = melhor;
        soma[melhor * 4] += d[p]; soma[melhor * 4 + 1] += d[p + 1]; soma[melhor * 4 + 2] += d[p + 2]; soma[melhor * 4 + 3]++;
    }
    if (modo === 'cristal') {
        for (let i = 0; i < w * h; i++) { const k = dono[i], n = soma[k * 4 + 3] || 1; d[i * 4] = soma[k * 4] / n; d[i * 4 + 1] = soma[k * 4 + 1] / n; d[i * 4 + 2] = soma[k * 4 + 2] / n; }
        return ieFTela(img);
    }
    const n = ieCanvas(w, h), x = ieCtx(n);
    x.fillStyle = IE.cor[1]; x.fillRect(0, 0, w, h);
    for (let k = 0; k < gw * gh; k++) {
        const q = soma[k * 4 + 3]; if (!q) continue;
        x.fillStyle = `rgb(${soma[k * 4] / q},${soma[k * 4 + 1] / q},${soma[k * 4 + 2] / q})`;
        x.beginPath(); x.arc(sx[k], sy[k], t * 0.62, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = 'destination-in'; x.drawImage(c, 0, 0);
    return n;
}
// Nuvens: ruído fractal entre a cor de frente e a de fundo (Nuvens por diferença: diferença com a imagem)
function ieFNuvens(c, dif) {
    const w = c.width, h = c.height, f = ieFCor(IE.cor[0]), b = ieFCor(IE.cor[1]), sem = (Date.now() & 0xffff) | 1, acc = new Float32Array(w * h);
    let soma = 0;
    for (let o = 0, cel = Math.max(w, h) / 3, peso = 1; o < 6 && cel >= 2; o++, cel /= 2, peso /= 2) { const r = ieRuidoSuave(w, h, cel, sem + o * 97); for (let i = 0; i < acc.length; i++) acc[i] += r[i] * peso; soma += peso; }
    const img = ieFImg(c), d = img.data;
    for (let i = 0; i < w * h; i++) {
        const t = Math.min(1, Math.max(0, 0.5 + acc[i] / soma * 0.9)), p = i * 4;
        for (let k = 0; k < 3; k++) { const v = b[k] + (f[k] - b[k]) * t; d[p + k] = dif ? Math.abs(d[p + k] - v) : v; }
        if (!dif) d[p + 3] = 255;
    }
    return ieFTela(img);
}
// Kuwahara (Pintura a óleo): em cada pixel, a média do quadrante de menor variação
function ieFKuwahara(c, r) {
    const img = ieFImg(c), w = img.width, h = img.height, ch = ieFCanais(img), W = w + 1;
    const integ = a => { const s = new Float64Array(W * (h + 1)); for (let y = 0; y < h; y++) { let lin = 0; for (let x = 0; x < w; x++) { lin += a[y * w + x]; s[(y + 1) * W + x + 1] = s[y * W + x + 1] + lin; } } return s; };
    const Y = ch[0].map((v, i) => v * 0.299 + ch[1][i] * 0.587 + ch[2][i] * 0.114), Y2 = Y.map(v => v * v);
    const SI = ch.map(integ), SY = integ(Y), SY2 = integ(Y2);
    const area = (S, x0, y0, x1, y1) => S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0];
    const out = ch.map(() => new Float32Array(w * h));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let melhor = Infinity, q = null;
        for (const [ax, ay] of [[-r, -r], [0, -r], [-r, 0], [0, 0]]) {
            const x0 = Math.max(0, x + ax), y0 = Math.max(0, y + ay), x1 = Math.min(w, x + ax + r + 1), y1 = Math.min(h, y + ay + r + 1), n = (x1 - x0) * (y1 - y0);
            const m = area(SY, x0, y0, x1, y1) / n, v = area(SY2, x0, y0, x1, y1) / n - m * m;
            if (v < melhor) { melhor = v; q = [x0, y0, x1, y1, n]; }
        }
        for (let k = 0; k < 3; k++) out[k][y * w + x] = area(SI[k], q[0], q[1], q[2], q[3]) / q[4];
    }
    return ieFTela(ieFJuntar(img, out));
}
// Reflexo de lente: brilho central, raio, anel e "fantasmas" na linha que passa pelo centro da imagem
function ieFReflexo(c, v) {
    const w = c.width, h = c.height, n = ieClonar(c), x = ieCtx(n), fx = w * v.cx / 100, fy = h * v.cy / 100, k = v.brilho / 100, S = Math.min(w, h);
    x.globalCompositeOperation = 'lighter';
    const brilho = (px, py, r, cor, a) => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(${cor},${a})`); g.addColorStop(1, `rgba(${cor},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); };
    brilho(fx, fy, S * 0.35 * k, '255,250,235', 0.9 * Math.min(1, k));
    brilho(fx, fy, S * 0.08 * k, '255,255,255', 1);
    x.save(); x.translate(fx, fy); x.scale(1, 0.025); brilho(0, 0, S * 0.6 * k, '200,220,255', 0.6 * Math.min(1, k)); x.restore();   // raio horizontal
    if (v.tipo !== '35') { x.save(); x.translate(fx, fy); x.scale(0.025, 1); brilho(0, 0, S * 0.35 * k, '220,230,255', 0.35 * Math.min(1, k)); x.restore(); }
    const anel = (r, cor) => { const g = x.createRadialGradient(fx, fy, r * 0.9, fx, fy, r * 1.05); g.addColorStop(0, `rgba(${cor},0)`); g.addColorStop(0.5, `rgba(${cor},${0.18 * k})`); g.addColorStop(1, `rgba(${cor},0)`); x.fillStyle = g; x.beginPath(); x.arc(fx, fy, r * 1.05, 0, Math.PI * 2); x.fill(); };
    if (v.tipo === 'zoom' || v.tipo === 'filme') anel(S * 0.18 * k, '120,200,255');
    const cx = w / 2, cy = h / 2, fantasmas = { zoom: [[0.45, 0.04, '120,255,160'], [0.7, 0.025, '255,160,90'], [1.25, 0.07, '100,160,255'], [1.6, 0.03, '200,120,255']], '35': [[0.6, 0.05, '255,200,120'], [1.3, 0.04, '120,180,255']],
        '105': [[0.5, 0.03, '160,220,255'], [1.15, 0.05, '255,170,110'], [1.45, 0.02, '170,255,190']], filme: [[0.4, 0.05, '255,220,160'], [0.9, 0.03, '160,200,255'], [1.4, 0.06, '255,180,120']] }[v.tipo];
    for (const [t, r, cor] of fantasmas) brilho(fx + (cx - fx) * t * 2, fy + (cy - fy) * t * 2, S * r * 2, cor, 0.35 * Math.min(1.5, k));
    x.globalCompositeOperation = 'destination-in'; x.drawImage(c, 0, 0);   // não pinta onde a camada é transparente
    return n;
}

// ─────────────────────────── menu Filtro (igual ao do Photoshop) ───────────────────────────
{
    const nao = r => [r, 'naoTem:' + r];
    const menu = ['Filtro', [['Último filtro', 'filtroUltimo', 'Ctrl+F'], '-', ['Converter para filtros inteligentes', 'objetoInteligente'], '-', nao('Neural Filters...'), '-',
        nao('Galeria de filtros...'), nao('Grande angular adaptável...'), ['Filtro Camera Raw...', 'f:cameraRaw', 'Shift+Ctrl+A'], ['Correção de lente...', 'f:correcaoLente', 'Shift+Ctrl+R'],
        nao('Dissolver...'), nao('Ponto de fuga...'), '-',
        ['Desfoque', [['Média', 'f:media'], ['Desfoque', 'f:desfoque'], ['Desfoque mais', 'f:desfoqueMais'], ['Desfoque de caixa...', 'f:caixa'], ['Desfoque gaussiano...', 'f:gaussiano'],
            ['Desfoque de lente...', 'f:lente'], ['Desfoque de movimento...', 'f:movimento'], ['Desfoque radial...', 'f:radial'], nao('Desfoque de forma...'), ['Desfoque inteligente...', 'f:inteligente'], ['Desfoque de superfície...', 'f:superficie']]],
        ['Galeria de desfoque', [['Desfoque de campo...', 'f:campo'], ['Desfoque de íris...', 'f:iris'], ['Tilt-Shift...', 'f:tiltShift'], nao('Desfoque de caminho...'), ['Desfoque giratório...', 'f:giratorio']]],
        ['Distorção', [nao('Deslocamento de pixels...'), ['Comprimir...', 'f:comprimir'], ['Coordenadas polares...', 'f:polares'], ['Ondulação...', 'f:ondulacao'], ['Cisalhamento...', 'f:cisalhamento'],
            ['Esferização...', 'f:esferizacao'], ['Redemoinho...', 'f:torcer'], ['Onda...', 'f:onda'], ['Ziguezague...', 'f:ziguezague'], '-', ['Respingos...', 'f:respingos']]],
        ['Ruído', [['Adicionar ruído...', 'f:ruido'], ['Diminuir manchas', 'f:diminuirManchas'], ['Poeira e arranhões...', 'f:poeira'], ['Mediana...', 'f:mediana'], ['Reduzir ruído...', 'f:reduzirRuido']]],
        ['Pixelização', [['Meio-tom em cores...', 'f:meioTom'], ['Cristalizar...', 'f:cristalizar'], ['Faceta', 'f:faceta'], ['Fragmento', 'f:fragmento'], ['Meia-tinta...', 'f:meiaTinta'], ['Mosaico...', 'f:mosaico'], ['Pontilhismo...', 'f:pontilhismo']]],
        ['Acabamento', [nao('Chama...'), nao('Moldura...'), nao('Árvore...'), '-', ['Nuvens', 'f:nuvens'], ['Nuvens por diferença', 'f:nuvensDif'], ['Fibras...', 'f:fibras'], ['Reflexo de lente...', 'f:reflexo'], ['Efeitos de iluminação...', 'f:iluminacao']]],
        ['Nitidez', [nao('Redução de tremido...'), ['Tornar nítido', 'f:tornarNitido'], ['Nitidez de bordas', 'f:nitidezBordas'], ['Mais nitidez', 'f:maisNitidez'], ['Nitidez inteligente...', 'f:nitidezInteligente'], ['Máscara de nitidez...', 'f:nitidez']]],
        ['Estilização', [['Difusão...', 'f:difusao'], ['Entalhe...', 'f:entalhe'], nao('Extrusão...'), ['Indicação de arestas', 'f:arestas'], ['Pintura a óleo...', 'f:oleo'], ['Solarização', 'f:solarizacao'],
            ['Ladrilhos...', 'f:ladrilhos'], ['Traçado de contorno...', 'f:contorno'], ['Vento...', 'f:vento']]],
        ['Vídeo', [['Desentrelaçar...', 'f:desentrelacar'], ['Cores NTSC', 'f:ntsc']]],
        ['Outros', [['Personalizado...', 'f:personalizado'], ['Passa-alta...', 'f:passaAlta'], ['HSB/HSL...', 'f:hsb'], ['Máximo...', 'f:maximo'], ['Mínimo...', 'f:minimo'], ['Deslocamento...', 'f:deslocamento']]]]];
    const i = IE_MENUS.findIndex(m => m[0] === 'Filtro');
    if (i >= 0) IE_MENUS[i] = menu; else IE_MENUS.push(menu);
    const pode = ieCmdPode;
    ieCmdPode = function (c) { if (String(c).startsWith('naoTem:')) return false; return pode(c); };
    if (IE_ATALHOS && !IE_ATALHOS['Shift+Ctrl+R']) IE_ATALHOS['Shift+Ctrl+R'] = 'f:correcaoLente';
}
