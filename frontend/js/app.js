// =========================
// App JavaScript - Canivete do Pailer
// =========================

// ── Estado global ──────────────────────────────────────────────────────────
const selectedPaths = {};   // caminho selecionado por ferramenta
const selectedTypes = {};   // 'file' ou 'folder' por ferramenta
let scraperLogBuffer = [];
let scraperLastAnalyzedUrl = null;

// ─────────────────────────── UI genérica das ferramentas ───────────────────────────

const _rodando = {};  // ferramenta -> true enquanto processa

function _el(id) { return document.getElementById(id); }

// Ícone do sprite SVG do index.html
function ico(nome, extra = '') { return `<svg class="i ${extra}"><use href="#i-${nome}"/></svg>`; }

function toast(msg, tipo = 'info', ms = 4500) {
    const box = _el('toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    const icone = ico(tipo === 'ok' ? 'check' : tipo === 'erro' ? 'alert' : 'info');
    t.innerHTML = `${icone}<span>${_escHtml(msg)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('saindo'); setTimeout(() => t.remove(), 300); }, ms);
}

function _nomeCurto(caminho) {
    return String(caminho || '').split(/[\\/]/).filter(Boolean).pop() || caminho;
}

function setSelecao(tool, caminho, tipo) {
    selectedPaths[tool] = caminho;
    selectedTypes[tool] = tipo;
    const el = _el(`${tool}-selected`);
    if (!el) return;
    if (!caminho) { el.innerHTML = ''; return; }
    el.title = caminho;
    el.innerHTML = ico(tipo === 'folder' ? 'folder' : 'file') + `<span class="sel-nome">${_escHtml(caminho)}</span>` +
        `<button class="sel-x" title="Limpar" onclick="setSelecao('${tool}', null)">${ico('x')}</button>`;
    const wrap = _el(`btn-organizar-${tool}-wrap`);
    if (wrap) wrap.style.display = 'block';
}

function uiIniciar(tool, status = 'Preparando...') {
    _rodando[tool] = true;
    const card = _el(`progress-${tool}`);
    if (card) {
        card.hidden = false;
        card.classList.remove('ok', 'erro', 'indeterminado');
    }
    if (_el(`progress-fill-${tool}`)) _el(`progress-fill-${tool}`).style.width = '0%';
    if (_el(`progress-text-${tool}`)) _el(`progress-text-${tool}`).textContent = '0%';
    if (_el(`status-${tool}`)) _el(`status-${tool}`).textContent = status;
    if (_el(`result-${tool}`)) _el(`result-${tool}`).hidden = true;
    if (_el(`log-${tool}`)) _el(`log-${tool}`).textContent = '';
    const btn = _el(`btn-${tool}`);
    if (btn) {
        btn.dataset.label = btn.dataset.label || btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('rodando');
        btn.style.setProperty('--p', '0%');
        btn.innerHTML = ico('loader', 'spin') + '<span>Processando…</span>';
    }
    document.querySelector(`.menu-item[data-tool="${tool}"]`)?.classList.add('rodando');
    playExecute();
}

function _logLinha(tool, msg) {
    const log = _el(`log-${tool}`);
    if (!log) return;
    log.textContent += msg + '\n';
    if (log.textContent.length > 60000) log.textContent = log.textContent.slice(-40000);
    log.scrollTop = log.scrollHeight;
}

function uiAtualizar(tool, data) {
    const card = _el(`progress-${tool}`);
    if (data.percent !== undefined && data.percent !== null) {
        const p = Number(data.percent);
        if (card) card.classList.toggle('indeterminado', p < 0);
        if (p >= 0) {
            const v = Math.min(100, p);
            _el(`progress-fill-${tool}`).style.width = v + '%';
            _el(`progress-text-${tool}`).textContent = Math.round(v) + '%';
            const btn = _el(`btn-${tool}`);
            if (btn) {
                btn.style.setProperty('--p', v + '%');
                const span = btn.querySelector('span');
                if (span && btn.classList.contains('rodando')) span.textContent = `Processando… ${Math.round(v)}%`;
            }
        } else if (_el(`progress-text-${tool}`)) {
            _el(`progress-text-${tool}`).textContent = '';
        }
    }
    if (data.status && _el(`status-${tool}`)) _el(`status-${tool}`).textContent = data.status;
    if (data.log) {
        _logLinha(tool, data.log);
        if (!data.status && _el(`status-${tool}`)) _el(`status-${tool}`).textContent = String(data.log).trim();
    }
    if (data.complete) uiConcluir(tool, data);
}

function uiConcluir(tool, data) {
    _rodando[tool] = false;
    const card = _el(`progress-${tool}`);
    const erro = data.error;
    if (card) {
        card.classList.remove('indeterminado');
        card.classList.add(erro ? 'erro' : 'ok');
    }
    if (!erro && _el(`progress-fill-${tool}`)) {
        _el(`progress-fill-${tool}`).style.width = '100%';
        _el(`progress-text-${tool}`).textContent = '100%';
    }
    if (_el(`status-${tool}`)) _el(`status-${tool}`).textContent = erro ? 'Falhou' : 'Concluído';
    const btn = _el(`btn-${tool}`);
    if (btn) {
        btn.disabled = false;
        btn.classList.remove('rodando');
        btn.style.removeProperty('--p');
        if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
    document.querySelector(`.menu-item[data-tool="${tool}"]`)?.classList.remove('rodando');

    const texto = erro || data.resumo || 'Concluído!';
    const rb = _el(`result-${tool}`);
    if (rb) {
        rb.className = `result-banner ${erro ? 'erro' : 'ok'}`;
        rb.innerHTML = `<span class="rb-icon">${ico(erro ? 'alert' : 'check')}</span><span class="rb-text">${_escHtml(texto)}</span>`;
        rb.hidden = false;
    }
    if (erro) {
        _logLinha(tool, '❌ ' + erro);
        const det = _el(`logwrap-${tool}`);
        if (det) det.open = true;
    } else {
        playConcluido();
    }
    // Só avisa por toast se o usuário está em outra ferramenta
    if (!_el(`page-${tool}`)?.classList.contains('active')) {
        const nome = document.querySelector(`.menu-item[data-tool="${tool}"] .label`)?.textContent || tool;
        toast(`${nome}: ${texto}`, erro ? 'erro' : 'ok', 7000);
    }
}

function _exigirSelecao(tool, msg = 'Escolha uma pasta ou arquivo primeiro (ou arraste aqui).') {
    if (_rodando[tool]) return null;
    const p = selectedPaths[tool];
    if (!p) {
        toast(msg, 'erro');
        const dz = document.querySelector(`.dropzone[data-tool="${tool}"]`);
        if (dz) { dz.classList.add('drag-over'); setTimeout(() => dz.classList.remove('drag-over'), 700); }
        return null;
    }
    return p;
}

// ── Busca no menu ──
function filtrarMenu(q) {
    const termo = String(q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    let grupo = null, visiveisNoGrupo = 0;
    const fecharGrupo = () => { if (grupo) grupo.classList.toggle('oculto', visiveisNoGrupo === 0); };
    document.querySelectorAll('.menu > *').forEach(el => {
        if (el.classList.contains('menu-group')) {
            fecharGrupo();
            grupo = el; visiveisNoGrupo = 0;
            return;
        }
        const txt = el.textContent.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const ok = !termo || txt.includes(termo);
        el.classList.toggle('oculto', !ok);
        if (ok && grupo) visiveisNoGrupo++;
    });
    fecharGrupo();
}

function menuBuscaTecla(e) {
    if (e.key === 'Escape') { e.target.value = ''; filtrarMenu(''); e.target.blur(); }
    if (e.key === 'Enter') {
        const primeiro = document.querySelector('.menu-item:not(.oculto)');
        if (primeiro) { switchTool(primeiro.dataset.tool); e.target.value = ''; filtrarMenu(''); e.target.blur(); }
    }
}

// ── Menu recolhível (lembra a escolha) ──
function _lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function _lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

function toggleNav(forcar) {
    const mini = typeof forcar === 'boolean' ? forcar : !document.body.classList.contains('nav-mini');
    document.body.classList.toggle('nav-mini', mini);
    _lsSet('navMini', mini ? '1' : '0');
    const t = document.querySelector('.nav-toggle');
    if (t) t.title = mini ? 'Expandir menu' : 'Recolher menu';
    navAutoAgendar();
    navLarguraMudou();
}

// o editor de vídeo recalcula a timeline quando a largura muda
function navLarguraMudou() {
    if (typeof veDraw === 'function') setTimeout(() => { try { veDraw(); } catch (e) {} }, 240);
}

// ── Menu automático: dentro de uma ferramenta (fora do Início) o menu recolhe para só ícones depois de
// 4 s sem o mouse em cima; passar o mouse abre por cima do conteúdo (nav-peek), sem reorganizar a tela.
// Com o menu recolhido pelo botão (nav-mini) fica como o usuário deixou.
const NAV_AUTO_MS = 4000;
let _navT = 0;
function _navNaFerramenta() { return !_el('page-home')?.classList.contains('active'); }
function _navEmUso() {
    const sb = document.querySelector('.sidebar');
    return !!sb && (sb.matches(':hover') || sb.contains(document.activeElement) && document.activeElement.matches('input'));
}
function navAutoAgendar() {
    clearTimeout(_navT);
    const b = document.body;
    if (b.classList.contains('nav-mini') || !_navNaFerramenta()) {
        if (b.classList.contains('nav-auto')) { b.classList.remove('nav-auto', 'nav-peek'); navLarguraMudou(); }
        return;
    }
    const espera = b.classList.contains('nav-auto') ? 500 : NAV_AUTO_MS;   // já recolhido: fecha logo ao sair
    _navT = setTimeout(() => {
        if (_navEmUso() || b.classList.contains('nav-mini') || !_navNaFerramenta()) return;
        const antes = b.classList.contains('nav-auto');
        b.classList.add('nav-auto');
        b.classList.remove('nav-peek');
        if (!antes) navLarguraMudou();
    }, espera);
}
function navAutoAbrir() {
    clearTimeout(_navT);
    if (document.body.classList.contains('nav-auto')) document.body.classList.add('nav-peek');
}

document.addEventListener('DOMContentLoaded', () => {
    if (_lsGet('navMini') === '1') toggleNav(true);
    const sb = document.querySelector('.sidebar');
    sb.addEventListener('mouseenter', navAutoAbrir);
    sb.addEventListener('mouseleave', navAutoAgendar);
    sb.addEventListener('focusout', () => setTimeout(navAutoAgendar, 0));
    // No modo compacto o nome aparece como dica
    document.querySelectorAll('.menu-item').forEach(b => { b.title = b.querySelector('.label')?.textContent || ''; });
    renderRecentes();
});

// F11: tela cheia (sem barra de título)
document.addEventListener('keydown', e => {
    if (e.key !== 'F11') return;
    e.preventDefault();
    window.pywebview?.api?.toggle_fullscreen?.();
});

// Ctrl+K: buscar ferramenta (no editor de vídeo o Ctrl+K é "dividir")
document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
    if (_el('page-video-cutter')?.classList.contains('active')) return;
    e.preventDefault();
    if (document.body.classList.contains('nav-mini')) toggleNav(false);
    navAutoAbrir();
    _el('menu-search')?.focus();
});

// ── Fundo animado do Início: só toca com o Início na tela e a janela visível (não gasta nada fora dele) ──
function homeBgSync() {
    const v = _el('home-bg');
    if (!v) return;
    const tocar = _el('page-home')?.classList.contains('active') && !document.hidden
        && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (tocar) v.play().catch(() => {}); else v.pause();
}
document.addEventListener('visibilitychange', homeBgSync);
document.addEventListener('DOMContentLoaded', () => {
    const v = _el('home-bg');
    if (!v) return;
    v.addEventListener('playing', () => v.classList.add('pronto'), { once: true });   // entra suave, sem piscar preto
    // sem animação (acessibilidade do Windows): fica o primeiro quadro parado
    v.addEventListener('loadeddata', () => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) v.classList.add('pronto'); }, { once: true });
    homeBgSync();
});

// ── Recentes ──
function _recentes() {
    try { return JSON.parse(_lsGet('recentes') || '[]').filter(t => _el(`page-${t}`) && document.querySelector(`.menu-item[data-tool="${t}"]`)); } catch (e) { return []; }
}
function _registrarRecente(tool) {
    if (!tool || tool === 'home') return;
    const lista = [tool, ..._recentes().filter(t => t !== tool)].slice(0, 5);
    _lsSet('recentes', JSON.stringify(lista));
}
function _menuInfo(tool) {
    const m = document.querySelector(`.menu-item[data-tool="${tool}"]`);
    return { icone: m?.querySelector('.icon')?.innerHTML || '', nome: m?.querySelector('.label')?.textContent || tool };
}
function renderRecentes() {
    const box = _el('home-recent'), wrap = _el('home-recent-wrap');
    if (!box || !wrap) return;
    const lista = _recentes();
    wrap.hidden = !lista.length;
    box.innerHTML = lista.map(t => {
        const { icone, nome } = _menuInfo(t);
        return `<button class="recent-btn" onclick="switchTool('${t}')">${icone}${_escHtml(nome)}</button>`;
    }).join('');
}

// ── Home: solta qualquer coisa e sugere a ferramenta certa ──
const EXT_AUDIO = /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|aiff?)$/i;
const EXT_IMAGEM = /\.(jpe?g|png|webp|gif|heic|heif|avif|tiff?|bmp|ico|cr2|cr3|nef|arw|dng|raw|orf|rw2)$/i;
const HOME_SUGESTOES = {
    video: ['video-cutter', 'compressor-video', 'video-converter', 'converter-audio', 'transcrever-audio'],
    audio: ['video-cutter', 'converter-audio', 'transcrever-audio'],
    imagem: ['converter-imagem', 'compressor-imagem', 'remover-fundo', 'favicon'],
    pdf: ['compressor-imagem'],
    pasta: ['compressor-video', 'video-converter', 'converter-imagem', 'compressor-imagem', 'remover-fundo',
            'organizador-imagens', 'organizador-videos', 'converter-audio', 'transcrever-audio'],
};
let _homeItens = null;

function _tipoItem(item) {
    if (item.pasta) return 'pasta';
    if (EXT_VIDEO.test(item.path)) return 'video';
    if (EXT_AUDIO.test(item.path)) return 'audio';
    if (EXT_IMAGEM.test(item.path)) return 'imagem';
    if (/\.pdf$/i.test(item.path)) return 'pdf';
    return null;
}

function homeSugerir(itens) {
    const box = _el('home-suggest');
    if (!box || !itens?.length) return;
    const tipo = _tipoItem(itens[0]);
    const ferramentas = HOME_SUGESTOES[tipo] || [];
    _homeItens = itens;
    const nome = _nomeCurto(itens[0].path) + (itens.length > 1 ? ` +${itens.length - 1}` : '');
    box.innerHTML =
        `<div class="home-suggest-title">${ico(itens[0].pasta ? 'folder' : 'file')}<b>${_escHtml(nome)}</b></div>` +
        (ferramentas.length
            ? '<div class="home-suggest-list">' + ferramentas.map(t => {
                const { icone, nome } = _menuInfo(t);
                return `<button class="suggest-btn" onclick="homeUsar('${t}')">${icone}${_escHtml(nome)}</button>`;
            }).join('') + '</div>'
            : '<div class="dz-sub">Nenhuma ferramenta abre este tipo de arquivo.</div>');
    box.hidden = false;
}

function homeUsar(tool) {
    const itens = _homeItens;
    switchTool(tool);
    if (itens) _entregarItens(tool, itens);
}

function homeEscolher(tipo) {
    const api = window.pywebview?.api;
    if (!api) return;
    const pedido = tipo === 'folder' ? api.select_folder('home') : api.select_file('home');
    pedido.then(r => { if (r?.success) homeSugerir([{ path: r.path, pasta: tipo === 'folder' }]); });
}


// ── Abas no topo: cada ferramenta aberta vira uma aba; o ponto laranja mostra processo em andamento ──
const appTabs = [];

function _abaRodando(tool) {
    return !!document.querySelector(`.menu-item[data-tool="${tool}"].rodando`);
}

function renderTabs() {
    const bar = _el('tabbar');
    if (!bar) return;
    const ativa = document.querySelector('.tool-page.active')?.id.replace('page-', '') || 'home';
    const home = `<button class="tab tab-home${ativa === 'home' ? ' active' : ''}" role="tab" title="Início" onclick="switchTool('home')">` +
        `<span class="tab-ico">${ico('home')}</span></button>`;
    bar.innerHTML = home + appTabs.map(t => {
        const { icone, nome } = _menuInfo(t);
        let extra = '';
        if (t === 'video-cutter' && typeof VE !== 'undefined' && VE.ready) {
            const proj = VE.projectPath ? VE.projectPath.split(/[\\/]/).pop().replace(/\.vcnvt$/i, '') : '';
            extra = (proj ? ` · ${_escHtml(proj)}` : '') + (VE.dirty ? ' •' : '');
        }
        const rodando = _abaRodando(t);
        return `<div class="tab${t === ativa ? ' active' : ''}${rodando ? ' rodando' : ''}" role="tab" data-tab="${t}" ` +
            `title="${_escHtml(nome)}${rodando ? ' — em andamento' : ''}" onclick="switchTool('${t}')" onauxclick="if(event.button===1)fecharAba('${t}',event)">` +
            `<span class="tab-ico">${icone}</span><span class="tab-nome">${_escHtml(nome)}${extra ? `<span class="tab-extra">${extra}</span>` : ''}</span>` +
            (rodando ? '<span class="tab-dot"></span>' : '') +
            `<button class="tab-x" title="Fechar aba" onclick="fecharAba('${t}', event)">${ico('x')}</button></div>`;
    }).join('');
    bar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function _abrirAba(tool) {
    if (tool && tool !== 'home' && !appTabs.includes(tool) && _el(`page-${tool}`)) appTabs.push(tool);
    renderTabs();
}

// Confirmação dentro do app. botoes: [{rotulo, valor, tipo: 'primario'|'perigo'|'secundario'}]
function appConfirm({ titulo, texto, botoes }) {
    return new Promise(resolve => {
        const box = _el('app-confirm');
        _el('app-confirm-titulo').textContent = titulo;
        _el('app-confirm-texto').textContent = texto || '';
        const area = _el('app-confirm-botoes');
        area.innerHTML = '';
        const fechar = v => { box.hidden = true; document.removeEventListener('keydown', tecla, true); resolve(v); };
        botoes.forEach(b => {
            const el = document.createElement('button');
            el.className = b.tipo === 'primario' ? 'btn-primary' : b.tipo === 'perigo' ? 'btn-perigo' : 'btn-secondary';
            el.textContent = b.rotulo;
            el.onclick = () => fechar(b.valor);
            area.appendChild(el);
        });
        const tecla = e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(null); }
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); area.lastElementChild?.click(); }
        };
        document.addEventListener('keydown', tecla, true);
        box.hidden = false;
        area.lastElementChild?.focus();
    });
}

async function fecharAba(tool, ev) {
    ev?.stopPropagation();
    const { nome } = _menuInfo(tool);
    const rodando = _abaRodando(tool);
    if (tool === 'video-cutter' && typeof VE !== 'undefined' && VE.ready) {
        if (VE.exportRunning) {
            await appConfirm({ titulo: 'Exportação em andamento', texto: 'Aguarde a exportação terminar (ou cancele-a) antes de fechar o editor.', botoes: [{ rotulo: 'Ok', valor: 1, tipo: 'primario' }] });
            return;
        }
        if (VE.dirty) {
            const r = await appConfirm({
                titulo: 'Salvar o projeto antes de fechar?',
                texto: 'Há alterações no editor de vídeo que ainda não foram salvas.',
                botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Não salvar', valor: 'descartar', tipo: 'perigo' }, { rotulo: 'Salvar', valor: 'salvar', tipo: 'primario' }],
            });
            if (!r) return;
            if (r === 'salvar' && !(await veSaveProject())) return;
        } else {
            const r = await appConfirm({ titulo: 'Fechar o editor de vídeo?', texto: 'O projeto aberto será fechado.', botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Fechar', valor: 1, tipo: 'primario' }] });
            if (!r) return;
        }
        veCloseProject();
    } else {
        const r = await appConfirm({
            titulo: `Fechar ${nome}?`,
            texto: rodando ? 'Há um processo em andamento nesta ferramenta. Ele continua rodando mesmo com a aba fechada; reabra pelo menu para acompanhar.'
                           : 'Você pode reabrir pelo menu quando quiser.',
            botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Fechar', valor: 1, tipo: 'primario' }],
        });
        if (!r) return;
    }
    const i = appTabs.indexOf(tool);
    if (i >= 0) appTabs.splice(i, 1);
    const ativa = document.querySelector('.tool-page.active')?.id === `page-${tool}`;
    if (ativa) switchTool(appTabs[i] || appTabs[i - 1] || 'home');
    else renderTabs();
}

document.addEventListener('DOMContentLoaded', () => {
    renderTabs();
    // processos que começam/terminam (bolinha no menu) atualizam as abas
    const menu = document.querySelector('.menu');
    if (menu) new MutationObserver(renderTabs).observe(menu, { subtree: true, attributes: true, attributeFilter: ['class'] });
});

// ── Arrastar e soltar (o Python entrega os caminhos reais em onArquivosSoltos) ──
const EXT_VIDEO = /\.(mp4|mov|mkv|avi|webm|flv|wmv|m4v|ts|mts|m2ts|3gp|ogv|mpg|mpeg|mxf)$/i;

function onArquivosSoltos(itens) {
    document.body.classList.remove('arrastando');
    const pagina = document.querySelector('.tool-page.active');
    const tool = pagina?.id.replace('page-', '');
    if (!tool || !itens?.length) return;
    const proj = itens.find(i => !i.pasta && /\.vcnvt$/i.test(i.path));
    if (proj && tool !== 'video-cutter') { switchTool('video-cutter'); setTimeout(() => veOpenProject(proj.path), 60); return; }
    if (tool === 'home') return homeSugerir(itens);
    _entregarItens(tool, itens);
}

// Entrega arquivos/pastas (arrastados ou escolhidos na Home) para uma ferramenta
function _entregarItens(tool, itens) {
    const pagina = _el(`page-${tool}`);
    if (!pagina) return;
    const item = itens[0];

    if (tool === 'video-cutter') {
        veDropFiles(itens);   // vídeo abre o projeto; imagens viram camadas na timeline
        return;
    }
    if (tool === 'audio-cutter') {
        if (item.pasta) return toast('Solte um arquivo de áudio.', 'erro');
        return loadAudioCutterPath(item.path);
    }
    const aceita = pagina.dataset.drop;  // 'ambos' | 'arquivo' | 'pasta'
    if (!aceita) return toast('Esta ferramenta não recebe arquivos arrastados.', 'info');
    if (aceita === 'pasta' && !item.pasta) return toast('Aqui é preciso soltar uma pasta.', 'erro');
    if (aceita === 'arquivo' && item.pasta) return toast('Aqui é preciso soltar um arquivo.', 'erro');
    if (itens.length > 1 && !item.pasta) toast('Vários arquivos soltos: usando o primeiro. Para vários, solte a pasta.', 'info');
    setSelecao(tool, item.path, item.pasta ? 'folder' : 'file');
}

(function _instalarArrastar() {
    let profundidade = 0;
    document.addEventListener('dragenter', e => {
        if (e.dataTransfer?.types?.includes('Files')) { profundidade++; document.body.classList.add('arrastando'); }
    });
    document.addEventListener('dragleave', () => {
        if (--profundidade <= 0) { profundidade = 0; document.body.classList.remove('arrastando'); }
    });
    // Sem isso o navegador interno tenta abrir o arquivo em vez de disparar o drop
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => { e.preventDefault(); profundidade = 0; document.body.classList.remove('arrastando'); });
})();

function atualizarOpcoesDownloader() {
    const mp3 = document.querySelector('input[name="vd-format"]:checked').value === 'mp3';
    _el('vd-qualidade-row').style.display = mp3 ? 'none' : '';
}

// Helper para tocar som
function playClick() {
    const audio = document.getElementById('audio-click');
    if (audio) { audio.currentTime = 0; audio.play().catch(e => console.log("Audio play blocked", e)); }
}

function playConcluido() {
    const audio = document.getElementById('audio-concluido');
    if (audio) { audio.currentTime = 0; audio.play().catch(e => console.log("Audio play blocked", e)); }
}

function playExecute() {
    const audio = document.getElementById('audio-execute');
    if (audio) { audio.currentTime = 0; audio.play().catch(e => console.log("Audio play blocked", e)); }
}

// FAQ Toggle
function toggleFaq(element) {
    element.classList.toggle('active');
}

console.log("App JS carregando...");

// Global error handler
window.onerror = function(msg, url, line, col, error) {
    console.error("ERRO:", msg);
    return false;
};

// Menu navigation via onclick in HTML

// Função para trocar de ferramenta
function switchTool(toolId) {
    console.log("Switching to:", toolId);
    playClick();
    
    // Atualiza menu
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tool === toolId) {
            item.classList.add('active');
        }
    });

    // Atualiza páginas
    document.querySelectorAll('.tool-page').forEach(page => {
        page.classList.remove('active');
    });

    const page = document.getElementById(`page-${toolId}`);
    if (page) {
        page.classList.add('active');
    } else {
        // Se não existir página, mostra placeholder
        const placeholder = document.getElementById('page-placeholder');
        if (placeholder) placeholder.classList.add('active');
    }

    // Atualiza título
    const toolTitle = document.getElementById('tool-title');
    const menuItem = document.querySelector(`.menu-item[data-tool="${toolId}"]`);
    if (toolTitle && menuItem) {
        const label = menuItem.querySelector('.label');
        if (label) toolTitle.textContent = label.textContent;
    }

    _registrarRecente(toolId);
    _abrirAba(toolId);
    navAutoAgendar();
    homeBgSync();
    if (toolId === 'home') renderRecentes();

    // Refresh states specific to tools
    if (toolId === 'web-scraper') {
        if (typeof checkCerebroStatus === 'function') checkCerebroStatus();
    }
}

// =========================
// Controles de Janela (Removidos - gerenciados pelo SO)
// =========================


// =========================
// Funções de Backend (chamadas para Python)
// =========================

// Selecionar pasta
function selectFolder(tool) {
    window.pywebview.api.select_folder(tool).then(result => {
        if (!result.success) return;
        if (tool === 'video-downloader') {
            selectedPaths[tool] = result.path;
            _el('video-downloader-selected').textContent = result.path;
            return;
        }
        setSelecao(tool, result.path, 'folder');
    });
}

// Selecionar arquivo
function selectFile(tool) {
    window.pywebview.api.select_file(tool).then(result => {
        if (result.success) setSelecao(tool, result.path, 'file');
    });
}

// Selecionar imagem
function selectImage(tool) {
    window.pywebview.api.select_image(tool).then(result => {
        if (result.success) setSelecao(tool, result.path, 'file');
    });
}


// =========================
// Converter Áudio
// =========================

function runConverterAudio() {
    const path = _exigirSelecao('converter-audio');
    if (!path) return;
    const format = document.querySelector('input[name="audio-format"]:checked').value;
    uiIniciar('converter-audio');
    window.pywebview.api.converter_audio(path, format);
}

// Callback para atualizar progresso do conversor de áudio
function updateConverterAudioProgress(data) {
    uiAtualizar('converter-audio', data);
}


// =========================
// Cortar Audio
// =========================

const audioCutterState = {
    path: null,
    previewUrl: null,
    previewFallbackUrl: null,
    originalDuration: 0,
    duration: 0,
    peaks: [],
    cuts: [],
    cutPoints: [],
    layers: [],
    activeLayerId: 'main',
    mainLocked: false,
    mainOffset: 0,
    history: [],
    playhead: 0,
    zoom: 1,
    viewStart: 0,
    timelineTool: 'select',
    dragMode: null,
    dragLayerId: null,
    dragStartX: 0,
    dragStartOffset: 0,
    dragStartView: 0,
    playheadSelected: false,
    dragging: false,
    isPlaying: false
};

function formatAudioTime(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    const min = Math.floor(seconds / 60);
    const sec = seconds - min * 60;
    return `${String(min).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

function clampAudioTime(value) {
    const duration = getAudioTimelineDuration();
    return Math.min(Math.max(Number(value) || 0, 0), duration);
}

function getAudioTimelineDuration() {
    const mainEnd = (audioCutterState.mainOffset || 0) + getLayerEditedDuration('main');
    const layerEnd = audioCutterState.layers.reduce((max, layer) => {
        return Math.max(max, (Number(layer.offset) || 0) + getLayerEditedDuration(layer.id));
    }, 0);
    return Math.max(0, mainEnd, layerEnd);
}

function clampAudioView() {
    const duration = getAudioTimelineDuration();
    audioCutterState.zoom = Math.min(32, Math.max(1, Number(audioCutterState.zoom) || 1));
    const visibleDuration = duration / audioCutterState.zoom;
    const maxStart = Math.max(0, duration - visibleDuration);
    audioCutterState.viewStart = Math.min(Math.max(Number(audioCutterState.viewStart) || 0, 0), maxStart);
}

function getAudioVisibleDuration() {
    clampAudioView();
    return getAudioTimelineDuration() / (audioCutterState.zoom || 1);
}

function ensureAudioPlayheadVisible() {
    const visibleDuration = getAudioVisibleDuration();
    const margin = visibleDuration * 0.08;
    if (audioCutterState.playhead < audioCutterState.viewStart + margin) {
        audioCutterState.viewStart = audioCutterState.playhead - margin;
    } else if (audioCutterState.playhead > audioCutterState.viewStart + visibleDuration - margin) {
        audioCutterState.viewStart = audioCutterState.playhead - visibleDuration + margin;
    }
    clampAudioView();
}

function timeFromCanvasEvent(event) {
    const canvas = event.target.closest('.track-waveform') || document.getElementById('audio-waveform');
    if (!canvas) return audioCutterState.playhead;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    return audioCutterState.viewStart + (x / rect.width) * getAudioVisibleDuration();
}

function normalizeAudioCuts(cuts) {
    const duration = audioCutterState.originalDuration || 0;
    return normalizeAudioCutsForDuration(cuts, duration);
}

function normalizeAudioCutsForDuration(cuts, duration) {
    const sane = (cuts || [])
        .map(cut => ({
            start: Math.max(0, Math.min(Number(cut.start) || 0, duration)),
            end: Math.max(0, Math.min(Number(cut.end) || 0, duration))
        }))
        .filter(cut => cut.end - cut.start >= 0.03)
        .sort((a, b) => a.start - b.start);

    const merged = [];
    sane.forEach(cut => {
        if (!merged.length || cut.start > merged[merged.length - 1].end + 0.01) {
            merged.push({ start: cut.start, end: cut.end });
        } else {
            merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, cut.end);
        }
    });
    return merged;
}

function getAudioKeptSegments() {
    return getAudioKeptSegmentsForLayer('main');
}

function getLayerById(layerId) {
    return layerId === 'main' ? null : audioCutterState.layers.find(layer => layer.id === layerId);
}

function getLayerOffset(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? (audioCutterState.mainOffset || 0) : (layer?.offset || 0);
}

function getLayerOriginalDuration(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? (audioCutterState.originalDuration || 0) : (layer?.duration || 0);
}

function getLayerEditedDuration(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? (audioCutterState.duration || 0) : (layer?.editedDuration ?? layer?.duration ?? 0);
}

function getLayerCuts(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? audioCutterState.cuts : (layer?.cuts || []);
}

function setLayerCuts(layerId, cuts) {
    if (layerId === 'main') {
        audioCutterState.cuts = cuts;
    } else {
        const layer = getLayerById(layerId);
        if (layer) layer.cuts = cuts;
    }
}

function getLayerCutPoints(layerId) {
    const layer = getLayerById(layerId);
    return layerId === 'main' ? audioCutterState.cutPoints : (layer?.cutPoints || []);
}

function setLayerCutPoints(layerId, points) {
    if (layerId === 'main') {
        audioCutterState.cutPoints = points;
    } else {
        const layer = getLayerById(layerId);
        if (layer) layer.cutPoints = points;
    }
}

function getAudioKeptSegmentsForLayer(layerId) {
    const duration = getLayerOriginalDuration(layerId);
    const cuts = normalizeAudioCutsForDuration(getLayerCuts(layerId), duration);
    const segments = [];
    let cursor = 0;
    cuts.forEach(cut => {
        if (cut.start > cursor) {
            segments.push({ start: cursor, end: cut.start });
        }
        cursor = Math.max(cursor, cut.end);
    });
    if (cursor < duration) {
        segments.push({ start: cursor, end: duration });
    }
    return segments.filter(segment => segment.end - segment.start >= 0.03);
}

function recalcAudioEditedDuration() {
    audioCutterState.cuts = normalizeAudioCuts(audioCutterState.cuts);
    audioCutterState.duration = getAudioKeptSegments()
        .reduce((total, segment) => total + (segment.end - segment.start), 0);
    audioCutterState.playhead = clampAudioTime(audioCutterState.playhead);
}

function recalcLayerEditedDuration(layerId) {
    if (layerId === 'main') {
        recalcAudioEditedDuration();
        return;
    }
    const layer = getLayerById(layerId);
    if (!layer) return;
    layer.cuts = normalizeAudioCutsForDuration(layer.cuts || [], layer.duration || 0);
    layer.editedDuration = getAudioKeptSegmentsForLayer(layerId)
        .reduce((total, segment) => total + (segment.end - segment.start), 0);
}

function editedToOriginalTime(editedTime) {
    return editedToOriginalTimeForLayer('main', editedTime);
}

function editedToOriginalTimeForLayer(layerId, editedTime) {
    let remaining = clampAudioTime(editedTime);
    if (layerId !== 'main') {
        remaining = Math.min(Math.max(Number(editedTime) || 0, 0), getLayerEditedDuration(layerId));
    }
    const segments = getAudioKeptSegmentsForLayer(layerId);
    for (const segment of segments) {
        const len = segment.end - segment.start;
        if (remaining <= len) {
            return segment.start + remaining;
        }
        remaining -= len;
    }
    return segments.length ? segments[segments.length - 1].end : 0;
}

function originalToEditedTime(originalTime) {
    return originalToEditedTimeForLayer('main', originalTime);
}

function originalToEditedTimeForLayer(layerId, originalTime) {
    const t = Math.max(0, Number(originalTime) || 0);
    let edited = 0;
    for (const segment of getAudioKeptSegmentsForLayer(layerId)) {
        if (t <= segment.start) return edited;
        if (t <= segment.end) return edited + (t - segment.start);
        edited += segment.end - segment.start;
    }
    return getLayerEditedDuration(layerId);
}

function setAudioPlayhead(time, syncPlayer = true) {
    audioCutterState.playhead = clampAudioTime(time);
    ensureAudioPlayheadVisible();
    if (syncPlayer) {
        const player = document.getElementById('audio-cutter-player');
        if (player) {
            const mainLocalTime = audioCutterState.playhead - (audioCutterState.mainOffset || 0);
            player.currentTime = editedToOriginalTime(Math.max(0, Math.min(audioCutterState.duration, mainLocalTime)));
        }
    }
    updateAudioTimelineReadout();
    drawAudioWaveform();
}

function updateAudioTimelineReadout() {
    const readout = document.getElementById('audio-timeline-readout');
    const label = document.getElementById('audio-playhead-label');
    const zoomText = audioCutterState.zoom > 1 ? ` | Zoom ${audioCutterState.zoom.toFixed(1)}x` : '';
    const text = `${formatAudioTime(audioCutterState.playhead)} / ${formatAudioTime(getAudioTimelineDuration())}${zoomText}`;
    if (readout) readout.textContent = text;
    if (label) label.textContent = formatAudioTime(audioCutterState.playhead);
}

function updateAudioTransportButton() {
    const btn = document.getElementById('btn-audio-play');
    if (btn) {
        btn.textContent = audioCutterState.isPlaying ? 'Pause' : 'Play';
    }
}

function setAudioTimelineTool(tool) {
    audioCutterState.timelineTool = tool === 'hand' ? 'hand' : 'select';
    const timeline = document.getElementById('audio-tracks-timeline');
    if (timeline) {
        timeline.classList.toggle('hand-tool', audioCutterState.timelineTool === 'hand');
    }
    document.getElementById('btn-tool-select')?.classList.toggle('active', audioCutterState.timelineTool === 'select');
    document.getElementById('btn-tool-hand')?.classList.toggle('active', audioCutterState.timelineTool === 'hand');
}

function toggleAudioEditsPopover() {
    const popover = document.getElementById('audio-edits-popover');
    if (!popover) return;
    popover.style.display = popover.style.display === 'none' || !popover.style.display ? 'block' : 'none';
}

function openAudioExportPopup() {
    if (!audioCutterState.path) {
        showMessage('audio-cutter', 'Carregue a faixa principal antes de exportar.', 'error');
        return;
    }
    const modal = document.getElementById('audio-export-modal');
    if (modal) modal.style.display = 'flex';
}

function closeAudioExportPopup() {
    const modal = document.getElementById('audio-export-modal');
    if (modal) modal.style.display = 'none';
}

function dbToGain(db) {
    return Math.pow(10, (Number(db) || 0) / 20);
}

function getAudioLayerElement(layer) {
    let audio = document.getElementById(`audio-layer-${layer.id}`);
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-layer-${layer.id}`;
        audio.preload = 'auto';
        audio.style.display = 'none';
        document.body.appendChild(audio);
    }
    return audio;
}

function syncAudioLayerElement(layer) {
    const audio = getAudioLayerElement(layer);
    if (audio.src.indexOf(layer.previewUrl || '') === -1) {
        audio.src = layer.previewUrl;
        audio.load();
    }
    audio.volume = Math.min(1, Math.max(0, dbToGain(layer.volumeDb)));
    return audio;
}

function renderAudioLayersList() {
    const timeline = document.getElementById('audio-tracks-timeline');
    const playheadLabel = document.getElementById('audio-playhead-label');
    if (!timeline) return;

    const mainActive = audioCutterState.activeLayerId === 'main' ? ' active' : '';
    const mainLocked = audioCutterState.mainLocked ? ' locked' : '';
    const mainLockText = audioCutterState.mainLocked ? 'Lock' : 'Livre';
    const mainRow = `
        <div class="audio-track-row${mainActive}${mainLocked}" data-layer-id="main">
            <div class="audio-track-panel">
                <div class="audio-track-name">Principal</div>
                <div class="audio-track-meta">0 dB | ${mainLockText} | ${formatAudioTime(audioCutterState.mainOffset || 0)}</div>
                <button type="button" onclick="selectAudioLayer('main')">Editar</button>
                <button type="button" onclick="toggleAudioLayerLock('main')">${mainLockText}</button>
            </div>
            <canvas id="audio-waveform" class="track-waveform" data-layer-id="main" width="1200" height="180"></canvas>
        </div>
    `;

    const extraRows = audioCutterState.layers.map(layer => {
        const active = audioCutterState.activeLayerId === layer.id ? ' active' : '';
        const lockedClass = layer.locked ? ' locked' : '';
        const lockText = layer.locked ? 'Lock' : 'Livre';
        return `
            <div class="audio-track-row${active}${lockedClass}" data-layer-id="${layer.id}">
                <div class="audio-track-panel">
                    <div class="audio-track-name" title="${layer.name}">${layer.name}</div>
                    <div class="audio-track-meta">${layer.volumeDb} dB | ${lockText} | ${formatAudioTime(layer.offset || 0)}</div>
                    <input type="range" min="-36" max="12" step="1" value="${layer.volumeDb}" oninput="setAudioLayerVolume('${layer.id}', this.value)">
                    <button type="button" onclick="toggleAudioLayerLock('${layer.id}')">${lockText}</button>
                    <button type="button" onclick="removeAudioLayer('${layer.id}')">Remover</button>
                </div>
                <canvas id="waveform-${layer.id}" class="track-waveform" data-layer-id="${layer.id}" width="1200" height="120"></canvas>
            </div>
        `;
    }).join('');

    timeline.innerHTML = mainRow + extraRows;
    if (playheadLabel) timeline.appendChild(playheadLabel);
    drawAudioWaveform();
}

function getAudioWaveformData(layerId) {
    if (layerId === 'main') {
        return {
            peaks: audioCutterState.peaks,
            duration: audioCutterState.originalDuration,
            offset: audioCutterState.mainOffset || 0,
            color: '#F97316',
            cutPoints: audioCutterState.cutPoints,
            layerId: 'main'
        };
    }
    const idx = audioCutterState.layers.findIndex(layer => layer.id === layerId);
    const layer = audioCutterState.layers[idx];
    return {
        peaks: layer?.peaks || [],
        duration: layer?.duration || audioCutterState.duration,
        offset: layer?.offset || 0,
        color: ['#38BDF8', '#A78BFA', '#22C55E', '#F472B6'][Math.max(0, idx) % 4],
        cutPoints: layer?.cutPoints || [],
        layerId
    };
}

function drawSingleAudioWaveform(canvas) {
    if (!canvas) return;
    clampAudioView();
    const layerId = canvas.dataset.layerId || 'main';
    const data = getAudioWaveformData(layerId);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(300, Math.floor(canvas.clientWidth || 900));
    const height = Math.max(88, Math.floor(canvas.clientHeight || 112));
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, width, height);

    const mid = height / 2;
    const peaks = data.peaks;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    if (peaks.length) {
        ctx.fillStyle = data.color;
        const columns = Math.min(width, 1200);
        const barWidth = width / columns;
        for (let i = 0; i < columns; i++) {
            const editedTime = audioCutterState.viewStart + (i / Math.max(1, columns - 1)) * getAudioVisibleDuration();
            const localTime = editedTime - (data.offset || 0);
            if (localTime < 0 || localTime > getLayerEditedDuration(layerId)) {
                continue;
            }
            const sourceTime = editedToOriginalTimeForLayer(layerId, localTime);
            const peakIndex = Math.min(
                peaks.length - 1,
                Math.max(0, Math.floor((sourceTime / Math.max(0.001, data.duration || 1)) * peaks.length))
            );
            const peak = peaks[peakIndex] || 0;
            const h = Math.max(1, peak * (height * 0.82));
            const x = i * barWidth;
            ctx.fillRect(x, mid - h / 2, Math.max(1, barWidth - 1), h);
        }
    } else {
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('Carregando waveform...', 18, 30);
    }

    const visibleDuration = getAudioVisibleDuration() || 1;
    if (data.cutPoints?.length) {
        data.cutPoints.forEach(point => {
            const x = (((point + (data.offset || 0)) - audioCutterState.viewStart) / visibleDuration) * width;
            if (x < 0 || x > width) return;
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        });
    }

    const playheadX = ((audioCutterState.playhead - audioCutterState.viewStart) / visibleDuration) * width;
    ctx.strokeStyle = audioCutterState.playheadSelected ? '#38BDF8' : '#D1D5DB';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.fillStyle = audioCutterState.playheadSelected ? '#38BDF8' : '#D1D5DB';
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX - 7, 10);
    ctx.lineTo(playheadX + 7, 10);
    ctx.closePath();
    ctx.fill();
}

function drawAudioWaveform() {
    document.querySelectorAll('.track-waveform').forEach(canvas => drawSingleAudioWaveform(canvas));
}

async function loadAudioWaveform(url) {
    if (!audioCutterState.peaks.length) {
        drawAudioWaveform();
    }
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioCtx();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channel = audioBuffer.getChannelData(0);
        const samples = 900;
        const blockSize = Math.max(1, Math.floor(channel.length / samples));
        const peaks = [];
        for (let i = 0; i < samples; i++) {
            let sum = 0;
            const start = i * blockSize;
            const end = Math.min(channel.length, start + blockSize);
            for (let j = start; j < end; j++) {
                sum += Math.abs(channel[j]);
            }
            peaks.push(Math.min(1, sum / Math.max(1, end - start) * 2.6));
        }
        audioCutterState.peaks = peaks;
        if (audioCtx.close) audioCtx.close();
    } catch (err) {
        showMessage('audio-cutter', 'Nao foi possivel desenhar a waveform, mas o corte ainda pode ser feito pelos tempos.', 'error');
    }
    drawAudioWaveform();
}

function selectAudioCutterFile() {
    window.pywebview.api.select_file('audio-cutter').then(result => {
        if (result.success) loadAudioCutterPath(result.path);
    });
}

function loadAudioCutterPath(path) {
    const result = { path };
    {
        playExecute();
        const selected = document.getElementById('audio-cutter-selected');
        if (selected) {
            selected.textContent = `Preparando preview: ${result.path}`;
            selected.style.color = '#F59E0B';
        }
        document.getElementById('log-audio-cutter').textContent = '';

        window.pywebview.api.audio_cutter_prepare(result.path).then(preview => {
            if (!preview.success) {
                showMessage('audio-cutter', preview.error || 'Nao foi possivel preparar o audio.', 'error');
                if (selected) selected.style.color = '#EF4444';
                return;
            }

            selectedPaths['audio-cutter'] = preview.path;
            selectedTypes['audio-cutter'] = 'file';
            audioCutterState.path = preview.path;
            audioCutterState.previewUrl = preview.preview_url;
            audioCutterState.previewFallbackUrl = preview.preview_fallback_url || null;
            audioCutterState.originalDuration = Number(preview.duration) || 0;
            audioCutterState.duration = audioCutterState.originalDuration;
            audioCutterState.peaks = Array.isArray(preview.peaks) ? preview.peaks : [];
            audioCutterState.cuts = [];
            audioCutterState.cutPoints = [];
            audioCutterState.layers.forEach(layer => {
                const el = document.getElementById(`audio-layer-${layer.id}`);
                if (el) el.remove();
            });
            audioCutterState.layers = [];
            audioCutterState.activeLayerId = 'main';
            audioCutterState.mainLocked = false;
            audioCutterState.mainOffset = 0;
            audioCutterState.history = [];
            audioCutterState.playhead = 0;
            audioCutterState.zoom = 1;
            audioCutterState.viewStart = 0;
            audioCutterState.isPlaying = false;

            if (selected) {
                selected.textContent = `Arquivo: ${preview.file_name} | Duracao: ${formatAudioTime(audioCutterState.duration)}`;
                selected.style.color = '#10B981';
            }

            const editor = document.getElementById('audio-editor');
            if (editor) editor.style.display = 'block';
            const player = document.getElementById('audio-cutter-player');
            if (player) {
                player.pause();
                player.preload = 'auto';
                player.src = preview.preview_url;
                player.load();
            }
            document.getElementById('btn-audio-cutter').disabled = true;
            renderAudioLayersList();
            renderAudioCutsList();
            updateAudioTimelineReadout();
            updateAudioTransportButton();
            drawAudioWaveform();
            if (!audioCutterState.peaks.length) {
                loadAudioWaveform(preview.preview_url);
            }
            showMessage('audio-cutter', 'Áudio carregado. Use a agulha para editar a timeline.', 'success');
        });
    }
}

function addAudioLayer() {
    if (!audioCutterState.path) {
        showMessage('audio-cutter', 'Carregue a faixa principal primeiro.', 'error');
        return;
    }

    window.pywebview.api.select_file('audio-cutter-layer').then(result => {
        if (!result.success) {
            showMessage('audio-cutter', result.error || 'Erro ao selecionar faixa', 'error');
            return;
        }

        showMessage('audio-cutter', `Preparando faixa extra: ${result.path}`, 'success');
        window.pywebview.api.audio_cutter_prepare(result.path).then(preview => {
            if (!preview.success) {
                showMessage('audio-cutter', preview.error || 'Nao foi possivel preparar a faixa extra.', 'error');
                return;
            }

            const layer = {
                id: `layer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                path: preview.path,
                name: preview.file_name,
                previewUrl: preview.preview_url,
                fallbackUrl: preview.preview_fallback_url || '',
                duration: Number(preview.duration) || 0,
                editedDuration: Number(preview.duration) || 0,
                peaks: Array.isArray(preview.peaks) ? preview.peaks : [],
                cuts: [],
                cutPoints: [],
                offset: audioCutterState.playhead || 0,
                volumeDb: -12,
                locked: true
            };
            audioCutterState.layers.push(layer);
            syncAudioLayerElement(layer);
            renderAudioLayersList();
            document.getElementById('btn-audio-cutter').disabled = false;
            showMessage('audio-cutter', `Faixa adicionada: ${layer.name}`, 'success');
        });
    });
}

