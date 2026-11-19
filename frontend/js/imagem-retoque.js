// =========================================================
// Editor de Imagem — pincéis de retoque, como no Photoshop:
//   grupo Desfoque: Desfoque, Nitidez, Borrar (dedo: arrasta a tinta como um liquify à mão)
//   grupo Subexposição (O): Subexposição (clareia), Superexposição (escurece), Esponja (satura / dessatura)
// Cada carimbo do pincel mexe direto nos pixels da camada ativa, com borda suave (Dureza) e Força/Exposição.
// Alt + botão direito arrastando muda o tamanho. Um traço = um passo no histórico.
// =========================================================

Object.assign(IE.op, {
    desfoque: { tam: 60, dureza: 0, forca: 50 },
    nitidez: { tam: 60, dureza: 0, forca: 50 },
    borrar: { tam: 50, dureza: 0, forca: 50 },
    subexp: { tam: 80, dureza: 0, forca: 50, faixa: 'meios' },
    superexp: { tam: 80, dureza: 0, forca: 50, faixa: 'meios' },
    esponja: { tam: 80, dureza: 0, forca: 50, modo: 'dessaturar' },
});

let IE_RETOQUE = null;

// peso do carimbo no ponto (dx, dy) do centro: 1 no miolo, cai até 0 na borda (dureza 0-100)
function ieRetPeso(d, r, dureza) {
    if (d >= r) return 0;
    const h = Math.min(0.99, dureza / 100) * r;
    if (d <= h) return 1;
    const t = (d - h) / (r - h);
    return 1 - t * t * (3 - 2 * t);
}

function ieRetCarimbo(p) {
    const T = IE_RETOQUE, L = T.L, op = T.op, r = Math.max(1, op.tam / 2);
    const cx = p.x - L.x, cy = p.y - L.y;
    const x0 = Math.floor(cx - r), y0 = Math.floor(cy - r), n = Math.ceil(r * 2) + 1;
    const ax = Math.max(0, x0), ay = Math.max(0, y0), bx = Math.min(L.c.width, x0 + n), by = Math.min(L.c.height, y0 + n);
    if (bx <= ax || by <= ay) { T.ult = p; return; }
    const w = bx - ax, h = by - ay, ctx = ieCtx(L.c);
    const img = ctx.getImageData(ax, ay, w, h), d = img.data;
    const f = op.forca / 100, tipo = T.tipo;
    let viz = null;
    if (tipo === 'desfoque' || tipo === 'nitidez') {   // versão desfocada do mesmo trecho
        const m = Math.ceil(Math.max(2, r * 0.25)), c = ieCanvas(w + 2 * m, h + 2 * m), x = ieCtx(c);
        x.filter = `blur(${Math.max(1, r * 0.12)}px)`;
        x.drawImage(L.c, ax - m, ay - m, w + 2 * m, h + 2 * m, 0, 0, w + 2 * m, h + 2 * m);
        viz = x.getImageData(m, m, w, h).data;
    }
    let tinta = null;
    if (tipo === 'borrar') {
        if (!T.tinta) {   // primeira vez: pega a tinta embaixo do pincel
            T.tinta = { n, d: new Float32Array(n * n * 4) };
            const t = ctx.getImageData(x0, y0, n, n).data;
            for (let i = 0; i < t.length; i++) T.tinta.d[i] = t[i];
            T.ult = p; return;
        }
        tinta = T.tinta.d;
    }
    const k = T.faixaFn;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const gx = ax + xx, gy = ay + yy, pw = ieRetPeso(Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy), r, op.dureza);
        if (!pw) continue;
        const i = (yy * w + xx) * 4;
        let R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3];
        if (tipo === 'borrar') {
            const j = ((gy - y0) * n + (gx - x0)) * 4, a = pw * (0.35 + 0.6 * f);
            R += (tinta[j] - R) * a; G += (tinta[j + 1] - G) * a; B += (tinta[j + 2] - B) * a; A += (tinta[j + 3] - A) * a;
            // a tinta vai pegando um pouco da cor de onde passa
            tinta[j] = R; tinta[j + 1] = G; tinta[j + 2] = B; tinta[j + 3] = A;
        } else if (!A) continue;
        else if (tipo === 'desfoque') {
            const a = pw * f * 0.5;
            R += (viz[i] - R) * a; G += (viz[i + 1] - G) * a; B += (viz[i + 2] - B) * a;
        } else if (tipo === 'nitidez') {
            const a = pw * f * 0.35;
            R += (R - viz[i]) * a; G += (G - viz[i + 1]) * a; B += (B - viz[i + 2]) * a;
        } else {
            const l = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
            if (tipo === 'esponja') {
                const a = pw * f * 0.12 * (op.modo === 'saturar' ? 1 : -1), L0 = l * 255;
                R = L0 + (R - L0) * (1 + a); G = L0 + (G - L0) * (1 + a); B = L0 + (B - L0) * (1 + a);
            } else {
                const a = pw * f * 0.1 * k(l), g = tipo === 'subexp' ? 1 / (1 + a) : 1 + a;
                R = 255 * Math.pow(R / 255, g); G = 255 * Math.pow(G / 255, g); B = 255 * Math.pow(B / 255, g);
            }
        }
        d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = A;
    }
    ctx.putImageData(img, ax, ay);
    if (tipo === 'borrar') {   // a tinta acompanha o pincel: desloca o buffer junto
        const t = ctx.getImageData(x0, y0, n, n).data, td = T.tinta.d;
        for (let i = 0; i < td.length; i++) td[i] += (t[i] - td[i]) * (1 - f) * 0.5;
    }
    T.R = T.R ? ieRUniao(T.R, { x: L.x + ax, y: L.y + ay, w, h }) : { x: L.x + ax, y: L.y + ay, w, h };
    T.ult = p;
}

