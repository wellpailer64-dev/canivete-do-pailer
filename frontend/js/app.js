// =========================
// App JavaScript - Canivete do Pailer
// =========================

// ── Estado global ──────────────────────────────────────────────────────────
const selectedPaths = {};   // caminho selecionado por ferramenta
const selectedTypes = {};   // 'file' ou 'folder' por ferramenta
let scraperLogBuffer = [];
let scraperLastAnalyzedUrl = null;

// Helper para tocar som
function playClick() {
    const audio = document.getElementById('audio-click');
    if (audio) { audio.currentTime = 0; audio.play().catch(e => console.log("Audio play blocked", e)); }
}

function playConcluido() {
    const audio = document.getElementById('audio-concluido');
    if (audio) { audio.currentTime = 0; audio.play().catch(e => console.log("Audio play blocked", e)); }
}

function playExecute() {
    const audio = document.getElementById('audio-execute');
    if (audio) { audio.currentTime = 0; audio.play().catch(e => console.log("Audio play blocked", e)); }
}

// FAQ Toggle
function toggleFaq(element) {
    element.classList.toggle('active');
}

console.log("App JS carregando...");

// Global error handler
window.onerror = function(msg, url, line, col, error) {
    console.error("ERRO:", msg);
    return false;
};

// Menu navigation via onclick in HTML

// Função para trocar de ferramenta
function switchTool(toolId) {
    console.log("Switching to:", toolId);
    playClick();
    
    // Atualiza menu
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tool === toolId) {
            item.classList.add('active');
        }
    });

    // Atualiza páginas
    document.querySelectorAll('.tool-page').forEach(page => {
        page.classList.remove('active');
    });

    const page = document.getElementById(`page-${toolId}`);
    if (page) {
        page.classList.add('active');
    } else {
        // Se não existir página, mostra placeholder
        const placeholder = document.getElementById('page-placeholder');
        if (placeholder) placeholder.classList.add('active');
    }

    // Atualiza título
    const toolTitle = document.getElementById('tool-title');
    const menuItem = document.querySelector(`.menu-item[data-tool="${toolId}"]`);
    if (toolTitle && menuItem) {
        const label = menuItem.querySelector('.label');
        if (label) toolTitle.textContent = label.textContent;
    }

    // Refresh states specific to tools
    if (toolId === 'web-scraper') {
        if (typeof checkCerebroStatus === 'function') checkCerebroStatus();
    }
}

// =========================
// Controles de Janela (Removidos - gerenciados pelo SO)
// =========================


// =========================
// Funções de Backend (chamadas para Python)
// =========================

// Selecionar pasta
function selectFolder(tool) {
    window.pywebview.api.select_folder(tool).then(result => {
        if (result.success) {
            selectedPaths[tool] = result.path;
            selectedTypes[tool] = 'folder';
            const infoEl = document.getElementById(`${tool}-selected`);
            if (infoEl) {
                infoEl.textContent = `📁 Pasta: ${result.path}`;
                infoEl.style.color = '#10B981';
            }
            showMessage(tool, `Pasta selecionada: ${result.path}`, 'success');

            // Revela botão de ação se existir wrap escondido
            const wrap = document.getElementById(`btn-organizar-${tool}-wrap`);
            if (wrap) wrap.style.display = 'block';
        } else {
            showMessage(tool, result.error || 'Erro ao selecionar pasta', 'error');
        }
    });
}

// Selecionar arquivo
function selectFile(tool) {
    window.pywebview.api.select_file(tool).then(result => {
        if (result.success) {
            selectedPaths[tool] = result.path;
            selectedTypes[tool] = 'file';
            const infoEl = document.getElementById(`${tool}-selected`);
            if (infoEl) {
                infoEl.textContent = `📄 Arquivo: ${result.path}`;
                infoEl.style.color = '#10B981';
            }
            showMessage(tool, `Arquivo selecionado: ${result.path}`, 'success');
        } else {
            showMessage(tool, result.error || 'Erro ao selecionar arquivo', 'error');
        }
    });
}

// Selecionar imagem
function selectImage(tool) {
    window.pywebview.api.select_image(tool).then(result => {
        if (result.success) {
            selectedPaths[tool] = result.path;
            const fileName = result.path.split(/[/\\]/).pop();
            document.getElementById(`${tool}-selected-file`).textContent = `🖼️ ${fileName}`;
        } else {
            showMessage(tool, result.error || 'Erro ao selecionar imagem', 'error');
        }
    });
}

// =========================
// Converter Áudio
// =========================

function runConverterAudio() {
    const format = document.querySelector('input[name="audio-format"]:checked').value;
    const path = selectedPaths['converter-audio'];
    const type = selectedTypes['converter-audio'];

    if (!path) {
        showMessage('converter-audio', 'Selecione uma pasta ou arquivo primeiro!', 'error');
        return;
    }
    
    playExecute();

    document.getElementById('progress-converter-audio').style.display = 'flex';
    document.getElementById('progress-fill-converter-audio').style.width = '0%';
    document.getElementById('progress-text-converter-audio').textContent = '0%';
    document.getElementById('log-converter-audio').textContent = '';

    if (type === 'file') {
        window.pywebview.api.converter_audio_file(path, format);
    } else {
        window.pywebview.api.converter_audio(path, format);
    }
}

// Callback para atualizar progresso do conversor de áudio
function updateConverterAudioProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-converter-audio').style.width = data.percent + '%';
        document.getElementById('progress-text-converter-audio').textContent = data.percent + '%';
    }
    if (data.log) {
        document.getElementById('log-converter-audio').textContent += data.log + '\n';
    }
    if (data.complete) {
        playConcluido();
        showMessage('converter-audio', 'Conversão concluída!', 'success');
    }
}

// =========================
// Cortar Audio
// =========================

const audioCutterState = {
    path: null,
    previewUrl: null,
    previewFallbackUrl: null,
    originalDuration: 0,
    duration: 0,
    peaks: [],
    cuts: [],
    cutPoints: [],
    layers: [],
    activeLayerId: 'main',
    mainLocked: false,
    mainOffset: 0,
    history: [],
    playhead: 0,
    zoom: 1,
    viewStart: 0,
    timelineTool: 'select',
    dragMode: null,
    dragLayerId: null,
    dragStartX: 0,
    dragStartOffset: 0,
    dragStartView: 0,
    playheadSelected: false,
    dragging: false,
    isPlaying: false
};

function formatAudioTime(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    const min = Math.floor(seconds / 60);
    const sec = seconds - min * 60;
    return `${String(min).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

function clampAudioTime(value) {
    const duration = getAudioTimelineDuration();
    return Math.min(Math.max(Number(value) || 0, 0), duration);
}

function getAudioTimelineDuration() {
    const mainEnd = (audioCutterState.mainOffset || 0) + getLayerEditedDuration('main');
    const layerEnd = audioCutterState.layers.reduce((max, layer) => {
        return Math.max(max, (Number(layer.offset) || 0) + getLayerEditedDuration(layer.id));
    }, 0);
    return Math.max(0, mainEnd, layerEnd);
}

function clampAudioView() {
    const duration = getAudioTimelineDuration();
    audioCutterState.zoom = Math.min(32, Math.max(1, Number(audioCutterState.zoom) || 1));
    const visibleDuration = duration / audioCutterState.zoom;
    const maxStart = Math.max(0, duration - visibleDuration);
    audioCutterState.viewStart = Math.min(Math.max(Number(audioCutterState.viewStart) || 0, 0), maxStart);
}

function getAudioVisibleDuration() {
    clampAudioView();
    return getAudioTimelineDuration() / (audioCutterState.zoom || 1);
}

function ensureAudioPlayheadVisible() {
    const visibleDuration = getAudioVisibleDuration();
    const margin = visibleDuration * 0.08;
    if (audioCutterState.playhead < audioCutterState.viewStart + margin) {
        audioCutterState.viewStart = audioCutterState.playhead - margin;
    } else if (audioCutterState.playhead > audioCutterState.viewStart + visibleDuration - margin) {
        audioCutterState.viewStart = audioCutterState.playhead - visibleDuration + margin;
    }
    clampAudioView();
}

function timeFromCanvasEvent(event) {
    const canvas = event.target.closest('.track-waveform') || document.getElementById('audio-waveform');
    if (!canvas) return audioCutterState.playhead;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    return audioCutterState.viewStart + (x / rect.width) * getAudioVisibleDuration();
}

function normalizeAudioCuts(cuts) {
    const duration = audioCutterState.originalDuration || 0;
    return normalizeAudioCutsForDuration(cuts, duration);
}

function normalizeAudioCutsForDuration(cuts, duration) {
    const sane = (cuts || [])
        .map(cut => ({
            start: Math.max(0, Math.min(Number(cut.start) || 0, duration)),
            end: Math.max(0, Math.min(Number(cut.end) || 0, duration))
        }))
        .filter(cut => cut.end - cut.start >= 0.03)
        .sort((a, b) => a.start - b.start);

    const merged = [];
    sane.forEach(cut => {
        if (!merged.length || cut.start > merged[merged.length - 1].end + 0.01) {
            merged.push({ start: cut.start, end: cut.end });
        } else {
            merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, cut.end);
        }
    });
    return merged;
}

function getAudioKeptSegments() {
    return getAudioKeptSegmentsForLayer('main');
}

function getLayerById(layerId) {
    return layerId === 'main' ? null : audioCutterState.layers.find(layer => layer.id === layerId);
}

function getLayerOffset(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? (audioCutterState.mainOffset || 0) : (layer?.offset || 0);
}

function getLayerOriginalDuration(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? (audioCutterState.originalDuration || 0) : (layer?.duration || 0);
}

function getLayerEditedDuration(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? (audioCutterState.duration || 0) : (layer?.editedDuration ?? layer?.duration ?? 0);
}

function getLayerCuts(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? audioCutterState.cuts : (layer?.cuts || []);
}

function setLayerCuts(layerId, cuts) {
    if (layerId === 'main') {
        audioCutterState.cuts = cuts;
    } else {
        const layer = getLayerById(layerId);
        if (layer) layer.cuts = cuts;
    }
}

function getLayerCutPoints(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? audioCutterState.cutPoints : (layer?.cutPoints || []);
}

function setLayerCutPoints(layerId, points) {
    if (layerId === 'main') {
        audioCutterState.cutPoints = points;
    } else {
        const layer = getLayerById(layerId);
        if (layer) layer.cutPoints = points;
    }
}

function getAudioKeptSegmentsForLayer(layerId) {
    const duration = getLayerOriginalDuration(layerId);
    const cuts = normalizeAudioCutsForDuration(getLayerCuts(layerId), duration);
    const segments = [];
    let cursor = 0;
    cuts.forEach(cut => {
        if (cut.start > cursor) {
            segments.push({ start: cursor, end: cut.start });
        }
        cursor = Math.max(cursor, cut.end);
    });
    if (cursor < duration) {
        segments.push({ start: cursor, end: duration });
    }
    return segments.filter(segment => segment.end - segment.start >= 0.03);
}

function recalcAudioEditedDuration() {
    audioCutterState.cuts = normalizeAudioCuts(audioCutterState.cuts);
    audioCutterState.duration = getAudioKeptSegments()
        .reduce((total, segment) => total + (segment.end - segment.start), 0);
    audioCutterState.playhead = clampAudioTime(audioCutterState.playhead);
}

function recalcLayerEditedDuration(layerId) {
    if (layerId === 'main') {
        recalcAudioEditedDuration();
        return;
    }
    const layer = getLayerById(layerId);
    if (!layer) return;
    layer.cuts = normalizeAudioCutsForDuration(layer.cuts || [], layer.duration || 0);
    layer.editedDuration = getAudioKeptSegmentsForLayer(layerId)
        .reduce((total, segment) => total + (segment.end - segment.start), 0);
}

function editedToOriginalTime(editedTime) {
    return editedToOriginalTimeForLayer('main', editedTime);
}

function editedToOriginalTimeForLayer(layerId, editedTime) {
    let remaining = clampAudioTime(editedTime);
    if (layerId !== 'main') {
        remaining = Math.min(Math.max(Number(editedTime) || 0, 0), getLayerEditedDuration(layerId));
    }
    const segments = getAudioKeptSegmentsForLayer(layerId);
    for (const segment of segments) {
        const len = segment.end - segment.start;
        if (remaining <= len) {
            return segment.start + remaining;
        }
        remaining -= len;
    }
    return segments.length ? segments[segments.length - 1].end : 0;
}

function originalToEditedTime(originalTime) {
    return originalToEditedTimeForLayer('main', originalTime);
}

function originalToEditedTimeForLayer(layerId, originalTime) {
    const t = Math.max(0, Number(originalTime) || 0);
    let edited = 0;
    for (const segment of getAudioKeptSegmentsForLayer(layerId)) {
        if (t <= segment.start) return edited;
        if (t <= segment.end) return edited + (t - segment.start);
        edited += segment.end - segment.start;
    }
    return getLayerEditedDuration(layerId);
}

function setAudioPlayhead(time, syncPlayer = true) {
    audioCutterState.playhead = clampAudioTime(time);
    ensureAudioPlayheadVisible();
    if (syncPlayer) {
        const player = document.getElementById('audio-cutter-player');
        if (player) {
            const mainLocalTime = audioCutterState.playhead - (audioCutterState.mainOffset || 0);
            player.currentTime = editedToOriginalTime(Math.max(0, Math.min(audioCutterState.duration, mainLocalTime)));
        }
    }
    updateAudioTimelineReadout();
    drawAudioWaveform();
}

function updateAudioTimelineReadout() {
    const readout = document.getElementById('audio-timeline-readout');
    const label = document.getElementById('audio-playhead-label');
    const zoomText = audioCutterState.zoom > 1 ? ` | Zoom ${audioCutterState.zoom.toFixed(1)}x` : '';
    const text = `${formatAudioTime(audioCutterState.playhead)} / ${formatAudioTime(getAudioTimelineDuration())}${zoomText}`;
    if (readout) readout.textContent = text;
    if (label) label.textContent = formatAudioTime(audioCutterState.playhead);
}

function updateAudioTransportButton() {
    const btn = document.getElementById('btn-audio-play');
    if (btn) {
        btn.textContent = audioCutterState.isPlaying ? 'Pause' : 'Play';
    }
}

function setAudioTimelineTool(tool) {
    audioCutterState.timelineTool = tool === 'hand' ? 'hand' : 'select';
    const timeline = document.getElementById('audio-tracks-timeline');
    if (timeline) {
        timeline.classList.toggle('hand-tool', audioCutterState.timelineTool === 'hand');
    }
    document.getElementById('btn-tool-select')?.classList.toggle('active', audioCutterState.timelineTool === 'select');
    document.getElementById('btn-tool-hand')?.classList.toggle('active', audioCutterState.timelineTool === 'hand');
}

function toggleAudioEditsPopover() {
    const popover = document.getElementById('audio-edits-popover');
    if (!popover) return;
    popover.style.display = popover.style.display === 'none' || !popover.style.display ? 'block' : 'none';
}

function openAudioExportPopup() {
    if (!audioCutterState.path) {
        showMessage('audio-cutter', 'Carregue a faixa principal antes de exportar.', 'error');
        return;
    }
    const modal = document.getElementById('audio-export-modal');
    if (modal) modal.style.display = 'flex';
}

function closeAudioExportPopup() {
    const modal = document.getElementById('audio-export-modal');
    if (modal) modal.style.display = 'none';
}

function dbToGain(db) {
    return Math.pow(10, (Number(db) || 0) / 20);
}

function getAudioLayerElement(layer) {
    let audio = document.getElementById(`audio-layer-${layer.id}`);
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-layer-${layer.id}`;
        audio.preload = 'auto';
        audio.style.display = 'none';
        document.body.appendChild(audio);
    }
    return audio;
}