function selectAudioLayer(layerId) {
    audioCutterState.activeLayerId = layerId;
    renderAudioLayersList();
}

function setAudioLayerVolume(layerId, value) {
    const layer = audioCutterState.layers.find(item => item.id === layerId);
    if (!layer) return;
    layer.volumeDb = Math.max(-36, Math.min(12, Number(value) || 0));
    const audio = syncAudioLayerElement(layer);
    audio.volume = Math.min(1, Math.max(0, dbToGain(layer.volumeDb)));
    renderAudioLayersList();
}

function toggleAudioLayerLock(layerId) {
    if (layerId === 'main') {
        audioCutterState.mainLocked = !audioCutterState.mainLocked;
        renderAudioLayersList();
        return;
    }
    const layer = audioCutterState.layers.find(item => item.id === layerId);
    if (!layer) return;
    layer.locked = !layer.locked;
    renderAudioLayersList();
}

function removeAudioLayer(layerId) {
    const idx = audioCutterState.layers.findIndex(item => item.id === layerId);
    if (idx < 0) return;
    const [layer] = audioCutterState.layers.splice(idx, 1);
    const audio = document.getElementById(`audio-layer-${layer.id}`);
    if (audio) audio.remove();
    if (audioCutterState.activeLayerId === layerId) {
        audioCutterState.activeLayerId = 'main';
    }
    renderAudioLayersList();
    document.getElementById('btn-audio-cutter').disabled = !hasAudioEdits();
}

