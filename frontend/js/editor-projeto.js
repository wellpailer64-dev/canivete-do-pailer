// =========================================================
// Pocket Editor — painel Projeto (como o Project do Premiere): os materiais do projeto
// Tudo o que o projeto usa ou vai usar: o vídeo, imagens, áudios, camadas de ajuste, legendas (.srt) e outros
// vídeos, organizados em pastas (bins). Recebe arquivos e pastas arrastados do Windows (ou Importar); dá para
// criar pastas, arrastar itens para dentro delas, recortar/copiar/colar, duplicar, renomear, dar cor e apagar.
// Arrastar um item para a timeline (ou para o monitor) coloca ele na sequência.
// Dados: VE.media[id] ganha pasta (id da pasta), cor e nome (renomeado); VE.bins = [{id, nome, pai, cor, aberta}].
// O id da mídia é o índice em VE.media: apagar do projeto marca removido (não reordena).
// =========================================================

// pasta = pasta aberta no modo grade (o modo e o tamanho do card ficam em PREFS: pjModo, pjTam)
const VEPJ = { sel: new Set(), foco: null, busca: '', clip: null, ordem: { col: 'nome', dir: 1 }, conf: 0, nBin: 0, pasta: null };
const vePjEmGrade = () => PREFS.pjModo === 'grade';
const vePjTam = () => Math.max(90, Math.min(260, +PREFS.pjTam || 132));

const VE_PJ_TIPOS = {
    video: ['i-film', 'Vídeo'], image: ['i-image', 'Imagem'], audio: ['i-music', 'Áudio'],
    ajuste: ['i-sliders', 'Camada de ajuste'], legenda: ['i-captions', 'Legendas'], timeline: ['i-film', 'Timeline'],
    cor: ['i-drop', 'Cor sólida'], comp: ['i-layers', 'Comp'],
};
// tipo mostrado no painel (a Comp é uma mídia de vídeo por baixo: editor-comp.js)
const vePjTipo = m => VE_PJ_TIPOS[m.comp ? 'comp' : m.kind];
const VE_EXT_LEG = /\.(srt|vtt|ass|ssa|sbv|txt)$/i;   // legendas (Functions/legendas_formatos.py)

const vePjMidia = () => VE.media.filter(m => m && !m.removido && !m.base && m.rvDe == null && VE_PJ_TIPOS[m.kind]);
const vePjNome = m => m.nome || m.name || vePjTipo(m)[1];
const vePjBin = id => (VE.bins || []).find(b => b.id === id);
function vePjUso(m) {
    if (m.kind === 'timeline') return m.sequenceId === VE.activeSequence ? 'ativa' : '';
    if (typeof veSeqSalvarAtiva === 'function') veSeqSalvarAtiva();
    const seqs = VE.sequences && VE.sequences.length ? VE.sequences : [{ clips: VE.clips }];
    return seqs.reduce((n, s) => n + (s.clips || []).filter(c => (c.m || 0) === m.id).length, 0);
}
// pasta do item (a de uma pasta que não existe mais = raiz)
const vePjPastaDe = m => (m.pasta && vePjBin(m.pasta) ? m.pasta : null);
function vePjNovoBin(nome, pai = null) {
    VE.bins = VE.bins || [];
    const b = { id: 'p' + Date.now().toString(36) + (VEPJ.nBin++), nome, pai, aberta: true };
    VE.bins.push(b);
    return b;
}
function vePjDescendentes(id) {
    const out = new Set([id]);
    let mudou = true;
    while (mudou) { mudou = false; (VE.bins || []).forEach(b => { if (b.pai && out.has(b.pai) && !out.has(b.id)) { out.add(b.id); mudou = true; } }); }
    return out;
}
function vePjAlterou() { if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); } vePjRender(); }

// Duração e informações de cada item (colunas)
function vePjInfo(m) {
    if (m.kind === 'timeline') {
        const seq = (VE.sequences || []).find(s => s.id === m.sequenceId);
        const dur = m.sequenceId === VE.activeSequence ? VE.dur : veSeqDur(seq);
        return { dur, info: m.sequenceId === VE.activeSequence ? veT('aberta agora') : `${(seq && (seq.clips || []).length) || 0} clipes` };
    }
    if (veMediaOffline(m)) return { dur: m.dur || (m.info && m.info.duration) || null, info: veT('Mídia offline · relinque ou apague') };
    if (m.comp) {
        const seq = (VE.sequences || []).find(s => s.id === m.sequenceId), r = typeof veCompInfo === 'function' ? veCompInfo(m) : null;
        const n = m.sequenceId === VE.activeSequence ? VE.clips.length : ((seq && seq.clips) || []).length;
        return { dur: m.dur || (m.info && m.info.duration) || null, info: `${n} ${veT(n === 1 ? 'camada' : 'camadas')}${r ? ' · ' + r : m.sequenceId === VE.activeSequence ? ' · ' + veT('aberta agora') : ''}` };
    }
    if (m.kind === 'video') {
        const inf = m.id === 0 ? VE.info : m.info, fps = inf && (m.id === 0 ? VE.fps : inf.fps);
        if (m.erro) return { dur: null, info: veT('erro: ') + m.erro };
        if (!inf) return { dur: null, info: veT('preparando...') };
        const estado = !m.id || m.url ? '' : m.leve ? ` · ${veT('prévia ao usar')}` : ` · ${veT('prévia')} ${m.pct || 0}%`;
        return { dur: m.id === 0 ? VE.srcDur : inf.duration, info: `${inf.width}×${inf.height} · ${String(+(fps || 30).toFixed(2)).replace('.', ',')} qps${estado}` };
    }
    if (m.kind === 'image') return { dur: null, info: m.w ? `${m.w}×${m.h}` : '' };
    if (m.kind === 'cor') return { dur: null, info: `${String(m.fill || '').toUpperCase()} · ${VE.seqW}×${VE.seqH}` };
    if (m.kind === 'audio') return { dur: m.dur || null, info: '48 kHz' };
    if (m.kind === 'legenda') return { dur: m.itens && m.itens.length ? m.itens[m.itens.length - 1].en : null, info: `${(m.itens || []).length} legendas` };
    return { dur: null, info: '' };
}

