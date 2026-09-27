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
    clips: [],          // [{tr, st, s, e, g}] trilha, início na timeline, trecho da fonte, ganho dB
    sel: -1,            // índice do clipe selecionado
    inPt: null,
    outPt: null,
    playhead: 0,        // tempo da sequência
    cur: -1,            // clipe que o player está mostrando (-1 = espaço vazio)
    media: [],          // [0] = vídeo aberto; imagens adicionadas depois
    projectPath: null,  // .vcnvt salvo/aberto
    dirty: false,       // alterações desde o último salvar
    seqW: 1920, seqH: 1080,   // tamanho do quadro da sequência (o do vídeo)
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
    fxHover: -1,        // clipe sob um efeito sendo arrastado do painel Efeitos
    exportRunning: false,
    lastOutput: null,
};

const VE_RULER = 28;
const VE_MAX_PPS = 3000;   // zoom máximo: ~100 px por quadro a 30 fps
const VE_TRACK_MIN = 22, VE_TRACK_MAX = 220;
// procura na janela principal e, se o painel estiver numa janela solta (editor-dock.js), nela
const $ve = id => document.getElementById(id) || (typeof vedFind === 'function' ? vedFind(id) : null);

// Trilhas como no Premiere: V4..V1 em cima, A1..A4 embaixo. O conteúdo fica em V1/A1 (vinculados).
const VE_TRACKS = [
    { id: 'LEG', kind: 'l', h: 26 },   // legendas (painel Texto), como a trilha de legendas do Premiere
    { id: 'V4', kind: 'v', h: 24 }, { id: 'V3', kind: 'v', h: 24 }, { id: 'V2', kind: 'v', h: 24 },
    { id: 'V1', kind: 'v', h: 76, main: true },
    { id: 'A1', kind: 'a', h: 60, main: true },
    { id: 'A2', kind: 'a', h: 24 }, { id: 'A3', kind: 'a', h: 24 }, { id: 'A4', kind: 'a', h: 24 },
];

// ─────────────────────────── mix de áudio (todas as trilhas juntas) ───────────────────────────
// Como no Premiere/Resolve, as trilhas de áudio tocam somadas, mixadas em tempo real (editor-audio.js).
// Com o mixer ativo o áudio é o relógio da reprodução e os players de vídeo tocam mudos.

// Clipes com som: [início na timeline, entrada, saída, ganho dB] — trilha muda (M) fica de fora
function veMixClipes() {
    return VE.clips
        .filter(c => !veIsImage(c) && !veTrkMuted(c.tr) && c.e - c.s > 0.005 && (veIsAudio(c) || (VE.info && VE.info.has_audio)))
        .map(c => [+c.st.toFixed(5), +c.s.toFixed(5), +c.e.toFixed(5), +(c.g || 0).toFixed(2), veIsAudio(c) ? c.m : 0,
                   +veVel(c).toFixed(4), c.tom === false ? 0 : 1])
        .sort((a, b) => a[0] - b[0]);
}
function veMixAtivo() { return veAudioPronto(); }

// Estado de cada trilha (como os botões do cabeçalho no Premiere): v[k] = trilha Vk+1, a[k] = Ak+1.
// hide = olho (não aparece na prévia nem na exportação), lock = cadeado (clipes não podem ser editados),
// mute = áudio silenciado. Fica salvo no projeto; não entra no desfazer (como no Premiere).
function veTrkNovo() { return { v: [{}, {}, {}, {}], a: [{}, {}, {}, {}] }; }
let VE_TRK = veTrkNovo();
const veTrkHidden = tr => !!(VE_TRK.v[tr] && VE_TRK.v[tr].hide);
const veTrkMuted = tr => !!(VE_TRK.a[tr] && VE_TRK.a[tr].mute);
const veTrkLocked = tr => !!((VE_TRK.v[tr] && VE_TRK.v[tr].lock) || (VE_TRK.a[tr] && VE_TRK.a[tr].lock));
const veLocked = c => !!c && veTrkLocked(c.tr);
function veAvisoBloqueio() { veToast('Trilha bloqueada: clique no cadeado para desbloquear'); }

