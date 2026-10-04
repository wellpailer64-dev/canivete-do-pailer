// =========================================================
// Ponte Photo Kanivete → Editor Kanivete (Fase 1: levar). Os dois editores rodam na mesma página: o documento aberto
// no Photo Kanivete vira Comps no editor de vídeo, uma faixa por camada, como o importar PSD (editor-psd.js), que é
// reaproveitado: aqui se monta a mesma árvore de "nós" que o Functions/psd_import.py entrega.
//   pixel/objeto inteligente/forma → PNG com efeitos, máscara e filtros já aplicados (posição, opacidade, mesclagem)
//   texto → texto editável do editor (via vePsdTexto: fonte pelo nome PostScript, tinta alinhada); senão PNG
//   grupo → Comp dentro da Comp; camada de ajuste → camada de ajuste do editor (Camera Raw → Luz e Cor; Brilho/
//   Contraste → bc; Exposição/Vibratilidade/Matiz/Curvas → Luz e Cor); presa por corte: a de pixels vai recortada pela
//   forma da base; ajuste preso → base + ajuste numa imagem só
//   carrossel (fatias) → uma Comp por fatia, em sequência na timeline (ou a tira inteira: modo 'inteiro')
// Os PNGs ficam em <pasta do .iknv>/<nome>.camadas (por id da camada: a Fase 2 regrava o mesmo arquivo).
// Cada faixa guarda knv: {doc, camada} e cada Comp knv: {doc, parte} — base da atualização ao vivo (Fase 2).
// =========================================================

const PONTE_DUR = 6;   // segundos por slide (combinado com o usuário)
const PONTE_BM = { NORMAL: 'normal', PASS_THROUGH: 'normal', DARKEN: 'darken', MULTIPLY: 'multiply', COLOR_BURN: 'colorburn', LIGHTEN: 'lighten',
    SCREEN: 'screen', COLOR_DODGE: 'colordodge', LINEAR_DODGE: 'add', OVERLAY: 'overlay', SOFT_LIGHT: 'softlight', HARD_LIGHT: 'hardlight',
    DIFFERENCE: 'difference', EXCLUSION: 'exclusion' };

// caixa do que é opaco num canvas (alfa > 20) → {l, t, r, b} ou null
function pontePixelsCaixa(c) {
    const d = ieCtx(c).getImageData(0, 0, c.width, c.height).data, w = c.width;
    let l = w, t = c.height, r = -1, b = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    return r < 0 ? null : { l, t, r: r + 1, b: b + 1 };
}

// camada de ajuste do Photo Kanivete → efeito de ajuste do editor ({t, v}) ou null (aviso)
function ponteAjuste(L, avisos) {
    const a = L.ajuste;
    if (!a) return null;
    const limpa = o => JSON.parse(JSON.stringify(o));
    if (a.t === 'cameraRaw') {
        const v = a.v, lc = ieCrLc(v);
        lc.clar = v.clar || 0;
        lc.sharp = Math.min(100, Math.round((v.nitQ || 0) * 2 / 3));
        lc.vig = v.vig < 0 ? Math.min(100, -v.vig) : 0;
        const fora = [['tex', 'Textura'], ['nevoa', 'Remover névoa'], ['grao', 'Granulação'], ['ruidoL', 'Redução de ruído'], ['ruidoC', 'Ruído de cor']]
            .filter(([k]) => v[k]).map(([, n]) => n);
        if (v.vig > 0) fora.push('Vinheta clara');
        if (fora.length) avisos.push(`${L.nome}: ${fora.join(', ')} não existem na camada de ajuste do editor (ficou o resto)`);
        return { t: 'lc', v: limpa(lc) };
    }
    if (a.t === 'brightnesscontrast') return { t: 'bc', v: { br: Math.max(-100, Math.min(100, (a.br || 0) / 150 * 60)), ct: Math.max(-100, Math.min(100, a.ct || 0)) } };
    if (a.t === 'exposure') return { t: 'lc', v: { exp: a.exp || 0 } };
    if (a.t === 'vibrance') return { t: 'lc', v: { vib: a.vib || 0, sat: 100 + (a.sat || 0) } };
    if (a.t === 'huesaturation' && !a.colorir) { if (a.l) avisos.push(`${L.nome}: luminosidade do Matiz/Saturação não foi`); return { t: 'lc', v: { hue: a.h || 0, sat: 100 + (a.s || 0) } }; }
    if (a.t === 'curves' && a.canais && a.canais[0]) return { t: 'lc', v: { cv: { m: a.canais[0].map(([x, y]) => [x / 255, y / 255]) } } };
    avisos.push(`${L.nome}: ajuste ${L.kind || a.t} não existe no editor (ficou de fora)`);
    return null;
}

