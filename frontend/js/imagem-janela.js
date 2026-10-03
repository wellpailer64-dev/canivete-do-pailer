// =========================================================
// Editor de Imagem — menu Janela do Photoshop: painéis, Organizar, Espaço de trabalho, Opções, Ferramentas,
// Barra de tarefas contextual e a lista de documentos abertos.
// Painéis novos (criados aqui e encaixados pelo imagem-dock.js): Ajustes, Amostras, Canais, Caractere, Estilos de
// caractere, Composições de camadas, Configurações do pincel, Cor, Degradês, Estilos, Estilos de parágrafo, Formas,
// Glifos, Histograma, Informações, Navegador, Observações, Origem do clone, Padrões, Parágrafo, Pincéis e
// Predefinições de ferramentas. Os de nuvem/3D/vídeo do Photoshop aparecem no menu marcados como "ainda não".
// Cada painel: IE_JAN[id] = {titulo, eventos: ['doc','cor','mouse','comp','ferr'], render(corpo)}; só redesenha
// visível. As listas guardadas (amostras, degradês, padrões, pincéis...) ficam nas preferências (%APPDATA%).
// =========================================================

const IE_JAN = {};
let ieJanPend = new Set(), ieJanT = 0;

function ieJanRegistrar(id, titulo, eventos, render) {
    IE_JAN[id] = { titulo, eventos, render };
    IE_DOCK_PAINEIS[id] = titulo;
    if (ieEl('ie-p-' + id)) return;
    const sec = document.createElement('section');
    sec.className = 'ie-painel ie-p-novo';
    sec.id = 'ie-p-' + id;
    sec.innerHTML = `<header class="ie-painel-cab">${ieT(titulo)}</header><div class="ie-painel-corpo ie-pn" data-pn="${id}"></div>`;
    sec.hidden = true;
    ieEl('ie-paineis').appendChild(sec);
}
function ieJanVisivel(id) { const p = ieEl('ie-p-' + id); return !!p && !p.hidden && !p.classList.contains('recolhido') && p.offsetParent !== null; }
function ieJanAtualizar(evento) {
    for (const [id, j] of Object.entries(IE_JAN)) if (!evento || j.eventos.includes(evento)) ieJanPend.add(id);
    clearTimeout(ieJanT);
    ieJanT = setTimeout(() => {
        const ids = [...ieJanPend]; ieJanPend.clear();
        for (const id of ids) {
            if (!ieJanVisivel(id)) continue;
            const corpo = document.querySelector(`[data-pn="${id}"]`);
            if (!corpo || corpo.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && evento !== 'doc') continue;
            try { IE_JAN[id].render(corpo, IE.doc); } catch (e) { console.error('[painel]', id, e); }
        }
    }, evento === 'mouse' ? 0 : 60);
}
// ganchos: o que muda e quem redesenha
(function () {
    const embrulhar = (nome, evento) => { const f = window[nome]; if (typeof f !== 'function') return; window[nome] = function (...a) { const r = f.apply(this, a); ieJanAtualizar(evento); return r; }; };
    embrulhar('ieUiTudo', 'doc'); embrulhar('ieUiCamadas', 'doc'); embrulhar('ieUiCores', 'cor'); embrulhar('ieOpcoesRender', 'ferr');
    embrulhar('ieStatusMouse', 'mouse'); embrulhar('ieHistRender', 'comp');
    const q = ieQuadro;
    ieQuadro = function () { const r = q(); if (IE.doc && IE.doc._compV !== IE._janCompV) { IE._janCompV = IE.doc._compV; ieJanAtualizar('comp'); } ieJanAtualizar('vista'); return r; };
})();

const ieJanH = s => ieEsc(ieT(s));
const ieJanLista = (k, padrao = []) => [...(iePref(k, padrao) || [])];

// ─────────────────────────── Cor (F6) ───────────────────────────
IE.corAlvo = 0;
function ieHsv(hex) {
    const [r, g, b] = ieHexRgb(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round(((h * 60) + 360) % 360), Math.round(mx ? d / mx * 100 : 0), Math.round(mx * 100)];
}
function ieDeHsv(h, s, v) { s /= 100; v /= 100; const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return ieRgbHex(f(5) * 255, f(3) * 255, f(1) * 255); }
function ieDefinirCor(c, alvo = IE.corAlvo) { IE.cor[alvo] = c; ieUiCores(); }
// modos: 'cubo' (quadrado de saturação/brilho + faixa de matiz, o padrão do Photoshop), 'rgb', 'hsb'
IE.corMatiz = 0;
ieJanRegistrar('cor', 'Cor', ['cor'], corpo => {
    const modo = iePref('corModo', 'cubo'), cor = IE.cor[IE.corAlvo];
    const [r, g, b] = ieHexRgb(cor), [h, s, v] = ieHsv(cor);
    if (s > 0 && v > 0) IE.corMatiz = h;
    const H = IE.corMatiz;
    const chips = `<div class="ie-pn-duas"><button class="ie-pn-c ${IE.corAlvo ? '' : 'on'}" data-alvo="0" style="background:${IE.cor[0]}" title="${ieJanH('Cor de frente')}"></button>
        <button class="ie-pn-c f ${IE.corAlvo ? 'on' : ''}" data-alvo="1" style="background:${IE.cor[1]}" title="${ieJanH('Cor de fundo')}"></button></div>`;
    const seletor = `<select data-modo class="ie-pn-cmodo" title="${ieJanH('Modo do painel')}">${[['cubo', 'Cubo de cores'], ['rgb', 'Controles RGB'], ['hsb', 'Controles HSB']].map(([k, n]) => `<option value="${k}" ${modo === k ? 'selected' : ''}>${ieJanH(n)}</option>`).join('')}</select>`;
    if (modo === 'cubo') {
        corpo.innerHTML = `<div class="ie-pn-cubo">${chips}<div class="ie-pn-sv"><canvas width="256" height="256"></canvas><i></i></div><div class="ie-pn-mt"><canvas width="16" height="256"></canvas><i></i></div></div>
            <div class="ie-pn-linha"><b>#</b><input type="text" data-hex value="${cor.slice(1)}" maxlength="6" style="width:70px">${seletor}</div>`;
        const sv = corpo.querySelector('.ie-pn-sv canvas'), sx = ieCtx(sv);
        sx.fillStyle = ieDeHsv(H, 100, 100); sx.fillRect(0, 0, 256, 256);
        let gr = sx.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 256, 256);
        gr = sx.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); sx.fillStyle = gr; sx.fillRect(0, 0, 256, 256);
        const mk = corpo.querySelector('.ie-pn-sv i');
        Object.assign(mk.style, { left: s + '%', top: (100 - v) + '%' });
        const mt = corpo.querySelector('.ie-pn-mt canvas'), mx = ieCtx(mt);
        gr = mx.createLinearGradient(0, 0, 0, 256);
        for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, ieDeHsv(360 - k * 60, 100, 100));
        mx.fillStyle = gr; mx.fillRect(0, 0, 16, 256);
        corpo.querySelector('.ie-pn-mt i').style.top = (100 - H / 3.6) + '%';
        const arrastar = (el, f) => el.addEventListener('pointerdown', e => {
            el.setPointerCapture(e.pointerId);
            const mover = ev => { const rc = el.getBoundingClientRect(); f(ieClamp((ev.clientX - rc.left) / rc.width, 0, 1), ieClamp((ev.clientY - rc.top) / rc.height, 0, 1)); };
            mover(e); el.onpointermove = mover; el.onpointerup = () => { el.onpointermove = null; };
        });
        arrastar(sv.parentNode, (x, y) => ieDefinirCor(ieDeHsv(IE.corMatiz, x * 100, (1 - y) * 100)));
        arrastar(mt.parentNode, (x, y) => { IE.corMatiz = Math.round((1 - y) * 360) % 360; const [, s2, v2] = ieHsv(IE.cor[IE.corAlvo]); ieDefinirCor(ieDeHsv(IE.corMatiz, s2 || 100, v2 || 100)); });
    } else {
        const faixas = modo === 'hsb' ? [['H', h, 360, 'linear-gradient(90deg,red,yellow,lime,cyan,blue,magenta,red)'], ['S', s, 100, `linear-gradient(90deg,${ieDeHsv(h, 0, v)},${ieDeHsv(h, 100, v)})`], ['B', v, 100, `linear-gradient(90deg,#000,${ieDeHsv(h, s, 100)})`]]
            : [['R', r, 255, `linear-gradient(90deg,${ieRgbHex(0, g, b)},${ieRgbHex(255, g, b)})`], ['G', g, 255, `linear-gradient(90deg,${ieRgbHex(r, 0, b)},${ieRgbHex(r, 255, b)})`], ['B', b, 255, `linear-gradient(90deg,${ieRgbHex(r, g, 0)},${ieRgbHex(r, g, 255)})`]];
        corpo.innerHTML = `<div class="ie-pn-cor">${chips}
            <div class="ie-pn-fx">${faixas.map(([n, val, max, fundo]) => `<label><b>${n}</b><input type="range" data-c="${n}" min="0" max="${max}" value="${val}" style="background:${fundo}"><input type="number" data-cn="${n}" min="0" max="${max}" value="${val}"></label>`).join('')}
            <label><b>#</b><input type="text" data-hex value="${cor.slice(1)}" maxlength="6">${seletor}</label></div></div>
            <canvas class="ie-pn-espectro" width="520" height="56"></canvas>`;
        const ler = () => {
            const val = n => +corpo.querySelector(`[data-cn="${n}"]`).value;
            return modo === 'hsb' ? ieDeHsv(val('H'), val('S'), val('B')) : ieRgbHex(val('R'), val('G'), val('B'));
        };
        corpo.querySelectorAll('[data-c]').forEach(el => el.addEventListener('input', () => { corpo.querySelector(`[data-cn="${el.dataset.c}"]`).value = el.value; ieDefinirCor(ler()); }));
        corpo.querySelectorAll('[data-cn]').forEach(el => el.addEventListener('change', () => ieDefinirCor(ler())));
        const cv = corpo.querySelector('.ie-pn-espectro'), x = ieCtx(cv);
        const gh = x.createLinearGradient(0, 0, cv.width, 0);
        for (let k = 0; k <= 6; k++) gh.addColorStop(k / 6, ieDeHsv(k * 60, 100, 100));
        x.fillStyle = gh; x.fillRect(0, 0, cv.width, cv.height);
        const gv = x.createLinearGradient(0, 0, 0, cv.height); gv.addColorStop(0, 'rgba(255,255,255,1)'); gv.addColorStop(0.5, 'rgba(255,255,255,0)'); gv.addColorStop(0.5, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,1)');
        x.fillStyle = gv; x.fillRect(0, 0, cv.width, cv.height);
        const pegar = e => { const rc = cv.getBoundingClientRect(), d = x.getImageData(Math.floor(ieClamp((e.clientX - rc.left) / rc.width, 0, 0.999) * cv.width), Math.floor(ieClamp((e.clientY - rc.top) / rc.height, 0, 0.999) * cv.height), 1, 1).data; ieDefinirCor(ieRgbHex(d[0], d[1], d[2])); };
        cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pegar(e); cv.onpointermove = pegar; cv.onpointerup = () => { cv.onpointermove = null; }; });
    }
    corpo.querySelector('[data-hex]').addEventListener('change', ev => { const v2 = ev.target.value.replace('#', ''); if (/^[0-9a-f]{6}$/i.test(v2)) ieDefinirCor('#' + v2.toLowerCase()); });
    corpo.querySelector('[data-modo]').addEventListener('change', ev => { iePrefGravar('corModo', ev.target.value); ieJanAtualizar('cor'); });
    corpo.querySelectorAll('[data-alvo]').forEach(el => {
        el.addEventListener('click', () => { IE.corAlvo = +el.dataset.alvo; ieJanAtualizar('cor'); });
        el.addEventListener('dblclick', () => ieSeletorCor(el, IE.cor[+el.dataset.alvo], c => ieDefinirCor(c, +el.dataset.alvo)));
    });
    corpo.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
});

// ─────────────────────────── Amostras (com grupos, como no Photoshop) ───────────────────────────
// iePref('amostrasLista') = [{g: nome, fechado?, cores: [{c, n}]} | {c, n}]; na 1ª vez vêm do Photoshop instalado
// (Swatches.psp, com os grupos de cada cliente) ou, sem Photoshop, as básicas. Cores recentes: iePref('coresRecentes').
const IE_AMOSTRAS = ['#000000', '#ffffff', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#404040', '#808080', '#c0c0c0',
    '#ed1c24', '#f26522', '#f7941d', '#fff200', '#8dc63f', '#39b54a', '#00a651', '#00a99d', '#00aeef', '#0072bc', '#0054a6', '#2e3192', '#662d91', '#92278f', '#ec008c', '#ed145b',
    '#9e0b0f', '#a0410d', '#a36209', '#aba000', '#598527', '#1a7b30', '#007236', '#00746b', '#0076a3', '#004b80', '#003471', '#1b1464', '#440e62', '#630460', '#9e005d', '#9e0039',
    '#f5d7b5', '#e8b88a', '#c68642', '#8d5524', '#5c3a1e'];
