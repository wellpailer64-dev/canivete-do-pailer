// =========================================================
// Photo Kanivete — CENA: diagramar escrevendo HTML/CSS (KNV.cena). O navegador diagrama (flex, grid, quebra de
// linha, margens) numa área escondida e cada elemento vira camada nativa: texto editável, caixas desenhadas pelo
// próprio navegador, imagens (corte do object-fit vira máscara), SVG, sombras/traçados como efeitos de camada, grupos.
// Rodar de novo atualiza pela chave (id/data-nome + caminho); camada mexida depois (digital/assinatura mudou) fica como está.
// Plano e limites: Instructions/agente/plano-cena.md. Sem const de nível superior: a recarga do runner só troca funções.
// =========================================================

function ieCenaFormatos() {
    return { quadrado: [1080, 1080], feed: [1080, 1350], retrato: [1080, 1440], story: [1080, 1920], paisagem: [1920, 1080], a4: [2480, 3508] };
}

async function ieCena(html, o = {}) {
    const t0 = performance.now();
    await ieCarregarFontes();
    let doc = IE.doc;
    const novo = !doc || o.novo === true || (!doc.cena && o.novo !== false);
    const ant = !novo && doc.cena ? doc.cena : {};
    const fm = ieCenaFormatos()[o.formato || ant.formato] || null;
    // carrossel: cada <section class="slide"> (ou [data-slide]) é um slide; o documento é a tira inteira, lado a lado
    const nSlides = new DOMParser().parseFromString(String(html), 'text/html').querySelectorAll('.slide, [data-slide]').length;
    const sw = o.w || (fm ? fm[0] : ant.slide ? ant.slide.w : (!novo ? doc.w : 1080));
    const sh = o.h || (fm ? fm[1] : ant.slide ? ant.slide.h : (!novo ? doc.h : 1350));
    const avisos = [];
    if (novo) {
        if (typeof switchTool === 'function' && !document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem');
        doc = ieNovoDoc2(o.nome || (nSlides ? 'Carrossel' : 'Cena'), sw * Math.max(1, nSlides), sh, 72, 'transp');
        doc.camadas = [];   // a camada vazia sai: o fundo vem do HTML
    } else if (doc.w !== sw * Math.max(1, nSlides) || doc.h !== sh) avisos.push(`documento é ${doc.w}x${doc.h}, a cena pede ${sw * Math.max(1, nSlides)}x${sh}${nSlides ? ` (${nSlides} slides)` : ''}: monte com novo: true`);
    const W = doc.w, H = doc.h;
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:${-W - 40000}px;top:0;width:${W}px;height:${H}px;overflow:hidden;pointer-events:none;`;
    document.body.appendChild(host);
    const ctx = { doc, W, H, o, avisos, chaves: new Map(), blocos: [], mantidas: [], n: 0, slide: nSlides ? { w: sw, h: sh, n: nSlides } : null };
    try {
        const raiz = ieCenaMontarDom(host, String(html), W, H, ctx.slide);
        await ieCenaImagensPre(raiz, ctx);
        await ieCenaFontesPre(raiz, ctx);
        ieCenaTransformsPre(raiz);
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(r));
        ctx.rr = raiz.getBoundingClientRect();
        IE._cenaMontando = true;
        const itens = await ieCenaVisitar(raiz, ctx, { chave: '', caminho: '', M: null, raiz: true });
        for (const L of ieTodasDe(itens)) { ieCenaMarcar(L); ctx.n++; }
        doc.camadas = novo ? itens : ieCenaJuntar(doc.camadas, itens, ctx);
        ieCenaChecar(raiz, ctx);
    } finally {
        IE._cenaMontando = false;
        host.remove();
    }
    doc.cena = { html: String(html), base: o.base || ant.base || null, formato: o.formato || ant.formato || null, margem: o.margem ?? ant.margem ?? null, slide: ctx.slide };
    if (ctx.slide) ieCenaEmendas(doc, ctx.slide);
    const topo = doc.camadas[doc.camadas.length - 1];
    if (topo) { doc.ativa = topo.id; doc.selIds = [topo.id]; }
    ieHist('Cena', doc);
    ieUiCamadas();
    ieAgendar(ieRDoc(doc), doc);
    return { w: W, h: H, slides: nSlides || undefined, camadas: ctx.n, mantidas: ctx.mantidas, avisos, ms: Math.round(performance.now() - t0) };
}
// carrossel: guias nas emendas e uma fatia por slide (Arquivo > Exportar fatias também serve), sem tocar nas do usuário
function ieCenaEmendas(doc, S) {
    doc.guias = (doc.guias || []).filter(g => !g.cena);
    for (let i = 1; i < S.n; i++) doc.guias.push({ o: 'v', p: i * S.w, cena: true });
    doc.fatias = (doc.fatias || []).filter(f => !f.cena && !(f.y === 0 && f.w === S.w && f.h === S.h && f.x % S.w === 0 && /^\d\d$/.test(f.nome)));   // .iknv não guarda o 'cena' da fatia
    doc.seqFatia = doc.seqFatia || 0;
    for (let i = 0; i < S.n; i++) doc.fatias.push({ id: ++doc.seqFatia, x: i * S.w, y: 0, w: S.w, h: S.h, nome: String(i + 1).padStart(2, '0'), url: '', alt: '', cena: true });
}
// componentes prontos (classes k-*, especificidade zero: o CSS da peça sempre ganha). Cores e fonte vêm do kit de
// marca (--cor-primaria, --cor-texto, --cor-fundo, --cor-suave, --fonte) com padrão neutro
function ieCenaComponentesCss() {
    const P = 'var(--cor-primaria,#ff5e3a)', T = 'var(--cor-texto,#111)', F = 'var(--cor-fundo,#fff)', S = 'var(--cor-suave,#888)';
    return `:where(.k-num){font-size:26px;font-weight:600;letter-spacing:4px;color:${S}}
        :where(.k-arraste){position:absolute;right:80px;bottom:72px;display:flex;align-items:center;gap:12px;font-size:30px;font-weight:600;color:${P}}
        :where(.k-arraste) svg{width:40px;height:40px}
        :where(.k-tag){align-self:flex-start;display:inline-block;padding:10px 24px;border-radius:999px;background:${P};color:${F};font-size:26px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
        :where(.k-selo){position:absolute;width:200px;height:200px;border-radius:50%;background:${P};color:${F};display:flex;align-items:center;justify-content:center;text-align:center;font-size:34px;font-weight:800;line-height:1;rotate:12deg}
        :where(.k-card){background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.16);border-radius:32px;padding:40px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
        :where(.k-cta){align-self:flex-start;background:${P};color:${F};font-size:44px;font-weight:800;padding:28px 48px;border-radius:20px}
        :where(.k-citacao){font-size:56px;line-height:1.25;font-weight:600;color:${T}}
        :where(.k-aspas){display:block;font-size:200px;line-height:.7;height:110px;color:${P};font-family:Georgia,serif}
        :where(.k-autor){font-size:30px;color:${S};margin-top:24px}
        :where(.k-lista){display:flex;flex-direction:column;gap:24px;padding:0;margin:0}
        :where(.k-lista>li){display:flex;gap:20px;align-items:baseline;font-size:36px;line-height:1.35}
        :where(.k-marcador){flex:0 0 auto;color:${P};font-weight:800}
        :where(.k-grande){font-size:300px;font-weight:900;line-height:.9;color:${P}}`;
}
// preenche os automáticos: k-num vazio = "01 / 05"; k-arraste vazio = "arraste →" (some no último slide);
// k-citacao ganha as aspas; marcadores de lista viram elementos (o ::marker do navegador não vira camada)
function ieCenaComponentes(raiz, S) {
    const slides = [...raiz.querySelectorAll('.slide, [data-slide]')];
    const idx = el => { const s = el.closest('.slide, [data-slide]'); return s ? slides.indexOf(s) : 0; };
    const n = Math.max(1, slides.length), pad = v => String(v).padStart(2, '0');
    for (const el of raiz.querySelectorAll('.k-num')) if (!el.textContent.trim()) el.textContent = `${pad(idx(el) + 1)} / ${pad(n)}`;
    for (const el of raiz.querySelectorAll('.k-arraste')) {
        if (S && idx(el) === n - 1 && !el.hasAttribute('data-sempre')) { el.remove(); continue; }
        if (!el.innerHTML.trim()) el.innerHTML = 'arraste <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    }
    for (const el of raiz.querySelectorAll('.k-citacao')) if (el.setAttribute('data-juntos', ''), !el.querySelector('.k-aspas')) el.insertAdjacentHTML('afterbegin', '<span class="k-aspas">\u201C</span>');
    for (const li of raiz.querySelectorAll('li')) {
        if (li.querySelector(':scope > .k-marcador')) continue;
        const lista = li.parentElement, cs = getComputedStyle(li);
        if (cs.listStyleType === 'none' && !lista.classList.contains('k-lista')) continue;
        const ol = lista.tagName === 'OL', i = [...lista.children].indexOf(li) + 1;
        const corpo = document.createElement('span');
        corpo.append(...li.childNodes);
        li.append(Object.assign(document.createElement('span'), { className: 'k-marcador', textContent: ol ? pad(i) : lista.dataset.marcador || '\u2022' }), corpo);
        li.style.listStyle = 'none';
        if (!lista.classList.contains('k-lista')) { li.style.display = 'flex'; li.style.gap = '0.5em'; lista.style.paddingLeft = lista.style.paddingLeft || '0'; }
    }
}
// kit de marca: variáveis CSS que toda cena enxerga (var(--cor-primaria), var(--fonte-titulo)...), guardadas no app
function ieCenaMarcaCss() {
    const m = iePref('marca', null);
    if (!m || typeof m !== 'object') return '';
    return Object.entries(m).filter(([k]) => /^[\w-]+$/.test(k)).map(([k, v]) => `--${k}:${String(v).replace(/[;{}<]/g, '')}`).join(';');
}
function ieTodasDe(lista) { const out = []; iePercorrer(lista, L => { out.push(L); }); return out; }

// HTML do agente dentro de um Shadow DOM (estilos isolados do app; as fontes do editor valem lá dentro).
// body/html/:root do CSS viram a raiz da peça; margens padrão zeradas com :where (o CSS do agente sempre ganha)
function ieCenaMontarDom(host, html, W, H, S) {
    const P = new DOMParser().parseFromString(html, 'text/html');
    const css = [...P.querySelectorAll('style')].map(s => s.textContent).join('\n')
        .replace(/(^|[\s,}>~+(])(:root|html|body)(?=[\s,{.:#\[>~+)]|$)/g, '$1.knv-raiz');
    P.querySelectorAll('style,script,link,meta,title').forEach(x => x.remove());
    const sh = host.attachShadow({ mode: 'open' });
    const vars = [ieCenaMarcaCss(), S ? `--slide:${S.w}px;--slides:${S.n}` : `--slide:${W}px;--slides:1`].filter(Boolean).join(';');
    sh.innerHTML = `<style>.knv-raiz{${vars}}:where(.knv-raiz){font-family:Arial;font-size:32px;line-height:1.2;color:#000}
        :where(.knv-raiz) *,:where(.knv-raiz) *::before,:where(.knv-raiz) *::after{box-sizing:border-box}
        :where(.knv-raiz) :where(h1,h2,h3,h4,h5,h6,p,ul,ol,figure,blockquote,dl,dd){margin:0}
        :where(.knv-raiz) img,:where(.knv-raiz) svg{display:block}${ieCenaComponentesCss()}</style><style>${css}</style><div class="knv-raiz"></div>`;
    const raiz = sh.querySelector('.knv-raiz');
    if (P.body.className) raiz.className += ' ' + P.body.className;
    raiz.style.cssText = (P.body.getAttribute('style') || '') + `;position:relative;width:${W}px;height:${H}px;overflow:hidden;margin:0;box-sizing:border-box`;
    raiz.append(...[...P.body.childNodes].map(n => document.importNode(n, true)));
    if (S) {   // slides lado a lado, cada um do tamanho do formato; o que não é slide fica solto por cima da tira inteira
        Object.assign(raiz.style, { display: 'flex', flexDirection: 'row', alignItems: 'stretch', padding: '0', gap: '0' });
        [...raiz.querySelectorAll('.slide, [data-slide]')].forEach((el, i) => {
            el.style.cssText += `;flex:0 0 ${S.w}px;width:${S.w}px;height:${S.h}px;position:relative;margin:0`;
            if (!el.id && !el.dataset.nome) el.dataset.nome = 'Slide ' + (i + 1);
        });
    }
    ieCenaComponentes(raiz, S);
    return raiz;
}

// ─────────────────────────── imagens ───────────────────────────
function ieCenaCaminho(src, base) {
    let s = decodeURIComponent(String(src).replace(/^file:\/+/i, ''));
    if (/^[a-z]:[\\/]/i.test(s) || /^[\\/]{2}/.test(s)) return s;
    return base ? String(base).replace(/[\\/]+$/, '') + '/' + s.replace(/^\.\//, '') : s;
}
async function ieCenaImagem(path) {
    IE._cenaImgs = IE._cenaImgs || new Map();
    if (IE._cenaImgs.has(path)) return IE._cenaImgs.get(path);
    const api = ieApi();
    const r = await api.ie_abrir(path);
    if (!r || !r.success) throw new Error((r && r.error) || 'não abriu');
    let c = null;
    try {
        if (r.achatado) c = await ieImagemDeUrl(r.achatado);
        else if (r.camadas && r.camadas[0] && r.camadas[0].url) c = await ieImagemDeUrl(r.camadas[0].url);
    } finally { api.ie_fechar(r.doc); }
    if (!c) throw new Error('sem pixels');
    IE._cenaImgs.set(path, c);
    return c;
}
function ieCenaMarcador(im, w, h) {
    im.removeAttribute('srcset');
    im.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(w))}" height="${Math.max(1, Math.round(h))}"/>`);
    return im.decode().catch(() => {});
}
// troca cada <img> por um marcador do mesmo tamanho (a diagramação usa a proporção real; os pixels vêm do disco)
async function ieCenaImagensPre(raiz, ctx) {
    for (const im of raiz.querySelectorAll('img')) {
        const src = (im.getAttribute('src') || '').trim();
        if (/^gerar:/i.test(src)) {
            const pr = String(im.dataset.proporcao || '1:1').split(/[:x/]/).map(Number);
            im._knv = { gerar: src.slice(6).trim() };
            await ieCenaMarcador(im, (pr[0] || 1) * 1000, (pr[1] || 1) * 1000);
            continue;
        }
        const path = ieCenaCaminho(src, ctx.o.base);
        try {
            const c = await ieCenaImagem(path);
            im._knv = { c, path };
            await ieCenaMarcador(im, c.width, c.height);
        } catch (e) {
            ctx.avisos.push(`imagem não abriu: ${src} (${e.message || e})`);
            im._knv = { falta: true };
            await ieCenaMarcador(im, 1, 1);
        }
    }
}

// ─────────────────────────── fontes ───────────────────────────
// a família do CSS → a do editor (instalada); peso/itálico → o estilo mais perto. Lê tudo antes de escrever (os
// filhos herdariam o apelido da fonte do pai)
function ieCenaFonte(cs) {
    const est = IE.estilos || {}, low = new Map(Object.keys(est).map(k => [k.toLowerCase(), k]));
    const generica = { 'sans-serif': 'arial', serif: 'times new roman', monospace: 'consolas', cursive: 'comic sans ms', 'system-ui': 'segoe ui' };
    const lista = cs.fontFamily.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''));
    let fam = null;
    for (const f of lista) { const k = low.get(f.toLowerCase()) || low.get(generica[f.toLowerCase()] || ''); if (k) { fam = k; break; } }
    const faltou = !fam || fam.toLowerCase() !== lista[0].toLowerCase() ? lista[0] : null;
    if (!fam) fam = low.get('arial') || Object.keys(est)[0];
    const peso = parseInt(cs.fontWeight, 10) || 400, ital = /italic|oblique/.test(cs.fontStyle);
    let e = null, melhor = 1e9;
    for (const x of est[fam] || []) {
        const d = Math.abs((x.peso || 400) - peso) + (!!(x.italico || x.gdi_italico) !== ital ? 1000 : 0);
        if (d < melhor) { melhor = d; e = x; }
    }
    return { fam, e, faltou: faltou && !/^(sans-serif|serif|monospace|system-ui)$/i.test(faltou) ? faltou : null, peso, ital };
}
async function ieCenaFontesPre(raiz, ctx) {
    const els = [raiz, ...raiz.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim()));
    const lidos = els.map(el => ({ el, cs: getComputedStyle(el), f: ieCenaFonte(getComputedStyle(el)) }));
    const faltas = new Set();
    for (const { el, f } of lidos) {
        const t = { tam: 10 };
        ieAplicarEstiloFonte(t, f.fam, f.e);
        if (f.peso >= 600 && (t.peso || 400) < 600) { t.neg = true; t.negFalso = true; }
        if (f.ital && !t.ital) { t.ital = true; t.itaFalso = true; }
        await ieGarantirFonte(t);
        if (f.faltou) faltas.add(`${f.faltou} → ${f.fam}`);
        el._knvFonte = t;
    }
    for (const { el } of lidos) {
        const t = el._knvFonte, ok = t.css && IE.fontesOk.has(t.css);
        el.style.fontFamily = ok ? `"${t.css}"` : `"${t.gdi || t.fam}"`;
        el.style.fontWeight = ok ? (t.negFalso ? '700' : '400') : (t.neg ? '700' : String(t.peso || 400));
        el.style.fontStyle = (ok ? t.itaFalso : t.ital) ? 'italic' : 'normal';
        el.style.fontSynthesis = ok && !t.negFalso && !t.itaFalso ? 'none' : 'weight style';
    }
    for (const f of faltas) ctx.avisos.push(`fonte não instalada: ${f} (KNV.fontes('nome') lista as que existem)`);
}

