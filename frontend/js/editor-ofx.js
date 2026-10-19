// Plugins de imagem OpenFX no Vídeo Kanivete (Functions/ofx.py — hospedeiro próprio, num processo à parte).
// Etapa 1: os efeitos OFX instalados aparecem no painel Efeitos (bloco "Plugins OFX", recolhido; abre ao clicar ou ao
// buscar), em grupos pelo "grouping" do plugin; ⌫ arquiva um efeito ou o grupo todo (somem do painel; "Arquivados"
// restaura).
// Etapa 2: duplo clique aplica no clipe selecionado. Cada efeito OFX vira um tipo próprio em VE_FX ('ofx:<id do
// plugin>') montado a partir dos ajustes do plugin (main.py ve_ofx_params): número (com cronômetro), caixinha, lista,
// cor; 2D/3D = um controle por eixo; RGB(A) fora de 0..1 (ganho, gama) = um controle para os três canais. A descrição
// vai junto no efeito (f.o), para o projeto abrir em outro PC. Prévia e exportação são as etapas 3–4
// (Instructions/agente/plugins.md); até lá o efeito é "neutro" (não muda a imagem nem entra na exportação).

const VEOFX = { lista: null, procurando: false, erro: '', aberto: false, verArq: false, grupos: {}, ligado: false };

// arquivados: caminho|id, guardado neste PC (como os VST3, editor-plugins.js)
const VEOFX_ARQ_K = 've-ofx-arquivados';
const veOfxChave = p => p.caminho + '|' + (p.id || '');
function veOfxArqLer() { try { return new Set(JSON.parse(localStorage.getItem(VEOFX_ARQ_K) || '[]')); } catch (e) { return new Set(); } }
function veOfxArquivar(lista, sim) {
    const s = veOfxArqLer();
    lista.forEach(p => { if (sim) s.add(veOfxChave(p)); else s.delete(veOfxChave(p)); });
    try { localStorage.setItem(VEOFX_ARQ_K, JSON.stringify([...s])); } catch (e) {}
}

function veOfxProcurar(atualizar) {
    const api = window.pywebview && window.pywebview.api;
    if (VEOFX.procurando) return;
    // a ponte com o Python ainda não chegou (painel desenhado no começo): tenta de novo daqui a pouco
    if (!api || !api.video_cutter_prepare) { clearTimeout(VEOFX.tEspera); VEOFX.tEspera = setTimeout(() => { if (VEOFX.lista == null) veRenderFxList(); }, 1000); return; }
    if (!api.ve_ofx_lista) { VEOFX.lista = []; VEOFX.erro = veT('reabra o app para procurar os plugins'); return; }
    VEOFX.procurando = true;
    api.ve_ofx_lista(!!atualizar).then(r => {
        VEOFX.procurando = false;
        VEOFX.lista = (r && r.plugins) || [];
        VEOFX.erro = r && !r.success ? (r.error || '?') : '';
        veRenderFxList();
    }).catch(e => { VEOFX.procurando = false; VEOFX.lista = []; VEOFX.erro = String(e); veRenderFxList(); });
}

