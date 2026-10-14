// =========================================================
// Pocket Editor — painel Pessoas (ideia do Pailer, GaIA 2026-10-14): o material do projeto é analisado em segundo
// plano, os rostos viram PERFIS (foto do rosto + nome, que o usuário dá e fica no projeto) e abrir um perfil mostra
// todas as cenas daquela pessoa. "Quem é?" acha a pessoa de uma foto ou do quadro do monitor.
// Regra: leve e nunca na frente da edição — a análise pausa no play, no export, no preparo do render, no render de
// Comp e no desenho das camadas de motion (ve_ps_pausar); o motor (Functions/busca_rosto.py) usa só os quadros-chave,
// prioridade ociosa, 1 núcleo, nada na placa, e guarda o índice de cada arquivo (cada um é analisado uma vez).
// API: VEPS_API.pessoas(), .analisar(), .quem(caminho, t), .buscar(caminho, t) → cenas.
// =========================================================
const VEPS = { job: null, pessoas: [], sel: null, fase: '', msg: '', pausado: false, ocupado: null, busca: null, auto: 0, parcial: 0 };
const VE_PS_FORTE = 0.45;

function vePsMidias() {
    return (VE.media || []).filter(m => m && !m.removido && m.path && !veMediaOffline(m) && (m.kind === 'video' || m.kind === 'image') && !m.comp)
        .map(m => ({ id: m.id, path: m.path, kind: m.kind, dur: m.dur || (m.info && m.info.duration) || null }));
}
const vePsApi = () => (window.pywebview && window.pywebview.api) || {};
const vePsDir = () => vePrPrefs().dir;
function vePsCos(a, b) { let s = 0; for (let i = 0; i < 128; i++) s += a[i] * b[i]; return s; }

// ── nomes guardados no projeto (VE.pessoas = [{nome, c:[128]}]) ──
function vePsNomeSalvo(c) {
    let best = null, nota = 0.5;
    for (const p of VE.pessoas || []) { if (!p.c) continue; const s = vePsCos(p.c, c); if (s >= nota) { best = p; nota = s; } }
    return best;
}
function vePsDarNome(chave, nome) {
    const p = VEPS.pessoas.find(x => x.chave === chave); if (!p) return;
    p.nome = nome.trim();
    VE.pessoas = VE.pessoas || [];
    const s = vePsNomeSalvo(p.c);
    if (s) { if (p.nome) { s.nome = p.nome; s.c = p.c; } else VE.pessoas.splice(VE.pessoas.indexOf(s), 1); }
    else if (p.nome) VE.pessoas.push({ nome: p.nome, c: p.c });
    if (!VE.dirty) { VE.dirty = true; if (typeof veUpdateTitle === 'function') veUpdateTitle(); }
}

