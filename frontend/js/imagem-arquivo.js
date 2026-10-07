// =========================================================
// Editor de Imagem — documentos (abrir, salvar em PSD, exportar), comandos dos menus e a ligação com o app.
// Abrir: Functions/editor_imagem.py serve cada camada como PNG da memória; aqui viram canvases. Salvar: a página
// manda por POST só o que mudou (pixels pintados, máscaras mexidas, camadas novas) e a composição; o Python relê o
// PSD de origem e troca só isso (ver o cabeçalho de editor_imagem.py).
// =========================================================

const IE_EXT = /\.(iknv|psd|psb|png|jpe?g|webp|bmp|gif|tiff?|heic|heif|avif)$/i;
const ieApi = () => window.pywebview && window.pywebview.api;
const ieNomeArq = p => String(p || '').split(/[\\/]/).pop();

function ieCarregando(txt, pct) {
    const box = ieEl('ie-carregando');
    if (!box) return;
    if (txt === false) { box.hidden = true; return; }
    box.hidden = false;
    if (txt) ieEl('ie-carregando-txt').textContent = txt;
    ieEl('ie-carregando-barra').style.width = (pct == null ? 0 : pct) + '%';
}
function ieProgresso(d) { if (d && IE.abrindo) ieCarregando(`${ieT('Lendo')} ${IE.abrindo}: ${d.nome || ''}`, d.p); }
window.ieProgresso = ieProgresso;

async function ieImagemDeUrl(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const b = await r.blob();
    const bmp = await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = ieCanvas(bmp.width, bmp.height);
    ieCtx(c).drawImage(bmp, 0, 0);
    bmp.close?.();
    return c;
}
// máscara (PNG em tons de cinza) → canvas em que o alfa é o valor
function ieCinzaParaAlfa(c) {
    const x = ieCtx(c), img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = d[i + 1] = d[i + 2] = 255; }
    x.putImageData(img, 0, 0);
    return c;
}
// alfa → PNG em cinza (para gravar a máscara)
function ieAlfaParaCinza(c) {
    const n = ieCanvas(c.width, c.height), x = ieCtx(n);
    x.fillStyle = '#000'; x.fillRect(0, 0, n.width, n.height);
    x.drawImage(c, 0, 0);
    return n;
}

async function iePool(itens, n, fn) {
    let i = 0;
    const trab = async () => { while (i < itens.length) { const k = i++; await fn(itens[k], k); } };
    await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trab));
}

// ─────────────────────────── abrir ───────────────────────────
async function ieAbrirArquivo(path) {
    const api = ieApi();
    if (!api || !path) return null;
    const ja = IE.docs.find(d => d.path && d.path.toLowerCase() === path.toLowerCase());
    if (ja) { ieMostrarDoc(ja); return ja; }
    IE.abrindo = ieNomeArq(path);
    ieCarregando(`${ieT('Abrindo')} ${IE.abrindo}...`, 0);
    try {
        const r = await api.ie_abrir(path);
        if (!r || !r.success) { ieToast(`${ieT('Não abriu')}: ${(r && r.error) || ''}`); return null; }
        if (r.iknv) return await ieMontarIknv(r, path);
        const doc = ieNovoDoc({ nome: r.nome, w: r.w, h: r.h, dpi: r.dpi, path, psdPath: r.psd ? path : null, pyId: r.doc, bits: r.bits, modo: r.modo, avisos: r.avisos || [] });
        doc.fatias = (r.fatias || []).map(f => ({ ...f, id: ++doc.seqFatia }));
        doc.fatiasOrig = JSON.stringify(ieFatiasSpec(doc));
        doc.psb = !!r.psb;
        if (r.luz) doc.luzGlobal = { ang: r.luz.ang, alt: r.luz.alt };
        doc.guias = (r.guias || []).map(g => ({ ...g })); doc.guiasOrig = JSON.stringify(doc.guias);
        const pend = [];
        const montar = (nos) => nos.map(no => {
            const L = ieNovaCamada(doc, {
                tipo: no.tipo, nome: no.nome, visivel: no.visivel, op: no.op, fill: no.fill ?? 1, bm: no.bm || 'NORMAL', clip: !!no.clip,
                travas: no.travas || 0, ref: no.ref ?? null, refNome: no.ref != null ? (no.nome ?? null) : null, kind: no.kind || null, aberto: no.aberto, x: no.x || 0, y: no.y || 0,
                fx: ieFxNorm(no.fx) || null, ajuste: no.ajuste || null, texto: no.texto || null, fxOculto: !!no.fx_oculto,
            });
            for (const k of IE_MESCLA_CHAVES) if (no[k] !== undefined) L[k] = no[k];
            if (no.prancheta) L.prancheta = { ...no.prancheta };
            if (no.tipo === 'grupo') L.filhos = montar(no.filhos || []);
            if (no.url) pend.push({ url: no.url, fim: c => { L.c = c; if (['texto', 'inteligente', 'forma', 'preenchimento'].includes(L.tipo)) { L.c0 = { c, x: L.x, y: L.y }; L.tf = [...IE_ID]; L.tfBase = [...IE_ID]; } } });
            else if (['texto', 'inteligente', 'forma', 'preenchimento'].includes(L.tipo)) { L.tf = [...IE_ID]; L.tfBase = [...IE_ID]; }
            if (no.mascara) {
                const m = no.mascara;
                L.m = { c: null, x: m.x, y: m.y, fundo: m.fundo || 0, desativada: !!m.desativada };
                if (m.url) pend.push({ url: m.url, fim: c => { L.m.c = ieCinzaParaAlfa(c); } });
            }
            if (no.fundo) L.nome = no.nome;
            return L;
        });
        doc.camadas = montar(r.camadas || []);
        let feitos = 0;
        await iePool(pend, 6, async p => {
            try { p.fim(await ieImagemDeUrl(p.url)); } catch (e) { console.error('[editor de imagem] camada', e); doc.avisos.push(`${ieT('camada não carregada')}: ${e.message}`); }
            feitos++;
            ieCarregando(`${ieT('Montando camadas')} (${feitos}/${pend.length})`, feitos * 100 / Math.max(1, pend.length));
        });
        if (r.achatado) { try { doc.achatadoC = await ieImagemDeUrl(r.achatado); doc.achatado = true; } catch (e) { /* sem prévia */ } }
        api.ie_liberar(r.doc);
        const topo = doc.camadas[doc.camadas.length - 1];
        doc.ativa = topo ? topo.id : null;
        doc.selIds = doc.ativa != null ? [doc.ativa] : [];
        IE.docs.push(doc);
        ieMostrarDoc(doc);
        ieAjustarVista(doc);
        ieHist('Abrir', doc);
        doc.sujo = false;
        ieRecentesAdd(path);
        if (doc.avisos.length) ieToast(`${doc.avisos.length} ${ieT('aviso(s) ao abrir: Exibir > Avisos da abertura')}`);
        return doc;
    } catch (e) {
        console.error('[editor de imagem] abrir', e);
        ieToast(`${ieT('Não abriu')}: ${e.message || e}`);
        return null;
    } finally {
        IE.abrindo = null;
        ieCarregando(false);
    }
}

async function ieAbrirDialogo() {
    const api = ieApi();
    if (!api) return;
    const r = await api.ie_dialogo_abrir(true);
    if (r && r.success) for (const p of r.paths) await ieAbrirArquivo(p);
}

// arquivos soltos na página: abre como documento (ou coloca como camada, se soltar em cima de um documento aberto)
async function ieReceberArquivos(itens, comoCamada) {
    const paths = (itens || []).filter(i => !i.pasta && IE_EXT.test(i.path)).map(i => i.path);
    if (!paths.length) { ieToast(ieT('Solte um PSD ou uma imagem')); return; }
    for (const p of paths) {
        if (comoCamada && IE.doc) await ieColocarArquivo(p);
        else await ieAbrirArquivo(p);
    }
}

// Colocar (como camada nova, no centro, cabendo no documento)
async function ieColocarArquivo(path) {
    const api = ieApi(), doc = IE.doc;
    if (!api || !doc) return;
    ieCarregando(`${ieT('Colocando')} ${ieNomeArq(path)}...`, 30);
    try {
        const r = await api.ie_abrir(path);
        if (!r || !r.success) { ieToast(`${ieT('Não abriu')}: ${(r && r.error) || ''}`); return; }
        let c;
        if (r.achatado) c = await ieImagemDeUrl(r.achatado);
        else if (r.camadas && r.camadas[0] && r.camadas[0].url) c = await ieImagemDeUrl(r.camadas[0].url);
        api.ie_fechar(r.doc);
        if (!c) return;
        ieColocarCanvas(c, r.nome || ieNomeArq(path));
    } finally { ieCarregando(false); }
}
function ieColocarCanvas(c, nome, x, y) {
    const doc = IE.doc;
    let k = 1;
    if (x === undefined && (c.width > doc.w || c.height > doc.h)) k = Math.min(doc.w / c.width, doc.h / c.height);
    if (k < 1) { const t = ieTransformarPlano({ c, x: 0, y: 0 }, [k, 0, 0, k, 0, 0]); c = t.c; }
    if (x === undefined) { x = Math.round((doc.w - c.width) / 2); y = Math.round((doc.h - c.height) / 2); }
    const L = ieNovaCamada(doc, { nome: nome || ieNomeLivre(doc, ieT('Camada')), c, x, y, sujoPx: true });
    // acima da camada SELECIONADA; nada selecionado → acima de todas (a "ativa" antiga não conta)
    ieInserirAcima(doc, L, doc.selIds.length ? ieAtiva(doc) : null);
    ieCamadaMudou(L);
    ieHist(ieT('Colocar'));
    ieUiCamadas();
    return L;
}

// ─────────────────────────── novo ───────────────────────────
// 5º item 'car' = carrossel: a largura é a de uma página × Páginas, com guias e fatias por página (1080 × 1440, 3 páginas = 3240 × 1440)
const IE_PREDEF = [['1080 × 1080 (post)', 1080, 1080, 72], ['1080 × 1350 (retrato)', 1080, 1350, 72], ['1080 × 1440 (feed)', 1080, 1440, 72], ['1080 × 1920 (story/reels)', 1080, 1920, 72],
    ['Carrossel 1080 × 1440 (feed)', 1080, 1440, 72, 'car'], ['Carrossel 1080 × 1350 (retrato)', 1080, 1350, 72, 'car'], ['Carrossel 1080 × 1080 (quadrado)', 1080, 1080, 72, 'car'],
    ['1920 × 1080 (Full HD)', 1920, 1080, 72], ['3840 × 2160 (4K)', 3840, 2160, 72], ['A4 300 ppi', 2480, 3508, 300], ['1280 × 720 (thumbnail)', 1280, 720, 72]];

