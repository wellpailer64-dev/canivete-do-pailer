// =========================================================
// Editor de Imagem — texto.
// L.txt = {s, fam, gdi (família CSS/GDI), neg, ital, peso, ps (nome PostScript), tam, cor, alin, esp (milésimos de
// eme), ent (entrelinha em px; 0 = automática 120%), caixa: null | [esq, topo, dir, base] (texto de parágrafo), m}
// m = matriz do espaço do texto para o documento; a origem é a linha de base da 1ª linha no ponto de alinhamento
// (texto de ponto), como no Photoshop. Texto vindo do PSD: até ser editado mostra os pixels do Photoshop; editado,
// o Python troca o conteúdo da camada de texto (continua texto no Photoshop, com o estilo do começo).
// =========================================================

const IE_NL = String.fromCharCode(10);
// o que o painel Caractere/Parágrafo muda (e o que vai para o PSD quando muda)
const IE_TX_CHAVES = ['tam', 'cor', 'esp', 'ent', 'alin', 'escH', 'escV', 'desloc', 'pos', 'versalete', 'caixaAlta', 'sublinhado', 'tachado', 'kern', 'negFalso', 'itaFalso', 'recuoEsq', 'recuoDir', 'recuo1', 'espAntes', 'espDepois', 'hifen'];

function ieFonteCss(t, tam = t.tam) {
    // fonte carregada do arquivo (FontFace): a face já é o estilo certo; negrito/itálico só se forem falsos (do PSD)
    if (t.css && IE.fontesOk && IE.fontesOk.has(t.css))   // fonte variável: o peso escolhe a instância (Thin...Black)
        return `${t.itaFalso ? 'italic ' : ''}${t.varPeso ? (t.negFalso ? Math.min(1000, t.varPeso + 300) : t.varPeso) : t.negFalso ? 'bold' : 'normal'} ${Math.max(0.5, tam)}px "${t.css}", "${t.gdi || t.fam || 'Arial'}", sans-serif`;
    return `${t.ital ? 'italic ' : ''}${t.neg ? 'bold' : (t.peso && !t.gdi ? t.peso : 'normal')} ${Math.max(0.5, tam)}px "${t.gdi || t.fam || 'Arial'}", sans-serif`;
}

// carrega o arquivo da fonte do estilo escolhido como uma família própria da página. O nome GDI (cortado em 31
// letras) e as famílias tipográficas não batem com o CSS: sem isso o texto caía numa fonte qualquer.
IE.fontesOk = new Set();
IE.fontesCarregando = new Map();
async function ieGarantirFonte(t) {
    const e = ieEstiloDe(t.fam, t.estilo);
    if (!e) { t.css = null; return false; }
    t.varPeso = e.var ? e.peso : 0;
    const chave = (e.arquivo || e.ps || t.fam + ' ' + e.estilo) + '#' + (e.indice || 0) + (e.var ? '#var' : '');
    const alias = 'ief-' + Array.from(chave).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(36);
    t.css = alias;
    if (IE.fontesOk.has(alias)) return true;
    if (!IE.fontesCarregando.has(alias)) {
        IE.fontesCarregando.set(alias, (async () => {
            const fontes = [];
            if (!e.var) for (const n of [e.completo, e.ps]) if (n) fontes.push(`local("${String(n).replace(/"/g, '')}")`);
            if (e.arquivo && !(e.indice > 0)) {
                try { const r = await window.pywebview.api.ie_fonte_url(e.arquivo); if (r && r.success) fontes.push(`url("${r.url}")`); } catch (x) { /* sem API */ }
            }
            for (const src of [fontes.join(', '), ...fontes]) {   // tudo junto; se falhar, uma por uma
                if (!src) continue;
                try {
                    const ff = new FontFace(alias, src, e.var ? { weight: `${e.var[0]} ${e.var[1]}` } : {});
                    await ff.load();
                    document.fonts.add(ff);
                    IE.fontesOk.add(alias);
                    return true;
                } catch (x) { /* tenta a próxima */ }
            }
            return false;
        })());
    }
    const ok = await IE.fontesCarregando.get(alias);
    if (!ok) t.css = null;
    return ok;
}