// ─────────────────────────── lista ───────────────────────────
function vePjFilhos(pai) {
    const bins = (VE.bins || []).filter(b => (b.pai || null) === pai);
    const med = vePjMidia().filter(m => vePjPastaDe(m) === pai);
    const { col, dir } = VEPJ.ordem;
    const chave = m => col === 'tipo' ? vePjTipo(m)[1] : col === 'dur' ? (vePjInfo(m).dur || 0) : vePjNome(m).toLowerCase();
    bins.sort((a, b) => a.nome.localeCompare(b.nome) * (col === 'nome' ? dir : 1));
    med.sort((a, b) => { const x = chave(a), y = chave(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    return { bins, med };
}

function vePjLinhaMidia(m, nivel) {
    const k = 'm:' + m.id, [ic, tipo] = vePjTipo(m), inf = vePjInfo(m), uso = vePjUso(m);
    const cor = m.cor ? veCor({ cor: m.cor }) : null;
    const ativa = m.kind === 'timeline' && m.sequenceId === VE.activeSequence;
    const lost = veMediaOffline(m);
    return `<div class="ve-pj-row${VEPJ.sel.has(k) ? ' sel' : ''}${ativa ? ' atual' : ''}${m.kind === 'video' && m.id && !m.url ? ' fraco' : ''}${lost ? ' lost' : ''}" data-k="${k}" data-kind="${m.kind}" draggable="true" style="--n:${nivel}">
        <span class="ve-pj-cor"${cor ? ` style="background:${cor}"` : ''}></span><span class="ve-pj-seta"></span>
        <svg class="i"><use href="#${ic}"/></svg><span class="ve-pj-nome" title="${veEsc(m.path || vePjNome(m))}">${veEsc(vePjNome(m))}</span>${veMelSelo(m)}
        <span class="ve-pj-c">${veT(tipo)}</span><span class="ve-pj-c mono">${inf.dur ? veTC(inf.dur).slice(0, 11) : ''}</span>
        <span class="ve-pj-c">${veEsc(inf.info)}</span><span class="ve-pj-c mono">${uso || ''}</span></div>`;
}

function vePjLinhaBin(b, nivel) {
    const k = 'b:' + b.id, cor = b.cor ? veCor({ cor: b.cor }) : null;
    const n = vePjMidia().filter(m => vePjDescendentes(b.id).has(m.pasta)).length;
    return `<div class="ve-pj-row bin${VEPJ.sel.has(k) ? ' sel' : ''}" data-k="${k}" draggable="true" style="--n:${nivel}">
        <span class="ve-pj-cor"${cor ? ` style="background:${cor}"` : ''}></span><span class="ve-pj-seta" data-seta>${b.aberta ? '▾' : '▸'}</span>
        <svg class="i"><use href="#i-folder"/></svg><span class="ve-pj-nome">${veEsc(b.nome)}</span>
        <span class="ve-pj-c">${veT('Pasta')}</span><span class="ve-pj-c"></span><span class="ve-pj-c">${n} ${veT(n === 1 ? 'item' : 'itens')}</span><span class="ve-pj-c"></span></div>`;
}

function vePjArvore(pai, nivel) {
    const { bins, med } = vePjFilhos(pai);
    return bins.map(b => vePjLinhaBin(b, nivel) + (b.aberta ? vePjArvore(b.id, nivel + 1) : '')).join('') +
        med.map(m => vePjLinhaMidia(m, nivel)).join('');
}

// ─────────────────────────── grade (cards com prévia, como o modo ícones do Premiere) ───────────────────────────
// capa do card: a imagem, ou a miniatura do vídeo no ponto f (0..1) — passar o mouse percorre o vídeo
function vePjCapa(m, f = 0.35) {
    if (veMediaOffline(m)) return '';
    if (m.kind === 'image') return m.url || '';
    const th = m.kind === 'video' ? (m.id === 0 ? VE.thumbs : m.thumbs) || [] : [];
    return th.length ? th[Math.min(th.length - 1, Math.floor(f * th.length))].url : '';
}

function vePjCardMidia(m) {
    const k = 'm:' + m.id, [ic, tipo] = vePjTipo(m), inf = vePjInfo(m), capa = vePjCapa(m);
    const cor = m.cor ? veCor({ cor: m.cor }) : null;
    const ativa = m.kind === 'timeline' && m.sequenceId === VE.activeSequence;
    const lost = veMediaOffline(m);
    return `<div class="ve-pj-card${VEPJ.sel.has(k) ? ' sel' : ''}${ativa ? ' atual' : ''}${m.kind === 'video' && m.id && !m.url ? ' fraco' : ''}${lost ? ' lost' : ''}" data-k="${k}" data-kind="${m.kind}" draggable="true" title="${veEsc((m.path || vePjNome(m)) + (inf.info ? '\n' + inf.info : ''))}">
        <div class="ve-pj-capa">${m.kind === 'cor' ? `<div class="ve-pj-swatch" style="background:${veEsc(m.fill || '#000')}"></div>` : lost ? `<div class="ve-pj-lost">${veT('MÍDIA OFFLINE')}</div>` : capa ? `<img src="${veEsc(capa)}" alt="" draggable="false">` : `<svg class="i"><use href="#${ic}"/></svg>`}
            ${inf.dur ? `<span class="ve-pj-dur">${veTC(inf.dur).slice(0, 11)}</span>` : ''}</div>
        <div class="ve-pj-rotulo"><span class="ve-pj-cor"${cor ? ` style="background:${cor}"` : ''}></span><svg class="i"><use href="#${ic}"/></svg><span class="ve-pj-nome">${veEsc(vePjNome(m))}</span></div>${veMelSelo(m)}
        <div class="ve-pj-sub">${veT(tipo)}${inf.info ? ' · ' + veEsc(inf.info) : ''}</div></div>`;
}

function vePjCardBin(b) {
    const k = 'b:' + b.id, cor = b.cor ? veCor({ cor: b.cor }) : null;
    const n = vePjMidia().filter(m => vePjDescendentes(b.id).has(m.pasta)).length;
    return `<div class="ve-pj-card bin${VEPJ.sel.has(k) ? ' sel' : ''}" data-k="${k}" draggable="true" title="${veT('Clique duas vezes para abrir a pasta')}">
        <div class="ve-pj-capa"><svg class="i"><use href="#i-folder"/></svg></div>
        <div class="ve-pj-rotulo"><span class="ve-pj-cor"${cor ? ` style="background:${cor}"` : ''}></span><svg class="i"><use href="#i-folder"/></svg><span class="ve-pj-nome">${veEsc(b.nome)}</span></div>
        <div class="ve-pj-sub">${n} ${veT(n === 1 ? 'item' : 'itens')}</div></div>`;
}

// caminho da pasta aberta na grade (clicar volta para ela)
function vePjTrilha() {
    const cad = [];
    for (let b = vePjBin(VEPJ.pasta); b; b = b.pai ? vePjBin(b.pai) : null) cad.unshift(b);
    return `<div class="ve-pj-trilha"><button data-ir="" title="${veT('Voltar para a raiz do projeto')}"><svg class="i"><use href="#i-folder"/></svg>${veT('Projeto')}</button>` +
        cad.map(b => `<span>›</span><button data-ir="${b.id}">${veEsc(b.nome)}</button>`).join('') + '</div>';
}

function vePjGrade() {
    if (VEPJ.pasta && !vePjBin(VEPJ.pasta)) VEPJ.pasta = null;
    const { bins, med } = vePjFilhos(VEPJ.pasta);
    const cards = bins.map(vePjCardBin).join('') + med.map(vePjCardMidia).join('');
    return (VEPJ.pasta ? vePjTrilha() : '') +
        `<div class="ve-pj-grade">${cards || `<div class="ve-clips-empty">${veT('Pasta vazia')}</div>`}</div>`;
}

// pasta mostrada no painel: a aberta na grade; na lista, a raiz
const vePjPastaVista = () => (vePjEmGrade() && !VEPJ.busca.trim() && vePjBin(VEPJ.pasta) ? VEPJ.pasta : null);

function vePjAbrirPasta(id) {
    VEPJ.pasta = id || null;
    VEPJ.sel.clear();
    VEPJ.foco = null;
    vePjRender();
}

function vePjModo(modo) {
    PREFS.pjModo = modo === 'grade' ? 'grade' : 'lista';
    prefsSave();
    vePjRender();
}

function vePjTamanho(v) {
    PREFS.pjTam = +v;
    const box = $ve('ve-pj');
    if (box) box.style.setProperty('--pj-card', vePjTam() + 'px');
    clearTimeout(VEPJ.tamT);
    VEPJ.tamT = setTimeout(prefsSave, 400);
}

function vePjRender() {
    const box = $ve('ve-pj-lista');
    if (!box) return;
    if (VE.ready && typeof veSeqSalvarAtiva === 'function') veSeqSalvarAtiva();
    const grade = vePjEmGrade(), pj = $ve('ve-pj');
    pj.classList.toggle('grade', grade);
    pj.style.setProperty('--pj-card', vePjTam() + 'px');
    pj.querySelectorAll('[data-pj-modo]').forEach(b => b.classList.toggle('on', (b.dataset.pjModo === 'grade') === grade));
    const tam = pj.querySelector('.ve-pj-tam');
    if (tam) tam.value = vePjTam();
    const total = vePjMidia().length + (VE.bins || []).length;
    $ve('ve-pj-conta').textContent = VEPJ.sel.size ? `${VEPJ.sel.size} de ${total} selecionado(s)` : `${total} ${total === 1 ? 'item' : 'itens'}`;
    $ve('ve-pj-proj').textContent = VE.projectPath ? VE.projectPath.split(/[\\/]/).pop() : (VE.ready ? veT('Projeto não salvo') : '');
    if (!VE.ready) { box.innerHTML = `<div class="ve-clips-empty">${veT('Abra um vídeo para começar. Depois arraste para cá imagens, áudios, legendas (.srt, .vtt, .ass, .sbv, .txt), outros vídeos e pastas inteiras.')}</div>`; return; }
    const q = VEPJ.busca.trim().toLowerCase();
    if (q) {
        const achados = vePjMidia().filter(m => vePjNome(m).toLowerCase().includes(q));
        box.innerHTML = !achados.length ? `<div class="ve-clips-empty">${veT('Nada encontrado')}</div>`
            : grade ? `<div class="ve-pj-grade">${achados.map(vePjCardMidia).join('')}</div>` : achados.map(m => vePjLinhaMidia(m, 0)).join('');
        return;
    }
    box.innerHTML = grade ? vePjGrade() : vePjArvore(null, 0) + '<div class="ve-pj-fim" data-k="raiz"></div>';
}

// ─────────────────────────── importar ───────────────────────────
function vePjAddMidia(obj, pasta) {
    const m = { ...obj, id: VE.media.length, pasta: pasta || null };
    VE.media.push(m);
    return m;
}

async function vePjImportarArquivo(path, pasta) {
    const api = window.pywebview.api, nome = path.split(/[\\/]/).pop();
    if (VE_EXT_IMG.test(path)) {
        const r = await api.video_cutter_add_media(path);
        if (!r || !r.success) return false;
        const m = vePjAddMidia({ kind: 'image', path: r.path, url: r.url, name: r.name, img: new Image(), w: 0, h: 0 }, pasta);
        m.img.crossOrigin = 'anonymous';
        m.img.onload = () => { m.w = m.img.naturalWidth; m.h = m.img.naturalHeight; vePjRender(); };
        m.img.src = r.url;
        return true;
    }
    if (EXT_AUDIO.test(path) && !EXT_VIDEO.test(path)) {
        const r = await api.video_cutter_add_audio(path);
        if (!r || !r.success) return false;
        const m = vePjAddMidia({ kind: 'audio', path: r.path, name: r.name, dur: r.dur, peaks: r.peaks || [], url: r.url, quadros: r.quadros }, pasta);
        veAudioRegistrar(m.id, r.url, r.quadros);
        return true;
    }
    if (VE_EXT_LEG.test(path)) {
        const r = await api.ve_ler_legenda(path);
        if (!r || !r.success || !r.itens.length) { veToast(`${nome}: ${(r && r.error) || veT('nenhuma legenda encontrada')}`); return false; }
        vePjAddMidia({ kind: 'legenda', path, name: nome, itens: r.itens }, pasta);
        return true;
    }
    if (EXT_VIDEO.test(path)) {
        if (path === VE.path) return false;
        veMidiaPreparar(vePjAddMidia({ kind: 'video', path, name: nome }, pasta));
        return true;
    }
    return false;
}

async function vePjImportarPasta(path, pai) {
    const r = await window.pywebview.api.ve_listar_pasta(path);
    if (!r || !r.success) return 0;
    const b = vePjNovoBin(r.nome, pai);
    let n = 0;
    for (const a of r.arquivos) if (await vePjImportarArquivo(a, b.id)) n++;
    const sub = async (no, paiId) => {
        const bb = vePjNovoBin(no.nome, paiId);
        for (const a of no.arquivos) if (await vePjImportarArquivo(a, bb.id)) n++;
        for (const p of no.pastas) await sub(p, bb.id);
    };
    for (const p of r.pastas) await sub(p, b.id);
    return n;
}

// itens = [{path, pasta: bool}]; destino = pasta do projeto (ou raiz)
async function vePjImportar(itens, destino = vePjDestino()) {
    if (!VE.ready) {
        const v = itens.find(i => !i.pasta && (EXT_VIDEO.test(i.path) || EXT_AUDIO.test(i.path)));
        if (v) veOpenPath(v.path); else veToast('Abra um vídeo primeiro');
        return;
    }
    veToast('Importando...');
    let n = 0;
    for (const it of itens) n += it.pasta ? await vePjImportarPasta(it.path, destino) : (await vePjImportarArquivo(it.path, destino) ? 1 : 0);
    vePjAlterou();
    veToast(n ? `${n} ${n === 1 ? 'item importado' : 'itens importados'} para o projeto` : 'Nenhum arquivo compatível');
}

function vePjImportarDialogo() {
    if (!VE.ready) { veOpenFile(); return; }
    window.pywebview.api.ve_importar_dialogo().then(r => {
        if (r && r.success) vePjImportar(r.paths.map(path => ({ path, pasta: false })));
    });
}

// Pasta onde entram itens novos/colados: a pasta selecionada, ou a pasta do item selecionado
function vePjDestino() {
    const k = VEPJ.foco || [...VEPJ.sel][0];
    if (!k) return vePjPastaVista();
    if (k.startsWith('b:')) return k.slice(2);
    const m = VE.media[+k.slice(2)];
    return (m && m.pasta) || null;
}

function vePjNovaPasta() {
    if (!VE.ready) return;
    const b = vePjNovoBin(veT('Nova pasta'), vePjDestino());
    const pai = vePjBin(b.pai);
    if (pai) pai.aberta = true;
    VEPJ.sel = new Set(['b:' + b.id]);
    VEPJ.foco = 'b:' + b.id;
    vePjAlterou();
    vePjRenomear('b:' + b.id);
}

function vePjNovoAjuste() {
    if (!VE.ready) return;
    const n = vePjMidia().filter(m => m.kind === 'ajuste').length + 1;
    const m = vePjAddMidia({ kind: 'ajuste', name: 'Camada de ajuste', nome: n > 1 ? `${veT('Camada de ajuste')} ${n}` : undefined }, vePjDestino());
    VEPJ.sel = new Set(['m:' + m.id]);
    vePjAlterou();
    veToast('Camada de ajuste criada: arraste para a timeline');
}

// ─────────────────────────── editar ───────────────────────────
function vePjRenomear(k) {
    const row = $ve('ve-pj-lista').querySelector(`[data-k="${k}"] .ve-pj-nome`);
    if (!row) return;
    const b = k.startsWith('b:') ? vePjBin(k.slice(2)) : null, m = b ? null : VE.media[+k.slice(2)];
    const inp = row.ownerDocument.createElement('input');
    inp.className = 've-pj-ren';
    inp.value = b ? b.nome : vePjNome(m);
    row.replaceWith(inp);
    inp.focus(); inp.select();
    let feito = false;
    const fim = ok => {
        if (feito) return;
        feito = true;
        const v = inp.value.trim();
        if (ok && v) {
            if (b) b.nome = v;
            else {
                m.nome = v;
                if (m.kind === 'timeline' || m.comp) {
                    const seq = (VE.sequences || []).find(s => s.id === m.sequenceId);
                    if (seq) seq.name = v;
                }
            }
            vePjAlterou();
            if (!b && (m.kind === 'timeline' || m.comp)) veSeqTabsRender();
        } else vePjRender();
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
    inp.addEventListener('blur', () => fim(true));
}

function vePjCopiaMidia(m, pasta) {
    if (m.kind === 'timeline') {
        return typeof veCreateTimeline === 'function' ? veCreateTimeline({ cloneId: m.sequenceId, pasta }) && veSeqMedia(VE.activeSequence) : null;
    }
    if (m.comp) return veCompDuplicar(m, pasta);   // Comp nova com a timeline copiada (editor-comp.js)
    const n = vePjAddMidia({ ...m, nome: `${vePjNome(m)} ${veT('cópia')}`, itens: m.itens ? m.itens.map(x => ({ ...x })) : undefined }, pasta);
    delete n.removido;
    if (n.kind === 'audio' && n.url) veAudioRegistrar(n.id, n.url, n.quadros);
    if (n.kind === 'video') {
        // outro item do mesmo arquivo: prévia e áudio próprios (preparados de novo; o que já existe em disco é reaproveitado)
        ['url', 'info', 'thumbs', 'peaks', 'dur', 'pct', 'erro'].forEach(k => delete n[k]);
        n.path = n.path || VE.path;
        veMidiaPreparar(n);
    }
    return n;
}

function vePjCopiaBin(b, pai) {
    const nb = vePjNovoBin(`${b.nome} ${veT('cópia')}`, pai);
    nb.cor = b.cor;
    (VE.bins || []).filter(x => x.pai === b.id).forEach(x => vePjCopiaBin(x, nb.id));
    vePjMidia().filter(m => m.pasta === b.id).forEach(m => vePjCopiaMidia(m, nb.id));
    return nb;
}

function vePjDuplicar(keys = [...VEPJ.sel]) {
    if (!keys.length) return;
    keys.forEach(k => {
        if (k.startsWith('b:')) { const b = vePjBin(k.slice(2)); if (b) vePjCopiaBin(b, b.pai); }
        else { const m = VE.media[+k.slice(2)]; if (m) vePjCopiaMidia(m, m.pasta); }
    });
    vePjAlterou();
    veToast(keys.length === 1 ? 'Item duplicado' : `${keys.length} itens duplicados`);
}

function vePjMover(keys, destino) {
    const proibido = new Set();
    keys.filter(k => k.startsWith('b:')).forEach(k => vePjDescendentes(k.slice(2)).forEach(x => proibido.add(x)));
    if (destino && proibido.has(destino)) { veToast('Uma pasta não pode ir para dentro dela mesma'); return false; }
    keys.forEach(k => {
        if (k.startsWith('b:')) { const b = vePjBin(k.slice(2)); if (b) b.pai = destino || null; }
        else { const m = VE.media[+k.slice(2)]; if (m) m.pasta = destino || null; }
    });
    const d = vePjBin(destino);
    if (d) d.aberta = true;
    vePjAlterou();
    return true;
}

function vePjCopiar(modo) {
    if (!VEPJ.sel.size) return;
    VEPJ.clip = { modo, keys: [...VEPJ.sel] };
    veToast(modo === 'recortar' ? 'Recortado: Ctrl+V cola na pasta selecionada' : 'Copiado: Ctrl+V cola na pasta selecionada');
}

function vePjColar() {
    const cb = VEPJ.clip;
    if (!cb) return;
    const destino = vePjDestino();
    if (cb.modo === 'recortar') { if (vePjMover(cb.keys, destino)) VEPJ.clip = null; return; }
    cb.keys.forEach(k => {
        if (k.startsWith('b:')) { const b = vePjBin(k.slice(2)); if (b) vePjCopiaBin(b, destino); }
        else { const m = VE.media[+k.slice(2)]; if (m && !m.removido) vePjCopiaMidia(m, destino); }
    });
    vePjAlterou();
}

function vePjApagar(keys = [...VEPJ.sel]) {
    if (!keys.length) return;
    const bins = new Set();
    keys.filter(k => k.startsWith('b:')).forEach(k => vePjDescendentes(k.slice(2)).forEach(x => bins.add(x)));
    const midias = new Set(keys.filter(k => k.startsWith('m:')).map(k => +k.slice(2)));
    vePjMidia().forEach(m => { if (bins.has(m.pasta)) midias.add(m.id); });
    [...midias].forEach(id => {
        const m = VE.media[id];
        if (m && m.kind === 'timeline') {
            veDeleteTimeline(m.sequenceId);
            midias.delete(id);
        }
    });
    if (!midias.size && !bins.size) { VEPJ.sel.clear(); vePjRender(); return; }
    if (midias.has(0) && !veMediaOffline(VE.media[0])) { veToast('O vídeo principal do projeto não pode ser apagado'); midias.delete(0); if (!midias.size && !bins.size) return; }
    if (typeof veSeqSalvarAtiva === 'function') veSeqSalvarAtiva();
    const seqs = VE.sequences && VE.sequences.length ? VE.sequences : [{ id: VE.activeSequence, clips: VE.clips }];
    const usados = seqs.reduce((n, s) => n + (s.clips || []).filter(c => midias.has(c.m || 0)).length, 0);
    // em uso na timeline: pede confirmação (clicar/apertar de novo), como o aviso do Premiere
    if (usados && !(VEPJ.conf && Date.now() - VEPJ.conf < 5000)) {
        VEPJ.conf = Date.now();
        veToast(`${usados} clipe(s) da timeline usam esse material e sairão junto. Apague de novo para confirmar.`);
        return;
    }
    VEPJ.conf = 0;
    if (usados) {
        vePushHistory();
        seqs.forEach(s => { s.clips = (s.clips || []).filter(c => !midias.has(c.m || 0)); });
        const ativa = seqs.find(s => s.id === VE.activeSequence);
        VE.clips = ativa ? ativa.clips : VE.clips.filter(c => !midias.has(c.m || 0));
        VE.sel = -1;
        veRelayout();
        veAfterEdit(Math.min(VE.playhead, VE.dur));
    }
    midias.forEach(id => {
        VE.media[id].removido = true;
        if (id === 0) {
            VE.path = null;
            VE.info = { duration: 0, fps: VE.fps || 30, width: VE.seqW, height: VE.seqH, has_audio: false, offline: true };
            VE.srcDur = 0;
            VE.thumbs = [];
            VE.peaks = [];
            $ve('ve-export-btn').disabled = true;
            $ve('ve-meta').textContent = 'Mídia principal removida';
        }
    });
    VE.bins = (VE.bins || []).filter(b => !bins.has(b.id));
    VEPJ.sel.clear();
    vePjAlterou();
}

function vePjCor(keys, cor) {
    keys.forEach(k => {
        const o = k.startsWith('b:') ? vePjBin(k.slice(2)) : VE.media[+k.slice(2)];
        if (!o) return;
        if (cor) o.cor = cor; else delete o.cor;
    });
    vePjAlterou();
}

function vePjRelink(id) {
    const m = VE.media[id];
    if (!m || m.removido || !['video', 'audio', 'image'].includes(m.kind)) return;
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.select_file) { veToast('A ponte com o app ainda não está pronta'); return; }
    api.select_file('video-cutter').then(r => {
        if (!r || !r.success || !r.path) return;
        veTrocarArquivo(m, r.path);
    });
}

// O arquivo é do mesmo tipo da mídia? (substituir/relincar)
function veArquivoServe(m, path) {
    if (m.kind === 'image') return VE_EXT_IMG.test(path);
    if (m.kind === 'audio') return EXT_AUDIO.test(path) && !EXT_VIDEO.test(path);
    return EXT_VIDEO.test(path) || EXT_AUDIO.test(path);
}

// Substituir mídia (Replace Footage do Premiere) / relincar: a mídia passa a usar outro arquivo e TODOS os clipes
// dela na timeline (cortes, posições, efeitos) continuam iguais — só a imagem/o som mudam. Ex.: o mesmo vídeo com
// o som melhorado em outro programa.
function veTrocarArquivo(m, path, silencioso) {
    const api = window.pywebview.api, nome = vePathNome(path);
    if (!veArquivoServe(m, path)) {
        veToast(m.kind === 'image' ? 'Escolha um arquivo de imagem' : m.kind === 'audio' ? 'Escolha um arquivo de áudio' : 'Escolha um vídeo ou áudio');
        return false;
    }
    const substituindo = !veMediaOffline(m);
    if (typeof veCacheInvalidate === 'function') veCacheInvalidate();   // o monitor não mostra quadros do arquivo antigo
    if (typeof vePrInvalidar === 'function') vePrInvalidar();
    // cópias invertidas (Reverse Speed) da mídia antiga: geradas de novo a partir do arquivo novo
    const invertidas = VE.media.filter(x => x && !x.removido && x.rvDe === m.id);
    ['mel', 'melOff', '_aMel', '_aOrig'].forEach(k => delete m[k]);
    Object.assign(m, { path, name: m.nome ? m.name || nome : nome });
    delete m.offline; delete m.missing; delete m.lost; delete m.erro;
    if (m.kind === 'image') {
        api.video_cutter_add_media(path).then(rr => {
            if (!rr || !rr.success) { m.offline = true; m.erro = (rr && rr.error) || 'erro'; vePjRender(); return; }
            Object.assign(m, { path: rr.path, url: rr.url, name: m.nome ? m.name : rr.name, img: new Image(), w: 0, h: 0 });
            m.img.crossOrigin = 'anonymous';
            m.img.onload = () => { m.w = m.img.naturalWidth; m.h = m.img.naturalHeight; veRelinkDone(m); };
            m.img.onerror = () => { m.offline = true; m.erro = 'erro'; vePjRender(); };
            m.img.src = rr.url;
        });
    } else if (m.kind === 'audio') {
        api.video_cutter_add_audio(path).then(rr => {
            if (!rr || !rr.success) { m.offline = true; m.erro = (rr && rr.error) || 'erro'; vePjRender(); return; }
            Object.assign(m, { path: rr.path, name: m.nome ? m.name : rr.name, dur: rr.dur, peaks: rr.peaks || [], url: rr.url, quadros: rr.quadros });
            veAudioRegistrar(m.id, rr.url, rr.quadros);
            veRelinkDone(m);
        });
    } else if (m.id === 0) {
        VE.path = path;
        VE.info = null;
        VE.thumbs = [];
        VE.peaks = [];
        m.dur = m.dur || VE.srcDur || 1;
        veLoading('Relincando mídia...', 10);
        api.ve_preparar_midia(path, 0);
        veRelinkDone(m, true);
    } else {
        delete m.info; delete m.url; delete m.thumbs; delete m.peaks;
        veMidiaPreparar(m, true);
        veRelinkDone(m, true);
    }
    if (typeof veRvRestaurar === 'function') invertidas.forEach(nm => { nm.missing = true; veRvRestaurar(nm); });
    if (!silencioso && substituindo) veToast(`${vePjNome(m)}: ${veT('substituída — os clipes da timeline continuam com os mesmos cortes')}`);
    return true;
}

function veRelinkDone(m, preparando) {
    if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
    vePjRender();
    veDraw();
    veDrawMonitorSoon();
    if (!preparando) veToast(`${vePjNome(m)} ${veT('atualizada')}`);
}

// Substituir várias de uma vez: escolhe a pasta com as versões novas; cada mídia pega o arquivo de mesmo nome
// (ou o que começa com o nome dela: "IMG_0013_comprimido_melhorado.mp4" serve para "IMG_0013_comprimido.mp4")
function vePjSubstituirVarios(ids) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.select_folder) return;
    const midias = ids.map(id => VE.media[id]).filter(m => m && ['video', 'audio', 'image'].includes(m.kind));
    api.select_folder('video-cutter').then(r => {
        if (!r || !r.success || !r.path) return;
        api.ve_listar_pasta(r.path).then(lst => {
            const arqs = [];
            const junta = n => { (n.arquivos || []).forEach(a => arqs.push(a)); (n.pastas || []).forEach(junta); };
            if (lst && lst.success) junta(lst);
            const radical = p => vePathNome(p).replace(/\.[^.]+$/, '').toLowerCase();
            let ok = 0;
            const faltou = [];
            midias.forEach(m => {
                const base = radical(m.path || m.name || '');
                const servem = arqs.filter(a => veArquivoServe(m, a) && a.toLowerCase() !== String(m.path || '').toLowerCase());
                const achou = servem.find(a => radical(a) === base) || servem.filter(a => radical(a).startsWith(base)).sort((x, y) => x.length - y.length)[0];
                if (achou && veTrocarArquivo(m, achou, true)) ok++; else faltou.push(vePjNome(m));
            });
            veToast(`${ok} ${veT(ok === 1 ? 'mídia substituída' : 'mídias substituídas')}` + (faltou.length ? ` · ${veT('sem arquivo correspondente')}: ${faltou.slice(0, 4).join(', ')}${faltou.length > 4 ? '…' : ''}` : ''));
        });
    });
}

// ── Melhorar áudio (botão direito no Projeto ou no clipe): Sidon + OmniVoice no fundo, uma mídia por vez. Gera só o
// som ("<nome>_melhorado.wav", no tempo do vídeo) e a mídia passa a tocar e exportar esse som no lugar do dela:
// a imagem e os cortes não mudam. O original fica guardado: a chave "Áudio melhorado" volta a ele (m.melOff). ──
const VEMA = { fila: [], atual: null, path: '', pct: -1, anim: 0 };

function vePjMelhorarAudio(ids) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.melhorar_audio_midia) return;
    ids.forEach(id => { if (VEMA.atual !== id && !VEMA.fila.includes(id)) VEMA.fila.push(id); });
    veToast(veT('Melhorando o áudio no fundo — dá para continuar editando'));
    veMaProximo();
    veMaAtualizar(true);
}

