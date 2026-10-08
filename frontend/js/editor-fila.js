// =========================================================
// Pocket Editor — Exportar com fila de render (como o Adobe Media Encoder), num painel só: à esquerda as configurações
// (as de sempre), à direita a fila. "Adicionar à fila" congela a timeline ativa (Comps, 3D, transições de sobreposição
// e textos viram arquivo; o plano fica guardado) com as configurações do formulário. Clicar num item carrega as
// configurações DELE no formulário e o que mudar vale para ele. ▶ Renderizar fila: tudo em ordem, um por vez, cada um
// com as suas configurações (fila vazia = renderiza a timeline aberta). Os eventos do Python (veOnExport) vão para a
// fila quando há item rodando. Botão "Fila" no cabeçalho abre o mesmo painel. API: VEFILA_API.
// =========================================================
const VEFILA = { itens: [], rodando: false, atual: null, pausar: false, seq: 0, sel: null };
const VE_FILA_PILLS = ['format', 'quality', 'codec', 'bits', 'taxa', 'blocos'];

// ── configurações (formulário ↔ item) ──
function veFilaCfgLer() {
    const pills = Object.fromEntries(VE_FILA_PILLS.map(k => [k, vePill(k)]));
    return { pills, res: $ve('ve-res').value, gpu: $ve('ve-gpu').checked, noAudio: $ve('ve-noaudio').checked, mbps: $ve('ve-exp-mbps').value,
             nome: $ve('ve-exp-nome').value.trim(), dest: VE.dest || null, destLabel: $ve('ve-dest-label').textContent };
}
function veFilaCfgAplicar(c) {
    for (const k of VE_FILA_PILLS) if (c.pills[k]) veExpPill(k, c.pills[k]);
    if ([...$ve('ve-res').options].some(o => o.value === c.res)) $ve('ve-res').value = c.res;
    $ve('ve-gpu').checked = c.gpu; $ve('ve-noaudio').checked = c.noAudio; $ve('ve-exp-mbps').value = c.mbps;
    $ve('ve-exp-nome').value = c.nome; VE.dest = c.dest; $ve('ve-dest-label').textContent = c.destLabel;
    veUpdateExportSummary();
}
function veFilaEtiquetas(c, dur) {
    const f = c.pills.format || 'mp4', audio = f === 'mp3' || f === 'wav', cod = { h264: 'H.264', hevc: 'H.265', prores: 'ProRes' }[c.pills.codec] || 'H.264';
    const q = { high: 'Máxima', medium: 'Alta', fast: 'Boa', low: 'Leve' }[c.pills.quality] || '';   // os nomes dos botões de Qualidade
    const res = c.res === 'original' ? 'Original' : c.res + 'p';
    const ext = !audio && c.pills.codec === 'prores' && ['mp4', 'mov', 'mkv'].includes(f) ? 'mov' : f;
    return [ext.toUpperCase(), ...(audio ? [] : [cod + (c.pills.bits === '10' ? ' 10 bits' : ''), res, c.pills.taxa === 'mbps' ? c.mbps + ' Mbps' : q]), veHuman(dur)].filter(Boolean);
}
function veFilaArgs(it) {   // monta os argumentos do video_cutter_export com o plano congelado + as configurações do item
    const c = it.cfg, P = it.plano, fmt = c.pills.format || 'mp4';
    const codec = ['mp4', 'mov', 'mkv'].includes(fmt) ? c.pills.codec || 'h264' : 'h264';
    const mbps = c.pills.taxa === 'mbps' ? Math.max(1, Math.min(400, +c.mbps || 16)) : 0;
    const opc = { nome: c.nome, codec, bits: +(c.pills.bits || 8), mbps, projeto: P.projeto, blocos: c.pills.blocos === '1' };
    return [c.noAudio ? P.fonteSem : P.fonteCom, P.base, fmt, c.pills.quality || 'medium', c.res, c.gpu, c.dest, c.noAudio,
            P.camadas, P.audio, P.dur, P.mix, P.leg, P.quadro, opc];
}

// ── adicionar ──
function veFilaNomeTimeline(id = VE.activeSequence) {
    const m = veSeqMedia(id), s = (VE.sequences || []).find(x => x.id === id) || {};
    return String((m && (m.nome || m.name)) || s.name || 'Timeline').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}
