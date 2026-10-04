// Vetor Kanivete — os COMANDOS (a interface, o Claude e o Worker usam os mesmos) e window.VKN (porta para agentes).
// Unidades para agentes: mm, relativos ao canto superior esquerdo da prancheta (args.prancheta = nome/id, senão a ativa).
// A interface chama com {un: 'pt'} (pontos absolutos do documento). Cores: ver vkCorDe ("C0 M100 Y100 K0", "#ff0000",
// "100K", "spot:PANTONE 286 C:100,75,0,0", nome de amostra, "nenhum"). Alvos: ids ("ids": [...]) ou nomes ("nomes").
(() => {
    const prancheta = a => {
        const ps = VK.doc.pranchetas;
        if (a && a.prancheta != null) {
            const p = ps.find(p => p.id === a.prancheta || p.nome.toLowerCase() === String(a.prancheta).toLowerCase()) || ps[+a.prancheta - 1];
            if (!p) throw new Error(`prancheta "${a.prancheta}" não existe; há: ${ps.map(p => p.nome).join(', ')}`);
            return p;
        }
        return ps.find(p => p.id === VK.ativa) || ps[0];
    };
    // conversores: (x, y) e distâncias da API → pt absolutos
    const conv = a => {
        if (a.un === 'pt') return { X: v => +v, Y: v => +v, D: v => +v };
        const p = prancheta(a);
        return { X: v => p.x + vkPT(+v), Y: v => p.y + vkPT(+v), D: v => vkPT(+v) };
    };
    const alvos = a => {
        let ids = a.ids || (a.id ? [a.id] : null);
        if (!ids && a.nomes) {
            const todos = vkTodos();
            ids = [].concat(a.nomes).map(n => { const r = todos.find(x => (x.o.nome || '').toLowerCase() === String(n).toLowerCase()); if (!r) throw new Error(`objeto "${n}" não existe; nomes: ${todos.filter(x => x.o.nome).map(x => x.o.nome).slice(0, 30).join(', ')}`); return r.o.id; });
        }
        if (!ids) ids = VK.sel;
        const objs = ids.map(id => { const o = vkObj(id); if (!o) throw new Error(`objeto ${id} não existe`); return o; });
        if (!objs.length) throw new Error('nada selecionado (passe ids ou nomes)');
        return objs;
    };
    const camadaAlvo = a => {
        const cs = VK.doc.camadas;
        if (a.camada) { const c = cs.find(c => c.id === a.camada || c.nome.toLowerCase() === String(a.camada).toLowerCase()); if (!c) throw new Error(`camada "${a.camada}" não existe; há: ${cs.map(c => c.nome).join(', ')}`); return c; }
        return cs.find(c => c.id === VK.camadaAtiva && !c.trava) || cs.filter(c => !c.trava && c.visivel !== false).pop() || cs[cs.length - 1];
    };
    const estiloPadrao = (o, a) => {
        if (o.tipo !== 'imagem') {
            o.preench = 'preench' in a ? vkCorDe(a.preench) : (o.tipo === 'texto' ? { k: 'cmyk', v: [0, 0, 0, 100] } : vkClone(VK.preench));
            const tc = 'traco' in a ? vkCorDe(a.traco) : (o.tipo === 'texto' || 'preench' in a ? null : (VK.traco ? vkClone(VK.traco) : null));   // deu só o preenchimento = sem traço
            o.traco = tc ? { cor: tc, larg: a.espessura != null ? +a.espessura : 1, cap: 'butt', junc: 'miter', miter: 4, tracejado: [], fase: 0 } : null;
        }
        if (a.nome) o.nome = a.nome;
        if (a.opacidade != null) o.op = +a.opacidade / 100;
    };
    const inserir = (o, a) => {
        const cam = camadaAlvo(a);
        if (cam.trava) throw new Error(`camada "${cam.nome}" está travada`);
        cam.itens.push(o); VK.sel = [o.id];
        return o;
    };
    // "Arial Bold" (família + estilo juntos, como agentes e PDFs costumam mandar) → fam "Arial", estilo "Bold"
    const fonteNorm = (fam, estilo) => {
        const E = (typeof IE !== 'undefined' && IE.estilos) || null;
        if (!fam || !E || E[fam]) return [fam, estilo];
        const achado = Object.keys(E).find(k => k.toLowerCase() === String(fam).toLowerCase());
        if (achado) return [achado, estilo];
        const p = String(fam).split(/\s+/);
        for (let i = p.length - 1; i > 0; i--) {
            const base = Object.keys(E).find(k => k.toLowerCase() === p.slice(0, i).join(' ').toLowerCase()), est = p.slice(i).join(' ');
            if (base) { const e = E[base].find(x => x.estilo.toLowerCase() === est.toLowerCase()); return [base, e ? e.estilo : (estilo || 'Regular')]; }
        }
        return [fam, estilo];
    };    window.vkFonteNorm = fonteNorm;

    const res = o => ({ id: o.id, tipo: o.tipo, ...(o.nome ? { nome: o.nome } : {}), caixa_mm: vkCaixaMM(o) });

    vkRegistrar('ajuda', 'ajuda', () => Object.fromEntries(Object.entries(VK_CMDS).map(([k, v]) => [k, v.desc])), true);
    // ── documento ──
    vkRegistrar('novo', 'novo documento', a => {
        VK.doc = vkDocVazio(a); VK.path = null; VK.hist = []; VK.futuro = []; VK.sel = []; VK.ativa = VK.doc.pranchetas[0].id;
        VK.camadaAtiva = VK.doc.camadas[0].id; VK._antes = null; VK.relatorio = [];
        setTimeout(() => vkEnquadrar(), 0);
        return { pranchetas: VK.doc.pranchetas.map(p => p.nome), larg_mm: vkR(vkMM(VK.doc.pranchetas[0].w)), alt_mm: vkR(vkMM(VK.doc.pranchetas[0].h)) };
    });
    vkRegistrar('documento', 'propriedades do documento', a => {
        if (a.nome) VK.doc.nome = a.nome;
        if (a.sangria != null) VK.doc.sangria = vkPT(+a.sangria);
        if (a.perfil) { VK.doc.perfil = a.perfil; VK.corTela.clear(); }
        if (a.modoCor) VK.doc.modoCor = a.modoCor;
        return { nome: VK.doc.nome, sangria_mm: vkR(vkMM(VK.doc.sangria)), perfil: VK.doc.perfil, modoCor: VK.doc.modoCor };
    });
    // ── criar ──
    vkRegistrar('retangulo', 'retângulo', a => {
        const c = conv(a), o = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkRetSubs(c.X(a.x), c.Y(a.y), c.D(a.larg), c.D(a.alt), c.D(a.raio || 0)) };
        estiloPadrao(o, a); return res(inserir(o, a));
    });
    vkRegistrar('elipse', 'elipse', a => {
        const c = conv(a), w = c.D(a.larg), h = c.D(a.alt ?? a.larg);
        const o = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkElipseSubs(c.X(a.x) + w / 2, c.Y(a.y) + h / 2, w / 2, h / 2) };
        estiloPadrao(o, a); return res(inserir(o, a));
    });
    vkRegistrar('poligono', 'polígono', a => {
        const c = conv(a), o = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkPoligonoSubs(c.X(a.cx), c.Y(a.cy), c.D(a.raio), Math.max(3, a.lados || 6)) };
        estiloPadrao(o, a); return res(inserir(o, a));
    });
    vkRegistrar('estrela', 'estrela', a => {
        const c = conv(a), r = c.D(a.raio), o = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: vkPoligonoSubs(c.X(a.cx), c.Y(a.cy), r, Math.max(3, a.pontas || 5), a.raio2 != null ? c.D(a.raio2) : r * 0.45) };
        estiloPadrao(o, a); return res(inserir(o, a));
    });
    vkRegistrar('linha', 'linha', a => {
        const c = conv(a), o = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: [{ fechado: false, pts: [vkPt(c.X(a.x1), c.Y(a.y1)), vkPt(c.X(a.x2), c.Y(a.y2))] }] };
        estiloPadrao(o, { preench: null, traco: a.traco ?? (VK.traco ? VK.traco : '100K'), ...a, preench: null }); return res(inserir(o, a));
    });
    vkRegistrar('caminho', 'caminho', a => {   // d = caminho SVG em mm (ou pt com un:'pt') relativo à prancheta; ou subs prontos
        const c = conv(a);
        let subs = a.subs ? vkClone(a.subs) : vkSvgD(a.d);
        if (!subs.length) throw new Error('caminho vazio: d precisa de M x y ... (ex. "M0 0 L50 0 L25 40 Z")');
        if (!a.subs) subs = subs.map(s => ({ fechado: s.fechado, pts: s.pts.map(p => [c.X(p[0]), c.Y(p[1]), c.X(p[2]), c.Y(p[3]), c.X(p[4]), c.Y(p[5])]) }));
        const o = { id: vkId(), tipo: 'caminho', regra: a.regra || 'nonzero', subs }; estiloPadrao(o, a); return res(inserir(o, a));
    });
    vkRegistrar('texto', 'texto', async a => {
        const c = conv(a);
        const [fam, est] = fonteNorm(a.fonte || a.fam || 'Arial', a.estilo);
        const o = { id: vkId(), tipo: 'texto', conteudo: String(a.conteudo ?? 'Texto'), fam, estilo: est || 'Regular',
            tam: +(a.tamanho || a.tam || 12), entrelinha: a.entrelinha ? +a.entrelinha : null, track: +(a.track || 0), alin: a.alin || 'esq',
            caixa: a.caixa != null ? c.D(a.caixa) : null, m: [1, 0, 0, 1, c.X(a.x), c.Y(a.y)] };
        estiloPadrao(o, { preench: '100K', traco: null, ...a });
        const extra = {};   // caractere/parágrafo/altura (vetor-texto.js)
        for (const k of ['desl', 'deslocamento_base', 'escala_h', 'escala_v', 'maius', 'caixa_alta', 'versalete', 'pos', 'liga', 'ligaduras', 'frac', 'fracoes', 'num', 'numerais',
            'recuo_esq', 'recuo_dir', 'recuo_1a', 'antes', 'depois', 'hifen', 'hifenizar', 'estilo_paragrafo', 'altura', 'caixa_alt']) if (a[k] !== undefined) extra[k] = a[k];
        if (Object.keys(extra).length) vkTxAplicar(o, { un: a.un, ...extra });
        inserir(o, a);
        const g = await vkGeoPronta(o);
        return { ...res(o), fonte_encontrada: g ? g.achou : null, linhas: g ? g.linhas.length : null };
    });
    vkRegistrar('imagem', 'colocar imagem', async a => {
        const api = vkApi(); const r = await api.vk_imagem_info(a.arquivo);
        if (!r || !r.success) throw new Error('não abriu a imagem: ' + a.arquivo);
        const iid = vkId('i'); VK.doc.imagens[iid] = { arquivo: r.arquivo, w: r.w, h: r.h, modo: r.modo, url: r.url, nome: r.nome, alfa: r.alfa };
        const c = conv(a);
        let s = 72 / (r.ppi || 72);
        if (a.larg) s = c.D(a.larg) / r.w; else if (a.alt) s = c.D(a.alt) / r.h;
        const o = { id: vkId(), tipo: 'imagem', img: iid, m: [s, 0, 0, s, c.X(a.x || 0), c.Y(a.y || 0)] };
        if (a.nome) o.nome = a.nome;
        inserir(o, a);
        return { ...res(o), ppi_efetivo: Math.round(72 / s), modo: r.modo };
    });
    // ── alterar ──
    vkRegistrar('alterar', 'alterar', async a => {
        const objs = alvos(a), feitos = [];
        for (const o of objs) {
            const apl = f => { if (o.tipo === 'grupo' && !o.clip) o.itens.forEach(f); else f(o); };
            const soTrecho = o.tipo === 'texto' && (a.faixa || a.trecho);   // cor só no trecho: vkTxAplicar
            if ('preench' in a && !soTrecho) { const c = vkCorDe(a.preench); apl(x => { if (x.tipo !== 'imagem') x.preench = vkClone(c); }); }
            if ('traco' in a && !soTrecho) { const c = vkCorDe(a.traco); apl(x => { if (x.tipo === 'imagem') return; x.traco = c ? { cap: 'butt', junc: 'miter', miter: 4, tracejado: [], fase: 0, larg: 1, ...(x.traco || {}), cor: vkClone(c) } : null; }); }
            if (a.espessura != null) apl(x => { if (x.traco) x.traco = { ...x.traco, larg: +a.espessura }; });
            for (const k of ['cap', 'junc', 'miter', 'tracejado']) if (a[k] != null) apl(x => { if (x.traco) x.traco = { ...x.traco, [k]: k === 'miter' ? +a[k] : a[k] }; });
            vkDsAlterar(a, apl);   // perfil de largura e setas (vetor-desenho.js)
            if (a.opacidade != null) o.op = Math.max(0, Math.min(1, +a.opacidade / 100));
            if (a.mesclagem) o.bm = a.mesclagem;
            if (a.sobreimprimir != null) { const v = !!a.sobreimprimir; apl(x => { x.sobre = { p: v && !!x.preench, t: v && !!x.traco }; }); }
            if (a.nome != null) o.nome = a.nome;
            if (a.visivel != null) o.visivel = !!a.visivel;
            if (a.trava != null) o.trava = !!a.trava;
            if (a.regra) o.regra = a.regra;
            if (o.tipo === 'texto') {   // caractere (texto inteiro ou faixa/trecho), parágrafo, caixa: vetor-texto.js
                if (a.conteudo != null) { const r = vkTxRaiz(o); vkTxRemap(r, String(r.conteudo), String(a.conteudo)); }
                vkTxAplicar(o, a);
                await vkGeoPronta(o);
            }
            feitos.push(o.id);
        }
        return { alterados: feitos.length };
    });
    // ── transformar (origem: centro da seleção, ou ox/oy) ──
    const origem = (objs, a) => { if (a.ox != null) { const c = conv(a); return [c.X(a.ox), c.Y(a.oy)]; } const b = vkBoxUniao(objs); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
    const aplicar = (objs, M) => { objs.forEach(o => vkTransformar(o, M)); return { caixa_mm: vkCaixaMM(objs.length === 1 ? objs[0] : { tipo: 'grupo', itens: objs }) }; };
    vkRegistrar('mover', 'mover', a => { const objs = alvos(a), c = conv(a); return aplicar(objs, [1, 0, 0, 1, c.D(a.dx || 0), c.D(a.dy || 0)]); });
    vkRegistrar('posicionar', 'posicionar', a => {   // canto superior esquerdo da caixa em (x, y)
        const objs = alvos(a), c = conv(a), b = vkBoxUniao(objs);
        return aplicar(objs, [1, 0, 0, 1, a.x != null ? c.X(a.x) - b[0] : 0, a.y != null ? c.Y(a.y) - b[1] : 0]);
    });
    vkRegistrar('redimensionar', 'redimensionar', a => {   // larg/alt em mm (proporcional se só um), ou escala %
        const objs = alvos(a), c = conv(a), b = vkBoxUniao(objs);
        let sx = a.escala != null ? a.escala / 100 : a.sx != null ? a.sx / 100 : null, sy = a.escala != null ? a.escala / 100 : a.sy != null ? a.sy / 100 : null;
        if (a.larg != null) sx = c.D(a.larg) / (b[2] - b[0] || 1);
        if (a.alt != null) sy = c.D(a.alt) / (b[3] - b[1] || 1);
        if (sx == null) sx = sy; if (sy == null) sy = sx;
        const [ox, oy] = a.ox != null ? origem(objs, a) : (a.ancora === 'topo-esq' ? [b[0], b[1]] : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
        return aplicar(objs, [sx, 0, 0, sy, ox - sx * ox, oy - sy * oy]);
    });
    vkRegistrar('girar', 'girar', a => {
        const objs = alvos(a), [ox, oy] = origem(objs, a), r = -(+a.graus || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        return aplicar(objs, vkMul(vkMul([1, 0, 0, 1, -ox, -oy], [cs, sn, -sn, cs, 0, 0]), [1, 0, 0, 1, ox, oy]));
    });
    vkRegistrar('refletir', 'refletir', a => {
        const objs = alvos(a), [ox, oy] = origem(objs, a), h = a.eixo !== 'horizontal';
        return aplicar(objs, vkMul(vkMul([1, 0, 0, 1, -ox, -oy], [h ? -1 : 1, 0, 0, h ? 1 : -1, 0, 0]), [1, 0, 0, 1, ox, oy]));
    });
    vkRegistrar('matriz', 'transformar', a => aplicar(alvos(a), a.m), false);
    // ── alinhar e distribuir ──
    vkRegistrar('alinhar', 'alinhar', a => {
        const objs = alvos(a); const modo = a.modo;
        let ref;
        if (a.relativo === 'prancheta' || objs.length === 1) { const p = prancheta(a); ref = [p.x, p.y, p.x + p.w, p.y + p.h]; }
        else ref = vkBoxUniao(objs);
        for (const o of objs) {
            const b = vkBox(o); let dx = 0, dy = 0;
            if (modo === 'esquerda') dx = ref[0] - b[0]; else if (modo === 'direita') dx = ref[2] - b[2]; else if (modo === 'centro_h') dx = (ref[0] + ref[2]) / 2 - (b[0] + b[2]) / 2;
            else if (modo === 'topo') dy = ref[1] - b[1]; else if (modo === 'base') dy = ref[3] - b[3]; else if (modo === 'centro_v') dy = (ref[1] + ref[3]) / 2 - (b[1] + b[3]) / 2;
            else throw new Error('modo: esquerda, centro_h, direita, topo, centro_v, base');
            vkTransformar(o, [1, 0, 0, 1, dx, dy]);
        }
        return { alinhados: objs.length };
    });
    vkRegistrar('distribuir', 'distribuir', a => {
        const objs = alvos(a); if (objs.length < 3) throw new Error('distribuir precisa de 3 objetos ou mais');
        const h = a.eixo !== 'vertical', bx = objs.map(o => [o, vkBox(o)]).sort((p, q) => h ? p[1][0] - q[1][0] : p[1][1] - q[1][1]);
        const ini = h ? bx[0][1][0] : bx[0][1][1], fim = h ? bx.at(-1)[1][2] : bx.at(-1)[1][3];
        const soma = bx.reduce((s, [, b]) => s + (h ? b[2] - b[0] : b[3] - b[1]), 0), esp = (fim - ini - soma) / (bx.length - 1);
        let pos = ini;
        for (const [o, b] of bx) { const d = pos - (h ? b[0] : b[1]); vkTransformar(o, h ? [1, 0, 0, 1, d, 0] : [1, 0, 0, 1, 0, d]); pos += (h ? b[2] - b[0] : b[3] - b[1]) + esp; }
        return { espaco_mm: vkR(vkMM(esp)) };
    });
    // ── organizar, agrupar, máscara, Pathfinder ──
    vkRegistrar('organizar', 'organizar', a => {
        for (const o of alvos(a)) {
            const l = vkListaDe(o.id), i = l.indexOf(o); l.splice(i, 1);
            const j = { frente: l.length, tras: 0, acima: Math.min(l.length, i + 1), abaixo: Math.max(0, i - 1) }[a.modo];
            if (j == null) throw new Error('modo: frente, tras, acima, abaixo');
            l.splice(j, 0, o);
        }
        return { ok: true };
    });
    const tirar = objs => { const lst = objs.map(o => vkListaDe(o.id)); objs.forEach((o, k) => lst[k].splice(lst[k].indexOf(o), 1)); };
    const ordenados = objs => { const ordem = vkTodos().map(x => x.o); return [...objs].sort((p, q) => ordem.indexOf(p) - ordem.indexOf(q)); };
    vkRegistrar('agrupar', 'agrupar', a => {
        const objs = ordenados(alvos(a)), lista = vkListaDe(objs.at(-1).id), pos = lista.indexOf(objs.at(-1));
        const g = { id: vkId(), tipo: 'grupo', itens: [], ...(a.nome ? { nome: a.nome } : {}) };
        lista.splice(pos + 1, 0, g); tirar(objs); g.itens = objs; VK.sel = [g.id];
        return res(g);
    });
    vkRegistrar('desagrupar', 'desagrupar', a => {
        const novos = [];
        for (const g of alvos(a)) {
            if (g.tipo !== 'grupo') continue;
            const l = vkListaDe(g.id), i = l.indexOf(g);
            const itens = g.clip ? g.itens.slice(1) : g.itens;
            l.splice(i, 1, ...itens); novos.push(...itens.map(o => o.id));
        }
        VK.sel = novos; return { soltos: novos.length };
    });
    vkRegistrar('mascara', 'criar máscara de corte', a => {   // o de CIMA corta os de baixo (Ctrl+7)
        const objs = ordenados(alvos(a)); if (objs.length < 2) throw new Error('máscara: selecione 2+ objetos (o de cima vira o corte)');
        const topo = objs.at(-1); if (topo.tipo !== 'caminho') throw new Error('o objeto de cima tem que ser um caminho/forma');
        const lista = vkListaDe(topo.id), pos = lista.indexOf(topo);
        const g = { id: vkId(), tipo: 'grupo', clip: true, itens: [] };
        lista.splice(pos + 1, 0, g); tirar(objs);
        g.itens = [{ ...topo, preench: null, traco: null }, ...objs.slice(0, -1)]; VK.sel = [g.id];
        return res(g);
    });
    vkRegistrar('soltar_mascara', 'soltar máscara', a => {
        for (const g of alvos(a)) { if (g.tipo !== 'grupo' || !g.clip) continue; const l = vkListaDe(g.id); l.splice(l.indexOf(g), 1, ...g.itens); }
        return { ok: true };
    });
    vkRegistrar('composto', 'criar caminho composto', a => {   // Ctrl+8: furos (regra par-ímpar)
        const objs = ordenados(alvos(a)).filter(o => o.tipo === 'caminho'); if (objs.length < 2) throw new Error('caminho composto: 2+ caminhos');
        const base = objs[0]; base.subs = objs.flatMap(o => o.subs); base.regra = 'evenodd';
        tirar(objs.slice(1)); VK.sel = [base.id]; return res(base);
    });
    vkRegistrar('pathfinder', 'Pathfinder', async a => {   // op: unir, subtrair, intersecao, excluir
        const objs = ordenados(alvos(a)).filter(o => o.tipo === 'caminho' || o.tipo === 'texto');
        if (objs.length < 2) throw new Error('Pathfinder: selecione 2+ formas');
        const formas = [];
        for (const o of objs) {
            if (o.tipo === 'texto') { const g = await vkGeoPronta(o); formas.push({ subs: g.subs.map(s => ({ fechado: true, pts: s.pts.map(p => [...vkAp(o.m, p[0], p[1]), ...vkAp(o.m, p[2], p[3]), ...vkAp(o.m, p[4], p[5])]) })), regra: 'nonzero' }); }
            else formas.push({ subs: o.subs, regra: o.regra || 'nonzero' });
        }
        const r = await vkApi().vk_booleana(a.op, formas);
        const base = objs[a.op === 'subtrair' ? 0 : objs.length - 1];
        const novo = { id: vkId(), tipo: 'caminho', regra: 'nonzero', subs: r.subs, preench: vkClone(base.preench || objs[0].preench || null), traco: base.traco ? vkClone(base.traco) : null, ...(base.op != null ? { op: base.op } : {}) };
        const lista = vkListaDe(objs.at(-1).id); lista.splice(lista.indexOf(objs.at(-1)) + 1, 0, novo); tirar(objs);
        VK.sel = [novo.id]; return res(novo);
    });
    const formaDe = async o => o.tipo === 'texto'
        ? { subs: (await vkGeoPronta(o)).subs.map(s => ({ fechado: true, pts: s.pts.map(p => [...vkAp(o.m, p[0], p[1]), ...vkAp(o.m, p[2], p[3]), ...vkAp(o.m, p[4], p[5])]) })), regra: 'nonzero' }
        : { subs: o.subs, regra: o.regra || 'nonzero' };
    vkRegistrar('deslocar', 'deslocar caminho', async a => {   // distancia (mm; + fora, − dentro), junc: miter|round|bevel, miter
        const objs = alvos(a).filter(o => o.tipo === 'caminho' || o.tipo === 'texto'); if (!objs.length) throw new Error('deslocar: selecione formas ou textos');
        const d = conv(a).D(a.distancia ?? 1);
        const r = await vkApi().vk_deslocar(await Promise.all(objs.map(formaDe)), d, a.junc || 'miter', a.miter || 4);
        const ids = [];
        objs.forEach((o, k) => {   // fora: atrás do original (como no Illustrator); dentro: na frente, senão some sob o preenchimento
            if (!r[k].subs.length) return;
            const novo = { id: vkId(), tipo: 'caminho', nome: a.nome || ((o.nome || o.tipo) + ' deslocado'), regra: 'nonzero', subs: r[k].subs,
                preench: vkClone(o.preench || null), traco: o.traco ? vkClone(o.traco) : null, ...(o.op != null ? { op: o.op } : {}) };
            if ('preench' in a) novo.preench = vkCorDe(a.preench);
            const l = vkListaDe(o.id); l.splice(l.indexOf(o) + (d < 0 ? 1 : 0), 0, novo); ids.push(novo.id);
        });
        VK.sel = ids; return { ids, distancia_pt: d };
    });
    vkRegistrar('contornar_traco', 'contornar traço', async a => {   // traço → forma preenchida (com preenchimento: grupo [preench, traço])
        const objs = alvos(a).filter(o => (o.tipo === 'caminho' || o.tipo === 'texto') && o.traco && o.traco.cor && o.traco.larg > 0);
        if (!objs.length) throw new Error('contornar traço: nenhum objeto com traço na seleção');
        const r = await vkApi().vk_contornar_traco(await Promise.all(objs.map(async o => ({ ...(await formaDe(o)), traco: o.traco }))));
        const ids = [];
        objs.forEach((o, k) => {
            const t = o.traco, sobre = o.sobre && o.sobre.t ? { p: true } : null;
            const borda = { id: vkId(), tipo: 'caminho', nome: (o.nome || o.tipo) + ' traço', regra: 'nonzero', subs: r[k].subs, preench: vkClone(t.cor), traco: null,
                ...(o.op != null ? { op: o.op } : {}), ...(o.bm ? { bm: o.bm } : {}), ...(sobre ? { sobre } : {}) };
            const l = vkListaDe(o.id), pos = l.indexOf(o);
            if (o.preench) {
                const fundo = o.tipo === 'texto' ? { ...o, id: vkId(), traco: null } : { ...o, id: vkId(), traco: null, sobre: o.sobre ? { p: !!o.sobre.p } : undefined };
                const g = { id: vkId(), tipo: 'grupo', nome: o.nome, itens: [fundo, borda] }; l.splice(pos, 1, g); ids.push(g.id);
            } else { borda.nome = o.nome || borda.nome; l.splice(pos, 1, borda); ids.push(borda.id); }
        });
        VK.sel = ids; return { ids };
    });
    vkRegistrar('contornos', 'criar contornos', async a => {   // texto → curvas (Ctrl+Shift+O)
        const ids = [];
        for (const o of alvos(a)) {
            if (o.tipo !== 'texto') continue;
            const g = await vkGeoPronta(o), l = vkListaDe(o.id);
            const p = { id: vkId(), tipo: 'caminho', nome: o.nome || o.conteudo.slice(0, 24), regra: 'nonzero', subs: g.subs.map(s => ({ fechado: s.fechado, pts: s.pts.map(q => [...vkAp(o.m, q[0], q[1]), ...vkAp(o.m, q[2], q[3]), ...vkAp(o.m, q[4], q[5])]) })),
                preench: o.preench, traco: o.traco, ...(o.op != null ? { op: o.op } : {}), ...(o.sobre ? { sobre: o.sobre } : {}) };
            l.splice(l.indexOf(o), 1, p); ids.push(p.id);
        }
        VK.sel = ids; return { convertidos: ids.length };
    });
    vkRegistrar('duplicar', 'duplicar', a => {
        const novos = [];
        const reid = o => { o.id = vkId(); if (o.itens) o.itens.forEach(reid); return o; };
        for (const o of ordenados(alvos(a))) {
            const c = reid(vkClone(o)), l = vkListaDe(o.id); l.splice(l.indexOf(o) + 1, 0, c);
            if (a.dx || a.dy) { const cv = conv(a); vkTransformar(c, [1, 0, 0, 1, cv.D(a.dx || 0), cv.D(a.dy || 0)]); }
            novos.push(c.id);
        }
        VK.sel = novos; return { ids: novos };
    });
    vkRegistrar('apagar', 'apagar', a => { const objs = alvos(a); vkTxAntesDeApagar(objs); tirar(objs); VK.sel = VK.sel.filter(id => vkObj(id)); return { apagados: objs.length }; });
    vkRegistrar('selecionar', 'selecionar', a => { VK.sel = a.tudo ? vkTodosDaCamada() : alvos(a).map(o => o.id); return { sel: VK.sel.length }; }, true);
    vkRegistrar('mover_para_camada', 'mover para camada', a => { const objs = alvos(a), cam = camadaAlvo(a); tirar(objs); cam.itens.push(...objs); return { camada: cam.nome }; });
    // ── camadas ──
    vkRegistrar('nova_camada', 'nova camada', a => { const c = { id: vkId('c'), nome: a.nome || `Camada ${VK.doc.camadas.length + 1}`, visivel: true, trava: false, itens: [] }; VK.doc.camadas.push(c); VK.camadaAtiva = c.id; return { id: c.id, nome: c.nome }; });
    vkRegistrar('camada', 'alterar camada', a => {
        const c = camadaAlvo(a);
        for (const k of ['visivel', 'trava', 'imprimir']) if (a[k] != null) c[k] = !!a[k];
        if (a.novo_nome) c.nome = a.novo_nome;
        if (a.posicao != null) { const cs = VK.doc.camadas; cs.splice(cs.indexOf(c), 1); cs.splice(Math.max(0, Math.min(cs.length, +a.posicao)), 0, c); }
        if (a.apagar) { if (VK.doc.camadas.length < 2) throw new Error('o documento precisa de 1 camada'); VK.doc.camadas.splice(VK.doc.camadas.indexOf(c), 1); }
        if (a.ativar) VK.camadaAtiva = c.id;
        return { camada: c.nome };
    });
    // ── pranchetas ──
    vkRegistrar('nova_prancheta', 'nova prancheta', a => {
        const ps = VK.doc.pranchetas, ult = ps.reduce((m, p) => Math.max(m, p.x + p.w), -36);
        const [w, h] = a.preset && VK_PRESETS[a.preset] ? VK_PRESETS[a.preset] : [a.larg || vkMM(ps[0].w), a.alt || vkMM(ps[0].h)];
        const p = { id: vkId('p'), nome: a.nome || `Prancheta ${ps.length + 1}`, x: a.x != null ? vkPT(a.x) : ult + 36, y: a.y != null ? vkPT(a.y) : 0, w: vkPT(w), h: vkPT(h) };
        ps.push(p); VK.ativa = p.id; return { id: p.id, nome: p.nome };
    });
    vkRegistrar('prancheta', 'alterar prancheta', a => {
        const p = prancheta(a);
        if (a.novo_nome) p.nome = a.novo_nome;
        if (a.larg) p.w = vkPT(+a.larg); if (a.alt) p.h = vkPT(+a.alt);
        if (a.preset && VK_PRESETS[a.preset]) { p.w = vkPT(VK_PRESETS[a.preset][0]); p.h = vkPT(VK_PRESETS[a.preset][1]); }
        if (a.ativar) VK.ativa = p.id;
        if (a.apagar) { if (VK.doc.pranchetas.length < 2) throw new Error('o documento precisa de 1 prancheta'); VK.doc.pranchetas.splice(VK.doc.pranchetas.indexOf(p), 1); VK.ativa = VK.doc.pranchetas[0].id; }
        return { prancheta: p.nome, larg_mm: vkR(vkMM(p.w)), alt_mm: vkR(vkMM(p.h)) };
    });
    // ── amostras ──
    vkRegistrar('amostra', 'nova amostra', a => {
        const cor = vkCorDe(a.cor); if (!cor) throw new Error('cor vazia');
        if (a.especial || a.spot) { const v = cor.k === 'cmyk' ? cor.v : cor.k === 'spot' ? cor.v : [0, 0, 0, 100]; Object.assign(cor, { k: 'spot', nome: a.nome, v, tint: 100 }); }
        const am = { id: vkId('a'), nome: a.nome || vkCorTexto(cor), cor }; VK.doc.amostras.push(am); return { id: am.id, nome: am.nome };
    });
    vkRegistrar('cores_padrao', 'cor de preenchimento/traço atual', a => {
        if ('preench' in a) VK.preench = vkCorDe(a.preench); if ('traco' in a) VK.traco = vkCorDe(a.traco);
        return { preench: vkCorTexto(VK.preench), traco: vkCorTexto(VK.traco) };
    }, true);
    // ── leitura (para o agente entender o documento sem print) ──
    vkRegistrar('mapa', 'mapa', a => vkMapa(a), true);
    vkRegistrar('info', 'info', a => alvos(a).map(o => vkInfo(o)), true);
})();

function vkTodosDaCamada() { return VK.doc.camadas.filter(c => c.visivel !== false && !c.trava).flatMap(c => c.itens.filter(o => !o.trava && o.visivel !== false).map(o => o.id)); }
function vkCaixaMM(o, p = null) {
    const b = vkBox(o); if (!isFinite(b[0])) return null;
    p = p || VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0];
    return { x: vkR(vkMM(b[0] - p.x)), y: vkR(vkMM(b[1] - p.y)), larg: vkR(vkMM(b[2] - b[0])), alt: vkR(vkMM(b[3] - b[1])) };
}
function vkInfo(o) {
    const r = { id: o.id, tipo: o.tipo, ...(o.nome ? { nome: o.nome } : {}), caixa_mm: vkCaixaMM(o) };
    if (o.preench !== undefined && o.tipo !== 'grupo') r.preench = vkCorTexto(o.preench);
    if (o.traco) r.traco = `${vkCorTexto(o.traco.cor)} ${vkR(o.traco.larg, 2)} pt`;
    if (o.op != null && o.op < 1) r.opacidade = Math.round(o.op * 100);
    if (o.bm) r.mesclagem = o.bm;
    if (o.sobre && (o.sobre.p || o.sobre.t)) r.sobreimprimir = true;
    if (o.tipo === 'texto') {
        const rz = vkTxRaiz(o), sp = vkTxSpec(o), g = vkGeo(o);
        Object.assign(r, { conteudo: sp ? sp.conteudo : o.conteudo, fonte: `${rz.fam} ${rz.estilo}`, tamanho: rz.tam, ...(o.caixa ? { largura_caixa_mm: vkR(vkMM(o.caixa)) } : {}),
            ...(o.caixa_alt ? { altura_caixa_mm: vkR(vkMM(o.caixa_alt)) } : {}), ...(rz.alin && rz.alin !== 'esq' ? { alin: rz.alin } : {}), ...(rz.ep ? { estilo_paragrafo: rz.ep } : {}),
            ...(rz.trechos ? { trechos: rz.trechos.map(t => ({ texto: String(rz.conteudo).slice(t.ini, t.fim), ...Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'ini' && k !== 'fim').map(([k, v]) => [k, k === 'preench' ? vkCorTexto(v) : k === 'traco' ? (v ? vkCorTexto(v.cor) : 'nenhum') : v])) })) } : {}),
            ...(o.trilha ? { em_caminho: true } : {}), ...(o.anterior ? { continua_de: o.anterior } : {}), ...(o.seguinte ? { continua_em: o.seguinte } : {}), ...(g && g.transborda ? { transborda: true } : {}) });
    }
    if (o.tipo === 'imagem') { const im = VK.doc.imagens[o.img] || {}; r.arquivo = im.nome; r.ppi = Math.round(72 / vkEsc(o.m)); r.modo = im.modo; }
    if (o.tipo === 'grupo') { r.itens = o.itens.length; if (o.clip) r.mascara = true; }
    if (o.aparencia) r.aparencia = o.aparencia.map(l => `${l.tipo} ${vkCorTexto(l.cor)}${l.tipo === 'traco' ? ' ' + vkR(l.larg ?? 1, 2) + ' pt' : ''}${l.desloc ? ' desl ' + vkR(vkMM(l.desloc)) + ' mm' : ''}`);
    if (o.efeitos) r.efeitos = o.efeitos.map(e => e.tipo + (e.visivel === false ? ' (oculto)' : ''));
    if (o.trava) r.travado = true; if (o.visivel === false) r.oculto = true;
    return r;
}
function vkMapa(a = {}) {   // resumo compacto: o agente lê isto em vez de olhar print
    const d = VK.doc, p = d.pranchetas.find(q => q.id === VK.ativa) || d.pranchetas[0];
    const prof = a.profundidade ?? 1;
    const lin = (o, n) => { const i = vkInfo(o); const s = [{ ...i, ...(n ? { nivel: n } : {}) }]; if (o.tipo === 'grupo' && n < prof) o.itens.forEach(f => s.push(...lin(f, n + 1))); return s; };
    return {
        documento: d.nome, modoCor: d.modoCor, perfil: d.perfil, sangria_mm: vkR(vkMM(d.sangria)),
        pranchetas: d.pranchetas.map(q => ({ nome: q.nome, larg_mm: vkR(vkMM(q.w)), alt_mm: vkR(vkMM(q.h)), ativa: q.id === p.id })),
        camadas: [...d.camadas].reverse().map(c => ({ nome: c.nome, ...(c.visivel === false ? { oculta: true } : {}), ...(c.trava ? { travada: true } : {}),
            objetos: [...c.itens].reverse().flatMap(o => lin(o, 0)).slice(0, a.max || 80) })),
        selecao: VK.sel,
    };
}
// ─────────────────────────── window.VKN: porta para o Claude/Worker ───────────────────────────
window.VKN = {
    cmd: (nome, args, origem = 'claude') => vkCmd(nome, args, origem),
    comandos: () => Object.fromEntries(Object.entries(VK_CMDS).map(([k, v]) => [k, v.desc])),
    mapa: a => vkMapa(a || {}),
    fechamento: o => vkFechamento(o || {}),
    abrir: c => vkCmd('abrir', { caminho: c }, 'claude'),
    salvar: c => vkCmd('salvar', { caminho: c }, 'claude'),
    exportarPdf: (c, op) => vkCmd('exportar_pdf', { caminho: c, ...(op || {}) }, 'claude'),
    exportarImagem: (c, op) => vkCmd('exportar_imagem', { caminho: c, ...(op || {}) }, 'claude'),
    empacotar: (pasta, op) => vkCmd('empacotar', { pasta, ...(op || {}) }, 'claude'),
    log: n => VK.log.slice(-(n || 20)),
    estado: () => ({ aberto: !!VK.doc, caminho: VK.path, sujo: VK.sujo, ferramenta: VK.ferr, selecao: VK.sel.length, relatorio: VK.relatorio }),
};
