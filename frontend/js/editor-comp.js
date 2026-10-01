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
        pasta: typeof vePjDestino === 'function' ? vePjDestino() : null, path: null, dur, _criada: true,
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
    veToast(`${veT('Comp criada')}: ${nome} · ${veT('duplo clique para abrir')}`);
    veCompVerificar();
    return m;
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

// ─────────────────────────── render (o arquivo da Comp) ───────────────────────────
// Tudo o que muda a imagem ou o som da Comp. Os arquivos de dentro entram pelo caminho: Comp de dentro
// renderizada de novo → caminho novo → a de fora também muda.
function veCompSig(seq) {
    const clips = (seq.clips || []).map(c => {
        const o = {};
        for (const k in c) if (k[0] !== '_') o[k] = c[k];
        const m = VE.media[c.m || 0];
        return [o, m ? [m.kind, m.path || '', m.fill || '', veMediaOffline(m), m.mel && !m.melOff ? m.mel : ''] : null];
    });
    const tr = seq.trilhas || {};
    const partes = [1, seq.w, seq.h, VE.fps, VE.path || '', +seq.dur || 0, clips,
        (tr.v || []).map(t => !!(t && t.hide)), (tr.a || []).map(t => !!(t && t.mute)),
        seq.legGravar !== false && (seq.legendas || []).length ? [seq.legendas, seq.legEstilo] : null, seq.master || null];
    return 'comp.' + vePrHash(JSON.stringify(partes));
}

// Comp em dia: todas as mídias dela com o arquivo do conteúdo atual
function veCompEmDia(seq, sig) {
    return veCompMidias().filter(m => m.sequenceId === seq.id).every(m => m.path && m.compSig === sig);
}

// Comps que precisam de render, cada uma com "pronta" = as Comps de dentro já estão em dia
function veCompPendentes() {
    const seqs = [...new Set(veCompMidias().map(m => m.sequenceId))].map(id => (VE.sequences || []).find(s => s.id === id)).filter(Boolean);
    const estado = new Map();
    const ver = (seq, pilha = new Set()) => {
        if (estado.has(seq.id)) return estado.get(seq.id);
        if (pilha.has(seq.id)) return { ok: true };   // ciclo (não deveria existir): não trava a fila
        pilha.add(seq.id);
        const dentro = (seq.clips || []).map(c => VE.media[c.m || 0]).filter(veEhComp).map(veCompSeqDe).filter(Boolean);
        const pronta = dentro.every(s => ver(s, pilha).ok);
        const sig = veCompSig(seq);
        const e = { seq, sig, pronta, ok: pronta && veCompEmDia(seq, sig) };
        estado.set(seq.id, e);
        return e;
    };
    seqs.forEach(s => ver(s));
    return [...estado.values()].filter(e => !e.ok);
}

// Confere as Comps e renderiza a próxima que mudou (uma por vez; a seguinte quando esta terminar)
function veCompVerificar() {
    if (!VE.ready || VECOMP.atual) return;
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_comp_render) return;
    if (!veCompMidias().length) { veCompAvisar(); return; }
    veSeqSalvarAtiva();
    const prox = veCompPendentes().find(e => e.pronta && !VECOMP.falhas.has(e.sig));
    if (prox) veCompRenderizar(prox.seq, prox.sig);
    else veCompAvisar();
}

async function veCompJob(seq) {
    // textos, formas e cores sólidas viram PNG (o mesmo desenho da prévia), sem mexer no VE._txPng da exportação
    const mapa = seq.clips.some(c => veIsTexto(c) || veEhGrafico(c)) ? await veTxPngs(null, seq.clips, false) : new Map();
    return veCompComo(seq, () => {
        const ant = VE._txPng;
        VE._txPng = mapa;
        try {
            const plano = veExportPlan(false), lim = veMasterLim();
            const mix = plano.mix.length ? (lim ? [...plano.mix, { master: lim }] : plano.mix) : [];
            return { path: VE.path, base: plano.base, camadas: plano.camadas, dur: VE.dur, mix,
                     legendas: veTxExport(null), quadro: [VE.seqW, VE.seqH] };
        } finally { VE._txPng = ant; }
    });
}

async function veCompRenderizar(seq, sig) {
    const nome = seq.name || 'Comp';
    VECOMP.atual = { seqId: seq.id, sig, pct: 0, nome };
    veCompUi();
    try {
        const job = await veCompJob(vePlain(seq, {}));
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
        veCompMidias().filter(m => m.sequenceId === a.seqId).forEach(m => {
            const trocou = m.path !== ev.path;
            m.path = ev.path;
            m.compSig = a.sig;
            delete m.erro;
            // prévia com alfa, miniaturas e som do arquivo novo (a prévia antiga segue na tela até a nova sair)
            if (trocou) veMidiaPreparar(m, true);
        });
        VE.dirty = true;
        veUpdateTitle();
        // arquivo novo: os trechos da prévia renderizada e o cache RAM com a Comp antiga deixam de valer
        veCacheInvalidate();
    } else if (!ev.cancelled) {
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
    if (a && a.seqId === m.sequenceId) return `${veT('renderizando')} ${a.pct || 0}%`;
    if (!m.path) return VECOMP.falhas.size ? veT('render falhou') : veT('na fila do render');
    return null;
}

// Monitor: Comp que ainda não tem arquivo nenhum (o primeiro render)
function veCompDesenharPendente(ctx, w, h, m) {
    ctx.save();
    ctx.fillStyle = 'rgba(249,115,22,0.10)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(249,115,22,0.7)';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.004);
    ctx.setLineDash([ctx.lineWidth * 4, ctx.lineWidth * 3]);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fdba74';
    ctx.font = `800 ${Math.max(18, Math.min(56, w / 14))}px Segoe UI`;
    const a = VECOMP.atual && VECOMP.atual.seqId === m.sequenceId ? VECOMP.atual : null;
    ctx.fillText(`${veT('Renderizando Comp')}${a && a.pct ? ` ${a.pct}%` : '…'}`, w / 2, h / 2, w * 0.86);
    ctx.font = `600 ${Math.max(12, Math.min(28, w / 30))}px Segoe UI`;
    ctx.fillStyle = 'rgba(253,186,116,0.8)';
    ctx.fillText(vePjNome(m), w / 2, h / 2 + Math.max(24, h * 0.06), w * 0.86);
    ctx.restore();
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