// efeitos que fazem sentido num clipe: filtro, geral (com entrada), transição ou gerador; sem os de estéreo (Views)
const veOfxUtil = p => !p.erro && (p.contextos || []).length && !/^views/i.test(p.grupo || '');
const veOfxGrupo = p => (p.grupo || 'Outros').split('/')[0] || 'Outros';
const veOfxNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// o bloco "Plugins OFX" do painel Efeitos (editor-fx.js veRenderFxList chama com a busca já normalizada)
function veOfxItensHtml(q) {
    veOfxLigar();
    if (VEOFX.lista == null) { veOfxProcurar(false); return '<div class="ve-fx-cat ve-ofx-cab">Plugins OFX <small>procurando…</small></div>'; }
    const esc = s => veEsc(String(s || ''));
    const arq = veOfxArqLer();
    const todos = VEOFX.lista.map((p, i) => [p, i]).filter(([p]) => veOfxUtil(p));
    const vis = todos.filter(([p]) => !arq.has(veOfxChave(p)));
    const arqs = todos.filter(([p]) => arq.has(veOfxChave(p)));
    const bate = ([p]) => !q || veOfxNorm(p.nome + ' ' + p.grupo + ' ' + p.id).includes(q);
    const achados = vis.filter(bate);
    if (q && !achados.length) return '';
    const aberto = VEOFX.aberto || !!q;
    let html = `<div class="ve-fx-cat ve-ofx-cab" data-ofx-cab="1" title="${veT('Plugins de imagem OpenFX instalados no PC')}">`
        + `<b>${aberto ? '▾' : '▸'}</b> Plugins OFX <small>${q ? achados.length + ' / ' : ''}${vis.length}</small>`
        + `<span class="ve-ofx-proc" data-ofx-proc="1" title="${veT('Procurar plugins de novo')}">↻</span></div>`;
    if (!aberto) return html;
    if (!todos.length) return html + `<div class="ve-clips-empty">${veT('Nenhum plugin OFX instalado')} ${VEOFX.erro ? '(' + esc(VEOFX.erro) + ')' : ''}</div>`;
    const grupos = {};
    achados.forEach(x => (grupos[veOfxGrupo(x[0])] = grupos[veOfxGrupo(x[0])] || []).push(x));
    VEOFX.grupos = grupos;
    Object.keys(grupos).sort((a, b) => a.localeCompare(b)).forEach(g => {
        const l = grupos[g].sort((a, b) => a[0].nome.localeCompare(b[0].nome));
        html += `<div class="ve-fx-cat ve-ofx-sub">${esc(g)} <small>${l.length}</small>`
            + `<span class="ve-plg-arq" data-ofx-arqg="${esc(g)}" title="${veT('Arquivar o grupo todo')}">⌫</span></div>`
            + l.map(([p, i]) => `<div class="ve-fx-item ve-ofx-item" data-ofx="${i}" title="${veT('Duplo clique aplica no clipe selecionado')}\n${esc(p.descricao || p.nome)}\n${esc(p.id)} · ${esc(p.caminho)}">`
                + `<i>ofx</i><span>${esc(p.nome)}</span><small>${esc((p.grupo || '').split('/').slice(1).join(' / ') || 'OFX')}</small>`
                + `<span class="ve-plg-arq" data-ofx-arq="${i}" title="${veT('Arquivar (some do painel)')}">⌫</span></div>`).join('');
    });
    if (arqs.length && !q) {
        html += `<div class="ve-fx-cat ve-ofx-sub" data-ofx-verarq="1"><b>${VEOFX.verArq ? '▾' : '▸'}</b> ${veT('Arquivados')} <small>${arqs.length}</small>`
            + (VEOFX.verArq ? `<span class="ve-ofx-proc" data-ofx-desall="1" title="${veT('Restaurar todos')}">↩ ${veT('todos')}</span>` : '') + '</div>';
        if (VEOFX.verArq) html += arqs.map(([p, i]) => `<div class="ve-fx-item ve-ofx-item ve-plg-arquivado" data-ofx-des="${i}" title="${veT('Clique para restaurar')}"><i>↩</i><span>${esc(p.nome)}</span><small>${esc(veOfxGrupo(p))}</small></div>`).join('');
    }
    return html;
}

