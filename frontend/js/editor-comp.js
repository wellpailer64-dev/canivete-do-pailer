// =========================================================
// Pocket Editor — Comp (composição, como a do After Effects)
// Camadas selecionadas → botão direito "Criar Comp…" (Ctrl+Shift+C): saem da timeline e vão para uma timeline
// própria (VE.sequences[] com comp: true), com o mesmo tempo relativo; no lugar fica UMA faixa.
// Duplo clique na faixa (ou no item laranja do painel Projeto) abre a Comp numa aba; mudou lá → a mãe atualiza.
//
// Por baixo, a Comp é uma mídia de vídeo { kind: 'video', comp: true, sequenceId } cujo arquivo é a própria Comp
// renderizada com fundo transparente (ProRes 4444 .mov, com o som de dentro — render_cache.renderizar_comp).
// Assim, na mãe, ela é um clipe como outro: cortar, mover, velocidade, efeitos, transições, opacidade, escala,
// mesclagem, quadros-chave, Comp dentro de Comp. Prévia e play usam a prévia com alfa (VP9) do vídeo.
// O arquivo tem o nome do hash do conteúdo (veCompSig): abrir a mãe, exportar ou abrir o projeto confere e
// renderiza de novo só a Comp que mudou (de dentro para fora). Desfazer volta a achar o arquivo antigo.
// =========================================================

const VE_COMP_COR = 'laranja';
const VECOMP = { atual: null, falhas: new Map(), espera: [], ui: 0 };

const veEhComp = m => !!(m && m.comp && m.kind === 'video');
const veCompSeqDe = m => (VE.sequences || []).find(s => s.id === (m && m.sequenceId)) || null;
function veCompMidias() { return (VE.media || []).filter(m => veEhComp(m) && !m.removido); }

// ── a timeline da Comp no lugar da ativa, só durante fn (síncrono): plano de exportação, mix, etc. ──
function veCompComo(seq, fn) {
    const g = { clips: VE.clips, trk: VE_TRK, leg: VE.legendas, legE: VE.legEstilo, legG: VE.legGravar, inPt: VE.inPt,
                outPt: VE.outPt, dur: VE.dur, w: VE.seqW, h: VE.seqH, master: VE.master, sel: VE.sel, selx: VE.selx };
    try {
        VE.clips = seq.clips || [];
        VE_TRK = veSeqTracks(seq.trilhas, VE.clips);
        VE.legendas = seq.legendas || [];
        VE.legEstilo = seq.legEstilo || null;
        VE.legGravar = seq.legGravar !== false;
        VE.inPt = VE.outPt = null;
        VE.dur = Math.max(veSeqDur(seq), +seq.dur || 0);
        VE.master = seq.master || null;
        VE.sel = -1;
        VE.selx = null;
        if (seq.w > 0 && seq.h > 0) { VE.seqW = seq.w; VE.seqH = seq.h; }
        return fn();
    } finally {
        Object.assign(VE, { clips: g.clips, legendas: g.leg, legEstilo: g.legE, legGravar: g.legG, inPt: g.inPt, outPt: g.outPt,
                            dur: g.dur, seqW: g.w, seqH: g.h, master: g.master, sel: g.sel, selx: g.selx });
        VE_TRK = g.trk;
    }
}

// ── Comp contém (direta ou indiretamente) a timeline alvo? (uma Comp não pode entrar nela mesma) ──
function veCompContem(seqId, alvo, vistos = new Set()) {
    if (seqId === alvo) return true;
    if (vistos.has(seqId)) return false;
    vistos.add(seqId);
    const seq = (VE.sequences || []).find(s => s.id === seqId);
    const clips = seqId === VE.activeSequence ? VE.clips : (seq && seq.clips) || [];
    return clips.some(c => { const m = VE.media[c.m || 0]; return veEhComp(m) && veCompContem(m.sequenceId, alvo, vistos); });
}

// ─────────────────────────── criar ───────────────────────────
function veCompNomeLivre() {
    const usados = new Set((VE.media || []).filter(m => m && !m.removido).map(m => m.nome || m.name));
    let n = 1;
    while (usados.has(`Comp ${n}`)) n++;
    return `Comp ${n}`;
}

function veCompDialogo() {
    if (!VE.ready) return;
    const sel = veSelLista();
    if (!sel.length) { veToast('Selecione as camadas que vão para a Comp'); return; }
    let md = $ve('ve-compdlg');
    if (!md) {
        md = document.createElement('div');
        md.className = 've-modal';
        md.id = 've-compdlg';
        md.innerHTML = `<div class="ve-modal-box ve-seqcfg-box">
            <div class="ve-modal-head"><span>${veT('Criar Comp')}</span><button class="ve-icon-btn" data-cp="fechar" title="Fechar (Esc)"><svg class="i"><use href="#i-x"/></svg></button></div>
            <div class="ve-modal-body">
                <div class="ve-field"><label for="ve-cp-nome">${veT('Nome da Comp')}</label><input class="ve-select" id="ve-cp-nome" maxlength="80"></div>
                <small class="ve-seqcfg-dica" id="ve-cp-info"></small>
            </div>
            <div class="ve-modal-foot"><button class="ve-btn ve-btn-ghost" data-cp="fechar">${veT('Cancelar')}</button><button class="ve-btn ve-btn-primary" data-cp="ok">OK</button></div>
        </div>`;
        $ve('ve').appendChild(md);
        const ok = () => { const nome = md.querySelector('#ve-cp-nome').value.trim(); md.hidden = true; veCompCriar(nome || veCompNomeLivre()); };
        md.addEventListener('click', e => {
            const b = e.target.closest('[data-cp]');
            if (!b) { if (e.target === md) md.hidden = true; return; }
            if (b.dataset.cp === 'ok') ok(); else md.hidden = true;
        });
        md.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Escape') md.hidden = true;
            else if (e.key === 'Enter') ok();
        });
    }
    const st0 = Math.min(...sel.map(c => c.st)), fim = Math.max(...sel.map(veEnd));
    md.querySelector('#ve-cp-nome').value = veCompNomeLivre();
    md.querySelector('#ve-cp-info').textContent = `${sel.length} ${veT(sel.length === 1 ? 'camada' : 'camadas')} · ${veShort(fim - st0)} · ${VE.seqW} × ${VE.seqH} · ${veT('fundo transparente')}`;
    md.hidden = false;
    const inp = md.querySelector('#ve-cp-nome');
    inp.focus();
    inp.select();
}