function veMaProximo() {
    while (VEMA.atual == null && VEMA.fila.length) {
        const id = VEMA.fila.shift(), m = VE.media[id];
        if (!m || m.removido || !m.path) continue;
        Object.assign(VEMA, { atual: id, path: m.path, pct: -1 });
        window.pywebview.api.melhorar_audio_midia(m.path, id);
    }
}

// a mídia está melhorando agora ({pct}) ou na fila ({fila: n})? (outro projeto aberto no meio: o id não vale)
function veMaEstado(id) {
    const m = VE.media[id];
    if (!m) return null;
    if (VEMA.atual === id && m.path === VEMA.path) return { pct: VEMA.pct };
    const n = VEMA.fila.indexOf(id);
    return n >= 0 ? { fila: n + 1 } : null;
}

function veMaRotulo(e) {
    return e.fila ? `${veT('Melhorando')} · ${veT('na fila')}` : `${veT('Melhorando')}${e.pct >= 0 ? ` ${Math.round(e.pct)}%` : '…'}`;
}

// por cima da faixa de áudio: escurece a onda, listras andando, barra de progresso e o rótulo
function veMaDesenhar(ctx, x, y, w, h, e) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, h);
    const d = (performance.now() / 45) % 16;
    ctx.strokeStyle = e.fila ? 'rgba(255,255,255,0.07)' : 'rgba(249,115,22,0.22)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let k = x - h - 16 + d; k < x + w + 16; k += 16) { ctx.moveTo(k, y + h); ctx.lineTo(k + h, y); }
    ctx.stroke();
    if (!e.fila && e.pct >= 0) {
        ctx.fillStyle = '#F97316';
        ctx.fillRect(x, y + h - 3, w * Math.min(1, e.pct / 100), 3);
    }
    if (w > 46 && h >= 12) {
        ctx.font = '600 10px Segoe UI';
        const txt = veMaRotulo(e), tw = Math.min(w - 8, ctx.measureText(txt).width + 12), ty = y + Math.min(h / 2 - 7, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(x + 4, ty, tw, 14);
        ctx.fillStyle = e.fila ? '#bbb' : '#FB8A3C';
        ctx.fillText(txt, x + 10, ty + 10.5, tw - 12);
    }
    ctx.restore();
}

