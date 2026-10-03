// =========================================================
// Editor de Imagem — Caneta e demarcadores, como no Photoshop.
// Caneta (P): clique = ponto de canto; clicar e arrastar = ponto suave (alças simétricas); clicar no 1º ponto fecha;
//   Shift = 45°; Alt sobre o último ponto = quebra a alça de saída (arrastar puxa só ela); Alt sobre um ponto =
//   Converter ponto (clique: canto; arrastar: puxa alças); Alt sobre alça = move só ela; Ctrl = Seleção direta
//   temporária; Adicionar/excluir automaticamente (sobre um segmento adiciona, sobre um ponto exclui); Elástico;
//   Enter/Esc termina; Backspace apaga o último ponto. Modo Demarcador ou Forma (camada de forma vetorial editável).
// Caneta de forma livre (com Magnética: o traço gruda na borda mais forte), Adicionar/Excluir/Converter ponto.
// Seleção de demarcador (A, seta preta: o subdemarcador inteiro; Alt+arrastar duplica) e Seleção direta (A, seta
// branca: pontos e alças; arrastar no vazio seleciona pontos; Delete apaga). Painel Demarcadores: demarcador de
// trabalho, salvar, Preencher, Traçar com o pincel, Carregar como seleção (Ctrl+Enter), Demarcador da seleção, Máscara.
// Modelo: doc.dems = [{id, nome, trabalho, subs: [{pts: [{x, y, i: [x,y]|null, o: [x,y]|null}], fechado, op}]}],
// doc.demAtivo = id; camada de forma: L.tipo = 'forma', L.vet = {subs, cor} (redesenhada a cada edição).
// =========================================================

Object.assign(IE.op, {
    caneta: { modo: 'demarcador', op: 'somar', auto: true, elastico: true, cor: '#3d7bff' },
    canetaLivre: { modo: 'demarcador', magnetica: false, ajuste: 2, largura: 10 },
});
Object.assign(IE_ICONES, {
    pen: '<path d="M12 3l7 9-4 7H9l-4-7z"/><path d="M12 3v8"/><circle cx="12" cy="12" r="1.5"/><path d="M9 21h6"/>',
    penFree: '<path d="M12 3l7 9-4 7H9l-4-7z"/><path d="M3 20c3-3 5 1 8-2"/>',
    penAdd: '<path d="M10 4l6 8-3 6H8l-3-6z"/><path d="M19 3v6M16 6h6"/>',
    penDel: '<path d="M10 4l6 8-3 6H8l-3-6z"/><path d="M16 6h6"/>',
    penConv: '<path d="M4 20l8-16 8 16"/><path d="M8 13h8"/>',
    pathSel: '<path d="M6 3v16l4-4 3 6 2-1-3-6h6z" fill="currentColor"/>',
    directSel: '<path d="M6 3v16l4-4 3 6 2-1-3-6h6z"/>',
    paths: '<path d="M4 18c4-10 12-10 16 0"/><rect x="2.5" y="16.5" width="3" height="3"/><rect x="18.5" y="16.5" width="3" height="3"/>',
});

// ─────────────────────────── geometria ───────────────────────────
function ieDemPtsSeg(a, b) { return [[a.x, a.y], a.o || [a.x, a.y], b.i || [b.x, b.y], [b.x, b.y]]; }
function ieBez(P, t) {
    const u = 1 - t;
    return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
        u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]];
}
function ieDemSegs(sub) {
    const n = sub.pts.length, out = [];
    for (let i = 0; i + 1 < n; i++) out.push([i, i + 1]);
    if (sub.fechado && n > 2) out.push([n - 1, 0]);
    return out;
}
function ieDemTracar(ctx, sub, M) {   // M(x, y) → [x, y] (tela ou documento)
    const p = sub.pts;
    if (!p.length) return;
    const q = (a) => M(a[0], a[1]);
    ctx.moveTo(...q([p[0].x, p[0].y]));
    for (const [a, b] of ieDemSegs(sub)) { const P = ieDemPtsSeg(p[a], p[b]); ctx.bezierCurveTo(...q(P[1]), ...q(P[2]), ...q(P[3])); }
    if (sub.fechado) ctx.closePath();
}
// pontos ao longo do demarcador (passo em px do documento) — para traçar com o pincel e para o laço
function ieDemAmostras(sub, passo = 2) {
    const out = [];
    for (const [a, b] of ieDemSegs(sub)) {
        const P = ieDemPtsSeg(sub.pts[a], sub.pts[b]);
        const L = Math.hypot(P[3][0] - P[0][0], P[3][1] - P[0][1]) + Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) + Math.hypot(P[3][0] - P[2][0], P[3][1] - P[2][1]);
        const n = Math.max(2, Math.ceil(L / passo));
        for (let k = out.length ? 1 : 0; k <= n; k++) out.push(ieBez(P, k / n));
    }
    if (!out.length && sub.pts.length) out.push([sub.pts[0].x, sub.pts[0].y]);
    return out;
}
// divide o segmento a→b em t (de Casteljau): o novo ponto fica no meio sem mudar a forma
function ieDemDividir(sub, a, b, t) {
    const P = ieDemPtsSeg(sub.pts[a], sub.pts[b]), lerp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const p01 = lerp(P[0], P[1]), p12 = lerp(P[1], P[2]), p23 = lerp(P[2], P[3]), p012 = lerp(p01, p12), p123 = lerp(p12, p23), m = lerp(p012, p123);
    const curvo = sub.pts[a].o || sub.pts[b].i;
    if (curvo) { sub.pts[a].o = p01; sub.pts[b].i = p23; }
    const novo = { x: m[0], y: m[1], i: curvo ? p012 : null, o: curvo ? p123 : null };
    sub.pts.splice(b === 0 ? sub.pts.length : b, 0, novo);
    return novo;
}

// ─────────────────────────── alvo: demarcador ativo ou camada de forma ───────────────────────────
function ieDemDoc(doc) { doc.dems = doc.dems || []; return doc.dems; }
function ieDemAtivo(doc) { return ieDemDoc(doc).find(d => d.id === doc.demAtivo) || null; }
function ieDemAlvo(doc, criar = false) {
    const L = ieAtiva(doc);
    if (L && L.tipo === 'forma' && L.vet) return { subs: L.vet.subs, L };
    let d = ieDemAtivo(doc);
    if (!d && criar) {
        d = ieDemDoc(doc).find(x => x.trabalho);
        if (!d) { d = { id: (doc.seqDem = (doc.seqDem || 0) + 1), nome: ieT('Demarcador de trabalho'), trabalho: true, subs: [] }; doc.dems.push(d); }
        doc.demAtivo = d.id;
    }
    return d;
}
function ieDemMudou(doc, alvo) {
    if (alvo && alvo.L) ieFormaRender(alvo.L);
    doc.sujo = true;
    ieDesenharSobre();
    ieJanAtualizar?.('doc');
}

