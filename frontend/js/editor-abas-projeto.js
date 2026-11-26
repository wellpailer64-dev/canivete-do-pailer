// Abas de projeto do Vídeo Kanivete: vários projetos abertos, um por aba, alternando com um clique.
// Só o projeto da aba ativa existe de verdade no editor (vídeo, áudio, miniaturas, prévias). Os outros ficam
// guardados como dados (o mesmo JSON do .vknv), sem tocar nada nem gastar CPU/GPU/RAM de mídia: trocar de aba
// guarda o atual e reabre o outro pelo mesmo caminho de "abrir projeto".
const VEAP = { abas: [], ativa: null, seq: 0, trocando: false, abrindo: false, fechando: false, novaAba: false, poupar: false, _sig: '', _wd: 0, _raf: 0 };

function veApBloqueado() {
    const render = VE.exportRunning || (typeof VEFILA !== 'undefined' && (VEFILA.preparando || VEFILA.rodando));
    if (render) veToast(veT('Render em andamento: aguarde para trocar de projeto'));
    return !!(render || VEAP.trocando || VEAP.abrindo || VEAP.fechando || VE._salvandoProjeto || VE._pendingProject || (!VE.ready && VE.path && !$ve('ve-loading').hidden));
}

async function veApSuspender() {
    const api = window.pywebview && window.pywebview.api;
    if (api && api.ve_projeto_suspender) {
        const r = await api.ve_projeto_suspender();
        if (r && r.geracao != null) VE._projetoGeracao = r.geracao;
    }
    clearTimeout(VE._autoLogoT);
    if (typeof VEPJF !== 'undefined') { VEPJF.fila = []; VEPJF.ativos.clear(); VEPJF.fundo = null; }
    if (typeof vePrAutoParar === 'function') vePrAutoParar();
}

function veApFalhou() {
    clearTimeout(VEAP._wd);
    VEAP.trocando = VEAP.novaAba = VEAP.poupar = false;
    VE._trocaAba = false;
    VE._pendingProject = null;
    veLoading(null);
    if (veApAba(VEAP.ativa)?.snap) VEAP.ativa = null;
    veApRender();
}

function veApNome(a) {
    if (a.path) return a.path.split(/[\\/]/).pop().replace(/\.(vknv|vcnvt|prproj)$/i, '');
    if (a.video) return a.video.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    return typeof veT === 'function' ? veT('Sem título') : 'Sem título';
}

function veApAba(id) { return VEAP.abas.find(a => a.id === id) || null; }

// Guarda o estado vivo do editor na aba (só o JSON do projeto)
function veApGuardar(a) {
    if (!a || !VE.ready) return;
    a.snap = JSON.parse(JSON.stringify(veProjectData({ abas: true })));
    a.estado = { history: VE.history.slice(), future: VE.future.slice(), openSequences: (VE.openSequences || []).slice(),
        removidas: VE.media.filter(m => m.removido).map(m => m.id), criadas: VE.media.filter(m => m._criada).map(m => m.id) };
    a.path = VE.projectPath || null;
    a.video = VE.path || null;
    a.dirty = !!VE.dirty;
    a.nome = veApNome(a);
}

// Chamada antes de abrir OUTRO projeto por cima: o atual vira aba guardada e não pede mais para descartar
function veApPoupar() {
    if (!VE.ready || VE.quickEdit || VEAP.trocando) return false;
    let a = veApAba(VEAP.ativa);
    if (!a) { a = { id: ++VEAP.seq }; VEAP.abas.push(a); VEAP.ativa = a.id; }
    veApGuardar(a);
    VEAP.poupar = true;
    VEAP.novaAba = true;
    veApRender();
    return true;
}

// A abertura do outro projeto não aconteceu (cancelou o seletor, erro): a aba atual continua sendo a dele
function veApCancelar() { VEAP.novaAba = false; VEAP.poupar = false; }

// Chamada por veUpdateTitle: mantém a aba ativa em dia com o editor
function veApAtualizar() {
    if (VEAP.trocando) return;
    if (!VE.ready) { veApRender(); return; }
    if (VE.quickEdit) {   // quick edit descarta o projeto anterior: some a aba dele
        if (VEAP.ativa != null) { VEAP.abas = VEAP.abas.filter(a => a.id !== VEAP.ativa); VEAP.ativa = null; }
        veApRender();
        return;
    }
    let a = veApAba(VEAP.ativa);
    if (!a || VEAP.novaAba) {
        a = { id: ++VEAP.seq };
        VEAP.abas.push(a);
        VEAP.ativa = a.id;
        VEAP.novaAba = false;
    }
    a.path = VE.projectPath || null;
    a.video = VE.path || null;
    a.dirty = !!VE.dirty;
    a.nome = veApNome(a);
    veApRender();
}

