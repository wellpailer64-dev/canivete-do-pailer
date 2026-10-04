// Vetor Kanivete — TRANSFORMAR: repetir (Ctrl+D), Transformar cada (Alt+Shift+Ctrl+D), objeto-chave, distribuir espaçamento.
// A última transformação (mover, girar, refletir, redimensionar, matriz, duplicar com deslocamento, Alt+arrastar) fica
// guardada e o Ctrl+D repete na seleção atual — com cópia se a original foi cópia (passo e repetição, como no Illustrator).
(() => {
    const TRANSF = ['mover', 'matriz', 'girar', 'refletir', 'redimensionar', 'duplicar'];
    for (const n of TRANSF) {
        const c = VK_CMDS[n]; if (!c) continue;
        const fn = c.fn;
        c.fn = async a => {
            const r = await fn(a);
            if (VK._repetindo) return r;
            const args = { ...a }; delete args.ids; delete args.id; delete args.nomes;
            if (n === 'duplicar') {
                VK._dup = { ids: (r && r.ids) || [], t: Date.now() };
                VK.ultimaTransf = (a.dx || a.dy) ? { nome: 'mover', args: { dx: a.dx || 0, dy: a.dy || 0, ...(a.un ? { un: a.un } : {}), ...(a.prancheta != null ? { prancheta: a.prancheta } : {}) }, dup: true } : null;
            } else {
                const ids = a.ids || VK.sel, d = VK._dup;
                const dup = !!(d && Date.now() - d.t < 3000 && d.ids.length && d.ids.every(id => ids.includes(id)));
                VK.ultimaTransf = { nome: n, args, dup }; VK._dup = null;
            }
            return r;
        };
    }
    vkRegistrar('repetir', 'repetir transformação', async a => {
        const t = VK.ultimaTransf; if (!t) throw new Error('nenhuma transformação para repetir');
        const vezes = Math.max(1, Math.min(500, +a.vezes || 1)); let ids = a.ids || VK.sel;
        if (!ids.length) throw new Error('nada selecionado');
        VK._repetindo = true; const novos = [];
        try {
            for (let k = 0; k < vezes; k++) {
                if (t.dup) { ids = (await VK_CMDS.duplicar.fn({ ids })).ids; novos.push(...ids); }
                await VK_CMDS[t.nome].fn({ ...t.args, ids });
            }
        } finally { VK._repetindo = false; }
        VK.sel = ids; return { repetido: t.nome, copia: t.dup, vezes, ids, novos };   // ids = última leva; novos = todas as cópias
    });
    // cada objeto em torno do próprio centro (ou de um canto: ancora 'topo-esq'...): escala %, mover mm, girar °, refletir, aleatório
    vkRegistrar('transformar_cada', 'transformar cada', a => {
        const objs = vkcAlvos(a, () => true); if (!objs.length) throw new Error('nada selecionado');
        const al = a.aleatorio ? () => Math.random() : () => 1, out = [];
        const reid = x => { x.id = vkId(); if (x.itens) x.itens.forEach(reid); return x; };
        for (const o of objs) {
            if (a.copia) { const c = reid(vkClone(o)), l = vkListaDe(o.id); l.splice(l.indexOf(o) + 1, 0, c); out.push(c); }
            else out.push(o);
        }
        for (const o of out) {
            const b = vkBox(o), anc = a.ancora || 'centro';
            const ox = anc.includes('esq') ? b[0] : anc.includes('dir') ? b[2] : (b[0] + b[2]) / 2, oy = anc.includes('topo') ? b[1] : anc.includes('base') ? b[3] : (b[1] + b[3]) / 2;
            const f = al();
            const sx = 1 + ((a.sx ?? 100) / 100 - 1) * f, sy = 1 + ((a.sy ?? a.sx ?? 100) / 100 - 1) * f;
            const r = -(+(a.graus || 0)) * f * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
            const rx = a.refletir_x ? -1 : 1, ry = a.refletir_y ? -1 : 1;
            let M = [1, 0, 0, 1, -ox, -oy];
            M = vkMul(M, [sx * rx, 0, 0, sy * ry, 0, 0]); M = vkMul(M, [cs, sn, -sn, cs, 0, 0]);
            M = vkMul(M, [1, 0, 0, 1, ox + vkPT(+(a.dx || 0)) * f, oy + vkPT(+(a.dy || 0)) * f]);
            vkTransformar(o, M);
        }
        VK.sel = out.map(o => o.id); return { transformados: out.length };
    });
    // distribuir com espaço fixo (mm) entre as caixas, a partir do objeto-chave (ou do primeiro)
    vkRegistrar('distribuir_espaco', 'distribuir espaçamento', a => {
        const objs = vkcAlvos(a, () => true); if (objs.length < 2) throw new Error('selecione 2+ objetos');
        const h = a.eixo !== 'vertical', esp = vkPT(+(a.espaco ?? 0));
        const bx = objs.map(o => [o, vkBox(o)]).sort((p, q) => h ? p[1][0] - q[1][0] : p[1][1] - q[1][1]);
        const chave = a.chave ? (vkObj(a.chave) || (vkTodos().find(x => x.o.nome === a.chave) || {}).o) : (VK.chave && vkObj(VK.chave));
        const k = Math.max(0, bx.findIndex(([o]) => o === chave));
        const lado = (i, dir) => { const ref = bx[i][1]; return dir > 0 ? (h ? ref[2] : ref[3]) : (h ? ref[0] : ref[1]); };
        for (let i = k + 1; i < bx.length; i++) { const [o, b] = bx[i], d = lado(i - 1, 1) + esp - (h ? b[0] : b[1]); vkTransformar(o, h ? [1, 0, 0, 1, d, 0] : [1, 0, 0, 1, 0, d]); bx[i][1] = vkBox(o); }
        for (let i = k - 1; i >= 0; i--) { const [o, b] = bx[i], d = lado(i + 1, -1) - esp - (h ? b[2] : b[3]); vkTransformar(o, h ? [1, 0, 0, 1, d, 0] : [1, 0, 0, 1, 0, d]); bx[i][1] = vkBox(o); }
        return { distribuidos: objs.length, chave: bx[k][0].id };
    });
    // alinhar a um objeto-chave: relativo 'chave' (o chave não sai do lugar); chave = id/nome ou o marcado com clique (VK.chave)
    const alinhar = VK_CMDS.alinhar.fn;
    VK_CMDS.alinhar.fn = a => {
        const idc = a.relativo === 'chave' ? (a.chave ? (vkObj(a.chave) || (vkTodos().find(x => x.o.nome === a.chave) || {}).o || {}).id : VK.chave) : null;
        if (a.relativo === 'chave' && !idc) throw new Error('alinhar ao objeto-chave: clique de novo num dos selecionados (ou passe chave)');
        if (!idc) return alinhar(a);
        const ids = vkcAlvos(a, () => true).map(o => o.id).filter(id => id !== idc), b = vkBox(vkObj(idc));
        for (const id of ids) {
            const o = vkObj(id), c = vkBox(o), m = a.modo; let dx = 0, dy = 0;
            if (m === 'esquerda') dx = b[0] - c[0]; else if (m === 'direita') dx = b[2] - c[2]; else if (m === 'centro_h') dx = (b[0] + b[2]) / 2 - (c[0] + c[2]) / 2;
            else if (m === 'topo') dy = b[1] - c[1]; else if (m === 'base') dy = b[3] - c[3]; else if (m === 'centro_v') dy = (b[1] + b[3]) / 2 - (c[1] + c[3]) / 2;
            else throw new Error('modo: esquerda, centro_h, direita, topo, centro_v, base');
            vkTransformar(o, [1, 0, 0, 1, dx, dy]);
        }
        return { alinhados: ids.length, chave: idc };
    };
})();
function vkChaveAtiva() { return VK.chave && VK.sel.length > 1 && VK.sel.includes(VK.chave) ? VK.chave : null; }
function vkTransformarCadaDialogo() {
    if (!VK.sel.length) return vkToast('Selecione objetos');
    const v = VK.pref.tcada || { sx: 100, sy: 100, dx: 0, dy: 0, graus: 0 };
    vkModal(`<div class="ie-dlg-tit">Transformar cada</div><div class="ie-dlg-corpo">
        <div class="vk-grade">${vkNum('Escala H', v.sx, 'id="tc-sx"', '%', 1)}${vkNum('Escala V', v.sy, 'id="tc-sy"', '%', 1)}${vkNum('Mover H', v.dx, 'id="tc-dx"', 'mm', 0.5)}${vkNum('Mover V', v.dy, 'id="tc-dy"', 'mm', 0.5)}${vkNum('Girar', v.graus, 'id="tc-g"', '°', 1)}</div>
        <label class="vk-chk"><input type="checkbox" id="tc-rx"> Refletir X</label><label class="vk-chk"><input type="checkbox" id="tc-ry"> Refletir Y</label>
        <label class="vk-chk"><input type="checkbox" id="tc-al"> Aleatório</label><label class="vk-chk"><input type="checkbox" id="tc-cp"> Cópia</label>
        <div class="vk-nota">Cada objeto em torno do próprio centro.</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="tc-ok">OK</button></div>`, (m, fechar) => {
        m.querySelector('#tc-ok').onclick = () => {
            const g = id => +m.querySelector(id).value, c = id => m.querySelector(id).checked;
            VK.pref.tcada = { sx: g('#tc-sx'), sy: g('#tc-sy'), dx: g('#tc-dx'), dy: g('#tc-dy'), graus: g('#tc-g') }; fechar();
            vkCmdUi('transformar_cada', { ...VK.pref.tcada, refletir_x: c('#tc-rx'), refletir_y: c('#tc-ry'), aleatorio: c('#tc-al'), copia: c('#tc-cp') });
        };
    });
}
