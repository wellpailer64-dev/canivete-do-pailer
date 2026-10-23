// =========================================================
// Vídeo Kanivete — Rastreador de movimento (o Tracker do After Effects).
// Botão direito no clipe › "Rastrear movimento…" (ou o efeito Transformar › Rastreador de movimento › "Rastrear no
// monitor"): uma caixa aparece no monitor; arraste-a até um ponto com contraste (canto, letra, marca) e rastreie para
// frente/para trás (Functions/rastreador.py: LK ancorado no quadro de referência + modelo; erro < 0,5 px no gabarito).
// O caminho fica no efeito do clipe rastreado (f.v.rt = {cx, cy, w, h, tb, modo, pts: [[t, x, y, escala, giro°, conf]]},
// tudo em px e tempo da MÍDIA). "Aplicar a" grava quadros-chave de Posição (e Rotação/Escala) num Nulo novo ou num
// clipe: o alvo fica onde está no quadro da agulha e passa a seguir o ponto (como o "Attach point" do After). Prévia e
// exportação usam os quadros-chave comuns: saem iguais.
// =========================================================

const VERT = { ativo: false, uid: null, fid: null, job: null, drag: null, bar: null, n: 0, seekPend: false };
const VE_RT_MODOS = ['pos', 'rot', 'esc'];

VE_FX.rastro = {
    nome: 'Rastreador de movimento', cat: 'Transformar', tag: 'Track Motion',
    soClipe: true,
    extra: ['rt'],
    botao: 'Rastrear no monitor', abrir: c => veRtAbrir(c),
    nota: 'Rastreador',
    notaDe: f => { const n = (f.v && f.v.rt && f.v.rt.pts || []).length; return n ? `${n} ${veT('quadros rastreados')}` : veT('Ainda sem rastro: clique em "Rastrear no monitor"'); },
    params: [{ k: 'modo', nome: 'Rastrear', tipo: 'lista', opcoes: ['Posição', 'Posição e giro', 'Posição, giro e escala'], def: 0 }],
    neutro: () => true,   // só guarda o caminho: quem se mexe é o alvo (quadros-chave)
    draw: a => a,
};

const veRtFx = c => ((c && c.fx) || []).find(f => f.t === 'rastro') || null;
// pelo uid (desfazer/refazer troca os objetos dos clipes)
const veRtClipe = () => (VERT.uid ? VE.clips.find(x => x.uid === VERT.uid) || null : null);
function veRtDados() {
    const f = veRtFx(veRtClipe());
    return f && f.v && f.v.rt ? f.v.rt : null;
}
function veRtGuardar(rt) {
    const c = veRtClipe(), f = veRtFx(c);
    if (!f) return;
    c.fx = c.fx.map(x => x.id === f.id ? { ...x, v: { ...x.v, rt } } : x);
}
const veRtModo = () => { const f = veRtFx(veRtClipe()); return VE_RT_MODOS[+(f && f.v && f.v.modo) || 0] || 'pos'; };
const veRtTl = c => veSrcAt(c, VE.playhead);
// ponto do rastro no instante da fonte t (meio quadro de tolerância)
function veRtPonto(rt, t) {
    const pts = (rt && rt.pts) || [], meio = 0.5 / (VE.fps || 30);
    let lo = 0, hi = pts.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] < t - meio) lo = m + 1; else if (pts[m][0] > t + meio) hi = m - 1; else return pts[m]; }
    return null;
}

// ── abrir / fechar ──
function veRtAbrir(c) {
    c = c || VE.clips[VE.sel];
    if (!c || veIsAudio(c) || veIsImage(c) || veIsAdj(c)) { veToast(veT('Selecione um clipe de vídeo para rastrear')); return; }
    if (!veInClip(c)) { veToast(veT('Leve a agulha para dentro do clipe')); return; }
    if (VE.playing) veStop();
    let f = veRtFx(c);
    if (!f) {
        vePushHistory();
        f = { id: veFxNewId(), t: 'rastro', on: true, v: { modo: 0 } };
        c.fx = [...(c.fx || []), f];
    }
    VE.sel = VE.clips.indexOf(c);
    Object.assign(VERT, { ativo: true, uid: veMoUid(c), fid: f.id });
    if (!veRtDados()) {
        const sz = veMediaSize(c), lado = Math.round(Math.min(sz.w, sz.h) * 0.08);
        veRtGuardar({ cx: sz.w / 2, cy: sz.h / 2, w: lado, h: lado, tb: veRtTl(c), pts: [] });
    }
    veRtBarra();
    veRefresh();
    veToast(veT('Arraste a caixa até um ponto com contraste e clique em Rastrear ▶▶'));
}

