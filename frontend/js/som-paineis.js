// =========================================================
// Sound Kanivete — interface em painéis: em cima, três colunas (esquerda: Mídia / Sons / Voz IA; centro: Monitor com
// transporte, medidores por faixa e master, LUFS; direita: Clipe / Faixa / Texto / Exportar), divisória arrastável e a
// timeline embaixo. Sem janelas soltas (só a de salvar/abrir do Windows). Núcleo em som.js, reprodução em som-motor.js.
// =========================================================
SK.painel = 'clipe'; SK.abaEsq = 'midia'; SK.midia = [];
const SK_ABAS_ESQ = [['midia', 'Mídia'], ['sons', 'Sons'], ['voz', 'Voz IA']];
const SK_ABAS_DIR = [['clipe', 'Clipe'], ['faixa', 'Faixa'], ['texto', 'Texto'], ['exportar', 'Exportar']];
const skEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function skMontar() {
    const raiz = skEl('sk'); if (!raiz || raiz.dataset.ok) return;
    raiz.dataset.ok = '1';
    const abas = (lado, l) => `<nav class="sk-abas notranslate" translate="no" data-lado="${lado}">${l.map(([k, n]) => `<button data-aba="${k}">${n}</button>`).join('')}</nav>`;
    raiz.innerHTML = `
    <header class="ie-top">
        <div class="ie-brand"><span class="app-logo al-sk app-logo-marca">Sk</span> Sound Kanivete</div>
        <div class="sk-tbar">
            <button class="ie-btn" onclick="skImportarDialogo()" title="Importar áudio (Ctrl+I)">+ Áudio</button>
            <button class="ie-btn" onclick="SK.proj ? skNovaFaixa() : skNovo()" title="Nova faixa">+ Faixa</button>
        </div>
        <div class="ie-top-spacer"></div>
        <span class="ie-top-info notranslate" id="sk-info"></span>
        <button class="ie-btn" onclick="skAbrir().catch(e => skToast(e.message))">Abrir</button>
        <button class="ie-btn" onclick="skEnviarEditor().catch(e => skToast(e.message))" title="A mixagem vai como áudio para a timeline do Editor de vídeo">→ Editor</button>
        <button class="ie-btn ie-btn-primario" onclick="skSalvar().catch(e => skToast(e.message))" title="Salvar .sknv (Ctrl+S)">Salvar</button>
    </header>
    <div class="sk-cima">
        <section class="sk-pn">${abas('esq', SK_ABAS_ESQ)}<div class="sk-pn-corpo" id="sk-esq"></div></section>
        <section class="sk-pn sk-monitor">
            <div class="sk-transp">
                <button class="ie-btn" onclick="skIr(0)" title="Início (Home)">⏮</button>
                <button class="ie-btn sk-play" id="sk-play" onclick="SK.tocando ? skParar() : skTocar()" title="Tocar/parar (Espaço)">▶</button>
                <button class="ie-btn" onclick="skIr(skFim())" title="Fim (End)">⏭</button>
                <button class="ie-btn sk-rec" id="sk-rec" onclick="(SK.grav ? skGravarParar() : skGravar()).catch(e => skToast(e.message))" title="Gravar do microfone na faixa escolhida, a partir da agulha (R)">●</button>
                <span class="sk-tempo" id="sk-tempo">0:00.00</span>
                <span class="sk-sep"></span>
                <button class="ie-btn" onclick="skCortar()" title="Cortar na agulha (S)">✂ Cortar</button>
                <button class="ie-btn" onclick="skMarcador()" title="Marcador (M)">◆</button>
                <button class="ie-btn" id="sk-curva-bt" onclick="SK.verCurva = !SK.verCurva; skUi(); skDesenhar()" title="Curva de volume (V)">〰</button>
                <label class="sk-chk"><input type="checkbox" id="sk-encaixe" checked onchange="SK.encaixe = this.checked"> Encaixar</label>
                <button class="ie-btn" onclick="skEnquadrar()" title="Ver tudo (Ctrl+0)">⤢</button>
            </div>
            <canvas id="sk-medidor"></canvas>
            <div class="sk-loud notranslate" id="sk-loud"></div>
        </section>
        <section class="sk-pn">${abas('dir', SK_ABAS_DIR)}<div class="sk-pn-corpo sk-props" id="sk-props"></div></section>
    </div>
    <div class="sk-div" id="sk-div" title="Arraste para dar mais espaço à timeline ou aos painéis"></div>
    <div class="sk-corpo">
        <div class="sk-faixas notranslate" id="sk-faixas"></div>
        <div class="sk-tl-wrap" id="sk-tl-wrap"><canvas id="sk-tl"></canvas></div>
    </div>
    <footer class="ie-status sk-status"><span>Espaço tocar · S cortar · Alt+arrastar copia · cantos de cima = fades · Ctrl+roda zoom · arraste da Mídia/Sons para a timeline</span><span id="sk-status-info"></span></footer>
    <div class="ie-inicio" id="sk-inicio"><div class="ie-inicio-box">
        <span class="app-logo al-sk app-logo-grande">Sk</span><h2>Sound Kanivete</h2>
        <p>Edite áudio em várias faixas: cortar, juntar, fades, volume, limpar ruído, voz por IA, transcrever e exportar no volume certo.</p>
        <div class="ie-inicio-acoes"><button class="ie-btn ie-btn-primario" onclick="skImportarDialogo()">Importar áudio…</button><button class="ie-btn" onclick="skAbrir().catch(e => skToast(e.message))">Abrir projeto…</button></div>
        <div class="ie-recentes-tit">Começar com</div>
        <div class="sk-modelos">${[['podcast', 'Podcast (2 vozes)'], ['narracao', 'Narração com trilha'], ['musica', 'Música com voz'], ['limpar', 'Limpar gravação'], ['vazio', 'Projeto vazio']].map(([k, n]) => `<button class="ie-btn" onclick="skNovo('${k}')">${n}</button>`).join('')}</div>
        <div class="ie-recentes" id="sk-recuperar"></div>
        <div class="ie-recentes" id="sk-recentes"></div>
    </div></div>`;
    try { const h = +localStorage.getItem('sk-cima'); if (h > 120) raiz.style.setProperty('--sk-cima', h + 'px'); } catch (e) { /* sem storage */ }
    raiz.querySelectorAll('.sk-abas').forEach(n => n.onclick = e => { const b = e.target.closest('[data-aba]'); if (b) skAba(n.dataset.lado, b.dataset.aba); });
    skDivisoria(); skSoltarNaTimeline(); skEventos();
    new ResizeObserver(() => skUiMonitor()).observe(skEl('sk-medidor'));
    skUi(); skUiEsq();
}
function skAba(lado, aba) {
    if (lado === 'esq') { SK.abaEsq = aba; if (aba !== 'gravar') skMonitorarEntrada(false); skUiEsq(); } else { SK.painel = aba; skUiProps(); }
}
function skMarcarAbas() {
    document.querySelectorAll('#sk .sk-abas').forEach(n => { const at = n.dataset.lado === 'esq' ? SK.abaEsq : SK.painel; n.querySelectorAll('[data-aba]').forEach(b => b.classList.toggle('on', b.dataset.aba === at)); });
}
function skDivisoria() {
    const d = skEl('sk-div'), raiz = skEl('sk');
    d.onpointerdown = e => {
        d.setPointerCapture(e.pointerId);
        const y0 = e.clientY, h0 = raiz.querySelector('.sk-cima').getBoundingClientRect().height, max = raiz.clientHeight - 220;
        d.onpointermove = ev => { const h = Math.max(150, Math.min(max, h0 + ev.clientY - y0)); raiz.style.setProperty('--sk-cima', h + 'px'); skDesenhar(); };
        d.onpointerup = () => { d.onpointermove = null; try { localStorage.setItem('sk-cima', parseInt(raiz.style.getPropertyValue('--sk-cima'))); } catch (er) { /* sem storage */ } };
    };
}
// arrastar da Mídia/Sons para a timeline: solta na faixa e no tempo do ponteiro
function skSoltarNaTimeline() {
    const w = skEl('sk-tl-wrap');
    w.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/sk-arq')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    w.addEventListener('drop', async e => {
        const arq = e.dataTransfer.getData('text/sk-arq'); if (!arq) return;
        e.preventDefault(); e.stopPropagation();
        if (!SK.proj) skNovo();
        const r = w.getBoundingClientRect(), a = skAlvo(e.clientX - r.left, e.clientY - r.top);
        const f = a.f || SK.proj.faixas[a.i] || skNovaFaixa();
        await skImportar([arq], { faixa: f.id, ini: skEncaixar(Math.max(0, a.t)) });
    });
}
function skArrastavel(html, arq) { return `<div class="sk-item" draggable="true" data-arq="${skEsc(arq)}">${html}</div>`; }
document.addEventListener('dragstart', e => { const it = e.target.closest?.('#sk .sk-item[data-arq]'); if (it) e.dataTransfer.setData('text/sk-arq', it.dataset.arq); });

