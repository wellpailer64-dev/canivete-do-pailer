// =========================================================
// Pocket Editor — painel Texto: Transcrever e Criar legendas (como no Premiere)
// Transcrição: Functions/legendas.py (Parakeet via onnx-asr, local) sobre a MESMA mixagem da exportação;
// devolve palavras [início, fim, texto] em segundos da timeline (VETX.palavras).
// Legendas: VE.legendas = [{st, en, texto, estilo?}] (entram no desfazer), estilo padrão em VE.legEstilo; aparecem numa trilha
// própria no alto da timeline (linha "LEG"), no monitor (veTxDesenhar) e, ao exportar, gravadas no vídeo com o
// mesmo estilo (_gerar_ass em video_cutter.py) ou num arquivo (SRT, VTT, ASS, SSA, SBV ou TXT).
// =========================================================

const VE_LEG_PADRAO = { max: 42, linhas: 2, minDur: 3, gap: 0 };                 // "Criar legendas" do Premiere
// s* = sombra projetada (px do quadro, como a dos textos); entrada = 'nenhum' | 'pop' | 'fade'
// px/py = deslocamento a partir da posição (% do quadro; py positivo sobe); caixa* = cor, opacidade (%) e cantos
// (0 = retos, 100 = pílula); cCor/cLarg = contorno do "Contorno e sombra" (largura em % da fonte)
const VE_LEG_ESTILO = { fonte: 'Arial', tam: 5.5, cor: '#ffffff', fundo: 'caixa', pos: 'baixo', maiusc: false, negrito: true, ita: false,
    sOn: false, sCor: '#000000', sOp: 75, sDist: 6, sBlur: 8, entrada: 'nenhum', px: 0, py: 0,
    caixaCor: '#000000', caixaOp: 64, caixaRaio: 0, cCor: '#000000', cLarg: 12,
    // destaque da palavra falada (vale para todas): retângulo dCor atrás dela, texto dela em dTxt; dPad = margem (% da fonte)
    dOn: false, dCor: '#22c55e', dTxt: '#ffffff', dOp: 100, dRaio: 30, dPad: 12 };
const VE_LEG_ENTRADA = { fade: 0.12, pop: 0.18 };   // segundos: rápido, para não atrapalhar a leitura

const VETX = {
    palavras: [], idioma: 'pt', chave: '', rodando: false, aba: 'trans', legSel: -1, ativa: -1,
    busca: '', achados: [], achado: -1, opcoes: { ...VE_LEG_PADRAO }, modelos: null, construido: false,
};

function veTxEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function veTxTempo(t) { return veTC(t).slice(0, 8); }

// ─────────────────────────── transcrição ───────────────────────────
function veTxMixChave() { return JSON.stringify(veMixClipes()); }

function veTxTranscrever() {
    if (!VE.ready || VETX.rodando) return;
    const cl = veExportPlan().mix;
    if (!cl.length) { veToast('Não há som na timeline para transcrever'); return; }
    VETX.idioma = $ve('ve-tx-idioma').value;
    VETX.rodando = true;
    VETX.chaveAlvo = veTxMixChave();
    veTxProgresso(0, 'Começando...');
    veTxRender();
    window.pywebview.api.ve_transcrever(cl, VE.dur, VETX.idioma);
}

function veTxCancelar() { window.pywebview.api.ve_transcrever_cancelar(); }

function veTxProgresso(p, msg) {
    const f = $ve('ve-tx-prog-fill'), m = $ve('ve-tx-prog-msg');
    if (f) f.style.width = p + '%';
    if (m) m.textContent = msg ? `${msg} ${p ? p + '%' : ''}` : '';
}

// Eventos do Python (legendas.transcrever)
function veOnTexto(ev) {
    if (ev.stage === 'prog') { veTxProgresso(ev.pct, ev.msg); return; }
    VETX.rodando = false;
    if (ev.success) {
        VETX.palavras = veTxJuntarHifen(ev.palavras || []);
        VETX.chave = VETX.chaveAlvo;
        VETX.construidoTexto = false;
        veMarcarAlterado();
        veToast(VETX.palavras.length ? `Transcrição pronta: ${VETX.palavras.length} palavras em ${ev.segundos} s` : 'Nenhuma fala encontrada na timeline');
    } else if (!ev.cancelled) {
        veToast('Não foi possível transcrever: ' + (ev.error || 'erro'));
    }
    veTxRender();
}

function veMarcarAlterado() { if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); } }

// "lembre -se" / "lembre - se" → "lembre-se": o modelo às vezes separa o hífen da ênclise. Legendas.py já junta
// nas transcrições novas; aqui corrige as que estão salvas em projetos antigos.
function veTxJuntarHifen(W) {
    const out = [];
    W.forEach(w => {
        const ant = out[out.length - 1], txt = String(w[2]);
        if (ant && (txt[0] === '-' || (/-$/.test(ant[2]) && /^\p{L}/u.test(txt)))) { ant[1] = w[1]; ant[2] += txt; }
        else out.push([w[0], w[1], txt]);
    });
    return out;
}

