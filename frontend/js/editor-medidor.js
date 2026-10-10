// =========================================================
// Pocket Editor — Medidores de áudio (Audio Meters do Premiere)
// Pico de L e R do que está SAINDO na caixa de som (a soma de todas as trilhas, depois de ganho, efeitos e Hard
// Limiter): o processador de áudio mede o pico de cada ~10 ms (editor-audio.js) e o medidor mostra cada medida no
// instante em que ela é ouvida (descontada a latência da placa). Escala em dBFS de −60 a 0; verde até −12, amarelo
// até −3, vermelho acima. A marca fina é o maior pico recente (fica 1,5 s). A luz no topo acende quando o som chega
// a 0 dBFS (estourou: a placa corta a onda) e fica acesa até um clique no medidor — como no Premiere.
// =========================================================

const VE_MED_MIN = -60;
const VE_MED_QUEDA = 26;       // dB/s que a barra cai depois do pico
const VE_MED_SEGURA = 1.5;     // s que a marca de pico fica parada
const VEMED = {
    fila: [], nivel: [VE_MED_MIN, VE_MED_MIN], pico: [VE_MED_MIN, VE_MED_MIN], picoT: [0, 0],
    clip: [false, false], raf: 0, t: 0, ligado: false,
    gr: [], reducao: 0,      // Hard Limiter do Master: [quadro de áudio, ganho] e a redução mostrada (dB, ≥ 0)
};

// Redução do limitador do Master num pedaço mixado (fim do pedaço em quadros de áudio escritos)
function veMedReducao(ate, g) {
    VEMED.gr.push([ate, g > 0 ? -20 * Math.log10(g) : 60]);
    if (VEMED.gr.length > 400) VEMED.gr.splice(0, 200);
    veMedAgendar();
}

const veMedDb = a => (a > 0 ? Math.max(VE_MED_MIN, 20 * Math.log10(a)) : VE_MED_MIN);

// Mensagem do processador de áudio: pico de L e R do bloco que acabou de ir para a placa (ct = relógio do áudio)
function veMedPico(ct, pl, pr) {
    if (!(pl > 0 || pr > 0) && !VEMED.fila.length && VEMED.nivel[0] <= VE_MED_MIN && VEMED.nivel[1] <= VE_MED_MIN) return;
    VEMED.fila.push([ct, pl || 0, pr || 0]);
    if (VEMED.fila.length > 600) VEMED.fila.splice(0, 300);
    veMedAgendar();
}

function veMedZerar() {
    VEMED.fila.length = 0;
    VEMED.clip = [false, false];
    VEMED.pico = [VE_MED_MIN, VE_MED_MIN];
    veMedDesenhar();
}

function veMedAgendar() {
    const cv = $ve('ve-med-cv');
    if (!cv || VEMED.raf) return;
    VEMED.raf = veRaf(cv, veMedQuadro);
}

