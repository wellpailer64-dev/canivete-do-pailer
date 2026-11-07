// =========================================================
// KaniBoard (Kb, amarelo) — quadro branco infinito, no jeito do Miro: notas adesivas, formas, texto, setas que grudam
// nos objetos, caneta/marca-texto, imagens e GIFs, frames (com apresentação). Python: Functions/kaniboard.py (kb_*).
// Arquivos: kaniboard.js (estado, desenho, câmera, histórico, salvar, prévias em canvas), kaniboard-interacao.js
// (mouse, teclado, ferramentas, barras), kaniboard-lobby.js (lista de quadros com prévias e modelos).
// Desenho: DOM no "mundo" (div com translate+scale) — frames embaixo, setas (SVG) no meio, itens em cima; alças e
// guias numa camada de tela (#kbo-ui) que não escala. Tela→mundo: wx = (sx - cam.x) / cam.z.
// API do agente: KBO_API.
// =========================================================
const KB = {
    lista: [], doc: null, bid: null, midiaUrl: '', cam: { x: 0, y: 0, z: 1 },
    sel: new Set(), ferramenta: 'sel', forma: 'ret', corNota: '#FFF59D', caneta: { modo: 'caneta', cor: '#1a1a1a', esp: 3 },
    editando: null, hist: [], futuro: [], els: new Map(), ordemSig: '', salvarT: null, salvando: null, sujo: false,
    thumbEm: 0, camSuja: false, hover: null, mouse: { x: 0, y: 0, dentro: false }, show: null,
    prefs: { roda: 'zoom' },
};
const kbApi = () => window.pywebview && window.pywebview.api;
const kbEl = id => document.getElementById(id);
const kbEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kbId = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const kbClone = o => JSON.parse(JSON.stringify(o));
const kbItem = id => KB.doc && KB.doc.itens.find(i => i.id === id);
const kbPref = (k, v) => { try { if (v === undefined) return localStorage.getItem('kbo-' + k); localStorage.setItem('kbo-' + k, v); } catch (e) { /* sem armazenamento */ } return null; };
function kbToast(m, tipo) { if (typeof toast === 'function') toast(m, tipo); else console.log('[KaniBoard]', m); }

const KB_CORES_NOTA = ['#FFF59D', '#FFE066', '#FFC078', '#FFA8A8', '#FCC2D7', '#E5B3FF', '#B4C7FF', '#A5D8FF', '#99E9F2',
    '#B2F2BB', '#D8F5A2', '#C5E384', '#E9ECEF', '#CED4DA', '#868E96', '#343A40'];
