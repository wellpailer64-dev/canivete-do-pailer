// =========================================================
// Slider Kanivete — GRÁFICOS editáveis (camada tipo 'grafico'): colunas, barras, empilhadas, linha, área, pizza, rosca,
// anel de progresso, trilhas de progresso, waffle e funil. Desenhados em SVG (o mesmo na mesa, miniatura, apresentação e
// exportação); no PPTX editável viram gráficos nativos do PowerPoint (Functions/slider_kanivete.py › _grafico_pptx).
// Dados: {rotulos: [..], series: [{nome, valores: [..], cor?}]} ou CSV ("Rótulo;Série 1;Série 2" + uma linha por rótulo).
// Modelos (SD_GRAF_MODELOS) seguem estilos conhecidos: Datawrapper (limpo, valor na ponta), Canva (arredondado),
// Flourish (linha suave com área), think-cell (empilhadas com total), KPI de painel (anel e trilhas), waffle e funil.
// =========================================================
const SD_GRAF_TIPOS = [['colunas', 'Colunas'], ['barras', 'Barras horizontais'], ['empilhadas', 'Colunas empilhadas'], ['linha', 'Linha'], ['area', 'Área'],
    ['pizza', 'Pizza'], ['rosca', 'Rosca'], ['progresso', 'Anel de progresso'], ['trilhas', 'Trilhas de progresso'], ['waffle', 'Waffle (100 quadradinhos)'], ['funil', 'Funil']];