function veMedQuadro() {
    VEMED.raf = 0;
    const agora = performance.now() / 1000, dt = Math.min(0.1, Math.max(0, agora - (VEMED.t || agora)));
    VEMED.t = agora;
    // o que já está sendo ouvido: medido em ct, sai na caixa de som ct + latência depois
    const ctx = typeof VEAU !== 'undefined' && VEAU.ctx;
    const ouvido = ctx ? ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0) : Infinity;
    const novo = [0, 0];
    let n = 0;
    while (n < VEMED.fila.length && VEMED.fila[n][0] <= ouvido) {
        const [, l, r] = VEMED.fila[n++];
        if (l > novo[0]) novo[0] = l;
        if (r > novo[1]) novo[1] = r;
    }
    if (n) VEMED.fila.splice(0, n);
    // redução do Master já ouvida (pedaços que a placa já tocou)
    let red = 0, k = 0;
    const lidos = typeof VEAU !== 'undefined' ? VEAU.lidos : 0;
    while (k < VEMED.gr.length && VEMED.gr[k][0] <= lidos + VE_AU_CHUNK) red = Math.max(red, VEMED.gr[k++][1]);
    if (k) VEMED.gr.splice(0, k);
    VEMED.reducao = Math.max(red, VEMED.reducao - VE_MED_QUEDA * dt);
    if (!veMasterLim()) VEMED.reducao = 0;
    for (let c = 0; c < 2; c++) {
        const db = veMedDb(novo[c]);
        if (novo[c] >= 1) VEMED.clip[c] = true;   // chegou a 0 dBFS: estouro
        VEMED.nivel[c] = Math.max(db, VEMED.nivel[c] - VE_MED_QUEDA * dt);
        if (db >= VEMED.pico[c]) { VEMED.pico[c] = db; VEMED.picoT[c] = agora; }
        else if (agora - VEMED.picoT[c] > VE_MED_SEGURA) VEMED.pico[c] = Math.max(VE_MED_MIN, VEMED.pico[c] - VE_MED_QUEDA * dt);
    }
    veMedDesenhar();
    const ativo = VEMED.fila.length || VEMED.gr.length || VEMED.reducao > 0.01 || VEMED.nivel.some(x => x > VE_MED_MIN) || VEMED.pico.some(x => x > VE_MED_MIN);
    if (ativo) veMedAgendar();
    else VEMED.t = 0;
}

