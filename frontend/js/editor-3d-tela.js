// Tela da Cena 3D (como a Comp: duplo clique na faixa da cena na timeline, ou "Abrir a tela 3D" nas Propriedades).
// Visor com a câmera da cena (arrastar = orbitar e GRAVA na câmera; rodinha = distância; botão do meio ou Shift =
// deslocar) ou vista livre (C: só olha, não grava). Clique num objeto = seleciona com setas (W mover, E girar, R escala).
// Lista de objetos, propriedades do selecionado (ve3dPainelHtml) e régua de tempo com os ◆ dele.
// Edição: Delete tira, Ctrl+D duplica, H esconde/mostra, F enquadra o selecionado (vista livre), Q eixo local/mundo,
// Ctrl segurado ao arrastar as setas = ímã (0,1 / 15° / 0,1), duplo clique no nome renomeia, arquivo 3D solto entra na cena.
// Mesmo runtime da prévia (ve3dAplicar) com câmera própria; desenha só quando algo muda e em resolução menor mexendo.
// Quadros-chave como no editor (editor-keyframes.js): clique seleciona o ◆ (Shift/Ctrl soma), retângulo no vazio
// seleciona vários, arrastar move (Alt duplica), Delete apaga só os ◆, Ctrl+C / Ctrl+V cola na agulha, botão direito
// = interpolação, F9 Easy Ease (Shift+F9 entrada, Ctrl+Shift+F9 saída), Esc tira a seleção. ◆ = o objeto inteiro
// naquele tempo (todas as propriedades dele).
const VE3T = { el: null, mid: -1, so: 'camera', livre: false, vista: null, cam: null, hs: null, tc: null, rt: null, chave: '', dados: '', raf: 0, play: null, arr: null, mexendo: false, saida: {}, kfSel: [], kfClip: null, abertos: new Set(), curvaSel: '' };

