// =========================================================
// Tela da Cena 3D — mexer mais fácil (pedido do Pailer, 2026-10-14: "melhorar os controles, a forma de interagir"):
//   · arrastar um OBJETO direto no visor move ele no plano da tela (antes: clicar, achar a seta certa; arrastar em
//     qualquer lugar girava a câmera da cena e gravava quadro-chave nela). Arrastar no vazio continua orbitando.
//   · Alt + rodinha ou [ / ] (Shift = passo fino): empurra o selecionado para o fundo / traz para a frente AO LONGO DO
//     RAIO DA CÂMERA, com a escala compensada — na tela ele fica igual, só muda a profundidade (parallax sem refazer).
//   · mapa de profundidade (vista de cima, canto do visor): câmera, campo de visão e cada camada na sua profundidade;
//     clique seleciona, arrastar para cima/baixo empurra (como o Alt + rodinha).
// Grava como o resto da tela (ve3dTelaGrava: animado = quadro-chave na agulha; senão o valor fixo).
// =========================================================

// empurrar ao longo do raio da câmera DA CENA no instante t: posição e escala × s (s > 1 = mais longe), mesmo desenho na tela
function ve3dEmpurrar(md, s, base) {
    const m = ve3dTelaMidia(), c = ve3dTelaClipe(), rt = VE3T.rt; if (!md || !rt || !c) return;
    const t = ve3dTelaT(c), cam = base ? base.cam : ve3dCamEm(rt, m, t).position.clone();
    const p0 = base ? base.p : { x: ve3dVal(md, 'x', t) || 0, y: ve3dVal(md, 'y', t) || 0, z: ve3dVal(md, 'z', t) || 0 }, e0 = base ? base.esc : (ve3dVal(md, 'esc', t) ?? 1);
    const r3 = v => Math.round(v * 10000) / 10000;
    for (const k of ['x', 'y', 'z']) ve3dTelaGrava(md, k, r3(cam[k] + (p0[k] - cam[k]) * s), t);
    ve3dTelaGrava(md, 'esc', r3(Math.max(1e-4, e0 * s)), t);
    VE3T.chave = '';
}
const ve3dEmpurrarBase = md => {
    const m = ve3dTelaMidia(), c = ve3dTelaClipe(), t = ve3dTelaT(c), cam = ve3dCamEm(VE3T.rt, m, t).position.clone();
    const p = { x: ve3dVal(md, 'x', t) || 0, y: ve3dVal(md, 'y', t) || 0, z: ve3dVal(md, 'z', t) || 0 };
    return { cam, p, esc: ve3dVal(md, 'esc', t) ?? 1, prof: Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) || 1 };
};
// um passo de empurrar (rodinha, teclas): junta os passos seguidos num só Ctrl+Z
function ve3dEmpurrarPasso(s) {
    const md = ve3dTelaModeloSel(); if (!md) { veToast(veT('Selecione um objeto para mudar a profundidade')); return; }
    clearTimeout(VE3T.empFim); if (!VE3T.empurrando) { vePushHistory(); VE3T.empurrando = true; }
    ve3dEmpurrar(md, s);
    VE3T.empFim = setTimeout(() => { VE3T.empurrando = false; const m = ve3dTelaMidia(); if (ve3dEh(m)) ve3dMudou(m); ve3dTelaLado(); }, 400);
}

// objeto sob o mouse (visor)
function ve3dTelaAcertar(e) {
    const rt = VE3T.rt, T = VE3T.T; if (!rt || !T) return null;
    const b = VE3T.cv.getBoundingClientRect(), p = new T.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    const rc = new T.Raycaster(); rc.setFromCamera(p, VE3T.cam);
    const hit = rc.intersectObjects(rt.objs.filter(o => o.raiz.visible).map(o => o.raiz), true)[0];
    let alvo = null; if (hit) for (let n = hit.object; n && !alvo; n = n.parent) alvo = rt.objs.find(o => o.raiz === n) || null;
    return alvo && { o: alvo, ponto: hit.point };
}

