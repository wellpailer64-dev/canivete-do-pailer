// =========================================================
// Pocket Editor — AutoFrame: vídeo no ritmo da música a partir de uma pasta de fotos e vídeos
// (no espírito dos modelos com batida do CapCut). O Python (Functions/autoframe.py) analisa a música (batidas,
// compassos, energia, drop) e as mídias (nitidez, exposição, cor, rostos, movimento, ponto de interesse),
// recomenda modelos e monta o plano (slots × mídia pelo algoritmo húngaro). Aqui o plano vira uma TIMELINE NOVA,
// normal e editável: clipes 9:16 enquadrados no rosto/ponto de interesse, quadros-chave (Ken Burns, zoom-soco,
// pan), transições, cor (camada de ajuste com Luz e Cor), título animado e a música com fade.
// Duas abas: Quick AutoFrame (avulso, aqui) e AutoFrame Customizado (modelos de cliente: editor-autoframe-cliente.js).
// =========================================================

const VEAF = {
    itens: [],              // o que foi escolhido/arrastado: [{path, pasta}]
    midias: [],             // análise de cada foto/vídeo (resumo)
    fora: new Set(),        // caminhos desmarcados pelo usuário (os ruins já vêm desmarcados)
    musica: null,           // {path, dur, bpm, beats, downbeats, energia, secoes, drop}
    musicaPath: null,
    modelos: [], modelo: null,
    dur: 0, ordem: 'inteligente', titulo: '', semente: 1,
    inicioModo: 'agitada', manual: null, inicioT: null,   // onde o vídeo começa na música
    telas: 'sim',           // telas divididas (várias cenas no mesmo quadro, entrando na batida)
    analisando: false, progresso: '', pct: 0,
    aba: 'quick', cli: null, cliMus: 0,                    // aba e modelo de cliente em uso (Customizado)
};
const VE_AF_W = 1080, VE_AF_H = 1920;   // 9:16
// estilo Dinâmico: transições que se alternam na virada do compasso (nunca a mesma duas vezes seguidas)
const VE_AF_MISTO = ['push', 'pull', 'slide', 'chicote', 'pop', 'fold'];
const VE_AF_NOTA_MIN = 0.3;             // abaixo disso a mídia já vem desmarcada
const VE_AF_LOOKS = {
    vivo: { sat: 115, ct: 12, vib: 15 },
    suave: { fade: 18, sat: 92, hi: -10 },
    quente: { temp: 18, sat: 108, ct: 6 },
    filme: { fade: 14, ct: 16, sat: 84, temp: 6 },
};

const veAfApi = () => window.pywebview && window.pywebview.api;
const veAfNome = p => String(p || '').split(/[\\/]/).pop();
const veAfPaths = () => VEAF.midias.filter(m => !VEAF.fora.has(m.path)).map(m => m.path);

// ── abrir (menu Janela, tela inicial) ──
function veAfAbrir() {
    VEAF.aberto = true;
    if (!VE.ready) VE.startScreenDismissed = true;   // sai da tela inicial para o painel
    if (typeof vedShow === 'function') vedShow('autoframe');
    if (typeof veOnboardingRender === 'function') veOnboardingRender();
    veAfRender();
}

// ── entrada: pasta, arquivos, arrastar ──
function veAfEscolher(tipo) {
    const api = veAfApi();
    if (!api) return;
    api.af_escolher(tipo).then(r => {
        if (!r || !r.success) return;
        if (tipo === 'musica') { VEAF.musicaPath = r.paths[0]; VEAF.musica = null; veAfAnalisar(); return; }
        veAfAdicionar(r.paths.map(p => ({ path: p, pasta: tipo === 'pasta' })));
    });
}

// Chamado pelo veDropFiles quando o arrasto cai no painel AutoFrame
function veAfSoltouAqui(drop) {
    const box = $ve('ve-af');
    const doc = drop && drop.doc || document;
    if (!box || !drop || box.ownerDocument !== doc || !box.offsetParent) return false;
    const r = box.getBoundingClientRect();
    return r.width > 0 && drop.x >= r.left && drop.x <= r.right && drop.y >= r.top && drop.y <= r.bottom;
}

function veAfAdicionar(itens) {
    if (VEAF.aba === 'custom' && !VEAF.cli) { veToast(veT('Clique em Começar num modelo antes de mandar o material')); return; }
    const musica = VEAF.cli ? null : itens.find(i => !i.pasta && EXT_AUDIO.test(i.path) && !EXT_VIDEO.test(i.path));
    if (musica) { VEAF.musicaPath = musica.path; VEAF.musica = null; }
    const novos = itens.filter(i => i !== musica && !VEAF.itens.some(x => x.path === i.path));
    VEAF.itens.push(...novos);
    veAfAnalisar();
}

function veAfLimpar() {
    VEAF.itens = [];
    VEAF.midias = [];
    VEAF.fora.clear();
    VEAF.modelos = [];
    VEAF.modelo = null;
    veAfRender();
}

function veAfAnalisar() {
    const api = veAfApi();
    if (!api || (!VEAF.itens.length && !VEAF.musicaPath)) { veAfRender(); return; }
    VEAF.analisando = true;
    VEAF.pct = 0;
    VEAF.progresso = veT('Preparando...');
    VEAF.midias = [];
    veAfRender();
    api.af_analisar(VEAF.musicaPath, VEAF.itens);
}