const KB_CORES = ['#1a1a1a', '#495057', '#adb5bd', '#ffffff', '#e03131', '#f76707', '#f59f00', '#fcc419', '#2f9e44',
    '#0ca678', '#1098ad', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9', '#d6336c'];
const KB_FORMAS = [
    ['ret', 'Retângulo'], ['arred', 'Retângulo arredondado'], ['elipse', 'Círculo'], ['triangulo', 'Triângulo'],
    ['losango', 'Losango'], ['hexagono', 'Hexágono'], ['paralelo', 'Paralelogramo'], ['estrela', 'Estrela'],
    ['seta', 'Seta'], ['balao', 'Balão de fala'], ['cilindro', 'Cilindro'], ['nuvem', 'Nuvem'],
];
const KB_FUNDO = {
    claro: { bg: '#f4f4f2', ponto: 'rgba(0,0,0,.16)', tinta: '#1a1a1a' },
    escuro: { bg: '#1b1b1e', ponto: 'rgba(255,255,255,.12)', tinta: '#f1f1f1' },
};
const kbTema = () => KB_FUNDO[(KB.doc && KB.doc.tema) || 'claro'] || KB_FUNDO.claro;
const kbFonte = () => (getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'Segoe UI, sans-serif').trim();

// ───────────── caminhos das formas (em w×h, com a borda para dentro) ─────────────
function kbFormaPath(f, w, h, sw = 0) {
    const p = sw / 2, W = Math.max(1, w - sw), H = Math.max(1, h - sw), X = v => (p + v * W).toFixed(1), Y = v => (p + v * H).toFixed(1);
    const pol = pts => 'M' + pts.map(([a, b]) => X(a) + ' ' + Y(b)).join('L') + 'Z';
    switch (f) {
        case 'triangulo': return pol([[.5, 0], [1, 1], [0, 1]]);
        case 'losango': return pol([[.5, 0], [1, .5], [.5, 1], [0, .5]]);
        case 'hexagono': return pol([[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]]);
        case 'paralelo': return pol([[.2, 0], [1, 0], [.8, 1], [0, 1]]);
        case 'seta': return pol([[0, .28], [.62, .28], [.62, 0], [1, .5], [.62, 1], [.62, .72], [0, .72]]);
        case 'estrela': {
            const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .4 : 1; pts.push([.5 + Math.cos(a) * .5 * r, .53 + Math.sin(a) * .5 * r]); }
            return pol(pts);
        }
        case 'balao': return `M${X(.08)} ${Y(0)}H${X(.92)}Q${X(1)} ${Y(0)} ${X(1)} ${Y(.1)}V${Y(.68)}Q${X(1)} ${Y(.78)} ${X(.92)} ${Y(.78)}H${X(.38)}L${X(.18)} ${Y(1)}L${X(.22)} ${Y(.78)}H${X(.08)}Q${X(0)} ${Y(.78)} ${X(0)} ${Y(.68)}V${Y(.1)}Q${X(0)} ${Y(0)} ${X(.08)} ${Y(0)}Z`;
        case 'cilindro': { const e = .12; return `M${X(0)} ${Y(e)}A${(W / 2).toFixed(1)} ${(H * e).toFixed(1)} 0 0 1 ${X(1)} ${Y(e)}V${Y(1 - e)}A${(W / 2).toFixed(1)} ${(H * e).toFixed(1)} 0 0 1 ${X(0)} ${Y(1 - e)}Z M${X(0)} ${Y(e)}A${(W / 2).toFixed(1)} ${(H * e).toFixed(1)} 0 0 0 ${X(1)} ${Y(e)}`; }
        case 'nuvem': return `M${X(.25)} ${Y(.85)}C${X(.02)} ${Y(.85)} ${X(.0)} ${Y(.55)} ${X(.18)} ${Y(.5)}C${X(.12)} ${Y(.25)} ${X(.4)} ${Y(.12)} ${X(.5)} ${Y(.3)}C${X(.58)} ${Y(.05)} ${X(.9)} ${Y(.12)} ${X(.84)} ${Y(.4)}C${X(1.02)} ${Y(.42)} ${X(1.02)} ${Y(.85)} ${X(.78)} ${Y(.85)}Z`;
        case 'elipse': return `M${X(0)} ${Y(.5)}A${(W / 2).toFixed(1)} ${(H / 2).toFixed(1)} 0 1 0 ${X(1)} ${Y(.5)}A${(W / 2).toFixed(1)} ${(H / 2).toFixed(1)} 0 1 0 ${X(0)} ${Y(.5)}Z`;
        case 'arred': { const r = Math.min(W, H) * .18; return `M${(p + r).toFixed(1)} ${p}H${(p + W - r).toFixed(1)}Q${(p + W).toFixed(1)} ${p} ${(p + W).toFixed(1)} ${(p + r).toFixed(1)}V${(p + H - r).toFixed(1)}Q${(p + W).toFixed(1)} ${(p + H).toFixed(1)} ${(p + W - r).toFixed(1)} ${(p + H).toFixed(1)}H${(p + r).toFixed(1)}Q${p} ${(p + H).toFixed(1)} ${p} ${(p + H - r).toFixed(1)}V${(p + r).toFixed(1)}Q${p} ${p} ${(p + r).toFixed(1)} ${p}Z`; }
        default: return pol([[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
}
// área útil do texto dentro da forma (fração da caixa)
const KB_TXT_AREA = { triangulo: [.22, .42, .56, .52], losango: [.2, .22, .6, .56], estrela: [.3, .38, .4, .34], balao: [.06, .04, .88, .7],
    cilindro: [.06, .26, .88, .66], nuvem: [.18, .3, .64, .5], seta: [.04, .3, .62, .4], hexagono: [.16, .06, .68, .88], paralelo: [.18, .06, .64, .88],
    elipse: [.14, .14, .72, .72] };

// caneta: pontos (relativos ao tamanho original w0×h0) → caminho suave
function kbCanetaPath(it) {
    const p = it.pts || [], sx = it.w / (it.w0 || it.w || 1), sy = it.h / (it.h0 || it.h || 1);
    if (p.length < 2) return '';
    const P = i => [(p[i] * sx).toFixed(1), (p[i + 1] * sy).toFixed(1)];
    if (p.length <= 4) { const a = P(0), b = P(p.length - 2); return `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`; }
    let d = `M${P(0).join(' ')}`;
    for (let i = 2; i < p.length - 2; i += 2) {
        const a = P(i), b = P(i + 2);
        d += `Q${a[0]} ${a[1]} ${((+a[0] + +b[0]) / 2).toFixed(1)} ${((+a[1] + +b[1]) / 2).toFixed(1)}`;
    }
    const z = P(p.length - 2); return d + `L${z[0]} ${z[1]}`;
}

// ───────────── HTML do texto (só negrito/itálico/sublinhado/riscado e quebras) ─────────────
function kbLimparHtml(html) {
    const box = document.createElement('div'); box.innerHTML = html || '';
    const ok = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', BR: 'br', DIV: 'div', P: 'div', UL: 'ul', OL: 'ol', LI: 'li' };
    const andar = n => {
        let out = '';
        n.childNodes.forEach(c => {
            if (c.nodeType === 3) { out += kbEsc(c.nodeValue); return; }
            if (c.nodeType !== 1) return;
            const t = ok[c.tagName];
            if (c.tagName === 'SPAN' || c.tagName === 'FONT') {   // execCommand às vezes usa span com estilo
                let s = andar(c); const st = c.style || {};
                if (st.fontWeight === 'bold' || +st.fontWeight >= 600) s = `<b>${s}</b>`;
                if (st.fontStyle === 'italic') s = `<i>${s}</i>`;
                if ((st.textDecorationLine || st.textDecoration || '').includes('underline')) s = `<u>${s}</u>`;
                if ((st.textDecorationLine || st.textDecoration || '').includes('line-through')) s = `<s>${s}</s>`;
                out += s; return;
            }
            if (!t) { out += andar(c); return; }
            out += t === 'br' ? '<br>' : `<${t}>${andar(c)}</${t}>`;
        });
        return out;
    };
    return andar(box).replace(/^(<br>)+$/, '');
}
function kbTextoPuro(html) {
    const d = document.createElement('div');
    d.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|li|p)>/gi, '\n');
    return (d.textContent || '').replace(/\n+$/, '');
}

// ───────────── documento ─────────────
function kbDocVazio(nome) { return { v: 1, nome: nome || 'Sem título', tema: 'claro', fundo: 'pontos', itens: [], cam: null }; }
function kbNovoItem(tipo, o = {}) {
    const t = kbTema().tinta;
    const base = {
        nota: { w: 200, h: 200, cor: KB.corNota, html: '', alinhar: 'center' },
        forma: { w: 180, h: 110, forma: KB.forma, preench: '#ffffff', borda: '#343a40', esp: 2, html: '', corTexto: '#1a1a1a', fs: 18, alinhar: 'center' },
        texto: { w: 260, h: 40, html: '', cor: t, fs: 24, alinhar: 'left' },
        seta: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, estilo: 'curva', cor: (KB.doc && KB.doc.tema === 'escuro') ? '#dee2e6' : '#343a40', esp: 2, pontaA: 'nada', pontaB: 'seta', tracejado: false, rotulo: '' },
        caneta: { cor: KB.caneta.cor, esp: KB.caneta.esp, marca: false },
        imagem: { w: 300, h: 200, src: '' },
        frame: { w: 1600, h: 900, nome: 'Frame', cor: '#ffffff' },
    }[tipo];
    return Object.assign({ id: kbId(), tipo, x: 0, y: 0 }, kbClone(base), o);
}

// caixa de um item no mundo (seta: pelos pontos)
function kbCaixa(it) {
    if (it.tipo === 'seta') {
        const g = kbSetaGeo(it); if (!g) return { x: 0, y: 0, w: 0, h: 0 };
        const xs = g.pts.map(p => p[0]), ys = g.pts.map(p => p[1]);
        const x = Math.min(...xs), y = Math.min(...ys);
        return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    return { x: it.x, y: it.y, w: it.w, h: it.h };
}
function kbUniao(cxs) {
    if (!cxs.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    cxs.forEach(c => { x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + c.w); y2 = Math.max(y2, c.y + c.h); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
const kbCaixaTudo = (itens = KB.doc.itens) => kbUniao(itens.map(kbCaixa));

// ───────────── setas (conectores) ─────────────
const KB_NORMAL = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] };
function kbLadoAuto(cx, outro) {
    const c = [cx.x + cx.w / 2, cx.y + cx.h / 2], dx = (outro[0] - c[0]) / Math.max(cx.w, 1), dy = (outro[1] - c[1]) / Math.max(cx.h, 1);
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'b' : 't');
}
function kbPontoLado(cx, lado) {
    return { t: [cx.x + cx.w / 2, cx.y], r: [cx.x + cx.w, cx.y + cx.h / 2], b: [cx.x + cx.w / 2, cx.y + cx.h], l: [cx.x, cx.y + cx.h / 2] }[lado];
}
function kbCentroPonta(e) {
    const it = e && e.id && kbItem(e.id);
    if (it && it.tipo !== 'seta') return [it.x + it.w / 2, it.y + it.h / 2];
    return [e.x || 0, e.y || 0];
}
// resolve as duas pontas: [{p:[x,y], n:[nx,ny]|null}]
function kbPontas(s) {
    const res = [s.a, s.b].map((e, i) => {
        const it = e && e.id && kbItem(e.id);
        if (!it || it.tipo === 'seta') return { p: [e.x || 0, e.y || 0], n: null, livre: true };
        const outro = kbCentroPonta(i ? s.a : s.b);
        const lado = e.lado && e.lado !== 'auto' ? e.lado : kbLadoAuto(it, outro);
        return { p: kbPontoLado(it, lado), n: KB_NORMAL[lado], lado };
    });
    return res;
}
function kbSetaGeo(s) {
    const [A, B] = kbPontas(s);
    if (!A || !B) return null;
    const p0 = A.p, p3 = B.p, dist = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) || 1;
    const dir = [(p3[0] - p0[0]) / dist, (p3[1] - p0[1]) / dist];
    const n0 = A.n || dir, n3 = B.n || [-dir[0], -dir[1]];
    if (s.estilo === 'reta') return { d: `M${p0[0]} ${p0[1]}L${p3[0]} ${p3[1]}`, pts: [p0, p3], fimA: [p0, p3], fimB: [p3, p0], meio: [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2] };
    if (s.estilo === 'cotovelo') {
        const g = Math.min(30, dist / 3), a = [p0[0] + n0[0] * g, p0[1] + n0[1] * g], b = [p3[0] + n3[0] * g, p3[1] + n3[1] * g];
        let mid;
        if (n0[0] !== 0) { const mx = (a[0] + b[0]) / 2; mid = n3[0] !== 0 ? [[mx, a[1]], [mx, b[1]]] : [[b[0], a[1]]]; }
        else { const my = (a[1] + b[1]) / 2; mid = n3[1] !== 0 ? [[a[0], my], [b[0], my]] : [[a[0], b[1]]]; }
        const pts = [p0, a, ...mid, b, p3].filter((q, i, arr) => !i || q[0] !== arr[i - 1][0] || q[1] !== arr[i - 1][1]);
        const L = pts.length, meioI = Math.floor((L - 1) / 2);
        return { d: 'M' + pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'), pts, fimA: [pts[0], pts[1]], fimB: [pts[L - 1], pts[L - 2]],
            meio: [(pts[meioI][0] + pts[meioI + 1][0]) / 2, (pts[meioI][1] + pts[meioI + 1][1]) / 2] };
    }
    const k = Math.min(Math.max(dist * .4, 30), 240);
    const c1 = [p0[0] + n0[0] * k, p0[1] + n0[1] * k], c2 = [p3[0] + n3[0] * k, p3[1] + n3[1] * k];
    const bz = t => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]; };
    const amostra = [0, .25, .5, .75, 1].map(bz);
    return { d: `M${p0[0]} ${p0[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p3[0]} ${p3[1]}`, pts: amostra, fimA: [p0, bz(.06)], fimB: [p3, bz(.94)], meio: bz(.5), bz: [p0, c1, c2, p3] };
}
function kbPontaPath(tipo, ponta, de, esp) {
    if (!tipo || tipo === 'nada') return '';
    const ang = Math.atan2(ponta[1] - de[1], ponta[0] - de[0]), L = 8 + esp * 3, W = 5 + esp * 1.8;
    const ca = Math.cos(ang), sa = Math.sin(ang), P = (a, b) => `${(ponta[0] + a * ca - b * sa).toFixed(1)} ${(ponta[1] + a * sa + b * ca).toFixed(1)}`;
    if (tipo === 'circulo') { const r = 3 + esp; return `M${P(-r, 0)}A${r} ${r} 0 1 0 ${P(-r - .01, 0)}Z`; }
    if (tipo === 'linha') return `M${P(-L, -W)}L${P(0, 0)}L${P(-L, W)}`;
    return `M${P(0, 0)}L${P(-L, -W)}L${P(-L * .78, 0)}L${P(-L, W)}Z`;
}

