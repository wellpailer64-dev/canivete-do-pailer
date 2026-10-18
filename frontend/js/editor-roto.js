// Pincel Roto e Refinar borda (o Roto Brush do After Effects) — Functions/pincel_roto.py (SAM 2.1 Tiny de vídeo).
// Efeito "roto" nos Controles de efeito (parâmetros do Refinar borda) + tela própria (duplo clique na faixa ou o botão
// do efeito): traço verde soma, Alt (ou o botão Tirar) vermelho tira, Ctrl+arrastar muda o tamanho do pincel. O quadro
// pintado vira quadro-base (◆ na régua) e o Python propaga até os quadros-base vizinhos, para os dois lados; o verde da
// régua mostra os quadros já seguidos. Corrigir = pintar noutro quadro.
// Dados no efeito: f.v.rd = {rid, a, b, tr: {quadro: [traço]}}; traço = {l: 1 soma/0 tira, r: raio (0..1 da altura),
// p: [[x, y]...] em 0..1}. Os pontos do modelo saem dos traços (poucos por traço). As máscaras ficam no cache de render
// (<cache>/Roto/<rid>): prévia = alfa em meia resolução (p_NNNNN.png); exportação = .mov ProRes 4444 com alfa
// (pincel_roto.video_alfa) que entra no lugar da mídia (veRotoPreparar → plano de exportação). Quadro sem recorte = opaco.

const VERO = { st: {}, img: new Map(), abrindo: {}, timer: 0, tela: null };
// Freeze: pintar só calcula o quadro-base; o seguimento roda no botão ❄ Freeze (ou sozinho, com "Seguir sozinho")
const veRotoSeguir = () => { try { return localStorage.getItem('ve-roto-seguir') === '1'; } catch (e) { return false; } };

VE_FX.roto = {
    nome: 'Pincel Roto e Refinar borda', cat: 'Chaveamento', tag: 'Roto Brush',
    botao: 'Abrir o Pincel Roto', abrir: c => veRotoTelaAbrir(c),
    soClipe: true,
    extra: ['rd'],
    params: [
        { k: 'refinar', nome: 'Refinar borda', tipo: 'bool', def: 1 },
        { k: 'suave', nome: 'Suavizar', min: 0, max: 100, step: 1, def: 20, un: '' },
        { k: 'pena', nome: 'Pena', min: 0, max: 50, step: 0.5, def: 0, un: 'px' },
        { k: 'contraste', nome: 'Contraste', min: 0, max: 100, step: 1, def: 0, un: '%' },
        { k: 'deslocar', nome: 'Deslocar borda', min: -30, max: 30, step: 1, def: 0, un: 'px' },
        { k: 'tremido', nome: 'Reduzir tremido', min: 0, max: 100, step: 1, def: 30, un: '%' },
        // tira a cor do fundo antigo dos pixels da borda (a auréola escura/colorida em volta do cabelo sobre outro fundo)
        { k: 'descont', nome: 'Descontaminar cores', min: 0, max: 100, step: 1, def: 100, un: '%' },
        // borda seca: estreita a faixa macia (0 = macia como antes; 100 = só o antisserrilhado)
        { k: 'nitidez', nome: 'Nitidez da borda', min: 0, max: 100, step: 1, def: 50, un: '%' },
        // o recorte não fura dentro do rosto (lente dos óculos, mão na frente do queixo) — detector de rosto
        { k: 'rosto', nome: 'Proteger rosto', tipo: 'bool', def: 1 },
    ],
    neutro: v => !(v.rd && v.rd.rid),
    draw(a, v, env) {
        const st = veRotoEstado(v.rd, env.c);
        if (!st || !st.url_p) return a;
        veRotoParams(st, v);
        const i = veRotoQuadro(st, env.c, env.T);
        if (i < 0 || !st.ver[i]) return a;   // fora do trecho ou ainda sem recorte: opaco (como antes do efeito)
        let img = veRotoImg(st, i);
        if (VE.playing) for (let k = 1; k <= 10; k++) if (st.ver[i + k]) veRotoImg(st, i + k);   // tocando: busca à frente
        if (!img) {   // ainda carregando: usa a do quadro vizinho já carregada (não pisca sem recorte)
            for (let k = 1; k <= 4 && !img; k++) img = veRotoImg(st, i - k, true) || veRotoImg(st, i + k, true);
            if (!img) return a;
        }
        const x = a.ctx;
        x.save(); x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0, env.w, env.h);
        // cores descontaminadas da borda (Python: c_NNNNN.png, só a faixa da borda)
        const desc = veRotoParamsDe(v).descont > 0, cor = desc && veRotoImg(st, i, true, 'c');
        if (cor) { x.globalCompositeOperation = 'source-atop'; x.drawImage(cor, 0, 0, env.w, env.h); }
        else if (desc) veRotoImg(st, i, false, 'c');
        x.restore();
        return a;
    },
};

const veRotoFx = c => ((c && c.fx) || []).find(f => f.t === 'roto' && f.on !== false) || null;
// parâmetro que o projeto não tem (efeito criado numa versão antiga) vale o padrão
const veRotoParamsDe = v => Object.fromEntries(VE_FX.roto.params.map(p => [p.k, v[p.k] == null ? p.def : +v[p.k] || 0]));

// quadro do trecho do recorte no instante T da timeline
function veRotoQuadro(st, c, T) {
    const t = veSrcAt(c, T == null ? VE.playhead : T);
    const i = Math.floor((t - st.a) * st.fps + 1e-3);
    return i >= 0 && i < st.n ? i : -1;
}