// texto do Photo Kanivete → "nó de texto" no formato do PSD (vePsdTexto faz o resto) ou null (vai como imagem)
function ponteTexto(L, R) {
    const t = L.txt;
    if (!t || !(t.fam || t.ps) || !L.c) return null;
    if ((t.escH && t.escH !== 100) || (t.escV && t.escV !== 100) || t.sublinhado || t.tachado || t.versalete || t.pos) return null;
    const fx = L.fx || {}, ligados = Object.entries(fx).filter(([k, l]) => Array.isArray(l) && l.some(e => e.on)).map(([k]) => k);
    if (ligados.some(k => k !== 'sombra') || L.m) return null;   // efeito que o texto do editor não tem: imagem
    const ink = pontePixelsCaixa(L.c);
    if (!ink) return null;
    const m = Array.isArray(t.m) && t.m.length >= 4 ? t.m : [1, 0, 0, 1];
    const s = (fx.sombra || []).find(e => e.on);
    return {
        misto: false, texto: String(t.s || ''), tf: [m[0], m[1], m[2], m[3]], alin: t.alin || 'left', caixa: t.caixa || null,
        // família + estilo ("Exo 2" + "Bold Italic"): o nome PostScript lido do arquivo às vezes vem errado (copyright)
        runs: [{ fonte: t.fam && t.estilo ? `${t.fam}-${t.estilo}` : t.ps, caixa_alta: !!t.caixaAlta, neg: !!t.negFalso, ita: !!t.itaFalso, tam: t.tam, esp: t.esp || 0, auto_ent: !(t.ent > 0), ent: t.ent || 0, cor: t.cor }],
        tinta: [L.x + ink.l - R.x, L.y + ink.t - R.y, L.x + ink.r - R.x, L.y + ink.b - R.y],
        efeitos: s ? { sombra: { cor: s.cor, op: s.op, dist: s.dist, tam: s.tam, ang: s.ang } } : {},
    };
}

