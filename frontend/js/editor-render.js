// =========================================================
// Pocket Editor — prévias renderizadas em disco (como os "Preview Files" do Premiere)
// A timeline é dividida nos pontos de edição. Trecho com efeito, camada, transição, texto ou mídia pesada é
// "vermelho" (a prévia compõe cada quadro na hora). Enter renderiza os vermelhos entre In e Out (sem marcas: a
// timeline toda) num arquivo leve no disco — o trecho fica verde e, no play, toca esse arquivo como um vídeo
// comum: um decodificador só, sem efeitos em tempo real.
// O nome do arquivo é o hash do conteúdo do trecho (clipes recortados ao trecho, legendas, quadro): editar só
// derruba o trecho mexido; desfazer (ou mover o trecho inteiro) acha o arquivo de novo.
// Pasta, qualidade e limpeza: Preferências → Cache e Disco (render_cache.py).
// =========================================================

const VEPR = {
    files: new Map(),     // hash → {url, path, size}
    chave: null,          // projeto (caminho do .vcnvt ou, sem salvar, da mídia) dono da pasta carregada
    carregando: false,
    sujo: true,           // segmentos a recalcular
    segs: [],             // [{a, b, pesado, sig}]
    fila: [],             // trechos a renderizar [{a, b, sig}]
    atual: null,          // trecho renderizando {a, b, sig, pct}
    total: 0,
    feitos: 0,
    players: [],          // 2 players que se revezam (o próximo trecho já espera carregado)
    hold: 0,
};

const VE_PR_PREFS_PADRAO = { dir: '', maxGB: 20, dias: 30, altura: 1080, ramGB: 1.5 };
function vePrPrefs() {
    const p = (typeof PREFS !== 'undefined' && PREFS.cache) || {};
    return { ...VE_PR_PREFS_PADRAO, ...p };
}
function vePrApi() { return window.pywebview && window.pywebview.api; }
function vePrChave() { return VE.projectPath || VE.path || null; }

function vePrHash(txt) {
    let a = 0x811c9dc5, b = 0x9747b28c;
    for (let i = 0; i < txt.length; i++) {
        const ch = txt.charCodeAt(i);
        a = Math.imul(a ^ ch, 16777619);
        b = Math.imul(b ^ ch, 2246822519);
    }
    return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36) + '.' + txt.length.toString(36);
}

// ── pasta do projeto ──
function vePrCarregar(forcar) {
    const chave = vePrChave(), api = vePrApi();
    if (!api || !api.ve_render_listar || !chave || VEPR.carregando) return;
    if (!forcar && chave === VEPR.chave) return;
    VEPR.carregando = true;
    api.ve_render_listar(vePrPrefs().dir, chave).then(r => {
        VEPR.carregando = false;
        if (vePrChave() !== chave) { vePrCarregar(); return; }
        VEPR.chave = chave;
        VEPR.files = new Map(Object.entries((r && r.success && r.files) || {}));
        VEPR.tocados = false;
        VEPR.sujo = true;
        if (VE.ready) { veDraw(); veDrawMonitorSoon(); }
    }).catch(() => { VEPR.carregando = false; });
}

// Projeto salvo com outro caminho: leva os renders junto
function vePrProjetoSalvo(chaveAntiga) {
    const api = vePrApi(), nova = vePrChave();
    if (!api || !chaveAntiga || !nova || chaveAntiga === nova) return;
    api.ve_render_mover(vePrPrefs().dir, chaveAntiga, nova).then(() => vePrCarregar(true)).catch(() => {});
}

// Edição: recalcula os segmentos depois (veCachePodar chama quando a edição termina)
function vePrInvalidar() { VEPR.sujo = true; }

// ── segmentos ──
function vePrLimpo(c) {
    const o = {};
    for (const k in c) if (k[0] !== '_' && !['g', 'afx', 'atin', 'atout'].includes(k)) o[k] = c[k];
    return o;
}

