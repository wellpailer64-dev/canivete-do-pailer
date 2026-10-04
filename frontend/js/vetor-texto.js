// Vetor Kanivete — TEXTO estilo Illustrator: caractere por trecho (estilos de caractere), parágrafo (recuos, espaços),
// caixa de área com altura (texto sobrando = + vermelho) e ENCADEAMENTO entre caixas, TEXTO EM CAMINHO, estilos nomeados
// de parágrafo/caractere, Glifos e "juntar textos" (o .ai/PDF importado vem linha a linha).
// A geometria é do Python (texto_geometria: tela = PDF); aqui ficam o modelo, os comandos, o painel e a sobreposição.
// Modelo no objeto texto (além do básico): trechos:[{ini,fim,<caractere>,preench,traco,ec}] (índices no conteúdo, sem
// sobreposição), ep (estilo de parágrafo), anterior/seguinte (ids, encadeado: o texto mora na 1ª caixa = raiz),
// caixa_alt (pt), trilha:{subs (pt), ini (pt), lado}; doc.estilosTexto = {par:{nome:{...}}, car:{nome:{...}}}.
const VK_TX_CAR = ['fam', 'estilo', 'tam', 'track', 'desl', 'eh', 'ev', 'maius', 'pos', 'liga', 'frac', 'num', 'preench', 'traco'];
const VK_TX_PAR = ['alin', 'entrelinha', 'recuo_esq', 'recuo_dir', 'recuo_1a', 'antes', 'depois'];
VK_FERR.texto_caminho = { nome: 'Texto em caminho (clique num caminho)', tecla: '', cursor: 'text' };
VK_ICO.texto_caminho = '<path d="M3 17c4-8 8-8 12-4s5 2 6 0"/><path d="M8 4h7M11.5 4v7"/>';

function vkTxRaiz(o) { const f = vkTxFonte(o); return (f && f.raiz) || o; }
function vkTxEstilos() { const d = VK.doc; d.estilosTexto = d.estilosTexto || { par: {}, car: {} }; return d.estilosTexto; }
function vkTxAlvos(a) {
    let ids = a.ids || (a.id ? [a.id] : null);
    if (!ids && a.nomes) ids = [].concat(a.nomes).map(n => { const r = vkTodos().find(x => (x.o.nome || '').toLowerCase() === String(n).toLowerCase()); if (!r) throw new Error(`objeto "${n}" não existe`); return r.o.id; });
    const objs = (ids || VK.sel).map(id => vkObj(id)).filter(Boolean);
    if (!objs.length) throw new Error('nada selecionado (passe ids ou nomes)');
    return objs;
}
const vkTxIgual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const vkTxSemFaixa = t => JSON.stringify(Object.keys(t).filter(k => k !== 'ini' && k !== 'fim').sort().map(k => [k, t[k]]));

// argumentos da API (nomes de agente) → atributos internos. Tipografia em pt; caixa/altura/início da trilha em mm (un:'pt' = pt)
function vkTxArgs(a, trecho) {
    const car = {}, par = {}, D = v => a.un === 'pt' ? +v : vkPT(+v);
    if (a.fonte || a.fam) { const [f, e] = vkFonteNorm(a.fonte || a.fam, a.estilo); car.fam = f; if (e) car.estilo = e; }
    else if (a.estilo) car.estilo = a.estilo;
    if (a.tamanho || a.tam) car.tam = +(a.tamanho || a.tam);
    if (a.track != null) car.track = +a.track;
    for (const [api, k] of [['desl', 'desl'], ['deslocamento_base', 'desl'], ['escala_h', 'eh'], ['eh', 'eh'], ['escala_v', 'ev'], ['ev', 'ev']]) if (a[api] != null) car[k] = +a[api];
    if (a.maius !== undefined) car.maius = ['alta', 'versalete'].includes(a.maius) ? a.maius : '';
    if (a.caixa_alta != null) car.maius = a.caixa_alta ? 'alta' : '';
    if (a.versalete != null) car.maius = a.versalete ? 'versalete' : '';
    if (a.pos !== undefined) car.pos = { sobrescrito: 'sup', sup: 'sup', subscrito: 'sub', sub: 'sub' }[a.pos] || '';
    if (a.liga != null) car.liga = !!a.liga;
    if (a.ligaduras != null) car.liga = !!a.ligaduras;
    if (a.frac != null) car.frac = !!a.frac;
    if (a.fracoes != null) car.frac = !!a.fracoes;
    if (a.num !== undefined) car.num = a.num || '';
    if (a.numerais !== undefined) car.num = { antigo: 'old', alinhados: 'lin', tabulares: 'tab', proporcionais: 'prop' }[a.numerais] || a.numerais || '';
    if (trecho) {
        if ('preench' in a) car.preench = vkCorDe(a.preench);
        if ('traco' in a) { const c = vkCorDe(a.traco); car.traco = c ? { cor: c, larg: a.espessura != null ? +a.espessura : 1 } : null; }
    }
    if (a.alin) par.alin = a.alin === 'justificado' ? 'just' : a.alin;
    if (a.entrelinha !== undefined) par.entrelinha = a.entrelinha ? +a.entrelinha : null;
    for (const k of ['recuo_esq', 'recuo_dir', 'recuo_1a', 'antes', 'depois']) if (a[k] != null) par[k] = +a[k];
    const caixa = {};
    if (a.caixa !== undefined) caixa.caixa = a.caixa ? D(a.caixa) : null;
    if (a.caixa_alt !== undefined) caixa.caixa_alt = a.caixa_alt ? D(a.caixa_alt) : null;
    if (a.altura !== undefined) caixa.caixa_alt = a.altura ? D(a.altura) : null;
    if (a.trilha_ini != null) caixa.trilha_ini = D(a.trilha_ini);
    if (a.lado != null) caixa.lado = !!a.lado;
    return { car, par, caixa };
}
// faixas de caracteres no texto-raiz: faixa [ini, fim] | trecho "palavra" (todas as ocorrências, ou ocorrencia: n)
function vkTxFaixas(r, a) {
    const n = String(r.conteudo).length;
    if (Array.isArray(a.faixa)) { const i = Math.max(0, Math.min(n, +a.faixa[0])), f = Math.max(0, Math.min(n, +a.faixa[1])); return f > i && !(i === 0 && f === n) ? [[i, f]] : null; }
    if (a.trecho == null || a.trecho === '') return null;
    const alvo = String(a.trecho), txt = String(r.conteudo);
    let hay = txt, ag = alvo, out = [];
    if (!txt.includes(alvo)) { hay = txt.toLowerCase(); ag = alvo.toLowerCase(); }
    for (let i = hay.indexOf(ag); i >= 0 && ag; i = hay.indexOf(ag, i + ag.length)) out.push([i, i + ag.length]);
    if (!out.length) throw new Error(`trecho "${alvo}" não está no texto ("${txt.slice(0, 60)}")`);
    if (a.ocorrencia) out = [out[Math.max(0, Math.min(out.length - 1, +a.ocorrencia - 1))]];
    return out;
}
// trechos sem sobreposição, sem o que já é igual ao texto, vizinhos iguais juntos
function vkTxNorm(r) {
    const n = String(r.conteudo).length, T = (r.trechos || []).filter(t => t.fim > t.ini);
    if (!T.length) { delete r.trechos; return; }
    const cs = [...new Set([0, n, ...T.flatMap(t => [Math.max(0, Math.min(n, t.ini)), Math.max(0, Math.min(n, t.fim))])])].sort((x, y) => x - y), out = [];
    for (let i = 0; i < cs.length - 1; i++) {
        const a = cs[i], b = cs[i + 1], p = {};
        for (const t of T) if (t.ini <= a && t.fim >= b) for (const [k, v] of Object.entries(t)) if (k !== 'ini' && k !== 'fim' && v !== undefined) p[k] = v;
        for (const k of Object.keys(p)) {
            if (k === 'ec') continue;
            const base = k === 'liga' ? (r.liga ?? true) : ['maius', 'pos', 'num'].includes(k) ? (r[k] || '') : (r[k] ?? null);
            const val = k === 'liga' ? (p[k] ?? true) : ['maius', 'pos', 'num'].includes(k) ? (p[k] || '') : p[k];
            if (vkTxIgual(base, val)) delete p[k];
        }
        if (!Object.keys(p).some(k => k !== 'ec')) continue;
        const ult = out[out.length - 1];
        if (ult && ult.fim === a && vkTxSemFaixa(ult) === vkTxSemFaixa(p)) ult.fim = b; else out.push({ ini: a, fim: b, ...p });
    }
    if (out.length) r.trechos = out; else delete r.trechos;
}
// conteúdo mudou (edição): os trechos acompanham — o que se digita herda o caractere de antes (como no Illustrator)
function vkTxRemap(r, antes, depois) {   // grava o conteúdo novo em r
    r.conteudo = depois;
    if (!r.trechos || antes === depois) return;
    const la = antes.length, lb = depois.length; let p = 0, s = 0;
    while (p < la && p < lb && antes[p] === depois[p]) p++;
    while (s < la - p && s < lb - p && antes[la - 1 - s] === depois[lb - 1 - s]) s++;
    const d = lb - la, fimA = la - s, fimB = lb - s, troca = fimA > p;
    // trocar um trecho = o novo herda o 1º caractere trocado; inserir = herda o caractere de antes (no início: o 1º)
    const ini = x => x < p ? x : x === p ? (troca || p === 0 ? p : x + d) : x >= fimA ? x + d : fimB;
    const fim = x => x < p ? x : x === p && troca ? p : x >= fimA ? x + d : fimB;
    r.trechos = r.trechos.map(t => ({ ...t, ini: ini(t.ini), fim: fim(t.fim) }));
    vkTxNorm(r);
}
// atributos de caractere na posição i (base + trecho que cobre i)
function vkTxCarEm(r, i) {
    const p = {}; for (const k of VK_TX_CAR) if (r[k] != null) p[k] = r[k];
    const t = (r.trechos || []).find(t => t.ini <= i && t.fim > i); if (t) Object.assign(p, t);
    return p;
}

