// =========================================================
// Pocket Editor — importar PSD/PSB com as camadas separadas (como o "Composição — manter tamanhos das camadas" do
// After Effects). O Python (Functions/psd_import.py) grava um PNG por camada (máscara, recorte e efeitos de camada já
// desenhados nele) e devolve a árvore; aqui vira uma Comp no tamanho do documento, uma trilha por camada na mesma
// ordem (a de baixo na V1), cada uma na posição dela, com opacidade, modo de mesclagem e visibilidade (oculta =
// clipe desativado). Grupo = Comp dentro da Comp (com a opacidade/mesclagem do grupo); Brilho/Contraste = camada de
// ajuste. Tudo fica numa pasta "PSD · nome" do painel Projeto.
// Entradas: arrastar o arquivo (timeline ou Projeto), Importar do Projeto, Abrir arquivo. Sem nada aberto, o
// projeto começa no tamanho do documento com a Comp na timeline.
// =========================================================

const VE_EXT_PSD = /\.(psd|psb)$/i;
const VE_PSD_DUR = VE_IMG_DUR;   // duração das camadas (como a duração padrão de composição do AE)

const vePsdEsperar = async (fn, ms = 15000) => {
    for (let t = 0; t < ms; t += 100) { if (fn()) return true; await new Promise(r => setTimeout(r, 100)); }
    return !!fn();
};

async function vePsdLer(path) {
    veToast(`${veT('Lendo o PSD')}: ${path.split(/[\\/]/).pop()}...`);
    const r = await window.pywebview.api.ve_psd_importar(path);
    if (!r || !r.success) { veToast(`PSD: ${(r && r.error) || veT('não consegui ler o arquivo')}`); return null; }
    if (!r.camadas.length) { veToast(veT('PSD sem camadas visíveis para importar')); return null; }
    return r;
}

// ─────────── texto do PSD → texto editável ───────────
// A fonte vem pelo nome PostScript (Montserrat-ExtraBold); a busca compara só letras e números (BebasNeueRegular =
// BebasNeue-Regular). Sem a fonte exata, a mesma família no peso mais perto (com aviso); sem a família, fica imagem.
const vePsdNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const VE_PSD_PESOS = [['extralight', 200], ['ultralight', 200], ['semibold', 600], ['demibold', 600], ['extrabold', 800],
    ['ultrabold', 800], ['hairline', 100], ['thin', 100], ['light', 300], ['book', 400], ['regular', 400], ['normal', 400],
    ['roman', 400], ['medium', 500], ['bold', 700], ['black', 900], ['heavy', 900]];
const vePsdPeso = txt => { const n = vePsdNorm(txt); const p = VE_PSD_PESOS.find(([k]) => n.includes(k)); return p ? p[1] : 400; };

async function vePsdEstilos() {
    if (!VEPP.estilos) {
        const r = await window.pywebview.api.ve_fontes();
        if (r && r.success) { VEPP.fontes = r.fontes; VEPP.estilos = r.estilos || null; }
    }
    return VEPP.estilos || {};
}

function vePsdAcharFonte(ps, estilos) {
    const n = vePsdNorm(ps);
    if (!n) return null;
    for (const [fam, lista] of Object.entries(estilos))
        for (const e of lista) if ((e.ps && vePsdNorm(e.ps) === n) || vePsdNorm(fam + e.estilo) === n || (e.completo && vePsdNorm(e.completo) === n)) return { fam, e, exata: true };
    let melhor = null;
    for (const [fam, lista] of Object.entries(estilos)) {
        const f = vePsdNorm(fam);
        if (f.length >= 4 && n.startsWith(f) && (!melhor || f.length > melhor.f.length)) melhor = { fam, lista, f };
    }
    if (!melhor) return null;
    const resto = n.slice(melhor.f.length), ita = /italic|oblique/.test(resto), peso = vePsdPeso(resto);
    const e = [...melhor.lista].sort((a, b) => (a.italico !== ita) - (b.italico !== ita) || Math.abs(a.peso - peso) - Math.abs(b.peso - peso))[0];
    return { fam: melhor.fam, e, exata: false, peso };
}