function vePrSig(a, b, visuais) {
    const clips = veRecortarClips(visuais, a, b).map(c => {
        const m = veMediaOf(c);
        return [vePrLimpo(c), m && (m.path || m.url || ''), veMediaOffline(m)];
    });
    const legs = (VE.legendas || []).filter(l => l.st < b && l.en > a)
        .map(l => ({ ...l, st: +(l.st - a).toFixed(4), en: +(l.en - a).toFixed(4) }));
    const partes = [2, VE.seqW, VE.seqH, VE.fps, vePrPrefs().altura, +(b - a).toFixed(4), VE.path || '', clips,
        legs, legs.length ? VE.legEstilo : null];
    return vePrHash(JSON.stringify(partes));
}

function vePrSegmentos() {
    if (!VE.ready) return [];
    vePrCarregar();
    if (!VEPR.sujo && VEPR.segsSeq === VE.activeSequence) return VEPR.segs;
    VEPR.sujo = false;
    VEPR.segsSeq = VE.activeSequence;
    const eps = veFrame() / 2;
    const visuais = veTransVirtuais().filter(c => !veIsAudio(c) && !veTrkHidden(c.tr));
    const pts = new Set([0, +VE.dur.toFixed(4)]);
    visuais.forEach(c => { pts.add(+c.st.toFixed(4)); pts.add(+veEnd(c).toFixed(4)); });
    const lista = [...pts].filter(t => t >= 0 && t <= VE.dur + eps).sort((x, y) => x - y);
    const segs = [];
    for (let k = 0; k + 1 < lista.length; k++) {
        const a = lista[k], b = lista[k + 1];
        if (b - a < veFrame() - 1e-4) continue;
        const dentro = visuais.filter(c => c.st < b - eps && veEnd(c) > a + eps);
        const pesado = dentro.length > 1 || dentro.some(c => c._tr || veCacheClipPesado(c._o || c) || veCacheClipPesado(c));
        segs.push({ a, b, pesado, sig: pesado ? vePrSig(a, b, visuais) : null });
    }
    VEPR.segs = segs;
    vePrTocar();
    return segs;
}

// Marca como usados os arquivos que ainda valem (a limpeza automática apaga primeiro os mais esquecidos)
function vePrTocar() {
    if (VEPR.tocados || !VEPR.files.size) return;
    const api = vePrApi(), hs = VEPR.segs.filter(s => s.sig && VEPR.files.has(s.sig)).map(s => s.sig);
    if (!api || !api.ve_render_tocar || !hs.length) return;
    VEPR.tocados = true;
    api.ve_render_tocar(vePrPrefs().dir, VEPR.chave, hs).catch(() => {});
}

// Trecho renderizado (e válido) na agulha
function vePrSegEm(t) {
    if (!VE.ready || !VEPR.files.size) return null;
    const segs = vePrSegmentos();
    for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        if (t >= s.a - 1e-6 && t < s.b - 1e-6) return s.sig && VEPR.files.has(s.sig) ? { ...s, k, f: VEPR.files.get(s.sig) } : null;
    }
    return null;
}

// ── barra da régua da timeline: vermelho = precisa renderizar, verde = renderizado ──
function vePrDesenharBarra(ctx, X, W) {
    if (!VE.ready) return;
    const segs = vePrSegmentos();
    ctx.save();
    segs.forEach(s => {
        if (!s.pesado) return;
        const x1 = X(s.a), x2 = X(s.b);
        if (x2 < 0 || x1 > W) return;
        const feito = VEPR.files.has(s.sig), agora = VEPR.atual && VEPR.atual.sig === s.sig;
        ctx.fillStyle = feito ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.9)';
        ctx.fillRect(Math.max(0, x1), 0, Math.max(1, Math.min(W, x2) - Math.max(0, x1)), 4);
        if (agora && VEPR.atual.pct) {
            ctx.fillStyle = 'rgba(34,197,94,0.95)';
            ctx.fillRect(Math.max(0, x1), 0, Math.max(1, (x2 - x1) * VEPR.atual.pct / 100), 4);
        }
    });
    ctx.restore();
}

