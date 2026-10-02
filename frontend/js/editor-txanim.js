// =========================================================
// Pocket Editor — animação de texto letra a letra, palavra a palavra ou linha a linha
// (inspirada nos presets de texto do Mister Horse / Animation Composer e no Range Selector do After Effects)
//
// Modelo (o mesmo do Range Selector do AE): o texto é dividido em unidades (letras sem os espaços, palavras ou
// linhas). Cada unidade faz a mesma animação curta, começando um pouco depois da anterior:
//   n unidades, duração total D, sobreposição s (0 = uma de cada vez; 1 = todas juntas)
//   duração de cada uma  du = D / (1 + (n − 1)(1 − s))       início da k-ésima  k · du · (1 − s)
//   (a última termina exatamente em D). O progresso da unidade (0..1) passa por uma curva de easing
//   (fórmulas de easings.net / Robert Penner) e vira opacidade, deslocamento (em "em" = tamanho da fonte),
//   escala, rotação, desfoque, espaçamento ou máscara.
// Saída = a mesma conta com o tempo contado a partir do fim do clipe (as primeiras unidades saem primeiro;
// na máquina de escrever, apaga do fim, como o backspace).
//
// Clipe: c.txa = { in: {p, d, un, ord, sob}, out: {...} }. Prévia: veTxaCanvas desenha o quadro (fora da
// animação o texto usa o desenho normal). Exportação: veTxaExportar grava os quadros animados em PNG e o trecho
// parado num PNG só; o ffmpeg lê a lista (demuxer concat) como a camada do texto (video_cutter.py).
// =========================================================

// ── curvas (easings.net) ──
const VE_TXA_C1 = 1.70158, VE_TXA_C3 = VE_TXA_C1 + 1, VE_TXA_C4 = (2 * Math.PI) / 3;
const VE_TXA_EASE = {
    lin: x => x,
    outCubic: x => 1 - Math.pow(1 - x, 3),
    outQuart: x => 1 - Math.pow(1 - x, 4),
    outExpo: x => x === 1 ? 1 : 1 - Math.pow(2, -10 * x),
    inOutCubic: x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
    outBack: x => 1 + VE_TXA_C3 * Math.pow(x - 1, 3) + VE_TXA_C1 * Math.pow(x - 1, 2),
    outElastic: x => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * VE_TXA_C4) + 1,
    outBounce: x => {
        const n1 = 7.5625, d1 = 2.75;
        if (x < 1 / d1) return n1 * x * x;
        if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
        if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
        return n1 * (x -= 2.625 / d1) * x + 0.984375;
    },
};
const veTxaClamp = v => Math.max(0, Math.min(1, v));

