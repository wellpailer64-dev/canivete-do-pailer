// =========================================================
// Pocket Editor — editor de vídeo do Canivete do Pailer
// Modelo: o vídeo original é dividido em clipes contíguos [{s, e, off}].
// Clipes "off" são removidos na exportação e pulados na reprodução.
// =========================================================

const VE = {
    path: null,
    info: null,
    dur: 0,
    fps: 30,
    clips: [],          // [{s, e, off}]
    sel: -1,            // índice do clipe selecionado
    inPt: null,
    outPt: null,
    playhead: 0,
    pps: 50,            // pixels por segundo
    view: 0,            // tempo na borda esquerda
    tool: 'select',
    snap: true,
    history: [],
    future: [],
    thumbs: [],         // [{t, url, img}]
    peaks: [],
    playing: false,
    rate: 1,
    muted: false,
    ready: false,
    loadingPrepare: false,
    dest: null,
    hoverX: null,
    drag: null,
    exportRunning: false,
    lastOutput: null,
};

const VE_RULER = 28;
const VE_MAX_PPS = 600;
const $ve = id => document.getElementById(id);

// ─────────────────────────── utilidades ───────────────────────────

function veTC(t, fps = VE.fps) {
    t = Math.max(0, t || 0);
    const f = Math.round(fps) || 30;
    let totalFrames = Math.round(t * fps);
    const ff = totalFrames % f;
    const totalSec = Math.floor(totalFrames / f);
    const ss = totalSec % 60, mm = Math.floor(totalSec / 60) % 60, hh = Math.floor(totalSec / 3600);
    const p = n => String(n).padStart(2, '0');
    return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

function veShort(t) {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60), s = t - m * 60;
    return (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : String(m)) + ':' + s.toFixed(2).padStart(5, '0');
}