// ── painel da esquerda ──
function skUiEsq() {
    const el = skEl('sk-esq'); if (!el) return;
    skMarcarAbas();
    if (SK.abaEsq === 'midia') return skUiMidia(el);
    if (SK.abaEsq === 'sons') return skUiSons(el);
    if (SK.abaEsq === 'gravar') return skUiGravar(el);
    return skUiVoz(el);
}
function skUiMidia(el) {
    const usados = new Set(); for (const f of SK.proj?.faixas || []) for (const c of f.clipes) usados.add(c.arq);
    const lista = [...new Set([...usados, ...SK.midia])].filter(a => SK.picos[a]);
    el.innerHTML = `<div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="skImportarDialogo()">Importar…</button></div>
        <div class="sk-lista notranslate">${lista.map(a => { const p = SK.picos[a]; return skArrastavel(`<button data-ouvir="${skEsc(p.url)}" title="Ouvir">▶</button><span>${skEsc(p.nome)}<small>${skTempo(p.dur)}${usados.has(a) ? '' : ' · fora da timeline'}</small></span><button data-por="${skEsc(a)}" title="Inserir na agulha, na faixa escolhida">+</button>`, a); }).join('')}</div>
        ${lista.length ? '<div class="sk-p-info">Arraste para a timeline ou use + (entra na agulha).</div>' : '<div class="sk-p-info">Os áudios importados aparecem aqui. Arraste arquivos do Windows para a timeline ou clique em Importar.</div>'}`;
    skListaEventos(el, null);
}
function skListaEventos(el, faixaNome) {
    el.onclick = async e => {
        const o = e.target.closest('[data-ouvir]');
        if (o) { const a = SK.ouvir || (SK.ouvir = new Audio()); if (a.dataset.u === o.dataset.ouvir && !a.paused) { a.pause(); return; } a.dataset.u = o.dataset.ouvir; a.src = o.dataset.ouvir; a.play(); return; }
        const p = e.target.closest('[data-por]'); if (!p) return;
        if (!SK.proj) skNovo();
        const f = faixaNome ? (SK.proj.faixas.find(x => faixaNome.test(x.nome)) || skNovaFaixa('Efeitos')) : null;
        await skImportar([p.dataset.por], { faixa: f ? f.id : null, ini: SK.ph });
    };
}
async function skUiSons(el) {
    if (!SK.sons) {
        el.innerHTML = '<div class="sk-p-info">Carregando…</div>';
        const r = await skApi().ve_sb_estado().catch(() => null);
        if (!r || !r.instalado) {
            el.innerHTML = `<div class="sk-p-info">O pack de sons (CC0, ~10 MB) ainda não foi baixado.</div><div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" id="sk-sb-baixar">Baixar sons</button></div>`;
            el.querySelector('#sk-sb-baixar').onclick = async () => { el.innerHTML = '<div class="sk-p-info">Baixando…</div>'; await skApi().ve_sb_baixar(); setTimeout(() => { SK.sons = null; if (SK.abaEsq === 'sons') skUiEsq(); }, 4000); };
            return;
        }
        SK.sons = (r.categorias || []).flatMap(c => (c.sons || []).map(s => ({ ...s, categoria: c.nome || c.titulo || c.id || 'Sons', nome: s.nome || s.titulo || String(s.arq || '').split('/').pop() })));
    }
    if (SK.abaEsq !== 'sons') return;
    const cats = [...new Set(SK.sons.map(s => s.categoria))];
    el.innerHTML = `<input class="sk-busca" id="sk-sons-busca" placeholder="Buscar som…" value="${skEsc(SK.sonsBusca || '')}">
        <div class="sk-lista notranslate">${cats.map(c => `<div class="sk-p-tit">${skEsc(c)}</div>${SK.sons.filter(s => s.categoria === c).map(s => `<div data-nome="${skEsc(s.nome.toLowerCase())}">${skArrastavel(`<button data-ouvir="${skEsc(s.url)}">▶</button><span>${skEsc(s.nome)}</span><button data-por="${skEsc(s.path || s.caminho)}" title="Inserir na agulha (faixa Efeitos)">+</button>`, s.path || s.caminho)}</div>`).join('')}`).join('')}</div>`;
    const busca = el.querySelector('#sk-sons-busca'), filtra = () => { const q = (SK.sonsBusca = busca.value).toLowerCase(); el.querySelectorAll('[data-nome]').forEach(s => { s.hidden = q && !s.dataset.nome.includes(q); }); };
    busca.oninput = filtra; filtra();
    skListaEventos(el, /efeito|sons/i);
}
async function skUiVoz(el) {
    if (!SK.vozes) { el.innerHTML = '<div class="sk-p-info">Carregando vozes…</div>'; SK.vozes = await skApi().sk_vozes().catch(() => ({ success: false })); }
    if (SK.abaEsq !== 'voz') return;
    const r = SK.vozes;
    if (!r.success || !r.instalado || !r.vozes.length) { el.innerHTML = `<div class="sk-p-info">Crie uma voz em Geração de Voz (OmniVoice) primeiro.</div><div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="switchTool('omnivoice')">Abrir Geração de Voz</button><button class="ie-btn ie-btn-mini" onclick="SK.vozes=null;skUiEsq()">Atualizar</button></div>`; return; }
    el.innerHTML = `<label class="sk-p-l2">Voz <select id="skv-voz" class="notranslate">${r.vozes.map(v => `<option value="${skEsc(v.id)}">${skEsc(v.nome)}</option>`).join('')}</select></label>
        <textarea id="skv-txt" class="sk-txt" rows="6" placeholder="Texto que a voz vai falar">${skEsc(SK.vozTexto || '')}</textarea>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini ie-btn-primario" id="skv-ok" ${SK.tarefa ? 'disabled' : ''}>Gerar fala</button></div>
        <div class="sk-p-info">A fala entra na agulha, na faixa "Voz IA".</div>`;
    const t = el.querySelector('#skv-txt'); t.oninput = () => { SK.vozTexto = t.value; };
    el.querySelector('#skv-ok').onclick = () => { const v = el.querySelector('#skv-voz').value, x = t.value.trim(); if (!x) return; if (!SK.proj) skNovo('narracao'); skVoz(v, x).catch(e => skToast(e.message)); };
}

