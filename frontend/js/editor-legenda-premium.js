// =========================================================
// Vídeo Kanivete — Legenda Premium: o 3º modo de legenda, ao lado da Clássica e da Dinâmica (destaque da palavra)
// Blocos curtos montados como título com duas fontes que combinam (dupla), cada palavra com um papel
// (ligação / base / destaque) e entrada animada palavra a palavra no tempo da fala. Estudo das referências e regras:
// Instructions/agente/legenda-criativa.md.
// Dados: VE.legEstilo.modo = 'premium' e VE.legEstilo.pr = {dupla, cor, anim, brilho, tam, pos, titulos, sub};
// cada legenda ganha l.pr = {t: 1 título | 0 simples, r: ['l'|'b'|'e'] um papel por palavra, m: 1 = mexido à mão}.
// Prévia: veLpDesenhar (chamado pelo veTxDesenhar). Exportação: veTxExport manda as peças já medidas (item.prm) e o
// _ass_premium (video_cutter.py) escreve o .ass com as fontes de frontend/fonts/premium (fontsdir do libass).
// =========================================================

// Fontes (frontend/fonts/premium, OFL renomeadas: o mesmo nome no navegador e no libass; origem em fontes.json)
// F01 Anton · F02 Bricolage 800 · F03 Cormorant 700i · F04 DM Serif · F05 DM Serif i · F06 Fraunces 600i ·
// F07 Instrument Serif · F08 Instrument Serif i · F09 Inter 700 · F10 Inter 800 · F11 Manrope 600 · F12 Manrope 800 ·
// F13 Montserrat 600 · F14 Montserrat 700 · F15 Playfair 700i · F16 Playfair 900i · F17 Poppins 500 · F18 Poppins 700 ·
// F19 Poppins 800
// base/enf/lig/pe/simp = fonte de cada papel; ligE/enfE/peE = tamanho relativo à base; gap = espaço entre palavras
// coladas (em); entre = distância entre linhas (× tamanho: < 1 sobrepõe); track = espaçamento das letras (em);
// sombra = força da sombra de leitura (0–1); simpCor = cor da legenda simples ('acc' = cor de destaque)
const VELP_DUPLAS = [
    { id: 'brilho', nome: 'Brilho quente', desc: 'Grotesca pesada + itálica de revista, com brilho',
      base: 'KPR F19', enf: 'KPR F16', lig: 'KPR F18', pe: 'KPR F17', simp: 'KPR F18',
      cor: '#FF9A2E', simpCor: 'acc', ligE: 0.8, enfE: 1.12, peE: 0.42, gap: 0.05, entre: 0.9, track: -0.03,
      anim: 'desfoque', brilho: 55, sombra: 0.7, ex: ['na', 'verdade'] },
    { id: 'editorial', nome: 'Editorial', desc: 'Serifa clássica + sem serifa firme, sem brilho',
      base: 'KPR F04', enf: 'KPR F05', lig: 'KPR F09', pe: 'KPR F09', simp: 'KPR F07',
      cor: '#F5C518', simpCor: 'txt', ligE: 0.46, enfE: 1.18, peE: 0.36, gap: 0.08, entre: 0.82, track: -0.01,
      anim: 'acender', brilho: 0, sombra: 0.55, ex: ['que', 'combina'] },
    { id: 'impacto', nome: 'Impacto', desc: 'Condensada alta + itálica fina',
      base: 'KPR F01', enf: 'KPR F08', lig: 'KPR F14', pe: 'KPR F13', simp: 'KPR F14',
      cor: '#C8F560', simpCor: 'txt', ligE: 0.5, enfE: 1.22, peE: 0.36, gap: 0.07, entre: 0.92, track: 0,
      anim: 'pop', brilho: 20, sombra: 0.7, ex: ['é', 'agora'] },
    { id: 'suave', nome: 'Suave', desc: 'Sem serifa redonda + itálica macia',
      base: 'KPR F12', enf: 'KPR F06', lig: 'KPR F11', pe: 'KPR F11', simp: 'KPR F12',
      cor: '#FF7A6B', simpCor: 'acc', ligE: 0.62, enfE: 1.14, peE: 0.4, gap: 0.08, entre: 0.88, track: -0.02,
      anim: 'subir', brilho: 15, sombra: 0.6, ex: ['bem', 'leve'] },
    { id: 'elegante', nome: 'Elegante', desc: 'Garamond itálica + sem serifa espaçada',
      base: 'KPR F14', enf: 'KPR F03', lig: 'KPR F13', pe: 'KPR F13', simp: 'KPR F13',
      cor: '#E9C27D', simpCor: 'txt', ligE: 0.55, enfE: 1.32, peE: 0.38, gap: 0.1, entre: 0.86, track: 0.01,
      anim: 'acender', brilho: 22, sombra: 0.6, ex: ['seu', 'momento'] },
    { id: 'moderno', nome: 'Moderno', desc: 'Grotesca de personalidade + itálica clássica',
      base: 'KPR F02', enf: 'KPR F15', lig: 'KPR F10', pe: 'KPR F09', simp: 'KPR F02',
      cor: '#5CC8FF', simpCor: 'acc', ligE: 0.6, enfE: 1.12, peE: 0.4, gap: 0.06, entre: 0.86, track: -0.025,
      anim: 'desfoque', brilho: 35, sombra: 0.65, ex: ['muito', 'mais'] },
];
const VELP_CORES = ['#FF9A2E', '#F5C518', '#C8F560', '#5CC8FF', '#FF7A6B', '#E9C27D', '#B892FF', '#FFFFFF'];
const VELP_ANIMS = [['desfoque', 'Desfoque e brilho'], ['acender', 'Acender'], ['subir', 'Subir'], ['pop', 'Pop']];
const VELP_DUR = { desfoque: 0.24, acender: 0.18, subir: 0.22, pop: 0.22 };   // entrada de cada palavra (s)
const VELP_SAI = 0.14;                                                         // saída do bloco (s)
const VELP_TITULOS = { poucos: 8, equilibrado: 4.5, muitos: 2.5 };             // um título a cada N segundos
const VELP_POS = { cima: 0.24, peito: 0.6, baixo: 0.8 };                       // centro do bloco (× altura)
const VELP_SEGURA = 0.8;   // área segura de títulos: 80% do quadro (10% de margem em cada lado, como no Premiere)
const VELP_PADRAO = { dupla: 'brilho', cor: '', anim: '', brilho: null, tam: 100, pos: 'peito', titulos: 'equilibrado', sub: true,
                      sfx: false, sfxNivel: 'medio', sfxVol: 0 };
// palavras de ligação (ficam pequenas, coladas na palavra seguinte)
const VELP_LIG = new Set(('a o as os e é de do da dos das no na nos nas num numa em um uma uns umas pra pro pras pros ' +
    'para por pelo pela pelos pelas com sem que se ao aos à às eu me te lhe mas ou já só tá né lá aí sua seu suas seus ' +
    'minha meu você vocês ele ela eles elas isso isto the of to in on and or is it a an you i my your').split(' '));

// palavras de conteúdo fracas: ficam na base, nunca viram o destaque automático ("faturar mais dinheiro" → dinheiro)
const VELP_FRACA = new Set(('mais menos muito muita muitos muitas bem aqui ali então agora coisa coisas vai vou vamos foi era ser ' +
    'ter tem tenho fazer faz está estou estava deu dá pode posso quer quero sempre também ainda tudo nada gente').split(' '));

const VELP = { met: new Map(), cache: new Map(), fontes: false, kani: false };

