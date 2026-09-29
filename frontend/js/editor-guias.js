// =========================================================
// Pocket Editor — guias do monitor Programa (como no Photoshop, After Effects e Premiere)
// Arraste a partir da régua de cima (guia horizontal) ou da esquerda (vertical). Arraste uma guia para mover;
// solte-a de volta na régua (ou fora do monitor) para apagar. As guias ficam em pixels do quadro, por timeline,
// não aparecem na exportação e atraem as camadas ao arrastar no monitor (Ctrl segurado: sem encaixe).
// Criando/movendo, a guia encaixa nas bordas e no centro do quadro.
// =========================================================

const VEG = {
    show: veLsGet('ve.guias.show') !== '0',
    lock: veLsGet('ve.guias.lock') === '1',
    snap: veLsGet('ve.guias.snap') !== '0',
    drag: null,         // {o: 'h'|'v', i: índice (-1 = nova), p}
    mouse: null,        // ponteiro sobre o palco (px do palco), para a marca nas réguas
    snapLinhas: null,   // [{o, p}] linhas em que a camada encaixou (desenhadas enquanto arrasta)
};
const VE_GUIA_TOL = 5;      // px de tela para pegar uma guia
const VE_GUIA_ENCAIXE = 7;  // px de tela para encaixar

function veGuias() { return VE.guias || (VE.guias = []); }

// Geometria do quadro no palco: k = px de tela por px do quadro; x0/y0 = canto do quadro; sr = área do monitor
function veGuiasGeo() {
    const scr = $ve('ve-screen'), stage = $ve('ve-stage');
    if (!scr || !stage || !VE.ready || !VE.seqW || !VE.seqH || !scr.clientWidth) return null;
    const k = veFitScale() * VEM.mz;
    const fw = VE.seqW * k, fh = VE.seqH * k;
    const sr = { x: scr.offsetLeft, y: scr.offsetTop, w: scr.clientWidth, h: scr.clientHeight };
    return { k, x0: sr.x + (sr.w - fw) / 2 + VEM.mx, y0: sr.y + (sr.h - fh) / 2 + VEM.my, sr };
}

function veGuiasPrefs() {
    veLsSet('ve.guias.show', VEG.show ? '1' : '0');
    veLsSet('ve.guias.lock', VEG.lock ? '1' : '0');
    veLsSet('ve.guias.snap', VEG.snap ? '1' : '0');
}

function veGuiasRedesenhar() {
    VEG._rev = (VEG._rev || 0) + 1;
    if (VEG._raf) return;
    VEG._raf = true;
    veRaf($ve('ve-rulers'), () => { VEG._raf = false; veRulersDraw(); });
}

function veGuiasMostrar() {
    VEG.show = !VEG.show;
    veGuiasPrefs();
    veGuiasRedesenhar();
    veToast(VEG.show ? 'Guias visíveis' : 'Guias ocultas');
}
function veGuiasTravar() {
    VEG.lock = !VEG.lock;
    veGuiasPrefs();
    veToast(VEG.lock ? 'Guias travadas' : 'Guias destravadas');
}
function veGuiasEncaixe() {
    VEG.snap = !VEG.snap;
    veGuiasPrefs();
    veToast(VEG.snap ? 'Encaixe nas guias ligado' : 'Encaixe nas guias desligado');
}
function veGuiasLimpar() {
    if (!veGuias().length) return;
    VE.guias = [];
    veGuiasMudou();
    veToast('Guias apagadas');
}
function veGuiasMudou() {
    if (!VE.dirty && VE.ready) { VE.dirty = true; veUpdateTitle(); }
    veGuiasRedesenhar();
}

