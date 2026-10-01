// =========================================================
// Pocket Editor — painel Soundboard: efeitos sonoros prontos, por categoria
// O pack (sons CC0 em Opus, catálogo em <app>/soundboard/catalogo.json) não vem no app: o painel oferece
// baixar na primeira vez (Functions/soundboard.py). Passar o mouse num som toca a prévia (ou clique);
// arrastar até a timeline/monitor ou dar duplo clique (na agulha) coloca o som no projeto (pasta
// "Soundboard" do painel Projeto) e na timeline, como um áudio importado. Um clique seleciona o som;
// Shift+1 (comando sb-aplicar) põe o selecionado na agulha, na primeira trilha de áudio livre.
// Preferências (PREFS): sbFav (favoritos, por arquivo), sbVol (volume da prévia), sbHover (ouvir ao passar).
// =========================================================

const VESB = { dados: null, cat: 'todos', busca: '', audio: null, tile: null, hoverT: 0, raf: 0, baixando: null, pedindo: false, sel: null };   // sel = arq do som selecionado
const VESB_TIPO = 'text/x-ve-som';

const veSbFavs = () => new Set(Array.isArray(PREFS.sbFav) ? PREFS.sbFav : []);
const veSbHoverOn = () => PREFS.sbHover !== false;
const veSbSemAcento = t => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const veSbDur = d => d < 10 ? d.toFixed(1).replace('.', ',') + ' s' : Math.round(d) + ' s';

function veSbCarregar() {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_sb_estado || VESB.pedindo) return;
    VESB.pedindo = true;
    api.ve_sb_estado().then(r => {
        VESB.dados = r || { instalado: false };
        if (r && r.baixando && !VESB.baixando) VESB.baixando = { pct: 0, msg: 'Baixando sons...' };
        veSbRender();
    }).finally(() => { VESB.pedindo = false; });
}

function veSbSom(k) {
    const [ci, si] = k.split(':').map(Number), c = VESB.dados.categorias[ci];
    return c && c.sons[si] ? { ...c.sons[si], cat: c } : null;
}

function veSbRender() {
    const lista = $ve('ve-sb-lista'), cats = $ve('ve-sb-cats');
    if (!lista) return;
    const d = VESB.dados;
    if (!d) { cats.innerHTML = ''; lista.innerHTML = '<div class="ve-sb-vazio">Carregando...</div>'; return; }
    const b = VESB.baixando;
    if (!d.instalado || b) {
        cats.innerHTML = '';
        lista.innerHTML = `<div class="ve-sb-baixar">
            <svg class="i"><use href="#i-music"/></svg>
            <b>Pack de efeitos sonoros</b>
            <p>Whoosh, riser, impacto, pop, notificação, glitch, cartoon, reações, jingles e mais, prontos para usar.</p>
            <p>Todos livres (CC0): pode usar em qualquer vídeo, inclusive comercial.</p>
            <p class="ve-sb-sub">Baixa uma vez só e fica no app.</p>
            ${b ? `<div class="ve-sb-barra"><i style="width:${b.pct || 0}%"></i></div><small>${veEsc(b.msg || '')}</small>`
                : '<button class="ve-btn ve-btn-primary" id="ve-sb-baixar">Baixar sons</button>'}
        </div>`;
        return;
    }
    const favs = veSbFavs(), q = veSbSemAcento(VESB.busca.trim());
    const chips = [['fav', '★ Favoritos', favs.size], ['todos', 'Todos', d.categorias.reduce((n, c) => n + c.sons.length, 0)],
        ...d.categorias.map(c => [c.id, c.nome, c.sons.length])];
    cats.innerHTML = chips.map(([id, nome, n]) =>
        `<button class="ve-sb-cat${VESB.cat === id ? ' on' : ''}" data-cat="${id}">${veEsc(nome)} <small>${n}</small></button>`).join('');
    let html = '', total = 0;
    d.categorias.forEach((c, ci) => {
        if (VESB.cat !== 'todos' && VESB.cat !== 'fav' && VESB.cat !== c.id) return;
        const itens = c.sons.map((s, si) => [s, si]).filter(([s]) =>
            (VESB.cat !== 'fav' || favs.has(s.arq)) &&
            (!q || veSbSemAcento(`${s.nome} ${s.orig} ${c.nome}`).includes(q)));
        if (!itens.length) return;
        total += itens.length;
        html += `<div class="ve-sb-sec">${veEsc(c.nome)} <small>${itens.length}</small></div><div class="ve-sb-grade">` +
            itens.map(([s, si]) => `<div class="ve-sb-som${VESB.sel === s.arq ? ' sel' : ''}" draggable="true" data-k="${ci}:${si}" data-c="${c.id}"
                title="${veEsc(s.nome)} · ${veSbDur(s.dur)}&#10;Original: ${veEsc(s.orig)}&#10;${veEsc(s.fonte)} · ${veEsc(s.licenca)}&#10;Clique: seleciona · Shift+1 ou duplo clique: aplica na agulha · ou arraste para a timeline">
                <i class="ve-sb-prog"></i>
                <button class="ve-sb-fav${favs.has(s.arq) ? ' on' : ''}" data-fav title="Favorito">★</button>
                <span>${veEsc(s.nome)}</span><small>${veSbDur(s.dur)}</small></div>`).join('') + '</div>';
    });
    const aviso = d.desatualizado ? '<div class="ve-sb-aviso"><span>Há sons novos no pack.</span><button class="ve-btn ve-btn-sm" id="ve-sb-baixar">Atualizar</button></div>' : '';
    lista.innerHTML = aviso + (html || `<div class="ve-sb-vazio">${VESB.cat === 'fav' && !q ? 'Marque sons com ★ para achar rápido aqui' : 'Nenhum som encontrado'}</div>`);
}