// ── painel da direita ──
function skUiProps() {
    const el = skEl('sk-props'); if (!el) return;
    const marca = (SK.sel || '') + '|' + (SK.int ? 'i' : '');
    if (SK._ultSel !== marca && (SK.painel === 'clipe' || SK.painel === 'faixa')) SK.painel = SK.sel || SK.int ? 'clipe' : 'faixa';
    SK._ultSel = marca;
    skMarcarAbas();
    if (!SK.proj) { el.innerHTML = ''; return; }
    ({ clipe: skUiClipe, faixa: skUiFaixa, texto: skUiTexto, exportar: skUiExportar })[SK.painel]?.(el);
}
function skUiIntervalo() {
    const I = SK.int; if (!I) return '';
    return `<div class="sk-grupo sk-int"><div class="sk-p-tit">Intervalo</div>
        <div class="sk-p-info notranslate">${skTempo(I.a)} → ${skTempo(I.b)} (${(I.b - I.a).toFixed(2)} s) · ${I.faixas.length} faixa(s)</div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="skIntApagar(false)" title="Del">Apagar (fica silêncio)</button>
        <button class="ie-btn ie-btn-mini" onclick="skIntApagar(true)" title="Shift+Del">Apagar e puxar</button>
        <button class="ie-btn ie-btn-mini" onclick="skIntCopiar() && skToast('Copiado')" title="Ctrl+C">Copiar</button>
        <button class="ie-btn ie-btn-mini" onclick="skColar()" title="Ctrl+V (na agulha, faixa escolhida)">Colar</button>
        <button class="ie-btn ie-btn-mini" onclick="skIntRecortar()" title="O projeto fica só com o intervalo">Recortar ao intervalo</button>
        <button class="ie-btn ie-btn-mini" onclick="SK.int = null; skUi(); skDesenhar()" title="Esc">Desmarcar</button></div></div>`;
}
function skUiClipe(el) {
    el.onclick = el.oninput = el.onchange = null;
    const [c] = SK.sel ? skClipe(SK.sel) : [null];
    if (!c && SK.int) { el.innerHTML = skUiIntervalo() + '<div class="sk-p-info">Arraste no vazio de uma faixa (ou Shift+arrastar sobre os clipes) para marcar um intervalo; descendo, ele pega mais faixas.</div>'; return; }
    if (!c) { el.innerHTML = `<div class="sk-p-info">Clique num clipe na timeline para editar volume, fades, limpar ruído, igualar volume e cortar pausas.</div>`; return; }
    const num = (r, k, v, passo, uni) => `<label class="sk-p-l">${r}<input type="number" step="${passo}" value="${(+v).toFixed(2)}" data-p="${k}"><small>${uni}</small></label>`;
    const ocup = !!SK.tarefa;
    el.innerHTML = `<div class="sk-p-nome notranslate">${skEsc(c.nome)}</div>
        <div class="sk-grupo"><div class="sk-p-tit">Tempo</div>${num('Começa em', 'ini', c.ini, 0.01, 's')}${num('Duração', 'dur', c.dur, 0.01, 's')}${num('Desde', 'de', c.de, 0.01, 's')}</div>
        <div class="sk-grupo"><div class="sk-p-tit">Volume e fades</div>
        <label class="sk-p-l">Volume<input type="range" min="0" max="3" step="0.01" value="${c.vol}" data-p="vol"><small>${skDb(c.vol)} dB</small></label>
        ${num('Fade de entrada', 'fade_in', c.fade_in, 0.05, 's')}${num('Fade de saída', 'fade_out', c.fade_out, 0.05, 's')}
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini${SK.verCurva ? ' on' : ''}" onclick="SK.verCurva = !SK.verCurva; skUi(); skDesenhar()" title="V: clique na linha cria ponto, arraste move, Alt+clique apaga">〰 Curva de volume</button>
        ${c.curva ? `<button class="ie-btn ie-btn-mini" onclick="SKN.curva('${c.id}', null)">Tirar curva</button>` : ''}</div></div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="skCortar()">Cortar na agulha</button><button class="ie-btn ie-btn-mini" onclick="skDuplicar()">Duplicar</button><button class="ie-btn ie-btn-mini" onclick="skApagar()">Apagar</button></div>
        <div class="sk-grupo"><div class="sk-p-tit">Volume e pausas</div><div class="sk-p-acoes">
            <select id="sk-alvo"><option value="-16">-16 LUFS (voz/podcast)</option><option value="-14">-14 LUFS (redes)</option><option value="-20">-20 LUFS (fundo)</option></select>
            <button class="ie-btn ie-btn-mini" id="sk-igualar">Igualar volume</button><button class="ie-btn ie-btn-mini" id="sk-silencio">Cortar silêncios</button></div></div>
        <div class="sk-grupo"><div class="sk-p-tit">Limpeza (IA)</div>
        <label class="sk-p-l">Limpar ruído<input type="range" min="10" max="100" step="5" value="${SK.qLimpo || 80}" id="sk-q-limpo"><small id="sk-q-txt">${SK.qLimpo || 80}%</small></label>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" id="sk-limpar" ${ocup ? 'disabled' : ''}>Limpar ruído</button>
        <button class="ie-btn ie-btn-mini" id="sk-melhorar" ${ocup ? 'disabled' : ''} title="Sidon + OmniVoice: voz de estúdio (leva alguns minutos)">Melhorar voz (IA)</button>
        ${c.orig ? '<button class="ie-btn ie-btn-mini" id="sk-orig">Voltar ao original</button>' : ''}</div>
        ${c.efeitos ? `<div class="sk-p-info">Aplicado: ${c.efeitos.join(', ')}</div>` : ''}
        <div class="sk-p-info">Vira um arquivo novo ao lado do original e vale para todos os clipes dessa gravação.</div></div>`;
    const q = el.querySelector('#sk-q-limpo');
    q.oninput = () => { SK.qLimpo = +q.value; el.querySelector('#sk-q-txt').textContent = q.value + '%'; };
    el.querySelector('#sk-limpar').onclick = () => skEfeito(c.id, 'limpar', { quantidade: SK.qLimpo || 80 }).catch(e => skToast(e.message));
    el.querySelector('#sk-melhorar').onclick = () => skEfeito(c.id, 'melhorar').catch(e => skToast(e.message));
    const o = el.querySelector('#sk-orig'); if (o) o.onclick = () => skOriginal(c.id);
    el.querySelector('#sk-igualar').onclick = () => skIgualar(SK.sel, +el.querySelector('#sk-alvo').value).catch(e => skToast(e.message));
    el.querySelector('#sk-silencio').onclick = () => skCortarSilencios(SK.sel).then(n => skToast(n ? `${n} pausa(s) cortada(s)` : 'Nenhuma pausa longa')).catch(e => skToast(e.message));
}
function skFxCompleto(fx) {   // preenche as chaves que faltam (projetos antigos só tinham eq/comp)
    const base = JSON.parse(JSON.stringify(SK_PRESETS_FX.nenhum));
    for (const k in base) base[k] = Object.assign(base[k], (fx || {})[k] || {});
    base.geq.bandas = (base.geq.bandas || []).concat(Array(10).fill(0)).slice(0, 10);
    return base;
}
function skUiFaixa(el) {
    const f = SK.proj.faixas.find(x => x.id === SK.faixaSel) || SK.proj.faixas[0];
    if (!f) { el.innerHTML = '<div class="sk-p-info">Sem faixas.</div>'; return; }
    const fx = skFxCompleto(f.fx);
    const sl = (r, k, v, min, max, passo, uni, casas = 0) => `<label class="sk-p-l">${r}<input type="range" min="${min}" max="${max}" step="${passo}" value="${v}" data-fx="${k}" data-uni="${uni}" data-casas="${casas}"><small>${(+v).toFixed(casas)}${uni}</small></label>`;
    const liga = (k, r) => `<label class="sk-chk sk-liga"><input type="checkbox" data-fx="${k}.ativo" ${fx[k].ativo ? 'checked' : ''}> ${r}</label>`;
    const rot = n => n >= 1000 ? n / 1000 + 'k' : n;
    el.innerHTML = `<div class="sk-p-nome notranslate" style="color:${f.cor}">${skEsc(f.nome)}</div>
        <div class="sk-p-info">${f.clipes.length} clipe(s) · volume ${skDb(f.vol)} dB${f.mudo ? ' · muda' : ''}${f.solo ? ' · solo' : ''}</div>
        <div class="sk-p-acoes">${Object.entries(SK_PRESETS_NOMES).map(([k, n]) => `<button class="ie-btn ie-btn-mini" data-preset="${k}">${n}</button>`).join('')}</div>
        <div class="sk-p-info">Cadeia na ordem: passa-alta → gate → EQ → EQ gráfico → de-esser → compressor → reverb.</div>
        <div class="sk-grupo">${liga('hpf', 'Passa-alta')}${sl('Corte', 'hpf.freq', fx.hpf.freq, 20, 300, 5, ' Hz')}</div>
        <div class="sk-grupo">${liga('gate', 'Gate (corta o fundo entre as falas)')}${sl('Limiar', 'gate.limiar', fx.gate.limiar, -80, -20, 1, ' dB')}</div>
        <div class="sk-grupo"><div class="sk-p-tit">Equalizador</div>${sl('Grave', 'eq.grave', fx.eq.grave, -12, 12, 0.5, ' dB', 1)}${sl('Médio', 'eq.medio', fx.eq.medio, -12, 12, 0.5, ' dB', 1)}${sl('Agudo', 'eq.agudo', fx.eq.agudo, -12, 12, 0.5, ' dB', 1)}</div>
        <div class="sk-grupo">${liga('geq', 'EQ gráfico (10 bandas)')}<div class="sk-geq">${SK_GEQ.map((q, i) => `<label><input type="range" min="-12" max="12" step="0.5" value="${fx.geq.bandas[i]}" data-fx="geq.bandas.${i}" data-uni="" data-casas="1" orient="vertical"><small>${(+fx.geq.bandas[i]).toFixed(1)}</small><span>${rot(q)}</span></label>`).join('')}</div></div>
        <div class="sk-grupo">${liga('deess', 'De-esser (suaviza o "s")')}${sl('Quanto', 'deess.quant', fx.deess.quant, 0.1, 0.9, 0.05, '', 2)}</div>
        <div class="sk-grupo"><div class="sk-p-tit">Compressor</div><label class="sk-chk"><input type="checkbox" data-fx="comp.ativo" ${fx.comp.ativo ? 'checked' : ''}> Ligado</label>
        ${sl('Limiar', 'comp.limiar', fx.comp.limiar, -50, 0, 1, ' dB')}${sl('Razão', 'comp.razao', fx.comp.razao, 1, 12, 0.5, ':1', 1)}${sl('Ganho', 'comp.ganho', fx.comp.ganho, 0, 18, 0.5, ' dB', 1)}</div>
        <div class="sk-grupo">${liga('rev', 'Reverb')}<label class="sk-p-l">Ambiente<select data-fx="rev.tamanho">${[[0.6, 'Sala pequena'], [1.2, 'Estúdio'], [2.5, 'Salão'], [4, 'Igreja']].map(([v, n]) => `<option value="${v}"${+fx.rev.tamanho === v ? ' selected' : ''}>${n}</option>`).join('')}</select><small></small></label>
        ${sl('Mistura', 'rev.mix', fx.rev.mix, 0, 0.6, 0.01, '', 2)}</div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" data-igualar-faixa="${f.id}">Igualar volume dos clipes (-16 LUFS)</button></div>
        <div class="sk-grupo"><div class="sk-p-tit">Abaixar sob a voz (ducking)</div>
        <div class="sk-p-acoes"><select id="sk-duck-db"><option value="-6">-6 dB</option><option value="-12" selected>-12 dB</option><option value="-18">-18 dB</option><option value="-24">-24 dB</option></select>
        <button class="ie-btn ie-btn-mini" data-duck="1">Abaixar quando as outras faixas falam</button>${f.clipes.some(c => c.curva) ? '<button class="ie-btn ie-btn-mini" data-duck="0">Tirar</button>' : ''}</div>
        <div class="sk-p-info">Escreve a curva de volume dos clipes desta faixa (dá para ajustar depois com 〰).</div></div>`;
    el.oninput = e => {
        const k = e.target.dataset.fx; if (!k) return;
        const [g, p, i] = k.split('.'); f.fx = skFxCompleto(f.fx);
        const v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
        if (i != null) f.fx[g][p][+i] = v; else f.fx[g][p] = v;
        const s = e.target.nextElementSibling; if (s && e.target.type === 'range') s.textContent = (+v).toFixed(+e.target.dataset.casas) + e.target.dataset.uni;
        if (SK.bus[f.id]) skBus(f); SK.sujo = true;
    };
    el.onchange = e => { if (e.target.dataset.fx) { if (e.target.tagName === 'SELECT') el.oninput(e); skAntes(); skMudou('efeito da faixa'); } };
    el.onclick = e => { const p = e.target.dataset.preset; if (p) { skAntes(); f.fx = skFxCompleto(SK_PRESETS_FX[p]); if (SK.bus[f.id]) skBus(f); skMudou('preset'); }
        const ig = e.target.dataset.igualarFaixa; if (ig) skIgualar(f.clipes.map(c => c.id), -16).then(n => skToast(`${n} clipe(s) igualado(s)`));
        const dk = e.target.dataset.duck;
        if (dk === '1') skDucking(f.id, { db: +el.querySelector('#sk-duck-db').value }).then(n => skToast(`${n} trecho(s) de fala: trilha abaixada`)).catch(er => skToast(er.message));
        if (dk === '0') { skAntes(); for (const c of f.clipes) delete c.curva; skMudou('tirar ducking'); } };
}
function skUiMaster() {
    const ms = SK.proj.master || {}, lim = ms.lim || {};
    return `<div class="sk-grupo sk-master"><div class="sk-p-tit">Master (tudo que sai)</div>
        <label class="sk-p-l">Volume<input type="range" min="0" max="2" step="0.01" value="${ms.vol ?? 1}" data-m="vol"><small>${skDb(ms.vol ?? 1)} dB</small></label>
        <label class="sk-chk"><input type="checkbox" data-m="lim.ativo" ${lim.ativo ? 'checked' : ''}> Limitador (nada passa do teto)</label>
        <label class="sk-p-l">Teto<input type="range" min="-6" max="0" step="0.1" value="${lim.teto ?? -1}" data-m="lim.teto"><small>${(lim.teto ?? -1).toFixed(1)} dB</small></label></div>`;
}
document.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.m; if (!k || !SK.proj || !e.target.closest('#sk')) return;
    const ms = SK.proj.master = SK.proj.master || { vol: 1, lim: { ativo: false, teto: -1 } }; ms.lim = ms.lim || {};
    const v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    if (k === 'vol') ms.vol = v; else ms.lim[k.split('.')[1]] = v;
    const s = e.target.nextElementSibling; if (s && e.target.type === 'range') s.textContent = k === 'vol' ? skDb(v) + ' dB' : v.toFixed(1) + ' dB';
    skMasterAplicar(); SK.sujo = true;
});
function skUiTexto(el) {
    const P = SK.texto && SK.texto.palavras;
    el.onclick = el.oninput = el.onchange = null;
    el.innerHTML = `<div class="sk-p-acoes"><select id="sk-idioma"><option value="pt">Português</option><option value="multi">Outros idiomas</option></select>
        <button class="ie-btn ie-btn-mini" id="sk-transc" ${SK.tarefa ? 'disabled' : ''}>${P ? 'Transcrever de novo' : 'Transcrever'}</button></div>
        ${P ? `<div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" data-leg="srt">Salvar SRT</button><button class="ie-btn ie-btn-mini" data-leg="txt">Salvar TXT</button><button class="ie-btn ie-btn-mini" data-leg="vtt">VTT</button></div>
        <div class="sk-texto notranslate">${P.map(([a, , w], i) => `<span data-t="${a}" data-i="${i}">${skEsc(w)}</span>`).join(' ')}</div>
        <div class="sk-p-info">Clique numa palavra para levar a agulha até ela.</div>` : '<div class="sk-p-info">Transcreve a mixagem (faixas mudas ficam de fora). A primeira vez baixa o modelo de fala.</div>'}`;
    el.querySelector('#sk-transc').onclick = () => skTranscrever(el.querySelector('#sk-idioma').value).catch(e => skToast(e.message));
    el.querySelectorAll('[data-leg]').forEach(b => b.onclick = () => skApi().ve_salvar_legenda(skLinhas(P), b.dataset.leg, SK.proj.nome || 'audio'));
    el.querySelector('.sk-texto')?.addEventListener('click', e => { const s = e.target.closest('[data-t]'); if (s) skIr(+s.dataset.t); });
}
function skUiExportar(el) {
    el.onclick = el.oninput = el.onchange = null;
    const op = SK.expOp || (SK.expOp = { f: 'mp3', k: '192', l: '', fx: '' });
    const sel = (id, opcoes, v) => `<select id="${id}">${opcoes.map(([a, b]) => `<option value="${a}"${String(a) === String(v) ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
    el.innerHTML = `<div class="sk-p-nome notranslate">${skEsc(SK.proj.nome)}</div><div class="sk-p-info">${SK.proj.faixas.length} faixa(s) · ${skTempo(skFim())}</div>
        <div class="sk-grupo sk-exp">
        <label>Formato ${sel('ske-f', ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'opus'].map(f => [f, f]), op.f)}</label>
        <label>Qualidade ${sel('ske-k', [['320', '320 kbps'], ['192', '192 kbps'], ['128', '128 kbps']], op.k)}</label>
        <label>Volume final ${sel('ske-l', [['', 'Como está'], ['-14', '-14 LUFS (redes, streaming)'], ['-16', '-16 LUFS (podcast)'], ['-23', '-23 LUFS (TV)']], op.l)}</label>
        <label>Faixas ${sel('ske-fx', [['', 'Mixagem de todas'], ...SK.proj.faixas.map(f => [f.id, `Só "${skEsc(f.nome)}"`])], op.fx)}</label></div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-primario" id="ske-ok">Exportar…</button><button class="ie-btn ie-btn-mini" onclick="skEnviarEditor().catch(e => skToast(e.message))">→ Editor de vídeo</button></div>
        ${skUiMaster()}
        <div class="sk-grupo"><div class="sk-p-tit">Medir</div><div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="skMedirLufs()">Medir volume da mixagem (LUFS)</button></div><div class="sk-p-info" id="sk-lufs"></div></div>`;
    el.onchange = () => { const g = s => el.querySelector(s).value; SK.expOp = { f: g('#ske-f'), k: g('#ske-k'), l: g('#ske-l'), fx: g('#ske-fx') }; };
    el.querySelector('#ske-ok').onclick = async () => {
        const o = SK.expOp;
        const c = await skApi().sk_dialogo('salvar', [`Áudio (*.${o.f})`], `${SK.proj.nome || 'audio'}.${o.f}`);
        if (!c) return;
        skEl('sk-status-info').textContent = 'Exportando…';
        const r = await SKN.exportar(c, { formato: o.f, kbps: +o.k, lufs: o.l === '' ? null : +o.l, faixas: o.fx ? [o.fx] : null }).catch(e => ({ success: false, error: e.message }));
        skEl('sk-status-info').textContent = '';
        skToast(r.success ? `Exportado: ${r.caminho.split(/[\\/]/).pop()}` : r.error);
    };
}
function skExportarDialogo() { if (SK.proj) skAba('dir', 'exportar'); }
async function skMedirLufs() { const el = skEl('sk-lufs'); if (!el) return; el.textContent = 'Medindo...'; const r = await skApi().sk_medir(SK.proj); el.textContent = r.success ? `${r.lufs.toFixed(1)} LUFS · pico ${r.pico.toFixed(1)} dBTP` : r.error; }
async function skImportarDialogo() {
    const r = await skApi().sk_dialogo('abrir_varios', ['Áudio e vídeo (*.mp3;*.wav;*.m4a;*.aac;*.ogg;*.opus;*.flac;*.wma;*.aiff;*.mp4;*.mov;*.mkv;*.webm)', 'Todos (*.*)']);
    if (r && r.length) await skImportar(r);
}

// ── monitor: medidores por faixa + master L/R, luz de clipe, LUFS ──
function skUiMonitor() {
    const cv = skEl('sk-medidor'); if (!cv) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#120f0d'; x.fillRect(0, 0, W, H);
    const m = SK.tocando ? SK.med : null, faixas = SK.proj?.faixas || [];
    const topo = 8, base = H - 20, alt = base - topo, Y = db => topo + alt * Math.min(1, Math.max(0, -db / 60));
    // escala
    x.font = '9.5px system-ui'; x.fillStyle = '#6f625a'; x.strokeStyle = '#231d19'; x.lineWidth = 1;
    for (const db of [0, -6, -12, -18, -24, -36, -48]) { const y = Math.round(Y(db)) + 0.5; x.beginPath(); x.moveTo(26, y); x.lineTo(W - 4, y); x.stroke(); x.fillText(db, 4, y + 3); }
    const barra = (bx, bw, niv, cor, rot) => {
        x.fillStyle = '#1e1814'; x.fillRect(bx, topo, bw, alt);
        if (niv) {
            const yr = Y(niv.rms), yp = Y(niv.pico);
            x.fillStyle = cor + '99'; x.fillRect(bx, yp, bw, base - yp);
            x.fillStyle = cor; x.fillRect(bx, yr, bw, base - yr);
            if (niv.pico > -0.1) { x.fillStyle = '#ff3b30'; x.fillRect(bx, topo - 6, bw, 4); }
        }
        x.fillStyle = '#a89a8f'; x.font = '10px system-ui'; x.textAlign = 'center'; x.fillText(rot.slice(0, Math.max(2, Math.floor(bw / 6))), bx + bw / 2, H - 6); x.textAlign = 'left';
    };
    const mw = 18, mx = W - 2 * mw - 14, n = Math.max(1, faixas.length), bw = Math.max(8, Math.min(56, (mx - 40 - n * 6) / n));
    faixas.forEach((f, i) => barra(36 + i * (bw + 6), bw, m && m.faixas[f.id], f.cor, f.nome));
    barra(mx, mw, m && m.L, '#f1e6dc', 'L'); barra(mx + mw + 4, mw, m && m.R, '#f1e6dc', 'R');
    if (SK.mt.clipe && performance.now() - SK.mt.clipe < 2000) { x.fillStyle = '#ff3b30'; x.fillRect(mx, 0, 2 * mw + 4, 5); }
    const lo = skEl('sk-loud'), f1 = v => v == null || v < -100 ? '–' : v.toFixed(1);
    if (lo) lo.innerHTML = `<span><b>${f1(m && m.M)}</b> LUFS agora</span><span><b>${f1(SK.mt.blocos.length ? (SK.med && SK.med.I) : null)}</b> LUFS integrado</span><span>pico <b class="${SK.mt.picoMax > -0.1 ? 'sk-ruim' : ''}">${f1(SK.mt.picoMax)}</b> dB</span>`;
}

// ── estado geral ──
function skUiTempo() { const t = skEl('sk-tempo'); if (t) t.textContent = skTempo(SK.ph); }
function skUiFaixas() {
    const el = skEl('sk-faixas'); if (!el) return;
    if (!SK.proj) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="sk-f-topo" style="height:${SK_REGUA}px"></div><div class="sk-f-lista" style="transform:translateY(${-SK.y0}px)">${SK.proj.faixas.map(f => `
        <div class="sk-f${f.id === SK.faixaSel ? ' sel' : ''}" data-f="${f.id}" style="height:${SK_H}px;--cor:${f.cor}">
            <input class="sk-f-nome" value="${skEsc(f.nome)}" data-nome="${f.id}">
            <div class="sk-f-bts"><button class="${f.mudo ? 'on' : ''}" data-mudo="${f.id}" title="Mudo">M</button><button class="${f.solo ? 'on' : ''}" data-solo="${f.id}" title="Solo">S</button><button data-apaga="${f.id}" title="Apagar faixa">×</button></div>
            <label class="sk-f-vol" title="Volume da faixa"><input type="range" min="0" max="2" step="0.01" value="${f.vol}" data-vol="${f.id}"><span>${skDb(f.vol)} dB</span></label>
        </div>`).join('')}</div>`;
}
function skUi() {
    const ini = skEl('sk-inicio'); if (!ini) return;
    ini.hidden = !!SK.proj;
    const play = skEl('sk-play'); if (play) { play.textContent = SK.tocando ? '■' : '▶'; play.classList.toggle('on', SK.tocando); }
    skEl('sk-rec')?.classList.toggle('on', !!SK.grav);
    skEl('sk-curva-bt')?.classList.toggle('on', !!SK.verCurva);
    if (!SK.proj && !ini.dataset.recup) { ini.dataset.recup = '1'; skUiRecuperar().finally(() => { delete ini.dataset.recup; }); }
    skEl('sk-info').textContent = SK.proj ? `${SK.proj.nome}${SK.sujo ? ' •' : ''}` : '';
    skUiTempo(); skUiFaixas(); skUiProps();
    if (SK.abaEsq === 'midia') skUiEsq();
    let l = []; try { l = JSON.parse(localStorage.getItem('sk-recentes') || '[]'); } catch (e) { /* sem storage */ }
    const rc = skEl('sk-recentes'); if (rc) rc.innerHTML = l.length ? `<div class="ie-recentes-tit">Recentes</div>${l.map(c => `<button class="ie-recente notranslate" onclick="skAbrir(${skEsc(JSON.stringify(c))}).catch(e => skToast(e.message))">${skEsc(c.split(/[\\/]/).pop())}</button>`).join('')}` : '';
}
(function () {   // eventos delegados das faixas e do clipe; montar ao abrir a página
    document.addEventListener('input', e => {
        const t = e.target; if (!t.closest('#sk')) return;
        if (t.dataset.vol) { const f = SK.proj.faixas.find(x => x.id === t.dataset.vol); skAntes(); f.vol = +t.value; t.nextElementSibling.textContent = skDb(f.vol) + ' dB'; SK.sujo = true; }
        if (t.dataset.p && SK.sel) { const [c] = skClipe(SK.sel); skAntes(); c[t.dataset.p] = Math.max(0, +t.value); if (t.dataset.p === 'vol') t.nextElementSibling.textContent = skDb(c.vol) + ' dB'; skDesenhar(); }
    });
    document.addEventListener('change', e => {
        const t = e.target; if (!t.closest('#sk')) return;
        if (t.dataset.nome) { const f = SK.proj.faixas.find(x => x.id === t.dataset.nome); skAntes(); f.nome = t.value; skMudou('nome'); }
        if (t.dataset.vol || (t.dataset.p && SK.sel)) skMudou('valor');
    });
    document.addEventListener('click', e => {
        const b = e.target.closest('#sk [data-mudo], #sk [data-solo], #sk [data-apaga], #sk .sk-f');
        if (!b || !SK.proj) return;
        if (b.dataset.mudo || b.dataset.solo) { const id = b.dataset.mudo || b.dataset.solo, k = b.dataset.mudo ? 'mudo' : 'solo', f = SK.proj.faixas.find(x => x.id === id); skAntes(); f[k] = !f[k]; skMudou(k); return; }
        if (b.dataset.apaga) { const f = SK.proj.faixas.find(x => x.id === b.dataset.apaga); if (f.clipes.length && !confirm(`Apagar a faixa "${f.nome}" e os clipes dela?`)) return; skAntes(); SK.proj.faixas.splice(SK.proj.faixas.indexOf(f), 1); skMudou('apagar faixa'); return; }
        if (b.dataset.f && !e.target.closest('input')) { SK.faixaSel = b.dataset.f; SK.sel = null; skUiFaixas(); skUiProps(); skDesenhar(); }
    });
    const pg = () => skEl('page-sound-kanivete');
    const ver = () => { if (pg()?.classList.contains('active')) { skMontar(); skDesenhar(); skUiMonitor(); if (SK.abaEsq === 'gravar') skUiEsq(); } else { if (SK.tocando || SK.grav) skParar(); skMonitorarEntrada(false); } };
    document.addEventListener('DOMContentLoaded', () => { const p = pg(); if (p) new MutationObserver(ver).observe(p, { attributes: true, attributeFilter: ['class'] }); ver(); });
})();