// Parágrafos: quebra em pausas longas ou em fim de frase depois de um trecho grande
function veTxParagrafos() {
    const P = [], W = VETX.palavras;
    let cur = null;
    W.forEach((w, i) => {
        const pausa = i ? w[0] - W[i - 1][1] : 0;
        const fimFrase = i && /[.!?…]["')\]]?$/.test(W[i - 1][2]);
        if (!cur || pausa > 1.5 || (fimFrase && cur.n >= 45)) { cur = { i0: i, n: 0 }; P.push(cur); }
        cur.n++;
        cur.i1 = i;
    });
    return P;
}

// Palavra na agulha (busca binária)
function veTxPalavraEm(t) {
    const W = VETX.palavras;
    let lo = 0, hi = W.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (W[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r >= 0 && t <= W[r][1] + 0.35 ? r : -1;
}

// Chamado a cada atualização da agulha: destaca a palavra falada e mantém à vista
function veTxSeguir() {
    if (!VETX.palavras.length || !vedVisible('texto')) return;
    const i = veTxPalavraEm(VE.playhead);
    if (i === VETX.ativa) return;
    const box = $ve('ve-tx-texto');
    if (!box) return;
    const velho = box.querySelector('.ve-tx-w.falando');
    if (velho) velho.classList.remove('falando');
    VETX.ativa = i;
    const el = i >= 0 ? box.querySelector(`[data-w="${i}"]`) : null;
    if (el) {
        el.classList.add('falando');
        if (VE.playing) {
            const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
            if (r.top < b.top + 20 || r.bottom > b.bottom - 20) el.scrollIntoView({ block: 'center' });
        }
    }
}

function veTxBuscar(q) {
    VETX.busca = q.trim().toLowerCase();
    const box = $ve('ve-tx-texto');
    box.querySelectorAll('.ve-tx-w.achado').forEach(e => e.classList.remove('achado'));
    VETX.achados = [];
    VETX.achado = -1;
    if (VETX.busca) {
        const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, '');
        const alvo = norm(VETX.busca).split(/\s+/).filter(Boolean);
        const W = VETX.palavras.map(w => norm(w[2]));
        for (let i = 0; i + alvo.length <= W.length; i++) {
            if (alvo.every((a, k) => W[i + k].startsWith(a) && (k === alvo.length - 1 || W[i + k] === a))) {
                VETX.achados.push(i);
                for (let k = 0; k < alvo.length; k++) box.querySelector(`[data-w="${i + k}"]`)?.classList.add('achado');
            }
        }
    }
    $ve('ve-tx-busca-n').textContent = VETX.busca ? `${VETX.achados.length}` : '';
}

function veTxProximoAchado(dir) {
    if (!VETX.achados.length) return;
    VETX.achado = (VETX.achado + dir + VETX.achados.length) % VETX.achados.length;
    const i = VETX.achados[VETX.achado];
    veSeek(VETX.palavras[i][0]);
    $ve('ve-tx-texto').querySelector(`[data-w="${i}"]`)?.scrollIntoView({ block: 'center' });
}

// ─────────────────────────── legendas ───────────────────────────
// Agrupa as palavras em legendas como o "Criar legendas" do Premiere: até `max` caracteres por linha e sem passar
// da largura da tela (medida com a fonte e o tamanho do estilo), 1 ou 2 linhas, quebra em pausas e fins de frase;
// duração mínima e intervalo entre legendas (quadros).
function veTxMontarLegendas(o) {
    const cap = o.max * o.linhas, caps = [];
    const tam = ws => ws.map(w => w[2]).join(' ').length;
    const e = veTxEstilo(), m = VE_LEG_MEDIDA || (VE_LEG_MEDIDA = document.createElement('canvas').getContext('2d'));
    const largMax = VE.seqW * VE_LEG_LARG_MAX;
    m.font = veTxFonteCss(e, Math.max(4, e.tam / 100 * VE.seqH));
    const cabeLinha = txt => txt.length <= o.max && m.measureText(e.maiusc ? txt.toUpperCase() : txt).width <= largMax;
    // as palavras cabem em até `linhas` linhas? (uma palavra sozinha sempre cabe: não há como quebrar)
    const cabe = ws => {
        if (ws.length <= 1) return true;
        const ps = ws.map(w => w[2]);
        if (cabeLinha(ps.join(' '))) return true;
        if (o.linhas < 2) return false;
        for (let k = 1; k < ps.length; k++) if (cabeLinha(ps.slice(0, k).join(' ')) && cabeLinha(ps.slice(k).join(' '))) return true;
        return false;
    };
    const fim = txt => /[.!?…]["')\]]?$/.test(txt), virgula = txt => /[,;:]["')\]]?$/.test(txt);
    let cur = [];
    const fechar = ws => { if (ws.length) caps.push({ st: ws[0][0], en: ws[ws.length - 1][1], palavras: ws.map(w => w[2]), pt: ws.map(w => [+w[0].toFixed(3), +w[1].toFixed(3)]) }); };
    for (const w of VETX.palavras) {
        if (cur.length && w[0] - cur[cur.length - 1][1] > 1.2) { fechar(cur); cur = []; }   // pausa longa
        cur.push(w);
        if (!cabe(cur)) {
            // estourou: corta no fim de frase mais tardio cujo resto caiba inteiro na próxima legenda (mesmo que
            // esta fique curta); senão numa vírgula com a legenda pelo menos meio cheia; senão antes desta palavra
            const cabeResto = j => cabe(cur.slice(j + 1));
            let k = -1;
            for (let j = cur.length - 2; j >= 0 && k < 0; j--) if (fim(cur[j][2]) && cabeResto(j)) k = j;
            for (let j = cur.length - 2; j >= 0 && k < 0; j--) if (virgula(cur[j][2]) && cabeResto(j) && tam(cur.slice(0, j + 1)) >= cap * 0.5) k = j;
            if (k < 0) k = cur.length - 2;
            fechar(cur.slice(0, k + 1));
            cur = cur.slice(k + 1);
        } else if (fim(w[2]) && tam(cur) >= cap * 0.7) { fechar(cur); cur = []; }         // fim de frase com a legenda cheia
    }
    fechar(cur);
    // quebra de linha equilibrada (duas linhas de tamanhos parecidos, cada uma cabendo na linha)
    const quebrar = ps => {
        const txt = ps.join(' ');
        if (o.linhas < 2 || cabeLinha(txt)) return txt;
        let melhor = null;
        for (let k = 1; k < ps.length; k++) {
            const a = ps.slice(0, k).join(' '), b = ps.slice(k).join(' ');
            if (!cabeLinha(a) || !cabeLinha(b)) continue;
            const d = Math.abs(a.length - b.length);
            if (!melhor || d < melhor.d) melhor = { d, t: a + '\n' + b };
        }
        return melhor ? melhor.t : txt;
    };
    const gap = (o.gap || 0) / (VE.fps || 30);
    return caps.map((c, i) => {
        const prox = caps[i + 1];
        const limite = prox ? prox.st - gap : Infinity;
        const en = Math.min(Math.max(c.en, c.st + o.minDur), limite);
        return { st: +c.st.toFixed(3), en: +Math.max(c.st + 0.3, en).toFixed(3), texto: quebrar(c.palavras), pt: c.pt };
    });
}

function veTxCriarLegendas() {
    if (!VETX.palavras.length) { veToast('Transcreva a sequência primeiro'); return; }
    const juntas = veTxJuntarHifen(VETX.palavras);
    if (juntas.length !== VETX.palavras.length) { VETX.palavras = juntas; VETX.construidoTexto = false; }
    const o = {
        max: Math.max(7, Math.min(72, +$ve('ve-leg-max').value || 42)),
        linhas: +$ve('ve-leg-linhas').value || 2,
        minDur: Math.max(0.5, Math.min(6, +String($ve('ve-leg-min').value).replace(',', '.') || 3)),
        gap: Math.max(0, Math.min(10, +$ve('ve-leg-gap').value || 0)),
    };
    VETX.opcoes = o;
    vePushHistory();
    VE.legendas = veTxMontarLegendas(o);
    VETX.legSel = -1;
    veToast(`${VE.legendas.length} legendas criadas`);
    veRefresh();
}

function veTxEstilo() { return Object.assign({}, VE_LEG_ESTILO, VE.legEstilo || {}); }
function veTxEstiloLegenda(i = VETX.legSel) {
    const l = (VE.legendas || [])[i];
    return Object.assign({}, veTxEstilo(), l && l.estilo || {});
}
function veTxSetEstiloLegenda(i, patch) {
    const l = (VE.legendas || [])[i];
    if (!l) return false;
    VE.legendas[i] = { ...l, estilo: { ...(l.estilo || {}), ...patch } };
    return true;
}

function veTxLegendaEm(t) {
    const L = VE.legendas || [];
    for (let i = 0; i < L.length; i++) if (t >= L[i].st && t < L[i].en) return i;
    return -1;
}

// Altura da linha e topo das letras da fonte (em "em"): o libass usa o Fontsize do .ass como a altura da linha
// (ascendente + descendente), então a prévia mede a fonte escolhida e a exportação recebe a proporção
const VE_LEG_MET = new Map();
function veTxMetricas(e) {
    const k = e.fonte + '|' + !!e.negrito + '|' + !!e.ita;
    if (!VE_LEG_MET.has(k)) {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${e.ita ? 'italic ' : ''}${e.negrito ? 'bold ' : ''}100px "${e.fonte}", Arial`;
        const m = ctx.measureText('Hg');
        const asc = (m.fontBoundingBoxAscent || 90.5) / 100, desc = (m.fontBoundingBoxDescent || 21.2) / 100;
        VE_LEG_MET.set(k, { asc, razao: asc + desc });
    }
    return VE_LEG_MET.get(k);
}

// Posição e medidas de uma legenda no quadro (a mesma conta do .ass da exportação): desenho, clique e edição
let VE_LEG_MEDIDA = null;
const VE_LEG_LARG_MAX = 0.92;   // a linha mais larga ocupa no máximo 92% da largura do quadro
const veTxFonteCss = (e, em) => `${e.ita ? 'italic ' : ''}${e.negrito ? 'bold ' : ''}${em}px "${e.fonte}", Arial`;
function veTxLegLayout(texto, e = veTxEstilo()) {
    const H = VE.seqH, W = VE.seqW, met = veTxMetricas(e);
    let em = Math.max(4, e.tam / 100 * H);
    const margem = Math.round(0.06 * H);
    let linhas = String(texto || '').split('\n').filter(l => l.trim());
    if (e.maiusc) linhas = linhas.map(l => l.toUpperCase());
    const m = VE_LEG_MEDIDA || (VE_LEG_MEDIDA = document.createElement('canvas').getContext('2d'));
    m.font = veTxFonteCss(e, em);
    let larg = linhas.map(l => m.measureText(l).width);
    // não passa da tela: a legenda larga demais encolhe só o necessário (a exportação recebe o tamanho ajustado)
    const fator = Math.min(1, W * VE_LEG_LARG_MAX / Math.max(1, ...larg));
    if (fator < 1) {
        em *= fator;
        m.font = veTxFonteCss(e, em);
        larg = linhas.map(l => m.measureText(l).width);
    }
    const alt = em * met.razao, folga = em * 0.22, fonte = veTxFonteCss(e, em), bloco = linhas.length * alt;
    const topo = (e.pos === 'cima' ? margem : e.pos === 'meio' ? (H - bloco) / 2 : H - margem - bloco) - (+e.py || 0) / 100 * H;
    const cx = W / 2 + (+e.px || 0) / 100 * W;
    return { W, H, cx, em, alt, folga, margem, linhas, fonte, larg, bloco, topo, asc: met.asc, wMax: Math.max(0, ...larg), fator };
}

// Cor #rrggbb + opacidade (%) → rgba()
function veTxRgba(hex, op) {
    const n = parseInt(String(hex || '#000000').slice(1), 16) || 0;
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Math.max(0, Math.min(100, +op)) / 100})`;
}

// Caixa da legenda: um retângulo por linha; com cantos arredondados, as linhas viram uma forma só
// (a exportação desenha a mesma forma no .ass, _gerar_ass)
function veTxCaixa(ctx, L, e, d = 0) {
    const raio = Math.max(0, Math.min(100, +e.caixaRaio || 0));
    const h = L.alt + L.folga * 2;
    if (!raio) {
        L.linhas.forEach((l, k) => ctx.fillRect(L.cx - L.larg[k] / 2 - L.folga + d, L.topo + k * L.alt - L.folga + d, L.larg[k] + L.folga * 2, h));
        return;
    }
    ctx.beginPath();
    L.linhas.forEach((l, k) => {
        const w = L.larg[k] + L.folga * 2;
        ctx.roundRect(L.cx - w / 2 + d, L.topo + k * L.alt - L.folga + d, w, h, Math.min(h, w) / 2 * raio / 100);
    });
    ctx.fill();
}

// Pop: 80% → 106% → 100% (linear, como os \t do .ass); cresce a partir da borda da posição (embaixo/em cima/meio)
function veTxPopEscala(p) { return p < 0.65 ? 0.8 + 0.26 * (p / 0.65) : 1.06 - 0.06 * ((p - 0.65) / 0.35); }
function veTxEntrada(ctx, e, L, t, i) {
    const dur = VE_LEG_ENTRADA[e.entrada];
    if (!dur || t < 0 || t >= dur || VETX.editando === i) return;
    const p = t / dur;
    if (e.entrada === 'fade') { ctx.globalAlpha *= p; return; }
    const s = veTxPopEscala(p), oy = e.pos === 'cima' ? L.topo : e.pos === 'meio' ? L.topo + L.bloco / 2 : L.topo + L.bloco;
    ctx.globalAlpha *= Math.min(1, p * 3);
    ctx.translate(L.cx, oy);
    ctx.scale(s, s);
    ctx.translate(-L.cx, -oy);
}

// Sombra projetada do texto: o texto na cor da sombra, deslocado e desfocado, num quadro à parte
// (a exportação faz igual: uma cópia da legenda numa camada de baixo com \blur)
function veTxSombraQuadro(L, e) {
    const c = VETX._sombra || (VETX._sombra = document.createElement('canvas'));
    if (c.width !== L.W || c.height !== L.H) { c.width = L.W; c.height = L.H; }
    const o = c.getContext('2d'), d = e.sDist * Math.SQRT1_2;
    o.clearRect(0, 0, c.width, c.height);
    o.save();
    o.filter = e.sBlur > 0 ? `blur(${e.sBlur / 2}px)` : 'none';
    o.font = L.fonte;
    o.textAlign = 'center';
    o.textBaseline = 'alphabetic';
    o.fillStyle = e.sCor;
    L.linhas.forEach((l, k) => o.fillText(l, L.cx + d, L.topo + k * L.alt + L.em * L.asc + d));
    o.restore();
    return c;
}

// ── destaque da palavra falada (como os apps de legenda animada) ──
// Tempo de cada palavra da legenda: o guardado ao criar (l.pt); texto editado → as palavras da transcrição no trecho,
// se baterem; senão o tempo da legenda dividido pelo tamanho de cada palavra
const veTxTokens = texto => String(texto || '').split(/\s+/).filter(Boolean);
function veTxLegTempos(l) {
    const n = veTxTokens(l.texto).length;
    if (!n) return [];
    if (Array.isArray(l.pt) && l.pt.length === n) return l.pt;
    const W = (VETX.palavras || []).filter(w => w[0] >= l.st - 0.05 && w[0] < l.en);
    if (W.length === n) return W.map(w => [w[0], w[1]]);
    const tk = veTxTokens(l.texto), tot = tk.reduce((s, w) => s + w.length + 1, 0), out = [];
    let t = l.st;
    tk.forEach(w => { const d = (l.en - l.st) * (w.length + 1) / tot; out.push([t, t + d]); t += d; });
    return out;
}
// Palavra falada no instante t: a última que já começou (entre palavras, a anterior continua marcada)
function veTxPalavraAtiva(l, t) {
    const P = veTxLegTempos(l);
    let k = 0;
    P.forEach((p, i) => { if (p[0] <= t + 1e-3) k = i; });
    return k;
}
// Retângulo de cada palavra no quadro, na ordem do texto (a exportação recebe estes números: _gerar_ass)
function veTxPalavrasCaixas(L, e) {
    const m = VE_LEG_MEDIDA, pad = L.em * Math.max(0, +e.dPad || 0) / 100, out = [];
    m.font = L.fonte;
    L.linhas.forEach((ln, k) => {
        const x0 = L.cx - L.larg[k] / 2, re = /\S+/g;
        let mm;
        while ((mm = re.exec(ln))) {
            const x = x0 + m.measureText(ln.slice(0, mm.index)).width, w = m.measureText(mm[0]).width;
            out.push({ x: x - pad, y: L.topo + k * L.alt - L.folga * 0.5, w: w + pad * 2, h: L.alt + L.folga,
                       tx: x, base: L.topo + k * L.alt + L.em * L.asc, txt: mm[0] });
        }
    });
    return out;
}
const veTxRaioDestaque = (b, e) => Math.min(b.w, b.h) / 2 * Math.max(0, Math.min(100, +e.dRaio || 0)) / 100;

// Desenha a legenda da agulha no monitor (coordenadas do quadro; mesma conta do .ass da exportação)
function veTxDesenhar(ctx) {
    const i = veTxLegendaEm(VE.playhead);
    if (i < 0) return;
    const e = veTxEstiloLegenda(i), L = veTxLegLayout(VE.legendas[i].texto, e);
    if (!L.linhas.length) return;
    const { cx, em, alt, linhas, topo } = L;
    ctx.save();
    veTxEntrada(ctx, e, L, VE.playhead - VE.legendas[i].st, i);
    if (e.sOn) {
        ctx.save();
        ctx.globalAlpha *= e.sOp / 100;
        if (e.fundo === 'caixa') {
            // com caixa, a sombra é da caixa (sem desfoque, como o libass faz)
            ctx.fillStyle = e.sCor;
            veTxCaixa(ctx, L, e, e.sDist * Math.SQRT1_2);
        } else ctx.drawImage(veTxSombraQuadro(L, e), 0, 0);
        ctx.restore();
    }
    ctx.font = L.fonte;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if (e.fundo === 'caixa') {
        ctx.fillStyle = veTxRgba(e.caixaCor, e.caixaOp);
        veTxCaixa(ctx, L, e);
    }
    const dest = e.dOn ? veTxPalavrasCaixas(L, e)[veTxPalavraAtiva(VE.legendas[i], VE.playhead)] : null;
    if (dest) {
        ctx.fillStyle = veTxRgba(e.dCor, e.dOp);
        ctx.beginPath();
        ctx.roundRect(dest.x, dest.y, dest.w, dest.h, veTxRaioDestaque(dest, e));
        ctx.fill();
    }
    linhas.forEach((l, k) => {
        const base = topo + k * alt + em * L.asc;
        if (e.fundo === 'sombra') {
            if (!e.sOn) {   // a sombra fixa do "Contorno e sombra" dá lugar à sombra projetada quando ela está ligada
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillText(l, cx + em * 0.07, base + em * 0.07);
            }
            if (+e.cLarg > 0) {
                ctx.lineWidth = em * e.cLarg / 100;
                ctx.lineJoin = 'round';
                ctx.strokeStyle = e.cCor;
                ctx.strokeText(l, cx, base);
            }
        }
        ctx.fillStyle = e.cor;
        ctx.fillText(l, cx, base);
    });
    if (dest && e.dTxt && e.dTxt !== e.cor) {   // a palavra destacada na cor dela
        ctx.textAlign = 'left';
        ctx.fillStyle = e.dTxt;
        ctx.fillText(dest.txt, dest.tx, dest.base);
    }
    ctx.restore();
}

// ─────────────────────────── editar a legenda no monitor (duplo clique) ───────────────────────────
// Legenda da agulha sob o ponto (coordenadas do quadro), ou -1
function veTxLegendaNoPonto(pt) {
    const i = veTxLegendaEm(VE.playhead);
    if (i < 0) return -1;
    const L = veTxLegLayout(VE.legendas[i].texto, veTxEstiloLegenda(i)), f = L.folga * 2;
    const dentro = pt.x >= L.cx - L.wMax / 2 - f && pt.x <= L.cx + L.wMax / 2 + f && pt.y >= L.topo - f && pt.y <= L.topo + L.bloco + f;
    return dentro ? i : -1;
}

// Caixa de texto transparente por cima da legenda: o monitor mostra o resultado a cada tecla
function veTxLegEditar(i) {
    veTxLegEditarFim();
    if (VE.playing) veStop();
    const scr = $ve('ve-screen'), ta = scr.ownerDocument.createElement('textarea');
    ta.className = 've-tx-edit ve-leg-edit';
    ta.spellcheck = false;
    ta.value = VE.legendas[i].texto;
    scr.appendChild(ta);
    VETX.editando = i;
    VETX.legSel = i;
    VE.sel = -1;
    VETX.edit = { i, ta, hist: false };
    veTxLegEditarPos();
    ta.focus();
    ta.select();
    ta.addEventListener('input', () => {
        const ed = VETX.edit;
        if (!ed) return;
        if (!ed.hist) { vePushHistory(); ed.hist = true; }
        VE.legendas[ed.i] = { ...VE.legendas[ed.i], texto: ta.value };
        veTxLegEditarPos();
        veDrawMonitorSoon();
        veDraw();
        vePpRender();
    });
    ta.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); veTxLegEditarFim(); }
    });
    ta.addEventListener('pointerdown', e => e.stopPropagation());
    ta.addEventListener('blur', () => setTimeout(() => { if (VETX.edit && VETX.edit.ta === ta) veTxLegEditarFim(); }, 0));
    veRefresh();
}

