// =========================================================
// Pocket Editor — editor de vídeo do Canivete do Pailer
// Modelo (igual à sequência do Premiere): uma lista de clipes em ordem,
// cada um apontando para um trecho do vídeo original [{s, e}] (tempo da fonte).
// Na timeline os clipes ficam colados; remover um trecho fecha o buraco (ripple).
// "Tempo da sequência" = posição na timeline; "tempo da fonte" = posição no arquivo.
// =========================================================

const VE = {
    path: null,
    info: null,
    srcDur: 0,          // duração do arquivo original
    dur: 0,             // duração da sequência (soma dos clipes)
    fps: 30,
    clips: [],          // [{s, e}] em tempo da fonte, na ordem da sequência
    lay: [],            // [{ts, te}] posição de cada clipe na sequência (derivado)
    sel: -1,            // índice do clipe selecionado
    inPt: null,
    outPt: null,
    playhead: 0,        // tempo da sequência
    playIdx: 0,         // clipe tocando agora
    pps: 50,            // pixels por segundo
    view: 0,            // tempo na borda esquerda
    vs: 0,              // rolagem vertical das trilhas (px)
    tool: 'select',
    snap: true,
    history: [],
    future: [],
    thumbs: [],         // [{t, url, img}] (tempo da fonte)
    peaks: [],          // picos de áudio ao longo da fonte
    playing: false,
    rate: 1,
    muted: false,
    ready: false,
    dest: null,
    hoverX: null,
    drag: null,
    exportRunning: false,
    lastOutput: null,
};

const VE_RULER = 28;
const VE_MAX_PPS = 600;
const VE_TRACK_MIN = 22, VE_TRACK_MAX = 220;
const $ve = id => document.getElementById(id);

// Trilhas como no Premiere: V4..V1 em cima, A1..A4 embaixo. O conteúdo fica em V1/A1 (vinculados).
const VE_TRACKS = [
    { id: 'V4', kind: 'v', h: 24 }, { id: 'V3', kind: 'v', h: 24 }, { id: 'V2', kind: 'v', h: 24 },
    { id: 'V1', kind: 'v', h: 76, main: true },
    { id: 'A1', kind: 'a', h: 60, main: true },
    { id: 'A2', kind: 'a', h: 24 }, { id: 'A3', kind: 'a', h: 24 }, { id: 'A4', kind: 'a', h: 24 },
];

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

function veLsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function veLsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

// ─────────────────────────── modelo (sequência) ───────────────────────────

function veRelayout() {
    let t = 0;
    VE.lay = VE.clips.map(c => { const o = { ts: t, te: t + (c.e - c.s) }; t = o.te; return o; });
    VE.dur = t;
    if (VE.sel >= VE.clips.length) VE.sel = -1;
    VE.playhead = Math.min(VE.playhead, VE.dur);
}

function veClipAt(t) {
    const n = VE.lay.length;
    for (let i = 0; i < n; i++) {
        const l = VE.lay[i];
        if (t >= l.ts && (t < l.te || (i === n - 1 && t <= l.te))) return i;
    }
    return n ? n - 1 : -1;
}

// tempo da sequência -> {i, src}
function veSrcAt(t) {
    const i = veClipAt(t);
    if (i < 0) return { i: -1, src: 0 };
    return { i, src: VE.clips[i].s + (t - VE.lay[i].ts) };
}

function veEditPoints() {
    const pts = new Set([0, VE.dur]);
    VE.lay.forEach(l => { pts.add(l.ts); pts.add(l.te); });
    return [...pts].sort((a, b) => a - b);
}

function veSnapshot() { return JSON.stringify({ clips: VE.clips, inPt: VE.inPt, outPt: VE.outPt, playhead: VE.playhead }); }

function vePushHistory() {
    VE.history.push(veSnapshot());
    if (VE.history.length > 200) VE.history.shift();
    VE.future = [];
    veUpdateUndo();
}

function veRestore(snap) {
    const d = JSON.parse(snap);
    VE.clips = d.clips; VE.inPt = d.inPt; VE.outPt = d.outPt;
    VE.sel = -1;
    veRelayout();
    veAfterEdit(VE.playhead);   // como no Premiere, desfazer não mexe na agulha
}

function veUndo() {
    if (!VE.history.length) return;
    VE.future.push(veSnapshot());
    veRestore(VE.history.pop());
    veUpdateUndo();
    veToast('Desfeito');
}

function veRedo() {
    if (!VE.future.length) return;
    VE.history.push(veSnapshot());
    veRestore(VE.future.pop());
    veUpdateUndo();
    veToast('Refeito');
}

function veUpdateUndo() {
    $ve('ve-undo').disabled = !VE.history.length;
    $ve('ve-redo').disabled = !VE.future.length;
}

