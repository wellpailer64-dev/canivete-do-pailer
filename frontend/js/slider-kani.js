// =========================================================
// Slider Kanivete — KANI ajudando a criar (modelo local; Functions/slider_kani.py). Ela escreve o CONTEÚDO numa ficha
// travada; quem monta é o código, com os layouts do tema (nunca estoura: 'ajustar_textos' encolhe o que não cabe).
//   Barra › Kani: criar a palestra a partir de um tema ou de um texto colado (nova ou acrescentando slides),
//   reescrever o texto selecionado (tópicos, encurtar, título, revisar português) e escrever as notas do apresentador.
// Comandos (o agente usa os mesmos): 'kani_montar' {roteiro, tema, nova}, 'ajustar_textos' {slide|todos, ids}.
// =========================================================
const SDK_KANI = { ocupada: false };

// encolhe a letra do texto que não cabe na caixa (mede com a fonte de verdade)
sdRegistrar('ajustar_textos', 'diminui a letra dos textos que não cabem na caixa {slide | todos, ids, minimo (px, 20)}', a => {
    const alvos = a.todos ? SD.doc.slides : [sdSlide(a.slide)], ids = a.ids && new Set(a.ids), mexidos = [];
    for (const s of alvos) {
        for (let volta = 0; volta < 10; volta++) {
            const med = sdMedirTextos(s); let algum = false;
            for (const c of s.camadas) {
                if (c.tipo !== 'texto' || (ids && !ids.has(c.id)) || !med[c.id] || med[c.id].alt <= c.h + 2) continue;
                const novo = Math.max(+a.minimo || 20, Math.floor((+c.tam || 40) * 0.92));
                if (novo >= (+c.tam || 40)) continue;
                c.tam = novo; algum = true; if (!mexidos.includes(c.id)) mexidos.push(c.id);
            }
            if (!algum) break;
        }
    }
    return { ids: mexidos };
});

// ficha da Kani → slides com os layouts do tema
function sdKaniSlide(f, T, nSecao) {
    const s = sdNovoSlide(f.layout, null, T), L = s.camadas, ach = n => L.find(c => c.nome === n), esc = t => sdEsc(t || '');
    const por = (n, t) => { const c = ach(n); if (c) { if (t) c.html = esc(t); else L.splice(L.indexOf(c), 1); } };
    por('Título', f.titulo);
    if (f.layout === 'titulo') por('Subtítulo', f.texto);
    else if (f.layout === 'secao') por('Número', String(nSecao).padStart(2, '0'));
    else if (f.layout === 'titulo_texto' || f.layout === 'imagem_lateral') por('Texto', f.texto || (f.topicos || []).join(' · '));
    else if (f.layout === 'numero') { por('Número', f.numero); por('Legenda', f.legenda || f.texto); }
    else if (f.layout === 'citacao') { por('Citação', f.citacao || f.texto); por('Autor', f.autor ? '— ' + f.autor : ''); }
    else if (f.layout === 'encerramento') por('Contato', f.texto);
    else if (f.layout === 'duas_colunas') {
        const tp = f.topicos || [], meio = Math.ceil(tp.length / 2);
        por('Coluna 1', null); por('Coluna 2', null);
        [[tp.slice(0, meio), 140], [tp.slice(meio), 1000]].forEach(([itens, x], k) => { if (itens.length) L.push(sdTxt({ nome: `Coluna ${k + 1}`, html: itens.map(t => '• ' + esc(t)).join('<br>'), x, y: 300, w: 780, h: 560, tam: 44, entrelinha: 1.5 }, T)); });
    } else if (f.layout === 'lista') {
        for (const c of [...L]) if (/^(Marcador|Tópico) /.test(c.nome)) L.splice(L.indexOf(c), 1);
        const tp = (f.topicos || []).slice(0, 5), passo = Math.min(170, 620 / Math.max(1, tp.length)), C = T.cores;
        tp.forEach((t, k) => {
            L.push({ id: sdId(), tipo: 'forma', nome: `Marcador ${k + 1}`, forma: 'elipse', x: 150, y: 330 + k * passo, w: 28, h: 28, rot: 0, opac: 1, preench: C.destaque });
            L.push(sdTxt({ nome: `Tópico ${k + 1}`, html: esc(t), x: 220, y: 310 + k * passo, w: 1500, h: Math.min(140, passo - 10), tam: 48 }, T));
        });
    }
    s.notas = f.notas || '';
    return s;
}
sdRegistrar('kani_montar', 'monta slides a partir de um roteiro {roteiro: {titulo, slides: [{layout, titulo, texto, topicos, numero, legenda, citacao, autor, notas}]}, tema (claro|escuro|editorial|corporativo), nova, depois}', a => {
    const r = a.roteiro || {}, fichas = r.slides || [];
    if (!fichas.length) throw new Error('roteiro sem slides');
    if (a.nova || !SD.doc) { const T = sdClone(SD_TEMAS[a.tema] || SD_TEMAS.claro); delete T.nome; sdCarregar({ nome: r.titulo || 'Apresentação', largura: 1920, altura: 1080, tema: T, slides: [sdNovoSlide('vazio', null, T)] }); }
    const T = SD.doc.tema; let sec = 0;
    const novos = fichas.map(f => sdKaniSlide(f, T, f.layout === 'secao' ? ++sec : sec));
    const i = a.nova ? 0 : (a.depois != null ? +a.depois : SD.atual + 1);
    SD.doc.slides.splice(i, a.nova ? SD.doc.slides.length : 0, ...novos);
    SD.atual = i; SD.sel = [];
    return { slides: novos.length, slide: i + 1 };
});

