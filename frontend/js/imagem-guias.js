// =========================================================
// Editor de Imagem — guias e encaixe como no Photoshop (Exibir > Guias, Exibir > Ajustar / Ajustar a).
// Novo layout de guias: predefinições (8/12/18/24 colunas + as salvas), destino (tela/pranchetas), cor, colunas
// (número, largura vazia = automática, medianiz), linhas (número, altura, medianiz), margem (4 lados, aceita negativo),
// centralizar colunas, limpar existentes, visualizar ao vivo. Nova guia (com cor), Novas guias da forma, editar guia
// (duplo clique com o Mover), guias no histórico. Ajustar a: guias, grade, camadas, fatias, limites do documento — vale
// para Letreiro, Fatia, Corte, Forma, Mover e para a guia sendo arrastada. Fatias das guias (ferramenta Fatia): uma
// fatia por célula entre as guias, na ordem de leitura — o caminho do carrossel: layout N colunas → fatias → exportar.
// doc.guias = [{o: 'v'|'h', p: px, cor?}]. Guias ficam no PSD (prancheta.js) e no .iknv.
// =========================================================

function ieGuiaCores() {
    return [['#00ffff', 'Ciano'], ['#4aa3ff', 'Azul claro'], ['#ff7b7b', 'Vermelho claro'], ['#46d160', 'Verde'], ['#3c63d8', 'Azul médio'],
        ['#ffe14d', 'Amarelo'], ['#ff4df0', 'Magenta'], ['#000000', 'Preto'], ['#c8c8c8', 'Cinza claro']];
}
function ieGuiaCorPadrao() { return iePref('corGuias', '#00ffff'); }

// ─────────────────────────── layout de guias (a conta do Photoshop) ───────────────────────────
// o = {colunas: {n, largura, medianiz} | null, linhas: {n, altura, medianiz} | null, margem: {sup, esq, inf, dir} | null,
//      centralizar, alvo: 'tela' | 'pranchetas' | 'selecionadas', cor}
function ieGuiasLayoutCalc(doc, o) {
    const alvos = ieGuiasAlvos(doc, o.alvo);
    const g = [];
    for (const A of alvos) {
        const m = o.margem || null;
        const r = m ? { x: A.x + (+m.esq || 0), y: A.y + (+m.sup || 0), w: A.w - (+m.esq || 0) - (+m.dir || 0), h: A.h - (+m.sup || 0) - (+m.inf || 0) } : { ...A };
        if (m) g.push({ o: 'v', p: r.x }, { o: 'v', p: r.x + r.w }, { o: 'h', p: r.y }, { o: 'h', p: r.y + r.h });
        const faixas = (eixo, f, ini, tam, centro) => {
            const n = Math.round(+f.n || 0);
            if (n < 1) return;
            const med = +f.medianiz || 0, fixo = +(eixo === 'v' ? f.largura : f.altura) || 0;
            const cel = fixo > 0 ? fixo : (tam - med * (n - 1)) / n;
            const total = cel * n + med * (n - 1);
            const a0 = fixo > 0 && centro ? ini + (tam - total) / 2 : ini;
            for (let i = 0; i < n; i++) { const a = a0 + i * (cel + med); g.push({ o: eixo, p: a }, { o: eixo, p: a + cel }); }
        };
        if (o.colunas) faixas('v', o.colunas, r.x, r.w, !!o.centralizar);
        if (o.linhas) faixas('h', o.linhas, r.y, r.h, false);
    }
    const cor = o.cor && o.cor !== ieGuiaCorPadrao() ? o.cor : undefined;
    const out = [];
    for (const x of g) {
        const p = Math.round(x.p * 1000) / 1000;
        if (!out.some(y => y.o === x.o && Math.abs(y.p - p) < 0.01)) out.push(cor ? { o: x.o, p, cor } : { o: x.o, p });
    }
    return out;
}
function ieGuiasAlvos(doc, alvo) {
    const pr = iePranchetas(doc);
    if (alvo === 'pranchetas' && pr.length) return pr.map(L => L.prancheta);
    if (alvo === 'selecionadas' && pr.length) {
        const sel = new Set(ieSelecionadas(doc).map(L => (L.prancheta ? L : ieAchar(doc, L.id)?.pai)).filter(L => L && L.prancheta));
        if (sel.size) return [...sel].map(L => L.prancheta);
    }
    return [{ x: 0, y: 0, w: doc.w, h: doc.h }];
}
function ieGuiasLayoutAplicar(doc, o, limpar = true) {
    const novas = ieGuiasLayoutCalc(doc, o);
    const base = limpar ? [] : (doc.guias || []).filter(x => !novas.some(y => y.o === x.o && Math.abs(y.p - x.p) < 0.01));
    doc.guias = [...base, ...novas];
    IE.verGuias = true; doc.sujo = true;
    ieHist(ieT('Novo layout de guias'), doc);
    ieDesenharSobre();
    return doc.guias;
}

// predefinições: as do Photoshop (medianiz 20 px), as de carrossel (N slides, sem medianiz e sem margem) e as do usuário
function ieGuiasPredef() {
    const ps = [8, 12, 18, 24].map(n => [`${n} colunas`, { colunas: { n, largura: '', medianiz: 20 }, linhas: null, margem: null, centralizar: false }]);
    const car = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [`Carrossel: ${n} slides`, { colunas: { n, largura: '', medianiz: 0 }, linhas: null, margem: null, centralizar: false }]);
    const meus = Object.entries(iePref('layoutsGuias', {}) || {});
    return [...ps, ...car, ...meus];
}