let ieMedidor = null;
// tamanho da letra desenhada (sobrescrito/subscrito usam 58,3%, como no Photoshop) e o quanto a linha de base sobe
const ieTxTam = t => t.tam * (t.pos ? 0.583 : 1);
const ieTxSobe = t => (t.desloc || 0) + (t.pos === 'sobrescrito' ? t.tam * 0.333 : t.pos === 'subscrito' ? -t.tam * 0.167 : 0);
function ieTxFonte(x, t) {
    x.font = ieFonteCss(t, ieTxTam(t));
    x.letterSpacing = (t.esp || 0) / 1000 * t.tam + 'px';
    x.fontKerning = t.kern === 0 ? 'none' : 'normal';
    x.fontVariantCaps = t.versalete && !t.caixaAlta ? 'small-caps' : 'normal';
}
function ieMedir(t) {
    if (!ieMedidor) ieMedidor = ieCtx(ieCanvas(4, 4));
    ieTxFonte(ieMedidor, t);
    return ieMedidor;
}
// ── trechos: estilos diferentes dentro da mesma caixa (peso, fonte, cor, sublinhado), como no Photoshop ──
// t.trechos = [{a, b, ...chaves de IE_TX_TRECHO}] sobre os índices de t.s; o que não está num trecho usa o estilo da caixa
const IE_TX_TRECHO = ['fam', 'estilo', 'gdi', 'peso', 'neg', 'ital', 'ps', 'css', 'negFalso', 'itaFalso', 'cor', 'sublinhado', 'tachado'];
const IE_TX_FONTE_K = ['fam', 'estilo', 'gdi', 'peso', 'neg', 'ital', 'ps', 'css', 'negFalso', 'itaFalso'];
function ieTxTemTrechos(t) { return !!(t && t.trechos && t.trechos.length); }
function ieTxEstiloEm(t, i) { let st = t; for (const r of t.trechos || []) if (i >= r.a && i < r.b) st = { ...st, ...r }; return st; }
// pedaços de s (que começa no índice i0 do texto) com estilo constante: [{s, t, i}]
function ieTxSegmentos(t, s, i0) {
    if (!ieTxTemTrechos(t)) return [{ s, t, i: i0 }];
    const cortes = new Set([0, s.length]);
    for (const r of t.trechos) for (const v of [r.a, r.b]) if (v > i0 && v < i0 + s.length) cortes.add(v - i0);
    const c = [...cortes].sort((x, y) => x - y), out = [];
    for (let k = 0; k < c.length - 1; k++) out.push({ s: s.slice(c[k], c[k + 1]), t: ieTxEstiloEm(t, i0 + c[k]), i: i0 + c[k] });
    return out;
}
function ieTxLargura(t, s, i0) {
    const sh = (t.escH || 100) / 100;
    if (!ieTxTemTrechos(t)) return ieMedir(t).measureText(s).width * sh;
    let w = 0; for (const g of ieTxSegmentos(t, s, i0)) w += ieMedir(g.t).measureText(g.s).width * sh;
    return w;
}
// por caractere → trechos (sem as chaves iguais às da caixa; vizinhos iguais juntos)
function ieTxPorCaractere(t, n = String(t.s || '').length) {
    const arr = Array.from({ length: n }, () => ({}));
    for (const r of t.trechos || []) for (let i = Math.max(0, r.a); i < Math.min(n, r.b); i++) for (const k of IE_TX_TRECHO) if (r[k] !== undefined) arr[i][k] = r[k];
    return arr;
}
function ieTxCompactar(t, arr) {
    const out = [];
    const limpo = o => { const d = {}; for (const k of IE_TX_TRECHO) if (o[k] !== undefined && o[k] !== t[k] && !(o[k] === false && !t[k])) d[k] = o[k]; return d; };
    arr.forEach((o, i) => {
        const d = limpo(o), j = JSON.stringify(d), u = out[out.length - 1];
        if (j === '{}') return;
        if (u && u.b === i && u._j === j) u.b = i + 1; else out.push({ a: i, b: i + 1, ...d, _j: j });
    });
    out.forEach(r => delete r._j);
    t.trechos = out.length ? out : undefined;
}
function ieTxTrechoAplicar(t, a, b, sobre) {
    const arr = ieTxPorCaractere(t);
    for (let i = a; i < b; i++) Object.assign(arr[i], sobre);
    ieTxCompactar(t, arr);
}
// o texto mudou (digitação): os trechos acompanham; o que entrou herda o estilo do caractere antes
function ieTxTrechosEditar(t, sAntes, sDepois) {
    if (!ieTxTemTrechos(t) || sAntes === sDepois) return;
    let p = 0; while (p < sAntes.length && p < sDepois.length && sAntes[p] === sDepois[p]) p++;
    let q = 0; while (q < sAntes.length - p && q < sDepois.length - p && sAntes[sAntes.length - 1 - q] === sDepois[sDepois.length - 1 - q]) q++;
    const arr = ieTxPorCaractere(t, sAntes.length), herda = arr[p - 1] || arr[sAntes.length - q] || {};
    const novo = [...arr.slice(0, p), ...Array.from({ length: sDepois.length - p - q }, () => ({ ...herda })), ...arr.slice(sAntes.length - q)];
    ieTxCompactar(t, novo);
}
// mudou o estilo da caixa inteira: os trechos param de sobrescrever essas chaves
function ieTxTrechosSoltar(t, chaves) {
    if (!ieTxTemTrechos(t)) return;
    const arr = ieTxPorCaractere(t); arr.forEach(o => chaves.forEach(k => delete o[k])); ieTxCompactar(t, arr);
}

// parágrafo: alinhamento (left/center/right/justify-left/-center/-right/-all; 'justify' antigo = justify-left), recuos e espaços
function ieTxPar(t) {
    let al = t.alin || 'left';
    if (al === 'justify') al = 'justify-left';
    return { al, re: +t.recuoEsq || 0, rd: +t.recuoDir || 0, r1: +t.recuo1 || 0, ea: +t.espAntes || 0, ed: +t.espDepois || 0 };
}

