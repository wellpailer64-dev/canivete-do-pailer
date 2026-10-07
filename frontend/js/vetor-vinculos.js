// Vetor Kanivete — VÍNCULOS (painel Links do Illustrator).
// As imagens vão incorporadas no .aknv; doc.imagens[iid].origem guarda o arquivo de onde vieram. O painel mostra cada
// imagem com ppi efetivo (o menor entre os usos), modo de cor, quantos usos e o estado: ok | mudou (o original foi
// editado: Atualizar) | sem_original (só a cópia incorporada) | faltando. Substituir = Revincular (mesma largura e posição).
function vkVincUsos() { const u = {}; for (const { o } of vkTodos()) if (o.tipo === 'imagem') (u[o.img] = u[o.img] || []).push(o); return u; }
async function vkVinculos() {
    const api = vkApi(), ims = VK.doc.imagens || {}, usos = vkVincUsos();
    const est = api && api.vk_vinculos_estado ? await api.vk_vinculos_estado(Object.entries(ims).map(([img, im]) => ({ img, arquivo: im.arquivo || null, origem: im.origem || null, assin: im.assin || null }))) : {};
    return Object.entries(ims).filter(([img]) => usos[img]).map(([img, im]) => ({
        img, nome: im.nome || img, origem: im.origem || null, ...(im.iknv ? { iknv: im.iknv } : {}), w: im.w, h: im.h, modo: im.modo, url: im.url,
        ppi: Math.min(...usos[img].map(o => Math.round(72 / vkEsc(o.m)))), usos: usos[img].length, ids: usos[img].map(o => o.id),
        estado: est[img] || (im.faltando ? 'faltando' : 'sem_original') }));
}
async function vkRevincular(img, arquivo) {   // troca o arquivo de todas as imagens que usam img, mantendo largura e posição
    const old = VK.doc.imagens[img]; if (!old) throw new Error('revincular: imagem não existe: ' + img);
    const r = await vkApi().vk_imagem_info(arquivo); if (!r || !r.success) throw new Error('revincular: não abriu ' + arquivo);
    const k = old.w / r.w;
    for (const o of vkVincUsos()[img] || []) o.m = [o.m[0] * k, o.m[1] * k, o.m[2] * k, o.m[3] * k, o.m[4], o.m[5]];
    const novo = { ...old, arquivo: r.arquivo, origem: r.arquivo, assin: r.assin, w: r.w, h: r.h, modo: r.modo, url: r.url, nome: r.nome, alfa: r.alfa };
    delete novo.faltando; if (old.w !== r.w || old.h !== r.h) { delete novo.mascara; delete novo.zip_mascara; }
    VK.doc.imagens[img] = novo;
    return { img, nome: r.nome, w: r.w, h: r.h, ppi: Math.min(...(vkVincUsos()[img] || []).map(o => Math.round(72 / vkEsc(o.m)))) };
}
(() => {
    const alvo = a => { if (a.img && VK.doc.imagens[a.img]) return a.img; if (a.img) a = { id: a.img, nome: a.img };
        const o = a.id && vkObj(a.id) ? vkObj(a.id) : a.nome ? vkTodos().map(x => x.o).find(x => x.nome === a.nome) : a.id ? null : vkTodos().map(x => x.o).find(x => VK.sel.includes(x.id) && x.tipo === 'imagem');
        if (!o || o.tipo !== 'imagem') throw new Error('escolha a imagem: img (de vinculos), id ou nome de um objeto imagem'); return o.img; };
    // vinculos: lista as imagens (img, nome, origem, ppi efetivo mínimo, modo, usos, ids, estado)
    vkRegistrar('vinculos', 'vínculos', async () => ({ vinculos: (await vkVinculos()).map(({ url, ...v }) => v) }), true);
    // revincular: img | id | nome (ou a imagem selecionada) + arquivo (sem arquivo: abre a janela) → troca a imagem
    vkRegistrar('revincular', 'substituir imagem', async a => {
        const img = alvo(a), arq = a.arquivo || a.caminho || await vkApi().vk_dialogo('abrir', ['Imagens (*.png;*.jpg;*.jpeg;*.tif;*.tiff;*.webp;*.psd)']);
        if (!arq) return { cancelado: true };
        return await vkRevincular(img, arq);
    });
    // atualizar_vinculo: relê o original (origem) de img | id | nome; sem alvo: todos os que mudaram
    vkRegistrar('atualizar_vinculo', 'atualizar vínculo', async a => {
        const lista = (a.img || a.id || a.nome) ? [alvo(a)] : (await vkVinculos()).filter(v => v.estado === 'mudou').map(v => v.img);
        const feitos = [];
        for (const img of lista) { const o = VK.doc.imagens[img]; if (!o || !o.origem) throw new Error('atualizar_vinculo: imagem sem original'); feitos.push(await vkRevincular(img, o.origem)); }
        return { atualizados: feitos.length, imagens: feitos };
    });
})();

