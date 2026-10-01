// =========================================================
// Pocket Editor — seleção e transformação direto no monitor (como no Premiere e no Photoshop)
// Clique seleciona o objeto de cima sob o cursor (texto, imagem, vídeo); clique no vazio desmarca.
// Caixa com 8 alças: arrastar escala a partir do ponto de ancoragem; por fora dos cantos, gira (Shift: de 15°
// em 15°). A mira ⊕ é o ponto de ancoragem: arrastar muda o ponto sem mover o objeto. Alt+arrastar duplica.
// Ponto de ancoragem (c.p.ax / c.p.ay, em pixels da mídia; sem valor = centro): é o ponto da mídia que fica na
// Posição e em volta do qual a escala e a rotação acontecem — ponto do quadro = Posição + R·S·(m − âncora).
// =========================================================

const VETF = { drag: null };
const VE_TF_ALCA = 5;       // meia alça (px de tela)
const VE_TF_GIRO = 22;      // faixa por fora dos cantos que gira (px de tela)

function veAnc(c, p = veProps(c), sz = veMediaSize(c)) {
    return [p.ax != null ? p.ax : sz.w / 2, p.ay != null ? p.ay : sz.h / 2];
}

// mídia → quadro e quadro → mídia
function veTfQuadro(c, p, mx, my, sz) {
    const [ax, ay] = veAnc(c, p, sz), k = p.sc / 100, r = p.rot * Math.PI / 180;
    const dx = (mx - ax) * k, dy = (my - ay) * k;
    return { x: p.x + dx * Math.cos(r) - dy * Math.sin(r), y: p.y + dx * Math.sin(r) + dy * Math.cos(r) };
}
function veTfLocal(c, p, fx, fy, sz) {
    const [ax, ay] = veAnc(c, p, sz), k = Math.max(1e-6, p.sc / 100), r = -p.rot * Math.PI / 180;
    const dx = fx - p.x, dy = fy - p.y;
    return { x: ax + (dx * Math.cos(r) - dy * Math.sin(r)) / k, y: ay + (dx * Math.sin(r) + dy * Math.cos(r)) / k };
}

// Posição para o CENTRO do objeto cair em (cx, cy) — botões de centralizar/ajustar respeitam a âncora
function vePosParaCentro(c, p, cx, cy) {
    const sz = veMediaSize(c), m = veTfQuadro(c, { ...p, x: 0, y: 0 }, sz.w / 2, sz.h / 2, sz);
    return { x: Math.round((cx - m.x) * 100) / 100, y: Math.round((cy - m.y) * 100) / 100 };
}

function veTfVisivel(c, t = VE.playhead) {
    return c && !veIsAudio(c) && !veIsAdj(c) && !veOculto(c) && t >= c.st - VE_EPS && t < veEnd(c) - VE_EPS;
}

// Objeto de cima sob o ponto do quadro (-1 = nenhum); filtro opcional
function veTfClipeEm(pt, filtro) {
    const vis = VE.clips.map((c, i) => ({ c, i })).filter(({ c }) => veTfVisivel(c) && (!filtro || filtro(c)))
        .sort((a, b) => b.c.tr - a.c.tr);
    for (const { c, i } of vis) {
        const sz = veMediaSize(c), l = veTfLocal(c, veProps(c), pt.x, pt.y, sz);
        if (l.x >= 0 && l.y >= 0 && l.x <= sz.w && l.y <= sz.h) return i;
    }
    return -1;
}

// Alças do selecionado: 8 pontos (mídia) + a âncora
const VE_TF_PONTOS = [[0, 0, 'nw'], [0.5, 0, 'n'], [1, 0, 'ne'], [1, 0.5, 'e'], [1, 1, 'se'], [0.5, 1, 's'], [0, 1, 'sw'], [0, 0.5, 'w']];