// As camadas selecionadas viram uma Comp; no lugar delas fica 1 clipe (trilha mais baixa que ocupavam)
function veCompCriar(nome) {
    if (!VE.ready) return null;
    const sel = veSelLista().filter(c => VE.clips.includes(c));
    if (!sel.length) { veToast('Selecione as camadas que vão para a Comp'); return null; }
    return veCompDeClipes(sel, nome);
}

// Os clipes `sel` (da timeline aberta) viram uma Comp. opts.pasta = pasta do Projeto; opts.quieto = sem aviso
// (AutoFrame). Devolve a mídia da Comp.
function veCompDeClipes(sel, nome, opts = {}) {
    if (sel.some(veLocked)) { veAvisoBloqueio(); return null; }
    if (VE.playing) veStop();
    veSeqSalvarAtiva();
    const st0 = Math.min(...sel.map(c => c.st)), fim = Math.max(...sel.map(veEnd)), dur = +(fim - st0).toFixed(6);
    // trilhas na mesma ordem, a partir de V1/A1 (olho e mudo da trilha vão junto)
    const trs = [...new Set(sel.map(c => c.tr))].sort((a, b) => a - b), mapaTr = new Map(trs.map((t, k) => [t, k]));
    const clips = sel.map(c => {
        const n = {};
        for (const k in c) if (k[0] !== '_') n[k] = vePlain(c[k], c[k]);
        n.st = +(c.st - st0).toFixed(6);
        n.tr = mapaTr.get(c.tr);
        return n;
    });
    const trilhas = veTrkNovo(Math.max(VE_MIN_TRACKS, trs.length));
    trs.forEach((t, k) => {
        if (VE_TRK.v[t] && VE_TRK.v[t].hide) trilhas.v[k].hide = true;
        if (VE_TRK.a[t] && VE_TRK.a[t].mute) trilhas.a[k].mute = true;
    });
    const seq = {
        id: veSeqId(), name: nome, comp: true, dur, clips, trilhas, texto: { palavras: [], idioma: 'pt', chave: '' },
        legendas: [], legEstilo: null, legGravar: true, inPt: null, outPt: null, markers: [], guias: [], playhead: 0,
        view: { pps: 0, x: 0 }, w: VE.seqW, h: VE.seqH, master: null,
    };
    const temSom = veCompComo(seq, () => veMixClipes().length > 0);
    vePushHistory();   // antes da mídia nova: desfazer some com a Comp do Projeto (veRestore)
    VE.sequences.push(seq);
    const m = {
        id: VE.media.length, kind: 'video', comp: true, sequenceId: seq.id, name: nome, cor: VE_COMP_COR,
        pasta: opts.pasta !== undefined ? opts.pasta : typeof vePjDestino === 'function' ? vePjDestino() : null, path: null, dur, _criada: true,
        // até o render sair: o que já se sabe (duração, quadro, se tem som) — trilha de áudio só se tiver som
        info: { duration: dur, width: VE.seqW, height: VE.seqH, fps: VE.fps || 30, has_audio: temSom, alfa: true, provisoria: true },
    };
    VE.media.push(m);
    VE.clips = VE.clips.filter(c => !sel.includes(c));
    const novo = { tr: 0, st: st0, s: 0, e: dur, m: m.id, cor: VE_COMP_COR };
    const vs = sel.filter(veOcupaV), base = Math.min(...(vs.length ? vs : sel).map(c => c.tr));
    let tr = base;
    while (veTrkLocked(tr) || !veTrackFree(tr, st0, fim, novo)) tr++;
    novo.tr = tr;
    veEnsureTrackIndex(tr, { refresh: true });
    VE.clips.push(novo);
    veRelayout();
    veSelDefinir([novo], novo);
    veSeqSalvarAtiva();
    veAfterEdit(VE.playhead);
    if (!opts.quieto) veToast(`${veT('Comp criada')}: ${nome} · ${veT('duplo clique para abrir')}`);
    veCompVerificar();
    return m;
}

// ─────────────────────────── descompactar (Fase 3) ───────────────────────────
// As camadas de dentro voltam para a timeline no lugar do clipe da Comp, no mesmo tempo (o trecho aparado dele),
// a partir da trilha dele para cima. A Comp continua no Projeto. Efeitos/movimento do clipe da Comp não vão junto.
function veCompDescompactar(c) {
    const m = veMediaOf(c), seq = veCompSeqEfetiva(m);   // com as Propriedades essenciais da faixa
    if (!c || !veEhComp(m) || !seq) return false;
    if (veLocked(c)) { veAvisoBloqueio(); return false; }
    if (Math.abs(veVel(c) - 1) > 1e-4) { veToast(veT('Volte a velocidade da Comp para 100% antes de descompactar')); return false; }
    veSeqSalvarAtiva();
    if (VE.playing) veStop();
    // só o trecho que aparece na timeline (clipe aparado), já no tempo de fora
    const dentro = veRecortarClips(vePlain(seq.clips, []), c.s, c.e).map(n => {
        const o = {};
        for (const k in n) if (k[0] !== '_') o[k] = n[k];
        o.st = +(o.st + c.st).toFixed(6);
        return o;
    }).filter(n => n.e - n.s > 1e-3);
    if (!dentro.length) { veToast(veT('Não há camadas no trecho dessa Comp')); return false; }
    const perde = (c.fx && c.fx.length) || (c.k && Object.keys(c.k).length) || c.bm || c.tin || c.tout ||
        (c.p && !veIsDefaultProps(c));
    const resto = VE.clips.filter(o => o !== c);
    const trs = [...new Set(dentro.map(n => n.tr))].sort((a, b) => a - b), off = trs[0];
    const cabe = base => dentro.every(n => {
        const tr = base + n.tr - off;
        return !veTrkLocked(tr) && !resto.some(o => o.tr === tr && o.st < veEnd(n) - VE_EPS && veEnd(o) > n.st + VE_EPS && veConflita(o, n));
    });
    let base = c.tr;
    while (!cabe(base)) base++;
    vePushHistory();
    dentro.forEach(n => { n.tr = base + n.tr - off; });
    VE.clips = resto.concat(dentro);
    veEnsureTracks(Math.max(...dentro.map(n => n.tr)) + 1, { refresh: true });
    veRelayout();
    veSelDefinir(dentro, dentro[0]);
    veAfterEdit(VE.playhead);
    veToast(`${veT('Comp descompactada')}: ${dentro.length} ${veT(dentro.length === 1 ? 'camada' : 'camadas')}` +
        (perde ? ` · ${veT('os efeitos e o movimento do clipe da Comp não vão junto')}` : ''));
    return true;
}