const VK_VINC_EST = { ok: ['✓', 'vinculada ao original'], mudou: ['⚠', 'o original mudou — Atualizar'], sem_original: ['●', 'incorporada (original não encontrado)'], faltando: ['✕', 'faltando — Substituir'] };
function vkAbaVinculos() {
    const el = vkEl('vk-aba'), chave = VK.versaoDoc + '|' + Object.keys(VK.doc.imagens || {}).length;
    if (!VK._vinc || VK._vinc.chave !== chave) {
        VK._vinc = { chave, lista: null };
        vkVinculos().then(l => { if (VK._vinc && VK._vinc.chave === chave) { VK._vinc.lista = l; if (typeof vkDockRenderUm === 'function' && VK_DOCK.lay) vkDockRenderUm('vinculos'); else if (VK.aba === 'vinculos') vkAbaVinculos(); } }).catch(e => vkToast(e.message));
    }
    const l = VK._vinc.lista;
    if (!l) { el.innerHTML = '<div class="vk-nota">Lendo imagens…</div>'; return; }
    if (!l.length) { el.innerHTML = '<div class="vk-nota">Nenhuma imagem no documento.</div>'; return; }
    const mud = l.filter(v => v.estado === 'mudou').length;
    el.innerHTML = (mud ? `<button class="ie-btn" data-vatu-todos>Atualizar ${mud} alterada${mud > 1 ? 's' : ''}</button>` : '') + l.map(v => {
        const [ic, tt] = VK_VINC_EST[v.estado] || ['?', v.estado], ruim = v.ppi < 250 || v.estado === 'mudou' || v.estado === 'faltando';
        return `<div class="vk-linha" data-vimg="${v.img}" style="display:flex;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.2)">
            ${v.url ? `<img src="${v.url}" style="width:34px;height:34px;object-fit:contain;background:#fff;border-radius:3px">` : '<span style="width:34px;text-align:center">✕</span>'}
            <div style="flex:1;min-width:0"><div title="${vkEsc_(v.origem || '')}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${vkEsc_(v.nome)}${v.usos > 1 ? ` <span class="vk-nota">×${v.usos}</span>` : ''}</div>
            <div class="vk-nota" style="${ruim ? 'color:#e5a000' : ''}"><span title="${tt}">${ic}</span> ${v.ppi} ppi · ${vkEsc_(v.modo || '')} · ${v.w}×${v.h}</div></div>
            <button class="ie-btn" data-vir title="Selecionar">Ir</button><button class="ie-btn" data-vsub title="Substituir (revincular)">Trocar</button>${v.iknv ? '<button class="ie-btn" data-vphoto title="Abrir o projeto no Photo; salvar lá atualiza aqui">Photo</button>' : ''}${v.estado === 'mudou' ? '<button class="ie-btn" data-vatu title="Atualizar do original">Atualizar</button>' : ''}</div>`;
    }).join('');
    el.onclick = e => {
        if (e.target.closest('[data-vatu-todos]')) return vkCmdUi('atualizar_vinculo', {});
        const linha = e.target.closest('[data-vimg]'); if (!linha) return; const v = l.find(x => x.img === linha.dataset.vimg); if (!v) return;
        if (e.target.closest('[data-vir]')) { VK.sel = v.ids.slice(); vkDesenhar(); vkUiAgendar(); }
        else if (e.target.closest('[data-vsub]')) vkCmdUi('revincular', { img: v.img });
        else if (e.target.closest('[data-vphoto]')) { if (typeof switchTool === 'function') switchTool('editor-imagem'); ieAbrirArquivo(v.iknv); }
        else if (e.target.closest('[data-vatu]')) vkCmdUi('atualizar_vinculo', { img: v.img });
    };
}
