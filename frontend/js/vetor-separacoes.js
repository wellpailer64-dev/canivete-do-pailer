// Vetor Kanivete — VISUALIZAÇÃO DE SEPARAÇÕES e prévia de sobreimpressão (Illustrator: Janela › Visualização de separações).
// Cada chapa (C, M, Y, K e cada cor especial) é desenhada em cinza (preto = 100% de tinta) com as regras da impressão:
// um objeto VAZA (zera) as outras chapas embaixo dele, a não ser que esteja em sobreimpressão e não tenha tinta nela.
// A prévia junta as chapas como tinta sobre papel (cada tinta filtra a luz: cor = Π (1 − t·(1 − cor da tinta))), então
// branco em sobreimpressão some, preto em sobreimpressão fica sobre o fundo etc. — o que a gráfica vai imprimir.
const VK_PROC = ['C', 'M', 'Y', 'K'];
const VK_PROC_CMYK = { C: [100, 0, 0, 0], M: [0, 100, 0, 0], Y: [0, 0, 100, 0], K: [0, 0, 0, 100] };
const VK_SEP_PX = 1400;   // lado maior da prévia de cada prancheta

function vkSepEstado() { if (!VK.sep) VK.sep = { ativo: false, ocultas: new Set(), cache: new Map(), versao: 0, calc: new Set(), rgb: new Map(), imgs: new Map() }; return VK.sep; }
function vkTintas() {   // tintas do documento: processo + especiais usadas (com o alternativo CMYK)
    const sp = new Map();
    for (const { o } of vkTodos()) vkCores(o).forEach(c => { if (c.k === 'spot' && !sp.has(c.nome)) sp.set(c.nome, c.v); });
    return [...VK_PROC.map(n => ({ nome: n, proc: true, cmyk: VK_PROC_CMYK[n] })), ...[...sp].map(([nome, v]) => ({ nome, proc: false, cmyk: v }))];
}
function vkSepCmyk(c) {   // cor → CMYK 0-100 (RGB pelo perfil, pré-calculado em vkSepPreparar)
    if (c.k === 'cmyk') return c.v;
    if (c.k === 'rgb') return vkSepEstado().rgb.get(VK.doc.perfil + c.v.join(',')) || [0, 0, 0, 100 - (c.v[0] + c.v[1] + c.v[2]) / 7.65];
    return [0, 0, 0, 0];
}
function vkValorCanal(c, canal) {   // 0..1 de tinta de uma cor sólida na chapa
    if (!c) return 0;
    if (c.k === 'reg') return 1;
    if (c.k === 'spot') return canal === c.nome ? (c.tint ?? 100) / 100 : 0;
    const i = VK_PROC.indexOf(canal); return i < 0 ? 0 : vkSepCmyk(c)[i] / 100;
}
function vkTemTinta(c, canal) { return c && (c.k === 'grad' ? c.paradas.some(p => vkValorCanal(p.cor, canal) > 0) : vkValorCanal(c, canal) > 0); }
function vkCinza(t) { const g = Math.round(255 * (1 - Math.max(0, Math.min(1, t)))); return `rgb(${g},${g},${g})`; }
function vkEstiloCanal(ctx, c, canal, m) {
    if (c.k !== 'grad') return vkCinza(vkValorCanal(c, canal));
    let a = c.a, b = c.b || c.a, f = c.f || c.a, r = c.r || 1;
    if (m) { const iv = vkInv(m); a = vkAp(iv, ...a); b = vkAp(iv, ...b); f = vkAp(iv, ...f); r = r / vkEsc(m); }
    const g = c.tipo === 'rad' ? ctx.createRadialGradient(f[0], f[1], 0, a[0], a[1], r) : ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    for (const p of c.paradas) g.addColorStop(Math.max(0, Math.min(1, p.p)), vkCinza(vkValorCanal(p.cor, canal)));
    return g;
}
function vkDesenharCanal(ctx, o, canal) {
    if (o.visivel === false) return;
    ctx.save();
    if (o.op != null && o.op < 1) ctx.globalAlpha *= o.op;
    const sobre = o.sobre || {};
    if (o.tipo === 'grupo') {
        if (o.clip && o.itens.length) { ctx.clip(vkPath2d(o.itens[0].subs), o.itens[0].regra === 'evenodd' ? 'evenodd' : 'nonzero'); o.itens.slice(1).forEach(f => vkDesenharCanal(ctx, f, canal)); }
        else o.itens.forEach(f => vkDesenharCanal(ctx, f, canal));
    } else if (o.tipo === 'caminho' || o.tipo === 'texto') {
        let subs = o.subs, m = null;
        if (o.tipo === 'texto') { const g = vkGeo(o); if (!g) { ctx.restore(); return; } m = o.m; ctx.transform(...m); subs = g.subs; }
        const p = vkPath2d(subs), regra = o.regra === 'evenodd' ? 'evenodd' : 'nonzero';
        if (o.preench && !(sobre.p && !vkTemTinta(o.preench, canal))) { ctx.fillStyle = vkEstiloCanal(ctx, o.preench, canal, m); ctx.fill(p, regra); }
        const t = o.traco;
        if (t && t.cor && !(sobre.t && !vkTemTinta(t.cor, canal))) {
            ctx.strokeStyle = vkEstiloCanal(ctx, t.cor, canal, m); ctx.lineWidth = Math.max(t.larg, 0.0001);
            ctx.lineCap = t.cap || 'butt'; ctx.lineJoin = t.junc || 'miter'; ctx.miterLimit = t.miter || 4; ctx.setLineDash(t.tracejado || []); ctx.lineDashOffset = t.fase || 0;
            ctx.stroke(p);
        }
    } else if (o.tipo === 'imagem') {
        const im = VK.doc.imagens[o.img], ch = im && vkSepEstado().imgs.get(`${im.arquivo}|${im.mascara || ''}|${VK.doc.perfil}`);
        if (ch) { const el = ch[VK_PROC.includes(canal) ? canal : 'vazio']; if (el && el.complete && el.naturalWidth) { ctx.transform(...o.m); ctx.drawImage(el, 0, 0, im.w, im.h); } }
    }
    ctx.restore();
}