function veTxLegEditarPos() {
    const ed = VETX.edit;
    if (!ed) return;
    const e = veTxEstiloLegenda(ed.i), L = veTxLegLayout(VE.legendas[ed.i].texto || ' ', e);
    const q = veTxQuadroTela(), rs = $ve('ve-screen').getBoundingClientRect(), s = ed.ta.style;
    const w = Math.max(L.wMax, L.em * 3) + L.folga * 2, linhas = Math.max(1, String(VE.legendas[ed.i].texto).split('\n').length);
    const topo = e.pos === 'baixo' ? L.topo + L.bloco - linhas * L.alt : e.pos === 'meio' ? L.topo + (L.bloco - linhas * L.alt) / 2 : L.topo;
    s.left = (q.x0 - rs.left + (L.cx - w / 2) * q.s) + 'px';
    s.top = (q.y0 - rs.top + topo * q.s) + 'px';
    s.width = (w * q.s) + 'px';
    s.height = (linhas * L.alt * q.s) + 'px';
    s.font = L.fonte.replace(/[\d.]+px/, (L.em * q.s) + 'px');
    s.lineHeight = (L.alt * q.s) + 'px';
    s.textAlign = 'center';
    s.textTransform = e.maiusc ? 'uppercase' : 'none';
    s.padding = '0';
    s.transform = 'none';
}

