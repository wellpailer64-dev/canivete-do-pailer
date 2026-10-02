// =========================================================
// Pocket Editor — importar PSD/PSB com as camadas separadas (como o "Composição — manter tamanhos das camadas" do
// After Effects). O Python (Functions/psd_import.py) grava um PNG por camada (máscara, recorte e efeitos de camada já
// desenhados nele) e devolve a árvore; aqui vira uma Comp no tamanho do documento, uma trilha por camada na mesma
// ordem (a de baixo na V1), cada uma na posição dela, com opacidade, modo de mesclagem e visibilidade (oculta =
// clipe desativado). Grupo = Comp dentro da Comp (com a opacidade/mesclagem do grupo); Brilho/Contraste = camada de
// ajuste. Tudo fica numa pasta "PSD · nome" do painel Projeto.
// Entradas: arrastar o arquivo (timeline ou Projeto), Importar do Projeto, Abrir arquivo. Sem nada aberto, o
// projeto começa no tamanho do documento com a Comp na timeline.
// =========================================================

const VE_EXT_PSD = /\.(psd|psb)$/i;
const VE_PSD_DUR = VE_IMG_DUR;   // duração das camadas (como a duração padrão de composição do AE)

const vePsdEsperar = async (fn, ms = 15000) => {
    for (let t = 0; t < ms; t += 100) { if (fn()) return true; await new Promise(r => setTimeout(r, 100)); }
    return !!fn();
};

async function vePsdLer(path) {
    veToast(`${veT('Lendo o PSD')}: ${path.split(/[\\/]/).pop()}...`);
    const r = await window.pywebview.api.ve_psd_importar(path);
    if (!r || !r.success) { veToast(`PSD: ${(r && r.error) || veT('não consegui ler o arquivo')}`); return null; }
    if (!r.camadas.length) { veToast(veT('PSD sem camadas visíveis para importar')); return null; }
    return r;
}

// Mídias (PNG de cada camada) e Comps (documento e grupos). Devolve a mídia da Comp do documento.
async function vePsdMontar(r, pastaPai) {
    const api = window.pywebview.api, bin = vePjNovoBin('PSD · ' + r.nome, pastaPai || null), dur = VE_PSD_DUR;
    let aj = null;
    const imagem = async no => {
        const a = await api.video_cutter_add_media(no.png);
        if (!a || !a.success) return null;
        const m = vePjAddMidia({ kind: 'image', path: a.path, url: a.url, name: no.nome, img: new Image(), w: no.w, h: no.h }, bin.id);
        m.img.crossOrigin = 'anonymous';
        m.img.src = a.url;
        await new Promise(ok => { m.img.onload = ok; m.img.onerror = ok; });
        m.w = m.img.naturalWidth || no.w;
        m.h = m.img.naturalHeight || no.h;
        return m;
    };
    const comp = async (nos, nome) => {
        const clips = [];
        for (const no of nos) {
            let c = null;
            if (no.filhos) {
                const cm = await comp(no.filhos, no.nome);
                c = { m: cm.id, p: { x: r.w / 2, y: r.h / 2 } };
            } else if (no.ajuste) {
                if (!aj) aj = VE.media.find(x => x.kind === 'ajuste' && !x.removido) || vePjAddMidia({ kind: 'ajuste', name: 'Camada de ajuste' }, null);
                c = { m: aj.id, fx: [{ id: veFxNewId(), t: no.ajuste.t, on: true, v: { ...no.ajuste.v } }], nome: no.nome };
            } else if (no.png) {
                const m = await imagem(no);
                if (!m) continue;
                c = { m: m.id, p: { x: no.x + no.w / 2, y: no.y + no.h / 2 } };
                if (no.texto) c.psdTexto = no.texto;   // o texto original (a camada entra como imagem)
            }
            if (!c) continue;
            Object.assign(c, { tr: clips.length, st: 0, s: 0, e: dur });
            c.p = Object.assign(veDefProps(c), { sc: 100, rot: 0 }, c.p || {}, { op: no.op });
            if (no.bm && no.bm !== 'normal') c.bm = no.bm;
            if (!no.visivel) c.off = true;
            clips.push(c);
        }
        const seq = {
            id: veSeqId(), name: nome, comp: true, dur, clips, trilhas: veTrkNovo(Math.max(VE_MIN_TRACKS, clips.length)),
            texto: { palavras: [], idioma: 'pt', chave: '' }, legendas: [], legEstilo: null, legGravar: true, inPt: null,
            outPt: null, markers: [], guias: [], playhead: 0, view: { pps: 0, x: 0 }, w: r.w, h: r.h, master: null,
        };
        VE.sequences.push(seq);
        const m = {
            id: VE.media.length, kind: 'video', comp: true, sequenceId: seq.id, name: nome, cor: VE_COMP_COR, pasta: bin.id,
            path: null, dur, _criada: true, psd: true,
            info: { duration: dur, width: r.w, height: r.h, fps: VE.fps || 30, has_audio: false, alfa: true, provisoria: true },
        };
        VE.media.push(m);
        return m;
    };
    return comp(r.camadas, r.nome);
}