async function veFilaAdicionarAtual(nome = null, cfg = null) {
    if (!VE.ready) return null;
    VEFILA.preparando = (VEFILA.preparando || 0) + 1;   // transições/Comps/3D/textos viram arquivo antes de entrar
    try { return await veFilaAdicionarAgora(nome, cfg); }
    finally {
        VEFILA.preparando--;
        // Renderizar clicado durante o preparo: começa agora (antes duplicava a timeline na fila)
        if (!VEFILA.preparando && VEFILA.iniciarDepois) { VEFILA.iniciarDepois = false; veFilaIniciar().catch(e => veToast(e.message)); }
    }
}
async function veFilaAdicionarAgora(nome, cfg) {
    if (veOfflineMedias().length) { veToast('Relinque ou apague as mídias offline antes de exportar'); return null; }
    const msg = m => { const el = $ve('ve-fila-msg'); if (el) el.textContent = m || ''; };
    msg('Preparando ' + veFilaNomeTimeline() + '… (o render começa sozinho)');
    if (typeof veCompProntas === 'function') await veCompProntas(msg);
    if (typeof ve3dProntas === 'function') await ve3dProntas(msg);
    if (typeof veOvtProntas === 'function') await veOvtProntas(veExportFaixa(), msg);
    if (VE.clips.some(c => veIsTexto(c) || veEhGrafico(c))) await veTxPngs();
    const plano = veExportPlan(true), master = veMasterLim(), mix = master ? [...plano.mix, { master }] : plano.mix;
    const c = cfg ? JSON.parse(JSON.stringify(cfg)) : veFilaCfgLer();
    c.nome = nome || c.nome || veFilaNomeTimeline();
    const it = { id: ++VEFILA.seq, timeline: veFilaNomeTimeline(), dur: plano.dur, estado: 'espera', pct: 0, cfg: c,
        plano: { fonteCom: veFonteParaPlano({ ...plano, mix }, true), fonteSem: veFonteParaPlano({ ...plano, mix }, false), base: plano.base,
                 camadas: plano.camadas, audio: plano.audio, dur: plano.dur, mix, leg: veTxExport(plano.faixa), quadro: [VE.seqW, VE.seqH], projeto: VE.projectPath || '' } };
    VEFILA.itens.push(it);
    msg('');
    veFilaRender();
    return it.id;
}
async function veFilaAdicionarTodas() {   // cada timeline do projeto com as configurações do formulário (nome = timeline)
    if (!VE.ready) return 0;
    const cfg = veFilaCfgLer(), volta = VE.activeSequence, ids = (VE.sequences || []).filter(s => !s.comp).map(s => s.id);
    let n = 0;
    for (const id of ids) {
        if (id !== VE.activeSequence) veOpenTimeline(id);
        if (!VE.clips.length) continue;
        if (await veFilaAdicionarAtual(veFilaNomeTimeline(id), cfg)) n++;
    }
    if (volta && volta !== VE.activeSequence) veOpenTimeline(volta);
    veToast(`${n} timeline(s) na fila`);
    return n;
}