// Caixa de parágrafo: o Photoshop quebra as linhas na largura da caixa; aqui a quebra vira nova linha (palavra inteira)
function vePsdQuebrar(x, larg) {
    const ctx = document.createElement('canvas').getContext('2d'), NL = String.fromCharCode(10);
    ctx.font = veTxFonte(x, x.tam);
    ctx.letterSpacing = (x.esp / 1000 * x.tam) + 'px';
    return String(x.t).split(NL).map(par => {
        const linhas = [];
        let atual = '';
        par.split(' ').forEach(p => {
            const tenta = atual ? atual + ' ' + p : p;
            if (atual && ctx.measureText(tenta).width > larg) { linhas.push(atual); atual = p; } else atual = tenta;
        });
        linhas.push(atual);
        return linhas.join(NL);
    }).join(NL);
}

// Retângulo da tinta (pixels desenhados, sem sombra/contorno/fundo) no canvas do texto: {l, t, r, b, w, h}
function vePsdTinta(x) {
    const d = veTxDesenho({ ...x, sOn: false, cOn: false, fOn: false }, 1), cv = d.cv;
    const px = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
    let l = cv.width, t = cv.height, r = -1, b = -1;
    for (let y = 0; y < cv.height; y++) for (let k = 0; k < cv.width; k++) {
        if (px[(y * cv.width + k) * 4 + 3] > 60) { if (k < l) l = k; if (k > r) r = k; if (y < t) t = y; if (y > b) b = y; }
    }
    return r < 0 ? null : { l, t, r: r + 1, b: b + 1, w: cv.width, h: cv.height };
}

// Camada de texto → clipe de texto do editor (ou null: fica a imagem). avisos recebe o que não ficou igual.
async function vePsdTexto(no, estilos, avisos, dur, tr) {
    const t = no.texto, NL = String.fromCharCode(10);
    if (!t) return null;
    if (t.misto) { avisos.push(`${no.nome}: ${veT('texto com estilos misturados (entrou como imagem)')}`); return null; }
    const [xx, xy, yx, yy] = t.tf, esc = Math.hypot(xx, xy), rot = Math.atan2(xy, xx) * 180 / Math.PI;
    if (Math.abs(Math.hypot(yx, yy) / esc - 1) > 0.02 || Math.abs(xx * yx + xy * yy) > 0.02 * esc * esc) {
        avisos.push(`${no.nome}: ${veT('texto inclinado ou esticado (entrou como imagem)')}`);
        return null;
    }
    const run = t.runs[0], f = vePsdAcharFonte(run.fonte, estilos);
    if (!f) { avisos.push(`${no.nome}: ${veT('fonte')} ${run.fonte} ${veT('não instalada (entrou como imagem)')}`); return null; }
    if (!f.exata) avisos.push(`${no.nome}: ${veT('fonte')} ${run.fonte} ${veT('não instalada, usei')} ${f.fam} ${f.e.estilo}`);
    const x = {
        ...VE_TX_PADRAO, t: run.caixa_alta ? t.texto.toUpperCase() : t.texto, fonte: f.e.gdi, fam: f.fam,
        peso: f.e.peso, neg: !!(run.neg || (!f.exata && f.peso >= 600 && f.e.peso < 600)), ita: !!(f.e.italico || f.e.gdi_italico || run.ita),
        tam: run.tam * esc, alin: t.alin, esp: run.esp, ent: run.auto_ent || !(run.ent > 0.5) ? 120 : Math.max(40, run.ent / run.tam * 100), cor: run.cor,
    };
    const fx = t.efeitos || {};
    if (fx.sobreposicao && fx.sobreposicao.op >= 50) x.cor = fx.sobreposicao.cor;
    if (fx.contorno && fx.contorno.larg > 0) Object.assign(x, { cOn: true, cCor: fx.contorno.cor, cLarg: fx.contorno.larg * (fx.contorno.pos.includes('inside') ? 0.5 : 1) });
    const sb = fx.sombra || (fx.brilho && { cor: fx.brilho.cor, op: fx.brilho.op, ang: 135, dist: 0, tam: fx.brilho.tam });
    if (sb) Object.assign(x, { sOn: true, sCor: sb.cor, sOp: sb.op, sDist: sb.dist, sBlur: sb.tam, sAng: sb.ang });
    if (fx.sombra && fx.brilho) avisos.push(`${no.nome}: ${veT('brilho externo não entrou (o texto tem uma sombra só)')}`);
    (fx.outros || []).forEach(n => avisos.push(`${no.nome}: ${veT('efeito')} ${n} ${veT('não entrou no texto')}`));
    try { await document.fonts.load(veTxFonte(x, Math.round(x.tam))); } catch (e) { /* fonte do sistema */ }
    if (t.caixa) x.t = vePsdQuebrar(x, (t.caixa[2] - t.caixa[0]) * esc);
    // a tinta do Photoshop corrige pequenas diferenças de métrica (só texto reto de uma linha)
    const ps = { l: t.tinta[0], t: t.tinta[1], r: t.tinta[2], b: t.tinta[3] };
    let ti = vePsdTinta(x);
    if (!ti) return null;
    const umaLinha = !x.t.includes(NL), reto = Math.abs(rot) < 0.5;
    if (umaLinha && reto) {
        const k = (ps.b - ps.t) / (ti.b - ti.t);
        if (k > 0.6 && k < 1.6 && Math.abs(k - 1) > 0.015) { x.tam *= k; ti = vePsdTinta(x) || ti; }
        const n = Array.from(x.t).length;
        const d = ((ps.r - ps.l) - (ti.r - ti.l)) / Math.max(1, n - 1);
        if (n > 1 && Math.abs(d) > 0.3) { x.esp = Math.max(-500, Math.min(1500, x.esp + d / x.tam * 1000)); ti = vePsdTinta(x) || ti; }
    }
    const a = rot * Math.PI / 180, ox = (ti.l + ti.r) / 2 - ti.w / 2, oy = (ti.t + ti.b) / 2 - ti.h / 2;
    const cx = (ps.l + ps.r) / 2 - (ox * Math.cos(a) - oy * Math.sin(a)), cy = (ps.t + ps.b) / 2 - (ox * Math.sin(a) + oy * Math.cos(a));
    const c = { tr, st: 0, s: 0, e: dur, m: veTxMidia().id, tx: x, nome: no.nome };
    c.p = Object.assign(veDefProps(c), { sc: 100, x: cx, y: cy, rot, op: no.op });
    return c;
}