// estado do trabalho no Python (abre na primeira vez; o resto chega pelo veRotoVigiar)
function veRotoEstado(rd, c) {
    if (!rd || !rd.rid) return null;
    const st = VERO.st[rd.rid];
    if (st) return st;
    if (!VERO.abrindo[rd.rid]) veRotoAbrirJob(rd, c);
    return null;
}
async function veRotoAbrirJob(rd, c) {
    const api = window.pywebview && window.pywebview.api, m = c && veMediaOf(c);
    if (!api || !api.ve_roto_abrir || !m || !m.path) return null;
    VERO.abrindo[rd.rid] = true;
    try {
        const r = await api.ve_roto_abrir(vePrPrefs().dir, rd.rid, m.path, rd.a, rd.b, rd.q || null);
        if (!r || !r.success) { veToast(veT('Pincel Roto') + ': ' + ((r && r.error) || '?')); return null; }
        const st = VERO.st[rd.rid] = Object.assign(VERO.st[rd.rid] || {}, r, { ver: new Array(r.n).fill(0), pend: {} });
        await veRotoSincronizar(rd, st);
        veRotoVigiar();
        return st;
    } finally { VERO.abrindo[rd.rid] = false; }
}

// os traços do projeto mandam: quadro-base que o Python não tem (cache apagado, desfazer, outro PC) é mandado de novo
async function veRotoSincronizar(rd, st) {
    const api = window.pywebview.api, py = st.bases || {}, nos = {};
    Object.entries(rd.tr || {}).forEach(([q, ts]) => { if (ts && ts.length) nos[q] = veRotoPontos(ts); });
    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const mudou = Object.keys(nos).filter(q => !igual(nos[q], py[q])), sobrou = Object.keys(py).filter(q => !nos[q]);
    for (const q of [...sobrou, ...mudou]) await api.ve_roto_base(rd.rid, +q, nos[q] || [], veRotoSeguir());
    st.bases = nos;
}

// traços → pontos do modelo: 1 no meio do traço curto; 3 (15%, 50%, 85% do caminho) no comprido; "Selecionar assunto"
// = [0, 0, 2] (o Python parte da máscara do assunto e os traços somam/tiram por cima)
function veRotoPontos(tracos) {
    const out = [], auto = tracos.some(t => t.auto);
    tracos.forEach(t => {
        const p = t.p || []; if (t.auto || !p.length) return;
        const seg = [0]; for (let k = 1; k < p.length; k++) seg.push(seg[k - 1] + Math.hypot((p[k][0] - p[k - 1][0]) * VE.seqW / VE.seqH, p[k][1] - p[k - 1][1]));
        const L = seg[seg.length - 1];
        const em = u => { const d = u * L; let k = 1; while (k < seg.length - 1 && seg[k] < d) k++; const s0 = seg[k - 1], s1 = seg[k] || s0, f = s1 > s0 ? (d - s0) / (s1 - s0) : 0, A = p[k - 1], B = p[Math.min(k, p.length - 1)]; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]; };
        (L < 0.06 ? [0.5] : [0.15, 0.5, 0.85]).forEach(u => { const [x, y] = em(u); out.push([+x.toFixed(4), +y.toFixed(4), t.l ? 1 : 0]); });
    });
    return auto ? [[0, 0, 2], ...out.slice(-12)] : out.slice(-12);
}

// Refinar borda mudou nos Controles de efeito: o Python refaz o alfa (espera parar de mexer)
function veRotoParams(st, v) {
    const p = veRotoParamsDe(v), k = JSON.stringify(p);
    if (st.paramsK == null) st.paramsK = JSON.stringify(veRotoParamsDe(Object.assign({}, st.params || {})));
    if (k === st.paramsK) return;
    st.paramsK = k;
    clearTimeout(st.tParams);
    st.tParams = setTimeout(() => { window.pywebview.api.ve_roto_refinar(st.rid, p).then(() => veRotoVigiar()); }, 450);
}

// máscara da prévia do quadro i (Image já carregada ou null; carrega em segundo plano); tipo 'c' = cores da borda
function veRotoImg(st, i, soPronta, tipo = 'p') {
    if (i < 0 || i >= st.n || !st.ver[i] || (tipo === 'c' && !st.url_c)) return null;
    const chave = `${st.rid}|${tipo}${i}|${st.ver[i]}`;
    let e = VERO.img.get(chave);
    if (!e) {
        if (soPronta) return null;
        const im = new Image(); im.crossOrigin = 'anonymous'; e = { im, ok: false };
        im.onload = () => { e.ok = true; if (!VE.playing) veRotoRedesenhar(); };
        im.onerror = () => { e.falhou = true; };   // sem cores (descontaminar desligado ou ainda refinando)
        im.src = `${tipo === 'c' ? st.url_c : st.url_p}${tipo}_${String(i).padStart(5, '0')}.png?v=${st.ver[i]}`;
        VERO.img.set(chave, e);
        if (VERO.img.size > 240) VERO.img.delete(VERO.img.keys().next().value);
    }
    return e.ok ? e.im : null;
}
function veRotoRedesenhar() {
    cancelAnimationFrame(VERO.rafR);
    VERO.rafR = requestAnimationFrame(() => { veDrawMonitorSoon(); if (VERO.tela && !VERO.tela.el.hidden) veRotoTelaDesenhar(); });
}
// entra na assinatura do quadro guardado (veCacheSig): a versão da máscara daquele quadro
function veRotoSig(c, T) {
    const f = veRotoFx(c); if (!f || !f.v || !f.v.rd) return 0;
    const st = VERO.st[f.v.rd.rid]; if (!st) return 0;
    const i = veRotoQuadro(st, c, T); return i < 0 ? 0 : st.ver[i] || 0;
}