// Depois de qualquer edição: reencaixa zoom/visão, reposiciona a agulha e redesenha
function veAfterEdit(playhead) {
    const fit = veFitPps();
    if (VE.pps < fit) VE.pps = fit;
    veClampView();
    veSyncZoomSlider();
    veSeek(playhead != null ? playhead : VE.playhead);
    veRefresh();
}

// Fatia todas as trilhas no ponto (cortar = dividir, nunca apagar)
function veSplitAt(t, quiet) {
    if (!VE.ready) return false;
    t = veSnapFrame(veClamp(t));
    const i = veClipAt(t);
    if (i < 0) return false;
    const c = VE.clips[i], l = VE.lay[i];
    if (t - l.ts < veFrame() * 0.99 || l.te - t < veFrame() * 0.99) {
        if (!quiet) veToast('Já existe um corte aqui');
        return false;
    }
    vePushHistory();
    const src = c.s + (t - l.ts);
    VE.clips.splice(i, 1, { s: c.s, e: src }, { s: src, e: c.e });
    if (VE.sel > i) VE.sel++;
    veRelayout();
    veRefresh();
    return true;
}

function veSplitAtPlayhead() {
    if (veSplitAt(VE.playhead)) veToast('Cortado em ' + veShort(VE.playhead));
}

// Remove um trecho da sequência e fecha o buraco (ripple). A agulha vai para o ponto do corte.
function veRippleRemove(a, b, label) {
    if (!VE.ready) return false;
    a = veSnapFrame(veClamp(Math.min(a, b)));
    b = veSnapFrame(veClamp(Math.max(a, b)));
    if (b - a < veFrame() * 0.5) return false;
    if (VE.dur - (b - a) < veFrame()) { veToast('Isso removeria o vídeo inteiro'); return false; }
    vePushHistory();
    const tiny = veFrame() * 0.5;
    const out = [];
    VE.clips.forEach((c, i) => {
        const { ts, te } = VE.lay[i];
        if (te <= a || ts >= b) { out.push({ ...c }); return; }
        if (ts < a && a - ts > tiny) out.push({ s: c.s, e: c.s + (a - ts) });
        if (te > b && te - b > tiny) out.push({ s: c.s + (b - ts), e: c.e });
    });
    VE.clips = out;
    VE.sel = -1;
    // marcas In/Out que caíam no trecho removido deixam de valer
    VE.inPt = VE.outPt = null;
    veRelayout();
    veAfterEdit(a);
    if (label) veToast(label);
    return true;
}

// D / Delete: apaga o clipe selecionado e fecha o buraco
function veDeleteSelected() {
    if (VE.sel < 0) { veToast('Selecione um clipe na timeline'); return; }
    const l = VE.lay[VE.sel];
    veRippleRemove(l.ts, l.te, 'Clipe apagado');
}

function veDeleteClip(i) {
    if (i < 0 || i >= VE.clips.length) return;
    const l = VE.lay[i];
    veRippleRemove(l.ts, l.te, 'Clipe apagado');
}

// Arrastar clipe: onde ele entra se o início for solto em `start` (tempo da sequência).
// Retorna o índice de inserção na lista sem o clipe (encaixa no corte mais próximo).
function veMoveTarget(i, start) {
    let t = 0, best = 0, bd = Infinity, k = 0;
    const pts = [0];
    VE.clips.forEach((c, j) => { if (j !== i) { t += c.e - c.s; pts.push(t); } });
    for (k = 0; k < pts.length; k++) {
        const d = Math.abs(pts[k] - start);
        if (d < bd) { bd = d; best = k; }
    }
    return best;
}

// Ordem de exibição durante o arraste (prévia do resultado)
function veMoveOrder(i, k) {
    const idx = VE.clips.map((_, j) => j).filter(j => j !== i);
    idx.splice(k, 0, i);
    return idx;
}

function veMoveClip(i, k) {
    const order = veMoveOrder(i, k);
    if (order.every((j, pos) => j === pos)) { veDraw(); return; }   // soltou no mesmo lugar
    vePushHistory();
    VE.clips = order.map(j => VE.clips[j]);
    VE.sel = order.indexOf(i);
    veRelayout();
    veAfterEdit(VE.playhead);
    veToast(`Clipe movido para a posição ${VE.sel + 1}`);
}

// Q: apaga do início do clipe sob a agulha até a agulha (ripple trim, como no Premiere)
function veRippleTrimStart() {
    const t = veSnapFrame(VE.playhead);
    const i = veClipAt(t);
    if (i < 0) return;
    const p = VE.lay[i].ts;
    if (t - p < veFrame() * 0.5) { veToast('A agulha já está no início do clipe'); return; }
    veRippleRemove(p, t, 'Removido até a agulha');
}

// W: apaga da agulha até o fim do clipe sob a agulha
function veRippleTrimEnd() {
    const t = veSnapFrame(VE.playhead);
    const i = veClipAt(t);
    if (i < 0) return;
    const n = VE.lay[i].te;
    if (n - t < veFrame() * 0.5) { veToast('A agulha já está no fim do clipe'); return; }
    veRippleRemove(t, n, 'Removido depois da agulha');
}