function veTxLegEditarFim() {
    const ed = VETX.edit;
    if (!ed) return;
    VETX.edit = null;
    VETX.editando = -1;
    ed.ta.remove();
    // legenda apagada por inteiro sai da trilha
    if (!String(VE.legendas[ed.i] && VE.legendas[ed.i].texto || '').trim()) { VE.legendas.splice(ed.i, 1); VETX.legSel = -1; }
    veRefresh();
}

// Exportar em SRT, VTT, ASS, SSA, SBV ou TXT (Functions/legendas_formatos.py)
// origem 'leg' = as legendas da trilha LEG; 'trans' = a transcrição, um trecho por parágrafo
const VE_TX_FORMATOS = [['srt', 'SRT (SubRip)'], ['vtt', 'VTT (WebVTT)'], ['ass', 'ASS (Advanced SubStation)'],
    ['ssa', 'SSA (SubStation)'], ['sbv', 'SBV (YouTube)'], ['txt', 'TXT (texto com tempos)']];
const veTxOpcoesFormato = () => VE_TX_FORMATOS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');

function veTxItensTranscricao() {
    const W = VETX.palavras;
    return veTxParagrafos().map(p => ({ st: W[p.i0][0], en: W[p.i1][1], texto: W.slice(p.i0, p.i1 + 1).map(w => w[2]).join(' ') }));
}

