// =========================================================
// Pocket Editor — faixas de quadros-chave na timeline (como no After Effects)
// Com um clipe selecionado: P = Posição, S = Escala, R = Rotação, T = Opacidade (Transparência), U = todas as
// animadas. Shift + tecla soma/tira uma faixa das que estão abertas; a mesma tecla de novo fecha.
// (Sem clipe selecionado, S/T/R continuam sendo cortar/Texto/Velocidade.)
// Cada propriedade aberta ganha uma faixa estreita logo abaixo da trilha do clipe. No cabeçalho da faixa:
// cronômetro (anima), valor na agulha (arraste para mudar, clique para digitar) e ‹ ◆ › (anterior, põe/tira,
// próximo). Na faixa: clicar seleciona o ◆ (Shift/Ctrl soma), arrastar move (Alt+arrastar duplica), retângulo
// seleciona vários, Delete apaga, Ctrl+C / Ctrl+V copia e cola na agulha, botão direito muda a interpolação.
// Os quadros-chave ficam em c.k[prop] = [{t (tempo da fonte), v, i}] (editor.js).
// =========================================================

const VE_KL_GRUPOS = [
    { g: 'pos', nome: 'Posição', keys: ['x', 'y'], tecla: 'P', un: 'px', passo: 1, casas: 1 },
    { g: 'sc', nome: 'Escala', keys: ['sc'], tecla: 'S', un: '%', passo: 0.5, casas: 1 },
    { g: 'rot', nome: 'Rotação', keys: ['rot'], tecla: 'R', un: '°', passo: 0.5, casas: 1 },
    { g: 'op', nome: 'Opacidade', keys: ['op'], tecla: 'T', un: '%', passo: 0.5, casas: 1 },
];
const VE_KL_H = 22;
const VEKL = {
    grupos: new Set(),   // faixas abertas
    sel: [],             // ◆ selecionados: [{g, t}] (t = tempo da fonte)
    selClip: null,       // clipe dono da seleção
    drag: null,
    clip: null,          // área de transferência: {itens: [{key, rel, q}]}
    chave: '',
};

const veKlGrupo = g => VE_KL_GRUPOS.find(x => x.g === g);

// Clipe cujas faixas aparecem (o selecionado, se tiver imagem) ou null
function veKlClip() {
    if (!VEKL.grupos.size || !VE.ready) return null;
    const c = VE.clips[VE.sel];
    return c && !veIsAudio(c) ? c : null;
}

// Clipe selecionado que pode ter quadros-chave (com ou sem faixas abertas)
function veKlDono() {
    const c = VE.ready ? VE.clips[VE.sel] : null;
    return c && !veIsAudio(c) ? c : null;
}

// Clipe dos ◆ selecionados (vale também com as faixas fechadas: ◆ pego na barra do clipe)
function veKlAlvo() {
    const d = veKlDono();
    return VEKL.sel.length && d && VEKL.selClip === d ? d : veKlClip();
}
const veKlTemSel = () => VEKL.sel.length > 0 && !!veKlDono() && VEKL.selClip === veKlDono();

// Todos os grupos com ◆ no instante t (fonte) do clipe
function veKlSelNoTempo(c, t) {
    return VE_KL_GRUPOS.filter(G => G.keys.some(k => veKfOn(c, k) && veKfIndex(c.k[k], t) >= 0)).map(G => ({ g: G.g, t }));
}

function veKlRows(c) {
    return VE_KL_GRUPOS.filter(x => VEKL.grupos.has(x.g)).map(x => ({ id: 'K' + x.g, kind: 'k', g: x.g, h: VE_KL_H, tr: c.tr }));
}

function veKlAltura() { const c = veKlClip(); return c ? veKlRows(c).length * VE_KL_H : 0; }

// ── tempos dos ◆ de um grupo (tempo da fonte, únicos) ──
// q = o ◆ (a curva que sai dele), ant = o anterior na mesma propriedade (a curva que chega), ult = é o último
function veKlTempos(c, g) {
    const set = new Map();
    veKlGrupo(g).keys.forEach(k => {
        if (veKfOn(c, k)) c.k[k].forEach((q, j, ks) => {
            if (q.t < c.s - 1e-4 || q.t > c.e + 1e-4) return;
            const r = Math.round(q.t * 1e4) / 1e4;
            if (![...set.keys()].some(t => Math.abs(t - r) < veFrame() * 0.5)) set.set(r, { q, ant: ks[j - 1] || null, ult: j === ks.length - 1 });
        });
    });
    return [...set.entries()].sort((a, b) => a[0] - b[0]).map(([t, x]) => ({ t, ...x }));
}
const veKlAnimado = (c, g) => veKlGrupo(g).keys.some(k => veKfOn(c, k));
const veKlSelTem = (g, t) => VEKL.sel.some(s => s.g === g && Math.abs(s.t - t) < veFrame() * 0.5);

