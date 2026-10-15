// =========================================================
// Pocket Editor — camadas em profundidade (o "3D das camadas + câmera" do After Effects), feito DENTRO da Cena 3D
// (editor-3d.js, three.js) para não mexer no montador 2D do editor (pedido do Pailer, 2026-10-14: seguro e econômico).
//   Botão direito nas camadas → "Camadas → Cena 3D (profundidade)": cada camada (foto, texto, forma, desenho, Comp
//   parada…) é desenhada pelo próprio editor num quadro transparente no instante em que começa (com efeitos, máscara,
//   rotação), recortada ao que tem desenho e vira uma PLACA (plano com a imagem) na cena. A câmera fica onde o quadro
//   inteiro tem 1 unidade de altura no Z = 0: o 1º quadro sai IGUAL ao de antes; aí é mexer no Z de cada placa e
//   animar a câmera (◆ da Cena 3D).
//   Placas sem luz (MeshBasic) e cena sem o tom final (c3d.placas = true): a cor da foto/texto não muda.
// fonte da placa: {tipo: 'placa', path, w, h} (w/h em unidades da cena; altura do quadro = 1).
// =========================================================

// placa = plano com a imagem (sem normalizar o tamanho, sem sombra, sem luz)
(function () {
    const carregar = ve3dCarregarModelo;
    ve3dCarregarModelo = async function (md, L) {
        const f = md.fonte || {};
        if (f.tipo !== 'placa') return carregar(md, L);
        const { T } = L, raiz = new T.Group();
        let tex = null;
        try {
            const r = f.path ? await window.pywebview.api.ve_3d_url(f.path) : null;
            if (r && r.success) { tex = await new T.TextureLoader().loadAsync(r.url); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8; }
        } catch (e) { /* imagem sumiu: placa cinza no lugar */ }
        const mat = new T.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x777777, transparent: true, side: T.DoubleSide, depthWrite: false, toneMapped: false, fog: true });
        const obj = new T.Mesh(new T.PlaneGeometry(Math.max(1e-4, +f.w || 1), Math.max(1e-4, +f.h || 1)), mat);
        raiz.add(obj);
        return { raiz, mixer: null, pe: 0, partes: [] };
    };
    // cena de placas: sem o tom final (passo "cru" do motor, editor-3d.js) e sem sombra — a cor da foto/texto não muda
    const aplicar = ve3dAplicar;
    // a ordem de empilhar segue a distância à câmera (a mais perto por cima) e, no mesmo Z, a ordem das camadas.
    // O three ordena os transparentes por renderOrder ANTES da distância (e o de um Group vira groupOrder, que manda em
    // tudo): com renderOrder = camada, a placa criada depois ficava sempre por cima, mesmo atrás. Aqui a distância vem
    // primeiro (z do item = profundidade na tela, b.z − a.z = de trás para a frente) e a camada só desempata.
    const ordem = (a, b) => Math.abs(a.z - b.z) > 1e-7 ? b.z - a.z : (a.groupOrder - b.groupOrder) || (a.renderOrder - b.renderOrder) || (a.id - b.id);
    ve3dAplicar = function (rt, m, t, W, H, op = {}) {
        const placas = !!(m && m.c3d && m.c3d.placas), r = VE3D.motor && VE3D.motor.r;
        if (placas) rt.objs.forEach((o, i) => { o.raiz.renderOrder = i; });
        if (r) r.setTransparentSort(placas ? ordem : null);   // o motor é de todas as cenas: as outras ficam no padrão
        return aplicar(rt, m, t, W, H, op);
    };
    // aparência (cor/material) não vale para placa
    const aparencia = ve3dAparencia;
    ve3dAparencia = function (obj, f, T) { return f && f.tipo === 'placa' ? Promise.resolve() : aparencia(obj, f, T); };
})();

