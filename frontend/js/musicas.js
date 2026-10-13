// =========================================================
// Biblioteca de músicas (Functions/musicas.py): a pasta local analisada (clima, BPM, duração, gênero) e a busca no
// Openverse (músicas de licença livre, com crédito). Janela própria, aberta pela barra lateral (Áudio › Músicas) ou por
// quem precisa escolher uma música: MUSICAS.abrir({ escolher: path => ... }) mostra o botão "Usar esta".
// A vinheta da Kani escolhe sozinha daqui (kani_criar._finalizar).
// =========================================================
const MUS = { aba: 'minha', f: { texto: '', clima: '', genero: '', dur: '' }, lista: null, ov: null, ovq: '', ovGen: '', ovDur: '', tocando: null, cb: null, prog: null };
const MUS_CLIMAS = { calma: 'Calma', alegre: 'Alegre', animada: 'Animada', intensa: 'Intensa', melancolica: 'Melancólica' };
const MUS_DUR = { '': 'Qualquer', curta: 'Até 1 min', media: '1 a 3 min', longa: 'Mais de 3 min' };
const musEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const musApi = () => window.pywebview && window.pywebview.api;
const musTempo = s => { s = Math.round(+s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function musMontar() {
    if (document.getElementById('mus')) return;
    const d = document.createElement('div');
    d.id = 'mus'; d.className = 'mus-fundo'; d.hidden = true;
    d.innerHTML = '<div class="mus-jan" role="dialog" aria-label="Biblioteca de músicas"></div>';
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d) musFechar(); musClique(e); });
    d.addEventListener('input', e => {
        const t = e.target;
        if (t.id === 'mus-busca') { MUS.f.texto = t.value; clearTimeout(MUS.tb); MUS.tb = setTimeout(musCarregar, 250); }
        if (t.id === 'mus-ov-busca') MUS.ovq = t.value;
    });
    d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') musFechar(); if (e.key === 'Enter' && e.target.id === 'mus-ov-busca') musOpenverse(); });
    MUS.audio = new Audio();
    MUS.audio.onended = () => { MUS.tocando = null; musRender(); };
}

async function musAbrir(opts) {
    musMontar();
    MUS.cb = opts && opts.escolher || null;
    document.getElementById('mus').hidden = false;
    musRender();
    await musCarregar();
    if (MUS.lista && MUS.lista.pendentes) musAnalisar();
}
function musFechar() {
    const d = document.getElementById('mus'); if (d) d.hidden = true;
    if (MUS.audio) MUS.audio.pause(); MUS.tocando = null; MUS.cb = null;
}

async function musCarregar() {
    const f = MUS.f, dur = { curta: [0, 60], media: [60, 180], longa: [180, 0] }[f.dur] || [0, 0];
    MUS.lista = await musApi().musicas_listar({ texto: f.texto, clima: f.clima, genero: f.genero, dur_min: dur[0], dur_max: dur[1] }).catch(() => null);
    musRender();
}
function musAnalisar() {
    if (MUS.prog) return;
    MUS.prog = { pct: 0, msg: 'Analisando as músicas novas...' };
    musRender();
    musApi().musicas_analisar();
}
window.musicasProgresso = function (d) {
    if (d.fim || d.erro) { MUS.prog = null; if (d.erro && typeof toast === 'function') toast('Biblioteca: ' + d.erro); musCarregar(); return; }
    MUS.prog = d;
    const b = document.getElementById('mus-prog'); if (b) { b.querySelector('i').style.width = d.pct + '%'; b.querySelector('span').textContent = d.msg; }
};

async function musOpenverse(pag) {
    MUS.ov = { carregando: true, itens: (MUS.ov && pag > 1 && MUS.ov.itens) || [] };
    musRender();
    const r = await musApi().musicas_openverse(MUS.ovq, MUS.ovGen, MUS.ovDur, pag || 1).catch(e => ({ success: false, error: e.message }));
    MUS.ov = r && r.success ? { itens: (pag > 1 ? MUS.ov.itens : []).concat(r.resultados), total: r.total, pag: pag || 1 } : { erro: (r && r.error) || 'falhou', itens: [] };
    musRender();
}

async function musTocar(chave, path, url) {
    if (MUS.tocando === chave) { MUS.audio.pause(); MUS.tocando = null; musRender(); return; }
    if (!url) url = (await musApi().musicas_url(path)).url;
    if (!url) return;
    MUS.audio.src = url; MUS.audio.play().catch(() => {});
    MUS.tocando = chave; musRender();
}

