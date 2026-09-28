// =========================================================
// Pocket Editor — transições de vídeo (como as do Premiere / Film Impact)
// Ficam presas ao clipe: c.tin = {t, d} na entrada (no corte com o clipe de antes na mesma trilha, ou do nada
// se não houver), c.tout = {t, d} na saída de um clipe sem vizinho depois. d = duração em segundos.
// No corte a transição fica centrada (como no Premiere) e usa a mídia que sobra além dos pontos de corte;
// sem sobra suficiente ela se desloca/encurta (veTransJanela).
// Prévia e exportação usam a mesma conta: veTransVirtuais() devolve os clipes com os dois lados estendidos
// e a animação convertida em quadros-chave (posição, escala, opacidade) — o resto do editor não muda.
// =========================================================

const VE_TR_DUR = 1;   // duração padrão (s), como no Premiere
const veEaseIO = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const veEaseOut = u => 1 - Math.pow(1 - u, 3);
const veEaseBack = u => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2);   // passa do ponto e volta

// pausa = instante mostrado no cartão parado do painel (padrão: o meio).
// fn(u) → {a, b}: o que muda no clipe que sai (a) e no que entra (b). dx/dy em quadros, s = escala, op = 0..1.
// O que entra fica por cima do que sai.
const VE_TR = {
    dissolve: { nome: 'Dissolução cruzada', tag: 'Cross Dissolve', fn: u => ({ a: {}, b: { op: u } }) },
    push: { nome: 'Empurrar', tag: 'Push', fn: u => { const e = veEaseIO(u); return { a: { dx: -e }, b: { dx: 1 - e } }; } },
    slide: { nome: 'Deslizar', tag: 'Slide', fn: u => ({ a: {}, b: { dx: 1 - veEaseIO(u) } }) },
    pull: {
        nome: 'Puxar (zoom)', tag: 'Pull', pausa: 0.3,
        fn: u => ({ a: { s: 1 + 0.35 * veEaseIO(u) }, b: { s: 1 + 1.4 * (1 - veEaseOut(u)), op: Math.min(1, u * 2.5) } }),
    },
    pop: { nome: 'Pop', tag: 'Pop', pausa: 0.3, fn: u => ({ a: {}, b: { s: 0.15 + 0.85 * veEaseBack(u), op: Math.min(1, u * 4) } }) },
};

// Clipes de imagem que dão para transição (áudio e camada de ajuste não)
const veTransPode = c => !!c && !veIsAudio(c) && !veIsAdj(c);
const veVizAntes = c => VE.clips.find(o => o !== c && o.tr === c.tr && veTransPode(o) && Math.abs(veEnd(o) - c.st) < 1e-3);
const veVizDepois = c => VE.clips.find(o => o !== c && o.tr === c.tr && veTransPode(o) && Math.abs(o.st - veEnd(c)) < 1e-3);
// Mídia que sobra (em tempo da timeline) antes do início / depois do fim do clipe. Imagem e texto: à vontade.
const veSobra = (c, lado) => veIsImage(c) ? Infinity : lado === 'ini' ? c.s / veVel(c) : Math.max(0, veDurMidia(c) - c.e) / veVel(c);

// Trecho da timeline que a transição ocupa: {t, A, B, ws, we, c, lado} ou null
function veTransJanela(c, lado) {
    const tr = c && (lado === 'in' ? c.tin : c.tout);
    if (!tr || !VE_TR[tr.t] || !veTransPode(c)) return null;
    let d = Math.max(veFrame(), Math.min(tr.d || VE_TR_DUR, veLen(c)));
    if (lado === 'out') return { t: tr.t, A: c, B: null, ws: veEnd(c) - d, we: veEnd(c), c, lado };
    const A = veVizAntes(c);
    if (!A) return { t: tr.t, A: null, B: c, ws: c.st, we: c.st + d, c, lado };
    const cut = c.st, hA = veSobra(A, 'fim'), hB = veSobra(c, 'ini');
    d = Math.min(d, veLen(A), hA + hB);
    if (d < veFrame() * 0.99) return null;
    const lo = Math.max(cut - hB, cut - d), hi = Math.min(cut, cut + hA - d);
    const ws = Math.min(Math.max(cut - d / 2, lo), hi);
    return { t: tr.t, A, B: c, ws, we: ws + d, c, lado };
}