const SD_GRAF_MODELOS = [
    { id: 'colunas', nome: 'Colunas limpas', desc: 'Datawrapper: sem grade, valor em cima', g: { grafico: 'colunas', valores: true, grade: false, raio: 0 },
      d: { rotulos: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], series: [{ nome: 'Vendas', valores: [42, 55, 48, 70, 82, 95] }] } },
    { id: 'colunas_red', nome: 'Colunas arredondadas', desc: 'Canva: cantos redondos e grade suave', g: { grafico: 'colunas', valores: true, grade: true, raio: 18 },
      d: { rotulos: ['2022', '2023', '2024', '2025'], series: [{ nome: 'Clientes', valores: [120, 180, 260, 340] }] } },
    { id: 'agrupadas', nome: 'Comparação', desc: 'Duas séries lado a lado com legenda', g: { grafico: 'colunas', valores: false, grade: true, legenda: true, raio: 8 },
      d: { rotulos: ['T1', 'T2', 'T3', 'T4'], series: [{ nome: '2024', valores: [30, 42, 38, 51] }, { nome: '2025', valores: [41, 55, 60, 72] }] } },
    { id: 'ranking', nome: 'Ranking', desc: 'Barras horizontais com valor na ponta', g: { grafico: 'barras', valores: true, grade: false, raio: 10, sufixo: '%' },
      d: { rotulos: ['Instagram', 'WhatsApp', 'Indicação', 'Google', 'Outros'], series: [{ nome: 'Origem', valores: [38, 27, 18, 11, 6] }] } },
    { id: 'empilhadas', nome: 'Empilhadas', desc: 'think-cell: partes de um total', g: { grafico: 'empilhadas', valores: true, grade: false, legenda: true, raio: 0 },
      d: { rotulos: ['Loja A', 'Loja B', 'Loja C'], series: [{ nome: 'Produto', valores: [40, 30, 52] }, { nome: 'Serviço', valores: [25, 35, 20] }, { nome: 'Assinatura', valores: [15, 22, 30] }] } },
    { id: 'linha', nome: 'Tendência', desc: 'Linha suave com pontos', g: { grafico: 'linha', valores: false, grade: true, pontos: true, suave: true, espessura: 6 },
      d: { rotulos: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], series: [{ nome: 'Acessos', valores: [12, 19, 15, 26, 31, 28, 40] }] } },
    { id: 'area', nome: 'Área degradê', desc: 'Flourish: curva com preenchimento', g: { grafico: 'area', valores: false, grade: true, pontos: false, suave: true, espessura: 5 },
      d: { rotulos: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'], series: [{ nome: 'Receita', valores: [20, 26, 24, 33, 41, 39, 52, 61] }] } },
    { id: 'pizza', nome: 'Pizza', desc: 'Fatias com porcentagem', g: { grafico: 'pizza', valores: true, legenda: true, sufixo: '%' },
      d: { rotulos: ['Digital', 'Eventos', 'Mídia', 'Outros'], series: [{ nome: 'Verba', valores: [45, 25, 20, 10] }] } },
    { id: 'rosca', nome: 'Rosca com destaque', desc: 'O 1º valor grande no centro', g: { grafico: 'rosca', valores: false, legenda: true, buraco: 0.62, sufixo: '%' },
      d: { rotulos: ['Satisfeitos', 'Neutros', 'Insatisfeitos'], series: [{ nome: 'Pesquisa', valores: [72, 20, 8] }] } },
    { id: 'kpi', nome: 'Anel de meta', desc: 'Painel: quanto da meta já foi', g: { grafico: 'progresso', max: 100, sufixo: '%', espessura: 0.16 },
      d: { rotulos: ['Meta do ano'], series: [{ nome: 'Atingido', valores: [78] }] } },
    { id: 'kpis', nome: 'Três metas', desc: 'Anéis lado a lado', g: { grafico: 'progresso', max: 100, sufixo: '%', espessura: 0.14 },
      d: { rotulos: ['Alcance', 'Vendas', 'Retenção'], series: [{ nome: '%', valores: [86, 64, 91] }] } },
    { id: 'trilhas', nome: 'Trilhas de progresso', desc: 'Barras finas com a porcentagem', g: { grafico: 'trilhas', max: 100, sufixo: '%', raio: 999 },
      d: { rotulos: ['Planejamento', 'Produção', 'Revisão', 'Entrega'], series: [{ nome: '%', valores: [100, 75, 40, 10] }] } },
    { id: 'waffle', nome: 'Waffle', desc: '“7 em cada 10”, em quadradinhos', g: { grafico: 'waffle', max: 100, sufixo: '%', valores: true },
      d: { rotulos: ['Usam o app'], series: [{ nome: '%', valores: [68] }] } },
    { id: 'funil', nome: 'Funil de vendas', desc: 'Etapas que afunilam', g: { grafico: 'funil', valores: true },
      d: { rotulos: ['Visitas', 'Leads', 'Propostas', 'Vendas'], series: [{ nome: 'Pessoas', valores: [1000, 420, 160, 58] }] } },
];

// ───────────── cores e números ─────────────
function sdMistura(a, b, t) {
    const pa = sdHexRgb(a), pb = sdHexRgb(b); if (!pa || !pb) return a;
    return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function sdHexRgb(h) { const s = sdCorHex(h || ''); const m = /^#([0-9a-f]{6})/i.exec(s); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; }
function sdGrafCores(c) {
    if (c.cores && c.cores.length) return c.cores;
    // tema: destaque, apoio e vizinhas do destaque no círculo de cores (distintas entre si, mas da mesma família)
    const C = ((SD.doc && SD.doc.tema) || SD_TEMA).cores;
    return [C.destaque, C.apoio, sdGirarMatiz(C.destaque, 150), sdGirarMatiz(C.destaque, -55), sdGirarMatiz(C.destaque, 60), sdMistura(C.apoio, C.fundo, 0.5)];
}
function sdGirarMatiz(h, graus) {
    const p = sdHexRgb(h); if (!p) return h;
    const [r, g, b] = p.map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let hu = 0, s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); hu = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hu *= 60; }
    hu = (hu + graus + 360) % 360; s = Math.max(s, 0.45);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hu / 60) % 2 - 1)), m = l - c / 2;
    const [r1, g1, b1] = hu < 60 ? [c, x, 0] : hu < 120 ? [x, c, 0] : hu < 180 ? [0, c, x] : hu < 240 ? [0, x, c] : hu < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + [r1, g1, b1].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
