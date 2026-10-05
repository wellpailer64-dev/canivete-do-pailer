// Vetor Kanivete — 3D (Efeito › 3D e Materiais do Illustrator): GIRAR (revolve: copo, garrafa, lata) e EXTRUDAR (caixa,
// logo com volume), com luz, material, sombra no chão, grão e MAPEAR ARTE (o rótulo/logo acompanha a superfície).
// Resultado 100% vetorial e de gráfica: superfícies curvas = malhas de degradê (Coons no PDF, CMYK, vale em X-1a), faces e
// laterais = caminhos; nada vira imagem. O grupo guarda a origem em o.tres_d → editar_3d refaz com outros parâmetros.
// Espaço 3D: x direita, y para baixo, z para quem olha. Girar em torno do eixo vertical na borda esquerda do perfil.
const VK_MATERIAIS = {   // ambiente, difusa, especular, expoente do brilho
    fosco: { amb: 0.5, dif: 0.62, esp: 0.04, exp: 6 }, papel: { amb: 0.52, dif: 0.6, esp: 0.08, exp: 10 },
    plastico: { amb: 0.45, dif: 0.6, esp: 0.45, exp: 28 }, ceramica: { amb: 0.46, dif: 0.58, esp: 0.7, exp: 36 },
    metal: { amb: 0.32, dif: 0.55, esp: 0.95, exp: 18, amb_ref: 0.42 }, vidro: { amb: 0.55, dif: 0.35, esp: 1, exp: 50 },
};
function vk3dRot(p) {   // girar (y), inclinar (x: positivo mostra o topo), rolar (z) em graus → v ↦ v'
    const b = (p.girar || 0) * Math.PI / 180, a = -(p.inclinar || 0) * Math.PI / 180, c = (p.rolar || 0) * Math.PI / 180;
    const cb = Math.cos(b), sb = Math.sin(b), ca = Math.cos(a), sa = Math.sin(a), cc = Math.cos(c), sc = Math.sin(c);
    return v => { let [x, y, z] = v; [x, z] = [x * cb + z * sb, -x * sb + z * cb]; [y, z] = [y * ca - z * sa, y * sa + z * ca]; [x, y] = [x * cc - y * sc, x * sc + y * cc]; return [x, y, z]; };
}
function vk3dCena(p, cx, cy, tam) {
    const R = vk3dRot(p), f = p.perspectiva ? tam * (6 - 5 * Math.min(1, p.perspectiva / 100)) : 0;
    const az = (p.luz_ang ?? -40) * Math.PI / 180, el = (p.luz_alt ?? 45) * Math.PI / 180;
    const L = [Math.sin(az) * Math.cos(el), -Math.sin(el), Math.cos(az) * Math.cos(el)], ln = Math.hypot(...L); L.forEach((v, i) => L[i] = v / ln);
    const Hh = [L[0], L[1], L[2] + 1], hn = Math.hypot(...Hh); Hh.forEach((v, i) => Hh[i] = v / hn);
    const M = { ...(VK_MATERIAIS[p.material] || VK_MATERIAIS.plastico) }, I = (p.luz ?? 100) / 100;
    return {
        R, persp: !!f, proj: v => { const k = f ? f / (f - v[2]) : 1; return [cx + v[0] * k, cy + v[1] * k]; },
        luz: n => { const d = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]), s = Math.pow(Math.max(0, n[0] * Hh[0] + n[1] * Hh[1] + n[2] * Hh[2]), M.exp);
            const vol = 1 - (p.volume ?? 35) / 100 * (1 - Math.max(0, n[2]));   // bordas viradas escurecem: dá forma ao curvo
            let l = (M.amb + M.dif * d * I) * vol;
            if (M.amb_ref) { const r = n[0]; l += M.amb_ref * (0.55 * Math.max(0, Math.sin(r * 5.2 + 0.6)) - 0.25 * Math.max(0, Math.sin(r * 9 - 1))); }   // reflexo do ambiente (faixas)
            return { l, s: M.esp * s * I }; },
    };
}
function vk3dTom(c, { l, s }, sombra = 1) {   // cor CMYK sombreada: escurece somando preto, clareia tirando tinta, brilho especular → papel
    let v = vkMalhaCor(c).slice();
    if (l < 1) { const d = (1 - l) * sombra; v = [v[0] * (1 + d * 0.12), v[1] * (1 + d * 0.12), v[2] * (1 + d * 0.12), v[3] + (100 - v[3]) * d * 0.95]; }
    else { const k = Math.min(0.9, (l - 1) * 0.85); v = v.map(x => x * (1 - k)); }
    if (s > 0) v = v.map(x => x * (1 - Math.min(1, s)));
    return { k: 'cmyk', v: v.map(x => Math.round(Math.max(0, Math.min(100, x)) * 10) / 10) };
}
function vk3dBez(a, b, t) {   // ponto e tangente do segmento a→b (nós [x,y, inx,iny, outx,outy])
    const P0 = [a[0], a[1]], P1 = [a[4], a[5]], P2 = [b[2], b[3]], P3 = [b[0], b[1]], u = 1 - t;
    const p = [0, 1].map(k => u * u * u * P0[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * P3[k]);
    let d = [0, 1].map(k => 3 * u * u * (P1[k] - P0[k]) + 6 * u * t * (P2[k] - P1[k]) + 3 * t * t * (P3[k] - P2[k]));
    if (Math.hypot(...d) < 1e-9) d = [P3[0] - P0[0], P3[1] - P0[1]];
    return { p, d };
}
function vk3dPerfil(s, passo, dividirRetas = true) {   // perfil → lista de segmentos amostrados [{p, d}] (cantos ficam duplicados: sombra nítida na quina)
    const segs = [], n = s.fechado ? s.pts.length : s.pts.length - 1;
    for (let i = 0; i < n; i++) {
        const a = s.pts[i], b = s.pts[(i + 1) % s.pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(a[4] - a[0], a[5] - a[1]) + Math.hypot(b[2] - b[0], b[3] - b[1]);
        const k = Math.max(1, Math.min(24, Math.ceil(L / passo))), reto = a[4] === a[0] && a[5] === a[1] && b[2] === b[0] && b[3] === b[1];
        const q = []; for (let j = 0; j <= (reto ? 1 : k); j++) q.push(vk3dBez(a, b, j / (reto ? 1 : k)));
        if (reto && k > 1 && dividirRetas) {   // reta longa: mais linhas (o brilho e o rótulo precisam de resolução)
            const r = []; for (let j = 0; j <= k; j++) r.push({ p: [a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k], d: q[0].d }); segs.push(r);
        } else segs.push(q);
    }
    return segs;
}
function vk3dLinhas(o3) {   // linhas do perfil (r, y) com normal (nr, ny) para fora
    const f = o3.fonte, b = vkBox(f), eixo = o3.eixo === 'dir' ? b[2] : b[0], esc = Math.max(b[2] - b[0], b[3] - b[1]) || 1;
    const segs = vk3dPerfil(f.subs[0], esc / 28), rows = [];
    let area = 0; const pl = segs.flat().map(q => [Math.abs(q.p[0] - eixo), q.p[1]]); pl.push([0, pl.at(-1)[1]], [0, pl[0][1]]);
    for (let i = 0; i < pl.length; i++) { const p = pl[i], q = pl[(i + 1) % pl.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const sg = o3.eixo === 'dir' ? -1 : 1, sinal = area < 0 ? 1 : -1;
    for (const s of segs) for (const q of s) {
        const dr = q.d[0] * sg, dy = q.d[1], n = Math.hypot(dr, dy) || 1;
        rows.push({ r: Math.abs(q.p[0] - eixo), y: q.p[1], nr: sinal * -dy / n, ny: sinal * dr / n });
    }
    return { rows, eixo, top: b[1], base: b[3], cy: (b[1] + b[3]) / 2, rmax: Math.max(...rows.map(r => r.r)), esc };
}

// ── GIRAR (revolve) ──
function vk3dGirar(o3) {
    const P = vk3dLinhas(o3), cena = vk3dCena(o3, P.eixo, P.cy, P.esc), K = o3.colunas || 48, sp = (o3.girar || 0) * Math.PI / 180;
    const ponto = (r, y, t) => [r * Math.cos(t), y - P.cy, r * Math.sin(t)], normal = (w, t) => [w.nr * Math.cos(t), w.ny, w.nr * Math.sin(t)];
    const metade = (t0, dentro) => {
        const nos = [], cores = [];
        for (const w of P.rows) {
            const ln = [], lc = [];
            for (let j = 0; j <= K; j++) {
                const t = t0 + Math.PI * j / K, v = cena.R(ponto(w.r, w.y, t)); let n = cena.R(normal(w, t));
                if (n[2] < 0) n = n.map(x => -x);   // a face que se vê (por dentro, no fundo do copo)
                ln.push(cena.proj(v)); lc.push(vk3dTom(o3.cor, cena.luz(n), dentro ? 1.25 : 1));
            }
            nos.push(ln); cores.push(lc);
        }
        return { id: vkId(), tipo: 'malha', nos, cores, auto3d: true, nome: dentro ? '3D fundo' : '3D frente' };
    };
    const tras = metade(sp + Math.PI, true), frente = metade(sp, false);
    const itens = [];
    if (o3.sombra_chao !== false) itens.push(vk3dSombraChao(cena, P, sp));
    itens.push(tras, frente);
    const silh = vk3dBorda(frente.nos);
    for (const m of o3.mapas || []) itens.push(...vk3dMapaGirar(o3, m, P, cena, sp, silh));
    if (o3.grao) itens.push(vk3dGrao(silh, o3.grao, vk3dBorda(tras.nos)));
    return itens;
}
function vk3dBorda(nos) {   // contorno da grade projetada (para recortar rótulo e grão)
    const L = nos.length - 1, C = nos[0].length - 1, pts = [];
    for (let j = 0; j <= C; j++) pts.push(nos[0][j]);
    for (let i = 1; i <= L; i++) pts.push(nos[i][C]);
    for (let j = C - 1; j >= 0; j--) pts.push(nos[L][j]);
    for (let i = L - 1; i > 0; i--) pts.push(nos[i][0]);
    return { fechado: true, pts: pts.map(p => [p[0], p[1], p[0], p[1], p[0], p[1]]) };
}
function vk3dSombraChao(cena, P, sp) {   // elipse escura desfocada no "chão", na base projetada
    const pts = []; for (let j = 0; j < 48; j++) { const t = 2 * Math.PI * j / 48; pts.push(cena.proj(cena.R([P.rmax * 1.08 * Math.cos(t), P.base - P.cy, P.rmax * 1.08 * Math.sin(t)]))); }
    const b = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
    const w = b[2] - b[0], h = Math.max(P.rmax * 0.18, b[3] - b[1]), cx = (b[0] + b[2]) / 2, cy = b[3] - h * 0.35;
    const e = { id: vkId(), tipo: 'caminho', nome: '3D sombra', regra: 'nonzero', subs: vkElipseSubs(cx, cy, w * 0.58, h * 0.55), preench: { k: 'cmyk', v: [40, 50, 55, 90] }, traco: null, op: 0.45, bm: 'multiplicacao' };
    e.efeitos = [{ tipo: 'desfoque', desfoque: Math.max(1, h * 0.55) }];
    // sombra de contato: curta e escura, colada na base (é ela que "assenta" o objeto na mesa)
    const c = { id: vkId(), tipo: 'caminho', nome: '3D sombra de contato', regra: 'nonzero', subs: vkElipseSubs(cx, b[3] - (b[3] - b[1]) * 0.3, w * 0.47, Math.max(0.6, (b[3] - b[1]) * 0.45)), preench: { k: 'cmyk', v: [40, 50, 55, 100] }, traco: null, op: 0.7, bm: 'multiplicacao' };
    c.efeitos = [{ tipo: 'desfoque', desfoque: Math.max(0.6, h * 0.16) }];
    return { id: vkId(), tipo: 'grupo', nome: '3D sombra', itens: [e, c] };
}
function vk3dGrao(silh, forca, silh2) {   // grão fino (textura de papel/cerâmica) recortado pela silhueta: padrão de pontos em multiplicação
    vk3dPadraoGrao();
    const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const s of [silh, silh2]) s.pts.forEach(p => vkBoxAdd(b, p[0], p[1]));
    const r = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkRetSubs(b[0], b[1], b[2] - b[0], b[3] - b[1]), preench: { k: 'pad', id: 'vk_grao3d', esc: 100, ang: 0 }, traco: null, op: Math.min(1, (forca || 30) / 100), bm: 'multiplicacao', nome: '3D grão' };
    const corte = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: [silh, silh2], preench: null, traco: null };
    return { id: vkId(), tipo: 'grupo', clip: true, nome: '3D grão', itens: [corte, r] };
}
function vk3dPadraoGrao() {   // amostra de padrão "grão" (pontinhos aleatórios, semente fixa) criada uma vez no documento
    VK.doc.padroes = VK.doc.padroes || {}; if (VK.doc.padroes.vk_grao3d) return;
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, itens = [];
    for (let i = 0; i < 90; i++) { const x = rnd() * 24, y = rnd() * 24, r = 0.12 + rnd() * 0.22;
        itens.push({ id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkElipseSubs(x, y, r, r), preench: { k: 'cmyk', v: [0, 0, 0, 30 + rnd() * 40] }, traco: null }); }
    VK.doc.padroes.vk_grao3d = { nome: 'Grão 3D', w: 24, h: 24, itens };
}

// ── mapear arte no girar: (x da arte → ângulo pelo raio, y → altura no perfil) ──
function vk3dRaioEm(P, y) {   // raio da parede externa na altura y (o maior dos trechos que passam por y)
    let best = null;
    for (let i = 0; i < P.rows.length - 1; i++) {
        const a = P.rows[i], b = P.rows[i + 1], lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
        if (y < lo - 1e-6 || y > hi + 1e-6) continue;
        const t = hi - lo < 1e-9 ? 0 : (y - a.y) / (b.y - a.y), r = a.r + (b.r - a.r) * t;
        if (!best || r > best.r) best = { r, nr: a.nr + (b.nr - a.nr) * t, ny: a.ny + (b.ny - a.ny) * t };
    }
    return best || { r: P.rmax, nr: 1, ny: 0 };
}
function vk3dArteCaminhos(objs, out = [], M = null) {   // arte → caminhos (grupos abertos, instâncias, máscaras viram seus itens)
    for (const o of objs) {
        if (o.visivel === false) continue;
        if (o.tipo === 'grupo') { vk3dArteCaminhos(o.clip ? o.itens.slice(1) : o.itens, out, M); continue; }
        if (o.tipo === 'caminho' && o.subs && o.subs.length) out.push(vkClone(o));
        if (o.tipo === 'texto') {   // texto vira curvas na hora (cada cor de trecho é um caminho)
            const g = vkGeo(o); if (!g) continue;
            for (const pa of g.partes || [{ subs: g.subs }]) out.push({ id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkApDoc ? vkApDoc(pa.subs, o.m) : pa.subs,
                preench: vkClone('preench' in pa ? pa.preench : o.preench), traco: vkClone('traco' in pa ? (pa.traco ? { larg: 1, ...(o.traco || {}), ...pa.traco } : null) : o.traco) });
        }
    }
    return out;
}
function vk3dMapaGirar(o3, m, P, cena, sp, silh) {
    const arte = vk3dArteCaminhos(m.arte), ab = vkBoxUniao(m.arte); if (!arte.length || !isFinite(ab[0])) return [];
    const esc = (m.escala ?? 100) / 100, acx = (ab[0] + ab[2]) / 2, acy = (ab[1] + ab[3]) / 2;
    const yc = m.y != null ? P.top + m.y : P.cy, tc = sp + Math.PI / 2 + (m.angulo || 0) * Math.PI / 180;
    const lim = Math.PI / 2 - 0.015;   // arte mais larga que meia volta: dobra na borda visível (não aparece "orelha" do lado de trás)
    const mapa = (x, y) => { const yy = yc + (y - acy) * esc, w = vk3dRaioEm(P, yy), t = tc - Math.max(-lim, Math.min(lim, (x - acx) * esc / Math.max(1e-6, w.r)));
        return cena.proj(cena.R([w.r * Math.cos(t), yy - P.cy, w.r * Math.sin(t)])); };
    const caminhos = arte.map(c => {
        c.id = vkId();
        c.subs = c.subs.map(s => { const d = vkSubdividir(s, 6); return { fechado: d.fechado, pts: d.pts.map(q => [...mapa(q[0], q[1]), ...mapa(q[2], q[3]), ...mapa(q[4], q[5])]) }; });
        if (c.traco && c.traco.larg) c.traco = { ...c.traco, larg: c.traco.larg * esc };
        return c;
    });
    // sombreamento por cima da arte: malha só de preto (escuro = sombra) em multiplicação, recortada pela própria arte
    const ys = [], L = 10, C = 14, wpx = (ab[2] - ab[0]) * esc, hpx = (ab[3] - ab[1]) * esc, nos = [], cores = [];
    for (let i = 0; i <= L; i++) { const yy = yc - hpx / 2 + hpx * i / L, w = vk3dRaioEm(P, yy), ln = [], lc = [];
        for (let j = 0; j <= C; j++) { const t = tc + wpx / 2 / Math.max(1e-6, w.r) - (wpx / Math.max(1e-6, w.r)) * j / C;
            const v = cena.R([w.r * Math.cos(t), yy - P.cy, w.r * Math.sin(t)]), n = cena.R([w.nr * Math.cos(t), w.ny, w.nr * Math.sin(t)]), lz = cena.luz(n);
            ln.push(cena.proj(v)); lc.push(lz.l); }
        nos.push(ln); cores.push(lc); ys.push(yy); }
    // sombra RELATIVA ao ponto mais claro do rótulo: a arte mostra a cor verdadeira onde a luz bate e escurece para as bordas
    const lmax = Math.max(...cores.flat(), 1e-6);
    cores.forEach((l_, i) => l_.forEach((l, j) => { cores[i][j] = { k: 'cmyk', v: [0, 0, 0, Math.round(Math.max(0, Math.min(0.8, 1 - l / lmax)) * 70)] }; }));
    const corte = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: caminhos.flatMap(c => c.subs.filter(s => s.fechado)), preench: null, traco: null };
    const sombra = { id: vkId(), tipo: 'malha', nos, cores, auto3d: true, bm: 'multiplicacao', nome: '3D sombra da arte' };
    const arteG = { id: vkId(), tipo: 'grupo', nome: '3D arte mapeada', itens: caminhos };
    const silC = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: [silh], preench: null, traco: null };
    const itens = [silC, arteG]; if (corte.subs.length) itens.push({ id: vkId(), tipo: 'grupo', clip: true, nome: '3D sombra da arte', itens: [corte, sombra] });
    return [{ id: vkId(), tipo: 'grupo', clip: true, nome: '3D rótulo', itens }];
}

