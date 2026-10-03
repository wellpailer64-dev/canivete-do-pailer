// =========================================================
// Editor de Imagem — ferramentas (barra da esquerda) e a Transformação livre (Ctrl+T).
// Cada ferramenta: {nome, tecla, icone, cursor, down(p, ev, doc), move, up, hover, dbl, sobre(ctx, doc), opcoes()}.
// p = ponto em px do documento (p.sx/p.sy = na tela). Pintura: o traço inteiro vai num canvas de cobertura (o
// tamanho do documento) e a cada movimento a região mexida é refeita = pixels de antes + traço × opacidade (como o
// Photoshop: opacidade limita o traço, fluxo é por pincelada). Máscara selecionada = pinta em tons de cinza nela.
// =========================================================

// ─────────────────────────── ponta do pincel ───────────────────────────
// forma: redondo | quadrado | giz (borda com ruído); ang (graus) e red (redondeza %) achatam e giram a ponta
const iePontas = new Map();
function iePonta(tam, dureza, forma = 'redondo', ang = 0, red = 100) {
    tam = Math.max(1, Math.round(tam));
    ang = ((Math.round(ang / 5) * 5) % 180 + 180) % 180;
    red = ieClamp(Math.round(red / 5) * 5, 5, 100);
    const k = [tam, dureza, forma, ang, red].join('|');
    if (iePontas.has(k)) return iePontas.get(k);
    const lado = Math.ceil(forma === 'quadrado' ? tam * 1.42 : tam) + 2;
    const c = ieCanvas(lado, lado), x = ieCtx(c), r = tam / 2, m = lado / 2;
    x.translate(m, m);
    x.rotate(-ang * Math.PI / 180);
    x.scale(1, red / 100);
    x.translate(-m, -m);
    if (forma === 'quadrado') {
        x.fillStyle = '#fff';
        if (dureza < 100 && tam > 2) x.filter = `blur(${(1 - dureza / 100) * r / 3}px)`;
        x.fillRect(m - r * (dureza < 100 ? 0.85 : 1), m - r * (dureza < 100 ? 0.85 : 1), 2 * r * (dureza < 100 ? 0.85 : 1), 2 * r * (dureza < 100 ? 0.85 : 1));
    } else if (tam <= 2 || dureza >= 100) {
        x.fillStyle = '#fff';
        x.beginPath(); x.arc(m, m, r, 0, Math.PI * 2); x.fill();
    } else {
        const g = x.createRadialGradient(m, m, 0, m, m, r);
        const h = ieClamp(dureza / 100, 0, 0.99);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(h, 'rgba(255,255,255,1)');
        // queda suave (parecida com a do Photoshop)
        for (let i = 1; i <= 6; i++) {
            const t = i / 6;
            g.addColorStop(h + (1 - h) * t, `rgba(255,255,255,${Math.pow(1 - t, 2) * (1 - t * 0.2)})`);
        }
        x.fillStyle = g;
        x.fillRect(0, 0, c.width, c.height);
    }
    if (forma === 'giz' && tam > 3) {   // giz: textura de grãos (sempre a mesma para o mesmo tamanho)
        x.setTransform(1, 0, 0, 1, 0, 0);
        const ruido = ieCanvas(lado, lado), rx = ieCtx(ruido), img = rx.createImageData(lado, lado);
        let s = tam * 7919;
        for (let i = 0; i < img.data.length; i += 4) { s = (s * 16807) % 2147483647; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = s % 100 < 55 ? 255 : 40; }
        rx.putImageData(img, 0, 0);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(ruido, 0, 0);
    }
    if (iePontas.size > 120) iePontas.clear();
    iePontas.set(k, c);
    return c;
}

function ieModPinturaAlvo(doc, L) { return doc.mascaraAlvo && L && L.m ? 'm' : 'c'; }

// cinza (0..255) da cor para pintar em máscara
const ieCinza = hex => { const [r, g, b] = ieHexRgb(hex); return Math.round(IE_LUM(r, g, b)); };

// ─────────────────────────── traço (pincel, borracha, carimbo) ───────────────────────────
let IE_TRACO = null;
function ieTracoCanvas(doc) {
    if (!IE.tracoC || IE.tracoC.width !== doc.w || IE.tracoC.height !== doc.h) IE.tracoC = ieCanvas(doc.w, doc.h);
    const x = ieCtx(IE.tracoC);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, doc.w, doc.h);
    return IE.tracoC;
}

function ieChecarPintavel(L, acao) {
    const doc = IE.doc;
    if (!L) { ieToast(ieT('Selecione uma camada')); return false; }
    if (doc.mascaraAlvo && L.m) return true;
    if (L.tipo === 'pixel') {
        if (L.travas & 0x80000000 || L.travas & 2) { ieToast(ieT('Camada travada')); return false; }
        return true;
    }
    iePodePintar(L, acao).then(ok => { if (ok) ieToast(ieT('Camada rasterizada: pode pintar')); });
    return false;
}

function ieTracoIniciar(p, ev, doc, tipo) {
    const L = ieAtiva(doc);
    if (!ieChecarPintavel(L, 'pintar')) return;
    const alvo = ieModPinturaAlvo(doc, L);
    const op = IE.op[tipo];
    if (tipo === 'carimbo') {
        if (ev.altKey) { IE.carimboFonte = { x: p.x, y: p.y }; IE.carimboOff = null; ieToast(ieT('Origem do carimbo definida')); return; }
        if (!IE.carimboFonte) { ieToast(ieT('Alt+clique para escolher de onde copiar')); return; }
        if (!op.alinhado || !IE.carimboOff) IE.carimboOff = { x: IE.carimboFonte.x - p.x, y: IE.carimboFonte.y - p.y };
    }
    const o = ieGravavel(L, alvo);
    const fundo = alvo === 'm' ? (L.m.fundo || 0) : 0;
    const base = o.c ? { c: ieClonar(o.c), x: o.x, y: o.y } : null;
    let fonte = null;
    if (tipo === 'carimbo') fonte = op.todas ? ieClonar(doc.comp) : (() => {
        const c = ieCanvas(doc.w, doc.h);
        if (L.c) ieCtx(c).drawImage(L.c, L.x, L.y);
        return c;
    })();
    const corHex = tipo === 'borracha' ? IE.cor[1] : IE.cor[0];
    IE_TRACO = {
        L, alvo, tipo, op, base, fundo, fonte, traco: ieTracoCanvas(doc), sujo: null, ult: null, resto: 0,
        cor: corHex, cinza: alvo === 'm' ? ieCinza(corHex) : 0, Rantes: ieRCamada(L),
    };
    // Shift+clique: linha reta desde o último ponto
    if (ev.shiftKey && IE.ultimoPonto && IE.ultimoPonto.doc === doc.id) {
        IE_TRACO.ult = { x: IE.ultimoPonto.x, y: IE.ultimoPonto.y };
        ieTracoPara(p);
    } else ieTracoPara(p, true);
}

function ieTracoDab(t, x, y) {
    const o = t.op;
    // dinâmica da ponta (Configurações do pincel): variação de tamanho e ângulo, dispersão
    let tam = o.tam, ang = o.angulo || 0;
    if (o.varTam) tam *= 1 - Math.random() * o.varTam / 100;
    if (o.varAng) ang += (Math.random() * 2 - 1) * o.varAng / 100 * 180;
    if (o.dispersao) { const d = Math.random() * o.dispersao / 100 * o.tam, a = Math.random() * Math.PI * 2; x += Math.cos(a) * d; y += Math.sin(a) * d; }
    const ponta = iePonta(tam, o.dureza, o.forma || 'redondo', ang, o.redondeza ?? 100);
    const ctx = ieCtx(t.traco);
    const dx = x - ponta.width / 2, dy = y - ponta.height / 2;
    if (t.tipo === 'carimbo') {
        const d = ieCanvas(ponta.width, ponta.height), dc = ieCtx(d);
        dc.drawImage(t.fonte, -(dx + IE.carimboOff.x), -(dy + IE.carimboOff.y));
        dc.globalCompositeOperation = 'destination-in';
        dc.drawImage(ponta, 0, 0);
        ctx.globalAlpha = t.op.fluxo / 100;
        ctx.drawImage(d, dx, dy);
    } else {
        ctx.globalAlpha = t.op.fluxo / 100;
        ctx.drawImage(ponta, dx, dy);
    }
    const R = { x: Math.floor(dx), y: Math.floor(dy), w: ponta.width + 2, h: ponta.height + 2 };
    t.sujoPasso = ieRUniao(t.sujoPasso, R);
}

function ieTracoPara(p, primeiro) {
    const t = IE_TRACO;
    if (!t) return;
    t.sujoPasso = null;
    if (primeiro || !t.ult) { ieTracoDab(t, p.x, p.y); t.ult = { x: p.x, y: p.y }; }
    else {
        const passo = Math.max(1, t.op.tam * (t.op.espaco ?? 18) / 100);
        const dx = p.x - t.ult.x, dy = p.y - t.ult.y, dist = Math.hypot(dx, dy);
        let s = passo - t.resto;
        while (s <= dist) {
            ieTracoDab(t, t.ult.x + dx * s / dist, t.ult.y + dy * s / dist);
            s += passo;
        }
        t.resto = dist - (s - passo);
        t.ult = { x: p.x, y: p.y };
    }
    const doc = IE.doc;
    const D = ieRInter(t.sujoPasso, ieRDoc(doc));
    if (!D) return;
    t.sujo = ieRUniao(t.sujo, D);
    ieTracoAplicar(t, D, doc);
}

