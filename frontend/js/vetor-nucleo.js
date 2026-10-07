// Vetor Kanivete (estilo Illustrator) — núcleo: modelo, geometria, desenho e a CAMADA DE COMANDOS.
// Regra da casa: toda mudança no documento passa por vkCmd(nome, args) — a interface, o Claude (window.VKN) e o
// Worker (tools/worker/executor_vetor.js) chamam os MESMOS comandos, com o mesmo histórico (Ctrl+Z) e o mesmo log.
// Modelo (pt = 1/72", y para baixo), detalhado em Instructions/vetor-kanivete.md:
//   doc = {nome, unidade:'mm', modoCor:'cmyk'|'rgb', perfil, sangria, pranchetas:[{id,nome,x,y,w,h}],
//          camadas:[{id,nome,visivel,trava,imprimir,itens:[obj]}] (0 = embaixo), amostras:[{id,nome,cor}], imagens:{id:{...}}}
//   obj caminho {tipo,subs:[{fechado,pts:[[x,y,inX,inY,outX,outY]]}],regra,preench,traco,op,bm,sobre:{p,t}}
//   obj texto {tipo,conteudo,fam,estilo,tam,entrelinha,track,alin,caixa,m:[a,b,c,d,e,f],preench,traco}
//   obj imagem {tipo,img,m} (m leva pixel → pt) · grupo {tipo,itens,clip} (clip: itens[0] é o caminho de corte)
//   cor {k:'cmyk',v:[c,m,y,k]} | {k:'rgb',v:[r,g,b]} | {k:'spot',nome,v:[cmyk alt],tint} | {k:'reg'} | {k:'grad',tipo,a,b,f,r,paradas}
const VK_MM = 72 / 25.4;
const VK = {
    doc: null, path: null, sujo: false, sel: [], selPts: null, ferr: 'selecao', vista: { z: 1, x: 0, y: 0 },
    hist: [], futuro: [], ativa: null, camadaAtiva: null, contorno: false, mostrarSangria: true, reguas: true,
    pref: { escalarTracos: false, passo: 1, perfil: 'FOGRA39' },
    corTela: new Map(), geo: new Map(), geoPend: new Map(), imgs: new Map(), path2d: new WeakMap(),
    preench: { k: 'cmyk', v: [0, 0, 0, 0] }, traco: { k: 'cmyk', v: [0, 0, 0, 100] }, focoTraco: false,
    clip: null, log: [], relatorio: [], ouvintes: [], seq: 0,
};
const VK_PRESETS = {
    'A4': [210, 297], 'A5': [148, 210], 'A3': [297, 420], 'A6': [105, 148], 'Carta': [215.9, 279.4],
    'Cartão de visita': [90, 50], 'Flyer 10×15': [100, 150], 'Flyer 15×21': [150, 210], 'Banner 60×90': [600, 900],
    'Post 1080×1080': [1080 / VK_MM * 0.75 / 1, 1080 / VK_MM * 0.75 / 1], 'Story 1080×1920': [1080 * 0.75 / VK_MM, 1920 * 0.75 / VK_MM],
};

// ─────────────────────────── utilidades ───────────────────────────
const vkClone = o => JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)));
const vkId = (p = 'o') => p + Date.now().toString(36).slice(-4) + (++VK.seq).toString(36);
const vkMM = pt => pt / VK_MM, vkPT = mm => mm * VK_MM;
const vkR = (n, c = 2) => Math.round(n * 10 ** c) / 10 ** c;
const vkMul = (m1, m2) => [m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3], m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5]];
const vkAp = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const vkInv = m => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
const vkEsc = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const vkApi = () => (window.pywebview && window.pywebview.api) || null;
function vkPt(x, y) { return [x, y, x, y, x, y]; }
function vkPadraoDoc() { return VK.padraoPdf || (VK.doc && VK.doc.destino === 'tela' ? 'rgb' : 'x4'); }   // documento de tela: PDF/fechamento digitais
function vkDocVazio(o = {}) {
    if (o.modoCor === 'rgb' && !o.destino) o = { ...o, destino: 'tela' };
    const w = vkPT(o.larg || 210), h = vkPT(o.alt || 297), n = Math.max(1, o.pranchetas || 1);
    const pr = Array.from({ length: n }, (_, i) => ({ id: vkId('p'), nome: `Prancheta ${i + 1}`, x: i * (w + 36), y: 0, w, h }));
    return { versao: 1, nome: o.nome || 'Sem título', unidade: 'mm', modoCor: o.modoCor || 'cmyk', perfil: o.perfil || 'FOGRA39',
        sangria: vkPT(o.sangria ?? (o.destino === 'tela' ? 0 : 3)), ...(o.destino === 'tela' ? { destino: 'tela' } : {}), pranchetas: pr, camadas: [{ id: vkId('c'), nome: 'Camada 1', visivel: true, trava: false, itens: [] }],
        amostras: vkAmostrasPadrao(), imagens: {}, guias: [] };
}
function vkAmostrasPadrao() {
    const c = (nome, v) => ({ id: vkId('a'), nome, cor: { k: 'cmyk', v } });
    return [c('Branco', [0, 0, 0, 0]), c('Preto (100K)', [0, 0, 0, 100]), c('Preto rico', [60, 40, 40, 100]), c('Ciano', [100, 0, 0, 0]),
        c('Magenta', [0, 100, 0, 0]), c('Amarelo', [0, 0, 100, 0]), c('Vermelho', [0, 100, 100, 0]), c('Verde', [100, 0, 100, 0]), c('Azul', [100, 100, 0, 0]),
        c('Cinza 50%', [0, 0, 0, 50]), c('Laranja', [0, 60, 100, 0]), { id: vkId('a'), nome: '[Registro]', cor: { k: 'reg' } }];
}

