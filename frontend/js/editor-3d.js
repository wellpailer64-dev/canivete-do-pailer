// =========================================================
// Editor Kanivete — CENA 3D (camadas 3D como no After Effects 2024+): modelos .glb/.gltf/.obj (com a animação que vier
// neles) e primitivas, câmera em órbita, luz principal com sombra, ambiente de estúdio (reflexos PBR), chão que só
// recebe sombra, fundo transparente — tudo com quadros-chave. three.js r170 local (frontend/vendor/three, MIT).
// A mídia é um VÍDEO COM ALFA, como a Comp: { kind:'video', c3d: cena, c3dSig, path }. O monitor desenha AO VIVO
// (ve3dQuadro); para exportar, o MESMO código renderiza quadro a quadro → .mov ProRes 4444 (Functions/cena3d.py).
// Unidades: o modelo é medido, apoiado no chão (y = 0) e escalado para 1 de altura (p.esc multiplica). Tempo = segundos
// dentro do clipe (veSrcAt). Quadros-chave: kf[prop] = [[t, valor, 'suave'|'linear'], ...] (números).
// =========================================================
const VE3D = { lib: null, rt: new Map(), telas: new WeakMap(), atual: null, falhas: new Map(), espera: [], timer: 0 };
const VE3D_COR = 'roxo';
const VE3D_MATERIAIS = {   // os mesmos presets do render no Blender (Functions/blender_cena.py)
    papel: { roughness: 0.82 }, fosco: { roughness: 0.65 }, plastico: { roughness: 0.32 }, ceramica: { roughness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.04 },
    metal: { roughness: 0.22, metalness: 0.35, clearcoat: 1 }, vidro: { roughness: 0.02, transmission: 1, ior: 1.45, thickness: 0.2 },
};
const ve3dEh = m => !!(m && m.c3d);
function ve3dLib() {
    if (!VE3D.lib) VE3D.lib = (async () => {
        const T = await import('three');
        const [{ GLTFLoader }, { OBJLoader }, { RoomEnvironment }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'),
            import('three/addons/loaders/OBJLoader.js'), import('three/addons/environments/RoomEnvironment.js')]);
        return { T, GLTFLoader, OBJLoader, RoomEnvironment };
    })();
    return VE3D.lib;
}
function ve3dPadrao() {
    return { modelos: [], fundo: null, chao: true,
        camera: { p: { azimute: 20, elevacao: 12, dist: null, fov: 32, ax: 0, ay: 0.5, az: 0 }, kf: {} },   // dist null = enquadra sozinho
        luz: { p: { azimute: -40, elevacao: 50, intensidade: 2.6, ambiente: 0.8, sombra: 0.5, cor: '#ffffff' }, kf: {} } };
}
function ve3dVal(o, k, t) {   // valor da propriedade no tempo t (quadros-chave com suavização; sem quadro-chave = o fixo)
    const kf = o.kf && o.kf[k];
    if (!kf || !kf.length) return o.p[k];
    if (t <= kf[0][0]) return kf[0][1];
    for (let i = 1; i < kf.length; i++) if (t <= kf[i][0]) {
        const [t0, v0] = kf[i - 1], [t1, v1] = kf[i];
        if (typeof v0 !== 'number' || typeof v1 !== 'number') return v0;
        const u = (t - t0) / ((t1 - t0) || 1e-9), s = kf[i][2] === 'linear' ? u : u * u * (3 - 2 * u);
        return v0 + (v1 - v0) * s;
    }
    return kf.at(-1)[1];
}
const ve3dChave = m => JSON.stringify([m.c3d.modelos.map(md => [md.id, md.fonte]), m.c3d.chao !== false]);   // o que exige remontar a cena
const ve3dSig = m => 'c3d.' + vePrHash(JSON.stringify([1, m.c3d, VE.seqW, VE.seqH, VE.fps, +m.dur || 0]));

