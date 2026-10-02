// =========================================================
// Editor de Imagem — texto.
// L.txt = {s, fam, gdi (família CSS/GDI), neg, ital, peso, ps (nome PostScript), tam, cor, alin, esp (milésimos de
// eme), ent (entrelinha em px; 0 = automática 120%), caixa: null | [esq, topo, dir, base] (texto de parágrafo), m}
// m = matriz do espaço do texto para o documento; a origem é a linha de base da 1ª linha no ponto de alinhamento
// (texto de ponto), como no Photoshop. Texto vindo do PSD: até ser editado mostra os pixels do Photoshop; editado,
// o Python troca o conteúdo da camada de texto (continua texto no Photoshop, com o estilo do começo).
// =========================================================

const IE_NL = String.fromCharCode(10);

function ieFonteCss(t, tam = t.tam) {
    return `${t.ital ? 'italic ' : ''}${t.neg ? 'bold' : (t.peso && !t.gdi ? t.peso : 'normal')} ${Math.max(0.5, tam)}px "${t.gdi || t.fam || 'Arial'}", sans-serif`;
}

let ieMedidor = null;
function ieMedir(t) {
    if (!ieMedidor) ieMedidor = ieCtx(ieCanvas(4, 4));
    const x = ieMedidor;
    x.font = ieFonteCss(t);
    x.letterSpacing = (t.esp || 0) / 1000 * t.tam + 'px';
    return x;
}

// linhas com posição no espaço do texto: [{s, x, y (linha de base), w}]
function ieTextoLayout(t) {
    const x = ieMedir(t);
    const adv = t.ent > 0 ? t.ent : t.tam * 1.2;
    const txt = t.caixaAlta ? String(t.s || '').toUpperCase() : String(t.s || '');
    let linhas = [];
    if (t.caixa) {
        const larg = t.caixa[2] - t.caixa[0];
        txt.split(IE_NL).forEach(par => {
            let atual = '';
            par.split(' ').forEach(p => {
                const tenta = atual ? atual + ' ' + p : p;
                if (atual && x.measureText(tenta).width > larg) { linhas.push(atual); atual = p; } else atual = tenta;
            });
            linhas.push(atual);
        });
    } else linhas = txt.split(IE_NL);
    const m0 = x.measureText('Hg');
    const asc = m0.fontBoundingBoxAscent || t.tam * 0.8;
    const base0 = t.caixa ? t.caixa[1] + asc : 0;
    return linhas.map((s, i) => {
        const w = x.measureText(s).width;
        let lx;
        if (t.caixa) lx = t.alin === 'center' ? (t.caixa[0] + t.caixa[2]) / 2 - w / 2 : t.alin === 'right' ? t.caixa[2] - w : t.caixa[0];
        else lx = t.alin === 'center' ? -w / 2 : t.alin === 'right' ? -w : 0;
        return { s, x: lx, y: base0 + i * adv, w };
    });
}

function ieTextoCaixaLocal(t, linhas = ieTextoLayout(t)) {
    const x = ieMedir(t);
    const m0 = x.measureText('Hg');
    const asc = Math.max(m0.fontBoundingBoxAscent || 0, m0.actualBoundingBoxAscent || 0, t.tam * 0.8);
    const desc = Math.max(m0.fontBoundingBoxDescent || 0, m0.actualBoundingBoxDescent || 0, t.tam * 0.25);
    let R = null;
    for (const l of linhas) {
        const mt = x.measureText(l.s || ' ');
        const esq = Math.min(0, -(mt.actualBoundingBoxLeft || 0)), dir = Math.max(l.w, mt.actualBoundingBoxRight || 0);
        R = ieRUniao(R, { x: l.x + esq - t.tam * 0.1, y: l.y - asc, w: dir - esq + t.tam * 0.25, h: asc + desc });
    }
    if (t.caixa) R = ieRUniao(R, { x: t.caixa[0], y: t.caixa[1], w: t.caixa[2] - t.caixa[0], h: 1 });
    return R || { x: 0, y: -asc, w: 1, h: asc + desc };
}