function veTransLista() {
    const out = [];
    VE.clips.forEach(c => {
        if (c.tin) { const j = veTransJanela(c, 'in'); if (j) out.push(j); }
        if (c.tout) { const j = veTransJanela(c, 'out'); if (j) out.push(j); }
    });
    return out;
}
const veTransAtiva = t => VE.clips.some(c => c.tin || c.tout) && veTransLista().some(j => t >= j.ws - VE_EPS && t <= j.we + VE_EPS);

// Efeito da transição no instante T para o papel ('a' sai / 'b' entra)
function veTransFx(j, papel, T) {
    const u = Math.min(1, Math.max(0, (T - j.ws) / (j.we - j.ws))), fn = VE_TR[j.t].fn;
    if (papel === 'a' && !j.B) return fn(1 - u).b;   // saída para o nada: o contrário da entrada
    return fn(u)[papel] || {};
}

// Clipes com as transições aplicadas: os envolvidos viram cópias (só a imagem; o som fica numa cópia à parte,
// no lugar de sempre) estendidas pela mídia que sobra e com quadros-chave da animação. c._o = clipe original.
function veTransVirtuais() {
    const lista = veTransLista();
    if (!lista.length) return VE.clips;
    const mapa = new Map(), W = VE.seqW, H = VE.seqH, passo = veFrame();
    const virt = c => {
        if (!mapa.has(c)) {
            const v = JSON.parse(JSON.stringify(c));
            v._o = c; v._tr = []; v._base = JSON.parse(JSON.stringify(c));
            if (!v.x && !veIsImage(c) && veTemSom(c)) v.x = 'v';
            mapa.set(c, v);
        }
        return mapa.get(c);
    };
    lista.forEach(j => {
        if (j.B) {
            const v = virt(j.B);
            if (j.ws < v.st) { v.s -= (v.st - j.ws) * veVel(v); v.st = j.ws; }
            v._tr.push([j, 'b']);
        }
        if (j.A) {
            const v = virt(j.A);
            if (j.we > veEnd(v)) v.e += (j.we - veEnd(v)) * veVel(v);
            v._tr.push([j, 'a']);
        }
    });
    mapa.forEach(v => {
        // valores originais (sem a transição) em cada instante, a partir do clipe como era, reposicionado
        const base = Object.assign(v._base, { st: v.st, s: v.s, e: v.e });
        const ts = new Set();
        v._tr.forEach(([j]) => {
            for (let T = j.ws; T < j.we; T += passo) ts.add(+T.toFixed(4));
            ts.add(+j.ws.toFixed(4)); ts.add(+j.we.toFixed(4));
        });
        VE_KF_PROPS.forEach(k => { if (veKfOn(base, k)) base.k[k].forEach(q => ts.add(+veTlAt(base, q.t).toFixed(4))); });
        const tempos = [...ts].sort((a, b) => a - b);
        const k = {};
        ['sc', 'x', 'y', 'op'].forEach(p => { k[p] = []; });
        tempos.forEach(T => {
            const p = veProps(base, T);
            let x = p.x, y = p.y, sc = p.sc, op = p.op;
            v._tr.forEach(([j, papel]) => {
                if (T < j.ws - VE_EPS || T > j.we + VE_EPS) return;
                const f = veTransFx(j, papel, T), s = f.s == null ? 1 : f.s;
                x = W / 2 + (f.dx || 0) * W + s * (x - W / 2);
                y = H / 2 + (f.dy || 0) * H + s * (y - H / 2);
                sc *= s;
                op *= f.op == null ? 1 : f.op;
            });
            const t = Math.round(veSrcAt(v, T) * 1e4) / 1e4;
            k.sc.push({ t, v: sc, i: 'lin' }); k.x.push({ t, v: x, i: 'lin' });
            k.y.push({ t, v: y, i: 'lin' }); k.op.push({ t, v: op, i: 'lin' });
        });
        v.k = Object.assign({}, v.k || {}, k);
        delete v._base;
    });
    // o som dos clipes que viraram só imagem continua numa cópia no trecho original
    const sons = [...mapa.values()].filter(v => v.x === 'v' && !v._o.x).map(v => ({ ...v._o, x: 'a' }));
    return VE.clips.map(c => mapa.get(c) || c).concat(sons);
}

