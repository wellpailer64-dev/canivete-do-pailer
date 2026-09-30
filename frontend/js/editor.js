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
    markers: [],        // marcadores da timeline ativa [{t, cor, nome, d?, desc?}] (editor-marcadores.js)
    playhead: 0,        // tempo da sequência
    cur: -1,            // clipe que o player está mostrando (-1 = espaço vazio)
    media: [],          // [0] = vídeo aberto; imagens adicionadas depois
    sequences: [],      // timelines do projeto (cada uma guarda seus próprios clipes/trilhas/legendas)
    activeSequence: null,
    openSequences: [],
    _seqN: 0,
    projectPath: null,  // .vcnvt salvo/aberto
    dirty: false,       // alterações desde o último salvar
    quickEdit: false,   // edição descartável: exporta e fecha sem pedir salvar projeto
    quickEditPending: false, // Quick edit aberto sem mídia: o próximo arquivo herda o modo descartável
    startScreenDismissed: false,
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
    cache: null,        // cache RAM dos quadros já compostos do monitor
    fxHover: -1,        // clipe sob um efeito sendo arrastado do painel Efeitos
    exportRunning: false,
    lastOutput: null,
};

const VE_RULER = 28;
const VE_MAX_PPS = 3000;   // zoom máximo: ~100 px por quadro a 30 fps
const VE_TRACK_MIN = 22, VE_TRACK_MAX = 220;
const VE_MIN_TRACKS = 4;
// procura na janela principal e, se o painel estiver numa janela solta (editor-dock.js), nela
const $ve = id => document.getElementById(id) || (typeof vedFind === 'function' ? vedFind(id) : null);

// Trilhas como no Premiere: Vn..V1 em cima, A1..An embaixo. O conteúdo fica em V1/A1 (vinculados).
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
// + fade de entrada / saída em s (transições de áudio: editor-trans.js); no crossfade, início e trecho já estendidos
function veMixClipes() {
    const fd = veAudFades();
    return VE.clips
        .filter(c => !veIsImage(c) && !veTrkMuted(c.tr) && c.e - c.s > 0.005 && veTemSom(c))
        .map(c => {
            const f = fd.get(c) || c;
            const afx = typeof veAfxExport === 'function' ? veAfxExport(c) : [];
            return [+f.st.toFixed(5), +f.s.toFixed(5), +f.e.toFixed(5), +(c.g || 0).toFixed(2), veMid(c),
                    +veVel(c).toFixed(4), c.tom === false ? 0 : 1, +(f.fi || 0).toFixed(4), +(f.fo || 0).toFixed(4), afx];
        })
        .sort((a, b) => a[0] - b[0]);
}
function veMixAtivo() { return veAudioPronto(); }

// Estado de cada trilha (como os botões do cabeçalho no Premiere): v[k] = trilha Vk+1, a[k] = Ak+1.
// hide = olho (não aparece na prévia nem na exportação), lock = cadeado (clipes não podem ser editados),
// mute = áudio silenciado. Fica salvo no projeto; não entra no desfazer (como no Premiere).
function veTrkNovo(n = VE_MIN_TRACKS) {
    return { v: Array.from({ length: n }, () => ({})), a: Array.from({ length: n }, () => ({})) };
}
let VE_TRK = veTrkNovo();
function veTrackId(kind, k) { return (kind === 'v' ? 'V' : 'A') + (k + 1); }
function veDefaultTrack(kind, k) {
    return { id: veTrackId(kind, k), kind, h: k === 0 ? (kind === 'v' ? 76 : 60) : 24, main: k === 0 };
}
function veMaxClipTrack(clips = VE.clips) {
    return (clips || []).reduce((m, c) => Math.max(m, Math.max(0, (+c.tr || 0)) + 1), 0);
}
function veTrackCount() {
    return Math.max(VE_MIN_TRACKS, VE_TRK.v.length, VE_TRK.a.length, veMaxClipTrack());
}
function veTrackIndexes() { return Array.from({ length: veTrackCount() }, (_, k) => k); }
function veTrackState(kind, k) {
    if (k < 0) return {};
    const arr = kind === 'v' ? VE_TRK.v : VE_TRK.a;
    while (arr.length <= k) arr.push({});
    return arr[k];
}
function veRebuildTracks(count = veTrackCount()) {
    const old = new Map(VE_TRACKS.map(t => [t.id, t]));
    VE_TRACKS.length = 0;
    VE_TRACKS.push(old.get('LEG') || { id: 'LEG', kind: 'l', h: 26 });
    for (let k = count - 1; k >= 0; k--) VE_TRACKS.push(old.get(veTrackId('v', k)) || veDefaultTrack('v', k));
    for (let k = 0; k < count; k++) VE_TRACKS.push(old.get(veTrackId('a', k)) || veDefaultTrack('a', k));
}
function veEnsureTracks(count, opts = {}) {
    count = Math.max(VE_MIN_TRACKS, Math.ceil(+count || 0));
    const before = veTrackCount();
    for (let k = 0; k < count; k++) { veTrackState('v', k); veTrackState('a', k); }
    const alvo = veTrackCount();
    const precisa = before !== alvo ||
        VE_TRACKS.filter(t => t.kind === 'v').length !== alvo ||
        VE_TRACKS.filter(t => t.kind === 'a').length !== alvo;
    if (precisa) veRebuildTracks(alvo);
    if (precisa && opts.refresh) { veBuildHeads(); veClampVScroll(); veDraw(); }
    return precisa;
}
function veEnsureTrackIndex(k, opts) { return k >= 0 && veEnsureTracks(k + 1, opts); }
const veTrkHidden = tr => tr >= 0 && !!(VE_TRK.v[tr] && VE_TRK.v[tr].hide);
const veTrkMuted = tr => tr >= 0 && !!(VE_TRK.a[tr] && VE_TRK.a[tr].mute);
const veTrkLocked = tr => tr >= 0 && !!((VE_TRK.v[tr] && VE_TRK.v[tr].lock) || (VE_TRK.a[tr] && VE_TRK.a[tr].lock));
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
function veNavDur() { return VE.dur > 0 ? VE.dur : Math.max(VE.srcDur || 0, 60); }
function veClamp(t) { return Math.min(Math.max(t, 0), veNavDur()); }
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

// ─────────────────────────── cache RAM da prévia ───────────────────────────
// Cada quadro guardado leva a "assinatura" do que o compõe (clipes em volta da agulha, legenda, quadro):
// uma edição só descarta os quadros que ela mudou de fato, e não o cache inteiro.
// Teto em 1,5 GB: os ImageBitmap de um canvas acelerado ficam na memória da placa de vídeo, a mesma que o
// decodificador de vídeo e a composição da tela usam — com 4 GB a placa ficava sem folga e a reprodução engasgava.
const VE_CACHE_MAX_BYTES = Math.min(1.5, Math.max(0.5, (navigator.deviceMemory || 8) / 4)) * 1024 * 1024 * 1024;
const VE_CACHE_MARGEM = 5;   // s: clipes até aqui antes/depois da agulha entram na assinatura (transições)

function veCache() {
    if (!VE.cache) {
        VE.cache = {
            on: veLsGet('ve-cache-on') !== '0',
            rev: 0,
            frames: new Map(),
            pending: new Set(),
            bytes: 0,
            maxBytes: VE_CACHE_MAX_BYTES,
        };
    }
    return VE.cache;
}

function veCacheBytesTxt(n) {
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 * 1024 ? 0 : 1) + ' GB';
    return n >= 1024 * 1024 ? Math.round(n / 1024 / 1024) + ' MB' : Math.round(n / 1024) + ' KB';
}

function veCacheUpdateUi() {
    const b = $ve('ve-cache');
    if (!b) return;
    const c = veCache();
    b.classList.toggle('active', c.on);
    b.textContent = 'RAM';
    b.title = `${c.on ? 'Cache inteligente RAM ligado' : 'Cache inteligente RAM desligado'} · ${veCacheBytesTxt(c.bytes)} / ${veCacheBytesTxt(c.maxBytes)} · Shift+clique limpa`;
}

function veCacheRelease(item) {
    if (!item) return;
    if (item.bmp && item.bmp.close) item.bmp.close();
    if (item.cv) { item.cv.width = 0; item.cv.height = 0; }
}

function veCacheClear(silencioso) {
    const c = veCache();
    c.rev++;
    c.frames.forEach(veCacheRelease);
    c.frames.clear();
    c.pending.clear();
    c.bytes = 0;
    if (typeof vePrInvalidar === 'function') vePrInvalidar();
    veCacheUpdateUi();
    if (!silencioso) veToast('Cache RAM limpo');
}

// Edição: descarta só os quadros cuja assinatura mudou (depois que a edição termina)
function veCacheInvalidate() {
    const c = veCache();
    clearTimeout(c.podaT);
    c.podaT = setTimeout(veCachePodar, 250);
}

function veCachePodar() {
    const c = veCache();
    if (veCacheEditando()) { c.podaT = setTimeout(veCachePodar, 250); return; }
    const seq = VE.activeSequence || 'seq';
    let mudou = false;
    c.frames.forEach((item, key) => {
        if (item.seq !== seq || item.sig === veCacheSig(item.f)) return;
        c.frames.delete(key);
        c.bytes -= item.bytes || 0;
        veCacheRelease(item);
        mudou = true;
    });
    if (typeof vePrInvalidar === 'function') vePrInvalidar();   // trechos da prévia renderizada
    if (mudou) c.ver = (c.ver || 0) + 1;
    veCacheUpdateUi();
    if (VE.ready) veDraw();
}

// Assinatura do quadro f: tudo o que muda a imagem dele
function veCacheSig(f) {
    const t = f / (VE.fps || 30);
    const partes = [VE.seqW, VE.seqH];
    VE.clips.forEach(c => {
        if (veIsAudio(c) || t < c.st - VE_CACHE_MARGEM || t >= veEnd(c) + VE_CACHE_MARGEM) return;
        const m = veMediaOf(c);
        partes.push(c, veTrkHidden(c.tr), m && (m.url || m.path || ''), veMediaOffline(m));
    });
    const li = typeof veTxLegendaEm === 'function' ? veTxLegendaEm(t) : -1;
    if (li >= 0) partes.push(VE.legendas[li], VE.legEstilo, VE.legGravar);
    const txt = JSON.stringify(partes);
    // FNV-1a em duas sementes (64 bits no total): chave curta em vez do texto inteiro
    let a = 0x811c9dc5, b = 0x9747b28c;
    for (let i = 0; i < txt.length; i++) {
        const ch = txt.charCodeAt(i);
        a = Math.imul(a ^ ch, 16777619);
        b = Math.imul(b ^ ch, 2246822519);
    }
    return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36) + '.' + txt.length;
}

function veCacheToggle(e) {
    const c = veCache();
    if (e && e.shiftKey) {
        veCacheClear(false);
        veDraw();
        return;
    }
    c.on = !c.on;
    veLsSet('ve-cache-on', c.on ? '1' : '0');
    if (!c.on) veCacheClear(true);
    veCacheUpdateUi();
    veDraw();
    veToast(c.on ? 'Cache RAM ligado' : 'Cache RAM desligado');
}

function veCacheFrame() { return Math.max(0, Math.floor((VE.playhead || 0) * (VE.fps || 30) + 1e-6)); }
function veCacheKey(f) {
    return [VE.activeSequence || 'seq', veCache().rev, Math.round((VE.fps || 30) * 1000), f].join('|');
}

function veCacheEditando() {
    const d = VE.drag && VE.drag.mode;
    return !!(VE._fxEdit || VE._propEdit || VE._ppEdit ||
        (typeof VEM !== 'undefined' && VEM.pan) ||
        (typeof VETF !== 'undefined' && VETF.drag) ||
        (d && ['move', 'trim', 'rate', 'kf', 'leg', 'trdur'].includes(d)));
}

function veCacheGet(cw, ch, pv) {
    const c = veCache();
    if (!c.on || veCacheEditando()) return null;
    const f = veCacheFrame(), key = veCacheKey(f), item = c.frames.get(key);
    if (!item) return null;
    if (item.sig !== veCacheSig(f)) {   // editado depois de guardado
        c.frames.delete(key);
        c.bytes -= item.bytes || 0;
        veCacheRelease(item);
        c.ver = (c.ver || 0) + 1;
        return null;
    }
    c.frames.delete(key);
    c.frames.set(key, item);
    return item;
}

function veCacheEvict() {
    const c = veCache();
    while (c.bytes > c.maxBytes && c.frames.size) {
        const [key, item] = c.frames.entries().next().value;
        c.frames.delete(key);
        c.bytes -= item.bytes || 0;
        veCacheRelease(item);
    }
    c.ver = (c.ver || 0) + 1;
}

function veCacheClipPesado(c) {
    if (!c) return false;
    if (typeof veIsAdj === 'function' && veIsAdj(c)) return true;
    if (typeof veIsTexto === 'function' && veIsTexto(c)) return true;
    if (typeof veIsImage === 'function' && veIsImage(c)) return true;
    if (typeof veFxActive === 'function' && veFxActive(c).length) return true;
    if (c.k && Object.keys(c.k).length) return true;
    if (Math.abs(veVel(c) - 1) > 1e-4) return true;
    if (c.tin || c.tout || c.atin || c.atout) return true;
    if (typeof veIsDefaultProps === 'function' && !veIsDefaultProps(c)) return true;
    const m = typeof veMediaOf === 'function' ? veMediaOf(c) : null;
    const inf = m && (m.id === 0 ? VE.info : m.info);
    return !!(inf && ((inf.fps || 0) > 60 || (inf.width || 0) * (inf.height || 0) > 1920 * 1080));
}

function veCacheValeGuardar(itens, trans, falta) {
    if (falta || veCacheEditando()) return false;
    if (!itens || !itens.length) return false;
    if (trans || itens.length > 1) return true;
    return itens.some(({ c }) => veCacheClipPesado(c));
}

function veCacheStore(cv, cw, ch, pv, itens, trans, falta) {
    const c = veCache();
    if (!c.on || !veCacheValeGuardar(itens, trans, falta) || !cw || !ch) return;
    const f = veCacheFrame(), key = veCacheKey(f);
    if (c.frames.has(key) || c.pending.has(key)) return;
    const sig = veCacheSig(f);
    if (typeof createImageBitmap === 'function') {
        if (c.pending.size >= 4) return;
        const seq = VE.activeSequence || 'seq', rev = c.rev, fps = VE.fps || 30;
        c.pending.add(key);
        createImageBitmap(cv).then(bmp => {
            c.pending.delete(key);
            if (!c.on || c.rev !== rev || c.frames.has(key)) { if (bmp.close) bmp.close(); return; }
            const bytes = bmp.width * bmp.height * 4;
            // editado enquanto copiava: não guarda um quadro que já nasceria velho
            if (sig !== veCacheSig(f)) { if (bmp.close) bmp.close(); return; }
            c.frames.set(key, { bmp, bytes, f, rev, seq, fps, pv, sig, w: bmp.width, h: bmp.height });
            c.bytes += bytes;
            veCacheEvict();
            veCacheUpdateUi();
            const agora = performance.now();
            if (!VE.playing || agora - (c.uiAt || 0) > 180) {
                c.uiAt = agora;
                veDraw();
            }
        }).catch(() => { c.pending.delete(key); });
        return;
    }
    if (VE.playing) return;
    const cp = document.createElement('canvas');
    cp.width = cw;
    cp.height = ch;
    cp.getContext('2d').drawImage(cv, 0, 0);
    const bytes = cw * ch * 4;
    c.frames.set(key, { cv: cp, bytes, f, rev: c.rev, seq: VE.activeSequence || 'seq', fps: VE.fps || 30, pv, sig, w: cw, h: ch });
    c.bytes += bytes;
    veCacheEvict();
    veCacheUpdateUi();
}

function veCacheRanges() {
    const c = veCache();
    if (!c.on || !c.frames.size) return [];
    const seq = VE.activeSequence || 'seq', rev = c.rev, fps = VE.fps || 30;
    const frames = [...c.frames.values()]
        .filter(x => x.rev === rev && x.seq === seq && Math.abs((x.fps || fps) - fps) < 1e-3)
        .map(x => x.f)
        .sort((a, b) => a - b);
    const out = [];
    frames.forEach(f => {
        const r = out[out.length - 1];
        if (r && f <= r.b + 1) r.b = Math.max(r.b, f);
        else out.push({ a: f, b: f });
    });
    return out.map(r => ({ a: r.a / fps, b: (r.b + 1) / fps }));
}

function veCacheDraw(ctx, X, W) {
    if (!VE.ready) return;
    if (typeof vePrDesenharBarra === 'function') vePrDesenharBarra(ctx, X, W);   // prévia renderizada (disco)
    const ranges = veCacheRanges();
    if (!ranges.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, VE_RULER);
    ctx.clip();
    // quadros no cache RAM: faixa fina azul logo abaixo da barra de render
    ctx.fillStyle = 'rgba(56,189,248,0.85)';
    ranges.forEach(r => {
        const x1 = X(r.a), x2 = X(r.b);
        if (x2 < 0 || x1 > W) return;
        ctx.fillRect(Math.max(0, x1), 4, Math.max(1, Math.min(W, x2) - Math.max(0, x1)), 2);
    });
    ctx.restore();
}

// ─────────────────────────── marcadores da timeline ───────────────────────────
const VE_MARKER_COLORS = ['#22c55e', '#f59e0b', '#38bdf8', '#a855f7', '#ef4444', '#eab308'];

function veMarkerColor(i) { return VE_MARKER_COLORS[Math.abs(i || 0) % VE_MARKER_COLORS.length]; }
function veMarkerList() { return (VE.markers || []).filter(m => Number.isFinite(+m.t)).sort((a, b) => a.t - b.t); }

function veMarkerIndexAt(t = VE.playhead) {
    const eps = veFrame() / 2 + 1e-6;
    return (VE.markers || []).findIndex(m => Math.abs((+m.t || 0) - t) <= eps);
}

function veAddMarker() {
    if (!VE.ready) return;
    const t = veSnapFrame(veClamp(VE.playhead));
    VE.markers = VE.markers || [];
    const i = veMarkerIndexAt(t);
    vePushHistory();
    if (i >= 0) {
        const atual = VE.markers[i].cor || veMarkerColor(i);
        const n = (VE_MARKER_COLORS.indexOf(atual) + 1) || 1;
        VE.markers[i].cor = veMarkerColor(n);
        veToast('Cor do marcador atualizada');
    } else {
        VE.markers.push({ t, cor: veMarkerColor(VE.markers.length), nome: '' });
        veToast('Marcador adicionado em ' + veShort(t));
    }
    VE.markers.sort((a, b) => a.t - b.t);
    veDraw();
}

function veRemoveMarkerAtPlayhead() {
    if (!VE.ready || !(VE.markers || []).length) return;
    const i = veMarkerIndexAt(veSnapFrame(VE.playhead));
    if (i < 0) { veToast('Nenhum marcador na agulha'); return; }
    vePushHistory();
    VE.markers.splice(i, 1);
    veDraw();
    veToast('Marcador apagado');
}

function veJumpMarker(dir) {
    const ms = veMarkerList();
    if (!ms.length) return;
    const eps = veFrame() / 2;
    const t = dir > 0 ? (ms.find(m => m.t > VE.playhead + eps) || ms[0]).t
        : ([...ms].reverse().find(m => m.t < VE.playhead - eps) || ms[ms.length - 1]).t;
    veSeek(t);
}

function veDrawMarkers(ctx, X, W, H) {
    if (!VE.ready || !(VE.markers || []).length) return;
    veMkDesenhar(ctx, X, W, H);   // editor-marcadores.js (com duração, nome ao longo do corpo)
}

// ─────────────────────────── modelo (timeline) ───────────────────────────
// Clipe: {tr, st, s, e} — tr = índice da trilha (V1/A1 = 0; novas trilhas crescem sob demanda),
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
    veEnsureTracks(veMaxClipTrack(VE.clips));
    const selC = VE.clips[VE.sel];
    VE.clips.sort((a, b) => a.st - b.st || a.tr - b.tr);
    VE.sel = selC ? VE.clips.indexOf(selC) : -1;
    VE.dur = VE.clips.reduce((m, c) => Math.max(m, veEnd(c)), 0);
    VE.playhead = Math.min(VE.playhead, veNavDur());
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

function veSnapshot() {
    return JSON.stringify({ clips: VE.clips, inPt: VE.inPt, outPt: VE.outPt, markers: VE.markers || [], legendas: VE.legendas || [] });
}

function vePushHistory() {
    if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
    veCacheInvalidate();
    VE.history.push(veSnapshot());
    if (VE.history.length > 200) VE.history.shift();
    VE.future = [];
    veUpdateUndo();
}

function veRestore(snap) {
    const d = JSON.parse(snap);
    VE.clips = d.clips; VE.inPt = d.inPt; VE.outPt = d.outPt;
    VE.markers = d.markers || [];
    VE.legendas = d.legendas || [];
    VE.sel = -1;
    VETX.legSel = -1;
    veCacheInvalidate();   // poda o cache RAM e recalcula os trechos renderizados (o do estado anterior volta a valer)
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
    // Desfazer/Refazer ficam no menu Editar, que confere VE.history/VE.future ao abrir
}

// ─────────────────────────── timelines do projeto ───────────────────────────
function vePlain(v, fallback) {
    if (v == null) return fallback;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return fallback; }
}

function veSeqDur(seq) {
    return (seq && Array.isArray(seq.clips) ? seq.clips : []).reduce((m, c) => Math.max(m, c.st + (c.e - c.s) / ((c && c.v) || 1)), 0);
}

function veSeqTracks(trilhas, clips) {
    const n = Math.max(VE_MIN_TRACKS,
        trilhas && Array.isArray(trilhas.v) ? trilhas.v.length : 0,
        trilhas && Array.isArray(trilhas.a) ? trilhas.a.length : 0,
        veMaxClipTrack(clips || []));
    const tr = veTrkNovo(n);
    if (trilhas && Array.isArray(trilhas.v) && Array.isArray(trilhas.a)) {
        Array.from({ length: n }, (_, k) => k).forEach(k => {
            Object.assign(tr.v[k], trilhas.v[k] || {});
            Object.assign(tr.a[k], trilhas.a[k] || {});
        });
    }
    return tr;
}