// ───────────── desenho no DOM ─────────────
function kbAssinatura(it) {
    if (it.tipo === 'caneta') { const p = it.pts || []; return JSON.stringify({ ...it, pts: p.length + ':' + p[0] + ':' + p[p.length - 1] }); }
    return JSON.stringify(it);
}
function kbCamada(it) { return it.tipo === 'frame' ? kbEl('kbo-frames') : it.tipo === 'seta' ? kbEl('kbo-setas') : kbEl('kbo-itens'); }
function kbSrc(src) {
    if (!src) return '';
    if (/^(https?:|data:|blob:)/.test(src)) return src;
    return src.startsWith('midia/') ? KB.midiaUrl + encodeURIComponent(src.slice(6)) : src;
}

function kbCriarEl(it) {
    let el;
    if (it.tipo === 'seta') {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        el.innerHTML = '<path class="kbo-seta-hit"/><path class="kbo-seta-linha"/><path class="kbo-seta-pa"/><path class="kbo-seta-pb"/>';
        const r = document.createElement('div'); r.className = 'kbo-rotulo'; r.dataset.id = it.id; r.dataset.rot = '1';
        r.innerHTML = '<div class="kbo-txt"></div>';
        kbEl('kbo-rotulos').appendChild(r); el._rot = r;
    } else {
        el = document.createElement('div');
        if (it.tipo === 'nota') el.innerHTML = '<div class="kbo-caixa"><div class="kbo-txt"></div></div>';
        else if (it.tipo === 'forma') el.innerHTML = '<svg class="kbo-forma-svg"><path/></svg><div class="kbo-caixa"><div class="kbo-txt"></div></div>';
        else if (it.tipo === 'texto') el.innerHTML = '<div class="kbo-txt"></div>';
        else if (it.tipo === 'imagem') el.innerHTML = '<img draggable="false" alt="">';
        else if (it.tipo === 'caneta') el.innerHTML = '<svg><path class="kbo-pen-hit"/><path class="kbo-pen"/></svg>';
        else if (it.tipo === 'frame') el.innerHTML = '<div class="kbo-frame-nome"></div><div class="kbo-frame-corpo"></div>';
    }
    el.classList.add('kbo-it', 'kbo-' + it.tipo);
    el.dataset.id = it.id;
    KB.els.set(it.id, el);
    return el;
}