// Desenha UMA camada como o monitor desenha, no instante T, num quadro transparente do tamanho da sequência;
// devolve {cv, x0, y0, w, h} recortado ao que tem desenho (null = nada desenhado)
async function ve3dPlacaDesenho(c, T) {
    const W = VE.seqW, H = VE.seqH, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const src = await veMoFonte(c, T, 1);
    const ph = VE.playhead; VE.playhead = T;
    try { ctx.imageSmoothingQuality = 'high'; veDesenharItens(ctx, cv, [{ c, src }], 1, T); } finally { VE.playhead = ph; }
    const d = ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 1) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W - 1, x1 + 2); y1 = Math.min(H - 1, y1 + 2);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);
    return { cv: out, x0, y0, w, h };
}

// Camadas selecionadas → uma Cena 3D de placas no lugar delas (Ctrl+Z desfaz tudo)
async function ve3dDeCamadas(clips = veSelLista()) {
    const nm = c => c.nome || (VE.media[c.m] || {}).name || 'Camada';
    const ok = clips.filter(c => c && !veIsAudio(c) && !veOculto(c) && !veIsAdj(c) && !ve3dEh(VE.media[c.m]));
    const videos = ok.filter(c => (VE.media[c.m] || {}).kind === 'video' && !(VE.media[c.m] || {}).comp);
    if (!ok.length) { veToast('Selecione as camadas (fotos, textos, formas) que vão para a cena 3D'); return null; }
    const fotos = ok.filter(c => !videos.includes(c));
    if (!fotos.length) { veToast('Vídeo ainda não vira placa na cena 3D (vem na próxima etapa): use fotos, textos, formas ou Comps paradas'); return null; }
    const api = window.pywebview.api, W = VE.seqW, H = VE.seqH;
    const a = Math.min(...fotos.map(c => c.st)), b = Math.max(...fotos.map(veEnd));
    veToast(`Montando ${fotos.length} placa(s)…`);
    const ordem = fotos.slice().sort((p, q) => p.tr - q.tr || p.st - q.st);   // de baixo para cima
    const modelos = [];
    for (let i = 0; i < ordem.length; i++) {
        const c = ordem[i], d = await ve3dPlacaDesenho(c, Math.max(c.st, a) + 1e-3);
        if (!d) continue;
        const r = await api.ve_salvar_png(d.cv.toDataURL('image/png'));
        if (!r || !r.success) continue;
        const md = { id: 'placa' + Date.now().toString(36) + i, nome: nm(c), fonte: { tipo: 'placa', path: r.path, w: d.w / H, h: d.h / H },
            p: { x: (d.x0 + d.w / 2 - W / 2) / H, y: -(d.y0 + d.h / 2 - H / 2) / H, z: i * 0.002, rx: 0, ry: 0, rz: 0, esc: 1 }, kf: {} };
        // camada que não ocupa a cena toda: aparece só no trecho dela
        const t0 = c.st - a, t1 = veEnd(c) - a, dur = b - a, e = 1e-3;
        if (t0 > e || t1 < dur - e) {
            const kv = [];
            if (t0 > e) kv.push([0, 0, 'linear'], [t0 - e, 0, 'linear'], [t0, 1, 'linear']); else kv.push([0, 1, 'linear']);
            if (t1 < dur - e) kv.push([t1 - e, 1, 'linear'], [t1, 0, 'linear']);
            md.kf.visivel = kv; md.p.visivel = 1;
        }
        modelos.push(md);
    }
    if (!modelos.length) { veToast('Nada desenhado nas camadas escolhidas'); return null; }
    // câmera: no Z = 0 o quadro inteiro tem 1 de altura (fov 40°): o 1º quadro igual ao de antes
    const fov = 40, dist = 0.5 / Math.tan(fov * Math.PI / 360);
    const cena = ve3dPadrao();
    Object.assign(cena, { modelos, chao: false, placas: true });
    cena.camera.p = { ...cena.camera.p, azimute: 0, elevacao: 0, dist: +dist.toFixed(5), fov, ax: 0, ay: 0, az: 0 };
    const trMin = Math.min(...fotos.map(c => c.tr));
    vePushHistory();
    VE.clips = VE.clips.filter(c => !fotos.includes(c));
    const r = ve3dNova({ cena, dur: +(b - a).toFixed(4), st: a, nome: veT('Cena 3D (camadas)') });
    const novo = VE.clips[r.clipe];
    if (novo && novo.tr > trMin && veTrackFree(trMin, novo.st, veEnd(novo), novo)) { novo.tr = trMin; veRelayout(); }
    VE.history.pop();   // ve3dNova também guardou: um Ctrl+Z só desfaz a conversão inteira
    veRefresh();
    veToast(`Cena 3D com ${modelos.length} placa(s). Duplo clique abre a tela 3D: mexa no Z das placas e anime a câmera (◆).` +
            (videos.length ? ` ${videos.length} vídeo(s) ficaram de fora (vídeo vem na próxima etapa).` : ''));
    return r;
}

