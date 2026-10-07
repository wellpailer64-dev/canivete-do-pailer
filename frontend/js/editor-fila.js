// =========================================================
// Pocket Editor — Fila de render (como o Adobe Media Encoder).
// "Adicionar à fila" (janela Exportar) prepara a exportação da timeline ATIVA naquele momento — Comps, 3D, transições
// de sobreposição e textos viram arquivo, o plano é congelado — e guarda os argumentos prontos do video_cutter_export.
// "Adicionar todas as timelines" faz o mesmo para cada timeline do projeto (nome do arquivo = nome da timeline).
// A fila roda um vídeo por vez, sozinha, enquanto se continua editando; os eventos do Python (veOnExport) vão para ela
// quando há um item rodando. Painel: botão "Fila" no cabeçalho (número = itens esperando).
// =========================================================
const VEFILA = { itens: [], rodando: false, atual: null, pausar: false, seq: 0 };

function veFilaArgs(nomeArquivo) {   // os mesmos argumentos do veStartExport, com o estado de AGORA
    const noAudio = $ve('ve-noaudio').checked;
    const plano = veExportPlan(true), master = veMasterLim();
    const mix = master ? [...plano.mix, { master }] : plano.mix;
    const opc = { ...veExpOpcoes(), nome: nomeArquivo };
    return {
        args: [veFonteParaPlano({ ...plano, mix }, !noAudio), plano.base, vePill('format') || 'mp4', vePill('quality') || 'medium',
            $ve('ve-res').value, $ve('ve-gpu').checked, VE.dest, noAudio, plano.camadas, plano.audio, plano.dur, mix,
            veTxExport(plano.faixa), [VE.seqW, VE.seqH], opc],
        dur: plano.dur, fmt: (opc.codec === 'prores' ? 'mov' : vePill('format') || 'mp4'),
    };
}
async function veFilaPreparar(msg = () => {}) {   // o que o veStartExport faz antes de chamar o Python
    if (typeof veCompProntas === 'function') await veCompProntas(msg);
    if (typeof ve3dProntas === 'function') await ve3dProntas(msg);
    if (typeof veOvtProntas === 'function') await veOvtProntas(veExportFaixa(), msg);
    if (VE.clips.some(c => veIsTexto(c) || veEhGrafico(c))) await veTxPngs();
}
function veFilaNomeTimeline(id = VE.activeSequence) {
    const m = veSeqMedia(id), s = (VE.sequences || []).find(x => x.id === id) || {};
    return String((m && (m.nome || m.name)) || s.name || 'Timeline').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}
async function veFilaAdicionarAtual(nome = null) {
    if (!VE.ready) return null;
    if (veOfflineMedias().length) { veToast('Relinque ou apague as mídias offline antes de exportar'); return null; }
    const nomeArq = nome || ($ve('ve-exp-nome') && $ve('ve-exp-nome').value.trim()) || veFilaNomeTimeline();
    veToast('Preparando para a fila: ' + nomeArq);
    await veFilaPreparar(m => { const el = $ve('ve-fila-msg'); if (el) el.textContent = m; });
    const j = veFilaArgs(nomeArq);
    const item = { id: ++VEFILA.seq, nome: nomeArq, timeline: veFilaNomeTimeline(), fmt: j.fmt, dur: j.dur, args: j.args, estado: 'espera', pct: 0 };
    VEFILA.itens.push(item);
    veFilaRender();
    return item.id;
}
async function veFilaAdicionarTodas() {   // cada timeline do projeto (as de Comp/3D ficam de fora: entram pela timeline que as usa)
    if (!VE.ready) return 0;
    const volta = VE.activeSequence, ids = (VE.sequences || []).filter(s => !s.comp && !s.c3d).map(s => s.id);
    let n = 0;
    for (const id of ids) {
        if (id !== VE.activeSequence) veOpenTimeline(id);
        if (!VE.clips.length) continue;
        if (await veFilaAdicionarAtual(veFilaNomeTimeline(id))) n++;
    }
    if (volta && volta !== VE.activeSequence) veOpenTimeline(volta);
    veToast(`${n} timeline(s) na fila`);
    return n;
}

