// Vetor Kanivete — RÉGUAS, GUIAS e GRADE (Illustrator: Ctrl+R réguas, Ctrl+; guias, Alt+Ctrl+; travar guias,
// Ctrl+' grade, Shift+Ctrl+' encaixar na grade). Réguas em mm com a origem no canto da prancheta ativa; arrastar da régua
// cria guia; arrastar uma guia move (soltar em cima da régua apaga). Guias: doc.guias = [{eixo:'x'|'y', pos (pt)}].
const VK_REGUA = 18;   // px
function vkReguaOrigem() { const p = VK.doc && (VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0]); return p ? [p.x, p.y] : [0, 0]; }
function vkReguasDesenhar(ctx) {   // em px de tela (ctx já com o dpr)
    if (!VK.doc || VK.reguas === false) return;
    const cv = vkCanvas(), W = cv.clientWidth, H = cv.clientHeight, R = VK_REGUA, z = VK.vista.z, [ox, oy] = vkReguaOrigem();
    const est = getComputedStyle(cv), fundo = '#262626', linha = 'rgba(255,255,255,.35)', texto = 'rgba(255,255,255,.7)';
    ctx.save();
    ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, R); ctx.fillRect(0, 0, R, H);
    // passo: o menor de 1/2/5 × 10^n mm que fica com ≥ 50 px
    const pxmm = z * 72 / 25.4; let passo = 1;
    for (const b of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) { passo = b; if (b * pxmm >= 50) break; }
    const sub = passo / ((String(passo)[0] === '5') ? 5 : 10);
    ctx.font = '9px system-ui'; ctx.fillStyle = texto; ctx.strokeStyle = linha; ctx.lineWidth = 1; ctx.beginPath();
    const mm0x = (-VK.vista.x / z - ox) * 25.4 / 72, mm1x = ((W - VK.vista.x) / z - ox) * 25.4 / 72;
    for (let m = Math.floor(mm0x / sub) * sub; m <= mm1x; m += sub) {
        const sx = Math.round((ox + vkPT(m)) * z + VK.vista.x) + 0.5, grande = Math.abs(m / passo - Math.round(m / passo)) < 1e-6;
        if (sx < R) continue;
        ctx.moveTo(sx, R); ctx.lineTo(sx, R - (grande ? R * 0.75 : R * 0.3));
        if (grande) ctx.fillText(vkR(m, 1), sx + 2, 9);
    }
    const mm0y = (-VK.vista.y / z - oy) * 25.4 / 72, mm1y = ((H - VK.vista.y) / z - oy) * 25.4 / 72;
    for (let m = Math.floor(mm0y / sub) * sub; m <= mm1y; m += sub) {
        const sy = Math.round((oy + vkPT(m)) * z + VK.vista.y) + 0.5, grande = Math.abs(m / passo - Math.round(m / passo)) < 1e-6;
        if (sy < R) continue;
        ctx.moveTo(R, sy); ctx.lineTo(R - (grande ? R * 0.75 : R * 0.3), sy);
        if (grande) { ctx.save(); ctx.translate(9, sy + 2); ctx.rotate(-Math.PI / 2); ctx.fillText(vkR(m, 1), 0, 0); ctx.restore(); }
    }
    ctx.stroke();
    if (VK.mouse) {   // posição do mouse nas réguas
        const [sx, sy] = vkTela(...VK.mouse); ctx.strokeStyle = '#2f8cff'; ctx.beginPath();
        if (sx > R) { ctx.moveTo(sx + 0.5, 0); ctx.lineTo(sx + 0.5, R); } if (sy > R) { ctx.moveTo(0, sy + 0.5); ctx.lineTo(R, sy + 0.5); } ctx.stroke();
    }
    ctx.fillStyle = '#1d1d1d'; ctx.fillRect(0, 0, R, R);
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(0, R + 0.5); ctx.lineTo(W, R + 0.5); ctx.moveTo(R + 0.5, 0); ctx.lineTo(R + 0.5, H); ctx.stroke();
    ctx.restore();
}
function vkGradeDesenhar(ctx) {   // em pt do documento, por baixo da arte, só dentro das pranchetas
    const g = VK.grade; if (!g || !g.ativo || !VK.doc) return;
    const passo = vkPT(g.passo || 10), sub = passo / (g.sub || 4), z = VK.vista.z;
    ctx.save(); ctx.lineWidth = 1 / z;
    for (const p of VK.doc.pranchetas) {
        ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
        for (const [s, cor] of [[sub, 'rgba(0,120,255,.10)'], [passo, 'rgba(0,120,255,.28)']]) {
            if (s * z < 4) continue;
            ctx.strokeStyle = cor; ctx.beginPath();
            for (let x = p.x; x <= p.x + p.w + 1e-6; x += s) { ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); }
            for (let y = p.y; y <= p.y + p.h + 1e-6; y += s) { ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); }
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}
function vkGuiaEm(sx, sy) {   // índice da guia sob o mouse (tela)
    if (!VK.doc || VK.guiasOcultas || VK.guiasTravadas) return -1;
    return (VK.doc.guias || []).findIndex(g => g.eixo === 'x' ? Math.abs(g.pos * VK.vista.z + VK.vista.x - sx) < 4 : Math.abs(g.pos * VK.vista.z + VK.vista.y - sy) < 4);
}
// pointerdown: régua (cria guia) ou guia existente (move). → true se tratou
function vkReguaDown(e, sx, sy, x, y) {
    if (!VK.doc || e.button !== 0) return false;
    const R = VK_REGUA;
    if (VK.reguas !== false && (sx < R || sy < R) && !(sx < R && sy < R)) {
        VKA = { f: 'guia', modo: 'guia', eixo: sy < R ? 'y' : 'x', nova: true, sx, sy, x, y }; return true;
    }
    if (VK.ferr === 'selecao' || VK.ferr === 'direta') {
        const i = vkGuiaEm(sx, sy);
        if (i >= 0) { VKA = { f: 'guia', modo: 'guia', eixo: VK.doc.guias[i].eixo, i, sx, sy, x, y }; return true; }
    }
    return false;
}
function vkReguaMove(A, sx, sy, x, y) { A.pos = A.eixo === 'x' ? x : y; A.fora = A.eixo === 'x' ? sx < VK_REGUA : sy < VK_REGUA; vkDesenhar(); }
async function vkReguaUp(A) {
    if (A.pos == null) return;
    const [ox, oy] = vkReguaOrigem(), mm = vkMM(A.pos - (A.eixo === 'x' ? ox : oy));
    if (A.nova) { if (!A.fora) await vkCmdUi('guia', { eixo: A.eixo, pos: mm }); }
    else if (A.fora) await vkCmdUi('guia', { acao: 'apagar', indice: A.i });
    else await vkCmdUi('guia', { acao: 'mover', indice: A.i, pos: mm });
}
function vkReguaSobreposicao(ctx, A) {   // guia sendo arrastada
    if (!A || A.modo !== 'guia' || A.pos == null) return;
    const cv = vkCanvas(); ctx.save(); ctx.strokeStyle = A.fora ? 'rgba(255,60,60,.8)' : 'rgba(0,200,255,.9)'; ctx.setLineDash([4, 3]); ctx.beginPath();
    if (A.eixo === 'x') { const [s] = vkTela(A.pos, 0); ctx.moveTo(s + 0.5, 0); ctx.lineTo(s + 0.5, cv.clientHeight); } else { const [, s] = vkTela(0, A.pos); ctx.moveTo(0, s + 0.5); ctx.lineTo(cv.clientWidth, s + 0.5); }
    ctx.stroke(); ctx.restore();
}
// encaixe: guias e (se ligado) grade entram como alvos
function vkEncaixeExtra(xs, ys, b) {
    if (!VK.guiasOcultas) for (const g of VK.doc.guias || []) (g.eixo === 'x' ? xs : ys).push(g.pos);
    const G = VK.grade;
    if (G && G.encaixar) {
        const p = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0], s = vkPT((G.passo || 10) / (G.sub || 4));
        for (const v of [b[0], b[2]]) xs.push(p.x + Math.round((v - p.x) / s) * s);
        for (const v of [b[1], b[3]]) ys.push(p.y + Math.round((v - p.y) / s) * s);
    }
}
(() => {
    // guia: eixo 'x' (vertical, pos = x) | 'y' (horizontal, pos = y), pos em mm da prancheta; acao: nova (padrão) | mover | apagar | limpar
    vkRegistrar('guia', 'guia', a => {
        const d = VK.doc; d.guias = d.guias || [];
        if (a.acao === 'limpar') { const n = d.guias.length; d.guias = []; return { apagadas: n }; }
        if (a.acao === 'apagar') { d.guias.splice(+a.indice, 1); return { guias: d.guias.length }; }
        const P = d.pranchetas, p = (a.prancheta != null && (P.find(q => q.id === a.prancheta || q.nome === a.prancheta) || P[+a.prancheta - 1])) || P.find(q => q.id === VK.ativa) || P[0];
        const eixo = a.eixo === 'y' || a.eixo === 'horizontal' ? 'y' : 'x';
        const pos = a.un === 'pt' ? +a.pos : (eixo === 'x' ? p.x : p.y) + vkPT(+a.pos);
        if (a.acao === 'mover') { d.guias[+a.indice].pos = pos; return { indice: +a.indice }; }
        d.guias.push({ eixo, pos }); return { indice: d.guias.length - 1, guias: d.guias.length };
    });
    // exibir: reguas, guias (mostrar), travar_guias, grade, encaixar_grade, passo_grade (mm), sub_grade
    vkRegistrar('exibir', 'exibir', a => {
        if (a.reguas != null) VK.reguas = !!a.reguas;
        if (a.guias != null) VK.guiasOcultas = !a.guias;
        if (a.travar_guias != null) VK.guiasTravadas = !!a.travar_guias;
        VK.grade = VK.grade || { ativo: false, passo: 10, sub: 4, encaixar: false };
        if (a.grade != null) VK.grade.ativo = !!a.grade;
        if (a.encaixar_grade != null) VK.grade.encaixar = !!a.encaixar_grade;
        if (a.passo_grade != null) VK.grade.passo = +a.passo_grade;
        if (a.sub_grade != null) VK.grade.sub = +a.sub_grade;
        vkDesenhar(); vkUiAgendar();
        return { reguas: VK.reguas !== false, guias: !VK.guiasOcultas, travar_guias: !!VK.guiasTravadas, ...VK.grade };
    }, true);
})();