// Chamado a cada desenho da timeline: cabeçalhos certos e valores na agulha em dia
function veKlSync() {
    const c = veKlClip();
    if (VEKL.selClip && VEKL.selClip !== veKlDono()) { VEKL.sel = []; VEKL.selClip = null; }
    const chave = c ? [VE.clips.indexOf(c), c.tr, [...VEKL.grupos].join(), VE_TRACKS.length].join('|') : '';
    const body = $ve('ve-tl-body');
    if (body) body.classList.toggle('kl-aberto', !!c);
    if (chave !== VEKL.chave) { VEKL.chave = chave; veBuildHeads(); }
    if (c) veKlValores(c);
}

// ── cabeçalho da faixa ──
const VE_KL_SW = '<svg viewBox="0 0 16 16"><circle cx="8" cy="9.2" r="5.3"/><path d="M8 9.2V6.2M6.3 1.8h3.4M12.2 4.4l1-1"/></svg>';
function veKlHeadsHtml(tr) {
    const c = veKlClip();
    if (!c || tr.kind !== 'v' || tr.id !== 'V' + (c.tr + 1)) return '';
    return veKlRows(c).map(r => {
        const G = veKlGrupo(r.g), anim = veKlAnimado(c, r.g);
        const vals = G.keys.map(k => `<span class="ve-kl-val" data-klv="${k}" data-klg="${r.g}" title="Arraste para mudar · clique para digitar (Shift: 10x · Ctrl: fino)"></span>`).join('');
        return `
        <div class="ve-head ve-head-k${anim ? ' anim' : ''}" data-klg="${r.g}" style="height:${VE_KL_H}px">
            <div class="ve-kl-row">
                <button class="ve-kl-sw" data-kla="sw" data-klg="${r.g}" title="Animar ${G.nome} (cronômetro)">${VE_KL_SW}</button>
                <span class="ve-kl-nome" title="${G.nome} (${G.tecla})">${G.nome}</span>
                ${vals}
                <span class="ve-kl-nav">
                    <button data-kla="prev" data-klg="${r.g}" title="Quadro-chave anterior">‹</button>
                    <button class="ve-kl-add" data-kla="add" data-klg="${r.g}" title="Pôr/tirar quadro-chave na agulha"><i></i></button>
                    <button data-kla="next" data-klg="${r.g}" title="Próximo quadro-chave">›</button>
                </span>
            </div>
        </div>`;
    }).join('');
}

function veKlFmt(v, G) {
    const n = Math.round(v * Math.pow(10, G.casas)) / Math.pow(10, G.casas);
    return String(n).replace('.', ',') + (G.un === 'px' ? '' : G.un);
}

function veKlValores(c) {
    const box = $ve('ve-heads-rows');
    if (!box) return;
    const p = veProps(c), tl = veKfTime(c), dentro = veInClip(c);
    box.querySelectorAll('.ve-head-k').forEach(h => {
        const g = h.dataset.klg, G = veKlGrupo(g);
        h.classList.toggle('anim', veKlAnimado(c, g));
        h.querySelectorAll('.ve-kl-val').forEach(el => {
            if (el.querySelector('input')) return;
            const txt = veKlFmt(p[el.dataset.klv], G);
            if (el.textContent !== txt) el.textContent = txt;
        });
        const naAgulha = dentro && G.keys.some(k => veKfOn(c, k) && veKfIndex(c.k[k], tl) >= 0);
        const add = h.querySelector('.ve-kl-add');
        if (add) add.classList.toggle('on', naAgulha);
    });
}

// ── edição ──
function veKlPodeEditar(c) {
    if (!c) return false;
    if (veLocked(c)) { veAvisoBloqueio(); return false; }
    return true;
}

function veKlDepois(leve) {
    if (leve) { veRenderProps(); veDrawMonitorSoon(); veDraw(); return; }
    veRefresh();
}

// Cronômetro do grupo: liga (◆ na agulha com o valor atual) ou desliga (fica o valor atual, fixo)
function veKlCronometro(g) {
    const c = veKlClip();
    if (!veKlPodeEditar(c)) return;
    const G = veKlGrupo(g), p = veProps(c);
    vePushHistory();
    if (veKlAnimado(c, g)) {
        const k2 = { ...c.k }, fixos = {};
        G.keys.forEach(k => { delete k2[k]; fixos[k] = p[k]; });
        c.k = k2;
        if (!veHasKf(c)) delete c.k;
        c.p = { ...veStaticProps(c), ...fixos };
        VEKL.sel = VEKL.sel.filter(s => s.g !== g);
        veToast(`Animação de ${G.nome} desligada`);
    } else {
        const t = veKfTime(c), k2 = { ...(c.k || {}) };
        G.keys.forEach(k => { k2[k] = [{ t, v: p[k], i: 'lin' }]; });
        c.k = k2;
        veToast(`${G.nome} animada: mude o valor em outro ponto para criar movimento`);
    }
    veKlDepois();
}

