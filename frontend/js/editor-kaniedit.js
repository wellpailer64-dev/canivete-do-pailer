// KaniEdit (painel próprio do Vídeo): edição automática de 1 clique + cada etapa avulsa (Respiros, Autozoom, J-cut).
// Ordem da Edição completa: respiros → J-cut → tracker (o vídeo segue o rosto) → transcrição da timeline já cortada →
// legenda Premium (com os SFX dela) → autozoom. Tudo vira UM desfazer. Cada etapa pode ser desligada; as opções de
// cada uma vêm da sua seção. Cada linha mostra o andamento (agora / feito / pulou), como no AutoEdit.

const VEKED = { rodando: false, cancelar: false, etapa: '', ultimo: null, st: {}, opc: { respiros: true, jcut: true, tracker: true, legenda: true, autozoom: true } };
try { Object.assign(VEKED.opc, JSON.parse(localStorage.getItem('ve-ke-opc') || '{}')); } catch (e) {}
const VE_KE_ETAPAS = [
    ['respiros', 'Cortar respiros', 'pausas e respiros, com sobra natural'],
    ['jcut', 'J-cut', 'som da próxima frase entra antes'],
    ['tracker', 'Seguir o rosto', 'vídeo deitado em quadro em pé, ou rosto que anda'],
    ['legenda', 'Legenda Premium', 'com efeitos sonoros nas ênfases'],
    ['autozoom', 'Autozoom', 'zoom no rosto nos momentos fortes'],
];
const veKeTemJcut = () => typeof veJcutAplicar === 'function';

function veKeRender() {
    const box = $ve('ve-ke-corpo'); if (!box) return;
    const u = VEKED.ultimo;
    box.innerHTML = `
        <div class="ve-ke-etapas">${VE_KE_ETAPAS.map(([k, nome, sub]) => {
            const off = k === 'jcut' && !veKeTemJcut(), st = VEKED.st[k];
            const tag = st === 'agora' ? `<span class="ve-ke-st agora"><span class="ve-az-gira"></span></span>`
                : st ? `<span class="ve-ke-st${st === 'ok' ? ' ok' : ''}">${st === 'ok' ? '✓ ' + veT('feito') : veT(st)}</span>` : '';
            return `<label class="ve-az-chave${off ? ' ve-ke-off' : ''}" title="${veT(off ? 'Em construção' : sub)}">
                <input type="checkbox" data-ke-opc="${k}"${VEKED.opc[k] && !off ? ' checked' : ''}${off || VEKED.rodando ? ' disabled' : ''}><span class="ve-az-trilho"><span></span></span>
                <span class="ve-ke-nome">${veT(nome)}<small>${veT(off ? 'em construção' : sub)}</small></span>${tag}</label>`;
        }).join('')}</div>
        <button type="button" class="ve-az-gerar" data-ke-acao="tudo"${VEKED.rodando ? ' disabled' : ''}>
            ${VEKED.rodando ? `<span class="ve-az-gira"></span>${veT(VEKED.etapa || 'Editando…')}` : `<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>${veT('Editar tudo')}`}</button>
        ${VEKED.rodando ? `<div class="ve-az-pe"><span></span><button type="button" data-ke-acao="cancelar">${veT(VEKED.cancelar ? 'Parando…' : 'Cancelar')}</button></div>` : ''}
        <div class="ve-az-pe"><span>${u ? u.resumo : veT('Um desfazer volta tudo')}</span>
            ${u && u.mudou ? `<button type="button" data-ke-acao="desfazer">${veT('Desfazer')}</button>` : ''}</div>`;
}

function veJcRender() {
    const box = $ve('ve-jc-corpo'); if (!box) return;
    if (!veKeTemJcut()) { box.innerHTML = `<div class="ve-az-pe"><span>${veT('Em construção')}</span></div>`; return; }
    box.innerHTML = `<button type="button" class="ve-az-gerar" data-jc-acao="aplicar"><svg viewBox="0 0 24 24"><path d="M4 12h10M10 6l6 6-6 6M20 4v16"/></svg>${veT('Aplicar J-cut nas emendas')}</button>`;
}

async function veKeEsperarTranscricao() {
    if (typeof veTxTranscrever !== 'function') return false;
    VETX.palavras = []; VETX.construidoTexto = false;   // a timeline mudou (cortes): transcreve de novo
    veTxTranscrever();
    for (let k = 0; k < 1800; k++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!VETX.rodando || VEKED.cancelar) break;
    }
    return VETX.palavras.length > 0;
}