// Estilo do editor para um trecho de texto do PSD (fonte achada f, escala do texto esc, efeitos da camada fx)
function vePsdEstiloX(run, f, esc, alin, fx) {
    const x = {
        ...VE_TX_PADRAO, fonte: f.e.gdi, fam: f.fam, peso: f.e.peso,
        neg: !!(run.neg || (!f.exata && f.peso >= 600 && f.e.peso < 600)), ita: !!(f.e.italico || f.e.gdi_italico || run.ita),
        tam: run.tam * esc, alin, esp: run.esp, ent: run.auto_ent || !(run.ent > 0.5) ? 120 : Math.max(40, run.ent / run.tam * 100), cor: run.cor,
    };
    if (fx.sobreposicao && fx.sobreposicao.op >= 50) x.cor = fx.sobreposicao.cor;
    if (fx.contorno && fx.contorno.larg > 0) Object.assign(x, { cOn: true, cCor: fx.contorno.cor, cLarg: fx.contorno.larg * (fx.contorno.pos.includes('inside') ? 0.5 : 1) });
    const sb = fx.sombra || (fx.brilho && { cor: fx.brilho.cor, op: fx.brilho.op, ang: 135, dist: 0, tam: fx.brilho.tam });
    if (sb) Object.assign(x, { sOn: true, sCor: sb.cor, sOp: sb.op, sDist: sb.dist, sBlur: sb.tam, sAng: sb.ang });
    return x;
}