async function ieNovoDialogo() {
    const v = await ieDialogo({
        titulo: 'Novo documento', ok: 'Criar',
        campos: [
            { id: 'nome', rotulo: 'Nome', tipo: 'texto', valor: ieT('Sem título') + '-' + (IE.seqDoc + 1) },
            { id: 'pre', rotulo: 'Predefinição', tipo: 'select', valor: '', opcoes: [['', 'Personalizado'], ...IE_PREDEF.map((p, i) => [String(i), p[0]])] },
            { id: 'w', rotulo: 'Largura (px)', tipo: 'numero', min: 1, max: 30000, valor: IE.ultNovo?.w || 1080 },
            { id: 'h', rotulo: 'Altura (px)', tipo: 'numero', min: 1, max: 30000, valor: IE.ultNovo?.h || 1080 },
            { id: 'dpi', rotulo: 'Resolução (ppi)', tipo: 'numero', min: 1, max: 2400, valor: IE.ultNovo?.dpi || 72 },
            { id: 'pag', rotulo: 'Páginas (carrossel)', tipo: 'numero', min: 1, max: 20, valor: IE.ultNovo?.pag || 3 },
            { id: 'fundo', rotulo: 'Conteúdo do fundo', tipo: 'select', valor: 'branco', opcoes: [['branco', 'Branco'], ['preto', 'Preto'], ['frente', 'Cor de frente'], ['fundo', 'Cor de fundo'], ['transp', 'Transparente']] },
        ],
    });
    if (!v) return;
    let { w, h, dpi } = v;
    const pre = v.pre !== '' ? IE_PREDEF[+v.pre] : null, pag = pre && pre[4] === 'car' ? ieClamp(Math.round(v.pag) || 1, 1, 20) : 0;
    if (pre) { w = pre[1] * (pag || 1); h = pre[2]; dpi = pre[3]; }
    w = ieClamp(Math.round(w) || 1080, 1, 30000); h = ieClamp(Math.round(h) || 1080, 1, 30000);
    IE.ultNovo = { w, h, dpi, pag: pag || IE.ultNovo?.pag };
    const doc = ieNovoDoc2(v.nome || ieT('Sem título'), w, h, dpi, v.fundo);
    if (pag > 1 && typeof ieGuiasLayoutAplicar === 'function') {   // uma coluna por página (medianiz 0) e uma fatia por página, como se faz no Photoshop
        ieGuiasLayoutAplicar(doc, { colunas: { n: pag, largura: '', medianiz: 0 } });
        ieFatiasDasGuias(doc, { perguntar: false });
        doc.sujo = false;
    }
}
function ieNovoDoc2(nome, w, h, dpi = 72, fundo = 'branco') {
    const doc = ieNovoDoc({ nome, w, h, dpi });
    const cor = { branco: '#ffffff', preto: '#000000', frente: IE.cor[0], fundo: IE.cor[1] }[fundo];
    let L;
    if (cor) {
        const c = ieCanvas(w, h), x = ieCtx(c);
        x.fillStyle = cor; x.fillRect(0, 0, w, h);
        L = ieNovaCamada(doc, { nome: ieT('Fundo'), c, x: 0, y: 0, sujoPx: true });
    } else L = ieNovaCamada(doc, { nome: ieT('Camada 1'), sujoPx: true });
    doc.camadas = [L];
    doc.ativa = L.id; doc.selIds = [L.id];
    IE.docs.push(doc);
    ieMostrarDoc(doc);
    ieAjustarVista(doc);
    ieHist('Novo', doc);
    doc.sujo = false;
    return doc;
}

// ─────────────────────────── documentos ───────────────────────────
function ieMostrarDoc(doc) {
    ieTextoEncerrar?.(true);
    if (IE.transf) ieTransfAplicar();
    IE.doc = doc || null;
    IE.corte = null;
    if (doc && IE.ferr === 'corte') IE_CORTE.ativar(doc);
    ieAbasRender();
    ieTudo(doc);
    ieHistRender();
    ieOpcoesRender();
    ieStatusRender();
    ieDesenharVista();
}
async function ieFecharDoc(doc, semPerguntar) {
    if (!doc) return true;
    if (doc.sujo && !semPerguntar) {
        if (IE.doc !== doc) ieMostrarDoc(doc);
        const r = await appConfirm({
            titulo: `${ieT('Salvar as alterações em')} "${doc.nome}"?`, texto: ieT('As alterações não salvas se perdem.'),
            botoes: [{ rotulo: ieT('Cancelar'), valor: null }, { rotulo: ieT('Não salvar'), valor: 'n', tipo: 'perigo' }, { rotulo: ieT('Salvar'), valor: 's', tipo: 'primario' }],
        });
        if (!r) return false;
        if (r === 's' && !(await ieSalvar())) return false;
    }
    const i = IE.docs.indexOf(doc);
    if (i >= 0) IE.docs.splice(i, 1);
    if (doc.pyId) ieApi()?.ie_fechar(doc.pyId);
    if (IE.doc === doc) ieMostrarDoc(IE.docs[Math.min(i, IE.docs.length - 1)] || null);
    else ieAbasRender();
    return true;
}
async function ieFecharTodos() {
    for (const d of [...IE.docs]) if (!(await ieFecharDoc(d))) return false;
    return true;
}

// ─────────────────────────── salvar ───────────────────────────
function ieCanvasBlob(c, tipo = 'image/png', q) {
    return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob falhou'))), tipo, q));
}
async function ieEnviar(url, chave, c) {
    const b = await ieCanvasBlob(c);
    const r = await fetch(url + chave, { method: 'POST', body: b, headers: { 'Content-Type': 'image/png' } });
    if (!r.ok && r.status !== 204) throw new Error(`envio ${chave}: HTTP ${r.status}`);
}

function ieMatEhId(m) { return !m || (Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[4]) < 1e-6 && Math.abs(m[5]) < 1e-6); }

async function ieSalvarPdfAchatado(doc, destino) {
    const api = ieApi();
    ieCarregando(`${ieT('Gravando o PDF')}...`, 30);
    try {
        ieCompor(doc, ieRDoc(doc));
        const ini = await api.ie_salvar_inicio(null);
        await ieEnviar(ini.url, 'composto.png', doc.comp);
        const r = await api.ie_exportar({ sessao: ini.sessao, composto: 'composto.png', destino, qualidade: 92, dpi: doc.dpi });
        if (!r || !r.success) { ieToast(`${ieT('Não salvou')}: ${(r && r.error) || ''}`); return false; }
        ieToast(`${ieT('Salvo')}: ${ieNomeArq(destino)}`);
        return true;
    } finally { ieCarregando(false); }
}