// Eventos do Python
function veOnAF(ev) {
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return; } }
    if (ev.etapa === 'lista') { VEAF.total = ev.n; VEAF.progresso = `${ev.n} ${veT('mídias encontradas')}`; }
    else if (ev.etapa === 'musica') { VEAF.progresso = veT('Ouvindo a música (batidas e energia)...'); VEAF.pct = ev.pct * 0.3; }
    else if (ev.etapa === 'midia') {
        VEAF.progresso = `${veT('Analisando')} ${ev.i + 1}/${ev.n} · ${veAfNome(ev.path)}`;
        VEAF.pct = 30 + (ev.i / Math.max(1, ev.n)) * 70;
    } else if (ev.etapa === 'midia_ok') {
        VEAF.midias.push(ev.midia);
        if (ev.midia.nota < VE_AF_NOTA_MIN) VEAF.fora.add(ev.midia.path);
    } else if (ev.etapa === 'fim') {
        VEAF.analisando = false;
        VEAF.pct = 100;
        if (ev.musica) VEAF.musica = ev.musica;
        VEAF.midias = ev.midias;
        VEAF.midias.forEach(m => { if (m.repetida_de) VEAF.fora.add(m.path); });   // repetidas/quase iguais
        VEAF.progresso = '';
        veAfRecomendar();
    } else if (ev.etapa === 'erro') {
        VEAF.analisando = false;
        VEAF.progresso = '';
        veToast(veT('AutoFrame: ') + ev.error);
    }
    veAfRender();
}

function veAfRecomendar() {
    const api = veAfApi();
    if (!api || !VEAF.musica || !veAfPaths().length) { VEAF.modelos = []; veAfRender(); return; }
    api.af_recomendar(VEAF.musicaPath, veAfPaths(), VEAF.dur || null, VEAF.inicioModo, VEAF.manual).then(r => {
        VEAF.modelos = (r && r.success && r.modelos) || [];
        VEAF.inicioT = r && r.success ? r.inicio : null;
        if (!VEAF.modelos.some(m => m.id === VEAF.modelo)) VEAF.modelo = VEAF.modelos[0] ? VEAF.modelos[0].id : null;
        // modelo de cliente com estilo fixo: ele manda
        if (VEAF.cli && VEAF.cli.estilo !== 'auto' && VEAF.modelos.some(m => m.id === VEAF.cli.estilo)) VEAF.modelo = VEAF.cli.estilo;
        veAfRender();
    });
}