// acompanha os trabalhos em andamento (máscaras novas aparecem enquanto propaga)
function veRotoVigiar() {
    if (VERO.timer) return;
    VERO.timer = setInterval(async () => {
        const api = window.pywebview && window.pywebview.api; if (!api) return;
        let algum = false;
        // tocando: o trabalho do Roto espera (seguir/borda/montar o vídeo no Python disputavam a máquina com o play)
        const tocando = !!VE.playing && !VE.exportRunning;
        if (tocando !== !!VERO.pausado) { VERO.pausado = tocando; api.ve_roto_pausar?.(tocando); }
        for (const st of Object.values(VERO.st)) {
            if (!st.vigiar && !(VERO.tela && !VERO.tela.el.hidden && VERO.tela.rid === st.rid)) continue;
            const r = await api.ve_roto_estado(st.rid); if (!r || !r.success) continue;
            const mud = r.ver.some((v, i) => v !== st.ver[i]);
            Object.assign(st, { ver: r.ver, rodando: r.rodando, fila: r.fila, fase: r.fase, feito: r.feito, total: r.total, msg: r.msg, erro: r.erro, s_quadro: r.s_quadro, extraido: r.extraido, pend: r.pend, qual: r.qual });
            st.vigiar = r.rodando || r.fila > 0;
            if (r.erro && r.erro !== st.erroVisto) { st.erroVisto = r.erro; veToast(veT('Pincel Roto') + ': ' + r.erro); }
            if (mud) veRotoRedesenhar();
            algum = algum || st.vigiar;
            if (VERO.tela && VERO.tela.rid === st.rid) veRotoTelaStatus();
        }
        if (!algum && !(VERO.tela && !VERO.tela.el.hidden)) {
            clearInterval(VERO.timer); VERO.timer = 0;
            if (VERO.pausado) { VERO.pausado = false; api.ve_roto_pausar?.(false); }
        }
    }, 400);
    Object.values(VERO.st).forEach(st => { st.vigiar = true; });
}

// ── exportação: o clipe com recorte vira o vídeo transparente do trecho (chamado pelo veTxPngs) ──
async function veRotoPreparar(mapa, filtro, clips = VE.clips) {
    const api = window.pywebview && window.pywebview.api; if (!api || !api.ve_roto_video) return;
    for (const c of clips.filter(c => veRotoFx(c) && veRotoFx(c).v.rd && (!filtro || filtro(c)))) {
        const f = veRotoFx(c), rd = f.v.rd;
        if (!VERO.st[rd.rid]) await veRotoAbrirJob(rd, c);
        const st = VERO.st[rd.rid]; if (!st) continue;
        await window.pywebview.api.ve_roto_refinar(rd.rid, veRotoParamsDe(veFxValues(f)));
        // o vídeo recortado é montado em segundo plano (chamada longa no Python cai): pede, espera a fila, pede de novo
        let r = await api.ve_roto_video(rd.rid);
        for (let k = 0; r && r.success && r.pendente && k < 20; k++) { await veRotoEsperar(rd.rid); r = await api.ve_roto_video(rd.rid); }
        if (r && r.success) mapa.set(c, Object.assign(mapa.get(c) || {}, { roto: { path: r.path, a: r.a } }));
        else veToast(veT('Pincel Roto') + ': ' + ((r && r.error) || '?'));
    }
}

// algum clipe com Pincel Roto no trecho a..b da timeline ainda sem Freeze, seguindo ou não aberto (render automático espera)
function veRotoOcupado(a, b) {
    return VE.clips.some(c => {
        const f = veRotoFx(c); if (!f || !f.v.rd || c.st >= b || veEnd(c) <= a) return false;
        const st = VERO.st[f.v.rd.rid];
        return !st || st.rodando || st.fila || ((st.pend || []).length && Object.keys(st.bases || {}).length);
    });
}

// espera o trabalho do Python esvaziar a fila (consulta a cada 0,5 s; aviso se demorar)
async function veRotoEsperar(rid) {
    const api = window.pywebview.api;
    for (let k = 0; ; k++) {
        const r = await api.ve_roto_estado(rid);
        if (!r || !r.success || (!r.rodando && !r.fila)) return r;
        if (k === 2) veToast(veT('Pincel Roto: esperando o recorte terminar…'));
        await new Promise(ok => setTimeout(ok, 500));
    }
}