// Cores do rótulo do clipe (menu do botão direito na timeline)
const VE_CORES = [
    ['violeta', 'Violeta', '#8b5cf6'], ['iris', 'Íris', '#6366f1'], ['azul', 'Azul', '#3b82f6'],
    ['ceruleo', 'Cerúleo', '#0ea5e9'], ['caribe', 'Caribe', '#06b6d4'], ['verdeazul', 'Verde-azulado', '#14b8a6'],
    ['floresta', 'Floresta', '#16a34a'], ['verde', 'Verde', '#65a30d'], ['amarelo', 'Amarelo', '#eab308'],
    ['manga', 'Manga', '#f59e0b'], ['laranja', 'Laranja', '#f97316'], ['rosa', 'Rosa', '#f43f5e'],
    ['magenta', 'Magenta', '#d946ef'], ['lavanda', 'Lavanda', '#c4b5fd'], ['bege', 'Bege', '#d6b48a'],
    ['marrom', 'Marrom', '#a16207'],
];
const veCor = c => { const k = c && c.cor && VE_CORES.find(x => x[0] === c.cor); return k ? k[2] : null; };
function veRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

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
    // aparece na janela em uso (a principal ou uma janela solta)
    const w = (typeof vedFloats === 'function' ? vedFloats() : []).map(h => h.win).filter(Boolean)
        .find(x => { try { return x.document.hasFocus(); } catch (e) { return false; } });
    const root = (w && w.document.querySelector('.ve-float')) || $ve('ve');
    let el = root.querySelector(':scope > .ve-toast');
    if (!el) {
        el = root.ownerDocument.createElement('div');
        el.className = 've-toast';
        root.appendChild(el);
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

// ─────────────────────────── modelo (timeline) ───────────────────────────
// Clipe: {tr, st, s, e} — tr = trilha 0..3 (V1..V4, com o áudio vinculado em A1..A4),
// st = início na timeline, [s, e] = trecho do arquivo original. Pode haver espaço vazio.
// Onde clipes se sobrepõem, a trilha mais alta é a que aparece (e a que se ouve).

// Velocidade do clipe (c.v, como "Velocidade/Duração" do Premiere): 1 = normal, 2 = 200% (dura a metade).
// [s, e] continua sendo o trecho da fonte; na timeline ele ocupa (e - s) / v. c.tom === false: o som muda de
// tom com a velocidade (sem "Manter o tom do áudio").
const VE_VEL_MIN = 0.1, VE_VEL_MAX = 10;
const veVel = c => (c && c.v) || 1;
const veLen = c => (c.e - c.s) / veVel(c);
const veEnd = c => c.st + veLen(c);
const veSrcAt = (c, T) => c.s + (T - c.st) * veVel(c);     // instante da timeline → tempo da fonte
const veTlAt = (c, src) => c.st + (src - c.s) / veVel(c);   // tempo da fonte → instante da timeline
// Velocidade do player para mostrar o clipe (a do L/J vezes a do clipe), no limite que o navegador aceita
const veTaxa = c => Math.min(16, Math.max(0.0625, VE.rate * veVel(c)));
const VE_EPS = 1e-6;

function veRelayout() {
    const selC = VE.clips[VE.sel];
    VE.clips.sort((a, b) => a.st - b.st || a.tr - b.tr);
    VE.sel = selC ? VE.clips.indexOf(selC) : -1;
    VE.dur = VE.clips.reduce((m, c) => Math.max(m, veEnd(c)), 0);
    VE.playhead = Math.min(VE.playhead, VE.dur);
}

// Clipe visível no instante t (o da trilha mais alta), ou -1 se for espaço vazio
function veTopAt(t) {
    let best = -1;
    VE.clips.forEach((c, i) => {
        if (!veIsImage(c) && !veIsAudio(c) && !veTrkHidden(c.tr) && t >= c.st - VE_EPS && t < veEnd(c) - VE_EPS && (best < 0 || c.tr > VE.clips[best].tr)) best = i;
    });
    return best;
}

// Clipe sob o ponto (t, trilha) — para clique/seleção
function veClipAtTrack(t, tr, kind) {
    if (kind === 'l') return -1;
    return VE.clips.findIndex(c => c.tr === tr && t >= c.st - VE_EPS && t <= veEnd(c) + VE_EPS &&
        (kind === 'v' ? veOcupaV(c) : kind === 'a' ? veOcupaA(c) : true));
}

function veEditPoints(excluir) {
    const pts = new Set([0, VE.dur]);
    VE.clips.forEach((c, i) => { if (i !== excluir) { pts.add(c.st); pts.add(veEnd(c)); } });
    return [...pts].sort((a, b) => a - b);
}

function veSnapshot() { return JSON.stringify({ clips: VE.clips, inPt: VE.inPt, outPt: VE.outPt, legendas: VE.legendas || [] }); }

function vePushHistory() {
    if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
    VE.history.push(veSnapshot());
    if (VE.history.length > 200) VE.history.shift();
    VE.future = [];
    veUpdateUndo();
}

function veRestore(snap) {
    const d = JSON.parse(snap);
    VE.clips = d.clips; VE.inPt = d.inPt; VE.outPt = d.outPt;
    VE.legendas = d.legendas || [];
    VE.sel = -1;
    VETX.legSel = -1;
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
    if (VE.pps < fit * 0.5) VE.pps = fit;
    veClampView();
    veSyncZoomSlider();
    veSeek(playhead != null ? playhead : VE.playhead);
    veRefresh();
}

// Corta TODAS as trilhas no ponto (cortar = fatiar, nunca apagar)
function veSplitAt(t, quiet) {
    if (!VE.ready) return false;
    t = veSnapFrame(veClamp(t));
    const f = veFrame() * 0.99;
    const alvo = VE.clips.filter(c => !veLocked(c) && t - c.st >= f && veEnd(c) - t >= f);
    if (!alvo.length) {
        if (!quiet && VE.clips.some(c => veLocked(c) && t - c.st >= f && veEnd(c) - t >= f)) { veAvisoBloqueio(); return false; }
        if (!quiet) veToast(veTopAt(t) < 0 ? 'Não há clipe na agulha' : 'Já existe um corte aqui');
        return false;
    }
    vePushHistory();
    const selC = VE.clips[VE.sel];
    alvo.forEach(c => {
        const src = veSrcAt(c, t);
        VE.clips.push({ ...c, st: t, s: src, e: c.e });
        c.e = src;
    });
    VE.sel = selC ? VE.clips.indexOf(selC) : -1;
    veRelayout();
    veRefresh();
    return true;
}

function veSplitAtPlayhead() {
    if (veSplitAt(VE.playhead)) veToast('Cortado em ' + veShort(VE.playhead));
}

// Remove o intervalo [a, b] de todas as trilhas e puxa o que vem depois (ripple)
function veRippleRemove(a, b, label) {
    if (!VE.ready) return false;
    a = veSnapFrame(veClamp(Math.min(a, b)));
    b = veSnapFrame(veClamp(Math.max(a, b)));
    const d = b - a;
    if (d < veFrame() * 0.5) return false;
    const tiny = veFrame() * 0.5;
    const out = [];
    VE.clips.forEach(c => {
        const en = veEnd(c);
        if (en <= a + VE_EPS || veLocked(c)) { out.push({ ...c }); return; }   // trilha bloqueada não mexe
        if (c.st >= b - VE_EPS) { out.push({ ...c, st: c.st - d }); return; }
        if (c.st < a && a - c.st > tiny) out.push({ ...c, e: veSrcAt(c, a) });
        if (en > b && en - b > tiny) out.push({ ...c, st: a, s: veSrcAt(c, b) });
    });
    if (!out.length) { veToast('Isso apagaria tudo da timeline'); return false; }
    vePushHistory();
    VE.clips = out;
    VE.sel = -1;
    VE.inPt = VE.outPt = null;
    veRelayout();
    veAfterEdit(a);
    if (label) veToast(label);
    return true;
}

// D / Delete: apaga o clipe selecionado. Se o espaço que ele deixa ficar vazio em todas as
// trilhas, a timeline fecha o buraco (como o ripple delete do Premiere); senão fica o espaço.
// ripple = fecha o espaço (Shift+D, como Shift+Delete no Premiere); sem ripple o espaço vazio fica (D / Delete)
function veDeleteClip(i, ripple) {
    if (i < 0 || i >= VE.clips.length) return;
    if (veLocked(VE.clips[i])) { veAvisoBloqueio(); return; }
    if (VE.clips.length === 1) { veToast('Não dá para apagar o último clipe'); return; }
    vePushHistory();
    const c = VE.clips[i], a = c.st, b = veEnd(c), d = b - a;
    VE.clips.splice(i, 1);
    if (!ripple) {
        VE.sel = -1;
        veRelayout();
        veAfterEdit(Math.min(VE.playhead, VE.dur));
        veToast('Clipe apagado (Shift+D apaga e fecha o espaço)');
        return;
    }
    const ocupado = VE.clips.some(o => o.st < b - VE_EPS && veEnd(o) > a + VE_EPS);
    if (!ocupado) VE.clips.forEach(o => { if (o.st >= b - VE_EPS && !veLocked(o)) o.st -= d; });
    VE.sel = -1;
    veRelayout();
    veAfterEdit(VE.playhead > b && !ocupado ? VE.playhead - d : Math.min(VE.playhead, VE.dur));
    veToast(ocupado ? 'Clipe apagado (o espaço ficou porque há clipes em outras trilhas)' : 'Clipe apagado');
}

function veDeleteSelected(ripple) {
    if (VE.sel < 0 && VETX.legSel >= 0 && VE.legendas[VETX.legSel]) {
        vePushHistory();
        VE.legendas = VE.legendas.filter((_, k) => k !== VETX.legSel);
        VETX.legSel = -1;
        veRefresh();
        veToast('Legenda apagada');
        return;
    }
    if (VE.sel < 0) { veToast('Selecione um clipe na timeline'); return; }
    veDeleteClip(VE.sel, ripple);
}

// ── duplicar / copiar e colar / mudar de trilha ──
// Põe `novo` na trilha dele sobrescrevendo o que estiver embaixo (como soltar um clipe); `exceto` = índice que sai
function vePlaceClip(novo, exceto = -1) {
    const a = novo.st, b = veEnd(novo), tiny = veFrame() * 0.5, out = [];
    VE.clips.forEach((o, j) => {
        if (j === exceto) return;
        const en = veEnd(o);
        if (o.tr !== novo.tr || en <= a + VE_EPS || o.st >= b - VE_EPS || !veConflita(o, novo)) { out.push(o); return; }
        if (o.st < a && a - o.st > tiny) out.push({ ...o, e: veSrcAt(o, a) });
        if (en > b && en - b > tiny) out.push({ ...o, st: b, s: veSrcAt(o, b) });
    });
    out.push(novo);
    VE.clips = out;
    VE.sel = out.indexOf(novo);
    veRelayout();
}

const veCopiaClipe = c => JSON.parse(JSON.stringify(c));

// Alt+arrastar: uma cópia igual cai onde o clipe foi solto; o original fica
function veDuplicarEm(i, tr, st) {
    const c = VE.clips[i];
    if (!c) return;
    if (veTrkLocked(tr)) { veAvisoBloqueio(); veDraw(); return; }
    vePushHistory();
    vePlaceClip({ ...veCopiaClipe(c), tr, st });
    veAfterEdit(VE.playhead);
    veToast(`${veNomeClipe(c)} duplicado em ${veIsAudio(c) ? 'A' : 'V'}${tr + 1}`);
}

// Ctrl+C / Ctrl+X / Ctrl+V: cola na agulha, na mesma trilha de onde saiu (a agulha vai para o fim do colado)
function veCopiar(recortar) {
    const c = VE.clips[VE.sel];
    if (!c) { veToast('Selecione um clipe para copiar'); return; }
    VE.clipboard = { c: veCopiaClipe(c), path: VE.path };
    if (recortar) { veDeleteClip(VE.sel, false); veToast('Clipe recortado: Ctrl+V cola na agulha'); }
    else veToast('Clipe copiado: Ctrl+V cola na agulha');
}

function veColar() {
    const cb = VE.clipboard;
    if (!cb || cb.path !== VE.path) { veToast('Nada copiado (Ctrl+C num clipe primeiro)'); return; }
    if (cb.c.m && !VE.media[cb.c.m]) { veToast('A mídia desse clipe não está mais no projeto'); return; }
    if (veTrkLocked(cb.c.tr)) { veAvisoBloqueio(); return; }
    vePushHistory();
    const novo = { ...veCopiaClipe(cb.c), st: veSnapFrame(VE.playhead) };
    vePlaceClip(novo);
    veAfterEdit(veEnd(novo));
    veToast(`Colado em ${veIsAudio(novo) ? 'A' : 'V'}${novo.tr + 1}`);
}

// Alt+arrastar no monitor: a cópia nasce na primeira trilha livre acima, no mesmo tempo, e é ela que se move
// (sem trilha livre, sobrescreve a de cima). Devolve false se não houver trilha acima.
function veDuplicarAcima() {
    const c = VE.clips[VE.sel];
    if (!c) return false;
    const a = c.st, b = veEnd(c);
    let tr = [1, 2, 3].map(k => c.tr + k).find(k => k <= 3 && !veTrkLocked(k) && veTrackFree(k, a, b, c));
    if (tr == null && c.tr < 3 && !veTrkLocked(c.tr + 1)) tr = c.tr + 1;
    if (tr == null) { veToast('Não há trilha acima para a cópia (V4 é a última)'); return false; }
    vePushHistory();
    vePlaceClip({ ...veCopiaClipe(c), tr });
    veRefresh();
    veToast(`${veNomeClipe(c)} duplicado em V${tr + 1}`);
    return true;
}

// Alt+↑ / Alt+↓: leva o clipe para a trilha de cima/baixo, no mesmo tempo (sobrescreve o que estiver lá)
function veTrocarTrilha(dir) {
    const c = VE.clips[VE.sel];
    if (!c) { veToast('Selecione um clipe na timeline'); return; }
    if (veLocked(c)) { veAvisoBloqueio(); return; }
    // no vídeo "cima" é V2, V3...; no áudio solto, "cima" é em direção ao A1 (como aparece na tela)
    const tr = c.tr + (veIsAudio(c) ? -dir : dir);
    if (tr < 0 || tr > 3) return;
    veMoveClip(VE.sel, tr, c.st);
}

// ── Mover clipe (arrastar) ──
// Onde o clipe cairia: início com ímã nos cortes/agulha, sem ficar antes do zero.
function veMoveTarget(i, start) {
    const c = VE.clips[i], len = veLen(c);
    start = Math.max(0, start);
    if (VE.snap) {
        const lim = 8 / VE.pps;
        const cands = veEditPoints(i).concat([VE.playhead]);
        let best = null, bd = lim;
        for (const p of cands) {
            if (Math.abs(p - start) < bd) { bd = Math.abs(p - start); best = p; }
            if (Math.abs(p - (start + len)) < bd) { bd = Math.abs(p - (start + len)); best = p - len; }
        }
        if (best != null) start = Math.max(0, best);
    }
    return veSnapFrame(start);
}

// Solta o clipe na trilha/posição: o que estiver embaixo na trilha de destino é sobrescrito
function veMoveClip(i, tr, st) {
    const c = VE.clips[i];
    if (veTrkLocked(tr)) { veAvisoBloqueio(); veDraw(); return; }
    if (tr === c.tr && Math.abs(st - c.st) < veFrame() / 2) { veDraw(); return; }
    vePushHistory();
    const moved = { ...c, tr, st };
    const a = st, b = st + veLen(c), tiny = veFrame() * 0.5;
    const out = [];
    VE.clips.forEach((o, j) => {
        if (j === i) return;
        const en = veEnd(o);
        if (o.tr !== tr || en <= a + VE_EPS || o.st >= b - VE_EPS || !veConflita(o, c)) { out.push(o); return; }
        if (o.st < a && a - o.st > tiny) out.push({ ...o, e: veSrcAt(o, a) });
        if (en > b && en - b > tiny) out.push({ ...o, st: b, s: veSrcAt(o, b) });
    });
    out.push(moved);
    VE.clips = out;
    VE.sel = out.indexOf(moved);
    veRelayout();
    veAfterEdit(VE.playhead);
}

// Q: apaga do corte anterior (qualquer trilha) até a agulha; W: da agulha até o próximo corte
function veRippleTrimStart() {
    const t = veSnapFrame(VE.playhead);
    const p = [...veEditPoints()].reverse().find(x => x < t - veFrame() * 0.5);
    if (p == null) { veToast('Nada antes da agulha'); return; }
    veRippleRemove(p, t, 'Removido até a agulha');
}

function veRippleTrimEnd() {
    const t = veSnapFrame(VE.playhead);
    const n = veEditPoints().find(x => x > t + veFrame() * 0.5);
    if (n == null) { veToast('Nada depois da agulha'); return; }
    veRippleRemove(t, n, 'Removido depois da agulha');
}

function veExtractInOut() {
    if (VE.inPt == null || VE.outPt == null) { veToast('Marque entrada (I) e saída (O) primeiro'); return; }
    veRippleRemove(VE.inPt, VE.outPt, 'Trecho In→Out removido');
}

function veResetEdits() {
    if (!VE.ready) return;
    vePushHistory();
    VE.clips = [{ tr: 0, st: 0, s: 0, e: VE.srcDur }];
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
// Relógio próprio: dentro de um clipe o <video> dita o tempo; no espaço vazio a agulha anda
// sozinha com a tela preta. Troca de clipe quando muda o que está visível na agulha.

// Dois players que se revezam (deck A = #ve-video, deck B = criado aqui): o que está tocando dá a imagem, o
// som e o relógio; o outro espera parado no primeiro quadro do trecho seguinte. No corte ele começa a tocar e
// o anterior pausa — sem busca, sem congelar e sem buraco no som (vePreloadNext / veSyncPlayer).
const VEDK = { b: null, ativo: 0, i: -1, t: -1 };   // i/t: trecho e instante em que a reserva está esperando
function veDeckA() { return $ve('ve-video'); }
function veVideo() { return VEDK.ativo && VEDK.b ? VEDK.b : veDeckA(); }
function veReserva() { return VEDK.ativo ? veDeckA() : veDeckB(); }
// A reserva só se já existir (não cria o deck B nem carrega o vídeo nele à toa)
function veReservaExiste() { return VEDK.ativo ? veDeckA() : VEDK.b; }

function veDeckB() {
    if (!VEDK.b) {
        const x = document.createElement('video');
        x.preload = 'auto';
        x.crossOrigin = 'anonymous';
        x.playsInline = true;
        x.setAttribute('aria-hidden', 'true');
        x.addEventListener('seeked', () => veDrawMonitor());
        x.addEventListener('loadeddata', () => veDrawMonitor());
        VEDK.b = x;
    }
    // na página, ao lado do A (invisível como ele): fora da página o navegador não atualiza a imagem
    // de um vídeo que está tocando, e o corte mostraria um quadro velho
    const a = veDeckA();
    if (VEDK.b.parentNode !== a.parentNode) a.parentNode.insertBefore(VEDK.b, a.nextSibling);
    // mesmo arquivo em URL própria (com a mesma URL o WebView divide o carregamento entre os players)
    const base = a.getAttribute('src') ? a.src : '', x = VEDK.b;
    if (x._base !== base) {
        x._base = base;
        x.muted = true;
        if (base) x.src = base.startsWith('blob:') ? base : base + (base.includes('?') ? '&' : '?') + 'camada=b';
        else x.removeAttribute('src');
        x.load();
        VEDK.i = -1;
    }
    return x;
}

// Volta ao deck A e solta o B (abrir/fechar vídeo)
function veDeckReset() {
    const b = VEDK.b;
    if (VEDK.ativo) { veDeckA().muted = VE.muted; }
    VEDK.ativo = 0;
    VEDK.i = -1;
    if (b && b.getAttribute('src')) { b.pause(); b.removeAttribute('src'); b._base = null; b.load(); }
}

// Troca de deck no corte: a reserva (já no quadro certo) passa a tocar com som; a anterior pausa e vira reserva
function veDeckSwap() {
    const velho = veVideo(), novo = veReserva();
    novo.playbackRate = veTaxa(VE.clips[VEDK.i]);
    VEDK.ativo = VEDK.ativo ? 0 : 1;
    VEDK.i = -1;
    novo.muted = VE.muted;
    velho.muted = true;
    if (VE.playing && novo.paused) novo.play().catch(() => {});
    velho.pause();
}

// Ajusta o player ao que está visível na agulha (quadro do clipe, ou preto no vazio)
function veSyncPlayer(forcar) {
    const v = veVideo();
    const i = veTopAt(VE.playhead);
    if (i < 0) {
        VE.cur = -1;
        if (!v.paused) v.pause();
        veDrawMonitor();
        return;
    }
    const c = VE.clips[i];
    const src = veSrcAt(c, VE.playhead);
    // corte na reprodução com a reserva esperando neste trecho: troca de player em vez de buscar
    if (!forcar && VE.playing && i !== VE.cur && VEDK.i === i) {
        const r = veReserva();
        if (r.readyState >= 2 && !r.seeking) {
            const d = r.currentTime - src;
            // já no ponto de entrada (a imagem do player anda ~meio quadro atrás do tempo dele; até ~2 quadros
            // depois): troca. Antes disso mostraria um quadro de antes do ponto de entrada.
            if (d >= 0.012 && d < 0.1) {
                VE._trocaErro = d;   // diagnóstico (modo agente)
                veDeckSwap();
                VE.cur = i;
                veApplyAudioGain();
                veDrawMonitor();
                return;
            }
            // com o mix, o áudio não espera ninguém: um pouco atrás, troca e salta para o ponto de entrada
            // (enquanto busca, o monitor segura o último quadro — nunca mostra quadro de antes da entrada)
            if (veMixAtivo() && d > -0.15 && d < 0.012) {
                veDeckSwap();
                try { veVideo().currentTime = src + VE_AV_ADIANTA * veVel(c); } catch (e) { /* carregando */ }
                VE.cur = i;
                veApplyAudioGain();
                veDrawMonitor();
                return;
            }
            // sem mix (vídeo é o relógio): chegando, espera no último quadro do trecho, sem buscar
            if (d < 0.012 && d > -0.15 && !r.paused) return;
        }
    }
    if (forcar) veReservaParar();
    if (forcar || i !== VE.cur || Math.abs(v.currentTime - src) > 0.25) {
        if (v.src && Math.abs(v.currentTime - src) > 0.02) {
            try { v.currentTime = src; } catch (e) { /* ainda carregando */ }
        }
    }
    const mudou = i !== VE.cur;
    VE.cur = i;
    veApplyAudioGain();
    veDrawMonitor();
    // outro clipe (pode ter outra velocidade) no mesmo player
    if (VE.playing && mudou && Math.abs(v.playbackRate - veTaxa(c)) > 1e-3) v.playbackRate = veTaxa(c);
    if (VE.playing && v.paused && v.src) { v.playbackRate = veTaxa(c); v.play().catch(() => {}); }
}

function veSeek(t) {
    if (!VE.ready) return;
    VE.playhead = veClamp(t);
    // pulo de verdade tocando: o som recomeça do ponto novo (edições sem pulo não reiniciam o som)
    if (VE.playing && veMixAtivo() && Math.abs(veAudioPos() - VE.playhead) > 0.05) veAudioTocar(VE.playhead);
    veSyncPlayer(true);
    veFollowPlayhead(false);
    veUpdateReadouts();
    veDraw();
}

function veStepFrames(n) {
    if (VE.playing) veStop();
    veSeek(veSnapFrame(VE.playhead) + n * veFrame());
}

function veJumpEdit(dir) {
    const pts = veEditPoints();
    const eps = veFrame() / 2;
    const t = dir > 0 ? pts.find(p => p > VE.playhead + eps) : [...pts].reverse().find(p => p < VE.playhead - eps);
    if (t != null) veSeek(t);
}

function vePlay() {
    if (!VE.ready || !veVideo().src || VE.playing) return;
    if (VE.playhead >= VE.dur - veFrame()) VE.playhead = 0;
    VE.playing = true;
    VE._last = performance.now();
    $ve('ve-play').textContent = '❚❚';
    if (veMixAtivo()) veAudioTocar(VE.playhead);
    veSyncPlayer(true);
    veRaf($ve('ve-canvas'), vePlaybackLoop);
}

function veStop() {
    if (!VE.playing) return;
    VE.playing = false;
    veVideo().pause();
    veAudioParar();
    veReservaParar();
    veParkExtras(0);
    $ve('ve-play').textContent = '▶';
    veUpdateReadouts();
    veDraw();
}

function veTogglePlay() { VE.playing ? veStop() : vePlay(); }

function veSetRate(r) {
    VE.rate = r;
    veVideo().playbackRate = veTaxa(VE.clips[VE.cur]);
    if (VE.playing && veMixAtivo()) veAudioTocar(VE.playhead);
    const el = $ve('ve-rate');
    el.hidden = r === 1;
    el.textContent = r + 'x';
}

function veToggleMute() {
    VE.muted = !VE.muted;
    veVideo().muted = VE.muted;
    veAudioMudo(VE.muted);
    veApplyAudioGain();
    $ve('ve-mute').innerHTML = `<svg class="i"><use href="#i-${VE.muted ? 'volume-x' : 'volume'}"/></svg>`;
}

function vePlaybackLoop(now) {
    if (!VE.playing) return;
    // relógio sempre da janela principal: o rAF de uma janela solta tem outra origem de tempo
    now = performance.now();
    const dt = Math.max(0, Math.min(0.25, (now - VE._last) / 1000));
    VE._last = now;
    const v = veVideo();
    const c = VE.clips[VE.cur];
    if (veMixAtivo() && VEAU.tocando) {
        // a placa de som (mix de todas as trilhas) é o relógio; o vídeo segue (veSeguirAudio)
        VE.playhead = veAudioPos();
    } else if (c && !v.paused && !v.seeking) {
        // dentro de um clipe o vídeo manda (fica em sincronia com o áudio)
        // nunca antes do início do trecho (o player recém-trocado pode estar a 1 quadro do ponto de entrada)
        VE.playhead = veTlAt(c, Math.max(c.s, Math.min(v.currentTime, c.e)));
        if (v.currentTime >= c.e - 0.004) VE.playhead = veEnd(c);
    } else {
        VE.playhead += dt * VE.rate;
    }
    if (VE.playhead >= VE.dur - 1e-3) {
        VE.playhead = VE.dur;
        veStop();
        veSyncPlayer(true);
        return;
    }
    if (veTopAt(VE.playhead) !== VE.cur) veSyncPlayer(false);
    else if (veMonitorDue() || v.seeking) veDrawMonitor();
    vePreloadNext();
    veSeguirAudio();
    veFollowPlayhead(true);
    veUpdateReadouts();
    veDraw();
    veRaf($ve('ve-canvas'), vePlaybackLoop);
}

// Na reprodução o monitor só redesenha quando a agulha entra em outro quadro da sequência (e na volta
// seguinte, caso o decodificador entregue o quadro um pouco depois). Numa tela de 144 Hz com vídeo de 30 fps,
// corta mais da metade dos desenhos (e dos efeitos). requestVideoFrameCallback seria o sinal exato, mas no
// WebView2 ele fez o player descartar quadros.
// Com o mix tocando, o vídeo acompanha o áudio: diferença pequena corrige com a velocidade (só ao cruzar os
// limites, não a cada quadro — mudar playbackRate toda hora engasga o player); diferença grande busca
function veSeguirAudio() {
    if (!veMixAtivo() || !VE.playing) return;
    const v = veVideo(), c = VE.clips[VE.cur];
    if (!c || v.paused || v.seeking) return;
    // alvo: o vídeo VE_AV_ADIANTA à frente do relógio do áudio — do decodificador até a tela o quadro leva
    // ~1 atualização, então assim ele APARECE junto com o som. Corrige a partir de ~meio quadro de diferença.
    // (diferença medida em tempo da timeline: num clipe acelerado a fonte anda mais rápido)
    const vel = veVel(c), alvo = veSrcAt(c, VE.playhead) + VE_AV_ADIANTA * vel;
    const d = (v.currentTime - alvo) / vel;
    if (Math.abs(d) > 0.1) { try { v.currentTime = alvo; } catch (e) { /* carregando */ } return; }
    let r = v.playbackRate;
    const base = veTaxa(c);
    if (Math.abs(d) > 0.02) r = Math.min(16, base * (d > 0 ? 0.92 : 1.08));
    else if (Math.abs(d) < 0.006) r = base;
    if (r !== v.playbackRate) v.playbackRate = r;
}

const VE_AV_ADIANTA = 0.025;

function veMonitorDue() {
    const f = Math.floor(VE.playhead * (VE.fps || 30) + 1e-6);
    if (f !== VE._monF) { VE._monF = f; VE._monLeft = 2; }
    return VE._monLeft-- > 0;
}

// ─────────────────────────── ganho de áudio (G) ───────────────────────────
// Cada clipe guarda seu ganho em dB (c.g). G abre a caixa "ajustar ganho em": o valor é somado.

const VE_GAIN_MIN = -60, VE_GAIN_MAX = 30;
function veDb(g) { return Math.pow(10, (g || 0) / 20); }
function veFmtDb(g) { g = Math.round((g || 0) * 10) / 10; return (g > 0 ? '+' : '') + g + ' dB'; }

function veOpenGain() {
    if (VE.sel < 0) { veToast('Selecione um clipe para ajustar o ganho'); return; }
    if (veIsImage(VE.clips[VE.sel])) { veToast('Imagem não tem som'); return; }
    if (veLocked(VE.clips[VE.sel])) { veAvisoBloqueio(); return; }
    if (!VE.info || !VE.info.has_audio) { veToast('Este vídeo não tem som'); return; }
    if (VE.playing) veStop();
    $ve('ve-gain-cur').textContent = 'Ganho atual do clipe: ' + veFmtDb(VE.clips[VE.sel].g);
    const inp = $ve('ve-gain-input');
    inp.value = '';
    $ve('ve-gain').hidden = false;
    inp.focus();   // foco imediato: dá para digitar logo depois do G
}

function veCloseGain() {
    $ve('ve-gain').hidden = true;
    $ve('ve-gain-input').blur();   // devolve o teclado para o editor (senão G/Enter iriam para o campo escondido)
}

function veApplyGain() {
    const raw = String($ve('ve-gain-input').value).replace(',', '.').trim();
    const d = parseFloat(raw);
    if (!raw || !isFinite(d)) { veCloseGain(); return; }
    const c = VE.clips[VE.sel];
    if (!c) { veCloseGain(); return; }
    const novo = Math.min(Math.max(Math.round(((c.g || 0) + d) * 10) / 10, VE_GAIN_MIN), VE_GAIN_MAX);
    veCloseGain();
    if (novo === (c.g || 0)) return;
    vePushHistory();
    c.g = novo;
    veApplyAudioGain();
    veRefresh();
    veToast(`Ganho do clipe: ${veFmtDb(novo)}`);
}

// Prévia: Web Audio permite aumentar acima de 100%; sem ele, só dá para abaixar (volume do player)
const VEA = { ctx: null, gain: null, falhou: false };
function veApplyAudioGain() {
    const v = veVideo();
    const c = VE.clips[VE.cur];
    v.muted = VE.muted || (!!c && veTrkMuted(c.tr));   // M do cabeçalho da trilha de áudio
    if (veMixAtivo()) { v.muted = true; return; }         // o som vem do mix (ganho incluído)
    const lin = veDb(c ? c.g : 0);
    if (!VEA.ctx && !VEA.falhou && lin > 1) {
        try {
            VEA.ctx = new (window.AudioContext || window.webkitAudioContext)();
            VEA.gain = VEA.ctx.createGain();
            VEA.gain.connect(VEA.ctx.destination);
        } catch (e) { VEA.falhou = true; VEA.ctx = null; }
    }
    // cada deck entra no ganho quando for o ativo (um elemento só pode ser ligado uma vez)
    if (VEA.ctx && !v._veaSrc) {
        try { v._veaSrc = VEA.ctx.createMediaElementSource(v); v._veaSrc.connect(VEA.gain); } catch (e) { /* já ligado */ }
    }
    if (VEA.ctx) {
        if (VEA.ctx.state === 'suspended') VEA.ctx.resume().catch(() => {});
        VEA.gain.gain.value = lin;
        v.volume = 1;
    } else {
        v.volume = Math.min(1, lin);
    }
}

// ─────────────────────────── mídias, camadas e propriedades ───────────────────────────
// VE.media[0] é o vídeo aberto; imagens entram como novas mídias. Clipe de imagem: c.m = id da mídia.
// Propriedades de cada clipe (c.p): sc = escala % do tamanho original, x/y = centro em px do quadro,
// rot = graus, op = opacidade %. Sem c.p o clipe usa o padrão (vídeo ocupando o quadro todo).

// texto desenhado em canvas passa pelo idioma escolhido (Preferências)
const veT = s => (window.i18nT ? window.i18nT(s) : s);

const VE_IMG_DUR = 5;
const veRound = (v, n = 1) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);

function veMediaOf(c) { return VE.media[c.m || 0]; }
// Clipe sem vídeo da fonte (sem som, duração livre): imagem, texto (editor-props.js) ou camada de ajuste
function veIsImage(c) { const m = veMediaOf(c); return !!m && (m.kind === 'image' || m.kind === 'ajuste' || m.kind === 'texto'); }
// Camada de ajuste (como no Premiere): clipe transparente cujos efeitos valem para tudo o que está nas trilhas de
// baixo durante o trecho dele; a opacidade dosa a força do efeito. Sem escala/posição/rotação.
function veIsAdj(c) { const m = veMediaOf(c); return !!m && m.kind === 'ajuste'; }
function veNomeClipe(c) { return veIsAudio(c) ? 'Áudio' : veIsAdj(c) ? 'Ajuste' : veIsTexto(c) ? 'Texto' : veIsImage(c) ? 'Imagem' : 'Clipe'; }
// Áudio solto na timeline (MP3, WAV...): só a linha A da trilha, sem imagem
function veIsAudio(c) { const m = veMediaOf(c); return !!m && m.kind === 'audio'; }
// O que cada clipe ocupa: vídeo = V e A (vinculados); imagem/ajuste = só V; áudio solto = só A.
// Sobrescrever, aparar e mover só esbarram em clipes que dividem a mesma linha.
const veOcupaV = c => !veIsAudio(c);
const veOcupaA = c => !veIsImage(c);
const veConflita = (a, b) => (veOcupaV(a) && veOcupaV(b)) || (veOcupaA(a) && veOcupaA(b));

function veDefProps(c) {
    const m = veMediaOf(c);
    let sc = 100;
    // imagem maior que o quadro entra ajustada para caber (como "ajustar ao quadro" do Premiere)
    if (m && m.kind === 'image' && m.w) sc = veRound(Math.min(100, 100 * Math.min(VE.seqW / m.w, VE.seqH / m.h)));
    return { sc, x: VE.seqW / 2, y: VE.seqH / 2, rot: 0, op: 100 };
}
function veStaticProps(c) { return Object.assign(veDefProps(c), c.p || {}); }

// Valor das propriedades no instante T da sequência (quadros-chave, se houver, mandam)
function veProps(c, T = VE.playhead) {
    const p = veStaticProps(c);
    if (c.k) {
        const tl = veSrcAt(c, T);
        VE_KF_PROPS.forEach(k => { const ks = c.k[k]; if (ks && ks.length) p[k] = veKfValue(ks, tl); });
    }
    return p;
}

// ── quadros-chave (como no Premiere/After Effects) ──
// c.k = { sc|x|y|rot|op: [{t, v, i}] } em ordem de t. t é tempo da FONTE do clipe (acompanha o clipe
// ao mover, cortar e aparar). i = interpolação até o próximo quadro: 'lin', 'hold' (degrau) ou uma curva
// de Bézier (como o gráfico de velocidade do Premiere/AE): 'ease', 'in', 'out' (prontas) ou 'bez' com
// b = [x1, y1, x2, y2] (as duas alças; x = tempo, y = valor, de 0 a 1 no trecho).
const VE_KF_PROPS = ['sc', 'x', 'y', 'rot', 'op'];
const VE_KF_NAMES = { sc: 'Escala', x: 'Posição X', y: 'Posição Y', rot: 'Rotação', op: 'Opacidade' };
const VE_KF_INTERP = { lin: 'Linear', ease: 'Suave', in: 'Acelerar', out: 'Frear', hold: 'Parar' };
// 'ease' = smoothstep (compatível com projetos antigos): é exatamente a Bézier (1/3, 0, 2/3, 1)
const VE_KF_BEZ = { lin: [1 / 3, 1 / 3, 2 / 3, 2 / 3], ease: [1 / 3, 0, 2 / 3, 1], in: [0.42, 0, 1, 1], out: [0, 0, 0.58, 1] };

function veKfCurve(q) { return q.i === 'bez' && Array.isArray(q.b) ? q.b : VE_KF_BEZ[q.i] || null; }

// Ponto da Bézier (0,0)-(x1,y1)-(x2,y2)-(1,1) no parâmetro s
function veBez(a, b, s) { const r = 1 - s; return 3 * r * r * s * a + 3 * r * s * s * b + s * s * s; }

// y da curva no tempo u (0..1): acha s com x(s) = u (Newton, com bisseção de reserva)
function veBezY(bz, u) {
    const [x1, y1, x2, y2] = bz;
    let s = u;
    for (let n = 0; n < 6; n++) {
        const r = 1 - s, dx = 3 * r * r * x1 + 6 * r * s * (x2 - x1) + 3 * s * s * (1 - x2);
        if (Math.abs(dx) < 1e-6) break;
        s = Math.min(1, Math.max(0, s - (veBez(x1, x2, s) - u) / dx));
    }
    if (Math.abs(veBez(x1, x2, s) - u) > 1e-4) {
        let lo = 0, hi = 1;
        for (let n = 0; n < 30; n++) { s = (lo + hi) / 2; if (veBez(x1, x2, s) < u) lo = s; else hi = s; }
    }
    return veBez(y1, y2, s);
}

function veKfEase(q, u) {
    if (q.i === 'hold') return 0;
    if (!q.i || q.i === 'lin') return u;
    const bz = veKfCurve(q);
    return bz ? veBezY(bz, u) : u;
}

function veKfValue(ks, t) {
    if (t <= ks[0].t) return ks[0].v;
    const n = ks.length - 1;
    if (t >= ks[n].t) return ks[n].v;
    let j = 0;
    while (j < n - 1 && t >= ks[j + 1].t) j++;
    const a = ks[j], b = ks[j + 1];
    return a.v + (b.v - a.v) * veKfEase(a, (t - a.t) / (b.t - a.t));
}

function veKfOn(c, k) { return !!(c && c.k && c.k[k] && c.k[k].length); }
function veHasKf(c) { return !!c && VE_KF_PROPS.some(k => veKfOn(c, k)); }

// Tempo da fonte na agulha, preso ao trecho do clipe
function veKfTime(c) {
    const t = veSrcAt(c, veSnapFrame(VE.playhead));
    return Math.round(Math.min(Math.max(t, c.s), c.e) * 1e4) / 1e4;
}

function veKfIndex(ks, t) { return ks ? ks.findIndex(q => Math.abs(q.t - t) < veFrame() * 0.5) : -1; }

// Aplica valores na agulha: propriedade animada ganha/atualiza quadro-chave; as outras mudam fixo
function veApplyProps(c, vals) {
    const tl = veKfTime(c);
    const fixos = {};
    Object.entries(vals).forEach(([k, v]) => {
        if (!veKfOn(c, k)) { fixos[k] = v; return; }
        const ks = c.k[k].map(q => ({ ...q }));
        const j = veKfIndex(ks, tl);
        if (j >= 0) ks[j].v = v;
        else { ks.push({ t: tl, v, i: 'lin' }); ks.sort((a, b) => a.t - b.t); }
        c.k = { ...c.k, [k]: ks };
    });
    if (Object.keys(fixos).length) c.p = { ...veStaticProps(c), ...fixos };
}

// Cronômetro: liga a animação (1º quadro-chave na agulha) ou desliga (fica o valor atual)
function veKfToggle(k) {
    const c = VE.clips[VE.sel];
    if (!c) return;
    vePushHistory();
    const v = veProps(c)[k];
    if (veKfOn(c, k)) {
        const k2 = { ...c.k };
        delete k2[k];
        c.k = k2;
        if (!veHasKf(c)) delete c.k;
        c.p = { ...veStaticProps(c), [k]: v };
        veToast(`Animação de ${VE_KF_NAMES[k]} desligada`);
    } else {
        c.k = { ...(c.k || {}), [k]: [{ t: veKfTime(c), v, i: 'lin' }] };
        veToast(`Animação de ${VE_KF_NAMES[k]} ligada: mude o valor em outro ponto para criar movimento`);
    }
    veRefresh();
}

// ◆: adiciona quadro-chave na agulha ou remove o que já está nela
function veKfAddRemove(k) {
    const c = VE.clips[VE.sel];
    if (!c) return;
    if (!veInClip(c)) { veToast('Leve a agulha para dentro do clipe'); return; }
    const tl = veKfTime(c), v = veProps(c)[k];
    vePushHistory();
    const ks = veKfOn(c, k) ? c.k[k].map(q => ({ ...q })) : [];
    const j = veKfIndex(ks, tl);
    if (j >= 0) {
        ks.splice(j, 1);
        const k2 = { ...c.k };
        if (ks.length) k2[k] = ks; else delete k2[k];
        c.k = k2;
        if (!ks.length) c.p = { ...veStaticProps(c), [k]: v };
        if (!veHasKf(c)) delete c.k;
    } else {
        ks.push({ t: tl, v, i: 'lin' });
        ks.sort((a, b) => a.t - b.t);
        c.k = { ...(c.k || {}), [k]: ks };
    }
    veRefresh();
}

// Tempos (da sequência) dos quadros-chave do clipe dentro do trecho visível; k = uma propriedade ou todas
function veKfSeqTimes(c, k) {
    const set = new Set();
    (k ? [k] : VE_KF_PROPS).forEach(p => {
        if (veKfOn(c, p)) c.k[p].forEach(q => { if (q.t >= c.s - 1e-4 && q.t <= c.e + 1e-4) set.add(Math.round(veTlAt(c, q.t) * 1e4) / 1e4); });
    });
    return [...set].sort((a, b) => a - b);
}

function veKfJump(k, dir) {
    const c = VE.clips[VE.sel];
    if (!c) return;
    const eps = veFrame() / 2;
    const ts = veKfSeqTimes(c, k);
    const t = dir > 0 ? ts.find(x => x > VE.playhead + eps) : [...ts].reverse().find(x => x < VE.playhead - eps);
    if (t == null) { veToast(dir > 0 ? 'Não há quadro-chave depois' : 'Não há quadro-chave antes'); return; }
    if (VE.playing) veStop();
    veSeek(t);
}

// Interpolação de todos os quadros-chave que estão na agulha; bz = alças da curva ('bez')
function veKfSetInterp(i, bz, silencioso) {
    const c = VE.clips[VE.sel];
    if (!c || !c.k) return;
    const tl = veKfTime(c);
    if (!silencioso) vePushHistory();
    const k2 = { ...c.k };
    VE_KF_PROPS.forEach(k => {
        const j = veKfIndex(k2[k], tl);
        if (j < 0) return;
        k2[k] = k2[k].map(q => ({ ...q }));
        k2[k][j].i = i;
        if (i === 'bez') k2[k][j].b = bz.map(v => Math.round(v * 1e4) / 1e4); else delete k2[k][j].b;
    });
    c.k = k2;
    if (silencioso) { veRenderProps(); veDrawMonitor(); veDraw(); return; }
    veRefresh();
    veToast('Interpolação: ' + (VE_KF_INTERP[i] || 'Curva'));
}

// Move os quadros-chave do instante t0 (fonte) para t1 (arrastar o ◆ na timeline)
function veKfMove(c, t0, t1) {
    const k2 = { ...c.k };
    VE_KF_PROPS.forEach(k => {
        const ks = k2[k];
        const j = veKfIndex(ks, t0);
        if (j < 0) return;
        const q = { ...ks[j], t: t1 };
        const resto = ks.filter((x, n) => n !== j && Math.abs(x.t - t1) >= veFrame() * 0.5);
        k2[k] = [...resto, q].sort((a, b) => a.t - b.t);
    });
    c.k = k2;
}

function veInClip(c) { return VE.playhead >= c.st - VE_EPS && VE.playhead <= veEnd(c) + VE_EPS; }

function veIsDefaultProps(c) {
    if (veHasKf(c)) return false;
    const p = veProps(c), near = (a, b) => Math.abs(a - b) < 0.05;
    return near(p.sc, 100) && near(p.x, VE.seqW / 2) && near(p.y, VE.seqH / 2) && near(p.rot % 360, 0) && p.op >= 99.95;
}

function veMediaSize(c) {
    const m = veMediaOf(c);
    if (m && m.kind === 'image') return { w: m.w || 1, h: m.h || 1 };
    if (m && m.kind === 'texto') return veTxTamanho(c);
    return { w: VE.seqW, h: VE.seqH };
}

// ── adicionar imagem ──
function vePickImage() {
    if (!VE.ready) return;
    window.pywebview.api.select_image('video-cutter').then(r => { if (r && r.success) veAddImage(r.path); });
}

// Arquivos soltos no editor: sem projeto abre o vídeo; com projeto, imagens viram camadas
const VE_EXT_IMG = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
function veDropFiles(itens) {
    const proj = itens.find(i => !i.pasta && /\.vcnvt$/i.test(i.path));
    if (proj) { veOpenProject(proj.path); return; }
    const videos = itens.filter(i => !i.pasta && (EXT_VIDEO.test(i.path) || EXT_AUDIO.test(i.path)));
    const imgs = itens.filter(i => !i.pasta && VE_EXT_IMG.test(i.path));
    if (!VE.ready) {
        if (videos.length) veOpenPath(videos[0].path);
        else veToast(imgs.length ? 'Abra um vídeo primeiro; depois arraste as imagens para a timeline' : 'Solte um arquivo de vídeo ou áudio');
        return;
    }
    if (imgs.length) {
        imgs.forEach((it, k) => veAddImage(it.path, k * VE_IMG_DUR));
        return;
    }
    const audios = videos.filter(i => EXT_AUDIO.test(i.path) && !EXT_VIDEO.test(i.path));
    if (audios.length) {
        // um por vez: cada um escolhe a trilha livre depois de o anterior ter entrado
        audios.reduce((p, it) => p.then(() => veAddAudio(it.path)), Promise.resolve());
        return;
    }
    if (videos.length) veToast('Por enquanto o editor usa um vídeo por projeto. Para trocar, use Abrir (Ctrl+O).');
    else veToast('Arraste imagens (PNG, JPG, WEBP, GIF) para usar por cima do vídeo');
}

function veAddImage(path, deslocamento = 0) {
    if (!VE.ready) return;
    const drop = VE._drop && Date.now() - VE._drop.at < 5000 ? VE._drop : null;
    window.pywebview.api.video_cutter_add_media(path).then(r => {
        if (!r || !r.success) { veToast((r && r.error) || 'Não foi possível abrir a imagem'); return; }
        let m = VE.media.find(x => x.kind === 'image' && x.path === r.path);
        const criar = () => veInsertImageClip(m, drop, deslocamento);
        if (m && m.img && m.img.complete && m.w) { criar(); return; }
        m = { id: VE.media.length, kind: 'image', path: r.path, url: r.url, name: r.name, img: new Image(), w: 0, h: 0 };
        VE.media.push(m);
        m.img.crossOrigin = 'anonymous';
        m.img.onload = () => { m.w = m.img.naturalWidth; m.h = m.img.naturalHeight; criar(); };
        m.img.onerror = () => veToast('Não foi possível carregar a imagem');
        m.img.src = r.url;
    });
}

// ── áudio solto (MP3, WAV...): entra na agulha, na trilha logo abaixo da última trilha de áudio usada,
// sem sobrescrever nada; o som entra no mixer em tempo real ──
function veAddAudio(path) {
    if (!VE.ready) return Promise.resolve();
    veToast('Preparando o áudio...');
    return window.pywebview.api.video_cutter_add_audio(path).then(r => {
        if (!r || !r.success) { veToast((r && r.error) || 'Não foi possível abrir o áudio'); return; }
        let m = VE.media.find(x => x.kind === 'audio' && x.path === r.path);
        if (!m) { m = { id: VE.media.length, kind: 'audio', path: r.path, name: r.name }; VE.media.push(m); }
        Object.assign(m, { dur: r.dur, peaks: r.peaks || [], url: r.url, quadros: r.quadros });
        const st = veSnapFrame(VE.playhead), b = st + r.dur, novo = { m: m.id };
        const usadas = VE.clips.filter(veOcupaA).map(c => c.tr);
        const ultima = usadas.length ? Math.max(...usadas) : -1;
        const livre = k => !veTrkLocked(k) && veTrackFree(k, st, b, novo);
        let tr = [0, 1, 2, 3].find(k => k > ultima && livre(k));
        if (tr == null) tr = [0, 1, 2, 3].find(livre);
        if (tr == null) { veToast('Não há trilha de áudio livre a partir da agulha (A1 a A4)'); return; }
        vePushHistory();
        const clip = { tr, st, s: 0, e: r.dur, m: m.id };
        VE.clips.push(clip);
        VE.sel = VE.clips.indexOf(clip);
        veRelayout();
        veAfterEdit(VE.playhead);
        veAudioRegistrar(m.id, r.url, r.quadros);
        // trilha compacta abre para a forma de onda aparecer
        const linha = VE_TRACKS.find(x => x.id === 'A' + (tr + 1));
        if (linha && linha.h < 40) { linha.h = 48; veBuildHeads(); veLsSet('ve-track-h', JSON.stringify(VE_TRACKS.map(t => t.h))); veDraw(); }
        veToast(`Áudio adicionado em A${tr + 1}`);
    });
}

// Tira da trilha `tr` tudo que estiver entre a e b (sobrescrever), exceto o índice `exceto`
function veCarve(clips, tr, a, b, exceto, novo) {
    const out = [], tiny = veFrame() * 0.5;
    clips.forEach((o, j) => {
        if (j === exceto) return;
        const en = veEnd(o);
        if (o.tr !== tr || en <= a + VE_EPS || o.st >= b - VE_EPS || (novo && !veConflita(o, novo))) { out.push(o); return; }
        if (o.st < a && a - o.st > tiny) out.push({ ...o, e: veSrcAt(o, a) });
        if (en > b && en - b > tiny) out.push({ ...o, st: b, s: veSrcAt(o, b) });
    });
    return out;
}

function veTrackFree(tr, a, b, novo) {
    return !VE.clips.some(o => o.tr === tr && o.st < b - VE_EPS && veEnd(o) > a + VE_EPS && (!novo || veConflita(o, novo)));
}

function veInsertImageClip(m, drop, deslocamento, rotulo = 'Imagem adicionada') {
    let st = VE.playhead, tr = -1;
    const wrap = $ve('ve-tl-wrap').getBoundingClientRect();
    if (drop && drop.x >= wrap.left && drop.x <= wrap.right && drop.y >= wrap.top + VE_RULER && drop.y <= wrap.bottom) {
        st = Math.max(0, VE.view + (drop.x - wrap.left) / VE.pps);
        const row = veRowAt(drop.y - wrap.top);
        if (row && row.kind !== 'l') tr = veTrackIndex(row);
    }
    st = veSnapFrame(st + deslocamento);
    const b = st + VE_IMG_DUR;
    if (tr < 0) {
        // primeira trilha livre acima do vídeo (V2, V3, V4); se todas ocupadas, V4 sobrescreve
        tr = [1, 2, 3].find(k => !veTrkLocked(k) && veTrackFree(k, st, b, { m: m.id }));
        if (tr == null) tr = [3, 2, 1].find(k => !veTrkLocked(k));
        if (tr == null) { veAvisoBloqueio(); return; }
    }
    if (veTrkLocked(tr)) { veAvisoBloqueio(); return; }
    vePushHistory();
    const clip = { tr, st, s: 0, e: VE_IMG_DUR, m: m.id };
    clip.p = veDefProps(clip);
    VE.clips = veCarve(VE.clips, tr, st, b, -1, clip);
    VE.clips.push(clip);
    VE.sel = VE.clips.indexOf(clip);
    veRelayout();
    veAfterEdit(VE.playhead);
    veTab('props');
    veToast(`${rotulo} em V${tr + 1}`);
}

// ── menu do botão direito no clipe: cor do rótulo, ganho, apagar ──
function veClipMenu(i, x, y, doc) {
    veClipMenuFechar();
    const c = VE.clips[i];
    const m = doc.createElement('div');
    m.className = 've-ctx';
    m.innerHTML = `
        <div class="ve-ctx-title">${veNomeClipe(c)} ${i + 1}</div>
        <div class="ve-ctx-sub">Cor do rótulo</div>
        <div class="ve-ctx-cores">
            <button class="ve-ctx-cor padrao${c.cor ? '' : ' on'}" data-cor="" title="Padrão"></button>
            ${VE_CORES.map(([k, nome, hex]) => `<button class="ve-ctx-cor${c.cor === k ? ' on' : ''}" data-cor="${k}" title="${nome}" style="--c:${hex}"></button>`).join('')}
        </div>
        <div class="ve-ctx-sep"></div>
        ${veIsImage(c) ? '' : '<button class="ve-ctx-item" data-ctx="gain">Ganho de áudio…<kbd>G</kbd></button>'}
        <button class="ve-ctx-item" data-ctx="pp">Propriedades${veIsImage(c) ? '' : ' (velocidade, volume)'}</button>
        <button class="ve-ctx-item" data-ctx="fx">Controles de efeito</button>
        <button class="ve-ctx-item perigo" data-ctx="del">Apagar clipe<kbd>D</kbd></button>`;
    doc.body.appendChild(m);
    // dentro da janela
    const w = doc.defaultView, r = m.getBoundingClientRect();
    m.style.left = Math.max(6, Math.min(x, w.innerWidth - r.width - 6)) + 'px';
    m.style.top = Math.max(6, Math.min(y, w.innerHeight - r.height - 6)) + 'px';
    m.addEventListener('click', e => {
        const cor = e.target.closest('[data-cor]'), it = e.target.closest('[data-ctx]');
        if (cor) {
            const alvo = VE.clips[i];
            if (alvo && (alvo.cor || '') !== cor.dataset.cor) {
                vePushHistory();
                VE.clips[i] = { ...alvo };
                if (cor.dataset.cor) VE.clips[i].cor = cor.dataset.cor; else delete VE.clips[i].cor;
                veRefresh();
            }
        } else if (it) {
            VE.sel = i;
            if (it.dataset.ctx === 'gain') veOpenGain();
            else if (it.dataset.ctx === 'fx') veTab('props');
            else if (it.dataset.ctx === 'pp') { vedShow('pp'); veRefresh(); }
            else if (it.dataset.ctx === 'del') veDeleteClip(i);
        } else return;
        veClipMenuFechar();
    });
    const fora = e => { if (!m.contains(e.target)) veClipMenuFechar(); };
    const tecla = e => { if (e.key === 'Escape') veClipMenuFechar(); };
    setTimeout(() => { doc.addEventListener('pointerdown', fora, true); doc.addEventListener('keydown', tecla, true); }, 0);
    VE._ctx = { m, fechar: () => { doc.removeEventListener('pointerdown', fora, true); doc.removeEventListener('keydown', tecla, true); m.remove(); } };
}
function veClipMenuFechar() { if (VE._ctx) { VE._ctx.fechar(); VE._ctx = null; } }

// ── camada de ajuste ──
function veAddAdjust() {
    if (!VE.ready) return;
    if (VE.info && VE.info.audio_only) { veToast('Camada de ajuste precisa de um vídeo'); return; }
    let m = VE.media.find(x => x.kind === 'ajuste');
    if (!m) { m = { id: VE.media.length, kind: 'ajuste', name: 'Camada de ajuste' }; VE.media.push(m); }
    veInsertImageClip(m, null, 0, 'Camada de ajuste adicionada');
    veToast('Camada de ajuste criada: arraste efeitos (ou use Luz e Cor) nela para afetar tudo o que está abaixo');
}

// Aplica os efeitos da camada de ajuste sobre o que já foi desenhado no monitor (as trilhas de baixo)
function veAdjDraw(ctx, cv, c, pv) {
    const op = Math.max(0, Math.min(1, veProps(c).op / 100));
    if (op <= 0 || !veFxActive(c).length) return;
    const res = veFxRender(c, cv, { w: VE.seqW, h: VE.seqH }, pv);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = op;
    ctx.drawImage(res, 0, 0, cv.width, cv.height);
    ctx.restore();
}

// ── players extras: vídeos das camadas de baixo aparecendo por trás de camadas transparentes ──
// O projeto tem um vídeo só; cada clipe visível ao mesmo tempo precisa de um player no seu instante.
const VEX = [];

function veExtraPlayer(n) {
    while (VEX.length <= n) {
        const x = document.createElement('video');
        x.muted = true;
        x.preload = 'auto';
        x.crossOrigin = 'anonymous';
        x.addEventListener('seeked', () => { if (!VE.playing) veDrawMonitor(); });
        x.addEventListener('loadeddata', () => veDrawMonitor());
        VEX.push(x);
    }
    // URL própria por player: com a mesma URL o WebView divide o carregamento e o player
    // principal pode travar buscando o quadro
    const base = veDeckA().src, x = VEX[n];
    if (x._base !== base) {
        x._base = base;
        x.src = base.startsWith('blob:') ? base : base + (base.includes('?') ? '&' : '?') + 'camada=' + (n + 1);
        x.load();
    }
    return x;
}

function veSyncExtra(x, srcT, taxa = VE.rate) {
    if (x.readyState < 1) return;
    if (VE.playing) {
        if (x.playbackRate !== taxa) x.playbackRate = taxa;
        if (x.paused) x.play().catch(() => {});
        if (!x.seeking && Math.abs(x.currentTime - srcT) > 0.2) x.currentTime = srcT;
    } else {
        if (!x.paused) x.pause();
        if (!x.seeking && Math.abs(x.currentTime - srcT) > 0.02) x.currentTime = srcT;
    }
}

// Perto do fim do trecho a reserva se prepara para o seguinte (quando ele começa em outro ponto do vídeo):
// busca um pouco ANTES do ponto de entrada e, nos últimos VE_PREROLL s, já toca sem som, acertando a própria
// velocidade a cada quadro para chegar ao ponto de entrada junto com o corte. Player parado leva ~2 quadros
// para voltar a andar; assim, na troca, ele já está rodando e o corte sai seco.
const VE_PREROLL = 0.6;

function vePreloadNext() {
    const c = VE.clips[VE.cur];
    if (!c || !veVideo().src) return;
    const fim = veEnd(c), falta = fim - VE.playhead;
    if (falta > 1.5) return;
    const j = veTopAt(fim + 0.01);
    if (j < 0 || j === VE.cur) return;
    const n = VE.clips[j], alvo = veSrcAt(n, fim);
    if (Math.abs(alvo - c.e) < 0.03) return;   // continua do mesmo ponto: o player atual segue sozinho
    const r = veReserva();
    if (VEDK.i !== j || Math.abs(VEDK.t - alvo) > 0.02) {
        if (r === VEDK.b) veDeckB();   // garante o arquivo certo no deck B
        if (!r.paused) r.pause();
        r.muted = true;
        const ini = Math.max(0, alvo - VE_PREROLL);
        try { r.currentTime = ini; } catch (e) { return; }
        VEDK.i = j;
        VEDK.t = alvo;
        VEDK.ini = ini;
        return;
    }
    // pré-rolagem: começa a tocar quando faltar o mesmo tanto que separa o ponto de busca do ponto de entrada,
    // mais o tempo que um player parado leva para arrancar (VE_ARRANQUE). Sem mexer na velocidade: trocar o
    // playbackRate a cada quadro reinicia o player e ele engasga.
    if (!VE.playing || r.seeking || r.readyState < 2) return;
    if (!r.paused) { veReservaToque(r); return; }
    if (falta / VE.rate > (alvo - VEDK.ini) / veTaxa(n) + VE_ARRANQUE) return;
    r.playbackRate = veTaxa(n);
    r.play().catch(() => {});
}

// Um vídeo invisível que ninguém desenha não atualiza a imagem no navegador, mesmo tocando: na troca o
// primeiro desenho pegaria um quadro velho. Desenhar a reserva num canvas de 2x2 a cada quadro a mantém em dia.
function veReservaToque(r) {
    if (!VEDK.toque) { const c = document.createElement('canvas'); c.width = c.height = 2; VEDK.toque = c.getContext('2d'); }
    try { VEDK.toque.drawImage(r, 0, 0, 2, 2); } catch (e) { /* ainda sem quadro */ }
}
const VE_ARRANQUE = 0.08;

// Para a reserva (parou a reprodução ou pulou para outro ponto: a preparação recomeça)
function veReservaParar() {
    const r = veReservaExiste();
    if (r && !r.paused) r.pause();
    VEDK.i = -1;
}

// Pausa os players que não estão em uso (a partir do índice n); n = 0 com `limpar` solta o arquivo
function veParkExtras(n, limpar) {
    VEX.slice(n).forEach(x => {
        if (!x.paused) x.pause();
        if (limpar && x.getAttribute('src')) { x.removeAttribute('src'); x._base = null; x.load(); }
    });
}

// ── monitor: desenha as camadas visíveis na agulha, de baixo para cima ──
// Redesenho pedido por slider/arraste: no máximo um por quadro da tela (vários eventos viram um desenho)
let veMonQueued = false;
function veDrawMonitorSoon() {
    if (veMonQueued) return;
    veMonQueued = true;
    veRaf($ve('ve-canvas'), () => { veMonQueued = false; veDrawMonitor(); });
}

// Pixels da prévia por pixel do quadro: o tamanho em que o monitor aparece na tela (com o zoom e a
// densidade da tela), até 1920 px no lado maior. Monitor pequeno = menos pixels para compor e para os efeitos,
// sem perda visível. Em degraus de 1/8 para não recriar o canvas a cada pixel de redimensionamento.
function veMonitorScale() {
    const cap = Math.min(1, 1920 / Math.max(VE.seqW, VE.seqH));
    const scr = $ve('ve-screen');
    if (!scr || !scr.clientWidth) return cap;
    const dpr = scr.ownerDocument.defaultView.devicePixelRatio || 1;
    const tela = veFitScale() * VEM.mz * dpr;
    return Math.min(cap, Math.max(0.125, Math.ceil(tela * 8) / 8));
}

function veDrawMonitor() {
    const cv = $ve('ve-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!VE.ready) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
    const t = VE.playhead, v = veVideo();
    let vis = VE.clips
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !veIsAudio(c) && !veTrkHidden(c.tr) && t >= c.st - VE_EPS && t < veEnd(c) - VE_EPS)
        .sort((a, b) => a.c.tr - b.c.tr);
    // o que está abaixo de um vídeo que cobre o quadro inteiro não aparece: nem decodifica
    const cobre = vis.map(({ c }) => !veIsImage(c) && veIsPlain(c)).lastIndexOf(true);
    if (cobre > 0) vis = vis.slice(cobre);
    let extra = 0, falta = false;
    const itens = vis.map(({ c, i }) => {
        let src = null;
        if (veIsAdj(c)) {
            src = 'ajuste';
        } else if (veIsTexto(c)) {
            src = veTxCanvas(c, veMonitorScale() * veProps(c).sc / 100).cv;   // desenhado na resolução em que aparece
        } else if (veIsImage(c)) {
            const m = veMediaOf(c);
            if (m.img && m.img.complete && m.w) src = m.img;
        } else if (i === VE.cur) {
            // o player ativo (dá o som e o relógio); se ele estiver buscando, vale o quadro que a reserva
            // deixou esperando (vePreloadNext)
            const r = veReservaExiste();
            if (v.readyState >= 2 && !v.seeking) src = v;
            else if (r && VEDK.i === i && r.readyState >= 2 && !r.seeking) src = r;
            else falta = true;
        } else if (v.src) {
            // vídeo de camada de baixo (transparência/dupla exposição): player extra sem som
            const x = veExtraPlayer(extra++);
            veSyncExtra(x, veSrcAt(c, t), veTaxa(c));
            if (x.readyState >= 2) src = x;
        }
        return { c, i, src };
    });
    veParkExtras(extra);
    // desenha em coordenadas do quadro
    const pv = veMonitorScale();
    const cw = Math.round(VE.seqW * pv), ch = Math.round(VE.seqH * pv);
    const novo = cv.width !== cw || cv.height !== ch;
    // sem quadro do vídeo principal (buscando): mantém o último quadro na tela em vez de piscar preto
    // (no máximo 600 ms, para um vídeo com erro não congelar o monitor)
    if (falta && !novo) {
        const agora = performance.now();
        if (!VE._monHold) VE._monHold = agora;
        if (agora - VE._monHold < 600) return;
    }
    VE._monHold = 0;
    if (novo) { cv.width = cw; cv.height = ch; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(pv, 0, 0, pv, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    itens.forEach(({ c, src }) => {
            if (!src) return;
            if (src === 'ajuste') { veAdjDraw(ctx, cv, c, pv); return; }
            const p = veProps(c), sz = veMediaSize(c);
            src = veFxRender(c, src, sz, pv * p.sc / 100);   // efeitos rodam antes do movimento (como no Premiere)
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, p.op / 100));
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            const k = p.sc / 100;
            ctx.scale(k, k);
            ctx.drawImage(src, -sz.w / 2, -sz.h / 2, sz.w, sz.h);
            ctx.restore();
        });
    veTxDesenhar(ctx);
    // contorno do clipe selecionado visível (ajuda a posicionar)
    const cs = VE.clips[VE.sel];
    if (cs && !veIsAdj(cs) && t >= cs.st - VE_EPS && t < veEnd(cs) - VE_EPS && (veIsImage(cs) || !veIsDefaultProps(cs))) {
        const p = veProps(cs), sz = veMediaSize(cs), k = p.sc / 100;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.strokeStyle = 'rgba(249,115,22,0.9)';
        ctx.lineWidth = 2 / pv;
        ctx.setLineDash([8 / pv, 5 / pv]);
        ctx.strokeRect(-sz.w * k / 2, -sz.h * k / 2, sz.w * k, sz.h * k);
        ctx.restore();
    }
}

// ── painel de propriedades ──
function veRenderProps() {
    vePpRender();
    const c = VE.clips[VE.sel];
    $ve('ve-props-empty').hidden = !!c;
    $ve('ve-props').hidden = !c;
    if (!c) { VEFX.key = ''; veLcRender(); return; }
    const m = veMediaOf(c);
    const aud = veIsAudio(c);
    $ve('ve-props-title').innerHTML = aud
        ? `Clipe ${VE.sel + 1}<span>Áudio · ${veEsc(m.name || '')} · A${c.tr + 1}</span><small class="ve-props-nota">Clipe só de som: ajuste o volume com G (ganho) ou pelo botão direito.</small>`
        : `Clipe ${VE.sel + 1}<span>${veIsAdj(c) ? 'Camada de ajuste' : veIsTexto(c) ? 'Texto · ' + veEsc(veNomeTexto(c)) : veIsImage(c) ? 'Imagem · ' + veEsc(m.name || '') : 'Vídeo'} · V${c.tr + 1}</span>`;
    // camada de ajuste: só opacidade (dosa o efeito); escala/posição/rotação não se aplicam. Áudio: nada.
    const adj = veIsAdj(c);
    $ve('ve-props').querySelectorAll('[data-prop]').forEach(el => {
        const row = el.closest('.ve-prop');
        if (row) row.hidden = aud || (adj && el.dataset.prop !== 'op');
    });
    $ve('ve-props').querySelectorAll('.ve-props-actions').forEach(el => { el.hidden = adj || aud; });
    const p = veProps(c);
    $ve('ve-props').querySelectorAll('[data-prop]').forEach(el => {
        const k = el.dataset.prop;
        if (el.dataset.range === 'x') { el.min = -VE.seqW; el.max = VE.seqW * 2; el.step = 1; }
        if (el.dataset.range === 'y') { el.min = -VE.seqH; el.max = VE.seqH * 2; el.step = 1; }
        if (el.ownerDocument.activeElement !== el) el.value = veRound(p[k], k === 'x' || k === 'y' ? 0 : 1);
    });
    // cronômetro / ◆ de cada propriedade
    const dentro = veInClip(c), tl = veKfTime(c);
    let naAgulha = null;
    VE_KF_PROPS.forEach(k => {
        const head = $ve('ve-props').querySelector(`.ve-prop-head[data-kf="${k}"]`);
        if (!head) return;
        const on = veKfOn(c, k), j = on && dentro ? veKfIndex(c.k[k], tl) : -1;
        head.classList.toggle('anim', on);
        head.querySelector('.ve-kf-add').classList.toggle('on', j >= 0);
        if (j >= 0 && !naAgulha) naAgulha = c.k[k][j];
    });
    const box = $ve('ve-kf-interp');
    box.hidden = !naAgulha;
    if (naAgulha) {
        const i = naAgulha.i || 'lin';
        box.querySelectorAll('[data-i]').forEach(b => b.classList.toggle('active', b.dataset.i === i));
        veKfGraphDraw(naAgulha);
    }
    veRenderFxControls();
    veLcRender();
}

function veSetProp(k, val) {
    const c = VE.clips[VE.sel];
    if (!c || !isFinite(val)) return;
    if (k === 'sc') val = Math.max(0.5, Math.min(2000, val));
    if (k === 'op') val = Math.max(0, Math.min(100, val));
    if (veKfOn(c, k) && !veInClip(c)) { veToast('Leve a agulha para dentro do clipe para criar o quadro-chave'); return; }
    veApplyProps(c, { [k]: val });
    veRenderProps();
    veDrawMonitorSoon();
    if (veKfOn(c, k)) veDraw();
}

function vePropsReset() {
    const c = VE.clips[VE.sel];
    if (!c) return;
    vePushHistory();
    c.p = veIsImage(c) ? veDefProps(c) : undefined;
    if (!c.p) delete c.p;
    delete c.k;
    veRefresh();
}

function vePropsCenter() {
    const c = VE.clips[VE.sel];
    if (!c) return;
    vePushHistory();
    veApplyProps(c, { x: VE.seqW / 2, y: VE.seqH / 2 });
    veRefresh();
}

// Cabeçalho de cada propriedade: ⏱ nome ……… ◀ ◆ ▶ (montado aqui para não repetir no HTML)
function veBuildKfHeads() {
    document.querySelectorAll('#ve-props .ve-prop').forEach(row => {
        const k = row.querySelector('input[type=range]')?.dataset.prop;
        const label = row.querySelector(':scope > label');
        if (!k || !label) return;
        const head = document.createElement('div');
        head.className = 've-prop-head';
        head.dataset.kf = k;
        head.innerHTML =
            `<button class="ve-kf-sw" data-kfa="toggle" title="Animar ${VE_KF_NAMES[k]} (liga/desliga os quadros-chave)">` +
            '<svg viewBox="0 0 16 16"><circle cx="8" cy="9.2" r="5.3"/><path d="M8 9.2V6.2M6.3 1.8h3.4M12.2 4.4l1-1"/></svg></button>' +
            `<label>${label.textContent}</label>` +
            '<span class="ve-kf-nav">' +
            '<button data-kfa="prev" title="Quadro-chave anterior">‹</button>' +
            '<button class="ve-kf-add" data-kfa="add" title="Adicionar/remover quadro-chave na agulha"><i></i></button>' +
            '<button data-kfa="next" title="Próximo quadro-chave">›</button></span>';
        label.replaceWith(head);
    });
    const actions = document.querySelector('#ve-props .ve-props-actions');
    const interp = document.createElement('div');
    interp.className = 've-kf-interp';
    interp.id = 've-kf-interp';
    interp.hidden = true;
    interp.innerHTML = '<span>Interpolação</span><div class="ve-kf-btns">' +
        Object.entries(VE_KF_INTERP).map(([i, n]) => `<button data-i="${i}">${n}</button>`).join('') + '</div>' +
        '<div class="ve-kf-graph"><canvas id="ve-kf-graph" title="Arraste as alças para mudar a curva (duplo clique volta ao linear)"></canvas>' +
        '<div class="ve-kf-graph-leg"><span class="val">Valor</span><span class="vel">Velocidade</span></div></div>';
    actions.before(interp);
    veKfGraphInit($ve('ve-kf-graph'));
    $ve('ve-props').addEventListener('click', e => {
        const b = e.target.closest('[data-kfa]');
        if (b) {
            const k = b.closest('.ve-prop-head').dataset.kf;
            ({ toggle: () => veKfToggle(k), add: () => veKfAddRemove(k),
               prev: () => veKfJump(k, -1), next: () => veKfJump(k, 1) })[b.dataset.kfa]();
            return;
        }
        const it = e.target.closest('#ve-kf-interp [data-i]');
        if (it) veKfSetInterp(it.dataset.i);
    });
}

// ── gráfico da curva (como o editor de gráficos do Premiere/AE) ──
// Mostra o trecho que sai do quadro-chave na agulha: curva de valor (com as duas alças) e, por baixo,
// a curva de velocidade (derivada). Arrastar uma alça muda a curva de todos os quadros-chave na agulha.
const VE_KG = { y0: -0.35, y1: 1.35, pad: 10, q: null, drag: -1 };

function veKgMap(cv) {
    const w = cv.clientWidth, h = cv.clientHeight, p = VE_KG.pad;
    return {
        w, h,
        X: x => p + x * (w - 2 * p),
        Y: y => h - p - (y - VE_KG.y0) / (VE_KG.y1 - VE_KG.y0) * (h - 2 * p),
        ix: px => (px - p) / (w - 2 * p),
        iy: py => VE_KG.y0 + (h - p - py) / (h - 2 * p) * (VE_KG.y1 - VE_KG.y0),
    };
}

function veKfGraphDraw(q) {
    const cv = $ve('ve-kf-graph');
    if (!cv) return;
    if (q) VE_KG.q = q;
    q = VE_KG.q;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const m = veKgMap(cv);
    // grade: 0 e 1 do valor, 1/4 do tempo
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let n = 0; n <= 4; n++) { const x = Math.round(m.X(n / 4)) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    [0, 1].forEach(v => { const y = Math.round(m.Y(v)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); });
    ctx.stroke();
    if (!q) return;
    const hold = q.i === 'hold';
    const bz = hold ? null : (veKfCurve(q) || VE_KF_BEZ.lin);
    const N = 80, ys = [];
    for (let n = 0; n <= N; n++) ys.push(hold ? (n === N ? 1 : 0) : veBezY(bz, n / N));
    // velocidade (derivada), normalizada para caber na faixa de 0 a 1
    const vs = [];
    for (let n = 0; n <= N; n++) {
        const a = ys[Math.max(0, n - 1)], b = ys[Math.min(N, n + 1)];
        vs.push(hold ? 0 : (b - a) / ((Math.min(N, n + 1) - Math.max(0, n - 1)) / N));
    }
    const vmax = Math.max(1.5, ...vs.map(Math.abs));
    ctx.beginPath();
    ctx.moveTo(m.X(0), m.Y(0));
    vs.forEach((v, n) => ctx.lineTo(m.X(n / N), m.Y(Math.max(0, v) / vmax)));
    ctx.lineTo(m.X(1), m.Y(0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.13)';
    ctx.fill();
    ctx.beginPath();
    vs.forEach((v, n) => ctx[n ? 'lineTo' : 'moveTo'](m.X(n / N), m.Y(Math.max(0, v) / vmax)));
    ctx.strokeStyle = 'rgba(56,189,248,0.75)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    // curva de valor
    ctx.beginPath();
    if (hold) { ctx.moveTo(m.X(0), m.Y(0)); ctx.lineTo(m.X(1), m.Y(0)); ctx.lineTo(m.X(1), m.Y(1)); }
    else ys.forEach((y, n) => ctx[n ? 'lineTo' : 'moveTo'](m.X(n / N), m.Y(y)));
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (hold) return;
    // alças
    const [x1, y1, x2, y2] = bz;
    [[0, 0, x1, y1], [1, 1, x2, y2]].forEach(([ax, ay, hx, hy], n) => {
        ctx.beginPath();
        ctx.moveTo(m.X(ax), m.Y(ay));
        ctx.lineTo(m.X(hx), m.Y(hy));
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(m.X(hx), m.Y(hy), VE_KG.drag === n ? 5.5 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = VE_KG.drag === n ? '#fbbf24' : '#fff';
        ctx.fill();
    });
    [[0, 0], [1, 1]].forEach(([x, y]) => { ctx.fillStyle = '#F97316'; ctx.fillRect(m.X(x) - 3, m.Y(y) - 3, 6, 6); });
}

function veKfGraphInit(cv) {
    const alcaEm = e => {
        const q = VE_KG.q;
        if (!q || q.i === 'hold') return -1;
        const bz = veKfCurve(q) || VE_KF_BEZ.lin, m = veKgMap(cv), r = cv.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        let best = -1, dmin = 12;
        [[bz[0], bz[1]], [bz[2], bz[3]]].forEach(([x, y], n) => {
            const d = Math.hypot(m.X(x) - px, m.Y(y) - py);
            if (d < dmin) { dmin = d; best = n; }
        });
        return best;
    };
    cv.addEventListener('pointerdown', e => {
        const n = alcaEm(e);
        if (n < 0) return;
        e.preventDefault();
        cv.setPointerCapture(e.pointerId);
        vePushHistory();
        VE_KG.drag = n;
        veKfGraphDraw();
    });
    cv.addEventListener('pointermove', e => {
        if (VE_KG.drag < 0) { cv.style.cursor = alcaEm(e) >= 0 ? 'grab' : ''; return; }
        const m = veKgMap(cv), r = cv.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, m.ix(e.clientX - r.left)));
        const y = Math.min(VE_KG.y1, Math.max(VE_KG.y0, m.iy(e.clientY - r.top)));
        const bz = [...(veKfCurve(VE_KG.q) || VE_KF_BEZ.lin)];
        bz[VE_KG.drag * 2] = x;
        bz[VE_KG.drag * 2 + 1] = y;
        veKfSetInterp('bez', bz, true);
    });
    const fim = () => { if (VE_KG.drag < 0) return; VE_KG.drag = -1; veKfGraphDraw(); };
    cv.addEventListener('pointerup', fim);
    cv.addEventListener('pointercancel', fim);
    cv.addEventListener('dblclick', () => { if (VE_KG.q) veKfSetInterp('lin'); });
    if (window.ResizeObserver) new ResizeObserver(() => veKfGraphDraw()).observe(cv);
}

function veInitProps() {
    veBuildKfHeads();
    const box = $ve('ve-props');
    // um passo no histórico por gesto (arrastar o slider inteiro = um Ctrl+Z)
    box.addEventListener('input', e => {
        const el = e.target.closest('[data-prop]');
        if (!el) return;
        if (!VE._propEdit) { vePushHistory(); VE._propEdit = true; }
        veSetProp(el.dataset.prop, parseFloat(String(el.value).replace(',', '.')));
    });
    box.addEventListener('change', () => { VE._propEdit = false; });
    box.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
}

// ── exportação: base (vídeo sem transformação) + áudio + camadas por cima ──
function veFlattenWith(pred, silencio) {
    const pts = veEditPoints();
    if (pts[pts.length - 1] < VE.dur) pts.push(VE.dur);
    const out = [];
    for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k], q = pts[k + 1];
        if (q - p < 1e-4) continue;
        const mid = (p + q) / 2;
        let best = -1;
        VE.clips.forEach((c, i) => {
            if (pred(c) && mid >= c.st && mid < veEnd(c) && (best < 0 || c.tr > VE.clips[best].tr)) best = i;
        });
        if (best < 0) { out.push({ gap: q - p }); continue; }
        const c = VE.clips[best];
        if (silencio && silencio(c)) { out.push({ gap: q - p }); continue; }
        out.push({ start: veSrcAt(c, p), end: veSrcAt(c, q), gain: c.g || 0 });
    }
    return out;
}

