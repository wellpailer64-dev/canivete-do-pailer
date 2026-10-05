// =========================================================
// Photo Kanivete — Gerar imagem com IA (Arquivo > Gerar imagem com IA...)
// FLUX.2 klein 4B no stable-diffusion.cpp (Functions/gerador_imagem.py): texto → imagem, ou editar a partir de uma
// imagem de referência (a camada ativa ou o documento). A imagem entra como camada nova, pronta para recortar.
// O motor e os modelos (~7 GB) são baixados na primeira vez. Agentes: KNV.gerar (imagem-api.js).
// =========================================================

const IE_GER_PROPORCOES = [['1:1', 1, 1], ['4:5 (retrato)', 4, 5], ['3:4', 3, 4], ['9:16 (story)', 9, 16], ['16:9 (paisagem)', 16, 9], ['4:3', 4, 3], ['doc', 0, 0]];
const IE_GER_FUNDO = ', isolated on a plain pure white background, the whole subject inside the frame, studio lighting';
let ieGerJob = null;

// progresso do Python (download do gerador e geração): barra no editor; durante a geração, botão Cancelar
function ieGeradorProgresso(d) {
    if (!d) return;
    if (d.fim || d.erro) { ieCarregando(false); if (d.erro) ieToast(d.erro); IE._gerDl?.(d); return; }
    if (d.job) ieGerJob = d.job;
    ieCarregando(d.msg || ieT('Gerando...'), d.pct);
    const box = document.querySelector('#ie-carregando .ie-carregando-box');
    if (box && ieGerJob && !box.querySelector('.ie-ger-cancelar')) {
        const b = document.createElement('button');
        b.className = 'ie-btn ie-ger-cancelar'; b.textContent = ieT('Cancelar');
        b.onclick = () => { if (ieGerJob) ieApi()?.ie_gerador_cancelar(ieGerJob); b.disabled = true; };
        box.appendChild(b);
    }
}
window.ieGeradorProgresso = ieGeradorProgresso;

function ieGerLimparBarra() { ieGerJob = null; document.querySelectorAll('.ie-ger-cancelar').forEach(b => b.remove()); ieCarregando(false); }

// garante o gerador instalado (pergunta antes de baixar); modelo: 'zimage' (texto → imagem, padrão) | 'klein' (com referência)
async function ieGeradorPronto(modelo) {
    const api = ieApi();
    if (!api) return false;
    const e = await api.ie_gerador_estado(modelo || null);
    if (e.instalado) return true;
    if (!e.baixando) {
        const ok = await appConfirm({
            titulo: ieT('Baixar o gerador de imagens?'),
            texto: `${ieT('Na primeira vez o Photo Kanivete baixa o')} ${e.nome_modelo} ${ieT('(licença Apache 2.0) e o motor stable-diffusion.cpp')}: ~${e.tamanho_gb} GB ${ieT('em')} ${e.pasta}. ${ieT('Roda na placa de vídeo (8 GB bastam), sem internet depois.')}`,
            botoes: [{ rotulo: ieT('Cancelar'), valor: null }, { rotulo: ieT('Baixar'), valor: 1, tipo: 'primario' }],
        });
        if (!ok) return false;
        const r = await api.ie_gerador_baixar(modelo || null);
        if (!r.success) { ieToast(r.error); return false; }
    }
    ieCarregando(ieT('Baixando o gerador...'), 0);
    const fim = await new Promise(res => { IE._gerDl = res; });
    IE._gerDl = null;
    return !!fim.fim;
}

// PNG (base64) de uma camada (pixels visíveis, com máscara, sobre branco) ou do documento inteiro, para referência
function ieGerRefPng(qual, doc = IE.doc) {
    if (qual === 'doc') { ieCompor(doc); return doc.comp.toDataURL('image/png'); }
    const L = qual && qual !== 'camada' ? ieTodas(doc).find(X => X.id === qual || X.nome === qual) : ieAtiva(doc);
    const r = L && ieRaster(L);
    if (!r) return null;
    const f = r.forma || r, b = ieLimites(f.c);
    if (!b) return null;
    // sobre branco: o modelo lê transparente como preto (vão de folha recortada virava buraco escuro)
    const c = ieCanvas(b.w, b.h), k = ieCtx(c); k.fillStyle = '#fff'; k.fillRect(0, 0, b.w, b.h); k.drawImage(f.c, -b.x, -b.y);
    return c.toDataURL('image/png');
}