// ─────────────────────────── árvore ───────────────────────────
function vkTodos(itens = null, out = [], pai = null, cam = null) {
    if (!itens) { for (const c of VK.doc.camadas) vkTodos(c.itens, out, null, c); return out; }
    for (const o of itens) { out.push({ o, pai, cam }); if (o.tipo === 'grupo') vkTodos(o.itens, out, o, cam); }
    return out;
}
function vkAchar(id) { return vkTodos().find(x => x.o.id === id) || null; }
function vkObj(id) { const r = vkAchar(id); return r && r.o; }
function vkListaDe(id) {   // lista que contém o objeto (itens da camada ou do grupo)
    const r = vkAchar(id); if (!r) return null;
    return r.pai ? r.pai.itens : r.cam.itens;
}
function vkTopo(id) {   // objeto de nível de camada que contém id (a Seleção pega o grupo inteiro)
    let r = vkAchar(id); while (r && r.pai) r = vkAchar(r.pai.id); return r && r.o;
}
function vkCamadaDe(id) { const r = vkAchar(id); return r && r.cam; }
function vkTravado(o, cam) { return o.trava || (cam && (cam.trava || cam.visivel === false)) || o.visivel === false; }

// ─────────────────────────── geometria ───────────────────────────
function vkCubicaBox(p0, p1, p2, p3, b) {   // extremos reais da cúbica (alinhar/medir certo, não pela alça)
    const acc = t => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
    const ex = (a, b_, c, d) => {
        const A = -a + 3 * b_ - 3 * c + d, B = 2 * (a - 2 * b_ + c), C = b_ - a, r = [];
        if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) r.push(-C / B); return r; }
        const D = B * B - 4 * A * C; if (D < 0) return r;
        const s = Math.sqrt(D); r.push((-B + s) / (2 * A), (-B - s) / (2 * A)); return r;
    };
    for (const t of [...ex(p0[0], p1[0], p2[0], p3[0]), ...ex(p0[1], p1[1], p2[1], p3[1])]) if (t > 0 && t < 1) { const p = acc(t); vkBoxAdd(b, p[0], p[1]); }
    vkBoxAdd(b, p3[0], p3[1]);
}
function vkBoxAdd(b, x, y) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
function vkSubsBox(subs, m = null, b = [Infinity, Infinity, -Infinity, -Infinity]) {
    for (const s of subs) {
        const P = m ? s.pts.map(p => [...vkAp(m, p[0], p[1]), ...vkAp(m, p[2], p[3]), ...vkAp(m, p[4], p[5])]) : s.pts;
        if (!P.length) continue;
        vkBoxAdd(b, P[0][0], P[0][1]);
        const n = s.fechado ? P.length : P.length - 1;
        for (let i = 0; i < n; i++) { const a = P[i], c = P[(i + 1) % P.length]; vkCubicaBox([a[0], a[1]], [a[4], a[5]], [c[2], c[3]], [c[0], c[1]], b); }
    }
    return b;
}
function vkBox(o, comTraco = false) {   // caixa no documento
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    if (o.tipo === 'caminho') {
        vkSubsBox(o.subs, null, b);
        if (comTraco && o.traco && isFinite(b[0])) { const w = o.traco.larg / 2; b[0] -= w; b[1] -= w; b[2] += w; b[3] += w; }
    } else if (o.tipo === 'grupo') {
        for (const f of (o.clip ? o.itens.slice(0, 1) : o.itens)) { const c = vkBox(f, comTraco); if (isFinite(c[0])) { vkBoxAdd(b, c[0], c[1]); vkBoxAdd(b, c[2], c[3]); } }
    } else if (o.tipo === 'texto') {
        const g = vkGeo(o);
        if (o.forma && o.subs) vkSubsBox(o.subs, null, b);   // texto em forma: a forma (editável) é a caixa
        else if (o.caixa && o.caixa_alt) for (const [x, y] of [[0, 0], [o.caixa, 0], [0, o.caixa_alt], [o.caixa, o.caixa_alt]]) { const p = vkAp(o.m, x, y); vkBoxAdd(b, p[0], p[1]); }
        else if (g && g.subs.length) vkSubsBox(g.subs, o.m, b);
        else { const l = o.caixa || o.conteudo.length * o.tam * 0.55, x0 = o.alin === 'centro' && !o.caixa ? -l / 2 : 0;
            for (const [x, y] of [[x0, -o.tam * 0.8], [x0 + l, -o.tam * 0.8], [x0, o.tam * 0.25], [x0 + l, o.tam * 0.25]]) { const p = vkAp(o.m, x, o.caixa ? y + o.tam * 0.8 : y); vkBoxAdd(b, p[0], p[1]); } }
    } else if (o.tipo === 'imagem') {
        const im = VK.doc.imagens[o.img] || { w: 1, h: 1 };
        for (const [x, y] of [[0, 0], [im.w, 0], [0, im.h], [im.w, im.h]]) { const p = vkAp(o.m, x, y); vkBoxAdd(b, p[0], p[1]); }
    } else if (o.tipo === 'instancia') {   // símbolo: a caixa da definição levada pela matriz da instância
        const S = (VK.doc.simbolos || {})[o.simbolo];
        for (const f of (S ? S.itens : [])) { const c = vkBox(f, comTraco); if (!isFinite(c[0])) continue; for (const [x, y] of [[c[0], c[1]], [c[2], c[1]], [c[0], c[3]], [c[2], c[3]]]) { const p = vkAp(o.m, x, y); vkBoxAdd(b, p[0], p[1]); } }
    }
    return b;
}
function vkBoxUniao(objs, comTraco) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const o of objs) { const c = vkBox(o, comTraco); if (isFinite(c[0])) { vkBoxAdd(b, c[0], c[1]); vkBoxAdd(b, c[2], c[3]); } }
    return isFinite(b[0]) ? b : null;
}
function vkTransformar(o, M) {   // aplica M (doc → doc) ao objeto: caminho assa os pontos; texto/imagem acumulam m
    const tc = c => {
        if (!c || c.k !== 'grad') return c;
        const n = { ...c, a: vkAp(M, ...c.a) };
        if (c.b) n.b = vkAp(M, ...c.b); if (c.f) n.f = vkAp(M, ...c.f); if (c.r) n.r = c.r * vkEsc(M);
        return n;
    };
    if (o.tipo === 'caminho') {
        o.subs = o.subs.map(s => ({ fechado: s.fechado, pts: s.pts.map(p => [...vkAp(M, p[0], p[1]), ...vkAp(M, p[2], p[3]), ...vkAp(M, p[4], p[5])]) }));
        if (VK.pref.escalarTracos && o.traco) o.traco = { ...o.traco, larg: o.traco.larg * vkEsc(M) };
    } else if (o.tipo === 'grupo') o.itens.forEach(f => vkTransformar(f, M));
    else {
        o.m = vkMul(o.m, M);
        if (o.subs) o.subs = o.subs.map(s => ({ fechado: s.fechado, pts: s.pts.map(p => [...vkAp(M, p[0], p[1]), ...vkAp(M, p[2], p[3]), ...vkAp(M, p[4], p[5])]) }));   // trilha/forma do texto acompanha
    }
    if (o.preench) o.preench = tc(o.preench);
    if (o.traco && o.traco.cor) o.traco = { ...o.traco, cor: tc(o.traco.cor) };
}
// formas prontas (em pt)
function vkRetSubs(x, y, w, h, r = 0) {
    if (r <= 0) return [{ fechado: true, pts: [vkPt(x, y), vkPt(x + w, y), vkPt(x + w, y + h), vkPt(x, y + h)] }];
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2); const k = r * 0.5523;
    return [{ fechado: true, pts: [[x + r, y, x + r - k, y, x + r, y], [x + w - r, y, x + w - r, y, x + w - r + k, y], [x + w, y + r, x + w, y + r - k, x + w, y + r],
        [x + w, y + h - r, x + w, y + h - r, x + w, y + h - r + k], [x + w - r, y + h, x + w - r + k, y + h, x + w - r, y + h], [x + r, y + h, x + r, y + h, x + r - k, y + h],
        [x, y + h - r, x, y + h - r + k, x, y + h - r], [x, y + r, x, y + r, x, y + r - k]] }];
}
function vkElipseSubs(cx, cy, rx, ry) {
    const k = 0.5523;
    return [{ fechado: true, pts: [[cx + rx, cy, cx + rx, cy - ry * k, cx + rx, cy + ry * k], [cx, cy + ry, cx + rx * k, cy + ry, cx - rx * k, cy + ry],
        [cx - rx, cy, cx - rx, cy + ry * k, cx - rx, cy - ry * k], [cx, cy - ry, cx - rx * k, cy - ry, cx + rx * k, cy - ry]] }];
}
function vkPoligonoSubs(cx, cy, r, lados, r2 = null, rot = -Math.PI / 2) {
    const n = r2 == null ? lados : lados * 2, pts = [];
    for (let i = 0; i < n; i++) { const rr = r2 != null && i % 2 ? r2 : r, a = rot + i * 2 * Math.PI / n; pts.push(vkPt(cx + rr * Math.cos(a), cy + rr * Math.sin(a))); }
    return [{ fechado: true, pts }];
}
// arco SVG (A rx ry rot grande horario x y) → cúbicas [[c1, c2, p], ...] (≤ 90° cada), conversão do SVG 1.1 (F.6.5)
function vkArcoCubicas(x1, y1, rx, ry, rot, grande, horario, x2, y2) {
    if (Math.abs(x1 - x2) < 1e-9 && Math.abs(y1 - y2) < 1e-9) return [];
    rx = Math.abs(rx); ry = Math.abs(ry); if (!rx || !ry) return [[[x1, y1], [x2, y2], [x2, y2]]];
    const f = rot * Math.PI / 180, cf = Math.cos(f), sf = Math.sin(f);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cf * dx + sf * dy, y1p = -sf * dx + cf * dy;
    const L = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = (grande === horario ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = cf * cxp - sf * cyp + (x1 + x2) / 2, cy = sf * cxp + cf * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!horario && dt > 0) dt -= 2 * Math.PI; else if (horario && dt < 0) dt += 2 * Math.PI;
    const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9), d = dt / n, k = 4 / 3 * Math.tan(d / 4), out = [];
    const P = t => { const c = Math.cos(t), s = Math.sin(t); return [cx + rx * c * cf - ry * s * sf, cy + rx * c * sf + ry * s * cf]; };
    const D = t => { const c = Math.cos(t), s = Math.sin(t); return [-rx * s * cf - ry * c * sf, -rx * s * sf + ry * c * cf]; };
    for (let i = 0; i < n; i++) {
        const a = t1 + i * d, b = a + d, pa = P(a), pb = P(b), da = D(a), db = D(b);
        out.push([[pa[0] + k * da[0], pa[1] + k * da[1]], [pb[0] - k * db[0], pb[1] - k * db[1]], i === n - 1 ? [x2, y2] : pb]);
    }
    return out;
}
function vkSvgD(d) {   // caminho SVG (M L H V C S Q T A Z, absoluto ou relativo) → subs — para o Claude escrever formas
    const t = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
    const subs = []; let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, cur = null, uc = null, uq = null;
    const n = () => { const v = t[i++]; if (/[A-Za-z]/.test(v)) throw new Error(`caminho d: faltou número antes de "${v}" em "${String(d).slice(0, 60)}"`); return +v; };
    while (i < t.length) {
        if (/[A-Za-z]/.test(t[i])) { cmd = t[i++]; if (/[Zz]/.test(cmd)) { if (cur) { cur.fechado = true; const p = cur.pts; if (p.length > 1 && Math.abs(p[0][0] - p.at(-1)[0]) < 1e-6 && Math.abs(p[0][1] - p.at(-1)[1]) < 1e-6) { p[0][2] = p.at(-1)[2]; p[0][3] = p.at(-1)[3]; p.pop(); } } x = sx; y = sy; cur = null; continue; } }
        const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
        if (C === 'M') { x = n() + ox; y = n() + oy; sx = x; sy = y; cur = { fechado: false, pts: [vkPt(x, y)] }; subs.push(cur); cmd = rel ? 'l' : 'L'; uc = null; continue; }
        if (!cur) { cur = { fechado: false, pts: [vkPt(x, y)] }; subs.push(cur); }
        if (C === 'L') { x = n() + ox; y = n() + oy; cur.pts.push(vkPt(x, y)); uc = null; }
        else if (C === 'H') { x = n() + ox; cur.pts.push(vkPt(x, y)); uc = null; }
        else if (C === 'V') { y = n() + oy; cur.pts.push(vkPt(x, y)); uc = null; }
        else if (C === 'C' || C === 'S') {
            const c1 = C === 'C' ? [n() + ox, n() + oy] : (uc ? [2 * x - uc[0], 2 * y - uc[1]] : [x, y]);
            const c2 = [n() + ox, n() + oy]; x = n() + ox; y = n() + oy;
            const u = cur.pts.at(-1); u[4] = c1[0]; u[5] = c1[1]; cur.pts.push([x, y, c2[0], c2[1], x, y]); uc = c2;
        } else if (C === 'Q') {
            const q = [n() + ox, n() + oy], px = n() + ox, py = n() + oy, u = cur.pts.at(-1);
            u[4] = x + 2 / 3 * (q[0] - x); u[5] = y + 2 / 3 * (q[1] - y); cur.pts.push([px, py, px + 2 / 3 * (q[0] - px), py + 2 / 3 * (q[1] - py), px, py]); x = px; y = py; uc = null; uq = q;
            continue;
        } else if (C === 'T') {
            const q = uq ? [2 * x - uq[0], 2 * y - uq[1]] : [x, y], px = n() + ox, py = n() + oy, u = cur.pts.at(-1);
            u[4] = x + 2 / 3 * (q[0] - x); u[5] = y + 2 / 3 * (q[1] - y); cur.pts.push([px, py, px + 2 / 3 * (q[0] - px), py + 2 / 3 * (q[1] - py), px, py]); x = px; y = py; uc = null; uq = q;
            continue;
        } else if (C === 'A') {
            const rx = n(), ry = n(), rot = n(), ga = n(), hr = n(), px = n() + ox, py = n() + oy;
            for (const [c1, c2, p] of vkArcoCubicas(x, y, rx, ry, rot, !!ga, !!hr, px, py)) { const u = cur.pts.at(-1); u[4] = c1[0]; u[5] = c1[1]; cur.pts.push([p[0], p[1], c2[0], c2[1], p[0], p[1]]); }
            x = px; y = py; uc = null;
        } else i++;
        uq = null;
    }
    return subs;
}