async function ieSalvar(comoNovo = false, destinoForcado = null, refeito = false) {
    const doc = IE.doc, api = ieApi();
    if (!doc || !api) return false;
    ieTextoEncerrar(true);
    if (IE.transf) ieTransfAplicar();
    if (doc.pai && !comoNovo) return ieConteudoDevolver(doc);   // aba de conteúdo de objeto inteligente: devolve à origem
    // Ctrl+S: projeto (.iknv) aberto salva nele; PSD aberto salva no PSD (ida e volta); o resto pergunta.
    // No diálogo dá para escolher .iknv (projeto do KANIVETE, padrão do documento novo) ou .psd.
    let destino = destinoForcado || (comoNovo ? null : (/\.iknv$/i.test(doc.path || '') ? doc.path : doc.psdPath));
    const grande = doc.w > 30000 || doc.h > 30000 || doc.psb;
    if (!destino) {
        const pasta = doc.path ? doc.path.replace(/[\\/][^\\/]*$/, '') : '';
        const padrao = grande ? 'psb' : (doc.psdPath && !/\.iknv$/i.test(doc.path || '') ? 'psd' : 'iknv');
        const r = await api.ie_dialogo_salvar(doc.nome, padrao, pasta);
        if (!r || !r.success) return false;
        destino = r.path;
    }
    if (/\.iknv$/i.test(destino)) return ieSalvarIknv(doc, destino);
    if (/\.pdf$/i.test(destino)) return ieSalvarPdfAchatado(doc, destino);
    ieCarregando(`${ieT('Salvando')} ${ieNomeArq(destino)}...`, 5);
    try {
        const ini = await api.ie_salvar_inicio(doc.pyId);
        const ida = !!(ini && ini.ida_e_volta && doc.pyId);
        const envios = [];
        let n = 0;
        const no = L => {
            const s = { uid: L.uid, ref: ida ? L.ref : null, ref_nome: ida && L.ref != null ? (L.refNome ?? null) : null, tipo: L.tipo, nome: L.nome, visivel: L.visivel, op: L.op, fill: L.fill, bm: L.bm, clip: !!L.clip, aberto: L.aberto !== false };
            if (L.tipo === 'grupo') { s.filhos = L.filhos.map(no); if (L.prancheta && L.pranchetaMudou) s.prancheta = L.prancheta; }
            // efeitos: só vão quando mudaram no editor (ou camada nova); o Python troca só os 4 que o editor conhece
            else if (L.fxMudou || ((!ida || L.ref == null) && L.fx && ieTemFx(L.fx))) { s.fx = ieFxNorm(L.fx) || {}; s.fx_oculto = !!L.fxOculto; }
            if (L.mesclaMudou || !ida || L.ref == null) s.mescla = Object.fromEntries(IE_MESCLA_CHAVES.filter(k => L[k] !== undefined).map(k => [k, L[k]]));
            if (ieRaster0(L)) {
                const novo = !ida || L.ref == null || L.sujoPx || L.rasterizar;
                if (L.c) {
                    s.x = L.x; s.y = L.y;
                    if (novo) { const k = 'c' + (++n) + '.png'; s.chave = k; envios.push({ k, L, plano: 'c' }); }
                }
                if (L.rasterizar) s.rasterizar = true;
                if (ida && L.ref != null && L.tf && !ieMatEhId(L.tf)) {
                    const rel = ieMatMul(L.tf, ieMatInv(L.tfBase || IE_ID));
                    if (!ieMatEhId(rel)) s.tf = rel;
                }
                if (ida && L.ref != null && L.textoNovo != null) { s.texto_novo = L.textoNovo; s.texto_estilo = L.textoEstilo || null; }
                // texto criado no editor: o Python monta uma camada de texto do Photoshop (continua editável lá)
                if (L.tipo === 'texto' && L.txt && (!ida || L.ref == null) && !L.rasterizar) {
                    const t = L.txt;
                    s.texto_ps = { s: t.s, m: t.m || IE_ID, caixa: t.caixa || null, ps: t.ps || '',
                        trechos: (t.trechos || []).map(r => ({ a: r.a, b: r.b, ps: r.ps, cor: r.cor, negFalso: r.negFalso, itaFalso: r.itaFalso, sublinhado: r.sublinhado, tachado: r.tachado })),
                        ...Object.fromEntries(IE_TX_CHAVES.filter(k => t[k] !== undefined).map(k => [k, t[k]])) };
                }
                // forma criada no editor: o Python monta uma camada de forma do Photoshop (cor sólida + máscara vetorial)
                if (L.tipo === 'forma' && L.vet && (!ida || L.ref == null) && !L.rasterizar)
                    s.forma_ps = { cor: L.vet.cor, subs: (L.vet.subs || []).map(sb => ({ fechado: sb.fechado !== false, op: sb.op || 'somar',
                        pts: sb.pts.map(q => ({ x: q.x, y: q.y, i: q.i || null, o: q.o || null })) })) };
            }
            if (L.m) {
                const m = { x: L.m.x, y: L.m.y, fundo: L.m.fundo || 0, desativada: !!L.m.desativada };
                if (!ida || L.ref == null || L.sujoM) { const k = 'm' + (++n) + '.png'; m.key = k; envios.push({ k, L, plano: 'm' }); }
                s.mascara = m;
            } else s.mascara = null;
            return s;
        };
        const camadas = doc.camadas.map(no);
        // composição para a prévia do arquivo
        ieCompor(doc, ieRDoc(doc));
        envios.push({ k: 'composto.png', c: doc.comp });
        let feitos = 0;
        await iePool(envios, 4, async e => {
            let c = e.c;
            if (!c && e.plano === 'c') c = e.L.c;
            if (!c && e.plano === 'm') {
                // máscara sem pixels (revelar/ocultar tudo): 1×1 com a cor de fundo
                c = e.L.m.c ? ieAlfaParaCinza(e.L.m.c) : (() => { const t = ieCanvas(1, 1), x = ieCtx(t); x.fillStyle = e.L.m.fundo ? '#fff' : '#000'; x.fillRect(0, 0, 1, 1); return t; })();
            } else if (e.plano === 'm') c = ieAlfaParaCinza(c);
            await ieEnviar(ini.url, e.k, c);
            feitos++;
            ieCarregando(null, 5 + feitos / envios.length * 70);
        });
        ieCarregando(`${ieT('Gravando o PSD')}...`, 80);
        const spec = { doc: doc.pyId, sessao: ini.sessao, destino, w: doc.w, h: doc.h, camadas, composto: 'composto.png', ida_e_volta: ida,
            fatias: ieFatiasSpec(doc), fatias_mudou: JSON.stringify(ieFatiasSpec(doc)) !== doc.fatiasOrig, luz: doc.luzGlobal || null,
            guias: doc.guias || [], guias_mudou: JSON.stringify(doc.guias || []) !== (doc.guiasOrig || '[]') };
        const r = await api.ie_salvar(spec);
        if (r && r.refaz && !refeito) {   // referências do arquivo desencontradas: esquece todas e grava tudo de novo
            iePercorrer(doc.camadas, L => { L.ref = null; L.refNome = null; });
            ieToast(ieT('Camadas do PSD desencontradas: gravando o arquivo inteiro de novo (nenhuma camada se perde)'));
            ieCarregando(false);
            return ieSalvar(false, destino, true);
        }
        if (!r || !r.success) { ieToast(`${ieT('Não salvou')}: ${(r && r.error) || ''}`); return false; }
        // o arquivo salvo vira a origem
        doc.pyId = r.doc;
        doc.psdPath = destino; doc.path = destino;
        doc.nome = ieNomeArq(destino).replace(/\.(psd|psb)$/i, '');
        iePercorrer(doc.camadas, L => {
            // referências novas conferidas pelo Python; sem elas (não conferiram), o próximo salvamento grava tudo
            if (!r.refs) { L.ref = null; L.refNome = null; }
            else if (r.refs[L.uid] !== undefined && r.refs[L.uid] !== null) { L.ref = r.refs[L.uid]; L.refNome = L.nome; }
            L.sujoPx = false; L.sujoM = false; L.rasterizar = false; L.movido = false; L.pranchetaMudou = false; L.fxMudou = false; L.mesclaMudou = false;
            if (L.tf) L.tfBase = [...L.tf];
            if (L.textoNovo != null && L.texto) { L.texto.texto = L.textoNovo; }
            L.textoNovo = null;
        });
        doc.achatadoC = ieClonar(doc.comp); doc.achatado = true;
        doc.fatiasOrig = JSON.stringify(ieFatiasSpec(doc)); doc.guiasOrig = JSON.stringify(doc.guias || []);
        doc.sujo = false;
        ieAbasRender();
        ieRecentesAdd(destino);
        const av = (r.avisos || []).length ? ` (${r.avisos.length} ${ieT('aviso(s)')}: ${r.avisos.slice(0, 2).join('; ')})` : '';
        ieToast(`${ieT('Salvo')}: ${ieNomeArq(destino)}${av}`);
        doc.avisosSalvar = r.avisos || [];
        return true;
    } catch (e) {
        console.error('[editor de imagem] salvar', e);
        ieToast(`${ieT('Não salvou')}: ${e.message || e}`);
        return false;
    } finally { ieCarregando(false); }
}

// ── Editar conteúdo do objeto inteligente (duplo clique na miniatura, como no Photoshop): abre numa aba do tamanho
// dele; Ctrl+S nessa aba devolve para o documento de origem (pixels + camadas guardadas; escala/rotação e filtros
// inteligentes do objeto continuam valendo) ──
function ieConteudoAbrir(doc, L) {
    if (!doc || !L || L.tipo !== 'inteligente' || !L.c0) return;
    if (L.vetor && typeof vpEditarNoVetor === 'function') return vpEditarNoVetor(doc, L);
    const ja = IE.docs.find(d => d.pai && d.pai.docId === doc.id && d.pai.camadaId === L.id);
    if (ja) { ieMostrarDoc(ja); ieAbasRender?.(); return ja; }
    const N = ieNovoDoc2((L.nome || ieT('Objeto inteligente')) + '.psb', L.c0.c.width, L.c0.c.height, doc.dpi, 'transp');
    if (L.conteudo && L.conteudo.length) {   // camadas guardadas: voltam editáveis, no espaço do objeto
        const dx = -(L.cx0 ?? L.c0.x), dy = -(L.cy0 ?? L.c0.y);
        N.camadas = L.conteudo.map(X => { const Y = ieDuplicarCamada(N, X); iePercorrer([Y], Z => { if (Z.c || Z.txt || Z.c0) ieMoverCamada(Z, dx, dy); }); return Y; });
    } else N.camadas = [ieNovaCamada(N, { nome: L.nome || ieT('Camada 1'), c: ieClonar(L.c0.c), x: 0, y: 0, sujoPx: true })];
    N.ativa = N.camadas[N.camadas.length - 1].id; N.selIds = [N.ativa];
    N.pai = { docId: doc.id, camadaId: L.id };
    ieTudo(N); N.sujo = false; ieAbasRender?.();
    ieToast(ieT('Edite e salve (Ctrl+S): o objeto inteligente atualiza no documento de origem'));
    return N;
}
function ieConteudoDevolver(N) {
    const pai = IE.docs.find(d => d.id === N.pai.docId), L = pai && ieAchar(pai, N.pai.camadaId)?.L;
    if (!L) { ieToast(ieT('O documento de origem (ou a camada) não está mais aberto')); return false; }
    const Rantes = ieRCamada(L), x0 = L.c0.x, y0 = L.c0.y;
    L.c0 = { c: ieAchatar(N, N.camadas, ieRDoc(N)), x: x0, y: y0 };
    L.conteudo = N.camadas.map(X => { const Y = ieDuplicarCamada(pai, X); iePercorrer([Y], Z => { if (Z.c || Z.txt || Z.c0) ieMoverCamada(Z, x0, y0); }); return Y; });
    L.cx0 = x0; L.cy0 = y0;
    const atual = IE.doc; IE.doc = pai;   // os filtros inteligentes medem pelo documento da camada
    try {
        const o = ieIntPlano(L);
        L.c = o.c; L.x = o.x; L.y = o.y; L.sujoPx = true; L._miniCache = null;
        ieInvalidar(L); ieAgendar(ieRUniao(Rantes, ieRCamada(L)), pai);
        ieHist(ieT('Editar conteúdo'), pai); pai.sujo = true;
    } finally { IE.doc = atual; }
    N.sujo = false; ieAbasRender?.();
    ieToast(`${ieT('Objeto inteligente atualizado em')} ${pai.nome}`);
    return true;
}

// várias camadas (ou texto/grupo) → um objeto inteligente com a composição delas; as originais ficam em L.conteudo
function ieObjetoDeCamadas(doc, sel) {
    if (!sel.length) { ieToast(ieT('Selecione uma ou mais camadas')); return; }
    const ids = new Set(sel.map(L => L.id)), ordem = [];
    iePercorrer(doc.camadas, (L, lista, i, pai) => {   // de baixo para cima; filha de grupo selecionado vai junto com ele
        let p = pai, dentro = false; while (p) { if (ids.has(p.id)) { dentro = true; break; } p = ieAchar(doc, p.id)?.pai; }
        if (ids.has(L.id) && !dentro) ordem.push(L);
    });
    const R = ordem.reduce((R, L) => ieRUniao(R, ieRCamada(L)), null);
    if (!R || R.w < 1 || R.h < 1) { ieToast(ieT('As camadas estão vazias')); return; }
    const c = ieAchatar(doc, ordem, R);
    const N = ieNovaCamada(doc, { tipo: 'inteligente', nome: ordem.length > 1 ? ieT('Objeto inteligente') : ordem[0].nome, c, x: R.x, y: R.y,
        c0: { c, x: R.x, y: R.y }, tf: [...IE_ID], tfBase: [...IE_ID], sujoPx: true });
    N.conteudo = ordem; N.cx0 = R.x; N.cy0 = R.y;
    const topo = ieAchar(doc, ordem[ordem.length - 1].id);
    topo.lista.splice(topo.i + 1, 0, N);
    for (const L of ordem) { const a = ieAchar(doc, L.id); if (a) a.lista.splice(a.i, 1); }
    doc.selIds = [N.id]; doc.ativa = N.id;
    ieInvalidar(N); ieTudo(doc); ieHist(ieT('Converter em objeto inteligente')); ieUiCamadas();
    return N;
}

// ─────────────────────────── projeto do editor (.iknv) ───────────────────────────
// documento.json = a árvore de camadas inteira (tudo menos os caches "_"), com cada canvas trocado por {$png: chave};
// os pixels vão como PNG (cada canvas uma vez). Ver Functions/editor_imagem.py (salvar_iknv / _abrir_iknv).
function ieIknvSerial(v, png) {
    if (v instanceof HTMLCanvasElement) return { $png: png(v) };
    if (Array.isArray(v)) return v.map(x => ieIknvSerial(x, png));
    if (v && typeof v === 'object') { const o = {}; for (const k in v) if (k[0] !== '_') o[k] = ieIknvSerial(v[k], png); return o; }
    return v;
}

