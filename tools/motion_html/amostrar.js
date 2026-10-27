// Amostrador do motion em HTML (tools/motion_html.py): roda na página, pausa as animações, leva o tempo a qualquer
// instante e lê cada camada no espaço do quadro (centro, escala, rotação, opacidade, desfoque, tamanho).
// Camadas: elementos com data-kv (se houver algum); senão, todo elemento com visual próprio (texto, fundo, borda, imagem).
(() => {
    const KV = window.KV = {};
    const px = v => parseFloat(v) || 0;
    const transparente = c => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
    const hex = c => {
        const m = String(c).match(/rgba?\(([^)]+)\)/);
        if (!m) return c;
        const [r, g, b] = m[1].split(',').map(s => Math.round(parseFloat(s)));
        return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
    };
    const alfaCor = c => { const m = String(c).match(/rgba\([^)]*,\s*([\d.]+)\)/); return m ? parseFloat(m[1]) : 1; };

    // ── tempo: Web Animations (CSS @keyframes, transições, el.animate), GSAP e um gancho próprio (window.kvTempo)
    KV.pausar = () => {
        document.getAnimations().forEach(a => a.pause());
        if (window.gsap) window.gsap.globalTimeline.pause();
    };
    KV.ir = t => {
        document.getAnimations().forEach(a => { a.pause(); a.currentTime = t * 1000; });
        if (window.gsap) window.gsap.globalTimeline.seek(t, false);
        if (typeof window.kvTempo === 'function') window.kvTempo(t);
    };
    // instantes de quadro-chave declarados (para começar o ajuste das curvas por eles)
    KV.chaves = el => {
        const out = [];
        for (const a of el.getAnimations({ subtree: false })) {
            const tm = a.effect.getComputedTiming(), d = tm.duration || 0, dl = tm.delay || 0;
            const it = Math.min(isFinite(tm.iterations) ? tm.iterations : 20, 20);
            const ks = a.effect.getKeyframes();
            for (let n = 0; n < it; n++)
                ks.forEach(k => out.push({ t: (dl + n * d + (k.computedOffset ?? k.offset ?? 0) * d) / 1000, e: k.easing || tm.easing }));
        }
        return out;
    };

    // ── o que é camada
    const temTextoProprio = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    // filhos inline vão junto com o texto, a não ser que tenham animação própria (letra por letra): aí cada um é camada
    const soInline = el => [...el.children].every(c => /^(inline|contents)$/.test(getComputedStyle(c).display) && !c.matches('[data-kv]') && c.tagName !== 'IMG') &&
        ![...el.querySelectorAll('*')].some(c => c.getAnimations().length);
    const visual = el => {
        const s = getComputedStyle(el);
        if (s.display === 'none') return null;
        if (el.matches('img,svg,canvas,video')) return 'img';
        const fundo = !transparente(s.backgroundColor) || s.backgroundImage !== 'none' || s.boxShadow !== 'none' ||
            ['Top', 'Right', 'Bottom', 'Left'].some(l => px(s['border' + l + 'Width']) > 0 && !transparente(s['border' + l + 'Color']));
        const texto = (temTextoProprio(el) || (el.children.length && soInline(el) && el.textContent.trim())) && soInline(el);
        if (fundo && texto) return 'caixa+texto';
        if (texto) return 'texto';
        if (fundo) return 'caixa';
        return null;
    };
    KV.camadas = () => {
        const marcadas = [...document.querySelectorAll('[data-kv]')];
        const lista = [];
        const andar = el => {
            for (const c of el.children) {
                if (c.matches('script,style,link,meta,head')) continue;
                const v = visual(c);
                if (v) lista.push(c);
                // texto com <span>: uma camada só (os filhos vão juntos); imagem/svg: idem
                if (v && /texto|img/.test(v)) continue;
                andar(c);
            }
        };
        if (marcadas.length) marcadas.forEach(el => lista.push(el)); else andar(document.body);
        KV.els = lista;
        // medidas sem transformação: com a camada girada no 1º quadro as letras "desciam" e o texto quebrava em
        // pedaços de linha (pílula "VENDA" virava VE/ND/A no Tráfego)
        const neutro = document.createElement('style');
        neutro.textContent = '*{transform:none!important;translate:none!important;rotate:none!important;scale:none!important}';
        document.head.append(neutro);
        try { return lista.map((el, i) => KV.estatico(el, i)); } finally { neutro.remove(); }
    };

    // ── matriz do elemento até a página (offset + transform + translate/rotate/scale com a origem de cada um)
    const matriz = el => {
        // cada elemento em relação ao PAI (não só ao offsetParent): pais estáticos com transform também contam
        const cadeia = [];
        for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) cadeia.unshift(e);
        let M = new DOMMatrix();
        for (const e of cadeia) {
            const s = getComputedStyle(e), pai = e.parentElement, op = e.offsetParent;
            let rx = e.offsetLeft, ry = e.offsetTop;
            if (pai && pai !== document.documentElement && op !== pai) { rx -= pai.offsetLeft; ry -= pai.offsetTop; }
            else if (op === pai && pai) { rx += pai.clientLeft; ry += pai.clientTop; }
            M = M.translate(rx, ry);
            const [ox, oy] = s.transformOrigin.split(' ').map(px);
            let T = new DOMMatrix();
            if (s.translate && s.translate !== 'none') { const [a, b] = s.translate.split(' '); T = T.translate(px(a), px(b || 0)); }
            if (s.rotate && s.rotate !== 'none') { const g = s.rotate.match(/(-?[\d.]+)deg/); if (g) T = T.rotate(parseFloat(g[1])); }
            if (s.scale && s.scale !== 'none') { const [a, b] = s.scale.split(' ').map(parseFloat); T = T.scale(a, b ?? a); }
            if (s.transform && s.transform !== 'none') T = T.multiply(new DOMMatrix(s.transform));
            if (!T.isIdentity) M = M.translate(ox, oy).multiply(T).translate(-ox, -oy);
        }
        return M;
    };
    const opacidade = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); o *= px(s.opacity); if (s.visibility === 'hidden' && e === el) o = 0; } return o; };
    const desfoque = el => { let b = 0; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const m = getComputedStyle(e).filter.match(/blur\(([\d.]+)px\)/); if (m) b = Math.hypot(b, parseFloat(m[1])); } return b; };

    // ── medidas do texto como o editor (veTxLayout): ascendente/descendente da fonte no canvas
    const cvm = document.createElement('canvas').getContext('2d');
    // as linhas como o navegador quebrou (quebra suave incluída): letra a letra, nova linha quando o topo muda
    const linhasReais = el => {
        const linhas = [''], tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), r = document.createRange();
        let topo = null;
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
            const t = n.textContent;
            for (let k = 0; k < t.length; k++) {
                if (t[k] === '\n' && /pre/.test(getComputedStyle(n.parentElement).whiteSpace)) { linhas.push(''); topo = null; continue; }
                r.setStart(n, k); r.setEnd(n, k + 1);
                const q = r.getClientRects()[0];
                if (!q) continue;   // espaço colapsado
                if (topo != null && q.top > topo + q.height * 0.5) { linhas.push(''); }
                if (topo == null || q.top > topo + q.height * 0.5) topo = q.top;
                linhas[linhas.length - 1] += /\s/.test(t[k]) ? ' ' : t[k];
            }
        }
        return linhas.map(l => l.replace(/\s+/g, ' ').trim()).filter((l, i, a) => l || i < a.length - 1);
    };
    const fonteCanvas = s => `${s.fontStyle === 'italic' ? 'italic ' : ''}${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;

    KV.estatico = (el, i) => {
        const s = getComputedStyle(el), v = el.matches('[data-kv]') ? (el.dataset.kv || visual(el) || 'raster') : visual(el);
        const o = { i, id: el.id || el.dataset.kvNome || (el.tagName.toLowerCase() + i), tipo: v, w: el.offsetWidth, h: el.offsetHeight };
        if (/caixa/.test(v)) {
            const raio = px(s.borderTopLeftRadius), uni = ['TopRight', 'BottomLeft', 'BottomRight'].every(c => s['border' + c + 'Radius'] === s.borderTopLeftRadius);
            const bw = px(s.borderTopWidth), bordaUni = ['Right', 'Bottom', 'Left'].every(l => s['border' + l + 'Width'] === s.borderTopWidth && s['border' + l + 'Color'] === s.borderTopColor);
            const simples = s.backgroundImage === 'none' && s.boxShadow === 'none' && uni && (bw === 0 || bordaUni) && alfaCor(s.backgroundColor) > 0.999;
            const eli = /%/.test(s.borderTopLeftRadius) ? parseFloat(s.borderTopLeftRadius) >= 50 : raio >= Math.min(o.w, o.h) / 2 && o.w === o.h;
            o.forma = simples ? { t: eli ? 'eli' : 'ret', w: o.w, h: o.h, cor: transparente(s.backgroundColor) ? '#000000' : hex(s.backgroundColor),
                pOn: !transparente(s.backgroundColor), cOn: bw > 0, cCor: hex(s.borderTopColor), cLarg: bw,
                // o editor mede o arredondamento em % de metade do menor lado, no meio do contorno
                raio: eli ? 0 : Math.min(100, Math.round(Math.max(0, raio - bw / 2) / (Math.min(o.w, o.h) / 2) * 1000) / 10) } : null;
            if (!simples) o.raster = true;
        }
        if (/texto/.test(v)) {
            const spans = [...el.querySelectorAll('*')];
            const misto = spans.some(c => { const z = getComputedStyle(c); return z.color !== s.color || z.fontWeight !== s.fontWeight || z.fontFamily !== s.fontFamily || z.fontSize !== s.fontSize || z.fontStyle !== s.fontStyle; });
            const fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
            const tam = px(s.fontSize), lh = s.lineHeight === 'normal' ? null : px(s.lineHeight);
            cvm.font = fonteCanvas(s);
            cvm.letterSpacing = s.letterSpacing === 'normal' ? '0px' : s.letterSpacing;
            const mt = cvm.measureText('Hg'), asc = mt.fontBoundingBoxAscent, desc = mt.fontBoundingBoxDescent;
            const linhas = linhasReais(el);
            const lhR = lh || (asc + desc);
            const larg = Math.max(...linhas.map(l => cvm.measureText(l).width));
            const peso = parseInt(s.fontWeight) || 400;
            const alin = /center/.test(s.textAlign) ? 'center' : /right|end/.test(s.textAlign) ? 'right' : 'left';
            const pl = px(s.paddingLeft), pt = px(s.paddingTop), pr = px(s.paddingRight), bl = px(s.borderLeftWidth), bt = px(s.borderTopWidth);
            const conteudoW = el.clientWidth - pl - pr;
            // o editor mede a largura pela linha mais longa; caixa (quebra) só quando o texto quebrou no CSS
            const quebrou = false;   // as quebras do navegador vão explícitas (linhasReais): o editor não precisa quebrar
            const ls = s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing);
            const sombra = s.textShadow !== 'none' ? s.textShadow.match(/(rgba?\([^)]+\)|#\w+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/) : null;
            o.texto = { t: linhas.join('\n'), fonte: fam, fam, peso, neg: peso >= 600, ita: s.fontStyle === 'italic', tam, cor: hex(s.color),
                alin, esp: tam ? ls / tam * 1000 : 0, ent: Math.round(lhR / tam * 1000) / 10, caixa: quebrou ? Math.round(conteudoW) : 0,
                sOn: !!sombra, ...(sombra ? { sCor: hex(sombra[1]), sOp: Math.round(alfaCor(sombra[1]) * 100), sDist: Math.hypot(+sombra[2], +sombra[3]),
                    sAng: (Math.atan2(+sombra[3], -sombra[2]) * 180 / Math.PI + 360) % 360, sBlur: +sombra[4] } : {}) };
            o.misto = misto;
            // ponto do texto no espaço do elemento: o editor põe o canvas com a 1ª linha de base em (m + asc) e o centro no meio
            const th = (linhas.length - 1) * (o.texto.ent / 100 * tam) + asc + desc;
            const tw = o.texto.caixa || Math.max(tam * 0.35, larg);
            const base1 = bt + pt + (lhR - (asc + desc)) / 2 + asc;     // linha de base da 1ª linha no CSS
            const cx = alin === 'center' ? bl + pl + conteudoW / 2 : alin === 'right' ? bl + pl + conteudoW - tw / 2 : bl + pl + tw / 2;
            o.ancora = { x: cx, y: base1 - asc + th / 2 };
            const mg = Math.ceil((o.texto.sOn ? o.texto.sDist + o.texto.sBlur * 1.5 : 0) + 4);
            o.cw = Math.ceil(tw + 2 * mg); o.ch = Math.ceil(th + 2 * mg);
        }
        if (v === 'img' && el.tagName === 'IMG') o.src = decodeURIComponent(el.src.replace(/^file:\/\/\/?/, ''));
        else if (v === 'img') o.raster = true;
        return o;
    };

    // recortes que valem para a camada: pai com overflow escondido e clip-path (inset/polygon) nela ou nos pais.
    // Cada um vira um polígono no espaço da PRÓPRIA camada (px do elemento) → máscara nativa no editor
    const recortes = el => {
        const out = [];
        for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
            const s = getComputedStyle(e);
            if (e !== el && /hidden|clip/.test(s.overflow + s.overflowX + s.overflowY))
                out.push({ e, pts: [e.clientLeft, e.clientTop, e.clientLeft + e.clientWidth, e.clientTop, e.clientLeft + e.clientWidth, e.clientTop + e.clientHeight, e.clientLeft, e.clientTop + e.clientHeight] });
            const cp = s.clipPath;
            if (cp && cp !== 'none') {
                const w = e.offsetWidth, h = e.offsetHeight, v = (x, ref) => /%/.test(x) ? parseFloat(x) / 100 * ref : px(x);
                let m = cp.match(/inset\(([^)]+)\)/);
                if (m) {
                    const p = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
                    const [t, r, b, l] = [p[0], p[1] ?? p[0], p[2] ?? p[0], p[3] ?? p[1] ?? p[0]];
                    const x0 = v(l, w), y0 = v(t, h), x1 = w - v(r, w), y1 = h - v(b, h);
                    out.push({ e, pts: [x0, y0, x1, y0, x1, y1, x0, y1] });
                } else if ((m = cp.match(/polygon\(([^)]+)\)/))) {
                    out.push({ e, pts: m[1].split(',').flatMap(par => { const [a, b] = par.trim().split(/\s+/); return [v(a, w), v(b, h)]; }) });
                } else out.push({ e, pts: null, aviso: 'clip-path ' + cp.split('(')[0] + ' ainda não vira máscara' });
            }
        }
        return out;
    };
    // pontos no espaço do elemento e → espaço da camada el
    const paraCamada = (Mel, e, pts) => {
        const Me = matriz(e), inv = Mel.inverse(), out = [];
        for (let k = 0; k < pts.length; k += 2) { const q = inv.transformPoint(Me.transformPoint(new DOMPoint(pts[k], pts[k + 1]))); out.push(q.x, q.y); }
        return out;
    };

    // leitura de um instante: por camada [cx, cy, ax, ay, escala, escalaY, rotação, opacidade, desfoque, largura, altura, [máscaras]]
    // (c = centro da caixa; a = ponto do texto, onde o editor centra o canvas do texto)
    KV.ler = () => KV.els.map((el, i) => {
        const M = matriz(el), d = KV._est[i], w = el.offsetWidth, h = el.offsetHeight;
        const c = M.transformPoint(new DOMPoint(w / 2, h / 2));
        const a = d.ancora ? M.transformPoint(new DOMPoint(d.ancora.x, d.ancora.y)) : c;
        const sx = Math.hypot(M.a, M.b), sy = Math.hypot(M.c, M.d) * Math.sign(M.a * M.d - M.b * M.c || 1);
        const rot = Math.atan2(M.b, M.a) * 180 / Math.PI;
        const mk = recortes(el).filter(r => r.pts).map(r => r.e === el ? r.pts : paraCamada(M, r.e, r.pts));
        return [c.x, c.y, a.x, a.y, sx * 100, sy * 100, rot, opacidade(el) * 100, desfoque(el), w, h, mk];
    });
    KV.iniciar = () => { KV.pausar(); KV.ir(0); KV._est = KV.camadas();
        KV._est.forEach((d, i) => { const el = KV.els[i]; d.chaves = KV.chaves(el);
            for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) d.chaves.push(...KV.chaves(e));
            d.avisos = recortes(el).filter(r => r.aviso).map(r => r.aviso); });
        return KV._est; };

    // camada que não dá para refazer com as ferramentas (degradê, sombra de caixa, svg, texto misto): vira imagem
    // isolada, sem transformação nem opacidade (o movimento continua nativo)
    KV.isolar = i => {
        const el = KV.els[i];
        const st = document.createElement('style'); st.id = 'kv-isolar';
        st.textContent = `html,body{background:transparent!important} body *{visibility:hidden!important}
            [data-kv-iso], [data-kv-iso] *{visibility:visible!important}
            [data-kv-iso]{position:fixed!important;left:0!important;top:0!important;margin:0!important;transform:none!important;
            translate:none!important;rotate:none!important;scale:none!important;opacity:1!important;filter:none!important}`;
        document.head.append(st);
        el.setAttribute('data-kv-iso', '');
        // camadas filhas próprias não entram na imagem
        KV.els.forEach((o, j) => { if (j !== i && el.contains(o)) o.style.setProperty('visibility', 'hidden', 'important'); });
        // os pais podem ter transformação/opacidade: o fixed sai do contexto só se nenhum pai tiver transform
        const pais = []; for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) pais.push(e);
        pais.forEach(e => { e.dataset.kvT = e.style.cssText; e.style.setProperty('transform', 'none', 'important'); e.style.setProperty('opacity', '1', 'important');
            e.style.setProperty('filter', 'none', 'important'); e.style.setProperty('translate', 'none', 'important'); e.style.setProperty('scale', 'none', 'important'); e.style.setProperty('rotate', 'none', 'important'); });
        return { w: el.offsetWidth, h: el.offsetHeight };
    };
    KV.soltar = i => {
        const el = KV.els[i];
        document.getElementById('kv-isolar')?.remove();
        el.removeAttribute('data-kv-iso');
        KV.els.forEach((o, j) => { if (j !== i && el.contains(o)) o.style.removeProperty('visibility'); });
        for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) if (e.dataset.kvT != null) { e.style.cssText = e.dataset.kvT; delete e.dataset.kvT; }
    };
    KV.fundo = () => { const s = getComputedStyle(document.body), h = getComputedStyle(document.documentElement);
        const c = !transparente(s.backgroundColor) ? s.backgroundColor : h.backgroundColor; return transparente(c) ? null : hex(c); };
})();