// ── presets ──
// un = unidade padrão (l letra · p palavra · n linha), d = duração (s), sob = sobreposição, ease = curva,
// fn(e, u) → estado da unidade: e = progresso com a curva, u = progresso cru (0..1)
// estado: op (0..1), dx/dy (em), sc (escala), rot (graus), blur (em), trk (espaçamento extra, em), mask (corta
// na caixa da linha), dec (mostra caracteres sorteados), cursor (máquina de escrever)
const VE_TXA = {
    maquina: { nome: 'Máquina de escrever', tag: 'Typewriter', un: 'l', d: 1.2, sob: 0, ease: 'lin', cursor: true, saidaDoFim: true,
        fn: (e, u) => ({ op: u > 0 ? 1 : 0 }) },
    fade: { nome: 'Fade suave', tag: 'Fade · letra a letra', un: 'l', d: 1.0, sob: 0.8, ease: 'inOutCubic',
        fn: e => ({ op: e }) },
    subir: { nome: 'Subir palavras', tag: 'Fade & Position', un: 'p', d: 0.9, sob: 0.55, ease: 'outQuart',
        fn: e => ({ op: e, dy: (1 - e) * 0.55 }) },
    revelar: { nome: 'Revelar linhas', tag: 'Mask Reveal', un: 'n', d: 0.9, sob: 0.45, ease: 'outExpo',
        fn: e => ({ dy: (1 - e) * 1.15, mask: true }) },
    revelarPal: { nome: 'Revelar palavras', tag: 'Mask · palavra', un: 'p', d: 0.9, sob: 0.5, ease: 'outExpo',
        fn: e => ({ dy: (1 - e) * 1.15, mask: true }) },
    letras: { nome: 'Letras de baixo', tag: 'Rise · letra a letra', un: 'l', d: 0.9, sob: 0.7, ease: 'outBack',
        fn: (e, u) => ({ op: veTxaClamp(u * 2.5), dy: (1 - e) * 0.5 }) },
    descer: { nome: 'Descer palavras', tag: 'Drop · palavra', un: 'p', d: 0.9, sob: 0.55, ease: 'outQuart',
        fn: e => ({ op: e, dy: -(1 - e) * 0.55 }) },
    pop: { nome: 'Pop', tag: 'Scale · letra a letra', un: 'l', d: 0.8, sob: 0.7, ease: 'outBack',
        fn: (e, u) => ({ op: veTxaClamp(u * 3), sc: Math.max(0, e) }) },
    desfoque: { nome: 'Desfoque', tag: 'Blur In', un: 'l', d: 1.2, sob: 0.75, ease: 'outCubic',
        fn: e => ({ op: e, blur: (1 - e) * 0.22, sc: 1 + (1 - e) * 0.12 }) },
    espacamento: { nome: 'Espaçamento', tag: 'Fade & Tracking', un: 'n', d: 1.3, sob: 0.3, ease: 'outExpo', trk: 0.45,
        fn: e => ({ op: e, trk: (1 - e) * 0.45 }) },
    decodificar: { nome: 'Decodificar', tag: 'Decode', un: 'l', d: 1.4, sob: 0.85, ease: 'lin',
        fn: (e, u) => ({ op: u > 0 ? veTxaClamp(u * 4) : 0, dec: u < 1 }) },
    quicar: { nome: 'Cair e quicar', tag: 'Bounce · letra a letra', un: 'l', d: 1.3, sob: 0.6, ease: 'outBounce',
        fn: (e, u) => ({ op: veTxaClamp(u * 5), dy: -(1 - e) * 1.1 }) },
    girar: { nome: 'Girar', tag: 'Rotate In', un: 'l', d: 1.0, sob: 0.65, ease: 'outBack',
        fn: (e, u) => ({ op: veTxaClamp(u * 2), rot: -(1 - e) * 75, dy: (1 - e) * 0.25 }) },
    elastico: { nome: 'Elástico', tag: 'Elastic · palavra', un: 'p', d: 1.3, sob: 0.6, ease: 'outElastic',
        fn: (e, u) => ({ op: veTxaClamp(u * 3), sc: e }) },
};
const VE_TXA_UN = { l: 'Letra', p: 'Palavra', n: 'Linha' };
const VE_TXA_ORD = { normal: 'Normal', inverso: 'Inversa', centro: 'Do centro', aleatorio: 'Aleatória' };

function veTxaObj(p, antigo) {
    const d = VE_TXA[p];
    return Object.assign({ p, d: d.d, un: d.un, ord: 'normal', sob: d.sob }, antigo && antigo.p === p ? antigo : {});
}
const veTxaTem = c => !!(c && c.txa && ((c.txa.in && VE_TXA[c.txa.in.p]) || (c.txa.out && VE_TXA[c.txa.out.p])));

// ── divisão do texto em letras com posição (px do desenho, antes da escala f) ──
const VETXA = { lay: new Map(), cache: new Map(), cards: new Map(), chaveCtl: '' };

function veTxaLayout(x) {
    const k = JSON.stringify(x);
    let r = VETXA.lay.get(k);
    if (r) return r;
    const L = veTxLayout(x);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = veTxFonte(x, x.tam);
    ctx.letterSpacing = (x.esp / 1000 * x.tam) + 'px';
    const chars = [];
    let iL = 0, iP = 0;
    L.linhas.forEach((linha, k) => {
        const cs = Array.from(linha), lw = L.larg[k];
        const x0 = x.alin === 'left' ? L.m : x.alin === 'right' ? L.m + L.tw - lw : L.m + (L.tw - lw) / 2;
        const base = L.m + L.asc + k * L.lh;
        let noEspaco = true;
        cs.forEach((ch, j) => {
            const esp = !ch.trim();
            if (esp) { if (!noEspaco) iP++; noEspaco = true; return; }
            noEspaco = false;
            const px = x0 + ctx.measureText(cs.slice(0, j).join('')).width;
            chars.push({ ch, x: px, w: ctx.measureText(ch).width, base, linha: k, iL: iL++, iP, j, nLinha: cs.length });
        });
        if (!noEspaco) iP++;
    });
    r = { L, chars, nL: iL, nP: Math.max(1, iP), nN: L.linhas.length };
    VETXA.lay.set(k, r);
    if (VETXA.lay.size > 40) VETXA.lay.delete(VETXA.lay.keys().next().value);
    return r;
}

