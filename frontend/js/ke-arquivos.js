// =========================================================
// Kanivete Encoder como Media Encoder (2026-10-16): além das timelines, a fila aceita
//   · arquivos do disco (tipo "arquivo"): arrastar para a aba do Ke ou "+ Arquivos"; cada um com a sua predefinição
//     (Functions/ke_arquivos.py: MP4 H.264 máximo/1080p/720p, H.265, ProRes, MP3, WAV; placa quando houver);
//   · renders da Lux (tipo "lux"): a receita do vídeo (todos os quadros) é congelada na hora de pôr na fila e o Blender
//     roda na vez do item (ve3dEstudioVideoSpec + ve_3d_estudio_video).
// Os três tipos usam o mesmo andamento (veFilaEvento), Drive, voz da Fran e "Renderizando agora" (editor-fila.js).
// =========================================================
const KE_ARQ = { presets: null, preset: 'mp4_max' };
const KE_PRESETS_PADRAO = [['mp4_max', 'MP4 · H.264 · qualidade máxima'], ['mp4_1080', 'MP4 · H.264 · 1080p'], ['mp4_720', 'MP4 · H.264 · 720p leve'],
    ['mp4_h265', 'MP4 · H.265 · arquivo menor'], ['prores', 'MOV · ProRes 422 HQ (para editar)'], ['mp3', 'MP3 · só o áudio (320 kbps)'], ['wav', 'WAV · só o áudio']];
try { KE_ARQ.preset = localStorage.getItem('ke-preset') || 'mp4_max'; } catch (e) { /* padrão */ }
const KE_EXT_MIDIA = /\.(mp4|mov|mkv|avi|webm|m4v|mxf|ts|mts|m2ts|mpg|mpeg|wmv|flv|gif|mp3|wav|flac|m4a|aac|ogg|opus|wma)$/i;

function kePresets() { return KE_ARQ.presets || KE_PRESETS_PADRAO; }
const kePresetNome = id => (kePresets().find(p => p[0] === id) || [id, id])[1];
function keCarregarPresets() {
    const api = window.pywebview && window.pywebview.api;
    if (KE_ARQ.presets || !api || !api.ke_presets) return;
    api.ke_presets().then(r => { if (r && r.success) { KE_ARQ.presets = r.presets.map(p => [p.id, p.nome]); keMontarCab(true); } }).catch(() => {});
}

// ── pôr na fila ──
async function keArquivosAdicionar(caminhos, preset = KE_ARQ.preset) {
    const api = window.pywebview.api, novos = [];
    const drive = (($ve('ve-drive-link') || {}).value || '').trim();
    for (const p of caminhos) {
        if (!KE_EXT_MIDIA.test(p)) { veToast(`${veT('Fora do Ke')}: ${p.split(/[\\/]/).pop()} (${veT('só vídeo e áudio')})`); continue; }
        const inf = await api.ke_arquivo_info(p).catch(() => null);
        if (!inf || !inf.success) { veToast(`${veT('Não li o arquivo')}: ${p.split(/[\\/]/).pop()}`); continue; }
        const nome = p.split(/[\\/]/).pop();
        const it = { id: ++VEFILA.seq, tipo: 'arquivo', entrada: p, timeline: veT('Arquivo') + ' · ' + nome, dur: inf.dur, estado: 'espera', pct: 0,
            temVideo: inf.video, cfg: { nome: nome.replace(/\.[^.]+$/, ''), preset: inf.video ? preset : (/^(mp3|wav)$/.test(preset) ? preset : 'mp3'),
                dest: null, gpu: true, drive, noAudio: !inf.audio } };
        VEFILA.itens.push(it); novos.push(it);
    }
    if (novos.length) { veFilaRender(); if (typeof veKeSom === 'function') veKeSom('fila'); veToast(`${novos.length} ${veT('arquivo(s) na fila do Ke')} · ${veT('▶ Renderizar para começar')}`); }
    return novos.map(x => x.id);
}
async function keArquivosEscolher() {
    const r = await window.pywebview.api.ke_escolher_arquivos().catch(() => null);
    if (r && r.success) return keArquivosAdicionar(r.paths);
}
// arquivos soltos na aba do Ke (app.js onArquivosSoltos)
function keSoltar(itens) {
    const arqs = (itens || []).filter(i => !i.pasta).map(i => i.path);
    if (!arqs.length) { veToast(veT('Solte arquivos de vídeo ou áudio (pastas ainda não)')); return; }
    keArquivosAdicionar(arqs).catch(e => veToast(e.message || String(e)));
}

