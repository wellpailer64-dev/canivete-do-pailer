// =========================================================
// Slider Kanivete (Sd, verde-água) — apresentações 16:9: um PowerPoint moderno (Canva/Figma) dentro do Kanivete.
// NÚCLEO: documento, camadas, desenho (o MESMO desenho serve à mesa, às miniaturas, à apresentação e à exportação),
// histórico, comandos (SD_CMDS: interface, atalhos e agente usam os mesmos — window.SDK.cmd) e exportação.
// Interface em slider-ui.js, apresentação em slider-show.js, estilo em css/slider.css, Python em Functions/slider_kanivete.py.
// Guia: Instructions/slider-kanivete.md
// =========================================================
const SD = {
    doc: null, atual: 0, sel: [], hist: [], futuro: [], arquivo: null, sujo: false,
    urls: {}, posters: {}, dados: {},      // caminho → URL do servidor local · capa do vídeo · data URL (exportar)
    curto: false, ouvintes: [],
};
const SD_RASCUNHO = 'sd-rascunho', SD_RECENTES = 'sd-recentes';   // (as paletas ficam em IE.prefs, ver slider-cores.js)
const sdApi = () => window.pywebview && window.pywebview.api;
const sdEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sdId = () => Math.random().toString(36).slice(2, 10);
const sdClone = o => JSON.parse(JSON.stringify(o));