function veRtFechar() {
    if (VERT.job) veRtParar();
    VERT.ativo = false;
    VERT.drag = null;
    if (VERT.bar) VERT.bar.hidden = true;
    veDrawMonitorSoon();
}

// ── barra de ferramentas sobre o monitor ──
function veRtBarra() {
    const scr = $ve('ve-screen');
    if (!scr) return;
    let b = VERT.bar;
    if (!b) {
        b = VERT.bar = document.createElement('div');
        b.className = 've-rt-barra';
        b.innerHTML = `
            <b>${veT('Rastrear')}</b>
            <button data-rt="tras" title="${veT('Rastrear para trás (até o começo do clipe)')}">◀◀</button>
            <button data-rt="tras1" title="${veT('Rastrear 1 quadro para trás')}">◀</button>
            <button data-rt="frente1" title="${veT('Rastrear 1 quadro para frente')}">▶</button>
            <button data-rt="frente" title="${veT('Rastrear para frente (até o fim do clipe)')}">▶▶</button>
            <button data-rt="parar" title="${veT('Parar (Esc)')}" hidden>■</button>
            <select data-rt="modo" title="${veT('O que seguir')}">
                <option value="0">${veT('Posição')}</option><option value="1">${veT('Posição e giro')}</option><option value="2">${veT('Posição, giro e escala')}</option>
            </select>
            <span class="ve-rt-sep"></span>
            <select data-rt="alvo" title="${veT('Quem vai seguir o ponto')}"></select>
            <button data-rt="aplicar" class="ve-rt-forte">${veT('Aplicar')}</button>
            <button data-rt="limpar" title="${veT('Apagar o caminho rastreado')}">${veT('Limpar')}</button>
            <button data-rt="ok" title="${veT('Concluir (Esc)')}">✓</button>
            <span class="ve-rt-info"></span>`;
        scr.appendChild(b);
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', e => {
            const a = e.target.closest('button[data-rt]');
            if (!a) return;
            const k = a.dataset.rt;
            if (k === 'frente' || k === 'tras' || k === 'frente1' || k === 'tras1') veRtRastrear(k.startsWith('frente') ? 1 : -1, k.endsWith('1'));
            else if (k === 'parar') veRtParar();
            else if (k === 'aplicar') veRtAplicar(b.querySelector('[data-rt="alvo"]').value);
            else if (k === 'limpar') { vePushHistory(); const rt = veRtDados(); if (rt) veRtGuardar({ ...rt, pts: [] }); veRtInfo(); veDrawMonitorSoon(); }
            else if (k === 'ok') veRtFechar();
        });
        b.querySelector('[data-rt="modo"]').addEventListener('change', e => {
            const c = veRtClipe(), f = veRtFx(c);
            if (!f) return;
            vePushHistory();
            c.fx = c.fx.map(x => x.id === f.id ? { ...x, v: { ...x.v, modo: +e.target.value } } : x);
            veRefresh();
        });
    }
    b.hidden = false;
    const f = veRtFx(veRtClipe());
    b.querySelector('[data-rt="modo"]').value = String(+(f && f.v && f.v.modo) || 0);
    veRtAlvos();
    veRtInfo();
}

// "Aplicar a": Nulo novo ou um clipe visual que passa pelo trecho rastreado
function veRtAlvos() {
    const sel = VERT.bar && VERT.bar.querySelector('[data-rt="alvo"]'), c = veRtClipe();
    if (!sel || !c) return;
    const antes = sel.value;
    const op = [`<option value="nulo">${veT('Aplicar a: Nulo novo')}</option>`];
    VE.clips.forEach((x, i) => {
        if (x === c || veIsAudio(x) || x.st >= veEnd(c) || veEnd(x) <= c.st) return;
        op.push(`<option value="${i}">${veT('Aplicar a')}: ${veEsc(veNomeClipe(x))} (V${x.tr + 1})</option>`);
    });
    sel.innerHTML = op.join('');
    if ([...sel.options].some(o => o.value === antes)) sel.value = antes;
    else if (sel.options.length > 1) sel.value = sel.options[1].value;   // o clipe acima costuma ser o que vai seguir
}