// ◆ do cabeçalho: tira o da agulha, ou põe um com o valor atual
function veKlPorTirar(g) {
    const c = veKlClip();
    if (!veKlPodeEditar(c)) return;
    if (!veInClip(c)) { veToast('Leve a agulha para dentro do clipe'); return; }
    const G = veKlGrupo(g), p = veProps(c), t = veKfTime(c);
    const tem = G.keys.some(k => veKfOn(c, k) && veKfIndex(c.k[k], t) >= 0);
    vePushHistory();
    const k2 = { ...(c.k || {}) }, fixos = {};
    G.keys.forEach(k => {
        const ks = (k2[k] || []).map(q => ({ ...q }));
        const j = veKfIndex(ks, t);
        if (tem) { if (j >= 0) ks.splice(j, 1); }
        else if (j < 0) { ks.push({ t, v: p[k], i: 'lin' }); ks.sort((a, b) => a.t - b.t); }
        if (ks.length) k2[k] = ks; else { delete k2[k]; fixos[k] = p[k]; }
    });
    c.k = k2;
    if (Object.keys(fixos).length) c.p = { ...veStaticProps(c), ...fixos };
    if (!veHasKf(c)) delete c.k;
    veKlDepois();
}

function veKlPular(g, dir) {
    const c = veKlClip();
    if (!c) return;
    const eps = veFrame() / 2;
    const ts = veKlTempos(c, g).map(x => veTlAt(c, x.t));
    const t = dir > 0 ? ts.find(x => x > VE.playhead + eps) : [...ts].reverse().find(x => x < VE.playhead - eps);
    if (t == null) { veToast(dir > 0 ? 'Não há quadro-chave depois' : 'Não há quadro-chave antes'); return; }
    if (VE.playing) veStop();
    veSeek(t);
}

// Valor digitado/arrastado no cabeçalho (na agulha: com animação vira ◆, sem ela muda fixo)
function veKlValor(c, k, v) {
    const lim = { sc: [0, 2000], op: [0, 100] }[k];
    if (lim) v = Math.min(lim[1], Math.max(lim[0], v));
    veApplyProps(c, { [k]: Math.round(v * 100) / 100 });
}

// Apaga os ◆ selecionados (o valor da agulha fica fixo na propriedade que ficar sem nenhum)
function veKlApagar() {
    const c = veKlAlvo();
    if (!VEKL.sel.length || !veKlPodeEditar(c)) return;
    const p = veProps(c);
    vePushHistory();
    const k2 = { ...(c.k || {}) }, fixos = {};
    VEKL.sel.forEach(s => veKlGrupo(s.g).keys.forEach(k => {
        if (!k2[k]) return;
        k2[k] = k2[k].filter(q => Math.abs(q.t - s.t) >= veFrame() * 0.5);
        if (!k2[k].length) { delete k2[k]; fixos[k] = p[k]; }
    }));
    c.k = k2;
    if (Object.keys(fixos).length) c.p = { ...veStaticProps(c), ...fixos };
    if (!veHasKf(c)) delete c.k;
    const n = VEKL.sel.length;
    VEKL.sel = [];
    veKlDepois();
    veToast(n === 1 ? 'Quadro-chave apagado' : `${n} quadros-chave apagados`);
}

// Move (ou duplica) os ◆ selecionados dt segundos da timeline
function veKlMover(c, dt, duplicar) {
    const ds = dt * veVel(c), tol = veFrame() * 0.5;
    const k2 = { ...(c.k || {}) };
    const porKey = new Map();
    VEKL.sel.forEach(s => veKlGrupo(s.g).keys.forEach(k => {
        if (!porKey.has(k)) porKey.set(k, []);
        porKey.get(k).push(s.t);
    }));
    porKey.forEach((ts, k) => {
        const ks = k2[k];
        if (!ks) return;
        const movidos = ks.filter(q => ts.some(t => Math.abs(q.t - t) < tol)).map(q => ({ ...q, t: Math.round((q.t + ds) * 1e4) / 1e4 }));
        let resto = duplicar ? ks.map(q => ({ ...q })) : ks.filter(q => !ts.some(t => Math.abs(q.t - t) < tol)).map(q => ({ ...q }));
        resto = resto.filter(q => !movidos.some(m => Math.abs(m.t - q.t) < tol));
        k2[k] = [...resto, ...movidos].sort((a, b) => a.t - b.t);
    });
    c.k = k2;
    VEKL.sel = VEKL.sel.map(s => ({ g: s.g, t: Math.round((s.t + ds) * 1e4) / 1e4 }));
}

function veKlCopiar() {
    const c = veKlAlvo();
    if (!c || !VEKL.sel.length) return false;
    const base = Math.min(...VEKL.sel.map(s => s.t)), itens = [];
    VEKL.sel.forEach(s => veKlGrupo(s.g).keys.forEach(k => {
        const j = veKfOn(c, k) ? veKfIndex(c.k[k], s.t) : -1;
        if (j >= 0) itens.push({ key: k, rel: (s.t - base) / veVel(c), q: { ...c.k[k][j] } });
    }));
    VEKL.clip = { itens };
    veToast(`${VEKL.sel.length} quadro${VEKL.sel.length > 1 ? 's' : ''}-chave copiado${VEKL.sel.length > 1 ? 's' : ''}`);
    return true;
}

