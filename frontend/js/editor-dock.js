// =========================================================
// Pocket Editor — painéis encaixáveis (docking como no Premiere)
// Cada "quadro" (a área de painéis do editor e cada janela solta) tem um layout em árvore:
// divisão {t:'s', d:'row'|'col', c:[filhos], z:[frações]} ou grupo de abas {t:'g', p:[painéis], a:ativo}.
// Os painéis são os .ve-panel[data-panel] do HTML; o elemento é só movido de lugar (até entre janelas),
// então os eventos e o estado continuam valendo.
// Arrastar a aba (de qualquer janela para qualquer janela): centro de um painel = vira aba ali;
// borda = encaixa ao lado/acima/abaixo; faixa na borda da área = ocupa a lateral inteira;
// fora de todas as janelas (ou Ctrl) = nova janela solta ali.
// Janelas soltas: janelas nativas do WebView2 (window.open('') liberado em main.py). Só existem com o
// Editor de Vídeo na tela. Fechar uma janela solta devolve os painéis dela ao lugar de onde saíram.
// O Python posiciona/lê as janelas (px reais, qualquer monitor): ve_win_place / ve_win_rect.
// Workspaces (menu Janela) e o layout ficam em %APPDATA%\CaniveteDoPailer\editor_workspaces.json.
// =========================================================

const VED_KEY = 've-dock-v2';
const VED = {
    hosts: [],              // [0] = área de painéis do editor; depois as janelas soltas {n, root, max, b, win}
    focus: 'timeline',
    ids: [], el: {},        // painéis existentes (capturados no início: o elemento pode estar em outra janela)
    home: {},               // de onde cada painel saiu da área principal, para voltar ao mesmo lugar
    ws: [], ativo: null,    // workspaces salvos e o que abre com o editor
    pronto: false,          // arquivo já lido (antes disso não grava, para não apagar o que está salvo)
    editor: false,          // Editor de Vídeo na tela (as janelas soltas acompanham)
    saveT: 0, proxN: 1,
};
const vedMain = () => VED.hosts[0];
const vedFloats = () => VED.hosts.slice(1);

function vedDefault() {
    return {
        t: 's', d: 'col', z: [0.6, 0.4], c: [
            { t: 's', d: 'row', z: [0.77, 0.23], c: [
                { t: 'g', p: ['monitor'], a: 'monitor' },
                { t: 's', d: 'col', z: [0.6, 0.4], c: [
                    { t: 'g', p: ['pp', 'props', 'lc', 'texto', 'projeto'], a: 'pp' },
                    { t: 'g', p: ['fx', 'keys'], a: 'fx' },
                ] },
            ] },
            { t: 's', d: 'row', z: [0.028, 0.972], c: [
                { t: 'g', p: ['ferramentas'], a: 'ferramentas' },
                { t: 'g', p: ['timeline'], a: 'timeline' },
            ] },
        ],
    };
}

function vedPanelEl(id) { return VED.el[id]; }
function vedTitle(id) { return VED.el[id]?.dataset.title || id; }
function vedApi() { return (window.pywebview && window.pywebview.api) || {}; }

// Procura um id nas janelas soltas (o $ve do editor cai aqui quando não acha na janela principal)
function vedFind(id) {
    for (const h of vedFloats()) {
        try { const el = h.win && h.win.document.getElementById(id); if (el) return el; } catch (e) { /* fechando */ }
    }
    return null;
}

// ── árvore ──
function vedGroups(n, out = []) {
    if (!n) return out;
    if (n.t === 'g') out.push(n); else n.c.forEach(ch => vedGroups(ch, out));
    return out;
}
function vedPanelsOf(n) { return vedGroups(n).flatMap(g => g.p); }
// Onde está o painel: {h: quadro, g: grupo} ou null (fechado)
function vedLocate(id) {
    for (const h of VED.hosts) { const g = vedGroups(h.root).find(x => x.p.includes(id)); if (g) return { h, g }; }
    return null;
}
function vedGroupOf(id) { const l = vedLocate(id); return l && l.h === vedMain() ? l.g : null; }
function vedParent(n, alvo) {
    if (!n || n.t === 'g') return null;
    for (const ch of n.c) {
        if (ch === alvo) return n;
        const r = vedParent(ch, alvo);
        if (r) return r;
    }
    return null;
}

// Tira grupos vazios, desfaz divisões de um filho só e junta divisões na mesma direção
function vedNorm(n) {
    if (!n) return null;
    if (n.t === 'g') {
        if (!n.p.length) return null;
        if (!n.p.includes(n.a)) n.a = n.p[0];
        return n;
    }
    const c = [], z = [];
    n.c.forEach((ch, i) => {
        const k = vedNorm(ch);
        if (!k) return;
        const zi = n.z[i] > 0 ? n.z[i] : 1 / n.c.length;
        if (k.t === 's' && k.d === n.d) {
            const tot = k.z.reduce((a, b) => a + b, 0) || 1;
            k.c.forEach((cc, j) => { c.push(cc); z.push(zi * k.z[j] / tot); });
        } else { c.push(k); z.push(zi); }
    });
    if (!c.length) return null;
    if (c.length === 1) return c[0];
    const s = z.reduce((a, b) => a + b, 0);
    return { t: 's', d: n.d, c, z: z.map(v => v / s) };
}

// Normaliza todos os quadros; janela solta que ficou vazia é fechada
function vedNormAll() {
    VED.hosts.forEach(h => { h.root = vedNorm(h.root); if (h.max && !vedGroups(h.root).includes(h.max)) h.max = null; });
    vedFloats().filter(h => !h.root).forEach(h => {
        VED.hosts.splice(VED.hosts.indexOf(h), 1);
        vedCloseWin(h);
    });
}

// ── salvar / carregar ──
// O localStorage do WebView não sobrevive a reiniciar o app; ele só segura um recarregar da página.
// O que vale é o arquivo, gravado pelo Python.
function vedSnapshot() {
    return JSON.parse(JSON.stringify({
        root: vedMain().root,
        floats: vedFloats().map(h => ({ root: h.root, b: h.b })),
        home: VED.home, known: VED.ids,
    }));
}

function vedSave() {
    const atual = vedSnapshot();
    veLsSet(VED_KEY, JSON.stringify(atual));
    if (!VED.pronto) return;
    clearTimeout(VED.saveT);
    VED.saveT = setTimeout(() => {
        const api = vedApi();
        if (api.ve_layout_save) api.ve_layout_save(JSON.stringify({ versao: 2, atual, workspaces: VED.ws, ativo: VED.ativo }));
    }, 400);
}

