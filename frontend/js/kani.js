// =========================================================
// Kani — assistente de conversa do KANIVETE (local, Qwen3.5 4B; Functions/kani.py). Gaveta à direita, aberta de
// qualquer ferramenta: pela bolinha da Home ou pelo item "Kani" na seção IA da barra lateral. Sabe em que ferramenta a
// pessoa está e responde com a ajuda do app (frontend/ajuda/kani_kb.json); [[abrir:id]] na resposta vira botão.
// Primeira vez sem IA: oferece baixar (motor + modelo, ~5 GB) com progresso. Conversas em localStorage 'kani-conversas'.
// API: window.KANI (abrir, perguntar, estado).
// =========================================================
const KANI = { aberto: false, conversa: null, gerando: null, estado: null, baixando: false };
const KANI_SUGESTOES = ['Como corto um vídeo e exporto para reels (9:16)?', 'Como tiro o fundo de uma foto?',
    'Gera uma imagem de um café da manhã aconchegante, luz da janela', 'Cria um efeito sonoro de porta rangendo',
    'Faz uma vinheta animada para o meu canal de receitas', 'Me ajuda a escrever a legenda de um post'];
const kaniEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kaniApi = () => window.pywebview && window.pywebview.api;

function kaniConversas() { try { return JSON.parse(localStorage.getItem('kani-conversas') || '[]'); } catch (e) { return []; } }
function kaniGuardar() {
    const c = KANI.conversa; if (!c || !c.msgs.length) return;
    const l = kaniConversas().filter(x => x.id !== c.id);
    l.unshift({ ...c, quando: Date.now() });
    try { localStorage.setItem('kani-conversas', JSON.stringify(l.slice(0, 30))); } catch (e) { /* sem storage */ }
}
function kaniNova() { KANI.conversa = { id: 'k' + Date.now().toString(36), titulo: '', msgs: [] }; kaniRender(); }

function kaniFerramentaAtual() {
    const pg = document.querySelector('.tool-page.active'); if (!pg) return '';
    const id = pg.id.replace(/^page-/, ''); if (id === 'home') return 'Início';
    const b = document.querySelector(`.menu-item[data-tool="${id}"] .label`);
    return b ? b.textContent.trim() : id;
}
function kaniNomeFerramenta(id) { const b = document.querySelector(`.menu-item[data-tool="${id}"] .label`); return b ? b.textContent.trim() : null; }

// resposta que ensina a usar o app (tem [[abrir:id]]) não tem texto para copiar: o Qwen3.5 4B às vezes inventa uma caixinha
// ```texto no fim ("Seu fundo foi removido!") — some daqui, do Copiar e da voz
function kaniSemCaixaFalsa(txt) {
    txt = String(txt || '');
    const temAbrir = [...txt.matchAll(/\[\[(?:abrir:)?([a-z0-9-]+)\]\]/gi)].some(m => kaniNomeFerramenta(m[1]));   // só ferramenta que existe ("editor-video" inventado não conta)
    return temAbrir ? txt.replace(/```(texto|text|txt)[ \t]*\n?[\s\S]*?(```|$)/gi, '').replace(/\n{3,}/g, '\n\n') : txt;
}