// Cola na agulha (no clipe selecionado; pode ser outro clipe)
function veKlColar() {
    const c = veKlDono();
    if (!VEKL.clip || !VEKL.clip.itens.length || !veKlPodeEditar(c)) return false;
    if (!veInClip(c)) { veToast('Leve a agulha para dentro do clipe'); return true; }
    vePushHistory();
    const base = veKfTime(c), tol = veFrame() * 0.5, k2 = { ...(c.k || {}) }, sel = [];
    VEKL.clip.itens.forEach(({ key, rel, q }) => {
        const t = Math.round(Math.min(c.e, base + rel * veVel(c)) * 1e4) / 1e4;
        const ks = (k2[key] || []).filter(x => Math.abs(x.t - t) >= tol).map(x => ({ ...x }));
        ks.push({ ...q, t });
        k2[key] = ks.sort((a, b) => a.t - b.t);
        const G = VE_KL_GRUPOS.find(x => x.keys.includes(key));
        if (G && !sel.some(s => s.g === G.g && Math.abs(s.t - t) < tol)) sel.push({ g: G.g, t });
        if (G) VEKL.grupos.add(G.g);
    });
    c.k = k2;
    VEKL.sel = sel;
    VEKL.selClip = c;
    veKlDepois();
    veToast('Quadros-chave colados na agulha');
    return true;
}

function veKlInterp(i) {
    const c = veKlAlvo();
    if (!VEKL.sel.length || !veKlPodeEditar(c)) return;
    vePushHistory();
    const k2 = { ...c.k };
    VEKL.sel.forEach(s => veKlGrupo(s.g).keys.forEach(k => {
        if (!k2[k]) return;
        k2[k] = k2[k].map(q => {
            if (Math.abs(q.t - s.t) >= veFrame() * 0.5) return q;
            const n = { ...q, i };
            delete n.b;
            return n;
        });
    }));
    c.k = k2;
    veKlDepois();
    veToast('Interpolação: ' + (VE_KF_INTERP[i] || i));
}

// ── Easy Ease (F9), como no After Effects ──
// Cada trecho entre dois ◆ é uma Bézier [x1, y1, x2, y2]: (x1, y1) é a alça que sai do ◆ da esquerda e (x2, y2) a
// que chega no da direita. Easy Ease achata a alça (influência de 33%, velocidade zero): saída = (1/3, 0) no
// trecho que sai do ◆, chegada = (2/3, 1) no trecho que chega nele. A outra ponta de cada trecho fica como estava.
// modo: 'ambos' (F9), 'in' (Shift+F9, só a chegada), 'out' (Ctrl+Shift+F9, só a saída).
// Sem ◆ selecionado nas faixas, vale para os ◆ do clipe selecionado que estão na agulha.
function veKlEasy(modo = 'ambos') {
    const c = VE.clips[VE.sel];
    if (!c || !c.k) { veToast('Selecione quadros-chave (abra as faixas com P, S, R ou T)'); return; }
    const tol = veFrame() * 0.5;
    let alvos = veKlTemSel() ? VEKL.sel.slice() : [];
    if (!alvos.length) {
        const t = veKfTime(c);
        VE_KL_GRUPOS.forEach(G => { if (G.keys.some(k => veKfOn(c, k) && veKfIndex(c.k[k], t) >= 0)) alvos.push({ g: G.g, t }); });
    }
    if (!alvos.length) { veToast('Selecione quadros-chave nas faixas (P, S, R, T) ou leve a agulha até um'); return; }
    if (!veKlPodeEditar(c)) return;
    vePushHistory();
    const k2 = { ...c.k };
    const curva = q => (q.i === 'hold' ? VE_KL_LIN : veKfCurve(q) || VE_KL_LIN).slice();
    const definir = (q, b) => {
        const r = b.map(v => Math.round(v * 1e4) / 1e4);
        const ease = VE_KF_BEZ.ease.map(v => Math.round(v * 1e4) / 1e4);
        delete q.b;
        if (r.every((v, n) => Math.abs(v - ease[n]) < 1e-3)) q.i = 'ease';
        else { q.i = 'bez'; q.b = r; }
    };
    let n = 0;
    alvos.forEach(s => veKlGrupo(s.g).keys.forEach(k => {
        if (!k2[k]) return;
        const ks = k2[k] = k2[k].map(q => ({ ...q }));
        const j = ks.findIndex(q => Math.abs(q.t - s.t) < tol);
        if (j < 0) return;
        n++;
        if (modo !== 'in' && j < ks.length - 1) { const b = curva(ks[j]); b[0] = 1 / 3; b[1] = 0; definir(ks[j], b); }
        if (modo !== 'out' && j > 0 && ks[j - 1].i !== 'hold') { const b = curva(ks[j - 1]); b[2] = 2 / 3; b[3] = 1; definir(ks[j - 1], b); }
    }));
    c.k = k2;
    veKlDepois();
    const nomes = { ambos: 'Easy Ease', in: 'Easy Ease de entrada', out: 'Easy Ease de saída' };
    veToast(`${nomes[modo]} em ${alvos.length} quadro${alvos.length > 1 ? 's' : ''}-chave`);
}