// ─────────────────────────── pacote: levar a Comp para outro projeto (Fase 3) ───────────────────────────
// { v, nome, raiz, seqs: [timeline da Comp e das Comps de dentro], midias: [o que as camadas usam] }
// Copiar (Ctrl+C) uma faixa de Comp guarda o pacote; Colar em outro projeto importa as mídias (as que já
// existem lá são reaproveitadas) e recria as Comps. Também é o que o modelo de cliente do AutoFrame guarda.
function veCompMidiaDados(m) {
    if (!m) return null;
    const o = { id: m.id, kind: m.kind, name: m.name, nome: m.nome, cor: m.cor };
    if (m.id === 0) return { ...o, kind: 'video', path: VE.path };
    if (m.comp) return { ...o, comp: true, sequenceId: m.sequenceId, dur: m.dur, temSom: !!(m.info && m.info.has_audio),
                         ...(m.ov ? { ov: m.ov, ovDe: m.ovDe } : {}) };   // variação: Propriedades essenciais
    if (['image', 'audio', 'video'].includes(m.kind)) Object.assign(o, { path: m.path, w: m.w, h: m.h, dur: m.dur });
    if (m.kind === 'cor') o.fill = m.fill;
    return o;
}

function veCompPacote(m) {
    veSeqSalvarAtiva();
    const seqs = new Map(), midias = new Map();
    const juntar = mm => {
        const seq = veCompSeqDe(mm);
        if (!seq) return;
        midias.set(mm.id, veCompMidiaDados(mm));   // a Comp e cada variação dela (a timeline vai uma vez só)
        if (seqs.has(seq.id)) return;
        seqs.set(seq.id, vePlain(seq, {}));
        (seq.clips || []).forEach(c => {
            const mi = VE.media[c.m || 0];
            if (veEhComp(mi)) juntar(mi);
            else if (mi && !midias.has(mi.id)) midias.set(mi.id, veCompMidiaDados(mi));
        });
    };
    juntar(m);
    return { v: 1, nome: vePjNome(m), raiz: m.id, seqs: [...seqs.values()], midias: [...midias.values()].filter(Boolean) };
}

// Recria no projeto aberto as Comps do pacote; devolve a mídia da Comp de fora. Mídia que não deu para importar
// (arquivo sumiu) tira as camadas dela, com aviso.
async function veCompImportar(pac, pasta = null) {
    const ids = new Map(), falhas = [];
    const naoRemovida = x => x && !x.removido;
    for (const d of pac.midias.filter(d => !d.comp)) {
        let nm = null;
        if (['image', 'video', 'audio'].includes(d.kind)) {
            nm = d.path ? veAfMidiaDe(d.path) : null;   // já está no projeto (inclusive o vídeo principal)
            if (!nm && d.path) { await vePjImportarArquivo(d.path, pasta); nm = veAfMidiaDe(d.path); }
            if (!nm) { falhas.push(vePathNome(d.path)); continue; }
        } else if (d.kind === 'texto') nm = veTxMidia();
        else if (d.kind === 'cor') nm = VE.media.find(x => naoRemovida(x) && x.kind === 'cor' && x.fill === d.fill) ||
            vePjAddMidia({ kind: 'cor', name: 'Cor sólida', fill: d.fill, nome: d.nome }, pasta);
        else if (d.kind === 'forma' || d.kind === 'pincel') nm = veGrMidia(d.kind, d.name || (d.kind === 'forma' ? 'Forma' : 'Desenho'));
        else if (d.kind === 'ajuste') nm = VE.media.find(x => naoRemovida(x) && x.kind === 'ajuste') ||
            vePjAddMidia({ kind: 'ajuste', name: 'Camada de ajuste' }, pasta);
        if (nm) ids.set(d.id, nm.id);
    }
    const seqIds = new Map(pac.seqs.map(s => [s.id, veSeqId()]));
    let raiz = null;
    pac.midias.filter(d => d.comp).forEach(d => {
        const s = pac.seqs.find(x => x.id === d.sequenceId);
        if (!s) return;
        const nm = {
            id: VE.media.length, kind: 'video', comp: true, sequenceId: seqIds.get(s.id), name: d.name, nome: d.nome,
            cor: d.cor || VE_COMP_COR, pasta, path: null, dur: d.dur, ...(d.ov ? { ov: vePlain(d.ov, {}) } : {}),
            info: { duration: d.dur, width: s.w || VE.seqW, height: s.h || VE.seqH, fps: VE.fps || 30, has_audio: !!d.temSom, alfa: true, provisoria: true },
        };
        VE.media.push(nm);
        ids.set(d.id, nm.id);
        if (d.id === pac.raiz) raiz = nm;
    });
    // variação veio com a Comp dela: continua escondida, ligada a ela (sem a Comp, vira um item próprio com os valores)
    pac.midias.filter(d => d.comp && d.ovDe != null && ids.has(d.ovDe) && ids.has(d.id)).forEach(d => { VE.media[ids.get(d.id)].ovDe = ids.get(d.ovDe); });
    pac.seqs.forEach(s => {
        const clips = (s.clips || []).filter(c => ids.has(c.m || 0)).map(c => {
            const n = { ...vePlain(c, {}) }, id = ids.get(c.m || 0);
            if (id) n.m = id; else delete n.m;
            return n;
        });
        VE.sequences.push({ ...vePlain(s, {}), id: seqIds.get(s.id), clips });
    });
    if (falhas.length) veToast(`${veT('Comp colada sem')}: ${falhas.join(', ')}`);
    VE.dirty = true;
    veUpdateTitle();
    vePjRender();
    veCompVerificar();
    return raiz;
}