// Ordem de cada unidade (0 = primeira): normal, inversa, do centro para fora, aleatória (sempre a mesma)
function veTxaOrdem(n, ord, semente) {
    const idx = Array.from({ length: n }, (_, i) => i);
    if (ord === 'inverso') return idx.map(i => n - 1 - i);
    if (ord === 'centro') {
        const m = (n - 1) / 2, rank = [...idx].sort((a, b) => Math.abs(a - m) - Math.abs(b - m) || a - b);
        const out = []; rank.forEach((i, r) => { out[i] = r; }); return out;
    }
    if (ord === 'aleatorio') {
        let s = semente >>> 0 || 1;
        const rnd = () => { s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917); return ((s ^= s >>> 16) >>> 0) / 4294967296; };
        const perm = [...idx];
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
        const out = []; perm.forEach((i, r) => { out[i] = r; }); return out;
    }
    return idx;
}

function veTxaSemente(txt) { let h = 2166136261; for (let i = 0; i < txt.length; i++) h = Math.imul(h ^ txt.charCodeAt(i), 16777619); return h >>> 0; }

// Estado de cada letra no instante tl (s desde o início do clipe) de um clipe com duração len. null = parado.
function veTxaEstados(x, txa, tl, len) {
    const lay = veTxaLayout(x), ativos = [];
    if (txa.in && VE_TXA[txa.in.p] && tl < txa.in.d) ativos.push({ a: txa.in, t: tl, saida: false });
    if (txa.out && VE_TXA[txa.out.p] && len - tl < txa.out.d) ativos.push({ a: txa.out, t: Math.max(0, len - tl), saida: true });
    if (!ativos.length) return null;
    const est = lay.chars.map(() => ({ op: 1, dx: 0, dy: 0, sc: 1, rot: 0, blur: 0, trk: 0, mask: false, dec: false }));
    let cursor = null;
    ativos.forEach(({ a, t, saida }) => {
        const P = VE_TXA[a.p], un = VE_TXA_UN[a.un] ? a.un : P.un, ease = VE_TXA_EASE[P.ease] || VE_TXA_EASE.lin;
        const n = un === 'l' ? lay.nL : un === 'p' ? lay.nP : lay.nN;
        const ord = veTxaOrdem(n, a.ord, veTxaSemente(x.t));
        const sob = Math.max(0, Math.min(1, a.sob == null ? P.sob : +a.sob)), D = Math.max(0.05, +a.d || P.d);
        const du = D / (1 + (n - 1) * (1 - sob)), passo = du * (1 - sob);
        let ultimo = -1;
        lay.chars.forEach((ch, i) => {
            const k = un === 'l' ? ch.iL : un === 'p' ? ch.iP : ch.linha;
            // saída: as primeiras unidades saem primeiro; máquina de escrever apaga do fim (backspace)
            const r = saida && !P.saidaDoFim ? n - 1 - ord[k] : ord[k];
            const u = veTxaClamp((t - r * passo) / du);
            const s = P.fn(ease(u), u), e = est[i];
            if (s.op != null) e.op *= veTxaClamp(s.op);
            e.dx += s.dx || 0; e.dy += s.dy || 0; e.rot += s.rot || 0; e.blur += s.blur || 0; e.trk += s.trk || 0;
            if (s.sc != null) e.sc *= s.sc;
            if (s.mask) e.mask = true;
            if (s.dec) e.dec = true;
            if (P.cursor && u > 0 && (ultimo < 0 || ch.iL > lay.chars[ultimo].iL)) ultimo = i;
        });
        if (P.cursor && t < D) cursor = { i: ultimo };
    });
    return { est, cursor };
}

