// Vetor Kanivete — APARÊNCIA e EFEITOS VIVOS (Illustrator: painel Aparência, Efeito › Estilizar).
// o.aparencia = [{tipo:'preench'|'traco', cor, larg, cap, junc, tracejado, op, bm, desloc (pt), atras (padrão true), visivel}]
//   camadas extras de pintura sobre a MESMA geometria (texto com contorno duplo, forma com borda deslocada...).
// o.efeitos = [{tipo:'sombra'|'brilho'|'desfoque'|'cantos', dx, dy, desfoque (pt), raio (pt), cor, op, bm, visivel}]
//   cantos = vetorial (arredonda os cantos vivos); sombra/brilho/desfoque = rasterizados no PDF (300 ppi, na cor exata
//   da tinta, com a silhueta desfocada como máscara: CMYK/especial continuam CMYK/especial) — só PDF/X-4.
// Não destrutivo: o caminho original fica; "expandir_aparencia" assa em objetos comuns.
// A tela monta as pinturas (vkPinturas, pt do documento) e manda junto na exportação (_pint/_silh): PDF = tela.
VK.apDesl = new Map(); VK.apPend = new Map();

function vkApEf(o, tipo) { return (o.efeitos || []).find(e => e.tipo === tipo && e.visivel !== false); }
function vkApTem(o) { return (o.aparencia || []).some(l => l.visivel !== false) || !!vkApEf(o, 'cantos') || (o.tipo === 'caminho' && vkDsTracoEspecial(o.traco)) || vkDistorce(o) || !!vkApEf(o, 'brilho_interno'); }
const VK_DIST = new Set(['zigue', 'aspero', 'inflar', 'torcer']);
function vkDistorce(o) { return (o.efeitos || []).some(e => e.visivel !== false && VK_DIST.has(e.tipo)); }