function veRtInfo(txt) {
    const el = VERT.bar && VERT.bar.querySelector('.ve-rt-info');
    if (!el) return;
    const rt = veRtDados();
    el.textContent = txt || (rt && rt.pts.length ? `${rt.pts.length} ${veT('quadros')}` : veT('arraste a caixa até o ponto'));
}

// ── rastrear ──
function veRtRastrear(dir, um) {
    const c = veRtClipe(), rt = veRtDados(), m = c && veMediaOf(c);
    if (!c || !rt || VERT.job) return;
    const path = (m && m.path) || (m && m.id === 0 ? VE.path : '');
    if (!path || veMediaOffline(m)) { veToast(veT('A mídia deste clipe está offline')); return; }
    if (VE.playing) veStop();
    const fr = 1 / (VE.fps || 30), t0 = veRtTl(c);
    const t1 = um ? t0 + dir * fr : dir > 0 ? c.e - fr / 2 : c.s;
    if ((dir > 0 && t1 <= t0 + 1e-4) || (dir < 0 && t1 >= t0 - 1e-4)) { veToast(veT('Chegou na ponta do clipe')); return; }
    // partida: o ponto rastreado neste quadro (continua de onde parou) ou a caixa
    const p = veRtPonto(rt, t0), s0 = p ? p[3] : 1, a0 = p ? p[4] : 0;
    const caixa = [p ? p[1] : rt.cx, p ? p[2] : rt.cy, rt.w * s0, rt.h * s0];
    vePushHistory();
    // o que estava na direção do rastreio é refeito
    veRtGuardar({ ...rt, pts: rt.pts.filter(q => dir > 0 ? q[0] <= t0 + fr / 2 : q[0] >= t0 - fr / 2) });
    const job = 'rt' + (++VERT.n);
    VERT.job = { id: job, s0, a0, dir, n: 0 };
    VERT.bar.querySelector('[data-rt="parar"]').hidden = false;
    veRtInfo(veT('rastreando…'));
    window.pywebview.api.ve_rastrear(path, t0, t1, caixa, veRtModo(), VE.fps || 30, job);
}

function veRtParar() {
    if (!VERT.job) return;
    window.pywebview.api.ve_rastro_parar(VERT.job.id);
}

function veOnRastro(ev) {
    const j = VERT.job;
    if (!j || ev.job !== j.id) return;
    if (ev.stage === 'q') {
        const rt = veRtDados();
        if (!rt) return;
        const pts = rt.pts.slice(), meio = 0.5 / (VE.fps || 30);
        ev.itens.forEach(([t, x, y, s, a, cf]) => {
            const q = [t, x, y, +(s * j.s0).toFixed(5), +(a + j.a0).toFixed(4), cf];
            const k = pts.findIndex(o => Math.abs(o[0] - t) < meio);
            if (k >= 0) pts[k] = q; else pts.push(q);
            j.n++;
        });
        pts.sort((a, b) => a[0] - b[0]);
        veRtGuardar({ ...rt, pts });
        // a agulha acompanha (como no After): no máximo uma busca por quadro de tela
        const c = veRtClipe(), ult = ev.itens[ev.itens.length - 1];
        if (c && ult && !VERT.seekPend && performance.now() - (VERT.seekEm || 0) > 120) {
            VERT.seekPend = true;
            requestAnimationFrame(() => { VERT.seekPend = false; VERT.seekEm = performance.now(); veSeek(veTlAt(c, ult[0])); });
        }
        veRtInfo(`${veT('rastreando…')} ${j.n}`);
        return;
    }
    VERT.job = null;
    if (VERT.bar) VERT.bar.querySelector('[data-rt="parar"]').hidden = true;
    if (ev.stage === 'error') { veToast(`${veT('Não foi possível rastrear')}: ${ev.error}`); veRtInfo(); return; }
    const rt = veRtDados(), baixa = rt ? rt.pts.filter(q => q[5] < 0.3).length : 0;
    veRtInfo();
    if (typeof VEFX !== 'undefined') VEFX.key = '';   // nota do efeito com o total novo
    veRefresh();
    veToast(`${veT('Rastreado')}: ${j.n} ${veT('quadros')}` + (baixa ? ` · ${baixa} ${veT('com pouca certeza (em vermelho)')}` : ''));
}