function veSeqId() { return 'seq_' + Date.now().toString(36) + '_' + (VE._seqN++); }

function veSeqMedia(seqId) {
    return VE.media.find(m => m && !m.removido && m.kind === 'timeline' && m.sequenceId === seqId);
}

function veSeqNomeDisponivel(base = 'Timeline') {
    const usados = new Set((VE.sequences || []).map(s => s.name).filter(Boolean));
    VE.media.forEach(m => { if (m && !m.removido && m.kind === 'timeline') usados.add(m.nome || m.name); });
    let n = 1, nome = `${base} ${n}`;
    while (usados.has(nome)) nome = `${base} ${++n}`;
    return nome;
}

function veSeqAtiva() {
    return (VE.sequences || []).find(s => s.id === VE.activeSequence) || null;
}

function veSeqCapturar() {
    const m = veSeqMedia(VE.activeSequence);
    return {
        id: VE.activeSequence || veSeqId(),
        name: (m && (m.nome || m.name)) || (veSeqAtiva() && veSeqAtiva().name) || veSeqNomeDisponivel(),
        clips: vePlain(VE.clips, []),
        trilhas: vePlain(VE_TRK, veTrkNovo()),
        texto: { palavras: vePlain(VETX.palavras, []), idioma: VETX.idioma || 'pt', chave: VETX.chave || '' },
        legendas: vePlain(VE.legendas || [], []),
        legEstilo: vePlain(VE.legEstilo || null, null),
        legGravar: VE.legGravar !== false,
        inPt: VE.inPt ?? null,
        outPt: VE.outPt ?? null,
        markers: vePlain(VE.markers || [], []),
        guias: vePlain(VE.guias || [], []),
        playhead: VE.playhead || 0,
        view: { pps: VE.pps, x: VE.view || 0 },
        w: VE.seqW, h: VE.seqH,   // Configurações da sequência (quadro)
        master: vePlain(VE.master || null, null),   // Hard Limiter no Master (editor-medidor.js)
    };
}

function veSeqSalvarAtiva() {
    if (!VE.activeSequence) return;
    const seq = veSeqAtiva();
    if (!seq) return;
    Object.assign(seq, veSeqCapturar(), { id: seq.id });
}

function veSeqAplicar(seq, opts = {}) {
    if (!seq) return;
    veStop();
    VE.activeSequence = seq.id;
    veCacheInvalidate();
    if (seq.w > 0 && seq.h > 0) veSeqQuadro(seq.w, seq.h);
    VE.clips = vePlain(seq.clips, []);
    VE_TRK = veSeqTracks(seq.trilhas, VE.clips);
    veEnsureTracks(veTrackCount());
    veBuildHeads();
    VE.inPt = seq.inPt ?? null;
    VE.outPt = seq.outPt ?? null;
    VE.markers = vePlain(seq.markers || [], []);
    VE.guias = vePlain(seq.guias || [], []);
    VE.legendas = vePlain(seq.legendas || [], []);
    VE.legEstilo = vePlain(seq.legEstilo || null, null);
    VE.legGravar = seq.legGravar !== false;
    VE.master = vePlain(seq.master || null, null);
    if (typeof veMedMasterUi === 'function') veMedMasterUi();
    if (typeof VETX !== 'undefined') {
        VETX.palavras = vePlain(seq.texto && seq.texto.palavras, []);
        VETX.idioma = (seq.texto && seq.texto.idioma) || 'pt';
        VETX.chave = (seq.texto && seq.texto.chave) || '';
        VETX.legSel = -1;
        VETX.construidoTexto = false;
    }
    VE.sel = -1;
    VE.trSel = null;
    VE.bordaSel = null;
    VE.history = [];
    VE.future = [];
    veUpdateUndo();
    veRelayout();
    if (seq.view && seq.view.pps > 0) { VE.pps = seq.view.pps; VE.view = seq.view.x || 0; }
    else { VE.pps = veFitPps(); VE.view = 0; }
    veOpenTimelineTab(seq.id);
    veAfterEdit(seq.playhead || 0);
    if (!opts.silent) veToast('Timeline aberta: ' + (seq.name || 'Timeline'));
}

function veSeqCriarMidia(seq, pasta) {
    const m = { id: VE.media.length, kind: 'timeline', name: seq.name || veSeqNomeDisponivel(), sequenceId: seq.id, pasta: pasta || null };
    VE.media.push(m);
    return m;
}

function veEnsureSequence() {
    if ((VE.sequences || []).length || !VE.ready) return;
    const id = veSeqId(), name = veSeqNomeDisponivel();
    VE.activeSequence = id;
    const seq = { ...veSeqCapturar(), id, name };
    VE.sequences = [seq];
    veSeqCriarMidia(seq, null);
    veOpenTimelineTab(id);
}

function veCreateTimeline(opts = {}) {
    if (!VE.ready) { veToast('Abra um projeto antes de criar uma timeline'); return null; }
    veSeqSalvarAtiva();
    const origem = opts.cloneId ? (VE.sequences || []).find(s => s.id === opts.cloneId) : null;
    const nomeBase = origem ? ((origem.name || 'Timeline') + ' cópia') : 'Timeline';
    const id = veSeqId();
    const seq = origem ? vePlain(origem, {}) : {
        clips: [], trilhas: veTrkNovo(), texto: { palavras: [], idioma: 'pt', chave: '' },
        legendas: [], legEstilo: null, legGravar: true, inPt: null, outPt: null, markers: [], guias: [], playhead: 0, view: { pps: 0, x: 0 },
        w: VE.seqW, h: VE.seqH,   // nova timeline nasce com o quadro da atual
    };
    seq.id = id;
    seq.name = opts.name || veSeqNomeDisponivel(nomeBase);
    VE.sequences = VE.sequences || [];
    VE.sequences.push(seq);
    const srcMidia = origem && veSeqMedia(origem.id);
    const pasta = opts.pasta !== undefined ? opts.pasta : (srcMidia ? srcMidia.pasta : (typeof vePjDestino === 'function' ? vePjDestino() : null));
    const m = veSeqCriarMidia(seq, pasta);
    VE.activeSequence = id;
    VEPJ.sel = new Set(['m:' + m.id]);
    VEPJ.foco = 'm:' + m.id;
    VE.dirty = true;
    veUpdateTitle();
    veSeqAplicar(seq, { silent: true });
    vePjRender();
    veToast(origem ? 'Timeline duplicada' : 'Nova timeline criada');
    return seq;
}

function veOpenTimeline(seqId) {
    if (!VE.ready || seqId === VE.activeSequence) return;
    veSeqSalvarAtiva();
    const seq = (VE.sequences || []).find(s => s.id === seqId);
    if (!seq) return;
    veSeqAplicar(seq);
    const m = veSeqMedia(seq.id);
    if (m) { VEPJ.sel = new Set(['m:' + m.id]); VEPJ.foco = 'm:' + m.id; vePjRender(); }
}

function veDeleteTimeline(seqId) {
    const seqs = VE.sequences || [];
    const seq = seqs.find(s => s.id === seqId);
    if (!seq) return false;
    if (seqs.length <= 1) { veToast('O projeto precisa ter pelo menos uma timeline'); return false; }
    const m = veSeqMedia(seqId);
    VE.sequences = seqs.filter(s => s.id !== seqId);
    if (m) m.removido = true;
    if (VE.activeSequence === seqId) veSeqAplicar(VE.sequences[0], { silent: true });
    VE.openSequences = (VE.openSequences || []).filter(id => id !== seqId);
    VE.dirty = true;
    veUpdateTitle();
    veSeqTabsRender();
    vePjRender();
    veToast('Timeline apagada');
    return true;
}

// ─────────────────────────── Configurações da sequência (tamanho do quadro) ───────────────────────────
// Muda o quadro da timeline ativa. Clipes sem Movimento mexido (sem c.p) se reencaixam sozinhos no quadro novo
// (veDefProps); os mexidos ficam onde estão, como no Premiere.
function veSeqQuadro(w, h) {
    VE.seqW = Math.max(16, Math.min(8192, Math.round(w / 2) * 2));
    VE.seqH = Math.max(16, Math.min(8192, Math.round(h / 2) * 2));
    if (typeof veApplyMonitor === 'function' && $ve('ve-canvas')) veApplyMonitor();
}

const VE_SEQ_PRESETS = [
    ['1920x1080', '1920 × 1080 · Full HD 16:9'], ['1280x720', '1280 × 720 · HD 16:9'], ['3840x2160', '3840 × 2160 · 4K UHD 16:9'],
    ['1080x1920', '1080 × 1920 · Vertical 9:16 (Reels, TikTok, Shorts)'], ['1080x1350', '1080 × 1350 · Retrato 4:5 (Instagram)'],
    ['1080x1080', '1080 × 1080 · Quadrado 1:1'], ['2560x1080', '2560 × 1080 · Ultrawide 21:9'],
];

function veSeqConfigAbrir() {
    if (!VE.ready) { veToast('Abra um projeto primeiro'); return; }
    let md = $ve('ve-seqcfg');
    if (!md) {
        md = document.createElement('div');
        md.className = 've-modal';
        md.id = 've-seqcfg';
        md.innerHTML = `<div class="ve-modal-box ve-seqcfg-box">
            <div class="ve-modal-head"><span>Configurações da sequência</span><button class="ve-icon-btn" data-sq="fechar" title="Fechar (Esc)"><svg class="i"><use href="#i-x"/></svg></button></div>
            <div class="ve-modal-body">
                <div class="ve-field"><label>Timeline</label><div class="ve-seqcfg-nome" id="ve-sq-nome"></div></div>
                <div class="ve-field"><label for="ve-sq-preset">Predefinição</label><select class="ve-select" id="ve-sq-preset"></select></div>
                <div class="ve-field"><label>Tamanho do quadro</label>
                    <div class="ve-seqcfg-tam">
                        <label class="ve-seqcfg-dim"><span>Largura</span><input type="number" class="ve-select" id="ve-sq-w" min="16" max="8192" step="2"></label>
                        <button class="ve-icon-btn" data-sq="girar" title="Trocar largura e altura (horizontal ↔ vertical)">⇄</button>
                        <label class="ve-seqcfg-dim"><span>Altura</span><input type="number" class="ve-select" id="ve-sq-h" min="16" max="8192" step="2"></label>
                    </div>
                    <div class="ve-seqcfg-prev"><div id="ve-sq-caixa"></div><span id="ve-sq-info"></span></div>
                </div>
                <div class="ve-field"><label>Taxa de quadros</label><div class="ve-seqcfg-nome" id="ve-sq-fps"></div></div>
                <small class="ve-seqcfg-dica">Clipes sem posição/escala mexidas se encaixam sozinhos no quadro novo. A exportação sai neste tamanho.</small>
            </div>
            <div class="ve-modal-foot"><button class="ve-btn ve-btn-ghost" data-sq="fechar">Cancelar</button><button class="ve-btn ve-btn-primary" data-sq="ok">Aplicar</button></div>
        </div>`;
        $ve('ve').appendChild(md);
        const w = md.querySelector('#ve-sq-w'), h = md.querySelector('#ve-sq-h'), pre = md.querySelector('#ve-sq-preset');
        const sync = () => veSeqConfigPrevia();
        pre.addEventListener('change', () => {
            if (pre.value === 'video') { w.value = VE.info.width; h.value = VE.info.height; }
            else if (pre.value !== 'custom') { const [a, b] = pre.value.split('x'); w.value = a; h.value = b; }
            sync();
        });
        [w, h].forEach(el => el.addEventListener('input', sync));
        md.addEventListener('click', e => {
            const b = e.target.closest('[data-sq]');
            if (!b) { if (e.target === md) md.hidden = true; return; }
            if (b.dataset.sq === 'girar') { [w.value, h.value] = [h.value, w.value]; sync(); }
            else if (b.dataset.sq === 'fechar') md.hidden = true;
            else if (b.dataset.sq === 'ok') veSeqConfigAplicar();
        });
        md.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Escape') md.hidden = true;
            else if (e.key === 'Enter' && e.target.tagName !== 'SELECT') veSeqConfigAplicar();
        });
    }
    const m = veSeqMedia(VE.activeSequence);
    md.querySelector('#ve-sq-nome').textContent = (m && (m.nome || m.name)) || 'Timeline';
    const v = VE.info && VE.info.width && !VE.info.audio_only ? `${VE.info.width}x${VE.info.height}` : null;
    md.querySelector('#ve-sq-preset').innerHTML = VE_SEQ_PRESETS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('') +
        (v ? `<option value="video">Igual ao vídeo (${v.replace('x', ' × ')})</option>` : '') + '<option value="custom">Personalizado</option>';
    md.querySelector('#ve-sq-w').value = VE.seqW;
    md.querySelector('#ve-sq-h').value = VE.seqH;
    md.querySelector('#ve-sq-fps').innerHTML = `${String(+(VE.fps || 30).toFixed(3)).replace('.', ',')} qps <small>(a do vídeo)</small>`;
    md.hidden = false;
    veSeqConfigPrevia();
    md.querySelector('#ve-sq-preset').focus();
}

// Caixa com a proporção escolhida + a descrição (e a predefinição que bate com os números)
function veSeqConfigPrevia() {
    const md = $ve('ve-seqcfg'), w = +md.querySelector('#ve-sq-w').value || 0, h = +md.querySelector('#ve-sq-h').value || 0;
    const pre = md.querySelector('#ve-sq-preset'), k = `${w}x${h}`;
    const v = VE.info && VE.info.width ? `${VE.info.width}x${VE.info.height}` : '';
    pre.value = VE_SEQ_PRESETS.some(([p]) => p === k) ? k : k === v ? 'video' : 'custom';
    const caixa = md.querySelector('#ve-sq-caixa'), lado = 64, r = w && h ? w / h : 16 / 9;
    caixa.style.width = (r >= 1 ? lado : lado * r) + 'px';
    caixa.style.height = (r >= 1 ? lado / r : lado) + 'px';
    const mdc = (a, b) => (b ? mdc(b, a % b) : a), g = w && h ? mdc(w, h) : 1;
    md.querySelector('#ve-sq-info').textContent = w && h ? `${w} × ${h} px · ${w / g}:${h / g} · ${w > h ? 'horizontal' : w < h ? 'vertical' : 'quadrado'}` : '';
}

function veSeqConfigAplicar() {
    const md = $ve('ve-seqcfg'), w = +md.querySelector('#ve-sq-w').value, h = +md.querySelector('#ve-sq-h').value;
    if (!(w >= 16 && h >= 16 && w <= 8192 && h <= 8192)) { veToast('Use de 16 a 8192 px na largura e na altura'); return; }
    md.hidden = true;
    if (Math.round(w / 2) * 2 === VE.seqW && Math.round(h / 2) * 2 === VE.seqH) return;
    veSeqQuadro(w, h);
    veSeqSalvarAtiva();
    VE.dirty = true;
    veUpdateTitle();
    veMonitorFit();
    veRefresh();
    veToast(`Quadro da sequência: ${VE.seqW} × ${VE.seqH}`);
}

// Depois de qualquer edição: reencaixa zoom/visão, reposiciona a agulha e redesenha
function veAfterEdit(playhead) {
    if (VE.pps < veMinPps()) VE.pps = veMinPps();   // afastado além da sequência continua afastado
    veClampView();
    veSyncZoomSlider();
    veSeek(playhead != null ? playhead : VE.playhead);
    veRefresh();
}

// Corta TODAS as trilhas no ponto (cortar = fatiar, nunca apagar). `so` = só estes clipes (E: os selecionados)
function veSplitAt(t, quiet, so) {
    if (!VE.ready) return false;
    t = veSnapFrame(veClamp(t));
    const f = veFrame() * 0.99;
    const base = so || VE.clips;
    const alvo = base.filter(c => !veLocked(c) && t - c.st >= f && veEnd(c) - t >= f);
    if (!alvo.length) {
        if (!quiet && base.some(c => veLocked(c) && t - c.st >= f && veEnd(c) - t >= f)) { veAvisoBloqueio(); return false; }
        if (!quiet) veToast(so ? 'Nenhum clipe selecionado passa pela agulha' : veTopAt(t) < 0 ? 'Não há clipe na agulha' : 'Já existe um corte aqui');
        return false;
    }
    vePushHistory();
    const selC = VE.clips[VE.sel], lk = veLkMapa();
    alvo.forEach(c => {
        const src = veSrcAt(c, t);
        VE.clips.push(veSemTin(lk({ ...c, st: t, s: src, e: c.e })));
        c.e = src;
        delete c.tout; delete c.atout;
    });
    VE.sel = selC ? VE.clips.indexOf(selC) : -1;
    veRelayout();
    veRefresh();
    return true;
}

function veLegClone(l) {
    return vePlain(l, { st: 0, en: 0, texto: '' });
}

function veLegSelecionar(i) {
    VETX.legSel = i;
    VE.sel = -1;
    VE.selx = null;
    VE.trSel = null;
    VE.bordaSel = null;
}

function veLegOrdenar(sel) {
    const L = VE.legendas || [];
    L.sort((a, b) => (a.st - b.st) || (a.en - b.en));
    VETX.legSel = sel ? L.indexOf(sel) : -1;
}

function veLegIndiceCortavel(t, selecionada) {
    const L = VE.legendas || [], f = Math.max(veFrame() * 0.99, 0.01);
    if (selecionada && VETX.legSel >= 0 && L[VETX.legSel]) {
        const l = L[VETX.legSel];
        return t - l.st >= f && l.en - t >= f ? VETX.legSel : -1;
    }
    return L.findIndex(l => t - l.st >= f && l.en - t >= f);
}

function veLegSplitAt(t, selecionada, quiet) {
    if (!VE.ready || !(VE.legendas || []).length) return false;
    t = veSnapFrame(veClamp(t));
    const i = veLegIndiceCortavel(t, selecionada);
    if (i < 0) {
        if (!quiet) veToast(selecionada ? 'A legenda selecionada não passa pela agulha' : 'Não há legenda na agulha');
        return false;
    }
    vePushHistory();
    const L = VE.legendas, esq = L[i], dir = { ...veLegClone(esq), st: t };
    L[i] = { ...esq, en: t };
    L.splice(i + 1, 0, dir);
    veLegSelecionar(i + 1);
    veRefresh();
    return true;
}

function veSplitAtPlayhead() {
    const t = VE.playhead;
    const sel0 = VE.sel, selx0 = VE.selx;
    const clipOk = veSplitAt(t, true);
    const legOk = veLegSplitAt(t, false, true);
    if (clipOk && legOk) { VE.sel = sel0; VE.selx = selx0; VETX.legSel = -1; veRefresh(); }
    const ok = clipOk || legOk;
    veToast(ok ? 'Cortado em ' + veShort(t) : 'Não há clipe ou legenda na agulha');
}

// Remove o intervalo [a, b] de todas as trilhas e puxa o que vem depois (ripple)
function veRippleRemove(a, b, label) {
    if (!VE.ready) return false;
    a = veSnapFrame(veClamp(Math.min(a, b)));
    b = veSnapFrame(veClamp(Math.max(a, b)));
    const d = b - a;
    if (d < veFrame() * 0.5) return false;
    const tiny = veFrame() * 0.5;
    const out = [], lk = veLkMapa();
    VE.clips.forEach(c => {
        const en = veEnd(c);
        if (en <= a + VE_EPS || veLocked(c)) { out.push({ ...c }); return; }   // trilha bloqueada não mexe
        if (c.st >= b - VE_EPS) { out.push({ ...c, st: c.st - d }); return; }
        const esq = c.st < a && a - c.st > tiny;
        if (esq) out.push(veSemTout({ ...c, e: veSrcAt(c, a) }));
        if (en > b && en - b > tiny) out.push((esq ? lk : x => x)(veSemTin({ ...c, st: a, s: veSrcAt(c, b) })));
    });
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
    vePushHistory();
    const c = VE.clips[i], a = c.st, b = veEnd(c), d = b - a;
    VE.clips.splice(i, 1);
    if (!ripple) {
        VE.sel = -1;
        veRelayout();
        veAfterEdit(Math.min(VE.playhead, veNavDur()));
        veToast('Clipe apagado (Shift+D apaga e fecha o espaço)');
        return;
    }
    const ocupado = VE.clips.some(o => o.st < b - VE_EPS && veEnd(o) > a + VE_EPS);
    if (!ocupado) VE.clips.forEach(o => { if (o.st >= b - VE_EPS && !veLocked(o)) o.st -= d; });
    VE.sel = -1;
    veRelayout();
    veAfterEdit(VE.playhead > b && !ocupado ? VE.playhead - d : Math.min(VE.playhead, veNavDur()));
    veToast(ocupado ? 'Clipe apagado (o espaço ficou porque há clipes em outras trilhas)' : 'Clipe apagado');
}