// timeline animada e selos do painel Projeto enquanto houver algo melhorando
function veMaAtualizar(redesenharPainel) {
    const ativo = VEMA.atual != null || VEMA.fila.length > 0;
    if (ativo && !VEMA.anim) VEMA.anim = setInterval(veDraw, 120);
    if (!ativo && VEMA.anim) { clearInterval(VEMA.anim); VEMA.anim = 0; }
    veDraw();
    if (redesenharPainel) { vePjRender(); return; }
    const lista = $ve('ve-pj-lista');
    if (lista) lista.querySelectorAll('[data-enh]').forEach(el => {
        const e = veMaEstado(+el.dataset.enh);
        if (e) el.textContent = veMaRotulo(e);
    });
}

function veMelhorarAudioProgresso(d) {
    const id = VEMA.atual, m = VE.media[id];
    const nome = m ? vePjNome(m) : '';
    if (!d.complete) {
        if (d.percent != null && d.percent >= 0) VEMA.pct = d.percent;
        veMaAtualizar(false);
        return;
    }
    VEMA.atual = null;
    if (d.error) veToast(`${nome}: ${veT('não foi possível melhorar o áudio')} — ${d.error}`);
    else if (d.saida && m && m.path === VEMA.path) {   // outro projeto aberto no meio: não troca nada
        m.mel = d.saida;
        delete m.melOff;
        veMelCarregar(m, true);
    } else if (d.saida) veToast(`${veT('Áudio melhorado salvo em')} ${vePathNome(d.saida)}`);
    veMaProximo();
    veMaAtualizar(true);
}
window.veMelhorarAudioProgresso = veMelhorarAudioProgresso;

// ── som melhorado da mídia ──
function veMelLigado(m) { return !!(m && m.mel && !m.melOff && m._aMel); }

// veAudioRegistrar (editor-audio.js) passa por aqui: guarda o som original e devolve o que deve tocar
function veMelFonte(m, url, quadros) {
    if (!m._aMel || url !== m._aMel.url) m._aOrig = { url, quadros };
    const f = m.melOff || !m._aMel ? m._aOrig : m._aMel;
    return f ? [f.url, f.quadros] : null;
}

// arquivo de som do clipe na exportação (null = o vídeo aberto)
function veMelArquivo(id) {
    const m = VE.media[id];
    if (m && m.mel && !m.melOff) return m.mel;
    return id ? m.path : null;
}

// lê o .wav (PCM para o mixer e forma de onda) e passa a tocá-lo
function veMelCarregar(m, avisar) {
    window.pywebview.api.video_cutter_add_audio(m.mel).then(r => {
        if (!r || !r.success) {
            veToast(`${vePjNome(m)}: ${veT('o áudio melhorado não foi encontrado — voltou ao original')}`);
            ['mel', 'melOff', '_aMel'].forEach(k => delete m[k]);
            if (m._aOrig) veAudioRegistrar(m.id, m._aOrig.url, m._aOrig.quadros);
            vePjAlterou();
            veDraw();
            return;
        }
        // o som original já tocava antes de a mídia ganhar o melhorado: guarda para a chave voltar a ele
        const atual = typeof VEAU !== 'undefined' && VEAU.fontes.get(m.id);
        if (!m._aOrig && atual && atual.url !== r.url) m._aOrig = { url: atual.url, quadros: atual.quadros };
        m._aMel = { url: r.url, quadros: r.quadros, peaks: r.peaks || [] };
        veAudioRegistrar(m.id, r.url, r.quadros);
        if (avisar) {
            if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
            veToast(`${vePjNome(m)}: ${veT('áudio melhorado — a imagem e os cortes continuam iguais')}`);
        }
        vePjRender();
        veDraw();
    });
}