// ── aplicar a um alvo: quadros-chave de posição (e giro/escala) ──
// redução: tira quadros-chave que a reta entre os vizinhos já reproduz (Douglas-Peucker, tolerância tol)
function veRtReduzir(ks, tol) {
    if (ks.length < 3) return ks;
    const manter = new Uint8Array(ks.length);
    manter[0] = manter[ks.length - 1] = 1;
    const pilha = [[0, ks.length - 1]];
    while (pilha.length) {
        const [a, b] = pilha.pop();
        let pior = -1, dm = tol;
        for (let i = a + 1; i < b; i++) {
            const u = (ks[i].t - ks[a].t) / ((ks[b].t - ks[a].t) || 1), v = ks[a].v + (ks[b].v - ks[a].v) * u;
            const d = Math.abs(ks[i].v - v);
            if (d > dm) { dm = d; pior = i; }
        }
        if (pior > 0) { manter[pior] = 1; pilha.push([a, pior], [pior, b]); }
    }
    return ks.filter((_, i) => manter[i]);
}

function veRtAplicar(alvo) {
    const c = veRtClipe(), rt = veRtDados();
    if (!c || !rt || rt.pts.length < 2) { veToast(veT('Rastreie primeiro (▶▶ ou ◀◀)')); return; }
    const modo = veRtModo(), sz = veMediaSize(c);
    // pontos do rastro no quadro da sequência
    const F = rt.pts.map(([t, x, y, s, a]) => {
        const T = veTlAt(c, t), q = veTfPaiQuadro(c, veTfQuadro(c, veProps(c, T), x, y, sz));
        return { T, x: q.x, y: q.y, s, a };
    }).filter(p => p.T >= c.st - 1e-4 && p.T <= veEnd(c) + 1e-4);
    if (F.length < 2) { veToast(veT('O caminho rastreado está fora do clipe')); return; }
    // referência: o ponto mais perto da agulha (o alvo fica onde está agora)
    let j0 = 0;
    F.forEach((p, j) => { if (Math.abs(p.T - VE.playhead) < Math.abs(F[j0].T - VE.playhead)) j0 = j; });
    const R0 = F[j0];
    let g;
    if (alvo === 'nulo') {
        const st = F[0].T, dur = F[F.length - 1].T - st + 1 / (VE.fps || 30);
        const i = VEMO_API.nulo({ st, dur, x: R0.x, y: R0.y, nome: `${veT('Rastro')} ${VE.clips.filter(x => veMoEhNulo(x)).length + 1}` });
        g = VE.clips[i];
    } else {
        g = VE.clips[+alvo];
        if (!g) { veToast(veT('Escolha quem vai seguir o ponto')); return; }
        vePushHistory();
    }
    if (g.pai) veToast(veT('O alvo tem camada mãe: o movimento é somado ao da mãe'));
    const p0 = veProps(g, R0.T), ox = p0.x - R0.x, oy = p0.y - R0.y;
    const ks = { x: [], y: [], rot: [], sc: [] };
    F.forEach(p => {
        if (p.T < g.st - 1e-4 || p.T > veEnd(g) + 1e-4) return;
        const t = veSrcAt(g, p.T);
        let dx = ox, dy = oy;
        const da = modo === 'pos' ? 0 : p.a - R0.a, k = modo === 'esc' ? p.s / R0.s : 1;
        if (da || k !== 1) {
            const r = da * Math.PI / 180;
            dx = (ox * Math.cos(r) - oy * Math.sin(r)) * k;
            dy = (ox * Math.sin(r) + oy * Math.cos(r)) * k;
        }
        ks.x.push({ t, v: +(p.x + dx).toFixed(3), i: 'lin' });
        ks.y.push({ t, v: +(p.y + dy).toFixed(3), i: 'lin' });
        if (modo !== 'pos') ks.rot.push({ t, v: +(p0.rot + da).toFixed(4), i: 'lin' });
        if (modo === 'esc') ks.sc.push({ t, v: +(p0.sc * k).toFixed(4), i: 'lin' });
    });
    if (ks.x.length < 2) { veToast(veT('O alvo não passa pelo trecho rastreado')); return; }
    const k2 = { ...(g.k || {}), x: veRtReduzir(ks.x, 0.05), y: veRtReduzir(ks.y, 0.05) };
    if (ks.rot.length) k2.rot = veRtReduzir(ks.rot, 0.005);
    if (ks.sc.length) k2.sc = veRtReduzir(ks.sc, 0.005);
    g.k = k2;
    veRefresh();
    veRtAlvos();
    veToast(`${veNomeClipe(g)} ${veT('segue o ponto rastreado')} (${k2.x.length} ${veT('quadros-chave')})`);
    return VE.clips.indexOf(g);
}