// cantos arredondados (Efeito › Estilizar › Cantos arredondados): só cantos vivos entre segmentos retos
function vkArredondar(subs, r) {
    if (!(r > 0)) return subs;
    const reto = (a, b) => a[4] === a[0] && a[5] === a[1] && b[2] === b[0] && b[3] === b[1];
    return subs.map(s => {
        const P = s.pts, n = P.length; if (n < 3) return s;
        const out = [];
        for (let i = 0; i < n; i++) {
            const p = P[i];
            if (!s.fechado && (i === 0 || i === n - 1)) { out.push([...p]); continue; }
            const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
            if (!reto(a, p) || !reto(p, b)) { out.push([...p]); continue; }
            const ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
            if (lu < 1e-9 || lv < 1e-9) { out.push([...p]); continue; }
            const th = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv))));
            if (th > Math.PI - 1e-3 || th < 1e-3) { out.push([...p]); continue; }
            const t = Math.min(r / Math.tan(th / 2), lu / 2, lv / 2), rr = t * Math.tan(th / 2), h = 4 / 3 * Math.tan((Math.PI - th) / 4) * rr;
            const A = [p[0] + ux / lu * t, p[1] + uy / lu * t], B = [p[0] + vx / lv * t, p[1] + vy / lv * t];
            out.push([A[0], A[1], A[0], A[1], A[0] - ux / lu * h, A[1] - uy / lu * h]);
            out.push([B[0], B[1], B[0] - vx / lv * h, B[1] - vy / lv * h, B[0], B[1]]);
        }
        return { fechado: s.fechado, pts: out };
    });
}
// deslocar (Python/skia), com cache; null enquanto calcula
function vkApDesloc(subs, regra, dist, junc) {
    const k = JSON.stringify([dist, junc, regra, subs]);
    if (VK.apDesl.has(k)) return VK.apDesl.get(k);
    if (!VK.apPend.has(k)) {
        const api = vkApi(); if (!api || !api.vk_deslocar) return null;
        VK.apPend.set(k, api.vk_deslocar([{ subs, regra }], dist, junc || 'round', 4).then(r => { VK.apDesl.set(k, (r && r[0] && r[0].subs) || []); VK.apPend.delete(k); if (VK.apDesl.size > 400) VK.apDesl.clear(); vkDesenhar(); })
            .catch(() => VK.apPend.delete(k)));
    }
    return null;
}
const vkApDoc = (subs, m) => subs.map(s => ({ fechado: s.fechado, pts: s.pts.map(q => [...vkAp(m, q[0], q[1]), ...vkAp(m, q[2], q[3]), ...vkAp(m, q[4], q[5])]) }));
// pinturas básicas do objeto em pt do documento → [{subs, regra, preench, traco}] (null = geometria ainda vindo)
function vkApBase(o) {
    if (o.visivel === false) return [];
    if (o.tipo === 'caminho') {
        const c = vkApEf(o, 'cantos'), subs = c ? vkArredondar(o.subs, c.raio) : o.subs;
        if (vkDsTracoEspecial(o.traco)) return vkDsTraco(subs, o.regra || 'nonzero', o.preench, o.traco);   // perfil de largura / setas
        return [{ subs, regra: o.regra || 'nonzero', preench: o.preench, traco: o.traco }];
    }
    if (o.tipo === 'texto') {
        const g = vkGeo(o); if (!g) return null;
        const e = vkEsc(o.m), tr = t => t ? { ...t, larg: (t.larg ?? 1) * e } : t;
        return (g.partes || [null]).map(pa => ({ subs: vkApDoc(pa ? pa.subs : g.subs, o.m), regra: 'nonzero', preench: pa && 'preench' in pa ? pa.preench : o.preench,
            traco: tr(pa && 'traco' in pa ? (pa.traco ? { larg: 1, cap: 'butt', junc: 'miter', miter: 4, ...(o.traco || {}), ...pa.traco } : null) : o.traco) }));
    }
    if (o.tipo === 'grupo') {
        const out = [];
        for (const f of (o.clip ? o.itens.slice(1) : o.itens)) { const p = vkPinturas(f); if (!p) return null; out.push(...p); }
        return out;
    }
    if (o.tipo === 'imagem') { const im = VK.doc.imagens[o.img] || { w: 1, h: 1 }; return [{ subs: vkApDoc([{ fechado: true, pts: [[0, 0], [im.w, 0], [im.w, im.h], [0, im.h]].map(([x, y]) => [x, y, x, y, x, y]) }], o.m), regra: 'nonzero', preench: { k: 'cmyk', v: [0, 0, 0, 100] }, traco: null, img: true }]; }
    return [];
}
// pinturas com a Aparência (camadas extras atrás/na frente da base)
function vkPinturas(o) {
    const base = vkApBase(o); if (!base) return null;
    const ap = (o.aparencia || []).filter(l => l.visivel !== false);
    if (!ap.length || o.tipo === 'grupo' || o.tipo === 'imagem') return base;
    const todos = base.flatMap(b => b.subs), regra = (base[0] && base[0].regra) || 'nonzero', atras = [], frente = [];
    for (const l of ap) {
        let subs = todos, rg = regra;
        if (l.desloc) { subs = vkApDesloc(todos, regra, l.desloc, l.junc || 'round'); if (!subs) return null; rg = 'nonzero'; }
        const p = l.tipo === 'traco' ? { subs, regra: rg, preench: null, traco: { cor: l.cor, larg: l.larg ?? 1, cap: l.cap || 'round', junc: l.junc || 'round', miter: 4, tracejado: l.tracejado || [], fase: 0 } }
            : { subs, regra: rg, preench: l.cor, traco: null };
        if (l.op != null && l.op < 1) p.op = l.op; if (l.bm && l.bm !== 'normal') p.bm = l.bm;
        (l.atras !== false ? atras : frente).push(p);
    }
    return [...atras, ...base, ...frente];
}
async function vkApPronto(o) {
    for (let i = 0; i < 8; i++) {
        if (o.tipo === 'texto') await vkGeoPronta(o);
        if (o.itens) for (const f of o.itens) await vkApPronto(f);
        const p = vkPinturas(o); if (p) return p;
        await Promise.all([...VK.apPend.values()]);
    }
    return vkPinturas(o);
}