// ── markdown simples (negrito, código, listas, títulos) + [[abrir:id]] ──
function kaniMd(txt) {
    txt = kaniSemCaixaFalsa(txt);
    const abrir = [];
    // o Qwen3.5 às vezes esquece o "abrir:" e escreve [[remover-fundo]]: vale também, se for uma ferramenta do app
    txt = String(txt || '').replace(/\[\[(abrir:)?([a-z0-9-]+)\]\]/gi, (m, a, id) => { if (!kaniNomeFerramenta(id)) return a ? '' : m; if (!abrir.includes(id)) abrir.push(id); return ''; });
    const inl = s => kaniEsc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    const blocos = [];
    txt = txt.replace(/```([a-zA-Z0-9_+-]*)[ \t]*\n?([\s\S]*?)(```|$)/g, (_, ling, corpo) => {   // aberto ainda (gerando) também vira caixa
        const lg = (ling || '').toLowerCase();
        blocos.push({ ling: lg, corpo: kaniSemMd(corpo.replace(/\n+$/, ''), lg) });
        return `\n@@KANIBLOCO${blocos.length - 1}@@\n`;
    });
    const linhas = txt.replace(/\r/g, '').split('\n'), out = [];
    let lista = null;
    const fecha = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
    for (const l of linhas) {
        let m;
        if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (lista !== 'ul') { fecha(); out.push('<ul>'); lista = 'ul'; } out.push(`<li>${inl(m[1])}</li>`); }
        else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (lista !== 'ol') { fecha(); out.push('<ol>'); lista = 'ol'; } out.push(`<li>${inl(m[1])}</li>`); }
        else if ((m = l.match(/^@@KANIBLOCO(\d+)@@$/))) { fecha(); const b = blocos[+m[1]], txtb = ['texto', 'text', 'txt', ''].includes(b.ling);
            out.push(`<div class="kani-saida${txtb ? '' : ' codigo'}">${txtb ? '' : `<span class="kani-saida-ling">${kaniEsc(b.ling)}</span>`}<button class="kani-copiar-saida" data-copiar-bloco="${m[1]}" title="Copiar só este texto">Copiar</button><pre>${kaniEsc(b.corpo)}</pre></div>`); }
        else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { fecha(); out.push('<hr>'); }
        else if ((m = l.match(/^#{1,4}\s+(.*)/))) { fecha(); out.push(`<h4>${inl(m[1])}</h4>`); }
        else if (!l.trim()) { fecha(); }
        else { fecha(); out.push(`<p>${inl(l)}</p>`); }
    }
    fecha();
    if (abrir.length) out.push(`<div class="kani-abrir">${abrir.map(id => `<button data-abrir="${id}">Abrir ${kaniEsc(kaniNomeFerramenta(id))} →</button>`).join('')}</div>`);
    return out.join('');
}

// ── copiar / ouvir ──
function kaniLimpo(txt) { return kaniSemCaixaFalsa(txt).replace(/\[\[(abrir:)?([a-z0-9-]+)\]\]/gi, (m, a, id) => (a || kaniNomeFerramenta(id) ? '' : m)).trim(); }
function kaniSemMd(c, ling) { return ['texto', 'text', 'txt', ''].includes(ling) ? c.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1') : c; }   // texto pronto sai limpo para colar
function kaniBlocosDe(txt) { const out = []; kaniSemCaixaFalsa(txt).replace(/```([a-zA-Z0-9_+-]*)[ \t]*\n?([\s\S]*?)(```|$)/g, (_, l, c) => { out.push(kaniSemMd(c.replace(/\n+$/, ''), (l || '').toLowerCase())); return ''; }); return out; }
function kaniParaFala(txt) {   // o que a voz lê: sem formatação, emojis, hashtags, links e blocos de código
    return kaniLimpo(txt).replace(/```(texto|text|txt)?[ \t]*\n?([\s\S]*?)(```|$)/g, (_, l, c) => (l !== undefined || !/[{};=<>]/.test(c)) ? c : ' ')
        .replace(/https?:\/\/\S+/g, ' ').replace(/#(\w+)/g, ' ').replace(/[*_`>|~]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/^#+\s*/gm, '')
        .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '').replace(/^-{3,}$/gm, '').replace(/\n{2,}/g, '. ').replace(/\s+/g, ' ').replace(/([.!?:;])(\s*\.)+/g, '$1').trim().slice(0, 1500);
}
function kaniAcoes(m, i) {
    if (!m.content || (KANI.gerando && KANI.gerando.conv === KANI.conversa && KANI.gerando.i === i)) return '';
    const v = KANI.voz && KANI.voz.i === i && KANI.voz.conv === KANI.conversa ? KANI.voz.estado : '';
    return `<div class="kani-acoes"><button data-copiar-msg="${i}" title="Copiar a resposta"><svg class="i"><use href="#i-copy"/></svg></button>
        <button data-ouvir-msg="${i}" class="${v}" title="${v === 'tocando' ? 'Parar' : v === 'carregando' ? 'Preparando a voz…' : 'Ouvir com a voz da Kani'}">${v === 'carregando' ? '<span class="kani-gira"></span>' : v === 'tocando' ? '■' : '<svg class="i"><use href="#i-volume"/></svg>'}</button></div>`;
}
async function kaniCopiar(texto, botao) {
    try { await navigator.clipboard.writeText(texto); } catch (e) { const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    if (botao) { const h = botao.innerHTML; botao.textContent = botao.dataset.copiarMsg !== undefined ? '✓' : 'Copiado ✓'; botao.classList.add('ok'); setTimeout(() => { botao.innerHTML = h; botao.classList.remove('ok'); }, 1400); }
}
function kaniOuvir(i) {
    const c = KANI.conversa, m = c.msgs[i];
    if (KANI.voz && KANI.voz.i === i && KANI.voz.conv === c) {   // clicou de novo: para
        if (KANI.audio) KANI.audio.pause();
        KANI.voz = null; kaniRender(); return;
    }
    if (KANI.audio) KANI.audio.pause();
    const chave = 'v' + Date.now().toString(36);
    KANI.voz = { i, conv: c, chave, estado: 'carregando' };
    kaniRender();
    kaniApi().kani_falar(kaniParaFala(m.content), chave);
}
window.kaniVoz = function (d) {
    const v = KANI.voz; if (!v || v.chave !== d.chave) return;
    if (d.erro) { KANI.voz = null; if (typeof toast === 'function') toast('Não consegui ler: ' + d.erro); kaniRender(); return; }
    KANI.audio = KANI.audio || new Audio();
    KANI.audio.src = d.url;
    KANI.audio.onended = () => { if (KANI.voz === v) { KANI.voz = null; kaniRender(); } };
    KANI.audio.play().catch(() => {});
    v.estado = 'tocando'; kaniRender();
};

// ── interface ──
function kaniMontar() {
    if (document.getElementById('kani')) return;
    const g = document.createElement('aside');
    g.className = 'kani notranslate'; g.id = 'kani'; g.setAttribute('translate', 'no'); g.hidden = true;
    g.innerHTML = `
        <header class="kani-cab"><span class="kani-av">K</span><div class="kani-tit"><b>Kani</b><small>assistente do KANIVETE · roda no seu computador</small></div>
            <button class="kani-bt" id="kani-hist-bt" title="Conversas"><svg class="i"><use href="#i-table"/></svg></button>
            <button class="kani-bt" title="Nova conversa" onclick="kaniNova()"><svg class="i"><use href="#i-file"/></svg></button>
            <button class="kani-bt" title="Fechar (Esc)" onclick="kaniFechar()"><svg class="i"><use href="#i-x"/></svg></button></header>
        <div class="kani-hist" id="kani-hist" hidden></div>
        <div class="kani-corpo" id="kani-corpo"></div>
        <footer class="kani-pe" id="kani-pe">
            <textarea id="kani-txt" rows="1" placeholder="Pergunte à Kani… (Enter envia, Shift+Enter quebra linha)"></textarea>
            <button class="kani-enviar" id="kani-enviar" title="Enviar"><svg class="i"><use href="#i-arrow-up"/></svg></button>
        </footer>`;
    document.body.appendChild(g);
    const txt = g.querySelector('#kani-txt');
    txt.addEventListener('input', () => { txt.style.height = 'auto'; txt.style.height = Math.min(160, txt.scrollHeight) + 'px'; });
    txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kaniEnviar(); } });
    g.querySelector('#kani-enviar').onclick = () => KANI.gerando ? kaniParar() : kaniEnviar();
    g.querySelector('#kani-hist-bt').onclick = () => { const h = g.querySelector('#kani-hist'); h.hidden = !h.hidden; if (!h.hidden) kaniRenderHist(); };
    g.addEventListener('click', e => {
        const a = e.target.closest('[data-abrir]'); if (a) { if (typeof switchTool === 'function') switchTool(a.dataset.abrir); return; }
        const s = e.target.closest('[data-sug]'); if (s) { txt.value = s.dataset.sug; kaniEnviar(); return; }
        const h = e.target.closest('[data-conv]'); if (h) { const c = kaniConversas().find(x => x.id === h.dataset.conv); if (c) { KANI.conversa = c; g.querySelector('#kani-hist').hidden = true; kaniRender(); } return; }
        if (e.target.closest('#kani-baixar')) kaniBaixar();
        const cm = e.target.closest('[data-copiar-msg]'); if (cm) { kaniCopiar(kaniLimpo(KANI.conversa.msgs[+cm.dataset.copiarMsg].content), cm); return; }
        const om = e.target.closest('[data-ouvir-msg]'); if (om) { kaniOuvir(+om.dataset.ouvirMsg); return; }
        const cr = e.target.closest('[data-cria-baixar],[data-cria-abrir],[data-cria-pasta]');
        if (cr) {
            const k = KANI.conversa.msgs[+(cr.dataset.criaBaixar ?? cr.dataset.criaAbrir ?? cr.dataset.criaPasta)].criacao, api = kaniApi();
            if (!k || !k.path) return;
            if (cr.dataset.criaBaixar !== undefined) api.kani_salvar_como(k.path).then(r => { if (r && r.success && typeof toast === 'function') toast('Salvo em ' + r.path); });
            else if (cr.dataset.criaAbrir !== undefined) api.open_file(k.path);
            else api.reveal_file(k.path);
            return;
        }
        const cb = e.target.closest('[data-copiar-bloco]');
        if (cb) { const i = +cb.closest('.kani-msg').dataset.i, k = +cb.dataset.copiarBloco; kaniCopiar(kaniBlocosDe(KANI.conversa.msgs[i].content)[k] || '', cb); return; }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && KANI.aberto && !e.defaultPrevented && document.activeElement && g.contains(document.activeElement)) kaniFechar(); });
}
function kaniRenderHist() {
    const h = document.getElementById('kani-hist'), l = kaniConversas();
    h.innerHTML = l.length ? l.map(c => `<button data-conv="${c.id}"><b>${kaniEsc(c.titulo || 'Conversa')}</b><small>${new Date(c.quando).toLocaleString()}</small></button>`).join('')
        : '<div class="kani-vazio">Nenhuma conversa ainda.</div>';
}
function kaniRender() {
    const corpo = document.getElementById('kani-corpo'); if (!corpo) return;
    const e = KANI.estado, c = KANI.conversa;
    document.getElementById('kani-pe').hidden = !(e && e.pronto);
    if (!e) { corpo.innerHTML = '<div class="kani-vazio">Carregando…</div>'; return; }
    if (!e.pronto) {
        corpo.innerHTML = `<div class="kani-setup"><span class="kani-av kani-av-g">K</span><h3>Oi! Eu sou a Kani.</h3>
            <p>Respondo dúvidas de como usar o KANIVETE e ajudo no dia a dia (textos, ideias, roteiros). Tudo roda no seu computador, sem internet.</p>
            <p>Para começar, preciso baixar a IA uma vez só (~${e.tamanho_gb} GB). Ela fica na pasta do app.</p>
            ${KANI.baixando || e.baixando ? `<div class="kani-prog"><i id="kani-prog-fill" style="width:${KANI.pct || 0}%"></i></div><small id="kani-prog-msg">${kaniEsc(KANI.msg || 'Começando…')}</small>`
            : '<button class="kani-primario" id="kani-baixar">Baixar a Kani</button>'}</div>`;
        return;
    }
    if (!c.msgs.length) {
        corpo.innerHTML = `<div class="kani-boas"><span class="kani-av kani-av-g">K</span><h3>Como posso ajudar?</h3><p>Você está em <b>${kaniEsc(kaniFerramentaAtual())}</b>. Pergunte sobre qualquer ferramenta do app, ou peça ajuda com textos e ideias.</p>
            <div class="kani-sug">${KANI_SUGESTOES.map(s => `<button data-sug="${kaniEsc(s)}">${kaniEsc(s)}</button>`).join('')}</div></div>`;
        return;
    }
    corpo.innerHTML = c.msgs.map((m, i) => m.role === 'user' ? `<div class="kani-msg eu">${kaniEsc(m.content)}</div>`
        : m.criacao ? `<div class="kani-msg ela" data-i="${i}">${kaniCriaHtml(m, i)}${m.erro ? `<div class="kani-erro">${kaniEsc(m.erro)}</div>` : ''}</div>`
        : `<div class="kani-msg ela" data-i="${i}">${m.content ? kaniMd(m.content) : '<span class="kani-pensando"><i></i><i></i><i></i></span>'}${m.erro ? `<div class="kani-erro">${kaniEsc(m.erro)}</div>` : ''}${kaniAcoes(m, i)}</div>`).join('');
    corpo.scrollTop = corpo.scrollHeight;
    const env = document.getElementById('kani-enviar');
    env.classList.toggle('parar', !!KANI.gerando);
    env.innerHTML = KANI.gerando ? '<svg class="i"><use href="#i-x"/></svg>' : '<svg class="i"><use href="#i-arrow-up"/></svg>';
    env.title = KANI.gerando ? 'Parar' : 'Enviar';
}
async function kaniAtualizarEstado() {
    const api = kaniApi(); if (!api || !api.kani_estado) return;
    KANI.estado = await api.kani_estado().catch(() => null);
    kaniTrocarModelo();
    kaniRender();
}
// Modelo novo da Kani (quem tinha o anterior): baixa sozinho, por baixo, e ela segue respondendo com o anterior até ele
// chegar; o Python apaga o anterior no fim. Vale também sem abrir a gaveta (checagem 30 s depois de abrir o app).
function kaniTrocarModelo() {
    const e = KANI.estado;
    if (!e || !e.atualizar || e.baixando || KANI.trocando || KANI.trocaFalhou || KANI.baixando) return;
    KANI.trocando = true;
    kaniApi().kani_baixar().then(r => { if (!r || !r.success) KANI.trocando = false; }).catch(() => { KANI.trocando = false; });
}
setTimeout(() => { if (!KANI.estado) kaniAtualizarEstado(); }, 30000);
async function kaniAbrir() {
    kaniMontar();
    if (!KANI.conversa) kaniNova();
    KANI.aberto = true;
    document.getElementById('kani').hidden = false;
    document.body.classList.add('kani-aberta');
    kaniRender();
    kaniApi()?.kani_voz?.(true);   // carrega a voz já: o Ouvir sai rápido; fechar o chat solta a memória
    await kaniAtualizarEstado();
    setTimeout(() => document.getElementById('kani-txt')?.focus(), 50);
}
function kaniFechar() {
    if (KANI.aberto) kaniApi()?.kani_voz?.(false);
    if (KANI.audio) KANI.audio.pause();
    KANI.voz = null;
    KANI.aberto = false; const g = document.getElementById('kani'); if (g) g.hidden = true; document.body.classList.remove('kani-aberta');
}
async function kaniBaixar() {
    KANI.baixando = true; KANI.pct = 0; KANI.msg = 'Começando…'; kaniRender();
    const r = await kaniApi().kani_baixar();
    if (!r || !r.success) { KANI.baixando = false; KANI.msg = (r && r.error) || 'falhou'; kaniRender(); }
}
window.kaniProgresso = function (d) {
    if (KANI.trocando && (d.erro || d.fim)) {   // troca por baixo: sem barra; erro só no console (tenta de novo na próxima vez que o app abrir)
        KANI.trocando = false;
        if (d.fim && typeof toast === 'function') toast('A Kani foi atualizada para um modelo mais esperto.');
        if (d.erro) { KANI.trocaFalhou = true; console.warn("[Kani] troca de modelo:", d.erro); }
        kaniAtualizarEstado(); return;
    }
    if (d.erro) { KANI.baixando = false; KANI.msg = d.erro; if (typeof toast === 'function') toast(d.erro); kaniAtualizarEstado(); return; }
    if (d.fim) { KANI.baixando = false; kaniAtualizarEstado(); return; }
    KANI.pct = d.pct; KANI.msg = d.msg;
    const f = document.getElementById('kani-prog-fill'), m = document.getElementById('kani-prog-msg');
    if (f) f.style.width = d.pct + '%'; if (m) m.textContent = d.msg;
};
async function kaniEnviar(texto) {
    const t = document.getElementById('kani-txt');
    texto = (texto ?? t.value).trim();
    if (!texto || KANI.gerando) return null;
    // pedido de criar (imagem, efeito sonoro, narração, vinheta): vai para o motor certo, não para a conversa
    const tipo = await kaniApi().kani_criar_tipo?.(texto).catch(() => null);
    if (tipo) { kaniCriar(texto, tipo); return null; }
    const c = KANI.conversa;
    if (!c.titulo) c.titulo = texto.slice(0, 60);
    c.msgs.push({ role: 'user', content: texto });
    c.msgs.push({ role: 'assistant', content: '' });
    t.value = ''; t.style.height = 'auto';
    const id = 'r' + Date.now().toString(36);
    KANI.gerando = { id, conv: c, i: c.msgs.length - 1 };
    kaniRender();
    const hist = c.msgs.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const r = await kaniApi().kani_enviar(id, hist, kaniFerramentaAtual()).catch(e => ({ success: false, error: e.message }));
    if (!r || !r.success) window.kaniEvento({ id, erro: (r && r.error) || 'falhou' });
    return id;
}
function kaniParar() { if (KANI.gerando) kaniApi().kani_parar(KANI.gerando.id); }