// aplica atributos de texto (alterar, texto, texto_caminho, estilos). o = a caixa; o texto (caractere/parágrafo) é da raiz
function vkTxAplicar(o, a) {
    const r = vkTxRaiz(o), E = vkTxEstilos();
    const faixas = vkTxFaixas(r, a);
    let { car, par, caixa } = vkTxArgs(a, !!faixas);
    if (a.estilo_paragrafo !== undefined) {
        if (a.estilo_paragrafo) {
            const st = E.par[a.estilo_paragrafo]; if (!st) throw new Error(`estilo de parágrafo "${a.estilo_paragrafo}" não existe; há: ${Object.keys(E.par).join(', ') || 'nenhum'}`);
            for (const k of VK_TX_PAR) if (k in st) par = { [k]: st[k], ...par };
            for (const k of VK_TX_CAR) if (k in st && k !== 'preench' && k !== 'traco') car = { [k]: st[k], ...car };
            if (st.preench && !('preench' in a)) { r.preench = vkClone(st.preench); (r.trechos || []).forEach(t => delete t.preench); }
            r.ep = a.estilo_paragrafo;
        } else delete r.ep;
    }
    if (a.estilo_caractere !== undefined) {
        const st = a.estilo_caractere ? E.car[a.estilo_caractere] : null;
        if (a.estilo_caractere && !st) throw new Error(`estilo de caractere "${a.estilo_caractere}" não existe; há: ${Object.keys(E.car).join(', ') || 'nenhum'}`);
        if (st) { for (const k of VK_TX_CAR) if (k in st) car = { [k]: vkClone(st[k]), ...car }; car.ec = a.estilo_caractere; }
    }
    if (faixas) {
        if (Object.keys(car).length) { r.trechos = r.trechos || []; for (const [i, f] of faixas) r.trechos.push({ ini: i, fim: f, ...vkClone(car) }); vkTxNorm(r); }
    } else {
        const { ec, ...c } = car;
        for (const [k, v] of Object.entries(c)) {
            if (k === 'preench' || k === 'traco') continue;
            if (v === '' || v == null) delete r[k]; else r[k] = v;
            (r.trechos || []).forEach(t => delete t[k]);   // valor do texto inteiro vale para todos os caracteres
        }
        if (a.estilo_caractere !== undefined && !a.estilo_caractere) (r.trechos || []).forEach(t => delete t.ec);
        if ('preench' in a) (r.trechos || []).forEach(t => delete t.preench);
        if ('traco' in a) (r.trechos || []).forEach(t => delete t.traco);
        if (r.trechos) vkTxNorm(r);
    }
    for (const [k, v] of Object.entries(par)) { if (v == null || (v === 0 && k !== 'entrelinha')) delete r[k]; else r[k] = v; }
    if ('alin' in par) r.alin = par.alin;
    if ('entrelinha' in par) r.entrelinha = par.entrelinha;
    if ('caixa' in caixa) { o.caixa = caixa.caixa; if (!o.caixa) delete o.caixa_alt; }
    if ('caixa_alt' in caixa) { if (caixa.caixa_alt && o.caixa) o.caixa_alt = caixa.caixa_alt; else delete o.caixa_alt; }
    if (o.trilha && 'trilha_ini' in caixa) o.trilha.ini = caixa.trilha_ini;
    if (o.trilha && 'lado' in caixa) o.trilha.lado = caixa.lado;
}