function saveAudioHistory() {
    audioCutterState.history.push({
        cuts: audioCutterState.cuts.map(cut => ({ ...cut })),
        cutPoints: [...audioCutterState.cutPoints],
        layers: audioCutterState.layers.map(layer => ({
            id: layer.id,
            cuts: (layer.cuts || []).map(cut => ({ ...cut })),
            cutPoints: [...(layer.cutPoints || [])],
            editedDuration: layer.editedDuration ?? layer.duration
        })),
        playhead: audioCutterState.playhead
    });
    if (audioCutterState.history.length > 50) {
        audioCutterState.history.shift();
    }
}

function bladeAudioAtPlayhead() {
    if (!audioCutterState.path) {
        showMessage('audio-cutter', 'Selecione um audio primeiro.', 'error');
        return;
    }
    const layerId = audioCutterState.activeLayerId;
    if (isAudioLayerLocked(layerId)) {
        showMessage('audio-cutter', layerId === 'main' ? 'A faixa principal esta bloqueada.' : 'Essa camada esta bloqueada.', 'error');
        return;
    }
    const offset = getLayerOffset(layerId);
    const editedDuration = getLayerEditedDuration(layerId);
    const point = Math.min(Math.max(audioCutterState.playhead - offset, 0), editedDuration || 0);
    if (point <= 0 || point >= editedDuration) {
        return;
    }
    const points = getLayerCutPoints(layerId);
    if (points.some(existing => Math.abs(existing - point) < 0.03)) {
        return;
    }
    setLayerCutPoints(layerId, [...points, point].sort((a, b) => a - b));
    renderAudioCutsList();
    drawAudioWaveform();
}