// Duplicar no Projeto: Comp independente (timeline copiada); o arquivo é o mesmo até uma das duas mudar
function veCompDuplicar(m, pasta) {
    const orig = veCompSeqDe(m);
    if (!orig) return null;
    veSeqSalvarAtiva();
    const nome = `${vePjNome(m)} ${veT('cópia')}`;
    const seq = { ...vePlain(orig, {}), id: veSeqId(), name: nome, playhead: 0 };
    VE.sequences.push(seq);
    const n = { ...m, id: VE.media.length, sequenceId: seq.id, nome, pasta: pasta || null, info: vePlain(m.info, null), _criada: true };
    ['thumbs', 'peaks', 'pct', 'erro', 'removido'].forEach(k => delete n[k]);
    VE.media.push(n);
    if (n.path) veMidiaPreparar(n, true); else veCompVerificar();
    return n;
}

function veCompAbrir(m) {
    if (!veEhComp(m) || !veCompSeqDe(m)) return false;
    veOpenTimeline(m.sequenceId);
    return true;
}

// Ctrl+V de uma Comp copiada em outro projeto: importa uma vez por projeto e cola o clipe na agulha
async function veCompColarPacote(cb) {
    if (!VE.ready) return;
    if (VE.playing) veStop();
    const proj = ((VE.sequences || [])[0] || {}).id;
    cb.importado = cb.importado || {};
    let m = VE.media[cb.importado[proj]];
    if (!veEhComp(m) || m.removido) {
        veToast(veT('Colando a Comp...'));
        m = await veCompImportar(cb.pacote, typeof vePjDestino === 'function' ? vePjDestino() : null);
        if (!m) { veToast(veT('Não foi possível colar a Comp')); return; }
        cb.importado[proj] = m.id;
    }
    const novo = { ...veCopiaClipe(cb.c), m: m.id, st: veSnapFrame(VE.playhead) };
    veEnsureTrackIndex(novo.tr);
    if (veTrkLocked(novo.tr)) { veAvisoBloqueio(); return; }
    vePushHistory();
    vePlaceClip(novo);
    veAfterEdit(veEnd(novo));
    veToast(`${veT('Comp colada')}: ${vePjNome(m)} · V${novo.tr + 1}`);
}

// ─────────────────────────── render (o arquivo da Comp) ───────────────────────────
// Tudo o que muda a imagem ou o som da Comp. Os arquivos de dentro entram pelo caminho: Comp de dentro
// renderizada de novo → caminho novo → a de fora também muda.
function veCompSig(seq) {
    const clips = (seq.clips || []).map(c => {
        const o = {};
        for (const k in c) if (k[0] !== '_' && k !== 'eid') o[k] = c[k];   // eid: só o nome da propriedade essencial
        const m = VE.media[c.m || 0];
        return [o, m ? [m.kind, m.path || '', m.fill || '', veMediaOffline(m), m.mel && !m.melOff ? m.mel : '', m.kind === 'image' ? [m.w || 0, m.h || 0] : 0] : null];
    });
    const tr = seq.trilhas || {};
    // 2: tamanho das imagens (render feito antes de a imagem carregar saía sem ela)
    // 3: camada de ajuste dentro da Comp deixava o fundo preto (o render corrigido precisa sair de novo)
    // 4: Luz suave e cor das camadas com mesclagem corrigidas na exportação (2026-10-02)
    const partes = [4, seq.w, seq.h, VE.fps, VE.path || '', +seq.dur || 0, clips,
        (tr.v || []).map(t => !!(t && t.hide)), (tr.a || []).map(t => !!(t && t.mute)),
        seq.legGravar !== false && (seq.legendas || []).length ? [seq.legendas, seq.legEstilo] : null, seq.master || null];
    return 'comp.' + vePrHash(JSON.stringify(partes));
}

// Comps (e variações com Propriedades essenciais) que precisam de render — uma entrada por mídia, cada uma com
// "pronta" = as Comps de dentro já estão em dia. Variação que nenhuma faixa usa não renderiza.
function veCompPendentes() {
    const usados = new Set();
    (VE.sequences || []).forEach(s => (s.clips || []).forEach(c => usados.add(c.m || 0)));
    const estado = new Map();
    const ver = (m, pilha) => {
        if (estado.has(m.id)) return estado.get(m.id);
        if (pilha.has(m.id)) return { ok: true };   // ciclo (não deveria existir): não trava a fila
        pilha.add(m.id);
        const seq = veCompSeqEfetiva(m);
        if (!seq) return { ok: true };
        const pronta = (seq.clips || []).map(c => VE.media[c.m || 0]).filter(veEhComp).every(x => ver(x, pilha).ok);
        const sig = veCompSig(seq);
        const e = { m, seq, sig, pronta, ok: pronta && !!m.path && m.compSig === sig };
        estado.set(m.id, e);
        return e;
    };
    veCompMidias().filter(m => m.ovDe == null || usados.has(m.id)).forEach(m => ver(m, new Set()));
    return [...estado.values()].filter(e => e.m && !e.ok);
}