// camada de forma vetorial: preenchimento da cor com o demarcador (regra de preenchimento por operação)
function ieFormaRender(L, doc = IE.doc) {
    const R0 = ieRCamada(L);
    const c = ieDemMascara(doc, L.vet.subs);
    if (!c) { L.c = null; ieInvalidar(L); ieCamadaMudou(L, R0); return; }
    const b = ieLimites(c);
    const n = ieCanvas(Math.max(1, b ? b.w : 1), Math.max(1, b ? b.h : 1)), x = ieCtx(n);
    if (b) { x.drawImage(c, -b.x, -b.y); x.globalCompositeOperation = 'source-in'; x.fillStyle = L.vet.cor || '#000'; x.fillRect(0, 0, n.width, n.height); }
    L.c = n; L.x = b ? b.x : 0; L.y = b ? b.y : 0; L.sujoPx = true;
    ieInvalidar(L); ieCamadaMudou(L, R0);
}
// demarcador → máscara do tamanho do documento (operações dos subdemarcadores na ordem, como o Photoshop)
function ieDemMascara(doc, subs) {
    if (!subs || !subs.some(s => s.pts.length > 1)) return null;
    const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
    for (const s of subs) {
        if (s.pts.length < 2) continue;
        const t = ieCanvas(doc.w, doc.h), tx = ieCtx(t);
        tx.fillStyle = '#fff'; tx.beginPath(); ieDemTracar(tx, { ...s, fechado: true }, (a, b) => [a, b]); tx.fill();
        x.globalCompositeOperation = { somar: 'source-over', subtrair: 'destination-out', inter: 'destination-in', excluir: 'xor' }[s.op || 'somar'] || 'source-over';
        x.drawImage(t, 0, 0);
    }
    return c;
}

// ─────────────────────────── acerto do mouse (tela) ───────────────────────────
function ieDemAcertar(doc, alvo, p, { soSel = false, inicio = null } = {}) {
    if (!alvo) return null;
    const tol = 6 / doc.zoom, d = (x, y) => Math.hypot(x - p.x, y - p.y);
    if (inicio && d(inicio.x, inicio.y) < 12 / doc.zoom) return { tipo: 'ponto', sub: alvo.subs.find(s => s.pts[0] === inicio), pt: inicio };   // ímã para fechar
    const sel = IE.demSel || { pts: new Set() };
    // alças dos pontos selecionados (e do último ponto desenhado)
    for (const s of alvo.subs) for (const q of s.pts) {
        if (!(sel.pts.has(q) || q === IE.canetaUlt)) continue;
        for (const lado of ['i', 'o']) if (q[lado] && d(...q[lado]) < tol) return { tipo: 'alca', sub: s, pt: q, lado };
    }
    for (const s of alvo.subs) for (const q of s.pts) if (d(q.x, q.y) < tol) return { tipo: 'ponto', sub: s, pt: q };
    if (soSel) return null;
    for (const s of alvo.subs) for (const [a, b] of ieDemSegs(s)) {
        const P = ieDemPtsSeg(s.pts[a], s.pts[b]);
        let melhor = null;
        for (let k = 0; k <= 40; k++) { const q = ieBez(P, k / 40), dd = d(...q); if (!melhor || dd < melhor.d) melhor = { d: dd, t: k / 40 }; }
        if (melhor.d < tol) return { tipo: 'segmento', sub: s, a, b, t: melhor.t };
    }
    return null;
}
// linha em andamento: guardada por posição (o Ctrl+Z troca os objetos e a caneta continua de onde ficou)
function ieCanetaChave(alvo) { return alvo ? (alvo.L ? 'L' + alvo.L.id : 'D' + alvo.id) : null; }
function ieCanetaCur(doc, alvo = ieDemAlvo(doc)) {
    const r = IE.canetaRef;
    if (!r || !alvo || r.chave !== ieCanetaChave(alvo)) return null;
    const s = alvo.subs[r.i];
    if (!s || s.fechado || !s.pts.length) return null;
    if (!s.pts.includes(IE.canetaUlt)) IE.canetaUlt = s.pts[s.pts.length - 1];
    return s;
}
function ieCanetaFixar(alvo, sub) { IE.canetaRef = sub ? { chave: ieCanetaChave(alvo), i: alvo.subs.indexOf(sub) } : null; }
// cursor da caneta como no Photoshop (bico com o sinal da ação); CapsLock = cruz de precisão
function ieCanetaCursorSvg(sinal) {
    const marca = { mais: '<path d="M17 3v6M14 6h6"/>', menos: '<path d="M14 6h6"/>', fechar: '<circle cx="17" cy="6" r="2.6"/>', novo: '<path d="M14.5 3.5l5 5M19.5 3.5l-5 5"/>',
        converter: '<path d="M14 9l3-6 3 6"/>' }[sinal] || '';
    const bico = '<path d="M3 21l2.2-7.5L13 6l5 5-7.5 7.8z"/><path d="M3 21l5.6-5.6"/><circle cx="9.6" cy="14.4" r="1.4"/>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#fff" stroke-width="3.2">${bico}${marca}</g><g stroke="#000" stroke-width="1.3">${bico}${marca}</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 21, crosshair`;
}
function ie45(p0, p) {   // Shift: ângulo em passos de 45°
    const dx = p.x - p0[0], dy = p.y - p0[1], a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(dx, dy);
    return { x: p0[0] + Math.cos(a) * r, y: p0[1] + Math.sin(a) * r };
}