// Texto com estilos misturados (uma palavra em outra cor/peso): um texto do editor por trecho de estilo de cada linha,
// na posição que ele tem na linha (larguras medidas com a fonte de cada trecho, alinhamento e entrelinha da linha,
// quebra da caixa de parágrafo palavra a palavra). Devolve a lista de clipes (para uma Comp com o nome da camada).
async function vePsdTextoMisto(no, estilos, avisos, dur) {
    const t = no.texto, NL = String.fromCharCode(10);
    const [xx, xy, yx, yy] = t.tf, esc = Math.hypot(xx, xy), rot = Math.atan2(xy, xx) * 180 / Math.PI;
    if (Math.abs(Math.hypot(yx, yy) / esc - 1) > 0.02 || Math.abs(xx * yx + xy * yy) > 0.02 * esc * esc) {
        avisos.push(`${no.nome}: ${veT('texto inclinado ou esticado (entrou como imagem)')}`);
        return null;
    }
    const fx = t.efeitos || {}, segs = [];
    for (const run of t.runs) {
        const f = vePsdAcharFonte(run.fonte, estilos);
        if (!f) { avisos.push(`${no.nome}: ${veT('fonte')} ${run.fonte} ${veT('não instalada (entrou como imagem)')}`); return null; }
        if (!f.exata) avisos.push(`${no.nome}: ${veT('fonte')} ${run.fonte} ${veT('não instalada, usei')} ${f.fam} ${f.e.estilo}`);
        const x = vePsdEstiloX(run, f, esc, 'left', fx);
        try { await document.fonts.load(veTxFonte(x, Math.round(x.tam))); } catch (e) { /* fonte do sistema */ }
        segs.push({ x, texto: run.caixa_alta ? run.trecho.toUpperCase() : run.trecho });
    }
    const ctx = document.createElement('canvas').getContext('2d');
    const larg = (x, txt) => { ctx.font = veTxFonte(x, x.tam); ctx.letterSpacing = (x.esp / 1000 * x.tam) + 'px'; return ctx.measureText(txt).width; };
    // fichas: palavras e espaços com o estilo de cada uma; quebra explícita = linha nova
    const linhas = [[]];
    const caixa = t.caixa ? (t.caixa[2] - t.caixa[0]) * esc : 0;
    let largAtual = 0;
    segs.forEach((sg, si) => {
        sg.texto.split(NL).forEach((parte, pi) => {
            if (pi > 0) { linhas.push([]); largAtual = 0; }
            parte.split(/( )/).forEach(p => {
                if (!p) return;
                const w = larg(sg.x, p);
                if (caixa && p !== ' ' && largAtual > 0 && largAtual + w > caixa) {
                    const ln = linhas[linhas.length - 1];
                    while (ln.length && ln[ln.length - 1].txt === ' ') ln.pop();
                    linhas.push([]); largAtual = 0;
                }
                if (p === ' ' && largAtual === 0 && caixa) return;   // espaço no começo de linha quebrada
                linhas[linhas.length - 1].push({ si, txt: p, w });
                largAtual += w;
            });
        });
    });
    // posições no espaço do texto (origem = primeira linha de base, no ponto de alinhamento), sem giro
    const pecas = [];
    let base = 0;
    linhas.forEach((ln, k) => {
        const usados = ln.length ? ln : [{ si: 0, txt: '', w: 0 }];
        const lead = Math.max(...usados.map(f => segs[f.si].x.tam * segs[f.si].x.ent / 100));
        if (k > 0) base += lead;
        const juntas = [];
        ln.forEach(f => { const u = juntas[juntas.length - 1]; if (u && u.si === f.si) u.txt += f.txt; else juntas.push({ si: f.si, txt: f.txt }); });
        while (juntas.length && !juntas[juntas.length - 1].txt.trim()) juntas.pop();
        juntas.forEach(j => { j.w = larg(segs[j.si].x, j.txt); });
        const W = juntas.reduce((s, j) => s + j.w, 0);
        let px = t.alin === 'center' ? -W / 2 : t.alin === 'right' ? -W : 0;
        juntas.forEach(j => {
            if (j.txt.trim()) pecas.push({ x: { ...segs[j.si].x, t: j.txt }, esq: px, base });
            px += j.w;
        });
    });
    if (!pecas.length) return null;
    // a tinta de cada peça, para alinhar o conjunto ao desenho do Photoshop
    let U = null;
    pecas.forEach(p => {
        const L = veTxLayout(p.x), ti = vePsdTinta(p.x);
        p.cx = p.esq - L.m + L.w / 2;
        p.cy = p.base - (L.m + L.asc) + L.h / 2;
        if (!ti) return;
        const l = p.cx - ti.w / 2 + ti.l, tp = p.cy - ti.h / 2 + ti.t, r = p.cx - ti.w / 2 + ti.r, b = p.cy - ti.h / 2 + ti.b;
        U = U ? { l: Math.min(U.l, l), t: Math.min(U.t, tp), r: Math.max(U.r, r), b: Math.max(U.b, b) } : { l, t: tp, r, b };
    });
    if (!U) return null;
    const a = rot * Math.PI / 180, gira = (x, y) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    const [ux, uy] = gira((U.l + U.r) / 2, (U.t + U.b) / 2);
    const dx = (t.tinta[0] + t.tinta[2]) / 2 - ux, dy = (t.tinta[1] + t.tinta[3]) / 2 - uy;
    return pecas.map((p, k) => {
        const [gx, gy] = gira(p.cx, p.cy);
        const c = { tr: k, st: 0, s: 0, e: dur, m: veTxMidia().id, tx: p.x, nome: `${no.nome} · ${p.x.t.trim()}` };
        c.p = Object.assign(veDefProps(c), { sc: 100, x: gx + dx, y: gy + dy, rot, op: 100 });
        return c;
    });
}