// linhas com posição no espaço do texto: [{s, x, y (linha de base), w (largura na tela), wl (largura desenhada), just}]
function ieTextoLayout(t) {
    const x = ieMedir(t), sh = (t.escH || 100) / 100;
    const adv = t.ent > 0 ? t.ent : t.tam * 1.2;
    const txt = t.caixaAlta ? String(t.s || '').toUpperCase() : String(t.s || '');
    const P = ieTxPar(t), med = (s, i0 = 0) => (ieTxTemTrechos(t) ? ieTxLargura(t, s, i0) : x.measureText(s).width * sh);
    const m0 = x.measureText('Hg');
    const asc = (m0.fontBoundingBoxAscent || t.tam * 0.8) * ((t.escV || 100) / 100);
    // caixa de parágrafo: a 1ª linha de base fica no ascendente TIPOGRÁFICO da fonte (OS/2 sTypoAscender, lido em
    // Functions/fontes.py), como no Photoshop; o do navegador (hhea) descia o texto ~10 px a 48 px em Times
    const est = t.caixa ? ieEstiloDe(t.fam, t.estilo) : null;
    const ascCaixa = est && est.asc ? est.asc * t.tam * ((t.escV || 100) / 100) : asc;
    const base0 = t.caixa ? t.caixa[1] + ascCaixa : 0;
    const out = [];
    let y = 0, off = 0;
    txt.split(IE_NL).forEach((par, pi) => {
        if (pi) y += P.ed + P.ea;
        let linhas = [par];
        if (t.caixa) {
            linhas = [];
            let atual = '', ini = 0, pos = 0;   // ini/pos: índice no parágrafo (os trechos medem pelo índice)
            par.split(' ').forEach(p => {
                const tenta = atual ? atual + ' ' + p : p;
                const larg = t.caixa[2] - t.caixa[0] - P.re - P.rd - (linhas.length ? 0 : P.r1);
                if (atual && med(tenta, off + ini) > larg) { linhas.push(atual); atual = p; ini = pos; } else { if (!atual) ini = pos; atual = tenta; }
                pos += p.length + 1;
            });
            linhas.push(atual);
        }
        let procura = 0;
        linhas.forEach((s, li) => {
            const achou = par.indexOf(s, procura);
            const inicio = achou >= 0 ? achou : procura;
            const w = med(s, off + inicio), ultima = li === linhas.length - 1, ini = P.re + (li ? 0 : P.r1);
            let al = P.al, just = 0, wl = w;
            if (al.startsWith('justify')) al = !ultima || al === 'justify-all' ? 'justify' : al.slice(8);
            let lx;
            if (t.caixa) {
                const a = t.caixa[0] + ini, b = t.caixa[2] - P.rd;
                lx = al === 'center' ? (a + b) / 2 - w / 2 : al === 'right' ? b - w : a;
                const n = s.split(' ').length - 1;
                if (al === 'justify' && n > 0 && b - a > w) { just = (b - a - w) / n; wl = b - a; }
            } else lx = al === 'center' ? -w / 2 + (ini - P.rd) / 2 : al === 'right' ? -w - P.rd : ini;
            out.push({ s, x: lx, y: base0 + y, w, wl, just, idx: off + inicio });
            procura = inicio + s.length + (linhas.length > 1 && li < linhas.length - 1 ? 1 : 0);
            y += adv;
        });
        off += par.length + 1;
    });
    return out;
}

