// =========================================================
// PONTE Vetor Kanivete ↔ Photo Kanivete (os dois rodam na mesma página do app).
// F1 — Objeto inteligente VETORIAL no Photo: a camada guarda o documento do Vetor (L.vetor = {doc, alvo, res}); o original
//      (L.c0) é rasterizado pelo PRÓPRIO renderizador do Vetor (efeitos, 3D, texto) na resolução necessária — ampliar a
//      camada rasteriza de novo (nunca pixeliza); filtros inteligentes continuam por cima. "Editar conteúdo no Vetor" abre
//      no Vetor; Salvar (Ctrl+S) devolve à camada mantendo transformação e filtros, e o documento do Vetor que estava
//      aberto volta.
// F2 — Vínculo vivo Photo → Vetor: o .iknv vai para o Vetor como imagem vinculada (PNG composto ao lado do .iknv,
//      reescrito a cada salvamento); o painel Vínculos marca "mudou" e tem "Editar no Photo".
// =========================================================
async function vpRenderVetor(vdoc, alvo, pxPorPt) {   // rasteriza alvo.rect (pt) do documento vdoc
    const antes = { doc: VK.doc, sel: VK.sel, ativa: VK.ativa };
    VK.doc = vdoc; VK._emprestado = true;
    try {
        await vkGeosProntas(); await vkImagensProntas(); await vkCoresProntas();
        for (const { o } of vkTodos()) if ((o.efeitos || o.aparencia || o.mescla || o.traco || o.pincel) && typeof vkApPronto === 'function') await vkApPronto(o);
        const objs = alvo.ids ? alvo.ids.map(vkObj).filter(Boolean) : VK.doc.camadas.filter(c => c.visivel !== false).flatMap(c => c.itens);
        return vkRenderObjs(objs, alvo.rect, pxPorPt, false);
    } finally { VK.doc = antes.doc; VK.sel = antes.sel; VK.ativa = antes.ativa; VK._emprestado = false; }
}
function vpRetDe(vdoc, alvo) {   // região atual do alvo no documento do Vetor
    const antes = VK.doc; VK.doc = vdoc;
    try {
        if (alvo.ids) {   // folga: sombra/brilho/desfoque e as curvas do texto passam da caixa geométrica
            const objs = alvo.ids.map(vkObj).filter(Boolean), b = vkBoxUniao(objs, true);
            let ef = 0; const ver = o => { (o.efeitos || []).forEach(e => { if (e.visivel !== false) ef = Math.max(ef, (e.desfoque || 0) * 2 + Math.hypot(e.dx || 0, e.dy || 0)); }); (o.itens || []).forEach(ver); };
            objs.forEach(ver);
            const m = Math.max(vkPT(1), 0.03 * Math.max(b[2] - b[0], b[3] - b[1])) + ef;
            return { x: b[0] - m, y: b[1] - m, w: Math.max(1, b[2] - b[0] + 2 * m), h: Math.max(1, b[3] - b[1] + 2 * m) };
        }
        const p = vdoc.pranchetas.find(q => q.id === alvo.prancheta) || vdoc.pranchetas[0]; return { x: p.x, y: p.y, w: p.w, h: p.h };
    } finally { VK.doc = antes; }
}
// re-rasterizar: c0 nasce na resolução de agora (escala 1 no tf) — chamado depois de ampliar e ao devolver do Vetor
async function vpRerasterizar(L, doc = IE.doc, mudouRet = null) {
    if (!L || !L.vetor || L._vpOcupado) return; L._vpOcupado = true;
    try {
        const s = Math.hypot(L.tf[0], L.tf[1]), res = Math.min(40, L.vetor.res * s), alvo = L.vetor.alvo;
        const ret = mudouRet || alvo.rect, c = await vpRenderVetor(L.vetor.doc, { ...alvo, rect: ret }, res);
        let tf = [L.tf[0] / s, L.tf[1] / s, L.tf[2] / s, L.tf[3] / s, L.tf[4], L.tf[5]];
        if (mudouRet) {   // a arte cresceu/andou no Vetor: o canto do c0 acompanha (posição no Photo fica onde estava)
            const dx = (ret.x - alvo.rect.x) * res, dy = (ret.y - alvo.rect.y) * res;
            tf = [tf[0], tf[1], tf[2], tf[3], tf[4] + tf[0] * dx + tf[2] * dy, tf[5] + tf[1] * dx + tf[3] * dy]; alvo.rect = ret;
        }
        L.c0 = { c, x: 0, y: 0 }; L.tf = tf; L.vetor.res = res;
        const Rantes = ieRCamada(L); const o = ieIntPlano(L); L.c = o.c; L.x = o.x; L.y = o.y; L.sujoPx = true;
        ieInvalidar(L); ieCamadaMudou(L, Rantes); if (doc === IE.doc) ieUiCamadas();
    } finally { L._vpOcupado = false; }
}
// depois de qualquer mudança (escalar pela API, ferramenta Transformar, girar...): se ampliou (ou reduziu muito), refaz o
// original na resolução nova — com atraso, para não rasterizar a cada quadro de um arraste
const ieCamadaMudouSemVetor = ieCamadaMudou;
ieCamadaMudou = function (L, ...resto) {
    const r = ieCamadaMudouSemVetor(L, ...resto);
    if (L && L.vetor && L.tf && !L._vpOcupado) {
        const s = Math.hypot(L.tf[0], L.tf[1]);
        if (s > 1.15 || s < 0.35) { clearTimeout(L._vpTimer); const doc = IE.doc; L._vpTimer = setTimeout(() => vpRerasterizar(L, doc), 350); }
    }
    return r;
};