// Mídias (PNG de cada camada) e Comps (documento e grupos). Devolve a mídia da Comp do documento.
// o: {dur, prefixo} — a ponte do Photo Kanivete (ponte-kanivete.js) usa a mesma montagem
async function vePsdMontar(r, pastaPai, o = {}) {
    const api = window.pywebview.api, bin = vePjNovoBin((o.prefixo ?? 'PSD · ') + r.nome, pastaPai || null), dur = o.dur || VE_PSD_DUR;
    const estilos = await vePsdEstilos(), avisos = r.avisos;
    let aj = null;
    const imagem = async no => {
        const a = await api.video_cutter_add_media(no.png);
        if (!a || !a.success) return null;
        const m = vePjAddMidia({ kind: 'image', path: a.path, url: a.url, name: no.nome, img: new Image(), w: no.w, h: no.h }, bin.id);
        m.img.crossOrigin = 'anonymous';
        m.img.src = a.url;
        await new Promise(ok => { m.img.onload = ok; m.img.onerror = ok; });
        m.w = m.img.naturalWidth || no.w;
        m.h = m.img.naturalHeight || no.h;
        return m;
    };
    // Comp (sequência + mídia) com os clipes já montados
    const fazComp = (nome, clips) => {
        const seq = {
            id: veSeqId(), name: nome, comp: true, dur, clips, trilhas: veTrkNovo(Math.max(VE_MIN_TRACKS, clips.length)),
            texto: { palavras: [], idioma: 'pt', chave: '' }, legendas: [], legEstilo: null, legGravar: true, inPt: null,
            outPt: null, markers: [], guias: [], playhead: 0, view: { pps: 0, x: 0 }, w: r.w, h: r.h, master: null,
        };
        VE.sequences.push(seq);
        const m = {
            id: VE.media.length, kind: 'video', comp: true, sequenceId: seq.id, name: nome, cor: VE_COMP_COR, pasta: bin.id,
            path: null, dur, _criada: true, psd: true,
            info: { duration: dur, width: r.w, height: r.h, fps: VE.fps || 30, has_audio: false, alfa: true, provisoria: true },
        };
        VE.media.push(m);
        return m;
    };
    const comp = async (nos, nome) => {
        const clips = [];
        for (const no of nos) {
            let c = null, partes = null;
            if (no.filhos) {
                const cm = await comp(no.filhos, no.nome);
                c = { m: cm.id, p: { x: r.w / 2, y: r.h / 2 } };
            } else if (no.ajuste) {
                if (!aj) aj = VE.media.find(x => x.kind === 'ajuste' && !x.removido) || vePjAddMidia({ kind: 'ajuste', name: 'Camada de ajuste' }, null);
                c = { m: aj.id, fx: [{ id: veFxNewId(), t: no.ajuste.t, on: true, v: { ...no.ajuste.v } }], nome: no.nome };
            } else if (no.texto && no.texto.misto && (partes = await vePsdTextoMisto(no, estilos, avisos, dur))) {
                // estilos misturados: um texto por trecho, numa Comp com o nome da camada (continua uma camada só)
                c = { m: fazComp(no.nome, partes).id, p: { x: r.w / 2, y: r.h / 2 } };
            } else if (no.texto && !no.texto.misto && (c = await vePsdTexto(no, estilos, avisos, dur, clips.length))) {
                // texto editável (a imagem do Photoshop fica de fora)
            } else if (no.png) {
                const m = await imagem(no);
                if (!m) continue;
                c = { m: m.id, p: { x: no.x + no.w / 2, y: no.y + no.h / 2 } };
                if (no.texto) c.psdTexto = no.texto;   // o texto original (a camada entrou como imagem)
                if (no.sombra) c.fx = [{ id: veFxNewId(), t: 'sombra', on: true, v: { ...no.sombra } }];   // efeito do editor, editável
            }
            if (!c) continue;
            if (no.knv) c.knv = no.knv;   // ligação com a camada do Photo Kanivete (atualização ao vivo, Fase 2)
            if (!c.tx) {
                Object.assign(c, { tr: clips.length, st: 0, s: 0, e: dur });
                c.p = Object.assign(veDefProps(c), { sc: 100, rot: 0 }, c.p || {}, { op: no.op });
            }
            if (no.bm && no.bm !== 'normal') c.bm = no.bm;
            if (!no.visivel) c.off = true;
            clips.push(c);
        }
        return fazComp(nome, clips);
    };
    return comp(r.camadas, r.nome);
}