// chave melhorado / original (dá para comparar tocando: o mixer troca a fonte no próximo bloco)
function veMelAlternar(m) {
    if (!m || !m.mel) return;
    m.melOff = !m.melOff;
    const f = m.melOff ? m._aOrig : m._aMel;
    if (f) veAudioRegistrar(m.id, f.url, f.quadros);
    vePjAlterou();
    veDraw();
    veToast(`${vePjNome(m)}: ${veT(m.melOff ? 'áudio original' : 'áudio melhorado')}`);
}

// selo no painel Projeto: "Melhorando 42%" enquanto processa; depois, a chave do som melhorado
function veMelSelo(m) {
    const e = veMaEstado(m.id);
    if (e) return `<span class="ve-pj-enh${e.fila ? ' fila' : ''}" data-enh="${m.id}">${veMaRotulo(e)}</span>`;
    if (!m.mel) return '';
    return `<span class="ve-pj-mel${m.melOff ? ' off' : ''}" data-mel title="${veT(m.melOff ? 'Tocando o áudio original: clique para usar o melhorado' : 'Tocando o áudio melhorado: clique para ouvir o original')}">${veT(m.melOff ? 'Original' : 'Melhorado')}</span>`;
}

function veMelMenuItens(m, attr, soChave) {
    if (!m || !['video', 'audio'].includes(m.kind) || !m.path || veMediaOffline(m)) return '';
    const chave = m.mel ? `<button class="ve-ctx-item" ${attr}="mel">${m.melOff ? '' : '✓ '}${veT('Áudio melhorado')}</button>` : '';
    return soChave ? chave : `<div class="ve-ctx-sep"></div><button class="ve-ctx-item" ${attr}="ma">${veT('Melhorar áudio')}</button>${chave}`;
}

// ── Mostrar no projeto (botão direito no clipe da timeline, como o Reveal in Project do Premiere) ──
function veMostrarNoProjeto(c) {
    let m = c && veMediaOf(c);
    if (m && m.rvDe != null) m = VE.media[m.rvDe] || m;   // clipe invertido: a mídia original
    if (!m || !VE_PJ_TIPOS[m.kind] || m.base || m.removido) { veToast('Este clipe não tem um item no painel Projeto'); return; }
    for (let b = vePjBin(m.pasta); b; b = vePjBin(b.pai)) b.aberta = true;   // abre as pastas até ele
    if (PREFS.pjModo === 'grade') VEPJ.pasta = m.pasta || null;
    VEPJ.sel = new Set(['m:' + m.id]);
    VEPJ.foco = 'm:' + m.id;
    if (typeof vedShow === 'function') vedShow('projeto');
    vePjRender();
    setTimeout(() => {
        const box = $ve('ve-pj-lista'), el = box && box.querySelector(`[data-k="m:${m.id}"]`);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.remove('pj-piscar');
        void el.offsetWidth;
        el.classList.add('pj-piscar');
        setTimeout(() => el.classList.remove('pj-piscar'), 1800);
    }, 60);
}

// ─────────────────────────── para a timeline ───────────────────────────
// ids arrastados do painel e soltos em (x, y) da tela: cada item entra no ponto/trilha do soltar (os seguintes, em fila)
function vePjColocar(ids, drop) {
    if (!VE.ready) return;
    const wrapEl = $ve('ve-tl-wrap'), wrap = wrapEl.getBoundingClientRect();
    const mesmoDoc = !drop || !drop.doc || drop.doc === wrapEl.ownerDocument;
    const naTl = mesmoDoc && drop && drop.x >= wrap.left && drop.x <= wrap.right && drop.y >= wrap.top + VE_RULER && drop.y <= wrap.bottom;
    let t = Number.isFinite(drop && drop.t) ? drop.t : naTl ? Math.max(0, VE.view + (drop.x - wrap.left) / VE.pps) : VE.playhead;
    const row = Number.isFinite(drop && drop.tr) ? { kind: drop.rowKind || 'v', _tr: drop.tr } : naTl ? veRowAt(drop.y - wrap.top) : null;
    let colocados = 0;
    ids.map(id => VE.media[id]).filter(m => m && !m.removido).forEach(m => {
        if (m.kind === 'timeline') { veOpenTimeline(m.sequenceId); return; }
        if (veMediaOffline(m)) { veToast('Relinque a mídia offline antes de colocar na timeline'); return; }
        // uma Comp não entra nela mesma (nem numa Comp que está dentro dela)
        if (m.comp && typeof veCompContem === 'function' && veCompContem(m.sequenceId, VE.activeSequence)) { veToast('Uma Comp não pode entrar nela mesma'); return; }
        const st = veSnapFrame(t);
        if (m.kind === 'image' || m.kind === 'ajuste' || m.kind === 'cor') {
            veInsertImageClip(m, naTl ? { x: wrap.left + (st - VE.view) * VE.pps, y: drop.y, at: Date.now() } : null, 0,
                m.kind === 'ajuste' ? 'Camada de ajuste adicionada' : m.kind === 'cor' ? 'Cor sólida adicionada' : 'Imagem adicionada', false);
            const c = VE.clips[VE.sel];
            if (c && m.cor) c.cor = m.cor;
            t = st + VE_IMG_DUR; colocados++;
        } else if (m.kind === 'video') {
            const dur = m.id === 0 ? VE.srcDur : m.info && m.info.duration;
            if (!dur) {
                if (!m.erro) veMidiaPriorizar(m);
                veToast(m.erro ? 'Esse vídeo não pôde ser preparado: ' + m.erro : 'Esse vídeo ainda está sendo preparado');
                return;
            }
            // só a imagem (x: 'v') ou só o áudio (x: 'a'): o mesmo clipe que o "desvincular" deixa, sem par
            const parte = drop && (drop.parte === 'v' || drop.parte === 'a') ? drop.parte : null;
            const temSom = m.id === 0 ? !!(VE.info && VE.info.has_audio) : !!(m.info && m.info.has_audio);
            if (parte === 'a' && !temSom) { veToast('Esse vídeo não tem som'); return; }
            if (!m.url && parte !== 'a') veMidiaPriorizar(m);
            const tr = Number.isFinite(drop && drop.tr) ? drop.tr : row && row.kind !== 'l' ? veTrackIndex(row) : 0;
            if (veTrkLocked(tr)) { veAvisoBloqueio(); return; }
            vePushHistory();
            const s0 = Number.isFinite(drop && drop.srcIn) ? Math.max(0, Math.min(dur, drop.srcIn)) : 0;
            const e0 = Number.isFinite(drop && drop.srcOut) ? Math.max(s0 + veFrame(), Math.min(dur, drop.srcOut)) : dur;
            const clip = { tr, st, s: s0, e: e0 };
            if (m.id) clip.m = m.id;
            if (m.cor) clip.cor = m.cor;
            if (parte) clip.x = parte;
            vePlaceClip(clip);
            if (parte) veToast(parte === 'a' ? `${veT('Só o áudio')} → A${tr + 1}` : `${veT('Só a imagem')} → V${tr + 1}`);
            veAfterEdit(VE.playhead);
            t = st + veLen(clip); colocados++;
        } else if (m.kind === 'audio') {
            const trA = row && row.kind === 'a' ? veTrackIndex(row) : -1;
            if (vePjAudioEm(m, st, trA)) { t = st + m.dur; colocados++; }
        } else if (m.kind === 'legenda') {
            if ((VE.legendas || []).length && !veConfirmarTroca()) return;
            vePushHistory();
            const d = naTl ? st : 0;
            VE.legendas = m.itens.map(x => ({ st: +(x.st + d).toFixed(3), en: +(x.en + d).toFixed(3), texto: x.texto }));
            veRefresh();
            veToast(`${m.itens.length} legendas na trilha LEG`);
            colocados++;
        }
    });
    if (colocados) vePjRender();
}

// Áudio do projeto em st: na trilha pedida se estiver livre; senão, abaixo da última trilha de áudio usada
function vePjAudioEm(m, st, trPedida) {
    const b = st + m.dur, novo = { m: m.id };
    const livre = k => !veTrkLocked(k) && veTrackFree(k, st, b, novo);
    let tr = trPedida >= 0 && livre(trPedida) ? trPedida : -1;
    if (tr < 0) {
        const usadas = VE.clips.filter(veOcupaA).map(c => c.tr), ultima = usadas.length ? Math.max(...usadas) : -1;
        tr = veTrackIndexes().find(k => k > ultima && livre(k));
        if (tr == null) tr = veTrackIndexes().find(livre);
        if (tr == null) { tr = Math.max(0, ultima + 1, veTrackCount()); veEnsureTrackIndex(tr); }
    }
    if (tr == null || tr < 0 || !livre(tr)) { veToast('Não há trilha de áudio livre nesse ponto'); return false; }
    vePushHistory();
    const clip = { tr, st, s: 0, e: m.dur, m: m.id };
    if (m.cor) clip.cor = m.cor;
    VE.clips.push(clip);
    VE.sel = VE.clips.indexOf(clip);
    veRelayout();
    veAfterEdit(VE.playhead);
    const linha = VE_TRACKS.find(x => x.id === 'A' + (tr + 1));
    if (linha && linha.h < 40) { linha.h = 48; veBuildHeads(); veLsSet('ve-track-h', JSON.stringify(VE_TRACKS.map(t => t.h))); veDraw(); }
    veToast(`Áudio adicionado em A${tr + 1}`);
    return true;
}