// ── Vetor → Photo ──
async function vpEnviarAoPhoto(a = {}) {
    if (!VK.doc) throw new Error('nenhum documento no Vetor');
    const sel = (a.ids || VK.sel || []).filter(id => vkObj(id)), p = VK.doc.pranchetas.find(q => q.id === (a.prancheta || VK.ativa)) || VK.doc.pranchetas[0];
    const vdoc = vkClone(VK.doc), alvo = sel.length ? { ids: sel } : { prancheta: p.id };
    alvo.rect = vpRetDe(vdoc, alvo);
    const nome = sel.length === 1 ? (vkObj(sel[0]).nome || vkObj(sel[0]).tipo) : sel.length ? `${sel.length} objetos` : p.nome;
    if (typeof switchTool === 'function') switchTool('editor-imagem');
    let doc = IE.doc;
    if (!doc || a.novo) {   // documento novo no tamanho da arte, 300 ppi, fundo transparente
        const k = 300 / 72; doc = ieNovoDoc2(`Vetor — ${VK.doc.nome || 'arte'}`, Math.round(alvo.rect.w * k), Math.round(alvo.rect.h * k), 300, 'transp');
    }
    const ppt = (doc.dpi || 72) / 72, fit = Math.min(1, (doc.w * 0.9) / (alvo.rect.w * ppt), (doc.h * 0.9) / (alvo.rect.h * ppt)), res = ppt * fit;
    const c = await vpRenderVetor(vdoc, alvo, res);
    const x = Math.round((doc.w - c.width) / 2), y = Math.round((doc.h - c.height) / 2);
    const L = ieNovaCamada(doc, { tipo: 'inteligente', nome: 'Vetor: ' + nome, c, x, y, c0: { c, x: 0, y: 0 }, tf: [1, 0, 0, 1, x, y], tfBase: [...IE_ID],
        vetor: { doc: vdoc, alvo, res }, sujoPx: true });
    const vazio = doc.camadas.length === 1 && !doc.camadas[0].c;   // documento novo: troca a camada vazia
    if (vazio) doc.camadas = [L]; else ieInserirAcima(doc, L, ieAtiva(doc));
    doc.ativa = L.id; doc.selIds = [L.id];
    ieCamadaMudou(L); ieHist(ieT('Colocar do Vetor')); ieUiCamadas();
    return { photo_doc: doc.nome, camada: L.nome, uid: L.uid, px: [c.width, c.height] };
}
// ── Photo → Vetor (editar o conteúdo) e volta ──
function vpAcharCamada(docId, uid) { const d = IE.docs.find(x => x.id === docId); return d && { d, L: ieTodas(d).find(L => L.uid === uid) }; }
function vpEditarNoVetor(doc = IE.doc, L = ieAtiva(IE.doc)) {
    if (!L || !L.vetor) { ieToast(ieT('A camada não é um objeto inteligente do Vetor')); return false; }
    if (typeof switchTool === 'function') switchTool('vetor-kanivete');
    const ant = VK.doc ? { doc: VK.doc, path: VK.path, hist: VK.hist, futuro: VK.futuro, sel: VK.sel, ativa: VK.ativa, sujo: VK.sujo } : null;
    VK.doc = vkClone(L.vetor.doc); VK.path = null; VK.hist = []; VK.futuro = []; VK.sel = L.vetor.alvo.ids ? [...L.vetor.alvo.ids] : [];
    VK.ativa = L.vetor.alvo.prancheta || VK.doc.pranchetas[0].id; VK.sujo = false;
    VK.ponte = { docId: doc.id, uid: L.uid, anterior: ant };
    vpBarra(); vkMudou(); setTimeout(() => vkEnquadrar(), 0);
    return true;
}
async function vpDevolver() {
    const pt = VK.ponte; if (!pt) return { devolvido: false };
    const achado = vpAcharCamada(pt.docId, pt.uid); if (!achado || !achado.L) { VK.ponte = null; vpBarra(); throw new Error('a camada do Photo não está mais aberta'); }
    const { d, L } = achado, vdoc = vkClone(VK.doc);
    const alvo = L.vetor.alvo; if (alvo.ids) alvo.ids = alvo.ids.filter(id => vdoc && (VK.doc && vkObj(id)));
    if (alvo.ids && !alvo.ids.length) { delete alvo.ids; alvo.prancheta = VK.doc.pranchetas[0].id; }
    L.vetor.doc = vdoc;
    const novoRet = vpRetDe(vdoc, alvo), ant = pt.anterior;
    VK.ponte = null; vpBarra();
    if (ant) Object.assign(VK, { doc: ant.doc, path: ant.path, hist: ant.hist, futuro: ant.futuro, sel: ant.sel, ativa: ant.ativa, sujo: ant.sujo }); else VK.doc = null;
    if (typeof switchTool === 'function') switchTool('editor-imagem');
    ieMostrarDoc(d);
    await vpRerasterizar(L, d, novoRet);
    ieHist(ieT('Editar conteúdo no Vetor'), d);
    if (VK.doc) vkMudou();
    return { devolvido: true, camada: L.nome };
}
function vpBarra() {   // aviso no Vetor enquanto edita conteúdo do Photo
    let b = document.getElementById('vp-barra');
    if (!VK.ponte) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'vp-barra'; b.style.cssText = 'position:absolute;left:50%;top:44px;transform:translateX(-50%);z-index:50;background:#7b4bff;color:#fff;padding:6px 12px;border-radius:6px;font:12px Inter,sans-serif;display:flex;gap:10px;align-items:center;box-shadow:0 4px 14px rgba(0,0,0,.3)';
        const host = document.getElementById('vk') || document.body; host.appendChild(b); }
    b.innerHTML = 'Editando objeto inteligente do Photo <button class="ie-btn ie-btn-mini" id="vp-devolver">Salvar e voltar ao Photo (Ctrl+S)</button>';
    b.querySelector('#vp-devolver').onclick = () => vkCmdUi('devolver_photo', {});
}
// ── vínculo vivo Photo → Vetor ──
async function vpCompostoPng(doc, caminho) { ieCompor(doc); const r = await ieApi().vk_salvar_png(doc.comp.toDataURL('image/png'), caminho); return r && r.path; }
async function vpEnviarAoVetor(doc = IE.doc, a = {}) {
    if (!doc) throw new Error('nenhum documento no Photo');
    let iknv = a.iknv || (doc.path && /\.iknv$/i.test(doc.path) ? doc.path : null);
    if (!iknv) { iknv = await ieApi().vk_dialogo('salvar', ['Projeto do Photo (*.iknv)'], (doc.nome || 'arte') + '.iknv'); if (!iknv) return { cancelado: true }; }
    if (a.iknv || !doc.path || doc.path !== iknv || doc.sujo) await ieSalvarIknv(doc, iknv);
    const png = iknv.replace(/\.iknv$/i, '') + '.vinculo.png';
    await vpCompostoPng(doc, png); doc.ponteVetor = { png };
    if (typeof switchTool === 'function') switchTool('vetor-kanivete');
    if (!VK.doc) await vkCmd('novo', { nome: doc.nome || 'Arte', larg: vkMM(doc.w * 72 / (doc.dpi || 72)), alt: vkMM(doc.h * 72 / (doc.dpi || 72)) }, 'ui');
    const r = await vkCmd('imagem', { arquivo: png, x: 0, y: 0, ppi_doc: doc.dpi || 72, nome: doc.nome }, 'ui');
    const o = vkObj(r.id), im = o && VK.doc.imagens[o.img]; if (im) im.iknv = iknv;
    if (o && doc.dpi) { const k = 72 / doc.dpi / (vkEsc(o.m) || 1); vkTransformar(o, [k, 0, 0, k, (1 - k) * o.m[4], (1 - k) * o.m[5]]); }
    vkMudou(); return { vetor_doc: VK.doc.nome, id: r.id, png, iknv };
}
// salvar o .iknv de um documento já vinculado reescreve o PNG (o Vetor vê "mudou" nos Vínculos)
const ieSalvarIknvSemPonte = ieSalvarIknv;
ieSalvarIknv = async function (doc, destino) {
    const r = await ieSalvarIknvSemPonte(doc, destino);
    if (doc && doc.ponteVetor && doc.ponteVetor.png) { try { await vpCompostoPng(doc, doc.ponteVetor.png); } catch (e) { /* PNG do vínculo */ } }
    return r;
};

