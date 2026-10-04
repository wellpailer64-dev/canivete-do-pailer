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
    doc.cena = { html: String(html), base: o.base || ant.base || null, formato: o.formato || ant.formato || null, margem: o.margem ?? ant.margem ?? null, slide: ctx.slide,
        biblioteca: o.biblioteca || ant.biblioteca || null, etapas: ant.etapas || (doc.cena && doc.cena.etapas) || undefined };
    if (ctx.slide) ieCenaEmendas(doc, ctx.slide);
    const topo = doc.camadas[doc.camadas.length - 1];
    if (topo) { doc.ativa = topo.id; doc.selIds = [topo.id]; }
    ieHist('Cena', doc);
    ieUiCamadas();
    ieAgendar(ieRDoc(doc), doc);
    return { w: W, h: H, slides: nSlides || undefined, camadas: ctx.n, mantidas: ctx.mantidas, avisos, ms: Math.round(performance.now() - t0) };
}
// carrossel: guias nas emendas e uma fatia por slide (Arquivo > Exportar fatias também serve), sem tocar nas do usuário
// (as do Novo layout de guias / Fatias das guias no mesmo lugar valem: não duplica) e deixa guias e fatias à mostra
function ieCenaEmendas(doc, S) {
    doc.guias = (doc.guias || []).filter(g => !g.cena);
    for (let i = 1; i < S.n; i++) if (!doc.guias.some(g => g.o === 'v' && Math.abs(g.p - i * S.w) < 0.5)) doc.guias.push({ o: 'v', p: i * S.w, cena: true });
    doc.fatias = (doc.fatias || []).filter(f => !f.cena && !(f.y === 0 && f.w === S.w && f.h === S.h && f.x % S.w === 0 && /^\d\d$/.test(f.nome)));   // .iknv não guarda o 'cena' da fatia
    doc.seqFatia = doc.seqFatia || 0;
    for (let i = 0; i < S.n; i++) {
        if (doc.fatias.some(f => f.x === i * S.w && f.y === 0 && f.w === S.w && f.h === S.h)) continue;
        doc.fatias.push({ id: ++doc.seqFatia, x: i * S.w, y: 0, w: S.w, h: S.h, nome: String(i + 1).padStart(2, '0'), url: '', alt: '', cena: true });
    }
    doc.fatias.sort((a, b) => a.y - b.y || a.x - b.x);
    IE.verGuias = true; doc.verFatias = true;
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
        :where(.k-grande){font-size:300px;font-weight:900;line-height:.9;color:${P}}
        :where(.k-check,.k-x){display:flex;flex-direction:column;gap:28px;padding:0;margin:0;list-style:none}
        :where(.k-check>li,.k-x>li){display:flex;gap:18px;align-items:center;font-size:32px;line-height:1.25}
        :where(.k-icone){flex:none;display:inline-flex;width:1.15em;height:1.15em}
        :where(.k-icone) svg{width:100%;height:100%}
        :where(.k-barras){gap:22px}
        :where(.k-barras>li){background:${P};color:${F};padding:0 28px;min-height:100px;box-sizing:border-box}
        :where(.k-dica){display:flex;gap:16px;align-items:flex-start;background:#e8e8e8;color:#1e1e1e;padding:24px 28px;font-size:38px;line-height:1.2}
        :where(.k-dica>.k-icone){width:1.1em;height:1.2em;margin-top:.05em}
        :where(.k-pilula){display:inline-flex;align-items:center;gap:14px;padding:0 24px;height:60px;border-radius:999px;background:${P};color:${F};font-size:24px;white-space:nowrap}`;
}
// ícones dos componentes (SVG de verdade: viram camada). cor: --cor-ok / --cor-primaria / a do texto
const IE_CENA_ICONES = {
    check: '<svg viewBox="0 0 38 38"><rect width="38" height="38" rx="8" fill="var(--cor-ok,#3fb54a)"/><path d="M10 20l6 6 12-13" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 40 40"><path d="M9 9l22 22M31 9L9 31" stroke="#fff" stroke-width="11" stroke-linecap="round"/><path d="M9 9l22 22M31 9L9 31" stroke="#ff2a2a" stroke-width="6" stroke-linecap="round"/></svg>',
    dica: '<svg viewBox="0 0 42 46"><path d="M21 2a15 15 0 0 0-9 27c2 2 3 4 3 7h12c0-3 1-5 3-7A15 15 0 0 0 21 2z" fill="#ffc83a"/><rect x="14" y="38" width="14" height="6" rx="2" fill="#8a8a8a"/></svg>',
    seta: '<svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="var(--cor-primaria,#ff5e3a)"/><path d="M13 10l8 7-8 7" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z" fill="currentColor"/></svg>',
    salvar: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z" fill="currentColor"/></svg>',
};
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
    // k-check / k-x: ícone de verdade em cada item; k-dica: lâmpada; k-pilula data-icone="seta|play|salvar|check"
    // (antes do texto; com data-icone-fim, depois)
    const icone = nome => `<span class="k-icone">${IE_CENA_ICONES[nome] || ''}</span>`;
    for (const li of raiz.querySelectorAll('.k-check > li, .k-x > li')) {
        if (li.querySelector(':scope > .k-icone')) continue;
        li.insertAdjacentHTML('afterbegin', icone(li.parentElement.classList.contains('k-x') ? 'x' : 'check'));
        li.dataset.juntos = '';
    }
    for (const el of raiz.querySelectorAll('.k-dica')) if (!el.querySelector(':scope > .k-icone')) { el.insertAdjacentHTML('afterbegin', icone('dica')); el.dataset.juntos = ''; }
    for (const el of raiz.querySelectorAll('.k-pilula[data-icone]')) {
        if (el.querySelector(':scope > .k-icone')) continue;
        el.insertAdjacentHTML(el.hasAttribute('data-icone-fim') ? 'beforeend' : 'afterbegin', icone(el.dataset.icone));
        el.dataset.juntos = '';
    }
    for (const el of raiz.querySelectorAll('.k-citacao')) if (el.setAttribute('data-juntos', ''), !el.querySelector('.k-aspas')) el.insertAdjacentHTML('afterbegin', '<span class="k-aspas">\u201C</span>');
    for (const li of raiz.querySelectorAll('li')) {
        if (li.querySelector(':scope > .k-marcador')) continue;
        const lista = li.parentElement, cs = getComputedStyle(li);
        if (lista.classList.contains('k-check') || lista.classList.contains('k-x')) continue;
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
        // recurso:nome = PNG já recortado da biblioteca (<biblioteca>/recursos/nome.png, guardado com data-guardar)
        const bib = ctx.o.biblioteca || (IE.doc && IE.doc.cena && IE.doc.cena.biblioteca);
        if (/^recurso:/i.test(src) && !bib) { ctx.avisos.push(`${src}: sem biblioteca (rode pelo tools/knv.py)`); im._knv = { falta: true }; await ieCenaMarcador(im, 1, 1); continue; }
        const path = /^recurso:/i.test(src) ? `${String(bib).replace(/[\\/]+$/, '')}/recursos/${src.slice(8).trim()}.png` : ieCenaCaminho(src, ctx.o.base);
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
        el.style.fontWeight = ok ? (t.varPeso ? String(t.varPeso) : t.negFalso ? '700' : '400') : (t.neg ? '700' : String(t.peso || 400));
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
        if (el.ownerSVGElement) continue;   // <g transform> dentro do <svg> é desenho, não posição (zerar apagava o deslocamento)
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
        // sem deslocamento e por fora = brilho (neon, aura): vira o Brilho externo (um só por camada, como no Photoshop)
        if (!s.inset && !s.x && !s.y && !(L.fx && L.fx.brilho && L.fx.brilho.length)) {
            const tam = (s.blur + Math.max(0, s.spread)) * k;
            L.fx = L.fx || {};
            L.fx.brilho = [{ ...ieFxNovo('brilho'), bm: 'NORMAL', cor: s.cor, op: Math.round(s.a * 100), tam, spread: tam ? Math.round(Math.max(0, s.spread) * k / tam * 100) : 0, tecnica: 'suave' }];
            continue;
        }
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
    // var(--cor) em atributo (stroke=, fill=...) só vale dentro da página: troca pelo valor já resolvido
    const orig = [el, ...el.querySelectorAll('*')], copia = [cl, ...cl.querySelectorAll('*')];
    copia.forEach((n, i) => { for (const at of [...n.attributes]) if (/var\(/.test(at.value)) {
        const v = getComputedStyle(orig[i]).getPropertyValue(at.name);
        if (v && !/var\(/.test(v)) n.setAttribute(at.name, v.trim());
    } });
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
        // tamanho gerado: data-proporcao manda; object-fit contain (objeto inteiro na caixa) = quadrado; senão a da caixa.
        // (antes a caixa sempre mandava: caixa retrato gerava OUTRA imagem e perdia a folha de contato do cache)
        const pr = el.dataset.proporcao ? String(el.dataset.proporcao).split(/[:x/]/).map(Number) : null;
        const contem = /contain|scale-down/.test(cs.objectFit || '');
        const [aw, ah] = pr && pr[0] && pr[1] ? pr : contem ? [1, 1] : [B.w, B.h];
        const lado = +el.dataset.lado || 1024, kk = lado / Math.max(aw, ah);
        const gw = Math.max(256, Math.round(aw * kk / 64) * 64), gh = Math.max(256, Math.round(ah * kk / 64) * 64);
        const semente = el.dataset.semente != null ? +el.dataset.semente : -1;
        if (semente < 0) ctx.avisos.push(`gerar sem data-semente (${k.gerar.slice(0, 40)}): fixe a semente para refazer igual e do cache`);
        // data-inteiro: pede o assunto inteiro no quadro (ombros, cabeça, pés) com folga em volta
        const prompt = k.gerar + (el.hasAttribute('data-inteiro') ? ', the entire subject fully inside the frame with empty margin around it, both shoulders and the whole head visible, nothing cut off at the edges' : '') + (el.dataset.fundo === 'branco' ? IE_GER_FUNDO : '');
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
    // recorte: objeto gerado sobre branco sai com recorte de IA por padrão (a Borracha deixa a sombra de chão do
    // gerador); data-recortar="nao" desliga
    const rec = el.dataset.recortar || (k.gerar && el.dataset.fundo === 'branco' ? 'ia' : '');
    if (rec && rec !== 'nao') {
        const cut = await ieCenaRecortar(c, rec, (k.path || 'gerar:' + k.gerar) + '|' + iw + 'x' + ih);
        if (cut) {
            c = cut.c; px = cut.x; py = cut.y;
            // o assunto encosta na borda da imagem original = saiu cortado (ombro, cabeça...): avisa, com a semente
            const pode = String(el.dataset.podeCortar || '').split(/[\s,]+/), bordas = [];
            // caixa do que é opaco de verdade (a camada recortada pode continuar do tamanho da imagem, transparente)
            const dd = ieCtx(c).getImageData(0, 0, c.width, c.height).data, passo = Math.max(1, Math.floor(Math.min(c.width, c.height) / 300));
            let bx0 = c.width, by0 = c.height, bx1 = -1, by1 = -1;
            for (let y = 0; y < c.height; y += passo) for (let x = 0; x < c.width; x += passo) if (dd[(y * c.width + x) * 4 + 3] > 40) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
            const tol = 2 + passo;
            if (bx1 >= 0) {
                if (px + bx0 <= tol && !pode.includes('esquerda')) bordas.push('esquerda');
                if (py + by0 <= tol && !pode.includes('topo')) bordas.push('topo');
                if (px + bx1 >= iw - 1 - tol && !pode.includes('direita')) bordas.push('direita');
                if (py + by1 >= ih - 1 - tol && !pode.includes('baixo')) bordas.push('baixo');
            }
            if (bordas.length) ctx.avisos.push(`"${nome}" saiu cortado na geração/foto (${bordas.join(', ')}): outra data-semente, data-inteiro, ou data-pode-cortar="${bordas.join(' ')}" se for de propósito`);
        }
    }
    // data-guardar="nome": o recurso (já recortado) vai para a biblioteca (o tools/knv.py grava em recursos/nome.png)
    if (el.dataset.guardar) (IE._recursosNovos = IE._recursosNovos || []).push({ nome: el.dataset.guardar, c,
        meta: { prompt: k.gerar || null, semente: el.dataset.semente != null ? +el.dataset.semente : null, recorte: rec || null, origem: k.path || null } });
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
    // objeto inteligente (como colocar imagem no Photoshop): o original fica em c0 e a escala/posição em tf — redimensionar
    // depois parte do original e filtros viram filtros inteligentes
    const L = ieCenaCamada(ctx, h, ':img', { tipo: 'inteligente', nome, c: P.c, x: P.x, y: P.y, c0: { c, x: px, y: py }, tf: S, tfBase: [...IE_ID] });
    if (gerada) L.gerada = gerada;
    // data-cor="#3cbf4a" (+ data-contraste="35"): a cor do objeto vira essa, por filtros inteligentes medidos
    if (el.dataset.cor || el.dataset.pele != null) {
        L.filtrosInt = [...(el.dataset.cor ? ieCenaCorFiltros(c, el.dataset.cor, +el.dataset.contraste || 0) : []),
            ...(el.dataset.pele != null ? ieCenaPeleFiltros(c, el.dataset.pele, ctx, nome) : [])];
        const o = ieIntPlano(L);
        L.c = o.c; L.x = o.x; L.y = o.y;
    }
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
// cor alvo de um objeto (data-cor): Matiz/Saturação (+ Brilho/Contraste) achados medindo — miniatura do objeto,
// média dos meios-tons em HSL (matiz por média circular), corrige e mede de novo até chegar perto do alvo.
// Os filtros saem marcados cena: true (rodar de novo refaz estes e mantém os que o usuário pôs)
function ieCenaCorFiltros(c, hex, ct = 0) {
    const k = Math.min(1, 160 / Math.max(c.width, c.height)), a = ieCanvas(Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k)));
    ieCtx(a).drawImage(c, 0, 0, a.width, a.height);
    const base = ieCtx(a).getImageData(0, 0, a.width, a.height).data, alvo = ieRgbHsl(...ieHexRgb(hex).map(v => v / 255));
    const medir = v => {
        const d = new Uint8ClampedArray(base);
        ieAjustar(d, { t: 'huesaturation', h: v.h, s: v.s, l: v.l });
        if (ct) ieAjustar(d, { t: 'brightnesscontrast', br: 0, ct, legado: false });
        let cx = 0, cy = 0, ss = 0, sl = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 200) continue;
            const [h, s, l] = ieRgbHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
            if (l < 0.18 || l > 0.85) continue;   // só meios-tons: brilho especular e sombra funda não contam
            cx += Math.cos(h * Math.PI / 180) * s; cy += Math.sin(h * Math.PI / 180) * s; ss += s; sl += l; n++;
        }
        return n ? { h: Math.atan2(cy, cx) * 180 / Math.PI, s: ss / n, l: sl / n } : null;
    };
    const v = { h: 0, s: 0, l: 0 };
    for (let it = 0; it < 10; it++) {
        const m = medir(v);
        if (!m) break;
        const dh = ((alvo[0] - m.h) % 360 + 540) % 360 - 180;
        v.h = ieClamp(Math.round(v.h + dh), -180, 180);
        v.s = ieClamp(Math.round(v.s + (alvo[1] - m.s) * 120), -100, 100);
        v.l = ieClamp(Math.round(v.l + (alvo[2] - m.l) * 120), -100, 100);
        if (Math.abs(dh) < 1.5 && Math.abs(alvo[1] - m.s) < 0.02 && Math.abs(alvo[2] - m.l) < 0.015) break;
    }
    const f = [{ cmd: 'aj:matiz', titulo: 'Matiz/Saturação', vals: { h: v.h, s: v.s, l: v.l, colorir: false }, on: true, cena: true }];
    if (ct) f.push({ cmd: 'aj:brilho', titulo: 'Brilho/Contraste', vals: { br: 0, ct, legado: false }, on: true, cena: true });
    return f;
}
// data-pele (vazio/"natural" ou um matiz em graus, padrão 24°): mede os tons de pele da foto e corrige pelo Camera Raw
// (Matiz −verde/+magenta e HSL dos laranjas/amarelos) até a média ficar natural — o FLUX às vezes deixa a pele verde.
// Pele = matiz 0..75°, saturação e luz médias, fora do vermelho forte (camiseta) — medida na foto original.
function ieCenaPeleFiltros(c, alvo, ctx, nome) {
    const hAlvo = isFinite(parseFloat(alvo)) ? parseFloat(alvo) : 24;
    const k = Math.min(1, 200 / Math.max(c.width, c.height)), a = ieCanvas(Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k)));
    ieCtx(a).drawImage(c, 0, 0, a.width, a.height);
    const img = ieCtx(a).getImageData(0, 0, a.width, a.height), base = img.data, pele = [];
    for (let i = 0; i < base.length; i += 4) {
        if (base[i + 3] < 220) continue;
        const [h, s, l] = ieRgbHsl(base[i] / 255, base[i + 1] / 255, base[i + 2] / 255);
        if (h > 75 || s < 0.1 || s > 0.75 || l < 0.22 || l > 0.85 || (h < 14 && s > 0.55)) continue;
        pele.push(i);
    }
    if (pele.length < 50) { ctx.avisos.push(`"${nome}": data-pele não achou pele na foto`); return []; }
    const medir = v => {
        const d = new Uint8ClampedArray(base);
        ieCrDados(d, a.width, a.height, ieCrNorm(v), 1);
        let cx = 0, cy = 0, ss = 0, n = 0;
        for (const i of pele) { const [h, s] = ieRgbHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255); cx += Math.cos(h * Math.PI / 180) * s; cy += Math.sin(h * Math.PI / 180) * s; ss += s; n++; }
        return [Math.atan2(cy / n, cx / n) * 180 / Math.PI, ss / n];
    };
    const sAlvo = 0.4;   // pele natural: saturação média ~0,4 (acima disso fica alaranjada/"bronzeada de mais")
    const [h0, s0] = medir({});
    if (Math.abs(h0 - hAlvo) < 4 && Math.abs(s0 - sAlvo) < 0.06) return [];   // já natural
    const v = { tint: 0, hsl: { o: [0, 0, 0], y: [0, 0, 0], r: [0, 0, 0] } };
    for (let it = 0; it < 10; it++) {
        const [h, s] = medir(v), dh = h - hAlvo, ds = s - sAlvo;
        if (Math.abs(dh) < 1.5 && Math.abs(ds) < 0.02) break;
        v.tint = ieClamp(Math.round(v.tint + dh * 1.6), -60, 60);
        v.hsl.y[0] = ieClamp(Math.round(v.hsl.y[0] - dh * 1.2), -100, 100);
        v.hsl.o[0] = ieClamp(Math.round(v.hsl.o[0] - dh * 0.6), -100, 100);
        v.hsl.o[1] = ieClamp(Math.round(v.hsl.o[1] - ds * 160), -100, 100);
        v.hsl.y[1] = ieClamp(Math.round(v.hsl.y[1] - ds * 120), -100, 100);
        v.hsl.r[1] = ieClamp(Math.round((v.hsl.r ? v.hsl.r[1] : 0) - ds * 60), -100, 100);
    }
    ctx.avisos.push(`"${nome}": pele de ${Math.round(h0)}°/sat ${s0.toFixed(2)} para ~${hAlvo}°/${sAlvo} (Camera Raw: matiz ${v.tint}, amarelos ${v.hsl.y}, laranjas ${v.hsl.o}, vermelhos ${v.hsl.r})`);
    return [{ cmd: 'f:cameraRaw', titulo: 'Filtro Camera Raw (pele)', vals: ieCrNorm(v), on: true, cena: true }];
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
// filtros inteligentes postos depois (cor, contraste...) não são "mexer na camada": a cena refaz posição/tamanho pelo
// HTML e a camada nova leva os filtros da antiga
function ieCenaLevarFiltros(V, N) {
    const doUsuario = (V.filtrosInt || []).filter(f => !f.cena);   // os da cena (data-cor) vêm refeitos em N
    if (!doUsuario.length || N.tipo !== 'inteligente' || !N.c0) return;
    N.filtrosInt = [...(N.filtrosInt || []), ...doUsuario.map(f => ({ ...f }))]; N.filtrosAberto = V.filtrosAberto;
    const o = ieIntPlano(N);
    N.c = o.c; N.x = o.x; N.y = o.y;
    ieCenaMarcar(N);
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
        } else {
            if (V) { usados.add(V); ieCenaLevarFiltros(V, N); }
            out.push(N);
        }
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
    // fundo num trecho de texto (<span style="background">) é da altura da fonte, não da linha: com entrelinha
    // apertada cobre acento/cedilha da linha vizinha
    for (const sp of raiz.querySelectorAll('span, b, strong, em, i, mark')) {
        const cs = getComputedStyle(sp);
        if (cs.display !== 'inline' || !ieCenaTemCaixa(cs)) continue;
        const lh = parseFloat(getComputedStyle(sp.parentElement).lineHeight), r = sp.getBoundingClientRect();
        if (lh && r.height > lh * 1.08 && sp.parentElement.nextElementSibling || lh && r.height > lh * 1.08 && sp.parentElement.previousElementSibling)
            avisos.push(`fundo do trecho "${sp.textContent.trim().slice(0, 20)}" é mais alto que a linha (${Math.round(r.height)} > ${Math.round(lh)}px): cobre acento/cedilha da linha vizinha — use uma caixa separada atrás do texto`);
    }
    // quase alinhados: bordas esquerdas de blocos de texto do mesmo slide a 1–8 px uma da outra (era para ser a mesma)
    const esq = blocos.filter(b => b.R && !b.el.closest('[data-livre]')).map(b => ({ b, x: b.R.x1, s: Math.floor(b.R.x1 / SW) }));
    const vistos = new Set();
    for (const a of esq) for (const c of esq) {
        if (a === c || a.s !== c.s) continue;
        const d = Math.abs(a.x - c.x), chave = a.s + ':' + [Math.round(a.x), Math.round(c.x)].sort((p, q) => p - q).join('|');   // um aviso por par de posições
        if (d >= 3 && d <= 8 && !vistos.has(chave)) { vistos.add(chave); avisos.push(`quase alinhados (${Math.round(d)}px): ${nome(a.b)} x=${Math.round(a.x % SW)} e ${nome(c.b)} x=${Math.round(c.x % SW)}`); }
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

// ─────────────────────────── atalhos de exportação rápida (pedido do usuário 2026-10-03) ───────────────────────────
// Ctrl+Shift+, = cada camada selecionada em PNG (recortada no tamanho dela, com efeitos); Ctrl+Shift+. = o documento em
// PNG: com fatias, uma por fatia; com pranchetas, uma por prancheta; senão a tela inteira. Pergunta a pasta uma vez.
async function ieExportarRapido(tudo, pastaAuto) {   // pastaAuto: automação (KNV.exportarRapido), sem a janela de salvar
    const doc = IE.doc, api = ieApi();
    if (!doc || !api) return;
    let pasta = pastaAuto;
    if (!pasta) {
        const d = await api.ie_dialogo_salvar(String(doc.nome || 'peca').replace(/\.\w+$/, ''), 'png');
        if (!d || !d.success || !d.path) return;
        pasta = d.path.replace(/[\\/][^\\/]*$/, '');
    }
    if (tudo && (doc.fatias || []).length) { const f = await ieCenaExportar(pasta, { fmt: 'png' }); ieToast(`${f.length} ${ieT('fatias exportadas')}`); return; }
    ieCompor(doc, ieRDoc(doc));
    const partes = [];
    if (tudo) {
        const pr = ieTodas(doc).filter(L => L.prancheta);
        if (pr.length) pr.forEach(L => { const P = L.prancheta; partes.push({ c: ieAchatar(doc, [L], { x: P.x, y: P.y, w: P.w, h: P.h }), nome: L.nome }); });
        else { const c = ieCanvas(doc.w, doc.h); ieCtx(c).drawImage(doc.comp, 0, 0); partes.push({ c, nome: doc.nome || 'peca' }); }
    } else {
        for (const L of ieSelecionadas(doc)) {
            const R = ieRCamada(L);
            if (!R || R.w < 1 || R.h < 1) continue;
            partes.push({ c: ieAchatar(doc, [L], ieRInt(R)), nome: L.nome });
        }
    }
    if (!partes.length) { ieToast(ieT('Nada para exportar')); return; }
    const ini = await api.ie_salvar_inicio(null), itens = [];
    for (const [i, p] of partes.entries()) {
        const k = `rapido_${i}.png`;
        await ieEnviar(ini.url, k, p.c);
        itens.push({ arquivo: k, destino: `${pasta}\\${String(p.nome).replace(/[\\/:*?"<>|]/g, '_')}.png` });
    }
    const e = await api.ie_exportar_fatias({ sessao: ini.sessao, fatias: itens, qualidade: 100, dpi: doc.dpi });
    ieToast(e && e.success ? `${partes.length} PNG ${ieT('exportado(s) em')} ${pasta}` : ieT('Não exportou'));
}
if (typeof IE_CMDS === 'object') { IE_CMDS.exportarCamadaPng = () => ieExportarRapido(false); IE_CMDS.exportarTudoPng = () => ieExportarRapido(true); }
if (typeof IE_ATALHOS === 'object') for (const [k, c] of [['Shift+Ctrl+,', 'exportarCamadaPng'], ['Shift+Ctrl+<', 'exportarCamadaPng'], ['Shift+Ctrl+.', 'exportarTudoPng'], ['Shift+Ctrl+>', 'exportarTudoPng']]) IE_ATALHOS[k] = c;