// ─────────────────────────── menu do botão direito ───────────────────────────
function vePjMenu(x, y, doc) {
    veClipMenuFechar();
    const keys = [...VEPJ.sel], um = keys.length === 1;
    const midiaUm = um && keys[0].startsWith('m:') ? VE.media[+keys[0].slice(2)] : null;
    const podeRelink = midiaUm && ['video', 'audio', 'image'].includes(midiaUm.kind);
    const comSom = keys.filter(k => k.startsWith('m:')).map(k => +k.slice(2))
        .filter(id => { const x = VE.media[id]; return x && !x.removido && ['video', 'audio'].includes(x.kind) && x.path && !veMediaOffline(x); });
    const varias = keys.length > 1 ? keys.filter(k => k.startsWith('m:')).map(k => +k.slice(2)).filter(id => ['video', 'audio', 'image'].includes((VE.media[id] || {}).kind)) : [];
    const m = doc.createElement('div');
    m.className = 've-ctx';
    m.innerHTML = `
        ${keys.length ? `<div class="ve-ctx-sub">Cor do rótulo</div>
        <div class="ve-ctx-cores">
            <button class="ve-ctx-cor padrao" data-cor="" title="Padrão"></button>
            ${VE_CORES.map(([k, nome, hex]) => `<button class="ve-ctx-cor" data-cor="${k}" title="${nome}" style="--c:${hex}"></button>`).join('')}
        </div><div class="ve-ctx-sep"></div>` : ''}
        ${um ? '<button class="ve-ctx-item" data-pj="ren">Renomear<kbd>F2</kbd></button>' : ''}
        ${podeRelink ? `<button class="ve-ctx-item${veMediaOffline(midiaUm) ? ' offline' : ''}" data-pj="rel" title="${veMediaOffline(midiaUm) ? '' : 'Troca o arquivo e mantém os clipes na timeline com os mesmos cortes e posições'}">${veMediaOffline(midiaUm) ? 'Relincar mídia...' : 'Substituir mídia...'}</button>` : ''}
        ${varias.length > 1 ? `<button class="ve-ctx-item" data-pj="relv" title="Escolha a pasta com as versões novas: cada mídia pega o arquivo de mesmo nome">Substituir ${varias.length} mídias (escolher pasta)...</button>` : ''}
        ${comSom.length ? `<button class="ve-ctx-item" data-pj="ma" title="${veT('Voz com som de estúdio (Sidon + OmniVoice). Gera o _melhorado.wav ao lado do original e troca só o som: a imagem e os cortes ficam iguais')}">${veT('Melhorar áudio')}${comSom.length > 1 ? ` (${comSom.length})` : ''}</button>` : ''}
        ${midiaUm && midiaUm.mel ? veMelMenuItens(midiaUm, 'data-pj', true) : ''}
        ${keys.length ? `<button class="ve-ctx-item" data-pj="dup">Duplicar<kbd>Ctrl+D</kbd></button>
        <button class="ve-ctx-item" data-pj="cut">Recortar<kbd>Ctrl+X</kbd></button>
        <button class="ve-ctx-item" data-pj="copy">Copiar<kbd>Ctrl+C</kbd></button>` : ''}
        <button class="ve-ctx-item" data-pj="paste"${VEPJ.clip ? '' : ' disabled'}>Colar<kbd>Ctrl+V</kbd></button>
        <div class="ve-ctx-sep"></div>
        <button class="ve-ctx-item" data-pj="bin">Nova pasta<kbd>Ctrl+B</kbd></button>
        <button class="ve-ctx-item" data-pj="tl">Nova timeline<kbd>Ctrl+N</kbd></button>
        <button class="ve-ctx-item" data-pj="aj">Nova camada de ajuste</button>
        <button class="ve-ctx-item" data-pj="cor">Nova cor sólida</button>
        <button class="ve-ctx-item" data-pj="imp">Importar...<kbd>Ctrl+I</kbd></button>
        ${keys.length ? '<div class="ve-ctx-sep"></div><button class="ve-ctx-item perigo" data-pj="del">Apagar<kbd>Delete</kbd></button>' : ''}`;
    doc.body.appendChild(m);
    const w = doc.defaultView, r = m.getBoundingClientRect();
    m.style.left = Math.max(6, Math.min(x, w.innerWidth - r.width - 6)) + 'px';
    m.style.top = Math.max(6, Math.min(y, w.innerHeight - r.height - 6)) + 'px';
    m.addEventListener('click', e => {
        const cor = e.target.closest('[data-cor]'), it = e.target.closest('[data-pj]');
        if (cor) vePjCor(keys, cor.dataset.cor);
        else if (it) ({ ren: () => vePjRenomear(keys[0]), dup: () => vePjDuplicar(keys), cut: () => vePjCopiar('recortar'),
            copy: () => vePjCopiar('copiar'), paste: vePjColar, bin: vePjNovaPasta, aj: vePjNovoAjuste, cor: vePjNovaCor, imp: vePjImportarDialogo,
            tl: () => veCreateTimeline(), rel: () => vePjRelink(+keys[0].slice(2)), relv: () => vePjSubstituirVarios(varias), ma: () => vePjMelhorarAudio(comSom), mel: () => veMelAlternar(midiaUm), del: () => vePjApagar(keys) })[it.dataset.pj]();
        else return;
        veClipMenuFechar();
    });
    const fora = e => { if (!m.contains(e.target)) veClipMenuFechar(); };
    const tecla = e => { if (e.key === 'Escape') veClipMenuFechar(); };
    setTimeout(() => { doc.addEventListener('pointerdown', fora, true); doc.addEventListener('keydown', tecla, true); }, 0);
    VE._ctx = { m, fechar: () => { doc.removeEventListener('pointerdown', fora, true); doc.removeEventListener('keydown', tecla, true); m.remove(); } };
}

// ─────────────────────────── eventos ───────────────────────────
function vePjInit() {
    const box = $ve('ve-pj');
    if (!box) return;
    const lista = $ve('ve-pj-lista');
    const chaves = () => [...lista.querySelectorAll('[data-k]:not([data-k="raiz"])')].map(r => r.dataset.k);
    lista.addEventListener('click', e => {
        const ir = e.target.closest('[data-ir]');
        if (ir) { vePjAbrirPasta(ir.dataset.ir); return; }
        const row = e.target.closest('[data-k]');
        if (row && e.target.closest('[data-mel]')) { veMelAlternar(VE.media[+row.dataset.k.slice(2)]); return; }
        if (e.target.closest('[data-seta]')) { const b = vePjBin(row.dataset.k.slice(2)); b.aberta = !b.aberta; vePjRender(); return; }
        if (!row || row.dataset.k === 'raiz') { VEPJ.sel.clear(); VEPJ.foco = null; vePjRender(); return; }
        const k = row.dataset.k;
        // duplo clique vem por aqui (e.detail): o 1º clique redesenha o painel e o dblclick se perderia
        if (e.detail === 2 && !e.shiftKey && !e.ctrlKey && !e.metaKey) { duplo(e, row, k); return; }
        if (e.shiftKey && VEPJ.foco) {
            const ks = chaves(), a = ks.indexOf(VEPJ.foco), b = ks.indexOf(k);
            VEPJ.sel = new Set(ks.slice(Math.min(a, b), Math.max(a, b) + 1));
        } else if (e.ctrlKey || e.metaKey) {
            VEPJ.sel.has(k) ? VEPJ.sel.delete(k) : VEPJ.sel.add(k);
            VEPJ.foco = k;
        } else { VEPJ.sel = new Set([k]); VEPJ.foco = k; }
        vePjRender();
    });
    const duplo = (e, row, k) => {
        if (k.startsWith('m:')) {
            const m = VE.media[+k.slice(2)];
            if (m && m.kind === 'timeline') { veOpenTimeline(m.sequenceId); return; }
            if (m && m.comp && veCompAbrir(m)) return;   // Comp: abre a timeline dela (editor-comp.js)
            if (m && m.kind === 'cor') { veGrCorEditar(m); return; }   // duplo clique troca a cor
            if (m && veMediaOffline(m)) { vePjRelink(m.id); return; }
            if (m && m.kind === 'video') { veSrcOpen(m.id); return; }
        }
        if (e.target.closest('.ve-pj-nome')) { vePjRenomear(k); return; }
        if (k.startsWith('b:') && row.classList.contains('ve-pj-card')) { vePjAbrirPasta(k.slice(2)); return; }
        if (k.startsWith('b:')) { const b = vePjBin(k.slice(2)); b.aberta = !b.aberta; vePjRender(); }
    };
    lista.addEventListener('contextmenu', e => {
        e.preventDefault();
        const row = e.target.closest('[data-k]');
        if (row && row.dataset.k !== 'raiz' && !VEPJ.sel.has(row.dataset.k)) { VEPJ.sel = new Set([row.dataset.k]); VEPJ.foco = row.dataset.k; vePjRender(); }
        if (!row || row.dataset.k === 'raiz') { VEPJ.sel.clear(); vePjRender(); }
        vePjMenu(e.clientX, e.clientY, lista.ownerDocument);
    });
    // arrastar: para dentro de pastas (no painel) ou para a timeline/monitor
    lista.addEventListener('dragstart', e => {
        const row = e.target.closest('[data-k]');
        if (!row) return;
        if (!VEPJ.sel.has(row.dataset.k)) { VEPJ.sel = new Set([row.dataset.k]); VEPJ.foco = row.dataset.k; }
        e.dataTransfer.setData('text/x-ve-projeto', JSON.stringify([...VEPJ.sel]));
        e.dataTransfer.effectAllowed = 'copyMove';
    });
    lista.addEventListener('dragover', e => {
        if (![...e.dataTransfer.types].includes('text/x-ve-projeto')) return;
        e.preventDefault();
        lista.querySelectorAll('.alvo').forEach(x => x.classList.remove('alvo'));
        const row = e.target.closest('[data-k]');
        (row && row.dataset.k.startsWith('b:') ? row : lista).classList.add('alvo');
    });
    lista.addEventListener('dragleave', e => { if (!lista.contains(e.relatedTarget)) lista.querySelectorAll('.alvo').forEach(x => x.classList.remove('alvo')); lista.classList.remove('alvo'); });
    lista.addEventListener('drop', e => {
        const dados = e.dataTransfer.getData('text/x-ve-projeto');
        lista.querySelectorAll('.alvo').forEach(x => x.classList.remove('alvo'));
        lista.classList.remove('alvo');
        if (!dados) return;
        e.preventDefault();
        e.stopPropagation();
        const row = e.target.closest('[data-k]');
        vePjMover(JSON.parse(dados), row && row.dataset.k.startsWith('b:') ? row.dataset.k.slice(2) : row && row.dataset.k.startsWith('m:') ? VE.media[+row.dataset.k.slice(2)].pasta : vePjPastaVista());
    });
    // atalhos do painel (Ctrl+C/V/X/D, F2, Delete...) não vão para a timeline
    box.addEventListener('keydown', e => {
        if (e.target.matches('input')) { if (e.target.id !== 've-pj-busca') return; if (e.key === 'Escape') { e.target.value = ''; VEPJ.busca = ''; vePjRender(); } e.stopPropagation(); return; }
        const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
        const acoes = {
            'c': ctrl && (() => vePjCopiar('copiar')), 'x': ctrl && (() => vePjCopiar('recortar')), 'v': ctrl && vePjColar,
            'd': ctrl && (() => vePjDuplicar()), 'b': ctrl && vePjNovaPasta, 'i': ctrl && vePjImportarDialogo,
            'n': ctrl && veCreateTimeline,
            'a': ctrl && (() => { VEPJ.sel = new Set(chaves()); vePjRender(); }),
            'f2': !ctrl && VEPJ.foco && (() => vePjRenomear(VEPJ.foco)),
            'delete': !ctrl && (() => vePjApagar()), 'backspace': !ctrl && (() => vePjApagar()),
        };
        const fn = acoes[k];
        if (fn) { e.preventDefault(); e.stopPropagation(); fn(); }
        else if (ctrl && k !== 'z' && k !== 'y' && k !== 's') e.stopPropagation();
    });
    // grade: passar o mouse num card de vídeo percorre as miniaturas (como o Premiere)
    let scrub = null;
    lista.addEventListener('mousemove', e => {
        const card = e.target.closest('.ve-pj-card[data-kind="video"]'), img = card && card.querySelector('.ve-pj-capa img');
        if (scrub && scrub.card !== card) { scrub.img.src = scrub.orig; scrub.card.style.removeProperty('--pj-f'); scrub = null; }
        if (!img) return;
        const r = card.getBoundingClientRect(), f = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width));
        if (!scrub) scrub = { card, img, orig: img.getAttribute('src') };
        const url = vePjCapa(VE.media[+card.dataset.k.slice(2)], f);
        if (url && img.getAttribute('src') !== url) img.src = url;
        card.style.setProperty('--pj-f', f);
    });
    lista.addEventListener('mouseleave', () => { if (scrub) { scrub.img.src = scrub.orig; scrub.card.style.removeProperty('--pj-f'); scrub = null; } });
    box.querySelectorAll('[data-pj-modo]').forEach(b => b.addEventListener('click', () => vePjModo(b.dataset.pjModo)));
    box.querySelector('.ve-pj-tam').addEventListener('input', e => vePjTamanho(e.target.value));
    $ve('ve-pj-busca').addEventListener('input', e => { VEPJ.busca = e.target.value; vePjRender(); });
    box.querySelector('.ve-pj-cab').addEventListener('click', e => {
        const c = e.target.closest('[data-ord]');
        if (!c) return;
        VEPJ.ordem = { col: c.dataset.ord, dir: VEPJ.ordem.col === c.dataset.ord ? -VEPJ.ordem.dir : 1 };
        box.querySelectorAll('[data-ord]').forEach(x => x.dataset.dir = x === c ? (VEPJ.ordem.dir > 0 ? '↑' : '↓') : '');
        vePjRender();
    });

    // soltar itens do painel na timeline ou no monitor
    const alvo = el => {
        el.addEventListener('dragover', e => {
            const tipos = [...e.dataTransfer.types];
            if (tipos.includes('text/x-ve-projeto') || tipos.includes('text/x-ve-source')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
        });
        el.addEventListener('drop', e => {
            const src = e.dataTransfer.getData('text/x-ve-source');
            if (src) {
                e.preventDefault();
                e.stopPropagation();
                veSrcDrop(JSON.parse(src), { x: e.clientX, y: e.clientY, doc: el.ownerDocument });
                return;
            }
            const dados = e.dataTransfer.getData('text/x-ve-projeto');
            if (!dados) return;
            e.preventDefault();
            e.stopPropagation();
            const ids = JSON.parse(dados).filter(k => k.startsWith('m:')).map(k => +k.slice(2));
            // pasta arrastada: tudo o que está dentro dela
            JSON.parse(dados).filter(k => k.startsWith('b:')).forEach(k => {
                const d = vePjDescendentes(k.slice(2));
                vePjMidia().filter(m => d.has(m.pasta)).forEach(m => ids.push(m.id));
            });
            vePjColocar(ids, { x: e.clientX, y: e.clientY });
        });
    };
    alvo($ve('ve-tl-wrap'));
    alvo($ve('ve-screen'));
    vePjRender();
}

