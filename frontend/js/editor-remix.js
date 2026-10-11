// Remix de música (a Remix tool do Premiere): ferramenta Remix (Shift+R, no grupo da Velocidade) — arrastar a ponta
// direita de um clipe de música estica ou encurta a MÚSICA INTEIRA para a duração nova, mantendo o começo e o final de
// verdade (Functions/remix.py: saltos entre compassos parecidos, emendas no começo do compasso com crossfade).
// O clipe passa a usar o arquivo remixado como mídia comum (oculta no painel Projeto: m.rmxDe = música original,
// m.rmxAlvo = duração pedida, m.rmxEm = emendas em s); as emendas aparecem como "ondinha" no clipe, como no Premiere.
// Remixar de novo parte sempre da original. Clipe › "Remix: voltar à música original". Projeto aberto sem o arquivo
// (cache limpo): refeito igual (veRmxRestaurar).

const VERMX = { arr: null };

const veRmxEh = c => { const m = c && veMediaOf(c); return !!(m && m.rmxDe != null); };
const veRmxOrig = c => { const m = veMediaOf(c); return m && m.rmxDe != null ? VE.media[m.rmxDe] : m; };

function veRmxPointer(e, x, row) {
    const borda = veEdgeAt(x, row);
    const { t } = veTimeFromEvent(e);
    const i = borda ? borda.i : row && row.kind !== 'l' ? veClipAtTrack(t, veTrackIndex(row), row.kind) : -1;
    const c = i >= 0 ? VE.clips[i] : null;
    if (!c) return;
    VE.sel = i; veRenderClips(); veDraw();
    const orig = veRmxOrig(c);
    if (!veIsAudio(c) || !orig || !orig.path || veMediaOffline(orig)) { veToast(veT('Remix: só em música (clipe de áudio solto)')); return; }
    if (!borda || borda.side !== 'r') { veToast(veT('Remix: arraste a ponta DIREITA da música')); return; }
    if (veLocked(c)) { veAvisoBloqueio(); return; }
    if (Math.abs(veVel(c) - 1) > 1e-3) { veToast(veT('Remix: tire a velocidade do clipe antes (100%)')); return; }
    if (VE.playing) veStop();
    // não passa do começo do próximo clipe da trilha
    const viz = VE.clips.filter(o => o !== c && o.tr === c.tr && veConflita(o, c) && o.st >= veEnd(c) - VE_EPS);
    const lim = Math.min(Infinity, ...viz.map(o => o.st));
    VERMX.arr = { c, st: c.st, alvo: veLen(c), lim, x0: e.clientX };
    const win = $ve('ve-tl-wrap').ownerDocument.defaultView;
    const mover = ev => {
        const p = veTimeFromEvent(ev);
        VERMX.arr.alvo = Math.max(10, Math.min(lim - c.st, veSnapFrame(veMoveSnap ? veMoveSnap(p.t, i) : p.t) - c.st, 3600));
        veDraw();
    };
    const solta = ev => {
        win.removeEventListener('pointermove', mover); win.removeEventListener('pointerup', solta);
        const a = VERMX.arr; VERMX.arr = null; veDraw();
        if (Math.abs(ev.clientX - a.x0) < 3) return;   // só clicou
        veRmxAplicar(a.c, +a.alvo.toFixed(2));
    };
    win.addEventListener('pointermove', mover); win.addEventListener('pointerup', solta);
}

// duração nova enquanto arrasta: faixa tracejada + rótulo
function veRmxDesenharArraste(ctx) {
    const a = VERMX.arr; if (!a) return;
    const row = veTrackRows().find(r => r.id === 'A' + (a.c.tr + 1)); if (!row) return;
    const x0 = (a.st - VE.view) * VE.pps, x1 = (a.st + a.alvo - VE.view) * VE.pps;
    ctx.save();
    ctx.strokeStyle = '#ffd65a'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
    ctx.strokeRect(x0 + 1, row.y + 3, x1 - x0 - 2, row.h - 6);
    const txt = `${veT('Remix')} ${veShort(a.alvo)}`;
    ctx.setLineDash([]); ctx.font = '600 11px Segoe UI';
    const tw = ctx.measureText(txt).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(x1 - tw, row.y - 16, tw, 16);
    ctx.fillStyle = '#ffd65a'; ctx.fillText(txt, x1 - tw + 6, row.y - 4);
    ctx.restore();
}