// refaz a região D do plano: pixels de antes + traço
function ieTracoAplicar(t, D, doc) {
    const L = t.L;
    const o = t.alvo === 'm' ? L.m : L;
    if (t.tipo !== 'borracha' || t.alvo === 'm') ieCrescer(o, D, t.fundo);
    if (!o.c) return;
    const P = ieRInter(D, ieRPlano(o));
    if (!P) return;
    const ctx = ieCtx(o.c);
    const lx = P.x - o.x, ly = P.y - o.y;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(lx, ly, P.w, P.h);
    if (t.fundo) {
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = t.fundo / 255;
        ctx.fillRect(lx, ly, P.w, P.h);
        ctx.globalAlpha = 1;
        if (t.base) ctx.clearRect(t.base.x - o.x, t.base.y - o.y, t.base.c.width, t.base.c.height);
        ctx.beginPath(); ctx.rect(lx, ly, P.w, P.h); ctx.clip();
    }
    if (t.base) ctx.drawImage(t.base.c, P.x - t.base.x, P.y - t.base.y, P.w, P.h, lx, ly, P.w, P.h);
    // cobertura da região (traço ∩ seleção)
    const tmp = ieTemp(30, P.w, P.h), tc = ieCtx(tmp);
    tc.drawImage(t.traco, P.x, P.y, P.w, P.h, 0, 0, P.w, P.h);
    if (doc.sel) {
        tc.globalCompositeOperation = 'destination-in';
        tc.drawImage(doc.sel.c, P.x, P.y, P.w, P.h, 0, 0, P.w, P.h);
    }
    const opac = t.op.opac / 100;
    if (t.alvo === 'm') {
        const v = t.tipo === 'borracha' ? ieCinza(IE.cor[1]) : t.cinza;
        ctx.globalAlpha = opac;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(tmp, 0, 0, P.w, P.h, lx, ly, P.w, P.h);
        if (v > 0) {
            ctx.globalAlpha = opac * v / 255;
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(tmp, 0, 0, P.w, P.h, lx, ly, P.w, P.h);
        }
    } else if (t.tipo === 'borracha') {
        ctx.globalAlpha = opac;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(tmp, 0, 0, P.w, P.h, lx, ly, P.w, P.h);
    } else {
        if (t.tipo === 'pincel') {
            tc.globalCompositeOperation = 'source-in';
            tc.fillStyle = t.cor;
            tc.fillRect(0, 0, P.w, P.h);
        }
        ctx.globalAlpha = opac;
        ctx.globalCompositeOperation = L.travas & 1 ? 'source-atop' : 'source-over';
        ctx.drawImage(tmp, 0, 0, P.w, P.h, lx, ly, P.w, P.h);
    }
    ctx.restore();
    ieInvalidar(L);
    ieAgendar(L.fx || L.m ? ieRUniao(D, ieRCamada(L)) : D, doc);
}

function ieTracoFim() {
    const t = IE_TRACO;
    IE_TRACO = null;
    if (!t) return;
    const doc = IE.doc;
    if (t.ult) IE.ultimoPonto = { doc: doc.id, x: t.ult.x, y: t.ult.y };
    if (!t.sujo) return;
    if (t.alvo === 'm') t.L.sujoM = true; else t.L.sujoPx = true;
    ieCamadaMudou(t.L, t.Rantes);
    ieHist(ieT({ pincel: 'Pincel', borracha: 'Borracha', carimbo: 'Carimbo' }[t.tipo]));
}

function ieCursorPincel(ctx, doc, tam) {
    if (!IE.mouse || IE.ponteiro?.f === IE_FERR.mao) return;
    const r = Math.max(0.5, tam / 2 * doc.zoom);
    const s = ieDocTela(IE.mouse.x, IE.mouse.y, doc);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.beginPath(); ctx.arc(s.x, s.y, r + 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, r - 0.5), 0, Math.PI * 2); ctx.stroke();
    if (r < 4) { ctx.beginPath(); ctx.moveTo(s.x - 6, s.y); ctx.lineTo(s.x + 6, s.y); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x, s.y + 6); ctx.stroke(); }
    ctx.restore();
}

// ─────────────────────────── amostra de pixels (varinha, balde, conta-gotas) ───────────────────────────
function ieAmostra(doc, todas, L) {
    if (todas || !L) return ieCtx(doc.comp).getImageData(0, 0, doc.w, doc.h);
    const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
    const r = L.tipo === 'grupo' ? { c: ieAchatar(doc, [L]), x: 0, y: 0 } : ieRasterTudo(L);
    if (r && r.c) x.drawImage(r.c, r.x, r.y);
    return x.getImageData(0, 0, doc.w, doc.h);
}