const ieAmBasicas = () => [{ g: ieT('Básicas'), cores: IE_AMOSTRAS.map(c => ({ c, n: '' })) }];
IE.amSel = null;   // {gi, ci} ou {gi} (grupo)
let ieAmCarregando = false;
async function ieAmostrasImportar(origem, substituir) {
    const r = await window.pywebview?.api?.ie_amostras(origem).catch(() => null);
    if (!r || !r.success) { if (r && !r.cancelled) ieToast(`${ieT('Amostras não importadas')}: ${r.error || ''}`); return false; }
    const lista = substituir ? [] : ieJanLista('amostrasLista');
    if (origem === 'photoshop' || substituir) lista.push(...r.lista);
    else lista.push({ g: r.origem, cores: r.lista.flatMap(x => (x.cores ? x.cores : [x])) });
    iePrefGravar('amostrasLista', lista);
    ieToast(`${ieT('Amostras importadas de')} ${r.origem}`);
    ieJanAtualizar('cor');
    return true;
}
(function () {   // cores recentes: cada cor de frente nova
    const orig = ieUiCores;
    ieUiCores = function (...a) {
        const r = orig.apply(this, a), c = IE.cor[0];
        if (c && c !== IE._ultCor) {
            IE._ultCor = c;
            clearTimeout(IE._recT);
            IE._recT = setTimeout(() => { const l = ieJanLista('coresRecentes'); if (l[0] !== c) iePrefGravar('coresRecentes', [c, ...l.filter(x => x !== c)].slice(0, 14)); }, 600);
        }
        return r;
    };
})();
ieJanRegistrar('amostras', 'Amostras', ['cor'], corpo => {
    let lista = iePref('amostrasLista', null);
    if (!lista) {
        if (!ieAmCarregando) {
            ieAmCarregando = true;
            (async () => {
                const antigas = ieJanLista('amostras');   // as que o usuário criou antes dos grupos
                const ok = await ieAmostrasImportar('photoshop', true);
                if (!ok) iePrefGravar('amostrasLista', ieAmBasicas());
                if (antigas.length) iePrefGravar('amostrasLista', [...antigas.map(c => ({ c, n: '' })), ...ieJanLista('amostrasLista')]);
                ieAmCarregando = false;
                ieJanAtualizar('cor');
            })();
        }
        corpo.innerHTML = `<div class="ie-vazio">${ieJanH('Carregando amostras...')}</div>`;
        return;
    }
    lista = [...lista];
    const q = (corpo._busca || '').trim().toLowerCase(), recentes = ieJanLista('coresRecentes');
    const casa = x => !q || (x.n || '').toLowerCase().includes(q) || x.c.includes(q);
    const sel = IE.amSel;
    const amostra = (x, gi, ci) => casa(x) ? `<button class="ie-am ${sel && sel.gi === gi && sel.ci === ci ? 'sel' : ''}" data-gi="${gi}" ${ci !== undefined ? `data-ci="${ci}"` : ''} style="background:${x.c}" title="${ieEsc(x.n || x.c)}"></button>` : '';
    let h = `<div class="ie-am-busca"><input type="search" data-busca placeholder="${ieJanH('Buscar amostras')}" value="${ieEsc(corpo._busca || '')}"></div>
        <div class="ie-am-rec" title="${ieJanH('Cores usadas recentemente')}">${recentes.map(c => `<button class="ie-am" data-rec="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div><div class="ie-am-lista">`;
    let soltas = [];
    const fecharSoltas = () => { if (soltas.length) { h += `<div class="ie-am-grade">${soltas.join('')}</div>`; soltas = []; } };
    lista.forEach((x, gi) => {
        if (!x.cores) { soltas.push(amostra(x, gi)); return; }
        fecharSoltas();
        const cores = x.cores.map((c, ci) => amostra(c, gi, ci)).join('');
        if (q && !cores && !x.g.toLowerCase().includes(q)) return;
        h += `<div class="ie-am-g ${sel && sel.gi === gi && sel.ci === undefined ? 'sel' : ''}" data-g="${gi}"><span class="ie-am-seta">${x.fechado && !q ? '›' : '⌄'}</span>${ieIco('folder')}<span class="ie-am-nome">${ieEsc(x.g)}</span></div>`;
        if (!x.fechado || q) h += `<div class="ie-am-grade ie-am-dentro">${cores}</div>`;
    });
    fecharSoltas();
    h += `</div><div class="ie-pn-rod ie-am-rod">
        <button class="ie-ico-btn" data-amenu title="${ieJanH('Importar e outras opções')}">≡</button><span class="ie-op-esp"></span>
        <button class="ie-ico-btn" data-novog title="${ieJanH('Criar novo grupo')}">${ieIco('folder')}</button>
        <button class="ie-ico-btn" data-nova title="${ieJanH('Criar nova amostra (cor de frente)')}">${ieIco('plus')}</button>
        <button class="ie-ico-btn" data-exc title="${ieJanH('Excluir amostra ou grupo')}" ${sel ? '' : 'disabled'}>${ieIco('trash')}</button></div>`;
    const rolagem = corpo.querySelector('.ie-am-lista')?.scrollTop || 0;
    corpo.innerHTML = h;
    corpo.querySelector('.ie-am-lista').scrollTop = rolagem;
    const gravar = () => { iePrefGravar('amostrasLista', lista); ieJanAtualizar('cor'); };
    const item = el => { const gi = +el.dataset.gi, ci = el.dataset.ci !== undefined ? +el.dataset.ci : undefined; return ci !== undefined ? lista[gi].cores[ci] : lista[gi]; };
    const busca = corpo.querySelector('[data-busca]');
    busca.addEventListener('input', () => { corpo._busca = busca.value; ieJanAtualizar('cor'); setTimeout(() => { const b = corpo.querySelector('[data-busca]'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }, 70); });
    busca.addEventListener('keydown', e => e.stopPropagation());
    corpo.querySelectorAll('[data-rec]').forEach(b => b.onclick = e => ieDefinirCor(b.dataset.rec, e.ctrlKey || e.altKey ? 1 : 0));
    corpo.querySelectorAll('.ie-am[data-gi]').forEach(b => {
        b.onclick = e => { IE.amSel = { gi: +b.dataset.gi, ci: b.dataset.ci !== undefined ? +b.dataset.ci : undefined }; ieDefinirCor(item(b).c, e.ctrlKey || e.altKey ? 1 : 0); ieJanAtualizar('cor'); };
        b.ondblclick = async () => {
            const x = item(b);
            const v = await ieDialogo({ titulo: 'Nome da amostra', campos: [{ id: 'n', rotulo: 'Nome', tipo: 'texto', valor: x.n || '' }] });
            if (v) { x.n = v.n; gravar(); }
        };
        b.oncontextmenu = e => {
            e.preventDefault();
            IE.amSel = { gi: +b.dataset.gi, ci: b.dataset.ci !== undefined ? +b.dataset.ci : undefined };
            ieMenuContextoItens(e, [['Renomear amostra...', 'am:renomear'], ['Excluir amostra', 'am:excluir']]);
        };
    });
    corpo.querySelectorAll('[data-g]').forEach(gEl => {
        const gi = +gEl.dataset.g;
        gEl.onclick = e => { if (e.target.closest('.ie-am-seta') || IE.amSel?.gi === gi && IE.amSel.ci === undefined) { lista[gi].fechado = !lista[gi].fechado; gravar(); } else { IE.amSel = { gi }; ieJanAtualizar('cor'); } };
        gEl.ondblclick = async () => { const v = await ieDialogo({ titulo: 'Nome do grupo', campos: [{ id: 'n', rotulo: 'Nome', tipo: 'texto', valor: lista[gi].g }] }); if (v && v.n.trim()) { lista[gi].g = v.n.trim(); gravar(); } };
        gEl.oncontextmenu = e => { e.preventDefault(); IE.amSel = { gi }; ieMenuContextoItens(e, [['Renomear grupo...', 'am:renomear'], ['Excluir grupo', 'am:excluir']]); };
    });
    corpo.querySelector('[data-novog]').onclick = async () => {
        const v = await ieDialogo({ titulo: 'Novo grupo de amostras', campos: [{ id: 'n', rotulo: 'Nome', tipo: 'texto', valor: `${ieT('Grupo')} ${lista.filter(x => x.cores).length + 1}` }] });
        if (!v || !v.n.trim()) return;
        lista.unshift({ g: v.n.trim(), cores: [] }); IE.amSel = { gi: 0 }; gravar();
    };
    corpo.querySelector('[data-nova]').onclick = () => {   // dentro do grupo selecionado (ou do grupo da amostra selecionada)
        const s = IE.amSel, nova = { c: IE.cor[0], n: '' };
        if (s && lista[s.gi] && lista[s.gi].cores) { lista[s.gi].cores.push(nova); lista[s.gi].fechado = false; IE.amSel = { gi: s.gi, ci: lista[s.gi].cores.length - 1 }; }
        else { lista.unshift(nova); IE.amSel = { gi: 0 }; }
        gravar();
    };
    corpo.querySelector('[data-exc]').onclick = () => IE_CMDS['am:excluir']();
    corpo.querySelector('[data-amenu]').onclick = e => ieMenuContextoItens(e, [['Importar do Photoshop (adicionar)', 'am:ps'], ['Importar amostras (.aco, .ase)...', 'am:arquivo'], '-',
        ['Substituir pelas do Photoshop', 'am:psSubst'], ['Restaurar amostras básicas', 'am:basicas'], '-', ['Limpar cores recentes', 'am:limparRec']]);
    IE._amLista = lista; IE._amGravar = gravar;
});
Object.assign(IE_CMDS, {
    'am:excluir': () => { const s = IE.amSel, l = IE._amLista; if (!s || !l || !l[s.gi]) return; if (s.ci !== undefined) l[s.gi].cores.splice(s.ci, 1); else l.splice(s.gi, 1); IE.amSel = null; IE._amGravar(); },
    'am:renomear': async () => {
        const s = IE.amSel, l = IE._amLista; if (!s || !l || !l[s.gi]) return;
        const x = s.ci !== undefined ? l[s.gi].cores[s.ci] : l[s.gi], k = x.cores ? 'g' : 'n';
        const v = await ieDialogo({ titulo: x.cores ? 'Nome do grupo' : 'Nome da amostra', campos: [{ id: 'n', rotulo: 'Nome', tipo: 'texto', valor: x[k] || '' }] });
        if (v) { x[k] = v.n; IE._amGravar(); }
    },
    'am:ps': () => ieAmostrasImportar('photoshop', false),
    'am:psSubst': () => ieAmostrasImportar('photoshop', true),
    'am:arquivo': () => ieAmostrasImportar('arquivo', false),
    'am:basicas': () => { iePrefGravar('amostrasLista', ieAmBasicas()); ieJanAtualizar('cor'); },
    'am:limparRec': () => { iePrefGravar('coresRecentes', []); ieJanAtualizar('cor'); },
});

// ─────────────────────────── Informações (F8) ───────────────────────────
ieJanRegistrar('info', 'Informações', ['mouse', 'doc', 'comp'], (corpo, doc) => {
    if (!doc) { corpo.innerHTML = `<div class="ie-vazio">${ieJanH('Nenhum documento')}</div>`; return; }
    const p = IE.mouse, dentro = p && p.x >= 0 && p.y >= 0 && p.x < doc.w && p.y < doc.h;
    let rgb = ['', '', ''], hsb = ['', '', ''], alfa = '';
    if (dentro) { const d = ieCtx(doc.comp).getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data; rgb = [d[0], d[1], d[2]]; hsb = ieHsv(ieRgbHex(d[0], d[1], d[2])); alfa = Math.round(d[3] / 2.55) + '%'; }
    const L = ieAtiva(doc), R = L && ieCaixaCamada(L), s = doc.sel && doc.sel.bbox;
    corpo.innerHTML = `<div class="ie-pn-info">
        <div><b>R</b> ${rgb[0]}<br><b>G</b> ${rgb[1]}<br><b>B</b> ${rgb[2]}<br><b>A</b> ${alfa}</div>
        <div><b>H</b> ${hsb[0]}${dentro ? '°' : ''}<br><b>S</b> ${hsb[1]}${dentro ? '%' : ''}<br><b>B</b> ${hsb[2]}${dentro ? '%' : ''}</div>
        <div><b>X</b> ${dentro ? Math.floor(p.x) : ''}<br><b>Y</b> ${dentro ? Math.floor(p.y) : ''}</div>
        <div><b>L</b> ${s ? s.w : ''}<br><b>A</b> ${s ? s.h : ''}</div></div>
        <div class="ie-prop-nota">${ieJanH('Documento')}: ${doc.w} × ${doc.h} px · ${doc.dpi} ppi · ${Math.round(ieZoomTela(doc) * 100)}%${L ? `<br>${ieJanH('Camada')}: ${ieEsc(L.nome)}${R ? ` · ${Math.round(R.w)} × ${Math.round(R.h)} px` : ''}` : ''}</div>`;
});

// ─────────────────────────── Navegador ───────────────────────────
ieJanRegistrar('navegador', 'Navegador', ['comp', 'vista', 'doc'], (corpo, doc) => {
    if (!doc) { corpo._ok = false; corpo.innerHTML = `<div class="ie-vazio">${ieJanH('Nenhum documento')}</div>`; return; }
    if (!corpo._ok || !corpo.querySelector('canvas')) {
        corpo._ok = true;
        corpo.innerHTML = `<canvas class="ie-pn-nav" width="520" height="300"></canvas><div class="ie-pn-navz"><button class="ie-ico-btn" data-z="-1">−</button><input type="range" min="-460" max="350" data-zr><button class="ie-ico-btn" data-z="1">+</button><input type="number" data-zn style="width:58px">%</div>`;
        const cv = corpo.querySelector('canvas');
        const mover = e => {
            const d = IE.doc, g = cv._geo; if (!d || !g) return;
            const rc = cv.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width * cv.width, y = (e.clientY - rc.top) / rc.height * cv.height;
            const v = ieVistaTam(), px = (x - g.ox) / g.k, py = (y - g.oy) / g.k;
            d.px = Math.round(v.w / 2 - px * d.zoom); d.py = Math.round(v.h / 2 - py * d.zoom);
            ieDesenharVista(); ieDesenharSobre();
        };
        cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); mover(e); cv.onpointermove = mover; cv.onpointerup = () => { cv.onpointermove = null; }; });
        corpo.querySelectorAll('[data-z]').forEach(b => b.onclick = () => ieZoomPasso(+b.dataset.z));
        corpo.querySelector('[data-zr]').addEventListener('input', e => ieZoomReal(Math.pow(10, +e.target.value / 100)));
        corpo.querySelector('[data-zn]').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) ieZoomReal(v / 100); });
        corpo.querySelector('[data-zn]').addEventListener('keydown', e => e.stopPropagation());
    }
    const cv = corpo.querySelector('canvas'), x = ieCtx(cv), W = cv.width, H = cv.height;
    const k = Math.min(W / doc.w, H / doc.h), ox = (W - doc.w * k) / 2, oy = (H - doc.h * k) / 2;
    cv._geo = { k, ox, oy };
    x.fillStyle = '#2a2a2a'; x.fillRect(0, 0, W, H);
    x.fillStyle = ieXadrezPadrao(x); x.fillRect(ox, oy, doc.w * k, doc.h * k);
    x.imageSmoothingQuality = 'high';
    x.drawImage(ieMipmap(doc.comp, doc, k), ox, oy, doc.w * k, doc.h * k);
    const v = ieVistaTam();
    x.strokeStyle = '#ff3b30'; x.lineWidth = 2;
    x.strokeRect(ox + (-doc.px / doc.zoom) * k, oy + (-doc.py / doc.zoom) * k, v.w / doc.zoom * k, v.h / doc.zoom * k);
    const zr = corpo.querySelector('[data-zr]'), zn = corpo.querySelector('[data-zn]'), zt = ieZoomTela(doc);
    if (document.activeElement !== zr) zr.value = Math.round(Math.log10(zt) * 100);
    if (document.activeElement !== zn) zn.value = Math.round(zt * 100);
});