function veTxExportar(origem) {
    const itens = origem === 'trans' ? veTxItensTranscricao() : (VE.legendas || []);
    if (!itens.length) { veToast(origem === 'trans' ? 'Transcreva a sequência primeiro' : 'Crie as legendas primeiro'); return; }
    const sel = $ve(origem === 'trans' ? 've-tx-fmt-trans' : 've-tx-fmt-leg'), formato = (sel && sel.value) || 'srt';
    const base = (VE.path || 'legendas').split(/[\\/]/).pop().replace(/\.[^.]+$/, '') + (origem === 'trans' ? ' - transcricao' : '');
    const pasta = (VE.path || '').replace(/[\\/][^\\/]*$/, '');
    window.pywebview.api.ve_salvar_legenda(itens, formato, base, pasta).then(r => {
        if (r && r.success) veToast((origem === 'trans' ? 'Transcrição salva: ' : 'Legendas salvas: ') + r.name);
        else if (r && r.error) veToast('Não foi possível salvar: ' + r.error);
    });
}

// Para a exportação: legendas gravadas no vídeo (se ligado)
// faixa {a, b}: exportando só o trecho In→Out, as legendas vão recortadas e trazidas para o zero
function veTxExport(faixa) {
    if (VE.legGravar === false || !(VE.legendas || []).length) return null;
    const base = veTxEstilo();
    let itens = !faixa ? VE.legendas.map((l, i) => ({ l, i })) : VE.legendas
        .map((l, i) => ({ l, i }))
        .filter(x => x.l.st < faixa.b && x.l.en > faixa.a)
        .map(x => ({ ...x, l: { ...x.l, st: Math.max(x.l.st, faixa.a) - faixa.a, en: Math.min(x.l.en, faixa.b) - faixa.a } }));
    itens = itens.map(({ l, i }) => {
        const e = veTxEstiloLegenda(i);
        const item = { ...l, estilo: { ...e, razao: veTxMetricas(e).razao } };
        const fator = veTxLegLayout(l.texto, e).fator;
        if (fator < 1) item.estilo.tam = e.tam * fator;   // encolhida para caber na tela (veTxLegLayout)
        if (e.fundo === 'caixa' && (+e.caixaRaio > 0 || e.dOn)) item.larg = veTxLegLayout(l.texto, e).larg.map(w => Math.round(w * 10) / 10);
        if (e.dOn) {
            const r1 = v => Math.round(v * 10) / 10, desloc = faixa ? faixa.a : 0, T = veTxLegTempos(VE.legendas[i]);
            item.pal = veTxPalavrasCaixas(veTxLegLayout(l.texto, e), e).map((b, j) => ({
                a: +Math.max(0, (T[j] ? T[j][0] : l.st) - desloc).toFixed(3), x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h), r: r1(veTxRaioDestaque(b, e)) }));
        }
        delete item.pt;
        return item;
    });
    return itens.length ? { itens, estilo: { ...base, razao: veTxMetricas(base).razao } } : null;
}

