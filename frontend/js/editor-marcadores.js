// =========================================================
// Pocket Editor — marcadores com duração (como no Premiere) e o chip de In/Out da barra da timeline
// Marcador: {t, cor, nome, d (duração s, opcional), desc (descrição, opcional)}. M cria/troca a cor na agulha.
// Na régua: clique leva a agulha até ele, arrastar move, duplo clique abre o diálogo (nome, duração, descrição,
// cor). Com duração, o marcador vira uma barra na régua com o nome ao longo dela, e a ponta direita arrasta
// para mudar o tamanho.
// =========================================================

const VEMK = { drag: null, cursor: false };
var VE_MK_H = 10;   // altura da faixa dos marcadores no topo da régua (os números da régua descem quando há marcador)

// ── chip do In/Out (barra da timeline): só aparece com entrada ou saída marcada ──
function veIoChip() {
    const chip = $ve('ve-io-chip');
    if (!chip) return;
    const tem = VE.ready && (VE.inPt != null || VE.outPt != null);
    if (chip.hidden === tem) chip.hidden = !tem;
    if (!tem) return;
    const a = VE.inPt ?? 0, b = VE.outPt ?? VE.dur;
    const txt = `${veShort(a)} → ${veShort(b)} · ${veShort(Math.max(0, b - a))}`;
    const el = $ve('ve-io-txt');
    if (el && el.textContent !== txt) el.textContent = txt;
}

// ── marcador na régua sob o ponto: {i (índice em VE.markers), modo: 'fim' | 'mover'} ──
function veMkAt(x, y) {
    if (!VE.ready || y > VE_RULER || !(VE.markers || []).length) return null;
    const X = t => (t - VE.view) * VE.pps;
    let achou = null;
    VE.markers.forEach((m, i) => {
        const t = +m.t || 0, d = +m.d || 0, x0 = X(t), x1 = X(t + d);
        // só a faixa de cima da régua (VE_MK_H) é do marcador; o resto da régua fica para a agulha
        if (y > VE_MK_H + 1) return;
        if (d > 0 && Math.abs(x - x1) <= 5) { achou = { i, modo: 'fim' }; return; }
        if (achou && achou.modo === 'fim') return;
        if (Math.abs(x - x0) <= 6) achou = { i, modo: 'mover' };
        else if (!achou && d > 0 && x > x0 && x < x1) achou = { i, modo: 'mover' };
    });
    return achou;
}

// texto legível sobre a cor do marcador (preto nas cores claras, branco nas escuras)
function veMkTxtCor(cor) {
    const h = String(cor || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(h)) return '#fff';
    const [r, g, b] = [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#111' : '#fff';
}

// ── desenho (chamado por veDrawMarkers em editor.js) ──
function veMkDesenhar(ctx, X, W, H) {
    const lista = VE.markers || [];
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    lista.forEach((m, i) => {
        const t = +m.t || 0, d = +m.d || 0;
        const x = Math.round(X(t)) + 0.5, x2 = Math.round(X(t + d)) + 0.5;
        if (x2 < -12 || x > W + 12) return;
        const cor = m.cor || veMarkerColor(i);
        // linha nas trilhas (início e, com duração, o fim)
        ctx.strokeStyle = veRgba(cor, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, VE_RULER); ctx.lineTo(x, H);
        if (d > 0) { ctx.moveTo(x2, VE_RULER); ctx.lineTo(x2, H); }
        ctx.stroke();
        if (d > 0) {
            // corpo do marcador na régua: barra cheia na cor dele (o nome vai por cima, com contraste)
            ctx.fillStyle = cor;
            ctx.fillRect(x, 0, x2 - x, VE_MK_H);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(x2 - 3, 0, 3, VE_MK_H);   // ponta que arrasta
            ctx.fillStyle = veRgba(cor, 0.10);
            ctx.fillRect(x, VE_RULER, x2 - x, H - VE_RULER);
        }
        ctx.fillStyle = cor;
        ctx.beginPath();
        ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x + 5, 8); ctx.lineTo(x, VE_MK_H + 2); ctx.lineTo(x - 5, 8);
        ctx.closePath();
        ctx.fill();
        if (m.nome) {
            ctx.font = '700 10px Segoe UI';
            const larg = ctx.measureText(m.nome).width;
            // com duração: o nome acompanha a tela (fica visível enquanto o trecho estiver à vista)
            const x0 = d > 0 ? Math.max(x + 8, Math.min(8, x2 - 10 - larg)) : x + 8;
            const lim = d > 0 ? x2 - 5 : W - 4;
            if (lim - x0 > 12) {
                ctx.save();
                ctx.beginPath(); ctx.rect(x0 - 4, 0, lim - x0 + 4, VE_MK_H); ctx.clip();
                if (!(d > 0)) {   // sem duração: etiqueta preenchida na cor do marcador
                    ctx.fillStyle = cor;
                    ctx.fillRect(x + 4, 0, larg + 9, VE_MK_H);
                }
                ctx.fillStyle = veMkTxtCor(cor);
                ctx.fillText(m.nome, x0, 8.5);
                ctx.restore();
            }
        }
    });
    ctx.restore();
}