function ieRetAte(p) {
    const T = IE_RETOQUE; if (!T) return;
    const passo = Math.max(1, T.op.tam * (T.tipo === 'borrar' ? 0.08 : 0.2));
    const u = T.ult, dist = Math.hypot(p.x - u.x, p.y - u.y);
    if (dist < passo) return;
    const nPassos = Math.floor(dist / passo);
    for (let s = 1; s <= nPassos; s++) ieRetCarimbo({ x: u.x + (p.x - u.x) * s / nPassos, y: u.y + (p.y - u.y) * s / nPassos });
    ieCamadaMudou(T.L, T.R);
}

const IE_RET_FAIXA = { sombras: l => (1 - l) * (1 - l) * 1.6, meios: l => 1 - Math.abs(2 * l - 1) * 0.8, realces: l => l * l * 1.6 };

function ieRetFerr(tipo, nome, tecla, icone) {
    const f = {
        nome, tecla, icone, cursorPincel: true,
        cursor: () => (IE.op[tipo].tam * (IE.doc?.zoom || 1) >= 6 ? 'none' : 'crosshair'),
        down(p, ev, doc) {
            const L = ieAtiva(doc);
            if (!L || !L.c || !ieChecarPintavel(L, 'pintar')) return;
            ieGravavel(L);
            const op = IE.op[tipo];
            IE_RETOQUE = { L, tipo, op, ult: { x: p.x, y: p.y }, R: null, tinta: null, faixaFn: IE_RET_FAIXA[op.faixa] || IE_RET_FAIXA.meios };
            ieRetCarimbo(p);
            if (IE_RETOQUE.R) ieCamadaMudou(L, IE_RETOQUE.R);
        },
        move(p) { if (IE_RETOQUE) ieRetAte(p); },
        up() {
            const T = IE_RETOQUE; IE_RETOQUE = null;
            if (!T || !T.R) return;
            T.L.sujoPx = true;
            ieCamadaMudou(T.L, T.R);
            ieHist(ieT(nome));
        },
        sobre(ctx, doc) { ieCursorPincel(ctx, doc, IE.op[tipo].tam); },
    };
    f.rightDown = (p, ev) => { IE._pincelAjuste = ev.altKey ? { x0: ev.clientX, tam0: IE.op[tipo].tam, p0: IE.mouse || p } : null; };
    f.rightMove = (p, ev) => {
        const a = IE._pincelAjuste; if (!a) return;
        IE.mouse = a.p0;
        IE.op[tipo].tam = Math.round(ieClamp(a.tam0 + (ev.clientX - a.x0) / (IE.doc?.zoom || 1), 1, 1000));
        ieOpcoesRender?.(); ieDesenharSobre();
    };
    f.rightUp = () => { IE._pincelAjuste = null; };
    return f;
}