// ─────────────────────────── preparar outros vídeos (um por vez) ───────────────────────────
// vídeos em preparação: leitura de 3 em 3 (na ordem da timeline); conversão, miniaturas e áudio
// têm limite próprio no Python (video_cutter: _SEM_PROXY/_SEM_EXTRAS)
const VEPJF = { fila: [], ativos: new Set(), max: 3 };
// urgente = vídeo na timeline (ou pedido agora): passa na frente dos que só estão no painel, aqui e na fila
// de conversão do Python — senão, num projeto com 30 vídeos, o da timeline podia ser o último a tocar.
// Os que só estão no painel vão "leves": dados e miniaturas; a prévia leve sai quando forem usados (veMidiaPriorizar)
function veMidiaPreparar(m, urgente) {
    if (!m || m.kind !== 'video' || !m.id || !m.path) return;
    m.pct = 0;
    delete m.erro;
    delete m.leve;
    if (urgente || veMidiaNaTimeline(m.id)) { m._urgente = true; VEPJF.fila.unshift(m.id); } else VEPJF.fila.push(m.id);
    veMidiaProxima();
}
// a mídia tem clipe em alguma sequência (a aberta ou as outras do projeto)?
function veMidiaNaTimeline(id) {
    if (VE.clips.some(c => veMid(c) === id)) return true;
    return (VE.sequences || []).some(s => s.id !== VE.activeSequence && (s.clips || []).some(c => veMid(c) === id));
}
// Timeline mudou (veRefresh): vídeo que entrou nela e ainda está só com os dados ganha a prévia leve agora
function veMidiaUsadasPreparar() {
    if (typeof VEPJF === 'undefined') return;
    const vistos = new Set();
    VE.clips.forEach(c => {
        const id = veMid(c);
        if (!id || vistos.has(id)) return;
        vistos.add(id);
        const m = VE.media[id];
        if (m && m.leve && !m.url) veMidiaPriorizar(m);
    });
}
function veMidiaProxima() {
    while (VEPJF.ativos.size < VEPJF.max && VEPJF.fila.length) {
        const id = VEPJF.fila.shift(), m = VE.media[id];
        if (!m || m.removido) continue;
        VEPJF.ativos.add(id);
        window.pywebview.api.ve_preparar_midia(m.path, id, !!m._urgente, !m._urgente);
    }
}
function veMidiaPriorizar(m) {
    if (!m) return;
    // só com os dados (vídeo do painel): agora que vai ser usado, pede a prévia leve na frente da fila
    if (m.leve && !m.url && !VEPJF.ativos.has(m.id) && !VEPJF.fila.includes(m.id)) { veMidiaPreparar(m, true); return; }
    if (m._urgente) return;
    m._urgente = true;
    const i = VEPJF.fila.indexOf(m.id);
    if (i > 0) { VEPJF.fila.splice(i, 1); VEPJF.fila.unshift(m.id); }
    const api = window.pywebview && window.pywebview.api;
    if (i < 0 && m.path && api && api.ve_priorizar_midia) api.ve_priorizar_midia(m.path);
}

// Eventos da preparação de um vídeo do projeto (Functions/video_cutter.py: preparar_midia)
function veOnMidia(ev) {
    const m = VE.media[ev.id];
    // a vaga libera quando o vídeo já foi lido (info): as conversões pesadas têm fila própria no Python
    const livre = ev.stage === 'info' || ev.stage === 'video' || ev.stage === 'done' || ev.stage === 'error';
    if (livre && VEPJF.ativos.delete(ev.id)) veMidiaProxima();
    if (!m || m.kind !== 'video') return;
    if (ev.stage === 'info') {
        m.info = ev;
        m.dur = ev.duration;
        if (ev.leve) m.leve = true; else delete m.leve;
        if (m.id === 0) {
            VE.info = ev;
            VE.srcDur = ev.duration;
            VE.fps = ev.fps || VE.fps || 30;
            m.name = m.nome || ev.file_name || m.name;
            delete m.offline; delete m.missing; delete m.lost; delete m.erro;
            const res = ev.width && ev.height ? `${ev.width}×${ev.height}` : '';
            $ve('ve-meta').innerHTML = `<b>${veEsc(ev.file_name || vePjNome(m))}</b> · ${res} · ${(+ev.fps || VE.fps).toFixed(2).replace(/\.00$/, '')} fps · ${veHuman(ev.duration)}${ev.has_audio ? '' : ' · sem áudio'}`;
            if (ev.has_audio) veAudioFonte();
        }
        if (m._insertQueue) veVideoQueueTick(m._insertQueue);
        if (m._insertPending) {
            const drop = m._insertDrop || null;
            delete m._insertPending;
            delete m._insertDrop;
            vePjColocar([m.id], drop);
        }
    } else if (ev.stage === 'proxy') {
        m.pct = ev.pct;
    } else if (ev.stage === 'audio') {
        m.peaks = ev.peaks || [];
        veAudioRegistrar(m.id, ev.url, ev.quadros);
        if (m.id === 0) VE.peaks = m.peaks;
    } else if (ev.stage === 'video') {
        m.url = ev.url;
        m.proxy = ev.proxy;
        m.pct = 100;
        if (m.comp && typeof veCompUrlPronta === 'function') veCompUrlPronta(m);   // Comp: volta a tocar pelo arquivo
        if (m.id === 0) {
            veLoading(null);
            $ve('ve-export-btn').disabled = false;
            $ve('ve-proxy-badge').hidden = !ev.proxy;
        }
        if (typeof VESRC !== 'undefined' && VESRC.id === m.id) veSrcLoad();
        if (VE.clips.some(c => veMid(c) === m.id)) veSyncPlayer(true);
    } else if (ev.stage === 'thumbs') {
        m.thumbs = (ev.thumbs || []).sort((a, b) => a.t - b.t).map(tb => {
            const img = new Image();
            img.onload = veDraw;
            img.src = tb.url;
            return { t: tb.t, url: tb.url, img };
        });
        if (m.id === 0) VE.thumbs = m.thumbs;
    } else if (ev.stage === 'error') {
        m.erro = ev.error || 'erro';
        if (m.id === 0) { m.offline = true; veLoading(null); $ve('ve-export-btn').disabled = true; }
        if (m._insertQueue) {
            const q = m._insertQueue;
            q.ids = q.ids.filter(id => id !== m.id);
            delete m._insertQueue;
            setTimeout(() => veVideoQueueTick(q), 0);
        }
        veToast(`${vePjNome(m)}: ${m.erro}`);
    }
    vePjRender();
    veDraw();
    veDrawMonitorSoon();
}
window.veOnMidia = veOnMidia;