// gera e coloca como camada nova; spec = {prompt, largura, altura, semente, refs:[png|path]}; devolve {L, semente} ou null
async function ieGerarCamada(spec, nome) {
    const api = ieApi();
    if (!(await ieGeradorPronto(spec.motor || ((spec.refs || []).length ? 'klein' : 'zimage')))) return null;
    ieCarregando(ieT('Preparando o gerador...'), 1);
    let r;
    try { r = await api.ie_gerar(spec); } finally { ieGerLimparBarra(); }
    if (!r || !r.success) {
        if (r && /cancel/i.test(r.error || '')) ieToast(ieT('Geração cancelada'));
        else ieToast(`${ieT('Não gerou')}: ${(r && r.error) || ''}`);
        return null;
    }
    await ieColocarArquivo(r.path);
    const L = ieAtiva(IE.doc);
    L.nome = nome || ('IA: ' + spec.prompt.slice(0, 40)); L._nomeAuto = false;
    L.gerada = { prompt: spec.prompt, semente: r.semente, w: spec.largura, h: spec.altura };   // para refazer igual
    ieUiCamadas();
    return { L, semente: r.semente, segundos: r.segundos, cache: !!r.cache };
}

async function ieGerarDialogo(doc) {
    if (!doc) { ieToast(ieT('Abra ou crie um documento')); return; }
    const ult = IE._gerUlt || {};
    const v = await ieDialogo({
        titulo: 'Gerar imagem com IA', ok: 'Gerar', largura: 520,
        campos: [
            { id: 'prompt', rotulo: 'Descreva a imagem (em inglês fica mais fiel)', tipo: 'area', linhas: 4, valor: ult.prompt || '',
              dica: 'ex.: a monstera leaf, whole leaf with stem, top view' },
            { id: 'fundo', rotulo: 'Fundo branco liso (para recortar com a Borracha mágica)', tipo: 'check', valor: ult.fundo ?? true },
            { id: 'prop', rotulo: 'Proporção', tipo: 'select', valor: ult.prop || '1:1', opcoes: IE_GER_PROPORCOES.map(([n]) => [n, n === 'doc' ? `Do documento (${doc.w}×${doc.h})` : n]) },
            { id: 'lado', rotulo: 'Tamanho (lado maior)', tipo: 'select', valor: ult.lado || '1024', opcoes: [['768', '768 px (rápido)'], ['1024', '1024 px'], ['1536', '1536 px (lento)']] },
            { id: 'ref', rotulo: 'Usar como referência', tipo: 'select', valor: 'nenhuma', opcoes: [['nenhuma', 'Nenhuma (só o texto)'], ['camada', 'Camada ativa'], ['doc', 'Documento inteiro']] },
            { id: 'semente', rotulo: 'Semente (−1 = aleatória)', tipo: 'numero', min: -1, max: 2147483647, valor: -1 },
            { id: 'n', rotulo: 'Quando usar referência, descreva a MUDANÇA (ex.: "make the flower blue, keep the shape"). Mesma semente e texto = mesma imagem.', tipo: 'nota' },
        ],
    });
    if (!v || !v.prompt.trim()) return;
    IE._gerUlt = v;
    const lado = +v.lado, [, pw, ph] = IE_GER_PROPORCOES.find(p => p[0] === v.prop) || IE_GER_PROPORCOES[0];
    const [rw, rh] = v.prop === 'doc' ? [doc.w, doc.h] : [pw, ph];
    const k = lado / Math.max(rw, rh);
    const refs = v.ref === 'nenhuma' ? [] : [ieGerRefPng(v.ref, doc)].filter(Boolean);
    const prompt = v.prompt.trim() + (v.fundo && !refs.length ? IE_GER_FUNDO : '');
    const r = await ieGerarCamada({ prompt, largura: Math.round(rw * k), altura: Math.round(rh * k), semente: v.semente, refs }, 'IA: ' + v.prompt.trim().slice(0, 40));
    if (r) ieToast(`${ieT('Imagem gerada')} (${ieT('semente')} ${r.semente}${r.cache ? ', ' + ieT('do cache') : ''})`);
}

IE_CMDS.gerarImagem = doc => ieGerarDialogo(doc);
