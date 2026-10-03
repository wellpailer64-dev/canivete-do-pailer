// =========================================================
// Editor de Imagem — pranchetas (artboards do PSD), réguas, guias e o painel Propriedades do documento.
// Prancheta: grupo com L.prancheta = {x, y, w, h, fundo ('#rrggbb' | null = transparente)}: compõe isolado, com o fundo
// e recortado no retângulo; fora das pranchetas a tela mostra a área de montagem (sem xadrez), com o nome em cima.
// Réguas (Ctrl+R) nas bordas da vista, na unidade escolhida; arrastar da régua cria guia; com a ferramenta Mover a guia
// se arrasta (de volta para a régua = apaga). doc.guias = [{o: 'v'|'h', p: px}], lidas e gravadas no PSD (recurso 1032).
// =========================================================

const IE_REGUA = 20;   // px da régua na tela
IE.verGuias = true;
const ieTemPranchetas = doc => !!doc && doc.camadas.some(L => L.prancheta);
const iePranchetas = doc => (doc ? doc.camadas.filter(L => L.prancheta) : []);
const ieReguas = () => iePref('reguas', true) !== false;

// ─────────────────────────── composição ───────────────────────────
(function () {
    const orig = ieComporCamada;
    ieComporCamada = function (ctx, L, R, o, prof, forcarNormal, semExt) {
        if (L.tipo !== 'grupo' || !L.prancheta) return orig.apply(this, arguments);
        const P = L.prancheta;
        if (!ieRInter(R, P)) return;
        const t = ieTemp(prof + 1, R.w, R.h), tc = ieCtx(t);
        tc.setTransform(1, 0, 0, 1, -R.x, -R.y);
        if (P.fundo) { tc.fillStyle = P.fundo; tc.fillRect(P.x, P.y, P.w, P.h); }
        ieComporLista(tc, L.filhos, R, { x: R.x, y: R.y }, prof + 1);
        tc.globalCompositeOperation = 'destination-in';   // o que passa da prancheta não aparece
        tc.fillStyle = '#000'; tc.fillRect(P.x, P.y, P.w, P.h);
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.globalCompositeOperation = 'source-over';
        const mask = L.m && !L.m.desativada ? L.m : null;
        if (mask) {
            tc.globalCompositeOperation = 'destination-in';
            tc.drawImage(ieMascaraRegiao(mask, R, ieTemp(prof + 2, R.w, R.h)), 0, 0, R.w, R.h, 0, 0, R.w, R.h);
            tc.globalCompositeOperation = 'source-over';
        }
        ieDesenhar(ctx, t, 0, 0, R.w, R.h, R.x, R.y, forcarNormal ? 1 : L.op, forcarNormal || L.bm === 'PASS_THROUGH' ? 'source-over' : ieGco(L.bm));
    };
    const rc = ieRCamada;
    ieRCamada = function (L) { if (L && L.prancheta) { const P = L.prancheta; return { x: P.x, y: P.y, w: P.w, h: P.h }; } return rc(L); };
    const cx = ieCaixaCamada;
    ieCaixaCamada = function (L) { if (L && L.prancheta) { const P = L.prancheta; return { x: P.x, y: P.y, w: P.w, h: P.h }; } return cx(L); };
    const mv = ieMoverCamada;
    ieMoverCamada = function (L, dx, dy) { if (L && L.prancheta) { L.prancheta.x += dx; L.prancheta.y += dy; L.pranchetaMudou = true; } return mv(L, dx, dy); };
})();

// nome de cada prancheta em cima dela (clique seleciona, como no Photoshop)
function iePranchetaRotulos(doc) {
    return iePranchetas(doc).filter(L => L.visivel).map(L => {
        const s = ieDocTela(L.prancheta.x, L.prancheta.y, doc);
        return { L, x: s.x, y: s.y - 18, w: Math.max(30, String(L.nome).length * 7 + 8), h: 16 };
    });
}