// ── diálogo (duplo clique) ──
function veMkLerDur(txt) {
    txt = String(txt || '').trim().replace(',', '.');
    if (!txt) return 0;
    if (txt.includes(':')) {
        const p = txt.split(':').map(n => +n);
        if (p.some(n => !isFinite(n) || n < 0)) return null;
        const fps = VE.fps || 30;
        if (p.length === 4) return p[0] * 3600 + p[1] * 60 + p[2] + p[3] / fps;
        if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
        if (p.length === 2) return p[0] * 60 + p[1];
        return null;
    }
    const v = parseFloat(txt);
    return isFinite(v) && v >= 0 ? v : null;
}

function veMkFechar() { if (VEMK.dlg) { VEMK.dlg.fechar(); VEMK.dlg = null; } }

function veMkEditar(i, doc, cx, cy) {
    veMkFechar();
    const m = VE.markers[i];
    if (!m) return;
    const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let cor = m.cor || veMarkerColor(i);
    const el = doc.createElement('div');
    el.className = 've-mk-dlg';
    el.innerHTML = `
        <h4><i style="--c:${cor}"></i>${veT('Marcador')}</h4>
        <label>${veT('Nome')}<input data-mk="nome" value="${esc(m.nome)}" maxlength="120"></label>
        <div class="ve-mk-lin">
            <label>${veT('Início')}<span>${veTC(+m.t || 0)}</span></label>
            <label>${veT('Duração')}<input data-mk="dur" class="ve-mk-tc" value="${veTC(+m.d || 0)}" title="Timecode (00:00:02:15) ou segundos (2,5)"></label>
        </div>
        <label>${veT('Descrição')}<textarea data-mk="desc" rows="3" maxlength="2000">${esc(m.desc)}</textarea></label>
        <div class="ve-mk-cores">${VE_MARKER_COLORS.map(c => `<button data-cor="${c}" style="--c:${c}" class="${c === cor ? 'on' : ''}"></button>`).join('')}</div>
        <div class="ve-mk-acoes">
            <button class="ve-btn ve-btn-sm ve-btn-ghost perigo" data-mka="apagar">${veT('Apagar marcador')}</button><span></span>
            <button class="ve-btn ve-btn-sm ve-btn-ghost" data-mka="cancelar">${veT('Cancelar')}</button>
            <button class="ve-btn ve-btn-sm ve-btn-primary" data-mka="ok">OK</button>
        </div>`;
    (doc.querySelector('.ve') || doc.body).appendChild(el);   // dentro do .ve: as cores do editor valem
    const w = doc.defaultView, r = el.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(cx - r.width / 2, w.innerWidth - r.width - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(cy + 14, w.innerHeight - r.height - 8)) + 'px';
    const ok = () => {
        const d = veMkLerDur(el.querySelector('[data-mk="dur"]').value);
        if (d == null) { veToast(veT('Duração inválida')); return; }
        const nome = el.querySelector('[data-mk="nome"]').value.trim(), desc = el.querySelector('[data-mk="desc"]').value.trim();
        const dur = Math.max(0, Math.min(d, Math.max(0, veNavDur() - (+m.t || 0))));
        vePushHistory();
        const alvo = VE.markers[VE.markers.indexOf(m)] || m;
        alvo.nome = nome;
        alvo.cor = cor;
        if (desc) alvo.desc = desc; else delete alvo.desc;
        if (dur >= veFrame() / 2) alvo.d = Math.round(veSnapFrame(dur) * 1e4) / 1e4; else delete alvo.d;
        veMkFechar();
        veDraw();
        veToast(veT('Marcador atualizado'));
    };
    el.addEventListener('click', e => {
        const c = e.target.closest('[data-cor]'), a = e.target.closest('[data-mka]');
        if (c) {
            cor = c.dataset.cor;
            el.querySelectorAll('[data-cor]').forEach(b => b.classList.toggle('on', b === c));
            el.querySelector('h4 i').style.setProperty('--c', cor);
        } else if (a && a.dataset.mka === 'ok') ok();
        else if (a && a.dataset.mka === 'cancelar') veMkFechar();
        else if (a && a.dataset.mka === 'apagar') {
            const j = VE.markers.indexOf(m);
            veMkFechar();
            if (j < 0) return;
            vePushHistory();
            VE.markers.splice(j, 1);
            veDraw();
            veToast(veT('Marcador apagado'));
        }
    });
    el.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); veMkFechar(); }
        else if (e.key === 'Enter' && (e.target.tagName !== 'TEXTAREA' || e.ctrlKey)) { e.preventDefault(); ok(); }
    });
    const fora = e => { if (!el.contains(e.target)) veMkFechar(); };
    setTimeout(() => doc.addEventListener('pointerdown', fora, true), 0);
    VEMK.dlg = { fechar: () => { doc.removeEventListener('pointerdown', fora, true); el.remove(); } };
    const nome = el.querySelector('[data-mk="nome"]');
    nome.focus();
    nome.select();
}

