// =========================================================
// Slider Kanivete — Exportar › "Apresentação (HTML)": um arquivo .html que apresenta em qualquer aparelho (PC, Mac,
// celular, TV), com o reprodutor frontend/slider-player/player.html (tela inicial, controles, tela cheia, PageUp/PageDown,
// deslizar no celular, ocultar/mostrar slides, notas, vídeo, GIF, animações e transições iguais às do editor).
// Aqui cada slide é montado como na apresentação (sdMontarSlide 'show'); as mídias viram marcas data-m (o Python põe o
// arquivo dentro, em base64: Functions/slider_html.py) e vão a miniatura (grade/notas) e a capa de cada vídeo.
// =========================================================
async function sdExportarHtml(p, a = {}) {
    const doc = SD.doc;
    await sdGarantirFontes(); await sdPrepararUrls(); await document.fonts.ready;
    const deUrl = {}; for (const [k, v] of Object.entries(SD.urls)) if (v) deUrl[v] = k;
    const midias = {}, fontes = {}, textos = [];
    const regMidia = (cam, w, h, tipo) => {
        const m = midias[cam] = midias[cam] || { id: 'm' + Object.keys(midias).length, w: 0, h: 0, tipo };
        m.w = Math.max(m.w, w); m.h = Math.max(m.h, h); if (tipo === 'video') m.tipo = 'video';
        return m.id;
    };
    const regFonte = (f, peso, ital) => { if (!f) return; const o = fontes[f] = fontes[f] || { pesos: [], italico: false }; if (!o.pesos.includes(+peso || 400)) o.pesos.push(+peso || 400); if (ital) o.italico = true; };
    regFonte(doc.tema && doc.tema.titulo, 400); regFonte(doc.tema && doc.tema.texto, 400);
    const slides = [];
    for (let i = 0; i < doc.slides.length; i++) {
        const s = doc.slides[i];
        sdAvisar({ progresso: (i + 1) / doc.slides.length * 0.5, texto: `Preparando o slide ${i + 1} de ${doc.slides.length}` });
        const el = sdMontarSlide(s, 'show'), ms = new Set(), videos = {};
        el.querySelectorAll('img').forEach(im => {
            const cam = deUrl[im.getAttribute('src')]; if (!cam) return;
            const c = sdCamada((im.closest('[data-id]') || {}).dataset?.id, s);
            im.removeAttribute('src'); im.dataset.m = regMidia(cam, c ? c.w : doc.largura, c ? c.h : doc.altura, 'imagem'); ms.add(im.dataset.m);
        });
        for (const v of el.querySelectorAll('video')) {
            const c = sdCamada(v.closest('[data-id]').dataset.id, s); if (!c) continue;
            const cam = deUrl[v.getAttribute('src')] || c.src;
            v.removeAttribute('src'); v.removeAttribute('crossorigin');
            v.dataset.m = regMidia(cam, c.w, c.h, 'video'); ms.add(v.dataset.m);
            try { v.dataset.p = await sdMiniatura(await sdQuadroVideo(c), 960, 0.8); } catch (e) { /* sem capa */ }
            videos[c.id] = { auto: !!c.auto, loop: !!c.loop, mudo: !!c.mudo, ini: +c.ini || 0 };
        }
        for (const c of s.camadas) {
            if (c.tipo !== 'texto' || c.oculto) continue;
            const ital = !!c.italico || /<(i|em)\b/i.test(c.html || ''), negrito = /<(b|strong)\b|font-weight:\s*(bold|[6-9]00)/i.test(c.html || '');
            regFonte(c.fonte || doc.tema.texto, c.peso || 400, ital); if (negrito) regFonte(c.fonte || doc.tema.texto, 700, ital);
            (c.html || '').replace(/font-family:\s*&quot;([^&]+)&quot;|font-family:\s*"?([^;"]+)"?/g, (_, a1, a2) => regFonte((a1 || a2).trim(), c.peso || 400, ital));
            const t = sdTextoPuro(c); textos.push(t, t.toUpperCase(), t.toLowerCase());
        }
        for (const c of s.camadas) if (c.tipo === 'grafico') { regFonte(c.fonte || doc.tema.texto, 400); regFonte(c.fonte || doc.tema.texto, 700); textos.push(el.querySelector(`[data-id="${c.id}"]`)?.textContent || ''); }
        const titulo = s.camadas.filter(c => c.tipo === 'texto' && !c.oculto).sort((x, y) => (+y.tam || 0) - (+x.tam || 0))[0];
        slides.push({
            id: s.id, oculto: !!s.oculto, notas: s.notas || '', transicao: s.transicao || null, html: el.outerHTML, m: [...ms], videos,
            titulo: titulo ? sdTextoPuro(titulo).replace(/\s+/g, ' ').trim().slice(0, 80) : '',
            anim: s.camadas.filter(c => sdTemAnim(c) && !c.oculto).map(c => ({ id: c.id, tipo: c.anim.tipo, dur: +c.anim.dur || 0.6, atraso: +c.anim.atraso || 0, clique: !!c.anim.clique, opac: c.opac })),
            mini: await sdFotoSlide(s, 480, 'image/jpeg', 0.78),
        });
    }
    sdAvisar({ progresso: 0.55, texto: 'Juntando mídias e fontes…' });
    const pacote = { nome: doc.nome || sdNomeArq(SD.arquivo) || 'Apresentação', largura: doc.largura, altura: doc.altura, slides, midias, fontes,
        texto: [...new Set(textos.join(''))].join('') };
    const r = await sdApi().sd_exportar_html(p, JSON.stringify(pacote));
    sdAvisar({ progresso: null });
    if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
    return { caminho: r.path, tamanho: r.tamanho, avisos: r.avisos, slides: slides.length };
}
// data URL reduzida (capa do vídeo no reprodutor: leve, aparece antes de o vídeo carregar)
async function sdMiniatura(dataUrl, larg = 960, q = 0.8) {
    if (!dataUrl) return '';
    const im = new Image(); im.src = dataUrl; await im.decode();
    const k = Math.min(1, larg / im.naturalWidth), cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', q);
}