// ── renderizar ──
function vePrRenderizar() {
    if (!VE.ready) return;
    const api = vePrApi();
    if (!api || !api.ve_render_trecho) { veToast('A ponte com o app ainda não está pronta'); return; }
    if (VE.exportRunning) { veToast('Espere a exportação terminar'); return; }
    const a = VE.inPt ?? 0, b = VE.outPt ?? VE.dur;
    VEPR.sujo = true;
    const novos = vePrSegmentos().filter(s => s.pesado && s.b > a + 1e-4 && s.a < b - 1e-4 && !VEPR.files.has(s.sig));
    const naFila = new Set(VEPR.fila.map(s => s.sig).concat(VEPR.atual ? [VEPR.atual.sig] : []));
    const add = novos.filter(s => !naFila.has(s.sig)).map(s => ({ a: s.a, b: s.b, sig: s.sig }));
    if (!add.length) {
        // vídeo da timeline ainda sem prévia: o monitor fica preto até ela sair (não é que "não há nada")
        const esperando = VE.clips.some(c => { const m = VE.media[veMid(c)]; return m && m.id && m.kind === 'video' && !m.url && !m.offline && !m.erro; });
        veToast(VEPR.atual ? 'Já está renderizando' : esperando ? 'Espere: os vídeos da timeline ainda estão sendo preparados'
            : 'Nada para renderizar: os trechos já estão prontos (ou são leves)');
        return;
    }
    VEPR.fila.push(...add);
    VEPR.total += add.length;
    veToast(`Renderizando ${add.length} trecho${add.length > 1 ? 's' : ''}...`);
    vePrStatus();
    vePrProximo();
}

async function vePrJob(s) {
    const f = { a: s.a, b: s.b };
    const legOrig = VE.legGravar;
    VE._txPng = null;
    // texto vira PNG (o mesmo desenho da prévia); só os do trecho
    if (VE.clips.some(c => veIsTexto(c) && c.st < s.b && veEnd(c) > s.a)) await veTxPngs(c => c.st < s.b && veEnd(c) > s.a);
    try {
        VE.legGravar = true;   // a prévia mostra as legendas mesmo que a exportação não as grave
        const plano = veExportPlan(true, f);
        return { path: VE.path, base: plano.base, camadas: plano.camadas, dur: plano.dur,
                 legendas: veTxExport(plano.faixa), quadro: [VE.seqW, VE.seqH], altura: vePrPrefs().altura };
    } finally { VE.legGravar = legOrig; }
}

async function vePrProximo() {
    if (VEPR.atual || !VEPR.fila.length) return;
    const s = VEPR.fila.shift();
    // mudou desde que entrou na fila? só renderiza se o trecho ainda existir igual
    VEPR.sujo = true;
    if (!vePrSegmentos().some(x => x.sig === s.sig) || VEPR.files.has(s.sig)) { VEPR.feitos++; vePrProximo(); vePrStatus(); return; }
    VEPR.atual = { ...s, pct: 0 };
    vePrStatus();
    try {
        const job = await vePrJob(s);
        const r = await vePrApi().ve_render_trecho(vePrPrefs().dir, VEPR.chave || vePrChave(), s.sig, job);
        if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
    } catch (e) {
        VEPR.atual = null;
        vePrFimLote('Falha ao renderizar: ' + (e.message || e));
    }
}