const sdGrafCor = (c, k) => { const cs = sdGrafCores(c); return cs[k % cs.length]; };
function sdGrafFmt(c, v) {
    if (v == null || isNaN(v)) return '';
    const n = (+v).toLocaleString('pt-BR', { maximumFractionDigits: c.casas ?? (Math.abs(v) < 10 && v % 1 ? 1 : 0) });
    return `${c.prefixo || ''}${n}${c.sufixo || ''}`;
}
function sdGrafTeto(v) {   // teto "redondo" do eixo: 1, 2, 2,5, 5 × 10^k
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const sdX = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// ───────────── dados: CSV ↔ séries ─────────────
function sdGrafCsv(c) {
    const S = c.series || [], R = c.rotulos || [];
    return [['', ...S.map(s => s.nome || '')].join(';'), ...R.map((r, i) => [r, ...S.map(s => (s.valores || [])[i] ?? '')].join(';'))].join('\n');
}
function sdGrafDeCsv(txt) {
    const linhas = String(txt || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (!linhas.length) return { rotulos: [], series: [] };
    const sep = linhas[0].includes(';') ? ';' : linhas[0].includes('\t') ? '\t' : ',';
    const cel = l => l.split(sep).map(x => x.trim());
    const cab = cel(linhas[0]), temCab = cab.slice(1).some(x => x && isNaN(sdNumBr(x)));
    const corpo = (temCab ? linhas.slice(1) : linhas).map(cel);
    const nS = Math.max(1, ...corpo.map(l => l.length - 1));
    const series = Array.from({ length: nS }, (_, k) => ({ nome: (temCab ? cab[k + 1] : '') || `Série ${k + 1}`, valores: corpo.map(l => sdNumBr(l[k + 1])) }));
    return { rotulos: corpo.map(l => l[0]), series };
}
function sdNumBr(s) {   // "1.234,5" / "1234.5" / "45%" → número
    if (s == null || s === '') return 0;
    let t = String(s).replace(/[^\d,.\-]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const v = parseFloat(t); return isNaN(v) ? NaN : v;
}

// ───────────── desenho (SVG) ─────────────
function sdGraficoSvg(c) {
    const W = Math.max(40, +c.w), H = Math.max(40, +c.h), tipo = c.grafico || 'colunas';
    const R = c.rotulos || [], S = (c.series || []).filter(s => s && s.valores);
    const fonte = c.fonte || ((SD.doc && SD.doc.tema) || SD_TEMA).texto, tinta = c.corTexto || ((SD.doc && SD.doc.tema) || SD_TEMA).cores.tinta;
    const fs = +c.tamTexto || Math.max(14, Math.min(40, Math.min(W, H) * 0.05));
    const T = (x, y, t, o = {}) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="'${sdX(fonte)}'" font-size="${(o.tam || fs).toFixed(1)}" font-weight="${o.peso || 400}" fill="${o.cor || tinta}"${o.op ? ` fill-opacity="${o.op}"` : ''} text-anchor="${o.ancora || 'middle'}" dominant-baseline="${o.base || 'middle'}">${sdX(t)}</text>`;
    let g = '', defs = '';
    // legenda (várias séries; pizza/rosca = categorias)
    const porCat = ['pizza', 'rosca', 'funil'].includes(tipo);
    const itensLeg = porCat ? R.map((r, i) => [r, (S[0] && S[0].cores && S[0].cores[i]) || sdGrafCor(c, i)]) : S.map((s, k) => [s.nome, s.cor || sdGrafCor(c, k)]);
    const leg = c.legenda && itensLeg.length > (porCat ? 0 : 1) && !['progresso', 'trilhas', 'waffle'].includes(tipo);
    let top = 0, dirLeg = 0;
    if (leg && !porCat) {
        let x = 0; const y = fs * 0.7;
        for (const [n, cor] of itensLeg) { g += `<rect x="${x}" y="${y - fs * 0.35}" width="${fs * 0.7}" height="${fs * 0.7}" rx="${fs * 0.15}" fill="${cor}"/>` + T(x + fs, y, n, { ancora: 'start', tam: fs * 0.9 }); x += fs * 2 + String(n).length * fs * 0.55; }
        top = fs * 1.9;
    } else if (leg && porCat && tipo !== 'funil') dirLeg = Math.min(W * 0.38, fs * 0.6 * Math.max(...itensLeg.map(([n]) => String(n).length)) + fs * 2.4);
    const ph = H - top;
    if (['colunas', 'empilhadas', 'barras', 'linha', 'area'].includes(tipo)) {
        const hor = tipo === 'barras', emp = tipo === 'empilhadas';
        const soma = i => S.reduce((a, s) => a + Math.max(0, +s.valores[i] || 0), 0);
        const maxV = +c.max || sdGrafTeto(Math.max(1e-9, ...R.map((_, i) => emp ? soma(i) : Math.max(...S.map(s => +s.valores[i] || 0)))) * (c.valores && !c.grade ? 1.08 : 1));
        const minV = Math.min(0, ...S.flatMap(s => s.valores.map(v => +v || 0)));
        const eixoV = c.grade ? fs * 0.6 * Math.max(...[maxV, minV].map(v => sdGrafFmt(c, v).length)) + fs * 0.6 : 0;
        const rotH = hor ? Math.min(W * 0.32, fs * 0.58 * Math.max(1, ...R.map(r => String(r).length)) + fs * 0.6) : 0;
        const x0 = hor ? rotH : eixoV, x1 = W - (hor && c.valores ? fs * 0.6 * (sdGrafFmt(c, maxV).length + 1) : fs * 0.3);
        const y0 = top + (c.valores && !hor ? fs * 1.4 : fs * 0.4), y1 = H - (hor ? (c.grade ? fs * 1.6 : 0) : fs * 1.8);
        const esc = v => hor ? x0 + (v - minV) / (maxV - minV) * (x1 - x0) : y1 - (v - minV) / (maxV - minV) * (y1 - y0);
        const grade = c.grade ? 4 : 0;
        for (let k = 0; k <= grade; k++) {
            const v = minV + (maxV - minV) * k / grade, p = esc(v);
            g += hor ? `<line x1="${p}" y1="${y0}" x2="${p}" y2="${y1}" stroke="${tinta}" stroke-opacity=".14" stroke-width="1.5"/>` + T(p, y1 + fs * 0.9, sdGrafFmt(c, v), { tam: fs * 0.8, op: .6 })
                : `<line x1="${x0}" y1="${p}" x2="${x1}" y2="${p}" stroke="${tinta}" stroke-opacity=".14" stroke-width="1.5"/>` + T(x0 - fs * 0.5, p, sdGrafFmt(c, v), { ancora: 'end', tam: fs * 0.8, op: .6 });
        }
        const n = Math.max(1, R.length), passo = (hor ? y1 - y0 : x1 - x0) / n;
        if (tipo === 'linha' || tipo === 'area') {
            const px = i => x0 + passo * (i + 0.5);
            S.forEach((s, k) => {
                const cor = s.cor || sdGrafCor(c, k), pts = R.map((_, i) => [px(i), esc(+s.valores[i] || 0)]);
                if (!pts.length) return;
                let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
                for (let i = 1; i < pts.length; i++) {
                    if (c.suave) { const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = pts[i], p3 = pts[i + 1] || p2;
                        d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`; }
                    else d += ` L${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
                }
                if (tipo === 'area') {
                    defs += `<linearGradient id="ga${c.id}${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".55"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient>`;
                    g += `<path d="${d} L${pts.at(-1)[0].toFixed(1)},${esc(Math.max(0, minV))} L${pts[0][0].toFixed(1)},${esc(Math.max(0, minV))} Z" fill="url(#ga${c.id}${k})"/>`;
                }
                g += `<path d="${d}" fill="none" stroke="${cor}" stroke-width="${+c.espessura || 5}" stroke-linecap="round" stroke-linejoin="round"/>`;
                if (c.pontos) pts.forEach(p => { g += `<circle cx="${p[0]}" cy="${p[1]}" r="${(+c.espessura || 5) * 1.3}" fill="${cor}"/>`; });
                if (c.valores) pts.forEach((p, i) => { g += T(p[0], p[1] - fs * 1.0, sdGrafFmt(c, s.valores[i]), { tam: fs * 0.85, peso: 600 }); });
            });
            R.forEach((r, i) => { g += T(px(i), y1 + fs * 0.95, r, { tam: fs * 0.85, op: .75 }); });
        } else {
            const nS = emp ? 1 : Math.max(1, S.length), larg = passo * (n > 1 || nS > 1 ? 0.62 : 0.5), lb = larg / nS;
            const raio = v => Math.min(+c.raio || 0, lb / 2);
            const barra = (x, y, w, h, r, cor) => {   // cantos redondos só na ponta
                if (w <= 0 || h <= 0) return '';
                r = Math.min(r, hor ? h / 2 : w / 2, hor ? w : h);
                if (!r) return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${cor}"/>`;
                return hor ? `<path d="M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z" fill="${cor}"/>`
                    : `<path d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z" fill="${cor}"/>`;
            };
            R.forEach((r, i) => {
                const base = (hor ? y0 : x0) + passo * i + (passo - larg) / 2;
                if (emp) {
                    let acc = 0; const ult = S.reduce((u, s, k) => (+s.valores[i] > 0 ? k : u), -1);
                    S.forEach((s, k) => {
                        const v = Math.max(0, +s.valores[i] || 0); if (!v) return;
                        const a = esc(acc), b = esc(acc + v), cor = s.cor || sdGrafCor(c, k);
                        g += hor ? barra(a, base, b - a, larg, k === ult ? raio() : 0, cor) : barra(base, b, larg, a - b, k === ult ? raio() : 0, cor);
                        if (c.valores && Math.abs(a - b) > fs * 1.3) g += hor ? T((a + b) / 2, base + larg / 2, sdGrafFmt(c, v), { tam: fs * 0.8, cor: sdLum(cor) > .45 ? '#111' : '#fff', peso: 600 })
                            : T(base + larg / 2, (a + b) / 2, sdGrafFmt(c, v), { tam: fs * 0.8, cor: sdLum(cor) > .45 ? '#111' : '#fff', peso: 600 });
                        acc += v;
                    });
                } else S.forEach((s, k) => {
                    const v = +s.valores[i] || 0, a = esc(Math.max(0, minV)), b = esc(v), cor = s.cor || sdGrafCor(c, k), p = base + lb * k;
                    g += hor ? barra(Math.min(a, b), p + lb * 0.06, Math.abs(b - a), lb * 0.88, raio(), cor) : barra(p + lb * 0.06, Math.min(a, b), lb * 0.88, Math.abs(a - b), raio(), cor);
                    if (c.valores) g += hor ? T(b + fs * 0.4, p + lb / 2, sdGrafFmt(c, v), { ancora: 'start', tam: fs * 0.9, peso: 600 }) : T(p + lb / 2, b - fs * 0.7, sdGrafFmt(c, v), { tam: fs * 0.9, peso: 600 });
                });
                g += hor ? T(x0 - fs * 0.5, base + larg / 2, r, { ancora: 'end', tam: fs * 0.9, op: .8 }) : T(base + larg / 2, y1 + fs * 0.95, r, { tam: fs * 0.85, op: .75 });
            });
        }
        if (!hor) g += `<line x1="${x0}" y1="${esc(Math.max(0, minV))}" x2="${x1}" y2="${esc(Math.max(0, minV))}" stroke="${tinta}" stroke-opacity=".35" stroke-width="2"/>`;
    } else if (tipo === 'pizza' || tipo === 'rosca') {
        const vs = (S[0] ? S[0].valores : []).map(v => Math.max(0, +v || 0)), tot = vs.reduce((a, b) => a + b, 0) || 1;
        const aw = W - dirLeg, cx = aw / 2, cy = top + ph / 2, r = Math.min(aw, ph) / 2 * 0.94, ri = tipo === 'rosca' ? r * Math.min(0.9, Math.max(0.2, c.buraco ?? 0.6)) : 0;
        let a0 = -Math.PI / 2;
        vs.forEach((v, i) => {
            const a1 = a0 + v / tot * Math.PI * 2, cor = (S[0].cores && S[0].cores[i]) || sdGrafCor(c, i), big = a1 - a0 > Math.PI ? 1 : 0;
            const P = (rr, a) => `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
            if (v / tot > 0.9999) g += ri ? `<circle cx="${cx}" cy="${cy}" r="${(r + ri) / 2}" fill="none" stroke="${cor}" stroke-width="${r - ri}"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${cor}"/>`;
            else if (v > 0) g += `<path d="M${P(r, a0)} A${r},${r} 0 ${big} 1 ${P(r, a1)} ${ri ? `L${P(ri, a1)} A${ri},${ri} 0 ${big} 0 ${P(ri, a0)}` : `L${cx},${cy}`} Z" fill="${cor}" stroke="${c.separador || 'none'}" stroke-width="${c.separador ? 4 : 0}"/>`;
            if (c.valores && v / tot > 0.04) { const am = (a0 + a1) / 2, rm = ri ? (r + ri) / 2 : r * 0.64; g += T(cx + Math.cos(am) * rm, cy + Math.sin(am) * rm, c.sufixo === '%' && Math.abs(tot - 100) > 0.5 ? Math.round(v / tot * 100) + '%' : sdGrafFmt(c, v), { tam: fs * 0.9, peso: 700, cor: sdLum(cor) > .45 ? '#111' : '#fff' }); }
            a0 = a1;
        });
        const txtC = c.centro != null ? c.centro : vs.length ? (c.sufixo === '%' && Math.abs(tot - 100) > 0.5 ? Math.round(vs[0] / tot * 100) + '%' : sdGrafFmt(c, vs[0])) : '';
        if (ri && txtC !== '') g += T(cx, cy, txtC, { tam: Math.min(ri * 0.62, fs * 2.6), peso: 700 });   // vazio = sem texto; sem nada = o 1º valor
        if (dirLeg) { const lh = fs * 1.5, y = cy - (itensLeg.length - 1) * lh / 2;
            itensLeg.forEach(([n, cor], i) => { g += `<rect x="${aw + fs * 0.4}" y="${y + i * lh - fs * 0.35}" width="${fs * 0.7}" height="${fs * 0.7}" rx="${fs * 0.15}" fill="${cor}"/>` + T(aw + fs * 1.4, y + i * lh, n, { ancora: 'start', tam: fs * 0.9 }); }); }
    } else if (tipo === 'progresso') {
        const vs = S[0] ? S[0].valores : [], n = Math.max(1, vs.length), cw = W / n, max = +c.max || 100;
        vs.forEach((v, i) => {
            const temRot = R[i] != null && R[i] !== '', r = Math.min(cw * 0.46, (ph - (temRot ? fs * 2 : 0)) / 2), cx = cw * (i + 0.5), cy = top + r + fs * 0.1;
            const e = r * Math.min(0.4, Math.max(0.04, +c.espessura || 0.15)), rr = r - e / 2, t = Math.max(0, Math.min(1, (+v || 0) / max)), cor = sdGrafCor(c, n > 1 ? i : 0);
            const circ = 2 * Math.PI * rr;
            g += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${tinta}" stroke-opacity=".12" stroke-width="${e}"/>` +
                `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${cor}" stroke-width="${e}" stroke-linecap="round" stroke-dasharray="${(circ * t).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>` +
                T(cx, cy, c.centro != null && c.centro !== '' && n === 1 ? c.centro : sdGrafFmt(c, v), { tam: r * 0.42, peso: 700 });
            if (temRot) g += T(cx, cy + r + fs * 1.1, R[i], { tam: fs, op: .8 });
        });
    } else if (tipo === 'trilhas') {
        const vs = S[0] ? S[0].valores : [], n = Math.max(1, vs.length), max = +c.max || 100, lh = ph / n, e = Math.min(lh * 0.28, fs * 0.9);
        vs.forEach((v, i) => {
            const y = top + lh * i + lh * 0.38, t = Math.max(0, Math.min(1, (+v || 0) / max)), r = Math.min(+c.raio || 0, e / 2), cor = sdGrafCor(c, c.cores ? i : 0);
            g += T(0, y - e * 0.2, R[i] ?? '', { ancora: 'start', base: 'auto', tam: fs }) + T(W, y - e * 0.2, sdGrafFmt(c, v), { ancora: 'end', base: 'auto', tam: fs, peso: 700 }) +
                `<rect x="0" y="${y + fs * 0.35}" width="${W}" height="${e}" rx="${r}" fill="${tinta}" fill-opacity=".12"/>` +
                (t > 0 ? `<rect x="0" y="${y + fs * 0.35}" width="${(W * t).toFixed(1)}" height="${e}" rx="${r}" fill="${cor}"/>` : '');
        });
    } else if (tipo === 'waffle') {
        const v = S[0] ? +S[0].valores[0] || 0 : 0, max = +c.max || 100, cheio = Math.round(Math.max(0, Math.min(1, v / max)) * 100);
        const lado = Math.min(c.valores ? W * 0.62 : W, ph), q = lado / 10, gap = q * 0.14, cor = sdGrafCor(c, 0);
        for (let k = 0; k < 100; k++) { const col = k % 10, lin = 9 - Math.floor(k / 10);
            g += `<rect x="${(col * q + gap / 2).toFixed(1)}" y="${(top + lin * q + gap / 2).toFixed(1)}" width="${(q - gap).toFixed(1)}" height="${(q - gap).toFixed(1)}" rx="${(q * 0.18).toFixed(1)}" fill="${k < cheio ? cor : tinta}"${k < cheio ? '' : ' fill-opacity=".12"'}/>`; }
        if (c.valores) { const x = lado + (W - lado) / 2; g += T(x, top + lado * 0.42, sdGrafFmt(c, v), { tam: Math.min((W - lado) * 0.34, lado * 0.3), peso: 700, cor }) + T(x, top + lado * 0.64, R[0] ?? '', { tam: fs, op: .8 }); }
    } else if (tipo === 'funil') {
        const vs = (S[0] ? S[0].valores : []).map(v => Math.max(0, +v || 0)), n = Math.max(1, vs.length), mx = Math.max(1e-9, ...vs), lh = ph / n;
        vs.forEach((v, i) => {
            const w1 = W * (0.25 + 0.75 * v / mx), w2 = W * (0.25 + 0.75 * (vs[i + 1] ?? v * 0.8) / mx), y = top + lh * i, cor = sdGrafCor(c, c.cores ? i : 0);
            const op = c.cores ? 1 : 1 - i * (0.5 / n);
            g += `<path d="M${(W - w1) / 2},${y + lh * 0.04} H${(W + w1) / 2} L${(W + w2) / 2},${y + lh * 0.96} H${(W - w2) / 2} Z" fill="${cor}" fill-opacity="${op.toFixed(2)}"/>`;
            g += T(W / 2, y + lh / 2, (R[i] ?? '') + (c.valores ? '  ' + sdGrafFmt(c, v) : ''), { tam: Math.min(fs * 1.1, lh * 0.38), peso: 600, cor: sdLum(cor) > .45 && op > .6 ? '#111' : '#fff' });
        });
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible">${defs ? `<defs>${defs}</defs>` : ''}${g}</svg>`;
}