// ── análise em segundo plano ──
function vePsProjetoAberto() {
    if (VEPS.job) vePsApi().ve_ps_cancelar?.(VEPS.job);
    Object.assign(VEPS, { job: null, pessoas: [], sel: null, fase: '', msg: '', busca: null });
    clearTimeout(VEPS.auto);
    let auto = true; try { auto = localStorage.getItem('ve_ps_auto') !== '0'; } catch (e) { /* padrão: ligado */ }
    // começa sozinho um tempo depois de abrir (o projeto termina de carregar e as prévias saem primeiro)
    if (auto) VEPS.auto = setTimeout(() => { if (VE.ready && !VEPS.job) vePsAnalisar(); }, 25000);
    vePsDesenhar();
}
async function vePsAnalisar() {
    const api = vePsApi(); if (!api.ve_ps_analisar || !VE.ready) return;
    if (VEPS.job) return;
    const r = await api.ve_ps_analisar(vePsMidias(), vePsDir(), VE.pessoas || []);
    if (!r || !r.success) { VEPS.msg = (r && r.error) || 'falhou'; vePsDesenhar(); return; }
    VEPS.job = r.id; VEPS.fase = 'iniciando';
    vePsVigiar();
    const passo = async () => {
        if (VEPS.job !== r.id) return;
        const e = await api.ve_ps_estado(r.id).catch(() => null);
        if (!e || !e.success) return;
        VEPS.fase = e.fase; VEPS.pausado = e.pausado;
        VEPS.msg = e.fase === 'modelo' ? 'Preparando o reconhecimento (na 1ª vez baixa 37 MB)…'
            : e.fase === 'analisando' ? `Analisando ${e.feitos}/${e.total}${e.atual ? ' · ' + e.atual : ''}` + (e.pausado ? ' — pausado enquanto você edita' : '')
            : e.fase === 'agrupando' ? 'Juntando os rostos por pessoa…' : e.fase === 'erro' ? 'Erro: ' + e.erro : '';
        if (e.fase === 'pronto') {
            VEPS.job = null; VEPS.pessoas = e.pessoas || []; VEPS.msg = '';
            if (e.falhas && e.falhas.length) console.warn('[pessoas] falhas:', e.falhas);
        } else if (['erro', 'cancelado'].includes(e.fase)) VEPS.job = null;
        else {
            // perfis aparecendo aos poucos (do que já foi analisado), sem atrapalhar: só com o painel à vista
            if (vePsVisivel() && Date.now() - VEPS.parcial > 30000 && e.fase === 'analisando' && !e.pausado) {
                VEPS.parcial = Date.now();
                const g = await api.ve_ps_agrupar(vePsMidias(), vePsDir(), VE.pessoas || []).catch(() => null);
                if (g && g.success && VEPS.job === r.id) VEPS.pessoas = g.pessoas;
            }
            setTimeout(passo, 1500);
        }
        if (!vePsAtual(e)) vePsDesenhar();
    };
    passo();
}
// durante a análise o painel só redesenha quando muda algo que aparece (texto do topo ou os perfis), não a cada 1,5 s
function vePsAtual(e) {
    const sig = VEPS.msg + '|' + VEPS.pessoas.length + '|' + (VEPS.job || 0);
    if (sig === VEPS._sig) return true;
    VEPS._sig = sig;
    const el = $ve('ve-ps'), est = el && el.querySelector('.ve-ps-est');
    if (est && VEPS.job && VEPS._nPessoas === VEPS.pessoas.length) { est.innerHTML = `<span class="ve-ps-roda${VEPS.pausado ? ' pausa' : ''}"></span>${veEsc(VEPS.msg)}`; return true; }
    VEPS._nPessoas = VEPS.pessoas.length;
    return false;
}
function vePsParar() { if (VEPS.job) vePsApi().ve_ps_cancelar(VEPS.job); }

// a edição tem prioridade: play, export, preparo do render, Comp ou motion sendo desenhados → a análise espera
function vePsVigiar() {
    if (VEPS._vig) return;
    VEPS._vig = setInterval(() => {
        const fila = typeof VEFILA !== 'undefined' ? VEFILA : null;
        const ocupado = !!(VE.playing || VE.exportRunning || (fila && (fila.preparando || fila.rodando))
            || (typeof VECOMP !== 'undefined' && VECOMP.atual) || (typeof VEMO !== 'undefined' && VEMO.assando > 0));
        if (ocupado !== VEPS.ocupado) { VEPS.ocupado = ocupado; vePsApi().ve_ps_pausar?.(ocupado); }
        if (!VEPS.job && !VEPS.busca) { clearInterval(VEPS._vig); VEPS._vig = null; VEPS.ocupado = null; vePsApi().ve_ps_pausar?.(false); }
    }, 800);
}

