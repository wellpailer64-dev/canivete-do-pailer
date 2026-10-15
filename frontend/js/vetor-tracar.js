// =========================================================
// Vetor Kanivete — Traçado de imagem v2 (Image Trace do Illustrator, melhorado). Motor em Functions/vetor_tracar.py
// (VTracer, MIT) com o que o Illustrator não faz: limpeza por IA antes (logo pequeno/JPEG do WhatsApp vira contorno
// limpo), fundo liso tirado pela borda, N cores exatas e as cores encaixadas nas AMOSTRAS do documento (cores da marca,
// CMYK/Pantone exatos). Sai pronto: formas soltas já em curvas (sem Expandir nem Desagrupar), selecionadas, a imagem
// fica oculta embaixo. Apagar o que não presta: clique e Del, ou Editar › Selecionar mesma cor.
// vetorizar {predef, cores, limpar (auto|true|false), fundo, modo (empilhado|recortado), detalhe 0-100, suavidade 0-100,
//   ignorar_branco, cores_marca (true), agrupar (false), manter_imagem (false), motor ('antigo' = o k-means de antes)}
// =========================================================
const VK_TRACAR_PREDEF = [['logo', 'Logo colorido (padrão)'], ['cores3', '3 cores'], ['cores6', '6 cores'], ['cores16', '16 cores'],
    ['pb', 'Logo preto e branco'], ['silhueta', 'Silhueta'], ['traco', 'Arte de linha'], ['tecnico', 'Desenho técnico'],
    ['cinza', 'Tons de cinza'], ['foto_alta', 'Foto alta fidelidade'], ['foto_baixa', 'Foto baixa fidelidade']];
const VK_TRACAR_CACHE = new Map();   // prévia → aplicar sem traçar de novo (chave: arquivo + opções)