// ── desenho no monitor (chamado por veTfDesenhar) ──
function veRtOverlay(ctx, pv) {
    if (!VERT.ativo) return false;
    const c = veRtClipe(), rt = veRtDados();
    if (!c || !rt || !veTfVisivel(c)) return false;
    const p = veProps(c), sz = veMediaSize(c), q = veTxQuadroTela(), tela = pv / q.s;
    const M = (x, y) => { const a = veTfPaiQuadro(c, veTfQuadro(c, p, x, y, sz)); return [a.x * pv, a.y * pv]; };
    const tl = veRtTl(c), cur = veRtPonto(rt, tl);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // caminho (2 s para cada lado da agulha)
    const perto = rt.pts.filter(o => Math.abs(o[0] - tl) < 2);
    if (perto.length > 1) {
        ctx.lineWidth = 1.2 * tela;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        perto.forEach((o, j) => { const [x, y] = M(o[1], o[2]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
        perto.forEach(o => {
            const [x, y] = M(o[1], o[2]);
            ctx.fillStyle = o[5] < 0.3 ? '#ff4d4d' : veAcc(0.95);
            ctx.fillRect(x - 1.5 * tela, y - 1.5 * tela, 3 * tela, 3 * tela);
        });
    }
    // caixa: no ponto deste quadro (girada/escalada como o rastro) ou a caixa de partida
    const cx = cur ? cur[1] : rt.cx, cy = cur ? cur[2] : rt.cy, s = cur ? cur[3] : 1, a = (cur ? cur[4] : 0) * Math.PI / 180;
    const hw = rt.w * s / 2, hh = rt.h * s / 2;
    const canto = (u, v) => M(cx + u * hw * Math.cos(a) - v * hh * Math.sin(a), cy + u * hw * Math.sin(a) + v * hh * Math.cos(a));
    const cs = [canto(-1, -1), canto(1, -1), canto(1, 1), canto(-1, 1)];
    ctx.lineWidth = 3 * tela; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); cs.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 1.5 * tela; ctx.strokeStyle = cur && cur[5] < 0.3 ? '#ff4d4d' : veAcc(1);
    ctx.stroke();
    // busca (tracejada, maior) e mira no centro
    const bs = [[-2, -2], [2, -2], [2, 2], [-2, 2]].map(([u, v]) => canto(u, v));
    ctx.setLineDash([4 * tela, 4 * tela]); ctx.lineWidth = 1 * tela; ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); bs.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    const [mx, my] = M(cx, cy), r = 6 * tela;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * tela;
    ctx.beginPath(); ctx.moveTo(mx - r, my); ctx.lineTo(mx + r, my); ctx.moveTo(mx, my - r); ctx.lineTo(mx, my + r); ctx.stroke();
    cs.forEach(([x, y]) => { const h = 4 * tela; ctx.fillStyle = '#fff'; ctx.fillRect(x - h, y - h, 2 * h, 2 * h); });
    ctx.restore();
    return true;
}

// ── arrastar a caixa no monitor ──
function veRtPontoMidia(e) {
    const c = veRtClipe(), pt = veTxPontoQuadro(e), q = veTfPaiPt(c, pt);
    return veTfLocal(c, veProps(c), q.x, q.y, veMediaSize(c));
}

window.addEventListener('pointerdown', e => {
    if (!VERT.ativo || e.button !== 0 || VERT.job) return;
    const scr = $ve('ve-screen');
    if (!scr || !scr.contains(e.target) || e.target.closest('.ve-rt-barra, button, select')) return;
    const c = veRtClipe(), rt = veRtDados();
    if (!c || !rt || !veTfVisivel(c)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const m = veRtPontoMidia(e), tl = veRtTl(c), cur = veRtPonto(rt, tl);
    const cx = cur ? cur[1] : rt.cx, cy = cur ? cur[2] : rt.cy, s = cur ? cur[3] : 1;
    const q = veTxQuadroTela(), escTela = q.s * (veProps(c).sc / 100);   // px de tela por px da mídia (aprox.)
    const hw = rt.w * s / 2, hh = rt.h * s / 2, perto = 9 / Math.max(1e-6, escTela);
    const canto = Math.abs(Math.abs(m.x - cx) - hw) < perto && Math.abs(Math.abs(m.y - cy) - hh) < perto;
    vePushHistory();
    let cx0 = cx, cy0 = cy;
    if (!canto && (Math.abs(m.x - cx) > hw || Math.abs(m.y - cy) > hh)) {   // clique fora: a caixa vai para lá (recomeça dali)
        const meio = 0.5 / (VE.fps || 30);
        veRtGuardar({ ...rt, cx: m.x, cy: m.y, tb: tl, pts: rt.pts.filter(o => Math.abs(o[0] - tl) >= meio) });
        cx0 = m.x; cy0 = m.y;
    }
    VERT.drag = { tipo: canto ? 'tam' : 'mover', m0: m, cx0, cy0, s, tl };
    veDrawMonitorSoon();
}, true);

window.addEventListener('pointermove', e => {
    const d = VERT.drag;
    if (!d) return;
    e.stopImmediatePropagation();
    const m = veRtPontoMidia(e), rt = veRtDados();
    if (!rt) return;
    if (d.tipo === 'mover') {
        // mover a caixa num quadro = recomeçar dali (o ponto deste quadro deixa de valer)
        const meio = 0.5 / (VE.fps || 30);
        veRtGuardar({ ...rt, cx: d.cx0 + m.x - d.m0.x, cy: d.cy0 + m.y - d.m0.y, tb: d.tl, pts: rt.pts.filter(o => Math.abs(o[0] - d.tl) >= meio) });
    } else {
        const w = Math.max(12, Math.abs(m.x - d.cx0) * 2 / d.s), h = Math.max(12, Math.abs(m.y - d.cy0) * 2 / d.s);
        veRtGuardar({ ...rt, w: Math.round(e.shiftKey ? Math.max(w, h) : w), h: Math.round(e.shiftKey ? Math.max(w, h) : h) });
    }
    veDrawMonitorSoon();
}, true);

window.addEventListener('pointerup', () => { if (VERT.drag) { VERT.drag = null; veRtInfo(); } }, true);
window.addEventListener('keydown', e => {
    if (!VERT.ativo || e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    if (VERT.job) veRtParar(); else veRtFechar();
}, true);

// clipe saiu da timeline / outro selecionado: fecha
setInterval(() => { if (VERT.ativo && (!veRtClipe() || !veRtFx(veRtClipe()))) veRtFechar(); }, 1000);

// botão direito no clipe › "Rastrear movimento…"
(function () {
    if (typeof veClipMenu !== 'function') return;
    const menu = veClipMenu;
    veClipMenu = function (i, x, y, doc) {
        menu(i, x, y, doc);
        const m = VE._ctx && VE._ctx.m, c = VE.clips[i];
        if (!m || !c || veIsAudio(c) || veIsImage(c) || veIsAdj(c)) return;
        const b = doc.createElement('button');
        b.className = 've-ctx-item';
        b.dataset.rt = '1';
        b.textContent = veT('Rastrear movimento…');
        b.onclick = e => { e.stopPropagation(); veClipMenuFechar(); if (!veInClip(c)) veSeek(Math.max(c.st, Math.min(VE.playhead, veEnd(c) - veFrame()))); veRtAbrir(c); };
        const ref = m.querySelector('[data-ctx="off"]');
        m.insertBefore(b, ref || m.querySelector('[data-ctx="del"]'));
        veCtxPosicionar(m, x, y, doc);
    };
})();

window.VERT_API = {
    abrir: i => veRtAbrir(VE.clips[i]),
    caixa: (cx, cy, w, h) => { const rt = veRtDados(); vePushHistory(); veRtGuardar({ ...rt, cx, cy, w: w || rt.w, h: h || rt.h, tb: veRtTl(veRtClipe()) }); veDrawMonitorSoon(); },
    rastrear: (dir = 1, um = false) => veRtRastrear(dir, um),
    rodando: () => !!VERT.job,
    dados: () => veRtDados(),
    aplicar: alvo => veRtAplicar(String(alvo)),
    fechar: () => veRtFechar(),
};