function editedRangeToOriginalCuts(startEdited, endEdited, layerId = 'main') {
    const start = Math.min(startEdited, endEdited);
    const end = Math.max(startEdited, endEdited);
    if (end - start < 0.03) return [];

    const result = [];
    let editedCursor = 0;
    for (const segment of getAudioKeptSegmentsForLayer(layerId)) {
        const segLen = segment.end - segment.start;
        const segEditedStart = editedCursor;
        const segEditedEnd = editedCursor + segLen;
        const overlapStart = Math.max(start, segEditedStart);
        const overlapEnd = Math.min(end, segEditedEnd);
        if (overlapEnd - overlapStart >= 0.03) {
            result.push({
                start: segment.start + (overlapStart - segEditedStart),
                end: segment.start + (overlapEnd - segEditedStart)
            });
        }
        editedCursor = segEditedEnd;
    }
    return result;
}

function applyAudioRippleDelete(startEdited, endEdited) {
    const start = Math.min(startEdited, endEdited);
    const end = Math.max(startEdited, endEdited);
    const removedLen = end - start;
    if (!audioCutterState.path || removedLen < 0.03) return;
    const layerId = audioCutterState.activeLayerId;
    if (isAudioLayerLocked(layerId)) {
        showMessage('audio-cutter', layerId === 'main' ? 'A faixa principal esta bloqueada.' : 'Essa camada esta bloqueada.', 'error');
        return;
    }

    const newCuts = editedRangeToOriginalCuts(start, end, layerId);
    if (!newCuts.length) return;

    saveAudioHistory();
    const originalDuration = getLayerOriginalDuration(layerId);
    setLayerCuts(layerId, normalizeAudioCutsForDuration([...getLayerCuts(layerId), ...newCuts], originalDuration));
    const newPoints = getLayerCutPoints(layerId)
        .filter(point => point < start || point > end)
        .map(point => point > end ? point - removedLen : point);
    if (!newPoints.some(point => Math.abs(point - start) < 0.03) && start > 0) {
        newPoints.push(start);
    }
    setLayerCutPoints(layerId, newPoints.sort((a, b) => a - b));
    recalcLayerEditedDuration(layerId);
    setAudioPlayhead(start + getLayerOffset(layerId));
    renderAudioCutsList();
    renderAudioLayersList();
    document.getElementById('btn-audio-cutter').disabled = !hasAudioEdits();
    showMessage('audio-cutter', `Corte aplicado: ${formatAudioTime(start)} - ${formatAudioTime(end)}`, 'success');
}