// ── tela ──
function vkApRgba(c, a) { const m = String(vkCss(c && c.k === 'grad' ? c.paradas[0].cor : c) || 'rgb(0,0,0)').match(/\d+(\.\d+)?/g) || [0, 0, 0]; return `rgba(${m[0]},${m[1]},${m[2]},${a})`; }
function vkApTracar(ctx, p, estilo) {
    const t = p.traco, P = vkPath2d(p.subs);
    if (p.preench) { ctx.fillStyle = estilo ? estilo(p.preench) : '#000'; ctx.fill(P, p.regra === 'evenodd' ? 'evenodd' : 'nonzero'); }
    if (t && t.cor) {
        ctx.strokeStyle = estilo ? estilo(t.cor) : '#000'; ctx.lineWidth = Math.max(t.larg ?? 1, 0.0001); ctx.lineCap = t.cap || 'butt'; ctx.lineJoin = t.junc || 'miter';
        ctx.miterLimit = t.miter || 4; ctx.setLineDash(t.tracejado || []); ctx.lineDashOffset = t.fase || 0; ctx.stroke(P);
    }
}
// chamado por vkDesenharObj (ctx em pt do documento): desenha sombras/brilhos, liga o desfoque e, se houver Aparência, pinta
// tudo → true; senão false (o desenho normal continua, já com o desfoque ligado)
function vkApDesenhar(ctx, o) {
    if (VK.contorno) return false;
    const efs = (o.efeitos || []).filter(e => e.visivel !== false), vet = (o.tipo !== 'grupo' && o.tipo !== 'imagem' && vkApTem(o)) || (o.tipo === 'grupo' && vkDistorce(o));
    if (!efs.length && !vet) return false;
    const T = ctx.getTransform(), k = Math.hypot(T.a, T.b) || 1;
    const sombras = efs.filter(e => e.tipo === 'sombra' || e.tipo === 'brilho'), desf = efs.find(e => e.tipo === 'desfoque');
    const pint = (sombras.length || vet) ? vkPinturas(o) : null;
    if (pint) for (const e of sombras) {
        ctx.save();
        const K = 40000;
        ctx.shadowColor = vkApRgba(e.cor || { k: 'cmyk', v: [0, 0, 0, 100] }, e.op ?? 0.75); ctx.shadowBlur = 2 * (e.desfoque || 0) * k;
        ctx.shadowOffsetX = K + (e.dx || 0) * k; ctx.shadowOffsetY = (e.dy || 0) * k;
        if (e.bm && VK_BM[e.bm]) ctx.globalCompositeOperation = VK_BM[e.bm];
        ctx.translate(-K / k, 0);
        for (const p of pint) vkApTracar(ctx, p.img ? { ...p, preench: { k: 'cmyk', v: [0, 0, 0, 100] } } : p, () => '#000');
        ctx.restore();
    }
    if (desf && desf.desfoque > 0) ctx.filter = `blur(${desf.desfoque * k}px)`;
    if (!vet) return false;
    if (!pint) return false;   // deslocamento ainda calculando: desenha a base
    for (const p of pint) {
        ctx.save();
        if (p.op != null) ctx.globalAlpha *= p.op;
        if (p.bm && VK_BM[p.bm]) ctx.globalCompositeOperation = VK_BM[p.bm];
        vkApTracar(ctx, p, c => vkEstiloCanvas(ctx, c, null));
        ctx.restore();
    }
    for (const e of efs.filter(e => e.tipo === 'brilho_interno')) for (const p of pint) {   // brilho interno: sombra do "lado de fora" caindo dentro
        if (!p.preench) continue;
        ctx.save(); ctx.clip(vkPath2d(p.subs), p.regra === 'evenodd' ? 'evenodd' : 'nonzero');
        // o "lado de fora" (moldura grande com a forma vazada) vai desenhado longe, e só a sombra dele cai dentro da forma
        const b = vkSubsBox(p.subs), M = (b[2] - b[0]) + (b[3] - b[1]) + 6 * (e.desfoque || 0), D = 3 * M + (b[2] - b[0]), fora = new Path2D();
        fora.rect(b[0] - M, b[1] - M, b[2] - b[0] + 2 * M, b[3] - b[1] + 2 * M); fora.addPath(vkPath2d(p.subs));
        ctx.shadowColor = vkApRgba(e.cor || { k: 'cmyk', v: [0, 0, 0, 0] }, e.op ?? 0.75); ctx.shadowBlur = 2 * (e.desfoque || 0) * k; ctx.shadowOffsetX = D * k;
        if (e.bm && VK_BM[e.bm]) ctx.globalCompositeOperation = VK_BM[e.bm];
        ctx.translate(-D, 0); ctx.fillStyle = '#000'; ctx.fill(fora, 'evenodd');
        ctx.restore();
    }
    return true;
}

