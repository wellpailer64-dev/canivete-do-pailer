// =========================================================
// Pocket Editor — AutoFrame Customizado: modelos de cliente
// Aba ao lado do Quick AutoFrame. Cada modelo guarda a identidade de um cliente (nome e cor do card, logo, paleta,
// fonte, intro, logo no canto, encerramento, estilo de edição, transições e músicas que se alternam); ficam em
// %APPDATA%/CaniveteDoPailer/autoframe_modelos (Functions/autoframe_modelos.py). "Começar" abre o fluxo do
// AutoFrame (mídias → análise → plano) com o modelo travado; veAfcPreparar/veAfcExtras acrescentam a identidade
// à timeline gerada por veAfClipes (editor-autoframe.js).
// =========================================================

const VEAFC = { lista: null, ed: null, apagar: false, quick: null };

const VE_AFC_INTRO = { animada: 'Animada (fotos + logo)', logo_cor: 'Simples (logo na cor)', logo_cena: 'Logo sobre as cenas', video: 'Meu arquivo de vídeo', nenhuma: 'Sem intro' };
const VE_AFC_FIM = { animada: 'Animado', logo_cor: 'Simples (logo na cor)', video: 'Meu arquivo de vídeo', nenhum: 'Sem encerramento' };
const VE_AFC_ANIM = { pop: 'Pop', fade: 'Fade', zoom: 'Zoom lento' };
const VE_AFC_ESTILOS = { auto: 'Automático', dinamico: 'Dinâmico', batida: 'Batida', memorias: 'Memórias', drop: 'Drop', viagem: 'Viagem', cinematico: 'Cinemático' };
const VE_AFC_LOOKS = { estilo: 'Do estilo', vivo: 'Vivo', suave: 'Tons suaves', quente: 'Quente', filme: 'Filme', nenhum: 'Natural' };
const VE_AFC_TRANS = ['dissolve', 'crossfade', 'fadeblack', 'push', 'slide', 'pull', 'pop', 'chicote', 'fold'];
const VE_AFC_FREQ = { base: 'Onde o estilo pede', tres: '1 a cada 3 cortes', todos: 'Todo corte' };
const VE_AFC_CANTOS = { nao: 'Não', se: '↖', sd: '↗', ie: '↙', id: '↘' };