// ─────────────────────────── Source monitor (duplo clique no Project) ───────────────────────────
const VESRC = { id: null, video: null, inPt: null, outPt: null };

function veSrcOpen(id) {
    const m = VE.media[id];
    if (!m || m.kind !== 'video') return;
    if (veMediaOffline(m)) { vePjRelink(id); return; }
    let md = $ve('ve-source');
    if (!md) {
        md = document.createElement('div');
        md.className = 've-modal';
        md.id = 've-source';
        md.hidden = true;
        md.innerHTML = `<div class="ve-modal-box ve-src-box" tabindex="0">
            <div class="ve-modal-head"><span id="ve-src-title">Source</span><button class="ve-icon-btn" data-src="fechar" title="Fechar (Esc)"><svg class="i"><use href="#i-x"/></svg></button></div>
            <div class="ve-modal-body ve-src-body">
                <div class="ve-src-screen"><video id="ve-src-video" preload="auto" playsinline></video><div class="ve-src-wait" id="ve-src-wait">Preparando prévia...</div></div>
                <div class="ve-src-range"><span id="ve-src-cur">0:00.00</span><input type="range" id="ve-src-seek" min="0" max="1000" value="0"><span id="ve-src-dur">0:00.00</span></div>
                <div class="ve-src-marks"><span>In <b class="ve-src-mark" id="ve-src-in">--:--</b></span><span>Out <b class="ve-src-mark" id="ve-src-out">--:--</b></span><span id="ve-src-len"></span></div>
            </div>
            <div class="ve-modal-foot ve-src-actions">
                <button class="ve-btn ve-btn-sm ve-src-play" data-src="play" id="ve-src-play" title="Reproduzir/Pausar (Espaço)">▶</button>
                <button class="ve-btn ve-btn-sm" data-src="in">{ In</button>
                <button class="ve-btn ve-btn-sm" data-src="out">Out }</button>
                <button class="ve-btn ve-btn-sm ve-btn-ghost" data-src="limpar">Limpar</button>
                <span class="ve-top-spacer"></span>
                <span class="ve-src-arrastes" title="Arraste para a timeline">
                    <button class="ve-src-drag" draggable="true" data-parte="av" title="Arrastar imagem e áudio"><svg class="i"><use href="#i-film"/></svg><svg class="i"><use href="#i-volume"/></svg></button>
                    <button class="ve-src-drag" draggable="true" data-parte="v" title="Arrastar só a imagem"><svg class="i"><use href="#i-film"/></svg></button>
                    <button class="ve-src-drag" draggable="true" data-parte="a" title="Arrastar só o áudio"><svg class="i"><use href="#i-volume"/></svg></button>
                </span>
                <button class="ve-btn ve-btn-sm ve-btn-primary" data-src="insert">Inserir</button>
            </div>
        </div>`;
        $ve('ve').appendChild(md);
        VESRC.video = md.querySelector('#ve-src-video');
        md.addEventListener('click', veSrcClick);
        md.addEventListener('keydown', veSrcKey);
        md.querySelector('#ve-src-seek').addEventListener('input', e => {
            if (VESRC.video.duration) VESRC.video.currentTime = (+e.target.value / 1000) * VESRC.video.duration;
        });
        // imagem e áudio / só a imagem / só o áudio (como os ícones embaixo do monitor Source do Premiere)
        md.querySelectorAll('.ve-src-drag').forEach(b => b.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/x-ve-source', JSON.stringify({ ...veSrcPayload(), parte: b.dataset.parte }));
            e.dataTransfer.effectAllowed = 'copy';
        }));
        VESRC.video.addEventListener('timeupdate', veSrcRender);
        VESRC.video.addEventListener('loadedmetadata', veSrcRender);
        VESRC.video.addEventListener('play', veSrcRender);
        VESRC.video.addEventListener('pause', veSrcRender);
        VESRC.video.addEventListener('ended', veSrcRender);
        VESRC.video.addEventListener('click', veSrcTogglePlay);
    }
    VESRC.id = id;
    VESRC.inPt = m.srcIn ?? null;
    VESRC.outPt = m.srcOut ?? null;
    md.querySelector('#ve-src-title').textContent = vePjNome(m);
    md.hidden = false;
    veSrcLoad();
    md.querySelector('.ve-src-box').focus();
}

function veSrcLoad() {
    const m = VE.media[VESRC.id], v = VESRC.video, wait = $ve('ve-src-wait');
    if (!m || !v) return;
    wait.hidden = !!m.url;
    if (m.url && v.getAttribute('src') !== m.url) { v.src = m.url; v.load(); }
    if (!m.url && m.id) veVideoPrepararSePrecisa(m);
    veSrcRender();
}

function veSrcClose() {
    const md = $ve('ve-source');
    if (!md) return;
    VESRC.video.pause();
    md.hidden = true;
}

function veSrcDur() {
    const m = VE.media[VESRC.id];
    return (m && (m.info && m.info.duration || m.dur)) || VESRC.video.duration || 0;
}

function veSrcPayload() {
    const dur = veSrcDur(), a = VESRC.inPt ?? 0, b = VESRC.outPt ?? dur;
    return { id: VESRC.id, srcIn: Math.max(0, Math.min(dur, a)), srcOut: Math.max(0, Math.min(dur, b)) };
}

function veSrcDrop(p, drop) {
    const m = VE.media[p.id];
    if (!m || m.kind !== 'video') return;
    const antes = VE.clips.length;
    vePjColocar([m.id], { ...(drop || {}), srcIn: p.srcIn, srcOut: p.srcOut, parte: p.parte });
    if (VE.clips.length > antes) veSrcClose();   // entrou na timeline: o Source fecha sozinho
}

function veSrcTogglePlay() {
    if (!VESRC.video) return;
    if (VESRC.video.paused) VESRC.video.play().catch(() => {});
    else VESRC.video.pause();
    veSrcRender();
}

function veSrcClick(e) {
    const b = e.target.closest('[data-src]');
    if (!b) { if (e.target.id === 've-source') veSrcClose(); return; }
    const m = VE.media[VESRC.id], t = VESRC.video.currentTime || 0;
    if (b.dataset.src === 'fechar') veSrcClose();
    else if (b.dataset.src === 'play') veSrcTogglePlay();
    else if (b.dataset.src === 'in') { VESRC.inPt = t; if (VESRC.outPt != null && VESRC.outPt <= t) VESRC.outPt = null; }
    else if (b.dataset.src === 'out') { VESRC.outPt = t; if (VESRC.inPt != null && VESRC.inPt >= t) VESRC.inPt = null; }
    else if (b.dataset.src === 'limpar') { VESRC.inPt = VESRC.outPt = null; }
    else if (b.dataset.src === 'insert') veSrcDrop(veSrcPayload(), null);
    if (m) { m.srcIn = VESRC.inPt; m.srcOut = VESRC.outPt; }
    veSrcRender();
}

function veSrcKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); veSrcClose(); return; }
    if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); veSrcTogglePlay(); return; }
    if (e.key.toLowerCase() === 'i') { e.preventDefault(); e.stopPropagation(); veSrcClick({ target: { closest: () => ({ dataset: { src: 'in' } }) } }); return; }
    if (e.key.toLowerCase() === 'o') { e.preventDefault(); e.stopPropagation(); veSrcClick({ target: { closest: () => ({ dataset: { src: 'out' } }) } }); }
}

function veSrcRender() {
    const md = $ve('ve-source');
    if (!md || md.hidden || !VESRC.video) return;
    const dur = veSrcDur(), cur = VESRC.video.currentTime || 0;
    const p = veSrcPayload();
    const pct = v => dur ? Math.max(0, Math.min(100, v / dur * 100)) : 0;
    md.querySelector('#ve-src-cur').textContent = veShort(cur);
    md.querySelector('#ve-src-dur').textContent = veShort(dur);
    const seek = md.querySelector('#ve-src-seek');
    seek.value = dur ? Math.round(cur / dur * 1000) : 0;
    const a = pct(p.srcIn), b = pct(p.srcOut);
    seek.style.background = `linear-gradient(to right, #3b3b3b 0%, #3b3b3b ${a}%, var(--ve-accent) ${a}%, var(--ve-accent) ${b}%, #3b3b3b ${b}%, #3b3b3b 100%)`;
    md.querySelector('#ve-src-in').textContent = VESRC.inPt == null ? '--:--' : veShort(VESRC.inPt);
    md.querySelector('#ve-src-out').textContent = VESRC.outPt == null ? '--:--' : veShort(VESRC.outPt);
    md.querySelector('#ve-src-len').textContent = p.srcOut > p.srcIn ? `Trecho ${veShort(p.srcOut - p.srcIn)}` : '';
    const play = md.querySelector('#ve-src-play');
    if (play) play.textContent = VESRC.video.paused ? '▶' : '❚❚';
    const m = VE.media[VESRC.id], wait = md.querySelector('#ve-src-wait');
    if (wait) wait.hidden = !!(m && m.url);
}

// Arquivos do Windows soltos em cima do painel: vão para o projeto (na pasta sob o cursor), não para a timeline
function vePjSoltouAqui(drop) {
    const box = $ve('ve-pj');
    const doc = drop && drop.doc || document;
    if (!box || !drop || box.ownerDocument !== doc) return null;
    const r = box.getBoundingClientRect();
    if (!r.width || drop.x < r.left || drop.x > r.right || drop.y < r.top || drop.y > r.bottom) return null;
    const el = doc.elementFromPoint(drop.x, drop.y), row = el && el.closest('[data-k]');
    return { pasta: row && row.dataset.k.startsWith('b:') ? row.dataset.k.slice(2) : row && row.dataset.k.startsWith('m:') ? (VE.media[+row.dataset.k.slice(2)] || {}).pasta || null : vePjPastaVista() };
}

document.addEventListener('DOMContentLoaded', vePjInit);
