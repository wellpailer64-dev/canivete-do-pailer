// =========================================================
// Pocket Editor — luzes da Cena 3D como no Blender: Softbox (área), Spot, Ponto e Sol são OBJETOS da cena
// (lista, gizmo, ◆, H esconde = desliga, Ctrl+D, renomear). Mesmos nomes e números do Blender: potência em W (Sol:
// força), tamanho da softbox, ângulo do spot, temperatura em K + cor; sempre MIRAM num ponto (Mirar X/Y/Z, como o
// "Track To" do Blender) e a softbox gira no próprio eixo (Girar no eixo). No render fotorrealista cada luz vira a
// MESMA luz no Blender (Functions/blender_estudio.py: spec.luzes; sem luz na cena, o estúdio padrão continua).
// Com luz na cena, a luz automática antiga (C.luz) só dá um ambiente fraco. fonte = {tipo: 'luz', luz: tipo}; o resto
// fica em md.p (anima com ◆): potencia, largura, altura, angulo, kelvin, cor, mx/my/mz (mira), giro.
// =========================================================

const VE3D_LUZ_TIPOS = { softbox: 'Softbox', spot: 'Spot', ponto: 'Ponto', sol: 'Sol' };
const VE3D_LUZ_PADRAO = { softbox: { potencia: 250, largura: 0.6, altura: 1.6 }, spot: { potencia: 400, angulo: 35 }, ponto: { potencia: 150 }, sol: { potencia: 3 } };

// temperatura de cor (K) → RGB (aproximação de Tanner Helland, a mesma ideia do Blackbody do Blender)
function ve3dKelvin(k) {
    const t = Math.max(1000, Math.min(40000, k || 6500)) / 100, c = v => Math.max(0, Math.min(255, v)) / 255;
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return [c(r), c(g), c(b)];
}
// cor final = temperatura × cor (cor branca = só a temperatura)
function ve3dLuzRgb(v) {
    const k = ve3dKelvin(v('kelvin') ?? 6500), h = (v('cor') || '#ffffff').replace('#', ''), c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    return k.map((x, i) => x * c[i]);
}

let VE3D_RECT_OK = false;
async function ve3dLuzObjeto(f, T) {
    if (!VE3D_RECT_OK) { try { const { RectAreaLightUniformsLib } = await import('three/addons/lights/RectAreaLightUniformsLib.js'); RectAreaLightUniformsLib.init(); } catch (e) { /* sem área: cai para spot */ } VE3D_RECT_OK = true; }
    const tipo = f.luz || 'softbox', g = new T.Group(), giro = new T.Group(); g.add(giro);
    let L;
    if (tipo === 'softbox') L = new T.RectAreaLight(0xffffff, 1, 1, 1);
    else if (tipo === 'spot') { L = new T.SpotLight(0xffffff, 1, 0, 0.6, 0.35, 2); L.target.position.set(0, 0, 1); giro.add(L.target); }
    else if (tipo === 'ponto') L = new T.PointLight(0xffffff, 1, 0, 2);
    else { L = new T.DirectionalLight(0xffffff, 1); L.target.position.set(0, 0, 1); giro.add(L.target); }
    L.rotation.y = Math.PI;   // a luz olha para −Z; o grupo mira com +Z (lookAt de objeto comum)
    giro.add(L);
    // o que se vê só na tela 3D: o painel da softbox (emite), o cone do spot, a bolinha do ponto, a seta do sol
    const ver = new T.Group(); giro.add(ver);
    // como o Blender desenha: contorno da luz e um véu leve (o painel cheio tampava a vista)
    const mb = new T.MeshBasicMaterial({ color: 0xfff6e0, side: T.DoubleSide, transparent: true, opacity: tipo === 'softbox' ? 0.1 : 0.85, depthWrite: false, toneMapped: false });
    if (tipo === 'softbox') {
        ver.add(new T.Mesh(new T.PlaneGeometry(1, 1), mb));
        const ar = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(1, 1)), new T.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, toneMapped: false })); ver.add(ar);
        const seta = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, 0.35)]), new T.LineBasicMaterial({ color: 0xffe9a8, toneMapped: false })); ver.add(seta);   // para onde ela ilumina
    }
    else if (tipo === 'spot') { const co = new T.Mesh(new T.ConeGeometry(0.12, 0.22, 24, 1, true), mb); co.rotation.x = -Math.PI / 2; co.position.z = 0.1; ver.add(co); }
    else if (tipo === 'ponto') ver.add(new T.Mesh(new T.SphereGeometry(0.07, 20, 14), mb));
    else { ver.add(new T.Mesh(new T.SphereGeometry(0.1, 20, 14), mb)); const s = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.6), mb); s.rotation.x = Math.PI / 2; s.position.z = 0.35; ver.add(s); }
    const alvo = new T.Vector3();
    g.userData.semNormalizar = true;
    // a cada quadro (ve3dAplicar): mira, gira, potência/tamanho/cor; o desenho de ajuda só na tela 3D
    g.userData.atualizar = (o, v, op) => {
        const raiz = o.raiz; raiz.scale.set(1, 1, 1); o.contato.visible = false;
        alvo.set(v('mx') ?? 0, v('my') ?? 0.4, v('mz') ?? 0);
        raiz.updateMatrixWorld(); raiz.lookAt(alvo);   // mira (Track To)
        giro.rotation.z = (v('giro') || 0) * Math.PI / 180;
        const [r, gg, b] = ve3dLuzRgb(v), W = v('potencia') ?? VE3D_LUZ_PADRAO[tipo].potencia; L.color.setRGB(r, gg, b);
        ver.visible = !!(op && op.cam);   // tela 3D (câmera própria): mostra; monitor e exportação: não
        mb.color.setRGB(0.55 + 0.45 * r, 0.55 + 0.45 * gg, 0.55 + 0.45 * b);
        if (tipo === 'softbox') {
            const lw = Math.max(0.02, v('largura') ?? 0.6), lh = Math.max(0.02, v('altura') ?? 1.6);
            L.width = lw; L.height = lh; L.intensity = W / (lw * lh) * 0.035; ver.scale.set(lw, lh, 1);
        } else if (tipo === 'spot') { L.angle = Math.min(1.5, (v('angulo') ?? 35) * Math.PI / 360); L.intensity = W * 0.06; }
        else if (tipo === 'ponto') L.intensity = W * 0.05;
        else L.intensity = W * 0.9;
    };
    return g;
}