// ─────────────────────────── painel ───────────────────────────
function veTxConstruir() {
    const box = $ve('ve-tx');
    if (!box) return;
    box.innerHTML = `
        <div class="ve-tx-abas">
            <button data-txa="trans">Transcrição</button><button data-txa="leg">Legendas</button>
        </div>
        <div class="ve-tx-corpo" data-txc="trans">
            <div class="ve-tx-vazio" id="ve-tx-vazio">
                <b>Transcrever sequência</b>
                <p>Transforma a fala da timeline em texto, com o tempo de cada palavra. Roda neste computador, sem internet (depois do primeiro uso).</p>
                <label class="ve-tx-campo">Idioma da fala
                    <select id="ve-tx-idioma">
                        <option value="pt">Português (Brasil)</option>
                        <option value="en">Inglês</option>
                        <option value="multi">Outras línguas europeias</option>
                    </select>
                </label>
                <button class="ve-btn ve-btn-primary" data-txacao="transcrever">Transcrever</button>
                <small id="ve-tx-modelo"></small>
            </div>
            <div class="ve-tx-rodando" id="ve-tx-rodando" hidden>
                <div class="ve-tx-prog"><i id="ve-tx-prog-fill"></i></div>
                <span id="ve-tx-prog-msg"></span>
                <button class="ve-btn ve-btn-sm ve-btn-ghost" data-txacao="cancelar">Cancelar</button>
            </div>
            <div class="ve-tx-pronto" id="ve-tx-pronto" hidden>
                <div class="ve-tx-barra">
                    <div class="ve-tx-busca"><svg class="i"><use href="#i-search"/></svg><input id="ve-tx-busca" placeholder="Buscar na transcrição" autocomplete="off"><span id="ve-tx-busca-n"></span></div>
                    <button class="ve-btn ve-btn-sm ve-btn-ghost" data-txacao="refazer" title="Transcrever de novo">↻</button>
                </div>
                <div class="ve-tx-aviso" id="ve-tx-aviso" hidden>A timeline mudou depois da transcrição. <button data-txacao="refazer">Transcrever de novo</button></div>
                <div class="ve-tx-texto" id="ve-tx-texto"></div>
                <div class="ve-tx-dica">Clique numa palavra para ir até ela · duplo clique corrige a palavra</div>
                <div class="ve-tx-exp"><select id="ve-tx-fmt-trans" title="Formato do arquivo">${veTxOpcoesFormato()}</select><button class="ve-btn ve-btn-sm" data-txacao="exp-trans">Exportar transcrição</button></div>
            </div>
        </div>
        <div class="ve-tx-corpo" data-txc="leg" hidden>
            <div class="ve-tx-sec">
                <b>Criar legendas</b>
                <div class="ve-tx-grade">
                    <label>Máx. caracteres por linha<input type="number" id="ve-leg-max" min="7" max="72" step="1"></label>
                    <label>Linhas<select id="ve-leg-linhas"><option value="1">Uma</option><option value="2">Duas</option></select></label>
                    <label>Duração mínima (s)<input type="number" id="ve-leg-min" min="0.5" max="6" step="0.1"></label>
                    <label>Intervalo (quadros)<input type="number" id="ve-leg-gap" min="0" max="10" step="1"></label>
                </div>
                <button class="ve-btn ve-btn-primary" data-txacao="criar">Criar legendas a partir da transcrição</button>
            </div>
            <div class="ve-tx-sec">
                <b>Estilo</b>
                <p class="ve-tx-nota">Fonte, tamanho, cor, fundo e posição das legendas ficam no painel Propriedades (selecione uma legenda).</p>
                <button class="ve-btn ve-btn-sm" data-txacao="estilo">Editar estilo em Propriedades</button>
            </div>
            <div class="ve-tx-sec ve-tx-saida">
                <label class="ve-tx-chk"><input type="checkbox" id="ve-leg-gravar"> Gravar as legendas no vídeo ao exportar</label>
                <div class="ve-tx-exp"><select id="ve-tx-fmt-leg" title="Formato do arquivo">${veTxOpcoesFormato()}</select><button class="ve-btn ve-btn-sm" data-txacao="exp-leg">Exportar legendas</button></div>
            </div>
            <div class="ve-tx-lista" id="ve-leg-lista"></div>
        </div>`;
    VETX.construido = true;
}