function veExportPlan() {
    // trilha oculta (olho) não entra; o som é o do clipe de vídeo de cima (como na prévia), mudo = silêncio
    const isVid = c => !veIsImage(c) && !veIsAudio(c) && !veTrkHidden(c.tr);
    // clipe com velocidade mudada vai como camada (no ffmpeg: setpts)
    const liso = c => veIsPlain(c) && veVel(c) === 1;
    const base = veFlattenWith(c => isVid(c) && liso(c));
    const audio = veFlattenWith(isVid, c => veTrkMuted(c.tr));
    // camadas: imagens e vídeos transformados; um vídeo "normal" acima de alguma camada também
    // precisa entrar (senão a camada apareceria por cima dele)
    const overlays = VE.clips.filter(c => !veIsAudio(c) && !veTrkHidden(c.tr) && (veIsImage(c) || !liso(c)));
    const cobre = c => isVid(c) && liso(c) &&
        overlays.some(o => o.tr < c.tr && o.st < veEnd(c) - VE_EPS && veEnd(o) > c.st + VE_EPS);
    const camadas = VE.clips
        .filter(c => overlays.includes(c) || cobre(c))
        .sort((a, b) => a.tr - b.tr || a.st - b.st)
        .map(c => {
            const p = veStaticProps(c), m = veMediaOf(c);
            // texto: PNG desenhado f vezes maior (nítido na maior escala dele); a escala desconta isso
            const png = veIsTexto(c) ? (VE._txPng && VE._txPng.get(c)) : null, f = png ? png.f : 1;
            // quadros-chave em tempo da camada (0 = início do clipe na timeline)
            const kf = {};
            VE_KF_PROPS.forEach(k => { if (veKfOn(c, k)) kf[k] = c.k[k].map(q => [(q.t - c.s) / veVel(c), k === 'sc' ? q.v / f : q.v, q.i || 'lin', veKfCurve(q)]); });
            const sz = png ? { w: png.w, h: png.h } : veMediaSize(c);
            return { tipo: veIsAdj(c) ? 'ajuste' : veIsImage(c) ? 'imagem' : 'video', path: png ? png.path : veIsImage(c) ? m.path || null : null,
                     st: c.st, s: veIsImage(c) ? 0 : c.s, e: veIsImage(c) ? veLen(c) : c.e,
                     sc: p.sc / f, x: p.x, y: p.y, rot: p.rot, op: p.op, kf,
                     fx: veFxExport(c), mw: sz.w, mh: sz.h, v: veVel(c) };
        });
    // o arquivo de cada clipe com som (null = o vídeo aberto)
    const mix = veMixClipes().map(([st, s0, e0, g, id, v, tom]) => [st, s0, e0, g, id ? VE.media[id].path : null, v, tom]);
    return { base, audio, camadas, mix };
}