async function musClique(e) {
    const b = e.target.closest('[data-mus]'); if (!b) return;
    const a = b.dataset.mus, v = b.dataset.v;
    if (a === 'fechar') musFechar();
    else if (a === 'aba') { MUS.aba = v; musRender(); if (v === 'openverse' && !MUS.ov) musOpenverse(); }
    else if (a === 'clima') { MUS.f.clima = MUS.f.clima === v ? '' : v; musCarregar(); }
    else if (a === 'genero') { MUS.f.genero = MUS.f.genero === v ? '' : v; musCarregar(); }
    else if (a === 'dur') { MUS.f.dur = v; musCarregar(); }
    else if (a === 'pasta') { const r = await musApi().musicas_trocar_pasta(); if (r && r.success) { await musCarregar(); musAnalisar(); } }
    else if (a === 'analisar') musAnalisar();
    else if (a === 'abrir-pasta') musApi().open_folder(MUS.lista.pasta);
    else if (a === 'tocar') { const m = MUS.lista.musicas[+v]; musTocar('l' + v, m.path); }
    else if (a === 'usar') { const m = MUS.lista.musicas[+v], cb = MUS.cb; musFechar(); if (cb) cb(m.path, m); }
    else if (a === 'ov-tocar') { const m = MUS.ov.itens[+v]; musTocar('o' + v, null, m.url); }
    else if (a === 'ov-dur') { MUS.ovDur = MUS.ovDur === v ? '' : v; musOpenverse(); }
    else if (a === 'ov-gen') { MUS.ovGen = MUS.ovGen === v ? '' : v; musOpenverse(); }
    else if (a === 'ov-buscar') musOpenverse();
    else if (a === 'ov-mais') musOpenverse((MUS.ov.pag || 1) + 1);
    else if (a === 'ov-baixar') {
        const m = MUS.ov.itens[+v]; m._baixando = true; musRender();
        const r = await musApi().musicas_openverse_baixar(m).catch(e => ({ success: false, error: e.message }));
        m._baixando = false; m._ok = r && r.success;
        if (!m._ok && typeof toast === 'function') toast((r && r.error) || 'Não consegui baixar');
        musRender();
        if (m._ok) musAnalisar();
    }
}

