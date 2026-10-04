// Executor do Canivete Worker no Vetor Kanivete (window.VKW): cada ferramenta é um COMANDO do app (VKN.cmd) — o mesmo
// que a interface e o Claude usam (histórico, aviso roxo "Worker: ..."). Objetos pelo NOME (o mapa mostra) ou id;
// medidas em mm relativas à prancheta ativa; cores como "C0 M100 Y100 K0", "100K", "#ff0000", "spot:NOME:c,m,y,k".
(() => {
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const achar = n => {
        const t = vkTodos(), k = norm(n);
        const r = t.find(x => x.o.id === n) || t.find(x => norm(x.o.nome) === k) || t.find(x => x.o.tipo === 'texto' && norm(x.o.conteudo) === k);
        if (!r) {   // lista também os SEM nome (id + tamanho): o modelo costuma criar a forma e esquecer o nome
            const sem = t.filter(x => !x.o.nome && x.o.tipo !== 'texto').slice(0, 10).map(x => { const c = vkCaixaMM(x.o) || {}; return `${x.o.id} (${x.o.tipo} ${c.larg}×${c.alt} mm)`; });
            throw new Error(`objeto "${n}" não existe; nomes: ${t.filter(x => x.o.nome || x.o.tipo === 'texto').map(x => x.o.nome || x.o.conteudo.slice(0, 20)).slice(0, 25).join(', ')}`
                + (sem.length ? `. Sem nome: ${sem.join(', ')} — se for um deles, use alterar com objetos:["<id>"] e nome:"${n}"` : ''));
        }
        return r.o;
    };
    const ids = a => ({ ids: [].concat(a.objetos || a.objeto || []).map(n => achar(n).id) });
    const C = (n, a) => VKN.cmd(n, a, 'worker');
    const f = {
        mapa: () => VKN.mapa({ max: 40 }),
        retangulo: a => C('retangulo', a), elipse: a => C('elipse', a), texto: a => C('texto', a), linha: a => C('linha', a),
        estrela: a => C('estrela', a), poligono: a => C('poligono', a), caminho: a => C('caminho', a), imagem: a => C('imagem', a),
        alterar: a => C('alterar', { ...a, ...ids(a) }),
        mover: a => C('mover', { ...a, ...ids(a) }), posicionar: a => C('posicionar', { ...a, ...ids(a) }),
        redimensionar: a => C('redimensionar', { ...a, ...ids(a) }), girar: a => C('girar', { ...a, ...ids(a) }),
        alinhar: a => C('alinhar', { ...a, ...ids(a) }), organizar: a => C('organizar', { ...a, ...ids(a) }),
        agrupar: a => C('agrupar', { ...a, ...ids(a) }), duplicar: a => C('duplicar', { ...a, ...ids(a) }), apagar: a => C('apagar', ids(a)),
        pathfinder: a => C('pathfinder', { ...a, ...ids(a) }),
        icone: a => C('icone', a), qrcode: a => C('qrcode', a), degrade: a => C('degrade', { ...a, ...ids(a) }),
        mesclar: a => C('mesclar', { ...a, ...ids(a) }), efeito: a => C('efeito', { ...a, ...ids(a) }),
        mala_direta: a => C('mala_direta', a), imagem: a => C('imagem', a), vinculos: () => C('vinculos'),
        girar_3d: a => C('girar_3d', { ...a, ...ids(a) }), extrudar_3d: a => C('extrudar_3d', { ...a, ...ids(a) }), editar_3d: a => C('editar_3d', { ...a, ...ids(a) }),
        mapear_arte: a => C('mapear_arte', { ...a, id3d: achar(a.objeto_3d).id, arte: [].concat(a.arte || []).map(n => achar(n).id) }), retocar_letra: a => C('retocar_letra', { ...a, ...ids(a) }), revincular: a => C('revincular', a), atualizar_vinculo: a => C('atualizar_vinculo', a), contornos: a => C('contornos', ids(a)), mascara: a => C('mascara', ids(a)),
        fechamento: a => {
            const r = VKN.fechamento({ padrao: a.padrao || 'x4' });
            return { ok: r.ok, erros: r.erros.map(e => `${e.cod}: ${e.msg}${e.corrigir ? ' (corrigir: ' + e.corrigir + ')' : ''}`), avisos: r.avisos.map(e => `${e.cod}${e.corrigir ? ' (corrigir: ' + e.corrigir + ')' : ''}`) };
        },
        corrigir: a => C(a.correcao, {}),
        exportar_pdf: async (a, ctx) => {
            const r = await VKN.exportarPdf((ctx.pasta || 'D:\\kanivete_testes\\vetor\\saida') + '\\' + String(a.nome || VK.doc.nome || 'arte').replace(/\.pdf$/i, '') + '.pdf', { padrao: a.padrao || 'x4' });
            window.__vkwExportado = r.verificado; return { verificado: r.verificado, problemas: r.problemas };
        },
    };
    const conferir = conds => conds.map(cond => {
        const [k, resto = ''] = String(cond).split(/:(.*)/s), [alvo, val = ''] = resto.split(/=(.*)/s);
        let ok = false, visto;
        try {
            if (k === 'exportado') ok = !!window.__vkwExportado;
            else if (k === 'fechamento_ok') { const r = VKN.fechamento({ padrao: alvo || 'x4' }); ok = r.ok; visto = r.erros.map(e => e.cod); }
            else if (k === 'objetos') { visto = vkTodos().length; ok = visto >= +alvo; }
            else if (k === 'sem') { try { achar(alvo); } catch (e) { ok = true; } }
            else {
                const o = achar(alvo), i = vkInfo(o);
                if (k === 'existe') ok = true;
                else if (k === 'cor') { visto = i.preench; ok = norm(visto) === norm(vkCorTexto(vkCorDe(val))); }
                else if (k === 'traco') { visto = i.traco || 'nenhum'; ok = /^(nenhum|none)$/i.test(String(val).trim()) ? !i.traco : norm(i.traco || '').startsWith(norm(vkCorTexto(vkCorDe(val)))); }
                else if (k === 'texto') { visto = o.conteudo; ok = norm(visto) === norm(val); }
                else if (k === 'tamanho') { visto = o.tam; ok = Math.abs(o.tam - +val) < 0.05; }
                else if (['x', 'y', 'larg', 'alt'].includes(k)) { visto = i.caixa_mm[k]; ok = Math.abs(visto - +val) < 0.3; }
                else if (k === 'sobreimprimir') { visto = !!i.sobreimprimir; ok = visto; }
                else visto = 'condição desconhecida';
            }
        } catch (e) { visto = e.message; }
        return { condicao: cond, ok, ...(ok || visto === undefined ? {} : { visto: String(JSON.stringify(visto)).slice(0, 120) }) };
    });
    window.VKW = { f, conferir, exec: async (n, a, ctx) => { if (!f[n]) throw new Error(`ferramenta ${n} não existe`); return await f[n](a || {}, ctx || {}); } };
})();