// ───────────── comandos ─────────────
function sdGrafCorTextoAuto(s) {   // contraste com o fundo do slide
    const T = SD.doc.tema.cores, f = s && s.fundo || {};
    const fundo = f.tipo === 'imagem' ? '#000000' : f.cor || T.fundo;
    return sdLum(fundo) < 0.4 ? (sdLum(T.tinta) > sdLum(T.fundo) ? T.tinta : T.fundo) : (sdLum(T.tinta) < sdLum(T.fundo) ? T.tinta : T.fundo);
}
function sdGrafDados(a) {
    if (a.csv != null) return sdGrafDeCsv(a.csv);
    const d = {};
    if (a.rotulos) d.rotulos = a.rotulos.map(String);
    if (a.series) d.series = a.series.map((s, k) => Array.isArray(s) ? { nome: `Série ${k + 1}`, valores: s.map(Number) } : { ...s, valores: (s.valores || []).map(Number) });
    if (a.valores && !a.series) d.series = [{ nome: a.nome_serie || 'Série 1', valores: a.valores.map(Number) }];
    return d;
}
sdRegistrar('grafico', 'gráfico editável {modelo: ' + SD_GRAF_MODELOS.map(m => m.id).join('|') + ' | grafico: ' + SD_GRAF_TIPOS.map(t => t[0]).join('|') +
    ', csv ("Rótulo;Série" + linhas) | rotulos + series [{nome, valores, cor}] | valores, x, y, w, h, valores (mostrar), legenda, grade, raio, buraco, centro, prefixo, sufixo, casas, max, cores, corTexto, fonte, tamTexto, slide}', a => {
    const M = SD_GRAF_MODELOS.find(m => m.id === a.modelo) || SD_GRAF_MODELOS.find(m => m.id === a.grafico) || SD_GRAF_MODELOS[0];
    const dados = { ...sdClone(M.d), ...sdGrafDados(a) }, props = { ...a };
    for (const k of ['modelo', 'csv', 'rotulos', 'series', 'nome_serie']) delete props[k];
    if (Array.isArray(a.valores)) delete props.valores;
    const s = sdSlide(a.slide) || sdSlide(), quad = ['pizza', 'rosca', 'progresso', 'waffle'].includes(a.grafico || M.g.grafico) && (dados.rotulos || []).length < 2;
    return sdNova('grafico', props, { nome: 'Gráfico: ' + M.nome, ...sdClone(M.g), ...dados, w: quad ? 640 : 1200, h: quad ? 640 : 640, corTexto: sdGrafCorTextoAuto(s) });
});
sdRegistrar('grafico_dados', 'troca os dados do gráfico {id, csv | rotulos + series | valores}', a => {
    const cs = sdAlvos(a).filter(c => c.tipo === 'grafico'); if (!cs.length) throw new Error('selecione um gráfico');
    const d = sdGrafDados(a); cs.forEach(c => Object.assign(c, d));
    return { ids: cs.map(c => c.id) };
}, { qual: 'camadas' });