// ── adicionar / remover / duração ──
function veTransAdd(c, lado, t) {
    if (!veTransPode(c)) { veToast('Transições de vídeo não se aplicam a áudio nem a camada de ajuste'); return; }
    if (veLocked(c)) { veAvisoBloqueio(); return; }
    vePushHistory();
    c[lado === 'in' ? 'tin' : 'tout'] = { t, d: VE_TR_DUR };
    const j = veTransJanela(c, lado);
    if (!j) {
        veUndo();
        veToast('Sem mídia sobrando nos dois lados do corte para a transição');
        return;
    }
    VE.trSel = { c, lado };
    VE.sel = -1;
    veRefresh();
    const d = j.we - j.ws;
    veToast(`${VE_TR[t].nome} (${veShort(d)})` + (d < VE_TR_DUR - 0.01 ? ' · encurtada: pouca mídia sobrando' : ''));
}

function veTransSelecionada() {
    const s = VE.trSel;
    return s && VE.clips.includes(s.c) && s.c[s.lado === 'in' ? 'tin' : 'tout'] ? s : null;
}

function veTransApagar() {
    const s = veTransSelecionada();
    if (!s) return false;
    if (veLocked(s.c)) { veAvisoBloqueio(); return true; }
    vePushHistory();
    delete s.c[s.lado === 'in' ? 'tin' : 'tout'];
    VE.trSel = null;
    veRefresh();
    veToast('Transição apagada');
    return true;
}

// ── timeline: desenho, clique e arrastar a borda (duração) ──
function veTransRetangulo(j, rows) {
    const r = rows.find(r => r.id === 'V' + (j.c.tr + 1));
    if (!r) return null;
    const x1 = (j.ws - VE.view) * VE.pps, x2 = (j.we - VE.view) * VE.pps;
    const w = Math.max(8, x2 - x1), x = x2 - x1 < 8 ? (x1 + x2) / 2 - 4 : x1;
    return { x, w, y: r.y + r.h - Math.min(22, r.h - 8) - 3, h: Math.min(22, r.h - 8) };
}

function veTransDesenhar(ctx, rows) {
    const sel = veTransSelecionada(), lista = veTransLista();
    const hov = VE.trHover && VE.trHover.prev;
    if (hov) lista.push(Object.assign(hov, { _prev: true }));
    lista.forEach(j => {
        const b = veTransRetangulo(j, rows);
        if (!b || b.x > ctx.canvas.width || b.x + b.w < 0) return;
        const on = sel && sel.c === j.c && sel.lado === j.lado;
        ctx.save();
        ctx.globalAlpha = j._prev ? 0.7 : 1;
        ctx.fillStyle = 'rgba(30,24,60,0.88)';
        veRoundRect(ctx, b.x, b.y, b.w, b.h, 3); ctx.fill();
        // diagonal, como o bloco de transição do Premiere
        ctx.strokeStyle = 'rgba(196,181,253,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (!j.A) { ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y); }
        else if (!j.B) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); }
        else { ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); }
        ctx.stroke();
        ctx.strokeStyle = on ? '#F97316' : j._prev ? '#c4b5fd' : '#8b5cf6';
        ctx.lineWidth = on ? 2 : 1;
        if (j._prev) ctx.setLineDash([4, 3]);
        veRoundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 3); ctx.stroke();
        if (b.w > 46) {
            ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
            ctx.fillStyle = '#ede9fe';
            ctx.font = '600 10px Segoe UI';
            const txt = veT(VE_TR[j.t].nome), tw = ctx.measureText(txt).width;
            ctx.fillStyle = 'rgba(30,24,60,0.9)';
            ctx.fillRect(b.x + b.w / 2 - tw / 2 - 4, b.y + b.h / 2 - 7, tw + 8, 13);
            ctx.fillStyle = '#ede9fe';
            ctx.fillText(txt, b.x + b.w / 2 - tw / 2, b.y + b.h / 2 + 3.5);
        }
        ctx.restore();
    });
}

// Transição sob o ponto (x, y do canvas): {c, lado, j, borda: 'l'|'r'|null}
function veTransAt(x, y) {
    const rows = veTrackRows();
    for (const j of veTransLista()) {
        const b = veTransRetangulo(j, rows);
        if (!b || y < b.y || y > b.y + b.h || x < b.x - 3 || x > b.x + b.w + 3) continue;
        const borda = b.w >= 14 && Math.abs(x - b.x) <= 4 ? 'l' : b.w >= 14 && Math.abs(x - b.x - b.w) <= 4 ? 'r' : null;
        return { c: j.c, lado: j.lado, j, borda };
    }
    return null;
}