// ── painel da luz (no lugar das propriedades de modelo) ──
function ve3dLuzLin(md, k, rot, min, max, passo, un, pad, t) {
    const v = ve3dVal(md, k, t) ?? pad, kf = (md.kf && md.kf[k]) || [], anim = kf.length > 0, aqui = kf.some(x => Math.abs(x[0] - t) < 0.5 / (V3.fps || 30));
    const vt = v == null ? '' : Math.round(v * 1000) / 1000, q = veEsc(md.id);
    return `<div class="ve-pp-l ve-p3d"><label>${veT(rot)}</label><input type="range" data-p3d="${q}|${k}" min="${min}" max="${max}" step="${passo}" value="${v ?? (min + max) / 2}">
        <span class="ve-prop-num"><input type="number" data-p3d="${q}|${k}" step="${passo}" value="${vt}"><i>${un || ''}</i></span>
        <button class="ve-p3d-kf${anim ? ' on' : ''}${aqui ? ' aqui' : ''}" data-p3dkf="${q}|${k}" title="${veT(anim ? 'Animado: mexer grava quadro-chave aqui. Clique para tirar a animação' : 'Animar com quadros-chave')}">◆</button></div>`;
}
function ve3dLuzPainel(c, md) {
    const t = Math.max(0, veSrcAt(c, V3.t)), tipo = md.fonte.luz || 'softbox', P = VE3D_LUZ_PADRAO[tipo] || {}, q = veEsc(md.id);
    const L = (k, r, a, b, p, u, d) => ve3dLuzLin(md, k, r, a, b, p, u, d, t);
    const cor = veEsc(md.p.cor || '#ffffff');
    return vePpSec(`${veT(VE3D_LUZ_TIPOS[tipo])} · ${veEsc(md.nome)}`,
        L('potencia', tipo === 'sol' ? 'Força' : 'Potência', 0, tipo === 'sol' ? 20 : 2000, tipo === 'sol' ? 0.1 : 5, tipo === 'sol' ? '' : 'W', P.potencia) +
        (tipo === 'softbox' ? L('largura', 'Largura', 0.05, 4, 0.01, '', P.largura) + L('altura', 'Altura', 0.05, 4, 0.01, '', P.altura) + L('giro', 'Girar no eixo', -180, 180, 1, '°', 0) : '') +
        (tipo === 'spot' ? L('angulo', 'Ângulo do cone', 5, 160, 1, '°', P.angulo) : '') +
        L('kelvin', 'Temperatura', 1500, 12000, 100, 'K', 6500) +
        `<div class="ve-pp-l"><label>${veT('Cor (filtro)')}</label><input type="color" data-p3d="${q}|cor" value="${cor}"></div>` +
        `<small class="ve-pp-dica">${veT('Temperatura: 2700 K quente (lâmpada), 5600 K luz do dia, 8000 K fria. Softbox maior = sombra mais macia.')}</small>`) +
        vePpSec(veT('Posição e mira'), L('x', 'X', -6, 6, 0.01) + L('y', 'Y', -1, 6, 0.01) + L('z', 'Z', -6, 6, 0.01) +
            L('mx', 'Mirar X', -3, 3, 0.01, '', 0) + L('my', 'Mirar Y', -1, 3, 0.01, '', 0.4) + L('mz', 'Mirar Z', -3, 3, 0.01, '', 0) +
            `<small class="ve-pp-dica">${veT('A luz sempre aponta para o ponto de mira (como o Track To do Blender). Arraste a luz na tela 3D pelo gizmo.')}</small>
            <div class="ve-pp-botoes"><button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3dacao="dup:${q}" title="Ctrl+D">${veT('Duplicar')}</button>
            <button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3dacao="rem:${q}" title="Delete">${veT('Tirar da cena')}</button></div>`);
}
(function () {
    const painel = ve3dPainelHtml;
    ve3dPainelHtml = function (c, so) {
        const m = veMediaOf(c), md = so && ve3dEh(m) && m.c3d.modelos.find(x => x.id === so);
        if (md && (md.fonte || {}).tipo === 'luz') return ve3dLuzPainel(c, md);
        return painel(c, so);
    };
    // cor da luz: input de cor não dispara 'change' útil no meio do arraste — o ve3dEvento grava o valor (texto) em p.cor
})();