// ─────────────────────────── réguas ───────────────────────────
const IE_UNIDADES = { px: ['Pixels', 1], pol: ['Polegadas', 0], cm: ['Centímetros', 0], mm: ['Milímetros', 0], pt: ['Pontos', 0], pc: ['Paicas', 0], pct: ['Porcentagem', 0] };
function ieUnidadeFator(doc, eixo) {   // px por unidade
    const u = iePref('unidade', 'px'), dpi = doc.dpi || 72;
    return { px: 1, pol: dpi, cm: dpi / 2.54, mm: dpi / 25.4, pt: dpi / 72, pc: dpi / 6, pct: (eixo === 'h' ? doc.w : doc.h) / 100 }[u] || 1;
}
function ieReguasInstalar() {
    const v = ieEl('ie-vista');
    if (!v || ieEl('ie-regua-h')) return;
    for (const [id, cls] of [['ie-regua-h', 'ie-regua ie-regua-h'], ['ie-regua-v', 'ie-regua ie-regua-v'], ['ie-regua-c', 'ie-regua ie-regua-c']]) {
        const c = document.createElement(id === 'ie-regua-c' ? 'div' : 'canvas');
        c.id = id; c.className = cls;
        v.appendChild(c);
    }
    ieEl('ie-regua-c').title = ieT('Unidade das réguas');
    ieEl('ie-regua-c').onclick = ev => ieMenuContextoItens(ev, Object.entries(IE_UNIDADES).map(([k, [n]]) => [n, 'unidade:' + k, '', iePref('unidade', 'px') === k]));
    // arrastar da régua cria uma guia
    for (const o of ['h', 'v']) {
        ieEl('ie-regua-' + o).addEventListener('pointerdown', ev => {
            const doc = IE.doc;
            if (!doc || ev.button !== 0) return;
            ev.preventDefault();
            if (!IE.verGuias) { IE.verGuias = true; }
            const g = { o: o === 'h' ? 'h' : 'v', p: 0 };   // régua de cima solta guia horizontal; a da esquerda, vertical
            ieGuiaArrastar(doc, g, ev, true);
        });
    }
}
function ieReguasDesenhar() {
    ieReguasInstalar();
    const doc = IE.doc, ligadas = ieReguas() && !!doc && !ieEl('ie').classList.contains('ie-tela-2');
    for (const id of ['ie-regua-h', 'ie-regua-v', 'ie-regua-c']) { const e = ieEl(id); if (e) e.hidden = !ligadas; }
    if (!ligadas) return;
    const { w, h } = ieVistaTam(), dpr = ieDpr();
    const desenhar = (eixo) => {
        const c = ieEl('ie-regua-' + eixo), L = eixo === 'h' ? w : h;
        const W = eixo === 'h' ? w : IE_REGUA, H = eixo === 'h' ? IE_REGUA : h;
        if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
        const x = ieCtx(c);
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.fillStyle = getComputedStyle(c).backgroundColor || '#2b2b2b'; x.fillRect(0, 0, W, H);
        const fat = ieUnidadeFator(doc, eixo), z = doc.zoom, org = eixo === 'h' ? doc.px : doc.py;
        const pxPorUn = fat * z;
        const passos = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
        const passo = passos.find(p => p * pxPorUn >= 50) || 100000;
        const sub = passo * pxPorUn >= 100 ? 10 : passo * pxPorUn >= 60 ? 5 : 2;
        x.strokeStyle = '#8a8a8a'; x.fillStyle = '#b8b8b8'; x.font = '10px ' + getComputedStyle(document.body).fontFamily; x.lineWidth = 1;
        x.beginPath();
        const ini = Math.floor((-org / pxPorUn) / passo) * passo, fim = (L - org) / pxPorUn;
        for (let u = ini; u <= fim; u += passo / sub) {
            const s = Math.round(org + u * pxPorUn) + 0.5, k = Math.round(u / (passo / sub)) % sub;
            const t = k === 0 ? IE_REGUA : (sub % 2 === 0 && k === sub / 2) ? 8 : 4;
            if (eixo === 'h') { x.moveTo(s, IE_REGUA); x.lineTo(s, IE_REGUA - t); } else { x.moveTo(IE_REGUA, s); x.lineTo(IE_REGUA - t, s); }
            if (k === 0) {
                const n = String(+u.toFixed(2));
                if (eixo === 'h') x.fillText(n, s + 3, 10);
                else { x.save(); x.translate(10, s + 3); x.rotate(-Math.PI / 2); x.textAlign = 'right'; x.fillText(n, 0, 0); x.restore(); }
            }
        }
        x.stroke();
        x.strokeStyle = '#555'; x.beginPath();
        if (eixo === 'h') { x.moveTo(0, IE_REGUA - 0.5); x.lineTo(W, IE_REGUA - 0.5); } else { x.moveTo(IE_REGUA - 0.5, 0); x.lineTo(IE_REGUA - 0.5, H); }
        x.stroke();
        const m = IE.mouse;   // onde está o cursor
        if (m) { const s = Math.round(eixo === 'h' ? doc.px + m.x * z : doc.py + m.y * z) + 0.5; x.strokeStyle = '#4aa3ff'; x.beginPath(); if (eixo === 'h') { x.moveTo(s, 0); x.lineTo(s, IE_REGUA); } else { x.moveTo(0, s); x.lineTo(IE_REGUA, s); } x.stroke(); }
    };
    desenhar('h'); desenhar('v');
}