// ── desenho (no canvas das réguas, que cobre o palco inteiro; fora do quadro exportado) ──
function veGuiasDesenhar(ctx, g, w, h) {
    const lista = VEG.show ? veGuias() : [];
    const drag = VEG.drag;
    const sr = g.sr;
    const linha = (o, p, cor, tracejado) => {
        ctx.strokeStyle = cor;
        ctx.setLineDash(tracejado ? [4, 3] : []);
        ctx.beginPath();
        if (o === 'h') {
            const y = Math.round(g.y0 + p * g.k) + 0.5;
            if (y < sr.y || y > sr.y + sr.h) return;
            ctx.moveTo(sr.x, y); ctx.lineTo(sr.x + sr.w, y);
        } else {
            const x = Math.round(g.x0 + p * g.k) + 0.5;
            if (x < sr.x || x > sr.x + sr.w) return;
            ctx.moveTo(x, sr.y); ctx.lineTo(x, sr.y + sr.h);
        }
        ctx.stroke();
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(sr.x, sr.y, sr.w, sr.h);
    ctx.clip();
    ctx.lineWidth = 1;
    lista.forEach((gd, i) => { if (!drag || drag.i !== i) linha(gd.o, gd.p, 'rgba(0,229,255,0.85)'); });
    if (drag && drag.p != null) linha(drag.o, drag.p, drag.apagar ? 'rgba(248,113,113,0.9)' : 'rgba(0,229,255,1)', drag.apagar);
    (VEG.snapLinhas || []).forEach(s => linha(s.o, s.p, 'rgba(255,64,200,0.95)'));
    // valor da guia sendo arrastada
    if (drag && drag.p != null && !drag.apagar) {
        const txt = (drag.o === 'h' ? 'Y ' : 'X ') + Math.round(drag.p) + ' px';
        ctx.font = '600 11px Segoe UI, sans-serif';
        const tw = ctx.measureText(txt).width + 10;
        let bx, by;
        if (drag.o === 'h') { bx = sr.x + 8; by = g.y0 + drag.p * g.k - 22; }
        else { bx = g.x0 + drag.p * g.k + 8; by = sr.y + 8; }
        bx = Math.max(sr.x + 2, Math.min(sr.x + sr.w - tw - 2, bx));
        by = Math.max(sr.y + 2, Math.min(sr.y + sr.h - 20, by));
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(bx, by, tw, 18);
        ctx.fillStyle = '#e0fbff';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, bx + 5, by + 9.5);
    }
    ctx.restore();
}

// Marcas nas réguas: posição do ponteiro e das guias
function veGuiasMarcasReguas(ctx, g, w, h, topH, leftW) {
    ctx.save();
    if (VEG.show) {
        ctx.fillStyle = 'rgba(0,229,255,0.7)';
        veGuias().forEach(gd => {
            if (gd.o === 'h') { const y = Math.round(g.y0 + gd.p * g.k); if (y >= topH) ctx.fillRect(leftW - 6, y - 1, 6, 2); }
            else { const x = Math.round(g.x0 + gd.p * g.k); if (x >= leftW) ctx.fillRect(x - 1, topH - 6, 2, 6); }
        });
    }
    const m = VEG.mouse;
    if (m) {
        ctx.fillStyle = 'rgba(249,115,22,0.95)';
        if (m.x >= leftW) ctx.fillRect(Math.round(m.x), 0, 1, topH);
        if (m.y >= topH) ctx.fillRect(0, Math.round(m.y), leftW, 1);
    }
    ctx.restore();
}

// ── encaixe ──
// Linhas de encaixe num eixo: guias + bordas e centro do quadro
function veGuiasAlvos(o) {
    const lim = o === 'h' ? VE.seqH : VE.seqW;
    const out = [0, lim / 2, lim];
    if (VEG.show) veGuias().forEach(gd => { if (gd.o === o) out.push(gd.p); });
    return out;
}

// Guia sendo criada/movida: encaixa nas bordas e no centro do quadro
function veGuiaEncaixar(o, p, k) {
    const lim = o === 'h' ? VE.seqH : VE.seqW, tol = VE_GUIA_ENCAIXE / k;
    for (const a of [0, lim / 2, lim]) if (Math.abs(p - a) <= tol) return a;
    return Math.round(p);
}

// Camada arrastada no monitor (editor-transform.js): devolve {x, y} encaixados e marca as linhas usadas.
// Encaixa a borda esquerda/centro/direita (e topo/centro/base) da caixa do objeto nas guias e no quadro.
function veGuiasEncaixarCamada(c, p, x, y, escala, semEncaixe) {
    VEG.snapLinhas = null;
    if (!VEG.snap || semEncaixe || !c) return { x, y };
    const sz = veMediaSize(c), q = { ...p, x, y };
    const cantos = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => veTfQuadro(c, q, u * sz.w, v * sz.h, sz));
    const xs = cantos.map(a => a.x), ys = cantos.map(a => a.y);
    const bx = [Math.min(...xs), (Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...xs)];
    const by = [Math.min(...ys), (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(...ys)];
    const tol = VE_GUIA_ENCAIXE / Math.max(1e-6, escala);
    const melhor = (bordas, alvos) => {
        let r = null;
        bordas.forEach(b => alvos.forEach(a => {
            const d = a - b;
            if (Math.abs(d) <= tol && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, a };
        }));
        return r;
    };
    const sx = melhor(bx, veGuiasAlvos('v')), sy = melhor(by, veGuiasAlvos('h'));
    const linhas = [];
    if (sx) { x = Math.round((x + sx.d) * 100) / 100; linhas.push({ o: 'v', p: sx.a }); }
    if (sy) { y = Math.round((y + sy.d) * 100) / 100; linhas.push({ o: 'h', p: sy.a }); }
    VEG.snapLinhas = linhas.length ? linhas : null;
    return { x, y };
}
function veGuiasEncaixeFim() {
    if (!VEG.snapLinhas) return;
    VEG.snapLinhas = null;
    veGuiasRedesenhar();
}

