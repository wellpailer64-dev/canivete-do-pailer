// =========================================================
// Editor de Imagem — ferramenta "Diversos" no grupo das formas (U): setas, visto, erro, alerta, asterisco...
// Cada símbolo é um caminho SVG em 24×24 (s = traço, desenhado com espessura; senão preenchido, evenodd).
// Arrasta para desenhar (Shift: proporcional); vira camada de FORMA (vetor) com a cor de frente; botão direito abre a grade.
// =========================================================

const IE_DIVERSOS = {
    seta: ['Seta', 'M2 9h12V4l8 8-8 8v-5H2z'],
    setaEsq: ['Seta para a esquerda', 'M22 9H10V4l-8 8 8 8v-5h12z'],
    setaCima: ['Seta para cima', 'M9 22V10H4l8-8 8 8h-5v12z'],
    setaBaixo: ['Seta para baixo', 'M9 2v12H4l8 8 8-8h-5V2z'],
    setaDupla: ['Seta dupla', 'M1 12l6-7v4h10V5l6 7-6 7v-4H7v4z'],
    setaFina: ['Seta fina', 'M2 12h19M14 5l7 7-7 7', 1],
    setaCurva: ['Seta curva', 'M4 20V13a6 6 0 0 1 6-6h9M14 2l5 5-5 5', 1],
    setaVolta: ['Seta de retorno', 'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12h-4', 1],
    setaCircular: ['Seta circular', 'M20 12a8 8 0 1 1-2.6-5.9M20 3v6h-6', 1],
    chevron: ['Chevron', 'M5 2h7l8 10-8 10H5l8-10z'],
    chevronDuplo: ['Chevron duplo', 'M1 3h5l8 9-8 9H1l8-9zM10 3h5l8 9-8 9h-5l8-9z'],
    setaBloco: ['Seta em bloco', 'M3 4h10l8 8-8 8H3l8-8z'],
    setaDiag: ['Seta diagonal', 'M5 19 19 5M9 5h10v10', 1],
    setaCruz: ['Setas em cruz', 'M12 1l4 4h-3v6h6V8l4 4-4 4v-3h-6v6h3l-4 4-4-4h3v-6H5v3l-4-4 4-4v3h6V5H8z'],
    setaCimaBaixo: ['Seta para cima e para baixo', 'M12 1l6 6h-4v10h4l-6 6-6-6h4V7H6z'],
    setaTroca: ['Setas de troca', 'M3 8h15M14 4l4 4-4 4M21 16H6M10 12l-4 4 4 4', 1],
    setaCanto: ['Seta de canto', 'M5 3v11h13M14 10l4 4-4 4', 1],
    setaEntalhe: ['Seta com entalhe', 'M1 8h13V3l9 9-9 9v-5H1l4-4z'],
    setaPlay: ['Ponta de seta', 'M5 2l16 10L5 22z'],
    setaMenor: ['Sinal de menor', 'M16 3 7 12l9 9', 1],
    setaMaior: ['Sinal de maior', 'M8 3l9 9-9 9', 1],
    setaCircCirc: ['Seta no círculo', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM12 6l6 6-6 6v-4H6v-4h6z'],
    setaUturn: ['Seta de retorno larga', 'M3 9l7-7v4h4a8 8 0 0 1 0 16h-3v-4h3a4 4 0 0 0 0-8h-4v4z'],
    setaExpandir: ['Expandir', 'M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7', 1],
    setaRecolher: ['Recolher', 'M4 14h6v6M10 14l-7 7M20 10h-6V4M14 10l7-7', 1],
    setaZigue: ['Seta em zigue-zague', 'M2 18l6-6 4 4 7-7M14 4h6v6', 1],
    setaOnda: ['Seta ondulada', 'M2 12c3-6 5-6 8 0s5 6 8 0M15 7l5 5-5 5', 1],
    setaSubir: ['Tendência de alta', 'M2 20h20M4 16l5-5 4 3 7-8M15 6h5v5', 1],
    setaDesce: ['Seta de descida curva', 'M5 3v8a6 6 0 0 0 6 6h8M15 13l4 4-4 4', 1],
    setaRefaz: ['Seta de refazer', 'M15 4l5 5-5 5M20 9H10a6 6 0 0 0 0 12h4', 1],
    setaCirc2: ['Setas de atualizar', 'M4 12a8 8 0 0 1 14-5.3M20 3v5h-5M20 12a8 8 0 0 1-14 5.3M4 21v-5h5', 1],
    visto: ['Visto', 'M4 12.5 9.5 18 20 6', 1],
    vistoCirc: ['Visto no círculo', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm5.3 6.3 1.4 1.4-8.2 8.2-4.7-4.7 1.4-1.4 3.3 3.3z'],
    erro: ['Erro (X)', 'M5 5l14 14M19 5 5 19', 1],
    erroCirc: ['Erro no círculo', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM8.2 6.8 12 10.6l3.8-3.8 1.4 1.4-3.8 3.8 3.8 3.8-1.4 1.4-3.8-3.8-3.8 3.8-1.4-1.4 3.8-3.8-3.8-3.8z'],
    alerta: ['Alerta', 'M12 1.5 23 21.5H1zM11 9v6h2V9zm0 8v2h2v-2z'],
    exclamCirc: ['Exclamação no círculo', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM11 5.5h2v8h-2zm0 10h2v2.5h-2z'],
    sino: ['Alarme (sino)', 'M12 2a1.5 1.5 0 0 0-1.5 1.6A6.5 6.5 0 0 0 5.5 10v5L3 18v1h18v-1l-2.5-3v-5a6.5 6.5 0 0 0-5-6.4A1.5 1.5 0 0 0 12 2zM9.5 20a2.5 2.5 0 0 0 5 0z'],
    relogio: ['Relógio', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 2a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM11 5.5V12.4l4.6 4.6 1.4-1.4-4-4V5.5z'],
    asterisco: ['Asterisco', 'M10.6 1h2.8v8.6l7.5-4.3 1.4 2.4L14.8 12l7.5 4.3-1.4 2.4-7.5-4.3V23h-2.8v-8.6l-7.5 4.3-1.4-2.4L9.2 12 1.7 7.7l1.4-2.4 7.5 4.3z'],
    info: ['Informação', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM11 10h2v8h-2zm0-4h2v2.5h-2z'],
    pergunta: ['Pergunta', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM8.5 9a3.5 3.5 0 1 1 5 3.2c-.9.4-1.5 1-1.5 1.8v.5h-2V14c0-1.7 1-2.8 2.3-3.4A1.5 1.5 0 1 0 10.5 9zM11 16.5h2V19h-2z'],
    mais: ['Mais', 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z'],
    menos: ['Menos', 'M3 10h18v4H3z'],
    proibido: ['Proibido', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 3a8 8 0 0 1 4.9 1.7L5.7 16.9A8 8 0 0 1 12 4zm6.3 3.1A8 8 0 0 1 7.1 18.3z'],
    estrela: ['Estrela', 'M12 1.5l3.2 6.9 7.3.8-5.5 5 1.6 7.3L12 17.8l-6.6 3.7L7 14.2l-5.5-5 7.3-.8z'],
    coracao: ['Coração', 'M12 21 3.2 12.4A5.3 5.3 0 0 1 12 5.6a5.3 5.3 0 0 1 8.8 6.8z'],
    raio: ['Raio', 'M14 1 4 14h7l-2 9 11-14h-7z'],
    pin: ['Marcador de local', 'M12 1a8 8 0 0 0-8 8c0 6 8 14 8 14s8-8 8-14a8 8 0 0 0-8-8zm0 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z'],
};
const IE_DIV_P = {};
function ieDivDesenhar(x, k, w, h, cor, contorno) {
    const s = IE_DIVERSOS[k]; if (!s) return;
    const p = IE_DIV_P[k] || (IE_DIV_P[k] = new Path2D(s[1]));
    x.save();
    if (s[2]) {   // traço: deixa margem para a espessura não sair da caixa
        const e = 2.6, m = e / 2;
        x.translate(m * w / 24, m * h / 24); x.scale((w - e * w / 24) / 24, (h - e * h / 24) / 24);
        x.lineWidth = e; x.lineCap = 'round'; x.lineJoin = 'round';
        if (contorno) { x.strokeStyle = contorno; x.lineWidth = Math.max(e, 1.5 * 24 / Math.max(w, 1)); } else x.strokeStyle = cor;
        x.stroke(p);
    } else {
        x.scale(w / 24, h / 24);
        if (contorno) { x.strokeStyle = contorno; x.lineWidth = 1.5 * 24 / Math.max(w, 1); x.stroke(p); }
        else { x.fillStyle = cor; x.fill(p, 'evenodd'); }
    }
    x.restore();
}

// ── símbolo → subdemarcadores da camada de forma (vetor: fica nítido, troca de cor com duplo clique) ──
// caminho SVG → contornos de cúbicas em 24×24; traço vira união de cápsulas (retângulo por trecho + círculo nas juntas)
function ieDivContornos(d) {
    const tk = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e-?\d+)?/g) || [];
    const out = []; let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cur = null;
    const num = () => parseFloat(tk[i++]);
    const seg = (a, b, c, e) => { if (!cur) { cur = { segs: [] }; out.push(cur); } cur.segs.push([a, b, c, e]); };
    const lin = (nx, ny) => { seg([x, y], [x, y], [nx, ny], [nx, ny]); x = nx; y = ny; };
    while (i < tk.length) {
        if (/[a-zA-Z]/.test(tk[i])) cmd = tk[i++];
        const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
        if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; cur = null; cmd = rel ? 'l' : 'L'; }
        else if (C === 'L') { const nx = ox + num(); lin(nx, oy + num()); }
        else if (C === 'H') lin(ox + num(), y);
        else if (C === 'V') lin(x, oy + num());
        else if (C === 'C' || C === 'S') {   // S: primeiro controle = reflexo do último
            const u = cur && cur.segs.length ? cur.segs[cur.segs.length - 1][2] : [x, y];
            const a = C === 'S' ? [2 * x - u[0], 2 * y - u[1]] : [ox + num(), oy + num()], b = [ox + num(), oy + num()], e = [ox + num(), oy + num()]; seg([x, y], a, b, e); [x, y] = e;
        }
        else if (C === 'A') {
            const rx0 = num(), ry0 = num(); num(); const fa = num(), fs = num(), ex = ox + num(), ey = oy + num();
            // arco circular (os símbolos não usam rotação) → cúbicas de até 90°
            const dx = (x - ex) / 2, dy = (y - ey) / 2, dd = Math.hypot(dx, dy);
            if (dd < 1e-6) continue;
            const r = Math.max(rx0, ry0, dd);
            const h = Math.sqrt(Math.max(0, r * r - dd * dd)) * (fa === fs ? -1 : 1);
            const mx = (x + ex) / 2, my = (y + ey) / 2, cx = mx + h * (y - ey) / (2 * dd), cy = my - h * (x - ex) / (2 * dd);
            const a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ey - cy, ex - cx);
            let da = a1 - a0;
            if (fs && da < 0) da += 2 * Math.PI;
            if (!fs && da > 0) da -= 2 * Math.PI;
            const n = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 2) - 1e-9)), st = da / n, k = 4 / 3 * Math.tan(st / 4);
            for (let j = 0; j < n; j++) {
                const t0 = a0 + j * st, t1 = t0 + st, p0 = [cx + r * Math.cos(t0), cy + r * Math.sin(t0)], p3 = [cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
                seg(p0, [p0[0] - k * r * Math.sin(t0), p0[1] + k * r * Math.cos(t0)], [p3[0] + k * r * Math.sin(t1), p3[1] - k * r * Math.cos(t1)], p3);
            }
            x = ex; y = ey;
        } else if (C === 'Z') { if (cur && Math.hypot(x - sx, y - sy) > 1e-6) lin(sx, sy); if (cur) cur.z = true; x = sx; y = sy; cur = null; }
        else i++;
    }
    return out;
}
function ieDivBez(P, t) { const u = 1 - t; return [0, 1].map(k => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]); }
function ieDivDentro(pt, poli) { let c = false; for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) { const a = poli[i], b = poli[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function ieDivSubs(k, r) {
    const s = IE_DIVERSOS[k]; if (!s) return null;
    const cont = ieDivContornos(s[1]), e = 2.6;
    const m = s[2] ? e / 2 : 0, sx = (r.w - 2 * m * r.w / 24) / 24, sy = (r.h - 2 * m * r.h / 24) / 24;
    const T = a => [r.x + m * r.w / 24 + a[0] * sx, r.y + m * r.h / 24 + a[1] * sy];
    const no = (p, i, o) => { const q = T(p); return { x: q[0], y: q[1], i: T(i), o: T(o) }; };
    const subs = [];
    if (!s[2]) {   // preenchido: contorno dentro de um número ímpar de anteriores = furo (como evenodd)
        const polis = cont.map(c => c.segs.flatMap(P => [0.25, 0.5, 0.75, 1].map(t => ieDivBez(P, t))));
        cont.forEach((c, ci) => {
            const n = c.segs.length, pt = ieDivBez(c.segs[0], 0.5);
            const prof = polis.slice(0, ci).filter(pl => ieDivDentro(pt, pl)).length;
            subs.push({ fechado: true, op: prof % 2 ? 'subtrair' : 'somar', pts: c.segs.map((P, j) => no(P[0], c.segs[(j - 1 + n) % n][2], P[1])) });
        });
        return subs;
    }
    const h = e / 2, K = 0.5523 * h;
    const circ = c => [[c[0], c[1] - h, [c[0] - K, c[1] - h], [c[0] + K, c[1] - h]], [c[0] + h, c[1], [c[0] + h, c[1] - K], [c[0] + h, c[1] + K]],
        [c[0], c[1] + h, [c[0] + K, c[1] + h], [c[0] - K, c[1] + h]], [c[0] - h, c[1], [c[0] - h, c[1] + K], [c[0] - h, c[1] - K]]];
    for (const c of cont) {
        const pts = [c.segs[0][0]];
        for (const P of c.segs) {
            const reto = P[1][0] === P[0][0] && P[1][1] === P[0][1] && P[2][0] === P[3][0] && P[2][1] === P[3][1];
            const n = reto ? 1 : 12;
            for (let j = 1; j <= n; j++) pts.push(ieDivBez(P, j / n));
        }
        for (let j = 0; j < pts.length; j++) {
            const a = pts[j];
            subs.push({ fechado: true, op: 'somar', pts: circ(a).map(([X, Y, I, O]) => no([X, Y], I, O)) });
            const b = pts[j + 1]; if (!b) continue;
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
            const nx = -(b[1] - a[1]) / L * h, ny = (b[0] - a[0]) / L * h;
            subs.push({ fechado: true, op: 'somar', pts: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]].map(q => no(q, q, q)) });
        }
    }
    return subs;
}

IE.op.diversos = { sim: 'seta' };
IE_ICONES.fDiv = '<path d="M3 12h10M9 7l5 5-5 5"/><path d="m16 8 2.5 2.5L22 6" stroke-width="1.6"/>';

IE_FERR.formaDiv = {
    nome: 'Diversos (setas e símbolos)', tecla: 'U', icone: 'fDiv', cursor: 'crosshair',
    down(p) { IE.arr = { p0: { x: Math.round(p.x), y: Math.round(p.y) } }; },
    move(p, ev) { const a = IE.arr; if (!a) return; a.r = ieRetArrasto(a.p0, p, ev, ev.shiftKey); ieDesenharSobre(); },
    up(p, ev, doc) {
        const a = IE.arr; IE.arr = null; ieDesenharSobre();
        if (!a || !a.r || a.r.w < 2 || a.r.h < 2) return;
        const k = IE.op.diversos.sim, subs = ieDivSubs(k, a.r); if (!subs) return;
        const nome = ieT(IE_DIVERSOS[k][0]);
        const L = ieNovaCamada(doc, { tipo: 'forma', nome: ieNomeLivre(doc, nome), vet: { subs, cor: IE.cor[0] }, sujoPx: true });
        ieInserirAcima(doc, L, doc.selIds.length ? ieAtiva(doc) : null);
        ieFormaRender(L, doc);
        doc.ativa = L.id; doc.selIds = [L.id];
        ieHist(nome); ieUiCamadas?.();
    },
    // botão direito na imagem: abre a grade de símbolos ali mesmo
    rightDown(p, ev) { ieDivGrade(null, ev.clientX, ev.clientY); },
    sobre(ctx, doc) {
        const a = IE.arr; if (!a || !a.r) return;
        const s = ieDocTela(a.r.x, a.r.y, doc);
        ctx.save(); ctx.translate(s.x, s.y);
        ieDivDesenhar(ctx, IE.op.diversos.sim, a.r.w * doc.zoom, a.r.h * doc.zoom, null, '#4aa3ff');
        ctx.restore();
    },
};

// entra no fim do grupo das formas
{
    const g = IE_FERR_GRUPOS.find(x => Array.isArray(x) && x[0] === 'forma');
    if (g && !g.includes('formaDiv')) g.push('formaDiv');
    if (!IE_FERR_ORDEM.includes('formaDiv')) IE_FERR_ORDEM.splice(IE_FERR_ORDEM.indexOf('forma') + 1, 0, 'formaDiv');
}

// barra de opções: botão com o símbolo atual que abre a grade de símbolos
function ieDivIcone(k, t = 20) {
    const s = IE_DIVERSOS[k];
    return `<svg viewBox="-1.5 -1.5 27 27" width="${t}" height="${t}">${s[2] ? `<path d="${s[1]}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${s[1]}" fill="currentColor" fill-rule="evenodd"/>`}</svg>`;
}
function ieDivGrade(btn, px, py) {
    document.querySelector('.ie-div-pop')?.remove();
    const pop = document.createElement('div');
    pop.className = 'ie-div-pop';
    const b = btn ? btn.getBoundingClientRect() : { left: px, bottom: py };
    pop.style.cssText = `position:fixed;left:${b.left}px;top:${b.bottom + 4}px;z-index:9999;display:grid;grid-template-columns:repeat(10,34px);gap:3px;padding:6px;background:#1e1e1e;border:1px solid #444;border-radius:8px;box-shadow:0 6px 20px #0008`;
    pop.innerHTML = Object.keys(IE_DIVERSOS).map(k => `<button data-k="${k}" title="${ieEsc(ieT(IE_DIVERSOS[k][0]))}" style="width:34px;height:34px;display:grid;place-items:center;border-radius:6px;border:1px solid ${k === IE.op.diversos.sim ? 'var(--primary)' : 'transparent'};background:#2a2a2a;color:#ddd;cursor:pointer">${ieDivIcone(k)}</button>`).join('');
    pop.onclick = ev => { const k = ev.target.closest('[data-k]')?.dataset.k; if (!k) return; IE.op.diversos.sim = k; pop.remove(); ieOpcoesRender(); };
    document.body.appendChild(pop);
    const q = pop.getBoundingClientRect();   // não sair da tela
    if (q.right > innerWidth) pop.style.left = Math.max(4, innerWidth - q.width - 4) + 'px';
    if (q.bottom > innerHeight) pop.style.top = Math.max(4, innerHeight - q.height - 4) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function f(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', f, true); } }, true));
}
(window.IE_OPCOES_EXTRA = window.IE_OPCOES_EXTRA || []).push(f => {
    if (f !== 'formaDiv') return '';
    const k = IE.op.diversos.sim;
    return `<label class="ie-op-campo">${ieT('Símbolo')} <button class="ie-btn ie-btn-mini" style="display:inline-flex;align-items:center;gap:6px" onclick="ieDivGrade(this)">${ieDivIcone(k, 16)} ${ieEsc(ieT(IE_DIVERSOS[k][0]))} ▾</button></label>` +
        `<span class="ie-op-dica">${ieT('Botão direito na imagem: escolher símbolo · Shift: proporcional · duplo clique: cor')}</span>`;
});