// desenha o texto no plano da camada (L.c, L.x, L.y)
function ieTextoRender(L) {
    const t = L.txt;
    if (!t) return;
    const linhas = ieTextoLayout(t);
    const B = ieTextoCaixaLocal(t, linhas);
    const m = t.m || IE_ID;
    const cs = [ieMatPt(m, B.x, B.y), ieMatPt(m, B.x + B.w, B.y), ieMatPt(m, B.x, B.y + B.h), ieMatPt(m, B.x + B.w, B.y + B.h)];
    const x1 = Math.floor(Math.min(...cs.map(p => p.x))) - 2, y1 = Math.floor(Math.min(...cs.map(p => p.y))) - 2;
    const x2 = Math.ceil(Math.max(...cs.map(p => p.x))) + 2, y2 = Math.ceil(Math.max(...cs.map(p => p.y))) + 2;
    if (!String(t.s || '').trim()) { L.c = null; ieInvalidar(L); return; }
    const c = ieCanvas(Math.min(30000, x2 - x1), Math.min(30000, y2 - y1)), x = ieCtx(c);
    x.setTransform(m[0], m[1], m[2], m[3], m[4] - x1, m[5] - y1);
    x.font = ieFonteCss(t);
    x.letterSpacing = (t.esp || 0) / 1000 * t.tam + 'px';
    x.fillStyle = t.cor || '#000';
    x.textBaseline = 'alphabetic';
    for (const l of linhas) x.fillText(l.s, l.x, l.y);
    L.c = c; L.x = x1; L.y = y1;
    L.sujoPx = true;
    ieInvalidar(L);
}

// ─────────────────────────── fontes ───────────────────────────
async function ieCarregarFontes() {
    if (IE.estilos) return IE.estilos;
    try {
        const r = await window.pywebview.api.ve_fontes();
        if (r && r.success) { IE.fontes = r.fontes || []; IE.estilos = r.estilos || Object.fromEntries((r.fontes || []).map(f => [f, [{ estilo: 'Regular', peso: 400, gdi: f, ps: f }]])); }
    } catch (e) { /* sem API */ }
    if (!IE.estilos) IE.estilos = { Arial: [{ estilo: 'Regular', peso: 400, gdi: 'Arial', ps: 'ArialMT' }] };
    return IE.estilos;
}
function ieEstiloDe(fam, estilo) {
    const lista = (IE.estilos || {})[fam] || [];
    return lista.find(e => e.estilo === estilo) || lista.find(e => e.peso === 400 && !e.italico) || lista[0] || null;
}
function ieAplicarEstiloFonte(t, fam, e) {
    t.fam = fam;
    if (e) { t.gdi = e.gdi || fam; t.neg = !!e.gdi_negrito; t.ital = !!(e.italico || e.gdi_italico); t.peso = e.peso; t.ps = e.ps || ''; t.estilo = e.estilo; }
    else { t.gdi = fam; t.neg = false; t.ital = false; t.peso = 400; t.estilo = 'Regular'; }
}