// região parecida com o pixel clicado: Uint8Array (1 = dentro) do tamanho do documento
function ieRegiao(img, px, py, tol, contiguo) {
    const W = img.width, H = img.height, d = img.data;
    px = Math.floor(px); py = Math.floor(py);
    const out = new Uint8Array(W * H);
    if (px < 0 || py < 0 || px >= W || py >= H) return out;
    const i0 = (py * W + px) * 4;
    const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
    const igual = i => {
        const k = i * 4;
        if (a0 === 0) return d[k + 3] <= tol;
        return Math.abs(d[k] - r0) <= tol && Math.abs(d[k + 1] - g0) <= tol && Math.abs(d[k + 2] - b0) <= tol && Math.abs(d[k + 3] - a0) <= tol;
    };
    if (!contiguo) { for (let i = 0; i < W * H; i++) if (igual(i)) out[i] = 1; return out; }
    const pilha = [px, py];
    while (pilha.length) {
        const y = pilha.pop(), x0 = pilha.pop();
        let x = x0;
        const lin = y * W;
        while (x >= 0 && !out[lin + x] && igual(lin + x)) x--;
        x++;
        let cima = false, baixo = false;
        while (x < W && !out[lin + x] && igual(lin + x)) {
            out[lin + x] = 1;
            if (y > 0) {
                const k = lin - W + x;
                if (!out[k] && igual(k)) { if (!cima) { pilha.push(x, y - 1); cima = true; } } else cima = false;
            }
            if (y < H - 1) {
                const k = lin + W + x;
                if (!out[k] && igual(k)) { if (!baixo) { pilha.push(x, y + 1); baixo = true; } } else baixo = false;
            }
            x++;
        }
    }
    return out;
}
function ieRegiaoCanvas(reg, W, H) {
    const c = ieCanvas(W, H), x = ieCtx(c);
    const img = x.createImageData(W, H), d = img.data;
    for (let i = 0; i < reg.length; i++) if (reg[i]) { const k = i * 4; d[k] = d[k + 1] = d[k + 2] = d[k + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c;
}

function ieOpSel(ev) {
    if (ev.shiftKey && ev.altKey) return 'cruzar';
    if (ev.shiftKey) return 'somar';
    if (ev.altKey) return 'subtrair';
    return 'nova';
}

// pinta uma cobertura (canvas do tamanho do documento) na camada ativa com cor/opacidade, respeitando a seleção
function iePintarCobertura(doc, L, cob, R, nome, { cor, opac = 1, borracha = false, colorido = false, preservar = false } = {}) {
    const alvo = ieModPinturaAlvo(doc, L);
    const o = ieGravavel(L, alvo);
    const fundo = alvo === 'm' ? (L.m.fundo || 0) : 0;
    R = ieRInter(R, ieRDoc(doc));
    if (!R) return;
    const Rantes = ieRCamada(L);
    ieCrescer(o, R, fundo);
    const tmp = ieCanvas(R.w, R.h), tc = ieCtx(tmp);
    tc.drawImage(cob, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
    if (doc.sel) { tc.globalCompositeOperation = 'destination-in'; tc.drawImage(doc.sel.c, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h); }
    const ctx = ieCtx(o.c);
    ctx.save();
    const lx = R.x - o.x, ly = R.y - o.y;
    if (alvo === 'm') {
        const v = ieCinza(cor || IE.cor[0]);
        ctx.globalAlpha = opac; ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(tmp, lx, ly);
        if (v) { ctx.globalAlpha = opac * v / 255; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(tmp, lx, ly); }
        L.sujoM = true;
    } else {
        if (!colorido && !borracha) { tc.globalCompositeOperation = 'source-in'; tc.fillStyle = cor || IE.cor[0]; tc.fillRect(0, 0, R.w, R.h); }
        ctx.globalAlpha = opac;
        ctx.globalCompositeOperation = borracha ? 'destination-out' : (L.travas & 1 || preservar ? 'source-atop' : 'source-over');
        ctx.drawImage(tmp, lx, ly);
        L.sujoPx = true;
    }
    ctx.restore();
    ieCamadaMudou(L, Rantes);
    ieHist(ieT(nome));
}

// ─────────────────────────── mover ───────────────────────────
// camada visível com pixel no ponto (de cima para baixo), para a "Seleção automática"
function ieCamadaNoPonto(doc, x, y) {
    const ordem = [];
    const visitar = (lista, visivel) => {
        for (const L of lista) {
            const v = visivel && L.visivel;
            if (L.filhos) visitar(L.filhos, v);
            else if (v && ieRaster0(L)) ordem.push(L);
        }
    };
    visitar(doc.camadas, true);
    for (let i = ordem.length - 1; i >= 0; i--) {
        const L = ordem[i], r = ieRaster(L);
        if (!r || x < r.x || y < r.y || x >= r.x + r.c.width || y >= r.y + r.c.height) continue;
        const a = ieCtx(r.c).getImageData(Math.floor(x - r.x), Math.floor(y - r.y), 1, 1).data[3];
        if (a > 12) return L;
    }
    return null;
}

function ieAlvosMover(doc) {
    const sel = ieSelecionadas(doc);
    const out = new Set();
    const add = L => { if (L.tipo === 'grupo') { out.add(L); L.filhos.forEach(add); } else out.add(L); };
    sel.forEach(add);
    return [...out];
}

function ieMoverCamada(L, dx, dy) {
    if (L.c) { L.x += dx; L.y += dy; }
    if (L.m) { L.m.x += dx; L.m.y += dy; }
    if (L.tf) L.tf = ieMatMul([1, 0, 0, 1, dx, dy], L.tf);
    if (L.txt) L.txt.m = ieMatMul([1, 0, 0, 1, dx, dy], L.txt.m || IE_ID);
    if (L._raster && L._raster.c !== L.c) {
        const f = L._raster.forma;
        L._raster = { ...L._raster, x: L._raster.x + dx, y: L._raster.y + dy, forma: f && { ...f, x: f.x + dx, y: f.y + dy } };
    }
}

function ieDuplicarCamada(doc, L) {
    const s = ieFotoCamadas([L])[0];
    const N = ieRestaurarCamadas([s])[0];
    const renova = X => {
        const doPsd = X.ref != null;
        X.id = ++doc.seq;
        X.uid = 'u' + doc.id + '_' + X.id + '_' + Math.random().toString(36).slice(2, 7);
        X.ref = null; X.sujoPx = true; X.sujoM = !!X.m;
        if (X.tipo !== 'pixel' && X.tipo !== 'grupo' && X.tipo !== 'ajuste') {
            // cópia de texto/objeto inteligente do PSD: vira pixels (o original continua vivo). Objeto inteligente
            // criado no editor continua objeto inteligente, com o MESMO original (como as instâncias do Photoshop)
            if (!X.txt && !(X.tipo === 'inteligente' && X.c0 && !doPsd)) { X.tipo = 'pixel'; delete X.c0; delete X.tf; delete X.texto; }
        }
        if (X.filhos) X.filhos.forEach(renova);
    };
    renova(N);
    N.nome = L.nome + ' ' + ieT('cópia');
    return N;
}

// caixa dos pixels das camadas selecionadas (a mesma que a Transformação livre usa), guardada até mudarem
// caixa dos pixels de uma camada, sem os efeitos (como o Photoshop alinha e mostra os controles)
function ieCaixaCamada(L) {
    if (!L) return null;
    if (L.tipo === 'grupo') { let R = null; L.filhos.forEach(X => { if (X.visivel) R = ieRUniao(R, ieCaixaCamada(X)); }); return R; }
    if (!ieRaster0(L) || !L.c) return null;
    if (L._caixa && L._caixa.v === L._v && L._caixa.c === L.c) {   // só andou: desloca a caixa guardada
        const k = L._caixa, R = k.R;
        return R && { x: R.x + L.x - k.x, y: R.y + L.y - k.y, w: R.w, h: R.h };
    }
    const b = L.c0 ? { x: L.x, y: L.y, w: L.c.width, h: L.c.height } : ieLimites(L.c, L.x, L.y);
    L._caixa = { v: L._v, c: L.c, x: L.x, y: L.y, R: b };
    return b;
}
function ieCaixaAlvos(doc) {
    return ieSelecionadas(doc).reduce((R, L) => ieRUniao(R, ieCaixaCamada(L)), null);
}
// cursor de girar: seta curva dupla, branca com contorno preto (legível em qualquer fundo)
const IE_CURSOR_GIRAR = (() => {
    const seta = 'M6 9a8 8 0 0 1 12 0M18 9l1-4M18 9l-4-1M18 15a8 8 0 0 1-12 0M6 15l-1 4M6 15l4 1';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${seta}" stroke="#000" stroke-width="4"/><path d="${seta}" stroke="#fff" stroke-width="2"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, alias`;
})();

// alça da caixa de controles da ferramenta Mover (Mostrar controles de transformação); fora dos cantos = girar
function ieMoverAlca(doc, p) {
    if (!IE.op.mover.controles || IE.transf) return null;
    const R = ieCaixaAlvos(doc);
    if (!R) return null;
    const h = ieAlcaRet(R, p, doc);
    if (h && h !== 'dentro') return h;
    if (h === 'dentro') return null;
    const tol = 7 / doc.zoom;
    const cantos = [[R.x, R.y], [R.x + R.w, R.y], [R.x, R.y + R.h], [R.x + R.w, R.y + R.h]];
    if (cantos.some(([x, y]) => Math.hypot(p.x - x, p.y - y) <= tol * 3.5)) return 'girar';
    return null;
}

const IE_MOVER = {
    nome: 'Mover', tecla: 'V', icone: 'pointer',
    cursor() {
        const doc = IE.doc;
        const h = doc && IE.mouse && !IE.mov ? ieMoverAlca(doc, IE.mouse) : null;
        if (!h) return 'default';
        if (h === 'girar') return IE_CURSOR_GIRAR;
        return ['tl', 'br'].includes(h) ? 'nwse-resize' : ['tr', 'bl'].includes(h) ? 'nesw-resize' : ['t', 'b'].includes(h) ? 'ns-resize' : 'ew-resize';
    },
    down(p, ev, doc) {
        // alça da caixa: entra na Transformação livre já arrastando (Enter aplica, Esc cancela)
        const alca = ieMoverAlca(doc, p);
        if (alca) {
            ieTransfIniciar();
            if (IE.transf) {
                const t = IE.transf;
                t.arr = { h: alca, p0: p, s: { cx: t.cx, cy: t.cy, sx: t.sx, sy: t.sy, rot: t.rot } };
                IE.mov = { transf: true };
                return;
            }
        }
        const auto = IE.op.mover.auto !== ev.ctrlKey;
        if (auto) {
            const L = ieCamadaNoPonto(doc, p.x, p.y);
            if (L && !(doc.selIds.length > 1 && doc.selIds.includes(L.id))) ieAtivar(L.id, doc, { somar: ev.shiftKey });
        }
        let alvos = ieAlvosMover(doc);
        if (!alvos.length) return;
        if (alvos.some(L => L.travas & 4 || L.travas & 0x80000000)) { ieToast(ieT('Camada com posição travada')); return; }
        // Alt+arrastar: duplica antes de mover
        if (ev.altKey) {
            const sel = ieSelecionadas(doc);
            const novas = sel.map(L => { const N = ieDuplicarCamada(doc, L); const a = ieAchar(doc, L.id); a.lista.splice(a.i + 1, 0, N); return N; });
            doc.selIds = novas.map(N => N.id);
            doc.ativa = novas[novas.length - 1]?.id ?? doc.ativa;
            alvos = ieAlvosMover(doc);
            ieUiCamadas?.();
        }
        const L = ieAtiva(doc);
        const flutuar = doc.sel && alvos.length === 1 && L && L.tipo === 'pixel' && L.c && !doc.mascaraAlvo;
        IE.mov = { p0: p, dx: 0, dy: 0, alvos, R: alvos.reduce((R, X) => ieRUniao(R, ieRCamada(X)), null), dup: ev.altKey, B: ieCaixaAlvos(doc) };
        if (flutuar) {
            ieGravavel(L);
            const R = ieRPlano(L);
            const s = ieSelRegiao(doc, R);
            const f = ieClonar(L.c), fx = ieCtx(f);
            fx.globalCompositeOperation = 'destination-in';
            fx.drawImage(s, 0, 0);
            const buraco = ieClonar(L.c), bx = ieCtx(buraco);
            bx.globalCompositeOperation = 'destination-out';
            bx.drawImage(s, 0, 0);
            IE.mov.flut = { L, f, fx0: L.x, fy0: L.y, buraco, bx0: L.x, by0: L.y, sel0: doc.sel };
        }
    },
    move(p, ev, doc) {
        const m = IE.mov;
        if (!m) return;
        if (m.transf) { IE_TRANSF.move(p, ev, doc); return; }
        let dx = Math.round(p.x - m.p0.x), dy = Math.round(p.y - m.p0.y);
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (m.B && typeof ieAjustarDelta === 'function' && !ev.ctrlKey) {   // Exibir > Ajustar (Ctrl segura o encaixe, como no Photoshop)
            const ids = []; for (const X of m.alvos) iePercorrer([X], Y => { ids.push(Y.id); });
            const a = ieAjustarDelta({ x: m.B.x + dx, y: m.B.y + dy, w: m.B.w, h: m.B.h }, { camadas: ids }, doc);
            if (!(ev.shiftKey && Math.abs(dx) <= Math.abs(dy))) dx += Math.round(a.dx);
            if (!(ev.shiftKey && Math.abs(dx) > Math.abs(dy))) dy += Math.round(a.dy);
        }
        const ddx = dx - m.dx, ddy = dy - m.dy;
        if (!ddx && !ddy) return;
        m.dx = dx; m.dy = dy;
        if (m.flut) {
            const f = m.flut, L = f.L;
            const nx = f.fx0 + dx, ny = f.fy0 + dy;
            const R = ieRUniao({ x: f.bx0, y: f.by0, w: f.buraco.width, h: f.buraco.height }, { x: nx, y: ny, w: f.f.width, h: f.f.height });
            const c = ieCanvas(R.w, R.h), x = ieCtx(c);
            x.drawImage(f.buraco, f.bx0 - R.x, f.by0 - R.y);
            x.drawImage(f.f, nx - R.x, ny - R.y);
            L.c = c; L.x = R.x; L.y = R.y;
            ieInvalidar(L);
            doc._selDx = dx; doc._selDy = dy;
            ieAgendar(ieRUniao(m.R, R), doc);
            return;
        }
        for (const L of m.alvos) ieMoverCamada(L, ddx, ddy);
        const R = m.alvos.reduce((R, X) => ieRUniao(R, ieRCamada(X)), null);
        ieAgendar(ieRUniao(ieRUniao(m.R, R), m.Rult), doc);
        m.Rult = R;
        ieUiPropsPos?.();
    },
    up(p, ev, doc) {
        const m = IE.mov;
        IE.mov = null;
        if (!m) return;
        if (m.transf) { IE_TRANSF.up(p, ev, doc); return; }
        if (m.flut) {
            doc._selDx = doc._selDy = 0;
            if (m.dx || m.dy) {
                const c = ieSelNova(doc);
                ieCtx(c).drawImage(m.flut.sel0.c, m.dx, m.dy);
                ieSelDefinir(doc, c, m.flut.sel0.forma ? { ...m.flut.sel0.forma, x: m.flut.sel0.forma.x + m.dx, y: m.flut.sel0.forma.y + m.dy } : null);
                m.flut.L.sujoPx = true;
                ieHist(ieT('Mover seleção'));
            }
            return;
        }
        if (m.dx || m.dy || m.dup) {
            m.alvos.forEach(L => { if (L.c && !L.c0) L.sujoPx = L.sujoPx || false; L.movido = true; });
            ieHist(ieT(m.dup ? 'Duplicar e mover' : 'Mover'));
            ieUiCamadas?.();
        }
    },
    sobre(ctx, doc) {
        if (!IE.op.mover.controles || IE.transf || IE.mov || IE.semExtras) return;
        const R = ieCaixaAlvos(doc);
        if (!R) return;
        const a = ieDocTela(R.x, R.y, doc), w = R.w * doc.zoom, h = R.h * doc.zoom;
        ctx.save();
        ctx.strokeStyle = '#4aa3ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(w), Math.round(h));
        ctx.restore();
        ieAlcasDesenhar(ctx, [[a.x, a.y], [a.x + w / 2, a.y], [a.x + w, a.y], [a.x + w, a.y + h / 2], [a.x + w, a.y + h], [a.x + w / 2, a.y + h], [a.x, a.y + h], [a.x, a.y + h / 2]]);
    },
};

// ─────────────────────────── letreiro (retângulo/elipse) ───────────────────────────
function ieRetArrasto(p0, p, ev, quadrado) {
    let x0 = p0.x, y0 = p0.y, w = p.x - p0.x, h = p.y - p0.y;
    if (quadrado) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    if (ev.altKey && IE.arr && IE.arr.op === 'nova') { x0 -= w; y0 -= h; w *= 2; h *= 2; }
    let x = Math.min(x0, x0 + w), y = Math.min(y0, y0 + h);
    return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.abs(w)), h: Math.round(Math.abs(h)) };
}

const IE_LETREIRO = {
    nome: 'Letreiro', tecla: 'M', icone: 'marquee', cursor: 'crosshair',
    down(p, ev, doc) {
        const op = ieOpSel(ev);
        if (op === 'nova' && doc.sel && ieSelDentro(doc, p)) { IE.arr = { moverSel: true, p0: p, dx: 0, dy: 0 }; return; }
        IE.arr = { p0: { x: Math.round(p.x), y: Math.round(p.y) }, p, op, ev };
    },
    move(p, ev, doc) {
        const a = IE.arr; if (!a) return;
        if (a.moverSel) { a.dx = Math.round(p.x - a.p0.x); a.dy = Math.round(p.y - a.p0.y); doc._selDx = a.dx; doc._selDy = a.dy; ieDesenharSobre(); return; }
        a.p = p; a.r = ieRetArrasto(a.p0, p, ev, ev.shiftKey && a.op === 'nova'); ieDesenharSobre();
    },
    up(p, ev, doc) {
        const a = IE.arr; IE.arr = null;
        if (!a) return;
        if (a.moverSel) { doc._selDx = doc._selDy = 0; ieSelDeslocar(doc, a.dx, a.dy); return; }
        const r = a.r;
        if (!r || r.w < 1 || r.h < 1) { if (a.op === 'nova' && doc.sel) ieSelNada(); return; }
        const eli = IE.op.letreiro.forma === 'eli';
        ieSelAplicar(doc, x => {
            if (eli) { x.beginPath(); x.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); x.fill(); }
            else x.fillRect(r.x, r.y, r.w, r.h);
        }, a.op, { t: eli ? 'eli' : 'ret', ...r }, IE.op.letreiro.suav);
        ieHist(ieT(eli ? 'Letreiro elíptico' : 'Letreiro retangular'));
    },
    sobre(ctx, doc) {
        const a = IE.arr;
        if (!a || !a.r) return;
        const s = ieDocTela(a.r.x, a.r.y, doc), w = a.r.w * doc.zoom, h = a.r.h * doc.zoom;
        ctx.save();
        ctx.lineWidth = 1;
        for (const [cor, dash] of [['#fff', []], ['#000', [4, 4]]]) {
            ctx.strokeStyle = cor; ctx.setLineDash(dash);
            ctx.beginPath();
            if (IE.op.letreiro.forma === 'eli') ctx.ellipse(s.x + w / 2, s.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            else ctx.rect(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, Math.round(w), Math.round(h));
            ctx.stroke();
        }
        ctx.restore();
    },
};

function ieSelDentro(doc, p) {
    if (!doc.sel || p.x < 0 || p.y < 0 || p.x >= doc.w || p.y >= doc.h) return false;
    return ieCtx(doc.sel.c).getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data[3] >= 128;
}
function ieSelDeslocar(doc, dx, dy) {
    if (!doc.sel || (!dx && !dy)) return;
    const c = ieSelNova(doc);
    ieCtx(c).drawImage(doc.sel.c, dx, dy);
    const f = doc.sel.forma;
    ieSelDefinir(doc, c, f ? { ...f, x: f.x + dx, y: f.y + dy } : null);
    ieHist(ieT('Mover seleção'));
}

// ─────────────────────────── laço ───────────────────────────
const IE_LACO = {
    nome: 'Laço', tecla: 'L', icone: 'lasso', cursor: 'crosshair',
    down(p, ev, doc) {
        const poli = IE.op.laco.modo === 'poligonal';
        if (poli) {
            if (!IE.laco) IE.laco = { pts: [], op: ieOpSel(ev), poli: true };
            const l = IE.laco, q = l.pts[0];
            if (q && l.pts.length > 2 && Math.hypot((q.x - p.x) * doc.zoom, (q.y - p.y) * doc.zoom) < 8) return ieLacoFechar(doc);
            l.pts.push({ x: p.x, y: p.y });
            ieDesenharSobre();
            return;
        }
        IE.laco = { pts: [{ x: p.x, y: p.y }], op: ieOpSel(ev) };
    },
    move(p) { const l = IE.laco; if (l && !l.poli) { l.pts.push({ x: p.x, y: p.y }); ieDesenharSobre(); } },
    hover() { if (IE.laco && IE.laco.poli) ieDesenharSobre(); },
    up(p, ev, doc) { const l = IE.laco; if (l && !l.poli) ieLacoFechar(doc); },
    dbl(p, ev, doc) { if (IE.laco && IE.laco.poli) ieLacoFechar(doc); },
    sobre(ctx, doc) {
        const l = IE.laco;
        if (!l || !l.pts.length) return;
        ctx.save();
        ctx.lineWidth = 1;
        const pts = l.poli && IE.mouse ? [...l.pts, IE.mouse] : l.pts;
        for (const [cor, dash] of [['#fff', []], ['#000', [4, 4]]]) {
            ctx.strokeStyle = cor; ctx.setLineDash(dash);
            ctx.beginPath();
            pts.forEach((q, i) => { const s = ieDocTela(q.x, q.y, doc); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
            ctx.stroke();
        }
        ctx.restore();
    },
};
function ieLacoFechar(doc) {
    const l = IE.laco;
    IE.laco = null;
    if (!l || l.pts.length < 3) { ieDesenharSobre(); return; }
    ieSelAplicar(doc, x => {
        x.beginPath();
        l.pts.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)));
        x.closePath();
        x.fill();
    }, l.op, null, IE.op.laco.suav);
    ieHist(ieT(l.poli ? 'Laço poligonal' : 'Laço'));
}