// ─────────────────────────── guias ───────────────────────────
function ieGuiaPerto(doc, sx, sy) {
    if (!doc.guias || !doc.guias.length) return null;
    let melhor = null, d0 = 5;
    for (const g of doc.guias) {
        const s = g.o === 'v' ? doc.px + g.p * doc.zoom : doc.py + g.p * doc.zoom;
        const d = Math.abs((g.o === 'v' ? sx : sy) - s);
        if (d < d0) { d0 = d; melhor = g; }
    }
    return melhor;
}
// arrastar guia (nova, da régua, ou existente): Alt troca vertical/horizontal; Shift encaixa nas marcas da régua;
// com Exibir > Ajustar, encaixa em camadas, limites e fatias; solta fora da imagem/na régua = apaga (como no Photoshop)
function ieGuiaArrastar(doc, g, ev, nova) {
    const vista = ieEl('ie-vista'), rv = vista.getBoundingClientRect();
    doc.guias = doc.guias || [];
    if (nova) doc.guias.push(g);
    const o0 = g.o, p0 = g.p;
    IE.guiaArr = g;
    const mover = e => {
        const p = ieTelaDoc(e, doc);
        g.o = e.altKey ? (o0 === 'v' ? 'h' : 'v') : o0;
        let v = g.o === 'v' ? p.x : p.y;
        if (e.shiftKey) {   // marcas da régua no zoom atual
            const eixo = g.o === 'v' ? 'h' : 'v', fat = ieUnidadeFator(doc, eixo), pxUn = fat * doc.zoom;
            const passos = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
            const passo = passos.find(q => q * pxUn >= 50) || 10000, sub = passo * pxUn >= 100 ? 10 : passo * pxUn >= 60 ? 5 : 2;
            const k = passo / sub * fat;
            v = Math.round(v / k) * k;
        } else {
            v = Math.round(v);
            if (typeof ieAjustarLigado === 'function' && ieAjustarLigado()) {
                const L = ieAjustarLinhas(doc, { guia: g }), a = ieAjustarValor(v, g.o === 'v' ? L.xs : L.ys, 8 / doc.zoom);
                if (a != null) v = a;
            }
        }
        g.p = v;
        ieDesenharSobre();
    };
    const soltar = e => {
        document.removeEventListener('pointermove', mover); document.removeEventListener('pointerup', soltar);
        IE.guiaArr = null;
        const sx = e.clientX - rv.left, sy = e.clientY - rv.top;
        const fora = sx < (ieReguas() ? IE_REGUA : 0) || sy < (ieReguas() ? IE_REGUA : 0) || sx > rv.width || sy > rv.height;
        if (fora) doc.guias = doc.guias.filter(x => x !== g);   // de volta para a régua: apaga
        doc.sujo = true;
        if (!(nova && fora) && (nova || fora || g.p !== p0 || g.o !== o0)) ieHist(ieT(fora ? 'Excluir guia' : nova ? 'Nova guia' : 'Mover guia'), doc);
        ieDesenharSobre();
        ieJanAtualizar?.('doc');
    };
    document.addEventListener('pointermove', mover); document.addEventListener('pointerup', soltar);
    mover(ev);
}
// ferramenta Mover: arrastar guia; cursor de guia ao passar por cima
document.addEventListener('pointerdown', ev => {
    const doc = IE.doc, sobre = ieEl('ie-sobre');
    if (!doc || ev.target !== sobre || ev.button !== 0) return;
    const r = sobre.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    // rótulo da prancheta: seleciona
    const rot = iePranchetaRotulos(doc).find(q => sx >= q.x && sx <= q.x + q.w && sy >= q.y && sy <= q.y + q.h);
    if (rot && !IE.semExtras) { ev.stopPropagation(); ev.preventDefault(); ieAtivar(rot.L.id, doc); ieUiCamadas(); ieUiProps(); ieDesenharSobre(); return; }
    if ((IE.ferrTemp || IE.ferr) !== 'mover' || !IE.verGuias || IE.semExtras || doc.guiasTravadas) return;
    const g = ieGuiaPerto(doc, sx, sy);
    if (!g) return;
    ev.stopPropagation(); ev.preventDefault();
    ieGuiaArrastar(doc, g, ev, false);
}, true);
document.addEventListener('pointermove', ev => {
    const doc = IE.doc, sobre = ieEl('ie-sobre');
    if (!doc || ev.target !== sobre || IE.ponteiro || IE.guiaArr) return;
    const r = sobre.getBoundingClientRect();
    const g = (IE.ferrTemp || IE.ferr) === 'mover' && IE.verGuias && !IE.semExtras && !doc.guiasTravadas ? ieGuiaPerto(doc, ev.clientX - r.left, ev.clientY - r.top) : null;
    if (g) { sobre.style.cursor = g.o === 'v' ? 'col-resize' : 'row-resize'; sobre._cursorGuia = true; }
    else if (sobre._cursorGuia) { sobre._cursorGuia = false; ieCursor?.(ev); }
}, true);