(function () {
    // botão direito na camada: "Camadas → Cena 3D (profundidade)"
    const menu = veClipMenu;
    veClipMenu = function (i, x, y, doc) {
        menu(i, x, y, doc);
        const m = VE._ctx && VE._ctx.m, c = VE.clips[i]; if (!m || !c || veIsAudio(c)) return;
        const alvos = veSelLista().includes(c) ? veSelLista() : [c];
        const b = doc.createElement('button');
        b.className = 've-ctx-item';
        b.textContent = alvos.length > 1 ? `Camadas → Cena 3D (profundidade) (${alvos.length})` : 'Camada → Cena 3D (profundidade)';
        b.title = 'As camadas viram placas numa cena 3D com câmera: mexa no Z de cada uma e anime a câmera (como o 3D das camadas do After Effects)';
        b.onclick = e => { e.stopPropagation(); veClipMenuFechar(); ve3dDeCamadas(alvos).catch(err => veToast(err.message || String(err))); };
        const ref = m.querySelector('[data-ctx="off"]');
        m.insertBefore(b, ref || m.querySelector('[data-ctx="del"]'));
        veCtxPosicionar(m, x, y, doc);
    };
    if (window.VE3DAPI) window.VE3DAPI.deCamadas = clips => ve3dDeCamadas(clips || veSelLista());
})();