// Margem em volta do desenho para as letras que saem da caixa (deslocamento, escala, espaçamento)
function veTxaPad(x, txa) {
    const lay = veTxaLayout(x);
    let em = 0.6, trk = 0;
    [txa.in, txa.out].forEach(a => {
        if (!a || !VE_TXA[a.p]) return;
        em = Math.max(em, 1.35);
        if (VE_TXA[a.p].trk) trk = Math.max(trk, VE_TXA[a.p].trk * x.tam * Math.max(...lay.L.linhas.map(l => Array.from(l).length)) / 2);
    });
    return Math.ceil(x.tam * em + trk);
}

const VE_TXA_DEC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=?';

// Desenho com as letras animadas. estados = null → texto parado (mesmo tamanho de quadro da animação)
function veTxaDesenho(x, f, txa, estados, tl) {
    const lay = veTxaLayout(x), L = lay.L, pad = veTxaPad(x, txa);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil((L.w + 2 * pad) * f));
    cv.height = Math.max(1, Math.ceil((L.h + 2 * pad) * f));
    cv._pad = pad;
    const ctx = cv.getContext('2d');
    ctx.scale(f, f);
    ctx.translate(pad, pad);
    const est = estados ? estados.est : null;
    const opMax = est ? est.reduce((m, e) => Math.max(m, e.op), 0) : 1;
    if (x.fOn && opMax > 0) {
        ctx.save();
        ctx.globalAlpha = opMax;
        ctx.fillStyle = veTxRGBA(x.fCor, x.fOp / 100);
        const r = Math.min(x.fRaio, (L.th + 2 * x.fPad) / 2);
        ctx.beginPath();
        ctx.roundRect(L.m - x.fPad, L.m - x.fPad, L.tw + 2 * x.fPad, L.th + 2 * x.fPad, Math.max(0, r));
        ctx.fill();
        ctx.restore();
    }
    ctx.font = veTxFonte(x, x.tam);
    ctx.letterSpacing = (x.esp / 1000 * x.tam) + 'px';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const em = x.tam, meio = L.asc * 0.35;   // centro aproximado da letra (acima da linha de base)
    const semente = veTxaSemente(x.t), quadro = Math.floor((tl || 0) * 20);
    lay.chars.forEach((c, i) => {
        const e = est ? est[i] : null;
        if (e && e.op <= 0.001) return;
        let ch = c.ch;
        if (e && e.dec) {
            const h = Math.imul(semente ^ (i * 2654435761), 1 + quadro) >>> 0;
            ch = VE_TXA_DEC[h % VE_TXA_DEC.length];
        }
        const trk = e && e.trk ? (c.j - (c.nLinha - 1) / 2) * e.trk * em : 0;
        const cx = c.x + c.w / 2 + trk + (e ? e.dx * em : 0), cy = c.base - meio + (e ? e.dy * em : 0);
        ctx.save();
        if (e && e.mask) {
            ctx.beginPath();
            ctx.rect(-pad, c.base - L.asc - em * 0.08, L.w + 2 * pad, L.asc + L.desc + em * 0.16);
            ctx.clip();
        }
        if (e) ctx.globalAlpha = veTxaClamp(e.op);
        ctx.translate(cx, cy);
        if (e && e.rot) ctx.rotate(e.rot * Math.PI / 180);
        if (e && e.sc !== 1) ctx.scale(Math.max(0.0001, e.sc), Math.max(0.0001, e.sc));
        if (e && e.blur > 0.001) ctx.filter = `blur(${(e.blur * em * f).toFixed(2)}px)`;
        const dx = -c.w / 2, dy = meio;
        const sombra = on => {
            if (on && x.sOn) {
                ctx.shadowColor = veTxRGBA(x.sCor, x.sOp / 100);
                ctx.shadowBlur = x.sBlur * f;
                const [sx, sy] = veTxSombraOff(x);
                ctx.shadowOffsetX = sx * f;
                ctx.shadowOffsetY = sy * f;
            } else ctx.shadowColor = 'transparent';
        };
        if (x.cOn && x.cLarg > 0) {
            sombra(true);
            ctx.lineJoin = 'round';
            ctx.lineWidth = x.cLarg * 2;
            ctx.strokeStyle = x.cCor;
            ctx.strokeText(ch, dx, dy);
            sombra(false);
        } else sombra(true);
        ctx.fillStyle = x.cor;
        ctx.fillText(ch, dx, dy);
        ctx.restore();
    });
    // cursor da máquina de escrever: depois da última letra que já apareceu
    if (estados && estados.cursor) {
        const c = estados.cursor.i >= 0 ? lay.chars[estados.cursor.i] : lay.chars[0];
        if (c) {
            const xc = estados.cursor.i >= 0 ? c.x + c.w + em * 0.04 : c.x;
            ctx.fillStyle = x.cor;
            ctx.fillRect(xc, c.base - L.asc * 0.82, Math.max(2, em * 0.06), L.asc * 0.95);
        }
    }
    return { cv, pad, w: L.w + 2 * pad, h: L.h + 2 * pad };
}