// API: veKaniEditCompleto({respiros, jcut, legenda, autozoom}) → {ok, mudou, resumo, etapas}
async function veKaniEditCompleto(opc) {
    if (VEKED.rodando) return { ok: false, motivo: 'já rodando' };
    if (!VE.ready) { veToast(veT('Abra um vídeo primeiro')); return { ok: false, motivo: 'sem vídeo' }; }
    const o = { ...VEKED.opc, ...(opc || {}) }, etapas = [], n0 = VE.history.length, dur0 = veNavDur();
    let atual = '';
    const fim = st => { if (atual) VEKED.st[atual] = st; atual = ''; };
    const passo = (k, t) => { if (VEKED.cancelar) throw new Error('cancelado'); if (atual !== k) fim('ok'); atual = k; VEKED.st[k] = 'agora'; VEKED.etapa = t; veKeRender(); };
    VEKED.rodando = true; VEKED.cancelar = false; VEKED.st = {}; veKeRender();
    try {
        if (o.respiros && typeof veRespirosAplicar === 'function') {
            passo('respiros', 'Cortando respiros…');
            const r = await veRespirosAplicar({ preset: (typeof VERS === 'object' && VERS.preset) || 'normal' });
            etapas.push(`${(r && r.cortes) || 0} ${veT('cortes')}`);
        }
        if (o.jcut && veKeTemJcut()) {
            passo('jcut', 'Aplicando J-cut…');
            const r = await veJcutAplicar({});
            const nj = (r && r.tratadas) || 0, agil = typeof VERS === 'object' && VERS.preset === 'agressivo';
            etapas.push(nj ? `J-cut ${nj}` : veT(agil ? 'J-cut 0 (Ágil não deixa pausa)' : 'J-cut 0 (sem pausa sobrando)'));
        }
        if (o.tracker) {
            passo('tracker', 'Seguindo o rosto…');
            const r = await veKeTracker();
            if (r.n) etapas.push(`${veT('rosto seguido em')} ${r.n} ${veT(r.n === 1 ? 'clipe' : 'clipes')}`);
            else fim('sem precisar');
        }
        if (o.legenda || o.autozoom) {
            passo(o.legenda ? 'legenda' : 'autozoom', 'Transcrevendo a fala…');
            if (!(await veKeEsperarTranscricao())) { etapas.push(veT('sem fala transcrita')); fim('sem fala'); }
        }
        if (o.legenda && VETX.palavras.length && typeof veLpCriar === 'function') {
            passo('legenda', 'Criando legendas…');
            if (typeof veLpAtivo === 'function' && !veLpAtivo(veTxEstilo())) veLpModo('premium');
            if (veLpCriar(true)) etapas.push(`${VE.legendas.length} ${veT('legendas')}`);
        }
        if (o.autozoom && VETX.palavras.length && window.VEAZ_API) {
            passo('autozoom', 'Dando zoom nos momentos fortes…');
            const z = await VEAZ_API.gerar();
            etapas.push(`${(z && z.length) || 0} zooms`);
        }
        fim('ok');
    } catch (e) {
        fim(e && e.message === 'cancelado' ? 'cancelado' : 'erro');
        if (e && e.message === 'cancelado') etapas.push(veT('cancelado')); else veToast('KaniEdit: ' + (e && e.message || e));
    } finally {
        if (VE.history.length > n0 + 1) VE.history.splice(n0 + 1);   // um desfazer só para a edição inteira
        if (typeof veUpdateUndo === 'function') veUpdateUndo();
        VEKED.rodando = false; VEKED.cancelar = false; VEKED.etapa = '';
    }
    const mudou = VE.history.length > n0, menos = dur0 - veNavDur();
    VEKED.ultimo = { mudou, resumo: (etapas.join(' · ') + (menos > 0.05 ? ` · −${menos.toFixed(1)} s` : '')) || veT('Nada a fazer') };
    veKeRender();
    if (typeof veRsRender === 'function') veRsRender();
    veToast('KaniEdit: ' + VEKED.ultimo.resumo);
    return { ok: true, mudou, resumo: VEKED.ultimo.resumo, etapas };
}