// Confere um layout salvo contra os painéis que existem; null se não servir
function vedParse(d) {
    const ids = VED.ids, vistos = new Set();
    if (!d || typeof d !== 'object') return null;
    d = JSON.parse(JSON.stringify(d));
    const ok = n => {
        if (!n || typeof n !== 'object') return false;
        if (n.t === 'g') {
            if (!Array.isArray(n.p)) return false;
            n.p = n.p.filter(id => ids.includes(id) && !vistos.has(id));
            n.p.forEach(id => vistos.add(id));
            return true;
        }
        return n.t === 's' && (n.d === 'row' || n.d === 'col') && Array.isArray(n.c) && Array.isArray(n.z) &&
            n.c.length === n.z.length && n.c.every(ok);
    };
    const root = ok(d.root) ? vedNorm(d.root) : null;
    if (!root) return null;
    let floats = Array.isArray(d.floats) ? d.floats : [];
    // formato antigo: um painel por janela {id: bounds}
    if (d.float && typeof d.float === 'object') floats = floats.concat(Object.entries(d.float).map(([id, b]) => ({ root: { t: 'g', p: [id], a: id }, b })));
    floats = floats.filter(f => f && f.b && [f.b.x, f.b.y, f.b.w, f.b.h].every(Number.isFinite) && ok(f.root))
        .map(f => ({ root: vedNorm(f.root), b: f.b })).filter(f => f.root);
    // painel que surgiu numa versão nova do app (não existia quando o layout foi salvo): entra como aba
    const known = Array.isArray(d.known) ? d.known : ids;
    const novos = ids.filter(id => !known.includes(id) && !vistos.has(id));
    return { root, floats, home: (d.home && typeof d.home === 'object') ? d.home : {}, novos };
}

// Troca o layout inteiro (workspace, padrão ou o salvo da última vez)
function vedApply(d) {
    const st = vedParse(d) || { root: vedDefault(), floats: [], home: {}, novos: [] };
    vedSuspendFloats();
    VED.hosts.length = 1;
    vedMain().root = st.root;
    vedMain().max = null;
    st.floats.forEach(f => VED.hosts.push(vedNewHost(f.root, f.b)));
    VED.home = st.home;
    // o painel Projeto substitui o Clipes (como no Premiere): num layout salvo, ele entra no lugar do outro
    if (st.novos.includes('projeto')) {
        const g = vedGroups(st.root).find(g => g.p.includes('clips'));
        if (g) {
            g.p[g.p.indexOf('clips')] = 'projeto';
            if (g.a === 'clips') g.a = 'projeto';
            st.novos = st.novos.filter(id => id !== 'projeto');
        }
    }
    if (st.novos.includes('ferramentas')) {
        const troca = (n, pai) => {
            if (n.t === 'g') {
                if (!n.p.includes('timeline')) return false;
                const sp = { t: 's', d: 'row', z: [0.028, 0.972], c: [{ t: 'g', p: ['ferramentas'], a: 'ferramentas' }, n] };
                if (pai) pai.c[pai.c.indexOf(n)] = sp; else st.root = sp;
                return true;
            }
            return n.c.some(ch => troca(ch, n));
        };
        if (troca(st.root, null)) st.novos = st.novos.filter(id => id !== 'ferramentas');
    }
    st.novos.forEach(id => vedAddTab(id, true));
    vedRender();
    if (VED.editor) vedOpenFloats();
}

function vedReset() {
    VED.ativo = null;
    vedApply(null);
    veToast('Layout padrão restaurado');
}

// Lê o arquivo quando a ponte com o Python fica pronta. Com workspace ativo, o editor abre como ele foi
// salvo; sem, abre como estava da última vez.
function vedLoadFile() {
    const api = vedApi();
    if (!api.ve_layout_load) { window.addEventListener('pywebviewready', vedLoadFile, { once: true }); return; }
    api.ve_layout_load().then(r => {
        const d = r && r.success && r.data;
        if (d) {
            VED.ws = Array.isArray(d.workspaces) ? d.workspaces.filter(w => w && w.nome) : [];
            VED.ativo = VED.ws.some(w => w.nome === d.ativo) ? d.ativo : null;
            const ws = VED.ws.find(w => w.nome === VED.ativo);
            vedApply(ws || d.atual);
        }
        VED.pronto = !!(r && r.success);
        vedSave();
    }).catch(() => {});
}

// ── workspaces (como Janela > Espaços de trabalho do Premiere) ──
function vedWsSave(nome) {
    nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!nome) return;
    vedRefreshBounds().then(() => vedWsStore(nome));
}

function vedWsStore(nome) {
    const snap = vedSnapshot();
    const i = VED.ws.findIndex(w => w.nome.toLowerCase() === nome.toLowerCase());
    const item = { nome: i >= 0 ? VED.ws[i].nome : nome, ...snap, salvo_em: new Date().toISOString() };
    if (i >= 0) VED.ws[i] = item; else VED.ws.push(item);
    VED.ativo = item.nome;
    vedSave();
    veToast(i >= 0 ? `Workspace "${item.nome}" atualizado` : `Workspace "${item.nome}" salvo: o editor vai abrir assim`);
}

function vedWsApply(nome) {
    const w = VED.ws.find(x => x.nome === nome);
    if (!w) return;
    VED.ativo = w.nome;
    vedApply(w);
    veToast(`Workspace "${w.nome}"`);
}

function vedWsDelete(nome) {
    VED.ws = VED.ws.filter(x => x.nome !== nome);
    if (VED.ativo === nome) VED.ativo = null;
    vedSave();
    veToast(`Workspace "${nome}" excluído`);
}

// O layout atual é diferente do workspace ativo salvo? (tamanhos e aba ativa não contam)
function vedWsModified() {
    const w = VED.ws.find(x => x.nome === VED.ativo);
    if (!w) return false;
    const limpa = o => JSON.stringify(o, (k, v) => k === 'z' || k === 'a' ? undefined : v);
    const fl = list => (list || []).map(f => limpa(f.root)).sort().join('|');
    const st = vedParse(w);
    return !st || limpa(st.root) !== limpa(vedMain().root) || fl(st.floats) !== fl(vedFloats());
}

// ── desenhar ──
function vedHostDoc(h) { return h === vedMain() ? document : h.win && h.win.document; }
function vedHostEl(h) { const d = vedHostDoc(h); return d && d.getElementById(h === vedMain() ? 've-dock' : 've-dock-solta'); }

function vedRender() {
    const store = document.getElementById('ve-dock-store');
    if (!store) return;
    // todos os painéis voltam para o depósito e são recolocados (mover no mesmo instante não pausa o vídeo)
    VED.ids.forEach(id => store.appendChild(VED.el[id]));
    VED.hosts.forEach(h => {
        const el = vedHostEl(h);
        if (!el) return;   // janela solta fechada (editor fora da tela)
        el.innerHTML = '';
        el.classList.toggle('maxed', !!h.max);
        if (h.root) {
            const n = vedBuild(h.root, h, el.ownerDocument);
            n.style.flex = '1 1 0px';
            el.appendChild(n);
        }
        if (h !== vedMain()) el.ownerDocument.title = vedWinTitle(h);
    });
    vedSave();
    if (typeof veLayoutChanged === 'function') veLayoutChanged();
}