async function ve3dCarregarModelo(md, L) {
    const { T, GLTFLoader, OBJLoader } = L, raiz = new T.Group(), norm = new T.Group(); raiz.add(norm);
    let obj, mixer = null;
    const f = md.fonte || {};
    if (f.tipo === 'primitiva') {
        const geo = { esfera: () => new T.SphereGeometry(0.5, 96, 64), cubo: () => new T.BoxGeometry(1, 1, 1, 1, 1, 1), cilindro: () => new T.CylinderGeometry(0.4, 0.4, 1, 96),
            toro: () => new T.TorusGeometry(0.4, 0.15, 64, 160), cone: () => new T.ConeGeometry(0.45, 1, 96), plano: () => new T.PlaneGeometry(1, 1) }[f.forma || 'esfera'] || (() => new T.SphereGeometry(0.5, 96, 64));
        obj = new T.Mesh(geo(), new T.MeshPhysicalMaterial({ color: new T.Color(f.cor || '#ec6e48'), ...(VE3D_MATERIAIS[f.material] || VE3D_MATERIAIS.plastico) }));
        if (f.forma === 'plano') obj.rotation.x = -Math.PI / 2;
    } else {
        const r = await window.pywebview.api.ve_3d_url(f.path || '');
        if (!r || !r.success) throw new Error(`modelo 3D não encontrado: ${f.path}`);
        if (/\.obj$/i.test(f.path)) {
            obj = await new OBJLoader().loadAsync(r.url);
            obj.traverse(o => { if (o.isMesh && (!o.material || o.material.type === 'MeshPhongMaterial')) o.material = new T.MeshPhysicalMaterial({ color: new T.Color(f.cor || '#d9d4cc'), ...(VE3D_MATERIAIS[f.material] || VE3D_MATERIAIS.plastico) }); });
        } else {
            const g = await new GLTFLoader().loadAsync(r.url); obj = g.scene;
            if (g.animations && g.animations.length) { mixer = new T.AnimationMixer(obj); g.animations.forEach(a => mixer.clipAction(a).play()); }
        }
    }
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    norm.add(obj);
    const b = new T.Box3().setFromObject(obj), tam = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
    const s = 1 / Math.max(1e-6, tam.y > 1e-3 ? tam.y : Math.max(tam.x, tam.z));   // 1 de altura (plano: 1 de lado)
    norm.scale.setScalar(s); norm.position.set(-c.x * s, -b.min.y * s, -c.z * s);
    return { raiz, mixer };
}
async function ve3dMontar(m) {
    const L = await ve3dLib(), { T, RoomEnvironment } = L, cv = document.createElement('canvas');
    const r = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.NeutralToneMapping; r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    const sc = new T.Scene(), pm = new T.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const cam = new T.PerspectiveCamera(32, 16 / 9, 0.01, 500);
    const key = new T.DirectionalLight(0xffffff, 2.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 5; key.shadow.bias = -0.0004;
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 40 }); sc.add(key, key.target);
    const amb = new T.HemisphereLight(0xffffff, 0x8a8a8a, 0.8); sc.add(amb);
    const chao = new T.Mesh(new T.PlaneGeometry(80, 80), new T.ShadowMaterial({ opacity: 0.5 })); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; sc.add(chao);
    const objs = [];
    for (const md of m.c3d.modelos) { const o = await ve3dCarregarModelo(md, L); sc.add(o.raiz); objs.push({ md, ...o }); }
    return { r, cv, sc, cam, key, amb, chao, objs, T, chave: ve3dChave(m) };
}
// cena pronta para desenhar já (null = montando; quando ficar pronta, o monitor redesenha)
function ve3dRuntime(m) {
    const e = VE3D.rt.get(m.id), chave = ve3dChave(m);
    if (e && e.rt && e.rt.chave === chave) return e.rt;
    if (!e || e.chave !== chave) {
        const novo = { chave, rt: e && e.rt, prom: null };
        novo.prom = ve3dMontar(m).then(rt => { if (novo.rt && novo.rt !== rt) { try { novo.rt.r.dispose(); } catch (x) { /* contexto */ } } novo.rt = rt; veCacheInvalidate(); if (VE.ready) veDrawMonitorSoon(); return rt; })
            .catch(err => { novo.erro = err.message || String(err); veToast(`${veT('Cena 3D')}: ${novo.erro}`); });
        VE3D.rt.set(m.id, novo);
    }
    return null;
}
async function ve3dGarantir(m) { const rt = ve3dRuntime(m); if (rt) return rt; const e = VE3D.rt.get(m.id); const r = await e.prom; if (!r) throw new Error(e.erro || 'cena 3D não montou'); return r; }
function ve3dAplicar(rt, m, t, W, H) {   // tudo o que anima, no tempo t (s, dentro do clipe), e desenha W×H
    const { T, cam, key, amb, chao, r } = rt, C = m.c3d, cp = k => ve3dVal(C.camera, k, t), lp = k => ve3dVal(C.luz, k, t), rad = Math.PI / 180;
    // distância automática: cabe ~2,4 de largura e ~1,6 de altura (quadro em pé ou deitado)
    const fov = cp('fov'), hfov = 2 * Math.atan(Math.tan(fov * rad / 2) * W / H), dAuto = Math.max(1.2 / Math.tan(hfov / 2), 0.8 / Math.tan(fov * rad / 2));
    const alvo = new T.Vector3(cp('ax'), cp('ay'), cp('az')), az = cp('azimute') * rad, el = cp('elevacao') * rad, d = cp('dist') ?? dAuto;
    cam.position.set(alvo.x + d * Math.cos(el) * Math.sin(az), alvo.y + d * Math.sin(el), alvo.z + d * Math.cos(el) * Math.cos(az));
    cam.fov = cp('fov'); cam.aspect = W / H; cam.lookAt(alvo); cam.updateProjectionMatrix();
    const la = lp('azimute') * rad, le = lp('elevacao') * rad;
    key.position.set(alvo.x + 8 * Math.cos(le) * Math.sin(la), alvo.y + 8 * Math.sin(le), alvo.z + 8 * Math.cos(le) * Math.cos(la)); key.target.position.copy(alvo);
    key.intensity = lp('intensidade'); key.color.set(lp('cor') || '#ffffff'); amb.intensity = lp('ambiente');
    chao.visible = C.chao !== false; chao.material.opacity = lp('sombra');
    for (const o of rt.objs) {
        const v = k => ve3dVal(o.md, k, t);
        o.raiz.position.set(v('x') || 0, v('y') || 0, v('z') || 0); o.raiz.rotation.set((v('rx') || 0) * rad, (v('ry') || 0) * rad, (v('rz') || 0) * rad);
        o.raiz.scale.setScalar(v('esc') ?? 1); o.raiz.visible = v('visivel') !== 0;
        if (o.mixer) o.mixer.setTime(Math.max(0, t * (o.md.p.velocidade ?? 1)));
    }
    if (C.fundo) r.setClearColor(new T.Color(C.fundo), 1); else r.setClearColor(0x000000, 0);
    r.setPixelRatio(1); r.setSize(Math.max(2, Math.round(W)), Math.max(2, Math.round(H)), false);
    r.render(rt.sc, cam);
    return rt.cv;
}
// monitor: quadro da cena do clipe c no instante T (da timeline), na resolução em que aparece
function ve3dQuadro(c, T, alvo) {
    const m = veMediaOf(c); if (!ve3dEh(m)) return null;
    const rt = ve3dRuntime(m); if (!rt) return null;
    const k = Math.min(1, Math.max(0.25, alvo || 1)), W = VE.seqW * k, H = VE.seqH * k;
    const src = ve3dAplicar(rt, m, Math.max(0, veSrcAt(c, T)), W, H), o = c._o || c;
    let cv = VE3D.telas.get(o); if (!cv) { cv = document.createElement('canvas'); VE3D.telas.set(o, cv); }
    if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(src, 0, 0);
    return cv;
}