function ieTextoCaixaLocal(t, linhas = ieTextoLayout(t)) {
    const x = ieMedir(t), sh = (t.escH || 100) / 100, sv = (t.escV || 100) / 100, sobe = ieTxSobe(t), tam = ieTxTam(t);
    const m0 = x.measureText('Hg');
    const asc = Math.max(m0.fontBoundingBoxAscent || 0, m0.actualBoundingBoxAscent || 0, tam * 0.8) * sv;
    const desc = Math.max(m0.fontBoundingBoxDescent || 0, m0.actualBoundingBoxDescent || 0, tam * 0.25) * sv;
    let R = null;
    for (const l of linhas) {
        const mt = x.measureText(l.s || ' ');
        const esq = Math.min(0, -(mt.actualBoundingBoxLeft || 0) * sh), dir = Math.max(l.wl, (mt.actualBoundingBoxRight || 0) * sh);
        R = ieRUniao(R, { x: l.x + esq - t.tam * 0.1, y: l.y - sobe - asc, w: dir - esq + t.tam * 0.25, h: asc + desc });
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
    ieTxFonte(x, t);
    x.fillStyle = t.cor || '#000';
    x.textBaseline = 'alphabetic';
    const sh = (t.escH || 100) / 100, sv = (t.escV || 100) / 100, sobe = ieTxSobe(t), tam = ieTxTam(t);
    for (const l of linhas) {
        x.save();
        x.translate(l.x, l.y - sobe);
        x.scale(sh, sv);   // escala horizontal/vertical do painel Caractere
        if (ieTxTemTrechos(t)) {   // trechos: troca fonte/cor no meio da linha (justificado: o que sobra vai nos espaços)
            let px = 0;
            const e = Math.max(1, tam * 0.06);
            for (const g of ieTxSegmentos(t, l.s, l.idx)) {
                ieTxFonte(x, g.t); x.fillStyle = g.t.cor || '#000';
                const x0 = px;
                if (!l.just) { x.fillText(g.s, px, 0); px += x.measureText(g.s).width; }
                else g.s.split(' ').forEach((p, k, todas) => { x.fillText(p, px, 0); px += x.measureText(p).width; if (k < todas.length - 1) px += x.measureText(' ').width + l.just / sh; });
                if (g.t.sublinhado) x.fillRect(x0, tam * 0.12, px - x0, e);
                if (g.t.tachado) x.fillRect(x0, -tam * 0.3, px - x0, e);
            }
            x.restore();
            continue;
        }
        if (!l.just) x.fillText(l.s, 0, 0);
        else {   // justificado: palavra por palavra, com o espaço que sobra dividido entre elas
            let px = 0;
            for (const p of l.s.split(' ')) { x.fillText(p, px, 0); px += x.measureText(p + ' ').width + l.just / sh; }
        }
        const lw = l.wl / sh, e = Math.max(1, tam * 0.06);
        if (t.sublinhado) x.fillRect(0, tam * 0.12, lw, e);
        if (t.tachado) x.fillRect(0, -tam * 0.3, lw, e);
        x.restore();
    }
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
// silencioso: sem avisos (usado para redesenhar o texto ao transformar); semFonte/misto dizem se dá para redesenhar igual
async function ieTextoDoPsd(L, silencioso = false) {
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
        escH: run.esc_h ?? 100, escV: run.esc_v ?? 100, desloc: run.desloc || 0, pos: run.pos || '', versalete: !!run.versalete,
        sublinhado: !!run.sublinhado, tachado: !!run.tachado, kern: run.kern ?? 'metricas',
    };
    const par = t.par || {};
    Object.assign(txt, { alin: par.alin || txt.alin, recuoEsq: par.recuo_esq || 0, recuoDir: par.recuo_dir || 0, recuo1: par.recuo1 || 0,
        espAntes: par.esp_antes || 0, espDepois: par.esp_depois || 0, hifen: !!par.hifen });
    if (f) ieAplicarEstiloFonte(txt, f.fam, f.e);
    else { ieAplicarEstiloFonte(txt, 'Arial', ieEstiloDe('Arial', 'Regular')); txt.semFonte = true; if (!silencioso) ieToast(`${ieT('Fonte')} ${run.fonte} ${ieT('não instalada: usando Arial')}`); }
    if (run.neg && !txt.neg) { txt.neg = true; txt.negFalso = true; }
    if (run.ita && !txt.ital) { txt.ital = true; txt.itaFalso = true; }
    await ieGarantirFonte(txt);
    if (t.misto) { txt.misto = true; if (!silencioso) ieToast(ieT('Texto com estilos misturados: ao editar, fica com o estilo do começo')); }
    txt.psOrig = run.fonte;
    txt.orig = Object.fromEntries(IE_TX_CHAVES.map(k => [k, txt[k]]));
    return txt;
}

// ─────────────────────────── edição na tela ───────────────────────────
IE.edTexto = null;   // {L, nova, antes}

function ieTextoIndiceNoPonto(L, p) {
    const t = L && L.txt;
    if (!t || !p) return null;
    const q = ieMatPt(ieMatInv(t.m || IE_ID), p.x, p.y);
    const linhas = ieTextoLayout(t);
    if (!linhas.length) return 0;
    const raw = String(t.s || '');
    const sh = (t.escH || 100) / 100;
    const x = ieMedir(t);
    let melhor = linhas[0], melhorDist = Infinity;
    for (const l of linhas) {
        const d = Math.abs(q.y - l.y);
        if (d < melhorDist) { melhor = l; melhorDist = d; }
    }
    const base = Math.min(raw.length, melhor.idx || 0);
    const sx = (q.x - melhor.x) / sh;
    if (sx <= 0 || !melhor.s) return base;
    let pos = melhor.s.length, melhorErro = Infinity;
    for (let i = 0; i <= melhor.s.length; i++) {
        const w = x.measureText(melhor.s.slice(0, i)).width;
        const erro = Math.abs(sx - w);
        if (erro < melhorErro) { melhorErro = erro; pos = i; }
    }
    return ieClamp(base + pos, 0, raw.length);
}

function ieTextoNoPonto(doc, p) {
    if (!doc || !p) return null;
    const ordem = [];
    const visitar = (lista, visivel) => {
        for (const L of lista) {
            const v = visivel && L.visivel;
            if (L.filhos) visitar(L.filhos, v);
            else if (v && L.txt) ordem.push(L);
        }
    };
    visitar(doc.camadas, true);
    for (let i = ordem.length - 1; i >= 0; i--) {
        const L = ordem[i], t = L.txt, q = ieMatPt(ieMatInv(t.m || IE_ID), p.x, p.y);
        const B = ieTextoCaixaLocal(t);
        const tol = Math.max(2, t.tam * 0.08);
        if (q.x >= B.x - tol && q.y >= B.y - tol && q.x <= B.x + B.w + tol && q.y <= B.y + B.h + tol) return L;
    }
    return null;
}

async function ieTextoEditar(L, nova = false, ponto = null) {
    const doc = IE.doc;
    if (!L) return;
    if (!L.txt) {
        if (L.texto) {
            const t = await ieTextoDoPsd(L);
            if (!t) { ieToast(ieT('Não consegui ler o texto desta camada')); return; }
            L.txt = t;
        } else return;
    }
    if (!L.txt.css || !IE.fontesOk.has(L.txt.css)) await ieGarantirFonte(L.txt);
    ieTextoEncerrar(true);
    ieAtivar(L.id, doc);
    IE.edTexto = { L, nova, antes: JSON.stringify(L.txt), sAntes: L.txt.s, Rantes: ieRCamada(L) };
    L._editando = true;
    L._rasterAntes = L.c ? { c: L.c, x: L.x, y: L.y } : null;
    const ta = ieEl('ie-texto-edit');
    ta.value = L.txt.s || '';
    ta.hidden = false;
    const caret = ponto ? ieTextoIndiceNoPonto(L, ponto) : null;
    ieTextoPosicionar();
    setTimeout(() => {
        ta.focus();
        if (caret != null) ta.setSelectionRange(caret, caret);
        else if (!nova) ta.select();
    }, 0);
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
        const Rv = ieRCamada(L);
        if (L._rasterAntes) { L.c = L._rasterAntes.c; L.x = L._rasterAntes.x; L.y = L._rasterAntes.y; }
        ieInvalidar(L);
        ieAgendar(ieRUniao(ed.Rantes, Rv), doc);
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
        ieTxTrechosEditar(ed.L.txt, ed.L.txt.s || '', ta.value);
        ed.L.txt.s = ta.value;
        ieTextoPosicionar();
        ieTextoAoVivo(ed.L);
    });
    ta.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (typeof ieTextoAtalho === 'function' && ieTextoAtalho(ev)) { ev.preventDefault(); return; }
        if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.location === 3))) { ev.preventDefault(); ieTextoEncerrar(true); }
    });
    ta.addEventListener('pointerdown', ev => ev.stopPropagation());
}