async function ieSalvarIknv(doc, destino) {
    const api = ieApi();
    ieCarregando(`${ieT('Salvando')} ${ieNomeArq(destino)}...`, 5);
    try {
        const ini = await api.ie_salvar_inicio(null);
        const chaves = new Map(), envios = [];
        const png = c => {
            if (!chaves.has(c)) { const k = 'p' + (chaves.size + 1) + '.png'; chaves.set(c, k); envios.push({ k, c }); }
            return chaves.get(c);
        };
        const documento = {
            nome: doc.nome, w: doc.w, h: doc.h, dpi: doc.dpi, bits: doc.bits, modo: doc.modo,
            camadas: ieIknvSerial(doc.camadas, png), ativa: doc.ativa, selIds: doc.selIds, seq: doc.seq,
            fatias: ieFatiasSpec(doc), cor: IE.cor, luzGlobal: doc.luzGlobal || null,
            alfas: ieIknvSerial(doc.alfas || [], png), notas: doc.notas || [], compsCamadas: doc.compsCamadas || [], guias: doc.guias || [],
            cena: doc.cena || null, ponteVetor: doc.ponteVetor || null,
        };
        ieCompor(doc, ieRDoc(doc));
        const previa = ieTransformarPlano({ c: doc.comp, x: 0, y: 0 }, (k => [k, 0, 0, k, 0, 0])(Math.min(1, 512 / Math.max(doc.w, doc.h)))).c;
        envios.push({ k: 'previa.png', c: previa });
        let feitos = 0;
        await iePool(envios, 4, async e => {
            await ieEnviar(ini.url, e.k, e.c);
            ieCarregando(null, 5 + ++feitos / envios.length * 85);
        });
        const r = await api.ie_salvar_iknv({ sessao: ini.sessao, destino, documento: JSON.stringify(documento), doc: doc.pyId });
        if (!r || !r.success) { ieToast(`${ieT('Não salvou')}: ${(r && r.error) || ''}`); return false; }
        doc.path = r.path;
        doc.nome = ieNomeArq(r.path).replace(/\.iknv$/i, '');
        doc.sujo = false;
        ieAbasRender();
        ieRecentesAdd(r.path);
        ieToast(`${ieT('Projeto salvo')}: ${ieNomeArq(r.path)}`);
        return true;
    } catch (e) {
        console.error('[editor de imagem] salvar .iknv', e);
        ieToast(`${ieT('Não salvou')}: ${e.message || e}`);
        return false;
    } finally { ieCarregando(false); }
}

async function ieMontarIknv(r, path) {
    const api = ieApi(), d = r.documento;
    const doc = ieNovoDoc({ nome: r.nome, w: r.w, h: r.h, dpi: r.dpi, path, psdPath: r.psd_path || null, pyId: r.doc, bits: r.bits, modo: r.modo, avisos: r.avisos || [] });
    const pend = [];
    const ler = v => {
        if (Array.isArray(v)) return v.map(ler);
        if (v && typeof v === 'object') {
            if (v.$png) { const alvo = { c: null }; pend.push({ url: r.urls[v.$png], alvo }); return alvo; }
            const o = {};
            for (const k in v) o[k] = ler(v[k]);
            return o;
        }
        return v;
    };
    const arvore = ler(d.camadas || []), alfas = ler(d.alfas || []);
    let feitos = 0;
    await iePool(pend, 6, async p => {
        try { p.alvo.c = await ieImagemDeUrl(p.url); } catch (e) { doc.avisos.push(`${ieT('camada não carregada')}: ${e.message}`); }
        ieCarregando(`${ieT('Montando camadas')} (${++feitos}/${pend.length})`, feitos * 100 / Math.max(1, pend.length));
    });
    // troca os marcadores {c} pelos canvases de verdade
    const canvas = v => {
        if (Array.isArray(v)) return v.map(canvas);
        if (v && typeof v === 'object') {
            if ('c' in v && Object.keys(v).length === 1 && (v.c === null || v.c instanceof HTMLCanvasElement)) return v.c;
            for (const k in v) v[k] = canvas(v[k]);
        }
        return v;
    };
    doc.camadas = canvas(arvore);
    doc.alfas = canvas(alfas); doc.notas = d.notas || []; doc.compsCamadas = d.compsCamadas || []; doc.guias = d.guias || []; doc.cena = d.cena || null; if (d.ponteVetor) doc.ponteVetor = d.ponteVetor;
    iePercorrer(doc.camadas, L => { if (L.fx) L.fx = ieFxNorm(L.fx); });
    if (d.luzGlobal) doc.luzGlobal = d.luzGlobal;
    doc.seq = d.seq || 0;
    iePercorrer(doc.camadas, L => { doc.seq = Math.max(doc.seq, L.id || 0); });
    doc.fatias = (d.fatias || []).map(f => ({ ...f, id: ++doc.seqFatia }));
    doc.fatiasOrig = JSON.stringify(ieFatiasSpec(doc)); doc.guiasOrig = JSON.stringify(doc.guias || []);
    doc.ativa = d.ativa ?? null;
    doc.selIds = d.selIds || (doc.ativa != null ? [doc.ativa] : []);
    if (doc.ativa != null && !ieAchar(doc, doc.ativa)) { const t = doc.camadas[doc.camadas.length - 1]; doc.ativa = t ? t.id : null; doc.selIds = doc.ativa != null ? [doc.ativa] : []; }
    api.ie_liberar(r.doc);
    // fontes dos textos editados (os pixels já vêm desenhados; a fonte serve para editar de novo)
    iePercorrer(doc.camadas, L => { if (L.txt) ieGarantirFonte(L.txt).catch(() => {}); });
    IE.docs.push(doc);
    ieMostrarDoc(doc);
    ieAjustarVista(doc);
    ieHist('Abrir', doc);
    doc.sujo = false;
    ieRecentesAdd(path);
    return doc;
}

