// =========================================================
// Editor de Imagem — ferramentas de recuperação (J) e Laço magnético, como no Photoshop.
// Pincel de recuperação para manchas: pinta por cima da mancha e solta → "Sensível ao conteúdo" reconstrói pela
//   vizinhança; "Correspondência por proximidade" escolhe sozinho o melhor pedaço ao redor e cura com ele.
// Pincel de recuperação: Alt+clique define a origem (como o Carimbo); pinta e, ao soltar, a textura da origem entra
//   com a luz/cor do destino (clonagem de Poisson). Alinhado: a origem acompanha o pincel.
// Remendo: sem seleção, arrastar desenha a seleção (como o Laço); com seleção, arrastar de dentro dela até a área boa e
//   soltar. Origem = a seleção recebe o que está onde soltou; Destino = o que está na seleção vai para onde soltou.
//   Sensível ao conteúdo = só reconstrói a seleção pela vizinhança. Difusão (0-7) amacia a borda.
// Laço magnético: clique e só mova o mouse — o traço gruda na borda mais forte dentro da Largura; clique fixa pontos,
//   Backspace desfaz o último, duplo clique / Enter / clicar no início fecha.
// O cálculo pesado fica em Functions/recuperar.py (OpenCV). Vale na camada de pixels ativa.
// =========================================================

Object.assign(IE.op, {
    recManchas: { tam: 40, tipo: 'conteudo' },
    recPincel: { tam: 40, alinhado: true },
    remendo: { modo: 'normal', sentido: 'origem', difusao: 3 },
    lacoMag: { largura: 10, freq: 40, suav: 0 },
});
Object.assign(IE_ICONES, {
    heal: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M10 12h.01M12 10h.01M14 12h.01M12 14h.01"/>',
    spot: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><circle cx="18" cy="5" r="2.5" stroke-dasharray="2 1.5"/>',
    patch: '<path d="M4 7c2-3 7-3 9 0s7 3 7 6-3 6-8 5-9 0-9-4 0-5 1-7z" stroke-dasharray="3 2"/>',
    lassoMag: '<path d="M7 17c-3-1-4-4-3-7 2-5 12-7 15-3 2 3-1 7-6 8"/><path d="M13 15l2 6 2-2 2 2"/>',
});