function syncAudioLayerElement(layer) {
    const audio = getAudioLayerElement(layer);
    if (audio.src.indexOf(layer.previewUrl || '') === -1) {
        audio.src = layer.previewUrl;
        audio.load();
    }
    audio.volume = Math.min(1, Math.max(0, dbToGain(layer.volumeDb)));
    return audio;
}

function renderAudioLayersList() {
    const timeline = document.getElementById('audio-tracks-timeline');
    const playheadLabel = document.getElementById('audio-playhead-label');
    if (!timeline) return;

    const mainActive = audioCutterState.activeLayerId === 'main' ? ' active' : '';
    const mainLocked = audioCutterState.mainLocked ? ' locked' : '';
    const mainLockText = audioCutterState.mainLocked ? 'Lock' : 'Livre';
    const mainRow = `
        <div class="audio-track-row${mainActive}${mainLocked}" data-layer-id="main">
            <div class="audio-track-panel">
                <div class="audio-track-name">Principal</div>
                <div class="audio-track-meta">0 dB | ${mainLockText} | ${formatAudioTime(audioCutterState.mainOffset || 0)}</div>
                <button type="button" onclick="selectAudioLayer('main')">Editar</button>
                <button type="button" onclick="toggleAudioLayerLock('main')">${mainLockText}</button>
            </div>
            <canvas id="audio-waveform" class="track-waveform" data-layer-id="main" width="1200" height="180"></canvas>
        </div>
    `;

    const extraRows = audioCutterState.layers.map(layer => {
        const active = audioCutterState.activeLayerId === layer.id ? ' active' : '';
        const lockedClass = layer.locked ? ' locked' : '';
        const lockText = layer.locked ? 'Lock' : 'Livre';
        return `
            <div class="audio-track-row${active}${lockedClass}" data-layer-id="${layer.id}">
                <div class="audio-track-panel">
                    <div class="audio-track-name" title="${layer.name}">${layer.name}</div>
                    <div class="audio-track-meta">${layer.volumeDb} dB | ${lockText} | ${formatAudioTime(layer.offset || 0)}</div>
                    <input type="range" min="-36" max="12" step="1" value="${layer.volumeDb}" oninput="setAudioLayerVolume('${layer.id}', this.value)">
                    <button type="button" onclick="toggleAudioLayerLock('${layer.id}')">${lockText}</button>
                    <button type="button" onclick="removeAudioLayer('${layer.id}')">Remover</button>
                </div>
                <canvas id="waveform-${layer.id}" class="track-waveform" data-layer-id="${layer.id}" width="1200" height="120"></canvas>
            </div>
        `;
    }).join('');

    timeline.innerHTML = mainRow + extraRows;
    if (playheadLabel) timeline.appendChild(playheadLabel);
    drawAudioWaveform();
}

function getAudioWaveformData(layerId) {
    if (layerId === 'main') {
        return {
            peaks: audioCutterState.peaks,
            duration: audioCutterState.originalDuration,
            offset: audioCutterState.mainOffset || 0,
            color: '#F97316',
            cutPoints: audioCutterState.cutPoints,
            layerId: 'main'
        };
    }
    const idx = audioCutterState.layers.findIndex(layer => layer.id === layerId);
    const layer = audioCutterState.layers[idx];
    return {
        peaks: layer?.peaks || [],
        duration: layer?.duration || audioCutterState.duration,
        offset: layer?.offset || 0,
        color: ['#38BDF8', '#A78BFA', '#22C55E', '#F472B6'][Math.max(0, idx) % 4],
        cutPoints: layer?.cutPoints || [],
        layerId
    };
}

function drawSingleAudioWaveform(canvas) {
    if (!canvas) return;
    clampAudioView();
    const layerId = canvas.dataset.layerId || 'main';
    const data = getAudioWaveformData(layerId);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(300, Math.floor(canvas.clientWidth || 900));
    const height = Math.max(88, Math.floor(canvas.clientHeight || 112));
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, width, height);

    const mid = height / 2;
    const peaks = data.peaks;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    if (peaks.length) {
        ctx.fillStyle = data.color;
        const columns = Math.min(width, 1200);
        const barWidth = width / columns;
        for (let i = 0; i < columns; i++) {
            const editedTime = audioCutterState.viewStart + (i / Math.max(1, columns - 1)) * getAudioVisibleDuration();
            const localTime = editedTime - (data.offset || 0);
            if (localTime < 0 || localTime > getLayerEditedDuration(layerId)) {
                continue;
            }
            const sourceTime = editedToOriginalTimeForLayer(layerId, localTime);
            const peakIndex = Math.min(
                peaks.length - 1,
                Math.max(0, Math.floor((sourceTime / Math.max(0.001, data.duration || 1)) * peaks.length))
            );
            const peak = peaks[peakIndex] || 0;
            const h = Math.max(1, peak * (height * 0.82));
            const x = i * barWidth;
            ctx.fillRect(x, mid - h / 2, Math.max(1, barWidth - 1), h);
        }
    } else {
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('Carregando waveform...', 18, 30);
    }

    const visibleDuration = getAudioVisibleDuration() || 1;
    if (data.cutPoints?.length) {
        data.cutPoints.forEach(point => {
            const x = (((point + (data.offset || 0)) - audioCutterState.viewStart) / visibleDuration) * width;
            if (x < 0 || x > width) return;
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        });
    }

    const playheadX = ((audioCutterState.playhead - audioCutterState.viewStart) / visibleDuration) * width;
    ctx.strokeStyle = audioCutterState.playheadSelected ? '#38BDF8' : '#D1D5DB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.fillStyle = audioCutterState.playheadSelected ? '#38BDF8' : '#D1D5DB';
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX - 7, 10);
    ctx.lineTo(playheadX + 7, 10);
    ctx.closePath();
    ctx.fill();
}

function drawAudioWaveform() {
    document.querySelectorAll('.track-waveform').forEach(canvas => drawSingleAudioWaveform(canvas));
}

async function loadAudioWaveform(url) {
    if (!audioCutterState.peaks.length) {
        drawAudioWaveform();
    }
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioCtx();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channel = audioBuffer.getChannelData(0);
        const samples = 900;
        const blockSize = Math.max(1, Math.floor(channel.length / samples));
        const peaks = [];
        for (let i = 0; i < samples; i++) {
            let sum = 0;
            const start = i * blockSize;
            const end = Math.min(channel.length, start + blockSize);
            for (let j = start; j < end; j++) {
                sum += Math.abs(channel[j]);
            }
            peaks.push(Math.min(1, sum / Math.max(1, end - start) * 2.6));
        }
        audioCutterState.peaks = peaks;
        if (audioCtx.close) audioCtx.close();
    } catch (err) {
        showMessage('audio-cutter', 'Nao foi possivel desenhar a waveform, mas o corte ainda pode ser feito pelos tempos.', 'error');
    }
    drawAudioWaveform();
}

function selectAudioCutterFile() {
    window.pywebview.api.select_file('audio-cutter').then(result => {
        if (!result.success) {
            showMessage('audio-cutter', result.error || 'Erro ao selecionar arquivo', 'error');
            return;
        }

        playExecute();
        const selected = document.getElementById('audio-cutter-selected');
        if (selected) {
            selected.textContent = `Preparando preview: ${result.path}`;
            selected.style.color = '#F59E0B';
        }
        document.getElementById('log-audio-cutter').textContent = '';

        window.pywebview.api.audio_cutter_prepare(result.path).then(preview => {
            if (!preview.success) {
                showMessage('audio-cutter', preview.error || 'Nao foi possivel preparar o audio.', 'error');
                if (selected) selected.style.color = '#EF4444';
                return;
            }

            selectedPaths['audio-cutter'] = preview.path;
            selectedTypes['audio-cutter'] = 'file';
            audioCutterState.path = preview.path;
            audioCutterState.previewUrl = preview.preview_url;
            audioCutterState.previewFallbackUrl = preview.preview_fallback_url || null;
            audioCutterState.originalDuration = Number(preview.duration) || 0;
            audioCutterState.duration = audioCutterState.originalDuration;
            audioCutterState.peaks = Array.isArray(preview.peaks) ? preview.peaks : [];
            audioCutterState.cuts = [];
            audioCutterState.cutPoints = [];
            audioCutterState.layers.forEach(layer => {
                const el = document.getElementById(`audio-layer-${layer.id}`);
                if (el) el.remove();
            });
            audioCutterState.layers = [];
            audioCutterState.activeLayerId = 'main';
            audioCutterState.mainLocked = false;
            audioCutterState.mainOffset = 0;
            audioCutterState.history = [];
            audioCutterState.playhead = 0;
            audioCutterState.zoom = 1;
            audioCutterState.viewStart = 0;
            audioCutterState.isPlaying = false;

            if (selected) {
                selected.textContent = `Arquivo: ${preview.file_name} | Duracao: ${formatAudioTime(audioCutterState.duration)}`;
                selected.style.color = '#10B981';
            }

            const editor = document.getElementById('audio-editor');
            if (editor) editor.style.display = 'block';
            const player = document.getElementById('audio-cutter-player');
            if (player) {
                player.pause();
                player.preload = 'auto';
                player.src = preview.preview_url;
                player.load();
            }
            document.getElementById('btn-audio-cutter').disabled = true;
            renderAudioLayersList();
            renderAudioCutsList();
            updateAudioTimelineReadout();
            updateAudioTransportButton();
            drawAudioWaveform();
            if (!audioCutterState.peaks.length) {
                loadAudioWaveform(preview.preview_url);
            }
            showMessage('audio-cutter', 'Audio carregado. Use a agulha para editar a timeline.', 'success');
        });
    });
}