async function ieGuiasLayoutDialogo(doc) {
    if (!doc) return;
    const temPr = ieTemPranchetas(doc);
    const ult = IE._ultLayout || { colunas: { n: 8, largura: '', medianiz: 20 }, linhas: { n: 0, altura: '', medianiz: 20 }, margem: { sup: 0, esq: 0, inf: 0, dir: 0 },
        usarCol: true, usarLin: false, usarMarg: false, centralizar: false, limpar: true, cor: ieGuiaCorPadrao(), alvo: 'tela' };
    // automação (KNV.cmd('layoutGuias', {...})): sem janela
    if (IE._auto) { const a = IE._auto; IE._auto = null; return ieGuiasLayoutAplicar(doc, a, a.limpar !== false); }
    const antes = doc.guias ? doc.guias.map(g => ({ ...g })) : [];
    const box = ieEl('ie-modal');
    const num = (id, v, rot, neg) => `<label class="ie-gl-num"><span>${ieT(rot)}</span><input type="number" data-k="${id}" value="${v ?? ''}" ${neg ? '' : 'min="0"'} step="1"></label>`;
    const cores = ieGuiaCores();
    box.innerHTML = `<div class="ie-dlg ie-gl"><h3>${ieT('Novo layout de guias')}</h3><div class="ie-dlg-corpo">
        <label class="ie-dlg-lin"><span>${ieT('Predefinição')}</span><select data-k="predef"><option value="">${ieT('Personalizado')}</option>
            ${ieGuiasPredef().map(([n]) => `<option value="${ieEsc(n)}">${ieEsc(ieT(n))}</option>`).join('')}
            <option disabled>──────────</option><option value="__salvar">${ieT('Salvar predefinição...')}</option><option value="__excluir">${ieT('Excluir predefinição...')}</option></select></label>
        ${temPr ? `<label class="ie-dlg-lin"><span>${ieT('Destino')}</span><select data-k="alvo"><option value="tela">${ieT('Tela de pintura')}</option><option value="pranchetas">${ieT('Pranchetas')}</option><option value="selecionadas">${ieT('Pranchetas selecionadas')}</option></select></label>` : ''}
        <label class="ie-dlg-lin"><span>${ieT('Cor')}</span><select data-k="cor">${cores.map(([c, n]) => `<option value="${c}">${ieT(n)}</option>`).join('')}<option value="__outra">${ieT('Personalizada...')}</option></select><button class="ie-cor ie-gl-amostra" data-k="amostra"></button></label>
        <div class="ie-gl-bloco"><label class="ie-dlg-chk"><input type="checkbox" data-k="usarCol"> ${ieT('Colunas')}</label>
            ${num('col.n', ult.colunas.n, 'Número')}${num('col.largura', ult.colunas.largura, 'Largura')}${num('col.medianiz', ult.colunas.medianiz, 'Medianiz')}</div>
        <div class="ie-gl-bloco"><label class="ie-dlg-chk"><input type="checkbox" data-k="usarLin"> ${ieT('Linhas')}</label>
            ${num('lin.n', ult.linhas.n, 'Número')}${num('lin.altura', ult.linhas.altura, 'Altura')}${num('lin.medianiz', ult.linhas.medianiz, 'Medianiz')}</div>
        <div class="ie-gl-bloco ie-gl-marg"><label class="ie-dlg-chk"><input type="checkbox" data-k="usarMarg"> ${ieT('Margem')}</label>
            ${num('m.sup', ult.margem.sup, 'Superior', true)}${num('m.esq', ult.margem.esq, 'Esquerda', true)}${num('m.inf', ult.margem.inf, 'Inferior', true)}${num('m.dir', ult.margem.dir, 'Direita', true)}</div>
        <label class="ie-dlg-chk"><input type="checkbox" data-k="centralizar"> ${ieT('Centralizar colunas')}</label>
        <label class="ie-dlg-chk"><input type="checkbox" data-k="limpar"> ${ieT('Limpar guias existentes')}</label>
        <div class="ie-prop-nota">${ieT('Largura/altura vazia = colunas iguais ocupando o espaço todo. Carrossel: uma coluna por slide, medianiz 0, depois ferramenta Fatia > Fatias das guias.')}</div>
        </div><div class="ie-dlg-rod"><label class="ie-dlg-chk"><input type="checkbox" data-k="previa" checked> ${ieT('Visualizar')}</label><div class="ie-op-esp"></div>
        <button class="ie-btn" data-r="0">${ieT('Cancelar')}</button><button class="ie-btn ie-btn-primario" data-r="1">${ieT('OK')}</button></div></div>`;
    box.hidden = false;
    const q = k => box.querySelector(`[data-k="${k}"]`);
    let cor = ult.cor || ieGuiaCorPadrao();
    const pintarCor = () => { q('amostra').style.background = cor; q('cor').value = cores.some(([c]) => c === cor) ? cor : '__outra'; };
    const preencher = v => {
        const c = v.colunas || { n: 0, largura: '', medianiz: 0 }, l = v.linhas || { n: 0, altura: '', medianiz: 0 }, m = v.margem || { sup: 0, esq: 0, inf: 0, dir: 0 };
        q('usarCol').checked = !!v.colunas; q('col.n').value = c.n; q('col.largura').value = c.largura ?? ''; q('col.medianiz').value = c.medianiz ?? 0;
        q('usarLin').checked = !!v.linhas; q('lin.n').value = l.n; q('lin.altura').value = l.altura ?? ''; q('lin.medianiz').value = l.medianiz ?? 0;
        q('usarMarg').checked = !!v.margem; q('m.sup').value = m.sup; q('m.esq').value = m.esq; q('m.inf').value = m.inf; q('m.dir').value = m.dir;
        q('centralizar').checked = !!v.centralizar;
    };
    const ler = () => ({
        colunas: q('usarCol').checked ? { n: +q('col.n').value || 0, largura: q('col.largura').value, medianiz: +q('col.medianiz').value || 0 } : null,
        linhas: q('usarLin').checked ? { n: +q('lin.n').value || 0, altura: q('lin.altura').value, medianiz: +q('lin.medianiz').value || 0 } : null,
        margem: q('usarMarg').checked ? { sup: +q('m.sup').value || 0, esq: +q('m.esq').value || 0, inf: +q('m.inf').value || 0, dir: +q('m.dir').value || 0 } : null,
        centralizar: q('centralizar').checked, alvo: q('alvo') ? q('alvo').value : 'tela', cor, limpar: q('limpar').checked,
    });
    const desabilitar = () => {
        for (const [chk, pre] of [['usarCol', 'col.'], ['usarLin', 'lin.'], ['usarMarg', 'm.']]) box.querySelectorAll(`[data-k^="${pre}"]`).forEach(e => { e.disabled = !q(chk).checked; });
        q('centralizar').disabled = !q('usarCol').checked || !(+q('col.largura').value > 0);
    };
    const previa = () => {
        desabilitar();
        const v = ler();
        if (q('previa').checked) { const n = ieGuiasLayoutCalc(doc, v); doc.guias = v.limpar ? n : [...antes, ...n]; IE.verGuias = true; }
        else doc.guias = antes.map(g => ({ ...g }));
        ieDesenharSobre();
    };
    preencher({ colunas: ult.usarCol ? ult.colunas : null, linhas: ult.usarLin ? ult.linhas : null, margem: ult.usarMarg ? ult.margem : null, centralizar: ult.centralizar });
    q('limpar').checked = ult.limpar !== false;
    if (q('alvo')) q('alvo').value = ult.alvo || 'tela';
    pintarCor();
    box.querySelectorAll('input, select').forEach(e => e.addEventListener('input', () => { if (e.dataset.k !== 'predef' && e.dataset.k !== 'cor') q('predef').value = ''; previa(); }));
    q('cor').addEventListener('change', () => {
        if (q('cor').value === '__outra') ieSeletorCor(q('amostra'), cor, c => { cor = c; pintarCor(); previa(); });
        else { cor = q('cor').value; pintarCor(); previa(); }
    });
    q('amostra').onclick = () => ieSeletorCor(q('amostra'), cor, c => { cor = c; pintarCor(); previa(); });
    q('predef').addEventListener('change', async () => {
        const v = q('predef').value;
        if (v === '__salvar') {
            q('predef').value = '';
            const r = await ieDialogoTexto('Salvar predefinição', 'Nome', '');
            if (r) { const meus = { ...(iePref('layoutsGuias', {}) || {}) }; const x = ler(); meus[r] = { colunas: x.colunas, linhas: x.linhas, margem: x.margem, centralizar: x.centralizar }; iePrefGravar('layoutsGuias', meus); ieToast(`${ieT('Predefinição salva')}: ${r}`); }
            return;
        }
        if (v === '__excluir') {
            q('predef').value = '';
            const meus = { ...(iePref('layoutsGuias', {}) || {}) };
            const nomes = Object.keys(meus);
            if (!nomes.length) { ieToast(ieT('Nenhuma predefinição sua para excluir')); return; }
            const r = await ieDialogoTexto('Excluir predefinição', `Nome (${nomes.join(', ')})`, nomes[nomes.length - 1]);
            if (r && meus[r]) { delete meus[r]; iePrefGravar('layoutsGuias', meus); ieToast(`${ieT('Predefinição excluída')}: ${r}`); }
            return;
        }
        const p = ieGuiasPredef().find(([n]) => n === v);
        if (p) { preencher(p[1]); previa(); }
    });
    previa();
    return new Promise(resolve => {
        const fim = ok => {
            document.removeEventListener('keydown', tecla, true);
            const v = ler();
            box.hidden = true; box.innerHTML = '';
            doc.guias = antes;
            if (!ok) { ieDesenharSobre(); resolve(null); return; }
            IE._ultLayout = { colunas: v.colunas || ult.colunas, linhas: v.linhas || ult.linhas, margem: v.margem || ult.margem, usarCol: !!v.colunas, usarLin: !!v.linhas,
                usarMarg: !!v.margem, centralizar: v.centralizar, limpar: v.limpar, cor: v.cor, alvo: v.alvo };
            resolve(ieGuiasLayoutAplicar(doc, v, v.limpar));
        };
        const tecla = ev => {
            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fim(false); }
            if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); fim(true); }
        };
        document.addEventListener('keydown', tecla, true);
        box.querySelector('[data-r="0"]').onclick = () => fim(false);
        box.querySelector('[data-r="1"]').onclick = () => fim(true);
        q('col.n').focus();
    });
}
async function ieDialogoTexto(titulo, rotulo, valor) {
    const v = await ieDialogo({ titulo, campos: [{ id: 't', rotulo, tipo: 'texto', valor }] });
    return v && String(v.t || '').trim() ? String(v.t).trim() : null;
}