// ─────────────────────────── transformações ───────────────────────────
// guarda transform/rotate/scale/translate de cada elemento e desliga: mede tudo sem giro e aplica a matriz depois
function ieCenaTransformsPre(raiz) {
    const lista = [];
    for (const el of [raiz, ...raiz.querySelectorAll('*')]) {
        const cs = getComputedStyle(el);
        const v = { tr: cs.transform, ro: cs.rotate, sc: cs.scale, tl: cs.translate, orig: cs.transformOrigin };
        if ([v.tr, v.ro, v.sc, v.tl].some(x => x && x !== 'none')) lista.push([el, v]);
    }
    for (const [el, v] of lista) {
        el._knvT = v;
        for (const p of ['transform', 'rotate', 'scale', 'translate']) el.style.setProperty(p, 'none', 'important');
    }
}
function ieCenaRet(el, ctx) {
    const r = el.getBoundingClientRect();
    return { x: r.left - ctx.rr.left, y: r.top - ctx.rr.top, w: r.width, h: r.height };
}
function ieCenaMatriz(el, ctx) {
    const v = el._knvT, r = ieCenaRet(el, ctx);
    const [ox, oy] = String(v.orig || '').split(' ').map(parseFloat);
    let M = new DOMMatrix();
    if (v.tl && v.tl !== 'none') { const [a, b] = v.tl.split(' ').map(parseFloat); M = M.translate(a || 0, b || 0); }
    if (v.ro && v.ro !== 'none') { const g = /(-?[\d.]+)deg/.exec(v.ro); if (g) M = M.rotate(+g[1]); }
    if (v.sc && v.sc !== 'none') { const [a, b] = v.sc.split(' ').map(parseFloat); M = M.scale(a, b ?? a); }
    if (v.tr && v.tr !== 'none') M = M.multiply(new DOMMatrix(v.tr));
    const cx = r.x + (ox || 0), cy = r.y + (oy || 0);
    const F = new DOMMatrix().translate(cx, cy).multiply(M).translate(-cx, -cy);
    return [F.a, F.b, F.c, F.d, F.e, F.f];
}

