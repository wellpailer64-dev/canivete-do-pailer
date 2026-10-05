// Tela da Cena 3D (como a Comp: duplo clique na faixa da cena na timeline, ou "Abrir a tela 3D" nas Propriedades).
// Visor com a câmera da cena (arrastar = orbitar e GRAVA na câmera; rodinha = distância; botão do meio ou Shift =
// deslocar) ou vista livre (C: só olha, não grava). Clique num objeto = seleciona com setas (W mover, E girar, R escala).
// Lista de objetos, propriedades do selecionado (ve3dPainelHtml) e régua de tempo com os ◆ dele.
// Mesmo runtime da prévia (ve3dAplicar) com câmera própria; desenha só quando algo muda e em resolução menor mexendo.
const VE3T = { el: null, mid: -1, so: 'camera', livre: false, vista: null, cam: null, hs: null, tc: null, rt: null, chave: '', dados: '', raf: 0, play: null, arr: null, mexendo: false, saida: {} };

const ve3dTelaMidia = () => VE.media[VE3T.mid];
const ve3dTelaClipe = () => VE.clips.find(x => veMediaOf(x) === ve3dTelaMidia()) || null;
const ve3dTelaT = c => Math.max(0, veSrcAt(c, VE.playhead));   // tempo dentro da cena

