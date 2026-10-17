// =========================================================
// Ata Kanivete (At, verde; Beta) — grava a reunião do Google Meet e a Kani escreve a ATA (Functions/ata_kanivete.py).
// Esquerda: entrar no Meet (Chrome à parte com o botão "● Gravar ATA" por cima), importar áudio e a lista de reuniões.
// Direita: a ATA editável como folha (salva sozinha), a transcrição e os falantes (renomear; mesmo nome = mesma pessoa).
// Eventos do Python chegam em ataEvento({tipo, id, p, msg}). API do agente: ATA_API.
// =========================================================
const ATA = { lista: [], sid: null, doc: null, aba: 'ata', vivo: null, timer: null, salvarT: null, proc: {} };
const ataApi = () => window.pywebview && window.pywebview.api;
const ataEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ATA_CORES = ['#1FA971', '#4c9bff', '#ff8c42', '#c9a8ff', '#ff4fc8', '#f5c542', '#2ee6c8', '#ff6b6b', '#9b4dff', '#7fd6ff'];

function ataAoTrocar(toolId) {
    if (toolId !== 'ata-kanivete') { clearInterval(ATA.timer); ATA.timer = null; return; }
    ataMontar();
    ataListar();
    if (!ATA.timer) { ataVivo(); ATA.timer = setInterval(ataVivo, 1000); }
}

function ataMontar() {
    const pg = document.getElementById('page-ata-kanivete');
    if (!pg || pg.dataset.ok) return;
    pg.dataset.ok = '1';
    pg.innerHTML = `
    <div class="at-app">
      <aside class="at-lado">
        <div class="at-marca"><span class="app-logo al-at app-logo-marca">At</span><b>Ata Kanivete</b><span class="at-beta">Beta</span></div>
        <section class="at-card">
          <div class="at-rot">Nova reunião</div>
          <input id="at-link" class="at-campo" placeholder="Cole o link do Google Meet" spellcheck="false"
                 onkeydown="if(event.key==='Enter')ataEntrar()">
          <button class="at-bt at-prim" onclick="ataEntrar()">Entrar no Meet</button>
          <div id="at-vivo" class="at-vivo" hidden></div>
          <button class="at-bt" onclick="ataImportar()">Importar áudio ou vídeo</button>
          <p class="at-dica">O Meet abre num Chrome à parte. Faça login uma vez e clique em <b>● Gravar ATA</b> no topo da reunião.
            Ligue as legendas do Meet (tecla C) para os nomes saírem sozinhos.</p>
        </section>
        <div class="at-rot at-rot-lista">Reuniões</div>
        <div id="at-lista" class="at-lista"></div>
      </aside>
      <main id="at-main" class="at-main"></main>
    </div>`;
    ataPintarMain();
}

async function ataListar() {
    const a = ataApi(); if (!a) return;
    ATA.lista = await a.ata_listar();
    const box = document.getElementById('at-lista'); if (!box) return;
    if (!ATA.lista.length) { box.innerHTML = '<div class="at-vazio-lista">Nenhuma reunião ainda.</div>'; return; }
    const est = { gravando: 'Gravando', gravado: 'Gravada', processando: 'Processando…', pronta: '' };
    box.innerHTML = ATA.lista.map(r => `
      <button class="at-item${r.id === ATA.sid ? ' on' : ''}" onclick="ataAbrir('${r.id}')">
        <b>${ataEsc(r.titulo || 'Reunião')}</b>
        <small>${ataData(r.quando)} · ${ataDur(r.duracao)}${est[r.estado] ? ` · <i class="at-est at-est-${r.estado}">${est[r.estado]}</i>` : ''}</small>
      </button>`).join('');
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
const ataTempo = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ── Meet ao vivo ──
async function ataEntrar() {
    const a = ataApi(); if (!a) return;
    const link = (document.getElementById('at-link').value || '').trim();
    const r = await a.ata_meet_abrir(link);
    if (!r.success) return toast(r.error || 'Não consegui abrir o Meet', 'error');
    ataVivo();
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
    if (o.tipo === 'gravando') { ataListar(); ataVivo(); }
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
        ataListar();
        if (o.id === ATA.sid) ataAbrir(o.id);
    }
    else if (o.tipo === 'fechado') ataVivo();
}