async function sdKaniPedir(acao, dados) {
    if (SDK_KANI.ocupada) throw new Error('a Kani ainda está pensando no pedido anterior');
    SDK_KANI.ocupada = true; sdKaniStatus('Kani pensando…', true);
    try {
        const r = await sdApi().sd_kani(acao, dados);
        if (!r || !r.success) throw new Error((r && r.error) || 'a Kani não respondeu');
        return r;
    } finally { SDK_KANI.ocupada = false; sdKaniStatus(''); }
}
async function sdKaniCriar(pedido, n, tema, nova) {
    const r = await sdKaniPedir('roteiro', { pedido, n });
    await sdCmd('kani_montar', { roteiro: r, tema, nova });
    if (typeof sdMostrarEditor === 'function' && sdEl('sd-inicio') && !sdEl('sd-inicio').hidden) sdMostrarEditor();
    await sdGarantirFontes(); await document.fonts.ready;
    await sdCmd('ajustar_textos', { todos: true });
    return r;
}
async function sdKaniReescrever(modo) {
    const c = sdAlvos({}).find(x => x.tipo === 'texto'); if (!c) throw new Error('selecione um texto');
    const r = await sdKaniPedir('reescrever', { texto: sdTextoPuro(c), modo });
    const html = modo === 'topicos' ? (r.topicos || []).map(t => '• ' + sdEsc(t)).join('<br>') : sdEsc(r.texto || '');
    if (!html) throw new Error('a Kani devolveu vazio');
    await sdCmd('editar', { ids: [c.id], html });
    await sdCmd('ajustar_textos', { ids: [c.id] });
}
async function sdKaniNotas(todos) {
    const alvos = todos ? SD.doc.slides.filter(s => !(s.notas || '').trim()) : [sdSlide()];
    let n = 0;
    for (const s of alvos) {
        const texto = s.camadas.filter(c => c.tipo === 'texto' && !c.oculto).map(sdTextoPuro).filter(t => t.trim()).join('\n');
        if (!texto) continue;
        sdKaniStatus(`Kani escrevendo as notas (${n + 1} de ${alvos.length})…`, true);
        const r = await sdKaniPedir('notas', { texto, contexto: SD.doc.nome || '' });
        await sdCmd('slide_props', { slide: s.id, notas: r.notas }); n++;
    }
    sdRenderNotas(); return n;
}

