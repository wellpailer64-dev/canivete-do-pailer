// =========================================================
// Pocket Editor — AutoFrame Customizado: modelos de cliente
// Aba ao lado do Quick AutoFrame. Cada modelo guarda a identidade de um cliente (nome e cor do card, logo, paleta,
// fonte, intro, logo no canto, encerramento, estilo de edição, transições e músicas que se alternam); ficam em
// %APPDATA%/CaniveteDoPailer/autoframe_modelos (Functions/autoframe_modelos.py). "Começar" abre o fluxo do
// AutoFrame (mídias → análise → plano) com o modelo travado; veAfcPreparar/veAfcExtras acrescentam a identidade
// à timeline gerada por veAfClipes (editor-autoframe.js).
// =========================================================

const VEAFC = { lista: null, ed: null, apagar: false, quick: null };

const VE_AFC_INTRO = { animada: 'Animada (fotos + logo)', logo_cor: 'Simples (logo na cor)', logo_cena: 'Logo sobre as cenas', video: 'Meu arquivo de vídeo', comp: 'Minha Comp', nenhuma: 'Sem intro' };
const VE_AFC_FIM = { animada: 'Animado', logo_cor: 'Simples (logo na cor)', video: 'Meu arquivo de vídeo', comp: 'Minha Comp', nenhum: 'Sem encerramento' };
// intro/encerramento que vêm prontos (arquivo de vídeo ou uma Comp guardada no modelo: pacote de editor-comp.js)
const veAfcPronto = t => t === 'video' || t === 'comp';
const VE_AFC_ANIM = { pop: 'Pop', fade: 'Fade', zoom: 'Zoom lento' };
const VE_AFC_ESTILOS = { auto: 'Automático', dinamico: 'Dinâmico', batida: 'Batida', memorias: 'Memórias', drop: 'Drop', viagem: 'Viagem', cinematico: 'Cinemático' };
const VE_AFC_LOOKS = { estilo: 'Do estilo', vivo: 'Vivo', suave: 'Tons suaves', quente: 'Quente', filme: 'Filme', nenhum: 'Natural' };
const VE_AFC_TRANS = ['dissolve', 'crossfade', 'fadeblack', 'push', 'slide', 'pull', 'pop', 'chicote', 'fold', 'splith', 'splitv',
    // sobreposições (editor-ovt.js): camada por cima do corte
    'ovt:zoomin', 'ovt:zoomout', 'ovt:panblur', 'ovt:spin', 'ovt:stretch', 'ovt:lens', 'ovt:glitch', 'ovt:flash', 'ovt:flare', 'ovt:leak'];
const veAfcTrNome = t => t.startsWith('ovt:') ? (typeof VE_OVT === 'object' && VE_OVT[t.slice(4)] ? '✦ ' + veT(VE_OVT[t.slice(4)].nome) : t) : veT(VE_TR[t] ? VE_TR[t].nome : t);
const VE_AFC_FREQ = { base: 'Onde o estilo pede', tres: '1 a cada 3 cortes', todos: 'Todo corte' };
const VE_AFC_CANTOS = { nao: 'Não', se: '↖', sd: '↗', ie: '↙', id: '↘' };

function veAfcNovo() {
    return {
        nome: '', cor: '#F97316', logo: null,
        paleta: { primaria: '#111111', secundaria: '#F97316', texto: '#ffffff' }, fonte: 'Arial',
        intro: { tipo: 'animada', seg: 3, anim: 'pop', texto: '', video: null, transparente: false },
        marca: { pos: 'sd', tam: 16, op: 90 },
        fim: { tipo: 'animada', compassos: 'auto', texto: '', video: null },
        estilo: 'dinamico', look: 'estilo', trans: [], transFreq: 'base', flashMarca: false, todas: true, sfx: true,
        dur: 0, telas: 'sim', inicioModo: 'agitada', musicas: [], musicaProx: 0,
    };
}

function veAfcCarregar() {
    const api = veAfApi();
    if (!api || !api.afm_listar) return;
    api.afm_listar().then(r => { VEAFC.lista = (r && r.success && r.modelos) || []; veAfRender(); });
}

// URL de um arquivo do modelo (salvo: _arq; escolhido agora: {src, url})
function veAfcUrl(m, campo) {
    const v = campo.split('.').reduce((o, k) => o && o[k], m);
    if (v && typeof v === 'object') return v.url;
    return m._arq && m._arq[campo] ? m._arq[campo].url : null;
}
function veAfcPath(m, campo) {
    const v = campo.split('.').reduce((o, k) => o && o[k], m);
    if (v && typeof v === 'object') return v.src;
    return m._arq && m._arq[campo] ? m._arq[campo].path : null;
}

// ── trocar de aba: o Quick guarda o que estava montado ──
const VE_AF_ESTADO = ['itens', 'midias', 'fora', 'musica', 'musicaPath', 'modelos', 'modelo', 'dur', 'ordem', 'titulo', 'inicioModo', 'manual', 'inicioT', 'telas'];
function veAfcAba(aba) {
    if (aba === (VEAF.aba || 'quick')) return;
    if (aba === 'custom') {
        VEAFC.quick = Object.fromEntries(VE_AF_ESTADO.map(k => [k, VEAF[k]]));
        VEAF.cli = null;
        veAfcLimparFluxo();
        if (!VEAFC.lista) veAfcCarregar();
    } else {
        VEAF.cli = null;
        VEAFC.ed = null;
        if (VEAFC.quick) Object.assign(VEAF, VEAFC.quick);
        VEAFC.quick = null;
    }
    VEAF.aba = aba;
    veAfRender();
}

function veAfcLimparFluxo() {
    Object.assign(VEAF, { itens: [], midias: [], fora: new Set(), musica: null, musicaPath: null, modelos: [], modelo: null,
        manual: null, inicioT: null, titulo: '', progresso: '', pct: 0 });
}

// ── começar: o fluxo do AutoFrame com o modelo travado ──
function veAfcComecar(m) {
    const mus = (m.musicas || []).filter(x => x.path);
    if (!mus.length) { veToast(veT('Esse modelo não tem música: edite e adicione pelo menos uma')); return; }
    veAfcLimparFluxo();
    VEAF.cli = m;
    VEAF.cliMus = Math.min(m.musicaProx || 0, mus.length - 1);
    VEAF.musicaPath = mus[VEAF.cliMus].path;
    VEAF.dur = m.dur || 0;
    VEAF.telas = m.telas || 'sim';
    VEAF.inicioModo = m.inicioModo || 'agitada';
    VEAF.titulo = (m.intro && m.intro.texto) || '';
    veAfRender();
    veAfAnalisar();
}

function veAfcTrocarMusica(i) {
    const mus = VEAF.cli.musicas.filter(x => x.path);
    if (!mus[i] || i === VEAF.cliMus) return;
    VEAF.cliMus = i;
    VEAF.musicaPath = mus[i].path;
    VEAF.musica = null;
    VEAF.manual = null;
    veAfAnalisar();
}

// ── tela da aba Customizado: cards ou o formulário ──
function veAfcTela() {
    if (VEAFC.ed) return veAfcForm();
    if (!VEAFC.lista) return `<div class="ve-af-vazio">${veT('Carregando...')}</div>`;
    const card = m => {
        const logo = veAfcUrl(m, 'logo'), n = (m.musicas || []).length;
        return `<div class="ve-afc-card" style="--cc:${veEsc(m.cor || '#F97316')}">
            <div class="ve-afc-capa">${logo ? `<img src="${veEsc(logo)}" alt="">` : `<b>${veEsc((m.nome || '?').slice(0, 2).toUpperCase())}</b>`}</div>
            <div class="ve-afc-txt"><b>${veEsc(m.nome || veT('Sem nome'))}</b>
                <small>${veT(VE_AFC_ESTILOS[m.estilo] || 'Automático')} · ${n} ${veT(n === 1 ? 'música' : 'músicas')}</small></div>
            <div class="ve-afc-acoes">
                <button class="ve-btn ve-btn-primary ve-btn-sm" data-afc="comecar" data-id="${m.id}">${veT('Começar')}</button>
                <button class="ve-btn ve-btn-sm ve-btn-ghost" data-afc="editar" data-id="${m.id}" title="${veT('Editar modelo')}"><svg class="i"><use href="#i-gear"/></svg></button>
            </div>
        </div>`;
    };
    return `<div class="ve-af-sec">
        <div class="ve-af-h">${veT('Modelos de cliente')}</div>
        <p class="ve-af-dica">${veT('Cada modelo guarda a intro, o logo, as cores, as transições e as músicas de um cliente. Clique em Começar e mande o material.')}</p>
        <div class="ve-afc-cards">${VEAFC.lista.map(card).join('')}
            <button class="ve-afc-novo" data-afc="novo"><span>+</span>${veT('Novo modelo')}</button>
        </div>
    </div>`;
}