// ── recursos comuns (F4): gerador de imagem no Vetor e amostras da marca ──
// gerar_imagem: prompt (inglês fica mais fiel), largura/altura (px, padrão 1024), semente, x/y/larg (mm, onde colocar),
// ref (caminho de imagem → edição guiada, motor klein). Mesmo pedido = mesma imagem (cache). Entra como imagem vinculada.
async function vpGerarNoVetor(a = {}) {
    if (!a.prompt) throw new Error('gerar_imagem: prompt');
    const api = vkApi(); if (!api || !api.ie_gerar) throw new Error('gerador indisponível');
    const motor = a.ref ? 'klein' : 'zimage', e = await api.ie_gerador_estado(motor);
    if (!e.instalado) throw new Error(`gerador ${e.nome_modelo} não instalado: abra o Photo › Arquivo › Gerar imagem com IA (baixa ~${e.tamanho_gb} GB)`);
    vkCarregando(true, 'Gerando imagem (Z-Image, ~45 s)...');
    let r; try { r = await api.ie_gerar({ prompt: a.prompt, largura: a.largura || 1024, altura: a.altura || 1024, semente: a.semente ?? -1, refs: a.ref ? [a.ref] : [] }); } finally { vkCarregando(false); }
    if (!r || !r.success) throw new Error('não gerou: ' + ((r && r.error) || ''));
    const im = await VK_CMDS.imagem.fn({ arquivo: r.path, x: a.x || 0, y: a.y || 0, ...(a.larg ? { larg: a.larg } : {}), nome: a.nome || ('IA: ' + a.prompt.slice(0, 40)), ...(a.prancheta ? { prancheta: a.prancheta } : {}) });
    const o = vkObj(im.id); if (o) o.gerada = { prompt: a.prompt, semente: r.semente, w: a.largura || 1024, h: a.altura || 1024 };
    return { id: im.id, semente: r.semente, segundos: r.segundos, cache: !!r.cache, caminho: r.path };
}
// marca_amostras: marca.json (cores {nome: {hex, cmyk}}) → amostras nomeadas do documento ("MARÉ Azul"...)
async function vpMarcaAmostras(a = {}) {
    const r = await vkApi().vk_ler_texto(a.marca || a.caminho); if (!r || !r.success) throw new Error('marca_amostras: não li ' + (a.marca || a.caminho));
    const m = JSON.parse(r.texto), feitos = [];
    for (const [k, v] of Object.entries(m.cores || {})) { const nome = `${m.nome || 'Marca'} ${k[0].toUpperCase()}${k.slice(1)}`; await VK_CMDS.amostra.fn({ nome, cor: v.cmyk || v.hex }); feitos.push(nome); }
    return { amostras: feitos };
}