// apagar caixa encadeada: a corrente se fecha (o texto continua nas outras); apagar a raiz passa o texto para a seguinte
function vkTxAntesDeApagar(objs) {
    const ids = new Set(objs.map(o => o.id));
    const anda = o => { if (o.tipo === 'texto') desliga(o); (o.itens || []).forEach(anda); };
    const desliga = o => {
        const p = o.anterior && vkObj(o.anterior), s = o.seguinte && vkObj(o.seguinte);
        if (p) p.seguinte = s && !ids.has(s.id) ? s.id : null;
        if (s && !ids.has(s.id)) {
            if (p && !ids.has(p.id)) s.anterior = p.id;
            else if (!o.anterior) {   // era a raiz: o texto passa para a seguinte
                for (const k of ['conteudo', 'trechos', 'ep', ...VK_TX_CAR, ...VK_TX_PAR]) if (o[k] !== undefined) s[k] = vkClone(o[k]);
                delete s.anterior;
            } else delete s.anterior;
        }
    };
    objs.forEach(anda);
}

// spec de cada texto no documento enviado ao Python (exportar/empacotar): o PDF sai igual à tela
async function vkDocPy() {
    await vkGeosProntas();
    const d = vkClone(VK.doc);
    const anda = l => l.forEach(o => { if (o.tipo === 'texto') { const src = vkObj(o.id), sp = src && vkTxSpec(src); if (sp) o._spec = sp; } if (o.itens) anda(o.itens); });
    d.camadas.forEach(c => anda(c.itens));
    if (typeof vkApDocPy === 'function') await vkApDocPy(d);   // Aparência/efeitos: pinturas prontas
    return d;
}

// caixas de uma corrente, a partir da raiz
function vkTxCorrente(o) { const out = []; let x = vkTxRaiz(o), n = 0; while (x && n++ < 60) { out.push(x); const s = x.seguinte && vkObj(x.seguinte); x = s && s.anterior === x.id ? s : null; } return out; }