function veAfcForm() {
    const m = VEAFC.ed, pill = (campo, v, txt) => {
        const atual = campo.split('.').reduce((o, k) => o && o[k], m);
        return `<button class="ve-af-pill${String(atual) === String(v) ? ' on' : ''}" data-afc-set="${campo}" data-v="${v}">${veT(txt)}</button>`;
    };
    const pills = (campo, obj) => Object.entries(obj).map(([v, t]) => pill(campo, v, t)).join('');
    const cor = (campo, rot) => `<label class="ve-afc-cor"><input type="color" data-afc-in="${campo}" value="${veEsc(campo.split('.').reduce((o, k) => o && o[k], m))}"><span>${veT(rot)}</span></label>`;
    const txt = (campo, ph) => `<input type="text" class="ve-afc-in" data-afc-in="${campo}" value="${veEsc(campo.split('.').reduce((o, k) => o && o[k], m) || '')}" placeholder="${veT(ph)}">`;
    const arq = (campo, tipo, rot) => {
        const p = veAfcPath(m, campo);
        return `<div class="ve-afc-arq"><button class="ve-btn ve-btn-sm" data-afc="arq" data-campo="${campo}" data-tipo="${tipo}">${veT(rot)}</button>
            <span>${p ? veEsc(veAfNome(p)) : veT('nenhum arquivo')}</span>${p ? `<button class="ve-afc-x" data-afc="tirar" data-campo="${campo}" title="${veT('Tirar')}">×</button>` : ''}</div>`;
    };
    const logo = veAfcUrl(m, 'logo'), fontes = (typeof VEPP !== 'undefined' && VEPP.fontes) || [];
    const linha = (rot, html) => `<div class="ve-af-op"><span>${veT(rot)}</span>${html}</div>`;
    return `<div class="ve-afc-form">
        <div class="ve-af-h">${m.id ? veT('Editar modelo') : veT('Novo modelo')}</div>
        <div class="ve-af-sec">
            ${linha('Cliente', txt('nome', 'nome do cliente'))}
            ${linha('Cor do card', cor('cor', ''))}
            <div class="ve-afc-logo">
                <div class="ve-afc-logo-prev" style="--bg:${veEsc(m.paleta.primaria)}">${logo ? `<img src="${veEsc(logo)}" alt="">` : `<small>${veT('sem logo')}</small>`}</div>
                ${arq('logo', 'logo', 'Escolher logo')}
            </div>
            ${linha('Paleta', cor('paleta.primaria', 'Principal') + cor('paleta.secundaria', 'Destaque') + cor('paleta.texto', 'Texto'))}
            ${linha('Fonte', `<input type="text" class="ve-afc-in" list="ve-afc-fontes" data-afc-in="fonte" value="${veEsc(m.fonte || '')}"><datalist id="ve-afc-fontes">${fontes.map(f => `<option value="${veEsc(f)}">`).join('')}</datalist>`)}
        </div>
        <div class="ve-af-sec">
            <div class="ve-af-h">${veT('Intro')}</div>
            ${linha('Tipo', pills('intro.tipo', VE_AFC_INTRO))}
            ${m.intro.tipo === 'video' ? arq('intro.video', 'video', 'Escolher o arquivo da intro') +
                `<small class="ve-af-info">${veT('MP4 ou MOV. MOV com transparência pode ficar por cima das cenas.')}</small>` +
                `<label class="ve-afc-chk"><input type="checkbox" data-afc-chk="intro.transparente"${m.intro.transparente ? ' checked' : ''}> ${veT('Tem fundo transparente (fica por cima das cenas)')}</label>` : ''}
            ${m.intro.tipo === 'comp' ? veAfcCompCampo(m, 'intro') +
                `<label class="ve-afc-chk"><input type="checkbox" data-afc-chk="intro.transparente"${m.intro.transparente ? ' checked' : ''}> ${veT('Tem fundo transparente (fica por cima das cenas)')}</label>` : ''}
            ${m.intro.tipo === 'animada' ? `<small class="ve-af-info">${veT('Formas na cor de destaque, as melhores fotos entrando na batida, o logo batendo no compasso e o texto em selo. Com efeitos sonoros do Soundboard.')}</small>` : ''}
            ${['animada', 'logo_cor', 'logo_cena'].includes(m.intro.tipo) ? linha('Duração', `<input type="number" class="ve-afc-in ve-afc-seg" min="1" max="15" step="0.5" data-afc-num="intro.seg" value="${veAfcIntroSeg(m)}" title="${veT('Fecha no corte da música mais perto')}"><span class="ve-afc-un">${veT('segundos')}</span>`) +
                (m.intro.tipo !== 'animada' ? linha('Animação do logo', pills('intro.anim', VE_AFC_ANIM)) : '') + linha('Texto', txt('intro.texto', 'opcional: slogan ou título padrão')) : ''}
        </div>
        <div class="ve-af-sec">
            <div class="ve-af-h">${veT('Logo no canto')}</div>
            ${linha('Posição', pills('marca.pos', VE_AFC_CANTOS))}
            ${m.marca.pos !== 'nao' ? linha('Tamanho', `<input type="range" min="6" max="40" data-afc-num="marca.tam" value="${m.marca.tam}"><small>${m.marca.tam}%</small>`) +
                linha('Opacidade', `<input type="range" min="20" max="100" data-afc-num="marca.op" value="${m.marca.op}"><small>${m.marca.op}%</small>`) : ''}
        </div>
        <div class="ve-af-sec">
            <div class="ve-af-h">${veT('Encerramento')}</div>
            ${linha('Tipo', pills('fim.tipo', VE_AFC_FIM))}
            ${m.fim.tipo === 'video' ? arq('fim.video', 'video', 'Escolher o arquivo do encerramento') : ''}
            ${m.fim.tipo === 'comp' ? veAfcCompCampo(m, 'fim') : ''}
            ${m.fim.tipo === 'logo_cor' || m.fim.tipo === 'animada' ? linha('Duração', pill('fim.compassos', 'auto', 'Automática (~4 s)') + pill('fim.compassos', 1, '1 compasso') + pill('fim.compassos', 2, '2 compassos') + pill('fim.compassos', 4, '4 compassos')) +
                linha('Texto', txt('fim.texto', 'opcional: @perfil · telefone · site')) : ''}
        </div>
        <div class="ve-af-sec">
            <div class="ve-af-h">${veT('Edição')}</div>
            ${linha('Estilo', pills('estilo', VE_AFC_ESTILOS))}
            ${linha('Cor', pills('look', VE_AFC_LOOKS))}
            ${linha('Transições', VE_AFC_TRANS.map(t => `<button class="ve-af-pill${m.trans.includes(t) ? ' on' : ''}" data-afc-tr="${t}">${veAfcTrNome(t)}</button>`).join(''))}
            <small class="ve-af-info">${veT(m.trans.length ? 'Alterna entre as marcadas.' : 'Nenhuma marcada: usa as do estilo.')}</small>
            ${m.trans.length ? linha('Frequência', pills('transFreq', VE_AFC_FREQ)) : ''}
            <label class="ve-afc-chk"><input type="checkbox" data-afc-chk="flashMarca"${m.flashMarca ? ' checked' : ''}> ${veT('Flash de impacto na cor de destaque (em vez de branco)')}</label>
            <label class="ve-afc-chk"><input type="checkbox" data-afc-chk="todas"${m.todas !== false ? ' checked' : ''}> ${veT('Usar todas as fotos e vídeos (a duração se ajusta)')}</label>
            ${m.todas === false ? linha('Duração', pill('dur', 0, 'Música toda') + pill('dur', 15, '15 s') + pill('dur', 30, '30 s') + pill('dur', 60, '60 s')) : ''}
            <label class="ve-afc-chk"><input type="checkbox" data-afc-chk="sfx"${m.sfx !== false ? ' checked' : ''}> ${veT('Efeitos sonoros (whoosh nas transições, impacto no logo...) do Soundboard')}</label>
            ${linha('Telas divididas', pill('telas', 'sim', 'Sim') + pill('telas', 'nao', 'Não'))}
            ${linha('Começar em', pill('inicioModo', 'inicio', 'Início') + pill('inicioModo', 'refrao', 'Refrão') + pill('inicioModo', 'agitada', 'Mais agitada'))}
        </div>
        <div class="ve-af-sec">
            <div class="ve-af-h">${veT('Músicas')} <small class="ve-af-info">${veT('alternam a cada vídeo, nesta ordem')}</small></div>
            ${(m.musicas || []).map((x, i) => `<div class="ve-afc-arq"><svg class="i"><use href="#i-music"/></svg><span>${veEsc(x.nome || veAfNome(x.src || x.arq))}</span>
                <button class="ve-afc-x" data-afc="tirar-musica" data-i="${i}" title="${veT('Tirar')}">×</button></div>`).join('')}
            <div class="ve-af-botoes"><button class="ve-btn ve-btn-sm" data-afc="arq" data-campo="musicas" data-tipo="musicas"><svg class="i"><use href="#i-music"/></svg> ${veT('Adicionar músicas')}</button></div>
        </div>
        <div class="ve-af-gerar">
            <button class="ve-btn ve-btn-primary" data-afc="salvar">${veT('Salvar modelo')}</button>
            <button class="ve-btn" data-afc="cancelar">${veT('Cancelar')}</button>
            ${m.id ? `<span class="ve-top-spacer"></span><button class="ve-btn ve-btn-ghost ve-afc-apagar" data-afc="apagar">${veT(VEAFC.apagar ? 'Apagar mesmo?' : 'Apagar modelo')}</button>` : ''}
        </div>
    </div>`;
}