const veLpNorm = w => String(w || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const veLpEhLig = w => VELP_LIG.has(veLpNorm(w));
const veLpDupla = id => VELP_DUPLAS.find(d => d.id === id) || VELP_DUPLAS[0];
const veLpAtivo = (e = veTxEstilo()) => e.modo === 'premium';
// configuração efetiva (o que ficou vazio vem da dupla)
function veLpCfg(e = veTxEstilo()) {
    const p = { ...VELP_PADRAO, ...(e.pr || {}) }, D = veLpDupla(p.dupla);
    return { ...p, D, cor: p.cor || D.cor, anim: p.anim || D.anim, brilho: p.brilho == null ? D.brilho : +p.brilho };
}
function veLpSetCfg(patch) {
    VE.legEstilo = { ...veTxEstilo(), pr: { ...VELP_PADRAO, ...(veTxEstilo().pr || {}), ...patch } };
    VELP.cache.clear();
    veMarcarAlterado();
}

// ── fontes ──
// O navegador só desenha com a fonte depois de baixada: carrega as da dupla e redesenha (as métricas mudam)
function veLpCarregarFontes(D) {
    const fams = [...new Set([D.base, D.enf, D.lig, D.pe, D.simp])];
    if (fams.every(f => document.fonts.check(`40px "${f}"`))) return true;
    Promise.all(fams.map(f => document.fonts.load(`40px "${f}"`))).then(() => {
        VELP.met.clear(); VELP.cache.clear();
        if (typeof veCacheInvalidate === 'function') veCacheInvalidate();
        veDrawMonitorSoon();
    });
    return false;
}
// ascendente e altura da linha (em "em"), como o veTxMetricas: o libass usa Fontsize = altura da linha
function veLpMet(fam) {
    if (!VELP.met.has(fam)) {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `100px "${fam}"`;
        const m = ctx.measureText('Hg'), asc = (m.fontBoundingBoxAscent || 92) / 100, desc = (m.fontBoundingBoxDescent || 24) / 100;
        const r = { asc, desc, razao: asc + desc };
        if (!document.fonts.check(`100px "${fam}"`)) return r;   // ainda não carregou: não guarda
        VELP.met.set(fam, r);
    }
    return VELP.met.get(fam);
}

// ── papéis e blocos ──
// Papéis automáticos: ligação pequena; no título, a última palavra de conteúdo vira o destaque
function veLpPapeisAuto(tk, titulo) {
    const r = tk.map(w => veLpEhLig(w) ? 'l' : 'b');
    if (!r.includes('b') && tk.length) r[tk.reduce((m, w, i) => w.length > tk[m].length ? i : m, 0)] = 'b';
    const C = r.map((x, i) => x === 'b' ? i : -1).filter(i => i >= 0);
    if (titulo && tk.length >= 2 && C.length) {
        const num = C.filter(i => /\d/.test(tk[i]));
        const longas = C.filter(i => veLpNorm(tk[i]).length >= 3 && !VELP_FRACA.has(veLpNorm(tk[i])));
        r[num.length ? num[num.length - 1] : longas.length ? longas[longas.length - 1] : C[C.length - 1]] = 'e';
    }
    return r;
}
// papéis da legenda (os guardados, se ainda batem com o texto; senão automáticos)
function veLpPapeis(l) {
    const tk = veTxTokens(l.texto), pr = l.pr || {};
    return Array.isArray(pr.r) && pr.r.length === tk.length ? pr.r : veLpPapeisAuto(tk, !!pr.t);
}

// Palavras da transcrição → blocos curtos (uma ideia: pausa, fim de frase, vírgula ou até 3 palavras de conteúdo)
function veLpBlocos(W) {
    const blocos = [];
    let cur = [];
    const fecha = () => { if (cur.length) blocos.push(cur); cur = []; };
    const fimFrase = w => /[.!?…]["')\]]?$/.test(w);
    W.forEach((w, iw) => {
        if (cur.length && w[0] - cur[cur.length - 1][1] > 0.55) fecha();
        cur.push(w);
        const nC = cur.filter(x => !veLpEhLig(x[2])).length, txt = cur.map(x => x[2]).join(' ');
        // a próxima palavra fecha a frase e vem colada: espera por ela ("quer faturar mais | dinheiro?" ficava sozinha)
        const prox = W[iw + 1], esperar = prox && fimFrase(prox[2]) && prox[0] - w[1] < 0.3 && cur.length < 5 && txt.length + prox[2].length < 34;
        if (fimFrase(w[2])) fecha();
        else if (/[,;:]["')\]]?$/.test(w[2]) && nC >= 1 && cur.length >= 2) fecha();
        else if (!esperar && (nC >= 3 || txt.length >= 24 || cur.length >= 5)) {
            // cheio: corta antes da última frase que começou ("na verdade | o que você"), se sobrar algo dos dois lados
            let k = -1;
            for (let j = cur.length - 2; j >= 1 && k < 0; j--) if (!veLpEhLig(cur[j][2]) && veLpEhLig(cur[j + 1][2])) k = j;
            if (k >= 1 && k < cur.length - 1) { const resto = cur.slice(k + 1); cur = cur.slice(0, k + 1); fecha(); cur = resto; }
            else fecha();
        }
    });
    fecha();
    // ligação no fim do bloco ("na verdade o | que você odeia") passa para o começo do seguinte, se vier logo depois
    for (let i = 0; i < blocos.length - 1; i++) {
        const b = blocos[i], p = blocos[i + 1];
        while (b.length > 1 && veLpEhLig(b[b.length - 1][2]) && !/[,.;:!?…]$/.test(b[b.length - 1][2]) && p[0][0] - b[b.length - 1][1] < 0.45) p.unshift(b.pop());
    }
    // bloco só de ligação ("e", "pra") cola no seguinte
    for (let i = blocos.length - 2; i >= 0; i--) {
        const b = blocos[i], p = blocos[i + 1];
        if (b.every(w => veLpEhLig(w[2])) && p[0][0] - b[b.length - 1][1] < 0.6 && b.length + p.length <= 6) blocos.splice(i, 2, [...b, ...p]);
    }
    return blocos.map((b, i) => {
        const prox = blocos[i + 1], fim = b[b.length - 1][1];
        const en = prox && prox[0][0] - fim < 0.7 ? prox[0][0] : fim + 0.35;
        return { st: +b[0][0].toFixed(3), en: +Math.max(b[0][0] + 0.4, en).toFixed(3), texto: b.map(w => w[2]).join(' '),
                 pt: b.map(w => [+w[0].toFixed(3), +w[1].toFixed(3)]) };
    });
}

// Quais blocos viram título: o 1º (gancho) e os de maior nota, espaçados pela densidade escolhida
function veLpNotaTitulo(l, i) {
    const tk = veTxTokens(l.texto), C = tk.filter(w => !veLpEhLig(w));
    let n = 0;
    if (tk.length >= 2 && tk.length <= 5) n += 2;
    if (tk.some(w => /\d/.test(w))) n += 3;
    if (C.some(w => veLpNorm(w).length >= 7)) n += 1;
    if (/[!?]["')\]]?$/.test(tk[tk.length - 1] || '')) n += 2;
    if (tk.slice(1).some(w => /^\p{Lu}/u.test(w))) n += 2;
    if (!C.length) n -= 5;
    if (i === 0) n += 5;
    return n;
}
function veLpEscolherTitulos(L, densidade) {
    const D = VELP_TITULOS[densidade] || VELP_TITULOS.equilibrado;
    const tot = L.length ? L[L.length - 1].en - L[0].st : 0, alvo = Math.max(1, Math.round(tot / D));
    const fixos = L.map((l, i) => l.pr && l.pr.m ? i : -1).filter(i => i >= 0);
    const esc = new Set(fixos.filter(i => L[i].pr.t));
    const ordem = L.map((l, i) => ({ i, n: veLpNotaTitulo(l, i) })).filter(o => !fixos.includes(o.i) && o.n > 0).sort((a, b) => b.n - a.n);
    for (const o of ordem) {
        if (esc.size >= alvo) break;
        const t = L[o.i].st;
        if ([...esc].some(j => Math.abs(L[j].st - t) < D * 0.6)) continue;
        esc.add(o.i);
    }
    return L.map((l, i) => {
        if (l.pr && l.pr.m) return l;
        const t = esc.has(i) ? 1 : 0;
        return { ...l, pr: { t, r: veLpPapeisAuto(veTxTokens(l.texto), !!t) } };
    });
}

// Monta as legendas Premium a partir da transcrição (entra no desfazer)
function veLpCriar(silencioso) {
    if (!VETX.palavras.length) { veToast('Transcreva a sequência primeiro'); return false; }
    const juntas = veTxJuntarHifen(VETX.palavras);
    if (juntas.length !== VETX.palavras.length) { VETX.palavras = juntas; VETX.construidoTexto = false; }
    vePushHistory();
    VE.legendas = veLpEscolherTitulos(veLpBlocos(VETX.palavras), veLpCfg().titulos);
    VETX.legSel = -1;
    VELP.cache.clear();
    if (!silencioso) veToast(`${VE.legendas.length} legendas Premium · ${VE.legendas.filter(l => l.pr.t).length} títulos`);
    veRefresh();
    veLpSfxAtualizar(!silencioso);
    return true;
}

// Troca de modo: Clássica ↔ Dinâmica só liga/desliga o destaque; entrar ou sair da Premium remonta os blocos
// (tamanhos diferentes: frase inteira × ideia curta), se houver transcrição
function veLpModo(modo) {
    const e = veTxEstilo(), eraPr = veLpAtivo(e);
    vePushHistory();
    VE.legEstilo = { ...e, modo: modo === 'premium' ? 'premium' : '', dOn: modo === 'dinamica' };
    VE.legendas = (VE.legendas || []).map(l => {   // o destaque é de todas: tira o que alguma legenda tinha só para ela
        if (!l.estilo || !('dOn' in l.estilo)) return l;
        const { dOn, ...resto } = l.estilo;
        return { ...l, estilo: resto };
    });
    const vira = eraPr !== (modo === 'premium');
    if (vira && VETX.palavras.length && (VE.legendas || []).length) {
        VELP.cache.clear();
        if (modo === 'premium') VE.legendas = veLpEscolherTitulos(veLpBlocos(veTxJuntarHifen(VETX.palavras)), veLpCfg().titulos);
        else VE.legendas = veTxMontarLegendas(VETX.opcoes);
        VETX.legSel = -1;
        veToast(modo === 'premium' ? 'Legendas remontadas em blocos Premium (Ctrl+Z desfaz)' : 'Legendas remontadas em frases (Ctrl+Z desfaz)');
    }
    veMarcarAlterado();
    veRefresh();
    veLpSfxAtualizar();   // os efeitos sonoros são da Premium: saindo dela, saem junto
}

// ── composição ──
// Retorna as peças da legenda i no quadro: runs = uma por palavra {k, txt, f, em, x, base, w, cor, gl, a, papel},
// sub = traço sob o destaque, caixa = área ocupada (clique/arrastar)
function veLpLayout(i) {
    const l = VE.legendas[i], e = veTxEstiloLegenda(i), cfg = veLpCfg(e), D = cfg.D;
    const W = VE.seqW, H = VE.seqH;
    const chave = JSON.stringify([l.texto, l.pr, l.pt, l.st, l.en, e.pr, e.px, e.py, W, H, VELP.met.size]);
    const c = VELP.cache.get(i);
    if (c && c.chave === chave) return c.L;
    VELP.fontes = veLpCarregarFontes(D);
    const tk = veTxTokens(l.texto), r = veLpPapeis(l), P = veTxLegTempos(l), titulo = !!(l.pr && l.pr.t) && tk.length > 0;
    const U = Math.min(W, H * 9 / 16) * (Math.max(40, Math.min(250, +cfg.tam || 100)) / 100);
    const m = VELP.m || (VELP.m = document.createElement('canvas').getContext('2d'));
    const largura = (txt, f, em) => { m.font = `${em}px "${f}"`; m.letterSpacing = `${D.track * em}px`; return m.measureText(txt).width; };
    const limpa = w => titulo ? w.replace(/[,.;:]+$/, '') : w;
    let linhas = [];
    if (!titulo) {
        // simples: uma fonte, uma ou duas linhas centralizadas
        const S = 0.062 * U, f = D.simp, esp = largura(' ', f, S), maxW = W * VELP_SEGURA * 0.92;
        let lin = { it: [], w: 0 };
        tk.forEach((w, k) => {
            const ww = largura(w, f, S);
            if (lin.it.length && lin.w + esp + ww > maxW) { linhas.push(lin); lin = { it: [], w: 0 }; }
            if (lin.it.length) lin.w += esp;
            lin.it.push({ k, txt: w, f, em: S, dx: lin.w, w: ww, papel: r[k] });
            lin.w += ww;
        });
        if (lin.it.length) linhas.push(lin);
        linhas.forEach(ln => { ln.em = S; ln.alinha = 'centro'; ln.passo = S * 1.12; });
    } else {
        // título: ligação gruda na palavra seguinte (unidade); cabeça / destaque / pé
        const T = 0.1 * U;
        const tam = p => p === 'l' ? T * D.ligE : p === 'e' ? T * D.enfE : T;
        const fonte = p => p === 'l' ? D.lig : p === 'e' ? D.enf : D.base;
        const unid = [];
        let pend = [];
        tk.forEach((w, k) => {
            const it = { k, txt: limpa(w), f: fonte(r[k]), em: tam(r[k]), papel: r[k] };
            it.w = largura(it.txt, it.f, it.em);
            if (r[k] === 'l') { pend.push(it); return; }
            unid.push({ it: [...pend, it], e: r[k] === 'e' });
            pend = [];
        });
        if (pend.length) { if (unid.length) unid[unid.length - 1].it.push(...pend); else unid.push({ it: pend, e: false }); }
        const g = D.gap * T, gU = Math.max(g, 0.14 * T * (D.gap > 0.07 ? 1.6 : 1));
        unid.forEach(u => { u.w = u.it.reduce((s, it) => s + it.w, 0) + g * (u.it.length - 1); });
        const ie = unid.findIndex(u => u.e);
        const cabeca = ie >= 0 ? unid.slice(0, ie) : unid, enfU = ie >= 0 ? unid[ie] : null, pe = ie >= 0 ? unid.slice(ie + 1) : [];
        const novaLinha = () => ({ it: [], w: 0, u: 0 });
        const poe = (ln, u) => {
            if (ln.u) ln.w += gU;
            let x = ln.w;
            u.it.forEach((it, j) => { if (j) x += g; ln.it.push({ ...it, dx: x }); x += it.w; });
            ln.w = x; ln.u++;
        };
        const maxW = W * VELP_SEGURA;
        let ln = novaLinha();
        cabeca.forEach(u => { if (ln.u && ln.w + gU + u.w > maxW * 0.8) { linhas.push(ln); ln = novaLinha(); } poe(ln, u); });
        if (enfU) {
            const cola = linhas.length === 0 && ln.u > 0 && ln.u <= 2 && ln.w + gU + enfU.w <= maxW && enfU.w < W * 0.45;
            if (!cola && ln.u) { linhas.push(ln); ln = novaLinha(); }
            poe(ln, enfU);
            ln.temE = true;
        }
        if (ln.u) linhas.push(ln);
        if (pe.length) {
            const lp = novaLinha();
            pe.forEach(u => { u.it = u.it.map(it => { const em = T * D.peE; return { ...it, f: D.pe, em, w: largura(it.txt, D.pe, em) }; });
                              u.w = u.it.reduce((s, it) => s + it.w, 0) + g * (u.it.length - 1); poe(lp, u); });
            lp.pe = true;
            linhas.push(lp);
        }
        linhas.forEach(l2 => { l2.em = Math.max(...l2.it.map(it => it.em)); l2.passo = l2.pe ? l2.em * 1.6 : l2.em * D.entre; });
        // escada: 1ª à esquerda, as do meio entrando um pouco, a última (e o pé) à direita
        const n = linhas.length;
        linhas.forEach((l2, k) => { l2.alinha = n === 1 ? 'centro' : l2.pe || k === n - 1 ? 'dir' : k === 0 ? 'esq' : 'meio'; l2.recuo = k * 0.3 * T; });
    }
    // escala para caber na área segura de títulos (80% do quadro, a mesma das margens de segurança do Programa)
    const Wb0 = Math.max(1, ...linhas.map(l2 => l2.w + (l2.alinha === 'meio' ? l2.recuo : 0)));
    const fit = Math.min(1, W * VELP_SEGURA / Wb0);
    // baselines: a 1ª linha pelo ascendente da maior fonte dela; as outras pelo passo (sobreposto)
    let base = 0;
    const runs = [];
    linhas.forEach((l2, k) => {
        if (k) base += l2.passo;
        else base = Math.max(...l2.it.map(it => veLpMet(it.f).asc * it.em));
        l2.base = base;
    });
    const ultima = linhas[linhas.length - 1];
    const fundo = ultima ? ultima.base + Math.max(...ultima.it.map(it => veLpMet(it.f).desc * it.em)) : 0;
    const Wb = Wb0 * fit, Hb = fundo * fit;
    const cy = (VELP_POS[cfg.pos] || VELP_POS.peito) * H - (+e.py || 0) / 100 * H;
    let cx = W / 2 + (+e.px || 0) / 100 * W;
    // o bloco não sai da área segura nem arrastado (só encolhe se não couber)
    const mx = W * (1 - VELP_SEGURA) / 2, my = H * (1 - VELP_SEGURA) / 2;
    const x0 = Math.max(mx, Math.min(W - mx - Wb, cx - Wb / 2)), y0 = Math.max(my, Math.min(H - my - Hb, cy - Hb / 2));
    cx = x0 + Wb / 2;
    linhas.forEach(l2 => {
        const lw = l2.w * fit;
        const xl = l2.alinha === 'centro' ? cx - lw / 2 : l2.alinha === 'dir' ? x0 + Wb - lw : l2.alinha === 'meio' ? x0 + l2.recuo * fit : x0;
        l2.it.forEach(it => {
            const cor = it.papel === 'e' || (!titulo && D.simpCor === 'acc') ? cfg.cor : '#FFFFFF';
            runs.push({ k: it.k, txt: it.txt, f: it.f, em: it.em * fit, x: xl + it.dx * fit, base: y0 + l2.base * fit, w: it.w * fit,
                        cor, papel: it.papel, a: P[it.k] ? Math.max(l.st, P[it.k][0]) : l.st, pe: !!l2.pe });
        });
    });
    // traço sob o destaque (só no título, quando o destaque não está no pé): entra um pouco antes da palavra
    let sub = null;
    const re = runs.find(x => x.papel === 'e' && !x.pe);
    if (titulo && cfg.sub && re) {
        const T = 0.1 * U * fit;
        sub = { x: re.x, y: re.base + Math.max(veLpMet(re.f).desc * re.em * 0.55, T * 0.12), w: re.w, h: Math.max(2, T * 0.055), a: Math.max(l.st, re.a - 0.18), cor: cfg.cor };
    }
    const L = { runs, sub, caixa: { x: x0, y: y0, w: Wb, h: Hb }, cfg, titulo, track: D.track };
    VELP.cache.set(i, { chave, L });
    return L;
}

// ── animação ──
const veLpEase = p => 1 - Math.pow(1 - p, 3);
// estado de uma peça no instante t: alpha, desfoque (em), escala, deslocamento (em), mistura de cor (0 = escura) e brilho extra
function veLpEstado(anim, t, a, fim, enf) {
    const dur = VELP_DUR[anim] || 0.2;
    if (t < a) return null;
    const p = Math.min(1, (t - a) / dur), s = veLpEase(p);
    const q = Math.max(0, Math.min(1, (t - (fim - VELP_SAI)) / VELP_SAI));
    const o = { al: 1, bl: 0, sc: 1, dx: 0, dy: 0, mix: 1, boost: 0 };
    if (anim === 'desfoque') {
        o.al = Math.min(1, p * 1.8); o.bl = (1 - s) * 0.16; o.sc = 1.06 - 0.06 * s; o.dx = enf ? (1 - s) * 0.14 : 0;
        o.boost = p < 1 ? Math.sin(Math.PI * Math.min(1, p / 0.9)) : 0;
    } else if (anim === 'acender') {
        o.al = 0.35 + 0.65 * s; o.mix = s;
    } else if (anim === 'subir') {
        o.al = Math.min(1, p * 1.6); o.dy = (1 - s) * 0.28; o.bl = (1 - s) * 0.04;
    } else if (anim === 'pop') {
        o.al = Math.min(1, p * 2.5); o.sc = p < 0.6 ? 0.6 + 0.48 * (p / 0.6) : 1.08 - 0.08 * ((p - 0.6) / 0.4);
    }
    if (q > 0) { o.al *= 1 - q; if (anim === 'desfoque') o.bl += q * 0.1; }
    return o.al > 0.003 ? o : null;
}
function veLpMistura(hex, k) {   // cor → escura (k = 0) … cor (k = 1)
    const n = parseInt(String(hex).slice(1), 16) || 0, f = 0.38 + 0.62 * k;
    return `rgb(${Math.round((n >> 16 & 255) * f)},${Math.round((n >> 8 & 255) * f)},${Math.round((n & 255) * f)})`;
}

// Desenha a legenda Premium i no monitor (coordenadas do quadro)
function veLpDesenhar(ctx, i, t) {
    const l = VE.legendas[i], L = veLpLayout(i), cfg = L.cfg, D = cfg.D, esc = Math.abs(ctx.getTransform().a) || 1;
    const sombra = D.sombra, brilho = cfg.brilho / 100;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    if (L.sub) {
        const o = veLpEstado('subir', t, L.sub.a, l.en, false);
        if (o) {
            const p = Math.min(1, (t - L.sub.a) / 0.32), w = L.sub.w * veLpEase(p), s = L.sub;
            ctx.save();
            ctx.globalAlpha = o.al;
            ctx.fillStyle = s.cor;
            ctx.shadowColor = s.cor; ctx.shadowBlur = (6 + 14 * brilho) * esc * (s.h / 6);
            ctx.beginPath(); ctx.roundRect(s.x, s.y, Math.max(0.1, w), s.h, s.h / 2); ctx.fill();
            ctx.restore();
        }
    }
    for (const r of L.runs) {
        const o = veLpEstado(cfg.anim, t, r.a, l.en, r.papel === 'e');
        if (!o) continue;
        ctx.save();
        ctx.font = `${r.em}px "${r.f}"`;
        ctx.letterSpacing = `${L.track * r.em}px`;
        const cx = r.x + r.w / 2, cy = r.base - r.em * 0.35;
        ctx.translate(cx + o.dx * r.em, cy + o.dy * r.em);
        ctx.scale(o.sc, o.sc);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha = o.al;
        if (o.bl > 0.004) ctx.filter = `blur(${(o.bl * r.em * esc).toFixed(2)}px)`;
        const cor = o.mix < 1 ? veLpMistura(r.cor, o.mix) : r.cor;
        ctx.fillStyle = cor;
        // sombra de leitura (curta, escura) e, por cima, o brilho na cor da palavra
        if (sombra > 0) {
            ctx.shadowColor = `rgba(0,0,0,${(0.55 * sombra).toFixed(3)})`;
            ctx.shadowBlur = r.em * 0.14 * esc; ctx.shadowOffsetY = r.em * 0.035 * esc;
            ctx.fillText(r.txt, r.x, r.base);
        }
        const gl = brilho * (1 + 1.3 * o.boost);
        if (gl > 0.01) {
            ctx.shadowColor = r.cor === '#FFFFFF' ? `rgba(255,244,230,${Math.min(1, 0.55 * gl).toFixed(3)})` : veTxRgba(r.cor, Math.min(100, 70 * gl));
            ctx.shadowBlur = r.em * (0.18 + 0.22 * gl) * esc; ctx.shadowOffsetY = 0;
            ctx.fillText(r.txt, r.x, r.base);
        }
        ctx.shadowColor = 'transparent';
        ctx.fillText(r.txt, r.x, r.base);
        ctx.restore();
    }
    ctx.restore();
}

// Caixa da legenda Premium (clique, arrastar)
function veLpCaixa(i) { const c = veLpLayout(i).caixa, f = VE.seqH * 0.01; return { x: c.x - f, y: c.y - f, w: c.w + 2 * f, h: c.h + 2 * f }; }

// Para a exportação: as peças medidas, no relógio da faixa exportada (desloc)
function veLpExport(i, desloc) {
    const L = veLpLayout(i), cfg = L.cfg, D = cfg.D, r1 = v => Math.round(v * 10) / 10;
    return {
        anim: cfg.anim, dur: VELP_DUR[cfg.anim] || 0.2, sai: VELP_SAI, brilho: cfg.brilho, sombra: D.sombra, track: D.track,
        runs: L.runs.map(r => {
            const met = veLpMet(r.f), fs = r.em * met.razao;
            // b = linha de base: o _ass_premium refaz fs/cy com as medidas que o libass usa (OS/2 win, não hhea)
            return { t: r.txt, f: r.f, fs: r1(fs), em: r1(r.em), cx: r1(r.x + r.w / 2), cy: r1(r.base - met.asc * r.em + fs / 2), b: r1(r.base),
                     cor: r.cor, e: r.papel === 'e' ? 1 : 0, a: +Math.max(0, r.a - desloc).toFixed(3) };
        }),
        sub: L.sub ? { x: r1(L.sub.x), y: r1(L.sub.y), w: r1(L.sub.w), h: r1(L.sub.h), a: +Math.max(0, L.sub.a - desloc).toFixed(3), cor: L.sub.cor } : null,
    };
}

// ── Kani: escolhe títulos e destaques lendo o texto ──
function veLpKani() {
    const L = VE.legendas || [];
    if (!L.length) { veToast('Monte as legendas Premium primeiro'); return; }
    if (VELP.kani) return;
    VELP.kani = true;
    veLpRenderPainel();
    // os títulos continuam os da montagem automática (no teste do Pailer a Kani escolhendo títulos ficou pior):
    // ela só escolhe a palavra de destaque de cada título que ninguém mexeu à mão
    const blocos = L.map(l => veTxTokens(l.texto));
    const titulos = L.map((l, i) => l.pr && l.pr.t && !l.pr.m ? i : -1).filter(i => i >= 0);
    if (!titulos.length) { VELP.kani = false; veLpRenderPainel(); veToast('Nenhum título automático para refinar'); return; }
    window.pywebview.api.ve_leg_premium_kani(blocos, titulos).then(res => {
        VELP.kani = false;
        if (!res || !res.success) { veToast(res && res.error || 'A Kani não respondeu'); veLpRenderPainel(); return; }
        vePushHistory();
        let n = 0;
        VE.legendas = VE.legendas.map((l, i) => {
            const d = res.destaques[i];
            if (d == null || !l.pr || !l.pr.t || l.pr.m) return l;
            const tk = veTxTokens(l.texto);
            // número no título ganha sempre (a regra automática já o escolheu); ligação nunca é destaque
            if (tk.some(w => /\d/.test(w)) || !tk[d] || veLpEhLig(tk[d])) return l;
            const r = tk.map(w => veLpEhLig(w) ? 'l' : 'b');
            r[d] = 'e';
            if (r.join() !== veLpPapeis(l).join()) n++;
            return { ...l, pr: { t: 1, r } };
        });
        VELP.cache.clear();
        veToast(n ? `Kani trocou o destaque de ${n} título${n > 1 ? 's' : ''}` : 'A Kani manteve os destaques');
        veRefresh();
        veLpSfxAtualizar();
    }).catch(() => { VELP.kani = false; veToast('A Kani não respondeu'); veLpRenderPainel(); });
}

// ── painel (aba Legendas do painel Texto) ──
const veLpModoAtual = (e = veTxEstilo()) => e.modo === 'premium' ? 'premium' : e.dOn ? 'dinamica' : 'classica';
function veLpModosHtml() {
    return `<div class="velp-modos" role="radiogroup" aria-label="Modo das legendas">
        <button data-lpmodo="classica" role="radio"><span class="velp-am velp-am-c"><i>uma frase inteira</i></span><b>Clássica</b><small>Frase inteira, estilo TV</small></button>
        <button data-lpmodo="dinamica" role="radio"><span class="velp-am velp-am-d"><i>a <u>palavra</u> falada</i></span><b>Dinâmica</b><small>Destaca a palavra dita</small></button>
        <button data-lpmodo="premium" role="radio"><span class="velp-am velp-am-p"><i>na</i><em>verdade</em></span><b>Premium</b><small>Títulos com duas fontes</small></button>
    </div>`;
}
function veLpPainelHtml() {
    const duplas = VELP_DUPLAS.map(d => `
        <button class="velp-dupla" data-lpdupla="${d.id}" title="${d.desc}" style="--c:${d.cor}">
            <span class="velp-dupla-am">${veLpEhLig(d.ex[0]) ? `<i style="font-family:'${d.lig}';font-size:${Math.round(d.ligE * 100)}%">${d.ex[0]}</i>` : `<b style="font-family:'${d.base}'">${d.ex[0]}</b>`}<em style="font-family:'${d.enf}';font-size:${Math.round(d.enfE * 100)}%">${d.ex[1]}</em></span>
            <span class="velp-dupla-nome">${d.nome}</span>
        </button>`).join('');
    return `
        <div class="velp-bloco">
            <div class="velp-rot">Dupla de fontes</div>
            <div class="velp-duplas">${duplas}</div>
        </div>
        <div class="velp-bloco">
            <div class="velp-rot">Cor do destaque</div>
            <div class="velp-cores">${VELP_CORES.map(c => `<button class="velp-cor" data-lpcor="${c}" style="--c:${c}" title="${c}"></button>`).join('')}
                <label class="velp-cor velp-cor-livre" title="Outra cor"><input type="color" data-lpcorlivre></label></div>
        </div>
        <div class="velp-bloco velp-2col">
            <div><div class="velp-rot">Títulos</div>
                <div class="velp-seg" data-lpseg="titulos">${[['poucos', 'Poucos'], ['equilibrado', 'Médio'], ['muitos', 'Muitos']].map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('')}</div></div>
            <div><div class="velp-rot">Posição</div>
                <div class="velp-seg velp-pos" data-lpseg="pos">${[['cima', 'Cima'], ['peito', 'Meio'], ['baixo', 'Baixo']].map(([v, n]) => `<button data-v="${v}" title="${n}"><span class="velp-cel"><i class="velp-cel-${v}"></i></span></button>`).join('')}</div></div>
        </div>
        <div class="velp-bloco">
            <div class="velp-rot">Entrada das palavras</div>
            <div class="velp-seg velp-seg-4" data-lpseg="anim">${VELP_ANIMS.map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('')}</div>
        </div>
        <div class="velp-bloco velp-2col">
            <label class="velp-faixa"><span class="velp-rot">Brilho <output data-lpout="brilho"></output></span><input type="range" min="0" max="100" step="1" data-lpfaixa="brilho"></label>
            <label class="velp-faixa"><span class="velp-rot">Tamanho <output data-lpout="tam"></output></span><input type="range" min="50" max="180" step="1" data-lpfaixa="tam"></label>
        </div>
        <label class="velp-chave"><input type="checkbox" data-lpsub><span></span>Traço sob o destaque dos títulos</label>
        <div class="velp-sfx">
            <label class="velp-chave"><input type="checkbox" data-lpsfx><span></span>Efeitos sonoros nas legendas</label>
            <div class="velp-sfx-op" data-lpsfxop>
                <div class="velp-2col">
                    <div><div class="velp-rot">Quantidade</div>
                        <div class="velp-seg" data-lpseg="sfxNivel"><button data-v="sutil">Sutil</button><button data-v="medio">Médio</button><button data-v="forte">Forte</button></div></div>
                    <label class="velp-faixa"><span class="velp-rot">Volume <output data-lpout="sfxVol"></output></span><input type="range" min="-12" max="12" step="1" data-lpfaixa="sfxVol"></label>
                </div>
                <small class="velp-dica" data-lpsfxdica></small>
                <button class="ve-btn ve-btn-sm" data-lpacao="sbbaixar" hidden>Baixar o pack de sons do Soundboard</button>
            </div>
        </div>
        <div class="velp-acoes">
            <button class="ve-btn ve-btn-primary" data-lpacao="montar">Montar legendas Premium</button>
            <button class="ve-btn velp-kani" data-lpacao="kani" title="A Kani lê cada título e escolhe a palavra de destaque (os títulos continuam os da montagem)">✦ Refinar com a Kani</button>
        </div>
        <small class="velp-dica">Clique numa legenda da trilha LEG para trocar título ↔ simples e escolher o destaque palavra por palavra.</small>`;
}
function veLpRenderPainel() {
    const box = $ve('ve-tx');
    if (!box) return;
    const e = veTxEstilo(), modo = veLpModoAtual(e), cfg = veLpCfg(e);
    box.querySelectorAll('[data-lpmodo]').forEach(b => { const on = b.dataset.lpmodo === modo; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const pr = modo === 'premium';
    box.querySelectorAll('[data-lp-so-classica]').forEach(el => { el.hidden = pr; });
    const pn = $ve('velp-painel');
    if (!pn) return;
    pn.hidden = !pr;
    if (!pr) return;
    veLpCarregarFontes(cfg.D);
    pn.style.setProperty('--velp-acc', cfg.cor);
    pn.querySelectorAll('[data-lpdupla]').forEach(b => b.classList.toggle('on', b.dataset.lpdupla === cfg.D.id));
    pn.querySelectorAll('[data-lpcor]').forEach(b => b.classList.toggle('on', b.dataset.lpcor.toLowerCase() === cfg.cor.toLowerCase()));
    const livre = pn.querySelector('[data-lpcorlivre]');
    if (livre && livre.ownerDocument.activeElement !== livre) livre.value = cfg.cor;
    pn.querySelector('.velp-cor-livre').classList.toggle('on', !VELP_CORES.some(c => c.toLowerCase() === cfg.cor.toLowerCase()));
    pn.querySelectorAll('[data-lpseg]').forEach(s => s.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(cfg[s.dataset.lpseg]))));
    pn.querySelectorAll('[data-lpfaixa]').forEach(inp => {
        const k = inp.dataset.lpfaixa;
        if (inp.ownerDocument.activeElement !== inp) inp.value = cfg[k];
        inp.style.setProperty('--p', ((cfg[k] - inp.min) / (inp.max - inp.min) * 100).toFixed(1) + '%');
        pn.querySelector(`[data-lpout="${k}"]`).textContent = k === 'tam' ? `${Math.round(cfg[k])}%` : k === 'sfxVol' ? `${cfg[k] > 0 ? '+' : ''}${Math.round(cfg[k])} dB` : Math.round(cfg[k]);
    });
    pn.querySelector('[data-lpsub]').checked = !!cfg.sub;
    pn.querySelector('[data-lpsfx]').checked = !!cfg.sfx;
    pn.querySelector('[data-lpsfxop]').hidden = !cfg.sfx;
    pn.querySelector('[data-lpsfxdica]').textContent = VELP_SFX_DICA[cfg.sfxNivel] || '';
    pn.querySelector('[data-lpacao="sbbaixar"]').hidden = !VELP.sfxFalta;
    const kb = pn.querySelector('[data-lpacao="kani"]');
    kb.disabled = VELP.kani;
    kb.textContent = VELP.kani ? 'A Kani está lendo…' : '✦ Refinar com a Kani';
}

function veLpInit() {
    const box = $ve('ve-tx');
    if (!box || box._lp) return;
    box._lp = true;
    box.addEventListener('click', ev => {
        const md = ev.target.closest('[data-lpmodo]');
        if (md) { if (md.dataset.lpmodo !== veLpModoAtual()) veLpModo(md.dataset.lpmodo); return; }
        const d = ev.target.closest('[data-lpdupla]');
        if (d) { vePushHistory(); veLpSetCfg({ dupla: d.dataset.lpdupla, cor: '', anim: '', brilho: null }); veRefresh(); veLpSfxAtualizar(); return; }
        const c = ev.target.closest('[data-lpcor]');
        if (c) { vePushHistory(); veLpSetCfg({ cor: c.dataset.lpcor }); veRefresh(); return; }
        const sb = ev.target.closest('[data-lpseg] button');
        if (sb) {
            const k = sb.closest('[data-lpseg]').dataset.lpseg;
            vePushHistory();
            veLpSetCfg({ [k]: sb.dataset.v });
            if (k === 'titulos' && (VE.legendas || []).length) VE.legendas = veLpEscolherTitulos(VE.legendas.map(l => l.pr && l.pr.m ? l : { ...l, pr: null }), sb.dataset.v);
            veRefresh();
            if (k === 'titulos' || k === 'anim' || k === 'sfxNivel') veLpSfxAtualizar();
            return;
        }
        const ac = ev.target.closest('[data-lpacao]');
        if (ac) {
            if (ac.dataset.lpacao === 'montar') { if (!(VE.legendas || []).length || veConfirmarTroca()) veLpCriar(); }
            else if (ac.dataset.lpacao === 'sbbaixar') { vedShow('sb'); if (typeof veSbBaixar === 'function') veSbBaixar(); }
            else veLpKani();
        }
    });
    box.addEventListener('input', ev => {
        const k = ev.target.dataset.lpfaixa;
        if (k) {
            if (!VELP._arrasto) { vePushHistory(); VELP._arrasto = true; }
            veLpSetCfg({ [k]: +ev.target.value });
            veLpRenderPainel();
            veDrawMonitorSoon();
            return;
        }
        if (ev.target.matches('[data-lpcorlivre]')) {
            if (!VELP._arrasto) { vePushHistory(); VELP._arrasto = true; }
            veLpSetCfg({ cor: ev.target.value });
            veLpRenderPainel();
            veDrawMonitorSoon();
        }
    });
    box.addEventListener('change', ev => {
        if (ev.target.matches('[data-lpfaixa], [data-lpcorlivre]')) {
            VELP._arrasto = false;
            if (ev.target.dataset.lpfaixa === 'sfxVol') veLpSfxVolume();
            veRefresh();
        }
        if (ev.target.matches('[data-lpsub]')) { vePushHistory(); veLpSetCfg({ sub: ev.target.checked }); veRefresh(); }
        if (ev.target.matches('[data-lpsfx]')) { vePushHistory(); veLpSetCfg({ sfx: ev.target.checked }); veRefresh(); veLpSfxAtualizar(true); }
    });
}

// ── Propriedades de uma legenda Premium (editor-props.js) ──
function veLpPropsHtml() {
    const i = VETX.legSel, l = VE.legendas[i];
    if (!l) return '';
    const tk = veTxTokens(l.texto), r = veLpPapeis(l), t = !!(l.pr && l.pr.t), cfg = veLpCfg(veTxEstiloLegenda(i));
    const nome = { l: 'ligação', b: 'base', e: 'destaque' };
    return vePpSec('Bloco Premium', `
        <div class="velp-seg velp-tipo" style="--velp-acc:${cfg.cor}">
            <button data-lptipo="1" class="${t ? 'on' : ''}">Título</button><button data-lptipo="0" class="${t ? '' : 'on'}">Simples</button></div>
        <div class="velp-rot">Papel de cada palavra <small>(clique para trocar)</small></div>
        <div class="velp-pals" style="--velp-acc:${cfg.cor}">${tk.map((w, k) => `<button class="velp-pal velp-pal-${r[k]}" data-lppal="${k}" title="${nome[r[k]]} — clique para trocar">${veTxEsc(w)}</button>`).join('')}</div>
        <div class="velp-legenda" style="--velp-acc:${cfg.cor}"><span class="velp-pal-l">ligação</span><span class="velp-pal-b">base</span><span class="velp-pal-e">destaque</span></div>
        <div class="ve-pp-botoes"><button class="ve-btn ve-btn-sm ve-btn-ghost" data-lpauto>Automático</button><button class="ve-btn ve-btn-sm ve-btn-ghost" data-ppleg="centro" title="Volta a legenda para a posição escolhida no painel Texto">Zerar deslocamento</button></div>
        <small class="ve-pp-dica">Dupla, cor e animação valem para todas: painel Texto › Legendas. Arraste no monitor para mover.</small>`);
}
// chave para o painel Propriedades se refazer quando o bloco muda
function veLpChavePP() {
    if (!veLpAtivo()) return '';
    const l = (VE.legendas || [])[VETX.legSel];
    return l ? 'lp' + JSON.stringify([l.texto, l.pr]) : 'lp';
}
document.addEventListener('click', ev => {
    const alvo = ev.target.closest('[data-lptipo], [data-lppal], [data-lpauto]');
    if (!alvo || !alvo.closest('#ve-pp')) return;
    const i = VETX.legSel, l = (VE.legendas || [])[i];
    if (!l) return;
    vePushHistory();
    const tk = veTxTokens(l.texto);
    let t = !!(l.pr && l.pr.t), r = [...veLpPapeis(l)];
    if (alvo.dataset.lpauto != null) {
        VE.legendas[i] = { ...l, pr: { t: t ? 1 : 0, r: veLpPapeisAuto(tk, t) } };
    } else {
        if (alvo.dataset.lptipo != null) { t = alvo.dataset.lptipo === '1'; r = veLpPapeisAuto(tk, t); }
        else {
            const k = +alvo.dataset.lppal, prox = { l: 'b', b: 'e', e: 'l' }[r[k]];
            if (prox === 'e') r = r.map(x => x === 'e' ? 'b' : x);   // um destaque por bloco
            r[k] = prox;
            if (prox === 'e') t = true;
        }
        VE.legendas[i] = { ...l, pr: { t: t ? 1 : 0, r, m: 1 } };
    }
    VELP.cache.clear();
    veMarcarAlterado();
    veRefresh();
    veLpSfxAtualizar();
});

// ── efeitos sonoros: sons do Soundboard no tempo das palavras, escolhidos pelo movimento e pelo assunto ──
// Cada pedido = [categoria do pack, nome, duração mín, máx] (sons curtos: o pico do som cai na chegada da palavra).
// entra = entrada do título (1ª palavra); acento = palavra de destaque; simples = toque leve nas legendas simples.
// Os nomes valem para o pack 2 (2026-10-18: "Whoosh rápido 01", "Clique 01", "Correto"...) e o antigo (v1).
const VELP_SFX_PAL = {
    entra: {
        desfoque: [['whoosh', /^(swish|swoosh|whoosh)( (rápido|médio|curto))? \d/i, 0.25, 1.4]],
        subir: [['whoosh', /^(swoosh|swish|whoosh rápido) \d/i, 0.2, 1.2]],
        pop: [['pop', /^(pop|bolha|pop de boca) \d/i, 0, 0.45]],
        acender: [['pop', /^(clique|clique suave|pluck|seleção) \d/i, 0, 0.3]],
    },
    acento: {
        desfoque: [['whoosh', /^(swish|swoosh|whoosh rápido) \d/i, 0, 0.5]],
        subir: [['pop', /^(rollover|clique suave|clique) \d/i, 0, 0.3]],
        pop: [['pop', /^(pop|bolha) \d/i, 0, 0.35]],
        acender: [['pop', /^(pluck|toque|clique) \d/i, 0, 0.25]],
    },
    simples: [['pop', /^(clique suave|toque|clique) \d/i, 0, 0.25]],
};
// assunto da palavra → som que combina (vale a primeira que bater no título)
const VELP_SFX_ASSUNTO = [
    [/^(dinheiro|reais|real|r\$\d*|lucro|lucrar|vender|venda|vendas|faturar|faturamento|grana|pagar|pago|preço|caro|barato|milhões?|salário)$/i,
     [['dinheiro', /^(moeda|moedas|caixa registradora|dinheiro)\b/i, 0, 1.2]]],
    [/^(consegui|conseguiu|conseguimos|sucesso|pronto|pronta|aprovad[oa]s?|ganhei|ganhou|venci|certo|certinho|feito|resolvido|perfeito)$/i,
     [['notificacao', /^(confirmação|sucesso|correto|ting campainha$)/i, 0, 1.2]]],
    [/^(foto|fotos|câmera|camera|print|selfie)$/i, [['objetos', /^câmera \(foto\) \d/i, 0, 0.9]]],
    [/^(erro|erros|errado|errada|errar|proibido|cuidado|nunca)$/i, [['notificacao', /^(erro \d|errado$|incorreto$)/i, 0, 1.5]]],
    [/^(digitar|digitando|escrever|escrevendo|texto|mensagem)$/i,
     [['objetos', /^digitando \d/i, 0, 1.7], ['trabalho', /^digitando (curto|médio)$/i, 0, 2.6]]],
];
const VELP_SFX_PERGUNTA = [['notificacao', /^pergunta \d/i, 0, 0.5], ['memes', /^ahn\?/i, 0, 1.2]];
const VELP_SFX_GANHO = { entra: -12, acento: -14, assunto: -10, simples: -19 };   // dB no clipe, antes do Volume do painel
const VELP_SFX_DICA = {
    sutil: 'Um som na entrada de cada título, no ritmo da animação, e um som do assunto quando a frase pede (moedas, câmera, confirmação…).',
    medio: 'Sutil + um toque na palavra de destaque de cada título.',
    forte: 'Médio + um clique leve no começo de cada legenda simples.',
};

// Sons que atendem a um pedido, com o instante do pico (o "golpe" do som) — pk = forma de onda do pack (48 picos)
function veLpSfxSons(dados, pedidos) {
    const out = [];
    (pedidos || []).forEach(([cat, rx, dmin, dmax]) => {
        const c = (dados.categorias || []).find(x => x.id === cat);
        (c ? c.sons : []).forEach(s => {
            if (!rx.test(s.nome) || s.dur < dmin || s.dur > dmax) return;
            const pk = Array.isArray(s.pk) && s.pk.length ? s.pk : null;
            out.push({ ...s, pico: pk ? pk.indexOf(Math.max(...pk)) / pk.length * s.dur : 0 });
        });
    });
    return out;
}

// Plano: [{st, s (som), g (dB), tipo}] — no máximo um som a cada 0,22 s (fica o de maior prioridade)
function veLpSfxPlano(dados, cfg) {
    const anim = cfg.anim, nivel = cfg.sfxNivel || 'medio', ev = [];
    const pools = new Map(), usados = new Map();
    const pool = (chave, pedidos) => { if (!pools.has(chave)) pools.set(chave, veLpSfxSons(dados, pedidos)); return pools.get(chave); };
    // variação sem repetir o mesmo som seguido (sorteio fixo pelo índice: refazer dá o mesmo resultado)
    const escolhe = (chave, pedidos, semente) => {
        const p = pool(chave, pedidos);
        if (!p.length) return null;
        let s = p[(semente * 7 + 3) % p.length];
        if (usados.get(chave) === s.arq && p.length > 1) s = p[(semente * 7 + 4) % p.length];
        usados.set(chave, s.arq);
        return s;
    };
    const chega = 0.06;   // a palavra aparece de vez ~60 ms depois de começar a entrar
    (VE.legendas || []).forEach((l, i) => {
        const tk = veTxTokens(l.texto), r = veLpPapeis(l), P = veTxLegTempos(l);
        if (!tk.length) return;
        const quando = k => (P[k] ? Math.max(l.st, P[k][0]) : l.st) + chega;
        if (l.pr && l.pr.t) {
            let assunto = null, ka = -1;
            tk.forEach((w, k) => {
                if (assunto) return;
                const n = String(w).toLowerCase().replace(/[^\p{L}\p{N}$]/gu, '');
                const m = VELP_SFX_ASSUNTO.find(([rx]) => rx.test(n));
                if (m) { assunto = m[1]; ka = k; }
            });
            if (!assunto && /\?["')\]]?$/.test(tk[tk.length - 1])) { assunto = VELP_SFX_PERGUNTA; ka = tk.length - 1; }
            const se = escolhe('entra', VELP_SFX_PAL.entra[anim] || VELP_SFX_PAL.entra.desfoque, i);
            if (se) ev.push({ t: quando(0), s: se, g: VELP_SFX_GANHO.entra, pri: 2 });
            if (assunto) {
                const sa = escolhe('assunto' + VELP_SFX_ASSUNTO.findIndex(([, p]) => p === assunto), assunto, i);
                if (sa) ev.push({ t: quando(ka), s: sa, g: VELP_SFX_GANHO.assunto, pri: 3 });
            }
            const ke = r.indexOf('e');
            if (nivel !== 'sutil' && ke > 0 && ke !== ka) {
                const sc = escolhe('acento', VELP_SFX_PAL.acento[anim] || VELP_SFX_PAL.acento.desfoque, i + 1);
                if (sc) ev.push({ t: quando(ke), s: sc, g: VELP_SFX_GANHO.acento, pri: 1 });
            }
        } else if (nivel === 'forte') {
            const ss = escolhe('simples', VELP_SFX_PAL.simples, i);
            if (ss) ev.push({ t: quando(0), s: ss, g: VELP_SFX_GANHO.simples, pri: 0 });
        }
    });
    // perto demais: fica o mais importante
    ev.sort((a, b) => a.t - b.t);
    const out = [];
    ev.forEach(e => {
        const ult = out[out.length - 1];
        if (ult && e.t - ult.t < 0.22) { if (e.pri > ult.pri) out[out.length - 1] = e; return; }
        out.push(e);
    });
    return out.map(e => ({ st: e.t - e.s.pico, s: e.s, g: e.g }));
}

// O som como mídia do projeto (pasta "Soundboard" do painel Projeto, igual ao Soundboard)
async function veLpSfxMidia(s) {
    let m = VE.media.find(x => x && !x.removido && x.kind === 'audio' && x.path === s.path);
    if (m) return m;
    let b = (VE.bins || []).find(x => x.nome === 'Soundboard' && !x.pai);
    if (!b) b = vePjNovoBin('Soundboard');
    const n = VE.media.length;
    if (!await vePjImportarArquivo(s.path, b.id) || VE.media.length === n) return null;
    m = VE.media[VE.media.length - 1];
    m.nome = s.nome;
    return m;
}

// Refaz os efeitos sonoros das legendas (clipes marcados lpSfx, numa trilha de áudio própria). Quem chama já pôs o
// estado anterior no desfazer: um Ctrl+Z volta a legenda e os sons juntos. Clipes lpSfx movidos à mão são refeitos.
async function veLpSfxAtualizar(aviso) {
    if (VELP.sfxRodando) { VELP.sfxDeNovo = true; return; }
    VELP.sfxRodando = true;
    try {
        const cfg = veLpCfg(), tinha = VE.clips.some(c => c.lpSfx);
        const ligado = VE.ready && veLpAtivo() && cfg.sfx && (VE.legendas || []).length > 0;
        const tirar = () => { VE.clips = VE.clips.filter(c => !c.lpSfx); VE.sel = -1; };
        if (!ligado) {
            if (tinha) { tirar(); veRelayout(); veAfterEdit(VE.playhead); vePjAlterou(); }
            return;
        }
        const api = window.pywebview && window.pywebview.api;
        const dados = api && api.ve_sb_estado ? await api.ve_sb_estado() : null;
        VELP.sfxFalta = !(dados && dados.instalado);
        if (VELP.sfxFalta) { veLpRenderPainel(); veToast('Os efeitos usam o pack do Soundboard: baixe-o uma vez (botão no painel)'); return; }
        const plano = veLpSfxPlano(dados, cfg);
        const midias = new Map();
        for (const p of plano) if (!midias.has(p.s.path)) midias.set(p.s.path, await veLpSfxMidia(p.s));
        tirar();
        const novos = [], vol = +cfg.sfxVol || 0;
        plano.forEach(p => {
            const m = midias.get(p.s.path);
            if (!m) return;
            const dur = m.dur || p.s.dur, st = veSnapFrame(Math.max(0, p.st));
            const tr = veSbTrilhaLivre(st, dur, { m: m.id }, novos);
            if (tr < 0) return;
            novos.push({ tr, st, s: 0, e: dur, m: m.id, g: p.g + vol, lpSfx: 1, lpG: p.g, ...(m.cor ? { cor: m.cor } : {}) });
        });
        VE.clips.push(...novos);
        veRelayout();
        veAfterEdit(VE.playhead);
        vePjAlterou();
        veLpRenderPainel();
        if (aviso) veToast(novos.length ? `${novos.length} efeitos sonoros nas legendas (trilha de áudio própria)` : 'Nenhum som combinou com essas legendas');
    } finally {
        VELP.sfxRodando = false;
        if (VELP.sfxDeNovo) { VELP.sfxDeNovo = false; veLpSfxAtualizar(); }
    }
}
// Volume do painel: só o ganho dos clipes que já estão lá (não refaz a escolha)
function veLpSfxVolume() {
    const vol = +veLpCfg().sfxVol || 0;
    VE.clips.forEach(c => { if (c.lpSfx) c.g = (c.lpG ?? -12) + vol; });
    veAfterEdit(VE.playhead);
}

document.addEventListener('DOMContentLoaded', () => setTimeout(veLpInit, 0));