// ─────────────────────────── Caneta ───────────────────────────
const IE_CANETA = {
    nome: 'Caneta', tecla: 'P', icone: 'pen', cursor: () => IE._canetaCursor || 'crosshair',
    ativar() { IE.demSel = IE.demSel || { subs: new Set(), pts: new Set() }; },
    down(p, ev, doc) {
        if (ev.ctrlKey) return IE_SEL_DIRETA.down(p, ev, doc);
        const forma = IE.op.caneta.modo === 'forma';
        let alvo = ieDemAlvo(doc);
        if (forma && !(alvo && alvo.L)) {   // modo Forma: a primeira âncora cria a camada de forma
            const L = ieNovaCamada(doc, { tipo: 'forma', nome: ieNomeLivre(doc, ieT('Forma')), vet: { subs: [], cor: IE.op.caneta.cor }, sujoPx: true });
            ieInserirAcima(doc, L, ieAtiva(doc)); ieAtivar(L.id, doc); IE.canetaRef = null;
            alvo = { subs: L.vet.subs, L };
        }
        if (!alvo) alvo = ieDemAlvo(doc, true);
        const cur = ieCanetaCur(doc, alvo);
        const h = ieDemAcertar(doc, alvo, p, { inicio: cur && cur.pts.length > 1 ? cur.pts[0] : null });
        if (cur && h && h.tipo === 'ponto' && h.pt === cur.pts[0] && cur.pts.length > 1) {   // fechar
            cur.fechado = true; IE.canetaArr = { tipo: 'fechar', pt: cur.pts[0], alvo }; IE.canetaUlt = cur.pts[0]; return;
        }
        if (cur && h && h.tipo === 'ponto' && h.pt === cur.pts[cur.pts.length - 1] && ev.altKey) {   // quebrar a alça de saída
            h.pt.o = null; IE.canetaArr = { tipo: 'saida', pt: h.pt, alvo }; return;
        }
        if (ev.altKey && h && h.tipo === 'alca') { IE.canetaArr = { tipo: 'alca', pt: h.pt, lado: h.lado, alvo }; return; }
        if (ev.altKey && h && h.tipo === 'ponto') {   // Converter ponto
            h.pt.i = h.pt.o = null; IE.canetaArr = { tipo: 'converter', pt: h.pt, alvo }; IE.canetaUlt = h.pt; ieDemMudou(doc, alvo); return;
        }
        if (IE.op.caneta.auto && !cur && h && h.tipo === 'ponto') {   // excluir ponto
            h.sub.pts.splice(h.sub.pts.indexOf(h.pt), 1);
            if (h.sub.pts.length < 2) alvo.subs.splice(alvo.subs.indexOf(h.sub), 1);
            ieDemMudou(doc, alvo); ieHist(ieT('Excluir ponto de ancoragem')); return;
        }
        if (IE.op.caneta.auto && h && h.tipo === 'segmento') {   // adicionar ponto
            IE.canetaUlt = ieDemDividir(h.sub, h.a, h.b, h.t);
            ieDemMudou(doc, alvo); ieHist(ieT('Adicionar ponto de ancoragem')); return;
        }
        let sub = cur;
        if (!sub) { sub = { pts: [], fechado: false, op: IE.op.caneta.op }; alvo.subs.push(sub); ieCanetaFixar(alvo, sub); IE.demSel = { subs: new Set([sub]), pts: new Set() }; }
        const ult = sub.pts[sub.pts.length - 1];
        const q = ev.shiftKey && ult ? ie45([ult.x, ult.y], p) : p;
        const pt = { x: q.x, y: q.y, i: null, o: null };
        sub.pts.push(pt);
        IE.canetaUlt = pt;
        IE.canetaArr = { tipo: 'novo', pt, alvo };
        ieDemMudou(doc, alvo);
    },
    move(p, ev, doc) {
        const a = IE.canetaArr;
        if (!a) return IE.canetaDir ? IE_SEL_DIRETA.move(p, ev, doc) : undefined;
        const pt = a.pt;
        let q = ev.shiftKey ? ie45([pt.x, pt.y], p) : p;
        if (Math.hypot(q.x - pt.x, q.y - pt.y) * doc.zoom < 2) return;
        const esp = [2 * pt.x - q.x, 2 * pt.y - q.y];
        if (a.tipo === 'novo' || a.tipo === 'converter') { pt.o = [q.x, q.y]; pt.i = esp; }
        else if (a.tipo === 'fechar') { pt.i = esp; pt.o = [q.x, q.y]; }   // arrastar ao fechar: alças do 1º ponto
        else if (a.tipo === 'saida') pt.o = [q.x, q.y];
        else if (a.tipo === 'alca') pt[a.lado] = [q.x, q.y];
        a.mudou = true;
        ieDemMudou(doc, a.alvo);
    },
    up(p, ev, doc) {
        if (IE.canetaDir) return IE_SEL_DIRETA.up(p, ev, doc);
        const a = IE.canetaArr;
        IE.canetaArr = null;
        if (!a) return;
        if (a.tipo === 'fechar') IE.canetaRef = null;
        ieHist(ieT({ novo: 'Ponto de ancoragem', fechar: 'Fechar demarcador', converter: 'Converter ponto', saida: 'Converter ponto', alca: 'Mover alça' }[a.tipo] || 'Caneta'));
    },
    hover(p, ev, doc) {
        const alvo = ieDemAlvo(doc), cur = alvo && ieCanetaCur(doc, alvo);
        const h = alvo && ieDemAcertar(doc, alvo, p, { inicio: cur && cur.pts.length > 1 ? cur.pts[0] : null });
        let sinal = cur ? '' : 'novo';
        IE.canetaFecha = !!(cur && h && h.tipo === 'ponto' && h.pt === cur.pts[0] && cur.pts.length > 1);
        if (ev.ctrlKey) sinal = 'seta';
        else if (IE.canetaFecha) sinal = 'fechar';   // caneta com ○: clicar fecha
        else if (ev.altKey && h) sinal = 'converter';
        else if (IE.op.caneta.auto && h && h.tipo === 'segmento') sinal = 'mais';
        else if (IE.op.caneta.auto && !cur && h && h.tipo === 'ponto') sinal = 'menos';
        IE._canetaCursor = sinal === 'seta' ? 'default' : ev.getModifierState && ev.getModifierState('CapsLock') ? 'crosshair' : ieCanetaCursorSvg(sinal);
        ieDesenharSobre();
    },
};

