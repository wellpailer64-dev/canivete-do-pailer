// =========================================================
// Slider Kanivete — FERRAMENTAS DO AGENTE: ver a apresentação gastando pouco e mexer em lote.
//   SDK.texto()            roteiro em texto, uma linha por camada (o jeito mais barato de "ler" os slides)
//   SDK.folha({colunas, largura, caminho, slides})  todas as páginas numa imagem só (JPEG pequeno, numerado)
//   SDK.revisar()          problemas: texto estourando a caixa, fora do slide, letra pequena, pouco contraste,
//                          textos sobrepostos, mídia sem arquivo, slide vazio — com id e slide para corrigir
//   SDK.achar('palavra')   onde aparece (slide, id, nome)
//   SDK.lote([['cmd', {..}], ...])  vários comandos com UM desfazer
//   comandos 'substituir' {de, para}, 'estilo_copiar' {id}, 'estilo_colar' {ids}, 'slide_layout' {layout, slide}
// =========================================================
function sdResumoCamada(c) {
    const cx = `${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.w)}×${Math.round(c.h)}`;
    if (c.tipo === 'texto') return `T ${c.id} "${sdTextoPuro(c).replace(/\s+/g, ' ').slice(0, 90)}" ${Math.round(c.tam || 40)}px ${c.fonte || ''} ${c.cor || ''} @${cx}`;
    if (c.tipo === 'grafico') return `G ${c.id} ${c.grafico} [${(c.rotulos || []).slice(0, 6).join('|')}] ${(c.series || []).map(s => s.nome + ':' + (s.valores || []).slice(0, 6).join('/')).join(' ')} @${cx}`;
    if (c.tipo === 'forma') return `F ${c.id} ${c.forma} ${c.preench || ''} @${cx}`;
    return `${c.tipo === 'video' ? 'V' : 'I'} ${c.id} ${(c.src || '').split(/[\\/]/).pop()} @${cx}`;
}
function sdTextoDoc(op = {}) {
    if (!SD.doc) return '';
    const so = op.slide != null ? [sdSlide(op.slide)] : SD.doc.slides;
    return so.map(s => {
        const f = s.fundo || {}, tr = s.transicao && s.transicao.tipo !== 'nenhuma' ? ' ⇢' + s.transicao.tipo : '';
        const cab = `#${sdIdx(s) + 1} ${s.id} fundo:${f.tipo === 'imagem' ? 'img ' + (f.img || '').split(/[\\/]/).pop() : f.tipo === 'degrade' ? f.cor + '→' + f.cor2 : f.cor}${tr}${s.oculto ? ' (oculto)' : ''}`;
        const ls = s.camadas.filter(c => op.tudo || !c.oculto).map(c => '  ' + sdResumoCamada(c) + (c.anim && c.anim.tipo !== 'nenhuma' ? ` ★${c.anim.tipo}${c.anim.clique ? '/clique' : ''}` : '') + (c.grupo ? ' ⧉' + c.grupo.slice(0, 4) : ''));
        return [cab, ...ls, ...(s.notas ? ['  ✎ ' + s.notas.replace(/\s+/g, ' ').slice(0, 120)] : [])].join('\n');
    }).join('\n');
}
async function sdFolha(op = {}) {
    const lista = (op.slides || SD.doc.slides.map((_, i) => i + 1)).map(n => sdSlide(n)).filter(Boolean);
    const col = +op.colunas || Math.min(4, lista.length), larg = +op.largura || 320, alt = Math.round(larg * SD.doc.altura / SD.doc.largura), m = 8, cab = 18;
    const lin = Math.ceil(lista.length / col), cv = document.createElement('canvas');
    cv.width = col * (larg + m) + m; cv.height = lin * (alt + m + cab) + m;
    const g = cv.getContext('2d'); g.fillStyle = '#1b1d20'; g.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < lista.length; i++) {
        const im = new Image(); im.src = await sdFotoSlide(lista[i], larg, 'image/jpeg', 0.8); await im.decode();
        const x = m + (i % col) * (larg + m), y = m + Math.floor(i / col) * (alt + m + cab);
        g.fillStyle = '#cfd5da'; g.font = '600 13px sans-serif'; g.fillText(`${sdIdx(lista[i]) + 1}${lista[i].oculto ? ' (oculto)' : ''}`, x, y + 13);
        g.drawImage(im, x, y + cab, larg, alt);
    }
    const url = cv.toDataURL('image/jpeg', op.qualidade || 0.72);
    if (op.caminho) { const r = await sdApi().sd_gravar_imagem(op.caminho, url); return { caminho: r && r.path, slides: lista.length }; }
    return url;
}
// medir o texto de verdade (fonte carregada): altura que o texto pede × caixa
function sdMedirTextos(s) {
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'fixed', left: '-30000px', top: '0', width: SD.doc.largura + 'px', height: SD.doc.altura + 'px', overflow: 'hidden' });
    const el = sdMontarSlide(s, 'foto'); box.appendChild(el); document.body.appendChild(box);
    const out = {};
    for (const c of s.camadas) if (c.tipo === 'texto') {
        const t = el.querySelector(`[data-id="${c.id}"] .sd-txt`); if (!t) continue;
        out[c.id] = { alt: t.scrollHeight + 2 * (+c.pad || 0), larg: t.scrollWidth + 2 * (+c.pad || 0) };
    }
    box.remove(); return out;
}
const sdDecorativo = c => !/[\p{L}\p{N}]/u.test(sdTextoPuro(c));   // só símbolo (aspas gigantes, travessão): enfeite, não texto
function sdContraste(a, b) { const la = sdLum(a), lb = sdLum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
async function sdRevisar(op = {}) {
    await sdGarantirFontes(); await document.fonts.ready;
    const W = SD.doc.largura, H = SD.doc.altura, prob = [];
    const add = (s, c, tipo, msg) => prob.push({ slide: sdIdx(s) + 1, id: c ? c.id : undefined, nome: c ? c.nome : undefined, tipo, msg });
    for (const s of op.slide != null ? [sdSlide(op.slide)] : SD.doc.slides) {
        const vis = s.camadas.filter(c => !c.oculto);
        if (!vis.length) add(s, null, 'vazio', 'slide sem nenhuma camada');
        const med = sdMedirTextos(s), fundo = (s.fundo && s.fundo.tipo !== 'imagem' && s.fundo.cor) || null;
        for (const c of vis) {
            if (c.x + c.w < 1 || c.y + c.h < 1 || c.x > W - 1 || c.y > H - 1) add(s, c, 'fora', 'fora do slide');
            else if (!+c.rot && (c.x < -2 || c.y < -2 || c.x + c.w > W + 2 || c.y + c.h > H + 2) && c.tipo === 'texto') add(s, c, 'corte', 'texto passa da borda do slide');
            if (c.tipo === 'texto' && !sdDecorativo(c)) {
                const m = med[c.id]; if (m && m.alt > c.h + 4) add(s, c, 'estouro', `texto pede ${Math.ceil(m.alt)} px de altura e a caixa tem ${Math.round(c.h)} (aumente h para ${Math.ceil(m.alt)} ou diminua o tam)`);
                // página em pé (A4) é papel: 13 px ≈ 6,5 pt impresso; no 16:9 é telão
                if (SD.doc.altura > SD.doc.largura ? (+c.tam || 40) < 13 : (+c.tam || 40) < 22 && sdTextoPuro(c).trim()) add(s, c, 'pequeno', SD.doc.altura > SD.doc.largura ? `letra de ${c.tam}px fica pequena no papel (mínimo ~13)` : `letra de ${c.tam}px fica ilegível no telão (mínimo ~24)`);
                const atras = c.fundo || [...vis.slice(0, vis.indexOf(c))].reverse().find(o => o.tipo === 'forma' && o.preench && o.preench !== 'none' && o.x <= c.x + 2 && o.y <= c.y + 2 && o.x + o.w >= c.x + c.w - 2 && o.y + o.h >= c.y + c.h - 2)?.preench || fundo;
                if (atras && /^#/.test(sdCorHex(atras)) && c.cor && sdContraste(sdHex6(c.cor), sdHex6(atras)) < 3) add(s, c, 'contraste', `contraste ${sdContraste(sdHex6(c.cor), sdHex6(atras)).toFixed(1)}:1 entre ${c.cor} e ${atras} (mínimo 3, ideal 4,5)`);
            }
            if ((c.tipo === 'imagem' || c.tipo === 'video') && c.src && !sdSrc(c.src) && !/^data:/.test(c.src)) { const u = await sdUrl(c.src); if (!u) add(s, c, 'midia', 'arquivo não encontrado: ' + c.src); }
        }
        const ts = vis.filter(c => c.tipo === 'texto' && sdTextoPuro(c).trim() && !sdDecorativo(c));
        for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
            const a = ts[i], b = ts[j], ha = Math.max(a.h, (med[a.id] || {}).alt || 0), hb = Math.max(b.h, (med[b.id] || {}).alt || 0);
            const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + ha, b.y + hb) - Math.max(a.y, b.y);
            if (ix > 10 && iy > 10 && !(a.grupo && a.grupo === b.grupo)) add(s, b, 'sobreposto', `texto em cima de "${(a.nome || a.id)}" (${a.id})`);
        }
    }
    return { ok: !prob.length, total: prob.length, problemas: prob };
}
function sdAchar(q) {
    const t = String(q || '').toLowerCase(), r = [];
    SD.doc.slides.forEach((s, i) => s.camadas.forEach(c => { const txt = c.tipo === 'texto' ? sdTextoPuro(c) : c.tipo === 'grafico' ? (c.rotulos || []).join(' ') : ''; if ((txt + ' ' + (c.nome || '')).toLowerCase().includes(t)) r.push({ slide: i + 1, id: c.id, nome: c.nome, texto: txt.slice(0, 60) }); }));
    return r;
}
async function sdLote(lista) {   // um desfazer só para vários comandos
    sdHist(); const h0 = SD.hist.length, out = [];
    for (const [nome, a] of lista) { out.push(await sdCmd(nome, a || {})); SD.hist.length = h0; }
    sdMudou('tudo'); return out;
}
sdRegistrar('substituir', 'troca um texto em todos os slides {de, para, slide}', a => {
    if (!a.de) throw new Error('falta "de"');
    const esc = String(a.de).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp(esc, 'g'), ids = [];
    for (const s of a.slide != null ? [sdSlide(a.slide)] : SD.doc.slides) for (const c of s.camadas) {
        if (c.tipo === 'texto' && c.html && re.test(c.html)) { c.html = c.html.replace(re, sdEsc(a.para ?? '')); ids.push(c.id); }
        if (c.tipo === 'grafico' && c.rotulos) c.rotulos = c.rotulos.map(r => String(r).replace(re, a.para ?? ''));
        re.lastIndex = 0;
    }
    return { ids };
});
const SD_ESTILO = ['fonte', 'tam', 'peso', 'cor', 'alin', 'valin', 'entrelinha', 'espaco', 'caixa', 'italico', 'sublinhado', 'fundo', 'pad', 'raio', 'preench', 'preench2', 'angulo', 'traco', 'espessura', 'tracejado',
    'opac', 'mescla', 'sombra', 'desfoque', 'contorno', 'sombraTexto', 'filtros', 'borda', 'anim', 'cores', 'corTexto', 'tamTexto', 'valores', 'legenda', 'grade', 'buraco', 'prefixo', 'sufixo'];