function veHuman(t) {
    t = Math.max(0, t || 0);
    if (t < 60) return t.toFixed(1) + 's';
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.round(t % 60);
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

function veEsc(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function veFrame() { return 1 / (VE.fps || 30); }
function veClamp(t) { return Math.min(Math.max(t, 0), VE.dur); }
function veSnapFrame(t) { return Math.round(t * VE.fps) / VE.fps; }

function veToast(msg) {
    let el = document.querySelector('.ve-toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 've-toast';
        $ve('ve').appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1600);
}

function veIsActive() {
    return document.getElementById('page-video-cutter')?.classList.contains('active');
}

// ─────────────────────────── modelo ───────────────────────────

function veKeptDuration() {
    return VE.clips.reduce((acc, c) => acc + (c.off ? 0 : c.e - c.s), 0);
}

function veClipAt(t) {
    for (let i = 0; i < VE.clips.length; i++) {
        const c = VE.clips[i];
        if (t >= c.s && (t < c.e || (i === VE.clips.length - 1 && t <= c.e))) return i;
    }
    return -1;
}

function veEditPoints() {
    const pts = new Set([0, VE.dur]);
    VE.clips.forEach(c => { pts.add(c.s); pts.add(c.e); });
    return [...pts].sort((a, b) => a - b);
}

function vePushHistory() {
    VE.history.push(JSON.stringify({ clips: VE.clips, inPt: VE.inPt, outPt: VE.outPt }));
    if (VE.history.length > 150) VE.history.shift();
    VE.future = [];
    veUpdateUndo();
}

function veRestore(snap) {
    const d = JSON.parse(snap);
    VE.clips = d.clips; VE.inPt = d.inPt; VE.outPt = d.outPt;
    VE.sel = Math.min(VE.sel, VE.clips.length - 1);
    veRefresh();
}

function veUndo() {
    if (!VE.history.length) return;
    VE.future.push(JSON.stringify({ clips: VE.clips, inPt: VE.inPt, outPt: VE.outPt }));
    veRestore(VE.history.pop());
    veUpdateUndo();
    veToast('Desfeito');
}

function veRedo() {
    if (!VE.future.length) return;
    VE.history.push(JSON.stringify({ clips: VE.clips, inPt: VE.inPt, outPt: VE.outPt }));
    veRestore(VE.future.pop());
    veUpdateUndo();
    veToast('Refeito');
}

function veUpdateUndo() {
    $ve('ve-undo').disabled = !VE.history.length;
    $ve('ve-redo').disabled = !VE.future.length;
}

function veSplitAt(t, quiet) {
    if (!VE.ready) return false;
    t = veSnapFrame(veClamp(t));
    const i = veClipAt(t);
    if (i < 0) return false;
    const c = VE.clips[i];
    if (t - c.s < veFrame() * 0.99 || c.e - t < veFrame() * 0.99) {
        if (!quiet) veToast('Já existe um corte aqui');
        return false;
    }
    vePushHistory();
    VE.clips.splice(i, 1, { s: c.s, e: t, off: c.off }, { s: t, e: c.e, off: c.off });
    if (VE.sel > i) VE.sel++;
    veRefresh();
    return true;
}

function veSplitAtPlayhead() {
    if (veSplitAt(VE.playhead)) veToast('✂ Dividido em ' + veShort(VE.playhead));
}

function veMergeNeighbors() {
    // Junta clipes vizinhos removidos (evita vários blocos "removido" colados)
    const out = [];
    for (const c of VE.clips) {
        const last = out[out.length - 1];
        if (last && last.off && c.off) last.e = c.e;
        else out.push({ ...c });
    }
    VE.clips = out;
    VE.sel = Math.min(VE.sel, VE.clips.length - 1);
}

function veSetOff(i, off) {
    if (i < 0 || i >= VE.clips.length) return;
    if (off && VE.clips.filter(c => !c.off).length === 1 && !VE.clips[i].off) {
        veToast('Não dá para remover o último clipe');
        return;
    }
    vePushHistory();
    VE.clips[i].off = off;
    if (off) veMergeNeighbors();
    veRefresh();
}

function veDeleteSelected() {
    if (VE.sel < 0) { veToast('Selecione um clipe na timeline'); return; }
    const c = VE.clips[VE.sel];
    veSetOff(VE.sel, !c.off);
    veToast(c.off ? '🗑 Clipe removido' : '↺ Clipe restaurado');
}

function veRemoveRange(a, b, label) {
    a = veSnapFrame(veClamp(Math.min(a, b)));
    b = veSnapFrame(veClamp(Math.max(a, b)));
    if (b - a < veFrame()) return;
    const kept = VE.clips.reduce((acc, c) => c.off ? acc
        : acc + (c.e - c.s) - Math.max(0, Math.min(c.e, b) - Math.max(c.s, a)), 0);
    if (kept < veFrame()) { veToast('Isso removeria o vídeo inteiro'); return; }
    vePushHistory();
    const hist = VE.history.length;
    // divide nas bordas sem gerar histórico extra
    [a, b].forEach(t => {
        const i = veClipAt(t);
        if (i < 0) return;
        const c = VE.clips[i];
        if (t - c.s >= veFrame() * 0.99 && c.e - t >= veFrame() * 0.99) {
            VE.clips.splice(i, 1, { s: c.s, e: t, off: c.off }, { s: t, e: c.e, off: c.off });
        }
    });
    VE.history.length = hist;
    VE.clips.forEach(c => { if (c.s >= a - 1e-6 && c.e <= b + 1e-6) c.off = true; });
    veMergeNeighbors();
    VE.sel = -1;
    veRefresh();
    if (label) veToast(label);
}

function veExtractInOut() {
    if (VE.inPt == null || VE.outPt == null) { veToast('Marque entrada (I) e saída (O) primeiro'); return; }
    veRemoveRange(VE.inPt, VE.outPt, '✂ Trecho In→Out removido');
    VE.inPt = VE.outPt = null;
    veDraw();
}

function veRemoveBefore() { veRemoveRange(0, VE.playhead, 'Removido tudo antes da agulha'); }
function veRemoveAfter() { veRemoveRange(VE.playhead, VE.dur, 'Removido tudo depois da agulha'); }

function veResetEdits() {
    if (!VE.ready) return;
    vePushHistory();
    VE.clips = [{ s: 0, e: VE.dur, off: false }];
    VE.sel = -1;
    VE.inPt = VE.outPt = null;
    veRefresh();
    veToast('Vídeo restaurado ao original');
}

function veMarkIn() {
    if (!VE.ready) return;
    VE.inPt = VE.playhead;
    if (VE.outPt != null && VE.outPt <= VE.inPt) VE.outPt = null;
    veDraw();
    veToast('Entrada em ' + veShort(VE.inPt));
}

function veMarkOut() {
    if (!VE.ready) return;
    VE.outPt = VE.playhead;
    if (VE.inPt != null && VE.inPt >= VE.outPt) VE.inPt = null;
    veDraw();
    veToast('Saída em ' + veShort(VE.outPt));
}

// ─────────────────────────── reprodução ───────────────────────────

function veVideo() { return $ve('ve-video'); }

function veSeek(t, fromPlayer) {
    if (!VE.ready) return;
    VE.playhead = veClamp(t);
    const v = veVideo();
    if (!fromPlayer && v && v.src && Math.abs(v.currentTime - VE.playhead) > 0.001) {
        try { v.currentTime = VE.playhead; } catch (e) { /* ainda carregando */ }
    }
    veFollowPlayhead(false);
    veUpdateReadouts();
    veDraw();
}

function veStepFrames(n) {
    if (VE.playing) veVideo().pause();
    veSeek(veSnapFrame(VE.playhead) + n * veFrame());
}

function veJumpEdit(dir) {
    const pts = veEditPoints();
    const eps = veFrame() / 2;
    const t = dir > 0 ? pts.find(p => p > VE.playhead + eps) : [...pts].reverse().find(p => p < VE.playhead - eps);
    if (t != null) veSeek(t);
}

function veNextKeptStart(t) {
    for (const c of VE.clips) if (!c.off && c.e > t + 1e-3) return Math.max(c.s, t);
    return null;
}

function veTogglePlay() {
    if (!VE.ready) return;
    const v = veVideo();
    if (!v.src) return;
    if (v.paused) {
        let start = VE.playhead;
        if (start >= VE.dur - veFrame()) start = 0;
        const k = veNextKeptStart(start);
        if (k == null) return;
        if (Math.abs(k - v.currentTime) > 0.01) v.currentTime = k;
        v.playbackRate = VE.rate;
        v.play().catch(() => {});
    } else {
        v.pause();
    }
}

function veSetRate(r) {
    VE.rate = r;
    veVideo().playbackRate = r;
    const el = $ve('ve-rate');
    el.hidden = r === 1;
    el.textContent = r + 'x';
}

function veToggleMute() {
    VE.muted = !VE.muted;
    veVideo().muted = VE.muted;
    $ve('ve-mute').textContent = VE.muted ? '🔇' : '🔊';
}

function vePlaybackLoop() {
    if (!VE.playing) return;
    const v = veVideo();
    const t = v.currentTime;
    const i = veClipAt(t);
    if (i >= 0 && VE.clips[i].off) {
        const next = veNextKeptStart(VE.clips[i].e);
        if (next == null) { v.pause(); veSeek(VE.dur, true); return; }
        v.currentTime = next;
    }
    VE.playhead = veClamp(v.currentTime);
    veFollowPlayhead(true);
    veUpdateReadouts();
    veDraw();
    requestAnimationFrame(vePlaybackLoop);
}

// ─────────────────────────── visão / zoom ───────────────────────────

function veCanvasWidth() { return $ve('ve-tl-wrap').clientWidth || 800; }
function veFitPps() { return VE.dur > 0 ? (veCanvasWidth() - 16) / VE.dur : 50; }
function veVisibleDur() { return veCanvasWidth() / VE.pps; }

function veClampView() {
    const maxView = Math.max(0, VE.dur - veVisibleDur() + 8 / VE.pps);
    VE.view = Math.min(Math.max(VE.view, 0), maxView);
}

function veSetPps(pps, anchorT, anchorX) {
    const fit = veFitPps();
    VE.pps = Math.min(Math.max(pps, fit), VE_MAX_PPS);
    if (anchorT != null) VE.view = anchorT - anchorX / VE.pps;
    veClampView();
    veSyncZoomSlider();
    veDraw();
}

function veZoomBy(f) {
    const px = (VE.playhead - VE.view) * VE.pps;
    const anchorX = px >= 0 && px <= veCanvasWidth() ? px : veCanvasWidth() / 2;
    const anchorT = VE.view + anchorX / VE.pps;
    veSetPps(VE.pps * f, anchorT, anchorX);
}

function veZoomFit() { VE.view = 0; veSetPps(veFitPps()); }

function veZoomSlider(v) {
    const fit = veFitPps();
    const pps = fit * Math.pow(VE_MAX_PPS / fit, v / 1000);
    const x = veCanvasWidth() / 2;
    veSetPps(pps, VE.view + x / VE.pps, x);
}

function veSyncZoomSlider() {
    const fit = veFitPps();
    const el = $ve('ve-zoom');
    if (!el || VE_MAX_PPS <= fit) return;
    el.value = Math.round(1000 * Math.log(VE.pps / fit) / Math.log(VE_MAX_PPS / fit));
}

function veFollowPlayhead(playing) {
    const w = veCanvasWidth();
    const x = (VE.playhead - VE.view) * VE.pps;
    if (playing) {
        if (x > w * 0.92 || x < 0) { VE.view = VE.playhead - w * 0.1 / VE.pps; veClampView(); }
    } else if (x < 0 || x > w) {
        VE.view = VE.playhead - w / 2 / VE.pps;
        veClampView();
    }
}

// ─────────────────────────── desenho ───────────────────────────

let veDrawQueued = false;
function veDraw() {
    if (veDrawQueued) return;
    veDrawQueued = true;
    requestAnimationFrame(() => { veDrawQueued = false; veRender(); });
}

function veTrackGeom() {
    // Alinha as trilhas do canvas com os cabeçalhos V1/A1 (posições relativas ao canvas)
    const hv = document.querySelector('.ve-head-v');
    const ha = document.querySelector('.ve-head-a');
    const base = $ve('ve-tl-wrap').getBoundingClientRect().top;
    if (!hv || !ha) return { vTop: VE_RULER, vH: 80, aTop: VE_RULER + 81, aH: 60 };
    const rv = hv.getBoundingClientRect(), ra = ha.getBoundingClientRect();
    return { vTop: rv.top - base, vH: rv.height - 1, aTop: ra.top - base, aH: ra.height - 1 };
}

function veNiceStep(minSec) {
    const f = VE.fps || 30;
    const steps = [1 / f, 2 / f, 5 / f, 10 / f, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
    return steps.find(s => s >= minSec) || 7200;
}

function veRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

let veHatch = null;
function veHatchPattern(ctx) {
    if (veHatch) return veHatch;
    const c = document.createElement('canvas');
    c.width = c.height = 10;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,10,10,0.78)';
    g.fillRect(0, 0, 10, 10);
    g.strokeStyle = 'rgba(239,68,68,0.55)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(-2, 12); g.lineTo(12, -2); g.stroke();
    g.beginPath(); g.moveTo(8, 12); g.lineTo(12, 8); g.stroke();
    g.beginPath(); g.moveTo(-2, 2); g.lineTo(2, -2); g.stroke();
    veHatch = ctx.createPattern(c, 'repeat');
    return veHatch;
}

function veRender() {
    const canvas = $ve('ve-tl');
    const wrap = $ve('ve-tl-wrap');
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#121215';
    ctx.fillRect(0, 0, W, H);

    const g = veTrackGeom();
    // trilhas (fundo)
    ctx.fillStyle = '#17171b';
    ctx.fillRect(0, g.vTop, W, g.vH);
    ctx.fillRect(0, g.aTop, W, g.aH);
    ctx.fillStyle = '#2a2a31';
    ctx.fillRect(0, g.vTop + g.vH, W, 1);
    ctx.fillRect(0, g.aTop + g.aH, W, 1);

    // régua
    ctx.fillStyle = '#1b1b20';
    ctx.fillRect(0, 0, W, VE_RULER);
    ctx.fillStyle = '#2a2a31';
    ctx.fillRect(0, VE_RULER - 1, W, 1);

    if (!VE.ready) {
        ctx.fillStyle = '#4a4a55';
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('A timeline aparece aqui quando você abrir um vídeo', W / 2, g.vTop + g.vH / 2 + 4);
        ctx.textAlign = 'left';
        veUpdateScrollbar();
        return;
    }

    const X = t => (t - VE.view) * VE.pps;
    const t0 = VE.view, t1 = VE.view + W / VE.pps;

    // ticks
    const major = veNiceStep(90 / VE.pps);
    const minor = major / (major >= 1 ? 5 : 2);
    ctx.fillStyle = '#3a3a44';
    for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
        const x = Math.round(X(t)) + 0.5;
        ctx.fillRect(x, VE_RULER - 6, 1, 5);
    }
    ctx.font = '10.5px Cascadia Mono, Consolas, monospace';
    for (let t = Math.floor(t0 / major) * major; t <= t1; t += major) {
        const x = Math.round(X(t)) + 0.5;
        ctx.fillStyle = '#5a5a66';
        ctx.fillRect(x, 6, 1, VE_RULER - 7);
        ctx.fillStyle = '#9a9aa6';
        const label = major < 1 ? veTC(t).slice(3) : veTC(t).slice(0, 8).replace(/^00:/, '');
        ctx.fillText(label, x + 4, 15);
    }

    // In / Out
    if (VE.inPt != null || VE.outPt != null) {
        const a = VE.inPt ?? 0, b = VE.outPt ?? VE.dur;
        ctx.fillStyle = 'rgba(56,189,248,0.10)';
        ctx.fillRect(X(a), VE_RULER, (b - a) * VE.pps, H - VE_RULER);
        ctx.fillStyle = 'rgba(56,189,248,0.55)';
        ctx.fillRect(X(a), 0, Math.max(1, (b - a) * VE.pps), 4);
        ctx.fillStyle = '#38bdf8';
        if (VE.inPt != null) { ctx.fillRect(X(VE.inPt), 0, 2, H); }
        if (VE.outPt != null) { ctx.fillRect(X(VE.outPt) - 2, 0, 2, H); }
    }

    // clipes
    const pat = veHatchPattern(ctx);
    VE.clips.forEach((c, i) => {
        const x1 = X(c.s), x2 = X(c.e);
        if (x2 < -2 || x1 > W + 2) return;
        const cx = Math.max(x1, -4) + 1, cw = Math.min(x2, W + 4) - Math.max(x1, -4) - 2;
        if (cw <= 0) return;

        // ---- vídeo
        const vy = g.vTop + 4, vh = g.vH - 8;
        ctx.save();
        veRoundRect(ctx, cx, vy, cw, vh, 5);
        ctx.clip();
        ctx.fillStyle = c.off ? '#2a2226' : '#27305f';
        ctx.fillRect(cx, vy, cw, vh);
        const th = vh - 16;
        const img0 = VE.thumbs.find(tb => tb.img && tb.img.complete && tb.img.naturalWidth);
        if (img0 && th > 10) {
            const tw = th * (img0.img.naturalWidth / img0.img.naturalHeight);
            const start = Math.floor((cx - 1) / tw) * tw;
            for (let x = start; x < cx + cw; x += tw) {
                const tMid = VE.view + (x + tw / 2) / VE.pps;
                const tb = veThumbFor(tMid);
                if (tb) ctx.drawImage(tb.img, x, vy + 14, tw, th);
            }
        }
        ctx.fillStyle = c.off ? 'rgba(0,0,0,0.25)' : 'rgba(91,110,225,0.18)';
        ctx.fillRect(cx, vy, cw, vh);
        ctx.fillStyle = c.off ? '#3a2a2e' : '#5b6ee1';
        ctx.fillRect(cx, vy, cw, 14);
        if (c.off) { ctx.fillStyle = pat; ctx.fillRect(cx, vy, cw, vh); }
        if (cw > 50) {
            ctx.fillStyle = c.off ? '#fca5a5' : '#eef0ff';
            ctx.font = '600 10.5px Segoe UI';
            const name = c.off ? 'REMOVIDO' : `Clipe ${veKeptIndex(i)}`;
            ctx.fillText(name + (cw > 150 ? '  ·  ' + veShort(c.e - c.s) : ''), cx + 6, vy + 10.5);
        }
        ctx.restore();

        // ---- áudio
        const ay = g.aTop + 4, ah = g.aH - 8;
        ctx.save();
        veRoundRect(ctx, cx, ay, cw, ah, 5);
        ctx.clip();
        ctx.fillStyle = c.off ? '#221f21' : '#163a2b';
        ctx.fillRect(cx, ay, cw, ah);
        if (VE.peaks.length && VE.info && VE.info.has_audio) {
            const mid = ay + ah / 2, amp = ah / 2 - 3;
            ctx.fillStyle = c.off ? '#5a4448' : '#43c58f';
            const n = VE.peaks.length;
            const xa = Math.max(cx, 0), xb = Math.min(cx + cw, W);
            for (let x = xa; x < xb; x += 2) {
                const ta = VE.view + x / VE.pps, tb = VE.view + (x + 2) / VE.pps;
                let ia = Math.floor(ta / VE.dur * n), ib = Math.max(ia + 1, Math.ceil(tb / VE.dur * n));
                let pk = 0;
                for (let k = Math.max(0, ia); k < Math.min(n, ib); k++) pk = Math.max(pk, VE.peaks[k]);
                const h = Math.max(1, pk * amp);
                ctx.fillRect(x, mid - h, 1.4, h * 2);
            }
        } else if (VE.info && !VE.info.has_audio) {
            ctx.fillStyle = '#4a4a55';
            ctx.font = '11px Segoe UI';
            if (cw > 80) ctx.fillText('sem áudio', cx + 8, ay + ah / 2 + 4);
        }
        if (c.off) { ctx.fillStyle = pat; ctx.fillRect(cx, ay, cw, ah); }
        ctx.restore();

        // seleção
        if (i === VE.sel) {
            ctx.strokeStyle = '#F97316';
            ctx.lineWidth = 2;
            veRoundRect(ctx, cx, vy, cw, vh, 5); ctx.stroke();
            veRoundRect(ctx, cx, ay, cw, ah, 5); ctx.stroke();
        }
    });

    // guia da lâmina
    if (VE.tool === 'razor' && VE.hoverX != null) {
        const t = veSnapTime(VE.view + VE.hoverX / VE.pps, true);
        const x = Math.round(X(t)) + 0.5;
        ctx.strokeStyle = '#fbbf24';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, VE_RULER); ctx.lineTo(x, H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '600 10px Cascadia Mono, Consolas, monospace';
        ctx.fillText(veShort(t), Math.min(x + 4, W - 60), VE_RULER + 12);
    }

    // agulha
    const px = Math.round(X(VE.playhead)) + 0.5;
    if (px >= -8 && px <= W + 8) {
        ctx.fillStyle = '#F97316';
        ctx.fillRect(px - 0.5, VE_RULER - 2, 1.5, H);
        ctx.beginPath();
        ctx.moveTo(px - 6, 2); ctx.lineTo(px + 6, 2); ctx.lineTo(px + 6, 14); ctx.lineTo(px, 20); ctx.lineTo(px - 6, 14);
        ctx.closePath();
        ctx.fill();
    }
    veUpdateScrollbar();
}

function veKeptIndex(i) {
    let n = 0;
    for (let k = 0; k <= i; k++) if (!VE.clips[k].off) n++;
    return n;
}

function veThumbFor(t) {
    if (!VE.thumbs.length) return null;
    let best = null, bd = Infinity;
    // thumbs ordenadas por tempo → busca binária
    let lo = 0, hi = VE.thumbs.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (VE.thumbs[mid].t < t) lo = mid + 1; else hi = mid - 1;
    }
    for (const k of [lo - 1, lo]) {
        const tb = VE.thumbs[k];
        if (tb && tb.img && tb.img.complete && tb.img.naturalWidth) {
            const d = Math.abs(tb.t - t);
            if (d < bd) { bd = d; best = tb; }
        }
    }
    return best;
}