function vkTracarOp(a) {
    const op = {};
    for (const k of ['predef', 'cores', 'limpar', 'fundo', 'modo', 'detalhe', 'suavidade', 'ignorar_branco']) if (a[k] != null && a[k] !== '') op[k] = a[k];
    if (op.limpar === 'sim') op.limpar = true; else if (op.limpar === 'nao') op.limpar = false;
    return op;
}
async function vkTracarRodar(arquivo, op) {
    const k = arquivo + '|' + JSON.stringify(op);
    if (VK_TRACAR_CACHE.has(k)) return VK_TRACAR_CACHE.get(k);
    const r = await vkApi().vk_tracar(arquivo, op);
    if (!r || !r.success) throw new Error((r && r.error) || 'o traçado falhou');
    VK_TRACAR_CACHE.clear(); VK_TRACAR_CACHE.set(k, r);   // só o último (um traçado de foto tem 200 mil pontos)
    return r;
}
// cor de cada forma: a amostra do documento mais perto (cor da marca) ou a convertida para CMYK pelo perfil
async function vkTracarCores(formas, marca) {
    const api = vkApi(), cmyk = VK.doc.modoCor !== 'rgb', chave = c => c.join(',');
    const unicas = [...new Map(formas.map(f => [chave(f.rgb), f.rgb])).values()];
    const conv = cmyk && unicas.length ? await api.vk_rgb_para_cmyk(unicas, VK.doc.perfil) : null;
    const out = new Map(unicas.map((c, i) => [chave(c), conv ? { k: 'cmyk', v: conv[i].map(v => Math.round(v * 10) / 10) } : { k: 'rgb', v: c }]));
    const am = marca ? (VK.doc.amostras || []).filter(s => s.cor && ['cmyk', 'rgb', 'spot'].includes(s.cor.k)) : [];
    if (am.length) {
        const proc = am.filter(s => s.cor.k !== 'rgb');
        const tela = proc.length ? await api.vk_cores_tela(proc.map(s => s.cor.k === 'spot' ? s.cor.v.map(x => x * (s.cor.tint ?? 100) / 100) : s.cor.v), VK.doc.perfil) : [];
        const rgbAm = am.map(s => (s.cor.k === 'rgb' ? s.cor.v : tela[proc.indexOf(s)]));
        unicas.forEach(c => {
            let melhor = -1, d0 = 48 * 48;   // ~48 de distância RGB: parecida o bastante para ser a mesma cor da marca
            rgbAm.forEach((r, i) => { const d = (r[0] - c[0]) ** 2 + (r[1] - c[1]) ** 2 + (r[2] - c[2]) ** 2; if (d < d0) { d0 = d; melhor = i; } });
            if (melhor >= 0) out.set(chave(c), vkClone(am[melhor].cor));
        });
    }
    return formas.map(f => out.get(chave(f.rgb)));
}
(function () {
    VK_CMDS.vetorizar_antigo = VK_CMDS.vetorizar;
    vkRegistrar('vetorizar', 'traçado de imagem', async a => {
        if (a.motor === 'antigo') return VK_CMDS.vetorizar_antigo.fn(a);
        const ims = vkTxAlvos(a).filter(o => o.tipo === 'imagem'); if (!ims.length) throw new Error('vetorizar: selecione uma imagem colocada');
        const ids = [], info = { formas: 0, pontos: 0, cores: new Set(), limpou_ia: false, fundo_tirado: false };
        for (const im of ims) {
            const arq = VK.doc.imagens[im.img] && VK.doc.imagens[im.img].arquivo; if (!arq) throw new Error('vetorizar: imagem sem arquivo');
            vkCarregando(true, 'Traçando a imagem...');
            let r; try { r = await vkTracarRodar(arq, vkTracarOp(a)); } finally { vkCarregando(false); }
            const cores = await vkTracarCores(r.formas, a.cores_marca !== false), m = im.m;
            const objs = r.formas.map((f, i) => ({ id: vkId(), tipo: 'caminho', regra: 'nonzero', nome: `traçado ${i + 1}`, traco: null, preench: cores[i],
                subs: f.subs.map(s => ({ fechado: s.fechado, pts: s.pts.map(q => [...vkAp(m, q[0], q[1]), ...vkAp(m, q[2], q[3]), ...vkAp(m, q[4], q[5])]) })) }));
            const l = vkListaDe(im.id), novos = a.agrupar ? [{ id: vkId(), tipo: 'grupo', nome: a.nome || 'Traçado', itens: objs }] : objs;
            l.splice(l.indexOf(im) + 1, 0, ...novos);
            if (!a.manter_imagem) im.visivel = false;
            ids.push(...novos.map(o => o.id));
            info.formas += objs.length; info.limpou_ia = info.limpou_ia || r.limpou_ia; info.fundo_tirado = info.fundo_tirado || r.fundo_tirado;
            objs.forEach(o => { info.cores.add(vkCorTexto(o.preench)); o.subs.forEach(s => info.pontos += s.pts.length); });
        }
        VK.sel = ids;
        return { ids: ids.length > 40 ? ids.slice(0, 40).concat(['…']) : ids, formas: info.formas, pontos: info.pontos, cores: info.cores.size,
            limpou_ia: info.limpou_ia, fundo_tirado: info.fundo_tirado, caixa_mm: ids.length ? vkCaixaMM({ tipo: 'grupo', itens: ids.filter(x => x !== '…').map(vkObj).filter(Boolean) }) : null };
    });
    // Selecionar › Mesma cor (preenchimento): os objetos do topo com a mesma cor do selecionado (apagar o fundo do traçado de uma vez)
    vkRegistrar('selecionar_mesma_cor', 'selecionar mesma cor', a => {
        const base = vkObj(a.id || VK.sel[0]); if (!base || !base.preench) throw new Error('selecione um objeto com preenchimento');
        const alvo = vkCorTexto(base.preench), sel = [];
        for (const c of VK.doc.camadas) if (c.visivel !== false && !c.trava) for (const o of c.itens) if (o.visivel !== false && o.preench && vkCorTexto(o.preench) === alvo) sel.push(o.id);
        VK.sel = sel; VK._antes = null;
        return { cor: alvo, objetos: sel.length };
    });
    const ed = VK_MENUS.find(x => x[0] === 'Editar');
    if (ed) ed[1].push(['Selecionar mesma cor', '', () => vkCmdUi('selecionar_mesma_cor', {}).then(r => r && vkToast(`${r.objetos} objeto(s) em ${r.cor}`))]);
    const ob = VK_MENUS.find(x => x[0] === 'Objeto'), it = ob && ob[1].find(x => Array.isArray(x) && /Image Trace/.test(x[0]));
    if (it) { it[0] = 'Traçado de imagem (Image Trace)…'; it[2] = () => vkTracarDialogo(); }
})();