function musRender() {
    const j = document.querySelector('#mus .mus-jan'); if (!j) return;
    const L = MUS.lista, f = MUS.f, ico = k => `<svg class="i"><use href="#i-${k}"/></svg>`;
    const chip = (a, v, t, on) => `<button class="mus-chip${on ? ' on' : ''}" data-mus="${a}" data-v="${musEsc(v)}">${t}</button>`;
    const prog = MUS.prog ? `<div class="mus-prog" id="mus-prog"><i style="width:${MUS.prog.pct || 0}%"></i><span>${musEsc(MUS.prog.msg || '')}</span></div>` : '';
    let corpo;
    if (MUS.aba === 'minha') {
        const ms = L ? L.musicas : [];
        corpo = `<div class="mus-filtros">
                <input id="mus-busca" type="text" placeholder="Buscar por nome, artista, gênero..." value="${musEsc(f.texto)}">
                <div class="mus-linha"><span>Clima</span>${Object.entries(MUS_CLIMAS).map(([k, t]) => chip('clima', k, t, f.clima === k)).join('')}</div>
                <div class="mus-linha"><span>Duração</span>${Object.entries(MUS_DUR).map(([k, t]) => chip('dur', k, t, f.dur === k)).join('')}</div>
                ${L && L.generos.length ? `<div class="mus-linha"><span>Gênero</span>${L.generos.slice(0, 18).map(g => chip('genero', g, musEsc(g), f.genero === g)).join('')}</div>` : ''}
            </div>${prog}
            <div class="mus-lista">${!L ? '<div class="mus-vazio">Carregando...</div>' : !ms.length ? `<div class="mus-vazio">${L.total ? 'Nada com esses filtros.' :
                'A biblioteca está vazia. Solte músicas na pasta (ex.: baixadas da Biblioteca de Áudio do YouTube) ou busque no Openverse.'}</div>` :
                ms.map((m, i) => `<div class="mus-item">
                    <button class="mus-play${MUS.tocando === 'l' + i ? ' on' : ''}" data-mus="tocar" data-v="${i}" title="Ouvir">${MUS.tocando === 'l' + i ? '■' : ico('play')}</button>
                    <div class="mus-info"><b title="${musEsc(m.titulo)}">${musEsc(m.titulo)}</b><small>${musEsc(m.artista || '')}${m.genero ? ` · ${musEsc(m.genero)}` : ''}${m.licenca ? ` · <em>${musEsc(m.licenca)}</em>` : ''}</small></div>
                    <span class="mus-tag c-${m.clima}">${MUS_CLIMAS[m.clima] || ''}</span><span class="mus-num">${m.bpm} BPM</span><span class="mus-num">${musTempo(m.dur)}</span>
                    ${MUS.cb ? `<button class="mus-usar" data-mus="usar" data-v="${i}">Usar esta</button>` : ''}
                </div>`).join('')}</div>`;
    } else {
        const O = MUS.ov || {};
        corpo = `<div class="mus-filtros">
                <div class="mus-busca-ov"><input id="mus-ov-busca" type="text" placeholder="Ex.: upbeat corporate, happy acoustic, cinematic epic (em inglês acha mais)" value="${musEsc(MUS.ovq)}">
                    <button class="mus-usar" data-mus="ov-buscar">Buscar</button></div>
                <div class="mus-linha"><span>Duração</span>${chip('ov-dur', 'short', 'Até 30 s', MUS.ovDur === 'short')}${chip('ov-dur', 'medium', '30 s a 2 min', MUS.ovDur === 'medium')}${chip('ov-dur', 'long', 'Mais de 2 min', MUS.ovDur === 'long')}</div>
                <div class="mus-linha"><span>Gênero</span>${['pop', 'rock', 'electronic', 'acoustic', 'hiphop', 'jazz', 'classical', 'ambient', 'cinematic', 'funk'].map(g => chip('ov-gen', g, g, MUS.ovGen === g)).join('')}</div>
                <small class="mus-nota">Só licenças que permitem uso comercial (CC0, CC BY, CC BY-SA). As CC BY pedem crédito ao autor: ele fica anotado na biblioteca e em CREDITOS.txt.</small>
            </div>${prog}
            <div class="mus-lista">${O.erro ? `<div class="mus-vazio">${musEsc(O.erro)}</div>` : !O.itens || (!O.itens.length && O.carregando) ? '<div class="mus-vazio">Buscando...</div>' :
                !O.itens.length ? '<div class="mus-vazio">Nada encontrado.</div>' : O.itens.map((m, i) => `<div class="mus-item">
                    <button class="mus-play${MUS.tocando === 'o' + i ? ' on' : ''}" data-mus="ov-tocar" data-v="${i}" title="Ouvir">${MUS.tocando === 'o' + i ? '■' : ico('play')}</button>
                    <div class="mus-info"><b title="${musEsc(m.titulo)}">${musEsc(m.titulo)}</b><small>${musEsc(m.artista)}${m.genero ? ` · ${musEsc(m.genero)}` : ''} · <em>${musEsc(m.licenca_nome)}</em></small></div>
                    <span class="mus-num">${musTempo(m.dur)}</span>
                    <button class="mus-usar${m._ok ? ' ok' : ''}" data-mus="ov-baixar" data-v="${i}" ${m._baixando || m._ok ? 'disabled' : ''}>${m._ok ? 'Na biblioteca ✓' : m._baixando ? 'Baixando...' : 'Baixar'}</button>
                </div>`).join('') + (O.itens.length < (O.total || 0) ? `<button class="mus-mais" data-mus="ov-mais">${O.carregando ? 'Carregando...' : 'Mais resultados'}</button>` : '')}</div>`;
    }
    j.innerHTML = `<header class="mus-cab"><span class="mus-ico">${ico('music')}</span><div><b>Biblioteca de músicas</b>
            <small>${L ? `${L.total} músicas · <a data-mus="abrir-pasta">${musEsc(L.pasta)}</a>` : ''}</small></div>
            <span class="mus-esp"></span>
            ${L && L.pendentes && !MUS.prog ? `<button class="mus-bt" data-mus="analisar">Analisar ${L.pendentes} nova(s)</button>` : ''}
            <button class="mus-bt" data-mus="pasta">Trocar pasta</button>
            <button class="mus-x" data-mus="fechar" title="Fechar">×</button></header>
        <nav class="mus-abas">${chip('aba', 'minha', 'Minha biblioteca', MUS.aba === 'minha')}${chip('aba', 'openverse', 'Buscar no Openverse (grátis)', MUS.aba === 'openverse')}</nav>
        ${corpo}`;
    if (MUS.aba === 'minha') { const b = document.getElementById('mus-busca'); if (b && document.activeElement !== b && MUS._foco) b.focus(); }
}

// entrada na barra lateral (seção Áudio), sem mexer no index.html
function musMenu() {
    if (document.getElementById('mus-menu')) return;
    const ref = document.querySelector('.menu-item[data-tool="converter-audio"]');
    if (!ref) return;
    const b = ref.cloneNode(true);
    b.id = 'mus-menu'; b.removeAttribute('data-tool'); b.classList.remove('active');
    b.querySelector('.label') && (b.querySelector('.label').textContent = 'Músicas');
    const u = b.querySelector('use'); if (u) u.setAttribute('href', '#i-music');
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); musAbrir(); };
    ref.before(b);
}
document.addEventListener('DOMContentLoaded', musMenu);
if (document.readyState !== 'loading') musMenu();
window.MUSICAS = { abrir: musAbrir, fechar: musFechar };