function veUpdateScrollbar() {
    const bar = $ve('ve-scrollbar'), thumb = $ve('ve-scroll-thumb');
    if (!bar || !thumb) return;
    if (!VE.ready || VE.dur <= 0) { thumb.style.left = '0'; thumb.style.width = '100%'; return; }
    const frac = Math.min(1, veVisibleDur() / VE.dur);
    thumb.style.width = Math.max(4, frac * 100) + '%';
    thumb.style.left = (VE.view / VE.dur * 100) + '%';
}

// ─────────────────────────── UI (listas / leituras) ───────────────────────────

function veUpdateReadouts() {
    $ve('ve-tc').textContent = veTC(VE.playhead);
    $ve('ve-tc-total').textContent = veTC(veKeptDuration());
}

function veRenderClips() {
    const box = $ve('ve-clips');
    if (!VE.ready) return;
    const kept = veKeptDuration();
    $ve('ve-sum-orig').textContent = veHuman(VE.dur);
    $ve('ve-sum-final').textContent = veHuman(kept);
    $ve('ve-sum-cut').textContent = veHuman(VE.dur - kept);

    if (VE.clips.length === 1 && !VE.clips[0].off) {
        box.innerHTML = '<div class="ve-clips-empty">Nenhum corte ainda.<br>Posicione a agulha e aperte <b>S</b> para dividir, ou use a lâmina <b>C</b> e clique na timeline.<br>Selecione um clipe e aperte <b>Delete</b> para removê-lo.</div>';
        return;
    }
    box.innerHTML = VE.clips.map((c, i) => `
        <div class="ve-clip${c.off ? ' off' : ''}${i === VE.sel ? ' sel' : ''}" data-i="${i}">
            <div class="ve-clip-bar"></div>
            <div>
                <div class="ve-clip-name">${c.off ? 'Trecho removido' : 'Clipe ' + veKeptIndex(i)}</div>
                <div class="ve-clip-time">${veShort(c.s)} → ${veShort(c.e)} · ${veShort(c.e - c.s)}</div>
            </div>
            <button class="ve-clip-act" data-act="${i}" title="${c.off ? 'Restaurar' : 'Remover'}">${c.off ? '↺' : '🗑'}</button>
        </div>`).join('');
}