// ─────────────────────────── Caneta de forma livre (e Magnética) ───────────────────────────
function ieDemSimplificar(pts, tol) {   // Ramer-Douglas-Peucker
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    let imax = 0, dmax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
        if (d > dmax) { dmax = d; imax = i; }
    }
    if (dmax <= tol) return [a, b];
    return [...ieDemSimplificar(pts.slice(0, imax + 1), tol).slice(0, -1), ...ieDemSimplificar(pts.slice(imax), tol)];
}
// pontos → demarcador suave (tangentes de Catmull-Rom)
function ieDemDePontos(pts, fechado) {
    const n = pts.length, out = pts.map(([x, y]) => ({ x, y, i: null, o: null }));
    for (let k = 0; k < n; k++) {
        const ant = pts[fechado ? (k - 1 + n) % n : Math.max(0, k - 1)], prox = pts[fechado ? (k + 1) % n : Math.min(n - 1, k + 1)];
        if (!fechado && (k === 0 || k === n - 1)) continue;
        const tx = (prox[0] - ant[0]) / 6, ty = (prox[1] - ant[1]) / 6;
        out[k].i = [pts[k][0] - tx, pts[k][1] - ty]; out[k].o = [pts[k][0] + tx, pts[k][1] + ty];
    }
    return out;
}
// borda mais forte perto do ponto (Magnética): gradiente da composição no raio "largura"
function ieDemBorda(doc, p, raio) {
    if (!IE._bordaMapa || IE._bordaMapa.doc !== doc || IE._bordaMapa.v !== doc.hist.i) {
        ieCompor(doc, ieRDoc(doc));
        const W = doc.w, H = doc.h, d = ieCtx(doc.comp).getImageData(0, 0, W, H).data, g = new Float32Array(W * H), lum = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) lum[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const i = y * W + x, gx = lum[i + 1] - lum[i - 1], gy = lum[i + W] - lum[i - W];
            g[i] = Math.hypot(gx, gy);
        }
        IE._bordaMapa = { doc, v: doc.hist.i, g, W, H };
    }
    const { g, W, H } = IE._bordaMapa;
    let melhor = [p.x, p.y], m = -1;
    for (let dy = -raio; dy <= raio; dy++) for (let dx = -raio; dx <= raio; dx++) {
        if (dx * dx + dy * dy > raio * raio) continue;
        const x = Math.round(p.x + dx), y = Math.round(p.y + dy);
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const v = g[y * W + x] - Math.hypot(dx, dy) * 0.8;   // a mais forte, preferindo a mais perto
        if (v > m) { m = v; melhor = [x, y]; }
    }
    return melhor;
}
const IE_CANETA_LIVRE = {
    nome: 'Caneta de forma livre', tecla: 'P', icone: 'penFree', cursor: 'crosshair',
    down(p, ev, doc) {
        const o = IE.op.canetaLivre;
        IE.canetaLivre = { pts: [o.magnetica ? ieDemBorda(doc, p, o.largura) : [p.x, p.y]] };
    },
    move(p, ev, doc) {
        const l = IE.canetaLivre; if (!l) return;
        const o = IE.op.canetaLivre, q = o.magnetica ? ieDemBorda(doc, p, o.largura) : [p.x, p.y], u = l.pts[l.pts.length - 1];
        if (Math.hypot(q[0] - u[0], q[1] - u[1]) >= 1) l.pts.push(q);
        ieDesenharSobre();
    },
    up(p, ev, doc) {
        const l = IE.canetaLivre; IE.canetaLivre = null;
        if (!l || l.pts.length < 3) { ieDesenharSobre(); return; }
        const o = IE.op.canetaLivre, a = l.pts[0], b = l.pts[l.pts.length - 1];
        const fechado = Math.hypot(a[0] - b[0], a[1] - b[1]) * doc.zoom < 12;
        const pts = ieDemSimplificar(fechado ? l.pts.slice(0, -1) : l.pts, Math.max(0.5, o.ajuste));
        const alvo = ieDemAlvo(doc, true);
        alvo.subs.push({ pts: ieDemDePontos(pts, fechado), fechado, op: IE.op.caneta.op });
        ieDemMudou(doc, alvo); ieHist(ieT('Caneta de forma livre'));
    },
    sobre(ctx, doc) {
        const l = IE.canetaLivre; if (!l) return;
        ctx.save(); ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 1.5; ctx.beginPath();
        l.pts.forEach((q, i) => { const s = ieDocTela(q[0], q[1], doc); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
        ctx.stroke(); ctx.restore();
    },
};

// ─────────────────────────── Adicionar / Excluir / Converter ponto ───────────────────────────
const IE_PONTO_ADD = {
    nome: 'Adicionar ponto de ancoragem', tecla: 'P', icone: 'penAdd', cursor: 'copy',
    down(p, ev, doc) {
        const alvo = ieDemAlvo(doc), h = alvo && ieDemAcertar(doc, alvo, p);
        if (h && h.tipo === 'segmento') { IE.canetaUlt = ieDemDividir(h.sub, h.a, h.b, h.t); IE.canetaArr = { tipo: 'converter', pt: IE.canetaUlt, alvo, mudou: false }; ieDemMudou(doc, alvo); }
        else if (h && h.tipo !== 'segmento') IE_SEL_DIRETA.down(p, ev, doc);
    },
    move(p, ev, doc) { if (IE.canetaArr) IE_CANETA.move(p, ev, doc); else IE_SEL_DIRETA.move(p, ev, doc); },
    up(p, ev, doc) { if (IE.canetaArr) { IE.canetaArr = null; ieHist(ieT('Adicionar ponto de ancoragem')); } else IE_SEL_DIRETA.up(p, ev, doc); },
};
const IE_PONTO_DEL = {
    nome: 'Excluir ponto de ancoragem', tecla: 'P', icone: 'penDel', cursor: 'not-allowed',
    down(p, ev, doc) {
        const alvo = ieDemAlvo(doc), h = alvo && ieDemAcertar(doc, alvo, p);
        if (!h || h.tipo !== 'ponto') return;
        h.sub.pts.splice(h.sub.pts.indexOf(h.pt), 1);
        if (h.sub.pts.length < 2) alvo.subs.splice(alvo.subs.indexOf(h.sub), 1);
        ieDemMudou(doc, alvo); ieHist(ieT('Excluir ponto de ancoragem'));
    },
};
const IE_PONTO_CONV = {
    nome: 'Converter ponto', tecla: '', icone: 'penConv', cursor: 'alias',
    down(p, ev, doc) {
        const alvo = ieDemAlvo(doc), h = alvo && ieDemAcertar(doc, alvo, p);
        if (!h) return;
        if (h.tipo === 'alca') { IE.canetaArr = { tipo: 'alca', pt: h.pt, lado: h.lado, alvo }; return; }
        if (h.tipo === 'ponto') { h.pt.i = h.pt.o = null; IE.canetaUlt = h.pt; IE.canetaArr = { tipo: 'converter', pt: h.pt, alvo }; ieDemMudou(doc, alvo); }
    },
    move(p, ev, doc) { IE_CANETA.move(p, ev, doc); },
    up(p, ev, doc) { if (IE.canetaArr) { IE.canetaArr = null; ieHist(ieT('Converter ponto')); } },
};

// ─────────────────────────── Seleção direta (seta branca) ───────────────────────────
const IE_SEL_DIRETA = {
    nome: 'Seleção direta', tecla: 'A', icone: 'directSel', cursor: 'default',
    down(p, ev, doc) {
        const alvo = ieDemAlvo(doc);
        IE.canetaDir = true;
        IE.demSel = IE.demSel || { subs: new Set(), pts: new Set() };
        const sel = IE.demSel, h = alvo && ieDemAcertar(doc, alvo, p);
        if (h && h.tipo === 'alca') { IE.demArr = { alca: h, alvo, quebrar: ev.altKey }; return; }
        if (h && h.tipo === 'ponto') {
            if (ev.shiftKey) { sel.pts.has(h.pt) ? sel.pts.delete(h.pt) : sel.pts.add(h.pt); }
            else if (!sel.pts.has(h.pt)) sel.pts = new Set([h.pt]);
            sel.subs = new Set([h.sub]);
        } else if (h && h.tipo === 'segmento') {   // segmento: as duas pontas
            if (!ev.shiftKey) sel.pts = new Set();
            sel.pts.add(h.sub.pts[h.a]); sel.pts.add(h.sub.pts[h.b]); sel.subs = new Set([h.sub]);
        } else {
            if (!ev.shiftKey) sel.pts = new Set();
            IE.demArr = { caixa: { x0: p.x, y0: p.y, x1: p.x, y1: p.y }, alvo };
            ieDesenharSobre(); return;
        }
        IE.demArr = { mover: true, p0: { x: p.x, y: p.y }, alvo, base: [...sel.pts].map(q => ({ q, x: q.x, y: q.y, i: q.i && [...q.i], o: q.o && [...q.o] })) };
        ieDesenharSobre();
    },
    move(p, ev, doc) {
        const a = IE.demArr; if (!a) return;
        if (a.caixa) { a.caixa.x1 = p.x; a.caixa.y1 = p.y; ieDesenharSobre(); return; }
        if (a.alca) {
            const { pt, lado } = a.alca, outro = lado === 'i' ? 'o' : 'i';
            const q = ev.shiftKey ? ie45([pt.x, pt.y], p) : p;
            pt[lado] = [q.x, q.y];
            if (!a.quebrar && pt[outro]) {   // ponto suave: a outra alça acompanha (mesmo comprimento dela)
                const r = Math.hypot(pt[outro][0] - pt.x, pt[outro][1] - pt.y), ang = Math.atan2(pt.y - q.y, pt.x - q.x);
                pt[outro] = [pt.x + Math.cos(ang) * r, pt.y + Math.sin(ang) * r];
            }
            a.mudou = true; ieDemMudou(doc, a.alvo); return;
        }
        let dx = p.x - a.p0.x, dy = p.y - a.p0.y;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        for (const b of a.base) { b.q.x = b.x + dx; b.q.y = b.y + dy; if (b.i) b.q.i = [b.i[0] + dx, b.i[1] + dy]; if (b.o) b.q.o = [b.o[0] + dx, b.o[1] + dy]; }
        a.mudou = true; ieDemMudou(doc, a.alvo);
    },
    up(p, ev, doc) {
        const a = IE.demArr; IE.demArr = null; IE.canetaDir = false;
        if (!a) return;
        if (a.caixa) {
            const c = a.caixa, x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1);
            for (const s of (a.alvo ? a.alvo.subs : [])) for (const q of s.pts) if (q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) { IE.demSel.pts.add(q); IE.demSel.subs.add(s); }
            ieDesenharSobre(); return;
        }
        if (a.mudou) ieHist(ieT(a.alca ? 'Mover alça' : 'Mover ponto de ancoragem'));
    },
    sobre(ctx, doc) {
        const a = IE.demArr;
        if (!a || !a.caixa) return;
        const s0 = ieDocTela(a.caixa.x0, a.caixa.y0, doc), s1 = ieDocTela(a.caixa.x1, a.caixa.y1, doc);
        ctx.save(); ctx.strokeStyle = '#4aa3ff'; ctx.setLineDash([3, 3]); ctx.strokeRect(Math.min(s0.x, s1.x) + 0.5, Math.min(s0.y, s1.y) + 0.5, Math.abs(s1.x - s0.x), Math.abs(s1.y - s0.y)); ctx.restore();
    },
};

// ─────────────────────────── Seleção de demarcador (seta preta) ───────────────────────────
const IE_SEL_CAMINHO = {
    nome: 'Seleção de demarcador', tecla: 'A', icone: 'pathSel', cursor: 'default',
    down(p, ev, doc) {
        const alvo = ieDemAlvo(doc), h = alvo && ieDemAcertar(doc, alvo, p);
        IE.demSel = IE.demSel || { subs: new Set(), pts: new Set() };
        const sel = IE.demSel;
        if (!h) { if (!ev.shiftKey) { sel.subs = new Set(); sel.pts = new Set(); } ieDesenharSobre(); return; }
        if (ev.shiftKey) sel.subs.has(h.sub) ? sel.subs.delete(h.sub) : sel.subs.add(h.sub);
        else if (!sel.subs.has(h.sub)) sel.subs = new Set([h.sub]);
        if (ev.altKey) {   // Alt+arrastar: duplica e arrasta a cópia
            const copias = [...sel.subs].map(s => JSON.parse(JSON.stringify(s)));
            alvo.subs.push(...copias); sel.subs = new Set(copias);
        }
        sel.pts = new Set([...sel.subs].flatMap(s => s.pts));
        IE.demArr = { mover: true, p0: { x: p.x, y: p.y }, alvo, base: [...sel.pts].map(q => ({ q, x: q.x, y: q.y, i: q.i && [...q.i], o: q.o && [...q.o] })) };
        ieDesenharSobre();
    },
    move(p, ev, doc) { IE_SEL_DIRETA.move(p, ev, doc); },
    up(p, ev, doc) { const a = IE.demArr; IE.demArr = null; if (a && a.mudou) ieHist(ieT('Mover demarcador')); },
};

// ─────────────────────────── desenho por cima ───────────────────────────
function ieDemDesenhar(ctx, doc) {
    const alvo = ieDemAlvo(doc);
    if (!alvo || !alvo.subs.length) return;
    const ferr = IE.ferrTemp || IE.ferr, deDem = ['caneta', 'canetaLivre', 'pontoAdd', 'pontoDel', 'pontoConv', 'selDireta', 'selCaminho'].includes(ferr);
    const T = (x, y) => { const s = ieDocTela(x, y, doc); return [s.x, s.y]; };
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = '#2f6fff';
    for (const s of alvo.subs) { ctx.beginPath(); ieDemTracar(ctx, s, T); ctx.stroke(); }
    if (deDem) {
        const sel = IE.demSel || { subs: new Set(), pts: new Set() };
        // elástico: do último ponto até o mouse
        const cur = ieCanetaCur(doc, alvo);
        if (ferr === 'caneta' && cur && IE.op.caneta.elastico && IE.mouse && !IE.canetaArr && cur.pts.length) {
            const u = cur.pts[cur.pts.length - 1], P = [[u.x, u.y], u.o || [u.x, u.y], [IE.mouse.x, IE.mouse.y], [IE.mouse.x, IE.mouse.y]];
            ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(...T(...P[0])); ctx.bezierCurveTo(...T(...P[1]), ...T(...P[2]), ...T(...P[3])); ctx.stroke(); ctx.setLineDash([]);
        }
        if (cur && cur.pts.length > 1) {
            const [x, y] = T(cur.pts[0].x, cur.pts[0].y), perto = IE.canetaFecha;
            ctx.strokeStyle = perto ? '#ffb000' : '#2f6fff'; ctx.lineWidth = perto ? 2 : 1.5;
            ctx.beginPath(); ctx.arc(x, y, perto ? 8 : 6, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
        }
        for (const s of alvo.subs) {
            const ativo = sel.subs.has(s) || s === cur;
            for (const q of s.pts) {
                const mostra = sel.pts.has(q) || q === IE.canetaUlt;
                if (mostra) for (const lado of ['i', 'o']) if (q[lado]) {
                    const a = T(q.x, q.y), b = T(...q[lado]);
                    ctx.strokeStyle = '#2f6fff'; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
                    ctx.fillStyle = '#2f6fff'; ctx.beginPath(); ctx.arc(b[0], b[1], 3, 0, Math.PI * 2); ctx.fill();
                }
                if (!ativo && ferr !== 'selDireta') continue;
                const [x, y] = T(q.x, q.y);
                ctx.fillStyle = sel.pts.has(q) || ferr === 'selCaminho' ? '#2f6fff' : '#ffffff';
                ctx.strokeStyle = '#2f6fff';
                ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7); ctx.strokeRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7);
            }
        }
    }
    ctx.restore();
}
(function () {
    const orig = ieDesenharSobre;
    ieDesenharSobre = function () {
        orig();
        const doc = IE.doc, c = ieEl('ie-sobre');
        if (!doc || !c || IE.semExtras) return;
        const ctx = ieCtx(c), dpr = ieDpr();
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        try { ieDemDesenhar(ctx, doc); } catch (e) { console.error('[caneta]', e); }
        ctx.restore();
    };
})();