// ───────────────────────── tela do Pincel Roto ─────────────────────────
function veRotoTelaMontar() {
    // janela por cima do editor (que fica atrás, desfocado); ⤢ ocupa a tela toda
    const el = document.createElement('div'); el.className = 've vero'; el.hidden = true;
    el.innerHTML = `<div class="vero-jan"><div class="vero-topo"><b data-ro="titulo"></b>
        <div class="vero-grupo"><button class="ve-btn ve-btn-sm" data-romodo="1" title="${veT('Pintar o que fica (verde)')}">✚ ${veT('Somar')}</button><button class="ve-btn ve-btn-sm" data-romodo="0" title="${veT('Segure Alt para tirar (vermelho)')}">▬ ${veT('Tirar')}</button></div>
        <label class="vero-tam">${veT('Pincel')} <input type="range" min="0.005" max="0.15" step="0.001" data-ro="tam"></label>
        <button class="ve-btn ve-btn-sm" data-roacao="assunto" title="${veT('Acha a pessoa/objeto principal deste quadro sozinho (depois dá para somar/tirar com o pincel)')}">✨ ${veT('Selecionar assunto')}</button>
        <div class="vero-grupo"><button class="ve-btn ve-btn-sm" data-rovista="contorno">${veT('Contorno')}</button><button class="ve-btn ve-btn-sm" data-rovista="alfa">${veT('Alfa')}</button><button class="ve-btn ve-btn-sm" data-rovista="xadrez">${veT('Transparente')}</button></div>
        <span class="vero-status" data-ro="status"></span>
        <button class="ve-btn ve-btn-sm" data-roacao="cancelar" hidden>${veT('Parar')}</button>
        <button class="ve-btn ve-btn-sm vero-ico" data-roacao="max" title="${veT('Tela cheia')}">⤢</button>
        <button class="ve-btn ve-btn-sm" data-roacao="fechar" title="Esc">${veT('Voltar à timeline')}</button></div>
        <div class="vero-visor" data-ro="visor"><canvas></canvas><div class="vero-dica">${veT('Pinte o que fica · Alt: tirar · Ctrl+arrastar: tamanho do pincel · ←/→: quadro · Espaço: tocar · F: Freeze · Delete: apaga o quadro-base')}</div></div>
        <div class="vero-borda"><b>${veT('Borda')}</b>
            <label title="${veT('Borda seca: menos degradê no contorno (0 = macia, 100 = só o antisserrilhado)')}">${veT('Nitidez')} <input type="range" min="0" max="100" step="1" data-roparam="nitidez"><span data-roval="nitidez"></span></label>
            <label title="${veT('Tira a cor do fundo antigo da borda (sem auréola escura ou colorida em volta do cabelo)')}"><input type="checkbox" data-roparam="descont"> ${veT('Descontaminar cores')}</label>
            <label title="${veT('O recorte não fura dentro do rosto (lente dos óculos, mão na frente do queixo)')}"><input type="checkbox" data-roparam="rosto"> ${veT('Proteger rosto')}</label>
            <span class="vero-borda-dica">${veT('Mais ajustes em Controles de efeito › Refinar borda')}</span></div>
        <div class="vero-tempo"><button class="ve-btn ve-btn-sm" data-roacao="play" title="${veT('Espaço')}">▶</button><span class="vero-hora" data-ro="hora"></span>
            <canvas class="vero-regua" data-ro="regua"></canvas>
            <button class="ve-btn ve-btn-sm" data-roacao="apagar" title="Delete">${veT('Apagar quadro-base')}</button>
            <select class="ve-btn ve-btn-sm" data-ro="qual" title="${veT('Alta: borda mais fiel (SAM 2.1 Small) · Rápida: uns 3× mais rápida, borda mais grossa')}"><option value="alta">${veT('Qualidade alta')}</option><option value="rapido">${veT('Rápida')}</option></select>
            <label class="vero-seguir" title="${veT('Desligado: pintar só mostra o quadro-base; o recorte dos outros quadros espera o Freeze')}"><input type="checkbox" data-ro="seguir"> ${veT('Seguir sozinho')}</label>
            <button class="ve-btn ve-btn-sm vero-freeze" data-roacao="freeze" title="${veT('Monta o recorte dos outros quadros a partir dos quadros-base (F)')}">❄ Freeze</button></div></div>`;
    document.body.appendChild(el);
    const q = k => el.querySelector(`[data-ro="${k}"]`);
    const T = VERO.tela = { el, visor: q('visor'), cv: el.querySelector('.vero-visor canvas'), regua: q('regua'), hora: q('hora'), status: q('status'), titulo: q('titulo'), tam: q('tam'),
        qual: q('qual'), seguir: q('seguir'), freeze: el.querySelector('[data-roacao="freeze"]'),
        modo: 1, vista: 'contorno', raio: 0.035, traco: null, play: null, raf: 0, img: null, imgI: -1, cursor: null };
    T.tam.value = T.raio;
    T.tam.addEventListener('input', () => { T.raio = +T.tam.value; veRotoTelaDesenhar(); });
    T.seguir.checked = veRotoSeguir();
    T.seguir.addEventListener('change', () => {
        try { localStorage.setItem('ve-roto-seguir', T.seguir.checked ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
        if (T.seguir.checked) veRotoFreeze();
    });
    T.qual.addEventListener('change', () => veRotoQualidade(T.qual.value));
    // Borda (os mesmos parâmetros do efeito nos Controles de efeito): mudar refaz o alfa/as cores em segundo plano
    el.querySelectorAll('[data-roparam]').forEach(inp => inp.addEventListener(inp.type === 'range' ? 'input' : 'change', () => {
        const f = veRotoFx(veRotoTelaClipe()), st = VERO.st[T.rid]; if (!f) return;
        const k = inp.dataset.roparam, val = inp.type === 'checkbox' ? (inp.checked ? (k === 'descont' ? 100 : 1) : 0) : +inp.value;
        veFxEdit(f.id, x => { x.v = { ...x.v, [k]: val }; return x; });
        veRotoTelaBorda();
        if (st) { veRotoParams(st, veRotoFx(veRotoTelaClipe()).v); st.vigiar = true; veRotoVigiar(); }
    }));
    el.addEventListener('pointerdown', e => { if (e.target === el) veRotoTelaFechar(); });   // clique no fundo desfocado volta
    el.addEventListener('click', e => {
        const b = e.target.closest('[data-romodo],[data-rovista],[data-roacao]'); if (!b) return;
        const d = b.dataset;
        if (d.romodo != null) T.modo = +d.romodo;
        else if (d.rovista) T.vista = d.rovista;
        else if (d.roacao === 'fechar') return veRotoTelaFechar();
        else if (d.roacao === 'freeze') return veRotoFreeze();
        else if (d.roacao === 'assunto') return veRotoAssunto();
        else if (d.roacao === 'max') { el.classList.toggle('vero-max'); return veRotoTelaDesenhar(); }
        else if (d.roacao === 'play') return veRotoTelaPlay();
        else if (d.roacao === 'apagar') return veRotoApagarBase();
        else if (d.roacao === 'cancelar') { window.pywebview.api.ve_roto_cancelar(T.rid); return; }
        veRotoTelaBotoes(); veRotoTelaDesenhar();
    });
    T.cv.addEventListener('pointerdown', veRotoTelaApertar);
    T.cv.addEventListener('pointermove', e => { T.cursor = veRotoTelaPos(e); if (!T.traco) veRotoTelaDesenhar(); });
    T.cv.addEventListener('pointerleave', () => { T.cursor = null; veRotoTelaDesenhar(); });
    T.regua.addEventListener('pointerdown', veRotoReguaApertar);
    window.addEventListener('keydown', veRotoTelaTecla, true);
    window.addEventListener('resize', () => { if (!el.hidden) veRotoTelaDesenhar(); });
}

const veRotoTelaClipe = () => VE.clips.find(c => { const f = veRotoFx(c); return f && f.v.rd && f.v.rd.rid === (VERO.tela && VERO.tela.rid); }) || null;

async function veRotoTelaAbrir(c) {
    if (!c || veIsImage(c) || veIsAudio(c) || veIsAdj(c) || veIsTexto(c)) { veToast(veT('O Pincel Roto recorta um clipe de vídeo')); return false; }
    const m = veMediaOf(c);
    if (!m || !m.path) { veToast(veT('Pincel Roto: a mídia precisa estar no disco')); return false; }
    if (VE.playing) veStop();
    let f = veRotoFx(c);
    if (!f || !f.v.rd) {   // sem efeito ainda (duplo clique, menu): cria com o trecho do clipe
        vePushHistory();
        const rd = { rid: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), a: +c.s.toFixed(4), b: +c.e.toFixed(4), tr: {} };
        if (f) f.v = Object.assign({}, f.v, { rd });
        else {
            const v = {}; VE_FX.roto.params.forEach(p => { v[p.k] = p.def; }); v.rd = rd;
            f = { id: veFxNewId(), t: 'roto', on: true, v };
            c.fx = [f, ...(c.fx || [])];   // primeiro da lista: o recorte vem antes dos outros efeitos
        }
        veRefresh();
    }
    if (!VERO.tela) veRotoTelaMontar();
    const T = VERO.tela;
    T.rid = f.v.rd.rid; VE.sel = VE.clips.indexOf(c);
    if (VE.playhead < c.st || VE.playhead >= veEnd(c)) veSeek(c.st);
    T.el.hidden = false; T.titulo.textContent = `${veT('Pincel Roto')} · ${m.name || ''}`;
    veRotoTelaBotoes();
    const st = VERO.st[T.rid] || await veRotoAbrirJob(f.v.rd, c);
    if (st) { st.vigiar = true; veRotoVigiar(); T.qual.value = st.qual || 'alta'; }
    veRotoTelaBorda();
    cancelAnimationFrame(T.raf); T.raf = requestAnimationFrame(veRotoTelaLaco);
    veRotoTelaDesenhar();
    return true;
}
function veRotoTelaFechar() {
    const T = VERO.tela; if (!T || T.el.hidden) return;
    T.play = null; T.el.hidden = true; cancelAnimationFrame(T.raf);
    veRefresh();
}
function veRotoTelaBotoes() {
    const T = VERO.tela;
    T.el.querySelectorAll('[data-romodo]').forEach(b => b.classList.toggle('on', +b.dataset.romodo === T.modo));
    T.el.querySelectorAll('[data-rovista]').forEach(b => b.classList.toggle('on', b.dataset.rovista === T.vista));
}
function veRotoTelaStatus() {
    const T = VERO.tela, st = VERO.st[T.rid]; if (!st) { T.status.textContent = veT('Abrindo…'); return; }
    let s = '';
    if (st.rodando || st.fila) {
        const pct = st.total ? Math.round(st.feito / st.total * 100) : 0;
        s = `${veT(st.msg || 'Trabalhando…')} ${pct}%` + (st.s_quadro && st.fase === 'propagar' ? ` · ${String(st.s_quadro).replace('.', ',')} s/${veT('quadro')}` : '');
    } else if (!Object.keys(st.bases || {}).length) s = veT('Pinte a pessoa ou o objeto num quadro (ou ✨ Selecionar assunto)');
    else if ((st.pend || []).length) s = veT('Quadro-base pronto · ❄ Freeze monta o recorte dos outros quadros');
    else s = `${st.ver.filter(Boolean).length}/${st.n} ${veT('quadros recortados')}`;
    T.status.textContent = s;
    T.el.querySelector('[data-roacao="cancelar"]').hidden = !(st.rodando || st.fila);
    T.freeze.classList.toggle('vero-pend', (st.pend || []).length > 0 && Object.keys(st.bases || {}).length > 0);
}
// controles de Borda da tela ← valores do efeito
function veRotoTelaBorda() {
    const T = VERO.tela, f = veRotoFx(veRotoTelaClipe()); if (!T || !f) return;
    const p = veRotoParamsDe(f.v);
    T.el.querySelectorAll('[data-roparam]').forEach(inp => {
        const k = inp.dataset.roparam;
        if (inp.type === 'checkbox') inp.checked = p[k] > 0; else inp.value = p[k];
    });
    const n = T.el.querySelector('[data-roval="nitidez"]'); if (n) n.textContent = `${p.nitidez}%`;
}
// ❄ Freeze: segue o recorte a partir dos quadros-base (o que estiver pendente)
function veRotoFreeze() {
    const T = VERO.tela, st = T && VERO.st[T.rid]; if (!st) return;
    if (!Object.keys(st.bases || {}).length) { veToast(veT('Pinte um quadro-base antes (ou ✨ Selecionar assunto)')); return; }
    window.pywebview.api.ve_roto_congelar(st.rid).then(() => { st.vigiar = true; veRotoVigiar(); });
}
// ✨ Selecionar assunto: o quadro atual vira quadro-base com a máscara do Remover fundo (os traços somam/tiram por cima)
function veRotoAssunto() {
    const T = VERO.tela, c = veRotoTelaClipe(), st = T && VERO.st[T.rid]; if (!c || !st) return;
    if (!st.extraido) { veToast(veT('Espere ler os quadros do vídeo')); return; }
    const i = veRotoQuadro(st, c); if (i < 0) return;
    veRotoMudarTracos(c, i, l => [{ l: 1, auto: 1, r: 0, p: [] }, ...l.filter(t => !t.auto)]);
}
// qualidade do modelo (fica no projeto: rd.q)
function veRotoQualidade(q) {
    const T = VERO.tela, f = veRotoFx(veRotoTelaClipe()), st = T && VERO.st[T.rid]; if (!f || !st) return;
    veFxEdit(f.id, x => { x.v.rd = { ...x.v.rd, q }; return x; });
    window.pywebview.api.ve_roto_qualidade(st.rid, q, veRotoSeguir()).then(() => { st.qual = q; st.vigiar = true; veRotoVigiar(); });
}

// ── laço: tocar e redesenhar a régua ──
function veRotoTelaLaco() {
    const T = VERO.tela; if (!T || T.el.hidden) return;
    T.raf = requestAnimationFrame(veRotoTelaLaco);
    const c = veRotoTelaClipe(); if (!c) { veRotoTelaFechar(); return; }
    if (T.play) {
        let t = T.play.p0 + (performance.now() - T.play.t0) / 1000;
        if (t >= veEnd(c)) { T.play = { t0: performance.now(), p0: c.st }; t = c.st; }
        VE.playhead = t;
    }
    const st = VERO.st[T.rid], i = st ? veRotoQuadro(st, c) : -1;
    const chave = [i, st && st.ver[i], T.vista, T.visor.clientWidth, T.visor.clientHeight, st && st.ver.filter(Boolean).length, JSON.stringify(st && st.bases)].join('|');
    if (chave !== T.chave) { T.chave = chave; veRotoTelaDesenhar(); }
}
function veRotoTelaPlay() {
    const T = VERO.tela, c = veRotoTelaClipe(); if (!c) return;
    T.play = T.play ? null : { t0: performance.now(), p0: VE.playhead >= veEnd(c) - 1e-3 ? c.st : VE.playhead };
    T.el.querySelector('[data-roacao="play"]').textContent = T.play ? '❚❚' : '▶';
}

// ── desenho do visor ──
function veRotoTelaGeom() {
    const T = VERO.tela, st = VERO.st[T.rid], bw = Math.max(40, T.visor.clientWidth - 16), bh = Math.max(40, T.visor.clientHeight - 16);
    const asp = st && st.w && st.h ? st.w / st.h : VE.seqW / VE.seqH;
    let w = bw, h = bw / asp; if (h > bh) { h = bh; w = bh * asp; }
    return { w: Math.round(w), h: Math.round(h) };
}
function veRotoQuadroImg(st, i) {   // o quadro do vídeo (JPEG que o Python extraiu)
    const T = VERO.tela;
    if (T.imgI === i && T.img && T.img.ok) return T.img.im;
    const chave = `${st.rid}|q${i}`;
    let e = VERO.img.get(chave);
    if (!e) {
        const im = new Image(); im.crossOrigin = 'anonymous'; e = { im, ok: false };
        im.onload = () => { e.ok = true; veRotoTelaDesenhar(); };
        im.src = `${st.url_q}q_${String(i).padStart(5, '0')}.jpg`;
        VERO.img.set(chave, e);
    }
    if (e.ok) { T.img = e; T.imgI = i; return e.im; }
    return T.img && T.img.ok ? T.img.im : null;   // enquanto carrega, o anterior
}
function veRotoTelaDesenhar() {
    const T = VERO.tela; if (!T || T.el.hidden) return;
    const c = veRotoTelaClipe(), st = VERO.st[T.rid], cv = T.cv, { w, h } = veRotoTelaGeom();
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const x = cv.getContext('2d'); x.clearRect(0, 0, w, h);
    veRotoTelaRegua(c, st);
    if (!c || !st) return;
    const i = veRotoQuadro(st, c);
    T.hora.textContent = i < 0 ? '—' : `${veT('quadro')} ${i + 1}/${st.n}`;
    veRotoTelaStatus();
    if (!st.extraido) { x.fillStyle = '#888'; x.font = '14px sans-serif'; x.fillText(veT('Lendo os quadros do vídeo…'), 16, 28); return; }
    const q = i >= 0 ? veRotoQuadroImg(st, i) : null, mk = i >= 0 ? veRotoImg(st, i) : null;
    const tmp = veFxCanvas(4, w, h), t = tmp.ctx;
    if (T.vista === 'xadrez' && mk) {
        const n = 12; for (let yy = 0; yy < h; yy += n) for (let xx = 0; xx < w; xx += n) { x.fillStyle = ((xx + yy) / n) % 2 ? '#bbb' : '#eee'; x.fillRect(xx, yy, n, n); }
        if (q) {
            t.clearRect(0, 0, w, h); t.drawImage(q, 0, 0, w, h); t.globalCompositeOperation = 'destination-in'; t.drawImage(mk, 0, 0, w, h);
            const cor = veRotoImg(st, i, false, 'c');   // como vai sair na exportação: borda descontaminada
            if (cor && veRotoParamsDe((veRotoFx(c) || {}).v || {}).descont > 0) { t.globalCompositeOperation = 'source-atop'; t.drawImage(cor, 0, 0, w, h); }
            t.globalCompositeOperation = 'source-over'; x.drawImage(tmp.cv, 0, 0);
        }
    } else if (T.vista === 'alfa' && mk) {
        x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.drawImage(mk, 0, 0, w, h);
    } else {
        if (q) x.drawImage(q, 0, 0, w, h);
        if (mk) {   // fora do recorte escurece um pouco; contorno rosa (como no After)
            t.clearRect(0, 0, w, h); t.fillStyle = 'rgba(0,0,0,0.45)'; t.fillRect(0, 0, w, h);
            t.globalCompositeOperation = 'destination-out'; t.drawImage(mk, 0, 0, w, h); t.globalCompositeOperation = 'source-over';
            x.drawImage(tmp.cv, 0, 0);
            const o = veFxCanvas(5, w, h), oc = o.ctx;   // contorno: máscara menos ela mesma deslocada
            oc.clearRect(0, 0, w, h); oc.drawImage(mk, 0, 0, w, h);
            const im = oc.getImageData(0, 0, w, h), d = im.data, out = t.createImageData(w, h), od = out.data;
            for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
                const k = (yy * w + xx) * 4, a0 = d[k + 3] > 127;   // a máscara vem no canal de transparência
                if (a0 !== (d[k + 7] > 127) || a0 !== (d[k + w * 4 + 3] > 127)) { od[k] = 255; od[k + 1] = 60; od[k + 2] = 200; od[k + 3] = 255; }
            }
            t.putImageData(out, 0, 0); x.drawImage(tmp.cv, 0, 0);
        }
    }
    // traços do quadro-base atual (e o que está sendo pintado)
    const f = veRotoFx(c), tr = ((f && f.v.rd && f.v.rd.tr) || {})[i] || [];
    [...tr, ...(T.traco ? [T.traco] : [])].filter(s => s.p && s.p.length).forEach(s => {
        x.save(); x.lineCap = x.lineJoin = 'round'; x.lineWidth = Math.max(2, s.r * h * 2);
        x.strokeStyle = s.l ? 'rgba(40,220,90,0.55)' : 'rgba(240,60,60,0.55)';
        x.beginPath(); s.p.forEach(([px, py], k) => k ? x.lineTo(px * w, py * h) : x.moveTo(px * w, py * h));
        if (s.p.length === 1) x.lineTo(s.p[0][0] * w + 0.1, s.p[0][1] * h);
        x.stroke(); x.restore();
    });
    if (T.cursor) {   // círculo do pincel
        x.save(); x.strokeStyle = T.modo && !T.alt ? '#39e07a' : '#ff5a5a'; x.lineWidth = 1.5;
        x.beginPath(); x.arc(T.cursor[0] * w, T.cursor[1] * h, Math.max(2, T.raio * h), 0, Math.PI * 2); x.stroke(); x.restore();
    }
}
// régua: verde = quadros já recortados; ◆ = quadros-base; linha = agulha
function veRotoTelaRegua(c, st) {
    const T = VERO.tela, cv = T.regua, w = Math.max(100, cv.clientWidth), h = Math.max(20, cv.clientHeight);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const x = cv.getContext('2d'); x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(0, h / 2 - 5, w, 10);
    if (!c || !st) return;
    const n = st.n, X = i => (i + 0.5) / n * w;
    x.fillStyle = '#2fbf6a';
    for (let i = 0; i < n;) { if (!st.ver[i]) { i++; continue; } let k = i; while (k < n && st.ver[k]) k++; x.fillRect(i / n * w, h / 2 - 5, (k - i) / n * w, 10); i = k; }
    x.fillStyle = '#ffd34d';
    Object.keys(st.bases || {}).forEach(q => { const cx = X(+q); x.beginPath(); x.moveTo(cx, h / 2 - 9); x.lineTo(cx + 6, h / 2); x.lineTo(cx, h / 2 + 9); x.lineTo(cx - 6, h / 2); x.fill(); });
    const i = veRotoQuadro(st, c); if (i >= 0) { x.fillStyle = '#4da3ff'; x.fillRect(X(i) - 1, 0, 2, h); }
}
function veRotoReguaApertar(e) {
    const T = VERO.tela, c = veRotoTelaClipe(), st = VERO.st[T.rid]; if (!c || !st) return;
    T.play = null; T.el.querySelector('[data-roacao="play"]').textContent = '▶';
    const ir = ev => {
        const r = T.regua.getBoundingClientRect(), i = Math.max(0, Math.min(st.n - 1, Math.floor((ev.clientX - r.left) / r.width * st.n)));
        // quadro i do trecho → instante da timeline (meio do quadro)
        veSeek(Math.max(c.st, Math.min(veEnd(c) - 1e-3, c.st + ((st.a + (i + 0.5) / st.fps) - c.s) / veVel(c))));
    };
    ir(e);
    const mv = ev => ir(ev), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}