function veRefresh() {
    veUpdateReadouts();
    veRenderClips();
    veDraw();
}

function veTab(name) {
    document.querySelectorAll('.ve-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $ve('ve-pane-clips').hidden = name !== 'clips';
    $ve('ve-pane-keys').hidden = name !== 'keys';
}

function veSetTool(tool) {
    VE.tool = tool;
    ['select', 'razor', 'hand'].forEach(t => $ve('ve-tool-' + t).classList.toggle('active', t === tool));
    const wrap = $ve('ve-tl-wrap');
    wrap.classList.toggle('tool-razor', tool === 'razor');
    wrap.classList.toggle('tool-hand', tool === 'hand');
    veDraw();
}

function veToggleSnap() {
    VE.snap = !VE.snap;
    $ve('ve-snap').classList.toggle('active', VE.snap);
    veToast(VE.snap ? '🧲 Ímã ligado' : 'Ímã desligado');
}

function veSnapTime(t, forRazor) {
    t = veClamp(t);
    if (VE.snap) {
        const lim = 8 / VE.pps;
        const cands = veEditPoints();
        if (forRazor) cands.push(VE.playhead);
        if (VE.inPt != null) cands.push(VE.inPt);
        if (VE.outPt != null) cands.push(VE.outPt);
        let best = null, bd = lim;
        for (const c of cands) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
        if (best != null) return best;
    }
    return veSnapFrame(t);
}

// ─────────────────────────── abrir vídeo ───────────────────────────

function veOpenFile() {
    if (VE.exportRunning) return;
    window.pywebview.api.select_video_file('video-cutter').then(r => {
        if (r && r.success) veOpenPath(r.path);
    });
}

function veOpenPath(path) {
    if (!path || VE.exportRunning || !veIsActive()) return;
    const v = veVideo();
    v.pause();
    v.removeAttribute('src');
    v.load();
    Object.assign(VE, {
        path, info: null, dur: 0, clips: [], sel: -1, inPt: null, outPt: null, playhead: 0,
        history: [], future: [], thumbs: [], peaks: [], ready: false, dest: null, view: 0,
    });
    veUpdateUndo();
    $ve('ve-empty').hidden = true;
    $ve('ve-proxy-badge').hidden = true;
    veLoading('Analisando vídeo...', 5);
    $ve('ve-export-btn').disabled = true;
    $ve('ve-meta').textContent = path.split(/[\\/]/).pop();
    if (typeof playExecute === 'function') playExecute();
    window.pywebview.api.video_cutter_prepare(path);
    veDraw();
}

function veLoading(text, pct) {
    const el = $ve('ve-loading');
    if (text == null) { el.hidden = true; return; }
    el.hidden = false;
    $ve('ve-loading-text').textContent = text;
    $ve('ve-loading-fill').style.width = (pct || 0) + '%';
}

function veOnPrepare(ev) {
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return; } }
    if (ev.path && ev.path !== VE.path && ev.stage === 'info') return;
    switch (ev.stage) {
        case 'info': {
            VE.info = ev;
            VE.dur = ev.duration;
            VE.fps = ev.fps || 30;
            VE.clips = [{ s: 0, e: VE.dur, off: false }];
            VE.ready = true;
            VE.pps = veFitPps();
            VE.view = 0;
            veSyncZoomSlider();
            const res = ev.width && ev.height ? `${ev.width}×${ev.height}` : '';
            $ve('ve-meta').innerHTML = `<b>${veEsc(ev.file_name)}</b> · ${res} · ${(+ev.fps).toFixed(2).replace(/\.00$/, '')} fps · ${veHuman(ev.duration)}${ev.has_audio ? '' : ' · sem áudio'}`;
            veLoading(ev.needs_proxy ? 'Preparando prévia leve (formato não toca direto no app)...' : 'Carregando vídeo...', ev.needs_proxy ? 0 : 60);
            veRefresh();
            break;
        }
        case 'proxy':
            veLoading(`Preparando prévia leve... ${ev.pct}%`, ev.pct);
            break;
        case 'video': {
            const v = veVideo();
            v.src = ev.url;
            v.muted = VE.muted;
            v.load();
            $ve('ve-proxy-badge').hidden = !ev.proxy;
            v.addEventListener('loadeddata', () => {
                veLoading(null);
                $ve('ve-export-btn').disabled = false;
                veSeek(0);
            }, { once: true });
            break;
        }
        case 'thumbs':
            VE.thumbs = (ev.thumbs || []).sort((a, b) => a.t - b.t).map(tb => {
                const img = new Image();
                img.onload = veDraw;
                img.src = tb.url;
                return { t: tb.t, url: tb.url, img };
            });
            break;
        case 'peaks':
            VE.peaks = ev.peaks || [];
            veDraw();
            break;
        case 'error':
            veLoading(null);
            VE.ready = false;
            $ve('ve-empty').hidden = false;
            $ve('ve-meta').textContent = '❌ ' + (ev.error || 'Erro ao abrir o vídeo');
            veToast('Não foi possível abrir: ' + (ev.error || 'erro'));
            veDraw();
            break;
    }
}