// ── desenho das faixas (veRender) ──
function veKlDesenhar(ctx, rows, X, W) {
    const c = veKlClip();
    if (!c) return;
    const d = VEKL.drag;
    ctx.save();
    rows.filter(r => r.kind === 'k').forEach(r => {
        ctx.fillStyle = '#0b0d12';
        ctx.fillRect(0, r.y, W, r.h);
        const x1 = X(c.st), x2 = X(veEnd(c));
        ctx.fillStyle = 'rgba(91,110,225,0.13)';
        ctx.fillRect(x1, r.y + 2, x2 - x1, r.h - 4);
        ctx.fillStyle = '#1b1e27';
        ctx.fillRect(0, r.y + r.h - 1, W, 1);
        const y = r.y + r.h / 2;
        const tempos = veKlTempos(c, r.g);
        // linha fina entre os ◆ (trecho animado)
        if (tempos.length > 1) {
            ctx.fillStyle = 'rgba(212,129,74,0.25)';
            ctx.fillRect(X(veTlAt(c, tempos[0].t)), y - 0.5, X(veTlAt(c, tempos[tempos.length - 1].t)) - X(veTlAt(c, tempos[0].t)), 1);
        }
        tempos.forEach(({ t, q, ant, ult }) => {
            const sel = veKlSelTem(r.g, t);
            let x = X(veTlAt(c, t));
            if (d && d.ativo && sel) x += d.dt * VE.pps;
            if (x < -8 || x > W + 8) return;
            const lados = veKlLados(q, ant, ult);
            if (d && d.ativo && sel && d.dup) veKlForma(ctx, X(veTlAt(c, t)), y, lados, false, true);
            veKlForma(ctx, x, y, lados, sel, false, Math.abs(veTlAt(c, t) - VE.playhead) < veFrame() / 2);
        });
    });
    if (d && d.modo === 'marq' && d.ativo) {
        const xa = X(d.ta), xb = X(d.tb);
        ctx.fillStyle = 'rgba(212,129,74,0.10)';
        ctx.fillRect(Math.min(xa, xb), Math.min(d.ya, d.yb), Math.abs(xb - xa), Math.abs(d.yb - d.ya));
        ctx.strokeStyle = 'rgba(212,129,74,0.85)';
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(Math.min(xa, xb) + 0.5, Math.min(d.ya, d.yb) + 0.5, Math.abs(xb - xa), Math.abs(d.yb - d.ya));
        ctx.setLineDash([]);
    }
    ctx.restore();
}

// Como a curva chega (esquerda) e sai (direita) do ◆: 'lin', 'ease' (alça achatada: Easy Ease) ou 'hold'.
// O primeiro e o último ◆ repetem o lado que existe.
const VE_KL_LIN = [1 / 3, 1 / 3, 2 / 3, 2 / 3];
function veKlLados(q, ant, ult) {
    const sai = q.i === 'hold' ? 'hold' : (() => { const b = veKfCurve(q) || VE_KL_LIN; return b[0] - b[1] > 0.05 ? 'ease' : 'lin'; })();
    const chega = !ant ? null : ant.i === 'hold' ? 'hold' : (() => { const b = veKfCurve(ant) || VE_KL_LIN; return b[3] - b[2] > 0.05 ? 'ease' : 'lin'; })();
    return [chega || sai, ult && chega ? chega : sai];
}

// Forma do ◆ por metades (como no AE): losango = linear, ampulheta = suave (Easy Ease), quadrado = parar
function veKlForma(ctx, x, y, lados, sel, fantasma, agulha) {
    const r = 5;
    ctx.beginPath();
    // metade esquerda (s = -1) e direita (s = 1), de cima para baixo pelo lado de fora
    const metade = (tipo, s) => {
        if (tipo === 'hold') { ctx.lineTo(x + s * (r - 1), y - r + 1); ctx.lineTo(x + s * (r - 1), y + r - 1); ctx.lineTo(x, y + r - 1); }
        else if (tipo === 'ease') { ctx.lineTo(x + s * r, y - r); ctx.lineTo(x + s * 1.5, y); ctx.lineTo(x + s * r, y + r); ctx.lineTo(x, y + r); }
        else { ctx.lineTo(x + s * r, y); ctx.lineTo(x, y + r); }
    };
    ctx.moveTo(x, y - (lados[1] === 'hold' ? r - 1 : r));
    metade(lados[1], 1);
    ctx.lineTo(x, lados[0] === 'hold' ? y + r - 1 : y + r);
    // volta pela esquerda, de baixo para cima
    if (lados[0] === 'hold') { ctx.lineTo(x - (r - 1), y + r - 1); ctx.lineTo(x - (r - 1), y - r + 1); }
    else if (lados[0] === 'ease') { ctx.lineTo(x - r, y + r); ctx.lineTo(x - 1.5, y); ctx.lineTo(x - r, y - r); }
    else ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.globalAlpha = fantasma ? 0.35 : 1;
    ctx.fillStyle = sel ? '#D4814A' : agulha ? '#fbbf24' : '#c9ccd6';
    ctx.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,0.8)';
    ctx.lineWidth = sel ? 1.5 : 1;
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
}