// ───────────── documento e modelos de slide ─────────────
const SD_TEMA = { titulo: 'Jost', texto: 'Jost', cores: { fundo: '#ffffff', tinta: '#0f1b2d', destaque: '#16b8a6', suave: '#eef3f6', apoio: '#5b6b7c' } };
// temas prontos (lobby › Modelos e painel Design): fontes e as 5 cores (fundo/tinta formam o par de contraste)
const SD_TEMAS = {
    claro: { nome: 'Claro', titulo: 'Jost', texto: 'Jost', cores: { fundo: '#ffffff', tinta: '#0f1b2d', destaque: '#16b8a6', suave: '#eef3f6', apoio: '#5b6b7c' } },
    escuro: { nome: 'Escuro', titulo: 'Poppins', texto: 'Inter', cores: { fundo: '#0e1116', tinta: '#f2f5f7', destaque: '#2ee6c8', suave: '#1a2029', apoio: '#9aa7b4' } },
    editorial: { nome: 'Editorial', titulo: 'Fraunces', texto: 'Jost', cores: { fundo: '#f6f0e4', tinta: '#1f2a44', destaque: '#f08a5d', suave: '#ebe3d3', apoio: '#5c6577' } },
    corporativo: { nome: 'Corporativo', titulo: 'Montserrat', texto: 'Lato', cores: { fundo: '#ffffff', tinta: '#13294b', destaque: '#2f6fed', suave: '#eef2fb', apoio: '#56627a' } },
};
// apresentação pronta para editar: capa, seção, conteúdo, tópicos, número, citação e encerramento no tema
// formatos de página: palestra 16:9 e documento (orçamento, contrato, informativo) em folha A4 — 1191 × 1684 px
// = 595,5 × 842 pt no PDF (o _pdf crava o A4 exato); camadas em px como no 16:9
const SD_FORMATOS = { '16:9': { nome: 'Apresentação 16:9', tam: [1920, 1080] }, a4: { nome: 'Documento A4 (em pé)', tam: [1191, 1684] }, a4_deitado: { nome: 'A4 deitado', tam: [1684, 1191] } };
const sdTamFormato = f => (SD_FORMATOS[f] || SD_FORMATOS['16:9']).tam;
function sdDocModelo(tema = 'claro', nome = 'Palestra', formato = '16:9') {
    const T = sdClone(SD_TEMAS[tema] || SD_TEMAS.claro); delete T.nome;
    const [W, H] = sdTamFormato(formato), d = { nome, largura: W, altura: H, tema: T, slides: [] };
    for (const l of ['titulo', 'secao', 'titulo_texto', 'lista', 'imagem_lateral', 'numero', 'citacao', 'encerramento']) d.slides.push(sdNovoSlide(l, null, T, [W, H]));
    return d;
}
function sdNovoDoc(nome = 'Apresentação', formato = '16:9') {
    const [W, H] = sdTamFormato(formato);
    return { nome, largura: W, altura: H, tema: sdClone(SD_TEMA), slides: [sdNovoSlide('titulo', null, SD_TEMA, [W, H])] };
}
const SD_LAYOUTS = {
    vazio: 'Em branco', titulo: 'Capa', titulo_texto: 'Título e texto', duas_colunas: 'Duas colunas', imagem_lateral: 'Imagem e texto',
    secao: 'Abertura de seção', citacao: 'Citação', numero: 'Número grande', lista: 'Tópicos', encerramento: 'Encerramento',
};
function sdTxt(o, tema) {
    const T = tema || (SD.doc && SD.doc.tema) || SD_TEMA;
    return { id: sdId(), tipo: 'texto', x: 140, y: 120, w: 1640, h: 120, rot: 0, opac: 1, fonte: T.texto, tam: 40, peso: 400,
             cor: T.cores.tinta, alin: 'esq', valin: 'topo', entrelinha: 1.25, espaco: 0, ...o };
}
// luminância relativa (0 = preto, 1 = branco): os layouts escolhem o par escuro/claro do tema por ela
function sdLum(h) { const m = String(h || '').match(/^#?([0-9a-f]{6})/i); if (!m) return 1; const v = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; }
// contraste (WCAG) e cor legível: escurece/clareia a cor até chegar no mínimo contra o fundo (o destaque de um tema
// claro, ex. verde-água no branco, fica 2,5:1 — no número grande/subtítulo ele vira um tom mais fechado da MESMA cor)
const sdContrasteCor = (a, b) => { const la = sdLum(a), lb = sdLum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
function sdLegivel(cor, fundo, min = 3) {
    if (!/^#[0-9a-f]{6}/i.test(cor || '') || !/^#[0-9a-f]{6}/i.test(fundo || '') || sdContrasteCor(cor, fundo) >= min) return cor;
    const alvo = sdLum(fundo) > 0.4 ? '#000000' : '#ffffff', p = [0, 2, 4].map(i => parseInt(cor.slice(1 + i, 3 + i), 16)), q = [0, 2, 4].map(i => parseInt(alvo.slice(1 + i, 3 + i), 16));
    for (let t = 0.05; t <= 1; t += 0.05) {
        const c = '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('');
        if (sdContrasteCor(c, fundo) >= min) return c;
    }
    return alvo;
}
function sdNovoSlide(layout = 'titulo_texto', ref = null, tema = null, tam = null) {
    const s = sdNovoSlide169(layout, ref, tema), [W, H] = tam || (SD.doc ? [SD.doc.largura, SD.doc.altura] : [1920, 1080]);
    if (W === 1920 && H === 1080) return s;
    // outra página (A4…): os layouts são desenhados em 1920 × 1080; tamanho pela largura, altura proporcional à página
    const k = W / 1920, ky = H / 1080;
    for (const c of s.camadas) {
        const cheia = c.h >= 1080;
        c.x = Math.round(c.x * k); c.w = Math.round(c.w * k); c.y = Math.round(cheia ? 0 : (c.y + c.h / 2) * ky - c.h * k / 2); c.h = Math.round(cheia ? H : c.h * k);
        if (c.tam) c.tam = Math.max(8, Math.round(c.tam * k * 1.25));
    }
    return s;
}
function sdNovoSlide169(layout = 'titulo_texto', ref = null, tema = null) {
    const T = tema || (SD.doc && SD.doc.tema) || SD_TEMA, C0 = T.cores, tit = o => sdTxt({ fonte: T.titulo, peso: 600, entrelinha: 1.05, ...o }, T);
    const esc = sdLum(C0.fundo) < sdLum(C0.tinta) ? C0.fundo : C0.tinta, clr = esc === C0.fundo ? C0.tinta : C0.fundo;
    const sobreDest = sdLum(C0.destaque) > 0.35 ? esc : clr;   // texto em cima do destaque
    const C = { ...C0, escuro: esc, claro: clr, sobreDest, destEsc: sdLegivel(C0.destaque, esc), destFundo: sdLegivel(C0.destaque, C0.fundo), apoioFundo: sdLegivel(C0.apoio, C0.fundo, 4.5) };
    const s = { id: sdId(), fundo: { tipo: 'cor', cor: C.fundo }, transicao: { tipo: 'esmaecer', dur: 0.5 }, dur: 5, notas: '', camadas: [] };
    const L = s.camadas;
    if (layout === 'titulo') {
        s.fundo = { tipo: 'cor', cor: C.escuro };
        L.push({ id: sdId(), tipo: 'forma', nome: 'Faixa', forma: 'ret', x: 140, y: 300, w: 120, h: 12, rot: 0, opac: 1, preench: C.destaque, raio: 6 });
        L.push(tit({ nome: 'Título', html: 'Título da apresentação', x: 140, y: 350, w: 1500, h: 260, tam: 112, cor: C.claro }));
        L.push(sdTxt({ nome: 'Subtítulo', html: 'Palestrante · data', x: 144, y: 640, w: 1200, h: 60, tam: 40, cor: C.destEsc }, T));
    } else if (layout === 'titulo_texto') {
        L.push(tit({ nome: 'Título', html: 'Título do slide', y: 110, h: 120, tam: 76 }));
        L.push(sdTxt({ nome: 'Texto', html: 'Escreva aqui o conteúdo do slide. Clique duas vezes para editar.', y: 290, h: 600, tam: 44, cor: C.apoioFundo }, T));
    } else if (layout === 'duas_colunas') {
        L.push(tit({ nome: 'Título', html: 'Comparação', y: 110, h: 120, tam: 76 }));
        L.push(sdTxt({ nome: 'Coluna 1', html: '<b>Antes</b><br>Ponto um<br>Ponto dois', x: 140, y: 300, w: 780, h: 560, tam: 40 }, T));
        L.push(sdTxt({ nome: 'Coluna 2', html: '<b>Depois</b><br>Ponto um<br>Ponto dois', x: 1000, y: 300, w: 780, h: 560, tam: 40 }, T));
    } else if (layout === 'imagem_lateral') {
        L.push({ id: sdId(), tipo: 'forma', nome: 'Espaço da imagem', forma: 'ret', x: 960, y: 0, w: 960, h: 1080, rot: 0, opac: 1, preench: C.suave, raio: 0 });
        L.push(tit({ nome: 'Título', html: 'Título', x: 140, y: 320, w: 700, h: 140, tam: 80 }));
        L.push(sdTxt({ nome: 'Texto', html: 'Texto curto que acompanha a imagem.', x: 140, y: 500, w: 700, h: 300, tam: 40, cor: C.apoioFundo }, T));
    } else if (layout === 'secao') {
        s.fundo = { tipo: 'cor', cor: C.destaque };
        L.push(tit({ nome: 'Número', html: '01', x: 140, y: 230, w: 600, h: 260, tam: 200, peso: 300, cor: C.sobreDest }));
        L.push(tit({ nome: 'Título', html: 'Nome da seção', x: 140, y: 520, w: 1640, h: 160, tam: 110, cor: C.sobreDest }));
    } else if (layout === 'citacao') {
        s.fundo = { tipo: 'cor', cor: C.suave };
        L.push(tit({ nome: 'Aspas', html: '“', x: 140, y: 120, w: 300, h: 300, tam: 360, cor: C.destaque, peso: 500, entrelinha: 0.7 }));
        L.push(tit({ nome: 'Citação', html: 'Uma frase forte que resume a ideia do slide.', x: 260, y: 380, w: 1400, h: 300, tam: 80, peso: 500 }));
        L.push(sdTxt({ nome: 'Autor', html: '— Nome do autor', x: 264, y: 720, w: 1000, h: 60, tam: 36, cor: sdLegivel(C.apoio, C.suave, 4.5) }, T));
    } else if (layout === 'numero') {
        L.push(tit({ nome: 'Número', html: '87%', x: 140, y: 200, w: 1640, h: 440, tam: 340, cor: C.destFundo, alin: 'centro' }));
        L.push(sdTxt({ nome: 'Legenda', html: 'o que esse número significa', x: 360, y: 680, w: 1200, h: 80, tam: 48, alin: 'centro', cor: C.apoioFundo }, T));
    } else if (layout === 'lista') {
        L.push(tit({ nome: 'Título', html: 'Tópicos', y: 110, h: 120, tam: 76 }));
        [0, 1, 2].forEach(k => {
            L.push({ id: sdId(), tipo: 'forma', nome: `Marcador ${k + 1}`, forma: 'elipse', x: 150, y: 330 + k * 170, w: 28, h: 28, rot: 0, opac: 1, preench: C.destaque });
            L.push(sdTxt({ nome: `Tópico ${k + 1}`, html: `Tópico ${k + 1}`, x: 220, y: 310 + k * 170, w: 1500, h: 80, tam: 48 }, T));
        });
    } else if (layout === 'encerramento') {
        s.fundo = { tipo: 'cor', cor: C.escuro };
        L.push(tit({ nome: 'Título', html: 'Obrigado!', x: 140, y: 380, w: 1640, h: 200, tam: 150, cor: C.claro, alin: 'centro' }));
        L.push(sdTxt({ nome: 'Contato', html: '@perfil · email@exemplo.com', x: 140, y: 620, w: 1640, h: 70, tam: 40, cor: C.destEsc, alin: 'centro' }, T));
    }
    L.forEach(c => { c.nome = c.nome || c.tipo; });
    return s;
}

// ───────────── referências ─────────────
const sdSlides = () => (SD.doc ? SD.doc.slides : []);
function sdSlide(ref) {
    const ss = sdSlides();
    if (ref == null) return ss[SD.atual];
    if (typeof ref === 'number') return ss[ref - 1];
    return ss.find(s => s.id === ref) || ss[+ref - 1];
}
const sdIdx = s => sdSlides().indexOf(s);
function sdCamada(id, s) {
    for (const sl of s ? [s] : sdSlides()) { const c = sl.camadas.find(x => x.id === id || x.nome === id); if (c) return c; }
    return null;
}
const sdSlideDe = id => sdSlides().find(s => s.camadas.some(c => c.id === id));
function sdAlvos(a, s) {
    const sl = s || sdSlide(a.slide);
    const ids = a.ids || (a.id ? [a.id] : SD.sel);
    return ids.map(i => sdCamada(i, sl)).filter(Boolean);
}

// ───────────── URLs das mídias ─────────────
async function sdUrl(p) {
    if (!p) return '';
    if (/^(https?:|data:|blob:)/.test(p)) return p;
    if (SD.urls[p]) return SD.urls[p];
    const r = sdApi() ? await sdApi().sd_url(p) : null;
    return (SD.urls[p] = (r && r.url) || '');
}
async function sdPrepararUrls(doc = SD.doc) {
    const ps = new Set();
    for (const s of doc.slides) { if (s.fundo && s.fundo.img) ps.add(s.fundo.img); s.camadas.forEach(c => c.src && ps.add(c.src)); }
    await Promise.all([...ps].map(sdUrl));
}
const sdSrc = p => (/^(https?:|data:|blob:)/.test(p || '') ? p : SD.urls[p] || '');

// ───────────── desenho ─────────────
const SD_ALIN = { esq: 'left', centro: 'center', dir: 'right', just: 'justify' };
const SD_VALIN = { topo: 'flex-start', meio: 'center', base: 'flex-end' };
const SD_AJUSTE = { cobrir: 'cover', conter: 'contain', esticar: 'fill' };

function sdFormaSvg(c) {
    const w = Math.max(1, +c.w), h = Math.max(1, +c.h), sw = +c.espessura || 0, p = sw / 2, f = c.forma || 'ret';
    const grad = c.preench2 ? `<defs><linearGradient id="g${c.id}" gradientTransform="rotate(${(+c.angulo || 90) - 90} .5 .5)"><stop offset="0" stop-color="${c.preench}"/><stop offset="1" stop-color="${c.preench2}"/></linearGradient></defs>` : '';
    const fill = c.preench2 ? `url(#g${c.id})` : (c.preench || 'none');
    const tr = sw > 0 && c.traco ? ` stroke="${c.traco}" stroke-width="${sw}" stroke-linejoin="round"${c.tracejado ? ` stroke-dasharray="${sw * 3} ${sw * 2}"` : ''}` : '';
    const pol = pts => `<polygon points="${pts.map(q => q.map(v => v.toFixed(2)).join(',')).join(' ')}" fill="${fill}"${tr}/>`;
    const roda = (n, ri = 1, ini = -90) => Array.from({ length: n }, (_, k) => {
        const a = (ini + k * 360 / n) * Math.PI / 180, r = (k % 2 && ri !== 1) ? ri : 1;
        return [w / 2 + Math.cos(a) * (w / 2 - p) * r, h / 2 + Math.sin(a) * (h / 2 - p) * r];
    });
    let corpo;
    if (f === 'ret') corpo = `<rect x="${p}" y="${p}" width="${w - sw}" height="${h - sw}" rx="${Math.min(+c.raio || 0, (w - sw) / 2, (h - sw) / 2)}" fill="${fill}"${tr}/>`;
    else if (f === 'elipse') corpo = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - p)}" ry="${Math.max(0, h / 2 - p)}" fill="${fill}"${tr}/>`;
    else if (f === 'tri') corpo = pol([[w / 2, p], [w - p, h - p], [p, h - p]]);
    else if (f === 'losango') corpo = pol([[w / 2, p], [w - p, h / 2], [w / 2, h - p], [p, h / 2]]);
    else if (f === 'estrela') corpo = pol(roda(10, 0.42));
    else if (f === 'hexagono') corpo = pol(roda(6, 1, 0));
    else if (f === 'seta') corpo = pol([[p, h * .32], [w * .62, h * .32], [w * .62, p], [w - p, h / 2], [w * .62, h - p], [w * .62, h * .68], [p, h * .68]]);
    else if (f === 'coracao') corpo = `<path d="M ${w / 2} ${h * .92} C ${w * .05} ${h * .6} ${w * .02} ${h * .22} ${w * .28} ${h * .1} C ${w * .42} ${h * .04} ${w * .5} ${h * .16} ${w / 2} ${h * .24} C ${w * .5} ${h * .16} ${w * .58} ${h * .04} ${w * .72} ${h * .1} C ${w * .98} ${h * .22} ${w * .95} ${h * .6} ${w / 2} ${h * .92} Z" fill="${fill}"${tr}/>`;
    else if (f === 'balao') { const r = Math.min(+c.raio || 24, w / 4, h / 4), hb = h * .78;
        corpo = `<path d="M ${p + r} ${p} H ${w - p - r} Q ${w - p} ${p} ${w - p} ${p + r} V ${hb - r} Q ${w - p} ${hb} ${w - p - r} ${hb} H ${w * .32} L ${w * .16} ${h - p} L ${w * .2} ${hb} H ${p + r} Q ${p} ${hb} ${p} ${hb - r} V ${p + r} Q ${p} ${p} ${p + r} ${p} Z" fill="${fill}"${tr}/>`; }
    else if (f === 'linha') {
        const e = Math.max(1, sw || 6), cor = c.traco || c.preench || '#000', ponta = c.ponta === 'seta';
        corpo = (ponta ? `<defs><marker id="m${c.id}" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="${cor}"/></marker></defs>` : '') +
            `<line x1="${e}" y1="${h / 2}" x2="${w - e * (ponta ? 3 : 1)}" y2="${h / 2}" stroke="${cor}" stroke-width="${e}" stroke-linecap="round"${c.tracejado ? ` stroke-dasharray="${e * 3} ${e * 2}"` : ''}${ponta ? ` marker-end="url(#m${c.id})"` : ''}/>`;
    } else corpo = `<rect width="${w}" height="${h}" fill="${fill}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible">${grad}${corpo}</svg>`;
}

// uma camada → elemento com TODOS os estilos inline (a foto do slide para exportar não vê o CSS do app)
function sdCamadaEl(c, modo = 'edit') {
    const el = document.createElement('div');
    el.className = 'sd-c sd-' + c.tipo; el.dataset.id = c.id;
    const st = el.style;
    st.position = 'absolute'; st.boxSizing = 'border-box';
    st.left = c.x + 'px'; st.top = c.y + 'px'; st.width = c.w + 'px'; st.height = c.h + 'px';
    if (+c.rot) st.transform = `rotate(${c.rot}deg)`;
    if (c.opac != null && c.opac < 1) st.opacity = c.opac;
    if (c.mescla && c.mescla !== 'normal') st.mixBlendMode = c.mescla;
    const fx = [];
    if (c.sombra) fx.push(`drop-shadow(${c.sombra.x || 0}px ${c.sombra.y ?? 10}px ${c.sombra.desf ?? 30}px ${c.sombra.cor || 'rgba(0,0,0,.35)'})`);
    if (+c.desfoque) fx.push(`blur(${c.desfoque}px)`);
    if (fx.length) st.filter = fx.join(' ');
    if (c.oculto) { if (modo === 'edit') el.classList.add('sd-oculto'); else st.display = 'none'; }
    if (c.tipo === 'texto') {
        st.display = 'flex'; st.flexDirection = 'column'; st.justifyContent = SD_VALIN[c.valin || 'topo'];
        if (c.fundo) { st.background = c.fundo; st.borderRadius = (+c.raio || 0) + 'px'; }
        if (+c.pad) st.padding = c.pad + 'px';
        const t = document.createElement('div'); t.className = 'sd-txt';
        Object.assign(t.style, {
            fontFamily: `"${c.fonte || 'Jost'}"`, fontSize: (+c.tam || 40) + 'px', fontWeight: c.peso || 400, fontStyle: c.italico ? 'italic' : 'normal',
            textDecoration: c.sublinhado ? 'underline' : 'none', color: c.cor || '#111', textAlign: SD_ALIN[c.alin || 'esq'],
            lineHeight: String(c.entrelinha || 1.2), letterSpacing: (+c.espaco || 0) + 'px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
            textTransform: c.caixa === 'alta' ? 'uppercase' : c.caixa === 'baixa' ? 'lowercase' : 'none', outline: 'none', margin: '0',
        });
        if (c.contorno) t.style.webkitTextStroke = `${c.contorno.esp || 2}px ${c.contorno.cor || '#000'}`;
        if (c.sombraTexto) t.style.textShadow = `${c.sombraTexto.x || 0}px ${c.sombraTexto.y ?? 4}px ${c.sombraTexto.desf ?? 12}px ${c.sombraTexto.cor || 'rgba(0,0,0,.4)'}`;
        t.innerHTML = c.html != null ? c.html : sdEsc(c.texto || '');
        el.appendChild(t);
    } else if (c.tipo === 'forma') {
        el.innerHTML = sdFormaSvg(c);
    } else if (c.tipo === 'grafico') {
        el.innerHTML = typeof sdGraficoSvg === 'function' ? sdGraficoSvg(c) : '';
    } else if (c.tipo === 'imagem' || (c.tipo === 'video' && modo === 'foto')) {
        const im = document.createElement('img');
        im.src = modo === 'foto' ? (SD.dados[c.src + (c.tipo === 'video' ? '#q' : '')] || '') : sdSrc(c.src);
        im.draggable = false; im.alt = '';
        Object.assign(im.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', objectFit: SD_AJUSTE[c.ajuste || 'cobrir'] || 'cover',
            objectPosition: `${c.focoX ?? 50}% ${c.focoY ?? 50}%`, borderRadius: (+c.raio || 0) + 'px', display: 'block' });
        const fl = c.filtros || {};
        const f2 = [fl.brilho != null && fl.brilho !== 100 ? `brightness(${fl.brilho}%)` : '', fl.contraste != null && fl.contraste !== 100 ? `contrast(${fl.contraste}%)` : '',
            fl.saturacao != null && fl.saturacao !== 100 ? `saturate(${fl.saturacao}%)` : '', +fl.pb ? `grayscale(${fl.pb}%)` : ''].filter(Boolean).join(' ');
        if (f2) im.style.filter = f2;
        if (c.borda && +c.borda.esp) { im.style.boxSizing = 'border-box'; im.style.border = `${c.borda.esp}px solid ${c.borda.cor || '#fff'}`; }
        el.appendChild(im);
    } else if (c.tipo === 'video') {
        if (modo === 'mini') {
            const cap = SD.posters[c.src];
            el.innerHTML = cap ? `<img src="${cap}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${SD_AJUSTE[c.ajuste || 'cobrir']};border-radius:${+c.raio || 0}px">`
                : '<div style="position:absolute;inset:0;background:#0d1117;border-radius:8px"></div>';
            el.insertAdjacentHTML('beforeend', '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:22%;max-width:160px;aspect-ratio:1;border-radius:50%;background:rgba(0,0,0,.45);display:grid;place-items:center;color:#fff;font:700 60px sans-serif">▶</div>');
        } else {
            const v = document.createElement('video');
            v.crossOrigin = 'anonymous'; v.src = sdSrc(c.src); v.muted = modo !== 'show' || !!c.mudo; v.playsInline = true; v.preload = 'auto'; v.loop = !!c.loop;
            Object.assign(v.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', objectFit: SD_AJUSTE[c.ajuste || 'cobrir'] || 'cover', borderRadius: (+c.raio || 0) + 'px', display: 'block' });
            v.addEventListener('loadeddata', () => { if (modo !== 'show') { try { v.currentTime = Math.max(0.05, +c.ini || 0); } catch (e) { /* sem busca */ } } }, { once: true });
            v.addEventListener('seeked', () => sdGuardarPoster(c.src, v), { once: true });
            el.appendChild(v);
        }
    }
    return el;
}
function sdGuardarPoster(p, v) {
    if (SD.posters[p] || !v.videoWidth) return;
    try {
        const k = 360 / Math.max(v.videoWidth, v.videoHeight), cv = document.createElement('canvas');
        cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
        cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); SD.posters[p] = cv.toDataURL('image/jpeg', .8);
        sdAvisar('posters');
    } catch (e) { /* vídeo de outra origem */ }
}
function sdFundoEl(s, modo) {
    const f = s.fundo || { tipo: 'cor', cor: '#fff' }, el = document.createElement('div');
    el.className = 'sd-fundo';
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    if (f.tipo === 'degrade') el.style.background = `linear-gradient(${+f.angulo || 135}deg, ${f.cor || '#fff'}, ${f.cor2 || '#000'})`;
    else el.style.background = f.cor || '#fff';
    if (f.tipo === 'imagem' && f.img) {
        const src = modo === 'foto' ? SD.dados[f.img] : sdSrc(f.img);
        el.innerHTML = `<img src="${sdEsc(src || '')}" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:${SD_AJUSTE[f.ajuste || 'cobrir']}" alt="">` +
            (+f.escurecer ? `<div style="position:absolute;inset:0;background:#000;opacity:${+f.escurecer}"></div>` : '');
    }
    return el;
}
function sdMontarSlide(s, modo = 'edit') {
    const W = SD.doc.largura, H = SD.doc.altura, el = document.createElement('div');
    el.className = 'sd-slide'; el.dataset.slide = s.id;
    Object.assign(el.style, { position: 'relative', width: W + 'px', height: H + 'px', overflow: 'hidden', background: '#fff' });
    el.appendChild(sdFundoEl(s, modo));
    for (const c of s.camadas) el.appendChild(sdCamadaEl(c, modo));
    return el;
}

// ───────────── fontes: famílias que o navegador não enxerga pelo nome (variáveis/instaladas só para o usuário,
// nome GDI diferente) entram por FontFace com o arquivo; a foto de exportação leva as mesmas como @font-face embutida ─────────────
SD.fontesArq = {}; SD.fontesTentadas = new Set();
function sdFonteNativa(f) {
    const c = (sdFonteNativa.cv = sdFonteNativa.cv || document.createElement('canvas').getContext('2d')), t = 'Tópicos mmmwwwiii 0123';
    return ['monospace', 'serif'].every(base => { c.font = `40px ${base}`; const a = c.measureText(t).width; c.font = `40px "${f}", ${base}`; return Math.abs(c.measureText(t).width - a) > 0.5; });
}
function sdFamilias(doc = SD.doc) {
    const fs = new Set([doc.tema && doc.tema.titulo, doc.tema && doc.tema.texto]);
    for (const s of doc.slides) for (const c of s.camadas) if (c.fonte) fs.add(c.fonte);
    fs.delete(undefined); fs.delete(null); fs.delete('');
    return [...fs];
}
async function sdGarantirFontes(doc = SD.doc) {
    if (!doc || !sdApi()) return;
    const faltam = sdFamilias(doc).filter(f => !SD.fontesTentadas.has(f) && !sdFonteNativa(f));
    if (!faltam.length) return;
    faltam.forEach(f => SD.fontesTentadas.add(f));
    if (!SD.estilosFonte) { try { const r = await sdApi().ve_fontes(); SD.estilosFonte = (r && r.estilos) || {}; } catch (e) { SD.estilosFonte = {}; } }
    let alguma = false;
    for (const f of faltam) {
        const ests = SD.estilosFonte[f] || SD.estilosFonte[Object.keys(SD.estilosFonte).find(k => k.toLowerCase() === f.toLowerCase())] || [];
        const vistos = new Set(), lista = [];
        for (const e of ests) {
            if (!e.arquivo || e.indice > 0) continue;
            const chave = e.arquivo + (e.var ? '' : '#' + e.peso + e.italico); if (vistos.has(chave)) continue; vistos.add(chave);
            try {
                const r = await sdApi().ie_fonte_url(e.arquivo); if (!r || !r.success) continue;
                const d = { url: r.url, path: e.arquivo, weight: e.var ? `${e.var[0]} ${e.var[1]}` : String(e.peso || 400), style: e.italico ? 'italic' : 'normal' };
                const ff = new FontFace(f, `url("${r.url}")`, { weight: d.weight, style: d.style }); await ff.load(); document.fonts.add(ff);
                lista.push(d); alguma = true;
            } catch (x) { /* arquivo que o navegador não lê */ }
        }
        if (lista.length) SD.fontesArq[f] = lista;
    }
    if (alguma) sdAvisar('tudo');
}
async function sdCssFontes(s) {   // @font-face embutida (data URL) das famílias carregadas por arquivo usadas no slide
    const usadas = new Set(s.camadas.map(c => c.fonte).filter(Boolean)); let css = '';
    for (const f of usadas) for (const d of SD.fontesArq[f] || []) {
        const k = 'fonte:' + d.path + d.weight + d.style;
        if (!SD.dados[k]) { const b = await (await fetch(d.url)).blob(); SD.dados[k] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }
        css += `@font-face{font-family:"${f}";src:url(${SD.dados[k]});font-weight:${d.weight};font-style:${d.style}}`;
    }
    return css;
}

// ───────────── histórico e mudanças ─────────────
function sdHist() {
    SD.hist.push(JSON.stringify({ doc: SD.doc, atual: SD.atual }));
    if (SD.hist.length > 150) SD.hist.shift();
    SD.futuro = [];
}
function sdMudou(qual = 'tudo') {
    SD.sujo = true; sdAvisar(qual); sdGarantirFontes();
    clearTimeout(SD.tg); SD.tg = setTimeout(sdGuardarRascunho, 1200);
}
function sdAvisar(qual) { for (const f of SD.ouvintes) { try { f(qual); } catch (e) { console.warn(e); } } }
function sdDesfazer(volta = false) {
    const de = volta ? SD.futuro : SD.hist, para = volta ? SD.hist : SD.futuro;
    if (!de.length) return false;
    para.push(JSON.stringify({ doc: SD.doc, atual: SD.atual }));
    const f = JSON.parse(de.pop());
    SD.doc = f.doc; SD.atual = Math.min(f.atual, SD.doc.slides.length - 1);
    SD.sel = SD.sel.filter(id => sdCamada(id, sdSlide()));
    sdMudou('tudo'); return true;
}
function sdGuardarRascunho() {
    if (!SD.doc) return;
    try { localStorage.setItem(SD_RASCUNHO, JSON.stringify({ doc: SD.doc, arquivo: SD.arquivo, sujo: SD.sujo })); } catch (e) { /* cheio: só nesta sessão */ }
}
function sdRascunho() { try { return JSON.parse(localStorage.getItem(SD_RASCUNHO) || 'null'); } catch (e) { return null; } }
function sdRecentes() { try { return JSON.parse(localStorage.getItem(SD_RECENTES) || '[]'); } catch (e) { return []; } }
function sdRecenteAdd(p) { try { localStorage.setItem(SD_RECENTES, JSON.stringify([p, ...sdRecentes().filter(x => x !== p)].slice(0, 10))); } catch (e) { /* ok */ } }
const sdNomeArq = p => (p || '').split(/[\\/]/).pop().replace(/\.dknv$/i, '');

// ───────────── comandos (interface, atalhos e agente) ─────────────
const SD_CMDS = {};
function sdRegistrar(nome, desc, fn, op = {}) { SD_CMDS[nome] = { desc, fn, ...op }; }
async function sdCmd(nome, a = {}) {
    const C = SD_CMDS[nome]; if (!C) throw new Error(`comando "${nome}" não existe; veja SDK.comandos()`);
    if (!SD.doc && !C.semDoc) sdCarregar(sdNovoDoc());
    if (!C.leitura) sdHist();
    let r;
    try { r = await C.fn(a); } catch (e) { if (!C.leitura) SD.hist.pop(); throw e; }
    if (!C.leitura && !C.semMudanca) sdMudou(C.qual || 'tudo');
    else if (C.qual) sdAvisar(C.qual);
    if (SD.curto && r && typeof r === 'object') { const k = {}; for (const x of ['id', 'ids', 'slide', 'caminho', 'slides', 'avisos']) if (r[x] != null) k[x] = r[x]; return k; }
    return r;
}
function sdCarregar(doc, arquivo = null) {
    doc.largura = +doc.largura || 1920; doc.altura = +doc.altura || 1080; doc.tema = { ...sdClone(SD_TEMA), ...(doc.tema || {}) };
    doc.slides = (doc.slides && doc.slides.length) ? doc.slides : [sdNovoSlide('vazio')];
    doc.slides.forEach(s => { s.id = s.id || sdId(); s.camadas = s.camadas || []; s.fundo = s.fundo || { tipo: 'cor', cor: '#fff' }; s.camadas.forEach(c => { c.id = c.id || sdId(); }); });
    SD.doc = doc; SD.atual = 0; SD.sel = []; SD.hist = []; SD.futuro = []; SD.arquivo = arquivo; SD.sujo = false;
    sdAvisar('tudo'); sdGarantirFontes();
}
const sdNum = (v, d) => (v == null || v === '' ? d : +v);
function sdNova(tipo, a, padrao) {
    const s = sdSlide(a.slide) || sdSlide(); const W = SD.doc.largura, H = SD.doc.altura;
    const c = { id: sdId(), tipo, nome: a.nome || padrao.nome || tipo, rot: 0, opac: 1, ...padrao, ...a };
    delete c.slide; delete c.posicao;
    c.w = sdNum(c.w, padrao.w || 600); c.h = sdNum(c.h, padrao.h || 400);
    c.x = sdNum(a.x, (W - c.w) / 2); c.y = sdNum(a.y, (H - c.h) / 2);
    if (a.posicao != null) s.camadas.splice(+a.posicao, 0, c); else s.camadas.push(c);
    SD.sel = [c.id];
    return { id: c.id, slide: sdIdx(s) + 1 };
}
sdRegistrar('novo', 'documento novo {nome, layout, formato: 16:9|a4|a4_deitado} (a4 = folha em pé de 1191×1684 px: orçamento, contrato, informativo)', a => {
    sdCarregar(sdNovoDoc(a.nome || (a.formato === 'a4' ? 'Documento' : undefined), a.formato)); if (a.layout) SD.doc.slides[0] = sdNovoSlide(a.layout); return { slides: 1, largura: SD.doc.largura, altura: SD.doc.altura };
}, { semDoc: true });
sdRegistrar('modelo', 'apresentação pronta de 8 slides no tema {tema: claro|escuro|editorial|corporativo, nome, formato: 16:9|a4|a4_deitado}', a => {
    sdCarregar(sdDocModelo(a.tema, a.nome, a.formato)); return { slides: SD.doc.slides.length };
}, { semDoc: true, leitura: true });
sdRegistrar('mapa', 'resumo do documento (slides e camadas)', () => sdMapa(), { leitura: true });
sdRegistrar('slide_novo', 'slide novo {layout, depois (nº)}', a => {
    const s = sdNovoSlide(a.layout || 'titulo_texto'), i = a.depois != null ? +a.depois : SD.atual + 1;
    SD.doc.slides.splice(i, 0, s); SD.atual = i; SD.sel = [];
    return { slide: i + 1, id: s.id };
});
sdRegistrar('slide_duplicar', 'duplica {slide}', a => {
    const s = sdSlide(a.slide), n = sdClone(s); n.id = sdId(); n.camadas.forEach(c => { c.id = sdId(); });
    const i = sdIdx(s) + 1; SD.doc.slides.splice(i, 0, n); SD.atual = i; SD.sel = [];
    return { slide: i + 1, id: n.id };
});
sdRegistrar('slide_apagar', 'apaga {slide | slides: [..]}', a => {
    const alvo = (a.slides || [a.slide ?? SD.atual + 1]).map(sdSlide).filter(Boolean);
    if (alvo.length >= SD.doc.slides.length) throw new Error('a apresentação precisa de 1 slide');
    SD.doc.slides = SD.doc.slides.filter(s => !alvo.includes(s));
    SD.atual = Math.min(SD.atual, SD.doc.slides.length - 1); SD.sel = [];
    return { slides: SD.doc.slides.length };
});
sdRegistrar('slide_mover', 'move {slide, para (nº)}', a => {
    const s = sdSlide(a.slide), ss = SD.doc.slides, de = ss.indexOf(s);
    const para = Math.max(0, Math.min(ss.length - 1, +a.para - 1));
    ss.splice(de, 1); ss.splice(para, 0, s); SD.atual = para;
    return { slide: para + 1 };
});
sdRegistrar('slide_ir', 'vai para o slide {slide}', a => { const s = sdSlide(a.slide); if (!s) throw new Error('slide não existe'); SD.atual = sdIdx(s); SD.sel = []; return { slide: SD.atual + 1 }; }, { semMudanca: true, leitura: true, qual: 'atual' });
sdRegistrar('slide_fundo', 'fundo {slide, tipo: cor|degrade|imagem, cor, cor2, angulo, img, ajuste, escurecer, todos}', async a => {
    const alvo = a.todos ? SD.doc.slides : [sdSlide(a.slide)];
    for (const s of alvo) {
        const f = { ...s.fundo }; for (const k of ['tipo', 'cor', 'cor2', 'angulo', 'img', 'ajuste', 'escurecer']) if (a[k] !== undefined) f[k] = a[k];
        if (a.img && !a.tipo) f.tipo = 'imagem';
        s.fundo = f;
    }
    if (a.img) await sdUrl(a.img);
    return { slides: alvo.length };
});
sdRegistrar('slide_transicao', 'transição {slide, tipo: nenhuma|esmaecer|deslizar|empurrar|subir|zoom|cobrir|revelar|preto, dur, todos}', a => {
    const alvo = a.todos ? SD.doc.slides : [sdSlide(a.slide)];
    alvo.forEach(s => { s.transicao = { tipo: a.tipo || 'esmaecer', dur: +a.dur || 0.5 }; });
    return { slides: alvo.length };
});
sdRegistrar('slide_props', 'propriedades {slide, notas, dur (s, para vídeo), oculto, nome}', a => {
    const s = sdSlide(a.slide); for (const k of ['notas', 'dur', 'oculto', 'nome']) if (a[k] !== undefined) s[k] = a[k];
    return { slide: sdIdx(s) + 1 };
}, { qual: 'slide' });
sdRegistrar('texto', 'texto {html|texto, x, y, w, h, fonte, tam, peso, cor, alin, valin, entrelinha, espaco, caixa, fundo, pad, raio, slide}', a => {
    const T = SD.doc.tema; const pad = { nome: 'Texto', fonte: T.texto, tam: 48, peso: 400, cor: T.cores.tinta, alin: 'esq', valin: 'topo', entrelinha: 1.2, w: 900, h: 120 };
    if (a.texto != null && a.html == null) { a = { ...a, html: sdEsc(a.texto).replace(/\n/g, '<br>') }; delete a.texto; }
    return sdNova('texto', a, pad);
});
sdRegistrar('forma', 'forma {forma: ret|elipse|tri|losango|estrela|hexagono|seta|linha|coracao|balao, x, y, w, h, preench, preench2, angulo, traco, espessura, raio, ponta, slide}', a => {
    const T = SD.doc.tema, f = a.forma || 'ret';
    return sdNova('forma', a, { nome: { ret: 'Retângulo', elipse: 'Elipse', linha: 'Linha', seta: 'Seta' }[f] || f, forma: f, preench: f === 'linha' ? null : T.cores.destaque,
        traco: f === 'linha' ? T.cores.tinta : null, espessura: f === 'linha' ? 6 : 0, raio: 0, w: f === 'linha' ? 600 : 400, h: f === 'linha' ? 30 : 400 });
});
async function sdTamanhoMidia(src, tipo) {
    const url = await sdUrl(src);
    return new Promise(res => {
        const el = document.createElement(tipo === 'video' ? 'video' : 'img');
        const ok = () => res(tipo === 'video' ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight]);
        el.onerror = () => res([1600, 900]);
        if (tipo === 'video') { el.preload = 'metadata'; el.onloadedmetadata = ok; } else el.onload = ok;
        el.src = url;
        setTimeout(() => res([1600, 900]), 8000);
    });
}
async function sdMidiaCmd(tipo, a) {
    if (!a.src) throw new Error('falta src (caminho do arquivo)');
    let { w, h } = a;
    if (w == null || h == null) {
        const [iw, ih] = await sdTamanhoMidia(a.src, tipo), W = SD.doc.largura, H = SD.doc.altura;
        const k = Math.min(1, (W * 0.6) / (iw || 1), (H * 0.6) / (ih || 1));
        w = w ?? Math.round(iw * k); h = h ?? Math.round(ih * k);
    } else await sdUrl(a.src);
    const nome = a.nome || a.src.split(/[\\/]/).pop();
    return sdNova(tipo, { ...a, w, h, nome }, tipo === 'video' ? { ajuste: 'cobrir', auto: true, loop: false, mudo: false, raio: 0 } : { ajuste: 'cobrir', raio: 0 });
}
sdRegistrar('imagem', 'imagem ou GIF {src (caminho), x, y, w, h, ajuste: cobrir|conter|esticar, raio, slide}', a => sdMidiaCmd('imagem', a));
sdRegistrar('video', 'vídeo {src, x, y, w, h, ajuste, auto, loop, mudo, ini, slide}', a => sdMidiaCmd('video', a));
sdRegistrar('editar', 'muda propriedades {id|ids, ...props (x, y, w, h, rot, opac, cor, html, ...)}', a => {
    const cs = sdAlvos(a); if (!cs.length) throw new Error('nada selecionado');
    const props = { ...a }; for (const k of ['id', 'ids', 'slide']) delete props[k];
    if (props.texto != null && props.html == null) { props.html = sdEsc(props.texto).replace(/\n/g, '<br>'); delete props.texto; }
    cs.forEach(c => { for (const [k, v] of Object.entries(props)) { if (v === null) delete c[k]; else c[k] = v; } });
    return { ids: cs.map(c => c.id) };
}, { qual: 'camadas' });
sdRegistrar('mover', 'desloca {ids, dx, dy}', a => { sdAlvos(a).forEach(c => { c.x = Math.round(c.x + (+a.dx || 0)); c.y = Math.round(c.y + (+a.dy || 0)); }); return { ids: SD.sel }; }, { qual: 'camadas' });
sdRegistrar('apagar', 'apaga camadas {ids}', a => {
    const s = sdSlide(a.slide), ids = new Set(sdAlvos(a, s).map(c => c.id));
    s.camadas = s.camadas.filter(c => !ids.has(c.id)); SD.sel = SD.sel.filter(i => !ids.has(i));
    return { ids: [...ids] };
});
// cópia de um grupo vira um grupo NOVO (com o mesmo id, clicar na cópia selecionava a original junto)
function sdNovosGrupos(cs) { const m = {}; cs.forEach(c => { if (c.grupo) c.grupo = m[c.grupo] = m[c.grupo] || sdId(); }); return cs; }
sdRegistrar('duplicar', 'duplica camadas {ids, dx, dy}', a => {
    const s = sdSlide(a.slide), novos = [], gs = {};
    for (const c of sdAlvos(a, s)) {
        const n = sdClone(c); n.id = sdId(); n.x += sdNum(a.dx, 30); n.y += sdNum(a.dy, 30);
        if (n.grupo) n.grupo = gs[n.grupo] = gs[n.grupo] || sdId();
        s.camadas.splice(s.camadas.indexOf(c) + 1 + novos.length, 0, n); novos.push(n.id);
    }
    SD.sel = novos; return { ids: novos };
});
sdRegistrar('ordem', 'ordem das camadas {ids, para: frente|tras|topo|fundo|indice}', a => {
    const s = sdSlide(a.slide), L = s.camadas, cs = sdAlvos(a, s);
    for (const c of (a.para === 'frente' || a.para === 'topo') ? [...cs].reverse() : cs) {
        const i = L.indexOf(c); L.splice(i, 1);
        const j = a.para === 'topo' ? L.length : a.para === 'fundo' ? 0 : a.para === 'frente' ? Math.min(L.length, i + 1) : a.para === 'tras' ? Math.max(0, i - 1) : Math.max(0, Math.min(L.length, +a.para));
        L.splice(j, 0, c);
    }
    return { ids: cs.map(c => c.id) };
});
sdRegistrar('alinhar', 'alinha {ids, como: esq|centro|dir|topo|meio|base, a: slide|selecao}', a => {
    const cs = sdAlvos(a); if (!cs.length) throw new Error('nada selecionado');
    const ref = (a.a || (cs.length > 1 ? 'selecao' : 'slide')) === 'slide' ? [0, 0, SD.doc.largura, SD.doc.altura]
        : [Math.min(...cs.map(c => c.x)), Math.min(...cs.map(c => c.y)), Math.max(...cs.map(c => c.x + c.w)), Math.max(...cs.map(c => c.y + c.h))];
    for (const c of cs) {
        if (a.como === 'esq') c.x = ref[0]; else if (a.como === 'dir') c.x = ref[2] - c.w; else if (a.como === 'centro') c.x = (ref[0] + ref[2] - c.w) / 2;
        else if (a.como === 'topo') c.y = ref[1]; else if (a.como === 'base') c.y = ref[3] - c.h; else if (a.como === 'meio') c.y = (ref[1] + ref[3] - c.h) / 2;
        c.x = Math.round(c.x); c.y = Math.round(c.y);
    }
    return { ids: cs.map(c => c.id) };
}, { qual: 'camadas' });
sdRegistrar('distribuir', 'distribui com o mesmo espaço {ids, eixo: h|v}', a => {
    const cs = sdAlvos(a); if (cs.length < 3) throw new Error('selecione 3 ou mais');
    const h = (a.eixo || 'h') === 'h', P = h ? 'x' : 'y', T = h ? 'w' : 'h';
    cs.sort((p, q) => p[P] - q[P]);
    const ini = cs[0][P], fim = cs.at(-1)[P] + cs.at(-1)[T], soma = cs.reduce((s, c) => s + c[T], 0), vao = (fim - ini - soma) / (cs.length - 1);
    let pos = ini; cs.forEach(c => { c[P] = Math.round(pos); pos += c[T] + vao; });
    return { ids: cs.map(c => c.id) };
}, { qual: 'camadas' });
sdRegistrar('selecionar', 'seleciona {ids} (vazio = nada)', a => { SD.sel = (a.ids || (a.id ? [a.id] : [])).filter(i => sdCamada(i, sdSlide())); return { ids: SD.sel }; }, { leitura: true, semMudanca: true, qual: 'sel' });
sdRegistrar('animacao', 'animação de entrada {ids, tipo: nenhuma|esmaecer|subir|descer|esquerda|direita|zoom|girar|pular|crescer|revelar, dur, atraso, clique}', a => {
    const cs = sdAlvos(a); cs.forEach(c => { if (!a.tipo || a.tipo === 'nenhuma') delete c.anim; else c.anim = { tipo: a.tipo, dur: +a.dur || 0.6, atraso: +a.atraso || 0, clique: !!a.clique }; });
    return { ids: cs.map(c => c.id) };
}, { qual: 'camadas' });
sdRegistrar('agrupar', 'agrupa {ids} (clicar seleciona o grupo; Ctrl+clique pega um item de dentro)', a => {
    const cs = sdAlvos(a); if (cs.length < 2) throw new Error('selecione 2 ou mais');
    const g = sdId(); cs.forEach(c => { c.grupo = g; }); return { ids: cs.map(c => c.id), grupo: g };
}, { qual: 'camadas' });
sdRegistrar('desagrupar', 'desfaz o grupo das camadas {ids}', a => {
    const s = sdSlide(a.slide), gs = new Set(sdAlvos(a, s).map(c => c.grupo).filter(Boolean));
    s.camadas.forEach(c => { if (gs.has(c.grupo)) delete c.grupo; }); return { grupos: gs.size };
}, { qual: 'camadas' });
sdRegistrar('tabela', 'tabela {linhas, colunas, x, y, w, h, cabecalho (true), textos: [[..]], tam}', a => {
    const T = SD.doc.tema, C = T.cores, L = Math.max(1, +a.linhas || 3), K = Math.max(1, +a.colunas || 3);
    const w = +a.w || 1400, h = +a.h || 120 * L, x0 = a.x ?? (SD.doc.largura - w) / 2, y0 = a.y ?? (SD.doc.altura - h) / 2;
    const s = sdSlide(a.slide), g = sdId(), cw = w / K, ch = h / L, ids = [], cab = a.cabecalho !== false, tam = +a.tam || Math.min(40, ch * 0.38);
    for (let i = 0; i < L; i++) for (let j = 0; j < K; j++) {
        const f = { id: sdId(), tipo: 'forma', forma: 'ret', nome: `Célula ${i + 1}.${j + 1}`, x: Math.round(x0 + j * cw), y: Math.round(y0 + i * ch), w: Math.round(cw), h: Math.round(ch), rot: 0, opac: 1,
            preench: cab && i === 0 ? C.destaque : i % 2 ? C.suave : C.fundo, traco: C.suave, espessura: 2, raio: 0, grupo: g };
        const txt = (a.textos && a.textos[i] && a.textos[i][j] != null) ? String(a.textos[i][j]) : (cab && i === 0 ? `Coluna ${j + 1}` : '');
        const t = sdTxt({ nome: `Texto ${i + 1}.${j + 1}`, html: sdEsc(txt), x: f.x + 20, y: f.y, w: f.w - 40, h: f.h, tam, valin: 'meio', peso: cab && i === 0 ? 600 : 400,
            cor: cab && i === 0 ? (sdLum(C.destaque) > 0.35 ? '#0f1b2d' : '#ffffff') : C.tinta, grupo: g }, T);
        s.camadas.push(f, t); ids.push(f.id, t.id);
    }
    SD.sel = ids; return { ids, grupo: g };
});
sdRegistrar('agrupar_nome', 'renomeia {id, nome}', a => { const c = sdCamada(a.id, sdSlide(a.slide)); c.nome = a.nome; return { id: c.id }; }, { qual: 'camadas' });
sdRegistrar('tema', 'tema {titulo (fonte), texto (fonte), cores: {fundo, tinta, destaque, suave, apoio}, aplicar}', a => {
    const T = SD.doc.tema, velho = sdClone(T);
    if (a.titulo) T.titulo = a.titulo; if (a.texto) T.texto = a.texto; if (a.cores) Object.assign(T.cores, a.cores);
    if (a.aplicar) {   // troca as fontes/cores antigas do tema pelas novas em todos os slides
        const cor = v => { for (const [k, c] of Object.entries(velho.cores)) if (String(v).toLowerCase() === c.toLowerCase()) return T.cores[k]; return v; };
        for (const s of SD.doc.slides) {
            if (s.fundo.cor) s.fundo.cor = cor(s.fundo.cor);
            for (const c of s.camadas) {
                if (c.fonte === velho.titulo) c.fonte = T.titulo; else if (c.fonte === velho.texto) c.fonte = T.texto;
                for (const k of ['cor', 'preench', 'traco', 'fundo']) if (c[k]) c[k] = cor(c[k]);
            }
        }
    }
    return { tema: T };
});
sdRegistrar('cena', 'monta o slide com HTML/CSS no tamanho da página (1920×1080; A4 = 1191×1684): {html, slide, novo, limpar}', a => sdCena(a.html, a));