// ─────────────────────────── nova guia, editar, da forma, limpar ───────────────────────────
async function ieNovaGuia(doc, o) {
    const u = iePref('unidade', 'px');
    const v = o || await ieDialogo({ titulo: 'Nova guia', campos: [
        { id: 'o', rotulo: 'Orientação', tipo: 'select', valor: IE._ultGuiaO || 'v', opcoes: [['h', 'Horizontal'], ['v', 'Vertical']] },
        { id: 'p', rotulo: `Posição (${u})`, tipo: 'numero', valor: 0, min: -100000, max: 100000, passo: 'any' },
        { id: 'cor', rotulo: 'Cor', tipo: 'select', valor: ieGuiaCorPadrao(), opcoes: ieGuiaCores() }] });
    if (!v) return;
    IE._ultGuiaO = v.o;
    const g = { o: v.o, p: o ? +v.p : +v.p * ieUnidadeFator(doc, v.o === 'v' ? 'h' : 'v') };
    if (v.cor && v.cor !== ieGuiaCorPadrao()) g.cor = v.cor;
    (doc.guias = doc.guias || []).push(g);
    IE.verGuias = true; doc.sujo = true;
    ieHist(ieT('Nova guia'), doc);
    ieDesenharSobre();
    return g;
}
async function ieGuiaEditar(doc, g) {
    const u = iePref('unidade', 'px'), fat = ieUnidadeFator(doc, g.o === 'v' ? 'h' : 'v');
    const v = await ieDialogo({ titulo: 'Editar guia', campos: [
        { id: 'o', rotulo: 'Orientação', tipo: 'select', valor: g.o, opcoes: [['h', 'Horizontal'], ['v', 'Vertical']] },
        { id: 'p', rotulo: `Posição (${u})`, tipo: 'numero', valor: +(g.p / fat).toFixed(3), min: -100000, max: 100000, passo: 'any' },
        { id: 'cor', rotulo: 'Cor', tipo: 'select', valor: g.cor || ieGuiaCorPadrao(), opcoes: ieGuiaCores() },
        { id: 'apagar', rotulo: 'Excluir esta guia', tipo: 'check', valor: false }] });
    if (!v) return;
    if (v.apagar) doc.guias = doc.guias.filter(x => x !== g);
    else { g.o = v.o; g.p = +v.p * ieUnidadeFator(doc, v.o === 'v' ? 'h' : 'v'); if (v.cor !== ieGuiaCorPadrao()) g.cor = v.cor; else delete g.cor; }
    doc.sujo = true;
    ieHist(ieT(v.apagar ? 'Excluir guia' : 'Editar guia'), doc);
    ieDesenharSobre();
}
// Novas guias da forma: bordas e centro de cada camada selecionada (o conteúdo, como no Photoshop)
function ieGuiasDaForma(doc) {
    const sel = ieSelecionadas(doc);
    const novas = [];
    for (const L of sel) {
        const R = ieCaixaCamada(L);
        if (!R) continue;
        novas.push({ o: 'v', p: R.x }, { o: 'v', p: R.x + R.w / 2 }, { o: 'v', p: R.x + R.w }, { o: 'h', p: R.y }, { o: 'h', p: R.y + R.h / 2 }, { o: 'h', p: R.y + R.h });
    }
    if (!novas.length) { ieToast(ieT('Selecione uma camada com conteúdo')); return; }
    doc.guias = doc.guias || [];
    for (const g of novas) if (!doc.guias.some(x => x.o === g.o && Math.abs(x.p - g.p) < 0.01)) doc.guias.push(g);
    IE.verGuias = true; doc.sujo = true;
    ieHist(ieT('Novas guias da forma'), doc);
    ieDesenharSobre();
}
function ieGuiasLimpar(doc, onde = 'todas') {
    if (!doc || !(doc.guias || []).length) return;
    if (onde === 'prancheta') {
        const A = ieGuiasAlvos(doc, 'selecionadas')[0];
        doc.guias = doc.guias.filter(g => !(g.o === 'v' ? g.p >= A.x && g.p <= A.x + A.w : g.p >= A.y && g.p <= A.y + A.h));
    } else if (onde === 'tela') {
        const pr = iePranchetas(doc).map(L => L.prancheta);
        doc.guias = doc.guias.filter(g => pr.some(A => (g.o === 'v' ? g.p >= A.x && g.p <= A.x + A.w : g.p >= A.y && g.p <= A.y + A.h)));
    } else doc.guias = [];
    doc.sujo = true;
    ieHist(ieT('Limpar guias'), doc);
    ieDesenharSobre();
}