// ── criações (Functions/kani_criar.py): imagem, efeito sonoro, narração, vinheta — progresso e entrega no chat ──
const KANI_CRIA_NOME = { imagem: 'a imagem', efeito: 'o efeito sonoro', narracao: 'a narração', vinheta: 'a vinheta' };
const KANI_CRIA_ICO = { imagem: 'image', efeito: 'volume', narracao: 'volume', vinheta: 'music' };
async function kaniCriar(texto, tipo) {
    const c = KANI.conversa, job = 'c' + Date.now().toString(36);
    if (!c.titulo) c.titulo = texto.slice(0, 60);
    c.msgs.push({ role: 'user', content: texto });
    c.msgs.push({ role: 'assistant', content: '', criacao: { job, tipo, estado: 'gerando', pct: 0, msg: 'Começando...' } });
    const t = document.getElementById('kani-txt'); t.value = ''; t.style.height = 'auto';
    kaniRender();
    const r = await kaniApi().kani_criar(job, tipo, texto).catch(e => ({ success: false, error: e.message }));
    if (!r || !r.success) window.kaniCriacao({ job, erro: (r && r.error) || 'falhou' });
}
function kaniCriaHtml(m, i) {
    const k = m.criacao, nome = KANI_CRIA_NOME[k.tipo] || 'isso';
    if (k.estado === 'gerando') return `<div class="kani-cria"><div class="kani-cria-cab"><span class="kani-gira"></span> Criando ${nome}…</div>
        <div class="kani-prog"><i style="width:${Math.max(3, k.pct || 0)}%"></i></div><small class="kani-cria-msg">${kaniEsc(k.msg || '')}</small></div>`;
    if (k.estado !== 'pronto') return '';
    if (k.path && !k._url) { k._url = 'pendente'; kaniApi().kani_criar_url(k.path).then(r => { k._url = (r && r.url) || 'sumiu'; kaniRender(); }); }
    const url = k._url && !['pendente', 'sumiu'].includes(k._url) ? k._url : null;
    const prev = k._url === 'sumiu' ? '<div class="kani-erro">Apagado ao fechar o app (as criações ficam só enquanto ele está aberto: use Baixar para guardar).</div>'
        : !url ? '<span class="kani-pensando"><i></i><i></i><i></i></span>'
        : k.tipo === 'imagem' ? `<img class="kani-cria-img" src="${kaniEsc(url)}" alt="" data-cria-abrir="${i}" title="Abrir a imagem">`
        : `<audio class="kani-cria-som" controls src="${kaniEsc(url)}"></audio>`;
    return `<div class="kani-cria pronta"><div class="kani-cria-cab"><svg class="i"><use href="#i-${KANI_CRIA_ICO[k.tipo] || 'file'}"/></svg> ${kaniEsc(k.nome || '')}</div>${prev}
        ${k.texto ? `<details class="kani-cria-txt"><summary>${k.tipo === 'imagem' || k.tipo === 'efeito' ? 'Pedido usado' : 'Texto narrado'}</summary>${kaniEsc(k.texto)}</details>` : ''}
        ${k._url === 'sumiu' ? '' : `<div class="kani-cria-bts"><button data-cria-baixar="${i}" title="Guardar uma cópia (a criação some quando o app fecha)"><svg class="i"><use href="#i-download"/></svg> Baixar</button>
            <button data-cria-abrir="${i}"><svg class="i"><use href="#i-play"/></svg> Abrir</button>
            <button data-cria-pasta="${i}"><svg class="i"><use href="#i-folder"/></svg> Mostrar na pasta</button></div>`}</div>`;
}
window.kaniCriacao = function (d) {
    let conv = null, i = -1;
    for (const c of [KANI.conversa, ...kaniConversas()]) {
        i = c ? c.msgs.findIndex(m => m.criacao && m.criacao.job === d.job) : -1;
        if (i >= 0) { conv = c; break; }
    }
    if (!conv) return;
    const m = conv.msgs[i], k = m.criacao;
    if (d.erro) { k.estado = 'erro'; m.erro = 'Não consegui criar: ' + d.erro; m.content = 'Não consegui criar ' + (KANI_CRIA_NOME[k.tipo] || '') + '.'; }
    else if (d.fim) {
        Object.assign(k, { estado: 'pronto', path: d.path, _url: d.url, nome: d.nome, texto: d.texto });
        m.content = `Pronto! Criei ${KANI_CRIA_NOME[k.tipo] || 'o arquivo'} (${d.nome}).`;
    } else {
        Object.assign(k, { pct: d.pct, msg: d.msg });
        const el = KANI.conversa === conv && document.querySelector(`#kani-corpo .kani-msg[data-i="${i}"]`);
        if (el) { el.innerHTML = kaniCriaHtml(m, i); return; }
    }
    if (d.erro || d.fim) {
        const at = KANI.conversa; KANI.conversa = conv; kaniGuardar(); KANI.conversa = at;
        if (KANI.aberto && (k.tipo === 'imagem' || k.tipo === 'efeito')) kaniApi()?.kani_voz?.(true);   // a criação soltou a voz da placa
        if (d.fim && !KANI.aberto && typeof toast === 'function') toast(`Kani: ${KANI_CRIA_NOME[k.tipo] || 'a criação'} ficou pronta`);
    }
    if (KANI.conversa === conv) kaniRender();
};
window.kaniEvento = function (d) {
    const g = KANI.gerando; if (!g || g.id !== d.id) return;
    const m = g.conv.msgs[g.i];
    if (d.delta) {
        m.content += d.delta;
        const el = document.querySelector(`#kani-corpo .kani-msg[data-i="${g.i}"]`);
        if (el && KANI.conversa === g.conv) { el.innerHTML = kaniMd(m.content); const corpo = document.getElementById('kani-corpo'); corpo.scrollTop = corpo.scrollHeight; }
        return;
    }
    if (d.status) return;
    if (d.erro) m.erro = 'Não consegui responder: ' + d.erro;
    if (d.erro || d.fim) { KANI.gerando = null; if (!m.content && !m.erro) m.content = '…'; kaniGuardar(); if (KANI.conversa === g.conv) kaniRender(); }
};