// Confere as Comps e renderiza a próxima que mudou (uma por vez; a seguinte quando esta terminar)
function veCompVerificar() {
    if (!VE.ready) return;
    if (!veCompMidias().length) { veCompAvisar(); return; }
    veSeqSalvarAtiva();
    const pend = veCompPendentes();
    veCompMarcarVivas(pend);   // a prévia passa a desenhar ao vivo as que mudaram (Fase 2)
    const api = window.pywebview && window.pywebview.api;
    if (VECOMP.atual || !api || !api.ve_comp_render) return;
    // tocando, o render espera (veCompTick): a Comp segue certa na tela, desenhada ao vivo. A exportação não espera.
    if (VE.playing && !VECOMP.exportando) return;
    const prox = pend.find(e => e.pronta && !VECOMP.falhas.has(e.sig));
    if (prox) veCompRenderizar(prox.m, prox.seq, prox.sig);
    else veCompAvisar();
}

// Comp em que nada muda com o tempo (só imagens, textos, formas e ajustes, sem quadro-chave, animação, transição
// nem efeito em loop; as Comps de dentro também): o render sai em QuickTime Animation (~3 MB em vez de ~130 MB)
function veCompEstatica(seq, vistos = new Set()) {
    if (!seq || vistos.has(seq.id)) return false;
    if (seq.legGravar !== false && (seq.legendas || []).length) return false;   // legendas mudam com o tempo
    vistos.add(seq.id);
    return (seq.clips || []).every(c => {
        const m = VE.media[c.m || 0];
        if (!m) return false;
        if (veEhComp(m)) return veCompEstatica(veCompSeqDe(m), vistos) && !veHasKf(c) && !c.tin && !c.tout;
        if (!['image', 'texto', 'cor', 'forma', 'pincel', 'ajuste'].includes(m.kind)) return false;
        if (veHasKf(c) || c.tin || c.tout || c.txa || m.seq) return false;
        return !(c.fx || []).some(f => f.on !== false && VE_FX[f.t] && (VE_FX[f.t].constante || VE_FX[f.t].ovt));
    });
}

async function veCompJob(seq) {
    // imagem recém-importada (colar Comp, AutoFrame) ainda sem tamanho: sairia com 1 px no render
    const imgs = seq.clips.map(c => VE.media[c.m || 0]).filter(m => m && m.kind === 'image' && !veMediaOffline(m));
    for (let k = 0; k < 50 && imgs.some(m => !m.w); k++) await new Promise(r => setTimeout(r, 100));
    // textos, formas e cores sólidas viram PNG (o mesmo desenho da prévia), sem mexer no VE._txPng da exportação
    const mapa = seq.clips.some(c => veIsTexto(c) || veEhGrafico(c)) ? await veTxPngs(null, seq.clips, false) : new Map();
    return veCompComo(seq, () => {
        const ant = VE._txPng;
        VE._txPng = mapa;
        try {
            const plano = veExportPlan(false), lim = veMasterLim();
            const mix = plano.mix.length ? (lim ? [...plano.mix, { master: lim }] : plano.mix) : [];
            const fonte = typeof veFonteParaPlano === 'function' ? veFonteParaPlano({ ...plano, mix }, true) : VE.path;
            return { path: fonte, base: plano.base, camadas: plano.camadas, dur: VE.dur, mix,
                     legendas: veTxExport(null), quadro: [VE.seqW, VE.seqH], estatico: veCompEstatica(seq) };
        } finally { VE._txPng = ant; }
    });
}

async function veCompRenderizar(m, seq, sig) {
    const nome = vePjNome(m);
    VECOMP.atual = { mid: m.id, seqId: seq.id, sig, pct: 0, nome };
    veCompUi();
    try {
        const job = await veCompJob(vePlain(seq, {}));
        // começou a tocar enquanto preparava: nem chega a abrir o ffmpeg
        if (VECOMP.atual && VECOMP.atual.cancelando) { VECOMP.atual = null; VECOMP.pausado = true; veCompUi(); veCompAvisar(); return; }
        const r = await window.pywebview.api.ve_comp_render(vePrPrefs().dir, sig, job);
        if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
    } catch (e) {
        VECOMP.atual = null;
        VECOMP.falhas.set(sig, (e && e.message) || String(e));
        veToast(`${veT('Falha ao renderizar a Comp')} ${nome}: ${(e && e.message) || e}`);
        veCompAvisar();
        veCompUi();
    }
}

function veOnComp(ev) {
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return; } }
    const a = VECOMP.atual;
    if (!a || ev.hash !== a.sig) return;
    if (!ev.done) { a.pct = ev.pct || 0; veCompAvisar(); veCompUi(); return; }
    VECOMP.atual = null;
    if (ev.success) {
        // a mídia renderizada e as outras com o mesmo conteúdo (variações iguais) passam a usar o arquivo
        veCompMidias().filter(m => m.id === a.mid || (m.sequenceId === a.seqId && veCompSig(veCompSeqEfetiva(m)) === a.sig)).forEach(m => {
            const trocou = m.path !== ev.path;
            m.path = ev.path;
            m.compSig = a.sig;
            delete m.erro;
            // prévia com alfa, miniaturas e som do arquivo novo; até ela sair, a Comp segue desenhada ao vivo
            if (trocou) { m._esperaUrl = true; veMidiaPreparar(m, true); } else delete m._aoVivo;
        });
        VE.dirty = true;
        veUpdateTitle();
        // arquivo novo: os trechos da prévia renderizada e o cache RAM com a Comp antiga deixam de valer
        veCacheInvalidate();
    } else if (ev.cancelled) {
        VECOMP.pausado = true;   // parou para o play: recomeça quando parar de tocar (veCompTick)
    } else {
        VECOMP.falhas.set(a.sig, ev.error || 'erro');
        veToast(`${veT('Falha ao renderizar a Comp')} ${a.nome}: ${ev.error || ''}`);
    }
    veCompUi();
    veCompAvisar();
    veCompVerificar();
}
window.veOnComp = veOnComp;