async function vkSepPreparar() {   // RGB → CMYK pelo perfil e chapas das imagens (Python), antes de desenhar
    const S = vkSepEstado(), api = vkApi(), rgb = new Set();
    for (const { o } of vkTodos()) vkCores(o).forEach(c => { if (c.k === 'rgb' && !S.rgb.has(VK.doc.perfil + c.v.join(','))) rgb.add(c.v.join(',')); });
    if (rgb.size && api && api.vk_rgb_para_cmyk) {
        const l = [...rgb], r = await api.vk_rgb_para_cmyk(l.map(k => k.split(',').map(Number)), VK.doc.perfil || 'FOGRA39');
        l.forEach((k, i) => S.rgb.set(VK.doc.perfil + k, r[i]));
    }
    const espera = [];
    for (const im of Object.values(VK.doc.imagens || {})) {
        const chave = `${im.arquivo}|${im.mascara || ''}|${VK.doc.perfil}`;
        if (S.imgs.has(chave) || !im.arquivo || !api || !api.vk_canais_imagem) continue;
        const u = await api.vk_canais_imagem(im.arquivo, im.mascara || null, VK.doc.perfil || 'FOGRA39');
        if (!u || u.erro) continue;
        const ch = {};
        for (const [n, url] of Object.entries(u)) { const el = new Image(); el.crossOrigin = 'anonymous'; el.src = url; ch[n] = el; espera.push(new Promise(r => { el.onload = r; el.onerror = r; })); }
        S.imgs.set(chave, ch);
    }
    await Promise.all(espera);
    await vkGeosProntas();
}
async function vkCoresTintas(ts) {   // cor de cada tinta chapada na tela pela prova de cor do perfil (0..1)
    const S = vkSepEstado(), falta = ts.filter(t => !S.rgb.has('tinta' + VK.doc.perfil + t.cmyk.join(',')));
    if (falta.length && vkApi() && vkApi().vk_cores_tela) {
        try { const r = await vkApi().vk_cores_tela(falta.map(t => t.cmyk), VK.doc.perfil || 'FOGRA39'); falta.forEach((t, i) => S.rgb.set('tinta' + VK.doc.perfil + t.cmyk.join(','), r[i].map(x => x / 255))); } catch (e) { /* sem API */ }
    }
    return ts.map(t => S.rgb.get('tinta' + VK.doc.perfil + t.cmyk.join(',')) || (vkCmykCss(t.cmyk).match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(x => +x / 255));
}
// Chapas de uma prancheta: {w, h, esc, tintas: [{nome, cob: Uint8Array (0-255 de tinta)}], img: canvas composto}
async function vkSeparar(p, px = VK_SEP_PX, esc = null) {
    await vkSepPreparar(); await vkCoresProntas();
    const S = vkSepEstado(); esc = esc || px / Math.max(p.w, p.h);
    const w = Math.max(1, Math.round(p.w * esc)), h = Math.max(1, Math.round(p.h * esc));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high';
    const tintas = [], lista = vkTintas(), cores = await vkCoresTintas(lista);
    for (const [k, t] of lista.entries()) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.setTransform(esc, 0, 0, esc, -p.x * esc, -p.y * esc);
        for (const c of VK.doc.camadas) if (c.visivel !== false && c.imprimir !== false) for (const o of c.itens) vkDesenharCanal(ctx, o, t.nome);
        const d = ctx.getImageData(0, 0, w, h).data, cob = new Uint8Array(w * h);
        for (let i = 0, j = 0; j < cob.length; i += 4, j++) cob[j] = 255 - d[i];
        tintas.push({ ...t, cob, rgb: cores[k] });
    }
    return { p, w, h, esc, tintas, img: vkSepCompor({ w, h, tintas }, S.ocultas), doc: VK.versaoDoc };
}
function vkSepCompor(r, ocultas) {   // tinta sobre papel: cada tinta filtra (multiplica) a luz
    const cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h;
    const ctx = cv.getContext('2d'), out = ctx.createImageData(r.w, r.h), o = out.data, n = r.w * r.h;
    const ts = r.tintas.filter(t => !ocultas.has(t.nome));
    for (let j = 0, i = 0; j < n; j++, i += 4) {
        let R = 1, G = 1, B = 1;
        for (const t of ts) { const a = t.cob[j] / 255; if (a) { R *= 1 - a * (1 - t.rgb[0]); G *= 1 - a * (1 - t.rgb[1]); B *= 1 - a * (1 - t.rgb[2]); } }
        o[i] = R * 255; o[i + 1] = G * 255; o[i + 2] = B * 255; o[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0); return cv;
}
// tela: com a prévia ligada, cada prancheta mostra o composto das chapas (recalculado 150 ms depois de cada mudança)
let vkSepTimer = 0;
function vkSepInvalidar() { const S = VK.sep; if (!S || !S.ativo) return; S.versao++; clearTimeout(vkSepTimer); vkSepTimer = setTimeout(vkSepAtualizar, 150); }
async function vkSepAtualizar() {
    const S = VK.sep; if (!S || !S.ativo || !VK.doc) return;
    const v = S.versao;
    for (const p of VK.doc.pranchetas) {
        const r = await vkSeparar(p);
        if (v !== S.versao || !S.ativo) return;   // mudou de novo: o próximo cálculo assume
        S.cache.set(p.id, { ...r, versao: v });
        vkDesenhar();
    }
}
function vkSepPronto() { const S = VK.sep; return !!(S && S.ativo && VK.doc && VK.doc.pranchetas.every(p => S.cache.has(p.id))); }   // (versão velha fica na tela até a nova chegar)
function vkSepDesenhar(ctx) {   // chamado por vkDesenharAgora no lugar dos objetos de cada prancheta já calculada
    const S = VK.sep; if (!S || !S.ativo) return false;
    for (const p of VK.doc.pranchetas) { const r = S.cache.get(p.id); if (r) { ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(r.img, p.x, p.y, p.w, p.h); ctx.restore(); } }
    return true;
}
function vkSepEm(x, y) {   // % de cada tinta no ponto (documento, pt) — cursor e API
    const S = VK.sep; if (!S) return null;
    for (const r of S.cache.values()) {
        const p = r.p; if (x < p.x || y < p.y || x >= p.x + p.w || y >= p.y + p.h) continue;
        const j = Math.floor((y - p.y) * r.esc) * r.w + Math.floor((x - p.x) * r.esc);
        const v = {}; r.tintas.forEach(t => { v[t.nome] = Math.round(t.cob[j] / 2.55); });
        return v;
    }
    return null;
}
function vkSepStatus(x, y) {
    const v = VK.sep && VK.sep.ativo && vkSepEm(x, y), el = document.getElementById('vk-status-info'); if (!v || !el) return;
    const tot = VK_PROC.reduce((s, k) => s + (v[k] || 0), 0);
    el.textContent = Object.entries(v).map(([k, n]) => `${k} ${n}%`).join('  ') + `  ·  total ${tot}%`;
}
function vkSepRecolorir() { const S = VK.sep; if (!S) return; for (const r of S.cache.values()) r.img = vkSepCompor(r, S.ocultas); vkDesenhar(); }

// ── comandos (interface, Claude e Worker) ──
(() => {
    vkRegistrar('separacoes', 'visualização de separações', async a => {
        // ativo: true|false; ocultar / mostrar: nomes de tintas ("C", "PANTONE 286 C"...); sem args = só lê
        const S = vkSepEstado();
        if (a.ativo != null) { S.ativo = !!a.ativo; if (!S.ativo) S.cache.clear(); }
        [].concat(a.ocultar || []).forEach(n => S.ocultas.add(n)); [].concat(a.mostrar || []).forEach(n => S.ocultas.delete(n));
        if (a.so) { S.ocultas = new Set(vkTintas().map(t => t.nome).filter(n => ![].concat(a.so).includes(n))); }
        if (S.ativo) { S.versao++; await vkSepAtualizar(); vkSepRecolorir(); }
        vkDesenhar(); vkUiAgendar();
        return { ativo: S.ativo, tintas: vkTintas().map(t => ({ nome: t.nome, visivel: !S.ocultas.has(t.nome) })) };
    }, true);
    vkRegistrar('tinta_em', 'tinta no ponto', async a => {   // x, y em mm (prancheta) → % de cada chapa e o total (TAC)
        const P = VK.doc.pranchetas, p = (a.prancheta != null && (P.find(q => q.id === a.prancheta || q.nome === a.prancheta) || P[+a.prancheta - 1])) || P.find(q => q.id === VK.ativa) || P[0];
        const x = a.un === 'pt' ? +a.x : p.x + vkPT(+a.x), y = a.un === 'pt' ? +a.y : p.y + vkPT(+a.y);
        const S = vkSepEstado(); let r = S.cache.get(p.id);
        if (!r || r.doc !== VK.versaoDoc) { r = await vkSeparar(p); S.cache.set(p.id, r); }
        const v = vkSepEm(x, y) || {};
        return { ...v, total: VK_PROC.reduce((s, k) => s + (v[k] || 0), 0) };
    }, true);
    vkRegistrar('exportar_separacoes', 'exportar separações', async a => {
        // um PNG em tons de cinza por chapa (preto = 100% de tinta), na resolução pedida — fotolito/serigrafia/conferência
        let caminho = a.caminho || await vkApi().vk_dialogo('salvar', ['PNG (*.png)'], (VK.doc.nome || 'arte') + '.png');
        if (!caminho) return { cancelado: true };
        const P = VK.doc.pranchetas, p = (a.prancheta != null && (P.find(q => q.id === a.prancheta || q.nome === a.prancheta) || P[+a.prancheta - 1])) || P.find(q => q.id === VK.ativa) || P[0];
        const r = await vkSeparar(p, 0, (a.ppi || 300) / 72), S = vkSepEstado(), arqs = [];
        for (const t of r.tintas) {
            if (a.so_usadas !== false && !t.cob.some(v => v > 0)) continue;
            const cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h;
            const ctx = cv.getContext('2d'), im = ctx.createImageData(r.w, r.h);
            for (let j = 0, i = 0; j < t.cob.length; j++, i += 4) { const g = 255 - t.cob[j]; im.data[i] = im.data[i + 1] = im.data[i + 2] = g; im.data[i + 3] = 255; }
            ctx.putImageData(im, 0, 0);
            const nome = caminho.replace(/(\.png)?$/i, `_${t.nome.replace(/[<>:"/\\|?*]+/g, '_')}.png`);
            const res = await vkApi().vk_salvar_png(cv.toDataURL('image/png'), nome); arqs.push(res.path || nome);
        }
        S.cache.delete(p.id);
        return { arquivos: arqs };
    }, true);
})();
