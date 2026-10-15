// =========================================================
// Pocket Editor — Caneta de caminho (Shift+G): desenha um CAMINHO como camada de forma (t: 'cam'), não uma máscara.
// Pedido do Pailer (2026-10-14): criar linhas/curvas, regular cor, espessura e preenchimento e depois animar (Aparar
// caminho, tracejado, como nas formas). Clique = ponto reto; clique e arraste = ponto com curva (alças simétricas);
// Shift = trava o ângulo do novo ponto em 45°; clique no 1º ponto = fecha; Enter, Esc ou duplo clique = termina aberto.
// Pontos guardados como a máscara: [x, y, entradaX, entradaY, saídaX, saídaY] por ponto, alças relativas ao ponto, em
// px da forma (c.fm.pts); a forma tem o tamanho do caminho (+ espessura) e a Posição é o centro dela.
// O desenho (veGrPontos / veGrForma em editor-grafico.js) achata as curvas numa polilinha: Aparar e tracejado andam nela.
// =========================================================
const VECAMI = { ed: null };   // caminho em edição: { c, abs: [[x, y, ix, iy, ox, oy]...] em px do quadro, fech }
VEGR.caminho = { cCor: '#ffffff', cLarg: 6, pOn: false, cor: '#F97316', pontaR: true };
try { Object.assign(VEGR.caminho, JSON.parse(veLsGet('ve-caminho') || '{}')); } catch (e) { /* padrão */ }
const veCamSalvar = () => veLsSet('ve-caminho', JSON.stringify(VEGR.caminho));

// Bézier achatada (px da forma) — usada pelo desenho da forma 'cam'
function veCamPolilinha(pts, fech) {
    const n = Math.floor((pts || []).length / 6), out = [];
    if (!n) return out;
    const P = i => [pts[i * 6], pts[i * 6 + 1]];
    out.push(P(0));
    const seg = (a, b) => {
        const [x0, y0] = P(a), [x3, y3] = P(b);
        const x1 = x0 + pts[a * 6 + 4], y1 = y0 + pts[a * 6 + 5], x2 = x3 + pts[b * 6 + 2], y2 = y3 + pts[b * 6 + 3];
        const reto = !pts[a * 6 + 4] && !pts[a * 6 + 5] && !pts[b * 6 + 2] && !pts[b * 6 + 3];
        const k = reto ? 1 : Math.max(8, Math.min(64, Math.round(Math.hypot(x3 - x0, y3 - y0) / 6)));
        for (let j = 1; j <= k; j++) {
            const u = j / k, v = 1 - u;
            out.push([v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
                      v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3]);
        }
    };
    for (let i = 1; i < n; i++) seg(i - 1, i);
    if (fech && n > 2) seg(n - 1, 0);
    return out;
}

