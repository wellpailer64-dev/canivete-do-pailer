// Vetor Kanivete — arquivo (abrir/salvar/exportar) e FECHAMENTO (preflight da gráfica). Tudo como comando (vkCmd).
(() => {
    const api = () => { const a = vkApi(); if (!a) throw new Error('API do app indisponível'); return a; };
    const prepararDoc = d => {
        d.camadas = d.camadas && d.camadas.length ? d.camadas : [{ id: vkId('c'), nome: 'Camada 1', visivel: true, trava: false, itens: [] }];
        d.amostras = d.amostras && d.amostras.length ? d.amostras : vkAmostrasPadrao();
        d.imagens = d.imagens || {}; d.guias = d.guias || []; d.sangria = d.sangria ?? vkPT(3); d.perfil = d.perfil || 'FOGRA39';
        return d;
    };
    vkRegistrar('abrir', 'abrir', async a => {
        const caminho = a.caminho || await api().vk_dialogo('abrir');
        if (!caminho) return { cancelado: true };
        const md = document.getElementById('vk-modal'); if (md) { md.hidden = true; md.innerHTML = ''; }   // relatório do arquivo anterior
        vkCarregando(true, 'Abrindo ' + caminho.split(/[\\/]/).pop() + '...');
        let r;
        try { r = await api().vk_abrir(caminho); } finally { vkCarregando(false); }
        if (!r || !r.success) throw new Error((r && r.error) || 'não abriu');
        VK.doc = prepararDoc(r.doc); VK.path = /\.aknv$/i.test(caminho) ? r.path : null;
        VK.hist = []; VK.futuro = []; VK.sel = []; VK._antes = null; VK.sujo = false;
        VK.ativa = VK.doc.pranchetas[0].id; VK.camadaAtiva = VK.doc.camadas.at(-1).id; VK.relatorio = r.relatorio || []; VK.corTela.clear();
        setTimeout(() => { vkEnquadrar(); if (VK.relatorio.length && typeof vkMostrarRelatorio === 'function') vkMostrarRelatorio(); }, 0);
        vkRecente(caminho);
        return { pranchetas: VK.doc.pranchetas.length, camadas: VK.doc.camadas.length, objetos: vkTodos().length, relatorio: VK.relatorio };
    });
    vkRegistrar('importar', 'colocar arquivo', async a => {   // traz outro PDF/AI/SVG/PPTX para dentro (como grupo) ou imagem
        const caminho = a.caminho || await api().vk_dialogo('abrir', ['Arquivos (*.pdf;*.ai;*.svg;*.pptx;*.png;*.jpg;*.jpeg;*.tif;*.tiff;*.webp)']);
        if (!caminho) return { cancelado: true };
        if (/\.(png|jpe?g|tiff?|webp|psd)$/i.test(caminho)) {
            VK._antes = null;   // o comando 'imagem' guarda o próprio histórico
            const p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0];
            return await vkCmd('imagem', { arquivo: caminho, x: 0, y: 0, larg: a.larg, prancheta: p.id }, 'ui');
        }
        const r = await api().vk_abrir(caminho);
        if (!r || !r.success) throw new Error((r && r.error) || 'não abriu');
        const d = r.doc, p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0], o = d.pranchetas[0];
        Object.assign(VK.doc.imagens, d.imagens || {});
        const reid = x => { x.id = vkId(); if (x.itens) x.itens.forEach(reid); return x; };
        const g = { id: vkId(), tipo: 'grupo', nome: caminho.split(/[\\/]/).pop(), itens: d.camadas.flatMap(c => c.itens).map(reid) };
        vkTransformar(g, [1, 0, 0, 1, p.x - o.x, p.y - o.y]);
        const cam = VK.doc.camadas.find(c => c.id === VK.camadaAtiva) || VK.doc.camadas.at(-1);
        cam.itens.push(g); VK.sel = [g.id]; VK.relatorio = r.relatorio || [];
        return { id: g.id, objetos: g.itens.length, relatorio: VK.relatorio };
    });
    vkRegistrar('salvar', 'salvar', async a => {
        let caminho = a.caminho || (a.como ? null : VK.path);
        if (!caminho) caminho = await api().vk_dialogo('salvar', ['Vetor Kanivete (*.aknv)'], (VK.doc.nome || 'Sem titulo') + '.aknv');
        if (!caminho) return { cancelado: true };
        const r = await api().vk_salvar(vkClone(VK.doc), caminho);
        if (!r || !r.success) throw new Error((r && r.error) || 'não salvou');
        VK.path = r.path; VK.sujo = false; VK.doc.nome = r.nome.replace(/\.aknv$/i, ''); VK._antes = null;
        vkRecente(r.path); vkToast('Salvo: ' + r.nome);
        return { caminho: r.path };
    });
    vkRegistrar('exportar_pdf', 'exportar PDF', async a => {
        // padrao: x4 (PDF/X-4, recomendado) | x1a (PDF/X-1a) | cmyk | rgb. O fechamento roda antes: erro impede (forcar: true passa)
        const padrao = a.padrao || 'x4';
        const f = vkFechamento({ padrao });
        if (f.erros.length && !a.forcar) {
            const e = new Error(`fechamento com ${f.erros.length} erro(s): ${f.erros.map(x => x.msg).slice(0, 4).join(' | ')} (corrija ou passe forcar: true)`);
            e.fechamento = f; throw e;
        }
        let caminho = a.caminho || await api().vk_dialogo('salvar', ['PDF (*.pdf)'], (VK.doc.nome || 'arte') + '.pdf');
        if (!caminho) return { cancelado: true };
        await vkGeosProntas();
        const op = { padrao, perfil: a.perfil || VK.doc.perfil, marcas: a.marcas ?? (padrao !== 'rgb'), sangria: a.sangria != null ? vkPT(+a.sangria) : (padrao === 'rgb' ? 0 : VK.doc.sangria),
            pranchetas: a.pranchetas ? [].concat(a.pranchetas).map(n => (VK.doc.pranchetas.find(p => p.id === n || p.nome === n) || {}).id).filter(Boolean) : [],
            spotsParaProcesso: !!a.spotsParaProcesso, titulo: VK.doc.nome, textoEditavel: !!a.texto_editavel };   // texto_editavel: fonte embutida, texto copiável (PDF digital)
        vkCarregando(true, 'Gerando PDF para gráfica...');
        let r;
        try { r = await api().vk_exportar_pdf(await vkDocPy(), caminho, op); } finally { vkCarregando(false); }
        VK._antes = null;
        if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
        vkToast(`PDF ${padrao.toUpperCase()} pronto: ${r.paginas} página(s)` + (r.verificacao.ok ? ' — verificado ✓' : ' — verificar: ' + r.verificacao.problemas.join('; ')));
        return { caminho: r.path, paginas: r.paginas, verificado: r.verificacao.ok, problemas: r.verificacao.problemas, avisos: r.avisos, info: r.verificacao.info, alertas_fechamento: f.avisos.length };
    });
    vkRegistrar('empacotar', 'empacotar', async a => {
        // pasta/<nome>/: <nome>.aknv + Links/ + Fontes/ + <nome>.pdf (padrao, default x4) + Relatório.txt. pdf: false = sem PDF
        const pasta = a.pasta || await api().vk_dialogo('pasta');
        if (!pasta) return { cancelado: true };
        const padrao = a.padrao || VK.padraoPdf || 'x4', f = vkFechamento({ padrao });
        const nome = (VK.doc.nome || 'Sem titulo').replace(/[<>:"/\\|?*]+/g, '_').trim() || 'Sem titulo';
        const dest = pasta.replace(/[\\/]+$/, '') + '/' + nome;
        let pdf = null;
        if (a.pdf !== false) pdf = await VK_CMDS.exportar_pdf.fn({ padrao, forcar: true, caminho: dest + '/' + nome + '.pdf', ...(a.sangria != null ? { sangria: a.sangria } : {}) });
        const r = await api().vk_empacotar(await vkDocPy(), pasta, { fontes: a.fontes !== false, padrao, pdf, spots: f.info.spots,
            fechamento: { erros: f.erros.map(x => ({ nivel: 'erro', msg: x.msg })), avisos: f.avisos.map(x => ({ nivel: 'aviso', msg: x.msg })) } });
        if (!r || !r.success) throw new Error((r && r.error) || 'não empacotou');
        VK._antes = null;
        vkToast(`Pacote pronto: ${r.links} imagem(ns), ${r.fontes} fonte(s)${pdf ? ', PDF' : ''}`);
        return { pasta: r.pasta, aknv: r.aknv, pdf: pdf && pdf.caminho, pdf_verificado: pdf ? pdf.verificado : null, links: r.links, faltando: r.faltando, fontes: r.fontes, fontes_faltando: r.fontes_faltando, erros_fechamento: f.erros.length };
    });
    vkRegistrar('exportar_imagem', 'exportar imagem', async a => {   // PNG/JPG de cada prancheta, na resolução pedida (ppi)
        let caminho = a.caminho || await api().vk_dialogo('salvar', ['PNG (*.png)', 'JPG (*.jpg)'], (VK.doc.nome || 'arte') + '.png');
        if (!caminho) return { cancelado: true };
        await vkGeosProntas(); await vkImagensProntas(); await vkCoresProntas();
        const ps = a.pranchetas ? VK.doc.pranchetas.filter(p => [].concat(a.pranchetas).includes(p.nome) || [].concat(a.pranchetas).includes(p.id)) : (a.todas ? VK.doc.pranchetas : [VK.doc.pranchetas.find(p => p.id === VK.ativa) || VK.doc.pranchetas[0]]);
        const saidas = [];
        for (const [i, p] of ps.entries()) {
            const cv = vkRenderPrancheta(p, (a.ppi || 150) / 72, /\.jpe?g$/i.test(caminho) || a.fundo !== 'transparente');
            const nome = ps.length > 1 ? caminho.replace(/(\.\w+)$/, `_${String(i + 1).padStart(2, '0')}$1`) : caminho;
            const r = await api().vk_salvar_png(cv.toDataURL('image/png'), nome);
            saidas.push(r.path);
        }
        VK._antes = null;
        return { arquivos: saidas };
    });
    vkRegistrar('exportar_svg', 'exportar SVG', async a => {
        let caminho = a.caminho || await api().vk_dialogo('salvar', ['SVG (*.svg)'], (VK.doc.nome || 'arte') + '.svg');
        if (!caminho) return { cancelado: true };
        await vkGeosProntas(); await vkCoresProntas();
        const p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0];
        const svg = vkSvg(p);
        await api().vk_salvar_png(btoa(unescape(encodeURIComponent(svg))), caminho);
        VK._antes = null;
        return { caminho };
    });
    // ── correções do fechamento ──
    vkRegistrar('converter_cmyk', 'converter cores para CMYK', async () => {
        const rgb = [], refs = [];
        const ver = (c, set) => { if (!c) return; if (c.k === 'rgb') { rgb.push(c.v); refs.push(set); } else if (c.k === 'grad') c.paradas.forEach(p => ver(p.cor, v => { p.cor = v; })); };
        for (const { o } of vkTodos()) {
            ver(o.preench, v => { o.preench = v; });
            if (o.traco) ver(o.traco.cor, v => { o.traco = { ...o.traco, cor: v }; });
            (o.trechos || []).forEach(t => { ver(t.preench, v => { t.preench = v; }); if (t.traco) ver(t.traco.cor, v => { t.traco = { ...t.traco, cor: v }; }); });
            [...(o.aparencia || []), ...(o.efeitos || [])].forEach(l => ver(l.cor, v => { l.cor = v; }));
        }
        const E = VK.doc.estilosTexto; if (E) for (const L of [E.par, E.car]) for (const st of Object.values(L || {})) { ver(st.preench, v => { st.preench = v; }); if (st.traco) ver(st.traco.cor, v => { st.traco = { ...st.traco, cor: v }; }); }
        for (const am of VK.doc.amostras) ver(am.cor, v => { am.cor = v; });
        if (rgb.length) { const r = await api().vk_rgb_para_cmyk(rgb, VK.doc.perfil); refs.forEach((set, i) => set({ k: 'cmyk', v: r[i] })); }
        VK.doc.modoCor = 'cmyk';
        return { convertidas: rgb.length };
    });
    vkRegistrar('preto_texto', 'textos pretos em 100K', () => {
        let n = 0;
        for (const { o } of vkTodos()) if (o.tipo === 'texto' && vkPretoRico(o.preench)) { o.preench = { k: 'cmyk', v: [0, 0, 0, 100] }; n++; }
        return { corrigidos: n };
    });
    vkRegistrar('sobreimprimir_preto', 'sobreimprimir preto 100K', () => {
        let n = 0;
        for (const { o } of vkTodos()) {
            if (o.tipo === 'grupo' || o.tipo === 'imagem') continue;
            const p = vkPreto100(o.preench) && (o.tipo === 'texto' || vkBoxArea(o) < vkPT(40) ** 2), t = o.traco && vkPreto100(o.traco.cor);
            if (p || t) { o.sobre = { p: !!(p || (o.sobre && o.sobre.p)), t: !!(t || (o.sobre && o.sobre.t)) }; n++; }
        }
        return { marcados: n };
    });
    vkRegistrar('tirar_sobre_branco', 'tirar sobreimpressão do branco', () => {
        let n = 0;
        for (const { o } of vkTodos()) if (o.sobre && (vkBranco(o.preench) && o.sobre.p || o.traco && vkBranco(o.traco.cor) && o.sobre.t)) { delete o.sobre; n++; }
        return { corrigidos: n };
    });
    vkRegistrar('engrossar_tracos', 'traços finos → 0,25 pt', () => {
        let n = 0;
        for (const { o } of vkTodos()) if (o.traco && o.traco.cor && o.traco.larg < 0.25) { o.traco = { ...o.traco, larg: 0.25 }; n++; }
        return { corrigidos: n };
    });
    vkRegistrar('limpar', 'limpar pontos soltos e vazios', () => {
        let n = 0;
        const limpa = itens => itens.filter(o => {
            if (o.tipo === 'grupo') { o.itens = limpa(o.itens); if (!o.itens.length || (o.clip && o.itens.length < 2)) { n++; return false; } return true; }
            if (o.tipo === 'caminho') { o.subs = o.subs.filter(s => s.pts.length > 1); if (!o.subs.length || (!o.preench && !(o.traco && o.traco.cor))) { n++; return false; } }
            if (o.tipo === 'texto' && !String(o.conteudo).trim()) { n++; return false; }
            return true;
        });
        for (const c of VK.doc.camadas) c.itens = limpa(c.itens);
        return { removidos: n };
    });
})();