// ── legendas na timeline: clicar seleciona; arrastar move; pelas bordas, apara ──
function veLegPointer(e, x, t) {
    const L = VE.legendas || [];
    let i = -1, lado = null;
    for (let k = 0; k < L.length; k++) {
        const xl = (L[k].st - VE.view) * VE.pps, xr = (L[k].en - VE.view) * VE.pps;
        if (xr - xl >= 14 && Math.abs(x - xl) <= 5) { i = k; lado = 'l'; break; }
        if (xr - xl >= 14 && Math.abs(x - xr) <= 5) { i = k; lado = 'r'; break; }
        if (t >= L[k].st && t <= L[k].en) { i = k; }
    }
    VETX.legSel = i;
    VE.sel = -1;
    if (i >= 0 && e.button === 0) {
        VE.drag = { mode: 'leg', i, lado, x0: e.clientX, t0: t, c0: { ...L[i] }, active: false };
        VETX.aba = 'leg';
        if (VED.el && VED.el.pp) vedShow('pp');
    }
    veRefresh();
}

function veLegArrastar(e, t) {
    const d = VE.drag, L = VE.legendas;
    if (!d.active) {
        if (Math.abs(e.clientX - d.x0) < 4) return;   // ainda é um clique
        d.active = true;
        vePushHistory();
    }
    const c0 = d.c0, dt = veSnapFrame(t) - veSnapFrame(d.t0), len = c0.en - c0.st;
    const ant = L.filter((_, k) => k !== d.i && L[k].en <= c0.st + 1e-3).reduce((m, c) => Math.max(m, c.en), 0);
    const prox = L.filter((_, k) => k !== d.i && L[k].st >= c0.en - 1e-3).reduce((m, c) => Math.min(m, c.st), Infinity);
    let st = c0.st, en = c0.en;
    if (d.lado === 'l') st = Math.min(Math.max(c0.st + dt, ant), c0.en - 0.2);
    else if (d.lado === 'r') en = Math.max(Math.min(c0.en + dt, prox), c0.st + 0.2);
    else { st = Math.min(Math.max(c0.st + dt, ant), prox - len); en = st + len; }
    L[d.i] = { ...L[d.i], st: +st.toFixed(3), en: +en.toFixed(3) };
    veDraw();
    veDrawMonitorSoon();
}