// O que está sob o ponteiro no selecionado: {tipo: 'anc' | 'alca' | 'giro', ...} ou null
function veTfAlvo(pt, q) {
    const c = VE.clips[VE.sel];
    if (!veTfVisivel(c) || veLocked(c)) return null;
    const p = veProps(c), sz = veMediaSize(c), px = 1 / q.s;   // 1 px de tela em px do quadro
    if (Math.hypot(pt.x - p.x, pt.y - p.y) <= 9 * px) return { tipo: 'anc' };
    for (const [u, v, nome] of VE_TF_PONTOS) {
        const a = veTfQuadro(c, p, u * sz.w, v * sz.h, sz);
        if (Math.abs(pt.x - a.x) <= (VE_TF_ALCA + 3) * px && Math.abs(pt.y - a.y) <= (VE_TF_ALCA + 3) * px) return { tipo: 'alca', u, v, nome };
    }
    // girar: perto de um canto, do lado de fora da caixa
    const l = veTfLocal(c, p, pt.x, pt.y, sz), k = p.sc / 100;
    const fora = l.x < 0 || l.y < 0 || l.x > sz.w || l.y > sz.h;
    if (fora) for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const a = veTfQuadro(c, p, u * sz.w, v * sz.h, sz);
        if (Math.hypot(pt.x - a.x, pt.y - a.y) <= VE_TF_GIRO * px && k > 0) return { tipo: 'giro' };
    }
    return null;
}