// texto vindo do PSD → modelo editável
async function ieTextoDoPsd(L) {
    const t = L.texto;
    if (!t || !t.runs || !t.runs.length) return null;
    const estilos = await ieCarregarFontes();
    const run = t.runs[0];
    let f = typeof vePsdAcharFonte === 'function' ? vePsdAcharFonte(run.fonte, estilos) : null;
    const txt = {
        s: t.texto, tam: run.tam, cor: run.cor, alin: t.alin || 'left', esp: run.esp || 0,
        ent: run.auto_ent || !(run.ent > 0.5) ? 0 : run.ent, caixaAlta: !!run.caixa_alta,
        caixa: t.caixa ? [...t.caixa] : null,
        m: ieMatMul(L.tf || IE_ID, t.tf || IE_ID),
    };
    if (f) ieAplicarEstiloFonte(txt, f.fam, f.e);
    else { ieAplicarEstiloFonte(txt, 'Arial', ieEstiloDe('Arial', 'Regular')); ieToast(`${ieT('Fonte')} ${run.fonte} ${ieT('não instalada: usando Arial')}`); }
    if (run.neg && !txt.neg) txt.neg = true;
    if (run.ita) txt.ital = true;
    if (t.misto) ieToast(ieT('Texto com estilos misturados: ao editar, fica com o estilo do começo'));
    txt.psOrig = run.fonte;
    txt.orig = { tam: txt.tam, cor: txt.cor, esp: txt.esp, ent: txt.ent, alin: txt.alin };
    return txt;
}

// ─────────────────────────── edição na tela ───────────────────────────
IE.edTexto = null;   // {L, nova, antes}

async function ieTextoEditar(L, nova = false) {
    const doc = IE.doc;
    if (!L) return;
    if (!L.txt) {
        if (L.texto) {
            const t = await ieTextoDoPsd(L);
            if (!t) { ieToast(ieT('Não consegui ler o texto desta camada')); return; }
            L.txt = t;
        } else return;
    }
    ieTextoEncerrar(true);
    ieAtivar(L.id, doc);
    IE.edTexto = { L, nova, antes: JSON.stringify(L.txt), sAntes: L.txt.s, Rantes: ieRCamada(L) };
    L._editando = true;
    L._rasterAntes = L.c ? { c: L.c, x: L.x, y: L.y } : null;
    ieInvalidar(L);
    ieAgendar(IE.edTexto.Rantes || null, doc);
    const ta = ieEl('ie-texto-edit');
    ta.value = L.txt.s || '';
    ta.hidden = false;
    ieTextoPosicionar();
    setTimeout(() => { ta.focus(); if (!nova) ta.select(); }, 0);
    ieOpcoesRender?.();
}

function ieTextoPosicionar() {
    const ed = IE.edTexto, doc = IE.doc;
    const ta = ieEl('ie-texto-edit');
    if (!ed || !doc || !ta) return;
    const t = ed.L.txt;
    const linhas = ieTextoLayout(t);
    const B = ieTextoCaixaLocal(t, linhas);
    const asc = (() => { const m0 = ieMedir(t).measureText('Hg'); return m0.fontBoundingBoxAscent || t.tam * 0.8; })();
    const adv = t.ent > 0 ? t.ent : t.tam * 1.2;
    const larg = t.caixa ? t.caixa[2] - t.caixa[0] : Math.max(t.tam * 0.6, ...linhas.map(l => l.w)) + t.tam * 0.6;
    const x0 = t.caixa ? t.caixa[0] : (t.alin === 'center' ? -larg / 2 : t.alin === 'right' ? -larg : 0);
    const y0 = (t.caixa ? t.caixa[1] : -asc) - (adv - t.tam * 1.0) / 2;
    const m = ieMatMul([doc.zoom, 0, 0, doc.zoom, doc.px, doc.py], t.m || IE_ID);
    Object.assign(ta.style, {
        font: ieFonteCss(t), letterSpacing: (t.esp || 0) / 1000 * t.tam + 'px', lineHeight: adv + 'px', color: t.cor,
        textAlign: t.alin, left: '0px', top: '0px', width: larg + 'px',
        height: Math.max(adv, linhas.length * adv) + adv * 0.4 + 'px',
        transform: `matrix(${m.join(',')}) translate(${x0}px, ${y0}px)`, textTransform: t.caixaAlta ? 'uppercase' : 'none',
    });
    void B;
}