function vedBuild(n, h, doc) {
    if (n.t === 'g') {
        const g = doc.createElement('div');
        g.className = 've-dgroup has-' + n.a + (n.a === VED.focus ? ' focus' : '') + (h.max === n ? ' maxed' : '');
        g._node = n;
        g._host = h;
        const tabs = doc.createElement('div');
        tabs.className = 've-dtabs';
        tabs.innerHTML = n.p.map(id => `<div class="ve-dtab${id === n.a ? ' active' : ''}" data-p="${id}" title="Arraste para mover o painel (para outra janela também; Ctrl ao soltar: nova janela) · duplo clique: maximizar">` +
            `<span>${veEsc(vedTitle(id))}</span>` +
            `<button class="ve-dtab-x" data-float="${id}" title="Soltar em janela própria (dá para levar a outro monitor)">⧉</button>` +
            `<button class="ve-dtab-x" data-close="${id}" title="Fechar painel (reabra em Janela)">×</button></div>`).join('');
        const body = doc.createElement('div');
        body.className = 've-dbody';
        const el = vedPanelEl(n.a);
        if (el) body.appendChild(el);
        g.append(tabs, body);
        return g;
    }
    const s = doc.createElement('div');
    s.className = 've-dsplit ' + n.d;
    n.c.forEach((ch, i) => {
        if (i) {
            const sash = doc.createElement('div');
            sash.className = 've-sash';
            sash._split = n;
            sash._i = i;
            s.appendChild(sash);
        }
        const e = vedBuild(ch, h, doc);
        e.style.flex = `${n.z[i]} 1 0px`;
        s.appendChild(e);
    });
    return s;
}

// ── abrir / fechar / mostrar ──
// novo = painel que surgiu numa versão nova do app (layout salvo não o conhece): vai para o grupo de
// Controles de efeito, na frente, e não para o painel com foco (que poderia ser a timeline)
function vedAddTab(id, novo) {
    const m = vedMain();
    const gs = vedGroups(m.root), comProps = gs.find(g => g.p.includes('props'));
    const alvo = (novo ? comProps : gs.find(g => g.p.includes(VED.focus)) || comProps) || gs[0];
    if (!alvo) { m.root = m.root ? { t: 's', d: 'row', c: [m.root, { t: 'g', p: [id], a: id }], z: [0.75, 0.25] } : { t: 'g', p: [id], a: id }; return; }
    if (novo) alvo.p.unshift(id); else alvo.p.push(id);
    alvo.a = id;
}

// Mostra o painel (ativa a aba; se estiver fechado, abre; se estiver solto, traz a janela para frente)
function vedShow(id) {
    const l = vedLocate(id);
    if (l && l.h !== vedMain()) {
        if (l.g.a !== id) { l.g.a = id; vedRender(); }
        try { l.h.win && l.h.win.focus(); } catch (e) {}
        return;
    }
    const m = vedMain();
    if (l && l.g.a === id && (!m.max || m.max === l.g)) return;
    if (!l) vedAddTab(id); else l.g.a = id;
    if (m.max && m.max !== vedGroupOf(id)) m.max = null;
    vedRender();
}

function vedClose(id) {
    const l = vedLocate(id);
    if (!l) return;
    if (l.h === vedMain() && vedPanelsOf(vedMain().root).length <= 1) { veToast('Precisa ficar pelo menos um painel no editor'); return; }
    l.g.p = l.g.p.filter(x => x !== id);
    delete VED.home[id];
    vedNormAll();
    vedRender();
}

function vedToggle(id) { vedLocate(id) ? vedClose(id) : vedShow(id); }

function vedVisible(id) { const el = vedPanelEl(id); return !!el && el.offsetParent !== null; }

// ── janelas soltas ──
function vedNewHost(root, b) { return { n: VED.proxN++, root, max: null, b, win: null }; }

// Título da janela solta (nomes dos painéis). Os espaços invisíveis no fim deixam o título único:
// o Python acha a janela por ele para colocá-la no monitor/posição salvos
function vedWinTitle(h) {
    return vedPanelsOf(h.root).map(vedTitle).join(' · ') + ' — Pocket Editor' + '​'.repeat(h.n);
}

// Tira o painel de onde estiver; se sair da área principal, lembra de onde saiu
function vedDetach(id) {
    const l = vedLocate(id);
    if (!l) return;
    if (l.h === vedMain()) VED.home[id] = vedHomeOf(id);
    l.g.p = l.g.p.filter(x => x !== id);
}

// Solta o painel numa janela nova. b = {x, y, w, h} em px do navegador; sem b, sobre onde ele estava
function vedFloat(id, b) {
    const l = vedLocate(id);
    if (l && l.h !== vedMain() && vedPanelsOf(l.h.root).length === 1) { try { l.h.win.focus(); } catch (e) {} return true; }
    if (l && l.h === vedMain() && vedPanelsOf(vedMain().root).length <= 1) { veToast('Precisa ficar pelo menos um painel no editor'); return false; }
    const el = VED.el[id];
    if (!b) {
        const r = el.offsetParent ? el.getBoundingClientRect() : { left: 120, top: 120, width: 520, height: 380 };
        const w = el.ownerDocument.defaultView;
        b = { x: w.screenX + r.left + 24, y: w.screenY + r.top + 24, w: Math.max(360, r.width), h: Math.max(240, r.height + 30) };
    }
    b = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
    const h = vedNewHost({ t: 'g', p: [id], a: id }, b);
    if (!vedOpenWin(h)) return false;
    vedDetach(id);
    VED.hosts.push(h);
    VED.focus = id;
    vedNormAll();
    vedRender();
    return true;
}

// Abre a janela nativa do quadro h. h.b.px = posição em pixels reais do Windows (lida pelo Python,
// vale para qualquer monitor); sem px = coordenadas do navegador (ex.: soltar a aba)
function vedOpenWin(h) {
    const b = h.b, f = b.px ? { x: 120, y: 120, w: 480, h: 360 } : b;
    let w = null;
    try { w = window.open('', 've-solta-' + h.n + '-' + Date.now(), `popup,width=${f.w},height=${f.h},left=${f.x},top=${f.y}`); } catch (e) { w = null; }
    if (!w || !w.document) { veToast('Não foi possível abrir a janela solta'); return false; }
    h.win = w;
    w._desde = Date.now();
    vedBuildFloatDoc(h);
    if (window.i18nWatch) i18nWatch(w.document);
    vedWatchFloat(h);
    const api = vedApi();
    if (api.ve_win_place) {
        // o título novo demora um pouco para chegar à janela do Windows: tenta até achar. Enquanto a janela
        // não está no lugar, a posição dela não é lida (senão gravaria o lugar provisório por cima do salvo).
        // Sem posição salva em px, só deixa a janela sempre acima da principal (ve_win_prepare)
        w._posicionando = true;
        let n = 0;
        const tenta = () => {
            if (h.win !== w) return;
            (b.px ? api.ve_win_place(vedWinTitle(h), b.x, b.y, b.w, b.h, !!b.max) : api.ve_win_prepare(vedWinTitle(h))).then(ok => {
                if (ok || ++n >= 25) { w._posicionando = false; w._desde = Date.now(); }
                else setTimeout(tenta, 120);
            }).catch(() => { w._posicionando = false; });
        };
        setTimeout(tenta, 80);
    }
    return true;
}