(function () {
    // arrastar o objeto direto: move no plano da tela, na profundidade em que ele está
    const apertar = ve3dTelaApertar;
    ve3dTelaApertar = function (e) {
        if (e.button !== 0 || e.shiftKey || e.altKey || (VE3T.tc && VE3T.tc.axis)) return apertar(e);
        const ac = ve3dTelaAcertar(e); if (!ac) return apertar(e);
        // stopImmediatePropagation: as setas (TransformControls) do objeto que este clique seleciona pegavam o mesmo
        // apertar e arrastavam junto (dois objetos andando)
        e.preventDefault(); e.stopImmediatePropagation(); VE3T.cv.setPointerCapture(e.pointerId);
        const md = ac.o.md, T = VE3T.T, cam = VE3T.cam; cam.updateMatrixWorld();
        if (VE3T.so !== md.id) ve3dTelaSelecionar(md.id);
        const c = ve3dTelaClipe(), t = ve3dTelaT(c), dir = new T.Vector3(), dirx = new T.Vector3(), diry = new T.Vector3();
        cam.getWorldDirection(dir); dirx.setFromMatrixColumn(cam.matrixWorld, 0); diry.setFromMatrixColumn(cam.matrixWorld, 1);
        const p0 = { x: ve3dVal(md, 'x', t) || 0, y: ve3dVal(md, 'y', t) || 0, z: ve3dVal(md, 'z', t) || 0 };
        const prof = Math.max(0.05, ac.ponto.clone().sub(cam.position).dot(dir)), alt = VE3T.cv.getBoundingClientRect().height;
        const porPx = 2 * prof * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, alt);   // unidades da cena por pixel nessa profundidade
        const x0 = e.clientX, y0 = e.clientY; let hist = false;
        const mover = ev => {
            const dx = ev.clientX - x0, dy = ev.clientY - y0; if (!hist && Math.hypot(dx, dy) < 4) return;
            if (!hist) { vePushHistory(); hist = true; VE3T.mexendo = true; }
            const r3 = v => Math.round(v * 10000) / 10000;
            for (const k of ['x', 'y', 'z']) ve3dTelaGrava(md, k, r3(p0[k] + (dirx[k] * dx - diry[k] * dy) * porPx), t);
            VE3T.chave = '';
        };
        const soltar = () => {
            VE3T.cv.removeEventListener('pointermove', mover); VE3T.cv.removeEventListener('pointerup', soltar);
            VE3T.mexendo = false; if (hist) { ve3dMudou(ve3dTelaMidia()); ve3dTelaLado(); }
        };
        VE3T.cv.addEventListener('pointermove', mover); VE3T.cv.addEventListener('pointerup', soltar);
    };
    // Alt + rodinha: profundidade do selecionado (sem mudar o tamanho na tela)
    const rodinha = ve3dTelaRodinha;
    ve3dTelaRodinha = function (e) {
        if (!e.altKey || !ve3dTelaModeloSel()) return rodinha(e);
        e.preventDefault(); ve3dEmpurrarPasso(Math.exp(e.deltaY * 0.0012));
    };
    // [ / ]: fundo / frente (Shift: passo fino)
    const tecla = ve3dTelaTecla;
    ve3dTelaTecla = function (e) {
        if (VE3T.el && !VE3T.el.hidden && !e.ctrlKey && !e.metaKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
            const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            const f = e.shiftKey ? 1.02 : 1.12; ve3dEmpurrarPasso(e.code === 'BracketRight' ? f : 1 / f);
            e.preventDefault(); e.stopPropagation(); return;
        }
        return tecla(e);
    };
    // mapa de profundidade: montado junto com a tela, redesenhado quando a cena/agulha/seleção mudam
    const montar = ve3dTelaMontar;
    ve3dTelaMontar = function () {
        montar();
        const cv = document.createElement('canvas'); cv.className = 've3t-mapa'; cv.width = 220; cv.height = 150;
        cv.title = veT('Profundidade (vista de cima): clique seleciona; arraste para cima/baixo para levar ao fundo ou trazer para a frente sem mudar o tamanho na tela');
        VE3T.visor.appendChild(cv); VE3T.mapa = cv;
        cv.addEventListener('pointerdown', ve3dMapaApertar);
        // botões de profundidade do painel da placa
        VE3T.lado.addEventListener('click', e => { const b = e.target.closest('[data-3tz]'); if (b) ve3dEmpurrarPasso(+b.dataset['3tz']); });
        const dica = VE3T.visor.querySelector('.ve3t-dica');
        if (dica) dica.textContent = veT('Arrastar objeto: mover · Arrastar no vazio: orbitar · Rodinha: distância · Alt+rodinha ou [ ]: profundidade sem mudar o tamanho · Shift/meio: deslocar · W/E/R · Delete · Ctrl+D · H · F');
    };
    const tempo = ve3dTelaTempo;
    ve3dTelaTempo = function (c) { tempo(c); ve3dMapaDesenhar(); };
    if (!document.getElementById('ve3t-mapa-css')) {
        const st = document.createElement('style'); st.id = 've3t-mapa-css';
        st.textContent = '.ve3t-mapa{position:absolute;right:10px;bottom:10px;width:220px;height:150px;border-radius:8px;background:rgba(14,14,16,.78);border:1px solid rgba(255,255,255,.12);cursor:ns-resize;z-index:2}';
        document.head.appendChild(st);
    }
})();