// ── reunião aberta ──
async function ataAbrir(sid) {
    const a = ataApi(); if (!a) return;
    const r = await a.ata_abrir(sid);
    if (!r.success) return toast(r.error || 'Não abriu', 'error');
    ATA.sid = sid; ATA.doc = r.doc;
    if (!ATA.doc.ata && ATA.aba === 'ata' && !(ATA.doc.turnos || []).length) ATA.aba = 'ata';
    document.querySelectorAll('.at-item').forEach(b => b.classList.toggle('on', b.getAttribute('onclick').includes(sid)));
    ataPintarMain();
}

function ataPintarMain() {
    const m = document.getElementById('at-main'); if (!m) return;
    const d = ATA.doc;
    if (!d) {
        m.innerHTML = `<div class="at-boas">
          <span class="app-logo al-at app-logo-grande">At</span>
          <h2>Reuniões viram ATA sozinhas</h2>
          <p>Entre no Google Meet pelo Kanivete, grave e, no fim, a Kani escreve a ATA com pauta, decisões, tarefas e prazos.
             Você revisa, edita e baixa em PDF.</p>
          <ol><li>Cole o link do Meet e clique em <b>Entrar no Meet</b></li><li>Na reunião, clique em <b>● Gravar ATA</b></li>
              <li>Ao terminar, clique em <b>■ Parar</b>: a ATA aparece aqui</li></ol>
          <p class="at-leve">Gravação leve: cerca de 10 MB por hora. Tudo fica no seu PC.</p></div>`;
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
            ? `<button class="at-bt" onclick="ataReescrever()" title="A Kani escreve a ATA de novo com os nomes e o glossário atuais">Refazer ATA</button>`
            : `<button class="at-bt at-prim" onclick="ataProcessar()">Gerar ATA</button>`}
          <button class="at-bt at-prim" onclick="ataPdf()" ${d.ata ? '' : 'disabled'}>Baixar PDF</button>
          <button class="at-bt at-ico" onclick="ataApagar()" title="Apagar esta reunião">✕</button>
        </div>
      </header>
      <div id="at-prog" class="at-prog" hidden><div class="at-prog-barra"><i></i></div><span></span></div>
      ${d.erro && d.estado !== 'pronta' ? `<div class="at-erro">${ataEsc(d.erro)}</div>` : ''}
      <nav class="at-abas">${[['ata', 'ATA'], ['trans', 'Transcrição'], ['fal', 'Falantes e glossário']].map(([k, n]) =>
        `<button class="${ATA.aba === k ? 'on' : ''}" onclick="ATA.aba='${k}'; ataPintarMain()">${n}</button>`).join('')}</nav>
      <div class="at-corpo" id="at-corpo"></div>`;
    ({ ata: ataPintarAta, trans: ataPintarTrans, fal: ataPintarFal })[ATA.aba]();
    ataPintarProgresso();
}
const ataDoc = () => ATA.doc;

function ataPintarProgresso() {
    const box = document.getElementById('at-prog'); if (!box) return;
    const p = ATA.proc[ATA.sid];
    box.hidden = !p;
    if (!p) return;
    box.querySelector('i').style.transform = `scaleX(${(p.p || 0) / 100})`;
    box.querySelector('span').textContent = p.msg || '';
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
      <h3>Tarefas</h3><table class="at-tar"><thead><tr><th>Responsável</th><th>Tarefa</th><th>Prazo</th></tr></thead>
        <tbody>${(a.tarefas || []).map(t => `<tr><td contenteditable>${ataEsc(t.responsavel)}</td><td contenteditable>${ataEsc(t.tarefa)}</td>
        <td contenteditable>${ataEsc(t.prazo)}</td></tr>`).join('')}</tbody></table>
      <button class="at-mais" onclick="ataMais('tarefas')">+ tarefa</button>
      ${lista('pendencias', 'Pendências')}
      <h3>Próxima reunião</h3><p contenteditable data-k="proxima">${ataEsc(a.proxima)}</p>
    </article>`;
}