// ── EXTRUDAR ──
function vk3dExtrudar(o3) {
    const f = o3.fonte, b = vkBox(f), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, esc = Math.max(b[2] - b[0], b[3] - b[1]) || 1;
    const d = o3.profundidade ?? esc * 0.25, cena = vk3dCena(o3, cx, cy, esc), z0 = d / 2, z1 = -d / 2;
    const bd = Math.min(o3.chanfro || 0, d * 0.45, esc * 0.2), zs = z0 - bd;   // chanfro: a face recua bd e uma rampa liga à lateral
    const P3 = (x, y, z) => cena.R([x - cx, y - cy, z]);
    const lados = [], recuadas = [];
    for (const s of f.subs) {
        if (!s.fechado || s.pts.length < 2) continue;
        let area = 0; for (let i = 0; i < s.pts.length; i++) { const p = s.pts[i], q = s.pts[(i + 1) % s.pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
        const sg = area > 0 ? -1 : 1;   // normal para fora (y para baixo)
        for (const seg of vk3dPerfil(s, esc / 60, false)) for (let k = 0; k < seg.length - 1; k++) {
            const a = seg[k].p, c = seg[k + 1].p, dx = c[0] - a[0], dy = c[1] - a[1], n0 = Math.hypot(dx, dy); if (n0 < 1e-6) continue;
            const n = cena.R([sg * -dy / n0, sg * dx / n0, 0]); if (n[2] <= 1e-4) continue;   // face de costas
            const q = [P3(a[0], a[1], zs), P3(c[0], c[1], zs), P3(c[0], c[1], z1), P3(a[0], a[1], z1)];
            const lz_ = cena.luz(n), cor = vk3dTom(o3.cor_lado || o3.cor, lz_, 1.1), pp = q.map(cena.proj), longo = n0 > esc * 0.08;
            lados.push({ z: q.reduce((s_, v) => s_ + v[2], 0) / 4, o: { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: [{ fechado: true, pts: pp.map(p => [p[0], p[1], p[0], p[1], p[0], p[1]]) }],
                preench: longo ? vk3dDegFace(o3.cor_lado || o3.cor, lz_, pp) : cor, traco: longo ? null : { cor, larg: 0.25, cap: 'butt', junc: 'round', miter: 4, tracejado: [], fase: 0 }, nome: '3D lado' }, seg: [a, c], n2: [sg * -dy / n0, sg * dx / n0] });
        }
    }
    if (bd > 0) for (const s of f.subs) {   // rampas do chanfro (polígono recuado por normal média de vértice)
        if (!s.fechado || s.pts.length < 2) continue;
        let area = 0; for (let i = 0; i < s.pts.length; i++) { const p = s.pts[i], q = s.pts[(i + 1) % s.pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
        const sg = area > 0 ? -1 : 1, pl = [];
        for (const seg of vk3dPerfil(s, esc / 60, false)) for (const q of seg) { const l = pl.at(-1); if (!l || Math.hypot(q.p[0] - l[0], q.p[1] - l[1]) > 1e-4) pl.push(q.p); }
        if (pl.length > 2 && Math.hypot(pl[0][0] - pl.at(-1)[0], pl[0][1] - pl.at(-1)[1]) < 1e-4) pl.pop();
        const N = pl.length, nrm = i => { const a = pl[i], c = pl[(i + 1) % N], dx = c[0] - a[0], dy = c[1] - a[1], n0 = Math.hypot(dx, dy) || 1; return [sg * -dy / n0, sg * dx / n0]; };
        const den = pl.map((p, i) => { const n1 = nrm((i - 1 + N) % N), n2 = nrm(i); let m = [n1[0] + n2[0], n1[1] + n2[1]]; const l = Math.hypot(...m) || 1; m = [m[0] / l, m[1] / l];
            const k = 1 / Math.max(0.5, m[0] * n2[0] + m[1] * n2[1]); return [p[0] - m[0] * bd * k, p[1] - m[1] * bd * k]; });
        recuadas.push(den);
        for (let i = 0; i < N; i++) {
            const a = pl[i], c = pl[(i + 1) % N], ia = den[i], ic = den[(i + 1) % N], n2 = nrm(i);
            const e1 = [c[0] - a[0], c[1] - a[1], 0], e2 = [ia[0] - a[0], ia[1] - a[1], bd];
            let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const nl = Math.hypot(...n) || 1; n = n.map(v => v / nl);
            if (n[0] * n2[0] + n[1] * n2[1] + n[2] < 0) n = n.map(v => -v);
            const nr = cena.R(n); if (nr[2] <= 1e-4) continue;
            const q = [P3(a[0], a[1], zs), P3(c[0], c[1], zs), P3(ic[0], ic[1], z0), P3(ia[0], ia[1], z0)], pp = q.map(cena.proj), cor = vk3dTom(o3.cor, cena.luz(nr), 1.05);
            lados.push({ z: q.reduce((s_, v) => s_ + v[2], 0) / 4 + 1e-3, o: { id: vkId(), tipo: 'caminho', regra: 'nonzero', nome: '3D chanfro', subs: [{ fechado: true, pts: pp.map(p => [p[0], p[1], p[0], p[1], p[0], p[1]]) }],
                preench: cor, traco: { cor, larg: 0.25, cap: 'butt', junc: 'round', miter: 4, tracejado: [], fase: 0 } }, seg: [a, c], n2 });
        }
    }
    lados.sort((p, q) => p.z - q.z);
    const nf = cena.R([0, 0, 1]), frenteVis = nf[2] >= 0, zf = frenteVis ? z0 : z1, nn = frenteVis ? nf : nf.map(x => -x);
    const mapa = (x, y) => cena.proj(P3(x, y, zf));
    const face = { ...vkClone(f), id: vkId(), nome: '3D face', subs: bd > 0 && frenteVis ? recuadas.map(r => ({ fechado: true, pts: r.map(q => { const m = mapa(q[0], q[1]); return [m[0], m[1], m[0], m[1], m[0], m[1]]; }) }))
        : f.subs.map(s => ({ fechado: s.fechado, pts: vkSubdividir(s, cena.persp ? 4 : 1).pts.map(q => [...mapa(q[0], q[1]), ...mapa(q[2], q[3]), ...mapa(q[4], q[5])]) })),
        preench: null, traco: null, efeitos: undefined, aparencia: undefined };
    face.preench = vk3dDegFace(o3.cor, cena.luz(nn), face.subs.flatMap(s_ => s_.pts));
    const itens = [];
    if (o3.sombra_chao) { const pts = f.subs.flatMap(s => s.pts.map(q => cena.proj(P3(q[0], q[1], z1)))), bb = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
        const w = bb[1] - bb[0], h = esc * 0.12, mx = (bb[0] + bb[1]) / 2;
        const e = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkElipseSubs(mx, bb[2] + h * 0.05, w * 0.56, h * 0.55), preench: { k: 'cmyk', v: [40, 50, 55, 90] }, traco: null, op: 0.45, bm: 'multiplicacao', nome: '3D sombra', efeitos: [{ tipo: 'desfoque', desfoque: h * 0.55 }] };
        const c = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkElipseSubs(mx, bb[2] - h * 0.05, w * 0.5, h * 0.14), preench: { k: 'cmyk', v: [40, 50, 55, 100] }, traco: null, op: 0.7, bm: 'multiplicacao', nome: '3D sombra de contato', efeitos: [{ tipo: 'desfoque', desfoque: h * 0.12 }] };
        itens.push({ id: vkId(), tipo: 'grupo', nome: '3D sombra', itens: [e, c] }); }
    itens.push(...lados.map(l => l.o), face);
    for (const m of o3.mapas || []) itens.push(...vk3dMapaExtrudar(o3, m, { b, cx, cy, d, z0, z1, P3, cena, lados, mapa, nn, zf }));
    if (o3.grao) { const corte = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: [...face.subs, ...lados.map(l => l.o.subs[0])], preench: null, traco: null };
        vk3dPadraoGrao(); const bb = vkBoxUniao(itens);
        itens.push({ id: vkId(), tipo: 'grupo', clip: true, nome: '3D grão', itens: [corte, { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkRetSubs(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]), preench: { k: 'pad', id: 'vk_grao3d', esc: 100, ang: 0 }, traco: null, op: Math.min(1, o3.grao / 100), bm: 'multiplicacao' }] }); }
    return itens;
}
function vk3dDegFace(cor, lz, pts) {   // face plana com leve queda de luz (mais clara no alto/esquerda): parece material, não chapado
    const b = [Infinity, Infinity, -Infinity, -Infinity]; pts.forEach(p => vkBoxAdd(b, p[0], p[1]));
    return { k: 'grad', tipo: 'lin', a: [b[0], b[1]], b: [b[2], b[3]], paradas: [{ p: 0, cor: vk3dTom(cor, { l: lz.l * 1.07, s: lz.s }) }, { p: 1, cor: vk3dTom(cor, { l: lz.l * 0.9, s: 0 }) }] };
}
function vk3dPintarArte(c, lz) {   // arte numa face plana: cada cor recebe a luz da face
    const t = x => !x ? x : x.k === 'grad' ? { ...x, paradas: x.paradas.map(p => ({ ...p, cor: vk3dTom(p.cor, lz) })) } : x.k === 'pad' ? x : vk3dTom(x, lz);
    c.preench = t(c.preench); if (c.traco && c.traco.cor) c.traco = { ...c.traco, cor: t(c.traco.cor) }; return c;
}
function vk3dMapaExtrudar(o3, m, g) {   // face 'frente' (padrão) ou lateral: 'direita' | 'esquerda' | 'topo' | 'base' | número do lado
    const arte = vk3dArteCaminhos(m.arte), ab = vkBoxUniao(m.arte); if (!arte.length || !isFinite(ab[0])) return [];
    const esc = (m.escala ?? 100) / 100, acx = (ab[0] + ab[2]) / 2, acy = (ab[1] + ab[3]) / 2, face = m.face || 'frente';
    let mapa, lz, corte;
    if (face === 'frente') {
        const ox = g.cx + (m.dx || 0), oy = g.cy + (m.dy || 0);
        mapa = (x, y) => g.mapa(ox + (x - acx) * esc, oy + (y - acy) * esc); lz = g.cena.luz(g.nn);
    } else {
        const dir = { direita: [1, 0], esquerda: [-1, 0], topo: [0, -1], base: [0, 1] }[face];
        let L = null;
        if (typeof face === 'number') L = g.lados[face];
        else { let best = 0.3; for (const l of g.lados) { const dl = Math.hypot(l.seg[1][0] - l.seg[0][0], l.seg[1][1] - l.seg[0][1]), sc = (l.n2[0] * dir[0] + l.n2[1] * dir[1]);
            if (sc > best || (L && Math.abs(sc - best) < 1e-3 && dl > Math.hypot(L.seg[1][0] - L.seg[0][0], L.seg[1][1] - L.seg[0][1]))) { best = sc; L = l; } } }
        if (!L) return [];
        const [a, c] = L.seg, len = Math.hypot(c[0] - a[0], c[1] - a[1]), aw = (ab[2] - ab[0]) || 1, ah = (ab[3] - ab[1]) || 1;
        let sx = (c[0] - a[0]) / len, sy = (c[1] - a[1]) / len, U, V, ext;   // eixos da face: U = x da arte, V = y da arte (objeto, antes de girar)
        if (Math.abs(sy) >= Math.abs(sx)) { if (sy < 0) { sx = -sx; sy = -sy; } V = [sx, sy, 0]; U = [0, 0, L.n2[0] > 0 ? -1 : 1]; ext = [g.d, len]; }   // lado em pé
        else { if (sx < 0) { sx = -sx; sy = -sy; } U = [sx, sy, 0]; V = [0, 0, L.n2[1] < 0 ? 1 : -1]; ext = [len, g.d]; }   // topo/base
        const k = Math.min(ext[0] / aw, ext[1] / ah) * esc, mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
        mapa = (x, y) => { const u = (x - acx) * k, v = (y - acy) * k; return g.cena.proj(g.P3(mx + U[0] * u + V[0] * v, my + U[1] * u + V[1] * v, U[2] * u + V[2] * v)); };
        lz = g.cena.luz(g.cena.R([L.n2[0], L.n2[1], 0]));
        corte = L.o.subs[0];
    }
    const caminhos = arte.map(c => { c.id = vkId(); c.subs = c.subs.map(s => { const d = vkSubdividir(s, g.cena.persp ? 4 : 2); return { fechado: d.fechado, pts: d.pts.map(q => [...mapa(q[0], q[1]), ...mapa(q[2], q[3]), ...mapa(q[4], q[5])]) }; });
        if (c.traco && c.traco.larg) c.traco = { ...c.traco, larg: c.traco.larg * esc }; return vk3dPintarArte(c, lz); });
    const grupo = { id: vkId(), tipo: 'grupo', nome: '3D arte mapeada', itens: caminhos };
    return corte ? [{ id: vkId(), tipo: 'grupo', clip: true, nome: '3D rótulo', itens: [{ id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: [corte], preench: null, traco: null }, grupo] }] : [grupo];
}