// ── exportar: pinturas prontas no doc enviado ao Python ──
async function vkApDocPy(d) {
    const anda = async l => { for (const o of l) {
        const src = vkObj(o.id);
        if (src) {
            if ((src.tipo !== 'grupo' && src.tipo !== 'imagem' && vkApTem(src)) || (src.tipo === 'grupo' && vkDistorce(src))) o._pint = await vkApPronto(src);
            if ((src.efeitos || []).some(e => e.visivel !== false && e.tipo !== 'cantos')) o._silh = await vkApPronto(src);
        }
        if (o.itens) await anda(o.itens);
    } };
    for (const c of d.camadas) await anda(c.itens);
}

(() => {
    const D = (a, v) => a.un === 'pt' ? +v : vkPT(+v);
    const campos = (x, a) => {
        if (a.cor !== undefined) x.cor = vkCorDe(a.cor);
        if (a.espessura != null) x.larg = +a.espessura;
        if (a.opacidade != null) x.op = Math.max(0, Math.min(1, +a.opacidade / 100));
        if (a.mesclagem) x.bm = a.mesclagem;
        if (a.deslocar != null) x.desloc = D(a, a.deslocar);
        if (a.atras != null) x.atras = !!a.atras;
        if (a.visivel != null) x.visivel = !!a.visivel;
        for (const k of ['cap', 'junc', 'tracejado']) if (a[k] != null) x[k] = a[k];
        for (const k of ['dx', 'dy', 'desfoque', 'raio', 'tamanho']) if (a[k] != null) x[k] = D(a, a[k]);
        for (const k of ['cristas', 'detalhe', 'quantidade', 'graus']) if (a[k] != null) x[k] = +a[k];
        if (a.suave != null) x.suave = !!a.suave;
        if (x.visivel === true) delete x.visivel;
    };
    const lista = (o, k, acao, a, novo) => {
        let L = o[k] || [];
        if (acao === 'limpar') L = [];
        else if (acao === 'adicionar') { const x = novo(); campos(x, a); if (a.indice != null) L.splice(+a.indice, 0, x); else L.push(x); }
        else {
            const i = a.indice != null ? +a.indice : (a.tipo ? L.findIndex(e => e.tipo === a.tipo || (a.tipo === 'preenchimento' && e.tipo === 'preench')) : L.length - 1);
            if (i < 0 || i >= L.length) throw new Error(`${k}: índice ${a.indice ?? a.tipo} não existe (há ${L.length})`);
            if (acao === 'remover') L.splice(i, 1);
            else if (acao === 'subir' && i < L.length - 1) [L[i], L[i + 1]] = [L[i + 1], L[i]];
            else if (acao === 'descer' && i > 0) [L[i], L[i - 1]] = [L[i - 1], L[i]];
            else if (acao === 'alterar') campos(L[i], a);
        }
        if (L.length) o[k] = L; else delete o[k];
    };
    // aparencia: acao adicionar|alterar|remover|subir|descer|limpar; tipo preench|traco; cor, espessura (pt), opacidade (%),
    // mesclagem, deslocar (mm; + fora, − dentro), atras (padrão true: por baixo da pintura do objeto), visivel, cap, junc, tracejado
    vkRegistrar('aparencia', 'aparência', a => {
        const objs = vkTxAlvos(a).filter(o => o.tipo === 'caminho' || o.tipo === 'texto');
        if (!objs.length) throw new Error('aparencia: só caminhos e textos (para grupo use efeito)');
        for (const o of objs) lista(o, 'aparencia', a.acao || 'adicionar', a, () => /^t/.test(a.tipo || 'traco')
            ? { tipo: 'traco', cor: vkCorDe('100K'), larg: 2, junc: 'round', cap: 'round' } : { tipo: 'preench', cor: vkCorDe('0K') });
        return { aparencia: (objs[0].aparencia || []).map(l => `${l.tipo} ${vkCorTexto(l.cor)}${l.tipo === 'traco' ? ' ' + vkR(l.larg, 2) + ' pt' : ''}${l.desloc ? ' desl ' + vkR(vkMM(l.desloc)) + ' mm' : ''}${l.atras === false ? ' frente' : ' atrás'}`) };
    });
    // efeito: acao adicionar|alterar|remover|limpar; tipo sombra|brilho|desfoque|cantos; dx, dy, desfoque, raio (mm);
    // cor, opacidade (%), mesclagem, visivel. Desfoque e cantos: um por objeto (adicionar de novo = alterar)
    const PADRAO = {
        sombra: () => ({ tipo: 'sombra', dx: vkPT(1.5), dy: vkPT(1.5), desfoque: vkPT(1.2), cor: vkCorDe('100K'), op: 0.75, bm: 'multiplicacao' }),
        brilho: () => ({ tipo: 'brilho', desfoque: vkPT(2), cor: vkCorDe('C0 M0 Y100 K0'), op: 0.75 }),
        desfoque: () => ({ tipo: 'desfoque', desfoque: vkPT(1) }),
        cantos: () => ({ tipo: 'cantos', raio: vkPT(3) }),
        brilho_interno: () => ({ tipo: 'brilho_interno', desfoque: vkPT(2), cor: vkCorDe('0K'), op: 0.75 }),
        zigue: () => ({ tipo: 'zigue', tamanho: vkPT(1.5), cristas: 6, suave: false }),
        aspero: () => ({ tipo: 'aspero', tamanho: vkPT(1), detalhe: 4, suave: true }),
        inflar: () => ({ tipo: 'inflar', quantidade: 40 }),
        torcer: () => ({ tipo: 'torcer', graus: 45 }),
    };
    vkRegistrar('efeito', 'efeito', a => {
        const objs = vkTxAlvos(a), tipo = a.tipo || 'sombra';
        let acao = a.acao || 'adicionar';
        if (acao === 'adicionar' && !PADRAO[tipo]) throw new Error(`efeito "${tipo}" não existe; há: ${Object.keys(PADRAO).join(', ')}`);
        for (const o of objs) {
            const ac = acao === 'adicionar' && ['desfoque', 'cantos', 'inflar', 'torcer'].includes(tipo) && (o.efeitos || []).some(e => e.tipo === tipo) ? 'alterar' : acao;
            lista(o, 'efeitos', ac, a, PADRAO[tipo] || PADRAO.sombra);
        }
        return { efeitos: (objs[0].efeitos || []).map(e => e.tipo + (e.visivel === false ? ' (oculto)' : '')) };
    });
    // expandir aparência: as camadas viram objetos comuns (grupo); sombras/brilho/desfoque continuam no grupo
    vkRegistrar('expandir_aparencia', 'expandir aparência', async a => {
        const ids = [];
        for (const o of vkTxAlvos(a)) {
            if (o.tipo === 'grupo' || o.tipo === 'imagem' || !vkApTem(o)) continue;
            const pint = await vkApPronto(o); if (!pint) continue;
            const itens = pint.map(p => ({ id: vkId(), tipo: 'caminho', regra: p.regra || 'nonzero', subs: vkClone(p.subs), preench: p.preench ? vkClone(p.preench) : null,
                traco: p.traco ? vkClone(p.traco) : null, ...(p.op != null ? { op: p.op } : {}), ...(p.bm ? { bm: p.bm } : {}), ...(o.sobre ? { sobre: vkClone(o.sobre) } : {}) }));
            const efs = (o.efeitos || []).filter(e => e.tipo !== 'cantos');
            const novo = itens.length === 1 && !efs.length ? { ...itens[0], nome: o.nome } : { id: vkId(), tipo: 'grupo', itens, ...(o.nome ? { nome: o.nome } : {}), ...(efs.length ? { efeitos: vkClone(efs) } : {}) };
            if (!novo.nome) delete novo.nome;
            if (o.op != null) novo.op = o.op; if (o.bm) novo.bm = o.bm;
            const l = vkListaDe(o.id); l.splice(l.indexOf(o), 1, novo); ids.push(novo.id);
        }
        VK.sel = ids.length ? ids : VK.sel; return { expandidos: ids.length };
    });
})();