(() => {
    // ── texto em caminho: o caminho vira a linha do texto (como a ferramenta do Illustrator) ──
    vkRegistrar('texto_caminho', 'texto em caminho', async a => {
        const objs = vkTxAlvos(a), cam = objs.find(o => o.tipo === 'caminho');
        if (!cam) throw new Error('texto_caminho: passe um caminho (ids/nomes): ele vira a linha do texto');
        const [fam, est] = vkFonteNorm(a.fonte || a.fam || (VK.txPadrao && VK.txPadrao.fam) || 'Arial', a.estilo || (VK.txPadrao && VK.txPadrao.estilo));
        const o = { id: vkId(), tipo: 'texto', conteudo: String(a.conteudo ?? 'Texto no caminho'), fam, estilo: est || 'Regular', tam: +(a.tamanho || a.tam || (VK.txPadrao && VK.txPadrao.tam) || 12),
            entrelinha: null, track: 0, alin: a.alin || 'esq', caixa: null, m: [1, 0, 0, 1, 0, 0], trilha: { subs: vkClone(cam.subs), ini: 0, lado: !!a.lado },
            preench: 'preench' in a ? vkCorDe(a.preench) : { k: 'cmyk', v: [0, 0, 0, 100] }, traco: null };
        if (a.ini != null) o.trilha.ini = a.un === 'pt' ? +a.ini : vkPT(+a.ini);
        if (a.nome) o.nome = a.nome;
        const { fonte, fam: _f, estilo, tamanho, tam, preench, traco, conteudo, ...resto } = a;
        vkTxAplicar(o, resto);
        const l = vkListaDe(cam.id);
        if (a.manter_caminho) l.splice(l.indexOf(cam) + 1, 0, o); else l.splice(l.indexOf(cam), 1, o);
        VK.sel = [o.id];
        const g = await vkGeoPronta(o);
        return { id: o.id, tipo: 'texto', transborda: !!(g && g.transborda), caixa_mm: vkCaixaMM(o) };
    });
    // ── encadear: ids na ordem (o texto corre de uma caixa para a seguinte); nova: {x, y} cria a caixa seguinte ali ──
    vkRegistrar('encadear', 'encadear textos', async a => {
        let objs = vkTxAlvos(a).filter(o => o.tipo === 'texto');
        if (a.nova) {
            const src = vkTxCorrente(objs[0]).at(-1), D = v => a.un === 'pt' ? +v : vkPT(+v), p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0];
            if (!src.caixa) throw new Error('encadear: só caixa de texto (área), não texto de ponto');
            const g = await vkGeoPronta(src);
            const n = { id: vkId(), tipo: 'texto', conteudo: '', fam: src.fam, estilo: src.estilo, tam: src.tam, entrelinha: null, track: 0, alin: 'esq', caixa: src.caixa,
                caixa_alt: src.caixa_alt || (g ? g.alt : src.tam * 5), m: [...src.m.slice(0, 4), a.un === 'pt' ? +a.nova.x : p.x + D(a.nova.x), a.un === 'pt' ? +a.nova.y : p.y + D(a.nova.y)], preench: vkClone(src.preench), traco: null };
            const l = vkListaDe(src.id); l.splice(l.indexOf(src) + 1, 0, n);
            objs = [src, n];
        }
        if (objs.length < 2) throw new Error('encadear: escolha 2 ou mais caixas de texto, na ordem (ou nova: {x, y})');
        for (let i = 1; i < objs.length; i++) {
            const pv = vkTxCorrente(objs[i - 1]).at(-1), nx = objs[i];
            if (!pv.caixa || !nx.caixa) throw new Error('encadear: só caixas de texto de área (arraste com a ferramenta Texto)');
            if (vkTxCorrente(nx).includes(pv)) continue;
            if (!pv.caixa_alt) { const g = await vkGeoPronta(pv); pv.caixa_alt = g ? Math.max(g.alt, pv.tam) : pv.tam * 5; }
            if (!nx.caixa_alt) { const g = await vkGeoPronta(nx); nx.caixa_alt = g ? Math.max(g.alt, nx.tam * 3) : nx.tam * 5; }
            const r = vkTxRaiz(pv);
            for (const x of vkTxCorrente(nx)) {   // o texto que estava na outra corrente vai para o fim desta
                if (!x.anterior && String(x.conteudo).trim()) {
                    const ini = String(r.conteudo).length + (String(r.conteudo) ? 1 : 0);
                    r.conteudo = (String(r.conteudo) ? r.conteudo + '\n' : '') + x.conteudo;
                    if (x.trechos) r.trechos = [...(r.trechos || []), ...x.trechos.map(t => ({ ...t, ini: t.ini + ini, fim: t.fim + ini }))];
                }
            }
            const nr = vkTxRaiz(nx); nr.conteudo = ''; delete nr.trechos;
            pv.seguinte = nr.id; nr.anterior = pv.id;
            vkTxNorm(r);
        }
        VK.sel = objs.map(o => o.id);
        await vkGeosProntas();
        const cor = vkTxCorrente(objs[0]), g = vkGeo(cor.at(-1));
        return { caixas: cor.length, transborda: !!(g && g.transborda) };
    });
    // ── desencadear: cada caixa fica com o texto que mostra (independente) ──
    vkRegistrar('desencadear', 'remover encadeamento', async a => {
        const feitas = new Set();
        for (const o of vkTxAlvos(a).filter(o => o.tipo === 'texto')) {
            const cor = vkTxCorrente(o); if (cor.length < 2 || feitas.has(cor[0].id)) continue; feitas.add(cor[0].id);
            await vkGeosProntas();
            const r = cor[0], txt = String(r.conteudo), ini = cor.map(x => vkTxFonte(x).ini), base = vkClone(r);
            cor.forEach((x, k) => {
                const i = ini[k], f = k < cor.length - 1 ? ini[k + 1] : txt.length;
                for (const kk of ['ep', ...VK_TX_CAR, ...VK_TX_PAR]) if (base[kk] !== undefined) x[kk] = vkClone(base[kk]);
                x.conteudo = txt.slice(i, f).replace(/^\n+|\n+$/g, '');
                const corte = txt.slice(i, f).match(/^\n*/)[0].length;
                x.trechos = (base.trechos || []).map(t => ({ ...t, ini: Math.max(0, t.ini - i - corte), fim: Math.min(f - i - corte, t.fim - i - corte) })).filter(t => t.fim > t.ini);
                if (!x.trechos.length) delete x.trechos;
                delete x.anterior; delete x.seguinte;
            });
        }
        return { correntes: feitas.size };
    });
    // ── estilos nomeados: tipo paragrafo|caractere; de = id/nome do texto (captura, com faixa/trecho para caractere);
    //    mudar um estilo que já existe atualiza todos os textos que o usam ──
    vkRegistrar('estilo_texto', 'estilo de texto', async a => {
        const E = vkTxEstilos(), tipo = /^c/i.test(a.tipo || '') ? 'car' : 'par', L = E[tipo], nome = String(a.nome || '').trim();
        if (!nome) throw new Error('estilo_texto: falta o nome');
        if (a.apagar) { delete L[nome]; for (const { o } of vkTodos()) if (o.tipo === 'texto') { if (tipo === 'par' && o.ep === nome) delete o.ep; (o.trechos || []).forEach(t => { if (t.ec === nome) delete t.ec; }); } return { apagado: nome }; }
        const st = { ...(L[nome] || {}) };
        if (a.de) {
            const src = vkTxRaiz(vkTxAlvos({ ids: vkObj(a.de) ? [a.de] : undefined, nomes: vkObj(a.de) ? undefined : [a.de] })[0]);
            const fx = vkTxFaixas(src, a), p = vkTxCarEm(src, fx ? fx[0][0] : 0);
            for (const k of VK_TX_CAR) { delete st[k]; if (p[k] != null && p[k] !== '') st[k] = vkClone(p[k]); }
            if (tipo === 'par') for (const k of VK_TX_PAR) { delete st[k]; if (src[k] != null) st[k] = src[k]; }
        }
        const { car, par } = vkTxArgs(a, true);
        Object.assign(st, car); if (tipo === 'par') Object.assign(st, par);
        L[nome] = st;
        let n = 0;   // atualiza quem usa
        for (const { o } of vkTodos()) {
            if (o.tipo !== 'texto') continue;
            if (tipo === 'par' && o.ep === nome) { vkTxAplicar(o, { estilo_paragrafo: nome, un: 'pt' }); n++; }
            if (tipo === 'car' && (o.trechos || []).some(t => t.ec === nome)) { o.trechos.forEach(t => { if (t.ec === nome) Object.assign(t, vkClone(st)); }); vkTxNorm(o); n++; }
        }
        if (a.aplicar) { vkTxAplicar(vkTxAlvos(a)[0], { ...(tipo === 'par' ? { estilo_paragrafo: nome } : { estilo_caractere: nome }), ...(a.faixa ? { faixa: a.faixa } : {}), ...(a.trecho ? { trecho: a.trecho } : {}) }); n++; }
        return { tipo: tipo === 'par' ? 'paragrafo' : 'caractere', nome, atributos: Object.keys(st), textos_atualizados: n };
    });
    vkRegistrar('estilos_texto', 'estilos de texto', () => vkTxEstilos(), true);
    // ── juntar textos de ponto (PDF/.ai importado vem linha a linha) num texto de área com parágrafos ──
    vkRegistrar('juntar_textos', 'juntar textos', async a => {
        const ts = vkTxAlvos(a).filter(o => o.tipo === 'texto' && !o.trilha && !o.anterior && !o.seguinte);
        if (ts.length < 2) throw new Error('juntar_textos: selecione 2 ou mais textos');
        for (const t of ts) await vkGeoPronta(t);
        const info = ts.map(t => { const g = vkGeo(t), s = vkEsc(t.m), b = vkBox(t); return { t, g, s, b, base: vkAp(t.m, 0, g && g.linhas.length ? g.linhas[0].base : 0)[1], tam: t.tam * s }; })
            .sort((p, q) => (Math.abs(p.base - q.base) < p.tam * 0.3 ? p.b[0] - q.b[0] : p.base - q.base));
        const L = info[0], s = L.s, difs = [];
        for (let i = 1; i < info.length; i++) { const d = info[i].base - info[i - 1].base; if (d > info[i].tam * 0.3) difs.push(d); }
        const lead = difs.length ? [...difs].sort((x, y) => x - y)[Math.floor((difs.length - 1) / 2)] : L.tam * 1.2;   // mediana baixa: o vão normal entre linhas
        let txt = ''; const trechos = [];
        info.forEach((x, i) => {
            let sep = '';
            if (i) { const d = x.base - info[i - 1].base; sep = d < x.tam * 0.3 ? ' ' : (a.quebras === 'linhas' || d > lead * 1.45) ? '\n' : (/[-‐]$/.test(txt) ? '' : ' '); }
            const ini = txt.length + sep.length; txt += sep + x.t.conteudo;
            const dif = {};
            if (x.t.fam !== L.t.fam || x.t.estilo !== L.t.estilo) { dif.fam = x.t.fam; dif.estilo = x.t.estilo; }
            if (Math.abs(x.tam - L.tam) > 0.05) dif.tam = vkR(x.tam / s, 3);
            if (!vkTxIgual(x.t.preench, L.t.preench)) dif.preench = vkClone(x.t.preench);
            if (Object.keys(dif).length) trechos.push({ ini, fim: txt.length, ...dif });
        });
        const bx = vkBoxUniao(ts), esp = (k, f) => { const v = info.map(f); return Math.max(...v) - Math.min(...v) < 1.5; };
        let alin = 'esq';
        if (esp(0, x => x.b[0]) && esp(0, x => x.b[2]) && info.length > 2) alin = 'just';
        else if (esp(0, x => x.b[0])) alin = 'esq'; else if (esp(0, x => (x.b[0] + x.b[2]) / 2)) alin = 'centro'; else if (esp(0, x => x.b[2])) alin = 'dir';
        const larg = bx[2] - bx[0], folga = larg * 0.02, x0 = bx[0] - (alin === 'centro' ? folga / 2 : alin === 'dir' ? folga : 0);
        const o = { id: vkId(), tipo: 'texto', nome: a.nome || L.t.nome, conteudo: txt, fam: L.t.fam, estilo: L.t.estilo, tam: L.t.tam, entrelinha: difs.length ? vkR(lead / s, 3) : null,
            track: L.t.track || 0, alin, caixa: (larg + folga) / s, preench: vkClone(L.t.preench), traco: L.t.traco ? vkClone(L.t.traco) : null,
            m: [L.t.m[0], L.t.m[1], L.t.m[2], L.t.m[3], x0, L.base - (L.g ? L.g.asc : L.t.tam * 0.8) * s], ...(trechos.length ? { trechos } : {}) };
        if (!o.nome) delete o.nome;
        if (L.t.sobre) o.sobre = vkClone(L.t.sobre); if (L.t.op != null) o.op = L.t.op;
        const l = vkListaDe(L.t.id); l.splice(l.indexOf(L.t), 0, o);
        ts.forEach(t => { const ll = vkListaDe(t.id); ll.splice(ll.indexOf(t), 1); });
        vkTxNorm(o); VK.sel = [o.id];
        await vkGeoPronta(o);
        return { id: o.id, linhas: info.length, paragrafos: txt.split('\n').length, alin, entrelinha: o.entrelinha };
    });
    vkRegistrar('glifos', 'glifos da fonte', async a => {
        const o = !a.fonte && VK.sel.length ? vkObj(VK.sel[0]) : null;
        return await vkApi().vk_fonte_glifos(a.fonte || (o && o.fam) || 'Arial', a.estilo || (o && o.estilo) || 'Regular');
    }, true);
    // ── inserir caractere (Glifos): pos = índice no texto (padrão: fim); o caractere herda o estilo de antes ──
    vkRegistrar('inserir_texto', 'inserir texto', async a => {
        const o = vkTxAlvos(a).find(x => x.tipo === 'texto'); if (!o) throw new Error('inserir_texto: selecione um texto');
        const r = vkTxRaiz(o), txt = String(r.conteudo), pos = a.pos == null ? txt.length : Math.max(0, Math.min(txt.length, +a.pos));
        const ins = a.codigo != null ? String.fromCodePoint(+a.codigo) : String(a.texto ?? '');
        vkTxRemap(r, txt, txt.slice(0, pos) + ins + txt.slice(pos));
        await vkGeoPronta(o);
        return { pos: pos + ins.length };
    });
})();