function veTxRender() {
    const box = $ve('ve-tx');
    if (!box) return;
    if (!box.firstChild) veTxConstruir();
    box.querySelectorAll('[data-txa]').forEach(b => b.classList.toggle('on', b.dataset.txa === VETX.aba));
    box.querySelectorAll('[data-txc]').forEach(c => { c.hidden = c.dataset.txc !== VETX.aba; });
    const tem = VETX.palavras.length > 0;
    $ve('ve-tx-vazio').hidden = VETX.rodando || tem;
    $ve('ve-tx-rodando').hidden = !VETX.rodando;
    $ve('ve-tx-pronto').hidden = VETX.rodando || !tem;
    $ve('ve-tx-idioma').value = VETX.idioma;
    if (VETX.modelos) {
        const k = VETX.idioma === 'pt' ? 'pt' : 'multi', m = VETX.modelos[k];
        $ve('ve-tx-modelo').textContent = m && !m.pronto ? `Na primeira vez baixa o modelo de ${m.nome} (${m.baixar_mb >= 1000 ? (m.baixar_mb / 1024).toFixed(1).replace('.', ',') + ' GB' : m.baixar_mb + ' MB'}; fica com ${m.mb} MB).` : '';
    }
    if (tem && !VETX.construidoTexto) veTxRenderTexto();
    $ve('ve-tx-aviso').hidden = !tem || VETX.rodando || !VE.ready || VETX.chave === veTxMixChave();
    veTxRenderLeg();
}

function veTxRenderTexto() {
    const W = VETX.palavras;
    $ve('ve-tx-texto').innerHTML = veTxParagrafos().map(p => `
        <p><span class="ve-tx-tc" data-ir="${p.i0}">${veTxTempo(W[p.i0][0])}</span>${
            W.slice(p.i0, p.i1 + 1).map((w, k) => `<span class="ve-tx-w" data-w="${p.i0 + k}">${veTxEsc(w[2])}</span>`).join(' ')}</p>`).join('');
    VETX.construidoTexto = true;
    VETX.ativa = -1;
    if (VETX.busca) veTxBuscar(VETX.busca);
}

function veTxRenderLeg() {
    if (!$ve('ve-leg-lista')) return;
    const o = VETX.opcoes, e = veTxEstilo();
    const set = (id, v) => { const el = $ve(id); if (el && el.ownerDocument.activeElement !== el) el.value = v; };
    set('ve-leg-max', o.max); set('ve-leg-linhas', o.linhas); set('ve-leg-min', o.minDur); set('ve-leg-gap', o.gap);
    $ve('ve-tx').querySelectorAll('[data-est]').forEach(el => {
        const k = el.dataset.est;
        if (el.type === 'checkbox') el.checked = !!e[k]; else if (el.ownerDocument.activeElement !== el) el.value = e[k];
    });
    $ve('ve-leg-gravar').checked = VE.legGravar !== false;
    const L = VE.legendas || [], lista = $ve('ve-leg-lista');
    const chave = JSON.stringify(L) + VETX.legSel;
    if (lista._chave === chave) return;
    lista._chave = chave;
    lista.innerHTML = !L.length ? `<div class="ve-clips-empty">${VETX.palavras.length ? 'Clique em "Criar legendas" para gerar a partir da transcrição.' : 'Primeiro transcreva a sequência na aba Transcrição.'}</div>`
        : L.map((c, i) => `
        <div class="ve-leg${i === VETX.legSel ? ' sel' : ''}" data-leg="${i}">
            <div class="ve-leg-cab"><button data-legacao="ir" title="Ir para a legenda">${veTxTempo(c.st)} → ${veTxTempo(c.en)}</button><button data-legacao="del" title="Apagar legenda">✕</button></div>
            <textarea rows="${Math.min(3, c.texto.split('\n').length)}" data-legtxt="${i}">${veTxEsc(c.texto)}</textarea>
        </div>`).join('');
}