// Fecha a janela do quadro sem mexer no layout (os painéis dela voltam para o depósito)
function vedCloseWin(h) {
    const w = h.win;
    if (!w) return;
    h.win = null;
    const store = document.getElementById('ve-dock-store');
    vedPanelsOf(h.root).forEach(id => store.appendChild(VED.el[id]));
    try { w.close(); } catch (e) {}
}

// Lê do Windows a posição real de cada janela solta (px, com monitor) e guarda no layout
function vedRefreshBounds() {
    const api = vedApi();
    if (!api.ve_win_rect) return Promise.resolve();
    return Promise.all(vedFloats().map(h => {
        const w = h.win;
        if (!w || w._posicionando || Date.now() - (w._desde || 0) < 1200) return null;   // ainda indo para o lugar
        return api.ve_win_rect(vedWinTitle(h)).then(r => {
            if (r && h.win === w && r.w > 50 && r.h > 50) h.b = { x: r.x, y: r.y, w: r.w, h: r.h, max: !!r.max, px: true };
        }).catch(() => {});
    }));
}

// Editor aberto: abre as janelas soltas salvas. Saiu do editor: fecha (continuam salvas no layout).
function vedOpenFloats() {
    vedFloats().forEach(h => {
        if (h.win || vedOpenWin(h)) return;
        vedPanelsOf(h.root).forEach(vedDockHome);
        h.root = null;
    });
    vedNormAll();
    vedRender();
}

function vedSuspendFloats() { vedFloats().forEach(vedCloseWin); }

function vedEditorVisible(on) {
    if (VED.editor === on) return;
    VED.editor = on;
    if (on) { vedOpenFloats(); return; }
    // guarda onde as janelas estão antes de fechá-las
    vedRefreshBounds().then(() => { vedSave(); if (!VED.editor) vedSuspendFloats(); });
}

function vedBuildFloatDoc(h) {
    const w = h.win, d = w.document;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    d.close();
    [...document.documentElement.attributes].forEach(a => { if (a.name !== 'style') d.documentElement.setAttribute(a.name, a.value); });
    d.documentElement.classList.add('ve-float-html');
    d.title = vedWinTitle(h);
    // mesmos estilos, ícone e sprite de ícones da janela principal
    document.querySelectorAll('link[rel~="stylesheet"], link[rel~="icon"], style').forEach(n => {
        if (n.tagName === 'LINK') {
            const l = d.createElement('link');
            l.rel = n.rel;
            l.href = n.href;
            d.head.appendChild(l);
        } else d.head.appendChild(d.importNode(n, true));
    });
    const sprite = document.querySelector('svg symbol')?.closest('svg');
    if (sprite) d.body.appendChild(d.importNode(sprite, true));
    const root = d.createElement('div');
    root.className = 've ve-float';
    root.innerHTML = '<div class="ve-float-bar"><span title="Arraste uma aba para outro painel, ou arraste esta janela pela barra de título e solte num quadradinho laranja">Encaixar: arraste a aba ou a janela até um quadradinho laranja</span>' +
        '<button class="ve-btn ve-btn-sm ve-btn-ghost" data-dock title="Devolver os painéis desta janela ao editor (ou só feche a janela)">⤓ Encaixar no editor</button></div>' +
        '<div class="ve-dock" id="ve-dock-solta"></div>';
    d.body.appendChild(root);
    root.querySelector('[data-dock]').addEventListener('click', () => { try { w.close(); } catch (e) {} });
    vedBindDock(d.getElementById('ve-dock-solta'), h);
    // atalhos do editor funcionam com a janela solta em foco
    d.addEventListener('keydown', e => veOnKey(e));
    d.addEventListener('keyup', e => { if (e.key === 'Alt') e.preventDefault(); });
    d.addEventListener('mouseup', e => { const bt = e.target.closest('button'); if (bt) setTimeout(() => bt.blur(), 0); });
}

function vedWatchFloat(h) {
    const w = h.win;
    // tamanho mudou: redesenha (o observador precisa ser da própria janela)
    try { new w.ResizeObserver(() => veLayoutChanged()).observe(w.document.getElementById('ve-dock-solta')); } catch (e) {}
    // janela fechada pelo usuário (X): os painéis voltam para o editor, no lugar de onde saíram.
    // Os painéis saem do documento que está fechando na hora; o resto fica para depois — se quem está
    // fechando é o app inteiro, isso nunca roda e o layout salvo reabre a janela na próxima vez.
    const fechou = () => {
        if (h.win !== w) return;
        vedCloseWin(h);
        setTimeout(() => {
            if (!VED.hosts.includes(h) || h.win) return;
            VED.hosts.splice(VED.hosts.indexOf(h), 1);
            vedPanelsOf(h.root).forEach(vedDockHome);
            vedNormAll();
            vedRender();
        }, 0);
    };
    w.addEventListener('pagehide', fechou);
    // guarda posição/tamanho/monitor (a janela não avisa quando é movida); e percebe a janela fechada
    // mesmo sem o pagehide (fechar a janela do Windows nem sempre descarrega a página antes)
    let k = 0;
    const t = setInterval(() => {
        if (h.win !== w) { clearInterval(t); return; }
        if (w.closed) { clearInterval(t); fechou(); return; }
        if (++k % 3) return;
        const antes = JSON.stringify(h.b);
        vedRefreshBounds().then(() => { if (JSON.stringify(h.b) !== antes) vedSave(); });
    }, 500);
}

// Onde o painel está agora na área principal, descrito por vizinhos (aba do mesmo grupo, ou painéis ao lado)
function vedHomeOf(id) {
    const m = vedMain(), g = vedGroupOf(id);
    if (!g) return null;
    const outra = g.p.find(x => x !== id);
    if (outra) return { tab: outra, idx: g.p.indexOf(id) };
    const pai = vedParent(m.root, g);
    if (!pai) return null;
    const i = pai.c.indexOf(g), depois = pai.c[i + 1], viz = depois || pai.c[i - 1];
    const lado = pai.d === 'row' ? (depois ? 'left' : 'right') : (depois ? 'top' : 'bottom');
    const frac = pai.z[i] / ((pai.z[i] + pai.z[pai.c.indexOf(viz)]) || 1);   // tamanho que ele tinha
    return { anchors: vedPanelsOf(viz), side: lado, frac };
}