sdRegistrar('estilo_copiar', 'copia o estilo (fonte, cores, sombra, animação…) da camada {id} — Ctrl+Shift+C', a => {
    const c = sdAlvos(a)[0]; if (!c) throw new Error('nada selecionado');
    SD.estilo = { tipo: c.tipo, v: sdClone(Object.fromEntries(SD_ESTILO.filter(k => c[k] !== undefined).map(k => [k, c[k]]))) };
    return { id: c.id };
}, { leitura: true });
sdRegistrar('estilo_colar', 'cola o estilo copiado nas camadas {ids} — Ctrl+Shift+V', a => {
    if (!SD.estilo) throw new Error('copie um estilo antes (Ctrl+Shift+C)');
    const cs = sdAlvos(a); cs.forEach(c => { for (const [k, v] of Object.entries(SD.estilo.v)) { if (c.tipo !== SD.estilo.tipo && !['opac', 'mescla', 'sombra', 'desfoque', 'anim', 'raio'].includes(k)) continue; c[k] = sdClone(v); }
        if (c.tipo === 'texto' && SD.estilo.tipo === 'texto' && c.html) c.html = c.html.replace(/(^|[;"\s])color:\s*[^;"]+;?/gi, '$1'); });
    return { ids: cs.map(c => c.id) };
}, { qual: 'camadas' });
sdRegistrar('slide_layout', 'troca o layout do slide mantendo os textos (Título → Título, o resto em ordem) e o tema {layout: ' + Object.keys(SD_LAYOUTS).join('|') + ', slide}', a => {
    const s = sdSlide(a.slide), n = sdNovoSlide(a.layout || 'titulo_texto'); n.id = s.id; n.notas = s.notas; n.transicao = s.transicao;
    const velhos = s.camadas.filter(c => c.tipo === 'texto' && sdTextoPuro(c).trim()), usados = new Set();
    const novos = n.camadas.filter(c => c.tipo === 'texto');
    for (const c of novos) { const v = velhos.find(o => !usados.has(o) && o.nome === c.nome); if (v) { c.html = v.html; usados.add(v); } }
    for (const c of novos) { if (velhos.some(o => o.nome === c.nome)) continue; const v = velhos.find(o => !usados.has(o) && !/^(Título|Número|Aspas)$/.test(o.nome || '')); if (v && !/^(Aspas|Número)$/.test(c.nome)) { c.html = v.html; usados.add(v); } }
    // o que sobrou (fotos, gráficos, textos que não acharam lugar) continua no slide, por cima
    n.camadas.push(...s.camadas.filter(c => c.tipo !== 'texto' ? !(c.tipo === 'forma' && s.camadas.some(x => x === c) && /^(Faixa|Marcador \d|Espaço da imagem)$/.test(c.nome || '')) : !usados.has(c) && sdTextoPuro(c).trim()));
    SD.doc.slides[sdIdx(s)] = n; SD.sel = []; return { slide: sdIdx(n) + 1 };
});
Object.assign(window.SDK, {
    texto: op => sdTextoDoc(typeof op === 'number' ? { slide: op } : op || {}),
    folha: op => sdFolha(op || {}), revisar: op => sdRevisar(typeof op === 'number' ? { slide: op } : op || {}),
    achar: q => sdAchar(q), lote: l => sdLote(l), grafico: (a = {}) => sdCmd('grafico', a), modelosGrafico: () => SD_GRAF_MODELOS.map(m => ({ id: m.id, nome: m.nome, desc: m.desc, tipo: m.g.grafico })),
    ajuda: () => 'Ler: SDK.texto() (barato) · SDK.folha({caminho}) (todas as páginas numa imagem) · SDK.foto(n) · SDK.revisar(). Mexer: SDK.cmd(nome, args) — lista em SDK.comandos(); vários de uma vez: SDK.lote([[nome, args], ...]); slide inteiro: SDK.cena(html, {novo: true}). Gráfico: SDK.grafico({modelo, csv}). Paletas: SDK.cmd("paletas"), "paleta_salvar", "paleta_tema". Guia: Instructions/slider-kanivete.md',
});