function veTxInit() {
    const box = $ve('ve-tx');
    if (!box) return;
    veTxConstruir();
    box.addEventListener('click', e => {
        const aba = e.target.closest('[data-txa]');
        if (aba) { VETX.aba = aba.dataset.txa; veTxRender(); return; }
        const ac = e.target.closest('[data-txacao]');
        if (ac) {
            const a = ac.dataset.txacao;
            if (a === 'transcrever' || a === 'refazer') veTxTranscrever();
            else if (a === 'cancelar') veTxCancelar();
            else if (a === 'criar') { if (!(VE.legendas || []).length || veConfirmarTroca()) veTxCriarLegendas(); }
            else if (a === 'exp-leg') veTxExportar('leg');
            else if (a === 'exp-trans') veTxExportar('trans');
            else if (a === 'estilo') {
                if (!(VE.legendas || []).length) { veToast('Crie as legendas primeiro'); return; }
                if (VETX.legSel < 0) VETX.legSel = Math.max(0, veTxLegendaEm(VE.playhead));
                VE.sel = -1;
                vedShow('pp');
                veRefresh();
            }
            return;
        }
        const w = e.target.closest('[data-w]'), ir = e.target.closest('[data-ir]');
        if ((w || ir) && e.detail < 2) { veSeek(VETX.palavras[+(w || ir).dataset[w ? 'w' : 'ir']][0]); return; }
        const lg = e.target.closest('[data-legacao]');
        if (lg) {
            const i = +lg.closest('[data-leg]').dataset.leg;
            if (lg.dataset.legacao === 'ir') { VETX.legSel = i; VE.sel = -1; veSeek(VE.legendas[i].st); veRefresh(); }
            else { vePushHistory(); VE.legendas = VE.legendas.filter((_, k) => k !== i); VETX.legSel = -1; veRefresh(); }
        }
    });
    // duplo clique numa palavra: corrige (como editar a transcrição no Premiere)
    box.addEventListener('dblclick', e => {
        const w = e.target.closest('[data-w]');
        if (!w) return;
        w.contentEditable = 'true';
        w.focus();
        const sel = w.ownerDocument.getSelection(), r = w.ownerDocument.createRange();
        r.selectNodeContents(w); sel.removeAllRanges(); sel.addRange(r);
        const fim = () => {
            w.contentEditable = 'false';
            const txt = w.textContent.trim(), i = +w.dataset.w;
            if (txt && txt !== VETX.palavras[i][2]) { VETX.palavras[i][2] = txt; veMarcarAlterado(); }
            w.textContent = VETX.palavras[i][2];
        };
        w.addEventListener('blur', fim, { once: true });
    });
    box.addEventListener('keydown', e => {
        if (e.target.isContentEditable && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
        if (e.target.id === 've-tx-busca' && e.key === 'Enter') veTxProximoAchado(e.shiftKey ? -1 : 1);
        if (e.target.matches('input, textarea, select') || e.target.isContentEditable) e.stopPropagation();
    });
    box.addEventListener('input', e => {
        if (e.target.id === 've-tx-busca') { veTxBuscar(e.target.value); return; }
        const i = e.target.dataset.legtxt;
        if (i != null) {
            if (!VETX._editando) { vePushHistory(); VETX._editando = true; }
            VE.legendas[+i] = { ...VE.legendas[+i], texto: e.target.value };
            $ve('ve-leg-lista')._chave = JSON.stringify(VE.legendas) + VETX.legSel;   // não recria a lista enquanto digita
            veDrawMonitor(); veDraw();
            return;
        }
        const k = e.target.dataset.est;
        if (k) {
            VE.legEstilo = { ...veTxEstilo(), [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value };
            veMarcarAlterado();
            veDrawMonitorSoon();
        }
    });
    box.addEventListener('change', e => {
        VETX._editando = false;
        if (e.target.id === 've-leg-gravar') { VE.legGravar = e.target.checked; veMarcarAlterado(); }
        if (e.target.dataset.est) veTxRenderLeg();
        if (e.target.id === 've-tx-idioma') { VETX.idioma = e.target.value; veTxRender(); }
    });
    box.addEventListener('focusin', e => {
        const i = e.target.dataset && e.target.dataset.legtxt;
        if (i != null) { VETX.legSel = +i; VE.sel = -1; veSeek(VE.legendas[+i].st); veDraw(); vePpRender(); }
    });
    if (window.pywebview && window.pywebview.api && window.pywebview.api.ve_texto_modelos) {
        window.pywebview.api.ve_texto_modelos().then(m => { VETX.modelos = m; veTxRender(); });
    } else {
        window.addEventListener('pywebviewready', () => window.pywebview.api.ve_texto_modelos().then(m => { VETX.modelos = m; veTxRender(); }), { once: true });
    }
    veTxRender();
}

function veConfirmarTroca() {
    if (VETX._trocaAt && Date.now() - VETX._trocaAt < 5000) { VETX._trocaAt = 0; return true; }
    VETX._trocaAt = Date.now();
    veToast('Isso substitui as legendas atuais. Clique de novo para confirmar (dá para desfazer com Ctrl+Z).');
    return false;
}

// Abrir outro vídeo: começa sem transcrição
function veTxReset() {
    VETX.palavras = [];
    VETX.chave = '';
    VETX.legSel = -1;
    VETX.construidoTexto = false;
    VETX.busca = '';
    const b = $ve('ve-tx-busca');
    if (b) b.value = '';
    veTxRender();
}

document.addEventListener('DOMContentLoaded', veTxInit);