// ─────────────────────────── árvore → camadas ───────────────────────────
function ieCenaChave(ctx, k) { const n = (ctx.chaves.get(k) || 0) + 1; ctx.chaves.set(k, n); return n > 1 ? k + '#' + n : k; }
function ieCenaCamada(ctx, h, sufixo, p) {
    const L = ieNovaCamada(ctx.doc, { sujoPx: true, ...p });
    L.cena = { k: ieCenaChave(ctx, h.chave + '|' + h.caminho + sufixo) };
    return L;
}
function ieCenaZ(n) {
    if (n.nodeType !== 1) return 0;
    const cs = getComputedStyle(n), pos = cs.position !== 'static', z = parseInt(cs.zIndex, 10);
    return Number.isFinite(z) && z < 0 ? z - 0.5 : pos ? 0.5 + (Number.isFinite(z) ? z : 0) : 0;
}
async function ieCenaVisitar(el, ctx, h) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return [];
    const nome = h.raiz ? '' : (el.dataset.nome || el.id || '');
    const M = el._knvT ? (h.M ? ieMatMul(h.M, ieCenaMatriz(el, ctx)) : ieCenaMatriz(el, ctx)) : h.M;
    const me = { ...h, M, chave: nome ? (h.chave ? h.chave + '/' : '') + nome : h.chave, caminho: nome ? '' : h.caminho, raiz: false };
    const itens = [];
    for (const ps of ['::before', '::after']) {
        const c = getComputedStyle(el, ps).content;
        if (c && c !== 'none' && c !== 'normal') ctx.avisos.push(`${ps} em <${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}> não entra: use um elemento`);
    }
    if (/url\(/.test(cs.backgroundImage)) ctx.avisos.push(`background-image url() não entra (use <img>): ${nome || el.tagName.toLowerCase()}`);
    for (const p of ['filter', 'backdropFilter', 'clipPath']) if (cs[p] && cs[p] !== 'none') ctx.avisos.push(`${p} não entra: ${nome || el.tagName.toLowerCase()}`);
    const tag = el.tagName;
    if (tag === 'svg' || tag === 'SVG') {
        const L = await ieCenaSvgCamada(el, cs, ctx, me);
        if (L) itens.push(L);
    } else {
        const caixa = await ieCenaCaixa(el, cs, ctx, me, h.raiz);
        if (caixa) itens.push(...[].concat(caixa));
        if (tag === 'IMG') { const L = await ieCenaImg(el, cs, ctx, me); if (L) itens.push(L); }
        else {
            const nos = [...el.childNodes];
            const soTexto = cs.display !== 'inline' && nos.every(n => n.nodeType === 3 || n.nodeType === 8 || n.tagName === 'BR') && nos.some(n => n.nodeType === 3 && n.data.trim());
            if (soTexto) { const L = ieCenaTextoBloco(el, cs, nos, ctx, me); if (L) itens.push(L); }
            else {
                const ordem = nos.map((n, i) => ({ n, i, z: ieCenaZ(n) })).sort((a, b) => a.z - b.z || a.i - b.i);
                let ie = 0;
                for (const { n } of ordem) {
                    if (n.nodeType === 3 && n.data.trim()) itens.push(...ieCenaTextoSolto(n, el, cs, ctx, me));
                    else if (n.nodeType === 1) {
                        const sub = { ...me, caminho: me.caminho + '/' + n.tagName.toLowerCase() + (ie++) };
                        itens.push(...await ieCenaVisitar(n, ctx, sub));
                    }
                }
            }
        }
    }
    const op = parseFloat(cs.opacity), bmCss = cs.mixBlendMode;
    const bm = bmCss && bmCss !== 'normal' ? (IE_BM.find(b => b && b[2] === bmCss && !b[3]) || [])[0] : null;
    if (nome && itens.length > 1) {
        const G = ieNovaCamada(ctx.doc, { tipo: 'grupo', nome, filhos: itens, op: op < 1 ? op : 1, bm: bm || 'PASS_THROUGH', aberto: false });
        G.cena = { k: ieCenaChave(ctx, me.chave + '|g') };
        return [G];
    }
    if (nome && itens.length === 1 && itens[0].tipo !== 'grupo') itens[0].nome = nome;
    for (const L of itens) { if (op < 1) L.op *= op; if (bm && L.bm === 'NORMAL') L.bm = bm; }
    return itens;
}

