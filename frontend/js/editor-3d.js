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
    papel: { roughness: 0.6, sheen: 0.35, sheenRoughness: 0.6, clearcoat: 0.12, clearcoatRoughness: 0.45 }, /* papel de copo: acetinado */ fosco: { roughness: 0.65 }, plastico: { roughness: 0.32 }, ceramica: { roughness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.04 },
    metal: { roughness: 0.22, metalness: 0.35, clearcoat: 1 }, vidro: { roughness: 0.02, transmission: 1, ior: 1.45, thickness: 0.2 },
};
const ve3dEh = m => !!(m && m.c3d);
function ve3dLib() {
    if (!VE3D.lib) VE3D.lib = (async () => {
        const T = await import('three');
        const [{ GLTFLoader }, { OBJLoader }, { RoomEnvironment }, { toCreasedNormals }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'),
            import('three/addons/loaders/OBJLoader.js'), import('three/addons/environments/RoomEnvironment.js'), import('three/addons/utils/BufferGeometryUtils.js')]);
        return { T, GLTFLoader, OBJLoader, RoomEnvironment, toCreasedNormals };
    })();
    return VE3D.lib;
}
function ve3dPadrao() {
    return { modelos: [], fundo: null, chao: true,
        camera: { p: { azimute: 20, elevacao: 12, dist: null, fov: 32, ax: 0, ay: 0.5, az: 0 }, kf: {} },   // dist null = enquadra sozinho
        luz: { p: { azimute: -40, elevacao: 50, intensidade: 2.6, ambiente: 0.8, sombra: 0.5, cor: '#ffffff' }, kf: {} },
        cenario: ve3dCenarioPadrao() };
}
// cenário (F3): estúdio infinito (chão que vira parede em curva, sempre atrás do que a câmera olha) e neblina.
// Foco (F2) fica na câmera: abertura 0 = tudo nítido; foco null = foca no ponto que a câmera olha.
const ve3dCenarioPadrao = () => ({ p: { estudio: 0, estudioCor: '#e9e4dc', neblina: 0, neblinaCor: '#dfe3e8' }, kf: {} });
const ve3dCenario = C => (C.cenario = C.cenario || ve3dCenarioPadrao());
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
const VE3D_VERSAO = 5;   // subir quando o desenho mudar (foco, neblina, materiais): os .mov do cache ficam velhos
const ve3dSig = m => 'c3d.' + vePrHash(JSON.stringify([VE3D_VERSAO, m.c3d, VE.seqW, VE.seqH, VE.fps, +m.dur || 0]));

