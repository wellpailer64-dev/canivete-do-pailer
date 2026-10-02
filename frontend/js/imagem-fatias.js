// =========================================================
// Editor de Imagem — ferramenta Fatia (C / Shift+C alterna com o Corte), como no Photoshop.
// doc.fatias = [{id, x, y, w, h, nome, url, alt}] em px do documento (só as do usuário; o resto da imagem são as
// fatias automáticas, desenhadas pontilhadas). Arrastar fora cria; dentro seleciona e move; alças redimensionam;
// Delete apaga; duplo clique edita nome/URL/alt. Ficam no PSD (recurso de fatias, Functions/editor_imagem.py) e
// saem como arquivos em Arquivo > Exportar fatias.
// =========================================================

function ieFatiasSpec(doc) {
    return (doc.fatias || []).map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h, nome: f.nome || '', url: f.url || '', alt: f.alt || '' }));
}
function ieFatiaSel(doc = IE.doc) { return doc ? (doc.fatias || []).find(f => f.id === doc.fatiaSel) || null : null; }
function ieFatiaNome(doc, f) { return f.nome || `${doc.nome}_${String(doc.fatias.indexOf(f) + 1).padStart(2, '0')}`; }

// tamanho/rotação da imagem e tela: as fatias acompanham (só retângulos alinhados)
function ieFatiasTransformar(doc, M) {
    for (const f of doc.fatias || []) {
        const a = ieMatPt(M, f.x, f.y), b = ieMatPt(M, f.x + f.w, f.y + f.h);
        f.x = Math.round(Math.min(a.x, b.x)); f.y = Math.round(Math.min(a.y, b.y));
        f.w = Math.round(Math.abs(b.x - a.x)); f.h = Math.round(Math.abs(b.y - a.y));
    }
    doc.fatias = (doc.fatias || []).filter(f => ieRInter(f, ieRDoc(doc)));
}

function ieFatiaNoPonto(doc, p) {
    const l = doc.fatias || [];
    for (let i = l.length - 1; i >= 0; i--) { const f = l[i]; if (p.x >= f.x && p.y >= f.y && p.x < f.x + f.w && p.y < f.y + f.h) return f; }
    return null;
}

// linhas das fatias automáticas: as bordas das fatias do usuário estendidas pela imagem
function ieFatiasAuto(doc) {
    const xs = new Set([0, doc.w]), ys = new Set([0, doc.h]);
    for (const f of doc.fatias || []) { xs.add(f.x); xs.add(f.x + f.w); ys.add(f.y); ys.add(f.y + f.h); }
    return { xs: [...xs].sort((a, b) => a - b), ys: [...ys].sort((a, b) => a - b) };
}