function veOnRender(ev) {
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return; } }
    const s = VEPR.atual;
    if (!s || ev.hash !== s.sig) return;
    if (!ev.done) {
        s.pct = ev.pct || 0;
        vePrStatus();
        if (VE.ready && !VE.playing) veDraw();
        return;
    }
    VEPR.atual = null;
    if (ev.success) {
        VEPR.files.set(s.sig, { url: ev.url, path: ev.path, size: ev.size });
        VEPR.feitos++;
        if (VE.ready) { veDraw(); if (!VE.playing) veDrawMonitorSoon(); }
        if (VEPR.fila.length) { vePrProximo(); vePrStatus(); return; }
        vePrFimLote(null);
    } else {
        vePrFimLote(ev.cancelled ? 'Render cancelado' : 'Falha ao renderizar: ' + (ev.error || ''));
    }
}

function vePrFimLote(erro) {
    const feitos = VEPR.feitos;
    VEPR.fila = [];
    VEPR.total = VEPR.feitos = 0;
    vePrStatus();
    if (erro) veToast(erro);
    else veToast(`Prévia renderizada (${feitos} trecho${feitos === 1 ? '' : 's'})`);
    vePrManutencao();
    if (VE.ready) veDraw();
}

function vePrCancelar() {
    if (!VEPR.atual && !VEPR.fila.length) return;
    VEPR.fila = [];
    const api = vePrApi();
    if (api && api.ve_render_cancelar) api.ve_render_cancelar();
}

// Apaga os renders deste projeto (menu Sequência)
function vePrApagarProjeto() {
    const api = vePrApi(), chave = VEPR.chave || vePrChave();
    if (!api || !chave) return;
    vePrCancelar();
    api.ve_render_limpar(vePrPrefs().dir, chave).then(r => {
        VEPR.files.clear();
        VEPR.sujo = true;
        veToast('Arquivos de render apagados' + (r && r.liberado ? ' · ' + veCacheBytesTxt(r.liberado) + ' liberados' : ''));
        if (VE.ready) { veDraw(); veDrawMonitorSoon(); }
        vePrefsCacheInfo();
    });
}

// Indicador na barra da timeline: "Render 2/5 · 43%  ✕"
function vePrStatus() {
    const el = $ve('ve-render-status');
    if (!el) return;
    const ativo = VEPR.atual || VEPR.fila.length;
    el.hidden = !ativo;
    if (!ativo) return;
    const n = Math.min(VEPR.total, VEPR.feitos + 1);
    $ve('ve-render-txt').textContent = `Render ${n}/${VEPR.total} · ${VEPR.atual ? VEPR.atual.pct || 0 : 0}%`;
}

// ── reprodução: o player da prévia renderizada no lugar da composição ──
function vePrPlayer(url) {
    const scr = $ve('ve-screen');
    while (VEPR.players.length < 2) {
        const x = document.createElement('video');
        x.muted = true;
        x.preload = 'auto';
        x.playsInline = true;
        x.crossOrigin = 'anonymous';
        x.setAttribute('aria-hidden', 'true');
        x.addEventListener('seeked', () => { if (!VE.playing) veDrawMonitor(); });
        x.addEventListener('loadeddata', () => { if (!VE.playing) veDrawMonitor(); });
        VEPR.players.push(x);
    }
    // na página (invisível como o deck A): fora dela o navegador não atualiza a imagem de um vídeo tocando
    VEPR.players.forEach(x => { if (scr && x.parentNode !== scr) scr.insertBefore(x, scr.firstChild); });
    let x = VEPR.players.find(p => p._url === url);
    if (!x) {
        x = VEPR.players.find(p => p !== VEPR.emUso) || VEPR.players[0];
        x._url = url;
        x.src = url;
    }
    return x;
}

function vePrSoltarPlayers(exceto) {
    VEPR.players.forEach(x => { if (x !== exceto && !x.paused) x.pause(); });
}