function ieTextoEncerrar(confirmar = true) {
    const ed = IE.edTexto, doc = IE.doc;
    if (!ed) return;
    IE.edTexto = null;
    const ta = ieEl('ie-texto-edit');
    const L = ed.L;
    L._editando = false;
    if (ta) { L.txt.s = ta.value; ta.hidden = true; ta.blur(); }
    if (!confirmar) { Object.assign(L.txt, JSON.parse(ed.antes)); }
    const mudou = JSON.stringify(L.txt) !== ed.antes;
    if (ed.nova && !String(L.txt.s || '').trim()) {
        const a = doc && ieAchar(doc, L.id);
        if (a) { a.lista.splice(a.i, 1); doc.ativa = doc.camadas.length ? doc.camadas[doc.camadas.length - 1].id : null; doc.selIds = doc.ativa != null ? [doc.ativa] : []; }
        ieAgendar(ed.Rantes || null, doc);
        ieUiCamadas?.();
        return;
    }
    if (!mudou && !ed.nova) {
        if (L._rasterAntes && !L.c) { L.c = L._rasterAntes.c; L.x = L._rasterAntes.x; L.y = L._rasterAntes.y; }
        ieInvalidar(L);
        ieAgendar(ed.Rantes || null, doc);
        if (L.texto && L.ref != null) delete L.txt;   // continua o texto original do Photoshop
        return;
    }
    if (L.ref != null && L.texto) {
        L.textoNovo = L.txt.s;
        L.textoEstilo = ieEstiloMudado(L.txt);
        delete L.c0;   // daqui em diante a tela mostra o texto desenhado aqui
    }
    if (ed.nova || L.nome === ieT('Texto') || L._nomeAuto) { L.nome = String(L.txt.s).split(IE_NL)[0].slice(0, 40) || ieT('Texto'); L._nomeAuto = true; }
    ieTextoRender(L);
    ieAgendar(ieRUniao(ed.Rantes, ieRCamada(L)), doc);
    ieHist(ieT(ed.nova ? 'Camada de texto' : 'Editar texto'));
    ieUiCamadas?.();
}

function ieTextoInstalar() {
    const ta = ieEl('ie-texto-edit');
    if (!ta || ta._ok) return;
    ta._ok = true;
    ta.addEventListener('input', () => {
        const ed = IE.edTexto;
        if (!ed) return;
        ed.L.txt.s = ta.value;
        ieTextoPosicionar();
    });
    ta.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.location === 3))) { ev.preventDefault(); ieTextoEncerrar(true); }
    });
    ta.addEventListener('pointerdown', ev => ev.stopPropagation());
}

// mudou estilo pela barra de opções: vale para o texto em edição ou para as camadas de texto selecionadas
function ieTextoEstilo(mud) {
    const doc = IE.doc;
    Object.assign(IE.op.texto, mud);
    if (!doc) return;
    const ed = IE.edTexto;
    const alvos = ed ? [ed.L] : ieSelecionadas(doc).filter(L => L.txt || L.texto);
    if (!alvos.length) return;
    (async () => {
        for (const L of alvos) {
            if (!L.txt) { L.txt = await ieTextoDoPsd(L); if (!L.txt) continue; }
            const t = L.txt;
            if (mud.fam !== undefined || mud.estilo !== undefined) t.fonteMudou = true;
            if (mud.fam !== undefined || mud.estilo !== undefined) ieAplicarEstiloFonte(t, mud.fam ?? t.fam, ieEstiloDe(mud.fam ?? t.fam, mud.estilo ?? t.estilo));
            for (const k of ['tam', 'cor', 'alin', 'esp', 'ent']) if (mud[k] !== undefined) t[k] = mud[k];
            if (ed) { ieTextoPosicionar(); continue; }
            const Ra = ieRCamada(L);
            if (L.ref != null && L.texto) {
                L.textoNovo = t.s;
                L.textoEstilo = ieEstiloMudado(t);
                delete L.c0;
            }
            ieTextoRender(L);
            ieAgendar(ieRUniao(Ra, ieRCamada(L)), doc);
        }
        if (!ed) ieHist(ieT('Estilo do texto'));
    })();
}