// ─────────────────────────── cores e sombras ───────────────────────────
function ieCenaCor(s) {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return { hex: '#000000', a: s && s !== 'transparent' ? 1 : 0 };
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    const hx = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    return { hex: '#' + hx(p[0]) + hx(p[1]) + hx(p[2]), a: p.length > 3 ? p[3] : 1 };
}
// "rgba(0, 0, 0, 0.3) 0px 10px 30px 0px, ... inset" → [{cor, a, x, y, blur, spread, inset}]
function ieCenaSombras(s) {
    if (!s || s === 'none') return [];
    const partes = [];
    let nv = 0, ini = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') nv++; else if (s[i] === ')') nv--;
        else if (s[i] === ',' && !nv) { partes.push(s.slice(ini, i)); ini = i + 1; }
    }
    partes.push(s.slice(ini));
    return partes.map(p => {
        const cor = ieCenaCor((/rgba?\([^)]*\)/.exec(p) || ['rgb(0,0,0)'])[0]);
        const n = (p.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
        return { cor: cor.hex, a: cor.a, x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0, inset: /inset/.test(p) };
    }).filter(x => x.a > 0);
}
// sombras do CSS → Sombra projetada / Sombra interna do editor (sigma = blur/2, como no CSS)
function ieCenaFxSombras(L, lista, k = 1) {
    for (const s of lista) {
        const tipo = s.inset ? 'sombraInt' : 'sombra', dist = Math.hypot(s.x, s.y) * k;
        const tam = (s.blur + Math.max(0, s.spread)) * k;
        const e = { ...ieFxNovo(tipo), bm: 'NORMAL', cor: s.cor, op: Math.round(s.a * 100), dist, tam, global: false,
            ang: dist ? Math.atan2(s.y, -s.x) * 180 / Math.PI : 90 };
        if (tipo === 'sombra') e.spread = tam ? Math.round(Math.max(0, s.spread) * k / tam * 100) : 0;
        L.fx = L.fx || {};
        (L.fx[tipo] = L.fx[tipo] || []).push(e);
    }
}