// ── comandos, menus e atalhos ──
(() => {
    vkRegistrar('enviar_photo', 'enviar ao Photo (objeto inteligente)', a => { VK._antes = null; return vpEnviarAoPhoto(a || {}); });
    vkRegistrar('devolver_photo', 'salvar e voltar ao Photo', () => { VK._antes = null; return vpDevolver(); });
    vkRegistrar('gerar_imagem', 'gerar imagem com IA', a => vpGerarNoVetor(a || {}));
    vkRegistrar('marca_amostras', 'amostras da marca', a => vpMarcaAmostras(a || {}));
    const salvarSemPonte = VK_CMDS.salvar.fn;   // Ctrl+S editando conteúdo do Photo = devolver
    VK_CMDS.salvar.fn = a => (VK.ponte && !(a && a.caminho)) ? (VK._antes = null, vpDevolver()) : salvarSemPonte(a);
    const m = VK_MENUS.find(x => x[0] === 'Arquivo');
    if (m) m[1].push('-', ['Enviar ao Photo (objeto inteligente)', '', () => vkCmdUi('enviar_photo', {})], ['Enviar ao Photo em documento novo', '', () => vkCmdUi('enviar_photo', { novo: true })],
        ['Gerar imagem com IA…', '', () => vpGerarDialogo()]);
    Object.assign(IE_CMDS, {
        editarNoVetor: doc => vpEditarNoVetor(doc, ieAtiva(doc)),
        enviarAoVetor: doc => vpEnviarAoVetor(doc).catch(e => ieToast(String(e.message || e))),
    });
    if (window.KNV) Object.assign(KNV, {
        editarNoVetor() { return vpEditarNoVetor(IE.doc, ieAtiva(IE.doc)); },
        enviarAoVetor(iknv) { return vpEnviarAoVetor(IE.doc, { iknv }); },
    });
})();
function vpGerarDialogo() {
    vkModal(`<div class="ie-dlg-tit">Gerar imagem com IA (Z-Image-Turbo, local)</div><div class="ie-dlg-corpo">
        <textarea id="vpg-p" rows="4" style="width:100%" placeholder="Descreva a imagem (em inglês fica mais fiel)"></textarea>
        <div class="vk-linha"><span>Formato</span><select id="vpg-f"><option value="1024x1024">1024 × 1024</option><option value="832x1216">832 × 1216 (retrato)</option><option value="1216x832">1216 × 832 (paisagem)</option></select>
        <span>Semente</span><input id="vpg-s" type="number" value="-1" style="width:90px"></div>
        <div class="vk-nota">~45 s na RTX 3050. Entra como imagem vinculada na prancheta ativa; mesma semente e texto = mesma imagem.</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="vpg-ok">Gerar</button></div>`, (m, fechar) => {
        m.querySelector('#vpg-ok').onclick = () => { const p = m.querySelector('#vpg-p').value.trim(); if (!p) return; const [w, h] = m.querySelector('#vpg-f').value.split('x').map(Number);
            const semente = +m.querySelector('#vpg-s').value; fechar(); vkCmdUi('gerar_imagem', { prompt: p, largura: w, altura: h, semente }); };
    });
}