// ── execução ──
async function veFilaIniciar() {
    if (VEFILA.rodando) return;
    if (VE.exportRunning) { veToast('Espere a exportação atual terminar'); return; }
    VEFILA.rodando = true; VEFILA.pausar = false;
    veFilaRender();
    veFilaProximo();
}
async function veFilaProximo() {
    const it = VEFILA.itens.find(x => x.estado === 'espera');
    if (!it || VEFILA.pausar) {
        VEFILA.rodando = false; VEFILA.atual = null; VE.exportRunning = false;
        document.querySelector('.menu-item[data-tool="video-cutter"]')?.classList.remove('rodando');
        if (!it && VEFILA.itens.some(x => x.estado === 'pronto')) { veToast('Fila de render concluída'); if (typeof playConcluido === 'function') playConcluido(); }
        veFilaRender();
        return;
    }
    VEFILA.atual = it; it.estado = 'rodando'; it.pct = 0; it.t0 = Date.now();
    VE.exportRunning = true;
    document.querySelector('.menu-item[data-tool="video-cutter"]')?.classList.add('rodando');
    veFilaRender();
    try { await window.pywebview.api.video_cutter_export(...it.args); }
    catch (e) { veFilaEvento({ done: true, success: false, error: (e && (e.message || e)) || 'falhou' }); }
}
function veFilaEvento(ev) {
    const it = VEFILA.atual; if (!it) return;
    if (!ev.done) { it.pct = ev.pct || 0; it.msg = ev.message || ''; veFilaRenderItem(it); return; }
    it.estado = ev.success ? 'pronto' : ev.cancelled ? 'cancelado' : 'erro';
    it.saida = ev.output_path; it.erro = ev.error; it.pct = ev.success ? 100 : it.pct; it.tempo = (Date.now() - it.t0) / 1000;
    VEFILA.atual = null; VE.exportRunning = false;
    veFilaRender();
    if (it.estado === 'cancelado') { VEFILA.rodando = false; veFilaRender(); return; }   // parar = para a fila toda
    veFilaProximo();
}
function veFilaParar() { if (VEFILA.atual) window.pywebview.api.video_cutter_cancel_export(); VEFILA.pausar = true; }
function veFilaPausar() { VEFILA.pausar = !VEFILA.pausar; veFilaRender(); }
function veFilaRemover(id) { const i = VEFILA.itens.findIndex(x => x.id === id); if (i >= 0 && VEFILA.itens[i].estado !== 'rodando') VEFILA.itens.splice(i, 1); veFilaRender(); }
function veFilaMover(id, d) {
    const i = VEFILA.itens.findIndex(x => x.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= VEFILA.itens.length) return;
    [VEFILA.itens[i], VEFILA.itens[j]] = [VEFILA.itens[j], VEFILA.itens[i]]; veFilaRender();
}
function veFilaLimparProntos() { VEFILA.itens = VEFILA.itens.filter(x => x.estado === 'espera' || x.estado === 'rodando'); veFilaRender(); }
function veFilaRefazer(id) { const it = VEFILA.itens.find(x => x.id === id); if (it && it.estado !== 'rodando') { it.estado = 'espera'; it.pct = 0; it.erro = null; veFilaRender(); } }