// Menor pedaço da área principal que contém todos os grupos dados (ancestral comum)
function vedCommon(groups) {
    const raiz = vedMain().root;
    const caminho = alvo => {
        const ir = (n, acc) => n === alvo ? [...acc, n] : n.t === 's' ? n.c.reduce((r, ch) => r || ir(ch, [...acc, n]), null) : null;
        return ir(raiz, []) || [];
    };
    const cs = groups.map(caminho);
    let comum = null;
    for (let k = 0; cs.every(c => c[k] && c[k] === cs[0][k]); k++) comum = cs[0][k];
    return comum;
}

// Painel voltando de uma janela solta: mesmo lugar de antes, se os vizinhos ainda estiverem no editor
function vedDockHome(id) {
    const m = vedMain(), h = VED.home[id];
    delete VED.home[id];
    const gt = h && h.tab && vedGroupOf(h.tab);
    if (gt) { gt.p.splice(Number.isInteger(h.idx) ? h.idx : gt.p.length, 0, id); gt.a = id; return; }
    const gs = [...new Set(((h && h.anchors) || []).map(vedGroupOf).filter(Boolean))];
    let alvo = gs.length && vedCommon(gs);
    if (alvo && ['left', 'right', 'top', 'bottom'].includes(h.side)) {
        // a divisão onde ele estava pode ter sido desfeita ao sair: se os vizinhos são só uma parte
        // seguida de uma divisão maior, reagrupa essa parte e encaixa o painel ao lado dela
        if (alvo.t === 's') {
            const idx = alvo.c.map((ch, i) => vedGroups(ch).every(g => gs.includes(g)) ? i : -1).filter(i => i >= 0);
            const a = idx[0], b = idx[idx.length - 1];
            if (idx.length && b - a + 1 === idx.length && idx.length < alvo.c.length &&
                vedGroups({ t: 's', c: alvo.c.slice(a, b + 1) }).length === gs.length) {
                const zs = alvo.z.slice(a, b + 1), soma = zs.reduce((x, y) => x + y, 0);
                const sub = idx.length === 1 ? alvo.c[a] : { t: 's', d: alvo.d, c: alvo.c.slice(a, b + 1), z: zs.map(z => z / soma) };
                alvo.c.splice(a, idx.length, sub);
                alvo.z.splice(a, idx.length, soma);
                alvo = sub;
            }
        }
        vedInsert(m, id, { g: alvo, side: h.side, frac: h.frac });
        return;
    }
    vedAddTab(id);
}

// Menu "Janela": workspaces, mostrar/ocultar painéis e restaurar o layout
function veDockMenu(e) {
    e.stopPropagation();
    document.querySelector('.ve-menu')?.remove();
    const m = document.createElement('div');
    m.className = 've-menu';
    const btn = e.currentTarget;
    document.body.appendChild(m);
    const posiciona = () => {
        const r = btn.getBoundingClientRect();
        m.style.top = r.bottom + 4 + 'px';
        m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + 'px';
    };
    const fechar = () => { m.remove(); document.removeEventListener('pointerdown', fora, true); };
    const fora = ev => { if (!m.contains(ev.target)) fechar(); };
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);

    const lista = () => {
        const mod = vedWsModified();
        const nSoltas = w => (vedParse(w) || { floats: [] }).floats.length;
        const ws = VED.ws.map(w => `<div class="ve-menu-row"><button data-ws="${veEsc(w.nome)}"><b>${w.nome === VED.ativo ? '●' : ''}</b>${veEsc(w.nome)}` +
            `${w.nome === VED.ativo && mod ? ' <small>(modificado)</small>' : ''}${nSoltas(w) ? ' <small>⧉' + nSoltas(w) + '</small>' : ''}</button>` +
            `<button class="ve-menu-del" data-del="${veEsc(w.nome)}" title="Excluir workspace">×</button></div>`).join('');
        m.innerHTML = '<div class="ve-menu-h">Workspaces</div>' +
            (ws || '<div class="ve-menu-empty">Nenhum salvo ainda</div>') +
            (VED.ativo && mod ? `<button data-m="ws-update"><b>↥</b>Salvar alterações em "${veEsc(VED.ativo)}"</button>` +
                                `<button data-m="ws-revert"><b>↺</b>Voltar ao "${veEsc(VED.ativo)}" salvo</button>` : '') +
            '<button data-m="ws-new"><b>+</b>Salvar estilo de workspace…</button>' +
            '<hr><div class="ve-menu-h">Painéis</div>' +
            VED.ids.map(id => {
                const l = vedLocate(id), solta = l && l.h !== vedMain();
                return `<button data-m="${id}"><b>${l ? '✓' : ''}</b>${veEsc(vedTitle(id))}${solta ? ' <small>(janela solta)</small>' : ''}</button>`;
            }).join('') + '<hr>' +
            (vedFloats().length ? '<button data-m="dock-all"><b>⤓</b>Encaixar todas as janelas soltas</button>' : '') +
            '<button data-m="reset"><b>↺</b>Restaurar layout padrão</button>';
        posiciona();
    };

    // pede o nome dentro do próprio menu (caixas de diálogo do navegador travam o WebView)
    const pedirNome = () => {
        m.innerHTML = '<div class="ve-menu-form"><label for="ve-ws-nome">Nome do workspace</label>' +
            `<input id="ve-ws-nome" maxlength="40" placeholder="ex.: Edição 2 monitores" value="${veEsc(VED.ativo || '')}" autocomplete="off">` +
            '<small>Guarda a organização dos painéis e as janelas soltas (com o monitor e a posição de cada uma). ' +
            'O Editor de Vídeo passa a abrir sempre assim.</small>' +
            '<div><button class="ve-btn ve-btn-sm ve-btn-ghost" data-f="cancel">Cancelar</button>' +
            '<button class="ve-btn ve-btn-sm ve-btn-primary" data-f="ok">Salvar</button></div></div>';
        posiciona();
        const inp = m.querySelector('input');
        inp.focus();
        inp.select();
        const ok = () => { if (inp.value.trim()) { vedWsSave(inp.value); fechar(); } else inp.focus(); };
        inp.addEventListener('keydown', ev => {
            ev.stopPropagation();
            if (ev.key === 'Enter') ok();
            else if (ev.key === 'Escape') fechar();
        });
        m.querySelector('[data-f="ok"]').addEventListener('click', ok);
        m.querySelector('[data-f="cancel"]').addEventListener('click', fechar);
    };

    m.addEventListener('click', ev => {
        if (m.querySelector('.ve-menu-form')) return;
        const del = ev.target.closest('[data-del]');
        if (del) {
            // 2 cliques para excluir
            if (del.dataset.ok) { vedWsDelete(del.dataset.del); lista(); }
            else { del.dataset.ok = '1'; del.textContent = 'Excluir?'; del.classList.add('confirm'); }
            return;
        }
        const w = ev.target.closest('[data-ws]');
        if (w) { fechar(); vedWsApply(w.dataset.ws); return; }
        const b = ev.target.closest('[data-m]');
        if (!b) return;
        const k = b.dataset.m;
        if (k === 'ws-new') { pedirNome(); return; }
        fechar();
        if (k === 'ws-update') vedWsSave(VED.ativo);
        else if (k === 'ws-revert') vedWsApply(VED.ativo);
        else if (k === 'reset') vedReset();
        else if (k === 'dock-all') vedFloats().forEach(h => { try { h.win && h.win.close(); } catch (e2) {} });
        else vedToggle(k);
    });
    lista();
}