// ── olhos e mãos (agente, Kani, Worker): trabalhar PELA TELA, sem adivinhar unidades da cena nem abrir imagem ──
// câmera da cena no instante t (desenha 1 quadro minúsculo só para posicionar a câmera)
function ve3dCamEm(rt, m, t) { ve3dAplicar(rt, m, t, 64, Math.max(2, Math.round(64 * VE.seqH / VE.seqW))); return rt.cam; }
// onde cada objeto aparece no quadro, em % (0..100), no instante t: caixa, quanto sai do quadro, z e distância
function ve3dNaTela(rt, m, t) {
    const T = rt.T, cam = ve3dCamEm(rt, m, t), cx = new T.Box3(), v = new T.Vector3(), out = [];
    for (const o of rt.objs) {
        if (!o.raiz.visible) { out.push({ id: o.md.id, nome: o.md.nome, oculto: true }); continue; }
        cx.setFromObject(o.raiz); if (cx.isEmpty()) continue;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, atras = false;
        for (let i = 0; i < 8; i++) {
            v.set(i & 1 ? cx.max.x : cx.min.x, i & 2 ? cx.max.y : cx.min.y, i & 4 ? cx.max.z : cx.min.z).project(cam);
            if (v.z > 1) atras = true;
            const px = (v.x + 1) * 50, py = (1 - v.y) * 50; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
        const area = Math.max(1e-6, (x1 - x0) * (y1 - y0)), dentro = Math.max(0, Math.min(100, x1) - Math.max(0, x0)) * Math.max(0, Math.min(100, y1) - Math.max(0, y0));
        const r = n => Math.round(n * 10) / 10;
        out.push({ id: o.md.id, nome: o.md.nome, caixa: [r(x0), r(y0), r(x1), r(y1)], fora: Math.round(100 - dentro * 100 / area), z: r(o.raiz.position.z * 100) / 100,
            dist: r(cam.position.distanceTo(o.raiz.position) * 100) / 100, ...(atras ? { atrasDaCamera: true } : {}) });
    }
    return out;
}
// tamanho/posição NA TELA → cena: x, y em % do quadro (50,50 = centro), h = % da altura OU w = % da largura, no plano z
function ve3dColocar(rt, m, md, op, t = 0) {
    const T = rt.T, cam = ve3dCamEm(rt, m, t), z = op.z ?? (md.p.z || 0);
    const nd = new T.Vector3(((op.x ?? 50) / 50) - 1, 1 - (op.y ?? 50) / 50, 0.5).unproject(cam).sub(cam.position).normalize();
    const k = Math.abs(nd.z) > 1e-6 ? (z - cam.position.z) / nd.z : 1, p = cam.position.clone().addScaledVector(nd, k);
    const dir = new T.Vector3(); cam.getWorldDirection(dir);
    const prof = p.clone().sub(cam.position).dot(dir), visH = 2 * prof * Math.tan(cam.fov * Math.PI / 360);
    const f = md.fonte || {}, alvoH = op.h != null ? op.h / 100 * visH : op.w != null ? (op.w / 100 * visH * VE.seqW / VE.seqH) * ((+f.h || 1) / (+f.w || 1)) : null;
    Object.assign(md.p, { x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +z.toFixed(4) });
    if (alvoH != null) md.p.esc = +(alvoH / (+f.h || 1)).toFixed(4);
    if (op.rz != null) md.p.rz = op.rz;
    return md.p;
}
(function () {
    const A = window.VE3DAPI; if (!A) return;
    // VE3DAPI.naTela(cena, t): [{nome, caixa:[x0,y0,x1,y1] em %, fora:% fora do quadro, z, dist}] — "ver" sem imagem
    A.naTela = async (cena, t = 0) => { const m = ve3dAlvo(cena), rt = await ve3dGarantir(m); return ve3dNaTela(rt, m, t); };
    // VE3DAPI.colocar(cena, 'nome', {x, y, h|w, z, rz}, t): posiciona pela tela (o tamanho na tela fica o pedido em qualquer z)
    A.colocar = async (cena, quem, op = {}, t = 0) => { const m = ve3dAlvo(cena), rt = await ve3dGarantir(m), md = ve3dObj(m, quem); vePushHistory(); const p = ve3dColocar(rt, m, md, op, t); ve3dMudou(m); return p; };
    // VE3DAPI.folha(cena, [t...], largura): UMA imagem JPEG com os quadros lado a lado (rótulo com o tempo) — conferir de uma vez
    A.folha = async (cena, tempos = [0], larg = 480) => {
        const m = ve3dAlvo(cena), rt = await ve3dGarantir(m), h = Math.round(larg * VE.seqH / VE.seqW), col = Math.min(tempos.length, 3), lin = Math.ceil(tempos.length / col);
        const cv = document.createElement('canvas'); cv.width = col * larg; cv.height = lin * h; const x = cv.getContext('2d');
        x.fillStyle = '#222'; x.fillRect(0, 0, cv.width, cv.height); x.font = '600 14px sans-serif';
        tempos.forEach((t, i) => {
            const px = (i % col) * larg, py = Math.floor(i / col) * h; x.drawImage(ve3dAplicar(rt, m, t, larg, h), px, py);
            x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(px, py, 64, 20); x.fillStyle = '#fff'; x.fillText(`${(+t).toFixed(2)} s`, px + 6, py + 15);
        });
        return cv.toDataURL('image/jpeg', 0.82);
    };
})();