async function vkCoresProntas() {   // prova de cor (ICC) de todas as cores já calculada (render/exportação logo depois de abrir)
    for (const { o } of vkTodos()) vkCores(o).forEach(c => vkCss(c));
    if (!vkCoresFila.size) return;
    clearTimeout(vkCoresTimer);
    const f = [...vkCoresFila]; vkCoresFila = new Map();
    try { const r = await vkApi().vk_cores_tela(f.map(x => x[1]), VK.doc.perfil || 'FOGRA39'); f.forEach(([kk], i) => VK.corTela.set(kk, `rgb(${r[i].join(',')})`)); } catch (e) { /* sem API */ }
}
async function vkImagensProntas() {
    for (const im of Object.values(VK.doc.imagens)) { const el = vkImagemEl(im); if (el && !el.complete) await new Promise(r => { el.addEventListener('load', r, { once: true }); el.addEventListener('error', r, { once: true }); }); }
}
function vkRenderPrancheta(p, esc, fundo = true, sangria = 0) {
    const cv = document.createElement('canvas');
    cv.width = Math.round((p.w + 2 * sangria) * esc); cv.height = Math.round((p.h + 2 * sangria) * esc);
    const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';   // foto reduzida sem serrilhado/ruído
    if (fundo) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.setTransform(esc, 0, 0, esc, (sangria - p.x) * esc, (sangria - p.y) * esc);
    const z = VK.vista.z, cont = VK.contorno; VK.vista.z = esc; VK.contorno = false;
    try { for (const c of VK.doc.camadas) if (c.visivel !== false) for (const o of c.itens) vkDesenharObj(ctx, o, c); }
    finally { VK.vista.z = z; VK.contorno = cont; }
    return cv;
}
function vkSvg(p) {
    const e = n => vkR(n, 3), cor = c => (!c ? 'none' : vkCss(c).replace(/^rgb\((\d+),(\d+),(\d+)\)$/, (_, r, g, b) => '#' + [r, g, b].map(x => (+x).toString(16).padStart(2, '0')).join('')));
    const d = (subs, m) => subs.map(s => { const P = s.pts.map(q => m ? [...vkAp(m, q[0], q[1]), ...vkAp(m, q[2], q[3]), ...vkAp(m, q[4], q[5])] : q); if (!P.length) return '';
        let t = `M${e(P[0][0])} ${e(P[0][1])}`; const n = s.fechado ? P.length : P.length - 1;
        for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % P.length]; t += `C${e(a[4])} ${e(a[5])} ${e(b[2])} ${e(b[3])} ${e(b[0])} ${e(b[1])}`; }
        return t + (s.fechado ? 'Z' : ''); }).join('');
    let defs = '', n = 0;
    const pint = c => { if (!c || c.k !== 'grad') return cor(c); const id = 'g' + (++n);
        const st = c.paradas.map(q => `<stop offset="${q.p}" stop-color="${cor(q.cor)}"/>`).join('');
        defs += c.tipo === 'rad' ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${e(c.a[0])}" cy="${e(c.a[1])}" r="${e(c.r)}">${st}</radialGradient>`
            : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${e(c.a[0])}" y1="${e(c.a[1])}" x2="${e(c.b[0])}" y2="${e(c.b[1])}">${st}</linearGradient>`;
        return `url(#${id})`; };
    const obj = o => {
        if (o.visivel === false) return '';
        const at = `${o.op != null && o.op < 1 ? ` opacity="${o.op}"` : ''}`;
        if (o.tipo === 'grupo') { if (o.clip) { const id = 'c' + (++n); defs += `<clipPath id="${id}"><path d="${d(o.itens[0].subs)}"/></clipPath>`; return `<g clip-path="url(#${id})"${at}>${o.itens.slice(1).map(obj).join('')}</g>`; } return `<g${at}>${o.itens.map(obj).join('')}</g>`; }
        if (o.tipo === 'imagem') { const im = VK.doc.imagens[o.img] || {}; return `<image transform="matrix(${o.m.map(e).join(' ')})" width="${im.w}" height="${im.h}" href="${im.url || ''}"${at}/>`; }
        const subs = o.tipo === 'texto' ? (vkGeo(o) || { subs: [] }).subs : o.subs, m = o.tipo === 'texto' ? o.m : null;
        const t = o.traco && o.traco.cor ? ` stroke="${pint(o.traco.cor)}" stroke-width="${e(o.traco.larg)}" stroke-linecap="${o.traco.cap || 'butt'}" stroke-linejoin="${o.traco.junc || 'miter'}"` : '';
        return `<path d="${d(subs, m)}" fill="${pint(o.preench)}"${o.regra === 'evenodd' ? ' fill-rule="evenodd"' : ''}${t}${at}/>`;
    };
    const corpo = VK.doc.camadas.filter(c => c.visivel !== false).map(c => `<g id="${c.nome.replace(/[^\w-]/g, '_')}">${c.itens.map(obj).join('')}</g>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${e(vkMM(p.w))}mm" height="${e(vkMM(p.h))}mm" viewBox="${e(p.x)} ${e(p.y)} ${e(p.w)} ${e(p.h)}"><defs>${defs}</defs>${corpo}</svg>`;
}

