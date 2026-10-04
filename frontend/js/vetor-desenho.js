// Vetor Kanivete — DESENHO À MÃO e TRAÇO (Illustrator): Lápis (N), Pincel (B), Pincel de bolha (Shift+B), Borracha
// (Shift+E), ferramenta Largura (Shift+W), Simplificar caminho, SETAS e PERFIL DE LARGURA no traço.
// traco.perfil = [[t (0-1 ao longo do caminho), largura relativa], ...]; traco.seta_ini/seta_fim = seta|triangulo|circulo|
// quadrado|barra; traco.seta_esc (%). Traço com perfil/setas é desenhado como formas (vkDsTraco → pinturas da Aparência),
// então tela e PDF saem iguais. Bolha e borracha usam o Python (contornar traço + Pathfinder).
Object.assign(VK_FERR, {
    lapis: { nome: 'Lápis', tecla: 'N', cursor: 'crosshair' }, pincel: { nome: 'Pincel', tecla: 'B', cursor: 'crosshair' },
    bolha: { nome: 'Pincel de bolha', tecla: 'Shift+B', cursor: 'crosshair' }, borracha: { nome: 'Borracha', tecla: 'Shift+E', cursor: 'crosshair' },
    largura: { nome: 'Largura (arraste no traço)', tecla: 'Shift+W', cursor: 'ew-resize' },
});
Object.assign(VK_ICO, {
    lapis: '<path d="M4 20l1.5-5L16 4.5l3.5 3.5L9 18.5z"/><path d="M14 6.5l3.5 3.5"/>',
    pincel: '<path d="M14 4l6 6-7 4-3-3z"/><path d="M10 11c-3 0-5 2-5 5 0 2-1 3-2 3 4 1 9 0 9-4"/>',
    bolha: '<path d="M5 16c0-4 4-4 6-7s5-4 7-2-1 5-3 7-3 6-6 6-4-1-4-4z"/>',
    borracha: '<path d="M8 20h12M4 15l9-9 6 6-8 8H8z"/><path d="M9 10l6 6"/>',
    largura: '<path d="M3 12c4-6 14-6 18 0-4 6-14 6-18 0z"/><path d="M12 7v10"/>',
});
Object.assign(VK_OPC, { fidelidade: 6, pincel: 3, perfil: 'lente', bolha: vkPT(4), borracha: vkPT(4) });
const VK_PERFIS = { uniforme: null, lente: [[0, 0], [0.5, 1], [1, 0]], afinar: [[0, 1], [1, 0]], afinar_inicio: [[0, 0], [1, 1]], gota: [[0, 0.15], [0.75, 1], [1, 0]],
    bico: [[0, 0.3], [0.2, 1], [1, 0.05]] };
function vkDsPerfil(p) { if (p == null || p === '' || p === 'uniforme') return null; if (Array.isArray(p)) return p.map(([t, w]) => [Math.max(0, Math.min(1, +t)), Math.max(0, +w)]).sort((a, b) => a[0] - b[0]); const v = VK_PERFIS[p]; if (v === undefined) throw new Error(`perfil "${p}" não existe; há: ${Object.keys(VK_PERFIS).join(', ')} ou [[t, largura], ...]`); return v && vkClone(v); }

// ── mão livre → Bézier (como o Lápis do Illustrator): reamostra a trilha em passo uniforme, acha os cantos de verdade,
// suaviza o tremido (gaussiana, Fidelidade "Suave") e ajusta cúbicas por mínimos quadrados (Schneider 1990: a curva passa
// PERTO dos pontos, dentro do erro, e não por cada um — é isso que tira o tremido) ──
const vkV = { sub: (a, b) => [a[0] - b[0], a[1] - b[1]], add: (a, b) => [a[0] + b[0], a[1] + b[1]], mul: (a, s) => [a[0] * s, a[1] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1],
    len: a => Math.hypot(a[0], a[1]), unit: a => { const l = Math.hypot(a[0], a[1]) || 1e-12; return [a[0] / l, a[1] / l]; }, dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) };