// ── ajuste de duração pelas bordas do clipe ──
function veEdgeAt(x, row) {
    if (!row || row.kind === 'l') return null;
    const tr = veTrackIndex(row);
    for (let i = 0; i < VE.clips.length; i++) {
        const c = VE.clips[i];
        if (c.tr !== tr || (row.kind === 'a' ? !veOcupaA(c) : !veOcupaV(c))) continue;
        const xl = (c.st - VE.view) * VE.pps, xr = (veEnd(c) - VE.view) * VE.pps;
        if (xr - xl < 14) continue;
        if (Math.abs(x - xl) <= 6) return { i, side: 'l' };
        if (Math.abs(x - xr) <= 6) return { i, side: 'r' };
    }
    return null;
}

function veTrimTo(d, t) {
    const c = VE.clips[d.i], c0 = d.c0, en0 = veEnd(c0), v = veVel(c0);
    const vizinhos = VE.clips.filter((o, j) => j !== d.i && o.tr === c0.tr && veConflita(o, c0));
    const img = veIsImage(c), limite = veIsAudio(c) ? veMediaOf(c).dur : VE.srcDur;
    t = veMoveSnap(t, d.i);
    if (d.side === 'l') {
        const prevEnd = Math.max(0, ...vizinhos.filter(o => veEnd(o) <= c0.st + VE_EPS).map(veEnd));
        const minSt = img ? prevEnd : Math.max(prevEnd, c0.st - c0.s / v);
        const st = Math.min(Math.max(t, minSt), en0 - veFrame());
        c.st = st;
        c.s = c0.s + (st - c0.st) * v;
    } else {
        const nextSt = Math.min(Infinity, ...vizinhos.filter(o => o.st >= en0 - VE_EPS).map(o => o.st));
        const maxEn = img ? nextSt : Math.min(nextSt, c0.st + (limite - c0.s) / v);
        const en = Math.max(Math.min(t, maxEn), c0.st + veFrame());
        c.e = c0.s + (en - c0.st) * v;
    }
}

function veMoveSnap(t, excluir) {
    t = Math.max(0, t);
    if (!VE.snap) return veSnapFrame(t);
    const lim = 8 / VE.pps;
    let best = null, bd = lim;
    for (const p of veEditPoints(excluir).concat([VE.playhead])) {
        if (Math.abs(p - t) < bd) { bd = Math.abs(p - t); best = p; }
    }
    return best != null ? best : veSnapFrame(t);
}