// ─────────────────────────── exportação ───────────────────────────

function vePill(name) {
    return document.querySelector(`.ve-pills[data-name="${name}"] .ve-pill.active`)?.dataset.v;
}

function veOpenExport() {
    if (!VE.ready) return;
    if (VE.playing) veVideo().pause();
    const sel = $ve('ve-res');
    const h = VE.info.height || 0;
    const opts = [['original', `Original (${VE.info.width}×${h})`]];
    [[2160, '4K (2160p)'], [1440, '1440p'], [1080, '1080p Full HD'], [720, '720p HD'], [480, '480p']]
        .forEach(([r, l]) => { if (h > r) opts.push([String(r), l]); });
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    $ve('ve-noaudio').disabled = !VE.info.has_audio;
    $ve('ve-export-form').hidden = false;
    $ve('ve-export-progress').hidden = true;
    $ve('ve-exp-result').hidden = true;
    veExportFoot('form');
    veUpdateExportSummary();
    $ve('ve-export').hidden = false;
}

function veUpdateExportSummary() {
    const kept = VE.clips.filter(c => !c.off);
    const fmt = vePill('format') || 'mp4';
    const res = $ve('ve-res').value;
    const h = res === 'original' ? VE.info.height : +res;
    const w = res === 'original' ? VE.info.width : Math.round(VE.info.width * h / VE.info.height / 2) * 2;
    $ve('ve-export-summary').innerHTML =
        `Duração final: <b>${veTC(veKeptDuration())}</b> (${veHuman(veKeptDuration())})<br>` +
        `Trechos mantidos: <b>${kept.length}</b> · Resolução: <b>${w}×${h}</b> · <b>${fmt.toUpperCase()}</b>`;
}