// painel Projeto/monitor acompanham (no máximo 4x por segundo durante o render)
function veCompUi() {
    const agora = performance.now();
    if (VECOMP.atual && VECOMP.atual.pct && agora - VECOMP.ui < 250) return;
    VECOMP.ui = agora;
    if (typeof vePjRender === 'function') vePjRender();
    if (VE.ready && !VE.playing) veDrawMonitorSoon();
}

function veCompAvisar() {
    const fila = VECOMP.espera;
    VECOMP.espera = [];
    fila.forEach(r => r());
}

// Exportação: espera as Comps ficarem em dia (aviso(msg) mostra o andamento). Erro se alguma falhar.
async function veCompProntas(aviso) {
    if (!veCompMidias().length) return;
    VECOMP.exportando = true;
    try { await veCompProntasLaco(aviso); } finally { VECOMP.exportando = false; }
}

async function veCompProntasLaco(aviso) {
    for (let volta = 0; volta < 10000; volta++) {
        veCompVerificar();
        const a = VECOMP.atual;
        if (!a) {
            const pend = veCompPendentes();
            if (!pend.length) return;
            const falha = pend.map(e => VECOMP.falhas.get(e.sig)).find(Boolean);
            throw new Error(`${veT('a Comp não renderizou')}${falha ? ': ' + falha : ''}`);
        }
        if (aviso) aviso(`${veT('Renderizando a Comp')} "${a.nome}"... ${a.pct || 0}%`);
        await new Promise(r => VECOMP.espera.push(r));
    }
}

// Projeto: o que dizer da Comp na coluna de informações
function veCompInfo(m) {
    const a = VECOMP.atual;
    if (a && a.mid === m.id) return `${veT('renderizando')} ${a.pct || 0}%`;
    if (!m.path) return VECOMP.falhas.size ? veT('render falhou') : veT('na fila do render');
    return null;
}

// Monitor: Comp que ainda não tem arquivo nenhum (o primeiro render)
function veCompDesenharPendente(ctx, w, h, m) {
    ctx.save();
    ctx.fillStyle = 'rgba(212,129,74,0.10)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(212,129,74,0.7)';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.004);
    ctx.setLineDash([ctx.lineWidth * 4, ctx.lineWidth * 3]);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fdba74';
    ctx.font = `800 ${Math.max(18, Math.min(56, w / 14))}px Segoe UI`;
    const a = VECOMP.atual && VECOMP.atual.mid === m.id ? VECOMP.atual : null;
    ctx.fillText(`${veT('Renderizando Comp')}${a && a.pct ? ` ${a.pct}%` : '…'}`, w / 2, h / 2, w * 0.86);
    ctx.font = `600 ${Math.max(12, Math.min(28, w / 30))}px Segoe UI`;
    ctx.fillStyle = 'rgba(253,186,116,0.8)';
    ctx.fillText(vePjNome(m), w / 2, h / 2 + Math.max(24, h * 0.06), w * 0.86);
    ctx.restore();
}

// ─────────────────────────── prévia ao vivo (Fase 2) ───────────────────────────
// Comp mudada (ou ainda sem arquivo): até o arquivo novo ficar pronto, o monitor desenha a Comp com as camadas
// de dentro, no instante dela — o mesmo desenhista do monitor (veDesenharItens) num canvas transparente.
// Vídeos de dentro usam os players extras (veCamPreparar reserva via veCompVideosVivos); Comp dentro de Comp
// desatualizada é desenhada do mesmo jeito. Com o arquivo em dia, a Comp volta a tocar como um vídeo.
// O som de dentro só muda com o arquivo novo.
const veCompVivo = m => !!(m && m.comp && (m._aoVivo || !m.url));
VECOMP.telas = new WeakMap();   // clipe → canvas da Comp desenhada ao vivo
VECOMP.chaves = new Map();      // "seq:índice" → chave fixa do player extra de um vídeo de dentro

function veCompChave(seqId, i) {
    const k = seqId + ':' + i;
    if (!VECOMP.chaves.has(k)) VECOMP.chaves.set(k, { comp: k });
    return VECOMP.chaves.get(k);
}

// Clipes de dentro visíveis no instante tc da Comp (já com a timeline dela no lugar: veCompComo)
function veCompVisiveis(tc) {
    return VE.clips.filter(ic => !veIsAudio(ic) && !veOculto(ic) && tc >= ic.st - VE_EPS && tc < veEnd(ic) - VE_EPS)
        .sort((a, b) => a.tr - b.tr || a.st - b.st);
}

// Vídeos de dentro das Comps ao vivo visíveis em t: [[chave, clipe]] para veCamPreparar reservar os players
function veCompVideosVivos(t, lista) {
    const out = [];
    const juntar = (c, T, d) => {
        const m = veMediaOf(c), seq = veCompSeqEfetiva(m);
        if (!seq || d > 8) return;
        const tc = veSrcAt(c, T);
        veCompComo(seq, () => veCompVisiveis(tc).forEach(ic => {
            const mi = veMediaOf(ic);
            if (veCompVivo(mi)) juntar(ic, tc, d + 1);
            else if (!veIsImage(ic) && mi && mi.url && !veMediaOffline(mi)) out.push([veCompChave(seq.id, VE.clips.indexOf(ic)), ic]);
        }));
    };
    (lista || []).forEach(c => {
        if (veCompVivo(veMediaOf(c)) && t >= c.st - VE_EPS && t < veEnd(c) - VE_EPS) juntar(c._o || c, t, 0);
    });
    return out;
}