// ─────────────────────────── projeto (.vcnvt) ───────────────────────────
// Ctrl+S salva, Ctrl+Shift+S salva como, Ctrl+O abre (vídeo ou projeto). O arquivo guarda a timeline
// e os caminhos das mídias (nada é copiado). Duplo clique num .vcnvt abre o app direto aqui.

function veUpdateTitle() {
    const el = $ve('ve-proj');
    if (!el) return;
    const nome = VE.projectPath ? VE.projectPath.split(/[\\/]/).pop().replace(/\.vcnvt$/i, '') : '';
    el.textContent = nome ? nome + (VE.dirty ? ' •' : '') : (VE.ready && VE.dirty ? 'Não salvo •' : '');
    el.title = VE.projectPath || (VE.dirty ? 'Projeto ainda não salvo (Ctrl+S)' : '');
    el.hidden = !el.textContent;
    if (typeof renderTabs === 'function') renderTabs();
}

// Alterações não salvas: a primeira tentativa avisa; repetir em até 5 s confirma e descarta
function veConfirmDiscard() {
    if (!VE.ready || !VE.dirty) return true;
    if (VE._discardAt && Date.now() - VE._discardAt < 5000) { VE._discardAt = 0; return true; }
    VE._discardAt = Date.now();
    veToast('Há alterações não salvas. Salve com Ctrl+S ou repita para descartar.');
    return false;
}

function veProjectData() {
    return {
        app: 'Canivete do Pailer',
        video: VE.path,
        media: VE.media.filter(m => m.kind === 'image' || m.kind === 'ajuste' || m.kind === 'audio' || m.kind === 'texto')
            .map(m => m.kind === 'ajuste' || m.kind === 'texto' ? { id: m.id, kind: m.kind, name: m.name }
                : m.kind === 'audio' ? { id: m.id, kind: 'audio', path: m.path, name: m.name, dur: m.dur }
                : { id: m.id, kind: 'image', path: m.path, name: m.name, w: m.w, h: m.h }),
        clips: VE.clips,
        trilhas: VE_TRK,
        texto: { palavras: VETX.palavras, idioma: VETX.idioma, chave: VETX.chave },
        legendas: VE.legendas || [], legEstilo: VE.legEstilo || null, legGravar: VE.legGravar !== false,
        inPt: VE.inPt,
        outPt: VE.outPt,
        playhead: VE.playhead,
        view: { pps: VE.pps, x: VE.view },
        salvo_em: new Date().toISOString(),
    };
}

function veSaveProject(comoNovo) {
    if (!VE.ready) { veToast('Abra um vídeo antes de salvar'); return Promise.resolve(false); }
    return window.pywebview.api.ve_project_save(VE.projectPath, JSON.stringify(veProjectData()), !!comoNovo).then(r => {
        if (!r || !r.success) { if (r && r.error) veToast('Não foi possível salvar: ' + r.error); return false; }
        VE.projectPath = r.path;
        VE.dirty = false;
        veUpdateTitle();
        veToast('Projeto salvo: ' + r.name);
        return true;
    });
}

// Fecha o projeto (aba do editor fechada): volta à tela "arraste um vídeo"
function veCloseProject() {
    veStop();
    veDeckReset();
    veAudioReset();
    VE_TRK = veTrkNovo();
    veBuildHeads();
    VE.legendas = [];
    VE.legEstilo = null;
    VE.legGravar = true;
    veTxReset();
    const v = veVideo();
    v.pause();
    v.removeAttribute('src');
    v.load();
    veParkExtras(0, true);
    Object.assign(VE, {
        path: null, info: null, dur: 0, srcDur: 0, clips: [], sel: -1, inPt: null, outPt: null, playhead: 0,
        cur: -1, history: [], future: [], thumbs: [], peaks: [], ready: false, dest: null, view: 0, media: [],
        projectPath: null, dirty: false, _pendingProject: null,
    });
    veUpdateUndo();
    $ve('ve-empty').hidden = false;
    $ve('ve-loading').hidden = true;
    $ve('ve-proxy-badge').hidden = true;
    ['ve-export-btn', 've-add-image', 've-add-adjust', 've-save'].forEach(id => { $ve(id).disabled = true; });
    $ve('ve-meta').textContent = 'Nenhum vídeo aberto';
    $ve('ve-clips').innerHTML = '<div class="ve-clips-empty">Abra um vídeo ou áudio para começar.</div>';
    ['ve-sum-orig', 've-sum-final', 've-sum-cut'].forEach(id => { $ve(id).textContent = '—'; });
    veUpdateReadouts();
    veRenderProps();
    veUpdateTitle();
    veDrawMonitor();
    veDraw();
}

function veOpenProject(path) {
    if (VE.exportRunning || !veConfirmDiscard()) return;
    window.pywebview.api.ve_project_open(path || null).then(r => {
        if (!r || !r.success) { if (r && r.error) veToast(r.error); return; }
        const d = r.data;
        if (!d.video || r.missing.includes(d.video)) {
            veToast('O vídeo deste projeto não foi encontrado: ' + (d.video || '?'));
            return;
        }
        VE._pendingProject = { data: d, path: r.path, name: r.name, missing: r.missing || [] };
        VE.dirty = false;
        veOpenPath(d.video);
    });
}

// Chamado pelo Python quando o app abre por duplo clique num .vcnvt
function veOpenProjectExternal(path) {
    if (typeof switchTool === 'function') switchTool('video-cutter');
    setTimeout(() => veOpenProject(path), 60);
}

// Depois que o vídeo do projeto carregou: recoloca imagens, clipes, marcas e visão
function veApplyProject() {
    const { data: d, path, name, missing } = VE._pendingProject;
    VE._pendingProject = null;
    VE.projectPath = path;
    const ids = { 0: 0 };
    (d.media || []).forEach(m => {
        if (m.kind === 'ajuste' || m.kind === 'texto') {
            const nm = { id: VE.media.length, kind: m.kind, name: m.name || (m.kind === 'texto' ? 'Texto' : 'Camada de ajuste') };
            VE.media.push(nm);
            ids[m.id] = nm.id;
            return;
        }
        if (m.kind === 'audio') {
            if (!m.path || missing.includes(m.path)) return;
            const nm = { id: VE.media.length, kind: 'audio', path: m.path, name: m.name, dur: m.dur || 0, peaks: [] };
            VE.media.push(nm);
            ids[m.id] = nm.id;
            window.pywebview.api.video_cutter_add_audio(m.path).then(r => {
                if (!r || !r.success) return;
                Object.assign(nm, { dur: r.dur, peaks: r.peaks || [], url: r.url, quadros: r.quadros });
                veAudioRegistrar(nm.id, r.url, r.quadros);
                veDraw();
            });
            return;
        }
        if (!m.path || missing.includes(m.path)) return;
        const nm = { id: VE.media.length, kind: 'image', path: m.path, name: m.name, img: new Image(), w: m.w || 0, h: m.h || 0 };
        VE.media.push(nm);
        ids[m.id] = nm.id;
        window.pywebview.api.video_cutter_add_media(m.path).then(r => {
            if (!r || !r.success) return;
            nm.url = r.url;
            nm.img.crossOrigin = 'anonymous';
            nm.img.onload = () => { nm.w = nm.img.naturalWidth; nm.h = nm.img.naturalHeight; veDraw(); veDrawMonitor(); };
            nm.img.src = r.url;
        });
    });
    const clips = (d.clips || [])
        .filter(c => !c.m || ids[c.m] != null)
        .map(c => {
            const n = { ...c };
            if (c.m) n.m = ids[c.m]; else { delete n.m; n.e = Math.min(n.e, VE.srcDur); }
            return n;
        })
        .filter(c => c.e - c.s > 1e-3);
    if (clips.length) VE.clips = clips;
    VE.legendas = Array.isArray(d.legendas) ? d.legendas : [];
    VE.legEstilo = d.legEstilo || null;
    VE.legGravar = d.legGravar !== false;
    if (d.texto && Array.isArray(d.texto.palavras)) {
        VETX.palavras = d.texto.palavras;
        VETX.idioma = d.texto.idioma || 'pt';
        VETX.chave = d.texto.chave || '';
        VETX.construidoTexto = false;
    }
    if (d.trilhas && Array.isArray(d.trilhas.v) && Array.isArray(d.trilhas.a)) {
        VE_TRK = veTrkNovo();
        [0, 1, 2, 3].forEach(k => { Object.assign(VE_TRK.v[k], d.trilhas.v[k] || {}); Object.assign(VE_TRK.a[k], d.trilhas.a[k] || {}); });
        veBuildHeads();
    }
    VE.inPt = d.inPt ?? null;
    VE.outPt = d.outPt ?? null;
    VE.sel = -1;
    VE.history = [];
    VE.future = [];
    veUpdateUndo();
    veRelayout();
    if (d.view && d.view.pps > 0) { VE.pps = d.view.pps; VE.view = d.view.x || 0; }
    veAfterEdit(d.playhead || 0);
    VE.dirty = false;
    veUpdateTitle();
    const faltam = missing.filter(p => p !== d.video).length;
    veToast(faltam ? `Projeto aberto — ${faltam} imagem(ns) não encontrada(s); os clipes delas ficaram de fora`
                   : 'Projeto aberto: ' + name.replace(/\.vcnvt$/i, ''));
}

// ─────────────────────────── visão / zoom ───────────────────────────

function veCanvasWidth() { return $ve('ve-tl-wrap').clientWidth || 800; }
function veCanvasHeight() { return $ve('ve-tl-wrap').clientHeight || 200; }
function veFitPps() { return VE.dur > 0 ? (veCanvasWidth() - 16) / VE.dur : 50; }
function veVisibleDur() { return veCanvasWidth() / VE.pps; }

function veClampView() {
    // deixa meia tela livre depois do fim, para dar para arrastar clipes para lá
    const maxView = Math.max(0, VE.dur - veVisibleDur() * 0.5);
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
}

function veBuildHeads() {
    const box = $ve('ve-heads-rows');
    if (!box) return;
    box.innerHTML = VE_TRACKS.map((tr, i) => {
        if (tr.kind === 'l') return `
        <div class="ve-head ve-head-l" data-tr="${i}" style="height:${tr.h}px" title="Legendas (painel Texto)">
            <div class="ve-head-row"><b>LEG</b></div>
            <i class="ve-head-grip" data-grip="${i}" title="Arraste para aumentar ou diminuir a trilha"></i>
        </div>`;
        const k = veTrackIndex(tr), st = (tr.kind === 'v' ? VE_TRK.v : VE_TRK.a)[k] || {};
        const bt = (act, on, titulo, conteudo) =>
            `<button class="ve-hb${on ? ' on' : ''}" data-hact="${act}" data-hk="${k}" data-hkind="${tr.kind}" title="${titulo}">${conteudo}</button>`;
        const lock = bt('lock', st.lock, st.lock ? 'Desbloquear trilha' : 'Bloquear trilha (os clipes não podem ser editados)',
            `<svg class="i"><use href="#i-${st.lock ? 'lock' : 'unlock'}"/></svg>`);
        const extra = tr.kind === 'v'
            ? bt('hide', st.hide, st.hide ? 'Mostrar trilha' : 'Ocultar trilha (não aparece na prévia nem na exportação)',
                `<svg class="i"><use href="#i-${st.hide ? 'eye-off' : 'eye'}"/></svg>`)
            : bt('mute', st.mute, st.mute ? 'Ativar som da trilha' : 'Silenciar trilha', 'M');
        return `
        <div class="ve-head ve-head-${tr.kind}${tr.main ? ' main' : ''}${st.lock ? ' locked' : ''}${st.hide || st.mute ? ' off' : ''}" data-tr="${i}" style="height:${tr.h}px">
            <div class="ve-head-row">${lock}<b>${tr.id}</b>${extra}</div>
            ${tr.main && tr.h >= 40 ? `<span>${tr.kind === 'v' ? 'Vídeo' : 'Áudio'}</span>` : ''}
            <i class="ve-head-grip" data-grip="${i}" title="Arraste para aumentar ou diminuir a trilha"></i>
        </div>`;
    }).join('');
}