// ─────────────────────────── núcleo: mandar o trecho para o Python e pôr o resultado na camada ───────────────────────────
async function ieRecCamada(doc) {
    const L = ieAtiva(doc);
    if (!(await iePodePintar(L, 'recuperar'))) return null;
    if (!L.c) { ieToast(ieT('A camada está vazia')); return null; }
    return L;
}
// mascara: canvas do tamanho do documento (alfa = onde mexer). modo 'curar' (com dx, dy = origem − destino) ou 'preencher'
async function ieRecAplicar(doc, L, mascara, { modo, dx = 0, dy = 0, difusao = 0, nome }) {
    const api = ieApi(), b = ieLimites(mascara);
    if (!b || !api) return false;
    const mg = Math.max(24, Math.round(Math.max(b.w, b.h) * 0.25));
    let R = { x: b.x - mg, y: b.y - mg, w: b.w + 2 * mg, h: b.h + 2 * mg };
    if (modo === 'curar') R = ieRUniao(R, { x: b.x + dx - mg, y: b.y + dy - mg, w: b.w + 2 * mg, h: b.h + 2 * mg });
    R = ieRInter(ieRInt(R), ieRDoc(doc));
    if (!R) return false;
    const R0 = ieRCamada(L);
    ieGravavel(L); ieCrescer(L, R, 0);
    const reg = ieCanvas(R.w, R.h); ieCtx(reg).drawImage(L.c, L.x - R.x, L.y - R.y);
    const m = ieCanvas(R.w, R.h); ieCtx(m).drawImage(mascara, -R.x, -R.y);
    ieCarregando(ieT(modo === 'curar' ? 'Recuperando...' : 'Preenchendo pelo conteúdo...'), 50);
    let r;
    try {
        const a = reg.toDataURL('image/png'), mm = m.toDataURL('image/png');
        r = modo === 'curar' ? await api.ie_curar(a, mm, Math.round(dx), Math.round(dy), difusao) : await api.ie_preencher_conteudo(a, mm, 6);
    } finally { ieCarregando(false); }
    if (!r || !r.success) { ieToast(`${ieT('Não recuperou')}: ${(r && r.error) || ''}`); return false; }
    const im = new Image(); im.src = 'data:image/png;base64,' + r.png; await im.decode();
    const x = ieCtx(L.c);
    x.clearRect(R.x - L.x, R.y - L.y, R.w, R.h); x.drawImage(im, R.x - L.x, R.y - L.y);
    L.sujoPx = true;
    ieCamadaMudou(L, ieRUniao(R0, R));
    ieHist(ieT(nome));
    return true;
}
// pincel de máscara (o traço que diz onde recuperar), desenhado por cima em cinza translúcido
function ieRecTraco(p, tam, novo) {
    const doc = IE.doc;
    if (novo) IE.recTraco = { c: ieCanvas(doc.w, doc.h), ult: null, pts: [] };
    const t = IE.recTraco, x = ieCtx(t.c);
    x.strokeStyle = x.fillStyle = '#fff'; x.lineCap = x.lineJoin = 'round'; x.lineWidth = tam;
    x.beginPath();
    if (t.ult) { x.moveTo(t.ult.x, t.ult.y); x.lineTo(p.x, p.y); x.stroke(); } else { x.arc(p.x, p.y, tam / 2, 0, Math.PI * 2); x.fill(); }
    t.ult = { x: p.x, y: p.y }; t.pts.push(t.ult);
    ieDesenharSobre();
}
function ieRecSobre(ctx, doc, tam) {
    const t = IE.recTraco;
    if (t) {
        ctx.save(); ctx.globalAlpha = 0.45;
        const s = ieDocTela(0, 0, doc);
        ctx.drawImage(t.c, s.x, s.y, doc.w * doc.zoom, doc.h * doc.zoom);
        ctx.restore();
    }
    if (IE.mouse && tam) {   // contorno do pincel
        const s = ieDocTela(IE.mouse.x, IE.mouse.y, doc);
        ctx.save(); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, tam / 2 * doc.zoom, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#000'; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.restore();
    }
}
// Correspondência por proximidade: entre 8 direções em volta, o pedaço cuja borda mais parece com a borda da mancha
function ieRecProximidade(doc, L, mascara) {
    const b = ieLimites(mascara);
    const d = Math.max(b.w, b.h) * 1.2 + 6;
    const amostra = (ox, oy) => {
        const w = b.w + 8, h = b.h + 8, c = ieCanvas(w, h), x = ieCtx(c);
        x.drawImage(L.c, L.x - (b.x - 4 + ox), L.y - (b.y - 4 + oy));
        return x.getImageData(0, 0, w, h).data;
    };
    const base = amostra(0, 0), w = b.w + 8, h = b.h + 8;
    let melhor = null;
    for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4, ox = Math.round(Math.cos(a) * d), oy = Math.round(Math.sin(a) * d);
        if (b.x + ox < 0 || b.y + oy < 0 || b.x + b.w + ox > doc.w || b.y + b.h + oy > doc.h) continue;
        const s = amostra(ox, oy);
        let e = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (x > 3 && y > 3 && x < w - 4 && y < h - 4) continue;   // só a moldura em volta
            const i = (y * w + x) * 4;
            e += Math.abs(s[i] - base[i]) + Math.abs(s[i + 1] - base[i + 1]) + Math.abs(s[i + 2] - base[i + 2]);
        }
        if (!melhor || e < melhor.e) melhor = { e, ox, oy };
    }
    return melhor;
}