// ── execução ──
async function veFilaIniciar() {
    if (VEFILA.rodando) return;
    if (VEFILA.preparando) { VEFILA.iniciarDepois = true; veToast('Preparando a timeline: o render começa assim que ela entrar na fila'); return; }
    if (VE.exportRunning) { veToast('Espere a exportação atual terminar'); return; }
    if (!VEFILA.itens.some(x => x.estado === 'espera')) { if (!(await veFilaAdicionarAtual())) return; }   // fila vazia: a timeline aberta
    if (VEFILA.sel != null) veFilaSelecionar(null);   // o formulário volta às configurações livres
    VEFILA.rodando = true; VEFILA.pausar = false;
    veFilaRender();
    veFilaProximo();
}
async function veFilaProximo() {
    const it = VEFILA.itens.find(x => x.estado === 'espera');
    if (!it || VEFILA.pausar) {
        VEFILA.rodando = false; VEFILA.atual = null; VE.exportRunning = false;
        document.querySelector('.menu-item[data-tool="video-cutter"]')?.classList.remove('rodando');
        // o som de concluído toca a cada render pronto (editor-encoder.js); aqui só o aviso do fim da fila
        if (!it && VEFILA.itens.some(x => x.estado === 'pronto')) veToast('Fila de render concluída');
        veFilaRender();
        return;
    }
    VEFILA.atual = it; it.estado = 'rodando'; it.pct = 0; it.t0 = Date.now();
    VE.exportRunning = true;
    document.querySelector('.menu-item[data-tool="video-cutter"]')?.classList.add('rodando');
    veFilaRender();
    try { await window.pywebview.api.video_cutter_export(...veFilaArgs(it)); }
    catch (e) { veFilaEvento({ done: true, success: false, error: (e && (e.message || e)) || 'falhou' }); }
}
function veFilaEvento(ev) {
    const it = VEFILA.atual; if (!it) return;
    if (!ev.done) { it.pct = ev.pct || 0; veFilaRenderItem(it); return; }
    it.estado = ev.success ? 'pronto' : ev.cancelled ? 'cancelado' : 'erro';
    it.saida = ev.output_path; it.erro = ev.error; it.pct = ev.success ? 100 : it.pct; it.tempo = (Date.now() - it.t0) / 1000;
    VEFILA.atual = null; VE.exportRunning = false;
    if (it.estado === 'cancelado') { VEFILA.rodando = false; document.querySelector('.menu-item[data-tool="video-cutter"]')?.classList.remove('rodando'); veFilaRender(); return; }
    veFilaRender();
    veFilaProximo();
}
function veFilaParar() { VEFILA.pausar = true; if (VEFILA.atual) window.pywebview.api.video_cutter_cancel_export(); veFilaRender(); }
function veFilaPausar() { VEFILA.pausar = !VEFILA.pausar; veFilaRender(); }
function veFilaRemover(id) { const i = VEFILA.itens.findIndex(x => x.id === id); if (i >= 0 && VEFILA.itens[i].estado !== 'rodando') { VEFILA.itens.splice(i, 1); if (VEFILA.sel === id) veFilaSelecionar(null); } veFilaRender(); }
function veFilaMover(id, d) {
    const i = VEFILA.itens.findIndex(x => x.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= VEFILA.itens.length) return;
    [VEFILA.itens[i], VEFILA.itens[j]] = [VEFILA.itens[j], VEFILA.itens[i]]; veFilaRender();
}
function veFilaLimparProntos() { VEFILA.itens = VEFILA.itens.filter(x => x.estado === 'espera' || x.estado === 'rodando'); veFilaRender(); }
function veFilaRefazer(id) { const it = VEFILA.itens.find(x => x.id === id); if (it && it.estado !== 'rodando') { it.estado = 'espera'; it.pct = 0; it.erro = null; veFilaRender(); } }
function veFilaSelecionar(id) {   // carrega as configurações do item no formulário (e o formulário passa a editar ele)
    const it = VEFILA.itens.find(x => x.id === id);
    if (!it || it.estado === 'rodando') { if (VEFILA.sel != null && VEFILA._cfgLivre) veFilaCfgAplicar(VEFILA._cfgLivre); VEFILA.sel = null; veFilaRender(); return; }
    if (VEFILA.sel == null) VEFILA._cfgLivre = veFilaCfgLer();   // o que estava no formulário volta ao desmarcar
    VEFILA.sel = id;
    veFilaCfgAplicar(it.cfg);
    veFilaRender();
}
function veFilaFormMudou() {   // formulário mexido com um item escolhido: vale para ele
    const it = VEFILA.itens.find(x => x.id === VEFILA.sel);
    if (it && it.estado !== 'rodando') { it.cfg = veFilaCfgLer(); veFilaRender(); }
}