function ve3dTelaMontar() {
    const el = document.createElement('div'); el.className = 've ve3t';   // .ve: as variáveis de cor do editor (o overlay fica no body) el.hidden = true;
    el.innerHTML = `<div class="ve3t-topo"><b data-3t="titulo"></b>
        <div class="ve3t-grupo"><button class="ve-btn ve-btn-sm" data-3tvista="cena" title="${veT('Arrastar grava na câmera da cena')}">${veT('Câmera da cena')}</button><button class="ve-btn ve-btn-sm" data-3tvista="livre" title="${veT('Só olhar, não grava (C)')}">${veT('Vista livre')}</button></div>
        <div class="ve3t-grupo"><button class="ve-btn ve-btn-sm" data-3tmodo="translate" title="W">${veT('Mover')}</button><button class="ve-btn ve-btn-sm" data-3tmodo="rotate" title="E">${veT('Girar')}</button><button class="ve-btn ve-btn-sm" data-3tmodo="scale" title="R">${veT('Escala')}</button></div>
        <button class="ve-btn ve-btn-sm" data-3tfechar title="Esc">${veT('Voltar à timeline')}</button></div>
        <div class="ve3t-lista" data-3t="lista"></div>
        <div class="ve3t-visor" data-3t="visor"><canvas></canvas><div class="ve3t-dica">${veT('Arrastar: orbitar · Rodinha: distância · Shift/meio: deslocar · Clique: selecionar · W/E/R: mover/girar/escala')}</div></div>
        <div class="ve3t-lado" data-3t="lado"></div>
        <div class="ve3t-tempo"><button class="ve-btn ve-btn-sm" data-3tplay title="${veT('Espaço')}">▶</button><span class="ve3t-hora" data-3t="hora"></span>
            <div class="ve3t-regua"><div data-3t="kfs"></div><input type="range" data-3t="regua" min="0" max="1" step="0.001"></div></div>`;
    document.body.appendChild(el);
    const q = k => el.querySelector(`[data-3t="${k}"]`);
    Object.assign(VE3T, { el, lista: q('lista'), visor: q('visor'), lado: q('lado'), hora: q('hora'), regua: q('regua'), kfs: q('kfs'), titulo: q('titulo'), cv: el.querySelector('.ve3t-visor canvas') });
    el.addEventListener('click', e => {
        const b = e.target.closest('[data-3tsel],[data-3tadd],[data-3tvista],[data-3tmodo],[data-3tfechar],[data-3tplay],[data-3tkf]'); if (!b) return;
        const d = b.dataset;
        if (d['3tsel'] != null) ve3dTelaSelecionar(d['3tsel']);
        else if (d['3tadd'] != null) {
            const m = ve3dTelaMidia(); if (d['3tadd'] === 'arquivo') { ve3dImportarUi(); return; }
            VE3DAPI.modelo({ forma: d['3tadd'], cena: m.id, cor: { esfera: '#ec6e48', cubo: '#0e3b4a', cilindro: '#ebd5a8', toro: '#ec6e48', cone: '#48281a' }[d['3tadd']] }).then(r => ve3dTelaSelecionar(r.id));
        }
        else if (d['3tvista'] != null) ve3dTelaLivre(d['3tvista'] === 'livre');
        else if (d['3tmodo'] != null) ve3dTelaModo(d['3tmodo']);
        else if (d['3tfechar'] != null) ve3dTelaFechar();
        else if (d['3tplay'] != null) ve3dTelaPlay();
        else if (d['3tkf'] != null) { ve3dTelaParar(); veSeek(+d['3tkf']); }
    });
    // propriedades: os mesmos eventos do painel Propriedades (ve3dEvento usa o clipe selecionado)
    const sel = () => { const c = ve3dTelaClipe(); if (c) VE.sel = VE.clips.indexOf(c); return !!c; };
    VE3T.lado.addEventListener('input', e => { const p = e.target.closest('[data-p3d],[data-p3dcena]'); if (p && sel()) ve3dEvento(p, 'input'); });
    VE3T.lado.addEventListener('change', e => { const p = e.target.closest('[data-p3d],[data-p3dcena]'); if (p && sel()) ve3dEvento(p, 'fim'); });
    VE3T.lado.addEventListener('click', e => { const p = e.target.closest('[data-p3dkf],[data-p3dacao]'); if (p && sel()) ve3dEvento(p, 'clique'); });
    VE3T.regua.addEventListener('input', () => { ve3dTelaParar(); veSeek(+VE3T.regua.value); });
    const cv = VE3T.cv;
    cv.addEventListener('pointerdown', ve3dTelaApertar);
    cv.addEventListener('wheel', ve3dTelaRodinha, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', ve3dTelaTecla, true);
}

async function ve3dTelaAbrir(c) {
    const m = c && veMediaOf(c); if (!ve3dEh(m)) return false;
    if (VE.playing) veStop();
    if (!VE3T.el) ve3dTelaMontar();
    VE3T.mid = m.id; VE.sel = VE.clips.indexOf(c); VE3T.so = 'camera'; VE3T.chave = ''; VE3T.dados = ''; VE3T.vista = null;
    if (VE.playhead < c.st || VE.playhead >= veEnd(c)) veSeek(c.st);
    const { T } = await ve3dLib(); VE3T.T = T;
    if (!VE3T.cam) { VE3T.cam = new T.PerspectiveCamera(32, 1, 0.05, 200); VE3T.hs = new T.Scene(); }
    VE3T.el.hidden = false; VE3T.titulo.textContent = `${veT('Cena 3D')} · ${m.name || ''}`;
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
function ve3dTelaLista() {
    const m = ve3dTelaMidia(); if (!ve3dEh(m)) return;
    const it = (id, nome) => `<button class="ve3t-it${VE3T.so === id ? ' on' : ''}" data-3tsel="${veEsc(id)}">${veEsc(nome)}</button>`;
    VE3T.lista.innerHTML = it('camera', veT('Câmera')) + it('luz', veT('Luz')) + it('cenario', veT('Cenário')) + '<hr>' +
        m.c3d.modelos.map(md => it(md.id, md.nome || md.id)).join('') +
        `<div class="ve3t-add">${['esfera', 'cubo', 'cilindro', 'toro', 'cone'].map(f => `<button class="ve-btn ve-btn-sm ve-btn-ghost" data-3tadd="${f}">+ ${veT(f)}</button>`).join('')}
        <button class="ve-btn ve-btn-sm ve-btn-ghost" data-3tadd="arquivo">${veT('Importar .glb / .obj…')}</button></div>`;
}
function ve3dTelaLado() {
    if (!VE3T.el || VE3T.el.hidden) return;
    const c = ve3dTelaClipe(), m = ve3dTelaMidia(); if (!c || !ve3dEh(m)) return;
    if (!['camera', 'luz', 'cenario'].includes(VE3T.so) && !m.c3d.modelos.some(x => x.id === VE3T.so)) { VE3T.so = 'camera'; ve3dTelaGizmo(); }
    VE3T.lado.innerHTML = ve3dPainelHtml(c, VE3T.so); ve3dTelaLista(); VE3T.dados = JSON.stringify(m.c3d); VE3T.kfsChave = '';
}

// ── laço: desenha só quando algo muda ──
function ve3dTelaLaco() {
    if (!VE3T.el || VE3T.el.hidden) return;
    VE3T.raf = requestAnimationFrame(ve3dTelaLaco);
    const m = ve3dTelaMidia(), c = ve3dTelaClipe(); if (!ve3dEh(m) || !c) { ve3dTelaFechar(); return; }
    if (VE3T.play) { let T = VE3T.play.p0 + (performance.now() - VE3T.play.t0) / 1000; if (T >= veEnd(c)) { VE3T.play = { t0: performance.now(), p0: c.st }; T = c.st; } VE.playhead = T; }
    const rt = ve3dRuntime(m); if (!rt) return;
    if (rt !== VE3T.rt) { VE3T.rt = rt; VE3T.chave = ''; ve3dTelaGizmo(); }
    const dados = JSON.stringify(m.c3d);
    if (dados !== VE3T.dados && !VE3T.mexendo && !VE3T.arr && !VE3T.lado.contains(document.activeElement)) ve3dTelaLado();   // desfazer, API
    const bx = VE3T.visor.getBoundingClientRect(), leve = VE3T.mexendo || VE3T.arr || VE3T.play ? 0.6 : 1, tc = VE3T.tc;
    const chave = [dados, VE.playhead, bx.width, bx.height, leve, VE3T.livre && JSON.stringify(VE3T.vista), VE3T.so, tc && [tc.axis, tc.mode, tc.dragging]].join('|');
    ve3dTelaTempo(c);
    if (chave === VE3T.chave) return; VE3T.chave = chave;
    const asp = VE.seqW / VE.seqH, bw = Math.max(40, bx.width - 20), bh = Math.max(40, bx.height - 20);
    let w = bw, h = bh; if (!VE3T.livre) { if (bw / bh > asp) w = bh * asp; else h = bw / asp; }
    const k = Math.min(window.devicePixelRatio || 1, 1.5) * leve, W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k)), cv = VE3T.cv;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const saida = {};
    const src = ve3dAplicar(rt, m, ve3dTelaT(c), W, H, { cam: VE3T.cam, saida, vista: VE3T.livre ? ve3dTelaVista : null, sobre: tc && tc.object ? VE3T.hs : null });
    VE3T.saida = saida;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const x = cv.getContext('2d'); x.clearRect(0, 0, W, H); x.drawImage(src, 0, 0);
}
function ve3dTelaTempo(c) {
    const r = VE3T.regua, fim = veEnd(c), fps = VE.fps || 30;
    if (+r.min !== c.st || +r.max !== fim) { r.min = c.st; r.max = fim; r.step = 1 / fps; VE3T.kfsChave = ''; }
    if (document.activeElement !== r) r.value = VE.playhead;
    const t = ve3dTelaT(c); VE3T.hora.textContent = `${t.toFixed(2)} s / ${(fim - c.st).toFixed(2)} s`;
    VE3T.el.querySelector('[data-3tplay]').textContent = VE3T.play ? '❚❚' : '▶';
    // ◆ do selecionado (câmera inclui o foco) na régua: clique leva a agulha até ele
    const m = ve3dTelaMidia(), so = VE3T.so, chave = so + '|' + VE3T.dados; if (chave === VE3T.kfsChave) return; VE3T.kfsChave = chave;
    let o = null; try { o = ve3dObj(m, so); } catch (e) { /* modelo saiu */ }
    const ts = new Set(); for (const l of Object.values((o && o.kf) || {})) for (const q of l) ts.add(+q[0].toFixed(3));
    const vel = typeof veVel === 'function' ? veVel(c) : 1;
    VE3T.kfs.innerHTML = [...ts].map(tk => { const T = c.st + (tk - c.s) / vel, p = (T - c.st) / Math.max(1e-6, fim - c.st); return p < -0.001 || p > 1.001 ? '' : `<span class="ve3t-kf" style="left:calc(8px + (100% - 16px) * ${p.toFixed(4)})" data-3tkf="${T}" title="${tk.toFixed(2)} s">◆</span>`; }).join('');
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
        VE3T.hs.add(tc.getHelper()); VE3T.tc = tc;
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
    if (e.ctrlKey || e.metaKey) return;   // desfazer, salvar: o editor cuida
    const k = e.key.toLowerCase();
    if (k === 'escape') ve3dTelaFechar();
    else if (k === ' ') ve3dTelaPlay();
    else if (k === 'w' || k === 'e' || k === 'r') ve3dTelaModo({ w: 'translate', e: 'rotate', r: 'scale' }[k]);
    else if (k === 'c') ve3dTelaLivre(!VE3T.livre);
    e.preventDefault(); e.stopPropagation();   // nenhuma outra tecla vai para a timeline (Delete apagaria a faixa)
}
