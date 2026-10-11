// Caneta na timeline (a Pen tool do Premiere): cada clipe mostra a linha de OPACIDADE (vídeo, 0–100%) e a de VOLUME
// (áudio, dB). Caneta (P): clicar na linha cria um quadro-chave ali (valor da altura do clique); arrastar um ponto muda
// tempo e valor; arrastar a linha sem pontos muda o valor fixo (opacidade do clipe / ganho). Com a Seleção, Ctrl+clique
// na linha cria o ponto e arrastar um ponto existente também funciona. Alt+clique num ponto (Caneta) apaga.
// Opacidade = c.k.op (os ◆ de sempre, Controles de efeito); volume = c.k.vol [{t: tempo da fonte, v: dB}], linear em dB:
// prévia (veMixClipes → envelope em editor-audio.js) e exportação (video_cutter._grafo_mix, volume com expressão).
// Na monitor a mesma ferramenta é a Caneta de máscara (editor-motion.js), como no Premiere.
// Configurações da timeline (chave inglesa no topo das trilhas): mostrar/esconder as linhas.

const VECN = { arr: null, dica: null };
const VE_CN_DB_MIN = -48, VE_CN_DB_MAX = 6;   // escala da linha de volume (embaixo = −∞)

function veCnMostrar(v) {
    try {
        if (v !== undefined) localStorage.setItem('ve-cn-linhas', v ? '1' : '0');
        return localStorage.getItem('ve-cn-linhas') !== '0';
    } catch (e) { return true; }
}
const veCnPos = (kind, v) => kind === 'v' ? Math.max(0, Math.min(1, v / 100))
    : v <= VE_CN_DB_MIN ? 0 : Math.max(0, Math.min(1, (v - VE_CN_DB_MIN) / (VE_CN_DB_MAX - VE_CN_DB_MIN)));
const veCnValDe = (kind, pos) => kind === 'v' ? Math.round(Math.max(0, Math.min(1, pos)) * 1000) / 10
    : pos <= 0.005 ? VE_MIX_MIN : Math.round((VE_CN_DB_MIN + Math.min(1, pos) * (VE_CN_DB_MAX - VE_CN_DB_MIN)) * 10) / 10;
const veCnFmt = (kind, v) => kind === 'v' ? `${String(v).replace('.', ',')}%` : v <= VE_MIX_MIN ? '−∞ dB' : `${v > 0 ? '+' : ''}${String(v.toFixed(1)).replace('.', ',')} dB`;
const veCnProp = kind => kind === 'v' ? 'op' : 'vol';

// volume (dB) dos quadros-chave no tempo da fonte t: linear em dB entre os pontos, constante fora
function veCnVolEm(ks, t) {
    if (!ks || !ks.length) return 0;
    if (t <= ks[0].t) return ks[0].v;
    const n = ks.length - 1;
    if (t >= ks[n].t) return ks[n].v;
    let j = 0; while (j < n && ks[j + 1].t < t) j++;
    const a = ks[j], b = ks[j + 1], f = (t - a.t) / Math.max(1e-9, b.t - a.t);
    return a.v + (b.v - a.v) * f;
}
// valor da linha no tempo da fonte
function veCnValor(c, kind, t) {
    if (kind === 'v') return veKfOn(c, 'op') ? veKfValue(c.k.op, t) : veProps(c).op;
    return veKfOn(c, 'vol') ? veCnVolEm(c.k.vol, t) : 0;
}

// área da linha dentro da parte do clipe (vídeo: abaixo da faixa do nome)
function veCnArea(kind, top, h) {
    const y0 = top + (kind === 'v' ? Math.min(15, h * 0.3) : Math.min(6, h * 0.15)), y1 = top + h - 3;
    return { y0, y1 };
}
const veCnY = (kind, v, A) => A.y1 - veCnPos(kind, v) * (A.y1 - A.y0);