// Pontos em px do quadro → camada: caixa do caminho (com folga da espessura), pontos relativos a ela
function veCamAplicar() {
    const ed = VECAMI.ed; if (!ed) return;
    const flat = ed.abs.flat(), poli = veCamPolilinha(flat, ed.fech);
    const xs = poli.map(p => p[0]), ys = poli.map(p => p[1]);
    if (!xs.length) return;
    const pad = Math.max(4, (+VEGR.caminho.cLarg || 0) / 2 + 3);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
    const pts = [];
    ed.abs.forEach(p => pts.push(+(p[0] - x0).toFixed(2), +(p[1] - y0).toFixed(2), +p[2].toFixed(2), +p[3].toFixed(2), +p[4].toFixed(2), +p[5].toFixed(2)));
    const C = VEGR.caminho, c = ed.c;
    c.fm = { ...(c.fm || {}), t: 'cam', pts, fech: !!ed.fech, w: Math.max(2, Math.round(x1 - x0)), h: Math.max(2, Math.round(y1 - y0)),
             cOn: true, cCor: C.cCor, cLarg: C.cLarg, pOn: !!C.pOn && !!ed.fech, cor: C.cor, pontaR: !!C.pontaR };
    c.p = { ...(c.p || {}), sc: 100, rot: 0, op: c.p && c.p.op != null ? c.p.op : 100, x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    if (typeof VEGR !== 'undefined' && VEGR.cache) VEGR.cache.delete(c);
}

function veCamTerminar(fechar = false) {
    const ed = VECAMI.ed; if (!ed) return;
    VECAMI.ed = null;
    if (fechar && ed.abs.length > 2) ed.fech = true;
    if (ed.abs.length < 2) {   // um ponto só: não vira camada
        const i = VE.clips.indexOf(ed.c); if (i >= 0) VE.clips.splice(i, 1);
        VE.sel = -1;
    } else { VECAMI.ed = ed; veCamAplicar(); VECAMI.ed = null; VE.sel = VE.clips.indexOf(ed.c); }
    if (typeof VEPP !== 'undefined') VEPP.chave = '';
    veRelayout(); veRefresh(); veDrawMonitor();
}

function veCamAngulo(prev, x, y) {   // Shift: ângulo do novo ponto travado de 45° em 45° em relação ao anterior
    if (!prev) return [x, y];
    const dx = x - prev[0], dy = y - prev[1], a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
    return [prev[0] + Math.cos(a) * l, prev[1] + Math.sin(a) * l];
}

function veCamPointer(e) {
    if (VE.tool !== 'caminho' || e.button !== 0 || !VE.ready) return;
    if (e.target.closest('button, textarea, input, select, .ve-gr-opcoes, .ve-mzoom')) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (VE.playing) veStop();
    const scr = $ve('ve-screen'), win = scr.ownerDocument.defaultView, q = veTxQuadroTela();
    let [x, y] = (() => { const p = veTxPontoQuadro(e); return [p.x, p.y]; })();
    let ed = VECAMI.ed;
    if (ed && !VE.clips.includes(ed.c)) ed = VECAMI.ed = null;   // camada apagada no meio: começa outra
    if (ed && ed.abs.length > 1) {   // clique no 1º ponto: fecha
        const p0 = ed.abs[0];
        if (Math.hypot(p0[0] - x, p0[1] - y) * q.s < 10) { veCamTerminar(true); return; }
    }
    if (e.detail >= 2 && ed) { veCamTerminar(false); return; }   // duplo clique: termina aberto
    if (!ed) {
        vePushHistory();
        const st = veSnapFrame(VE.playhead), b = st + VE_IMG_DUR;
        const c = { tr: veGrTrilha(st, b), st, s: 0, e: VE_IMG_DUR, m: veGrMidia('forma', 'Forma').id, nome: 'Caminho',
                    fm: { t: 'cam', pts: [], w: 2, h: 2 }, p: { sc: 100, x, y, rot: 0, op: 100 } };
        VE.clips.push(c);
        ed = VECAMI.ed = { c, abs: [], fech: false };
    }
    if (e.shiftKey) [x, y] = veCamAngulo(ed.abs[ed.abs.length - 1], x, y);
    const pt = [x, y, 0, 0, 0, 0];
    ed.abs.push(pt);
    veCamAplicar(); veRelayout(); veDrawMonitor();
    const x0 = x, y0 = y;
    const move = ev => {   // arrastar: alças da curva (saída = arraste, entrada = o contrário)
        const p = veTxPontoQuadro(ev), dx = p.x - x0, dy = p.y - y0;
        if (Math.hypot(dx, dy) * q.s < 3) return;
        pt[4] = dx; pt[5] = dy; pt[2] = -dx; pt[3] = -dy;
        veCamAplicar(); veDrawMonitor();
    };
    const up = () => { win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); veRefresh(); };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
}

