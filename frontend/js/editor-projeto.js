// =========================================================
// Pocket Editor — painel Projeto (como o Project do Premiere): os materiais do projeto
// Tudo o que o projeto usa ou vai usar: o vídeo, imagens, áudios, camadas de ajuste, legendas (.srt) e outros
// vídeos, organizados em pastas (bins). Recebe arquivos e pastas arrastados do Windows (ou Importar); dá para
// criar pastas, arrastar itens para dentro delas, recortar/copiar/colar, duplicar, renomear, dar cor e apagar.
// Arrastar um item para a timeline (ou para o monitor) coloca ele na sequência.
// Dados: VE.media[id] ganha pasta (id da pasta), cor e nome (renomeado); VE.bins = [{id, nome, pai, cor, aberta}].
// O id da mídia é o índice em VE.media: apagar do projeto marca removido (não reordena).
// =========================================================

const VEPJ = { sel: new Set(), foco: null, busca: '', clip: null, ordem: { col: 'nome', dir: 1 }, conf: 0, nBin: 0 };

const VE_PJ_TIPOS = {
    video: ['i-film', 'Vídeo'], video2: ['i-film', 'Vídeo'], image: ['i-image', 'Imagem'], audio: ['i-music', 'Áudio'],
    ajuste: ['i-sliders', 'Camada de ajuste'], legenda: ['i-captions', 'Legendas'],
};
const VE_EXT_SRT = /\.srt$/i;

const vePjMidia = () => VE.media.filter(m => m && !m.removido && VE_PJ_TIPOS[m.kind]);
const vePjNome = m => m.nome || m.name || VE_PJ_TIPOS[m.kind][1];
const vePjBin = id => (VE.bins || []).find(b => b.id === id);
const vePjUso = m => VE.clips.filter(c => (c.m || 0) === m.id).length;
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
    if (m.kind === 'video' && VE.info) return { dur: VE.srcDur, info: `${VE.info.width}×${VE.info.height} · ${String(+(VE.fps || 30).toFixed(2)).replace('.', ',')} qps` };
    if (m.kind === 'image') return { dur: null, info: m.w ? `${m.w}×${m.h}` : '' };
    if (m.kind === 'audio') return { dur: m.dur || null, info: '48 kHz' };
    if (m.kind === 'legenda') return { dur: m.itens && m.itens.length ? m.itens[m.itens.length - 1].en : null, info: `${(m.itens || []).length} legendas` };
    if (m.kind === 'video2') return { dur: null, info: 'ainda não entra na timeline' };
    return { dur: null, info: '' };
}