// ── mídia, clipe, render do arquivo (exportação) ──
function ve3dMidias() { return VE.media.filter(m => m && !m.removido && ve3dEh(m)); }
function ve3dNova(op = {}) {
    if (!VE.ready) throw new Error('abra um vídeo ou crie uma timeline antes');
    const dur = +(op.dur || 5), st = op.st ?? VE.playhead, nome = op.nome || veT('Cena 3D');
    vePushHistory();
    const m = { id: VE.media.length, kind: 'video', c3d: op.cena || ve3dPadrao(), name: nome, cor: VE3D_COR, path: null, dur, _criada: true, _aoVivo: true,
        pasta: typeof vePjDestino === 'function' ? vePjDestino() : null,
        info: { duration: dur, width: VE.seqW, height: VE.seqH, fps: VE.fps || 30, has_audio: false, alfa: true, provisoria: true } };
    VE.media.push(m);
    const novo = { tr: 0, st, s: 0, e: dur, m: m.id, cor: VE3D_COR };
    let tr = Math.max(0, ...VE.clips.filter(c => c.st < st + dur && veEnd(c) > st).map(c => c.tr + 1), 0);
    while (veTrkLocked(tr) || !veTrackFree(tr, st, st + dur, novo)) tr++;
    novo.tr = tr; veEnsureTrackIndex(tr, { refresh: true });
    VE.clips.push(novo); veRelayout(); veSelDefinir([novo], novo); veSeqSalvarAtiva(); veAfterEdit(VE.playhead);
    ve3dMudou(m);
    return { midia: m.id, clipe: VE.clips.indexOf(novo) };
}
function ve3dMudou(m) {   // a cena mudou: o monitor desenha ao vivo e o arquivo é refeito em segundo plano
    m._aoVivo = true; VE.dirty = true; veCacheInvalidate(); if (VE.ready) veDrawMonitorSoon();
    clearTimeout(VE3D.timer); VE3D.timer = setTimeout(ve3dVerificar, 2500);
}
function ve3dVerificar() {
    if (!VE.ready || VE3D.atual) return;
    if (VE.playing && !VE3D.exportando) { clearTimeout(VE3D.timer); VE3D.timer = setTimeout(ve3dVerificar, 2500); return; }
    const pend = ve3dMidias().find(m => (m.c3dSig !== ve3dSig(m) || !m.path) && !VE3D.falhas.has(ve3dSig(m)));
    if (pend) ve3dRenderizar(pend);
}
async function ve3dRenderizar(m) {
    const api = window.pywebview && window.pywebview.api, sig = ve3dSig(m);
    if (!api || !api.ve_c3d_inicio) return;
    VE3D.atual = { mid: m.id, sig, pct: 0, nome: m.name };
    try {
        const ini = await api.ve_c3d_inicio(vePrPrefs().dir, sig);
        if (!ini || !ini.success) throw new Error((ini && ini.error) || 'não abriu o render');
        let path = ini.path;
        if (!ini.pronto) {
            const rt = await ve3dGarantir(m), W = VE.seqW, H = VE.seqH, fps = VE.fps || 30, n = Math.max(1, Math.round((+m.dur || 1) * fps));
            for (let i = 0; i < n; i++) {
                ve3dAplicar(rt, m, i / fps, W, H);
                const b = await new Promise(res => rt.cv.toBlob(res, 'image/png'));
                const rr = await fetch(ini.url + `q${String(i).padStart(5, '0')}.png`, { method: 'POST', body: b, headers: { 'Content-Type': 'image/png' } });
                if (!rr.ok && rr.status !== 204) throw new Error(`envio do quadro ${i}: HTTP ${rr.status}`);
                if (i % 24 === 23) await api.ve_c3d_lote(ini.sessao, ini.pasta);
                VE3D.atual.pct = Math.round(i * 90 / n);
            }
            const f = await api.ve_c3d_fim(vePrPrefs().dir, sig, ini.sessao, ini.pasta, fps, n);
            if (!f || !f.success) throw new Error((f && f.error) || 'não montou o vídeo');
            path = f.path;
        }
        if (ve3dSig(m) === sig) { m.path = path; m.c3dSig = sig; delete m.erro; veMidiaPreparar(m, true); VE.dirty = true; veCacheInvalidate(); }
    } catch (e) {
        VE3D.falhas.set(sig, (e && e.message) || String(e));
        veToast(`${veT('Falha ao renderizar a cena 3D')} ${m.name}: ${(e && e.message) || e}`);
    } finally {
        VE3D.atual = null; VE3D.espera.splice(0).forEach(r => r());
        setTimeout(ve3dVerificar, 300);
    }
}
// exportação: espera as cenas 3D usadas estarem renderizadas (como veCompProntas)
async function ve3dProntas(aviso) {
    VE3D.exportando = true;
    try {
        for (let volta = 0; volta < 1000; volta++) {
            const usados = new Set(); (VE.sequences || []).forEach(s => (s.clips || []).forEach(c => usados.add(c.m || 0))); VE.clips.forEach(c => usados.add(c.m || 0));
            const pend = ve3dMidias().filter(m => usados.has(m.id) && (m.c3dSig !== ve3dSig(m) || !m.path));
            if (!pend.length) return;
            const falha = pend.map(m => VE3D.falhas.get(ve3dSig(m))).find(Boolean); if (falha) throw new Error(`${veT('a cena 3D não renderizou')}: ${falha}`);
            if (!VE3D.atual) ve3dRenderizar(pend[0]);
            if (aviso && VE3D.atual) aviso(`${veT('Renderizando a cena 3D')} "${VE3D.atual.nome}"... ${VE3D.atual.pct || 0}%`);
            await new Promise(r => { VE3D.espera.push(r); setTimeout(r, 500); });
        }
    } finally { VE3D.exportando = false; }
}

