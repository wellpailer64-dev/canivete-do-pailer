// =========================================================
// Ata Kanivete (At, verde; Beta) — grava a reunião do Google Meet e a Kani escreve a ATA (Functions/ata_kanivete.py).
// Esquerda: entrar no Meet (Chrome à parte com o botão "● Gravar ATA" por cima; para sozinho ao sair da chamada e,
// se ligado, grava sozinho ao entrar), importar áudio, buscar e a lista de reuniões.
// Direita: a ATA editável como folha (salva sozinha; tarefas com ✓), a transcrição com player (o trecho falado acende)
// e busca, e os ajustes (falantes, glossário, estilo e pedido à Kani). Sem reunião aberta: as tarefas em aberto de todas.
// Eventos do Python chegam em ataEvento({tipo, id, p, msg}). API do agente: ATA_API. Kani lê a tela: KANI_TELA.
// =========================================================
const ATA = { lista: [], sid: null, doc: null, aba: 'ata', vivo: null, timer: null, salvarT: null, proc: {}, filtro: '', tbusca: '',
    estilos: [['formal', 'Formal']], agora: -1 };
const ataApi = () => window.pywebview && window.pywebview.api;
const ataEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ATA_CORES = ['#1FA971', '#4c9bff', '#ff8c42', '#c9a8ff', '#ff4fc8', '#f5c542', '#2ee6c8', '#ff6b6b', '#9b4dff', '#7fd6ff'];
const ataPref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } return null; };

function ataAoTrocar(toolId) {
    if (toolId !== 'ata-kanivete') { clearInterval(ATA.timer); ATA.timer = null; ataAudio.pause(); return; }
    ataMontar();
    ataListar();
    if (!ATA.doc) ataPintarMain();     // tarefas em aberto atualizadas
    if (!ATA.timer) { ataVivo(); ATA.timer = setInterval(ataVivo, 1000); }
}

function ataMontar() {
    const pg = document.getElementById('page-ata-kanivete');
    if (!pg || pg.dataset.ok) return;
    pg.dataset.ok = '1';
    const auto = ataPref('ata-auto') === '1';
    pg.innerHTML = `
    <div class="at-app">
      <aside class="at-lado">
        <div class="at-marca"><span class="app-logo al-at app-logo-marca">At</span><b>Ata Kanivete</b><span class="at-beta">Beta</span></div>
        <section class="at-card">
          <div class="at-rot">Nova reunião</div>
          <input id="at-link" class="at-campo" placeholder="Cole o link do Google Meet" spellcheck="false"
                 onkeydown="if(event.key==='Enter')ataEntrar()">
          <button class="at-bt at-prim" onclick="ataEntrar()">Entrar no Meet</button>
          <label class="at-chk" title="Começa a gravar quando você entra na chamada. Sempre para sozinho quando você sai.">
            <input type="checkbox" id="at-auto" ${auto ? 'checked' : ''} onchange="ataAuto(this.checked)"> Gravar sozinho ao entrar na chamada</label>
          <div id="at-vivo" class="at-vivo" hidden></div>
          <button class="at-bt" onclick="ataImportar()">Importar áudio ou vídeo</button>
          <p class="at-dica">O Meet abre num Chrome à parte (login uma vez). Clique em <b>● Gravar ATA</b> no topo da reunião; ao sair da
            chamada, a gravação para sozinha. Ligue as legendas do Meet (tecla C) para os nomes saírem sozinhos.</p>
        </section>
        <div class="at-rot at-rot-lista">Reuniões</div>
        <input id="at-busca" class="at-campo at-busca" placeholder="Buscar nas reuniões (título, fala, ATA)" spellcheck="false"
               oninput="ataBuscar(this.value)">
        <div id="at-lista" class="at-lista"></div>
      </aside>
      <main id="at-main" class="at-main"></main>
    </div>`;
    ataPintarMain();
    const a = ataApi();
    if (a && a.ata_estilos) a.ata_estilos().then(e => { if (e && e.length) ATA.estilos = e; });
}

async function ataListar() {
    const a = ataApi(); if (!a) return;
    if (ATA.filtro) return ataBuscar(ATA.filtro, true);
    ATA.lista = await a.ata_listar();
    ataPintarLista(ATA.lista);
}

function ataPintarLista(itens) {
    const box = document.getElementById('at-lista'); if (!box) return;
    if (!itens.length) {
        box.innerHTML = `<div class="at-vazio-lista">${ATA.filtro ? 'Nada encontrado.' : 'Nenhuma reunião ainda.'}</div>`;
        return;
    }
    const est = { gravando: 'Gravando', gravado: 'Gravada', processando: 'Processando…', pronta: '' };
    box.innerHTML = itens.map(r => `
      <button class="at-item${r.id === ATA.sid ? ' on' : ''}" data-id="${r.id}" onclick="ataAbrir('${r.id}'${r.t != null ? `, ${r.t}` : ''})">
        <b>${ataEsc(r.titulo || 'Reunião')}</b>
        <small>${ataData(r.quando)} · ${ataDur(r.duracao)}${est[r.estado] ? ` · <i class="at-est at-est-${r.estado}">${est[r.estado]}</i>` : ''}
          ${r.abertas ? ` · <i class="at-est">${r.abertas} tarefa${r.abertas > 1 ? 's' : ''}</i>` : ''}</small>
        ${r.trecho ? `<span class="at-trecho">${ataMarcar(r.trecho, ATA.filtro)}</span>` : ''}
      </button>`).join('');
}