// Clique numa transição: seleciona; pela borda, arrastar muda a duração
function veTransPointer(hit, t) {
    VE.trSel = { c: hit.c, lado: hit.lado };
    VE.sel = -1;
    VETX.legSel = -1;
    if (hit.borda && !veLocked(hit.c)) {
        const j = hit.j;
        // ponto fixo: no corte fica o centro; do nada / para o nada, a borda do clipe
        const fixo = !j.A ? j.ws : !j.B ? j.we : (j.ws + j.we) / 2;
        VE.drag = { mode: 'trdur', c: hit.c, lado: hit.lado, fixo, meio: !!(j.A && j.B), started: false };
    }
    veRefresh();
}

function veTransArrastar(t) {
    const d = VE.drag;
    if (!d.started) { vePushHistory(); d.started = true; }
    const dur = Math.min(10, Math.max(veFrame(), Math.abs(veSnapFrame(t) - d.fixo) * (d.meio ? 2 : 1)));
    d.c[d.lado === 'in' ? 'tin' : 'tout'].d = Math.round(dur * 1000) / 1000;
    veDraw();
    veDrawMonitorSoon();
}

// ── arrastar do painel Efeitos: onde a transição cairia ──
// Metade inicial do clipe = entrada dele; metade final = entrada do próximo (ou saída, se não houver próximo)
function veTransAlvo(x, y, doc) {
    const i = veClipAtClient(x, y, doc);
    const c = VE.clips[i];
    if (!veTransPode(c)) return null;
    const r = $ve('ve-tl-wrap').getBoundingClientRect(), t = VE.view + (x - r.left) / VE.pps;
    if (t - c.st <= veEnd(c) - t) return { c, lado: 'in' };
    const n = veVizDepois(c);
    return n ? { c: n, lado: 'in' } : { c, lado: 'out' };
}

// Mostra na timeline onde a transição vai ficar enquanto arrasta
function veTransHover(alvo, t) {
    const velho = VE.trHover;
    if (!alvo) { VE.trHover = null; if (velho) veDraw(); return; }
    if (velho && velho.c === alvo.c && velho.lado === alvo.lado) return;
    const campo = alvo.lado === 'in' ? 'tin' : 'tout', antes = alvo.c[campo];
    alvo.c[campo] = { t, d: VE_TR_DUR };
    alvo.prev = veTransJanela(alvo.c, alvo.lado);
    if (antes) alvo.c[campo] = antes; else delete alvo.c[campo];
    VE.trHover = alvo;
    veDraw();
}

// ── prévia: players fixos ──
// Cada clipe envolvido numa transição fica com o MESMO player do começo ao fim, e ele se prepara ~1 s antes
// (o que entra espera parado no primeiro quadro; o que sai já toca junto). Trocar de player no meio obrigava a
// buscar o quadro e a imagem piscava ao começar a transição e no corte.
const VE_TR_PL0 = 16;          // VEX[VE_TR_PL0...] são das transições; os de antes, das camadas comuns
const VE_TR_PRE = 1.2;         // segundos de preparo antes da transição
const VETRP = { slot: new Map() };   // clipe original → nº do player

function veTransSoltar(fica) {
    VETRP.slot.forEach((n, o) => {
        if (fica.has(o)) return;
        VETRP.slot.delete(o);
        const x = VEX[VE_TR_PL0 + n];
        if (x && !x.paused) x.pause();
    });
}

