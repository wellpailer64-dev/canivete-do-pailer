// =========================================================
// Pocket Editor — Ondulação (Wave Warp do After Effects / dos presets do Mister Horse): a camada ondula como bandeira,
// texto líquido, água. Efeito de pixel com o tempo (anda sozinho), no painel Animação e em Efeitos › Distorcer.
// Prévia: a camada girada para a onda correr na horizontal, fatiada em faixas de 2–3 px deslocadas na vertical
// (drawImage da placa, sem ler pixel) e girada de volta. Exportação: video_cutter._filtro_onda (a MESMA conta, geq);
// roda DEPOIS dos outros efeitos da camada (veFxRender põe a onda no fim) e a camada cresce a altura de cada lado.
// d = altura × tanh(k·sen(fase))/tanh(k), fase = 2π(s/λ − velocidade·u) + fase0; s = posição ao longo da direção
// (0 no começo da camada), λ = extensão / quantidade; k vem do Formato (0 = seno, 100 = quase quadrada).
// =========================================================
function veOndaAplicar(src, w, h, q, mw, mh, u, v, T) {
    const a0 = (v.dir || 0) * Math.PI / 180, ca = Math.cos(a0), sa = Math.sin(a0);
    const L = Math.max(1, Math.abs(mw * ca) + Math.abs(mh * sa)), lam = L / Math.max(0.05, v.qtd);
    const k = 0.01 + (v.forma || 0) / 100 * 6, tk = Math.tanh(k), fase = (v.fase || 0) * Math.PI / 180;
    const D = s0 => {
        let d = v.alt * Math.tanh(k * Math.sin(2 * Math.PI * (s0 / lam - v.vel * u) + fase)) / tk;
        if (v.prender) d *= Math.min(1, Math.max(0, s0 / L));
        return d;
    };
    const reto = Math.abs(sa) < 1e-6 && ca > 0;   // direção 0°: sem girar
    let R = src, RW = w, RH = h;
    if (!reto) {
        RW = RH = Math.ceil(Math.hypot(w, h));
        const r = T.R(RW, RH);
        r.ctx.setTransform(1, 0, 0, 1, 0, 0); r.ctx.clearRect(0, 0, RW, RH);
        r.ctx.translate(RW / 2, RH / 2); r.ctx.rotate(-a0); r.ctx.drawImage(src, -w / 2, -h / 2);
        r.ctx.setTransform(1, 0, 0, 1, 0, 0);
        R = r.cv;
    }
    const O = T.O(RW, RH), ox = O.ctx, sw = RW > 1400 ? 3 : 2;
    ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, RW, RH);
    for (let x = 0; x < RW; x += sw) {
        const s0 = (x + sw / 2 - RW / 2) / q + L / 2;
        ox.drawImage(R, x, 0, sw, RH, x, D(s0) * q, sw, RH);
    }
    if (reto) return O;
    const B = T.B(w, h);
    B.ctx.setTransform(1, 0, 0, 1, 0, 0); B.ctx.clearRect(0, 0, w, h);
    B.ctx.translate(w / 2, h / 2); B.ctx.rotate(a0); B.ctx.drawImage(O.cv, -RW / 2, -RH / 2);
    B.ctx.setTransform(1, 0, 0, 1, 0, 0);
    return B;
}
Object.assign(VE_FX, {
    onda: {
        nome: 'Ondulação', cat: 'Distorcer', tag: 'Wave Warp', anima: true,
        margem: (v, env) => (env.c && veIsAdj(env.c) ? 0 : (v.alt || 0) + 2),   // a onda sai da camada (export: _onda_margem)
        params: [
            { k: 'alt', nome: 'Altura da onda', min: 0, max: 500, step: 0.5, def: 20, un: 'px' },
            { k: 'qtd', nome: 'Quantidade de ondas', min: 0.1, max: 50, step: 0.1, def: 3, un: '' },
            { k: 'vel', nome: 'Velocidade (ondas por segundo)', min: -10, max: 10, step: 0.05, def: 1, un: 'x' },
            { k: 'dir', nome: 'Direção', min: -180, max: 180, step: 1, def: 0, un: '°' },
            { k: 'forma', nome: 'Formato (suave → quadrada)', min: 0, max: 100, step: 1, def: 0, un: '%' },
            { k: 'fase', nome: 'Fase', min: -360, max: 360, step: 1, def: 0, un: '°' },
            { k: 'prender', nome: 'Prender o começo (bandeira no mastro)', tipo: 'bool', def: 0 },
        ],
        neutro: v => !(v.alt > 0),
        draw(a, v, env) {
            // tempo na grade de quadros (a exportação calcula no início de cada quadro; o monitor pode estar no meio dele)
            const fps = VE.fps || 30, u = Math.floor(((env.T || 0) - (env.c ? env.c.st || 0 : 0)) * fps + 1e-6) / fps;
            const w = a.cv.width, h = a.cv.height;
            return veOndaAplicar(a.cv, w, h, env.q, env.mw, env.mh, u, v, {
                R: (W, H) => veFxCanvas(7, W, H), O: (W, H) => (Math.abs(Math.sin((v.dir || 0) * Math.PI / 180)) < 1e-6 && Math.cos((v.dir || 0) * Math.PI / 180) > 0 ? veFxOther(a, W, H) : veFxCanvas(8, W, H)),
                B: (W, H) => veFxOther(a, W, H),
            });
        },
    },
});
// cartão animado do painel Animação (canvases próprios: não mexe nos do monitor)
const VEONDA_CARTAO = {};
function veOndaCartao(img, W, H, u) {
    const pega = (n, w, h) => { let o = VEONDA_CARTAO[n]; if (!o) { const cv = document.createElement('canvas'); o = VEONDA_CARTAO[n] = { cv, ctx: cv.getContext('2d') }; } if (o.cv.width !== w || o.cv.height !== h) { o.cv.width = w; o.cv.height = h; } return o; };
    const v = {}; VE_FX.onda.params.forEach(p => { v[p.k] = p.def; });
    const k = W / 540, m = Math.ceil(v.alt * k) + 2, S = pega('s', W, H);
    S.ctx.clearRect(0, 0, W, H); S.ctx.drawImage(img, m, m, W - 2 * m, H - 2 * m);
    return veOndaAplicar(S.cv, W, H, k, W / k, H / k, u, v, { R: (w, h) => pega('r', w, h), O: (w, h) => pega('o', w, h), B: (w, h) => pega('b', w, h) }).cv;
}