// ── arrastar a aba: onde vai encaixar (em qualquer janela) ──
// Canto do conteúdo da janela na tela. Com um evento de ponteiro recente nela é exato; senão estima
// pelas bordas da janela (esquerda = direita = baixo no Windows)
function vedOrigin(h) {
    const w = h === vedMain() ? window : h.win, o = h._orig;
    if (o && o.sx === w.screenX && o.sy === w.screenY) return { x: o.x, y: o.y };
    const bx = Math.max(0, (w.outerWidth - w.innerWidth) / 2);
    return { x: w.screenX + bx, y: w.screenY + Math.max(0, w.outerHeight - w.innerHeight - bx) };
}
function vedTrackOrigin(h, doc) {
    const w = doc.defaultView;
    doc.addEventListener('pointermove', e => { h._orig = { x: e.screenX - e.clientX, y: e.screenY - e.clientY, sx: w.screenX, sy: w.screenY }; }, { passive: true });
}

// Janela e zona sob o ponto da tela (sx, sy). Ordem: a janela de onde saiu, as soltas, a principal
function vedHitScreen(sx, sy, src) {
    const ordem = [src, ...vedFloats().filter(h => h !== src && h.win), vedMain()].filter((h, i, a) => a.indexOf(h) === i);
    for (const h of ordem) {
        const w = h === vedMain() ? window : h.win;
        if (!w) continue;
        const o = vedOrigin(h), x = sx - o.x, y = sy - o.y;
        if (x < 0 || y < 0 || x > w.innerWidth || y > w.innerHeight) continue;
        return { h, x, y, hit: vedHit(h, x, y) };
    }
    return null;
}

// Zona do quadro sob o ponto (coordenadas da janela dele): centro de um painel (vira aba) ou a borda
// mais próxima (divide o painel); faixa na borda da área = lateral inteira
function vedHit(h, x, y) {
    const el = vedHostEl(h);
    if (!el) return null;
    const dock = el.getBoundingClientRect();
    if (x < dock.left || x > dock.right || y < dock.top || y > dock.bottom) return null;
    const E = 12;
    const bordas = { left: x - dock.left, right: dock.right - x, top: y - dock.top, bottom: dock.bottom - y };
    const lado = Object.keys(bordas).find(k => bordas[k] < E);
    if (lado && !h.max) return { h, root: true, side: lado, rect: dock };
    for (const g of el.querySelectorAll('.ve-dgroup')) {
        if (!g.offsetParent) continue;
        const r = g.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        if (y - r.top < 30) return { h, g: g._node, side: 'center', rect: r };   // barra de abas
        const rx = (x - r.left) / r.width, ry = (y - r.top) / r.height;
        const d = { left: rx, right: 1 - rx, top: ry, bottom: 1 - ry };
        const min = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
        return { h, g: g._node, side: d[min] > 0.3 ? 'center' : min, rect: r };
    }
    return null;
}

function vedHitValid(hit, id) {
    if (!hit) return false;
    const l = vedLocate(id);
    if (!l) return false;
    // a área principal nunca fica vazia
    if (l.h === vedMain() && hit.h !== vedMain() && vedPanelsOf(vedMain().root).length <= 1) return false;
    if (hit.root) return !(hit.h === l.h && vedPanelsOf(l.h.root).length === 1);
    if (hit.g !== l.g) return true;
    return hit.side !== 'center' && l.g.p.length > 1;   // o próprio grupo: só dá para dividir se tiver outras abas
}

// Retângulo que acende mostrando onde o painel vai ficar
function vedDropRect(hit) {
    const r = hit.rect, f = hit.root ? 0.25 : 0.5;
    const o = { left: r.left, top: r.top, width: r.width, height: r.height };
    if (hit.side === 'left') o.width = r.width * f;
    if (hit.side === 'right') { o.width = r.width * f; o.left = r.right - o.width; }
    if (hit.side === 'top') o.height = r.height * f;
    if (hit.side === 'bottom') { o.height = r.height * f; o.top = r.bottom - o.height; }
    return o;
}

function vedMove(id, hit) {
    if (!vedHitValid(hit, id)) return;
    vedDetach(id);
    vedInsert(hit.h, id, hit);
    if (hit.h === vedMain()) delete VED.home[id];
    VED.focus = id;
    hit.h.max = null;
    vedNormAll();
    vedRender();
    if (hit.h !== vedMain()) { try { hit.h.win.focus(); } catch (e) {} }
}

// Coloca o painel (fora de qualquer layout) no alvo do quadro h: centro de um grupo, borda de um
// grupo ou lateral da área
function vedInsert(h, id, hit) {
    const novo = { t: 'g', p: [id], a: id };
    const d = hit.side === 'left' || hit.side === 'right' ? 'row' : 'col';
    const antes = hit.side === 'left' || hit.side === 'top';
    if (!h.root) { h.root = novo; return; }
    if (hit.root) {
        h.root = { t: 's', d, c: antes ? [novo, h.root] : [h.root, novo], z: antes ? [0.25, 0.75] : [0.75, 0.25] };
    } else if (hit.side === 'center') {
        hit.g.p.push(id);
        hit.g.a = id;
    } else {
        const pai = vedParent(h.root, hit.g);
        if (pai && pai.d === d && !hit.frac) {
            const i = pai.c.indexOf(hit.g), meio = pai.z[i] / 2;
            pai.z[i] = meio;
            pai.c.splice(antes ? i : i + 1, 0, novo);
            pai.z.splice(antes ? i : i + 1, 0, meio);
        } else {
            const f = hit.frac > 0.05 && hit.frac < 0.95 ? hit.frac : 0.5;
            const sp = { t: 's', d, c: antes ? [novo, hit.g] : [hit.g, novo], z: antes ? [f, 1 - f] : [1 - f, f] };
            if (!pai) h.root = sp;
            else pai.c[pai.c.indexOf(hit.g)] = sp;
        }
    }
}

// ── eventos ──
function vedInit() {
    document.querySelectorAll('.ve-panel[data-panel]').forEach(el => { VED.ids.push(el.dataset.panel); VED.el[el.dataset.panel] = el; });
    VED.hosts = [{ n: 0, root: null, max: null }];
    let ls = null;
    try { ls = JSON.parse(veLsGet(VED_KEY) || 'null'); } catch (e) { ls = null; }
    vedApply(ls);
    vedLoadFile();
    vedBindDock(document.getElementById('ve-dock'), vedMain());
    vedWatchMoves();
    // o app fechando: as janelas soltas vão junto, sem mexer no layout salvo
    window.addEventListener('pagehide', () => vedSuspendFloats());
}

