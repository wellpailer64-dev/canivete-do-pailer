// =========================================================
// Pocket Editor — faixas (trilhas) da timeline: botão direito no cabeçalho (V1, A1...) → Adicionar faixa acima,
// Excluir esta faixa, Excluir faixas vazias. Também usadas pelo "Agrupar cenas em Comps" (editor-comp-passa.js).
// O número da trilha é o mesmo para o vídeo e o som de um clipe com áudio (c.tr): mexer só nas faixas de vídeo
// renumera só os clipes de vídeo; se um clipe com som (vídeo + áudio na mesma trilha) estiver no caminho, as duas
// listas andam juntas. Nada muda de ordem na pilha e cada clipe continua com o estado da trilha dele (olho, volume,
// pan, rack, nome). Desfazer volta as faixas junto (VE_TRK.ver no veSnapshot).
// =========================================================

const veTrkOcupa = (c, kind) => (kind === 'v' ? veOcupaV(c) : veOcupaA(c));
const veTrkVazia = (kind, k) => !VE.clips.some(c => c.tr === k && veTrkOcupa(c, kind));

// Insere (delta +1, faixa nova vazia no índice k) ou remove (delta −1, a faixa k precisa estar vazia) uma faixa.
// Devolve false se não deu (clipe com som no caminho e a outra faixa k ocupada).
function veTrkMexer(kind, k, delta) {
    const outro = kind === 'v' ? 'a' : 'v';
    const anda = c => (delta > 0 ? c.tr >= k : c.tr > k);
    const ambos = VE.clips.some(c => anda(c) && veOcupaV(c) && veOcupaA(c));
    if (delta < 0 && (!veTrkVazia(kind, k) || (ambos && !veTrkVazia(outro, k)))) return false;
    VE.clips.forEach(c => { if (anda(c) && (ambos || veTrkOcupa(c, kind))) c.tr += delta; });
    (ambos ? ['v', 'a'] : [kind]).forEach(x => {
        const arr = VE_TRK[x];
        while (arr.length < k) arr.push({});
        if (delta > 0) arr.splice(k, 0, {}); else arr.splice(k, 1);
    });
    VE_TRK.ver = (VE_TRK.ver || 0) + 1;
    return true;
}

function veTrkDepois(msg) {
    // as faixas vazias que sobram em cima (vídeo e áudio têm o mesmo número de linhas) saem
    const usadas = Math.max(VE_MIN_TRACKS, veMaxClipTrack());
    ['v', 'a'].forEach(x => {
        const arr = VE_TRK[x];
        while (arr.length > usadas && !Object.keys(arr[arr.length - 1] || {}).length) arr.pop();
    });
    veEnsureTracks(veTrackCount());
    veRebuildTracks(veTrackCount());
    veBuildHeads();
    veClampVScroll();
    veRelayout();
    veSeqSalvarAtiva();
    veAfterEdit(VE.playhead);
    if (msg) veToast(msg);
}

// Faixa nova logo acima da clicada (vídeo: Vk+2; áudio: entre A(k) e A(k+1), as de baixo descem)
function veTrkAdicionar(kind, k) {
    if (!VE.ready) return;
    vePushHistory();
    const idx = kind === 'v' ? k + 1 : k;
    veTrkMexer(kind, idx, 1);
    veTrkDepois(`${veT('Faixa adicionada')}: ${veTrackId(kind, idx)}`);
}

// Apaga os clipes da linha (vídeo ou áudio) e a faixa. Clipe com som numa faixa de vídeo: só o vídeo sai, o som fica.
function veTrkExcluir(kind, k) {
    if (!VE.ready) return;
    if (veTrkLocked(k)) { veAvisoBloqueio(); return; }
    vePushHistory();
    let n = 0;
    VE.clips = VE.clips.filter(c => {
        if (c.tr !== k || !veTrkOcupa(c, kind)) return true;
        n++;
        if (veOcupaV(c) && veOcupaA(c)) { c.x = kind === 'v' ? 'a' : 'v'; return true; }
        return false;
    });
    VE.sel = -1;
    if (typeof veSelDefinir === 'function') veSelDefinir([], null);
    const ok = veTrkMexer(kind, k, -1);
    veTrkDepois(`${veT('Faixa excluída')}: ${veTrackId(kind, k)}${n ? ` · ${n} ${veT(n === 1 ? 'clipe' : 'clipes')}` : ''}` +
        (ok ? '' : ` · ${veT('a faixa ficou (um clipe com som usa o mesmo número)')}`) + ` · ${veT('Ctrl+Z desfaz')}`);
}