// ── interface ──
function veFilaAbrir() { veFilaMontar(); $ve('ve-fila').hidden = false; veFilaRender(); }
function veFilaFechar() { $ve('ve-fila').hidden = true; }
function veFilaMontar() {
    if ($ve('ve-fila')) return;
    const m = document.createElement('div');
    m.className = 've-modal'; m.id = 've-fila'; m.hidden = true;
    m.innerHTML = `<div class="ve-modal-box ve-fila-box">
        <div class="ve-modal-head"><span>Fila de render</span><button class="ve-icon-btn" onclick="veFilaFechar()" title="Fechar (a fila continua rodando)"><svg class="i"><use href="#i-x"/></svg></button></div>
        <div class="ve-modal-body">
            <div class="ve-fila-topo"><button class="ve-btn ve-btn-sm" onclick="veFilaAdicionarAtual().catch(e => veToast(e.message))"><svg class="i"><use href="#i-film"/></svg> Adicionar esta timeline</button>
                <button class="ve-btn ve-btn-sm" onclick="veFilaAdicionarTodas().catch(e => veToast(e.message))"><svg class="i"><use href="#i-layers"/></svg> Adicionar todas as timelines</button>
                <span class="ve-fila-msg" id="ve-fila-msg"></span></div>
            <div class="ve-fila-lista" id="ve-fila-lista"></div>
            <div class="ve-fila-dica">Usa as opções da janela Exportar (formato, qualidade, resolução, pasta). Cada item guarda a timeline como estava ao entrar na fila — mudou depois? Remova e adicione de novo. Pode fechar esta janela e continuar editando.</div>
        </div>
        <div class="ve-modal-foot" id="ve-fila-foot"></div></div>`;
    $ve('ve').appendChild(m);
}
const VE_FILA_ESTADO = { espera: 'Na fila', rodando: 'Renderizando', pronto: 'Pronto', erro: 'Erro', cancelado: 'Cancelado' };
function veFilaRenderItem(it) {
    const el = document.querySelector(`#ve-fila-lista [data-fila="${it.id}"]`); if (!el) return veFilaRender();
    el.querySelector('.ve-fila-barra i').style.width = it.pct + '%';
    const eta = it.estado === 'rodando' && it.pct > 3 ? ' · falta ~' + veHuman((Date.now() - it.t0) / 1000 / it.pct * (100 - it.pct)) : '';
    el.querySelector('.ve-fila-est').textContent = (VE_FILA_ESTADO[it.estado] || it.estado) + (it.estado === 'rodando' ? ` ${Math.round(it.pct)}%${eta}` : '');
    veFilaBadge();
}
function veFilaRender() {
    veFilaBadge();
    const L = $ve('ve-fila-lista'); if (!L) return;
    L.innerHTML = VEFILA.itens.length ? VEFILA.itens.map((it, i) => `<div class="ve-fila-item ${it.estado}" data-fila="${it.id}">
        <span class="ve-fila-n">${i + 1}</span>
        <span class="ve-fila-info"><b>${veEsc(it.nome)}.${veEsc(it.fmt)}</b><small>${veEsc(it.timeline)} · ${veHuman(it.dur)}${it.tempo ? ' · feito em ' + veHuman(it.tempo) : ''}${it.erro ? ' · ' + veEsc(String(it.erro).slice(0, 120)) : ''}</small>
            <span class="ve-fila-barra"><i style="width:${it.pct}%"></i></span></span>
        <span class="ve-fila-est">${VE_FILA_ESTADO[it.estado] || it.estado}${it.estado === 'rodando' ? ` ${Math.round(it.pct)}%` : ''}</span>
        <span class="ve-fila-acoes">${it.estado === 'pronto' ? `<button class="ve-btn ve-btn-sm" onclick="window.pywebview.api.open_file(${veEsc(JSON.stringify(it.saida))})" title="Assistir"><svg class="i"><use href="#i-play"/></svg></button><button class="ve-btn ve-btn-sm" onclick="window.pywebview.api.reveal_file(${veEsc(JSON.stringify(it.saida))})" title="Mostrar na pasta"><svg class="i"><use href="#i-folder"/></svg></button>` : ''}
            ${it.estado === 'erro' || it.estado === 'cancelado' ? `<button class="ve-btn ve-btn-sm" onclick="veFilaRefazer(${it.id})">De novo</button>` : ''}
            ${it.estado === 'espera' ? `<button class="ve-btn ve-btn-sm" onclick="veFilaMover(${it.id}, -1)" title="Subir">↑</button><button class="ve-btn ve-btn-sm" onclick="veFilaMover(${it.id}, 1)" title="Descer">↓</button>` : ''}
            ${it.estado !== 'rodando' ? `<button class="ve-btn ve-btn-sm" onclick="veFilaRemover(${it.id})" title="Tirar da fila"><svg class="i"><use href="#i-x"/></svg></button>` : ''}</span></div>`).join('')
        : '<div class="ve-fila-vazia">A fila está vazia. Na janela Exportar, use "Adicionar à fila", ou adicione daqui a timeline aberta ou todas de uma vez.</div>';
    const esperando = VEFILA.itens.filter(x => x.estado === 'espera').length;
    const foot = $ve('ve-fila-foot');
    foot.innerHTML = (VEFILA.itens.some(x => x.estado !== 'espera' && x.estado !== 'rodando') ? '<button class="ve-btn ve-btn-ghost" onclick="veFilaLimparProntos()">Limpar concluídos</button>' : '') +
        (VEFILA.rodando ? `<button class="ve-btn" onclick="veFilaPausar()">${VEFILA.pausar ? 'Continuar depois deste' : 'Pausar depois deste'}</button><button class="ve-btn" onclick="veFilaParar()"><svg class="i"><use href="#i-x"/></svg> Parar</button>`
            : `<button class="ve-btn ve-btn-primary" onclick="veFilaIniciar()" ${esperando ? '' : 'disabled'}><svg class="i"><use href="#i-play"/></svg> Iniciar fila (${esperando})</button>`);
}
function veFilaBadge() {
    const b = $ve('ve-fila-btn'); if (!b) return;
    const n = VEFILA.itens.filter(x => x.estado === 'espera' || x.estado === 'rodando').length;
    b.querySelector('.ve-fila-cont').textContent = n ? String(n) : '';
    b.classList.toggle('rodando', VEFILA.rodando);
}