// teclado: Enter/Esc terminam o demarcador; Backspace apaga o último ponto (desenhando) ou os pontos/subdemarcadores
// selecionados; Ctrl+Enter carrega como seleção
document.addEventListener('keydown', ev => {
    const doc = IE.doc, ferr = IE.ferr;
    if (!doc || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || !document.querySelector('#page-editor-imagem.active')) return;
    const nossas = ['caneta', 'canetaLivre', 'pontoAdd', 'pontoDel', 'pontoConv', 'selDireta', 'selCaminho'];
    if (ev.key === 'Enter' && ev.ctrlKey && ieDemAlvo(doc)) { ev.preventDefault(); ev.stopPropagation(); ieDemSelecao(doc); return; }
    if (!nossas.includes(ferr) || IE.transf) return;
    if (ev.key === 'Enter' || ev.key === 'Escape') {   // Enter: termina e esconde (continua no painel Demarcadores); Esc: só termina a linha
        const alvo = ieDemAlvo(doc), tinha = !!ieCanetaCur(doc, alvo);
        if (!tinha && ev.key === 'Escape') return;
        ev.preventDefault(); ev.stopPropagation();
        IE.canetaRef = null; IE.canetaUlt = null;
        if (ev.key === 'Enter' && alvo && !alvo.L) { doc.demAtivo = null; IE.demSel = { subs: new Set(), pts: new Set() }; ieJanAtualizar?.('doc'); }
        ieDesenharSobre();
        // o Enter também leva o foco à barra de opções: devolve à tela, senão o próximo atalho cai num campo
        setTimeout(() => { const a = document.activeElement; if (a && /INPUT|SELECT|BUTTON/.test(a.tagName)) a.blur(); ieEl('ie')?.focus({ preventScroll: true }); }, 0);
        return;
    }
    if (ev.key === 'Backspace' || ev.key === 'Delete') {
        const alvo = ieDemAlvo(doc);
        if (!alvo) return;
        ev.preventDefault(); ev.stopPropagation();
        const cur = ieCanetaCur(doc, alvo);
        if (ferr === 'caneta' && cur) { cur.pts.pop(); IE.canetaUlt = cur.pts[cur.pts.length - 1] || null; if (!cur.pts.length) { alvo.subs.splice(alvo.subs.indexOf(cur), 1); IE.canetaRef = null; } }
        else if (ferr === 'selCaminho') { const s = IE.demSel?.subs || new Set(); for (let i = alvo.subs.length - 1; i >= 0; i--) if (s.has(alvo.subs[i])) alvo.subs.splice(i, 1); IE.demSel = { subs: new Set(), pts: new Set() }; }
        else {
            const pts = IE.demSel?.pts || new Set();
            for (let i = alvo.subs.length - 1; i >= 0; i--) { const s = alvo.subs[i]; s.pts = s.pts.filter(q => !pts.has(q)); if (s.pts.length < 2) alvo.subs.splice(i, 1); }
            IE.demSel = { subs: new Set(), pts: new Set() };
        }
        ieDemMudou(doc, alvo); ieHist(ieT('Excluir ponto de ancoragem'));
    }
}, true);