function rippleDeleteAudioLeft() {
    const layerId = audioCutterState.activeLayerId;
    const playhead = Math.min(Math.max(audioCutterState.playhead - getLayerOffset(layerId), 0), getLayerEditedDuration(layerId) || 0);
    const previous = [...getLayerCutPoints(layerId)].reverse().find(point => point < playhead - 0.03);
    applyAudioRippleDelete(previous ?? 0, playhead);
}

function rippleDeleteAudioRight() {
    const layerId = audioCutterState.activeLayerId;
    const playhead = Math.min(Math.max(audioCutterState.playhead - getLayerOffset(layerId), 0), getLayerEditedDuration(layerId) || 0);
    const next = getLayerCutPoints(layerId).find(point => point > playhead + 0.03);
    applyAudioRippleDelete(playhead, next ?? getLayerEditedDuration(layerId));
}

function undoAudioEdit() {
    const last = audioCutterState.history.pop();
    if (!last) return;
    audioCutterState.cuts = last.cuts;
    audioCutterState.cutPoints = last.cutPoints;
    (last.layers || []).forEach(saved => {
        const layer = getLayerById(saved.id);
        if (layer) {
            layer.cuts = saved.cuts || [];
            layer.cutPoints = saved.cutPoints || [];
            layer.editedDuration = saved.editedDuration ?? layer.duration;
        }
    });
    recalcAudioEditedDuration();
    setAudioPlayhead(last.playhead);
    renderAudioCutsList();
    renderAudioLayersList();
    document.getElementById('btn-audio-cutter').disabled = !hasAudioEdits();
}

function clearAudioCuts() {
    const player = document.getElementById('audio-cutter-player');
    if (player) player.pause();
    audioCutterState.isPlaying = false;
    updateAudioTransportButton();
    saveAudioHistory();
    audioCutterState.cuts = [];
    audioCutterState.cutPoints = [];
    audioCutterState.layers.forEach(layer => {
        layer.cuts = [];
        layer.cutPoints = [];
        layer.editedDuration = layer.duration;
    });
    audioCutterState.activeLayerId = 'main';
    audioCutterState.duration = audioCutterState.originalDuration || 0;
    audioCutterState.playhead = 0;
    audioCutterState.zoom = 1;
    audioCutterState.viewStart = 0;
    renderAudioCutsList();
    renderAudioLayersList();
    setAudioPlayhead(0);
    document.getElementById('btn-audio-cutter').disabled = audioCutterState.layers.length === 0;
}

function renderAudioCutsList() {
    const list = document.getElementById('audio-cuts-list');
    if (!list) return;
    const rows = [];
    audioCutterState.cuts.forEach((cut, index) => {
        rows.push(`<div class="audio-cut-item"><span>Principal ${index + 1}. ${formatAudioTime(cut.start)} - ${formatAudioTime(cut.end)}</span></div>`);
    });
    audioCutterState.layers.forEach(layer => {
        (layer.cuts || []).forEach((cut, index) => {
            rows.push(`<div class="audio-cut-item"><span>${layer.name} ${index + 1}. ${formatAudioTime(cut.start)} - ${formatAudioTime(cut.end)}</span></div>`);
        });
    });
    if (!rows.length) {
        list.innerHTML = '<div class="selected-info">Nenhuma edicao aplicada ainda.</div>';
        return;
    }
    list.innerHTML = rows.join('');
}

function hasAudioEdits() {
    return audioCutterState.cuts.length > 0
        || audioCutterState.layers.length > 0
        || audioCutterState.layers.some(layer => (layer.cuts || []).length > 0);
}

async function toggleAudioTimelinePlayback() {
    const player = document.getElementById('audio-cutter-player');
    if (!player || !audioCutterState.path) {
        showMessage('audio-cutter', 'Selecione um audio primeiro.', 'error');
        return;
    }

    if (audioCutterState.isPlaying) {
        player.pause();
        return;
    }

    if (audioCutterState.playhead >= audioCutterState.duration - 0.03) {
        setAudioPlayhead(0);
    }

    if (!player.src && audioCutterState.previewUrl) {
        player.src = audioCutterState.previewUrl;
        player.load();
    }

    const mainLocalTime = Math.max(0, Math.min(audioCutterState.duration, audioCutterState.playhead - (audioCutterState.mainOffset || 0)));
    player.currentTime = editedToOriginalTime(mainLocalTime);
    audioCutterState.layers.forEach(layer => {
        const audio = syncAudioLayerElement(layer);
        audio.currentTime = Math.min(Math.max(0, audioCutterState.playhead - (layer.offset || 0)), Math.max(0, layer.duration - 0.02));
    });
    try {
        const playResult = player.play();
        if (playResult && typeof playResult.then === 'function') {
            await playResult;
        }
        audioCutterState.layers.forEach(layer => {
            const audio = syncAudioLayerElement(layer);
            audio.play().catch(() => {});
        });
        audioCutterState.isPlaying = true;
        updateAudioTransportButton();
    } catch (err) {
        if (audioCutterState.previewFallbackUrl && player.src.indexOf(audioCutterState.previewFallbackUrl) === -1) {
            player.src = audioCutterState.previewFallbackUrl;
            player.load();
            player.currentTime = editedToOriginalTime(mainLocalTime);
            try {
                const fallbackPlay = player.play();
                if (fallbackPlay && typeof fallbackPlay.then === 'function') {
                    await fallbackPlay;
                }
                audioCutterState.isPlaying = true;
                updateAudioTransportButton();
                return;
            } catch (fallbackErr) {
                err = fallbackErr;
            }
        }
        audioCutterState.isPlaying = false;
        updateAudioTransportButton();
        showMessage('audio-cutter', `Nao consegui iniciar o playback: ${err.message || err}`, 'error');
    }
}

function exportAudioCuts() {
    if (!audioCutterState.path) {
        showMessage('audio-cutter', 'Carregue a faixa principal antes de salvar.', 'error');
        return;
    }
    if (!hasAudioEdits()) {
        showMessage('audio-cutter', 'Adicione pelo menos um corte ou uma faixa extra antes de salvar.', 'error');
        return;
    }
    const format = document.querySelector('input[name="audio-cutter-format"]:checked').value;
    const extraTracks = audioCutterState.layers.map(layer => ({
        path: layer.path,
        name: layer.name,
        volumeDb: layer.volumeDb,
        locked: layer.locked,
        offset: layer.offset || 0,
        cuts: layer.cuts || []
    }));
    playExecute();
    document.getElementById('btn-audio-cutter').disabled = true;
    document.getElementById('progress-audio-cutter').style.display = 'flex';
    document.getElementById('progress-fill-audio-cutter').style.width = '35%';
    document.getElementById('progress-text-audio-cutter').textContent = 'Processando...';
    showMessage('audio-cutter', 'Exportando audio editado...', 'success');
    window.pywebview.api.audio_cutter_export(audioCutterState.path, audioCutterState.cuts, format, extraTracks, audioCutterState.mainOffset || 0);
}

function updateAudioCutterProgress(data) {
    if (data.log) {
        showMessage('audio-cutter', data.log, 'success');
    }
    if (data.error) {
        document.getElementById('progress-audio-cutter').style.display = 'none';
        document.getElementById('btn-audio-cutter').disabled = audioCutterState.cuts.length === 0;
        showMessage('audio-cutter', data.error, 'error');
    }
    if (data.complete) {
        document.getElementById('progress-fill-audio-cutter').style.width = '100%';
        document.getElementById('progress-text-audio-cutter').textContent = 'Concluido';
        document.getElementById('btn-audio-cutter').disabled = false;
        playConcluido();
        showMessage('audio-cutter', `Audio salvo: ${data.output_path}`, 'success');
    }
}

function syncAudioPlaybackPosition() {
    const player = document.getElementById('audio-cutter-player');
    if (!player || !audioCutterState.path || !audioCutterState.isPlaying) return;

    const segments = getAudioKeptSegments();
    const original = player.currentTime;
    const currentSegment = segments.find(segment => original >= segment.start - 0.02 && original <= segment.end + 0.02);
    if (!currentSegment) {
        const next = segments.find(segment => segment.start > original);
        if (next) {
            player.currentTime = next.start;
            setAudioPlayhead(originalToEditedTime(next.start) + (audioCutterState.mainOffset || 0), false);
            syncBackgroundLayersToPlayhead();
        } else {
            player.pause();
            pauseBackgroundLayers();
            audioCutterState.isPlaying = false;
            updateAudioTransportButton();
            setAudioPlayhead((audioCutterState.mainOffset || 0) + audioCutterState.duration, false);
        }
        return;
    }

    if (original >= currentSegment.end - 0.02) {
        const next = segments.find(segment => segment.start > currentSegment.end + 0.01);
        if (next) {
            player.currentTime = next.start;
            setAudioPlayhead(originalToEditedTime(next.start) + (audioCutterState.mainOffset || 0), false);
            syncBackgroundLayersToPlayhead();
        }
    } else {
        setAudioPlayhead(originalToEditedTime(original) + (audioCutterState.mainOffset || 0), false);
        syncBackgroundLayersToPlayhead(0.35);
    }
}