const IE_FATIA = {
    nome: 'Fatia', tecla: 'C', icone: 'slice', cursor: 'crosshair',
    ativar() { if (IE.doc) IE.doc.verFatias = true; },
    down(p, ev, doc) {
        const sel = ieFatiaSel(doc);
        const h = sel ? ieAlcaRet(sel, p, doc) : null;
        if (sel && h && h !== 'dentro') { IE.fatiaArr = { f: sel, h, p0: p, r0: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } }; return; }
        const f = ieFatiaNoPonto(doc, p);
        if (f) {
            doc.fatiaSel = f.id;
            IE.fatiaArr = { f, h: 'dentro', p0: p, r0: { x: f.x, y: f.y, w: f.w, h: f.h } };
            ieOpcoesRender(); ieDesenharSobre();
            return;
        }
        IE.fatiaArr = { novo: true, p0: { x: Math.round(p.x), y: Math.round(p.y) } };
    },
    move(p, ev, doc) {
        const a = IE.fatiaArr;
        if (!a) return;
        if (a.novo) { a.r = ieRInter(ieRetArrasto(a.p0, p, ev, ev.shiftKey), ieRDoc(doc)); ieDesenharSobre(); return; }
        const f = a.f, dx = Math.round(p.x - a.p0.x), dy = Math.round(p.y - a.p0.y);
        let { x, y, w, h } = a.r0;
        if (a.h === 'dentro') {
            f.x = ieClamp(x + dx, 0, doc.w - w); f.y = ieClamp(y + dy, 0, doc.h - h);
        } else {
            let x1 = x, y1 = y, x2 = x + w, y2 = y + h;
            if (a.h.includes('l')) x1 += dx;
            if (a.h.includes('r')) x2 += dx;
            if (a.h.includes('t')) y1 += dy;
            if (a.h.includes('b')) y2 += dy;
            const r = ieRInter({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }, ieRDoc(doc));
            if (r) Object.assign(f, ieRInt(r));
        }
        a.mudou = true;
        ieDesenharSobre(); ieOpcoesRender();
    },
    up(p, ev, doc) {
        const a = IE.fatiaArr;
        IE.fatiaArr = null;
        if (!a) return;
        if (a.novo) {
            if (!a.r || a.r.w < 2 || a.r.h < 2) { doc.fatiaSel = null; ieDesenharSobre(); ieOpcoesRender(); return; }
            const f = { id: ++doc.seqFatia, ...ieRInt(a.r), nome: '', url: '', alt: '' };
            doc.fatias.push(f);
            doc.fatiaSel = f.id;
            ieHist(ieT('Fatia'));
        } else if (a.mudou) ieHist(ieT('Mover fatia'));
        ieDesenharSobre(); ieOpcoesRender();
    },
    dbl(p, ev, doc) { const f = ieFatiaNoPonto(doc, p); if (f) { doc.fatiaSel = f.id; ieFatiaOpcoes(doc, f); } },
    cursor() {
        const doc = IE.doc, sel = doc && ieFatiaSel(doc);
        if (!sel || !IE.mouse) return 'crosshair';
        const h = IE.fatiaArr ? IE.fatiaArr.h : ieAlcaRet(sel, IE.mouse, doc);
        return { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize', dentro: 'move' }[h] || 'crosshair';
    },
    sobre(ctx, doc) {
        const a = IE.fatiaArr;
        if (a && a.novo && a.r) {
            const s = ieDocTela(a.r.x, a.r.y, doc);
            ctx.save(); ctx.strokeStyle = '#4aa3ff'; ctx.setLineDash([4, 3]);
            ctx.strokeRect(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, Math.round(a.r.w * doc.zoom), Math.round(a.r.h * doc.zoom));
            ctx.restore();
        }
    },
};
IE_FERR.fatia = IE_FATIA;
{
    const i = IE_FERR_ORDEM.indexOf('corte');
    IE_FERR_ORDEM.splice(i + 1, 0, 'fatia');
}

