// =========================================================
// Pocket Editor — embalagem de produto na Cena 3D (pote | bastão), versão LEVE para montar e animar em tempo real.
// O perfil é o mesmo do Blender (frontend/embalagens.json ↔ Functions/blender_estudio.py): a prévia aqui e a foto
// fotorrealista de lá são a mesma peça. Aqui: 96 divisões, material de tempo real (soft-touch, gel com transmissão),
// rótulo = película com a arte encaixada (proporção real da superfície, centralizada na frente). Sem bolhas nem
// ranhuras (só no render). fonte: {tipo: 'embalagem', produto, material: softtouch|gel|brilho, cores: {corpo, tampa,
// base, gel}, rotulo: caminho da arte}. Partes = nomes dos materiais (corpo, tampa, base, rotulo): a Aparência por
// parte troca a cor de cada uma.
// =========================================================

let VE3D_EMB = null;
async function ve3dEmbDefs() {
    if (!VE3D_EMB) { const r = await fetch('embalagens.json'); if (!r.ok) throw new Error('embalagens.json: HTTP ' + r.status); VE3D_EMB = await r.json(); }
    return VE3D_EMB;
}
const ve3dEmbProdutos = () => Object.entries(VE3D_EMB || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => ({ id: k, nome: v.nome || k }));

// quina viva → arco (Bézier quadrática), como o arredondar do Blender
function ve3dEmbArredondar(pts, raio, n = 6) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const la = Math.hypot(x0 - x1, y0 - y1), lb = Math.hypot(x2 - x1, y2 - y1), rr = Math.min(raio, la * 0.45, lb * 0.45);
        if (rr < 1e-4 || x1 < 0.01) { out.push(pts[i]); continue; }
        const q0 = [x1 + (x0 - x1) / la * rr, y1 + (y0 - y1) / la * rr], q2 = [x1 + (x2 - x1) / lb * rr, y1 + (y2 - y1) / lb * rr];
        for (let k = 0; k <= n; k++) { const t = k / n, a = (1 - t) ** 2, b = 2 * (1 - t) * t, c = t * t; out.push([a * q0[0] + b * x1 + c * q2[0], a * q0[1] + b * y1 + c * q2[1]]); }
    }
    out.push(pts[pts.length - 1]);
    return out;
}

// revolução com UV (u = volta, 0,5 = frente virada para +Z; v = altura / altura do produto). Y para cima.
function ve3dEmbGeo(T, D, perfil, alt, { u0 = 0, u1 = 1, desloc = 0, seg = 96, uvf = null } = {}) {
    const fechado = u1 - u0 >= 0.999, n = Math.max(8, Math.round(seg * (u1 - u0))), m = fechado ? n : n + 1;
    const pos = [], uv = [], idx = [];
    perfil.forEach(([r, z]) => {
        for (let i = 0; i < m; i++) {
            const u = u0 + (u1 - u0) * i / n, a = 2 * Math.PI * u - Math.PI, rr = r + desloc;
            pos.push(rr * D.sx * Math.sin(a), z, rr * D.sy * Math.cos(a));
            uv.push(...(uvf ? uvf(u, z) : [u, z / alt]));
        }
    });
    for (let j = 0; j < perfil.length - 1; j++)
        for (let i = 0; i < n; i++) {
            const i2 = fechado ? (i + 1) % n : i + 1, a = j * m + i, b = j * m + i2, c = (j + 1) * m + i2, d = (j + 1) * m + i;
            idx.push(a, b, c, a, c, d);
        }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
}