// ─────────────────────────── fatias das guias ───────────────────────────
// uma fatia por célula entre guias consecutivas (e as bordas do documento), numeradas na ordem de leitura:
// linhas de cima para baixo, em cada linha da esquerda para a direita (como o Photoshop numera)
function ieFatiasDasGuias(doc, { perguntar = true } = {}) {
    if (!doc) return [];
    const gs = doc.guias || [];
    const xs = [...new Set([0, doc.w, ...gs.filter(g => g.o === 'v').map(g => Math.round(g.p)).filter(p => p > 0 && p < doc.w)])].sort((a, b) => a - b);
    const ys = [...new Set([0, doc.h, ...gs.filter(g => g.o === 'h').map(g => Math.round(g.p)).filter(p => p > 0 && p < doc.h)])].sort((a, b) => a - b);
    if (xs.length < 3 && ys.length < 3) { if (perguntar) ieToast(ieT('Não há guias dentro da imagem: crie com Exibir > Guias > Novo layout de guias')); return []; }
    const aplicar = () => {
        doc.fatias = [];
        doc.seqFatia = doc.seqFatia || 0;
        for (let j = 0; j + 1 < ys.length; j++) for (let i = 0; i + 1 < xs.length; i++)
            doc.fatias.push({ id: ++doc.seqFatia, x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j], nome: '', url: '', alt: '' });
        doc.fatiaSel = doc.fatias[0]?.id ?? null;
        doc.verFatias = true;
        ieHist(ieT('Fatias das guias'), doc);
        ieDesenharSobre(); ieOpcoesRender();
        return doc.fatias;
    };
    if (perguntar && doc.fatias.length) {
        return appConfirm({ titulo: ieT('Fatias das guias'), texto: ieT('As fatias que já existem serão apagadas.'),
            botoes: [{ rotulo: ieT('Cancelar'), valor: null }, { rotulo: ieT('OK'), valor: 1, tipo: 'primario' }] }).then(r => (r ? aplicar() : []));
    }
    return aplicar();
}