// árvore de nós de uma parte (retângulo R do documento) + PNGs a gravar (por id: o mesmo arquivo serve a todas as partes)
function ponteNos(doc, lista, R, ctx) {
    const nos = [];
    const imagemDe = (chave, plano, nome, L) => {
        if (!plano || !plano.c) return null;
        const P = ieRInter({ x: plano.x, y: plano.y, w: plano.c.width, h: plano.c.height }, R);
        if (!P) return null;
        if (!ctx.png.has(chave)) ctx.png.set(chave, { c: plano.c, destino: `${ctx.pasta}\\${chave}.png` });
        return { nome, visivel: L.visivel !== false, op: Math.round((L.op ?? 1) * 100), bm: PONTE_BM[L.bm] || 'normal',
            x: plano.x - R.x, y: plano.y - R.y, w: plano.c.width, h: plano.c.height, png: ctx.png.get(chave).destino, knv: { camada: L.id } };
    };
    for (let i = 0; i < lista.length; i++) {
        const L = lista[i];
        if (L.referencia || L.etapaOculta) continue;
        if (!L.visivel && !ctx.ocultas) continue;
        // camadas presas a esta (máscara de corte)
        let j = i + 1;
        const presas = [];
        while (j < lista.length && lista[j].clip) presas.push(lista[j++]);
        const Rl = ieRCamada(L);
        if (L.tipo !== 'ajuste' && (!Rl || !ieRInter(Rl, R))) { i = j - 1; continue; }
        if (presas.some(p => p.tipo === 'ajuste')) {   // ajuste preso: base + presas numa imagem só
            const Ri = ieRInt(ieRInter(Rl, ieRDoc(doc)) || Rl), c = ieAchatar(doc, [L, ...presas], Ri);
            ctx.avisos.push(`${L.nome}: ajuste preso (máscara de corte) foi junto na imagem da camada`);
            const no = imagemDe(`${L.id}_corte`, { c, x: Ri.x, y: Ri.y }, L.nome, L);
            if (no) { no.op = 100; no.bm = 'normal'; nos.push(no); }
            i = j - 1; continue;
        }
        if (L.tipo === 'grupo') {
            const filhos = ponteNos(doc, L.filhos || [], R, ctx);
            if (filhos.length) nos.push({ nome: L.nome, visivel: L.visivel !== false, op: Math.round((L.op ?? 1) * 100), bm: PONTE_BM[L.bm] || 'normal', filhos, knv: { camada: L.id } });
            if (L.m && !L.m.desativada) ctx.avisos.push(`${L.nome}: máscara de grupo não foi (os filhos vão inteiros)`);
        } else if (L.tipo === 'ajuste') {
            const aj = ponteAjuste(L, ctx.avisos);
            if (aj) nos.push({ nome: L.nome, visivel: L.visivel !== false, op: Math.round((L.op ?? 1) * 100), bm: PONTE_BM[L.bm] || 'normal', ajuste: aj, knv: { camada: L.id } });
        } else {
            const no = imagemDe(String(L.id), ieRasterTudo(L), L.nome, L);
            if (no) {
                if (L.txt) { const tx = ponteTexto(L, R); if (tx) no.texto = tx; }
                nos.push(no);
            }
        }
        // presas de pixels/texto: cada uma vai recortada pela forma da base
        for (const P of presas) {
            if (!P.visivel) continue;
            const rp = ieRasterTudo(P);
            if (!rp || !rp.c) continue;
            const base = L.tipo === 'grupo' ? { c: ieAchatar(doc, [L], ieRDoc(doc)), x: 0, y: 0 } : ieRasterTudo(L);
            const c = ieClonar(rp.c), x = ieCtx(c);
            x.globalCompositeOperation = 'destination-in';
            if (base && base.c) x.drawImage(base.c, base.x - rp.x, base.y - rp.y);
            const no = imagemDe(`${P.id}_presa`, { c, x: rp.x, y: rp.y }, P.nome, P);
            if (no) nos.push(no);
        }
        i = j - 1;
    }
    return nos;
}

// Photo Kanivete: botão "Levar para o Editor Kanivete". modo: 'slides' (uma Comp por fatia; padrão com fatias) | 'inteiro'
async function ponteLevar({ modo } = {}) {
    const doc = IE.doc, api = ieApi();
    if (!doc || !api) return;
    if (!doc.path || !/\.iknv$/i.test(doc.path)) {
        ieToast(ieT('Salve o documento como projeto (.iknv) antes de levar para o Editor Kanivete'));
        await ieCmd('salvar');
        if (!doc.path || !/\.iknv$/i.test(doc.path)) return;
    }
    const base = doc.path.replace(/\.iknv$/i, ''), pasta = base + '.camadas', nome = String(doc.nome || base.split(/[\\/]/).pop()).replace(/\.iknv$/i, '');
    const fatias = (doc.fatias || []).filter(f => f.w > 0 && f.h > 0);
    modo = modo || (fatias.length > 1 ? 'slides' : 'inteiro');
    const partes = modo === 'slides' && fatias.length ? fatias.map((f, i) => ({ x: f.x, y: f.y, w: f.w, h: f.h, nome: `${nome} · ${f.nome || String(i + 1).padStart(2, '0')}` }))
        : [{ x: 0, y: 0, w: doc.w, h: doc.h, nome }];
    ieToast(ieT('Preparando as camadas para o Editor Kanivete...'));
    ieCompor(doc, ieRDoc(doc));
    const ctx = { pasta, png: new Map(), avisos: [] }, spec = { doc: doc.path, nome, partes: [] };
    for (const [i, P] of partes.entries()) {
        const camadas = ponteNos(doc, doc.camadas, P, ctx);
        const ach = ieCanvas(P.w, P.h); ieCtx(ach).drawImage(doc.comp, P.x, P.y, P.w, P.h, 0, 0, P.w, P.h);
        ctx.png.set(`_parte${i + 1}`, { c: ach, destino: `${pasta}\\_parte${i + 1}.png` });
        spec.partes.push({ nome: P.nome, w: P.w, h: P.h, camadas, achatado: `${pasta}\\_parte${i + 1}.png`, avisos: ctx.avisos, parte: i + 1 });
    }
    // grava os PNGs (um envio só)
    const ini = await api.ie_salvar_inicio(null), itens = [];
    let n = 0;
    for (const [k, v] of ctx.png) { const arq = `p${n++}.png`; await ieEnviar(ini.url, arq, v.c); itens.push({ arquivo: arq, destino: v.destino }); }
    const e = await api.ie_exportar_fatias({ sessao: ini.sessao, fatias: itens, qualidade: 100, dpi: doc.dpi });
    if (!e || !e.success) { ieToast(`${ieT('Não gravou as camadas')}: ${((e && e.erros) || []).slice(0, 2).join(', ')}`); return; }
    if (typeof switchTool === 'function') switchTool('video-cutter');
    return veKnvAbrir(spec);
}