function ataLerFolha() {
    const f = document.querySelector('.at-folha'), a = ATA.doc.ata; if (!f || !a) return;
    const txt = el => (el.innerText || '').trim();
    a.titulo = txt(f.querySelector('[data-k=titulo]'));
    a.resumo = txt(f.querySelector('[data-k=resumo]'));
    a.proxima = txt(f.querySelector('[data-k=proxima]'));
    f.querySelectorAll('.at-ul').forEach(ul => { a[ul.dataset.k] = [...ul.children].map(txt).filter(Boolean); });
    a.discussao = [...f.querySelectorAll('.at-tema')].map(d => ({ tema: txt(d.children[0]), texto: txt(d.children[1]) })).filter(x => x.tema || x.texto);
    a.tarefas = [...f.querySelectorAll('.at-tar tbody tr')].map(tr => ({ responsavel: txt(tr.cells[0]), tarefa: txt(tr.cells[1]), prazo: txt(tr.cells[2]) }))
        .filter(t => t.tarefa || t.responsavel);
    if (a.titulo) ATA.doc.titulo = a.titulo;
    ataSalvar();
}

function ataMais(k) {
    const a = ATA.doc.ata;
    ataLerFolha();
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
        if (it && it.titulo !== ATA.doc.titulo) ataListar();
    }, 600);
}

// transcrição com o nome de quem falou
function ataCor(spk) {
    const ks = Object.keys(ATA.doc.falantes || {});
    const nomes = [...new Set(ks.map(k => ATA.doc.falantes[k]))];
    return ATA_CORES[Math.max(0, nomes.indexOf(ATA.doc.falantes[spk])) % ATA_CORES.length];
}
function ataPintarTrans() {
    const c = document.getElementById('at-corpo'), d = ATA.doc;
    if (!(d.turnos || []).length) { c.innerHTML = '<div class="at-sem">Ainda sem transcrição.</div>'; return; }
    // mesma pessoa falando em seguida (dois grupos de voz com o mesmo nome): continua no bloco de cima, sem repetir o nome
    const nome = t => d.falantes[t.spk] || t.spk;
    const cont = (t, i) => i > 0 && nome(d.turnos[i - 1]) === nome(t) && t.ini - d.turnos[i - 1].fim < 2.5;
    c.innerHTML = `<div class="at-trans">${d.turnos.map((t, i) => `
      <div class="at-turno${cont(t, i) ? ' at-cont' : ''}"><span class="at-hora" onclick="ataOuvir('${t.spk}', ${t.ini})" title="Ouvir daqui">${ataTempo(t.ini)}</span>
        <b style="color:${ataCor(t.spk)}">${ataEsc(nome(t))}</b>
        <p contenteditable oninput="ATA.doc.turnos[${i}].texto=this.innerText; ataSalvar()">${ataEsc(t.texto)}</p></div>`).join('')}</div>`;
}

