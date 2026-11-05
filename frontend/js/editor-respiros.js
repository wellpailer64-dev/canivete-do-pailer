// Cortar respiros e pausas (Edição automática, etapa 1). A detecção é Functions/respiros.py: limiar vindo do próprio
// áudio, borda sensível (não come o fim das palavras) e sobra de pausa para o ritmo continuar natural.
// veRespirosPlano(opc) só calcula (não mexe na timeline); veRespirosAplicar(opc) corta tudo num único desfazer.
// opc: { preset: 'suave'|'normal'|'agressivo', min_pausa, sobra, sobra_longa, clips: [clipes] (padrão: selecionados, senão
// o áudio falado da trilha mais baixa) }

function veRespirosAlvos(opc) {
    const sel = (opc && opc.clips) || veSelLista();
    if (sel.length) return sel.filter(c => veTemSom(c) && !veLocked(c));
    const falados = VE.clips.filter(c => veTemSom(c) && !veLocked(c) && veMediaOf(c) && veMediaOf(c).kind !== 'image');
    if (!falados.length) return [];
    const base = Math.min(...falados.map(c => +c.tr || 0));
    return falados.filter(c => (+c.tr || 0) === base);
}

async function veRespirosPlano(opc) {
    opc = opc || {};
    const intervalos = [];
    for (const c of veRespirosAlvos(opc)) {
        const m = veMediaOf(c), path = m && (m.path || (m.id === 0 ? VE.path : ''));
        if (!path) continue;
        const dur = veEnd(c) - c.st, v = veVel(c);
        const r = await window.pywebview.api.ve_respiros(path, c.s, dur * v, opc.preset || 'normal', opc.min_pausa ?? null, opc.sobra ?? null, opc.sobra_longa ?? null);
        if (!r || !r.success) { if (r && r.error) veToast('Respiros: ' + r.error); continue; }
        // fonte → timeline (respeita velocidade); só o que está dentro do clipe
        (r.cortes || []).forEach(([a, b]) => {
            const ta = c.st + a / v, tb = c.st + b / v;
            if (tb > ta) intervalos.push([Math.max(c.st, ta), Math.min(veEnd(c), tb)]);
        });
    }
    intervalos.sort((x, y) => x[0] - y[0]);
    const fund = [];
    intervalos.forEach(iv => { const u = fund[fund.length - 1]; if (u && iv[0] <= u[1] + 1e-6) u[1] = Math.max(u[1], iv[1]); else fund.push([...iv]); });
    return { intervalos: fund, removido: +fund.reduce((s, [a, b]) => s + (b - a), 0).toFixed(2) };
}

async function veRespirosAplicar(opc) {
    if (!VE.ready) return { ok: false, motivo: 'editor não está pronto' };
    const plano = await veRespirosPlano(opc);
    if (!plano.intervalos.length) { veToast('Sem respiros para cortar'); return { ok: true, cortes: 0, removido: 0 }; }
    const n0 = VE.history.length;
    let feitos = 0;
    for (let i = plano.intervalos.length - 1; i >= 0; i--) {     // de trás para frente: os tempos de antes não andam
        const [a, b] = plano.intervalos[i];
        if (veRippleRemove(a, b)) feitos++;
    }
    if (VE.history.length > n0 + 1) VE.history.splice(n0 + 1);    // um desfazer só (o estado de antes de tudo)
    veUpdateUndo();
    veToast(`Respiros: ${feitos} cortes, ${plano.removido.toFixed(1)} s a menos`);
    return { ok: true, cortes: feitos, removido: plano.removido };
}

// ── painel Animação › Respiros (mesmo visual do Autozoom, na cor do tema) ──
const VERS = { preset: 'normal', rodando: false, ultimo: null };
try { const p = localStorage.getItem('ve-rs-preset'); if (p && /^(suave|normal|agressivo)$/.test(p)) VERS.preset = p; } catch (e) {}