// busca em todas as reuniões (título, transcrição e ATA; sem diferença de acento)
let ataBuscaT = null;
function ataBuscar(q, agora) {
    ATA.filtro = (q || '').trim();
    clearTimeout(ataBuscaT);
    ataBuscaT = setTimeout(async () => {
        const a = ataApi(); if (!a) return;
        if (!ATA.filtro) { ATA.lista = await a.ata_listar(); return ataPintarLista(ATA.lista); }
        ataPintarLista(await a.ata_buscar(ATA.filtro));
    }, agora ? 0 : 250);
}

const ataSemAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// <mark> no termo (sem diferença de acento: o índice do texto sem acento vale para o original, mesmo comprimento)
function ataMarcar(txt, q) {
    txt = String(txt || ''); q = ataSemAcento(q).trim();
    if (!q) return ataEsc(txt);
    const base = ataSemAcento(txt);
    if (base.length !== txt.length) return ataEsc(txt);
    let out = '', i = 0, j;
    while ((j = base.indexOf(q, i)) >= 0) { out += ataEsc(txt.slice(i, j)) + '<mark>' + ataEsc(txt.slice(j, j + q.length)) + '</mark>'; i = j + q.length; }
    return out + ataEsc(txt.slice(i));
}

function ataData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function ataDur(s) {
    s = Math.round(s || 0);
    return s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')} min` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}
const ataTempo = s => { s = Math.max(0, s || 0); return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

// ── Meet ao vivo ──
async function ataEntrar() {
    const a = ataApi(); if (!a) return;
    const link = (document.getElementById('at-link').value || '').trim();
    const r = await a.ata_meet_abrir(link, ataPref('ata-auto') === '1');
    if (!r.success) return toast(r.error || 'Não consegui abrir o Meet', 'error');
    ataVivo();
}

function ataAuto(on) {
    ataPref('ata-auto', on ? '1' : '0');
    const a = ataApi();
    if (a && ATA.vivo && ATA.vivo.aberto) a.ata_meet_cmd(on ? 'auto1' : 'auto0');
}

async function ataVivo() {
    const a = ataApi(), box = document.getElementById('at-vivo'); if (!a || !box) return;
    const e = ATA.vivo = await a.ata_meet_estado();
    box.hidden = !e.aberto;
    if (!e.aberto) return;
    box.innerHTML = e.gravando
        ? `<div class="at-vivo-l"><span class="at-ponto rec"></span><b>Gravando</b><span class="at-num">${ataTempo(e.segundos)}</span>
             <span class="at-kb">${(e.kb / 1024).toFixed(1)} MB</span></div>
           ${e.participantes.length ? `<div class="at-part">${e.participantes.map(ataEsc).join(' · ')}</div>` : ''}
           <div class="at-vivo-bts"><button class="at-bt at-parar" onclick="ataMeet('parar')">■ Parar</button>
             <button class="at-bt" onclick="ataMeet('frente')">Mostrar Meet</button></div>`
        : `<div class="at-vivo-l"><span class="at-ponto"></span><b>Meet aberto</b></div>
           <div class="at-vivo-bts"><button class="at-bt at-prim" onclick="ataMeet('gravar')">● Gravar ATA</button>
             <button class="at-bt" onclick="ataMeet('frente')">Mostrar Meet</button></div>`;
}
async function ataMeet(acao) { const a = ataApi(); if (a) { await a.ata_meet_cmd(acao); ataVivo(); } }

async function ataImportar() {
    const a = ataApi(); if (!a) return;
    const r = await a.ata_importar();
    if (!r || r.cancelado) return;
    if (!r.success) return toast(r.error || 'Não consegui importar', 'error');
    await ataListar();
    await ataAbrir(r.id);
    ataProcessar();
}

// eventos do Python (main.py → _js('ataEvento'))
function ataEvento(o) {
    if (o.tipo === 'gravando') { toast('Gravando a reunião', 'success'); ataListar(); ataVivo(); }
    else if (o.tipo === 'gravado') {
        toast('Reunião gravada. A Kani já está escrevendo a ATA.', 'success');
        ataListar().then(() => ataAbrir(o.id)).then(() => ataProcessar());
    }
    else if (o.tipo === 'progresso') {
        ATA.proc[o.id] = { p: o.p, msg: o.msg };
        if (o.id === ATA.sid) ataPintarProgresso();
    }
    else if (o.tipo === 'pronta' || o.tipo === 'erro' || o.tipo === 'cancelado') {
        delete ATA.proc[o.id];
        if (o.tipo === 'erro') toast(o.msg || 'Falhou ao processar', 'error');
        if (o.tipo === 'pronta') toast('ATA pronta', 'success');
        if (o.tipo === 'cancelado') toast('Processamento cancelado');
        ataListar();
        if (o.id === ATA.sid) ataAbrir(o.id);
    }
    else if (o.tipo === 'fechado') ataVivo();
}

// ── reunião aberta ── (t = segundo da fala achada pela busca: abre a transcrição nela)
async function ataAbrir(sid, t) {
    const a = ataApi(); if (!a) return;
    const r = await a.ata_abrir(sid);
    if (!r.success) return toast(r.error || 'Não abriu', 'error');
    if (sid !== ATA.sid) { ataAudio.pause(); ataAudio.removeAttribute('src'); ataAudio.dataset.sid = ''; ATA.agora = -1; }
    ATA.sid = sid; ATA.doc = r.doc;
    if (t != null && (ATA.doc.turnos || []).length) { ATA.aba = 'trans'; ATA.tbusca = ATA.filtro; }
    document.querySelectorAll('.at-item').forEach(b => b.classList.toggle('on', b.dataset.id === sid));
    ataPintarMain();
    if (t != null) setTimeout(() => ataIrTurno(t), 50);
}

function ataFechar() {
    ataAudio.pause();
    ATA.sid = null; ATA.doc = null;
    document.querySelectorAll('.at-item.on').forEach(b => b.classList.remove('on'));
    ataPintarMain();
}

function ataPintarMain() {
    const m = document.getElementById('at-main'); if (!m) return;
    const d = ATA.doc;
    if (!d) {
        m.innerHTML = `<div class="at-inicio"><div class="at-boas">
          <span class="app-logo al-at app-logo-grande">At</span>
          <h2>Reuniões viram ATA sozinhas</h2>
          <p>Entre no Google Meet pelo Kanivete, grave e, no fim, a Kani escreve a ATA com pauta, decisões, tarefas e prazos.
             Você revisa, edita e baixa em PDF ou Word.</p>
          <ol><li>Cole o link do Meet e clique em <b>Entrar no Meet</b></li><li>Na reunião, clique em <b>● Gravar ATA</b></li>
              <li>Ao sair da chamada (ou em <b>■ Parar</b>), a ATA aparece aqui</li></ol>
          <p class="at-leve">Gravação leve: cerca de 10 MB por hora. Tudo fica no seu PC.</p></div>
          <section id="at-pend" class="at-pend"></section></div>`;
        ataPintarPend();
        return;
    }
    const nPart = new Set(Object.values(d.falantes || {})).size || (d.participantes || []).length;
    m.innerHTML = `
      <header class="at-cab">
        <div class="at-cab-txt">
          <input class="at-titulo" value="${ataEsc(d.titulo)}" onchange="ataDoc().titulo=this.value; ataSalvar()" spellcheck="false">
          <div class="at-meta">${ataData(d.quando)} · ${ataDur(d.duracao)}${nPart ? ` · ${nPart} participante${nPart > 1 ? 's' : ''}` : ''}
            ${d.origem === 'arquivo' ? ' · importado' : ''}</div>
        </div>
        <div class="at-acoes">
          ${d.turnos && d.turnos.length
            ? `<button class="at-bt" onclick="ataReescrever()" title="A Kani escreve a ATA de novo com os nomes, o glossário, o estilo e o pedido atuais">Refazer ATA</button>`
            : `<button class="at-bt at-prim" onclick="ataProcessar()">Gerar ATA</button>`}
          <button class="at-bt" onclick="ataCopiar()" ${d.ata ? '' : 'disabled'} title="Copia a ATA em texto (WhatsApp, e-mail)">Copiar</button>
          <button class="at-bt" onclick="ataDocx()" ${d.ata ? '' : 'disabled'} title="Baixar em Word (.docx) editável">Word</button>
          <button class="at-bt at-prim" onclick="ataPdf()" ${d.ata ? '' : 'disabled'}>Baixar PDF</button>
          <button class="at-bt at-ico" onclick="ataApagar()" title="Apagar esta reunião">✕</button>
        </div>
      </header>
      <div id="at-prog" class="at-prog" hidden><div class="at-prog-barra"><i></i></div><span></span>
        <button class="at-bt at-mini" onclick="ataCancelar()">Cancelar</button></div>
      ${d.erro && d.estado !== 'pronta' ? `<div class="at-erro">${ataEsc(d.erro)}</div>` : ''}
      ${d.interrompida ? `<div class="at-aviso">A gravação foi interrompida (o app ou o navegador fechou no meio). O que foi gravado até ali está guardado.</div>` : ''}
      <nav class="at-abas">${[['ata', 'ATA'], ['trans', 'Transcrição'], ['fal', 'Falantes e ajustes']].map(([k, n]) =>
        `<button class="${ATA.aba === k ? 'on' : ''}" onclick="ataAba('${k}')">${n}</button>`).join('')}
        <button class="at-voltar" onclick="ataFechar()" title="Voltar às tarefas em aberto">Tarefas em aberto</button></nav>
      <div class="at-corpo" id="at-corpo"></div>`;
    ({ ata: ataPintarAta, trans: ataPintarTrans, fal: ataPintarFal })[ATA.aba]();
    ataPintarProgresso();
}
const ataDoc = () => ATA.doc;
function ataAba(k) { if (ATA.aba === 'ata') ataLerFolhaSeAberta(true); ATA.aba = k; ataPintarMain(); }

function ataPintarProgresso() {
    const box = document.getElementById('at-prog'); if (!box) return;
    const p = ATA.proc[ATA.sid];
    box.hidden = !p;
    if (!p) return;
    box.querySelector('i').style.transform = `scaleX(${(p.p || 0) / 100})`;
    box.querySelector('span').textContent = p.msg || '';
}

// tarefas em aberto de todas as reuniões (tela sem reunião aberta)
async function ataPintarPend() {
    const a = ataApi(), box = document.getElementById('at-pend'); if (!a || !box) return;
    const ts = await a.ata_tarefas();
    if (!document.body.contains(box)) return;
    if (!ts.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<h3>Tarefas em aberto <span>${ts.length}</span></h3>
      ${ts.map(t => `<div class="at-pend-i">
        <input type="checkbox" title="Marcar como feita" onchange="ataFeita('${t.id}', ${t.i}, this)">
        <div><b>${ataEsc(t.tarefa)}</b>
          <small>${ataEsc(t.responsavel || 'sem responsável')} · prazo: ${ataEsc(t.prazo || 'a definir')} ·
            <a onclick="ataAbrir('${t.id}')">${ataEsc(t.reuniao || 'Reunião')}</a> (${ataData(t.quando).split(' ')[0]})</small></div></div>`).join('')}`;
}
async function ataFeita(sid, i, cb) {
    const a = ataApi(); if (!a) return;
    const r = await a.ata_marcar_tarefa(sid, i, cb.checked);
    if (!r.success) { cb.checked = !cb.checked; return toast(r.error || 'Não salvou', 'error'); }
    cb.closest('.at-pend-i').classList.toggle('feita', cb.checked);
    ataListar();
}

// folha da ATA: tudo editável; cada mudança salva sozinha
function ataPintarAta() {
    const c = document.getElementById('at-corpo'), a = ATA.doc.ata;
    if (!a) {
        c.innerHTML = `<div class="at-sem">${ATA.proc[ATA.sid] ? 'A ATA está sendo escrita…' :
            (ATA.doc.estado === 'gravando' ? 'A reunião ainda está sendo gravada.' : 'Clique em <b>Gerar ATA</b> para transcrever e escrever a ATA.')}</div>`;
        return;
    }
    const lista = (k, nome) => `<h3>${nome}</h3><ul class="at-ul" data-k="${k}">${(a[k] || []).map(x => `<li contenteditable>${ataEsc(x)}</li>`).join('')}
        </ul><button class="at-mais" onclick="ataMais('${k}')">+ item</button>`;
    c.innerHTML = `<article class="at-folha" oninput="ataLerFolha()">
      <div class="at-folha-rot">ATA DE REUNIÃO</div>
      <h1 contenteditable data-k="titulo">${ataEsc(a.titulo || ATA.doc.titulo)}</h1>
      ${lista('pauta', 'Pauta')}
      <h3>Resumo</h3><p contenteditable data-k="resumo">${ataEsc(a.resumo)}</p>
      <h3>Discussão</h3><div class="at-disc">${(a.discussao || []).map(x => `<div class="at-tema"><h4 contenteditable>${ataEsc(x.tema)}</h4>
        <p contenteditable>${ataEsc(x.texto)}</p></div>`).join('')}</div>
      <button class="at-mais" onclick="ataMais('discussao')">+ tema</button>
      ${lista('decisoes', 'Decisões')}
      <h3>Tarefas</h3><table class="at-tar"><thead><tr><th class="at-ok"></th><th>Responsável</th><th>Tarefa</th><th>Prazo</th></tr></thead>
        <tbody>${(a.tarefas || []).map(t => `<tr class="${t.feito ? 'feito' : ''}"><td class="at-ok"><input type="checkbox" title="Feita" ${t.feito ? 'checked' : ''}></td>
        <td contenteditable>${ataEsc(t.responsavel)}</td><td contenteditable>${ataEsc(t.tarefa)}</td>
        <td contenteditable>${ataEsc(t.prazo)}</td></tr>`).join('')}</tbody></table>
      <button class="at-mais" onclick="ataMais('tarefas')">+ tarefa</button>
      ${lista('pendencias', 'Pendências')}
      <h3>Próxima reunião</h3><p contenteditable data-k="proxima">${ataEsc(a.proxima)}</p>
    </article>`;
}

function ataLerFolha(semSalvar) {
    const f = document.querySelector('.at-folha'), a = ATA.doc && ATA.doc.ata; if (!f || !a) return;
    const txt = el => (el.innerText || '').trim();
    a.titulo = txt(f.querySelector('[data-k=titulo]'));
    a.resumo = txt(f.querySelector('[data-k=resumo]'));
    a.proxima = txt(f.querySelector('[data-k=proxima]'));
    f.querySelectorAll('.at-ul').forEach(ul => { a[ul.dataset.k] = [...ul.children].map(txt).filter(Boolean); });
    a.discussao = [...f.querySelectorAll('.at-tema')].map(d => ({ tema: txt(d.children[0]), texto: txt(d.children[1]) })).filter(x => x.tema || x.texto);
    a.tarefas = [...f.querySelectorAll('.at-tar tbody tr')].map(tr => {
        const feito = tr.cells[0].querySelector('input').checked;
        tr.classList.toggle('feito', feito);
        return { responsavel: txt(tr.cells[1]), tarefa: txt(tr.cells[2]), prazo: txt(tr.cells[3]), ...(feito ? { feito: true } : {}) };
    }).filter(t => t.tarefa || t.responsavel);
    if (a.titulo) ATA.doc.titulo = a.titulo;
    if (!semSalvar) ataSalvar();
}

function ataMais(k) {
    const a = ATA.doc.ata;
    ataLerFolha(true);
    if (k === 'discussao') a.discussao.push({ tema: 'Novo tema', texto: '' });
    else if (k === 'tarefas') a.tarefas.push({ responsavel: '', tarefa: 'Nova tarefa', prazo: 'a definir' });
    else (a[k] = a[k] || []).push('Novo item');
    ataPintarAta();
    ataSalvar();
}

function ataSalvar() {
    clearTimeout(ATA.salvarT);
    ATA.salvarT = setTimeout(async () => {
        const a = ataApi(); if (!a || !ATA.sid) return;
        await a.ata_salvar(ATA.sid, ATA.doc);
        const it = ATA.lista.find(x => x.id === ATA.sid);
        const abertas = ((ATA.doc.ata || {}).tarefas || []).filter(t => !t.feito).length;
        if (it && (it.titulo !== ATA.doc.titulo || (it.abertas || 0) !== abertas)) ataListar();
    }, 600);
}

// ATA em texto para colar no WhatsApp ou no e-mail (*negrito* do WhatsApp)
function ataTexto() {
    const d = ATA.doc, a = d.ata || {};
    const part = [...new Set(Object.values(d.falantes || {}))];
    const l = [`*ATA — ${a.titulo || d.titulo}*`, `${ataData(d.quando)} · ${ataDur(d.duracao)}`];
    if (part.length) l.push(`Participantes: ${part.join(', ')}`);
    const sec = (nome, xs) => { xs = (xs || []).filter(x => String(x).trim()); if (xs.length) l.push('', `*${nome}*`, ...xs.map(x => `• ${x}`)); };
    sec('Pauta', a.pauta);
    if (a.resumo) l.push('', '*Resumo*', a.resumo);
    if ((a.discussao || []).length) l.push('', '*Discussão*', ...a.discussao.map(x => `_${x.tema}_: ${x.texto}`));
    sec('Decisões', a.decisoes);
    sec('Tarefas', (a.tarefas || []).map(t => `${t.feito ? '✅ ' : ''}${t.responsavel ? t.responsavel + ': ' : ''}${t.tarefa}${t.prazo ? ` (${t.prazo})` : ''}`));
    sec('Pendências', a.pendencias);
    if (a.proxima) l.push('', '*Próxima reunião*', a.proxima);
    return l.join('\n');
}
async function ataCopiar() {
    ataLerFolhaSeAberta(true);
    const texto = ataTexto();
    try { await navigator.clipboard.writeText(texto); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast('ATA copiada: cole no WhatsApp ou no e-mail', 'success');
}

// ── transcrição: player (o trecho falado acende), busca e edição ──
function ataCor(spk) {
    const ks = Object.keys(ATA.doc.falantes || {});
    const nomes = [...new Set(ks.map(k => ATA.doc.falantes[k]))];
    return ATA_CORES[Math.max(0, nomes.indexOf(ATA.doc.falantes[spk])) % ATA_CORES.length];
}
function ataPintarTrans() {
    const c = document.getElementById('at-corpo'), d = ATA.doc;
    if (!(d.turnos || []).length) { c.innerHTML = '<div class="at-sem">Ainda sem transcrição.</div>'; return; }
    c.innerHTML = `<div class="at-tbar">
        <button class="at-bt at-ico at-play" id="at-play" onclick="ataPlay()" title="Ouvir (espaço)">${ataAudio.paused ? '▶' : '❚❚'}</button>
        <span class="at-num" id="at-ptempo">${ataTempo(ataAudio.currentTime || 0)} / ${ataTempo(d.duracao)}</span>
        <div class="at-pbarra" onclick="ataPular(event)"><i id="at-pfill"></i></div>
        <button class="at-bt at-mini" id="at-vel" onclick="ataVel()" title="Velocidade">${ataAudio.playbackRate || 1}×</button>
        <input class="at-campo at-tbusca" placeholder="Buscar na transcrição" value="${ataEsc(ATA.tbusca)}" spellcheck="false"
               oninput="ATA.tbusca=this.value; clearTimeout(this._t); this._t=setTimeout(ataPintarTurnos, 200)">
        <span class="at-tcont" id="at-tcont"></span>
      </div>
      <div class="at-trans" id="at-tlista"></div>`;
    ataPintarTurnos();
    ataPlayer();
}
function ataPintarTurnos() {
    const box = document.getElementById('at-tlista'), d = ATA.doc; if (!box) return;
    const q = (ATA.tbusca || '').trim(), qn = ataSemAcento(q);
    // mesma pessoa falando em seguida (dois grupos de voz com o mesmo nome): continua no bloco de cima, sem repetir o nome
    const nome = t => d.falantes[t.spk] || t.spk;
    const cont = (t, i) => !q && i > 0 && nome(d.turnos[i - 1]) === nome(t) && t.ini - d.turnos[i - 1].fim < 2.5;
    let n = 0;
    box.innerHTML = d.turnos.map((t, i) => {
        if (q && !ataSemAcento(t.texto).includes(qn)) return '';
        n++;
        return `<div class="at-turno${cont(t, i) ? ' at-cont' : ''}${i === ATA.agora ? ' at-agora' : ''}" data-i="${i}">
          <span class="at-hora" onclick="ataTocar(${t.ini})" title="Ouvir daqui">${ataTempo(t.ini)}</span>
          <b style="color:${ataCor(t.spk)}">${ataEsc(nome(t))}</b>
          <p contenteditable oninput="ATA.doc.turnos[${i}].texto=this.innerText; ataSalvar()">${ataMarcar(t.texto, q)}</p></div>`;
    }).join('') || '<div class="at-sem">Nada encontrado na transcrição.</div>';
    const cnt = document.getElementById('at-tcont');
    if (cnt) cnt.textContent = q ? `${n} fala${n === 1 ? '' : 's'}` : '';
}
function ataIrTurno(t) {
    const d = ATA.doc; if (!d || !d.turnos) return;
    const i = d.turnos.findIndex(x => x.ini >= t - 0.05);
    const el = document.querySelector(`.at-turno[data-i="${i}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('at-pisca'); setTimeout(() => el.classList.remove('at-pisca'), 1500); }
}

const ataAudio = new Audio();
ataAudio.preload = 'auto';
async function ataCarregarAudio() {
    const a = ataApi(); if (!a || !ATA.sid) return false;
    if (ataAudio.dataset.sid === ATA.sid && ataAudio.src) return true;
    const sid = ATA.sid;
    const r = await a.ata_audio(sid, 'mix');
    if (!r || !r.url || sid !== ATA.sid) { if (sid === ATA.sid) toast('Áudio não encontrado', 'error'); return false; }
    ataAudio.src = r.url; ataAudio.dataset.sid = sid;
    await new Promise(ok => { if (ataAudio.readyState >= 1) ok(); else { ataAudio.addEventListener('loadedmetadata', ok, { once: true }); setTimeout(ok, 4000); } });
    return true;
}
// ▶ de um falante: só um trecho de 8 s para reconhecer a voz
async function ataOuvir(spk, t) {
    if (t == null) {   // trecho mais longo dessa voz
        const ts = (ATA.doc.turnos || []).filter(x => x.spk === spk).sort((x, y) => (y.fim - y.ini) - (x.fim - x.ini));
        if (!ts.length) return;
        t = ts[0].ini;
    }
    await ataTocar(t, 8);
}
async function ataTocar(t, limite) {
    if (!await ataCarregarAudio()) return;
    ataAudio.currentTime = Math.max(0, t - 0.3);
    ataAudio.play().catch(() => {});
    clearTimeout(ataAudio._p);
    if (limite) ataAudio._p = setTimeout(() => ataAudio.pause(), limite * 1000);
}
async function ataPlay() {
    if (!ataAudio.paused) return ataAudio.pause();
    clearTimeout(ataAudio._p);
    if (!await ataCarregarAudio()) return;
    ataAudio.play().catch(() => {});
}
function ataPular(ev) {
    const r = ev.currentTarget.getBoundingClientRect(), dur = ataAudio.duration || ATA.doc.duracao || 0;
    ataTocar(dur * Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) + 0.3);
}
function ataVel() {
    const vs = [1, 1.25, 1.5, 2], v = vs[(vs.indexOf(ataAudio.playbackRate) + 1) % vs.length];
    ataAudio.playbackRate = v;
    const b = document.getElementById('at-vel'); if (b) b.textContent = v + '×';
}
// barra e trecho aceso: só com o player tocando (timeupdate ~4×/s), nada roda parado
function ataPlayer() {
    const bt = document.getElementById('at-play'); if (bt) bt.textContent = ataAudio.paused ? '▶' : '❚❚';
    const d = ATA.doc, cur = ataAudio.currentTime || 0, dur = ataAudio.duration || (d && d.duracao) || 0;
    const tp = document.getElementById('at-ptempo'); if (tp) tp.textContent = `${ataTempo(cur)} / ${ataTempo(dur)}`;
    const fill = document.getElementById('at-pfill'); if (fill) fill.style.transform = `scaleX(${dur ? Math.min(1, cur / dur) : 0})`;
    if (!d || !d.turnos || ataAudio.dataset.sid !== ATA.sid) return;
    let i = -1;
    for (let k = 0; k < d.turnos.length; k++) { if (d.turnos[k].ini <= cur + 0.1) i = k; else break; }
    if (i >= 0 && cur > d.turnos[i].fim + 1.5) i = -1;
    if (i === ATA.agora) return;
    document.querySelectorAll('.at-turno.at-agora').forEach(e => e.classList.remove('at-agora'));
    ATA.agora = i;
    const el = i >= 0 && document.querySelector(`.at-turno[data-i="${i}"]`);
    if (el) { el.classList.add('at-agora'); if (!ataAudio.paused && !el.contains(document.activeElement)) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
['timeupdate', 'play', 'pause', 'seeked', 'loadedmetadata'].forEach(e => ataAudio.addEventListener(e, ataPlayer));
// espaço = play/pausa na transcrição (fora de campo de texto)
document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || ATA.aba !== 'trans' || !document.getElementById('at-tlista')) return;
    if (!document.getElementById('page-ata-kanivete')?.classList.contains('active')) return;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName))) return;
    e.preventDefault(); ataPlay();
});