// ── pintar ──
function veRotoTelaPos(e) {
    const r = VERO.tela.cv.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
}
function veRotoTelaApertar(e) {
    const T = VERO.tela, c = veRotoTelaClipe(), st = VERO.st[T.rid]; if (!c || !st || e.button !== 0) return;
    if (!st.extraido) { veToast(veT('Espere ler os quadros do vídeo')); return; }
    const i = veRotoQuadro(st, c); if (i < 0) return;
    e.preventDefault(); T.cv.setPointerCapture(e.pointerId);
    T.play = null;
    if (e.ctrlKey) {   // Ctrl+arrastar: tamanho do pincel
        const x0 = e.clientX, r0 = T.raio;
        const mv = ev => { T.raio = Math.max(0.005, Math.min(0.15, r0 + (ev.clientX - x0) / 600)); T.tam.value = T.raio; veRotoTelaDesenhar(); };
        const up = () => { T.cv.removeEventListener('pointermove', mv); T.cv.removeEventListener('pointerup', up); };
        T.cv.addEventListener('pointermove', mv); T.cv.addEventListener('pointerup', up);
        return;
    }
    T.traco = { l: e.altKey ? 0 : T.modo, r: +T.raio.toFixed(4), p: [veRotoTelaPos(e).map(v => +v.toFixed(4))] };
    const mv = ev => {
        const p = veRotoTelaPos(ev).map(v => +v.toFixed(4)), u = T.traco.p[T.traco.p.length - 1];
        if (Math.hypot(p[0] - u[0], p[1] - u[1]) > 0.004) { T.traco.p.push(p); T.cursor = p; veRotoTelaDesenhar(); }
    };
    const up = () => {
        T.cv.removeEventListener('pointermove', mv); T.cv.removeEventListener('pointerup', up);
        const s = T.traco; T.traco = null; if (s && s.p.length > 64) s.p = s.p.filter((_, k) => k % Math.ceil(s.p.length / 64) === 0 || k === s.p.length - 1);
        if (s) veRotoAddTraco(c, i, s);
    };
    T.cv.addEventListener('pointermove', mv); T.cv.addEventListener('pointerup', up);
    veRotoTelaDesenhar();
}
function veRotoMudarTracos(c, i, fn) {
    const f = veRotoFx(c); if (!f) return;
    vePushHistory();
    const rd = { ...f.v.rd, tr: { ...(f.v.rd.tr || {}) } };
    const lista = fn([...(rd.tr[i] || [])]);
    if (lista.length) rd.tr[i] = lista; else delete rd.tr[i];
    veFxEdit(f.id, x => { x.v.rd = rd; return x; });
    const st = VERO.st[rd.rid];
    if (st) {
        st.bases = { ...(st.bases || {}) };
        if (lista.length) st.bases[i] = veRotoPontos(lista); else delete st.bases[i];
        window.pywebview.api.ve_roto_base(rd.rid, i, lista.length ? st.bases[i] : [], veRotoSeguir()).then(() => { st.vigiar = true; veRotoVigiar(); });
    }
    veRotoTelaDesenhar();
}
const veRotoAddTraco = (c, i, s) => veRotoMudarTracos(c, i, l => [...l, s]);
function veRotoApagarBase() {
    const T = VERO.tela, c = veRotoTelaClipe(), st = VERO.st[T.rid]; if (!c || !st) return;
    const i = veRotoQuadro(st, c), f = veRotoFx(c);
    if (i < 0 || !(f.v.rd.tr || {})[i]) { veToast(veT('Este quadro não é quadro-base')); return; }
    veRotoMudarTracos(c, i, () => []);
}
function veRotoTelaTecla(e) {
    const T = VERO.tela; if (!T || T.el.hidden) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
    const c = veRotoTelaClipe(), st = VERO.st[T.rid];
    T.alt = e.altKey;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); veRotoTelaFechar(); return; }
    if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); veRotoTelaPlay(); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'PageUp' || e.key === 'PageDown') && c && st) {
        e.preventDefault(); e.stopPropagation(); T.play = null;
        const d = (e.key === 'ArrowLeft' || e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 10 : 1);
        const i = Math.max(0, Math.min(st.n - 1, veRotoQuadro(st, c) + d));
        veSeek(Math.max(c.st, Math.min(veEnd(c) - 1e-3, c.st + ((st.a + (i + 0.5) / st.fps) - c.s) / veVel(c))));
        return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); veRotoApagarBase(); return; }
    if (!e.ctrlKey && !e.altKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); e.stopPropagation(); veRotoFreeze(); return; }
    // Ctrl+Z / Ctrl+Shift+Z ficam com o editor (os traços estão no efeito); depois, ressincroniza com o Python
    if (e.ctrlKey && /^[zy]$/i.test(e.key)) setTimeout(() => { const f = veRotoFx(c); if (f && st) veRotoSincronizar(f.v.rd, st).then(() => { st.vigiar = true; veRotoVigiar(); veRotoTelaDesenhar(); }); }, 50);
    if (!e.ctrlKey && !e.metaKey) e.stopPropagation();   // as letras não viram atalho da timeline atrás da tela
}
window.addEventListener('keyup', e => { if (VERO.tela) VERO.tela.alt = e.altKey; }, true);