// ─────────────────────────── caixas (fundo, borda, canto, degradê) ───────────────────────────
function ieCenaTemCaixa(cs) {
    if (ieCenaCor(cs.backgroundColor).a > 0) return true;
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some(l => parseFloat(cs['border' + l + 'Width']) > 0 && !/none|hidden/.test(cs['border' + l + 'Style']) && ieCenaCor(cs['border' + l + 'Color']).a > 0);
}
function ieCenaPropsCaixa() {
    return ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-origin', 'background-clip',
    ...['top', 'right', 'bottom', 'left'].flatMap(l => [`border-${l}-width`, `border-${l}-style`, `border-${l}-color`]),
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
}
async function ieCenaSvgCanvas(svg, w, h) {
    const im = new Image();
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await im.decode();
    const c = ieCanvas(w, h);
    ieCtx(c).drawImage(im, 0, 0, w, h);
    return c;
}
// plano {c, x, y} do documento: com a matriz do elemento (giro/escala), vira o plano já transformado
function ieCenaPlano(c, x, y, M) {
    if (!M) return { c, x, y };
    return ieTransformarPlano({ c, x, y }, M) || { c, x, y };
}
async function ieCenaCaixa(el, cs, ctx, h, ehRaiz) {
    if (!ieCenaTemCaixa(cs)) return null;
    const r = ieCenaRet(el, ctx);
    if (r.w < 0.5 || r.h < 0.5) return null;
    let estilo = ieCenaPropsCaixa().map(p => {
        let v = cs.getPropertyValue(p);
        if (p === 'background-image') v = /url\(/.test(v) ? v.split(/,(?![^(]*\))/).filter(x => !/url\(/.test(x)).join(',') || 'none' : v;
        return `${p}:${v}`;
    }).join(';');
    estilo = estilo.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const x0 = Math.floor(r.x), y0 = Math.floor(r.y), fx = r.x - x0, fy = r.y - y0;
    const w = Math.ceil(r.w + fx), hh = Math.ceil(r.h + fy);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}"><foreignObject x="0" y="0" width="${w}" height="${hh}">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;left:${fx}px;top:${fy}px;width:${r.w}px;height:${r.h}px;box-sizing:border-box;margin:0;${estilo}"></div></foreignObject></svg>`;
    const c = await ieCenaSvgCanvas(svg, w, hh);
    const P = ieCenaPlano(c, x0, y0, h.M);
    const nome = ehRaiz ? 'Fundo' : (el.dataset.nome || el.id ? (el.dataset.nome || el.id) + (el.tagName === 'IMG' ? ' (caixa)' : '') : ieCenaNomeEl(el, 'Caixa'));
    const L = ieCenaCamada(ctx, h, ehRaiz ? 'fundo' : ':caixa', { nome, c: P.c, x: P.x, y: P.y });
    if (ehRaiz) L.fundo = true;
    const sombras = ieCenaSombras(cs.boxShadow);
    if (!sombras.length) return L;
    if (ieCenaOpaca(c)) { ieCenaFxSombras(L, sombras, h.M ? Math.sqrt(Math.abs(h.M[0] * h.M[3] - h.M[1] * h.M[2])) : 1); return L; }
    const mg = Math.ceil(Math.max(...sombras.map(q => q.blur + Math.abs(q.spread) + Math.max(Math.abs(q.x), Math.abs(q.y)))) + 2);
    const raios = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'].map(p => `${p}:${cs.getPropertyValue(p)}`).join(';');
    const sv = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + mg * 2}" height="${hh + mg * 2}"><foreignObject x="0" y="0" width="${w + mg * 2}" height="${hh + mg * 2}">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;left:${fx + mg}px;top:${fy + mg}px;width:${r.w}px;height:${r.h}px;margin:0;${raios};box-shadow:${cs.boxShadow.replace(/"/g, '&quot;')}"></div></foreignObject></svg>`;
    const cS = await ieCenaSvgCanvas(sv, w + mg * 2, hh + mg * 2), PS = ieCenaPlano(cS, x0 - mg, y0 - mg, h.M);
    return [ieCenaCamada(ctx, h, ':sombra', { nome: nome + ' (sombra)', c: PS.c, x: PS.x, y: PS.y }), L];
}
// a caixa cobre o próprio retângulo sem transparência? (amostra; canto arredondado conta como opaco no miolo)
function ieCenaOpaca(c) {
    const w = c.width, h = c.height, d = ieCtx(c).getImageData(0, 0, w, h).data;
    let n = 0, ok = 0;
    for (let y = h * 0.2; y < h * 0.8; y += Math.max(1, h / 12)) for (let x = w * 0.2; x < w * 0.8; x += Math.max(1, w / 12)) { n++; if (d[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] > 240) ok++; }
    return ok >= n * 0.9;
}
function ieCenaNomeEl(el, padrao) {
    const cl = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
    return cl ? padrao + ' ' + cl : padrao;
}

// <svg> no meio do HTML (ícone, seta, forma): desenhado como está, com currentColor = a cor do texto
async function ieCenaSvgCamada(el, cs, ctx, h) {
    const r = ieCenaRet(el, ctx);
    if (r.w < 0.5 || r.h < 0.5) return null;
    const cl = el.cloneNode(true);
    cl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    cl.setAttribute('width', r.w); cl.setAttribute('height', r.h);
    cl.style.color = cs.color;
    const fonte = new XMLSerializer().serializeToString(cl).replace(/currentColor/g, ieCenaCor(cs.color).hex);
    const x0 = Math.floor(r.x), y0 = Math.floor(r.y);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(r.w + r.x - x0)}" height="${Math.ceil(r.h + r.y - y0)}"><g transform="translate(${r.x - x0} ${r.y - y0})">${fonte}</g></svg>`;
    const c = await ieCenaSvgCanvas(svg, Math.ceil(r.w + r.x - x0), Math.ceil(r.h + r.y - y0));
    const P = ieCenaPlano(c, x0, y0, h.M);
    const L = ieCenaCamada(ctx, h, ':svg', { nome: el.dataset.nome || el.id || 'Ícone', c: P.c, x: P.x, y: P.y });
    return L;
}