// ─────────────────────────── lista ───────────────────────────
function vePjFilhos(pai) {
    const bins = (VE.bins || []).filter(b => (b.pai || null) === pai);
    const med = vePjMidia().filter(m => vePjPastaDe(m) === pai);
    const { col, dir } = VEPJ.ordem;
    const chave = m => col === 'tipo' ? VE_PJ_TIPOS[m.kind][1] : col === 'dur' ? (vePjInfo(m).dur || 0) : vePjNome(m).toLowerCase();
    bins.sort((a, b) => a.nome.localeCompare(b.nome) * (col === 'nome' ? dir : 1));
    med.sort((a, b) => { const x = chave(a), y = chave(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    return { bins, med };
}

function vePjLinhaMidia(m, nivel) {
    const k = 'm:' + m.id, [ic, tipo] = VE_PJ_TIPOS[m.kind], inf = vePjInfo(m), uso = vePjUso(m);
    const cor = m.cor ? veCor({ cor: m.cor }) : null;
    return `<div class="ve-pj-row${VEPJ.sel.has(k) ? ' sel' : ''}${m.kind === 'video2' ? ' fraco' : ''}" data-k="${k}" draggable="true" style="--n:${nivel}">
        <span class="ve-pj-cor"${cor ? ` style="background:${cor}"` : ''}></span><span class="ve-pj-seta"></span>
        <svg class="i"><use href="#${ic}"/></svg><span class="ve-pj-nome" title="${veEsc(m.path || vePjNome(m))}">${veEsc(vePjNome(m))}</span>
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

function vePjRender() {
    const box = $ve('ve-pj-lista');
    if (!box) return;
    const total = vePjMidia().length + (VE.bins || []).length;
    $ve('ve-pj-conta').textContent = VEPJ.sel.size ? `${VEPJ.sel.size} de ${total} selecionado(s)` : `${total} ${total === 1 ? 'item' : 'itens'}`;
    $ve('ve-pj-proj').textContent = VE.projectPath ? VE.projectPath.split(/[\\/]/).pop() : (VE.ready ? veT('Projeto não salvo') : '');
    if (!VE.ready) { box.innerHTML = `<div class="ve-clips-empty">${veT('Abra um vídeo para começar. Depois arraste para cá imagens, áudios, legendas (.srt), outros vídeos e pastas inteiras.')}</div>`; return; }
    const q = VEPJ.busca.trim().toLowerCase();
    if (q) {
        const achados = vePjMidia().filter(m => vePjNome(m).toLowerCase().includes(q));
        box.innerHTML = achados.length ? achados.map(m => vePjLinhaMidia(m, 0)).join('') : `<div class="ve-clips-empty">${veT('Nada encontrado')}</div>`;
        return;
    }
    box.innerHTML = vePjArvore(null, 0) + '<div class="ve-pj-fim" data-k="raiz"></div>';
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
    if (VE_EXT_SRT.test(path)) {
        const r = await api.ve_ler_srt(path);
        if (!r || !r.success || !r.itens.length) return false;
        vePjAddMidia({ kind: 'legenda', path, name: nome, itens: r.itens }, pasta);
        return true;
    }
    if (EXT_VIDEO.test(path)) {
        if (path === VE.path) return false;
        vePjAddMidia({ kind: 'video2', path, name: nome }, pasta);
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
    if (!k) return null;
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
        if (ok && v) { if (b) b.nome = v; else m.nome = v; vePjAlterou(); } else vePjRender();
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
    inp.addEventListener('blur', () => fim(true));
}

function vePjCopiaMidia(m, pasta) {
    const n = vePjAddMidia({ ...m, nome: `${vePjNome(m)} ${veT('cópia')}`, itens: m.itens ? m.itens.map(x => ({ ...x })) : undefined }, pasta);
    delete n.removido;
    if (n.kind === 'audio' && n.url) veAudioRegistrar(n.id, n.url, n.quadros);
    if (n.kind === 'video2' || n.kind === 'video') n.kind = n.kind === 'video' ? 'video2' : n.kind;   // o vídeo aberto é um só
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
    if (midias.has(0)) { veToast('O vídeo principal do projeto não pode ser apagado'); midias.delete(0); if (!midias.size && !bins.size) return; }
    const usados = VE.clips.filter(c => midias.has(c.m || 0)).length;
    // em uso na timeline: pede confirmação (clicar/apertar de novo), como o aviso do Premiere
    if (usados && !(VEPJ.conf && Date.now() - VEPJ.conf < 5000)) {
        VEPJ.conf = Date.now();
        veToast(`${usados} clipe(s) da timeline usam esse material e sairão junto. Apague de novo para confirmar.`);
        return;
    }
    VEPJ.conf = 0;
    if (usados) {
        vePushHistory();
        VE.clips = VE.clips.filter(c => !midias.has(c.m || 0));
        VE.sel = -1;
        veRelayout();
        veAfterEdit(Math.min(VE.playhead, VE.dur));
    }
    midias.forEach(id => { VE.media[id].removido = true; });
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

// ─────────────────────────── para a timeline ───────────────────────────
// ids arrastados do painel e soltos em (x, y) da tela: cada item entra no ponto/trilha do soltar (os seguintes, em fila)
function vePjColocar(ids, drop) {
    if (!VE.ready) return;
    const wrap = $ve('ve-tl-wrap').getBoundingClientRect();
    const naTl = drop && drop.x >= wrap.left && drop.x <= wrap.right && drop.y >= wrap.top + VE_RULER && drop.y <= wrap.bottom;
    let t = naTl ? Math.max(0, VE.view + (drop.x - wrap.left) / VE.pps) : VE.playhead;
    const row = naTl ? veRowAt(drop.y - wrap.top) : null;
    let colocados = 0;
    ids.map(id => VE.media[id]).filter(m => m && !m.removido).forEach(m => {
        const st = veSnapFrame(t);
        if (m.kind === 'image' || m.kind === 'ajuste') {
            veInsertImageClip(m, naTl ? { x: wrap.left + (st - VE.view) * VE.pps, y: drop.y, at: Date.now() } : null, 0,
                m.kind === 'ajuste' ? 'Camada de ajuste adicionada' : 'Imagem adicionada', false);
            const c = VE.clips[VE.sel];
            if (c && m.cor) c.cor = m.cor;
            t = st + VE_IMG_DUR; colocados++;
        } else if (m.kind === 'video') {
            const tr = row && row.kind !== 'l' ? veTrackIndex(row) : 0;
            if (veTrkLocked(tr)) { veAvisoBloqueio(); return; }
            vePushHistory();
            const clip = { tr, st, s: 0, e: VE.srcDur };
            if (m.cor) clip.cor = m.cor;
            vePlaceClip(clip);
            veAfterEdit(VE.playhead);
            t = st + VE.srcDur; colocados++;
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
        } else if (m.kind === 'video2') {
            veToast('Por enquanto só o vídeo principal entra na timeline (vários vídeos por projeto vem em breve)');
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
        tr = [0, 1, 2, 3].find(k => k > ultima && livre(k));
        if (tr == null) tr = [0, 1, 2, 3].find(livre);
    }
    if (tr == null || tr < 0) { veToast('Não há trilha de áudio livre nesse ponto (A1 a A4)'); return false; }
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
    const m = doc.createElement('div');
    m.className = 've-ctx';
    m.innerHTML = `
        ${keys.length ? `<div class="ve-ctx-sub">Cor do rótulo</div>
        <div class="ve-ctx-cores">
            <button class="ve-ctx-cor padrao" data-cor="" title="Padrão"></button>
            ${VE_CORES.map(([k, nome, hex]) => `<button class="ve-ctx-cor" data-cor="${k}" title="${nome}" style="--c:${hex}"></button>`).join('')}
        </div><div class="ve-ctx-sep"></div>` : ''}
        ${um ? '<button class="ve-ctx-item" data-pj="ren">Renomear<kbd>F2</kbd></button>' : ''}
        ${keys.length ? `<button class="ve-ctx-item" data-pj="dup">Duplicar<kbd>Ctrl+D</kbd></button>
        <button class="ve-ctx-item" data-pj="cut">Recortar<kbd>Ctrl+X</kbd></button>
        <button class="ve-ctx-item" data-pj="copy">Copiar<kbd>Ctrl+C</kbd></button>` : ''}
        <button class="ve-ctx-item" data-pj="paste"${VEPJ.clip ? '' : ' disabled'}>Colar<kbd>Ctrl+V</kbd></button>
        <div class="ve-ctx-sep"></div>
        <button class="ve-ctx-item" data-pj="bin">Nova pasta<kbd>Ctrl+B</kbd></button>
        <button class="ve-ctx-item" data-pj="aj">Nova camada de ajuste</button>
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
            copy: () => vePjCopiar('copiar'), paste: vePjColar, bin: vePjNovaPasta, aj: vePjNovoAjuste, imp: vePjImportarDialogo,
            del: () => vePjApagar(keys) })[it.dataset.pj]();
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
        const row = e.target.closest('[data-k]');
        if (e.target.closest('[data-seta]')) { const b = vePjBin(row.dataset.k.slice(2)); b.aberta = !b.aberta; vePjRender(); return; }
        if (!row || row.dataset.k === 'raiz') { VEPJ.sel.clear(); VEPJ.foco = null; vePjRender(); return; }
        const k = row.dataset.k;
        if (e.shiftKey && VEPJ.foco) {
            const ks = chaves(), a = ks.indexOf(VEPJ.foco), b = ks.indexOf(k);
            VEPJ.sel = new Set(ks.slice(Math.min(a, b), Math.max(a, b) + 1));
        } else if (e.ctrlKey || e.metaKey) {
            VEPJ.sel.has(k) ? VEPJ.sel.delete(k) : VEPJ.sel.add(k);
            VEPJ.foco = k;
        } else { VEPJ.sel = new Set([k]); VEPJ.foco = k; }
        vePjRender();
    });
    lista.addEventListener('dblclick', e => {
        const row = e.target.closest('[data-k]');
        if (!row || row.dataset.k === 'raiz') return;
        const k = row.dataset.k;
        if (e.target.closest('.ve-pj-nome')) { vePjRenomear(k); return; }
        if (k.startsWith('b:')) { const b = vePjBin(k.slice(2)); b.aberta = !b.aberta; vePjRender(); }
    });
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
        vePjMover(JSON.parse(dados), row && row.dataset.k.startsWith('b:') ? row.dataset.k.slice(2) : row && row.dataset.k.startsWith('m:') ? VE.media[+row.dataset.k.slice(2)].pasta : null);
    });
    // atalhos do painel (Ctrl+C/V/X/D, F2, Delete...) não vão para a timeline
    box.addEventListener('keydown', e => {
        if (e.target.matches('input')) { if (e.target.id !== 've-pj-busca') return; if (e.key === 'Escape') { e.target.value = ''; VEPJ.busca = ''; vePjRender(); } e.stopPropagation(); return; }
        const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
        const acoes = {
            'c': ctrl && (() => vePjCopiar('copiar')), 'x': ctrl && (() => vePjCopiar('recortar')), 'v': ctrl && vePjColar,
            'd': ctrl && (() => vePjDuplicar()), 'b': ctrl && vePjNovaPasta, 'i': ctrl && vePjImportarDialogo,
            'a': ctrl && (() => { VEPJ.sel = new Set(chaves()); vePjRender(); }),
            'f2': !ctrl && VEPJ.foco && (() => vePjRenomear(VEPJ.foco)),
            'delete': !ctrl && (() => vePjApagar()), 'backspace': !ctrl && (() => vePjApagar()),
        };
        const fn = acoes[k];
        if (fn) { e.preventDefault(); e.stopPropagation(); fn(); }
        else if (ctrl && k !== 'z' && k !== 'y' && k !== 's') e.stopPropagation();
    });
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
        el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-ve-projeto')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
        el.addEventListener('drop', e => {
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

// Arquivos do Windows soltos em cima do painel: vão para o projeto (na pasta sob o cursor), não para a timeline
function vePjSoltouAqui(drop) {
    const box = $ve('ve-pj');
    if (!box || !drop || box.ownerDocument !== document) return null;
    const r = box.getBoundingClientRect();
    if (!r.width || drop.x < r.left || drop.x > r.right || drop.y < r.top || drop.y > r.bottom) return null;
    const el = document.elementFromPoint(drop.x, drop.y), row = el && el.closest('[data-k]');
    return { pasta: row && row.dataset.k.startsWith('b:') ? row.dataset.k.slice(2) : row && row.dataset.k.startsWith('m:') ? (VE.media[+row.dataset.k.slice(2)] || {}).pasta || null : null };
}

document.addEventListener('DOMContentLoaded', vePjInit);