// cliques do bloco (a lista é a mesma do painel; ligado uma vez)
function veOfxLigar() {
    const list = $ve('ve-fx-list');
    if (!list || VEOFX.ligado) return;
    VEOFX.ligado = true;
    list.addEventListener('click', e => {
        const t = e.target, L = VEOFX.lista || [];
        let el;
        if ((el = t.closest('[data-ofx-proc]'))) { e.stopPropagation(); VEOFX.lista = null; veOfxProcurar(true); veRenderFxList(); return; }
        if ((el = t.closest('[data-ofx-desall]'))) { veOfxArquivar(L.filter(veOfxUtil), false); veRenderFxList(); return; }
        if ((el = t.closest('[data-ofx-arqg]'))) { veOfxArquivar((VEOFX.grupos[el.dataset.ofxArqg] || []).map(x => x[0]), true); veRenderFxList(); return; }
        if ((el = t.closest('[data-ofx-arq]'))) { const p = L[+el.dataset.ofxArq]; if (p) veOfxArquivar([p], true); veRenderFxList(); return; }
        if ((el = t.closest('[data-ofx-des]'))) { const p = L[+el.dataset.ofxDes]; if (p) veOfxArquivar([p], false); veRenderFxList(); return; }
        if ((el = t.closest('[data-ofx-verarq]'))) { VEOFX.verArq = !VEOFX.verArq; veRenderFxList(); return; }
        if ((el = t.closest('[data-ofx-cab]'))) { VEOFX.aberto = !VEOFX.aberto; veRenderFxList(); }
    });
    list.addEventListener('dblclick', e => {
        const el = e.target.closest('[data-ofx]'); if (!el) return;
        const p = (VEOFX.lista || [])[+el.dataset.ofx];
        if (p) veOfxAplicar(p);
    });
}

// para testes e para a Kani: VEOFX_API.lista(atualizar) → Promise da lista; .arquivar(nome|grupo, sim); .visiveis()
window.VEOFX_API = {
    lista: atualizar => new Promise(ok => {
        if (VEOFX.lista && !atualizar) return ok(VEOFX.lista);
        VEOFX.lista = null; veOfxProcurar(!!atualizar);
        const t = setInterval(() => { if (VEOFX.lista) { clearInterval(t); ok(VEOFX.lista); } }, 200);
    }),
    arquivar: (nome, sim = true) => {
        const n = veOfxNorm(nome), l = (VEOFX.lista || []).filter(p => veOfxUtil(p) && (veOfxNorm(p.nome) === n || veOfxNorm(veOfxGrupo(p)) === n));
        veOfxArquivar(l, sim); veRenderFxList(); return l.length;
    },
    visiveis: () => { const a = veOfxArqLer(); return (VEOFX.lista || []).filter(p => veOfxUtil(p) && !a.has(veOfxChave(p))).map(p => p.nome); },
};

// ── etapa 2: o efeito OFX no clipe ──
// ajustes que não fazem sentido no Kanivete (máscara não ligada, interação com a tela do Natron)
const VEOFX_ESCONDE = new Set(['maskInvert', 'interactive', 'hidpi', 'premultChanged', 'transformInteractOpen', 'transformCenterChanged']);
const veOfxK = (n, j) => 'o_' + String(n).replace(/\W/g, '_') + (j == null ? '' : '_' + j);

// faixa do controle: a de exibição do plugin, senão a absoluta, senão em volta do padrão
function veOfxFaixa(q, j, int) {
    j = j ?? 0;   // valor único: posição 0 (a chave fica sem o sufixo)
    const def = +(q.def[j] ?? 0);
    let lo = q.dmin[j] ?? q.min[j], hi = q.dmax[j] ?? q.max[j];
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo || hi - lo > 1e5) {
        lo = Math.min(0, def * 2); hi = Math.max(int ? 10 : 1, Math.abs(def) * 2 || (int ? 10 : 1));
    }
    let step = int ? 1 : (q.passo > 0 && q.passo <= (hi - lo) / 10 ? q.passo : (hi - lo) / 200);
    if (!int) step = +step.toPrecision(2);
    return { min: lo, max: hi, step, def };
}

const veOfxHex = rgb => '#' + rgb.slice(0, 3).map(x => Math.round(Math.min(1, Math.max(0, +x || 0)) * 255).toString(16).padStart(2, '0')).join('');