// ── mouse na régua ──
function veMkIniciar() {
    const wrap = $ve('ve-tl-wrap'), io = $ve('ve-io-txt');
    if (io) io.addEventListener('click', () => { if (VE.ready) veSeek(VE.inPt ?? 0); });
    if (!wrap) return;
    wrap.addEventListener('pointerdown', e => {
        if (!VE.ready || e.button !== 0 || VE.tool === 'hand') return;
        const { x, y } = veTimeFromEvent(e);
        const hit = veMkAt(x, y);
        if (!hit) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (VE.playing) veStop();
        try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* já solto */ }
        const m = VE.markers[hit.i];
        VEMK.drag = { m, modo: hit.modo, x0: e.clientX, t0: +m.t || 0, d0: +m.d || 0, ativo: false };
    }, true);

    wrap.addEventListener('pointermove', e => {
        const d = VEMK.drag;
        if (!d) {
            if (!VE.ready) return;
            const { x, y } = veTimeFromEvent(e);
            const hit = y <= VE_RULER ? veMkAt(x, y) : null;
            if (hit) {
                const m = VE.markers[hit.i];
                wrap.style.cursor = hit.modo === 'fim' ? 'ew-resize' : 'pointer';
                const dica = [m.nome, m.desc, veT(hit.modo === 'fim' ? 'Arraste a ponta para mudar a duração' : 'Duplo clique: editar · arraste para mover')].filter(Boolean).join('\n');
                if (wrap.title !== dica) wrap.title = dica;
                VEMK.cursor = true;
            } else if (VEMK.cursor) {
                wrap.style.cursor = '';
                wrap.title = '';
                VEMK.cursor = false;
            }
            return;
        }
        e.stopImmediatePropagation();
        const dx = (e.clientX - d.x0) / VE.pps;
        if (!d.ativo) {
            if (Math.abs(e.clientX - d.x0) < 3) return;
            d.ativo = true;
            vePushHistory();
        }
        const agulha = v => Math.abs((v - VE.playhead) * VE.pps) < 6 ? VE.playhead : v;
        if (d.modo === 'fim') {
            const fim = agulha(veSnapFrame(d.t0 + d.d0 + dx));
            const dur = Math.max(veFrame(), Math.min(fim, veNavDur()) - d.t0);
            d.m.d = Math.round(dur * 1e4) / 1e4;
        } else {
            const t = Math.max(0, Math.min(veNavDur() - (+d.m.d || 0), agulha(veSnapFrame(d.t0 + dx))));
            d.m.t = Math.round(t * 1e4) / 1e4;
        }
        veDraw();
    }, true);

    const fim = e => {
        const d = VEMK.drag;
        if (!d) return;
        VEMK.drag = null;
        e.stopImmediatePropagation();
        if (d.ativo) { VE.markers.sort((a, b) => a.t - b.t); veDraw(); return; }
        veSeek(+d.m.t || 0);   // clique: leva a agulha até o marcador
    };
    wrap.addEventListener('pointerup', fim, true);
    wrap.addEventListener('pointercancel', fim, true);

    wrap.addEventListener('dblclick', e => {
        if (!VE.ready) return;
        const { x, y } = veTimeFromEvent(e);
        const hit = veMkAt(x, y);
        if (!hit) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        veMkEditar(hit.i, wrap.ownerDocument, e.clientX, e.clientY);
    }, true);
}

document.addEventListener('DOMContentLoaded', veMkIniciar);