function veExtractInOut() {
    if (VE.inPt == null || VE.outPt == null) { veToast('Marque entrada (I) e saída (O) primeiro'); return; }
    veRippleRemove(VE.inPt, VE.outPt, 'Trecho In→Out removido');
}

function veResetEdits() {
    if (!VE.ready) return;
    vePushHistory();
    VE.clips = [{ s: 0, e: VE.srcDur }];
    VE.sel = -1;
    VE.inPt = VE.outPt = null;
    veRelayout();
    veAfterEdit(0);
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
    const { i, src } = veSrcAt(VE.playhead);
    VE.playIdx = Math.max(0, i);
    const v = veVideo();
    if (!fromPlayer && v && v.src && Math.abs(v.currentTime - src) > 0.001) {
        try { v.currentTime = src; } catch (e) { /* ainda carregando */ }
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

function veTogglePlay() {
    if (!VE.ready) return;
    const v = veVideo();
    if (!v.src) return;
    if (v.paused) {
        if (VE.playhead >= VE.dur - veFrame()) veSeek(0);
        else veSeek(VE.playhead);
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
    $ve('ve-mute').innerHTML = `<svg class="i"><use href="#i-${VE.muted ? 'volume-x' : 'volume'}"/></svg>`;
}

// Posição na sequência a partir do tempo atual do player (dentro do clipe que está tocando)
function veSeqFromPlayer() {
    const c = VE.clips[VE.playIdx], l = VE.lay[VE.playIdx];
    if (!c) return VE.playhead;
    const ct = Math.min(Math.max(veVideo().currentTime, c.s), c.e);
    return l.ts + (ct - c.s);
}

function vePlaybackLoop() {
    if (!VE.playing) return;
    const v = veVideo();
    let c = VE.clips[VE.playIdx];
    if (c && v.currentTime >= c.e - 0.004) {
        // fim do clipe: pula para o próximo (os trechos removidos nunca aparecem)
        const next = VE.clips[VE.playIdx + 1];
        if (!next) { v.pause(); veSeek(VE.dur); return; }
        VE.playIdx++;
        if (Math.abs(next.s - c.e) > 0.004) v.currentTime = next.s;
        c = next;
    }
    VE.playhead = veClamp(veSeqFromPlayer());
    veFollowPlayhead(true);
    veUpdateReadouts();
    veDraw();
    requestAnimationFrame(vePlaybackLoop);
}

// ─────────────────────────── visão / zoom ───────────────────────────

function veCanvasWidth() { return $ve('ve-tl-wrap').clientWidth || 800; }
function veCanvasHeight() { return $ve('ve-tl-wrap').clientHeight || 200; }
function veFitPps() { return VE.dur > 0 ? (veCanvasWidth() - 16) / VE.dur : 50; }
function veVisibleDur() { return veCanvasWidth() / VE.pps; }

function veClampView() {
    const maxView = Math.max(0, VE.dur - veVisibleDur() + 8 / VE.pps);
    VE.view = Math.min(Math.max(VE.view, 0), maxView);
}

function veTracksHeight() { return VE_TRACKS.reduce((a, tr) => a + tr.h, 0); }

function veClampVScroll() {
    const max = Math.max(0, veTracksHeight() - (veCanvasHeight() - VE_RULER));
    VE.vs = Math.min(Math.max(VE.vs, 0), max);
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

// ─────────────────────────── trilhas (cabeçalhos e tamanhos) ───────────────────────────

function veLoadLayout() {
    try {
        const hs = JSON.parse(veLsGet('ve-track-h') || 'null');
        if (Array.isArray(hs) && hs.length === VE_TRACKS.length) {
            hs.forEach((h, i) => { VE_TRACKS[i].h = Math.min(Math.max(+h || VE_TRACKS[i].h, VE_TRACK_MIN), VE_TRACK_MAX); });
        }
    } catch (e) {}
    const tlh = +veLsGet('ve-tl-h');
    if (tlh) veSetTimelineHeight(tlh, true);
}

function veBuildHeads() {
    const box = $ve('ve-heads-rows');
    if (!box) return;
    box.innerHTML = VE_TRACKS.map((tr, i) => `
        <div class="ve-head ve-head-${tr.kind}${tr.main ? ' main' : ''}" data-tr="${i}" style="height:${tr.h}px">
            <b>${tr.id}</b>${tr.main && tr.h >= 40 ? `<span>${tr.kind === 'v' ? 'Vídeo' : 'Áudio'}</span>` : ''}
            <i class="ve-head-grip" data-grip="${i}" title="Arraste para aumentar ou diminuir a trilha"></i>
        </div>`).join('');
}

function veSyncHeads() {
    const box = $ve('ve-heads-rows');
    if (box) box.style.transform = `translateY(${-VE.vs}px)`;
}

// Geometria das trilhas no canvas (y já descontada a rolagem vertical)
function veTrackRows() {
    let y = VE_RULER - VE.vs;
    return VE_TRACKS.map(tr => { const r = { ...tr, y, h: tr.h }; y += tr.h; return r; });
}

function veRowAt(y) {
    if (y <= VE_RULER) return null;
    return veTrackRows().find(r => y >= r.y && y < r.y + r.h) || null;
}

function veSetTimelineHeight(h, silent) {
    const ve = $ve('ve');
    if (!ve) return;
    const max = Math.max(160, ve.clientHeight - 46 - 180);
    h = Math.min(Math.max(h, 120), max || 900);
    ve.style.setProperty('--ve-tl-h', h + 'px');
    if (!silent) veLsSet('ve-tl-h', String(Math.round(h)));
}

// ─────────────────────────── desenho ───────────────────────────

let veDrawQueued = false;
function veDraw() {
    if (veDrawQueued) return;
    veDrawQueued = true;
    requestAnimationFrame(() => { veDrawQueued = false; veRender(); });
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
    veClampVScroll();
    veSyncHeads();
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, W, H);

    const rows = veTrackRows();
    const rV = rows.find(r => r.id === 'V1'), rA = rows.find(r => r.id === 'A1');

    // trilhas (fundo) — área abaixo da régua
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VE_RULER, W, H - VE_RULER); ctx.clip();
    rows.forEach(r => {
        ctx.fillStyle = r.main ? '#141414' : '#101010';
        ctx.fillRect(0, r.y, W, r.h);
        ctx.fillStyle = '#1f1f1f';
        ctx.fillRect(0, r.y + r.h - 1, W, 1);
    });
    // divisória entre vídeo e áudio
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(0, rA.y - 1, W, 2);
    ctx.restore();

    // régua
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, W, VE_RULER);
    ctx.fillStyle = '#262626';
    ctx.fillRect(0, VE_RULER - 1, W, 1);

    if (!VE.ready) {
        ctx.fillStyle = '#4a4a4a';
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('A timeline aparece aqui quando você abrir um vídeo', W / 2, rV.y + rV.h / 2 + 4);
        ctx.textAlign = 'left';
        veUpdateScrollbar();
        return;
    }

    const X = t => (t - VE.view) * VE.pps;
    const t0 = VE.view, t1 = VE.view + W / VE.pps;

    // ticks
    const major = veNiceStep(90 / VE.pps);
    const minor = major / (major >= 1 ? 5 : 2);
    ctx.fillStyle = '#333';
    for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
        const x = Math.round(X(t)) + 0.5;
        ctx.fillRect(x, VE_RULER - 6, 1, 5);
    }
    ctx.font = '10.5px Cascadia Mono, Consolas, monospace';
    for (let t = Math.floor(t0 / major) * major; t <= t1; t += major) {
        const x = Math.round(X(t)) + 0.5;
        ctx.fillStyle = '#555';
        ctx.fillRect(x, 6, 1, VE_RULER - 7);
        ctx.fillStyle = '#9a9a9a';
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

    // clipes (V1 + A1 vinculados)
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VE_RULER, W, H - VE_RULER); ctx.clip();
    const n = VE.peaks.length;
    // Lista a desenhar: normalmente a sequência; ao arrastar um clipe, a prévia com ele na nova posição
    const mv = VE.drag && VE.drag.mode === 'move' && VE.drag.active ? VE.drag : null;
    const order = mv ? veMoveOrder(mv.i, mv.k) : VE.clips.map((_, j) => j);
    let acc = 0;
    const items = order.map((j, pos) => {
        const c = VE.clips[j], it = { c, i: j, pos, ts: acc, te: acc + (c.e - c.s), ghost: mv && j === mv.i };
        acc = it.te;
        return it;
    });
    items.forEach(({ c, i, pos, ts, te, ghost }) => {
        const x1 = X(ts), x2 = X(te);
        if (x2 < -2 || x1 > W + 2) return;
        const cx = Math.max(x1, -4) + 1, cw = Math.min(x2, W + 4) - Math.max(x1, -4) - 2;
        if (cw <= 0) return;
        const srcAt = x => c.s + (VE.view + x / VE.pps - ts);   // x do canvas -> tempo da fonte
        ctx.globalAlpha = ghost ? 0.7 : 1;

        // ---- vídeo
        const vy = rV.y + 3, vh = rV.h - 6;
        ctx.save();
        veRoundRect(ctx, cx, vy, cw, vh, 4);
        ctx.clip();
        ctx.fillStyle = '#27305f';
        ctx.fillRect(cx, vy, cw, vh);
        const th = vh - 16;
        const img0 = VE.thumbs.find(tb => tb.img && tb.img.complete && tb.img.naturalWidth);
        if (img0 && th > 10) {
            const tw = th * (img0.img.naturalWidth / img0.img.naturalHeight);
            for (let x = x1; x < cx + cw; x += tw) {
                if (x + tw < cx) continue;
                const tb = veThumbFor(srcAt(x + tw / 2));
                if (tb) ctx.drawImage(tb.img, x, vy + 14, tw, th);
            }
        }
        ctx.fillStyle = 'rgba(91,110,225,0.18)';
        ctx.fillRect(cx, vy, cw, vh);
        ctx.fillStyle = '#5b6ee1';
        ctx.fillRect(cx, vy, cw, Math.min(14, vh));
        if (cw > 50 && vh >= 14) {
            ctx.fillStyle = '#eef0ff';
            ctx.font = '600 10.5px Segoe UI';
            ctx.fillText(`Clipe ${pos + 1}` + (cw > 150 ? '  ·  ' + veShort(te - ts) : ''), cx + 6, vy + 10.5);
        }
        ctx.restore();

        // ---- áudio
        const ay = rA.y + 3, ah = rA.h - 6;
        ctx.save();
        veRoundRect(ctx, cx, ay, cw, ah, 4);
        ctx.clip();
        ctx.fillStyle = '#163a2b';
        ctx.fillRect(cx, ay, cw, ah);
        if (n && VE.info && VE.info.has_audio) {
            const mid = ay + ah / 2, amp = ah / 2 - 3;
            ctx.fillStyle = '#43c58f';
            const xa = Math.max(cx, 0), xb = Math.min(cx + cw, W);
            for (let x = xa; x < xb; x += 2) {
                const sa = srcAt(x), sb = srcAt(x + 2);
                const ia = Math.floor(sa / VE.srcDur * n), ib = Math.max(ia + 1, Math.ceil(sb / VE.srcDur * n));
                let pk = 0;
                for (let k = Math.max(0, ia); k < Math.min(n, ib); k++) pk = Math.max(pk, VE.peaks[k]);
                const h = Math.max(1, pk * amp);
                ctx.fillRect(x, mid - h, 1.4, h * 2);
            }
        } else if (VE.info && !VE.info.has_audio) {
            ctx.fillStyle = '#4a4a4a';
            ctx.font = '11px Segoe UI';
            if (cw > 80) ctx.fillText('sem áudio', cx + 8, ay + ah / 2 + 4);
        }
        ctx.restore();

        ctx.globalAlpha = 1;

        // seleção (o clipe sendo arrastado ganha contorno tracejado)
        if (i === VE.sel || ghost) {
            ctx.strokeStyle = '#F97316';
            ctx.lineWidth = 2;
            if (ghost) ctx.setLineDash([5, 3]);
            veRoundRect(ctx, cx, vy, cw, vh, 4); ctx.stroke();
            veRoundRect(ctx, cx, ay, cw, ah, 4); ctx.stroke();
            ctx.setLineDash([]);
        }
    });
    // marcador de inserção (onde o clipe arrastado entra)
    if (mv) {
        const g = items.find(it => it.ghost);
        const gx = Math.round(X(g.ts)) + 0.5;
        ctx.fillStyle = '#F97316';
        ctx.fillRect(gx - 1, rV.y, 2, rA.y + rA.h - rV.y);
        ctx.beginPath(); ctx.moveTo(gx - 6, rV.y); ctx.lineTo(gx + 6, rV.y); ctx.lineTo(gx, rV.y + 7); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(gx - 6, rA.y + rA.h); ctx.lineTo(gx + 6, rA.y + rA.h); ctx.lineTo(gx, rA.y + rA.h - 7); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

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
    $ve('ve-tc-total').textContent = veTC(VE.dur);
}

function veRenderClips() {
    const box = $ve('ve-clips');
    if (!VE.ready) return;
    $ve('ve-sum-orig').textContent = veHuman(VE.srcDur);
    $ve('ve-sum-final').textContent = veHuman(VE.dur);
    $ve('ve-sum-cut').textContent = veHuman(Math.max(0, VE.srcDur - VE.dur));

    if (VE.clips.length === 1 && VE.clips[0].s < 1e-3 && Math.abs(VE.clips[0].e - VE.srcDur) < 1e-3) {
        box.innerHTML = '<div class="ve-clips-empty">Nenhum corte ainda.<br>Aperte <b>\'</b> (ou <b>S</b>) para cortar na agulha. <b>Q</b> / <b>W</b> apagam antes / depois da agulha até o corte mais próximo.<br>Selecione um clipe e aperte <b>D</b> para apagá-lo.</div>';
        return;
    }
    box.innerHTML = VE.clips.map((c, i) => `
        <div class="ve-clip${i === VE.sel ? ' sel' : ''}" data-i="${i}">
            <div class="ve-clip-bar"></div>
            <div>
                <div class="ve-clip-name">Clipe ${i + 1}</div>
                <div class="ve-clip-time">${veShort(VE.lay[i].ts)} → ${veShort(VE.lay[i].te)} · ${veShort(c.e - c.s)}</div>
            </div>
            <button class="ve-clip-act" data-act="${i}" title="Apagar clipe (D)"><svg class="i"><use href="#i-trash"/></svg></button>
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
    veToast(VE.snap ? 'Ímã ligado' : 'Ímã desligado');
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
        path, info: null, dur: 0, srcDur: 0, clips: [], lay: [], sel: -1, inPt: null, outPt: null, playhead: 0,
        playIdx: 0, history: [], future: [], thumbs: [], peaks: [], ready: false, dest: null, view: 0,
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
            VE.srcDur = ev.duration;
            VE.fps = ev.fps || 30;
            VE.clips = [{ s: 0, e: VE.srcDur }];
            veRelayout();
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
            $ve('ve-meta').textContent = ev.error || 'Erro ao abrir o vídeo';
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
    const fmt = vePill('format') || 'mp4';
    const res = $ve('ve-res').value;
    const h = res === 'original' ? VE.info.height : +res;
    const w = res === 'original' ? VE.info.width : Math.round(VE.info.width * h / VE.info.height / 2) * 2;
    $ve('ve-export-summary').innerHTML =
        `Duração final: <b>${veTC(VE.dur)}</b> (${veHuman(VE.dur)})<br>` +
        `Clipes: <b>${VE.clips.length}</b> · Resolução: <b>${w}×${h}</b> · <b>${fmt.toUpperCase()}</b>`;
}

function veExportFoot(mode) {
    const foot = $ve('ve-export-foot');
    if (mode === 'form') {
        foot.innerHTML = '<button class="ve-btn ve-btn-ghost" onclick="veCloseExport()">Cancelar</button>' +
            '<button class="ve-btn ve-btn-primary" onclick="veStartExport()"><svg class="i"><use href="#i-download"/></svg> Exportar</button>';
    } else if (mode === 'running') {
        foot.innerHTML = '<button class="ve-btn" onclick="veCancelExport()"><svg class="i"><use href="#i-x"/></svg> Cancelar exportação</button>';
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
    // Os clipes da sequência já estão na ordem do vídeo; trechos colados são unidos no Python
    const segs = VE.clips.map(c => ({ start: c.s, end: c.e }));
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
        box.innerHTML = `<b>${veEsc(ev.output_path.split(/[\\/]/).pop())}</b><br>` +
            `<span class="ve-exp-sub">${veHuman(ev.duration)} · ${mb}</span>` +
            '<div class="ve-exp-actions">' +
            '<button class="ve-btn ve-btn-primary ve-btn-sm" onclick="window.pywebview.api.open_file(VE.lastOutput)"><svg class="i"><use href="#i-play"/></svg> Assistir</button>' +
            '<button class="ve-btn ve-btn-sm" onclick="window.pywebview.api.reveal_file(VE.lastOutput)"><svg class="i"><use href="#i-folder"/></svg> Mostrar na pasta</button></div>';
        if (typeof playConcluido === 'function') playConcluido();
    } else {
        box.className = 've-exp-result err';
        box.textContent = ev.cancelled ? 'Exportação cancelada.' : (ev.error || 'Erro ao exportar.');
        $ve('ve-exp-msg').textContent = ev.cancelled ? 'Cancelado' : 'Falhou';
    }
    veExportFoot('done');
}

// ─────────────────────────── zoom do monitor ───────────────────────────
// mz = escala relativa ao Fit (1 = imagem inteira na tela, sem cortar). mx/my = deslocamento em px.

const VE_MZ_MIN = 0.25, VE_MZ_MAX = 16;
const VEM = { mz: 1, mx: 0, my: 0, pan: null, panned: false };

function veFitScale() {
    const v = veVideo(), scr = $ve('ve-screen');
    if (!v.videoWidth || !scr.clientWidth) return 1;
    return Math.min(scr.clientWidth / v.videoWidth, scr.clientHeight / v.videoHeight);
}

function veClampMonitorPan() {
    const v = veVideo(), scr = $ve('ve-screen');
    const f = veFitScale();
    const dispW = (v.videoWidth || scr.clientWidth) * f * VEM.mz;
    const dispH = (v.videoHeight || scr.clientHeight) * f * VEM.mz;
    const mxMax = Math.max(0, (dispW - scr.clientWidth) / 2);
    const myMax = Math.max(0, (dispH - scr.clientHeight) / 2);
    VEM.mx = Math.min(Math.max(VEM.mx, -mxMax), mxMax);
    VEM.my = Math.min(Math.max(VEM.my, -myMax), myMax);
}

function veApplyMonitor() {
    veClampMonitorPan();
    const v = veVideo();
    v.style.transform = VEM.mz === 1 && !VEM.mx && !VEM.my ? '' : `translate(${VEM.mx}px, ${VEM.my}px) scale(${VEM.mz})`;
    const fit = Math.abs(VEM.mz - 1) < 1e-3;
    $ve('ve-mz-val').textContent = fit ? 'Fit' : Math.round(veFitScale() * VEM.mz * 100) + '%';
    $ve('ve-mz-fit').classList.toggle('active', fit);
    $ve('ve-screen').classList.toggle('zoomed', VEM.mz > 1.001);
}

function veMonitorFit() { VEM.mz = 1; VEM.mx = VEM.my = 0; veApplyMonitor(); }

// zoom absoluto (1 = 100% dos pixels do vídeo)
function veMonitorZoomTo(scale) {
    VEM.mz = Math.min(Math.max(scale / veFitScale(), VE_MZ_MIN), VE_MZ_MAX);
    VEM.mx = VEM.my = 0;
    veApplyMonitor();
}

// Ctrl+roda: zoom mantendo fixo o ponto sob o cursor
function veMonitorWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const scr = $ve('ve-screen').getBoundingClientRect();
    const px = e.clientX - (scr.left + scr.width / 2), py = e.clientY - (scr.top + scr.height / 2);
    const lx = (px - VEM.mx) / VEM.mz, ly = (py - VEM.my) / VEM.mz;
    let mz = VEM.mz * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
    if (Math.abs(mz - 1) < 0.07) mz = 1;          // encaixa no Fit ao passar por ele
    VEM.mz = Math.min(Math.max(mz, VE_MZ_MIN), VE_MZ_MAX);
    VEM.mx = px - lx * VEM.mz;
    VEM.my = py - ly * VEM.mz;
    if (VEM.mz <= 1) { VEM.mx = VEM.my = 0; }
    veApplyMonitor();
}

function veInitMonitorZoom() {
    const scr = $ve('ve-screen');
    scr.addEventListener('wheel', veMonitorWheel, { passive: false });
    // arrastar para mover a imagem quando ampliada (sem disparar o play/pausa do clique)
    scr.addEventListener('pointerdown', e => {
        if (VEM.mz <= 1.001 || e.button !== 0 || e.target.closest('button')) return;
        VEM.pan = { x0: e.clientX, y0: e.clientY, mx0: VEM.mx, my0: VEM.my, id: e.pointerId };
        VEM.panned = false;
    });
    scr.addEventListener('pointermove', e => {
        if (!VEM.pan) return;
        const dx = e.clientX - VEM.pan.x0, dy = e.clientY - VEM.pan.y0;
        if (!VEM.panned && Math.hypot(dx, dy) < 4) return;
        if (!VEM.panned) { VEM.panned = true; scr.setPointerCapture(VEM.pan.id); scr.classList.add('panning'); }
        VEM.mx = VEM.pan.mx0 + dx;
        VEM.my = VEM.pan.my0 + dy;
        veApplyMonitor();
    });
    const end = () => { VEM.pan = null; scr.classList.remove('panning'); setTimeout(() => { VEM.panned = false; }, 0); };
    scr.addEventListener('pointerup', end);
    scr.addEventListener('pointercancel', end);
    new ResizeObserver(() => veApplyMonitor()).observe(scr);
    veVideo().addEventListener('loadedmetadata', veMonitorFit);
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

function veInitResizers() {
    // Altura da timeline: arrastar a borda superior do painel (como no Premiere)
    const grip = $ve('ve-tl-resize');
    grip.addEventListener('pointerdown', e => {
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        const y0 = e.clientY, h0 = $ve('ve-tl-body').getBoundingClientRect().height;
        document.body.classList.add('ve-resizing-y');
        const move = ev => { veSetTimelineHeight(h0 - (ev.clientY - y0), true); veDraw(); };
        const up = () => {
            grip.removeEventListener('pointermove', move);
            grip.removeEventListener('pointerup', up);
            document.body.classList.remove('ve-resizing-y');
            veSetTimelineHeight($ve('ve-tl-body').getBoundingClientRect().height);
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', () => { $ve('ve').style.removeProperty('--ve-tl-h'); veLsSet('ve-tl-h', ''); veDraw(); });

    // Altura de cada trilha: arrastar a borda inferior do cabeçalho (V1, A1...)
    $ve('ve-heads-rows').addEventListener('pointerdown', e => {
        const g = e.target.closest('[data-grip]');
        if (!g) return;
        e.preventDefault();
        const i = +g.dataset.grip, tr = VE_TRACKS[i];
        g.setPointerCapture(e.pointerId);
        const y0 = e.clientY, h0 = tr.h;
        document.body.classList.add('ve-resizing-y');
        const move = ev => {
            tr.h = Math.round(Math.min(Math.max(h0 + (ev.clientY - y0), VE_TRACK_MIN), VE_TRACK_MAX));
            veBuildHeads();
            veDraw();
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            document.body.classList.remove('ve-resizing-y');
            veLsSet('ve-track-h', JSON.stringify(VE_TRACKS.map(t => t.h)));
        };
        // o cabeçalho é recriado durante o arraste, então os eventos ficam na janela
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    });
    // Duplo clique no cabeçalho: alterna trilha compacta / expandida
    $ve('ve-heads-rows').addEventListener('dblclick', e => {
        const row = e.target.closest('[data-tr]');
        if (!row) return;
        const tr = VE_TRACKS[+row.dataset.tr];
        tr.h = tr.h > 40 ? 24 : (tr.main ? (tr.kind === 'v' ? 76 : 60) : 60);
        veBuildHeads();
        veLsSet('ve-track-h', JSON.stringify(VE_TRACKS.map(t => t.h)));
        veDraw();
    });
    // Rolagem vertical pelos cabeçalhos
    $ve('ve-heads-rows').parentElement.addEventListener('wheel', e => {
        e.preventDefault();
        VE.vs += e.deltaY;
        veDraw();
    }, { passive: false });
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
        if (VE.ready) VE.playhead = veClamp(veSeqFromPlayer());
        veUpdateReadouts();
        veDraw();
    });
    v.addEventListener('ended', () => { VE.playing = false; $ve('ve-play').textContent = '▶'; });
    v.addEventListener('click', () => { if (!VEM.panned) veTogglePlay(); });
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
            VE.drag = { mode: 'pan', x0: e.clientX, y0: e.clientY, view0: VE.view, vs0: VE.vs };
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
        // seleção: clicar num clipe só seleciona (a agulha fica onde está — ela anda pela régua).
        // Segurar e arrastar move o clipe na sequência; clicar em área vazia desmarca.
        const row = veRowAt(y);
        const i = row && row.main && t >= 0 && t <= VE.dur ? veClipAt(t) : -1;
        VE.sel = i;
        if (i >= 0) VE.drag = { mode: 'move', i, x0: e.clientX, y0: e.clientY, grab: t - VE.lay[i].ts, active: false, k: i };
        veRenderClips();
        veDraw();
    });

    wrap.addEventListener('pointermove', e => {
        const { t, x } = veTimeFromEvent(e);
        VE.hoverX = x;
        if (!VE.drag) {
            if (VE.tool === 'razor') veDraw();
            return;
        }
        if (VE.drag.mode === 'move') {
            const d = VE.drag;
            if (!d.active) {
                if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;   // ainda é um clique
                d.active = true;
                if (VE.playing) v.pause();
                wrap.classList.add('moving');
            }
            // auto-rolagem nas bordas
            const w = veCanvasWidth();
            if (x > w - 24) { VE.view += 14 / VE.pps; veClampView(); }
            if (x < 24) { VE.view -= 14 / VE.pps; veClampView(); }
            d.k = veMoveTarget(d.i, veTimeFromEvent(e).t - d.grab);
            veDraw();
            return;
        }
        if (VE.drag.mode === 'pan') {
            VE.view = VE.drag.view0 - (e.clientX - VE.drag.x0) / VE.pps;
            VE.vs = VE.drag.vs0 - (e.clientY - VE.drag.y0);
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
        const d = VE.drag;
        VE.drag = null;
        wrap.classList.remove('dragging', 'scrub', 'moving');
        if (d && d.mode === 'move' && d.active) veMoveClip(d.i, d.k);
        else veDraw();
    };
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);
    wrap.addEventListener('pointerleave', () => { VE.hoverX = null; if (VE.tool === 'razor') veDraw(); });

    wrap.addEventListener('wheel', e => {
        e.preventDefault();
        const { x } = veTimeFromEvent(e);
        if (e.shiftKey) {                 // Shift+roda: rola as trilhas na vertical
            VE.vs += e.deltaY;
            veDraw();
            return;
        }
        if (!VE.ready) return;
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
        if (act) { veDeleteClip(+act.dataset.act); return; }
        const row = e.target.closest('.ve-clip');
        if (row) {
            const i = +row.dataset.i;
            VE.sel = i;
            veSeek(VE.lay[i].ts);
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

    veInitResizers();
    veInitMonitorZoom();
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

    // ' corta todas as trilhas na agulha. No teclado ABNT2 a tecla pode chegar como "Dead"
    // (layout internacional); nesse caso vale o código físico da tecla ao lado do 1.
    if (k === "'" || (k === 'dead' && e.code === 'Backquote')) { e.preventDefault(); veSplitAtPlayhead(); return; }

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
        'd': () => veDeleteSelected(),
        'delete': () => veDeleteSelected(),
        'backspace': () => veDeleteSelected(),
        'i': () => veMarkIn(),
        'o': () => veMarkOut(),
        'x': () => veExtractInOut(),
        'q': () => veRippleTrimStart(),
        'w': () => veRippleTrimEnd(),
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
    veLoadLayout();
    veBuildHeads();
    veInitEvents();
    veSetTool('select');
    veDraw();
});

window.veOnPrepare = veOnPrepare;
window.veOnExport = veOnExport;
window.veOpenPath = veOpenPath;