// ─────────────────────────── Pincel de recuperação para manchas ───────────────────────────
const IE_REC_MANCHAS = {
    nome: 'Pincel de recuperação para manchas', tecla: 'J', icone: 'spot', cursor: 'none',
    down(p) { ieRecTraco(p, IE.op.recManchas.tam, true); },
    move(p) { if (IE.recTraco) ieRecTraco(p, IE.op.recManchas.tam); },
    async up(p, ev, doc) {
        const t = IE.recTraco; if (!t) return;
        const L = await ieRecCamada(doc);
        if (L) {
            if (IE.op.recManchas.tipo === 'proximidade') {
                const m = ieRecProximidade(doc, L, t.c);
                if (m) await ieRecAplicar(doc, L, t.c, { modo: 'curar', dx: m.ox, dy: m.oy, difusao: 2, nome: 'Pincel de recuperação para manchas' });
                else await ieRecAplicar(doc, L, t.c, { modo: 'preencher', nome: 'Pincel de recuperação para manchas' });
            } else await ieRecAplicar(doc, L, t.c, { modo: 'preencher', nome: 'Pincel de recuperação para manchas' });
        }
        IE.recTraco = null; ieDesenharSobre();
    },
    hover() { ieDesenharSobre(); },
    sobre(ctx, doc) { ieRecSobre(ctx, doc, IE.op.recManchas.tam); },
};

// ─────────────────────────── Pincel de recuperação ───────────────────────────
const IE_REC_PINCEL = {
    nome: 'Pincel de recuperação', tecla: 'J', icone: 'heal', cursor: 'none',
    down(p, ev) {
        if (ev.altKey) { IE.recFonte = { x: p.x, y: p.y }; IE.recOff = null; ieToast(ieT('Origem definida')); return; }
        if (!IE.recFonte) { ieToast(ieT('Alt+clique para escolher de onde tirar a textura')); return; }
        if (!IE.op.recPincel.alinhado || !IE.recOff) IE.recOff = { x: IE.recFonte.x - p.x, y: IE.recFonte.y - p.y };
        ieRecTraco(p, IE.op.recPincel.tam, true);
    },
    move(p) { if (IE.recTraco) ieRecTraco(p, IE.op.recPincel.tam); },
    async up(p, ev, doc) {
        const t = IE.recTraco; if (!t) return;
        const L = await ieRecCamada(doc);
        if (L) await ieRecAplicar(doc, L, t.c, { modo: 'curar', dx: IE.recOff.x, dy: IE.recOff.y, difusao: 1, nome: 'Pincel de recuperação' });
        IE.recTraco = null; ieDesenharSobre();
    },
    hover() { ieDesenharSobre(); },
    sobre(ctx, doc) {
        ieRecSobre(ctx, doc, IE.op.recPincel.tam);
        if (IE.recFonte && IE.mouse) {   // mira na origem
            const off = IE.recOff && IE.recTraco ? IE.recOff : null;
            const q = off ? { x: IE.mouse.x + off.x, y: IE.mouse.y + off.y } : IE.recFonte, s = ieDocTela(q.x, q.y, doc);
            ctx.save(); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(s.x - 8, s.y); ctx.lineTo(s.x + 8, s.y); ctx.moveTo(s.x, s.y - 8); ctx.lineTo(s.x, s.y + 8); ctx.stroke(); ctx.restore();
        }
    },
};

// ─────────────────────────── Remendo ───────────────────────────
const IE_REMENDO = {
    nome: 'Remendo', tecla: 'J', icone: 'patch', cursor: 'crosshair',
    down(p, ev, doc) {
        if (doc.sel && ieSelDentro(doc, p) && !ev.shiftKey && !ev.altKey) { IE.remendo = { p0: { x: p.x, y: p.y }, dx: 0, dy: 0 }; return; }
        IE.laco = { pts: [{ x: p.x, y: p.y }], op: ieOpSel(ev) };   // sem seleção (ou Shift/Alt): desenha como o Laço
    },
    move(p, ev, doc) {
        const r = IE.remendo;
        if (r) { r.dx = p.x - r.p0.x; r.dy = p.y - r.p0.y; doc._selDx = Math.round(r.dx); doc._selDy = Math.round(r.dy); ieDesenharSobre(); return; }
        IE_LACO.move(p);
    },
    async up(p, ev, doc) {
        const r = IE.remendo;
        if (!r) { if (IE.laco) ieLacoFechar(doc); return; }
        IE.remendo = null; doc._selDx = doc._selDy = 0;
        const o = IE.op.remendo, L = await ieRecCamada(doc);
        if (!L) { ieDesenharSobre(); return; }
        const dx = Math.round(r.dx), dy = Math.round(r.dy);
        if (o.modo === 'conteudo' && Math.hypot(dx, dy) < 2) { await ieRecAplicar(doc, L, doc.sel.c, { modo: 'preencher', nome: 'Remendo' }); return; }
        if (Math.hypot(dx, dy) < 2) { ieDesenharSobre(); return; }
        if (o.sentido === 'destino') {   // o conteúdo da seleção vai para onde soltou
            const m = ieCanvas(doc.w, doc.h); ieCtx(m).drawImage(doc.sel.c, dx, dy);
            await ieRecAplicar(doc, L, m, { modo: 'curar', dx: -dx, dy: -dy, difusao: o.difusao, nome: 'Remendo' });
        } else await ieRecAplicar(doc, L, doc.sel.c, { modo: 'curar', dx, dy, difusao: o.difusao, nome: 'Remendo' });
    },
    sobre(ctx, doc) { IE_LACO.sobre(ctx, doc); },
};