// Cabeçalho do fluxo "Começar" (no lugar do topo do Quick) e a escolha de música do modelo
function veAfcCabecalho() {
    const m = VEAF.cli, logo = veAfcUrl(m, 'logo');
    return `<div class="ve-afc-topo" style="--cc:${veEsc(m.cor || '#F97316')}">
        <button class="ve-btn ve-btn-sm ve-btn-ghost" data-afc="voltar" title="${veT('Voltar aos modelos')}">‹</button>
        <div class="ve-afc-capa">${logo ? `<img src="${veEsc(logo)}" alt="">` : `<b>${veEsc((m.nome || '?').slice(0, 2).toUpperCase())}</b>`}</div>
        <div class="ve-afc-txt"><b>${veEsc(m.nome)}</b><small>${veT(VE_AFC_ESTILOS[m.estilo] || 'Automático')} · ${veT(VE_AFC_INTRO[m.intro.tipo])}</small></div>
    </div>`;
}
function veAfcMusicas() {
    const mus = VEAF.cli.musicas.filter(x => x.path);
    return `<div class="ve-af-op">${mus.map((x, i) => `<button class="ve-af-pill${i === VEAF.cliMus ? ' on' : ''}" data-afc="musica" data-i="${i}" title="${veEsc(x.nome)}">${veEsc(x.nome.replace(/\.[^.]+$/, '').slice(0, 28))}</button>`).join('')}</div>`;
}

// ── eventos ──
function veAfcClick(e) {
    const tr = e.target.closest('[data-afc-tr]');
    if (tr && VEAFC.ed) {
        const l = VEAFC.ed.trans, t = tr.dataset.afcTr;
        l.includes(t) ? l.splice(l.indexOf(t), 1) : l.push(t);
        veAfRender();
        return true;
    }
    const set = e.target.closest('[data-afc-set]');
    if (set && VEAFC.ed) {
        const ch = set.dataset.afcSet.split('.'), alvo = ch.slice(0, -1).reduce((o, k) => o[k], VEAFC.ed), k = ch[ch.length - 1];
        alvo[k] = /^\d+$/.test(set.dataset.v) ? +set.dataset.v : set.dataset.v;   // 'auto' fica texto
        veAfRender();
        return true;
    }
    const aba = e.target.closest('[data-af-aba]');
    if (aba) { veAfcAba(aba.dataset.afAba); return true; }
    const b = e.target.closest('[data-afc]');
    if (!b) return false;
    const api = veAfApi(), acao = b.dataset.afc, achar = () => (VEAFC.lista || []).find(x => x.id === b.dataset.id);
    if (acao === 'novo') { VEAFC.ed = veAfcNovo(); VEAFC.apagar = false; }
    else if (acao === 'editar') { VEAFC.ed = Object.assign(veAfcNovo(), JSON.parse(JSON.stringify(achar()))); VEAFC.apagar = false; }
    else if (acao === 'cancelar') VEAFC.ed = null;
    else if (acao === 'comecar') { veAfcComecar(achar()); return true; }
    else if (acao === 'voltar') { VEAF.cli = null; veAfcLimparFluxo(); veAfcCarregar(); }
    else if (acao === 'musica') { veAfcTrocarMusica(+b.dataset.i); return true; }
    else if (acao === 'tirar-musica') VEAFC.ed.musicas.splice(+b.dataset.i, 1);
    else if (acao === 'tirar-comp') VEAFC.ed[b.dataset.campo].comp = null;
    else if (acao === 'tirar') {
        const ch = b.dataset.campo.split('.'), alvo = ch.slice(0, -1).reduce((o, k) => o[k], VEAFC.ed);
        alvo[ch[ch.length - 1]] = null;
        if (VEAFC.ed._arq) delete VEAFC.ed._arq[b.dataset.campo];
    } else if (acao === 'usar-comp') {
        // a Comp selecionada no painel Projeto (ou a faixa dela selecionada na timeline) vai para o modelo
        const k = [...(typeof VEPJ !== 'undefined' ? VEPJ.sel : [])].find(x => x.startsWith('m:') && VE.media[+x.slice(2)] && VE.media[+x.slice(2)].comp);
        const sel = VE.clips[VE.sel], cm = k ? VE.media[+k.slice(2)] : sel && veMediaOf(sel) && veMediaOf(sel).comp ? veMediaOf(sel) : null;
        if (!cm) { veToast(veT('Selecione uma Comp no painel Projeto (ou a faixa dela na timeline) e clique de novo')); return true; }
        VEAFC.ed[b.dataset.campo].comp = veCompPacote(cm);
        veToast(`${veT('Comp no modelo')}: ${vePjNome(cm)}`);
    } else if (acao === 'arq') {
        api.afm_escolher(b.dataset.tipo).then(r => {
            if (!r || !r.success || !VEAFC.ed) return;
            if (b.dataset.campo === 'musicas') r.itens.forEach(x => VEAFC.ed.musicas.push({ src: x.path, nome: veAfNome(x.path) }));
            else {
                const ch = b.dataset.campo.split('.'), alvo = ch.slice(0, -1).reduce((o, k) => o[k], VEAFC.ed);
                alvo[ch[ch.length - 1]] = { src: r.itens[0].path, url: r.itens[0].url };
            }
            veAfRender();
        });
        return true;
    } else if (acao === 'salvar') {
        const m = VEAFC.ed;
        if (!m.nome.trim()) { veToast(veT('Dê um nome ao modelo (o nome do cliente)')); return true; }
        api.afm_salvar(m).then(r => {
            if (!r || !r.success) { veToast(veT('Não foi possível salvar o modelo: ') + ((r && r.error) || '')); return; }
            VEAFC.ed = null;
            veToast(`${veT('Modelo salvo')}: ${r.modelo.nome}`);
            veAfcCarregar();
        });
        return true;
    } else if (acao === 'apagar') {
        if (!VEAFC.apagar) { VEAFC.apagar = true; veAfRender(); return true; }
        api.afm_apagar(VEAFC.ed.id).then(() => { VEAFC.ed = null; VEAFC.apagar = false; veAfcCarregar(); });
        return true;
    }
    veAfRender();
    return true;
}

function veAfcInput(e) {
    const t = e.target, m = VEAFC.ed;
    if (!m) return false;
    const campo = t.dataset.afcIn || t.dataset.afcNum || t.dataset.afcChk;
    if (!campo) return false;
    const ch = campo.split('.'), alvo = ch.slice(0, -1).reduce((o, k) => o[k], m), k = ch[ch.length - 1];
    alvo[k] = t.dataset.afcChk ? t.checked : t.dataset.afcNum ? +t.value : t.value;
    if (t.dataset.afcNum && t.type === 'range' && t.nextElementSibling) t.nextElementSibling.textContent = t.value + '%';
    // a cor principal muda o fundo da prévia do logo; o resto não precisa redesenhar (o campo perderia o foco)
    if (campo === 'paleta.primaria') { const p = t.ownerDocument.querySelector('.ve-afc-logo-prev'); if (p) p.style.setProperty('--bg', t.value); }
    if (t.dataset.afcChk) veAfRender();
    return true;
}

// ── geração: identidade do cliente sobre o plano ──
// Duração da intro/encerramento: compassos fixos, ou 'auto' = o menor número de compassos com ~3,4 s ou mais
// (dá tempo de os cards entrarem, o logo bater e o texto ser lido; em música lenta, 1 compasso só é curto)
function veAfcCompassos(n, bpm) {
    if (n !== 'auto') return +n || 2;
    const bar = 4 * 60 / (bpm || 120);
    return Math.max(1, Math.min(4, Math.ceil(3.4 / bar - 0.05)));
}
const veAfcCobre = t => t === 'animada' || t === 'logo_cor';
// Intro feita pelo sistema (animada, logo na cor, logo sobre as cenas): em segundos, padrão 3 s (modelos antigos,
// que guardavam compassos, também). Intro de vídeo/Comp tem a duração do arquivo.
const veAfcIntroSeg = m => Math.max(1, Math.min(15, +(m.intro && m.intro.seg) || 3));