function veMedDesenhar() {
    const cv = $ve('ve-med-cv');
    const tm = veTam(cv, veMedAgendar);   // sem ler clientWidth/offsetParent a cada quadro (refazia o layout: 18% do play)
    if (!cv || !tm.w || !tm.h) return;
    const dpr = (cv.ownerDocument.defaultView || window).devicePixelRatio || 1;
    const W = Math.max(1, Math.round(tm.w * dpr)), H = Math.max(1, Math.round(tm.h * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const x = cv.getContext('2d');
    const w = W / dpr, h = H / dpr, desenha = w >= h * 1.4 ? veMedHorizontal : veMedVertical;
    // fundo (escala, números, L/R, trilhos) só muda com o tamanho: desenhado uma vez numa imagem guardada; a cada
    // quadro só cola a imagem e desenha as barras (antes ~20 textos + gradiente novo por quadro: 10% do play)
    const chave = `${W}x${H}:${dpr}:${desenha.name}:${veMasterLim() ? 1 : 0}`;
    if (VEMED.fundoChave !== chave || VEMED.fundoX !== x) {
        const f = cv.ownerDocument.createElement('canvas');
        f.width = W; f.height = H;
        const fx = f.getContext('2d');
        fx.setTransform(dpr, 0, 0, dpr, 0, 0);
        desenha(fx, w, h, true);
        VEMED.fundo = f; VEMED.fundoChave = chave; VEMED.fundoX = x; VEMED.grad = null;
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, W, H);
    x.drawImage(VEMED.fundo, 0, 0);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    desenha(x, w, h, false);
}

// cor da barra: verde até −12, amarelo até −3, vermelho acima
function veMedGradiente(x, x0, y0, x1, y1) {
    const g = x.createLinearGradient(x0, y0, x1, y1), f = db => (db - VE_MED_MIN) / -VE_MED_MIN;
    g.addColorStop(0, '#16a34a');
    g.addColorStop(f(-12), '#22c55e');
    g.addColorStop(f(-12) + 0.001, '#eab308');
    g.addColorStop(f(-3), '#facc15');
    g.addColorStop(f(-3) + 0.001, '#ef4444');
    g.addColorStop(1, '#dc2626');
    return g;
}

// fundo = true: só a parte fixa (vai para a imagem guardada); false: só o que se mexe (barras, picos, luzes)
function veMedVertical(x, w, h, fundo) {
    const topo = 14, base = 14, esc = w >= 44 ? 22 : 0;
    const hb = Math.max(10, h - topo - base), largura = Math.max(4, Math.min(14, (w - esc - 8) / 2));
    const x0 = esc + Math.max(2, (w - esc - largura * 2 - 3) / 2), xs = [x0, x0 + largura + 3];
    const yDe = db => topo + hb * (1 - (db - VE_MED_MIN) / -VE_MED_MIN);
    if (!fundo) {
        const grad = VEMED.grad || (VEMED.grad = veMedGradiente(x, 0, topo + hb, 0, topo));
        for (let c = 0; c < 2; c++) {
            const xb = xs[c], y = yDe(VEMED.nivel[c]);
            if (VEMED.nivel[c] > VE_MED_MIN) { x.fillStyle = grad; x.fillRect(xb, y, largura, topo + hb - y); }
            if (VEMED.pico[c] > VE_MED_MIN) {
                x.fillStyle = VEMED.pico[c] > -3 ? '#f87171' : VEMED.pico[c] > -12 ? '#fde047' : '#86efac';
                x.fillRect(xb, Math.round(yDe(VEMED.pico[c])), largura, 2);
            }
            // luz de estouro (apagada fica no fundo)
            if (VEMED.clip[c]) { x.fillStyle = '#ef4444'; x.shadowColor = '#ef4444'; x.shadowBlur = 8; x.fillRect(xb, 2, largura, 8); x.shadowBlur = 0; }
        }
        // Hard Limiter no Master: barra laranja de cima para baixo = quanto ele está abaixando agora
        if (veMasterLim() && VEMED.reducao > 0.05) {
            const xg = xs[1] + largura + 3, lg = Math.max(3, Math.min(6, largura / 2));
            x.fillStyle = '#D4814A';
            x.fillRect(xg, topo, lg, Math.min(hb, hb * VEMED.reducao / -VE_MED_MIN));
        }
        return;
    }
    x.font = '9px ui-monospace, Consolas, monospace';
    x.textBaseline = 'middle';
    // escala
    const passoDb = hb > 260 ? 3 : hb > 140 ? 6 : 12;
    for (let db = 0; db >= VE_MED_MIN; db -= passoDb) {
        const y = Math.round(yDe(db)) + 0.5;
        x.fillStyle = 'rgba(255,255,255,.10)';
        x.fillRect(xs[0] - 2, y, largura * 2 + 7, 1);
        if (esc && (db % (passoDb * 2) === 0 || hb > 200)) {
            x.fillStyle = 'rgba(255,255,255,.45)';
            x.textAlign = 'right';
            x.fillText(String(db), esc - 3, y);
        }
    }
    for (let c = 0; c < 2; c++) {
        const xb = xs[c];
        x.fillStyle = '#0d0d0f';
        x.fillRect(xb, topo, largura, hb);
        x.fillStyle = '#2a1414';   // luz de estouro apagada
        x.fillRect(xb, 2, largura, 8);
        x.fillStyle = 'rgba(255,255,255,.55)';
        x.textAlign = 'center';
        x.fillText(c ? 'R' : 'L', xb + largura / 2, h - base / 2);
    }
    if (esc) {
        x.fillStyle = 'rgba(255,255,255,.35)';
        x.textAlign = 'right';
        x.fillText('dB', esc - 3, h - base / 2);
    }
    if (veMasterLim()) {   // trilho da barra do Hard Limiter
        x.fillStyle = '#1c130a';
        x.fillRect(xs[1] + largura + 3, topo, Math.max(3, Math.min(6, largura / 2)), hb);
    }
}

function veMedHorizontal(x, w, h, fundo) {
    const esq = 14, dir = 14, esc = h >= 40 ? 12 : 0;
    const wb = Math.max(10, w - esq - dir), altura = Math.max(4, Math.min(12, (h - esc - 6) / 2));
    const ys = [2, 2 + altura + 3];
    const xDe = db => esq + wb * ((db - VE_MED_MIN) / -VE_MED_MIN);
    if (!fundo) {
        const grad = VEMED.grad || (VEMED.grad = veMedGradiente(x, esq, 0, esq + wb, 0));
        for (let c = 0; c < 2; c++) {
            const yb = ys[c], xx = xDe(VEMED.nivel[c]);
            if (VEMED.nivel[c] > VE_MED_MIN) { x.fillStyle = grad; x.fillRect(esq, yb, xx - esq, altura); }
            if (VEMED.pico[c] > VE_MED_MIN) {
                x.fillStyle = VEMED.pico[c] > -3 ? '#f87171' : VEMED.pico[c] > -12 ? '#fde047' : '#86efac';
                x.fillRect(Math.round(xDe(VEMED.pico[c])) - 1, yb, 2, altura);
            }
            if (VEMED.clip[c]) { x.fillStyle = '#ef4444'; x.fillRect(w - dir + 3, yb, 8, altura); }
        }
        return;
    }
    x.font = '9px ui-monospace, Consolas, monospace';
    x.textBaseline = 'middle';
    const passoDb = wb > 500 ? 3 : wb > 260 ? 6 : 12;
    for (let db = 0; db >= VE_MED_MIN; db -= passoDb) {
        const xx = Math.round(xDe(db)) + 0.5;
        x.fillStyle = 'rgba(255,255,255,.10)';
        x.fillRect(xx, ys[0], 1, altura * 2 + 3);
        if (esc) { x.fillStyle = 'rgba(255,255,255,.45)'; x.textAlign = 'center'; x.fillText(String(db), xx, ys[1] + altura + esc / 2 + 2); }
    }
    for (let c = 0; c < 2; c++) {
        const yb = ys[c];
        x.fillStyle = '#0d0d0f';
        x.fillRect(esq, yb, wb, altura);
        x.fillStyle = '#2a1414';   // luz de estouro apagada
        x.fillRect(w - dir + 3, yb, 8, altura);
        x.fillStyle = 'rgba(255,255,255,.55)';
        x.textAlign = 'center';
        x.fillText(c ? 'R' : 'L', esq / 2, yb + altura / 2);
    }
}

function veInitMedidor() {
    const cv = $ve('ve-med-cv');
    if (!cv || VEMED.ligado) return;
    VEMED.ligado = true;
    cv.addEventListener('click', veMedZerar);
    const b = $ve('ve-med-master');
    if (b) b.addEventListener('click', veAbrirMaster);
    veMedMasterUi();
    veMedDesenhar();
}

// Botão LIM do painel: aceso com o Hard Limiter do Master ligado
function veMedMasterUi() {
    const b = $ve('ve-med-master');
    if (!b) return;
    const v = veMasterLim();
    b.classList.toggle('on', !!v);
    b.title = v ? `${veT('Hard Limiter no Master')}: ${veFmtDb(v.ceil)} · ${veT('clique para ajustar')}`
        : veT('Hard Limiter no Master (a soma de todas as trilhas): clique para ligar');
    veMedAgendar();
}

// ── janela do Hard Limiter do Master ──
function veAbrirMaster() {
    if (!VE.ready) return;
    if (VE.playing) veStop();
    const f = VE.master && VE.master.lim;
    veLimMontar($ve('ve-mlim-on'), $ve('ve-mlim-campos'), f || null);
    $ve('ve-master').hidden = false;
}
function veFecharMaster() { $ve('ve-master').hidden = true; }
function veAplicarMaster() {
    const on = $ve('ve-mlim-on').checked, v = veLimLer($ve('ve-mlim-campos'));
    veFecharMaster();
    const antes = JSON.stringify(VE.master || null);
    VE.master = { ...(VE.master || {}), lim: { on, v } };
    if (JSON.stringify(VE.master) === antes) return;
    VE.dirty = true;
    veUpdateTitle();
    if (veMixAtivo()) veAudioEditou();
    veMedMasterUi();
    veToast(on ? `${veT('Hard Limiter no Master')}: ${veFmtDb(v.ceil)}` : veT('Hard Limiter do Master desligado'));
}