// API para testes e para a Kani: VEROTO_API.abrir(c), .tracar(c, quadro, [[x, y]...], soma), .estado(c)
const VEROTO_API = {
    abrir: c => veRotoTelaAbrir(c || VE.clips[VE.sel]),
    freeze: () => veRotoFreeze(),
    assunto: () => veRotoAssunto(),
    seguir(v) { try { localStorage.setItem('ve-roto-seguir', v ? '1' : '0'); } catch (e) { /* sem armazenamento */ } if (VERO.tela) VERO.tela.seguir.checked = !!v; },
    tracar(c, i, pts, soma = true, raio = 0.03) { c = c || VE.clips[VE.sel]; veRotoAddTraco(c, i, { l: soma ? 1 : 0, r: raio, p: pts }); },
    esperar(c) { c = c || VE.clips[VE.sel]; const f = veRotoFx(c); return f && f.v.rd ? veRotoEsperar(f.v.rd.rid) : null; },
    estado(c) { c = c || VE.clips[VE.sel]; const f = veRotoFx(c), st = f && f.v.rd && VERO.st[f.v.rd.rid]; return st ? { n: st.n, prontos: st.ver.filter(Boolean).length, rodando: !!(st.rodando || st.fila), erro: st.erro || '', bases: Object.keys(st.bases || {}).map(Number), pend: st.pend || [], qual: st.qual || '', msg: st.msg || '' } : null; },
    quadro: (c, T) => { c = c || VE.clips[VE.sel]; const f = veRotoFx(c), st = f && VERO.st[f.v.rd.rid]; return st ? veRotoQuadro(st, c, T) : -1; },
};
window.VEROTO_API = VEROTO_API;