// Depois que o projeto da aba carregou (hook em veApplyProject)
function veApAplicado(ids) {
    VEAP.poupar = false;
    if (!VEAP.trocando) return false;
    VEAP.trocando = false;
    VE._trocaAba = false;
    clearTimeout(VEAP._wd);
    const a = veApAba(VEAP.ativa);
    if (a) {
        VE.dirty = !!a.dirty;
        const estado = a.estado;
        if (estado) {
            const mid = id => ids[id] ?? id;
            const historico = snap => {
                const d = JSON.parse(snap);
                (d.clips || []).forEach(c => { if (c.m != null) c.m = mid(c.m); });
                if (d.comps) d.comps = d.comps.map(mid);
                if (d.c3d) d.c3d = Object.fromEntries(Object.entries(d.c3d).map(([id, cena]) => [mid(id), cena]));
                return JSON.stringify(d);
            };
            VE.history = estado.history.map(historico);
            VE.future = estado.future.map(historico);
            VE.openSequences = estado.openSequences.filter(id => VE.sequences.some(s => s.id === id));
            const removidas = new Set(estado.removidas.map(mid));
            VE.media.forEach(m => { m.removido = removidas.has(m.id); });
            estado.criadas.forEach(id => { if (VE.media[mid(id)]) VE.media[mid(id)]._criada = true; });
            veUpdateUndo();
            veSeqTabsRender();
            vePjRender();
        }
        a.snap = null;
        a.estado = null;
    }
    return true;
}

async function veApAtivar(id, opts = {}) {
    if (id === VEAP.ativa) return true;
    if (veApBloqueado()) return false;
    const alvo = veApAba(id);
    if (!alvo) return false;
    if (!alvo.snap) {   // aba sem cópia guardada: relê o projeto do disco
        if (!alvo.path) { veToast(veT('Não foi possível abrir')); return false; }
        VEAP.abrindo = true;
        try {
            const r = await window.pywebview.api.ve_project_open(alvo.path);
            if (!r || !r.success) { veToast((r && r.error) || veT('Não foi possível abrir')); return false; }
            alvo.snap = r.data; alvo.faltando = r.missing || [];
        } catch (e) { veToast(veT('Não foi possível abrir') + ': ' + String(e)); return false; }
        finally { VEAP.abrindo = false; }
        if (VEAP.trocando) return false;
    }
    const atual = veApAba(VEAP.ativa);
    if (atual && !opts.descartarAtual) veApGuardar(atual);
    const d = alvo.snap;
    VEAP.trocando = true;
    try { await veApSuspender(); }
    catch (e) { VEAP.trocando = false; veToast(String(e)); return false; }
    VE._trocaAba = true;
    VEAP.ativa = id;
    VEAP.novaAba = false;
    clearTimeout(VEAP._wd);
    VEAP._wd = setTimeout(() => { veApSuspender().catch(console.warn); VE.ready = false; veApFalhou(); veToast(veT('Não foi possível abrir: tempo esgotado')); }, 60000);
    VE.quickEdit = false;
    VE.quickEditPending = false;
    VE.startScreenDismissed = true;
    const pend = { data: d, path: alvo.path, name: alvo.nome + '.vknv', missing: alvo.faltando || [], premiere: null };
    VE._pendingProject = pend;
    if (!d.video) veOpenLostProject();
    else veOpenPath(d.video);
    veApRender();
    return true;
}

async function veApFechar(id, ev) {
    if (ev) ev.stopPropagation();
    if (veApBloqueado()) return false;
    const a = veApAba(id);
    if (!a) return;
    const ativa = id === VEAP.ativa;
    VEAP.fechando = true;
    try {
    if (ativa) veApGuardar(a);
    if (a.dirty) {
        const botoes = [{ rotulo: veT('Cancelar'), valor: null }, { rotulo: veT('Não salvar'), valor: 'descartar', tipo: 'perigo' }];
        botoes.push({ rotulo: veT('Salvar'), valor: 'salvar', tipo: 'primario' });
        const r = await appConfirm({ titulo: veT('Salvar o projeto antes de fechar?'), texto: `${a.nome}: ${veT('há alterações não salvas.')}`, botoes });
        if (!r) return;
        if (r === 'salvar') {
            if (ativa) { if (!(await veSaveProject())) return; }
            else {
                const dados = { ...a.snap, media: a.snap.media.filter(m => !a.estado.removidas.includes(m.id)) };
                const s = await window.pywebview.api.ve_project_save(a.path, JSON.stringify(dados), !a.path, null);
                if (!s || !s.success) { veToast(veT('Não foi possível salvar') + (s && s.error ? ': ' + s.error : '')); return; }
            }
        }
    }
    const i = VEAP.abas.indexOf(a);
    const prox = VEAP.abas[i + 1] || VEAP.abas[i - 1] || null;
    if (!ativa) { VEAP.abas.splice(i, 1); veApRender(); return; }
    if (prox) {
        VEAP.abas.splice(i, 1);
        VEAP.ativa = null;
        VEAP.fechando = false;
        await veApAtivar(prox.id, { descartarAtual: true });
    } else { await veApSuspender(); veCloseProject(); }
    } catch (e) { veToast(veT('Não foi possível fechar') + ': ' + String(e)); return false; }
    finally {
        VEAP.fechando = false;
        if (VEAP.ativa === id && VE.ready && !VEAP.trocando) { a.snap = null; a.estado = null; }
    }
}