// ─────────────────────────── varinha mágica ───────────────────────────
const IE_VARINHA = {
    nome: 'Varinha mágica', tecla: 'W', icone: 'wand', cursor: 'crosshair',
    down(p, ev, doc) {
        const o = IE.op.varinha;
        const img = ieAmostra(doc, o.todas, ieAtiva(doc));
        const reg = ieRegiao(img, p.x, p.y, o.tol, o.contiguo);
        const c = ieRegiaoCanvas(reg, doc.w, doc.h);
        ieSelAplicar(doc, x => x.drawImage(c, 0, 0), ieOpSel(ev));
        ieHist(ieT('Varinha mágica'));
    },
};

// ─────────────────────────── conta-gotas ───────────────────────────
function ieAmostrarCor(doc, p, todas) {
    if (p.x < 0 || p.y < 0 || p.x >= doc.w || p.y >= doc.h) return null;
    let d;
    if (todas) d = ieCtx(doc.comp).getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
    else {
        const L = ieAtiva(doc), r = L && ieRasterTudo(L);
        if (!r) return null;
        d = ieCtx(r.c).getImageData(Math.floor(p.x - r.x), Math.floor(p.y - r.y), 1, 1).data;
    }
    if (!d[3]) return null;
    return ieRgbHex(d[0], d[1], d[2]);
}
const IE_CONTAGOTAS = {
    nome: 'Conta-gotas', tecla: 'I', icone: 'dropper', cursor: 'crosshair',
    down(p, ev, doc) { this.move(p, ev, doc); },
    move(p, ev, doc) {
        if (!IE.ponteiro) return;
        const c = ieAmostrarCor(doc, p, IE.op.contagotas.todas);
        if (c) { IE.cor[ev.altKey && IE.ferr === 'contagotas' ? 1 : 0] = c; ieUiCores?.(); }
    },
};

// ─────────────────────────── pincel, borracha, carimbo ───────────────────────────
const iePintor = (tipo, nome, tecla, icone) => ({
    nome, tecla, icone, cursorPincel: true,
    cursor: () => (IE.op[tipo].tam * (IE.doc?.zoom || 1) >= 6 ? 'none' : 'crosshair'),
    down(p, ev, doc) { ieTracoIniciar(p, ev, doc, tipo); },
    move(p) { if (IE_TRACO) ieTracoPara(p); },
    up() { ieTracoFim(); },
    sobre(ctx, doc) {
        ieCursorPincel(ctx, doc, IE.op[tipo].tam);
        if (tipo === 'carimbo' && IE.carimboFonte && IE.mouse) {
            const off = IE.carimboOff && IE_TRACO ? IE.carimboOff : null;
            const q = off ? { x: IE.mouse.x + off.x, y: IE.mouse.y + off.y } : IE.carimboFonte;
            const s = ieDocTela(q.x, q.y, doc);
            ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(s.x - 7, s.y); ctx.lineTo(s.x + 7, s.y); ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x, s.y + 7); ctx.stroke();
            ctx.restore();
        }
    },
});

// ─────────────────────────── balde de tinta ───────────────────────────
const IE_BALDE = {
    nome: 'Balde de tinta', tecla: 'G', icone: 'bucket', cursor: 'crosshair',
    down(p, ev, doc) {
        const L = ieAtiva(doc);
        if (!ieChecarPintavel(L, 'pintar')) return;
        if (p.x < 0 || p.y < 0 || p.x >= doc.w || p.y >= doc.h) return;
        const o = IE.op.balde;
        const img = ieAmostra(doc, o.todas, doc.mascaraAlvo ? null : L);
        const reg = ieRegiao(img, p.x, p.y, o.tol, o.contiguo);
        const cob = ieRegiaoCanvas(reg, doc.w, doc.h);
        iePintarCobertura(doc, L, cob, ieRDoc(doc), 'Balde de tinta', { opac: o.opac / 100 });
    },
};