// falantes: renomear (mesmo nome = mesma pessoa) e ouvir um trecho de cada voz; glossário; estilo e pedido à Kani
function ataPintarFal() {
    const c = document.getElementById('at-corpo'), d = ATA.doc, fal = d.falantes || {};
    const tempo = {};
    (d.turnos || []).forEach(t => { tempo[t.spk] = (tempo[t.spk] || 0) + (t.fim - t.ini); });
    const sugest = [...new Set([...(d.participantes || []), ...Object.values(fal)])];
    c.innerHTML = `<div class="at-fal">
      <section><h3>Quem falou</h3>
        <p class="at-dica">Ouça cada voz e dê o nome. Vozes com o <b>mesmo nome</b> viram uma pessoa só. Depois clique em <b>Refazer ATA</b>.</p>
        <datalist id="at-nomes">${sugest.map(n => `<option value="${ataEsc(n)}">`).join('')}</datalist>
        ${Object.keys(fal).length ? Object.keys(fal).sort((a, b) => (tempo[b] || 0) - (tempo[a] || 0)).map(k => `
          <div class="at-falante"><span class="at-bola" style="background:${ataCor(k)}"></span>
            <input class="at-campo" list="at-nomes" value="${ataEsc(fal[k])}" onchange="ataRenomear('${k}', this.value)" ${k === 'eu' ? 'title="A sua voz (microfone)"' : ''}>
            <span class="at-fal-t">${ataDur(tempo[k] || 0)}</span>
            <button class="at-bt at-ico" onclick="ataOuvir('${k}')" title="Ouvir um trecho">▶</button></div>`).join('')
          : '<p class="at-dica">As vozes aparecem aqui depois de gerar a ATA.</p>'}
      </section>
      <section><h3>Como a Kani escreve</h3>
        <p class="at-dica">Vale no próximo <b>Gerar</b> ou <b>Refazer ATA</b>.</p>
        <select class="at-campo" onchange="ATA.doc.estilo=this.value; ataSalvar()">
          ${ATA.estilos.map(([k, n]) => `<option value="${k}" ${(d.estilo || 'formal') === k ? 'selected' : ''}>${ataEsc(n)}</option>`).join('')}</select>
        <textarea class="at-campo at-glos" rows="3" placeholder="Pedido à Kani (opcional). Ex.: destaque os valores combinados e os prazos de entrega."
          onchange="ATA.doc.pedido=this.value.trim(); ataSalvar()">${ataEsc(d.pedido || '')}</textarea>
        <h3 class="at-h3-2">Glossário</h3>
        <p class="at-dica">Nomes de pessoas, empresas e produtos, um por linha. Corrige a transcrição e a Kani escreve exatamente assim.</p>
        <textarea class="at-campo at-glos" rows="7" onchange="ATA.doc.glossario=this.value.split('\\n').map(s=>s.trim()).filter(Boolean); ataSalvar()"
          placeholder="Kanivete&#10;Anvisa&#10;Maria Souza">${ataEsc((d.glossario || []).join('\n'))}</textarea>
      </section></div>`;
}