async function ieExportarDialogo() {
    const doc = IE.doc, api = ieApi();
    if (!doc || !api) return;
    const v = await ieDialogo({
        titulo: 'Exportar como', ok: 'Exportar',
        campos: [{ id: 'fmt', rotulo: 'Formato', tipo: 'select', valor: IE.ultFmt || 'png', opcoes: [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'], ['tif', 'TIFF'], ['pdf', 'PDF']] },
            { id: 'q', rotulo: 'Qualidade (JPEG/WebP)', min: 1, max: 100, valor: IE.ultQ || 92 },
            { id: 'esc', rotulo: 'Escala (%)', tipo: 'numero', min: 1, max: 400, valor: 100 }],
    });
    if (!v) return;
    IE.ultFmt = v.fmt; IE.ultQ = v.q;
    const pasta = doc.path ? doc.path.replace(/[\\/][^\\/]*$/, '') : '';
    const r = await api.ie_dialogo_salvar(doc.nome, v.fmt, pasta);
    if (!r || !r.success) return;
    ieCarregando(`${ieT('Exportando')}...`, 30);
    try {
        ieCompor(doc, ieRDoc(doc));
        let c = doc.comp;
        if (v.esc && v.esc !== 100) c = ieTransformarPlano({ c, x: 0, y: 0 }, [v.esc / 100, 0, 0, v.esc / 100, 0, 0]).c;
        const ini = await api.ie_salvar_inicio(null);
        await ieEnviar(ini.url, 'composto.png', c);
        const e = await api.ie_exportar({ sessao: ini.sessao, composto: 'composto.png', destino: r.path, qualidade: v.q, dpi: doc.dpi });
        if (e && e.success) ieToast(`${ieT('Exportado')}: ${ieNomeArq(r.path)}`);
        else ieToast(`${ieT('Não exportou')}: ${(e && e.error) || ''}`);
    } finally { ieCarregando(false); }
}

// ─────────────────────────── recentes ───────────────────────────
function ieRecentes() { return [...(iePref('recentes', []) || [])]; }
function ieRecentesAdd(p) {
    const l = ieRecentes().filter(x => x.toLowerCase() !== p.toLowerCase());
    l.unshift(p);
    iePrefGravar('recentes', l.slice(0, 12));
}
function ieRecentesRender() {
    const box = ieEl('ie-recentes');
    if (!box) return;
    const l = ieRecentes();
    box.innerHTML = l.length ? `<div class="ie-recentes-tit">${ieT('Recentes')}</div>` + l.map(p => `<button class="ie-recente" data-p="${ieEsc(p)}" title="${ieEsc(p)}">${ieIco(/\.ps[db]$/i.test(p) ? 'folder' : 'type').replace('type', 'type')}<span>${ieEsc(ieNomeArq(p))}</span></button>`).join('') : '';
    if (!box._ok) { box._ok = true; box.addEventListener('click', ev => { const b = ev.target.closest('[data-p]'); if (b) ieAbrirArquivo(b.dataset.p); }); }
}

// ─────────────────────────── área de transferência ───────────────────────────
async function ieCopiar(mesclado, recortar) {
    const doc = IE.doc, L = ieAtiva(doc);
    let c, x, y;
    const R = doc.sel ? doc.sel.bbox : ieRDoc(doc);
    if (mesclado) {
        ieCompor(doc, ieRDoc(doc));
        c = ieCanvas(R.w, R.h); ieCtx(c).drawImage(doc.comp, -R.x, -R.y); x = R.x; y = R.y;
    } else {
        if (!L || !ieRaster0(L)) { ieToast(ieT('Selecione uma camada com pixels')); return; }
        const src = L.c ? { c: L.c, x: L.x, y: L.y } : null;
        if (!src) return;
        if (doc.sel) { c = ieCanvas(R.w, R.h); ieCtx(c).drawImage(src.c, src.x - R.x, src.y - R.y); x = R.x; y = R.y; }
        else { c = ieClonar(src.c); x = src.x; y = src.y; }
    }
    if (doc.sel) { const k = ieCtx(c); k.globalCompositeOperation = 'destination-in'; k.drawImage(doc.sel.c, -x, -y); }
    IE.area = { c, x, y };
    try {
        const b = await ieCanvasBlob(c);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
    } catch (e) { /* sem acesso à área do Windows: fica só a interna */ }
    try { IE.areaSeq = (await ieApi()?.ve_area_seq())?.seq; } catch (e) { IE.areaSeq = null; }
    if (recortar) await ieLimpar();
}
// colar com o mouse sobre a tela: o centro do que entra vai para onde está o mouse
function ieColarNoMouse(doc, w, h, noLugar) {
    const m = IE.mouse;
    if (noLugar || !m || !doc) return null;
    return { x: Math.round(m.x - w / 2), y: Math.round(m.y - h / 2) };
}
async function ieColar(noLugar) {
    const doc = IE.doc, api = ieApi();
    let seq = null;
    try { seq = (await api?.ve_area_seq())?.seq; } catch (e) { /* sem API */ }
    if (IE.area && (seq == null || seq === IE.areaSeq)) {
        if (!doc) { const d = ieNovoDoc2(ieT('Colado'), IE.area.c.width, IE.area.c.height, 72, 'transp'); ieColocarCanvas(ieClonar(IE.area.c), ieT('Camada'), 0, 0); return d; }
        const a = IE.area;
        const visivel = ieRInter({ x: a.x, y: a.y, w: a.c.width, h: a.c.height }, ieRDoc(doc));
        const pm = ieColarNoMouse(doc, a.c.width, a.c.height, noLugar);
        const x = pm ? pm.x : noLugar || visivel ? a.x : Math.round((doc.w - a.c.width) / 2), y = pm ? pm.y : noLugar || visivel ? a.y : Math.round((doc.h - a.c.height) / 2);
        ieColocarCanvas(ieClonar(a.c), ieNomeLivre(doc, ieT('Camada')), x, y);
        return;
    }
    const r = await api?.ie_colar_windows();
    if (!r || !r.success) { ieToast(ieT('Nada para colar')); return; }
    if (r.tipo === 'arquivos') { await ieReceberArquivos(r.paths.map(p => ({ path: p })), !!doc); return; }
    if (r.tipo === 'imagem') {
        const c = await ieImagemDeUrl(r.url);
        api.ie_soltar_memoria([r.token]);
        if (!doc) { ieNovoDoc2(ieT('Colado'), c.width, c.height, 72, 'transp'); ieColocarCanvas(c, ieT('Camada'), 0, 0); return; }
        const pm = ieColarNoMouse(doc, c.width, c.height, noLugar);
        if (pm) ieColocarCanvas(c, ieNomeLivre(doc, ieT('Camada')), pm.x, pm.y); else ieColocarCanvas(c, ieNomeLivre(doc, ieT('Camada')));
    }
}

async function ieLimpar() {
    const doc = IE.doc, L = ieAtiva(doc);
    if (!L) return;
    if (!doc.sel) {   // sem seleção: Delete exclui a camada (como no Photoshop)
        return IE_CMDS.excluirCamada(doc);
    }
    if (doc.mascaraAlvo && L.m) {
        const c = ieCanvas(doc.w, doc.h); ieCtx(c).drawImage(doc.sel.c, 0, 0);
        iePintarCobertura(doc, L, c, doc.sel.bbox, 'Limpar', { cor: '#000000' });
        return;
    }
    if (!(await iePodePintar(L, 'apagar'))) return;
    if (!L.c) return;
    iePintarCobertura(doc, L, doc.sel.c, doc.sel.bbox, 'Limpar', { borracha: true });
}

// ─────────────────────────── comandos ───────────────────────────
function ieListaComum(doc, sel) {   // camadas selecionadas na ordem da árvore
    const ids = new Set(sel.map(L => L.id));
    return ieTodas(doc).filter(L => ids.has(L.id));
}

function ieMesclar(doc, camadas, nome) {
    // pixels finais (como aparecem) de várias camadas numa camada só
    const R = camadas.reduce((R, L) => ieRUniao(R, ieRCamada(L)), null);
    const area = ieRInter(R, ieRDoc(doc)) || R;
    if (!area) return null;
    const c = ieAchatar(doc, camadas, ieRInt(area));
    return ieNovaCamada(doc, { nome, c, x: ieRInt(area).x, y: ieRInt(area).y, sujoPx: true });
}

async function ieDimDialogo(doc) {
    const v = await ieDialogo({
        titulo: 'Tamanho da imagem',
        campos: [{ id: 'w', rotulo: 'Largura (px)', tipo: 'numero', min: 1, max: 30000, valor: doc.w }, { id: 'h', rotulo: 'Altura (px)', tipo: 'numero', min: 1, max: 30000, valor: doc.h },
            { id: 'prop', rotulo: 'Manter proporção', tipo: 'check', valor: true }, { id: 'dpi', rotulo: 'Resolução (ppi)', tipo: 'numero', min: 1, max: 2400, valor: doc.dpi }],
    });
    if (!v) return;
    let w = Math.round(v.w), h = Math.round(v.h);
    if (v.prop) { if (w !== doc.w) h = Math.round(doc.h * w / doc.w); else if (h !== doc.h) w = Math.round(doc.w * h / doc.h); }
    w = ieClamp(w, 1, 30000); h = ieClamp(h, 1, 30000);
    doc.dpi = v.dpi || doc.dpi;
    if (w === doc.w && h === doc.h) { ieHist(ieT('Resolução')); ieUiProps(); return; }
    const M = [w / doc.w, 0, 0, h / doc.h, 0, 0];
    ieTransformarTudo(doc, M, w, h);
    ieHist(ieT('Tamanho da imagem'));
}

// aplica M em todas as camadas e muda o tamanho do documento (tamanho da imagem, girar a imagem)
function ieTransformarTudo(doc, M, w, h) {
    iePercorrer(doc.camadas, L => {
        if (L.c0) {
            L.tf = ieMatMul(M, L.tf || IE_ID);
            const t = ieTransformarPlano({ c: L.c0.c, x: L.c0.x, y: L.c0.y }, L.tf);
            if (t) { L.c = t.c; L.x = t.x; L.y = t.y; }
        } else if (L.c) {
            if (L.tf) L.tf = ieMatMul(M, L.tf);
            const t = ieTransformarPlano(L, M);
            if (t) { L.c = t.c; L.x = t.x; L.y = t.y; }
        }
        if (L.txt) { L.txt.m = ieMatMul(M, L.txt.m || IE_ID); ieTextoRender(L); }
        if (L.m) {
            if (L.m.c) { const t = ieTransformarPlano(L.m, M, L.m.fundo || 0); if (t) Object.assign(L.m, t); }
            else { const p = ieMatPt(M, L.m.x, L.m.y); L.m.x = Math.round(p.x); L.m.y = Math.round(p.y); }
            L.sujoM = true;
        }
        if (L.c) L.sujoPx = true;
        L.movido = true;
        ieInvalidar(L);
    });
    doc.w = w; doc.h = h;
    ieFatiasTransformar?.(doc, M);
    doc.comp = ieCanvas(w, h);
    doc.sel = null;
    ieAjustarVista(doc);
    ieTudo(doc);
}

function ieGirarImagem(tipo) {
    const doc = IE.doc;
    if (!doc) return;
    const W = doc.w, H = doc.h;
    const M = { g180: [-1, 0, 0, -1, W, H], g90h: [0, 1, -1, 0, H, 0], g90a: [0, -1, 1, 0, 0, W], fh: [-1, 0, 0, 1, W, 0], fv: [1, 0, 0, -1, 0, H] }[tipo];
    if (!M) return;
    const troca = tipo === 'g90h' || tipo === 'g90a';
    ieTransformarTudo(doc, M, troca ? H : W, troca ? W : H);
    ieHist(ieT('Rotação da imagem'));
}

async function ieTelaDialogo(doc) {
    const v = await ieDialogo({
        titulo: 'Tamanho da tela',
        campos: [{ id: 'w', rotulo: 'Largura (px)', tipo: 'numero', min: 1, max: 30000, valor: doc.w }, { id: 'h', rotulo: 'Altura (px)', tipo: 'numero', min: 1, max: 30000, valor: doc.h },
            { id: 'anc', rotulo: 'Âncora', tipo: 'select', valor: 'c', opcoes: [['tl', '↖ Topo esquerda'], ['t', '↑ Topo'], ['tr', '↗ Topo direita'], ['l', '← Esquerda'], ['c', '• Centro'], ['r', '→ Direita'], ['bl', '↙ Base esquerda'], ['b', '↓ Base'], ['br', '↘ Base direita']] }],
    });
    if (!v) return;
    const w = ieClamp(Math.round(v.w), 1, 30000), h = ieClamp(Math.round(v.h), 1, 30000);
    const ax = v.anc.includes('l') ? 0 : v.anc.includes('r') ? 1 : 0.5, ay = v.anc.includes('t') ? 0 : v.anc.includes('b') ? 1 : 0.5;
    ieRedimTela(doc, Math.round((doc.w - w) * ax), Math.round((doc.h - h) * ay), w, h, false);
    ieHist(ieT('Tamanho da tela'));
}

// seleção: expandir/contrair (repetindo a forma deslocada em volta) e suavizar (desfoque)
function ieSelMorfo(doc, px, contrair) {
    const s = doc.sel.c;
    const base = contrair ? (() => { const c = ieCanvas(doc.w, doc.h), x = ieCtx(c); x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h); x.globalCompositeOperation = 'destination-out'; x.drawImage(s, 0, 0); return c; })() : s;
    const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
    const passos = Math.max(8, Math.ceil(2 * Math.PI * px / 1.5));
    x.drawImage(base, 0, 0);
    for (let r = px; r > 0; r -= Math.max(1, px / 3)) for (let k = 0; k < passos; k++) { const a = k / passos * Math.PI * 2; x.drawImage(base, Math.cos(a) * r, Math.sin(a) * r); }
    if (!contrair) return c;
    const out = ieCanvas(doc.w, doc.h), o = ieCtx(out);
    o.fillStyle = '#fff'; o.fillRect(0, 0, doc.w, doc.h);
    o.globalCompositeOperation = 'destination-out';
    o.drawImage(c, 0, 0);
    return out;
}

function ieAlinhar(a) {
    const doc = IE.doc;
    if (!doc) return;
    const sel = ieSelecionadas(doc);
    if (!sel.length) return;
    const caixa = L => ieCaixaCamada(L);
    const ref = sel.length > 1 ? sel.reduce((R, L) => ieRUniao(R, caixa(L)), null) : (doc.sel ? doc.sel.bbox : ieRDoc(doc));
    let R0 = null;
    for (const L of sel) {
        const b = caixa(L);
        if (!b) continue;
        R0 = ieRUniao(R0, ieRCamada(L));
        let dx = 0, dy = 0;
        if (a === 'esq') dx = ref.x - b.x; if (a === 'dir') dx = ref.x + ref.w - (b.x + b.w); if (a === 'ch') dx = Math.round(ref.x + ref.w / 2 - (b.x + b.w / 2));
        if (a === 'topo') dy = ref.y - b.y; if (a === 'base') dy = ref.y + ref.h - (b.y + b.h); if (a === 'cv') dy = Math.round(ref.y + ref.h / 2 - (b.y + b.h / 2));
        const alvos = [];
        const add = X => { if (X.tipo === 'grupo') { alvos.push(X); X.filhos.forEach(add); } else alvos.push(X); };
        add(L);
        alvos.forEach(X => { ieMoverCamada(X, dx, dy); X.movido = true; });
    }
    ieAgendar(ieRUniao(R0, sel.reduce((R, L) => ieRUniao(R, ieRCamada(L)), null)), doc);
    ieHist(ieT('Alinhar'));
    ieDesenharSobre();
}

const IE_CMDS = {
    novo: () => ieNovoDialogo(),
    abrir: () => ieAbrirDialogo(),
    abrirCaminho: doc => { if (doc && doc.path) ieApi().reveal_file(doc.path); else ieToast(ieT('Documento ainda não salvo')); },   // pasta do documento no Explorer
    colocar: async () => { const r = await ieApi()?.ie_dialogo_abrir(true); if (r && r.success) for (const p of r.paths) await ieColocarArquivo(p); },
    salvar: () => ieSalvar(false),
    salvarComo: () => ieSalvar(true),
    exportar: () => ieExportarDialogo(),
    fechar: doc => ieFecharDoc(doc),
    desfazer: () => ieDesfazer(),
    refazer: () => ieRefazer(),
    copiar: () => ieCopiar(false, false),
    copiarMesclado: () => ieCopiar(true, false),
    recortar: () => ieCopiar(false, true),
    colar: () => ieColar(false),
    colarLugar: () => ieColar(true),
    limpar: () => ieLimpar(),
    preencherFrente: doc => IE_CMDS.preencher(doc, IE.cor[0]),
    preencherFundo: doc => IE_CMDS.preencher(doc, IE.cor[1]),
    preencher: async (doc, corDireta) => {
        const L = ieAtiva(doc);
        let cor = corDireta, opac = 1;
        if (!cor) {
            const v = await ieDialogo({ titulo: 'Preencher', campos: [
                { id: 'cont', rotulo: 'Conteúdo', tipo: 'select', valor: 'frente', opcoes: [['frente', 'Cor de frente'], ['fundo', 'Cor de fundo'], ['preto', 'Preto'], ['branco', 'Branco'], ['cinza', '50% cinza'], ['cor', 'Cor...'], ['padrao', 'Padrão (painel Padrões)']] },
                { id: 'cor', rotulo: 'Cor', tipo: 'cor', valor: IE.cor[0] }, { id: 'op', rotulo: 'Opacidade (%)', min: 1, max: 100, valor: 100 }] });
            if (!v) return;
            cor = { frente: IE.cor[0], fundo: IE.cor[1], preto: '#000000', branco: '#ffffff', cinza: '#808080', cor: v.cor }[v.cont];
            opac = v.op / 100;
            if (v.cont === 'padrao') {
                if (!doc.mascaraAlvo && !(await iePodePintar(L, 'preencher'))) return;
                const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
                x.fillStyle = x.createPattern(iePadraoCanvas(IE.op.padrao || 'xadrez'), 'repeat'); x.fillRect(0, 0, doc.w, doc.h);
                iePintarCobertura(doc, L, c, doc.sel ? doc.sel.bbox : ieRDoc(doc), 'Preencher', { opac, colorido: true });
                return;
            }
        }
        if (!doc.mascaraAlvo && !(await iePodePintar(L, 'preencher'))) return;
        const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
        x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h);
        iePintarCobertura(doc, L, c, doc.sel ? doc.sel.bbox : ieRDoc(doc), 'Preencher', { cor, opac });
    },
    tracar: async doc => {
        if (!doc.sel) { ieToast(ieT('Faça uma seleção para traçar')); return; }
        const L = ieAtiva(doc);
        const v = await ieDialogo({ titulo: 'Traçar', campos: [{ id: 'larg', rotulo: 'Largura (px)', tipo: 'numero', min: 1, max: 250, valor: 4 }, { id: 'cor', rotulo: 'Cor', tipo: 'cor', valor: IE.cor[0] },
            { id: 'pos', rotulo: 'Local', tipo: 'select', valor: 'centro', opcoes: [['dentro', 'Dentro'], ['centro', 'Centro'], ['fora', 'Fora']] }] });
        if (!v || !(await iePodePintar(L, 'traçar'))) return;
        const fora = v.pos === 'dentro' ? 0 : v.pos === 'centro' ? Math.ceil(v.larg / 2) : v.larg;
        const dentro = v.larg - fora;
        const ext = fora ? ieSelMorfo(doc, fora, false) : ieClonar(doc.sel.c);
        const int = dentro ? ieSelMorfo(doc, dentro, true) : ieClonar(doc.sel.c);
        const x = ieCtx(ext); x.globalCompositeOperation = 'destination-out'; x.drawImage(int, 0, 0);
        const sel = doc.sel; doc.sel = null;
        iePintarCobertura(doc, L, ext, ieRDoc(doc), 'Traçar', { cor: v.cor });
        doc.sel = sel;
    },
    transformar: () => (IE.transf ? ieTransfAplicar() : ieTransfIniciar()),
    tamImagem: doc => ieDimDialogo(doc),
    tamTela: doc => ieTelaDialogo(doc),
    cortarSel: doc => { if (doc.sel) { const b = doc.sel.bbox; ieRedimTela(doc, b.x, b.y, b.w, b.h, IE.op.corte.apagar); ieHist(ieT('Cortar')); } },
    aparar: doc => { ieCompor(doc); const b = ieLimites(doc.comp); if (b) { ieRedimTela(doc, b.x, b.y, b.w, b.h, false); ieHist(ieT('Aparar')); } },
    novaCamada: doc => {
        const L = ieNovaCamada(doc, { nome: ieNomeLivre(doc, ieT('Camada')), sujoPx: true });
        ieInserirAcima(doc, L, ieAtiva(doc));
        ieUiCamadas(); ieHist(ieT('Nova camada'));
    },
    duplicar: async doc => {
        const L = ieAtiva(doc);
        if (!L) return;
        if (doc.sel && ieRaster0(L) && L.c) {   // camada via cópia
            const c = ieCanvas(doc.sel.bbox.w, doc.sel.bbox.h), x = ieCtx(c), b = doc.sel.bbox;
            x.drawImage(L.c, L.x - b.x, L.y - b.y);
            x.globalCompositeOperation = 'destination-in'; x.drawImage(doc.sel.c, -b.x, -b.y);
            const N = ieNovaCamada(doc, { nome: ieNomeLivre(doc, ieT('Camada')), c, x: b.x, y: b.y, sujoPx: true });
            ieInserirAcima(doc, N, L);
            ieCamadaMudou(N); ieUiCamadas(); ieHist(ieT('Camada via cópia'));
            return;
        }
        const sel = ieListaComum(doc, ieSelecionadas(doc));
        const novas = sel.map(X => { const N = ieDuplicarCamada(doc, X); const a = ieAchar(doc, X.id); a.lista.splice(a.i + 1, 0, N); return N; });
        doc.selIds = novas.map(N => N.id); doc.ativa = novas[novas.length - 1].id;
        ieTudo(doc); ieHist(ieT('Duplicar camada'));
    },
    viaRecorte: async doc => {
        const L = ieAtiva(doc);
        if (!doc.sel || !L || !L.c) return IE_CMDS.duplicar(doc);
        if (!(await iePodePintar(L, 'recortar'))) return;
        const b = doc.sel.bbox, c = ieCanvas(b.w, b.h), x = ieCtx(c);
        x.drawImage(L.c, L.x - b.x, L.y - b.y);
        x.globalCompositeOperation = 'destination-in'; x.drawImage(doc.sel.c, -b.x, -b.y);
        ieGravavel(L);
        const lx = ieCtx(L.c); lx.save(); lx.globalCompositeOperation = 'destination-out'; lx.drawImage(doc.sel.c, -L.x, -L.y); lx.restore();
        L.sujoPx = true; ieInvalidar(L);
        const N = ieNovaCamada(doc, { nome: ieNomeLivre(doc, ieT('Camada')), c, x: b.x, y: b.y, sujoPx: true });
        ieInserirAcima(doc, N, L);
        ieTudo(doc); ieHist(ieT('Camada via recorte'));
    },
    excluirCamada: doc => {
        const sel = ieSelecionadas(doc);
        if (!sel.length) return;
        let prox = null;
        for (const L of sel) {
            const a = ieAchar(doc, L.id);
            if (!a) continue;
            a.lista.splice(a.i, 1);
            prox = a.lista[Math.max(0, a.i - 1)] || a.pai || null;
        }
        if (!prox) { const t = ieTodas(doc); prox = t[t.length - 1] || null; }
        doc.ativa = prox ? prox.id : null; doc.selIds = prox ? [prox.id] : [];
        doc.mascaraAlvo = false;
        ieTudo(doc); ieHist(ieT('Excluir camada'));
    },
    grupoNovo: doc => {
        const G = ieNovaCamada(doc, { tipo: 'grupo', nome: ieNomeLivre(doc, ieT('Grupo')), filhos: [] });
        const a = ieAtiva(doc);
        const ref = a ? ieAchar(doc, a.id) : null;
        if (ref) ref.lista.splice(ref.i + 1, 0, G); else doc.camadas.push(G);
        doc.ativa = G.id; doc.selIds = [G.id];
        ieUiCamadas(); ieHist(ieT('Novo grupo'));
    },
    agrupar: doc => {
        const sel = ieListaComum(doc, ieSelecionadas(doc));
        if (!sel.length) return;
        const topo = ieAchar(doc, sel[sel.length - 1].id);
        const G = ieNovaCamada(doc, { tipo: 'grupo', nome: ieNomeLivre(doc, ieT('Grupo')), filhos: [] });
        topo.lista.splice(topo.i + 1, 0, G);
        for (const L of sel) { const a = ieAchar(doc, L.id); if (a) a.lista.splice(a.i, 1); }
        G.filhos.push(...sel);
        doc.ativa = G.id; doc.selIds = [G.id];
        ieTudo(doc); ieHist(ieT('Agrupar camadas'));
    },
    desagrupar: doc => {
        const G = ieAtiva(doc);
        if (!G || G.tipo !== 'grupo') return;
        const a = ieAchar(doc, G.id);
        a.lista.splice(a.i, 1, ...G.filhos);
        doc.selIds = G.filhos.map(L => L.id); doc.ativa = G.filhos.length ? G.filhos[G.filhos.length - 1].id : null;
        ieTudo(doc); ieHist(ieT('Desagrupar camadas'));
    },
    corte: doc => {
        const sel = ieSelecionadas(doc);
        if (!sel.length) return;
        const ligar = !sel[0].clip;
        sel.forEach(L => { L.clip = ligar; });
        ieTudo(doc); ieHist(ieT(ligar ? 'Criar máscara de corte' : 'Soltar máscara de corte'));
    },
    frente: doc => ieOrdem(doc, 'frente'), avancar: doc => ieOrdem(doc, 'avancar'), recuar: doc => ieOrdem(doc, 'recuar'), tras: doc => ieOrdem(doc, 'tras'),
    camAcima: doc => { const t = ieTodas(doc), i = t.findIndex(L => L.id === doc.ativa); if (t[i + 1]) ieAtivar(t[i + 1].id, doc); },
    camAbaixo: doc => { const t = ieTodas(doc), i = t.findIndex(L => L.id === doc.ativa); if (i > 0) ieAtivar(t[i - 1].id, doc); },
    rasterizar: doc => { ieSelecionadas(doc).forEach(L => ieRasterizar(L)); ieTudo(doc); ieHist(ieT('Rasterizar camada')); },
    mesclarBaixo: async doc => {
        const L = ieAtiva(doc);
        const a = L && ieAchar(doc, L.id);
        if (!a || a.i === 0) return;
        const B = a.lista[a.i - 1];
        if (B.tipo === 'ajuste') { ieToast(ieT('A camada de baixo é de ajuste')); return; }
        const opB = B.op, bmB = B.bm, nomeB = B.nome;
        B.op = 1; B.bm = 'NORMAL';
        const N = ieMesclar(doc, [B, L], nomeB);
        B.op = opB; B.bm = bmB;
        if (!N) return;
        N.op = opB; N.bm = bmB === 'PASS_THROUGH' ? 'NORMAL' : bmB; N.clip = B.clip;
        a.lista.splice(a.i - 1, 2, N);
        doc.ativa = N.id; doc.selIds = [N.id];
        ieTudo(doc); ieHist(ieT('Mesclar para baixo'));
    },
    mesclarVisiveis: doc => {
        const vis = doc.camadas.filter(L => L.visivel);
        if (vis.length < 2) return;
        const N = ieMesclar(doc, vis, ieT('Mesclado'));
        doc.camadas = doc.camadas.filter(L => !L.visivel);
        if (N) doc.camadas.push(N);
        doc.ativa = N ? N.id : null; doc.selIds = N ? [N.id] : [];
        ieTudo(doc); ieHist(ieT('Mesclar visíveis'));
    },
    carimbarVisiveis: doc => {
        const N = ieMesclar(doc, doc.camadas, ieNomeLivre(doc, ieT('Camada')));
        if (!N) return;
        doc.camadas.push(N); doc.ativa = N.id; doc.selIds = [N.id];
        ieTudo(doc); ieHist(ieT('Carimbar visíveis'));
    },
    achatar: async doc => {
        if (ieTodas(doc).some(L => !L.visivel)) {
            const ok = await appConfirm({ titulo: ieT('Descartar camadas ocultas?'), texto: '', botoes: [{ rotulo: ieT('Cancelar'), valor: null }, { rotulo: ieT('Descartar'), valor: 1, tipo: 'perigo' }] });
            if (!ok) return;
        }
        ieCompor(doc);
        const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
        x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h); x.drawImage(doc.comp, 0, 0);
        const N = ieNovaCamada(doc, { nome: ieT('Fundo'), c, x: 0, y: 0, sujoPx: true });
        doc.camadas = [N]; doc.ativa = N.id; doc.selIds = [N.id];
        ieTudo(doc); ieHist(ieT('Achatar imagem'));
    },
    mascara: doc => ieMascaraNova(doc, true),
    mascaraOcultar: doc => ieMascaraNova(doc, false),
    mascaraSel: doc => ieMascaraNova(doc, true, true),
    mascaraSelOcultar: doc => ieMascaraNova(doc, false, true),
    mascaraInverter: doc => { doc.mascaraAlvo = true; IE_AJUSTES.inverter(); },
    // Converter em objeto inteligente (como no Photoshop): os pixels de agora (com a máscara aplicada dentro) viram o
    // original; escalar/girar depois sempre parte dele (diminuir e aumentar de novo não perde nitidez) e Ctrl+J faz
    // cópias que usam o mesmo original
    objetoInteligente: doc => {
        const sel = ieSelecionadas(doc);
        // várias camadas, ou texto/grupo/forma/objeto: como no Photoshop, viram UM objeto inteligente que guarda as
        // originais dentro (Converter em camadas devolve)
        if (sel.length > 1 || (sel[0] && sel[0].tipo !== 'pixel')) return ieObjetoDeCamadas(doc, sel);
        const L = ieAtiva(doc);
        if (!L || !L.c || L.tipo !== 'pixel') { ieToast(ieT('Selecione uma camada de pixels para converter')); return; }
        const Rantes = ieRCamada(L);
        let c = L.c;
        if (L.m && L.m.c) {
            c = ieClonar(L.c);
            const x = ieCtx(c); x.globalCompositeOperation = 'destination-in'; x.drawImage(ieMascaraRegiao(L.m, ieRPlano(L)), 0, 0);
            L.m = null; doc.mascaraAlvo = false;
        }
        const b = ieLimites(c);
        if (!b) { ieToast(ieT('A camada está vazia')); return; }
        const n = ieCanvas(b.w, b.h); ieCtx(n).drawImage(c, -b.x, -b.y);
        Object.assign(L, { tipo: 'inteligente', c: n, x: L.x + b.x, y: L.y + b.y, tf: [...IE_ID], tfBase: [...IE_ID], sujoPx: true });
        L.c0 = { c: n, x: L.x, y: L.y };
        ieInvalidar(L); ieCamadaMudou(L, Rantes); ieHist(ieT('Converter em objeto inteligente')); ieUiCamadas();
    },
    converterEmCamadas: doc => {
        const L = ieAtiva(doc);
        if (!L || !L.conteudo) { ieToast(ieT('Este objeto inteligente não guarda camadas')); return; }
        const t = L.tf || IE_ID;
        if (Math.abs(t[0] - 1) > 1e-3 || Math.abs(t[3] - 1) > 1e-3 || Math.abs(t[1]) > 1e-3 || Math.abs(t[2]) > 1e-3) {
            ieToast(ieT('Objeto transformado (escala/rotação): desfaça a transformação antes de converter em camadas')); return;
        }
        const dx = Math.round(t[4] + (L.c0.x - (L.cx0 ?? L.c0.x))), dy = Math.round(t[5] + (L.c0.y - (L.cy0 ?? L.c0.y)));
        const a = ieAchar(doc, L.id);
        if (dx || dy) for (const X of L.conteudo) iePercorrer([X], Y => { if (Y.c || Y.txt || Y.texto) ieMoverCamada(Y, dx, dy); });
        a.lista.splice(a.i, 1, ...L.conteudo);
        doc.selIds = L.conteudo.map(X => X.id); doc.ativa = L.conteudo[L.conteudo.length - 1].id;
        L.conteudo.forEach(X => iePercorrer([X], Y => ieInvalidar(Y)));
        ieTudo(doc); ieHist(ieT('Converter em camadas')); ieUiCamadas();
    },
    removerFundo: doc => ieRemoverFundo(doc),
    selAssunto: doc => ieSelAssunto(doc),
    mascaraDesativar: doc => { const L = ieAtiva(doc); if (L && L.m) { L.m.desativada = !L.m.desativada; ieCamadaMudou(L, ieRCamada(L)); ieHist(ieT('Desativar máscara')); ieUiCamadas(); } },
    mascaraExcluir: doc => { const L = ieAtiva(doc); if (L && L.m) { const R = ieRCamada(L); L.m = null; doc.mascaraAlvo = false; ieCamadaMudou(L, R); ieHist(ieT('Excluir máscara')); ieUiCamadas(); } },
    mascaraAplicar: async doc => {
        const L = ieAtiva(doc);
        if (!L || !L.m || L.tipo === 'grupo' || L.tipo === 'ajuste') return;
        if (!(await iePodePintar(L, 'aplicar a máscara'))) return;
        if (L.c) {
            ieGravavel(L);
            const x = ieCtx(L.c);
            x.save(); x.globalCompositeOperation = 'destination-in';
            x.drawImage(ieMascaraRegiao(L.m, ieRPlano(L)), 0, 0); x.restore();
        }
        L.m = null; L.sujoPx = true; doc.mascaraAlvo = false;
        ieCamadaMudou(L); ieHist(ieT('Aplicar máscara')); ieUiCamadas();
    },
    selTudo: () => ieSelTudo(),
    selNada: () => ieSelNada(),
    selInverter: () => ieSelInverter(),
    selCamada: doc => { const L = ieAtiva(doc); if (L) ieSelDaCamada(L, doc.mascaraAlvo); },
    selExpandir: async doc => { const v = await ieDialogo({ titulo: 'Expandir seleção', campos: [{ id: 'px', rotulo: 'Expandir em (px)', tipo: 'numero', min: 1, max: 500, valor: 4 }] }); if (v) { ieSelDefinir(doc, ieSelMorfo(doc, v.px, false)); ieHist(ieT('Expandir')); } },
    selContrair: async doc => { const v = await ieDialogo({ titulo: 'Contrair seleção', campos: [{ id: 'px', rotulo: 'Contrair em (px)', tipo: 'numero', min: 1, max: 500, valor: 4 }] }); if (v) { ieSelDefinir(doc, ieSelMorfo(doc, v.px, true)); ieHist(ieT('Contrair')); } },
    selSuavizar: async doc => {
        const v = await ieDialogo({ titulo: 'Suavizar seleção', campos: [{ id: 'px', rotulo: 'Raio (px)', tipo: 'numero', min: 0.2, max: 250, passo: 0.1, valor: 5 }] });
        if (!v) return;
        const c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
        x.filter = `blur(${v.px / 2}px)`; x.drawImage(doc.sel.c, 0, 0);
        ieSelDefinir(doc, c); ieHist(ieT('Suavizar'));
    },
    zoomMais: () => ieZoomPasso(1), zoomMenos: () => ieZoomPasso(-1), zoomAjustar: () => ieAjustarVista(), zoom100: () => ieZoomReal(1),
    verAchatado: doc => { doc._verAchatado = !doc._verAchatado; ieToast(ieT(doc._verAchatado ? 'Mostrando a imagem salva no PSD (Exibir > Comparar de novo para voltar)' : 'Mostrando as camadas')); ieDesenharVista(); },
    avisos: doc => {
        const l = [...(doc.avisos || []), ...(doc.avisosSalvar || [])];
        appConfirm({ titulo: ieT('Avisos'), texto: l.length ? l.join('\n') : ieT('Nenhum aviso'), botoes: [{ rotulo: 'OK', valor: 1, tipo: 'primario' }] });
    },
};