// ─────────────────────────── imagens: object-fit, máscara do corte, gerar e recortar ───────────────────────────
function ieCenaConteudo(el, cs, ctx) {
    const r = ieCenaRet(el, ctx), n = p => parseFloat(cs[p]) || 0;
    const e = n('borderLeftWidth') + n('paddingLeft'), t = n('borderTopWidth') + n('paddingTop');
    return { x: r.x + e, y: r.y + t, w: r.w - e - n('borderRightWidth') - n('paddingRight'), h: r.h - t - n('borderBottomWidth') - n('paddingBottom'), r };
}
async function ieCenaImg(el, cs, ctx, h) {
    const k = el._knv;
    if (!k || k.falta) return null;
    const B = ieCenaConteudo(el, cs, ctx);
    if (B.w < 1 || B.h < 1) return null;
    let c = k.c, nome = el.dataset.nome || el.id || el.getAttribute('alt') || (k.path ? ieNomeArq(k.path) : 'Imagem');
    let gerada = null;
    if (k.gerar) {
        const lado = +el.dataset.lado || 1024, kk = lado / Math.max(B.w, B.h);
        const gw = Math.max(256, Math.round(B.w * kk / 64) * 64), gh = Math.max(256, Math.round(B.h * kk / 64) * 64);
        const semente = el.dataset.semente != null ? +el.dataset.semente : -1;
        if (semente < 0) ctx.avisos.push(`gerar sem data-semente (${k.gerar.slice(0, 40)}): fixe a semente para refazer igual e do cache`);
        const prompt = k.gerar + (el.dataset.fundo === 'branco' ? IE_GER_FUNDO : '');
        const chave = `gerar:${prompt}|${gw}x${gh}|${semente}`;
        IE._cenaImgs = IE._cenaImgs || new Map();
        if (semente >= 0 && IE._cenaImgs.has(chave)) c = IE._cenaImgs.get(chave);
        else {
            if (!(await ieGeradorPronto())) { ctx.avisos.push('gerador de imagem não instalado'); return null; }
            const r = await ieApi().ie_gerar({ prompt, largura: gw, altura: gh, semente, refs: [] });
            if (!r || !r.success) { ctx.avisos.push(`não gerou: ${k.gerar.slice(0, 40)} (${(r && r.error) || ''})`); return null; }
            c = await ieCenaImagem(r.path);
            if (semente >= 0) IE._cenaImgs.set(chave, c);
            gerada = { prompt, semente: r.semente, w: gw, h: gh };
        }
        if (!el.dataset.nome && !el.id && !el.getAttribute('alt')) nome = 'IA: ' + k.gerar.slice(0, 40);
    }
    const iw = c.width, ih = c.height;
    let px = 0, py = 0;
    const rec = el.dataset.recortar;
    if (rec) {
        const cut = await ieCenaRecortar(c, rec, (k.path || 'gerar:' + k.gerar) + '|' + iw + 'x' + ih);
        if (cut) { c = cut.c; px = cut.x; py = cut.y; }
    }
    // object-fit / object-position
    const fit = cs.objectFit || 'fill';
    let sx = B.w / iw, sy = B.h / ih;
    if (fit === 'contain' || fit === 'scale-down') { sx = sy = Math.min(sx, sy); if (fit === 'scale-down') sx = sy = Math.min(1, sx); }
    else if (fit === 'cover') sx = sy = Math.max(sx, sy);
    else if (fit === 'none') sx = sy = 1;
    const dw = iw * sx, dh = ih * sy;
    const pos = String(cs.objectPosition || '50% 50%').split(' ');
    const off = (v, sobra) => /%$/.test(v) ? sobra * parseFloat(v) / 100 : parseFloat(v) || 0;
    const dx = B.x + off(pos[0] || '50%', B.w - dw), dy = B.y + off(pos[1] || '50%', B.h - dh);
    let S = [sx, 0, 0, sy, dx, dy];
    if (h.M) S = ieMatMul(h.M, S);
    const P = ieTransformarPlano({ c, x: px, y: py }, S) || { c, x: Math.round(dx), y: Math.round(dy) };
    const L = ieCenaCamada(ctx, h, ':img', { nome, c: P.c, x: P.x, y: P.y });
    if (gerada) L.gerada = gerada;
    // máscara: o que passa da caixa (cover, posição) ou canto arredondado — a foto inteira continua na camada
    const raio = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(c2 => { const v = cs['border' + c2 + 'Radius']; return /%/.test(v) ? parseFloat(v) / 100 * Math.min(B.r.w, B.r.h) : parseFloat(v) || 0; });
    const passa = dx < B.x - 0.5 || dy < B.y - 0.5 || dx + dw > B.x + B.w + 0.5 || dy + dh > B.y + B.h + 0.5;
    if (passa || raio.some(v => v > 0)) {
        const x0 = Math.floor(B.x), y0 = Math.floor(B.y), mc = ieCanvas(Math.ceil(B.w + B.x - x0), Math.ceil(B.h + B.y - y0)), mx = ieCtx(mc);
        mx.fillStyle = '#fff';
        mx.beginPath();
        mx.roundRect(B.x - x0, B.y - y0, B.w, B.h, raio.map(v => Math.min(v, B.w / 2, B.h / 2)));
        mx.fill();
        const Pm = h.M ? ieTransformarPlano({ c: mc, x: x0, y: y0 }, h.M) : { c: mc, x: x0, y: y0 };
        L.m = { c: Pm.c, x: Pm.x, y: Pm.y, fundo: 0 };
        L.sujoM = true;
    }
    ieCenaFxSombras(L, ieCenaSombras(cs.boxShadow));
    return L;
}
// recorte do fundo numa camada temporária (as mesmas ferramentas do editor); fica em memória por imagem
async function ieCenaRecortar(c, modo, chave) {
    IE._cenaImgs = IE._cenaImgs || new Map();
    const k = 'recorte:' + modo + '|' + chave;
    if (IE._cenaImgs.has(k)) return IE._cenaImgs.get(k);
    const doc = IE.doc, cp = ieCanvas(c.width, c.height);
    ieCtx(cp).drawImage(c, 0, 0);
    const T = ieNovaCamada(doc, { nome: '_recorte', c: cp, x: 0, y: 0 });
    doc.camadas.push(T);
    ieAtivar(T.id, doc);
    let out = null;
    try {
        if (modo === 'borracha') KNV.borrachaMagica([[1, 1], [c.width - 2, 1], [1, c.height - 2], [c.width - 2, c.height - 2]], { tol: 40 });
        else { await ieRemoverFundo(doc, {}); if (ieAtiva(doc) && ieAtiva(doc).m) await ieCmd('mascaraAplicar'); }
        const A = ieAtiva(doc);
        if (A && A.c) out = { c: A.c, x: A.x, y: A.y };
    } finally {
        const a = ieAchar(doc, ieAtiva(doc)?.id);
        if (a && a.L.nome === '_recorte') a.lista.splice(a.i, 1);
        const b = ieAchar(doc, T.id);
        if (b) b.lista.splice(b.i, 1);
    }
    if (out) IE._cenaImgs.set(k, out);
    return out;
}