// desenho por cima: área de montagem, nomes das pranchetas, guias e réguas
(function () {
    const orig = ieDesenharSobre;
    ieDesenharSobre = function () {
        orig();
        const doc = IE.doc, c = ieEl('ie-sobre');
        try { ieReguasDesenhar(); } catch (e) { console.error('[réguas]', e); }
        if (!doc || !c || !ieAtivoVisivel()) return;
        const ctx = ieCtx(c), dpr = ieDpr();
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!IE.semExtras) {
            ctx.font = '12px ' + getComputedStyle(document.body).fontFamily; ctx.textBaseline = 'middle';
            const ativa = ieAtiva(doc);
            for (const q of iePranchetaRotulos(doc)) {
                const sel = ativa && (ativa === q.L || ieAchar(doc, ativa.id)?.pai === q.L);
                ctx.fillStyle = sel ? '#e8e8e8' : '#9a9a9a';
                ctx.fillText(q.L.nome, q.x, q.y + q.h / 2);
                if (ativa === q.L) { const P = q.L.prancheta, s = ieDocTela(P.x, P.y, doc); ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(s.x) - 0.5, Math.round(s.y) - 0.5, P.w * doc.zoom + 1, P.h * doc.zoom + 1); }
            }
        }
        if (IE.verGuias && !IE.semExtras && doc.guias && doc.guias.length) {
            const { w, h } = ieVistaTam();
            ctx.lineWidth = 1;
            ctx.globalAlpha = doc.guiasTravadas ? 0.6 : 1;
            const padrao = typeof ieGuiaCorPadrao === 'function' ? ieGuiaCorPadrao() : '#00ffff';
            for (const g of doc.guias) {   // cada guia na cor dela (Nova guia / layout com cor), senão a padrão
                const s = Math.round(g.o === 'v' ? doc.px + g.p * doc.zoom : doc.py + g.p * doc.zoom) + 0.5;
                ctx.strokeStyle = g === IE.guiaArr ? '#ffffff' : g.cor || padrao;
                ctx.beginPath();
                if (g.o === 'v') { ctx.moveTo(s, 0); ctx.lineTo(s, h); } else { ctx.moveTo(0, s); ctx.lineTo(w, s); }
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            if (IE.guiaArr) {   // posição enquanto arrasta
                const g = IE.guiaArr, fat = ieUnidadeFator(doc, g.o === 'v' ? 'h' : 'v'), val = (g.p / fat).toFixed(iePref('unidade', 'px') === 'px' ? 0 : 2);
                const m = IE.mouse ? ieDocTela(IE.mouse.x, IE.mouse.y, doc) : { x: 40, y: 40 };
                const txt = `${g.o === 'v' ? 'X' : 'Y'}: ${val} ${iePref('unidade', 'px')}`;
                ctx.fillStyle = 'rgba(30,30,30,.9)'; ctx.fillRect(m.x + 14, m.y + 14, ctx.measureText(txt).width + 12, 20);
                ctx.fillStyle = '#eee'; ctx.fillText(txt, m.x + 20, m.y + 24);
            }
        }
        ctx.restore();
    };
    // Ajustar à tela: com réguas, a imagem centraliza no espaço que sobra
    const aj = ieAjustarVista;
    ieAjustarVista = function (doc = IE.doc) {
        aj(doc);
        if (!doc || !ieReguas()) return;
        const { w, h } = ieVistaTam(), r = IE_REGUA;
        const z = Math.min((w - r - 60) / doc.w, (h - r - 60) / doc.h, 1 / ieDpr());
        doc.zoom = Math.max(0.01, z);
        doc.px = Math.round(r + (w - r - doc.w * doc.zoom) / 2);
        doc.py = Math.round(r + (h - r - doc.h * doc.zoom) / 2);
        ieDesenharVista(); ieDesenharSobre(); ieStatusRender?.();
    };
    // a régua acompanha o cursor
    const st = ieStatusMouse;
    ieStatusMouse = function (...a) { const r = st.apply(this, a); try { if (ieReguas()) ieReguasDesenhar(); } catch (e) { /* sem régua */ } return r; };
})();

