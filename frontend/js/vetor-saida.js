// Vetor Kanivete — SAÍDAS: Salvar como .ai (PDF compatível + .aknv anexado), Exportar EPS (Ghostscript) e EXPORTAR ATIVOS
// para telas (Exportar para telas do Illustrator): cada prancheta ou objeto em vários tamanhos e formatos de uma vez.
// 1x = 1 pt → 1 px (como no Illustrator); 2x/3x para telas de alta densidade.
function vkSlug(s) { return String(s || 'ativo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'ativo'; }
function vkRenderObjs(objs, r, esc, fundo) {   // só os objetos pedidos, na região r {x, y, w, h} (pt)
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(r.w * esc)); cv.height = Math.max(1, Math.round(r.h * esc));
    const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    if (fundo) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.setTransform(esc, 0, 0, esc, -r.x * esc, -r.y * esc);
    const z = VK.vista.z, cont = VK.contorno; VK.vista.z = esc; VK.contorno = false;
    try { for (const o of objs) vkDesenharObj(ctx, o); } finally { VK.vista.z = z; VK.contorno = cont; }
    return cv;
}
function vkSvgObjs(objs, r) {   // SVG só com os objetos (troca as camadas por um instante)
    const cams = VK.doc.camadas; VK.doc.camadas = [{ id: 'tmp', nome: 'ativo', visivel: true, itens: objs }];
    try { return vkSvg(r); } finally { VK.doc.camadas = cams; }
}
(() => {
    const api = () => vkApi();
    const prIds = a => a.pranchetas ? [].concat(a.pranchetas).map(n => (VK.doc.pranchetas.find(p => p.id === n || p.nome === n) || VK.doc.pranchetas[+n - 1] || {}).id).filter(Boolean) : null;
    // exportar_ai: caminho (.ai), pranchetas (nomes/ids; padrão todas), separadas (padrão true: um .ai por prancheta)
    vkRegistrar('exportar_ai', 'salvar como .ai', async a => {
        const caminho = a.caminho || await api().vk_dialogo('salvar', ['Illustrator (*.ai)'], (VK.doc.nome || 'arte') + '.ai');
        if (!caminho) return { cancelado: true };
        await vkGeosProntas(); vkCarregando(true, 'Gerando .ai...');
        let r; try { r = await api().vk_exportar_ai(await vkDocPy(), vkClone(VK.doc), caminho, { pranchetas: prIds(a), separadas: a.separadas !== false, perfil: VK.doc.perfil, titulo: VK.doc.nome, padrao: VK.doc.destino === 'tela' ? 'rgb' : 'cmyk' }); }
        finally { vkCarregando(false); }
        VK._antes = null; if (!r || !r.success) throw new Error((r && r.error) || 'não gerou o .ai');
        vkToast(`.ai pronto: ${r.arquivos.length} arquivo(s)`); return { arquivos: r.arquivos };
    });
    // exportar_eps: caminho (.eps), pranchetas — uma EPS por prancheta, texto em curvas (o padrão de gráfica para EPS)
    vkRegistrar('exportar_eps', 'exportar EPS', async a => {
        const caminho = a.caminho || await api().vk_dialogo('salvar', ['EPS (*.eps)'], (VK.doc.nome || 'arte') + '.eps');
        if (!caminho) return { cancelado: true };
        await vkGeosProntas(); vkCarregando(true, 'Gerando EPS (Ghostscript)...');
        let r; try { r = await api().vk_exportar_eps(await vkDocPy(), caminho, { pranchetas: prIds(a), perfil: VK.doc.perfil, titulo: VK.doc.nome }); } finally { vkCarregando(false); }
        VK._antes = null; if (!r || !r.success) throw new Error((r && r.error) || 'não gerou o EPS');
        vkToast(`EPS pronto: ${r.arquivos.length} arquivo(s)`); return { arquivos: r.arquivos };
    });
    // exportar_ativos: pasta; alvo 'pranchetas' (padrão) | 'selecao' | ids/nomes; formatos ex. ['png@1x','png@2x','png@3x','jpg@2x','webp@2x','svg','pdf'];
    // margem (mm, só objetos); fundo 'transparente' (padrão PNG/WebP/SVG) | 'branco'; prefixo
    vkRegistrar('exportar_ativos', 'exportar ativos para telas', async a => {
        const pasta = a.pasta || await api().vk_dialogo('pasta'); if (!pasta) return { cancelado: true };
        const formatos = [].concat(a.formatos || ['png@1x', 'png@2x', 'svg']);
        await vkGeosProntas(); await vkImagensProntas(); await vkCoresProntas();
        for (const { o } of vkTodos()) if ((o.efeitos || o.aparencia || o.mescla || o.traco || o.pincel) && typeof vkApPronto === 'function') await vkApPronto(o);
        let alvos;
        if (!a.alvo || a.alvo === 'pranchetas') alvos = (prIds(a) || VK.doc.pranchetas.map(p => p.id)).map(id => { const p = VK.doc.pranchetas.find(q => q.id === id); return { nome: p.nome, r: p, objs: null, p }; });
        else {
            const objs = a.alvo === 'selecao' ? VK.sel.map(vkObj).filter(Boolean) : [].concat(a.alvo).map(n => vkObj(n) || vkTodos().map(x => x.o).find(o => o.nome === n)).filter(Boolean);
            if (!objs.length) throw new Error('exportar_ativos: nada selecionado');
            const m = vkPT(+(a.margem || 0));
            alvos = objs.map(o => { const b = vkBoxUniao([o], true); return { nome: o.nome || (o.tipo === 'texto' ? String(o.conteudo).slice(0, 24) : o.tipo + '-' + o.id), r: { x: b[0] - m, y: b[1] - m, w: b[2] - b[0] + 2 * m, h: b[3] - b[1] + 2 * m }, objs: [o] }; });
        }
        const pref = a.prefixo ? vkSlug(a.prefixo) + '-' : '', base = pasta.replace(/[\\/]+$/, '') + '/', saidas = [], usados = new Set();
        for (const al of alvos) {
            let nome = pref + vkSlug(al.nome); while (usados.has(nome)) nome += '-2'; usados.add(nome);
            for (const f of formatos) {
                const [fmt, esc_] = f.toLowerCase().split('@'), esc = parseFloat(esc_ || '1') || 1, suf = esc === 1 ? '' : `@${esc}x`;
                if (fmt === 'svg') {
                    const svg = al.objs ? vkSvgObjs(al.objs, al.r) : vkSvg(al.p);
                    const r = await api().vk_salvar_png(btoa(unescape(encodeURIComponent(svg))), base + nome + '.svg'); saidas.push(r.path);
                } else if (fmt === 'pdf') {
                    if (al.objs) continue;
                    const r = await VK_CMDS.exportar_pdf.fn({ caminho: base + nome + '.pdf', pranchetas: [al.p.id], padrao: 'rgb', marcas: false, forcar: true, texto_editavel: true }); saidas.push(r.caminho);
                } else if (['png', 'jpg', 'jpeg', 'webp'].includes(fmt)) {
                    const branco = fmt.startsWith('jp') || a.fundo === 'branco';
                    const cv = al.objs ? vkRenderObjs(al.objs, al.r, esc, branco) : vkRenderPrancheta(al.p, esc, branco);
                    const r = await api().vk_salvar_png(cv.toDataURL('image/png'), base + nome + suf + '.' + (fmt === 'jpeg' ? 'jpg' : fmt)); saidas.push(r.path);
                } else throw new Error('exportar_ativos: formato desconhecido ' + f);
            }
        }
        VK._antes = null; vkToast(`${saidas.length} arquivo(s) exportado(s)`);
        return { arquivos: saidas };
    });
})();
function vkAtivosDialogo() {
    const F = ['png@1x', 'png@2x', 'png@3x', 'jpg@1x', 'jpg@2x', 'webp@1x', 'webp@2x', 'svg', 'pdf'], sel = new Set(VK.pref.ativos || ['png@1x', 'png@2x', 'svg']);
    vkModal(`<div class="ie-dlg-tit">Exportar ativos para telas</div><div class="ie-dlg-corpo">
        <div class="vk-linha"><span>Exportar</span><select id="vka-alvo"><option value="pranchetas">Pranchetas (todas)</option><option value="selecao" ${VK.sel.length ? 'selected' : ''}>Objetos selecionados (cada um)</option></select></div>
        <div class="vk-linha" style="flex-wrap:wrap;gap:8px">${F.map(f => `<label class="vk-chk"><input type="checkbox" data-f="${f}" ${sel.has(f) ? 'checked' : ''}> ${f.replace('@1x', '').toUpperCase()}</label>`).join('')}</div>
        <div class="vk-grade">${vkNum('Margem', 0, 'id="vka-m" min="0"', 'mm', 0.5)}</div>
        <div class="vk-linha"><span>Prefixo</span><input id="vka-pref" placeholder="ex. mare" style="width:120px"></div>
        <div class="vk-nota">1x = 1 pt por pixel (como no Illustrator). PNG, WebP e SVG saem com fundo transparente.</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="vka-ok">Exportar…</button></div>`, (m, fechar) => {
        m.querySelector('#vka-ok').onclick = () => { const fs = [...m.querySelectorAll('[data-f]')].filter(x => x.checked).map(x => x.dataset.f); VK.pref.ativos = fs;
            const alvo = m.querySelector('#vka-alvo').value, margem = +m.querySelector('#vka-m').value, prefixo = m.querySelector('#vka-pref').value; fechar();
            vkCmdUi('exportar_ativos', { alvo, formatos: fs, margem, prefixo }).then(r => r && r.arquivos && vkToast(`${r.arquivos.length} arquivo(s) exportado(s)`)); };
    });
}
(() => {
    const m = VK_MENUS.find(x => x[0] === 'Arquivo'); if (!m) return;
    const i = m[1].findIndex(x => Array.isArray(x) && /SVG/i.test(x[0]));
    m[1].splice(i >= 0 ? i + 1 : m[1].length, 0, ['Salvar como .ai (Illustrator)…', '', () => vkCmdUi('exportar_ai', {})], ['Exportar EPS…', '', () => vkCmdUi('exportar_eps', {})],
        ['Exportar ativos para telas…', 'Alt+Shift+Ctrl+E', () => vkAtivosDialogo()]);
})();