// Devolve Map(clipe original → player) dos clipes de transição perto da agulha
function veTransPlayers(t, virt) {
    const mapa = new Map();
    if (!virt || virt === VE.clips) { veTransSoltar(new Set()); return mapa; }
    const pre = VE_TR_PRE * Math.max(1, VE.rate), precisa = new Set();
    veTransLista().filter(j => t >= j.ws - pre && t <= j.we + 0.05)
        .forEach(j => [j.A, j.B].forEach(c => { if (c && !veIsImage(c)) precisa.add(c); }));
    veTransSoltar(precisa);
    const porO = new Map(virt.filter(v => v._o && v._tr).map(v => [v._o, v]));
    precisa.forEach(o => {
        const v = porO.get(o);
        if (!v) return;
        let n = VETRP.slot.get(o);
        if (n == null) {
            const usados = new Set(VETRP.slot.values());
            for (n = 0; usados.has(n); n++);
            VETRP.slot.set(o, n);
        }
        const x = veExtraPlayer(VE_TR_PL0 + n, veMid(v));
        if (t < v.st - VE_EPS) {
            if (!x.paused) x.pause();
            const alvo = veSrcAt(v, v.st);
            if (x.readyState >= 1 && !x.seeking && Math.abs(x.currentTime - alvo) > 0.02) x.currentTime = alvo;
        } else if (t > veEnd(v) + VE_EPS) {
            if (!x.paused) x.pause();
        } else veSyncExtra(x, veSrcAt(v, t), veTaxa(v));
        mapa.set(o, x);
    });
    return mapa;
}

// ── painel Transições: cartões com o exemplo animado (ícone do Canivete) ao passar o mouse ──
const VETRV = { A: null, B: null, anim: new Map() };
const VE_TRV_W = 224, VE_TRV_H = 126;   // canvas 2x (aparece com 112×63)

// Os dois "clipes" do exemplo: o ícone apagado (sai) e o ícone colorido (entra)
function veTrvPrep() {
    if (VETRV.A) return;
    VETRV.A = 'carregando';
    const img = new Image();
    img.onload = () => {
        const faz = (fundo, filtro) => {
            const cv = document.createElement('canvas');
            cv.width = VE_TRV_W; cv.height = VE_TRV_H;
            const x = cv.getContext('2d');
            x.fillStyle = fundo; x.fillRect(0, 0, VE_TRV_W, VE_TRV_H);
            x.filter = filtro;
            const h = VE_TRV_H * 0.92;
            x.drawImage(img, (VE_TRV_W - h) / 2, (VE_TRV_H - h) / 2, h, h);
            return cv;
        };
        // fundo do colorido = a cor do canto do ícone (emenda sem borda)
        const px = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        px.drawImage(img, 0, 0, 8, 8, 0, 0, 1, 1);
        const [r, g, b] = px.getImageData(0, 0, 1, 1).data;
        VETRV.A = faz('#2a2f3a', 'grayscale(1) brightness(0.75)');
        VETRV.B = faz(`rgb(${r},${g},${b})`, 'none');
        veTrvTodos();
    };
    img.src = 'identidade/splash.png';
}

function veTrvDesenhar(cv, t, u) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height;
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H);
    if (!VETRV.B) return;
    const r = VE_TR[t].fn(u);
    [[VETRV.A, r.a], [VETRV.B, r.b]].forEach(([src, f]) => {
        f = f || {};
        const s = f.s == null ? 1 : f.s;
        x.save();
        x.globalAlpha = Math.max(0, Math.min(1, f.op == null ? 1 : f.op));
        x.translate(W / 2 + (f.dx || 0) * W, H / 2 + (f.dy || 0) * H);
        x.scale(s, s);
        x.drawImage(src, -W / 2, -H / 2, W, H);
        x.restore();
    });
}

// Parado: um instante que mostra a transição (o meio, ou o `pausa` dela)
const veTrvPausa = t => VE_TR[t].pausa ?? 0.5;
function veTrvTodos() {
    const box = $ve('ve-tr-list');
    if (box) box.querySelectorAll('[data-trt]').forEach(el => { if (!VETRV.anim.has(el)) veTrvDesenhar(el.querySelector('canvas'), el.dataset.trt, veTrvPausa(el.dataset.trt)); });
}

// Em loop: parado no A, transição de 1 s, parado no B
function veTrvAnimar(el) {
    if (VETRV.anim.has(el)) return;
    const win = el.ownerDocument.defaultView, cv = el.querySelector('canvas'), t0 = performance.now();
    const passo = () => {
        if (!VETRV.anim.has(el)) return;
        const c = ((performance.now() - t0) / 1000) % 2.2;
        veTrvDesenhar(cv, el.dataset.trt, Math.min(1, Math.max(0, c - 0.5)));
        VETRV.anim.set(el, win.requestAnimationFrame(passo));
    };
    VETRV.anim.set(el, win.requestAnimationFrame(passo));
}
function veTrvParar(el) {
    const id = VETRV.anim.get(el);
    if (id == null) return;
    el.ownerDocument.defaultView.cancelAnimationFrame(id);
    VETRV.anim.delete(el);
    veTrvDesenhar(el.querySelector('canvas'), el.dataset.trt, veTrvPausa(el.dataset.trt));
}