// ─────────────────────────── borracha mágica e borracha de plano de fundo (como no Photoshop) ───────────────────────────
// Diferença de cor (a mesma régua do Balde/Varinha: o maior desvio entre os canais) → quanto apagar: até a tolerância
// apaga tudo; numa faixa de mais 50% da tolerância apaga em degradê (borda sem serrilhado e sem auréola da cor do fundo)
function ieApagarCor(dif, tol, suave) {
    if (dif <= tol) return 1;
    if (!suave) return 0;
    const faixa = Math.max(4, tol * 0.5);
    return dif >= tol + faixa ? 0 : 1 - (dif - tol) / faixa;
}

// Borracha mágica: um clique apaga a cor clicada (contígua ou em toda a camada)
const IE_BORRACHA_MAGICA = {
    nome: 'Borracha mágica', tecla: 'E', icone: 'eraser', cursor: 'crosshair',
    down(p, ev, doc) {
        const L = ieAtiva(doc);
        if (!ieChecarPintavel(L, 'apagar')) return;
        if (p.x < 0 || p.y < 0 || p.x >= doc.w || p.y >= doc.h) return;
        const o = IE.op.borrachaMagica;
        const img = ieAmostra(doc, o.todas, L), d = img.data, W = img.width, H = img.height;
        const tolMax = o.tol + (o.suave ? Math.max(4, o.tol * 0.5) : 0);
        const reg = ieRegiao(img, p.x, p.y, tolMax, o.contiguo);   // o que a cor alcança (com a faixa suave)
        const i0 = (Math.floor(p.y) * W + Math.floor(p.x)) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2];
        const cob = ieCanvas(W, H), cx = ieCtx(cob), ci = cx.createImageData(W, H), c = ci.data;
        for (let i = 0; i < reg.length; i++) {
            if (!reg[i]) continue;
            const k = i * 4, dif = Math.max(Math.abs(d[k] - r0), Math.abs(d[k + 1] - g0), Math.abs(d[k + 2] - b0));
            const a = ieApagarCor(dif, o.tol, o.suave);
            if (a > 0) { c[k] = c[k + 1] = c[k + 2] = 255; c[k + 3] = Math.round(a * 255); }
        }
        cx.putImageData(ci, 0, 0);
        iePintarCobertura(doc, L, cob, ieRDoc(doc), 'Borracha mágica', { opac: o.opac / 100, borracha: true });
    },
};

// Borracha de plano de fundo: pincel que só apaga a cor que está debaixo da mira (amostra contínua ou só no clique),
// com tolerância; "proteger a cor de frente" deixa intacta a cor escolhida (ex.: o cabelo). O tamanho grande pega a
// imagem inteira de uma vez, como no Photoshop.
const IE_BORRACHA_FUNDO = {
    nome: 'Borracha de plano de fundo', tecla: 'E', icone: 'eraser', cursorPincel: true,
    cursor: () => 'none',
    down(p, ev, doc) {
        const L = ieAtiva(doc);
        if (!ieChecarPintavel(L, 'apagar') || !L.c) return;
        ieGravavel(L);
        IE.bfundo = { L, Rantes: ieRCamada(L), amostra: null, ult: null };
        IE_BORRACHA_FUNDO.dab(p, doc);
    },
    move(p, ev, doc) {
        const b = IE.bfundo;
        if (!b) return;
        const o = IE.op.borrachaFundo, passo = Math.max(1, o.tam * 0.25), u = b.ult;
        const dist = Math.hypot(p.x - u.x, p.y - u.y), n = Math.ceil(dist / passo);
        for (let k = 1; k <= n; k++) IE_BORRACHA_FUNDO.dab({ x: u.x + (p.x - u.x) * k / n, y: u.y + (p.y - u.y) * k / n }, doc);
    },
    up(p, ev, doc) {
        const b = IE.bfundo; IE.bfundo = null;
        if (!b) return;
        b.L.sujoPx = true;
        ieCamadaMudou(b.L, b.Rantes);
        ieHist(ieT('Borracha de plano de fundo'));
    },
    dab(p, doc) {
        const b = IE.bfundo, L = b.L, o = IE.op.borrachaFundo, R = o.tam / 2;
        b.ult = { x: p.x, y: p.y };
        const lx = Math.floor(p.x - L.x), ly = Math.floor(p.y - L.y);
        const x0 = Math.max(0, Math.floor(lx - R)), y0 = Math.max(0, Math.floor(ly - R));
        const x1 = Math.min(L.c.width, Math.ceil(lx + R)), y1 = Math.min(L.c.height, Math.ceil(ly + R));
        if (x1 <= x0 || y1 <= y0) return;
        const ctx = ieCtx(L.c), img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, w = x1 - x0;
        // amostra: a cor debaixo da mira (contínua) ou a do primeiro clique (uma vez)
        if (!b.amostra || o.amostra === 'continuo') {
            const mx = Math.min(x1 - 1, Math.max(x0, lx)) - x0, my = Math.min(y1 - 1, Math.max(y0, ly)) - y0, k = (my * w + mx) * 4;
            if (d[k + 3] === 0 && b.amostra) { /* mira em área já apagada: mantém a amostra */ }
            else b.amostra = [d[k], d[k + 1], d[k + 2]];
        }
        const [r0, g0, b0] = b.amostra, prot = o.proteger ? ieHexRgb(IE.cor[0]) : null;
        const reg = o.limites === 'contiguo' ? ieRegiao(img, Math.min(w - 1, Math.max(0, lx - x0)), Math.min(y1 - y0 - 1, Math.max(0, ly - y0)), o.tol + Math.max(4, o.tol * 0.5), true) : null;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const dx = x + 0.5 - lx, dy = y + 0.5 - ly;
            if (dx * dx + dy * dy > R * R) continue;
            const i = (y - y0) * w + (x - x0), k = i * 4;
            if (!d[k + 3] || (reg && !reg[i])) continue;
            if (prot && Math.max(Math.abs(d[k] - prot[0]), Math.abs(d[k + 1] - prot[1]), Math.abs(d[k + 2] - prot[2])) <= o.tol) continue;
            const a = ieApagarCor(Math.max(Math.abs(d[k] - r0), Math.abs(d[k + 1] - g0), Math.abs(d[k + 2] - b0)), o.tol, true);
            if (a > 0) d[k + 3] = Math.round(d[k + 3] * (1 - a));
        }
        ctx.putImageData(img, x0, y0);
        ieInvalidar(L);
        ieDesenharVista?.();
    },
    sobre(ctx, doc) {
        ieCursorPincel(ctx, doc, IE.op.borrachaFundo.tam);
        if (IE.mouse) {   // mira no centro (o ponto que dá a cor a apagar)
            const s = ieDocTela(IE.mouse.x, IE.mouse.y, doc);
            ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(s.x - 5, s.y); ctx.lineTo(s.x + 5, s.y); ctx.moveTo(s.x, s.y - 5); ctx.lineTo(s.x, s.y + 5); ctx.stroke(); ctx.restore();
        }
    },
};

// ─────────────────────────── degradê ───────────────────────────
const IE_DEGRADE = {
    nome: 'Degradê', tecla: 'G', icone: 'gradient', cursor: 'crosshair',
    down(p, ev, doc) {
        const L = ieAtiva(doc);
        if (!ieChecarPintavel(L, 'pintar')) return;
        IE.deg = { a: p, b: p };
    },
    move(p, ev) {
        if (!IE.deg) return;
        let b = p;
        if (ev.shiftKey) {
            const a = IE.deg.a, ang = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(p.x - a.x, p.y - a.y);
            b = { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d };
        }
        IE.deg.b = b;
        ieDesenharSobre();
    },
    up(p, ev, doc) {
        const g = IE.deg; IE.deg = null;
        ieDesenharSobre();
        if (!g || Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) < 1) return;
        const o = IE.op.degrade, L = ieAtiva(doc);
        const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
        let grad;
        if (o.tipo === 'radial') grad = x.createRadialGradient(g.a.x, g.a.y, 0, g.a.x, g.a.y, Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y));
        else if (o.tipo === 'refletido') grad = x.createLinearGradient(2 * g.a.x - g.b.x, 2 * g.a.y - g.b.y, g.b.x, g.b.y);
        else grad = x.createLinearGradient(g.a.x, g.a.y, g.b.x, g.b.y);
        let c1 = IE.cor[0], c2 = o.cores === 'frente-transp' ? null : IE.cor[1];
        const [r1, g1, b1] = ieHexRgb(c1), cor2 = c2 ? ieHexRgb(c2) : [r1, g1, b1];
        const stops = [[0, `rgba(${r1},${g1},${b1},1)`], [1, `rgba(${cor2[0]},${cor2[1]},${cor2[2]},${c2 ? 1 : 0})`]];
        if (o.inverter) stops.reverse().forEach(s => (s[0] = 1 - s[0]));
        if (o.tipo === 'refletido') {
            grad.addColorStop(0, stops[1][1]); grad.addColorStop(0.5, stops[0][1]); grad.addColorStop(1, stops[1][1]);
        } else stops.forEach(([t, cc]) => grad.addColorStop(t, cc));
        x.fillStyle = grad;
        x.fillRect(0, 0, doc.w, doc.h);
        const R = doc.sel ? doc.sel.bbox : ieRDoc(doc);
        iePintarCobertura(doc, L, c, R, 'Degradê', { opac: o.opac / 100, colorido: true });
    },
    sobre(ctx, doc) {
        const g = IE.deg;
        if (!g) return;
        const a = ieDocTela(g.a.x, g.a.y, doc), b = ieDocTela(g.b.x, g.b.y, doc);
        ctx.save();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        for (const q of [a, b]) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        ctx.restore();
    },
};