// mudou estilo pela barra de opções: vale para o texto em edição ou para as camadas de texto selecionadas
// escala da matriz do texto (o tamanho que aparece = t.tam × escala, como no Photoshop depois de transformar)
function ieTextoEscala(t) { const m = (t && t.m) || IE_ID; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }

function ieTextoEstilo(mud) {
    const doc = IE.doc;
    Object.assign(IE.op.texto, mud);
    if (mud.tamEf !== undefined) IE.op.texto.tam = mud.tamEf;
    if (!doc) return;
    const ed = IE.edTexto;
    const alvos = ed ? [ed.L] : ieSelecionadas(doc).filter(L => L.txt || L.texto);
    if (!alvos.length) return;
    // editando com PARTE do texto selecionada: fonte/peso/cor/sublinhado valem só para o trecho (como no Photoshop)
    const ta = ieEl('ie-texto-edit'), sa = ed && ta ? ta.selectionStart : 0, sb = ed && ta ? ta.selectionEnd : 0;
    const chavesTr = ['fam', 'estilo', 'cor', 'sublinhado', 'tachado', 'negFalso', 'itaFalso'];
    if (ed && sb > sa && !(sa === 0 && sb === String(ed.L.txt.s || '').length) && Object.keys(mud).every(k => chavesTr.includes(k))) {
        (async () => {
            const t = ed.L.txt, base = ieTxEstiloEm(t, sa), sobre = {};
            if (mud.fam !== undefined || mud.estilo !== undefined) {
                const tmp = { ...base, tam: t.tam };
                ieAplicarEstiloFonte(tmp, mud.fam ?? base.fam, ieEstiloDe(mud.fam ?? base.fam, mud.estilo ?? base.estilo));
                tmp.negFalso = tmp.itaFalso = false;
                await ieGarantirFonte(tmp);
                for (const k of IE_TX_FONTE_K) sobre[k] = tmp[k];
            }
            for (const k of ['cor', 'sublinhado', 'tachado']) if (mud[k] !== undefined) sobre[k] = mud[k];
            if (mud.negFalso !== undefined) { sobre.negFalso = mud.negFalso; sobre.neg = mud.negFalso || base.neg; }
            if (mud.itaFalso !== undefined) { sobre.itaFalso = mud.itaFalso; sobre.ital = mud.itaFalso || base.ital; }
            ieTxTrechoAplicar(t, sa, sb, sobre);
            ieTextoPosicionar(); ieTextoAoVivo(ed.L);
            ta.focus(); ta.setSelectionRange(sa, sb);
        })();
        return;
    }
    (async () => {
        for (const L of alvos) {
            if (!L.txt) { L.txt = await ieTextoDoPsd(L); if (!L.txt) continue; }
            const t = L.txt;
            // a caixa inteira mudou: os trechos param de sobrescrever o que mudou
            ieTxTrechosSoltar(t, [...(mud.fam !== undefined || mud.estilo !== undefined ? IE_TX_FONTE_K : []), ...['cor', 'sublinhado', 'tachado'].filter(k => mud[k] !== undefined)]);
            if (mud.fam !== undefined || mud.estilo !== undefined) t.fonteMudou = true;
            if (mud.fam !== undefined || mud.estilo !== undefined) {
                ieAplicarEstiloFonte(t, mud.fam ?? t.fam, ieEstiloDe(mud.fam ?? t.fam, mud.estilo ?? t.estilo));
                t.negFalso = t.itaFalso = false;
                await ieGarantirFonte(t);
            }
            for (const k of IE_TX_CHAVES) if (mud[k] !== undefined && k !== 'negFalso' && k !== 'itaFalso') t[k] = mud[k];
            if (mud.caixaAlta) t.versalete = false;
            if (mud.versalete) t.caixaAlta = false;
            if (mud.tamEf !== undefined) t.tam = Math.max(0.5, mud.tamEf / ieTextoEscala(t));
            if (mud.negFalso !== undefined) { t.negFalso = mud.negFalso; const e = ieEstiloDe(t.fam, t.estilo); t.neg = mud.negFalso || !!(e && e.gdi_negrito); }
            if (mud.itaFalso !== undefined) { t.itaFalso = mud.itaFalso; const e = ieEstiloDe(t.fam, t.estilo); t.ital = mud.itaFalso || !!(e && (e.italico || e.gdi_italico)); }
            if (ed) { ieTextoPosicionar(); ieTextoAoVivo(L); continue; }
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
        const alvo = ieTextoNoPonto(doc, p) || ieCamadaNoPonto(doc, p.x, p.y);
        if (alvo && (alvo.txt || alvo.texto)) { ieTextoEditar(alvo, false, p); return; }
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
        await ieGarantirFonte(t);
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

// enquanto edita, o texto é desenhado de verdade na tela (fonte, cor e efeitos da camada); a caixa por cima é
// transparente e só mostra o cursor e a seleção, como no Photoshop
function ieTextoAoVivo(L) {
    const doc = IE.doc;
    if (!L || !L.txt || !doc) return;
    const Ra = ieRCamada(L);
    ieTextoRender(L);
    ieAgendar(ieRUniao(Ra, ieRCamada(L)), doc);
}

// o que mudou no estilo de um texto do Photoshop (só isso vai para o arquivo; o resto fica como estava)
function ieEstiloMudado(t) {
    const o = t.orig || {}, e = {};
    for (const k of IE_TX_CHAVES) if (t[k] !== o[k] && !(t[k] === undefined && !o[k])) e[k] = t[k] ?? null;
    if (t.fonteMudou && t.ps) e.ps = t.ps;
    return Object.keys(e).length ? e : null;
}

// ─────────────────────────── painéis Caractere e Parágrafo (e o Propriedades do texto) ───────────────────────────
const IE_TX_ICO = {   // ícones pequenos no lugar dos rótulos, como no Photoshop
    tam: '<svg viewBox="0 0 16 16"><path d="M2 3h7M5.5 3v10M9 7h5M11.5 7v6" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>',
    ent: '<svg viewBox="0 0 16 16"><path d="M3 2v12M1.5 4 3 2l1.5 2M1.5 12 3 14l1.5-2M7 4h6M9.5 4v4M7 10h6M9.5 10v4" stroke="currentColor" fill="none" stroke-width="1.3"/></svg>',
    kern: '<svg viewBox="0 0 16 16"><text x="1" y="12" font-size="10" fill="currentColor" font-family="Arial">V/A</text></svg>',
    esp: '<svg viewBox="0 0 16 16"><text x="0" y="10" font-size="9" fill="currentColor" font-family="Arial">VA</text><path d="M1 13.5h14M1 12v3M15 12v3" stroke="currentColor" stroke-width="1"/></svg>',
    escV: '<svg viewBox="0 0 16 16"><text x="5" y="13" font-size="13" fill="currentColor" font-family="Arial">T</text><path d="M2 2v12" stroke="currentColor"/></svg>',
    escH: '<svg viewBox="0 0 16 16"><text x="3" y="11" font-size="11" fill="currentColor" font-family="Arial">T</text><path d="M1 14h14" stroke="currentColor"/></svg>',
    desloc: '<svg viewBox="0 0 16 16"><text x="1" y="11" font-size="10" fill="currentColor" font-family="Arial">A</text><text x="9" y="8" font-size="7" fill="currentColor" font-family="Arial">a</text><path d="M1 14h14" stroke="currentColor"/></svg>',
};
function ieTxValores(t, run) {
    const o = IE.op.texto, v = (k, pad) => (t && t[k] !== undefined ? t[k] : o[k] !== undefined ? o[k] : pad);
    return {
        fam: t ? t.fam : (run ? run.fonte : o.fam || 'Arial'), estilo: t ? t.estilo : o.estilo || '', tam: +(v('tam', 72) * ieTextoEscala(t)).toFixed(2),
        ent: Math.round(v('ent', 0)), esp: Math.round(v('esp', 0)), kern: v('kern', 'metricas'), escH: v('escH', 100), escV: v('escV', 100),
        desloc: v('desloc', 0), cor: v('cor', IE.cor[0]), alin: v('alin', 'left') === 'justify' ? 'justify-left' : v('alin', 'left'),
        recuoEsq: v('recuoEsq', 0), recuoDir: v('recuoDir', 0), recuo1: v('recuo1', 0), espAntes: v('espAntes', 0), espDepois: v('espDepois', 0), hifen: !!v('hifen', false),
        negFalso: !!v('negFalso', false), itaFalso: !!v('itaFalso', false), caixaAlta: !!v('caixaAlta', false), versalete: !!v('versalete', false),
        pos: v('pos', ''), sublinhado: !!v('sublinhado', false), tachado: !!v('tachado', false),
    };
}
function ieCaractereHtml(t, run) {
    const V = ieTxValores(t, run);
    const estilos = ((IE.estilos || {})[V.fam] || []).map(e => e.estilo);
    const css = t && t.css && IE.fontesOk.has(t.css) ? `font-family:'${t.css}'` : `font-family:'${ieEsc(V.fam)}'`;
    const num = (k, tit, extra = '') => `<label class="ie-car-c" title="${ieT(tit)}"><i>${IE_TX_ICO[k]}</i><input type="number" data-tx="${k === 'tam' ? 'tamEf' : k}" value="${k === 'tam' ? V.tam : V[k]}" ${extra}></label>`;
    const bt = (k, v, tit, rot) => `<button data-tx="${k}" ${v !== undefined ? `data-v="${v}"` : ''} class="${(v !== undefined ? V[k] === v : V[k]) ? 'on' : ''}" title="${ieT(tit)}">${rot}</button>`;
    return `<div class="ie-car">
        <div class="ie-car-l2"><button class="ie-fonte-btn" data-tx="famPick" title="${ieT('Fonte')}"><span style="${css}">${ieEsc(V.fam)}</span>${ieIco('chev')}</button>
            <select data-tx="estilo" title="${ieT('Estilo da fonte')}">${(estilos.length ? estilos : [V.estilo || 'Regular']).map(e => `<option ${e === V.estilo ? 'selected' : ''}>${ieEsc(e)}</option>`).join('')}</select></div>
        <div class="ie-car-l2">${num('tam', 'Tamanho da fonte (px)', 'min="0.5" step="0.5"')}
            <label class="ie-car-c" title="${ieT('Entrelinha (0 = automática)')}"><i>${IE_TX_ICO.ent}</i><input type="number" data-tx="ent" min="0" value="${V.ent}" placeholder="${ieT('(Auto)')}"></label></div>
        <div class="ie-car-l2"><label class="ie-car-c" title="${ieT('Kerning entre dois caracteres')}"><i>${IE_TX_ICO.kern}</i><select data-tx="kern">
                <option value="metricas" ${V.kern === 'metricas' ? 'selected' : ''}>${ieT('Métricas')}</option><option value="optico" ${V.kern === 'optico' ? 'selected' : ''}>${ieT('Óptico')}</option><option value="0" ${V.kern === 0 || V.kern === '0' ? 'selected' : ''}>0</option></select></label>
            ${num('esp', 'Espaçamento entre letras (milésimos de eme)', 'step="10"')}</div>
        <div class="ie-car-l2">${num('escV', 'Escala vertical (%)', 'min="1" max="1000"')}${num('escH', 'Escala horizontal (%)', 'min="1" max="1000"')}</div>
        <div class="ie-car-l2">${num('desloc', 'Deslocamento da linha de base (px)', 'step="0.5"')}
            <label class="ie-car-c" title="${ieT('Cor do texto')}"><i>${ieT('Cor')}:</i><button class="ie-cor ie-car-cor" data-tx="cor" style="background:${V.cor}"></button></label></div>
        <div class="ie-car-bts">${bt('negFalso', undefined, 'Negrito falso', '<b>T</b>')}${bt('itaFalso', undefined, 'Itálico falso', '<i>T</i>')}${bt('caixaAlta', undefined, 'Tudo em maiúsculas', 'TT')}${bt('versalete', undefined, 'Versalete', 'Tᴛ')}
            ${bt('pos', 'sobrescrito', 'Sobrescrito', 'T¹')}${bt('pos', 'subscrito', 'Subscrito', 'T₁')}${bt('sublinhado', undefined, 'Sublinhado', '<u>T</u>')}${bt('tachado', undefined, 'Tachado', '<s>T</s>')}</div>
    </div>`;
}
const IE_ALIN_ICO = a => {   // linhas do ícone de alinhamento
    const ls = [[0, 14], [0, 10], [0, 14], [0, 8]].map(([, w], i) => {
        const ult = i === 3, J = a.startsWith('justify'), base = J && (!ult || a === 'justify-all') ? 'just' : J ? a.slice(8) : a;
        const lw = base === 'just' ? 14 : w;
        const x = base === 'center' ? 1 + (14 - lw) / 2 : base === 'right' ? 15 - lw : 1;
        return `<path d="M${x} ${3 + i * 3.4}h${lw}" stroke="currentColor" stroke-width="1.6"/>`;
    }).join('');
    return `<svg viewBox="0 0 16 16">${ls}</svg>`;
};
function ieParagrafoHtml(t, run) {
    const V = ieTxValores(t, run);
    const al = [['left', 'Alinhar texto à esquerda'], ['center', 'Centralizar texto'], ['right', 'Alinhar texto à direita'], ['justify-left', 'Justificar a última à esquerda'],
        ['justify-center', 'Justificar a última centralizada'], ['justify-right', 'Justificar a última à direita'], ['justify-all', 'Justificar tudo']];
    const n = (k, tit, rot) => `<label class="ie-car-c" title="${ieT(tit)}"><i class="ie-car-txt">${rot}</i><input type="number" data-tx="${k}" step="0.5" value="${V[k]}"></label>`;
    return `<div class="ie-car">
        <div class="ie-car-bts ie-par-alin">${al.map(([a, tit]) => `<button data-tx="alin" data-v="${a}" class="${V.alin === a ? 'on' : ''}" title="${ieT(tit)}">${IE_ALIN_ICO(a)}</button>`).join('')}</div>
        <div class="ie-car-l2">${n('recuoEsq', 'Recuo da margem esquerda (px)', '→▌')}${n('recuoDir', 'Recuo da margem direita (px)', '▐←')}</div>
        <div class="ie-car-l2">${n('recuo1', 'Recuo da primeira linha (px)', '→¶')}<span></span></div>
        <div class="ie-car-l2">${n('espAntes', 'Espaço antes do parágrafo (px)', '↥¶')}${n('espDepois', 'Espaço depois do parágrafo (px)', '¶↧')}</div>
        <label class="ie-ls-chk" title="${ieT('Gravado no PSD; o editor ainda não divide as palavras na tela')}"><input type="checkbox" data-tx="hifen" ${V.hifen ? 'checked' : ''}> ${ieT('Hifenizar')}</label>
    </div>`;
}
// Propriedades de uma camada de texto: Caractere + Parágrafo juntos (como no Photoshop)
function ieTextoPropsHtml(t, run) {
    return `<div class="ie-prop-sub2">${ieT('Caractere')}</div>${ieCaractereHtml(t, run)}<div class="ie-prop-sub2">${ieT('Parágrafo')}</div>${ieParagrafoHtml(t, run)}`;
}

function ieTextoPropsInstalar(box) {
    const redesenhar = () => setTimeout(() => { ieUiProps(); typeof ieJanAtualizar === 'function' && ieJanAtualizar('doc'); }, 350);
    box.querySelectorAll('[data-tx]').forEach(el => {
        const k = el.dataset.tx;
        if (k === 'famPick') {
            el.onclick = () => {
                const L = ieAtiva(), t = L && (L.txt || L._txtPsd);
                ieFonteEscolher(el, (t && t.fam) || IE.op.texto.fam, fam => { ieTextoEstilo({ fam, estilo: (ieEstiloPadrao(fam) || {}).estilo || 'Regular' }); redesenhar(); });
            };
            return;
        }
        if (k === 'cor') {
            el.onclick = () => { const L = ieAtiva(); ieSeletorCor(el, (L && (L.txt || L._txtPsd || {}).cor) || IE.cor[0], c => { el.style.background = c; ieTextoEstilo({ cor: c }); }); };
            return;
        }
        if (el.type === 'checkbox') { el.onchange = () => { ieTextoEstilo({ [k]: el.checked }); }; return; }
        if (el.tagName === 'BUTTON') {
            el.onclick = () => {
                const L = ieAtiva(), t = (L && (L.txt || L._txtPsd)) || IE.op.texto;
                if (el.dataset.v !== undefined) ieTextoEstilo({ [k]: k === 'pos' && t.pos === el.dataset.v ? '' : el.dataset.v });
                else ieTextoEstilo({ [k]: !t[k] });
                redesenhar();
            };
            return;
        }
        el.addEventListener('change', () => {
            let v = el.tagName === 'SELECT' ? el.value : parseFloat(el.value) || 0;
            if (k === 'kern' && v === '0') v = 0;
            if ((k === 'escH' || k === 'escV') && v < 1) v = 100;
            ieTextoEstilo({ [k]: v });
            if (k === 'estilo') redesenhar();
        });
        el.addEventListener('keydown', ev => ev.stopPropagation());
    });
}

function ieEstiloPadrao(fam) {
    const lista = (IE.estilos || {})[fam] || [];
    return lista.find(e => /^(regular|normal|book|roman)$/i.test(e.estilo)) ||
        [...lista].filter(e => !e.italico).sort((a, b) => Math.abs(a.peso - 400) - Math.abs(b.peso - 400))[0] || lista[0];
}

// seletor de fonte com a prévia de cada família (como no editor de vídeo), busca e as recentes em cima
async function ieFonteEscolher(ancora, atual, aoEscolher) {
    const estilos = await ieCarregarFontes();
    const pop = ieEl('ie-pop'), rb = ieEl('ie').getBoundingClientRect(), ra = ancora.getBoundingClientRect();
    const recentes = (iePref('fontesRecentes', []) || []).filter(f => estilos[f]);
    const todas = Object.keys(estilos);
    pop.innerHTML = `<div class="ie-fontes"><input class="ie-fontes-busca" placeholder="${ieT('Buscar fonte')}"><div class="ie-fontes-lista"></div></div>`;
    const lista = pop.querySelector('.ie-fontes-lista'), busca = pop.querySelector('.ie-fontes-busca');
    const item = f => `<button class="ie-fonte-item ${f === atual ? 'on' : ''}" data-f="${ieEsc(f)}"><span style="font-family:&quot;${ieEsc(f)}&quot;, &quot;${ieEsc((estilos[f][0] || {}).gdi || f)}&quot;">${ieEsc(f)}</span><small>${estilos[f].length}</small></button>`;
    const montar = q => {
        q = (q || '').trim().toLowerCase();
        const achadas = todas.filter(f => !q || f.toLowerCase().includes(q));
        lista.innerHTML = (!q && recentes.length ? `<div class="ie-fontes-grupo">${ieT('Recentes')}</div>${recentes.map(item).join('')}<div class="ie-fontes-grupo">${ieT('Todas')}</div>` : '') +
            achadas.map(item).join('') || `<div class="ie-vazio">${ieT('Nenhuma fonte')}</div>`;
        lista.querySelector('.on')?.scrollIntoView({ block: 'center' });
    };
    montar('');
    busca.addEventListener('input', () => montar(busca.value));
    const fechar = () => { pop.hidden = true; document.removeEventListener('pointerdown', fora, true); };
    const fora = e => { if (!pop.contains(e.target) && e.target !== ancora) fechar(); };
    busca.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Escape') fechar();
        if (ev.key === 'Enter') { const b = lista.querySelector('.ie-fonte-item'); if (b) b.click(); }
    });
    lista.addEventListener('click', ev => {
        const b = ev.target.closest('[data-f]');
        if (!b) return;
        const f = b.dataset.f;
        iePrefGravar('fontesRecentes', [f, ...recentes.filter(x => x !== f)].slice(0, 8));
        fechar();
        aoEscolher(f);
    });
    pop.hidden = false;
    pop.style.left = Math.max(4, Math.min(rb.width - 300, ra.left - rb.left)) + 'px';
    pop.style.top = Math.max(4, Math.min(rb.height - 420, ra.bottom - rb.top + 4)) + 'px';
    setTimeout(() => { document.addEventListener('pointerdown', fora, true); busca.focus(); }, 0);
}