// ─────────────────────────── texto ───────────────────────────
// linhas como o navegador quebrou: [{s, x, top, dir, forcada}] (caractere a caractere com Range)
function ieCenaLinhas(nos, cs, ctx) {
    const pre = /^pre/.test(cs.whiteSpace), rg = document.createRange(), linhas = [];
    let cur = null, forcada = false;
    for (const n of nos) {
        if (n.nodeType === 1) { forcada = true; continue; }
        if (n.nodeType !== 3) continue;
        const s = n.data;
        for (let i = 0; i < s.length;) {
            const cp = s.codePointAt(i), len = cp > 0xffff ? 2 : 1, ch = s.slice(i, i + len);
            if (pre && ch === '\n') { forcada = true; i += len; continue; }
            rg.setStart(n, i); rg.setEnd(n, i + len);
            const rs = rg.getClientRects();
            i += len;
            if (!rs.length) continue;
            const q = rs[rs.length - 1];
            if (q.width === 0 && /\s/.test(ch)) continue;
            const top = q.top - ctx.rr.top, x = q.left - ctx.rr.left;
            if (!cur || top > cur.top + q.height * 0.5) {
                cur = { s: '', x: null, top, dir: x, h: q.height, forcada: forcada && linhas.length > 0 };
                linhas.push(cur); forcada = false;
            }
            if (cur.x == null && !/\s/.test(ch)) cur.x = x;
            cur.s += /\s/.test(ch) && !pre ? ' ' : ch;
            cur.dir = Math.max(cur.dir, q.right - ctx.rr.left);
        }
    }
    for (const l of linhas) { l.s = l.s.replace(/\s+$/, '').replace(/^\s+/, ''); if (l.x == null) l.x = l.dir; }
    return linhas.filter(l => l.s);
}
function ieCenaTx(el, cs) {
    const f = el._knvFonte || { fam: 'Arial', gdi: 'Arial' };
    const tam = parseFloat(cs.fontSize) || 32, cor = ieCenaCor(cs.color);
    const tx = { ...f, s: '', tam, cor: cor.hex, alin: 'left', esp: 0, ent: parseFloat(cs.lineHeight) || tam * 1.2, caixa: null, m: [1, 0, 0, 1, 0, 0] };
    const ls = parseFloat(cs.letterSpacing);
    if (ls) tx.esp = Math.round(ls / tam * 1000);
    if (cs.textTransform === 'uppercase') tx.caixaAlta = true;
    if (/underline/.test(cs.textDecorationLine)) tx.sublinhado = true;
    if (/line-through/.test(cs.textDecorationLine)) tx.tachado = true;
    if (cs.fontVariantCaps === 'small-caps') tx.versalete = true;
    const al = cs.textAlign;
    tx.alin = al === 'center' ? 'center' : al === 'right' || al === 'end' ? 'right' : al === 'justify' ? 'justify-left' : 'left';
    return { tx, a: cor.a };
}
function ieCenaCaixaAlta(s, cs) { return cs.textTransform === 'capitalize' ? s.replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : cs.textTransform === 'lowercase' ? s.toLowerCase() : s; }
function ieCenaTextoCamada(ctx, h, sufixo, el, cs, tx, a, linhas) {
    if (h.M) tx.m = ieMatMul(h.M, tx.m);
    const L = ieCenaCamada(ctx, h, sufixo, { tipo: 'texto', nome: (el.dataset.nome || el.id || tx.s.split(IE_NL)[0]).slice(0, 30), txt: tx });
    if (a < 1) L.op = a;
    ieCenaFxSombras(L, ieCenaSombras(cs.textShadow));
    const sw = parseFloat(cs.webkitTextStrokeWidth);
    if (sw > 0) { L.fx = L.fx || {}; L.fx.tracado = [{ ...ieFxNovo('tracado'), tam: sw, pos: 'centro', cor: ieCenaCor(cs.webkitTextStrokeColor).hex }]; }
    ieTextoRender(L);
    const asc = ieMedir(tx).measureText('Hg').fontBoundingBoxAscent || tx.tam * 0.8;
    ctx.blocos.push({ L, el, tam: tx.tam, linhas: linhas.map(l => ({ x: l.x, y: l.top, w: l.dir - l.x, h: l.h })), asc });
    return L;
}
// elemento só com texto: uma camada. Quebra natural → texto de caixa (reflui ao editar); sem → texto de ponto
function ieCenaTextoBloco(el, cs, nos, ctx, h) {
    const linhas = ieCenaLinhas(nos, cs, ctx);
    if (!linhas.length) return null;
    const { tx, a } = ieCenaTx(el, cs);
    const B = ieCenaConteudo(el, cs, ctx);
    const asc = ieMedir(tx).measureText('Hg').fontBoundingBoxAscent || tx.tam * 0.8;
    const base1 = linhas[0].top + asc;
    const naturais = linhas.slice(1).filter(l => !l.forcada).length;
    const juntar = todas => linhas.map((l, i) => (i && (todas || l.forcada) ? IE_NL : i ? ' ' : '') + ieCenaCaixaAlta(l.s, cs)).join('');
    if (naturais || tx.alin.startsWith('justify')) {
        tx.s = juntar(false);
        tx.caixa = [0, 0, B.w + 0.5, Math.max(B.h, linhas.length * tx.ent + tx.ent)];
        tx.m = [1, 0, 0, 1, B.x, base1 - asc];
        const app = ieTextoLayout(tx).map(l => l.s.trim());
        const dom = linhas.map(l => (tx.caixaAlta ? l.s.toUpperCase() : ieCenaCaixaAlta(l.s, cs)));
        if (app.join('|') !== dom.join('|')) {   // o editor quebraria diferente: linhas do navegador fixas e uma folga
            tx.s = juntar(true);
            const d = B.w * 0.08;
            tx.caixa = tx.alin === 'right' ? [-d, 0, B.w, tx.caixa[3]] : tx.alin === 'center' ? [-d / 2, 0, B.w + d / 2, tx.caixa[3]] : [0, 0, B.w + d, tx.caixa[3]];
        }
    } else {
        tx.s = juntar(true);
        const ax = tx.alin === 'center' ? B.x + B.w / 2 : tx.alin === 'right' ? B.x + B.w : B.x;
        tx.m = [1, 0, 0, 1, ax, base1];
    }
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible' && el.clientWidth) ctx.avisos.push(`texto estoura a largura da caixa: "${tx.s.slice(0, 30)}"`);
    return ieCenaTextoCamada(ctx, h, ':t', el, cs, tx, a, linhas);
}
// texto no meio de outros elementos (<b>, <span> no parágrafo): uma camada de ponto por linha, no lugar exato
function ieCenaTextoSolto(no, el, cs, ctx, h) {
    const linhas = ieCenaLinhas([no], cs, ctx), out = [];
    linhas.forEach((l, i) => {
        const { tx, a } = ieCenaTx(el, cs);
        const asc = ieMedir(tx).measureText('Hg').fontBoundingBoxAscent || tx.tam * 0.8;
        tx.s = ieCenaCaixaAlta(l.s, cs); tx.alin = 'left';
        tx.m = [1, 0, 0, 1, l.x, l.top + asc];
        out.push(ieCenaTextoCamada(ctx, h, ':s' + i, el, cs, tx, a, [l]));
    });
    return out;
}