// ─────────────────────────── Histograma ───────────────────────────
ieJanRegistrar('histograma', 'Histograma', ['comp', 'doc'], (corpo, doc) => {
    if (!doc) { corpo.innerHTML = `<div class="ie-vazio">${ieJanH('Nenhum documento')}</div>`; return; }
    const canal = iePref('histCanal', 'rgb'), fonte = iePref('histFonte', 'doc');
    let c = doc.comp, L = ieAtiva(doc);
    if (fonte === 'camada' && L) { const r = ieRasterTudo(L); c = r ? r.c : null; }
    const H = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
    let n = 0;
    if (c) {
        const k = Math.min(1, 600 / Math.max(c.width, c.height)), t = ieCanvas(c.width * k, c.height * k), tx = ieCtx(t);
        tx.drawImage(c, 0, 0, t.width, t.height);
        const d = tx.getImageData(0, 0, t.width, t.height).data;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; n++; H.r[d[i]]++; H.g[d[i + 1]]++; H.b[d[i + 2]]++; H.l[Math.round(IE_LUM(d[i], d[i + 1], d[i + 2]))]++; }
    }
    const usar = canal === 'rgb' ? ['r', 'g', 'b'] : [canal === 'lum' ? 'l' : canal];
    const base = H[usar.length > 1 ? 'l' : usar[0]];
    let soma = 0, soma2 = 0, med = 0, acc = 0;
    for (let v = 0; v < 256; v++) { soma += v * base[v]; soma2 += v * v * base[v]; }
    const media = n ? soma / n : 0, desvio = n ? Math.sqrt(Math.max(0, soma2 / n - media * media)) : 0;
    for (let v = 0; v < 256; v++) { acc += base[v]; if (acc >= n / 2) { med = v; break; } }
    corpo.innerHTML = `<div class="ie-pn-linha"><select data-hc>${[['rgb', 'RGB'], ['lum', 'Luminosidade'], ['r', 'Vermelho'], ['g', 'Verde'], ['b', 'Azul']].map(([a, b]) => `<option value="${a}" ${a === canal ? 'selected' : ''}>${ieJanH(b)}</option>`).join('')}</select>
        <select data-hf><option value="doc" ${fonte === 'doc' ? 'selected' : ''}>${ieJanH('Imagem inteira')}</option><option value="camada" ${fonte === 'camada' ? 'selected' : ''}>${ieJanH('Camada selecionada')}</option></select></div>
        <canvas class="ie-pn-hist" width="512" height="150"></canvas>
        <div class="ie-pn-info"><div><b>${ieJanH('Média')}</b> ${media.toFixed(2)}<br><b>${ieJanH('Desvio')}</b> ${desvio.toFixed(2)}</div><div><b>${ieJanH('Mediana')}</b> ${med}<br><b>${ieJanH('Pixels')}</b> ${n}</div></div>`;
    const cv = corpo.querySelector('canvas'), x = ieCtx(cv);
    x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, 512, 150);
    const max = Math.max(1, ...usar.flatMap(k => Array.from(H[k]).sort((a, b) => b - a).slice(3, 4)));
    x.globalCompositeOperation = usar.length > 1 ? 'lighter' : 'source-over';
    for (const k of usar) {
        x.fillStyle = { r: '#ff3030', g: '#30ff30', b: '#3080ff', l: '#dddddd' }[k];
        for (let v = 0; v < 256; v++) { const hh = Math.min(150, H[k][v] / max * 140); x.fillRect(v * 2, 150 - hh, 2, hh); }
    }
    corpo.querySelector('[data-hc]').onchange = e => { iePrefGravar('histCanal', e.target.value); ieJanAtualizar('doc'); };
    corpo.querySelector('[data-hf]').onchange = e => { iePrefGravar('histFonte', e.target.value); ieJanAtualizar('doc'); };
});

// ─────────────────────────── Caractere e Parágrafo ───────────────────────────
const ieJanTexto = doc => { const L = doc && ieAtiva(doc); return L && L.tipo === 'texto' ? L : null; };
const ieJanTxt = doc => { const L = ieJanTexto(doc); if (L && !L.txt && L.texto && !L._txtPsd && !L._lendoTxt) { L._lendoTxt = true; ieTextoDoPsd(L, true).then(t => { L._lendoTxt = false; L._txtPsd = t; ieJanAtualizar('doc'); }); } return L ? (L.txt || L._txtPsd) : null; };
ieJanRegistrar('caractere', 'Caractere', ['doc', 'ferr'], (corpo, doc) => {
    const L = ieJanTexto(doc), t = ieJanTxt(doc);
    corpo.innerHTML = ieCaractereHtml(t, L && L.texto && L.texto.runs ? L.texto.runs[0] : null);
    ieTextoPropsInstalar(corpo);
});
ieJanRegistrar('paragrafo', 'Parágrafo', ['doc', 'ferr'], (corpo, doc) => {
    const L = ieJanTexto(doc), t = ieJanTxt(doc);
    corpo.innerHTML = ieParagrafoHtml(t, L && L.texto && L.texto.runs ? L.texto.runs[0] : null) +
        `<div class="ie-ls-tit">${ieJanH('Marcadores e numeração')}</div><div class="ie-prop-nota">${ieJanH('Ainda não existe no editor.')}</div>`;
    ieTextoPropsInstalar(corpo);
});

// estilos de caractere e de parágrafo: o que o texto selecionado tem, guardado com um nome
function ieJanEstilosTexto(id, chave, campos, titulo) {
    ieJanRegistrar(id, titulo, ['doc'], (corpo, doc) => {
        const lista = ieJanLista(chave), L = ieJanTexto(doc);
        corpo.innerHTML = `<div class="ie-pn-lista">${lista.map((e, i) => `<div class="ie-pn-item" data-i="${i}" title="${ieJanH('Clique: aplicar · botão direito: excluir')}"><span>${ieEsc(e.nome)}</span><em>${campos.map(k => e.v[k] !== undefined ? ieEsc(String(e.v[k])).slice(0, 14) : '').filter(Boolean).join(' · ')}</em></div>`).join('') || `<div class="ie-vazio">${ieJanH('Nenhum estilo ainda')}</div>`}</div>
            <div class="ie-pn-rod"><button class="ie-btn ie-btn-mini" data-novo ${L ? '' : 'disabled'}>+ ${ieJanH('Novo a partir do texto selecionado')}</button></div>`;
        corpo.querySelectorAll('[data-i]').forEach(it => {
            it.onclick = () => { const e = lista[+it.dataset.i]; ieTextoEstilo({ ...e.v }); };
            it.oncontextmenu = ev => { ev.preventDefault(); lista.splice(+it.dataset.i, 1); iePrefGravar(chave, lista); ieJanAtualizar('doc'); };
        });
        corpo.querySelector('[data-novo]').onclick = async () => {
            const t = L.txt || L._txtPsd || await ieTextoDoPsd(L, true);
            if (!t) return;
            const v = Object.fromEntries(campos.filter(k => t[k] !== undefined).map(k => [k, t[k]]));
            lista.push({ nome: `${ieT(titulo.replace(/s$/, ''))} ${lista.length + 1}`, v });
            iePrefGravar(chave, lista);
            ieJanAtualizar('doc');
        };
    });
}
ieJanEstilosTexto('estilosCar', 'estilosCaractere', ['fam', 'estilo', 'tam', 'cor', 'esp', 'ent', 'kern', 'escH', 'escV', 'desloc', 'caixaAlta', 'versalete', 'pos', 'sublinhado', 'tachado', 'negFalso', 'itaFalso'], 'Estilos de caractere');
ieJanEstilosTexto('estilosPar', 'estilosParagrafo', ['alin', 'recuoEsq', 'recuoDir', 'recuo1', 'espAntes', 'espDepois', 'hifen'], 'Estilos de parágrafo');

// ─────────────────────────── Glifos ───────────────────────────
const IE_GLIFOS_EXTRA = '“”‘’«»–—…•·€£¥¢$%‰™©®°±×÷≈≠≤≥∞√∑πµΩ→←↑↓↔⇒★☆♥♡♦♣♠✓✔✗✕☺☻☀☁☂☎✈✉✂✏❤❝❞¡¿';
ieJanRegistrar('glifos', 'Glifos', ['doc'], (corpo, doc) => {
    const L = ieJanTexto(doc), t = L ? (L.txt || L._txtPsd) : null;
    const fam = t && t.css && IE.fontesOk.has(t.css) ? t.css : (t ? t.gdi || t.fam : IE.op.texto.fam || 'Arial');
    const chars = [];
    for (let c = 33; c < 127; c++) chars.push(String.fromCharCode(c));
    for (let c = 161; c < 384; c++) if (c !== 173) chars.push(String.fromCharCode(c));
    chars.push(...IE_GLIFOS_EXTRA);
    corpo.innerHTML = `<div class="ie-prop-nota">${ieJanH('Fonte')}: ${ieEsc(t ? t.fam : fam)} · ${ieJanH('clique insere no texto em edição')}</div>
        <div class="ie-pn-glifos" style="font-family:'${ieEsc(fam)}'">${chars.map(ch => `<button data-g="${ieEsc(ch)}">${ieEsc(ch)}</button>`).join('')}</div>`;
    corpo.querySelectorAll('[data-g]').forEach(b => b.addEventListener('mousedown', e => {
        e.preventDefault();
        const ta = ieEl('ie-texto-edit');
        if (!IE.edTexto || !ta) { ieToast(ieT('Clique num texto com a ferramenta Texto para inserir')); return; }
        const a = ta.selectionStart, z = ta.selectionEnd;
        ta.value = ta.value.slice(0, a) + b.dataset.g + ta.value.slice(z);
        ta.selectionStart = ta.selectionEnd = a + b.dataset.g.length;
        ta.dispatchEvent(new Event('input'));
        ta.focus();
    }));
});

// ─────────────────────────── Degradês (ferramenta Degradê) ───────────────────────────
function ieGradAmostra(g, t) {
    const lerp = (l, f) => { if (t <= l[0][0]) return f(l[0][1], l[0][1], 0); for (let i = 1; i < l.length; i++) if (t <= l[i][0]) { const k = (t - l[i - 1][0]) / ((l[i][0] - l[i - 1][0]) || 1); return f(l[i - 1][1], l[i][1], k); } return f(l[l.length - 1][1], l[l.length - 1][1], 0); };
    const cores = [...g.cores].sort((a, b) => a[0] - b[0]), ops = [...(g.ops || [[0, 100], [1, 100]])].sort((a, b) => a[0] - b[0]);
    const rgb = lerp(cores, (p, q, k) => { const A = ieHexRgb(p), B = ieHexRgb(q); return A.map((v, i) => Math.round(v + (B[i] - v) * k)); });
    return `rgba(${rgb.join(',')},${lerp(ops, (p, q, k) => p + (q - p) * k) / 100})`;
}
ieJanRegistrar('degrades', 'Degradês', ['ferr'], corpo => {
    const meus = ieJanLista('gradientes'), todos = [...IE_GRADS(), ...meus.map(g => ({ ...g, meu: true }))];
    corpo.innerHTML = `<div class="ie-pn-grade">${todos.map((g, i) => `<button class="ie-pn-gr" data-i="${i}" title="${ieEsc(ieT(g.nome))}${g.meu ? ' — ' + ieT('botão direito: excluir') : ''}"></button>`).join('')}</div>
        <div class="ie-pn-rod"><button class="ie-btn ie-btn-mini" data-ed>${ieJanH('Editar o atual...')}</button><button class="ie-btn ie-btn-mini" data-novo>+ ${ieJanH('Guardar o atual')}</button></div>`;
    corpo.querySelectorAll('[data-i]').forEach(b => {
        const g = todos[+b.dataset.i];
        if (typeof ieLsGradDesenhar === 'function') ieLsGradDesenhar(b, g);
        b.onclick = () => { IE.op.degrade.grad = { cores: g.cores, ops: g.ops, nome: g.nome }; IE.op.degrade.cores = 'personalizado'; ieEscolherFerr('degrade'); };
        b.oncontextmenu = e => { e.preventDefault(); if (!g.meu) return; iePrefGravar('gradientes', meus.filter(x => x.nome !== g.nome)); ieJanAtualizar('ferr'); };
    });
    corpo.querySelector('[data-ed]').onclick = e => { IE.op.degrade.grad = IE.op.degrade.grad || IE_GRADS()[0]; IE.op.degrade.cores = 'personalizado'; ieLsGradEditor(e.target, IE.op.degrade, 'grad', () => {}); };
    corpo.querySelector('[data-novo]').onclick = () => { const g = IE.op.degrade.grad || IE_GRADS()[0]; iePrefGravar('gradientes', [...meus, { nome: `${ieT('Degradê')} ${meus.length + 1}`, cores: g.cores, ops: g.ops }]); ieJanAtualizar('ferr'); };
});
// a ferramenta Degradê usa o degradê escolhido ("Personalizado")
(function () {
    const orig = IE_FERR.degrade.up;
    IE_FERR.degrade.up = function (p, ev, doc) {
        const o = IE.op.degrade;
        if (o.cores !== 'personalizado' || !o.grad) return orig.call(this, p, ev, doc);
        const g = IE.deg; IE.deg = null;
        ieDesenharSobre();
        if (!g || Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) < 1) return;
        const L = ieAtiva(doc), c = ieCanvas(doc.w, doc.h), x = ieCtx(c);
        let grad;
        if (o.tipo === 'radial') grad = x.createRadialGradient(g.a.x, g.a.y, 0, g.a.x, g.a.y, Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y));
        else if (o.tipo === 'refletido') grad = x.createLinearGradient(2 * g.a.x - g.b.x, 2 * g.a.y - g.b.y, g.b.x, g.b.y);
        else grad = x.createLinearGradient(g.a.x, g.a.y, g.b.x, g.b.y);
        for (let i = 0; i <= 32; i++) {
            let t = i / 32;
            const cor = ieGradAmostra(o.grad, o.inverter ? 1 - t : t);
            if (o.tipo === 'refletido') { grad.addColorStop(0.5 + t / 2, cor); grad.addColorStop(0.5 - t / 2, cor); } else grad.addColorStop(t, cor);
        }
        x.fillStyle = grad; x.fillRect(0, 0, doc.w, doc.h);
        iePintarCobertura(doc, L, c, doc.sel ? doc.sel.bbox : ieRDoc(doc), 'Degradê', { opac: o.opac / 100, colorido: true });
    };
})();