// ─────────────────────────── encaixe (Exibir > Ajustar / Ajustar a) ───────────────────────────
function ieAjustarLigado() { return iePref('ajustar', true) !== false; }
function ieAjustarA() { return { guias: true, grade: true, camadas: true, fatias: true, limites: true, ...(iePref('ajustarA', {}) || {}) }; }
// linhas para onde encaixar (px do documento): guias, bordas e centro do documento, caixas das camadas visíveis,
// bordas das fatias e a grade (se visível). excluir = ids de camadas/fatias que estão se movendo
function ieAjustarLinhas(doc, excluir = {}) {
    const A = ieAjustarA(), xs = [], ys = [];
    if (A.guias && IE.verGuias) for (const g of doc.guias || []) if (g !== excluir.guia) (g.o === 'v' ? xs : ys).push(g.p);
    if (A.limites) { xs.push(0, doc.w / 2, doc.w); ys.push(0, doc.h / 2, doc.h); }
    if (A.fatias && doc.verFatias !== false) for (const f of doc.fatias || []) if (f !== excluir.fatia) { xs.push(f.x, f.x + f.w); ys.push(f.y, f.y + f.h); }
    if (A.camadas) {
        const chave = doc.hist.i + '|' + (excluir.camadas || []).join(',');
        if (!IE._ajCache || IE._ajCache.doc !== doc || IE._ajCache.chave !== chave) {
            const cx = [], cy = [], fora = new Set(excluir.camadas || []);
            iePercorrer(doc.camadas, L => {
                if (fora.has(L.id) || !L.visivel || L.tipo === 'grupo' || L.tipo === 'ajuste') return;
                const R = ieCaixaCamada(L);
                if (!R || (R.w >= doc.w && R.h >= doc.h)) return;   // fundo inteiro não conta
                cx.push(R.x, R.x + R.w / 2, R.x + R.w); cy.push(R.y, R.y + R.h / 2, R.y + R.h);
            });
            IE._ajCache = { doc, chave, cx, cy };
        }
        xs.push(...IE._ajCache.cx); ys.push(...IE._ajCache.cy);
    }
    if (A.grade && IE.grade) IE._ajGrade = 25; else IE._ajGrade = 0;
    return { xs, ys };
}
function ieAjustarValor(v, lista, lim) {
    let melhor = null, d0 = lim;
    for (const a of lista) { const d = Math.abs(a - v); if (d < d0) { d0 = d; melhor = a; } }
    if (IE._ajGrade) { const g = Math.round(v / IE._ajGrade) * IE._ajGrade; if (Math.abs(g - v) < d0) { d0 = Math.abs(g - v); melhor = g; } }
    return melhor;
}
// ponteiro de ferramentas que desenham retângulo/forma: o canto vai para a linha mais perto (8 px na tela)
function ieAjustarPonto(p, f, doc = IE.doc) {
    if (!doc || !ieAjustarLigado() || !p || IE.transf) return p;
    const nome = Object.keys(IE_FERR).find(k => IE_FERR[k] === f);
    if (!['letreiro', 'fatia', 'corte', 'forma'].includes(nome)) return p;
    if (nome === 'fatia' && IE.fatiaArr && IE.fatiaArr.h === 'dentro') return p;   // mover fatia: encaixa pelas bordas (ieAjustarRet)
    const lim = 8 / doc.zoom, L = ieAjustarLinhas(doc, { fatia: nome === 'fatia' && IE.fatiaArr ? IE.fatiaArr.f : null });
    const x = ieAjustarValor(p.x, L.xs, lim), y = ieAjustarValor(p.y, L.ys, lim);
    return x == null && y == null ? p : { ...p, x: x ?? p.x, y: y ?? p.y };
}
// retângulo que se move (camada, fatia): a menor correção que põe uma borda ou o centro numa linha
function ieAjustarDelta(R, excluir, doc = IE.doc) {
    if (!doc || !R || !ieAjustarLigado()) return { dx: 0, dy: 0 };
    const lim = 8 / doc.zoom, L = ieAjustarLinhas(doc, excluir);
    const melhor = (vals, linhas) => {
        let d = null;
        for (const v of vals) { const a = ieAjustarValor(v, linhas, lim); if (a != null && (d == null || Math.abs(a - v) < Math.abs(d))) d = a - v; }
        return d || 0;
    };
    let dx = melhor([R.x, R.x + R.w / 2, R.x + R.w], L.xs), dy = melhor([R.y, R.y + R.h / 2, R.y + R.h], L.ys);
    // guias inteligentes: também encaixa no espaçamento igual (o mesmo vão de outros objetos ou o meio entre dois)
    if (ieGuiasIntLigadas() && ieAjustarA().camadas) {
        const e = ieGIAlvosEspaco(doc, R, excluir && excluir.camadas);
        const perto = (alvos, v, d0) => { let d = d0; for (const a of alvos) if (Math.abs(a - v) < lim && (!d || Math.abs(a - v) < Math.abs(d))) d = a - v; return d; };
        dx = perto(e.xs, R.x, dx); dy = perto(e.ys, R.y, dy);
    }
    return { dx, dy };
}