// Segundos de intro + encerramento (para "usar todas as fotos" calcular a duração do vídeo)
function veAfcExtraSeg(m, bpm) {
    const bar = 4 * 60 / (bpm || 120);
    return (veAfcCobre(m.intro.tipo) ? veAfcIntroSeg(m) : 0) +
        (veAfcCobre(m.fim.tipo) ? veAfcCompassos(m.fim.compassos, bpm) * bar : 0);
}

// Segundos reservados no começo/fim (intro e encerramento que cobrem a tela): o plano não põe cena ali
function veAfcReserva(m, bpm) {
    const bar = 4 * 60 / (bpm || 120);
    // intro: meia batida a menos, para o plano poder cortar na batida mais perto dos segundos pedidos (com a reserva
    // cheia, 3 s viravam 3,6 s a 83 BPM)
    return [veAfcCobre(m.intro.tipo) ? Math.max(1, veAfcIntroSeg(m) - 30 / (bpm || 120)) : 0,
            veAfcCobre(m.fim.tipo) ? veAfcCompassos(m.fim.compassos, bpm) * bar : 0];
}

// Som do Soundboard escolhido sempre igual para o mesmo cliente (identidade sonora): categoria + nome
function veAfcSom(m, cat, re, k = 0, maxDur = Infinity) {
    const c = typeof VESB !== 'undefined' && VESB.dados && VESB.dados.instalado && VESB.dados.categorias.find(x => x.id === cat);
    if (!c) return null;
    let l = c.sons.filter(s => re.test(s.nome) && s.dur <= maxDur);
    if (!l.length) l = c.sons.filter(s => re.test(s.nome));
    if (!l.length) return null;
    let h = 7;
    for (const ch of (m.id || m.nome) + cat + k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return l[h % l.length];
}

// Antes de veAfClipes: importa logo/vídeos/sons, ajusta cor e transições e abre espaço para intro e encerramento
// (o corte fica sempre num corte do plano, então tudo continua na batida)
async function veAfcPreparar(plano, bin) {
    const m = VEAF.cli, x = { m };
    const imp = async p => { if (!p) return null; if (!veAfMidiaDe(p)) await vePjImportarArquivo(p, bin && bin.id); return veAfMidiaDe(p); };
    x.logo = await imp(veAfcPath(m, 'logo'));
    if (x.logo) { x.logo.nome = `${m.nome} · logo`; await veAfEsperar(() => x.logo.w > 0, 8000); }
    const mu = veAfMidiaDe(VEAF.musicaPath), info = m.musicas.filter(y => y.path)[VEAF.cliMus];
    if (mu && info) mu.nome = info.nome;
    if (m.intro.tipo === 'video') x.introV = await imp(veAfcPath(m, 'intro.video'));
    if (m.fim.tipo === 'video') x.fimV = await imp(veAfcPath(m, 'fim.video'));
    // Comp do modelo: recriada no projeto (mídias copiadas na pasta do modelo); entra como o vídeo pronto
    if (m.intro.tipo === 'comp' && m.intro.comp) x.introV = await veCompImportar(m.intro.comp, bin && bin.id);
    if (m.fim.tipo === 'comp' && m.fim.comp) x.fimV = await veCompImportar(m.fim.comp, bin && bin.id);
    for (const v of [x.introV, x.fimV].filter(Boolean)) {
        veMidiaPriorizar(v);
        await veAfEsperar(() => v.info && v.info.duration > 0, 30000);
    }
    if (m.look !== 'estilo') plano.modelo.cor = m.look;
    // transições do modelo: alterna as marcadas onde o estilo pede (ou na frequência escolhida)
    if (m.trans.length) {
        let n = 0;
        plano.slots.forEach((s, i) => {
            if (s.cel || i === 0) return;
            const pede = m.transFreq === 'todos' || (m.transFreq === 'tres' ? i % 3 === 0 : s.trans !== 'corte');
            s.trans = pede ? 'tr:' + m.trans[n++ % m.trans.length] : 'corte';
        });
    }
    const t0 = plano.inicio, compasso = 4 * 60 / (plano.bpm || 120);
    const inicios = [...new Set(plano.slots.map(s => s.cel ? s.grupo_a : s.a))].sort((a, b) => a - b);
    const bordas = [...new Set([...inicios, ...plano.slots.map(s => s.b)])].sort((a, b) => a - b);
    // intro que cobre a tela: as cenas começam no primeiro corte depois dela
    let di = 0;
    if (veAfcCobre(m.intro.tipo)) di = veAfcIntroSeg(m);
    else if (veAfcPronto(m.intro.tipo) && x.introV && !m.intro.transparente) di = x.introV.info.duration;
    if (di > 0) {
        // feita pelo sistema: o corte da música mais perto dos segundos escolhidos (fica na batida)
        const perto = bordas.filter(t => t - t0 >= 1).sort((a, b) => Math.abs(a - t0 - di) - Math.abs(b - t0 - di))[0];
        const corte = veAfcPronto(m.intro.tipo)
            ? inicios.filter(t => t - t0 <= di + 0.05 && t > t0).pop() ?? inicios.find(t => t > t0)
            : perto;
        if (corte != null) { x.introFim = corte - t0; plano.slots = plano.slots.filter(s => (s.cel ? s.grupo_a : s.a) >= corte - 1e-3); }
    }
    // encerramento: as cenas acabam no último corte antes dele
    let df = 0;
    if (veAfcCobre(m.fim.tipo)) df = veAfcCompassos(m.fim.compassos, plano.bpm) * compasso;
    else if (veAfcPronto(m.fim.tipo) && x.fimV) df = x.fimV.info.duration;
    if (df > 0) {
        const corte = bordas.filter(t => plano.fim - t >= df - 0.05 && t > t0 + (x.introFim || 0) + 0.5).pop();
        if (corte != null) { x.fimIni = corte - t0; plano.slots = plano.slots.filter(s => (s.cel ? s.grupo_a : s.a) < corte - 1e-3); }
    }
    if (m.flashMarca && plano.slots.some(s => s.flash)) plano.branco = await veAfBranco(bin && bin.id, m.paleta.secundaria);
    x.total = plano.fim - t0;
    // intro animada: as melhores fotos viram cards, e um clarão branco quando o logo bate
    if (m.intro.tipo === 'animada') {
        const fotos = VEAF.midias.filter(y => y.tipo === 'foto' && !VEAF.fora.has(y.path)).sort((a, b) => b.nota - a.nota).slice(0, 4);
        x.cards = [];
        for (const f of fotos) { const c = await imp(f.path); if (c) x.cards.push(c); }
        await veAfEsperar(() => x.cards.every(c => c.w > 0), 8000);
    }
    // blocos animados: a foto do fundo (uma diferente na intro e no encerramento) e as texturas geradas
    if (m.intro.tipo === 'animada' || m.fim.tipo === 'animada') {
        const boas = VEAF.midias.filter(y => y.tipo === 'foto' && !VEAF.fora.has(y.path)).sort((a, b) => b.nota - a.nota);
        const pega = async i => { const f = boas[Math.min(i, boas.length - 1)]; if (!f) return null; const c = await imp(f.path); await veAfEsperar(() => c && c.w > 0, 8000); return c; };
        x.heroiI = await pega(3);
        x.heroiF = await pega(4);
        Object.assign(x, await veAfcTexturas(m, bin && bin.id));
    }
    // efeitos sonoros (pack do Soundboard): carregado aqui se o painel ainda não abriu
    if (m.sfx !== false && typeof veSbCarregar === 'function') {
        if (!VESB.dados) { veSbCarregar(); await veAfEsperar(() => VESB.dados, 6000); }
        if (VESB.dados && VESB.dados.instalado) {
            x.sons = new Map();
            x.som = async s => {
                if (!s) return null;
                if (!x.sons.has(s.path)) { await imp(s.path); const md = veAfMidiaDe(s.path); if (md) md.nome = `SFX · ${s.nome}`; x.sons.set(s.path, md); }
                return x.sons.get(s.path);
            };
            const b = 60 / (plano.bpm || 120);
            x.sfx = {
                riser: veAfcSom(m, 'riser', /^Riser \d|^Uplifter/, 0, Math.max(1.5, (x.introFim || 4) * 0.6)),
                boom: veAfcSom(m, 'impacto', /^Boom|^Riser \+ hit/),
                pop: veAfcSom(m, 'pop', /^Pop \d|^Bolha/, 0, 0.6), pop2: veAfcSom(m, 'pop', /^Pop \d|^Bolha/, 1, 0.6),
                whoosh: veAfcSom(m, 'whoosh', /^Whoosh|^Swoosh|^Transição/, 0, Math.max(0.8, b * 3)),
                whoosh2: veAfcSom(m, 'whoosh', /^Whoosh|^Swoosh|^Transição/, 1, Math.max(0.8, b * 3)),
                fim: veAfcSom(m, 'notificacao', /^Sucesso|^Sino|^Ding/, 0, 2.5),
            };
            for (const k of Object.keys(x.sfx)) x.sfx[k] = x.sfx[k] && { ...x.sfx[k], md: await x.som(x.sfx[k]) };
        } else x.semPack = true;
    }
    return x;
}

// Contraste (WCAG 2): luminância relativa e razão entre duas cores #rrggbb
function veAfcLum(hex) {
    const v = String(hex || '#000').replace('#', ''), c = [0, 2, 4].map(i => parseInt(v.substr(i, 2), 16) / 255 || 0)
        .map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const veAfcRazao = (a, b2) => { const [x, y] = [veAfcLum(a), veAfcLum(b2)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// mesma cor com outra luminância (k < 1 escurece, > 1 clareia em direção ao branco)
function veAfcTom(hex, k) {
    const v = String(hex || '#000').replace('#', ''), c = [0, 2, 4].map(i => parseInt(v.substr(i, 2), 16) || 0);
    const r = c.map(x => Math.round(k <= 1 ? x * k : x + (255 - x) * Math.min(1, k - 1)));
    return '#' + r.map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}
// Selo de texto sobre o fundo `atras`: o fundo do selo precisa se destacar dele (≥ 2:1) e o texto, do selo (≥ 4,5:1)
function veAfcSelo(pal, atras) {
    const opcoes = [pal.secundaria, veAfcTom(pal.primaria, 0.35), '#ffffff', '#111111'];
    const fundo = opcoes.find(c => veAfcRazao(c, atras) >= 2) || '#111111';
    const textos = [pal.texto, '#ffffff', veAfcTom(pal.primaria, 0.3), '#111111'];
    const cor = textos.find(c => veAfcRazao(c, fundo) >= 4.5) || (veAfcRazao('#ffffff', fundo) > veAfcRazao('#111111', fundo) ? '#ffffff' : '#111111');
    return { fundo, cor };
}

// PNG desenhado aqui (canvas) e importado no projeto; um por chave (ex.: luz na cor do cliente)
async function veAfcPng(chave, nome, w, h, desenha, pasta) {
    const ja = VE.media.find(m => m.kind === 'image' && !m.removido && m._afPng === chave);
    if (ja) return ja;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    desenha(cv.getContext('2d'), w, h);
    const r = await veAfApi().ve_salvar_png(cv.toDataURL('image/png'));
    if (!r || !r.success) return null;
    await vePjImportarArquivo(r.path, pasta);
    const m = veAfMidiaDe(r.path);
    if (m) { m._afPng = chave; m.nome = nome; await veAfEsperar(() => m.w > 0, 5000); }
    return m;
}
const veAfcRgba = (hex, a) => { const v = String(hex).replace('#', ''); return `rgba(${[0, 2, 4].map(i => parseInt(v.substr(i, 2), 16) || 0).join(',')},${a})`; };
async function veAfcTexturas(m, pasta) {
    const luz = await veAfcPng('luz' + m.paleta.secundaria, `Luz · ${m.paleta.secundaria}`, 600, 600, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        gr.addColorStop(0, veAfcRgba(m.paleta.secundaria, 0.95)); gr.addColorStop(0.35, veAfcRgba(m.paleta.secundaria, 0.45));
        gr.addColorStop(1, veAfcRgba(m.paleta.secundaria, 0));
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, pasta);
    const grao = await veAfcPng('grao1', 'Textura · grão', 540, 960, (g, w, h) => {
        const im = g.createImageData(w, h);
        let sem = 12345;
        for (let i = 0; i < im.data.length; i += 4) {
            sem = (sem * 1103515245 + 12345) & 0x7fffffff;
            const v = 128 + ((sem >> 8) % 70) - 35;
            im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
        }
        g.putImageData(im, 0, 0);
    }, pasta);
    const feixe = await veAfcPng('feixe1', 'Luz · feixe', 360, 2600, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, pasta);
    return { luz, grao, feixe };
}

// Estilo mais grosso instalado da família (Black > Heavy > ExtraBold > Bold), sem itálico: {fonte, neg, ita, fam}
function veAfcFonteForte(fam) {
    // só estilos que o desenho consegue pedir: nome próprio no sistema, ou o negrito da família (fontes como a SF Pro
    // registram Heavy/Black com o mesmo nome do Regular — pedi-los dá Regular)
    const lista = ((typeof VEPP !== 'undefined' && VEPP.estilos && VEPP.estilos[fam]) || [])
        .filter(e => !e.italico && !/italic|oblique|itálic/i.test(e.estilo || '') && (e.gdi !== fam || e.gdi_negrito || (e.peso || 400) <= 400));
    const e = lista.sort((a, b) => (b.peso || 0) - (a.peso || 0))[0];
    return e ? { fonte: e.gdi, neg: !!e.gdi_negrito, ita: false, fam } : { fonte: fam || 'Arial', neg: true, ita: false };
}

// Cor sólida do projeto com essa cor (uma por cor)
function veAfcCor(fill, nome) {
    let c = VE.media.find(m => m.kind === 'cor' && !m.removido && m.fill === fill);
    if (!c) c = vePjAddMidia({ kind: 'cor', name: 'Cor sólida', fill, nome }, null);
    return c;
}

// Quadros-chave: lista de [t, v, i] → [{t, v, i}] (i: 'out' freia, 'lin' linear, 'ease' suave)
const veAfcK = l => veAfK(l);   // [t, v, curva] (curvas em editor-autoframe.js: entra, sai, troca, mola, suave)

// Depois de veAfClipes: fundo da marca, intro, logo no canto, encerramento, efeitos sonoros e a camada de cor
// só sobre as cenas
function veAfcExtras(out, plano, x) {
    const m = x.m, W = VE_AF_W, H = VE_AF_H, b = 60 / (plano.bpm || 120);
    const fimCenas = x.fimIni ?? x.total, iniCenas = x.introFim || 0;
    // tudo o que é imagem sobe uma trilha: a V1 vira o fundo na cor da marca (aparece nas telas divididas e
    // nas transições, em vez do preto)
    out.forEach(c => { if (!(VE.media[c.m] && VE.media[c.m].kind === 'audio')) c.tr += 1; });
    const SC = 1, corP = () => veAfcCor(m.paleta.primaria, `${m.nome} · ${veT('cor principal')}`).id;
    const cheio = { sc: 100, x: W / 2, y: H / 2, rot: 0, op: 100 };
    out.push({ tr: 0, st: 0, s: 0, e: +x.total.toFixed(4), m: corP(), p: { ...cheio } });
    let topo = Math.max(0, ...out.map(c => c.tr)) + 1;
    const nova = () => topo++;
    // cor (Luz e Cor) só nas cenas: a cor da marca fica exata. Cobre a transição de entrada/saída inteira
    // (começar no meio de uma transição deixa um trecho preto no quadro)
    const aIni = iniCenas ? Math.max(0, iniCenas - 0.3) : 0, aFim = x.fimIni != null ? Math.min(x.total, fimCenas + 0.3) : fimCenas;
    // só o look (a camada longa); os efeitos curtos (clarão, P&B, pulso) ficam onde estão
    out.filter(c => c.fx && c.fx.some(f => f.t === 'lc') && VE.media[c.m] && VE.media[c.m].kind === 'ajuste' && c.e - c.s > 1 && !(c.k && c.k.op)).forEach(c => {
        c.st = +aIni.toFixed(4); c.e = +(aFim - aIni).toFixed(4);
    });
    // a cena antes do encerramento não escurece (o encerramento entra no lugar)
    if (x.fimIni != null) out.forEach(c => { if (c.tout && c.tout.t === 'fadeblack' && Math.abs(c.st + c.e - c.s - x.fimIni) < 0.05) delete c.tout; });
    const tAuto = m.trans.find(t => VE_TR[t]) || 'pull';   // a do encerramento é de camada (as sobreposições não entram aqui)
    const tin = { t: tAuto, d: 0.4, speed: 'fast', ...(VE_TR[tAuto] && VE_TR[tAuto].dir ? { dir: 'u' } : {}) };
    // efeitos sonoros: trilhas de áudio A2 em diante, sem sobrepor
    const fimA = [];
    const som = (s, st, g = -6, extra) => {
        if (!s || !s.md) return;
        let ini = 0;
        if (st < 0) { ini = -st; st = 0; }
        const dur = Math.min(s.dur - ini, x.total - st);
        if (dur <= 0.05) return;
        let k = fimA.findIndex(f => f <= st + 1e-3);
        if (k < 0) { fimA.push(0); k = fimA.length - 1; }
        fimA[k] = st + dur;
        // +3 dB sobre o ganho de cada som (o cliente pediu os efeitos um pouco mais altos, 2026-10-01)
        out.push({ tr: k + 1, st: +st.toFixed(4), s: +ini.toFixed(4), e: +(ini + dur).toFixed(4), m: s.md.id, g: g + 3, ...(extra || {}) });
    };
    const sx = x.sfx || {};
    const logoSc = larg => x.logo ? W * larg / x.logo.w * 100 : 100;
    const texto = (st, dur, t, y, tr, selo, anima) => {
        if (!t || !t.trim() || typeof veTxMidia !== 'function' || dur <= 0.1) return;
        // selo: cores escolhidas pelo contraste com o fundo principal (texto legível com qualquer paleta)
        const sl = selo ? veAfcSelo(m.paleta, m.paleta.primaria) : null;
        out.push({ tr, st: +st.toFixed(4), s: 0, e: +dur.toFixed(3), m: veTxMidia().id,
            tx: { ...VE_TX_PADRAO, t: t.trim(), fonte: m.fonte || 'Arial', cor: sl ? sl.cor : m.paleta.texto, tam: selo ? 64 : 72, alin: 'center',
                ...(selo ? { fOn: true, fCor: sl.fundo, fOp: 100, fPad: 28, fRaio: 24 } : { sOn: true, sOp: 55, sBlur: 14 }) },
            p: { sc: 100, x: W / 2, y, rot: 0, op: 100 },
            txa: typeof veTxaObj === 'function' ? { in: veTxaObj(anima || (selo ? 'pop' : 'subir')), out: veTxaObj('fade') } : undefined });
    };
    // logo simples (intro "logo sobre a cor/cenas" e encerramento simples)
    const logoEm = (st, dur, larg, y, anim, tr) => {
        if (!x.logo) return;
        const sc = +logoSc(larg).toFixed(2), e = +dur.toFixed(4), d = Math.min(0.35, dur / 4);
        const c = { tr, st: +st.toFixed(4), s: 0, e, m: x.logo.id, p: { sc, x: W / 2, y, rot: 0, op: 100 } };
        if (anim === 'pop') c.k = { sc: veAfcK([[0, sc * 0.6, 'mola'], [d, sc, 'suave'], [e - 0.2, sc * 1.03, 'sai'], [e, sc * 1.15]]),
            op: veAfcK([[0, 0, 'entra'], [d * 0.5, 100], [e - 0.2, 100, 'sai'], [e, 0]]) };
        else if (anim === 'zoom') c.k = { sc: veAfcK([[0, sc * 0.94], [e, sc * 1.06]]), op: veAfcK([[0, 0, 'out'], [d * 1.5, 100], [e - 0.3, 100], [e, 0]]) };
        else c.k = { op: veAfcK([[0, 0, 'ease'], [d * 1.5, 100], [e - 0.3, 100], [e, 0]]) };
        out.push(c);
    };
    // bloco animado (intro e encerramento) — composição em camadas (direcao-de-arte.md §3–4): a foto da vez desfocada
    // no fundo, a cor da marca em Multiplicação por cima (duotone), luz em degradê na cor de destaque (Tela) se
    // movendo, grão vivo (Sobrepor) e vinheta; por cima, cards de fotos e o logo com puxada de foco e feixe de luz
    const LOGO_Y = 800, TXT_Y = 1290;   // título mais baixo, em 2 linhas, ainda dentro da área segura (até y 1500)
    // intro: logo menor bem no alto, 4 cards no meio (2 × 2) e o título embaixo, abaixo dos cards (2ª linha até
    // ~y 1590: passa um pouco da área segura de 1500, a pedido do cliente em 2026-10-01)
    const INTRO = { logoY: 215, larg: 0.4, txtY: 1430 };
    const animado = (st, D, opts) => {
        const N = Math.max(4, Math.round(D / b)), T = k => st + Math.min(D - 0.25, k * b), Q = VE_AF_Q;
        const cards = opts.cards || [], L = cards.length ? T(N / 2) : T(Math.min(1, N / 4)), l = L - st;
        const sai = D - 6 * Q;   // começo da saída (6 quadros, mais rápida que a entrada)
        const camada = (c) => { c.tr = nova(); c.st = +(st + (c._t || 0)).toFixed(4); delete c._t; out.push(c); return c; };
        const somem = (d0) => veAfK([[0, 0, 'entra'], [8 * Q, 100], [d0 - 6 * Q, 100, 'sai'], [d0, 0]]);
        // 1) a foto da vez, cobrindo e desfocada, com deriva lenta
        const heroi = opts.heroi;
        if (heroi) {
            const k = Math.max(W / heroi.w, H / heroi.h) * 100;
            camada({ s: 0, e: +D.toFixed(4), m: heroi.id, p: { sc: +(k * 1.12).toFixed(2), x: W / 2, y: H / 2, rot: 0, op: 100 },
                fx: [{ id: veFxNewId(), t: 'blur', on: true, v: { amt: 38 } }],
                k: { sc: veAfK([[0, k * 1.18, 'suave'], [D, k * 1.06]]), op: somem(D) } });
            // 2) a cor da marca em Multiplicação: a foto vira um duotone na identidade
            camada({ s: 0, e: +D.toFixed(4), m: veAfcCor(m.paleta.primaria, `${m.nome} · ${veT('cor principal')}`).id, bm: 'multiply',
                p: { sc: 100, x: W / 2, y: H / 2, rot: 0, op: 88 }, k: { op: veAfK([[0, 0, 'entra'], [8 * Q, 88], [D - 6 * Q, 88, 'sai'], [D, 0]]) } });
        }
        // 3) luz: degradê radial na cor de destaque, em Tela, atravessando devagar
        if (x.luz) {
            const sc = 260;
            camada({ s: 0, e: +D.toFixed(4), m: x.luz.id, bm: 'screen', p: { sc, x: W * 0.3, y: H * 0.3, rot: 0, op: 70 },
                k: { x: veAfK([[0, W * 0.15, 'suave'], [D, W * 0.75]]), y: veAfK([[0, H * 0.22, 'suave'], [D, H * 0.48]]),
                     sc: veAfK([[0, sc * 0.9, 'suave'], [D, sc * 1.15]]), op: veAfK([[0, 0, 'entra'], [12 * Q, 70], [D - 6 * Q, 70, 'sai'], [D, 0]]) } });
        }
        // 4) grão vivo: a mesma textura muda de lugar a cada 3 quadros (degrau), em Sobrepor
        if (x.grao) {
            const xs = [], ys = [];
            for (let t = 0, n = 0; t < D; t += 3 * Q, n++) { xs.push([t, W / 2 + ((n * 37) % 41) - 20, 'hold']); ys.push([t, H / 2 + ((n * 53) % 43) - 21, 'hold']); }
            camada({ s: 0, e: +D.toFixed(4), m: x.grao.id, bm: 'overlay', p: { sc: 215, x: W / 2, y: H / 2, rot: 0, op: 35 },
                k: { x: veAfK(xs), y: veAfK(ys) } });
        }
        // 5) vinheta (leva o olho para o centro)
        const vin = veAfAjuste(0, D, { vig: 55, ct: 8 });
        camada(vin);
        // cards: foto + moldura branca + sombra, entram um por batida (mola, girando), recuam quando o logo bate
        const pos = cards.length > 3 ? [[W * 0.29, 640, -7], [W * 0.71, 700, 6], [W * 0.31, 1090, 5], [W * 0.7, 1130, -5]]
            : [[W * 0.29, 560, -7], [W * 0.72, 690, 6], [W * 0.36, 1130, -4]];
        cards.forEach((md, i) => {
            // um por batida, todos antes de o logo bater (na metade do bloco)
            const t = T((i + 1) * N / (2 * (cards.length + 1))) - st, fim = D - t, cw = W * 0.4, ch = cw * md.h / md.w, [px, py, rot] = pos[i];
            const lt = Math.max(12 * Q, l - t);
            const mult = [[0, 0, 'mola'], [10 * Q, 1, 'suave'], [lt, 1.02, 'entra'], [lt + 8 * Q, 0.86, 'suave'], [Math.max(lt + 9 * Q, sai - t), 0.84, 'sai'], [fim, 0.2]];
            const gira = veAfK([[0, rot * 2.2, 'entra'], [12 * Q, rot]]);
            const opk = (v1, v2) => veAfK([[0, 0, 'entra'], [4 * Q, v1], [lt, v1, 'entra'], [lt + 8 * Q, v2], [Math.max(lt + 9 * Q, sai - t), v2, 'sai'], [fim, 0]]);
            const peca = (extra, base, op1, op2, dx = 0, dy = 0) => camada({ _t: t, s: 0, e: +fim.toFixed(4),
                p: { sc: +base.toFixed(2), x: px + dx, y: py + dy, rot, op: op1 }, ...extra,
                k: { sc: veAfK(mult.map(([tt, v, c]) => [tt, base * v, c])), rot: gira, op: opk(op1, op2) } });
            const fm = cor => ({ t: 'ret', w: Math.round(cw * 1.06), h: Math.round(ch + cw * 0.06), cor, cOn: false, cCor: cor, cLarg: 0, raio: 14 });
            peca({ m: veGrMidia('forma', 'Forma').id, fm: fm('#000000'), fx: [{ id: veFxNewId(), t: 'blur', on: true, v: { amt: 14 } }] }, 100, 45, 15, 14, 22);
            peca({ m: veGrMidia('forma', 'Forma').id, fm: fm('#ffffff') }, 100, 100, 40);
            peca({ m: md.id, fx: [{ id: veFxNewId(), t: 'rounded', on: true, v: { raio: 3 } }] }, cw / md.w * 100, 100, 40);
            som(i % 2 ? sx.pop2 : sx.pop, st + t - Q, -7);
        });
        // logo: puxada de foco — uma cópia desfocada em Tela chega primeiro e vira o brilho; a nítida assenta por cima
        if (x.logo) {
            const sc = logoSc(opts.larg || 0.56), e = D - l;
            camada({ _t: l - 2 * Q, s: 0, e: +(e + 2 * Q).toFixed(4), m: x.logo.id, bm: 'screen', fx: [{ id: veFxNewId(), t: 'blur', on: true, v: { amt: 30 } }],
                p: { sc: +(sc * 1.08).toFixed(2), x: W / 2, y: opts.logoY || LOGO_Y, rot: 0, op: 80 },
                k: { sc: veAfK([[0, sc * 1.6, 'entra'], [14 * Q, sc * 1.08, 'suave'], [e - 4 * Q, sc * 1.14, 'sai'], [e + 2 * Q, sc * 1.4]]),
                     op: veAfK([[0, 0, 'entra'], [4 * Q, 100], [14 * Q, 75, 'suave'], [e - 4 * Q, 75, 'sai'], [e + 2 * Q, 0]]) } });
            camada({ _t: l, s: 0, e: +e.toFixed(4), m: x.logo.id, p: { sc: +sc.toFixed(2), x: W / 2, y: opts.logoY || LOGO_Y, rot: 0, op: 100 },
                k: { sc: veAfK([[0, sc * 1.12, 'entra'], [14 * Q, sc, 'suave'], [e - 6 * Q, sc * 1.04, 'sai'], [e, sc * 1.25]]),
                     op: veAfK([[0, 0, 'entra'], [6 * Q, 100], [e - 6 * Q, 100, 'sai'], [e, 0]]) } });
            // feixe de luz atravessando o logo logo depois do impacto
            if (x.feixe) camada({ _t: l + 4 * Q, s: 0, e: +(16 * Q).toFixed(4), m: x.feixe.id, bm: 'screen',
                p: { sc: 100, x: -400, y: opts.logoY || LOGO_Y, rot: 18, op: 85 }, k: { x: veAfK([[0, -400, 'troca'], [16 * Q, W + 400]]) } });
        }
        // clarão de exposição no impacto (camada de ajuste por cima de tudo do bloco)
        const fl = veAfAjuste(0, 9 * Q, { exp: 1.1, ct: 10 }, [[0, 100, 'sai'], [8 * Q, 0]]);
        fl._t = l - Q; camada(fl);
        // título: "começo da frase" em branco + a última palavra (o destaque) maior na cor de destaque, 2 linhas,
        // fonte no peso mais forte; entram escalonadas (a 2ª 4 quadros depois). Sem contraste, o destaque fica branco
        const frase = String(opts.texto || '').trim();
        if (frase) {
            const fundo = heroi ? veAfcTom(m.paleta.primaria, 0.55) : m.paleta.primaria;
            // entra um quarto de batida antes de o logo bater (antes: meia batida depois) e fica mais tempo na tela
            const forte = veAfcFonteForte(m.fonte), t1 = L - b / 4, dur = st + D - t1;
            const pals = frase.split(/\s+/), fim = pals.length > 1 ? pals.pop() : null, ini = pals.join(' ');
            const corDest = veAfcRazao(m.paleta.secundaria, fundo) >= 3 ? m.paleta.secundaria : '#ffffff';
            const corTx = veAfcRazao('#ffffff', fundo) >= 3 ? '#ffffff' : veAfcTom(m.paleta.primaria, 0.3);
            const linha = (t, y, tam, cor, anima, atraso, extra) => out.push({ ...(extra || {}), tr: nova(), st: +(t1 + atraso).toFixed(4), s: 0, e: +(dur - atraso).toFixed(3), m: veTxMidia().id,
                tx: { ...VE_TX_PADRAO, ...forte, t, tam, cor, alin: 'center', esp: 10, sOn: true, sCor: '#000000', sOp: 45, sDist: 6, sBlur: 22 },
                p: { sc: 100, x: W / 2, y, rot: 0, op: 100 },
                txa: typeof veTxaObj === 'function' ? { in: veTxaObj(anima), out: { ...veTxaObj('fade'), d: 0.35 } } : undefined });
            // o destaque pulsa no ritmo da música (um pulso por batida)
            const pulsa = { fx: [{ id: veFxNewId(), t: 'ca_pul', on: true, v: { tam: 7, vel: +(1 / b).toFixed(3) } }] };
            const ty = opts.txtY || TXT_Y;
            if (fim) {
                linha(ini, ty, 84, corTx, 'revelar', 0);
                linha(fim, ty + 94, 132, corDest, 'elastico', 4 * Q, pulsa);
            } else linha(frase, ty + 40, 110, corDest, 'elastico', 0, pulsa);
        }
        // sons: riser até o logo, impacto no logo, sucesso no texto
        if (opts.riser && sx.riser) som(sx.riser, L - sx.riser.dur, -5);
        som(sx.boom, L - 0.02, -3);
        if (opts.fimSom) som(sx.fim, L + b / 2 - 0.02, -6);
        return L;
    };
    // intro e encerramento cobrindo a tela viram Comps depois (veAfComps): as camadas do bloco levam _grupo
    const grupo = (g, n0) => out.slice(n0).forEach(c => { c._grupo = g; });
    // intro
    const nI = out.length;
    if (m.intro.tipo === 'animada' && x.introFim) {
        out.push({ tr: SC, st: 0, s: 0, e: +x.introFim.toFixed(4), m: corP(), p: { ...cheio } });
        animado(0, x.introFim, { cards: x.cards, texto: VEAF.titulo, riser: true, heroi: x.heroiI, ...INTRO });
        grupo('intro', nI);
        const primeira = out.find(c => c.tr === SC && Math.abs(c.st - x.introFim) < 0.02 && VE.media[c.m] && VE.media[c.m].kind !== 'cor');
        if (primeira) primeira.tin = { ...tin };
        som(sx.whoosh, x.introFim - (sx.whoosh ? sx.whoosh.dur * 0.45 : 0), -6);
    } else if (m.intro.tipo === 'logo_cor' && x.introFim) {
        out.push({ tr: SC, st: 0, s: 0, e: +x.introFim.toFixed(4), m: corP(), p: { ...cheio } });
        logoEm(0, x.introFim, 0.55, H * (VEAF.titulo ? 0.44 : 0.5), m.intro.anim, nova());
        texto(Math.min(b, x.introFim / 3), x.introFim - Math.min(b, x.introFim / 3), VEAF.titulo, H * 0.62, nova());
        grupo('intro', nI);
        const primeira = out.find(c => c.tr === SC && Math.abs(c.st - x.introFim) < 0.02 && VE.media[c.m] && VE.media[c.m].kind !== 'cor');
        if (primeira) primeira.tin = { ...tin };
        som(sx.boom, 0, -4);
        som(sx.whoosh, x.introFim - (sx.whoosh ? sx.whoosh.dur * 0.45 : 0), -6);
    } else if (m.intro.tipo === 'logo_cena') {
        const di = Math.min(x.total / 3, veAfcIntroSeg(m));
        logoEm(0, di, 0.5, H * 0.45, m.intro.anim, nova());
        texto(Math.min(b, di / 3), di - Math.min(b, di / 3), VEAF.titulo, H * 0.6, nova());
        som(sx.boom, 0, -4);
        x.introFim = di;
    } else if (veAfcPronto(m.intro.tipo) && x.introV) {
        const dur = m.intro.transparente ? x.introV.info.duration : (x.introFim || x.introV.info.duration);
        out.push({ tr: m.intro.transparente ? nova() : SC, st: 0, s: 0, e: +Math.min(dur, x.introV.info.duration).toFixed(4), m: x.introV.id, x: 'v' });
        // Comp com som: o som dela numa trilha de áudio livre (a imagem fica no lugar da intro)
        if (x.introV.comp && x.introV.info.has_audio) som({ md: x.introV, dur: Math.min(dur, x.introV.info.duration) }, 0, 0, { x: 'a' });
        if (m.intro.transparente) x.introFim = 0;
        texto(b, Math.max(1, dur - b), VEAF.titulo, H * 0.62, nova());
    } else texto(0, Math.min(x.total, Math.max(2.5, b * 8)), VEAF.titulo, H * 0.42, nova());
    // corpo: whoosh em cada transição (no máximo um a cada ~1,5 s), impacto nos flashes
    let ult = -9, alt = 0;
    // cortes com transição: de camada (tin) ou de sobreposição (camada de ajuste centrada no corte)
    const cortes = out.filter(c => c.tin && c.tr === SC).map(c => c.st)
        .concat(out.filter(c => typeof veOvtFx === 'function' && VE.media[c.m] && VE.media[c.m].kind === 'ajuste' && veOvtFx(c).length).map(c => c.st + (c.e - c.s) / 2));
    cortes.filter(t => t > iniCenas + 0.1 && t < fimCenas - 0.1).sort((a, b2) => a - b2).forEach(t => {
        if (t - ult < 1.5) return;
        const s = alt++ % 2 ? sx.whoosh2 : sx.whoosh;
        if (s) { som(s, t - s.dur * 0.45, -9); ult = t; }
    });
    out.filter(c => VE.media[c.m] && VE.media[c.m]._afBranco && c.st > iniCenas + 0.1 && c.st < fimCenas).forEach(c => som(sx.boom, c.st + 0.02, -8));
    // encerramento
    if (x.fimIni != null) {
        const df = x.total - x.fimIni;
        if (m.fim.tipo === 'animada' || m.fim.tipo === 'logo_cor') {
            const nF = out.length;   // do fundo do encerramento em diante (sons ficam de fora em veAfComps)
            out.push({ tr: SC, st: +x.fimIni.toFixed(4), s: 0, e: +df.toFixed(4), m: corP(), p: { ...cheio }, tin: { ...tin } });
            som(sx.whoosh2 || sx.whoosh, x.fimIni - ((sx.whoosh2 || sx.whoosh) ? (sx.whoosh2 || sx.whoosh).dur * 0.45 : 0), -6);
            if (m.fim.tipo === 'animada') animado(x.fimIni, df, { texto: '', larg: 0.6, fimSom: true, heroi: x.heroiF, logoY: H / 2 });
            else {
                logoEm(x.fimIni, df, 0.5, H * (m.fim.texto ? 0.44 : 0.5), 'fade', nova());
                texto(x.fimIni + Math.min(b, df / 3), df - Math.min(b, df / 3), m.fim.texto, H * 0.6, nova());
            }
            grupo('fim', nF);
        } else if (x.fimV) {
            out.push({ tr: SC, st: +x.fimIni.toFixed(4), s: 0, e: +Math.min(df, x.fimV.info.duration).toFixed(4), m: x.fimV.id, x: 'v' });
            if (x.fimV.comp && x.fimV.info.has_audio) som({ md: x.fimV, dur: Math.min(df, x.fimV.info.duration) }, x.fimIni, 0, { x: 'a' });
        }
    }
    // logo no canto, das cenas até o encerramento
    if (x.logo && m.marca.pos !== 'nao') {
        const larg = (m.marca.tam || 16) / 100, sc = +logoSc(larg).toFixed(2);
        const lw = W * larg, lh = x.logo.h * lw / x.logo.w;
        const embaixo = !m.marca.pos.startsWith('s'), direita = m.marca.pos.endsWith('d');
        // em cima: a 150 px do topo (era 230; o cliente pediu mais alto, e longe do logo impresso nos painéis das fotos)
        const px = direita ? W - (embaixo ? 160 : 70) - lw / 2 : 70 + lw / 2, py = embaixo ? H - 420 - lh / 2 : 150 + lh / 2;
        const st = x.introFim || 0, dur = fimCenas - st;
        // tela dividida de 4 fotos: o logo vai para o centro (no encontro das fotos, sem cobrir rosto) e volta ao canto
        const grades = [...new Map(plano.slots.filter(s => s.cel && s.layout === 'grade4').map(s => [s.grupo_a, s.b])).entries()]
            .map(([a, b2]) => [a - plano.inicio - st, b2 - plano.inicio - st]).filter(([a, b2]) => a > 0.3 && b2 < dur - 0.3);
        const kx = [[0, px]], ky = [[0, py]], ks = [[0, sc]], T = 0.2;
        grades.forEach(([a, b2]) => {
            kx.push([a - T, px, 'troca'], [a, W / 2], [b2 - T, W / 2, 'troca'], [b2, px]);
            ky.push([a - T, py, 'troca'], [a, H / 2], [b2 - T, H / 2, 'troca'], [b2, py]);
            ks.push([a - T, sc, 'troca'], [a, sc * 1.6], [b2 - T, sc * 1.6, 'troca'], [b2, sc]);
        });
        if (dur > 0.5) out.push({ tr: nova(), st: +st.toFixed(4), s: 0, e: +dur.toFixed(4), m: x.logo.id,
            p: { sc, x: +px.toFixed(1), y: +py.toFixed(1), rot: 0, op: m.marca.op ?? 90 },
            k: { op: veAfcK([[0, 0, 'ease'], [0.4, m.marca.op ?? 90]]),
                 ...(grades.length ? { x: veAfcK(kx), y: veAfcK(ky), sc: veAfcK(ks) } : {}) } });
    }
    // fade para preto no fim (a música já sai em fade junto)
    const fp = Math.min(1.2, x.total * 0.08);
    out.push({ tr: nova(), st: +(x.total - fp).toFixed(4), s: 0, e: +fp.toFixed(4), m: veAfcCor('#000000', veT('Preto (fade final)')).id,
        p: { ...cheio }, k: { op: veAfK([[0, 0, 'suave'], [fp, 100]]) } });
    if (x.semPack) veToast(veT('Dica: baixe o pack no painel Soundboard para o AutoFrame pôr efeitos sonoros'));
    return out;
}

// Intro e encerramento (marcados com _grupo em veAfcExtras) viram Comps (editor-comp.js): a timeline gerada fica
// com poucas faixas, e o bloco abre com duplo clique. Os sons ficam fora (na trilha de áudio da timeline).
// A transição de entrada do bloco passa do fundo dele para o clipe da Comp.
function veAfComps(cli, pasta) {
    if (typeof veCompDeClipes !== 'function') return;
    [['intro', 'Intro'], ['fim', 'Encerramento']].forEach(([g, rotulo]) => {
        const sel = VE.clips.filter(c => c._grupo === g && !veIsAudio(c));
        if (sel.length < 2) return;
        const fundo = sel.filter(c => c.tin).sort((a, b) => a.tr - b.tr || a.st - b.st)[0], tin = fundo && fundo.tin;
        if (fundo) delete fundo.tin;
        const m = veCompDeClipes(sel, `${rotulo} · ${cli.nome}`, { pasta, quieto: true });
        const c = m && VE.clips.find(x => x.m === m.id);
        if (c && tin) c.tin = tin;
    });
    VE.clips.forEach(c => { delete c._grupo; });
    veAfCompactarTrilhas();
    // gerar não entra no desfazer (como antes): Ctrl+Z não desmonta as Comps
    VE.history = [];
    VE.future = [];
    VE.media.forEach(m => { if (m && m.comp) delete m._criada; });
    veRelayout();
    veSeqSalvarAtiva();
}

// Cada peça da intro e do encerramento nasce numa trilha nova (até a V38); depois que elas viram Comps, o logo e a
// cor final ficavam lá em cima com ~30 trilhas vazias no meio. As trilhas usadas são renumeradas em sequência
// (mesma ordem de empilhamento; V1/A1 ficam) e as vazias saem.
function veAfCompactarTrilhas() {
    const usadas = [...new Set([0, ...VE.clips.map(c => Math.max(0, +c.tr || 0))])].sort((a, b) => a - b);
    const n = Math.max(VE_MIN_TRACKS, usadas.length);
    if (usadas.every((t, k) => t === k) && veTrackCount() <= n) return;
    const novo = new Map(usadas.map((t, k) => [t, k]));
    VE.clips.forEach(c => { c.tr = novo.get(Math.max(0, +c.tr || 0)); });
    VE_TRK = veTrkNovo(n);
    veRebuildTracks(n);
    veBuildHeads();
}

// Formulário: a Comp guardada como intro/encerramento (o pacote fica no modelo)
function veAfcCompCampo(m, campo) {
    const pac = m[campo] && m[campo].comp;
    return `<div class="ve-afc-arq"><button class="ve-btn ve-btn-sm" data-afc="usar-comp" data-campo="${campo}">${veT('Usar a Comp selecionada')}</button>
        <span>${pac ? veEsc(pac.nome || 'Comp') : veT('nenhuma Comp')}</span>${pac ? `<button class="ve-afc-x" data-afc="tirar-comp" data-campo="${campo}" title="${veT('Tirar')}">×</button>` : ''}</div>
        <small class="ve-af-info">${veT('Monte a intro numa Comp (Criar Comp), selecione ela no painel Projeto e clique acima. As mídias dela são copiadas para o modelo.')}</small>`;
}
