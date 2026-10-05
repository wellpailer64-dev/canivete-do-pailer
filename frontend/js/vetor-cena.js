// Vetor Kanivete — CENA (VKN.cena / comando cena): diagramar uma prancheta escrevendo HTML/CSS. O navegador faz o layout
// (flex, grid, quebra de linha, margens) numa área escondida do tamanho da prancheta (1 px CSS = 1 pt) e cada elemento vira
// objeto nativo: fundo/borda/raio → retângulo (ou elipse com data-forma), degradê linear → degradê, box-shadow → sombra,
// opacity → opacidade, texto → texto editável na MESMA linha de base (trechos com cor/peso de <span>/<b>/<em>),
// <img data-arquivo> → imagem cortada (object-fit), data-icone="coffee" → ícone, data-qr="url" → QR vetorial.
// Cores: paleta {'#0e3b4a': 'C100 M55 Y35 K45'} troca o hex pelo CMYK exato; data-cor/data-cor-texto forçam uma cor.
// Rodar de novo com limpar (padrão) substitui só o que a cena criou naquela prancheta (o.cena = id da prancheta).
const VK_CENA_PESO = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
function vkCenaCor(css, pal, forcada) {   // cor CSS → {cor (texto p/ comando), op}
    if (forcada) return { cor: forcada, op: 1 };
    const m = String(css || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/);
    if (!m) return null;
    let a = m[4] == null ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]); if (a <= 0.001) return null;
    const hex = '#' + [m[1], m[2], m[3]].map(v => Math.round(+v).toString(16).padStart(2, '0')).join('');
    return { cor: (pal && pal[hex]) || hex, op: a };
}
function vkCenaDegrade(bg, pal) {   // linear-gradient(Ndeg, cor p%, cor p%...) → {angulo, paradas}
    const m = String(bg).match(/linear-gradient\((.*)\)/); if (!m) return null;
    const partes = m[1].split(/,(?![^(]*\))/).map(s => s.trim()); let ang = 180;
    if (/deg$/.test(partes[0])) ang = parseFloat(partes.shift()); else if (/^to /.test(partes[0])) { ang = { 'to right': 90, 'to left': 270, 'to top': 0, 'to bottom': 180 }[partes.shift()] ?? 180; }
    const paradas = partes.map((s, i, arr) => { const c = vkCenaCor(s.replace(/\s+[\d.]+%$/, ''), pal); const pm = s.match(/([\d.]+)%$/); return c && { cor: c.cor, p: pm ? +pm[1] / 100 : i / Math.max(1, arr.length - 1) }; }).filter(Boolean);
    return paradas.length >= 2 ? { angulo: 90 - ang, paradas } : null;   // CSS: 0deg = para cima, horário; Vetor: 0 = para a direita, anti-horário
}
async function vkCena(a) {
    const t0 = performance.now(), avisos = [];
    let p;
    if (a.nova) { const r = await VK_CMDS.nova_prancheta.fn({ nome: a.nova.nome || a.prancheta || 'Cena', larg: a.nova.larg, alt: a.nova.alt }); p = VK.doc.pranchetas.find(q => q.id === r.id || q.nome === r.nome); }
    else p = (a.prancheta != null && (VK.doc.pranchetas.find(q => q.id === a.prancheta || q.nome === a.prancheta) || VK.doc.pranchetas[+a.prancheta - 1])) || VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0];
    if (!p) throw new Error('cena: prancheta não encontrada');
    VK.ativa = p.id;
    if (a.limpar !== false) for (const c of VK.doc.camadas) c.itens = c.itens.filter(o => o.cena !== p.id);
    const W = p.w, H = p.h, pal = Object.fromEntries(Object.entries(a.paleta || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-${W + 50000}px;top:0;width:${W}px;height:${H}px;overflow:hidden;pointer-events:none;`;
    host.innerHTML = `<style>:where(#vkc, #vkc *){box-sizing:border-box;margin:0;padding:0}#vkc{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:Inter,Arial,sans-serif;font-size:10px;line-height:1.3;color:#000}${a.css || ''}</style><div id="vkc">${a.html}</div>`;
    document.body.appendChild(host);
    const criados = [], X = v => p.x + v, Y = v => p.y + v;
    const marca = (r, nome) => { for (const id of (r && (r.ids || (r.id ? [r.id] : []))) || []) { const o = vkObj(id); if (o) { o.cena = p.id; if (nome && !o.nome) o.nome = nome; criados.push(o.id); } } return r; };
    const cmd = async (n, args, nome) => { try { return marca(await VK_CMDS[n].fn({ un: 'pt', ...args }), nome); } catch (e) { avisos.push(`${nome || n}: ${String(e.message || e).slice(0, 120)}`); return null; } };
    try {
        const raiz = host.querySelector('#vkc');
        const fams = new Set(); raiz.querySelectorAll('*').forEach(el => { const cs = getComputedStyle(el); fams.add(`${cs.fontStyle} ${cs.fontWeight} 16px ${cs.fontFamily}`); });
        await Promise.all([...fams].map(f => document.fonts.load(f).catch(() => null))); await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const rr = raiz.getBoundingClientRect(), cv = document.createElement('canvas').getContext('2d');
        const temTexto = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        const visitar = async (el, opPai = 1) => {
            const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
            const r = el.getBoundingClientRect(), x = r.left - rr.left, y = r.top - rr.top, w = r.width, h = r.height, ds = el.dataset;
            const nome = ds.nome || el.id || (typeof el.className === 'string' && el.className.split(' ')[0]) || null, op = opPai * (+cs.opacity || 1);
            const antes = criados.length;
            if (w > 0.01 && h > 0.01) {
                // fundo (cor ou degradê), borda, raio, sombra
                const bg = vkCenaCor(cs.backgroundColor, pal, ds.cor), dg = cs.backgroundImage && cs.backgroundImage !== 'none' ? vkCenaDegrade(cs.backgroundImage, pal) : null;
                const lados = ['Top', 'Right', 'Bottom', 'Left'].map(s => ({ s, w: cs[`border${s}Style`] !== 'none' ? parseFloat(cs[`border${s}Width`]) || 0 : 0, c: cs[`border${s}Color`] }));
                const iguais = lados.every(l => l.w > 0 && l.w === lados[0].w && l.c === lados[0].c);
                const bw = iguais ? lados[0].w : 0, bc = iguais ? vkCenaCor(lados[0].c, pal, ds.corBorda) : null;
                if (!iguais) for (const l of lados) if (l.w > 0) {   // borda só de alguns lados: um filete por lado
                    const c = vkCenaCor(l.c, pal, ds.corBorda); if (!c) continue;
                    const [x1, y1, x2, y2] = { Top: [x, y + l.w / 2, x + w, y + l.w / 2], Bottom: [x, y + h - l.w / 2, x + w, y + h - l.w / 2], Left: [x + l.w / 2, y, x + l.w / 2, y + h], Right: [x + w - l.w / 2, y, x + w - l.w / 2, y + h] }[l.s];
                    await cmd('linha', { x1: vkMM(x1), y1: vkMM(y1), x2: vkMM(x2), y2: vkMM(y2), traco: c.cor, espessura: vkMM(l.w), un: undefined, prancheta: p.id }, (nome || 'filete') + ' ' + l.s.toLowerCase());
                }
                if (bg || dg || bc) {
                    const raio = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2), elipse = ds.forma === 'elipse' || (raio >= Math.min(w, h) / 2 - 0.5 && Math.abs(w - h) < 0.5 && raio > 0);
                    const est = { preench: bg ? bg.cor : (dg ? dg.paradas[0].cor : 'nenhum'), traco: bc ? bc.cor : 'nenhum', ...(bc ? { espessura: vkMM(bw) } : {}) };
                    const o = elipse ? await cmd('elipse', { x: X(x), y: Y(y), larg: w, alt: h, ...est }, nome) : await cmd('retangulo', { x: X(x), y: Y(y), larg: w, alt: h, raio, ...est }, nome);
                    if (o && dg) await cmd('degrade', { ids: [o.id], tipo: 'linear', angulo: dg.angulo, paradas: dg.paradas.map(q => ({ cor: q.cor, pos: q.p * 100 })) }, nome);
                    if (o && bg && bg.op < 1) await cmd('alterar', { ids: [o.id], opacidade: Math.round(bg.op * 100) });
                    const sh = cs.boxShadow && cs.boxShadow !== 'none' ? cs.boxShadow.match(/(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/) : null;
                    if (o && sh) { const sc = vkCenaCor(sh[1], pal); await cmd('efeito', { ids: [o.id], tipo: 'sombra', dx: vkMM(+sh[2]), dy: vkMM(+sh[3]), desfoque: vkMM(+sh[4] / 2), opacidade: Math.round((sc ? sc.op : 0.3) * 100), cor: sc ? sc.cor : '100K' }); }
                }
                // componentes
                if (ds.simbolo) {   // símbolo da marca (doc.simbolos): encaixa na caixa do elemento (contain), alinhado pelo object-position/centro
                    const s = await cmd('colocar_simbolo', { nome: ds.simbolo, x: 0, y: 0 }, nome || ds.simbolo);
                    if (s) { const o = vkObj(s.id), b = vkBox(o), k = Math.min(w / ((b[2] - b[0]) || 1), h / ((b[3] - b[1]) || 1));
                        vkTransformar(o, [k, 0, 0, k, 0, 0]); const b2 = vkBox(o), al = cs.textAlign;
                        const dx = (al === 'left' || al === 'start' ? X(x) - b2[0] : al === 'right' || al === 'end' ? X(x + w) - b2[2] : X(x + w / 2) - (b2[0] + b2[2]) / 2);
                        vkTransformar(o, [1, 0, 0, 1, dx, Y(y + h / 2) - (b2[1] + b2[3]) / 2]); }
                }
                if (ds.icone) { const c = vkCenaCor(cs.color, pal, ds.corTexto); await cmd('icone', { nome: ds.icone, x: vkMM(X(x) - p.x), y: vkMM(Y(y) - p.y), tamanho: vkMM(Math.min(w, h)), cor: c ? c.cor : '100K', un: undefined, prancheta: p.id }, nome || ds.icone); }
                if (ds.qr) { const c = vkCenaCor(cs.color, pal, ds.corTexto); await cmd('qrcode', { conteudo: ds.qr, x: vkMM(x), y: vkMM(y), tamanho: vkMM(Math.min(w, h)), cor: c ? c.cor : '100K', un: undefined, prancheta: p.id }, nome || 'qr'); }
                if (el.tagName === 'IMG' && (ds.arquivo || /^[a-z]:[\\/]/i.test(el.getAttribute('src') || ''))) {
                    const arq = ds.arquivo || el.getAttribute('src'), im = await cmd('imagem', { arquivo: arq, x: X(x), y: Y(y), larg: w }, nome || 'foto');
                    if (im) { const b = vkBox(vkObj(im.id)), ih = b[3] - b[1], iw = b[2] - b[0];
                        if (Math.abs(ih - h) > 0.5) {   // object-fit: cover (padrão) preenche e corta; contain encaixa
                            const k = cs.objectFit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
                            await VK_CMDS.redimensionar.fn({ ids: [im.id], escala: k * 100, un: 'pt' });
                            const b2 = vkBox(vkObj(im.id)); await VK_CMDS.mover.fn({ ids: [im.id], dx: X(x) + w / 2 - (b2[0] + b2[2]) / 2, dy: Y(y) + h / 2 - (b2[1] + b2[3]) / 2, un: 'pt' });
                            if (cs.objectFit !== 'contain') { const m = await cmd('retangulo', { x: X(x), y: Y(y), larg: w, alt: h, preench: 'nenhum', traco: 'nenhum' }, 'corte');
                                if (m) { const g = await VK_CMDS.mascara.fn({ ids: [im.id, m.id] }); marca(g, nome || 'foto'); } } } }
                }
            }
            if (temTexto(el) && !ds.icone && !ds.qr && !ds.simbolo) await vkCenaTexto(el, cs, r, rr, p, pal, cmd, cv, nome);
            else for (const f of el.children) await visitar(f, op);
            if (op < 0.999) for (const id of criados.slice(antes)) { const o = vkObj(id); if (o) o.op = (o.op ?? 1) * op; }
            if (ds.grupo && criados.length - antes > 1) { const ids = criados.slice(antes).filter(id => vkListaDe(id)); const g = await VK_CMDS.agrupar.fn({ ids, nome: ds.grupo }); criados.splice(antes); marca(g, ds.grupo); }
        };
        for (const f of raiz.children) await visitar(f);
    } finally { host.remove(); }
    VK.sel = criados.filter(id => vkObj(id)).slice(-1);
    return { prancheta: p.nome, objetos: criados.filter(id => vkObj(id)).length, avisos, ms: Math.round(performance.now() - t0) };
}
async function vkCenaTexto(el, cs, r, rr, p, pal, cmd, cv, nome) {
    const conteudo = el.innerText.replace(/ /g, ' '); if (!conteudo.trim()) return;
    const fam = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''), peso = Math.round((parseInt(cs.fontWeight) || 400) / 100) * 100;
    const estilo = (VK_CENA_PESO[peso] || 'Regular') + (cs.fontStyle === 'italic' ? ' Italic' : ''), tam = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? tam * 1.2 : parseFloat(cs.lineHeight), track = Math.round((parseFloat(cs.letterSpacing) || 0) / tam * 1000);
    const alin = { center: 'centro', right: 'dir', end: 'dir', justify: 'just' }[cs.textAlign] || 'esq', cor = vkCenaCor(cs.color, pal, el.dataset.corTexto);
    const rg = document.createRange(); rg.selectNodeContents(el);
    const linhas = [...rg.getClientRects()].filter(q => q.width > 0.5).reduce((acc, q) => { if (!acc.some(t => Math.abs(t.top - q.top) < tam * 0.3)) acc.push(q); return acc; }, []);
    if (!linhas.length) return;
    cv.font = `${cs.fontStyle} ${peso} ${tam}px "${fam}"`; const asc = cv.measureText('Hg').fontBoundingBoxAscent || tam * 0.8;
    const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0;
    const base0 = linhas[0].top - rr.top + asc + (linhas[0].height - (asc + (cv.measureText('Hg').fontBoundingBoxDescent || tam * 0.2))) / 2;
    const comum = { conteudo, fonte: fam, estilo, tamanho: tam, preench: cor ? cor.cor : '100K', alin, ...(track ? { track } : {}), entrelinha: lh };
    const area = linhas.length > 1 || el.dataset.caixa != null;
    let res;
    if (area) {
        const cx = r.left - rr.left + pl, cw = r.width - pl - pr + 1.5;
        res = await cmd('texto', { ...comum, x: p.x + cx, y: p.y + r.top - rr.top + pt, caixa: vkMM(cw), caixa_alt: vkMM(r.height - pt - (parseFloat(cs.paddingBottom) || 0) + lh), un: undefined, prancheta: p.id,
            ...{ x: vkMM(cx), y: vkMM(r.top - rr.top + pt) } }, nome);
        if (res) { const o = vkObj(res.id), g = await vkGeoPronta(o); if (g && g.linhas && g.linhas[0]) o.m[5] += p.y + base0 - (o.m[5] + g.linhas[0].base * (vkEsc(o.m) || 1)); }
    } else {
        const xl = alin === 'centro' ? r.left - rr.left + pl + (r.width - pl - pr) / 2 : alin === 'dir' ? r.right - rr.left - pr : linhas[0].left - rr.left;
        res = await cmd('texto', { ...comum, alin: alin === 'just' ? 'esq' : alin, x: p.x + xl, y: p.y + base0 }, nome);
    }
    if (!res) return;
    // trechos: <span>/<b>/<em> com cor ou peso diferente do bloco
    const o = vkObj(res.id); let pos = 0;
    const walk = async (n, herd) => {
        if (n.nodeType === 3) { pos += n.textContent.replace(/\s+/g, ' ').length; return; }
        if (n.nodeType !== 1) return;
        if (n.tagName === 'BR') { pos += 1; return; }
        const c2 = getComputedStyle(n), ini = pos;
        for (const f of n.childNodes) await walk(f, herd);
        if (n === el) return;
        const fim = pos, pe = Math.round((parseInt(c2.fontWeight) || 400) / 100) * 100, ct = vkCenaCor(c2.color, pal, n.dataset && n.dataset.corTexto);
        const args = {};
        if (ct && ct.cor !== (cor && cor.cor)) args.preench = ct.cor;
        if (pe !== peso || c2.fontStyle !== cs.fontStyle) args.estilo = (VK_CENA_PESO[pe] || 'Regular') + (c2.fontStyle === 'italic' ? ' Italic' : '');
        if (c2.fontFamily !== cs.fontFamily) args.fonte = c2.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
        if (Object.keys(args).length && fim > ini) { try { vkTxAplicar(o, { ...args, faixa: [ini, fim] }); } catch (e) { /* trecho fora do texto (espaços colapsados) */ } }
    };
    if (el.children.length) { const txt = conteudo; pos = 0; await walk(el, null); if (pos !== txt.length) { /* contagem divergiu (pre/br): trechos aproximados */ } }
}
vkRegistrar('cena', 'cena (HTML → objetos)', a => vkCena(a || {}));
window.VKN && (VKN.cena = (html, op) => vkCmd('cena', { html, ...(op || {}) }, 'claude'));