function ieOrdem(doc, modo) {
    const sel = ieListaComum(doc, ieSelecionadas(doc));
    if (!sel.length) return;
    const L = sel[sel.length - 1];
    const a = ieAchar(doc, L.id);
    const lista = a.lista;
    const idx = sel.map(X => lista.indexOf(X)).filter(i => i >= 0);
    if (idx.length !== sel.length) return;
    const tira = () => idx.sort((p, q) => q - p).forEach(i => lista.splice(i, 1));
    if (modo === 'frente') { tira(); lista.push(...sel); }
    else if (modo === 'tras') { tira(); lista.unshift(...sel); }
    else if (modo === 'avancar') { const max = Math.max(...idx); if (max >= lista.length - 1) return; const viz = lista[max + 1]; tira(); lista.splice(lista.indexOf(viz) + 1, 0, ...sel); }
    else if (modo === 'recuar') { const min = Math.min(...idx); if (min <= 0) return; const viz = lista[min - 1]; tira(); lista.splice(lista.indexOf(viz), 0, ...sel); }
    ieTudo(doc); ieHist(ieT('Organizar'));
}

// ── Remover plano de fundo / Selecionar assunto (como no Photoshop): a IA de recorte do Kanivete (BiRefNet,
// Functions/removerfundo.py) acha o assunto da camada e devolve a máscara; o editor usa como máscara da camada
// (os pixels continuam, dá para retocar a máscara com o pincel) ou como seleção ──
async function ieMascaraAssunto(L) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ie_mascara_assunto) { ieToast(ieT('Recurso indisponível nesta versão')); return null; }
    if (!L || !L.c) { ieToast(ieT('Selecione uma camada com pixels')); return null; }
    ieToast(ieT('Procurando o assunto da camada... (a primeira vez baixa o modelo de IA)'));
    const r = await api.ie_mascara_assunto(L.c.toDataURL('image/png'));
    if (!r || !r.success) { ieToast((r && r.error) || ieT('Não foi possível achar o assunto')); return null; }
    const img = new Image();
    img.src = 'data:image/png;base64,' + r.png;
    await img.decode();
    // cinza da IA → alfa (o formato das máscaras e seleções do editor)
    const c = ieCanvas(L.c.width, L.c.height), x = ieCtx(c);
    x.drawImage(img, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { p[i + 3] = p[i]; p[i] = p[i + 1] = p[i + 2] = 255; }
    x.putImageData(d, 0, 0);
    return c;
}