function ataRenomear(spk, nome) {
    nome = (nome || '').trim(); if (!nome) return;
    ATA.doc.falantes[spk] = nome;
    ataSalvar();
    ataPintarFal();
}

async function ataProcessar() {
    const a = ataApi(); if (!a || !ATA.sid) return;
    ATA.proc[ATA.sid] = { p: 1, msg: 'Começando…' };
    ataPintarProgresso();
    const r = await a.ata_processar(ATA.sid);
    if (r && !r.success) { delete ATA.proc[ATA.sid]; toast(r.error, 'error'); ataPintarProgresso(); }
}
async function ataReescrever() {
    const a = ataApi(); if (!a || !ATA.sid) return;
    ataLerFolhaSeAberta(true);
    await a.ata_salvar(ATA.sid, ATA.doc);
    ATA.proc[ATA.sid] = { p: 70, msg: 'A Kani está escrevendo a ATA…' };
    ataPintarProgresso();
    await a.ata_reescrever(ATA.sid);
}
async function ataCancelar() {
    const a = ataApi(); if (!a || !ATA.sid) return;
    const p = ATA.proc[ATA.sid]; if (p) { p.msg = 'Cancelando…'; ataPintarProgresso(); }
    const r = await a.ata_cancelar(ATA.sid);
    if (!r.success) { delete ATA.proc[ATA.sid]; ataPintarProgresso(); }
}
async function ataExportar(fn) {
    const a = ataApi(); if (!a || !ATA.sid) return;
    ataLerFolhaSeAberta(true);
    await a.ata_salvar(ATA.sid, ATA.doc);
    const r = await a[fn](ATA.sid);
    if (r && r.success) toast(fn === 'ata_pdf' ? 'PDF salvo' : 'Word salvo', 'success');
    else if (r && r.error) toast(r.error, 'error');
}
const ataPdf = () => ataExportar('ata_pdf');
const ataDocx = () => ataExportar('ata_docx');
function ataLerFolhaSeAberta(semSalvar) { if (document.querySelector('.at-folha')) ataLerFolha(semSalvar); clearTimeout(ATA.salvarT); if (semSalvar && ATA.sid) { const a = ataApi(); if (a) a.ata_salvar(ATA.sid, ATA.doc); } }