// ── API e presets ──
// VE3DAPI.luz({tipo: softbox|spot|ponto|sol, x, y, z, mira: [x, y, z], potencia, largura, altura, angulo, kelvin, cor, giro, nome})
VE3DAPI.luz = async function (op = {}) {
    const m = ve3dAlvo(op.cena), tipo = VE3D_LUZ_TIPOS[op.tipo] ? op.tipo : 'softbox', P = VE3D_LUZ_PADRAO[tipo];
    V3.hist();
    const id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), mi = op.mira || [0, 0.4, 0];
    const n = m.c3d.modelos.filter(x => (x.fonte || {}).tipo === 'luz' && x.fonte.luz === tipo).length;
    m.c3d.modelos.push({ id, nome: op.nome || `${veT(VE3D_LUZ_TIPOS[tipo]).toLowerCase()}${n ? ' ' + (n + 1) : ''}`, fonte: { tipo: 'luz', luz: tipo },
        p: { x: op.x ?? -1.6, y: op.y ?? 1.8, z: op.z ?? 2.2, rx: 0, ry: 0, rz: 0, esc: 1, contato: 0, mx: mi[0], my: mi[1], mz: mi[2],
            potencia: op.potencia ?? P.potencia, ...(tipo === 'softbox' ? { largura: op.largura ?? P.largura, altura: op.altura ?? P.altura, giro: op.giro ?? 0 } : {}),
            ...(tipo === 'spot' ? { angulo: op.angulo ?? P.angulo } : {}), kelvin: op.kelvin ?? 6500, cor: op.cor || '#ffffff' }, kf: {} });
    ve3dMudou(m); await ve3dGarantir(m);
    return { id };
};
// Estúdio 3 pontos (o que deu o resultado de agência): chave em faixa, recorte atrás, preenchimento fraco e teto, em
// volta do lado de onde a câmera olha. Distâncias/tamanhos na escala da Cena 3D (bastão = 1 de altura).
VE3DAPI.estudio3pontos = async function (op = {}) {
    const m = ve3dAlvo(op.cena), az = (ve3dVal(m.c3d.camera, 'azimute', 0) ?? 20), cy = 0.42, d = 3.1;
    const pos = (a, e, dd = d) => { const r = (az + a) * Math.PI / 180, el = e * Math.PI / 180; return { x: +(dd * Math.cos(el) * Math.sin(r)).toFixed(3), y: +(cy + dd * Math.sin(el)).toFixed(3), z: +(dd * Math.cos(el) * Math.cos(r)).toFixed(3) }; };
    const ids = [];
    for (const [nome, tipo, a, e, extra] of [
        ['chave', 'softbox', -58, 18, { potencia: 265, largura: 0.62, altura: 3.9, kelvin: 5600 }],
        ['recorte', 'softbox', 150, 22, { potencia: 330, largura: 0.5, altura: 3.4, kelvin: 6500 }],
        ['preenchimento', 'softbox', 40, 5, { potencia: 35, largura: 2.0, altura: 2.0, kelvin: 6000 }],
        ['teto', 'softbox', 0, 82, { potencia: 85, largura: 2.7, altura: 2.7, kelvin: 6500 }]])
        ids.push((await VE3DAPI.luz({ cena: m.id, tipo, nome, ...pos(a, e), mira: [0, cy, 0], ...extra })).id);
    return { ids };
};
