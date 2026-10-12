// Botão PROXY do monitor (como o "Toggle Proxies" do Premiere): ligado = o monitor usa as prévias leves (padrão);
// desligado = parado, mostra o quadro do ARQUIVO ORIGINAL em qualidade cheia — qualquer formato, inclusive os que o
// editor não toca (MXF, 10 bits, 4:2:2): o Python tira o quadro (ve_quadro_original) e ele entra no lugar do quadro da
// prévia em veDesenharItens, antes dos efeitos e do movimento. Tocando, segue a prévia (o original pesado travaria).
// A setinha ▾ abre as opções das prévias (as mesmas de Preferências › cache), num lugar só.
const VEPROXY = { quadros: new Map(), pedido: null, timer: null, aberto: false };

function veProxyLigado() { return vePrPrefs().proxy !== false; }

// A mídia está tocando uma prévia (e não o original)? O vídeo aberto não recebe m.proxy: pelo arquivo que o player toca
function veProxyEmUso(m, src) {
    if (m.proxy) return true;
    const u = String((src && (src.currentSrc || src.src)) || m.url || '');
    return /\/proxy_v\d|_proxy\d|\/Proxy\//i.test(decodeURIComponent(u));
}

// Quadro a desenhar para o clipe: o original (se o proxy está desligado e o editor parado) ou o da prévia
function veProxyQuadro(c, src, t) {
    if (veProxyLigado() || VE.playing || !(src instanceof HTMLVideoElement)) return src;
    const m = veMediaOf(c);
    if (!m || m.kind !== 'video' || !m.path || !veProxyEmUso(m, src)) return src;   // tocando o próprio original: já é a imagem cheia
    const fps = (m.info && (m.info.fps || m.info.fps_timeline)) || VE.fps || 30;
    const k = Math.max(0, Math.round(veSrcAt(c, t) * fps));
    const chave = m.path + '|' + k;
    const q = VEPROXY.quadros.get(chave);
    if (q && q.complete && q.naturalWidth) return q;
    if (!q) veProxyPedir(chave, m.path, k / fps);
    return src;   // enquanto o original não chega, a prévia
}

// Um pedido por vez e só com a agulha parada (arrastar não enfileira centenas de quadros)
function veProxyPedir(chave, path, t) {
    clearTimeout(VEPROXY.timer);
    VEPROXY.timer = setTimeout(() => {
        if (VEPROXY.pedido === chave || VEPROXY.quadros.has(chave)) return;
        VEPROXY.pedido = chave;
        const api = window.pywebview && window.pywebview.api;
        if (!api || !api.ve_quadro_original) return;
        api.ve_quadro_original(path, t, 2560).then(r => {
            if (VEPROXY.pedido === chave) VEPROXY.pedido = null;
            if (!r || !r.success) return;
            const img = new Image();
            img.crossOrigin = 'anonymous';   // o WebGL dos efeitos (Luz e Cor) recusa imagem "contaminada"
            img.onload = () => { if (!veProxyLigado() && !VE.playing) veProxyRedesenhar(); };
            img.src = r.url;
            VEPROXY.quadros.set(chave, img);
            if (VEPROXY.quadros.size > 40) VEPROXY.quadros.delete(VEPROXY.quadros.keys().next().value);
        });
    }, 120);
}

// redesenha o MONITOR (o veDraw só redesenha a timeline: a imagem trocava só quando outra coisa pedia o monitor)
function veProxyRedesenhar() {
    if (typeof veDrawMonitorSoon === 'function') veDrawMonitorSoon(); else if (typeof veDrawMonitor === 'function') veDrawMonitor();
}

function veProxyAlternar() {
    const on = !veProxyLigado();
    vePrefsCacheSalvar({ proxy: on });
    veProxyUi();
    veToast(on ? veT('Proxy ligado: o monitor usa as prévias leves')
        : veT('Proxy desligado: parado, o monitor mostra o arquivo original em qualidade cheia'));
    if (VE.ready) veProxyRedesenhar();
}

function veProxyUi() {
    const b = document.getElementById('ve-proxy-btn');
    if (b) {
        b.classList.toggle('active', veProxyLigado());
        b.title = veProxyLigado() ? veT('Proxy LIGADO: o monitor usa as prévias leves. Clique para ver o arquivo original (imagem cheia)')
            : veT('Proxy DESLIGADO: parado, o monitor mostra o arquivo original. Clique para voltar às prévias leves');
    }
    if (VEPROXY.aberto) veProxyPopRender();
}