// ─────────────────────────── comandos e menus ───────────────────────────
// Nova guia, Novo layout de guias, Novas guias da forma, limpar: imagem-guias.js
async function ieExportarPranchetas(doc = IE.doc) {
    const api = ieApi(), lista = iePranchetas(doc);
    if (!api || !doc) return;
    if (!lista.length) { ieToast(ieT('Este documento não tem pranchetas')); return; }
    const v = await ieDialogo({ titulo: 'Pranchetas para arquivos', ok: 'Exportar', campos: [
        { id: 'fmt', rotulo: 'Formato', tipo: 'select', valor: IE.ultFmt || 'png', opcoes: [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP']] },
        { id: 'q', rotulo: 'Qualidade (JPEG/WebP)', min: 1, max: 100, valor: IE.ultQ || 92 },
        { id: 'esc', rotulo: 'Escala (%)', tipo: 'numero', min: 1, max: 400, valor: 100 },
        { id: 'vis', rotulo: 'Só as visíveis', tipo: 'check', valor: true }] });
    if (!v) return;
    IE.ultFmt = v.fmt; IE.ultQ = v.q;
    const pasta = doc.path ? doc.path.replace(/[\\/][^\\/]*$/, '') : '';
    const r = await api.ie_dialogo_salvar(doc.nome, v.fmt, pasta);
    if (!r || !r.success) return;
    const dir = r.path.replace(/[\\/][^\\/]*$/, ''), base = ieNomeArq(r.path).replace(/\.[^.]+$/, '');
    ieCarregando(`${ieT('Exportando pranchetas')}...`, 10);
    try {
        const ini = await api.ie_salvar_inicio(null), itens = [];
        const usar = lista.filter(L => !v.vis || L.visivel);
        for (const [i, L] of usar.entries()) {
            // cada prancheta composta sozinha (as outras não entram, mesmo sobrepostas)
            const P = L.prancheta, R = { x: P.x, y: P.y, w: P.w, h: P.h };
            let c = ieCanvas(P.w, P.h);
            const x = ieCtx(c);
            x.setTransform(1, 0, 0, 1, -P.x, -P.y);
            const vis = L.visivel; L.visivel = true;
            ieComporLista(x, [L], R, { x: R.x, y: R.y }, 0);
            L.visivel = vis;
            if (v.esc && v.esc !== 100) c = ieTransformarPlano({ c, x: 0, y: 0 }, [v.esc / 100, 0, 0, v.esc / 100, 0, 0]).c;
            const k = `prancheta_${i}.png`;
            await ieEnviar(ini.url, k, c);
            itens.push({ arquivo: k, destino: `${dir}\\${base}_${String(L.nome).replace(/[\\/:*?"<>|]/g, '_')}.${v.fmt}` });
            ieCarregando(null, 10 + itens.length / usar.length * 80);
        }
        const e = await api.ie_exportar_fatias({ sessao: ini.sessao, fatias: itens, qualidade: v.q, dpi: doc.dpi });
        if (e && e.success) ieToast(`${e.feitos.length} ${ieT('prancheta(s) exportada(s) em')} ${dir}`);
        else ieToast(`${ieT('Não exportou')}: ${((e && e.erros) || []).join(', ')}`);
    } finally { ieCarregando(false); }
}

Object.assign(IE_CMDS, {
    reguas: () => { iePrefGravar('reguas', !ieReguas()); ieDesenharSobre(); },
    guias: () => { IE.verGuias = !IE.verGuias; ieDesenharSobre(); },
    travarGuias: doc => { doc.guiasTravadas = !doc.guiasTravadas; ieDesenharSobre(); },
    limparGuias: doc => { doc.guias = []; doc.sujo = true; ieDesenharSobre(); },
    novaGuia: doc => ieNovaGuia(doc),
    layoutGuias: doc => ieGuiasLayout(doc),
    exportarPranchetas: doc => ieExportarPranchetas(doc),
});
Object.assign(IE_ATALHOS, { 'Ctrl+R': 'reguas', 'Ctrl+;': 'guias', 'Alt+Ctrl+;': 'travarGuias' });
(function () {
    const orig = ieCmd;
    ieCmd = async function (c) {
        if (typeof c === 'string' && c.startsWith('unidade:')) { iePrefGravar('unidade', c.slice(8)); ieDesenharSobre(); ieUiProps(); return; }
        return orig(c);
    };
    const pode = ieCmdPode;
    ieCmdPode = function (c) { if (String(c).startsWith('unidade:') || c === 'reguas' || c === 'guias') return true; if (c === 'exportarPranchetas') return ieTemPranchetas(IE.doc); return pode(c); };
    const ex = IE_MENUS.find(m => m[0] === 'Exibir')[1];
    const i = ex.findIndex(it => Array.isArray(it) && it[1] === 'grade');
    ex.splice(i >= 0 ? i + 1 : ex.length, 0, ['Réguas', 'reguas', 'Ctrl+R'],
        ['Guias', [['Mostrar guias', 'guias', 'Ctrl+;'], ['Travar guias', 'travarGuias', 'Alt+Ctrl+;'], ['Limpar guias', 'limparGuias'], '-', ['Nova guia...', 'novaGuia'], ['Novo layout de guias...', 'layoutGuias']]]);
    const arq = IE_MENUS.find(m => m[0] === 'Arquivo')[1];
    const j = arq.findIndex(it => Array.isArray(it) && it[1] === 'exportarFatias');
    arq.splice(j + 1, 0, ['Pranchetas para arquivos...', 'exportarPranchetas']);
})();
// menu de contexto simples a partir de itens ([rótulo, comando, atalho, marcado])
function ieMenuContextoItens(ev, itens) {
    const pop = ieEl('ie-pop'), rb = ieEl('ie').getBoundingClientRect();
    pop.innerHTML = ieMenuHtml(itens);
    pop.hidden = false;
    pop.style.left = ev.clientX - rb.left + 'px'; pop.style.top = ev.clientY - rb.top + 'px';
    const fechar = e => { if (e && pop.contains(e.target) && !e.target.closest('[data-cmd]')) return; pop.hidden = true; document.removeEventListener('pointerdown', fora, true); };
    const fora = e => { if (!pop.contains(e.target)) fechar(); };
    pop.onclick = e => { const b = e.target.closest('[data-cmd]'); if (b) { fechar(); ieCmd(b.dataset.cmd); } };
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
}

// ─────────────────────────── Propriedades: documento e prancheta (como no Photoshop) ───────────────────────────
(function () {
    const orig = ieUiProps;
    ieUiProps = function () {
        const doc = IE.doc, box = ieEl('ie-props'), L = doc && ieAtiva(doc);
        if (!doc || !box || (L && !L.prancheta)) return orig();
        const u = iePref('unidade', 'px'), un = n => (n / ieUnidadeFator(doc, 'h')).toFixed(u === 'px' ? 0 : 2);
        const sec = (id, tit, corpo) => `<details class="ie-pd" data-sec="${id}" ${iePref('propSec_' + id, true) ? 'open' : ''}><summary>${ieT(tit)}</summary><div class="ie-pd-c">${corpo}</div></details>`;
        let h = '';
        if (L && L.prancheta) {
            const P = L.prancheta;
            h += `<div class="ie-prop-tit">${ieT('Prancheta')}: ${ieEsc(L.nome)}</div>` + sec('prancheta', 'Prancheta', `
                <div class="ie-pd-g"><label>L <input type="number" data-pr="w" min="1" value="${P.w}"></label><label>X <input type="number" data-pr="x" value="${P.x}"></label>
                <label>A <input type="number" data-pr="h" min="1" value="${P.h}"></label><label>Y <input type="number" data-pr="y" value="${P.y}"></label></div>
                <label class="ie-pd-l">${ieT('Fundo da prancheta')} <select data-pr="fundo">${[['#ffffff', 'Branco'], ['#000000', 'Preto'], ['', 'Transparente'], ['outra', 'Outra...']].map(([v, r]) => `<option value="${v}" ${(P.fundo || '') === v || (v === 'outra' && P.fundo && !['#ffffff', '#000000'].includes(P.fundo)) ? 'selected' : ''}>${ieT(r)}</option>`).join('')}</select></label>
                <div class="ie-prop-nota">${ieT('X e Y levam o conteúdo junto; L e A mudam só o recorte.')}</div>`);
        } else {
            h += `<div class="ie-prop-tit">${ieT('Documento')}</div>` + sec('tela', 'Tela', `
                <div class="ie-pd-g"><label>L <input type="number" data-dt="w" min="1" value="${un(doc.w)}"></label><label>X <input type="number" value="0" disabled></label>
                <label>A <input type="number" data-dt="h" min="1" value="${(doc.h / ieUnidadeFator(doc, 'v')).toFixed(u === 'px' ? 0 : 2)}"></label><label>Y <input type="number" value="0" disabled></label></div>
                <div class="ie-pd-lin"><button class="ie-ico-btn ${doc.h >= doc.w ? 'on' : ''}" data-orient="retrato" title="${ieT('Retrato')}">▯</button><button class="ie-ico-btn ${doc.w > doc.h ? 'on' : ''}" data-orient="paisagem" title="${ieT('Paisagem')}">▭</button>
                    <span class="ie-pd-info">${ieT('Resolução')}: ${doc.dpi} ${ieT('pixels/polegada')}</span></div>
                <div class="ie-pd-lin"><span class="ie-pd-r">${ieT('Modo')}</span><b>${ieEsc(doc.modo || 'RGB')} · ${doc.bits || 8} ${ieT('bits/canal')}</b></div>
                ${ieTemPranchetas(doc) ? `<div class="ie-prop-nota">${iePranchetas(doc).length} ${ieT('prancheta(s)')} · ${ieT('clique no nome em cima de uma para selecionar')}</div>` : ''}`);
        }
        h += sec('reguas', 'Réguas e grades', `<div class="ie-pd-lin">
                <button class="ie-ico-btn ${ieReguas() ? 'on' : ''}" data-cmd2="reguas" title="${ieT('Réguas')} (Ctrl+R)">📏</button>
                <button class="ie-ico-btn ${IE.grade ? 'on' : ''}" data-cmd2="grade" title="${ieT('Grade')} (Ctrl+')">▦</button>
                <select data-unid title="${ieT('Unidade')}">${Object.entries(IE_UNIDADES).map(([k, [n]]) => `<option value="${k}" ${u === k ? 'selected' : ''}>${ieT(n)}</option>`).join('')}</select></div>`)
            + sec('guias', 'Guias', `<div class="ie-pd-lin">
                <button class="ie-ico-btn ${IE.verGuias ? 'on' : ''}" data-cmd2="guias" title="${ieT('Mostrar guias')} (Ctrl+;)">┼</button>
                <button class="ie-ico-btn ${doc.guiasTravadas ? 'on' : ''}" data-cmd2="travarGuias" title="${ieT('Travar guias')} (Alt+Ctrl+;)">🔒</button>
                <button class="ie-ico-btn" data-cmd2="limparGuias" title="${ieT('Limpar guias')}">✕</button>
                <button class="ie-btn ie-btn-mini" data-cmd2="novaGuia">${ieT('Nova guia...')}</button><button class="ie-btn ie-btn-mini" data-cmd2="layoutGuias">${ieT('Layout...')}</button></div>
                <div class="ie-prop-nota">${(doc.guias || []).length} ${ieT('guia(s) · arraste das réguas para criar')}</div>`)
            + sec('rapidas', 'Ações rápidas', `<div class="ie-pd-acoes">
                <button class="ie-btn ie-btn-mini" data-cmd2="tamImagem">${ieT('Tamanho da imagem')}</button><button class="ie-btn ie-btn-mini" data-cmd2="ferr:corte">${ieT('Cortar')}</button>
                <button class="ie-btn ie-btn-mini" data-cmd2="aparar">${ieT('Aparar')}</button><button class="ie-btn ie-btn-mini" data-cmd2="img:g90h">${ieT('Girar')}</button>
                <button class="ie-btn ie-btn-mini" data-cmd2="tamTela">${ieT('Tamanho da tela')}</button>${ieTemPranchetas(doc) ? `<button class="ie-btn ie-btn-mini" data-cmd2="exportarPranchetas">${ieT('Exportar pranchetas')}</button>` : ''}</div>`);
        box.innerHTML = h;
        box.querySelectorAll('details[data-sec]').forEach(d => d.addEventListener('toggle', () => iePrefGravar('propSec_' + d.dataset.sec, d.open)));
        box.querySelectorAll('[data-cmd2]').forEach(b => b.onclick = async () => {
            const c = b.dataset.cmd2;
            if (c.startsWith('ferr:')) ieEscolherFerr(c.slice(5)); else await ieCmd(c);
            setTimeout(ieUiProps, 50);
        });
        box.querySelector('[data-unid]')?.addEventListener('change', e => ieCmd('unidade:' + e.target.value));
        box.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
        // tela: L/A pelo Tamanho da tela, ancorado no centro
        box.querySelectorAll('[data-dt]').forEach(inp => inp.addEventListener('change', () => {
            const k = inp.dataset.dt, px = Math.round(+inp.value * ieUnidadeFator(doc, k === 'w' ? 'h' : 'v'));
            if (!(px >= 1)) return ieUiProps();
            const W = k === 'w' ? px : doc.w, H = k === 'h' ? px : doc.h;
            ieRedimTela(doc, Math.round((doc.w - W) / 2), Math.round((doc.h - H) / 2), W, H, true);
            ieHist(ieT('Tamanho da tela'));
            ieUiProps();
        }));
        box.querySelectorAll('[data-orient]').forEach(b => b.onclick = () => {
            const quer = b.dataset.orient, ret = doc.h >= doc.w;
            if ((quer === 'retrato') === ret) return;
            ieRedimTela(doc, Math.round((doc.w - doc.h) / 2), Math.round((doc.h - doc.w) / 2), doc.h, doc.w, true);
            ieHist(ieT('Tamanho da tela'));
            ieUiProps();
        });
        // prancheta: X/Y levam o conteúdo; L/A mudam o recorte; fundo
        box.querySelectorAll('[data-pr]').forEach(el => el.addEventListener('change', async () => {
            const P = L.prancheta, k = el.dataset.pr, Ra = ieRCamada(L);
            if (k === 'fundo') {
                if (el.value === 'outra') { ieSeletorCor(el, P.fundo || '#ffffff', c => { P.fundo = c; L.pranchetaMudou = true; ieInvalidar(L); ieAgendar(ieRCamada(L), doc); }); return; }
                P.fundo = el.value || null;
            } else if (k === 'x' || k === 'y') {
                const d = Math.round(+el.value) - P[k];
                const dx = k === 'x' ? d : 0, dy = k === 'y' ? d : 0;
                iePercorrer(L.filhos, X => { if (X.tipo !== 'grupo') { ieMoverCamada(X, dx, dy); X.movido = true; } });
                P.x += dx; P.y += dy;
            } else P[k] = Math.max(1, Math.round(+el.value));
            L.pranchetaMudou = true;
            iePercorrer(L.filhos, X => ieInvalidar(X));
            ieAgendar(ieRUniao(Ra, ieRCamada(L)), doc);
            ieHist(ieT('Prancheta'));
            ieUiProps();
        }));
    };
})();