function veExportFoot(mode) {
    const foot = $ve('ve-export-foot');
    if (mode === 'form') {
        foot.innerHTML = '<button class="ve-btn ve-btn-ghost" onclick="veCloseExport()">Cancelar</button>' +
            '<button class="ve-btn ve-btn-primary" onclick="veStartExport()">⬇ Exportar</button>';
    } else if (mode === 'running') {
        foot.innerHTML = '<button class="ve-btn" onclick="veCancelExport()">✕ Cancelar exportação</button>';
    } else {
        foot.innerHTML = '<button class="ve-btn" onclick="veCloseExport()">Fechar</button>';
    }
}

function veCloseExport() {
    if (VE.exportRunning) return;
    $ve('ve-export').hidden = true;
}

function veChooseDest() {
    window.pywebview.api.select_folder('video-cutter').then(r => {
        if (r && r.success) {
            VE.dest = r.path;
            $ve('ve-dest-label').textContent = r.path;
        }
    });
}

function veStartExport() {
    const segs = VE.clips.filter(c => !c.off).map(c => ({ start: c.s, end: c.e }));
    if (!segs.length) return;
    VE.exportRunning = true;
    $ve('ve-export-form').hidden = true;
    $ve('ve-export-progress').hidden = false;
    $ve('ve-exp-result').hidden = true;
    $ve('ve-exp-fill').style.width = '0%';
    $ve('ve-exp-pct').textContent = '0%';
    $ve('ve-exp-msg').textContent = 'Preparando...';
    veExportFoot('running');
    VE._expStart = Date.now();
    const noAudio = $ve('ve-noaudio').checked;
    window.pywebview.api.video_cutter_export(
        VE.path, segs, vePill('format') || 'mp4', vePill('quality') || 'medium',
        $ve('ve-res').value, $ve('ve-gpu').checked, VE.dest, noAudio
    );
}

function veCancelExport() {
    window.pywebview.api.video_cutter_cancel_export();
    $ve('ve-exp-msg').textContent = 'Cancelando...';
}