// Remover plano de fundo = recorte profissional (Functions/recorte_pro.py): matting + filtro guiado + cores
// descontaminadas. Os pixels da borda perdem a cor do fundo antigo (sem halo) e o recorte vira MÁSCARA de camada
// (retocável: pinte de preto/branco). rapido = o recorte antigo (só a máscara do BiRefNet lite, ~5 s).
async function ieRemoverFundo(doc, { rapido = false } = {}) {
    const L = ieAtiva(doc);
    if (!L || L.tipo === 'grupo' || L.tipo === 'ajuste') { ieToast(ieT('Selecione uma camada de imagem')); return; }
    const api = ieApi();
    if (rapido || !api || !api.ie_recorte_pro) {
        const c = await ieMascaraAssunto(L);
        if (!c) return;
        ieAplicarRecorte(doc, L, null, c);
        return;
    }
    if (!L.c) { ieToast(ieT('Selecione uma camada com pixels')); return; }
    if (!(await iePodePintar(L, 'remover o plano de fundo'))) return;
    ieCarregando(ieT('Recortando com precisão (borda, cabelo, cor)... a primeira vez baixa o modelo (~930 MB)'), 50);
    let r;
    try { r = await api.ie_recorte_pro(L.c.toDataURL('image/png')); } finally { ieCarregando(false); }
    if (!r || !r.success) { ieToast((r && r.error) || ieT('Não foi possível recortar')); return; }
    const carregar = async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); return im; };
    const [cores, masc] = await Promise.all([carregar(r.png), carregar(r.mascara)]);
    const px = ieCanvas(L.c.width, L.c.height); ieCtx(px).drawImage(cores, 0, 0);
    // cinza → alfa (o formato das máscaras do editor)
    const c = ieCanvas(L.c.width, L.c.height), x = ieCtx(c);
    x.drawImage(masc, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { p[i + 3] = p[i]; p[i] = p[i + 1] = p[i + 2] = 255; }
    x.putImageData(d, 0, 0);
    ieAplicarRecorte(doc, L, px, c);
}
function ieAplicarRecorte(doc, L, pixels, mascara) {
    const Rantes = ieRCamada(L);
    if (pixels) { ieGravavel(L); L.c = pixels; L.sujoPx = true; ieInvalidar(L); }
    ieGravavel(L, 'm');
    L.m = { c: mascara, x: L.x, y: L.y, fundo: 0 };
    L.sujoM = true;
    doc.mascaraAlvo = true;
    ieCamadaMudou(L, Rantes);
    ieHist(ieT('Remover plano de fundo'));
    ieUiCamadas();
    ieToast(ieT('Fundo removido com uma máscara: pinte nela de preto ou branco para retocar'));
}