// ─────────────────────────── cores ───────────────────────────
function vkCmykCss(v) {
    const k = v.map(x => Math.round(x * 2) / 2).join(',');
    const r = VK.corTela.get(k);
    if (r) return r;
    VK.corTela.set(k, `rgb(${v.slice(0, 3).map(c => Math.round(255 * (1 - Math.min(1, c / 100 + v[3] / 100)))).join(',')})`);
    vkPedirCores(k, v);
    return VK.corTela.get(k);
}
let vkCoresFila = new Map(), vkCoresTimer = 0;
function vkPedirCores(k, v) {   // prova de cor: o perfil de saída (FOGRA39...) diz como o CMYK fica no papel
    const api = vkApi(); if (!api || !api.vk_cores_tela) return;
    vkCoresFila.set(k, v);
    clearTimeout(vkCoresTimer);
    vkCoresTimer = setTimeout(async () => {
        const f = [...vkCoresFila]; vkCoresFila = new Map();
        try { const r = await api.vk_cores_tela(f.map(x => x[1]), (VK.doc && VK.doc.perfil) || 'FOGRA39'); f.forEach(([kk], i) => VK.corTela.set(kk, `rgb(${r[i].join(',')})`)); vkDesenhar(); } catch (e) { /* sem API */ }
    }, 30);
}
function vkCss(c) {
    if (!c) return null;
    if (c.k === 'rgb') return `rgb(${c.v.join(',')})`;
    if (c.k === 'cmyk') return vkCmykCss(c.v);
    if (c.k === 'spot') { const t = (c.tint ?? 100) / 100; return vkCmykCss(c.v.map(x => x * t)); }
    if (c.k === 'reg') return '#000';
    if (c.k === 'grad') return vkCss(c.paradas[0].cor);
    return '#000';
}
function vkCorTexto(c) {   // descrição curta (painéis e mapa para o agente)
    if (!c) return 'nenhum';
    if (c.k === 'cmyk') return `C${vkR(c.v[0], 0)} M${vkR(c.v[1], 0)} Y${vkR(c.v[2], 0)} K${vkR(c.v[3], 0)}`;
    if (c.k === 'rgb') return '#' + c.v.map(x => (+x).toString(16).padStart(2, '0')).join('');
    if (c.k === 'spot') return `${c.nome} ${c.tint ?? 100}%`;
    if (c.k === 'reg') return '[Registro]';
    if (c.k === 'grad') return `degradê ${c.tipo} (${c.paradas.length} cores)`;
    return '?';
}
function vkCorDe(s) {   // texto → cor: "#ff0000", "cmyk(0,100,100,0)", "C0 M100 Y100 K0", "100K", "spot:PANTONE 286 C:100,75,0,0", "nenhum"
    if (s == null) return null;
    if (typeof s === 'object') return s;
    const t = String(s).trim();
    if (/^(nenhum|none|null|)$/i.test(t)) return null;
    if (/^#?[0-9a-f]{6}$/i.test(t)) { const h = t.replace('#', ''); return { k: 'rgb', v: [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }; }
    if (/^#[0-9a-f]{3}$/i.test(t)) return vkCorDe('#' + t.slice(1).split('').map(c => c + c).join(''));
    let m = t.match(/^cmyk\(([^)]*)\)$/i);
    if (m) return { k: 'cmyk', v: m[1].split(/[ ,]+/).map(Number).slice(0, 4) };
    m = t.match(/^C\s*([\d.]+)\s*M\s*([\d.]+)\s*Y\s*([\d.]+)\s*K\s*([\d.]+)$/i);
    if (m) return { k: 'cmyk', v: m.slice(1, 5).map(Number) };
    m = t.match(/^([\d.]+)\s*K$/i);
    if (m) return { k: 'cmyk', v: [0, 0, 0, +m[1]] };
    m = t.match(/^spot:([^:]+):([\d., ]+)(?::([\d.]+))?$/i);
    if (m) return { k: 'spot', nome: m[1].trim(), v: m[2].split(/[ ,]+/).map(Number).slice(0, 4), tint: m[3] ? +m[3] : 100 };
    if (/^registro$/i.test(t)) return { k: 'reg' };
    const am = VK.doc && VK.doc.amostras.find(a => a.nome.toLowerCase() === t.toLowerCase());
    if (am) return vkClone(am.cor);
    throw new Error(`cor "${s}" não entendida: use #rrggbb, C0 M100 Y100 K0, 100K, cmyk(0,100,100,0), spot:NOME:c,m,y,k ou o nome de uma amostra`);
}

// ─────────────────────────── texto (geometria do Python) ───────────────────────────
// campos que mudam a geometria (o spec do Python); estilos já vêm gravados no objeto, encadeamento e trilha em vkTxSpec
const VK_TX_CAMPOS = ['conteudo', 'fam', 'estilo', 'tam', 'entrelinha', 'track', 'alin', 'caixa', 'caixa_alt', 'desl', 'eh', 'ev', 'maius', 'pos', 'liga', 'frac', 'num',
    'recuo_esq', 'recuo_dir', 'recuo_1a', 'antes', 'depois', 'hifen', 'tabs', 'trechos', 'trilha', 'forma', 'forma_recuo', 'eixos'];
const VK_TX_CAIXA = new Set(['caixa', 'caixa_alt', 'trilha', 'forma', 'forma_recuo']);   // da própria caixa; o resto vem do texto-raiz (encadeado)
function vkTxFonte(o, n = 0) {   // texto encadeado: {raiz, ini} — de onde vem o conteúdo desta caixa (null = a anterior ainda calculando)
    const p = o.anterior && vkObj(o.anterior);
    if (!p || p.tipo !== 'texto' || n > 60) return { raiz: o, ini: 0 };
    const fp = vkTxFonte(p, n + 1); if (!fp) return null;
    const g = vkGeo(p); if (!g) return null;
    return { raiz: fp.raiz, ini: g.corte == null ? String(fp.raiz.conteudo).length : fp.ini + g.corte };
}
function vkTxSpec(o) {
    const f = vkTxFonte(o); if (!f) return null;
    const src = f.raiz, s = {};
    for (const k of VK_TX_CAMPOS) { const v = VK_TX_CAIXA.has(k) ? o[k] : src[k]; if (v != null && !(Array.isArray(v) && !v.length)) s[k] = v; }
    if (f.ini) {
        s.conteudo = String(src.conteudo).slice(f.ini);
        if (s.trechos) s.trechos = s.trechos.map(t => ({ ...t, ini: t.ini - f.ini, fim: t.fim - f.ini })).filter(t => t.fim > 0);
        delete s.recuo_1a;
    }
    if (s.trechos) s.trechos = s.trechos.map(({ ec, ...t }) => t);
    if (o.subs && (o.trilha || o.forma)) {   // a guia (trilha/forma) mora em o.subs, no documento — a Seleção direta edita; o motor quer local
        const iv = vkInv(o.m), r4 = v => Math.round(v * 1e4) / 1e4;   // arredonda: mover não muda a forma local → o cache da geometria acerta
        const loc = o.subs.map(sb => ({ fechado: sb.fechado, pts: sb.pts.map(p => [...vkAp(iv, p[0], p[1]), ...vkAp(iv, p[2], p[3]), ...vkAp(iv, p[4], p[5])].map(r4)) }));
        if (o.trilha) s.trilha = { ...o.trilha, subs: loc };
        if (o.forma) { s.forma = loc; const b = vkSubsBox(loc); s.caixa = Math.max(1, b[2] - b[0]); s.caixa_alt = Math.max(1, b[3] - b[1]); }
    }
    if (o.caixa && o.caixa_alt && !o.forma && !o.trilha) { const d = vkTxDesvios(o); if (d.length) s.desvios = d; }
    return s;
}
function vkTxDesvios(o) {   // contorno de texto: objetos ACIMA do texto com desvio_texto que tocam a caixa → polígonos locais + distância
    if (!VK._dv || VK._dv.v !== VK.versaoDoc || VK._dv.doc !== VK.doc) { const t = vkTodos().map(x => x.o); VK._dv = { v: VK.versaoDoc, doc: VK.doc, t, obs: t.filter(x => x.desvio_texto && x.visivel !== false) }; }
    if (!VK._dv.obs.length) return [];
    const i0 = VK._dv.t.indexOf(o), iv = vkInv(o.m), e = vkEsc(o.m) || 1, r4 = v => Math.round(v * 1e4) / 1e4, out = [];
    const cx = [[0, 0], [o.caixa, 0], [o.caixa, o.caixa_alt], [0, o.caixa_alt]].map(([x, y]) => vkAp(o.m, x, y)), bt = [Infinity, Infinity, -Infinity, -Infinity]; cx.forEach(p => vkBoxAdd(bt, p[0], p[1]));
    for (const x of VK._dv.obs) {
        if (VK._dv.t.indexOf(x) < i0 || x === o) continue;
        const b = vkBox(x), d = x.desvio_texto.dist ?? vkPT(3); if (b[2] + d < bt[0] || b[0] - d > bt[2] || b[3] + d < bt[1] || b[1] - d > bt[3]) continue;
        const subs = x.tipo === 'caminho' && x.subs.some(s => s.fechado) ? x.subs.filter(s => s.fechado) : vkRetSubs(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        out.push({ subs: subs.map(s => ({ fechado: true, pts: s.pts.map(p => [...vkAp(iv, p[0], p[1]), ...vkAp(iv, p[2], p[3]), ...vkAp(iv, p[4], p[5])].map(r4)) })), dist: r4(d / e) });
    }
    return out;
}
function vkGeoChave(o) { const s = vkTxSpec(o); return s ? JSON.stringify(s) : null; }
function vkGeo(o) {   // a mesma geometria do PDF (HarfBuzz + fontTools no Python): o que se vê é o que imprime
    const spec = vkTxSpec(o); if (!spec) return null;
    const k = JSON.stringify(spec);
    const g = VK.geo.get(k);
    if (g) return g;
    if (!VK.geoPend.has(k)) {
        const api = vkApi();
        if (!api || !api.vk_texto_geometria) return null;
        VK.geoPend.set(k, api.vk_texto_geometria(spec).then(r => { VK.geo.set(k, r); VK.geoPend.delete(k); vkDesenhar(); vkUiAgendar(); return r; })
            .catch(() => VK.geoPend.delete(k)));
    }
    return null;
}
async function vkGeoPronta(o) {
    const ant = o.anterior && vkObj(o.anterior); if (ant) await vkGeoPronta(ant);
    vkGeo(o); const k = vkGeoChave(o), p = k && VK.geoPend.get(k); if (p) await p; return k ? VK.geo.get(k) : null;
}
async function vkGeosProntas() { for (const { o } of vkTodos()) if (o.tipo === 'texto') await vkGeoPronta(o); }

// ─────────────────────────── desenho ───────────────────────────
function vkCanvas() { return document.getElementById('vk-canvas'); }
function vkPath2d(subs) {
    let p = VK.path2d.get(subs);
    if (p) return p;
    p = new Path2D();
    for (const s of subs) {
        const P = s.pts; if (!P.length) continue;
        p.moveTo(P[0][0], P[0][1]);
        const n = s.fechado ? P.length : P.length - 1;
        for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % P.length]; if (a[4] === a[0] && a[5] === a[1] && b[2] === b[0] && b[3] === b[1]) p.lineTo(b[0], b[1]); else p.bezierCurveTo(a[4], a[5], b[2], b[3], b[0], b[1]); }
        if (s.fechado) p.closePath();
    }
    VK.path2d.set(subs, p);
    return p;
}
const VK_BM = { multiplicacao: 'multiply', divisao: 'screen', sobrepor: 'overlay', luz_suave: 'soft-light', luz_forte: 'hard-light', escurecer: 'darken', clarear: 'lighten',
    diferenca: 'difference', exclusao: 'exclusion', subexposicao: 'color-dodge', superexposicao: 'color-burn', matiz: 'hue', saturacao: 'saturation', cor: 'color', luminosidade: 'luminosity' };