async function ataApagar() {
    const a = ataApi(); if (!a || !ATA.sid) return;
    const ok = await appConfirm({ titulo: 'Apagar reunião', texto: 'A gravação e a ATA desta reunião serão apagadas do PC.',
        botoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Apagar', valor: true, tipo: 'perigo' }] });
    if (!ok) return;
    ataAudio.pause(); ataAudio.removeAttribute('src'); ataAudio.dataset.sid = '';
    await a.ata_apagar(ATA.sid);
    ATA.sid = null; ATA.doc = null;
    await ataListar();
    ataPintarMain();
}

// Kani: o que está aberto no Ata (lido só ao enviar a mensagem)
if (window.KANI_TELA) KANI_TELA['ata-kanivete'] = () => {
    const d = ATA.doc;
    if (!d) return `Ata Kanivete: ${ATA.lista.length} reuniões na lista; nenhuma aberta.${ATA.vivo && ATA.vivo.gravando ? ' Gravando uma reunião agora.' : ''}`;
    const a = d.ata || {}, curto = (s, n) => kaniCurto(s, n);
    const l = [`Reunião aberta: "${d.titulo}" — ${ataData(d.quando)}, ${ataDur(d.duracao)}; participantes: ${[...new Set(Object.values(d.falantes || {}))].join(', ') || '—'}.`];
    if (!d.ata) l.push((d.turnos || []).length ? 'ATA ainda não escrita. Início da transcrição: ' + curto(d.turnos.map(t => `${d.falantes[t.spk] || t.spk}: ${t.texto}`).join(' / '), 900)
        : 'Ainda sem transcrição nem ATA.');
    if (a.resumo) l.push('Resumo: ' + curto(a.resumo, 450));
    if ((a.decisoes || []).length) l.push('Decisões: ' + curto(a.decisoes.join('; '), 300));
    if ((a.tarefas || []).length) l.push('Tarefas: ' + curto(a.tarefas.map(t => `${t.responsavel || '?'}: ${t.tarefa} (${t.prazo || 'a definir'})${t.feito ? ' [feita]' : ''}`).join('; '), 400));
    if ((a.pendencias || []).length) l.push('Pendências: ' + curto(a.pendencias.join('; '), 200));
    return l.join('\n');
};

// para o agente (modo --agente): ler e mexer sem a interface
window.ATA_API = {
    lista: () => ATA.lista, doc: () => ATA.doc, abrir: ataAbrir, processar: ataProcessar, reescrever: ataReescrever,
    aba: k => ataAba(k), estadoMeet: () => ATA.vivo, buscar: q => ataApi().ata_buscar(q), tarefas: () => ataApi().ata_tarefas(),
    texto: () => ATA.doc && ataTexto(), cancelar: ataCancelar, tocar: ataTocar, audio: () => ataAudio,
};