// emendas do remix no clipe: zigue-zague vertical (como as do Premiere)
function veRmxEmendas(ctx, c, cx, top, cw, h, st) {
    const m = veMediaOf(c); if (!m || !m.rmxEm || !m.rmxEm.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3;
    m.rmxEm.forEach(e => {
        if (e < c.s || e > c.e) return;
        const x = (st + (e - c.s) / veVel(c) - VE.view) * VE.pps;
        if (x < cx || x > cx + cw) return;
        ctx.beginPath();
        for (let y = top + 2, k = 0; y <= top + h - 2; y += 4, k++) ctx[k ? 'lineTo' : 'moveTo'](x + (k % 2 ? 2.5 : -2.5), y);
        ctx.stroke();
    });
    ctx.restore();
}

// pede o remix ao Python e troca a mídia do clipe pela música remixada
async function veRmxAplicar(c, alvo) {
    const orig = veRmxOrig(c), api = window.pywebview.api;
    veToast(`${veT('Remixando')} ${vePjNome(orig)} ${veT('para')} ${veShort(alvo)}…`);
    const r = await api.ve_remix(vePrPrefs().dir, orig.path, alvo);
    if (!r || !r.success) { veToast(`${veT('Remix')}: ${(r && r.error) || '?'}`); return; }
    const nm = await veRmxMidia(orig, alvo, r);
    if (!nm || !VE.clips.includes(c)) return;
    vePushHistory();
    // a música inteira remixada; a duração do clipe fica a pedida (o arquivo sai ±1 compasso)
    c.m = nm.id; c.s = 0; c.e = Math.min(nm.dur, alvo + 0.001);
    if (c.k) { const k = { ...c.k }; delete k.vol; c.k = k; }   // pontos de volume eram do tempo da música antiga
    veRelayout(); veAfterEdit(VE.playhead);
    if (veMixAtivo()) veAudioEditou();
    veToast(`${veT('Remix pronto')}: ${veShort(nm.dur)} · ${r.emendas.length} ${r.emendas.length === 1 ? veT('emenda') : veT('emendas')}`);
}

async function veRmxMidia(orig, alvo, r, nmExistente) {
    let nm = nmExistente || VE.media.find(x => x && !x.removido && x.path === r.path);
    if (!nm) { nm = { id: VE.media.length, kind: 'audio', name: `${vePjNome(orig)} (${veT('remix')} ${veShort(alvo)})` }; VE.media.push(nm); }
    Object.assign(nm, { kind: 'audio', path: r.path, rmxDe: orig.id, rmxAlvo: alvo, rmxEm: r.emendas.map(x => +x.toFixed(3)) });
    delete nm.offline; delete nm.missing; delete nm.lost;
    const a = await window.pywebview.api.video_cutter_add_audio(r.path);
    if (!a || !a.success) { veToast((a && a.error) || veT('Não foi possível abrir o remix')); return null; }
    Object.assign(nm, { dur: a.dur, peaks: a.peaks || [], url: a.url, quadros: a.quadros });
    veAudioRegistrar(nm.id, a.url, a.quadros);
    return nm;
}

// Clipe › Remix: voltar à música original (mesma duração na timeline, aparada no fim)
function veRmxOriginal() {
    const c = VE.clips[VE.sel]; if (!veRmxEh(c)) return;
    const orig = veRmxOrig(c);
    vePushHistory();
    c.m = orig.id; c.s = 0; c.e = Math.min(veLen(c), orig.dur || veLen(c));
    veRelayout(); veAfterEdit(VE.playhead);
    if (veMixAtivo()) veAudioEditou();
    veToast(veT('Música original de volta'));
}

// projeto aberto e o remix sumiu do cache: refaz igual a partir da original
function veRmxRestaurar(nm) {
    const orig = VE.media[nm.rmxDe];
    if (!orig || veMediaOffline(orig) || !orig.path || !nm.rmxAlvo) return false;
    nm.offline = true;
    window.pywebview.api.ve_remix(vePrPrefs().dir, orig.path, nm.rmxAlvo).then(r => {
        if (r && r.success) veRmxMidia(orig, nm.rmxAlvo, r, nm).then(() => { veRefresh(); if (veMixAtivo()) veAudioEditou(); });
    });
    return true;
}

window.VERMX_API = { aplicar: veRmxAplicar, original: veRmxOriginal, eh: veRmxEh };