function kbAtualizar(it, forcar) {
    let el = KB.els.get(it.id);
    if (!el) { el = kbCriarEl(it); kbCamada(it).appendChild(el); KB.ordemSig = ''; }
    if (it.tipo === 'seta') return kbAtualizarSeta(it, el);
    const sig = kbAssinatura(it);
    const soPos = el._sig && !forcar && el._w === it.w && el._h === it.h && el._sig.replace(/"x":[^,]+,"y":[^,]+/, '') === sig.replace(/"x":[^,]+,"y":[^,]+/, '');
    el.style.transform = `translate(${it.x}px,${it.y}px)`;
    if (el._sig === sig && !forcar) return el;
    el._sig = sig; el._w = it.w; el._h = it.h;
    if (soPos) return el;
    el.classList.toggle('kbo-trava', !!it.lock);
    el.style.width = it.w + 'px';
    if (it.tipo !== 'texto') el.style.height = it.h + 'px';
    const txt = el.querySelector('.kbo-txt'), editando = KB.editando === it.id;
    if (txt) Object.assign(txt.style, { fontWeight: it.negrito ? '700' : '', fontStyle: it.italico ? 'italic' : '',
        textDecoration: [it.sublinhado && 'underline', it.riscado && 'line-through'].filter(Boolean).join(' ') });
    if (it.tipo === 'nota') {
        el.style.setProperty('--cor', it.cor);
        el.classList.toggle('kbo-nota-escura', kbEscura(it.cor));
        txt.style.textAlign = it.alinhar || 'center';
        if (!editando) txt.innerHTML = it.html || '';
        kbAjustarFonte(txt, it, el.querySelector('.kbo-caixa'));
    } else if (it.tipo === 'forma') {
        const svg = el.querySelector('svg'), path = svg.firstChild, esp = +it.esp || 0;
        svg.setAttribute('viewBox', `0 0 ${it.w} ${it.h}`); svg.setAttribute('width', it.w); svg.setAttribute('height', it.h);
        path.setAttribute('d', kbFormaPath(it.forma, it.w, it.h, esp));
        path.setAttribute('fill', it.preench || 'none'); path.setAttribute('stroke', esp ? (it.borda || 'none') : 'none');
        path.setAttribute('stroke-width', esp); path.setAttribute('stroke-dasharray', it.tracejado ? `${esp * 3} ${esp * 2}` : '');
        const a = KB_TXT_AREA[it.forma] || [.06, .06, .88, .88], cx = el.querySelector('.kbo-caixa');
        Object.assign(cx.style, { left: a[0] * 100 + '%', top: a[1] * 100 + '%', width: a[2] * 100 + '%', height: a[3] * 100 + '%' });
        txt.style.color = it.corTexto || '#1a1a1a'; txt.style.textAlign = it.alinhar || 'center';
        if (!editando) txt.innerHTML = it.html || '';
        kbAjustarFonte(txt, it, cx);
    } else if (it.tipo === 'texto') {
        Object.assign(txt.style, { color: it.cor, fontSize: (it.fs || 24) + 'px', textAlign: it.alinhar || 'left' });
        if (!editando) txt.innerHTML = it.html || '';
        const h = el.offsetHeight;
        if (h > 0 && Math.abs(h - it.h) > .5) { it.h = h; el._sig = kbAssinatura(it); }
    } else if (it.tipo === 'imagem') {
        const img = el.firstChild, s = kbSrc(it.src);
        if (img.getAttribute('src') !== s) img.src = s;
    } else if (it.tipo === 'caneta') {
        const svg = el.firstChild, d = kbCanetaPath(it), pad = (it.esp || 3) / 2 + 2;
        svg.setAttribute('viewBox', `${-pad} ${-pad} ${it.w + pad * 2} ${it.h + pad * 2}`);
        Object.assign(svg.style, { left: -pad + 'px', top: -pad + 'px', width: it.w + pad * 2 + 'px', height: it.h + pad * 2 + 'px' });
        const [hit, pen] = svg.children;
        hit.setAttribute('d', d); pen.setAttribute('d', d);
        hit.setAttribute('stroke-width', Math.max(14, (it.esp || 3) + 10));
        pen.setAttribute('stroke', it.cor); pen.setAttribute('stroke-width', it.esp || 3);
        el.classList.toggle('kbo-marca', !!it.marca);
    } else if (it.tipo === 'frame') {
        el.querySelector('.kbo-frame-nome').textContent = it.nome || 'Frame';
        el.querySelector('.kbo-frame-corpo').style.background = it.cor || '#ffffff';
    }
    return el;
}

function kbAtualizarSeta(s, el) {
    const g = kbSetaGeo(s); if (!g) return el;
    const [hit, lin, pa, pb] = el.children, esp = +s.esp || 2;
    hit.setAttribute('d', g.d);
    lin.setAttribute('d', g.d); lin.setAttribute('stroke', s.cor); lin.setAttribute('stroke-width', esp);
    lin.setAttribute('stroke-dasharray', s.tracejado ? `${esp * 4} ${esp * 3}` : '');
    [[pa, s.pontaA, g.fimA], [pb, s.pontaB, g.fimB]].forEach(([p, tipo, f]) => {
        p.setAttribute('d', kbPontaPath(tipo, f[0], f[1], esp));
        const vazado = tipo === 'linha';
        p.setAttribute('fill', vazado ? 'none' : s.cor); p.setAttribute('stroke', s.cor); p.setAttribute('stroke-width', vazado ? esp : 1);
    });
    el.classList.toggle('kbo-trava', !!s.lock);
    const r = el._rot, txt = r.querySelector('.kbo-txt');
    r.style.transform = `translate(${g.meio[0]}px,${g.meio[1]}px) translate(-50%,-50%)`;
    if (KB.editando !== s.id && txt.innerHTML !== (s.rotulo || '')) txt.innerHTML = s.rotulo || '';
    r.hidden = !s.rotulo && KB.editando !== s.id;
    r.style.color = s.cor;
    return el;
}