// ─────────────────────────── painel ───────────────────────────
function vkApPainel(objs) {
    const o = objs[0], podeAp = objs.every(x => x.tipo === 'caminho' || x.tipo === 'texto');
    const L = o.aparencia || [], E = o.efeitos || [];
    let h = '';
    if (podeAp) h += `<div class="vk-sec"><div class="vk-sec-t">Aparência extra</div>
        ${L.map((l, i) => `<div class="vk-linha vk-mini vk-ap-l">
            <input type="checkbox" data-apv="${i}" ${l.visivel !== false ? 'checked' : ''} title="mostrar">
            <button class="vk-cor-btn vk-cor-mini" data-apcor="${i}" title="cor">${vkCorSw(l.cor, l.tipo === 'traco' ? 'vk-sw-traco' : '')}<span>${l.tipo === 'traco' ? 'Traço' : 'Preench.'}</span></button>
            ${l.tipo === 'traco' ? `<input type="number" step="0.25" min="0" value="${vkR(l.larg ?? 1, 2)}" data-apn="espessura:${i}" title="espessura (pt)" style="width:44px">pt` : ''}
            <input type="number" step="0.25" value="${vkR(vkMM(l.desloc || 0), 2)}" data-apn="deslocar:${i}" title="deslocar (mm): + fora, − dentro" style="width:44px">mm
            <button class="ie-btn ie-btn-mini" data-apa="atras:${i}" title="${l.atras === false ? 'na frente do objeto' : 'atrás do objeto'}">${l.atras === false ? '▲' : '▼'}</button>
            <button class="ie-btn ie-btn-mini" data-apa="remover:${i}" title="tirar">×</button></div>`).join('')}
        <div class="vk-bts"><button class="ie-btn ie-btn-mini" data-apa="novo:traco">+ Traço</button><button class="ie-btn ie-btn-mini" data-apa="novo:preench">+ Preenchimento</button>
        ${vkApTem(o) ? '<button class="ie-btn ie-btn-mini" data-apa="expandir" title="vira objetos comuns">Expandir</button>' : ''}</div></div>`;
    const nomes = { sombra: 'Sombra projetada', brilho: 'Brilho externo', brilho_interno: 'Brilho interno', desfoque: 'Desfoque', cantos: 'Cantos arredondados', zigue: 'Zigue-zague', aspero: 'Áspero', inflar: 'Inflar / murchar', torcer: 'Torcer' };
    const num = (rot, i, k, v, u = 'mm', st = 0.25) => `<label class="vk-campo vk-campo-mini"><span>${rot}</span><input type="number" step="${st}" value="${v}" data-efn="${k}:${i}">${u ? `<em>${u}</em>` : ''}</label>`;
    h += `<div class="vk-sec"><div class="vk-sec-t">Efeitos</div>
        ${E.map((e, i) => `<div class="vk-ef"><div class="vk-linha vk-mini"><input type="checkbox" data-efv="${i}" ${e.visivel !== false ? 'checked' : ''}><b>${nomes[e.tipo] || e.tipo}</b>
            ${e.cor !== undefined ? `<button class="vk-cor-btn vk-cor-mini" data-efcor="${i}">${vkCorSw(e.cor)}</button>` : ''}<button class="ie-btn ie-btn-mini" data-efa="remover:${i}">×</button></div>
            <div class="vk-grade">${e.tipo === 'sombra' ? num('X', i, 'dx', vkR(vkMM(e.dx || 0), 2)) + num('Y', i, 'dy', vkR(vkMM(e.dy || 0), 2)) : ''}
            ${e.tipo === 'cantos' ? num('Raio', i, 'raio', vkR(vkMM(e.raio || 0), 2)) : e.tipo === 'zigue' || e.tipo === 'aspero' ? num('Tam.', i, 'tamanho', vkR(vkMM(e.tamanho || 0), 2)) + (e.tipo === 'zigue' ? num('Cristas', i, 'cristas', e.cristas || 6, '', 1) : num('Detalhe', i, 'detalhe', e.detalhe || 4, '/cm', 1))
                : e.tipo === 'inflar' ? num('%', i, 'quantidade', e.quantidade || 0, '', 5) : e.tipo === 'torcer' ? num('Graus', i, 'graus', e.graus || 0, '°', 5) : num('Desf.', i, 'desfoque', vkR(vkMM(e.desfoque || 0), 2))}
            ${e.op != null ? num('Opac.', i, 'opacidade', Math.round(e.op * 100), '%', 1) : ''}</div></div>`).join('')}
        <div class="vk-linha vk-mini"><select data-efnovo="1"><option value="">+ efeito…</option>${Object.entries(nomes).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
        ${E.some(e => e.tipo !== 'cantos') ? '<div class="vk-nota">Sombra, brilho e desfoque saem rasterizados (300 ppi, na cor da tinta) — só em PDF/X-4.</div>' : ''}</div>`;
    return h;
}
function vkApPainelEventos(el) {
    if (el._vkAp) return; el._vkAp = true;
    const sel = () => VK.sel.length ? vkObj(VK.sel[0]) : null;
    el.addEventListener('change', e => {
        const t = e.target, d = t.dataset;
        if (d.apv != null) { e.stopPropagation(); return vkCmdUi('aparencia', { acao: 'alterar', indice: +d.apv, visivel: t.checked }); }
        if (d.apn) { e.stopPropagation(); const [k, i] = d.apn.split(':'); return vkCmdUi('aparencia', { acao: 'alterar', indice: +i, [k]: k === 'deslocar' ? vkPT(+t.value) : +t.value }); }
        if (d.efv != null) { e.stopPropagation(); return vkCmdUi('efeito', { acao: 'alterar', indice: +d.efv, visivel: t.checked }); }
        if (d.efn) { e.stopPropagation(); const [k, i] = d.efn.split(':'); return vkCmdUi('efeito', { acao: 'alterar', indice: +i, [k]: ['opacidade', 'cristas', 'detalhe', 'quantidade', 'graus'].includes(k) ? +t.value : vkPT(+t.value) }); }
        if (d.efnovo) { e.stopPropagation(); if (t.value) vkCmdUi('efeito', { acao: 'adicionar', tipo: t.value }); t.value = ''; }
    }, true);
    el.addEventListener('click', e => {
        const b = e.target.closest('[data-apa],[data-apcor],[data-efa],[data-efcor]'); if (!b) return;
        e.stopPropagation();
        const o = sel(); if (!o) return;
        if (b.dataset.apa) {
            const [ac, x] = b.dataset.apa.split(':');
            if (ac === 'novo') return vkCmdUi('aparencia', { acao: 'adicionar', tipo: x });
            if (ac === 'expandir') return vkCmdUi('expandir_aparencia', {});
            if (ac === 'atras') return vkCmdUi('aparencia', { acao: 'alterar', indice: +x, atras: (o.aparencia[+x] || {}).atras === false });
            return vkCmdUi('aparencia', { acao: ac, indice: +x });
        }
        if (b.dataset.apcor) { const i = +b.dataset.apcor; return vkCorPopup(b, (o.aparencia[i] || {}).cor, c => vkCmdUi('aparencia', { acao: 'alterar', indice: i, cor: c })); }
        if (b.dataset.efa) { const [ac, i] = b.dataset.efa.split(':'); return vkCmdUi('efeito', { acao: ac, indice: +i }); }
        if (b.dataset.efcor) { const i = +b.dataset.efcor; return vkCorPopup(b, (o.efeitos[i] || {}).cor, c => vkCmdUi('efeito', { acao: 'alterar', indice: i, cor: c })); }
    }, true);
}