// Eventos de uma área de painéis (a principal ou a de uma janela solta)
function vedBindDock(dock, h) {
    vedTrackOrigin(h, dock.ownerDocument);
    // painel com foco (contorno laranja na aba, como o azul do Premiere)
    dock.addEventListener('pointerdown', e => {
        const g = e.target.closest('.ve-dgroup');
        if (!g || VED.focus === g._node.a) return;
        VED.focus = g._node.a;
        VED.hosts.forEach(x => vedHostEl(x)?.querySelectorAll('.ve-dgroup').forEach(y => y.classList.toggle('focus', y === g)));
    }, true);
    dock.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (e.target.closest('[data-close], [data-float]')) { e.stopPropagation(); return; }
        const sash = e.target.closest('.ve-sash');
        if (sash) { vedSashDrag(e, sash); return; }
        const tab = e.target.closest('.ve-dtab');
        if (tab) vedTabDrag(e, tab);
    });
    dock.addEventListener('click', e => {
        const x = e.target.closest('[data-close]');
        if (x) vedClose(x.dataset.close);
        const f = e.target.closest('[data-float]');
        if (f) vedFloat(f.dataset.float);
    });
    dock.addEventListener('dblclick', e => {
        const tab = e.target.closest('.ve-dtab');
        if (!tab || e.target.closest('[data-close], [data-float]')) return;
        const g = tab.closest('.ve-dgroup');
        g._host.max = g._host.max === g._node ? null : g._node;
        vedRender();
    });
}

// Guias do arraste (fantasma, zonas, retângulo de encaixe) — uma cópia em cada janela
function vedGuides(doc) {
    if (doc._vedGuias && doc._vedGuias.drop.isConnected) return doc._vedGuias;
    const ghost = doc.createElement('div');
    ghost.className = 've-dghost';
    const zones = doc.createElement('div');
    zones.className = 've-dzones';
    // centro + 4 trapézios, como os guias de encaixe do Premiere
    zones.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
        '<path d="M30 30H70V70H30Z"/><path d="M0 0L30 30V70L0 100Z"/><path d="M100 0L70 30V70L100 100Z"/>' +
        '<path d="M0 0L30 30H70L100 0Z"/><path d="M0 100L30 70H70L100 100Z"/></svg>';
    const drop = doc.createElement('div');
    drop.className = 've-ddrop';
    const compass = doc.createElement('div');
    compass.className = 've-dcompass';
    [ghost, zones, drop, compass].forEach(el => { el.hidden = true; doc.body.appendChild(el); });
    doc._vedGuias = { ghost, zones, drop, compass };
    return doc._vedGuias;
}
function vedHideGuides() {
    VED.hosts.forEach(h => { const d = vedHostDoc(h); if (d && d._vedGuias) Object.values(d._vedGuias).forEach(el => { el.hidden = true; }); });
}
const vedPx = (el, o) => Object.assign(el.style, { left: o.left + 'px', top: o.top + 'px', width: o.width + 'px', height: o.height + 'px' });

function vedTabDrag(e, tab) {
    const id = tab.dataset.p, gEl = tab.closest('.ve-dgroup'), g = gEl._node, src = gEl._host;
    const doc = tab.ownerDocument, win = doc.defaultView;
    const x0 = e.clientX, y0 = e.clientY;
    tab.setPointerCapture(e.pointerId);   // o soltar chega mesmo fora da janela
    let on = false, alvo = null, soltar = false;
    const move = ev => {
        if (!on) {
            if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
            on = true;
            VED.hosts.forEach(h => { const d = vedHostDoc(h); if (d) d.body.classList.add('ve-docking'); });
        }
        // a janela de origem sabe exatamente onde está (evento dela)
        src._orig = { x: ev.screenX - ev.clientX, y: ev.screenY - ev.clientY, sx: win.screenX, sy: win.screenY };
        alvo = vedHitScreen(ev.screenX, ev.screenY, src);
        soltar = ev.ctrlKey || !alvo || !alvo.hit;
        vedHideGuides();
        // fantasma na janela sob o ponteiro (ou na de origem, se estiver fora de todas)
        const gd = alvo ? vedGuides(vedHostDoc(alvo.h)) : vedGuides(doc);
        const gx = alvo ? alvo.x : ev.clientX, gy = alvo ? alvo.y : ev.clientY;
        gd.ghost.hidden = false;
        gd.ghost.textContent = (soltar ? '⧉ ' : '') + vedTitle(id) + (soltar ? ' — nova janela solta' : '');
        gd.ghost.classList.toggle('solta', soltar);
        gd.ghost.style.left = gx + 12 + 'px';
        gd.ghost.style.top = gy + 10 + 'px';
        if (soltar) return;
        const hit = alvo.hit;
        if (!hit.root) { gd.zones.hidden = false; vedPx(gd.zones, hit.rect); }
        if (vedHitValid(hit, id)) { gd.drop.hidden = false; vedPx(gd.drop, vedDropRect(hit)); }
    };
    const up = ev => {
        win.removeEventListener('pointermove', move);
        win.removeEventListener('pointerup', up);
        win.removeEventListener('keydown', esc, true);
        if (!on) {   // foi só um clique: troca de aba
            if (g.a !== id) { g.a = id; VED.focus = id; vedRender(); }
            return;
        }
        VED.hosts.forEach(h => { const d = vedHostDoc(h); if (d) d.body.classList.remove('ve-docking'); });
        vedHideGuides();
        if (!ev) return;   // Esc
        if (soltar) {
            const r = VED.el[id].getBoundingClientRect();
            // posição em px do navegador; em outro monitor a janela vai para perto e o Python corrige na leitura
            vedFloatAt(id, { x: ev.screenX - 40, y: ev.screenY - 16, w: Math.max(360, r.width || 520), h: Math.max(240, (r.height || 380) + 30) });
        } else vedMove(id, alvo.hit);
    };
    const esc = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); up(null); } };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
    win.addEventListener('keydown', esc, true);
}

// ── mover a janela solta pela barra de título do Windows (como no Visual Studio) ──
// Nesse arraste a página não recebe eventos: o Python informa o cursor e o botão (ve_win_hit).
// Com a janela andando e o botão apertado, aparece uma bússola no painel sob o cursor (centro + 4 lados)
// e nas bordas da área; soltar em cima de um quadradinho encaixa a janela inteira ali. Soltar fora dos
// quadradinhos só muda a janela de lugar (mover janela não encaixa sem querer).
function vedWatchMoves() {
    setInterval(() => {
        if (!VED.editor || VED.mv) return;
        vedFloats().forEach(h => {
            const w = h.win;
            if (!w || w.closed || w._posicionando) { h._pos = null; return; }
            const p = w.screenX + ',' + w.screenY;
            if (h._pos && h._pos !== p && !VED.mv) vedMoveTrack(h);
            h._pos = p;
        });
    }, 120);
}