// desenho das fatias por cima da imagem (com a ferramenta Fatia ou Exibir > Fatias)
function ieFatiasDesenhar(ctx, doc) {
    if (!doc || !(IE.ferr === 'fatia' || doc.verFatias) || IE.transf) return;
    const z = doc.zoom, T = (x, y) => ieDocTela(x, y, doc);
    const o = T(0, 0);
    ctx.save();
    // automáticas: linhas pontilhadas cinza
    if (doc.fatias.length) {
        const { xs, ys } = ieFatiasAuto(doc);
        ctx.strokeStyle = 'rgba(160,160,160,.75)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
        ctx.beginPath();
        for (const x of xs) { const sx = Math.round(o.x + x * z) + 0.5; ctx.moveTo(sx, o.y); ctx.lineTo(sx, o.y + doc.h * z); }
        for (const y of ys) { const sy = Math.round(o.y + y * z) + 0.5; ctx.moveTo(o.x, sy); ctx.lineTo(o.x + doc.w * z, sy); }
        ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = '600 10px Segoe UI, sans-serif';
    ctx.textBaseline = 'middle';
    doc.fatias.forEach((f, i) => {
        const s = T(f.x, f.y), w = f.w * z, h = f.h * z;
        const sel = f.id === doc.fatiaSel;
        ctx.strokeStyle = sel ? '#ffb347' : '#4aa3ff';
        ctx.lineWidth = sel ? 1.5 : 1;
        ctx.strokeRect(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, Math.round(w), Math.round(h));
        // etiqueta com o número, como no Photoshop
        const txt = String(i + 1).padStart(2, '0');
        const tw = ctx.measureText(txt).width + 8;
        ctx.fillStyle = sel ? '#ffb347' : '#4aa3ff';
        ctx.fillRect(Math.round(s.x) + 1, Math.round(s.y) + 1, tw, 14);
        ctx.fillStyle = '#081420';
        ctx.fillText(txt, Math.round(s.x) + 5, Math.round(s.y) + 8.5);
        if (sel && IE.ferr === 'fatia') ieAlcasDesenhar(ctx, [[s.x, s.y], [s.x + w / 2, s.y], [s.x + w, s.y], [s.x + w, s.y + h / 2], [s.x + w, s.y + h], [s.x + w / 2, s.y + h], [s.x, s.y + h], [s.x, s.y + h / 2]]);
    });
    ctx.restore();
}
(function () {
    const orig = ieDesenharSobre;
    ieDesenharSobre = function () {
        orig();
        const c = ieEl('ie-sobre'), doc = IE.doc;
        if (!c || !doc || !ieAtivoVisivel()) return;
        const ctx = ieCtx(c), dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        try { ieFatiasDesenhar(ctx, doc); } catch (e) { console.error(e); }
        ctx.restore();
    };
})();

// ─────────────────────────── comandos ───────────────────────────
function ieFatiaExcluir(doc = IE.doc, todas = false) {
    if (!doc) return;
    if (todas) { if (!doc.fatias.length) return; doc.fatias = []; }
    else { const f = ieFatiaSel(doc); if (!f) return; doc.fatias = doc.fatias.filter(x => x !== f); }
    doc.fatiaSel = null;
    ieHist(ieT(todas ? 'Excluir fatias' : 'Excluir fatia'));
    ieDesenharSobre(); ieOpcoesRender();
}

async function ieFatiaDividir(doc = IE.doc) {
    const f = ieFatiaSel(doc);
    if (!f) { ieToast(ieT('Selecione uma fatia')); return; }
    const v = await ieDialogo({
        titulo: 'Dividir fatia', campos: [
            { id: 'h', rotulo: 'Na horizontal (linhas)', tipo: 'numero', min: 1, max: 100, valor: 2 },
            { id: 'v', rotulo: 'Na vertical (colunas)', tipo: 'numero', min: 1, max: 100, valor: 1 }],
    });
    if (!v) return;
    const lin = Math.max(1, Math.round(v.h || 1)), col = Math.max(1, Math.round(v.v || 1));
    if (lin === 1 && col === 1) return;
    const i = doc.fatias.indexOf(f), novas = [];
    for (let a = 0; a < lin; a++) for (let b = 0; b < col; b++) {
        const x1 = f.x + Math.round(f.w * b / col), x2 = f.x + Math.round(f.w * (b + 1) / col);
        const y1 = f.y + Math.round(f.h * a / lin), y2 = f.y + Math.round(f.h * (a + 1) / lin);
        novas.push({ id: ++doc.seqFatia, x: x1, y: y1, w: x2 - x1, h: y2 - y1, nome: f.nome ? `${f.nome}_${novas.length + 1}` : '', url: f.url, alt: f.alt });
    }
    doc.fatias.splice(i, 1, ...novas);
    doc.fatiaSel = novas[0].id;
    ieHist(ieT('Dividir fatia'));
    ieDesenharSobre(); ieOpcoesRender();
}

// fatias a partir das camadas selecionadas (o retângulo dos pixels de cada uma)
function ieFatiasDasCamadas(doc = IE.doc) {
    if (!doc) return;
    const novas = [];
    for (const L of ieSelecionadas(doc)) {
        const R = L.tipo === 'grupo' ? ieRCamada(L) : (L.c ? ieLimites(L.c, L.x, L.y) : null);
        const r = R && ieRInter(ieRInt(R), ieRDoc(doc));
        if (r) novas.push({ id: ++doc.seqFatia, ...r, nome: L.nome, url: '', alt: '' });
    }
    if (!novas.length) { ieToast(ieT('Selecione camadas com pixels')); return; }
    doc.fatias.push(...novas);
    doc.fatiaSel = novas[novas.length - 1].id;
    doc.verFatias = true;
    ieHist(ieT('Fatias das camadas'));
    ieDesenharSobre(); ieOpcoesRender();
}

async function ieFatiaOpcoes(doc, f) {
    const v = await ieDialogo({
        titulo: 'Opções da fatia', campos: [
            { id: 'nome', rotulo: 'Nome', tipo: 'texto', valor: f.nome || ieFatiaNome(doc, f) },
            { id: 'url', rotulo: 'URL', tipo: 'texto', valor: f.url || '' },
            { id: 'alt', rotulo: 'Texto alternativo', tipo: 'texto', valor: f.alt || '' },
            { id: 'x', rotulo: 'X', tipo: 'numero', valor: f.x }, { id: 'y', rotulo: 'Y', tipo: 'numero', valor: f.y },
            { id: 'w', rotulo: 'L', tipo: 'numero', min: 1, valor: f.w }, { id: 'h', rotulo: 'A', tipo: 'numero', min: 1, valor: f.h }],
    });
    if (!v) return;
    const r = ieRInter({ x: Math.round(+v.x), y: Math.round(+v.y), w: Math.max(1, Math.round(+v.w)), h: Math.max(1, Math.round(+v.h)) }, ieRDoc(doc));
    Object.assign(f, { nome: String(v.nome || '').trim(), url: v.url || '', alt: v.alt || '' }, r || {});
    ieHist(ieT('Opções da fatia'));
    ieDesenharSobre(); ieOpcoesRender();
}

// Arquivo > Exportar fatias: um arquivo por fatia (as do usuário; sem nenhuma, a imagem inteira)
async function ieFatiasExportar(doc = IE.doc) {
    const api = ieApi();
    if (!doc || !api) return;
    if (!doc.fatias.length) { ieToast(ieT('Nenhuma fatia: crie com a ferramenta Fatia (C)')); return; }
    const v = await ieDialogo({
        titulo: 'Exportar fatias', ok: 'Exportar',
        campos: [{ id: 'fmt', rotulo: 'Formato', tipo: 'select', valor: IE.ultFmt || 'png', opcoes: [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'], ['gif', 'GIF']] },
            { id: 'q', rotulo: 'Qualidade (JPEG/WebP)', min: 1, max: 100, valor: IE.ultQ || 92 },
            { id: 'esc', rotulo: 'Escala (%)', tipo: 'numero', min: 1, max: 400, valor: 100 },
            { id: 'sel', rotulo: 'Só a fatia selecionada', tipo: 'check', valor: false }],
    });
    if (!v) return;
    IE.ultFmt = v.fmt; IE.ultQ = v.q;
    const pasta = doc.path ? doc.path.replace(/[\\/][^\\/]*$/, '') : '';
    const r = await api.ie_dialogo_salvar(doc.nome, v.fmt === 'gif' ? 'png' : v.fmt, pasta);
    if (!r || !r.success) return;
    // o nome escolhido vira o prefixo; cada fatia sai com o nome dela (ou prefixo_01, _02...)
    const dir = r.path.replace(/[\\/][^\\/]*$/, ''), base = ieNomeArq(r.path).replace(/\.[^.]+$/, '');
    const lista = v.sel && ieFatiaSel(doc) ? [ieFatiaSel(doc)] : doc.fatias;
    ieCarregando(`${ieT('Exportando fatias')}...`, 10);
    try {
        ieCompor(doc, ieRDoc(doc));
        const ini = await api.ie_salvar_inicio(null);
        const itens = [], usados = new Set();
        for (const f of lista) {
            const i = doc.fatias.indexOf(f);
            let nome = (f.nome || `${base}_${String(i + 1).padStart(2, '0')}`).replace(/[\\/:*?"<>|]/g, '_');
            while (usados.has(nome.toLowerCase())) nome += '_';
            usados.add(nome.toLowerCase());
            let c = ieCanvas(f.w, f.h);
            ieCtx(c).drawImage(doc.comp, -f.x, -f.y);
            if (v.esc && v.esc !== 100) c = ieTransformarPlano({ c, x: 0, y: 0 }, [v.esc / 100, 0, 0, v.esc / 100, 0, 0]).c;
            const k = `fatia_${i}.png`;
            await ieEnviar(ini.url, k, c);
            itens.push({ arquivo: k, destino: `${dir}\\${nome}.${v.fmt}` });
            ieCarregando(null, 10 + itens.length / lista.length * 80);
        }
        const e = await api.ie_exportar_fatias({ sessao: ini.sessao, fatias: itens, qualidade: v.q, dpi: doc.dpi });
        if (e && e.success) ieToast(`${e.feitos.length} ${ieT('fatia(s) exportada(s) em')} ${dir}`);
        else ieToast(`${ieT('Não exportou')}: ${((e && e.erros) || []).join(', ')}`);
    } finally { ieCarregando(false); }
}

Object.assign(IE_CMDS, {
    exportarFatias: doc => ieFatiasExportar(doc),
    fatiaDividir: doc => ieFatiaDividir(doc),
    fatiaExcluir: doc => ieFatiaExcluir(doc),
    fatiasExcluir: doc => ieFatiaExcluir(doc, true),
    fatiasCamadas: doc => ieFatiasDasCamadas(doc),
    verFatias: doc => { doc.verFatias = !doc.verFatias; ieDesenharSobre(); },
    fatiaOpcoes: doc => { const f = ieFatiaSel(doc); if (f) ieFatiaOpcoes(doc, f); },
});
