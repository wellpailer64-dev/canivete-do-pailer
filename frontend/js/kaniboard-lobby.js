// =========================================================
// KaniBoard — tela de entrada: "Novo quadro", modelos (com prévia desenhada de verdade) e a grade "Seus quadros"
// com prévia de cada um (thumb.png), favoritos, busca, ordem, renomear, duplicar e apagar (vai para a _lixeira).
// =========================================================
const KBL = { filtro: 'todos', busca: '', ordem: kbPref('ordem') || 'recentes' };

// ───────────── modelos ─────────────
function kbModelo(chave) {
    const it = [], add = o => { it.push(o); return o; };
    const N = (x, y, html, cor = '#FFF59D', o = {}) => add({ id: kbId(), tipo: 'nota', x, y, w: 200, h: 200, cor, html, alinhar: 'center', ...o });
    const F = (x, y, w, h, forma, html, preench = '#ffffff', o = {}) => add({ id: kbId(), tipo: 'forma', x, y, w, h, forma, html, preench, borda: '#343a40', esp: 2, corTexto: '#1a1a1a', fs: 20, alinhar: 'center', ...o });
    const T = (x, y, html, fs = 40, w = 900, o = {}) => add({ id: kbId(), tipo: 'texto', x, y, w, h: fs * 1.3, html, cor: '#1a1a1a', fs, alinhar: 'left', ...o });
    const Fr = (x, y, w, h, nome, cor = '#ffffff') => add({ id: kbId(), tipo: 'frame', x, y, w, h, nome, cor });
    const S = (a, la, b, lb, o = {}) => add({ id: kbId(), tipo: 'seta', a: { id: a.id, lado: la }, b: { id: b.id, lado: lb }, estilo: 'curva', cor: '#343a40', esp: 2, pontaA: 'nada', pontaB: 'seta', tracejado: false, rotulo: '', ...o });
    if (chave === 'brainstorm') {
        T(-480, -560, '<b>Brainstorm</b>', 56);
        T(-480, -480, 'Escreva uma ideia por nota. Quantidade antes de qualidade — depois agrupe as parecidas.', 22, 900, { cor: '#495057' });
        const c = F(-160, -90, 320, 180, 'elipse', '<b>Tema central</b>', '#1a1a1a', { corTexto: '#ffffff', borda: '#1a1a1a', fs: 30 });
        const cores = ['#FFF59D', '#FFC078', '#FFA8A8', '#E5B3FF', '#A5D8FF', '#B2F2BB', '#99E9F2', '#FFE066'];
        for (let i = 0; i < 8; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 4, x = Math.cos(a) * 560 - 100, y = Math.sin(a) * 400 - 100;
            const n = N(x, y, i < 3 ? ['Ideia', 'Outra ideia', 'E se…?'][i] : '', cores[i]);
            S(c, 'auto', n, 'auto', { pontaB: 'nada', cor: '#adb5bd' });
        }
    } else if (chave === 'kanban') {
        T(0, -170, '<b>Quadro de tarefas</b>', 56);
        [['A fazer', '#f8f9fa', ['Roteiro do vídeo', 'Fotos do produto', 'Legenda dos posts']], ['Fazendo', '#fff9db', ['Edição do reels', 'Arte do carrossel']], ['Feito', '#ebfbee', ['Briefing com o cliente']]]
            .forEach(([nome, cor, notas], i) => {
                Fr(i * 600, 0, 540, 1100, nome, cor);
                notas.forEach((t, j) => N(i * 600 + 40 + (j % 2) * 240, 40 + Math.floor(j / 2) * 240, t, ['#FFF59D', '#FFE066', '#B2F2BB'][i]));
            });
    } else if (chave === 'fluxo') {
        T(0, -200, '<b>Fluxograma</b>', 56);
        const a = F(0, 0, 200, 90, 'arred', 'Início', '#B2F2BB');
        const b = F(320, 0, 220, 110, 'ret', 'Etapa 1');
        const c = F(660, -20, 200, 150, 'losango', 'Deu certo?', '#FFF59D');
        const d = F(980, 0, 220, 110, 'ret', 'Etapa 2');
        const e = F(660, 260, 200, 110, 'ret', 'Ajustar', '#FFA8A8');
        const f = F(1320, 10, 200, 90, 'arred', 'Fim', '#B2F2BB');
        S(a, 'r', b, 'l', { estilo: 'reta' }); S(b, 'r', c, 'l', { estilo: 'reta' }); S(c, 'r', d, 'l', { estilo: 'reta', rotulo: 'Sim' });
        S(c, 'b', e, 't', { estilo: 'reta', rotulo: 'Não' }); S(e, 'l', b, 'b', { estilo: 'cotovelo' }); S(d, 'r', f, 'l', { estilo: 'reta' });
    } else if (chave === 'mapa') {
        const c = F(-170, -70, 340, 140, 'arred', '<b>Assunto</b>', '#4263eb', { corTexto: '#fff', borda: '#4263eb', fs: 32 });
        const ramos = [['Público', -720, -380, '#FFC078'], ['Objetivo', 420, -380, '#B2F2BB'], ['Canais', -720, 300, '#A5D8FF'], ['Prazo', 420, 300, '#E5B3FF']];
        ramos.forEach(([t, x, y, cor]) => {
            const r = F(x, y, 300, 90, 'arred', `<b>${t}</b>`, cor, { borda: cor, fs: 24 });
            S(c, x < 0 ? 'l' : 'r', r, x < 0 ? 'r' : 'l', { pontaB: 'nada', esp: 3, cor: '#868e96' });
            [0, 1].forEach(k => {
                const sx = x < 0 ? x - 320 : x + 400, sy = y - 70 + k * 160;
                const s = add({ id: kbId(), tipo: 'texto', x: sx, y: sy + 20, w: 220, h: 36, html: k ? 'Detalhe' : 'Tópico', cor: '#343a40', fs: 24, alinhar: x < 0 ? 'right' : 'left' });
                S(r, x < 0 ? 'l' : 'r', s, x < 0 ? 'r' : 'l', { pontaB: 'nada', cor: '#adb5bd' });
            });
        });
    } else if (chave === 'retro') {
        T(0, -170, '<b>Retrospectiva</b>', 56);
        [['O que foi bem', '#ebfbee', '#B2F2BB'], ['O que melhorar', '#fff4e6', '#FFC078'], ['Próximas ações', '#e7f5ff', '#A5D8FF']].forEach(([nome, cor, nc], i) => {
            Fr(i * 600, 0, 540, 800, nome, cor);
            N(i * 600 + 40, 40, '', nc); N(i * 600 + 280, 40, '', nc);
        });
    } else if (chave === 'storyboard') {
        T(0, -170, '<b>Storyboard do vídeo</b>', 56);
        T(0, -100, 'Um frame por cena: arraste a imagem de referência para dentro e descreva fala, ação e áudio na nota.', 22, 1400, { cor: '#495057' });
        for (let i = 0; i < 6; i++) {
            const x = (i % 3) * 760, y = Math.floor(i / 3) * 760;
            Fr(x, y, 720, 405, 'Cena ' + (i + 1), '#e9ecef');
            add({ id: kbId(), tipo: 'texto', x, y: y + 430, w: 480, h: 32, html: '<b>Fala:</b> …', cor: '#343a40', fs: 22, alinhar: 'left' });
            add({ id: kbId(), tipo: 'texto', x, y: y + 470, w: 480, h: 32, html: '<b>Ação / câmera:</b> …', cor: '#343a40', fs: 22, alinhar: 'left' });
            N(x + 520, y + 425, 'Áudio / trilha', '#FFE066', { w: 200, h: 120 });
        }
    } else if (chave === 'conteudo') {
        T(0, -170, '<b>Calendário de conteúdo</b>', 56);
        const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        const tipos = [['Reels', '#FFA8A8'], ['Carrossel', '#A5D8FF'], ['Story', '#FFF59D'], ['Post', '#B2F2BB']];
        dias.forEach((d, i) => {
            Fr(i * 320, 0, 290, 900, d, i > 4 ? '#f8f9fa' : '#ffffff');
            const [t, cor] = tipos[(i * 3) % 4];
            N(i * 320 + 25, 40, t, cor, { w: 240, h: 160 });
            if (i % 2 === 0) N(i * 320 + 25, 230, tipos[(i + 2) % 4][0], tipos[(i + 2) % 4][1], { w: 240, h: 160 });
        });
    }
    return it;
}
const KB_MODELOS = [
    ['branco', 'Em branco', 'Quadro vazio'], ['brainstorm', 'Brainstorm', 'Ideias em volta de um tema'], ['kanban', 'Tarefas', 'A fazer, fazendo, feito'],
    ['fluxo', 'Fluxograma', 'Etapas e decisões'], ['mapa', 'Mapa mental', 'Assunto e ramos'], ['storyboard', 'Storyboard', 'Cenas do vídeo'],
    ['conteudo', 'Calendário de conteúdo', 'Posts da semana'], ['retro', 'Retrospectiva', 'Bem, melhorar, ações'],
];

