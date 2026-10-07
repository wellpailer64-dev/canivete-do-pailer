// Criar fonte própria (estilo Fontself): uma prancheta por glifo, com o NOME = o caractere (A, a, 1, ç...).
// A prancheta é a caixa do glifo: altura = 1 em (1000 unidades), base a 80% da altura (ascendente 800, descendente
// 200), largura = avanço (mude com as alças da ferramenta Prancheta). O que tem o centro na prancheta entra; pintura
// branca recorta (furo desenhado por cima); traço é contornado; texto vira contorno; camada que não imprime fica fora
// (a camada "Métricas" do modelo traz as linhas de base, x, versal, ascendente e descendente).
// Comandos: fonte_modelo {caracteres, altura mm, largura mm, familia} → documento novo (8 por linha);
//           exportar_fonte {familia, estilo, caminho .otf, instalar} → Functions/vetor_fonte.py (fontTools + pathops).
const VK_FONTE = { upm: 1000, asc: 800, desc: -200, cap: 700, x: 500 };
const VK_FONTE_CARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?-\'"()&@';
const vkFtGlifo = p => Array.from(String(p.nome || '')).length === 1;
function vkFtBranco(c) {
    if (!c) return false;
    if (c.k === 'cmyk') return c.v.every(v => v <= 0.5);
    if (c.k === 'rgb') return c.v.every(v => v >= 250);
    if (c.k === 'spot') return (c.tint ?? 100) <= 0.5;
    return false;
}
(function () {
    vkRegistrar('fonte_modelo', 'modelo de fonte', a => {
        const cars = Array.from(new Set(Array.from(String(a.caracteres || VK_FONTE_CARS)).filter(c => c.trim())));
        if (!cars.length) throw new Error('fonte_modelo: caracteres vazios');
        const H = +a.altura || 50, W = +a.largura || vkR(H * 0.6, 1);
        VK.doc = vkDocVazio({ nome: a.familia || 'Minha Fonte', larg: W, alt: H, pranchetas: cars.length, sangria: 0, modoCor: 'rgb', layout_pr: { modo: 'grade', colunas: 8 } });
        VK.doc.pranchetas.forEach((p, i) => { p.nome = cars[i]; });
        VK.doc.fonte = { familia: a.familia || 'Minha Fonte', estilo: a.estilo || 'Regular' };
        VK.path = null; VK.hist = []; VK.futuro = []; VK.sel = []; VK.ativa = VK.doc.pranchetas[0].id;
        // camada de métricas (não imprime, travada): base, x, versal, ascendente, descendente
        const k = vkPT(H) / VK_FONTE.upm, linhas = [['base', 0, 'C100 M0 Y0 K0'], ['altura-x', VK_FONTE.x, 'C60 M0 Y0 K0'], ['versal', VK_FONTE.cap, 'C60 M0 Y0 K0'],
            ['ascendente', VK_FONTE.asc, 'C30 M0 Y0 K0'], ['descendente', VK_FONTE.desc, 'C30 M0 Y0 K0']];
        const itens = [];
        for (const p of VK.doc.pranchetas) {
            const base = p.y + VK_FONTE.asc * k;
            for (const [nome, v, cor] of linhas) { const y = base - v * k; itens.push({ id: vkId(), tipo: 'caminho', nome: `${p.nome} ${nome}`, regra: 'nonzero', preench: null,
                traco: { cor: vkCorDe(cor), larg: 0.5, cap: 'butt', junc: 'miter', miter: 4, tracejado: nome === 'base' ? [] : [2, 2], fase: 0 },
                subs: [{ fechado: false, pts: [[p.x, y, p.x, y, p.x, y], [p.x + p.w, y, p.x + p.w, y, p.x + p.w, y]] }] }); }
        }
        VK.doc.camadas.unshift({ id: vkId('c'), nome: 'Métricas', visivel: true, trava: true, imprimir: false, itens });
        VK.doc.camadas[1].nome = 'Glifos'; VK.camadaAtiva = VK.doc.camadas[1].id; VK._antes = null;
        setTimeout(() => vkEnquadrar(vkBoxUniao(VK.doc.pranchetas.map(p => ({ tipo: 'caminho', subs: vkRetSubs(p.x, p.y, p.w, p.h) })))), 0);
        return { pranchetas: cars.length, altura_mm: H, largura_mm: W, metricas: VK_FONTE };
    });
    // glifos do documento em unidades da fonte (y para cima, base = 0)
    async function vkFtGlifos() {
        const ps = VK.doc.pranchetas.filter(vkFtGlifo), out = [], api = vkApi();
        for (const p of ps) {
            const k = VK_FONTE.upm / p.h, bx = p.x, by = p.y + VK_FONTE.asc / k;
            const U = (x, y) => [(x - bx) * k, (by - y) * k];
            const conv = subs => subs.map(s => ({ fechado: s.fechado !== false, pts: s.pts.map(q => [...U(q[0], q[1]), ...U(q[2], q[3]), ...U(q[4], q[5])]) }));
            const pint = [];
            for (const c of VK.doc.camadas) {
                if (c.visivel === false || c.imprimir === false) continue;
                for (const o of c.itens) {
                    if (o.visivel === false || o.tipo === 'imagem') continue;
                    const b = vkBox(o); if (!isFinite(b[0])) continue;
                    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
                    if (cx < p.x || cx > p.x + p.w || cy < p.y || cy > p.y + p.h) continue;
                    for (const f of (await vkApPronto(o)) || []) {
                        if (f.preench) pint.push({ subs: conv(f.subs), regra: f.regra || 'nonzero', tira: vkFtBranco(f.preench) });
                        if (f.traco && f.traco.cor && f.traco.larg > 0) {
                            const r = await api.vk_contornar_traco([{ subs: f.subs, regra: f.regra || 'nonzero', traco: f.traco }]);
                            if (r && r[0] && r[0].subs) pint.push({ subs: conv(r[0].subs), regra: 'nonzero', tira: vkFtBranco(f.traco.cor) });
                        }
                    }
                }
            }
            out.push({ car: p.nome, larg: Math.round(p.w * k), pinturas: pint });
        }
        return out;
    }
    vkRegistrar('exportar_fonte', 'exportar fonte', async a => {
        const glifos = await vkFtGlifos();
        if (!glifos.length) throw new Error('exportar_fonte: nenhuma prancheta com nome de UM caractere (A, b, 1...) — use Texto › Criar fonte: modelo');
        const fam = a.familia || (VK.doc.fonte && VK.doc.fonte.familia) || VK.doc.nome || 'Minha Fonte', estilo = a.estilo || (VK.doc.fonte && VK.doc.fonte.estilo) || 'Regular';
        let caminho = a.caminho || await vkApi().vk_dialogo('salvar', ['Fonte OpenType (*.otf)'], `${fam} ${estilo}.otf`);
        if (!caminho) { VK._antes = null; return { cancelado: true }; }
        if (!/\.otf$/i.test(caminho)) caminho += '.otf';
        const r = await vkApi().vk_exportar_fonte({ familia: fam, estilo, caminho, instalar: !!a.instalar, ...VK_FONTE, glifos });
        if (!r || !r.success) throw new Error((r && r.error) || 'a fonte não foi gerada');
        VK.doc.fonte = { familia: fam, estilo, arquivo: r.caminho };
        // já vale nos textos do Vetor, mesmo sem instalar (e vai junto ao empacotar)
        const reg = { fam, estilo, ps: r.ps, arquivo: r.caminho };
        VK.doc.fontes = [...(VK.doc.fontes || []).filter(f => !(f.fam === fam && f.estilo === estilo)), reg];
        try { await vkApi().vk_registrar_fontes([reg]); } catch (e) { /* fica para a próxima abertura */ }
        if (VK.geo && VK.geo.clear) VK.geo.clear();
        return { caminho: r.caminho, glifos: r.glifos, familia: fam, estilo, instalada: !!(r.instalada && r.instalada.ok), avisos: r.avisos };
    });
    const m = VK_MENUS.find(x => x[0] === 'Texto');
    if (m) m[1].push('-', ['Criar fonte: modelo de glifos…', '', () => vkFtModeloDialogo()], ['Criar fonte: exportar .otf…', '', () => vkFtExportarDialogo()]);
})();
function vkFtModeloDialogo() {
    vkModal(`<div class="ie-dlg-tit">Criar fonte: modelo de glifos</div><div class="ie-dlg-corpo">
        <div class="vk-linha"><span>Família</span><input id="ft-fam" value="Minha Fonte"></div>
        <div class="vk-linha"><span>Caracteres</span><input id="ft-cars" value="${vkEsc_(VK_FONTE_CARS)}"></div>
        <div class="vk-grade">${vkNum('Altura (1 em)', 50, 'id="ft-h" min="10"', 'mm', 1)}${vkNum('Largura', 30, 'id="ft-w" min="1"', 'mm', 1)}</div>
        <div class="vk-nota">Uma prancheta por caractere, com o nome dele. Desenhe a letra entre as linhas (base, altura-x, versal); a largura da prancheta é o avanço — ajuste com a ferramenta Prancheta (Shift+O). Branco por cima vira furo; traço e texto são contornados na exportação.</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="ft-ok">Criar</button></div>`, (m, fechar) => {
        m.querySelector('#ft-ok').onclick = () => { const g = s => m.querySelector(s).value; fechar();
            vkCmdUi('fonte_modelo', { familia: g('#ft-fam'), caracteres: g('#ft-cars'), altura: +g('#ft-h'), largura: +g('#ft-w') }); };
    });
}
function vkFtExportarDialogo() {
    if (!VK.doc) return;
    const f = VK.doc.fonte || {}, n = VK.doc.pranchetas.filter(vkFtGlifo).length;
    vkModal(`<div class="ie-dlg-tit">Exportar fonte (.otf)</div><div class="ie-dlg-corpo">
        <div class="vk-linha"><span>Família</span><input id="ft-fam" value="${vkEsc_(f.familia || VK.doc.nome || 'Minha Fonte')}"></div>
        <div class="vk-linha"><span>Estilo</span><input id="ft-est" value="${vkEsc_(f.estilo || 'Regular')}"></div>
        <label class="vk-chk"><input type="checkbox" id="ft-inst" checked> Instalar no Windows (só para este usuário)</label>
        <div class="vk-nota">${n} glifo(s): pranchetas com nome de um caractere.</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="ft-ok">Exportar</button></div>`, (m, fechar) => {
        m.querySelector('#ft-ok').onclick = async () => { const g = s => m.querySelector(s); fechar();
            const r = await vkCmdUi('exportar_fonte', { familia: g('#ft-fam').value, estilo: g('#ft-est').value, instalar: g('#ft-inst').checked });
            if (r && !r.cancelado) vkToast(`Fonte ${r.familia} ${r.estilo}: ${r.glifos} glifos${r.instalada ? ', instalada' : ''}${r.avisos && r.avisos.length ? ' — ' + r.avisos.slice(0, 2).join('; ') : ''}`); };
    });
}