// ── prévia ──
function veSbParar() {
    clearTimeout(VESB.hoverT);
    cancelAnimationFrame(VESB.raf);
    if (VESB.audio) VESB.audio.pause();
    if (VESB.tile) { VESB.tile.classList.remove('tocando'); VESB.tile.style.removeProperty('--p'); }
    VESB.tile = null;
}

function veSbTocar(tile) {
    const s = veSbSom(tile.dataset.k);
    if (!s) return;
    veSbParar();
    if (!VESB.audio) {
        VESB.audio = new Audio();
        VESB.audio.addEventListener('ended', veSbParar);
    }
    const a = VESB.audio;
    a.volume = Math.max(0, Math.min(1, (PREFS.sbVol ?? 70) / 100));
    if (a.dataset.url !== s.url) { a.src = s.url; a.dataset.url = s.url; } else a.currentTime = 0;
    a.play().catch(() => {});
    VESB.tile = tile;
    tile.classList.add('tocando');
    const passo = () => {
        if (VESB.tile !== tile) return;
        tile.style.setProperty('--p', a.duration ? Math.min(1, a.currentTime / a.duration) : 0);
        VESB.raf = requestAnimationFrame(passo);
    };
    passo();
}

// ── colocar no projeto e na timeline ──
// Sem drop: na agulha, na primeira trilha de áudio livre de cima para baixo (sem sobrescrever nada);
// nenhuma livre: abaixo da última usada (vePjAudioEm cria a trilha)
async function veSbInserir(k, drop) {
    const s = veSbSom(k);
    if (!s) return;
    if (!VE.ready) { veToast('Abra um vídeo primeiro'); return; }
    let m = VE.media.find(x => x && !x.removido && x.kind === 'audio' && x.path === s.path);
    if (!m) {
        let b = (VE.bins || []).find(b => b.nome === 'Soundboard' && !b.pai);
        if (!b) b = vePjNovoBin('Soundboard');
        const n = VE.media.length;
        if (!await vePjImportarArquivo(s.path, b.id) || VE.media.length === n) { veToast('Não foi possível abrir esse som'); return; }
        m = VE.media[VE.media.length - 1];
        m.nome = s.nome;
    }
    if (drop) vePjColocar([m.id], drop);
    else {
        const st = veSnapFrame(VE.playhead), novo = { m: m.id };
        const tr = veTrackIndexes().find(t => !veTrkLocked(t) && veTrackFree(t, st, st + m.dur, novo));
        vePjAudioEm(m, st, tr ?? -1);
    }
    vePjAlterou();
}

// Shift+1: o som selecionado no painel, na agulha
function veSbAplicarSelecionado() {
    const d = VESB.dados;
    let k = null;
    (d && d.categorias || []).forEach((c, ci) => c.sons.forEach((s, si) => { if (s.arq === VESB.sel) k = `${ci}:${si}`; }));
    if (!k) { veToast('Selecione um som no Soundboard (um clique) para aplicar com Shift+1'); return; }
    veSbInserir(k);
}

function veSbBaixar() {
    VESB.baixando = { pct: 0, msg: 'Conectando...' };
    veSbRender();
    window.pywebview.api.ve_sb_baixar().then(r => {
        if (r && !r.success && !/Já está/.test(r.error || '')) { VESB.baixando = null; veToast(r.error); veSbRender(); }
    });
}