function vkTracarDialogo() {
    const im = VK.sel.map(vkObj).find(o => o && o.tipo === 'imagem');
    if (!im) return vkToast('Selecione uma imagem colocada (Arquivo › Colocar)');
    const arq = VK.doc.imagens[im.img] && VK.doc.imagens[im.img].arquivo;
    const pref = (() => { try { return JSON.parse(localStorage.getItem('vk-tracar') || '{}'); } catch (e) { return {}; } })();
    const temAm = (VK.doc.amostras || []).some(s => s.cor && ['cmyk', 'spot'].includes(s.cor.k));
    vkModal(`<div class="ie-dlg-tit">Traçado de imagem</div><div class="ie-dlg-corpo" style="width:420px;max-width:80vw">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;flex-direction:column;gap:6px">
            <canvas id="vt-cv" width="840" height="400" style="background:repeating-conic-gradient(#3a3a3a 0 25%,#2c2c2c 0 50%) 0 0/16px 16px;border-radius:4px;width:100%;aspect-ratio:840/400"></canvas>
            <div class="vk-nota" id="vt-info">Gerando a prévia…</div>
          </div>
          <div>
            <div class="vk-linha"><span>Predefinição</span><select id="vt-pre">${VK_TRACAR_PREDEF.map(([k, n]) => `<option value="${k}" ${k === (pref.predef || 'logo') ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="vk-linha"><span>Detalhe</span><input type="range" id="vt-det" min="0" max="100" value="${pref.detalhe ?? 50}"></div>
            <div class="vk-linha"><span>Suavidade</span><input type="range" id="vt-sua" min="0" max="100" value="${pref.suavidade ?? 30}"></div>
            <div class="vk-linha"><span>Formas</span><select id="vt-modo"><option value="empilhado">Empilhadas (fiel, sem filete)</option><option value="recortado" ${pref.modo === 'recortado' ? 'selected' : ''}>Encostadas (plotter / vinil)</option></select></div>
            <div class="vk-linha"><span>Limpar com IA</span><select id="vt-ia"><option value="auto">Automático (pequena ou JPEG)</option><option value="sim">Sempre</option><option value="nao">Não</option></select></div>
            <label class="vk-chk"><input type="checkbox" id="vt-fundo" ${pref.fundo === false ? '' : 'checked'}> Tirar o fundo liso</label>
            <label class="vk-chk" title="Branco = papel: as áreas brancas não viram forma (com Formas encostadas, viram furo)"><input type="checkbox" id="vt-branco" ${pref.ignorar_branco ? 'checked' : ''}> Ignorar o branco</label>
            <label class="vk-chk" title="Cada cor parecida com uma amostra do documento vira a própria amostra (CMYK/Pantone exatos)"><input type="checkbox" id="vt-marca" ${temAm ? 'checked' : 'disabled'}> Usar as cores da marca (amostras)</label>
            <label class="vk-chk"><input type="checkbox" id="vt-grupo" ${pref.agrupar ? 'checked' : ''}> Agrupar o resultado</label>
          </div>
        </div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="vt-ok">Traçar</button></div>`, (m, fechar) => {
        const g = id => m.querySelector(id);
        const args = () => {
            const det = +g('#vt-det').value, sua = +g('#vt-sua').value;
            return { predef: g('#vt-pre').value, detalhe: det === 50 ? undefined : det, suavidade: sua === 30 ? undefined : sua, modo: g('#vt-modo').value,
                limpar: g('#vt-ia').value, fundo: g('#vt-fundo').checked, ignorar_branco: g('#vt-branco').checked, cores_marca: g('#vt-marca').checked, agrupar: g('#vt-grupo').checked };
        };
        let vez = 0, t = 0;
        const previa = async () => {
            const minha = ++vez, a = args(), t0 = performance.now();
            g('#vt-info').textContent = 'Gerando a prévia…';
            try {
                const r = await vkTracarRodar(arq, vkTracarOp(a)); if (minha !== vez) return;
                const cv = g('#vt-cv'), x = cv.getContext('2d'), e = Math.min(cv.width / r.w, cv.height / r.h);
                x.clearRect(0, 0, cv.width, cv.height); x.save(); x.translate((cv.width - r.w * e) / 2, (cv.height - r.h * e) / 2); x.scale(e, e);
                let pts = 0;
                for (const f of r.formas) {
                    const p = new Path2D();
                    for (const s of f.subs) {
                        const P = s.pts; if (!P.length) continue; pts += P.length;
                        p.moveTo(P[0][0], P[0][1]);
                        for (let i = 1; i < P.length; i++) p.bezierCurveTo(P[i - 1][4], P[i - 1][5], P[i][2], P[i][3], P[i][0], P[i][1]);
                        if (s.fechado) { const a0 = P[P.length - 1], b0 = P[0]; p.bezierCurveTo(a0[4], a0[5], b0[2], b0[3], b0[0], b0[1]); p.closePath(); }
                    }
                    x.fillStyle = `rgb(${f.rgb.join(',')})`; x.fill(p);
                }
                x.restore();
                const cores = new Set(r.formas.map(f => f.rgb.join(','))).size;
                g('#vt-info').textContent = `${r.formas.length} formas · ${cores} cores · ${pts.toLocaleString('pt-BR')} pontos · ${((performance.now() - t0) / 1000).toFixed(1)} s` +
                    (r.limpou_ia ? ' · limpa com IA' : '') + (r.fundo_tirado ? ' · fundo fora' : '');
            } catch (err) { if (minha === vez) g('#vt-info').textContent = err.message; }
        };
        const agendar = () => { clearTimeout(t); t = setTimeout(previa, 350); };
        m.querySelectorAll('select, input').forEach(el => el.addEventListener(el.type === 'range' ? 'change' : 'input', agendar));
        g('#vt-ok').onclick = () => {
            const a = args();
            try { localStorage.setItem('vk-tracar', JSON.stringify({ predef: a.predef, detalhe: +g('#vt-det').value, suavidade: +g('#vt-sua').value, modo: a.modo, fundo: a.fundo, ignorar_branco: a.ignorar_branco, agrupar: a.agrupar })); } catch (e) { /* sem armazenamento */ }
            fechar();
            vkCmdUi('vetorizar', { ids: [im.id], ...a }).then(r => r && vkToast(`Traçado: ${r.formas} formas, ${r.cores} cores — clique e Del apaga uma; Editar › Selecionar mesma cor pega todas da cor`));
        };
        previa();
    });
}