// ─────────────────────────── Laço magnético ───────────────────────────
function ieLacoMagSegmento(doc, de, ate) {   // pontos do último fixo até o mouse, cada um puxado para a borda
    const o = IE.op.lacoMag, L = Math.hypot(ate.x - de.x, ate.y - de.y), n = Math.max(1, Math.ceil(L / 3)), out = [];
    for (let k = 1; k <= n; k++) {
        const q = { x: de.x + (ate.x - de.x) * k / n, y: de.y + (ate.y - de.y) * k / n };
        const b = ieDemBorda(doc, q, o.largura);
        out.push({ x: b[0], y: b[1] });
    }
    return out;
}
function ieLacoMagFechar(doc) {
    const l = IE.lacoMag; IE.lacoMag = null;
    if (!l) return;
    const pts = [...l.pts, ...l.prov];
    if (pts.length < 3) { ieDesenharSobre(); return; }
    ieSelAplicar(doc, x => { x.beginPath(); pts.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y))); x.closePath(); x.fill(); }, l.op, null, IE.op.lacoMag.suav);
    ieHist(ieT('Laço magnético'));
}
const IE_LACO_MAG = {
    nome: 'Laço magnético', tecla: 'L', icone: 'lassoMag', cursor: 'crosshair',
    down(p, ev, doc) {
        const l = IE.lacoMag;
        if (!l) { const b = ieDemBorda(doc, p, IE.op.lacoMag.largura); IE.lacoMag = { pts: [{ x: b[0], y: b[1] }], fixos: [0], prov: [], op: ieOpSel(ev) }; return; }
        const q = l.pts[0];
        if (l.pts.length > 2 && Math.hypot((q.x - p.x) * doc.zoom, (q.y - p.y) * doc.zoom) < 10) { ieLacoMagFechar(doc); return; }
        l.pts.push(...l.prov); l.prov = []; l.fixos.push(l.pts.length - 1);
    },
    hover(p, ev, doc) {
        const l = IE.lacoMag; if (!l) return;
        l.prov = ieLacoMagSegmento(doc, l.pts[l.pts.length - 1], p);
        // ponto automático (Frequência): o trecho comprido vira fixo, como no Photoshop
        let comp = 0; for (let i = 1; i < l.prov.length; i++) comp += Math.hypot(l.prov[i].x - l.prov[i - 1].x, l.prov[i].y - l.prov[i - 1].y);
        if (comp > IE.op.lacoMag.freq * 2) { const meio = l.prov.splice(0, Math.floor(l.prov.length / 2)); l.pts.push(...meio); l.fixos.push(l.pts.length - 1); }
        ieDesenharSobre();
    },
    move(p, ev, doc) { this.hover(p, ev, doc); },
    dbl(p, ev, doc) { ieLacoMagFechar(doc); },
    sobre(ctx, doc) {
        const l = IE.lacoMag; if (!l) return;
        const pts = [...l.pts, ...l.prov];
        ctx.save(); ctx.lineWidth = 1;
        for (const [cor, dash] of [['#fff', []], ['#000', [4, 4]]]) {
            ctx.strokeStyle = cor; ctx.setLineDash(dash); ctx.beginPath();
            pts.forEach((q, i) => { const s = ieDocTela(q.x, q.y, doc); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.stroke();
        }
        ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
        for (const i of l.fixos) { const s = ieDocTela(l.pts[i].x, l.pts[i].y, doc); ctx.fillRect(s.x - 2, s.y - 2, 5, 5); ctx.strokeRect(s.x - 2.5, s.y - 2.5, 5, 5); }
        ctx.restore();
    },
};
document.addEventListener('keydown', ev => {
    const doc = IE.doc;
    if (!doc || IE.ferr !== 'lacoMag' || !IE.lacoMag || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); ieLacoMagFechar(doc); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); IE.lacoMag = null; ieDesenharSobre(); }
    else if (ev.key === 'Backspace' || ev.key === 'Delete') {
        ev.preventDefault(); ev.stopPropagation();
        const l = IE.lacoMag; if (l.fixos.length > 1) { l.fixos.pop(); l.pts.length = l.fixos[l.fixos.length - 1] + 1; l.prov = []; ieDesenharSobre(); }
    }
}, true);