async function ve3dCarregarModelo(md, L) {
    const { T, GLTFLoader, OBJLoader } = L, raiz = new T.Group(), norm = new T.Group(); raiz.add(norm);
    let obj, mixer = null;
    const f = md.fonte || {};
    if (f.tipo === 'primitiva') {
        const geo = { esfera: () => new T.SphereGeometry(0.5, 96, 64), cubo: () => new T.BoxGeometry(1, 1, 1, 1, 1, 1), cilindro: () => new T.CylinderGeometry(0.4, 0.4, 1, 96),
            toro: () => new T.TorusGeometry(0.4, 0.15, 64, 160), cone: () => new T.ConeGeometry(0.45, 1, 96), plano: () => new T.PlaneGeometry(1, 1) }[f.forma || 'esfera'] || (() => new T.SphereGeometry(0.5, 96, 64));
        obj = new T.Mesh(geo(), new T.MeshPhysicalMaterial({ color: new T.Color(f.cor || '#ec6e48'), ...(VE3D_MATERIAIS[f.material] || VE3D_MATERIAIS.plastico) }));
        if (f.forma === 'plano') obj.rotation.x = -Math.PI / 2;
    } else if (f.tipo === 'vetor') {
        obj = await ve3dDoVetor(f.desc, T);
        obj.updateMatrixWorld(true);
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
    // sombra de contato (foto de produto): mancha macia no chão sob o modelo; cresce e esmaece quando ele sobe
    const pe = Math.max(tam.x, tam.z) * s / 2;
    return { raiz, mixer, pe };
}
// objeto 3D do Vetor (enviar_editor_3d): a mesma descrição do render no Blender (vbCena) — girar = torno com o rótulo em
// UV (u = ângulo, v = altura), extrudar = forma com chanfro para dentro e as artes coladas nas faces. Espaço do Vetor
// (x direita, y para baixo, pt) → three (y para cima): (x, -y, z).
async function ve3dDoVetor(d, T) {
    if (d.tipo === 'grupo') {   // várias peças (copo + tampa): ficam onde estavam no documento, umas em relação às outras
        const g = new T.Group(), o0 = d.partes[0].origem || [0, 0];
        for (const p of d.partes) { const s = await ve3dDoVetor(p, T), o = p.origem || o0; s.position.set(o[0] - o0[0], -(o[1] - o0[1]), 0); g.add(s); }
        return g;
    }
    const mat = (cor, extra = {}) => new T.MeshPhysicalMaterial({ color: new T.Color().setRGB(...cor, T.SRGBColorSpace), ...(VE3D_MATERIAIS[d.material] || VE3D_MATERIAIS.plastico), ...extra });
    const tex = async p => { const r = await window.pywebview.api.ve_3d_url(p); if (!r || !r.success) return null; const t = await new T.TextureLoader().loadAsync(r.url); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t; };
    const g = new T.Group();
    if (d.tipo === 'girar') {
        const perf = d.perfil, K = 160, ytop = Math.min(...perf.map(p => p[1])), ybase = Math.max(...perf.map(p => p[1])), pos = [], uv = [], idx = [];
        for (const [r, y] of perf) for (let j = 0; j <= K; j++) { const t = 2 * Math.PI * j / K; pos.push(r * Math.cos(t), -y, r * Math.sin(t)); uv.push(1 - j / K, 1 - (y - ytop) / Math.max(1e-6, ybase - ytop)); }
        for (let a = 0; a < perf.length - 1; a++) for (let j = 0; j < K; j++) { const p = a * (K + 1) + j, q = (a + 1) * (K + 1) + j; idx.push(p, q, p + 1, p + 1, q, q + 1); }
        let geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
        geo = (await ve3dLib()).toCreasedNormals(geo, 0.6);   // quina (fundo × parede, borda) fica viva; curva fica lisa
        let m = mat(d.cor, { side: T.DoubleSide });
        if (d.rotulo) {   // rótulo por cima da cor base (o PNG só tem tinta onde há arte)
            const t = await tex(d.rotulo);
            if (t) { const cv = document.createElement('canvas'); cv.width = t.image.width; cv.height = t.image.height; const cx = cv.getContext('2d');
                cx.fillStyle = `rgb(${d.cor.map(v => Math.round(v * 255)).join(',')})`; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(t.image, 0, 0);
                const ct = new T.CanvasTexture(cv); ct.colorSpace = T.SRGBColorSpace; ct.anisotropy = 8; m = mat([1, 1, 1], { side: T.DoubleSide, map: ct }); t.dispose(); }
        }
        g.add(new T.Mesh(geo, m));
    } else {
        const sp = new T.ShapePath(), area = s => { let a = 0; s.forEach((p, i) => { const q = s[(i + 1) % s.length]; a += p[0] * -q[1] - q[0] * -p[1]; }); return a; };
        const subs = [...d.subs].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));   // contorno de fora primeiro
        for (const s of subs) {
            sp.moveTo(s[0][0], -s[0][1]);
            for (let k = 1; k <= s.length; k++) { const a = s[k - 1], b = s[k % s.length]; sp.bezierCurveTo(a[4], -a[5], b[2], -b[3], b[0], -b[1]); }
        }
        const ch = Math.max(0, d.chanfro || 0), prof = Math.max(1e-3, d.prof - 2 * ch), externo = subs[0].map(p => new T.Vector2(p[0], -p[1]));
        const formas = sp.toShapes(!T.ShapeUtils.isClockWise(externo));
        const geo = new T.ExtrudeGeometry(formas, { depth: prof, curveSegments: 24, bevelEnabled: ch > 0, bevelThickness: ch, bevelSize: ch, bevelOffset: -ch, bevelSegments: 4 });
        geo.translate(0, 0, -prof / 2); geo.computeVertexNormals();
        g.add(new T.Mesh(geo, mat(d.cor)));
        for (const dc of d.decals || []) {   // arte numa face: placa com a imagem, um fio à frente da face
            const t = await tex(dc.png); if (!t) continue;
            const cs = dc.cantos.map(c => new T.Vector3(c[0], -c[1], c[2])), n = new T.Vector3().subVectors(cs[1], cs[0]).cross(new T.Vector3().subVectors(cs[3], cs[0])).normalize();
            const nr = new T.Vector3(dc.normal[0], -dc.normal[1], dc.normal[2]); if (n.dot(nr) < 0) n.negate();
            const lado = Math.max(cs[0].distanceTo(cs[1]), cs[0].distanceTo(cs[3])); cs.forEach(c => c.addScaledVector(n, Math.max(0.05, lado * 0.002)));
            const geoA = new T.BufferGeometry(); geoA.setAttribute('position', new T.Float32BufferAttribute(cs.flatMap(c => [c.x, c.y, c.z]), 3));
            geoA.setAttribute('uv', new T.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); geoA.setIndex([0, 1, 2, 0, 2, 3]); geoA.computeVertexNormals();
            if (geoA.attributes.normal.getZ(0) * n.z + geoA.attributes.normal.getX(0) * n.x + geoA.attributes.normal.getY(0) * n.y < 0) geoA.setIndex([0, 2, 1, 0, 3, 2]);
            g.add(new T.Mesh(geoA, mat([1, 1, 1], { map: t, transparent: true, alphaTest: 0.02, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));
        }
    }
    return g;
}
async function ve3dMontar(m) {
    const L = await ve3dLib(), { T, RoomEnvironment } = L, cv = document.createElement('canvas');
    const r = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.NeutralToneMapping; r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    const sc = new T.Scene(), pm = new T.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const cam = new T.PerspectiveCamera(32, 16 / 9, 0.05, 200);
    const key = new T.DirectionalLight(0xffffff, 2.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 5; key.shadow.bias = -0.0004;
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 40 }); sc.add(key, key.target);
    const amb = new T.HemisphereLight(0xffffff, 0x8a8a8a, 0.8); sc.add(amb);
    const chao = new T.Mesh(new T.PlaneGeometry(80, 80), new T.ShadowMaterial({ opacity: 0.5 })); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; sc.add(chao);
    // estúdio infinito: perfil (z, y) chão → curva de raio 2,5 → parede, varrido em x
    const perfil = [[30, 0], [-1.5, 0]];
    for (let i = 1; i <= 24; i++) { const a = i / 24 * Math.PI / 2; perfil.push([-1.5 - 2.5 * Math.sin(a), 2.5 - 2.5 * Math.cos(a)]); }
    perfil.push([-4, 30]);
    const gEst = new T.PlaneGeometry(1, 1, 1, perfil.length - 1), pos = gEst.attributes.position;
    for (let j = 0; j < perfil.length; j++) for (let i = 0; i < 2; i++) pos.setXYZ(j * 2 + i, i ? 40 : -40, perfil[j][1], perfil[j][0]);
    gEst.computeVertexNormals();
    const estudio = new T.Mesh(gEst, new T.MeshStandardMaterial({ color: 0xe9e4dc, roughness: 0.92, side: T.DoubleSide })); estudio.receiveShadow = true; sc.add(estudio);
    // foco (profundidade de campo): a cena vai para um alvo com profundidade e um passo de desfoque por distância
    const foco = ve3dFocoPasso(T);
    const objs = [], mancha = ve3dMancha(T);
    for (const md of m.c3d.modelos) {
        const o = await ve3dCarregarModelo(md, L); sc.add(o.raiz);
        const ct = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: mancha, color: 0x000000, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        ct.rotation.x = -Math.PI / 2; ct.renderOrder = 1; sc.add(ct);
        objs.push({ md, ...o, contato: ct });
    }
    // contraluz: recorte nas bordas (atrás do objeto, oposta à câmera), sem sombra
    const contra = new T.DirectionalLight(0xffffff, 0); sc.add(contra, contra.target);
    return { r, cv, sc, cam, key, amb, chao, estudio, foco, objs, contra, T, chave: ve3dChave(m) };
}
function ve3dMancha(T) {   // degradê radial (preto → transparente) da sombra de contato
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    [[0, 1], [0.55, 0.96], [0.72, 0.62], [0.86, 0.26], [1, 0]].forEach(([p, a]) => g.addColorStop(p, `rgba(255,255,255,${a})`));
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const t = new T.CanvasTexture(cv); t.colorSpace = T.NoColorSpace; return t;
}
function ve3dFocoPasso(T) {
    const mat = new T.ShaderMaterial({
        uniforms: { tCor: { value: null }, tProf: { value: null }, res: { value: new T.Vector2(1, 1) }, raio: { value: 0 }, foco: { value: 3 }, perto: { value: 0.01 }, longe: { value: 500 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `#include <common>
            #include <packing>
            varying vec2 vUv; uniform sampler2D tCor; uniform sampler2D tProf; uniform vec2 res; uniform float raio, foco, perto, longe;
            float prof(vec2 uv) { float d = texture2D(tProf, uv).x; return d >= 1.0 ? longe : -perspectiveDepthToViewZ(d, perto, longe); }
            float coc(float z) { return clamp(abs(1.0 - foco / z) * 3.0, 0.0, 1.0) * raio; }
            void main() {
                float zc = prof(vUv), cc = coc(zc);
                // média ponderada pelo brilho (Karis): reflexo HDR fino não vira pontinhos no desfoque
                vec4 c0 = texture2D(tCor, vUv); float w0 = 1.0 / (1.0 + max(c0.r, max(c0.g, c0.b)));
                vec4 soma = c0 * w0; float peso = w0;
                float giro = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;   // tira o desenho da espiral
                if (cc > 0.5) for (int i = 0; i < 96; i++) {
                    float r = sqrt((float(i) + 0.5) / 96.0) * cc, a = float(i) * 2.39996323 + giro;
                    vec2 uv = vUv + vec2(cos(a), sin(a)) * r / res;
                    float zs = prof(uv), cs = coc(zs);
                    if (zs > zc) cs = min(cs, cc);                  // o que está atrás não vaza sobre o que está na frente
                    float w = smoothstep(r - 1.0, r + 1.0, cs);
                    vec4 cs4 = texture2D(tCor, uv); w /= 1.0 + max(cs4.r, max(cs4.g, cs4.b));
                    soma += cs4 * w; peso += w;
                }
                vec4 c = soma / peso; float al = c.a;
                gl_FragColor = vec4(c.rgb / max(al, 1e-4), 1.0);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                gl_FragColor = vec4(gl_FragColor.rgb * al, al);
            }`,
        depthTest: false, depthWrite: false, blending: T.NoBlending, toneMapped: true,
    });
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat), sc = new T.Scene(); sc.add(quad);
    return { mat, sc, cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), alvo: null };
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
    // distância automática: cabe o conjunto na posição de repouso (p, sem quadros-chave: não fica "respirando" com a
    // animação) — no mínimo ~2,4 de largura e ~1,6 de altura (quadro em pé ou deitado)
    let lx = 1.2, ly = 0.8;
    for (const o of rt.objs) { const p = o.md.p || {}, e = p.esc ?? 1; lx = Math.max(lx, (Math.abs(p.x || 0) + 0.65 * e) * 1.08, Math.abs(p.z || 0) * 0.5 + 0.65 * e); ly = Math.max(ly, ((p.y || 0) + e) * 0.62); }
    const fov = cp('fov'), hfov = 2 * Math.atan(Math.tan(fov * rad / 2) * W / H), dAuto = Math.max(lx / Math.tan(hfov / 2), ly / Math.tan(fov * rad / 2));
    const alvo = new T.Vector3(cp('ax'), cp('ay'), cp('az')), az = cp('azimute') * rad, el = cp('elevacao') * rad, d = cp('dist') ?? dAuto;
    cam.position.set(alvo.x + d * Math.cos(el) * Math.sin(az), alvo.y + d * Math.sin(el), alvo.z + d * Math.cos(el) * Math.cos(az));
    cam.fov = cp('fov'); cam.aspect = W / H; cam.lookAt(alvo); cam.updateProjectionMatrix();
    const la = lp('azimute') * rad, le = lp('elevacao') * rad;
    key.position.set(alvo.x + 8 * Math.cos(le) * Math.sin(la), alvo.y + 8 * Math.sin(le), alvo.z + 8 * Math.cos(le) * Math.cos(la)); key.target.position.copy(alvo);
    key.intensity = lp('intensidade'); key.color.set(lp('cor') || '#ffffff'); amb.intensity = lp('ambiente');
    const ci = lp('contra') || 0; rt.contra.intensity = ci;
    if (ci > 0) { rt.contra.position.set(alvo.x - 8 * Math.cos(0.5) * Math.sin(az + 0.5), alvo.y + 8 * Math.sin(0.5), alvo.z - 8 * Math.cos(0.5) * Math.cos(az + 0.5)); rt.contra.target.position.copy(alvo); }
    const cn = ve3dCenario(C), np = k => ve3dVal(cn, k, t), est = (np('estudio') || 0) > 0.5;
    chao.visible = C.chao !== false && !est; chao.material.opacity = lp('sombra');
    rt.estudio.visible = est; rt.estudio.material.color.set(np('estudioCor') || '#e9e4dc'); rt.estudio.rotation.y = az; rt.estudio.position.set(alvo.x, 0, alvo.z);
    const neb = np('neblina') || 0;
    if (neb > 0.001) { if (!rt.sc.fog) rt.sc.fog = new T.FogExp2(0xffffff, 0); rt.sc.fog.color.set(np('neblinaCor') || '#dfe3e8'); rt.sc.fog.density = neb * 0.35; }
    else rt.sc.fog = null;
    for (const o of rt.objs) {
        const v = k => ve3dVal(o.md, k, t);
        o.raiz.position.set(v('x') || 0, v('y') || 0, v('z') || 0); o.raiz.rotation.set((v('rx') || 0) * rad, (v('ry') || 0) * rad, (v('rz') || 0) * rad);
        const es = v('esc') ?? 1; o.raiz.scale.set(es * (v('sx') ?? 1), es * (v('sy') ?? 1), es * (v('sz') ?? 1));   // sx/sy/sz: achatar (pedestal = cilindro baixo)
        o.raiz.visible = v('visivel') !== 0;
        const ctt = v('contato') ?? lp('contato') ?? 0.55, alt = Math.max(0, v('y') || 0), raio = (o.pe || 0.5) * es * Math.max(v('sx') ?? 1, v('sz') ?? 1);
        o.contato.visible = o.raiz.visible && C.chao !== false && ctt > 0;
        o.contato.position.set(v('x') || 0, 0.004, v('z') || 0); o.contato.scale.setScalar(raio * 3.3 * (1 + alt * 1.6));
        o.contato.material.opacity = ctt / (1 + alt * 3.5) ** 2;
        if (o.mixer) o.mixer.setTime(Math.max(0, t * (o.md.p.velocidade ?? 1)));
    }
    if (C.fundo) r.setClearColor(new T.Color(C.fundo), 1); else r.setClearColor(0x000000, 0);
    const Wi = Math.max(2, Math.round(W)), Hi = Math.max(2, Math.round(H));
    r.setPixelRatio(1); r.setSize(Wi, Hi, false);
    const ab = cp('abertura') || 0;
    // sempre pelo alvo + passo final (tom e cor no fim): a neblina do three entra depois da conversão de cor no
    // desenho direto e mudaria de cor ao ligar o foco. Foco: raio máximo proporcional à altura (igual em qualquer resolução)
    {
        const f = rt.foco;
        if (!f.alvo || f.alvo.width !== Wi || f.alvo.height !== Hi) {
            if (f.alvo) f.alvo.dispose();
            f.alvo = new T.WebGLRenderTarget(Wi, Hi, { type: T.HalfFloatType, samples: 4, depthTexture: new T.DepthTexture(Wi, Hi) });
        }
        r.setRenderTarget(f.alvo); r.clear(); r.render(rt.sc, cam); r.setRenderTarget(null);
        const u = f.mat.uniforms;
        u.tCor.value = f.alvo.texture; u.tProf.value = f.alvo.depthTexture; u.res.value.set(Wi, Hi); u.raio.value = ab * Hi * 0.04;
        u.foco.value = Math.max(0.05, cp('foco') ?? d); u.perto.value = cam.near; u.longe.value = cam.far;
        r.setClearColor(0x000000, 0); r.clear(); r.render(f.sc, f.cam);
    }
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
function ve3dObj(m, quem) { const C = m.c3d; if (quem === 'camera') return C.camera; if (quem === 'luz') return C.luz; if (quem === 'cenario') return ve3dCenario(C); const md = C.modelos.find(x => x.id === quem || x.nome === quem); if (!md) throw new Error(`modelo "${quem}" não existe na cena`); return md; }
window.VE3DAPI = {
    nova: (op = {}) => ve3dNova(op),
    // modelo: caminho (.glb/.gltf/.obj) ou primitiva (esfera|cubo|cilindro|toro|cone|plano) com cor/material
    async modelo(op = {}) {
        const m = ve3dAlvo(op.cena); vePushHistory();
        const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const fonte = op.vetor ? { tipo: 'vetor', desc: op.vetor } : op.arquivo ? { tipo: 'arquivo', path: op.arquivo, ...(op.cor ? { cor: op.cor } : {}), ...(op.material ? { material: op.material } : {}) }
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
    // doVetor: objeto 3D do Vetor (descrição de vbCena) entra na cena — giro inicial = o do Vetor (girar/inclinar/rolar)
    async doVetor(op = {}) {
        let m; try { m = ve3dAlvo(op.cena); } catch (e) { const r = ve3dNova({ nome: op.nome || veT('Cena 3D') }); m = VE.media[r.midia]; }
        const { T } = await ve3dLib(), o3 = op.giro || {}, rad = Math.PI / 180;
        // vk3dRot (espaço do Vetor, y para baixo) = Rz(rolar)·Rx(-inclinar)·Ry(girar); no three (y para cima) conjuga por diag(1,-1,1)
        const ry = new T.Matrix4().makeRotationY((o3.girar || 0) * rad), rx = new T.Matrix4().makeRotationX(-(o3.inclinar || 0) * rad), rz = new T.Matrix4().makeRotationZ((o3.rolar || 0) * rad);
        const Rv = new T.Matrix4().multiplyMatrices(rz, rx).multiply(ry), S = new T.Matrix4().makeScale(1, -1, 1), Rt = new T.Matrix4().multiplyMatrices(S, Rv).multiply(S);
        const e = new T.Euler().setFromRotationMatrix(Rt, 'XYZ');
        return VE3DAPI.modelo({ cena: m.id, nome: op.nome || 'Vetor 3D', vetor: op.desc, rx: e.x / rad, ry: e.y / rad, rz: e.z / rad, esc: op.esc ?? 1, x: op.x || 0 });
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
        vePpSec(veT('Foco'), lin('camera', cam, 'abertura', 'Desfoque', 0, 1, 0.01) + lin('camera', cam, 'foco', 'Distância do foco', 0.2, 20, 0.05) +
            `<small class="ve-pp-dica">${veT('Desfoque 0 = tudo nítido. Foco vazio = no ponto que a câmera olha. Anime o foco para trocar de objeto.')}</small>`) +
        vePpSec(veT('Luz'), lin('luz', luz, 'azimute', 'Direção', -180, 180, 1, '°') + lin('luz', luz, 'elevacao', 'Altura', 5, 90, 1, '°') +
            lin('luz', luz, 'intensidade', 'Intensidade', 0, 8, 0.05) + lin('luz', luz, 'ambiente', 'Ambiente', 0, 3, 0.05) + lin('luz', luz, 'sombra', 'Sombra', 0, 1, 0.01) +
            lin('luz', luz, 'contra', 'Contraluz', 0, 8, 0.05) + lin('luz', luz, 'contato', 'Sombra de contato', 0, 1, 0.01) +
            `<div class="ve-pp-l"><label>${veT('Cor da luz')}</label><input type="color" data-p3d="luz|cor" value="${veEsc(luz.p.cor || '#ffffff')}"></div>`) +
        vePpSec(veT('Modelos'), (modelos || `<small class="ve-pp-dica">${veT('Nenhum modelo ainda.')}</small>`) +
            `<div class="ve-pp-botoes"><button class="ve-btn ve-btn-sm" data-p3dacao="arquivo">${veT('Importar .glb / .obj…')}</button></div>
            <div class="ve-pp-botoes">${['esfera', 'cubo', 'cilindro', 'toro', 'cone'].map(f => `<button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3dacao="${f}">+ ${veT(f)}</button>`).join('')}</div>`) +
        vePpSec(veT('Cenário'), (() => { const cn = ve3dCenario(C); return `<div class="ve-pp-l"><label>${veT('Estúdio infinito')}</label><input type="checkbox" data-p3dcena="estudio" ${cn.p.estudio ? 'checked' : ''}>
            <input type="color" data-p3dcena="estudioCor" value="${veEsc(cn.p.estudioCor || '#e9e4dc')}"></div>` +
            lin('cenario', cn, 'neblina', 'Neblina', 0, 1, 0.01) +
            `<div class="ve-pp-l"><label>${veT('Cor da neblina')}</label><input type="color" data-p3dcena="neblinaCor" value="${veEsc(cn.p.neblinaCor || '#dfe3e8')}"></div>`; })()) +
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
        if (k === 'estudio') ve3dCenario(m.c3d).p.estudio = el.checked ? 1 : 0;
        if (k === 'estudioCor' || k === 'neblinaCor') ve3dCenario(m.c3d).p[k] = el.value;
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