// Lux: congela a receita do vídeo agora e põe na fila (o Blender roda na vez do item)
async function keLuxEnviar(c, qualidade = 'previa', op = {}) {   // op.segundos: só o começo (testes)
    if (!c) { veToast(veT('Abra uma cena na Lux')); return null; }
    veToast(veT('Preparando a cena para a fila do Ke…'));
    const { spec, n, fps } = await ve3dEstudioVideoSpec(c, { qualidade, segundos: op.segundos });
    const m = veMediaOf(c), nome = (m && m.name) || 'Cena';
    const it = { id: ++VEFILA.seq, tipo: 'lux', spec: JSON.stringify(spec), timeline: `Lux · ${nome}`, dur: n / fps, quadros: n, qualidade, estado: 'espera', pct: 0,
        cfg: { nome: nome + (qualidade === 'final' ? ' (final)' : ' (prévia)'), drive: (($ve('ve-drive-link') || {}).value || '').trim(), noAudio: true } };
    VEFILA.itens.push(it); veFilaRender();
    if (typeof veKeSom === 'function') veKeSom('fila');
    veToast(`${veT('Na fila do Kanivete Encoder')}: ${it.cfg.nome} · ${n} ${veT('quadros')} · ${veT('▶ Renderizar no Ke para começar')}`);
    return it.id;
}

// Sound Kanivete: projeto e opções congelados por som-texto.js (skParaKe); cada chamada é um sk_exportar
function keSomEnviar({ nome, proj, chamadas, dur, formato, stems }) {
    const it = { id: ++VEFILA.seq, tipo: 'som', proj, chamadas, timeline: `Sound · ${proj.nome || nome}`, dur: +dur || 0, formato, stems, estado: 'espera', pct: 0,
        cfg: { nome, drive: (($ve('ve-drive-link') || {}).value || '').trim(), noAudio: false } };
    VEFILA.itens.push(it); veFilaRender();
    if (typeof veKeSom === 'function') veKeSom('fila');
    return it.id;
}

// ── execução (chamada por veFilaProximo para os tipos novos) ──
async function keRodarItem(it) {
    const api = window.pywebview.api;
    if (it.tipo === 'arquivo') { await api.ke_arquivo_converter(it.entrada, it.cfg.preset, it.cfg.nomePersonalizado ? { pasta: it.cfg.dest || null, nome: it.cfg.nome } : it.cfg.dest || null, it.cfg.gpu !== false); return; }
    if (it.tipo === 'som') {   // sk_exportar não dá andamento: a barra anda por chamada (stems = uma por faixa)
        const n = it.chamadas.length;
        try {
            let primeiro = null;
            for (const [i, ch] of it.chamadas.entries()) {
                if (VEFILA.pausar && i) { veFilaEvento({ done: true, success: false, cancelled: true }); return; }   // Parar entre stems
                veFilaEvento({ pct: i / n * 100 + 2, message: n > 1 ? `${veT('Mixando o stem')} ${i + 1} ${veT('de')} ${n}` : veT('Mixando o áudio') });
                const r = await api.sk_exportar(it.proj, ch.caminho, ch.op);
                if (r && r.cancelled) { veFilaEvento({ done: true, success: false, cancelled: true }); return; }
                if (!r || !r.success) throw new Error((r && r.error) || veT('não exportou'));
                primeiro = primeiro || r.caminho || ch.caminho;
            }
            veFilaEvento({ done: true, success: true, output_path: primeiro });
        } catch (e) { veFilaEvento({ done: true, success: false, error: e.message || String(e) }); }
        return;
    }
    if (it.tipo === 'lux') {
        // o andamento do Blender vem por consulta (1×/s); o fim chega como o evento do export
        veFilaEvento({ pct: 0, message: veT('Renderizando no Blender, na placa') });   // Cycles + OptiX: o selo do Ke mostra placa
        const tm = setInterval(async () => {
            const p = await api.ve_3d_estudio_progresso().catch(() => null);
            if (p && p.total && VEFILA.atual === it) veFilaEvento({ pct: Math.min(99, p.feito / p.total * 100), message: `${veT('Blender na placa')} · ${p.feito}/${p.total} ${veT('quadros')}` });
        }, 1000);
        if (typeof VE3D === 'object') VE3D.estudioRodando = true;
        try {
            const r = await api.ve_3d_estudio_video(it.spec);
            veFilaEvento(r && r.success ? { done: true, success: true, output_path: r.path }
                : { done: true, success: false, cancelled: !!(r && r.cancelled), error: (r && r.error) || veT('o vídeo falhou') });
        } catch (e) { veFilaEvento({ done: true, success: false, error: e.message || String(e) }); }
        finally { clearInterval(tm); if (typeof VE3D === 'object') VE3D.estudioRodando = false; }
    }
}