function veOnExport(ev) {
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return; } }
    if (!ev.done) {
        const p = ev.pct || 0;
        $ve('ve-exp-fill').style.width = p + '%';
        $ve('ve-exp-pct').textContent = p + '%';
        let eta = '';
        if (p > 3) {
            const el = (Date.now() - VE._expStart) / 1000;
            eta = ' · falta ~' + veHuman(el / p * (100 - p));
        }
        $ve('ve-exp-msg').textContent = (ev.message || 'Exportando...').replace(/\.\.\. \d+%$/, '...') + eta;
        return;
    }
    VE.exportRunning = false;
    const box = $ve('ve-exp-result');
    box.hidden = false;
    if (ev.success) {
        VE.lastOutput = ev.output_path;
        $ve('ve-exp-fill').style.width = '100%';
        $ve('ve-exp-pct').textContent = '100%';
        $ve('ve-exp-msg').textContent = 'Concluído em ' + veHuman((Date.now() - VE._expStart) / 1000);
        box.className = 've-exp-result ok';
        const mb = ev.size ? (ev.size / 1048576).toFixed(1) + ' MB' : '';
        box.innerHTML = `✅ <b>${veEsc(ev.output_path.split(/[\\/]/).pop())}</b><br>` +
            `<span style="color:#9a9aa6">${veHuman(ev.duration)} · ${mb}</span>` +
            '<div class="ve-exp-actions">' +
            '<button class="ve-btn ve-btn-primary ve-btn-sm" onclick="window.pywebview.api.open_file(VE.lastOutput)">▶ Assistir</button>' +
            '<button class="ve-btn ve-btn-sm" onclick="window.pywebview.api.reveal_file(VE.lastOutput)">📂 Mostrar na pasta</button></div>';
        if (typeof playConcluido === 'function') playConcluido();
    } else {
        box.className = 've-exp-result err';
        box.textContent = ev.cancelled ? 'Exportação cancelada.' : ('❌ ' + (ev.error || 'Erro ao exportar.'));
        $ve('ve-exp-msg').textContent = ev.cancelled ? 'Cancelado' : 'Falhou';
    }
    veExportFoot('done');
}

// ─────────────────────────── eventos ───────────────────────────

function veTimeFromEvent(e) {
    const r = $ve('ve-tl-wrap').getBoundingClientRect();
    return { t: VE.view + (e.clientX - r.left) / VE.pps, x: e.clientX - r.left, y: e.clientY - r.top };
}

function veOnPlayheadHandle(x, y) {
    const px = (VE.playhead - VE.view) * VE.pps;
    return Math.abs(x - px) <= 7 && (y <= VE_RULER + 2 || Math.abs(x - px) <= 3);
}