// geometria do mapa: câmera da cena e camadas vistas de cima (x → horizontal, z → vertical; fundo em cima, câmera embaixo)
function ve3dMapaGeo() {
    const rt = VE3T.rt, m = ve3dTelaMidia(), c = ve3dTelaClipe(); if (!rt || !ve3dEh(m) || !c) return null;
    const T = VE3T.T, t = ve3dTelaT(c), C = m.c3d.camera, rad = Math.PI / 180, s = VE3T.saida || {};
    const alvo = s.alvo || new T.Vector3(), d = s.d || 4, az = (ve3dVal(C, 'azimute', t) || 0) * rad, el = (ve3dVal(C, 'elevacao', t) || 0) * rad;
    const cam = { x: alvo.x + d * Math.cos(el) * Math.sin(az), z: alvo.z + d * Math.cos(el) * Math.cos(az) };
    const hf = Math.atan(Math.tan((ve3dVal(C, 'fov', t) || 32) * rad / 2) * VE.seqW / VE.seqH), cx = new T.Box3();
    const cams = { ...cam, ang: Math.atan2(alvo.x - cam.x, alvo.z - cam.z), hf };
    const camadas = rt.objs.filter(o => o.raiz.visible).map(o => { cx.setFromObject(o.raiz); return { id: o.md.id, x0: cx.min.x, x1: cx.max.x, z: o.raiz.position.z }; });
    let xs = [cam.x, ...camadas.flatMap(l => [l.x0, l.x1])], zs = [cam.z, ...camadas.map(l => l.z)];
    const zmin = Math.min(...zs), zmax = Math.max(...zs), xmin = Math.min(...xs), xmax = Math.max(...xs);
    const W = 220, H = 150, pad = 16, esc = Math.min((W - 2 * pad) / Math.max(0.2, xmax - xmin), (H - 2 * pad) / Math.max(0.2, zmax - zmin));
    const ox = W / 2 - (xmin + xmax) / 2 * esc, oy = H / 2 - (zmin + zmax) / 2 * esc;
    return { cam: cams, camadas, esc, px: x => ox + x * esc, py: z => oy + z * esc };
}
function ve3dMapaDesenhar(forcar) {
    const cv = VE3T.mapa; if (!cv || !VE3T.rt) return;
    const m = ve3dTelaMidia(), chave = [ve3dEh(m) && JSON.stringify(m.c3d), VE.playhead, VE3T.so, VE3T.saida && VE3T.saida.d].join('|');
    if (!forcar && chave === VE3T.mapaChave) return; VE3T.mapaChave = chave;
    const g = ve3dMapaGeo(), x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); if (!g) return;
    VE3T.mapaGeo = g;
    // campo de visão
    const { cam } = g, L = 400, cxp = g.px(cam.x), cyp = g.py(cam.z);
    x.fillStyle = 'rgba(255,212,0,.07)'; x.strokeStyle = 'rgba(255,212,0,.35)'; x.beginPath(); x.moveTo(cxp, cyp);
    for (const a of [cam.ang - cam.hf, cam.ang + cam.hf]) x.lineTo(cxp + Math.sin(a) * L, cyp + Math.cos(a) * L);
    x.closePath(); x.fill(); x.stroke();
    // camadas (a selecionada em amarelo), da mais longe para a mais perto
    for (const l of g.camadas.slice().sort((a, b) => a.z - b.z)) {
        const on = l.id === VE3T.so; x.strokeStyle = on ? '#ffd400' : 'rgba(255,255,255,.75)'; x.lineWidth = on ? 3 : 2;
        x.beginPath(); x.moveTo(g.px(l.x0), g.py(l.z)); x.lineTo(g.px(l.x1), g.py(l.z)); x.stroke();
    }
    // câmera
    x.fillStyle = '#ffd400'; x.beginPath(); x.arc(cxp, cyp, 5, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '10px sans-serif'; x.fillText(veT('fundo'), 6, 12); x.fillText(veT('câmera'), 6, cv.height - 6);
}
function ve3dMapaApertar(e) {
    const g = VE3T.mapaGeo; if (!g) return;
    e.preventDefault(); e.stopPropagation();
    const b = VE3T.mapa.getBoundingClientRect(), mx = (e.clientX - b.left) * VE3T.mapa.width / b.width, my = (e.clientY - b.top) * VE3T.mapa.height / b.height;
    // camada mais perto do clique (linha horizontal na profundidade dela)
    let melhor = null, dm = 12;
    for (const l of g.camadas) {
        const dx = Math.max(g.px(l.x0) - mx, 0, mx - g.px(l.x1)), dd = Math.hypot(dx, g.py(l.z) - my);
        if (dd < dm) { dm = dd; melhor = l; }
    }
    if (!melhor) return;
    if (VE3T.so !== melhor.id) ve3dTelaSelecionar(melhor.id);
    const md = ve3dTelaModeloSel(); if (!md) return;
    VE3T.mapa.setPointerCapture(e.pointerId);
    const base = ve3dEmpurrarBase(md), y0 = e.clientY, porPx = VE3T.mapa.height / b.height / g.esc;
    let hist = false;
    const mover = ev => {
        const dy = ev.clientY - y0; if (!hist && Math.abs(dy) < 3) return;
        if (!hist) { vePushHistory(); hist = true; VE3T.mexendo = true; VE3T.mapaArr = true; }
        // para cima = mais longe: a distância até a câmera cresce o que o mouse subiu no mapa
        ve3dEmpurrar(md, Math.max(0.05, (base.prof - dy * porPx) / base.prof), base);
    };
    const soltar = () => {
        VE3T.mapa.removeEventListener('pointermove', mover); VE3T.mapa.removeEventListener('pointerup', soltar);
        VE3T.mexendo = false; VE3T.mapaArr = false; if (hist) { ve3dMudou(ve3dTelaMidia()); ve3dTelaLado(); }
    };
    VE3T.mapa.addEventListener('pointermove', mover); VE3T.mapa.addEventListener('pointerup', soltar);
}