// Quadro da Comp do clipe c no instante T (da timeline de fora); alvo = px do monitor por px da Comp
function veCompQuadro(c, T, alvo, d = 0, fator = 1) {
    const m = veMediaOf(c), seq = veCompSeqEfetiva(m);
    if (!seq || d > 8) return null;
    const k = Math.min(1, Math.max(0.15, alvo || 1)), W = seq.w || VE.seqW, H = seq.h || VE.seqH;
    const o = c._o || c;
    let cv = VECOMP.telas.get(o);
    if (!cv) { cv = document.createElement('canvas'); VECOMP.telas.set(o, cv); }
    const cw = Math.max(2, Math.round(W * k)), ch = Math.max(2, Math.round(H * k));
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const tc = veSrcAt(c, T), f = fator * veVel(c);
    veCompComo(seq, () => {
        const ph = VE.playhead;
        VE.playhead = tc;   // quadros-chave, animações de texto etc. no tempo da Comp
        try {
            const itens = veCompVisiveis(tc).map(ic => ({ c: ic, src: veCompSrc(seq, ic, tc, k, f, d) }));
            ctx.setTransform(k, 0, 0, k, 0, 0);
            ctx.imageSmoothingQuality = 'high';
            veDesenharItens(ctx, cv, itens, k, tc);
        } finally { VE.playhead = ph; }
    });
    return cv;
}

// O que desenhar de uma camada de dentro (null = ainda sem quadro)
function veCompSrc(seq, ic, tc, k, fator, d) {
    const mi = veMediaOf(ic);
    if (veMediaOffline(mi)) return 'offline';
    const alvo = k * veProps(ic, tc).sc / 100;
    if (veCompVivo(mi)) return veCompQuadro(ic, tc, alvo, d + 1, fator) || 'comp';
    if (veIsAdj(ic)) return 'ajuste';
    if (veIsTexto(ic)) return (typeof veTxaCanvas === 'function' && veTxaCanvas(ic, alvo)) || veTxCanvas(ic, alvo).cv;
    if (veEhGrafico(ic)) return veGrafDesenho(ic);
    if (veIsImage(ic)) return mi.img && mi.img.complete && mi.w ? mi.img : null;
    const n = VECAM.slot.get(veCompChave(seq.id, VE.clips.indexOf(ic)));
    if (n == null) return null;
    const x = VEX[n];
    veSyncExtra(x, veSrcAt(ic, tc), Math.min(16, Math.max(0.0625, VE.rate * fator * veVel(ic))));
    return x.readyState >= 2 ? x : null;
}

// Comps que precisam de render passam a ser desenhadas ao vivo (o arquivo delas está velho)
function veCompMarcarVivas(pend) {
    let mudou = false;
    pend.forEach(({ m }) => { if (!m._aoVivo) { m._aoVivo = true; mudou = true; } });
    if (mudou) { veCacheInvalidate(); if (VE.ready) veDrawMonitorSoon(); }
}

// Prévia do arquivo novo pronta (veOnMidia): a Comp volta a tocar pelo arquivo, se ainda estiver em dia
function veCompUrlPronta(m) {
    if (!m._esperaUrl) return;
    delete m._esperaUrl;
    delete m._aoVivo;
    veCacheInvalidate();
    veCompVerificar();   // mudou de novo enquanto renderizava: volta a ser ao vivo
}

// Render da Comp disputava a CPU com o play (travadas mesmo em prioridade baixa): tocando, ele para; parado, volta
function veCompTick() {
    if (!VE.ready) return;
    const api = window.pywebview && window.pywebview.api;
    if (VE.playing && VECOMP.atual && !VECOMP.exportando && !VECOMP.atual.cancelando && api && api.ve_comp_cancelar) {
        VECOMP.atual.cancelando = true;
        api.ve_comp_cancelar();
    } else if (!VE.playing && VECOMP.pausado && !VECOMP.atual) {
        VECOMP.pausado = false;
        veCompVerificar();
    }
}
setInterval(veCompTick, 400);

// ─────────────────────────── Propriedades essenciais (por faixa) ───────────────────────────
// Como as do After: na timeline de fora, cada faixa de Comp pode trocar o texto e a cor dos textos e a cor das
// formas de dentro, sem abrir a Comp e sem mudar as outras faixas dela. A lista é automática (todo texto e toda
// forma). Os valores ficam na faixa (c.ov = {eid: {t, cor}}: entram no desfazer); a faixa aponta para uma variação
// escondida da Comp com os mesmos valores (mídia {comp, ovDe: id da Comp, ov}) — ela tem o seu render; variações
// iguais são a mesma mídia. eid = nome fixo da camada de dentro (dado na primeira vez que a lista é montada).

// A timeline da Comp com as Propriedades essenciais de uma variação aplicadas (cópia; sem ov, a própria)
function veCompSeqEfetiva(m) {
    const seq = veCompSeqDe(m);
    if (!seq || !m.ov || !Object.keys(m.ov).length) return seq;
    return { ...seq, clips: (seq.clips || []).map(c => {
        const o = c.eid && m.ov[c.eid];
        if (!o) return c;
        const n = vePlain(c, {});
        if (n.tx) { if (o.t != null) n.tx.t = o.t; if (o.cor) n.tx.cor = o.cor; }
        if (n.fm && o.cor) n.fm.cor = o.cor;
        return n;
    }) };
}

// Textos e formas de dentro da Comp (de cima para baixo), com os valores dela
function veCompEssenciais(seq) {
    if (!seq || seq.id === VE.activeSequence) return [];
    const out = [], vistos = new Set();
    let nT = 0, nF = 0;
    [...(seq.clips || [])].sort((a, b) => b.tr - a.tr || a.st - b.st).forEach(c => {
        const m = VE.media[c.m || 0];
        const tipo = m && m.kind === 'texto' && c.tx ? 'texto' : m && m.kind === 'forma' && c.fm ? 'forma' : null;
        if (!tipo) return;
        if (!c.eid) c.eid = 'e' + Math.random().toString(36).slice(2, 9);
        if (vistos.has(c.eid)) return;   // cópia de uma camada (Ctrl+V/lâmina dentro da Comp): mesma propriedade
        vistos.add(c.eid);
        out.push(tipo === 'texto'
            ? { eid: c.eid, tipo, nome: `${veT('Texto')} ${++nT}`, t: c.tx.t || '', cor: c.tx.cor || '#ffffff' }
            : { eid: c.eid, tipo, nome: `${veT('Forma')} ${++nF}`, cor: c.fm.cor || '#ffffff' });
    });
    return out;
}