// Desenha o quadro do trecho renderizado; false = não deu (sem trecho ou ainda carregando: compõe normal)
function vePrDesenhar(seg, ctx, cv, pv, cw, ch) {
    const x = vePrPlayer(seg.f.url);
    VEPR.emUso = x;
    vePrSoltarPlayers(x);
    const alvo = Math.max(0, VE.playhead - seg.a);
    if (VE.playing) {
        if (x.readyState >= 1) {
            if (x.paused) {
                if (Math.abs(x.currentTime - alvo) > 0.05) x.currentTime = alvo;
                x.playbackRate = VE.rate;
                x.play().catch(() => {});
            } else if (!x.seeking) {
                // acompanha o relógio (áudio ou vídeo principal): diferença grande busca; pequena, ajusta a velocidade
                const d = x.currentTime - alvo;
                if (Math.abs(d) > 0.15) x.currentTime = alvo + 0.02;
                else {
                    let r = x.playbackRate;
                    if (Math.abs(d) > 0.03) r = VE.rate * (d > 0 ? 0.94 : 1.06);
                    else if (Math.abs(d) < 0.01) r = VE.rate;
                    if (r !== x.playbackRate) x.playbackRate = r;
                }
            }
        }
    } else {
        if (!x.paused) x.pause();
        // meio quadro para dentro: nunca cai no quadro anterior
        const t = alvo + veFrame() / 2;
        if (x.readyState >= 1 && !x.seeking && Math.abs(x.currentTime - t) > veFrame() / 2) x.currentTime = t;
    }
    if (x.readyState < 2 || x.seeking) {
        // tocando e ainda buscando: segura o último quadro (até 400 ms) em vez de piscar
        if (VE.playing && cv.width === cw && cv.height === ch) {
            const agora = performance.now();
            if (!VEPR.hold) VEPR.hold = agora;
            if (agora - VEPR.hold < 400) return true;
        }
        return false;
    }
    VEPR.hold = 0;
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(x, 0, 0, cw, ch);
    ctx.setTransform(pv, 0, 0, pv, 0, 0);
    veTfDesenhar(ctx, cv, pv);
    veRulersDraw();
    return true;
}

// Tocando: perto do fim do trecho renderizado, o próximo (se também renderizado) espera carregado no outro player
function vePrPreparar() {
    if (!VE.playing) return;
    const seg = vePrSegEm(VE.playhead);
    if (!seg || seg.b - VE.playhead > 1) return;
    const prox = vePrSegEm(seg.b + 1e-4);
    if (!prox || prox.f.url === seg.f.url) return;
    const x = vePrPlayer(prox.f.url);
    if (x === VEPR.emUso) return;
    if (!x.paused) x.pause();
    if (x.readyState >= 1 && !x.seeking && x.currentTime > 0.01) x.currentTime = 0;
}

// Tocando e fora de trecho renderizado: players da prévia parados
function vePrForaDoTrecho() {
    if (VEPR.emUso) { VEPR.emUso = null; vePrSoltarPlayers(null); }
}

// ── manutenção do disco (ao abrir o app e depois de cada lote) ──
function vePrManutencao() {
    const api = vePrApi(), p = vePrPrefs();
    if (!api || !api.ve_render_manutencao) return;
    api.ve_render_manutencao(p.dir, p.maxGB, p.dias).then(() => vePrefsCacheInfo()).catch(() => {});
}

// ─────────────────────────── Preferências → Cache e Disco ───────────────────────────
function prefsAba(nome) {
    document.querySelectorAll('#modal-prefs [data-prefs-aba]').forEach(b => b.classList.toggle('active', b.dataset.prefsAba === nome));
    document.querySelectorAll('#modal-prefs [data-prefs-painel]').forEach(p => { p.hidden = p.dataset.prefsPainel !== nome; });
    if (nome === 'cache') vePrefsCacheRender();
}

function vePrefsCacheSalvar(patch) {
    PREFS.cache = { ...vePrPrefs(), ...patch };
    prefsSave();
    vePrAplicarRam();
}