// Abre/importa um PSD. opts: {pasta: pasta do Projeto, inserir: põe a Comp na timeline aberta (arrastar para a
// timeline), soProjeto: só no Projeto, sem abrir, abrir: abre a Comp (padrão sim)}. Sem inserir, a Comp fica no Projeto
// e abre numa aba (como o AE: importar não coloca dentro da Comp que está aberta). Sem projeto, ela vai para a timeline.
async function vePsdAbrir(path, opts = {}) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_psd_importar) return false;
    const r = await vePsdLer(path);
    if (!r) return false;
    let novo = false;
    if (!VE.ready) {
        // sem projeto: começa pela imagem do documento inteiro (tamanho da sequência = o do PSD) e troca pela Comp
        if (!r.achatado) { veToast(veT('Abra um vídeo ou projeto antes de importar este PSD')); return false; }
        veOpenPath(r.achatado);
        if (!await vePsdEsperar(() => VE.ready && VE.clips.length, 30000)) { veToast(veT('Não consegui abrir o PSD')); return false; }
        VE.clips = [];
        novo = true;
    }
    if (VE.playing) veStop();
    veSeqSalvarAtiva();
    vePushHistory();
    const m = await vePsdMontar(r, opts.pasta !== undefined ? opts.pasta : (typeof vePjDestino === 'function' ? vePjDestino() : null));
    let clip = null;
    if (!opts.soProjeto && (opts.inserir || novo)) {
        const st = novo ? 0 : veSnapFrame(VE.playhead), b = st + VE_PSD_DUR;
        clip = { st, s: 0, e: VE_PSD_DUR, m: m.id, cor: VE_COMP_COR };
        let tr = novo ? 0 : veTrackIndexes().find(k => !veTrkLocked(k) && veTrackFree(k, st, b, clip));
        if (tr == null) tr = veTrackCount();
        clip.tr = tr;
        veEnsureTrackIndex(tr, { refresh: true });
        clip.p = veDefProps(clip);
        VE.clips.push(clip);
        veRelayout();
        veSelDefinir([clip], clip);
    }
    veSeqSalvarAtiva();
    veAfterEdit(VE.playhead);
    vePjRender();
    if (typeof veCompVerificar === 'function') veCompVerificar();
    const n = (function conta(nos) { return nos.reduce((s, x) => s + (x.filhos ? conta(x.filhos) : 1), 0); })(r.camadas);
    veToast(`PSD ${r.nome}: ${n} ${veT(n === 1 ? 'camada' : 'camadas')}` + (r.avisos.length ? ` · ${r.avisos.length} ${veT('aviso(s) no painel Projeto')}` : ''));
    if (r.avisos.length) {
        m.psdAvisos = r.avisos;
        console.warn('[PSD] ' + r.nome + ':\n' + r.avisos.join('\n'));
    }
    if (opts.abrir !== false && !opts.soProjeto) veCompAbrir(m);   // mostra as camadas nas trilhas, como no AE
    return m;
}