// ─────────────────────────── Padrões ───────────────────────────
IE.padroesImg = {};
function iePadroesUsuario() {   // padrões do usuário (imagem guardada nas preferências) viram padrões do editor
    for (const p of ieJanLista('padroes')) {
        const k = 'u:' + p.id;
        if (IE_PADROES[k]) continue;
        IE_PADROES[k] = [p.nome, (x, t) => { const c = IE.padroesImg[k]; if (c) x.drawImage(c, 0, 0, t, t); }];
        const im = new Image();
        im.onload = () => { const c = ieCanvas(im.width, im.height); ieCtx(c).drawImage(im, 0, 0); IE.padroesImg[k] = c; delete iePadraoCache[k]; ieJanAtualizar('ferr'); };
        im.src = p.url;
    }
}
(function () {   // padrão do usuário no tamanho dele (não 64×64)
    const orig = iePadraoCanvas;
    iePadraoCanvas = function (nome) { return (nome && IE.padroesImg[nome]) || orig(nome); };
})();
ieJanRegistrar('padroes', 'Padrões', ['ferr', 'doc'], (corpo, doc) => {
    iePadroesUsuario();
    const atual = IE.op.padrao || 'xadrez';
    corpo.innerHTML = `<div class="ie-ls-padroes">${Object.entries(IE_PADROES).map(([n, [nome]]) => `<button class="ie-ls-padrao ${n === atual ? 'on' : ''}" data-p="${n}" title="${ieEsc(ieT(nome))}${n.startsWith('u:') ? ' — ' + ieT('botão direito: excluir') : ''}"></button>`).join('')}</div>
        <div class="ie-pn-rod"><button class="ie-btn ie-btn-mini" data-definir ${doc ? '' : 'disabled'}>+ ${ieJanH('Definir padrão (seleção ou camada)')}</button></div>
        <div class="ie-prop-nota">${ieJanH('O padrão escolhido vale para Editar > Preencher > Padrão.')}</div>`;
    corpo.querySelectorAll('[data-p]').forEach(b => {
        b.style.backgroundImage = `url(${iePadraoCanvas(b.dataset.p).toDataURL()})`;
        b.onclick = () => { IE.op.padrao = b.dataset.p; ieJanAtualizar('ferr'); };
        b.oncontextmenu = e => { e.preventDefault(); if (!b.dataset.p.startsWith('u:')) return; iePrefGravar('padroes', ieJanLista('padroes').filter(p => 'u:' + p.id !== b.dataset.p)); delete IE_PADROES[b.dataset.p]; ieJanAtualizar('ferr'); };
    });
    corpo.querySelector('[data-definir]').onclick = () => {
        const d = IE.doc, L = ieAtiva(d);
        let R = d.sel ? d.sel.bbox : (L && ieCaixaCamada(L)) || ieRDoc(d);
        R = ieRInter(ieRInt(R), ieRDoc(d));
        if (!R) return;
        ieCompor(d, ieRDoc(d));
        const k = Math.min(1, 256 / Math.max(R.w, R.h)), c = ieCanvas(R.w * k, R.h * k);
        ieCtx(c).drawImage(d.comp, R.x, R.y, R.w, R.h, 0, 0, c.width, c.height);
        const id = Date.now().toString(36);
        iePrefGravar('padroes', [...ieJanLista('padroes'), { id, nome: `${ieT('Padrão')} ${ieJanLista('padroes').length + 1}`, url: c.toDataURL('image/png') }]);
        IE.op.padrao = 'u:' + id;
        iePadroesUsuario();
        ieToast(ieT('Padrão definido'));
    };
});

// ─────────────────────────── Formas (ferramenta Forma personalizada) ───────────────────────────
const IE_FORMAS = {
    estrela: ['Estrela', (x, w, h) => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.4 : 1, a = -Math.PI / 2 + i * Math.PI / 5; x[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * r * w / 2, h / 2 + Math.sin(a) * r * h / 2 * 1.05 + h * 0.03); } x.closePath(); }],
    coracao: ['Coração', (x, w, h) => { x.moveTo(w / 2, h * 0.95); x.bezierCurveTo(-w * 0.15, h * 0.55, w * 0.05, -h * 0.1, w / 2, h * 0.25); x.bezierCurveTo(w * 0.95, -h * 0.1, w * 1.15, h * 0.55, w / 2, h * 0.95); x.closePath(); }],
    seta: ['Seta', (x, w, h) => { x.moveTo(0, h * 0.3); x.lineTo(w * 0.6, h * 0.3); x.lineTo(w * 0.6, 0); x.lineTo(w, h / 2); x.lineTo(w * 0.6, h); x.lineTo(w * 0.6, h * 0.7); x.lineTo(0, h * 0.7); x.closePath(); }],
    balao: ['Balão de fala', (x, w, h) => { const r = Math.min(w, h) * 0.18; x.roundRect(0, 0, w, h * 0.78, r); x.moveTo(w * 0.22, h * 0.76); x.lineTo(w * 0.15, h); x.lineTo(w * 0.42, h * 0.76); }],
    triangulo: ['Triângulo', (x, w, h) => { x.moveTo(w / 2, 0); x.lineTo(w, h); x.lineTo(0, h); x.closePath(); }],
    hexagono: ['Hexágono', (x, w, h) => { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2); } x.closePath(); }],
    losango: ['Losango', (x, w, h) => { x.moveTo(w / 2, 0); x.lineTo(w, h / 2); x.lineTo(w / 2, h); x.lineTo(0, h / 2); x.closePath(); }],
    raio: ['Raio', (x, w, h) => { x.moveTo(w * 0.6, 0); x.lineTo(w * 0.1, h * 0.55); x.lineTo(w * 0.45, h * 0.55); x.lineTo(w * 0.3, h); x.lineTo(w * 0.9, h * 0.4); x.lineTo(w * 0.55, h * 0.4); x.closePath(); }],
    check: ['Visto', (x, w, h) => { x.moveTo(0, h * 0.55); x.lineTo(w * 0.15, h * 0.4); x.lineTo(w * 0.38, h * 0.65); x.lineTo(w * 0.85, 0); x.lineTo(w, h * 0.15); x.lineTo(w * 0.38, h); x.closePath(); }],
    xis: ['X', (x, w, h) => { const t = 0.18; x.moveTo(w * t, 0); x.lineTo(w / 2, h * (0.5 - t)); x.lineTo(w * (1 - t), 0); x.lineTo(w, h * t); x.lineTo(w * (0.5 + t), h / 2); x.lineTo(w, h * (1 - t)); x.lineTo(w * (1 - t), h); x.lineTo(w / 2, h * (0.5 + t)); x.lineTo(w * t, h); x.lineTo(0, h * (1 - t)); x.lineTo(w * (0.5 - t), h / 2); x.lineTo(0, h * t); x.closePath(); }],
    gota: ['Gota', (x, w, h) => { x.moveTo(w / 2, 0); x.bezierCurveTo(w * 0.55, h * 0.3, w, h * 0.5, w, h * 0.7); x.arc(w / 2, h * 0.7, w / 2, 0, Math.PI); x.bezierCurveTo(0, h * 0.5, w * 0.45, h * 0.3, w / 2, 0); }],
    selo: ['Selo', (x, w, h) => { const n = 24; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? 0.86 : 1, a = i * Math.PI / n; x[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * r * w / 2, h / 2 + Math.sin(a) * r * h / 2); } x.closePath(); }],
    nuvem: ['Nuvem', (x, w, h) => { x.moveTo(w * 0.2, h); x.arc(w * 0.2, h * 0.7, h * 0.3, Math.PI / 2, Math.PI * 1.5); x.arc(w * 0.42, h * 0.38, h * 0.32, Math.PI, Math.PI * 1.9); x.arc(w * 0.7, h * 0.45, h * 0.3, Math.PI * 1.2, Math.PI * 2); x.arc(w * 0.82, h * 0.72, h * 0.28, Math.PI * 1.5, Math.PI / 2); x.closePath(); }],
    cruz: ['Cruz', (x, w, h) => { const t = 0.33; x.moveTo(w * t, 0); x.lineTo(w * (1 - t), 0); x.lineTo(w * (1 - t), h * t); x.lineTo(w, h * t); x.lineTo(w, h * (1 - t)); x.lineTo(w * (1 - t), h * (1 - t)); x.lineTo(w * (1 - t), h); x.lineTo(w * t, h); x.lineTo(w * t, h * (1 - t)); x.lineTo(0, h * (1 - t)); x.lineTo(0, h * t); x.lineTo(w * t, h * t); x.closePath(); }],
};
ieJanRegistrar('formas', 'Formas', ['ferr'], corpo => {
    const atual = IE.op.forma.tipo === 'custom' ? IE.op.forma.custom : null;
    corpo.innerHTML = `<div class="ie-pn-formas">${Object.entries(IE_FORMAS).map(([k, [nome]]) => `<button class="${k === atual ? 'on' : ''}" data-f="${k}" title="${ieEsc(ieT(nome))}"><canvas width="44" height="44"></canvas></button>`).join('')}</div>
        <div class="ie-prop-nota">${ieJanH('Clique e arraste na imagem com a ferramenta Forma (U). Shift: proporcional.')}</div>`;
    corpo.querySelectorAll('[data-f]').forEach(b => {
        const x = ieCtx(b.querySelector('canvas'));
        x.fillStyle = '#ddd'; x.translate(6, 6); x.beginPath(); IE_FORMAS[b.dataset.f][1](x, 32, 32); x.fill();
        b.onclick = () => { IE.op.forma.tipo = 'custom'; IE.op.forma.custom = b.dataset.f; ieEscolherFerr('forma'); ieJanAtualizar('ferr'); };
    });
});
(function () {   // ferramenta Forma desenha as personalizadas
    const F = IE_FERR.forma, up = F.up, sobre = F.sobre;
    F.up = function (p, ev, doc) {
        const o = IE.op.forma;
        if (o.tipo !== 'custom' || !IE_FORMAS[o.custom]) return up.call(this, p, ev, doc);
        const a = IE.arr; IE.arr = null;
        if (!a || !a.r || a.r.w < 2 || a.r.h < 2) return;
        const r = a.r, c = ieCanvas(r.w, r.h), x = ieCtx(c);
        x.fillStyle = IE.cor[0]; x.beginPath(); IE_FORMAS[o.custom][1](x, r.w, r.h); x.fill();
        const nome = ieT(IE_FORMAS[o.custom][0]);
        const L = ieNovaCamada(doc, { nome: ieNomeLivre(doc, nome), c, x: r.x, y: r.y, sujoPx: true });
        ieInserirAcima(doc, L, ieAtiva(doc));
        ieCamadaMudou(L); ieHist(nome); ieUiCamadas();
    };
    F.sobre = function (ctx, doc) {
        const o = IE.op.forma, a = IE.arr;
        if (o.tipo !== 'custom' || !a || !a.r) return sobre.call(this, ctx, doc);
        const s = ieDocTela(a.r.x, a.r.y, doc);
        ctx.save(); ctx.strokeStyle = '#4aa3ff'; ctx.translate(s.x, s.y); ctx.beginPath(); IE_FORMAS[o.custom][1](ctx, a.r.w * doc.zoom, a.r.h * doc.zoom); ctx.stroke(); ctx.restore();
    };
})();

// ─────────────────────────── Estilos (estilos de camada prontos e do usuário) ───────────────────────────
ieJanRegistrar('estilos', 'Estilos', ['doc'], (corpo, doc) => {
    const lista = ieLsEstilosLista();
    corpo.innerHTML = `<div class="ie-pn-estilos">${lista.map((e, i) => `<button data-e="${i}" title="${ieEsc(e.nome)}${e.pronto ? '' : ' — ' + ieT('botão direito: excluir')}"><canvas width="56" height="56"></canvas></button>`).join('')}</div>
        <div class="ie-pn-rod"><button class="ie-btn ie-btn-mini" data-limpar>${ieJanH('Limpar estilo')}</button><button class="ie-btn ie-btn-mini" data-novo ${doc && ieAtiva(doc) ? '' : 'disabled'}>+ ${ieJanH('Novo da camada')}</button></div>`;
    corpo.querySelectorAll('[data-e]').forEach(b => {
        const e = lista[+b.dataset.e];
        ieLsRenderAmostra(b.querySelector('canvas'), ieFxNorm(ieClone(e.fx)), { op: 1, fill: (e.mescla && e.mescla.fill) ?? 1 });
        b.onclick = () => { const d = IE.doc; if (!d) return; IE.estiloCopiado = { fx: ieClone(e.fx), mescla: ieClone(e.mescla || {}) }; IE_CMDS.colarEstilo(d); };
        b.oncontextmenu = ev => { ev.preventDefault(); if (e.pronto) return; iePrefGravar('estilos', (iePref('estilos', []) || []).filter(x => x.nome !== e.nome)); ieJanAtualizar('doc'); };
    });
    corpo.querySelector('[data-limpar]').onclick = () => IE.doc && IE_CMDS.limparEstilo(IE.doc);
    corpo.querySelector('[data-novo]').onclick = () => {
        const L = ieAtiva(IE.doc); if (!L) return;
        const meus = iePref('estilos', []) || [];
        iePrefGravar('estilos', [...meus, { nome: `${L.nome} ${meus.length + 1}`, fx: ieClone(ieFxNorm(L.fx)) || {}, mescla: { fill: L.fill } }]);
        ieJanAtualizar('doc');
    };
});

