// Pranchetas como no Illustrator (identidade visual com muitas páginas):
// - ordem automática: VK.doc.layoutPr = {modo: 'grade' | 'vertical' | 'horizontal' | 'livre', colunas, espaco (pt)}.
//   Documento novo: grade de 4 por linha, descendo. Prancheta nova vai para o próximo lugar da ordem.
// - Reorganizar todas (organizar_pranchetas), duplicar com a arte (duplicar_prancheta; Alt+arrastar com a ferramenta
//   Prancheta), mudar a ordem (ordem_prancheta; ▲ ▼ no painel) — com ordem automática a grade se refaz e a arte vai junto.
// - ferramenta Prancheta (Shift+O): arrastar move (com a arte), alças mudam o tamanho, arrastar no vazio cria uma nova.
// A arte de uma prancheta = objetos do topo cujo CENTRO está nela (arte que sangra para fora vai junto).
const VK_LAYOUT_PADRAO = { modo: 'grade', colunas: 4, espaco: 36 };
const vkLayoutPr = () => (VK.doc && VK.doc.layoutPr) || { modo: 'livre', colunas: 4, espaco: 36 };
function vkPrAchar(ref) {
    const ps = VK.doc.pranchetas;
    if (ref == null) return ps.find(q => q.id === VK.ativa) || ps[0];
    const p = ps.find(q => q.id === ref || q.nome === ref) || (Number.isInteger(+ref) ? ps[+ref - 1] : null);
    if (!p) throw new Error(`prancheta "${ref}" não existe; há: ${ps.map(q => q.nome).join(', ')}`);
    return p;
}
function vkPrArte(p) {
    const ids = [];
    for (const c of VK.doc.camadas) for (const o of c.itens) {
        const b = vkBox(o); if (!isFinite(b[0])) continue;
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) ids.push(o.id);
    }
    return ids;
}
// posições na ordem da lista: linhas de `colunas`, cada linha começa embaixo da mais alta da anterior
function vkPrSlots(ps, L = vkLayoutPr()) {
    if (!ps.length) return [];
    const col = L.modo === 'vertical' ? 1 : L.modo === 'horizontal' ? 1e9 : Math.max(1, L.colunas || 4), e = L.espaco ?? 36;
    const x0 = ps[0].x, out = [];
    let y = ps[0].y, x = x0, alt = 0;
    ps.forEach((p, i) => {
        if (i && i % col === 0) { y += alt + e; x = x0; alt = 0; }
        out.push([x, y]); x += p.w + e; alt = Math.max(alt, p.h);
    });
    return out;
}
// move cada prancheta para o seu lugar levando a arte (arte lida ANTES de mover qualquer uma)
function vkPrAplicar(ps, slots, arte, comArte = true) {
    ps.forEach((p, i) => {
        const dx = slots[i][0] - p.x, dy = slots[i][1] - p.y;
        if (!dx && !dy) return;
        if (comArte) for (const id of arte.get(p.id) || []) { const o = vkObj(id); if (o) vkTransformar(o, [1, 0, 0, 1, dx, dy]); }
        p.x = slots[i][0]; p.y = slots[i][1];
    });
}
function vkPrReorganizar(comArte = true, arte = null) {
    const ps = VK.doc.pranchetas;
    arte = arte || new Map(ps.map(p => [p.id, vkPrArte(p)]));
    vkPrAplicar(ps, vkPrSlots(ps), arte, comArte);
}
const vkPrSobrepoe = (a, ps) => ps.some(q => q !== a && a.x < q.x + q.w && a.x + a.w > q.x && a.y < q.y + q.h && a.y + a.h > q.y);
(function () {
    const conv = a => v => (a.un === 'pt' ? +v : vkPT(+v));
    // documento novo já em grade
    const docVazio = vkDocVazio;
    vkDocVazio = function (o = {}) {
        const d = docVazio(o);
        d.layoutPr = { ...VK_LAYOUT_PADRAO, ...(o.layout_pr || {}) };
        const sl = vkPrSlots(d.pranchetas, d.layoutPr); d.pranchetas.forEach((p, i) => { p.x = sl[i][0]; p.y = sl[i][1]; });
        return d;
    };
    // prancheta nova: no próximo lugar da ordem (se cair em cima de outra, embaixo de tudo)
    const nova = VK_CMDS.nova_prancheta.fn;
    vkRegistrar('nova_prancheta', 'nova prancheta', a => {
        const r = nova(a), ps = VK.doc.pranchetas, p = ps[ps.length - 1];
        if (a.x == null && a.y == null && vkLayoutPr().modo !== 'livre') {
            const sl = vkPrSlots(ps); [p.x, p.y] = sl[sl.length - 1];
            if (vkPrSobrepoe(p, ps)) { p.x = ps[0].x; p.y = Math.max(...ps.filter(q => q !== p).map(q => q.y + q.h)) + (vkLayoutPr().espaco ?? 36); }
        }
        return r;
    });
    // Reorganizar todas as pranchetas (Objeto › Pranchetas): modo, colunas, espaco (mm), com_arte; guarda como ordem do documento
    vkRegistrar('organizar_pranchetas', 'reorganizar pranchetas', a => {
        const L = { ...vkLayoutPr() };
        if (a.modo) { if (!['grade', 'vertical', 'horizontal', 'livre'].includes(a.modo)) throw new Error('modo: grade | vertical | horizontal | livre'); L.modo = a.modo; }
        if (a.colunas) L.colunas = Math.max(1, Math.round(+a.colunas));
        if (a.espaco != null) L.espaco = conv(a)(a.espaco);
        VK.doc.layoutPr = L;
        if (L.modo !== 'livre') vkPrReorganizar(a.com_arte !== false);
        return { modo: L.modo, colunas: L.colunas, espaco_mm: vkR(vkMM(L.espaco)), pranchetas: VK.doc.pranchetas.map(p => p.nome) };
    });
    // duplicar com a arte; entra logo depois da original (ordem automática: a grade se refaz) ou em x/y dados
    vkRegistrar('duplicar_prancheta', 'duplicar prancheta', async a => {
        const ps = VK.doc.pranchetas, p = vkPrAchar(a.prancheta), arte = new Map(ps.map(q => [q.id, vkPrArte(q)]));
        const ids = arte.get(p.id).length ? (await VK_CMDS.duplicar.fn({ ids: arte.get(p.id) })).ids : [];
        let base = String(p.nome).replace(/ cópia( \d+)?$/, ''), nome = a.nome || `${base} cópia`, k = 2;
        while (!a.nome && ps.some(q => q.nome === nome)) nome = `${base} cópia ${k++}`;
        const q = { ...vkClone(p), id: vkId('p'), nome };
        ps.splice(ps.indexOf(p) + 1, 0, q); arte.set(q.id, ids);
        if (a.x != null || a.y != null) {
            const c = conv(a), nx = a.x != null ? c(a.x) : p.x, ny = a.y != null ? c(a.y) : p.y;
            vkPrAplicar([q], [[nx, ny]], arte);
        } else if (vkLayoutPr().modo !== 'livre') vkPrReorganizar(true, arte);
        else vkPrAplicar([q], [[Math.max(...ps.map(r => r.x + r.w)) + (vkLayoutPr().espaco ?? 36), p.y]], arte);
        VK.ativa = q.id; VK.sel = ids;
        return { id: q.id, nome: q.nome, objetos: ids.length };
    });
    // mudar a ordem: posicao (1 = primeira) ou direcao 'acima' | 'abaixo' (na lista)
    vkRegistrar('ordem_prancheta', 'ordem da prancheta', a => {
        const ps = VK.doc.pranchetas, p = vkPrAchar(a.prancheta), i = ps.indexOf(p);
        const arte = new Map(ps.map(q => [q.id, vkPrArte(q)]));
        const j = a.posicao != null ? Math.max(0, Math.min(ps.length - 1, +a.posicao - 1)) : a.direcao === 'acima' ? Math.max(0, i - 1) : Math.min(ps.length - 1, i + 1);
        if (j === i) return { ordem: ps.map(q => q.nome) };
        // a primeira define o canto da grade: quem assume o 1º lugar herda a posição dela
        const canto = [ps[0].x, ps[0].y];
        ps.splice(i, 1); ps.splice(j, 0, p);
        if (vkLayoutPr().modo !== 'livre') {
            const sl = vkPrSlots(ps.map((q, k) => (k === 0 ? { ...q, x: canto[0], y: canto[1] } : q)));
            vkPrAplicar(ps, sl, arte);
        }
        return { ordem: ps.map(q => q.nome) };
    });
    // caixa exata (alças da ferramenta, agentes): x, y, larg, alt (mm na página, ou pt com un:'pt')
    vkRegistrar('prancheta_caixa', 'tamanho da prancheta', a => {
        const p = vkPrAchar(a.prancheta), c = conv(a);
        if (a.x != null) p.x = c(a.x); if (a.y != null) p.y = c(a.y);
        if (a.larg != null) p.w = Math.max(vkPT(1), c(a.larg)); if (a.alt != null) p.h = Math.max(vkPT(1), c(a.alt));
        return { prancheta: p.nome, larg_mm: vkR(vkMM(p.w)), alt_mm: vkR(vkMM(p.h)) };
    });
    // mover_prancheta leva a arte pelo centro (antes: só o que estava inteiro dentro; arte com sangria ficava para trás)
    vkRegistrar('mover_prancheta', 'mover prancheta', a => {
        const p = vkPrAchar(a.prancheta), c = conv(a), dx = c(a.dx || 0), dy = c(a.dy || 0);
        vkPrAplicar([p], [[p.x + dx, p.y + dy]], new Map([[p.id, vkPrArte(p)]]), a.com_arte !== false);
        return { prancheta: p.nome };
    });
    const m = VK_MENUS.find(x => x[0] === 'Objeto');
    if (m) m[1].push('-', ['Pranchetas: Reorganizar todas…', '', () => vkPrDialogo()], ['Pranchetas: Duplicar a ativa', '', () => vkCmdUi('duplicar_prancheta', {}).then(() => vkEnquadrar())]);
})();
function vkPrDialogo() {
    const L = vkLayoutPr();
    vkModal(`<div class="ie-dlg-tit">Reorganizar todas as pranchetas</div><div class="ie-dlg-corpo">
        <div class="vk-linha"><span>Ordem</span><select id="pr-modo">${[['grade', 'Grade (por linha, descendo)'], ['vertical', 'Uma abaixo da outra'], ['horizontal', 'Lado a lado'], ['livre', 'Livre (não reorganiza)']].map(([k, n]) => `<option value="${k}" ${k === L.modo ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="vk-grade">${vkNum('Colunas', L.colunas || 4, 'id="pr-col" min="1"', '', 1)}${vkNum('Espaço', vkR(vkMM(L.espaco ?? 36), 1), 'id="pr-esp" min="0"', 'mm', 1)}</div>
        <label class="vk-chk"><input type="checkbox" id="pr-arte" checked> Mover a arte com a prancheta</label>
        <div class="vk-nota">Fica como a ordem do documento: prancheta nova, duplicada ou mudada de lugar na lista entra na grade.</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="pr-ok">OK</button></div>`, (m, fechar) => {
        m.querySelector('#pr-ok').onclick = () => {
            const g = id => m.querySelector(id);
            fechar();
            vkCmdUi('organizar_pranchetas', { modo: g('#pr-modo').value, colunas: +g('#pr-col').value, espaco: vkPT(+g('#pr-esp').value), com_arte: g('#pr-arte').checked })
                .then(() => vkEnquadrar(vkBoxUniao(VK.doc.pranchetas.map(p => ({ tipo: 'caminho', subs: vkRetSubs(p.x, p.y, p.w, p.h) })))));
        };
    });
}
// ── ferramenta Prancheta: alças, mover, Alt = duplicar, arrastar no vazio = nova ──
const VK_PR_ALCAS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
function vkPrAlcaEm(sx, sy) {
    const p = VK.doc.pranchetas.find(q => q.id === VK.ativa); if (!p) return null;
    const [x0, y0] = vkTela(p.x, p.y), [x1, y1] = vkTela(p.x + p.w, p.y + p.h), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const pos = { nw: [x0, y0], n: [mx, y0], ne: [x1, y0], e: [x1, my], se: [x1, y1], s: [mx, y1], sw: [x0, y1], w: [x0, my] };
    const k = VK_PR_ALCAS.find(k => Math.abs(pos[k][0] - sx) <= 6 && Math.abs(pos[k][1] - sy) <= 6);
    return k ? { k, p } : null;
}
function vkPrDown(A, x, y, sx, sy) {
    const al = vkPrAlcaEm(sx, sy);
    if (al) { Object.assign(A, { modo: 'pr_alca', alca: al.k, p: al.p, r0: [al.p.x, al.p.y, al.p.w, al.p.h] }); return true; }
    const p = VK.doc.pranchetas.slice().reverse().find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (p) { VK.ativa = p.id; Object.assign(A, { modo: 'pr_mover', p }); vkUiAgendar(); vkDesenhar(); return true; }
    A.modo = 'pr_nova'; return true;
}
function vkPrRetAlca(A, ex, ey, prop) {   // [x, y, w, h] durante o arraste de uma alça
    let [x, y, w, h] = A.r0; const k = A.alca, dx = ex - A.x, dy = ey - A.y, min = vkPT(1);
    if (k.includes('w')) { x += Math.min(dx, w - min); w -= Math.min(dx, w - min); }
    if (k.includes('e')) w = Math.max(min, w + dx);
    if (k.includes('n')) { y += Math.min(dy, h - min); h -= Math.min(dy, h - min); }
    if (k.includes('s')) h = Math.max(min, h + dy);
    if (prop && k.length === 2) { const r = A.r0[2] / A.r0[3]; if (w / h > r) w = h * r; else h = w / r; if (k.includes('w')) x = A.r0[0] + A.r0[2] - w; if (k.includes('n')) y = A.r0[1] + A.r0[3] - h; }
    return [x, y, w, h];
}
function vkPrRetArraste(A) {
    const ex = A.mx ?? A.x, ey = A.my ?? A.y;
    if (A.modo === 'pr_alca') return vkPrRetAlca(A, ex, ey, A.shift);
    if (A.modo === 'pr_mover') { let dx = ex - A.x, dy = ey - A.y; if (A.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } return [A.p.x + dx, A.p.y + dy, A.p.w, A.p.h]; }
    return [Math.min(A.x, ex), Math.min(A.y, ey), Math.abs(ex - A.x), Math.abs(ey - A.y)];
}
async function vkPrUp(A) {
    if (!A.moveu) return;
    const [x, y, w, h] = vkPrRetArraste(A), un = 'pt';
    if (A.modo === 'pr_alca') await vkCmdUi('prancheta_caixa', { prancheta: A.p.id, x, y, larg: w, alt: h, un });
    else if (A.modo === 'pr_mover') {
        if (A.alt) await vkCmdUi('duplicar_prancheta', { prancheta: A.p.id, x, y, un });
        else await vkCmdUi('mover_prancheta', { prancheta: A.p.id, dx: x - A.p.x, dy: y - A.p.y, un });
    } else if (w * VK.vista.z > 8 && h * VK.vista.z > 8) await vkCmdUi('nova_prancheta', { x: vkMM(x), y: vkMM(y), larg: vkMM(w), alt: vkMM(h) });   // nova_prancheta só fala mm
    vkDesenhar();
}
(function () {   // desenho: alças da prancheta ativa e o retângulo do arraste
    const orig = vkDesenharSobreposicao;
    vkDesenharSobreposicao = function (ctx) {
        orig(ctx);
        if (!VK.doc || VK.ferr !== 'prancheta') return;
        ctx.save(); ctx.strokeStyle = '#2f8cff'; ctx.lineWidth = 1;
        const p = VK.doc.pranchetas.find(q => q.id === VK.ativa);
        const A = typeof VKA !== 'undefined' && VKA && VKA.modo && VKA.modo.startsWith('pr_') && VKA.moveu ? VKA : null;
        if (A) {
            const [x, y, w, h] = vkPrRetArraste(A), [a0, b0] = vkTela(x, y), [a1, b1] = vkTela(x + w, y + h);
            ctx.setLineDash([5, 4]); ctx.strokeRect(a0 + 0.5, b0 + 0.5, a1 - a0, b1 - b0); ctx.setLineDash([]);
            ctx.fillStyle = '#2f8cff'; ctx.font = '11px system-ui';
            ctx.fillText(A.modo === 'pr_mover' && A.alt ? 'duplicar' : `${vkR(vkMM(w), 1)} × ${vkR(vkMM(h), 1)} mm`, a0, b1 + 14);
        } else if (p) {
            const [x0, y0] = vkTela(p.x, p.y), [x1, y1] = vkTela(p.x + p.w, p.y + p.h), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
            ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0); ctx.fillStyle = '#fff';
            for (const [hx, hy] of [[x0, y0], [mx, y0], [x1, y0], [x1, my], [x1, y1], [mx, y1], [x0, y1], [x0, my]]) { ctx.fillRect(hx - 3.5, hy - 3.5, 7, 7); ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7); }
        }
        ctx.restore();
    };
})();