// ── API (agente, Worker e a interface usam a mesma) ──
function ve3dAlvo(ref) {   // mídia da cena: id da mídia, nome, ou o clipe selecionado
    if (ref != null) { const m = typeof ref === 'number' ? VE.media[ref] : VE.media.find(x => x && ve3dEh(x) && x.name === ref); if (ve3dEh(m)) return m; }
    const c = (typeof veSelLista === 'function' ? veSelLista() : []).find(c => ve3dEh(veMediaOf(c))) || VE.clips.find(c => ve3dEh(veMediaOf(c)) && VE.playhead >= c.st && VE.playhead < veEnd(c));
    const m = c && veMediaOf(c); if (!ve3dEh(m)) throw new Error('nenhuma cena 3D selecionada'); return m;
}
function ve3dObj(m, quem) { const C = m.c3d; if (quem === 'camera') return C.camera; if (quem === 'luz') return C.luz; const md = C.modelos.find(x => x.id === quem || x.nome === quem); if (!md) throw new Error(`modelo "${quem}" não existe na cena`); return md; }
window.VE3DAPI = {
    nova: (op = {}) => ve3dNova(op),
    // modelo: caminho (.glb/.gltf/.obj) ou primitiva (esfera|cubo|cilindro|toro|cone|plano) com cor/material
    async modelo(op = {}) {
        const m = ve3dAlvo(op.cena); vePushHistory();
        const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const fonte = op.arquivo ? { tipo: 'arquivo', path: op.arquivo, ...(op.cor ? { cor: op.cor } : {}), ...(op.material ? { material: op.material } : {}) }
            : { tipo: 'primitiva', forma: op.forma || 'esfera', cor: op.cor || '#ec6e48', material: op.material || 'plastico' };
        m.c3d.modelos.push({ id, nome: op.nome || (op.arquivo ? op.arquivo.split(/[\\/]/).pop() : op.forma || 'esfera'), fonte,
            p: { x: op.x || 0, y: op.y || 0, z: op.z || 0, rx: op.rx || 0, ry: op.ry || 0, rz: op.rz || 0, esc: op.esc ?? 1, velocidade: op.velocidade ?? 1 }, kf: {} });
        ve3dMudou(m); await ve3dGarantir(m); return { id, modelos: m.c3d.modelos.length };
    },
    // definir: valor fixo (sem quadro-chave) de camera|luz|<modelo>.prop
    definir(quem, valores, cena) { const m = ve3dAlvo(cena), o = ve3dObj(m, quem); vePushHistory(); Object.assign(o.p, valores); ve3dMudou(m); return o.p; },
    // kf: quadro-chave em t (s dentro do clipe) — valores {prop: número}; suave (padrão) ou linear
    kf(quem, t, valores, op = {}) {
        const m = ve3dAlvo(op.cena), o = ve3dObj(m, quem); vePushHistory();
        for (const [k, v] of Object.entries(valores)) {
            const l = (o.kf[k] = o.kf[k] || []).filter(x => Math.abs(x[0] - t) > 1e-6); l.push([+t, v, op.linear ? 'linear' : 'suave']); l.sort((a, b) => a[0] - b[0]); o.kf[k] = l;
        }
        ve3dMudou(m); return o.kf;
    },
    limparKf(quem, prop, cena) { const m = ve3dAlvo(cena), o = ve3dObj(m, quem); vePushHistory(); if (prop) delete o.kf[prop]; else o.kf = {}; ve3dMudou(m); return true; },
    cena(op = {}) { const m = ve3dAlvo(op.cena); vePushHistory(); if ('fundo' in op) m.c3d.fundo = op.fundo || null; if ('chao' in op) m.c3d.chao = !!op.chao; if (op.dur) { m.dur = +op.dur; m.info.duration = m.dur; } ve3dMudou(m); return m.c3d; },
    remover(quem, cena) { const m = ve3dAlvo(cena); vePushHistory(); m.c3d.modelos = m.c3d.modelos.filter(x => x.id !== quem && x.nome !== quem); ve3dMudou(m); return m.c3d.modelos.length; },
    info(cena) { const m = ve3dAlvo(cena); return { midia: m.id, nome: m.name, dur: m.dur, renderizada: m.c3dSig === ve3dSig(m) && !!m.path, path: m.path, modelos: m.c3d.modelos.map(x => ({ id: x.id, nome: x.nome, fonte: x.fonte, p: x.p, kf: Object.keys(x.kf) })),
        camera: m.c3d.camera, luz: m.c3d.luz }; },
    renderizar: async cena => { const m = ve3dAlvo(cena); await ve3dRenderizar(m); return { path: m.path, ok: m.c3dSig === ve3dSig(m) }; },
    quadro(t, cena, w = 640) { const m = ve3dAlvo(cena), rt = ve3dRuntime(m); if (!rt) return null; ve3dAplicar(rt, m, t, w, w * VE.seqH / VE.seqW); return rt.cv.toDataURL('image/png'); },
};
// a verificação das Comps (troca de timeline, abrir projeto) também confere as cenas 3D
if (typeof veCompVerificar === 'function') { const _v = veCompVerificar; veCompVerificar = function () { const r = _v.apply(this, arguments); clearTimeout(VE3D.timer); VE3D.timer = setTimeout(ve3dVerificar, 1500); return r; }; }