function veRenderTrList() {
    const box = $ve('ve-tr-list');
    if (!box) return;
    const q = ($ve('ve-tr-q').value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    [...VETRV.anim.keys()].forEach(veTrvParar);
    const lista = Object.entries(VE_TR).filter(([t, d]) => !q || (veT(d.nome) + ' ' + d.nome + ' ' + d.tag).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    box.innerHTML = lista.map(([t, d]) => `<div class="ve-tr-card" data-trt="${t}" title="Arraste até o corte entre dois clipes (ou o início/fim de um clipe) · duplo clique põe na entrada do clipe selecionado">
        <canvas width="${VE_TRV_W}" height="${VE_TRV_H}"></canvas><span>${d.nome}</span><small>${d.tag}</small></div>`).join('')
        || '<div class="ve-clips-empty">Nenhuma transição encontrada.</div>';
    veTrvPrep();
    veTrvTodos();
}

// Ponto do evento (na janela do painel) → alvo na timeline, que pode estar em outra janela
function veTrAlvoEvento(ev, doc) {
    const wrap = $ve('ve-tl-wrap'), tdoc = wrap && wrap.ownerDocument;
    if (!tdoc) return null;
    if (tdoc === doc) return veTransAlvo(ev.clientX, ev.clientY, doc);
    const tw = tdoc.defaultView, borda = (tw.outerWidth - tw.innerWidth) / 2;
    return veTransAlvo(ev.screenX - tw.screenX - borda, ev.screenY - tw.screenY - (tw.outerHeight - tw.innerHeight - borda), tdoc);
}

function veTrInit() {
    const box = $ve('ve-tr-list');
    if (!box) return;
    veRenderTrList();
    $ve('ve-tr-q').addEventListener('input', veRenderTrList);
    $ve('ve-tr-q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; veRenderTrList(); e.target.blur(); } e.stopPropagation(); });
    box.addEventListener('pointerover', e => { const el = e.target.closest('[data-trt]'); if (el) veTrvAnimar(el); });
    box.addEventListener('pointerout', e => {
        const el = e.target.closest('[data-trt]');
        if (el && !el.contains(e.relatedTarget)) veTrvParar(el);
    });
    box.addEventListener('dblclick', e => {
        const el = e.target.closest('[data-trt]');
        if (!el) return;
        if (VE.sel < 0) { veToast('Selecione um clipe na timeline (ou arraste a transição até o corte)'); return; }
        veTransAdd(VE.clips[VE.sel], 'in', el.dataset.trt);
    });
    // arrastar até a timeline
    box.addEventListener('pointerdown', e => {
        const el = e.target.closest('[data-trt]');
        if (!el || e.button !== 0) return;
        const doc = box.ownerDocument, win = doc.defaultView, t = el.dataset.trt;
        const d = { x0: e.clientX, y0: e.clientY, on: false, ghost: null };
        const move = ev => {
            if (!d.on) {
                if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return;
                d.on = true;
                d.ghost = doc.createElement('div');
                d.ghost.className = 've-dghost';
                d.ghost.textContent = '⇄  ' + veT(VE_TR[t].nome);
                doc.body.appendChild(d.ghost);
                doc.body.classList.add('ve-fx-dragging');
            }
            d.ghost.style.left = ev.clientX + 12 + 'px';
            d.ghost.style.top = ev.clientY + 10 + 'px';
            const alvo = veTrAlvoEvento(ev, doc);
            $ve('ve-tl-wrap').classList.toggle('fx-drop', !!alvo);
            veTransHover(alvo, t);
        };
        const up = ev => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            $ve('ve-tl-wrap').classList.remove('fx-drop');
            doc.body.classList.remove('ve-fx-dragging');
            VE.trHover = null;
            if (!d.on) return;
            d.ghost.remove();
            veDraw();
            const alvo = veTrAlvoEvento(ev, doc);
            if (alvo) veTransAdd(alvo.c, alvo.lado, t);
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });
}

document.addEventListener('DOMContentLoaded', veTrInit);