// ── interface: escolha da predefinição e "+ Arquivos" no cabeçalho da fila; predefinição por item na lista ──
function keMontarCab(refazer) {
    const cab = document.querySelector('#ve-fila-col .ve-fila-cab'); if (!cab) return;
    let box = cab.querySelector('.ke-arq-cab');
    if (box && !refazer) return;
    if (!box) { box = document.createElement('span'); box.className = 'ke-arq-cab'; cab.querySelector('b').after(box); keCarregarPresets(); }
    box.innerHTML = `<select class="ve-input ke-preset" title="${veT('Predefinição para os arquivos que entrarem na fila')}">${kePresets().map(([id, n]) => `<option value="${id}"${id === KE_ARQ.preset ? ' selected' : ''}>${veEsc(n)}</option>`).join('')}</select>
        <button class="ve-btn ve-btn-sm" title="${veT('Converter vídeos e áudios do disco (ou arraste para a aba do Ke)')}">+ ${veT('Arquivos')}</button>`;
    box.querySelector('select').onchange = e => { KE_ARQ.preset = e.target.value; try { localStorage.setItem('ke-preset', KE_ARQ.preset); } catch (er) { /* sem storage */ } };
    box.querySelector('button').onclick = () => keArquivosEscolher().catch(e => veToast(e.message || String(e)));
}
// etiquetas do item (no lugar das do formulário) e a predefinição editável enquanto espera
function keEtiquetasHtml(it) {
    const tags = it.tipo === 'som' ? [String(it.formato || '').toUpperCase(), it.stems ? `${it.chamadas.length} stems` : 'mixagem', veHuman(it.dur)] : it.tipo === 'lux' ? [it.qualidade === 'final' ? 'Cycles · final' : 'Cycles · prévia', `${it.quadros} ${veT('quadros')}`, veHuman(it.dur)]
        : [it.estado === 'espera' ? '' : kePresetNome(it.cfg.preset), veHuman(it.dur)].filter(Boolean);
    const sel = it.tipo === 'arquivo' && it.estado === 'espera'
        ? `<select class="ke-item-preset" onclick="event.stopPropagation()" onchange="keItemPreset(${it.id}, this.value)">${kePresets().filter(([id]) => it.temVideo || /^(mp3|wav)$/.test(id))
            .map(([id, n]) => `<option value="${id}"${id === it.cfg.preset ? ' selected' : ''}>${veEsc(n)}</option>`).join('')}</select>` : '';
    return sel + tags.map(t => `<i>${veEsc(t)}</i>`).join('');
}
function keItemPreset(id, preset) { const it = VEFILA.itens.find(x => x.id === id); if (it && it.estado === 'espera') it.cfg.preset = preset; }

(function () {
    const r = veFilaRender;
    veFilaRender = function () { r(); keMontarCab(); };
})();
window.KE_API = { som: d => keSomEnviar(d), adicionar: (caminhos, preset) => keArquivosAdicionar(caminhos, preset), lux: (q, op) => keLuxEnviar(typeof ve3dTelaClipe === 'function' ? ve3dTelaClipe() : null, q, op),
    presets: () => kePresets().map(p => p[0]) };