// ───────────── janela da Kani (fica aberta enquanto ela trabalha) ─────────────
function sdKaniStatus(t, girando) { const e = document.querySelector('.sd-kani-status'); if (e) { e.textContent = t; e.classList.toggle('girando', !!girando); } document.querySelectorAll('.sd-kani button[data-k]').forEach(b => { b.disabled = SDK_KANI.ocupada; }); }
function sdKaniAbrir(ancora) {
    let box = document.querySelector('.sd-kani');
    if (box) { box.remove(); return; }
    box = document.createElement('div'); box.className = 'sd-kani';
    const temSel = sdAlvos({}).some(c => c.tipo === 'texto');
    box.innerHTML = `<header><img src="identidade/kani.webp" alt=""><div><b>Kani</b><small>escreve o conteúdo; o Slider monta no tema</small></div><button class="sd-kani-x" title="Fechar">×</button></header>
      <section><h5>Criar apresentação</h5>
        <textarea data-kp placeholder="Sobre o que é a palestra? Cole o roteiro, os tópicos ou um texto. Números e nomes que você escrever aqui são os únicos que ela usa.">${sdEsc(SDK_KANI.pedido || '')}</textarea>
        <div class="sd-kani-linha"><label>Slides <input type="number" data-kn min="3" max="20" value="${SDK_KANI.n || 8}"></label>
          <label>Tema <select data-kt>${Object.entries(SD_TEMAS).map(([k, t]) => `<option value="${k}"${(SDK_KANI.tema || 'claro') === k ? ' selected' : ''}>${t.nome}</option>`).join('')}</select></label></div>
        <div class="sd-kani-linha"><button class="sd-btn sd-pri" data-k="nova">Criar apresentação nova</button><button class="sd-btn" data-k="mais" ${SD.doc ? '' : 'disabled'} title="Acrescenta os slides depois do atual, no tema desta apresentação">Acrescentar aqui</button></div></section>
      <section><h5>Texto selecionado</h5><div class="sd-kani-grade">
        ${[['topicos', 'Virar tópicos'], ['curto', 'Encurtar'], ['titulo', 'Sugerir título'], ['revisar', 'Revisar português']].map(([m, n]) => `<button class="sd-btn" data-k="r:${m}" ${temSel ? '' : 'disabled'}>${n}</button>`).join('')}</div></section>
      <section><h5>Notas do apresentador</h5><div class="sd-kani-grade"><button class="sd-btn" data-k="notas" ${SD.doc ? '' : 'disabled'}>Deste slide</button><button class="sd-btn" data-k="notas-todos" ${SD.doc ? '' : 'disabled'}>Dos slides sem nota</button></div></section>
      <div class="sd-kani-status"></div>`;
    document.body.appendChild(box);
    const r = ancora ? ancora.getBoundingClientRect() : { left: innerWidth / 2 - 180, bottom: 120 };
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - box.offsetWidth - 8)) + 'px'; box.style.top = Math.min(r.bottom + 6, innerHeight - box.offsetHeight - 8) + 'px';
    box.addEventListener('keydown', e => e.stopPropagation());
    box.addEventListener('input', e => { if (e.target.matches('[data-kp]')) SDK_KANI.pedido = e.target.value; if (e.target.matches('[data-kn]')) SDK_KANI.n = +e.target.value; if (e.target.matches('[data-kt]')) SDK_KANI.tema = e.target.value; });
    box.addEventListener('click', async e => {
        if (e.target.closest('.sd-kani-x')) { box.remove(); return; }
        const b = e.target.closest('[data-k]'); if (!b || b.disabled) return;
        const k = b.dataset.k;
        try {
            if (k === 'nova' || k === 'mais') {
                const pedido = box.querySelector('[data-kp]').value.trim(); if (pedido.length < 8) { sdKaniStatus('Escreva sobre o que é a palestra'); return; }
                if (k === 'nova' && !(await sdPodeDescartar())) return;
                const r = await sdKaniCriar(pedido, +box.querySelector('[data-kn]').value || 8, box.querySelector('[data-kt]').value, k === 'nova');
                sdKaniStatus(`Pronto: ${r.slides.length} slides. Confira os textos e troque o que quiser.`);
            } else if (k.startsWith('r:')) { await sdKaniReescrever(k.slice(2)); sdKaniStatus('Texto trocado (Ctrl+Z volta).'); }
            else if (k === 'notas' || k === 'notas-todos') { const n = await sdKaniNotas(k === 'notas-todos'); sdKaniStatus(n ? `Notas escritas em ${n} slide(s).` : 'Nenhum slide com texto para escrever notas.'); }
        } catch (x) { sdKaniStatus(x.message || String(x)); }
    });
}
window.SDK_KANI_API = { criar: sdKaniCriar, reescrever: sdKaniReescrever, notas: sdKaniNotas, abrir: sdKaniAbrir };