function veAfcNovo() {
    return {
        nome: '', cor: '#F97316', logo: null,
        paleta: { primaria: '#111111', secundaria: '#F97316', texto: '#ffffff' }, fonte: 'Arial',
        intro: { tipo: 'animada', compassos: 'auto', anim: 'pop', texto: '', video: null, transparente: false },
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
            ${m.intro.tipo === 'animada' ? `<small class="ve-af-info">${veT('Formas na cor de destaque, as melhores fotos entrando na batida, o logo batendo no compasso e o texto em selo. Com efeitos sonoros do Soundboard.')}</small>` : ''}
            ${['animada', 'logo_cor', 'logo_cena'].includes(m.intro.tipo) ? linha('Duração', pill('intro.compassos', 'auto', 'Automática (~4 s)') + pill('intro.compassos', 1, '1 compasso') + pill('intro.compassos', 2, '2 compassos') + pill('intro.compassos', 4, '4 compassos')) +
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
            ${m.fim.tipo === 'logo_cor' || m.fim.tipo === 'animada' ? linha('Duração', pill('fim.compassos', 'auto', 'Automática (~4 s)') + pill('fim.compassos', 1, '1 compasso') + pill('fim.compassos', 2, '2 compassos') + pill('fim.compassos', 4, '4 compassos')) +
                linha('Texto', txt('fim.texto', 'opcional: @perfil · telefone · site')) : ''}
        </div>
        <div class="ve-af-sec">
            <div class="ve-af-h">${veT('Edição')}</div>
            ${linha('Estilo', pills('estilo', VE_AFC_ESTILOS))}
            ${linha('Cor', pills('look', VE_AFC_LOOKS))}
            ${linha('Transições', VE_AFC_TRANS.map(t => `<button class="ve-af-pill${m.trans.includes(t) ? ' on' : ''}" data-afc-tr="${t}">${veT(VE_TR[t] ? VE_TR[t].nome : t)}</button>`).join(''))}
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
    else if (acao === 'tirar') {
        const ch = b.dataset.campo.split('.'), alvo = ch.slice(0, -1).reduce((o, k) => o[k], VEAFC.ed);
        alvo[ch[ch.length - 1]] = null;
        if (VEAFC.ed._arq) delete VEAFC.ed._arq[b.dataset.campo];
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
    if (t.dataset.afcNum && t.nextElementSibling) t.nextElementSibling.textContent = t.value + '%';
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

// Segundos de intro + encerramento (para "usar todas as fotos" calcular a duração do vídeo)
function veAfcExtraSeg(m, bpm) {
    const bar = 4 * 60 / (bpm || 120);
    return (veAfcCobre(m.intro.tipo) ? veAfcCompassos(m.intro.compassos, bpm) * bar : 0) +
        (veAfcCobre(m.fim.tipo) ? veAfcCompassos(m.fim.compassos, bpm) * bar : 0);
}

// Segundos reservados no começo/fim (intro e encerramento que cobrem a tela): o plano não põe cena ali
function veAfcReserva(m, bpm) {
    const bar = 4 * 60 / (bpm || 120);
    return [veAfcCobre(m.intro.tipo) ? veAfcCompassos(m.intro.compassos, bpm) * bar : 0,
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
    if (veAfcCobre(m.intro.tipo)) di = veAfcCompassos(m.intro.compassos, plano.bpm) * compasso;
    else if (m.intro.tipo === 'video' && x.introV && !m.intro.transparente) di = x.introV.info.duration;
    if (di > 0) {
        const corte = m.intro.tipo === 'video'
            ? inicios.filter(t => t - t0 <= di + 0.05 && t > t0).pop() ?? inicios.find(t => t > t0)
            : bordas.find(t => t - t0 >= di - 0.05);
        if (corte != null) { x.introFim = corte - t0; plano.slots = plano.slots.filter(s => (s.cel ? s.grupo_a : s.a) >= corte - 1e-3); }
    }
    // encerramento: as cenas acabam no último corte antes dele
    let df = 0;
    if (veAfcCobre(m.fim.tipo)) df = veAfcCompassos(m.fim.compassos, plano.bpm) * compasso;
    else if (m.fim.tipo === 'video' && x.fimV) df = x.fimV.info.duration;
    if (df > 0) {
        const corte = bordas.filter(t => plano.fim - t >= df - 0.05 && t > t0 + (x.introFim || 0) + 0.5).pop();
        if (corte != null) { x.fimIni = corte - t0; plano.slots = plano.slots.filter(s => (s.cel ? s.grupo_a : s.a) < corte - 1e-3); }
    }
    if (plano.slots.some(s => s.flash)) plano.branco = await veAfBranco(bin && bin.id, m.flashMarca ? m.paleta.secundaria : '#ffffff');
    x.total = plano.fim - t0;
    // intro animada: as melhores fotos viram cards, e um clarão branco quando o logo bate
    if (m.intro.tipo === 'animada') {
        const fotos = VEAF.midias.filter(y => y.tipo === 'foto' && !VEAF.fora.has(y.path)).sort((a, b) => b.nota - a.nota).slice(0, 3);
        x.cards = [];
        for (const f of fotos) { const c = await imp(f.path); if (c) x.cards.push(c); }
        await veAfEsperar(() => x.cards.every(c => c.w > 0), 8000);
        x.clarao = await veAfBranco(bin && bin.id, '#ffffff');
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

// Cor sólida do projeto com essa cor (uma por cor)
function veAfcCor(fill, nome) {
    let c = VE.media.find(m => m.kind === 'cor' && !m.removido && m.fill === fill);
    if (!c) c = vePjAddMidia({ kind: 'cor', name: 'Cor sólida', fill, nome }, null);
    return c;
}

// Quadros-chave: lista de [t, v, i] → [{t, v, i}] (i: 'out' freia, 'lin' linear, 'ease' suave)
const veAfcK = l => l.map(([t, v, i]) => ({ t: +Math.max(0, t).toFixed(4), v: +(+v).toFixed(2), i: i || 'lin' }));

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
    out.filter(c => c.fx && c.fx.some(f => f.t === 'lc') && VE.media[c.m] && VE.media[c.m].kind === 'ajuste').forEach(c => {
        c.st = +aIni.toFixed(4); c.e = +(aFim - aIni).toFixed(4);
    });
    // a cena antes do encerramento não escurece (o encerramento entra no lugar)
    if (x.fimIni != null) out.forEach(c => { if (c.tout && c.tout.t === 'fadeblack' && Math.abs(c.st + c.e - c.s - x.fimIni) < 0.05) delete c.tout; });
    const tAuto = m.trans.length ? m.trans[0] : 'pull';
    const tin = { t: tAuto, d: 0.4, speed: 'fast', ...(VE_TR[tAuto] && VE_TR[tAuto].dir ? { dir: 'u' } : {}) };
    // efeitos sonoros: trilhas de áudio A2 em diante, sem sobrepor
    const fimA = [];
    const som = (s, st, g = -6) => {
        if (!s || !s.md) return;
        let ini = 0;
        if (st < 0) { ini = -st; st = 0; }
        const dur = Math.min(s.dur - ini, x.total - st);
        if (dur <= 0.05) return;
        let k = fimA.findIndex(f => f <= st + 1e-3);
        if (k < 0) { fimA.push(0); k = fimA.length - 1; }
        fimA[k] = st + dur;
        out.push({ tr: k + 1, st: +st.toFixed(4), s: +ini.toFixed(4), e: +(ini + dur).toFixed(4), m: s.md.id, g });
    };
    const sx = x.sfx || {};
    const logoSc = larg => x.logo ? W * larg / x.logo.w * 100 : 100;
    const texto = (st, dur, t, y, tr, selo) => {
        if (!t || !t.trim() || typeof veTxMidia !== 'function' || dur <= 0.1) return;
        out.push({ tr, st: +st.toFixed(4), s: 0, e: +dur.toFixed(3), m: veTxMidia().id,
            tx: { ...VE_TX_PADRAO, t: t.trim(), fonte: m.fonte || 'Arial', cor: m.paleta.texto, tam: selo ? 64 : 72, alin: 'center',
                ...(selo ? { fOn: true, fCor: m.paleta.primaria, fOp: 100, fPad: 26, fRaio: 22 } : { sOn: true, sOp: 55, sBlur: 14 }) },   // selo na cor principal: contrasta com o círculo (destaque)
            p: { sc: 100, x: W / 2, y, rot: 0, op: 100 },
            txa: typeof veTxaObj === 'function' ? { in: veTxaObj(selo ? 'pop' : 'subir'), out: veTxaObj('fade') } : undefined });
    };
    // logo simples (intro "logo sobre a cor/cenas" e encerramento simples)
    const logoEm = (st, dur, larg, y, anim, tr) => {
        if (!x.logo) return;
        const sc = +logoSc(larg).toFixed(2), e = +dur.toFixed(4), d = Math.min(0.35, dur / 4);
        const c = { tr, st: +st.toFixed(4), s: 0, e, m: x.logo.id, p: { sc, x: W / 2, y, rot: 0, op: 100 } };
        if (anim === 'pop') c.k = { sc: veAfcK([[0, sc * 0.6, 'out'], [d, sc * 1.06, 'out'], [d * 1.6, sc], [e - 0.2, sc], [e, sc * 1.08]]),
            op: veAfcK([[0, 0, 'out'], [d * 0.6, 100], [e - 0.2, 100], [e, 0]]) };
        else if (anim === 'zoom') c.k = { sc: veAfcK([[0, sc * 0.94], [e, sc * 1.06]]), op: veAfcK([[0, 0, 'out'], [d * 1.5, 100], [e - 0.3, 100], [e, 0]]) };
        else c.k = { op: veAfcK([[0, 0, 'ease'], [d * 1.5, 100], [e - 0.3, 100], [e, 0]]) };
        out.push(c);
    };
    // bloco animado (intro e encerramento): círculo na cor de destaque, faixas cruzando, cards de fotos entrando na
    // batida, logo batendo no compasso com clarão, texto em selo; sons no tempo
    const animado = (st, D, opts) => {
        const N = Math.max(4, Math.round(D / b)), T = k => st + Math.min(D - 0.2, k * b);
        const cards = opts.cards || [], L = opts.cards && opts.cards.length ? T(N / 2) : T(Math.min(1, N / 4));
        // círculo
        const circ = { tr: nova(), st: +st.toFixed(4), s: 0, e: +D.toFixed(4), m: veGrMidia('forma', 'Forma').id,
            fm: { t: 'eli', w: 1250, h: 1250, cor: m.paleta.secundaria, cOn: false, cCor: '#ffffff', cLarg: 8, raio: 0 },
            p: { sc: 100, x: W / 2, y: H * 0.45, rot: 0, op: 100 } };
        circ.k = { sc: veAfcK([[0, 0, 'out'], [Math.min(b * 0.9, 0.6), 100], [L - st, 100, 'out'], [L - st + 0.12, 112, 'out'], [L - st + 0.4, 100], [D - 0.3, 100], [D, 0]]) };
        out.push(circ);
        // faixas diagonais cruzando a tela em velocidades diferentes
        [[H * 0.2, -500, W + 500, 0.28], [H * 0.78, W + 500, -500, 0.2]].forEach(([y, a, z, op]) => out.push({
            tr: nova(), st: +st.toFixed(4), s: 0, e: +D.toFixed(4), m: veGrMidia('forma', 'Forma').id,
            fm: { t: 'ret', w: 1500, h: 40, cor: m.paleta.texto, cOn: false, cCor: '#ffffff', cLarg: 8, raio: 20 },
            p: { sc: 100, x: a, y, rot: -16, op: op * 100 }, k: { x: veAfcK([[0, a, 'ease'], [D, z]]) } }));
        // cards: entram um por batida, girados, e recuam quando o logo bate
        const pos = [[W * 0.28, H * 0.3, -8], [W * 0.73, H * 0.47, 7], [W * 0.3, H * 0.67, -4]];
        cards.forEach((md, i) => {
            const t = T((i + 1) * N / 8) - st, sc = W * 0.44 / md.w * 100, [px, py, rot] = pos[i];
            const fim = D - t, l = L - st - t;
            out.push({ tr: nova(), st: +(st + t).toFixed(4), s: 0, e: +fim.toFixed(4), m: md.id,
                p: { sc: +sc.toFixed(2), x: px, y: py, rot, op: 100 },
                fx: [{ id: veFxNewId(), t: 'rounded', on: true, v: { raio: 7 } }],
                k: { sc: veAfcK([[0, 0, 'out'], [0.16, sc * 1.08, 'out'], [0.3, sc], [Math.max(0.31, l), sc, 'out'], [Math.max(0.32, l + 0.25), sc * 0.9], [fim - 0.25, sc * 0.9], [fim, 0]]),
                     op: veAfcK([[0, 100], [Math.max(0.31, l), 100, 'out'], [Math.max(0.32, l + 0.25), 45], [fim, 45]]) } });
            som(i % 2 ? sx.pop2 : sx.pop, st + t - 0.02, -7);
        });
        // logo batendo no compasso (entra grande e assenta), com clarão
        if (x.logo) {
            const sc = logoSc(opts.larg || 0.62), e = st + D - L;
            out.push({ tr: nova(), st: +L.toFixed(4), s: 0, e: +e.toFixed(4), m: x.logo.id,
                p: { sc: +sc.toFixed(2), x: W / 2, y: H * 0.45, rot: 0, op: 100 },
                k: { sc: veAfcK([[0, sc * 1.7, 'out'], [0.16, sc * 0.95, 'out'], [0.3, sc], [e - 0.3, sc * 1.04], [e, sc * 1.25]]),
                     op: veAfcK([[0, 0, 'out'], [0.06, 100], [e - 0.2, 100], [e, 0]]), rot: veAfcK([[0, -7, 'out'], [0.3, 0]]) } });
            if (x.clarao) out.push({ tr: nova(), st: +L.toFixed(4), s: 0, e: 0.3, m: x.clarao.id, p: { ...cheio }, k: { op: veAfcK([[0, 70, 'out'], [0.3, 0]]) } });
        }
        texto(L + b / 2, st + D - L - b / 2, opts.texto, H * 0.64, nova(), true);
        // sons: riser até o logo, impacto no logo, sucesso no texto
        if (opts.riser && sx.riser) som(sx.riser, L - sx.riser.dur, -5);
        som(sx.boom, L - 0.02, -3);
        if (opts.fimSom) som(sx.fim, L + b / 2 - 0.02, -6);
        return L;
    };
    // intro
    if (m.intro.tipo === 'animada' && x.introFim) {
        out.push({ tr: SC, st: 0, s: 0, e: +x.introFim.toFixed(4), m: corP(), p: { ...cheio } });
        animado(0, x.introFim, { cards: x.cards, texto: VEAF.titulo, riser: true });
        const primeira = out.find(c => c.tr === SC && Math.abs(c.st - x.introFim) < 0.02 && VE.media[c.m] && VE.media[c.m].kind !== 'cor');
        if (primeira) primeira.tin = { ...tin };
        som(sx.whoosh, x.introFim - (sx.whoosh ? sx.whoosh.dur * 0.45 : 0), -6);
    } else if (m.intro.tipo === 'logo_cor' && x.introFim) {
        out.push({ tr: SC, st: 0, s: 0, e: +x.introFim.toFixed(4), m: corP(), p: { ...cheio } });
        logoEm(0, x.introFim, 0.55, H * (VEAF.titulo ? 0.44 : 0.5), m.intro.anim, nova());
        texto(Math.min(b, x.introFim / 3), x.introFim - Math.min(b, x.introFim / 3), VEAF.titulo, H * 0.62, nova());
        const primeira = out.find(c => c.tr === SC && Math.abs(c.st - x.introFim) < 0.02 && VE.media[c.m] && VE.media[c.m].kind !== 'cor');
        if (primeira) primeira.tin = { ...tin };
        som(sx.boom, 0, -4);
        som(sx.whoosh, x.introFim - (sx.whoosh ? sx.whoosh.dur * 0.45 : 0), -6);
    } else if (m.intro.tipo === 'logo_cena') {
        const di = Math.min(x.total / 3, veAfcCompassos(m.intro.compassos, plano.bpm) * 4 * b);
        logoEm(0, di, 0.5, H * 0.45, m.intro.anim, nova());
        texto(Math.min(b, di / 3), di - Math.min(b, di / 3), VEAF.titulo, H * 0.6, nova());
        som(sx.boom, 0, -4);
        x.introFim = di;
    } else if (m.intro.tipo === 'video' && x.introV) {
        const dur = m.intro.transparente ? x.introV.info.duration : (x.introFim || x.introV.info.duration);
        out.push({ tr: m.intro.transparente ? nova() : SC, st: 0, s: 0, e: +Math.min(dur, x.introV.info.duration).toFixed(4), m: x.introV.id, x: 'v' });
        if (m.intro.transparente) x.introFim = 0;
        texto(b, Math.max(1, dur - b), VEAF.titulo, H * 0.62, nova());
    } else texto(0, Math.min(x.total, Math.max(2.5, b * 8)), VEAF.titulo, H * 0.42, nova());
    // corpo: whoosh em cada transição (no máximo um a cada ~1,5 s), impacto nos flashes
    let ult = -9, alt = 0;
    out.filter(c => c.tin && c.tr === SC && c.st > iniCenas + 0.1 && c.st < fimCenas - 0.1).sort((a, b2) => a.st - b2.st).forEach(c => {
        if (c.st - ult < 1.5) return;
        const s = alt++ % 2 ? sx.whoosh2 : sx.whoosh;
        if (s) { som(s, c.st - s.dur * 0.45, -9); ult = c.st; }
    });
    out.filter(c => VE.media[c.m] && VE.media[c.m]._afBranco && c.st > iniCenas + 0.1 && c.st < fimCenas).forEach(c => som(sx.boom, c.st + 0.02, -8));
    // encerramento
    if (x.fimIni != null) {
        const df = x.total - x.fimIni;
        if (m.fim.tipo === 'animada' || m.fim.tipo === 'logo_cor') {
            out.push({ tr: SC, st: +x.fimIni.toFixed(4), s: 0, e: +df.toFixed(4), m: corP(), p: { ...cheio }, tin: { ...tin } });
            som(sx.whoosh2 || sx.whoosh, x.fimIni - ((sx.whoosh2 || sx.whoosh) ? (sx.whoosh2 || sx.whoosh).dur * 0.45 : 0), -6);
            if (m.fim.tipo === 'animada') animado(x.fimIni, df, { texto: m.fim.texto, larg: 0.55, fimSom: true });
            else {
                logoEm(x.fimIni, df, 0.5, H * (m.fim.texto ? 0.44 : 0.5), 'fade', nova());
                texto(x.fimIni + Math.min(b, df / 3), df - Math.min(b, df / 3), m.fim.texto, H * 0.6, nova());
            }
        } else if (x.fimV) {
            out.push({ tr: SC, st: +x.fimIni.toFixed(4), s: 0, e: +Math.min(df, x.fimV.info.duration).toFixed(4), m: x.fimV.id, x: 'v' });
        }
    }
    // logo no canto, das cenas até o encerramento
    if (x.logo && m.marca.pos !== 'nao') {
        const larg = (m.marca.tam || 16) / 100, sc = +logoSc(larg).toFixed(2);
        const lw = W * larg, lh = x.logo.h * lw / x.logo.w, mx = 56 + lw / 2, my = 90 + lh / 2;
        const px = m.marca.pos.endsWith('d') ? W - mx : mx, py = m.marca.pos.startsWith('s') ? my : H - my - 140;
        const st = x.introFim || 0, dur = fimCenas - st;
        if (dur > 0.5) out.push({ tr: nova(), st: +st.toFixed(4), s: 0, e: +dur.toFixed(4), m: x.logo.id,
            p: { sc, x: +px.toFixed(1), y: +py.toFixed(1), rot: 0, op: m.marca.op ?? 90 },
            k: { op: veAfcK([[0, 0, 'ease'], [0.4, m.marca.op ?? 90]]) } });
    }
    if (x.semPack) veToast(veT('Dica: baixe o pack no painel Soundboard para o AutoFrame pôr efeitos sonoros'));
    return out;
}