function pauseBackgroundLayers() {
    audioCutterState.layers.forEach(layer => {
        const audio = document.getElementById(`audio-layer-${layer.id}`);
        if (audio) audio.pause();
    });
}

function syncBackgroundLayersToPlayhead(threshold = 0.05) {
    audioCutterState.layers.forEach(layer => {
        const audio = syncAudioLayerElement(layer);
        const target = Math.min(Math.max(0, audioCutterState.playhead - (layer.offset || 0)), Math.max(0, layer.duration - 0.02));
        if (Math.abs(audio.currentTime - target) > threshold) {
            audio.currentTime = target;
        }
    });
}

function zoomAudioWaveform(event) {
    if (!event.altKey || !audioCutterState.duration) return;
    event.preventDefault();

    const canvas = event.target.closest('.track-waveform') || document.getElementById('audio-waveform');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xRatio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const anchorTime = audioCutterState.viewStart + xRatio * getAudioVisibleDuration();
    const factor = event.deltaY < 0 ? 1.22 : 1 / 1.22;

    audioCutterState.zoom = Math.min(32, Math.max(1, audioCutterState.zoom * factor));
    const nextVisibleDuration = getAudioVisibleDuration();
    audioCutterState.viewStart = anchorTime - xRatio * nextVisibleDuration;
    clampAudioView();
    updateAudioTimelineReadout();
    drawAudioWaveform();
}

function getLayerAtEvent(event) {
    const row = event.target.closest('.audio-track-row');
    return row?.dataset?.layerId || 'main';
}

function getCanvasDeltaTime(event) {
    const canvas = event.target.closest('.track-waveform') || document.getElementById('audio-waveform');
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return ((event.clientX - audioCutterState.dragStartX) / Math.max(1, rect.width)) * getAudioVisibleDuration();
}

function isPointerOnPlayhead(event) {
    const canvas = event.target.closest('.track-waveform') || document.getElementById('audio-waveform');
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const visibleDuration = getAudioVisibleDuration() || 1;
    const x = ((audioCutterState.playhead - audioCutterState.viewStart) / visibleDuration) * rect.width;
    return Math.abs((event.clientX - rect.left) - x) <= 10;
}

function isAudioLayerLocked(layerId) {
    if (layerId === 'main') return audioCutterState.mainLocked;
    return !!audioCutterState.layers.find(layer => layer.id === layerId)?.locked;
}

function setLayerOffset(layerId, offset) {
    const safeOffset = Math.max(0, Number(offset) || 0);
    if (layerId === 'main') {
        audioCutterState.mainOffset = safeOffset;
    } else {
        const layer = audioCutterState.layers.find(item => item.id === layerId);
        if (layer) layer.offset = safeOffset;
    }
    updateAudioTimelineReadout();
    renderAudioLayersList();
}

document.addEventListener('DOMContentLoaded', () => {
    const timeline = document.getElementById('audio-tracks-timeline');
    const player = document.getElementById('audio-cutter-player');

    if (timeline) {
        timeline.addEventListener('wheel', event => {
            if (event.target.closest('.track-waveform')) {
                zoomAudioWaveform(event);
            }
        }, { passive: false });
        timeline.addEventListener('mousedown', event => {
            if (!event.target.closest('.track-waveform')) return;
            if (!audioCutterState.duration) return;
            audioCutterState.dragStartX = event.clientX;

            if (isPointerOnPlayhead(event)) {
                audioCutterState.playheadSelected = true;
                audioCutterState.dragMode = 'playhead';
                setAudioPlayhead(timeFromCanvasEvent(event));
                drawAudioWaveform();
                return;
            }

            if (audioCutterState.playheadSelected) {
                audioCutterState.dragMode = 'playhead';
                setAudioPlayhead(timeFromCanvasEvent(event));
                return;
            }

            if (audioCutterState.timelineTool === 'hand') {
                audioCutterState.dragMode = 'pan';
                audioCutterState.dragStartView = audioCutterState.viewStart;
                timeline.classList.add('dragging-view');
                return;
            }

            const layerId = getLayerAtEvent(event);
            audioCutterState.activeLayerId = layerId;
            renderAudioLayersList();
            if (isAudioLayerLocked(layerId)) {
                setAudioPlayhead(timeFromCanvasEvent(event));
                return;
            }
            audioCutterState.dragMode = 'layer';
            audioCutterState.dragLayerId = layerId;
            audioCutterState.dragStartOffset = layerId === 'main'
                ? (audioCutterState.mainOffset || 0)
                : (audioCutterState.layers.find(layer => layer.id === layerId)?.offset || 0);
            event.target.closest('.audio-track-row')?.classList.add('dragging');
        });
        timeline.addEventListener('mousemove', event => {
            if (!event.target.closest('.track-waveform')) return;
            if (audioCutterState.dragMode === 'pan') {
                const delta = getCanvasDeltaTime(event);
                audioCutterState.viewStart = audioCutterState.dragStartView - delta;
                clampAudioView();
                updateAudioTimelineReadout();
                drawAudioWaveform();
                return;
            }
            if (audioCutterState.dragMode === 'playhead') {
                setAudioPlayhead(timeFromCanvasEvent(event));
                return;
            }
            if (audioCutterState.dragMode === 'layer') {
                const delta = getCanvasDeltaTime(event);
                setLayerOffset(audioCutterState.dragLayerId, audioCutterState.dragStartOffset + delta);
            }
        });
        window.addEventListener('mouseup', () => {
            if (!audioCutterState.dragMode) return;
            document.querySelectorAll('.audio-track-row.dragging').forEach(row => row.classList.remove('dragging'));
            timeline.classList.remove('dragging-view');
            audioCutterState.dragMode = null;
            audioCutterState.dragLayerId = null;
        });
    }

    if (player) {
        player.addEventListener('timeupdate', syncAudioPlaybackPosition);
        player.addEventListener('play', () => {
            audioCutterState.isPlaying = true;
            updateAudioTransportButton();
        });
        player.addEventListener('pause', () => {
            audioCutterState.isPlaying = false;
            pauseBackgroundLayers();
            updateAudioTransportButton();
        });
        player.addEventListener('ended', () => {
            audioCutterState.isPlaying = false;
            pauseBackgroundLayers();
            updateAudioTransportButton();
            setAudioPlayhead(getAudioTimelineDuration(), false);
        });
    }

    document.addEventListener('mousedown', event => {
        if (!document.getElementById('page-audio-cutter')?.classList.contains('active')) return;
        if (event.target.closest('#audio-tracks-timeline')) return;
        if (!event.target.closest('#audio-edits-popover') && !event.target.closest('.rail-tool')) {
            const popover = document.getElementById('audio-edits-popover');
            if (popover) popover.style.display = 'none';
        }
        if (!audioCutterState.playheadSelected) return;
        audioCutterState.playheadSelected = false;
        drawAudioWaveform();
    });

    document.addEventListener('keydown', event => {
        if (!document.getElementById('page-audio-cutter')?.classList.contains('active')) return;
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) return;
        const key = event.key.toLowerCase();
        if (key === ' ') {
            event.preventDefault();
            toggleAudioTimelinePlayback();
        } else if (key === 'v') {
            event.preventDefault();
            setAudioTimelineTool('select');
        } else if (key === 'm') {
            event.preventDefault();
            setAudioTimelineTool('hand');
        } else if (key === 'e') {
            event.preventDefault();
            bladeAudioAtPlayhead();
        } else if (key === 'q') {
            event.preventDefault();
            rippleDeleteAudioLeft();
        } else if (key === 'w') {
            event.preventDefault();
            rippleDeleteAudioRight();
        }
    });

    window.addEventListener('resize', drawAudioWaveform);
    setAudioTimelineTool('select');
});

// =========================
// Converter Imagem
// =========================

function runConverterImagem() {
    const path = _exigirSelecao('converter-imagem');
    if (!path) return;
    const format = document.querySelector('input[name="img-format"]:checked').value;
    uiIniciar('converter-imagem');
    window.pywebview.api.converter_imagem(path, format);
}

// Callback para atualizar progresso do conversor de imagem
function updateConverterImagemProgress(data) {
    uiAtualizar('converter-imagem', data);
}


// =========================
// Favicon Generator
// =========================

function runFaviconGenerator() {
    const imagePath = _exigirSelecao('favicon', 'Escolha a imagem do logo primeiro.');
    if (!imagePath) return;
    uiIniciar('favicon');
    window.pywebview.api.favicon_generator(imagePath, _el('favicon-site-name').value, _el('favicon-theme-color').value);
}


function updateFaviconProgress(data) {
    uiAtualizar('favicon', data);
}


// =========================
// Compressor de Imagem
// =========================


function runCompressorImagem() {
    const path = _exigirSelecao('compressor-imagem');
    if (!path) return;
    uiIniciar('compressor-imagem');
    window.pywebview.api.compressor_imagem(path, _el('compressor-img-fullhd')?.checked || false);
}


function updateCompressorImagemProgress(data) {
    uiAtualizar('compressor-imagem', data);
}


// =========================
// Compressor de Vídeo
// =========================

function updateCompressorVideoProgress(data) {
    uiAtualizar('compressor-video', data);
}


function runCompressorVideo() {
    const path = _exigirSelecao('compressor-video');
    if (!path) return;
    const gpu = document.querySelector('input[name="video-gpu"]:checked').value;
    const mode = document.querySelector('input[name="video-mode"]:checked').value;
    const qualidade = document.querySelector('input[name="video-qualidade"]:checked').value;
    uiIniciar('compressor-video', 'Analisando vídeo(s)...');
    window.pywebview.api.compressor_video(path, mode, gpu, qualidade);
}


// =========================
// Video Converter
// =========================

function runVideoConverter() {
    const path = _exigirSelecao('video-converter');
    if (!path) return;
    const format = document.querySelector('input[name="video-format"]:checked').value;
    uiIniciar('video-converter');
    window.pywebview.api.video_converter(path, format);
}


function updateVideoConverterProgress(data) {
    uiAtualizar('video-converter', data);
}


// =========================
// Video Downloader
// =========================

function getVideoInfo() {
    const url = _el('video-url').value.trim();
    if (!url) return toast('Cole o link do vídeo primeiro.', 'erro');
    const card = _el('video-info');
    card.style.display = 'flex';
    _el('video-title').textContent = 'Verificando...';
    _el('video-thumbnail').style.display = 'none';
    ['video-duration', 'video-provider', 'video-size'].forEach(id => _el(id).textContent = '');

    window.pywebview.api.video_downloader_info(url).then(result => {
        if (!result.success) {
            card.style.display = 'none';
            return toast(result.error || 'Não foi possível ler o link.', 'erro', 8000);
        }
        const info = result.info;
        const thumbEl = _el('video-thumbnail');
        _el('video-title').textContent = info.title || 'Sem título';
        thumbEl.style.display = 'block';
        thumbEl.onerror = function () {
            if (info.thumbnail_url && this.src !== info.thumbnail_url) this.src = info.thumbnail_url;
            else this.style.display = 'none';
        };
        thumbEl.src = info.thumbnail || info.thumbnail_url || '';
        const d = Number(info.duration) || 0;
        const h = Math.floor(d / 3600), m = Math.floor(d % 3600 / 60), s = d % 60;
        _el('video-duration').textContent = d ? (h ? `${h}:${String(m).padStart(2, '0')}` : m) + `:${String(s).padStart(2, '0')}` : '';
        _el('video-provider').textContent = info.provider || '';
        _el('video-size').textContent = info.filesize_mb > 0 ? `~${info.filesize_mb} MB` : '';
    }).catch(err => {
        card.style.display = 'none';
        toast('Erro: ' + err, 'erro');
    });
}


function runVideoDownloader() {
    if (_rodando['video-downloader']) return;
    const url = _el('video-url').value.trim();
    if (!url) return toast('Cole o link do vídeo primeiro.', 'erro');
    const formato = document.querySelector('input[name="vd-format"]:checked').value;
    const qualidade = document.querySelector('input[name="vd-qualidade"]:checked').value;
    uiIniciar('video-downloader', 'Conectando...');
    window.pywebview.api.video_downloader(url, selectedPaths['video-downloader'] || '', formato, qualidade);
}


function updateVideoDownloaderProgress(data) {
    uiAtualizar('video-downloader', data);
}


// =========================
// Web Scraper
// =========================

function selectScraperDestino() {
    window.pywebview.api.select_folder('scraper').then(result => {
        if (result.success) {
            document.getElementById('scraper-destino').value = result.path;
        }
    });
}