function vedHostTitle(h) { return h === vedMain() ? document.title : vedWinTitle(h); }

function vedMoveTrack(h) {
    const api = vedApi();
    if (!api.ve_win_hit) return;
    const mv = VED.mv = { h, hit: null, primeiro: true };
    const titulo = vedWinTitle(h);
    const fim = hit => {
        if (VED.mv !== mv) return;
        VED.mv = null;
        vedHideGuides();
        if (mv.transp && api.ve_win_alpha) api.ve_win_alpha(titulo, 1);
        if (hit) vedMoveHost(h, hit);
    };
    const tick = () => {
        if (VED.mv !== mv || !h.win) { fim(null); return; }
        const alvos = VED.hosts.filter(x => x !== h && (x === vedMain() || x.win));
        api.ve_win_hit(alvos.map(vedHostTitle), vedWinTitle(h)).then(r => {
            if (VED.mv !== mv) return;
            // botão solto: termina (na 1ª leitura já solto = janela movida por outro motivo, ignora)
            if (!r || !r.down) { fim(mv.primeiro ? null : mv.hit); return; }
            mv.primeiro = false;
            // janela meio transparente durante o arraste: dá para ver a bússola embaixo dela
            if (!mv.transp && api.ve_win_alpha) { mv.transp = true; api.ve_win_alpha(titulo, 0.55); }
            const alvo = r.titulo && alvos.find(x => vedHostTitle(x) === r.titulo);
            vedHideGuides();
            const w = alvo && (alvo === vedMain() ? window : alvo.win);
            mv.hit = alvo && w ? vedCompass(alvo, r.x / w.devicePixelRatio, r.y / w.devicePixelRatio) : null;
            setTimeout(tick, 40);
        }).catch(() => fim(null));
    };
    tick();
}

// Desenha a bússola no quadro t para o ponto (x, y) da janela dele; devolve o alvo se o cursor está
// em cima de um quadradinho
function vedCompass(t, x, y) {
    const el = vedHostEl(t);
    if (!el) return null;
    const gd = vedGuides(el.ownerDocument), S = 34, G = 42;
    const dock = el.getBoundingClientRect();
    const alvos = [
        { root: true, side: 'left', cx: dock.left + 24, cy: dock.top + dock.height / 2, rect: dock },
        { root: true, side: 'right', cx: dock.right - 24, cy: dock.top + dock.height / 2, rect: dock },
        { root: true, side: 'top', cx: dock.left + dock.width / 2, cy: dock.top + 24, rect: dock },
        { root: true, side: 'bottom', cx: dock.left + dock.width / 2, cy: dock.bottom - 24, rect: dock },
    ];
    const g = [...el.querySelectorAll('.ve-dgroup')].find(n => {
        const r = n.getBoundingClientRect();
        return n.offsetParent && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    if (g) {
        const r = g.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        [['center', cx, cy], ['left', cx - G, cy], ['right', cx + G, cy], ['top', cx, cy - G], ['bottom', cx, cy + G]]
            .forEach(([side, a, b]) => alvos.push({ g: g._node, side, cx: a, cy: b, rect: r }));
    }
    const on = alvos.find(a => Math.abs(x - a.cx) <= S / 2 && Math.abs(y - a.cy) <= S / 2);
    const seta = { center: '■', left: '◀', right: '▶', top: '▲', bottom: '▼' };
    gd.compass.innerHTML = alvos.map(a => `<i class="${a.root ? 'root' : ''}${a === on ? ' on' : ''}" ` +
        `style="left:${a.cx - S / 2}px;top:${a.cy - S / 2}px;width:${S}px;height:${S}px">${seta[a.side]}</i>`).join('');
    gd.compass.hidden = false;
    if (!on) return null;
    const hit = on.root ? { h: t, root: true, side: on.side, rect: dock } : { h: t, g: on.g, side: on.side, rect: on.rect };
    gd.drop.hidden = false;
    vedPx(gd.drop, vedDropRect(hit));
    return hit;
}

// Encaixa todos os painéis da janela solta src no alvo (juntos, como abas)
function vedMoveHost(src, hit) {
    if (!VED.hosts.includes(src) || hit.h === src) return;
    const ids = vedPanelsOf(src.root);
    if (!ids.length) return;
    src.root = null;
    vedInsert(hit.h, ids[0], hit);
    const g = vedGroups(hit.h.root).find(x => x.p.includes(ids[0]));
    ids.slice(1).forEach(id => g.p.push(id));
    g.a = ids[0];
    if (hit.h === vedMain()) ids.forEach(id => { delete VED.home[id]; });
    VED.focus = ids[0];
    hit.h.max = null;
    vedNormAll();
    vedRender();
    veToast(ids.map(vedTitle).join(' + ') + ' encaixado');
}

// Nova janela solta com o painel no ponto da tela (arrastar para fora)
function vedFloatAt(id, b) {
    const l = vedLocate(id);
    // já é o único painel de uma janela solta: só move a janela
    if (l && l.h !== vedMain() && vedPanelsOf(l.h.root).length === 1) {
        try { l.h.win.moveTo(b.x, b.y); } catch (e) {}
        return;
    }
    vedFloat(id, b);
}

// Divisa entre dois painéis: arrasta e redistribui as frações dos dois vizinhos
function vedSashDrag(e, sash) {
    e.preventDefault();
    const n = sash._split, i = sash._i, row = n.d === 'row', doc = sash.ownerDocument;
    const a = sash.previousElementSibling, b = sash.nextElementSibling;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const sa = row ? ra.width : ra.height, sb = row ? rb.width : rb.height;
    const tot = sa + sb, ftot = n.z[i - 1] + n.z[i];
    const minOf = el => parseFloat(doc.defaultView.getComputedStyle(el)[row ? 'minWidth' : 'minHeight']) || 80;
    const ma = Math.max(30, minOf(a)), mb = Math.max(30, minOf(b));
    const p0 = row ? e.clientX : e.clientY;
    sash.setPointerCapture(e.pointerId);
    sash.classList.add('on');
    doc.body.classList.add(row ? 've-resizing-x' : 've-resizing-y');
    const move = ev => {
        const na = Math.min(Math.max(sa + (row ? ev.clientX : ev.clientY) - p0, ma), tot - mb);
        n.z[i - 1] = ftot * na / tot;
        n.z[i] = ftot - n.z[i - 1];
        a.style.flex = `${n.z[i - 1]} 1 0px`;
        b.style.flex = `${n.z[i]} 1 0px`;
    };
    const up = () => {
        sash.removeEventListener('pointermove', move);
        sash.removeEventListener('pointerup', up);
        sash.classList.remove('on');
        doc.body.classList.remove('ve-resizing-x', 've-resizing-y');
        vedSave();
    };
    sash.addEventListener('pointermove', move);
    sash.addEventListener('pointerup', up);
}

document.addEventListener('DOMContentLoaded', vedInit);