// Tira as faixas sem nada (vídeo e áudio), de cima para baixo; V1/A1 e as bloqueadas ficam. semAviso: devolve o nº.
// semHistorico: parte de uma edição maior que já guardou o desfazer (Agrupar cenas)
function veTrkExcluirVazias(semAviso, semHistorico) {
    if (!VE.ready) return 0;
    const comeco = veSnapshot();
    let n = 0;
    ['v', 'a'].forEach(kind => {
        for (let k = veTrackCount() - 1; k >= 1; k--) {
            if (veTrkLocked(k) || !veTrkVazia(kind, k)) continue;
            // acima da última usada: só encurta a lista (não conta como faixa excluída)
            const ultima = VE.clips.reduce((m, c) => (veTrkOcupa(c, kind) ? Math.max(m, c.tr) : m), 0);
            if (veTrkMexer(kind, k, -1) && k < ultima) n++;
        }
    });
    if (n && !semHistorico) {
        VE.history.push(comeco);
        if (VE.history.length > 200) VE.history.shift();
        VE.future = [];
        VE.dirty = true;
        veUpdateTitle();
    }
    if (!semAviso) veTrkDepois(n ? `${n} ${veT(n === 1 ? 'faixa vazia excluída' : 'faixas vazias excluídas')}` : veT('Nenhuma faixa vazia'));
    else if (n) veTrkDepois();
    return n;
}

function veTrkMenu(kind, k, x, y, doc) {
    veClipMenuFechar();
    const id = veTrackId(kind, k), vazia = veTrkVazia(kind, k);
    const m = doc.createElement('div');
    m.className = 've-ctx';
    m.innerHTML = `
        <div class="ve-ctx-title">${veT('Faixa')} ${id}${vazia ? ` · ${veT('vazia')}` : ''}</div>
        <button class="ve-ctx-item" data-tm="add">${veT('Adicionar faixa acima')}</button>
        <button class="ve-ctx-item" data-tm="nome">${veT('Dar nome à faixa')}<kbd>Alt+duplo clique</kbd></button>
        <div class="ve-ctx-sep"></div>
        <button class="ve-ctx-item" data-tm="vazias">${veT('Excluir faixas vazias')}</button>
        <button class="ve-ctx-item perigo" data-tm="del">${veT('Excluir esta faixa')}${vazia ? '' : ` (${veT('e os clipes dela')})`}</button>`;
    doc.body.appendChild(m);
    veCtxPosicionar(m, x, y, doc);
    m.addEventListener('click', e => {
        const it = e.target.closest('[data-tm]');
        if (!it) return;
        veClipMenuFechar();
        const a = it.dataset.tm;
        if (a === 'add') veTrkAdicionar(kind, k);
        else if (a === 'del') veTrkExcluir(kind, k);
        else if (a === 'vazias') veTrkExcluirVazias();
        else if (a === 'nome') { const sp = $ve('ve-heads-rows').querySelector(`[data-hnome="${k}"][data-hkind="${kind}"]`); if (sp) veTrackRenomear(sp); }
    });
    const fora = e => { if (!m.contains(e.target)) veClipMenuFechar(); };
    const tecla = e => { if (e.key === 'Escape') veClipMenuFechar(); };
    setTimeout(() => { doc.addEventListener('pointerdown', fora, true); doc.addEventListener('keydown', tecla, true); }, 0);
    VE._ctx = { m, fechar: () => { doc.removeEventListener('pointerdown', fora, true); doc.removeEventListener('keydown', tecla, true); m.remove(); } };
}

// Botão direito no cabeçalho de uma faixa de vídeo/áudio (o das legendas tem o menu dele: veLegMenu)
function veTrkMenuLigar() {
    const box = $ve('ve-heads-rows');
    if (!box || box._trkMenu) return;
    box._trkMenu = true;
    box.addEventListener('contextmenu', e => {
        const row = e.target.closest('[data-tr]');
        if (!row || row.classList.contains('ve-head-l')) return;
        const tr = VE_TRACKS[+row.dataset.tr];
        if (!tr || (tr.kind !== 'v' && tr.kind !== 'a')) return;
        e.preventDefault();
        veTrkMenu(tr.kind, veTrackIndex(tr), e.clientX, e.clientY, e.target.ownerDocument);
    });
}