// ── prévia (monitor): quadro animado do clipe no instante T, ou null se o texto está parado ──
function veTxaCanvas(c, alvo, T = VE.playhead) {
    if (!veTxaTem(c)) return null;
    const o = c._o || c, len = veLen(o), tl = T - o.st;
    const x = veTxt(c), fps = VE.fps || 30;
    const tq = Math.round(tl * fps) / fps;   // um desenho por quadro da sequência
    const est = veTxaEstados(x, c.txa, tq, len);
    if (!est) return null;
    const f = Math.min(4, Math.max(0.25, Math.ceil((alvo || 1) * 4) / 4));
    const k = JSON.stringify([x, c.txa, f, Math.round(tq * fps), +len.toFixed(3)]);
    let r = VETXA.cache.get(k);
    if (!r) {
        r = veTxaDesenho(x, f, c.txa, est, tq).cv;
        VETXA.cache.set(k, r);
        if (VETXA.cache.size > 90) VETXA.cache.delete(VETXA.cache.keys().next().value);
    }
    return r;
}

// ── exportação: quadros animados em PNG + o trecho parado num PNG só → lista do demuxer concat ──
async function veTxaExportar(c, f) {
    const api = window.pywebview.api, x = veTxt(c), fps = VE.fps || 30, len = veLen(c), txa = c.txa;
    const dIn = txa.in && VE_TXA[txa.in.p] ? Math.min(len, +txa.in.d || 0) : 0;
    const dOut = txa.out && VE_TXA[txa.out.p] ? Math.min(len, +txa.out.d || 0) : 0;
    const total = Math.max(1, Math.round(len * fps));
    const kIn = Math.min(total, Math.ceil(dIn * fps)), kOut = Math.max(kIn, total - Math.ceil(dOut * fps));
    const salvar = async cv => { const r = await api.ve_salvar_png(cv.toDataURL('image/png')); if (!r || !r.success) throw new Error('png'); return r.path; };
    const entradas = [];
    let primeiro = null;
    const quadro = async k => {
        const tl = k / fps, est = veTxaEstados(x, txa, tl, len);
        const d = veTxaDesenho(x, f, txa, est, tl);
        if (!primeiro) primeiro = d;
        return salvar(d.cv);
    };
    for (let k = 0; k < kIn; k++) entradas.push([await quadro(k), 1 / fps]);
    if (kOut > kIn) {
        const d = veTxaDesenho(x, f, txa, null, 0);
        if (!primeiro) primeiro = d;
        entradas.push([await salvar(d.cv), (kOut - kIn) / fps]);
    }
    for (let k = kOut; k < total; k++) entradas.push([await quadro(k), 1 / fps]);
    const r = await api.ve_txa_lista(entradas);
    if (!r || !r.success) throw new Error((r && r.error) || 'lista');
    return { path: entradas[0][0], seq: r.path, f, w: primeiro.cv.width, h: primeiro.cv.height };
}