(function () {
    // eventos do Python vão para a fila quando ela está rodando um item
    const orig = veOnExport;
    veOnExport = function (ev) {
        if (VEFILA.atual) { if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return; } } return veFilaEvento(ev); }
        return orig(ev);
    };
    // exportar direto com a fila rodando: espera
    const ini = veStartExport;
    veStartExport = function () { if (VEFILA.rodando) { veToast('A fila de render está rodando: adicione à fila ou espere'); return; } return ini(); };
    // janela Exportar: "Adicionar à fila" ao lado de Exportar
    const pe = veExportFoot;
    veExportFoot = function (mode) {
        pe(mode);
        if (mode === 'form') {
            const b = document.createElement('button');
            b.className = 've-btn'; b.innerHTML = '<svg class="i"><use href="#i-layers"/></svg> Adicionar à fila';
            b.title = 'Prepara esta timeline e põe na fila de render (como o Media Encoder)';
            b.onclick = () => veFilaAdicionarAtual().then(id => { if (id) { veCloseExport(); veFilaAbrir(); } }).catch(e => veToast(e.message));
            const exp = $ve('ve-export-foot').querySelector('.ve-btn-primary');
            $ve('ve-export-foot').insertBefore(b, exp);
        }
    };
    // botão "Fila" no cabeçalho, ao lado de Exportar
    const exp = $ve('ve-export-btn');
    if (exp && !$ve('ve-fila-btn')) {
        const b = document.createElement('button');
        b.className = 've-btn'; b.id = 've-fila-btn'; b.title = 'Fila de render';
        b.innerHTML = '<svg class="i"><use href="#i-layers"/></svg> Fila <span class="ve-fila-cont"></span>';
        b.onclick = veFilaAbrir;
        exp.parentNode.insertBefore(b, exp);
    }
})();
window.VEFILA_API = { adicionar: nome => veFilaAdicionarAtual(nome), todas: () => veFilaAdicionarTodas(), iniciar: () => veFilaIniciar(), parar: () => veFilaParar(), itens: () => VEFILA.itens.map(({ args, ...r }) => r) };