function vk3dRefazer(g) {   // recalcula os itens do grupo 3D a partir de o.tres_d
    const o3 = g.tres_d; g.itens = o3.tipo === 'girar' ? vk3dGirar(o3) : vk3dExtrudar(o3); VK.malhaCache && VK.malhaCache.clear(); return g;
}
const VK_3D_PARAMS = ['chanfro', 'volume', 'inclinar', 'girar', 'rolar', 'perspectiva', 'material', 'luz', 'luz_ang', 'luz_alt', 'colunas', 'sombra_chao', 'grao', 'eixo'];
(() => {
    const ler = (o3, a) => {
        for (const k of VK_3D_PARAMS) if (a[k] !== undefined) o3[k] = a[k];
        if (a.cor !== undefined) o3.cor = vkCorDe(a.cor); if (a.cor_lado !== undefined) o3.cor_lado = a.cor_lado ? vkCorDe(a.cor_lado) : null;
        if (a.profundidade !== undefined) o3.profundidade = a.un === 'pt' ? +a.profundidade : vkPT(+a.profundidade);
        if (a.chanfro !== undefined) o3.chanfro = a.un === 'pt' ? +a.chanfro : vkPT(+a.chanfro);
    };
    const criar = (tipo, a) => {
        const f = vkTxAlvos(a).find(o => o.tipo === 'caminho'); if (!f) throw new Error(`${tipo === 'girar' ? 'girar_3d' : 'extrudar_3d'}: escolha um caminho (perfil ou forma)`);
        if (tipo === 'extrudar' && !f.subs.some(s => s.fechado)) throw new Error('extrudar_3d: a forma precisa ser fechada');
        const o3 = { tipo, fonte: vkClone(f), cor: vkClone(f.preench && f.preench.k !== 'pad' ? f.preench : (f.traco && f.traco.cor) || { k: 'cmyk', v: [0, 0, 0, 20] }),
            inclinar: tipo === 'girar' ? 18 : 20, girar: tipo === 'girar' ? 0 : -30, rolar: 0, perspectiva: 0, material: tipo === 'girar' ? 'ceramica' : 'fosco', luz: 100, sombra_chao: tipo === 'girar', mapas: [] };
        ler(o3, a);
        const g = vk3dRefazer({ id: vkId(), tipo: 'grupo', nome: a.nome || (tipo === 'girar' ? 'Objeto 3D (girar)' : 'Objeto 3D (extrudar)'), tres_d: o3, itens: [] });
        const l = vkListaDe(f.id); l.splice(l.indexOf(f), 1, g); VK.sel = [g.id];
        return { id: g.id, superficies: g.itens.length, caixa_mm: vkCaixaMM(g) };
    };
    // girar_3d: perfil (caminho; o eixo é a borda esquerda, ou eixo:'dir') → sólido de revolução. inclinar/girar/rolar (graus),
    // perspectiva 0–100, material fosco|papel|plastico|ceramica|metal|vidro, luz %, luz_ang/luz_alt (graus), cor, sombra_chao, grao %
    vkRegistrar('girar_3d', '3D girar', a => criar('girar', a));
    // extrudar_3d: forma fechada → volume com profundidade (mm), mesmos parâmetros + cor_lado
    vkRegistrar('extrudar_3d', '3D extrudar', a => criar('extrudar', a));
    const alvo3d = a => { const g = vkTxAlvos(a).find(o => o.tres_d) || (VK.sel.map(vkObj).find(o => o && o.tres_d)); if (!g) throw new Error('escolha um objeto 3D (girar_3d/extrudar_3d)'); return g; };
    // editar_3d: muda os parâmetros e refaz (o perfil e as artes mapeadas ficam guardados)
    vkRegistrar('editar_3d', 'editar 3D', a => { const g = alvo3d(a); ler(g.tres_d, a); vk3dRefazer(g); return { id: g.id, ...Object.fromEntries(VK_3D_PARAMS.map(k => [k, g.tres_d[k]])) }; });
    // mapear_arte: arte (ids/nomes) → na superfície do 3D (id3d). Girar: angulo (graus, 0 = de frente), y (mm do topo do perfil),
    // escala %. Extrudar: face frente|direita|esquerda|topo|base, dx/dy (mm), escala %. A arte original é guardada e sai da página.
    vkRegistrar('mapear_arte', 'mapear arte no 3D', async a => {
        const g = vkObj(a.id3d || a.objeto_3d) || alvo3d({ ...a, ids: a.ids3d }); if (!g || !g.tres_d) throw new Error('mapear_arte: id3d = o objeto 3D');
        const arte = (a.arte ? [].concat(a.arte).map(n => vkObj(n) || vkTodos().map(x => x.o).find(x => x.nome === n)) : vkTxAlvos(a).filter(o => o !== g)).filter(Boolean);
        if (!arte.length) throw new Error('mapear_arte: arte = ids ou nomes dos objetos a mapear');
        for (const { o } of vkTodos()) if (o.tipo === 'texto' && arte.some(x => x === o || (x.itens && JSON.stringify(x).includes(o.id)))) await vkGeoPronta(o);
        const m = { arte: arte.map(vkClone), escala: a.escala ?? 100 };
        if (a.angulo != null) m.angulo = +a.angulo; if (a.y != null) m.y = a.un === 'pt' ? +a.y : vkPT(+a.y);
        if (a.face != null) m.face = isNaN(+a.face) ? a.face : +a.face; if (a.dx != null) m.dx = vkPT(+a.dx); if (a.dy != null) m.dy = vkPT(+a.dy);
        (g.tres_d.mapas = g.tres_d.mapas || []).push(m);
        if (a.manter !== true) for (const o of arte) { const l = vkListaDe(o.id); if (l) l.splice(l.indexOf(o), 1); }
        vk3dRefazer(g); VK.sel = [g.id];
        return { id: g.id, mapas: g.tres_d.mapas.length };
    });
    vkRegistrar('limpar_mapas', 'tirar artes mapeadas', a => { const g = alvo3d(a); g.tres_d.mapas = []; vk3dRefazer(g); return { id: g.id }; });
    // expandir_3d: vira grupo comum (sem refazer)
    vkRegistrar('expandir_3d', 'expandir 3D', a => { const g = alvo3d(a); delete g.tres_d; g.nome = (g.nome || '3D') + ' (expandido)'; return { id: g.id }; });
})();
// mover/escalar/girar no 2D: a origem guardada acompanha (refazer não pula de volta)
const vkTransformarSem3d = vkTransformar;
vkTransformar = function (o, M) {
    if (o.tipo === 'malha' || !o.tres_d) return vkTransformarSem3d(o, M);
    vkTransformarSem3d(o.tres_d.fonte, M); (o.tres_d.mapas || []).forEach(m => m.arte.forEach(x => vkTransformarSem3d(x, M)));
    if (o.tres_d.profundidade) o.tres_d.profundidade *= Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2]));
    return vkTransformarSem3d(o, M);
};
const vkCoresSem3d = vkCores;
vkCores = function (o) { const out = vkCoresSem3d(o); if (o.tres_d) { out.push(o.tres_d.cor); if (o.tres_d.cor_lado) out.push(o.tres_d.cor_lado); } return out; };