// ─────────────────────────── comandos (painel Demarcadores, menu e barra de opções) ───────────────────────────
// Fazer seleção (Ctrl+Enter carrega direto; o diálogo tem suavização e operação, como no Photoshop)
async function ieDemSelecao(doc, dialogo = false) {
    const alvo = ieDemAlvo(doc), m = alvo && ieDemMascara(doc, alvo.subs);
    if (!m) { ieToast(ieT('O demarcador precisa de pelo menos dois pontos')); return; }
    let v = { suav: 0, op: 'nova' };
    if (dialogo) {
        v = await ieDialogo({ titulo: 'Fazer seleção', campos: [{ id: 'suav', rotulo: 'Raio de suavização (px)', tipo: 'numero', min: 0, max: 250, valor: 0 },
            { id: 'op', rotulo: 'Operação', tipo: 'select', valor: doc.sel ? 'somar' : 'nova', opcoes: [['nova', 'Nova seleção'], ['somar', 'Adicionar à seleção'], ['subtrair', 'Subtrair da seleção'], ['cruzar', 'Interseção com a seleção']] }] });
        if (!v) return;
    }
    ieSelAplicar(doc, x => x.drawImage(m, 0, 0), v.op, null, +v.suav || 0);
    ieHist(ieT('Fazer seleção'));
}
function ieDemPreencher(doc) {
    const alvo = ieDemAlvo(doc), m = alvo && ieDemMascara(doc, alvo.subs), L = ieAtiva(doc);
    if (!m) return;
    if (!L || L.tipo !== 'pixel') { ieToast(ieT('Preencher demarcador: selecione uma camada de pixels')); return; }
    const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
    x.drawImage(m, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = IE.cor[0]; x.fillRect(0, 0, doc.w, doc.h);
    const R0 = ieRCamada(L); ieGravavel(L); ieCrescer(L, ieRDoc(doc), 0);
    ieCtx(L.c).drawImage(c, -L.x, -L.y);
    L.sujoPx = true; ieCamadaMudou(L, R0); ieHist(ieT('Preencher demarcador'));
}
// Traçar demarcador com o pincel (tamanho, dureza e cor atuais) — como "Traçar demarcador > Pincel"
function ieDemTracarPincel(doc, ferr = 'pincel') {
    const alvo = ieDemAlvo(doc), L = ieAtiva(doc);
    if (!alvo || !alvo.subs.length) return;
    if (!L || L.tipo !== 'pixel') { ieToast(ieT('Traçar demarcador: selecione uma camada de pixels')); return; }
    const tracos = alvo.subs.map(s => ieDemAmostras(s, 2)).filter(t => t.length > 1);
    KNV.lote(() => tracos.forEach(t => {
        ieTracoIniciar({ x: t[0][0], y: t[0][1] }, { pressure: 1 }, doc, ferr);
        t.slice(1).forEach(q => ieTracoPara({ x: q[0], y: q[1] }));
        ieTracoFim();
    }), 'Traçar demarcador');
}
// Demarcador de trabalho da seleção (contorno das formigas, simplificado com a tolerância)
async function ieDemDaSelecao(doc, tol) {
    if (!doc.sel) { ieToast(ieT('Faça uma seleção primeiro')); return; }
    if (tol == null) { const v = await ieDialogo({ titulo: 'Criar demarcador de trabalho', campos: [{ id: 't', rotulo: 'Tolerância (px)', tipo: 'numero', min: 0.5, max: 10, passo: 0.5, valor: 2 }] }); if (!v) return; tol = +v.t; }
    const laços = ieContornos(doc.sel.c, doc.sel.bbox);
    const d = { id: (doc.seqDem = (doc.seqDem || 0) + 1), nome: ieT('Demarcador de trabalho'), trabalho: true, subs: laços.map(l => ({ pts: ieDemSimplificar(l, tol).slice(0, -1).map(([x, y]) => ({ x, y, i: null, o: null })), fechado: true, op: 'excluir' })) };
    if (d.subs.length) d.subs[0].op = 'somar';
    ieDemDoc(doc).splice(0, ieDemDoc(doc).length, ...ieDemDoc(doc).filter(x => !x.trabalho), d);
    doc.demAtivo = d.id;
    ieDemMudou(doc, d); ieHist(ieT('Criar demarcador de trabalho'));
}
// laços do contorno de uma máscara (alfa ≥ 128): segue a borda entre pixels (quadrados marchando)
function ieContornos(c, b) {
    const W = b.w + 2, H = b.h + 2, d = ieCtx(c).getImageData(b.x - 1, b.y - 1, W, H).data, dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] >= 128;
    const arestas = new Map(), chave = (x, y) => x + ',' + y;
    const add = (a, c2) => { const k = chave(...a); if (!arestas.has(k)) arestas.set(k, []); arestas.get(k).push(c2); };
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
        if (dentro(x, y) !== dentro(x, y - 1)) dentro(x, y) ? add([x + 1, y], [x, y]) : add([x, y], [x + 1, y]);
        if (dentro(x, y) !== dentro(x - 1, y)) dentro(x, y) ? add([x, y], [x, y + 1]) : add([x, y + 1], [x, y]);
    }
    const out = [];
    for (const [k0, lista] of arestas) while (lista.length) {
        const laço = [k0.split(',').map(Number)];
        let atual = lista.pop();
        while (atual) {
            laço.push(atual);
            const prox = arestas.get(chave(...atual));
            atual = prox && prox.length ? prox.pop() : null;
            if (atual && atual[0] === laço[0][0] && atual[1] === laço[0][1]) { laço.push(atual); break; }
        }
        if (laço.length > 3) out.push(laço.map(([x, y]) => [x + b.x - 1, y + b.y - 1]));
    }
    return out;
}
function ieDemMascaraCamada(doc) {   // máscara de camada a partir do demarcador (revela dentro)
    const alvo = ieDemAlvo(doc), m = alvo && ieDemMascara(doc, alvo.subs), L = ieAtiva(doc);
    if (!m || !L || L.tipo === 'grupo') return;
    L.m = { c: m, x: 0, y: 0, fundo: 0 }; ieAparar(L.m); L.sujoM = true;
    ieCamadaMudou(L, ieRDoc(doc)); ieHist(ieT('Máscara do demarcador')); ieUiCamadas();
}
function ieDemFormaDeCamada(doc) {   // "Criar: Forma" — o demarcador vira camada de forma com a cor de frente
    const d = ieDemAtivo(doc);
    if (!d || !d.subs.length) return;
    const L = ieNovaCamada(doc, { tipo: 'forma', nome: ieNomeLivre(doc, ieT('Forma')), vet: { subs: JSON.parse(JSON.stringify(d.subs)), cor: IE.cor[0] }, sujoPx: true });
    ieInserirAcima(doc, L, ieAtiva(doc)); ieAtivar(L.id, doc); ieFormaRender(L);
    ieHist(ieT('Forma do demarcador')); ieUiCamadas();
}