// ─────────────────────────── FECHAMENTO (preflight) ───────────────────────────
const vkTAC = c => { const v = c && (c.k === 'cmyk' ? c.v : c.k === 'spot' ? c.v.map(x => x * (c.tint ?? 100) / 100) : null); return v ? v.reduce((s, x) => s + x, 0) : 0; };
const vkPretoRico = c => c && c.k === 'cmyk' && c.v[3] >= 90 && c.v[0] + c.v[1] + c.v[2] > 0;
const vkPreto100 = c => c && c.k === 'cmyk' && c.v[3] >= 99.5 && c.v[0] + c.v[1] + c.v[2] < 0.5;
const vkBranco = c => c && ((c.k === 'cmyk' && c.v.every(x => x < 0.5)) || (c.k === 'rgb' && c.v.every(x => x > 254)));
const vkBoxArea = o => { const b = vkBox(o); return isFinite(b[0]) ? (b[2] - b[0]) * (b[3] - b[1]) : 0; };
function vkCores(o) { const out = []; const ad = c => { if (!c) return; if (c.k === 'grad') c.paradas.forEach(p => ad(p.cor)); else out.push(c); }; ad(o.preench); if (o.traco) ad(o.traco.cor); (o.trechos || []).forEach(t => { ad(t.preench); if (t.traco) ad(t.traco.cor); }); (o.aparencia || []).forEach(l => ad(l.cor)); (o.efeitos || []).forEach(e => ad(e.cor)); return out; }
function vkFechamento(op = {}) {
    // Regras de pré-impressão (Instructions/vetor-kanivete.md › Fechamento). → {ok, erros, avisos, info}
    const padrao = op.padrao || 'x4', impressao = padrao !== 'rgb', d = VK.doc;
    const tacMax = op.tac || (/29|UNCOATED/i.test(d.perfil) ? 260 : 300);
    const itens = []; const add = (nivel, cod, msg, ids, corrigir) => {
        const ja = itens.find(x => x.cod === cod); if (ja) { ja.ids.push(...ids); ja.n += ids.length || 1; return; }
        itens.push({ nivel, cod, msg, ids: [...ids], n: ids.length || 1, ...(corrigir ? { corrigir } : {}) });
    };
    const b = d.sangria || 0, margem = vkPT(op.margem ?? 3);
    const spots = new Set();
    for (const { o, cam } of vkTodos()) {
        if (o.visivel === false || cam.visivel === false || cam.imprimir === false) continue;
        const cores = vkCores(o);
        cores.forEach(c => { if (c.k === 'spot') spots.add(c.nome); });
        if (impressao && cores.some(c => c.k === 'rgb')) add('erro', 'rgb', 'Cores RGB num arquivo para impressão (a gráfica imprime CMYK)', [o.id], 'converter_cmyk');
        if (impressao && cores.some(c => vkTAC(c) > tacMax)) add('aviso', 'tac', `Tinta total acima de ${tacMax}% (seca mal, decalca)`, [o.id]);
        if (o.tipo === 'texto') {
            const g = vkGeo(o), tam = o.tam * vkEsc(o.m);
            if (g && !g.achou) add('erro', 'fonte', `Fonte não instalada: ${(g.faltam && g.faltam.join(', ')) || o.fam} (sai em Arial)`, [o.id]);
            else if (g && g.achou === 'embutida') add('aviso', 'fonte_embutida', `Fonte embutida do arquivo original (só as letras que já existiam): ${o.fam} — instale para editar à vontade`, [o.id]);
            if (vkPretoRico(o.preench) && tam < 14) add('aviso', 'preto_rico', 'Texto pequeno em preto de 4 cores (fica borrado se o registro variar): use 100K', [o.id], 'preto_texto');
            if (tam < 6) add('aviso', 'texto_pequeno', 'Texto menor que 6 pt (pode não sair legível)', [o.id]);
            if (vkPreto100(o.preench) && tam < 14 && !(o.sobre && o.sobre.p)) add('aviso', 'preto_sem_sobre', 'Texto preto 100K sem sobreimprimir (risco de filete branco no registro)', [o.id], 'sobreimprimir_preto');
        }
        if (o.traco && o.traco.cor && o.traco.larg < 0.25 && o.tipo !== 'grupo') add('erro', 'traco_fino', 'Traço mais fino que 0,25 pt (some na impressão)', [o.id], 'engrossar_tracos');
        if (o.sobre && ((o.sobre.p && vkBranco(o.preench)) || (o.sobre.t && o.traco && vkBranco(o.traco.cor)))) add('erro', 'branco_sobre', 'Branco com sobreimpressão (o objeto SOME na impressão)', [o.id], 'tirar_sobre_branco');
        if (padrao === 'x1a' && ((o.op != null && o.op < 1) || (o.bm && o.bm !== 'normal'))) add('erro', 'transparencia', 'Transparência/mesclagem: PDF/X-1a não aceita (exporte em PDF/X-4)', [o.id]);
        if (padrao === 'x1a' && o.opmask) add('erro', 'transparencia', 'Máscara de opacidade: PDF/X-1a não aceita (exporte em PDF/X-4)', [o.id]);
        if (padrao === 'x1a' && (o.efeitos || []).some(e => e.visivel !== false && !['cantos', 'zigue', 'aspero', 'inflar', 'torcer', 'deformar'].includes(e.tipo))) add('erro', 'efeito_transparencia', 'Sombra/brilho/desfoque usam transparência: PDF/X-1a não aceita (exporte em PDF/X-4)', [o.id]);
        if ((o.aparencia || []).some(l => l.visivel !== false && l.tipo === 'traco' && (l.larg ?? 1) < 0.25)) add('erro', 'traco_fino', 'Traço extra (Aparência) mais fino que 0,25 pt (some na impressão)', [o.id]);
        if (o.tipo === 'caminho' && o.subs.some(s => s.pts.length < 2)) add('aviso', 'pontos_soltos', 'Pontos soltos (caminhos de 1 ponto)', [o.id], 'limpar');
        if (o.tipo === 'imagem') {
            const im = d.imagens[o.img] || {}, ppi = Math.round(72 / vkEsc(o.m));
            if (!im.arquivo || im.faltando) add('erro', 'link', 'Imagem com link quebrado', [o.id]);
            if (impressao && ppi < 150) add('erro', 'resolucao', `Imagem com ${ppi} ppi (mínimo 150; ideal 300)`, [o.id], 'ampliar_imagem');
            else if (impressao && ppi < 250) add('aviso', 'resolucao_baixa', `Imagem com ${ppi} ppi (ideal 300 no tamanho final)`, [o.id], 'ampliar_imagem');
            if (padrao === 'x1a' && im.alfa) add('erro', 'imagem_alfa', 'Imagem com transparência em PDF/X-1a (use PDF/X-4)', [o.id]);
        }
        // sangria e margem de segurança (só objetos de nível de camada)
        if (!o._filho && impressao && cam.itens.includes(o)) {
            const bb = vkBox(o, true); if (!isFinite(bb[0])) continue;
            for (const p of d.pranchetas) {
                const T = [p.x, p.y, p.x + p.w, p.y + p.h];
                if (bb[2] < T[0] || bb[0] > T[2] || bb[3] < T[1] || bb[1] > T[3]) continue;
                const tol = 0.5;
                const encosta = [bb[0] <= T[0] + tol && bb[0] > T[0] - b + tol, bb[1] <= T[1] + tol && bb[1] > T[1] - b + tol,
                    bb[2] >= T[2] - tol && bb[2] < T[2] + b - tol, bb[3] >= T[3] - tol && bb[3] < T[3] + b - tol];
                if (b > 0 && encosta.some(Boolean) && o.tipo !== 'texto') add('aviso', 'sangria', `Fundo/imagem encosta no corte mas não chega na sangria (${vkR(vkMM(b), 1)} mm): pode sair filete branco`, [o.id]);
                if (o.tipo === 'texto' && (bb[0] < T[0] + margem || bb[1] < T[1] + margem || bb[2] > T[2] - margem || bb[3] > T[3] - margem))
                    add('aviso', 'margem', `Texto a menos de ${vkR(vkMM(margem), 1)} mm do corte (pode ser cortado)`, [o.id]);
            }
        }
    }
    if (impressao && b <= 0) add('aviso', 'sem_sangria', 'Documento sem sangria (o padrão de gráfica é 3 mm)', []);
    if (impressao && d.modoCor === 'rgb') add('aviso', 'modo_rgb', 'Documento em modo RGB', [], 'converter_cmyk');
    const erros = itens.filter(x => x.nivel === 'erro'), avisos = itens.filter(x => x.nivel === 'aviso');
    return { ok: !erros.length, padrao, perfil: d.perfil, tac_max: tacMax, erros, avisos, info: { spots: [...spots], pranchetas: d.pranchetas.length, sangria_mm: vkR(vkMM(b), 2) } };
}
function vkRecente(c) {
    try { const l = JSON.parse(localStorage.getItem('vk-recentes') || '[]').filter(x => x !== c); l.unshift(c); localStorage.setItem('vk-recentes', JSON.stringify(l.slice(0, 10))); } catch (e) { /* sem storage */ }
}
function vkCarregando(on, txt) { const el = document.getElementById('vk-carregando'); if (!el) return; el.hidden = !on; if (txt) el.querySelector('span').textContent = txt; }
