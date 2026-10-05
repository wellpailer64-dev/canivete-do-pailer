// Vetor Kanivete — RENDER FOTORREALISTA no Blender (Cycles) dos objetos 3D (girar_3d / extrudar_3d).
// Monta a cena no MESMO espaço/ângulo do 3D vetorial (rotação R, perspectiva, luz) e manda para Functions/blender_render.py.
// Rótulos: a arte mapeada vira textura UV (girar: linha a linha pelo raio da altura, como o mapeamento vetorial;
// extrudar: placa com a arte colada na face). O PNG (transparente, chão = só sombra) entra no lugar do objeto vetorial
// (que fica oculto como reserva para gráfica). Blender baixado sob demanda (~400 MB).
function vbRot(o3) {   // mesma composição de vk3dRot: Rz · Rx · Ry
    const b = (o3.girar || 0) * Math.PI / 180, a = -(o3.inclinar || 0) * Math.PI / 180, c = (o3.rolar || 0) * Math.PI / 180;
    const Ry = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]], Rx = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
    const Rz = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]];
    const mul = (A, B) => A.map((l, i) => B[0].map((_, j) => l.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
    return mul(Rz, mul(Rx, Ry));
}
function vbRgb(c) { const m = String(vkCss(c && c.k === 'grad' ? c.paradas[0].cor : c) || 'rgb(200,200,200)').match(/\d+(\.\d+)?/g) || [200, 200, 200]; return m.slice(0, 3).map(v => +v / 255); }
async function vbPng(cv, caminho) { const r = await vkApi().vk_salvar_png(cv.toDataURL('image/png'), caminho); return r && r.path; }
function vbArteCanvas(objs, k) {   // arte (caminhos) rasterizada plana, k px/pt → {cv, b}
    const cams = vk3dArteCaminhos(objs), b = vkBoxUniao(cams.length ? cams : objs);
    const cv = vkRenderObjs(cams, { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] }, k, false); return { cv, b };
}
async function vbCena(g, a, base) {
    const o3 = g.tres_d, R = vbRot(o3), esp = { papel: 0.45, ceramica: 2.4, plastico: 1, metal: 0.35, vidro: 1.6, fosco: 1 };
    const cena = { escala: 0.01, R, amostras: a.amostras || 96, fundo: a.fundo ? vbRgb(vkCorDe(a.fundo)) : null, sombra: a.sombra !== false, objetos: [] };
    const az = (o3.luz_ang ?? -40) * Math.PI / 180, el = (o3.luz_alt ?? 45) * Math.PI / 180;
    cena.luz = { dir: [Math.sin(az) * Math.cos(el), -Math.sin(el), Math.cos(az) * Math.cos(el)], forca: (o3.luz ?? 100) / 100 };
    let pts3 = [];
    if (o3.tipo === 'girar') {
        const P = vk3dLinhas(o3), perfil = P.rows.map(w => [w.r, w.y - P.cy]), ob = { tipo: 'girar', origem: [P.eixo, P.cy], perfil, K: 180, cor: vbRgb(o3.cor), material: o3.material || 'plastico', espessura: esp[o3.material] ?? 1 };
        cena.persp = o3.perspectiva ? P.esc * (6 - 5 * Math.min(1, o3.perspectiva / 100)) : 0; cena.chao_y = P.base - P.cy;
        if ((o3.mapas || []).length) {   // textura do rótulo no UV (u = ângulo, v = altura)
            const ytop = P.top, H0 = P.base - P.top, W = 4096, k = W / (2 * Math.PI * P.rmax), Ht = Math.min(4096, Math.ceil(H0 * k));
            const tx = document.createElement('canvas'); tx.width = W; tx.height = Ht; const ctx = tx.getContext('2d'), sp = (o3.girar || 0) * Math.PI / 180;
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            for (const m of o3.mapas) {
                const esc = (m.escala ?? 100) / 100, { cv, b } = vbArteCanvas(m.arte, k * esc), yc = m.y != null ? P.top + m.y : P.cy, acy = (b[1] + b[3]) / 2;
                const tc = sp + Math.PI / 2 + (m.angulo || 0) * Math.PI / 180, uc = ((1 - tc / (2 * Math.PI)) % 1 + 1) % 1 * W;
                for (let ty = 0; ty < cv.height; ty++) {
                    const yObj = yc + ((b[1] + ty / (k * esc)) - acy) * esc, w = vk3dRaioEm(P, yObj), fx = P.rmax / Math.max(1e-6, w.r), larg = cv.width * fx, yt = (yObj - ytop) * k;
                    if (yt < -1 || yt > Ht) continue;
                    const y0 = Math.floor(yt);   // linha inteira e sobreposta (2 px): sem meia-transparência entre as linhas
                    for (const off of [0, -W, W]) ctx.drawImage(cv, 0, ty, cv.width, 1, uc - larg / 2 + off, y0, larg, 2);
                }
            }
            ob.rotulo = await vbPng(tx, base + '_rotulo.png');
        }
        cena.objetos.push(ob);
        for (const w of P.rows) for (let j = 0; j < 24; j++) { const t = 2 * Math.PI * j / 24; pts3.push([w.r * Math.cos(t), w.y - P.cy, w.r * Math.sin(t)]); }
    } else {
        const f = o3.fonte, b = vkBox(f), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, esc0 = Math.max(b[2] - b[0], b[3] - b[1]) || 1, d = o3.profundidade ?? esc0 * 0.25;
        const subs = f.subs.filter(s => s.fechado && s.pts.length > 1).map(s => s.pts.map(q => [q[0] - cx, q[1] - cy, q[2] - cx, q[3] - cy, q[4] - cx, q[5] - cy]));
        const ob = { tipo: 'extrudar', origem: [cx, cy], subs, prof: d, chanfro: Math.min(o3.chanfro || 0, d * 0.45), cor: vbRgb(o3.cor), material: o3.material || 'fosco', decals: [] };
        cena.persp = o3.perspectiva ? esc0 * (6 - 5 * Math.min(1, o3.perspectiva / 100)) : 0; cena.chao_y = b[3] - cy;
        for (const [i, m] of (o3.mapas || []).entries()) {   // arte na face: placa com 4 cantos (espaço do objeto, pt)
            const escA = (m.escala ?? 100) / 100, { cv, b: ab } = vbArteCanvas(m.arte, 6), acx = (ab[0] + ab[2]) / 2, acy = (ab[1] + ab[3]) / 2, face = m.face || 'frente';
            let canto;
            if (face === 'frente') { const ox = cx + (m.dx || 0), oy = cy + (m.dy || 0); canto = (x, y) => [ox + (x - acx) * escA - cx, oy + (y - acy) * escA - cy, d / 2]; }
            else {   // lateral: mesmos eixos de vk3dMapaExtrudar (U = x da arte, V = y da arte)
                const dir = { direita: [1, 0], esquerda: [-1, 0], topo: [0, -1], base: [0, 1] }[face]; if (!dir) continue;
                let best = null, bs = 0.3;
                for (const s of f.subs) for (let k = 0; k < s.pts.length; k++) { const p = s.pts[k], q = s.pts[(k + 1) % s.pts.length], dx = q[0] - p[0], dy = q[1] - p[1], n0 = Math.hypot(dx, dy); if (n0 < 1e-6) continue;
                    let area = 0; s.pts.forEach((pp, z) => { const qq = s.pts[(z + 1) % s.pts.length]; area += pp[0] * qq[1] - qq[0] * pp[1]; }); const sg = area > 0 ? -1 : 1;
                    const n2 = [sg * -dy / n0, sg * dx / n0], sc = n2[0] * dir[0] + n2[1] * dir[1]; if (sc > bs || (best && Math.abs(sc - bs) < 1e-3 && n0 > best.len)) { bs = sc; best = { a: p, c: q, n2, len: n0 }; } }
                if (!best) continue;
                const { a: A, c: Cq, n2, len } = best; let sx = (Cq[0] - A[0]) / len, sy = (Cq[1] - A[1]) / len, U, V, ext;
                if (Math.abs(sy) >= Math.abs(sx)) { if (sy < 0) { sx = -sx; sy = -sy; } V = [sx, sy, 0]; U = [0, 0, n2[0] > 0 ? -1 : 1]; ext = [d, len]; }
                else { if (sx < 0) { sx = -sx; sy = -sy; } U = [sx, sy, 0]; V = [0, 0, n2[1] < 0 ? 1 : -1]; ext = [len, d]; }
                const k2 = Math.min(ext[0] / ((ab[2] - ab[0]) || 1), ext[1] / ((ab[3] - ab[1]) || 1)) * escA, mx = (A[0] + Cq[0]) / 2, my = (A[1] + Cq[1]) / 2;
                canto = (x, y) => { const u = (x - acx) * k2, v = (y - acy) * k2; return [mx + U[0] * u + V[0] * v - cx, my + U[1] * u + V[1] * v - cy, U[2] * u + V[2] * v]; };
                ob.decals_normal = [n2[0], n2[1], 0];
            }
            ob.decals.push({ png: await vbPng(cv, `${base}_arte${i}.png`), cantos: [canto(ab[0], ab[1]), canto(ab[2], ab[1]), canto(ab[2], ab[3]), canto(ab[0], ab[3])], normal: face === 'frente' ? [0, 0, 1] : ob.decals_normal });
        }
        cena.objetos.push(ob);
        for (const s of subs) for (const q of s) for (const z of [-d / 2, d / 2]) pts3.push([q[0], q[1], z]);
        pts3.push([0, b[3] - cy, 0]);
    }
    // enquadramento (igual ao do Blender): pontos girados → caixa ×1,12 na proporção da imagem
    const vp = pts3.map(v => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2]]);
    // folga para a sombra: dos lados e principalmente embaixo (a sombra de contato e a da luz caem no chão)
    const xs = vp.map(p => p[0]), ys = vp.map(p => p[1]), w0 = Math.max(...xs) - Math.min(...xs), h0 = Math.max(...ys) - Math.min(...ys);
    let larg = w0 * 1.5, alt = h0 * 1.32, cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2 + h0 * 0.1;
    const W = a.largura || 1600, H = a.altura || Math.round(W * alt / larg);
    if (larg / alt > W / H) alt = larg * H / W; else larg = alt * W / H;
    cena.largura = W; cena.altura = H; cena.quadro = { cx, cy, larg, alt };
    return { cena, quadro: cena.quadro };
}
async function vbRenderizar(a = {}) {
    const api = vkApi(); if (!api || !api.vk_blender_render) throw new Error('render_blender: ponte do Blender indisponível');
    let e = await api.vk_blender_estado();
    if (!e.instalado) {
        if (a.instalar === false) throw new Error(`Blender não instalado (~${e.tamanho_gb} GB): use render_blender com instalar:true`);
        vkCarregando(true, `Baixando o Blender ${e.versao} (uma vez só, ~${Math.round(e.tamanho_gb * 1000)} MB)...`);
        try { const r = await api.vk_blender_instalar(); if (!r || !r.success) throw new Error((r && r.error) || 'não instalou'); } finally { vkCarregando(false); }
    }
    const alvos = (a.ids ? a.ids.map(vkObj) : vkTxAlvos(a)).filter(o => o && o.tres_d); if (!alvos.length) throw new Error('render_blender: escolha objetos 3D (girar_3d/extrudar_3d)');
    const pasta = (a.pasta || (await api.vk_blender_estado()).cache || 'D:/kanivete_testes/blender').replace(/[\\/]+$/, ''), out = [];
    for (const g of alvos) {
        const base = `${pasta}/${vkSlug(g.nome || 'objeto3d')}_${g.id}`, { cena, quadro } = await vbCena(g, a, base);
        cena.saida = base + '.png';
        vkCarregando(true, 'Renderizando no Blender...');
        let r; try { r = await api.vk_blender_render(cena); } finally { vkCarregando(false); }
        if (!r || !r.success) throw new Error('Blender: ' + ((r && r.error) || 'falhou') + ' ' + ((r && r.log) || []).slice(-2).join(' | '));
        let id = null;
        if (a.colocar !== false) {   // a imagem cobre exatamente o quadro da câmera, sobre o objeto vetorial
            const cxD = (vkBox(g)[0] + vkBox(g)[2]) / 2, b0 = vkBox(g), cyD = (b0[1] + b0[3]) / 2;
            const P = g.tres_d.tipo === 'girar' ? vk3dLinhas(g.tres_d) : null, f = g.tres_d.fonte, bf = vkBox(f);
            const ox = P ? P.eixo : (bf[0] + bf[2]) / 2, oy = P ? P.cy : (bf[1] + bf[3]) / 2;   // centro da cena 3D no documento
            const x0 = ox + quadro.cx - quadro.larg / 2, y0 = oy + quadro.cy - quadro.alt / 2;
            const im = await VK_CMDS.imagem.fn({ arquivo: r.path, x: x0, y: y0, larg: quadro.larg, un: 'pt', nome: 'Render: ' + (g.nome || '3D') });
            id = im.id; const l = vkListaDe(g.id), o = vkObj(id), li = vkListaDe(id); li.splice(li.indexOf(o), 1); l.splice(l.indexOf(g) + 1, 0, o);
            if (a.substituir !== false) g.visivel = false;
            void cxD; void cyD;
        }
        out.push({ id, caminho: r.path, segundos: r.segundos });
    }
    return { renders: out };
}
window.vkBlenderProgresso = d => { if (d && d.msg) vkCarregando(true, d.msg); };
// Vetor → Editor (Cena 3D): a mesma descrição do Blender (perfil/forma, chanfro, material, rótulo e artes em PNG) vira um
// modelo three.js animável numa cena 3D do Editor Kanivete (editor-3d.js, VE3DAPI.doVetor). Sem cena aberta, cria uma.
async function vbEnviarEditor(a = {}) {
    const alvos = (a.ids ? a.ids.map(vkObj) : vkTxAlvos(a)).filter(o => o && o.tres_d); if (!alvos.length) throw new Error('enviar_editor_3d: escolha objetos 3D (girar_3d/extrudar_3d)');
    if (typeof VE3DAPI !== 'object' || typeof VE === 'undefined') throw new Error('enviar_editor_3d: Editor Kanivete indisponível');
    if (!VE.ready) throw new Error('enviar_editor_3d: abra um vídeo ou crie uma timeline no Editor Kanivete antes');
    const api = vkApi(), pr = await api.ve_c3d_pasta(typeof vePrPrefs === 'function' ? vePrPrefs().dir : ''), out = [];
    if (a.juntar && alvos.length > 1) {   // um modelo só (copo + tampa): as peças mantêm a posição relativa do documento
        const partes = [];
        for (const g of alvos) partes.push((await vbCena(g, { amostras: 1 }, `${pr.pasta.replace(/\\/g, '/')}/${vkSlug(g.nome || 'objeto3d')}_${g.id}_${Date.now().toString(36)}`)).cena.objetos[0]);
        const r = await VE3DAPI.doVetor({ desc: { tipo: 'grupo', partes }, giro: alvos[0].tres_d, nome: a.nome || alvos[0].nome || 'Vetor 3D' });
        if (a.abrir !== false) document.querySelector('.menu-item[data-tool="video-cutter"]')?.click();
        return { enviados: [{ ids: alvos.map(g => g.id), modelo: r.id }] };
    }
    for (const [i, g] of alvos.entries()) {
        const base = `${pr.pasta.replace(/\\/g, '/')}/${vkSlug(g.nome || 'objeto3d')}_${g.id}_${Date.now().toString(36)}`, { cena } = await vbCena(g, { amostras: 1 }, base);
        const r = await VE3DAPI.doVetor({ desc: cena.objetos[0], giro: g.tres_d, nome: g.nome || (g.tres_d.tipo === 'girar' ? 'Vetor: girar' : 'Vetor: extrudar'),
            x: alvos.length > 1 ? (i - (alvos.length - 1) / 2) * 1.1 : 0 });
        out.push({ id: g.id, modelo: r.id });
    }
    if (a.abrir !== false) document.querySelector('.menu-item[data-tool="video-cutter"]')?.click();
    return { enviados: out };
}
vkRegistrar('enviar_editor_3d', 'objeto 3D → cena 3D do Editor (animar)', a => vbEnviarEditor(a || {}));
vkRegistrar('render_blender', 'render fotorrealista (Blender)', a => vbRenderizar(a || {}));
(() => {
    const o = VK_MENUS.find(x => x[0] === 'Objeto'); if (o) o[1].push(['3D: Render fotorrealista (Blender)', '', () => vkCmdUi('render_blender', {})],
        ['3D: Animar no Editor (Cena 3D)', '', () => vkCmdUi('enviar_editor_3d', {})]);
})();