// ─────────────────────────── guias inteligentes (como no Photoshop) ───────────────────────────
// Ao arrastar (Mover ou Ctrl+T): linhas magenta quando uma borda/centro bate com a de outro objeto ou do documento, e a
// medida do vão quando ele fica igual ao de outros objetos. Ctrl parado sobre um objeto: distâncias até ele.
const IE_GI_COR = '#ff2bd6';
function ieGuiasIntLigadas() { return iePref('guiasInt', true) !== false; }
// caixas dos outros objetos + vãos entre vizinhos (guardados enquanto o documento não muda)
function ieGIObjetos(doc, excluir = []) {
    const chave = doc.hist.i + '|' + excluir.join(',');
    if (IE._giCache && IE._giCache.doc === doc && IE._giCache.chave === chave) return IE._giCache;
    const fora = new Set(excluir), objs = [];
    iePercorrer(doc.camadas, L => {
        if (fora.has(L.id) || !L.visivel || L.tipo === 'grupo' || L.tipo === 'ajuste') return;
        const R = ieCaixaCamada(L);
        if (R && R.w > 0 && R.h > 0 && !(R.w >= doc.w && R.h >= doc.h)) objs.push(R);
    });
    // vão de cada objeto até o vizinho mais perto à direita / abaixo (que se sobrepõe no outro eixo)
    const vaos = { h: [], v: [] };
    for (const A of objs) {
        let bh = null, bv = null;
        for (const B of objs) {
            if (A === B) continue;
            const gh = B.x - (A.x + A.w), gv = B.y - (A.y + A.h);
            if (gh > 0.5 && B.y < A.y + A.h && B.y + B.h > A.y && (!bh || gh < bh.g)) bh = { g: gh, A, B };
            if (gv > 0.5 && B.x < A.x + A.w && B.x + B.w > A.x && (!bv || gv < bv.g)) bv = { g: gv, A, B };
        }
        if (bh) vaos.h.push(bh);
        if (bv) vaos.v.push(bv);
    }
    return (IE._giCache = { doc, chave, objs, vaos });
}
// vizinhos mais perto de R nos quatro lados
function ieGIVizinhos(objs, R) {
    const v = {};
    for (const O of objs) {
        const sobV = O.y < R.y + R.h && O.y + O.h > R.y, sobH = O.x < R.x + R.w && O.x + O.w > R.x;
        if (sobV && O.x + O.w <= R.x + 0.5 && (!v.e || O.x + O.w > v.e.x + v.e.w)) v.e = O;
        if (sobV && O.x >= R.x + R.w - 0.5 && (!v.d || O.x < v.d.x)) v.d = O;
        if (sobH && O.y + O.h <= R.y + 0.5 && (!v.c || O.y + O.h > v.c.y + v.c.h)) v.c = O;
        if (sobH && O.y >= R.y + R.h - 0.5 && (!v.b || O.y < v.b.y)) v.b = O;
    }
    return v;
}
// posições de R.x / R.y que deixam o vão igual a um que já existe (ou R no meio de dois vizinhos)
function ieGIAlvosEspaco(doc, R, excluir) {
    const { objs, vaos } = ieGIObjetos(doc, excluir), v = ieGIVizinhos(objs, R), xs = [], ys = [];
    const gh = [...new Set(vaos.h.map(a => Math.round(a.g)))], gv = [...new Set(vaos.v.map(a => Math.round(a.g)))];
    if (v.e) gh.forEach(g => xs.push(v.e.x + v.e.w + g));
    if (v.d) gh.forEach(g => xs.push(v.d.x - g - R.w));
    if (v.e && v.d) xs.push(Math.round((v.e.x + v.e.w + v.d.x - R.w) / 2));
    if (v.c) gv.forEach(g => ys.push(v.c.y + v.c.h + g));
    if (v.b) gv.forEach(g => ys.push(v.b.y - g - R.h));
    if (v.c && v.b) ys.push(Math.round((v.c.y + v.c.h + v.b.y - R.h) / 2));
    return { xs, ys };
}
// o que desenhar para R (caixa do que se move): {linhas: [{o, p, a, b}], medidas: [{o, a, b, p}]}
function ieGICalc(doc, R, excluir) {
    if (!doc || !R || !ieGuiasIntLigadas()) return null;
    const { objs, vaos } = ieGIObjetos(doc, excluir), tol = 0.6, linhas = [], medidas = [];
    const alinha = (o, p, a, b) => {
        const l = linhas.find(l => l.o === o && Math.abs(l.p - p) < tol);
        if (l) { l.a = Math.min(l.a, a); l.b = Math.max(l.b, b); } else linhas.push({ o, p, a, b });
    };
    const D = { x: 0, y: 0, w: doc.w, h: doc.h };
    for (const O of [D, ...objs]) {
        for (const ov of [O.x, O.x + O.w / 2, O.x + O.w]) for (const rv of [R.x, R.x + R.w / 2, R.x + R.w])
            if (Math.abs(ov - rv) < tol) alinha('v', ov, Math.min(O.y, R.y), Math.max(O.y + O.h, R.y + R.h));
        for (const ov of [O.y, O.y + O.h / 2, O.y + O.h]) for (const rv of [R.y, R.y + R.h / 2, R.y + R.h])
            if (Math.abs(ov - rv) < tol) alinha('h', ov, Math.min(O.x, R.x), Math.max(O.x + O.w, R.x + R.w));
    }
    // vão igual: R até o vizinho e o mesmo vão em outro par (mostra os dois, como no Photoshop)
    const v = ieGIVizinhos(objs, R);
    const meioV = (A, B) => (Math.max(A.y, B.y) + Math.min(A.y + A.h, B.y + B.h)) / 2;
    const meioH = (A, B) => (Math.max(A.x, B.x) + Math.min(A.x + A.w, B.x + B.w)) / 2;
    const iguais = (g, lista, eixo) => {
        const par = lista.find(q => Math.abs(q.g - g) < tol && q.A !== R && q.B !== R);
        if (!par) return false;
        medidas.push(eixo === 'h' ? { o: 'h', a: par.A.x + par.A.w, b: par.B.x, p: meioV(par.A, par.B) } : { o: 'v', a: par.A.y + par.A.h, b: par.B.y, p: meioH(par.A, par.B) });
        return true;
    };
    const ge = v.e && R.x - (v.e.x + v.e.w), gd = v.d && v.d.x - (R.x + R.w);
    const gc = v.c && R.y - (v.c.y + v.c.h), gb = v.b && v.b.y - (R.y + R.h);
    const mostraH = (g, a, b, O) => medidas.push({ o: 'h', a, b, p: meioV(O, R) });
    const mostraV = (g, a, b, O) => medidas.push({ o: 'v', a, b, p: meioH(O, R) });
    if (ge > 0.5 && gd > 0.5 && Math.abs(ge - gd) < tol) { mostraH(ge, v.e.x + v.e.w, R.x, v.e); mostraH(gd, R.x + R.w, v.d.x, v.d); }
    else {
        if (ge > 0.5 && iguais(ge, vaos.h, 'h')) mostraH(ge, v.e.x + v.e.w, R.x, v.e);
        if (gd > 0.5 && iguais(gd, vaos.h, 'h')) mostraH(gd, R.x + R.w, v.d.x, v.d);
    }
    if (gc > 0.5 && gb > 0.5 && Math.abs(gc - gb) < tol) { mostraV(gc, v.c.y + v.c.h, R.y, v.c); mostraV(gb, R.y + R.h, v.b.y, v.b); }
    else {
        if (gc > 0.5 && iguais(gc, vaos.v, 'v')) mostraV(gc, v.c.y + v.c.h, R.y, v.c);
        if (gb > 0.5 && iguais(gb, vaos.v, 'v')) mostraV(gb, R.y + R.h, v.b.y, v.b);
    }
    return linhas.length || medidas.length ? { linhas, medidas } : null;
}
// Ctrl parado com o Mover: distâncias da seleção até o objeto sob o mouse (ou até as bordas do documento)
function ieGIMedirAte(doc, p) {
    const S = ieCaixaAlvos(doc);
    if (!S || !p) return null;
    const L = ieAlvoNoPonto(doc, p);
    let sel = false;
    if (L) iePercorrer(ieSelecionadas(doc), Y => { if (Y === L) sel = true; });
    const H = (!L || sel) ? { x: 0, y: 0, w: doc.w, h: doc.h } : ieCaixaCamada(L);
    if (!H) return null;
    const medidas = [], cy = S.y + S.h / 2, cx = S.x + S.w / 2;
    const yH = Math.max(S.y, H.y) < Math.min(S.y + S.h, H.y + H.h) ? (Math.max(S.y, H.y) + Math.min(S.y + S.h, H.y + H.h)) / 2 : cy;
    const xV = Math.max(S.x, H.x) < Math.min(S.x + S.w, H.x + H.w) ? (Math.max(S.x, H.x) + Math.min(S.x + S.w, H.x + H.w)) / 2 : cx;
    const add = (o, a, b, p) => { if (Math.abs(b - a) >= 0.5) medidas.push({ o, a: Math.min(a, b), b: Math.max(a, b), p }); };
    if (H.x >= S.x + S.w) add('h', S.x + S.w, H.x, yH);
    else if (H.x + H.w <= S.x) add('h', H.x + H.w, S.x, yH);
    else { add('h', H.x, S.x, cy); add('h', S.x + S.w, H.x + H.w, cy); }
    if (H.y >= S.y + S.h) add('v', S.y + S.h, H.y, xV);
    else if (H.y + H.h <= S.y) add('v', H.y + H.h, S.y, xV);
    else { add('v', H.y, S.y, cx); add('v', S.y + S.h, H.y + H.h, cx); }
    return { linhas: [], medidas, caixa: H };
}
function ieGISobre(ctx, doc) {
    const g = IE._gi || (!IE.mov && !IE.transf && IE._giHover);
    if (!g || !ieGuiasIntLigadas()) return;
    const T = (x, y) => ieDocTela(x, y, doc), r = v => Math.round(v) + 0.5;
    ctx.save();
    ctx.strokeStyle = IE_GI_COR; ctx.fillStyle = IE_GI_COR; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const l of g.linhas) {
        if (l.o === 'v') { const a = T(l.p, l.a), b = T(l.p, l.b); ctx.moveTo(r(a.x), a.y - 6); ctx.lineTo(r(a.x), b.y + 6); }
        else { const a = T(l.a, l.p), b = T(l.b, l.p); ctx.moveTo(a.x - 6, r(a.y)); ctx.lineTo(b.x + 6, r(a.y)); }
    }
    ctx.stroke();
    if (g.caixa) { const a = T(g.caixa.x, g.caixa.y); ctx.strokeRect(r(a.x), r(a.y), Math.round(g.caixa.w * doc.zoom), Math.round(g.caixa.h * doc.zoom)); }
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const m of g.medidas) {
        const h = m.o === 'h', a = h ? T(m.a, m.p) : T(m.p, m.a), b = h ? T(m.b, m.p) : T(m.p, m.b);
        ctx.beginPath();
        if (h) { ctx.moveTo(a.x, r(a.y)); ctx.lineTo(b.x, r(a.y)); ctx.moveTo(r(a.x), a.y - 4); ctx.lineTo(r(a.x), a.y + 4); ctx.moveTo(r(b.x), b.y - 4); ctx.lineTo(r(b.x), b.y + 4); }
        else { ctx.moveTo(r(a.x), a.y); ctx.lineTo(r(a.x), b.y); ctx.moveTo(a.x - 4, r(a.y)); ctx.lineTo(a.x + 4, r(a.y)); ctx.moveTo(b.x - 4, r(b.y)); ctx.lineTo(b.x + 4, r(b.y)); }
        ctx.stroke();
        const txt = Math.round(m.b - m.a) + ' px', w = ctx.measureText(txt).width + 10, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const lx = h ? mx : mx + w / 2 + 4, ly = h ? my + 12 : my;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(lx - w / 2, ly - 8, w, 16, 3); else ctx.rect(lx - w / 2, ly - 8, w, 16);
        ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(txt, lx, ly + 0.5); ctx.fillStyle = IE_GI_COR;
    }
    ctx.restore();
}