if (typeof IE_ICONES !== 'undefined') Object.assign(IE_ICONES, {
    retDesfoque: '<path d="M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z"/>',
    retNitidez: '<path d="M12 3 18 20H6z"/>',
    retBorrar: '<path d="M9 21v-7.5L6.5 11a1.8 1.8 0 0 1 2.6-2.5L11 10.5V4.5a1.5 1.5 0 0 1 3 0V12l3.6.8a2 2 0 0 1 1.5 2.3L18 21"/>',
    retSubexp: '<circle cx="9" cy="9" r="5"/><path d="m12.5 12.5 7 7"/>',
    retSuperexp: '<path d="M5 19c0-5 4-9 9-9h1a4 4 0 0 0 0-6"/><path d="M5 19h6c0-3-2.5-5.5-6-5.5z"/>',
    retEsponja: '<rect x="5" y="7" width="14" height="11" rx="3"/><circle cx="9.5" cy="11" r="1"/><circle cx="14" cy="13.5" r="1"/><circle cx="10" cy="15" r=".7"/>',
});

Object.assign(IE_FERR, {
    desfoque: ieRetFerr('desfoque', 'Desfoque', '', 'retDesfoque'),
    nitidez: ieRetFerr('nitidez', 'Nitidez', '', 'retNitidez'),
    borrar: ieRetFerr('borrar', 'Borrar', '', 'retBorrar'),
    subexp: ieRetFerr('subexp', 'Subexposição (clarear)', 'O', 'retSubexp'),
    superexp: ieRetFerr('superexp', 'Superexposição (escurecer)', 'O', 'retSuperexp'),
    esponja: ieRetFerr('esponja', 'Esponja (saturar/dessaturar)', 'O', 'retEsponja'),
});
{
    const i = IE_FERR_ORDEM.indexOf('degrade');
    IE_FERR_ORDEM.splice(i < 0 ? IE_FERR_ORDEM.length : i + 1, 0, 'desfoque', 'nitidez', 'borrar', 'subexp', 'superexp', 'esponja');
    if (typeof IE_FERR_GRUPOS !== 'undefined') {
        const g = IE_FERR_GRUPOS.findIndex(x => Array.isArray(x) && x[0] === 'degrade');
        IE_FERR_GRUPOS.splice(g < 0 ? IE_FERR_GRUPOS.length : g + 1, 0, ['desfoque', 'nitidez', 'borrar'], ['subexp', 'superexp', 'esponja']);
    }
}
(window.IE_OPCOES_EXTRA = window.IE_OPCOES_EXTRA || []).push(f => {
    if (!['desfoque', 'nitidez', 'borrar', 'subexp', 'superexp', 'esponja'].includes(f)) return '';
    let h = ieNum('Tamanho', 'tam', f, 1, 1000, 1, ' px') + ieNum('Dureza', 'dureza', f, 0, 100, 1, '%');
    if (f === 'subexp' || f === 'superexp') h += ieSegm('faixa', f, [['sombras', 'Sombras'], ['meios', 'Meios-tons'], ['realces', 'Realces']]) + ieNum('Exposição', 'forca', f, 1, 100, 1, '%');
    else if (f === 'esponja') h += ieSegm('modo', f, [['dessaturar', 'Dessaturar'], ['saturar', 'Saturar']]) + ieNum('Fluxo', 'forca', f, 1, 100, 1, '%');
    else h += ieNum('Força', 'forca', f, 1, 100, 1, '%');
    return h;
});