// ─────────────────────────── lado do editor de vídeo ───────────────────────────
// monta as Comps (uma por parte) com o mesmo código do PSD e põe em sequência na timeline
async function veKnvAbrir(spec) {
    if (typeof vePsdMontar !== 'function') return null;
    let novo = false;
    if (!VE.ready) {
        veOpenPath(spec.partes[0].achatado);
        if (!await vePsdEsperar(() => VE.ready && VE.clips.length, 30000)) { veToast(veT('Não consegui abrir no Editor Kanivete')); return null; }
        VE.clips = [];
        novo = true;
    }
    if (VE.playing) veStop();
    veSeqSalvarAtiva();
    vePushHistory();
    const pastaPai = typeof vePjDestino === 'function' ? vePjDestino() : null, comps = [];
    for (const P of spec.partes) {
        const m = await vePsdMontar({ nome: P.nome, w: P.w, h: P.h, camadas: P.camadas, avisos: P.avisos }, pastaPai, { dur: PONTE_DUR, prefixo: 'Photo Kanivete · ' });
        m.knv = { doc: spec.doc, parte: P.parte };
        comps.push(m);
    }
    let st = novo ? 0 : veSnapFrame(VE.playhead), primeiro = null;
    for (const m of comps) {
        const b = st + PONTE_DUR, clip = { st, s: 0, e: PONTE_DUR, m: m.id, cor: VE_COMP_COR, knv: m.knv };
        let tr = novo ? 0 : veTrackIndexes().find(k => !veTrkLocked(k) && veTrackFree(k, st, b, clip));
        if (tr == null) tr = veTrackCount();
        clip.tr = tr;
        veEnsureTrackIndex(tr, { refresh: true });
        clip.p = veDefProps(clip);
        VE.clips.push(clip);
        primeiro = primeiro || clip;
        st = b;
    }
    veRelayout();
    if (primeiro) veSelDefinir([primeiro], primeiro);
    veSeqSalvarAtiva();
    veAfterEdit(VE.playhead);
    vePjRender();
    if (typeof veCompVerificar === 'function') veCompVerificar();
    const av = [...new Set(spec.partes.flatMap(p => p.avisos))];
    veToast(`Photo Kanivete → ${comps.length} ${veT(comps.length === 1 ? 'Comp' : 'Comps')}` + (av.length ? ` · ${av.length} ${veT('aviso(s) no console')}` : ''));
    if (av.length) console.warn('[Ponte Kanivete]\n' + av.join('\n'));
    return { comps: comps.map(m => m.id), avisos: av };
}

if (typeof IE_CMDS === 'object') { IE_CMDS.ponteLevar = () => ponteLevar(); IE_CMDS.ponteLevarInteiro = () => ponteLevar({ modo: 'inteiro' }); }