// ─────────────────────────── menus, atalhos, comandos ───────────────────────────
Object.assign(IE_CMDS, {
    layoutGuias: doc => ieGuiasLayoutDialogo(doc),
    novaGuia: doc => ieNovaGuia(doc),
    guiasDaForma: doc => ieGuiasDaForma(doc),
    limparGuias: doc => ieGuiasLimpar(doc, 'todas'),
    limparGuiasPrancheta: doc => ieGuiasLimpar(doc, 'prancheta'),
    limparGuiasTela: doc => ieGuiasLimpar(doc, 'tela'),
    fatiasGuias: doc => ieFatiasDasGuias(doc),
    ajustar: () => { iePrefGravar('ajustar', !ieAjustarLigado()); },
    guiasInt: () => { iePrefGravar('guiasInt', !ieGuiasIntLigadas()); IE._gi = IE._giHover = null; ieDesenharSobre(); },
});
for (const k of ['guias', 'grade', 'camadas', 'fatias', 'limites']) IE_CMDS['ajustarA:' + k] = () => { const a = ieAjustarA(); a[k] = !a[k]; iePrefGravar('ajustarA', a); };
IE_CMDS['ajustarA:tudo'] = () => iePrefGravar('ajustarA', { guias: true, grade: true, camadas: true, fatias: true, limites: true });
IE_CMDS['ajustarA:nada'] = () => iePrefGravar('ajustarA', { guias: false, grade: false, camadas: false, fatias: false, limites: false });
Object.assign(IE_ATALHOS, { 'Shift+Ctrl+;': 'ajustar' });
(function () {
    const ex = IE_MENUS.find(m => m[0] === 'Exibir')[1];
    const i = ex.findIndex(it => Array.isArray(it) && it[0] === 'Guias');
    const sub = [['Mostrar guias', 'guias', 'Ctrl+;'], ['Travar guias', 'travarGuias', 'Alt+Ctrl+;'], '-',
        ['Limpar guias', 'limparGuias'], ['Limpar guias da prancheta selecionada', 'limparGuiasPrancheta'], ['Limpar guias da tela de pintura', 'limparGuiasTela'], '-',
        ['Nova guia...', 'novaGuia'], ['Novo layout de guias...', 'layoutGuias'], ['Novas guias da forma', 'guiasDaForma']];
    const aj = [['Ajustar', 'ajustar', 'Shift+Ctrl+;'], ['Ajustar a', [['Guias', 'ajustarA:guias'], ['Grade', 'ajustarA:grade'], ['Camadas', 'ajustarA:camadas'],
        ['Fatias', 'ajustarA:fatias'], ['Limites do documento', 'ajustarA:limites'], '-', ['Tudo', 'ajustarA:tudo'], ['Nenhum', 'ajustarA:nada']]],
        ['Guias inteligentes', 'guiasInt']];
    if (i >= 0) ex.splice(i, 1, ['Guias', sub], ...aj);
    else ex.push('-', ['Guias', sub], ...aj);
    const pode = ieCmdPode;
    ieCmdPode = function (c) {
        if (c === 'ajustar' || c === 'guiasInt' || String(c).startsWith('ajustarA:') || c === 'layoutGuias' || c === 'novaGuia') return !!IE.doc;
        if (c === 'limparGuiasPrancheta' || c === 'limparGuiasTela') return ieTemPranchetas(IE.doc) && !!(IE.doc.guias || []).length;
        if (c === 'guiasDaForma') return !!IE.doc && ieSelecionadas(IE.doc).length > 0;
        if (c === 'fatiasGuias') return !!IE.doc && (IE.doc.guias || []).length > 0;
        return pode(c);
    };
})();
// duplo clique numa guia com o Mover: editar (posição, orientação, cor, excluir)
document.addEventListener('dblclick', ev => {
    const doc = IE.doc, sobre = ieEl('ie-sobre');
    if (!doc || ev.target !== sobre || (IE.ferrTemp || IE.ferr) !== 'mover' || !IE.verGuias || doc.guiasTravadas) return;
    const r = sobre.getBoundingClientRect(), g = ieGuiaPerto(doc, ev.clientX - r.left, ev.clientY - r.top);
    if (!g) return;
    ev.stopPropagation(); ev.preventDefault();
    ieGuiaEditar(doc, g);
}, true);

