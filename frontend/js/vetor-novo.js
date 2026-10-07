// Novo documento como no Illustrator: categorias (Impressão, Papelaria, Redes sociais, Tela, Grande formato, Identidade
// visual, Salvos) com cartões de modelo e o painel de detalhes (nome, largura/altura com unidade, orientação, pranchetas
// e a ordem delas, sangria, cor e perfil). "Salvar modelo" guarda o ajuste em Salvos (localStorage). A tela inicial
// do Vetor mostra uma linha de começo rápido. Unidades: mm | cm | pol | px (px = 0,75 pt, como 1080 px em tela).
// Modelo: [nome, largura, altura, unidade, {cor, sangria, pranchetas, layout}]
const VK_NOVO_CAT = [
    ['Impressão', [['A4', 210, 297, 'mm'], ['A3', 297, 420, 'mm'], ['A5', 148, 210, 'mm'], ['A6', 105, 148, 'mm'], ['A2 (cartaz)', 420, 594, 'mm'],
        ['A1 (cartaz)', 594, 841, 'mm'], ['Carta', 215.9, 279.4, 'mm'], ['Ofício', 215.9, 355.6, 'mm'], ['Flyer 10×15', 100, 150, 'mm'],
        ['Flyer 15×21', 150, 210, 'mm'], ['Folder A4 (3 dobras)', 297, 210, 'mm', { pranchetas: 2, layout: 'vertical' }], ['Revista 20,5×27,5', 205, 275, 'mm', { pranchetas: 8 }]]],
    ['Papelaria', [['Cartão de visita', 90, 50, 'mm', { pranchetas: 2, layout: 'vertical' }], ['Cartão 85×55', 85, 55, 'mm', { pranchetas: 2, layout: 'vertical' }],
        ['Papel timbrado A4', 210, 297, 'mm'], ['Envelope DL', 220, 110, 'mm'], ['Envelope saco A4', 250, 353, 'mm'], ['Pasta A4 (aberta)', 470, 330, 'mm'],
        ['Crachá 9×13', 90, 130, 'mm'], ['Etiqueta 10×5', 100, 50, 'mm'], ['Adesivo 5×5', 50, 50, 'mm'], ['Tag 5×9', 50, 90, 'mm']]],
    ['Redes sociais', [['Post quadrado', 1080, 1080, 'px'], ['Post retrato 4:5', 1080, 1350, 'px'], ['Story / Reels', 1080, 1920, 'px'],
        ['Carrossel (10)', 1080, 1350, 'px', { pranchetas: 10 }], ['Capa do YouTube', 2560, 1440, 'px'], ['Miniatura do YouTube', 1280, 720, 'px'],
        ['Capa do LinkedIn', 1584, 396, 'px'], ['Capa do Facebook', 820, 312, 'px'], ['Foto de perfil', 1080, 1080, 'px']]],
    ['Tela', [['Full HD', 1920, 1080, 'px'], ['HD', 1280, 720, 'px'], ['4K', 3840, 2160, 'px'], ['Web 1440', 1440, 1024, 'px'],
        ['Celular', 393, 852, 'px'], ['Tablet', 1024, 1366, 'px'], ['Ícone de app', 1024, 1024, 'px'], ['Apresentação 16:9 (10)', 1920, 1080, 'px', { pranchetas: 10 }]]],
    ['Grande formato', [['Banner 60×90 cm', 600, 900, 'mm'], ['Banner 80×120 cm', 800, 1200, 'mm'], ['Banner 90×120 cm', 900, 1200, 'mm'],
        ['Lona 1×2 m', 1000, 2000, 'mm', { sangria: 10 }], ['Backdrop 3×2 m', 3000, 2000, 'mm', { sangria: 10 }], ['Faixa 3×0,7 m', 3000, 700, 'mm', { sangria: 10 }],
        ['Wind banner 0,7×2,5 m', 700, 2500, 'mm', { sangria: 10 }]]],
    ['Identidade visual', [['Manual de marca 16:9 (12)', 1920, 1080, 'px', { pranchetas: 12 }], ['Manual de marca A4 paisagem (12)', 297, 210, 'mm', { pranchetas: 12 }],
        ['Construção de logo', 1000, 1000, 'px', { pranchetas: 4 }], ['Papelaria completa A4 (4)', 210, 297, 'mm', { pranchetas: 4 }],
        ['Apresentação de marca (8)', 1920, 1080, 'px', { pranchetas: 8 }], ['Ícones da marca (12)', 512, 512, 'px', { pranchetas: 12 }]]],
];
const VK_UN = { mm: 1, cm: 10, pol: 25.4, px: 0.75 / (72 / 25.4) };   // mm por unidade
const vkUnMM = (v, un) => v * VK_UN[un];
function vkNovoSalvos() { try { return JSON.parse(localStorage.getItem('vk-modelos') || '[]'); } catch (e) { return []; } }
function vkNovoModelos(cat) { return cat === 'Salvos' ? vkNovoSalvos() : (VK_NOVO_CAT.find(c => c[0] === cat) || VK_NOVO_CAT[0])[1]; }
function vkNovoCartao(m, i) {
    const [nome, w, h, un, o = {}] = m, k = 46 / Math.max(w, h), n = o.pranchetas || 1;
    return `<button class="vk-novo-card" data-i="${i}"><span class="vk-novo-thumb"><i style="width:${Math.max(6, w * k)}px;height:${Math.max(6, h * k)}px"></i>${n > 1 ? `<b>${n}</b>` : ''}</span>
        <span class="vk-novo-nome">${vkEsc_(nome)}</span><small>${vkR(w, 1)} × ${vkR(h, 1)} ${un}</small></button>`;
}
// estado do diálogo (o último ajuste usado volta na próxima vez)
function vkNovoEstado() {
    let u = null; try { u = JSON.parse(localStorage.getItem('vk-novo-ultimo') || 'null'); } catch (e) { /* sem storage */ }
    return u || { cat: 'Impressão', i: 0, nome: 'Sem título', w: 210, h: 297, un: 'mm', n: 1, layout: 'grade', sangria: 3, cor: 'cmyk', perfil: 'FOGRA39' };
}
function vkNovoAplicarModelo(S, m) {
    const [nome, w, h, un, o = {}] = m;
    Object.assign(S, { nome, w, h, un, n: o.pranchetas || 1, layout: o.layout || 'grade', cor: un === 'px' ? 'rgb' : 'cmyk',
        sangria: o.sangria ?? (un === 'px' ? 0 : 3) });
}
function vkNovoDialogo(cat = null, idx = null) {
    const S = vkNovoEstado();
    if (cat) { S.cat = cat; S.i = idx ?? 0; const m = vkNovoModelos(cat)[S.i]; if (m) vkNovoAplicarModelo(S, m); }
    vkModal(`<div class="vk-novo">
        <div class="vk-novo-topo"><b>Novo documento</b><nav id="vkn-cats"></nav></div>
        <div class="vk-novo-corpo"><div class="vk-novo-grade" id="vkn-grade"></div>
        <aside class="vk-novo-det">
            <div class="vk-novo-tit">Detalhes</div>
            <label>Nome<input id="vkn-nome"></label>
            <div class="vk-novo-2"><label>Largura<input id="vkn-w" type="number" step="0.1" min="0.1"></label><label>Altura<input id="vkn-h" type="number" step="0.1" min="0.1"></label>
                <label>Unidade<select id="vkn-un">${Object.keys(VK_UN).map(u => `<option>${u}</option>`).join('')}</select></label></div>
            <div class="vk-novo-2"><span>Orientação</span><button class="ie-btn ie-btn-mini" id="vkn-ret" title="Retrato">▯</button><button class="ie-btn ie-btn-mini" id="vkn-pai" title="Paisagem">▭</button></div>
            <div class="vk-novo-2"><label>Pranchetas<input id="vkn-n" type="number" min="1" max="200"></label>
                <label>Ordem<select id="vkn-lay"><option value="grade">4 por linha, descendo</option><option value="vertical">Uma abaixo da outra</option><option value="horizontal">Lado a lado</option></select></label></div>
            <label>Sangria (mm)<input id="vkn-s" type="number" step="0.5" min="0"></label>
            <div class="vk-novo-2"><label>Cor<select id="vkn-cor"><option value="cmyk">CMYK (impressão)</option><option value="rgb">RGB (tela)</option></select></label>
                <label>Perfil<select id="vkn-perfil"><option>FOGRA39</option><option>FOGRA29</option><option>GRACOL</option><option>SWOP</option></select></label></div>
            <div class="vk-nota" id="vkn-nota"></div>
            <div class="vk-novo-acoes"><button class="ie-btn ie-btn-mini" id="vkn-salvar">Salvar modelo</button><span></span><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="vkn-ok">Criar</button></div>
        </aside></div></div>`, (m, fechar) => {
        m.firstElementChild.classList.add('vk-novo-dlg');
        const $ = s => m.querySelector(s);
        const campos = () => {
            $('#vkn-nome').value = S.nome; $('#vkn-w').value = vkR(S.w, 2); $('#vkn-h').value = vkR(S.h, 2); $('#vkn-un').value = S.un;
            $('#vkn-n').value = S.n; $('#vkn-lay').value = S.layout; $('#vkn-s').value = S.sangria; $('#vkn-cor').value = S.cor; $('#vkn-perfil').value = S.perfil;
            $('#vkn-perfil').disabled = S.cor === 'rgb';
            const mm = [vkUnMM(S.w, S.un), vkUnMM(S.h, S.un)];
            $('#vkn-nota').textContent = (S.un !== 'mm' ? `${vkR(mm[0], 1)} × ${vkR(mm[1], 1)} mm. ` : '') + (S.cor === 'rgb' ? 'Tela: RGB, sem sangria; exporta PNG/SVG/PDF digital.'
                : 'Impressão no Brasil: CMYK + FOGRA39 (couché) ou FOGRA29 (offset), sangria de 3 mm.') + (Math.max(...mm) > 5080 ? ' Acima de 5,08 m o PDF não comporta: use escala 1:10.' : '');
            $('#vkn-ret').classList.toggle('on', S.h >= S.w); $('#vkn-pai').classList.toggle('on', S.w > S.h);
        };
        const grade = () => {
            const cats = [...VK_NOVO_CAT.map(c => c[0]), 'Salvos'];
            $('#vkn-cats').innerHTML = cats.map(c => `<button class="${c === S.cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('');
            const ms = vkNovoModelos(S.cat);
            $('#vkn-grade').innerHTML = ms.length ? ms.map(vkNovoCartao).join('') : '<div class="vk-nota">Nenhum modelo salvo: ajuste os detalhes e clique em "Salvar modelo".</div>';
            const sel = $(`#vkn-grade [data-i="${S.i}"]`); if (sel) sel.classList.add('on');
        };
        grade(); campos();
        m.querySelector('.vk-novo').addEventListener('click', e => {
            const c = e.target.closest('[data-cat]');
            if (c) { S.cat = c.dataset.cat; S.i = -1; grade(); return; }
            const k = e.target.closest('[data-i]');
            if (k) { S.i = +k.dataset.i; vkNovoAplicarModelo(S, vkNovoModelos(S.cat)[S.i]); grade(); campos(); if (e.detail === 2) $('#vkn-ok').click(); }
        });
        const ler = () => { S.nome = $('#vkn-nome').value || 'Sem título'; S.w = +$('#vkn-w').value || S.w; S.h = +$('#vkn-h').value || S.h; S.n = Math.max(1, Math.round(+$('#vkn-n').value || 1));
            S.layout = $('#vkn-lay').value; S.sangria = Math.max(0, +$('#vkn-s').value || 0); S.cor = $('#vkn-cor').value; S.perfil = $('#vkn-perfil').value; };
        $('#vkn-un').onchange = e => { ler(); const nu = e.target.value; S.w = vkUnMM(S.w, S.un) / VK_UN[nu]; S.h = vkUnMM(S.h, S.un) / VK_UN[nu]; S.un = nu; campos(); };
        $('#vkn-cor').onchange = () => { ler(); if (S.cor === 'rgb') S.sangria = 0; campos(); };
        m.querySelectorAll('.vk-novo-det input, #vkn-lay, #vkn-perfil').forEach(x => x.addEventListener('change', () => { ler(); campos(); }));
        $('#vkn-ret').onclick = () => { ler(); if (S.w > S.h) [S.w, S.h] = [S.h, S.w]; campos(); };
        $('#vkn-pai').onclick = () => { ler(); if (S.h > S.w) [S.w, S.h] = [S.h, S.w]; campos(); };
        $('#vkn-salvar').onclick = () => {
            ler(); const l = vkNovoSalvos().filter(x => x[0] !== S.nome);
            l.unshift([S.nome, S.w, S.h, S.un, { pranchetas: S.n, layout: S.layout, sangria: S.sangria }]);
            try { localStorage.setItem('vk-modelos', JSON.stringify(l.slice(0, 40))); } catch (e) { /* sem storage */ }
            S.cat = 'Salvos'; S.i = 0; grade(); vkToast('Modelo salvo em "Salvos"');
        };
        $('#vkn-ok').onclick = () => {
            ler(); try { localStorage.setItem('vk-novo-ultimo', JSON.stringify(S)); } catch (e) { /* sem storage */ }
            fechar(); vkNovoCriar(S);
        };
        $('#vkn-nome').focus(); $('#vkn-nome').select();
    });
}
function vkNovoCriar(S) {
    return vkCmdUi('novo', { nome: S.nome, larg: vkR(vkUnMM(S.w, S.un), 3), alt: vkR(vkUnMM(S.h, S.un), 3), pranchetas: S.n, sangria: S.sangria,
        modoCor: S.cor, perfil: S.perfil, layout_pr: { modo: S.layout } }).then(r => { setTimeout(() => vkEnquadrar(S.n > 1 ? vkBoxUniao(VK.doc.pranchetas.map(p => ({ tipo: 'caminho', subs: vkRetSubs(p.x, p.y, p.w, p.h) }))) : null), 30); return r; });
}
// começo rápido na tela inicial (clique cria; "Mais modelos" abre o diálogo)
const VK_RAPIDO = [['Impressão', 0], ['Papelaria', 0], ['Redes sociais', 0], ['Redes sociais', 2], ['Tela', 0], ['Identidade visual', 0]];
function vkInicioRapido() {
    const box = document.querySelector('#vk-inicio .ie-inicio-box'); if (!box || box.querySelector('.vk-rapido')) return;
    const d = document.createElement('div'); d.className = 'vk-rapido';
    d.innerHTML = `<div class="ie-recentes-tit">Começar rápido</div><div class="vk-rapido-lista">${VK_RAPIDO.map(([c, i], k) => vkNovoCartao(vkNovoModelos(c)[i], k)).join('')}
        <button class="vk-novo-card vk-mais" data-mais><span class="vk-novo-thumb">+</span><span class="vk-novo-nome">Mais modelos…</span></button></div>`;
    d.onclick = e => {
        if (e.target.closest('[data-mais]')) return vkNovoDialogo();
        const k = e.target.closest('[data-i]'); if (!k) return;
        const [c, i] = VK_RAPIDO[+k.dataset.i], S = vkNovoEstado(); vkNovoAplicarModelo(S, vkNovoModelos(c)[i]); S.perfil = S.perfil || 'FOGRA39'; vkNovoCriar(S);
    };
    box.querySelector('.ie-recentes').before(d);
}
(function () {   // a tela inicial é montada pelo vetor-paineis.js: observa até aparecer
    const tenta = () => { if (document.querySelector('#vk-inicio .ie-inicio-box')) vkInicioRapido(); };
    new MutationObserver(tenta).observe(document.getElementById('vk') || document.body, { childList: true, subtree: true });
    tenta();
})();