function kbEscura(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return false;
    const n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 < 120;
}

// nota/forma: fonte automática (maior que cabe) ou fixa (it.fs)
function kbAjustarFonte(txt, it, caixa) {
    if (it.tipo === 'forma' && it.fs) { txt.style.fontSize = it.fs + 'px'; return; }
    if (it.tipo === 'nota' && it.fs) { txt.style.fontSize = it.fs + 'px'; return; }
    const W = caixa.clientWidth, H = caixa.clientHeight;
    if (!W || !H) return;
    const vazio = !txt.textContent.trim();
    let lo = 8, hi = Math.max(10, Math.min(72, H * .42)), melhor = lo;
    if (vazio) { txt.style.fontSize = Math.min(hi, 28) + 'px'; return; }
    for (let i = 0; i < 7; i++) {
        const m = (lo + hi) / 2;
        txt.style.fontSize = m + 'px';
        if (txt.scrollHeight <= H + 1 && txt.scrollWidth <= W + 1) { melhor = m; lo = m; } else hi = m;
    }
    txt.style.fontSize = Math.floor(melhor) + 'px';
}

function kbRenderTudo() {
    if (!KB.doc) return;
    const vivos = new Set();
    KB.doc.itens.forEach(it => { if (it.tipo !== 'seta') { kbAtualizar(it); vivos.add(it.id); } });
    KB.doc.itens.forEach(it => { if (it.tipo === 'seta') { kbAtualizar(it); vivos.add(it.id); } });
    for (const [id, el] of KB.els) if (!vivos.has(id)) { el.remove(); if (el._rot) el._rot.remove(); KB.els.delete(id); }
    const sig = KB.doc.itens.map(i => i.id).join(',');
    if (sig !== KB.ordemSig) {
        KB.ordemSig = sig;
        KB.doc.itens.forEach(it => { const el = KB.els.get(it.id); if (el && it.id !== KB.editando) kbCamada(it).appendChild(el); });
    }
    for (const id of [...KB.sel]) if (!kbItem(id)) KB.sel.delete(id);
    kbPintarUi();
}
// só as setas (depois de mover itens)
function kbRenderSetas() { KB.doc.itens.forEach(it => { if (it.tipo === 'seta') kbAtualizar(it); }); }

// ───────────── câmera ─────────────
function kbAplicarCam() {
    const m = kbEl('kbo-mundo'), vp = kbEl('kbo-vp'); if (!m || !vp) return;
    if (!(KB.cam.z > 0 && isFinite(KB.cam.z) && isFinite(KB.cam.x) && isFinite(KB.cam.y))) KB.cam = { x: 0, y: 0, z: 1 };   // nunca câmera inválida
    const { x, y, z } = KB.cam;
    m.style.transform = `translate(${x}px,${y}px) scale(${z})`;
    m.style.setProperty('--kbz', z);
    const fundo = (KB.doc && KB.doc.fundo) || 'pontos', tema = kbTema();
    vp.style.backgroundColor = tema.bg;
    kbEl('kbo-editor').dataset.tema = (KB.doc && KB.doc.tema) || 'claro';
    if (fundo === 'liso') vp.style.backgroundImage = 'none';
    else {
        let passo = 24 * z; for (let i = 0; i < 40 && passo < 12; i++) passo *= 2; for (let i = 0; i < 40 && passo > 48; i++) passo /= 2;
        vp.style.backgroundImage = fundo === 'grade'
            ? `linear-gradient(${tema.ponto} 1px, transparent 1px), linear-gradient(90deg, ${tema.ponto} 1px, transparent 1px)`
            : `radial-gradient(circle, ${tema.ponto} ${Math.max(.8, Math.min(1.4, z * 1.2))}px, transparent 1.5px)`;
        vp.style.backgroundSize = `${passo}px ${passo}px`;
        vp.style.backgroundPosition = `${x}px ${y}px`;
    }
    const zt = kbEl('kbo-zoom-txt'); if (zt) zt.textContent = Math.round(z * 100) + '%';
    kbPintarUi();
    kbMinimapa();
    KB.camSuja = true;
    m.classList.add('kbo-movendo'); clearTimeout(KB.camT);
    KB.camT = setTimeout(() => { m.classList.remove('kbo-movendo'); if (KB.doc) { KB.doc.cam = { ...KB.cam }; kbAgendarSalvar(2500, true); } }, 180);
}
let kbCamRaf = 0;
function kbCamAgendar() { if (!kbCamRaf) kbCamRaf = requestAnimationFrame(() => { kbCamRaf = 0; kbAplicarCam(); }); }
const kbParaMundo = (sx, sy) => { const r = kbEl('kbo-vp').getBoundingClientRect(); return [(sx - r.left - KB.cam.x) / KB.cam.z, (sy - r.top - KB.cam.y) / KB.cam.z]; };
const kbParaTela = (wx, wy) => [wx * KB.cam.z + KB.cam.x, wy * KB.cam.z + KB.cam.y];   // relativo ao #kbo-vp
function kbZoomEm(z, sx, sy) {
    z = Math.min(8, Math.max(.03, z));
    const vp = kbEl('kbo-vp'); if (sx == null) { sx = vp.clientWidth / 2; sy = vp.clientHeight / 2; }
    KB.cam.x = sx - (sx - KB.cam.x) * (z / KB.cam.z); KB.cam.y = sy - (sy - KB.cam.y) * (z / KB.cam.z); KB.cam.z = z;
    kbCamAgendar();
}
function kbCamPara(cx, margem = 80, zMax = 1.5) {
    const vp = kbEl('kbo-vp'); if (!vp || !cx) return null;
    const W = vp.clientWidth, H = vp.clientHeight;
    const z = Math.min(zMax, Math.max(.03, Math.min((W - margem * 2) / Math.max(cx.w, 1), (H - margem * 2) / Math.max(cx.h, 1))));
    return { z, x: W / 2 - (cx.x + cx.w / 2) * z, y: H / 2 - (cx.y + cx.h / 2) * z };
}
function kbVoar(alvo, ms = 380) {
    if (!alvo || !(alvo.z > 0) || !isFinite(alvo.x) || !isFinite(alvo.y)) return;
    const de = { ...KB.cam }, t0 = performance.now();
    cancelAnimationFrame(KB.voo);
    const passo = t => {
        const k = Math.max(0, Math.min(1, (t - t0) / ms)), e = 1 - Math.pow(1 - k, 3);
        // interpolação em log do zoom fica natural
        const z = Math.exp(Math.log(de.z) + (Math.log(alvo.z) - Math.log(de.z)) * e);
        const vp = kbEl('kbo-vp'), W = vp.clientWidth / 2, H = vp.clientHeight / 2;
        const c0 = [(W - de.x) / de.z, (H - de.y) / de.z], c1 = [(W - alvo.x) / alvo.z, (H - alvo.y) / alvo.z];
        const c = [c0[0] + (c1[0] - c0[0]) * e, c0[1] + (c1[1] - c0[1]) * e];
        KB.cam = { z, x: W - c[0] * z, y: H - c[1] * z };
        kbAplicarCam();
        if (k < 1) KB.voo = requestAnimationFrame(passo);
    };
    KB.voo = requestAnimationFrame(passo);
}
function kbAjustarTudo(animar = true) {
    const cx = KB.doc && KB.doc.itens.length ? kbCaixaTudo() : { x: -400, y: -300, w: 800, h: 600 };
    const alvo = kbCamPara(cx, 80, 1);
    if (animar) kbVoar(alvo); else { KB.cam = alvo; kbAplicarCam(); }
}
function kbIrSelecao() {
    const cx = kbUniao([...KB.sel].map(kbItem).filter(Boolean).map(kbCaixa));
    if (cx) kbVoar(kbCamPara(cx, 120, 2));
}