// desenho (chamado pelo veDraw para cada parte do clipe): st = início desenhado (arrastando, onde ele está)
function veCnDesenhar(ctx, c, kind, cx, top, cw, h, st) {
    if (!(veCnMostrar() || VE.tool === 'caneta') || h < 22 || cw < 6) return;
    if (kind === 'v' && (veIsAudio(c) || veIsAdj(c) && false)) return;
    const A = veCnArea(kind, top, h), vel = veVel(c), prop = veCnProp(kind);
    const X = t => (st + (t - c.s) / vel - VE.view) * VE.pps;
    const ks = veKfOn(c, prop) ? c.k[prop].filter(q => q.t >= c.s - 1e-4 && q.t <= c.e + 1e-4) : [];
    ctx.save();
    ctx.beginPath(); ctx.rect(cx, top, cw, h); ctx.clip();
    ctx.strokeStyle = kind === 'v' ? 'rgba(255,214,90,0.95)' : 'rgba(255,214,90,0.95)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (!ks.length || kind === 'v' && ks.length) {
        // opacidade com curvas: amostra a cada 3 px; volume sem pontos: reta
        const passo = ks.length ? 3 : cw;
        for (let x = cx; x <= cx + cw + passo; x += passo) {
            const xx = Math.min(x, cx + cw), t = c.s + ((VE.view + xx / VE.pps) - st) * vel;
            const y = veCnY(kind, veCnValor(c, kind, Math.max(c.s, Math.min(c.e, t))), A);
            x === cx ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y);
        }
    } else {
        ctx.moveTo(cx, veCnY(kind, ks[0].v, A));
        ks.forEach(q => ctx.lineTo(X(q.t), veCnY(kind, q.v, A)));
        ctx.lineTo(cx + cw, veCnY(kind, ks[ks.length - 1].v, A));
    }
    ctx.stroke();
    ks.forEach(q => {
        const x = X(q.t), y = veCnY(kind, q.v, A), arr = VECN.arr && VECN.arr.c === c && VECN.arr.q === q;
        ctx.fillStyle = arr ? '#fff' : '#ffd65a'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, arr ? 4 : 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    if (VECN.dica && VECN.dica.c === c && VECN.dica.kind === kind) {   // valor enquanto arrasta
        const d = VECN.dica, tw = ctx.measureText(d.txt).width + 10;
        ctx.font = '600 10px Cascadia Mono, Consolas, monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(d.x + 8, d.y - 18, tw, 15);
        ctx.fillStyle = '#ffd65a'; ctx.fillText(d.txt, d.x + 13, d.y - 7);
    }
    ctx.restore();
}

// parte do clipe sob o ponteiro: {c, kind, A, top, h} ou null
function veCnAlvo(t, y, row) {
    if (!row || (row.kind !== 'v' && row.kind !== 'a')) return null;
    const i = veClipAtTrack(t, veTrackIndex(row), row.kind);
    const c = i >= 0 ? VE.clips[i] : null;
    if (!c || veLocked(c)) return null;
    if (row.kind === 'v' && veIsAudio(c)) return null;
    if (row.kind === 'a' && (!veTemSom(c) || c.x === 'v')) return null;
    const top = row.y + 3, h = row.h - 6;
    if (h < 22) return null;
    return { c, kind: row.kind, A: veCnArea(row.kind, top, h), top, h };
}

// clique na timeline: true se a Caneta (ou Ctrl+clique / ponto com a Seleção) tratou
function veCnApertar(e, t, x, y, row) {
    if (e.button !== 0) return false;
    const caneta = VE.tool === 'caneta';
    if (!caneta && VE.tool !== 'select') return false;
    if (!caneta && !veCnMostrar()) return false;
    const a = veCnAlvo(t, y, row); if (!a) return false;
    const { c, kind, A } = a, prop = veCnProp(kind), vel = veVel(c);
    const X = q => (c.st + (q.t - c.s) / vel - VE.view) * VE.pps;
    const ks = veKfOn(c, prop) ? c.k[prop] : [];
    const perto = ks.find(q => Math.abs(X(q) - x) <= 5 && Math.abs(veCnY(kind, q.v, A) - y) <= 6);
    const srcT = Math.max(c.s, Math.min(c.e, c.s + (veSnapFrame(t) - c.st) * vel));
    const naLinha = Math.abs(veCnY(kind, veCnValor(c, kind, srcT), A) - y) <= 5;
    if (!caneta && !perto && !(e.ctrlKey && naLinha)) return false;
    e.preventDefault(); e.stopPropagation();
    vePushHistory();
    const lista = ks.map(q => ({ ...q }));
    c.k = { ...(c.k || {}), [prop]: lista };
    if (perto && caneta && e.altKey) {   // Alt+clique no ponto: apaga
        lista.splice(ks.indexOf(perto), 1);
        if (!lista.length) delete c.k[prop];
        veCnMudou(c, kind); return true;
    }
    let q;
    if (perto) q = lista[ks.indexOf(perto)];
    else if (!ks.length && !e.ctrlKey && caneta && naLinha) q = null;   // linha sem pontos: arrastar muda o valor fixo
    else {
        q = { t: Math.round(srcT * 1e4) / 1e4, v: caneta && !naLinha ? veCnValDe(kind, (A.y1 - y) / (A.y1 - A.y0)) : veCnValor(c, kind, srcT) };
        lista.push(q); lista.sort((m, n) => m.t - n.t);
    }
    VECN.arr = { c, q, kind, A };
    const wrap = $ve('ve-tl-wrap'), win = wrap.ownerDocument.defaultView, x0 = e.clientX, y0 = e.clientY;
    let moveu = false;
    const mover = ev => {
        if (!moveu && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
        moveu = true;
        const p = veTimeFromEvent(ev), pos = (A.y1 - p.y) / (A.y1 - A.y0), v = veCnValDe(kind, pos);
        if (q) {
            const j = lista.indexOf(q), tMin = j > 0 ? lista[j - 1].t + 1e-3 : c.s, tMax = j < lista.length - 1 ? lista[j + 1].t - 1e-3 : c.e;
            q.t = Math.round(Math.max(tMin, Math.min(tMax, c.s + (veSnapFrame(p.t) - c.st) * vel)) * 1e4) / 1e4;
            q.v = v;
        } else if (kind === 'v') { delete c.k.op; c.p = { ...(c.p || {}), op: v }; }
        else { delete c.k.vol; c.g = Math.max(-60, Math.min(15, v <= VE_MIX_MIN ? -60 : v)); }
        VECN.dica = { c, kind, x: p.x, y: p.y, txt: veCnFmt(kind, q ? q.v : kind === 'v' ? v : c.g) };
        veDraw(); if (kind === 'v') veDrawMonitorSoon();
    };
    const solta = () => {
        win.removeEventListener('pointermove', mover); win.removeEventListener('pointerup', solta);
        VECN.arr = null; VECN.dica = null;
        // linha sem pontos, só clicou (sem arrastar): cria o ponto ali, como a Caneta do Premiere
        if (!q && !moveu) { lista.push({ t: Math.round(srcT * 1e4) / 1e4, v: veCnValor(c, kind, srcT) }); lista.sort((m, n) => m.t - n.t); }
        if (c.k && !Object.keys(c.k).length) delete c.k;
        veCnMudou(c, kind);
    };
    win.addEventListener('pointermove', mover); win.addEventListener('pointerup', solta);
    veCnMudou(c, kind, true);
    return true;
}

function veCnMudou(c, kind, leve) {
    if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
    if (kind === 'a') { if (veMixAtivo()) veAudioEditou(); }
    else { veCacheInvalidate(); veDrawMonitorSoon(); }
    if (leve) veDraw(); else veRefresh();
}

// para a exportação/prévia de som: pontos do volume em [segundos desde st0 na timeline, dB]
function veCnVolExport(c, st0) {
    if (!veKfOn(c, 'vol')) return null;
    const vel = veVel(c);
    return c.k.vol.map(q => [+(c.st + (q.t - c.s) / vel - st0).toFixed(4), +Math.max(-96, q.v).toFixed(2)]);
}

// ── Configurações da timeline (chave inglesa no topo das trilhas) ──
function veTlConfigMenu(btn) {
    const doc = btn.ownerDocument;
    doc.querySelectorAll('.ve-tl-cfg').forEach(m => m.remove());
    const m = doc.createElement('div');
    m.className = 've-ctx ve-tl-cfg';
    const it = (id, nome, on) => `<button class="ve-ctx-item" data-cfg="${id}">${on ? '✓' : '<span style="display:inline-block;width:.8em"></span>'} ${veT(nome)}</button>`;
    m.innerHTML = it('linhas', 'Mostrar linhas de volume e opacidade', veCnMostrar())
        + it('snap', 'Ímã (encaixar)', VE.snap) + it('vinculo', 'Seleção vinculada', VE.vinculo)
        + '<hr>' + it('alvo-todas', 'Todas as trilhas como alvo', false);
    doc.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px';
    const fora = e => { if (!m.contains(e.target)) { m.remove(); doc.removeEventListener('pointerdown', fora, true); } };
    setTimeout(() => doc.addEventListener('pointerdown', fora, true), 0);
    m.addEventListener('click', e => {
        const b = e.target.closest('[data-cfg]'); if (!b) return;
        const id = b.dataset.cfg;
        if (id === 'linhas') { veCnMostrar(!veCnMostrar()); veDraw(); }
        else if (id === 'snap') veToggleSnap();
        else if (id === 'vinculo') veToggleVinculo();
        else if (id === 'alvo-todas') { [...VE_TRK.v, ...VE_TRK.a].forEach(t => { if (t) delete t.semAlvo; }); veBuildHeads(); veToast(veT('Todas as trilhas como alvo')); }
        m.remove();
    });
}

window.VECN_API = { mostrar: veCnMostrar, valor: veCnValor, volExport: veCnVolExport };