// ───────────── interface: galeria de modelos e painel ─────────────
function sdGrafGaleria(ancora) {
    sdFecharMenu();
    const box = document.createElement('div'); box.className = 'sd-pop sd-graf-gal';
    box.innerHTML = `<div class="sd-pop-tit">Gráficos — clique para inserir (dados editáveis no painel Design)</div><div class="sd-graf-grade">${SD_GRAF_MODELOS.map(m => {
        const c = { id: 'gal' + m.id, w: 300, h: 180, ...sdClone(m.g), ...sdClone(m.d), tamTexto: 15, corTexto: '#e8ecef' };
        return `<button class="sd-graf-it" data-gm="${m.id}" title="${sdEsc(m.desc)}"><span class="sd-graf-arte">${sdGraficoSvg(c)}</span><b>${sdEsc(m.nome)}</b><small>${sdEsc(m.desc)}</small></button>`; }).join('')}</div>`;
    document.body.appendChild(box);
    const r = ancora.getBoundingClientRect();
    box.style.left = Math.max(6, Math.min(r.left, innerWidth - box.offsetWidth - 6)) + 'px'; box.style.top = Math.min(r.bottom + 4, innerHeight - box.offsetHeight - 6) + 'px';
    box.onclick = ev => { const b = ev.target.closest('[data-gm]'); if (!b) return; sdFecharMenu(); sdUi('grafico', { modelo: b.dataset.gm }); };
    SDU.menu = box; setTimeout(() => document.addEventListener('mousedown', sdFecharMenuFora, true), 0);
}
function sdPainelGrafico(c) {
    const S = c.series || [];
    return sdSec('Gráfico', `${sdS('grafico', 'Tipo', c.grafico || 'colunas', SD_GRAF_TIPOS)}
        <label class="sd-row sd-col"><span>Dados <small>(Rótulo; Série 1; Série 2…)</small></span><textarea class="sd-graf-csv" data-graf-csv rows="${Math.min(10, (c.rotulos || []).length + 2)}" spellcheck="false">${sdEsc(sdGrafCsv(c))}</textarea></label>
        <div class="sd-graf-cores">${(['pizza', 'rosca', 'funil', 'trilhas', 'progresso'].includes(c.grafico) ? (c.rotulos || []) : S.map(s => s.nome)).map((n, k) =>
            `<label title="${sdEsc(n)}"><input type="color" data-graf-cor="${k}" value="${sdHex6(sdGrafCor(c, k))}"><span>${sdEsc(n)}</span></label>`).join('')}</div>
        ${c.cores ? '<button class="sd-btn sd-larga" data-pa="graf-cores-tema">Voltar às cores do tema</button>' : ''}
        ${sdC('valores', 'Mostrar valores', c.valores)}${['colunas', 'barras', 'empilhadas', 'linha', 'area'].includes(c.grafico) ? sdC('grade', 'Grade e eixo', c.grade) : ''}
        ${['colunas', 'empilhadas', 'linha', 'area', 'pizza', 'rosca'].includes(c.grafico) ? sdC('legenda', 'Legenda', c.legenda) : ''}
        ${['linha', 'area'].includes(c.grafico) ? sdC('suave', 'Curva suave', c.suave) + sdC('pontos', 'Pontos', c.pontos) + sdN('espessura', 'Espessura', c.espessura || 5, { min: 1 }) : ''}
        ${['colunas', 'barras', 'empilhadas', 'trilhas'].includes(c.grafico) ? sdN('raio', 'Cantos', c.raio || 0, { min: 0 }) : ''}
        ${c.grafico === 'rosca' ? sdR('buraco', 'Furo', c.buraco ?? 0.6, 0.2, 0.9, 0.02) : ''}${c.grafico === 'progresso' ? sdR('espessura', 'Espessura', c.espessura ?? 0.15, 0.04, 0.4, 0.01) : ''}
        ${['rosca', 'progresso'].includes(c.grafico) ? `<label class="sd-row"><span>Texto central</span><input type="text" data-p="centro" value="${sdEsc(c.centro ?? '')}" placeholder="1º valor"></label>` : ''}
        ${['progresso', 'trilhas', 'waffle'].includes(c.grafico) ? sdN('max', 'Máximo', c.max || 100, { min: 0 }) : ''}
        <div class="sd-grade2">${sdT('prefixo', 'Antes do nº', c.prefixo)}${sdT('sufixo', 'Depois do nº', c.sufixo)}</div>
        <div class="sd-grade2">${sdN('casas', 'Casas decimais', c.casas ?? '', { min: 0, max: 4 })}${sdN('tamTexto', 'Tam. do texto', c.tamTexto || '', { min: 8 })}</div>
        ${sdT('fonte', 'Fonte', c.fonte || '', { list: 'sd-fontes' })}${sdCor('corTexto', 'Cor do texto', c.corTexto)}`);
}
// eventos do painel (delegados uma vez; o painel é redesenhado a cada mudança)
document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches && t.matches('[data-graf-csv]')) { const c = sdAlvos({})[0]; if (c) sdUi('grafico_dados', { ids: [c.id], csv: t.value }); }
    else if (t.matches && t.matches('[data-graf-cor]')) {
        const c = sdAlvos({})[0]; if (!c) return;
        const cs = [...sdGrafCores(c)], k = +t.dataset.grafCor; while (cs.length <= k) cs.push(sdGrafCor(c, cs.length)); cs[k] = t.value;
        const S = sdClone(c.series || []); S.forEach(s => { delete s.cor; delete s.cores; });
        sdUi('editar', { ids: [c.id], cores: cs, series: S });
    }
}, true);
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-pa="graf-cores-tema"]'); if (b) { e.stopPropagation(); sdUi('editar', { cores: null }); } }, true);