// ─────────────────────────── DISTORCER E TRANSFORMAR (Efeito › Distorcer: zigue-zague, áspero, inflar/murchar, torcer) ───────────────────────────
// Vivos e não destrutivos: aplicados nas pinturas (pt do documento) depois de cantos/perfil; a tela e o PDF usam o mesmo resultado.
function vkSubdividir(s, n) {   // cada segmento em n pedaços (de Casteljau) — distorção suave em curva
    const P = s.pts, m = s.fechado ? P.length : P.length - 1, out = [vkClone(P[0])];
    const l = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let i = 0; i < m; i++) {
        const A = P[i], B = P[(i + 1) % P.length];
        let p0 = [A[0], A[1]], p1 = [A[4], A[5]], p2 = [B[2], B[3]], p3 = [B[0], B[1]];
        for (let k = n; k >= 1; k--) {
            const t = 1 / k, p01 = l(p0, p1, t), p12 = l(p1, p2, t), p23 = l(p2, p3, t), p012 = l(p01, p12, t), p123 = l(p12, p23, t), q = l(p012, p123, t);
            const u = out[out.length - 1]; u[4] = p01[0]; u[5] = p01[1];
            out.push(k === 1 ? [p3[0], p3[1], p012[0], p012[1], p3[0], p3[1]] : [q[0], q[1], p012[0], p012[1], q[0], q[1]]);
            p0 = q; p1 = p123; p2 = p23;
            if (k === 1 && s.fechado && i === m - 1) { const z = out.pop(); out[0][2] = z[2]; out[0][3] = z[3]; }
        }
    }
    if (!s.fechado) { /* pontas ficam */ }
    return { fechado: s.fechado, pts: out };
}
function vkRand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function vkSuave(pts, fechado) {   // polilinha → cúbicas Catmull-Rom
    const n = pts.length, at = i => pts[fechado ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    return pts.map((p, i) => { const a = at(i - 1), b = at(i + 1), tx = (b[0] - a[0]) / 6, ty = (b[1] - a[1]) / 6; return [p[0], p[1], p[0] - tx, p[1] - ty, p[0] + tx, p[1] + ty]; });
}
function vkDistSub(s, e, c, R, rnd) {
    if (s.pts.length < 2) return s;
    if (e.tipo === 'torcer') {
        const S = vkSubdividir(s, 4), g = (e.graus || 0) * Math.PI / 180;
        const rot = (x, y) => { const d = Math.hypot(x - c[0], y - c[1]), a = g * Math.max(0, 1 - d / (R || 1)), cs = Math.cos(a), sn = Math.sin(a); return [c[0] + (x - c[0]) * cs - (y - c[1]) * sn, c[1] + (x - c[0]) * sn + (y - c[1]) * cs]; };
        return { fechado: S.fechado, pts: S.pts.map(p => [...rot(p[0], p[1]), ...rot(p[2], p[3]), ...rot(p[4], p[5])]) };
    }
    if (e.tipo === 'inflar') {   // + inflar: âncoras para dentro, alças para fora; − murchar: o contrário
        const S = vkSubdividir(s, 1), f = (e.quantidade || 0) / 100 * 0.5;
        S.pts.forEach((p, i) => { const q = S.pts[(i + 1) % S.pts.length]; if (p[4] === p[0] && p[5] === p[1]) { p[4] = p[0] + (q[0] - p[0]) / 3; p[5] = p[1] + (q[1] - p[1]) / 3; }
            if (p[2] === p[0] && p[3] === p[1]) { const o = S.pts[(i - 1 + S.pts.length) % S.pts.length]; p[2] = p[0] + (o[0] - p[0]) / 3; p[3] = p[1] + (o[1] - p[1]) / 3; } });
        const mv = (x, y, k) => [c[0] + (x - c[0]) * (1 + k), c[1] + (y - c[1]) * (1 + k)];
        return { fechado: S.fechado, pts: S.pts.map(p => [...mv(p[0], p[1], -f), ...mv(p[2], p[3], f), ...mv(p[4], p[5], f)]) };
    }
    // zigue-zague e áspero: pontos ao longo do caminho, deslocados na normal
    const pl = vkDsAmostrar(s, 32, true), L = pl.at(-1)[2] || 1;
    const n = e.tipo === 'zigue' ? Math.max(2, Math.round((e.cristas || 6) * 2 * Math.max(1, s.pts.length - (s.fechado ? 0 : 1)))) : Math.max(4, Math.round(L / (vkPT(10) / (e.detalhe || 4))));
    const em = d => { let j = 1; while (j < pl.length - 1 && pl[j][2] < d) j++; const a = pl[j - 1], b = pl[j], t = (d - a[2]) / ((b[2] - a[2]) || 1e-9), nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, nx / nl, ny / nl]; };
    const out = [], tam = e.tamanho || 0;
    for (let k = 0; k <= n - (s.fechado ? 1 : 0); k++) {
        const [x, y, nx, ny] = em(L * k / n);
        const off = e.tipo === 'zigue' ? (k % 2 ? tam : -tam) * (!s.fechado && (k === 0 || k === n) ? 0 : 1) : (rnd() * 2 - 1) * tam, tg = e.tipo === 'aspero' ? (rnd() * 2 - 1) * tam * 0.5 : 0;
        out.push([x + nx * off + ny * tg, y + ny * off - nx * tg]);
    }
    return { fechado: s.fechado, pts: e.suave ? vkSuave(out, s.fechado) : out.map(q => [q[0], q[1], q[0], q[1], q[0], q[1]]) };
}
function vkDistorcer(o, pint) {
    const efs = (o.efeitos || []).filter(e => e.visivel !== false && VK_DIST.has(e.tipo)); if (!efs.length || !pint) return pint;
    let out = pint;
    let seed = 0; for (const ch of String(o.id)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    for (const e of efs) {
        const b = [Infinity, Infinity, -Infinity, -Infinity]; out.forEach(p => vkSubsBox(p.subs, null, b));
        const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], R = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2, rnd = vkRand(seed);
        out = out.map(p => ({ ...p, subs: p.subs.map(sb => vkDistSub(sb, e, c, R, rnd)) }));
    }
    return out;
}
const vkApBaseSemDist = vkApBase;
vkApBase = function (o) { const r = vkApBaseSemDist(o); return r && vkDistorce(o) ? vkDistorcer(o, r) : r; };