// ── materiais (frontend/materiais.json, os campos do Principled do Blender): prévia em MeshPhysicalMaterial ──
let VE3D_MATS = null;
async function ve3dMatDefs() {
    if (!VE3D_MATS) { const r = await fetch('materiais.json'); if (!r.ok) throw new Error('materiais.json: HTTP ' + r.status); VE3D_MATS = await r.json(); }
    return VE3D_MATS;
}
const ve3dMatLib = () => Object.entries(VE3D_MATS || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => ({ id: k, nome: v.nome || k, cor: v.cor }));
// parâmetros de uma parte: o salvo em f.materiais[parte] ou o que vem do acabamento antigo (material + cores)
function ve3dEmbParams(f, parte) {
    const M = VE3D_MATS || {}, base = { ...(M._campos || {}) };
    if (f.materiais && f.materiais[parte]) return { ...base, ...f.materiais[parte] };
    const c = { corpo: '#1d4a2a', tampa: '#1d4a2a', base: '#2f9a78', gel: '#8fdcc4', ...(f.cores || {}) }, gel = f.material === 'gel';
    const lib = gel ? (parte === 'base' ? 'brilhante' : parte === 'tampa' ? 'gel_fosco' : 'gel') : f.material === 'brilho' ? 'brilhante' : 'softtouch';
    const p = { ...base, ...(M[lib] || {}), cor: gel && parte !== 'base' ? c.gel : (c[parte] || c.corpo) }; delete p.nome;
    if (!gel && parte === 'tampa') { p.rugosidade = Math.min(p.rugosidade, 0.42); p.relevo = 'ranhuras'; }
    return p;
}
function ve3dMatAplicar(mat, p) {   // parâmetros → MeshPhysicalMaterial (também ao vivo, no arraste do controle)
    const tr = +p.transmissao || 0;
    mat.color.set(p.cor || '#d9d4cc'); mat.metalness = +p.metalico || 0; mat.roughness = +p.rugosidade; mat.specularIntensity = (+p.especular) * 2;
    mat.transmission = tr; mat.ior = +p.ior || 1.45; mat.thickness = tr > 0 ? 0.8 : 0;
    mat.attenuationColor.set(p.cor || '#ffffff'); mat.attenuationDistance = (+p.absorcao || 0) > 0.001 ? 1.2 / p.absorcao : Infinity;
    mat.clearcoat = +p.verniz || 0; mat.clearcoatRoughness = +p.verniz_rug || 0; mat.sheen = +p.sheen || 0; mat.sheenColor.set(p.cor || '#ffffff'); mat.sheenRoughness = 0.5;
    mat.emissive.set(p.emissao || '#ffffff'); mat.emissiveIntensity = +p.emissao_forca || 0;
    mat.bumpScale = (+p.relevo_forca || 0) * 2;
    if (mat.userData.tr !== (tr > 0)) { mat.userData.tr = tr > 0; mat.needsUpdate = true; }   // liga/desliga a transmissão = outro shader
}
async function ve3dTexDe(T, caminho, cor) {
    const r = await window.pywebview.api.ve_3d_url(caminho); if (!r || !r.success) return null;
    const t = await new T.TextureLoader().loadAsync(r.url); t.colorSpace = cor ? T.SRGBColorSpace : T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t;
}
function ve3dRanhurasTex(T) {   // ranhuras da tampa na prévia: listras em tons de cinza como relevo (no Blender é o mesmo seno)
    const c = document.createElement('canvas'); c.width = 256; c.height = 4; const x = c.getContext('2d');
    for (let i = 0; i < 256; i++) { const v = Math.round(128 + 127 * Math.sin(i / 256 * 2 * Math.PI * 8)); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, 0, 1, 4); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(220 / 8, 1); t.colorSpace = T.NoColorSpace; return t;
}
async function ve3dEmbMaterial(T, nome, f) {
    const p = ve3dEmbParams(f, nome), mat = new T.MeshPhysicalMaterial({ name: nome });
    ve3dMatAplicar(mat, p);
    if (p.textura) { const t = await ve3dTexDe(T, p.textura, true); if (t) { const k = +p.textura_escala || 1; t.repeat.set(k, k); mat.map = t; } }
    if (p.relevo === 'ranhuras') mat.bumpMap = ve3dRanhurasTex(T);
    else if (p.relevo === 'imagem' && p.relevo_img) { const t = await ve3dTexDe(T, p.relevo_img, false); if (t) mat.bumpMap = t; }
    mat.needsUpdate = true;
    return mat;
}

async function ve3dEmbalagem(f, T) {
    const D = (await ve3dEmbDefs())[f.produto || 'pote'];
    await ve3dMatDefs();
    if (!D) throw new Error(`${veT('embalagem')} "${f.produto}"`);
    const alt = Math.max(...D.partes.flatMap(([, perf]) => perf.map(p => p[1]))), g = new T.Group();
    for (const [nome, perfil, raio] of D.partes)
        g.add(new T.Mesh(ve3dEmbGeo(T, D, ve3dEmbArredondar(perfil, raio), alt), await ve3dEmbMaterial(T, nome, f)));
    if (f.rotulo) {
        const r = await window.pywebview.api.ve_3d_url(f.rotulo);
        if (r && r.success) {
            const tex = await new T.TextureLoader().loadAsync(r.url); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
            const aw = tex.image.width, ah = tex.image.height, R = D.rotulo, [u0, u1] = R.u, [z0, z1] = R.z;
            const a = D.sx, b = D.sy, perim = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
            const rl = perim * (u1 - u0), rh = z1 - z0, k = Math.min(rl / aw, rh / ah), fl = aw * k / rl, fh = ah * k / rh;
            const uvf = (u, z) => [((u - (u0 + u1) / 2) / (u1 - u0)) / fl + 0.5, ((z - z0) / rh - 0.5) / fh + 0.5];
            const corpo = D.partes.find(p => p[0] === 'corpo')[1], rmax = Math.max(...corpo.map(p => p[0]));
            const perf = Array.from({ length: 25 }, (_, t) => [rmax, z0 + (z1 - z0) * t / 24]);
            const mat = new T.MeshPhysicalMaterial({ name: 'rotulo', map: tex, transparent: true, alphaTest: 0.02, roughness: 0.38, clearcoat: 0.2, depthWrite: false });
            const me = new T.Mesh(ve3dEmbGeo(T, D, perf, alt, { u0, u1, desloc: 0.004, uvf }), mat); me.renderOrder = 2; g.add(me);
        }
    }
    g.userData.escala = 1 / 2.94;   // tamanho real entre as embalagens: o bastão (a mais alta) tem 1 de altura
    return g;
}

