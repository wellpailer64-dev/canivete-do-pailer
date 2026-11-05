// KaniEdit (painel próprio do Vídeo): edição automática de 1 clique + cada etapa avulsa (Respiros, Autozoom, J-cut).
// Ordem da Edição completa: respiros → J-cut → transcrição da timeline já cortada → legenda Premium (com os SFX dela) →
// autozoom. Tudo vira UM desfazer. Cada etapa pode ser desligada; as opções de cada uma vêm da sua seção.

const VEKE = { rodando: false, cancelar: false, etapa: '', ultimo: null, opc: { respiros: true, jcut: true, legenda: true, autozoom: true } };
try { Object.assign(VEKE.opc, JSON.parse(localStorage.getItem('ve-ke-opc') || '{}')); } catch (e) {}
const VE_KE_ETAPAS = [
    ['respiros', 'Cortar respiros', 'pausas e respiros, com sobra natural'],
    ['jcut', 'J-cut', 'som da próxima frase entra antes'],
    ['legenda', 'Legenda Premium', 'com efeitos sonoros nas ênfases'],
    ['autozoom', 'Autozoom', 'zoom no rosto nos momentos fortes'],
];
const veKeTemJcut = () => typeof veJcutAplicar === 'function';

function veKeRender() {
    const box = $ve('ve-ke-corpo'); if (!box) return;
    const u = VEKE.ultimo;
    box.innerHTML = `
        <div class="ve-ke-etapas">${VE_KE_ETAPAS.map(([k, nome, sub]) => {
            const off = k === 'jcut' && !veKeTemJcut();
            return `<label class="ve-az-chave${off ? ' ve-ke-off' : ''}" title="${veT(off ? 'Em construção' : sub)}">
                <input type="checkbox" data-ke-opc="${k}"${VEKE.opc[k] && !off ? ' checked' : ''}${off || VEKE.rodando ? ' disabled' : ''}><span class="ve-az-trilho"><span></span></span>
                <span>${veT(nome)}<small>${veT(off ? 'em construção' : sub)}</small></span></label>`;
        }).join('')}</div>
        <button type="button" class="ve-az-gerar" data-ke-acao="tudo"${VEKE.rodando ? ' disabled' : ''}>
            ${VEKE.rodando ? `<span class="ve-az-gira"></span>${veT(VEKE.etapa || 'Editando…')}` : `<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>${veT('Editar tudo')}`}</button>
        ${VEKE.rodando ? `<div class="ve-az-pe"><span></span><button type="button" data-ke-acao="cancelar">${veT(VEKE.cancelar ? 'Parando…' : 'Cancelar')}</button></div>` : ''}
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
        if (!VETX.rodando || VEKE.cancelar) break;
    }
    return VETX.palavras.length > 0;
}

// API: veKaniEditCompleto({respiros, jcut, legenda, autozoom}) → {ok, mudou, resumo, etapas}
async function veKaniEditCompleto(opc) {
    if (VEKE.rodando) return { ok: false, motivo: 'já rodando' };
    if (!VE.ready) { veToast(veT('Abra um vídeo primeiro')); return { ok: false, motivo: 'sem vídeo' }; }
    const o = { ...VEKE.opc, ...(opc || {}) }, etapas = [], n0 = VE.history.length, dur0 = veNavDur();
    const passo = t => { if (VEKE.cancelar) throw new Error('cancelado'); VEKE.etapa = t; veKeRender(); };
    VEKE.rodando = true; VEKE.cancelar = false; veKeRender();
    try {
        if (o.respiros && typeof veRespirosAplicar === 'function') {
            passo('Cortando respiros…');
            const r = await veRespirosAplicar({ preset: (typeof VERS === 'object' && VERS.preset) || 'normal' });
            etapas.push(`${(r && r.cortes) || 0} ${veT('cortes')}`);
        }
        if (o.jcut && veKeTemJcut()) {
            passo('Aplicando J-cut…');
            const r = await veJcutAplicar({});
            const nj = (r && r.tratadas) || 0, agil = typeof VERS === 'object' && VERS.preset === 'agressivo';
            etapas.push(nj ? `J-cut ${nj}` : veT(agil ? 'J-cut 0 (Ágil não deixa pausa)' : 'J-cut 0 (sem pausa sobrando)'));
        }
        if (o.legenda || o.autozoom) {
            passo('Transcrevendo a fala…');
            if (!(await veKeEsperarTranscricao())) etapas.push(veT('sem fala transcrita'));
        }
        if (o.legenda && VETX.palavras.length && typeof veLpCriar === 'function') {
            passo('Criando legendas…');
            if (typeof veLpAtivo === 'function' && !veLpAtivo(veTxEstilo())) veLpModo('premium');
            if (veLpCriar(true)) etapas.push(`${VE.legendas.length} ${veT('legendas')}`);
        }
        if (o.autozoom && VETX.palavras.length && window.VEAZ_API) {
            passo('Dando zoom nos momentos fortes…');
            const z = await VEAZ_API.gerar();
            etapas.push(`${(z && z.length) || 0} zooms`);
        }
    } catch (e) {
        if (e && e.message === 'cancelado') etapas.push(veT('cancelado')); else veToast('KaniEdit: ' + (e && e.message || e));
    } finally {
        if (VE.history.length > n0 + 1) VE.history.splice(n0 + 1);   // um desfazer só para a edição inteira
        if (typeof veUpdateUndo === 'function') veUpdateUndo();
        VEKE.rodando = false; VEKE.cancelar = false; VEKE.etapa = '';
    }
    const mudou = VE.history.length > n0, menos = dur0 - veNavDur();
    VEKE.ultimo = { mudou, resumo: (etapas.join(' · ') + (menos > 0.05 ? ` · −${menos.toFixed(1)} s` : '')) || veT('Nada a fazer') };
    veKeRender();
    if (typeof veRsRender === 'function') veRsRender();
    veToast('KaniEdit: ' + VEKE.ultimo.resumo);
    return { ok: true, mudou, resumo: VEKE.ultimo.resumo, etapas };
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
        else if (b.dataset.keAcao === 'cancelar') { VEKE.cancelar = true; veKeRender(); }
        else if (b.dataset.keAcao === 'desfazer') { if (typeof veUndo === 'function') veUndo(); VEKE.ultimo = null; veKeRender(); }
        else if (b.dataset.jcAcao === 'aplicar' && veKeTemJcut()) veJcutAplicar({}).then(r => r && r.resumo && veToast(r.resumo));
    });
    box.addEventListener('change', e => {
        const k = e.target.dataset && e.target.dataset.keOpc; if (!k) return;
        VEKE.opc[k] = e.target.checked;
        try { localStorage.setItem('ve-ke-opc', JSON.stringify(VEKE.opc)); } catch (x) {}
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
}).forEach(([k, v]) => { if (!(k in I18N_EN)) I18N_EN[k] = v; });
document.addEventListener('DOMContentLoaded', veKeInit);
if (document.readyState !== 'loading') setTimeout(veKeInit, 0);
setTimeout(() => { veKeRender(); veJcRender(); }, 3000);   // o J-cut (editor-jcut.js) pode chegar depois