// ── timeline: faixa colorida no começo/fim do clipe de texto mostrando a entrada/saída ──
function veTxaDesenharTl(ctx, rows, X) {
    VE.clips.forEach(c => {
        if (!veIsTexto(c) || !veTxaTem(c)) return;
        const r = rows.find(r => r.id === 'V' + (c.tr + 1));
        if (!r) return;
        const y = r.y + 3, h = r.h - 6, x1 = X(c.st), x2 = X(veEnd(c));
        ctx.save();
        ctx.beginPath(); ctx.rect(x1, y, x2 - x1, h); ctx.clip();
        [['in', 1], ['out', -1]].forEach(([lado, s]) => {
            const a = c.txa[lado];
            if (!a || !VE_TXA[a.p]) return;
            const w = Math.min(x2 - x1, a.d * VE.pps), x0 = s > 0 ? x1 : x2 - w;
            const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
            g.addColorStop(s > 0 ? 0 : 1, 'rgba(244,114,182,0.55)');
            g.addColorStop(s > 0 ? 1 : 0, 'rgba(244,114,182,0.05)');
            ctx.fillStyle = g;
            ctx.fillRect(x0, y + 14, w, h - 14);
            if (w > 26 && h > 28) {
                ctx.fillStyle = '#fde2f0';
                ctx.font = '700 9px Cascadia Mono, Consolas, monospace';
                ctx.fillText(s > 0 ? 'T▸' : '◂T', s > 0 ? x0 + 3 : x0 + w - 16, y + h - 4);
            }
        });
        ctx.restore();
    });
}

// ── aplicar ──
function veTxaAplicar(c, lado, p) {
    if (!c || !veIsTexto(c)) { veToast('Animações de texto vão em clipes de texto (ferramenta T)'); return; }
    if (veLocked(c)) { veAvisoBloqueio(); return; }
    if (!VE_TXA[p]) return;
    vePushHistory();
    const antes = c.txa && c.txa[lado];
    c.txa = { ...(c.txa || {}), [lado]: veTxaObj(p, antes) };
    // entrada + saída maiores que o clipe: encurta a que acabou de entrar
    const len = veLen(c), outro = c.txa[lado === 'in' ? 'out' : 'in'];
    if (c.txa[lado].d + (outro ? outro.d : 0) > len) c.txa[lado].d = Math.max(0.1, Math.round((len - (outro ? outro.d : 0)) * 100) / 100);
    VE.sel = VE.clips.indexOf(c);
    veRefresh();
    veToast(`${veT(VE_TXA[p].nome)} na ${lado === 'in' ? 'entrada' : 'saída'} do texto`);
    if (!VE.playing) veSeek(lado === 'in' ? c.st : Math.max(c.st, veEnd(c) - c.txa[lado].d));
}

function veTxaMudar(lado, campo, valor) {
    const c = VE.clips[VE.sel];
    if (!c || !c.txa || !c.txa[lado]) return;
    if (veLocked(c)) { veAvisoBloqueio(); return; }
    vePushHistory();
    const a = { ...c.txa[lado] };
    if (campo === 'p') {
        if (!valor) { const t = { ...c.txa }; delete t[lado]; c.txa = t; if (!veTxaTem(c)) delete c.txa; veRefresh(); return; }
        Object.assign(a, veTxaObj(valor), { d: a.d });
    } else if (campo === 'd') a.d = Math.max(0.1, Math.min(veLen(c), +valor || a.d));
    else if (campo === 'sob') a.sob = Math.max(0, Math.min(1, +valor / 100));
    else a[campo] = valor;
    c.txa = { ...c.txa, [lado]: a };
    veRefresh();
}