// ─────────────────────────── Pincéis e Configurações do pincel (F5) ───────────────────────────
const IE_PINCEIS = [
    { nome: 'Redondo duro', o: { tam: 20, dureza: 100, forma: 'redondo', espaco: 18, angulo: 0, redondeza: 100, varTam: 0, varAng: 0, dispersao: 0, fluxo: 100 } },
    { nome: 'Redondo suave', o: { tam: 40, dureza: 0, forma: 'redondo', espaco: 18, angulo: 0, redondeza: 100, varTam: 0, varAng: 0, dispersao: 0, fluxo: 100 } },
    { nome: 'Aerógrafo suave', o: { tam: 80, dureza: 0, forma: 'redondo', espaco: 10, angulo: 0, redondeza: 100, varTam: 0, varAng: 0, dispersao: 0, fluxo: 12 } },
    { nome: 'Caligrafia', o: { tam: 24, dureza: 100, forma: 'redondo', espaco: 5, angulo: 45, redondeza: 25, varTam: 0, varAng: 0, dispersao: 0, fluxo: 100 } },
    { nome: 'Giz', o: { tam: 30, dureza: 90, forma: 'giz', espaco: 20, angulo: 0, redondeza: 100, varTam: 15, varAng: 100, dispersao: 0, fluxo: 100 } },
    { nome: 'Spray', o: { tam: 12, dureza: 60, forma: 'redondo', espaco: 35, angulo: 0, redondeza: 100, varTam: 60, varAng: 0, dispersao: 250, fluxo: 80 } },
    { nome: 'Quadrado', o: { tam: 20, dureza: 100, forma: 'quadrado', espaco: 15, angulo: 0, redondeza: 100, varTam: 0, varAng: 0, dispersao: 0, fluxo: 100 } },
    { nome: 'Marcador', o: { tam: 16, dureza: 90, forma: 'redondo', espaco: 8, angulo: 30, redondeza: 60, varTam: 0, varAng: 0, dispersao: 0, fluxo: 70 } },
];
const ieJanPincelAlvo = () => (IE.ferr === 'borracha' ? 'borracha' : IE.ferr === 'carimbo' ? 'carimbo' : 'pincel');
function ieJanTracoAmostra(cv, o) {
    const x = ieCtx(cv), W = cv.width, H = cv.height;
    x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, W, H);
    const tam = Math.min(o.tam, H * 0.7), passo = Math.max(1, tam * (o.espaco ?? 18) / 100);
    x.globalAlpha = (o.fluxo ?? 100) / 100;
    for (let t = tam; t < W - tam; t += passo) {
        let s = tam, a = o.angulo || 0, px = t, py = H / 2 + Math.sin(t / W * Math.PI * 2) * H * 0.18;
        if (o.varTam) s *= 1 - Math.random() * o.varTam / 100;
        if (o.varAng) a += (Math.random() * 2 - 1) * o.varAng / 100 * 180;
        if (o.dispersao) { const d = Math.random() * o.dispersao / 100 * tam, q = Math.random() * 6.283; px += Math.cos(q) * d; py += Math.sin(q) * d; }
        const p = iePonta(s, o.dureza, o.forma, a, o.redondeza ?? 100);
        x.drawImage(p, px - p.width / 2, py - p.height / 2);
    }
    x.globalAlpha = 1;
}
ieJanRegistrar('pinceis', 'Pincéis', ['ferr'], corpo => {
    const meus = ieJanLista('pinceis'), todos = [...IE_PINCEIS, ...meus.map(p => ({ ...p, meu: true }))];
    corpo.innerHTML = `<div class="ie-pn-pinceis">${todos.map((p, i) => `<button data-i="${i}" title="${ieEsc(ieT(p.nome))}${p.meu ? ' — ' + ieT('botão direito: excluir') : ''}"><canvas width="220" height="40"></canvas><span>${ieEsc(ieT(p.nome))} · ${p.o.tam}</span></button>`).join('')}</div>
        <div class="ie-pn-rod"><button class="ie-btn ie-btn-mini" data-novo>+ ${ieJanH('Novo pincel com as opções atuais')}</button></div>`;
    corpo.querySelectorAll('[data-i]').forEach(b => {
        const p = todos[+b.dataset.i];
        ieJanTracoAmostra(b.querySelector('canvas'), p.o);
        b.onclick = () => { const alvo = ieJanPincelAlvo(); Object.assign(IE.op[alvo], ieClone(p.o)); if (!['pincel', 'borracha', 'carimbo'].includes(IE.ferr)) ieEscolherFerr('pincel'); else ieOpcoesRender(); };
        b.oncontextmenu = e => { e.preventDefault(); if (!p.meu) return; iePrefGravar('pinceis', meus.filter(x => x.nome !== p.nome)); ieJanAtualizar('ferr'); };
    });
    corpo.querySelector('[data-novo]').onclick = () => { const o = ieClone(IE.op[ieJanPincelAlvo()]); delete o.opac; iePrefGravar('pinceis', [...meus, { nome: `${ieT('Pincel')} ${meus.length + 1}`, o }]); ieJanAtualizar('ferr'); };
});
ieJanRegistrar('configPincel', 'Configurações do pincel', ['ferr'], corpo => {
    const alvo = ieJanPincelAlvo(), o = IE.op[alvo];
    const f = (k, r, min, max, un) => `<label class="ie-ls-faixa ie-pn-f"><span>${ieJanH(r)}</span><input type="range" data-k="${k}" min="${min}" max="${max}" value="${o[k] ?? 0}"><input type="number" data-n="${k}" min="${min}" max="${max}" value="${o[k] ?? 0}"><em>${un}</em></label>`;
    corpo.innerHTML = `<div class="ie-prop-nota">${ieJanH('Vale para')}: ${ieJanH(IE_FERR[alvo].nome)}</div>
        <div class="ie-pn-linha"><span>${ieJanH('Forma da ponta')}</span><div class="ie-segm">${[['redondo', 'Redonda'], ['quadrado', 'Quadrada'], ['giz', 'Giz']].map(([a, r]) => `<button data-forma="${a}" class="${(o.forma || 'redondo') === a ? 'on' : ''}">${ieJanH(r)}</button>`).join('')}</div></div>
        ${f('tam', 'Tamanho', 1, 1000, 'px')}${f('dureza', 'Dureza', 0, 100, '%')}${f('espaco', 'Espaçamento', 1, 300, '%')}${f('angulo', 'Ângulo', -180, 180, '°')}${f('redondeza', 'Redondeza', 5, 100, '%')}
        <div class="ie-ls-tit">${ieJanH('Dinâmica da forma')}</div>${f('varTam', 'Variação de tamanho', 0, 100, '%')}${f('varAng', 'Variação de ângulo', 0, 100, '%')}
        <div class="ie-ls-tit">${ieJanH('Dispersão')}</div>${f('dispersao', 'Dispersão', 0, 500, '%')}
        <canvas class="ie-pn-amostra-traco" width="520" height="70"></canvas>`;
    const am = () => ieJanTracoAmostra(corpo.querySelector('canvas'), o);
    corpo.querySelectorAll('input[data-k]').forEach(el => el.addEventListener('input', () => { o[el.dataset.k] = +el.value; corpo.querySelector(`[data-n="${el.dataset.k}"]`).value = el.value; am(); }));
    corpo.querySelectorAll('input[data-n]').forEach(el => { el.addEventListener('change', () => { o[el.dataset.n] = +el.value; corpo.querySelector(`[data-k="${el.dataset.n}"]`).value = el.value; am(); }); el.addEventListener('keydown', e => e.stopPropagation()); });
    corpo.querySelectorAll('[data-forma]').forEach(b => b.onclick = () => { o.forma = b.dataset.forma; ieJanAtualizar('ferr'); });
    am();
});

// ─────────────────────────── Predefinições de ferramentas ───────────────────────────
ieJanRegistrar('predef', 'Predefinições de ferramentas', ['ferr'], corpo => {
    const todos = ieJanLista('predefFerr'), soAtual = iePref('predefSoAtual', true);
    const lista = todos.map((p, i) => ({ ...p, i })).filter(p => !soAtual || p.ferr === IE.ferr);
    corpo.innerHTML = `<div class="ie-pn-lista">${lista.map(p => `<div class="ie-pn-item" data-i="${p.i}" title="${ieJanH('Clique: usar · botão direito: excluir')}"><span>${ieEsc(p.nome)}</span><em>${ieEsc(ieT(IE_FERR[p.ferr]?.nome || p.ferr))}</em></div>`).join('') || `<div class="ie-vazio">${ieJanH('Nenhuma predefinição')}</div>`}</div>
        <div class="ie-pn-rod"><label class="ie-ls-chk"><input type="checkbox" data-so ${soAtual ? 'checked' : ''}> ${ieJanH('Só da ferramenta atual')}</label><button class="ie-btn ie-btn-mini" data-novo>+ ${ieJanH('Nova')}</button></div>`;
    corpo.querySelectorAll('[data-i]').forEach(it => {
        const p = todos[+it.dataset.i];
        it.onclick = () => { ieEscolherFerr(p.ferr); Object.assign(IE.op[p.ferr], ieClone(p.op)); ieOpcoesRender(); };
        it.oncontextmenu = e => { e.preventDefault(); todos.splice(+it.dataset.i, 1); iePrefGravar('predefFerr', todos); ieJanAtualizar('ferr'); };
    });
    corpo.querySelector('[data-so]').onchange = e => { iePrefGravar('predefSoAtual', e.target.checked); ieJanAtualizar('ferr'); };
    corpo.querySelector('[data-novo]').onclick = () => { iePrefGravar('predefFerr', [...todos, { nome: `${ieT(IE_FERR[IE.ferr].nome)} ${todos.filter(p => p.ferr === IE.ferr).length + 1}`, ferr: IE.ferr, op: ieClone(IE.op[IE.ferr]) }]); ieJanAtualizar('ferr'); };
});

// ─────────────────────────── Composições de camadas ───────────────────────────
function ieJanCompCaptura(doc) {
    const e = {};
    iePercorrer(doc.camadas, L => { const R = ieCaixaCamada(L); e[L.uid] = { visivel: L.visivel, op: L.op, bm: L.bm, fxOculto: !!L.fxOculto, x: R ? R.x : null, y: R ? R.y : null }; });
    return e;
}
function ieJanCompAplicar(doc, c) {
    iePercorrer(doc.camadas, L => {
        const s = c.estados[L.uid];
        if (!s) return;
        L.visivel = s.visivel; L.op = s.op; L.bm = s.bm; L.fxOculto = s.fxOculto;
        const R = ieCaixaCamada(L);
        if (R && s.x != null && L.tipo !== 'grupo' && (R.x !== s.x || R.y !== s.y)) { ieMoverCamada(L, s.x - R.x, s.y - R.y); L.movido = true; }
    });
    doc.compAtual = c.id;
    ieTudo(doc);
    ieHist(`${ieT('Composição de camadas')}: ${c.nome}`);
}
ieJanRegistrar('comps', 'Composições de camadas', ['doc'], (corpo, doc) => {
    if (!doc) { corpo.innerHTML = `<div class="ie-vazio">${ieJanH('Nenhum documento')}</div>`; return; }
    const lista = doc.compsCamadas || (doc.compsCamadas = []);
    corpo.innerHTML = `<div class="ie-pn-lista">${lista.map((c, i) => `<div class="ie-pn-item ${doc.compAtual === c.id ? 'sel' : ''}" data-i="${i}"><b>${doc.compAtual === c.id ? '▸' : ''}</b><span>${ieEsc(c.nome)}</span></div>`).join('') || `<div class="ie-vazio">${ieJanH('Guarde como as camadas estão (visíveis, posição e aparência) para voltar depois')}</div>`}</div>
        <div class="ie-pn-rod"><button class="ie-ico-btn" data-ant title="${ieJanH('Anterior')}">◀</button><button class="ie-ico-btn" data-prox title="${ieJanH('Próxima')}">▶</button>
        <button class="ie-btn ie-btn-mini" data-atu ${doc.compAtual ? '' : 'disabled'}>${ieJanH('Atualizar')}</button><button class="ie-btn ie-btn-mini" data-novo>+ ${ieJanH('Nova')}</button>
        <button class="ie-ico-btn" data-exc ${doc.compAtual ? '' : 'disabled'} title="${ieJanH('Excluir')}">${ieIco('trash')}</button></div>`;
    const atual = () => lista.findIndex(c => c.id === doc.compAtual);
    corpo.querySelectorAll('[data-i]').forEach(it => it.onclick = () => ieJanCompAplicar(doc, lista[+it.dataset.i]));
    corpo.querySelector('[data-novo]').onclick = () => { const c = { id: Date.now(), nome: `${ieT('Composição')} ${lista.length + 1}`, estados: ieJanCompCaptura(doc) }; lista.push(c); doc.compAtual = c.id; ieJanAtualizar('doc'); };
    corpo.querySelector('[data-atu]').onclick = () => { const i = atual(); if (i >= 0) { lista[i].estados = ieJanCompCaptura(doc); ieToast(ieT('Composição atualizada')); } };
    corpo.querySelector('[data-exc]').onclick = () => { const i = atual(); if (i >= 0) { lista.splice(i, 1); doc.compAtual = null; ieJanAtualizar('doc'); } };
    corpo.querySelector('[data-ant]').onclick = () => { if (lista.length) ieJanCompAplicar(doc, lista[(atual() - 1 + lista.length) % lista.length]); };
    corpo.querySelector('[data-prox]').onclick = () => { if (lista.length) ieJanCompAplicar(doc, lista[(atual() + 1) % lista.length]); };
});

// ─────────────────────────── Canais ───────────────────────────
function ieJanCanalCinza(doc, ch) {   // canal R/G/B em tons de cinza (como o Photoshop mostra)
    const k = `${ch}:${doc._compV}`;
    if (doc._canalVista && doc._canalVista.k === k) return doc._canalVista.c;
    const c = ieClonar(doc.comp), x = ieCtx(c), img = x.getImageData(0, 0, c.width, c.height), d = img.data, q = { r: 0, g: 1, b: 2 }[ch];
    for (let i = 0; i < d.length; i += 4) { const v = d[i + q]; d[i] = d[i + 1] = d[i + 2] = v; }
    x.putImageData(img, 0, 0);
    doc._canalVista = { k, c };
    return c;
}
function ieSelSalvarCanal(doc, nome) {
    if (!doc.sel) { ieToast(ieT('Faça uma seleção antes')); return; }
    (doc.alfas || (doc.alfas = [])).push({ id: Date.now(), nome: nome || `Alfa ${doc.alfas.length + 1}`, c: ieClonar(doc.sel.c) });
    ieHist(ieT('Salvar seleção'));
    ieJanAtualizar('doc');
}
function ieSelCarregarCanal(doc, a, op = 'nova') {
    const c = ieCanvas(doc.w, doc.h);
    ieCtx(c).drawImage(a.c, 0, 0);
    if (op === 'nova' || !doc.sel) ieSelDefinir(doc, c);
    else ieSelAplicar(doc, x => x.drawImage(a.c, 0, 0), op);
    ieHist(ieT('Carregar seleção'));
}
function ieSelCanalCor(doc, ch) {   // Ctrl+clique no canal: seleção pela luz do canal
    ieCompor(doc, ieRDoc(doc));
    const c = ieClonar(doc.comp), x = ieCtx(c), img = x.getImageData(0, 0, c.width, c.height), d = img.data, q = { r: 0, g: 1, b: 2 }[ch];
    for (let i = 0; i < d.length; i += 4) { const v = q === undefined ? IE_LUM(d[i], d[i + 1], d[i + 2]) : d[i + q]; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = v * d[i + 3] / 255; }
    x.putImageData(img, 0, 0);
    ieSelDefinir(doc, c);
    ieHist(ieT('Carregar seleção'));
}
ieJanRegistrar('canais', 'Canais', ['doc', 'comp'], (corpo, doc) => {
    if (!doc) { corpo.innerHTML = `<div class="ie-vazio">${ieJanH('Nenhum documento')}</div>`; return; }
    const v = doc.verCanal || 'rgb', alfas = doc.alfas || [];
    const linha = (id, nome, atalho, alfa) => `<div class="ie-pn-canal ${v === id || (!alfa && v === 'rgb' && id !== 'rgb') ? 'sel' : ''}" data-canal="${id}"><button class="ie-cam-olho on" tabindex="-1">${(v === 'rgb' || v === id) && !alfa ? ieIco('eye') : ''}</button><canvas width="48" height="36"></canvas><span>${ieEsc(ieT(nome))}</span><kbd>${atalho}</kbd></div>`;
    corpo.innerHTML = `<div class="ie-pn-canais">${linha('rgb', 'RGB', 'Ctrl+2')}${linha('r', 'Vermelho', 'Ctrl+3')}${linha('g', 'Verde', 'Ctrl+4')}${linha('b', 'Azul', 'Ctrl+5')}
        ${alfas.map((a, i) => linha('a' + i, a.nome, '', true)).join('')}</div>
        <div class="ie-pn-rod"><button class="ie-btn ie-btn-mini" data-salvar ${doc.sel ? '' : 'disabled'}>${ieJanH('Salvar seleção como canal')}</button>
        <button class="ie-ico-btn" data-exc title="${ieJanH('Excluir canal alfa')}" ${String(v).startsWith('a') ? '' : 'disabled'}>${ieIco('trash')}</button></div>
        <div class="ie-prop-nota">${ieJanH('Clique: ver o canal · Ctrl+clique: carregar como seleção')}</div>`;
    const k = Math.min(48 / doc.w, 36 / doc.h);
    corpo.querySelectorAll('[data-canal]').forEach(el => {
        const id = el.dataset.canal, cv = el.querySelector('canvas'), x = ieCtx(cv);
        x.fillStyle = '#000'; x.fillRect(0, 0, 48, 36);
        const fonte = id === 'rgb' ? doc.comp : id.startsWith('a') ? ieAlfaParaCinza(alfas[+id.slice(1)].c) : ieJanCanalCinza(doc, id);
        x.drawImage(ieMipmap(fonte, doc, k), (48 - doc.w * k) / 2, (36 - doc.h * k) / 2, doc.w * k, doc.h * k);
        el.onclick = e => {
            if (e.ctrlKey) { if (id.startsWith('a')) ieSelCarregarCanal(doc, alfas[+id.slice(1)], e.shiftKey ? 'somar' : e.altKey ? 'subtrair' : 'nova'); else ieSelCanalCor(doc, id); return; }
            doc.verCanal = id === 'rgb' ? null : id;
            ieDesenharVista(); ieJanAtualizar('doc');
        };
    });
    corpo.querySelector('[data-salvar]').onclick = () => ieSelSalvarCanal(doc);
    corpo.querySelector('[data-exc]').onclick = () => { if (String(v).startsWith('a')) { alfas.splice(+v.slice(1), 1); doc.verCanal = null; ieDesenharVista(); ieJanAtualizar('doc'); } };
});
(function () {   // ver um canal (cinza) ou um canal alfa (como máscara rubi) na tela
    const orig = ieDesenharVista;
    ieDesenharVista = function () {
        orig();
        const doc = IE.doc, c = ieEl('ie-canvas');
        if (!doc || !c || !doc.verCanal || !ieAtivoVisivel()) return;
        const ctx = ieCtx(c), dpr = ieDpr();
        let fonte;
        if (String(doc.verCanal).startsWith('a')) {
            const a = (doc.alfas || [])[+doc.verCanal.slice(1)];
            if (!a) { doc.verCanal = null; return; }
            fonte = ieCanvas(doc.w, doc.h); const x = ieCtx(fonte);
            x.fillStyle = 'rgba(255,0,0,.5)'; x.fillRect(0, 0, doc.w, doc.h); x.globalCompositeOperation = 'destination-out'; x.drawImage(a.c, 0, 0);
        } else fonte = ieJanCanalCinza(doc, doc.verCanal);
        ieDesenharNitido(ctx, fonte, doc, dpr);
    };
})();
Object.assign(IE_ATALHOS, { 'Ctrl+3': 'canal:r', 'Ctrl+4': 'canal:g', 'Ctrl+5': 'canal:b' });
for (const ch of ['r', 'g', 'b']) IE_CMDS['canal:' + ch] = doc => { doc.verCanal = ch; ieDesenharVista(); ieJanAtualizar('doc'); };
{   // Ctrl+2 também volta a ver todos os canais
    const a = IE_CMDS.alvoCamada;
    IE_CMDS.alvoCamada = doc => { if (doc.verCanal) { doc.verCanal = null; ieDesenharVista(); ieJanAtualizar('doc'); } a(doc); };
}