// ── Seguir o rosto (tracker) ──
// Operador de câmera virtual nos clipes de vídeo da trilha de baixo. Clipe mais largo que o quadro (vídeo deitado em
// sequência em pé): escala para cobrir e anda na horizontal atrás do rosto. Mesmo formato: só mexe se o rosto anda
// bastante (> 12% do quadro); aí aproxima 112% e acompanha. Fica parado enquanto o rosto está perto do lugar (zona
// morta de 6%) e anda suave quando ele sai; nunca mostra a borda. Clipe que já tem quadro-chave de posição/escala
// é do usuário: não mexe. Retorna {n: clipes tratados}.
async function veKeTracker() {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_autozoom_rostos || !VE.ready) return { n: 0 };
    const W = VE.seqW, H = VE.seqH, PASSO = 0.8, DZ = 0.06;
    const planos = VE.clips.filter(c => c.tr === 0 && !veIsAudio(c) && !veIsAdj(c) && (veMediaOf(c) || {}).kind === 'video'
        && (veMediaOf(c) || {}).path && !(veKfOn(c, 'x') || veKfOn(c, 'y') || veKfOn(c, 'sc'))).map(c => {
        const len = Math.max(0, c.e - c.s), n = Math.max(2, Math.ceil(len / PASSO) + 1);
        return { c, path: veMediaOf(c).path, sz: veMediaSize(c), ts: [...Array(n)].map((_, k) => +(c.s + len * k / (n - 1)).toFixed(3)) };
    });
    if (!planos.length) return { n: 0 };
    let ros = [];
    try { const r = await api.ve_autozoom_rostos(planos.flatMap(p => p.ts.map(t => [p.path, t]))); ros = (r && r.rostos) || []; } catch (e) { return { n: 0 }; }
    if (VEKED.cancelar) return { n: 0 };
    const med3 = a => a.map((v, j) => [a[j - 1] ?? v, v, a[j + 1] ?? v].sort((x, y) => x - y)[1]);   // tira o tremido da detecção
    let k = 0, n = 0, hist = false;
    for (const p of planos) {
        const rs = p.ts.map(() => ros[k++] || null), achou = rs.filter(Boolean);
        if (achou.length < Math.max(2, rs.length * 0.4)) continue;   // rosto pouco visível: deixa como está
        let ult = achou[0];
        const fr = rs.map(r => (ult = r || ult)), fx = med3(fr.map(r => r[0])), fy = med3(fr.map(r => r[1]));
        const larga = p.sz.w / p.sz.h > W / H * 1.05;
        if (!larga && Math.max(...fx) - Math.min(...fx) < 0.12) continue;
        const sc = 100 * Math.max(W / p.sz.w, H / p.sz.h) * (larga ? 1 : 1.12), Dw = p.sz.w * sc / 100, Dh = p.sz.h * sc / 100;
        const xDe = u => Math.max(W - Dw / 2, Math.min(Dw / 2, W / 2 - (u - 0.5) * Dw));
        const yDe = v => Math.max(H - Dh / 2, Math.min(Dh / 2, H * 0.42 - (v - 0.5) * Dh));
        const ks = [{ t: p.ts[0], x: xDe(fx[0]), y: yDe(fy[0]) }];
        for (let j = 1; j < rs.length; j++) {
            const a = ks[ks.length - 1], tx = xDe(fx[j]), ty = yDe(fy[j]);
            if (Math.abs(tx - a.x) <= DZ * W && Math.abs(ty - a.y) <= DZ * H) continue;
            // salto grande (outra pessoa, troca de cena dentro do clipe): a câmera corta em vez de atravessar o quadro
            const corta = Math.abs(tx - a.x) > 0.3 * W;
            if (p.ts[j - 1] > a.t + 0.01) ks.push({ t: p.ts[j - 1], x: a.x, y: a.y });   // parado até aqui, anda até o próximo
            if (corta) ks[ks.length - 1].i = 'hold';
            ks.push({ t: p.ts[j], x: tx, y: ty });
        }
        if (!hist) { vePushHistory(); hist = true; }
        const c = p.c, R = v => Math.round(v * 10) / 10;
        c.p = { ...veStaticProps(c), sc: Math.round(sc * 100) / 100, x: R(ks[0].x), y: R(ks[0].y) };
        if (ks.length > 1) {
            c.k = { ...(c.k || {}), x: ks.map(q => ({ t: q.t, v: R(q.x), i: q.i || 'ease' })) };
            if (ks.some(q => Math.abs(q.y - ks[0].y) > 0.5)) c.k.y = ks.map(q => ({ t: q.t, v: R(q.y), i: q.i || 'ease' }));
        }
        n++;
    }
    if (n) { veCacheInvalidate(); veRefresh(); }
    return { n };
}