// painel (Propriedades) e menu
const vkApPainelSem3d = vkApPainel;
vkApPainel = function (objs) {
    let h = vkApPainelSem3d(objs); const g = objs.length === 1 && objs[0].tres_d; if (!g) return h;
    const n = (r, k, v, min, max, passo = 1) => `<label class="vk-nota" style="display:flex;gap:6px;align-items:center">${r}<input type="range" data-3d="${k}" min="${min}" max="${max}" step="${passo}" value="${v}" style="flex:1"><span>${v}</span></label>`;
    return h + `<div class="vk-sec"><div class="vk-sec-t">3D (${g.tipo === 'girar' ? 'girar' : 'extrudar'})</div>
        ${n('Inclinar', 'inclinar', g.inclinar || 0, -90, 90)}${n('Girar', 'girar', g.girar || 0, -180, 180)}${n('Rolar', 'rolar', g.rolar || 0, -90, 90)}
        ${n('Perspectiva', 'perspectiva', g.perspectiva || 0, 0, 100)}${g.tipo === 'extrudar' ? n('Profundidade', 'profundidade', vkR(vkMM(g.profundidade ?? 20), 1), 0.5, 200, 0.5) : ''}
        ${n('Luz', 'luz', g.luz ?? 100, 20, 160)}${n('Luz: direção', 'luz_ang', g.luz_ang ?? -40, -90, 90)}${n('Grão', 'grao', g.grao || 0, 0, 80)}
        <div class="vk-linha">Material <select data-3d="material">${Object.keys(VK_MATERIAIS).map(k => `<option ${g.material === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <label class="vk-chk"><input type="checkbox" data-3d="sombra_chao" ${g.sombra_chao ? 'checked' : ''}> Sombra no chão</label></div>
        <div class="vk-bts"><button class="ie-btn ie-btn-mini" data-3dm>Mapear arte (selecione 3D + arte)</button><button class="ie-btn ie-btn-mini" data-3dx>Expandir</button></div></div>`;
};
const vkApPainelEventosSem3d = vkApPainelEventos;
vkApPainelEventos = function (el) {
    vkApPainelEventosSem3d(el);
    el.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset['3d']; if (k && e.target.type === 'range') e.target.nextElementSibling.textContent = e.target.value; });
    el.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset['3d']; if (!k) return; e.stopPropagation();
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.tagName === 'SELECT' ? e.target.value : +e.target.value;
        vkCmdUi('editar_3d', { [k]: k === 'profundidade' ? vkPT(v) : v }); }, true);
    el.addEventListener('click', e => {
        if (e.target.closest('[data-3dx]')) vkCmdUi('expandir_3d', {});
        if (e.target.closest('[data-3dm]')) { const s = VK.sel.map(vkObj).filter(Boolean), g = s.find(o => o.tres_d); if (!g || s.length < 2) return vkToast('Selecione o objeto 3D e a arte a mapear');
            vkCmdUi('mapear_arte', { id3d: g.id, arte: s.filter(o => o !== g).map(o => o.id) }); }
    });
};
(() => {
    const m = VK_MENUS.find(x => x[0] === 'Objeto'); if (!m) return;
    m[1].push('-', ['3D: Girar (perfil → copo, garrafa)', '', () => vkCmdUi('girar_3d', {})], ['3D: Extrudar (forma → volume)', '', () => vkCmdUi('extrudar_3d', { profundidade: vkPT(15) })],
        ['3D: Mapear arte (3D + arte selecionados)', '', () => { const s = VK.sel.map(vkObj).filter(Boolean), g = s.find(o => o.tres_d); if (g) vkCmdUi('mapear_arte', { id3d: g.id, arte: s.filter(o => o !== g).map(o => o.id) }); }],
        ['3D: Expandir', '', () => vkCmdUi('expandir_3d', {})]);
})();