// ◆ sob o ponto: {g, t} (t = tempo da fonte) ou null
function veKlAt(x, row) {
    const c = veKlClip();
    if (!c || !row || row.kind !== 'k') return null;
    let best = null, bd = 7;
    veKlTempos(c, row.g).forEach(({ t }) => {
        const d = Math.abs((veTlAt(c, t) - VE.view) * VE.pps - x);
        if (d < bd) { bd = d; best = { g: row.g, t }; }
    });
    return best;
}

// ── mouse nas faixas (antes da timeline: captura) ──
function veKlIniciar() {
    const wrap = $ve('ve-tl-wrap'), heads = $ve('ve-heads-rows');
    if (!wrap || !heads) return;

    wrap.addEventListener('pointerdown', e => {
        if (!VE.ready || VE.tool === 'hand' || e.button === 1) return;
        const { t, x, y } = veTimeFromEvent(e);
        if (y <= VE_RULER) return;
        const row = veRowAt(y);
        if (!row || row.kind !== 'k') {
            // ◆ na barra do clipe selecionado: vira a seleção de quadros-chave (Delete apaga só ele);
            // qualquer outro clique na timeline desfaz a seleção de ◆
            const kft = e.button === 0 && row && row.kind === 'v' ? veKfMarkAt(x, y, row) : null;
            const c = veKlDono();
            if (kft != null && c) { VEKL.sel = veKlSelNoTempo(c, Math.round(veSrcAt(c, kft) * 1e4) / 1e4); VEKL.selClip = c; }
            else if (e.button === 0 && VEKL.sel.length) VEKL.sel = [];
            return;
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.button !== 0) return;
        const c = veKlClip();
        if (!c) return;
        if (VE.playing) veStop();
        try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já solto */ }
        const hit = veKlAt(x, row);
        VEKL.selClip = c;
        if (hit) {
            const tem = veKlSelTem(hit.g, hit.t);
            if (e.shiftKey || e.ctrlKey) {
                VEKL.sel = tem ? VEKL.sel.filter(s => !(s.g === hit.g && Math.abs(s.t - hit.t) < veFrame() * 0.5)) : VEKL.sel.concat(hit);
            } else if (!tem) VEKL.sel = [hit];
            VEKL.drag = { modo: 'mover', x0: e.clientX, tl0: veTlAt(c, hit.t), dt: 0, dup: e.altKey, ativo: false, hit, toggle: e.shiftKey || e.ctrlKey };
        } else {
            VEKL.drag = { modo: 'marq', ta: t, tb: t, ya: y, yb: y, base: e.shiftKey || e.ctrlKey ? VEKL.sel.slice() : [], ativo: false, x0: e.clientX, y0: e.clientY };
            if (!e.shiftKey && !e.ctrlKey) VEKL.sel = [];
        }
        veDraw();
    }, true);

    wrap.addEventListener('pointermove', e => {
        const d = VEKL.drag;
        if (!d) {
            if (!VE.ready) return;
            const { x, y } = veTimeFromEvent(e);
            const row = veRowAt(y);
            if (row && row.kind === 'k') {
                e.stopImmediatePropagation();
                wrap.classList.toggle('kf-hover', !!veKlAt(x, row));
                wrap.classList.remove('trim-hover');
            }
            return;
        }
        e.stopImmediatePropagation();
        const c = veKlClip();
        if (!c) return;
        if (d.modo === 'mover') {
            if (!d.ativo && Math.abs(e.clientX - d.x0) < 3) return;
            d.ativo = true;
            // o ◆ pego encaixa nos quadros e na agulha; todos andam juntos, sem sair do clipe
            let alvo = veSnapFrame(d.tl0 + (e.clientX - d.x0) / VE.pps);
            if (Math.abs((alvo - VE.playhead) * VE.pps) < 6) alvo = VE.playhead;
            let dt = alvo - d.tl0;
            const tls = VEKL.sel.map(s => veTlAt(c, s.t));
            dt = Math.max(dt, c.st - Math.min(...tls));
            dt = Math.min(dt, veEnd(c) - Math.max(...tls));
            d.dt = dt;
            veDraw();
            return;
        }
        // retângulo
        const { t, y } = veTimeFromEvent(e);
        if (!d.ativo && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 3) return;
        d.ativo = true;
        d.tb = t;
        d.yb = y;
        const ta = Math.min(d.ta, d.tb), tb = Math.max(d.ta, d.tb), ya = Math.min(d.ya, d.yb), yb = Math.max(d.ya, d.yb);
        const dentro = [];
        veTrackRows().filter(r => r.kind === 'k' && r.y + r.h > ya && r.y < yb).forEach(r => {
            veKlTempos(c, r.g).forEach(({ t: ts }) => {
                const tl = veTlAt(c, ts);
                if (tl >= ta && tl <= tb) dentro.push({ g: r.g, t: ts });
            });
        });
        VEKL.sel = d.base.concat(dentro.filter(s => !d.base.some(b => b.g === s.g && Math.abs(b.t - s.t) < 1e-4)));
        veDraw();
    }, true);

    const fim = e => {
        const d = VEKL.drag;
        const kd = VE.drag && VE.drag.mode === 'kf' ? VE.drag : null;
        if (kd) setTimeout(() => {
            const c = veKlDono();
            if (c && kd.active && VEKL.selClip === c) VEKL.sel = veKlSelNoTempo(c, Math.round(veSrcAt(c, kd.t1) * 1e4) / 1e4);
        }, 0);
        if (!d) return;
        VEKL.drag = null;
        e.stopImmediatePropagation();
        const c = veKlClip();
        if (d.modo === 'mover' && c) {
            if (d.ativo && Math.abs(d.dt) > 1e-6) {
                if (!veKlPodeEditar(c)) { veDraw(); return; }
                vePushHistory();
                veKlMover(c, d.dt, d.dup);
                veKlDepois();
                if (d.dup) veToast('Quadros-chave duplicados');
                return;
            }
            // clique: leva a agulha até o ◆ (o valor dele aparece no cabeçalho para editar)
            if (!d.ativo && !d.toggle) { VEKL.sel = [d.hit]; veSeek(veTlAt(c, d.hit.t)); }
        }
        veDraw();
    };
    wrap.addEventListener('pointerup', fim, true);
    wrap.addEventListener('pointercancel', fim, true);

    wrap.addEventListener('contextmenu', e => {
        if (!VE.ready) return;
        const { x, y } = veTimeFromEvent(e);
        const row = veRowAt(y);
        if (!row || row.kind !== 'k') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const hit = veKlAt(x, row);
        if (hit && !veKlSelTem(hit.g, hit.t)) { VEKL.sel = [hit]; VEKL.selClip = veKlClip(); veDraw(); }
        veKlMenu(e.clientX, e.clientY, wrap.ownerDocument, !!hit || VEKL.sel.length > 0);
    }, true);

    // cabeçalho: cronômetro, ‹ ◆ ›
    heads.addEventListener('click', e => {
        const b = e.target.closest('[data-kla]');
        if (!b) return;
        const g = b.dataset.klg;
        if (b.dataset.kla === 'sw') veKlCronometro(g);
        else if (b.dataset.kla === 'add') veKlPorTirar(g);
        else if (b.dataset.kla === 'prev') veKlPular(g, -1);
        else if (b.dataset.kla === 'next') veKlPular(g, 1);
    });

    // valores: arrastar muda (como os números azuis do AE); clicar abre para digitar
    heads.addEventListener('pointerdown', e => {
        const el = e.target.closest('.ve-kl-val');
        if (!el || e.button !== 0 || el.querySelector('input')) return;
        const c = veKlClip();
        if (!c) return;
        e.preventDefault();
        const k = el.dataset.klv, G = veKlGrupo(el.dataset.klg);
        const v0 = veProps(c)[k], x0 = e.clientX, win = el.ownerDocument.defaultView;
        let ativo = false;
        const move = ev => {
            const dx = ev.clientX - x0;
            if (!ativo && Math.abs(dx) < 3) return;
            if (!ativo) {
                if (!veKlPodeEditar(c)) { up(); return; }
                ativo = true;
                if (VE.playing) veStop();
                vePushHistory();
                VE._propEdit = true;
                win.document.body.classList.add('ve-kl-scrub');
            }
            const passo = G.passo * (ev.shiftKey ? 10 : ev.ctrlKey ? 0.1 : 1);
            veKlValor(c, k, v0 + dx * passo);
            veKlDepois(true);
        };
        const up = () => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            win.document.body.classList.remove('ve-kl-scrub');
            VE._propEdit = false;
            if (ativo) { veKlDepois(); return; }
            veKlDigitar(el, c, k, G);
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });
}