// progresso do download (Python: soundboard.baixar)
function veSbProgresso(d) {
    if (d.fim) { VESB.baixando = null; VESB.dados = null; veSbRender(); veSbCarregar(); veToast('Sons prontos no Soundboard'); return; }
    if (d.erro) { VESB.baixando = null; veToast(d.erro); veSbRender(); return; }
    VESB.baixando = { pct: d.pct, msg: d.msg };
    const barra = document.querySelector('.ve-sb-barra i'), txt = barra && barra.parentElement.nextElementSibling;
    if (barra) { barra.style.width = d.pct + '%'; if (txt) txt.textContent = d.msg || ''; } else veSbRender();
}

function veSbInit() {
    const box = $ve('ve-pane-sb'), lista = $ve('ve-sb-lista');
    if (!box) return;
    const hover = $ve('ve-sb-hover'), vol = $ve('ve-sb-vol');
    hover.checked = veSbHoverOn();
    vol.value = PREFS.sbVol ?? 70;
    hover.addEventListener('change', () => { PREFS.sbHover = hover.checked; prefsSave(); if (!hover.checked) veSbParar(); });
    vol.addEventListener('input', () => { PREFS.sbVol = +vol.value; if (VESB.audio) VESB.audio.volume = vol.value / 100; });
    vol.addEventListener('change', prefsSave);
    $ve('ve-sb-pasta').addEventListener('click', () => window.pywebview.api.ve_sb_abrir_pasta());
    $ve('ve-sb-q').addEventListener('input', e => { VESB.busca = e.target.value; veSbRender(); });
    $ve('ve-sb-q').addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.target.value = ''; VESB.busca = ''; veSbRender(); }
        e.stopPropagation();   // digitar na busca não vira atalho da timeline
    });
    $ve('ve-sb-cats').addEventListener('click', e => {
        const b = e.target.closest('[data-cat]');
        if (!b) return;
        VESB.cat = b.dataset.cat;
        veSbRender();
        lista.scrollTop = 0;
    });
    // o pack é pedido quando o painel aparece (não atrasa a abertura do editor)
    box.addEventListener('pointerenter', () => { if (!VESB.dados) veSbCarregar(); });
    new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !VESB.dados) veSbCarregar(); }).observe(box);
    lista.addEventListener('click', e => {
        if (e.target.closest('#ve-sb-baixar')) { veSbBaixar(); return; }
        const tile = e.target.closest('.ve-sb-som');
        if (!tile) return;
        if (e.target.closest('[data-fav]')) {
            const s = veSbSom(tile.dataset.k), f = veSbFavs();
            f.has(s.arq) ? f.delete(s.arq) : f.add(s.arq);
            PREFS.sbFav = [...f];
            prefsSave();
            veSbRender();
            return;
        }
        const arq = veSbSom(tile.dataset.k).arq;
        if (VESB.sel !== arq) {
            VESB.sel = arq;
            lista.querySelectorAll('.ve-sb-som.sel').forEach(x => x.classList.remove('sel'));
            tile.classList.add('sel');
        }
        VESB.tile === tile ? veSbParar() : veSbTocar(tile);
    });
    lista.addEventListener('dblclick', e => {
        const tile = e.target.closest('.ve-sb-som');
        if (tile && !e.target.closest('[data-fav]')) { veSbParar(); veSbInserir(tile.dataset.k); }
    });
    lista.addEventListener('mouseover', e => {
        const tile = e.target.closest('.ve-sb-som');
        if (!tile || tile === VESB.tile || !veSbHoverOn() || e.buttons) return;
        clearTimeout(VESB.hoverT);
        VESB.hoverT = setTimeout(() => veSbTocar(tile), 90);   // atravessar a lista com o mouse não dispara tudo
    });
    lista.addEventListener('mouseout', e => {
        const tile = e.target.closest('.ve-sb-som');
        if (!tile || tile.contains(e.relatedTarget)) return;
        clearTimeout(VESB.hoverT);
        if (VESB.tile === tile && veSbHoverOn()) veSbParar();
    });
    lista.addEventListener('dragstart', e => {
        const tile = e.target.closest('.ve-sb-som');
        if (!tile) return;
        veSbParar();
        e.dataTransfer.setData(VESB_TIPO, tile.dataset.k);
        e.dataTransfer.effectAllowed = 'copy';
    });
    // soltar na timeline ou no monitor
    [$ve('ve-tl-wrap'), $ve('ve-screen')].forEach(el => {
        if (!el) return;
        el.addEventListener('dragover', e => {
            if ([...e.dataTransfer.types].includes(VESB_TIPO)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
        });
        el.addEventListener('drop', e => {
            const k = e.dataTransfer.getData(VESB_TIPO);
            if (!k) return;
            e.preventDefault();
            e.stopPropagation();
            veSbInserir(k, { x: e.clientX, y: e.clientY });
        });
    });
    veSbRender();
}

document.addEventListener('DOMContentLoaded', veSbInit);