// ─────────────────────────── rodar de novo: junta com o que já existe ───────────────────────────
// digital = o que a cena decidiu (sem pixels): mudou → alguém mexeu (pixels: ieCenaAssin)
function ieCenaDigital(L) {
    const p = [L.tipo, L.nome, L.visivel, Math.round(L.op * 1000), L.bm, !!L.clip, L.fill];
    if (L.tipo !== 'grupo') {
        if (!L.txt) p.push(Math.round(L.x), Math.round(L.y), L.c ? L.c.width + 'x' + L.c.height : 0);
        p.push(L.fx ? JSON.stringify(Object.keys(L.fx).filter(k => k[0] !== '_').map(k => [k, (L.fx[k] || []).length])) : '');
        if (L.txt) { const t = L.txt; p.push(t.s, t.tam, t.cor, t.fam, t.estilo, t.alin, t.esp, t.ent, JSON.stringify(t.caixa), (t.m || []).map(v => Math.round(v * 10)).join(',')); }
        p.push(L.m ? [Math.round(L.m.x), Math.round(L.m.y), L.m.c ? L.m.c.width + 'x' + L.m.c.height : ''].join(',') : '');
    }
    const s = JSON.stringify(p);
    let hsh = 2166136261;
    for (let i = 0; i < s.length; i++) hsh = Math.imul(hsh ^ s.charCodeAt(i), 16777619) >>> 0;
    return hsh.toString(36);
}
// assinatura visual pequena (24×24 RGBA) dos pixels/da máscara: pincelada, borracha, filtro → muda além da tolerância
// (o arredondamento do PNG ao salvar/abrir fica abaixo dela)
function ieCenaAssin(c) {
    if (!c) return '';
    const a = ieCanvas(24, 24), x = ieCtx(a);
    x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let s = '';
    for (let i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
    return btoa(s);
}
function ieCenaAssinMudou(c, ref) {
    if (ref == null) return false;
    const a = atob(ieCenaAssin(c)), b = atob(ref);
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (Math.abs(a.charCodeAt(i) - b.charCodeAt(i)) > 3) return true;
    return false;
}
function ieCenaMarcar(L) {
    L.cena.f = ieCenaDigital(L);
    if (L.tipo === 'pixel') L.cena.px = ieCenaAssin(L.c);
    if (L.m && L.m.c) L.cena.pm = ieCenaAssin(L.m.c);
}
function ieCenaMexida(L, ctx) {
    const r = ctx.o.refazer;
    if (r === true || (Array.isArray(r) && (r.includes(L.nome) || r.includes(L.cena.k)))) return false;
    return !!L.cena.dono || ieCenaDigital(L) !== L.cena.f || (L.tipo === 'pixel' && ieCenaAssinMudou(L.c, L.cena.px)) || (L.m && ieCenaAssinMudou(L.m.c, L.cena.pm));
}
function ieCenaJuntar(velhos, novos, ctx) {
    const porChave = new Map(), usados = new Set(), out = [];
    for (const V of velhos) if (V.cena && V.cena.k) porChave.set(V.cena.k, V);
    for (const N of novos) {
        const V = porChave.get(N.cena.k);
        if (V && V.tipo === 'grupo' && N.tipo === 'grupo') {
            usados.add(V);
            if (!ieCenaMexida(V, ctx)) { V.nome = N.nome; V.op = N.op; V.bm = N.bm; }
            else V.cena.dono = true;
            V.filhos = ieCenaJuntar(V.filhos, N.filhos, ctx);
            if (!V.cena.dono) V.cena.f = ieCenaDigital(V);
            out.push(V);
        } else if (V && ieCenaMexida(V, ctx)) {
            usados.add(V); V.cena.dono = true; ctx.mantidas.push(V.nome); ctx.n--; out.push(V);
        } else { if (V) usados.add(V); out.push(N); }
    }
    // camadas do usuário (sem cena) e as mexidas que saíram do HTML ficam onde estavam: logo acima da vizinha de baixo
    let ancora = -1;
    for (const V of velhos) {
        if (usados.has(V)) { const i = out.findIndex(N => N === V || (N.cena && N.cena.k === V.cena.k)); if (i >= 0) ancora = i; continue; }
        if (V.cena && !ieCenaMexida(V, ctx)) continue;
        if (V.cena) { V.cena.dono = true; ctx.mantidas.push(V.nome); }
        out.splice(ancora + 1, 0, V); ancora++;
    }
    return out;
}

// ─────────────────────────── conferência pelo próprio layout ───────────────────────────
function ieCenaChecar(raiz, ctx) {
    const { W, H, avisos, blocos, o } = ctx, S = ctx.slide;
    const SW = S ? S.w : W;
    const m = o.margem ?? Math.round(Math.min(SW, H) * 0.05);
    const story = !S && (o.formato === 'story' || H / W > 1.7);
    const nome = b => '"' + String(b.L.txt.s).split(IE_NL)[0].slice(0, 28) + '"';
    for (const b of blocos) {
        const x1 = Math.min(...b.linhas.map(l => l.x)), y1 = Math.min(...b.linhas.map(l => l.y));
        const x2 = Math.max(...b.linhas.map(l => l.x + l.w)), y2 = Math.max(...b.linhas.map(l => l.y + l.h));
        b.R = { x1, y1, x2, y2 };
        if (x2 < 0 || y2 < 0 || x1 > W || y1 > H) { avisos.push(`${nome(b)} fora da página`); continue; }
        const i0 = Math.floor(x1 / SW), i1 = Math.floor((x2 - 0.01) / SW), ox = i0 * SW;   // slide do texto
        if (S && i0 !== i1 && !b.el.closest('[data-livre]')) { avisos.push(`${nome(b)} cortado na emenda dos slides ${i0 + 1}/${i1 + 1}`); continue; }
        const lados = [x1 - ox < m && 'esquerda', x2 - ox > SW - m && 'direita', y1 < m && 'topo', y2 > H - m && 'base'].filter(Boolean);
        if (lados.length && !b.el.closest('[data-livre]')) avisos.push(`${nome(b)} fora da margem de ${m}px (${lados.join(', ')}${S ? `, slide ${i0 + 1}` : ''})`);
        if (story && (y1 < H * 0.13 || y2 > H * 0.84) && !b.el.closest('[data-livre]')) avisos.push(`${nome(b)} na faixa coberta pela interface do story (topo 13% / base 16%)`);
        if (b.tam < SW * 0.022) avisos.push(`${nome(b)} com ${Math.round(b.tam)}px: pequeno para ler no celular (mín. ~${Math.round(SW * 0.022)})`);
    }
    // texto atropelando texto (linhas reais, sem a folga de ascendente/descendente)
    for (let i = 0; i < blocos.length; i++) for (let j = i + 1; j < blocos.length; j++) {
        const A = blocos[i], B = blocos[j];
        if (A.el === B.el || A.el.closest('[data-juntos]') && A.el.closest('[data-juntos]') === B.el.closest('[data-juntos]')) continue;
        const bate = A.linhas.some(a => B.linhas.some(b => {
            const ya = [a.y + a.h * 0.2, a.y + a.h * 0.85], yb = [b.y + b.h * 0.2, b.y + b.h * 0.85];
            return a.x < b.x + b.w && b.x < a.x + a.w && ya[0] < yb[1] && yb[0] < ya[1];
        }));
        if (bate) avisos.push(`${nome(A)} atropela ${nome(B)}`);
    }
}

// ─────────────────────────── exportar ───────────────────────────
// cada fatia (slides do carrossel, Fatias das guias...) em arquivo: pasta/base_01.png ...; sem fatias, a peça inteira
async function ieCenaExportar(pasta, { fmt = 'png', q = 92, base, escala = 1 } = {}) {
    const doc = IE.doc, api = ieApi();
    if (!doc || !api) throw new Error('sem documento');
    // as fatias do documento (carrossel da cena ou feitas à mão / Fatias das guias), na ordem; sem fatias, a peça inteira
    const fs = doc.fatias || [];
    const partes = fs.length ? fs.map((f, i) => ({ x: f.x, y: f.y, w: f.w, h: f.h, nome: f.nome || String(i + 1).padStart(2, '0') })) : [{ x: 0, y: 0, w: doc.w, h: doc.h, nome: '' }];
    ieCompor(doc, ieRDoc(doc));
    const ini = await api.ie_salvar_inicio(null), itens = [];
    const nomeBase = String(base || doc.nome || 'peca').replace(/[\\/:*?"<>|]/g, '_');
    const dir = String(pasta).replace(/[\\/]+$/, '');
    for (const [i, P] of partes.entries()) {
        let c = ieCanvas(P.w, P.h);
        ieCtx(c).drawImage(doc.comp, P.x, P.y, P.w, P.h, 0, 0, P.w, P.h);
        if (escala !== 1) c = ieTransformarPlano({ c, x: 0, y: 0 }, [escala, 0, 0, escala, 0, 0]).c;
        const k = `slide_${i}.png`;
        await ieEnviar(ini.url, k, c);
        itens.push({ arquivo: k, destino: `${dir}\\${nomeBase}${P.nome ? '_' + P.nome : ''}.${fmt}` });
    }
    const e = await api.ie_exportar_fatias({ sessao: ini.sessao, fatias: itens, qualidade: q, dpi: doc.dpi });
    if (!e || !e.success) throw new Error('não exportou: ' + ((e && e.erros) || []).join(', '));
    return e.feitos;
}