// Botões do cabeçalho da trilha (olho, cadeado, mudo)
function veTrackToggle(kind, k, act) {
    const st = (kind === 'v' ? VE_TRK.v : VE_TRK.a)[k];
    st[act] = !st[act];
    if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
    if (act === 'lock' && st.lock && VE.clips[VE.sel] && VE.clips[VE.sel].tr === k) VE.sel = -1;
    const nome = `${kind === 'v' ? 'V' : 'A'}${k + 1}`;
    veToast({ lock: st.lock ? `${nome} bloqueada` : `${nome} desbloqueada`,
              hide: st.hide ? `${nome} oculta` : `${nome} visível`,
              mute: st.mute ? `${nome} sem som` : `${nome} com som` }[act]);
    veBuildHeads();
    if (act === 'hide' && VE.ready) veSyncPlayer(true);   // o clipe de baixo pode passar a ser o que toca
    if (act === 'mute') veApplyAudioGain();
    veRefresh();
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

// V1/A1 -> 0, V2/A2 -> 1 ...
function veTrackIndex(row) { return (+row.id.slice(1) || 1) - 1; }

function veRowAt(y) {
    if (y <= VE_RULER) return null;
    return veTrackRows().find(r => y >= r.y && y < r.y + r.h) || null;
}

// ─────────────────────────── desenho ───────────────────────────

let veDrawQueued = false;
function veDraw() {
    if (veDrawQueued) return;
    veDrawQueued = true;
    veRaf($ve('ve-tl'), () => { veDrawQueued = false; veRender(); });
}

// requestAnimationFrame da janela onde o elemento está (painel solto: a janela dele segue desenhando
// mesmo com a principal escondida atrás de outra); janela minimizada cai na principal
function veRaf(el, cb) {
    const w = el && el.ownerDocument.defaultView;
    return (w && !w.document.hidden ? w : window).requestAnimationFrame(cb);
}

// Painel mudou de tamanho ou de lugar (docking / janela solta): reajusta zoom e redesenha
function veLayoutChanged() {
    if (VE.ready) {
        const fit = veFitPps();
        if (VE.pps < fit) VE.pps = fit;
        veClampView();
        veSyncZoomSlider();
    }
    if ($ve('ve-screen')) veApplyMonitor();
    veDraw();
    veDrawMonitor();
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
    const dpr = canvas.ownerDocument.defaultView.devicePixelRatio || 1;   // o painel pode estar em outro monitor
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
        ctx.fillText(veT('A timeline aparece aqui quando você abrir um vídeo'), W / 2, rV.y + rV.h / 2 + 4);
        ctx.textAlign = 'left';
        veUpdateScrollbar();
        return;
    }

    const X = t => (t - VE.view) * VE.pps;
    const t0 = VE.view, t1 = VE.view + W / VE.pps;

    // ticks
    const major = veNiceStep(90 / VE.pps);
    // divisões menores: em zoom alto, sempre em quadros inteiros
    const fr = Math.round(major * (VE.fps || 30));
    const minor = major >= 0.5 ? major / 5 : ({ 1: 1, 2: 1, 5: 1, 10: 2 }[fr] || 1) / (VE.fps || 30);
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

    // clipes: cada um na sua trilha de vídeo (Vn) com o áudio vinculado em An
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VE_RULER, W, H - VE_RULER); ctx.clip();
    const n = VE.peaks.length;
    const rowOf = id => rows.find(r => r.id === id);
    // ao arrastar: o original fica apagadinho e um "fantasma" mostra onde ele vai cair
    const mv = VE.drag && VE.drag.mode === 'move' && VE.drag.active ? VE.drag : null;
    const items = VE.clips.map((c, i) => ({ c, i, st: c.st, tr: c.tr, dim: mv && !mv.alt && mv.i === i }));
    if (mv) items.push({ c: VE.clips[mv.i], i: mv.i, st: mv.st, tr: mv.tr, ghost: true });
    items.forEach(({ c, i, st, tr, dim, ghost }) => {
        const len = veLen(c);
        const x1 = X(st), x2 = X(st + len);
        if (x2 < -2 || x1 > W + 2) return;
        const cx = Math.max(x1, -4) + 1, cw = Math.min(x2, W + 4) - Math.max(x1, -4) - 2;
        if (cw <= 0) return;
        const srcAt = x => c.s + (VE.view + x / VE.pps - st) * veVel(c);   // x do canvas -> tempo da fonte
        const vr = rowOf('V' + (tr + 1)), ar = rowOf('A' + (tr + 1));
        const img = veIsImage(c), adj = veIsAdj(c), aud = veIsAudio(c), txt = veIsTexto(c), med = veMediaOf(c);
        const velTxt = veVel(c) !== 1 ? '  ·  ' + Math.round(veVel(c) * 100) + '%' : '';
        ctx.globalAlpha = dim ? 0.28 : ghost ? 0.8 : 1;
        const cor = veCor(c);

        // ---- vídeo (áudio solto não tem)
        const vy = vr.y + 3, vh = vr.h - 6;
        if (!aud) {
        ctx.save();
        veRoundRect(ctx, cx, vy, cw, vh, 4);
        ctx.clip();
        const apagado = veTrkHidden(c.tr);
        if (apagado && !dim && !ghost) ctx.globalAlpha = 0.35;
        ctx.fillStyle = cor ? veRgba(cor, 0.28) : adj ? '#123a36' : txt ? '#4a1936' : img ? '#3b2358' : '#27305f';
        ctx.fillRect(cx, vy, cw, vh);
        const th = vh - 16;
        const img0 = VE.thumbs.find(tb => tb.img && tb.img.complete && tb.img.naturalWidth);
        if (img && med.w && th > 10) {
            const tw = th * (med.w / med.h);
            for (let x = x1; x < cx + cw; x += tw + 2) if (x + tw >= cx) ctx.drawImage(med.img, x, vy + 14, tw, th);
        } else if (!img && img0 && th > 10) {
            const tw = th * (img0.img.naturalWidth / img0.img.naturalHeight);
            for (let x = x1; x < cx + cw; x += tw) {
                if (x + tw < cx) continue;
                const tb = veThumbFor(srcAt(x + tw / 2));
                if (tb) ctx.drawImage(tb.img, x, vy + 14, tw, th);
            }
        }
        ctx.fillStyle = cor ? veRgba(cor, 0.2) : adj ? 'rgba(20,184,166,0.12)' : txt ? 'rgba(219,39,119,0.15)' : img ? 'rgba(168,85,247,0.15)' : 'rgba(91,110,225,0.18)';
        ctx.fillRect(cx, vy, cw, vh);
        if (veLocked(c)) veListras(ctx, cx, vy, cw, vh);
        ctx.fillStyle = cor || (adj ? '#14b8a6' : txt ? '#db2777' : img ? '#a855f7' : '#5b6ee1');
        ctx.fillRect(cx, vy, cw, Math.min(14, vh));
        if (cw > 50 && vh >= 12) {
            ctx.fillStyle = '#eef0ff';
            ctx.font = '600 10.5px Segoe UI';
            const nome = adj ? veT('Camada de ajuste') : txt ? 'T  ' + veNomeTexto(c) : img ? (med.name || veT('Imagem')) : veT(`Clipe ${i + 1}`);
            ctx.fillText(nome + velTxt + (cw > 150 ? '  ·  ' + veShort(len) : ''), cx + 6, vy + 10.5);
        }
        if (veHasFx(c) && cw > 34 && vh >= 12) {
            // selo fx (como no Premiere): laranja = efeitos ligados; cinza = todos desligados/neutros
            ctx.fillStyle = veFxActive(c).length ? '#F97316' : '#666';
            ctx.fillRect(cx + cw - 20, vy + 2, 17, 10);
            ctx.fillStyle = '#1a0d02';
            ctx.font = '700 8.5px Cascadia Mono, Consolas, monospace';
            ctx.fillText('fx', cx + cw - 16.5, vy + 10);
        }
        ctx.restore();
        if (!ghost && i === VE.fxHover) {
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(249,115,22,0.18)';
            ctx.fillRect(cx, vy, cw, vh);
            ctx.strokeStyle = '#F97316';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            veRoundRect(ctx, cx, vy, cw, vh, 4); ctx.stroke();
            ctx.restore();
        }
        if (!ghost && veHasKf(c)) veDrawKfMarks(ctx, c, i, st, veKfMarkY(vr));
        if (img) {
            ctx.globalAlpha = 1;
            if ((i === VE.sel && !dim) || ghost) {
                ctx.strokeStyle = '#F97316';
                ctx.lineWidth = 2;
                if (ghost) ctx.setLineDash([5, 3]);
                veRoundRect(ctx, cx, vy, cw, vh, 4); ctx.stroke();
                ctx.setLineDash([]);
            }
            return;   // imagem não tem trilha de áudio
        }
        }

        // ---- áudio (a altura da onda acompanha o ganho do clipe)
        const ay = ar.y + 3, ah = ar.h - 6;
        ctx.save();
        veRoundRect(ctx, cx, ay, cw, ah, 4);
        ctx.clip();
        ctx.globalAlpha = dim ? 0.28 : ghost ? 0.8 : veTrkMuted(c.tr) ? 0.35 : 1;
        ctx.fillStyle = cor ? veRgba(cor, 0.22) : '#163a2b';
        ctx.fillRect(cx, ay, cw, ah);
        if (veLocked(c)) veListras(ctx, cx, ay, cw, ah);
        // forma de onda: a do vídeo aberto, ou a do próprio arquivo (áudio solto)
        const picos = aud ? (med.peaks || []) : VE.peaks, np = picos.length, durP = aud ? med.dur : VE.srcDur;
        if (np && (aud || (VE.info && VE.info.has_audio))) {
            const mid = ay + ah / 2, amp = ah / 2 - 3, gl = veDb(c.g);
            const xa = Math.max(cx, 0), xb = Math.min(cx + cw, W);
            for (let x = xa; x < xb; x += 2) {
                const sa = srcAt(x), sb = srcAt(x + 2);
                const ia = Math.floor(sa / durP * np), ib = Math.max(ia + 1, Math.ceil(sb / durP * np));
                let pk = 0;
                for (let k = Math.max(0, ia); k < Math.min(np, ib); k++) pk = Math.max(pk, picos[k]);
                pk *= gl;
                ctx.fillStyle = pk > 1 ? '#f87171' : '#43c58f';     // vermelho = estourando
                const h = Math.max(1, Math.min(1, pk) * amp);
                ctx.fillRect(x, mid - h, 1.4, h * 2);
            }
            if (c.g && cw > 60 && ah >= 14) {
                ctx.font = '600 10px Cascadia Mono, Consolas, monospace';
                const txt = veFmtDb(c.g), tw = ctx.measureText(txt).width + 8;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(cx + cw - tw - 4, ay + 3, tw, 14);
                ctx.fillStyle = c.g > 0 ? '#fbbf24' : '#93c5fd';
                ctx.fillText(txt, cx + cw - tw, ay + 13.5);
            }
        } else if (!aud && VE.info && !VE.info.has_audio) {
            ctx.fillStyle = '#4a4a4a';
            ctx.font = '11px Segoe UI';
            if (cw > 80) ctx.fillText(veT('sem áudio'), cx + 8, ay + ah / 2 + 4);
        }
        // áudio solto: nome do arquivo no alto do clipe
        if (aud && cw > 50 && ah >= 12) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = cor || '#2fa877';
            ctx.fillRect(cx, ay, cw, Math.min(13, ah));
            ctx.fillStyle = '#04150d';
            ctx.font = '600 10px Segoe UI';
            ctx.fillText((med.name || veT('Áudio')) + velTxt + (cw > 150 ? '  ·  ' + veShort(len) : ''), cx + 6, ay + 10);
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        // seleção (o fantasma do arraste ganha contorno tracejado)
        if ((i === VE.sel && !dim) || ghost) {
            ctx.strokeStyle = '#F97316';
            ctx.lineWidth = 2;
            if (ghost) ctx.setLineDash([5, 3]);
            if (!aud) { veRoundRect(ctx, cx, vy, cw, vh, 4); ctx.stroke(); }
            veRoundRect(ctx, cx, ay, cw, ah, 4); ctx.stroke();
            ctx.setLineDash([]);
        }
        if (ghost) {
            ctx.font = '600 10px Cascadia Mono, Consolas, monospace';
            const txt = `${mv && mv.alt ? '+ ' : ''}${aud ? 'A' : 'V'}${tr + 1} · ${veShort(st)}`, ty = aud ? ay : vy;
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillRect(Math.max(2, x1), ty - 17, ctx.measureText(txt).width + 10, 15);
            ctx.fillStyle = '#F97316';
            ctx.fillText(txt, Math.max(2, x1) + 5, ty - 6);
        }
    });
    ctx.restore();

    // legendas (linha LEG)
    const rl = rows.find(r => r.kind === 'l');
    if (rl && (VE.legendas || []).length) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, Math.max(VE_RULER, rl.y), W, rl.h); ctx.clip();
        VE.legendas.forEach((c, i) => {
            const x1 = X(c.st), x2 = X(c.en);
            if (x2 < -2 || x1 > W + 2) return;
            const y = rl.y + 3, h = rl.h - 6, w = Math.max(2, x2 - x1 - 1);
            ctx.fillStyle = i === VETX.legSel ? 'rgba(250,204,21,0.42)' : 'rgba(250,204,21,0.22)';
            ctx.fillRect(x1, y, w, h);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(x1, y, 2, h);
            if (w > 30 && h >= 12) {
                ctx.save();
                ctx.beginPath(); ctx.rect(x1, y, w - 2, h); ctx.clip();
                ctx.fillStyle = '#fff7d1';
                ctx.font = '600 10px Segoe UI';
                ctx.fillText(c.texto.replace(/\n/g, ' '), x1 + 6, y + h / 2 + 3.5);
                ctx.restore();
            }
            if (i === VETX.legSel) { ctx.strokeStyle = '#F97316'; ctx.lineWidth = 2; ctx.strokeRect(x1 + 1, y + 1, w - 2, h - 2); }
        });
        ctx.restore();
    }

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

// ◆ dos quadros-chave na faixa de baixo do clipe (no selecionado ficam maiores e dá para arrastar)
// Listras diagonais sobre clipes de trilha bloqueada (como no Premiere)
function veListras(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    for (let k = x - h; k < x + w; k += 10) { ctx.beginPath(); ctx.moveTo(k, y + h); ctx.lineTo(k + h, y); ctx.stroke(); }
    ctx.restore();
}

function veDrawKfMarks(ctx, c, i, st, y) {
    const sel = i === VE.sel;
    const d = VE.drag && VE.drag.mode === 'kf' && VE.drag.i === i ? VE.drag : null;
    const r = sel ? 4.5 : 3;
    veKfSeqTimes(c).forEach(t => {
        let x = (t - c.st + st - VE.view) * VE.pps;
        if (d && Math.abs(t - d.t0) < 1e-3) x = (d.t1 - VE.view) * VE.pps;
        const naAgulha = sel && Math.abs(t - VE.playhead) < veFrame() / 2;
        ctx.fillStyle = naAgulha ? '#fbbf24' : sel ? '#F97316' : 'rgba(255,255,255,0.7)';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    });
}

// Altura dos ◆: faixa de baixo do clipe; em trilha compacta, no meio dele
function veKfMarkY(row) {
    const vy = row.y + 3, vh = row.h - 6;
    return vh >= 28 ? vy + vh - 7 : vy + vh / 2;
}

// ◆ do clipe selecionado sob o ponteiro (tempo da sequência) ou null
function veKfMarkAt(x, y, row) {
    const c = VE.clips[VE.sel];
    if (!c || !row || row.kind !== 'v' || veTrackIndex(row) !== c.tr || !veHasKf(c)) return null;
    if (Math.abs(y - veKfMarkY(row)) > 8) return null;
    return veKfSeqTimes(c).find(t => Math.abs((t - VE.view) * VE.pps - x) <= 6) ?? null;
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
    veTxSeguir();
    $ve('ve-tc').textContent = veTC(VE.playhead);
    $ve('ve-tc-total').textContent = veTC(VE.dur);
    // valores animados e ◆ do painel acompanham a agulha
    if (veHasKf(VE.clips[VE.sel]) && vedVisible('props')) veRenderProps();
}

function veRenderClips() {
    const box = $ve('ve-clips');
    if (!VE.ready) return;
    $ve('ve-sum-orig').textContent = veHuman(VE.srcDur);
    $ve('ve-sum-final').textContent = veHuman(VE.dur);
    $ve('ve-sum-cut').textContent = veHuman(Math.max(0, VE.srcDur - VE.dur));

    const c0 = VE.clips[0];
    if (VE.clips.length === 1 && c0.st < 1e-3 && c0.tr === 0 && !c0.g && !c0.p && !c0.k && !c0.fx && c0.s < 1e-3 && Math.abs(c0.e - VE.srcDur) < 1e-3) {
        box.innerHTML = '<div class="ve-clips-empty">Nenhum corte ainda.<br>Aperte <b>\'</b> (ou <b>S</b>) para cortar na agulha. <b>Q</b> / <b>W</b> apagam antes / depois da agulha até o corte mais próximo.<br>Selecione um clipe e aperte <b>D</b> para apagá-lo.</div>';
        return;
    }
    box.innerHTML = VE.clips.map((c, i) => `
        <div class="ve-clip${i === VE.sel ? ' sel' : ''}" data-i="${i}">
            <div class="ve-clip-bar"${veCor(c) ? ` style="background:${veCor(c)}"` : ''}></div>
            <div>
                <div class="ve-clip-name">${veNomeClipe(c)} ${i + 1} <span class="ve-clip-tr">V${c.tr + 1}</span>${c.g ? ` <span class="ve-clip-db">${veFmtDb(c.g)}</span>` : ''}${veHasFx(c) ? ` <span class="ve-clip-fx" title="${veEsc(c.fx.map(f => VE_FX[f.t]?.nome).join(', '))}">fx</span>` : ''}</div>
                <div class="ve-clip-time">${veShort(c.st)} → ${veShort(veEnd(c))} · ${veShort(veLen(c))}</div>
            </div>
            <button class="ve-clip-act" data-act="${i}" title="Apagar clipe (D)"><svg class="i"><use href="#i-trash"/></svg></button>
        </div>`).join('');
}

function veRefresh() {
    veTxRender();
    if (veMixAtivo()) veAudioEditou();
    veUpdateReadouts();
    veRenderClips();
    veRenderProps();
    veDrawMonitor();
    veDraw();
}

// Mostra um painel (aba) do editor — os painéis ficam em editor-dock.js
function veTab(name) {
    vedShow(name);
    if (name === 'props') veRenderProps();
}

function veSetTool(tool) {
    VE.tool = tool;
    ['select', 'razor', 'hand', 'rate', 'texto'].forEach(t => $ve('ve-tool-' + t).classList.toggle('active', t === tool));
    const wrap = $ve('ve-tl-wrap');
    wrap.classList.toggle('tool-razor', tool === 'razor');
    wrap.classList.toggle('tool-hand', tool === 'hand');
    wrap.classList.toggle('tool-rate', tool === 'rate');
    $ve('ve-screen').classList.toggle('tool-texto', tool === 'texto');
    if (tool !== 'texto') veTxEditarFim();
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
        if (!r || !r.success) return;
        if (/\.vcnvt$/i.test(r.path)) veOpenProject(r.path);
        else if (veConfirmDiscard()) veOpenPath(r.path);
    });
}