// ── bolinha na Home ──
function kaniBolinha() {
    if (document.getElementById('kani-bolinha')) return;   // fixa no canto; o CSS só mostra com a Home ativa
    const b = document.createElement('button');
    b.className = 'kani-bolinha'; b.id = 'kani-bolinha'; b.title = 'Pergunte à Kani — assistente do KANIVETE';
    b.innerHTML = '<span class="kani-av">K</span><span class="kani-bolinha-txt">Pergunte à Kani</span>';
    b.onclick = kaniAbrir;
    document.body.appendChild(b);
}
document.addEventListener('DOMContentLoaded', kaniBolinha);
if (document.readyState !== 'loading') kaniBolinha();

// ── faixa "Peça à Kani" na Home (logo abaixo da área de soltar): pergunta ou pedido de criação, com atalhos ──
const KANI_HOME_CHIPS = [['image', 'Imagem', 'Gera uma imagem de '], ['volume', 'Efeito sonoro', 'Cria um efeito sonoro de '],
    ['volume', 'Narração', 'Narre: "'], ['music', 'Vinheta', 'Faz uma vinheta para ']];
function kaniHome() {
    const drop = document.querySelector('#page-home .home-drop');
    if (!drop || document.getElementById('home-kani')) return;
    const s = document.createElement('section');
    s.className = 'home-kani'; s.id = 'home-kani';
    s.innerHTML = `<div class="home-kani-lin"><span class="home-kani-av"></span>
        <span class="home-kani-txt"><b>Peça à Kani</b><small>pergunte ou peça para criar</small></span>
        <input type="text" id="home-kani-txt" placeholder="Ex.: gera uma imagem de um café da manhã aconchegante, luz da janela">
        <button class="btn-primary" id="home-kani-ir">Enviar</button></div>
        <div class="home-kani-chips">${KANI_HOME_CHIPS.map(([i, n, t]) => `<button data-kh="${kaniEsc(t)}"><svg class="i"><use href="#i-${i}"/></svg>${n}</button>`).join('')}</div>`;
    drop.after(s);
    const inp = s.querySelector('#home-kani-txt');
    const ir = () => { const t = inp.value.trim(); if (!t) { inp.focus(); return; } inp.value = ''; KANI_API.perguntar(t); };
    s.querySelector('#home-kani-ir').onclick = ir;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ir(); } });
    s.querySelectorAll('[data-kh]').forEach(b => b.onclick = () => { inp.value = b.dataset.kh; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); });
}
document.addEventListener('DOMContentLoaded', kaniHome);
if (document.readyState !== 'loading') kaniHome();
window.KANI_API = { abrir: kaniAbrir, fechar: kaniFechar, perguntar: async t => { await kaniAbrir(); return kaniEnviar(t); },
    estado: () => KANI.estado, conversa: () => KANI.conversa, gerando: () => !!KANI.gerando };