function veKeInit() {
    const box = $ve('ve-ke-rolagem'); if (!box || box._ok) return;
    box._ok = true;
    box.querySelectorAll('details[data-ke]').forEach(d => {   // a seção que o usuário fechou continua fechada
        if (veLsGet('ve-ke-' + d.dataset.ke) === '0') d.open = false;
        d.addEventListener('toggle', () => veLsSet('ve-ke-' + d.dataset.ke, d.open ? '1' : '0'));
    });
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-ke-acao],[data-jc-acao]'); if (!b) return;
        if (b.dataset.keAcao === 'tudo') veKaniEditCompleto();
        else if (b.dataset.keAcao === 'cancelar') { VEKED.cancelar = true; veKeRender(); }
        else if (b.dataset.keAcao === 'desfazer') { if (typeof veUndo === 'function') veUndo(); VEKED.ultimo = null; veKeRender(); }
        else if (b.dataset.jcAcao === 'aplicar' && veKeTemJcut()) veJcutAplicar({}).then(r => r && r.resumo && veToast(r.resumo));
    });
    box.addEventListener('change', e => {
        const k = e.target.dataset && e.target.dataset.keOpc; if (!k) return;
        VEKED.opc[k] = e.target.checked;
        try { localStorage.setItem('ve-ke-opc', JSON.stringify(VEKED.opc)); } catch (x) {}
    });
    veKeRender(); veJcRender();
}
if (typeof I18N_EN === 'object') Object.entries({
    'KaniEdit': 'KaniEdit', 'Edição completa': 'Full edit', 'tudo de uma vez, na ordem certa': 'everything at once, in the right order',
    'Editar tudo': 'Edit everything', 'Cancelar': 'Cancel', 'Parando…': 'Stopping…', 'cancelado': 'canceled', 'J-cut 0 (Ágil não deixa pausa)': 'J-cut 0 (Agile leaves no pause)', 'J-cut 0 (sem pausa sobrando)': 'J-cut 0 (no spare pause)', 'Um desfazer volta tudo': 'One undo reverts it all', 'Em construção': 'Coming soon', 'em construção': 'coming soon',
    'pausas e respiros, com sobra natural': 'pauses and breaths, kept natural', 'J-cut': 'J-cut',
    'som da próxima frase entra antes': 'next line audio comes in early', 'Legenda Premium': 'Premium captions', 'com efeitos sonoros nas ênfases': 'with SFX on emphasis',
    'zoom no rosto nos momentos fortes': 'face zoom on strong moments', 'o som da próxima frase entra antes da imagem': 'the next line audio starts before the picture',
    'Aplicar J-cut nas emendas': 'Apply J-cut on edits', 'Cortando respiros…': 'Cutting breaths…', 'Aplicando J-cut…': 'Applying J-cut…',
    'Transcrevendo a fala…': 'Transcribing…', 'Criando legendas…': 'Creating captions…', 'Dando zoom nos momentos fortes…': 'Zooming on strong moments…',
    'legendas': 'captions', 'sem fala transcrita': 'no transcribed speech', 'Nada a fazer': 'Nothing to do',
    'Seguir o rosto': 'Follow the face', 'vídeo deitado em quadro em pé, ou rosto que anda': 'landscape video in a vertical frame, or a moving face',
    'Seguindo o rosto…': 'Following the face…', 'rosto seguido em': 'face followed in', 'clipe': 'clip', 'clipes': 'clips',
    'feito': 'done', 'sem precisar': 'not needed', 'sem fala': 'no speech', 'erro': 'error',
}).forEach(([k, v]) => { if (!(k in I18N_EN)) I18N_EN[k] = v; });
document.addEventListener('DOMContentLoaded', veKeInit);
if (document.readyState !== 'loading') setTimeout(veKeInit, 0);
setTimeout(() => { veKeRender(); veJcRender(); }, 3000);   // o J-cut (editor-jcut.js) pode chegar depois