// ── painel da embalagem: Embalagem (produto, rótulo) + Material por parte, como as abas do Blender ──
const VE3D_PARTES_NOMES = { corpo: 'Corpo', tampa: 'Tampa', base: 'Base' };
function ve3dMatBolinha(id, corAtual) {   // amostra redonda do material na biblioteca
    const L = (VE3D_MATS || {})[id] || {}, c = L.cor || corAtual || '#888888';
    if (L.metalico) return `background: radial-gradient(circle at 35% 30%, #fff 0, ${c} 35%, #333 100%)`;
    if (L.transmissao) return `background: radial-gradient(circle at 35% 30%, #fff 0, ${c}99 40%, ${c}44 100%); border: 1px solid ${c}`;
    if (L.sheen) return `background: radial-gradient(circle at 50% 50%, ${c} 40%, #ffffff88 100%)`;
    const r = L.rugosidade ?? 0.5;
    return `background: radial-gradient(circle at 35% 30%, rgba(255,255,255,${(1 - r).toFixed(2)}) 0, ${c} ${Math.round(20 + r * 30)}%, #00000088 110%)`;
}
function ve3dEmbPainel(md, so) {   // so: 'emb' (aba Embalagem) | 'mat' (aba Material) | nada = as duas
    const f = md.fonte, id = veEsc(md.id), D = (VE3D_EMB || {})[f.produto || 'pote'], partes = D ? D.partes.map(p => p[0]) : ['corpo', 'tampa'];
    const parte = partes.includes((VE3D.embParte || {})[md.id]) ? VE3D.embParte[md.id] : 'corpo', p = ve3dEmbParams(f, parte);
    const sel = (attr, k, ops, v) => `<select ${attr}="${id}|${k}">${ops.map(([a, b]) => `<option value="${a}"${a === v ? ' selected' : ''}>${veT(b)}</option>`).join('')}</select>`;
    const num = v => Math.round((+v || 0) * 1000) / 1000;
    const sl = (k, rot, min, max, passo, dica) => `<div class="ve-pp-l ve-p3d"><label${dica ? ` title="${veT(dica)}"` : ''}>${veT(rot)}</label><input type="range" data-p3dmat="${id}|${k}" min="${min}" max="${max}" step="${passo}" value="${num(p[k])}"><span class="ve-prop-num"><input type="number" data-p3dmat="${id}|${k}" step="${passo}" value="${num(p[k])}"></span></div>`;
    const corIn = (k, rot) => `<div class="ve-pp-l"><label>${veT(rot)}</label><input type="color" data-p3dmat="${id}|${k}" value="${veEsc(p[k] || '#ffffff')}"></div>`;
    const img = (k, rot, dica) => `<div class="ve-pp-l"><label title="${veT(dica)}">${veT(rot)}</label><span class="ve-p3d-tex" title="${veEsc(p[k] || '')}">${p[k] ? veEsc(p[k].split(/[\\/]/).pop()) : veT('nenhuma')}</span>
        <span style="display:flex;gap:4px"><button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3dmatimg="${id}|${k}">${veT('Escolher…')}</button>${p[k] ? `<button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3dmatimg="${id}|${k}|tirar" title="${veT('Tirar')}">✕</button>` : ''}</span></div>`;
    const grupo = n => `<div class="ve3d-matgrupo">${veT(n)}</div>`;
    const prods = ve3dEmbProdutos().map(x => [x.id, x.nome]);
    const emb = vePpSec(veT('Embalagem'),
        `<div class="ve-pp-l"><label>${veT('Produto')}</label>${sel('data-p3demb', 'produto', prods.length ? prods : [['pote', 'Pote'], ['bastao', 'Bastão']], f.produto)}</div>
        <div class="ve-pp-l"><label>${veT('Rótulo')}</label><span class="ve-p3d-tex" title="${veEsc(f.rotulo || '')}">${f.rotulo ? veEsc(f.rotulo.split(/[\\/]/).pop()) : veT('nenhum')}</span>
            <span style="display:flex;gap:4px"><button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3demb="${id}|rotulo" title="${veT('Arte do rótulo (PNG com transparência): entra encaixada na frente, sem distorcer')}">${veT('Escolher…')}</button>${f.rotulo ? `<button class="ve-btn ve-btn-sm ve-btn-ghost" data-p3demb="${id}|semrotulo" title="${veT('Tirar o rótulo')}">✕</button>` : ''}</span></div>`);
    const mat = vePpSec(veT('Material'),
        `<div class="ve3d-pills">${partes.map(x => `<button class="ve-btn ve-btn-sm${x === parte ? ' on' : ''}" data-p3dmatparte="${id}|${x}" title="${veT('Editar o material desta parte')}">${veT(VE3D_PARTES_NOMES[x] || x)}</button>`).join('')}</div>
        <div class="ve3d-matlib">${ve3dMatLib().map(L => `<button class="ve3d-mat" data-p3dmatlib="${id}|${L.id}" title="${veT('Aplicar')}: ${veT(L.nome)}"><i style="${ve3dMatBolinha(L.id, p.cor)}"></i><span>${veT(L.nome)}</span></button>`).join('')}</div>` +
        grupo('Superfície') + corIn('cor', 'Cor base') + sl('metalico', 'Metálico', 0, 1, 0.01, '0 = plástico/tinta, 1 = metal') + sl('rugosidade', 'Rugosidade', 0, 1, 0.01, '0 = espelho, 1 = fosco') + sl('especular', 'Especular', 0, 1, 0.01, 'força do reflexo do plástico') +
        grupo('Transmissão') + sl('transmissao', 'Transmissão', 0, 1, 0.01, '1 = a luz atravessa (vidro, gel)') + sl('ior', 'IOR', 1, 2.5, 0.01, 'índice de refração: água 1,33 · gel 1,42 · vidro 1,5') +
        sl('absorcao', 'Absorção', 0, 4, 0.05, 'quanto a cor tinge por dentro (gel colorido)') +
        ((+p.transmissao || 0) > 0 ? `<div class="ve-pp-l"><label title="${veT('Bolhas de ar dentro do translúcido (só no render)')}">${veT('Bolhas')}</label><input type="checkbox" data-p3dmat="${id}|bolhas" ${p.bolhas ? 'checked' : ''}></div>` : '') +
        grupo('Verniz e tecido') + sl('verniz', 'Verniz', 0, 1, 0.01, 'camada brilhante por cima') + sl('verniz_rug', 'Rugosidade do verniz', 0, 1, 0.01) + sl('sheen', 'Brilho de tecido', 0, 1, 0.01, 'veludo, pelúcia: a borda acende') +
        grupo('Emissão') + corIn('emissao', 'Cor da emissão') + sl('emissao_forca', 'Força', 0, 10, 0.1, 'a peça brilha sozinha (neon, LED)') +
        grupo('Textura e relevo') + img('textura', 'Imagem', 'imagem no lugar da cor (estampa, padrão)') + (p.textura ? sl('textura_escala', 'Repetir', 0.1, 20, 0.1) : '') +
        `<div class="ve-pp-l"><label>${veT('Relevo')}</label>${sel('data-p3dmat', 'relevo', [['nenhum', 'Nenhum'], ['ranhuras', 'Ranhuras (tampa)'], ['imagem', 'Imagem (cinza)']], p.relevo || 'nenhum')}</div>` +
        (p.relevo === 'imagem' ? img('relevo_img', 'Imagem do relevo', 'tons de cinza: claro sobe, escuro desce') : '') + (p.relevo && p.relevo !== 'nenhum' ? sl('relevo_forca', 'Força do relevo', 0, 1, 0.01) : '') +
        `<small class="ve-pp-dica">${veT('Os mesmos campos do Principled BSDF do Blender: a prévia aqui e o render fotorrealista usam os mesmos números.')}</small>`);
    return so === 'emb' ? emb : so === 'mat' ? mat : emb + mat;
}
(function () {
    const aparencia = ve3dAparenciaHtml;
    ve3dAparenciaHtml = function (md) { return (md.fonte || {}).tipo === 'embalagem' ? ve3dEmbPainel(md) : aparencia(md); };
    ve3dEmbDefs().catch(() => {}); ve3dMatDefs().catch(() => {});
    const cena = () => { const c = VE.clips[VE.sel], m = c && veMediaOf(c); return ve3dEh(m) ? m : null; };
    const embalagem = (quem, op) => { const m = cena(); if (m) VE3DAPI.embalagem(quem, op, m.id).then(() => ve3dPainel()).catch(e => veToast(e.message || String(e))); };
    const parteDe = quem => (VE3D.embParte || {})[quem] || 'corpo';
    const valor = el => el.type === 'checkbox' ? el.checked : el.type === 'color' || el.tagName === 'SELECT' ? el.value : parseFloat(String(el.value).replace(',', '.'));
    // ao vivo (arrastar): só o material da prévia muda, sem remontar a peça; no fim (change) grava na cena
    document.addEventListener('input', e => {
        const el = e.target.closest('[data-p3dmat]'); if (!el || el.type === 'checkbox' || el.tagName === 'SELECT') return;
        const m = cena(), [quem, k] = el.dataset.p3dmat.split('|'), v = valor(el); if (!m || (typeof v === 'number' && !isFinite(v))) return;
        const md = m.c3d.modelos.find(x => x.id === quem), e3 = VE3D.rt.get(m.id), o = e3 && e3.rt && e3.rt.objs.find(x => x.md.id === quem); if (!md || !o) return;
        const parte = parteDe(quem), p = { ...ve3dEmbParams(md.fonte, parte), [k]: v };
        o.raiz.traverse(x => { if (x.isMesh && x.material && x.material.name === parte) ve3dMatAplicar(x.material, p); });
        const linha = el.closest('.ve-p3d'); if (linha) linha.querySelectorAll('[data-p3dmat]').forEach(x => { if (x !== el) x.value = v; });
        if (typeof VE3T === 'object') VE3T.chave = '';
    });
    document.addEventListener('change', e => {
        const el = e.target.closest('[data-p3dmat]'), em = e.target.closest('[data-p3demb]');
        if (em && em.tagName !== 'BUTTON') { const [quem, k] = em.dataset.p3demb.split('|'); embalagem(quem, { [k]: em.value }); return; }
        if (!el) return;
        const [quem, k] = el.dataset.p3dmat.split('|'), v = valor(el); if (typeof v === 'number' && !isFinite(v)) return;
        embalagem(quem, { parte: parteDe(quem), campos: { [k]: v } });
    });
    document.addEventListener('click', e => {
        const lib = e.target.closest('[data-p3dmatlib]'), pt = e.target.closest('[data-p3dmatparte]'), im = e.target.closest('[data-p3dmatimg]'), em = e.target.closest('button[data-p3demb]');
        if (pt) { const [quem, parte] = pt.dataset.p3dmatparte.split('|'); (VE3D.embParte = VE3D.embParte || {})[quem] = parte; ve3dPainel(); return; }
        if (lib) { const [quem, preset] = lib.dataset.p3dmatlib.split('|'); embalagem(quem, { parte: parteDe(quem), preset }); return; }
        if (im) {
            const [quem, k, tirar] = im.dataset.p3dmatimg.split('|');
            if (tirar) { embalagem(quem, { parte: parteDe(quem), campos: { [k]: null } }); return; }
            (async () => { const p = await window.pywebview.api.vk_dialogo('abrir', ['Imagens (*.png;*.jpg;*.jpeg;*.webp)']); if (p) embalagem(quem, { parte: parteDe(quem), campos: { [k]: p } }); })();
            return;
        }
        if (em) {
            const [quem, k] = em.dataset.p3demb.split('|');
            if (k === 'semrotulo') { embalagem(quem, { rotulo: null }); return; }
            (async () => { const p = await window.pywebview.api.vk_dialogo('abrir', ['Imagens (*.png;*.jpg;*.jpeg;*.webp)']); if (p) embalagem(quem, { [k]: p }); })();
        }
    });
})();
// API: VE3DAPI.embalagem(quem, {produto, material (acabamento antigo), cores, rotulo (caminho | null),
//      parte + preset (nome da biblioteca) | parte + campos {cor, metalico, rugosidade, especular, transmissao, ior, absorcao,
//      verniz, verniz_rug, sheen, emissao, emissao_forca, bolhas, relevo, relevo_forca, relevo_img, textura, textura_escala}}, cena)
VE3DAPI.embalagem = async function (quem, op = {}, cena) {
    const m = ve3dAlvo(cena), md = ve3dObj(m, quem), f = md.fonte;
    if (!f || f.tipo !== 'embalagem') throw new Error(`"${quem}" não é uma embalagem`);
    await ve3dMatDefs();
    vePushHistory();
    for (const k of ['produto', 'material']) if (op[k]) f[k] = op[k];
    if (op.cores) f.cores = { ...(f.cores || {}), ...op.cores };
    if ('rotulo' in op) { if (op.rotulo) f.rotulo = op.rotulo; else delete f.rotulo; }
    if (op.parte && (op.preset || op.campos)) {
        const atual = ve3dEmbParams(f, op.parte), M = VE3D_MATS;
        let novo = { ...atual };
        if (op.preset) {
            if (!M[op.preset] || op.preset.startsWith('_')) throw new Error(`material "${op.preset}" não existe (${ve3dMatLib().map(x => x.id).join(', ')})`);
            const pr = { ...M._campos, ...M[op.preset] }; delete pr.nome;
            // a biblioteca troca o "como é feito"; cor (se ele não traz uma), estampa e relevo ficam
            novo = { ...pr, cor: M[op.preset].cor || atual.cor, textura: atual.textura, textura_escala: atual.textura_escala,
                relevo: atual.relevo, relevo_img: atual.relevo_img, relevo_forca: atual.relevo_forca };
        }
        Object.assign(novo, op.campos || {});
        f.materiais = { ...(f.materiais || {}), [op.parte]: novo };
    }
    md.fonte = { ...f };   // fonte nova → a cena remonta a peça (ve3dChave)
    ve3dMudou(m); await ve3dGarantir(m);
    return { id: md.id, fonte: md.fonte };
};

