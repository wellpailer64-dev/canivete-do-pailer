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
    veFilaDriveCampo();
    return { pills, res: $ve('ve-res').value, gpu: $ve('ve-gpu').checked, noAudio: $ve('ve-noaudio').checked, mbps: $ve('ve-exp-mbps').value,
             nome: $ve('ve-exp-nome').value.trim(), dest: VE.dest || null, destLabel: $ve('ve-dest-label').textContent,
             drive: ($ve('ve-drive-link').value || '').trim() };
}
// Campo "Enviar ao Drive" (opcional) logo abaixo de "Salvar em": colou o link de uma pasta, o render pronto sobe sozinho
// para ela (Functions/drive_envio.py), com barra de progresso no item da fila. O último link fica lembrado.
function veFilaDriveCampo() {
    if ($ve('ve-drive-link')) return;
    const dest = $ve('ve-dest-label'); const campo = dest && dest.closest('.ve-field'); if (!campo) return;
    const div = document.createElement('div');
    div.className = 've-field ve-drive-campo';
    div.innerHTML = `<label>Enviar ao Google Drive <small>(opcional)</small></label>
        <div class="ve-dest"><input type="text" id="ve-drive-link" class="ve-input" spellcheck="false"
            placeholder="Cole o link de uma pasta do Drive: sobe sozinho quando o render terminar">
        <button class="ve-btn ve-btn-sm" title="Não enviar" onclick="$ve('ve-drive-link').value=''; veFilaDriveLembrar()"><svg class="i"><use href="#i-x"/></svg></button></div>
        <small class="ve-drive-aviso" id="ve-drive-aviso"></small>`;
    campo.after(div);
    let salvo = ''; try { salvo = localStorage.getItem('ve_drive_link') || ''; } catch (e) { /* sem armazenamento */ }
    const inp = $ve('ve-drive-link'); inp.value = salvo;
    inp.addEventListener('input', () => veFilaDriveLembrar());   // o 'input' do formulário leva o link ao item escolhido
    veFilaDriveConferir();
}
function veFilaDriveLembrar() { try { localStorage.setItem('ve_drive_link', $ve('ve-drive-link').value.trim()); } catch (e) { /* sem armazenamento */ } veFilaDriveConferir(); }
function veFilaDriveConferir() {
    const v = ($ve('ve-drive-link') || {}).value || '', av = $ve('ve-drive-aviso'); if (!av) return;
    const ok = !v.trim() || /\/folders\/[\w-]+|[?&]id=[\w-]+|^[\w-]{25,}$/.test(v.trim());
    av.textContent = !v.trim() ? '' : ok ? 'O render pronto sobe para essa pasta (a conta precisa poder editar nela).' : 'Esse link não é de uma pasta do Drive.';
    av.classList.toggle('erro', !ok);
}
function veFilaCfgAplicar(c) {
    for (const k of VE_FILA_PILLS) if (c.pills[k]) veExpPill(k, c.pills[k]);
    if ([...$ve('ve-res').options].some(o => o.value === c.res)) $ve('ve-res').value = c.res;
    $ve('ve-gpu').checked = c.gpu; $ve('ve-noaudio').checked = c.noAudio; $ve('ve-exp-mbps').value = c.mbps;
    $ve('ve-exp-nome').value = c.nome; VE.dest = c.dest; $ve('ve-dest-label').textContent = c.destLabel;
    veFilaDriveCampo(); if ($ve('ve-drive-link')) { $ve('ve-drive-link').value = c.drive || ''; veFilaDriveConferir(); }
    veUpdateExportSummary();
}
function veFilaEtiquetas(c, dur) {
    const f = c.pills.format || 'mp4', audio = f === 'mp3' || f === 'wav', cod = { h264: 'H.264', hevc: 'H.265', prores: 'ProRes' }[c.pills.codec] || 'H.264';
    const q = { high: 'Máxima', medium: 'Alta', fast: 'Boa', low: 'Leve' }[c.pills.quality] || '';   // os nomes dos botões de Qualidade
    const res = c.res === 'original' ? 'Original' : c.res + 'p';
    const ext = !audio && c.pills.codec === 'prores' && ['mp4', 'mov', 'mkv'].includes(f) ? 'mov' : f;
    return [ext.toUpperCase(), ...(audio ? [] : [cod + (c.pills.bits === '10' ? ' 10 bits' : ''), res, c.pills.taxa === 'mbps' ? c.mbps + ' Mbps' : q]), veHuman(dur),
            c.drive ? '→ Drive' : ''].filter(Boolean);
}
function veFilaArgs(it) {   // monta os argumentos do video_cutter_export com o plano congelado + as configurações do item
    const c = it.cfg, P = it.plano, fmt = c.pills.format || 'mp4';
    const codec = ['mp4', 'mov', 'mkv'].includes(fmt) ? c.pills.codec || 'h264' : 'h264';
    const mbps = c.pills.taxa === 'mbps' ? Math.max(1, Math.min(400, +c.mbps || 16)) : 0;
    const opc = { nome: c.nome, codec, bits: +(c.pills.bits || 8), mbps, projeto: P.projeto, blocos: c.pills.blocos === '1',
                  fps: P.fps || VE.fps || 30 };   // taxa da timeline congelada (fundo preto sem o vídeo principal)
    return [c.noAudio ? P.fonteSem : P.fonteCom, P.base, fmt, c.pills.quality || 'high', c.res, c.gpu, c.dest, c.noAudio,
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
// Antes de congelar: confere no DISCO se cada arquivo que a timeline usa (direto ou dentro de Comp) ainda existe. A
// marca de offline só vinha da abertura do projeto: um arquivo movido depois saía PRETO no export, sem aviso (GaIA,
// foto do Jhordano, 2026-10-14). O que sumiu vira offline e o aviso diz onde está na timeline.
async function veFilaConferirArquivos() {
    const api = window.pywebview && window.pywebview.api; if (!api || !api.ve_arquivos_faltando) return;
    const usadas = new Map(), vistas = new Set();
    const varrer = (clips, base) => (clips || []).forEach(c => {
        const m = VE.media[c.m || 0]; if (!m) return;
        if (m.path && !usadas.has(m.id)) usadas.set(m.id, base != null ? base : c.st);
        if (m.comp && m.sequenceId && !vistas.has(m.sequenceId)) {
            vistas.add(m.sequenceId);
            const s = (VE.sequences || []).find(x => x.id === m.sequenceId);
            if (s && s.id !== VE.activeSequence) varrer(s.clips, base != null ? base : c.st);
        }
    });
    varrer(VE.clips, null);
    const ms = [...usadas.keys()].map(id => VE.media[id]).filter(m => m && !veMediaOffline(m));
    const falta = new Set(await api.ve_arquivos_faltando(ms.map(m => m.path)).catch(() => []));
    ms.filter(m => falta.has(m.path)).forEach(m => { m.offline = true; m._quando = usadas.get(m.id); });
    if (falta.size && typeof vePjRender === 'function') vePjRender();
}
async function veFilaAdicionarAgora(nome, cfg) {
    await veFilaConferirArquivos();
    { const off = veOfflineNaTimeline(); if (off.length) { veAvisoOffline(off); return null; } }
    const msg = m => { const el = $ve('ve-fila-msg'); if (el) el.textContent = m || ''; };
    msg('Preparando ' + veFilaNomeTimeline() + '… (o render começa sozinho)');
    if (typeof veMidiasTamanhoGarantir === 'function') await veMidiasTamanhoGarantir();   // 4K ainda sem tamanho: saía ampliado
    if (typeof veCompProntas === 'function') await veCompProntas(msg);
    if (typeof ve3dProntas === 'function') await ve3dProntas(msg);
    // placa ligada: só o plano das transições de sobreposição (a placa faz no shader); desligada: renderiza antes
    if (typeof veOvtProntas === 'function') await veOvtProntas(veExportFaixa(), msg, !!(cfg ? cfg.gpu : veFilaCfgLer().gpu));
    if (VE.clips.some(veTxPrecisa)) await veTxPngs();
    const plano = veExportPlan(true), master = veMasterLim(), mix = master ? [...plano.mix, { master }] : plano.mix;
    const c = cfg ? JSON.parse(JSON.stringify(cfg)) : veFilaCfgLer();
    c.nome = nome || c.nome || veFilaNomeTimeline();
    const it = { id: ++VEFILA.seq, timeline: veFilaNomeTimeline(), dur: plano.dur, estado: 'espera', pct: 0, cfg: c,
        plano: { fonteCom: veFonteParaPlano({ ...plano, mix }, true), fonteSem: veFonteParaPlano({ ...plano, mix }, false), base: plano.base,
                 camadas: plano.camadas, audio: plano.audio, dur: plano.dur, mix, leg: veTxExport(plano.faixa), quadro: [VE.seqW, VE.seqH], projeto: VE.projectPath || '', fps: VE.fps || 30 } };
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
    // prévia renderizada (automática ou In→Out) parada: dividia a placa e a CPU com a exportação (memória estourava)
    if (typeof vePrAutoParar === 'function' && typeof VEPR !== 'undefined' && (VEPR.atual || VEPR.fila.length)) vePrAutoParar();
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
    if (it.estado === 'pronto' && it.saida && !it.cfg.noAudio) veFilaMedirVolume(it);
    if (it.estado === 'pronto' && it.cfg.drive && it.saida) veFilaDriveEnviar(it);
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
// Volume do render pronto (LUFS integrado): etiqueta no item; fora de -20..-11 avisa (YouTube/Instagram ≈ -14..-16)
async function veFilaMedirVolume(it) {
    const api = window.pywebview && window.pywebview.api; if (!api || !api.ve_medir_volume) return;
    const r = await api.ve_medir_volume(it.saida).catch(() => null);
    if (!r || !r.success || r.lufs == null) return;
    it.volume = r;
    const baixo = r.lufs < -20, alto = r.lufs > -11;
    if (baixo || alto) veToast(`Som de "${it.cfg.nome}" ${baixo ? 'BAIXO' : 'ALTO'} demais: ${r.lufs.toFixed(1)} LUFS (o ideal fica entre -16 e -14). Confira o Mix no Mixer.`);
    veFilaRender();
}
// Envio ao Drive do item pronto: o Python sobe (rclone) e aqui só acompanha, 1×/s, na barra do item
async function veFilaDriveEnviar(it) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_drive_enviar) { it.drive = { fase: 'erro', erro: 'esta versão do app ainda não envia ao Drive (atualize)' }; veFilaRender(); return; }
    it.drive = { fase: 'conferindo', pct: 0 };
    veFilaRender();
    const r = await api.ve_drive_enviar(it.saida, it.cfg.drive);
    if (!r || !r.success) { it.drive = { fase: 'erro', erro: (r && r.error) || 'falhou' }; veFilaRender(); veToast('Drive: ' + it.drive.erro); return; }
    it.drive.id = r.id;
    const passo = async () => {
        const e = await api.ve_drive_estado(r.id).catch(() => null);
        if (e && e.success) it.drive = { ...e, id: r.id };
        veFilaRenderItem(it);
        if (!e || !['pronto', 'erro', 'cancelado'].includes(e.fase)) { setTimeout(passo, 1000); return; }
        veFilaRender();
        if (e.fase === 'pronto') { veToast(`"${it.cfg.nome}" está no Drive`); if (typeof playConcluido === 'function') playConcluido(); }
        else if (e.fase === 'erro') veToast('Drive: ' + e.erro);
    };
    passo();
}
function veFilaDriveTexto(d) {
    if (!d) return '';
    const mb = b => (b / 1048576).toFixed(0) + ' MB';
    if (d.fase === 'conferindo') return 'Drive: conferindo a pasta…';
    if (d.fase === 'enviando') return `Drive: enviando ${Math.round(d.pct || 0)}% · ${mb(d.enviado || 0)} de ${mb(d.total || 0)}` +
        (d.vel ? ` · ${(d.vel / 1048576).toFixed(1)} MB/s` : '') + (d.eta != null ? ` · falta ~${veHuman(d.eta)}` : '');
    if (d.fase === 'pronto') return 'Drive: enviado';
    if (d.fase === 'cancelado') return 'Drive: envio cancelado';
    return 'Drive: ' + (d.erro || 'falhou');
}
function veFilaDriveHtml(it) {
    const d = it.drive; if (!d) return '';
    return `<span class="ve-fila-drive ${d.fase}"><span class="ve-fila-barra"><i style="width:${d.pct || 0}%"></i></span><small>${veEsc(veFilaDriveTexto(d))}</small>
        ${d.fase === 'pronto' && d.link ? `<button class="ve-btn ve-btn-sm" onclick="event.stopPropagation(); window.pywebview.api.kani_abrir_link(${veEsc(JSON.stringify(d.link))})">Abrir no Drive</button>` : ''}
        ${['conferindo', 'enviando'].includes(d.fase) && d.id ? `<button class="ve-btn ve-btn-sm" onclick="event.stopPropagation(); window.pywebview.api.ve_drive_cancelar(${d.id})">Cancelar envio</button>` : ''}
        ${['erro', 'cancelado'].includes(d.fase) ? `<button class="ve-btn ve-btn-sm" onclick="event.stopPropagation(); veFilaDriveEnviar(VEFILA.itens.find(x => x.id === ${it.id}))">Enviar de novo</button>` : ''}</span>`;
}
function veFilaFormMudou() {   // formulário mexido com um item escolhido: vale para ele
    const it = VEFILA.itens.find(x => x.id === VEFILA.sel);
    if (it && it.estado !== 'rodando') { it.cfg = veFilaCfgLer(); veFilaRender(); }
}

// ── interface (dentro da janela Exportar) ──
const VE_FILA_ESTADO = { espera: 'Na fila', rodando: 'Renderizando', pronto: 'Pronto', erro: 'Erro', cancelado: 'Cancelado' };
function veFilaMontar() {
    veFilaDriveCampo();
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
    const dv = el.querySelector('.ve-fila-drive');
    if (it.drive && dv && dv.classList.contains(it.drive.fase)) { dv.querySelector('i').style.width = (it.drive.pct || 0) + '%'; dv.querySelector('small').textContent = veFilaDriveTexto(it.drive); }
    else if (it.drive) return veFilaRender();
    veFilaBadge();
}
function veFilaRender() {
    veFilaBadge();
    const L = $ve('ve-fila-lista'); if (!L) return;
    L.innerHTML = VEFILA.itens.length ? VEFILA.itens.map((it, i) => `<div class="ve-fila-item ${it.estado}${VEFILA.sel === it.id ? ' sel' : ''}" data-fila="${it.id}" title="${it.estado === 'espera' ? 'Clique para ver e mudar as configurações deste item' : ''}">
        <span class="ve-fila-n">${i + 1}</span>
        <span class="ve-fila-info"><b>${veEsc(it.cfg.nome)}</b><small>${veEsc(it.timeline)}${it.tempo ? ' · feito em ' + veHuman(it.tempo) : ''}${it.erro ? ' · ' + veEsc(String(it.erro).slice(0, 120)) : ''}</small>
            <span class="ve-fila-tags">${veFilaEtiquetas(it.cfg, it.dur).map(t => `<i>${veEsc(t)}</i>`).join('')}${it.volume ? `<i class="ve-fila-vol${it.volume.lufs < -20 || it.volume.lufs > -11 ? ' ruim' : ''}" title="Volume integrado do som exportado${it.volume.pico != null ? ' · pico ' + it.volume.pico.toFixed(1) + ' dB' : ''}">${it.volume.lufs.toFixed(1)} LUFS</i>` : ''}</span>
            <span class="ve-fila-barra"><i style="width:${it.pct}%"></i></span>${veFilaDriveHtml(it)}</span>
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