// ─────────────────────────── Origem do clone ───────────────────────────
ieJanRegistrar('clone', 'Origem do clone', ['ferr', 'mouse'], corpo => {
    const f = IE.carimboFonte, off = IE.carimboOff, o = IE.op.carimbo;
    corpo.innerHTML = `<div class="ie-pn-info"><div><b>${ieJanH('Origem')}</b><br>X ${f ? Math.round(f.x) : '—'}<br>Y ${f ? Math.round(f.y) : '—'}</div>
        <div><b>${ieJanH('Deslocamento')}</b><br>X <input type="number" data-ox value="${off ? Math.round(-off.x) : 0}" ${off ? '' : 'disabled'}><br>Y <input type="number" data-oy value="${off ? Math.round(-off.y) : 0}" ${off ? '' : 'disabled'}></div></div>
        <label class="ie-ls-chk"><input type="checkbox" data-al ${o.alinhado ? 'checked' : ''}> ${ieJanH('Alinhado')}</label>
        <label class="ie-ls-chk"><input type="checkbox" data-sob ${o.sobrepor ? 'checked' : ''}> ${ieJanH('Mostrar sobreposição')}</label>
        <label class="ie-ls-faixa ie-pn-f"><span>${ieJanH('Opacidade')}</span><input type="range" data-sobop min="5" max="100" value="${o.sobreporOp ?? 50}"><span></span><em>%</em></label>
        <div class="ie-pn-rod"><button class="ie-btn ie-btn-mini" data-zerar>${ieJanH('Redefinir deslocamento')}</button></div>
        <div class="ie-prop-nota">${ieJanH('Alt+clique com o Carimbo (S) escolhe a origem.')}</div>`;
    const dl = () => { const x = +corpo.querySelector('[data-ox]').value, y = +corpo.querySelector('[data-oy]').value; IE.carimboOff = { x: -x, y: -y }; };
    corpo.querySelectorAll('[data-ox],[data-oy]').forEach(i => { i.addEventListener('change', dl); i.addEventListener('keydown', e => e.stopPropagation()); });
    corpo.querySelector('[data-al]').onchange = e => { o.alinhado = e.target.checked; };
    corpo.querySelector('[data-sob]').onchange = e => { o.sobrepor = e.target.checked; ieDesenharSobre(); };
    corpo.querySelector('[data-sobop]').oninput = e => { o.sobreporOp = +e.target.value; };
    corpo.querySelector('[data-zerar]').onclick = () => { IE.carimboOff = null; ieJanAtualizar('ferr'); };
});
(function () {   // carimbo: sobreposição da origem embaixo do cursor
    const F = IE_FERR.carimbo, sobre = F.sobre;
    F.sobre = function (ctx, doc) {
        sobre && sobre.call(this, ctx, doc);
        const o = IE.op.carimbo, p = IE.mouse;
        if (!o.sobrepor || !p || !IE.carimboFonte) return;
        const off = IE.carimboOff || { x: IE.carimboFonte.x - p.x, y: IE.carimboFonte.y - p.y };
        const r = o.tam / 2, s = ieDocTela(p.x, p.y, doc);
        ctx.save();
        ctx.beginPath(); ctx.arc(s.x, s.y, r * doc.zoom * 1.6, 0, Math.PI * 2); ctx.clip();
        ctx.globalAlpha = (o.sobreporOp ?? 50) / 100;
        const a = ieDocTela(-off.x, -off.y, doc);
        ctx.drawImage(doc.comp, a.x, a.y, doc.w * doc.zoom, doc.h * doc.zoom);
        ctx.restore();
    };
    F.cursorPincel = true;
})();

// ─────────────────────────── Observações ───────────────────────────
ieJanRegistrar('notas', 'Observações', ['doc'], (corpo, doc) => {
    if (!doc) { corpo.innerHTML = `<div class="ie-vazio">${ieJanH('Nenhum documento')}</div>`; return; }
    const notas = doc.notas || (doc.notas = []), n = notas.find(x => x.id === doc.notaSel) || null, i = notas.indexOf(n);
    corpo.innerHTML = `<div class="ie-pn-linha"><button class="ie-ico-btn" data-ant>◀</button><span>${notas.length ? `${i + 1} / ${notas.length}` : ieJanH('Nenhuma observação')}</span><button class="ie-ico-btn" data-prox>▶</button>
        <div class="ie-op-esp"></div><button class="ie-btn ie-btn-mini" data-nova>+ ${ieJanH('Nova')}</button><button class="ie-ico-btn" data-exc ${n ? '' : 'disabled'}>${ieIco('trash')}</button></div>
        <textarea class="ie-prop-texto" data-txt rows="5" ${n ? '' : 'disabled'} placeholder="${ieJanH('Escreva a observação')}">${n ? ieEsc(n.texto) : ''}</textarea>
        <div class="ie-prop-nota">${ieJanH('As observações aparecem na imagem (Ctrl+H esconde); arraste o ícone para mover. Ficam no projeto .iknv.')}</div>`;
    const sel = k => { if (!notas.length) return; doc.notaSel = notas[(i + k + notas.length) % notas.length].id; ieDesenharSobre(); ieJanAtualizar('doc'); };
    corpo.querySelector('[data-ant]').onclick = () => sel(-1);
    corpo.querySelector('[data-prox]').onclick = () => sel(1);
    corpo.querySelector('[data-nova]').onclick = () => {
        const v = ieVistaTam(), x = (v.w / 2 - doc.px) / doc.zoom, y = (v.h / 2 - doc.py) / doc.zoom;
        const nota = { id: Date.now(), x: Math.round(ieClamp(x, 0, doc.w)), y: Math.round(ieClamp(y, 0, doc.h)), texto: '', cor: '#ffd84d' };
        notas.push(nota); doc.notaSel = nota.id; doc.sujo = true;
        ieDesenharSobre(); ieJanAtualizar('doc');
        setTimeout(() => corpo.querySelector('[data-txt]')?.focus(), 80);
    };
    corpo.querySelector('[data-exc]').onclick = () => { notas.splice(i, 1); doc.notaSel = null; ieDesenharSobre(); ieJanAtualizar('doc'); };
    const ta = corpo.querySelector('[data-txt]');
    ta.addEventListener('input', () => { if (n) { n.texto = ta.value; doc.sujo = true; } });
    ta.addEventListener('keydown', e => e.stopPropagation());
});
(function () {   // ícones das observações na tela (clique seleciona, arrastar move)
    const orig = ieDesenharSobre;
    ieDesenharSobre = function () {
        orig();
        const doc = IE.doc, c = ieEl('ie-sobre');
        if (!doc || !c || !(doc.notas || []).length || IE.semExtras || !ieAtivoVisivel()) return;
        const ctx = ieCtx(c), dpr = ieDpr();
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const n of doc.notas) {
            const s = ieDocTela(n.x, n.y, doc);
            ctx.fillStyle = n.cor || '#ffd84d'; ctx.strokeStyle = n.id === doc.notaSel ? '#4aa3ff' : '#222'; ctx.lineWidth = n.id === doc.notaSel ? 2 : 1;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + 18, s.y); ctx.lineTo(s.x + 18, s.y + 14); ctx.lineTo(s.x + 7, s.y + 14); ctx.lineTo(s.x, s.y + 20); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
    };
    document.addEventListener('pointerdown', ev => {
        const doc = IE.doc, sobre = ieEl('ie-sobre');
        if (!doc || ev.target !== sobre || !(doc.notas || []).length || IE.semExtras) return;
        const r = sobre.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
        const n = [...doc.notas].reverse().find(n => { const s = ieDocTela(n.x, n.y, doc); return mx >= s.x - 2 && mx <= s.x + 20 && my >= s.y - 2 && my <= s.y + 22; });
        if (!n) return;
        ev.stopPropagation(); ev.preventDefault();
        doc.notaSel = n.id;
        if (!ieJanVisivel('notas')) ieDockAlternar('notas');
        ieJanAtualizar('doc'); ieDesenharSobre();
        const x0 = ev.clientX, y0 = ev.clientY, nx = n.x, ny = n.y;
        const mv = e => { n.x = Math.round(nx + (e.clientX - x0) / doc.zoom); n.y = Math.round(ny + (e.clientY - y0) / doc.zoom); ieDesenharSobre(); };
        const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
        document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    }, true);
})();