function veOpenPath(path) {
    if (!path || VE.exportRunning || !veIsActive()) return;
    if (!VE._pendingProject) { VE.projectPath = null; VE.dirty = false; }
    veStop();
    veDeckReset();
    veAudioReset();
    VE_TRK = veTrkNovo();
    veBuildHeads();
    VE.legendas = [];
    VE.legEstilo = null;
    VE.legGravar = true;
    veTxReset();
    const v = veVideo();
    v.pause();
    v.removeAttribute('src');
    v.load();
    veParkExtras(0, true);
    Object.assign(VE, {
        path, info: null, dur: 0, srcDur: 0, clips: [], sel: -1, inPt: null, outPt: null, playhead: 0,
        cur: -1, history: [], future: [], thumbs: [], peaks: [], ready: false, dest: null, view: 0, media: [],
    });
    veUpdateUndo();
    $ve('ve-empty').hidden = true;
    $ve('ve-proxy-badge').hidden = true;
    veLoading('Analisando vídeo...', 5);
    $ve('ve-export-btn').disabled = true;
    $ve('ve-add-image').disabled = true;
    $ve('ve-add-adjust').disabled = true;
    $ve('ve-save').disabled = true;
    veUpdateTitle();
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
            VE.media = [{ id: 0, kind: 'video', path: VE.path, name: ev.file_name }];
            VE.seqW = ev.width || 1920;
            VE.seqH = ev.height || 1080;
            VE.clips = [{ tr: 0, st: 0, s: 0, e: VE.srcDur }];
            veRelayout();
            VE.ready = true;
            VE.pps = veFitPps();
            VE.view = 0;
            veSyncZoomSlider();
            const res = ev.width && ev.height ? `${ev.width}×${ev.height}` : '';
            $ve('ve-meta').innerHTML = `<b>${veEsc(ev.file_name)}</b> · ${res} · ${(+ev.fps).toFixed(2).replace(/\.00$/, '')} fps · ${veHuman(ev.duration)}${ev.has_audio ? '' : ' · sem áudio'}`;
            veLoading(ev.needs_proxy ? 'Preparando prévia leve (formato não toca direto no app)...' : 'Carregando vídeo...', ev.needs_proxy ? 0 : 60);
            if (ev.has_audio) veAudioFonte();   // áudio conformado para o mixer em tempo real
            veRefresh();
            if (VE._pendingProject) veApplyProject();
            $ve('ve-save').disabled = false;
            veUpdateTitle();
            break;
        }
        case 'proxy':
            veLoading(`Preparando prévia leve... ${ev.pct}%`, ev.pct);
            break;
        case 'video': {
            const v = veVideo();
            v.crossOrigin = 'anonymous';   // permite o ganho acima de 100% na prévia (Web Audio)
            v.src = ev.url;
            v.muted = VE.muted;
            v.load();
            $ve('ve-proxy-badge').hidden = !ev.proxy;
            v.addEventListener('loadeddata', () => {
                veLoading(null);
                $ve('ve-export-btn').disabled = false;
                $ve('ve-add-image').disabled = false;
                $ve('ve-add-adjust').disabled = !!(VE.info && VE.info.audio_only);
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
    veStop();
    const sel = $ve('ve-res');
    const h = VE.info.height || 0;
    const opts = [['original', `Original (${VE.info.width}×${h})`]];
    [[2160, '4K (2160p)'], [1440, '1440p'], [1080, '1080p Full HD'], [720, '720p HD'], [480, '480p']]
        .forEach(([r, l]) => { if (h > r) opts.push([String(r), l]); });
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    $ve('ve-noaudio').disabled = !VE.info.has_audio;
    const soAudio = !!VE.info.audio_only;
    document.querySelectorAll('#ve-export .ve-pills[data-name="format"] .ve-pill').forEach(b => {
        const audio = b.classList.contains('ve-pill-audio');
        b.classList.toggle('disabled', (soAudio && !audio) || (!VE.info.has_audio && audio));
    });
    const atual = document.querySelector('#ve-export .ve-pills[data-name="format"] .ve-pill.active');
    if (atual && atual.classList.contains('disabled')) {
        atual.classList.remove('active');
        document.querySelector(`#ve-export .ve-pill[data-v="${soAudio ? 'mp3' : 'mp4'}"]`).classList.add('active');
    }
    $ve('ve-export-form').hidden = false;
    $ve('ve-export-progress').hidden = true;
    $ve('ve-exp-result').hidden = true;
    veExportFoot('form');
    veUpdateExportSummary();
    $ve('ve-export').hidden = false;
}

function veUpdateExportSummary() {
    const fmt = vePill('format') || 'mp4';
    const audio = fmt === 'mp3' || fmt === 'wav';
    $ve('ve-export').classList.toggle('audio', audio);
    if (audio) {
        $ve('ve-export-summary').innerHTML =
            `Duração final: <b>${veTC(VE.dur)}</b> (${veHuman(VE.dur)})<br>Só o áudio da timeline · <b>${fmt.toUpperCase()}</b>`;
        return;
    }
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

async function veStartExport() {
    VE.exportRunning = true;
    document.querySelector('.menu-item[data-tool="video-cutter"]')?.classList.add('rodando');
    $ve('ve-export-form').hidden = true;
    $ve('ve-export-progress').hidden = false;
    $ve('ve-exp-result').hidden = true;
    $ve('ve-exp-fill').style.width = '0%';
    $ve('ve-exp-pct').textContent = '0%';
    $ve('ve-exp-msg').textContent = 'Preparando...';
    veExportFoot('running');
    VE._expStart = Date.now();
    const noAudio = $ve('ve-noaudio').checked;
    // textos viram PNG (o mesmo desenho da prévia); depois a base (vídeo sem transformação, trilha de cima
    // vence, vazio = preto) + áudio + camadas por cima
    VE._txPng = null;
    if (VE.clips.some(veIsTexto)) await veTxPngs();
    const plano = veExportPlan();
    window.pywebview.api.video_cutter_export(
        VE.path, plano.base, vePill('format') || 'mp4', vePill('quality') || 'medium',
        $ve('ve-res').value, $ve('ve-gpu').checked, VE.dest, noAudio,
        plano.camadas, plano.audio, VE.dur, plano.mix, veTxExport()
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
    document.querySelector('.menu-item[data-tool="video-cutter"]')?.classList.remove('rodando');
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

// px de tela por px do quadro no modo Fit
function veFitScale() {
    const scr = $ve('ve-screen');
    if (!scr.clientWidth || !VE.seqW) return 1;
    return Math.min(scr.clientWidth / VE.seqW, scr.clientHeight / VE.seqH);
}

function veClampMonitorPan() {
    const scr = $ve('ve-screen');
    const f = veFitScale();
    const dispW = VE.seqW * f * VEM.mz;
    const dispH = VE.seqH * f * VEM.mz;
    const mxMax = Math.max(0, (dispW - scr.clientWidth) / 2);
    const myMax = Math.max(0, (dispH - scr.clientHeight) / 2);
    VEM.mx = Math.min(Math.max(VEM.mx, -mxMax), mxMax);
    VEM.my = Math.min(Math.max(VEM.my, -myMax), myMax);
}

function veApplyMonitor() {
    veClampMonitorPan();
    const v = $ve('ve-canvas');
    v.style.transform = VEM.mz === 1 && !VEM.mx && !VEM.my ? '' : `translate(${VEM.mx}px, ${VEM.my}px) scale(${VEM.mz})`;
    const fit = Math.abs(VEM.mz - 1) < 1e-3;
    $ve('ve-mz-val').textContent = fit ? 'Fit' : Math.round(veFitScale() * VEM.mz * 100) + '%';
    $ve('ve-mz-fit').classList.toggle('active', fit);
    $ve('ve-screen').classList.toggle('zoomed', VEM.mz > 1.001);
    // zoom pede outra resolução da prévia
    if (VE.ready && Math.round(VE.seqW * veMonitorScale()) !== v.width) veDrawMonitorSoon();
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
    // arrastar no monitor: move a camada selecionada (se estiver visível na agulha);
    // sem camada selecionada e com zoom, move a visão. Clique sem arrastar = play/pausa.
    scr.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const c = VE.clips[VE.sel];
        const visivel = c && !veIsAdj(c) && VE.playhead >= c.st - VE_EPS && VE.playhead < veEnd(c) - VE_EPS;
        if (visivel) {
            const p = veProps(c);
            VEM.pan = { layer: true, x0: e.clientX, y0: e.clientY, px: p.x, py: p.y, id: e.pointerId, hist: false, clonar: e.altKey && !veLocked(c) };
        } else if (VEM.mz > 1.001) {
            VEM.pan = { x0: e.clientX, y0: e.clientY, mx0: VEM.mx, my0: VEM.my, id: e.pointerId };
        } else return;
        VEM.panned = false;
    });
    scr.addEventListener('pointermove', e => {
        if (!VEM.pan) return;
        const dx = e.clientX - VEM.pan.x0, dy = e.clientY - VEM.pan.y0;
        if (!VEM.panned && Math.hypot(dx, dy) < 4) return;
        if (!VEM.panned) {
            VEM.panned = true;
            if (VEM.pan.clonar && !veDuplicarAcima()) { VEM.pan = null; return; }
            if (VEM.pan.clonar) VEM.pan.hist = true;
            scr.setPointerCapture(VEM.pan.id);
            scr.classList.add(VEM.pan.layer ? 'layer-move' : 'panning');
            if (VE.playing) veStop();
        }
        if (VEM.pan.layer) {
            const c = VE.clips[VE.sel];
            if (!c) return;
            if (!VEM.pan.hist) { vePushHistory(); VEM.pan.hist = true; }
            const k = veFitScale() * VEM.mz;   // px de tela por px do quadro
            veApplyProps(c, { x: Math.round(VEM.pan.px + dx / k), y: Math.round(VEM.pan.py + dy / k) });
            veRenderProps();
            veDrawMonitorSoon();
            if (veHasKf(c)) veDraw();
            return;
        }
        VEM.mx = VEM.pan.mx0 + dx;
        VEM.my = VEM.pan.my0 + dy;
        veApplyMonitor();
    });
    const end = () => {
        VEM.pan = null;
        scr.classList.remove('panning', 'layer-move');
        setTimeout(() => { VEM.panned = false; }, 0);
    };
    $ve('ve-canvas').addEventListener('click', () => { if (!VEM.panned) veTogglePlay(); });
    scr.addEventListener('pointerup', end);
    scr.addEventListener('pointercancel', end);
    new ResizeObserver(() => veApplyMonitor()).observe(scr);
    veVideo().addEventListener('loadedmetadata', veMonitorFit);
    veDrawMonitor();
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
    // (a altura da timeline agora é a divisa entre os painéis: editor-dock.js)
    // Altura de cada trilha: arrastar a borda inferior do cabeçalho (V1, A1...)
    $ve('ve-heads-rows').addEventListener('pointerdown', e => {
        const g = e.target.closest('[data-grip]');
        if (!g) return;
        e.preventDefault();
        const i = +g.dataset.grip, tr = VE_TRACKS[i];
        g.setPointerCapture(e.pointerId);
        const y0 = e.clientY, h0 = tr.h, win = g.ownerDocument.defaultView;   // timeline pode estar numa janela solta
        win.document.body.classList.add('ve-resizing-y');
        const move = ev => {
            tr.h = Math.round(Math.min(Math.max(h0 + (ev.clientY - y0), VE_TRACK_MIN), VE_TRACK_MAX));
            veBuildHeads();
            veDraw();
        };
        const up = () => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            win.document.body.classList.remove('ve-resizing-y');
            veLsSet('ve-track-h', JSON.stringify(VE_TRACKS.map(t => t.h)));
        };
        // o cabeçalho é recriado durante o arraste, então os eventos ficam na janela
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });
    $ve('ve-heads-rows').addEventListener('click', e => {
        const b = e.target.closest('[data-hact]');
        if (b) veTrackToggle(b.dataset.hkind, +b.dataset.hk, b.dataset.hact);
    });
    // Duplo clique no cabeçalho: alterna trilha compacta / expandida
    $ve('ve-heads-rows').addEventListener('dblclick', e => {
        if (e.target.closest('[data-hact]')) return;
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

    // o estado de reprodução é do editor (relógio próprio), não do <video>
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
            if (VE.playing) veStop();
            VE.drag = { mode: 'scrub' };
            wrap.classList.add('scrub');
            veSeek(e.shiftKey ? veSnapFrame(t) : veSnapTime(t));
            return;
        }
        if (VE.tool === 'razor' && e.button === 0) {
            veSplitAt(veSnapTime(t, true));
            return;
        }
        // seleção: clicar num clipe só seleciona (a agulha fica onde está — ela anda pela régua).
        // Segurar e arrastar move o clipe no tempo e entre trilhas; clicar em área vazia desmarca.
        // Pela borda do clipe, arrastar encurta/alonga (imagens: define a duração).
        const row = veRowAt(y);
        if (row && row.kind === 'l') { veLegPointer(e, x, t); return; }
        if (VE.tool === 'rate' && e.button === 0) { veRatePointer(e, x, row); return; }
        // ◆ do clipe selecionado: clicar leva a agulha até ele; arrastar muda o tempo do quadro-chave
        const kft = e.button === 0 && !veLocked(VE.clips[VE.sel]) ? veKfMarkAt(x, y, row) : null;
        if (kft != null) {
            if (VE.playing) veStop();
            VE.drag = { mode: 'kf', i: VE.sel, t0: kft, t1: kft, x0: e.clientX, active: false };
            return;
        }
        const borda = e.button === 0 ? veEdgeAt(x, row) : null;
        if (borda && veLocked(VE.clips[borda.i])) { veAvisoBloqueio(); return; }
        if (borda) {
            VE.sel = borda.i;
            VE.drag = { mode: 'trim', i: borda.i, side: borda.side, c0: { ...VE.clips[borda.i] }, started: false };
            if (VE.playing) veStop();
            wrap.classList.add('trimming');
            veRenderClips(); veRenderProps(); veDraw();
            return;
        }
        let i = row ? veClipAtTrack(t, veTrackIndex(row), row.kind) : -1;
        if (i >= 0 && veLocked(VE.clips[i])) { i = -1; if (e.button === 0) veAvisoBloqueio(); }
        VE.sel = i;
        if (i >= 0 && e.button === 0) {
            const c = VE.clips[i];
            VE.drag = { mode: 'move', i, x0: e.clientX, y0: e.clientY, grab: t - c.st, active: false, st: c.st, tr: c.tr, kind: row.kind };
        }
        veRenderClips();
        veRenderProps();
        veDrawMonitor();
        veDraw();
    });

    wrap.addEventListener('pointermove', e => {
        const { t, x } = veTimeFromEvent(e);
        VE.hoverX = x;
        if (!VE.drag) {
            if (VE.tool === 'razor') veDraw();
            else if (VE.ready && (VE.tool === 'select' || VE.tool === 'rate' || VE.tool === 'texto')) {
                const { y } = veTimeFromEvent(e);
                const row = veRowAt(y);
                wrap.classList.toggle('kf-hover', veKfMarkAt(x, y, row) != null);
                wrap.classList.toggle('trim-hover', !wrap.classList.contains('kf-hover') && !!veEdgeAt(x, row));
            }
            return;
        }
        if (VE.drag.mode === 'leg') { veLegArrastar(e, t); return; }
        if (VE.drag.mode === 'rate') {
            veRateArrastar(t);
            VE.dur = VE.clips.reduce((m, c) => Math.max(m, veEnd(c)), 0);
            veUpdateReadouts();
            veDrawMonitor();
            veDraw();
            return;
        }
        if (VE.drag.mode === 'kf') {
            const d = VE.drag, c = VE.clips[d.i];
            if (!d.active && Math.abs(e.clientX - d.x0) < 4) return;   // ainda é um clique
            d.active = true;
            d.t1 = Math.min(Math.max(veSnapFrame(t), c.st), veEnd(c));
            VE.hoverX = null;
            veDraw();
            return;
        }
        if (VE.drag.mode === 'trim') {
            const d = VE.drag;
            if (!d.started) { vePushHistory(); d.started = true; }
            veTrimTo(d, t);
            VE.dur = VE.clips.reduce((m, c) => Math.max(m, veEnd(c)), 0);
            veUpdateReadouts();
            veDrawMonitor();
            veDraw();
            return;
        }
        if (VE.drag.mode === 'move') {
            const d = VE.drag;
            if (!d.active) {
                if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;   // ainda é um clique
                d.active = true;
                if (VE.playing) veStop();
                wrap.classList.add('moving');
            }
            // auto-rolagem nas bordas
            const w = veCanvasWidth();
            if (x > w - 24) { VE.view += 14 / VE.pps; veClampView(); }
            if (x < 24) { VE.view -= 14 / VE.pps; veClampView(); }
            const p = veTimeFromEvent(e);
            d.st = veMoveTarget(d.i, p.t - d.grab);
            d.alt = e.altKey;   // Alt (antes ou durante o arraste): solta uma cópia e o original fica
            // trilha sob o mouse (arrastando pelo vídeo ou pelo áudio, o par vinculado vai junto)
            const r = veRowAt(p.y);
            if (r && r.kind !== 'l') d.tr = veTrackIndex(r);
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
        wrap.classList.remove('dragging', 'scrub', 'moving', 'trimming');
        if (d && d.mode === 'leg') { veRefresh(); return; }
        if (d && d.mode === 'rate') { if (d.started) { veRelayout(); veAfterEdit(VE.playhead); } else veDraw(); return; }
        if (d && d.mode === 'trim' && d.started) { veRelayout(); veAfterEdit(VE.playhead); return; }
        if (d && d.mode === 'kf') {
            const c = VE.clips[d.i];
            if (d.active && Math.abs(d.t1 - d.t0) >= veFrame() / 2) {
                vePushHistory();
                veKfMove(c, veSrcAt(c, d.t0), Math.round(veSrcAt(c, d.t1) * 1e4) / 1e4);
            }
            veSeek(d.active ? d.t1 : d.t0);
            veRefresh();
            return;
        }
        if (d && d.mode === 'move' && d.active) {
            if (d.alt) veDuplicarEm(d.i, d.tr, d.st); else veMoveClip(d.i, d.tr, d.st);
        } else veDraw();
    };
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (!VE.ready) return;
        const { t, y } = veTimeFromEvent(e);
        const row = veRowAt(y);
        const i = row ? veClipAtTrack(t, veTrackIndex(row), row.kind) : -1;
        if (i < 0) return;
        if (veLocked(VE.clips[i])) { veAvisoBloqueio(); return; }
        VE.sel = i;
        veRefresh();
        veClipMenu(i, e.clientX, e.clientY, wrap.ownerDocument);
    });
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
            // Alt/Ctrl+roda: zoom na timeline mantendo fixo o instante sob o cursor.
            // Proporcional ao giro (roda comum ≈ 25% por passo; touchpad fica suave).
            const f = Math.exp(-Math.max(-300, Math.min(300, e.deltaY)) * 0.0022);
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
            veSeek(VE.clips[i].st);
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
    document.addEventListener('drop', e => {
        if (!veIsActive()) return;
        e.preventDefault();
        VE._drop = { x: e.clientX, y: e.clientY, at: Date.now() };
    });

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
    veInitProps();
    v.addEventListener('seeked', () => veDrawMonitor());
    v.addEventListener('loadeddata', () => veDrawMonitor());
    // caixa de ganho: Enter aplica, Esc cancela
    $ve('ve-gain-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); veApplyGain(); }
        else if (e.key === 'Escape') { e.preventDefault(); veCloseGain(); }
        e.stopPropagation();
    });
    veInitMonitorZoom();
    document.addEventListener('keydown', veOnKey);
    document.addEventListener('keyup', e => { if (e.key === 'Alt' && veIsActive()) e.preventDefault(); });
    // Botões não ficam com foco (senão o Espaço "clica" neles em vez de dar play)
    $ve('ve').addEventListener('mouseup', e => {
        const b = e.target.closest('button');
        if (b) setTimeout(() => b.blur(), 0);
    });
}

function veOnKey(e) {
    if (!veIsActive()) return;
    // Alt sozinho ativaria o menu da janela no Windows e roubaria o foco do Alt+roda
    if (e.key === 'Alt') { e.preventDefault(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (tag === 'textarea' || tag === 'select') return;
    if (!$ve('ve-export').hidden) {
        if (e.key === 'Escape') veCloseExport();
        return;
    }
    if (!$ve('ve-gain').hidden) return;   // a caixa de ganho trata as próprias teclas
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && k === 'o') { e.preventDefault(); veOpenFile(); return; }
    if (ctrl && k === 's') { e.preventDefault(); veSaveProject(e.shiftKey); return; }
    if (!VE.ready) return;
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); veUndo(); return; }
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); veRedo(); return; }
    if (ctrl && k === 'k') { e.preventDefault(); veSplitAtPlayhead(); return; }
    if (ctrl && k === 'c' && !e.shiftKey) { e.preventDefault(); veCopiar(false); return; }
    if (ctrl && k === 'x' && !e.shiftKey) { e.preventDefault(); veCopiar(true); return; }
    if (ctrl && k === 'v' && !e.shiftKey) { e.preventDefault(); veColar(); return; }
    if (e.altKey && (k === 'arrowup' || k === 'arrowdown')) { e.preventDefault(); veTrocarTrilha(k === 'arrowup' ? 1 : -1); return; }
    if (ctrl && (k === 'm' || k === 'e')) { e.preventDefault(); veOpenExport(); return; }
    if (ctrl) return;

    // ' corta todas as trilhas na agulha. No teclado ABNT2 a tecla pode chegar como "Dead"
    // (layout internacional); nesse caso vale o código físico da tecla ao lado do 1.
    if (k === "'" || (k === 'dead' && e.code === 'Backquote')) { e.preventDefault(); veSplitAtPlayhead(); return; }

    const map = {
        ' ': () => veTogglePlay(),
        'k': () => { veStop(); veSetRate(1); },
        // L: 1º toque dá play em 1,5x; depois 2x, 3x e volta ao normal (1x)
        'l': () => {
            if (!VE.playing) { veSetRate(1.5); vePlay(); }
            else veSetRate({ 1: 1.5, 1.5: 2, 2: 3, 3: 1 }[VE.rate] || 1);
            veToast(VE.rate === 1 ? 'Velocidade normal' : `Velocidade ${String(VE.rate).replace('.', ',')}x`);
        },
        'j': () => veSeek(VE.playhead - 5),
        'arrowleft': () => e.shiftKey ? veSeek(VE.playhead - 1) : veStepFrames(-1),
        'arrowright': () => e.shiftKey ? veSeek(VE.playhead + 1) : veStepFrames(1),
        'arrowup': () => veJumpEdit(-1),
        'arrowdown': () => veJumpEdit(1),
        'home': () => veSeek(0),
        'end': () => veSeek(VE.dur),
        's': () => veSplitAtPlayhead(),
        'd': () => veDeleteSelected(e.shiftKey),
        'g': () => veOpenGain(),
        'delete': () => veDeleteSelected(e.shiftKey),
        'backspace': () => veDeleteSelected(e.shiftKey),
        'i': () => veMarkIn(),
        'o': () => veMarkOut(),
        'x': () => veExtractInOut(),
        'q': () => veRippleTrimStart(),
        'w': () => veRippleTrimEnd(),
        'v': () => veSetTool('select'),
        'c': () => veSetTool('razor'),
        'h': () => veSetTool('hand'),
        'r': () => { veSetTool('rate'); veToast('Velocidade (R): arraste a borda de um clipe'); },
        't': () => { veSetTool('texto'); veToast('Texto (T): clique no monitor para escrever'); },
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
        if (VE.playing && toolId !== 'video-cutter') veStop();
        orig(toolId);
        document.body.classList.toggle('ve-focus', toolId === 'video-cutter');
        if (typeof vedEditorVisible === 'function') vedEditorVisible(toolId === 'video-cutter');
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