// ─────────────────────────── edição (caixa por cima do canvas): caixa encadeada edita a raiz; guarda a seleção ───────────────────────────
const vkTxEditarOrig = vkTextoEditar;
vkTextoEditar = function (o) {
    o = vkTxRaiz(o);
    vkTxEditarOrig(o);
    const ta = document.getElementById('vk-texto-edit'); if (!ta || ta.hidden) return;
    const guarda = () => { VK.txFaixa = { id: o.id, ini: ta.selectionStart, fim: ta.selectionEnd, n: ta.value.length }; VK.txCaret = { id: o.id, pos: ta.selectionEnd }; };
    ta.onselect = ta.onkeyup = ta.onmouseup = guarda;
    const ob = ta.onblur; ta.onblur = e => { guarda(); ob && ob(e); };
};
function vkTxFaixaAtiva(o) {   // trecho selecionado na edição que ainda vale para o texto selecionado → [ini, fim] | null
    const f = VK.txFaixa, r = o && vkTxRaiz(o);
    if (!f || !r || f.id !== r.id || f.n !== String(r.conteudo).length || f.fim <= f.ini || (f.ini === 0 && f.fim === f.n)) return null;
    return [f.ini, f.fim];
}

// ─────────────────────────── painel (Propriedades): Caractere, Parágrafo, Área/Caminho, Estilos ───────────────────────────
function vkTxPainel(tx, objs) {
    const r = vkTxRaiz(tx), fx = objs.length === 1 ? vkTxFaixaAtiva(tx) : null, c = vkTxCarEm(r, fx ? fx[0] : 0), E = vkTxEstilos(), g = vkGeo(tx);
    const fams = (typeof IE !== 'undefined' && IE.fontes) || [], on = b => b ? 'on' : '';
    const amostra = fx ? String(r.conteudo).slice(fx[0], fx[1]).replace(/\s+/g, ' ') : '';
    let h = `<div class="vk-sec"><div class="vk-sec-t">Caractere${fx ? ` · trecho «${vkEsc_(amostra.length > 22 ? amostra.slice(0, 22) + '…' : amostra)}»` : ''}</div>
        ${fx ? `<div class="vk-nota">Mudanças valem só para o trecho selecionado. <button class="ie-btn ie-btn-mini" data-txfx="0">Texto inteiro</button></div>` : ''}
        <div class="vk-linha"><input list="vk-fontes" data-tx="fonte" value="${vkEsc_(c.fam)}" class="vk-fonte"><datalist id="vk-fontes">${fams.slice(0, 900).map(f => `<option value="${vkEsc_(f)}">`).join('')}</datalist>
            <select data-tx="estilo">${vkEstilosDe(c.fam).map(s => `<option ${s === c.estilo ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="vk-grade">${vkNum('Tam', vkR(c.tam, 2), 'data-tx="tamanho" min="0.5"', 'pt', 0.5)}${vkNum('Track', c.track || 0, 'data-tx="track"', '', 10)}${vkNum('Base', c.desl || 0, 'data-tx="desl" title="deslocamento da linha de base"', 'pt', 0.5)}
            ${vkNum('Esc H', c.eh ?? 100, 'data-tx="escala_h" min="1"', '%', 1)}${vkNum('Esc V', c.ev ?? 100, 'data-tx="escala_v" min="1"', '%', 1)}</div>
        <div class="vk-bts">
            <button class="ie-btn ie-btn-mini ${on(c.maius === 'alta')}" data-txt="maius:alta" title="Caixa alta">TT</button><button class="ie-btn ie-btn-mini ${on(c.maius === 'versalete')}" data-txt="maius:versalete" title="Versalete">Tᴛ</button>
            <button class="ie-btn ie-btn-mini ${on(c.pos === 'sup')}" data-txt="pos:sup" title="Sobrescrito">T¹</button><button class="ie-btn ie-btn-mini ${on(c.pos === 'sub')}" data-txt="pos:sub" title="Subscrito">T₁</button>
            <button class="ie-btn ie-btn-mini ${on(c.liga !== false)}" data-txt="liga" title="Ligaduras (fi, fl)">fi</button><button class="ie-btn ie-btn-mini ${on(c.frac)}" data-txt="frac" title="Frações (1/2 → ½)">½</button>
</div>
        <div class="vk-linha vk-mini">Numerais <select data-tx="num" title="Numerais">${[['', 'padrão'], ['lin', 'alinhados'], ['old', 'estilo antigo'], ['tab', 'tabulares'], ['prop', 'proporcionais']].map(([v, n]) => `<option value="${v}" ${(c.num || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${fx ? `<div class="vk-linha"><button class="vk-cor-btn" data-txcor="preench">${vkCorSw(c.preench)}<span>Cor do trecho</span><small>${vkCorTexto(c.preench)}</small></button></div>` : ''}
        <div class="vk-acoes"><button class="ie-btn" data-txglifos="1">Glifos…</button><button class="ie-btn" onclick="vkCmdUi('contornos', {})">Criar contornos</button></div></div>`;
    h += `<div class="vk-sec"><div class="vk-sec-t">Parágrafo</div>
        <div class="ie-segm vk-segm">${[['esq', '⟸', 'à esquerda'], ['centro', '⟺', 'centralizado'], ['dir', '⟹', 'à direita'], ['just', '☰', 'justificado (última à esquerda)'], ['just_tudo', '▤', 'justificar todas as linhas']].map(([a, s, t]) => `<button data-txalin="${a}" title="${t}" class="${(r.alin || 'esq') === a ? 'on' : ''}">${s}</button>`).join('')}</div>
        <div class="vk-grade">${vkNum('Entrel.', r.entrelinha ? vkR(r.entrelinha, 2) : '', 'data-tx="entrelinha" placeholder="auto"', 'pt', 0.5)}${vkNum('Recuo ⇤', r.recuo_esq || 0, 'data-tx="recuo_esq"', 'pt', 1)}${vkNum('Recuo ⇥', r.recuo_dir || 0, 'data-tx="recuo_dir"', 'pt', 1)}
            ${vkNum('1ª linha', r.recuo_1a || 0, 'data-tx="recuo_1a"', 'pt', 1)}${vkNum('Antes', r.antes || 0, 'data-tx="antes"', 'pt', 1)}${vkNum('Depois', r.depois || 0, 'data-tx="depois"', 'pt', 1)}</div></div>`;
    if (objs.length === 1 && tx.caixa) {
        const cor = vkTxCorrente(tx), k = cor.indexOf(tx);
        h += `<div class="vk-sec"><div class="vk-sec-t">Caixa de texto</div>
        <div class="vk-linha"><label class="vk-chk"><input type="checkbox" data-tx="altura_fixa" ${tx.caixa_alt ? 'checked' : ''}> Altura fixa</label>${tx.caixa_alt ? vkNum('', vkR(vkMM(tx.caixa_alt)), 'data-tx="caixa_alt" min="1"', 'mm', 0.5) : ''}</div>
        ${cor.length > 1 ? `<div class="vk-nota">Encadeada: caixa ${k + 1} de ${cor.length}. <button class="ie-btn ie-btn-mini" data-txdes="1">Desencadear</button></div>` : ''}
        ${g && g.transborda ? `<div class="vk-nota" style="color:#ff6b6b">Texto sobrando. Clique no <b>+</b> vermelho da caixa e depois noutra caixa (ou num lugar vazio) para continuar o texto.</div>` : ''}</div>`;
    }
    if (objs.length === 1 && tx.trilha) h += `<div class="vk-sec"><div class="vk-sec-t">Texto em caminho</div>
        <div class="vk-linha">${vkNum('Início', vkR(vkMM(tx.trilha.ini || 0)), 'data-tx="trilha_ini"', 'mm', 0.5)}<label class="vk-chk"><input type="checkbox" data-tx="lado" ${tx.trilha.lado ? 'checked' : ''}> Do outro lado</label></div>
        ${g && g.transborda ? '<div class="vk-nota" style="color:#ff6b6b">O texto não coube no caminho.</div>' : ''}</div>`;
    const opt = (L, atual) => `<option value="">— nenhum —</option>${Object.keys(L).map(n => `<option ${n === atual ? 'selected' : ''}>${vkEsc_(n)}</option>`).join('')}`;
    const ecAtual = (r.trechos || []).find(t => t.ini <= (fx ? fx[0] : 0) && t.fim > (fx ? fx[0] : 0) && t.ec)?.ec;
    h += `<div class="vk-sec"><div class="vk-sec-t">Estilos</div>
        <div class="vk-linha vk-mini">¶ <select data-tx="estilo_paragrafo" title="Estilo de parágrafo">${opt(E.par, r.ep)}</select>${r.ep ? `<button class="ie-btn ie-btn-mini" data-txst="redef_par" title="Redefinir o estilo com este texto (atualiza todos)">↺</button>` : ''}</div>
        <div class="vk-linha vk-mini">A <select data-tx="estilo_caractere" title="Estilo de caractere${fx ? ' (no trecho)' : ''}">${opt(E.car, ecAtual)}</select>${ecAtual ? `<button class="ie-btn ie-btn-mini" data-txst="redef_car" title="Redefinir o estilo com este trecho (atualiza todos)">↺</button>` : ''}</div>
        <div class="vk-linha vk-mini"><input type="text" id="vk-tx-novo" placeholder="nome do estilo novo" style="flex:1;min-width:0"><button class="ie-btn ie-btn-mini" data-txst="novo_par" title="Novo estilo de parágrafo a partir deste texto">+¶</button><button class="ie-btn ie-btn-mini" data-txst="novo_car" title="Novo estilo de caractere a partir ${fx ? 'do trecho' : 'deste texto'}">+A</button></div></div>`;
    return h;
}
function vkTxPainelEventos(el) {
    if (el._vkTx) return; el._vkTx = true;
    const txSel = () => { const o = VK.sel.length ? vkObj(VK.sel[0]) : null; return o && o.tipo === 'texto' ? o : null; };
    const comFaixa = (o, args) => { const fx = VK.sel.length === 1 && vkTxFaixaAtiva(o); return fx ? { ...args, faixa: fx } : args; };
    const CAR = new Set(['fonte', 'estilo', 'tamanho', 'track', 'desl', 'escala_h', 'escala_v', 'num', 'estilo_caractere']);
    el.addEventListener('change', e => {
        const t = e.target, k = t.dataset.tx; if (!k) return;
        e.stopPropagation();
        const o = txSel(); if (!o) return;
        let v = t.type === 'checkbox' ? t.checked : t.value;
        if (k === 'altura_fixa') { const g = vkGeo(o); return vkCmdUi('alterar', { caixa_alt: v ? (g ? g.alt : o.tam * 5) : null }); }
        if (['tamanho', 'track', 'desl', 'escala_h', 'escala_v', 'recuo_esq', 'recuo_dir', 'recuo_1a', 'antes', 'depois'].includes(k)) v = +v;
        if (k === 'entrelinha') v = v === '' ? null : +v;
        if (k === 'caixa_alt' || k === 'trilha_ini') return vkCmdUi('alterar', { [k]: vkPT(+v) });
        if (k === 'fonte') { const est = vkEstilosDe(v); return vkCmdUi('alterar', comFaixa(o, { fonte: v, estilo: est.includes(vkTxCarEm(vkTxRaiz(o), 0).estilo) ? vkTxCarEm(vkTxRaiz(o), 0).estilo : est[0] })); }
        vkCmdUi('alterar', CAR.has(k) ? comFaixa(o, { [k]: v }) : { [k]: v });
    }, true);
    el.addEventListener('click', e => {
        const b = e.target.closest('[data-txt],[data-txalin],[data-txcor],[data-txfx],[data-txglifos],[data-txdes],[data-txst]'); if (!b) return;
        e.stopPropagation();
        const o = txSel(); if (!o) return;
        const r = vkTxRaiz(o), fx = vkTxFaixaAtiva(o), c = vkTxCarEm(r, fx ? fx[0] : 0);
        if (b.dataset.txt) {
            const [k, val] = b.dataset.txt.split(':');
            const args = k === 'maius' ? { maius: c.maius === val ? 'nenhuma' : val } : k === 'pos' ? { pos: c.pos === val ? 'normal' : val } : k === 'liga' ? { liga: c.liga === false } : { frac: !c.frac };
            return vkCmdUi('alterar', comFaixa(o, args));
        }
        if (b.dataset.txalin) return vkCmdUi('alterar', { alin: b.dataset.txalin });
        if (b.dataset.txcor) return vkCorPopup(b, c.preench, cor => vkCmdUi('alterar', comFaixa(o, { preench: cor })));
        if (b.dataset.txfx) { VK.txFaixa = null; return vkUiAgendar(); }
        if (b.dataset.txglifos) return vkTxGlifos(b);
        if (b.dataset.txdes) return vkCmdUi('desencadear', {});
        const st = b.dataset.txst, nome = (el.querySelector('#vk-tx-novo') || {}).value;
        if (st === 'novo_par' || st === 'novo_car') { if (!nome || !nome.trim()) return vkToast('Escreva o nome do estilo'); return vkCmdUi('estilo_texto', { tipo: st === 'novo_par' ? 'paragrafo' : 'caractere', nome: nome.trim(), de: r.id, aplicar: true, ...(fx ? { faixa: fx } : {}) }); }
        if (st === 'redef_par') return vkCmdUi('estilo_texto', { tipo: 'paragrafo', nome: r.ep, de: r.id });
        if (st === 'redef_car') { const ec = (r.trechos || []).find(t => t.ini <= (fx ? fx[0] : 0) && t.fim > (fx ? fx[0] : 0) && t.ec)?.ec; if (ec) return vkCmdUi('estilo_texto', { tipo: 'caractere', nome: ec, de: r.id, ...(fx ? { faixa: fx } : {}) }); }
    }, true);
}

// ── Glifos: grade de caracteres da fonte; clique insere no ponto onde o cursor estava (ou no fim) ──
async function vkTxGlifos(ancora) {
    const o = VK.sel.length && vkObj(VK.sel[0]); if (!o || o.tipo !== 'texto') return vkToast('Selecione um texto');
    const r = vkTxRaiz(o), c = vkTxCarEm(r, VK.txCaret && VK.txCaret.id === r.id ? Math.max(0, VK.txCaret.pos - 1) : 0);
    const res = await vkCmd('glifos', { fonte: c.fam, estilo: c.estilo });
    const pop = vkEl('vk-pop'), rr = vkEl('vk').getBoundingClientRect(), rb = (ancora || vkEl('vk-props') || vkEl('vk')).getBoundingClientRect();
    const grade = filtro => res.cars.filter(k => !filtro || String.fromCodePoint(k).toLowerCase().includes(filtro.toLowerCase()) || k.toString(16).includes(filtro.toLowerCase().replace(/^u\+/, '')))
        .slice(0, 1500).map(k => `<button data-gl="${k}" title="U+${k.toString(16).toUpperCase().padStart(4, '0')}">&#${k};</button>`).join('');
    pop.innerHTML = `<div class="vk-glifos"><div class="vk-gl-cab">Glifos · ${vkEsc_(c.fam)} ${vkEsc_(c.estilo)} <small>${res.total} caracteres</small></div>
        <input type="text" class="vk-gl-busca" placeholder="buscar: caractere ou código (ex. 2122)"><div class="vk-gl-grade" style="font-family:'${vkEsc_(c.fam)}'">${grade('')}</div></div>`;
    Object.assign(pop.style, { left: Math.max(8, rb.left - rr.left - 340) + 'px', top: Math.max(8, rb.top - rr.top) + 'px' }); pop.hidden = false;
    pop.querySelector('.vk-gl-busca').oninput = e => { pop.querySelector('.vk-gl-grade').innerHTML = grade(e.target.value.trim()); };
    pop.onchange = null;
    pop.onclick = async e => {
        const b = e.target.closest('[data-gl]'); if (!b) return;
        const pos = VK.txCaret && VK.txCaret.id === r.id ? VK.txCaret.pos : null;
        const rs = await vkCmdUi('inserir_texto', { ids: [r.id], codigo: +b.dataset.gl, ...(pos != null ? { pos } : {}) });
        if (rs) VK.txCaret = { id: r.id, pos: rs.pos };
    };
    setTimeout(() => document.addEventListener('pointerdown', function fora(e) { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener('pointerdown', fora); } }), 0);
}

// ─────────────────────────── tela: quadro, portas (+ vermelho = sobrando), fios do encadeamento, trilha ───────────────────────────
function vkTxPortas(o) {
    const g = vkGeo(o); if (!o.caixa) return null;
    const h = o.caixa_alt || (g ? g.alt : o.tam);
    return { ent: vkTela(...vkAp(o.m, 0, 0)), sai: vkTela(...vkAp(o.m, o.caixa, h)), h, g };
}
function vkTxSobreposicao(ctx) {
    if (!VK.doc) return;
    const sel = vkSelObjs().filter(o => o.tipo === 'texto'), feitos = new Set();
    for (const o0 of sel) for (const o of vkTxCorrente(o0)) {
        if (feitos.has(o.id)) continue; feitos.add(o.id);
        const P = vkTxPortas(o);
        if (P) {
            ctx.save(); ctx.strokeStyle = 'rgba(47,140,255,.7)'; ctx.setLineDash([3, 3]); ctx.beginPath();
            const cs = [[0, 0], [o.caixa, 0], [o.caixa, P.h], [0, P.h]].map(([x, y]) => vkTela(...vkAp(o.m, x, y)));
            ctx.moveTo(...cs[0]); cs.slice(1).forEach(c => ctx.lineTo(...c)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
            const porta = ([x, y], cor, mais, seta) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = cor; ctx.fillRect(x - 4.5, y - 4.5, 9, 9); ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
                if (mais) { ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5); ctx.stroke(); }
                if (seta) { ctx.fillStyle = cor; ctx.beginPath(); ctx.moveTo(x - 2, y - 3); ctx.lineTo(x + 3, y); ctx.lineTo(x - 2, y + 3); ctx.fill(); } };
            const s = o.seguinte && vkObj(o.seguinte), liga = s && s.anterior === o.id;
            porta(P.ent, '#2f8cff', false, !!o.anterior);
            porta(P.sai, P.g && P.g.transborda && !liga ? '#ff2b2b' : '#2f8cff', !!(P.g && P.g.transborda && !liga), liga);
            if (liga) { const Q = vkTxPortas(s); if (Q) { ctx.strokeStyle = '#2f8cff'; ctx.beginPath(); ctx.moveTo(...P.sai); ctx.lineTo(...Q.ent); ctx.stroke(); } }
            ctx.restore();
        }
        if (o.trilha) {
            ctx.save(); ctx.strokeStyle = 'rgba(47,140,255,.8)'; ctx.lineWidth = 1 / VK.vista.z / vkEsc(o.m);
            ctx.translate(VK.vista.x, VK.vista.y); ctx.scale(VK.vista.z, VK.vista.z); ctx.transform(...o.m);
            ctx.stroke(vkPath2d(o.trilha.subs)); ctx.restore();
            const g = vkGeo(o);
            if (g && g.transborda) { const sp = o.trilha.subs[0], P = sp.pts[o.trilha.lado ? 0 : sp.pts.length - 1], [x, y] = vkTela(...vkAp(o.m, P[0], P[1]));
                ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ff2b2b'; ctx.fillRect(x - 4.5, y - 4.5, 9, 9); ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
                ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5); ctx.stroke(); ctx.restore(); }
        }
    }
    if (VK.txLigar && VK.mouse) {   // fio do encadeamento seguindo o mouse
        const o = vkObj(VK.txLigar), P = o && vkTxPortas(o);
        if (P) { ctx.save(); ctx.strokeStyle = '#2f8cff'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(...P.sai); ctx.lineTo(...vkTela(...VK.mouse)); ctx.stroke(); ctx.restore(); }
    }
}
// pointerdown: porta de saída (começa a encadear), clique depois de "+" (encadeia), ferramenta Texto em caminho → true se tratou
function vkTxDown(e, sx, sy, x, y) {
    if (!VK.doc || e.button !== 0) return false;
    if (VK.txLigar) {
        const src = vkObj(VK.txLigar); VK.txLigar = null; vkCanvas().style.cursor = VK_FERR[VK.ferr].cursor;
        if (!src) return true;
        const alvo = vkObjEm(x, y, true);
        if (alvo && alvo.tipo === 'texto' && alvo.caixa && alvo !== src) vkCmdUi('encadear', { ids: [src.id, alvo.id] });
        else vkCmdUi('encadear', { ids: [src.id], nova: { x, y } });
        return true;
    }
    if (VK.ferr === 'texto_caminho') {
        const o = vkObjEm(x, y, true);
        if (o && o.tipo === 'texto') { VK.sel = [o.id]; vkTextoEditar(o); return true; }
        if (o && o.tipo === 'caminho') vkCmdUi('texto_caminho', { ids: [o.id], conteudo: 'Texto no caminho' }).then(r => { const t = r && vkObj(r.id); if (t) { t._novo = false; vkTextoEditar(t); } });
        else vkToast('Clique num caminho (linha, curva, círculo) para escrever nele');
        return true;
    }
    if (VK.ferr === 'selecao' || VK.ferr === 'direta') {
        for (const o of vkSelObjs()) {
            if (o.tipo !== 'texto') continue;
            const P = vkTxPortas(o); if (!P || Math.abs(sx - P.sai[0]) > 6 || Math.abs(sy - P.sai[1]) > 6) continue;
            const s = o.seguinte && vkObj(o.seguinte);
            if (s && s.anterior === o.id) return false;
            VK.txLigar = o.id; vkCanvas().style.cursor = 'alias'; vkToast('Agora clique noutra caixa de texto, ou num lugar vazio para criar a caixa seguinte'); vkDesenhar();
            return true;
        }
    }
    return false;
}
function vkTxComFaixa(args) { const o = VK.sel.length === 1 && vkObj(VK.sel[0]), fx = o && o.tipo === 'texto' && vkTxFaixaAtiva(o); return fx ? { ...args, faixa: fx } : args; }