// ─────────────────────────── Ajustes (camadas de ajuste novas) ───────────────────────────
// campos iguais aos dos diálogos de Imagem > Ajustes; o ajuste é refeito dos valores a cada mudança (painel Propriedades)
const IE_AJ_CAMADAS = {
    brilho: { nome: 'Brilho/Contraste', kind: 'brightnesscontrast', campos: [['br', 'Brilho', -150, 150, 0], ['ct', 'Contraste', -50, 100, 0], ['legado', 'Usar legado', 'check', false]], aj: v => ({ t: 'brightnesscontrast', br: v.br, ct: v.ct, legado: v.legado }) },
    niveis: { nome: 'Níveis', kind: 'levels', campos: [['i0', 'Entrada: preto', 0, 253, 0], ['g', 'Meios-tons (gama)', 0.1, 9.99, 1, 0.01], ['i1', 'Entrada: branco', 2, 255, 255], ['o0', 'Saída: preto', 0, 255, 0], ['o1', 'Saída: branco', 0, 255, 255]], aj: v => ({ t: 'levels', canais: [[v.i0, Math.max(v.i0 + 2, v.i1), v.o0, v.o1, v.g]] }) },
    curvas: { nome: 'Curvas', kind: 'curves', campos: [['curva', 'Curva', 'curva', [[0, 0], [255, 255]]]], aj: v => ({ t: 'curves', canais: { 0: v.curva } }) },
    exposicao: { nome: 'Exposição', kind: 'exposure', campos: [['exp', 'Exposição', -5, 5, 0, 0.01], ['off', 'Deslocamento', -0.5, 0.5, 0, 0.001], ['gama', 'Correção de gama', 0.01, 9.99, 1, 0.01]], aj: v => ({ t: 'exposure', exp: v.exp, off: v.off, gama: v.gama }) },
    vibratilidade: { nome: 'Vibratilidade', kind: 'vibrance', campos: [['vib', 'Vibratilidade', -100, 100, 0], ['sat', 'Saturação', -100, 100, 0]], aj: v => ({ t: 'vibrance', vib: v.vib, sat: v.sat }) },
    matiz: { nome: 'Matiz/Saturação', kind: 'huesaturation', campos: [['h', 'Matiz', -180, 180, 0], ['s', 'Saturação', -100, 100, 0], ['l', 'Luminosidade', -100, 100, 0], ['colorir', 'Colorir', 'check', false]], aj: v => (v.colorir ? { t: 'huesaturation', colorir: true, col: [((v.h % 360) + 360) % 360, Math.max(0, v.s) || 25, v.l] } : { t: 'huesaturation', h: v.h, s: v.s, l: v.l }) },
    equilibrio: { nome: 'Equilíbrio de cores', kind: 'colorbalance', campos: [['cr', 'Ciano ↔ Vermelho', -100, 100, 0], ['mg', 'Magenta ↔ Verde', -100, 100, 0], ['yb', 'Amarelo ↔ Azul', -100, 100, 0], ['lum', 'Preservar luminosidade', 'check', true]], aj: v => ({ t: 'colorbalance', medios: [v.cr, v.mg, v.yb], lum: v.lum }) },
    pb: { nome: 'Preto e branco', kind: 'blackandwhite', campos: [['r', 'Vermelhos', -200, 300, 40], ['y', 'Amarelos', -200, 300, 60], ['g', 'Verdes', -200, 300, 40], ['c', 'Cianos', -200, 300, 60], ['b', 'Azuis', -200, 300, 20], ['m', 'Magentas', -200, 300, 80]], aj: v => ({ t: 'blackandwhite', p: [v.r, v.y, v.g, v.c, v.b, v.m] }) },
    filtroFoto: { nome: 'Filtro de fotos', kind: 'photofilter', campos: [['cor', 'Cor', 'cor', '#ec8a00'], ['dens', 'Densidade', 1, 100, 25], ['lum', 'Preservar luminosidade', 'check', true]], aj: v => ({ t: 'photofilter', cor: ieHexRgb(v.cor), dens: v.dens, lum: v.lum }) },
    misturador: { nome: 'Misturador de canais', kind: 'channelmixer', campos: [['rr', 'Vermelho: vermelho', -200, 200, 100], ['rg', 'Vermelho: verde', -200, 200, 0], ['rb', 'Vermelho: azul', -200, 200, 0], ['gr', 'Verde: vermelho', -200, 200, 0], ['gg', 'Verde: verde', -200, 200, 100], ['gb', 'Verde: azul', -200, 200, 0], ['br', 'Azul: vermelho', -200, 200, 0], ['bg', 'Azul: verde', -200, 200, 0], ['bb', 'Azul: azul', -200, 200, 100], ['mono', 'Monocromático', 'check', false]], aj: v => ({ t: 'channelmixer', mono: v.mono, dados: [[v.rr, v.rg, v.rb, 0], [v.gr, v.gg, v.gb, 0], [v.br, v.bg, v.bb, 0]] }) },
    inverter: { nome: 'Inverter', kind: 'invert', campos: [], aj: () => ({ t: 'invert' }) },
    posterizar: { nome: 'Posterizar', kind: 'posterize', campos: [['n', 'Níveis', 2, 255, 4]], aj: v => ({ t: 'posterize', n: v.n }) },
    limiar: { nome: 'Limiar', kind: 'threshold', campos: [['n', 'Nível de limiar', 1, 255, 128]], aj: v => ({ t: 'threshold', n: v.n }) },
    mapaDeg: { nome: 'Mapa de degradê', kind: 'gradientmap', campos: [['c0', 'Sombras', 'cor', '#000000'], ['c1', 'Realces', 'cor', '#ffffff'], ['inv', 'Inverter', 'check', false]], aj: v => ({ t: 'gradientmap', inv: v.inv, stops: [[0, ieHexRgb(v.c0)], [1, ieHexRgb(v.c1)]] }) },
};
async function ieAjNova(chave) {
    const doc = IE.doc, def = IE_AJ_CAMADAS[chave];
    if (!doc || !def) return;
    const vals = def.padrao ? def.padrao() : Object.fromEntries(def.campos.map(c => [c[0], ieClone(c[2] === 'check' || c[2] === 'cor' || c[2] === 'curva' ? c[3] : c[4])]));
    const L = ieNovaCamada(doc, { tipo: 'ajuste', nome: ieNomeLivre(doc, ieT(def.nome)), kind: def.kind, ajChave: chave, ajVals: vals, ajuste: def.aj(vals) });
    ieInserirAcima(doc, L, ieAtiva(doc));
    if (doc.sel) { ieAtivar(L.id, doc); await ieCmd('mascaraSel'); doc.mascaraAlvo = false; }   // como no Photoshop: Propriedades mostra os valores
    ieTudo(doc);
    ieHist(ieT(def.nome));
}
ieJanRegistrar('ajustes', 'Ajustes', ['doc'], () => {
    const corpo = document.querySelector('[data-pn="ajustes"]');
    corpo.innerHTML = `<div class="ie-pn-ajustes">${Object.entries(IE_AJ_CAMADAS).map(([k, d]) => `<button data-aj="${k}" title="${ieJanH(d.nome)}">${ieJanH(d.nome)}</button>`).join('')}</div>
        <div class="ie-prop-nota">${ieJanH('Cria uma camada de ajuste acima da selecionada (com a seleção vira máscara). Os valores ficam no painel Propriedades.')}</div>`;
    corpo.querySelectorAll('[data-aj]').forEach(b => b.onclick = () => ieAjNova(b.dataset.aj));
});
// painel Propriedades: valores da camada de ajuste criada no editor
(function () {
    const orig = ieUiProps;
    ieUiProps = function () {
        orig();
        const doc = IE.doc, L = doc && ieAtiva(doc), box = ieEl('ie-props');
        if (!L || L.tipo !== 'ajuste' || !L.ajChave || !box || doc.mascaraAlvo) return;
        const def = IE_AJ_CAMADAS[L.ajChave];
        box.querySelectorAll('.ie-prop-nota').forEach(n => n.remove());
        if (def.propsUi) return def.propsUi(L, box, doc);   // painel próprio (Camera Raw)
        const div = document.createElement('div');
        div.className = 'ie-pn-ajprops';
        div.innerHTML = def.campos.map(([k, r, a, b, c, passo]) => {
            const v = L.ajVals[k];
            if (a === 'check') return `<label class="ie-ls-chk"><input type="checkbox" data-av="${k}" ${v ? 'checked' : ''}> ${ieJanH(r)}</label>`;
            if (a === 'cor') return `<label class="ie-ls-lin"><span>${ieJanH(r)}</span><button class="ie-cor ie-ls-cor" data-ac="${k}" style="background:${v}"></button></label>`;
            if (a === 'curva') return `<canvas data-acurva="${k}" width="256" height="256" style="width:220px;height:220px"></canvas>`;
            return `<label class="ie-ls-faixa ie-pn-f"><span>${ieJanH(r)}</span><input type="range" data-av="${k}" min="${a}" max="${b}" step="${passo || 1}" value="${v}"><input type="number" data-avn="${k}" min="${a}" max="${b}" step="${passo || 1}" value="${v}"><em></em></label>`;
        }).join('') || `<div class="ie-prop-nota">${ieJanH('Sem opções')}</div>`;
        box.appendChild(div);
        const aplicar = () => { L.ajuste = def.aj(L.ajVals); ieInvalidar(L); ieAgendar(null, doc); clearTimeout(L._ajT); L._ajT = setTimeout(() => ieHist(ieT(def.nome)), 500); };
        div.querySelectorAll('input[data-av]').forEach(el => el.addEventListener('input', () => {
            L.ajVals[el.dataset.av] = el.type === 'checkbox' ? el.checked : +el.value;
            const n = div.querySelector(`[data-avn="${el.dataset.av}"]`); if (n) n.value = el.value;
            aplicar();
        }));
        div.querySelectorAll('input[data-avn]').forEach(el => { el.addEventListener('change', () => { L.ajVals[el.dataset.avn] = +el.value; div.querySelector(`[data-av="${el.dataset.avn}"]`).value = el.value; aplicar(); }); el.addEventListener('keydown', e => e.stopPropagation()); });
        div.querySelectorAll('[data-ac]').forEach(el => el.onclick = () => ieSeletorCor(el, L.ajVals[el.dataset.ac], c => { el.style.background = c; L.ajVals[el.dataset.ac] = c; aplicar(); }));
        div.querySelectorAll('[data-acurva]').forEach(cv => ieCurvaEditor(cv, L.ajVals[cv.dataset.acurva], pts => { L.ajVals[cv.dataset.acurva] = pts; aplicar(); }));
    };
})();

// ─────────────────────────── itens do Photoshop que dependem de nuvem/3D/vídeo/ferramentas que o editor não tem ───────────────────────────
const IE_JAN_INDISP = [['Ações', 'Alt+F9'], ['Bibliotecas', ''], ['Comentários', ''], ['Credenciais de conteúdo', ''], ['Demarcadores', ''], ['Histórico de versões', ''],
    ['Linha do tempo', ''], ['Materiais', ''], ['Registro de medidas', '']];

// ─────────────────────────── Espaço de trabalho ───────────────────────────
// colunas de cada lado (da esquerda para a direita) e as larguras
const IE_ESPACOS = {
    essenciais: ['Essenciais', { esq: [['amostras', 'cor']], largEsq: [250], dir: [['paragrafo', 'caractere', 'props'], ['camadas']], largDir: [280, 310], alturas: { cor: 230 } }],
    pintura: ['Pintura', { esq: [['pinceis', 'configPincel']], largEsq: [270], dir: [['cor', 'amostras'], ['camadas', 'hist']], largDir: [250, 270] }],
    fotografia: ['Fotografia', { esq: [], dir: [['histograma', 'navegador', 'info'], ['props', 'ajustes', 'camadas']], largDir: [250, 290] }],
    graficos: ['Gráficos e Web', { esq: [['caractere', 'paragrafo', 'glifos']], largEsq: [270], dir: [['estilos', 'amostras'], ['props', 'camadas']], largDir: [230, 290] }],
};
function ieEspacoLayout(nome) {
    const meus = iePref('espacos', {}) || {};
    if (meus[nome]) return ieClone(meus[nome]);
    const p = IE_ESPACOS[nome] && IE_ESPACOS[nome][1];
    if (!p) return null;
    const usados = [...p.esq.flat(), ...p.dir.flat()];
    return { ...ieClone(IE_DOCK_PADRAO), alturas: {}, ...ieClone(p), soltos: {}, recolhidos: [], fechados: Object.keys(IE_DOCK_PAINEIS).filter(id => !usados.includes(id)) };
}
function ieEspacoUsar(nome, redefinir) {
    const meus = iePref('espacos', {}) || {}, salvo = iePref('espacoEstado', {}) || {};
    // o espaço lembra como ficou (como no Photoshop); Redefinir volta ao original
    const l = (!redefinir && salvo[nome]) || ieEspacoLayout(nome);
    if (!l) return;
    if (IE_DOCK.lay && iePref('espacoAtual', 'essenciais')) iePrefGravar('espacoEstado', { ...salvo, [iePref('espacoAtual', 'essenciais')]: ieClone(IE_DOCK.lay) });
    IE_DOCK.lay = ieDockNormalizar(l);
    { const t = new Set(ieDockIds(IE_DOCK.lay)); for (const id of Object.keys(IE_DOCK_PAINEIS)) if (!t.has(id)) IE_DOCK.lay.fechados.push(id); }
    iePrefGravar('espacoAtual', nome);
    if (redefinir) { const s = { ...(iePref('espacoEstado', {}) || {}) }; delete s[nome]; iePrefGravar('espacoEstado', s); }
    ieDockAplicar();
    ieJanAtualizar();
    void meus;
}
function ieEspacoNome(n) { return (IE_ESPACOS[n] && ieT(IE_ESPACOS[n][0])) || n; }

// ─────────────────────────── Barra de tarefas contextual ───────────────────────────
function ieBarraCtx() {
    let b = ieEl('ie-ctb');
    if (!b) {
        b = document.createElement('div');
        b.id = 'ie-ctb'; b.className = 'ie-ctb';
        ieEl('ie-vista').appendChild(b);
        b.addEventListener('pointerdown', e => {
            e.stopPropagation();
            const alca = e.target.closest('.ie-ctb-alca');
            if (!alca) return;
            // arrastar pela alça: a barra fica onde soltar (e lembra; duplo clique na alça volta a seguir a camada)
            e.preventDefault();
            const rv = ieEl('ie-vista').getBoundingClientRect(), rb = b.getBoundingClientRect(), dx = e.clientX - rb.left, dy = e.clientY - rb.top;
            const mover = ev => {
                const x = ieClamp(ev.clientX - rv.left - dx, 0, rv.width - b.offsetWidth), y = ieClamp(ev.clientY - rv.top - dy, 0, rv.height - b.offsetHeight);
                b.style.left = x + 'px'; b.style.top = y + 'px'; b._pos = { x, y };
            };
            const soltar = () => { document.removeEventListener('pointermove', mover); document.removeEventListener('pointerup', soltar); if (b._pos) iePrefGravar('barraCtxPos', b._pos); };
            document.addEventListener('pointermove', mover); document.addEventListener('pointerup', soltar);
        });
        b.addEventListener('dblclick', e => { if (e.target.closest('.ie-ctb-alca')) { iePrefGravar('barraCtxPos', null); ieBarraCtxAtualizar(); } });
        b.addEventListener('click', e => { const x = e.target.closest('[data-cmd]'); if (x) ieCmd(x.dataset.cmd); });
    }
    return b;
}
// clicar numa camada na tela traz a barra de volta (o × só esconde até o próximo clique)
document.addEventListener('pointerdown', e => { if (e.target && e.target.id === 'ie-sobre') IE._ctbOculta = false; }, true);
// a barra some enquanto o botão está apertado (arrastando): ao soltar, volta na hora (sem esperar outro redesenho)
document.addEventListener('pointerup', () => { if (IE.doc) setTimeout(() => { try { ieBarraCtxAtualizar(); } catch (e) { /* sem barra */ } }, 0); }, true);
function ieBarraCtxAtualizar() {
    const doc = IE.doc, b = ieBarraCtx();
    if (doc && !iePref('barraCtxV2', false)) { iePrefGravar('barraCtxV2', true); iePrefGravar('barraCtx', true); }   // o × antigo desligava de vez
    const ligada = iePref('barraCtx', true);
    if (!doc || !ligada || IE._ctbOculta || IE.ponteiro || IE.edTexto || IE.transf || IE.semExtras || !ieAtivoVisivel()) { b.hidden = true; return; }
    let R, itens;
    if (doc.sel) {
        R = doc.sel.bbox;
        itens = [['selInverter', 'Inverter seleção'], ['selSuavizar', 'Suavizar...'], ['selExpandir', 'Expandir...'], ['mascaraSel', 'Criar máscara'], ['preencher', 'Preencher...'], ['viaRecorte', 'Nova camada'], ['selAssunto', 'Selecionar assunto'], ['selNada', 'Desmarcar']];
    } else {
        const L = ieAtiva(doc);
        R = L && ieCaixaCamada(L);
        if (!R) { b.hidden = true; return; }
        itens = [['selAssunto', 'Selecionar assunto'], ['removerFundo', 'Remover fundo'], ['transformar', 'Transformar'], ['mascara', 'Máscara'], ['opcoesMescla', 'fx Estilo'], ['duplicar', 'Duplicar'], ['ajuste:matiz', 'Ajuste'], ['rasterizar', 'Rasterizar']];
        if (!['pixel', 'inteligente'].includes(L.tipo)) itens = itens.filter(i => i[0] !== 'selAssunto' && i[0] !== 'removerFundo');
        if (['pixel', 'ajuste', 'grupo'].includes(L.tipo)) itens = itens.filter(i => i[0] !== 'rasterizar');
    }
    const chave = itens.map(i => i[0]).join('|');
    if (b._chave !== chave) { b._chave = chave; b.innerHTML = `<span class="ie-ctb-alca" title="${ieJanH('Arraste para mover a barra · duplo clique: volta a seguir a camada')}">⋮⋮</span>` + itens.map(([c, r]) => `<button data-cmd="${c}">${ieJanH(r)}</button>`).join('') + `<button class="ie-ctb-x" data-cmd="barraCtxDesligar" title="${ieJanH('Esconder até clicar numa camada (desligar de vez: Janela > Barra de tarefas contextual)')}">×</button>`; }
    const v = ieVistaTam(), s = ieDocTela(R.x + R.w / 2, R.y + R.h, doc);
    b.hidden = false;
    const w = b.offsetWidth || 300, fixa = iePref('barraCtxPos', null);
    if (fixa) {   // o lugar onde o usuário deixou (dentro da vista)
        b.style.left = ieClamp(fixa.x, 0, Math.max(0, v.w - w)) + 'px';
        b.style.top = ieClamp(fixa.y, 0, Math.max(0, v.h - b.offsetHeight)) + 'px';
        return;
    }
    b.style.left = ieClamp(s.x - w / 2, 8, v.w - w - 8) + 'px';
    b.style.top = ieClamp(s.y + 14, 8, v.h - 46) + 'px';
}
(function () {
    const orig = ieDesenharSobre;
    ieDesenharSobre = function () { orig(); try { ieBarraCtxAtualizar(); } catch (e) { /* sem barra */ } };
})();
IE_CMDS['ajuste:matiz'] = () => ieAjNova('matiz');
IE_CMDS.barraCtxDesligar = () => { IE._ctbOculta = true; ieBarraCtxAtualizar(); };   // só até o próximo clique numa camada