// ── interface: criar, importar modelo, painel de Propriedades (◆ = quadro-chave, como o cronômetro do After Effects:
// ligado, mexer no valor grava quadro-chave no tempo atual da agulha) ──
function ve3dPainel() { if (typeof VEPP === 'object') VEPP.chave = ''; if (typeof vePpRender === 'function') vePpRender(); veRenderProps(); }
function ve3dNovaUi() {
    try { ve3dNova({}); veToast(veT('Cena 3D criada — adicione modelos no painel Propriedades')); ve3dPainel(); }
    catch (e) { veToast(e.message || String(e)); }
}
async function ve3dImportarUi() {
    const api = window.pywebview && window.pywebview.api; if (!api) return;
    const p = await api.vk_dialogo('abrir', ['Modelos 3D (*.glb;*.gltf;*.obj)']); if (!p) return;
    try { let m; try { m = ve3dAlvo(); } catch (e) { ve3dNova({ nome: p.split(/[\\/]/).pop().replace(/\.\w+$/, '') }); }
        veToast(veT('Carregando o modelo 3D...')); await VE3DAPI.modelo({ arquivo: p }); ve3dPainel(); }
    catch (e) { veToast(e.message || String(e)); }
}
function ve3dPainelHtml(c) {
    const m = veMediaOf(c), C = m.c3d, t = Math.max(0, veSrcAt(c, VE.playhead));
    const lin = (quem, o, k, rot, min, max, passo, un = '') => {
        const v = ve3dVal(o, k, t), kf = (o.kf && o.kf[k]) || [], anim = kf.length > 0, aqui = kf.some(x => Math.abs(x[0] - t) < 0.5 / (VE.fps || 30));
        const vt = v == null ? '' : Math.round(v * 1000) / 1000;
        return `<div class="ve-pp-l ve-p3d"><label>${veT(rot)}</label><input type="range" data-p3d="${quem}|${k}" min="${min}" max="${max}" step="${passo}" value="${v ?? (min + max) / 2}">
            <span class="ve-prop-num"><input type="number" data-p3d="${quem}|${k}" step="${passo}" value="${vt}" placeholder="auto"><i>${un}</i></span>
            <button class="ve-p3d-kf${anim ? ' on' : ''}${aqui ? ' aqui' : ''}" data-p3dkf="${quem}|${k}" title="${veT(anim ? 'Animado: mexer grava quadro-chave aqui. Clique para tirar a animação' : 'Animar com quadros-chave')}">◆</button></div>`;
    };
    const cam = C.camera, luz = C.luz;
    const modelos = C.modelos.map(md => `<div class="ve-p3d-mod"><div class="ve-pp-l"><b>${veEsc(md.nome)}</b><span></span><button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3dacao="rem:${md.id}" title="${veT('Tirar da cena')}">✕</button></div>
        ${lin(md.id, md, 'x', 'X', -4, 4, 0.01)}${lin(md.id, md, 'y', 'Y', -2, 4, 0.01)}${lin(md.id, md, 'z', 'Z', -4, 4, 0.01)}
        ${lin(md.id, md, 'ry', 'Girar', -360, 360, 1, '°')}${lin(md.id, md, 'rx', 'Inclinar', -180, 180, 1, '°')}${lin(md.id, md, 'esc', 'Escala', 0.05, 4, 0.01, '×')}</div>`).join('');
    return vePpSec(veT('Câmera'), lin('camera', cam, 'azimute', 'Órbita', -180, 180, 1, '°') + lin('camera', cam, 'elevacao', 'Altura', -10, 85, 1, '°') +
            lin('camera', cam, 'dist', 'Distância', 0.5, 20, 0.05) + lin('camera', cam, 'fov', 'Lente (fov)', 10, 90, 1, '°') + lin('camera', cam, 'ay', 'Olhar na altura', -1, 3, 0.01) +
            `<small class="ve-pp-dica">${veT('Distância vazia = enquadra sozinho. ◆ anima a propriedade.')}</small>`) +
        vePpSec(veT('Luz'), lin('luz', luz, 'azimute', 'Direção', -180, 180, 1, '°') + lin('luz', luz, 'elevacao', 'Altura', 5, 90, 1, '°') +
            lin('luz', luz, 'intensidade', 'Intensidade', 0, 8, 0.05) + lin('luz', luz, 'ambiente', 'Ambiente', 0, 3, 0.05) + lin('luz', luz, 'sombra', 'Sombra', 0, 1, 0.01) +
            `<div class="ve-pp-l"><label>${veT('Cor da luz')}</label><input type="color" data-p3d="luz|cor" value="${veEsc(luz.p.cor || '#ffffff')}"></div>`) +
        vePpSec(veT('Modelos'), (modelos || `<small class="ve-pp-dica">${veT('Nenhum modelo ainda.')}</small>`) +
            `<div class="ve-pp-botoes"><button class="ve-btn ve-btn-sm" data-p3dacao="arquivo">${veT('Importar .glb / .obj…')}</button></div>
            <div class="ve-pp-botoes">${['esfera', 'cubo', 'cilindro', 'toro', 'cone'].map(f => `<button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3dacao="${f}">+ ${veT(f)}</button>`).join('')}</div>`) +
        vePpSec(veT('Cena'), `<div class="ve-pp-l"><label>${veT('Sombra no chão')}</label><input type="checkbox" data-p3dcena="chao" ${C.chao !== false ? 'checked' : ''}></div>
            <div class="ve-pp-l"><label>${veT('Fundo')}</label><input type="checkbox" data-p3dcena="transparente" ${C.fundo ? '' : 'checked'}> ${veT('transparente')}
            <input type="color" data-p3dcena="fundo" value="${veEsc(C.fundo || '#202020')}" ${C.fundo ? '' : 'disabled'}></div>
            <small class="ve-pp-dica">${veT(m.c3dSig === ve3dSig(m) && m.path ? 'Arquivo da exportação em dia.' : 'O arquivo da exportação é refeito sozinho quando você para de mexer.')}</small>`);
}
function ve3dEvento(el, tipo) {
    const c = VE.clips[VE.sel], m = c && veMediaOf(c); if (!ve3dEh(m)) return;
    const t = Math.max(0, veSrcAt(c, VE.playhead));
    if (el.dataset.p3dcena) {
        if (tipo === 'input' && el.type === 'checkbox') return;
        vePushHistory(); const k = el.dataset.p3dcena;
        if (k === 'chao') m.c3d.chao = el.checked;
        if (k === 'transparente') m.c3d.fundo = el.checked ? null : (m.c3d.fundo || '#202020');
        if (k === 'fundo' && !el.disabled) m.c3d.fundo = el.value;
        ve3dMudou(m); ve3dPainel(); return;
    }
    if (el.dataset.p3dacao) {
        const a = el.dataset.p3dacao;
        if (a === 'arquivo') return ve3dImportarUi();
        if (a.startsWith('rem:')) { VE3DAPI.remover(a.slice(4), m.id); ve3dPainel(); return; }
        VE3DAPI.modelo({ forma: a, cena: m.id, cor: { esfera: '#ec6e48', cubo: '#0e3b4a', cilindro: '#ebd5a8', toro: '#ec6e48', cone: '#48281a' }[a] }).then(() => ve3dPainel());
        return;
    }
    if (el.dataset.p3dkf) {
        const [quem, k] = el.dataset.p3dkf.split('|'), o = ve3dObj(m, quem); vePushHistory();
        if (o.kf[k] && o.kf[k].length) { o.p[k] = ve3dVal(o, k, t); delete o.kf[k]; }
        else { const v = ve3dVal(o, k, t) ?? (k === 'dist' ? 3.2 : 0); o.kf[k] = [[+t.toFixed(4), v, 'suave']]; }
        ve3dMudou(m); ve3dPainel(); return;
    }
    const [quem, k] = el.dataset.p3d.split('|'), o = ve3dObj(m, quem);
    let v = el.type === 'color' ? el.value : el.value === '' ? null : parseFloat(String(el.value).replace(',', '.'));
    if (typeof v === 'number' && !isFinite(v)) return;
    if (tipo === 'input' && !VE._p3dEdit) { vePushHistory(); VE._p3dEdit = true; }
    if (tipo !== 'input') VE._p3dEdit = false;
    if (o.kf[k] && o.kf[k].length && typeof v === 'number') {   // animado: grava (ou troca) o quadro-chave neste tempo
        const l = o.kf[k].filter(x => Math.abs(x[0] - t) > 0.5 / (VE.fps || 30)); l.push([+t.toFixed(4), v, 'suave']); l.sort((a, b) => a[0] - b[0]); o.kf[k] = l;
    } else o.p[k] = v;
    const linha = el.closest('.ve-p3d'); if (linha) linha.querySelectorAll('[data-p3d]').forEach(x => { if (x !== el && v != null) x.value = x.type === 'number' ? Math.round(v * 1000) / 1000 : v; });
    ve3dMudou(m);
    if (tipo !== 'input') ve3dPainel();
}
