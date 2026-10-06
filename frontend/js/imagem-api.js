// =========================================================
// Photo Kanivete — API de automação (window.KNV), como os scripts e as Ações do Photoshop
// Para agentes de IA e scripts (modo agente, CDP): cada função faz o que um designer faria no editor — os mesmos
// comandos, ferramentas, diálogos (com os valores já preenchidos, sem abrir a janela), histórico e Ctrl+Z.
// Guia: Instructions/editor-imagem.md, seção "API de automação". Todas são async e devolvem dados simples (JSON).
// Camadas por nome (o primeiro que bate) ou por id. Coordenadas em pixels do documento.
// =========================================================

// camada da receita por nome ou id (erro claro se não existe); ieRecInt = já como objeto inteligente (converte pixel)
function ieRec(nome) {
    const L = ieTodas(IE.doc).find(x => x.nome === nome || x.id === nome);
    if (!L) throw new Error(`camada "${nome}" não existe`);
    return L;
}
function ieRecInt(nome) {
    const L = ieRec(nome);
    if (L.c0) return L;
    if (L.tipo !== 'pixel' || !L.c) throw new Error(`"${L.nome}" não é foto/objeto (grupo ou texto não recebe filtro inteligente)`);
    KNV.ativar(L.id); IE_CMDS.objetoInteligente(IE.doc);
    if (!L.c0) throw new Error(`não deu para converter "${L.nome}" em objeto inteligente`);
    return L;
}
const KNV = {
    // ── documento ──
    novo(nome = 'Sem título', w = 1080, h = 1080, fundo = 'branco') {
        if (typeof switchTool === 'function' && !document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem');
        const d = ieNovoDoc2(nome, w, h, 72, fundo);
        return { id: d.id, w: d.w, h: d.h };
    },
    doc(id) { if (id != null) { const d = IE.docs.find(x => x.id === id || x.nome === id); if (d) ieMostrarDoc(d); } const d = IE.doc; return d && { id: d.id, nome: d.nome, w: d.w, h: d.h }; },
    // árvore de camadas (de baixo para cima), resumida
    camadas() {
        const out = [];
        iePercorrer(IE.doc.camadas, (L, l, i, pai) => {
            out.push({ id: L.id, nome: L.nome, tipo: L.tipo, pai: pai ? pai.nome : null, x: L.x, y: L.y, w: L.c ? L.c.width : 0, h: L.c ? L.c.height : 0,
                bm: L.bm, op: Math.round(L.op * 100), vis: L.visivel, clip: !!L.clip, mascara: !!L.m, fx: L.fx ? Object.keys(L.fx).filter(k => (L.fx[k] || []).length) : [],
                texto: L.txt ? L.txt.s : undefined, ativa: L.id === IE.doc.ativa });
        });
        return out;
    },
    // ativa uma camada (nome ou id)
    ativar(c) {
        let id = null;
        iePercorrer(IE.doc.camadas, L => { if (id == null && (L.id === c || L.nome === c)) id = L.id; });
        if (id == null) throw new Error(`camada "${c}" não existe`);
        ieAtivar(id, IE.doc); IE.doc.mascaraAlvo = false; ieUiCamadas();
        return KNV.info();
    },
    // camada ativa; x/y/w/h = caixa do conteúdo visível (sem a sobra transparente do canvas)
    info() {
        const L = ieAtiva(IE.doc);
        if (!L) return null;
        const b = L.c && L.tipo === 'pixel' ? ieLimites(L.c) : null;
        return { id: L.id, nome: L.nome, tipo: L.tipo, x: L.x + (b ? b.x : 0), y: L.y + (b ? b.y : 0), w: b ? b.w : (L.c ? L.c.width : 0), h: b ? b.h : (L.c ? L.c.height : 0),
            bm: L.bm, op: Math.round(L.op * 100), mascara: !!L.m };
    },
    // corta a sobra transparente do canvas da camada (a imagem não muda de lugar)
    _aparar(L) {
        if (!L || !L.c || L.tipo !== 'pixel' || L.m) return;
        const b = ieLimites(L.c);
        if (!b || (b.x === 0 && b.y === 0 && b.w === L.c.width && b.h === L.c.height)) return;
        const c = ieCanvas(b.w, b.h); ieCtx(c).drawImage(L.c, -b.x, -b.y);
        L.c = c; L.x += b.x; L.y += b.y; ieInvalidar(L);
    },
    renomear(nome) { const L = ieAtiva(IE.doc); L.nome = nome; L._nomeAuto = false; ieUiCamadas(); return KNV.info(); },

    // ── comandos de menu, com os valores do diálogo já preenchidos: KNV.cmd('f:respingos', {r: 8, suave: 3}) ──
    // nomes: os de IE_CMDS / IE_AJUSTES ('aj:matiz', 'aj:niveis'...) / IE_FILTROS ('f:gaussiano'...) — os mesmos do menu
    async cmd(nome, valores) {
        IE._auto = valores || null;
        try { await ieCmd(nome); } finally { IE._auto = null; }
        await KNV._quadro();
        return KNV.info();
    },

    // ── camadas novas ──
    nova(nome) { ieCmd('novaCamada'); return KNV.renomear(nome || ieAtiva(IE.doc).nome); },
    // coloca uma imagem do disco como camada nova (acima da ativa ou de `acima`); x/y = canto; largura (ou altura) e ângulo
    async colocar(path, { nome, x, y, largura, altura, angulo = 0, acima } = {}) {
        if (acima != null) KNV.ativar(acima);
        await ieColocarArquivo(path);
        if (nome) KNV.renomear(nome);
        const L = ieAtiva(IE.doc);
        const larg = largura || (altura ? L.c.width * altura / L.c.height : L.c.width);
        KNV.transformar({ x: x ?? L.x, y: y ?? L.y, largura: larg, angulo });
        return KNV.info();
    },
    // Transformação livre na camada ativa (e na máscara junto): canto (x, y) depois da escala, largura e ângulo (°).
    // Como o Ctrl+T, vale a caixa do CONTEÚDO (pintar/apagar faz o canvas da camada crescer até o documento)
    transformar({ x, y, largura, angulo = 0, espelhar = false } = {}) {
        const doc = IE.doc, L = ieAtiva(doc);
        if (!L || !L.c) return KNV.info();
        KNV._aparar(L);
        const k = (largura || L.c.width) / L.c.width, a = angulo * Math.PI / 180, c = Math.cos(a) * k, s = Math.sin(a) * k;
        const M = [espelhar ? -c : c, espelhar ? -s : s, -s, c, 0, 0];
        const r0 = ieTransformarPlano({ c: L.c, x: L.x, y: L.y }, M);
        M[4] = (x ?? L.x) - r0.x; M[5] = (y ?? L.y) - r0.y;
        const R = ieRCamada(L);
        if (L.c0) {   // objeto inteligente: a matriz acumula e o desenho sai sempre do original (sem perda)
            L.tf = ieMatMul(M, L.tf || IE_ID);
            const r = ieTransformarPlano({ c: L.c0.c, x: L.c0.x, y: L.c0.y }, L.tf);
            L.c = r.c; L.x = r.x; L.y = r.y; L.sujoPx = true; L.movido = true;
        } else { const r = ieTransformarPlano({ c: L.c, x: L.x, y: L.y }, M); ieGravavel(L); L.c = r.c; L.x = r.x; L.y = r.y; L.sujoPx = true; }
        if (L.m && L.m.c) { const rm = ieTransformarPlano({ c: L.m.c, x: L.m.x, y: L.m.y }, M); L.m.c = rm.c; L.m.x = rm.x; L.m.y = rm.y; L.sujoM = true; }
        ieCamadaMudou(L, R); ieHist(ieT('Transformação livre')); ieUiCamadas();
        return KNV.info();
    },
    // girar (°, + = horário) e/ou escalar em torno do centro do conteúdo (ou de `centro` = [x, y]); vale para texto
    // (continua editável e nítido), objeto inteligente (sem perda), pixels e máscara — como o Ctrl+T
    girar(angulo = 0, { escala = 1, centro } = {}) {
        const doc = IE.doc, L = ieAtiva(doc);
        if (!L) return null;
        const b = KNV.caixa(L.id), [cx, cy] = centro || [b.x + b.w / 2, b.y + b.h / 2];
        const a = angulo * Math.PI / 180, c = Math.cos(a) * escala, s = Math.sin(a) * escala;
        const M = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
        const R = ieRCamada(L);
        if (L.txt) { L.txt.m = ieMatMul(M, L.txt.m || IE_ID); ieTextoRender(L); }
        else if (L.c0) { L.tf = ieMatMul(M, L.tf || IE_ID); const r = ieTransformarPlano({ c: L.c0.c, x: L.c0.x, y: L.c0.y }, L.tf); L.c = r.c; L.x = r.x; L.y = r.y; }
        else if (L.c) { KNV._aparar(L); ieGravavel(L); const r = ieTransformarPlano({ c: L.c, x: L.x, y: L.y }, M); L.c = r.c; L.x = r.x; L.y = r.y; }
        if (L.m && L.m.c) { const n = ieTransformarPlano(L.m, M, L.m.fundo || 0); if (n) { L.m = { ...L.m, ...n }; L.sujoM = true; } }
        L.sujoPx = true; L.movido = true; ieInvalidar(L);
        ieCamadaMudou(L, R); ieHist(ieT('Transformação livre')); ieUiCamadas();
        return KNV.info();
    },
    escalar(k, opc = {}) { return KNV.girar(0, { ...opc, escala: k }); },
    // caixa do conteúdo visível de qualquer camada (nome ou id), com máscara e sem efeitos; sem argumento = a ativa
    caixa(c) {
        let L = null;
        if (c == null) L = ieAtiva(IE.doc); else iePercorrer(IE.doc.camadas, X => { if (!L && (X.id === c || X.nome === c)) L = X; });
        if (!L) throw new Error(`camada "${c}" não existe`);
        const r = ieRaster(L);
        if (!r) return null;
        const f = r.forma || r, b = ieLimites(f.c);
        return b && { x: f.x + b.x, y: f.y + b.y, w: b.w, h: b.h };
    },
    // alinha a camada ativa a `a` (nome/id de camada, ou nada = página): h 'esq'|'centro'|'dir', v 'topo'|'meio'|'base';
    // dentro = false encosta por fora (ex.: h 'dir' + dentro false = logo à direita de `a`); folga em px
    // grupo = [nomes]: o bloco inteiro (caixa que junta todos) se move junto, como várias camadas selecionadas
    alinhar({ a, h, v, dentro = true, folga = 0, grupo } = {}) {
        const L = ieAtiva(IE.doc), R = a == null ? { x: 0, y: 0, w: IE.doc.w, h: IE.doc.h } : KNV.caixa(a);
        const me = grupo ? KNV.caixaGrupo(grupo) : KNV.caixa(L.id);
        let dx = 0, dy = 0;
        if (h === 'centro') dx = R.x + R.w / 2 - (me.x + me.w / 2);
        else if (h === 'esq') dx = dentro ? R.x + folga - me.x : R.x - folga - (me.x + me.w);
        else if (h === 'dir') dx = dentro ? R.x + R.w - folga - (me.x + me.w) : R.x + R.w + folga - me.x;
        if (v === 'meio') dy = R.y + R.h / 2 - (me.y + me.h / 2);
        else if (v === 'topo') dy = dentro ? R.y + folga - me.y : R.y - folga - (me.y + me.h);
        else if (v === 'base') dy = dentro ? R.y + R.h - folga - (me.y + me.h) : R.y + R.h + folga - me.y;
        if (!grupo) return KNV.mover(Math.round(dx), Math.round(dy));
        for (const n of grupo) { KNV.ativar(n); KNV.mover(Math.round(dx), Math.round(dy)); }
        return KNV.caixaGrupo(grupo);
    },
    // encosta a camada ativa nas camadas `em` (nome ou lista) andando para `lado` ('baixo'|'cima'|'esq'|'dir') até
    // ficar a `respiro` px dos PIXELS delas (não da caixa): encaixe de palavras em script, folha rente ao texto.
    // Só conta onde as duas se cruzam (colunas para baixo/cima, linhas para esq/dir). Sem cruzamento, não move.
    encostar(em, { lado = 'baixo', respiro = 8 } = {}) {
        const L = ieAtiva(IE.doc), Q = 2, alvo = [].concat(em);
        const pts = X => { const r = ieRaster(X); if (!r) return []; const f = r.forma || r, w = f.c.width, h = f.c.height, a = ieCtx(f.c).getImageData(0, 0, w, h).data, o = [];
            for (let y = 0; y < h; y += Q) for (let x = 0; x < w; x += Q) if (a[(y * w + x) * 4 + 3] >= 64) o.push([x + f.x, y + f.y]); return o; };
        const vert = lado === 'baixo' || lado === 'cima', s = lado === 'baixo' || lado === 'dir' ? 1 : -1;
        // por faixa (coluna ou linha): a borda da camada no sentido do movimento e a borda das outras do lado de lá
        const borda = (ps, frente) => { const m = new Map(); for (const [x, y] of ps) { const k = Math.floor((vert ? x : y) / Q), v = vert ? y : x;
            const ant = m.get(k); if (ant == null || (frente ? v * s > ant * s : v * s < ant * s)) m.set(k, v); } return m; };
        const meus = pts(L), c = meus.reduce((t, p) => t + (vert ? p[1] : p[0]), 0) / (meus.length || 1), minha = borda(meus, true);
        // das outras, só o que está à frente do meio da camada (o que fica atrás não bloqueia o caminho)
        const delas = borda(alvo.flatMap(n => { let X = null; iePercorrer(IE.doc.camadas, Y => { if (!X && (Y.id === n || Y.nome === n)) X = Y; }); return X ? pts(X) : []; })
            .filter(p => ((vert ? p[1] : p[0]) - c) * s > 0), false);
        let folga = Infinity;
        for (const [k, v] of minha) { const o = delas.get(k); if (o != null) folga = Math.min(folga, (o - v) * s); }
        if (!isFinite(folga)) return KNV.info();
        const d = Math.round((folga - respiro) * s);
        return vert ? KNV.mover(0, d) : KNV.mover(d, 0);
    },
    // caixa que junta várias camadas (+ centro), para alinhar/girar um bloco: girar(a, {centro: [g.cx, g.cy]})
    caixaGrupo(nomes) {
        const bs = nomes.map(n => KNV.caixa(n)).filter(Boolean);
        const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y)), x2 = Math.max(...bs.map(b => b.x + b.w)), y2 = Math.max(...bs.map(b => b.y + b.h));
        return { x, y, w: x2 - x, h: y2 - y, cx: (x + x2) / 2, cy: (y + y2) / 2 };
    },
    mover(dx, dy) { const L = ieAtiva(IE.doc), R = ieRCamada(L); L.x += dx; L.y += dy; if (L.tf) L.tf = [...L.tf.slice(0, 4), L.tf[4] + dx, L.tf[5] + dy]; if (L.m) { L.m.x += dx; L.m.y += dy; } if (L.txt) L.txt.m = [...L.txt.m.slice(0, 4), L.txt.m[4] + dx, L.txt.m[5] + dy]; ieCamadaMudou(L, R); ieHist(ieT('Mover')); return KNV.info(); },
    // muda a camada ativa de lugar na pilha: logo acima da camada `ref` (nome ou id)
    moverPara(ref) {
        const doc = IE.doc, L = ieAtiva(doc), a = ieAchar(doc, L.id);
        let alvo = null;
        iePercorrer(doc.camadas, X => { if (alvo == null && (X.id === ref || X.nome === ref)) alvo = X; });
        if (!alvo || alvo === L) return KNV.info();
        a.lista.splice(a.i, 1);
        ieInserirAcima(doc, L, alvo);
        ieTudo(doc); ieHist(ieT('Organizar')); ieUiCamadas();
        return KNV.info();
    },
    // modo de mesclagem ('MULTIPLY', 'SCREEN', 'OVERLAY', 'SOFTLIGHT'...) e opacidade (%)
    modo(bm, op) { const L = ieAtiva(IE.doc), R = ieRCamada(L); if (bm) L.bm = bm; if (op != null) L.op = op / 100; ieCamadaMudou(L, R); ieHist(ieT('Modo de mesclagem')); ieUiCamadas(); return KNV.info(); },
    // Converter em objeto inteligente (recorte uma vez, depois Ctrl+J para cópias que transformam sem perda)
    // camada de ajuste (não destrutiva, como no painel Ajustes) acima da ativa, já com os valores:
    // chave = brilho | niveis | curvas | exposicao | vibratilidade | matiz | equilibrio | pb | filtroFoto | misturador | inverter | posterizar | limiar | mapaDeg
    async ajuste(chave, vals = {}, { nome } = {}) {
        const def = IE_AJ_CAMADAS[chave];
        if (!def) throw new Error(`ajuste "${chave}" não existe (${Object.keys(IE_AJ_CAMADAS).join(', ')})`);
        await ieAjNova(chave);
        const L = ieAtiva(IE.doc);
        L.ajVals = { ...L.ajVals, ...vals }; L.ajuste = def.aj(L.ajVals);
        if (nome) { L.nome = nome; L._nomeAuto = false; }
        ieTudo(IE.doc); ieUiCamadas();
        return KNV.info();
    },
    objetoInteligente() { IE_CMDS.objetoInteligente(IE.doc); return KNV.info(); },
    async duplicar(nome) { await ieCmd('duplicar'); return nome ? KNV.renomear(nome) : KNV.info(); },
    // Remover plano de fundo (IA): máscara do assunto; aplicar = true deixa os pixels já recortados
    // (recorte profissional: matting + filtro guiado + cores sem o fundo misturado, ~30 s; rapido = só a máscara lite, ~5 s)
    async removerFundo({ aplicar = false, rapido = false } = {}) {
        await ieRemoverFundo(IE.doc, { rapido });
        if (aplicar && ieAtiva(IE.doc).m) await ieCmd('mascaraAplicar');
        return KNV.info();
    },

    // Borracha mágica: apaga a cor clicada (fundo de cor lisa: recorte instantâneo, sem IA). pontos = [[x, y], ...]
    // (vários cliques: ex. os 4 cantos e os vãos da folha); contiguo = false apaga essa cor na camada toda
    borrachaMagica(pontos, { tol = 32, contiguo = true, suave = true, todas = false } = {}) {
        const o = IE.op.borrachaMagica, antes = { ...o };
        Object.assign(o, { tol, contiguo, suave, todas, opac: 100 });
        for (const [x, y] of pontos) IE_BORRACHA_MAGICA.down({ x, y }, {}, IE.doc);
        Object.assign(o, antes);
        return KNV.info();
    },

    // ── gerar com IA (FLUX.2 klein, imagem-gerador.js): a imagem entra como camada nova acima da ativa (ou de `acima`)
    // fundo = acrescenta "fundo branco liso, assunto inteiro" ao prompt; recortar = true: recorte profissional (máscara,
    // borda sem halo, ~30 s); 'borracha' = Borracha mágica nos cantos + vãos (instantâneo, borda dura; 'cantos' = só o
    // fundo contínuo). ref = nome de camada | 'doc' | caminho → edita a partir dela (descreva a MUDANÇA).
    // x/y/larguraNoDoc posicionam o CONTEÚDO (como colocar). Mesmo prompt+tamanho+semente = mesma imagem (cache em disco):
    // fixe a semente nas receitas. Devolve info() + {semente, segundos, cache}. Sem ref: Z-Image-Turbo (~42 s por 1024² na RTX 3050);
    // com ref: FLUX.2 klein (~20 s).
    async gerar(prompt, { largura = 1024, altura = 1024, semente = -1, ref, fundo = true, recortar = false, tol = 40,
        nome, acima, x, y, larguraNoDoc, angulo = 0 } = {}) {
        if (acima != null) KNV.ativar(acima);
        const ehCamada = ref != null && ieTodas(IE.doc).some(L => L.nome === ref || L.id === ref);
        const refs = ref == null ? [] : [ehCamada || ref === 'doc' || ref === 'camada' ? ieGerRefPng(ref) : ref].filter(Boolean);
        const p = prompt.trim() + (fundo && !refs.length ? IE_GER_FUNDO : '');
        const r = await ieGerarCamada({ prompt: p, largura, altura, semente, refs }, nome || 'IA: ' + prompt.trim().slice(0, 40));
        if (!r) throw new Error('não gerou: ' + prompt.slice(0, 60));
        if (recortar === true || recortar === 'ia') await KNV.removerFundo();   // recorte profissional (máscara retocável)
        else if (recortar === 'borracha' || recortar === 'cantos') {   // fundo pelos 4 cantos; depois os vãos (folha furada, entre pétalas): o mesmo branco, mais justo
            const i = KNV.info(), cantos = [[i.x + 2, i.y + 2], [i.x + i.w - 3, i.y + 2], [i.x + 2, i.y + i.h - 3], [i.x + i.w - 3, i.y + i.h - 3]];
            KNV.borrachaMagica(cantos, { tol });
            if (recortar !== 'cantos') {   // um pixel branco puro e opaco que sobrou = um vão: apaga essa cor na camada toda
                const L = ieAtiva(IE.doc), w = L.c.width, h = L.c.height, d = ieCtx(L.c).getImageData(0, 0, w, h).data;
                for (let k = 0; k < d.length; k += 4 * 7) if (d[k + 3] === 255 && d[k] >= 250 && d[k + 1] >= 250 && d[k + 2] >= 250) {
                    const px = (k / 4) % w, py = Math.floor(k / 4 / w);
                    KNV.borrachaMagica([[L.x + px, L.y + py]], { tol, contiguo: false }); break;
                }
            }
        }
        if (x != null || y != null || larguraNoDoc || angulo) KNV.transformar({ x, y, largura: larguraNoDoc, angulo });
        await KNV._quadro();
        return { ...KNV.info(), semente: r.semente, segundos: r.segundos, cache: r.cache };
    },

    // ── seleção e pintura ──
    // seleção retangular/elíptica: modo 'nova' | 'somar' | 'subtrair'; suavizar = raio (px)
    selecionar(x, y, w, h, { elipse = false, modo = 'nova', suavizar = 0 } = {}) {
        const doc = IE.doc;
        ieSelAplicar(doc, k => { k.fillStyle = '#fff'; k.beginPath(); if (elipse) k.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); else k.rect(x, y, w, h); k.fill(); },
            modo, { t: elipse ? 'eli' : 'ret', x, y, w, h }, suavizar);
        return !!doc.sel;
    },
    // seleção por polígono (laço): pts = [[x, y], ...]
    selecionarPoligono(pts, { modo = 'nova', suavizar = 0 } = {}) {
        ieSelAplicar(IE.doc, k => { k.fillStyle = '#fff'; k.beginPath(); pts.forEach(([px, py], i) => (i ? k.lineTo(px, py) : k.moveTo(px, py))); k.closePath(); k.fill(); }, modo, null, suavizar);
        return !!IE.doc.sel;
    },
    preencher(cor) { return IE_CMDS.preencher(IE.doc, cor).then(() => KNV.info()); },
    // degradê na camada ativa: de/ate = [x, y]; tipo 'linear' | 'radial'; cor2 = null → frente para transparente
    degrade(de, ate, cor1, cor2 = null, tipo = 'linear', opac = 100) {
        const g = IE_FERR.degrade, o = IE.op.degrade, antes = { ...o }, c0 = [...IE.cor];
        Object.assign(o, { tipo, cores: cor2 ? 'frente-fundo' : 'frente-transp', opac }); IE.cor[0] = cor1; if (cor2) IE.cor[1] = cor2;
        IE.deg = { a: { x: de[0], y: de[1] }, b: { x: ate[0], y: ate[1] } };
        g.up({ x: ate[0], y: ate[1] }, {}, IE.doc);
        Object.assign(o, antes); IE.cor[0] = c0[0]; IE.cor[1] = c0[1];
        return KNV.info();
    },
    // traço de pincel (ou borracha) pelos pontos: tam (px), dureza (%), cor; alvo = 'mascara' pinta na máscara.
    // pts pode ser uma lista de traços ([[[x,y],...], [[x,y],...]]): todos viram UM passo do histórico
    pincel(pts, { tam = 10, dureza = 100, cor = '#ffffff', opac = 100, borracha = false, alvo } = {}) {
        const doc = IE.doc, tipo = borracha ? 'borracha' : 'pincel', o = IE.op[tipo], antes = { ...o }, c0 = IE.cor[0];
        Object.assign(o, { tam, dureza, opac }); IE.cor[0] = cor;
        if (alvo === 'mascara') doc.mascaraAlvo = true;
        const p = ([x, y]) => ({ x, y });
        const tracos = Array.isArray(pts[0][0]) ? pts : [pts];
        KNV.lote(() => tracos.forEach(t => {
            ieTracoIniciar(p(t[0]), { pressure: 1 }, doc, tipo);
            t.slice(1).forEach(q => ieTracoPara(p(q)));
            ieTracoFim();
        }), borracha ? 'Borracha' : 'Pincel');
        Object.assign(o, antes); IE.cor[0] = c0;
        return KNV.info();
    },
    // como uma Ação do Photoshop: tudo o que fn fizer vira um só passo do histórico (e um só redesenho)
    lote(fn, nome = 'Ação') {
        if (KNV._lote) return fn();
        const doc = IE.doc, hist = window.ieHist;
        let mudou = false;
        KNV._lote = true;
        window.ieHist = (n, d = IE.doc) => { if (d === doc) mudou = true; else hist(n, d); };
        try { return fn(); }
        finally {
            window.ieHist = hist; KNV._lote = false;
            if (mudou) hist(nome, doc);
        }
    },

    // Janela > Padrões > Definir padrão: o documento inteiro (ou a seleção) vira o padrão escolhido para Preencher > Padrão
    definirPadrao(nome = 'Padrão') {
        const d = IE.doc, R = d.sel ? ieRInter(ieRInt(d.sel.bbox), ieRDoc(d)) : ieRDoc(d);
        ieCompor(d, ieRDoc(d));
        const c = ieCanvas(R.w, R.h); ieCtx(c).drawImage(d.comp, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
        const id = Date.now().toString(36);
        iePrefGravar('padroes', [...ieJanLista('padroes'), { id, nome, url: c.toDataURL('image/png') }]);
        IE.op.padrao = 'u:' + id;
        iePadroesUsuario();
        return new Promise(r => setTimeout(() => r(IE.op.padrao), 300));   // a imagem do padrão carrega
    },
    // projeto do editor (.iknv): salvar e abrir para continuar de onde parou (camadas, máscaras, efeitos, texto)
    async salvar(path) { await ieSalvarIknv(IE.doc, path); IE.doc.sujo = false; return path; },
    async abrir(path) { await ieAbrirArquivo(path); await KNV._quadro(); return KNV.doc(); },
    async fecharDoc() { const d = IE.doc; if (d) await ieFecharDoc(d, true); return KNV.doc(); },
    async fecharTudo() { for (const d of IE.docs.slice()) await ieFecharDoc(d, true); return true; },

    // ── texto ──
    // texto novo: t = conteúdo ('\n' quebra linha); y = topo da 1ª linha; x = início (alin 'left'), meio ('center') ou
    // fim ('right') das linhas; caixa = [largura, altura] → texto de parágrafo com o canto de cima à esquerda em (x, y)
    async texto(t, { x = 0, y = 0, fonte = 'Arial', estilo = 'Regular', tam = 48, cor = '#ffffff', alin = 'left', esp = 0, ent = 0, caixa, nome, acima } = {}) {
        if (acima != null) KNV.ativar(acima);
        await ieCarregarFontes();
        const doc = IE.doc;
        const tx = { s: t, tam, cor, alin, esp, ent, caixa: caixa ? [0, 0, caixa[0], caixa[1]] : null, m: [1, 0, 0, 1, x, y] };
        ieAplicarEstiloFonte(tx, fonte, ieEstiloDe(fonte, estilo));
        await ieGarantirFonte(tx);
        if (!caixa) {   // texto de ponto: a matriz põe a LINHA DE BASE no y; desce a ascendente para o y ser o topo
            const asc = ieMedir(tx).measureText('Hg').fontBoundingBoxAscent || tam * 0.8;
            tx.m = [1, 0, 0, 1, x, y + asc];
        }
        const L = ieNovaCamada(doc, { tipo: 'texto', nome: nome || t.split('\n')[0].slice(0, 30), txt: tx, sujoPx: true });
        ieInserirAcima(doc, L, ieAtiva(doc));
        ieAtivar(L.id, doc);
        ieTextoRender(L);
        ieCamadaMudou(L);
        ieHist(ieT('Texto'));
        ieUiCamadas();
        await KNV._quadro();
        return KNV.info();
    },

    // ── estilo de camada (efeitos do Photoshop): tipo = sombra | brilho | tracado | corSob | degSob | padraoSob |
    //    sombraInt | brilhoInt | acetinado | chanfro; valores por cima dos padrões; somar = mais uma instância ──
    efeito(tipo, valores = {}, { somar = false } = {}) {
        const L = ieAtiva(IE.doc), R = ieRCamada(L);
        if (!IE_FX_PADRAO[tipo]) throw new Error(`efeito "${tipo}" não existe (${Object.keys(IE_FX_PADRAO).join(', ')})`);
        L.fx = ieFxNorm(L.fx || {}) || {};
        const novo = { ...ieFxNovo(tipo), ...valores };
        L.fx[tipo] = somar ? [...(L.fx[tipo] || []), novo] : [novo];
        L.fxMudou = true;
        ieInvalidar(L); ieCamadaMudou(L, R); ieHist(ieT('Estilo de camada')); ieUiCamadas();
        return KNV.info();
    },

    // ── formas de traço prontas (para KNV.pincel): cada uma devolve uma LISTA DE TRAÇOS [[[x,y],...], ...] ──
    formas: {
        linha: (a, b) => [[a, b]],
        // "- - -" de a até b (qualquer direção)
        tracejado(a, b, { seg = 16, vao = 12 } = {}) {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, out = [];
            const p = Math.max(1, seg + vao);
            for (let s = 0; s < L; s += p) { const e = Math.min(L, s + Math.max(1, seg)); out.push([[a[0] + ux * s, a[1] + uy * s], [a[0] + ux * e, a[1] + uy * e]]); }
            return out;
        },
        // zigue-zague (dentes) ou onda (seno) ao longo de a→b; alt = amplitude, passo = comprimento de um dente/onda
        zigue(a, b, { alt = 16, passo = 28 } = {}) { return KNV.formas._aoLongo(a, b, passo / 2, (k) => (k % 2 ? alt : 0)); },
        onda(a, b, { alt = 12, passo = 60 } = {}) { const n = 12; return KNV.formas._aoLongo(a, b, passo / n, k => alt * Math.sin(k / n * Math.PI * 2)); },
        _aoLongo(a, b, d, f) {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, pts = [];
            d = Math.max(1, d);
            for (let s = 0, k = 0; s <= L + 0.01; s += d, k++) { const o = f(k); pts.push([a[0] + ux * s - uy * o, a[1] + uy * s + ux * o]); }
            return [pts];
        },
        circulo(cx, cy, r, { de = 0, ate = 360 } = {}) { const pts = []; for (let t = de; t <= ate; t += 4) pts.push([cx + Math.cos(t * Math.PI / 180) * r, cy + Math.sin(t * Math.PI / 180) * r]); return [pts]; },
        espiral(cx, cy, r, { voltas = 1.6, sentido = 1 } = {}) {
            const pts = [], T = voltas * Math.PI * 2;
            for (let t = 0; t <= T; t += 0.12) { const rr = r * (1 - t / (T + 1)); pts.push([cx + Math.cos(t * sentido) * rr, cy + Math.sin(t * sentido) * rr]); }
            return [pts];
        },
        // coração de largura ~tam centrado em (cx, cy); listras = nº de riscos diagonais por dentro
        coracao(cx, cy, tam = 100, { listras = 0 } = {}) {
            const k = tam / 34, pts = [];
            for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.06) pts.push([cx + 16 * Math.sin(t) ** 3 * k, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k]);
            const out = [pts];
            for (let i = 1; i <= listras; i++) { const x = cx - tam * 0.4 + i * tam * 0.8 / (listras + 1); out.push([[x - tam * 0.12, cy + tam * 0.2], [x + tam * 0.12, cy - tam * 0.2]]); }
            return out;
        },
        estrela(cx, cy, r, { pontas = 5, interno = 0.45, ang = -90 } = {}) {
            const pts = []; for (let i = 0; i <= pontas * 2; i++) { const rr = i % 2 ? r * interno : r, t = (ang + i * 180 / pontas) * Math.PI / 180; pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]); }
            return [pts];
        },
        // ramo: haste a→b (curva = flecha em px, + = para a esquerda de a→b) com folhinhas em gota, fechadas, apontando
        // para frente e para fora (angulo° da haste); pares = folha dos dois lados em cada nó (laurel), senão alternadas;
        // as folhas diminuem no fim (ponta do ramo). Laurel centrado: dois ramos saindo do meio, um para cada lado.
        ramo(a, b, { passo = 30, folha = 18, pares = false, curva = 0, angulo = 40 } = {}) {
            const pt = t => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, f = 4 * t * (1 - t) * curva;
                return [a[0] + (b[0] - a[0]) * t + nx * f, a[1] + (b[1] - a[1]) * t + ny * f]; };
            const haste = []; for (let t = 0; t <= 1.0001; t += 0.05) haste.push(pt(t));
            const L = haste.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - haste[i - 1][0], p[1] - haste[i - 1][1]) : 0), 0), out = [haste];
            const gota = ([x, y], dx, dy, tam) => {   // contorno fechado, ponta fina: largura sen(πf)·(1−0.45f)·0.2 ao longo de dx,dy
                const c = []; for (let k = 0; k <= 24; k++) { const f = k <= 12 ? k / 12 : (24 - k) / 12, sd = k <= 12 ? 1 : -1, w = Math.sin(Math.PI * f) * (1 - 0.45 * f) * tam * 0.2 * sd;
                    c.push([x + dx * f * tam - dy * w, y + dy * f * tam + dx * w]); } return c; };
            for (let s = passo * 0.6, i = 0; s < L - passo * 0.3; s += passo, i++) {
                const t = s / L, p = pt(t), q = pt(Math.min(1, t + 0.01)), m = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, ux = (q[0] - p[0]) / m, uy = (q[1] - p[1]) / m;
                const tam = folha * (1 - 0.45 * t ** 2), lados = pares ? [1, -1] : [i % 2 ? -1 : 1];
                for (const l of lados) { const r = angulo * Math.PI / 180 * l, dx = ux * Math.cos(r) - uy * Math.sin(r), dy = ux * Math.sin(r) + uy * Math.cos(r); out.push(gota(p, dx, dy, tam)); }
            }
            return out;
        },
        // folha em traço: contorno + nervura central + nervuras laterais, de a (cabo) até b (ponta)
        folha(a, b, { larg = 0.3, nervuras = 4 } = {}) {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, P = (f, o) => [a[0] + ux * f - uy * o, a[1] + uy * f + ux * o];
            const cont = [];
            for (let t = 0; t <= Math.PI + 0.01; t += 0.1) cont.push(P(t / Math.PI * L, -Math.sin(t) * L * larg));
            for (let t = Math.PI; t >= -0.01; t -= 0.1) cont.push(P(t / Math.PI * L, Math.sin(t) * L * larg * 0.85));
            const out = [cont, [a, b]];
            for (let i = 1; i <= nervuras; i++) { const f = i * L / (nervuras + 1); out.push([P(f, 0), P(f + L * 0.1, -L * larg * 0.6)], [P(f, 0), P(f + L * 0.1, L * larg * 0.5)]); }
            return out;
        },
    },

    // ── revisor da peça (tools/revisor.py): os feedbacks do usuário viram regras. Cada achado = {regra, camada, problema,
    // dica}. Regras: corte (corte seco pelo KNV.revisar), contraste (texto × o que está atrás das letras, WCAG),
    // sombra (sombra projetada dura), avatar (camada presa num círculo: devolve o recorte para o rosto ser medido fora)
    async revisarPeca({ corte = true, minimo = 60, roteiro = null } = {}) {
        const d = IE.doc, out = [], lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const razao = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const folhas = [];
        iePercorrer(d.camadas, (L, l, i, pai) => { if (!L.filhos) folhas.push({ L, vis: L.visivel !== false && (!pai || pai.visivel !== false) }); });
        const lado = Math.min(d.w, d.h, ...(d.fatias || []).map(f => Math.min(f.w, f.h)));
        // 1) corte seco: foto cortada pela caixa/geração ou pela máscara, aparecendo
        // só foto/objeto recortado (original com transparência): caixa, painel e textura retos são de propósito
        const recortada = L => { const c = L.c0 && L.c0.c; if (!c) return false; const w = Math.min(64, c.width), h = Math.min(64, c.height), t = ieCanvas(w, h); ieCtx(t).drawImage(c, 0, 0, w, h);
            const p = ieCtx(t).getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < p.length; i += 4) if (p[i] < 20) n++; return n > w * h * 0.05; };
        const ignorar = folhas.filter(o => !recortada(o.L) || (o.L.cena && (o.L.cena.livre || o.L.cena.forma))).map(o => o.L.nome);   // decoração (eco, forma) tem borda reta de propósito
        if (corte) for (const r of window.KNV.revisar({ minimo, ignorar }).filter(r => /corte seco/.test(r.problema)))
            out.push({ regra: 'corte', camada: r.camada, problema: `${r.problema} de ${r.de} a ${r.ate}`, dica: 'caixa na proporção da foto (sem cover cortando a lateral), mascara_degrade, ou esconder atrás de um elemento' });
        // 2) contraste do texto com o que está atrás das letras (10º percentil: o pior trecho conta)
        for (const { L, vis } of folhas) {
            if (!vis || !L.txt || !L.c || (L.op ?? 1) < 0.3 || (L.cena && L.cena.livre === 'decor')) continue;
            const r = ieRaster(L); if (!r) continue;
            const f = r.forma || r, b = ieLimites(f.c); if (!b) continue;
            const R = { x: Math.max(0, f.x + b.x), y: Math.max(0, f.y + b.y) }; R.w = Math.min(d.w, f.x + b.x + b.w) - R.x; R.h = Math.min(d.h, f.y + b.y + b.h) - R.y;
            if (R.w < 2 || R.h < 2) continue;
            IE._pararEm = L; IE._parou = false;
            let fundo; try { fundo = ieAchatar(d, d.camadas, R); } finally { IE._pararEm = null; IE._parou = false; }
            const pf = ieCtx(fundo).getImageData(0, 0, R.w, R.h).data, pt = ieCtx(f.c).getImageData(R.x - f.x, R.y - f.y, R.w, R.h).data;
            const lt = lum(ieHexRgb(L.txt.cor || '#000000')), rz = [];
            for (let i = 0; i < pt.length; i += 4 * 3) if (pt[i + 3] > 160) rz.push(razao(lt, lum([pf[i], pf[i + 1], pf[i + 2]])));
            if (rz.length < 20) continue;
            rz.sort((a, b) => a - b);
            const p10 = rz[Math.floor(rz.length * 0.1)], tam = L.txt.tam * ieTextoEscala(L.txt) * 1080 / lado, min = tam >= 40 ? 3 : 4.5;
            const ajuda = L.fx && ((L.fx.tracado || []).some(e => e.on && e.tam >= 2) || (L.fx.sombra || []).some(e => e.on && e.op >= 40));
            if (p10 < min && !ajuda) out.push({ regra: 'contraste', camada: L.nome, problema: `contraste ${p10.toFixed(1)} (mín. ${min}) em ${Math.round(tam)}px`, caixa: R, dica: 'mancha escura macia por baixo (KNV.receita.leitura), caixa, ou cor do texto mais clara/escura' });
        }
        // 3) sombra projetada dura (pouco desfoque para a força)
        for (const { L, vis } of folhas) {
            if (!vis || !L.fx || L.fxOculto) continue;
            for (const e of L.fx.sombra || []) if (e.on && e.op >= 30 && e.tam > 0.5 && e.tam < lado * 0.025)   // desfoque 0 = adesivo de propósito
                out.push({ regra: 'sombra', camada: L.nome, problema: `sombra dura (desfoque ${Math.round(e.tam)}px, ${Math.round(e.op)}%)`, dica: 'desfoque ≥ 3% do lado, opacidade ~22%, cor do fundo escurecida' });
        }
        // 4) avatar: camada presa (máscara de corte) numa base redonda — o rosto é medido fora (Python, OpenCV)
        const avatares = [];
        iePercorrer(d.camadas, (L, l, i, pai) => {
            if (!L.clip || !L.c || L.visivel === false) return;
            const lista = pai ? pai.filhos : d.camadas;
            let k = lista.indexOf(L) - 1; while (k >= 0 && lista[k].clip) k--;
            const B = lista[k]; if (!B || !B.c) return;
            const rb = ieRaster(B), fb = rb && (rb.forma || rb), bb = fb && ieLimites(fb.c); if (!bb) return;
            const ab = ieCtx(fb.c).getImageData(bb.x, bb.y, 2, 2).data[3];   // canto da caixa vazio = base redonda
            if (ab > 40 || Math.abs(bb.w - bb.h) > bb.w * 0.15) return;
            const C = { x: fb.x + bb.x, y: fb.y + bb.y, w: bb.w, h: bb.h }, m = Math.round(C.w), Rr = { x: C.x - m, y: C.y - m, w: C.w + 2 * m, h: C.h + 2 * m };
            const rl = ieRaster(L), fl = rl.forma || rl, c = ieCanvas(Rr.w, Rr.h), k2 = ieCtx(c);
            k2.fillStyle = '#808080'; k2.fillRect(0, 0, Rr.w, Rr.h); k2.drawImage(fl.c, fl.x - Rr.x, fl.y - Rr.y);
            avatares.push({ camada: L.nome, circulo: { x: C.x - Rr.x, y: C.y - Rr.y, d: C.w }, png: c.toDataURL('image/png').split(',')[1] });
        });
        for (const a of window.KNV.revisarDirecao({ roteiro })) out.push(a);
        return { achados: out, avatares };
    },

    // ── revisor de DIREÇÃO (feedback 2026-10-06: carrossel de outro agente saiu genérico, "landing page"): por slide
    // (fatias da cena; sem fatias = a página). Regras: hierarquia (gancho ≥ 2× o corpo), gancho (≤ 8 palavras),
    // texto (corpo ≤ 40 palavras), respiro (texto ocupando > 38% do slide), vetor (desenho SVG solto tapando espaço),
    // asset (slide sem foto/objeto gerado: sem humanização), ponte (carrossel sem nada cruzando a divisa entre slides),
    // roteiro (frase do roteiro que não entrou: roteiro = [[frases do slide 1], [frases do slide 2], ...]).
    // Papel do texto: data-papel no HTML, senão h1/h2/p (ieCenaPapel).
    revisarDirecao({ roteiro = null } = {}) {
        const d = IE.doc, out = [], lado = Math.min(d.w, d.h, ...(d.fatias || []).map(f => Math.min(f.w, f.h)));
        // slides = fatias da altura toda (as da cena se chamam 01, 02...; fatiadas à mão podem não ter nome)
        const fat = (d.fatias || []).filter(f => f.y === 0 && f.h === d.h && f.w < d.w).sort((a, b) => a.x - b.x)
            .map((f, i) => ({ ...f, nome: f.nome || String(i + 1).padStart(2, '0') }));
        const slides = fat.length > 1 ? fat : [{ x: 0, y: 0, w: d.w, h: d.h, nome: 'página' }];
        const itens = [];
        iePercorrer(d.camadas, (L, l, i, pai) => {
            if (L.filhos || L.visivel === false || (pai && pai.visivel === false) || !L.c || L.tipo === 'ajuste' || (L.op ?? 1) < 0.25) return;
            const r = ieRaster(L); if (!r) return;
            const f = r.forma || r, b = ieLimites(f.c); if (!b) return;
            itens.push({ L, R: { x: f.x + b.x, y: f.y + b.y, w: b.w, h: b.h } });
        });
        const inter = (R, S) => Math.max(0, Math.min(R.x + R.w, S.x + S.w) - Math.max(R.x, S.x)) * Math.max(0, Math.min(R.y + R.h, S.y + S.h) - Math.max(R.y, S.y));
        const palavras = s => (String(s || '').match(/[\p{L}\p{N}]+/gu) || []).length;
        const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const semAsset = [];
        slides.forEach((S, si) => {
            const nome = slides.length > 1 ? `slide ${S.nome}` : 'página', A = S.w * S.h;
            const doSlide = itens.filter(o => inter(o.R, S) > o.R.w * o.R.h * 0.5);
            const textos = doSlide.filter(o => o.L.txt && o.L.txt.s).map(o => ({ ...o, tam: o.L.txt.tam * ieTextoEscala(o.L.txt) * 1080 / lado, papel: o.L.cena && o.L.cena.papel }));
            const leitura = textos.filter(t => t.papel !== 'meta' && t.papel !== 'cta' && t.papel !== 'etiqueta');
            // hierarquia: gancho/título bem maior que o corpo
            if (leitura.length >= 2) {
                // papel declarado (data-papel/h1) manda; senão: o maior é o título e o corpo é o maior abaixo de 60% dele
                const ganchos = leitura.filter(t => t.papel === 'gancho'), top = Math.max(...(ganchos.length ? ganchos : leitura).map(t => t.tam));
                const corpo = leitura.filter(t => ganchos.length ? t.papel !== 'gancho' && t.papel !== 'subtitulo' : t.tam < top * 0.6);
                const base = corpo.length ? Math.max(...corpo.map(t => t.tam)) : Math.min(...leitura.map(t => t.tam));
                if (base && top >= base * 1.3 && top / base < 2) out.push({ regra: 'hierarquia', camada: nome, problema: `título só ${(top / base).toFixed(1)}× o corpo (${Math.round(top)} × ${Math.round(base)}px)`, dica: 'gancho ≥ 2× o corpo, ideal 3–4× (ex.: 96–140px × 34–42px no 1080); menos níveis, mais contraste de peso' });
            }
            // leitura limpa (feedback 2026-10-06: "palavras em cima de outras atrapalhando, tem que ter margem e respiro"):
            // texto sobre texto (pixels das letras se tocando), texto fora da margem de 5% e corpo colado no título
            const firmes = textos.filter(t => t.papel !== 'meta' && !(t.L.cena && t.L.cena.livre)), m = Math.round(lado * 0.05);   // cta e etiqueta também não podem atropelar
            const decor = itens.filter(o => o.L.cena && (o.L.txt && o.L.cena.livre === 'decor' || (o.L.cena.forma && o.L.cena.forma !== 'fundo')) && inter(o.R, S) > 0);   // fita e formas por cima de texto também contam (supergráfico/órbita de fundo: só contraste)   // fita por cima de texto também conta
            const pares = []; firmes.forEach((x, i) => { firmes.slice(i + 1).forEach(y => pares.push([x, y])); decor.forEach(y => pares.push([x, y])); });
            for (const [A1, B1] of pares) {
                const I = { x: Math.max(A1.R.x, B1.R.x), y: Math.max(A1.R.y, B1.R.y) };
                I.w = Math.min(A1.R.x + A1.R.w, B1.R.x + B1.R.w) - I.x; I.h = Math.min(A1.R.y + A1.R.h, B1.R.y + B1.R.h) - I.y;
                if (I.w < 2 || I.h < 2) continue;
                const pix = o => { const r = ieRaster(o.L), f = r.forma || r; return ieCtx(f.c).getImageData(I.x - f.x, I.y - f.y, I.w, I.h).data; };
                const pa = pix(A1), pb = pix(B1); let n = 0;
                for (let q = 3; q < pa.length; q += 8) if (pa[q] > 90 && pb[q] > 90) n++;
                if (n > 12) out.push({ regra: 'atropelo', camada: `${A1.L.nome} × ${B1.L.nome}`, problema: `letras uma em cima da outra (${nome})`, dica: 'mover/encolher um dos blocos; texto só cruza texto se for palavra-eco clarinha atrás (k-eco)' });
            }
            for (const t of firmes) { const dist = Math.min(t.R.x - S.x, t.R.y - S.y, S.x + S.w - t.R.x - t.R.w, S.y + S.h - t.R.y - t.R.h);
                if (dist < m) out.push({ regra: 'margem', camada: t.L.nome, problema: `texto a ${Math.round(dist)}px da borda do ${nome} (margem ${m})`, dica: 'tudo que se lê fica ≥ 5% para dentro; só fita/eco/objeto sangram' }); }
            const tits = firmes.filter(t => t.papel === 'gancho'), corp = firmes.filter(t => t.papel === 'corpo');
            for (const c of corp) for (const g of tits) {
                if (c.R.x > g.R.x + g.R.w || g.R.x > c.R.x + c.R.w || c.R.y < g.R.y) continue;
                const vao = c.R.y - (g.R.y + g.R.h);
                if (vao >= 0 && vao < g.tam * 0.35) { out.push({ regra: 'respiro', camada: `${g.L.nome} → ${c.L.nome}`, problema: `corpo a ${Math.round(vao)}px do título (mín. ~${Math.round(g.tam * 0.35)})`, dica: 'separe os níveis: o vão título→corpo é maior que o vão entre parágrafos' }); break; }
            }
            for (const t of textos) if (t.papel === 'gancho' && palavras(t.L.txt.s) > 8)
                out.push({ regra: 'gancho', camada: t.L.nome, problema: `gancho com ${palavras(t.L.txt.s)} palavras`, dica: 'até 6–8 palavras; o resto vai para o subtítulo' });
            const nc = textos.filter(t => t.papel === 'corpo').reduce((s, t) => s + palavras(t.L.txt.s), 0);
            if (nc > 40) out.push({ regra: 'texto', camada: nome, problema: `${nc} palavras de corpo`, dica: 'até ~40 por slide: corte, divida em dois slides ou vire lista curta' });
            // respiro: área dos blocos de texto (caixa de cada camada) no slide
            const at = textos.reduce((s, t) => s + inter(t.R, S), 0) / A;
            if (at > 0.38) out.push({ regra: 'respiro', camada: nome, problema: `texto ocupa ${Math.round(at * 100)}% do slide`, dica: 'menos texto ou letra menor no corpo; deixe ≥ 60% para imagem e vazio' });
            // forma da IDV sem função: não encosta em objeto/foto nem atravessa a divisa (apoio ou ligação)
            const fotos = doSlide.filter(o => o.L.tipo === 'inteligente');
            for (const o of doSlide.filter(o => o.L.cena && (o.L.cena.forma === 'forma' || o.L.cena.forma === 'fundo'))) {
                const cruza = o.R.x < S.x - 20 || o.R.x + o.R.w > S.x + S.w + 20, apoia = fotos.some(f => inter(o.R, f.R) > o.R.w * o.R.h * 0.08);
                if (!cruza && !apoia) out.push({ regra: 'forma', camada: o.L.nome, problema: `forma solta no ${nome} (sem apoiar objeto nem ligar slides)`, dica: 'forma só com função: apoio atrás/abaixo do objeto, traço atravessando a divisa, ou tirar' });
            }
            // vetor solto tapando espaço
            const soltos = doSlide.filter(o => o.L.cena && o.L.cena.svg === 'livre' && o.R.w * o.R.h > A * 0.015);
            if (soltos.length) out.push({ regra: 'vetor', camada: soltos.map(o => o.L.nome).join(', '), problema: `${soltos.length} desenho(s) SVG solto(s) no ${nome}`, dica: 'trocar por objeto/pessoa gerado (gerar: / recurso:) interagindo com o texto; SVG só em componente (k-*) ou com data-proposito' });
            // asset: foto ou objeto (inteligente, normal, de tamanho) no slide
            const asset = doSlide.some(o => o.L.tipo === 'inteligente' && (!o.L.bm || o.L.bm === 'NORMAL' || o.L.bm === 'PASS') && inter(o.R, S) > A * 0.04);
            if (!asset) semAsset.push(S.nome);
            // roteiro
            const fr = roteiro && roteiro[si];
            if (fr) {   // por palavras (a marcação vira camada própria e muda a ordem das camadas)
                const tem = new Map(); for (const w of norm(textos.map(t => t.L.txt.s).join(' ')).split(' ')) tem.set(w, (tem.get(w) || 0) + 1);
                const falta = s => { const c = new Map(tem); return norm(s).split(' ').some(w => w && !(c.get(w) > 0 && c.set(w, c.get(w) - 1))); };
                for (const s of [].concat(fr)) if (s && falta(s)) out.push({ regra: 'roteiro', camada: nome, problema: `faltou: "${String(s).slice(0, 60)}"`, dica: 'o texto do roteiro entra inteiro (pode quebrar linha, não reescrever)' }); }
        });
        if (semAsset.length && (slides.length === 1 || semAsset.length > slides.length / 3))
            out.push({ regra: 'asset', camada: semAsset.join(', '), problema: `${semAsset.length} de ${slides.length} sem foto/objeto`, dica: 'pessoa ou objeto gerado (gerar:, data-fundo="branco", data-pele) num lugar que converse com o texto, sem cobrir a leitura' });
        // ponte: algo atravessando a divisa entre slides vizinhos (fundo inteiro não conta)
        if (slides.length > 1) {
            const cruza = itens.some(({ R }) => R.w < d.w * 0.9 && slides.slice(0, -1).some((S, i) => { const x = slides[i + 1].x;
                return slides[i + 1].y === S.y && R.x < x - S.w * 0.03 && R.x + R.w > x + S.w * 0.03; }));
            if (!cruza) out.push({ regra: 'ponte', camada: 'carrossel', problema: 'nada cruza a divisa entre slides', dica: 'um objeto, seta, linha ou foto atravessando a divisa puxa o arraste (pelo menos 1–2 pontes)' });
        }
        return out;
    },

    // ── revisor de design: o que um diretor de arte apontaria antes de entregar ──
    // corte seco (borda reta e dura de foto/recorte que aparece: limite do quadro da foto, ombro cortado),
    // camada fora da página, texto colado na borda, camada vazia. Devolve [{camada, problema, ...}].
    // ignorar = nomes de camadas cuja borda reta é de propósito (ex.: um retângulo da composição)
    // margem = área de segurança (padrão 5% do lado menor): texto e `elementos` (nomes) não passam dela.
    // Texto atropelando texto: pixels de dois textos a menos de `respiro` px um do outro (dois nomes em `juntos`
    // = [['Título Baile','Título da']] encaixados de propósito; `colidem` = outras camadas que contam como texto, ex. 'Rabiscos'). protegidas = [{nome:'rosto', caixa:[x,y,w,h], de:'Mulher'}]:
    // camada acima de `de` cobrindo mais de 2% da caixa (folha na frente do rosto).
    revisar({ ignorar = [], margem, minimo = 50, elementos = [], respiro = 6, juntos = [], protegidas = [], colidem = [] } = {}) {
        const doc = IE.doc, W = doc.w, H = doc.h, out = [];
        margem ??= Math.round(Math.min(W, H) * 0.05);
        const folhas = [];
        iePercorrer(doc.camadas, (L, l, i, pai) => { if (!L.filhos) folhas.push({ L, vis: L.visivel !== false && (!pai || pai.visivel !== false) }); });
        folhas.forEach(({ L, vis }, idx) => {
            if (!vis || !L.c) return;
            const r = ieRaster(L);
            if (!r) return;
            const f = r.forma || r, w = f.c.width, h = f.c.height;
            const a = ieCtx(f.c).getImageData(0, 0, w, h).data;
            const b = ieLimites(f.c);
            if (!b) { out.push({ camada: L.nome, problema: 'vazia' }); return; }
            const R = { x: f.x + b.x, y: f.y + b.y, w: b.w, h: b.h };
            if (R.x >= W || R.y >= H || R.x + R.w <= 0 || R.y + R.h <= 0) { out.push({ camada: L.nome, problema: 'fora da página', caixa: R }); return; }
            if (L.tipo === 'texto' || elementos.includes(L.nome)) {
                const d = Math.min(R.x, R.y, W - R.x - R.w, H - R.y - R.h);
                if (d < margem) out.push({ camada: L.nome, problema: `${L.tipo === 'texto' ? 'texto' : 'elemento'} a ${Math.round(d)}px da borda (margem ${margem})`, caixa: R });
                if (L.tipo === 'texto') return;
            }
            if (ignorar.includes(L.nome) || L.clip || L.tipo === 'ajuste') return;
            // bordas duras: opaco (≥200) com transparente (≤25) a 2px numa das 4 direções
            const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[(y * w + x) * 4 + 3]);
            const ex = [], ey = [];
            for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
                if (A(x, y) < 200) continue;
                if (A(x - 2, y) <= 25 || A(x + 2, y) <= 25 || A(x, y - 2) <= 25 || A(x, y + 2) <= 25) { ex.push(x + f.x); ey.push(y + f.y); }
            }
            if (ex.length < minimo) return;
            // o que cobre essa camada (camadas normais e opacas acima dela)
            const acima = folhas.slice(idx + 1).filter(o => o.vis && o.L.c && !o.L.clip && o.L.tipo !== 'ajuste' && (o.L.op ?? 1) >= 0.6 && (!o.L.bm || o.L.bm === 'NORMAL' || o.L.bm === 'PASS')).map(o => o.L);
            const cob = acima.length ? ieCtx(ieAchatar(doc, acima)).getImageData(0, 0, W, H).data : null;
            const visivel = (x, y) => x >= 3 && y >= 3 && x < W - 3 && y < H - 3 && (!cob || cob[(Math.round(y) * W + Math.round(x)) * 4 + 3] < 128);
            // Hough: retas com muitos pontos de borda dura
            const usado = new Uint8Array(ex.length), achados = [];
            const D = Math.ceil(Math.hypot(W + w, H + h)) + 2, cont = new Int32Array(2 * D + 1);
            const passoV = Math.max(1, Math.floor(ex.length / 15000));   // muitos pontos: vota com uma amostra
            for (let volta = 0; volta < 4; volta++) {
                let melhor = null;
                for (let g = 0; g < 180; g += 1) {
                    const t = g * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
                    cont.fill(0);
                    for (let i = 0; i < ex.length; i += passoV) { if (usado[i]) continue; cont[Math.round(ex[i] * ct + ey[i] * st) + D]++; }
                    for (let k = 0; k < cont.length; k++) if (cont[k] && (!melhor || cont[k] > melhor.n)) melhor = { g, rho: k - D, n: cont[k] };
                }
                if (melhor) melhor.n *= passoV;
                if (!melhor || melhor.n < minimo) break;
                const t = melhor.g * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
                const pts = [];
                for (let i = 0; i < ex.length; i++) if (!usado[i] && Math.abs(ex[i] * ct + ey[i] * st - melhor.rho) <= 1) { usado[i] = 1; pts.push([ex[i], ey[i], -ex[i] * st + ey[i] * ct]); }
                pts.sort((p, q) => p[2] - q[2]);
                // trechos contínuos E visíveis
                // corte de quadro tem corpo: de um lado ≥ 20px opacos seguidos, do outro ≥ 40px vazios
                // (fenda de folha, pétala fina e vão entre folhas não passam)
                const corpo = (x, y) => {
                    const lx = x - f.x, ly = y - f.y, lado = s => { let op = 0, va = 0;
                        for (let k = 1; k <= 20; k++) { if (A(Math.round(lx + ct * k * s), Math.round(ly + st * k * s)) >= 200) op++; else break; }
                        for (let k = 2; k <= 41; k++) { if (A(Math.round(lx - ct * k * s), Math.round(ly - st * k * s)) <= 25) va++; else break; }
                        return op >= 19 && va >= 40; };
                    return lado(1) || lado(-1);
                };
                let ini = null, ult = null, n = 0, bons = 0;
                const fecha = () => { if (ini && ult && ult[2] - ini[2] >= minimo && bons >= n * 0.7) achados.push({ de: [Math.round(ini[0]), Math.round(ini[1])], ate: [Math.round(ult[0]), Math.round(ult[1])], comp: Math.round(ult[2] - ini[2]), angulo: (melhor.g + 90) % 180 }); ini = ult = null; n = bons = 0; };
                for (const p of pts) {
                    if (!visivel(p[0], p[1])) { fecha(); continue; }
                    if (ult && p[2] - ult[2] > 2.5) fecha();
                    if (!ini) ini = p;
                    ult = p;
                    if (n++ % 3 === 0 && corpo(p[0], p[1])) bons += 3;
                }
                fecha();
            }
            achados.sort((p, q) => q.comp - p.comp).slice(0, 3).forEach(c => out.push({ camada: L.nome, problema: `corte seco de ${c.comp}px`, ...c }));
        });
        // ocupação de cada camada numa grade de 4px (alfa ≥ 64), para colisões e áreas protegidas
        const Q = 4, GW = Math.ceil(W / Q), GH = Math.ceil(H / Q);
        const ocup = L => {
            const r = ieRaster(L); if (!r) return null;
            const f = r.forma || r, w = f.c.width, h = f.c.height, a = ieCtx(f.c).getImageData(0, 0, w, h).data, g = new Uint8Array(GW * GH);
            for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
                if (a[(y * w + x) * 4 + 3] < 64) continue;
                const gx = Math.floor((x + f.x) / Q), gy = Math.floor((y + f.y) / Q);
                if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) g[gy * GW + gx] = 1;
            }
            return g;
        };
        const textos = folhas.filter(o => o.vis && (o.L.tipo === 'texto' || colidem.includes(o.L.nome))).map(o => ({ L: o.L, g: ocup(o.L) })).filter(t => t.g);
        const raio = Math.max(1, Math.round(respiro / Q));
        for (let i = 0; i < textos.length; i++) {
            // dilata o texto i pelo respiro e conta as células do j que caem dentro
            const d = new Uint8Array(GW * GH), gi = textos[i].g;
            for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (gi[y * GW + x])
                for (let v = -raio; v <= raio; v++) for (let u = -raio; u <= raio; u++) { const X = x + u, Y = y + v; if (X >= 0 && Y >= 0 && X < GW && Y < GH) d[Y * GW + X] = 1; }
            for (let j = i + 1; j < textos.length; j++) {
                const A = textos[i].L.nome, B = textos[j].L.nome;
                if (juntos.some(p => p.includes(A) && p.includes(B))) continue;
                let n = 0, sx = 0, sy = 0; const gj = textos[j].g;
                for (let k = 0; k < gj.length; k++) if (gj[k] && d[k]) { n++; sx += k % GW; sy += Math.floor(k / GW); }
                if (n >= 3) out.push({ camada: A, problema: `texto atropela "${B}" (${n * Q * Q}px² a menos de ${respiro}px)`, de: [Math.round(sx / n * Q), Math.round(sy / n * Q)] });
            }
        }
        for (const p of protegidas) {
            const [px, py, pw, ph] = p.caixa, iDe = folhas.findIndex(o => o.L.nome === p.de);
            const x0 = Math.floor(px / Q), y0 = Math.floor(py / Q), x1 = Math.ceil((px + pw) / Q), y1 = Math.ceil((py + ph) / Q), tot = (x1 - x0) * (y1 - y0);
            folhas.forEach((o, idx) => {
                if (idx <= iDe || !o.vis || !o.L.c || o.L.clip || o.L.tipo === 'ajuste' || (o.L.op ?? 1) < 0.3 || ignorar.includes(o.L.nome)) return;
                const g = ocup(o.L); if (!g) return;
                let n = 0; for (let y = Math.max(0, y0); y < Math.min(GH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(GW, x1); x++) n += g[y * GW + x];
                if (n / tot > 0.02) out.push({ camada: o.L.nome, problema: `cobre ${Math.round(n / tot * 100)}% de ${p.nome || 'área protegida'}`, caixa: { x: px, y: py, w: pw, h: ph } });
            });
        }
        return out;
    },

    // ── mapa: "ver" o documento em números, sem print ──
    // Uma linha por camada visível (de cima para baixo): #ref nome [tipo] caixa x,y wxh · centro · rot° · escala ·
    // op% · modo · vis% (quanto dela aparece no resultado) · cor dominante; e a grade de ocupação: em cada célula,
    // a #ref da camada que aparece por cima (· = nenhuma). mudancas = true devolve só o que mudou desde o último mapa.
    mapa({ grade = [12, 15], mudancas = false } = {}) {
        const doc = IE.doc, W = doc.w, H = doc.h, [GC, GL] = grade;
        const lista = [];
        iePercorrer(doc.camadas, (L, l, i, pai) => { if (!L.filhos && L.c && L.visivel !== false && (!pai || pai.visivel !== false)) lista.push(L); });
        lista.reverse();   // de cima para baixo
        const dados = lista.map(L => {
            const r = ieRaster(L), f = r && (r.forma || r);
            return { L, f, a: f ? ieCtx(f.c).getImageData(0, 0, f.c.width, f.c.height).data : null };
        });
        const alfa = (d, x, y) => { const f = d.f; if (!f) return 0; const lx = Math.floor(x - f.x), ly = Math.floor(y - f.y); return lx < 0 || ly < 0 || lx >= f.c.width || ly >= f.c.height ? 0 : d.a[(ly * f.c.width + lx) * 4 + 3]; };
        // amostragem: quem está por cima em cada ponto (camadas normais e quase opacas cobrem; ajustes e modos não)
        const cobre = d => (d.L.op ?? 1) >= 0.6 && (!d.L.bm || d.L.bm === 'NORMAL' || d.L.bm === 'PASS') && d.L.tipo !== 'ajuste';
        const topo = (x, y) => { for (let i = 0; i < dados.length; i++) if (cobre(dados[i]) && alfa(dados[i], x, y) >= 128) return i; return -1; };
        const visto = new Array(dados.length).fill(0), total = new Array(dados.length).fill(0);
        const PASSO = Math.max(6, Math.round(Math.max(W, H) / 160));
        for (let y = PASSO / 2; y < H; y += PASSO) for (let x = PASSO / 2; x < W; x += PASSO) {
            const t = topo(x, y); if (t >= 0) visto[t]++;
            for (let i = 0; i < dados.length; i++) if (alfa(dados[i], x, y) >= 128) total[i]++;
        }
        const linhas = dados.map((d, i) => {
            const L = d.L, b = d.f && ieLimites(d.f.c);
            if (!b) return { k: L.id, s: `#${i + 1} ${L.nome} [${L.tipo}] vazia` };
            const x = d.f.x + b.x, y = d.f.y + b.y;
            const m = L.txt ? L.txt.m : L.tf;
            const esp = m && m[0] * m[3] - m[1] * m[2] < 0, rot = m ? Math.round(Math.atan2(esp ? -m[1] : m[1], esp ? -m[0] : m[0]) * 180 / Math.PI) : 0, esc = m ? +Math.hypot(m[0], m[1]).toFixed(2) : 1;
            // cor dominante: média dos pixels opacos (amostra)
            let s = [0, 0, 0], n = 0; const w = d.f.c.width;
            for (let yy = b.y; yy < b.y + b.h; yy += 7) for (let xx = b.x; xx < b.x + b.w; xx += 7) { const o = (yy * w + xx) * 4; if (d.a[o + 3] >= 128) { s[0] += d.a[o]; s[1] += d.a[o + 1]; s[2] += d.a[o + 2]; n++; } }
            const cor = n ? '#' + s.map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('') : '-';
            const vis = total[i] ? Math.round(visto[i] / total[i] * 100) : 0;
            const extra = [esp ? 'espelhado' : '', rot ? `rot ${rot}°` : '', esc !== 1 ? `esc ${esc}` : '', L.op < 1 ? `op ${Math.round(L.op * 100)}%` : '', L.bm && L.bm !== 'NORMAL' ? L.bm : '',
                L.m ? 'másc' : '', L.clip ? 'clip' : '', L.txt ? `"${L.txt.s.slice(0, 24)}"` : ''].filter(Boolean).join(' · ');
            return { k: L.id, s: `#${i + 1} ${L.nome} [${L.tipo}] ${x},${y} ${b.w}x${b.h} c${Math.round(x + b.w / 2)},${Math.round(y + b.h / 2)}${extra ? ' · ' + extra : ''} · vis ${vis}% · ${cor}` };
        });
        const sym = i => (i < 0 ? '·' : (i + 1).toString(36));
        const g = [];
        for (let l = 0; l < GL; l++) { let s = ''; for (let c = 0; c < GC; c++) s += sym(topo((c + 0.5) * W / GC, (l + 0.5) * H / GL)).padStart(2); g.push(s); }
        const texto = linhas.map(x => x.s);
        if (mudancas && KNV._mapaAnt) {
            const ant = KNV._mapaAnt, novas = texto.filter(s => !ant.has(s.replace(/^#\d+ /, '')));
            KNV._mapaAnt = new Set(texto.map(s => s.replace(/^#\d+ /, '')));
            return [`${W}x${H} — ${novas.length} camada(s) mudaram:`, ...novas].join('\n');
        }
        KNV._mapaAnt = new Set(texto.map(s => s.replace(/^#\d+ /, '')));
        return [`${W}x${H}, ${dados.length} camadas visíveis (de cima para baixo; #1..9 a..z na grade)`, ...texto,
            `grade ${GC}x${GL} (célula ${Math.round(W / GC)}x${Math.round(H / GL)}px):`, ...g].join('\n');
    },

    // ── guias e fatias (como no Photoshop: Exibir > Guias > Novo layout de guias; ferramenta Fatia > Fatias das guias) ──
    // layoutGuias({colunas: {n, largura, medianiz}, linhas: {n, altura, medianiz}, margem: {sup, esq, inf, dir}, centralizar,
    //   cor, alvo: 'tela'|'pranchetas'|'selecionadas', limpar = true}) → guias; carrossel: {colunas: {n: 5, medianiz: 0}}
    layoutGuias(o = {}) { return ieGuiasLayoutAplicar(IE.doc, o, o.limpar !== false); },
    novaGuia(o, p, cor) { return ieNovaGuia(IE.doc, { o, p, cor }); },
    guias() { return (IE.doc && IE.doc.guias || []).map(g => ({ ...g })); },
    limparGuias() { ieGuiasLimpar(IE.doc, 'todas'); return []; },
    guiasDaForma() { ieGuiasDaForma(IE.doc); return KNV.guias(); },
    // uma fatia por célula entre as guias, na ordem de leitura (apaga as que existem) → [{x, y, w, h}]
    fatiasDasGuias() { return ieFatiasDasGuias(IE.doc, { perguntar: false }).map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h })); },
    ajustar(ligar = true, a) { iePrefGravar('ajustar', !!ligar); if (a) iePrefGravar('ajustarA', { ...ieAjustarA(), ...a }); return { ajustar: ieAjustarLigado(), a: ieAjustarA() }; },

    // ── CENA: a peça escrita em HTML/CSS vira camadas nativas (imagem-cena.js; guia Instructions/agente/plano-cena.md).
    //    opções: formato ('quadrado'|'feed'|'retrato'|'story'|'paisagem'|'a4') ou w/h, nome, base (pasta dos caminhos
    //    relativos), novo (true = documento novo; padrão: novo se o documento atual não veio de uma cena), margem (px),
    //    refazer (true | [nomes]: refaz também as camadas mexidas). Devolve {camadas, mantidas, avisos, ms}.
    async cena(html, opc = {}) { const r = await ieCena(html, opc); await KNV._quadro(); return r; },
    cenaFonte() { return IE.doc && IE.doc.cena ? IE.doc.cena.html : null; },
    // carrossel → um arquivo por slide (pasta/base_01.png...); sem slides, o documento inteiro. {fmt: png|jpg|webp, q, base, escala}
    async exportar(pasta, opc = {}) { return ieCenaExportar(pasta, opc); },
    // kit de marca: variáveis CSS em toda cena ({'cor-primaria': '#ff5e3a', 'fonte-titulo': 'Poppins'} → var(--cor-primaria));
    // sem argumento devolve o kit; null apaga
    marca(vars) { if (vars !== undefined) iePrefGravar('marca', vars); return iePref('marca', null); },
    // instala uma família do Google Fonts (ex.: 'Neonderthaw', 'Big Shoulders Stencil Display') e relê as fontes do editor
    async instalarFonte(familia) {
        const r = await window.pywebview.api.ie_instalar_fonte(familia);
        if (!r || !r.success) throw new Error((r && r.error) || 'não instalou');
        IE.estilos = null; IE.fontes = null;
        await ieCarregarFontes();
        return { familia, estilos: (IE.estilos[familia] || []).map(e => e.estilo), arquivos: r.arquivos };
    },
    // famílias instaladas (filtro = pedaço do nome); com estilos: {família: ['Regular', 'Bold'...]}
    async fontes(filtro = '', { estilos = false } = {}) {
        const e = await ieCarregarFontes(), f = String(filtro).toLowerCase();
        const nomes = Object.keys(e).filter(n => !f || n.toLowerCase().includes(f)).sort();
        return estilos ? Object.fromEntries(nomes.map(n => [n, e[n].map(x => x.estilo)])) : nomes;
    },

    // ── olhar barato, variações, etapas, referência, recursos (tools/knv.py usa estes) ──
    // JPEG pequeno de uma região (ou de um slide do carrossel: {slide: 2}); escala padrão 0.4. Sem camada "Referência".
    ver({ x = 0, y = 0, w, h, slide, escala = 0.4, q = 0.82 } = {}) {
        const d = IE.doc, S = d.cena && d.cena.slide;
        if (slide && S) { x = (slide - 1) * S.w; y = 0; w = S.w; h = S.h; }
        w = w || d.w - x; h = h || d.h - y;
        const ref = ieTodas(d).find(L => L.referencia), vis = ref && ref.visivel;
        if (ref) ref.visivel = false;
        ieCompor(d);
        const c = ieCanvas(Math.max(1, Math.round(w * escala)), Math.max(1, Math.round(h * escala))), x2 = ieCtx(c);
        x2.fillStyle = '#fff'; x2.fillRect(0, 0, c.width, c.height);
        x2.imageSmoothingQuality = 'high'; x2.drawImage(d.comp, x, y, w, h, 0, 0, c.width, c.height);
        if (ref) { ref.visivel = vis; ieCompor(d); }
        return c.toDataURL('image/jpeg', q);
    },
    // variações lado a lado num JPEG (para escolher sem rodar várias vezes):
    //   {camada: 'cavalo', filtro: 'aj:matiz', lista: [{h: 30, s: -40}, ...]}  → valores do filtro inteligente (cria se não tem)
    //   {ajuste: 'Acabamento (Camera Raw)', lista: [{clar: 10}, ...]}         → valores da camada de ajuste
    //   regiao {x, y, w, h} (padrão: a caixa da camada), escala. Volta ao que era no fim.
    variacoes({ camada, filtro, ajuste, lista = [], regiao, escala = 0.5 } = {}) {
        const d = IE.doc, achar = n => ieTodas(d).find(L => L.nome === n || L.id === n);
        const L = achar(camada || ajuste);
        if (!L) throw new Error(`camada "${camada || ajuste}" não existe`);
        const R = regiao || ieRCamada(L) || ieRDoc(d);
        const cw = Math.max(1, Math.round(R.w * escala)), ch = Math.max(1, Math.round(R.h * escala)), rotulo = 22;
        const out = ieCanvas(cw * lista.length + 8 * (lista.length - 1), ch + rotulo), ox = ieCtx(out);
        ox.fillStyle = '#202020'; ox.fillRect(0, 0, out.width, out.height);
        const antes = JSON.stringify(ajuste ? L.ajVals : L.filtrosInt || []);
        lista.forEach((v, i) => {
            if (ajuste) { L.ajVals = { ...JSON.parse(antes), ...v }; L.ajuste = IE_AJ_CAMADAS[L.ajChave].aj(L.ajVals); ieInvalidar(L); }
            else {
                const fs = JSON.parse(antes), k = fs.findIndex(f => f.cmd === filtro);
                if (k >= 0) fs[k] = { ...fs[k], vals: { ...fs[k].vals, ...v } }; else fs.push({ cmd: filtro, titulo: filtro, vals: v, on: true });
                L.filtrosInt = fs; const o = ieIntPlano(L); L.c = o.c; L.x = o.x; L.y = o.y; ieInvalidar(L);
            }
            ieCompor(d);
            ox.drawImage(d.comp, R.x, R.y, R.w, R.h, i * (cw + 8), rotulo, cw, ch);
            ox.fillStyle = '#ddd'; ox.font = '13px sans-serif'; ox.fillText(`${i + 1}: ${JSON.stringify(v).replace(/"/g, '')}`.slice(0, 60), i * (cw + 8) + 4, 15);
        });
        if (ajuste) { L.ajVals = JSON.parse(antes); L.ajuste = IE_AJ_CAMADAS[L.ajChave].aj(L.ajVals); }
        else { L.filtrosInt = JSON.parse(antes); const o = ieIntPlano(L); L.c = o.c; L.x = o.x; L.y = o.y; }
        ieInvalidar(L); ieCompor(d); ieAgendar(null, d);
        return out.toDataURL('image/jpeg', 0.85);
    },
    // etapa nomeada e idempotente: roda de novo SUBSTITUI o que ela fez (camadas criadas e filtros inteligentes que
    // ela pôs saem antes); mesmo código já rodado = pula (forcar: true roda igual). Fica no .iknv (doc.cena.etapas).
    async etapa(nome, fn, { forcar = false, chave = '' } = {}) {   // chave: parâmetros (mudou = refaz)
        const d = IE.doc;
        d.cena = d.cena || {}; d.cena.etapas = d.cena.etapas || {};
        const src = String(fn) + '|' + chave, hsh = [...src].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36);
        if (!forcar && d.cena.etapas[nome] === hsh) return { etapa: nome, pulou: true };
        // desfaz a vez anterior
        const sai = [];
        iePercorrer(d.camadas, L => { if (L.etapa === nome) sai.push(L); });
        for (const L of sai) { const a = ieAchar(d, L.id); if (a) a.lista.splice(a.i, 1); }
        iePercorrer(d.camadas, L => {
            if ((L.filtrosInt || []).some(f => f.etapa === nome)) { L.filtrosInt = L.filtrosInt.filter(f => f.etapa !== nome); if (L.c0) { const o = ieIntPlano(L); L.c = o.c; L.x = o.x; L.y = o.y; } ieInvalidar(L); }
        });
        const ids = new Set(), nf = new Map();
        iePercorrer(d.camadas, L => { ids.add(L.id); nf.set(L.id, (L.filtrosInt || []).length); });
        await fn();
        iePercorrer(d.camadas, L => {
            if (!ids.has(L.id)) L.etapa = nome;
            else (L.filtrosInt || []).slice(nf.get(L.id) || 0).forEach(f => { f.etapa = nome; });
        });
        d.cena.etapas[nome] = hsh;
        ieTudo(d); ieUiCamadas();
        return { etapa: nome, camadas: sai.length ? `refez (${sai.length} saíram)` : 'nova' };
    },
    // imagem de referência como camada travada e oculta no topo, ajustada ao documento (cover); a prévia não mostra
    async referencia(path, { opacidade = 50 } = {}) {
        const d = IE.doc, c = await ieCenaImagem(path);
        const k = Math.max(d.w / c.width, d.h / c.height), w = Math.round(c.width * k), h = Math.round(c.height * k);
        const r = ieCanvas(d.w, d.h); ieCtx(r).drawImage(c, (d.w - w) / 2, (d.h - h) / 2, w, h);
        iePercorrer(d.camadas, L => { if (L.referencia) { const a = ieAchar(d, L.id); a.lista.splice(a.i, 1); } });
        const L = ieNovaCamada(d, { nome: 'Referência', c: r, x: 0, y: 0 });
        L.referencia = true; L.visivel = false; L.op = opacidade / 100; L.travas = 0x80000000;
        d.camadas.push(L); ieTudo(d); ieUiCamadas();
        return { w, h };
    },
    // referência × peça num JPEG só — conferir sem ler duas imagens grandes. Inteira: referência em cima, peça embaixo;
    // {slide: 2}: só esse slide, lado a lado (ajuste fino barato)
    comparar({ escala, slide } = {}) {
        const d = IE.doc, ref = ieTodas(d).find(L => L.referencia), S = d.cena && d.cena.slide;
        if (!ref) throw new Error('sem referência (KNV.referencia ou --referencia)');
        let R = { x: 0, y: 0, w: d.w, h: d.h }, lado = false;
        if (slide && S) { R = { x: (slide - 1) * S.w, y: 0, w: S.w, h: S.h }; lado = true; }
        escala = escala || (lado ? 0.4 : 0.3);
        const w = Math.round(R.w * escala), h = Math.round(R.h * escala), out = ieCanvas(lado ? w * 2 + 6 : w, lado ? h : h * 2 + 6), x = ieCtx(out);
        x.fillStyle = '#202020'; x.fillRect(0, 0, out.width, out.height);
        x.drawImage(ref.c, R.x, R.y, R.w, R.h, 0, 0, w, h);
        const vis = ref.visivel; ref.visivel = false; ieCompor(d);
        x.drawImage(d.comp, R.x, R.y, R.w, R.h, lado ? w + 6 : 0, lado ? 0 : h + 6, w, h);
        ref.visivel = vis; ieCompor(d);
        return out.toDataURL('image/jpeg', 0.82);
    },
    // ── receitas prontas de acabamento (cada uma é uma etapa: rodar de novo com os mesmos parâmetros pula; mudou, refaz) ──
    receita: {
        // textura gasta em títulos: manchas na cor do fundo presas (corte) a cada grupo/camada
        async tituloGasto(nomes, { cor = '#0b0b0b', forca = 1, semente = 11 } = {}) {
            const d = IE.doc, lista = [].concat(nomes);
            return KNV.etapa('tituloGasto:' + lista.join(','), async () => {
                lista.forEach((n, k) => {
                    const G = ieTodas(d).find(L => L.nome === n || L.id === n);
                    if (!G) return;
                    const R = ieRCamada(G), c = ieCanvas(R.w, R.h), x = ieCtx(c), img = x.createImageData(R.w, R.h), p = img.data;
                    const fino = ieRuidoSuave(R.w, R.h, 2.2, semente + k * 7), largo = ieRuidoSuave(R.w, R.h, 16, semente + k * 7 + 1), [cr, cg, cb] = ieHexRgb(cor);
                    let s = semente + k; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
                    const lim = 0.5 / Math.max(0.3, forca);
                    for (let i = 0; i < R.w * R.h; i++) {
                        const v = fino[i] * 0.55 + largo[i] * 0.45 + (rnd() - 0.5) * 0.35, al = v > lim ? 1 : v > lim - 0.08 ? (v - lim + 0.08) / 0.08 : 0;
                        p[i * 4] = cr; p[i * 4 + 1] = cg; p[i * 4 + 2] = cb; p[i * 4 + 3] = al * 235;
                    }
                    x.putImageData(img, 0, 0);
                    const L = ieNovaCamada(d, { tipo: 'pixel', nome: (G.nome || n) + ' · gasto', c, x: R.x, y: R.y });
                    ieInserirAcima(d, L, G); L.clip = true;
                });
            }, { chave: JSON.stringify([lista, cor, forca, semente]) });
        },
        // textura de tecido acima de cada fundo (cinza 50% + Texturizador + ruído, em Sobrepor)
        async texturaTecido(fundos, { escala = 150, relevo = 32, ruido = 14, op = 85, tex = 'tela' } = {}) {
            const d = IE.doc, lista = [].concat(fundos);
            return KNV.etapa('texturaTecido:' + lista.join(','), async () => {
                for (const n of lista) {
                    const bg = ieTodas(d).find(L => (L.nome === n || L.id === n) && L.c);
                    if (!bg) continue;
                    const c = ieCanvas(bg.c.width, bg.c.height), x = ieCtx(c);
                    x.fillStyle = '#808080'; x.fillRect(0, 0, c.width, c.height);
                    const L = ieNovaCamada(d, { tipo: 'pixel', nome: 'Textura ' + bg.nome, c, x: bg.x, y: bg.y });
                    ieInserirAcima(d, L, bg); KNV.ativar(L.id);
                    await KNV.cmd('f:galeria', { pilha: [{ f: 'texturizador', v: { tex, esc: escala, rel: relevo, luz: 'cimaEsq' } }] });
                    await KNV.cmd('f:ruido', { q: ruido, mono: true });
                    KNV.modo('OVERLAY', op);
                }
            }, { chave: JSON.stringify([lista, escala, relevo, ruido, op, tex]) });
        },
        // sombra projetada (efeito de camada, segue o recorte): css como no box-shadow ("0 30px 60px rgba(0,0,0,.55)")
        async sombra(nomes, css = '0 30px 60px rgba(0,0,0,.55)') {
            const d = IE.doc, lista = [].concat(nomes);
            return KNV.etapa('sombra:' + lista.join(','), async () => {
                for (const n of lista) {
                    const L = ieTodas(d).find(x => x.nome === n || x.id === n);
                    if (!L) continue;
                    if (L.fx) { delete L.fx.sombra; delete L.fx.brilho; }
                    ieCenaFxSombras(L, ieCenaSombras(css)); L.fxMudou = true; ieInvalidar(L);
                }
            }, { chave: css, forcar: true });
        },
        // Camera Raw de acabamento no topo (camada de ajuste)
        async acabamento(vals = { clar: 14, tex: 10, grao: 14, graoT: 25, ct: 8, vib: 4 }) {
            const d = IE.doc;
            return KNV.etapa('acabamento', async () => {
                KNV.ativar(d.camadas[d.camadas.length - 1].id);
                await KNV.ajuste('cameraRaw', vals, { nome: 'Acabamento (Camera Raw)' });
            }, { chave: JSON.stringify(vals) });
        },
        // ── finalização (feedback 2026-10-06: "a camada final acima de tudo deixa com cara de finalizado") ──
        // sombra macia na humanização/objeto recortado, brilho suave da cor da marca atrás dele (Tela), palavra-eco com
        // desfoque de movimento (filtro inteligente), textura suave (ruído + tela em Sobrepor) e Camera Raw no topo.
        // opc: {cor, sombra, brilho, eco, textura, cr: {...vals}} — false desliga a parte. Cada parte é etapa (repetível).
        async arteFinal(opc = {}) {
            const d = IE.doc, lado = Math.min(d.w, d.h, ...(d.fatias || []).map(f => Math.min(f.w, f.h))), cor = opc.cor || '#ff3b22', out = {};
            const recortado = L => {
                if (L.tipo !== 'inteligente' || !L.c0 || L.visivel === false || (L.bm && L.bm !== 'NORMAL' && L.bm !== 'PASS')) return false;
                const c = L.c0.c, w = Math.min(64, c.width), h = Math.min(64, c.height), t = ieCanvas(w, h); ieCtx(t).drawImage(c, 0, 0, w, h);
                const p = ieCtx(t).getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < p.length; i += 4) if (p[i] < 20) n++;
                return n > w * h * 0.05 && !/^Brilho · /.test(L.nome);
            };
            const objs = () => ieTodas(d).filter(recortado);
            if (opc.sombra !== false) out.sombra = await KNV.etapa('fin:sombra', async () => {
                for (const L of objs()) { if (L.fx && (L.fx.sombra || []).length) continue;
                    ieCenaFxSombras(L, ieCenaSombras(`0 ${Math.round(lado * 0.03)}px ${Math.round(lado * 0.08)}px rgba(0,0,0,.45)`)); L.fxMudou = true; ieInvalidar(L); }
            }, { chave: String(lado) });
            if (opc.brilho !== false) out.brilho = await KNV.etapa('fin:brilho', async () => {
                for (const L of objs()) {
                    const r = ieRaster(L), f = r && (r.forma || r), b = f && ieLimites(f.c); if (!b) continue;
                    const R = { x: f.x + b.x, y: f.y + b.y, w: b.w, h: b.h }, raio = Math.max(R.w, R.h) * 0.62, cx = R.x + R.w / 2, cy = R.y + R.h * 0.38;
                    const X = Math.round(cx - raio), Y = Math.round(cy - raio), c = ieCanvas(Math.round(raio * 2), Math.round(raio * 2)), x = ieCtx(c);
                    const g = x.createRadialGradient(raio, raio, 0, raio, raio, raio), [cr, cg, cb] = ieHexRgb(cor);
                    g.addColorStop(0, `rgba(${cr},${cg},${cb},.85)`); g.addColorStop(0.45, `rgba(${cr},${cg},${cb},.35)`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
                    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
                    const G = ieNovaCamada(d, { tipo: 'pixel', nome: 'Brilho · ' + L.nome, c, x: X, y: Y }); G.bm = 'SCREEN'; G.op = 0.6;
                    const a = ieAchar(d, L.id); a.lista.splice(a.i, 0, G);
                }
            }, { chave: cor });
            if (opc.eco !== false) out.eco = await KNV.etapa('fin:eco', async () => {
                for (const L of ieTodas(d).filter(L => L.cena && L.cena.livre === 'eco' && L.tipo === 'texto')) {
                    KNV.ativar(L.id); ieRasterizar(L, d); KNV.objetoInteligente();   // texto → pixels → objeto inteligente (o desfoque fica editável)
                    const dist = Math.round(lado * 0.04), pad = Math.round(dist * 1.5), o = L.c0;   // folga: o borrão não termina em linha reta
                    const c = ieCanvas(o.c.width + 2 * pad, o.c.height + 2 * pad); ieCtx(c).drawImage(o.c, pad, pad);
                    L.c0 = { c, x: o.x - pad, y: o.y - pad }; L.c = ieClonar(c); L.x = o.x - pad; L.y = o.y - pad; L.sujoPx = true; ieInvalidar(L);
                    await KNV.cmd('f:movimento', { ang: o.c.height > o.c.width ? 90 : 0, d: dist });   // no sentido da palavra (eco vertical = 90°)
                }
            });
            if (opc.textura !== false) out.textura = await KNV.etapa('fin:textura', async () => {
                const c = ieCanvas(d.w, d.h), x = ieCtx(c); x.fillStyle = '#808080'; x.fillRect(0, 0, d.w, d.h);
                const T = ieNovaCamada(d, { tipo: 'pixel', nome: 'Textura suave', c, x: 0, y: 0 }); d.camadas.push(T); KNV.ativar(T.id);
                await KNV.cmd('f:ruido', { q: 7, mono: true });
                await KNV.cmd('f:galeria', { pilha: [{ f: 'texturizador', v: { tex: 'tela', esc: 110, rel: 12, luz: 'cimaEsq' } }] });
                KNV.modo('OVERLAY', 35);
            });
            if (opc.cr !== false) out.cr = await KNV.etapa('fin:cr', async () => {
                KNV.ativar(d.camadas[d.camadas.length - 1].id);
                await KNV.ajuste('cameraRaw', { clar: 16, tex: 12, ct: 10, grao: 12, graoT: 30, vib: 6, vig: -14, ...(opc.cr || {}) }, { nome: 'Finalização (Camera Raw)' });
            }, { chave: JSON.stringify(opc.cr || {}) });
            ieTudo(d); ieUiCamadas();
            return out;
        },
        // balanço de branco automático numa foto (objeto inteligente): Camera Raw como filtro inteligente
        async balancoAuto(nome) {
            const d = IE.doc, L = ieTodas(d).find(x => x.nome === nome || x.id === nome);
            if (!L || !L.c0) throw new Error(`"${nome}" não é um objeto inteligente`);
            return KNV.etapa('balancoAuto:' + nome, async () => {
                const wb = ieCrAutoBalanco(L.c0.c);
                L.filtrosInt = [...(L.filtrosInt || []), { cmd: 'f:cameraRaw', titulo: 'Filtro Camera Raw (balanço)', vals: ieCrNorm(wb), on: true }];
                const o = ieIntPlano(L); L.c = o.c; L.x = o.x; L.y = o.y; ieInvalidar(L);
            });
        },
        // ── acabamento de designer (feedback do flyer Prime Fest): sem corte seco, luz, profundidade, foto tratada ──
        // máscara em degradê: a pessoa some suave para o lado (corte da cintura/base sem linha seca). inicio = fração
        // da altura (ou largura) onde começa a sumir; soma com a máscara que já existe
        mascaraDegrade(nome, { lado = 'baixo', inicio = 0.7 } = {}) {
            const d = IE.doc, L = ieRec(nome), R = ieRCamada(L);
            const c = ieCanvas(R.w, R.h), x = ieCtx(c);
            if (L.m && L.m.c) { if (L.m.fundo) { x.fillStyle = '#fff'; x.fillRect(0, 0, R.w, R.h); x.clearRect(L.m.x - R.x, L.m.y - R.y, L.m.c.width, L.m.c.height); } x.drawImage(L.m.c, L.m.x - R.x, L.m.y - R.y); }
            else if (!L.m || L.m.fundo) { x.fillStyle = '#fff'; x.fillRect(0, 0, R.w, R.h); }
            const k = ieClamp(+inicio, 0, 0.98);
            // o degradê vai do contorno real dos pixels (a foto pode terminar antes da caixa da camada)
            const B = (L.c && ieLimites(L.c, L.x, L.y)) || R, x1 = B.x - R.x, y1 = B.y - R.y, x2 = x1 + B.w, y2 = y1 + B.h;
            const g = lado === 'baixo' ? x.createLinearGradient(0, y1, 0, y2) : lado === 'cima' ? x.createLinearGradient(0, y2, 0, y1) : lado === 'direita' ? x.createLinearGradient(x1, 0, x2, 0) : x.createLinearGradient(x2, 0, x1, 0);
            g.addColorStop(0, '#fff'); g.addColorStop(k, '#fff'); g.addColorStop(k + (1 - k) * 0.55, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(0, 0, R.w, R.h);
            L.m = { c, x: R.x, y: R.y, fundo: 0 }; L.sujoM = true;
            ieCamadaMudou(L, R); ieAgendar(null, d); ieHist(ieT('Máscara em degradê')); ieUiCamadas();
            return { lado, inicio: k };
        },
        // rastro de movimento: cópia com Desfoque de movimento ATRÁS do objeto (o objeto continua nítido)
        rastro(nome, { angulo = 0, distancia = 40, op = 80 } = {}) {
            const d = IE.doc, L = ieRec(nome);
            if (!L.c) throw new Error(`"${L.nome}" não tem pixels (grupo/texto: use um objeto ou foto)`);
            // cópias escalonadas para trás (angulo = para onde o objeto vai), cada uma mais fraca, depois Desfoque de movimento
            const rad = +angulo * Math.PI / 180, ux = Math.cos(rad), uy = -Math.sin(rad), n = 14, D = +distancia;
            const w = L.c.width, h = L.c.height, mx = Math.ceil(Math.abs(ux) * D), my = Math.ceil(Math.abs(uy) * D);
            const c = ieCanvas(w + mx * 2, h + my * 2), k = ieCtx(c);
            for (let i = n; i >= 1; i--) { k.globalAlpha = 0.55 * (1 - (i - 1) / n); k.drawImage(L.c, mx - ux * D * i / n, my - uy * D * i / n); }
            k.globalAlpha = 1;
            const def = ieIntDef('f:movimento'), vals = { ang: +angulo, d: Math.max(8, D * 0.9) };
            const o = ieProcessarCamada({ c, x: L.x - mx, y: L.y - my }, def.proc(vals), def.margem ? def.margem(vals) : D, { w: d.w, h: d.h, sel: null }) || { c, x: L.x - mx, y: L.y - my };
            const a = ieAchar(d, L.id), velho = a.lista.find(X => X.nome === L.nome + ' · rastro');
            if (velho) a.lista.splice(a.lista.indexOf(velho), 1);
            const T = ieNovaCamada(d, { tipo: 'pixel', nome: L.nome + ' · rastro', c: o.c, x: o.x, y: o.y, op: op / 100 });
            const b = ieAchar(d, L.id); b.lista.splice(b.i, 0, T);
            ieTudo(d); ieHist(ieT('Rastro de movimento')); ieUiCamadas();
            return { rastro: T.nome };
        },
        // luz pintada: mancha radial macia em Divisão (Screen) numa camada própria "Luz", acima de `acima` (ou abaixo
        // do acabamento). pontos = [[x, y, raio], ...] no documento; cor clara (a da luz da cena)
        luz(pontos, { cor = '#ffd9a0', intensidade = 70, acima, nome = 'Luz' } = {}) {
            const d = IE.doc, ps = [].concat(Array.isArray(pontos[0]) ? pontos : [pontos]);
            const c = ieCanvas(d.w, d.h), x = ieCtx(c), [r, g, b] = ieHexRgb(cor);
            for (const [px, py, raio = 300] of ps) {
                const gr = x.createRadialGradient(px, py, 0, px, py, raio);
                gr.addColorStop(0, `rgba(${r},${g},${b},${intensidade / 100})`); gr.addColorStop(0.45, `rgba(${r},${g},${b},${intensidade / 250})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
                x.fillStyle = gr; x.fillRect(px - raio, py - raio, raio * 2, raio * 2);
            }
            const L = ieNovaCamada(d, { tipo: 'pixel', nome, c, x: 0, y: 0, bm: 'SCREEN' }); ieAparar(L);
            const ref = acima ? ieRec(acima) : null, topo = d.camadas[d.camadas.length - 1];
            if (ref) ieInserirAcima(d, L, ref);
            else if (topo && topo.tipo === 'ajuste') d.camadas.splice(d.camadas.length - 1, 0, L);
            else d.camadas.push(L);
            ieTudo(d); ieHist(ieT('Luz')); ieUiCamadas();
            return { luz: L.nome, pontos: ps.length };
        },
        // tratamento individual de foto (filtro inteligente Camera Raw): textura, nitidez local e cor do ambiente
        tratarFoto(nome, { ambiente = 'neutro', forca = 1 } = {}) {
            const L = ieRecInt(nome), R = ieRCamada(L);
            const P = { neutro: { clar: 12, tex: 12, ct: 8, grao: 8 }, quente: { clar: 12, tex: 12, ct: 10, temp: 12, vib: 10, grao: 8 },
                frio: { clar: 12, tex: 12, ct: 10, temp: -12, vib: 6, grao: 8 }, noite: { exp: -0.15, ct: 16, clar: 16, tex: 10, temp: -6, vib: 10, vig: -18, grao: 12 },
                festa: { ct: 14, clar: 14, tex: 10, vib: 18, temp: 6, grao: 10, vig: -10 } }[ambiente];
            if (!P) throw new Error('ambiente tem que ser neutro, quente, frio, noite ou festa');
            const v = Object.fromEntries(Object.entries(P).map(([k, n]) => [k, Math.round(n * forca * 100) / 100]));
            L.filtrosInt = [...(L.filtrosInt || []).filter(f => !f.tratarFoto), { cmd: 'f:cameraRaw', titulo: 'Filtro Camera Raw (tratamento)', vals: ieCrNorm(v), on: true, tratarFoto: true }];
            ieIntAtualizar(L, R); ieAgendar(null, IE.doc); ieHist(ieT('Tratar foto')); ieUiCamadas();
            return { ambiente, ...v };
        },
        // profundidade: Desfoque gaussiano como filtro inteligente (fundo/objetos de trás); raio em px
        profundidade(nome, raio = 6) {
            const L = ieRecInt(nome), R = ieRCamada(L);
            L.filtrosInt = [...(L.filtrosInt || []).filter(f => !f.profundidade), { cmd: 'f:gaussiano', titulo: 'Desfoque gaussiano (profundidade)', vals: { r: +raio }, on: true, profundidade: true }];
            ieIntAtualizar(L, R); ieAgendar(null, IE.doc); ieHist(ieT('Profundidade')); ieUiCamadas();
            return { raio: +raio };
        },
        // leitura: mancha macia (radial) por baixo de um ou mais textos vizinhos, na cor do fundo escurecida (ou clareada,
        // se o texto for escuro). Fica logo abaixo do bloco de textos (no nível de cima da pilha); "· leitura"
        leitura(nomes, { forca = 0.85 } = {}) {
            const d = IE.doc, Ls = [].concat(nomes).map(ieRec), topo = L => d.camadas.find(T => T === L || (T.filhos && ieTodasDe(T.filhos).includes(L)));
            const Rs = Ls.map(ieRCamada).filter(Boolean);
            if (!Rs.length) throw new Error('leitura: nenhum texto com caixa');
            const U = Rs.reduce((u, r) => ({ x1: Math.min(u.x1, r.x), y1: Math.min(u.y1, r.y), x2: Math.max(u.x2, r.x + r.w), y2: Math.max(u.y2, r.y + r.h) }), { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 });
            const px = (U.x2 - U.x1) * 0.18 + 40, py = (U.y2 - U.y1) * 0.6 + 40, R = { x: Math.round(U.x1 - px), y: Math.round(U.y1 - py), w: Math.round(U.x2 - U.x1 + 2 * px), h: Math.round(U.y2 - U.y1 + 2 * py) };
            const base = Ls.map(topo).sort((a, b) => d.camadas.indexOf(a) - d.camadas.indexOf(b))[0];
            IE._pararEm = base; IE._parou = false;
            let fundo; try { fundo = ieAchatar(d, d.camadas, { x: Math.max(0, R.x), y: Math.max(0, R.y), w: Math.min(d.w, R.x + R.w) - Math.max(0, R.x), h: Math.min(d.h, R.y + R.h) - Math.max(0, R.y) }); } finally { IE._pararEm = null; IE._parou = false; }
            const p = ieCtx(fundo).getImageData(0, 0, fundo.width, fundo.height).data, m = [0, 0, 0];
            for (let i = 0; i < p.length; i += 16) { m[0] += p[i]; m[1] += p[i + 1]; m[2] += p[i + 2]; }
            const n = p.length / 16, med = m.map(v => v / n), [tr, tg, tb] = ieHexRgb(Ls[0].txt?.cor || '#ffffff');
            const claro = 0.299 * tr + 0.587 * tg + 0.114 * tb > 128;   // texto claro = mancha escura
            const cor = claro ? med.map(v => Math.round(v * 0.22)) : med.map(v => Math.round(255 - (255 - v) * 0.15));
            const c = ieCanvas(R.w, R.h), x = ieCtx(c);
            x.setTransform(R.w / 2, 0, 0, R.h / 2, R.w / 2, R.h / 2);
            const g = x.createRadialGradient(0, 0, 0, 0, 0, 1), rgba = a => `rgba(${cor.join(',')},${a})`;
            g.addColorStop(0, rgba(forca)); g.addColorStop(0.5, rgba(forca * 0.8)); g.addColorStop(1, rgba(0));
            x.fillStyle = g; x.fillRect(-1, -1, 2, 2);
            const nome = Ls[0].nome + ' · leitura', a0 = d.camadas.findIndex(T => T.nome === nome);
            if (a0 >= 0) d.camadas.splice(a0, 1);
            const M = ieNovaCamada(d, { tipo: 'pixel', nome, c, x: R.x, y: R.y });
            d.camadas.splice(d.camadas.indexOf(base), 0, M);
            ieTudo(d); ieHist(ieT('Leitura')); ieUiCamadas();
            return { leitura: nome, caixa: R };
        },
        // finalizar a peça sozinho: o revisor diz o que falta e a receita aplica (o checklist dos feedbacks do usuário)
        //  pessoas recortadas grandes → tratar_foto (ambiente do preset) + máscara em degradê se a base corta seco
        //  textos ilegíveis → leitura (vizinhos juntos) · sombra dura → sombra suave · objetos recortados sem sombra →
        //  sombra suave · acabamento (Camera Raw no topo). Avatar com rosto cortado só é avisado (enquadrar é decisão).
        async finalizar({ preset = 'social_limpo', sombras = true } = {}) {
            const P = { social_limpo: { amb: 'neutro', acab: { clar: 8, vib: 5, grao: 4 } }, festa_noite: { amb: 'festa', acab: { clar: 15, grao: 12, ct: 10, vib: 10 } },
                flyer_grunge: { amb: 'noite', acab: { clar: 18, tex: 12, grao: 15, ct: 12 } }, quente: { amb: 'quente', acab: { clar: 10, vib: 8, grao: 6, temp: 6 } } }[preset];
            if (!P) throw new Error('preset: social_limpo, festa_noite, flyer_grunge ou quente');
            const d = IE.doc, feito = [], SUAVE = '0 24px 44px rgba(8,16,48,.24)';
            const rv = await window.KNV.revisarPeca({});
            const recortadas = ieTodas(d).filter(L => L.c0 && L.visivel !== false && !L.clip && (() => { const c = L.c0.c, w = Math.min(64, c.width), h = Math.min(64, c.height), t = ieCanvas(w, h); ieCtx(t).drawImage(c, 0, 0, w, h);
                const p = ieCtx(t).getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < p.length; i += 4) if (p[i] < 20) n++; return n > w * h * 0.05; })());
            const alto = Math.min(d.h, ...(d.fatias || []).map(f => f.h));
            for (const L of recortadas) {
                const R = ieRCamada(L); if (!R) continue;
                if (R.h > alto * 0.4) {   // pessoa/assunto principal
                    if (!(L.filtrosInt || []).some(f => f.tratarFoto)) { this.tratarFoto(L.nome, { ambiente: P.amb }); feito.push(`tratar_foto ${L.nome}`); }
                    const base = rv.achados.find(a => a.regra === 'corte' && a.camada === L.nome && /de \d+,(\d+) a \d+,(\d+)/.test(a.problema) && (([, y1, y2]) => Math.abs(y1 - y2) < 4)(a.problema.match(/de \d+,(\d+) a \d+,(\d+)/)));
                    if (base) { this.mascaraDegrade(L.nome, { lado: 'baixo', inicio: 0.72 }); feito.push(`mascara_degrade ${L.nome}`); }
                } else if (sombras && !(L.fx && (L.fx.sombra || []).some(e => e.on))) { await this.sombra([L.nome], SUAVE); feito.push(`sombra ${L.nome}`); }
            }
            for (const a of rv.achados.filter(a => a.regra === 'sombra')) { await this.sombra([a.camada], SUAVE); feito.push(`sombra suave ${a.camada}`); }
            // textos ilegíveis: vizinhos (caixas a < 60 px) numa mancha só
            const ts = rv.achados.filter(a => a.regra === 'contraste'), grupos = [];
            for (const t of ts) {
                const g = grupos.find(g => g.some(o => t.caixa.x < o.caixa.x + o.caixa.w + 60 && o.caixa.x < t.caixa.x + t.caixa.w + 60 && t.caixa.y < o.caixa.y + o.caixa.h + 60 && o.caixa.y < t.caixa.y + t.caixa.h + 60));
                g ? g.push(t) : grupos.push([t]);
            }
            for (const g of grupos) { this.leitura(g.map(t => t.camada)); feito.push(`leitura ${g.map(t => t.camada).join('+')}`); }
            const A = ieTodas(d).find(L => L.tipo === 'ajuste' && L.ajChave === 'cameraRaw' && /acabamento/i.test(L.nome));
            if (!A) { await this.acabamento(P.acab); feito.push('acabamento'); }
            const avisos = rv.avatares.length ? [`${rv.avatares.length} avatar(es): conferir o rosto (tools/revisor.py)`] : [];
            rv.achados.filter(a => a.regra === 'corte' && !feito.some(f => f.endsWith(a.camada))).forEach(a => avisos.push(`corte em ${a.camada}: ${a.problema}`));
            d._finalizada = preset;
            return { preset, feito, avisos };
        },
    },
    // ponte: o documento (já salvo em .iknv) vira Comps no Editor Kanivete; {modo: 'slides' | 'inteiro'}
    async levarParaEditor(opc = {}) { return ponteLevar(opc); },
    // Ctrl+Shift+, (tudo=false: camadas selecionadas) / Ctrl+Shift+. (tudo=true: fatias, pranchetas ou a tela) sem a janela
    exportarRapido(tudo, pasta) { return ieExportarRapido(!!tudo, String(pasta).replace(/\//g, '\\')); },
    // recursos marcados com data-guardar desde a última chamada: [{nome, png (base64), meta}] (o runner grava)
    recursosNovos() {
        const l = (IE._recursosNovos || []).map(r => ({ nome: r.nome, meta: r.meta, png: r.c.toDataURL('image/png').split(',')[1] }));
        IE._recursosNovos = [];
        return l;
    },

    // ── conferir ──
    // composição do documento em PNG (base64) — o mesmo que a exportação grava; escala < 1 reduz
    png(escala = 1) {
        const d = IE.doc; ieCompor(d);
        if (escala >= 1) return d.comp.toDataURL('image/png').split(',')[1];
        const c = ieCanvas(Math.round(d.w * escala), Math.round(d.h * escala)); const k = ieCtx(c); k.imageSmoothingQuality = 'high'; k.drawImage(d.comp, 0, 0, c.width, c.height);
        return c.toDataURL('image/png').split(',')[1];
    },
    // cor média de um retângulo do documento (para acertar cores sem print)
    cor(x, y, w = 5, h = 5) {
        const d = IE.doc; ieCompor(d); const p = ieCtx(d.comp).getImageData(x, y, w, h).data; let s = [0, 0, 0], n = 0;
        for (let i = 0; i < p.length; i += 4) { s[0] += p[i]; s[1] += p[i + 1]; s[2] += p[i + 2]; n++; }
        return s.map(v => Math.round(v / n));
    },
    _quadro: () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30))),

    // ── diálogos (um agente esperando um clique que nunca vem trava a receita) ──
    // automacao(): nenhuma janela do app abre enquanto ligada. Confirmação (appConfirm: "Rasterizar a camada?",
    // "Salvar as alterações?"...) é respondida por `respostas` ({'Rasterizar a camada?': 'Rasterizar'}, o título
    // ou um pedaço dele → rótulo do botão, 'primario' ou 'cancelar'); sem resposta, vale `padrao`:
    // 'erro' (padrão: a promessa falha com o título e os botões, a receita para na hora e diz o que perguntou),
    // 'primario' (o botão principal) ou 'cancelar'. Janela de valores (ieDialogo) sem KNV.cmd: OK com os valores
    // padrão. Tudo fica em KNV.dialogos (o que perguntou e o que respondeu). automacao(false) desliga.
    // Diálogos nativos do sistema (abrir/salvar arquivo do pywebview) não passam por aqui: use caminhos (abrir/salvar/colocar).
    dialogos: [],
    automacao(ligar = true, { respostas = {}, padrao = 'erro' } = {}) {
        const w = window;
        if (!w._knvOrig) w._knvOrig = { confirm: w.appConfirm };
        if (w.ieDialogo && !w.ieDialogo._knv) w._knvOrig.dialogo = w.ieDialogo;   // recarga dos imagem-*.js troca a função
        if (!ligar) { w.appConfirm = w._knvOrig.confirm; if (w._knvOrig.dialogo) w.ieDialogo = w._knvOrig.dialogo; w._knvAuto = null; return false; }
        w._knvAuto = { respostas, padrao };
        w.appConfirm = function ({ titulo, texto, botoes }) {
            const cfg = w._knvAuto, rot = botoes.map(b => b.rotulo);
            const chave = Object.keys(cfg.respostas).find(k => titulo === k || titulo.includes(k));
            const pedido = chave != null ? cfg.respostas[chave] : cfg.padrao;
            const b = pedido === 'primario' ? botoes.find(x => x.tipo === 'primario') || botoes[botoes.length - 1]
                : pedido === 'cancelar' ? botoes.find(x => x.valor == null) || botoes[0]
                : botoes.find(x => x.rotulo === pedido);
            KNV.dialogos.push({ titulo, texto, botoes: rot, resposta: b ? b.rotulo : null });
            if (!b) return Promise.reject(new Error(`diálogo "${titulo}" (botões: ${rot.join(' | ')}) — responda com KNV.automacao(true, {respostas: {'${titulo}': '<botão>'}})`));
            return Promise.resolve(b.valor);
        };
        const dlg = w._knvOrig.dialogo;
        if (dlg) {
            w.ieDialogo = function (o) {
                if (IE._auto) return dlg(o);
                const vals = Object.fromEntries(o.campos.filter(c => c.tipo !== 'titulo').map(c => [c.id, c.valor]));
                KNV.dialogos.push({ titulo: o.titulo, resposta: 'OK (valores padrão)', valores: vals });
                return Promise.resolve(vals);
            };
            w.ieDialogo._knv = true;
        }
        return true;
    },
    // há uma janela aberta na tela? {tipo: 'confirmar'|'valores', titulo, texto, botoes} ou null — para conferir
    // de fora (CDP) antes de esperar por algo; responder(rotulo | índice | 'cancelar') clica o botão
    dialogo() {
        const c = document.getElementById('app-confirm');
        if (c && !c.hidden) return { tipo: 'confirmar', titulo: c.querySelector('#app-confirm-titulo')?.textContent, texto: c.querySelector('#app-confirm-texto')?.textContent,
            botoes: [...c.querySelectorAll('#app-confirm-botoes button')].map(b => b.textContent) };
        const m = document.getElementById('ie-modal');
        if (m && !m.hidden && m.innerHTML) return { tipo: 'valores', titulo: m.querySelector('h3')?.textContent, botoes: [...m.querySelectorAll('.ie-dlg-rod button')].map(b => b.textContent) };
        return null;
    },
    responder(qual = 'cancelar') {
        const d = KNV.dialogo(); if (!d) return null;
        const bs = [...document.querySelectorAll(d.tipo === 'confirmar' ? '#app-confirm-botoes button' : '#ie-modal .ie-dlg-rod button')];
        const b = typeof qual === 'number' ? bs[qual] : qual === 'cancelar' ? (d.tipo === 'valores' ? bs.find(x => x.dataset.r === '0') : bs[0]) : bs.find(x => x.textContent === qual);
        if (!b) throw new Error(`botão "${qual}" não existe (${d.botoes.join(' | ')})`);
        b.click(); return d;
    },
};
window.KNV = KNV;