// ícones (traço 1,6, 24×24) da Lux Kanivete: barra de ferramentas, cena, abas
const VE3T_ICO = (() => {
    const s = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    return {
        mover: s('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
        girar: s('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>'),
        escala: s('<rect x="4" y="10" width="10" height="10" rx="1"/><path d="M13 4h7v7M20 4l-8 8"/>'),
        enquadrar: s('<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="2.5"/>'),
        mais: s('<path d="M12 5v14M5 12h14"/>'),
        camera: s('<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
        mundo: s('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.7 2.6 14.3 0 17M12 3.5c-2.6 2.7-2.6 14.3 0 17"/>'),
        caixa: s('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>'),
        luz: s('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
        forma: s('<circle cx="12" cy="12" r="8"/><path d="M4.5 10c3 2 12 2 15 0"/>'),
        imagem: s('<rect x="4" y="5" width="16" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.5"/><path d="M20 16l-5-5-8 8"/>'),
        render: s('<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8M12 17v4"/>'),
        material: s('<circle cx="12" cy="12" r="8"/><path d="M8.5 9.5a4 4 0 0 1 3-2" stroke-width="2.2"/>'),
        objeto: s('<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5"/>'),
        olho: s('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
        olhoNao: s('<path d="M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.3M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/>'),
    };
})();
const ve3dTelaMidia = () => VE.media[VE3T.mid];
const ve3dTelaClipe = () => VE.clips.find(x => veMediaOf(x) === ve3dTelaMidia()) || null;
const ve3dTelaT = c => Math.max(0, veSrcAt(c, VE.playhead));   // tempo dentro da cena

function ve3dTelaMontar() {
    const el = document.createElement('div'); el.className = 've ve3t';   // .ve: as variáveis de cor do editor (o overlay fica no body) el.hidden = true;
    const I = VE3T_ICO;
    el.innerHTML = `<div class="ve3t-topo"><b data-3t="titulo"></b><nav class="lux-menus" data-3t="menus"></nav><span class="ve3t-esp"></span>
        <button class="ve-btn ve-btn-sm lux-render" data-3trender title="${veT('Foto ou vídeo de estúdio da cena (Blender): gel, ranhuras, softbox, cenário na cor da marca')}">${I.camera}<span>${veT('Render')}</span></button>
        <button class="ve-btn ve-btn-sm ve-btn-ghost" data-3teditor hidden title="${veT('Ver esta cena na timeline do Editor Kanivete')}">${veT('Abrir no Editor')}</button>
        <button class="ve-btn ve-btn-sm ve-btn-ghost" data-3tfechar title="${veT('Fechar')} (Esc)">${veT('Voltar à timeline')}</button></div>
        <div class="ve3t-ferr">
            <button class="ve3t-fb" data-3tmodo="translate" title="${veT('Mover')} (W)">${I.mover}</button>
            <button class="ve3t-fb" data-3tmodo="rotate" title="${veT('Girar')} (E)">${I.girar}</button>
            <button class="ve3t-fb" data-3tmodo="scale" title="${veT('Escala')} (R)">${I.escala}</button><i class="ve3t-fsep"></i>
            <button class="ve3t-fb" data-3tenq title="${veT('Enquadrar o selecionado')} (F)">${I.enquadrar}</button>
            <button class="ve3t-fb" data-luxmenu="adicionar" title="${veT('Adicionar')} (Shift+A)">${I.mais}</button></div>
        <div class="ve3t-visor" data-3t="visor"><div class="ve3t-vhead">
            <div class="ve3t-seg"><button data-3tvista="cena" title="${veT('Câmera da cena: arrastar no visor grava na câmera (C alterna)')}">${veT('Câmera da cena')}</button><button data-3tvista="livre" title="${veT('Vista livre: só olha, não grava na câmera (C alterna)')}">${veT('Vista livre')}</button></div>
            <div class="ve3t-seg"><button data-3tsomb="solido" title="${veT('Sólido: argila cinza, leve para montar e posicionar')}">${veT('Sólido')}</button><button data-3tsomb="material" class="on" title="${veT('Material: a prévia com materiais, rótulo e luzes')}">${veT('Material')}</button></div>
            <span class="ve3t-esp"></span>
            <div class="ve3t-seg"><button data-3tespaco title="${veT('Setas no eixo do objeto ou do mundo')} (Q)">${veT('Eixo: mundo')}</button><button data-3tima title="${veT('Ímã: passos de 0,1 / 15° (ou segure Ctrl)')}">${veT('Ímã')}</button></div></div>
            <canvas></canvas><div class="ve3t-dica">${veT('Arrastar: orbitar · Rodinha: distância · Shift ou botão do meio: deslocar · Clique: selecionar · Shift+A: adicionar · solte .glb/.obj/.fbx aqui')}</div></div>
        <div class="ve3t-direita"><div class="ve3t-sec-tit">${veT('Cena')}</div><div class="ve3t-lista" data-3t="lista"></div>
            <div class="ve3t-abas" data-3t="abas"></div><div class="ve3t-lado" data-3t="lado"></div></div>
        <div class="ve3t-divisa" data-3t="divisa" title="${veT('Arraste para dar mais espaço ao visor ou às faixas (duplo clique volta ao automático)')}"></div>
        <div class="ve3t-tempo"><div class="ve3t-ctl"><button class="ve-btn ve-btn-sm" data-3tplay title="${veT('Play/pausa')} (${veT('Espaço')})">▶</button>
            <button class="ve-btn ve-btn-sm ve-btn-ghost" data-3tpular="-1" title="${veT('Quadro-chave anterior do objeto selecionado')}">‹◆</button><button class="ve-btn ve-btn-sm ve-btn-ghost" data-3tpular="1" title="${veT('Próximo quadro-chave do objeto selecionado')}">◆›</button>
            <span class="ve3t-hora" data-3t="hora"></span></div>
            <div class="ve3t-regua"><input type="range" data-3t="regua" min="0" max="1" step="0.001" title="${veT('Arraste para mudar o tempo')}"></div>
            <div class="ve3t-faixas" data-3t="faixas" title="${veT('◆: clique seleciona (Shift soma) · arrastar move (Alt duplica) · retângulo no vazio seleciona vários · Delete apaga · Ctrl+C / Ctrl+V · botão direito: interpolação · F9 Easy Ease · ▸ ou U: propriedades')}"></div></div>`;
    document.body.appendChild(el);
    const q = k => el.querySelector(`[data-3t="${k}"]`);
    Object.assign(VE3T, { el, lista: q('lista'), visor: q('visor'), lado: q('lado'), abas: q('abas'), menus: q('menus'), hora: q('hora'), regua: q('regua'), faixas: q('faixas'), titulo: q('titulo'), cv: el.querySelector('.ve3t-visor canvas') });
    if (typeof luxMontarMenus === 'function') luxMontarMenus(VE3T.menus);
    el.addEventListener('click', e => {
        const b = e.target.closest('[data-3teditor],[data-3trender],[data-3tabrir],[data-3tolho],[data-3tsel],[data-3tadd],[data-3tvista],[data-3tmodo],[data-3tespaco],[data-3tima],[data-3tenq],[data-3tfechar],[data-3tplay],[data-3tpular]'); if (!b) return;
        const d = b.dataset;
        if (d['3teditor'] != null) { if (typeof luxParaEditor === 'function') luxParaEditor(); }
        else if (d['3trender'] != null) ve3dEstudioMenu(b);
        else if (d['3tabrir'] != null) ve3dTelaAbrirProps(d['3tabrir']);
        else if (d['3tolho'] != null) ve3dTelaEsconder(d['3tolho']);
        else if (d['3tsel'] != null) ve3dTelaSelecionar(d['3tsel']);
        else if (d['3tadd'] != null) ve3dTelaAdicionar(d['3tadd']);
        else if (d['3tespaco'] != null) ve3dTelaEspaco();
        else if (d['3tima'] != null) ve3dTelaIma(!VE3T.ima);
        else if (d['3tenq'] != null) ve3dTelaEnquadrar();
        else if (d['3tpular'] != null) ve3dKfPular(+d['3tpular']);
        else if (d['3tvista'] != null) ve3dTelaLivre(d['3tvista'] === 'livre');
        else if (d['3tmodo'] != null) ve3dTelaModo(d['3tmodo']);
        else if (d['3tfechar'] != null) ve3dTelaFechar();
        else if (d['3tplay'] != null) ve3dTelaPlay();
    });
    // propriedades: os mesmos eventos do painel Propriedades (ve3dEvento usa o clipe selecionado)
    const sel = () => { const c = ve3dTelaClipe(); if (c) VE.sel = VE.clips.indexOf(c); return !!c; };
    VE3T.lado.addEventListener('input', e => { const p = e.target.closest('[data-p3d],[data-p3dcena],[data-p3dfonte]'); if (p && sel()) ve3dEvento(p, 'input'); });
    VE3T.lado.addEventListener('change', e => { const p = e.target.closest('[data-p3d],[data-p3dcena],[data-p3dfonte],[data-p3dparte]'); if (p && sel()) ve3dEvento(p, 'fim'); });
    VE3T.lista.addEventListener('dblclick', e => { const b = e.target.closest('[data-3tsel]'); if (b && !['camera', 'luz', 'cenario'].includes(b.dataset['3tsel'])) ve3dTelaRenomear(b); });
    VE3T.lado.addEventListener('click', e => { const p = e.target.closest('[data-p3dkf],[data-p3dacao]'); if (p && sel()) ve3dEvento(p, 'clique'); });
    VE3T.regua.addEventListener('input', () => { ve3dTelaParar(); veSeek(+VE3T.regua.value); });
    // sempre pela global (e => f(e)): editor-3d-mexer.js envolve e tools/aplicar.py troca sem montar a tela de novo
    VE3T.faixas.addEventListener('pointerdown', e => ve3dTelaKfApertar(e));
    VE3T.faixas.addEventListener('contextmenu', e => ve3dKfMenuAbrir(e));
    VE3T.lado.addEventListener('pointerdown', e => ve3dCurvaApertar(e));
    VE3T.lado.addEventListener('dblclick', e => { if (!e.target.closest('canvas[data-3tcurva]') || !ve3dCurvaAlvo()) return; ve3dKfInterp('linear'); });
    const div = q('divisa');
    div.addEventListener('pointerdown', e => ve3dDivisaApertar(e));
    div.addEventListener('dblclick', () => ve3dTelaAltura(0, true));
    try { const h = +localStorage.getItem('ve3t-tempo-h'); if (h) ve3dTelaAltura(h); } catch (e) { /* sem armazenamento */ }
    const cv = VE3T.cv;
    cv.addEventListener('pointerdown', e => ve3dTelaApertar(e));
    cv.addEventListener('wheel', e => ve3dTelaRodinha(e), { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => ve3dTelaTecla(e), true);
    window.addEventListener('keyup', e => { if (e.key === 'Control' && VE3T.el && !VE3T.el.hidden) ve3dTelaIma(VE3T.ima, false); }, true);
}
// adicionar na cena (menu Adicionar, Shift+A, lista): arquivo | luz:estudio | luz:<tipo> | emb:<produto> | <forma>
function ve3dTelaAdicionar(k) {
    const m = ve3dTelaMidia(); if (!ve3dEh(m)) return;
    const erro = e => veToast(e.message || String(e));
    if (k === 'arquivo') { ve3dImportarUi(); return; }
    if (k === 'luz:estudio') { VE3DAPI.estudio3pontos({ cena: m.id }).then(r => ve3dTelaSelecionar(r.ids[0])).catch(erro); return; }
    if (k.startsWith('luz:')) { VE3DAPI.luz({ tipo: k.slice(4), cena: m.id }).then(r => ve3dTelaSelecionar(r.id)).catch(erro); return; }
    if (k.startsWith('emb:')) { VE3DAPI.modelo({ embalagem: k.slice(4), cena: m.id }).then(r => ve3dTelaSelecionar(r.id)).catch(erro); return; }
    VE3DAPI.modelo({ forma: k, cena: m.id, cor: VE3D_CORES[k] }).then(r => ve3dTelaSelecionar(r.id)).catch(erro);
}
// ── edição ──
function ve3dTelaIma(sim, ctrl = false) {   // ímã ligado (botão) ou Ctrl segurado: passos fixos nas setas
    VE3T.ima = sim; const tc = VE3T.tc, on = sim || ctrl;
    if (tc) { tc.setTranslationSnap(on ? 0.1 : null); tc.setRotationSnap(on ? Math.PI / 12 : null); tc.setScaleSnap(on ? 0.1 : null); }
    const b = VE3T.el && VE3T.el.querySelector('[data-3tima]'); if (b) b.classList.toggle('on', !!sim);
}
function ve3dTelaEspaco() {
    const tc = VE3T.tc; if (!tc) return;
    tc.setSpace(tc.space === 'local' ? 'world' : 'local');
    const b = VE3T.el.querySelector('[data-3tespaco]'); if (b) b.textContent = tc.space === 'local' ? veT('Eixo: objeto') : veT('Eixo: mundo');
    VE3T.chave = '';
}
const ve3dTelaModeloSel = () => { const m = ve3dTelaMidia(); return ve3dEh(m) && m.c3d.modelos.find(x => x.id === VE3T.so) || null; };
function ve3dTelaEsconder(id) {
    const m = ve3dTelaMidia(), md = ve3dEh(m) && m.c3d.modelos.find(x => x.id === id); if (!md) return;
    vePushHistory(); delete md.kf.visivel; md.p.visivel = md.p.visivel === 0 ? 1 : 0; ve3dMudou(m); ve3dTelaLado();
}
function ve3dTelaApagar() {
    const md = ve3dTelaModeloSel(); if (!md) return;
    VE3DAPI.remover(md.id, VE3T.mid); VE3T.so = 'camera'; ve3dTelaGizmo(); ve3dTelaLado();
}
function ve3dTelaDuplicar() {
    const md = ve3dTelaModeloSel(); if (!md) return;
    const r = VE3DAPI.duplicar(md.id, VE3T.mid); ve3dTelaSelecionar(r.id);
}
function ve3dTelaRenomear(b) {
    const m = ve3dTelaMidia(), id = b.dataset['3tsel'], md = m.c3d.modelos.find(x => x.id === id); if (!md) return;
    const inp = document.createElement('input'); inp.className = 've3t-nome'; inp.value = md.nome || '';
    b.replaceWith(inp); inp.focus(); inp.select();
    let feito = false;
    const fim = ok => { if (feito) return; feito = true; if (ok) VE3DAPI.renomear(id, inp.value, VE3T.mid); ve3dTelaLado(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
    inp.addEventListener('blur', () => fim(true));
}
function ve3dTelaEnquadrar() {   // F: vista livre olhando para o selecionado (ou a cena toda), sem mexer na câmera da cena
    const rt = VE3T.rt, T = VE3T.T; if (!rt) return;
    const o = rt.objs.find(x => x.md.id === VE3T.so), alvos = o ? [o] : rt.objs.filter(x => x.raiz.visible); if (!alvos.length) return;
    const b = new T.Box3(); alvos.forEach(x => b.expandByObject(x.raiz));
    const c = b.getCenter(new T.Vector3()), r = Math.max(0.2, b.getSize(new T.Vector3()).length() / 2);
    ve3dTelaLivre(true);
    VE3T.vista.alvo = c; VE3T.vista.d = Math.min(60, r / Math.sin((VE3T.cam.fov || 32) * Math.PI / 360) * 1.15); VE3T.chave = '';
}

async function ve3dTelaAbrir(c) {
    const m = c && veMediaOf(c); if (!ve3dEh(m)) return false;
    if (VE.playing) veStop();
    if (!VE3T.el) ve3dTelaMontar();
    VE3T.mid = m.id; VE.sel = VE.clips.indexOf(c); VE3T.so = 'camera'; VE3T.chave = ''; VE3T.dados = ''; VE3T.vista = null; VE3T.kfSel = [];
    if (VE.playhead < c.st || VE.playhead >= veEnd(c)) veSeek(c.st);
    const { T } = await ve3dLib(); VE3T.T = T;
    if (!VE3T.cam) { VE3T.cam = new T.PerspectiveCamera(32, 1, 0.05, 200); VE3T.hs = new T.Scene(); }
    VE3T.el.hidden = false;
    if (typeof ve3dTelaTitulo === 'function') ve3dTelaTitulo();
    else VE3T.titulo.innerHTML = `<span class="app-logo al-lk">Lk</span>Lux Kanivete <small>· ${veEsc(m.name || veT('Cena 3D'))}</small>`;
    const fe = VE3T.el.querySelector('[data-3tfechar]'), ed = VE3T.el.querySelector('[data-3teditor]');
    if (fe) fe.textContent = VE3T.lux ? veT('Fechar') : veT('Voltar à timeline');
    if (ed) ed.hidden = !VE3T.lux;
    try { await ve3dGarantir(m); } catch (e) { veToast(e.message || String(e)); }
    await ve3dTelaGizmo(true);
    ve3dTelaModo(VE3T.tc ? VE3T.tc.mode : 'translate'); ve3dTelaLivre(false); ve3dTelaLado();
    cancelAnimationFrame(VE3T.raf); VE3T.raf = requestAnimationFrame(ve3dTelaLaco);
    return true;
}
function ve3dTelaFechar() {
    if (!VE3T.el || VE3T.el.hidden) return;
    ve3dTelaParar(); VE3T.el.hidden = true; cancelAnimationFrame(VE3T.raf);
    if (VE3T.tc) VE3T.tc.detach();
    const m = ve3dTelaMidia(); if (ve3dEh(m)) ve3dMudou(m);
    ve3dPainel();
    if (VE3T.lux) { VE3T.lux = false; if (typeof luxSaiu === 'function') luxSaiu(); }   // aberta pela Lux: volta para onde estava
}
function ve3dTelaSelecionar(id) { VE3T.so = id; ve3dTelaGizmo(); ve3dTelaLado(); }
function ve3dTelaLivre(sim) {
    if (sim && !VE3T.vista) {   // a vista livre começa onde a câmera da cena está
        const s = VE3T.saida, p = VE3T.cam.position, a = s.alvo || new VE3T.T.Vector3(0, 0.5, 0), v = p.clone().sub(a), d = v.length() || 4;
        VE3T.vista = { az: Math.atan2(v.x, v.z), el: Math.asin(Math.max(-1, Math.min(1, v.y / d))), d, alvo: a.clone() };
    }
    VE3T.livre = sim;
    VE3T.el.querySelectorAll('[data-3tvista]').forEach(b => b.classList.toggle('on', (b.dataset['3tvista'] === 'livre') === sim));
}
function ve3dTelaModo(modo) {
    if (VE3T.tc) VE3T.tc.setMode(modo);
    VE3T.el.querySelectorAll('[data-3tmodo]').forEach(b => b.classList.toggle('on', b.dataset['3tmodo'] === modo));
}
function ve3dTelaVista(cam) {
    const v = VE3T.vista;
    cam.position.set(v.alvo.x + v.d * Math.cos(v.el) * Math.sin(v.az), v.alvo.y + v.d * Math.sin(v.el), v.alvo.z + v.d * Math.cos(v.el) * Math.cos(v.az));
    cam.lookAt(v.alvo);
}

// ── lista e propriedades ──
// Cena (como o Outliner do Blender): câmera, mundo e os objetos, cada um com o ícone do tipo e o olho
function ve3dTelaLista() {
    const m = ve3dTelaMidia(); if (!ve3dEh(m)) return;
    const I = VE3T_ICO, icoDe = md => { const t = (md.fonte || {}).tipo; return t === 'luz' ? I.luz : t === 'embalagem' ? I.caixa : t === 'primitiva' ? I.forma : t === 'placa' ? I.imagem : I.objeto; };
    const linha = (id, nome, ico, dica, olho, oculto) => `<div class="ve3t-linha${VE3T.so === id ? ' on' : ''}${oculto ? ' oculto' : ''}">
        <button class="ve3t-it" data-3tsel="${veEsc(id)}" title="${dica}"><i class="ve3t-ico">${ico}</i><span${olho ? ' translate="no"' : ''}>${veEsc(nome)}</span></button>
        ${olho ? `<button class="ve3t-olho" data-3tolho="${veEsc(id)}" title="${veT('Esconder/mostrar (H)')}">${oculto ? I.olhoNao : I.olho}</button>` : ''}</div>`;
    const dicaObj = veT('Clique: selecionar · duplo clique: renomear · H: esconder · Ctrl+D: duplicar · Delete: tirar da cena');
    VE3T.lista.innerHTML = linha('camera', veT('Câmera'), I.camera, veT('Câmera: órbita, distância, lente e foco')) +
        linha('cenario', veT('Mundo'), I.mundo, veT('Mundo: fundo, estúdio infinito, neblina e a luz automática')) +
        m.c3d.modelos.map(md => linha(md.id, md.nome || md.id, icoDe(md), dicaObj, true, md.p.visivel === 0)).join('') +
        (m.c3d.modelos.length ? '' : `<small class="ve3t-vazio">${veT('Cena vazia: Shift+A ou o + na barra da esquerda')}</small>`);
}
function ve3dTelaLado() {
    if (!VE3T.el || VE3T.el.hidden) return;
    const c = ve3dTelaClipe(), m = ve3dTelaMidia(); if (!c || !ve3dEh(m)) return;
    if (!['camera', 'luz', 'cenario'].includes(VE3T.so) && !m.c3d.modelos.some(x => x.id === VE3T.so)) { VE3T.so = 'camera'; ve3dTelaGizmo(); }
    const ab = typeof luxAbas === 'function' ? luxAbas(c) : null;   // abas de propriedades (lux-ui.js), como no Blender
    if (ab) { VE3T.abas.innerHTML = ab.barra; VE3T.lado.innerHTML = ve3dCurvaHtml() + ab.html; }
    else VE3T.lado.innerHTML = ve3dCurvaHtml() + ve3dPainelHtml(c, VE3T.so);
    ve3dTelaLista(); VE3T.dados = JSON.stringify(m.c3d); VE3T.kfsChave = '';
    ve3dCurvaDesenhar();
}

// ── curva do ◆ selecionado (como o gráfico do editor, veKgDesenhar): o trecho que SAI dele, com as duas alças ──
// Arrastar uma alça vale para todos os ◆ selecionados (a curva fica no ◆ seguinte: [t, v, 'bez', [x1, y1, x2, y2]]).
function ve3dCurvaAlvo() {
    const meio = ve3dKfMeio();
    for (const s of VE3T.kfSel) for (const [, , l] of ve3dKfListas(s)) { const j = l.findIndex(x => Math.abs(x[0] - s.t) < meio); if (j >= 0 && j < l.length - 1) return l[j + 1]; }
    return null;
}
const ve3dCurvaQ = x => { const n = x[2]; return { i: n === 'linear' ? 'lin' : !n || n === 'suave' ? 'ease' : n, b: x[3] }; };   // ◆ 3D → formato do editor
function ve3dCurvaHtml() {
    if (!VE3T.kfSel.length) return '';
    const alvo = ve3dCurvaAlvo();
    return vePpSec(veT('Curva do quadro-chave'), alvo
        ? `<div class="ve3t-curva"><canvas data-3tcurva title="${veT('Arraste as alças para mudar a curva (duplo clique volta ao linear)')}"></canvas>
            <div class="ve-kf-graph-leg"><span class="val">${veT('Valor')}</span><span class="vel">${veT('Velocidade')}</span></div></div>`
        : `<small class="ve-pp-dica">${veT('Este ◆ é o último: a curva vale para o trecho que sai dele.')}</small>`);
}
function ve3dCurvaDesenhar(drag = -1) {
    const cv = VE3T.lado && VE3T.lado.querySelector('canvas[data-3tcurva]'), alvo = cv && ve3dCurvaAlvo();
    if (alvo && typeof veKgDesenhar === 'function') veKgDesenhar(cv, ve3dCurvaQ(alvo), drag);
}
function ve3dCurvaApertar(e) {
    const cv = e.target.closest('canvas[data-3tcurva]'), alvo = cv && ve3dCurvaAlvo(); if (!alvo || e.button !== 0) return;
    const q = ve3dCurvaQ(alvo); if (q.i === 'hold') return;
    const bz = (veKfCurve(q) || VE_KF_BEZ.lin).slice(), m = veKgMap(cv), r = cv.getBoundingClientRect();
    let n = -1, dmin = 12;
    [[bz[0], bz[1]], [bz[2], bz[3]]].forEach(([x, y], k) => { const d = Math.hypot(m.X(x) - (e.clientX - r.left), m.Y(y) - (e.clientY - r.top)); if (d < dmin) { dmin = d; n = k; } });
    if (n < 0) return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId); vePushHistory(); VE3T.mexendo = true;
    const meio = ve3dKfMeio();
    const mover = ev => {
        bz[n * 2] = Math.min(1, Math.max(0, m.ix(ev.clientX - r.left))); bz[n * 2 + 1] = Math.min(VE_KG.y1, Math.max(VE_KG.y0, m.iy(ev.clientY - r.top)));
        VE3T.kfSel.forEach(s => { for (const [, , l] of ve3dKfListas(s)) { const j = l.findIndex(x => Math.abs(x[0] - s.t) < meio); if (j >= 0 && j < l.length - 1) ve3dKfCurvaPor(l, j + 1, 'bez', bz); } });
        VE3T.chave = ''; ve3dCurvaDesenhar(n);
    };
    const soltar = () => { cv.removeEventListener('pointermove', mover); cv.removeEventListener('pointerup', soltar); VE3T.mexendo = false; ve3dKfDepois(); };
    cv.addEventListener('pointermove', mover); cv.addEventListener('pointerup', soltar);
}
// ── divisa entre o visor e as faixas: arrastar muda a altura das faixas (duplo clique volta ao automático) ──
function ve3dTelaAltura(h, salvar) {
    const t = VE3T.el && VE3T.el.querySelector('.ve3t-tempo'); if (!t) return;
    if (h) { h = Math.round(Math.max(70, Math.min(window.innerHeight * 0.75, h))); t.style.height = h + 'px'; t.style.maxHeight = 'none'; }
    else { t.style.height = ''; t.style.maxHeight = ''; }
    VE3T.chave = '';
    if (salvar) try { if (h) localStorage.setItem('ve3t-tempo-h', h); else localStorage.removeItem('ve3t-tempo-h'); } catch (e) { /* sem armazenamento: só nesta sessão */ }
}
function ve3dDivisaApertar(e) {
    if (e.button !== 0) return;
    const d = e.currentTarget, t = VE3T.el.querySelector('.ve3t-tempo'), h0 = t.getBoundingClientRect().height, y0 = e.clientY;
    e.preventDefault(); d.setPointerCapture(e.pointerId); d.classList.add('on');
    const mover = ev => ve3dTelaAltura(h0 - (ev.clientY - y0));
    const soltar = () => { d.removeEventListener('pointermove', mover); d.removeEventListener('pointerup', soltar); d.classList.remove('on'); ve3dTelaAltura(t.getBoundingClientRect().height, true); };
    d.addEventListener('pointermove', mover); d.addEventListener('pointerup', soltar);
}

// ── laço: desenha só quando algo muda ──
function ve3dTelaLaco() {
    if (!VE3T.el || VE3T.el.hidden) return;
    VE3T.raf = requestAnimationFrame(ve3dTelaLaco);
    const m = ve3dTelaMidia(), c = ve3dTelaClipe(); if (!ve3dEh(m) || !c) { ve3dTelaFechar(); return; }
    if (VE3T.play) { let T = VE3T.play.p0 + (performance.now() - VE3T.play.t0) / 1000; if (T >= veEnd(c)) { VE3T.play = { t0: performance.now(), p0: c.st }; T = c.st; } VE.playhead = T; }
    const rt = ve3dRuntime(m); if (!rt) return;
    if (rt !== VE3T.rt) { VE3T.rt = rt; VE3T.chave = ''; ve3dTelaGizmo(); if (!VE3T.lado.contains(document.activeElement)) ve3dTelaLado(); }   // partes do modelo novo na Aparência
    const dados = JSON.stringify(m.c3d);
    if (dados !== VE3T.dados && !VE3T.mexendo && !VE3T.arr && !VE3T.lado.contains(document.activeElement)) ve3dTelaLado();   // desfazer, API
    const bx = VE3T.visor.getBoundingClientRect(), leve = VE3T.mexendo || VE3T.arr || VE3T.play ? 0.6 : 1, tc = VE3T.tc;
    const chave = [dados, VE.playhead, bx.width, bx.height, leve, VE3T.livre && JSON.stringify(VE3T.vista), VE3T.so, tc && [tc.axis, tc.mode, tc.dragging], VE3T.solido].join('|');
    ve3dTelaTempo(c);
    if (chave === VE3T.chave) return; VE3T.chave = chave;
    const asp = VE.seqW / VE.seqH, bw = Math.max(40, bx.width - 20), bh = Math.max(40, bx.height - 20);
    let w = bw, h = bh; if (!VE3T.livre) { if (bw / bh > asp) w = bh * asp; else h = bw / asp; }
    const k = Math.min(window.devicePixelRatio || 1, 1.5) * leve, W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k)), cv = VE3T.cv;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const saida = {};
    // Sólido (só na tela): argila cinza no lugar dos materiais — leve e sem distração para montar
    // (só nos objetos: chão de sombra, contato e desenho das luzes ficam como estão)
    const trocados = [];
    if (VE3T.solido) {
        VE3T.argila = VE3T.argila || new VE3T.T.MeshStandardMaterial({ color: 0xbcbcbc, roughness: 0.75, metalness: 0 });
        for (const o of rt.objs) if (!o.atualizar) o.raiz.traverse(x => { if (x.isMesh) { trocados.push([x, x.material]); x.material = VE3T.argila; } });
    }
    let src;
    try { src = ve3dAplicar(rt, m, ve3dTelaT(c), W, H, { cam: VE3T.cam, saida, vista: VE3T.livre ? ve3dTelaVista : null, sobre: tc && tc.object ? VE3T.hs : null }); }
    finally { for (const [x, mt] of trocados) x.material = mt; }
    VE3T.saida = saida;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const x = cv.getContext('2d'); x.clearRect(0, 0, W, H); x.drawImage(src, 0, 0);
}
function ve3dTelaTempo(c) {
    const r = VE3T.regua, fim = veEnd(c), fps = VE.fps || 30;
    if (+r.min !== c.st || +r.max !== fim) { r.min = c.st; r.max = fim; r.step = 1 / fps; VE3T.kfsChave = ''; }
    if (document.activeElement !== r) r.value = VE.playhead;
    const t = ve3dTelaT(c); VE3T.hora.textContent = `${t.toFixed(2)} / ${(fim - c.st).toFixed(2)} s`;
    VE3T.el.querySelector('[data-3tplay]').textContent = VE3T.play ? '❚❚' : '▶';
    const ag = VE3T.faixas.querySelector('.ve3t-agulha'); if (ag) ag.style.setProperty('--p', ((VE.playhead - c.st) / Math.max(1e-6, fim - c.st)).toFixed(4));
    // uma faixa por objeto com os ◆ dele (mesmo tempo = um ◆) e, aberta com ▸ (ou U), uma por propriedade animada
    const m = ve3dTelaMidia(), C = m.c3d, selJ = JSON.stringify(VE3T.kfSel), chave = [VE3T.so, VE3T.dados, c.st, fim, selJ, [...VE3T.abertos]].join('|');
    if (chave === VE3T.kfsChave) return; VE3T.kfsChave = chave;
    if (selJ !== VE3T.curvaSel) { VE3T.curvaSel = selJ; ve3dTelaLado(); VE3T.kfsChave = chave; }   // curva do ◆ selecionado no painel
    const vel = typeof veVel === 'function' ? veVel(c) : 1;
    const objs = [['camera', veT('Câmera'), C.camera], ['luz', veT('Luz'), C.luz], ['cenario', veT('Cenário'), ve3dCenario(C)], ...C.modelos.map(md => [md.id, md.nome || md.id, md])];
    const marca = (id, tk, p) => { const T = c.st + (tk - c.s) / vel, x = (T - c.st) / Math.max(1e-6, fim - c.st);
        return x < -0.001 || x > 1.001 ? '' : `<span class="ve3t-kf${ve3dKfSelTem(id, tk, p) ? ' sel' : ''}" style="left:calc(8px + (100% - 16px) * ${x.toFixed(4)})" data-3tkf="${T}" data-3tq="${veEsc(id)}" data-3tt="${tk}"${p ? ` data-3tp="${veEsc(p)}"` : ''} title="${p ? ve3dPropNome(id, p) + ' · ' : ''}${tk.toFixed(2)} s">◆</span>`; };
    const tempos = ls => [...new Set(ls.flatMap(l => l.map(q => +(+q[0]).toFixed(3))))];
    VE3T.faixas.innerHTML = objs.map(([id, nome, o]) => {
        const props = Object.entries(o.kf || {}).filter(([, l]) => l && l.length), aberto = props.length && VE3T.abertos.has(id), on = VE3T.so === id ? ' on' : '';
        const seta = props.length ? `<i class="ve3t-seta" data-3tabrir="${veEsc(id)}" title="${veT('Mostrar/esconder as propriedades animadas')} (U)">${aberto ? '▾' : '▸'}</i>` : '<i class="ve3t-seta"></i>';
        const usuario = !(o === C.camera || o === C.luz || id === 'cenario');
        let h = `<button class="ve3t-it${on}" data-3tsel="${veEsc(id)}">${seta}<span${usuario ? ' translate="no"' : ''}>${veEsc(nome)}</span></button><div class="ve3t-trilha${on}">${tempos(props.map(x => x[1])).map(tk => marca(id, tk)).join('')}</div>`;
        if (aberto) h += props.map(([p, l]) => `<button class="ve3t-it ve3t-sub${on}" data-3tsel="${veEsc(id)}">${ve3dPropNome(id, p)}</button><div class="ve3t-trilha ve3t-sub">${tempos([l]).map(tk => marca(id, tk, p)).join('')}</div>`).join('');
        return h;
    }).join('') + '<i class="ve3t-agulha"></i>';
}
// ▸ / U: abre ou fecha as faixas das propriedades animadas de um objeto
function ve3dTelaAbrirProps(id) {
    if (!id) return;
    if (VE3T.abertos.has(id)) VE3T.abertos.delete(id); else VE3T.abertos.add(id);
    VE3T.kfsChave = '';
}
// ── quadros-chave: seleção, mover, apagar, copiar/colar, interpolação (como editor-keyframes.js) ──
// Seleção: [{q (objeto), t (tempo da cena), p?}] — sem p = o objeto inteiro naquele tempo; com p = só aquela propriedade
// (faixas abertas com ▸ ou U, como as propriedades torcidas do After Effects).
const ve3dKfMeio = () => 0.5 / (VE.fps || 30);
const ve3dKfCasa = (s, p) => s.p == null || s.p === p;   // o item da seleção vale para a propriedade p?
// ◆ da faixa do objeto (p indefinido): aceso se o objeto inteiro está selecionado; ◆ de propriedade: o objeto ou ela
const ve3dKfSelTem = (q, t, p) => VE3T.kfSel.some(s => s.q === q && Math.abs(s.t - t) < ve3dKfMeio() && (p == null ? s.p == null : ve3dKfCasa(s, p)));
const ve3dKfMesmo = (a, b) => a.q === b.q && (a.p || null) === (b.p || null) && Math.abs(a.t - b.t) < ve3dKfMeio();
const ve3dKfObj = q => { try { return ve3dObj(ve3dTelaMidia(), q); } catch (e) { return null; } };
const ve3dKfDoEl = x => ({ q: x.dataset['3tq'], t: +x.dataset['3tt'], ...(x.dataset['3tp'] ? { p: x.dataset['3tp'] } : {}) });
// cada (propriedade, lista) de um item da seleção
function* ve3dKfListas(s) { const o = ve3dKfObj(s.q); if (!o || !o.kf) return; for (const [p, l] of Object.entries(o.kf)) if (ve3dKfCasa(s, p)) yield [o, p, l]; }
function ve3dKfDepois() { const m = ve3dTelaMidia(); VE3T.kfsChave = ''; if (ve3dEh(m)) ve3dMudou(m); ve3dTelaLado(); }
const VE3D_PROP_NOMES = { x: 'X', y: 'Y', z: 'Z', ry: 'Girar', rx: 'Inclinar', rz: 'Rolar', esc: 'Escala', sx: 'Largura', sy: 'Altura', sz: 'Profundidade',
    contato: 'Sombra de contato', visivel: 'Visível', tremido: 'Tremido', tremidoRitmo: 'Ritmo do tremido', azimute: 'Órbita', elevacao: 'Altura', dist: 'Distância',
    fov: 'Lente (fov)', ax: 'Olhar: X', ay: 'Olhar na altura', az: 'Olhar: Z', abertura: 'Desfoque', foco: 'Distância do foco', intensidade: 'Intensidade',
    ambiente: 'Ambiente', sombra: 'Sombra', contra: 'Contraluz', neblina: 'Neblina' };
const ve3dPropNome = (id, p) => veT(id === 'luz' && p === 'azimute' ? 'Direção' : VE3D_PROP_NOMES[p] || p);
function ve3dTelaKfApertar(e) {
    if (e.button !== 0) return;
    const c = ve3dTelaClipe(), m = ve3dTelaMidia(); if (!c || !ve3dEh(m)) return;
    const k = e.target.closest('.ve3t-kf'), F = VE3T.faixas, tr = F.querySelector('.ve3t-trilha');
    if (!tr || (!k && e.target.closest('.ve3t-it'))) return;   // nome da faixa: seleciona o objeto (clique normal)
    e.preventDefault(); ve3dTelaParar();
    const um = tr.getBoundingClientRect(), fim = veEnd(c), vel = typeof veVel === 'function' ? veVel(c) : 1, fps = VE.fps || 30;
    const pxPorS = Math.max(1, um.width - 16) / Math.max(1e-6, (fim - c.st) * vel);   // px por segundo da cena
    const soma = e.shiftKey || e.ctrlKey || e.metaKey, x0 = e.clientX, y0 = e.clientY;
    F.setPointerCapture(e.pointerId);
    let mover, soltar;
    if (k) {
        const hit = ve3dKfDoEl(k), ja = ve3dKfSelTem(hit.q, hit.t, hit.p);
        if (!ja) VE3T.kfSel = soma ? VE3T.kfSel.concat(hit) : [hit];
        const els = [...F.querySelectorAll('.ve3t-kf')].filter(x => ve3dKfSelTem(x.dataset['3tq'], +x.dataset['3tt'], x.dataset['3tp']) || x === k);
        els.forEach(x => x.classList.add('sel'));
        let dt = 0, ativo = false;
        mover = ev => {
            if (!ativo && Math.abs(ev.clientX - x0) < 3) return; ativo = true;
            dt = Math.round((ev.clientX - x0) / pxPorS * fps) / fps;
            const minT = Math.min(...VE3T.kfSel.map(s => s.t)); if (minT + dt < 0) dt = -minT;
            els.forEach(x => { x.style.transform = `translateX(calc(-50% + ${(dt * pxPorS).toFixed(1)}px))`; });
        };
        soltar = () => {
            if (!ativo) {
                if (soma && ja) VE3T.kfSel = VE3T.kfSel.filter(s => !ve3dKfMesmo(s, hit));
                else if (!soma) { VE3T.kfSel = [hit]; veSeek(+k.dataset['3tkf']); if (VE3T.so !== hit.q) ve3dTelaSelecionar(hit.q); }   // o dono do ◆ vai para o painel
                VE3T.kfsChave = ''; return;
            }
            if (Math.abs(dt) >= ve3dKfMeio()) ve3dKfMover(dt, e.altKey); else VE3T.kfsChave = '';
        };
    } else {   // retângulo de seleção
        const fb = F.getBoundingClientRect(), base = soma ? VE3T.kfSel.slice() : [], laco = document.createElement('i');
        laco.className = 've3t-laco'; let ativo = false;
        mover = ev => {
            if (!ativo && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
            if (!ativo) { ativo = true; F.appendChild(laco); }
            const x1 = Math.min(x0, ev.clientX), x2 = Math.max(x0, ev.clientX), y1 = Math.min(y0, ev.clientY), y2 = Math.max(y0, ev.clientY);
            Object.assign(laco.style, { left: x1 - fb.left + 'px', top: y1 - fb.top + F.scrollTop + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
            const novos = [...F.querySelectorAll('.ve3t-kf')].filter(x => { const r = x.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2; return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2; })
                .map(ve3dKfDoEl);
            VE3T.kfSel = base.concat(novos.filter(n => !base.some(s => ve3dKfMesmo(s, n))));
            F.querySelectorAll('.ve3t-kf').forEach(x => x.classList.toggle('sel', ve3dKfSelTem(x.dataset['3tq'], +x.dataset['3tt'], x.dataset['3tp'])));
        };
        soltar = () => { laco.remove(); if (!ativo && !soma) VE3T.kfSel = []; VE3T.kfsChave = ''; };
    }
    const fimArr = ev => { F.removeEventListener('pointermove', mover); F.removeEventListener('pointerup', fimArr); F.removeEventListener('pointercancel', fimArr); soltar(ev); };
    F.addEventListener('pointermove', mover); F.addEventListener('pointerup', fimArr); F.addEventListener('pointercancel', fimArr);
}
// mexe (ou duplica) os ◆ selecionados dt segundos da cena; o que chega substitui o que estava lá
function ve3dKfMover(dt, duplicar) {
    const meio = ve3dKfMeio(), r4 = v => Math.round(v * 1e4) / 1e4, porObj = new Map();
    VE3T.kfSel.forEach(s => { if (!porObj.has(s.q)) porObj.set(s.q, []); porObj.get(s.q).push(s); });
    vePushHistory();
    porObj.forEach((itens, q) => {
        const o = ve3dKfObj(q); if (!o || !o.kf) return;
        for (const [p, l] of Object.entries(o.kf)) {
            const nele = x => itens.some(s => ve3dKfCasa(s, p) && Math.abs(x[0] - s.t) < meio);
            const movidos = l.filter(nele).map(x => [r4(Math.max(0, x[0] + dt)), ...x.slice(1)]);   // leva a curva (e as alças) junto
            if (!movidos.length) continue;
            const resto = (duplicar ? l : l.filter(x => !nele(x))).map(x => x.slice()).filter(x => !movidos.some(mv => Math.abs(mv[0] - x[0]) < meio));
            o.kf[p] = resto.concat(movidos).sort((a, b) => a[0] - b[0]);
        }
    });
    VE3T.kfSel = VE3T.kfSel.map(s => ({ ...s, t: r4(Math.max(0, s.t + dt)) }));
    ve3dKfDepois();
}
function ve3dKfApagar() {
    if (!VE3T.kfSel.length) return;
    const meio = ve3dKfMeio(), n = VE3T.kfSel.length;
    vePushHistory();
    VE3T.kfSel.forEach(s => {
        for (const [o, p, l] of [...ve3dKfListas(s)]) {
            const tirado = l.find(x => Math.abs(x[0] - s.t) < meio); if (!tirado) continue;
            const resto = l.filter(x => x !== tirado);
            if (resto.length) o.kf[p] = resto; else { delete o.kf[p]; o.p[p] = tirado[1]; }   // último ◆: o valor dele fica fixo
        }
    });
    VE3T.kfSel = []; ve3dKfDepois();
    veToast(veT(n === 1 ? 'Quadro-chave apagado' : `${n} quadros-chave apagados`));
}
function ve3dKfCopiar() {
    if (!VE3T.kfSel.length) return false;
    const base = Math.min(...VE3T.kfSel.map(s => s.t)), meio = ve3dKfMeio(), itens = [];
    VE3T.kfSel.forEach(s => { for (const [, p, l] of ve3dKfListas(s)) { const x = l.find(y => Math.abs(y[0] - s.t) < meio);
        if (x && !itens.some(it => it.q === s.q && it.p === p && Math.abs(it.rel - (s.t - base)) < meio)) itens.push({ q: s.q, p, rel: s.t - base, v: x[1], i: x[2], b: x[3] }); } });
    VE3T.kfClip = { itens, qs: [...new Set(itens.map(x => x.q))] };
    veToast(veT(`${VE3T.kfSel.length} quadro${VE3T.kfSel.length > 1 ? 's' : ''}-chave copiado${VE3T.kfSel.length > 1 ? 's' : ''}`));
    return true;
}
// cola na agulha; copiados de um objeto só e outro selecionado: vão para o selecionado
function ve3dKfColar() {
    const cp = VE3T.kfClip, c = ve3dTelaClipe(); if (!cp || !cp.itens.length || !c) return false;
    const t0 = ve3dTelaT(c), meio = ve3dKfMeio(), r4 = v => Math.round(v * 1e4) / 1e4, sel = [];
    const outro = cp.qs.length === 1 && VE3T.so !== cp.qs[0] && ve3dKfObj(VE3T.so) ? VE3T.so : null;
    vePushHistory();
    cp.itens.forEach(it => {
        const q = outro || it.q, o = ve3dKfObj(q); if (!o) return;
        const kf = o.kf || (o.kf = {}), t = r4(t0 + it.rel);
        kf[it.p] = (kf[it.p] || []).filter(x => Math.abs(x[0] - t) >= meio).concat([it.b ? [t, it.v, it.i, it.b.slice()] : [t, it.v, it.i]]).sort((a, b) => a[0] - b[0]);
        if (!sel.some(s => s.q === q && Math.abs(s.t - t) < meio)) sel.push({ q, t });
    });
    VE3T.kfSel = sel; ve3dKfDepois();
    veToast(veT('Quadros-chave colados na agulha'));
    return true;
}
// interpolação do trecho que SAI do ◆ (como no editor); a curva mora no ◆ seguinte
// curva de um trecho: a que chega no ◆ l[j] (b = alças da Bézier, só com 'bez')
function ve3dKfCurvaPor(l, j, i, b) { l[j][2] = i; if (i === 'bez' && b) l[j][3] = b.map(v => Math.round(v * 1e4) / 1e4); else l[j].length = 3; }
function ve3dKfInterp(i) {
    if (!VE3T.kfSel.length) return;
    const meio = ve3dKfMeio(); vePushHistory();
    VE3T.kfSel.forEach(s => { for (const [, , l] of ve3dKfListas(s)) { const j = l.findIndex(x => Math.abs(x[0] - s.t) < meio); if (j >= 0 && j < l.length - 1) ve3dKfCurvaPor(l, j + 1, i); } });
    ve3dKfDepois();
    veToast(veT('Interpolação') + ': ' + veT(VE3D_KF_NOMES[i] || i));
}
// Easy Ease (F9): chega e sai devagar; 'in' (Shift+F9) só a chegada, 'out' (Ctrl+Shift+F9) só a saída
function ve3dKfEasy(modo = 'ambos') {
    if (!VE3T.kfSel.length) { veToast(veT('Selecione quadros-chave nas faixas')); return; }
    const meio = ve3dKfMeio(); vePushHistory();
    VE3T.kfSel.forEach(s => {
        for (const [, , l] of ve3dKfListas(s)) {
            const j = l.findIndex(x => Math.abs(x[0] - s.t) < meio); if (j < 0) continue;
            if (modo !== 'out' && j > 0) ve3dKfCurvaPor(l, j, modo === 'in' ? 'out' : 'suave');               // chegando: freia
            if (modo !== 'in' && j < l.length - 1) ve3dKfCurvaPor(l, j + 1, modo === 'out' ? 'in' : 'suave');   // saindo: arranca devagar
        } });
    ve3dKfDepois();
    veToast(veT({ ambos: 'Easy Ease', in: 'Easy Ease de entrada', out: 'Easy Ease de saída' }[modo]));
}
// ‹◆ / ◆›: agulha no quadro-chave anterior/próximo do objeto selecionado
function ve3dKfPular(dir) {
    const c = ve3dTelaClipe(), o = ve3dKfObj(VE3T.so); if (!c || !o) return;
    const t = ve3dTelaT(c), meio = ve3dKfMeio(), ts = [...new Set(Object.values(o.kf || {}).flatMap(l => l.map(x => x[0])))].sort((a, b) => a - b);
    const alvo = dir > 0 ? ts.find(x => x > t + meio) : ts.reverse().find(x => x < t - meio);
    if (alvo == null) { veToast(veT(dir > 0 ? 'Não há quadro-chave depois' : 'Não há quadro-chave antes')); return; }
    ve3dTelaParar(); veSeek(c.st + (alvo - c.s) / (typeof veVel === 'function' ? veVel(c) : 1));
}
const VE3D_KF_NOMES = { linear: 'Linear', suave: 'Suave (Easy Ease)', in: 'Acelerar', out: 'Frear', hold: 'Parar (degrau)', back: 'Passar e voltar (overshoot)', elas: 'Elástico', quica: 'Quicar' };
function ve3dKfMenuAbrir(e) {
    const k = e.target.closest('.ve3t-kf'); if (!k && e.target.closest('.ve3t-it')) return;
    e.preventDefault();
    if (k && !ve3dKfSelTem(k.dataset['3tq'], +k.dataset['3tt'], k.dataset['3tp'])) { VE3T.kfSel = [ve3dKfDoEl(k)]; VE3T.kfsChave = ''; }
    veClipMenuFechar();
    const n = VE3T.kfSel.length, tem = n > 0, m = document.createElement('div'); m.className = 've-ctx';
    const item = (a, txt, kbd, cls) => `<button class="ve-ctx-item${cls ? ' ' + cls : ''}" data-kl3="${a}">${veT(txt)}${kbd ? `<kbd>${kbd}</kbd>` : ''}</button>`;
    m.innerHTML = `<div class="ve-ctx-title">${tem ? `${n} ${veT(n === 1 ? 'quadro-chave' : 'quadros-chave')}` : veT('Quadros-chave')}</div>` +
        (tem ? item('easy', 'Easy Ease', 'F9') + item('easyin', 'Easy Ease de entrada', 'Shift+F9') + item('easyout', 'Easy Ease de saída', 'Ctrl+Shift+F9') +
            `<div class="ve-ctx-sub">${veT('Interpolação')}</div>` + Object.entries(VE3D_KF_NOMES).map(([i, nome]) => item('i:' + i, nome)).join('') +
            '<div class="ve-ctx-sep"></div>' + item('copiar', 'Copiar', 'Ctrl+C') : '') +
        (VE3T.kfClip ? item('colar', 'Colar na agulha', 'Ctrl+V') : '') +
        (tem ? item('dup', 'Duplicar na agulha') + '<div class="ve-ctx-sep"></div>' + item('del', 'Apagar', 'Del', 'perigo') : '');
    if (!tem && !VE3T.kfClip) return;
    document.body.appendChild(m); veCtxPosicionar(m, e.clientX, e.clientY, document);
    m.addEventListener('click', ev => {
        const it = ev.target.closest('[data-kl3]'); if (!it) return;
        const a = it.dataset.kl3; veClipMenuFechar();
        if (a === 'easy') ve3dKfEasy('ambos'); else if (a === 'easyin') ve3dKfEasy('in'); else if (a === 'easyout') ve3dKfEasy('out');
        else if (a.startsWith('i:')) ve3dKfInterp(a.slice(2));
        else if (a === 'copiar') ve3dKfCopiar(); else if (a === 'colar') ve3dKfColar();
        else if (a === 'dup') { const salvo = VE3T.kfClip; if (ve3dKfCopiar()) ve3dKfColar(); VE3T.kfClip = salvo; }
        else if (a === 'del') ve3dKfApagar();
    });
    const fora = ev => { if (!m.contains(ev.target)) veClipMenuFechar(); }, tecla = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); veClipMenuFechar(); } };
    setTimeout(() => { document.addEventListener('pointerdown', fora, true); document.addEventListener('keydown', tecla, true); }, 0);
    VE._ctx = { m, fechar: () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', tecla, true); m.remove(); } };
}
function ve3dTelaPlay() { if (VE3T.play) ve3dTelaParar(); else VE3T.play = { t0: performance.now(), p0: VE.playhead }; }
function ve3dTelaParar() { if (!VE3T.play) return; VE3T.play = null; veSeek(VE.playhead); }

// ── gravar (igual ao painel: animado = quadro-chave na agulha; senão o valor fixo) ──
function ve3dTelaGrava(o, k, v, t) {
    const kf = o.kf || (o.kf = {});
    if (kf[k] && kf[k].length) { const l = kf[k].filter(x => Math.abs(x[0] - t) > 0.5 / (VE.fps || 30)); l.push([+t.toFixed(4), v, 'suave']); l.sort((a, b) => a[0] - b[0]); kf[k] = l; }
    else o.p[k] = v;
}

// ── setas no objeto selecionado (TransformControls do three) ──
async function ve3dTelaGizmo() {
    const m = ve3dTelaMidia(), rt = ve3dEh(m) && ve3dRuntime(m); if (!rt) return;
    if (!VE3T.tc) {
        const { TransformControls } = await import('three/addons/controls/TransformControls.js');
        const tc = new TransformControls(VE3T.cam, VE3T.cv); tc.setSize(0.9);
        tc.addEventListener('mouseDown', () => { vePushHistory(); VE3T.mexendo = true; });
        tc.addEventListener('mouseUp', () => { VE3T.mexendo = false; const mm = ve3dTelaMidia(); if (ve3dEh(mm)) ve3dMudou(mm); ve3dTelaLado(); });
        tc.addEventListener('objectChange', ve3dTelaDoGizmo);
        VE3T.hs.add(tc.getHelper()); VE3T.tc = tc; ve3dTelaIma(!!VE3T.ima);
    }
    const o = rt.objs.find(x => x.md.id === VE3T.so);
    if (o) VE3T.tc.attach(o.raiz); else VE3T.tc.detach();
    VE3T.chave = '';
}
function ve3dTelaDoGizmo() {
    const m = ve3dTelaMidia(), c = ve3dTelaClipe(), ob = VE3T.tc.object, md = m && m.c3d.modelos.find(x => x.id === VE3T.so); if (!md || !ob || !c) return;
    const t = ve3dTelaT(c), g = 180 / Math.PI, r3 = v => Math.round(v * 1000) / 1000, val = k => ve3dVal(md, k, t);
    if (VE3T.tc.mode === 'translate') { ve3dTelaGrava(md, 'x', r3(ob.position.x), t); ve3dTelaGrava(md, 'y', r3(ob.position.y), t); ve3dTelaGrava(md, 'z', r3(ob.position.z), t); }
    else if (VE3T.tc.mode === 'rotate') {   // mantém as voltas (ry 370 não vira 10)
        for (const [k, a] of [['rx', ob.rotation.x], ['ry', ob.rotation.y], ['rz', ob.rotation.z]]) { const ant = val(k) || 0, nv = a * g; ve3dTelaGrava(md, k, r3(ant + ((((nv - ant) % 360) + 540) % 360 - 180)), t); }
    } else { const es = val('esc') ?? 1; ve3dTelaGrava(md, 'sx', r3(ob.scale.x / es), t); ve3dTelaGrava(md, 'sy', r3(ob.scale.y / es), t); ve3dTelaGrava(md, 'sz', r3(ob.scale.z / es), t); }
}

// ── mouse no visor: orbitar / deslocar / distância / selecionar ──
function ve3dTelaApertar(e) {
    if (VE3T.tc && VE3T.tc.axis) return;   // em cima das setas: quem mexe é o gizmo
    e.preventDefault(); VE3T.cv.setPointerCapture(e.pointerId);
    VE3T.arr = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.button === 1 || e.shiftKey || e.button === 2, hist: false };
    const mover = ev => ve3dTelaArrastar(ev), soltar = ev => {
        VE3T.cv.removeEventListener('pointermove', mover); VE3T.cv.removeEventListener('pointerup', soltar);
        const a = VE3T.arr; VE3T.arr = null;
        if (Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 4) ve3dTelaClique(ev);
        else if (a.hist) { const m = ve3dTelaMidia(); ve3dMudou(m); ve3dTelaLado(); }
    };
    VE3T.cv.addEventListener('pointermove', mover); VE3T.cv.addEventListener('pointerup', soltar);
}
function ve3dTelaArrastar(e) {
    const a = VE3T.arr; if (!a) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y; a.x = e.clientX; a.y = e.clientY;
    if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 4) return;
    const cam = VE3T.cam; cam.updateMatrixWorld();
    const dir = new VE3T.T.Vector3(), cima = new VE3T.T.Vector3(); dir.setFromMatrixColumn(cam.matrixWorld, 0); cima.setFromMatrixColumn(cam.matrixWorld, 1);
    if (VE3T.livre) {
        const v = VE3T.vista;
        if (a.pan) { const s = v.d * 0.0016; v.alvo.addScaledVector(dir, -dx * s).addScaledVector(cima, dy * s); }
        else { v.az -= dx * 0.008; v.el = Math.max(-1.4, Math.min(1.5, v.el + dy * 0.008)); }
        return;
    }
    const m = ve3dTelaMidia(), c = ve3dTelaClipe(), C = m.c3d.camera, t = ve3dTelaT(c), val = k => ve3dVal(C, k, t), r3 = v => Math.round(v * 1000) / 1000;
    if (!a.hist) { vePushHistory(); a.hist = true; }
    if (a.pan) {
        const s = (VE3T.saida.d || 4) * 0.0016;
        ve3dTelaGrava(C, 'ax', r3((val('ax') || 0) - dx * s * dir.x + dy * s * cima.x), t);
        ve3dTelaGrava(C, 'ay', r3((val('ay') || 0) - dx * s * dir.y + dy * s * cima.y), t);
        ve3dTelaGrava(C, 'az', r3((val('az') || 0) - dx * s * dir.z + dy * s * cima.z), t);
    } else {
        ve3dTelaGrava(C, 'azimute', r3((val('azimute') || 0) - dx * 0.4), t);
        ve3dTelaGrava(C, 'elevacao', r3(Math.max(-10, Math.min(85, (val('elevacao') || 0) + dy * 0.4))), t);
    }
}
function ve3dTelaRodinha(e) {
    e.preventDefault();
    const f = Math.exp(e.deltaY * 0.001);
    if (VE3T.livre) { VE3T.vista.d = Math.max(0.3, Math.min(60, VE3T.vista.d * f)); return; }
    const m = ve3dTelaMidia(), c = ve3dTelaClipe(), C = m.c3d.camera, t = ve3dTelaT(c);
    clearTimeout(VE3T.rodaFim); if (!VE3T.rodando) { vePushHistory(); VE3T.rodando = true; }
    ve3dTelaGrava(C, 'dist', Math.round(Math.max(0.3, Math.min(50, (ve3dVal(C, 'dist', t) ?? VE3T.saida.d ?? 4) * f)) * 1000) / 1000, t);
    VE3T.rodaFim = setTimeout(() => { VE3T.rodando = false; ve3dMudou(m); ve3dTelaLado(); }, 400);
}
function ve3dTelaClique(e) {
    const rt = VE3T.rt, T = VE3T.T; if (!rt) return;
    const b = VE3T.cv.getBoundingClientRect(), p = new T.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    const rc = new T.Raycaster(); rc.setFromCamera(p, VE3T.cam);
    const hit = rc.intersectObjects(rt.objs.filter(o => o.raiz.visible).map(o => o.raiz), true)[0];
    let alvo = null; if (hit) for (let n = hit.object; n && !alvo; n = n.parent) alvo = rt.objs.find(o => o.raiz === n) || null;
    ve3dTelaSelecionar(alvo ? alvo.md.id : 'camera');
}
function ve3dTelaTecla(e) {
    if (!VE3T.el || VE3T.el.hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') { if (e.key === 'Escape') e.target.blur(); return; }
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, feito = () => { e.preventDefault(); e.stopPropagation(); };
    if (VE._ctx) return;   // menu do ◆ aberto: ele cuida do Esc
    if (e.key === 'F9') { ve3dKfEasy(e.shiftKey && ctrl ? 'out' : e.shiftKey ? 'in' : 'ambos'); feito(); return; }
    if (ctrl && !e.shiftKey && !e.altKey && k === 'c' && VE3T.kfSel.length) { ve3dKfCopiar(); feito(); return; }
    if (ctrl && !e.shiftKey && !e.altKey && k === 'v' && VE3T.kfClip) { ve3dKfColar(); feito(); return; }
    if (ctrl && k === 'd') { ve3dTelaDuplicar(); feito(); return; }
    if (e.key === 'Control') { ve3dTelaIma(VE3T.ima, true); return; }
    if (e.ctrlKey || e.metaKey) return;   // desfazer, salvar: o editor cuida
    if (k === 'escape') { if (VE3T.kfSel.length) { VE3T.kfSel = []; VE3T.kfsChave = ''; } else ve3dTelaFechar(); }
    else if (k === ' ') ve3dTelaPlay();
    else if (k === 'w' || k === 'e' || k === 'r') ve3dTelaModo({ w: 'translate', e: 'rotate', r: 'scale' }[k]);
    else if (k === 'c') ve3dTelaLivre(!VE3T.livre);
    else if (k === 'delete' || k === 'backspace') { if (VE3T.kfSel.length) ve3dKfApagar(); else ve3dTelaApagar(); }   // com ◆ selecionado: só os ◆
    else if (k === 'h') { const md = ve3dTelaModeloSel(); if (md) ve3dTelaEsconder(md.id); }
    else if (k === 'f') ve3dTelaEnquadrar();
    else if (k === 'u') ve3dTelaAbrirProps(VE3T.so);
    else if (k === 'q') ve3dTelaEspaco();
    e.preventDefault(); e.stopPropagation();   // nenhuma outra tecla vai para a timeline (Delete apagaria a faixa)
}
