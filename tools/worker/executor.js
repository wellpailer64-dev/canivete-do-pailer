// Executor do Canivete Worker: as ferramentas reais, rodando dentro do Photo Kanivete (window.KNVW). O worker.py
// valida as chamadas do modelo antes e manda só o que passou; cada ferramenta devolve um resultado curto (ou lança erro
// com uma mensagem que o modelo entende e corrige). Toda operação entra no histórico (Ctrl+Z desfaz).
(() => {
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const todas = () => ieTodas(IE.doc).filter(L => !L.referencia && !/ · (gasto|presa)$/.test(L.nome));
    // nome repetido (grupo e texto com o mesmo nome...) vira rótulo único: "s1-arraste [grupo]", "s1-texto2 [texto] #2"
    const tipoDe = L => (L.txt ? 'texto' : L.tipo);
    const rotulos = () => {
        const ls = todas(), conta = {}, out = [];
        for (const L of ls) conta[norm(L.nome)] = (conta[norm(L.nome)] || 0) + 1;
        const vistos = {};
        for (const L of ls) {
            let r = L.nome;
            if (conta[norm(L.nome)] > 1) { r = `${L.nome} [${tipoDe(L)}]`; vistos[r] = (vistos[r] || 0) + 1; if (vistos[r] > 1) r += ` #${vistos[r]}`; }
            out.push([r, L]);
        }
        return out;
    };
    const acha = n => { const rs = rotulos(), k = norm(n); return (rs.find(([r]) => norm(r) === k) || rs.find(([, L]) => norm(L.nome) === k) || [])[1] || null; };
    const precisa = n => { const L = acha(n); if (!L) throw new Error(`camada "${n}" não existe; use uma de: ${rotulos().map(([r]) => r).join(', ')}`); return L; };
    // ferramenta de texto num grupo: o erro já diz quais textos tem dentro
    const precisaTexto = n => {
        const L = precisa(n);
        if (L.txt) return L;
        const dentro = L.filhos ? ieTodasDe(L.filhos).filter(x => x.txt).map(x => '\'' + x.nome + '\'') : [];
        throw new Error(dentro.length ? `"${L.nome}" é um grupo; os textos dentro dele são: ${dentro.join(', ')} (use o nome de um deles)` : `"${L.nome}" não é uma camada de texto`);
    };
    const caixa = L => { const R = ieRCamada(L); return R ? { x: Math.round(R.x), y: Math.round(R.y), w: Math.round(R.w), h: Math.round(R.h) } : null; };
    const BM = { normal: 'NORMAL', multiplicacao: 'MULTIPLY', divisao: 'SCREEN', sobrepor: 'OVERLAY', luz_suave: 'SOFT_LIGHT', diferenca: 'DIFFERENCE' };
    const SOMBRA = { leve: '0 10px 24px rgba(0,0,0,.35)', media: '0 20px 44px rgba(0,0,0,.5)', forte: '0 34px 70px rgba(0,0,0,.65)' };
    const hist = n => ieHist('Worker: ' + n);
    const mudou = (L, R) => { ieInvalidar(L); ieCamadaMudou(L, R); };
    const ativo = L => { KNV.ativar(L.id); IE.doc.selIds = [L.id]; };
    const redesenharTexto = (L, Ra) => { if (L.ref != null && L.texto) { L.textoNovo = L.txt.s; delete L.c0; } ieTextoRender(L); ieAgendar(ieRUniao(Ra, ieRCamada(L)), IE.doc); };
    const f = {
        listar_camadas: () => rotulos().map(([r, L]) => ({ nome: r, tipo: tipoDe(L), ...(caixa(L) || {}), visivel: L.visivel !== false })),
        info_camada: a => {
            const L = precisa(a.camada), t = L.txt;
            return { nome: L.nome, tipo: t ? 'texto' : L.tipo, ...(caixa(L) || {}), opacidade: Math.round((L.op ?? 1) * 100), modo: L.bm || 'NORMAL', visivel: L.visivel !== false,
                ...(t ? { texto: t.s, fonte: `${t.fam} ${t.estilo || ''}`.trim(), tamanho: Math.round(t.tam * ieTextoEscala(t)), cor: t.cor } : {}) };
        },
        mover_camada: a => { const L = precisa(a.camada); ativo(L); KNV.mover(+a.dx || 0, +a.dy || 0); hist('mover'); return caixa(L); },
        posicionar_camada: a => { const L = precisa(a.camada), R = caixa(L); ativo(L); KNV.mover(+a.x - R.x, +a.y - R.y); hist('posicionar'); return caixa(L); },
        escalar_camada: a => { const L = precisa(a.camada); if (!(+a.escala > 0)) throw new Error('escala tem que ser maior que 0 (1 = igual)'); ativo(L); KNV.escalar(+a.escala); hist('escalar'); return caixa(L); },
        girar_camada: a => { const L = precisa(a.camada); ativo(L); KNV.girar(+a.graus || 0); hist('girar'); return caixa(L); },
        opacidade: a => { const L = precisa(a.camada), R = ieRCamada(L); L.op = ieClamp(+a.valor, 0, 100) / 100; mudou(L, R); hist('opacidade'); return { opacidade: Math.round(L.op * 100) }; },
        modo_mesclagem: a => { const L = precisa(a.camada), R = ieRCamada(L); L.bm = BM[a.modo] || 'NORMAL'; mudou(L, R); hist('mesclagem'); return { modo: L.bm }; },
        visibilidade: a => { const L = precisa(a.camada), R = ieRCamada(L); L.visivel = !!a.visivel; mudou(L, R); ieUiCamadas(); hist('visibilidade'); return { visivel: L.visivel }; },
        alterar_texto: a => {
            const L = precisaTexto(a.camada);
            const Ra = ieRCamada(L); L.txt.s = String(a.texto); redesenharTexto(L, Ra); hist('texto'); return { texto: L.txt.s, ...caixa(L) };
        },
        estilo_texto: async a => {
            const L = precisaTexto(a.camada), t = L.txt;
            const Ra = ieRCamada(L);
            if (a.fonte) {
                const est = ieEstiloDe(a.fonte, t.estilo) || ieEstiloDe(a.fonte, 'Regular');
                if (!est) throw new Error(`fonte "${a.fonte}" não está instalada`);
                ieAplicarEstiloFonte(t, a.fonte, est); t.negFalso = t.itaFalso = false; t.fonteMudou = true; await ieGarantirFonte(t);
            }
            if (a.tamanho) t.tam = Math.max(0.5, +a.tamanho / ieTextoEscala(t));
            if (a.cor) t.cor = String(a.cor);
            redesenharTexto(L, Ra); hist('estilo do texto');
            return { fonte: `${t.fam} ${t.estilo || ''}`.trim(), tamanho: Math.round(t.tam * ieTextoEscala(t)), cor: t.cor };
        },
        cor_objeto: a => {
            const L = precisa(a.camada);
            if (!L.c0) throw new Error(`"${L.nome}" não é objeto inteligente (só objeto/foto recortada recolore)`);
            const R = ieRCamada(L);
            L.filtrosInt = [...(L.filtrosInt || []).filter(x => !x.corObjeto), ...ieCenaCorFiltros(L.c0.c, String(a.cor), 0).map(x => ({ ...x, cena: false, corObjeto: true }))];
            const o = ieIntPlano(L); L.c = o.c; L.x = o.x; L.y = o.y; mudou(L, R); hist('cor do objeto');
            return { filtros: L.filtrosInt.length };
        },
        sombra_projetada: async a => { const L = precisa(a.camada); await KNV.receita.sombra([L.nome], SOMBRA[a.intensidade] || SOMBRA.media); hist('sombra'); return { sombra: a.intensidade }; },
        alinhar: a => {
            const Ls = (a.camadas || []).map(precisa), cx = Ls.map(caixa);
            if (Ls.length < 2) throw new Error('alinhar precisa de 2 camadas ou mais');
            const U = { x1: Math.min(...cx.map(c => c.x)), y1: Math.min(...cx.map(c => c.y)), x2: Math.max(...cx.map(c => c.x + c.w)), y2: Math.max(...cx.map(c => c.y + c.h)) };
            Ls.forEach((L, i) => {
                const c = cx[i], m = a.modo;
                const dx = m === 'esquerda' ? U.x1 - c.x : m === 'direita' ? U.x2 - (c.x + c.w) : m === 'centro_horizontal' ? (U.x1 + U.x2) / 2 - (c.x + c.w / 2) : 0;
                const dy = m === 'topo' ? U.y1 - c.y : m === 'base' ? U.y2 - (c.y + c.h) : m === 'centro_vertical' ? (U.y1 + U.y2) / 2 - (c.y + c.h / 2) : 0;
                if (dx || dy) { ativo(L); KNV.mover(Math.round(dx), Math.round(dy)); }
            });
            hist('alinhar'); return Ls.map(caixa);
        },
        acabamento: async a => {
            const mapa = { claridade: 'clar', textura: 'tex', granulacao: 'grao', vibracao: 'vib', contraste: 'ct', exposicao: 'exp', temperatura: 'temp' }, v = {};
            for (const [k, kk] of Object.entries(mapa)) if (a[k] != null && +a[k]) v[kk] = +a[k];   // zero = "não mexe"
            if (!Object.keys(v).length) throw new Error('acabamento sem nenhum valor diferente de zero (ex.: temperatura: 8)');
            // já existe acabamento: os valores SOMAM ao que está lá ("um pouco mais quente" não apaga o grão de antes)
            const A = ieTodas(IE.doc).find(L => L.tipo === 'ajuste' && L.ajChave === 'cameraRaw' && /acabamento/i.test(L.nome));
            if (A) {
                for (const [k, x] of Object.entries(v)) A.ajVals[k] = Math.round(((A.ajVals[k] || 0) + x) * 100) / 100;
                A.ajuste = IE_AJ_CAMADAS.cameraRaw.aj(A.ajVals); ieInvalidar(A); ieAgendar(null, IE.doc); hist('acabamento');
                return Object.fromEntries(Object.keys(v).map(k => [k, A.ajVals[k]]));
            }
            await KNV.receita.acabamento(v); hist('acabamento'); return v;
        },
        exportar: async (a, ctx) => {
            if (!ctx.pasta) throw new Error('o contrato não diz a pasta de exportação');
            await KNV.exportarRapido(a.o_que === 'tudo', ctx.pasta); window.KNVW._exportou = true; return { pasta: ctx.pasta };
        },
        levar_para_editor: async a => { const r = await KNV.levarParaEditor({ modo: a.modo }); window.KNVW._editor = true; return { comps: (r && r.comps || []).length }; },
    };
    // condições de sucesso do contrato: "visivel:logo", "oculta:logo", "texto:subtitulo=Só hoje", "opacidade:logo=80",
    // "exportado", "no_editor"
    const conferir = conds => (conds || []).map(c => {
        const [k, resto = ''] = String(c).split(/:(.*)/s), [nome, valor] = resto.split('=');
        let ok = false;
        try {
            const L = nome ? acha(nome) : null;
            if (k === 'visivel') ok = !!L && L.visivel !== false;
            else if (k === 'oculta') ok = !!L && L.visivel === false;
            else if (k === 'texto') ok = !!(L && L.txt && L.txt.s === valor);
            else if (k === 'opacidade') ok = !!L && Math.abs((L.op ?? 1) * 100 - +valor) < 1;
            else if (k === 'cor') ok = !!(L && L.txt && String(L.txt.cor).toLowerCase() === String(valor).toLowerCase());
            else if (k === 'tamanho') ok = !!(L && L.txt && Math.abs(L.txt.tam * ieTextoEscala(L.txt) - +valor) < 1.5);
            else if (k === 'exportado') ok = !!window.KNVW._exportou;
            else if (k === 'no_editor') ok = !!window.KNVW._editor;
        } catch (e) { ok = false; }
        return { condicao: c, ok };
    });
    window.KNVW = { f, conferir, _exportou: false, _editor: false,
        async exec(nome, a, ctx) { if (!f[nome]) throw new Error(`ferramenta "${nome}" não existe`); return await f[nome](a || {}, ctx || {}); } };
})();