// ── gerar: plano → timeline ──
function veAfEnquadrar(w, h, fx, fy, zoom = 1) {
    // cobre o quadro 9:16 inteiro e põe o ponto de interesse (rosto/saliência) o mais perto possível do centro
    const k = Math.max(VE_AF_W / w, VE_AF_H / h) * zoom;
    const lx = w * k / 2, ly = h * k / 2;
    const x = Math.min(lx, Math.max(VE_AF_W - lx, VE_AF_W / 2 + (0.5 - (fx ?? 0.5)) * w * k));
    const y = Math.min(ly, Math.max(VE_AF_H - ly, VE_AF_H / 2 + (0.5 - (fy ?? 0.5)) * h * k));
    return { sc: Math.round(k * 10000) / 100, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

// Enquadramento que não corta ninguém: caixa = [x0, y0, x1, y1] (0..1) das cabeças até o peito (autoframe.py).
// zmax = quanto dá para aproximar (animação) sem a caixa sair do quadro; contem = a foto não cabe em 9:16 sem cortar
// alguém: entra inteira, sobre um fundo desfocado dela mesma
function veAfEnquadrarSeguro(w, h, caixa, fx, fy, folga = 1) {
    if (!caixa) return { ...veAfEnquadrar(w, h, fx, fy, folga), zmax: Infinity };
    const k = Math.max(VE_AF_W / w, VE_AF_H / h);
    const bw = Math.max(1, (caixa[2] - caixa[0]) * w), bh = Math.max(1, (caixa[3] - caixa[1]) * h);
    const zfit = Math.min(VE_AF_W / (k * bw), VE_AF_H / (k * bh));
    const cx = (caixa[0] + caixa[2]) / 2, cy = (caixa[1] + caixa[3]) / 2;
    if (zfit < 0.95) {
        const kc = Math.min(VE_AF_W / w, VE_AF_H / h);
        return { sc: Math.round(kc * 10000) / 100, x: VE_AF_W / 2, y: VE_AF_H / 2, zmax: 1.04, contem: true, cx, cy };
    }
    return { ...veAfEnquadrar(w, h, cx, cy, Math.min(folga, Math.max(1, zfit))), zmax: Math.max(1, zfit) };
}

const veAfEsperar = (cond, ms = 60000) => new Promise(res => {
    const t0 = Date.now();
    const f = () => (cond() ? res(true) : Date.now() - t0 > ms ? res(false) : setTimeout(f, 150));
    f();
});

// Mídia do projeto com esse arquivo, do tipo certo (projeto aberto por uma foto tem um "fundo preto" como
// mídia principal com o caminho da foto: ele não serve como a foto)
function veAfMidiaDe(path) {
    const n = p => String(p || '').replace(/\//g, '\\').toLowerCase();
    const tipo = VE_EXT_IMG.test(path) ? 'image' : EXT_AUDIO.test(path) && !EXT_VIDEO.test(path) ? 'audio' : 'video';
    return (VE.media || []).find(m => !m.removido && m.path && n(m.path) === n(path) && m.kind === tipo);
}

async function veAfGerar(outra) {
    const api = veAfApi();
    if (!api || !VEAF.musica || !VEAF.modelo || VEAF.gerando) return;
    if (outra) VEAF.semente++;
    VEAF.gerando = true;
    veAfRender();
    try {
        // modelo de cliente com "usar todas": a duração é a que faz todas as mídias entrarem (+ intro e encerramento)
        const cobrir = VEAF.cli && VEAF.cli.todas !== false ? veAfcExtraSeg(VEAF.cli, VEAF.musica.bpm) : null;
        const reserva = VEAF.cli ? veAfcReserva(VEAF.cli, VEAF.musica.bpm) : null;   // intro/encerramento sem cena embaixo
        const plano = await api.af_planejar(VEAF.musicaPath, veAfPaths(), VEAF.modelo, VEAF.dur || null, VEAF.ordem, VEAF.semente, VEAF.inicioModo, VEAF.manual, VEAF.telas !== 'nao', cobrir, reserva);
        if (!plano || !plano.success) throw new Error((plano && plano.error) || 'plano');
        // sem projeto aberto: a primeira mídia do plano abre o projeto
        if (!VE.ready) {
            veOpenPath(plano.slots[0].path);
            if (!await veAfEsperar(() => VE.ready)) throw new Error(veT('não consegui abrir a primeira mídia'));
        }
        veStop();
        // mídias no projeto (pasta AutoFrame)
        const cli = VEAF.cli, rotulo = cli ? cli.nome : plano.modelo.nome;
        const bin = typeof vePjNovoBin === 'function' ? vePjNovoBin('AutoFrame · ' + rotulo, null) : null;
        const precisa = [...new Set(plano.slots.map(s => s.path))].concat([VEAF.musicaPath]);
        for (const p of precisa) if (!veAfMidiaDe(p)) await vePjImportarArquivo(p, bin && bin.id);
        const extra = cli ? await veAfcPreparar(plano, bin) : null;
        if (!cli && plano.slots.some(s => s.flash)) plano.branco = await veAfBranco(bin && bin.id);
        const falta = precisa.filter(p => !veAfMidiaDe(p));
        if (falta.length) throw new Error(veT('não importou: ') + falta.map(veAfNome).join(', '));
        // tamanho dos vídeos desde já (a preparação de cada um ainda está na fila): cenas no lugar certo
        plano.slots.forEach(s => {
            const m = veAfMidiaDe(s.path);
            if (m && m.kind === 'video' && !(m.info && m.info.width) && s.w && s.h) { m.w = s.w; m.h = s.h; }
        });
        // timeline nova 9:16
        const seq = veCreateTimeline({ name: `AutoFrame · ${rotulo}`, pasta: bin && bin.id });
        if (!seq) throw new Error('timeline');
        veSeqQuadro(VE_AF_W, VE_AF_H);
        seq.w = VE_AF_W; seq.h = VE_AF_H;
        const clips = extra ? veAfcExtras(veAfClipes(plano), plano, extra) : veAfClipes(plano);
        VE.clips = clips;
        VE.markers = veAfMarcadores(plano);
        veEnsureTracks(Math.max(4, ...clips.map(c => c.tr + 1)));
        VE_TRK = veSeqTracks(null, VE.clips);
        veBuildHeads();
        veRelayout();
        VE.pps = veFitPps();
        VE.view = 0;
        VE.dirty = true;
        veUpdateTitle();
        veAfterEdit(0);
        veSeqSalvarAtiva();
        vePjRender();
        const uso = plano.uso ? ` · ${plano.uso.usadas}/${plano.uso.total} ${veT('mídias usadas')}${plano.uso.telas ? ` · ${plano.uso.telas} ${veT('telas divididas')}` : ''}` : '';
        if (cli && !outra) veAfApi().afm_usou(cli.id, VEAF.cliMus).then(r => { if (r && r.success) cli.musicaProx = r.musicaProx; });
        veToast(`AutoFrame: ${plano.slots.length} ${veT('cenas no ritmo')} (${Math.round(plano.bpm)} BPM)${uso} · ${veT('tudo editável na timeline')}`);
    } catch (e) {
        veToast(veT('AutoFrame não conseguiu gerar: ') + (e.message || e));
    } finally {
        VEAF.gerando = false;
        veAfRender();
    }
}

// Quadro 9:16 de uma cor (PNG) para o flash de impacto: branco, ou a cor de destaque do cliente; um por cor
async function veAfBranco(pasta, cor = '#ffffff') {
    const ja = (VE.media || []).find(m => m.kind === 'image' && !m.removido && m._afBranco && (m._afCor || '#ffffff') === cor);
    if (ja) return ja;
    const cv = document.createElement('canvas');
    cv.width = VE_AF_W; cv.height = VE_AF_H;
    const g = cv.getContext('2d');
    g.fillStyle = cor;
    g.fillRect(0, 0, cv.width, cv.height);
    const r = await veAfApi().ve_salvar_png(cv.toDataURL('image/png'));
    if (!r || !r.success) return null;
    await vePjImportarArquivo(r.path, pasta);
    const m = veAfMidiaDe(r.path);
    if (m) { m._afBranco = true; m._afCor = cor; m.nome = cor === '#ffffff' ? 'Flash (branco)' : `Flash (${cor})`; m.w = VE_AF_W; m.h = VE_AF_H; }
    return m;
}

// Célula de tela dividida: a mídia cobre a célula (foco no centro), o resto é cortado (fundo preto)
function veAfCelula(w, h, fx, fy, cel) {
    const k = Math.max(cel.w / w, cel.h / h), W = w * k, H = h * k;
    const cx = cel.x + cel.w / 2, cy = cel.y + cel.h / 2;
    const x = Math.min(cel.x + W / 2, Math.max(cel.x + cel.w - W / 2, cx + (0.5 - (fx ?? 0.5)) * W));
    const y = Math.min(cel.y + H / 2, Math.max(cel.y + cel.h - H / 2, cy + (0.5 - (fy ?? 0.5)) * H));
    const pc = v => Math.max(0, Math.round(v * 1000) / 10);
    return { sc: Math.round(k * 10000) / 100, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
        crop: { l: pc((cel.x - (x - W / 2)) / W), r: pc((x + W / 2 - cel.x - cel.w) / W), t: pc((cel.y - (y - H / 2)) / H), b: pc((y + H / 2 - cel.y - cel.h) / H) } };
}

function veAfClipes(plano) {
    const M = plano.modelo, t0 = plano.inicio, out = [], flashes = [];
    // trilhas: cenas na 0 (células da tela dividida nas 0..n-1); cor, flash e título por cima de todas
    const NV = Math.max(1, ...plano.slots.map(s => s.cel ? s.cel_i + 1 : 1));
    // a trilha logo acima das cenas recebe a foto inteira quando ela vai sobre fundo desfocado (enquadramento seguro)
    const TR_FR = NV, TR_AJ = NV + 1, TR_FL = NV + 2, TR_TX = NV + 3;
    const total = plano.fim - t0, bpm = plano.bpm || 120, batida = 60 / bpm;
    let nMisto = 0;
    plano.slots.forEach((s, i) => {
        // estilo Dinâmico: o movimento muda a cada cena (soco no acento/energia alta, zoom indo e voltando, pan)
        const anim = M.anim !== 'misto' ? M.anim : (s.acento || s.nivel === 2) ? 'soco' : ['kenburns', 'pan', 'kenburns', 'soco'][i % 4];
        const m = veAfMidiaDe(s.path), st = +(s.a - t0).toFixed(4), len = +(s.b - s.a).toFixed(4);
        if (!m || len <= 0.04) return;
        const video = s.tipo === 'video', s0 = video ? s.ini : 0, e0 = s0 + len;
        const c = { tr: 0, st, s: s0, e: e0, m: m.id };
        if (video) c.x = 'v';   // só a imagem: o som é o da música
        // enquadramento 9:16 com folga para a animação
        const folga = anim === 'pan' ? 1.1 : 1.0;
        // tamanho real da mídia no projeto, quando já conhecido, manda sobre o da análise (vídeo girado do celular)
        const real = m.kind === 'image' && m.w ? { w: m.w, h: m.h } : m.info && m.info.width ? { w: m.info.width, h: m.info.height } : null;
        if (real && (real.w > real.h) !== (s.w > s.h)) { s.w = real.w; s.h = real.h; }
        if (s.cel) {
            // tela dividida: cada célula entra na sua batida (sobe um pouco e aparece) e fica até o fim do quadro
            const cfx = s.caixa ? (s.caixa[0] + s.caixa[2]) / 2 : s.fx, cfy = s.caixa ? (s.caixa[1] + s.caixa[3]) / 2 : s.fy;
            const q = veAfCelula(s.w, s.h, cfx, cfy, s.cel), d = +Math.min(0.25, batida * 0.5, len * 0.5).toFixed(3);
            c.tr = s.cel_i;
            c.p = { sc: q.sc, x: q.x, y: q.y, rot: 0, op: 100 };
            c.fx = [{ id: veFxNewId(), t: 'crop', on: true, v: q.crop }];
            c.k = { op: [{ t: s0, v: 0, i: 'out' }, { t: +(s0 + d).toFixed(4), v: 100, i: 'lin' }],
                    y: [{ t: s0, v: +(q.y + 36).toFixed(1), i: 'out' }, { t: +(s0 + d).toFixed(4), v: q.y, i: 'lin' }] };
            if (anim === 'kenburns') c.k.sc = [{ t: s0, v: q.sc, i: 'lin' }, { t: e0, v: +(q.sc * 1.04).toFixed(2), i: 'lin' }];
            out.push(c);
            return;
        }
        const q = veAfEnquadrarSeguro(s.w, s.h, s.caixa, s.fx, s.fy, folga);
        // a animação nunca aproxima além do que deixa a caixa (cabeças) inteira no quadro
        const Z = f => Math.max(1, Math.min(f, q.zmax));
        const alvo = q.contem ? { ...c, tr: TR_FR, p: { sc: q.sc, x: q.x, y: q.y, rot: 0, op: 100 } } : c;
        if (q.contem) {
            // foto inteira por cima; a cena (que leva as transições) vira o fundo: a mesma foto cobrindo, desfocada e escura
            const kf = Math.max(VE_AF_W / s.w, VE_AF_H / s.h) * 110;
            c.p = { sc: +kf.toFixed(2), x: VE_AF_W / 2, y: VE_AF_H / 2, rot: 0, op: 100 };
            c.fx = [{ id: veFxNewId(), t: 'blur', on: true, v: { amt: 45 } }, { id: veFxNewId(), t: 'bc', on: true, v: { br: -35, ct: 0 } }];
            out.push(alvo);
        } else c.p = { sc: q.sc, x: q.x, y: q.y, rot: 0, op: 100 };
        // animação (quadros-chave em tempo da fonte)
        if (anim === 'kenburns') {
            const ida = i % 2 === 0, a = alvo.p.sc, b = +(alvo.p.sc * Z(1.12)).toFixed(2);
            alvo.k = { sc: [{ t: s0, v: ida ? a : b, i: 'lin' }, { t: e0, v: ida ? b : a, i: 'lin' }] };
        } else if (anim === 'soco') {
            // zoom-soco na batida: entra 15% maior (22% num acento) e assenta em ~1/2 batida, freando
            const k = Z(s.acento ? 1.22 : 1.15), d = Math.min(len * 0.6, batida * 0.5);
            alvo.k = { sc: [{ t: s0, v: +(alvo.p.sc * k).toFixed(2), i: 'out' }, { t: +(s0 + d).toFixed(4), v: alvo.p.sc, i: 'lin' }] };
            // variedade: cena longa sem acento, de vez em quando, avança devagar depois do soco
            if (!s.acento && len >= batida * 1.9 && i % 3 === 2) alvo.k.sc.push({ t: e0, v: +(alvo.p.sc * Z(1.07)).toFixed(2), i: 'lin' });
        } else if (anim === 'pan' && !q.contem) {
            // o deslize também respeita a caixa: com pouca folga, anda menos
            const amp = q.zmax === Infinity ? 40 : Math.max(0, Math.min(40, (q.zmax - 1) * 400));
            const lx = s.w * q.sc / 100 / 2, xmin = VE_AF_W - lx, xmax = lx, dir = i % 2 ? 1 : -1;
            const a = Math.min(xmax, Math.max(xmin, q.x - dir * amp)), b = Math.min(xmax, Math.max(xmin, q.x + dir * amp));
            if (amp > 1) c.k = { x: [{ t: s0, v: +a.toFixed(1), i: 'ease' }, { t: e0, v: +b.toFixed(1), i: 'lin' }] };
        }
        // transição de entrada, escolhida pelo modelo em cada corte (autoframe.py: _transicoes)
        const tr = s.trans, meio = batida / 2;
        if (tr === 'dissolve') c.tin = { t: 'dissolve', d: +Math.min(M.id === 'memorias' ? 0.8 : 0.6, len * 0.35).toFixed(3), speed: 'fast' };
        else if (tr === 'zoom') c.tin = { t: 'pull', d: +Math.min(0.35, meio, len * 0.4).toFixed(3), speed: 'fast' };
        else if (tr === 'chicote') c.tin = { t: 'chicote', d: +Math.min(0.32, meio, len * 0.4).toFixed(3), speed: 'fast', dir: i % 4 < 2 ? 'l' : 'r' };
        else if (tr === 'preto') c.tin = { t: 'fadeblack', d: +Math.min(0.8, len * 0.4).toFixed(3), speed: 'fast' };
        else if (tr === 'misto') {
            const t = VE_AF_MISTO[nMisto++ % VE_AF_MISTO.length];
            c.tin = { t, d: +Math.min(0.4, meio * 1.2, len * 0.45).toFixed(3), speed: 'fast', ...(VE_TR[t] && VE_TR[t].dir ? { dir: ['r', 'l', 'u', 'd'][nMisto % 4] } : {}) };
        }
        else if (tr && tr.startsWith('tr:') && VE_TR[tr.slice(3)]) {
            // transição escolhida no modelo do cliente (direção alternando)
            const t = tr.slice(3), longa = t === 'dissolve' || t === 'crossfade' || t === 'fadeblack';
            c.tin = { t, d: +Math.min(longa ? 0.6 : 0.4, len * 0.4).toFixed(3), speed: 'fast', ...(VE_TR[t].dir ? { dir: i % 4 < 2 ? 'l' : 'r' } : {}) };
        }
        if (alvo !== c && c.tin) alvo.tin = { ...c.tin };
        // flash de impacto: clarão branco que some em ~meia batida, começando no corte
        if (s.flash && plano.branco) {
            const d = +Math.min(0.35, batida * 0.6, len).toFixed(3);
            flashes.push({ tr: TR_FL, st: Math.max(0, +(st - 0.02).toFixed(4)), s: 0, e: d, m: plano.branco.id,
                p: { sc: 100, x: VE_AF_W / 2, y: VE_AF_H / 2, rot: 0, op: 100 },
                k: { op: [{ t: 0, v: 92, i: 'out' }, { t: d, v: 0, i: 'lin' }] } });
        }
        out.push(c);
    });
    // fim: a última cena escurece até o preto no último compasso (sinaliza que acabou)
    const ultima = out.filter(c => !c.fx || !c.fx.some(f => f.t === 'crop')).pop();
    if (ultima) ultima.tout = { t: 'fadeblack', d: +Math.min(2, batida * 4, (ultima.e - ultima.s) * 0.8).toFixed(3), speed: 'fast' };
    out.push(...flashes);
    // cor: camada de ajuste com Luz e Cor por cima de tudo
    const look = VE_AF_LOOKS[M.cor];
    if (look && typeof veLcDefaults === 'function') {
        let aj = VE.media.find(x => x.kind === 'ajuste' && !x.removido);
        if (!aj) { aj = { id: VE.media.length, kind: 'ajuste', name: 'Camada de ajuste' }; VE.media.push(aj); }
        out.push({ tr: TR_AJ, st: 0, s: 0, e: +total.toFixed(4), m: aj.id, fx: [{ id: veFxNewId(), t: 'lc', on: true, v: { ...veLcDefaults(), ...look } }] });
    }
    // título (opcional): entra subindo, sai com fade
    if (VEAF.titulo.trim() && !VEAF.cli && typeof veTxMidia === 'function') {   // no Customizado o título vai na intro
        const tm = veTxMidia(), dur = Math.min(total, Math.max(2.5, batida * 8));
        out.push({ tr: TR_TX, st: 0, s: 0, e: +dur.toFixed(3), m: tm.id,
            tx: { ...VE_TX_PADRAO, t: VEAF.titulo.trim(), tam: 120, alin: 'center', sOn: true, sOp: 70, sBlur: 18 },
            p: { sc: 100, x: VE_AF_W / 2, y: VE_AF_H * 0.42, rot: 0, op: 100 },
            txa: typeof veTxaObj === 'function' ? { in: veTxaObj('subir'), out: veTxaObj('fade') } : undefined });
    }
    // música com fade no último compasso
    const mu = veAfMidiaDe(VEAF.musicaPath);
    if (mu) out.push({ tr: 0, st: 0, s: +t0.toFixed(4), e: +plano.fim.toFixed(4), m: mu.id, atout: { t: 'cp', d: +Math.min(2.5, batida * 4).toFixed(3) } });
    return out;
}

function veAfMarcadores(plano) {
    const t0 = plano.inicio, nomes = ['Calmo', 'Médio', 'Alto'], cores = ['#38bdf8', '#f59e0b', '#ef4444'];
    const ms = (VEAF.musica.secoes || []).filter(s => s.t >= t0 - 0.01 && s.t < plano.fim)
        .map(s => ({ t: +(Math.max(0, s.t - t0)).toFixed(4), cor: cores[s.nivel], nome: veT(nomes[s.nivel]) }));
    if (VEAF.musica.drop != null && VEAF.musica.drop >= t0 && VEAF.musica.drop < plano.fim)
        ms.push({ t: +(VEAF.musica.drop - t0).toFixed(4), cor: '#a855f7', nome: 'Drop' });
    return ms.sort((a, b) => a.t - b.t);
}

// ── painel ──
function veAfRender() {
    const box = $ve('ve-af');
    if (!box) return;
    const n = VEAF.midias.length, usados = veAfPaths().length;
    const fotos = VEAF.midias.filter(m => m.tipo === 'foto').length, videos = n - fotos;
    const mus = VEAF.musica;
    const pill = (grupo, v, txt) => `<button class="ve-af-pill${VEAF[grupo] === v ? ' on' : ''}" data-af-set="${grupo}" data-v="${v}">${txt}</button>`;
    const abas = `<div class="ve-af-abas"><button class="${VEAF.aba !== 'custom' ? 'on' : ''}" data-af-aba="quick">Quick AutoFrame</button>` +
        `<button class="${VEAF.aba === 'custom' ? 'on' : ''}" data-af-aba="custom">${veT('AutoFrame Customizado')}</button></div>`;
    if (VEAF.aba === 'custom' && !VEAF.cli) { box.innerHTML = abas + veAfcTela(); return; }
    const cli = VEAF.cli, fixo = cli && cli.estilo !== 'auto';
    box.innerHTML = abas + (cli ? veAfcCabecalho() : '') + `
        <div class="ve-af-sec">
            <div class="ve-af-h"><b>1</b> ${veT('Fotos e vídeos')}</div>
            <div class="ve-af-drop">
                <div class="ve-af-botoes">
                    <button class="ve-btn ve-btn-sm" data-af="pasta"><svg class="i"><use href="#i-folder"/></svg> ${veT('Escolher pasta')}</button>
                    <button class="ve-btn ve-btn-sm" data-af="midias"><svg class="i"><use href="#i-image"/></svg> ${veT('Escolher arquivos')}</button>
                    ${n ? `<button class="ve-btn ve-btn-sm ve-btn-ghost" data-af="limpar">${veT('Limpar')}</button>` : ''}
                </div>
                <span>${n ? `${usados}/${n} ${veT('em uso')} · ${fotos} ${veT('fotos')}, ${videos} ${veT('vídeos')}${VEAF.midias.some(m => m.repetida_de) ? ` · ${VEAF.midias.filter(m => m.repetida_de).length} ${veT('repetidas fora')}` : ''} · ${veT('clique para tirar ou pôr')}` : veT('ou arraste uma pasta ou arquivos para cá')}</span>
            </div>
            ${n ? `<div class="ve-af-grade">${VEAF.midias.map(m => `
                <button class="ve-af-mid${VEAF.fora.has(m.path) ? ' fora' : ''}" data-af-mid="${veEsc(m.path)}" title="${veEsc(veAfNome(m.path))} · ${veT('nota')} ${Math.round(m.nota * 100)}${m.repetida_de ? ` · ${veT('repetida de')} ${veEsc(veAfNome(m.repetida_de))}` : ''}">
                    ${m.repetida_de ? `<b class="ve-af-rep">${veT('repetida')}</b>` : ''}
                    ${m.thumb ? `<img src="${veEsc(m.thumb)}" alt="" loading="lazy">` : ''}
                    <i class="${m.nota >= 0.6 ? 'boa' : m.nota >= VE_AF_NOTA_MIN ? 'media' : 'ruim'}">${Math.round(m.nota * 100)}</i>
                    ${m.tipo === 'video' ? `<em>${Math.round(m.dur || 0)}s</em>` : ''}
                </button>`).join('')}</div>` : ''}
        </div>
        <div class="ve-af-sec">
            <div class="ve-af-h"><b>2</b> ${veT('Música')}</div>
            <div class="ve-af-drop">
                ${cli ? veAfcMusicas() : `<div class="ve-af-botoes"><button class="ve-btn ve-btn-sm" data-af="musica"><svg class="i"><use href="#i-music"/></svg> ${veT(VEAF.musicaPath ? 'Trocar música' : 'Escolher música')}</button></div>`}
                <span>${VEAF.musicaPath ? `<b>${veEsc(veAfNome(VEAF.musicaPath))}</b>${mus ? ` · ${Math.round(mus.bpm)} BPM · ${veShort(mus.dur)}${mus.drop != null ? ` · drop ${veShort(mus.drop)}` : ''}` : ''}` : veT('MP3, WAV, M4A... (arrastar também funciona)')}</span>
            </div>
            ${mus ? `<div class="ve-af-op"><span>${veT('Começar em')}</span>${pill('inicioModo', 'inicio', veT('Início'))}${pill('inicioModo', 'refrao', veT('Refrão'))}${pill('inicioModo', 'agitada', veT('Mais agitada'))}${pill('inicioModo', 'manual', veT('Manual'))}</div>
            <canvas class="ve-af-onda" id="ve-af-onda" title="${veT('Clique para escolher onde a música começa')}"></canvas>
            <small class="ve-af-info">${VEAF.inicioT != null ? `${veT('Começa em')} ${veShort(VEAF.inicioT)}` : ''}${mus.refrao ? ` · ${veT('refrão em')} ${mus.refrao.ocorrencias.map(veShort).join(', ')}` : ''}</small>` : ''}
        </div>
        ${VEAF.analisando || VEAF.progresso ? `<div class="ve-af-prog"><div style="width:${VEAF.pct.toFixed(0)}%"></div><span>${veEsc(VEAF.progresso)}</span></div>` : ''}
        <div class="ve-af-sec">
            <div class="ve-af-h"><b>3</b> ${veT(fixo ? 'Estilo do modelo' : 'Modelos recomendados')}</div>
            ${VEAF.modelos.length ? `<div class="ve-af-modelos">${VEAF.modelos.filter(m => !fixo || m.id === VEAF.modelo).map(m => `
                <button class="ve-af-mod${m.id === VEAF.modelo ? ' on' : ''}" data-af-mod="${m.id}">
                    <div class="ve-af-mod-top"><b>${veT(m.nome)}</b><span class="ve-af-nota" style="--p:${Math.round(m.nota * 100)}%">${Math.round(m.nota * 100)}%</span></div>
                    <p>${veT(m.desc)}</p>
                    <small>${m.slots} ${veT('cenas')} · ${veShort(m.dur)}</small>
                    ${m.aviso ? `<small class="ve-af-aviso">${veEsc(m.aviso)}</small>` : ''}
                </button>`).join('')}</div>`
                : `<div class="ve-af-vazio">${veT(!n ? 'Escolha as fotos e vídeos' : !VEAF.musicaPath ? 'Escolha a música' : VEAF.analisando ? 'Analisando...' : 'Nenhum modelo')}</div>`}
        </div>
        <div class="ve-af-sec">
            <div class="ve-af-h"><b>4</b> ${veT('Opções')}</div>
            <div class="ve-af-op"><span>${veT('Duração')}</span>${pill('dur', 0, veT('Música toda'))}${pill('dur', 15, '15 s')}${pill('dur', 30, '30 s')}${pill('dur', 60, '60 s')}</div>
            <div class="ve-af-op"><span>${veT('Telas divididas')}</span>${pill('telas', 'sim', veT('Sim'))}${pill('telas', 'nao', veT('Não'))}</div>
            <div class="ve-af-op"><span>${veT('Ordem')}</span>${pill('ordem', 'inteligente', veT('Inteligente'))}${pill('ordem', 'cronologica', veT('Cronológica'))}${pill('ordem', 'aleatoria', veT('Aleatória'))}</div>
            <div class="ve-af-op"><span>${veT(cli ? 'Texto da intro' : 'Título')}</span><input type="text" id="ve-af-titulo" value="${veEsc(VEAF.titulo)}" placeholder="${veT('opcional: aparece no começo')}"></div>
            <div class="ve-af-gerar">
                <button class="ve-btn ve-btn-primary" data-af="gerar" ${VEAF.modelo && mus && !VEAF.gerando ? '' : 'disabled'}><svg class="i"><use href="#i-sparkles"/></svg> ${veT(VEAF.gerando ? 'Gerando...' : 'Gerar vídeo')}</button>
                <button class="ve-btn" data-af="outra" ${VEAF.modelo && mus && !VEAF.gerando ? '' : 'disabled'} title="${veT('Mesma receita, outra escolha entre as mídias parecidas')}">${veT('Outra versão')}</button>
            </div>
            <p class="ve-af-dica">${veT('Cria uma timeline nova 9:16 no projeto, com cortes na batida, animações, transições e cor. Tudo continua editável.')}</p>
        </div>`;
    veAfOnda();
}

// forma de onda da energia com batidas, compassos, seções e drop
function veAfOnda() {
    const cv = $ve('ve-af-onda'), mu = VEAF.musica;
    if (!cv || !mu) return;
    const dpr = cv.ownerDocument.defaultView.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const X = t => t / mu.dur * W, cores = ['rgba(56,189,248,0.18)', 'rgba(245,158,11,0.18)', 'rgba(239,68,68,0.22)'];
    (mu.secoes || []).forEach((s, i) => {
        const fim = i + 1 < mu.secoes.length ? mu.secoes[i + 1].t : mu.dur;
        g.fillStyle = cores[s.nivel];
        g.fillRect(X(s.t), 0, X(fim) - X(s.t), H);
    });
    g.fillStyle = 'rgba(255,255,255,0.75)';
    mu.beats.forEach((t, i) => { const e = mu.energia[i] ?? 0.3; const h = 3 + e * (H - 8); g.fillRect(X(t), (H - h) / 2, 1, h); });
    g.fillStyle = '#F97316';
    (mu.downbeats || []).forEach(t => g.fillRect(X(t), H - 3, 1.5, 3));
    if (mu.drop != null) { g.fillStyle = '#a855f7'; g.fillRect(X(mu.drop) - 1, 0, 2, H); }
    // refrão (faixa amarela no alto) e o trecho que vai virar vídeo (moldura laranja)
    if (mu.refrao) { g.fillStyle = 'rgba(250,204,21,0.9)'; mu.refrao.ocorrencias.forEach(t => g.fillRect(X(t), 0, X(t + (mu.refrao.fim - mu.refrao.t)) - X(t), 3)); }
    if (VEAF.inicioT != null) {
        const mod = VEAF.modelos.find(m => m.id === VEAF.modelo), fim = VEAF.inicioT + (mod ? mod.dur : (VEAF.dur || mu.dur));
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, X(VEAF.inicioT), H);
        g.fillRect(X(fim), 0, W - X(fim), H);
        g.strokeStyle = '#F97316';
        g.lineWidth = 2;
        g.strokeRect(X(VEAF.inicioT) + 1, 1, X(fim) - X(VEAF.inicioT) - 2, H - 2);
    }
}

function veAfInit() {
    const box = $ve('ve-af');
    if (!box) return;
    box.addEventListener('click', e => {
        if (veAfcClick(e)) return;
        const a = e.target.closest('[data-af]'), mid = e.target.closest('[data-af-mid]'), mod = e.target.closest('[data-af-mod]'), set = e.target.closest('[data-af-set]');
        if (a) {
            const k = a.dataset.af;
            if (k === 'pasta' || k === 'midias' || k === 'musica') veAfEscolher(k);
            else if (k === 'limpar') veAfLimpar();
            else if (k === 'gerar') veAfGerar(false);
            else if (k === 'outra') veAfGerar(true);
        } else if (mid) {
            const p = mid.dataset.afMid;
            VEAF.fora.has(p) ? VEAF.fora.delete(p) : VEAF.fora.add(p);
            veAfRender();
            clearTimeout(VEAF.recT);
            VEAF.recT = setTimeout(veAfRecomendar, 300);
        } else if (mod) {
            VEAF.modelo = mod.dataset.afMod;
            veAfRender();
        } else if (set) {
            const g = set.dataset.afSet;
            VEAF[g] = g === 'dur' ? +set.dataset.v : set.dataset.v;
            if (g === 'inicioModo' && VEAF.inicioModo === 'manual' && VEAF.manual == null) VEAF.manual = VEAF.inicioT || 0;
            veAfRender();
            if (g === 'dur' || g === 'inicioModo') veAfRecomendar();
        }
        const onda = e.target.closest('#ve-af-onda');
        if (onda && VEAF.musica) {
            const r = onda.getBoundingClientRect();
            VEAF.manual = Math.max(0, (e.clientX - r.left) / r.width * VEAF.musica.dur);
            VEAF.inicioModo = 'manual';
            veAfRecomendar();
        }
    });
    box.addEventListener('input', e => { if (veAfcInput(e)) return; if (e.target.id === 've-af-titulo') VEAF.titulo = e.target.value; });
    box.addEventListener('keydown', e => e.stopPropagation());
    // arrastar para o painel (o caminho real chega pelo Python em veDropFiles → veAfSoltouAqui)
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drop'); if (typeof veGuardarDrop === 'function') veGuardarDrop(e); });
    box.addEventListener('dragleave', () => box.classList.remove('drop'));
    box.addEventListener('drop', e => { box.classList.remove('drop'); if (typeof veGuardarDrop === 'function') veGuardarDrop(e); });
    new ResizeObserver(veAfOnda).observe(box);
    veAfRender();
}

document.addEventListener('DOMContentLoaded', veAfInit);
window.veOnAF = veOnAF;