// Pontos e alças do caminho em edição por cima do monitor (chamado com o desenho das máscaras, editor-transform.js)
function veCamOverlay(ctx, pv) {
    const ed = VECAMI.ed; if (!ed || !ed.abs.length || VE.tool !== 'caminho') return;
    const q = veTxQuadroTela(), tela = pv / q.s;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ed.abs.forEach((p, i) => {
        const X = p[0] * pv, Y = p[1] * pv;
        if (p[4] || p[5]) {
            ctx.strokeStyle = 'rgba(79,195,255,.9)'; ctx.lineWidth = 1 * tela;
            ctx.beginPath(); ctx.moveTo(X + p[2] * pv, Y + p[3] * pv); ctx.lineTo(X + p[4] * pv, Y + p[5] * pv); ctx.stroke();
            [[p[2], p[3]], [p[4], p[5]]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(X + a * pv, Y + b * pv, 3 * tela, 0, Math.PI * 2); ctx.fillStyle = '#4fc3ff'; ctx.fill(); });
        }
        ctx.fillStyle = i === 0 ? '#ffd400' : '#ffffff';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1 * tela;
        ctx.fillRect(X - 4 * tela, Y - 4 * tela, 8 * tela, 8 * tela); ctx.strokeRect(X - 4 * tela, Y - 4 * tela, 8 * tela, 8 * tela);
    });
    ctx.restore();
}

// opções no monitor (as mesmas caixinhas do Pincel/Forma)
function veCamOpcoes() {
    const scr = $ve('ve-screen'); if (!scr) return;
    let box = scr.querySelector('.ve-cam-opcoes');
    if (VE.tool !== 'caminho') { if (box) box.hidden = true; if (VECAMI.ed) veCamTerminar(false); return; }
    if (!box) {
        box = scr.ownerDocument.createElement('div');
        box.className = 've-gr-opcoes ve-cam-opcoes';
        scr.appendChild(box);
        box.addEventListener('pointerdown', e => e.stopPropagation());
        box.addEventListener('input', e => {
            const el = e.target.closest('[data-cam]'); if (!el) return;
            VEGR.caminho[el.dataset.cam] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
            const out = box.querySelector(`[data-camv="${el.dataset.cam}"]`); if (out) out.textContent = el.value;
            veCamSalvar();
            if (VECAMI.ed) { veCamAplicar(); veDrawMonitor(); }
        });
        box.addEventListener('click', e => { if (e.target.closest('[data-camfim]')) veCamTerminar(false); });
    }
    const C = VEGR.caminho;
    box.innerHTML = `<span class="ve-gr-tit">${veT('Caneta de caminho')}</span>
        <label>${veT('Traço')}<input type="color" data-cam="cCor" value="${C.cCor}"></label>
        <label>${veT('Espessura')}<input type="range" data-cam="cLarg" min="1" max="120" value="${C.cLarg}"><b data-camv="cLarg">${C.cLarg}</b>px</label>
        <label><input type="checkbox" data-cam="pOn"${C.pOn ? ' checked' : ''}>${veT('Preenchimento')}<input type="color" data-cam="cor" value="${C.cor}"></label>
        <label><input type="checkbox" data-cam="pontaR"${C.pontaR ? ' checked' : ''}>${veT('Ponta redonda')}</label>
        <small>${veT('Clique: ponto · arraste: curva · Shift: 45° · clique no 1º ponto: fecha · Enter/Esc: termina')}</small>
        <button class="ve-btn ve-btn-sm ve-btn-ghost" data-camfim>${veT('Terminar')}</button>`;
    box.hidden = false;
}

(function () {
    const ligar = () => {
        const scr = $ve('ve-screen');
        if (!scr) return setTimeout(ligar, 500);
        scr.addEventListener('pointerdown', veCamPointer, true);
        scr.ownerDocument.addEventListener('keydown', e => {
            if (!VECAMI.ed || VE.tool !== 'caminho' || e.target.closest('input, textarea')) return;
            if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); veCamTerminar(false); }
        }, true);
    };
    ligar();
    // opções aparecem/somem junto com as do Pincel/Forma quando a ferramenta muda
    const antes = window.veGrOpcoes;
    if (typeof antes === 'function') window.veGrOpcoes = function () { const r = antes.apply(this, arguments); veCamOpcoes(); return r; };
})();