// ✓ dos itens de menu que ligam/desligam (ieMenuHtml consulta)
function ieCmdMarcado(c) {
    if (c === 'ajustar') return ieAjustarLigado();
    if (c === 'guiasInt') return ieGuiasIntLigadas();
    if (String(c).startsWith('ajustarA:')) { const k = c.slice(9), a = ieAjustarA(); return k in a ? ieAjustarLigado() && a[k] : false; }
    if (c === 'guias') return !!IE.verGuias;
    if (c === 'travarGuias') return !!(IE.doc && IE.doc.guiasTravadas);
    if (c === 'reguas') return ieReguas();
    if (c === 'grade') return !!IE.grade;
    if (c === 'verFatias') return !!(IE.doc && IE.doc.verFatias);
    return false;
}
// Ctrl apertado/solto com o Mover parado: liga/desliga as distâncias na hora (sem esperar o mouse andar)
document.addEventListener('keydown', ev => {
    if (ev.key !== 'Control' || ev.repeat || !IE.doc || IE.mov || IE.transf || !ieAtivoVisivel() || !ieGuiasIntLigadas()) return;
    if ((IE.ferrTemp || IE.ferr) !== 'mover' || !IE.mouse) return;
    IE._giHover = ieGIMedirAte(IE.doc, IE.mouse); ieDesenharSobre();
});
document.addEventListener('keyup', ev => { if (ev.key === 'Control' && IE._giHover) { IE._giHover = null; ieDesenharSobre(); } });
window.addEventListener('blur', () => { if (IE._giHover) { IE._giHover = null; ieDesenharSobre(); } });