async function kbCriarQuadro(nome, modelo = 'branco') {
    const a = kbApi(); if (!a) return null;
    const m = KB_MODELOS.find(x => x[0] === modelo);
    const doc = kbDocVazio(); doc.itens = kbModelo(modelo);
    const r = await a.kb_novo(nome || (modelo === 'branco' ? 'Sem título' : m ? m[1] : 'Sem título'), JSON.stringify(doc));
    if (!r || !r.success) { kbToast('Não criou o quadro: ' + ((r && r.error) || ''), 'erro'); return null; }
    KB.lista = await a.kb_listar();
    await kbAbrir(r.id);
    if (modelo === 'branco') { kbFerramenta('nota'); kbFlyFechar(); }
    return r.id;
}

// ───────────── tela de entrada ─────────────
function kbAoTrocar(toolId) {
    if (toolId !== 'kaniboard') {
        if (KB.doc && (KB.sujo || KB.thumbPendente || KB.camSuja)) { KB.sujo = KB.sujo || KB.thumbPendente; kbSalvarJa(true); }
        if (KB.show) kbShowSair();
        return;
    }
    kbMontar();
    if (KB.doc) { kbEl('kbo-inicio').hidden = true; kbEl('kbo-editor').hidden = false; KB.els.forEach(el => { el._sig = ''; }); kbRenderTudo(); kbAplicarCam(); }
    else kbLobby();
}
async function kbLobby() {
    kbMontar();
    kbEl('kbo-editor').hidden = true;
    const el = kbEl('kbo-inicio'); el.hidden = false;
    if (!el.dataset.ok) {
        el.dataset.ok = '1';
        el.innerHTML = `<div class="ie-inicio-box kl-inner kbo-lobby">
          <div class="kl-hero kbo-hero"><canvas class="kbo-hero-arte" id="kbo-hero-arte" width="760" height="420" aria-hidden="true"></canvas>
            <div class="kl-hero-txt"><span class="app-logo al-kb app-logo-grande">Kb</span><h2>Seu quadro infinito</h2>
              <p>Notas adesivas, formas, setas que grudam, caneta, imagens e GIFs num quadro sem fim. Separe por frames, organize ideias, planeje vídeos e apresente.</p></div>
            <div class="kl-acoes"><button class="ie-btn ie-btn-primario kl-novo" data-kbl="novo:branco"><svg class="i"><use href="#i-file"/></svg> Novo quadro</button></div></div>
          <section class="kbo-sec"><div class="ie-recentes-tit">Comece de um modelo</div>
            <div class="kbo-modelos">${KB_MODELOS.map(([k, n, d]) => `<button class="kbo-modelo" data-kbl="novo:${k}"><canvas width="240" height="150" data-modelo="${k}"></canvas><b>${n}</b><small>${d}</small></button>`).join('')}</div></section>
          <section class="kbo-sec kbo-sec-quadros"><div class="kbo-sec-topo"><b>Seus quadros</b><span id="kbo-l-n"></span>
              <div class="kbo-seg kbo-l-filtro">${[['todos', 'Todos'], ['fav', '★ Favoritos']].map(([k, n]) => `<button data-kbl="filtro:${k}">${n}</button>`).join('')}</div>
              <input id="kbo-l-busca" class="kbo-l-busca" placeholder="Buscar quadro" spellcheck="false">
              <select id="kbo-l-ordem" class="kbo-l-ordem"><option value="recentes">Editados por último</option><option value="nome">Nome (A–Z)</option><option value="criados">Criados por último</option></select></div>
            <div class="kbo-grade" id="kbo-l-grade"></div></section>
        </div>`;
        el.addEventListener('click', kbLobbyClique);
        kbEl('kbo-l-busca').addEventListener('input', e => { KBL.busca = e.target.value; kbLobbyGrade(); });
        kbEl('kbo-l-ordem').addEventListener('change', e => { KBL.ordem = e.target.value; kbPref('ordem', KBL.ordem); kbLobbyGrade(); });
        kbEl('kbo-l-ordem').value = KBL.ordem;
        requestAnimationFrame(kbLobbyPrevias);
    }
    const a = kbApi();
    if (a) { try { KB.lista = await a.kb_listar(); } catch (e) { KB.lista = []; } }
    kbLobbyGrade();
    if (typeof KL_API === 'object') KL_API.aplicar();
}
// prévias dos modelos e a arte do cartão (desenhadas com o mesmo motor do quadro)
function kbLobbyPrevias() {
    const docAntes = KB.doc;
    KB.doc = KB.doc || kbDocVazio();   // kbRaster lê o fundo do doc
    document.querySelectorAll('#kbo-inicio canvas[data-modelo]').forEach(cv => {
        const itens = kbModelo(cv.dataset.modelo), ctx = cv.getContext('2d');
        KB.doc = { ...kbDocVazio(), itens };   // as setas acham as pontas pelo doc
        if (!itens.length) {
            const src = kbRaster([], { x: 0, y: 0, w: 480, h: 300 }, cv.width, cv.height);
            ctx.drawImage(src, 0, 0);
            ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.font = `300 44px ${kbFonte()}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('+', cv.width / 2, cv.height / 2); return;
        }
        const cx = kbCaixaTudo(itens), m = Math.max(cx.w, cx.h) * .07;
        ctx.drawImage(kbRaster(itens, { x: cx.x - m, y: cx.y - m, w: cx.w + m * 2, h: cx.h + m * 2 }, cv.width, cv.height), 0, 0);
    });
    const arte = kbEl('kbo-hero-arte');
    if (arte) {
        const itens = kbModelo('brainstorm').filter(i => i.tipo !== 'texto'); KB.doc = { ...kbDocVazio(), itens };
        const cx = kbCaixaTudo(itens);
        arte.getContext('2d').drawImage(kbRaster(itens, { x: cx.x - 60, y: cx.y - 40, w: cx.w + 120, h: cx.h + 80 }, arte.width, arte.height, { fundo: false }), 0, 0);
    }
    KB.doc = docAntes;
}
function kbQuando(t) {
    if (!t) return '';
    const s = (Date.now() / 1000 - t);
    if (s < 60) return 'agora mesmo';
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    if (s < 86400 * 2) return 'ontem';
    if (s < 86400 * 7) return `há ${Math.floor(s / 86400)} dias`;
    return new Date(t * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function kbLobbyGrade() {
    const g = kbEl('kbo-l-grade'); if (!g) return;
    document.querySelectorAll('.kbo-l-filtro button').forEach(b => b.classList.toggle('on', b.dataset.kbl === 'filtro:' + KBL.filtro));
    const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let l = KB.lista.slice();
    if (KBL.filtro === 'fav') l = l.filter(b => b.favorito);
    if (KBL.busca.trim()) l = l.filter(b => sem(b.nome).includes(sem(KBL.busca.trim())));
    if (KBL.ordem === 'nome') l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    else if (KBL.ordem === 'criados') l.sort((a, b) => b.criado - a.criado);
    else l.sort((a, b) => b.alterado - a.alterado);
    kbEl('kbo-l-n').textContent = KB.lista.length ? String(KB.lista.length) : '';
    if (!l.length) {
        g.innerHTML = `<div class="kbo-l-vazio">${KB.lista.length ? 'Nenhum quadro com esse filtro.' : 'Nenhum quadro ainda. Comece um em branco ou de um modelo acima.'}</div>`;
        return;
    }
    g.innerHTML = l.map(b => `<div class="kbo-card" data-id="${b.id}">
        <button class="kbo-card-img" data-kbl="abrir:${b.id}" title="Abrir">${b.thumb ? `<img src="${kbEsc(b.thumb)}" alt="" loading="lazy" decoding="async">` : '<i class="kbo-card-semprevia"></i>'}</button>
        <div class="kbo-card-info"><b class="kbo-card-nome" title="${kbEsc(b.nome)}">${kbEsc(b.nome)}</b><small>Editado ${kbQuando(b.alterado)} · ${b.n} ${b.n === 1 ? 'item' : 'itens'}</small></div>
        <button class="kbo-card-fav${b.favorito ? ' on' : ''}" data-kbl="fav:${b.id}" title="${b.favorito ? 'Tirar dos favoritos' : 'Favoritar'}">★</button>
        <button class="kbo-card-mais" data-kbl="mais:${b.id}" title="Mais">⋯</button></div>`).join('');
}
async function kbLobbyClique(e) {
    const b = e.target.closest('[data-kbl]'); if (!b) return;
    const [a, v] = b.dataset.kbl.split(/:(.*)/), api = kbApi();
    if (a === 'novo') { b.disabled = true; await kbCriarQuadro('', v); b.disabled = false; }
    else if (a === 'abrir') kbAbrir(v);
    else if (a === 'filtro') { KBL.filtro = v; kbLobbyGrade(); }
    else if (a === 'fav') {
        const q = KB.lista.find(x => x.id === v); if (!q) return;
        q.favorito = !q.favorito; kbLobbyGrade(); await api.kb_favoritar(v, q.favorito);
    }
    else if (a === 'mais') kbCardMenu(b, v);
}
function kbCardMenu(btn, id) {
    const q = KB.lista.find(x => x.id === id); if (!q) return;
    let m = kbEl('kbo-l-menu');
    if (!m) { m = document.createElement('div'); m.id = 'kbo-l-menu'; m.className = 'kbo-painel kbo-menu kbo-l-menu'; kbEl('kbo').appendChild(m); }
    m.innerHTML = `<button data-m="abrir">Abrir</button><button data-m="renomear">Renomear</button><button data-m="duplicar">Duplicar</button>
        <button data-m="fav">${q.favorito ? 'Tirar dos favoritos' : 'Favoritar'}</button><hr><button data-m="apagar" class="perigo">Apagar</button>`;
    m.hidden = false;
    const r = btn.getBoundingClientRect(), base = kbEl('kbo').getBoundingClientRect();
    m.style.left = Math.min(base.width - m.offsetWidth - 8, r.right - base.left - m.offsetWidth) + 'px';
    m.style.top = Math.min(base.height - m.offsetHeight - 8, r.bottom - base.top + 4) + 'px';
    const fechar = ev => { if (!ev.target.closest('#kbo-l-menu')) { m.hidden = true; document.removeEventListener('pointerdown', fechar, true); } };
    setTimeout(() => document.addEventListener('pointerdown', fechar, true), 0);
    m.onclick = async ev => {
        const o = ev.target.closest('[data-m]'); if (!o) return;
        m.hidden = true; document.removeEventListener('pointerdown', fechar, true);
        const api = kbApi(), acao = o.dataset.m;
        if (acao === 'abrir') kbAbrir(id);
        else if (acao === 'renomear') kbCardRenomear(id);
        else if (acao === 'duplicar') { const r2 = await api.kb_duplicar(id); if (r2 && r2.success) { KB.lista = await api.kb_listar(); kbLobbyGrade(); } }
        else if (acao === 'fav') { q.favorito = !q.favorito; kbLobbyGrade(); await api.kb_favoritar(id, q.favorito); }
        else if (acao === 'apagar') {
            const ok = typeof appConfirm === 'function' ? await appConfirm({ titulo: 'Apagar quadro', texto: `"${q.nome}" vai para a lixeira do KaniBoard (pasta _lixeira).`,
                botoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Apagar', valor: true, tipo: 'perigo' }] }) : confirm('Apagar o quadro?');
            if (!ok) return;
            const r3 = await api.kb_apagar(id);
            if (r3 && r3.success) { KB.lista = KB.lista.filter(x => x.id !== id); kbLobbyGrade(); } else kbToast('Não apagou: ' + ((r3 && r3.error) || ''), 'erro');
        }
    };
}
function kbCardRenomear(id) {
    const card = document.querySelector(`#kbo-l-grade .kbo-card[data-id="${id}"]`), q = KB.lista.find(x => x.id === id); if (!card || !q) return;
    const nomeEl = card.querySelector('.kbo-card-nome');
    const inp = document.createElement('input'); inp.className = 'kbo-card-input'; inp.value = q.nome; inp.spellcheck = false;
    nomeEl.replaceWith(inp); inp.focus(); inp.select();
    let feito = false;
    const fim = async ok => {
        if (feito) return; feito = true;
        const nome = inp.value.trim();
        if (ok && nome && nome !== q.nome) { q.nome = nome; await kbApi().kb_renomear(id, nome); }
        kbLobbyGrade();
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
    inp.addEventListener('blur', () => fim(true));
}