// painel de uma placa: sem "Apoiar no chão" nem Aparência (cor/acabamento não valem para foto/texto); no lugar,
// a profundidade sem mudar o tamanho e os atalhos
(function () {
    const painel = ve3dPainelHtml;
    ve3dPainelHtml = function (c, so) {
        const h = painel(c, so), m = veMediaOf(c), md = so && ve3dEh(m) && m.c3d.modelos.find(x => x.id === so);
        if (!md || (md.fonte || {}).tipo !== 'placa') return h;
        return h.replace(/<button[^>]*data-p3dacao="chao:[^"]*"[^>]*>[^<]*<\/button>/, '');
    };
    const aparencia = ve3dAparenciaHtml;
    ve3dAparenciaHtml = function (md) {
        if ((md.fonte || {}).tipo !== 'placa') return aparencia(md);
        return vePpSec(veT('Profundidade'), `<div class="ve-pp-botoes"><button class="ve-btn ve-btn-sm" data-3tz="1.12" title="]">${veT('Para o fundo')}</button>
            <button class="ve-btn ve-btn-sm" data-3tz="${(1 / 1.12).toFixed(5)}" title="[">${veT('Para a frente')}</button></div>
            <small class="ve-pp-dica">${veT('Muda a profundidade sem mudar o tamanho na tela (parallax quando a câmera anda). Atalhos: [ e ], Alt + rodinha, ou arraste a linha no mapa do canto.')}</small>`);
    };
})();