// ── interface (dentro da janela Exportar) ──
const VE_FILA_ESTADO = { espera: 'Na fila', rodando: 'Renderizando', pronto: 'Pronto', erro: 'Erro', cancelado: 'Cancelado' };
function veFilaMontar() {
    if ($ve('ve-fila-col')) return;
    const box = $ve('ve-export').querySelector('.ve-modal-box'), form = $ve('ve-export-form');
    box.classList.add('ve-exp-com-fila');
    const grade = document.createElement('div'); grade.className = 've-exp-grade';
    form.parentNode.insertBefore(grade, form);
    grade.appendChild(form);
    const col = document.createElement('div'); col.className = 've-fila-col'; col.id = 've-fila-col';
    col.innerHTML = `<div class="ve-fila-cab"><b>Fila de render</b><span class="ve-fila-msg" id="ve-fila-msg"></span>
            <button class="ve-btn ve-btn-sm ve-btn-ghost" onclick="veFilaAdicionarTodas().catch(e => veToast(e.message))" title="Cada timeline do projeto com as configurações ao lado"><svg class="i"><use href="#i-layers"/></svg> Todas as timelines</button></div>
        <div class="ve-fila-lista" id="ve-fila-lista"></div>
        <div class="ve-fila-dica" id="ve-fila-dica"></div>`;
    grade.appendChild(col);
    form.addEventListener('click', e => { if (e.target.closest('.ve-pill')) setTimeout(veFilaFormMudou, 0); });
    form.addEventListener('change', () => veFilaFormMudou());
    form.addEventListener('input', e => { if (e.target.id === 've-exp-nome' || e.target.id === 've-exp-mbps') veFilaFormMudou(); });
    $ve('ve-fila-lista').addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const row = e.target.closest('[data-fila]'); if (row) veFilaSelecionar(VEFILA.sel === +row.dataset.fila ? null : +row.dataset.fila);
    });
}
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
    L.innerHTML = VEFILA.itens.length ? VEFILA.itens.map((it, i) => `<div class="ve-fila-item ${it.estado}${VEFILA.sel === it.id ? ' sel' : ''}" data-fila="${it.id}" title="${it.estado === 'espera' ? 'Clique para ver e mudar as configurações deste item' : ''}">
        <span class="ve-fila-n">${i + 1}</span>
        <span class="ve-fila-info"><b>${veEsc(it.cfg.nome)}</b><small>${veEsc(it.timeline)}${it.tempo ? ' · feito em ' + veHuman(it.tempo) : ''}${it.erro ? ' · ' + veEsc(String(it.erro).slice(0, 120)) : ''}</small>
            <span class="ve-fila-tags">${veFilaEtiquetas(it.cfg, it.dur).map(t => `<i>${veEsc(t)}</i>`).join('')}</span>
            <span class="ve-fila-barra"><i style="width:${it.pct}%"></i></span></span>
        <span class="ve-fila-est">${VE_FILA_ESTADO[it.estado] || it.estado}${it.estado === 'rodando' ? ` ${Math.round(it.pct)}%` : ''}</span>
        <span class="ve-fila-acoes">${it.estado === 'pronto' ? `<button class="ve-btn ve-btn-sm" onclick="window.pywebview.api.open_file(${veEsc(JSON.stringify(it.saida))})" title="Assistir"><svg class="i"><use href="#i-play"/></svg></button><button class="ve-btn ve-btn-sm" onclick="window.pywebview.api.reveal_file(${veEsc(JSON.stringify(it.saida))})" title="Mostrar na pasta"><svg class="i"><use href="#i-folder"/></svg></button>` : ''}
            ${it.estado === 'erro' || it.estado === 'cancelado' ? `<button class="ve-btn ve-btn-sm" onclick="veFilaRefazer(${it.id})">De novo</button>` : ''}
            ${it.estado === 'espera' ? `<button class="ve-btn ve-btn-sm" onclick="veFilaMover(${it.id}, -1)" title="Subir">↑</button><button class="ve-btn ve-btn-sm" onclick="veFilaMover(${it.id}, 1)" title="Descer">↓</button>` : ''}
            ${it.estado !== 'rodando' ? `<button class="ve-btn ve-btn-sm" onclick="veFilaRemover(${it.id})" title="Tirar da fila"><svg class="i"><use href="#i-x"/></svg></button>` : ''}</span></div>`).join('')
        : '<div class="ve-fila-vazia">Fila vazia. Escolha as configurações ao lado e use "Adicionar à fila" (ou ▶ para renderizar só a timeline aberta).</div>';
    const sel = VEFILA.itens.find(x => x.id === VEFILA.sel);
    $ve('ve-fila-dica').textContent = sel ? `Editando as configurações de "${sel.cfg.nome}". Clique de novo nele para voltar ao formulário livre.` :
        'Cada item guarda a timeline como estava ao entrar na fila. Clique num item para ver e mudar as configurações dele.';
    $ve('ve-export').classList.toggle('editando-item', !!sel);
    veFilaRodape();
}
function veFilaRodape() {
    const foot = $ve('ve-export-foot'); if (!foot || $ve('ve-export-form').hidden) return;
    const esp = VEFILA.itens.filter(x => x.estado === 'espera').length;
    foot.innerHTML = (VEFILA.itens.some(x => x.estado !== 'espera' && x.estado !== 'rodando') ? '<button class="ve-btn ve-btn-ghost" onclick="veFilaLimparProntos()">Limpar concluídos</button>' : '') +
        '<span class="ve-fila-esp"></span><button class="ve-btn ve-btn-ghost" onclick="veCloseExport()">Fechar</button>' +
        (VEFILA.rodando
            ? `<button class="ve-btn" onclick="veFilaPausar()">${VEFILA.pausar ? 'Continuar a fila' : 'Pausar depois deste'}</button><button class="ve-btn" onclick="veFilaParar()"><svg class="i"><use href="#i-x"/></svg> Parar</button>`
            : `<button class="ve-btn" onclick="veFilaAdicionarAtual().catch(e => veToast(e.message))" title="Congela a timeline aberta com estas configurações"><svg class="i"><use href="#i-layers"/></svg> Adicionar à fila</button>
               <button class="ve-btn ve-btn-primary" onclick="veFilaIniciar().catch(e => veToast(e.message))" title="Renderiza tudo que está na fila, em ordem, cada um com as suas configurações"><svg class="i"><use href="#i-play"/></svg> ${esp ? `Renderizar fila (${esp})` : 'Renderizar'}</button>`);
}
function veFilaBadge() {
    const b = $ve('ve-fila-btn'); if (!b) return;
    const n = VEFILA.itens.filter(x => x.estado === 'espera' || x.estado === 'rodando').length;
    b.querySelector('.ve-fila-cont').textContent = n ? String(n) : '';
    b.classList.toggle('rodando', VEFILA.rodando);
}
function veFilaAbrir() { if (!VE.ready) return; if (!$ve('ve-export').hidden) return; veOpenExport(); }