// o tipo do efeito em VE_FX a partir da descrição o = {caminho, pid, nome, versao, contexto, clipes, params}
function veOfxDef(o) {
    const t = 'ofx:' + o.pid;
    if (VE_FX[t] && VE_FX[t]._chave === o.caminho + '|' + o.versao) return t;
    const ps = [];
    (o.params || []).forEach(q => {
        if (VEOFX_ESCONDE.has(q.n)) return;
        const base = { nome: q.rotulo, dica: q.dica, un: '' };
        const num = (j, nome, int) => ps.push({ ...base, k: veOfxK(q.n, j), nome, ...veOfxFaixa(q, j, int), ofx: { n: q.n, j } });
        const tp = q.tipo, n = { Double: 1, Integer: 1, Double2D: 2, Integer2D: 2, Double3D: 3, Integer3D: 3 }[tp];
        if (tp === 'Boolean') ps.push({ ...base, k: veOfxK(q.n), tipo: 'bool', def: q.def[0] ? 1 : 0, ofx: { n: q.n } });
        else if (tp === 'Choice') ps.push({ ...base, k: veOfxK(q.n), tipo: 'lista', opcoes: q.opcoes.length ? q.opcoes : ['—'],
            min: 0, max: Math.max(0, q.opcoes.length - 1), step: 1, def: +q.def[0] || 0, ofx: { n: q.n } });
        else if (tp === 'RGB' || tp === 'RGBA') {
            const dentro = [0, 1, 2].every(j => (q.dmin[j] ?? 0) >= 0 && (q.dmax[j] ?? 1) <= 1);
            if (dentro) ps.push({ ...base, k: veOfxK(q.n), tipo: 'cor', gotas: false, def: veOfxHex(q.def), ofx: { n: q.n, cor: 1 } });
            else ps.push({ ...base, k: veOfxK(q.n), ...veOfxFaixa(q, 0, false), ofx: { n: q.n, rgb: 1 } });   // ganho, gama…: os 3 juntos
        } else if (n === 1) num(null, q.rotulo, tp === 'Integer');
        else if (n) for (let j = 0; j < n; j++) num(j, `${q.rotulo} ${'XYZ'[j]}`, tp.startsWith('Integer'));
    });
    VE_FX[t] = {
        nome: o.nome, cat: 'Plugins OFX', tag: 'OFX', params: ps, o, _chave: o.caminho + '|' + o.versao,
        nota: 'Plugin OFX. A prévia e a exportação com o efeito chegam na próxima etapa: por enquanto ele não muda a imagem.',
        junto: () => ({ o }),
        neutro: () => true,   // etapa 3–4: some este "true" quando a prévia/exportação existirem
        draw: a => a,
    };
    return t;
}

// efeitos OFX de um projeto aberto: monta o tipo de cada um pela descrição guardada no efeito
function veOfxRegistrarClipes(clips) {
    (clips || []).forEach(c => (c && c.fx || []).forEach(f => {
        if (f.t && f.t.startsWith('ofx:') && f.o && !VE_FX[f.t]) veOfxDef(f.o);
    }));
}

// duplo clique num efeito do bloco: pede os ajustes ao plugin (num processo à parte) e aplica no clipe selecionado
async function veOfxAplicar(p, i = VE.sel) {
    if (i < 0) { veToast('Selecione um clipe na timeline'); return; }
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_ofx_params) { veToast(veT('reabra o app para usar plugins OFX')); return; }
    veToast(`${p.nome}: ${veT('lendo os ajustes do plugin…')}`);
    const r = await api.ve_ofx_params(p.caminho, p.id);
    if (!r || !r.success) { veToast(`${p.nome}: ${(r && r.error) || '?'}`); return; }
    const t = veOfxDef({ caminho: p.caminho, pid: r.pid, nome: r.nome, versao: r.versao, contexto: r.contexto, clipes: r.clipes, params: r.params });
    veFxAdd(i, t);
}