function veKlDigitar(el, c, k, G) {
    const inp = el.ownerDocument.createElement('input');
    inp.type = 'text';
    inp.className = 've-kl-input';
    inp.value = String(Math.round(veProps(c)[k] * 100) / 100).replace('.', ',');
    el.textContent = '';
    el.appendChild(inp);
    inp.focus();
    inp.select();
    let feito = false;
    const fechar = salvar => {
        if (feito) return;
        feito = true;
        const v = parseFloat(String(inp.value).replace(',', '.'));
        inp.remove();
        if (salvar && isFinite(v) && Math.abs(v - veProps(c)[k]) > 1e-6) {
            if (!veKlPodeEditar(c)) return;
            vePushHistory();
            veKlValor(c, k, v);
            veKlDepois();
        } else veDraw();
    };
    inp.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') fechar(true);
        else if (ev.key === 'Escape') fechar(false);
        else if (ev.key === 'Tab') { ev.preventDefault(); fechar(true); }
    });
    inp.addEventListener('blur', () => fechar(true));
}

// Menu do botão direito na faixa
function veKlMenu(x, y, doc, temSel) {
    veClipMenuFechar();
    const m = doc.createElement('div');
    m.className = 've-ctx';
    const n = VEKL.sel.length;
    const item = (a, txt, kbd, cls) => `<button class="ve-ctx-item${cls ? ' ' + cls : ''}" data-kl="${a}">${txt}${kbd ? `<kbd>${kbd}</kbd>` : ''}</button>`;
    m.innerHTML = `<div class="ve-ctx-title">${temSel ? `${n} quadro${n === 1 ? '' : 's'}-chave` : 'Quadros-chave'}</div>` +
        (temSel ? item('easy', 'Easy Ease', 'F9') + item('easyin', 'Easy Ease de entrada', 'Shift+F9') + item('easyout', 'Easy Ease de saída', 'Ctrl+Shift+F9') +
            '<div class="ve-ctx-sub">Interpolação</div>' +
            item('lin', 'Linear') + item('ease', 'Suave (Easy Ease)') + item('in', 'Acelerar') + item('out', 'Frear') + item('hold', 'Parar (degrau)') +
            '<div class="ve-ctx-sep"></div>' + item('copiar', 'Copiar', 'Ctrl+C') : '') +
        (VEKL.clip ? item('colar', 'Colar na agulha', 'Ctrl+V') : '') +
        (temSel ? item('dup', 'Duplicar na agulha') + '<div class="ve-ctx-sep"></div>' + item('del', 'Apagar', 'Del', 'perigo') : '');
    doc.body.appendChild(m);
    const w = doc.defaultView, r = m.getBoundingClientRect();
    m.style.left = Math.max(6, Math.min(x, w.innerWidth - r.width - 6)) + 'px';
    m.style.top = Math.max(6, Math.min(y, w.innerHeight - r.height - 6)) + 'px';
    m.addEventListener('click', e => {
        const it = e.target.closest('[data-kl]');
        if (!it) return;
        const a = it.dataset.kl;
        veClipMenuFechar();
        if (a === 'easy') veKlEasy('ambos');
        else if (a === 'easyin') veKlEasy('in');
        else if (a === 'easyout') veKlEasy('out');
        else if (['lin', 'ease', 'in', 'out', 'hold'].includes(a)) veKlInterp(a);
        else if (a === 'copiar') veKlCopiar();
        else if (a === 'colar') veKlColar();
        else if (a === 'dup') { const salvo = VEKL.clip; if (veKlCopiar()) veKlColar(); VEKL.clip = salvo; }
        else if (a === 'del') veKlApagar();
    });
    const fora = e => { if (!m.contains(e.target)) veClipMenuFechar(); };
    const tecla = e => { if (e.key === 'Escape') veClipMenuFechar(); };
    setTimeout(() => { doc.addEventListener('pointerdown', fora, true); doc.addEventListener('keydown', tecla, true); }, 0);
    VE._ctx = { m, fechar: () => { doc.removeEventListener('pointerdown', fora, true); doc.removeEventListener('keydown', tecla, true); m.remove(); } };
}