function vkDsReamostrar(P, passo) {
    const out = [[P[0][0], P[0][1]]]; let acc = 0;
    for (let i = 1; i < P.length; i++) {
        const [ax, ay] = P[i - 1], [bx, by] = P[i], seg = Math.hypot(bx - ax, by - ay); if (seg < 1e-9) continue;
        let pos = passo - acc;
        while (pos <= seg) { out.push([ax + (bx - ax) * pos / seg, ay + (by - ay) * pos / seg]); pos += passo; }
        acc = seg - (pos - passo);
    }
    const fim = P[P.length - 1];
    if (vkV.dist(out[out.length - 1], fim) > passo * 0.3) out.push([fim[0], fim[1]]); else out[out.length - 1] = [fim[0], fim[1]];
    return out;
}
function vkDsCantos(R, k, limiar = 70) {   // índices onde a direção vira mais que `limiar` graus (máximo local)
    const ang = R.map((p, i) => {
        if (i < k || i >= R.length - k) return 0;
        const u = vkV.unit(vkV.sub(p, R[i - k])), v = vkV.unit(vkV.sub(R[i + k], p));
        return Math.acos(Math.max(-1, Math.min(1, vkV.dot(u, v)))) * 180 / Math.PI;
    });
    const out = [];
    for (let i = k; i < R.length - k; i++) if (ang[i] > limiar && ang.slice(Math.max(0, i - k), i + k + 1).every(a => a <= ang[i]) && (!out.length || i - out[out.length - 1] > k)) out.push(i);
    return out;
}
function vkDsSuavizar(R, raio, fechado) {   // gaussiana; pontas fixas (aberto)
    if (raio < 1 || R.length < 3) return R;
    const n = R.length, sig = raio / 2, w = [];
    for (let j = -raio; j <= raio; j++) w.push(Math.exp(-j * j / (2 * sig * sig)));
    return R.map((p, i) => {
        if (!fechado && (i === 0 || i === n - 1)) return p;
        const r = fechado ? raio : Math.min(raio, i, n - 1 - i);
        let sx = 0, sy = 0, sw = 0;
        for (let j = -r; j <= r; j++) { const q = R[fechado ? (i + j + n) % n : i + j], ww = w[j + raio]; sx += q[0] * ww; sy += q[1] * ww; sw += ww; }
        return [sx / sw, sy / sw];
    });
}
function vkDsSchneider(P, erro, t1, t2) {   // → [[p0, c1, c2, p3], ...]
    const { sub, add, mul, dot, unit, dist } = vkV, e2 = erro * erro, segs = [];
    const B = (p, u) => { const v = 1 - u; return add(add(mul(p[0], v * v * v), mul(p[1], 3 * v * v * u)), add(mul(p[2], 3 * v * u * u), mul(p[3], u * u * u))); };
    const B1 = (p, u) => { const v = 1 - u; return add(add(mul(sub(p[1], p[0]), 3 * v * v), mul(sub(p[2], p[1]), 6 * v * u)), mul(sub(p[3], p[2]), 3 * u * u)); };
    const B2 = (p, u) => add(mul(add(sub(p[2], mul(p[1], 2)), p[0]), 6 * (1 - u)), mul(add(sub(p[3], mul(p[2], 2)), p[1]), 6 * u));
    const corda = (a, b) => { const u = [0]; for (let i = a + 1; i <= b; i++) u.push(u[u.length - 1] + dist(P[i], P[i - 1])); const L = u[u.length - 1] || 1; return u.map(x => x / L); };
    const gerar = (a, b, u, ta, tb) => {
        const p0 = P[a], p3 = P[b]; let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
        for (let i = 0; i < u.length; i++) {
            const t = u[i], v = 1 - t, A0 = mul(ta, 3 * v * v * t), A1 = mul(tb, 3 * v * t * t);
            c00 += dot(A0, A0); c01 += dot(A0, A1); c11 += dot(A1, A1);
            const tmp = sub(P[a + i], add(mul(p0, v * v * v + 3 * v * v * t), mul(p3, 3 * v * t * t + t * t * t)));
            x0 += dot(A0, tmp); x1 += dot(A1, tmp);
        }
        const det = c00 * c11 - c01 * c01, L = dist(p0, p3);
        let al = det ? (x0 * c11 - x1 * c01) / det : 0, ar = det ? (c00 * x1 - c01 * x0) / det : 0;
        if (al < 1e-6 * L || ar < 1e-6 * L || al > L * 2 || ar > L * 2) al = ar = L / 3;
        return [p0, add(p0, mul(ta, al)), add(p3, mul(tb, ar)), p3];
    };
    const maxErro = (a, b, bz, u) => { let m = 0, k = Math.floor((a + b) / 2); for (let i = a + 1; i < b; i++) { const d = sub(B(bz, u[i - a]), P[i]), q = dot(d, d); if (q >= m) { m = q; k = i; } } return [m, k]; };
    const newton = (bz, p, u) => { const d = sub(B(bz, u), p), q1 = B1(bz, u), q2 = B2(bz, u), den = dot(q1, q1) + dot(d, q2); return den ? Math.max(0, Math.min(1, u - dot(d, q1) / den)) : u; };
    const ajustar = (a, b, ta, tb, n = 0) => {
        if (b - a === 1 || n > 40) { const d = dist(P[a], P[b]) / 3; segs.push([P[a], add(P[a], mul(ta, d)), add(P[b], mul(tb, d)), P[b]]); return; }
        let u = corda(a, b), bz = gerar(a, b, u, ta, tb), [m, k] = maxErro(a, b, bz, u);
        if (m < e2) { segs.push(bz); return; }
        if (m < e2 * 16) for (let it = 0; it < 12; it++) {
            u = u.map((t, i) => newton(bz, P[a + i], t)); bz = gerar(a, b, u, ta, tb); [m, k] = maxErro(a, b, bz, u);
            if (m < e2) { segs.push(bz); return; }
        }
        k = Math.max(a + 1, Math.min(b - 1, k));
        const tc = unit(sub(P[k - 1], P[k + 1]));
        ajustar(a, k, ta, tc, n + 1); ajustar(k, b, mul(tc, -1), tb, n + 1);
    };
    ajustar(0, P.length - 1, t1, t2);
    return segs;
}
// trilha da mão → subcaminho. op = {erro (pt: quanto a curva pode se afastar), passo (pt), raio (amostras de suavização), cantos (graus)}
function vkDsCurva(pts, fechado, op) {
    const erro = Math.max(0.05, op.erro || 1), passo = Math.max(0.05, op.passo || erro / 2), raio = Math.max(0, Math.round(op.raio || 0));
    let R = vkDsReamostrar(pts, passo);
    if (R.length < 2) return null;
    if (fechado && vkV.dist(R[0], R[R.length - 1]) > passo * 0.5) R.push([R[0][0], R[0][1]]);
    const segs = [];
    if (fechado && (op.cantos ?? 150) >= 150) {   // laço à mão: suaviza a volta toda e ajusta em 4 trechos com tangente contínua
        const L = vkDsSuavizar(R.slice(0, -1), raio, true), n = L.length, m = Math.max(1, Math.min(Math.floor(n / 8), Math.round(erro * 1.5 / passo)));
        if (n < 8) return null;
        const tan = i => vkV.unit(vkV.sub(L[(i + m) % n], L[(i - m + n) % n]));
        const cs = [0, 1, 2, 3].map(q => Math.round(q * n / 4));
        for (let q = 0; q < 4; q++) {
            const a = cs[q], b = q < 3 ? cs[q + 1] : n, pd = [];
            for (let i = a; i <= b; i++) pd.push(L[i % n]);
            segs.push(...vkDsSchneider(pd, erro, tan(a), vkV.mul(tan(b % n), -1)));
        }
    } else {
        // suaviza primeiro (o tremido some) e SÓ DEPOIS procura cantos: na mão livre só um bico (> 150°) vira canto;
        // em Simplificar (cantos: 45) os cantos vivos do desenho original continuam
        const S = vkDsSuavizar(R, raio, false), k = op.janela || 3;
        const cantos = S.length > 2 * k + 1 ? vkDsCantos(S, k, op.cantos ?? 150) : [];
        const cortes = [0, ...cantos, S.length - 1];
        for (let i = 0; i < cortes.length - 1; i++) {
            const pd = S.slice(cortes[i], cortes[i + 1] + 1); if (pd.length < 2) continue;
            const m = Math.max(1, Math.min(pd.length - 1, Math.max(3, Math.round(erro * 1.5 / passo))));   // tangente da ponta num trecho maior (sem gancho)
            segs.push(...vkDsSchneider(pd, erro, vkV.unit(vkV.sub(pd[m], pd[0])), vkV.unit(vkV.sub(pd[pd.length - 1 - m], pd[pd.length - 1]))));
        }
    }
    if (!segs.length) return null;
    const out = [[...segs[0][0], ...segs[0][0], ...segs[0][1]]];
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i], prox = segs[i + 1];
        out.push([...s[3], ...s[2], ...(prox ? prox[1] : s[3])]);
    }
    if (fechado && out.length > 2) { const u = out.pop(); out[0][2] = u[2]; out[0][3] = u[3]; }
    return { fechado: !!fechado, pts: out };
}
function vkDsBezier(pts, fechado, tol, raio = 0) { return vkDsCurva(pts, fechado, { erro: tol, raio }); }
// caminho → polilinha com comprimento acumulado [(x, y, s)]
function vkDsAmostrar(sub, passos = 16, retas = false) {   // retas = divide também os segmentos retos (perfil, Largura)
    const P = sub.pts, out = []; if (!P.length) return out;
    out.push([P[0][0], P[0][1], 0]);
    const n = sub.fechado ? P.length : P.length - 1;
    for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % P.length], reto = a[4] === a[0] && a[5] === a[1] && b[2] === b[0] && b[3] === b[1];
        const m = reto && !retas ? 1 : passos;
        for (let k = 1; k <= m; k++) {
            const t = k / m, u = 1 - t;
            const x = u * u * u * a[0] + 3 * u * u * t * a[4] + 3 * u * t * t * b[2] + t * t * t * b[0], y = u * u * u * a[1] + 3 * u * u * t * a[5] + 3 * u * t * t * b[3] + t * t * t * b[1];
            const q = out[out.length - 1], d = Math.hypot(x - q[0], y - q[1]); if (d < 1e-6) continue;
            out.push([x, y, q[2] + d]);
        }
    }
    return out;
}
function vkDsLargEm(perfil, t) {   // largura relativa em t (interpolação suave entre os pontos do perfil)
    if (!perfil || !perfil.length) return 1;
    if (t <= perfil[0][0]) return perfil[0][1];
    for (let i = 1; i < perfil.length; i++) if (t <= perfil[i][0]) { const [t0, w0] = perfil[i - 1], [t1, w1] = perfil[i], u = (t - t0) / ((t1 - t0) || 1e-9), s = u * u * (3 - 2 * u); return w0 + (w1 - w0) * s; }
    return perfil.at(-1)[1];
}
// traço de largura variável → forma (subs) : contorno esquerdo + direito
function vkDsContornoPerfil(sub, larg, perfil) {
    const pl = vkDsAmostrar(sub, 24, true); if (pl.length < 2) return [];
    const L = pl.at(-1)[2] || 1, esq = [], dir = [];
    for (let i = 0; i < pl.length; i++) {
        const a = pl[Math.max(0, i - 1)], b = pl[Math.min(pl.length - 1, i + 1)];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const nl = Math.hypot(nx, ny) || 1e-9; nx /= nl; ny /= nl;
        const w = larg * vkDsLargEm(perfil, pl[i][2] / L) / 2, [x, y] = pl[i];
        esq.push([x + nx * w, y + ny * w]); dir.push([x - nx * w, y - ny * w]);
    }
    const P = q => [q[0], q[1], q[0], q[1], q[0], q[1]];
    if (sub.fechado) return [{ fechado: true, pts: esq.map(P) }, { fechado: true, pts: dir.reverse().map(P) }];
    return [{ fechado: true, pts: [...esq, ...dir.reverse()].map(P) }];
}
// ── setas ──
function vkDsTangente(sub, fim) {   // ponto da ponta e direção para FORA do caminho
    const P = sub.pts, p = fim ? P.at(-1) : P[0];
    let q = fim ? [p[2], p[3]] : [p[4], p[5]];
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) { const o = fim ? P.at(-2) : P[1]; q = fim ? [o[4], o[5]] : [o[2], o[3]]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) q = [o[0], o[1]]; }
    const dx = p[0] - q[0], dy = p[1] - q[1], d = Math.hypot(dx, dy) || 1;
    return { p: [p[0], p[1]], d: [dx / d, dy / d] };
}
function vkDsAparar(sub, fim, dist) {   // encurta a ponta do caminho aberto em `dist` pt (a seta cobre)
    const P = sub.pts.map(p => [...p]); if (P.length < 2 || dist <= 0) return { ...sub, pts: P };
    const i = fim ? P.length - 2 : 0, a = P[i], b = P[i + 1];
    const c = t => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * a[4] + 3 * u * t * t * b[2] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * a[5] + 3 * u * t * t * b[3] + t * t * t * b[1]]; };
    const N = 40, ac = [0]; let ant = c(0);
    for (let k = 1; k <= N; k++) { const q = c(k / N); ac.push(ac[k - 1] + Math.hypot(q[0] - ant[0], q[1] - ant[1])); ant = q; }
    const L = ac[N]; if (L < 1e-6) return { ...sub, pts: P };
    const alvo = fim ? Math.max(L * 0.1, L - dist) : Math.min(L * 0.9, dist);
    let k = 1; while (k < N && ac[k] < alvo) k++;
    const t = (k - 1 + (alvo - ac[k - 1]) / ((ac[k] - ac[k - 1]) || 1e-9)) / N;
    // de Casteljau em t
    const l = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const p0 = [a[0], a[1]], p1 = [a[4], a[5]], p2 = [b[2], b[3]], p3 = [b[0], b[1]];
    const p01 = l(p0, p1, t), p12 = l(p1, p2, t), p23 = l(p2, p3, t), p012 = l(p01, p12, t), p123 = l(p12, p23, t), m = l(p012, p123, t);
    if (fim) { a[4] = p01[0]; a[5] = p01[1]; P[i + 1] = [m[0], m[1], p012[0], p012[1], m[0], m[1]]; }
    else { P[0] = [m[0], m[1], m[0], m[1], p123[0], p123[1]]; b[2] = p23[0]; b[3] = p23[1]; }
    return { ...sub, pts: P };
}
function vkDsSeta(tipo, ponta, larg, esc) {   // forma da seta na ponta → subs
    const L = Math.max(larg, 0.25) * 4 * (esc || 100) / 100, { p, d } = ponta, nx = -d[1], ny = d[0];
    const T = (u, v) => { const x = p[0] + d[0] * u + nx * v, y = p[1] + d[1] * u + ny * v; return [x, y, x, y, x, y]; };
    const poli = l => [{ fechado: true, pts: l.map(([u, v]) => T(u, v)) }];
    if (tipo === 'triangulo') return poli([[0, 0], [-L, L * 0.5], [-L, -L * 0.5]]);
    if (tipo === 'seta') return poli([[0, 0], [-L, L * 0.55], [-L * 0.7, 0], [-L, -L * 0.55]]);
    if (tipo === 'quadrado') return poli([[L * 0.3, L * 0.3], [-L * 0.3, L * 0.3], [-L * 0.3, -L * 0.3], [L * 0.3, -L * 0.3]]);
    if (tipo === 'barra') return poli([[larg / 2, L * 0.5], [-larg / 2, L * 0.5], [-larg / 2, -L * 0.5], [larg / 2, -L * 0.5]]);
    if (tipo === 'circulo') { const r = L * 0.35, k = 0.5523 * r, c = (u, v, iu, iv, ou, ov) => { const a = T(u, v), b = T(iu, iv), o = T(ou, ov); return [a[0], a[1], b[0], b[1], o[0], o[1]]; };
        return [{ fechado: true, pts: [c(r, 0, r, -k, r, k), c(0, r, k, r, -k, r), c(-r, 0, -r, k, -r, -k), c(0, -r, -k, -r, k, -r)] }]; }
    return [];
}
const VK_SETA_APARA = { seta: 0.75, triangulo: 0.9, quadrado: 0, circulo: 0, barra: 0 };
// pinturas de um caminho cujo traço tem perfil e/ou setas (chamado por vkApBase)
function vkDsTraco(subs, regra, preench, t) {
    const out = [];
    if (preench) out.push({ subs, regra, preench, traco: null });
    const larg = t.larg ?? 1, esc = t.seta_esc || 100;
    for (const s0 of subs) {
        if (s0.pts.length < 2) continue;
        let s = s0; const setas = [];
        if (!s0.fechado) for (const fim of [false, true]) {
            const tipo = fim ? t.seta_fim : t.seta_ini; if (!tipo) continue;
            const pl = vkDsAmostrar(s0, 8), L = pl.length ? pl.at(-1)[2] : 0;
            const larp = larg * (t.perfil ? Math.max(0.25, vkDsLargEm(t.perfil, fim ? 1 : 0)) : 1);
            setas.push(...vkDsSeta(tipo, vkDsTangente(s0, fim), larp, esc));
            const ap = (VK_SETA_APARA[tipo] || 0) * Math.max(larp, 0.25) * 4 * esc / 100;
            if (ap > 0 && ap < L * 0.9) s = vkDsAparar(s, fim, ap);
        }
        if (t.perfil) out.push({ subs: vkDsContornoPerfil(s, larg, t.perfil), regra: 'nonzero', preench: t.cor, traco: null });
        else out.push({ subs: [s], regra: 'nonzero', preench: null, traco: t });
        if (setas.length) out.push({ subs: setas, regra: 'nonzero', preench: t.cor, traco: null });
    }
    return out;
}
function vkDsTracoEspecial(t) { return !!(t && t.cor && (t.perfil || t.seta_ini || t.seta_fim)); }