// ── painel Transições: seção "Texto" ──
const VE_TXA_CARD_TXT = 'Texto animado';
function veTxaCardDesenhar(cv, p, tl) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, W, H);
    const x = Object.assign({}, VE_TX_PADRAO, { t: VE_TXA_CARD_TXT, fonte: 'Segoe UI', tam: 30, neg: true, cor: '#ffffff' });
    const P = VE_TXA[p], txa = { in: veTxaObj(p) };
    const est = veTxaEstados(x, txa, tl, 99);
    const d = veTxaDesenho(x, 1, txa, est, tl);
    // escala pelo texto sem a margem da animação (a margem pode ser grande no Espaçamento)
    const k = Math.min((W * 0.86) / (d.w - 2 * d.pad), (H * 0.8) / (d.h - 2 * d.pad));
    g.drawImage(d.cv, (W - d.w * k) / 2, (H - d.h * k) / 2, d.w * k, d.h * k);
    return P;
}
function veTxaCardParado(el) { veTxaCardDesenhar(el.querySelector('canvas'), el.dataset.txa, VE_TXA[el.dataset.txa].d * 0.55); }
function veTxaCardAnimar(el) {
    if (VETXA.cards.has(el)) return;
    const win = el.ownerDocument.defaultView, t0 = performance.now(), p = el.dataset.txa, D = VE_TXA[p].d;
    const passo = () => {
        if (!VETXA.cards.has(el)) return;
        const ciclo = D + 1.4, t = ((performance.now() - t0) / 1000) % ciclo;
        veTxaCardDesenhar(el.querySelector('canvas'), p, Math.max(0, t - 0.25));
        VETXA.cards.set(el, win.requestAnimationFrame(passo));
    };
    VETXA.cards.set(el, win.requestAnimationFrame(passo));
}
function veTxaCardParar(el) {
    const id = VETXA.cards.get(el);
    if (id == null) return;
    el.ownerDocument.defaultView.cancelAnimationFrame(id);
    VETXA.cards.delete(el);
    veTxaCardParado(el);
}