function addAudioLayer() {
    if (!audioCutterState.path) {
        showMessage('audio-cutter', 'Carregue a faixa principal primeiro.', 'error');
        return;
    }

    window.pywebview.api.select_file('audio-cutter-layer').then(result => {
        if (!result.success) {
            showMessage('audio-cutter', result.error || 'Erro ao selecionar faixa', 'error');
            return;
        }

        showMessage('audio-cutter', `Preparando faixa extra: ${result.path}`, 'success');
        window.pywebview.api.audio_cutter_prepare(result.path).then(preview => {
            if (!preview.success) {
                showMessage('audio-cutter', preview.error || 'Nao foi possivel preparar a faixa extra.', 'error');
                return;
            }

            const layer = {
                id: `layer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                path: preview.path,
                name: preview.file_name,
                previewUrl: preview.preview_url,
                fallbackUrl: preview.preview_fallback_url || '',
                duration: Number(preview.duration) || 0,
                editedDuration: Number(preview.duration) || 0,
                peaks: Array.isArray(preview.peaks) ? preview.peaks : [],
                cuts: [],
                cutPoints: [],
                offset: audioCutterState.playhead || 0,
                volumeDb: -12,
                locked: true
            };
            audioCutterState.layers.push(layer);
            syncAudioLayerElement(layer);
            renderAudioLayersList();
            document.getElementById('btn-audio-cutter').disabled = false;
            showMessage('audio-cutter', `Faixa adicionada: ${layer.name}`, 'success');
        });
    });
}

function selectAudioLayer(layerId) {
    audioCutterState.activeLayerId = layerId;
    renderAudioLayersList();
}

function setAudioLayerVolume(layerId, value) {
    const layer = audioCutterState.layers.find(item => item.id === layerId);
    if (!layer) return;
    layer.volumeDb = Math.max(-36, Math.min(12, Number(value) || 0));
    const audio = syncAudioLayerElement(layer);
    audio.volume = Math.min(1, Math.max(0, dbToGain(layer.volumeDb)));
    renderAudioLayersList();
}

function toggleAudioLayerLock(layerId) {
    if (layerId === 'main') {
        audioCutterState.mainLocked = !audioCutterState.mainLocked;
        renderAudioLayersList();
        return;
    }
    const layer = audioCutterState.layers.find(item => item.id === layerId);
    if (!layer) return;
    layer.locked = !layer.locked;
    renderAudioLayersList();
}

function removeAudioLayer(layerId) {
    const idx = audioCutterState.layers.findIndex(item => item.id === layerId);
    if (idx < 0) return;
    const [layer] = audioCutterState.layers.splice(idx, 1);
    const audio = document.getElementById(`audio-layer-${layer.id}`);
    if (audio) audio.remove();
    if (audioCutterState.activeLayerId === layerId) {
        audioCutterState.activeLayerId = 'main';
    }
    renderAudioLayersList();
    document.getElementById('btn-audio-cutter').disabled = !hasAudioEdits();
}

function saveAudioHistory() {
    audioCutterState.history.push({
        cuts: audioCutterState.cuts.map(cut => ({ ...cut })),
        cutPoints: [...audioCutterState.cutPoints],
        layers: audioCutterState.layers.map(layer => ({
            id: layer.id,
            cuts: (layer.cuts || []).map(cut => ({ ...cut })),
            cutPoints: [...(layer.cutPoints || [])],
            editedDuration: layer.editedDuration ?? layer.duration
        })),
        playhead: audioCutterState.playhead
    });
    if (audioCutterState.history.length > 50) {
        audioCutterState.history.shift();
    }
}

function bladeAudioAtPlayhead() {
    if (!audioCutterState.path) {
        showMessage('audio-cutter', 'Selecione um audio primeiro.', 'error');
        return;
    }
    const layerId = audioCutterState.activeLayerId;
    if (isAudioLayerLocked(layerId)) {
        showMessage('audio-cutter', layerId === 'main' ? 'A faixa principal esta bloqueada.' : 'Essa camada esta bloqueada.', 'error');
        return;
    }
    const offset = getLayerOffset(layerId);
    const editedDuration = getLayerEditedDuration(layerId);
    const point = Math.min(Math.max(audioCutterState.playhead - offset, 0), editedDuration || 0);
    if (point <= 0 || point >= editedDuration) {
        return;
    }
    const points = getLayerCutPoints(layerId);
    if (points.some(existing => Math.abs(existing - point) < 0.03)) {
        return;
    }
    setLayerCutPoints(layerId, [...points, point].sort((a, b) => a - b));
    renderAudioCutsList();
    drawAudioWaveform();
}

function editedRangeToOriginalCuts(startEdited, endEdited, layerId = 'main') {
    const start = Math.min(startEdited, endEdited);
    const end = Math.max(startEdited, endEdited);
    if (end - start < 0.03) return [];

    const result = [];
    let editedCursor = 0;
    for (const segment of getAudioKeptSegmentsForLayer(layerId)) {
        const segLen = segment.end - segment.start;
        const segEditedStart = editedCursor;
        const segEditedEnd = editedCursor + segLen;
        const overlapStart = Math.max(start, segEditedStart);
        const overlapEnd = Math.min(end, segEditedEnd);
        if (overlapEnd - overlapStart >= 0.03) {
            result.push({
                start: segment.start + (overlapStart - segEditedStart),
                end: segment.start + (overlapEnd - segEditedStart)
            });
        }
        editedCursor = segEditedEnd;
    }
    return result;
}

function applyAudioRippleDelete(startEdited, endEdited) {
    const start = Math.min(startEdited, endEdited);
    const end = Math.max(startEdited, endEdited);
    const removedLen = end - start;
    if (!audioCutterState.path || removedLen < 0.03) return;
    const layerId = audioCutterState.activeLayerId;
    if (isAudioLayerLocked(layerId)) {
        showMessage('audio-cutter', layerId === 'main' ? 'A faixa principal esta bloqueada.' : 'Essa camada esta bloqueada.', 'error');
        return;
    }

    const newCuts = editedRangeToOriginalCuts(start, end, layerId);
    if (!newCuts.length) return;

    saveAudioHistory();
    const originalDuration = getLayerOriginalDuration(layerId);
    setLayerCuts(layerId, normalizeAudioCutsForDuration([...getLayerCuts(layerId), ...newCuts], originalDuration));
    const newPoints = getLayerCutPoints(layerId)
        .filter(point => point < start || point > end)
        .map(point => point > end ? point - removedLen : point);
    if (!newPoints.some(point => Math.abs(point - start) < 0.03) && start > 0) {
        newPoints.push(start);
    }
    setLayerCutPoints(layerId, newPoints.sort((a, b) => a - b));
    recalcLayerEditedDuration(layerId);
    setAudioPlayhead(start + getLayerOffset(layerId));
    renderAudioCutsList();
    renderAudioLayersList();
    document.getElementById('btn-audio-cutter').disabled = !hasAudioEdits();
    showMessage('audio-cutter', `Corte aplicado: ${formatAudioTime(start)} - ${formatAudioTime(end)}`, 'success');
}

function rippleDeleteAudioLeft() {
    const layerId = audioCutterState.activeLayerId;
    const playhead = Math.min(Math.max(audioCutterState.playhead - getLayerOffset(layerId), 0), getLayerEditedDuration(layerId) || 0);
    const previous = [...getLayerCutPoints(layerId)].reverse().find(point => point < playhead - 0.03);
    applyAudioRippleDelete(previous ?? 0, playhead);
}

function rippleDeleteAudioRight() {
    const layerId = audioCutterState.activeLayerId;
    const playhead = Math.min(Math.max(audioCutterState.playhead - getLayerOffset(layerId), 0), getLayerEditedDuration(layerId) || 0);
    const next = getLayerCutPoints(layerId).find(point => point > playhead + 0.03);
    applyAudioRippleDelete(playhead, next ?? getLayerEditedDuration(layerId));
}

function undoAudioEdit() {
    const last = audioCutterState.history.pop();
    if (!last) return;
    audioCutterState.cuts = last.cuts;
    audioCutterState.cutPoints = last.cutPoints;
    (last.layers || []).forEach(saved => {
        const layer = getLayerById(saved.id);
        if (layer) {
            layer.cuts = saved.cuts || [];
            layer.cutPoints = saved.cutPoints || [];
            layer.editedDuration = saved.editedDuration ?? layer.duration;
        }
    });
    recalcAudioEditedDuration();
    setAudioPlayhead(last.playhead);
    renderAudioCutsList();
    renderAudioLayersList();
    document.getElementById('btn-audio-cutter').disabled = !hasAudioEdits();
}

function clearAudioCuts() {
    const player = document.getElementById('audio-cutter-player');
    if (player) player.pause();
    audioCutterState.isPlaying = false;
    updateAudioTransportButton();
    saveAudioHistory();
    audioCutterState.cuts = [];
    audioCutterState.cutPoints = [];
    audioCutterState.layers.forEach(layer => {
        layer.cuts = [];
        layer.cutPoints = [];
        layer.editedDuration = layer.duration;
    });
    audioCutterState.activeLayerId = 'main';
    audioCutterState.duration = audioCutterState.originalDuration || 0;
    audioCutterState.playhead = 0;
    audioCutterState.zoom = 1;
    audioCutterState.viewStart = 0;
    renderAudioCutsList();
    renderAudioLayersList();
    setAudioPlayhead(0);
    document.getElementById('btn-audio-cutter').disabled = audioCutterState.layers.length === 0;
}

function renderAudioCutsList() {
    const list = document.getElementById('audio-cuts-list');
    if (!list) return;
    const rows = [];
    audioCutterState.cuts.forEach((cut, index) => {
        rows.push(`<div class="audio-cut-item"><span>Principal ${index + 1}. ${formatAudioTime(cut.start)} - ${formatAudioTime(cut.end)}</span></div>`);
    });
    audioCutterState.layers.forEach(layer => {
        (layer.cuts || []).forEach((cut, index) => {
            rows.push(`<div class="audio-cut-item"><span>${layer.name} ${index + 1}. ${formatAudioTime(cut.start)} - ${formatAudioTime(cut.end)}</span></div>`);
        });
    });
    if (!rows.length) {
        list.innerHTML = '<div class="selected-info">Nenhuma edicao aplicada ainda.</div>';
        return;
    }
    list.innerHTML = rows.join('');
}

function hasAudioEdits() {
    return audioCutterState.cuts.length > 0
        || audioCutterState.layers.length > 0
        || audioCutterState.layers.some(layer => (layer.cuts || []).length > 0);
}

async function toggleAudioTimelinePlayback() {
    const player = document.getElementById('audio-cutter-player');
    if (!player || !audioCutterState.path) {
        showMessage('audio-cutter', 'Selecione um audio primeiro.', 'error');
        return;
    }

    if (audioCutterState.isPlaying) {
        player.pause();
        return;
    }

    if (audioCutterState.playhead >= audioCutterState.duration - 0.03) {
        setAudioPlayhead(0);
    }

    if (!player.src && audioCutterState.previewUrl) {
        player.src = audioCutterState.previewUrl;
        player.load();
    }

    const mainLocalTime = Math.max(0, Math.min(audioCutterState.duration, audioCutterState.playhead - (audioCutterState.mainOffset || 0)));
    player.currentTime = editedToOriginalTime(mainLocalTime);
    audioCutterState.layers.forEach(layer => {
        const audio = syncAudioLayerElement(layer);
        audio.currentTime = Math.min(Math.max(0, audioCutterState.playhead - (layer.offset || 0)), Math.max(0, layer.duration - 0.02));
    });
    try {
        const playResult = player.play();
        if (playResult && typeof playResult.then === 'function') {
            await playResult;
        }
        audioCutterState.layers.forEach(layer => {
            const audio = syncAudioLayerElement(layer);
            audio.play().catch(() => {});
        });
        audioCutterState.isPlaying = true;
        updateAudioTransportButton();
    } catch (err) {
        if (audioCutterState.previewFallbackUrl && player.src.indexOf(audioCutterState.previewFallbackUrl) === -1) {
            player.src = audioCutterState.previewFallbackUrl;
            player.load();
            player.currentTime = editedToOriginalTime(mainLocalTime);
            try {
                const fallbackPlay = player.play();
                if (fallbackPlay && typeof fallbackPlay.then === 'function') {
                    await fallbackPlay;
                }
                audioCutterState.isPlaying = true;
                updateAudioTransportButton();
                return;
            } catch (fallbackErr) {
                err = fallbackErr;
            }
        }
        audioCutterState.isPlaying = false;
        updateAudioTransportButton();
        showMessage('audio-cutter', `Nao consegui iniciar o playback: ${err.message || err}`, 'error');
    }
}

function exportAudioCuts() {
    if (!audioCutterState.path) {
        showMessage('audio-cutter', 'Carregue a faixa principal antes de salvar.', 'error');
        return;
    }
    if (!hasAudioEdits()) {
        showMessage('audio-cutter', 'Adicione pelo menos um corte ou uma faixa extra antes de salvar.', 'error');
        return;
    }
    const format = document.querySelector('input[name="audio-cutter-format"]:checked').value;
    const extraTracks = audioCutterState.layers.map(layer => ({
        path: layer.path,
        name: layer.name,
        volumeDb: layer.volumeDb,
        locked: layer.locked,
        offset: layer.offset || 0,
        cuts: layer.cuts || []
    }));
    playExecute();
    document.getElementById('btn-audio-cutter').disabled = true;
    document.getElementById('progress-audio-cutter').style.display = 'flex';
    document.getElementById('progress-fill-audio-cutter').style.width = '35%';
    document.getElementById('progress-text-audio-cutter').textContent = 'Processando...';
    showMessage('audio-cutter', 'Exportando audio editado...', 'success');
    window.pywebview.api.audio_cutter_export(audioCutterState.path, audioCutterState.cuts, format, extraTracks, audioCutterState.mainOffset || 0);
}

function updateAudioCutterProgress(data) {
    if (data.log) {
        showMessage('audio-cutter', data.log, 'success');
    }
    if (data.error) {
        document.getElementById('progress-audio-cutter').style.display = 'none';
        document.getElementById('btn-audio-cutter').disabled = audioCutterState.cuts.length === 0;
        showMessage('audio-cutter', data.error, 'error');
    }
    if (data.complete) {
        document.getElementById('progress-fill-audio-cutter').style.width = '100%';
        document.getElementById('progress-text-audio-cutter').textContent = 'Concluido';
        document.getElementById('btn-audio-cutter').disabled = false;
        playConcluido();
        showMessage('audio-cutter', `Audio salvo: ${data.output_path}`, 'success');
    }
}

function syncAudioPlaybackPosition() {
    const player = document.getElementById('audio-cutter-player');
    if (!player || !audioCutterState.path || !audioCutterState.isPlaying) return;

    const segments = getAudioKeptSegments();
    const original = player.currentTime;
    const currentSegment = segments.find(segment => original >= segment.start - 0.02 && original <= segment.end + 0.02);
    if (!currentSegment) {
        const next = segments.find(segment => segment.start > original);
        if (next) {
            player.currentTime = next.start;
            setAudioPlayhead(originalToEditedTime(next.start) + (audioCutterState.mainOffset || 0), false);
            syncBackgroundLayersToPlayhead();
        } else {
            player.pause();
            pauseBackgroundLayers();
            audioCutterState.isPlaying = false;
            updateAudioTransportButton();
            setAudioPlayhead((audioCutterState.mainOffset || 0) + audioCutterState.duration, false);
        }
        return;
    }

    if (original >= currentSegment.end - 0.02) {
        const next = segments.find(segment => segment.start > currentSegment.end + 0.01);
        if (next) {
            player.currentTime = next.start;
            setAudioPlayhead(originalToEditedTime(next.start) + (audioCutterState.mainOffset || 0), false);
            syncBackgroundLayersToPlayhead();
        }
    } else {
        setAudioPlayhead(originalToEditedTime(original) + (audioCutterState.mainOffset || 0), false);
        syncBackgroundLayersToPlayhead(0.35);
    }
}

function pauseBackgroundLayers() {
    audioCutterState.layers.forEach(layer => {
        const audio = document.getElementById(`audio-layer-${layer.id}`);
        if (audio) audio.pause();
    });
}

function syncBackgroundLayersToPlayhead(threshold = 0.05) {
    audioCutterState.layers.forEach(layer => {
        const audio = syncAudioLayerElement(layer);
        const target = Math.min(Math.max(0, audioCutterState.playhead - (layer.offset || 0)), Math.max(0, layer.duration - 0.02));
        if (Math.abs(audio.currentTime - target) > threshold) {
            audio.currentTime = target;
        }
    });
}

function zoomAudioWaveform(event) {
    if (!event.altKey || !audioCutterState.duration) return;
    event.preventDefault();

    const canvas = event.target.closest('.track-waveform') || document.getElementById('audio-waveform');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xRatio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const anchorTime = audioCutterState.viewStart + xRatio * getAudioVisibleDuration();
    const factor = event.deltaY < 0 ? 1.22 : 1 / 1.22;

    audioCutterState.zoom = Math.min(32, Math.max(1, audioCutterState.zoom * factor));
    const nextVisibleDuration = getAudioVisibleDuration();
    audioCutterState.viewStart = anchorTime - xRatio * nextVisibleDuration;
    clampAudioView();
    updateAudioTimelineReadout();
    drawAudioWaveform();
}

function getLayerAtEvent(event) {
    const row = event.target.closest('.audio-track-row');
    return row?.dataset?.layerId || 'main';
}

function getCanvasDeltaTime(event) {
    const canvas = event.target.closest('.track-waveform') || document.getElementById('audio-waveform');
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return ((event.clientX - audioCutterState.dragStartX) / Math.max(1, rect.width)) * getAudioVisibleDuration();
}

function isPointerOnPlayhead(event) {
    const canvas = event.target.closest('.track-waveform') || document.getElementById('audio-waveform');
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const visibleDuration = getAudioVisibleDuration() || 1;
    const x = ((audioCutterState.playhead - audioCutterState.viewStart) / visibleDuration) * rect.width;
    return Math.abs((event.clientX - rect.left) - x) <= 10;
}

function isAudioLayerLocked(layerId) {
    if (layerId === 'main') return audioCutterState.mainLocked;
    return !!audioCutterState.layers.find(layer => layer.id === layerId)?.locked;
}

function setLayerOffset(layerId, offset) {
    const safeOffset = Math.max(0, Number(offset) || 0);
    if (layerId === 'main') {
        audioCutterState.mainOffset = safeOffset;
    } else {
        const layer = audioCutterState.layers.find(item => item.id === layerId);
        if (layer) layer.offset = safeOffset;
    }
    updateAudioTimelineReadout();
    renderAudioLayersList();
}

document.addEventListener('DOMContentLoaded', () => {
    const timeline = document.getElementById('audio-tracks-timeline');
    const player = document.getElementById('audio-cutter-player');

    if (timeline) {
        timeline.addEventListener('wheel', event => {
            if (event.target.closest('.track-waveform')) {
                zoomAudioWaveform(event);
            }
        }, { passive: false });
        timeline.addEventListener('mousedown', event => {
            if (!event.target.closest('.track-waveform')) return;
            if (!audioCutterState.duration) return;
            audioCutterState.dragStartX = event.clientX;

            if (isPointerOnPlayhead(event)) {
                audioCutterState.playheadSelected = true;
                audioCutterState.dragMode = 'playhead';
                setAudioPlayhead(timeFromCanvasEvent(event));
                drawAudioWaveform();
                return;
            }

            if (audioCutterState.playheadSelected) {
                audioCutterState.dragMode = 'playhead';
                setAudioPlayhead(timeFromCanvasEvent(event));
                return;
            }

            if (audioCutterState.timelineTool === 'hand') {
                audioCutterState.dragMode = 'pan';
                audioCutterState.dragStartView = audioCutterState.viewStart;
                timeline.classList.add('dragging-view');
                return;
            }

            const layerId = getLayerAtEvent(event);
            audioCutterState.activeLayerId = layerId;
            renderAudioLayersList();
            if (isAudioLayerLocked(layerId)) {
                setAudioPlayhead(timeFromCanvasEvent(event));
                return;
            }
            audioCutterState.dragMode = 'layer';
            audioCutterState.dragLayerId = layerId;
            audioCutterState.dragStartOffset = layerId === 'main'
                ? (audioCutterState.mainOffset || 0)
                : (audioCutterState.layers.find(layer => layer.id === layerId)?.offset || 0);
            event.target.closest('.audio-track-row')?.classList.add('dragging');
        });
        timeline.addEventListener('mousemove', event => {
            if (!event.target.closest('.track-waveform')) return;
            if (audioCutterState.dragMode === 'pan') {
                const delta = getCanvasDeltaTime(event);
                audioCutterState.viewStart = audioCutterState.dragStartView - delta;
                clampAudioView();
                updateAudioTimelineReadout();
                drawAudioWaveform();
                return;
            }
            if (audioCutterState.dragMode === 'playhead') {
                setAudioPlayhead(timeFromCanvasEvent(event));
                return;
            }
            if (audioCutterState.dragMode === 'layer') {
                const delta = getCanvasDeltaTime(event);
                setLayerOffset(audioCutterState.dragLayerId, audioCutterState.dragStartOffset + delta);
            }
        });
        window.addEventListener('mouseup', () => {
            if (!audioCutterState.dragMode) return;
            document.querySelectorAll('.audio-track-row.dragging').forEach(row => row.classList.remove('dragging'));
            timeline.classList.remove('dragging-view');
            audioCutterState.dragMode = null;
            audioCutterState.dragLayerId = null;
        });
    }

    if (player) {
        player.addEventListener('timeupdate', syncAudioPlaybackPosition);
        player.addEventListener('play', () => {
            audioCutterState.isPlaying = true;
            updateAudioTransportButton();
        });
        player.addEventListener('pause', () => {
            audioCutterState.isPlaying = false;
            pauseBackgroundLayers();
            updateAudioTransportButton();
        });
        player.addEventListener('ended', () => {
            audioCutterState.isPlaying = false;
            pauseBackgroundLayers();
            updateAudioTransportButton();
            setAudioPlayhead(getAudioTimelineDuration(), false);
        });
    }

    document.addEventListener('mousedown', event => {
        if (!document.getElementById('page-audio-cutter')?.classList.contains('active')) return;
        if (event.target.closest('#audio-tracks-timeline')) return;
        if (!event.target.closest('#audio-edits-popover') && !event.target.closest('.rail-tool')) {
            const popover = document.getElementById('audio-edits-popover');
            if (popover) popover.style.display = 'none';
        }
        if (!audioCutterState.playheadSelected) return;
        audioCutterState.playheadSelected = false;
        drawAudioWaveform();
    });

    document.addEventListener('keydown', event => {
        if (!document.getElementById('page-audio-cutter')?.classList.contains('active')) return;
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) return;
        const key = event.key.toLowerCase();
        if (key === ' ') {
            event.preventDefault();
            toggleAudioTimelinePlayback();
        } else if (key === 'v') {
            event.preventDefault();
            setAudioTimelineTool('select');
        } else if (key === 'm') {
            event.preventDefault();
            setAudioTimelineTool('hand');
        } else if (key === 'e') {
            event.preventDefault();
            bladeAudioAtPlayhead();
        } else if (key === 'q') {
            event.preventDefault();
            rippleDeleteAudioLeft();
        } else if (key === 'w') {
            event.preventDefault();
            rippleDeleteAudioRight();
        }
    });

    window.addEventListener('resize', drawAudioWaveform);
    setAudioTimelineTool('select');
});

// =========================
// Cortar Vídeo
// =========================

const videoCutterState = {
    path: null,
    fileUrl: null,
    duration: 0,
    originalDuration: 0,
    width: 0,
    height: 0,
    fps: 25,
    has_audio: false,
    thumbs: [],
    thumbInterval: 0,
    thumbImages: [],
    cuts: [],
    cutPoints: [],
    history: [],
    playhead: 0,
    zoom: 1,
    viewStart: 0,
    timelineTool: 'select',
    dragMode: null,
    dragStartX: 0,
    dragStartView: 0,
    playheadSelected: false,
    isPlaying: false,
};

function clampVideoTime(val) {
    return Math.min(Math.max(Number(val) || 0, 0), videoCutterState.originalDuration || 0);
}

function clampVideoView() {
    const dur = videoCutterState.originalDuration || 0;
    videoCutterState.zoom = Math.min(32, Math.max(1, Number(videoCutterState.zoom) || 1));
    const vis = dur / videoCutterState.zoom;
    const maxStart = Math.max(0, dur - vis);
    videoCutterState.viewStart = Math.min(Math.max(Number(videoCutterState.viewStart) || 0, 0), maxStart);
}

function getVideoVisibleDuration() {
    clampVideoView();
    return (videoCutterState.originalDuration || 0) / (videoCutterState.zoom || 1);
}

function normalizeVideoCuts(cuts) {
    const dur = videoCutterState.originalDuration || 0;
    const sane = (cuts || [])
        .map(c => ({
            start: Math.max(0, Math.min(Number(c.start) || 0, dur)),
            end:   Math.max(0, Math.min(Number(c.end)   || 0, dur)),
        }))
        .filter(c => c.end - c.start >= 0.03)
        .sort((a, b) => a.start - b.start);
    const merged = [];
    sane.forEach(c => {
        if (!merged.length || c.start > merged[merged.length - 1].end + 0.01) {
            merged.push({ start: c.start, end: c.end });
        } else {
            merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, c.end);
        }
    });
    return merged;
}

function getVideoKeptSegments() {
    const dur = videoCutterState.originalDuration || 0;
    const cuts = normalizeVideoCuts(videoCutterState.cuts);
    const segs = [];
    let cursor = 0;
    cuts.forEach(c => {
        if (c.start > cursor) segs.push({ start: cursor, end: c.start });
        cursor = Math.max(cursor, c.end);
    });
    if (cursor < dur) segs.push({ start: cursor, end: dur });
    return segs.filter(s => s.end - s.start >= 0.03);
}

function videoEditedToOriginal(t) {
    let remaining = Math.max(0, Number(t) || 0);
    for (const seg of getVideoKeptSegments()) {
        const len = seg.end - seg.start;
        if (remaining <= len) return seg.start + remaining;
        remaining -= len;
    }
    const segs = getVideoKeptSegments();
    return segs.length ? segs[segs.length - 1].end : 0;
}

function videoOriginalToEdited(orig) {
    const t = Math.max(0, Number(orig) || 0);
    let edited = 0;
    for (const seg of getVideoKeptSegments()) {
        if (t <= seg.start) return edited;
        if (t <= seg.end)   return edited + (t - seg.start);
        edited += seg.end - seg.start;
    }
    return edited;
}

function getVideoEditedDuration() {
    return getVideoKeptSegments().reduce((acc, s) => acc + (s.end - s.start), 0);
}

function setVideoPlayhead(time, syncPlayer = true) {
    videoCutterState.playhead = clampVideoTime(time);
    if (syncPlayer) {
        const player = document.getElementById('video-cutter-player');
        if (player && videoCutterState.fileUrl) {
            player.currentTime = videoCutterState.playhead;
        }
    }
    updateVideoTimelineReadout();
    drawVideoTimeline();
}

function updateVideoTimelineReadout() {
    const readout = document.getElementById('video-timeline-readout');
    const label   = document.getElementById('video-playhead-label');
    const zoom    = videoCutterState.zoom > 1 ? ` | Zoom ${videoCutterState.zoom.toFixed(1)}x` : '';
    const text    = `${formatAudioTime(videoCutterState.playhead)} / ${formatAudioTime(videoCutterState.originalDuration)}${zoom}`;
    if (readout) readout.textContent = text;
    if (label)   label.textContent   = formatAudioTime(videoCutterState.playhead);
}

function preloadVideoThumbs() {
    videoCutterState.thumbImages = videoCutterState.thumbs.map(url => {
        if (!url) return null;
        const img = new Image();
        img.onload = () => drawVideoTimeline();
        img.src = url;
        return img;
    });
}

function drawVideoTimeline() {
    const canvas = document.getElementById('video-waveform');
    if (!canvas) return;
    clampVideoView();
    const ctx    = canvas.getContext('2d');
    const dpr    = window.devicePixelRatio || 1;
    const width  = Math.max(300, Math.floor(canvas.clientWidth  || 900));
    const height = Math.max(80,  Math.floor(canvas.clientHeight || 120));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width  = width  * dpr;
        canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    const visDur = getVideoVisibleDuration() || 1;
    const interval = videoCutterState.thumbInterval || 1;

    // Draw thumbnails as filmstrip
    videoCutterState.thumbImages.forEach((img, idx) => {
        if (!img || !img.complete || !img.naturalWidth) return;
        const tStart = idx * interval;
        const tEnd   = (idx + 1) * interval;
        const x1 = ((tStart - videoCutterState.viewStart) / visDur) * width;
        const x2 = ((tEnd   - videoCutterState.viewStart) / visDur) * width;
        const tw = x2 - x1;
        if (x2 < 0 || x1 > width || tw <= 0) return;
        const sx = Math.max(x1, 0);
        const sw = Math.min(x2, width) - sx;
        try {
            ctx.drawImage(img, sx, 0, sw, height);
        } catch (_) {}
    });

    // Overlay for cut (removed) regions
    const cuts = normalizeVideoCuts(videoCutterState.cuts);
    cuts.forEach(c => {
        const x1 = ((c.start - videoCutterState.viewStart) / visDur) * width;
        const x2 = ((c.end   - videoCutterState.viewStart) / visDur) * width;
        if (x2 < 0 || x1 > width) return;
        const rx = Math.max(x1, 0);
        const rw = Math.min(x2, width) - rx;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(rx, 0, rw, height);
        ctx.fillStyle = '#ef4444';
        if (x1 >= 0) ctx.fillRect(Math.max(x1, 0), 0, 3, height);
        if (x2 <= width) ctx.fillRect(Math.min(x2, width) - 3, 0, 3, height);
    });

    // Cut point markers
    videoCutterState.cutPoints.forEach(pt => {
        const x = ((pt - videoCutterState.viewStart) / visDur) * width;
        if (x < 0 || x > width) return;
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    });

    // Playhead
    const px = ((videoCutterState.playhead - videoCutterState.viewStart) / visDur) * width;
    ctx.strokeStyle = videoCutterState.playheadSelected ? '#38BDF8' : '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
    ctx.fillStyle = videoCutterState.playheadSelected ? '#38BDF8' : '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px - 7, 10);
    ctx.lineTo(px + 7, 10);
    ctx.closePath();
    ctx.fill();
}

function timeFromVideoCanvasEvent(event) {
    const canvas = document.getElementById('video-waveform');
    if (!canvas) return videoCutterState.playhead;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    return videoCutterState.viewStart + (x / rect.width) * getVideoVisibleDuration();
}

function isPointerOnVideoPlayhead(event) {
    const canvas = document.getElementById('video-waveform');
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const visDur = getVideoVisibleDuration() || 1;
    const x = ((videoCutterState.playhead - videoCutterState.viewStart) / visDur) * rect.width;
    return Math.abs((event.clientX - rect.left) - x) <= 10;
}

function setVideoTimelineTool(tool) {
    videoCutterState.timelineTool = tool === 'hand' ? 'hand' : 'select';
    const timeline = document.getElementById('video-tracks-timeline');
    if (timeline) timeline.classList.toggle('hand-tool', videoCutterState.timelineTool === 'hand');
    document.getElementById('vbtn-tool-select')?.classList.toggle('active', videoCutterState.timelineTool === 'select');
    document.getElementById('vbtn-tool-hand')?.classList.toggle('active',   videoCutterState.timelineTool === 'hand');
}

function toggleVideoEditsPopover() {
    const pop = document.getElementById('video-edits-popover');
    if (!pop) return;
    pop.style.display = pop.style.display === 'none' || !pop.style.display ? 'block' : 'none';
}

function renderVideoCutsList() {
    const list = document.getElementById('video-cuts-list');
    if (!list) return;
    const cuts = normalizeVideoCuts(videoCutterState.cuts);
    if (!cuts.length) {
        list.innerHTML = '<div class="selected-info">Nenhum corte aplicado ainda.</div>';
        return;
    }
    list.innerHTML = cuts.map((c, i) =>
        `<div class="audio-cut-item"><span>Corte ${i + 1}: ${formatAudioTime(c.start)} — ${formatAudioTime(c.end)}</span></div>`
    ).join('');
}

function saveVideoHistory() {
    videoCutterState.history.push({
        cuts: videoCutterState.cuts.map(c => ({ ...c })),
        cutPoints: [...videoCutterState.cutPoints],
        playhead: videoCutterState.playhead,
    });
    if (videoCutterState.history.length > 50) videoCutterState.history.shift();
}

function bladeVideoAtPlayhead() {
    if (!videoCutterState.path) {
        showMessage('video-cutter', 'Selecione um vídeo primeiro.', 'error');
        return;
    }
    const pt = videoCutterState.playhead;
    const dur = videoCutterState.originalDuration || 0;
    if (pt <= 0 || pt >= dur) return;
    if (videoCutterState.cutPoints.some(p => Math.abs(p - pt) < 0.03)) return;
    videoCutterState.cutPoints = [...videoCutterState.cutPoints, pt].sort((a, b) => a - b);
    renderVideoCutsList();
    drawVideoTimeline();
}

function applyVideoRippleDelete(startT, endT) {
    const start = Math.min(startT, endT);
    const end   = Math.max(startT, endT);
    if (!videoCutterState.path || end - start < 0.03) return;
    saveVideoHistory();
    const dur = videoCutterState.originalDuration || 0;
    const existing = normalizeVideoCuts(videoCutterState.cuts);
    const newCut = { start, end };
    videoCutterState.cuts = normalizeVideoCuts([...existing, newCut]);
    videoCutterState.cutPoints = videoCutterState.cutPoints.filter(p => p < start || p > end);
    setVideoPlayhead(start);
    renderVideoCutsList();
    document.getElementById('btn-video-cutter').disabled = false;
    showMessage('video-cutter', `Corte: ${formatAudioTime(start)} — ${formatAudioTime(end)}`, 'success');
}

function rippleDeleteVideoLeft() {
    const ph   = videoCutterState.playhead;
    const prev = [...videoCutterState.cutPoints].reverse().find(p => p < ph - 0.03);
    applyVideoRippleDelete(prev ?? 0, ph);
}

function rippleDeleteVideoRight() {
    const ph   = videoCutterState.playhead;
    const next = videoCutterState.cutPoints.find(p => p > ph + 0.03);
    applyVideoRippleDelete(ph, next ?? (videoCutterState.originalDuration || 0));
}

function undoVideoEdit() {
    const last = videoCutterState.history.pop();
    if (!last) return;
    videoCutterState.cuts      = last.cuts;
    videoCutterState.cutPoints = last.cutPoints;
    setVideoPlayhead(last.playhead);
    renderVideoCutsList();
    document.getElementById('btn-video-cutter').disabled = !videoCutterState.path;
}

function clearVideoCuts() {
    const player = document.getElementById('video-cutter-player');
    if (player) player.pause();
    videoCutterState.isPlaying = false;
    saveVideoHistory();
    videoCutterState.cuts      = [];
    videoCutterState.cutPoints = [];
    setVideoPlayhead(0);
    renderVideoCutsList();
}

function selectVideoCutterFile() {
    window.pywebview.api.select_video_file('video-cutter').then(result => {
        if (!result.success) {
            showMessage('video-cutter', result.error || 'Erro ao selecionar arquivo', 'error');
            return;
        }

        playExecute();
        const selected = document.getElementById('video-cutter-selected');
        if (selected) {
            selected.textContent = `Preparando miniaturas: ${result.path}`;
            selected.style.color = '#F59E0B';
        }
        document.getElementById('log-video-cutter').textContent = '';

        window.pywebview.api.video_cutter_prepare(result.path).then(preview => {
            if (!preview.success) {
                showMessage('video-cutter', preview.error || 'Não foi possível preparar o vídeo.', 'error');
                if (selected) selected.style.color = '#EF4444';
                return;
            }

            videoCutterState.path           = preview.path;
            videoCutterState.fileUrl        = preview.file_url;
            videoCutterState.originalDuration = Number(preview.duration) || 0;
            videoCutterState.duration       = videoCutterState.originalDuration;
            videoCutterState.width          = preview.width  || 0;
            videoCutterState.height         = preview.height || 0;
            videoCutterState.fps            = preview.fps    || 25;
            videoCutterState.has_audio      = !!preview.has_audio;
            videoCutterState.thumbs         = Array.isArray(preview.thumbs) ? preview.thumbs : [];
            videoCutterState.thumbInterval  = Number(preview.thumb_interval) || 1;
            videoCutterState.cuts           = [];
            videoCutterState.cutPoints      = [];
            videoCutterState.history        = [];
            videoCutterState.playhead       = 0;
            videoCutterState.zoom           = 1;
            videoCutterState.viewStart      = 0;
            videoCutterState.isPlaying      = false;

            if (selected) {
                const res = videoCutterState.width && videoCutterState.height
                    ? ` | ${videoCutterState.width}×${videoCutterState.height}` : '';
                const audio = videoCutterState.has_audio ? '' : ' | sem áudio';
                selected.textContent = `${preview.file_name}${res} | ${videoCutterState.fps.toFixed(2)}fps | ${formatAudioTime(videoCutterState.originalDuration)}${audio}`;
                selected.style.color = '#10B981';
            }

            const player = document.getElementById('video-cutter-player');
            if (player) {
                player.pause();
                player.src = preview.file_url;
                player.load();
            }

            const editor = document.getElementById('video-editor');
            if (editor) editor.style.display = 'flex';

            preloadVideoThumbs();
            document.getElementById('btn-video-cutter').disabled = false;
            renderVideoCutsList();
            updateVideoTimelineReadout();
            drawVideoTimeline();
            showMessage('video-cutter', 'Vídeo carregado. Use as ferramentas para editar a timeline.', 'success');
        });
    });
}

function openVideoExportModal() {
    if (!videoCutterState.path) {
        showMessage('video-cutter', 'Carregue um vídeo antes de exportar.', 'error');
        return;
    }
    const modal = document.getElementById('video-export-modal');
    if (modal) modal.style.display = 'flex';
}

function closeVideoExportModal() {
    const modal = document.getElementById('video-export-modal');
    if (modal) modal.style.display = 'none';
}

function exportVideoCuts() {
    if (!videoCutterState.path) {
        showMessage('video-cutter', 'Carregue um vídeo antes de exportar.', 'error');
        return;
    }
    const format  = document.querySelector('input[name="video-cutter-format"]:checked').value;
    const quality = document.querySelector('input[name="video-cutter-quality"]:checked').value;

    playExecute();
    document.getElementById('btn-video-cutter').disabled = true;
    document.getElementById('progress-video-cutter').style.display = 'flex';
    document.getElementById('progress-fill-video-cutter').style.width = '35%';
    document.getElementById('progress-text-video-cutter').textContent = 'Processando...';
    document.getElementById('log-video-cutter').textContent = '';

    window.pywebview.api.video_cutter_export(
        videoCutterState.path,
        videoCutterState.cuts,
        format,
        quality
    );
}

function updateVideoCutterProgress(data) {
    if (data.log) {
        const log = document.getElementById('log-video-cutter');
        if (log) log.textContent += data.log + '\n';
    }
    if (data.error) {
        document.getElementById('progress-video-cutter').style.display = 'none';
        document.getElementById('btn-video-cutter').disabled = false;
        showMessage('video-cutter', data.error, 'error');
    }
    if (data.complete) {
        document.getElementById('progress-fill-video-cutter').style.width = '100%';
        document.getElementById('progress-text-video-cutter').textContent = 'Concluído!';
        document.getElementById('btn-video-cutter').disabled = false;
        playConcluido();
        showMessage('video-cutter', `Vídeo salvo: ${data.output_path || ''}`, 'success');
    }
}

function syncVideoPlaybackPosition() {
    const player = document.getElementById('video-cutter-player');
    if (!player || !videoCutterState.path || !videoCutterState.isPlaying) return;

    const orig = player.currentTime;
    const segments = getVideoKeptSegments();
    const cur = segments.find(s => orig >= s.start - 0.05 && orig <= s.end + 0.05);

    if (!cur) {
        const next = segments.find(s => s.start > orig);
        if (next) {
            player.currentTime = next.start;
            setVideoPlayhead(next.start, false);
        } else {
            player.pause();
            videoCutterState.isPlaying = false;
            setVideoPlayhead(videoCutterState.originalDuration, false);
        }
        return;
    }

    if (orig >= cur.end - 0.05) {
        const next = segments.find(s => s.start > cur.end + 0.01);
        if (next) {
            player.currentTime = next.start;
            setVideoPlayhead(next.start, false);
        }
    } else {
        setVideoPlayhead(orig, false);
    }
}

function zoomVideoTimeline(event) {
    if (!event.altKey || !videoCutterState.originalDuration) return;
    event.preventDefault();
    const canvas = document.getElementById('video-waveform');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xRatio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const anchor = videoCutterState.viewStart + xRatio * getVideoVisibleDuration();
    const factor = event.deltaY < 0 ? 1.22 : 1 / 1.22;
    videoCutterState.zoom = Math.min(32, Math.max(1, videoCutterState.zoom * factor));
    const nextVis = getVideoVisibleDuration();
    videoCutterState.viewStart = anchor - xRatio * nextVis;
    clampVideoView();
    updateVideoTimelineReadout();
    drawVideoTimeline();
}

document.addEventListener('DOMContentLoaded', () => {
    const vtimeline = document.getElementById('video-tracks-timeline');
    const vplayer   = document.getElementById('video-cutter-player');

    if (vtimeline) {
        vtimeline.addEventListener('wheel', event => {
            if (event.target.closest('.track-waveform')) zoomVideoTimeline(event);
        }, { passive: false });

        vtimeline.addEventListener('mousedown', event => {
            if (!event.target.closest('.track-waveform')) return;
            if (!videoCutterState.originalDuration) return;
            videoCutterState.dragStartX = event.clientX;

            if (isPointerOnVideoPlayhead(event)) {
                videoCutterState.playheadSelected = true;
                videoCutterState.dragMode = 'playhead';
                setVideoPlayhead(timeFromVideoCanvasEvent(event));
                return;
            }
            if (videoCutterState.playheadSelected) {
                videoCutterState.dragMode = 'playhead';
                setVideoPlayhead(timeFromVideoCanvasEvent(event));
                return;
            }
            if (videoCutterState.timelineTool === 'hand') {
                videoCutterState.dragMode = 'pan';
                videoCutterState.dragStartView = videoCutterState.viewStart;
                vtimeline.classList.add('dragging-view');
                return;
            }
            videoCutterState.dragMode = 'seek';
            setVideoPlayhead(timeFromVideoCanvasEvent(event));
        });

        vtimeline.addEventListener('mousemove', event => {
            if (!event.target.closest('.track-waveform')) return;
            if (videoCutterState.dragMode === 'pan') {
                const rect = document.getElementById('video-waveform')?.getBoundingClientRect();
                if (!rect) return;
                const delta = ((event.clientX - videoCutterState.dragStartX) / rect.width) * getVideoVisibleDuration();
                videoCutterState.viewStart = videoCutterState.dragStartView - delta;
                clampVideoView();
                updateVideoTimelineReadout();
                drawVideoTimeline();
            } else if (videoCutterState.dragMode === 'playhead' || videoCutterState.dragMode === 'seek') {
                setVideoPlayhead(timeFromVideoCanvasEvent(event));
            }
        });

        window.addEventListener('mouseup', () => {
            if (!videoCutterState.dragMode) return;
            vtimeline.classList.remove('dragging-view');
            videoCutterState.dragMode = null;
        });
    }

    if (vplayer) {
        vplayer.addEventListener('timeupdate', syncVideoPlaybackPosition);
        vplayer.addEventListener('play',  () => { videoCutterState.isPlaying = true; });
        vplayer.addEventListener('pause', () => { videoCutterState.isPlaying = false; });
        vplayer.addEventListener('ended', () => {
            videoCutterState.isPlaying = false;
            setVideoPlayhead(videoCutterState.originalDuration, false);
        });
        vplayer.addEventListener('seeked', () => {
            if (!videoCutterState.isPlaying) {
                setVideoPlayhead(vplayer.currentTime, false);
            }
        });
    }

    document.addEventListener('mousedown', event => {
        if (!document.getElementById('page-video-cutter')?.classList.contains('active')) return;
        if (!event.target.closest('#video-tracks-timeline') && !event.target.closest('#video-edits-popover')) {
            const pop = document.getElementById('video-edits-popover');
            if (pop) pop.style.display = 'none';
        }
        if (!videoCutterState.playheadSelected) return;
        if (!event.target.closest('#video-tracks-timeline')) {
            videoCutterState.playheadSelected = false;
            drawVideoTimeline();
        }
    });

    document.addEventListener('keydown', event => {
        if (!document.getElementById('page-video-cutter')?.classList.contains('active')) return;
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) return;
        const key = event.key.toLowerCase();
        if (key === 'v') { event.preventDefault(); setVideoTimelineTool('select'); }
        else if (key === 'm') { event.preventDefault(); setVideoTimelineTool('hand'); }
        else if (key === 'e') { event.preventDefault(); bladeVideoAtPlayhead(); }
        else if (key === 'q') { event.preventDefault(); rippleDeleteVideoLeft(); }
        else if (key === 'w') { event.preventDefault(); rippleDeleteVideoRight(); }
    });

    window.addEventListener('resize', drawVideoTimeline);
    setVideoTimelineTool('select');
});

// =========================
// Converter Imagem
// =========================

function runConverterImagem() {
    const format = document.querySelector('input[name="img-format"]:checked').value;
    const path = selectedPaths['converter-imagem'];
    const type = selectedTypes['converter-imagem'];

    if (!path) {
        showMessage('converter-imagem', 'Selecione uma pasta ou arquivo primeiro!', 'error');
        return;
    }
    
    playExecute();

    document.getElementById('progress-converter-imagem').style.display = 'flex';
    document.getElementById('progress-fill-converter-imagem').style.width = '0%';
    document.getElementById('progress-text-converter-imagem').textContent = '0%';
    document.getElementById('log-converter-imagem').textContent = '';

    if (type === 'file') {
        window.pywebview.api.converter_imagem_file(path, format);
    } else {
        window.pywebview.api.converter_imagem(path, format);
    }
}

// Callback para atualizar progresso do conversor de imagem
function updateConverterImagemProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-converter-imagem').style.width = data.percent + '%';
        document.getElementById('progress-text-converter-imagem').textContent = data.percent + '%';
    }
    if (data.log) {
        document.getElementById('log-converter-imagem').textContent += data.log + '\n';
    }
    if (data.complete) {
        playConcluido();
        showMessage('converter-imagem', 'Conversão concluída!', 'success');
    }
}

// =========================
// Favicon Generator
// =========================

function runFaviconGenerator() {
    const siteName = document.getElementById('favicon-site-name').value;
    const themeColor = document.getElementById('favicon-theme-color').value;
    const imagePath = selectedPaths['favicon'];

    if (!imagePath) {
        showMessage('favicon', 'Selecione uma imagem primeiro!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-favicon').style.display = 'flex';
    document.getElementById('progress-fill-favicon').style.width = '0%';
    document.getElementById('progress-text-favicon').textContent = '0%';
    document.getElementById('log-favicon').textContent = '';

    window.pywebview.api.favicon_generator(imagePath, siteName, themeColor);
}

function updateFaviconProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-favicon').style.width = data.percent + '%';
        document.getElementById('progress-text-favicon').textContent = data.percent + '%';
    }
    if (data.log) {
        document.getElementById('log-favicon').textContent += data.log + '\n';
    }
    if (data.complete) {
        playConcluido();
        showMessage('favicon', 'Favicons gerados com sucesso!', 'success');
    }
}

// =========================
// Compressor de Imagem
// =========================

document.getElementById('compressor-img-quality')?.addEventListener('input', function() {
    document.getElementById('compressor-img-quality-val').textContent = this.value + '%';
});

function runCompressorImagem() {
    const path = selectedPaths['compressor-imagem'];
    const type = selectedTypes['compressor-imagem'];
    const forceFullhd = document.getElementById('compressor-img-fullhd')?.checked || false;

    if (!path) {
        showMessage('compressor-imagem', 'Selecione uma pasta ou arquivo primeiro!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-compressor-imagem').style.display = 'flex';
    document.getElementById('progress-fill-compressor-imagem').style.width = '0%';
    document.getElementById('progress-text-compressor-imagem').textContent = '0%';
    document.getElementById('log-compressor-imagem').textContent = '';

    if (type === 'file') {
        window.pywebview.api.compressor_imagem_file(path, forceFullhd);
    } else {
        window.pywebview.api.compressor_imagem(path, forceFullhd);
    }
}

function updateCompressorImagemProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-compressor-imagem').style.width = data.percent + '%';
        document.getElementById('progress-text-compressor-imagem').textContent = data.percent + '%';
    }
    if (data.log) {
        const logEl = document.getElementById('log-compressor-imagem');
        logEl.textContent += data.log + '\n';
        logEl.scrollTop = logEl.scrollHeight;
    }
    if (data.complete) {
        playConcluido();
        showMessage('compressor-imagem', 'Compressão concluída!', 'success');
    }
}

// =========================
// Compressor de Vídeo
// =========================

function updateCompressorVideoProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-compressor-video').style.width = data.percent + '%';
        document.getElementById('progress-text-compressor-video').textContent = data.percent + '%';
    }
    if (data.status) {
        document.getElementById('progress-text-compressor-video').textContent = data.status;
    }
    if (data.log) {
        document.getElementById('log-compressor-video').textContent += data.log + '\n';
        const logSection = document.getElementById('log-compressor-video');
        logSection.scrollTop = logSection.scrollHeight;
    }
    if (data.complete) {
        playConcluido();
        showMessage('compressor-video', 'Compressão concluída!', 'success');
    }
}

function runCompressorVideo() {
    try {
        const gpu  = document.querySelector('input[name="video-gpu"]:checked').value;
        const mode = document.querySelector('input[name="video-mode"]:checked').value;
        const path = selectedPaths['compressor-video'];
        const type = selectedTypes['compressor-video'];

        if (!path) {
            showMessage('compressor-video', 'Selecione uma pasta ou arquivo primeiro!', 'error');
            return;
        }
        
        playExecute();
        document.getElementById('progress-compressor-video').style.display = 'flex';
        document.getElementById('progress-fill-compressor-video').style.width = '0%';
        document.getElementById('progress-text-compressor-video').textContent = '0%';
        document.getElementById('log-compressor-video').textContent = 'Iniciando...\n';

        if (type === 'file') {
            window.pywebview.api.compressor_video_file(path, mode, gpu);
        } else {
            window.pywebview.api.compressor_video(path, mode, gpu);
        }
    } catch(e) {
        showMessage('compressor-video', 'Erro: ' + e, 'error');
    }
}

// =========================
// Video Converter
// =========================

function runVideoConverter() {
    const format = document.querySelector('input[name="video-format"]:checked').value;
    const path = selectedPaths['video-converter'];
    const type = selectedTypes['video-converter'];

    if (!path) {
        showMessage('video-converter', 'Selecione uma pasta ou arquivo primeiro!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-video-converter').style.display = 'flex';
    document.getElementById('progress-fill-video-converter').style.width = '0%';
    document.getElementById('progress-text-video-converter').textContent = '0%';
    document.getElementById('log-video-converter').textContent = '';

    if (type === 'file') {
        window.pywebview.api.video_converter_file(path, format);
    } else {
        window.pywebview.api.video_converter(path, format);
    }
}

function updateVideoConverterProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-video-converter').style.width = data.percent + '%';
        document.getElementById('progress-text-video-converter').textContent = data.percent + '%';
    }
    if (data.log) {
        document.getElementById('log-video-converter').textContent += data.log + '\n';
    }
    if (data.complete) {
        playConcluido();
        showMessage('video-converter', 'Conversão concluída!', 'success');
    }
}

// =========================
// Video Downloader
// =========================

function getVideoInfo() {
    const url = document.getElementById('video-url').value;
    if (!url) {
        showMessage('video-downloader', 'Digite uma URL primeiro!', 'error');
        return;
    }
    
    playExecute();
    showMessage('video-downloader', 'Verificando vídeo...', 'info');
    
    window.pywebview.api.video_downloader_info(url).then(result => {
        if (result.success) {
            const thumbEl = document.getElementById('video-thumbnail');
            document.getElementById('video-info').style.display = 'flex';
            document.getElementById('video-title').textContent = result.info.title || 'Sem título';
            
            // Preferir thumbnail local, senão usar URL
            const localThumb = result.info.thumbnail || '';
            const remoteThumb = result.info.thumbnail_url || '';
            
            thumbEl.style.display = 'block';
            thumbEl.src = localThumb;
            
            // Se falhar o local (bloqueio de browser), tenta a URL original
            thumbEl.onerror = function() {
                if (this.src !== remoteThumb && remoteThumb) {
                    this.src = remoteThumb;
                } else {
                    this.style.display = 'none';
                }
            };
            
            document.getElementById('video-provider').textContent = 'Provider: ' + (result.info.provider || 'Desconhecido');
            
            // Format duration
            const duration = result.info.duration || 0;
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            document.getElementById('video-duration').textContent = `Duração: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const sizeText = result.info.filesize_mb > 0 ? `Tamanho: ~${result.info.filesize_mb} MB` : 'Tamanho não disponível';
            document.getElementById('video-size').textContent = sizeText;
            
            showMessage('video-downloader', 'Vídeo encontrado!', 'success');
        } else {
            showMessage('video-downloader', result.error || 'Erro ao obter info', 'error');
            document.getElementById('video-info').style.display = 'none';
        }
    }).catch(err => {
        showMessage('video-downloader', 'Erro: ' + err, 'error');
        document.getElementById('video-info').style.display = 'none';
    });
}

function runVideoDownloader() {
    const url = document.getElementById('video-url').value.trim();
    const destino = selectedPaths['video-downloader'] || '';
    const formato = document.querySelector('input[name="vd-format"]:checked').value;

    if (!url) {
        showMessage('video-downloader', 'Digite uma URL primeiro!', 'error');
        return;
    }
    if (!destino) {
        showMessage('video-downloader', 'Selecione a pasta de destino antes de baixar!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-video-downloader').style.display = 'flex';
    document.getElementById('progress-fill-video-downloader').style.width = '0%';
    document.getElementById('progress-text-video-downloader').textContent = '0%';
    document.getElementById('log-video-downloader').textContent = '';

    window.pywebview.api.video_downloader(url, destino, formato);
}

function updateVideoDownloaderProgress(data) {
    if (data.percent !== undefined) {
        const pct = Math.min(100, Math.max(0, data.percent));
        document.getElementById('progress-fill-video-downloader').style.width = pct + '%';
        document.getElementById('progress-text-video-downloader').textContent = Math.round(pct) + '%';
    }
    if (data.log) {
        const logEl = document.getElementById('log-video-downloader');
        logEl.textContent += data.log + '\n';
        logEl.scrollTop = logEl.scrollHeight;
    }
    if (data.complete) {
        if (data.error) {
            showMessage('video-downloader', 'Erro no download. Veja o log.', 'error');
        } else {
            playConcluido();
            showMessage('video-downloader', 'Download concluído!', 'success');
        }
    }
}

// =========================
// Web Scraper
// =========================

function selectScraperDestino() {
    window.pywebview.api.select_folder('scraper').then(result => {
        if (result.success) {
            document.getElementById('scraper-destino').value = result.path;
        }
    });
}

function runWebScraperAnalyze() {
    const url = document.getElementById('scraper-url').value;

    if (!url) {
        showMessage('web-scraper', 'Digite uma URL primeiro!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-web-scraper').style.display = 'flex';
    document.getElementById('progress-fill-web-scraper').style.width = '0%';
    document.getElementById('log-web-scraper').textContent = '';
    document.getElementById('progress-text-web-scraper').textContent = 'Analisando...';
    scraperLogBuffer = [];

    window.pywebview.api.web_scraper_analyze(url).then(result => {
        if (!result || !result.success) {
            showMessage('web-scraper', (result && result.error) || 'Falha ao analisar a página', 'error');
            return;
        }

        scraperLastAnalyzedUrl = url;
        document.getElementById('scraper-result-box').style.display = 'block';
        document.getElementById('scraper-count-images').textContent = `Imagens: ${result.qtd_imagens || 0}`;
        document.getElementById('scraper-count-videos').textContent = `Vídeos: ${result.qtd_videos || 0}`;
        document.getElementById('progress-fill-web-scraper').style.width = '100%';
        document.getElementById('progress-text-web-scraper').textContent = 'Análise concluída';
        playConcluido();
        showMessage('web-scraper', 'Análise concluída! Agora escolha o que deseja baixar.', 'success');
    }).catch(err => {
        showMessage('web-scraper', 'Erro ao analisar: ' + err, 'error');
    });
}

function runWebScraperDownload() {
    const url = document.getElementById('scraper-url').value;
    const destino = document.getElementById('scraper-destino').value || '';
    const mode = document.querySelector('input[name="scraper-download-mode"]:checked').value;

    if (!url) {
        showMessage('web-scraper', 'Digite uma URL primeiro!', 'error');
        return;
    }
    if (!destino) {
        showMessage('web-scraper', 'Selecione uma pasta de destino para o download.', 'error');
        return;
    }
    
    if (!scraperLastAnalyzedUrl || scraperLastAnalyzedUrl !== url) {
        showMessage('web-scraper', 'Analise a URL antes de baixar.', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-web-scraper').style.display = 'flex';
    document.getElementById('progress-fill-web-scraper').style.width = '0%';
    document.getElementById('progress-text-web-scraper').textContent = 'Baixando...';
    document.getElementById('log-web-scraper').textContent = '';
    scraperLogBuffer = [];

    window.pywebview.api.web_scraper_download(url, mode, destino);
}

function updateWebScraperProgress(data) {
    const progressText = document.getElementById('progress-text-web-scraper');
    const progressFill = document.getElementById('progress-fill-web-scraper');
    let currentPct = null;

    if (data.percent !== undefined) {
        currentPct = Math.max(0, Math.min(100, Number(data.percent) || 0));
        progressFill.style.width = currentPct + '%';
        progressText.textContent = Math.round(currentPct) + '%';
    }
    if (data.status) {
        if (currentPct !== null) {
            progressText.textContent = `${Math.round(currentPct)}% • ${data.status}`;
        } else {
            progressText.textContent = data.status;
        }
    }
    if (data.log) {
        const msg = String(data.log || '').trim();
        if (msg) {
            const isStatusLike =
                msg.startsWith('Baixando vídeo ') ||
                msg.startsWith('Extraindo ZIP') ||
                msg.startsWith('Organizando imagens') ||
                msg.startsWith('Analisando') ||
                msg.startsWith('Baixando imagens');

            if (isStatusLike) {
                document.getElementById('progress-text-web-scraper').textContent = msg;
            } else {
                const last = scraperLogBuffer[scraperLogBuffer.length - 1];
                if (last !== msg) {
                    scraperLogBuffer.push(msg);
                    if (scraperLogBuffer.length > 6) {
                        scraperLogBuffer = scraperLogBuffer.slice(-6);
                    }
                }
                document.getElementById('log-web-scraper').textContent = scraperLogBuffer.join('\n');
            }
        }
    }
    if (data.complete) {
        playConcluido();
        showMessage('web-scraper', 'Download concluído!', 'success');
    }
}

// =========================
// Transcrever Áudio
// =========================

function runTranscreverAudio() {
    const path = selectedPaths['transcrever-audio'];
    const type = selectedTypes['transcrever-audio'];
    const model = document.querySelector('input[name="whisper-model"]:checked').value;
    const language = document.getElementById('whisper-language').value;

    if (!path) {
        showMessage('transcrever-audio', 'Selecione uma pasta ou arquivo primeiro!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-transcrever-audio').style.display = 'flex';
    document.getElementById('progress-fill-transcrever-audio').style.width = '0%';
    document.getElementById('log-transcrever-audio').textContent = '';

    if (type === 'file') {
        window.pywebview.api.transcrever_audio_file(path, model, language);
    } else {
        window.pywebview.api.transcrever_audio(path, model, language);
    }
}

let _transcricaoPastaOrigem = '';

function updateTranscreverAudioProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-transcrever-audio').style.width = data.percent + '%';
        document.getElementById('progress-text-transcrever-audio').textContent = data.percent + '%';
    }
    if (data.log) {
        document.getElementById('log-transcrever-audio').textContent += data.log + '\n';
    }
    if (data.complete) {
        playConcluido();
        if (data.texto && data.texto.trim()) {
            _transcricaoPastaOrigem = data.pasta_origem || '';
            abrirModalTranscricao(data.texto);
        } else {
            showMessage('transcrever-audio', 'Transcrição concluída!', 'success');
        }
    }
}

function abrirModalTranscricao(texto) {
    document.getElementById('transcricao-modal-texto').value = texto;
    document.getElementById('modal-transcricao').style.display = 'flex';
}

function fecharModalTranscricao(event) {
    if (event && event.target !== document.getElementById('modal-transcricao')) return;
    document.getElementById('modal-transcricao').style.display = 'none';
}

function copiarTranscricao() {
    const texto = document.getElementById('transcricao-modal-texto').value;
    navigator.clipboard.writeText(texto).then(() => {
        const btn = document.querySelector('.transcricao-modal-footer .btn-secondary');
        const orig = btn.textContent;
        btn.textContent = '✅ Copiado!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
    });
}

function salvarTranscricaoTxt() {
    const texto = document.getElementById('transcricao-modal-texto').value;
    window.pywebview.api.transcrever_salvar_txt(texto, _transcricaoPastaOrigem);
}

// =========================
// Remover Fundo
// =========================

function runRemoverFundo() {
    const path = selectedPaths['remover-fundo'];
    const type = selectedTypes['remover-fundo'];

    if (!path) {
        showMessage('remover-fundo', 'Selecione uma pasta ou arquivo primeiro!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-remover-fundo').style.display = 'flex';
    document.getElementById('progress-fill-remover-fundo').style.width = '0%';
    document.getElementById('log-remover-fundo').textContent = '';

    if (type === 'file') {
        window.pywebview.api.remover_fundo_file(path);
    } else {
        window.pywebview.api.remover_fundo(path);
    }
}

function updateRemoverFundoProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-remover-fundo').style.width = data.percent + '%';
        document.getElementById('progress-text-remover-fundo').textContent = data.percent + '%';
    }
    if (data.log) {
        document.getElementById('log-remover-fundo').textContent += data.log + '\n';
    }
    if (data.complete) {
        if (data.resultados && data.resultados.length > 0) {
            abrirModalRF(data.resultados);
        } else {
            playConcluido();
            showMessage('remover-fundo', 'Processamento concluído!', 'success');
        }
    }
}

// =========================
// Modal Remover Fundo
// =========================
let _rfResultados = [];
let _rfIndexAtual = 0;

function abrirModalRF(resultados) {
    _rfResultados = resultados;
    _rfIndexAtual = 0;

    const strip = document.getElementById('rf-thumbs-strip');
    strip.innerHTML = '';
    if (resultados.length > 1) {
        resultados.forEach((r, i) => {
            const img = document.createElement('img');
            img.src = r.resultado_b64;
            img.className = 'rf-thumb' + (i === 0 ? ' active' : '');
            img.title = r.nome;
            img.onclick = () => _rfMostrarItem(i);
            strip.appendChild(img);
        });
        document.getElementById('rf-btn-salvar-todas').style.display = 'inline-flex';
    } else {
        document.getElementById('rf-btn-salvar-todas').style.display = 'none';
    }

    _rfMostrarItem(0);
    document.getElementById('modal-remover-fundo').style.display = 'flex';
}

function _rfMostrarItem(i) {
    _rfIndexAtual = i;
    const r = _rfResultados[i];
    document.getElementById('rf-img-original').src = r.original_b64;
    document.getElementById('rf-img-resultado').src = r.resultado_b64;
    document.getElementById('rf-counter').textContent =
        _rfResultados.length > 1 ? `${i + 1} / ${_rfResultados.length}  —  ${r.nome}` : r.nome;
    document.querySelectorAll('.rf-thumb').forEach((t, idx) => {
        t.classList.toggle('active', idx === i);
    });
}

function fecharModalRF(event) {
    if (event && event.target !== document.getElementById('modal-remover-fundo')) return;
    document.getElementById('modal-remover-fundo').style.display = 'none';
}

async function copiarRFAtual() {
    const r = _rfResultados[_rfIndexAtual];
    const b64 = r.resultado_b64.split(',')[1];
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        const btn = document.getElementById('rf-btn-copiar');
        const orig = btn.textContent;
        btn.textContent = '✅ Copiado!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
    } catch (e) {
        console.error('Erro ao copiar imagem:', e);
    }
}

async function salvarRFAtual() {
    const result = await window.pywebview.api.select_folder('remover-fundo-save');
    if (!result || !result.success) return;
    window.pywebview.api.remover_fundo_salvar([_rfIndexAtual], result.path);
}

async function salvarRFTodas() {
    const result = await window.pywebview.api.select_folder('remover-fundo-save');
    if (!result || !result.success) return;
    const indices = _rfResultados.map((_, i) => i);
    window.pywebview.api.remover_fundo_salvar(indices, result.path);
}

// =========================
// Organizador de Imagens
// =========================

function runOrganizadorImagens() {
    const folderPath = selectedPaths['organizador-imagens'];
    const modo = document.querySelector('input[name="organizador-imagens-modo"]:checked')?.value || 'completa';

    if (!folderPath) {
        showMessage('organizador-imagens', 'Selecione uma pasta primeiro!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-organizador-imagens').style.display = 'flex';
    document.getElementById('progress-fill-organizador-imagens').style.width = '0%';
    document.getElementById('log-organizador-imagens').textContent = '';

    window.pywebview.api.organizador_imagens(folderPath, modo);
}

function updateOrganizadorImagensProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-organizador-imagens').style.width = data.percent + '%';
        document.getElementById('progress-text-organizador-imagens').textContent = data.percent + '%';
    }
    if (data.log) {
        document.getElementById('log-organizador-imagens').textContent += data.log + '\n';
    }
    if (data.complete) {
        playConcluido();
        showMessage('organizador-imagens', 'Organização concluída!', 'success');
    }
}

// =========================
// Organizador de Vídeos
// =========================

let _pastaOrganizadorVideos = null;

function _resetOrganizadorVideosProgress() {
    document.getElementById('progress-organizador-videos').style.display = 'flex';
    document.getElementById('progress-fill-organizador-videos').style.width = '0%';
    document.getElementById('progress-text-organizador-videos').textContent = '0%';
    document.getElementById('organizador-videos-fase').textContent = '—';
    document.getElementById('log-organizador-videos').textContent = '';
}

function runOrganizadorVideosScan() {
    const folderPath = selectedPaths['organizador-videos'];
    if (!folderPath) {
        showMessage('organizador-videos', 'Selecione uma pasta primeiro!', 'error');
        return;
    }
    _pastaOrganizadorVideos = folderPath;
    playExecute();
    _resetOrganizadorVideosProgress();
    window.pywebview.api.escanear_cameras_videos(folderPath);
}

function showCameraPopup(cameras) {
    const lista = document.getElementById('cameras-list');
    lista.innerHTML = '';

    if (!cameras || cameras.length === 0) {
        showMessage('organizador-videos', 'Nenhuma câmera identificada na pasta.', 'error');
        return;
    }

    cameras.forEach(cam => {
        const row = document.createElement('div');
        row.className = 'camera-row';
        row.innerHTML = `
            <div class="camera-info">
                <span class="camera-ordem">${String(cam.ordem).padStart(2,'0')}</span>
                <span class="camera-nome">${cam.pai}</span>
                <span class="camera-stats">${cam.videos}v ${cam.fotos}f ${cam.audios}a</span>
                <span class="camera-data">📅 ${cam.data_mais_antiga}</span>
            </div>
            <input type="text" class="camera-operador" placeholder="Operador (opcional)"
                   data-pai="${cam.pai}">
        `;
        lista.appendChild(row);
    });

    document.getElementById('modal-cameras').style.display = 'flex';
}

function fecharModalCameras() {
    document.getElementById('modal-cameras').style.display = 'none';
}

function confirmarOrganizacaoVideos() {
    fecharModalCameras();

    const nomeProjeto = document.getElementById('input-nome-projeto').value.trim();

    const operadores = {};
    document.querySelectorAll('.camera-operador').forEach(input => {
        const nome = input.value.trim();
        if (nome) operadores[input.dataset.pai] = nome;
    });

    playExecute();
    _resetOrganizadorVideosProgress();
    window.pywebview.api.organizador_videos(_pastaOrganizadorVideos, operadores, nomeProjeto || null);
}

function updateOrganizadorVideosProgress(data) {
    if (data.percent !== undefined) {
        document.getElementById('progress-fill-organizador-videos').style.width = data.percent + '%';
        document.getElementById('progress-text-organizador-videos').textContent = data.percent + '%';
    }
    if (data.status) {
        document.getElementById('organizador-videos-fase').textContent = data.status;
    }
    if (data.log) {
        document.getElementById('log-organizador-videos').textContent = data.log;
    }
    if (data.complete) {
        playConcluido();
        showMessage('organizador-videos', 'Organização concluída!', 'success');
    }
}

// =========================
// GDrive
// =========================

function checkCerebroStatus() {
    window.pywebview.api.cerebro_exists().then(result => {
        const statusEl = document.getElementById('cerebro-status');
        const btnGen = document.getElementById('btn-generate-csv');
        if (!statusEl || !btnGen) return;

        if (result.exists) {
            statusEl.textContent = '✅ Cérebro carregado: ' + result.path;
            statusEl.style.color = '#10B981';
            btnGen.disabled = false;
        } else {
            statusEl.textContent = 'Nenhum .md carregado';
            statusEl.style.color = '#888888';
            btnGen.disabled = true;
        }
    });
}

// Carrega estado do cérebro ao inicializar (aguarda pywebview estar pronto)
if (window.pywebview) {
    checkCerebroStatus();
} else {
    window.addEventListener('pywebviewready', checkCerebroStatus);
}

function loadCerebro() {
    window.pywebview.api.cerebro_select_file().then(result => {
        if (result.success) {
            checkCerebroStatus();
            showMessage('web-scraper', 'Cérebro carregado!', 'success');
        } else {
            showMessage('web-scraper', result.error || 'Erro ao carregar', 'error');
        }
    });
}

function removeCerebro() {
    window.pywebview.api.cerebro_remove().then(result => {
        checkCerebroStatus();
        showMessage('web-scraper', 'Cérebro removido', 'success');
    });
}

function generateCSV() {
    const url = document.getElementById('scraper-url').value;
    if (!url) {
        showMessage('web-scraper', 'Digite uma URL primeiro!', 'error');
        return;
    }
    
    playExecute();
    document.getElementById('progress-web-scraper').style.display = 'flex';
    document.getElementById('log-web-scraper').textContent = '';

    window.pywebview.api.web_scraper_csv(url);
}

// =========================
// Google Drive
// =========================

let gdriveAnalyzed = false;
let gdriveTotalBytes = 0;

function checkGdriveConfig() {
    window.pywebview.api.gdrive_check().then(result => {
        const statusDiv = document.getElementById('gdrive-status');
        if (result.success) {
            statusDiv.innerHTML = result.configured 
                ? '<span style="color: #10B981;">✅ Configurado</span>' 
                : '<span style="color: #EF4444;">❌ Não configurado. Execute "rclone config" no terminal.</span>';
        } else {
            statusDiv.innerHTML = '<span style="color: #EF4444;">❌ Erro: ' + result.error + '</span>';
        }
    });
}

function _gdriveStatus(html) {
    const el = document.getElementById('gdrive-status');
    if (el) el.innerHTML = html;
}

function _escHtml(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function analyzeGdrive() {
    const url = document.getElementById('gdrive-url').value.trim();
    if (!url) {
        _gdriveStatus('<span style="color:#EF4444;">❌ Digite uma URL primeiro!</span>');
        return;
    }

    playExecute();
    document.getElementById('gdrive-analyze-info').style.display = 'none';
    document.getElementById('btn-gdrive-baixar').disabled = true;
    _gdriveStatus('<span style="color:#9ca3af;">🔍 Verificando...</span>');

    window.pywebview.api.gdrive_analyze(url);
}

function updateGdriveAnalyze(data) {
    if (data.log) {
        _gdriveStatus('<span style="color:#9ca3af;">🔍 ' + _escHtml(data.log) + '</span>');
    }
    if (data.error) {
        _gdriveStatus('<span style="color:#EF4444;">❌ ' + _escHtml(data.error) + '</span>');
        if (data.allowDownload) document.getElementById('btn-gdrive-baixar').disabled = false;
    }
    if (data.complete) {
        document.getElementById('gdrive-pasta-nome').textContent = data.folderName;
        document.getElementById('gdrive-tamanho').textContent = data.totalSize;
        document.getElementById('gdrive-arquivos').textContent = data.totalFiles;
        document.getElementById('gdrive-analyze-info').style.display = 'block';
        document.getElementById('btn-gdrive-baixar').disabled = false;
        _gdriveStatus('<span style="color:#10B981;">✅ Pronto para baixar</span>');
        playConcluido();
    }
}

function selectGdriveDestino() {
    window.pywebview.api.select_folder('gdrive').then(result => {
        if (result.success) {
            document.getElementById('gdrive-destino').value = result.path;
        }
    });
}

function runGdriveDump() {
    const url = document.getElementById('gdrive-url').value;
    const destino = document.getElementById('gdrive-destino').value;

    if (!url) {
        document.getElementById('gdrive-msg').textContent = '❌ Digite uma URL primeiro!';
        document.getElementById('progress-gdrive').style.display = 'flex';
        return;
    }
    if (!destino) {
        document.getElementById('gdrive-msg').textContent = '❌ Selecione a pasta de destino!';
        document.getElementById('progress-gdrive').style.display = 'flex';
        return;
    }
    
    playExecute();

    console.log('[GDrive] Starting dump - url:', url, 'destino:', destino);

    // Esconde botões verificar/baixar — não precisamos mais deles durante o download
    document.getElementById('gdrive-action-buttons').style.display = 'none';

    // Mostra seção de progresso
    document.getElementById('progress-gdrive').style.display = 'flex';

    // Chama API e trata retorno
    const perfil = (document.getElementById('gdrive-perfil') || {}).value || 'rapida';
    window.pywebview.api.gdrive_dump(url, destino, perfil).then(result => {
        console.log('[GDrive] gdrive_dump returned:', result);
        if (!result || !result.success) {
            document.getElementById('gdrive-msg').textContent = '❌ Erro ao iniciar: ' + (result?.error || 'desconhecido');
        }
    }).catch(err => {
        console.error('[GDrive] Erro na chamada:', err);
        document.getElementById('gdrive-msg').textContent = '❌ Erro: ' + err;
    });
    document.getElementById('progress-fill-gdrive').style.width = '0%';
    document.getElementById('gdrive-arquivo-atual').textContent = '-';
    document.getElementById('gdrive-msg').textContent = 'Iniciando download...';

    // Reseta estado de pausa
    _gdrivePaused = false;
    document.getElementById('gdrive-stat-extra').textContent = '';
    document.getElementById('gdrive-transferring').innerHTML = '';
    _gdriveStatus('');
    const pauseBtn = document.getElementById('btn-gdrive-pause');
    if (pauseBtn) { pauseBtn.textContent = '⏸ Pausar'; pauseBtn.style.background = '#D97706'; }

    // Reseta painel de stats
    document.getElementById('gdrive-stats-panel').style.display = 'none';
    document.getElementById('gdrive-stat-transferido').textContent = '—';
    document.getElementById('gdrive-stat-velocidade').textContent = '—';
    document.getElementById('gdrive-stat-eta').textContent = '—';
    document.getElementById('gdrive-stat-arquivos').textContent = '—';
}

let _gdrivePaused = false;

function toggleGdrivePause() {
    const btn = document.getElementById('btn-gdrive-pause');
    _gdrivePaused = !_gdrivePaused;
    if (_gdrivePaused) {
        window.pywebview.api.gdrive_pause();
        btn.textContent = '▶ Retomar';
        btn.style.background = '#059669';
    } else {
        window.pywebview.api.gdrive_resume();
        btn.textContent = '⏸ Pausar';
        btn.style.background = '#D97706';
    }
}

function cancelGdriveDump() {
    const btn = document.getElementById('btn-gdrive-cancel');
    if (btn) { btn.disabled = true; btn.textContent = 'Cancelando...'; }
    // A UI é finalizada quando o backend emitir complete=true
    window.pywebview.api.gdrive_cancel().catch(() => {
        if (btn) { btn.disabled = false; btn.textContent = '✖ Cancelar Download'; }
    });
}

function updateGdriveProgress(data) {
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { console.error("JSON parse error", e); return; }
    }
    const el = id => document.getElementById(id);

    if (data.log) el('gdrive-msg').textContent = data.log;

    if (data.percent !== undefined && data.percent !== -1) {
        el('progress-fill-gdrive').style.width = data.percent + '%';
        el('progress-text-gdrive').textContent = data.percent + '%';
    }

    if (data.currentFile) el('gdrive-arquivo-atual').textContent = 'Baixando: ' + data.currentFile;

    if (data.done) {
        el('gdrive-stats-panel').style.display = 'block';
        el('gdrive-stat-transferido').textContent = data.done + ' / ' + data.total;
        el('gdrive-stat-velocidade').textContent = data.speed;
        el('gdrive-stat-eta').textContent = data.eta;
        const extras = [];
        if (data.elapsed) extras.push('⏲ Decorrido: ' + data.elapsed);
        if (data.checks > 0) extras.push('✔ Já existentes/verificados: ' + data.checks);
        if (data.errors > 0) extras.push('⚠ Erros (serão re-tentados): ' + data.errors);
        el('gdrive-stat-extra').textContent = extras.join('   •   ');
    }
    if (Array.isArray(data.transferring)) {
        el('gdrive-transferring').innerHTML = data.transferring.map(f =>
            '<div style="display:flex; align-items:center; gap:8px; margin-top:4px; font-size:12px;">' +
                '<span style="flex:1; min-width:0; color:#d1d5db; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + _escHtml(f.name) + '">' + _escHtml(f.name) + '</span>' +
                '<span style="width:90px; height:6px; background:#30363d; border-radius:3px; overflow:hidden;"><span style="display:block; height:100%; width:' + (f.pct | 0) + '%; background:#38BDF8;"></span></span>' +
                '<span style="width:140px; text-align:right; color:#9ca3af;">' + (f.pct | 0) + '% de ' + _escHtml(f.size) + '</span>' +
            '</div>').join('');
    }
    if (data.message) {
        el('gdrive-msg').textContent = data.message;
        if (data.eta) el('gdrive-stat-eta').textContent = data.eta;
    }
    if (data.filesTotal > 0) {
        const pending = data.filesTotal - data.filesDone;
        el('gdrive-stat-arquivos').textContent =
            data.filesDone + ' baixados / ' + data.filesTotal + ' (' + pending + ' restantes)';
    }

    if (data.complete) {
        el('progress-gdrive').style.display = 'none';
        el('gdrive-action-buttons').style.display = 'flex';
        el('btn-gdrive-baixar').disabled = false;
        el('gdrive-transferring').innerHTML = '';
        const cancelBtn = el('btn-gdrive-cancel');
        if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.textContent = '✖ Cancelar Download'; }
        // Mantém a última mensagem visível fora da seção de progresso
        const final = data.log || el('gdrive-msg').textContent;
        _gdriveStatus('<span style="color:' + (data.success ? '#10B981' : '#EF4444') + ';">' + _escHtml(final) + '</span>');
        if (data.success) playConcluido();
    }
}

// Função para copiar log
function copyLog(tool) {
    const logEl = document.getElementById(`log-${tool}`);
    if (logEl) {
        navigator.clipboard.writeText(logEl.textContent).then(() => {
            showMessage(tool, 'Log copiado para a área de transferência!', 'success');
        });
    }
}

// =========================
// Utilitários
// =========================

function showMessage(tool, message, type) {
    const logId = `log-${tool}`;
    const logEl = document.getElementById(logId);
    if (logEl) {
        const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        logEl.textContent += `${prefix} ${message}\n`;
        logEl.scrollTop = logEl.scrollHeight;
    }
}

// Função para abrir pasta no Explorer
function openFolder(path) {
    window.pywebview.api.open_folder(path);
}

// =========================
// Inicialização
// =========================

console.log('Canivete do Pailer - Frontend carregado');

// Expor todas as funções para o Python chamar
window.updateConverterAudioProgress = updateConverterAudioProgress;
window.updateAudioCutterProgress = updateAudioCutterProgress;
window.updateConverterImagemProgress = updateConverterImagemProgress;
window.updateFaviconProgress = updateFaviconProgress;
window.updateCompressorImagemProgress = updateCompressorImagemProgress;
window.updateCompressorVideoProgress = updateCompressorVideoProgress;
window.updateVideoConverterProgress = updateVideoConverterProgress;
window.updateVideoDownloaderProgress = updateVideoDownloaderProgress;
window.updateWebScraperProgress = updateWebScraperProgress;
window.updateTranscreverAudioProgress = updateTranscreverAudioProgress;
window.updateRemoverFundoProgress = updateRemoverFundoProgress;
window.updateOrganizadorImagensProgress = updateOrganizadorImagensProgress;
window.updateOrganizadorVideosProgress = updateOrganizadorVideosProgress;
window.showCameraPopup = showCameraPopup;
window.updateGdriveProgress = updateGdriveProgress;
window.updateCompressorVideoProgress = updateCompressorVideoProgress;
window.updateGdriveAnalyze = updateGdriveAnalyze;
window.switchTool = switchTool;
window.playExecute = playExecute;
window.playClick = playClick;
window.playConcluido = playConcluido;
window.selectAudioCutterFile = selectAudioCutterFile;
window.addAudioLayer = addAudioLayer;
window.selectAudioLayer = selectAudioLayer;
window.setAudioLayerVolume = setAudioLayerVolume;
window.toggleAudioLayerLock = toggleAudioLayerLock;
window.removeAudioLayer = removeAudioLayer;
window.setAudioTimelineTool = setAudioTimelineTool;
window.toggleAudioEditsPopover = toggleAudioEditsPopover;
window.openAudioExportPopup = openAudioExportPopup;
window.closeAudioExportPopup = closeAudioExportPopup;
window.toggleAudioTimelinePlayback = toggleAudioTimelinePlayback;
window.bladeAudioAtPlayhead = bladeAudioAtPlayhead;
window.rippleDeleteAudioLeft = rippleDeleteAudioLeft;
window.rippleDeleteAudioRight = rippleDeleteAudioRight;
window.undoAudioEdit = undoAudioEdit;
window.clearAudioCuts = clearAudioCuts;
window.exportAudioCuts = exportAudioCuts;

// =========================
// Atualização automática (GitHub Releases)
// =========================

function _showUpdateBanner(info) {
    if (document.getElementById('app-update-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'app-update-banner';
    bar.style.cssText = 'position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:9999; ' +
        'background:#111827; border:1px solid #10B981; color:#e5e7eb; border-radius:10px; padding:12px 16px; ' +
        'display:flex; align-items:center; gap:12px; box-shadow:0 8px 24px rgba(0,0,0,.45); font-size:14px; max-width:calc(100% - 32px);';
    bar.innerHTML =
        '<span>🚀 Nova versão <b>' + _escHtml(info.latest) + '</b> disponível (você tem ' + _escHtml(info.current) + ')</span>' +
        '<span id="app-update-status" style="color:#9ca3af; font-size:12px;"></span>' +
        '<button id="app-update-btn" style="background:#10B981; color:#fff; border:none; border-radius:6px; padding:6px 14px; font-weight:600; cursor:pointer;">Atualizar agora</button>' +
        '<button id="app-update-close" title="Depois" style="background:none; border:none; color:#9ca3af; font-size:18px; cursor:pointer;">✕</button>';
    document.body.appendChild(bar);
    document.getElementById('app-update-close').onclick = () => bar.remove();
    document.getElementById('app-update-btn').onclick = () => {
        if (!info.frozen) {
            document.getElementById('app-update-status').textContent = 'Rodando pelo código-fonte: use git pull.';
            return;
        }
        const btn = document.getElementById('app-update-btn');
        btn.disabled = true;
        btn.textContent = 'Atualizando...';
        window.pywebview.api.apply_update();
    };
}

function updateAppUpdateProgress(data) {
    const st = document.getElementById('app-update-status');
    if (st && data.message) st.textContent = data.message + (data.percent >= 0 && !data.done ? ' (' + data.percent + '%)' : '');
    if (data.done && !data.success) {
        const btn = document.getElementById('app-update-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Tentar de novo'; }
    }
}
window.updateAppUpdateProgress = updateAppUpdateProgress;

window.addEventListener('pywebviewready', () => {
    setTimeout(() => {
        window.pywebview.api.check_update().then(info => {
            if (info && info.available) _showUpdateBanner(info);
        }).catch(() => {});
    }, 4000);
});