Object.assign(IE_FERR, { caneta: IE_CANETA, canetaLivre: IE_CANETA_LIVRE, pontoAdd: IE_PONTO_ADD, pontoDel: IE_PONTO_DEL, pontoConv: IE_PONTO_CONV, selCaminho: IE_SEL_CAMINHO, selDireta: IE_SEL_DIRETA });
{
    const i = IE_FERR_ORDEM.indexOf('texto');
    IE_FERR_ORDEM.splice(i, 0, 'caneta', 'canetaLivre', 'pontoAdd', 'pontoDel', 'pontoConv');
    const j = IE_FERR_ORDEM.indexOf('forma');
    IE_FERR_ORDEM.splice(j, 0, 'selCaminho', 'selDireta');
    if (typeof IE_FERR_GRUPOS !== 'undefined') {
        const t = IE_FERR_GRUPOS.findIndex(g => Array.isArray(g) && g[0] === 'texto');
        IE_FERR_GRUPOS.splice(t, 0, ['caneta', 'canetaLivre', 'pontoAdd', 'pontoDel', 'pontoConv']);
        const f = IE_FERR_GRUPOS.findIndex(g => Array.isArray(g) && g[0] === 'forma');
        IE_FERR_GRUPOS.splice(f, 0, ['selCaminho', 'selDireta']);
    }
}
Object.assign(IE_CMDS, {
    demSelecao: doc => ieDemSelecao(doc, true),
    demSelecaoJa: doc => ieDemSelecao(doc),
    demPreencher: doc => ieDemPreencher(doc),
    demTracar: doc => ieDemTracarPincel(doc),
    demDaSelecao: doc => ieDemDaSelecao(doc),
    demMascara: doc => ieDemMascaraCamada(doc),
    demForma: doc => ieDemFormaDeCamada(doc),
    demNovo: doc => { const d = { id: (doc.seqDem = (doc.seqDem || 0) + 1), nome: `${ieT('Demarcador')} ${ieDemDoc(doc).filter(x => !x.trabalho).length + 1}`, trabalho: false, subs: [] }; doc.dems.push(d); doc.demAtivo = d.id; IE.canetaRef = null; ieDemMudou(doc); ieHist(ieT('Novo demarcador')); },
    demSalvar: doc => { const d = ieDemAtivo(doc); if (d && d.trabalho) { d.trabalho = false; d.nome = `${ieT('Demarcador')} ${ieDemDoc(doc).filter(x => !x.trabalho).length}`; ieDemMudou(doc); ieHist(ieT('Salvar demarcador')); } },
    demExcluir: doc => { const d = ieDemAtivo(doc); if (d) { doc.dems = doc.dems.filter(x => x !== d); doc.demAtivo = null; IE.canetaRef = null; ieDemMudou(doc); ieHist(ieT('Excluir demarcador')); } },
    demNenhum: doc => { doc.demAtivo = null; IE.canetaRef = null; ieDemMudou(doc); },
});
Object.assign(IE_ATALHOS, { 'Ctrl+Enter': 'demSelecaoJa' });