function veRsRender() {
    const box = $ve('ve-rs-corpo'); if (!box) return;
    const seg = itens => `<div class="ve-az-seg">${itens.map(([v, nome, sub, dica]) => `<button type="button" data-rs="${v}" class="${VERS.preset === v ? 'on' : ''}" title="${veT(dica)}"><b>${veT(nome)}</b><small>${sub}</small></button>`).join('')}</div>`;
    const u = VERS.ultimo;
    box.innerHTML = `
        <div class="ve-az-linha"><span class="ve-az-rot">${veT('Intensidade')}</span>${seg([
            ['suave', 'Suave', '≥ 0,7 s', 'Só pausas longas; deixa ~0,38 s de respiro'],
            ['normal', 'Normal', '≥ 0,45 s', 'Pausas médias; deixa ~0,24 s de respiro'],
            ['agressivo', 'Ágil', '≥ 0,3 s', 'Ritmo de reel; deixa ~0,15 s de respiro']])}</div>
        <button type="button" class="ve-az-gerar" data-rs-acao="cortar"${VERS.rodando ? ' disabled' : ''}>
            ${VERS.rodando ? `<span class="ve-az-gira"></span>${veT('Ouvindo a fala…')}` : `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M6 18 18 6"/></svg>${veT('Cortar respiros')}`}</button>
        <div class="ve-az-pe"><span>${u ? `${u.cortes} ${veT(u.cortes === 1 ? 'corte' : 'cortes')} · −${u.removido.toFixed(1)} s` : veT('Selecionados, ou a fala da trilha mais baixa')}</span>
            ${u && u.cortes ? `<button type="button" data-rs-acao="desfazer">${veT('Desfazer')}</button>` : ''}</div>`;
}

async function veRsCortar() {
    if (VERS.rodando) return;
    if (!VE.ready) { veToast(veT('Abra um vídeo primeiro')); return; }
    VERS.rodando = true; veRsRender();
    try { VERS.ultimo = await veRespirosAplicar({ preset: VERS.preset }); }
    catch (e) { veToast('Respiros: ' + (e && e.message || e)); }
    finally { VERS.rodando = false; veRsRender(); }
}

function veRsInit() {
    const sec = $ve('ve-rs-sec'); if (!sec || sec._ok) return;
    sec._ok = true;
    sec.addEventListener('click', e => {
        const b = e.target.closest('[data-rs],[data-rs-acao]'); if (!b) return;
        if (b.dataset.rs) { VERS.preset = b.dataset.rs; try { localStorage.setItem('ve-rs-preset', VERS.preset); } catch (x) {} veRsRender(); return; }
        if (b.dataset.rsAcao === 'cortar') veRsCortar();
        else if (b.dataset.rsAcao === 'desfazer') { if (typeof veUndo === 'function') veUndo(); VERS.ultimo = null; veRsRender(); }
    });
    veRsRender();
}
if (typeof I18N_EN === 'object') Object.entries({
    'Respiros': 'Breaths', 'corta pausas e respiros sem perder a naturalidade': 'cuts pauses and breaths, keeping it natural',
    'Intensidade': 'Intensity', 'Normal': 'Normal', 'Ágil': 'Snappy', 'Cortar respiros': 'Cut breaths', 'Ouvindo a fala…': 'Listening…',
    'corte': 'cut', 'cortes': 'cuts', 'Desfazer': 'Undo', 'Selecionados, ou a fala da trilha mais baixa': 'Selected clips, or the speech on the lowest track',
    'Sem respiros para cortar': 'No breaths to cut', 'Abra um vídeo primeiro': 'Open a video first',
}).forEach(([k, v]) => { if (!(k in I18N_EN)) I18N_EN[k] = v; });
document.addEventListener('DOMContentLoaded', veRsInit);
if (document.readyState !== 'loading') setTimeout(veRsInit, 0);