// ── interação ──
function veGuiaNoPonto(sx, sy, g) {
    if (!VEG.show || VEG.lock) return -1;
    let best = -1, bd = VE_GUIA_TOL + 1;
    veGuias().forEach((gd, i) => {
        const d = gd.o === 'h' ? Math.abs(g.y0 + gd.p * g.k - sy) : Math.abs(g.x0 + gd.p * g.k - sx);
        if (d < bd) { bd = d; best = i; }
    });
    return best;
}

function veGuiasIniciar() {
    const stage = $ve('ve-stage');
    if (!stage) return;
    const local = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    const comecar = (e, o, i) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (VE.playing) veStop();
        if (!VEG.show) { VEG.show = true; veGuiasPrefs(); }
        VEG.drag = { o, i, p: i >= 0 ? veGuias()[i].p : null, id: e.pointerId, apagar: false };
        stage.setPointerCapture(e.pointerId);
        veGuiasRedesenhar();
    };

    // réguas: arrastar cria guia
    stage.querySelectorAll('.ve-ruler-hit').forEach(el => el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !VE.ready || !VEM.rulers) return;
        comecar(e, el.dataset.o, -1);
    }));

    // monitor: arrastar uma guia existente (antes da seleção/transformação de camadas)
    stage.addEventListener('pointerdown', e => {
        if (VEG.drag || e.button !== 0 || !VE.ready || VE.tool !== 'select') return;
        if (e.target.closest('button, textarea, input, select, .ve-mzoom, .ve-ruler-hit')) return;
        const g = veGuiasGeo();
        if (!g) return;
        const pt = local(e), i = veGuiaNoPonto(pt.x, pt.y, g);
        if (i >= 0) comecar(e, veGuias()[i].o, i);
    }, true);

    stage.addEventListener('pointermove', e => {
        const pt = local(e), g = veGuiasGeo();
        if (VEM.rulers) { VEG.mouse = pt; veGuiasRedesenhar(); }
        const d = VEG.drag;
        if (!d) {
            // cursor sobre uma guia
            if (!g || VE.tool !== 'select' || VEM.pan || (typeof VETF !== 'undefined' && VETF.drag)) return;
            const i = veGuiaNoPonto(pt.x, pt.y, g);
            if (i >= 0) {
                e.stopImmediatePropagation();
                $ve('ve-screen').style.cursor = veGuias()[i].o === 'h' ? 'row-resize' : 'col-resize';
            }
            return;
        }
        e.stopImmediatePropagation();
        if (!g) return;
        const bruto = d.o === 'h' ? (pt.y - g.y0) / g.k : (pt.x - g.x0) / g.k;
        d.p = e.ctrlKey ? Math.round(bruto) : veGuiaEncaixar(d.o, bruto, g.k);
        // de volta na régua ou fora do monitor: apaga (ou desiste da nova)
        const sr = g.sr;
        d.apagar = pt.x < sr.x || pt.y < sr.y || pt.x > sr.x + sr.w || pt.y > sr.y + sr.h;
        stage.style.cursor = d.o === 'h' ? 'row-resize' : 'col-resize';
        veGuiasRedesenhar();
    }, true);

    const fim = e => {
        const d = VEG.drag;
        if (!d) return;
        VEG.drag = null;
        stage.style.cursor = '';
        e.stopImmediatePropagation();
        const lista = veGuias();
        if (d.apagar || d.p == null) {
            if (d.i >= 0) { lista.splice(d.i, 1); veGuiasMudou(); }
        } else if (d.i >= 0) {
            if (lista[d.i].p !== d.p) { lista[d.i].p = d.p; veGuiasMudou(); }
        } else {
            lista.push({ o: d.o, p: d.p });
            veGuiasMudou();
        }
        veGuiasRedesenhar();
    };
    stage.addEventListener('pointerup', fim, true);
    stage.addEventListener('pointercancel', fim, true);
    stage.addEventListener('pointerleave', () => { if (VEG.mouse) { VEG.mouse = null; veGuiasRedesenhar(); } });
}

document.addEventListener('DOMContentLoaded', veGuiasIniciar);