function vkEstiloCanvas(ctx, c, m = null) {
    if (!c || c.k !== 'grad') return vkCss(c);
    let a = c.a, b = c.b || c.a, f = c.f || c.a, r = c.r || 1;
    if (m) { const iv = vkInv(m); a = vkAp(iv, ...a); b = vkAp(iv, ...b); f = vkAp(iv, ...f); r = r / vkEsc(m); }
    const g = c.tipo === 'rad' ? ctx.createRadialGradient(f[0], f[1], 0, a[0], a[1], r) : ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    for (const p of c.paradas) g.addColorStop(Math.max(0, Math.min(1, p.p)), vkCss(p.cor));
    return g;
}
function vkDesenharObj(ctx, o, cam) {
    if (o.visivel === false) return;
    ctx.save();
    if (o.op != null && o.op < 1) ctx.globalAlpha *= o.op;
    if (o.bm && VK_BM[o.bm] && !VK.contorno) ctx.globalCompositeOperation = VK_BM[o.bm];
    if ((o.efeitos || o.aparencia || o.pincel || (o.traco && (o.traco.perfil || o.traco.seta_ini || o.traco.seta_fim))) && typeof vkApDesenhar === 'function' && vkApDesenhar(ctx, o)) { ctx.restore(); return; }   // Aparência/efeitos (vetor-aparencia.js)
    if (o.tipo === 'grupo' && o.opmask && !VK.contorno && typeof vkOpMaskDesenhar === 'function' && vkOpMaskDesenhar(ctx, o, cam)) { ctx.restore(); return; }
    if (o.tipo === 'grupo') {
        if (o.clip && o.itens.length) { ctx.clip(vkPath2d(o.itens[0].subs), o.itens[0].regra === 'evenodd' ? 'evenodd' : 'nonzero'); o.itens.slice(1).forEach(f => vkDesenharObj(ctx, f, cam)); }
        else o.itens.forEach(f => vkDesenharObj(ctx, f, cam));
    } else if (o.tipo === 'caminho' || o.tipo === 'texto') {
        let subs = o.subs, m = null;
        if (o.tipo === 'texto') {
            const g = vkGeo(o); m = o.m; ctx.transform(...m);
            if (!g) {   // geometria ainda vindo: rascunho com a fonte do sistema
                ctx.font = `${o.tam}px "${o.fam}"`; ctx.fillStyle = vkCss(o.preench) || '#000'; ctx.textAlign = { centro: 'center', dir: 'right' }[o.alin] || 'left';
                String(o.conteudo).split('\n').forEach((l, i) => ctx.fillText(l, o.caixa && o.alin === 'centro' ? o.caixa / 2 : 0, (o.caixa ? o.tam * 0.8 : 0) + i * (o.entrelinha || o.tam * 1.2)));
                ctx.restore(); return;
            }
            subs = g.subs;
        }
        const p = vkPath2d(subs), regra = o.regra === 'evenodd' ? 'evenodd' : 'nonzero';
        if (VK.contorno) { ctx.lineWidth = 1 / VK.vista.z / (m ? vkEsc(m) : 1); ctx.strokeStyle = '#000'; ctx.globalAlpha = 1; ctx.stroke(p); }
        else {
            const g = o.tipo === 'texto' && vkGeo(o);
            for (const pa of (g && g.partes) || [null]) {   // texto com trechos coloridos (estilo de caractere): uma parte por cor
                const pp = pa ? vkPath2d(pa.subs) : p, pr = pa && 'preench' in pa ? pa.preench : o.preench;
                const t = pa && 'traco' in pa ? (pa.traco ? { larg: 1, cap: 'butt', junc: 'miter', miter: 4, ...(o.traco || {}), ...pa.traco } : null) : o.traco;
                if (pr) { ctx.fillStyle = vkEstiloCanvas(ctx, pr, m); ctx.fill(pp, regra); }
                if (t && t.cor) {
                    ctx.strokeStyle = vkEstiloCanvas(ctx, t.cor, m); ctx.lineWidth = Math.max(t.larg, 0.0001);
                    ctx.lineCap = t.cap || 'butt'; ctx.lineJoin = t.junc || 'miter'; ctx.miterLimit = t.miter || 4; ctx.setLineDash(t.tracejado || []); ctx.lineDashOffset = t.fase || 0;
                    ctx.stroke(pp);
                }
            }
        }
    } else if (o.tipo === 'instancia') {
        const S = (VK.doc.simbolos || {})[o.simbolo];
        if (S) { ctx.transform(...o.m); S.itens.forEach(f => vkDesenharObj(ctx, f, cam)); }
    } else if (o.tipo === 'malha') {
        if (VK.contorno) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1 / VK.vista.z; const b = vkBox(o); ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); }
        else if (typeof vkMalhaDesenhar === 'function') vkMalhaDesenhar(ctx, o);
    } else if (o.tipo === 'imagem') {
        const im = VK.doc.imagens[o.img];
        ctx.transform(...o.m);
        const el = im && vkImagemEl(im);
        if (VK.contorno || !el || !el.complete || !el.naturalWidth) { ctx.strokeStyle = '#888'; ctx.lineWidth = 1 / VK.vista.z / vkEsc(o.m); ctx.strokeRect(0, 0, (im || {}).w || 10, (im || {}).h || 10); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo((im || {}).w || 10, (im || {}).h || 10); ctx.stroke(); }
        else ctx.drawImage(el, 0, 0, im.w, im.h);
    }
    ctx.restore();
}
function vkImagemEl(im) {
    if (!im.url) return null;
    let el = VK.imgs.get(im.url);
    if (!el) { el = new Image(); el.crossOrigin = 'anonymous'; el.onload = () => vkDesenhar(); el.src = im.url; VK.imgs.set(im.url, el); }
    return el;
}
let vkPedido = 0;
function vkDesenhar() { if (!vkPedido) vkPedido = requestAnimationFrame(() => { vkPedido = 0; vkDesenharAgora(); }); }
function vkDesenharAgora() {
    const cv = vkCanvas(); if (!cv) return;
    const box = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(box.width * dpr) || cv.height !== Math.round(box.height * dpr)) {
        cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr); cv.style.width = box.width + 'px'; cv.style.height = box.height + 'px';
    }
    const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = getComputedStyle(cv).getPropertyValue('--vk-mesa') || '#3a3a3a'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (!VK.doc) return;
    const v = VK.vista, Z = v.z * dpr;
    ctx.setTransform(Z, 0, 0, Z, v.x * dpr, v.y * dpr);
    // pranchetas (papel branco) com sombra
    for (const a of VK.doc.pranchetas) {
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 8 * dpr; ctx.fillStyle = '#fff'; ctx.fillRect(a.x, a.y, a.w, a.h); ctx.restore();
    }
    if (typeof vkGradeDesenhar === 'function') vkGradeDesenhar(ctx);
    if (typeof vkSepPronto === 'function' && vkSepPronto()) vkSepDesenhar(ctx);   // Visualização de separações / sobreimpressão
    else for (let i = 0; i < VK.doc.camadas.length; i++) {
        const c = VK.doc.camadas[i]; if (c.visivel === false) continue;
        for (const o of c.itens) vkDesenharObj(ctx, o, c);
    }
    // bordas: prancheta (preta fina), sangria (vermelha), nome
    ctx.lineWidth = 1 / Z * dpr;
    const b = VK.doc.sangria || 0;
    for (const a of VK.doc.pranchetas) {
        ctx.strokeStyle = a.id === VK.ativa ? '#000' : 'rgba(0,0,0,.55)'; ctx.setLineDash([]); ctx.strokeRect(a.x, a.y, a.w, a.h);
        if (VK.mostrarSangria && b > 0) { ctx.strokeStyle = 'rgba(230,30,40,.85)'; ctx.strokeRect(a.x - b, a.y - b, a.w + 2 * b, a.h + 2 * b); }
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = a.id === VK.ativa ? '#ddd' : '#999'; ctx.font = '11px system-ui';
        ctx.fillText(a.nome, a.x * v.z + v.x, (a.y - b) * v.z + v.y - 6); ctx.restore();
    }
    // guias
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = 'rgba(0,200,255,.8)'; ctx.lineWidth = 1;
    if (!VK.guiasOcultas) for (const g of VK.doc.guias || []) { ctx.beginPath(); if (g.eixo === 'x') { const x = g.pos * v.z + v.x; ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); } else { const y = g.pos * v.z + v.y; ctx.moveTo(0, y); ctx.lineTo(cv.width, y); } ctx.stroke(); }
    ctx.restore();
    if (typeof vkDesenharSobreposicao === 'function') { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); vkDesenharSobreposicao(ctx); ctx.restore(); }
    if (typeof vkReguasDesenhar === 'function') { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); vkReguasDesenhar(ctx); ctx.restore(); }
}
const vkTela = (x, y) => [x * VK.vista.z + VK.vista.x, y * VK.vista.z + VK.vista.y];
const vkDoc = (sx, sy) => [(sx - VK.vista.x) / VK.vista.z, (sy - VK.vista.y) / VK.vista.z];
function vkEnquadrar(b = null) {   // Ctrl+0: prancheta ativa; Alt+Ctrl+0: tudo
    const cv = vkCanvas(); if (!cv || !VK.doc) return;
    const r = cv.parentElement.getBoundingClientRect();
    if (!b) { const a = VK.doc.pranchetas.find(p => p.id === VK.ativa) || VK.doc.pranchetas[0], sg = (VK.doc.sangria || 0) + 6; b = [a.x - sg, a.y - sg, a.x + a.w + sg, a.y + a.h + sg]; }
    const m = 40, z = Math.min((r.width - 2 * m) / (b[2] - b[0] || 1), (r.height - 2 * m) / (b[3] - b[1] || 1));
    VK.vista.z = Math.max(0.02, Math.min(64, z));
    VK.vista.x = r.width / 2 - (b[0] + b[2]) / 2 * VK.vista.z; VK.vista.y = r.height / 2 - (b[1] + b[3]) / 2 * VK.vista.z;
    vkDesenhar(); vkUiAgendar();
}
function vkZoom(f, sx = null, sy = null) {
    const cv = vkCanvas(); if (!cv) return;
    const r = cv.parentElement.getBoundingClientRect();
    if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
    const [dx, dy] = vkDoc(sx, sy);
    VK.vista.z = Math.max(0.02, Math.min(64, VK.vista.z * f));
    VK.vista.x = sx - dx * VK.vista.z; VK.vista.y = sy - dy * VK.vista.z;
    vkDesenhar(); vkUiAgendar();
}