// ─────────────────────────── menu Janela ───────────────────────────
const IE_JAN_TECLAS = { configPincel: 'F5', cor: 'F6', camadas: 'F7', info: 'F8' };
Object.assign(IE_ATALHOS, { F5: 'janela:configPincel', F6: 'janela:cor', F8: 'janela:info', 'Alt+F9': 'indisp:Ações' });
function ieJanMenu() {
    const lay = IE_DOCK.lay || { fechados: [] }, aberto = id => !lay.fechados.includes(id);
    const atual = iePref('espacoAtual', 'essenciais'), meus = Object.keys(iePref('espacos', {}) || {});
    const paineis = Object.keys(IE_DOCK_PAINEIS).map(id => [ieT(IE_DOCK_PAINEIS[id]), 'janela:' + id, IE_JAN_TECLAS[id] || '', aberto(id)])
        .concat(IE_JAN_INDISP.map(([n, k]) => [ieT(n) + ' — ' + ieT('ainda não'), 'indisp:' + n, k, false]))
        .sort((a, b) => a[0].localeCompare(b[0]));
    return [
        ['Organizar', [['Igualar zoom', 'arrZoom'], ['Igualar local', 'arrLocal'], ['Igualar tudo', 'arrTudo'], '-', ['Consolidar tudo em abas', 'arrAbas']]],
        ['Espaço de trabalho', [...Object.keys(IE_ESPACOS).map(k => [IE_ESPACOS[k][0], 'espaco:' + k, '', atual === k]), ...meus.map(k => [k, 'espaco:' + k, '', atual === k]), '-',
            [`${ieT('Redefinir')} ${ieEspacoNome(atual)}`, 'espacoRedefinir'], ['Novo espaço de trabalho...', 'espacoNovo'], ['Excluir espaço de trabalho...', 'espacoExcluir'], '-',
            ['Travar espaço de trabalho', 'espacoTravar', '', !!iePref('espacoTravado', false)]]],
        '-', ...paineis, '-',
        ['Opções', 'mostrarOpcoes', '', !ieEl('ie').classList.contains('sem-opcoes')], ['Ferramentas', 'mostrarFerr', '', !ieEl('ie').classList.contains('sem-ferr')],
        ['Barra de tarefas contextual', 'barraCtxAlternar', '', iePref('barraCtx', true)],
        ...(IE.docs.length ? ['-', ...IE.docs.map((d, i) => [`${i + 1} ${d.nome}`, 'docIr:' + d.id, '', d === IE.doc])] : []),
    ];
}
{
    const i = IE_MENUS.findIndex(m => m[0] === 'Janela');
    IE_MENUS.splice(i, 1, ['Janela', [], ieJanMenu]);
}
Object.assign(IE_CMDS, {
    arrZoom: doc => IE.docs.forEach(d => { if (d !== doc) { d.zoom = doc.zoom; } }),
    arrLocal: doc => { const v = ieVistaTam(), cx = (v.w / 2 - doc.px) / doc.zoom, cy = (v.h / 2 - doc.py) / doc.zoom; IE.docs.forEach(d => { if (d !== doc) { d.px = Math.round(v.w / 2 - cx * d.zoom); d.py = Math.round(v.h / 2 - cy * d.zoom); } }); },
    arrTudo: doc => { IE_CMDS.arrZoom(doc); IE_CMDS.arrLocal(doc); },
    arrAbas: () => ieToast(ieT('Os documentos já estão em abas')),
    espacoRedefinir: () => ieEspacoUsar(iePref('espacoAtual', 'essenciais'), true),
    espacoNovo: async () => {
        const v = await ieDialogo({ titulo: 'Novo espaço de trabalho', campos: [{ id: 'nome', rotulo: 'Nome', tipo: 'texto', valor: `${ieT('Espaço')} ${Object.keys(iePref('espacos', {}) || {}).length + 1}` }] });
        if (!v || !String(v.nome).trim()) return;
        const nome = String(v.nome).trim();
        iePrefGravar('espacos', { ...(iePref('espacos', {}) || {}), [nome]: ieClone(IE_DOCK.lay) });
        iePrefGravar('espacoAtual', nome);
        ieToast(`${ieT('Espaço de trabalho salvo')}: ${nome}`);
    },
    espacoExcluir: async () => {
        const meus = Object.keys(iePref('espacos', {}) || {});
        if (!meus.length) { ieToast(ieT('Nenhum espaço de trabalho seu para excluir')); return; }
        const v = await ieDialogo({ titulo: 'Excluir espaço de trabalho', ok: 'Excluir', campos: [{ id: 'nome', rotulo: 'Espaço', tipo: 'select', valor: meus[0], opcoes: meus.map(n => [n, n]) }] });
        if (!v) return;
        const e = { ...(iePref('espacos', {}) || {}) }; delete e[v.nome];
        iePrefGravar('espacos', e);
        if (iePref('espacoAtual') === v.nome) ieEspacoUsar('essenciais');
    },
    espacoTravar: () => { iePrefGravar('espacoTravado', !iePref('espacoTravado', false)); ieToast(ieT(iePref('espacoTravado') ? 'Espaço de trabalho travado' : 'Espaço de trabalho destravado')); },
    mostrarOpcoes: () => { ieEl('ie').classList.toggle('sem-opcoes'); setTimeout(() => { ieDesenharVista(); ieDesenharSobre(); }, 30); },
    mostrarFerr: () => { ieEl('ie').classList.toggle('sem-ferr'); setTimeout(() => { ieDesenharVista(); ieDesenharSobre(); }, 30); },
    barraCtxAlternar: () => { iePrefGravar('barraCtx', !iePref('barraCtx', true)); ieBarraCtxAtualizar(); },
    salvarSelecao: async doc => { if (!doc.sel) { ieToast(ieT('Faça uma seleção antes')); return; } const v = await ieDialogo({ titulo: 'Salvar seleção', campos: [{ id: 'nome', rotulo: 'Nome', tipo: 'texto', valor: `Alfa ${(doc.alfas || []).length + 1}` }] }); if (v) ieSelSalvarCanal(doc, v.nome); },
    carregarSelecao: async doc => {
        const a = doc.alfas || [];
        if (!a.length) { ieToast(ieT('Nenhum canal salvo (Selecionar > Salvar seleção)')); return; }
        const v = await ieDialogo({ titulo: 'Carregar seleção', campos: [{ id: 'i', rotulo: 'Canal', tipo: 'select', valor: '0', opcoes: a.map((x, i) => [String(i), x.nome]) },
            { id: 'op', rotulo: 'Operação', tipo: 'select', valor: 'nova', opcoes: [['nova', 'Nova seleção'], ['somar', 'Adicionar à seleção'], ['subtrair', 'Subtrair da seleção'], ['cruzar', 'Cruzar com a seleção']] }] });
        if (v) ieSelCarregarCanal(doc, a[+v.i], v.op);
    },
});
{   // Selecionar > Salvar seleção / Carregar seleção
    const sel = IE_MENUS.find(m => m[0] === 'Selecionar')[1];
    sel.push('-', ['Carregar seleção...', 'carregarSelecao'], ['Salvar seleção...', 'salvarSelecao']);
}
(function () {   // ieCmd entende janela:, espaco:, docIr:, indisp:
    const orig = ieCmd;
    ieCmd = async function (c) {
        if (typeof c === 'string') {
            if (c.startsWith('janela:')) { ieDockAlternar(c.slice(7)); ieJanAtualizar(); return; }
            if (c.startsWith('espaco:')) { ieEspacoUsar(c.slice(7)); return; }
            if (c.startsWith('docIr:')) { const d = IE.docs.find(x => x.id === +c.slice(6)); if (d) ieMostrarDoc(d); return; }
            if (c.startsWith('indisp:')) { ieToast(`${c.slice(7)}: ${ieT('ainda não existe no editor')}`); return; }
        }
        return orig(c);
    };
    const pode = ieCmdPode;
    ieCmdPode = function (c) { if (String(c).startsWith('am:')) return true; if (String(c).startsWith('indisp:')) return false; if (/^(janela|espaco|docIr):|^(espaco|arr|mostrar|barraCtx)/.test(c)) return true; return pode(c); };
})();
// arrastar painéis respeita "Travar espaço de trabalho"
(function () {
    const orig = ieDockArrIni;
    ieDockArrIni = function (ev, id) { if (iePref('espacoTravado', false)) return; return orig(ev, id); };
})();

// ─────────────────────────── barra Ferramentas: ordem e grupos do Photoshop ───────────────────────────
// cada espaço mostra a última ferramenta usada do grupo; o triângulo no canto indica que há mais; botão direito ou
// segurar abre a lista (como no Photoshop). Shift+tecla alterna dentro do grupo.
const IE_FERR_GRUPOS = [['mover'], '|', ['letreiro'], ['laco', 'lacoPoli'], ['varinha'], ['corte', 'fatia'], '|', ['contagotas'], ['pincel'], ['carimbo'], ['borracha', 'borrachaFundo', 'borrachaMagica'], ['degrade', 'balde'], '|',
    ['texto'], ['forma'], '|', ['mao'], ['zoom']];
function ieFerrGrupos() {
    const usados = new Set(IE_FERR_GRUPOS.flat()), g = IE_FERR_GRUPOS.map(x => (x === '|' ? x : x.filter(n => IE_FERR[n]))).filter(x => x === '|' || x.length);
    const resto = Object.keys(IE_FERR).filter(n => !usados.has(n) && IE_FERR_ORDEM.includes(n));
    return resto.length ? [...g, '|', ...resto.map(n => [n])] : g;
}
function ieFerrNoEspaco(grupo) { const m = iePref('ferrGrupo', {}) || {}; return grupo.includes(IE.ferr) ? IE.ferr : grupo.includes(m[grupo[0]]) ? m[grupo[0]] : grupo[0]; }
ieUiFerr = function () {
    const box = ieEl('ie-ferr');
    if (!box) return;
    if (!box._ok2) {
        box._ok2 = true; box._ok = true;
        const cores = box.querySelector('.ie-cores');
        box.innerHTML = ieFerrGrupos().map((g, i) => g === '|' ? '<i class="ie-ferr-sep"></i>' : `<button class="ie-ferr-btn ${g.length > 1 ? 'grupo' : ''}" data-gi="${i}"></button>`).join('');
        if (cores) box.appendChild(cores);
        else box.insertAdjacentHTML('beforeend', `<div class="ie-cores" title="${ieT('Cor de frente e de fundo (D: padrão, X: trocar)')}">
                <button class="ie-cor ie-cor-frente" id="ie-cor0" onclick="ieEscolherCor(0, this)"></button>
                <button class="ie-cor ie-cor-fundo" id="ie-cor1" onclick="ieEscolherCor(1, this)"></button>
                <button class="ie-cor-troca" onclick="ieTrocarCores()" title="${ieT('Trocar (X)')}">${ieIco('swap')}</button>
                <button class="ie-cor-padrao" onclick="ieCoresPadrao()" title="${ieT('Padrão (D)')}"><i></i><i></i></button></div>`);
        let seg = 0;
        const lista = b => {   // lista do grupo ao lado do botão
            const g = ieFerrGrupos()[+b.dataset.gi], pop = ieEl('ie-pop'), rb = ieEl('ie').getBoundingClientRect(), r = b.getBoundingClientRect();
            pop.innerHTML = `<div class="ie-menu ie-ferr-lista">${g.map(n => `<button class="ie-menu-item" data-ferr="${n}"><i class="ie-menu-chk">${n === IE.ferr ? '■' : ''}</i>${ieIco(IE_FERR[n].icone)}<span>${ieT(IE_FERR[n].nome)}</span><kbd>${IE_FERR[n].tecla || ''}</kbd></button>`).join('')}</div>`;
            pop.hidden = false;
            pop.style.left = r.right - rb.left + 4 + 'px'; pop.style.top = r.top - rb.top + 'px';
            const fora = e => { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener('pointerdown', fora, true); } };
            pop.onclick = e => { const x = e.target.closest('[data-ferr]'); if (x) { pop.hidden = true; document.removeEventListener('pointerdown', fora, true); ieEscolherFerr(x.dataset.ferr); } };
            setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
        };
        box.addEventListener('pointerdown', ev => {
            const b = ev.target.closest('.ie-ferr-btn.grupo');
            clearTimeout(seg);
            if (b && ev.button === 0) seg = setTimeout(() => { b._segurou = true; lista(b); }, 350);
        });
        box.addEventListener('pointerup', () => clearTimeout(seg));
        box.addEventListener('contextmenu', ev => { const b = ev.target.closest('.ie-ferr-btn.grupo'); if (b) { ev.preventDefault(); lista(b); } });
        box.addEventListener('click', ev => {
            const b = ev.target.closest('.ie-ferr-btn');
            if (!b) return;
            if (b._segurou) { b._segurou = false; return; }
            ieEscolherFerr(b.dataset.f);
        });
    }
    const grupos = ieFerrGrupos();
    box.querySelectorAll('.ie-ferr-btn').forEach(b => {
        const g = grupos[+b.dataset.gi], n = ieFerrNoEspaco(g);
        if (b.dataset.f !== n) { b.dataset.f = n; b.innerHTML = ieIco(IE_FERR[n].icone); }
        b.title = g.map(x => `${ieT(IE_FERR[x].nome)} (${IE_FERR[x].tecla})`).join(' · ');
        b.classList.toggle('on', g.includes(IE.ferr));
    });
    ieUiCores();
};
(function () {   // lembra a última do grupo
    const orig = ieEscolherFerr;
    ieEscolherFerr = function (n, ...a) {
        const r = orig.call(this, n, ...a);
        const g = IE_FERR_GRUPOS.find(x => Array.isArray(x) && x.length > 1 && x.includes(n));
        if (g) { const m = iePref('ferrGrupo', {}) || {}; if (m[g[0]] !== n) iePrefGravar('ferrGrupo', { ...m, [g[0]]: n }); }
        ieUiFerr();
        return r;
    };
})();