// ───────────── histórico ─────────────
const kbSnap = () => JSON.stringify(KB.doc.itens);
function kbGuardar(antes) {
    if (antes === kbSnap()) return false;
    KB.hist.push(antes); if (KB.hist.length > 150) KB.hist.shift();
    KB.futuro = [];
    kbAgendarSalvar();
    clearTimeout(KB.fpT); KB.fpT = setTimeout(() => { if (typeof kbFramesLista === 'function') kbFramesLista(); }, 600);
    return true;
}
// muda o documento com desfazer: kbMudar(() => {...})
function kbMudar(fn) {
    if (!KB.doc) return;
    const antes = kbSnap();
    fn();
    kbRenderTudo();
    kbGuardar(antes);
}
function kbDesfazer(refazer) {
    const de = refazer ? KB.futuro : KB.hist, para = refazer ? KB.hist : KB.futuro;
    if (!de.length) return;
    kbSairEdicao(true);
    para.push(kbSnap());
    KB.doc.itens = JSON.parse(de.pop());
    KB.els.forEach(el => { el._sig = ''; });
    kbRenderTudo();
    kbAgendarSalvar();
}

// ───────────── salvar ─────────────
function kbAgendarSalvar(ms = 700, soCam) {
    if (!KB.bid) return;
    if (soCam && KB.sujo && KB.salvarT) return;   // a mudança de conteúdo já vai salvar (com a câmera junto)
    if (!soCam) { KB.sujo = true; kbStatus('Salvando…'); }
    clearTimeout(KB.salvarT);
    KB.salvarT = setTimeout(() => kbSalvarJa(), ms);
}
async function kbSalvarJa(comThumb) {
    clearTimeout(KB.salvarT);
    const a = kbApi(); if (!a || !KB.bid || !KB.doc) return;
    if (KB.salvando) { await KB.salvando; }
    if (!KB.sujo && !KB.camSuja && !comThumb) return;
    const bid = KB.bid, era = KB.sujo;
    KB.doc.cam = { ...KB.cam };
    const thumb = (era || comThumb) && (comThumb || Date.now() - KB.thumbEm > 6000) ? await kbThumb().catch(() => '') : '';
    if (thumb) { KB.thumbEm = Date.now(); KB.thumbPendente = false; } else if (era) KB.thumbPendente = true;
    if (KB.bid !== bid) return;
    KB.sujo = false; KB.camSuja = false;
    KB.salvando = a.kb_salvar(bid, JSON.stringify(KB.doc), thumb).then(r => {
        if (!r || !r.success) { KB.sujo = true; kbStatus('Não salvou', true); kbToast('KaniBoard: ' + ((r && r.error) || 'falha ao salvar'), 'erro'); }
        else if (!KB.sujo) kbStatus('Salvo');
        return r;
    }).catch(e => { KB.sujo = true; kbStatus('Não salvou', true); console.error(e); }).finally(() => { KB.salvando = null; });
    return KB.salvando;
}
function kbStatus(t, erro) { const s = kbEl('kbo-status'); if (s) { s.textContent = t; s.classList.toggle('erro', !!erro); } }