// ─────────────────────────── teste de clique ───────────────────────────
let vkHitCtx = null;
function vkAcerta(o, x, y, tol) {   // x, y no documento; tol em pt
    if (!vkHitCtx) vkHitCtx = document.createElement('canvas').getContext('2d');
    const c = vkHitCtx; c.setTransform(1, 0, 0, 1, 0, 0);
    if (o.visivel === false) return false;
    if (o.tipo === 'grupo') {
        if (o.clip && o.itens.length && !c.isPointInPath(vkPath2d(o.itens[0].subs), x, y)) return false;
        return (o.clip ? o.itens.slice(1) : o.itens).some(f => vkAcerta(f, x, y, tol));
    }
    if (o.tipo === 'instancia') { const S = (VK.doc.simbolos || {})[o.simbolo]; if (!S) return false; const [u, v] = vkAp(vkInv(o.m), x, y), t = tol / vkEsc(o.m); return S.itens.some(f => vkAcerta(f, u, v, t)); }
    if (o.tipo === 'imagem') { const im = VK.doc.imagens[o.img] || { w: 1, h: 1 }; const [u, v] = vkAp(vkInv(o.m), x, y); return u >= 0 && v >= 0 && u <= im.w && v <= im.h; }
    if (o.tipo === 'texto') {
        const g = vkGeo(o), b = vkBox(o);
        if (o.forma && o.subs) return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
        if (!g || (o.caixa && o.caixa_alt)) { const [u, v] = vkAp(vkInv(o.m), x, y), t = tol / vkEsc(o.m); return o.caixa && o.caixa_alt ? u >= -t && v >= -t && u <= o.caixa + t && v <= o.caixa_alt + t : x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; }
        const [u, v] = vkAp(vkInv(o.m), x, y), s = vkEsc(o.m);
        // texto: a caixa das letras de cada linha (clicar entre letras também pega, como no Illustrator)
        const lb = vkSubsBox(g.subs);
        return u >= lb[0] - tol / s && u <= lb[2] + tol / s && v >= lb[1] - tol / s && v <= lb[3] + tol / s;
    }
    const p = vkPath2d(o.subs);
    if (o.preench && c.isPointInPath(p, x, y, o.regra === 'evenodd' ? 'evenodd' : 'nonzero')) return true;
    c.lineWidth = Math.max((o.traco && o.traco.larg) || 0, tol * 2);
    return c.isPointInStroke(p, x, y);
}
function vkObjEm(x, y, direto = false) {   // de cima para baixo; Seleção devolve o objeto de topo, Seleção direta o próprio
    const tol = 4 / VK.vista.z;
    for (let i = VK.doc.camadas.length - 1; i >= 0; i--) {
        const cam = VK.doc.camadas[i]; if (cam.visivel === false || cam.trava) continue;
        for (let j = cam.itens.length - 1; j >= 0; j--) {
            const o = cam.itens[j];
            if (o.trava || o.visivel === false || !vkAcerta(o, x, y, tol)) continue;
            if (!direto || o.tipo !== 'grupo') return o;
            const fundo = (g) => { for (let k = g.itens.length - 1; k >= (g.clip ? 1 : 0); k--) { const f = g.itens[k]; if (!f.trava && vkAcerta(f, x, y, tol)) return f.tipo === 'grupo' ? fundo(f) : f; } return g.clip ? g.itens[0] : null; };
            return fundo(o) || o;
        }
    }
    return null;
}