function veDeleteSelected(ripple) {
    if (VE.sel < 0 && VE.gapSel && veFecharEspaco()) return;   // espaço vazio selecionado (editor-lacunas.js)
    if (VE.sel < 0 && veTransApagar()) return;
    if (veSelLista().length > 1) { veApagarVarios(veSelLista(), ripple); return; }
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

// ── seleção múltipla e seleção vinculada (como no Premiere) ──
// VE.sel continua sendo o clipe principal (Propriedades, monitor). Os outros selecionados ficam em
// VE.selx = {prim, lista}, que só vale enquanto VE.sel apontar para `prim`: quem troca VE.sel volta à seleção simples.
// Seleção vinculada (botão da timeline): ligada, clicar no vídeo ou no áudio pega os dois; desligada, pega só a
// parte clicada — o clipe se separa em imagem (c.x = 'v') e som (c.x = 'a'), que seguem vinculados por c.lk.
VE.vinculo = veLsGet('ve-vinculo') !== '0';
VE.selx = null;

function veSelLista() {
    const p = VE.clips[VE.sel];
    if (!p) return [];
    if (!VE.selx || VE.selx.prim !== p) return [p];
    return VE.selx.lista.filter(c => VE.clips.includes(c));
}

function veSelDefinir(lista, prim) {
    VETX.legSel = -1;
    VE.gapSel = null;
    lista = [...new Set(lista.filter(Boolean))];
    if (!lista.length) { VE.sel = -1; VE.selx = null; return; }
    if (!prim || !lista.includes(prim)) prim = lista[lista.length - 1];
    VE.sel = VE.clips.indexOf(prim);
    VE.selx = lista.length > 1 ? { prim, lista } : null;
}

const veVinculados = c => c.lk ? VE.clips.filter(o => o.lk === c.lk) : [c];
let veLkN = 0;
const veNovoLk = () => Date.now().toString(36) + (veLkN++).toString(36);
// Pedaços de um clipe cortado: a transição de entrada (c.tin) fica no da esquerda e a de saída no da direita
const veSemTin = c => { delete c.tin; delete c.atin; return c; };
const veSemTout = c => { delete c.tout; delete c.atout; return c; };
// Um corte gera um par novo: os pedaços da direita ganham um vínculo próprio (o mesmo para imagem e som)
function veLkMapa() {
    const m = {};
    return c => { if (c.lk) c.lk = m[c.lk] || (m[c.lk] = veNovoLk()); return c; };
}

// Vídeo com som → dois clipes vinculados (imagem e som). Não muda o resultado; devolve [v, a] ou null.
function veSeparar(c) {
    if (c.x || veIsImage(c) || veIsAudio(c) || !veTemSom(c)) return null;
    const lk = veNovoLk(), a = { ...veCopiaClipe(c), x: 'a', lk };
    c.x = 'v'; c.lk = lk;
    VE.clips.push(a);
    veRelayout();
    return [c, a];
}

// O que um clique/retângulo na linha `kind` ('v'/'a') pega: com vínculo, o clipe e os vinculados; sem, só a parte
function vePegar(c, kind) {
    if (VE.vinculo) return veVinculados(c);
    const par = !c.x && (kind === 'v' || kind === 'a') ? veSeparar(c) : null;
    return par ? [kind === 'v' ? par[0] : par[1]] : [c];
}

function veToggleVinculo() {
    VE.vinculo = !VE.vinculo;
    veLsSet('ve-vinculo', VE.vinculo ? '1' : '0');
    veSyncVinculo();
    veToast(VE.vinculo ? 'Seleção vinculada ligada: vídeo e áudio juntos' : 'Seleção vinculada desligada: vídeo e áudio separados');
}
function veSyncVinculo() { const b = $ve('ve-vinculo'); if (b) b.classList.toggle('active', VE.vinculo); }

// E: corta na agulha só os clipes selecionados (' corta todas as trilhas)
function veCortarSelecionados() {
    const lista = veSelLista();
    if (!lista.length) {
        if (VETX.legSel >= 0 && VE.legendas[VETX.legSel]) {
            if (veLegSplitAt(VE.playhead, true)) veToast('Legenda cortada em ' + veShort(VE.playhead));
            return;
        }
        veToast("Selecione um clipe ou legenda (E corta só os selecionados; ' corta todas as trilhas)");
        return;
    }
    if (veSplitAt(VE.playhead, false, lista)) veToast('Selecionados cortados em ' + veShort(VE.playhead));
}

// Apaga vários clipes. ripple: fecha os espaços que ficarem vazios em todas as trilhas
function veApagarVarios(lista, ripple) {
    const livres = lista.filter(c => !veLocked(c));
    if (!livres.length) { veAvisoBloqueio(); return; }
    vePushHistory();
    VE.clips = VE.clips.filter(c => !livres.includes(c));
    let tira = 0;
    if (ripple) {
        const iv = livres.map(c => [c.st, veEnd(c)]).sort((a, b) => a[0] - b[0]), junto = [];
        iv.forEach(([a, b]) => { const u = junto[junto.length - 1]; if (u && a <= u[1] + VE_EPS) u[1] = Math.max(u[1], b); else junto.push([a, b]); });
        junto.reverse().forEach(([a, b]) => {
            if (VE.clips.some(o => o.st < b - VE_EPS && veEnd(o) > a + VE_EPS)) return;
            VE.clips.forEach(o => { if (o.st >= b - VE_EPS && !veLocked(o)) o.st -= b - a; });
            if (VE.playhead >= b) tira += b - a;
        });
    }
    VE.sel = -1; VE.selx = null;
    veRelayout();
    veAfterEdit(Math.min(VE.playhead - tira, veNavDur()));
    veToast(`${livres.length} clipes apagados` + (livres.length < lista.length ? ' (os de trilhas bloqueadas ficaram)' : ''));
}

// Deslocamento de trilha que o grupo aguenta (fora da base ou em trilha bloqueada: não muda)
function veGrupoDtr(lista, dtr) {
    if (!dtr) return 0;
    const alvos = lista.map(c => c.tr + dtr);
    if (alvos.some(tr => tr < 0)) return 0;
    veEnsureTracks(Math.max(...alvos) + 1);
    return alvos.some(veTrkLocked) ? 0 : dtr;
}

// Solta os selecionados deslocados de dt segundos e dtr trilhas (alt = cópias). Sobrescreve o que estiver embaixo.
function veMoverGrupo(lista, dt, dtr, alt) {
    lista = lista.filter(c => !veLocked(c));
    if (!lista.length) { veAvisoBloqueio(); veDraw(); return; }
    dt = Math.max(dt, -Math.min(...lista.map(c => c.st)));
    dtr = veGrupoDtr(lista, dtr);
    if (Math.abs(dt) < veFrame() / 2 && !dtr) { veDraw(); return; }
    vePushHistory();
    const prim = VE.clips[VE.sel], lk = veLkMapa(), tiny = veFrame() * 0.5;
    const novos = lista.map(c => {
        const n = alt ? lk(JSON.parse(JSON.stringify(c))) : { ...c };
        n.st = veSnapFrame(c.st + dt); n.tr = c.tr + dtr;
        return n;
    });
    let base = alt ? VE.clips.slice() : VE.clips.filter(c => !lista.includes(c));
    novos.forEach(nv => {
        const a = nv.st, b = veEnd(nv), out = [];
        base.forEach(o => {
            const en = veEnd(o);
            if (o.tr !== nv.tr || en <= a + VE_EPS || o.st >= b - VE_EPS || !veConflita(o, nv)) { out.push(o); return; }
            if (o.st < a && a - o.st > tiny) out.push(veSemTout({ ...o, e: veSrcAt(o, a) }));
            if (en > b && en - b > tiny) out.push(veSemTin({ ...o, st: b, s: veSrcAt(o, b) }));
        });
        base = out;
    });
    VE.clips = base.concat(novos);
    veSelDefinir(novos, novos[lista.indexOf(prim)]);
    veRelayout();
    veAfterEdit(VE.playhead);
    veToast(`${novos.length} clipes ${alt ? 'duplicados' : 'movidos'}`);
}

// Retângulo de seleção (arrastar na área vazia): pega o que ele tocar; Shift soma à seleção
function veMarqueeFim(d) {
    const ta = Math.min(d.ta, d.tb), tb = Math.max(d.ta, d.tb);
    const ya = Math.min(d.ya, d.yb), yb = Math.max(d.ya, d.yb);
    const rows = veTrackRows().filter(r => r.kind !== 'l' && r.kind !== 'k' && r.y < yb && r.y + r.h > ya);
    const toca = (kind, tr) => rows.some(r => r.kind === kind && veTrackIndex(r) === tr);
    const hits = VE.clips.filter(c => !veLocked(c) && c.st < tb && veEnd(c) > ta)
        .map(c => ({ c, v: veOcupaV(c) && toca('v', c.tr), a: veOcupaA(c) && toca('a', c.tr) }))
        .filter(h => h.v || h.a);
    const pega = [];
    hits.forEach(({ c, v, a }) => pega.push(...(v && a ? veVinculados(c) : vePegar(c, v ? 'v' : 'a'))));
    veSelDefinir(d.base.concat(pega), d.base[0] || pega[0]);
}

// ── duplicar / copiar e colar / mudar de trilha ──
// Põe `novo` na trilha dele sobrescrevendo o que estiver embaixo (como soltar um clipe); `exceto` = índice que sai
function vePlaceClip(novo, exceto = -1) {
    const a = novo.st, b = veEnd(novo), tiny = veFrame() * 0.5, out = [];
    VE.clips.forEach((o, j) => {
        if (j === exceto) return;
        const en = veEnd(o);
        if (o.tr !== novo.tr || en <= a + VE_EPS || o.st >= b - VE_EPS || !veConflita(o, novo)) { out.push(o); return; }
        if (o.st < a && a - o.st > tiny) out.push(veSemTout({ ...o, e: veSrcAt(o, a) }));
        if (en > b && en - b > tiny) out.push(veSemTin({ ...o, st: b, s: veSrcAt(o, b) }));
    });
    out.push(novo);
    VE.clips = out;
    VE.sel = out.indexOf(novo);
    veRelayout();
}

// cópia solta: não herda o vínculo (lk) do original
const veCopiaClipe = c => { const n = JSON.parse(JSON.stringify(c)); delete n.lk; return n; };

// Alt+arrastar: uma cópia igual cai onde o clipe foi solto; o original fica
function veDuplicarEm(i, tr, st) {
    const c = VE.clips[i];
    if (!c) return;
    veEnsureTrackIndex(tr);
    if (veTrkLocked(tr)) { veAvisoBloqueio(); veDraw(); return; }
    vePushHistory();
    vePlaceClip({ ...veCopiaClipe(c), tr, st });
    veAfterEdit(VE.playhead);
    veToast(`${veNomeClipe(c)} duplicado em ${veIsAudio(c) ? 'A' : 'V'}${tr + 1}`);
}

// Ctrl+C / Ctrl+X / Ctrl+V: cola na agulha, na mesma trilha de onde saiu (a agulha vai para o fim do colado)
function veCopiar(recortar) {
    const c = VE.clips[VE.sel];
    const l = (VE.legendas || [])[VETX.legSel];
    if (!c && l) {
        VE.clipboard = { leg: veLegClone(l), path: VE.path };
        if (recortar) {
            vePushHistory();
            VE.legendas.splice(VETX.legSel, 1);
            veLegSelecionar(-1);
            veRefresh();
            veToast('Legenda recortada: Ctrl+V cola na agulha');
        } else veToast('Legenda copiada: Ctrl+V cola na agulha');
        return;
    }
    if (!c) { veToast('Selecione um clipe ou legenda para copiar'); return; }
    VE.clipboard = { c: veCopiaClipe(c), path: VE.path };
    if (recortar) { veDeleteClip(VE.sel, false); veToast('Clipe recortado: Ctrl+V cola na agulha'); }
    else veToast('Clipe copiado: Ctrl+V cola na agulha');
}

function veColar() {
    const cb = VE.clipboard;
    if (!cb || cb.path !== VE.path) { veToast('Nada copiado (Ctrl+C num clipe ou legenda primeiro)'); return; }
    if (cb.leg) {
        const novo = veLegClone(cb.leg), len = Math.max(veFrame(), novo.en - novo.st);
        novo.st = veSnapFrame(VE.playhead);
        novo.en = +(novo.st + len).toFixed(3);
        vePushHistory();
        VE.legendas = VE.legendas || [];
        VE.legendas.push(novo);
        veLegOrdenar(novo);
        veSeek(novo.en);
        veRefresh();
        veToast('Legenda colada na trilha LEG');
        return;
    }
    if (cb.c.m && !VE.media[cb.c.m]) { veToast('A mídia desse clipe não está mais no projeto'); return; }
    veEnsureTrackIndex(cb.c.tr);
    if (veTrkLocked(cb.c.tr)) { veAvisoBloqueio(); return; }
    vePushHistory();
    const novo = { ...veCopiaClipe(cb.c), st: veSnapFrame(VE.playhead) };
    vePlaceClip(novo);
    veAfterEdit(veEnd(novo));
    veToast(`Colado em ${veIsAudio(novo) ? 'A' : 'V'}${novo.tr + 1}`);
}

// Alt+arrastar no monitor: a cópia nasce na primeira trilha livre acima, no mesmo tempo, e é ela que se move.
function veDuplicarAcima() {
    const c = VE.clips[VE.sel];
    if (!c) return false;
    const a = c.st, b = veEnd(c);
    const acima = veTrackIndexes().filter(k => k > c.tr);
    let tr = acima.find(k => !veTrkLocked(k) && veTrackFree(k, a, b, c));
    if (tr == null && acima.length && !veTrkLocked(c.tr + 1)) tr = c.tr + 1;
    if (tr == null) { tr = veTrackCount(); veEnsureTrackIndex(tr); }
    if (veTrkLocked(tr)) { veAvisoBloqueio(); return false; }
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
    if (tr < 0) return;
    veEnsureTrackIndex(tr);
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
    if (!c || tr < 0) { veDraw(); return; }
    veEnsureTrackIndex(tr);
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
        if (o.st < a && a - o.st > tiny) out.push(veSemTout({ ...o, e: veSrcAt(o, a) }));
        if (en > b && en - b > tiny) out.push(veSemTin({ ...o, st: b, s: veSrcAt(o, b) }));
    });
    out.push(moved);
    VE.clips = out;
    VE.sel = out.indexOf(moved);
    veRelayout();
    veAfterEdit(VE.playhead);
}

function veMesmoPontoDeEdicao(a, b) {
    return Math.abs(veSnapFrame(a) - veSnapFrame(b)) < veFrame() * 0.5;
}

function veClipesDireitaDoCorte(t) {
    const base = VE.clips.filter(c => veMesmoPontoDeEdicao(c.st, t) &&
        VE.clips.some(o => o !== c && o.tr === c.tr && veConflita(o, c) && veMesmoPontoDeEdicao(veEnd(o), t)));
    if (!VE.vinculo) return base;
    const alvos = new Set(base);
    base.forEach(c => veVinculados(c).forEach(o => { if (veMesmoPontoDeEdicao(o.st, t)) alvos.add(o); }));
    return [...alvos];
}

function veRippleTrimStartNoCorte(t) {
    const alvos = veClipesDireitaDoCorte(t);
    if (!alvos.length) return null;
    const bloqueados = alvos.filter(veLocked), livres = alvos.filter(c => !veLocked(c));
    if (!livres.length || (VE.vinculo && bloqueados.length)) { veAvisoBloqueio(); return true; }
    const f = veFrame();
    if (livres.some(c => veLen(c) <= f + VE_EPS)) { veToast('Limite do clipe atingido'); return true; }
    veRippleRemove(t, t + f, 'Aparado 1 quadro no corte');
    return true;
}

// Q: apaga do corte anterior (qualquer trilha) até a agulha; W: da agulha até o próximo corte
function veRippleTrimStart() {
    const t = veSnapFrame(VE.playhead);
    const noCorte = veRippleTrimStartNoCorte(t);
    if (noCorte != null) return;
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
    VEDK.b.muted = true;
    return VEDK.b;
}