// ── quem é? (foto ou quadro do monitor) ──
async function vePsQuem(caminho, t = null, rotulo = '') {
    const api = vePsApi();
    if (VEPS.pessoas.length) {
        const q = await api.ve_ps_quem(caminho, VEPS.pessoas, t).catch(() => null);
        if (q && q.success && q.chave) { VEPS.sel = q.chave; vePsDesenhar(); veToast(`É ${VEPS.pessoas.find(p => p.chave === q.chave)?.nome || 'esta pessoa'} (${q.nota.toFixed(2)})`); return; }
    }
    // não está entre os perfis (aparece pouco, ou a análise ainda não chegou lá): busca direta pela foto
    const r = await api.ve_ps_buscar(caminho, vePsMidias(), vePsDir(), t, 0);
    if (!r || !r.success) { veToast((r && r.error) || 'a busca falhou'); return; }
    VEPS.busca = { id: r.id, rotulo: rotulo || caminho.split(/[\\/]/).pop(), caminho, t, res: null, fase: 'iniciando' };
    VEPS.sel = '__busca'; vePsVigiar(); vePsDesenhar();
    const passo = async () => {
        if (!VEPS.busca || VEPS.busca.id !== r.id) return;
        const e = await api.ve_ps_estado(r.id).catch(() => null);
        if (!e) return;
        VEPS.busca.fase = e.fase; VEPS.busca.msg = e.fase === 'analisando' ? `Analisando ${e.feitos}/${e.total}` : e.erro || '';
        if (e.fase === 'pronto' || e.fase === 'erro') { VEPS.busca.res = e.resultados || []; vePsDesenhar(); return; }
        vePsDesenhar(); setTimeout(passo, 1000);
    };
    passo();
}
async function vePsQuemFoto() { const r = await vePsApi().select_image('pessoas'); if (r && r.success) vePsQuem(r.path); }
function vePsQuemMonitor() {
    const T = VE.playhead;
    const o = VE.clips.filter(c => !veIsAudio(c) && !veOculto(c) && c.st <= T && veEnd(c) > T)
        .map(c => ({ c, m: VE.media[c.m] })).filter(o => o.m && o.m.path && (o.m.kind === 'video' || o.m.kind === 'image'))
        .sort((a, b) => b.c.tr - a.c.tr)[0];
    if (!o) { veToast('Nenhum vídeo ou foto na agulha'); return; }
    vePsQuem(o.m.path, o.m.kind === 'video' ? veSrcAt(o.c, T) : null, (o.c.nome || o.m.name) + ' · ' + veHuman(T));
}