// ── comandos ──
(() => {
    const conv = a => { if (a.un === 'pt') return [v => +v, v => +v, v => +v]; const p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0]; return [v => p.x + vkPT(+v), v => p.y + vkPT(+v), v => vkPT(+v)]; };
    const pontos = a => { const [X, Y] = conv(a); const P = (a.pontos || []).map(q => [X(q[0]), Y(q[1])]); if (P.length < 2) throw new Error('faltam pontos: pontos = [[x, y], ...] (mm da prancheta)'); return P; };
    const camada = () => VK.doc.camadas.find(c => c.id === VK.camadaAtiva && !c.trava) || VK.doc.camadas.filter(c => !c.trava).pop();
    // lápis/pincel: pontos → caminho suave. fidelidade (mm) = quanto a curva pode se afastar dos pontos; suavizar 0-10
    // (tira o tremido da mão; padrão 3); perfil p/ pincel. A interface manda erro/passo/raio prontos (pt).
    vkRegistrar('lapis', 'lápis', a => {
        const [, , D] = conv(a), P = pontos(a), erro = a.erro != null ? +a.erro : D(a.fidelidade ?? 0.4);
        const op = { erro, passo: a.passo != null ? +a.passo : Math.max(erro / 2, D(0.1)), raio: a.raio != null ? +a.raio : Math.round((a.suavizar ?? 3) * 1.5) };
        const fechar = a.fechar ?? (Math.hypot(P[0][0] - P.at(-1)[0], P[0][1] - P.at(-1)[1]) < Math.max(erro * 4, op.passo * 6) && P.length > 4);
        const sub = vkDsCurva(P, fechar, op); if (!sub) throw new Error('lápis: traço curto demais');
        const tc = 'traco' in a ? vkCorDe(a.traco) : (VK.traco ? vkClone(VK.traco) : { k: 'cmyk', v: [0, 0, 0, 100] });
        const o = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: [sub], preench: 'preench' in a ? vkCorDe(a.preench) : null,
            traco: tc ? { cor: tc, larg: a.espessura != null ? +a.espessura : 1, cap: 'round', junc: 'round', miter: 4, tracejado: [], fase: 0 } : null };   // espessura em pt (como no Illustrator)
        const pf = a.perfil != null ? vkDsPerfil(a.perfil) : null; if (pf && o.traco) o.traco.perfil = pf;
        if (a.nome) o.nome = a.nome;
        const cam = camada(); cam.itens.push(o); VK.sel = [o.id];
        return { id: o.id, pontos: sub.pts.length, fechado: sub.fechado, caixa_mm: vkCaixaMM(o) };
    });
    // simplificar: menos pontos, mesma forma (tolerância em mm); suavizar 0-10 também tira ondulação (Suavizar do Illustrator)
    vkRegistrar('simplificar', 'simplificar caminho', a => {
        const [, , D] = conv(a), tol = D(a.tolerancia ?? 0.25); let antes = 0, depois = 0;
        for (const o of vkTxAlvos(a)) {
            if (o.tipo !== 'caminho') continue;
            o.subs = o.subs.map(s => { antes += s.pts.length; const pl = vkDsAmostrar(s, 24, true).map(q => [q[0], q[1]]); const r = pl.length > 2 ? vkDsCurva(s.fechado ? pl.slice(0, -1) : pl, s.fechado, { erro: tol, passo: tol / 2, raio: Math.round((a.suavizar || 0) * 1.5), cantos: 45, janela: 2 }) : null; const f = r && r.pts.length < s.pts.length ? r : s; depois += f.pts.length; return f; });
        }
        return { pontos_antes: antes, pontos_depois: depois };
    });
    // pincel de bolha: pinta uma forma cheia que se junta às formas da mesma cor que encostam (como o Blob Brush)
    vkRegistrar('bolha', 'pincel de bolha', async a => {
        const [, , D] = conv(a), P = pontos(a), larg = D(a.espessura ?? 4);
        const cor = 'cor' in a ? vkCorDe(a.cor) : vkClone(VK.traco || VK.preench || { k: 'cmyk', v: [0, 0, 0, 100] });
        const sub = vkDsCurva(P, false, { erro: Math.max(0.3, larg * 0.08), raio: 4 }) || { fechado: false, pts: P.map(q => [q[0], q[1], q[0], q[1], q[0], q[1]]) };
        const [forma] = await vkApi().vk_contornar_traco([{ subs: [sub], traco: { larg, cap: 'round', junc: 'round', miter: 4 } }]);
        const cam = camada(), bx = vkSubsBox(forma.subs);
        const toca = cam.itens.filter(o => o.tipo === 'caminho' && !o.trava && o.visivel !== false && !o.traco && vkTxIgual(o.preench, cor) && (() => { const b = vkBox(o); return b[0] <= bx[2] && b[2] >= bx[0] && b[1] <= bx[3] && b[3] >= bx[1]; })());
        const r = await vkApi().vk_booleana('unir', [...toca.map(o => ({ subs: o.subs, regra: o.regra })), { subs: forma.subs, regra: 'nonzero' }]);
        let o;
        if (toca.length) { o = toca[0]; o.subs = r.subs; o.regra = 'nonzero'; toca.slice(1).forEach(x => cam.itens.splice(cam.itens.indexOf(x), 1)); }
        else { o = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: r.subs, preench: cor, traco: null }; cam.itens.push(o); }
        VK.sel = [o.id];
        return { id: o.id, juntou: toca.length };
    });
    // borracha: apaga a área do traço das formas cheias (as selecionadas, ou todas as que estão embaixo)
    vkRegistrar('borracha', 'borracha', async a => {
        const [, , D] = conv(a), P = pontos(a), larg = D(a.espessura ?? 4);
        const sub = { fechado: false, pts: P.map(q => [q[0], q[1], q[0], q[1], q[0], q[1]]) };
        const [area] = await vkApi().vk_contornar_traco([{ subs: [sub], traco: { larg, cap: 'round', junc: 'round', miter: 4 } }]);
        const bx = vkSubsBox(area.subs);
        let alvos = a.ids || a.nomes ? vkTxAlvos(a) : VK.sel.length ? vkSelObjs() : vkTodos().filter(x => !vkTravado(x.o, x.cam)).map(x => x.o);
        alvos = alvos.filter(o => o.tipo === 'caminho' && o.preench && !o.trava && (() => { const b = vkBox(o); return b[0] <= bx[2] && b[2] >= bx[0] && b[1] <= bx[3] && b[3] >= bx[1]; })());
        let n = 0, apagados = 0;
        for (const o of alvos) {
            const r = await vkApi().vk_booleana('subtrair', [{ subs: o.subs, regra: o.regra }, { subs: area.subs, regra: 'nonzero' }]);
            if (!r.subs.length) { const l = vkListaDe(o.id); l.splice(l.indexOf(o), 1); apagados++; }
            else { o.subs = r.subs; o.regra = 'nonzero'; n++; }
        }
        VK.sel = VK.sel.filter(id => vkObj(id));
        return { recortados: n, apagados };
    });
})();
// alterar: perfil (nome ou [[t, larg]]), seta_ini/seta_fim (seta|triangulo|circulo|quadrado|barra|nenhuma), seta_esc (%)
function vkDsAlterar(a, apl) {
    if (a.perfil !== undefined) { const p = vkDsPerfil(a.perfil); apl(x => { if (!x.traco) return; x.traco = { ...x.traco }; if (p) x.traco.perfil = p; else delete x.traco.perfil; }); }
    for (const k of ['seta_ini', 'seta_fim']) if (a[k] !== undefined) { const v = ['seta', 'triangulo', 'circulo', 'quadrado', 'barra'].includes(a[k]) ? a[k] : null; apl(x => { if (!x.traco) return; x.traco = { ...x.traco }; if (v) x.traco[k] = v; else delete x.traco[k]; }); }
    if (a.seta_esc != null) apl(x => { if (x.traco) x.traco = { ...x.traco, seta_esc: +a.seta_esc }; });
}