// ───────────── HTML/CSS → camadas (para o agente montar slides inteiros de uma vez) ─────────────
async function sdCena(html, op = {}) {
    const W = SD.doc.largura, H = SD.doc.altura;
    let s;
    if (op.novo) { s = sdNovoSlide('vazio'); SD.doc.slides.splice(op.depois != null ? +op.depois : SD.atual + 1, 0, s); }
    else s = sdSlide(op.slide);
    if (op.limpar !== false && !op.novo) s.camadas = [];
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'fixed', left: '-30000px', top: '0', width: W + 'px', height: H + 'px', overflow: 'hidden' });
    box.innerHTML = html; document.body.appendChild(box);
    await document.fonts.ready;
    const R = box.getBoundingClientRect(), novos = [];
    const filhos = [...box.children].filter(e => !/^(STYLE|LINK|SCRIPT)$/.test(e.tagName));
    const raiz = filhos.length === 1 ? filhos[0] : box;
    const csR = getComputedStyle(raiz);
    if (csR.backgroundColor && csR.backgroundColor !== 'rgba(0, 0, 0, 0)') s.fundo = { tipo: 'cor', cor: sdCorHex(csR.backgroundColor) };
    if (/gradient/.test(csR.backgroundImage)) { const cs = csR.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi) || []; const ang = (csR.backgroundImage.match(/(\d+)deg/) || [])[1]; if (cs.length >= 2) s.fundo = { tipo: 'degrade', cor: sdCorHex(cs[0]), cor2: sdCorHex(cs.at(-1)), angulo: +ang || 135 }; }
    if (raiz.dataset && raiz.dataset.fundoImg) s.fundo = { tipo: 'imagem', img: raiz.dataset.fundoImg, ajuste: 'cobrir', escurecer: +raiz.dataset.escurecer || 0 };
    const temTexto = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const caixa = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left - R.left), y: Math.round(r.top - R.top), w: Math.round(r.width), h: Math.round(r.height) }; };
    const anda = async el => {
        for (const f of el.children) {
            const cs = getComputedStyle(f); if (cs.display === 'none') continue;
            // giro: o estilo calculado vem como matrix(a, b, …); a caixa da camada é a do elemento SEM giro, no mesmo centro
            const mt = cs.transform.match(/^matrix\(([-\d.e]+),\s*([-\d.e]+)/), rot = mt ? Math.round(Math.atan2(+mt[2], +mt[1]) * 180 / Math.PI) : 0;
            let b = caixa(f);
            if (rot) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, ow = f.offsetWidth, oh = f.offsetHeight; b = { x: Math.round(cx - ow / 2), y: Math.round(cy - oh / 2), w: ow, h: oh }; }
            const nome = f.dataset.nome || f.id || undefined;
            const fundoOk = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
            const grad = /gradient/.test(cs.backgroundImage);
            if (f.tagName === 'IMG' || f.tagName === 'VIDEO') {
                const src = f.dataset.src || f.getAttribute('src');
                const r = await sdMidiaCmd(f.tagName === 'IMG' ? 'imagem' : 'video', { src, ...b, slide: sdIdx(s) + 1, nome, raio: parseFloat(cs.borderTopLeftRadius) || 0,
                    ajuste: { contain: 'conter', fill: 'esticar' }[cs.objectFit] || 'cobrir', opac: +cs.opacity, rot, ...(f.tagName === 'VIDEO' ? { loop: f.loop, mudo: f.muted, auto: true } : {}) });
                novos.push(r.id); continue;
            }
            if (fundoOk || grad || parseFloat(cs.borderTopWidth) > 0) {
                const elip = cs.borderTopLeftRadius.includes('%') && parseFloat(cs.borderTopLeftRadius) >= 50;
                const gc = grad ? (cs.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi) || []) : [];
                const r = sdNova('forma', { ...b, nome: nome ? nome + (temTexto(f) ? ' (fundo)' : '') : undefined, slide: sdIdx(s) + 1 }, {
                    forma: f.dataset.forma || (elip ? 'elipse' : 'ret'), preench: grad ? sdCorHex(gc[0]) : fundoOk ? sdCorHex(cs.backgroundColor) : 'none',
                    preench2: grad && gc.length > 1 ? sdCorHex(gc.at(-1)) : undefined, angulo: grad ? +((cs.backgroundImage.match(/(\d+)deg/) || [])[1] || 180) : undefined,
                    raio: elip ? 0 : parseFloat(cs.borderTopLeftRadius) || 0, traco: parseFloat(cs.borderTopWidth) > 0 ? sdCorHex(cs.borderTopColor) : null, espessura: parseFloat(cs.borderTopWidth) || 0,
                    opac: +cs.opacity, rot });
                if (cs.boxShadow && cs.boxShadow !== 'none') { const m = cs.boxShadow.match(/(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/); if (m) sdCamada(r.id, s).sombra = { cor: m[1], x: +m[2], y: +m[3], desf: +m[4] }; }
                novos.push(r.id);
            }
            if (temTexto(f)) {
                const pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0, pr = parseFloat(cs.paddingRight) || 0, pb = parseFloat(cs.paddingBottom) || 0;
                const al = { center: 'centro', right: 'dir', end: 'dir', justify: 'just' }[cs.textAlign] || 'esq';
                const valin = cs.display === 'flex' && cs.flexDirection !== 'column' ? ({ center: 'meio', 'flex-end': 'base', end: 'base' }[cs.alignItems] || 'topo')
                    : cs.display === 'flex' ? ({ center: 'meio', 'flex-end': 'base', end: 'base' }[cs.justifyContent] || 'topo') : 'topo';
                const lh = cs.lineHeight === 'normal' ? 1.2 : +(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(3);
                const h = f.innerHTML.replace(/\s*\n\s*/g, ' ').replace(/<(?!\/?(b|strong|i|em|u|br|span)\b)[^>]*>/gi, '').trim();
                const r = sdNova('texto', { x: b.x + pl, y: b.y + pt, w: b.w - pl - pr + 2, h: b.h - pt - pb, nome: nome || f.textContent.trim().slice(0, 24), slide: sdIdx(s) + 1 }, {
                    html: h, fonte: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), tam: parseFloat(cs.fontSize), peso: +cs.fontWeight || 400,
                    italico: cs.fontStyle === 'italic', cor: sdCorHex(cs.color), alin: al, valin, entrelinha: lh, espaco: parseFloat(cs.letterSpacing) || 0,
                    caixa: cs.textTransform === 'uppercase' ? 'alta' : undefined, rot, opac: +cs.opacity });
                novos.push(r.id);
            } else if (f.children.length && f.tagName !== 'SVG') await anda(f);
        }
    };
    try { await anda(raiz); } finally { box.remove(); }
    SD.atual = sdIdx(s); SD.sel = [];
    return { slide: sdIdx(s) + 1, ids: novos };
}
function sdCorHex(c) {
    const m = String(c || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m) return c;
    const hx = [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('');
    return m[4] != null && +m[4] < 1 ? `rgba(${m[1]},${m[2]},${m[3]},${m[4]})` : '#' + hx;
}
function sdTextoPuro(c) { const d = document.createElement('div'); d.innerHTML = c.html || c.texto || ''; return d.textContent; }
function sdMapa() {
    if (!SD.doc) return { slides: [] };
    return { nome: SD.doc.nome, arquivo: SD.arquivo, atual: SD.atual + 1, tema: SD.doc.tema, slides: SD.doc.slides.map((s, i) => ({
        n: i + 1, id: s.id, fundo: s.fundo, transicao: s.transicao && s.transicao.tipo, notas: s.notas ? s.notas.slice(0, 80) : undefined, oculto: s.oculto || undefined,
        camadas: s.camadas.map(c => ({ id: c.id, tipo: c.tipo, nome: c.nome, x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h),
            ...(c.tipo === 'texto' ? { texto: sdTextoPuro(c).slice(0, 60), tam: c.tam, fonte: c.fonte } : {}), ...(c.forma ? { forma: c.forma } : {}),
            ...(c.src ? { src: c.src } : {}), ...(c.anim ? { anim: c.anim.tipo } : {}) })) })) };
}