function veTxaRenderList() {
    const box = $ve('ve-txa-list');
    if (!box) return;
    const q = (($ve('ve-tr-q') || {}).value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    [...VETXA.cards.keys()].forEach(veTxaCardParar);
    const lista = Object.entries(VE_TXA).filter(([p, d]) => !q || (veT(d.nome) + ' ' + d.nome + ' ' + d.tag + ' texto text').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    box.innerHTML = lista.map(([p, d]) => `<div class="ve-tr-card ve-txa-card" data-txa="${p}" title="Com um texto selecionado: clique põe na entrada · Alt+clique na saída · ou arraste até o clipe de texto (começo = entrada, fim = saída)">
        <canvas width="224" height="126"></canvas><span>${d.nome}</span><small>${d.tag}</small></div>`).join('');
    const sec = $ve('ve-txa-sec');
    if (sec) sec.hidden = !lista.length;
    box.querySelectorAll('[data-txa]').forEach(veTxaCardParado);
    veTxaRenderControls(true);
}

// Controles da animação do texto selecionado (entrada e saída)
function veTxaRenderControls(forcar) {
    const box = $ve('ve-txa-controls');
    if (!box) return;
    const c = VE.clips[VE.sel], ok = c && veIsTexto(c);
    const chave = ok ? VE.sel + '|' + JSON.stringify(c.txa || null) + '|' + veLen(c).toFixed(2) : '';
    if (!forcar && chave === VETXA.chaveCtl) return;
    VETXA.chaveCtl = chave;
    if (!ok) { box.innerHTML = '<div class="ve-txa-dica">Selecione um clipe de texto para animar (ou arraste um card até ele).</div>'; return; }
    const opts = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${n}</option>`).join('');
    const linha = (lado, rotulo) => {
        const a = c.txa && c.txa[lado], P = a && VE_TXA[a.p];
        const presets = '<option value="">Nenhuma</option>' + Object.entries(VE_TXA).map(([k, d]) => `<option value="${k}"${a && a.p === k ? ' selected' : ''}>${d.nome}</option>`).join('');
        return `<div class="ve-txa-bloco" data-lado="${lado}">
            <div class="ve-txa-row"><b>${rotulo}</b><select data-txa-c="p">${presets}</select></div>
            ${P ? `<div class="ve-txa-row"><span>Duração</span><input type="number" data-txa-c="d" min="0.1" step="0.1" value="${(+a.d).toFixed(2)}"><em>s</em>
                <span>Por</span><select data-txa-c="un">${opts(VE_TXA_UN, a.un)}</select></div>
            <div class="ve-txa-row"><span>Ordem</span><select data-txa-c="ord">${opts(VE_TXA_ORD, a.ord)}</select>
                <span title="Sobreposição: 0 = uma unidade de cada vez · 100 = todas juntas">Sobrepor</span><input type="range" data-txa-c="sob" min="0" max="100" step="5" value="${Math.round((a.sob ?? P.sob) * 100)}"></div>` : ''}
        </div>`;
    };
    box.innerHTML = linha('in', 'Entrada') + linha('out', 'Saída');
}

function veTxaAlvoEvento(ev, doc) {
    const wrap = $ve('ve-tl-wrap'), tdoc = wrap && wrap.ownerDocument;
    if (!tdoc) return null;
    let x = ev.clientX, y = ev.clientY;
    if (tdoc !== doc) {
        const tw = tdoc.defaultView, borda = (tw.outerWidth - tw.innerWidth) / 2;
        x = ev.screenX - tw.screenX - borda;
        y = ev.screenY - tw.screenY - (tw.outerHeight - tw.innerHeight - borda);
    }
    const i = veClipAtClient(x, y, tdoc), c = VE.clips[i];
    if (!c || !veIsTexto(c)) return null;
    const r = wrap.getBoundingClientRect(), t = VE.view + (x - r.left) / VE.pps;
    return { c, lado: t - c.st <= veEnd(c) - t ? 'in' : 'out' };
}

function veTxaInit() {
    const box = $ve('ve-txa-list'), ctl = $ve('ve-txa-controls');
    if (!box) return;
    veTxaRenderList();
    const q = $ve('ve-tr-q');
    if (q) q.addEventListener('input', veTxaRenderList);
    box.addEventListener('pointerover', e => { const el = e.target.closest('[data-txa]'); if (el) veTxaCardAnimar(el); });
    box.addEventListener('pointerout', e => { const el = e.target.closest('[data-txa]'); if (el && !el.contains(e.relatedTarget)) veTxaCardParar(el); });
    box.addEventListener('click', e => {
        const el = e.target.closest('[data-txa]');
        if (!el || el._arrastou) return;
        const c = VE.clips[VE.sel];
        if (!c || !veIsTexto(c)) { veToast('Selecione um clipe de texto (ou arraste o card até ele)'); return; }
        veTxaAplicar(c, e.altKey || e.shiftKey ? 'out' : 'in', el.dataset.txa);
    });
    // arrastar até um clipe de texto na timeline
    box.addEventListener('pointerdown', e => {
        const el = e.target.closest('[data-txa]');
        if (!el || e.button !== 0) return;
        el._arrastou = false;
        const doc = box.ownerDocument, win = doc.defaultView, p = el.dataset.txa;
        const d = { x0: e.clientX, y0: e.clientY, on: false, ghost: null };
        const move = ev => {
            if (!d.on) {
                if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return;
                d.on = true;
                el._arrastou = true;
                d.ghost = doc.createElement('div');
                d.ghost.className = 've-dghost';
                d.ghost.textContent = 'T  ' + veT(VE_TXA[p].nome);
                doc.body.appendChild(d.ghost);
                doc.body.classList.add('ve-fx-dragging');
            }
            d.ghost.style.left = ev.clientX + 12 + 'px';
            d.ghost.style.top = ev.clientY + 10 + 'px';
            const alvo = veTxaAlvoEvento(ev, doc);
            $ve('ve-tl-wrap').classList.toggle('fx-drop', !!alvo);
            if (d.ghost) d.ghost.textContent = 'T  ' + veT(VE_TXA[p].nome) + (alvo ? (alvo.lado === 'in' ? '  → entrada' : '  → saída') : '');
        };
        const up = ev => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            $ve('ve-tl-wrap').classList.remove('fx-drop');
            doc.body.classList.remove('ve-fx-dragging');
            if (!d.on) return;
            d.ghost.remove();
            const alvo = veTxaAlvoEvento(ev, doc);
            if (alvo) veTxaAplicar(alvo.c, alvo.lado, p);
            else veToast('Solte sobre um clipe de texto na timeline');
            setTimeout(() => { el._arrastou = false; }, 0);
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });
    if (ctl) {
        ctl.addEventListener('change', e => {
            const el = e.target.closest('[data-txa-c]'), bl = e.target.closest('[data-lado]');
            if (el && bl) veTxaMudar(bl.dataset.lado, el.dataset.txaC, el.value);
        });
        ctl.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
    }
}

document.addEventListener('DOMContentLoaded', veTxaInit);