function runWebScraperAnalyze() {
    const url = _el('scraper-url').value.trim();
    if (!url) return toast('Digite o endereço da página.', 'erro');
    _el('scraper-result-box').style.display = 'none';
    toast('Analisando a página...', 'info', 2500);
    window.pywebview.api.web_scraper_analyze(url).then(result => {
        if (!result || !result.success) {
            return toast((result && result.error) || 'Falha ao analisar a página', 'erro', 8000);
        }
        scraperLastAnalyzedUrl = url;
        _el('scraper-result-box').style.display = 'flex';
        _el('scraper-count-images').innerHTML = `${ico('image')}<b>${result.qtd_imagens || 0}</b> imagens`;
        _el('scraper-count-videos').innerHTML = `${ico('film')}<b>${result.qtd_videos || 0}</b> vídeos`;
    }).catch(err => toast('Erro ao analisar: ' + err, 'erro'));
}


function runWebScraperDownload() {
    if (_rodando['web-scraper']) return;
    const url = _el('scraper-url').value.trim();
    const destino = _el('scraper-destino').value || '';
    const mode = document.querySelector('input[name="scraper-download-mode"]:checked').value;
    if (!url) return toast('Digite o endereço da página.', 'erro');
    if (!scraperLastAnalyzedUrl || scraperLastAnalyzedUrl !== url) return toast('Clique em Analisar antes de baixar.', 'erro');
    if (!destino) return toast('Escolha a pasta onde salvar.', 'erro');
    uiIniciar('web-scraper', 'Baixando...');
    window.pywebview.api.web_scraper_download(url, mode, destino);
}


function updateWebScraperProgress(data) {
    uiAtualizar('web-scraper', data);
}


// =========================
// Transcrever Áudio
// =========================

function runTranscreverAudio() {
    const path = _exigirSelecao('transcrever-audio');
    if (!path) return;
    const model = document.querySelector('input[name="whisper-model"]:checked').value;
    uiIniciar('transcrever-audio', 'Carregando modelo...');
    window.pywebview.api.transcrever_audio(path, model, _el('whisper-language').value);
}


let _transcricaoPastaOrigem = '';

function updateTranscreverAudioProgress(data) {
    uiAtualizar('transcrever-audio', data);
    if (data.complete && !data.error && data.texto && data.texto.trim()) {
        _transcricaoPastaOrigem = data.pasta_origem || '';
        abrirModalTranscricao(data.texto);
    }
}


function abrirModalTranscricao(texto) {
    document.getElementById('transcricao-modal-texto').value = texto;
    document.getElementById('modal-transcricao').style.display = 'flex';
}

function fecharModalTranscricao(event) {
    if (event && event.target !== document.getElementById('modal-transcricao')) return;
    document.getElementById('modal-transcricao').style.display = 'none';
}

function copiarTranscricao() {
    const texto = document.getElementById('transcricao-modal-texto').value;
    navigator.clipboard.writeText(texto).then(() => {
        const btn = document.querySelector('.transcricao-modal-footer .btn-secondary');
        const orig = btn.innerHTML;
        btn.innerHTML = ico('check') + 'Copiado';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    });
}

function salvarTranscricaoTxt() {
    const texto = document.getElementById('transcricao-modal-texto').value;
    window.pywebview.api.transcrever_salvar_txt(texto, _transcricaoPastaOrigem);
}

// =========================
// Remover Fundo
// =========================

function runRemoverFundo() {
    const path = _exigirSelecao('remover-fundo');
    if (!path) return;
    uiIniciar('remover-fundo', 'Carregando modelo de IA...');
    window.pywebview.api.remover_fundo(path);
}


function updateRemoverFundoProgress(data) {
    uiAtualizar('remover-fundo', data);
    if (data.complete && !data.error && data.resultados && data.resultados.length) {
        abrirModalRF(data.resultados);
    }
}


// =========================
// Modal Remover Fundo
// =========================
let _rfResultados = [];
let _rfIndexAtual = 0;

function abrirModalRF(resultados) {
    _rfResultados = resultados;
    _rfIndexAtual = 0;

    const strip = document.getElementById('rf-thumbs-strip');
    strip.innerHTML = '';
    if (resultados.length > 1) {
        resultados.forEach((r, i) => {
            const img = document.createElement('img');
            img.src = r.resultado_b64;
            img.className = 'rf-thumb' + (i === 0 ? ' active' : '');
            img.title = r.nome;
            img.onclick = () => _rfMostrarItem(i);
            strip.appendChild(img);
        });
        document.getElementById('rf-btn-salvar-todas').style.display = 'inline-flex';
    } else {
        document.getElementById('rf-btn-salvar-todas').style.display = 'none';
    }

    _rfMostrarItem(0);
    document.getElementById('modal-remover-fundo').style.display = 'flex';
}

function _rfMostrarItem(i) {
    _rfIndexAtual = i;
    const r = _rfResultados[i];
    document.getElementById('rf-img-original').src = r.original_b64;
    document.getElementById('rf-img-resultado').src = r.resultado_b64;
    document.getElementById('rf-counter').textContent =
        _rfResultados.length > 1 ? `${i + 1} / ${_rfResultados.length}  —  ${r.nome}` : r.nome;
    document.querySelectorAll('.rf-thumb').forEach((t, idx) => {
        t.classList.toggle('active', idx === i);
    });
}

function fecharModalRF(event) {
    if (event && event.target !== document.getElementById('modal-remover-fundo')) return;
    document.getElementById('modal-remover-fundo').style.display = 'none';
}

async function copiarRFAtual() {
    const r = _rfResultados[_rfIndexAtual];
    const b64 = r.resultado_b64.split(',')[1];
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        const btn = document.getElementById('rf-btn-copiar');
        const orig = btn.innerHTML;
        btn.innerHTML = ico('check') + 'Copiado';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    } catch (e) {
        console.error('Erro ao copiar imagem:', e);
    }
}

async function salvarRFAtual() {
    const result = await window.pywebview.api.select_folder('remover-fundo-save');
    if (!result || !result.success) return;
    const r = await window.pywebview.api.remover_fundo_salvar([_rfIndexAtual], result.path);
    toast(r && r.success ? 'Imagem salva.' : ('Erro ao salvar: ' + (r && r.error)), r && r.success ? 'ok' : 'erro');
}


async function salvarRFTodas() {
    const result = await window.pywebview.api.select_folder('remover-fundo-save');
    if (!result || !result.success) return;
    const r = await window.pywebview.api.remover_fundo_salvar(_rfResultados.map((_, i) => i), result.path);
    toast(r && r.success ? `${r.saved} imagem(ns) salvas.` : ('Erro ao salvar: ' + (r && r.error)), r && r.success ? 'ok' : 'erro');
}


// =========================
// Organizador de Imagens
// =========================

function runOrganizadorImagens() {
    const folderPath = _exigirSelecao('organizador-imagens', 'Escolha (ou arraste) a pasta primeiro.');
    if (!folderPath) return;
    const modo = document.querySelector('input[name="organizador-imagens-modo"]:checked')?.value || 'completa';
    uiIniciar('organizador-imagens');
    window.pywebview.api.organizador_imagens(folderPath, modo);
}


function updateOrganizadorImagensProgress(data) {
    uiAtualizar('organizador-imagens', data);
}


// =========================
// Organizador de Vídeos
// =========================

let _pastaOrganizadorVideos = null;

function _resetOrganizadorVideosProgress() {
    const card = _el('progress-organizador-videos');
    card.hidden = false;
    card.classList.remove('ok', 'erro');
    _el('progress-fill-organizador-videos').style.width = '0%';
    _el('progress-text-organizador-videos').textContent = '0%';
    _el('organizador-videos-fase').textContent = 'Analisando...';
    _el('log-organizador-videos').textContent = '';
}


function runOrganizadorVideosScan() {
    const folderPath = _exigirSelecao('organizador-videos', 'Escolha (ou arraste) a pasta do job primeiro.');
    if (!folderPath) return;
    _pastaOrganizadorVideos = folderPath;
    playExecute();
    _resetOrganizadorVideosProgress();
    window.pywebview.api.escanear_cameras_videos(folderPath);
}


function showCameraPopup(cameras) {
    const lista = _el('cameras-list');
    lista.innerHTML = '';
    if (!cameras || cameras.length === 0) {
        _el('organizador-videos-fase').textContent = 'Nenhuma câmera identificada';
        return toast('Nenhuma câmera identificada na pasta.', 'erro');
    }
    _el('organizador-videos-fase').textContent = `${cameras.length} câmera(s) encontrada(s)`;
    cameras.forEach(cam => {
        const row = document.createElement('div');
        row.className = 'camera-row';
        row.innerHTML = `
            <div class="camera-info">
                <span class="camera-ordem">${String(cam.ordem).padStart(2, '0')}</span>
                <span class="camera-nome">${_escHtml(cam.pai)}</span>
                <span class="camera-stats">${cam.videos}v ${cam.fotos}f ${cam.audios}a</span>
                <span class="camera-data">${_escHtml(cam.data_mais_antiga)}</span>
            </div>
            <input type="text" class="camera-operador" placeholder="Operador (opcional)">`;
        row.querySelector('.camera-operador').dataset.pai = cam.pai;
        lista.appendChild(row);
    });
    _el('modal-cameras').style.display = 'flex';
}


function fecharModalCameras() {
    document.getElementById('modal-cameras').style.display = 'none';
}

function confirmarOrganizacaoVideos() {
    fecharModalCameras();

    const nomeProjeto = document.getElementById('input-nome-projeto').value.trim();

    const operadores = {};
    document.querySelectorAll('.camera-operador').forEach(input => {
        const nome = input.value.trim();
        if (nome) operadores[input.dataset.pai] = nome;
    });

    playExecute();
    _resetOrganizadorVideosProgress();
    window.pywebview.api.organizador_videos(_pastaOrganizadorVideos, operadores, nomeProjeto || null);
}

function updateOrganizadorVideosProgress(data) {
    if (data.percent !== undefined) {
        _el('progress-fill-organizador-videos').style.width = data.percent + '%';
        _el('progress-text-organizador-videos').textContent = Math.round(data.percent) + '%';
    }
    if (data.status) _el('organizador-videos-fase').textContent = data.status;
    if (data.log) _el('log-organizador-videos').textContent = data.log;
    if (data.complete) {
        _el('progress-organizador-videos').classList.add('ok');
        playConcluido();
        toast('Logger Pro: organização concluída!', 'ok');
    }
}


// =========================
// GDrive
// =========================

function checkCerebroStatus() {
    window.pywebview.api.cerebro_exists().then(result => {
        const statusEl = _el('cerebro-status');
        const btnGen = _el('btn-generate-csv');
        if (!statusEl || !btnGen) return;
        statusEl.textContent = result.exists ? 'Regras carregadas: ' + result.path : 'Nenhum arquivo de regras (.md) carregado';
        statusEl.style.color = result.exists ? 'var(--ok)' : '';
        btnGen.disabled = !result.exists;
    });
}

// Carrega estado do cérebro ao inicializar (aguarda pywebview estar pronto)
if (window.pywebview) {
    checkCerebroStatus();
} else {
    window.addEventListener('pywebviewready', checkCerebroStatus);
}

function loadCerebro() {
    window.pywebview.api.cerebro_select_file().then(result => {
        if (result.success) { checkCerebroStatus(); toast('Regras carregadas!', 'ok'); }
        else if (result.error) toast(result.error, 'erro');
    });
}


function removeCerebro() {
    window.pywebview.api.cerebro_remove().then(() => { checkCerebroStatus(); toast('Regras removidas.', 'info'); });
}


function generateCSV() {
    if (_rodando['web-scraper']) return;
    const url = _el('scraper-url').value.trim();
    if (!url) return toast('Digite o endereço da página.', 'erro');
    uiIniciar('web-scraper', 'Gerando CSV com IA local...');
    window.pywebview.api.web_scraper_csv(url);
}


// =========================
// Google Drive
// =========================

let gdriveAnalyzed = false;
let gdriveTotalBytes = 0;

function checkGdriveConfig() {
    window.pywebview.api.gdrive_check().then(result => {
        const statusDiv = document.getElementById('gdrive-status');
        if (result.success) {
            statusDiv.innerHTML = result.configured 
                ? '<span class="txt-ok">Configurado</span>'
                : '<span>Ao analisar o primeiro link, o Google vai pedir sua autorização no navegador.</span>';
        } else {
            statusDiv.innerHTML = '<span class="txt-err">Erro: ' + _escHtml(result.error) + '</span>';
        }
    });
}

function _gdriveStatus(html) {
    const el = document.getElementById('gdrive-status');
    if (el) el.innerHTML = html;
}