function veProxyPopRender() {
    const pop = document.getElementById('ve-proxy-pop');
    if (!pop) return;
    const p = vePrPrefs(), hevc = (typeof PREFS !== 'undefined' && PREFS.hevcModo) === 'direto' ? 'direto' : 'converter';
    // linha de opções lado a lado (sem listas que cortam o texto): [valor, rótulo, dica]
    const seg = (id, vals, atual) => `<div class="ve-proxy-seg" data-seg="${id}">` + vals.map(([v, n, d]) =>
        `<button data-v="${v}" class="${String(v) === String(atual) ? 'on' : ''}" title="${veT(d || n)}">${veT(n)}</button>`).join('') + '</div>';
    const on = veProxyLigado();
    pop.innerHTML = `<div class="ve-proxy-topo"><span>${veT('Prévias leves')}</span>
            <button class="ve-proxy-chave${on ? ' on' : ''}" id="ve-proxy-chk" title="${veT('Ligado: o monitor usa as prévias leves. Desligado: parado, mostra o arquivo original')}"><i></i></button>
            <button class="ve-pop-x" id="ve-proxy-x" title="${veT('Fechar')} (Esc)">×</button></div>
        <div class="ve-proxy-dica">${on ? veT('O monitor usa as cópias leves.') : veT('Parado, o monitor mostra o original.')}</div>
        <div class="ve-proxy-rot">${veT('Qualidade')}</div>
        ${seg('alt', [[540, '540p', '540p (a mais leve)'], [720, '720p', '720p (mais leve, padrão)'], [1080, '1080p', '1080p (máxima)']], p.altura || 720)}
        <div class="ve-proxy-rot">H.265</div>
        ${seg('hevc', [['converter', 'Converter', 'Sempre converter para prévia leve'], ['direto', 'Direto', 'Tocar direto quando o PC suportar']], hevc)}
        <div class="ve-proxy-rot">${veT('Guardar em')}</div>
        ${seg('onde', [[0, 'Cache', 'No cache do app (padrão)'], [1, 'Pasta Proxy', 'Pasta Proxy ao lado dos vídeos (leva o projeto junto)']], p.proxyJunto ? 1 : 0)}
        <div class="ve-proxy-acoes">
            <button id="ve-proxy-conv">${veT('Converter prévias antigas')}</button>
            <button id="ve-proxy-prefs">${veT('Mais opções')}</button>
        </div>`;
    pop.querySelector('#ve-proxy-chk').onclick = () => veProxyAlternar();
    pop.querySelector('#ve-proxy-x').onclick = () => veProxyFechar();
    const campo = { alt: 'altura', hevc: 'hevc', onde: 'proxyJunto' };
    pop.querySelectorAll('.ve-proxy-seg').forEach(g => g.querySelectorAll('button').forEach(bt => bt.onclick = () => {
        vePrefsCacheCampo(campo[g.dataset.seg], bt.dataset.v);
        veProxySincPrefs();
        veProxyPopRender();
    }));
    pop.querySelector('#ve-proxy-conv').onclick = () => { veProxyFechar(); if (typeof veConverterPrevias === 'function') veConverterPrevias(); };
    pop.querySelector('#ve-proxy-prefs').onclick = () => { veProxyFechar(); if (typeof prefsOpen === 'function') prefsOpen(); };
}

// Preferências abertas ao mesmo tempo mostram o mesmo valor
function veProxySincPrefs() {
    const p = vePrPrefs(), el = id => document.getElementById(id);
    if (el('pref-cache-alt')) el('pref-cache-alt').value = String(p.altura || 720);
    if (el('pref-proxy-junto')) el('pref-proxy-junto').value = p.proxyJunto ? '1' : '0';
    if (el('pref-hevc') && typeof PREFS !== 'undefined') el('pref-hevc').value = PREFS.hevcModo === 'direto' ? 'direto' : 'converter';
}

function veProxyAbrir(e) {
    if (e) e.stopPropagation();
    VEPROXY.aberto = !VEPROXY.aberto;
    const pop = document.getElementById('ve-proxy-pop');
    pop.hidden = !VEPROXY.aberto;
    if (VEPROXY.aberto) veProxyPopRender();
}
function veProxyFechar() { VEPROXY.aberto = false; const pop = document.getElementById('ve-proxy-pop'); if (pop) pop.hidden = true; }

(function () {
    const regua = document.getElementById('ve-ruler-btn');
    if (!regua || document.getElementById('ve-proxy-btn')) return;
    const g = document.createElement('span');
    g.className = 've-proxy-grupo';
    g.innerHTML = '<button class="ve-tbtn ve-proxy-btn" id="ve-proxy-btn">PROXY</button>'
        + '<button class="ve-tbtn ve-proxy-mais" id="ve-proxy-mais" title="Opções das prévias leves"><svg viewBox="0 0 10 10" width="9" height="9"><path d="M1.5 3.5l3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>'
        + '<div class="ve-proxy-pop" id="ve-proxy-pop" hidden></div>';
    regua.insertAdjacentElement('afterend', g);
    document.getElementById('ve-proxy-btn').onclick = veProxyAlternar;
    document.getElementById('ve-proxy-mais').onclick = veProxyAbrir;
    document.getElementById('ve-proxy-pop').onclick = e => e.stopPropagation();
    // fecha ao clicar fora (pointerdown na CAPTURA: o editor cancela o mousedown em vários painéis) e com Esc
    document.addEventListener('pointerdown', e => { if (VEPROXY.aberto && !g.contains(e.target)) veProxyFechar(); }, true);
    document.addEventListener('keydown', e => { if (VEPROXY.aberto && e.key === 'Escape') veProxyFechar(); }, true);
    // clique numa janela solta (timeline, painéis) não chega a este documento: a janela perde o foco — fecha também
    window.addEventListener('blur', () => { if (VEPROXY.aberto) veProxyFechar(); });
    window.addEventListener('prefs-carregadas', veProxyUi);
    veProxyUi();
})();
window.VEPROXY_API = { ligado: veProxyLigado, alternar: veProxyAlternar, abrir: () => { if (!VEPROXY.aberto) veProxyAbrir(); } };