// ─────────────────────────── formas (raster) ───────────────────────────
const IE_FORMA = {
    nome: 'Forma', tecla: 'U', icone: 'shape', cursor: 'crosshair',
    down(p, ev) { IE.arr = { p0: { x: Math.round(p.x), y: Math.round(p.y) }, op: 'nova' }; },
    move(p, ev) {
        const a = IE.arr; if (!a) return;
        if (IE.op.forma.tipo === 'linha') a.r = { x1: a.p0.x, y1: a.p0.y, x2: p.x, y2: p.y };
        else a.r = ieRetArrasto(a.p0, p, ev, ev.shiftKey);
        ieDesenharSobre();
    },
    up(p, ev, doc) {
        const a = IE.arr; IE.arr = null;
        if (!a || !a.r) return;
        const o = IE.op.forma, cor = IE.cor[0];
        let c, x0, y0, nome;
        if (o.tipo === 'linha') {
            const larg = Math.max(1, o.contorno || 4), r = a.r;
            const R = ieRInt({ x: Math.min(r.x1, r.x2) - larg, y: Math.min(r.y1, r.y2) - larg, w: Math.abs(r.x2 - r.x1) + 2 * larg, h: Math.abs(r.y2 - r.y1) + 2 * larg });
            c = ieCanvas(R.w, R.h); const x = ieCtx(c);
            x.strokeStyle = cor; x.lineWidth = larg; x.lineCap = 'round';
            x.beginPath(); x.moveTo(r.x1 - R.x, r.y1 - R.y); x.lineTo(r.x2 - R.x, r.y2 - R.y); x.stroke();
            x0 = R.x; y0 = R.y; nome = 'Linha';
        } else {
            const r = a.r;
            if (r.w < 1 || r.h < 1) return;
            c = ieCanvas(r.w, r.h); const x = ieCtx(c);
            x.fillStyle = cor;
            x.beginPath();
            if (o.tipo === 'eli') x.ellipse(r.w / 2, r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
            else if (o.raio > 0 && x.roundRect) x.roundRect(0, 0, r.w, r.h, Math.min(o.raio, r.w / 2, r.h / 2));
            else x.rect(0, 0, r.w, r.h);
            x.fill();
            x0 = r.x; y0 = r.y; nome = o.tipo === 'eli' ? 'Elipse' : 'Retângulo';
        }
        const L = ieNovaCamada(doc, { nome: ieNomeLivre(doc, ieT(nome)), c, x: x0, y: y0, sujoPx: true });
        ieInserirAcima(doc, L, ieAtiva(doc));
        ieCamadaMudou(L);
        ieHist(ieT(nome));
        ieUiCamadas?.();
    },
    sobre(ctx, doc) {
        const a = IE.arr;
        if (!a || !a.r) return;
        ctx.save();
        ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 1;
        ctx.beginPath();
        if (IE.op.forma.tipo === 'linha') {
            const p1 = ieDocTela(a.r.x1, a.r.y1, doc), p2 = ieDocTela(a.r.x2, a.r.y2, doc);
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else {
            const s = ieDocTela(a.r.x, a.r.y, doc), w = a.r.w * doc.zoom, h = a.r.h * doc.zoom;
            if (IE.op.forma.tipo === 'eli') ctx.ellipse(s.x + w / 2, s.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            else ctx.rect(s.x + 0.5, s.y + 0.5, w, h);
        }
        ctx.stroke();
        ctx.restore();
    },
};

// ─────────────────────────── corte demarcado ───────────────────────────
const IE_CORTE = {
    nome: 'Corte demarcado', tecla: 'C', icone: 'crop', cursor: 'crosshair',
    ativar(doc) { if (doc) IE.corte = { r: ieRDoc(doc) }; ieDesenharSobre(); },
    desativar() { IE.corte = null; },
    down(p, ev, doc) {
        if (!IE.corte) IE.corte = { r: ieRDoc(doc) };
        const c = IE.corte, r = c.r;
        const h = ieAlcaRet(r, p, doc);
        c.arr = { h, p0: p, r0: { ...r } };
        if (!h) c.arr.novo = true;
    },
    move(p, ev, doc) {
        const c = IE.corte;
        if (!c || !c.arr) return;
        const a = c.arr, dx = p.x - a.p0.x, dy = p.y - a.p0.y;
        let { x, y, w, h } = a.r0;
        if (a.novo) { c.r = ieRetArrasto({ x: Math.round(a.p0.x), y: Math.round(a.p0.y) }, p, ev, ev.shiftKey); }
        else if (a.h === 'dentro') { c.r = { x: Math.round(x + dx), y: Math.round(y + dy), w, h }; }
        else {
            let x1 = x, y1 = y, x2 = x + w, y2 = y + h;
            if (a.h.includes('l')) x1 += dx;
            if (a.h.includes('r')) x2 += dx;
            if (a.h.includes('t')) y1 += dy;
            if (a.h.includes('b')) y2 += dy;
            c.r = { x: Math.round(Math.min(x1, x2)), y: Math.round(Math.min(y1, y2)), w: Math.round(Math.abs(x2 - x1)), h: Math.round(Math.abs(y2 - y1)) };
        }
        ieDesenharSobre();
        ieOpcoesRender?.();
    },
    up() { if (IE.corte) IE.corte.arr = null; },
    dbl(p, ev, doc) { ieCorteAplicar(doc); },
    cursor() {
        const doc = IE.doc;
        if (!IE.corte || !IE.mouse || !doc) return 'crosshair';
        const h = ieAlcaRet(IE.corte.r, IE.mouse, doc);
        return { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize', dentro: 'move' }[h] || 'crosshair';
    },
    sobre(ctx, doc) {
        if (!IE.corte) return;
        const r = IE.corte.r, a = ieDocTela(r.x, r.y, doc), w = r.w * doc.zoom, h = r.h * doc.zoom;
        const c = ctx.canvas, dpr = window.devicePixelRatio || 1, W = c.width / dpr, H = c.height / dpr;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(a.x, a.y, w, h); ctx.fill('evenodd');
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath();
        for (const k of [1, 2]) { ctx.moveTo(a.x + w * k / 3, a.y); ctx.lineTo(a.x + w * k / 3, a.y + h); ctx.moveTo(a.x, a.y + h * k / 3); ctx.lineTo(a.x + w, a.y + h * k / 3); }
        ctx.stroke();
        ieAlcasDesenhar(ctx, [[a.x, a.y], [a.x + w / 2, a.y], [a.x + w, a.y], [a.x + w, a.y + h / 2], [a.x + w, a.y + h], [a.x + w / 2, a.y + h], [a.x, a.y + h], [a.x, a.y + h / 2]]);
        ctx.restore();
    },
};

function ieAlcasDesenhar(ctx, pts) {
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
    for (const [x, y] of pts) { ctx.fillRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7); ctx.strokeRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7); }
    ctx.restore();
}
function ieAlcaRet(r, p, doc) {
    const tol = 7 / doc.zoom;
    const perto = (a, b) => Math.abs(a - b) <= tol;
    const L = perto(p.x, r.x), Rr = perto(p.x, r.x + r.w), T = perto(p.y, r.y), B = perto(p.y, r.y + r.h);
    const dx = p.x >= r.x - tol && p.x <= r.x + r.w + tol, dy = p.y >= r.y - tol && p.y <= r.y + r.h + tol;
    if (T && L) return 'tl'; if (T && Rr) return 'tr'; if (B && L) return 'bl'; if (B && Rr) return 'br';
    if (T && dx) return 't'; if (B && dx) return 'b'; if (L && dy) return 'l'; if (Rr && dy) return 'r';
    if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return 'dentro';
    return null;
}

function ieCorteAplicar(doc = IE.doc, r = IE.corte && IE.corte.r) {
    if (!doc || !r || r.w < 1 || r.h < 1) return;
    if (r.x === 0 && r.y === 0 && r.w === doc.w && r.h === doc.h) { ieToast(ieT('Nada para cortar')); return; }
    ieRedimTela(doc, r.x, r.y, r.w, r.h, IE.op.corte.apagar);
    IE.corte = IE.ferr === 'corte' ? { r: ieRDoc(doc) } : null;
    ieHist(ieT('Cortar'));
}

// muda o tamanho da tela: tudo anda (-x, -y); com apagar, pixels fora são cortados
function ieRedimTela(doc, x, y, w, h, apagar) {
    iePercorrer(doc.camadas, L => {
        if (L.c && apagar && L.tipo === 'pixel') {
            const R = ieRInter(ieRPlano(L), { x, y, w, h });
            if (!R) { L.c = null; } else {
                const n = ieCanvas(R.w, R.h);
                ieCtx(n).drawImage(L.c, L.x - R.x, L.y - R.y);
                L.c = n; L.x = R.x; L.y = R.y;
            }
            L.sujoPx = true;
        }
        ieMoverCamada(L, -x, -y);
        L.movido = true;
    });
    doc.w = Math.round(w); doc.h = Math.round(h);
    ieFatiasTransformar?.(doc, [1, 0, 0, 1, -x, -y]);
    doc.comp = ieCanvas(doc.w, doc.h);
    doc.sel = null;
    doc.telaMudou = true;
    ieAjustarVista(doc);
    ieTudo(doc);
}

// ─────────────────────────── mão e zoom ───────────────────────────
const IE_MAO = {
    nome: 'Mão', tecla: 'H', icone: 'hand', cursor: 'grab',
    down(p, ev, doc) { IE.mao = { sx: p.sx, sy: p.sy, px: doc.px, py: doc.py }; },
    move(p, ev, doc) { const m = IE.mao; if (!m) return; doc.px = m.px + (p.sx - m.sx); doc.py = m.py + (p.sy - m.sy); ieDesenharVista(); ieDesenharSobre(); },
    up() { IE.mao = null; },
    dbl(p, ev, doc) { ieAjustarVista(doc); },
};
const IE_ZOOM = {
    nome: 'Zoom', tecla: 'Z', icone: 'zoom', cursor: ev => (ev && ev.altKey ? 'zoom-out' : 'zoom-in'),
    down(p, ev, doc) { IE.zm = { sx: p.sx, sy: p.sy, z0: doc.zoom, mov: false }; },
    move(p, ev, doc) {
        const z = IE.zm; if (!z) return;
        const d = p.sx - z.sx;
        if (Math.abs(d) > 3) z.mov = true;
        if (z.mov) ieZoomEm(z.z0 * Math.exp(d / 150), z.sx, z.sy);
    },
    up(p, ev, doc) {
        const z = IE.zm; IE.zm = null;
        if (z && !z.mov) ieZoomPasso(ev.altKey ? -1 : 1, p.sx, p.sy);
    },
    dbl(p, ev, doc) { ieZoomReal(1); },
};

// ferramenta Girar (R): arrastar gira as camadas selecionadas em volta do centro (entra na Transformação livre:
// Enter aplica, Esc cancela; Shift = de 15 em 15°). A barra de opções tem 90°, espelhar e ângulo exato.
const IE_GIRAR = {
    nome: 'Girar', tecla: 'R', icone: 'rotate', cursor: () => IE_CURSOR_GIRAR,
    down(p, ev, doc) {
        if (!IE.transf) ieTransfIniciar();
        const t = IE.transf;
        if (!t) return;
        t.arr = { h: 'girar', p0: p, s: { cx: t.cx, cy: t.cy, sx: t.sx, sy: t.sy, rot: t.rot } };
    },
};
// ─────────────────────────── registro ───────────────────────────
const IE_FERR = {
    mover: IE_MOVER,
    girar: IE_GIRAR,
    letreiro: IE_LETREIRO,
    laco: IE_LACO,
    varinha: IE_VARINHA,
    corte: IE_CORTE,
    contagotas: IE_CONTAGOTAS,
    carimbo: iePintor('carimbo', 'Carimbo', 'S', 'stamp'),
    pincel: iePintor('pincel', 'Pincel', 'B', 'brush'),
    borracha: iePintor('borracha', 'Borracha', 'E', 'eraser'),
    borrachaFundo: IE_BORRACHA_FUNDO,
    borrachaMagica: IE_BORRACHA_MAGICA,
    degrade: IE_DEGRADE,
    balde: IE_BALDE,
    texto: null,   // imagem-texto.js
    forma: IE_FORMA,
    mao: IE_MAO,
    zoom: IE_ZOOM,
};
const IE_FERR_ORDEM = ['mover', 'girar', 'letreiro', 'laco', 'varinha', 'corte', 'contagotas', '|', 'carimbo', 'pincel', 'borracha', 'borrachaFundo', 'borrachaMagica', 'degrade', 'balde', '|', 'texto', 'forma', '|', 'mao', 'zoom'];

function ieFerrCancelar() {
    IE.laco = null; IE.arr = null; IE.deg = null;
    if (IE.transf) ieTransfCancelar();
    ieDesenharSobre();
}

function ieEscolherFerr(nome) {
    if (!IE_FERR[nome]) return;
    if (IE.transf) ieTransfAplicar();
    ieTextoEncerrar?.(true);
    const antes = IE_FERR[IE.ferr];
    if (IE.ferr !== nome) { antes?.desativar?.(IE.doc); IE.laco = null; IE.arr = null; }
    IE.ferr = nome;
    IE_FERR[nome].ativar?.(IE.doc);
    ieUiFerr?.();
    ieOpcoesRender?.();
    ieDesenharSobre();
    ieCursor({});
}

// ─────────────────────────── matrizes (transformação) ───────────────────────────
// [a, b, c, d, e, f]: x' = a x + c y + e; y' = b x + d y + f (como o canvas)
function ieMatMul(m, n) {   // m depois de n
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
function ieMatInv(m) {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
const ieMatPt = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const IE_ID = [1, 0, 0, 1, 0, 0];

// plano transformado por M (px do documento): {c, x, y}
function ieTransformarPlano(o, M, fundo = 0) {
    if (!o || !o.c) return null;
    const w = o.c.width, h = o.c.height;
    const cs = [ieMatPt(M, o.x, o.y), ieMatPt(M, o.x + w, o.y), ieMatPt(M, o.x, o.y + h), ieMatPt(M, o.x + w, o.y + h)];
    const x1 = Math.floor(Math.min(...cs.map(p => p.x))), y1 = Math.floor(Math.min(...cs.map(p => p.y)));
    const x2 = Math.ceil(Math.max(...cs.map(p => p.x))), y2 = Math.ceil(Math.max(...cs.map(p => p.y)));
    if (x2 - x1 > 30000 || y2 - y1 > 30000) return null;
    const c = ieCanvas(x2 - x1, y2 - y1), x = ieCtx(c);
    if (fundo) { x.fillStyle = '#fff'; x.globalAlpha = fundo / 255; x.fillRect(0, 0, c.width, c.height); x.globalAlpha = 1; }
    x.imageSmoothingQuality = 'high';
    x.setTransform(M[0], M[1], M[2], M[3], M[4] - x1, M[5] - y1);
    let src = o.c, sw = w, sh = h;
    // redução grande: em passos (fica mais nítido que um drawImage só)
    const esc = Math.hypot(M[0], M[1]);
    if (esc < 0.5) {
        let k = 1;
        while (esc * k < 0.5 && sw / 2 >= 1 && sh / 2 >= 1) {
            const n = ieCanvas(Math.ceil(sw / 2), Math.ceil(sh / 2));
            const nx = ieCtx(n); nx.imageSmoothingQuality = 'high';
            nx.drawImage(src, 0, 0, sw, sh, 0, 0, n.width, n.height);
            src = n; sw = n.width; sh = n.height; k *= 2;
        }
        x.drawImage(src, 0, 0, sw, sh, o.x, o.y, w, h);
    } else {
        if (fundo) { x.save(); x.globalCompositeOperation = 'destination-out'; x.fillRect(o.x, o.y, w, h); x.restore(); }
        x.drawImage(src, o.x, o.y);
    }
    return { c, x: x1, y: y1 };
}

// ─────────────────────────── Transformação livre (Ctrl+T) ───────────────────────────
// estado: centro (cx, cy), escala (sx, sy), rotação (rad) aplicados à caixa original R0
function ieTransfMat(t) {
    const cx0 = t.R0.x + t.R0.w / 2, cy0 = t.R0.y + t.R0.h / 2;
    const cos = Math.cos(t.rot), sin = Math.sin(t.rot);
    // T(c) * R * S * T(-c0)
    const a = cos * t.sx, b = sin * t.sx, c = -sin * t.sy, d = cos * t.sy;
    return [a, b, c, d, t.cx - (a * cx0 + c * cy0), t.cy - (b * cx0 + d * cy0)];
}

async function ieTransfIniciar(M0) {
    const doc = IE.doc;
    if (!doc) return;
    if (IE.transf) return;
    ieTextoEncerrar?.(true);
    const sel = ieSelecionadas(doc);
    const alvos = [];
    const add = L => { if (L.tipo === 'grupo') L.filhos.forEach(add); else if (ieRaster0(L)) alvos.push(L); };
    sel.forEach(add);
    if (!alvos.length) { ieToast(ieT('Selecione uma camada com pixels')); return; }
    if (alvos.some(L => L.travas & 4 || L.travas & 0x80000000)) { ieToast(ieT('Camada com posição travada')); return; }
    if (alvos.some(L => L.tipo === 'preenchimento')) { ieToast(ieT('Camada de preenchimento não se transforma')); return; }
    // texto do PSD ainda não editado: vira texto do editor para ser redesenhado nítido em qualquer escala (como no
    // Photoshop). Só se a fonte está instalada e o texto tem um estilo só; senão continua esticando os pixels.
    const prep = alvos.filter(L => L.tipo === 'texto' && !L.txt && L.texto && !L._txtVetor && !L._txtSemVetor).map(async L => {
        const t = await ieTextoDoPsd(L, true);
        if (t && !t.semFonte && !t.misto && IE.fontesOk.has(t.css)) L._txtVetor = t; else L._txtSemVetor = true;
    });
    if (M0 && prep.length) await Promise.all(prep);
    // seleção numa camada de pixels: transforma só o recorte (vira a camada flutuante)
    let R0 = null;
    for (const L of alvos) {
        const o = L.c0 ? null : L;
        const b = o && o.c ? ieLimites(o.c, o.x, o.y) : (L.c ? { x: L.x, y: L.y, w: L.c.width, h: L.c.height } : null);
        R0 = ieRUniao(R0, b);
    }
    if (!R0) { ieToast(ieT('A camada está vazia')); return; }
    const t = {
        alvos, R0, cx: R0.x + R0.w / 2, cy: R0.y + R0.h / 2, sx: 1, sy: 1, rot: 0,
        orig: alvos.map(L => ({ L, c: L.c, x: L.x, y: L.y, m: L.m ? { ...L.m } : null, tf: L.tf ? [...L.tf] : null, Rantes: ieRCamada(L) })),
    };
    IE.transf = t;
    doc._esconderSel = true;
    if (M0) { ieTransfDeMat(t, M0); ieTransfPrevia(); ieTransfAplicar(); return; }
    ieTransfPrevia();
    ieOpcoesRender?.();
}
function ieTransfDeMat(t, M) {
    // decompõe M (sem cisalhamento) em escala/rotação/centro
    const cx0 = t.R0.x + t.R0.w / 2, cy0 = t.R0.y + t.R0.h / 2;
    const sx = Math.hypot(M[0], M[1]), rot = Math.atan2(M[1], M[0]);
    const det = M[0] * M[3] - M[1] * M[2];
    const sy = det / sx;
    const c = ieMatPt(M, cx0, cy0);
    Object.assign(t, { sx, sy, rot, cx: c.x, cy: c.y });
}

function ieTransfPrevia() {
    const t = IE.transf, doc = IE.doc;
    if (!t) return;
    const M = ieTransfMat(t);
    let R = null;
    for (const o of t.orig) {
        const L = o.L;
        R = ieRUniao(R, o.Rantes);
        const txt = L.tipo === 'texto' && (L.txt || L._txtVetor);
        if (txt) {   // texto: redesenhado com a fonte na escala nova (nítido), não esticado
            const tmp = { txt: { ...txt, m: ieMatMul(M, txt.m || IE_ID) } };
            ieTextoRender(tmp);
            L._tfPrev = tmp.c ? { c: tmp.c, x: tmp.x, y: tmp.y } : null;
        } else if (L.c0) {
            const tf = ieMatMul(M, o.tf || IE_ID);
            L._tfPrev = (L.filtrosInt || []).length ? ieIntPlano(L, tf) : ieTransformarPlano({ c: L.c0.c, x: L.c0.x, y: L.c0.y }, tf);
        } else L._tfPrev = ieTransformarPlano({ c: o.c, x: o.x, y: o.y }, M);
        L._raster = null;
        if (L._tfPrev) R = ieRUniao(R, ieRCamada(L));
    }
    ieAgendar(ieRUniao(R, t.Rult), doc);
    t.Rult = R;
}

function ieTransfAplicar() {
    const t = IE.transf, doc = IE.doc;
    if (!t) return;
    IE.transf = null;
    doc._esconderSel = false;
    const M = ieTransfMat(t);
    const ident = Math.abs(M[0] - 1) < 1e-9 && Math.abs(M[3] - 1) < 1e-9 && !M[1] && !M[2] && !M[4] && !M[5];
    let R = t.Rult;
    for (const o of t.orig) {
        const L = o.L;
        const prev = L._tfPrev;
        L._tfPrev = null;
        if (ident) continue;
        if (L.tf) L.tf = ieMatMul(M, o.tf || IE_ID);
        if (prev) { L.c = prev.c; L.x = prev.x; L.y = prev.y; }
        if (!L.txt && L._txtVetor) { L.txt = L._txtVetor; delete L.c0; }   // a partir daqui a tela mostra o texto desenhado aqui
        delete L._txtVetor;
        if (L.txt) L.txt.m = ieMatMul(M, L.txt.m || IE_ID);
        if (L.m && L.m.c) {
            const n = ieTransformarPlano(L.m, M, L.m.fundo || 0);
            if (n) { L.m = { ...L.m, ...n }; L.sujoM = true; }
        } else if (L.m) { const p = ieMatPt(M, L.m.x, L.m.y); L.m = { ...L.m, x: Math.round(p.x), y: Math.round(p.y) }; }
        L.sujoPx = true;
        L.movido = true;
        ieInvalidar(L);
        if (L.txt && typeof ieTextoRender === 'function') ieTextoRender(L);
        R = ieRUniao(R, ieRCamada(L));
    }
    ieAgendar(R, doc);
    if (!ident) { IE.ultimaTransf = M; ieHist(ieT('Transformação livre')); }   // Transformar de novo (Shift+Ctrl+T)
    ieOpcoesRender?.();
    ieDesenharSobre();
}

function ieTransfCancelar() {
    const t = IE.transf, doc = IE.doc;
    if (!t) return;
    IE.transf = null;
    doc._esconderSel = false;
    for (const o of t.orig) { o.L._tfPrev = null; ieInvalidar(o.L); }
    ieAgendar(t.Rult, doc);
    ieOpcoesRender?.();
    ieDesenharSobre();
}

function ieTransfCantos(t) {
    const M = ieTransfMat(t), r = t.R0;
    return {
        tl: ieMatPt(M, r.x, r.y), t: ieMatPt(M, r.x + r.w / 2, r.y), tr: ieMatPt(M, r.x + r.w, r.y), r: ieMatPt(M, r.x + r.w, r.y + r.h / 2),
        br: ieMatPt(M, r.x + r.w, r.y + r.h), b: ieMatPt(M, r.x + r.w / 2, r.y + r.h), bl: ieMatPt(M, r.x, r.y + r.h), l: ieMatPt(M, r.x, r.y + r.h / 2),
    };
}
function ieTransfSobre(ctx, doc) {
    const t = IE.transf;
    if (!t) return;
    const k = ieTransfCantos(t);
    const s = q => ieDocTela(q.x, q.y, doc);
    ctx.save();
    ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 1;
    ctx.beginPath();
    ['tl', 'tr', 'br', 'bl'].forEach((n, i) => { const q = s(k[n]); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.closePath(); ctx.stroke();
    ieAlcasDesenhar(ctx, Object.values(k).map(q => { const a = s(q); return [a.x, a.y]; }));
    const c = s({ x: t.cx, y: t.cy });
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.moveTo(c.x - 7, c.y); ctx.lineTo(c.x + 7, c.y); ctx.moveTo(c.x, c.y - 7); ctx.lineTo(c.x, c.y + 7); ctx.stroke();
    ctx.restore();
}
function ieTransfAlca(t, p, doc) {
    const k = ieTransfCantos(t), tol = 8 / doc.zoom;
    for (const n of ['tl', 'tr', 'br', 'bl', 't', 'r', 'b', 'l']) if (Math.hypot(k[n].x - p.x, k[n].y - p.y) <= tol) return n;
    // dentro da caixa (em coordenadas locais)
    const Mi = ieMatInv(ieTransfMat(t)), q = ieMatPt(Mi, p.x, p.y), r = t.R0;
    if (q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h) return 'dentro';
    // perto dos cantos por fora = girar
    for (const n of ['tl', 'tr', 'br', 'bl']) if (Math.hypot(k[n].x - p.x, k[n].y - p.y) <= tol * 4) return 'girar';
    return 'girar';
}

const IE_TRANSF = {
    down(p, ev, doc) {
        const t = IE.transf;
        const h = IE.ferr === 'girar' ? 'girar' : ieTransfAlca(t, p, doc);   // ferramenta Girar: arrastar em qualquer lugar gira
        t.arr = { h, p0: p, s: { cx: t.cx, cy: t.cy, sx: t.sx, sy: t.sy, rot: t.rot } };
    },
    move(p, ev, doc) {
        const t = IE.transf, a = t && t.arr;
        if (!a) return;
        const s = a.s;
        if (a.h === 'dentro') { t.cx = s.cx + p.x - a.p0.x; t.cy = s.cy + p.y - a.p0.y; }
        else if (a.h === 'girar') {
            const a0 = Math.atan2(a.p0.y - s.cy, a.p0.x - s.cx), a1 = Math.atan2(p.y - s.cy, p.x - s.cx);
            let r = s.rot + a1 - a0;
            if (ev.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
            t.rot = r;
        } else {
            // escala: em coordenadas locais (sem rotação), âncora no lado oposto (Alt = no centro)
            const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
            const loc = q => ({ x: (q.x - s.cx) * cos + (q.y - s.cy) * sin, y: -(q.x - s.cx) * sin + (q.y - s.cy) * cos });
            const u = loc(p);
            const hw = t.R0.w / 2 * s.sx, hh = t.R0.h / 2 * s.sy;
            const sxk = a.h.includes('l') ? -1 : a.h.includes('r') ? 1 : 0;
            const syk = a.h.includes('t') ? -1 : a.h.includes('b') ? 1 : 0;
            const centro = ev.altKey;
            let nhw = hw, nhh = hh, ncx = 0, ncy = 0;
            if (sxk) {
                const anc = centro ? 0 : -sxk * hw;
                nhw = (u.x - anc) / 2 * sxk * (centro ? 2 : 1);
                ncx = centro ? 0 : (u.x + anc) / 2;
            }
            if (syk) {
                const anc = centro ? 0 : -syk * hh;
                nhh = (u.y - anc) / 2 * syk * (centro ? 2 : 1);
                ncy = centro ? 0 : (u.y + anc) / 2;
            }
            // cantos: proporcional (Shift solta)
            if (sxk && syk && !ev.shiftKey) {
                const k = Math.max(Math.abs(nhw / (hw || 1)), Math.abs(nhh / (hh || 1)));
                const nw2 = Math.sign(nhw || 1) * Math.abs(hw) * k, nh2 = Math.sign(nhh || 1) * Math.abs(hh) * k;
                if (!centro) { ncx = -sxk * hw + sxk * nw2; ncy = -syk * hh + syk * nh2; }
                nhw = nw2; nhh = nh2;
            }
            t.sx = (nhw / (t.R0.w / 2)) || 0.001;
            t.sy = (nhh / (t.R0.h / 2)) || 0.001;
            if (!sxk) ncx = 0;
            if (!syk) ncy = 0;
            t.cx = s.cx + ncx * cos - ncy * sin;
            t.cy = s.cy + ncx * sin + ncy * cos;
        }
        ieTransfPrevia();
        ieOpcoesRender?.(true);
    },
    up() { if (IE.transf) IE.transf.arr = null; },
    dbl() { ieTransfAplicar(); },
    cursor(ev) {
        const t = IE.transf, doc = IE.doc;
        if (!t || !IE.mouse) return 'default';
        const h = t.arr ? t.arr.h : ieTransfAlca(t, IE.mouse, doc);
        if (IE.ferr === 'girar') return IE_CURSOR_GIRAR;
        if (h === 'dentro') return 'move';
        if (h === 'girar') return IE_CURSOR_GIRAR;
        return ['tl', 'br'].includes(h) ? 'nwse-resize' : ['tr', 'bl'].includes(h) ? 'nesw-resize' : ['t', 'b'].includes(h) ? 'ns-resize' : 'ew-resize';
    },
};

// girar as camadas selecionadas um ângulo exato (°, + = horário), em volta do centro — prévia na Transformação livre
function ieGirarAngulo(graus) {
    if (!graus || !IE.doc) return;
    if (!IE.transf) ieTransfIniciar();
    const t = IE.transf;
    if (!t) return;
    t.rot += graus * Math.PI / 180;
    ieTransfPrevia(); ieOpcoesRender?.(true); ieDesenharSobre();
}

// girar/inverter a camada (Editar > Transformar)
function ieTransfRapida(tipo) {
    const doc = IE.doc;
    if (!doc) return;
    const R = ieSelecionadas(doc).reduce((R, L) => ieRUniao(R, L.tipo === 'grupo' ? ieRCamada(L) : (L.c ? ieRPlano(L) : null)), null);
    if (!R) return;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    const em = m => ieMatMul([1, 0, 0, 1, cx, cy], ieMatMul(m, [1, 0, 0, 1, -cx, -cy]));
    const M = { g180: em([-1, 0, 0, -1, 0, 0]), g90h: em([0, 1, -1, 0, 0, 0]), g90a: em([0, -1, 1, 0, 0, 0]), fh: em([-1, 0, 0, 1, 0, 0]), fv: em([1, 0, 0, -1, 0, 0]) }[tipo];
    ieTransfIniciar(M);
}