function _escHtml(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function analyzeGdrive() {
    const url = document.getElementById('gdrive-url').value.trim();
    if (!url) {
        _gdriveStatus('<span class="txt-err">Cole o link do Google Drive primeiro.</span>');
        return;
    }

    playExecute();
    document.getElementById('gdrive-analyze-info').style.display = 'none';
    document.getElementById('btn-gdrive-baixar').disabled = true;
    _gdriveStatus(ico('loader', 'spin') + ' Verificando…');

    window.pywebview.api.gdrive_analyze(url);
}

function updateGdriveAnalyze(data) {
    if (data.log) {
        _gdriveStatus(ico('loader', 'spin') + ' ' + _escHtml(data.log));
    }
    if (data.error) {
        _gdriveStatus('<span class="txt-err">' + _escHtml(data.error) + '</span>');
        if (data.allowDownload) document.getElementById('btn-gdrive-baixar').disabled = false;
    }
    if (data.complete) {
        document.getElementById('gdrive-pasta-nome').textContent = data.folderName;
        document.getElementById('gdrive-tamanho').textContent = data.totalSize;
        document.getElementById('gdrive-arquivos').textContent = data.totalFiles;
        document.getElementById('gdrive-analyze-info').style.display = 'block';
        document.getElementById('btn-gdrive-baixar').disabled = false;
        _gdriveStatus('<span class="txt-ok">' + ico('check') + ' Pronto para baixar</span>');
        playConcluido();
    }
}

function selectGdriveDestino() {
    window.pywebview.api.select_folder('gdrive').then(result => {
        if (result.success) {
            document.getElementById('gdrive-destino').value = result.path;
        }
    });
}

function runGdriveDump() {
    const url = document.getElementById('gdrive-url').value;
    const destino = document.getElementById('gdrive-destino').value;

    if (!url) {
        document.getElementById('gdrive-msg').textContent = 'Cole o link do Google Drive primeiro.';
        document.getElementById('progress-gdrive').style.display = 'block';
        return;
    }
    if (!destino) {
        document.getElementById('gdrive-msg').textContent = 'Escolha a pasta de destino.';
        document.getElementById('progress-gdrive').style.display = 'block';
        return;
    }
    
    playExecute();

    console.log('[GDrive] Starting dump - url:', url, 'destino:', destino);

    // Esconde botões verificar/baixar — não precisamos mais deles durante o download
    document.getElementById('gdrive-action-buttons').style.display = 'none';

    // Mostra seção de progresso
    document.getElementById('progress-gdrive').style.display = 'block';

    // Chama API e trata retorno
    const perfil = (document.getElementById('gdrive-perfil') || {}).value || 'rapida';
    window.pywebview.api.gdrive_dump(url, destino, perfil).then(result => {
        console.log('[GDrive] gdrive_dump returned:', result);
        if (!result || !result.success) {
            document.getElementById('gdrive-msg').textContent = 'Erro ao iniciar: ' + (result?.error || 'desconhecido');
        }
    }).catch(err => {
        console.error('[GDrive] Erro na chamada:', err);
        document.getElementById('gdrive-msg').textContent = 'Erro: ' + err;
    });
    document.getElementById('progress-fill-gdrive').style.width = '0%';
    document.getElementById('gdrive-arquivo-atual').textContent = '-';
    document.getElementById('gdrive-msg').textContent = 'Iniciando download...';

    // Reseta estado de pausa
    _gdrivePaused = false;
    document.getElementById('gdrive-stat-extra').textContent = '';
    document.getElementById('gdrive-transferring').innerHTML = '';
    _gdriveStatus('');
    const pauseBtn = document.getElementById('btn-gdrive-pause');
    if (pauseBtn) pauseBtn.innerHTML = ico('pause') + 'Pausar';

    // Reseta painel de stats
    document.getElementById('gdrive-stats-panel').style.display = 'none';
    document.getElementById('gdrive-stat-transferido').textContent = '—';
    document.getElementById('gdrive-stat-velocidade').textContent = '—';
    document.getElementById('gdrive-stat-eta').textContent = '—';
    document.getElementById('gdrive-stat-arquivos').textContent = '—';
}

let _gdrivePaused = false;

function toggleGdrivePause() {
    const btn = _el('btn-gdrive-pause');
    _gdrivePaused = !_gdrivePaused;
    if (_gdrivePaused) {
        window.pywebview.api.gdrive_pause();
        btn.innerHTML = ico('play') + 'Retomar';
    } else {
        window.pywebview.api.gdrive_resume();
        btn.innerHTML = ico('pause') + 'Pausar';
    }
}


function cancelGdriveDump() {
    const btn = document.getElementById('btn-gdrive-cancel');
    if (btn) { btn.disabled = true; btn.textContent = 'Cancelando...'; }
    // A UI é finalizada quando o backend emitir complete=true
    window.pywebview.api.gdrive_cancel().catch(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = ico('x') + 'Cancelar'; }
    });
}

function updateGdriveProgress(data) {
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { console.error("JSON parse error", e); return; }
    }
    const el = id => document.getElementById(id);

    if (data.log) el('gdrive-msg').textContent = data.log;

    if (data.percent !== undefined && data.percent !== -1) {
        el('progress-fill-gdrive').style.width = data.percent + '%';
        el('progress-text-gdrive').textContent = data.percent + '%';
    }

    if (data.currentFile) el('gdrive-arquivo-atual').textContent = 'Baixando: ' + data.currentFile;

    if (data.done) {
        el('gdrive-stats-panel').style.display = 'block';
        el('gdrive-stat-transferido').textContent = data.done + ' / ' + data.total;
        el('gdrive-stat-velocidade').textContent = data.speed;
        el('gdrive-stat-eta').textContent = data.eta;
        const extras = [];
        if (data.elapsed) extras.push('Decorrido: ' + data.elapsed);
        if (data.checks > 0) extras.push('Já existentes/verificados: ' + data.checks);
        if (data.errors > 0) extras.push('Erros (serão re-tentados): ' + data.errors);
        el('gdrive-stat-extra').textContent = extras.join('   •   ');
    }
    if (Array.isArray(data.transferring)) {
        el('gdrive-transferring').innerHTML = data.transferring.map(f =>
            '<div class="xfer-row">' +
                '<span class="xfer-name" title="' + _escHtml(f.name) + '">' + _escHtml(f.name) + '</span>' +
                '<span class="xfer-bar"><span style="width:' + (f.pct | 0) + '%"></span></span>' +
                '<span class="xfer-pct">' + (f.pct | 0) + '% de ' + _escHtml(f.size) + '</span>' +
            '</div>').join('');
    }
    if (data.message) {
        el('gdrive-msg').textContent = data.message;
        if (data.eta) el('gdrive-stat-eta').textContent = data.eta;
    }
    if (data.filesTotal > 0) {
        const pending = data.filesTotal - data.filesDone;
        el('gdrive-stat-arquivos').textContent =
            data.filesDone + ' baixados / ' + data.filesTotal + ' (' + pending + ' restantes)';
    }

    if (data.complete) {
        el('progress-gdrive').style.display = 'none';
        el('gdrive-action-buttons').style.display = 'flex';
        el('btn-gdrive-baixar').disabled = false;
        el('gdrive-transferring').innerHTML = '';
        const cancelBtn = el('btn-gdrive-cancel');
        if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.innerHTML = ico('x') + 'Cancelar'; }
        // Mantém a última mensagem visível fora da seção de progresso
        const final = data.log || el('gdrive-msg').textContent;
        _gdriveStatus('<span class="' + (data.success ? 'txt-ok' : 'txt-err') + '">' + _escHtml(final) + '</span>');
        if (data.success) playConcluido();
    }
}

// Função para copiar log
function copyLog(tool) {
    const logEl = document.getElementById(`log-${tool}`);
    if (logEl) {
        navigator.clipboard.writeText(logEl.textContent).then(() => {
            showMessage(tool, 'Log copiado para a área de transferência!', 'success');
        });
    }
}

// =========================
// Utilitários
// =========================

function showMessage(tool, message, type) {
    _logLinha(tool, `${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'} ${message}`);
    if (type === 'error') toast(message, 'erro');
}

// Função para abrir pasta no Explorer
function openFolder(path) {
    window.pywebview.api.open_folder(path);
}

// =========================
// Inicialização
// =========================

console.log('Canivete do Pailer - Frontend carregado');

// Expor todas as funções para o Python chamar
window.updateConverterAudioProgress = updateConverterAudioProgress;
window.updateAudioCutterProgress = updateAudioCutterProgress;
window.updateConverterImagemProgress = updateConverterImagemProgress;
window.updateFaviconProgress = updateFaviconProgress;
window.updateCompressorImagemProgress = updateCompressorImagemProgress;
window.updateCompressorVideoProgress = updateCompressorVideoProgress;
window.updateVideoConverterProgress = updateVideoConverterProgress;
window.updateVideoDownloaderProgress = updateVideoDownloaderProgress;
window.updateWebScraperProgress = updateWebScraperProgress;
window.updateTranscreverAudioProgress = updateTranscreverAudioProgress;
window.updateRemoverFundoProgress = updateRemoverFundoProgress;
window.updateOrganizadorImagensProgress = updateOrganizadorImagensProgress;
window.updateOrganizadorVideosProgress = updateOrganizadorVideosProgress;
window.showCameraPopup = showCameraPopup;
window.updateGdriveProgress = updateGdriveProgress;
window.updateCompressorVideoProgress = updateCompressorVideoProgress;
window.updateGdriveAnalyze = updateGdriveAnalyze;
window.switchTool = switchTool;
window.playExecute = playExecute;
window.playClick = playClick;
window.playConcluido = playConcluido;
window.selectAudioCutterFile = selectAudioCutterFile;
window.addAudioLayer = addAudioLayer;
window.selectAudioLayer = selectAudioLayer;
window.setAudioLayerVolume = setAudioLayerVolume;
window.toggleAudioLayerLock = toggleAudioLayerLock;
window.removeAudioLayer = removeAudioLayer;
window.setAudioTimelineTool = setAudioTimelineTool;
window.toggleAudioEditsPopover = toggleAudioEditsPopover;
window.openAudioExportPopup = openAudioExportPopup;
window.closeAudioExportPopup = closeAudioExportPopup;
window.toggleAudioTimelinePlayback = toggleAudioTimelinePlayback;
window.bladeAudioAtPlayhead = bladeAudioAtPlayhead;
window.rippleDeleteAudioLeft = rippleDeleteAudioLeft;
window.rippleDeleteAudioRight = rippleDeleteAudioRight;
window.undoAudioEdit = undoAudioEdit;
window.clearAudioCuts = clearAudioCuts;
window.exportAudioCuts = exportAudioCuts;

// =========================
// Atualização automática (GitHub Releases)
// =========================

function _showUpdateBanner(info) {
    if (document.getElementById('app-update-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'app-update-banner';
    bar.className = 'update-banner';
    bar.innerHTML =
        ico('arrow-up') +
        '<span>Nova versão <b>' + _escHtml(info.latest) + '</b> disponível · você tem ' + _escHtml(info.current) + '</span>' +
        '<span id="app-update-status" class="ub-status"></span>' +
        '<button id="app-update-btn" class="btn-primary">Atualizar agora</button>' +
        '<button id="app-update-close" class="ub-close" title="Depois">' + ico('x') + '</button>';
    document.body.appendChild(bar);
    document.getElementById('app-update-close').onclick = () => bar.remove();
    document.getElementById('app-update-btn').onclick = () => {
        if (!info.frozen) {
            document.getElementById('app-update-status').textContent = 'Rodando pelo código-fonte: use git pull.';
            return;
        }
        const btn = document.getElementById('app-update-btn');
        btn.disabled = true;
        btn.textContent = 'Atualizando...';
        window.pywebview.api.apply_update();
    };
}

function updateAppUpdateProgress(data) {
    const st = document.getElementById('app-update-status');
    if (st && data.message) st.textContent = data.message + (data.percent >= 0 && !data.done ? ' (' + data.percent + '%)' : '');
    if (data.done && !data.success) {
        const btn = document.getElementById('app-update-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Tentar de novo'; }
    }
}
window.updateAppUpdateProgress = updateAppUpdateProgress;

window.addEventListener('pywebviewready', () => {
    setTimeout(() => {
        window.pywebview.api.check_update().then(info => {
            if (info && info.current && _el('app-version')) _el('app-version').textContent = 'v' + info.current + ' · local e offline';
            if (info && info.available) _showUpdateBanner(info);
        }).catch(() => {});
    }, 4000);
});

window.onArquivosSoltos = onArquivosSoltos;
window.setSelecao = setSelecao;