// ───────────── foto do slide (exportar): o DOM → SVG foreignObject → canvas, fiel à tela ─────────────
async function sdDataUrl(p) {
    if (SD.dados[p]) return SD.dados[p];
    const url = await sdUrl(p); if (!url) return '';
    const b = await (await fetch(url)).blob();
    return (SD.dados[p] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }));
}
async function sdQuadroVideo(c) {
    const k = c.src + '#q'; if (SD.dados[k]) return SD.dados[k];
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = await sdUrl(c.src);
    await new Promise(r => { v.onloadeddata = r; v.onerror = r; setTimeout(r, 8000); });
    await new Promise(r => { v.onseeked = r; try { v.currentTime = Math.max(0.05, +c.ini || 0.1); } catch (e) { r(); } setTimeout(r, 4000); });
    const cv = document.createElement('canvas'); cv.width = v.videoWidth || 1280; cv.height = v.videoHeight || 720;
    try { cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); } catch (e) { /* sem quadro */ }
    return (SD.dados[k] = cv.toDataURL('image/jpeg', 0.92));
}
async function sdPrepararFoto(s) {
    const ps = [];
    if (s.fundo && s.fundo.tipo === 'imagem' && s.fundo.img) ps.push(sdDataUrl(s.fundo.img));
    for (const c of s.camadas) {
        if (c.tipo === 'imagem' && c.src) ps.push(sdDataUrl(c.src));
        if (c.tipo === 'video' && c.src) ps.push(sdQuadroVideo(c));
    }
    await Promise.all(ps);
}
// quadro(el): ajusta o slide montado (já no documento, fora da tela) antes da foto — o MP4 usa para congelar as animações num instante
async function sdFotoSlide(s, largura = 1920, mime = 'image/png', q = 0.92, quadro = null) {
    await sdGarantirFontes(); await sdPrepararFoto(s); await document.fonts.ready;
    const W = SD.doc.largura, H = SD.doc.altura, k = largura / W, el = sdMontarSlide(s, 'foto');
    if (quadro) {
        const box = document.createElement('div');
        Object.assign(box.style, { position: 'fixed', left: '-30000px', top: '0', width: W + 'px', height: H + 'px', overflow: 'hidden' });
        box.appendChild(el); document.body.appendChild(box);
        try { quadro(el); } finally { box.remove(); }
    }
    const css = await sdCssFontes(s);
    if (css) { const st = document.createElement('style'); st.textContent = css; el.prepend(st); }
    const xml = new XMLSerializer().serializeToString(el);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * k)}" height="${Math.round(H * k)}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${xml}</foreignObject></svg>`;
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL(mime, q);
}

// ───────────── salvar, abrir, importar, exportar ─────────────
sdRegistrar('salvar', 'salva o .dknv {caminho}', async a => {
    let p = a.caminho || (!a.como && SD.arquivo);
    if (!p) { p = await sdApi().vk_dialogo('salvar', ['Apresentação do Slider Kanivete (*.dknv)'], (SD.doc.nome || 'Apresentação') + '.dknv'); if (!p) return { cancelado: true }; }
    if (!/\.dknv$/i.test(p)) p += '.dknv';
    let previa = null; try { previa = await sdFotoSlide(SD.doc.slides[0], 480, 'image/png'); } catch (e) { /* sem miniatura */ }
    SD.doc.nome = sdNomeArq(p);
    const r = await sdApi().sd_salvar(p, JSON.stringify(SD.doc), previa);
    if (!r || !r.success) throw new Error('não salvou: ' + ((r && r.error) || ''));
    SD.arquivo = r.path; SD.sujo = false; sdRecenteAdd(r.path); sdGuardarRascunho(); sdAvisar('arquivo');
    return { caminho: r.path };
}, { leitura: true, qual: 'arquivo' });
sdRegistrar('abrir', 'abre um .dknv ou importa um .pptx / .pdf (uma página por slide, em camadas) {caminho}', async a => {
    let p = a.caminho;
    if (!p) { p = await sdApi().vk_dialogo('abrir', ['Apresentações (*.dknv;*.pptx;*.pdf)', 'Slider Kanivete (*.dknv)', 'PowerPoint (*.pptx)', 'PDF (*.pdf)']); if (!p) return { cancelado: true }; }
    const ppt = /\.(pptx|pdf)$/i.test(p);
    const r = /\.pdf$/i.test(p) ? await sdApi().sd_importar_pdf(p) : ppt ? await sdApi().sd_importar_pptx(p) : await sdApi().sd_abrir(p);
    if (!r || !r.success) throw new Error('não abriu: ' + ((r && r.error) || p));
    await sdPrepararUrls(r.doc);
    sdCarregar(r.doc, ppt ? null : r.path);
    if (!ppt) sdRecenteAdd(r.path);
    return { slides: r.doc.slides.length, caminho: r.path || p, relatorio: r.relatorio };
}, { leitura: true, semDoc: true });
// MP4: a linha do tempo das animações de um slide (as de clique entram em sequência, sem esperar clique)
function sdPlanoAnim(s, inicio = 0) {
    const vis = s.camadas.filter(c => !c.oculto && c.anim && c.anim.tipo && c.anim.tipo !== 'nenhuma');
    const plano = []; let fimAuto = inicio;
    for (const c of vis.filter(c => !c.anim.clique)) { const t0 = inicio + (+c.anim.atraso || 0), d = +c.anim.dur || 0.6; plano.push({ c, t0, d }); fimAuto = Math.max(fimAuto, t0 + d); }
    let t = fimAuto + (vis.some(c => !c.anim.clique) ? 0.4 : 0);
    for (const c of vis.filter(c => c.anim.clique)) { const t0 = t + (+c.anim.atraso || 0), d = +c.anim.dur || 0.6; plano.push({ c, t0, d }); t = t0 + d + 0.5; }
    return { plano, fim: plano.length ? Math.max(...plano.map(p => p.t0 + p.d)) : 0 };
}
function sdCongelarAnim(el, plano, t) {   // estado de cada camada animada no instante t (as animações de verdade, paradas)
    for (const { c, t0, d } of plano) {
        const e = el.querySelector(`[data-id="${c.id}"]`); if (!e) continue;
        const a = e.animate(sdAnimQuadros(c, e.style.transform || ''), { duration: d * 1000, easing: SD_ANIM_CURVA[c.anim.tipo] || 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
        a.pause(); a.currentTime = Math.max(0, Math.min(d, t - t0)) * 1000;
        const cs = getComputedStyle(e), op = cs.opacity, tr = cs.transform, cp = cs.clipPath;
        a.cancel();
        e.style.opacity = op; e.style.transform = tr === 'none' ? '' : tr; e.style.clipPath = cp === 'none' ? '' : cp;
    }
}
sdRegistrar('exportar', 'exporta {formato: pdf|png|mp4|pptx|pptx_imagens|html (apresentação que abre em qualquer aparelho), caminho, largura (px), qualidade: alta|leve, slides: todos|atual}', async a => {
    const fmt = a.formato || 'pdf';
    const ext = { pdf: 'pdf', mp4: 'mp4', pptx: 'pptx', pptx_imagens: 'pptx', png: '', html: 'html' }[fmt];
    let p = a.caminho;
    if (!p) {
        p = fmt === 'png' ? await sdApi().vk_dialogo('pasta') : await sdApi().vk_dialogo('salvar', [fmt === 'html' ? 'Apresentação para qualquer aparelho (*.html)' : `${fmt.toUpperCase()} (*.${ext})`], (SD.doc.nome || 'Apresentação') + '.' + ext);
        if (!p) return { cancelado: true };
    }
    if (ext && !new RegExp(`\\.${ext}$`, 'i').test(p)) p += '.' + ext;
    if (fmt === 'html') return sdExportarHtml(p, a);
    if (fmt === 'pptx') {
        // gráficos: cores e texto resolvidos pelo tema (o Python não conhece o tema)
        const doc = sdClone(SD.doc);
        doc.slides.forEach(s => s.camadas.forEach(c => { if (c.tipo === 'grafico') { c.cores = sdGrafCores(c); c.fonte = c.fonte || doc.tema.texto; c.tamTexto = c.tamTexto || Math.max(14, Math.min(40, Math.min(c.w, c.h) * 0.05)); } }));
        const r = await sdApi().sd_exportar('nativo', 'pptx_nativo', p, JSON.stringify(doc), {});
        if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
        return { caminho: r.path, avisos: r.avisos };
    }
    const leve = a.qualidade === 'leve';
    const job = 'sd' + Date.now(), larg = +a.largura || (fmt === 'mp4' ? 1920 : leve ? 1600 : 2560), qj = leve ? 0.8 : 0.92;
    const lista = a.slides === 'atual' ? [sdSlide()] : SD.doc.slides.filter(s => !s.oculto);
    const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
    const FPS = 30, docMp4 = { ...SD.doc, slides: [] };
    for (let i = 0; i < lista.length; i++) {
        sdAvisar({ progresso: (i + 1) / lista.length, texto: `Slide ${i + 1} de ${lista.length}` });
        const s = lista[i];
        if (fmt === 'mp4') {   // animações viram quadros (começam depois da transição de entrada)
            const tr = i > 0 && s.transicao && s.transicao.tipo !== 'nenhuma' ? (+s.transicao.dur || 0.5) : 0;
            const { plano, fim } = sdPlanoAnim(s, tr);
            const sd = sdClone(s); sd.animQuadros = 0;
            if (plano.length) {
                const n = Math.ceil(fim * FPS) + 1;
                for (let j = 0; j < n; j++) {
                    if (j % 6 === 0) sdAvisar({ progresso: (i + j / n) / lista.length, texto: `Slide ${i + 1} de ${lista.length} · animação ${Math.round(j / n * 100)}%` });
                    const d = await sdFotoSlide(s, larg, mime, 0.9, el => sdCongelarAnim(el, plano, j / FPS));
                    const r = await sdApi().sd_quadro(job, `${String(i).padStart(3, '0')}_a${String(j).padStart(4, '0')}`, d);
                    if (!r || !r.success) throw new Error((r && r.error) || 'quadro');
                }
                sd.animQuadros = n; sd.dur = Math.max(+s.dur || 5, fim + 1.5);
            }
            docMp4.slides.push(sd);
        }
        const d = await sdFotoSlide(s, larg, mime, fmt === 'mp4' ? 0.93 : qj);
        const r = await sdApi().sd_quadro(job, i, d);
        if (!r || !r.success) throw new Error((r && r.error) || 'quadro');
    }
    sdAvisar({ progresso: 1, texto: fmt === 'mp4' ? 'Montando o vídeo…' : 'Juntando…' });
    const doc = fmt === 'mp4' ? docMp4 : { ...SD.doc, slides: lista };
    const r = await sdApi().sd_exportar(job, fmt === 'pptx_imagens' ? 'pptx' : fmt, p, JSON.stringify(doc), { base: sdNomeArq(SD.arquivo) || SD.doc.nome || 'slide' });
    sdAvisar({ progresso: null });
    if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
    return { caminho: r.path, slides: lista.length };
}, { leitura: true });

window.SDK = {
    // chamadas pelo nome (não pela referência): tools/aplicar.py troca as funções a quente e o SDK segue a nova
    cmd: (n, a) => sdCmd(n, a), comandos: () => Object.fromEntries(Object.entries(SD_CMDS).map(([k, v]) => [k, v.desc])),
    mapa: () => sdMapa(), doc: () => SD.doc, estado: () => SD, foto: (n, larg = 960) => sdFotoSlide(sdSlide(n), larg, 'image/jpeg', .85),
    cena: (html, op = {}) => sdCmd('cena', { ...op, html }), desfazer: () => sdDesfazer(), refazer: () => sdDesfazer(true),
    get curto() { return SD.curto; }, set curto(v) { SD.curto = !!v; },
};