// ── ferramentas de mouse ──
function vkDsDown(A, x, y) {
    if (['lapis', 'pincel', 'bolha', 'borracha'].includes(A.f)) { A.modo = 'desenho'; A.trilha = [[x, y]]; return true; }
    if (A.f === 'largura') {
        const alvo = vkObjEm(x, y, true);
        if (!alvo || alvo.tipo !== 'caminho' || !alvo.traco) { vkToast('Arraste em cima de um traço'); return 'nada'; }
        const pl = vkDsAmostrar(alvo.subs[0], 48, true), L = pl.at(-1)[2] || 1;
        let m = 0, dm = Infinity; pl.forEach((q, i) => { const d = Math.hypot(q[0] - x, q[1] - y); if (d < dm) { dm = d; m = i; } });
        A.modo = 'largura'; A.alvo = alvo; A.t = pl[m][2] / L; A.ponto = pl[m]; A.antes = vkClone(alvo.traco);
        return true;
    }
    return false;
}
function vkDsMove(A, x, y) {
    if (A.modo !== 'largura') return false;
    const o = A.alvo, t0 = A.antes, w = Math.min(10, Math.max(0.02, 2 * Math.hypot(x - A.ponto[0], y - A.ponto[1]) / (t0.larg || 1)));
    let pf = vkClone(t0.perfil || [[0, 1], [1, 1]]);
    const i = pf.findIndex(p => Math.abs(p[0] - A.t) < 0.04);
    if (i >= 0) pf[i][1] = w; else { pf.push([A.t, w]); pf.sort((p, q) => p[0] - q[0]); }
    o.traco = { ...t0, perfil: pf }; A.perfil = pf;
    vkDesenhar(); return true;
}
async function vkDsUp(A, x, y) {
    if (A.modo === 'largura') { if (A.perfil) { A.alvo.traco = A.antes; await vkCmdUi('alterar', { ids: [A.alvo.id], perfil: A.perfil }); } return; }
    const pts = A.trilha.concat([[x, y]]); if (pts.length < 3) return;
    const z = VK.vista.z;
    // Fidelidade 1 = preciso … 10 = suave (como no Illustrator). Calibrado com mão tremida simulada (vetor_tremido_grade.py):
    // o que tira o tremido é o erro permitido do ajuste (≈ 6 px no padrão); a gaussiana ajuda pouco
    const f = VK_OPC.fidelidade;
    if (A.f === 'lapis' || A.f === 'pincel') await vkCmdUi('lapis', { pontos: pts, erro: (1 + f * 0.9) / z, passo: 1.5 / z, raio: Math.round(f * 1.6), ...(A.f === 'pincel' ? { espessura: VK_OPC.pincel, perfil: VK_OPC.perfil } : {}) });
    if (A.f === 'bolha') await vkCmdUi('bolha', { pontos: pts, espessura: VK_OPC.bolha });
    if (A.f === 'borracha') await vkCmdUi('borracha', { pontos: pts, espessura: VK_OPC.borracha });
}
function vkDsSobreposicao(ctx, A) {   // rastro enquanto desenha (px de tela)
    if (!A || A.modo !== 'desenho' || !A.trilha) return;
    const pts = A.trilha.concat(A.mx != null ? [[A.mx, A.my]] : []).map(q => vkTela(q[0], q[1]));
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
    if (A.f === 'bolha' || A.f === 'borracha') { ctx.strokeStyle = A.f === 'bolha' ? vkApRgba(VK.traco || VK.preench, 0.55) : 'rgba(255,80,80,.35)'; ctx.lineWidth = (A.f === 'bolha' ? VK_OPC.bolha : VK_OPC.borracha) * VK.vista.z; }
    else { ctx.strokeStyle = vkApRgba(VK.traco || { k: 'cmyk', v: [0, 0, 0, 100] }, 0.9); ctx.lineWidth = A.f === 'pincel' ? Math.max(1, VK_OPC.pincel * VK.vista.z) : 1; }
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke(); ctx.restore();
}
// barra de opções da ferramenta e painel do traço
function vkDsOpcoes(f) {
    const campo = (rot, k, v, u, st = 0.5, mn = 0.1) => `<label class="ie-op-campo">${rot} <input type="number" min="${mn}" step="${st}" value="${v}" data-dso="${k}"> ${u}</label>`;
    const perfis = `<label class="ie-op-campo">Perfil <select data-dso="perfil">${Object.keys(VK_PERFIS).map(p => `<option ${VK_OPC.perfil === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>`;
    const fid = `<label class="ie-op-campo">Fidelidade <small>Preciso</small><input type="range" min="1" max="10" step="1" value="${VK_OPC.fidelidade}" data-dso="fidelidade" style="width:90px"><small>Suave</small></label>`;
    if (f === 'lapis') return fid;
    if (f === 'pincel') return campo('Espessura', 'pincel', vkR(VK_OPC.pincel, 2), 'pt', 0.25) + perfis + fid;
    if (f === 'bolha') return campo('Tamanho', 'bolha', vkR(vkMM(VK_OPC.bolha), 2), 'mm') + '<span class="ie-op-dica">pinta na cor do traço; junta com as formas da mesma cor que encostar</span>';
    if (f === 'borracha') return campo('Tamanho', 'borracha', vkR(vkMM(VK_OPC.borracha), 2), 'mm') + '<span class="ie-op-dica">apaga das formas selecionadas (ou de todas embaixo)</span>';
    if (f === 'largura') return '<span class="ie-op-dica">arraste num traço: longe da linha = mais grosso naquele ponto; perfis prontos no painel (Traço)</span>';
    return '';
}
function vkDsOpcoesEventos(el) {
    if (el._vkDs) return; el._vkDs = true;
    el.addEventListener('change', e => { const k = e.target.dataset.dso; if (!k) return; const v = e.target.value;
        VK_OPC[k] = k === 'perfil' ? v : k === 'bolha' || k === 'borracha' ? vkPT(+v || 1) : k === 'pincel' ? (+v || 1) : Math.max(1, Math.min(10, +v || 6)); }, true);
}
function vkDsPainelTraco(tr) {
    const seta = k => `<select data-dst="${k}" title="${k === 'seta_ini' ? 'seta no início' : 'seta no fim'}">${[['', '—'], ['seta', '➤'], ['triangulo', '▶'], ['circulo', '●'], ['quadrado', '■'], ['barra', '┃']].map(([v, n]) => `<option value="${v}" ${(tr[k] || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    const atual = tr.perfil ? (Object.entries(VK_PERFIS).find(([, v]) => v && JSON.stringify(v) === JSON.stringify(tr.perfil)) || ['personalizado'])[0] : 'uniforme';
    return `<div class="vk-linha vk-mini">Setas ${seta('seta_ini')} ${seta('seta_fim')} <input type="number" min="10" step="10" value="${tr.seta_esc || 100}" data-dst="seta_esc" style="width:48px" title="tamanho da seta">%
        Perfil <select data-dst="perfil">${[...Object.keys(VK_PERFIS), ...(atual === 'personalizado' ? ['personalizado'] : [])].map(p => `<option ${p === atual ? 'selected' : ''}>${p}</option>`).join('')}</select></div>`;
}
function vkDsPainelEventos(el) {
    if (el._vkDsP) return; el._vkDsP = true;
    el.addEventListener('change', e => { const k = e.target.dataset.dst; if (!k) return; e.stopPropagation();
        const v = e.target.value; if (k === 'perfil' && v === 'personalizado') return;
        vkCmdUi('alterar', { [k]: k === 'seta_esc' ? +v : (v || null) }); }, true);
}