function veInitEvents() {
    const wrap = $ve('ve-tl-wrap');
    const v = veVideo();

    v.addEventListener('play', () => {
        VE.playing = true;
        $ve('ve-play').textContent = '❚❚';
        requestAnimationFrame(vePlaybackLoop);
    });
    v.addEventListener('pause', () => {
        VE.playing = false;
        $ve('ve-play').textContent = '▶';
        VE.playhead = veClamp(v.currentTime);
        veUpdateReadouts();
        veDraw();
    });
    v.addEventListener('ended', () => { VE.playing = false; $ve('ve-play').textContent = '▶'; });
    v.addEventListener('click', () => veTogglePlay());
    v.addEventListener('error', () => {
        if (!v.getAttribute('src')) return;
        veLoading(null);
        veToast('O player não conseguiu abrir este vídeo');
    });

    wrap.addEventListener('pointerdown', e => {
        if (!VE.ready) return;
        wrap.setPointerCapture(e.pointerId);
        const { t, x, y } = veTimeFromEvent(e);
        if (e.button === 1 || VE.tool === 'hand') {
            VE.drag = { mode: 'pan', x0: e.clientX, view0: VE.view };
            wrap.classList.add('dragging');
            return;
        }
        if (y <= VE_RULER || veOnPlayheadHandle(x, y)) {
            if (VE.playing) v.pause();
            VE.drag = { mode: 'scrub' };
            wrap.classList.add('scrub');
            veSeek(e.shiftKey ? veSnapFrame(t) : veSnapTime(t));
            return;
        }
        if (VE.tool === 'razor') {
            veSplitAt(veSnapTime(t, true));
            return;
        }
        // seleção: seleciona o clipe e posiciona a agulha
        const i = veClipAt(veClamp(t));
        VE.sel = i;
        if (VE.playing) v.pause();
        VE.drag = { mode: 'scrub' };
        veSeek(veSnapTime(t));
        veRenderClips();
    });

    wrap.addEventListener('pointermove', e => {
        const { t, x } = veTimeFromEvent(e);
        VE.hoverX = x;
        if (!VE.drag) {
            if (VE.tool === 'razor') veDraw();
            return;
        }
        if (VE.drag.mode === 'pan') {
            VE.view = VE.drag.view0 - (e.clientX - VE.drag.x0) / VE.pps;
            veClampView();
            veDraw();
        } else if (VE.drag.mode === 'scrub') {
            // auto-rolagem nas bordas
            const w = veCanvasWidth();
            if (x > w - 20) { VE.view += 12 / VE.pps; veClampView(); }
            if (x < 20) { VE.view -= 12 / VE.pps; veClampView(); }
            veSeek(e.shiftKey ? veSnapFrame(t) : veSnapTime(t));
        }
    });

    const endDrag = () => {
        VE.drag = null;
        wrap.classList.remove('dragging', 'scrub');
    };
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);
    wrap.addEventListener('pointerleave', () => { VE.hoverX = null; if (VE.tool === 'razor') veDraw(); });

    wrap.addEventListener('dblclick', e => {
        if (!VE.ready || VE.tool !== 'select') return;
        const { t, y } = veTimeFromEvent(e);
        if (y <= VE_RULER) return;
        const i = veClipAt(veClamp(t));
        if (i >= 0) {
            const off = !VE.clips[i].off;
            veSetOff(i, off);
            veToast(off ? '🗑 Clipe removido' : '↺ Clipe restaurado');
        }
    });

    wrap.addEventListener('wheel', e => {
        if (!VE.ready) return;
        e.preventDefault();
        const { x } = veTimeFromEvent(e);
        if (e.ctrlKey || e.altKey) {
            const f = e.deltaY < 0 ? 1.2 : 1 / 1.2;
            veSetPps(VE.pps * f, VE.view + x / VE.pps, x);
        } else {
            const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
            VE.view += d / VE.pps;
            veClampView();
            veDraw();
        }
    }, { passive: false });

    // barra de rolagem
    const thumb = $ve('ve-scroll-thumb'), bar = $ve('ve-scrollbar');
    thumb.addEventListener('pointerdown', e => {
        e.stopPropagation();
        thumb.setPointerCapture(e.pointerId);
        const x0 = e.clientX, v0 = VE.view;
        const move = ev => {
            VE.view = v0 + (ev.clientX - x0) / bar.clientWidth * VE.dur;
            veClampView();
            veDraw();
        };
        const up = () => { thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', up); };
        thumb.addEventListener('pointermove', move);
        thumb.addEventListener('pointerup', up);
    });
    bar.addEventListener('pointerdown', e => {
        if (e.target !== bar || !VE.ready) return;
        const r = bar.getBoundingClientRect();
        VE.view = (e.clientX - r.left) / r.width * VE.dur - veVisibleDur() / 2;
        veClampView();
        veDraw();
    });

    // lista de clipes
    $ve('ve-clips').addEventListener('click', e => {
        const act = e.target.closest('[data-act]');
        if (act) {
            const i = +act.dataset.act;
            const off = !VE.clips[i].off;
            veSetOff(i, off);
            return;
        }
        const row = e.target.closest('.ve-clip');
        if (row) {
            const i = +row.dataset.i;
            VE.sel = i;
            veSeek(VE.clips[i].s);
            veRenderClips();
        }
    });

    // pílulas do modal
    document.querySelectorAll('#ve-export .ve-pills').forEach(group => {
        group.addEventListener('click', e => {
            const b = e.target.closest('.ve-pill');
            if (!b) return;
            group.querySelectorAll('.ve-pill').forEach(p => p.classList.toggle('active', p === b));
            veUpdateExportSummary();
        });
    });
    $ve('ve-res').addEventListener('change', veUpdateExportSummary);

    // arrastar e soltar (visual; o caminho real chega pelo Python)
    const screen = $ve('ve-screen');
    ['dragenter', 'dragover'].forEach(n => screen.addEventListener(n, e => { e.preventDefault(); screen.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(n => screen.addEventListener(n, () => screen.classList.remove('drag-over')));
    document.addEventListener('dragover', e => { if (veIsActive()) e.preventDefault(); });
    document.addEventListener('drop', e => { if (veIsActive()) e.preventDefault(); });

    new ResizeObserver(() => {
        if (VE.ready) {
            const fit = veFitPps();
            if (VE.pps < fit) VE.pps = fit;
            veClampView();
            veSyncZoomSlider();
        }
        veDraw();
    }).observe(wrap);

    document.addEventListener('keydown', veOnKey);
    // Botões não ficam com foco (senão o Espaço "clica" neles em vez de dar play)
    $ve('ve').addEventListener('mouseup', e => {
        const b = e.target.closest('button');
        if (b) setTimeout(() => b.blur(), 0);
    });
}

function veOnKey(e) {
    if (!veIsActive()) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (tag === 'textarea' || tag === 'select') return;
    if (!$ve('ve-export').hidden) {
        if (e.key === 'Escape') veCloseExport();
        return;
    }
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && k === 'o') { e.preventDefault(); veOpenFile(); return; }
    if (!VE.ready) return;
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); veUndo(); return; }
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); veRedo(); return; }
    if (ctrl && k === 'k') { e.preventDefault(); veSplitAtPlayhead(); return; }
    if (ctrl && k === 'e') { e.preventDefault(); veOpenExport(); return; }
    if (ctrl) return;

    const map = {
        ' ': () => veTogglePlay(),
        'k': () => { veVideo().pause(); veSetRate(1); },
        'l': () => {
            const v = veVideo();
            if (v.paused) { veSetRate(1); veTogglePlay(); }
            else veSetRate({ 1: 1.5, 1.5: 2, 2: 4, 4: 4 }[VE.rate] || 1);
        },
        'j': () => veSeek(VE.playhead - 5),
        'arrowleft': () => e.shiftKey ? veSeek(VE.playhead - 1) : veStepFrames(-1),
        'arrowright': () => e.shiftKey ? veSeek(VE.playhead + 1) : veStepFrames(1),
        'arrowup': () => veJumpEdit(-1),
        'arrowdown': () => veJumpEdit(1),
        'home': () => veSeek(0),
        'end': () => veSeek(VE.dur),
        's': () => veSplitAtPlayhead(),
        'delete': () => veDeleteSelected(),
        'backspace': () => veDeleteSelected(),
        'i': () => veMarkIn(),
        'o': () => veMarkOut(),
        'x': () => veExtractInOut(),
        'q': () => veRemoveBefore(),
        'w': () => veRemoveAfter(),
        'v': () => veSetTool('select'),
        'c': () => veSetTool('razor'),
        'h': () => veSetTool('hand'),
        'n': () => veToggleSnap(),
        'm': () => veToggleMute(),
        '+': () => veZoomBy(1.5),
        '=': () => veZoomBy(1.5),
        '-': () => veZoomBy(1 / 1.5),
        '\\': () => veZoomFit(),
        'escape': () => { VE.sel = -1; veRenderClips(); veDraw(); },
    };
    const fn = map[k];
    if (fn) { e.preventDefault(); fn(); }
}

// Modo foco: ao entrar no editor, esconde o banner do topo para ganhar espaço
(function veHookSwitchTool() {
    const orig = window.switchTool;
    if (typeof orig !== 'function') return;
    window.switchTool = function (toolId) {
        if (VE.playing && toolId !== 'video-cutter') veVideo().pause();
        orig(toolId);
        document.body.classList.toggle('ve-focus', toolId === 'video-cutter');
        if (toolId === 'video-cutter') setTimeout(() => { if (VE.ready) veSyncZoomSlider(); veDraw(); }, 30);
    };
    switchTool = window.switchTool;
})();

document.addEventListener('DOMContentLoaded', () => {
    veInitEvents();
    veSetTool('select');
    veDraw();
});

window.veOnPrepare = veOnPrepare;
window.veOnExport = veOnExport;
window.veOpenPath = veOpenPath;