// ─────────────────────────── histórico e comandos ───────────────────────────
function vkSnap() { return JSON.stringify({ doc: VK.doc, sel: VK.sel }, (k, v) => (k[0] === '_' ? undefined : v)); }
function vkHistorico(nome) {
    VK.hist.push({ nome, s: VK._antes || vkSnap() }); VK._antes = null;
    if (VK.hist.length > 100) VK.hist.shift();
    VK.futuro = []; VK.sujo = true;
}
function vkDesfazer() { if (!VK.hist.length) return; const h = VK.hist.pop(); VK.futuro.push({ nome: h.nome, s: vkSnap() }); vkRestaurar(h.s); vkToast('Desfeito: ' + h.nome); }
function vkRefazer() { if (!VK.futuro.length) return; const h = VK.futuro.pop(); VK.hist.push({ nome: h.nome, s: vkSnap() }); vkRestaurar(h.s); vkToast('Refeito: ' + h.nome); }
function vkRestaurar(s) { const d = JSON.parse(s); VK.doc = d.doc; VK.sel = (d.sel || []).filter(id => vkObj(id)); VK.selPts = null; vkMudou(); }
function vkMudou() { VK.versaoDoc = (VK.versaoDoc || 0) + 1; if (typeof vkSepInvalidar === 'function') vkSepInvalidar(); vkDesenhar(); vkUiAgendar(); VK.ouvintes.forEach(f => { try { f(); } catch (e) { /* ouvinte */ } }); }
let vkUiTimer = 0;
function vkUiAgendar() { if (!vkUiTimer) vkUiTimer = requestAnimationFrame(() => { vkUiTimer = 0; if (typeof vkUiAtualizar === 'function') vkUiAtualizar(); }); }
function vkToast(t) { if (typeof vkAviso === 'function') vkAviso(t); else console.log('[Vetor]', t); }
// Comandos: {nome: {desc, fn(args) → resultado, leitura?: true}}. vkCmd registra no histórico, redesenha e loga.
const VK_CMDS = {};
function vkRegistrar(nome, desc, fn, leitura = false) { VK_CMDS[nome] = { desc, fn, leitura }; }
async function vkCmd(nome, args = {}, origem = 'ui') {
    const c = VK_CMDS[nome];
    if (!c) throw new Error(`comando "${nome}" não existe; há: ${Object.keys(VK_CMDS).join(', ')}`);
    if (!VK.doc && !['novo', 'abrir', 'ajuda', 'recuperacao', 'bibliotecas_cor', 'fonte_modelo'].includes(nome)) throw new Error('nenhum documento aberto: use novo ou abrir');
    if (c.leitura) return await c.fn(args || {});
    VK._antes = VK.doc ? vkSnap() : null;
    try {
        const r = await c.fn(args || {});
        if (VK.doc && VK._antes) vkHistorico(c.desc || nome);   // comando que zerou _antes (abrir, salvar, exportar) não entra no histórico
        VK.log.push({ t: Date.now(), origem, nome, args: JSON.stringify(args).slice(0, 300) });
        if (VK.log.length > 300) VK.log.shift();
        if (origem !== 'ui' && typeof vkAvisoAgente === 'function') vkAvisoAgente(`${origem === 'worker' ? 'Worker' : 'Claude'}: ${c.desc || nome}`);
        vkMudou();
        return r;
    } catch (e) {
        if (VK._antes) { VK._antes = null; }
        throw e;
    }
}