// ── teclas (veOnKey chama antes dos atalhos normais): true = tratada ──
function veKlTecla(e) {
    if (!VE.ready) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey && !e.shiftKey && e.code === 'KeyC' && veKlTemSel()) {
        e.preventDefault();
        return veKlCopiar();
    }
    if (ctrl && !e.altKey && !e.shiftKey && e.code === 'KeyV' && VEKL.clip && veKlTemSel()) {
        e.preventDefault();
        return veKlColar();
    }
    if (!e.altKey && (e.key === 'Delete' || e.key === 'Backspace') && veKlTemSel()) {
        e.preventDefault();
        veKlApagar();
        return true;
    }
    if (e.key === 'Escape' && VEKL.sel.length) { VEKL.sel = []; veDraw(); return true; }
    if (ctrl || e.altKey) return false;
    const letra = /^Key([PSRTU])$/.exec(e.code);
    const c = VE.clips[VE.sel];
    if (!letra || !c || veIsAudio(c)) return false;
    e.preventDefault();
    if (letra[1] === 'U') {
        // U: todas as propriedades animadas (de novo: fecha)
        const anim = VE_KL_GRUPOS.filter(x => veKlAnimado(c, x.g)).map(x => x.g);
        if (!anim.length) { veToast('Este clipe não tem quadros-chave (P, S, R ou T abrem uma propriedade)'); return true; }
        const iguais = anim.length === VEKL.grupos.size && anim.every(g => VEKL.grupos.has(g));
        VEKL.grupos = new Set(iguais ? [] : anim);
    } else {
        const g = VE_KL_GRUPOS.find(x => x.tecla === letra[1]).g;
        if (e.shiftKey) { if (VEKL.grupos.has(g)) VEKL.grupos.delete(g); else VEKL.grupos.add(g); }
        else VEKL.grupos = new Set(VEKL.grupos.size === 1 && VEKL.grupos.has(g) ? [] : [g]);
    }
    VEKL.chave = '';
    veDraw();
    return true;
}

document.addEventListener('DOMContentLoaded', veKlIniciar);