// ── desenho ──
function vePsVisivel() { const el = $ve('ve-ps'); return !!(el && el.offsetParent); }
function vePsAbrir() { if (typeof vedShow === 'function') vedShow('pessoas'); vePsDesenhar(); if (!VEPS.job && !VEPS.pessoas.length && VE.ready) vePsAnalisar(); }
// miniaturas numa fila (2 de cada vez): cada uma pode abrir um ffmpeg — 49 de uma vez travavam a máquina e a página
const VE_PS_MINIS = { fila: [], ativos: 0, url: new Map() };
function vePsMini(el, path, t, caixa, lado) {
    const k = JSON.stringify([path, t, caixa, lado]);
    if (VE_PS_MINIS.url.has(k)) { el.style.backgroundImage = `url("${VE_PS_MINIS.url.get(k)}")`; return; }
    VE_PS_MINIS.fila.push({ el, path, t, caixa, lado, k });
    vePsMiniProx();
}
function vePsMiniProx() {
    while (VE_PS_MINIS.ativos < 2 && VE_PS_MINIS.fila.length) {
        const x = VE_PS_MINIS.fila.shift();
        if (!x.el.isConnected) continue;   // o painel foi redesenhado: pede de novo quando voltar
        VE_PS_MINIS.ativos++;
        vePsApi().ve_ps_mini(x.path, x.t, vePsDir(), x.caixa || null, x.lado)
            .then(r => { if (r && r.success) { VE_PS_MINIS.url.set(x.k, r.url); x.el.style.backgroundImage = `url("${r.url}")`; } })
            .catch(() => {}).finally(() => { VE_PS_MINIS.ativos--; vePsMiniProx(); });
    }
}
function vePsDesenhar() {
    const L = $ve('ve-ps'); if (!L) return;
    const topo = `<div class="ve-ps-topo">
        <div class="ve-ps-est">${VEPS.job ? `<span class="ve-ps-roda${VEPS.pausado ? ' pausa' : ''}"></span>${veEsc(VEPS.msg)}` : VEPS.pessoas.length ? `${VEPS.pessoas.length} pessoa(s) no projeto` : veEsc(VEPS.msg || 'Os rostos do projeto, agrupados por pessoa.')}</div>
        <div class="ve-ps-acoes">
            ${VEPS.job ? `<button class="ve-btn ve-btn-sm" onclick="vePsParar()">Parar</button>` : `<button class="ve-btn ve-btn-sm" onclick="vePsAnalisar()" title="Analisa o que ainda não foi visto (leve, pausa enquanto você edita)">${VEPS.pessoas.length ? 'Atualizar' : 'Analisar o projeto'}</button>`}
            <button class="ve-btn ve-btn-sm" onclick="vePsQuemFoto()" title="Acha a pessoa de uma foto">Quem é? (foto)</button>
            <button class="ve-btn ve-btn-sm" onclick="vePsQuemMonitor()" title="Acha a pessoa do quadro na agulha da timeline">Quem é? (monitor)</button>
        </div></div>`;
    if (VEPS.sel) { L.innerHTML = topo + vePsDetalheHtml(); vePsDetalheLigar(L); return; }
    if (!VEPS.pessoas.length) {
        L.innerHTML = topo + `<div class="ve-ps-vazio">${VEPS.job ? 'Os perfis aparecem aqui conforme a análise avança.' : 'Clique em "Analisar o projeto". Roda em segundo plano, só nos quadros-chave e pausa no play e no export; cada arquivo é analisado uma vez só.'}</div>`;
        return;
    }
    L.innerHTML = topo + `<div class="ve-ps-grade">${VEPS.pessoas.map(p => `<div class="ve-ps-card" data-k="${p.chave}">
        <button class="ve-ps-foto" data-abrir="${p.chave}" title="Ver as cenas"></button>
        <input class="ve-ps-nome" data-nome="${p.chave}" value="${veEsc(p.nome || '')}" placeholder="Sem nome" spellcheck="false">
        <small>${p.cenas} cena(s) · ${p.arquivos} arquivo(s)</small></div>`).join('')}</div>`;
    L.querySelectorAll('.ve-ps-card').forEach(card => {
        const p = VEPS.pessoas.find(x => x.chave === card.dataset.k);
        vePsMini(card.querySelector('.ve-ps-foto'), p.foto.path, p.foto.t, p.foto.caixa, 160);
    });
    L.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => { VEPS.sel = b.dataset.abrir; vePsDesenhar(); });
    L.querySelectorAll('[data-nome]').forEach(i => {
        i.onchange = () => vePsDarNome(i.dataset.nome, i.value);
        i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); };   // atalhos do editor não roubam o teclado
    });
}
function vePsCenas() {
    if (VEPS.sel === '__busca') return (VEPS.busca && VEPS.busca.res) || [];
    const p = VEPS.pessoas.find(x => x.chave === VEPS.sel); return p ? p.ocorrencias : [];
}
function vePsDetalheHtml() {
    const busca = VEPS.sel === '__busca', p = busca ? null : VEPS.pessoas.find(x => x.chave === VEPS.sel);
    if (!busca && !p) { VEPS.sel = null; return ''; }
    const cards = [];
    for (const o of vePsCenas()) for (const t of o.trechos) cards.push({ o, t, m: VE.media.find(x => x && x.id === o.id) || VE.media.find(x => x && x.path === o.path) });
    if (busca) cards.sort((a, b) => b.t.nota - a.t.nota);
    VEPS._cards = cards;
    const cab = busca
        ? `<div class="ve-ps-cab"><button class="ve-btn ve-btn-sm" data-voltar>←</button><div><b>${veEsc(VEPS.busca.rotulo)}</b><small>${VEPS.busca.res ? cards.length + ' cena(s) com essa pessoa' : veEsc(VEPS.busca.msg || 'Procurando…')}</small></div></div>`
        : `<div class="ve-ps-cab"><button class="ve-btn ve-btn-sm" data-voltar>←</button><span class="ve-ps-foto grande" data-foto></span>
            <div><input class="ve-ps-nome" data-nome="${p.chave}" value="${veEsc(p.nome || '')}" placeholder="Sem nome — escreva para guardar" spellcheck="false"><small>${p.cenas} cena(s) em ${p.arquivos} arquivo(s)</small></div></div>`;
    return cab + `<div class="ve-ps-cenas">${cards.slice(0, 300).map((x, i) => {
        const nome = (x.m && (x.m.name || x.m.nome)) || x.o.path.split(/[\\/]/).pop();
        const tempo = x.o.kind === 'image' ? 'foto' : `${veHuman(x.t.ini)}–${veHuman(x.t.fim)}`;
        return `<button class="ve-ps-cena${busca && x.t.nota < VE_PS_FORTE ? ' talvez' : ''}" data-i="${i}" title="${veEsc(nome)} · ${tempo}${busca ? ' · semelhança ' + x.t.nota.toFixed(2) : ''}">
            <span class="ve-ps-mini"></span><b>${veEsc(nome)}</b><small>${tempo}${busca ? ` · ${x.t.nota >= VE_PS_FORTE ? 'forte' : 'talvez'}` : ''}</small></button>`;
    }).join('')}</div>`;
}
function vePsDetalheLigar(L) {
    L.querySelector('[data-voltar]').onclick = () => { VEPS.sel = null; vePsDesenhar(); };
    const p = VEPS.pessoas.find(x => x.chave === VEPS.sel);
    const f = L.querySelector('[data-foto]'); if (f && p) vePsMini(f, p.foto.path, p.foto.t, p.foto.caixa, 160);
    L.querySelectorAll('[data-nome]').forEach(i => { i.onchange = () => vePsDarNome(i.dataset.nome, i.value); i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); }; });
    const minis = [...L.querySelectorAll('.ve-ps-cena')];
    minis.forEach(b => { const x = VEPS._cards[+b.dataset.i]; vePsMini(b.querySelector('.ve-ps-mini'), x.o.path, x.t.melhor, null, 320); });
    minis.forEach(b => b.onclick = () => vePsIr(VEPS._cards[+b.dataset.i]));
}
function vePsIr(x) {
    if (!x) return;
    const m = x.m;
    if (!m) { veToast('Esse arquivo não está no projeto'); return; }
    if (m.kind === 'image') {
        if (typeof VEPJ !== 'undefined') { VEPJ.sel.clear(); VEPJ.sel.add(m.id); if (typeof vePjRender === 'function') vePjRender(); }
        veToast(`${m.name}: selecionada no Projeto`);
        return;
    }
    veSrcOpen(m.id);
    const t0 = Date.now();
    const ir = () => {   // espera o monitor de origem carregar e pula para o começo do trecho
        const v = typeof VESRC !== 'undefined' && VESRC.video;
        if (v && v.readyState >= 1) { v.currentTime = Math.max(0, x.t.ini); return; }
        if (Date.now() - t0 < 8000) setTimeout(ir, 120);
    };
    ir();
}

window.VEPS_API = {
    pessoas: () => VEPS.pessoas.map(p => ({ chave: p.chave, nome: p.nome, cenas: p.cenas, arquivos: p.arquivos, foto: p.foto, ocorrencias: p.ocorrencias })),
    analisar: vePsAnalisar, abrir: vePsAbrir, nomear: vePsDarNome,
    // para o agente: busca direta por foto/quadro, sem painel → [{id, path, kind, nota, trechos:[{ini, fim, nota, melhor}]}]
    async buscar(caminho, t = null) {
        const api = vePsApi();
        const r = await api.ve_ps_buscar(caminho, vePsMidias(), vePsDir(), t, 0);
        if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
        for (;;) {
            await new Promise(ok => setTimeout(ok, 600));
            const e = await api.ve_ps_estado(r.id);
            if (['pronto', 'erro', 'cancelado'].includes(e.fase)) { if (e.fase !== 'pronto') throw new Error(e.erro || e.fase); return e.resultados; }
        }
    },
};