async function ieSelAssunto(doc) {
    const L = ieAtiva(doc);
    const c = await ieMascaraAssunto(L);
    if (!c) return;
    const s = ieCanvas(doc.w, doc.h);
    ieCtx(s).drawImage(c, L.x, L.y);
    ieSelDefinir(doc, s);
    ieHist(ieT('Selecionar assunto'));
}

function ieMascaraNova(doc, revelar, daSelecao) {
    const L = ieAtiva(doc);
    if (!L) return;
    if (L.m) { ieToast(ieT('A camada já tem máscara')); return; }
    const sel = daSelecao || doc.sel;
    if (sel && doc.sel) {
        const c = ieClonar(doc.sel.c);
        if (!revelar) { const n = ieCanvas(doc.w, doc.h), x = ieCtx(n); x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h); x.globalCompositeOperation = 'destination-out'; x.drawImage(c, 0, 0); L.m = { c: n, x: 0, y: 0, fundo: 255 }; ieAparar(L.m); }
        else { L.m = { c, x: 0, y: 0, fundo: 0 }; ieAparar(L.m); }
        doc.sel = null;
    } else L.m = { c: null, x: 0, y: 0, fundo: revelar ? 255 : 0 };
    L.sujoM = true;
    doc.mascaraAlvo = true;
    ieCamadaMudou(L, ieRCamada(L) || ieRDoc(doc));
    ieAgendar(null, doc);
    ieHist(ieT('Adicionar máscara'));
    ieUiCamadas();
}

// ─────────────────────────── ligação com o app ───────────────────────────
function ieIniciar() {
    if (IE.iniciado) return;
    IE.iniciado = true;
    ieInstalarVista();
    ieTextoInstalar();
    ieMenusRender();
    ieUiFerr();
    ieOpcoesInstalar();
    ieOpcoesRender();
    ieCamadasInstalar();
    ieDockInstalar?.();
    // preferências do %APPDATA% (painéis, estilos, padrões): chegam um instante depois
    iePrefsCarregar().then(() => {
        if (typeof IE_DOCK !== 'undefined' && IE_DOCK.lay) { IE_DOCK.lay = ieDockLer(); ieDockAplicar(false); }
        if (!IE.doc) ieRecentesRender();
    });
    ieUiCamadas();
    ieHistRender();
    ieAbasRender();
    ieRecentesRender();
    document.addEventListener('keydown', ieTecla, true);
    document.addEventListener('keyup', ieTeclaSolta, true);
    window.addEventListener('blur', () => { IE.espaco = false; if (IE.ferrTemp) { IE.ferrTemp = null; } });
    document.addEventListener('paste', ev => {
        if (!ieAtivoVisivel() || ieDigitando(ev) || IE.edTexto) return;
        ev.preventDefault();
        ieColar(false);
    });
    // soltar arquivo direto na vista (o Python entrega o caminho real em onArquivosSoltos)
    const vista = ieEl('ie-vista');
    vista.addEventListener('dragover', ev => { if (ev.dataTransfer?.types?.includes('Files')) { ev.preventDefault(); vista.classList.add('soltar'); } });
    vista.addEventListener('dragleave', () => vista.classList.remove('soltar'));
    vista.addEventListener('drop', () => { vista.classList.remove('soltar'); IE.soltouNaVista = Date.now(); });
}

// troca de ferramenta do app: modo foco (sem o banner) e desenho na hora certa
(function ieGancho() {
    const orig = window.switchTool;
    if (typeof orig !== 'function') return;
    window.switchTool = function (toolId) {
        orig(toolId);
        const ativo = toolId === 'editor-imagem';
        if (ativo) {
            document.body.classList.add('ve-focus');
            ieIniciar();
            setTimeout(() => { ieDesenharVista(); ieDesenharSobre(); ieAbasRender(); ieStatusRender(); }, 30);
        }
    };
    switchTool = window.switchTool;
})();

// arquivos soltos / escolhidos na Home chegam por _entregarItens
(function ieGanchoEntrega() {
    const orig = window._entregarItens;
    if (typeof orig !== 'function') return;
    window._entregarItens = function (tool, itens) {
        if (tool === 'editor-imagem') { ieIniciar(); const naVista = IE.soltouNaVista && Date.now() - IE.soltouNaVista < 1500; return ieReceberArquivos(itens, naVista); }
        return orig(tool, itens);
    };
    _entregarItens = window._entregarItens;
})();

// sair do app / fechar a aba com documento não salvo
(function ieGanchoSair() {
    const sair = window.appSair;
    if (typeof sair === 'function') {
        window.appSair = async function () {
            if (IE.docs.some(d => d.sujo)) {
                if (!ieAtivoVisivel()) switchTool('editor-imagem');
                if (!(await ieFecharTodos())) return;
            }
            return sair();
        };
        appSair = window.appSair;
    }
    const fechar = window.fecharAba;
    if (typeof fechar === 'function') {
        window.fecharAba = async function (tool, ev) {
            if (tool === 'editor-imagem' && IE.docs.some(d => d.sujo)) {
                ev?.stopPropagation();
                if (!ieAtivoVisivel()) switchTool('editor-imagem');
                if (!(await ieFecharTodos())) return;
            }
            return fechar(tool, ev);
        };
        fecharAba = window.fecharAba;
    }
})();

// para testes/automação (modo agente): estado resumido
window.ieEstado = () => {
    const d = IE.doc;
    if (!d) return { docs: IE.docs.length };
    const arv = l => l.map(L => ({ id: L.id, nome: L.nome, tipo: L.tipo, ref: L.ref, vis: L.visivel, op: L.op, bm: L.bm, clip: L.clip, x: L.x, y: L.y,
        w: L.c ? L.c.width : 0, h: L.c ? L.c.height : 0, m: !!L.m, filhos: L.filhos ? arv(L.filhos) : undefined }));
    return { docs: IE.docs.length, nome: d.nome, w: d.w, h: d.h, zoom: d.zoom, hist: d.hist.itens.map(i => i.nome), hi: d.hist.i, ativa: d.ativa, sujo: d.sujo, camadas: arv(d.camadas), sel: d.sel ? d.sel.bbox : null };
};
// diferença média (0..255) entre a composição do editor e a imagem salva no PSD
window.ieDiferencaAchatado = () => {
    const d = IE.doc;
    if (!d || !d.achatadoC) return null;
    ieCompor(d);
    const W = d.w, H = d.h;
    const a = ieCtx(d.comp).getImageData(0, 0, W, H).data;
    const t = ieCanvas(W, H), tx = ieCtx(t); tx.drawImage(d.achatadoC, 0, 0);
    const b = tx.getImageData(0, 0, W, H).data;
    let s = 0, n = 0, ruins = 0;
    for (let i = 0; i < a.length; i += 4) {
        // compara sobre branco (o achatado do Photoshop não tem transparência quase nunca)
        const fa = a[i + 3] / 255, fb = b[i + 3] / 255;
        let dd = 0;
        for (let k = 0; k < 3; k++) dd += Math.abs((a[i + k] * fa + 255 * (1 - fa)) - (b[i + k] * fb + 255 * (1 - fb)));
        dd /= 3;
        s += dd; n++;
        if (dd > 40) ruins++;
    }
    return { media: +(s / n).toFixed(2), ruins: +(ruins / n * 100).toFixed(2) };
};