const veCompBase = m => (m && m.ovDe != null && VE.media[m.ovDe]) || m;

// Variação com estes valores (a mesma mídia para valores iguais); sem valores = a própria Comp
function veCompVariantePara(base, ov) {
    if (!ov || !Object.keys(ov).length) return base;
    const chave = JSON.stringify(ov);
    let v = VE.media.find(x => x && x.comp && !x.removido && x.ovDe === base.id && JSON.stringify(x.ov || {}) === chave);
    if (!v) {
        v = { ...base, id: VE.media.length, ovDe: base.id, ov: vePlain(ov, {}), info: vePlain(base.info, null) };
        ['_criada', '_aoVivo', '_esperaUrl', 'pasta', 'nome', 'pct', 'erro'].forEach(k => delete v[k]);
        VE.media.push(v);
    }
    return v;
}

// Muda uma propriedade da faixa c. digitando = a mesma edição continua (não cria uma variação por tecla)
function veCompEssDefinir(c, eid, campo, valor, digitando) {
    const m0 = veMediaOf(c), base = veCompBase(m0), item = veCompEssenciais(veCompSeqDe(base)).find(e => e.eid === eid);
    if (!item || veLocked(c)) return;
    const ov = vePlain(c.ov || {}, {});
    ov[eid] = { ...(ov[eid] || {}), [campo]: valor };
    if (String(item[campo]) === String(valor)) delete ov[eid][campo];   // igual ao da Comp: sem valor próprio
    if (!Object.keys(ov[eid]).length) delete ov[eid];
    const ed = VECOMP.ess;
    if (!(digitando && ed && ed.c === c)) { vePushHistory(); VECOMP.ess = { c }; }
    // a variação desta edição, usada só por esta faixa, é atualizada no lugar (cada tecla não vira uma mídia)
    let m;
    if (ed && ed.c === c && ed.v && m0 === ed.v && Object.keys(ov).length) { m = ed.v; m.ov = vePlain(ov, {}); }
    else {
        const n0 = VE.media.length;
        m = veCompVariantePara(base, ov);
        VECOMP.ess.v = VE.media.length > n0 ? m : null;   // só a recém-criada (uma que já existia pode ser de outra faixa)
    }
    if (Object.keys(ov).length) c.ov = ov; else delete c.ov;
    c.m = m.id;
    m._aoVivo = true;   // na tela na hora (ao vivo); o render da variação sai depois
    veCacheInvalidate();
    veDrawMonitorSoon();
    veDraw();
    clearTimeout(VECOMP.essT);
    VECOMP.essT = setTimeout(veCompVerificar, 800);
}

function veCompEssFim() { VECOMP.ess = null; }

// Seção do painel Propriedades para uma faixa de Comp
function veCompEssHtml(c) {
    const base = veCompBase(veMediaOf(c)), lista = veCompEssenciais(veCompSeqDe(base)), ov = c.ov || {};
    const corpo = !lista.length
        ? `<small class="ve-pp-dica">${veT('Esta Comp não tem texto nem forma para mudar daqui.')}</small>`
        : lista.map(e => {
            const o = ov[e.eid] || {}, mudou = Object.keys(o).length > 0;
            return `<div class="ve-pce${mudou ? ' mudou' : ''}">
                <div class="ve-pce-cab"><label>${veEsc(e.nome)}</label>
                    <input type="color" data-pce="${e.eid}" data-campo="cor" value="${veEsc(o.cor || e.cor)}" title="${veT('Cor')}">
                    ${mudou ? `<button class="ve-pce-volta" data-pce-volta="${e.eid}" title="${veT('Voltar ao valor da Comp')}">↺</button>` : ''}</div>
                ${e.tipo === 'texto' ? `<textarea class="ve-pp-texto" rows="2" data-pce="${e.eid}" data-campo="t">${veEsc(o.t != null ? o.t : e.t)}</textarea>` : ''}
            </div>`;
        }).join('') + `<small class="ve-pp-dica">${veT('Vale só para esta faixa. Para mudar em todas, abra a Comp (duplo clique).')}</small>`;
    return vePpSec(veT('Propriedades essenciais'), corpo);
}

// Eventos do painel (editor-props.js chama): digitar/escolher cor, soltar, voltar ao valor da Comp
function veCompEssEvento(el, tipo) {
    const c = VE.clips[VE.sel];
    if (!c || !veEhComp(veMediaOf(c))) return;
    if (tipo === 'volta') {
        const ov = vePlain(c.ov || {}, {});
        delete ov[el.dataset.pceVolta];
        vePushHistory();
        veCompEssFim();
        const base = veCompBase(veMediaOf(c)), m = veCompVariantePara(base, ov);
        if (Object.keys(ov).length) c.ov = ov; else delete c.ov;
        c.m = m.id;
        VEPP.chave = '';
        veRefresh();
        veCompVerificar();
        return;
    }
    if (tipo === 'fim') { veCompEssFim(); VEPP.chave = ''; vePpRender(); return; }
    veCompEssDefinir(c, el.dataset.pce, el.dataset.campo, el.value, true);
}

// Duplo clique numa faixa de Comp na timeline: abre a Comp
function veCompDuploClique(e) {
    if (!VE.ready || e.button !== 0 || VE.tool !== 'select') return;
    const { t, y } = veTimeFromEvent(e);
    const row = veRowAt(y);
    if (!row || row.kind === 'l') return;
    const i = veClipAtTrack(t, veTrackIndex(row), row.kind);
    const m = i >= 0 ? veMediaOf(VE.clips[i]) : null;
    if (veEhComp(m)) { e.preventDefault(); veCompAbrir(m); }
}