function veApFecharAtiva() { if (VEAP.ativa != null) return veApFechar(VEAP.ativa); if (!veApBloqueado() && VE.ready && veConfirmDiscard()) veCloseProject(); }

// Fechar o editor inteiro: só pergunta pelos outros projetos com alteração
async function veApConfirmarFecharTudo() {
    if (VEAP.abrindo || VEAP.trocando || VEAP.fechando) return false;
    const sujos = VEAP.abas.filter(a => a.id !== VEAP.ativa && a.dirty);
    if (!sujos.length) return true;
    const r = await appConfirm({ titulo: veT('Fechar todos os projetos?'),
        texto: `${veT('Projetos com alterações não salvas')}: ${sujos.map(a => a.nome).join(', ')}`,
        botoes: [{ rotulo: veT('Cancelar'), valor: null }, { rotulo: veT('Fechar sem salvar'), valor: 1, tipo: 'perigo' }] });
    return !!r;
}

function veApLimpar() { clearTimeout(VEAP._wd); VEAP.abas = []; VEAP.ativa = null; VEAP.novaAba = VEAP.poupar = VEAP.trocando = false; veApRender(); }

function veApNovo() { if (typeof veNovoProjeto === 'function') veNovoProjeto(); }

function veApRender() {
    const box = document.getElementById('ve-ptabs');
    if (!box) return;
    const mostrar = !VE.quickEdit && VEAP.abas.length > 0;
    const sig = mostrar ? VEAP.abas.map(a => `${a.id}|${a.nome}|${a.dirty ? 1 : 0}|${a.id === VEAP.ativa ? 1 : 0}`).join('~') : '';
    if (sig === VEAP._sig && box.hidden === !mostrar) return;
    VEAP._sig = sig;
    box.hidden = !mostrar;
    if (!mostrar) { box.innerHTML = ''; return; }
    const esc = typeof veEsc === 'function' ? veEsc : s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = VEAP.abas.map(a => `<div class="ve-ptab${a.id === VEAP.ativa ? ' active' : ''}" data-id="${a.id}" title="${esc(a.path || a.nome)}" `
        + `onclick="veApAtivar(${a.id})" onauxclick="if(event.button===1)veApFechar(${a.id},event)">`
        + `<span class="ve-ptab-nome"><span>${esc(a.nome)}</span></span>`
        + `${a.dirty ? '<i class="ve-ptab-dirty" title="Alterações não salvas"></i>' : ''}`
        + `<button title="${esc(veT('Fechar projeto'))}" onclick="veApFechar(${a.id},event)"><svg class="i"><use href="#i-x"/></svg></button></div>`).join('')
        + `<button class="ve-ptab-novo" title="${esc(veT('Novo projeto (em outra aba)'))}" onclick="veApNovo()"><svg class="i"><use href="#i-plus"/></svg></button>`;
    veApAgendarMedir();
    box.querySelector('.ve-ptab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function veApAgendarMedir() {
    if (!VEAP._raf) VEAP._raf = requestAnimationFrame(() => { VEAP._raf = 0; veApMedir(); });
}

// Nome que não cabe na aba: o texto corre de um lado a outro para mostrar o resto
function veApMedir() {
    document.querySelectorAll('#ve-ptabs .ve-ptab-nome').forEach(c => {
        const t = c.firstElementChild;
        const sobra = Math.ceil(t.scrollWidth - c.clientWidth);
        if (sobra > 2) {
            c.classList.add('anima');
            c.style.setProperty('--ap-dx', `-${sobra + 4}px`);
            c.style.setProperty('--ap-dur', `${Math.max(6, 4 + sobra / 14).toFixed(1)}s`);
        } else { c.classList.remove('anima'); c.style.removeProperty('--ap-dx'); }
    });
}
window.addEventListener('resize', () => { if (VEAP.abas.length) veApAgendarMedir(); });

// Para o agente (MCP/CDP): listar e trocar
function veApLista() { return VEAP.abas.map(a => ({ id: a.id, nome: a.nome, caminho: a.path, ativa: a.id === VEAP.ativa, naoSalvo: a.id === VEAP.ativa ? !!VE.dirty : !!a.dirty })); }
function veApAtivarPorNome(txt) {
    const t = String(txt).toLowerCase();
    if (!t.trim()) return false;
    const exatas = VEAP.abas.filter(x => String(x.id) === t || x.nome.toLowerCase() === t);
    const parciais = VEAP.abas.filter(x => x.nome.toLowerCase().includes(t));
    const a = exatas.length === 1 ? exatas[0] : !exatas.length && parciais.length === 1 ? parciais[0] : null;
    return a ? veApAtivar(a.id) : false;
}