(function () {
    // eventos do Python vão para a fila quando ela está rodando um item
    const orig = veOnExport;
    veOnExport = function (ev) {
        if (VEFILA.atual) { if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return; } } return veFilaEvento(ev); }
        return orig(ev);
    };
    // a janela Exportar ganha a coluna da fila; abrir com a fila rodando mostra o andamento (não o formulário vazio)
    const abrir = veOpenExport;
    veOpenExport = function () {
        if (VE.exportRunning && !VEFILA.rodando) return abrir();
        const ia = VEFILA.rodando;
        if (ia) { veFilaMontar(); $ve('ve-export').hidden = false; veFilaRender(); return; }
        abrir();
        veFilaMontar();
        VEFILA.sel = null;
        veFilaRender();
    };
    const pe = veExportFoot;
    veExportFoot = function (mode) { pe(mode); if (mode === 'form' && $ve('ve-fila-col')) veFilaRodape(); };
    const fechar = veCloseExport;
    veCloseExport = function () { if (VEFILA.rodando) { $ve('ve-export').hidden = true; return; } if (VEFILA.sel != null) veFilaSelecionar(null); return fechar(); };
    const ini = veStartExport;
    veStartExport = function () { if ($ve('ve-fila-col')) return veFilaIniciar(); return ini(); };   // Exportar = renderizar (fila)
    // botão "Fila" no cabeçalho, ao lado de Exportar (abre o mesmo painel)
    const exp = $ve('ve-export-btn');
    if (exp && !$ve('ve-fila-btn')) {
        const b = document.createElement('button');
        b.className = 've-btn'; b.id = 've-fila-btn'; b.title = 'Fila de render (o painel Exportar)';
        b.innerHTML = '<svg class="i"><use href="#i-layers"/></svg> Fila <span class="ve-fila-cont"></span>';
        b.onclick = veFilaAbrir;
        exp.parentNode.insertBefore(b, exp);
    }
})();
window.VEFILA_API = {
    adicionar: (nome, cfg) => veFilaAdicionarAtual(nome, cfg), todas: () => veFilaAdicionarTodas(), iniciar: () => veFilaIniciar(),
    parar: () => veFilaParar(), selecionar: id => veFilaSelecionar(id), itens: () => VEFILA.itens.map(({ plano, ...r }) => r),
};