// falantes: renomear (mesmo nome = mesma pessoa) e ouvir um trecho de cada voz; glossário de nomes e termos
function ataPintarFal() {
    const c = document.getElementById('at-corpo'), d = ATA.doc, fal = d.falantes || {};
    const tempo = {};
    (d.turnos || []).forEach(t => { tempo[t.spk] = (tempo[t.spk] || 0) + (t.fim - t.ini); });
    const sugest = [...new Set([...(d.participantes || []), ...Object.values(fal)])];
    c.innerHTML = `<div class="at-fal">
      <section><h3>Quem falou</h3>
        <p class="at-dica">Ouça cada voz e dê o nome. Vozes com o <b>mesmo nome</b> viram uma pessoa só. Depois clique em <b>Refazer ATA</b>.</p>
        <datalist id="at-nomes">${sugest.map(n => `<option value="${ataEsc(n)}">`).join('')}</datalist>
        ${Object.keys(fal).sort((a, b) => (tempo[b] || 0) - (tempo[a] || 0)).map(k => `
          <div class="at-falante"><span class="at-bola" style="background:${ataCor(k)}"></span>
            <input class="at-campo" list="at-nomes" value="${ataEsc(fal[k])}" onchange="ataRenomear('${k}', this.value)" ${k === 'eu' ? 'title="A sua voz (microfone)"' : ''}>
            <span class="at-fal-t">${ataDur(tempo[k] || 0)}</span>
            <button class="at-bt at-ico" onclick="ataOuvir('${k}')" title="Ouvir um trecho">▶</button></div>`).join('')}
      </section>
      <section><h3>Glossário</h3>
        <p class="at-dica">Nomes de pessoas, empresas e produtos, um por linha. Corrige a transcrição e a Kani escreve exatamente assim.</p>
        <textarea class="at-campo at-glos" rows="8" onchange="ATA.doc.glossario=this.value.split('\\n').map(s=>s.trim()).filter(Boolean); ataSalvar()"
          placeholder="Kanivete&#10;Anvisa&#10;Maria Souza">${ataEsc((d.glossario || []).join('\n'))}</textarea>
      </section></div>`;
}

function ataRenomear(spk, nome) {
    nome = (nome || '').trim(); if (!nome) return;
    ATA.doc.falantes[spk] = nome;
    ataSalvar();
    ataPintarFal();
}

const ataAudio = new Audio();
async function ataOuvir(spk, t) {
    const a = ataApi(); if (!a) return;
    if (t == null) {   // trecho mais longo dessa voz
        const ts = (ATA.doc.turnos || []).filter(x => x.spk === spk).sort((x, y) => (y.fim - y.ini) - (x.fim - x.ini));
        if (!ts.length) return;
        t = ts[0].ini;
    }
    const r = await a.ata_audio(ATA.sid, spk === 'eu' ? 'eu' : 'outros');
    if (!r || !r.url) return toast('Áudio não encontrado', 'error');
    if (ataAudio.dataset.url !== r.url) { ataAudio.src = r.url; ataAudio.dataset.url = r.url; }
    ataAudio.currentTime = Math.max(0, t - 0.3);
    ataAudio.play().catch(() => {});
    clearTimeout(ataAudio._p);
    ataAudio._p = setTimeout(() => ataAudio.pause(), 8000);
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
    await a.ata_salvar(ATA.sid, ATA.doc);
    ATA.proc[ATA.sid] = { p: 70, msg: 'A Kani está escrevendo a ATA…' };
    ataPintarProgresso();
    await a.ata_reescrever(ATA.sid);
}
async function ataPdf() {
    const a = ataApi(); if (!a || !ATA.sid) return;
    ataLerFolhaSeAberta();
    await a.ata_salvar(ATA.sid, ATA.doc);
    const r = await a.ata_pdf(ATA.sid);
    if (r && r.success) toast('PDF salvo', 'success');
    else if (r && r.error) toast(r.error, 'error');
}
function ataLerFolhaSeAberta() { if (document.querySelector('.at-folha')) ataLerFolha(); clearTimeout(ATA.salvarT); }

async function ataApagar() {
    const a = ataApi(); if (!a || !ATA.sid) return;
    const ok = await appConfirm({ titulo: 'Apagar reunião', texto: 'A gravação e a ATA desta reunião serão apagadas do PC.',
        botoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Apagar', valor: true, tipo: 'perigo' }] });
    if (!ok) return;
    await a.ata_apagar(ATA.sid);
    ATA.sid = null; ATA.doc = null;
    await ataListar();
    ataPintarMain();
}

// para o agente (modo --agente): ler e mexer sem a interface
window.ATA_API = {
    lista: () => ATA.lista, doc: () => ATA.doc, abrir: ataAbrir, processar: ataProcessar, reescrever: ataReescrever,
    aba: k => { ATA.aba = k; ataPintarMain(); }, estadoMeet: () => ATA.vivo,
};