function vePrAplicarRam() {
    if (typeof veCache !== 'function') return;
    const c = veCache();
    c.maxBytes = Math.max(0.25, +vePrPrefs().ramGB || 1.5) * 1024 * 1024 * 1024;
    if (typeof veCacheEvict === 'function') veCacheEvict();
    if (typeof veCacheUpdateUi === 'function') veCacheUpdateUi();
}

function vePrefsCacheRender() {
    const p = vePrPrefs();
    const el = id => document.getElementById(id);
    if (!el('pref-cache-dir')) return;
    el('pref-cache-dir').textContent = p.dir || 'Padrão (pasta do app)';
    el('pref-cache-max').value = p.maxGB;
    el('pref-cache-dias').value = String(p.dias);
    el('pref-cache-alt').value = String(p.altura);
    el('pref-cache-ram').value = String(p.ramGB);
    vePrefsCacheInfo();
}

function vePrefsCacheInfo() {
    const api = vePrApi(), el = document.getElementById('pref-cache-uso');
    if (!api || !api.ve_render_info || !el) return;
    api.ve_render_info(vePrPrefs().dir, VEPR.chave || vePrChave()).then(r => {
        if (!r || !r.success) return;
        const fmt = n => (typeof veCacheBytesTxt === 'function' ? veCacheBytesTxt(n || 0) : Math.round((n || 0) / 1048576) + ' MB');
        el.textContent = `Em uso: ${fmt(r.total)}` + (vePrChave() ? ` (este projeto: ${fmt(r.projeto)})` : '') +
            (r.livre != null ? ` · Livre no disco: ${fmt(r.livre)}` : '');
        const d = document.getElementById('pref-cache-dir');
        if (d) { d.textContent = r.raiz; d.title = r.raiz; }
    }).catch(() => {});
}

function vePrefsCacheEscolher() {
    const api = vePrApi();
    if (!api) return;
    api.select_folder('cache').then(r => {
        if (!r || !r.success) return;
        vePrefsCacheSalvar({ dir: r.path });
        VEPR.chave = null;   // recarrega da pasta nova
        VEPR.files.clear();
        vePrCarregar(true);
        vePrefsCacheRender();
    });
}

function vePrefsCachePadrao() {
    vePrefsCacheSalvar({ dir: '' });
    VEPR.chave = null;
    VEPR.files.clear();
    vePrCarregar(true);
    vePrefsCacheRender();
}

function vePrefsCacheAbrir() {
    const api = vePrApi();
    if (!api) return;
    api.ve_render_info(vePrPrefs().dir, null).then(r => { if (r && r.success) api.open_folder(r.base); });
}

function vePrefsCacheCampo(campo, valor) {
    const n = +valor;
    if (campo === 'maxGB') vePrefsCacheSalvar({ maxGB: Math.max(1, Math.min(4096, n || 20)) });
    if (campo === 'dias') vePrefsCacheSalvar({ dias: n || 30 });
    if (campo === 'altura') { vePrefsCacheSalvar({ altura: n || 1080 }); VEPR.sujo = true; if (VE.ready) veDraw(); }
    if (campo === 'ramGB') vePrefsCacheSalvar({ ramGB: n || 1.5 });
    if (campo === 'maxGB' || campo === 'dias') vePrManutencao();
}

function vePrefsCacheLimpar(tudo) {
    const api = vePrApi();
    if (!api) return;
    if (!tudo) { vePrApagarProjeto(); return; }
    vePrCancelar();
    api.ve_render_limpar(vePrPrefs().dir, null).then(r => {
        VEPR.files.clear();
        VEPR.sujo = true;
        veToast('Cache em disco limpo' + (r && r.liberado ? ' · ' + veCacheBytesTxt(r.liberado) + ' liberados' : ''));
        if (VE.ready) { veDraw(); veDrawMonitorSoon(); }
        vePrefsCacheInfo();
    });
}

window.addEventListener('prefs-carregadas', () => { vePrAplicarRam(); vePrManutencao(); });
window.veOnRender = veOnRender;