// Volta ao deck A e solta o B (abrir/fechar vídeo)
function veDeckReset() {
    const b = VEDK.b;
    if (VEDK.ativo) { veDeckA().muted = VE.muted; }
    VEDK.ativo = 0;
    VEDK.i = -1;
    if (b && b.getAttribute('src')) { b.pause(); b.removeAttribute('src'); b._mid = null; b.load(); }
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
    if (veMediaOffline(veMediaOf(c))) {
        VE.cur = i;
        if (!v.paused) v.pause();
        veDrawMonitor();
        return;
    }
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
    if (veDeckCarregar(v, veMid(c), veDeckTag(v))) {
        try { v.currentTime = src; } catch (e) { /* carregando */ }
    } else if (forcar || i !== VE.cur || Math.abs(v.currentTime - src) > 0.25) {
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
    if (!VE.ready || VE.playing) return;
    if (VE.playhead >= VE.dur - veFrame()) VE.playhead = 0;
    VE.playing = true;
    VE._last = performance.now();
    VE._tlPlayKey = null;
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
    if (typeof vePrPreparar === 'function') vePrPreparar();
    veSeguirAudio();
    const viewMudou = veFollowPlayhead(true);
    veUpdateReadouts();
    if (viewMudou || vePlaybackTimelineDue()) veDraw();
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

// G vale para TODOS os clipes selecionados com som (como no Premiere): o ganho soma em cada um (mantém a diferença
// entre eles) e o Hard Limiter fica igual em todos. Imagens, clipes sem som e travados ficam de fora.
function veGainAlvos() { return veSelLista().filter(c => !veIsImage(c) && veTemSom(c) && !veLocked(c)); }

function veOpenGain() {
    const p = VE.clips[VE.sel];
    if (!p) { veToast('Selecione um clipe para ajustar o ganho'); return; }
    const alvos = veGainAlvos();
    if (!alvos.length) {
        if (veIsImage(p)) veToast('Imagem não tem som');
        else if (veLocked(p)) veAvisoBloqueio();
        else veToast(veMediaOffline(veMediaOf(p)) ? 'Mídia offline: relinque antes de ajustar o ganho' : 'Este clipe não tem som');
        return;
    }
    const c = alvos.includes(p) ? p : alvos[0];
    VE._gainAlvos = alvos;
    if (VE.playing) veStop();
    const fora = veSelLista().length - alvos.length;
    $ve('ve-gain-cur').innerHTML = alvos.length > 1
        ? `<strong>${alvos.length}</strong> ${veT('clipes selecionados')} · ${veT('ganho do principal')}: <strong>${veFmtDb(c.g)}</strong>`
          + (fora ? `<br><small>${fora} ${veT('sem som ou travados ficam de fora')}</small>` : '')
        : `Ganho atual do clipe: <strong>${veFmtDb(c.g)}</strong>`;
    const inp = $ve('ve-gain-input');
    inp.value = '';
    veGainLimMontar(c);
    $ve('ve-gain').hidden = false;
    requestAnimationFrame(() => { inp.focus({ preventScroll: true }); inp.select(); });
}

// Hard Limiter no painel do G (o mesmo efeito "Hard Limiter" dos Controles de efeito: editor-fx.js / editor-audio.js)
function veGainLimMontar(c) {
    veLimMontar($ve('ve-lim-on'), $ve('ve-lim-campos'), (c.afx || []).find(x => x.t === 'limiter') || null);
}

// Campos do Hard Limiter (painel do G e janela do Master): f = {on, v} ou null (desligado, valores padrão)
function veLimMontar(on, box, f) {
    const d = VE_AFX.limiter;
    const v = f ? veAfxValues(f) : Object.fromEntries(d.params.map(p => [p.k, p.def]));
    on.checked = !!f && f.on !== false;
    box.innerHTML = d.params.map(p => p.tipo === 'bool' ? `
        <label class="ve-lim-bool"><input type="checkbox" data-lk="${p.k}" ${v[p.k] ? 'checked' : ''}> ${veT(p.nome)}</label>` : `
        <div class="ve-lim-row">
            <span>${veT(p.nome)}</span>
            <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v[p.k]}" data-lk="${p.k}">
            <span class="ve-prop-num"><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" value="${veFxFmt(p, v[p.k])}" data-lk="${p.k}"><i>${p.un}</i></span>
        </div>`).join('');
    box.classList.toggle('off', !on.checked);
    on.onchange = () => box.classList.toggle('off', !on.checked);
    // slider e número andam juntos
    box.oninput = e => {
        const k = e.target.dataset.lk;
        if (!k || e.target.type === 'checkbox') return;
        box.querySelectorAll(`[data-lk="${k}"]`).forEach(x => { if (x !== e.target) x.value = e.target.value; });
    };
}

function veGainLimLer() { return veLimLer($ve('ve-lim-campos')); }
function veLimLer(box) {
    const v = {};
    VE_AFX.limiter.params.forEach(p => {
        const el = box.querySelector(`[data-lk="${p.k}"]`);
        if (p.tipo === 'bool') v[p.k] = el && el.checked ? 1 : 0;
        else { const n = parseFloat(String(el && el.value).replace(',', '.')); v[p.k] = isFinite(n) ? Math.min(Math.max(n, p.min), p.max) : p.def; }
    });
    return v;
}

function veCloseGain() {
    $ve('ve-gain').hidden = true;
    $ve('ve-gain-input').blur();   // devolve o teclado para o editor (senão G/Enter iriam para o campo escondido)
}

function veApplyGain() {
    const raw = String($ve('ve-gain-input').value).replace(',', '.').trim();
    const d = parseFloat(raw), temDelta = !!raw && isFinite(d);
    const alvos = (VE._gainAlvos || []).filter(c => VE.clips.includes(c));
    VE._gainAlvos = null;
    if (!alvos.length) { veCloseGain(); return; }
    // Hard Limiter: liga/atualiza o efeito em cada clipe, ou desliga (fica nos Controles de efeito, com os valores)
    const limOn = $ve('ve-lim-on').checked, lv = veGainLimLer();
    veCloseGain();
    const plano = alvos.map(c => {
        const novo = temDelta ? Math.min(Math.max(Math.round(((c.g || 0) + d) * 10) / 10, VE_GAIN_MIN), VE_GAIN_MAX) : (c.g || 0);
        const f = (c.afx || []).find(x => x.t === 'limiter');
        const limMudou = limOn ? (!f || f.on === false || VE_AFX.limiter.params.some(p => veAfxValues(f)[p.k] !== lv[p.k]))
            : !!(f && f.on !== false);
        return { c, novo, f, limMudou, ganhoMudou: novo !== (c.g || 0) };
    });
    if (!plano.some(x => x.ganhoMudou || x.limMudou)) return;
    vePushHistory();
    plano.forEach(({ c, novo, f, limMudou }) => {
        c.g = novo;
        if (!limMudou) return;
        // arrays novos: clipes cortados do mesmo original podem dividir o mesmo array de efeitos
        if (limOn && f) c.afx = c.afx.map(x => x === f ? { ...x, on: true, v: { ...lv } } : x);
        else if (limOn) c.afx = [...(c.afx || []), { id: veFxNewId(), t: 'limiter', on: true, v: { ...lv } }];
        else c.afx = c.afx.map(x => x === f ? { ...x, on: false } : x);
    });
    veApplyAudioGain();
    veRefresh();
    if (typeof veRenderFxControls === 'function') veRenderFxControls();
    if (veMixAtivo()) veAudioEditou();
    const n = alvos.length, partes = [];
    if (plano.some(x => x.ganhoMudou)) {
        partes.push(n > 1 ? `${veT('Ganho')} ${d > 0 ? '+' : ''}${veRound(d, 1)} dB ${veT('em')} ${n} ${veT('clipes')}` : `Ganho do clipe: ${veFmtDb(plano[0].novo)}`);
    }
    if (plano.some(x => x.limMudou)) {
        partes.push((limOn ? `Hard Limiter em ${veFmtDb(lv.ceil)}` : 'Hard Limiter desligado') + (n > 1 ? ` (${n} ${veT('clipes')})` : ''));
    }
    veToast(partes.join(' · '));
}

// Prévia: Web Audio permite aumentar acima de 100%; sem ele, só dá para abaixar (volume do player)
const VEA = { ctx: null, gain: null, falhou: false };
function veApplyAudioGain() {
    const v = veVideo();
    const c = VE.clips[VE.cur];
    v.muted = VE.muted || (!!c && (veTrkMuted(c.tr) || c.x === 'v'));   // M do cabeçalho da trilha de áudio
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
function vePathNome(path, fallback = 'Mídia offline') {
    return path ? String(path).split(/[\\/]/).pop() : fallback;
}
function veMediaOffline(m) { return !!(m && (m.offline || m.missing || m.lost)); }
function veOfflineMedias() { return (VE.media || []).filter(m => m && !m.removido && !m._rvGerando && veMediaOffline(m)); }
function veProjetoSeqs(d) {
    return Array.isArray(d && d.sequences) && d.sequences.length ? d.sequences : [{
        clips: (d && d.clips) || [],
        w: d && d.w,
        h: d && d.h,
        playhead: d && d.playhead,
        view: d && d.view,
    }];
}
function veProjetoMidiaDur(d, mid = 0) {
    return veProjetoSeqs(d).reduce((dur, s) => Math.max(dur, ...((s.clips || [])
        .filter(c => (c.m || 0) === mid)
        .map(c => +c.e || 0))), 0);
}
function veProjetoQuadro(d) {
    const seq = veProjetoSeqs(d).find(s => s && s.w > 0 && s.h > 0) || {};
    return { w: seq.w || 1920, h: seq.h || 1080 };
}

// ── vários vídeos por projeto (como no Premiere): cada clipe aponta para a mídia dele (c.m; 0 = o vídeo aberto,
// que também define o tamanho e o qps da sequência). Cada vídeo tem prévia, miniaturas, forma de onda e áudio
// conformado próprios (preparados pelo painel Projeto: veOnMidia) ──
const veMid = c => (c && c.m) || 0;
function veDurMidia(c) {
    const m = veMediaOf(c);
    if (!m || m.id === 0) return VE.srcDur;
    return m.dur || (m.info && m.info.duration) || 0;
}
function veTemSom(c) {
    const m = veMediaOf(c);
    if (!m || veMediaOffline(m) || c.x === 'v') return false;              // vídeo cujo áudio foi separado
    if (m.kind === 'audio') return true;
    if (m.kind !== 'video') return false;
    return m.id === 0 ? !!(VE.info && VE.info.has_audio) : !!(m.info && m.info.has_audio);
}
// Põe no player o vídeo da mídia. Cada player usa a URL com uma marca própria (tag): com a mesma URL o WebView
// divide o carregamento entre eles. Devolve true se trocou de arquivo.
function veDeckCarregar(x, mid, tag) {
    if (x._mid === mid && x.getAttribute('src')) return false;
    const m = VE.media[mid], url = m && m.url;
    if (!url) return false;
    x._mid = mid;
    x.crossOrigin = 'anonymous';   // quadro legível no WebGL (Luz e Cor, Básico 3D) mesmo sem o vídeo principal
    x.src = !tag || url.startsWith('blob:') ? url : url + (url.includes('?') ? '&' : '?') + 'camada=' + tag;
    x.load();
    return true;
}
const veDeckTag = x => (x === VEDK.b ? 'b' : null);
// Clipe sem vídeo da fonte (sem som, duração livre): imagem, texto (editor-props.js) ou camada de ajuste
function veIsImage(c) { const m = veMediaOf(c); return !!m && (m.kind === 'image' || m.kind === 'ajuste' || m.kind === 'texto'); }
// Camada de ajuste (como no Premiere): clipe transparente cujos efeitos valem para tudo o que está nas trilhas de
// baixo durante o trecho dele; a opacidade dosa a força do efeito. Sem escala/posição/rotação.
function veIsAdj(c) { const m = veMediaOf(c); return !!m && m.kind === 'ajuste'; }
function veNomeClipe(c) { return veIsAudio(c) ? 'Áudio' : veIsAdj(c) ? 'Ajuste' : veIsTexto(c) ? 'Texto' : veIsImage(c) ? 'Imagem' : 'Clipe'; }
// Áudio solto na timeline (MP3, WAV...): só a linha A da trilha, sem imagem.
// c.x = 'a': só o áudio de um vídeo (separado da imagem); c.x = 'v': só a imagem de um vídeo (sem som).
function veIsAudio(c) { const m = veMediaOf(c); return !!m && (m.kind === 'audio' || c.x === 'a'); }
// O que cada clipe ocupa: vídeo = V e A (vinculados); imagem/ajuste = só V; áudio solto = só A.
// Sobrescrever, aparar e mover só esbarram em clipes que dividem a mesma linha.
const veOcupaV = c => !veIsAudio(c);
// Vídeo que sabidamente não tem som (ex.: .mov de animação com transparência): só a linha V, como no Premiere.
// Sem os dados ainda ou offline, continua ocupando as duas.
function veSemSom(c) {
    const m = veMediaOf(c);
    if (!m || m.kind !== 'video' || veMediaOffline(m)) return false;
    const info = m.id === 0 ? VE.info : m.info;
    return !!info && !info.offline && info.has_audio === false;
}
const veOcupaA = c => !veIsImage(c) && c.x !== 'v' && !veSemSom(c);
const veConflita = (a, b) => (veOcupaV(a) && veOcupaV(b)) || (veOcupaA(a) && veOcupaA(b));

function veDefProps(c) {
    const m = veMediaOf(c);
    let sc = 100;
    // imagem maior que o quadro entra ajustada para caber (como "ajustar ao quadro" do Premiere)
    if (m && m.kind === 'image' && m.w) sc = veRound(Math.min(100, 100 * Math.min(VE.seqW / m.w, VE.seqH / m.h)));
    // vídeo com outro tamanho que o quadro (outro vídeo, ou a sequência mudada nas Configurações da sequência):
    // ajustado ao quadro (como "Definir para o tamanho do quadro" do Premiere)
    if (m && m.kind === 'video') { const sz = veMediaSize(c); sc = veRound(100 * Math.min(VE.seqW / sz.w, VE.seqH / sz.h), 2); }
    return { sc, x: VE.seqW / 2, y: VE.seqH / 2, rot: 0, op: 100 };
}
function veStaticProps(c) { return Object.assign(veDefProps(c), c.p || {}); }

// Valor das propriedades no instante T da sequência (quadros-chave, se houver, mandam)
function veProps(c, T = VE.playhead) {
    const p = veStaticProps(c);
    if (c.k) {
        const tl = veSrcAt(c, T);
        VE_KF_PROPS.forEach(k => { const ks = c.k[k]; if (ks && ks.length) p[k] = veKfValue(ks, tl); });
        if (c.k.sx && c.k.sx.length) p.sx = veKfValue(c.k.sx, tl);   // escala só na horizontal (transição Dobrar)
        if (c.k.sy && c.k.sy.length) p.sy = veKfValue(c.k.sy, tl);   // escala só na vertical (transição Dobrar)
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
function veHasKf(c) { return !!c && (VE_KF_PROPS.some(k => veKfOn(c, k)) || veKfOn(c, 'sx') || veKfOn(c, 'sy')); }

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
    const p = veProps(c), near = (a, b) => Math.abs(a - b) < 0.05, sz = veMediaSize(c);
    return near(p.sc, 100) && near(p.x, VE.seqW / 2) && near(p.y, VE.seqH / 2) && near(p.rot % 360, 0) && p.op >= 99.95 &&
        (p.ax == null || near(p.ax, sz.w / 2)) && (p.ay == null || near(p.ay, sz.h / 2));
}

function veMediaSize(c) {
    const m = veMediaOf(c);
    if (m && m.kind === 'image') return { w: m.w || 1, h: m.h || 1 };
    if (m && m.kind === 'texto') return veTxTamanho(c);
    if (m && m.kind === 'video' && m.id && m.info && m.info.width) return { w: m.info.width, h: m.info.height };
    // ainda na fila de preparação: o tamanho que já se sabe (ex.: da análise do AutoFrame), não o da sequência
    if (m && m.kind === 'video' && m.id && m.w && m.h) return { w: m.w, h: m.h };
    // o vídeo aberto: o tamanho dele (a sequência pode ter outro, nas Configurações da sequência)
    if (m && m.kind === 'video' && !m.id && VE.info && VE.info.width && !VE.info.audio_only) return { w: VE.info.width, h: VE.info.height };
    return { w: VE.seqW, h: VE.seqH };
}

// ── adicionar imagem ──
function vePickImage() {
    if (!VE.ready) return;
    window.pywebview.api.select_image('video-cutter').then(r => { if (r && r.success) veAddImage(r.path); });
}

// Arquivos soltos no editor: sem projeto abre o vídeo; com projeto, imagens viram camadas
const VE_EXT_IMG = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
function veDropAtual() { return VE._drop && Date.now() - VE._drop.at < 5000 ? VE._drop : null; }

function veGuardarDrop(e) {
    if (!e) return;
    VE._drop = { x: e.clientX, y: e.clientY, at: Date.now(), doc: e.target && e.target.ownerDocument || document };
}

function veDropFiles(itens) {
    const proj = itens.find(i => !i.pasta && /\.vcnvt$/i.test(i.path));
    if (proj) { veOpenProject(proj.path); return; }
    const drop = veDropAtual();
    // no painel AutoFrame: pastas/fotos/vídeos/música vão para ele (editor-autoframe.js)
    if (typeof veAfSoltouAqui === 'function' && veAfSoltouAqui(drop)) { veAfAdicionar(itens); return; }
    const noPainel = VE.ready ? vePjSoltouAqui(drop) : null;
    if (noPainel) { vePjImportar(itens, noPainel.pasta); return; }
    if (VE.ready) {
        // pastas e legendas entram no painel Projeto; vídeos/áudios/imagens soltos entram direto na timeline.
        const soProjeto = itens.filter(i => i.pasta || VE_EXT_LEG.test(i.path));
        if (soProjeto.length) { vePjImportar(soProjeto, null); itens = itens.filter(i => !soProjeto.includes(i)); if (!itens.length) return; }
    }
    const videos = itens.filter(i => !i.pasta && (EXT_VIDEO.test(i.path) || EXT_AUDIO.test(i.path)));
    const imgs = itens.filter(i => !i.pasta && VE_EXT_IMG.test(i.path));
    if (!VE.ready) {
        // sem nada aberto: vídeo/áudio abre como sempre; imagem começa a timeline com ela (5 s)
        if (videos.length) veOpenPath(videos[0].path);
        else if (imgs.length) { VE._imgsIni = imgs.slice(1).map(i => i.path); veOpenPath(imgs[0].path); }
        else veToast('Solte um arquivo de vídeo, áudio ou imagem');
        return;
    }
    const vids = videos.filter(i => EXT_VIDEO.test(i.path));
    if (vids.length) {
        veAddVideosSequenciais(vids.map(it => it.path), drop);
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
    veToast('Arraste vídeos, áudios ou imagens para a timeline');
}

function veTimelineDropPoint(drop) {
    const wrapEl = $ve('ve-tl-wrap'), wrap = wrapEl.getBoundingClientRect();
    const mesmoDoc = !drop || !drop.doc || drop.doc === wrapEl.ownerDocument;
    const naTl = mesmoDoc && drop && drop.x >= wrap.left && drop.x <= wrap.right && drop.y >= wrap.top + VE_RULER && drop.y <= wrap.bottom;
    const t = Number.isFinite(drop && drop.t) ? drop.t : naTl ? Math.max(0, VE.view + (drop.x - wrap.left) / VE.pps) : VE.playhead;
    const row = Number.isFinite(drop && drop.tr) ? { kind: drop.rowKind || 'v', _tr: drop.tr } : naTl ? veRowAt(drop.y - wrap.top) : null;
    const tr = Number.isFinite(drop && drop.tr) ? drop.tr : row && row.kind !== 'l' ? veTrackIndex(row) : 0;
    return { t, tr, row, naTl };
}

function veVideoMidia(path, pasta) {
    let m = VE.media.find(x => x.kind === 'video' && x.path === path && !x.removido);
    if (!m) {
        const nome = path.split(/[\\/]/).pop();
        m = vePjAddMidia({ kind: 'video', path, name: nome }, pasta !== undefined ? pasta : (typeof vePjDestino === 'function' ? vePjDestino() : null));
    }
    return m;
}

function veVideoPrepararSePrecisa(m) {
    if (!m || m.erro) return;
    if (m.info) { if (!m.url) veMidiaPriorizar(m); return; }
    const emFila = typeof VEPJF !== 'undefined' && (VEPJF.ativos.has(m.id) || VEPJF.fila.includes(m.id));
    if (emFila) veMidiaPriorizar(m);
    else veMidiaPreparar(m, true);
}

function veAddVideosSequenciais(paths, drop = veDropAtual()) {
    if (!VE.ready || !paths || !paths.length) return;
    const q = { ids: [], drop, nextT: null, tr: null, running: false };
    paths.forEach(path => {
        const m = veVideoMidia(path);
        q.ids.push(m.id);
        m._insertQueue = q;
        veVideoPrepararSePrecisa(m);
    });
    vePjRender();
    veVideoQueueTick(q);
    if (q.ids.length) veToast(q.ids.length === 1 ? 'Preparando vídeo para colocar na timeline...' : `Preparando ${q.ids.length} vídeos para colocar na timeline...`);
}

function veVideoQueueTick(q) {
    if (!q || q.running) return;
    q.running = true;
    try {
        while (q.ids.length) {
            const m = VE.media[q.ids[0]];
            const dur = m && (m.info && m.info.duration || m.dur);
            if (!m || m.removido) { q.ids.shift(); continue; }
            if (!dur) { m._insertQueue = q; break; }
            q.ids.shift();
            delete m._insertQueue;
            if (q.nextT == null) {
                const p = veTimelineDropPoint(q.drop);
                q.nextT = p.t;
                q.tr = p.tr;
            }
            const st = veSnapFrame(q.nextT);
            vePjColocar([m.id], { ...(q.drop || {}), t: st, tr: q.tr, rowKind: 'v' });
            q.nextT = st + dur;
        }
    } finally {
        q.running = false;
    }
}

function veAddImage(path, deslocamento = 0) {
    if (!VE.ready) return;
    const drop = veDropAtual();
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

function veAddVideo(path, drop = veDropAtual()) {
    if (!VE.ready || !path) return null;
    let m = VE.media.find(x => x.kind === 'video' && x.path === path && !x.removido);
    const colocar = () => vePjColocar([m.id], drop);
    if (m && m.info && m.info.duration) { colocar(); return m; }
    if (!m) m = veVideoMidia(path);
    m._insertDrop = drop;
    m._insertPending = true;
    veVideoPrepararSePrecisa(m);
    vePjRender();
    veToast('Preparando vídeo para colocar na timeline...');
    return m;
}

// Timeline aberta por uma imagem: ela entra em V1 no zero com 5 s (as outras soltas junto vêm em seguida)
function veIniciarComImagem() {
    const extras = VE._imgsIni || [];
    VE._imgsIni = null;
    window.pywebview.api.video_cutter_add_media(VE.path).then(r => {
        if (!r || !r.success) { veToast((r && r.error) || 'Não foi possível abrir a imagem'); return; }
        const m = { id: VE.media.length, kind: 'image', path: r.path, url: r.url, name: r.name, img: new Image(), w: 0, h: 0 };
        VE.media.push(m);
        m.img.crossOrigin = 'anonymous';
        m.img.onload = () => {
            m.w = m.img.naturalWidth; m.h = m.img.naturalHeight;
            const clip = { tr: 0, st: 0, s: 0, e: VE_IMG_DUR, m: m.id };
            clip.p = veDefProps(clip);
            VE.clips = [clip];
            VE.sel = -1;
            veRelayout();
            VE.history = [];
            veUpdateUndo();
            veZoomFit();
            veAfterEdit(0);
            if (typeof vePjRender === 'function') vePjRender();
            extras.forEach((p, k) => veAddImage(p, VE_IMG_DUR * (k + 1)));
        };
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
        let tr = veTrackIndexes().find(k => k > ultima && livre(k));
        if (tr == null) tr = veTrackIndexes().find(livre);
        if (tr == null) { tr = Math.max(0, ultima + 1, veTrackCount()); veEnsureTrackIndex(tr); }
        if (!livre(tr)) { veToast('Não há trilha de áudio livre a partir da agulha'); return; }
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
        if (o.st < a && a - o.st > tiny) out.push(veSemTout({ ...o, e: veSrcAt(o, a) }));
        if (en > b && en - b > tiny) out.push(veSemTin({ ...o, st: b, s: veSrcAt(o, b) }));
    });
    return out;
}

function veTrackFree(tr, a, b, novo) {
    return !VE.clips.some(o => o.tr === tr && o.st < b - VE_EPS && veEnd(o) > a + VE_EPS && (!novo || veConflita(o, novo)));
}

function veInsertImageClip(m, drop, deslocamento, rotulo = 'Imagem adicionada', abrirPainel = true) {
    let st = VE.playhead, tr = -1;
    const wrapEl = $ve('ve-tl-wrap'), wrap = wrapEl.getBoundingClientRect();
    const mesmoDoc = !drop || !drop.doc || drop.doc === wrapEl.ownerDocument;
    if (drop && mesmoDoc && drop.x >= wrap.left && drop.x <= wrap.right && drop.y >= wrap.top + VE_RULER && drop.y <= wrap.bottom) {
        st = Math.max(0, VE.view + (drop.x - wrap.left) / VE.pps);
        const row = veRowAt(drop.y - wrap.top);
        if (row && row.kind !== 'l') tr = veTrackIndex(row);
    }
    st = veSnapFrame(st + deslocamento);
    const b = st + VE_IMG_DUR;
    if (tr < 0) {
        // primeira trilha livre acima do vídeo; se todas ocupadas, cria a próxima
        tr = veTrackIndexes().filter(k => k > 0).find(k => !veTrkLocked(k) && veTrackFree(k, st, b, { m: m.id }));
        if (tr == null) { tr = Math.max(1, veTrackCount()); veEnsureTrackIndex(tr); }
    }
    veEnsureTrackIndex(tr);
    if (veTrkLocked(tr)) { veAvisoBloqueio(); return; }
    vePushHistory();
    const clip = { tr, st, s: 0, e: VE_IMG_DUR, m: m.id };
    clip.p = veDefProps(clip);
    VE.clips = veCarve(VE.clips, tr, st, b, -1, clip);
    VE.clips.push(clip);
    VE.sel = VE.clips.indexOf(clip);
    veRelayout();
    veAfterEdit(VE.playhead);
    if (abrirPainel) veTab('props');
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
        ${veIsImage(c) ? '' : `<button class="ve-ctx-item" data-ctx="inv">${veInvertido(c) ? '✓ ' : ''}Inverter clipe (Reverse Speed)</button>`}
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
            const alvos = alvo && veSelLista().includes(alvo) ? veSelLista() : [alvo];
            if (alvo && alvos.some(o => (o.cor || '') !== cor.dataset.cor)) {
                vePushHistory();
                alvos.forEach(o => { if (cor.dataset.cor) o.cor = cor.dataset.cor; else delete o.cor; });
                veRefresh();
            }
        } else if (it) {
            VE.sel = i;
            if (it.dataset.ctx === 'gain') veOpenGain();
            else if (it.dataset.ctx === 'fx') veTab('props');
            else if (it.dataset.ctx === 'pp') { vedShow('pp'); veRefresh(); }
            else if (it.dataset.ctx === 'del') veDeleteClip(i);
            else if (it.dataset.ctx === 'inv') veInverterClipes();
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

function veExtraPlayer(n, mid = 0) {
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
    const x = VEX[n];
    veDeckCarregar(x, mid, String(n + 1));
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
    if (Math.abs(alvo - c.e) < 0.03 && veMid(n) === veMid(c)) return;   // continua do mesmo ponto: o player atual segue
    const r = veReserva();
    if (VEDK.i !== j || Math.abs(VEDK.t - alvo) > 0.02) {
        veDeckCarregar(r, veMid(n), veDeckTag(r));   // o arquivo do próximo clipe
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
function veParkExtras(n, limpar, soCamadas) {
    // soCamadas: não mexe nos players fixos das transições (VE_TR_PL0 em diante)
    (soCamadas ? VEX.slice(n, VE_TR_PL0) : VEX.slice(n)).forEach(x => {
        if (!x.paused) x.pause();
        if (limpar && x.getAttribute('src')) { x.removeAttribute('src'); x._mid = null; x.load(); }
    });
    if (!soCamadas && typeof VETRP !== 'undefined') VETRP.slot.clear();
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
    const res = VEM.res || 1;   // Full / 1/2 (barra do Programa): 1/2 = um quarto dos pixels para compor
    const cap = Math.min(1, 1920 / Math.max(VE.seqW, VE.seqH));
    const scr = $ve('ve-screen');
    if (!scr || !scr.clientWidth) return cap * res;
    const dpr = scr.ownerDocument.defaultView.devicePixelRatio || 1;
    const tela = veFitScale() * VEM.mz * dpr;
    return Math.min(cap, Math.max(0.125, Math.ceil(tela * 8) / 8)) * res;
}

function veRulerNiceStep(minPx) {
    const min = Math.max(1, minPx || 1);
    const pow = Math.pow(10, Math.floor(Math.log10(min)));
    return [1, 2, 5, 10].map(n => n * pow).find(n => n >= min) || 10 * pow;
}

// Réguas nas bordas do painel Programa (como no Photoshop): cobrem toda a borda, marcam em pixels do quadro
// (negativo / além do tamanho = fora do quadro) e destacam o trecho onde o quadro está. O mesmo canvas cobre o
// palco inteiro e desenha as guias (editor-guias.js). Só redesenha quando algo muda (não a cada quadro do play).
const VE_RULER_TOP = 18, VE_RULER_LEFT = 26;
function veRulersDraw() {
    const ov = $ve('ve-rulers'), scr = $ve('ve-screen'), stage = $ve('ve-stage');
    if (!ov || !scr || !stage) return;
    const w = stage.clientWidth || 0, h = stage.clientHeight || 0;
    const dpr = scr.ownerDocument.defaultView.devicePixelRatio || 1;
    const g = typeof veGuiasGeo === 'function' ? veGuiasGeo() : null;
    const temGuias = typeof VEG !== 'undefined' && (VEG.drag || VEG.snapLinhas || (VEG.show && veGuias().length));
    const chave = [w, h, dpr, VEM.rulers, g && [g.k, g.x0, g.y0, g.sr.w, g.sr.h].join(), typeof VEG !== 'undefined' ? VEG._rev : 0, temGuias].join('|');
    if (chave === ov._chave) return;
    ov._chave = chave;
    const bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
    if (ov.width !== bw || ov.height !== bh) { ov.width = bw; ov.height = bh; }
    const ctx = ov.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!w || !h) return;
    if (g && temGuias) veGuiasDesenhar(ctx, g, w, h);
    if (!VEM.rulers) return;
    const topH = VE_RULER_TOP, leftW = VE_RULER_LEFT;

    ctx.save();
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, w, topH);
    ctx.fillRect(0, 0, leftW, h);
    if (g) {
        const { k, x0, y0 } = g;
        const fw = VE.seqW * k, fh = VE.seqH * k;
        // trecho do quadro
        ctx.fillStyle = '#242424';
        const fx1 = Math.max(leftW, x0), fx2 = Math.min(w, x0 + fw);
        const fy1 = Math.max(topH, y0), fy2 = Math.min(h, y0 + fh);
        if (fx2 > fx1) ctx.fillRect(fx1, 0, fx2 - fx1, topH);
        if (fy2 > fy1) ctx.fillRect(0, fy1, leftW, fy2 - fy1);

        ctx.font = '10px Cascadia Mono, Consolas, monospace';
        ctx.textBaseline = 'top';
        const majorX = veRulerNiceStep(80 / k), minorX = majorX / 5;
        const majorY = veRulerNiceStep(60 / k), minorY = majorY / 5;
        const pxIni = Math.floor((leftW - x0) / k / minorX) * minorX, pxFim = (w - x0) / k;
        const pyIni = Math.floor((topH - y0) / k / minorY) * minorY, pyFim = (h - y0) / k;
        const eMaior = (v, m) => Math.abs(v / m - Math.round(v / m)) < 1e-4;
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        for (let px = pxIni; px <= pxFim; px += minorX) {
            const x = Math.round(x0 + px * k) + 0.5;
            if (x < leftW) continue;
            ctx.moveTo(x, topH);
            ctx.lineTo(x, eMaior(px, majorX) ? 2 : topH - 5);
        }
        for (let py = pyIni; py <= pyFim; py += minorY) {
            const y = Math.round(y0 + py * k) + 0.5;
            if (y < topH) continue;
            ctx.moveTo(leftW, y);
            ctx.lineTo(eMaior(py, majorY) ? 2 : leftW - 5, y);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(235,235,235,0.72)';
        for (let px = Math.ceil(pxIni / majorX) * majorX; px <= pxFim; px += majorX) {
            const x = Math.round(x0 + px * k);
            if (x >= leftW) ctx.fillText(String(Math.round(px)), x + 3, 3);
        }
        ctx.save();
        ctx.rotate(-Math.PI / 2);
        for (let py = Math.ceil(pyIni / majorY) * majorY; py <= pyFim; py += majorY) {
            const y = Math.round(y0 + py * k);
            if (y >= topH) ctx.fillText(String(Math.round(py)), -y + 3, 3);
        }
        ctx.restore();
        veGuiasMarcasReguas(ctx, g, w, h, topH, leftW);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(leftW, topH - 1, w - leftW, 1);
    ctx.fillRect(leftW - 1, topH, 1, h - topH);
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, leftW, topH);
    ctx.restore();
}

function veToggleRulers(on) {
    VEM.rulers = typeof on === 'boolean' ? on : !VEM.rulers;
    veLsSet('ve.rulers', VEM.rulers ? '1' : '0');
    $ve('ve-stage').classList.toggle('rulers', VEM.rulers);
    $ve('ve-ruler-btn').classList.toggle('active', VEM.rulers);
    veApplyMonitor();
}

function veSetPreviewRes(r) {
    const res = Number(r) === 1 ? 1 : 0.5;
    const sel = $ve('ve-res-sel');
    if (sel) sel.value = String(res);
    if (res === VEM.res) return;
    VEM.res = res;
    veLsSet('ve.previewRes', String(res));
    veCacheClear(true);   // os quadros guardados estão na resolução antiga
    veDrawMonitorSoon();
}

function veDrawOfflineMedia(ctx, w, h, nome) {
    ctx.save();
    ctx.fillStyle = '#120809';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(248,113,113,0.55)';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.004);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, Math.max(1, w - ctx.lineWidth), Math.max(1, h - ctx.lineWidth));
    ctx.strokeStyle = 'rgba(248,113,113,0.22)';
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.002);
    for (let x = -h; x < w + h; x += Math.max(36, Math.min(w, h) * 0.08)) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fecaca';
    ctx.font = `800 ${Math.max(18, Math.min(64, w / 13))}px Segoe UI`;
    ctx.fillText(veT('MÍDIA OFFLINE'), w / 2, h / 2 - Math.max(12, h * 0.035), w * 0.82);
    ctx.fillStyle = 'rgba(254,202,202,0.76)';
    ctx.font = `600 ${Math.max(10, Math.min(24, w / 32))}px Segoe UI`;
    ctx.fillText(nome || veT('Relinque ou apague no painel Projeto'), w / 2, h / 2 + Math.max(16, h * 0.055), w * 0.82);
    ctx.restore();
}

function veDrawMonitor() {
    const cv = $ve('ve-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!VE.ready) { ctx.clearRect(0, 0, cv.width, cv.height); veRulersDraw(); return; }
    const pv = veMonitorScale();
    const cw = Math.round(VE.seqW * pv), ch = Math.round(VE.seqH * pv);
    // trecho renderizado em disco (editor-render.js): toca o arquivo em vez de compor. Perto do fim, se o
    // seguinte não estiver renderizado, as camadas voltam a acompanhar a agulha (abaixo) para não travar no corte.
    const pr = typeof vePrSegEm === 'function' ? vePrSegEm(VE.playhead) : null;
    if (!pr && typeof vePrForaDoTrecho === 'function') vePrForaDoTrecho();
    const prPerto = pr && VE.playing && pr.b - VE.playhead < 0.7 && !vePrSegEm(pr.b + 1e-4);
    if (pr && !prPerto && vePrDesenhar(pr, ctx, cv, pv, cw, ch)) { veParkExtras(0, false, true); return; }
    const cached = pr ? null : veCacheGet(cw, ch, pv);
    const cachedSrc = cached && (cached.bmp || cached.cv);
    const usarCache = () => {
        if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(cachedSrc, 0, 0, cw, ch);
        ctx.setTransform(pv, 0, 0, pv, 0, 0);
        veTfDesenhar(ctx, cv, pv);
        veRulersDraw();
    };
    // parado: o quadro guardado basta. Tocando, os players das camadas e das transições continuam
    // acompanhando a agulha (abaixo) — senão, no fim do trecho guardado, todos teriam de buscar de uma vez
    // e a imagem travava.
    if (cachedSrc && !VE.playing) { usarCache(); return; }
    const t = VE.playhead, v = veVideo();
    // transição na agulha (editor-trans.js): os clipes envolvidos vêm estendidos e animados;
    // o que entra fica por cima do que sai (mesma trilha: ordem de início)
    const temTr = VE.clips.some(c => c.tin || c.tout), virt = temTr ? veTransVirtuais() : null;
    const trPl = veTransPlayers(t, virt);   // cada clipe da transição com o mesmo player, preparado antes
    const trans = temTr && veTransAtiva(t);
    let vis = (trans ? virt : VE.clips)
        .map(c => ({ c, i: VE.clips.indexOf(c._o || c) }))
        .filter(({ c }) => !veIsAudio(c) && !veTrkHidden(c.tr) && t >= c.st - VE_EPS && t < veEnd(c) - VE_EPS)
        .sort((a, b) => a.c.tr - b.c.tr || a.c.st - b.c.st);
    // o que está abaixo de um vídeo que cobre o quadro inteiro não aparece: nem decodifica
    const cobre = vis.map(({ c }) => !veIsImage(c) && veIsPlain(c) && !c._tr && !veTemAlfa(c)).lastIndexOf(true);
    if (cobre > 0) vis = vis.slice(cobre);
    // parcial: alguma camada sem o quadro certo ainda (carregando/buscando) — desenha, mas não guarda no cache
    let extra = 0, falta = false, parcial = false;
    const itens = vis.map(({ c, i }) => {
        let src = null;
        const med = veMediaOf(c);
        if (veMediaOffline(med)) {
            src = 'offline';
        } else if (veIsAdj(c)) {
            src = 'ajuste';
        } else if (veIsTexto(c)) {
            // desenhado na resolução em que aparece; animação letra a letra (editor-txanim.js) enquanto roda
            const alvoTx = pv * veProps(c).sc / 100;
            src = (typeof veTxaCanvas === 'function' && veTxaCanvas(c, alvoTx)) || veTxCanvas(c, alvoTx).cv;
        } else if (veIsImage(c)) {
            const m = veMediaOf(c);
            if (m.img && m.img.complete && m.w) src = m.img;
        } else if (i === VE.cur && t >= VE.clips[i].st - VE_EPS && t < veEnd(VE.clips[i]) - VE_EPS) {
            // o player ativo (dá o som e o relógio); se ele estiver buscando, vale o quadro que a reserva
            // deixou esperando (vePreloadNext)
            const r = veReservaExiste();
            if (v.readyState >= 2 && !v.seeking) src = v;
            else if (r && VEDK.i === i && r.readyState >= 2 && !r.seeking) src = r;
            else falta = true;
        } else if (c._tr && trPl.get(c._o)) {
            // parte estendida de um clipe da transição: sem o quadro ainda, segura o último desenho (não pisca)
            const x = trPl.get(c._o);
            if (x.readyState >= 2 && !x.seeking) src = x; else falta = true;
        } else if (veMediaOf(c) && veMediaOf(c).url) {
            // vídeo de camada de baixo (transparência/dupla exposição): player extra sem som
            const x = veExtraPlayer(extra++, veMid(c));
            veSyncExtra(x, veSrcAt(c, t), veTaxa(c));
            if (x.readyState >= 2) src = x;
            if (x.readyState < 2 || x.seeking) parcial = true;
        }
        if (!src) parcial = true;
        return { c, i, src };
    });
    veParkExtras(extra, false, true);
    if (pr && vePrDesenhar(pr, ctx, cv, pv, cw, ch)) return;
    if (cachedSrc) { VE._monHold = 0; usarCache(); return; }
    // desenha em coordenadas do quadro
    const novo = cv.width !== cw || cv.height !== ch;
    // sem quadro do vídeo principal (buscando): mantém o último quadro na tela em vez de piscar preto
    // (no máximo 600 ms, para um vídeo com erro não congelar o monitor)
    if (falta && !novo) {
        const agora = performance.now();
        if (!VE._monHold) VE._monHold = agora;
        if (agora - VE._monHold < 600) { veRulersDraw(); return; }
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
            // texto animado vem com margem em volta (letras que saem da caixa): desenha maior, mesmo centro
            const pd = src && src._pad || 0, szd = pd ? { w: sz.w + 2 * pd, h: sz.h + 2 * pd } : sz;
            if (src !== 'offline') src = veFxRender(c, src, szd, pv * p.sc / 100);   // efeitos rodam antes do movimento (como no Premiere)
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, p.op / 100));
            const gco = src !== 'offline' && veBmGco(c);   // modo de mesclagem (Tela, Multiplicação...)
            if (gco) ctx.globalCompositeOperation = gco;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            const k = p.sc / 100;
            ctx.scale(k * (p.sx == null ? 1 : p.sx), k * (p.sy == null ? 1 : p.sy));
            const [ax, ay] = veAnc(c, p, sz);   // a Posição é onde fica o ponto de ancoragem
            if (src === 'offline') {
                ctx.translate(-ax, -ay);
                veDrawOfflineMedia(ctx, sz.w, sz.h, vePjNome(veMediaOf(c)));
            } else ctx.drawImage(src, -ax - pd, -ay - pd, szd.w, szd.h);
            ctx.restore();
        });
    veTxDesenhar(ctx);
    veCacheStore(cv, cw, ch, pv, itens, trans, falta || parcial);
    // caixa com alças e ponto de ancoragem do selecionado (editor-transform.js)
    veTfDesenhar(ctx, cv, pv);
    veRulersDraw();
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
    const bm = $ve('ve-bm');
    if (bm) {
        if (!bm.options.length) bm.innerHTML = VE_BM.map(([k, nome, , grupo]) =>
            (grupo ? '<option disabled>──────────</option>' : '') + `<option value="${k}">${veT(nome)}</option>`).join('');
        bm.closest('.ve-prop').hidden = aud || adj;
        bm.value = veBmAtivo(c) ? c.bm : 'normal';
    }
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
    veCpBarra();   // copiar/colar efeitos (editor-copiar.js)
    veLcRender();
}

// Modo de mesclagem pelo painel: vale para todos os clipes de imagem selecionados (como os efeitos)
function veBmMudar(v) {
    const c = VE.clips[VE.sel];
    if (!c) return;
    const lista = veFxAlvos(c).filter(x => !veLocked(x) && !veIsAudio(x) && !veIsAdj(x));
    if (!lista.length) { veAvisoBloqueio(); veRenderProps(); return; }
    vePushHistory();
    lista.forEach(x => { if (v && v !== 'normal' && VE_BM_MAPA[v]) x.bm = v; else delete x.bm; });
    veRefresh();
    veToast(`${veT('Modo de mesclagem')}: ${veT(VE_BM_MAPA[v] ? VE_BM_MAPA[v][1] : 'Normal')}` + (lista.length > 1 ? ` · ${lista.length} ${veT('clipes')}` : ''));
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
    veApplyProps(c, vePosParaCentro(c, veProps(c), VE.seqW / 2, VE.seqH / 2));
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

// Trecho que a exportação leva: entre a entrada (I) e a saída (O), como no Premiere; sem marcas, tudo
function veExportFaixa() {
    if (VE.inPt == null && VE.outPt == null) return null;
    const a = VE.inPt ?? 0, b = VE.outPt ?? VE.dur;
    return b - a >= veFrame() ? { a, b } : null;
}

// Clipes recortados ao trecho [a, b] e trazidos para o zero (os quadros-chave são em tempo da fonte: seguem valendo)
function veRecortarClips(clips, a, b) {
    return clips.filter(c => c.st < b - VE_EPS && veEnd(c) > a + VE_EPS).map(c => {
        const n = { ...c, _o: c._o || c };
        if (n.st < a) { n.s = veSrcAt(c, a); n.st = a; }
        if (veEnd(n) > b) n.e = veSrcAt(n, b);
        n.st -= a;
        return n;
    });
}

// emFaixa: só o trecho In→Out (a exportação); sem isso, a timeline inteira (ex.: a transcrição).
// faixa: outro trecho {a, b} (prévia renderizada, editor-render.js)
function veExportPlan(emFaixa, faixa) {
    // transições (editor-trans.js): o plano sai dos clipes estendidos e animados
    const orig = VE.clips, dur0 = VE.dur, f = faixa || (emFaixa ? veExportFaixa() : null);
    VE.clips = f ? veRecortarClips(veTransVirtuais(), f.a, f.b) : veTransVirtuais();
    if (f) VE.dur = f.b - f.a;
    try { return Object.assign(veExportPlanClips(), { dur: VE.dur, faixa: f }); } finally { VE.clips = orig; VE.dur = dur0; }
}

function veExportPlanClips() {
    // trilha oculta (olho) não entra; o som é o do clipe de vídeo de cima (como na prévia), mudo = silêncio
    const isVid = c => !veIsImage(c) && !veIsAudio(c) && !veTrkHidden(c.tr);
    // clipe com velocidade mudada vai como camada (no ffmpeg: setpts)
    const liso = c => !c._tr && veIsPlain(c) && veVel(c) === 1 && veMid(c) === 0 && !veTemAlfa(c);
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
            const png = veIsTexto(c) ? (VE._txPng && VE._txPng.get(c._o || c)) : null, f = png ? png.f : 1;
            // quadros-chave em tempo da camada (0 = início do clipe na timeline)
            const kf = {};
            VE_KF_PROPS.forEach(k => { if (veKfOn(c, k)) kf[k] = c.k[k].map(q => [(q.t - c.s) / veVel(c), k === 'sc' ? q.v / f : q.v, q.i || 'lin', veKfCurve(q)]); });
            if (veKfOn(c, 'sx')) kf.sx = c.k.sx.map(q => [(q.t - c.s) / veVel(c), q.v, q.i || 'lin', veKfCurve(q)]);
            if (veKfOn(c, 'sy')) kf.sy = c.k.sy.map(q => [(q.t - c.s) / veVel(c), q.v, q.i || 'lin', veKfCurve(q)]);
            const sz = png ? { w: png.w, h: png.h } : veMediaSize(c);
            // texto animado: lista de quadros (editor-txanim.js), recortada no trecho exportado
            const seq = png && png.seq ? png.seq : null, sq = seq ? Math.max(0, c.s - (c._o || c).s) : 0;
            return { tipo: veIsAdj(c) ? 'ajuste' : veIsImage(c) ? 'imagem' : 'video', path: png ? png.path : veIsImage(c) || veMid(c) ? m.path || null : null,
                     seq, st: c.st, s: seq ? sq : veIsImage(c) ? 0 : c.s, e: seq ? sq + veLen(c) : veIsImage(c) ? veLen(c) : c.e,
                     sc: p.sc / f, x: p.x, y: p.y, rot: p.rot, op: p.op, kf,
                     fx: veFxExport(c), mw: sz.w, mh: sz.h, v: veVel(c), bm: veBmAtivo(c) ? c.bm : null,
                     ox: (veMediaSize(c).w / 2 - veAnc(c, p)[0]) * f, oy: (veMediaSize(c).h / 2 - veAnc(c, p)[1]) * f };
        });
    // o arquivo de cada clipe com som (null = o vídeo aberto)
    const mix = veMixClipes().map(([st, s0, e0, g, id, v, tom, fi, fo, afx]) => [st, s0, e0, g, id ? VE.media[id].path : null, v, tom, fi, fo, afx]);
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
    veLegSelecionar(i);
    if (i >= 0 && e.button === 0) {
        VE.drag = { mode: 'leg', i, lado, x0: e.clientX, t0: t, c0: veLegClone(L[i]), active: false, alt: e.altKey && !lado, dupe: false };
        VETX.aba = 'leg';
        if (VED.el && VED.el.pp) vedShow('pp');
    }
    veRefresh();
}

function veLegArrastar(e, t) {
    const d = VE.drag, L = VE.legendas;
    if (!d || !L || !L[d.i]) return;
    if (!d.active) {
        if (Math.abs(e.clientX - d.x0) < 4) return;   // ainda é um clique
        d.active = true;
        vePushHistory();
        if ((d.alt || e.altKey) && !d.lado) {
            const novo = veLegClone(d.c0);
            L.splice(d.i + 1, 0, novo);
            d.i += 1;
            d.dupe = true;
            d.c0 = veLegClone(novo);
            veLegSelecionar(d.i);
        }
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
    if (!row || row.kind === 'l' || row.kind === 'k') return null;
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
    const img = veIsImage(c), limite = veDurMidia(c);
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

function veSeqName(seqId) {
    const seq = (VE.sequences || []).find(s => s.id === seqId);
    const m = typeof veSeqMedia === 'function' ? veSeqMedia(seqId) : null;
    return (m && (m.nome || m.name)) || (seq && seq.name) || 'Timeline';
}

function veSeqTabsRender() {
    const box = $ve('ve-seq-tabs');
    if (!box) return;
    if (!VE.ready || !(VE.sequences || []).length) { box.innerHTML = ''; return; }
    VE.openSequences = (VE.openSequences || []).filter(id => (VE.sequences || []).some(s => s.id === id));
    if (!VE.openSequences.includes(VE.activeSequence)) VE.openSequences.push(VE.activeSequence);
    box.innerHTML = VE.openSequences.map(id => `<div class="ve-seq-tab${id === VE.activeSequence ? ' active' : ''}" data-seq="${veEsc(id)}" title="${veEsc(veSeqName(id))}">
        <span>${veEsc(veSeqName(id))}</span><button data-fechar="${veEsc(id)}" title="Fechar aba">×</button></div>`).join('');
}

function veSeqTabClick(e) {
    const fechar = e.target.closest('[data-fechar]');
    if (fechar) {
        e.stopPropagation();
        veCloseTimelineTab(fechar.dataset.fechar);
        return;
    }
    const tab = e.target.closest('[data-seq]');
    if (tab) veOpenTimeline(tab.dataset.seq);
}

function veOpenTimelineTab(seqId) {
    if (!seqId) return;
    VE.openSequences = (VE.openSequences || []).filter(id => (VE.sequences || []).some(s => s.id === id));
    if (!VE.openSequences.includes(seqId)) VE.openSequences.push(seqId);
    veSeqTabsRender();
}

function veCloseTimelineTab(seqId) {
    if (!VE.ready || !seqId) return;
    if ((VE.openSequences || []).length <= 1) { veToast('A timeline ativa precisa ficar aberta'); return; }
    const i = VE.openSequences.indexOf(seqId);
    VE.openSequences = VE.openSequences.filter(id => id !== seqId);
    if (VE.activeSequence === seqId) {
        const prox = VE.openSequences[Math.min(i, VE.openSequences.length - 1)] || VE.openSequences[0];
        if (prox) veOpenTimeline(prox);
    } else veSeqTabsRender();
}

// Alterações não salvas: a primeira tentativa avisa; repetir em até 5 s confirma e descarta
function veConfirmDiscard() {
    if (!VE.ready || !VE.dirty || VE.quickEdit) return true;
    if (VE._discardAt && Date.now() - VE._discardAt < 5000) { VE._discardAt = 0; return true; }
    VE._discardAt = Date.now();
    veToast('Há alterações não salvas. Salve com Ctrl+S ou repita para descartar.');
    return false;
}

const VE_RECENTES_PROJETOS = 've-projetos-recentes';
function veRecentesProjetosLocal() {
    try {
        return JSON.parse(veLsGet(VE_RECENTES_PROJETOS) || '[]').filter(p => p && p.path);
    } catch (_) {
        return [];
    }
}
function veRecentesProjetosLimpos(lista) {
    return (Array.isArray(lista) ? lista : []).filter(p => p && p.path);
}
function veRecentesProjetosMesclar(...listas) {
    const porPath = new Map();
    listas.flatMap(veRecentesProjetosLimpos).forEach(p => {
        const chave = String(p.path || '').toLocaleLowerCase();
        const atual = porPath.get(chave);
        if (!chave || (atual && (+atual.atualizado || 0) > (+p.atualizado || 0))) return;
        porPath.set(chave, p);
    });
    return [...porPath.values()].sort((a, b) => (+b.atualizado || 0) - (+a.atualizado || 0)).slice(0, 8);
}
function veRecentesProjetos() {
    const prefs = typeof PREFS !== 'undefined' ? PREFS.projetosRecentes : null;
    return veRecentesProjetosLimpos(Array.isArray(prefs) ? prefs : veRecentesProjetosLocal());
}
function veSalvarRecentesProjetos(lista) {
    const limpos = veRecentesProjetosMesclar(lista);
    if (typeof PREFS !== 'undefined') PREFS.projetosRecentes = limpos;
    if (typeof prefsSave === 'function') prefsSave();
    veLsSet(VE_RECENTES_PROJETOS, JSON.stringify(limpos));
}
function veRecentesProjetosSincronizar() {
    if (typeof PREFS === 'undefined') return;
    const prefs = veRecentesProjetosLimpos(PREFS.projetosRecentes);
    const lista = veRecentesProjetosMesclar(prefs, veRecentesProjetosLocal());
    const mudou = JSON.stringify(lista) !== JSON.stringify(prefs);
    PREFS.projetosRecentes = lista;
    veLsSet(VE_RECENTES_PROJETOS, JSON.stringify(lista));
    if (mudou && typeof prefsSave === 'function') prefsSave();
    veOnboardingRender();
}
function veRegistrarProjetoRecente(path, dados) {
    if (!path) return;
    const nome = path.split(/[\\/]/).pop().replace(/\.vcnvt$/i, '');
    const atual = { path, nome, video: (dados && dados.video) || VE.path || '', atualizado: Date.now(), thumb: (VE.thumbs && VE.thumbs[0] && VE.thumbs[0].url) || '' };
    const chave = path.toLocaleLowerCase();
    veSalvarRecentesProjetos([atual, ...veRecentesProjetos().filter(p => String(p.path || '').toLocaleLowerCase() !== chave)]);
    veOnboardingRender();
}
function veRecentesProjetosLimpar() {
    veSalvarRecentesProjetos([]);
    veOnboardingRender(true);
}
window.addEventListener('prefs-carregadas', veRecentesProjetosSincronizar);
function veFmtRecente(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
}
// ── salvamento automático (a cada 3 min com mudanças; cópias em %APPDATA%/CaniveteDoPailer/autosave) ──
const VE_AUTOSAVE_MS = 3 * 60 * 1000;
function veAutosave(forcar) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_autosave || !VE.ready || !VE.dirty || VE.exportRunning || VE._pendingProject) return;
    if (!forcar && Date.now() - (VE._autoT || 0) < VE_AUTOSAVE_MS) return;
    let dados;
    try { dados = veProjectData(); } catch (e) { return; }
    const snap = JSON.stringify(dados.sequences || []) + JSON.stringify(dados.clips || []);
    VE._autoT = Date.now();
    if (snap === VE._autoSnap) return;   // nada mudou desde a última cópia
    VE._autoSnap = snap;
    dados._autosave = { origem: VE.projectPath || null, quando: new Date().toISOString() };
    const nome = (VE.projectPath || VE.path || 'projeto').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    api.ve_autosave(VE.projectPath || VE.path || '', nome, JSON.stringify(dados)).catch(() => {});
}
setInterval(() => veAutosave(false), 30 * 1000);

// Tela inicial: cópias automáticas para recuperar
function veAutosaveRender() {
    const sec = $ve('ve-start-auto'), box = $ve('ve-start-auto-lista'), api = window.pywebview && window.pywebview.api;
    if (!sec || !box || !api || !api.ve_autosave_lista) return;
    api.ve_autosave_lista().then(r => {
        const itens = (r && r.success && r.itens) || [];
        sec.hidden = !itens.length;
        box.innerHTML = itens.map((it, i) => `<button class="ve-start-auto-item" data-auto="${i}" title="${veEsc(it.origem || it.path)}">
            <svg class="i"><use href="#i-save"/></svg><b>${veEsc(it.nome)}</b><span>${veEsc(veFmtRecente(it.quando))}</span></button>`).join('');
        box.querySelectorAll('[data-auto]').forEach(b => b.addEventListener('click', () => { const it = itens[+b.dataset.auto]; if (it) veOpenProject(it.path); }));
    }).catch(() => {});
}

function veOnboardingRender() {
    const tela = $ve('ve-start'), box = $ve('ve-start-recentes');
    if (!tela || !box) return;
    const mostrar = !VE.startScreenDismissed && !VE.ready && !VE.path && !VE.exportRunning;
    tela.hidden = !mostrar;
    if (!mostrar) return;
    veAutosaveRender();
    const lista = veRecentesProjetos();
    if (!lista.length) {
        box.innerHTML = `<div class="ve-start-empty">${veT('Nenhum projeto recente ainda. Crie um projeto ou abra um .vcnvt para ele aparecer aqui.')}</div>`;
        return;
    }
    box.innerHTML = lista.map((p, i) => {
        const pasta = (p.path || '').split(/[\\/]/).slice(0, -1).join('\\');
        const capa = p.thumb ? `<img src="${veEsc(p.thumb)}" alt="" onerror="this.remove()">` : '<svg class="i"><use href="#i-film"/></svg>';
        return `<button class="ve-start-card" data-proj="${i}" title="${veEsc(p.path)}">
            <span class="ve-start-thumb" data-thumb="${i}">${capa}</span>
            <span class="ve-start-info"><b class="ve-start-name">${veEsc(p.nome || p.path.split(/[\\/]/).pop())}</b>
            <span class="ve-start-path">${veEsc(pasta)}</span><span class="ve-start-date">${veEsc(veFmtRecente(p.atualizado))}</span></span>
        </button>`;
    }).join('');
    box.querySelectorAll('[data-proj]').forEach(b => b.addEventListener('click', () => {
        const p = veRecentesProjetos()[+b.dataset.proj];
        if (p) veOpenProject(p.path);
    }));
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_project_thumb) return;
    lista.forEach((p, i) => {
        if (p.thumb) return;
        api.ve_project_thumb(p.path).then(r => {
            if (!r || !r.success || !r.url) return;
            const atuais = veRecentesProjetos(), item = atuais.find(x => x.path === p.path);
            if (item) { item.thumb = r.url; veSalvarRecentesProjetos(atuais); }
            const alvo = $ve('ve-start-recentes')?.querySelector(`[data-thumb="${i}"]`);
            if (alvo) alvo.innerHTML = `<img src="${veEsc(r.url)}" alt="">`;
        }).catch(() => {});
    });
}

function veProjectData() {
    veSeqSalvarAtiva();
    return {
        app: 'Canivete do Pailer',
        video: VE.path,
        media: VE.media.filter(m => m.id && !m.removido && ['image', 'ajuste', 'audio', 'texto', 'legenda', 'video', 'timeline'].includes(m.kind))
            .map(m => {
                const o = { id: m.id, kind: m.kind, name: m.name, pasta: m.pasta || null, cor: m.cor, nome: m.nome };
                if (m.kind === 'audio') Object.assign(o, { path: m.path, dur: m.dur });
                if (m.kind === 'image') Object.assign(o, { path: m.path, w: m.w, h: m.h });
                if (m.kind === 'legenda') Object.assign(o, { path: m.path, itens: m.itens });
                if (m.kind === 'video') o.path = m.path;
                if (m.kind === 'timeline') o.sequenceId = m.sequenceId;
                if (m.rvDe != null) Object.assign(o, { rvDe: m.rvDe, rvA: m.rvA, rvB: m.rvB });   // cópia invertida (editor-reverse.js)
                return o;
            }),
        // painel Projeto: pastas e a organização do vídeo principal
        bins: VE.bins || [],
        m0: VE.media[0] ? { pasta: VE.media[0].pasta || null, cor: VE.media[0].cor, nome: VE.media[0].nome } : null,
        sequences: vePlain(VE.sequences || [], []),
        activeSequence: VE.activeSequence,
        clips: VE.clips,
        trilhas: VE_TRK,
        texto: { palavras: VETX.palavras, idioma: VETX.idioma, chave: VETX.chave },
        legendas: VE.legendas || [], legEstilo: VE.legEstilo || null, legGravar: VE.legGravar !== false,
        inPt: VE.inPt,
        outPt: VE.outPt,
        markers: VE.markers || [],
        playhead: VE.playhead,
        view: { pps: VE.pps, x: VE.view },
        salvo_em: new Date().toISOString(),
    };
}

function veSaveProject(comoNovo) {
    if (!VE.ready) { veToast('Abra um vídeo antes de salvar'); return Promise.resolve(false); }
    const chaveAntiga = typeof vePrChave === 'function' ? vePrChave() : null;
    return window.pywebview.api.ve_project_save(VE.projectPath, JSON.stringify(veProjectData()), !!comoNovo).then(r => {
        if (!r || !r.success) { if (r && r.error) veToast('Não foi possível salvar: ' + r.error); return false; }
        VE.projectPath = r.path;
        if (typeof vePrProjetoSalvo === 'function') vePrProjetoSalvo(chaveAntiga);   // renders vão junto
        VE.dirty = false;
        VE.quickEdit = false;
        veRegistrarProjetoRecente(r.path, { video: VE.path });
        veUpdateTitle();
        veToast('Projeto salvo: ' + r.name);
        return true;
    });
}

function veResetEditorVazio(opts = {}) {
    const quickEdit = !!opts.quickEdit;
    const mostrarInicio = opts.mostrarInicio !== false;
    veStop();
    veDeckReset();
    veAudioReset();
    VE_TRK = veTrkNovo();
    VE.legendas = [];
    VE.legEstilo = null;
    VE.legGravar = true;
    veTxReset();
    const v = veVideo();
    v.pause();
    v.removeAttribute('src');
    v.load();
    veParkExtras(0, true);
    veCacheClear(true);
    Object.assign(VE, {
        path: null, info: null, dur: 0, srcDur: 0, clips: [], sel: -1, inPt: null, outPt: null, markers: [], guias: [], playhead: 0,
        cur: -1, history: [], future: [], thumbs: [], peaks: [], ready: false, dest: null, view: 0, media: [],
        sequences: [], activeSequence: null, openSequences: [], _seqN: 0, projectPath: null, dirty: false,
        quickEdit, quickEditPending: quickEdit, startScreenDismissed: !mostrarInicio, _pendingProject: null, bins: [],
    });
    veBuildHeads();
    VEPJ.sel.clear();
    veUpdateUndo();
    $ve('ve-empty').hidden = false;
    $ve('ve-loading').hidden = true;
    $ve('ve-proxy-badge').hidden = true;
    $ve('ve-export-btn').disabled = true;
    $ve('ve-meta').textContent = 'Nenhum vídeo aberto';
    $ve('ve-clips').innerHTML = '<div class="ve-clips-empty">Abra um vídeo ou áudio para começar.</div>';
    ['ve-sum-orig', 've-sum-final', 've-sum-cut'].forEach(id => { $ve(id).textContent = '—'; });
    veUpdateReadouts();
    veRenderProps();
    veUpdateTitle();
    veSeqTabsRender();
    veDrawMonitor();
    veDraw();
    veOnboardingRender();
}

// Fecha o projeto (aba do editor fechada): volta à tela "arraste um vídeo"
function veCloseProject() {
    veResetEditorVazio({ mostrarInicio: true });
}

function veOpenProject(path) {
    if (VE.exportRunning || !veConfirmDiscard()) return;
    window.pywebview.api.ve_project_open(path || null).then(r => {
        if (!r || !r.success) { if (r && r.error) veToast(r.error); return; }
        VE.quickEdit = false;
        VE.quickEditPending = false;
        VE.startScreenDismissed = true;
        const d = r.data;
        VE._pendingProject = { data: d, path: r.path, name: r.name, missing: r.missing || [] };
        VE.dirty = false;
        const faltaBase = !d.video || (r.missing || []).includes(d.video);
        if (faltaBase) veOpenLostProject();
        else veOpenPath(d.video);
    });
}

function veOpenLostProject() {
    const pend = VE._pendingProject;
    if (!pend) return;
    const { data: d, missing } = pend;
    veStop();
    veDeckReset();
    veAudioReset();
    VE_TRK = veTrkNovo();
    VE.legendas = [];
    VE.legEstilo = null;
    VE.legGravar = true;
    veTxReset();
    const v = veVideo();
    v.pause();
    v.removeAttribute('src');
    v.load();
    veParkExtras(0, true);
    veCacheClear(true);
    const q = veProjetoQuadro(d), dur = Math.max(veProjetoMidiaDur(d, 0), veSeqDur((veProjetoSeqs(d)[0] || {})), 1);
    const basePath = d.video || '';
    const baseName = vePathNome(basePath, 'Mídia principal offline');
    Object.assign(VE, {
        path: basePath || null,
        info: { duration: dur, fps: 30, width: q.w, height: q.h, has_audio: false, file_name: baseName, offline: true },
        dur: 0, srcDur: dur, fps: 30, clips: [], sel: -1, inPt: null, outPt: null, markers: [], guias: [], playhead: 0,
        cur: -1, history: [], future: [], thumbs: [], peaks: [], ready: true, dest: null, view: 0, media: [],
        sequences: [], activeSequence: null, openSequences: [], _seqN: 0,
    });
    VE.seqW = q.w;
    VE.seqH = q.h;
    VE.media = [{
        id: 0, kind: 'video', path: basePath, name: baseName, offline: !!basePath, missing: !!basePath,
        info: VE.info, dur, removido: !basePath,
    }];
    VEPJ.sel.clear();
    VEPJF.fila = [];
    veBuildHeads();
    veUpdateUndo();
    $ve('ve-empty').hidden = true;
    $ve('ve-loading').hidden = true;
    $ve('ve-proxy-badge').hidden = true;
    $ve('ve-export-btn').disabled = true;
    $ve('ve-meta').innerHTML = `<b>${veEsc(baseName)}</b> · ${veT('MÍDIA OFFLINE')}`;
    veApplyProject();
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
    // cópia do salvamento automático: Ctrl+S volta a salvar no projeto de origem (ou pergunta, se não havia)
    if (d._autosave) {
        VE.projectPath = d._autosave.origem || null;
        setTimeout(() => { VE.dirty = true; veUpdateTitle(); veToast(veT('Recuperado do salvamento automático: salve (Ctrl+S) para manter')); }, 400);
    }
    VE.quickEdit = false;
    const ids = { 0: 0 };
    const missingSet = new Set(missing || []);
    const mediaDur = new Map();
    veProjetoSeqs(d).forEach(s => (s.clips || []).forEach(c => {
        const mid = c.m || 0;
        mediaDur.set(mid, Math.max(mediaDur.get(mid) || 0, +c.e || 0));
    }));
    const estaFaltando = p => !p || missingSet.has(p);
    const q = veProjetoQuadro(d);
    (d.media || []).forEach(m => {
        const org = { pasta: m.pasta || null, cor: m.cor, nome: m.nome };
        if (m.kind === 'timeline') {
            const nm = { id: VE.media.length, kind: 'timeline', name: m.name || m.nome || 'Timeline', sequenceId: m.sequenceId, ...org };
            VE.media.push(nm);
            ids[m.id] = nm.id;
            return;
        }
        if (m.kind === 'legenda') {
            const nm = { id: VE.media.length, kind: m.kind, name: m.name, path: m.path, itens: m.itens, ...org };
            VE.media.push(nm);
            ids[m.id] = nm.id;
            return;
        }
        if (m.kind === 'video' || m.kind === 'video2') {
            const nm = { id: VE.media.length, kind: 'video', name: m.name, path: m.path, ...org };
            if (m.rvDe != null) Object.assign(nm, { rvDe: m.rvDe, rvA: m.rvA, rvB: m.rvB });
            VE.media.push(nm);
            ids[m.id] = nm.id;
            if (estaFaltando(m.path)) {
                const dur = mediaDur.get(m.id) || m.dur || 1;
                Object.assign(nm, {
                    offline: true, missing: true, dur,
                    info: { duration: dur, width: q.w, height: q.h, fps: VE.fps || 30, has_audio: false, offline: true },
                    name: m.name || vePathNome(m.path),
                });
            } else veMidiaPreparar(nm, mediaDur.has(m.id));   // os da timeline primeiro
            return;
        }
        if (m.kind === 'ajuste' || m.kind === 'texto') {
            const nm = { id: VE.media.length, kind: m.kind, name: m.name || (m.kind === 'texto' ? 'Texto' : 'Camada de ajuste'), ...org };
            VE.media.push(nm);
            ids[m.id] = nm.id;
            return;
        }
        if (m.kind === 'audio') {
            const nm = { id: VE.media.length, kind: 'audio', path: m.path, name: m.name, dur: m.dur || 0, peaks: [], ...org };
            if (m.rvDe != null) Object.assign(nm, { rvDe: m.rvDe, rvA: m.rvA, rvB: m.rvB });
            VE.media.push(nm);
            ids[m.id] = nm.id;
            if (estaFaltando(m.path)) {
                Object.assign(nm, { offline: true, missing: true, erro: 'Mídia offline' });
                return;
            }
            window.pywebview.api.video_cutter_add_audio(m.path).then(r => {
                if (!r || !r.success) return;
                Object.assign(nm, { dur: r.dur, peaks: r.peaks || [], url: r.url, quadros: r.quadros });
                veAudioRegistrar(nm.id, r.url, r.quadros);
                veDraw();
            });
            return;
        }
        const nm = { id: VE.media.length, kind: 'image', path: m.path, name: m.name, img: new Image(), w: m.w || 0, h: m.h || 0, ...org };
        VE.media.push(nm);
        ids[m.id] = nm.id;
        if (estaFaltando(m.path)) {
            Object.assign(nm, { offline: true, missing: true, erro: 'Mídia offline' });
            return;
        }
        window.pywebview.api.video_cutter_add_media(m.path).then(r => {
            if (!r || !r.success) return;
            nm.url = r.url;
            nm.img.crossOrigin = 'anonymous';
            nm.img.onload = () => { nm.w = nm.img.naturalWidth; nm.h = nm.img.naturalHeight; veDraw(); veDrawMonitor(); };
            nm.img.src = r.url;
        });
    });
    // cópias invertidas (editor-reverse.js): aponta para a original com o id novo; apagada do cache → gera de novo
    VE.media.forEach(nm => {
        if (!nm || nm.rvDe == null) return;
        nm.rvDe = ids[nm.rvDe];
        if (nm.rvDe == null) delete nm.rvDe;
        else if (nm.missing) veRvRestaurar(nm);
    });
    const mapClips = lista => (lista || [])
        .filter(c => !c.m || ids[c.m] != null)
        .map(c => {
            const n = { ...c };
            if (c.m) n.m = ids[c.m]; else { delete n.m; n.e = Math.min(n.e, VE.srcDur); }
            return n;
        })
        .filter(c => c.e - c.s > 1e-3);
    VE.bins = Array.isArray(d.bins) ? d.bins : [];
    if (d.m0 && VE.media[0]) Object.assign(VE.media[0], d.m0);
    const savedSeqs = Array.isArray(d.sequences) && d.sequences.length ? d.sequences : null;
    VE.sequences = (savedSeqs || [{
        id: d.activeSequence || 'seq_legacy',
        name: 'Timeline 1',
        clips: d.clips || [],
        trilhas: d.trilhas,
        texto: d.texto,
        legendas: d.legendas,
        legEstilo: d.legEstilo,
        legGravar: d.legGravar,
        inPt: d.inPt,
        outPt: d.outPt,
        markers: d.markers || [],
        playhead: d.playhead,
        view: d.view,
    }]).map((s, i) => {
        const clips = mapClips(s.clips);
        return {
            id: s.id || veSeqId(),
            name: s.name || `Timeline ${i + 1}`,
            clips,
            trilhas: veSeqTracks(s.trilhas, clips),
            texto: s.texto && Array.isArray(s.texto.palavras) ? { palavras: s.texto.palavras, idioma: s.texto.idioma || 'pt', chave: s.texto.chave || '' } : { palavras: [], idioma: 'pt', chave: '' },
            legendas: Array.isArray(s.legendas) ? s.legendas : [],
            legEstilo: s.legEstilo || null,
            legGravar: s.legGravar !== false,
            inPt: s.inPt ?? null,
            outPt: s.outPt ?? null,
            markers: Array.isArray(s.markers) ? s.markers : [],
            guias: Array.isArray(s.guias) ? s.guias.filter(g => g && (g.o === 'h' || g.o === 'v') && isFinite(g.p)) : [],
            playhead: s.playhead || 0,
            view: s.view || { pps: 0, x: 0 },
            w: s.w, h: s.h,
            master: s.master && s.master.lim ? s.master : null,
        };
    });
    VE.sequences.forEach(seq => {
        let m = veSeqMedia(seq.id);
        if (!m) m = veSeqCriarMidia(seq, null);
        m.sequenceId = seq.id;
        if (!m.nome && !m.name) m.name = seq.name;
    });
    VE.activeSequence = d.activeSequence && VE.sequences.find(s => s.id === d.activeSequence) ? d.activeSequence : VE.sequences[0].id;
    VE.openSequences = [VE.activeSequence];
    veSeqAplicar(VE.sequences.find(s => s.id === VE.activeSequence), { silent: true });
    VE.dirty = false;
    veUpdateTitle();
    veRegistrarProjetoRecente(path, d);
    const faltam = (missing || []).length;
    veToast(faltam ? `Projeto aberto — ${faltam} mídia(s) offline`
                   : 'Projeto aberto: ' + name.replace(/\.vcnvt$/i, ''));
}

// ─────────────────────────── visão / zoom ───────────────────────────

function veCanvasWidth() { return $ve('ve-tl-wrap').clientWidth || 800; }
function veCanvasHeight() { return $ve('ve-tl-wrap').clientHeight || 200; }
function veFitPps() { return (veCanvasWidth() - 16) / Math.max(veFrame(), veNavDur()); }
// Zoom mínimo: dá para afastar além da sequência (até 4x a duração, no mínimo 5 min na tela), com espaço
// livre depois do fim para organizar os clipes
function veMinPps() { return Math.min(veFitPps(), (veCanvasWidth() - 16) / Math.max(veNavDur() * 4, 300)); }
function veVisibleDur() { return veCanvasWidth() / VE.pps; }

function veClampView() {
    // deixa meia tela livre depois do fim, para dar para arrastar clipes para lá
    const maxView = Math.max(0, veNavDur() - veVisibleDur() * 0.5);
    VE.view = Math.min(Math.max(VE.view, 0), maxView);
}

function veTracksHeight() {
    return VE_TRACKS.reduce((a, tr) => a + tr.h, 0) + (typeof veKlAltura === 'function' ? veKlAltura() : 0);
}

function veClampVScroll() {
    const max = Math.max(0, veTracksHeight() - (veCanvasHeight() - VE_RULER));
    VE.vs = Math.min(Math.max(VE.vs, 0), max);
}

function veSetPps(pps, anchorT, anchorX) {
    VE.pps = Math.min(Math.max(pps, veMinPps()), VE_MAX_PPS);
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
    const min = veMinPps();
    const pps = min * Math.pow(VE_MAX_PPS / min, v / 1000);
    const x = veCanvasWidth() / 2;
    veSetPps(pps, VE.view + x / VE.pps, x);
}

function veSyncZoomSlider() {
    const min = veMinPps();
    const el = $ve('ve-zoom');
    if (!el || VE_MAX_PPS <= min) return;
    el.value = Math.round(1000 * Math.log(VE.pps / min) / Math.log(VE_MAX_PPS / min));
}

function veFollowPlayhead(playing) {
    const w = veCanvasWidth();
    const x = (VE.playhead - VE.view) * VE.pps;
    const antes = VE.view;
    if (playing) {
        if (x > w * 0.92 || x < 0) { VE.view = VE.playhead - w * 0.1 / VE.pps; veClampView(); }
    } else if (x < 0 || x > w) {
        VE.view = VE.playhead - w / 2 / VE.pps;
        veClampView();
    }
    return Math.abs(VE.view - antes) > 1e-6;
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
    veEnsureTracks(veTrackCount());
    box.innerHTML = VE_TRACKS.map((tr, i) => {
        if (tr.kind === 'l') return `
        <div class="ve-head ve-head-l" data-tr="${i}" style="height:${tr.h}px" title="Legendas (painel Texto)">
            <div class="ve-head-row"><b>LEG</b></div>
            <i class="ve-head-grip" data-grip="${i}" title="Arraste para aumentar ou diminuir a trilha"></i>
        </div>`;
        const k = veTrackIndex(tr), st = veTrackState(tr.kind, k);
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
        </div>` + (typeof veKlHeadsHtml === 'function' ? veKlHeadsHtml(tr) : '');
    }).join('');
}

// Botões do cabeçalho da trilha (olho, cadeado, mudo)
function veTrackToggle(kind, k, act) {
    const st = veTrackState(kind, k);
    st[act] = !st[act];
    if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
    if (act === 'lock' && st.lock && VE.clips[VE.sel] && VE.clips[VE.sel].tr === k) VE.sel = -1;
    const nome = `${kind === 'v' ? 'V' : 'A'}${k + 1}`;
    veToast({ lock: st.lock ? `${nome} bloqueada` : `${nome} desbloqueada`,
              hide: st.hide ? `${nome} oculta` : `${nome} visível`,
              mute: st.mute ? `${nome} sem som` : `${nome} com som` }[act]);
    if (act === 'hide') veCacheInvalidate();
    veBuildHeads();
    if (act === 'hide' && VE.ready) veSyncPlayer(true);   // o clipe de baixo pode passar a ser o que toca
    if (act === 'mute') veApplyAudioGain();
    veRefresh();
}

function veSyncHeads() {
    const box = $ve('ve-heads-rows');
    if (box) box.style.transform = `translateY(${-VE.vs}px)`;
}

// Geometria das trilhas no canvas (y já descontada a rolagem vertical). Faixas de quadros-chave abertas
// (editor-keyframes.js, kind 'k') entram logo abaixo da trilha de vídeo do clipe selecionado.
function veTrackRows() {
    let y = VE_RULER - VE.vs;
    const c = typeof veKlClip === 'function' ? veKlClip() : null;
    const out = [];
    VE_TRACKS.forEach(tr => {
        out.push({ ...tr, y, h: tr.h });
        y += tr.h;
        if (c && tr.kind === 'v' && tr.id === 'V' + (c.tr + 1)) veKlRows(c).forEach(l => { out.push({ ...l, y }); y += l.h; });
    });
    return out;
}

// V1/A1 -> 0, V2/A2 -> 1 ... (faixa de quadros-chave: a trilha do clipe dela)
function veTrackIndex(row) { return row.kind === 'k' ? row.tr : (+row.id.slice(1) || 1) - 1; }

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

function vePlaybackTimelineDue() {
    const key = [
        Math.round((VE.playhead - VE.view) * VE.pps * 2),
        Math.round(VE.view * VE.pps),
        Math.round(VE.vs),
        VE.sel,
        VE.tool
    ].join('|');
    if (VE._tlPlayKey === key) return false;
    VE._tlPlayKey = key;
    return true;
}

// requestAnimationFrame da janela onde o elemento está (painel solto: a janela dele segue desenhando
// mesmo com a principal escondida atrás de outra); janela minimizada cai na principal
function veRaf(el, cb) {
    const w = el && el.ownerDocument.defaultView;
    return (w && !w.document.hidden ? w : window).requestAnimationFrame(cb);
}

// Painel mudou de tamanho ou de lugar (docking / janela solta): reajusta zoom e redesenha
function veLayoutChanged() {
    if (typeof veMedAgendar === 'function') veMedAgendar();   // medidor de áudio: redesenha no tamanho novo
    if (VE.ready) {
        if (VE.pps < veMinPps()) VE.pps = veMinPps();
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
    if (typeof veKlSync === 'function') veKlSync();   // faixas de quadros-chave (cabeçalhos e valores)
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
    veCacheDraw(ctx, X, W);

    // In / Out
    if (VE.inPt != null || VE.outPt != null) {
        const a = VE.inPt ?? 0, b = VE.outPt ?? veNavDur();
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
    const grupo = mv && mv.grupo, selSet = new Set(veSelLista());
    const items = VE.clips.map((c, i) => ({ c, i, st: c.st, tr: c.tr, dim: mv && !mv.alt && (grupo ? grupo.includes(c) : mv.i === i) }));
    if (grupo) {
        const c0 = VE.clips[mv.i], dt = mv.st - c0.st, dtr = veGrupoDtr(grupo, mv.tr - c0.tr);
        grupo.forEach(c => items.push({ c, i: VE.clips.indexOf(c), st: Math.max(0, c.st + dt), tr: c.tr + dtr, ghost: true, lead: c === c0 }));
    } else if (mv) items.push({ c: VE.clips[mv.i], i: mv.i, st: mv.st, tr: mv.tr, ghost: true, lead: true });
    items.forEach(({ c, i, st, tr, dim, ghost, lead }) => {
        const len = veLen(c);
        const x1 = X(st), x2 = X(st + len);
        if (x2 < -2 || x1 > W + 2) return;
        const cx = Math.max(x1, -4) + 1, cw = Math.min(x2, W + 4) - Math.max(x1, -4) - 2;
        if (cw <= 0) return;
        const srcAt = x => c.s + (VE.view + x / VE.pps - st) * veVel(c);   // x do canvas -> tempo da fonte
        const vr = rowOf('V' + (tr + 1)), ar = rowOf('A' + (tr + 1));
        const img = veIsImage(c), adj = veIsAdj(c), aud = veIsAudio(c), txt = veIsTexto(c), med = veMediaOf(c);
        if ((!aud && !vr) || (veOcupaA(c) && !ar)) return;
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
        const miniaturas = veMid(c) && med && med.kind === 'video' ? (med.thumbs || []) : VE.thumbs;
        const img0 = miniaturas.find(tb => tb.img && tb.img.complete && tb.img.naturalWidth);
        if (img && med.w && th > 10) {
            const tw = th * (med.w / med.h);
            for (let x = x1; x < cx + cw; x += tw + 2) if (x + tw >= cx) ctx.drawImage(med.img, x, vy + 14, tw, th);
        } else if (!img && img0 && th > 10) {
            const tw = th * (img0.img.naturalWidth / img0.img.naturalHeight);
            for (let x = x1; x < cx + cw; x += tw) {
                if (x + tw < cx) continue;
                const tb = veThumbFor(srcAt(x + tw / 2), miniaturas);
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
            const nome = adj ? veT('Camada de ajuste') : txt ? 'T  ' + veNomeTexto(c) : img ? (med.nome || med.name || veT('Imagem'))
                : veMid(c) ? (med.nome || med.name) : veT(`Clipe ${i + 1}`);
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
        if (img || c.x === 'v' || !veOcupaA(c)) {   // imagem, vídeo com o som separado ou sem som: sem linha de áudio
            ctx.globalAlpha = 1;
            if ((selSet.has(c) && !dim) || ghost) {
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
        ctx.fillStyle = cor ? veRgba(cor, 0.30) : '#163a2b';
        ctx.fillRect(cx, ay, cw, ah);
        if (cor) {
            ctx.fillStyle = cor;
            ctx.fillRect(cx, ay, cw, Math.min(5, ah));
        }
        if (veLocked(c)) veListras(ctx, cx, ay, cw, ah);
        // forma de onda: a do vídeo aberto, ou a do próprio arquivo (áudio solto)
        const outra = veMid(c);
        const picos = outra ? (med.peaks || []) : VE.peaks, np = picos.length, durP = outra ? veDurMidia(c) : VE.srcDur;
        if (np && veTemSom(c)) {
            const mid = ay + ah / 2, amp = ah / 2 - 3, gl = veDb(c.g);
            const xa = Math.max(cx, 0), xb = Math.min(cx + cw, W);
            for (let x = xa; x < xb; x += 2) {
                const sa = srcAt(x), sb = srcAt(x + 2);
                const ia = Math.floor(sa / durP * np), ib = Math.max(ia + 1, Math.ceil(sb / durP * np));
                let pk = 0;
                for (let k = Math.max(0, ia); k < Math.min(np, ib); k++) pk = Math.max(pk, picos[k]);
                pk *= gl;
                ctx.fillStyle = pk > 1 ? '#f87171' : (cor || '#43c58f');     // vermelho = estourando
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
        } else if (!aud && !veTemSom(c) && (veMid(c) ? med.info : VE.info)) {
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
            ctx.fillText((med.nome || med.name || veT('Áudio')) + velTxt + (cw > 150 ? '  ·  ' + veShort(len) : ''), cx + 6, ay + 10);
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        // seleção (o fantasma do arraste ganha contorno tracejado)
        if ((selSet.has(c) && !dim) || ghost) {
            ctx.strokeStyle = '#F97316';
            ctx.lineWidth = 2;
            if (ghost) ctx.setLineDash([5, 3]);
            if (!aud) { veRoundRect(ctx, cx, vy, cw, vh, 4); ctx.stroke(); }
            veRoundRect(ctx, cx, ay, cw, ah, 4); ctx.stroke();
            ctx.setLineDash([]);
        }
        if (lead) {
            ctx.font = '600 10px Cascadia Mono, Consolas, monospace';
            const txt = `${mv && mv.alt ? '+ ' : ''}${aud ? 'A' : 'V'}${tr + 1} · ${veShort(st)}`, ty = aud ? ay : vy;
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillRect(Math.max(2, x1), ty - 17, ctx.measureText(txt).width + 10, 15);
            ctx.fillStyle = '#F97316';
            ctx.fillText(txt, Math.max(2, x1) + 5, ty - 6);
        }
    });
    veTransDesenhar(ctx, rows);
    if (typeof veTxaDesenharTl === 'function') veTxaDesenharTl(ctx, rows, X);   // entrada/saída do texto animado
    if (typeof veKlDesenhar === 'function') veKlDesenhar(ctx, rows, X, W);
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
            if (i === VETX.legSel) {
                ctx.strokeStyle = '#F97316';
                ctx.lineWidth = 2;
                ctx.strokeRect(x1 + 1, y + 1, w - 2, h - 2);
                ctx.fillStyle = '#F97316';
                ctx.fillRect(x1 + 1, y + 2, Math.min(4, w / 2), h - 4);
                ctx.fillRect(x1 + w - Math.min(5, w / 2), y + 2, Math.min(4, w / 2), h - 4);
            }
        });
        ctx.restore();
    }

    if (VE.gapSel) veGapDesenhar(ctx, rowOf, X);   // espaço vazio selecionado (editor-lacunas.js)

    // retângulo de seleção
    if (VE.drag && VE.drag.mode === 'marq') {
        const d = VE.drag, xa = X(d.ta), xb = X(d.tb);
        ctx.fillStyle = 'rgba(249,115,22,0.10)';
        ctx.fillRect(Math.min(xa, xb), Math.min(d.ya, d.yb), Math.abs(xb - xa), Math.abs(d.yb - d.ya));
        ctx.strokeStyle = 'rgba(249,115,22,0.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(Math.min(xa, xb) + 0.5, Math.min(d.ya, d.yb) + 0.5, Math.abs(xb - xa), Math.abs(d.yb - d.ya));
        ctx.setLineDash([]);
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

    veDrawMarkers(ctx, X, W, H);
    if (typeof veIoChip === 'function') veIoChip();

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
        // ◆ selecionado (editor-keyframes.js: Delete apaga só ele): contorno branco
        const kSel = sel && typeof veKlTemSel === 'function' && veKlTemSel() &&
            VEKL.sel.some(s => Math.abs(veTlAt(c, s.t) - t) < veFrame() / 2);
        ctx.fillStyle = naAgulha ? '#fbbf24' : sel ? '#F97316' : 'rgba(255,255,255,0.7)';
        ctx.strokeStyle = kSel ? '#fff' : 'rgba(0,0,0,0.7)';
        ctx.lineWidth = kSel ? 2 : 1;
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

function veThumbFor(t, lista = VE.thumbs) {
    if (!lista || !lista.length) return null;
    let best = null, bd = Infinity;
    // thumbs ordenadas por tempo → busca binária
    let lo = 0, hi = lista.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lista[mid].t < t) lo = mid + 1; else hi = mid - 1;
    }
    for (const k of [lo - 1, lo]) {
        const tb = lista[k];
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
    if (!VE.ready) { thumb.style.left = '0'; thumb.style.width = '100%'; return; }
    const navDur = veNavDur();
    const frac = Math.min(1, veVisibleDur() / navDur);
    thumb.style.width = Math.max(4, frac * 100) + '%';
    thumb.style.left = (VE.view / navDur * 100) + '%';
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

    if (!VE.clips.length) {
        box.innerHTML = '<div class="ve-clips-empty">Timeline vazia.<br>Arraste mídias do painel Projeto para montar a edição.</div>';
        return;
    }
    const c0 = VE.clips[0];
    if (VE.clips.length === 1 && c0.st < 1e-3 && c0.tr === 0 && !c0.g && !c0.p && !c0.k && !c0.fx && !c0.afx && c0.s < 1e-3 && Math.abs(c0.e - VE.srcDur) < 1e-3) {
        box.innerHTML = '<div class="ve-clips-empty">Nenhum corte ainda.<br>Aperte <b>\'</b> (ou <b>S</b>) para cortar na agulha. <b>Q</b> / <b>W</b> apagam antes / depois da agulha até o corte mais próximo.<br>Selecione um clipe e aperte <b>D</b> para apagá-lo.</div>';
        return;
    }
    box.innerHTML = VE.clips.map((c, i) => {
        const vfx = typeof veHasFx === 'function' && veHasFx(c);
        const afx = typeof veHasAfx === 'function' && veHasAfx(c);
        const vfxBadge = vfx ? ` <span class="ve-clip-fx" title="${veEsc(c.fx.map(f => VE_FX[f.t]?.nome).join(', '))}">fx</span>` : '';
        const afxBadge = afx ? ` <span class="ve-clip-fx" title="${veEsc(c.afx.map(f => VE_AFX[f.t]?.nome).join(', '))}">aud</span>` : '';
        return `
        <div class="ve-clip${i === VE.sel ? ' sel' : ''}" data-i="${i}">
            <div class="ve-clip-bar"${veCor(c) ? ` style="background:${veCor(c)}"` : ''}></div>
            <div>
                <div class="ve-clip-name">${veNomeClipe(c)} ${i + 1} <span class="ve-clip-tr">V${c.tr + 1}</span>${c.g ? ` <span class="ve-clip-db">${veFmtDb(c.g)}</span>` : ''}${vfxBadge}${afxBadge}</div>
                <div class="ve-clip-time">${veShort(c.st)} → ${veShort(veEnd(c))} · ${veShort(veLen(c))}</div>
            </div>
            <button class="ve-clip-act" data-act="${i}" title="Apagar clipe (D)"><svg class="i"><use href="#i-trash"/></svg></button>
        </div>`;
    }).join('');
}

function veRefresh() {
    if (typeof veMidiaUsadasPreparar === 'function') veMidiaUsadasPreparar();
    veTxRender();
    vePjRender();
    if (veMixAtivo()) veAudioEditou();
    veUpdateReadouts();
    veRenderClips();
    veRenderProps();
    veSeqTabsRender();
    if (typeof veTrRenderControls === 'function') veTrRenderControls();
    if (typeof veTxaRenderControls === 'function') veTxaRenderControls();
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
    veFerrRender();
    const wrap = $ve('ve-tl-wrap');
    wrap.classList.toggle('tool-razor', tool === 'razor');
    wrap.classList.toggle('tool-hand', tool === 'hand');
    wrap.classList.toggle('tool-rate', tool === 'rate');
    wrap.classList.toggle('tool-zoom', tool === 'zoom');
    wrap.classList.toggle('tool-fwd', tool === 'fwd');
    wrap.classList.toggle('tool-bwd', tool === 'bwd');
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
        (VE.markers || []).forEach(m => cands.push(+m.t || 0));
        let best = null, bd = lim;
        for (const c of cands) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
        if (best != null) return best;
    }
    return veSnapFrame(t);
}

// ─────────────────────────── abrir vídeo ───────────────────────────

function veEscolherArquivoEditor(quickEdit) {
    if (VE.exportRunning) return;
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.select_file) { veToast('A ponte com o app ainda não está pronta'); return; }
    api.select_file('video-cutter').then(r => {
        if (!r || !r.success) return;
        veAbrirArquivoEscolhido(r.path, false, !!quickEdit || !!VE.quickEditPending);
    }).catch(e => veToast('Não consegui abrir o seletor: ' + (e && e.message ? e.message : e)));
}

function veOpenFile() { veEscolherArquivoEditor(false); }
function veNovoProjeto() { veEscolherArquivoEditor(false); }
function veQuickEdit() {
    if (VE.exportRunning || !veConfirmDiscard()) return;
    veResetEditorVazio({ quickEdit: true, mostrarInicio: false });
    veToast('Quick edit pronto: arraste uma mídia ou use Abrir vídeo para começar.');
}

function veAbrirArquivoEscolhido(path, inserirNaTimeline, quickEdit) {
    if (!path) return;
    if (/\.vcnvt$/i.test(path)) { veOpenProject(path); return; }
    if (inserirNaTimeline && VE.ready) { veDropFiles([{ path, pasta: false }]); return; }
    if (VE.ready && inserirNaTimeline !== false) { veDropFiles([{ path, pasta: false }]); return; }
    if (veConfirmDiscard()) {
        VE.quickEdit = !!quickEdit;
        VE.quickEditPending = false;
        veOpenPath(path);
    }
}

function veImportTimelineFile() {
    if (VE.exportRunning) return;
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.select_file) { veToast('A ponte com o app ainda não está pronta'); return; }
    api.select_file('video-cutter').then(r => {
        if (!r || !r.success) return;
        veAbrirArquivoEscolhido(r.path, true);
    }).catch(e => veToast('Não consegui abrir o seletor: ' + (e && e.message ? e.message : e)));
}

function veOpenPath(path) {
    if (!path || VE.exportRunning || !veIsActive()) return;
    if (!VE._pendingProject) { VE.projectPath = null; VE.dirty = false; }
    if (VE.quickEditPending) { VE.quickEdit = true; VE.quickEditPending = false; }
    VE.startScreenDismissed = true;
    veStop();
    veDeckReset();
    veAudioReset();
    VE_TRK = veTrkNovo();
    VE.legendas = [];
    VE.legEstilo = null;
    VE.legGravar = true;
    veTxReset();
    const v = veVideo();
    v.pause();
    v.removeAttribute('src');
    v.load();
    veParkExtras(0, true);
    veCacheClear(true);
    Object.assign(VE, {
        path, info: null, dur: 0, srcDur: 0, clips: [], sel: -1, inPt: null, outPt: null, markers: [], guias: [], playhead: 0,
        cur: -1, history: [], future: [], thumbs: [], peaks: [], ready: false, dest: null, view: 0, media: [],
        sequences: [], activeSequence: null, openSequences: [], _seqN: 0,
    });
    veBuildHeads();
    veUpdateUndo();
    $ve('ve-empty').hidden = true;
    $ve('ve-proxy-badge').hidden = true;
    veOnboardingRender();
    veLoading('Analisando vídeo...', 5);
    $ve('ve-export-btn').disabled = true;
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
            // base: timeline aberta por uma imagem — a mídia 0 é um vídeo preto mudo no tamanho dela (fundo), que
            // não aparece no painel Projeto nem entra na timeline; a imagem vira um clipe comum de 5 s em V1
            VE.media = [{ id: 0, kind: 'video', path: VE.path, name: ev.file_name, base: !!ev.base_imagem }];
            VE.bins = [];
            VEPJ.sel.clear();
            VEPJF.fila = [];
            VE.seqW = ev.width || 1920;
            VE.seqH = ev.height || 1080;
            VE.clips = ev.base_imagem ? [] : [{ tr: 0, st: 0, s: 0, e: VE.srcDur }];
            veRelayout();
            VE.ready = true;
            if (!VE._pendingProject) veEnsureSequence();
            VE.pps = veFitPps();
            VE.view = 0;
            veSyncZoomSlider();
            const res = ev.width && ev.height ? `${ev.width}×${ev.height}` : '';
            $ve('ve-meta').innerHTML = ev.base_imagem ? `<b>${veEsc(ev.file_name)}</b> · ${res} · imagem`
                : `<b>${veEsc(ev.file_name)}</b> · ${res} · ${(+ev.fps).toFixed(2).replace(/\.00$/, '')} fps · ${veHuman(ev.duration)}${ev.has_audio ? '' : ' · sem áudio'}`;
            veLoading(ev.needs_proxy ? 'Preparando prévia leve (formato não toca direto no app)...' : 'Carregando vídeo...', ev.needs_proxy ? 0 : 60);
            if (ev.has_audio) veAudioFonte();   // áudio conformado para o mixer em tempo real
            veRefresh();
            if (VE._pendingProject) veApplyProject();
            veUpdateTitle();
            break;
        }
        case 'proxy':
            veLoading(`Preparando prévia leve... ${ev.pct}%`, ev.pct);
            break;
        case 'video': {
            const v = veVideo();
            v.crossOrigin = 'anonymous';   // permite o ganho acima de 100% na prévia (Web Audio)
            if (VE.media[0]) VE.media[0].url = ev.url;
            v._mid = 0;
            v.src = ev.url;
            v.muted = VE.muted;
            v.load();
            $ve('ve-proxy-badge').hidden = !ev.proxy;
            v.addEventListener('loadeddata', () => {
                veLoading(null);
                $ve('ve-export-btn').disabled = false;
                veSeek(0);
                if (VE.info && VE.info.base_imagem && !VE._pendingProject && !VE.clips.length) veIniciarComImagem();
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
    if (veOfflineMedias().length) { veToast('Relinque ou apague as mídias offline antes de exportar'); return; }
    veStop();
    const sel = $ve('ve-res');
    const W = VE.seqW || VE.info.width || 0, H = VE.seqH || VE.info.height || 0;
    const lado = Math.min(W, H);
    const opts = [['original', `Original (${W}×${H})`]];
    [[2160, '4K (2160p)'], [1440, '1440p'], [1080, '1080p Full HD'], [720, '720p HD'], [480, '480p']]
        .forEach(([r, l]) => { if (lado > r) opts.push([String(r), l]); });
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
    // nome do arquivo: o que foi digitado nesta sessão, ou <projeto ou vídeo>_editado
    const nome = $ve('ve-exp-nome'), base = (VE.projectPath || VE.path || 'video').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    if (!VE._expNome || nome.value === VE._expPadrao) nome.value = VE._expNome || base + '_editado';
    VE._expPadrao = base + '_editado';
    // codec, bits e taxa lembrados entre exportações
    try {
        const o = JSON.parse(veLsGet('ve-exp-opcoes') || '{}');
        ['codec', 'bits', 'taxa'].forEach(k => {
            const b = o[k] && document.querySelector(`#ve-export .ve-pills[data-name="${k}"] .ve-pill[data-v="${o[k]}"]`);
            if (b) b.parentElement.querySelectorAll('.ve-pill').forEach(x => x.classList.toggle('active', x === b));
        });
        if (o.mbps) $ve('ve-exp-mbps').value = o.mbps;
    } catch (e) { /* padrão */ }
    $ve('ve-export-form').hidden = false;
    $ve('ve-export-progress').hidden = true;
    $ve('ve-exp-result').hidden = true;
    veExportFoot('form');
    veUpdateExportSummary();
    $ve('ve-export').hidden = false;
    setTimeout(() => { nome.focus(); nome.select(); }, 30);
}

// Pílula de um grupo: marca uma (e desliga as que não valem)
function veExpPill(nome, v) {
    document.querySelectorAll(`#ve-export .ve-pills[data-name="${nome}"] .ve-pill`).forEach(b => b.classList.toggle('active', b.dataset.v === v));
}

function veExpOpcoes() {
    const fmt = vePill('format') || 'mp4', codec = ['mp4', 'mov', 'mkv'].includes(fmt) ? vePill('codec') || 'h264' : 'h264';
    const mbps = vePill('taxa') === 'mbps' ? Math.max(1, Math.min(400, +$ve('ve-exp-mbps').value || 16)) : 0;
    return { nome: $ve('ve-exp-nome').value.trim(), codec, bits: +(vePill('bits') || 8), mbps };
}

function veUpdateExportSummary() {
    const fmt = vePill('format') || 'mp4';
    const audio = fmt === 'mp3' || fmt === 'wav';
    // codec: H.265 e ProRes só em MP4/MOV/MKV; ProRes sai em .mov, sempre 10 bits; H.264 fica em 8 bits
    const comCodec = ['mp4', 'mov', 'mkv'].includes(fmt), codec = comCodec ? vePill('codec') || 'h264' : 'h264';
    const ex = $ve('ve-export');
    ex.classList.toggle('sem-codec', !comCodec);
    ex.classList.toggle('prores', comCodec && codec === 'prores');
    const b8 = document.querySelector('#ve-export .ve-pill[data-v="8"]'), b10 = document.querySelector('#ve-export .ve-pill[data-v="10"]');
    if (b8 && b10) {
        b10.classList.toggle('disabled', codec === 'h264');
        b8.classList.toggle('disabled', codec === 'prores');
        if (codec === 'h264') veExpPill('bits', '8');
        if (codec === 'prores') veExpPill('bits', '10');
    }
    $ve('ve-exp-mbps-box').hidden = vePill('taxa') !== 'mbps';
    $ve('ve-exp-ext').textContent = codec === 'prores' && comCodec ? '.mov' : '.' + fmt;
    try { veLsSet('ve-exp-opcoes', JSON.stringify({ codec: vePill('codec'), bits: vePill('bits'), taxa: vePill('taxa'), mbps: $ve('ve-exp-mbps').value })); } catch (e) {}
    const f = veExportFaixa(), dur = f ? f.b - f.a : VE.dur;
    const faixa = f ? `<br>Só o trecho <b>In→Out</b>: ${veShort(f.a)} a ${veShort(f.b)}` : '';
    $ve('ve-export').classList.toggle('audio', audio);
    if (audio) {
        $ve('ve-export-summary').innerHTML =
            `Duração final: <b>${veTC(dur)}</b> (${veHuman(dur)})<br>Só o áudio da timeline · <b>${fmt.toUpperCase()}</b>` + faixa;
        return;
    }
    // o quadro da sequência; a resolução escolhida vale para o lado menor (1080p vertical = 1080×1920)
    const res = $ve('ve-res').value, W = VE.seqW, H = VE.seqH, lado = Math.min(W, H);
    const k = res === 'original' || +res >= lado ? 1 : +res / lado;
    const w = Math.round(W * k / 2) * 2, h = Math.round(H * k / 2) * 2;
    const o = veExpOpcoes(), nomes = { h264: 'H.264', hevc: 'H.265', prores: 'ProRes 422 HQ' };
    // tamanho estimado: com taxa alvo é conta direta; ProRes 422 HQ ≈ 220 Mbps em 1080p30 (escala com os pixels)
    const px = w * h / (1920 * 1080), fpsK = (VE.fps || 30) / 30;
    const mbps = o.codec === 'prores' ? 220 * px * fpsK : o.mbps;
    const tam = mbps ? ` · ~${veCacheBytesTxt((mbps * 1e6 / 8 + 24000) * dur)}` : '';
    $ve('ve-export-summary').innerHTML =
        `Duração final: <b>${veTC(dur)}</b> (${veHuman(dur)})<br>` +
        `Clipes: <b>${VE.clips.length}</b> · Resolução: <b>${w}×${h}</b> · <b>${fmt.toUpperCase()}</b>` +
        (comCodec ? ` · <b>${nomes[o.codec]} ${o.bits} bits</b>` : '') + tam + faixa;
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
    try {
        if (VE.clips.some(veIsTexto)) await veTxPngs();
        const plano = veExportPlan(true);
        await window.pywebview.api.video_cutter_export(
            VE.path, plano.base, vePill('format') || 'mp4', vePill('quality') || 'medium',
            $ve('ve-res').value, $ve('ve-gpu').checked, VE.dest, noAudio,
            plano.camadas, plano.audio, plano.dur, veMasterLim() ? [...plano.mix, { master: veMasterLim() }] : plano.mix,
            veTxExport(plano.faixa), [VE.seqW, VE.seqH],
            veExpOpcoes()
        );
        VE._expNome = $ve('ve-exp-nome').value.trim();
    } catch (e) {
        const msg = e && (e.message || e.error || e);
        veOnExport({ done: true, success: false, error: 'Falha ao exportar: ' + (msg || 'erro ao preparar a exportação') });
    }
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
            `<span class="ve-exp-sub">${veHuman(ev.duration)} · ${mb}${ev.turbo ? ' · ⚡ ' + veT('turbo (tudo na placa de vídeo)') : ''}</span>` +
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
const VEM = { mz: 1, mx: 0, my: 0, pan: null, panned: false,
    rulers: veLsGet('ve.rulers') === '1', res: veLsGet('ve.previewRes') === '0.5' ? 0.5 : 1 };

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
    veRulersDraw();
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
    scr.addEventListener('pointerup', end);
    scr.addEventListener('pointercancel', end);
    new ResizeObserver(() => veApplyMonitor()).observe(scr);
    veToggleRulers(VEM.rulers);
    veSetPreviewRes(VEM.res);
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
    // Rolagem vertical pelos cabeçalhos. Alt+roda (como no Premiere): altura da trilha sob o ponteiro;
    // Alt+Shift+roda: todas as trilhas do mesmo tipo (vídeo ou áudio)
    $ve('ve-heads-rows').parentElement.addEventListener('wheel', e => {
        e.preventDefault();
        const row = e.altKey && e.target.closest('[data-tr]');
        if (row) {
            const tr = VE_TRACKS[+row.dataset.tr], passo = (e.deltaY < 0 ? 1 : -1) * Math.max(4, Math.round(tr.h * 0.18));
            const alvos = e.shiftKey ? VE_TRACKS.filter(t => t.kind === tr.kind) : [tr];
            alvos.forEach(t => { t.h = Math.round(Math.min(Math.max(t.h + passo, VE_TRACK_MIN), VE_TRACK_MAX)); });
            veBuildHeads();
            veLsSet('ve-track-h', JSON.stringify(VE_TRACKS.map(t => t.h)));
            veDraw();
            return;
        }
        VE.vs += e.deltaY;
        veDraw();
    }, { passive: false });
}

function veInitEvents() {
    const wrap = $ve('ve-tl-wrap');
    const v = veVideo();

    // o estado de reprodução é do editor (relógio próprio), não do <video>
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
        if (VE.tool === 'zoom' && e.button === 0) {
            veSetPps(VE.pps * (e.altKey ? 0.5 : 2), t, x);
            return;
        }
        const row = veRowAt(y);
        if (VE.tool === 'razor' && e.button === 0) {
            if (row && row.kind === 'l') {
                if (veLegSplitAt(veSnapTime(t, true))) veToast('Legenda cortada em ' + veShort(veSnapTime(t, true)));
                return;
            }
            veSplitAt(veSnapTime(t, true));
            return;
        }
        // seleção: clicar num clipe só seleciona (a agulha fica onde está — ela anda pela régua).
        // Segurar e arrastar move o clipe no tempo e entre trilhas; clicar em área vazia desmarca.
        // Pela borda do clipe, arrastar encurta/alonga (imagens: define a duração).
        if (row && row.kind === 'l') { veLegPointer(e, x, t); return; }
        VETX.legSel = -1;
        if (VE.tool === 'rate' && e.button === 0) { veRatePointer(e, x, row); return; }
        if ((VE.tool === 'fwd' || VE.tool === 'bwd') && e.button === 0 && row) {
            // Selecionar faixa para a frente/trás (editor-lacunas.js): pega o grupo e já pode arrastar
            const c = veFaixaSelecionar(e, t, row), lista = veSelLista();
            if (c) VE.drag = { mode: 'move', i: VE.clips.indexOf(c), x0: e.clientX, y0: e.clientY, grab: t - c.st, active: false,
                               st: c.st, tr: c.tr, kind: row.kind, grupo: lista.length > 1 ? lista : null };
            veRenderClips(); veRenderProps(); veDrawMonitor(); veDraw();
            return;
        }
        // bloco de transição: clicar seleciona; pela borda, arrastar muda a duração
        const th = e.button === 0 && row && row.kind !== 'l' ? veTransAt(x, y) : null;
        if (th) { if (VE.playing) veStop(); veTransPointer(th, t); return; }
        VE.trSel = null;
        VE.bordaSel = null;
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
            // sem vínculo, aparar a borda do vídeo ou do áudio mexe só nele; com vínculo, o par vai junto
            const c = VE.clips[borda.i], parte = vePegar(c, row.kind);
            const cb = parte.includes(c) ? c : parte[0], bi = VE.clips.indexOf(cb), ed = borda.side === 'l' ? cb.st : veEnd(cb);
            veSelDefinir(parte, cb);
            const par = parte.filter(o => o !== cb && !veLocked(o) && Math.abs((borda.side === 'l' ? o.st : veEnd(o)) - ed) < 1e-4)
                .map(o => ({ i: VE.clips.indexOf(o), side: borda.side, c0: { ...o } }));
            VE.drag = { mode: 'trim', i: bi, side: borda.side, c0: { ...cb }, par, started: false };
            VE.bordaSel = { c: cb, lado: borda.side === 'l' ? 'in' : 'out' };   // ponta selecionada (Ctrl+D / Ctrl+Shift+D)
            if (VE.playing) veStop();
            wrap.classList.add('trimming');
            veRenderClips(); veRenderProps(); veDraw();
            return;
        }
        let i = row ? veClipAtTrack(t, veTrackIndex(row), row.kind) : -1;
        if (i >= 0 && veLocked(VE.clips[i])) { i = -1; if (e.button === 0) veAvisoBloqueio(); }
        if (i < 0) {
            // área vazia: arrastar desenha o retângulo de seleção (Shift soma ao que já está selecionado)
            const base = e.shiftKey ? veSelLista() : [];
            veSelDefinir(base, VE.clips[VE.sel]);
            // espaço entre dois clipes: fica selecionado (Delete fecha, editor-lacunas.js); arrastar vira retângulo
            if (e.button === 0 && !e.shiftKey) VE.gapSel = veGapAt(t, row);
            if (e.button === 0) VE.drag = { mode: 'marq', ta: t, tb: t, ya: y, yb: y, base };
        } else {
            const atual = veSelLista(), pega = vePegar(VE.clips[i], row.kind);
            if (e.shiftKey && e.button === 0) {
                // Shift+clique: põe ou tira da seleção
                const tem = pega.some(o => atual.includes(o));
                veSelDefinir(tem ? atual.filter(o => !pega.includes(o)) : atual.concat(pega), tem ? null : pega[0]);
            } else {
                // clicar num clipe que já faz parte da seleção mantém o grupo (para arrastar todos juntos)
                veSelDefinir(atual.length > 1 && pega.every(o => atual.includes(o)) ? atual : pega, pega[0]);
                if (e.button === 0) {
                    const lista = veSelLista(), c = pega[0];
                    VE.drag = { mode: 'move', i: VE.clips.indexOf(c), x0: e.clientX, y0: e.clientY, grab: t - c.st, active: false,
                                st: c.st, tr: c.tr, kind: row.kind, grupo: lista.length > 1 ? lista : null };
                }
            }
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
                const trb = veTransAt(x, y);
                wrap.classList.toggle('trim-hover', !wrap.classList.contains('kf-hover') && (trb ? !!trb.borda : !!veEdgeAt(x, row)));
            }
            return;
        }
        if (VE.drag.mode === 'leg') { veLegArrastar(e, t); return; }
        if (VE.drag.mode === 'trdur') { veTransArrastar(t); return; }
        if (VE.drag.mode === 'marq') {
            const w = veCanvasWidth();
            if (x > w - 20) { VE.view += 12 / VE.pps; veClampView(); }
            if (x < 20) { VE.view -= 12 / VE.pps; veClampView(); }
            VE.drag.tb = VE.view + x / VE.pps;
            VE.drag.yb = veTimeFromEvent(e).y;
            veDraw();
            return;
        }
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
            const cc = VE.clips[d.i];
            (d.par || []).forEach(q => veTrimTo(q, d.side === 'l' ? cc.st : veEnd(cc)));
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
        if (d && d.mode === 'leg') {
            if (d.active) veLegOrdenar((VE.legendas || [])[VETX.legSel]);
            veRefresh();
            return;
        }
        if (d && d.mode === 'trdur') { veRefresh(); return; }
        if (d && d.mode === 'marq') {
            if (Math.abs(d.tb - d.ta) * VE.pps > 3 || Math.abs(d.yb - d.ya) > 3) { VE.gapSel = null; veMarqueeFim(d); }
            veRefresh();
            return;
        }
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
            if (d.grupo) veMoverGrupo(d.grupo, d.st - VE.clips[d.i].st, d.tr - VE.clips[d.i].tr, d.alt);
            else if (d.alt) veDuplicarEm(d.i, d.tr, d.st); else veMoveClip(d.i, d.tr, d.st);
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
        VETX.legSel = -1;
        veSelDefinir(vePegar(VE.clips[i], row.kind), VE.clips[i]);
        veRefresh();
        veClipMenu(VE.sel >= 0 ? VE.sel : i, e.clientX, e.clientY, wrap.ownerDocument);
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
            VE.view = v0 + (ev.clientX - x0) / bar.clientWidth * veNavDur();
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
        VE.view = (e.clientX - r.left) / r.width * veNavDur() - veVisibleDur() / 2;
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
    $ve('ve-exp-mbps').addEventListener('input', veUpdateExportSummary);
    $ve('ve-exp-nome').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') veStartExport(); });

    // arrastar e soltar (visual; o caminho real chega pelo Python)
    const screen = $ve('ve-screen');
    ['dragenter', 'dragover'].forEach(n => screen.addEventListener(n, e => { e.preventDefault(); screen.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(n => screen.addEventListener(n, () => screen.classList.remove('drag-over')));
    document.addEventListener('dragover', e => { if (veIsActive()) e.preventDefault(); });
    document.addEventListener('drop', e => {
        if (!veIsActive()) return;
        e.preventDefault();
        veGuardarDrop(e);
    });

    new ResizeObserver(() => {
        if (VE.ready) {
            if (VE.pps < veMinPps()) VE.pps = veMinPps();
            veClampView();
            veSyncZoomSlider();
        }
        veDraw();
    }).observe(wrap);

    veInitResizers();
    veInitProps();
    v.addEventListener('seeked', () => veDrawMonitor());
    v.addEventListener('loadeddata', () => veDrawMonitor());
    // caixa de ganho (e o Hard Limiter dela): Enter aplica, Esc cancela
    $ve('ve-gain').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); veApplyGain(); }
        else if (e.key === 'Escape') { e.preventDefault(); veCloseGain(); }
        e.stopPropagation();
    });
    $ve('ve-master').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); veAplicarMaster(); }
        else if (e.key === 'Escape') { e.preventDefault(); veFecharMaster(); }
        e.stopPropagation();
    });
    veInitMonitorZoom();
    if (typeof veInitMedidor === 'function') veInitMedidor();
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
    if (!$ve('ve-master').hidden) return;
    if (VEAT.aberto) return;               // janela Atalhos do teclado aberta (ela grava as teclas)
    // P/S/R/T/U com clipe selecionado, Delete/Ctrl+C/Ctrl+V com quadros-chave selecionados (editor-keyframes.js)
    if (typeof veKlTecla === 'function' && veKlTecla(e)) return;
    // as teclas de cada ação (padrão ou as do usuário) ficam em editor-comandos.js
    veExecTecla(e);
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
        if (toolId === 'video-cutter') setTimeout(() => { veOnboardingRender(); if (VE.ready) veSyncZoomSlider(); veDraw(); }, 30);
    };
    switchTool = window.switchTool;
})();

document.addEventListener('DOMContentLoaded', () => {
    veLoadLayout();
    veCacheUpdateUi();
    if (window.PREFS_CARREGADAS) veRecentesProjetosSincronizar();
    veOnboardingRender();
    veBuildHeads();
    veInitEvents();
    $ve('ve-seq-tabs')?.addEventListener('click', veSeqTabClick);
    veSetTool('select');
    veSyncVinculo();
    veDraw();
});

window.veOnPrepare = veOnPrepare;
window.veOnExport = veOnExport;
window.veOpenPath = veOpenPath;
window.veGuardarDrop = veGuardarDrop;
window.veOpenFile = veOpenFile;
window.veImportTimelineFile = veImportTimelineFile;