// ─────────────────────────── registro e barra de opções ───────────────────────────
Object.assign(IE_FERR, { recManchas: IE_REC_MANCHAS, recPincel: IE_REC_PINCEL, remendo: IE_REMENDO, lacoMag: IE_LACO_MAG });
{
    const i = IE_FERR_ORDEM.indexOf('carimbo');
    IE_FERR_ORDEM.splice(i, 0, 'recManchas', 'recPincel', 'remendo');
    IE_FERR_ORDEM.splice(IE_FERR_ORDEM.indexOf('laco') + 1, 0, 'lacoMag');
    if (typeof IE_FERR_GRUPOS !== 'undefined') {
        const c = IE_FERR_GRUPOS.findIndex(g => Array.isArray(g) && g[0] === 'contagotas');
        IE_FERR_GRUPOS.splice(c + 1, 0, ['recManchas', 'recPincel', 'remendo']);
        const l = IE_FERR_GRUPOS.find(g => Array.isArray(g) && g[0] === 'laco');
        if (l) l.push('lacoMag');
    }
}
(window.IE_OPCOES_EXTRA = window.IE_OPCOES_EXTRA || []).push(f => {
    if (f === 'recManchas') return ieNum('Tamanho', 'tam', 'recManchas', 1, 1000, 1, ' px') +
        ieSegm('tipo', 'recManchas', [['conteudo', 'Sensível ao conteúdo'], ['proximidade', 'Correspondência por proximidade']]) +
        `<span class="ie-op-dica">${ieT('Pinte por cima da mancha e solte')}</span>`;
    if (f === 'recPincel') return ieNum('Tamanho', 'tam', 'recPincel', 1, 1000, 1, ' px') + ieChk('Alinhado', 'alinhado', 'recPincel') +
        `<span class="ie-op-dica">${ieT('Alt+clique: origem · pinte e solte: a textura da origem com a luz do destino')}</span>`;
    if (f === 'remendo') return ieSegm('modo', 'remendo', [['normal', 'Normal'], ['conteudo', 'Sensível ao conteúdo']]) +
        (IE.op.remendo.modo === 'normal' ? ieSegm('sentido', 'remendo', [['origem', 'Origem'], ['destino', 'Destino']]) : '') +
        ieNum('Difusão', 'difusao', 'remendo', 0, 7, 1) +
        `<span class="ie-op-dica">${ieT(IE.op.remendo.modo === 'normal' ? 'Selecione a área (arrastar desenha) e arraste de dentro dela até a área boa' : 'Selecione e clique dentro: reconstrói pela vizinhança')}</span>`;
    if (f === 'lacoMag') return ieNum('Largura', 'largura', 'lacoMag', 1, 64, 1, ' px') + ieNum('Frequência', 'freq', 'lacoMag', 5, 200, 1) + ieNum('Suavizar', 'suav', 'lacoMag', 0, 250, 1, ' px') +
        `<span class="ie-op-dica">${ieT('Clique e mova pela borda · clique fixa um ponto · Backspace desfaz · duplo clique ou Enter fecha')}</span>`;
    return '';
});
