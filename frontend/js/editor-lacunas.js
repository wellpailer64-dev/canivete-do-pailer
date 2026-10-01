// =========================================================
// Pocket Editor — espaço vazio e seleção de faixa para a frente (como no Premiere)
// Espaço vazio: clicar entre dois clipes de uma trilha seleciona o espaço inteiro (VE.gapSel = {tr, kind, a, b});
// Delete fecha o espaço: tudo o que começa depois dele, em todas as trilhas destravadas, volta junto (a montagem
// não se desfaz). Com clipe de outra trilha dentro do espaço, não fecha (igual ao Premiere com Sync Lock);
// trilha travada (cadeado) fica parada.
// Ferramenta Selecionar faixa para a frente (A) / para trás (Shift+A): clicar pega todos os clipes dali em diante
// (ou para trás) em todas as trilhas; com Shift, só a trilha clicada. Arrastar move o grupo inteiro.
// =========================================================

VE.gapSel = null;

const veGapPista = (c, kind) => (kind === 'a' ? veOcupaA(c) : veOcupaV(c));

// Espaço vazio na linha (trilha + V/A) no instante t, até o próximo clipe; null se não há clipe depois
function veGapAt(t, row) {
    if (!row || (row.kind !== 'v' && row.kind !== 'a')) return null;
    const tr = veTrackIndex(row), kind = row.kind;
    const pista = VE.clips.filter(c => c.tr === tr && veGapPista(c, kind));
    if (pista.some(c => c.st <= t + VE_EPS && veEnd(c) >= t - VE_EPS)) return null;
    const antes = pista.filter(c => veEnd(c) <= t + VE_EPS), depois = pista.filter(c => c.st >= t - VE_EPS);
    if (!depois.length) return null;
    const a = antes.length ? Math.max(...antes.map(veEnd)) : 0, b = Math.min(...depois.map(c => c.st));
    return b - a >= veFrame() / 2 ? { tr, kind, a, b } : null;
}

// O espaço selecionado continua vazio e com clipe depois? (a timeline pode ter mudado)
function veGapValido(g) {
    if (!g) return null;
    const pista = VE.clips.filter(c => c.tr === g.tr && veGapPista(c, g.kind));
    if (pista.some(c => c.st < g.b - VE_EPS && veEnd(c) > g.a + VE_EPS)) return null;
    return pista.some(c => Math.abs(c.st - g.b) < VE_EPS) ? g : null;
}

// Delete com o espaço selecionado: fecha e puxa o que vem depois (todas as trilhas destravadas e as legendas)
function veFecharEspaco() {
    const g = veGapValido(VE.gapSel);
    VE.gapSel = null;
    if (!g) { veDraw(); return false; }
    if (veTrkLocked(g.tr)) { veAvisoBloqueio(); return true; }
    const d = g.b - g.a;
    const bloqueia = VE.clips.filter(c => !veTrkLocked(c.tr) && c.st < g.b - VE_EPS && veEnd(c) > g.a + VE_EPS);
    if (bloqueia.length) {
        veToast(veT('Não dá para fechar o espaço: há clipes em outras trilhas nesse trecho (trave a trilha com o cadeado para ela não se mexer)'));
        veDraw();
        return true;
    }
    vePushHistory();
    VE.clips.forEach(c => { if (!veTrkLocked(c.tr) && c.st >= g.b - VE_EPS) c.st = Math.max(0, c.st - d); });
    VE.legendas = (VE.legendas || []).map(l => (l.st >= g.b - VE_EPS ? veLegMover(l, -Math.min(d, l.st)) : l));
    VE.sel = -1; VE.selx = null;
    veRelayout();
    veAfterEdit(VE.playhead >= g.b ? VE.playhead - d : Math.min(VE.playhead, veNavDur()));
    veToast(`${veT('Espaço fechado')} (${veShort(d)})`);
    return true;
}

function veGapDesenhar(ctx, rowOf, X) {
    const g = veGapValido(VE.gapSel);
    if (!g) return;
    const r = rowOf((g.kind === 'a' ? 'A' : 'V') + (g.tr + 1));
    if (!r) return;
    const x1 = X(g.a), x2 = X(g.b);
    ctx.save();
    ctx.fillStyle = 'rgba(212,129,74,0.22)';
    ctx.fillRect(x1, r.y + 3, x2 - x1, r.h - 6);
    ctx.strokeStyle = '#D4814A';
    ctx.lineWidth = 2;
    ctx.strokeRect(x1 + 1, r.y + 4, Math.max(0, x2 - x1 - 2), r.h - 8);
    ctx.restore();
}

// ── ferramenta Selecionar faixa para a frente (A) / para trás (Shift+A) ──
// Devolve o clipe para começar o arraste (ou null)
function veFaixaSelecionar(e, t, row) {
    const para = VE.tool === 'fwd' ? 1 : -1, tr = veTrackIndex(row);
    const i = veClipAtTrack(t, tr, row.kind), clicado = i >= 0 ? VE.clips[i] : null;
    const T = clicado ? (para > 0 ? clicado.st : veEnd(clicado)) : t;
    let lista = VE.clips.filter(c => !veLocked(c) && (para > 0 ? c.st >= T - VE_EPS : veEnd(c) <= T + VE_EPS)
        && (!e.shiftKey || c.tr === tr));
    if (e.shiftKey) lista = [...new Set(lista.flatMap(c => veVinculados(c)))].filter(c => !veLocked(c));
    if (clicado && !veLocked(clicado) && !lista.includes(clicado)) lista.push(clicado);
    if (!lista.length) { veSelDefinir([], null); return null; }
    const prim = clicado && lista.includes(clicado) ? clicado
        : lista.reduce((m, c) => (para > 0 ? c.st < m.st : veEnd(c) > veEnd(m)) ? c : m);
    veSelDefinir(lista, prim);
    veToast(`${lista.length} ${veT(lista.length > 1 ? 'clipes selecionados' : 'clipe selecionado')}`);
    return prim;
}