// Cursor de girar (seta curva)
const VE_TF_CURSOR_GIRO = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 1 3 5.7" fill="none" stroke="black" stroke-width="4"/><path d="M5 12a7 7 0 1 1 3 5.7" fill="none" stroke="white" stroke-width="2"/><path d="M2 9l3 4 4-3" fill="none" stroke="black" stroke-width="4"/><path d="M2 9l3 4 4-3" fill="none" stroke="white" stroke-width="2"/></svg>')}") 12 12, crosshair`;
function veTfCursor(alvo, c) {
    if (!alvo) return '';
    if (alvo.tipo === 'anc') return 'crosshair';
    if (alvo.tipo === 'giro') return VE_TF_CURSOR_GIRO;
    // cursor de redimensionar girando junto com o objeto
    const ang = (Math.atan2(alvo.v - 0.5, alvo.u - 0.5) * 180 / Math.PI + veProps(c).rot + 360) % 180;
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(ang / 45) % 4];
}

// ── desenho: caixa, alças e ponto de ancoragem do selecionado (em px do canvas) ──
function veTfDesenhar(ctx, cv, pv) {
    if (typeof veScCaptura === 'function') veScCaptura(cv);   // escopos: o quadro antes das alças
    const c = VE.clips[VE.sel];
    if (!veTfVisivel(c) || (VEPP.edit && VEPP.edit.c === c)) return;
    const p = veProps(c), sz = veMediaSize(c);
    const q = veTxQuadroTela(), tela = pv / q.s;   // px do canvas por px de tela
    const P = (u, v) => { const a = veTfQuadro(c, p, u * sz.w, v * sz.h, sz); return [a.x * pv, a.y * pv]; };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 1.5 * tela;
    ctx.strokeStyle = 'rgba(249,115,22,0.95)';
    ctx.beginPath();
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], j) => { const [x, y] = P(u, v); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.stroke();
    if (!veLocked(c)) {
        const h = VE_TF_ALCA * tela;
        VE_TF_PONTOS.forEach(([u, v]) => {
            const [x, y] = P(u, v);
            ctx.fillStyle = '#fff';
            ctx.fillRect(x - h, y - h, h * 2, h * 2);
            ctx.strokeRect(x - h, y - h, h * 2, h * 2);
        });
        // ponto de ancoragem: círculo com cruz (como no Premiere)
        const ax = p.x * pv, ay = p.y * pv, r = 7 * tela;
        ctx.lineWidth = 3 * tela;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.moveTo(ax - r * 1.6, ay); ctx.lineTo(ax + r * 1.6, ay); ctx.moveTo(ax, ay - r * 1.6); ctx.lineTo(ax, ay + r * 1.6); ctx.stroke();
        ctx.lineWidth = 1.5 * tela;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
    }
    ctx.restore();
}

// ── interação no monitor (ferramenta Seleção) ──
function veTfIniciar() {
    const scr = $ve('ve-screen');
    if (!scr) return;
    scr.addEventListener('pointerdown', e => {
        if (VE.tool !== 'select' || e.button !== 0 || !VE.ready || e.target.closest('button, textarea, .ve-mzoom')) return;
        const q = veTxQuadroTela(), pt = { x: (e.clientX - q.x0) / q.s, y: (e.clientY - q.y0) / q.s };
        let alvo = veTfAlvo(pt, q), i = VE.sel;
        // legenda (desenhada por cima de tudo): arrastar muda a posição da legenda selecionada
        const lg = alvo ? -1 : veTxLegendaNoPonto(pt);
        if (lg >= 0) {
            e.stopImmediatePropagation();
            e.preventDefault();
            VEM.panned = true;
            if (VE.playing) veStop();
            if (VE.sel !== -1 || VETX.legSel !== lg) { VE.sel = -1; VETX.legSel = lg; veRefresh(); }
            const est = veTxEstiloLegenda(lg);
            VETF.drag = { tipo: 'leg', x0: e.clientX, y0: e.clientY, pt0: pt, px0: +est.px || 0, py0: +est.py || 0, hist: false, ativo: false, id: e.pointerId };
            scr.setPointerCapture(e.pointerId);
            return;
        }
        if (!alvo) {
            i = veTfClipeEm(pt, c => !veLocked(c));
            if (i < 0) {
                // vazio: desmarca (com zoom, o arraste move a visão — fica com o monitor)
                if (VE.sel >= 0 || VETX.legSel >= 0) { VE.sel = -1; VETX.legSel = -1; veRefresh(); }
                return;
            }
            alvo = { tipo: 'mover' };
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        VEM.panned = true;
        if (VE.playing) veStop();
        if (i !== VE.sel || VETX.legSel >= 0) { VE.sel = i; VETX.legSel = -1; veRefresh(); }
        const c = VE.clips[i], p = veProps(c);
        VETF.drag = { ...alvo, i, x0: e.clientX, y0: e.clientY, pt0: pt, p0: { ...p }, hist: false, ativo: false, fm0: c.fm ? { ...c.fm } : null,
                      clonar: e.altKey && alvo.tipo === 'mover', id: e.pointerId };
        scr.setPointerCapture(e.pointerId);
    }, true);

    scr.addEventListener('pointermove', e => {
        const d = VETF.drag;
        if (!d) {
            // cursor conforme o que está sob o ponteiro
            if (VE.tool !== 'select' || !VE.ready || VEM.pan) return;
            const q = veTxQuadroTela(), pt = { x: (e.clientX - q.x0) / q.s, y: (e.clientY - q.y0) / q.s };
            const alvo = veTfAlvo(pt, q);
            const cur = alvo ? veTfCursor(alvo, VE.clips[VE.sel]) : veTxLegendaNoPonto(pt) >= 0 || veTfClipeEm(pt, c => !veLocked(c)) >= 0 ? 'move' : '';
            if (scr.style.cursor !== cur) scr.style.cursor = cur;
            return;
        }
        e.stopImmediatePropagation();
        if (!d.ativo) {
            if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 3) return;
            d.ativo = true;
            if (d.clonar) {
                VE.sel = d.i;
                if (!veDuplicarAcima()) { VETF.drag = null; return; }
                d.i = VE.sel;
                d.hist = true;
            }
        }
        if (d.tipo === 'leg') {
            if (!d.hist) { vePushHistory(); d.hist = true; }
            const q = veTxQuadroTela(), pt = { x: (e.clientX - q.x0) / q.s, y: (e.clientY - q.y0) / q.s };
            let px = Math.round((d.px0 + (pt.x - d.pt0.x) / VE.seqW * 100) * 10) / 10;
            const py = Math.round((d.py0 - (pt.y - d.pt0.y) / VE.seqH * 100) * 10) / 10;
            if (Math.abs(px) < 1 && !e.shiftKey) px = 0;   // gruda no centro
            veTxSetEstiloLegenda(VETX.legSel, { px, py });
            vePpRender();
            veDrawMonitorSoon();
            return;
        }
        const c = VE.clips[d.i];
        if (!c) return;
        if (!d.hist) { vePushHistory(); d.hist = true; }
        const q = veTxQuadroTela(), pt = { x: (e.clientX - q.x0) / q.s, y: (e.clientY - q.y0) / q.s };
        const p0 = d.p0, sz = veMediaSize(c);
        if (d.tipo === 'mover') {
            // encaixa nas guias e nas bordas/centro do quadro (editor-guias.js); Ctrl segurado: livre
            const s = veGuiasEncaixarCamada(c, p0, Math.round(p0.x + pt.x - d.pt0.x), Math.round(p0.y + pt.y - d.pt0.y), q.s, e.ctrlKey);
            veApplyProps(c, s);
            veGuiasRedesenhar();
        } else if (d.tipo === 'alca' && e.shiftKey && d.fm0 && c.fm) {
            // Forma + Shift: estica só o lado puxado (largura e/ou altura da forma), o lado oposto fica parado
            const w0 = d.fm0.w, h0 = d.fm0.h, sz0 = { w: w0, h: h0 };
            const l = veTfLocal(c, p0, pt.x, pt.y, sz0);
            const w = d.u === 0.5 ? w0 : Math.max(2, Math.round(d.u === 1 ? l.x : w0 - l.x));
            const h = d.v === 0.5 ? h0 : Math.max(2, Math.round(d.v === 1 ? l.y : h0 - l.y));
            const esq = d.u === 0 ? w0 - w : 0, topo = d.v === 0 ? h0 - h : 0;   // novo canto sup. esq. (px da forma antiga)
            const [ax0, ay0] = veAnc(c, p0, sz0), ax = ax0 / w0 * w, ay = ay0 / h0 * h;   // âncora na mesma proporção
            const m = veTfQuadro(c, p0, esq + ax, topo + ay, sz0);
            c.fm = { ...c.fm, w, h };
            if (p0.ax != null || p0.ay != null) c.p = { ...veStaticProps(c), ax, ay };
            veApplyProps(c, { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 });
            VEPP.chave = '';
        } else if (d.tipo === 'alca') {
            // escala uniforme a partir da âncora: projeção do ponteiro na direção da alça
            const [ax, ay] = veAnc(c, p0, sz);
            const hx = d.u * sz.w - ax, hy = d.v * sz.h - ay, n2 = hx * hx + hy * hy;
            if (n2 < 1) return;
            const l = veTfLocal(c, { ...p0, sc: 100 }, pt.x, pt.y, sz);
            const sc = Math.max(1, Math.min(2000, ((l.x - ax) * hx + (l.y - ay) * hy) / n2 * 100));
            veApplyProps(c, { sc: Math.round(sc * 10) / 10 });
        } else if (d.tipo === 'giro') {
            const a0 = Math.atan2(d.pt0.y - p0.y, d.pt0.x - p0.x), a1 = Math.atan2(pt.y - p0.y, pt.x - p0.x);
            let rot = p0.rot + (a1 - a0) * 180 / Math.PI;
            rot = e.shiftKey ? Math.round(rot / 15) * 15 : Math.round(rot * 10) / 10;
            veApplyProps(c, { rot });
        } else if (d.tipo === 'anc') {
            // a âncora vai para o ponto e a Posição acompanha: o objeto fica parado (como no Premiere/Photoshop)
            const l = veTfLocal(c, p0, pt.x, pt.y, sz);
            c.p = { ...veStaticProps(c), ax: Math.round(l.x * 10) / 10, ay: Math.round(l.y * 10) / 10 };
            const m = veTfQuadro(c, p0, l.x, l.y, sz);
            veApplyProps(c, { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 });
        }
        if (VEPP.edit) veTxEditarPos();
        veRenderProps();
        veDrawMonitorSoon();
        if (veHasKf(c)) veDraw();
    }, true);

    const fim = e => {
        const d = VETF.drag;
        if (!d) return;
        VETF.drag = null;
        veGuiasEncaixeFim();
        e.stopImmediatePropagation();
        setTimeout(() => { VEM.panned = false; }, 0);
        if (d.ativo) veRefresh();
    };
    scr.addEventListener('pointerup', fim, true);
    scr.addEventListener('pointercancel', fim, true);
}

// ── Propriedades: grade de referência 3×3 (Photoshop) — muda a âncora sem mover o objeto ──
function veTfAncoraEm(u, v) {
    const c = VE.clips[VE.sel];
    if (!c) return;
    const p = veProps(c), sz = veMediaSize(c);
    vePushHistory();
    const m = veTfQuadro(c, p, u * sz.w, v * sz.h, sz);
    c.p = { ...veStaticProps(c), ax: u * sz.w, ay: v * sz.h };
    if (u === 0.5 && v === 0.5) { delete c.p.ax; delete c.p.ay; }   // centro = padrão (acompanha o tamanho)
    veApplyProps(c, { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 });
    veRefresh();
}

document.addEventListener('DOMContentLoaded', veTfIniciar);