// ───────────── desenho em canvas (prévias, minimapa, exportar) ─────────────
const KB_IMGS = new Map();
function kbImg(src) {
    const u = kbSrc(src); if (!u) return null;
    let im = KB_IMGS.get(u);
    if (!im) { im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async'; im.src = u; KB_IMGS.set(u, im); }
    return im;
}
function kbEsperarImgs(itens, ms = 2500) {
    const ims = itens.filter(i => i.tipo === 'imagem').map(i => kbImg(i.src)).filter(im => im && !im.complete);
    if (!ims.length) return Promise.resolve();
    return Promise.race([Promise.all(ims.map(im => new Promise(r => { im.onload = im.onerror = r; }))), new Promise(r => setTimeout(r, ms))]);
}
function kbLinhas(ctx, texto, larg) {
    const out = [];
    String(texto || '').split('\n').forEach(par => {
        const pal = par.split(/(\s+)/); let ln = '';
        pal.forEach(p => {
            const t = ln + p;
            if (ctx.measureText(t).width > larg && ln.trim()) { out.push(ln.trimEnd()); ln = p.trimStart(); }
            else ln = t;
        });
        out.push(ln);
    });
    return out;
}
function kbTextoCanvas(ctx, html, cx, { cor, fs, alinhar = 'center', vmeio = true, auto = false, negrito = false }) {
    const txt = kbTextoPuro(html); if (!txt.trim()) return;
    const fonte = kbFonte();
    let tam = fs || 24, linhas;
    for (let i = 0; i < 12; i++) {
        ctx.font = `${negrito ? 600 : 400} ${tam}px ${fonte}`;
        linhas = kbLinhas(ctx, txt, cx.w);
        if (!auto || (linhas.length * tam * 1.25 <= cx.h && linhas.every(l => ctx.measureText(l).width <= cx.w)) || tam <= 8) break;
        tam *= .85;
    }
    ctx.fillStyle = cor; ctx.textBaseline = 'top';
    ctx.textAlign = alinhar === 'right' ? 'right' : alinhar === 'center' ? 'center' : 'left';
    const lh = tam * 1.25, alt = linhas.length * lh;
    let y = vmeio ? cx.y + (cx.h - alt) / 2 : cx.y;
    const x = alinhar === 'right' ? cx.x + cx.w : alinhar === 'center' ? cx.x + cx.w / 2 : cx.x;
    linhas.forEach(l => { ctx.fillText(l, x, y); y += lh; });
}
// desenha os itens no ctx já com a transformação do mundo aplicada
function kbDesenhar(ctx, itens, { imagens = true, z = 1 } = {}) {
    const ord = [...itens.filter(i => i.tipo === 'frame'), ...itens.filter(i => i.tipo === 'seta'), ...itens.filter(i => i.tipo !== 'frame' && i.tipo !== 'seta')];
    const pequeno = z < .12;
    for (const it of ord) {
        ctx.save();
        if (it.tipo === 'frame') {
            ctx.fillStyle = it.cor || '#fff'; ctx.shadowColor = 'rgba(0,0,0,.12)'; ctx.shadowBlur = 8 * Math.min(1, z * 4);
            ctx.fillRect(it.x, it.y, it.w, it.h); ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1 / z; ctx.strokeRect(it.x, it.y, it.w, it.h);
            if (!pequeno) { ctx.fillStyle = kbTema().tinta; ctx.globalAlpha = .65; const fz = Math.min(14 / z, it.w / 14); ctx.font = `500 ${fz}px ${kbFonte()}`; ctx.textBaseline = 'bottom'; ctx.fillText(it.nome || 'Frame', it.x, it.y - fz * .3, it.w); }
        } else if (it.tipo === 'nota') {
            ctx.fillStyle = it.cor; ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 6 * Math.min(1, z * 3); ctx.shadowOffsetY = 2 * Math.min(1, z * 3);
            ctx.fillRect(it.x, it.y, it.w, it.h); ctx.shadowColor = 'transparent';
            if (!pequeno) kbTextoCanvas(ctx, it.html, { x: it.x + it.w * .08, y: it.y + it.h * .08, w: it.w * .84, h: it.h * .84 },
                { cor: kbEscura(it.cor) ? '#fff' : '#1a1a1a', fs: it.fs || 40, auto: !it.fs, alinhar: it.alinhar });
        } else if (it.tipo === 'forma') {
            const p = new Path2D(kbFormaPath(it.forma, it.w, it.h, +it.esp || 0));
            ctx.translate(it.x, it.y);
            if (it.preench && it.preench !== 'none') { ctx.fillStyle = it.preench; ctx.fill(p); }
            if (+it.esp) { ctx.strokeStyle = it.borda; ctx.lineWidth = +it.esp; if (it.tracejado) ctx.setLineDash([it.esp * 3, it.esp * 2]); ctx.stroke(p); }
            const a = KB_TXT_AREA[it.forma] || [.06, .06, .88, .88];
            if (!pequeno) kbTextoCanvas(ctx, it.html, { x: a[0] * it.w, y: a[1] * it.h, w: a[2] * it.w, h: a[3] * it.h }, { cor: it.corTexto, fs: it.fs || 40, auto: !it.fs, alinhar: it.alinhar });
        } else if (it.tipo === 'texto') {
            if (!pequeno) kbTextoCanvas(ctx, it.html, { x: it.x, y: it.y, w: it.w, h: it.h }, { cor: it.cor, fs: it.fs, alinhar: it.alinhar, vmeio: false });
            else { ctx.fillStyle = it.cor; ctx.globalAlpha = .35; ctx.fillRect(it.x, it.y + it.h * .3, it.w * .8, it.h * .4); }
        } else if (it.tipo === 'imagem') {
            const im = imagens && kbImg(it.src);
            if (im && im.complete && im.naturalWidth) ctx.drawImage(im, it.x, it.y, it.w, it.h);
            else { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(it.x, it.y, it.w, it.h); }
        } else if (it.tipo === 'caneta') {
            ctx.translate(it.x, it.y);
            ctx.strokeStyle = it.cor; ctx.lineWidth = it.esp || 3; ctx.lineCap = ctx.lineJoin = 'round';
            if (it.marca) ctx.globalAlpha = .38;
            ctx.stroke(new Path2D(kbCanetaPath(it)));
        } else if (it.tipo === 'seta') {
            const g = kbSetaGeo(it); if (!g) { ctx.restore(); continue; }
            ctx.strokeStyle = ctx.fillStyle = it.cor; ctx.lineWidth = +it.esp || 2; ctx.lineCap = 'round';
            if (it.tracejado) ctx.setLineDash([it.esp * 4, it.esp * 3]);
            ctx.stroke(new Path2D(g.d)); ctx.setLineDash([]);
            [[it.pontaA, g.fimA], [it.pontaB, g.fimB]].forEach(([t, f]) => { const d = kbPontaPath(t, f[0], f[1], +it.esp || 2); if (d) { if (t === 'linha') ctx.stroke(new Path2D(d)); else ctx.fill(new Path2D(d)); } });
            if (it.rotulo && !pequeno) {
                ctx.font = `500 14px ${kbFonte()}`; const tx = kbTextoPuro(it.rotulo), w = ctx.measureText(tx).width + 12;
                ctx.fillStyle = kbTema().bg; ctx.fillRect(g.meio[0] - w / 2, g.meio[1] - 11, w, 22);
                ctx.fillStyle = it.cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tx, g.meio[0], g.meio[1]);
            }
        }
        ctx.restore();
    }
}
// imagem de uma área do quadro (cx no mundo) em W×H (ou escala)
function kbRaster(itens, cx, W, H, { fundo = true, imagens = true, pontos = true } = {}) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), tema = kbTema();
    const z = Math.min(W / Math.max(cx.w, 1), H / Math.max(cx.h, 1));
    const ox = (W - cx.w * z) / 2 - cx.x * z, oy = (H - cx.h * z) / 2 - cx.y * z;
    if (fundo) {
        ctx.fillStyle = tema.bg; ctx.fillRect(0, 0, W, H);
        if (pontos && (KB.doc.fundo || 'pontos') !== 'liso') {
            let passo = 24 * z; for (let i = 0; i < 40 && passo < 10; i++) passo *= 2;
            ctx.fillStyle = tema.ponto;
            for (let x = ((ox % passo) + passo) % passo; x < W; x += passo) for (let y = ((oy % passo) + passo) % passo; y < H; y += passo) ctx.fillRect(x - .5, y - .5, 1.2, 1.2);
        }
    }
    ctx.setTransform(z, 0, 0, z, ox, oy);
    kbDesenhar(ctx, itens, { imagens, z });
    return cv;
}
async function kbThumb() {
    if (!KB.doc) return '';
    const itens = KB.doc.itens;
    await kbEsperarImgs(itens);
    const cx = itens.length ? kbCaixaTudo(itens) : { x: 0, y: 0, w: 800, h: 500 };
    const m = Math.max(cx.w, cx.h) * .06 + 20;
    const area = { x: cx.x - m, y: cx.y - m, w: cx.w + m * 2, h: cx.h + m * 2 };
    // prévia 16:10 que mostra o quadro inteiro
    const alvo = 16 / 10; if (area.w / area.h > alvo) { const h = area.w / alvo; area.y -= (h - area.h) / 2; area.h = h; } else { const w = area.h * alvo; area.x -= (w - area.w) / 2; area.w = w; }
    let cv = kbRaster(itens, area, 560, 350);
    try { return cv.toDataURL('image/png'); }
    catch (e) { cv = kbRaster(itens, area, 560, 350, { imagens: false }); return cv.toDataURL('image/png'); }
}