// ─────────────────────────── ferramenta ───────────────────────────
const IE_TEXTO = {
    nome: 'Texto', tecla: 'T', icone: 'type', cursor: 'text',
    down(p, ev, doc) {
        if (IE.edTexto) {
            // clique fora do texto em edição confirma
            const L = IE.edTexto.L, r = ieRaster(L) || L._rasterAntes;
            ieTextoEncerrar(true);
            void r;
            IE.arr = null;
            return;
        }
        // clicou num texto? edita
        const alvo = ieCamadaNoPonto(doc, p.x, p.y);
        if (alvo && (alvo.txt || alvo.texto)) { ieTextoEditar(alvo); return; }
        IE.arr = { p0: { x: Math.round(p.x), y: Math.round(p.y) }, op: 'nova' };
    },
    move(p, ev) {
        const a = IE.arr; if (!a) return;
        a.r = ieRetArrasto(a.p0, p, ev, false);
        ieDesenharSobre();
    },
    async up(p, ev, doc) {
        const a = IE.arr; IE.arr = null;
        if (!a) return;
        await ieCarregarFontes();
        const o = IE.op.texto;
        const t = { s: '', tam: o.tam, cor: IE.cor[0], alin: o.alin, esp: o.esp || 0, ent: o.ent || 0, caixa: null, m: [1, 0, 0, 1, a.p0.x, a.p0.y] };
        ieAplicarEstiloFonte(t, o.fam || 'Arial', ieEstiloDe(o.fam || 'Arial', o.estilo || 'Regular'));
        if (a.r && a.r.w > 8 && a.r.h > 8) { t.caixa = [0, 0, a.r.w, a.r.h]; t.m = [1, 0, 0, 1, a.r.x, a.r.y]; }
        const L = ieNovaCamada(doc, { tipo: 'texto', nome: ieT('Texto'), txt: t, sujoPx: true, _nomeAuto: true });
        ieInserirAcima(doc, L, ieAtiva(doc));
        ieUiCamadas?.();
        ieTextoEditar(L, true);
    },
    sobre(ctx, doc) {
        const a = IE.arr;
        if (a && a.r) {
            const s = ieDocTela(a.r.x, a.r.y, doc);
            ctx.save(); ctx.strokeStyle = '#4aa3ff'; ctx.setLineDash([3, 3]);
            ctx.strokeRect(s.x + 0.5, s.y + 0.5, a.r.w * doc.zoom, a.r.h * doc.zoom); ctx.restore();
        }
        const ed = IE.edTexto;
        if (ed && ed.L.txt.caixa) {
            const t = ed.L.txt, m = t.m, c = t.caixa;
            const pts = [[c[0], c[1]], [c[2], c[1]], [c[2], c[3]], [c[0], c[3]]].map(([x, y]) => { const q = ieMatPt(m, x, y); return ieDocTela(q.x, q.y, doc); });
            ctx.save(); ctx.strokeStyle = '#4aa3ff'; ctx.setLineDash([3, 3]); ctx.beginPath();
            pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke(); ctx.restore();
        }
    },
};
IE_FERR.texto = IE_TEXTO;

// a camada em edição não aparece na composição (o texto fica na caixa de edição)
(function () {
    const orig = ieRaster;
    ieRaster = function (L) { return L && L._editando ? null : orig(L); };
})();

// o que mudou no estilo de um texto do Photoshop (só isso vai para o arquivo; o resto fica como estava)
function ieEstiloMudado(t) {
    const o = t.orig || {}, e = {};
    for (const k of ['tam', 'cor', 'esp', 'ent', 'alin']) if (t[k] !== o[k]) e[k] = t[k];
    if (t.fonteMudou && t.ps) e.ps = t.ps;
    return Object.keys(e).length ? e : null;
}