// barra de opções (chamada pelo ieOpcoesRender)
(window.IE_OPCOES_EXTRA = window.IE_OPCOES_EXTRA || []).push(f => ieOpcoesCaneta(f));
function ieOpcoesCaneta(f) {
    if (f === 'caneta' || f === 'canetaLivre') {
        const o = IE.op.caneta;
        let h = ieSegm('modo', 'caneta', [['demarcador', 'Demarcador'], ['forma', 'Forma']]);
        if (o.modo === 'forma') h += `<label class="ie-op-campo">${ieT('Preenchimento')} <button class="ie-cor ie-op-cor" onclick="ieSeletorCor(this, IE.op.caneta.cor, c => { IE.op.caneta.cor = c; this.style.background = c; const L = ieAtiva(IE.doc); if (L && L.vet) { L.vet.cor = c; ieFormaRender(L); ieHist(ieT('Cor da forma')); } })" style="background:${o.cor}"></button></label>`;
        h += `<i class="ie-op-sep"></i><span class="ie-op-dica">${ieT('Criar:')}</span>` +
            `<button class="ie-btn ie-btn-mini" onclick="ieCmd('demSelecao')">${ieT('Seleção...')}</button><button class="ie-btn ie-btn-mini" onclick="ieCmd('demMascara')">${ieT('Máscara')}</button><button class="ie-btn ie-btn-mini" onclick="ieCmd('demForma')">${ieT('Forma')}</button>` +
            `<i class="ie-op-sep"></i><label class="ie-op-campo">${ieT('Operação')} <select data-k="op" data-o="caneta">${[['somar', 'Combinar formas'], ['subtrair', 'Subtrair forma da frente'], ['inter', 'Interseção de áreas'], ['excluir', 'Excluir formas sobrepostas']].map(([v, r]) => `<option value="${v}" ${o.op === v ? 'selected' : ''}>${ieT(r)}</option>`).join('')}</select></label>`;
        if (f === 'caneta') h += ieChk('Adicionar/excluir automaticamente', 'auto', 'caneta') + ieChk('Elástico', 'elastico', 'caneta') +
            `<span class="ie-op-dica">${ieT('Clique: canto · arrastar: curva · Alt: converter · Ctrl: seleção direta · Enter/Esc termina · Ctrl+Enter: seleção')}</span>`;
        else h += ieChk('Magnética', 'magnetica', 'canetaLivre') + ieNum('Ajuste de curva', 'ajuste', 'canetaLivre', 0.5, 10, 0.5, ' px') + ieNum('Largura', 'largura', 'canetaLivre', 1, 64, 1, ' px');
        return h;
    }
    if (f === 'selCaminho' || f === 'selDireta' || f === 'pontoAdd' || f === 'pontoDel' || f === 'pontoConv')
        return `<span class="ie-op-dica">${ieT(f === 'selCaminho' ? 'Clique: o subdemarcador inteiro · Shift: somar · Alt+arrastar: duplicar · Delete: excluir' : f === 'selDireta' ? 'Pontos e alças · arrastar no vazio seleciona pontos · Alt na alça: quebrar · Delete: excluir pontos' : 'Clique no demarcador')}</span>` +
            `<i class="ie-op-sep"></i><button class="ie-btn ie-btn-mini" onclick="ieCmd('demSelecao')">${ieT('Fazer seleção...')}</button><button class="ie-btn ie-btn-mini" onclick="ieCmd('demPreencher')">${ieT('Preencher')}</button><button class="ie-btn ie-btn-mini" onclick="ieCmd('demTracar')">${ieT('Traçar')}</button>`;
    return '';
}

// ─────────────────────────── painel Demarcadores ───────────────────────────
ieJanRegistrar('demarcadores', 'Demarcadores', ['doc'], () => {
    const corpo = document.querySelector('[data-pn="demarcadores"]'), doc = IE.doc;
    if (!corpo) return;
    if (!doc) { corpo.innerHTML = `<div class="ie-vazio">${ieT('Sem documento')}</div>`; return; }
    const lista = ieDemDoc(doc);
    corpo.innerHTML = `<div class="ie-dem-lista">${lista.map(d => `<div class="ie-dem ${d.id === doc.demAtivo ? 'sel' : ''}" data-dem="${d.id}"><canvas width="40" height="30" data-demmini="${d.id}"></canvas><span ${d.trabalho ? 'style="font-style:italic"' : ''}>${ieEsc(d.nome)}</span></div>`).join('') || `<div class="ie-vazio">${ieT('Desenhe com a Caneta (P)')}</div>`}</div>
        <div class="ie-pn-rod">
            <button class="ie-ico-btn" data-c="demPreencher" title="${ieT('Preencher demarcador com a cor de frente')}">●</button>
            <button class="ie-ico-btn" data-c="demTracar" title="${ieT('Traçar demarcador com o pincel')}">○</button>
            <button class="ie-ico-btn" data-c="demSelecaoJa" title="${ieT('Carregar demarcador como seleção (Ctrl+Enter)')}">⬚</button>
            <button class="ie-ico-btn" data-c="demDaSelecao" title="${ieT('Criar demarcador de trabalho da seleção')}">⟲</button>
            <button class="ie-ico-btn" data-c="demMascara" title="${ieT('Adicionar máscara')}">◐</button>
            <button class="ie-ico-btn" data-c="demNovo" title="${ieT('Novo demarcador')}">＋</button>
            <button class="ie-ico-btn" data-c="demExcluir" title="${ieT('Excluir demarcador')}">🗑</button>
        </div>`;
    corpo.querySelectorAll('[data-demmini]').forEach(cv => {
        const d = lista.find(x => x.id === +cv.dataset.demmini), x = ieCtx(cv), k = Math.min(40 / doc.w, 30 / doc.h);
        x.fillStyle = '#8f8f8f'; x.fillRect(0, 0, 40, 30);
        const m = ieDemMascara(doc, d.subs);
        if (m) { x.globalCompositeOperation = 'destination-out'; x.drawImage(m, (40 - doc.w * k) / 2, (30 - doc.h * k) / 2, doc.w * k, doc.h * k); }
    });
    corpo.onclick = ev => {
        const b = ev.target.closest('[data-c]');
        if (b) { ieCmd(b.dataset.c); return; }
        const it = ev.target.closest('[data-dem]');
        if (it) { doc.demAtivo = doc.demAtivo === +it.dataset.dem && !ev.ctrlKey ? null : +it.dataset.dem; IE.canetaRef = null; if (ev.ctrlKey) { doc.demAtivo = +it.dataset.dem; ieDemSelecao(doc); } ieDemMudou(doc); }
    };
    corpo.ondblclick = ev => {
        const it = ev.target.closest('[data-dem]'), d = it && lista.find(x => x.id === +it.dataset.dem);
        if (d) ieDialogoTexto(d.trabalho ? 'Salvar demarcador' : 'Renomear demarcador', 'Nome', d.trabalho ? `${ieT('Demarcador')} ${lista.filter(x => !x.trabalho).length + 1}` : d.nome).then(n => { if (n) { d.nome = n; d.trabalho = false; ieDemMudou(doc); ieHist(ieT('Renomear demarcador')); } });
    };
});
if (typeof IE_JAN_INDISP !== 'undefined') { const i = IE_JAN_INDISP.findIndex(x => x[0] === 'Demarcadores'); if (i >= 0) IE_JAN_INDISP.splice(i, 1); }