// Abre/importa um PSD. opts: {pasta: pasta do Projeto, soProjeto: não põe na timeline, abrir: abre a Comp (padrão sim)}
async function vePsdAbrir(path, opts = {}) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_psd_importar) return false;
    const r = await vePsdLer(path);
    if (!r) return false;
    let novo = false;
    if (!VE.ready) {
        // sem projeto: começa pela imagem do documento inteiro (tamanho da sequência = o do PSD) e troca pela Comp
        if (!r.achatado) { veToast(veT('Abra um vídeo ou projeto antes de importar este PSD')); return false; }
        veOpenPath(r.achatado);
        if (!await vePsdEsperar(() => VE.ready && VE.clips.length, 30000)) { veToast(veT('Não consegui abrir o PSD')); return false; }
        VE.clips = [];
        novo = true;
    }
    if (VE.playing) veStop();
    veSeqSalvarAtiva();
    vePushHistory();
    const m = await vePsdMontar(r, opts.pasta !== undefined ? opts.pasta : (typeof vePjDestino === 'function' ? vePjDestino() : null));
    let clip = null;
    if (!opts.soProjeto) {
        const st = novo ? 0 : veSnapFrame(VE.playhead), b = st + VE_PSD_DUR;
        clip = { st, s: 0, e: VE_PSD_DUR, m: m.id, cor: VE_COMP_COR };
        let tr = novo ? 0 : veTrackIndexes().find(k => !veTrkLocked(k) && veTrackFree(k, st, b, clip));
        if (tr == null) tr = veTrackCount();
        clip.tr = tr;
        veEnsureTrackIndex(tr, { refresh: true });
        clip.p = veDefProps(clip);
        VE.clips.push(clip);
        veRelayout();
        veSelDefinir([clip], clip);
    }
    veSeqSalvarAtiva();
    veAfterEdit(VE.playhead);
    vePjRender();
    if (typeof veCompVerificar === 'function') veCompVerificar();
    const n = (function conta(nos) { return nos.reduce((s, x) => s + (x.filhos ? conta(x.filhos) : 1), 0); })(r.camadas);
    veToast(`PSD ${r.nome}: ${n} ${veT(n === 1 ? 'camada' : 'camadas')}` + (r.avisos.length ? ` · ${r.avisos.length} ${veT('aviso(s) no painel Projeto')}` : ''));
    if (r.avisos.length) {
        m.psdAvisos = r.avisos;
        console.warn('[PSD] ' + r.nome + ':\n' + r.avisos.join('\n'));
    }
    if (opts.abrir !== false && !opts.soProjeto) veCompAbrir(m);   // mostra as camadas nas trilhas, como no AE
    return m;
}