// ── Render fotorrealista: a cena COMO ESTÁ na agulha vai para o Blender (Functions/blender_estudio.py) ──
// Cada embalagem leva a matriz do three convertida para o Blender (Y para cima → Z para cima; a unidade da Cena 3D
// vale 2,94 unidades do perfil, a altura do bastão); a câmera vai com posição, direção e lente; o cenário de estúdio
// vira o ciclorama na cor dele (sem estúdio: fundo transparente com a sombra). Só embalagens entram, por enquanto.
const VE3D_ESTUDIO_Q = { rapida: { amostras: 96, nome: 'Rápido (prévia, ~20 s)' }, estudio: { amostras: 320, nome: 'Estúdio Full HD (final, ~1 min)' },
    '2k': { amostras: 320, nome: 'Estúdio 2K / QHD 2560 (~2 min)', lado: 2560 }, '4k': { amostras: 320, nome: 'Estúdio 4K / UHD 3840 (~3 min)', lado: 3840 } };
async function ve3dEstudioSpec(c, { qualidade = 'estudio', t: tFonte } = {}) {
    const m = veMediaOf(c), rt = await ve3dGarantir(m), T = rt.T, Q = VE3D_ESTUDIO_Q[qualidade] || VE3D_ESTUDIO_Q.estudio;
    let W = VE.seqW || 1920, H = VE.seqH || 1080;
    if (Q.lado) { const k = Q.lado / Math.max(W, H); W = Math.round(W * k); H = Math.round(H * k); }
    const t = tFonte ?? Math.max(0, veSrcAt(c, VE.playhead));
    ve3dAplicar(rt, m, t, Math.max(64, Math.round(W / 6)), Math.max(64, Math.round(H / 6)));   // posições e câmera no tempo da agulha
    const K = 2.94, Cm = new T.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1), Ci = Cm.clone().invert(), S = new T.Matrix4().makeScale(K, K, K);
    const linhas = M => M.clone().transpose().elements.map(v => +v.toFixed(6));
    const objetos = [], fora = [], luzes = [];
    const b3 = p => [+(p.x * K).toFixed(4), +(-p.z * K).toFixed(4), +(p.y * K).toFixed(4)];   // three (Y↑) → Blender (Z↑) × escala
    for (const o of rt.objs) {
        if (!o.raiz.visible) continue;
        const f = o.md.fonte || {};
        if (f.tipo === 'luz') {   // a mesma luz no Blender (potência × K² porque as distâncias crescem K vezes)
            const v = k => ve3dVal(o.md, k, t), P = VE3D_LUZ_PADRAO[f.luz] || {}, W0 = v('potencia') ?? P.potencia;
            luzes.push({ tipo: f.luz, pos: b3(o.raiz.getWorldPosition(new T.Vector3())), mira: b3(new T.Vector3(v('mx') ?? 0, v('my') ?? 0.4, v('mz') ?? 0)),
                energia: f.luz === 'sol' ? W0 : W0 * K * K, cor: ve3dLuzRgb(v), largura: (v('largura') ?? P.largura ?? 0.6) * K, altura: (v('altura') ?? P.altura ?? 1.6) * K,
                angulo: v('angulo') ?? P.angulo ?? 35, giro: v('giro') || 0 });
            continue;
        }
        if (f.tipo !== 'embalagem') { fora.push(o.md.nome || o.md.id); continue; }
        const obj = o.raiz.children[0].children[0]; obj.updateMatrixWorld(true);
        objetos.push({ produto: f.produto, material: f.material || 'softtouch', cores: f.cores || {}, materiais: f.materiais || {}, rotulo: f.rotulo || null,
            matriz: linhas(S.clone().multiply(Cm).multiply(obj.matrixWorld).multiply(Ci)) });
    }
    const cam = rt.cam; cam.updateMatrixWorld(true);
    const MC = Cm.clone().multiply(cam.matrixWorld); for (const i of [12, 13, 14]) MC.elements[i] *= K;   // gira o mundo, não a câmera
    const cn = ve3dCenario(m.c3d), ab = ve3dVal(m.c3d.camera, 'abertura', t) || 0, foco = ve3dVal(m.c3d.camera, 'foco', t);
    const L = m.c3d.luz, lv = k => ve3dVal(L, k, t);   // a Luz da Cena 3D comanda as softboxes do render
    const luz_cena = { az: lv('azimute') ?? -40, el: lv('elevacao') ?? 50, intensidade: lv('intensidade') ?? 2.6, ambiente: lv('ambiente') ?? 0.8,
        sombra: lv('sombra') ?? 0.5, contra: lv('contra') || 0, cor: lv('cor') || '#ffffff' };
    const spec = { objetos, luzes, camera_matriz: linhas(MC), fov: cam.fov, largura: W, altura: H, amostras: Q.amostras, pulos_transmissao: 8, luz: 1, luz_cena,
        cenario: !!cn.p.estudio, cores: { fundo: cn.p.estudioCor || '#e9e4dc' }, nome: (m.name || 'cena').replace(/[^\w-]+/g, '_'),
        camera: { fstop: ab > 0.01 ? +Math.max(1.4, 16 * (1 - ab)).toFixed(2) : null, foco: foco ? foco * K : null } };
    return { spec, fora };
}
async function ve3dEstudio(c, op = {}) {
    if (VE3D.estudioRodando) throw new Error(veT('Já tem uma foto sendo renderizada'));
    const { spec, fora } = await ve3dEstudioSpec(c, op);
    if (!spec.objetos.length) throw new Error(veT('Nenhuma embalagem na cena: o render fotorrealista é para Pote e Bastão'));
    const dir = typeof vePrPrefs === 'function' && vePrPrefs().dir; if (dir) spec.saida = dir.replace(/[\\/]+$/, '') + '/Estudio';
    VE3D.estudioRodando = true;
    try {
        const r = await window.pywebview.api.ve_3d_estudio(JSON.stringify(spec));
        if (!r || !r.success) throw new Error((r && r.error) || veT('o render falhou'));
        return { ...r, fora };
    } finally { VE3D.estudioRodando = false; }
}
// Vídeo fotorrealista: a cena quadro a quadro (◆ de objetos, câmera e luzes) → Blender renderiza todos de uma vez
// (EEVEE ~1–2 s/quadro; Cycles bem mais lento) → MP4 (ou MOV com alfa sem fundo) no painel Projeto.
// qualidade: 'previa' (Cycles 16 amostras, ~3 s/quadro na RTX 3050) | 'final' (Cycles 32, ~5,6 s) | 'eevee' (motor rápido, sem bolhas)
// — bancada 2026-10-15: amostras é o que pesa; 8 pulos no gel = idêntico; com a limpeza OptiX 16–32 amostras ficam iguais a olho a 64
const VE3D_VIDEO_Q = { previa: { motor: 'cycles', amostras: 16 }, final: { motor: 'cycles', amostras: 32 }, eevee: { motor: 'eevee' } };
async function ve3dEstudioVideo(c, { qualidade = 'previa', motor, aoProgresso, segundos, amostras } = {}) {
    const VQ = VE3D_VIDEO_Q[qualidade] || VE3D_VIDEO_Q.previa; motor = motor || VQ.motor; amostras = amostras || VQ.amostras;
    if (VE3D.estudioRodando) throw new Error(veT('Já tem um render rodando'));
    const vel = typeof veVel === 'function' ? veVel(c) : 1, fps = VE.fps || 30, n = Math.max(1, Math.round(Math.min(veEnd(c) - c.st, segundos || 1e9) * fps));
    const { spec, fora } = await ve3dEstudioSpec(c, { qualidade: 'estudio', t: c.s });
    if (!spec.objetos.length) throw new Error(veT('Nenhuma embalagem na cena: o render fotorrealista é para Pote e Bastão'));
    const quadros = [];
    for (let i = 0; i < n; i++) {
        const { spec: s } = await ve3dEstudioSpec(c, { qualidade: 'estudio', t: c.s + i / fps * vel });
        quadros.push({ objetos: s.objetos.map(o => o.matriz), camera_matriz: s.camera_matriz, fov: s.fov,
            luzes: s.luzes.map(l => ({ pos: l.pos, mira: l.mira, energia: l.energia, cor: l.cor, giro: l.giro })) });
    }
    if (typeof VE3T === 'object') VE3T.chave = '';
    Object.assign(spec, { quadros, fps, motor, amostras: amostras || (motor === 'cycles' ? 32 : spec.amostras), pulos_transmissao: 8, amostras_eevee: 64, nome: spec.nome + '_video' });
    const dir = typeof vePrPrefs === 'function' && vePrPrefs().dir; if (dir) spec.saida = dir.replace(/[\\/]+$/, '') + '/Estudio';
    VE3D.estudioRodando = true;
    const tm = setInterval(async () => { try { const p = await window.pywebview.api.ve_3d_estudio_progresso(); if (aoProgresso) aoProgresso(p); } catch (e) { /* segue */ } }, 1000);
    try {
        const r = await window.pywebview.api.ve_3d_estudio_video(JSON.stringify(spec));
        if (!r || !r.success) throw new Error((r && r.error) || veT('o vídeo falhou'));
        return { ...r, fora };
    } finally { clearInterval(tm); VE3D.estudioRodando = false; }
}
// roda um render (foto: rapida|estudio|2k|4k; vídeo: video:eevee|video:cycles) mostrando o andamento no botão
async function ve3dEstudioExecutar(c, est, btn) {
    const txt = btn ? btn.innerHTML : ''; if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + veT('Renderizando…'); }
    veToast(veT('Renderizando no Blender… (pode continuar mexendo)'));
    try {
        const video = est.startsWith('video:');
        const r = video ? await ve3dEstudioVideo(c, { qualidade: est.slice(6), aoProgresso: p => { if (btn && p && p.total) btn.textContent = `⏳ ${p.feito}/${p.total}`; } })
            : await ve3dEstudio(c, { qualidade: est });
        if (typeof vePjImportarArquivo === 'function') await vePjImportarArquivo(r.path);
        veToast(`${veT(video ? 'Vídeo pronto' : 'Foto pronta')}${r.cache ? ` (${veT('já estava feita')})` : ` · ${r.segundos} s`} — ${veT('no painel Projeto')}` + (r.fora && r.fora.length ? ` · ${veT('ficaram de fora')}: ${r.fora.join(', ')}` : ''));
        window.pywebview.api.open_file(r.path);
        return r;
    } catch (er) { veToast(er.message || String(er)); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
}
function ve3dEstudioMenu(btn) {
    const c = ve3dTelaClipe(); if (!c) return;
    veClipMenuFechar();
    const m = document.createElement('div'); m.className = 've-ctx';
    m.innerHTML = `<div class="ve-ctx-title">${veT('Render fotorrealista (Blender)')}</div>` +
        Object.entries(VE3D_ESTUDIO_Q).map(([k, q]) => `<button class="ve-ctx-item" data-est="${k}">${veT(q.nome)}</button>`).join('') +
        `<div class="ve-ctx-sep"></div><div class="ve-ctx-sub">${veT('Vídeo (a cena inteira, com a animação)')}</div>` +
        `<button class="ve-ctx-item" data-est="video:previa">${veT('Vídeo prévia (~3 s por quadro)')}</button>` +
        `<button class="ve-ctx-item" data-est="video:final">${veT('Vídeo final (~6 s por quadro)')}</button>` +
        `<div class="ve-ctx-sub">${veT('A cena como está na agulha · tamanho da timeline · vai para o painel Projeto')}</div>`;
    document.body.appendChild(m); const b = btn.getBoundingClientRect(); veCtxPosicionar(m, b.left, b.bottom + 4, document);
    m.addEventListener('click', async e => {
        const it = e.target.closest('[data-est]'); if (!it) return; veClipMenuFechar();
        ve3dEstudioExecutar(c, it.dataset.est, btn);
    });
    const fora = e => { if (!m.contains(e.target)) veClipMenuFechar(); };
    setTimeout(() => document.addEventListener('pointerdown', fora, true), 0);
    VE._ctx = { m, fechar: () => { document.removeEventListener('pointerdown', fora, true); m.remove(); } };
}
// API (agente): VE3DAPI.estudio({qualidade: rapida|estudio|4k}) → {path, segundos, cache, fora}; usa a cena selecionada
// VE3DAPI.estudioVideo({motor: eevee|cycles}) → {path, segundos, quadros, cache}
VE3DAPI.estudioVideo = async function (op = {}) { const c = ve3dTelaClipe && ve3dTelaClipe() || VE.clips[VE.sel]; if (!c) throw new Error('selecione a cena 3D'); return ve3dEstudioVideo(c, op); };
VE3DAPI.estudio = async function (op = {}) { const c = ve3dTelaClipe && ve3dTelaClipe() || VE.clips[VE.sel]; if (!c) throw new Error('selecione a cena 3D'); return ve3dEstudio(c, op); };