// minimapa (canto de baixo): quadro inteiro + retângulo da vista
function kbMinimapa() {
    const cv = kbEl('kbo-mini'); if (!cv || cv.hidden || !KB.doc) return;
    clearTimeout(KB.miniT);
    KB.miniT = setTimeout(() => {
        const vp = kbEl('kbo-vp'), W = cv.width, H = cv.height;
        const vista = { x: -KB.cam.x / KB.cam.z, y: -KB.cam.y / KB.cam.z, w: vp.clientWidth / KB.cam.z, h: vp.clientHeight / KB.cam.z };
        const tudo = kbUniao([vista, ...(KB.doc.itens.length ? [kbCaixaTudo()] : [])]);
        const m = Math.max(tudo.w, tudo.h) * .05;
        const area = { x: tudo.x - m, y: tudo.y - m, w: tudo.w + m * 2, h: tudo.h + m * 2 };
        const ctx = cv.getContext('2d');
        const src = kbRaster(KB.doc.itens, area, W, H, { pontos: false });
        ctx.clearRect(0, 0, W, H); ctx.drawImage(src, 0, 0);
        const z = Math.min(W / area.w, H / area.h), ox = (W - area.w * z) / 2 - area.x * z, oy = (H - area.h * z) / 2 - area.y * z;
        ctx.strokeStyle = veAccSeguro(); ctx.lineWidth = 2; ctx.fillStyle = veAccSeguro(.12);
        ctx.fillRect(vista.x * z + ox, vista.y * z + oy, vista.w * z, vista.h * z);
        ctx.strokeRect(vista.x * z + ox, vista.y * z + oy, vista.w * z, vista.h * z);
        cv._map = { z, ox, oy };
    }, 60);
}
const veAccSeguro = a => (typeof veAcc === 'function' ? veAcc(a) : (a == null ? '#FFC933' : `rgba(255,201,51,${a})`));

// ───────────── abrir / fechar quadro ─────────────
async function kbAbrir(bid) {
    const a = kbApi(); if (!a) return;
    if (KB.bid && KB.bid !== bid) await kbFecharQuadro(true);
    const r = await a.kb_abrir(bid);
    if (!r || !r.success) { kbToast('Não abriu o quadro: ' + ((r && r.error) || ''), 'erro'); return; }
    const info = KB.lista.find(b => b.id === bid);
    kbCarregar(r.doc, r.midia_url, bid, !info || !info.thumb);
}
function kbCarregar(doc, midiaUrl, bid, semThumb) {
    kbMontar();
    KB.doc = Object.assign(kbDocVazio(), doc); KB.doc.itens = KB.doc.itens || [];
    KB.bid = bid; KB.midiaUrl = midiaUrl || ''; KB.hist = []; KB.futuro = []; KB.sel.clear(); KB.editando = null;
    KB.sujo = false; KB.camSuja = false; KB.thumbEm = 0;
    ['kbo-frames', 'kbo-setas', 'kbo-itens', 'kbo-rotulos'].forEach(id => { const e = kbEl(id); if (e) e.textContent = ''; });
    KB.els.clear(); KB.ordemSig = '';
    kbEl('kbo-inicio').hidden = true; kbEl('kbo-editor').hidden = false;
    kbEl('kbo-nome').value = KB.doc.nome || 'Sem título';
    kbFerramenta('sel');
    kbRenderTudo();
    if (KB.doc.cam && KB.doc.cam.z) { KB.cam = { ...KB.doc.cam }; kbAplicarCam(); } else kbAjustarTudo(false);
    KB.camSuja = false;
    kbStatus('Salvo');
    kbPainelFrames(false);
    if (typeof kbFramesLista === 'function') kbFramesLista();
    // prévia do quadro novo (ou de quadro antigo sem prévia) logo que abre
    if (semThumb) setTimeout(() => { if (KB.bid === bid) { KB.sujo = true; kbSalvarJa(true); } }, 900);
}
async function kbFecharQuadro(semLobby) {
    if (!KB.doc) { if (!semLobby) kbLobby(); return; }
    kbSairEdicao(true);
    if (KB.sujo || KB.thumbPendente) { KB.sujo = true; await kbSalvarJa(true); }
    else if (KB.camSuja) await kbSalvarJa();
    if (KB.salvando) await KB.salvando;
    KB.doc = null; KB.bid = null; KB.sel.clear();
    if (!semLobby) kbLobby();
}

// ───────────── API do agente ─────────────
window.KBO_API = {
    estado: () => ({ aberto: KB.bid, nome: KB.doc && KB.doc.nome, itens: KB.doc ? KB.doc.itens.length : 0, sel: [...KB.sel], cam: { ...KB.cam }, ferramenta: KB.ferramenta, editando: KB.editando, desfazer: KB.hist.length }),
    listar: async () => (await kbApi().kb_listar()),
    novo: async (nome, modelo) => kbCriarQuadro(nome, modelo),
    abrir: id => kbAbrir(id),
    fechar: () => kbFecharQuadro(),
    itens: () => kbClone(KB.doc ? KB.doc.itens : []),
    add: (tipo, o) => { const it = kbNovoItem(tipo, o); kbMudar(() => KB.doc.itens.push(it)); return it.id; },
    mexer: (id, o) => kbMudar(() => Object.assign(kbItem(id), o)),
    selecionar: ids => { KB.sel = new Set(ids); kbPintarUi(); },
    salvar: () => kbSalvarJa(true),
    ajustar: () => kbAjustarTudo(false),
    thumb: () => kbThumb(),
};
