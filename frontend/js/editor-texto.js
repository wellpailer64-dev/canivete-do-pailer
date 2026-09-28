// =========================================================
// Pocket Editor — painel Texto: Transcrever e Criar legendas (como no Premiere)
// Transcrição: Functions/legendas.py (Parakeet via onnx-asr, local) sobre a MESMA mixagem da exportação;
// devolve palavras [início, fim, texto] em segundos da timeline (VETX.palavras).
// Legendas: VE.legendas = [{st, en, texto}] (entram no desfazer), estilo em VE.legEstilo; aparecem numa trilha
// própria no alto da timeline (linha "LEG"), no monitor (veTxDesenhar) e, ao exportar, gravadas no vídeo com o
// mesmo estilo (_gerar_ass em video_cutter.py) ou num .srt.
// =========================================================

const VE_LEG_PADRAO = { max: 42, linhas: 2, minDur: 3, gap: 0 };                 // "Criar legendas" do Premiere
const VE_LEG_ESTILO = { fonte: 'Arial', tam: 5.5, cor: '#ffffff', fundo: 'caixa', pos: 'baixo', maiusc: false, negrito: true, ita: false };

const VETX = {
    palavras: [], idioma: 'pt', chave: '', rodando: false, aba: 'trans', legSel: -1, ativa: -1,
    busca: '', achados: [], achado: -1, opcoes: { ...VE_LEG_PADRAO }, modelos: null, construido: false,
};

function veTxEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function veTxTempo(t) { return veTC(t).slice(0, 8); }

// ─────────────────────────── transcrição ───────────────────────────
function veTxMixChave() { return JSON.stringify(veMixClipes()); }

function veTxTranscrever() {
    if (!VE.ready || VETX.rodando) return;
    const cl = veExportPlan().mix;
    if (!cl.length) { veToast('Não há som na timeline para transcrever'); return; }
    VETX.idioma = $ve('ve-tx-idioma').value;
    VETX.rodando = true;
    VETX.chaveAlvo = veTxMixChave();
    veTxProgresso(0, 'Começando...');
    veTxRender();
    window.pywebview.api.ve_transcrever(cl, VE.dur, VETX.idioma);
}

function veTxCancelar() { window.pywebview.api.ve_transcrever_cancelar(); }

function veTxProgresso(p, msg) {
    const f = $ve('ve-tx-prog-fill'), m = $ve('ve-tx-prog-msg');
    if (f) f.style.width = p + '%';
    if (m) m.textContent = msg ? `${msg} ${p ? p + '%' : ''}` : '';
}

// Eventos do Python (legendas.transcrever)
function veOnTexto(ev) {
    if (ev.stage === 'prog') { veTxProgresso(ev.pct, ev.msg); return; }
    VETX.rodando = false;
    if (ev.success) {
        VETX.palavras = ev.palavras || [];
        VETX.chave = VETX.chaveAlvo;
        VETX.construidoTexto = false;
        veMarcarAlterado();
        veToast(VETX.palavras.length ? `Transcrição pronta: ${VETX.palavras.length} palavras em ${ev.segundos} s` : 'Nenhuma fala encontrada na timeline');
    } else if (!ev.cancelled) {
        veToast('Não foi possível transcrever: ' + (ev.error || 'erro'));
    }
    veTxRender();
}

function veMarcarAlterado() { if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); } }

// Parágrafos: quebra em pausas longas ou em fim de frase depois de um trecho grande
function veTxParagrafos() {
    const P = [], W = VETX.palavras;
    let cur = null;
    W.forEach((w, i) => {
        const pausa = i ? w[0] - W[i - 1][1] : 0;
        const fimFrase = i && /[.!?…]["')\]]?$/.test(W[i - 1][2]);
        if (!cur || pausa > 1.5 || (fimFrase && cur.n >= 45)) { cur = { i0: i, n: 0 }; P.push(cur); }
        cur.n++;
        cur.i1 = i;
    });
    return P;
}

// Palavra na agulha (busca binária)
function veTxPalavraEm(t) {
    const W = VETX.palavras;
    let lo = 0, hi = W.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (W[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r >= 0 && t <= W[r][1] + 0.35 ? r : -1;
}

// Chamado a cada atualização da agulha: destaca a palavra falada e mantém à vista
function veTxSeguir() {
    if (!VETX.palavras.length || !vedVisible('texto')) return;
    const i = veTxPalavraEm(VE.playhead);
    if (i === VETX.ativa) return;
    const box = $ve('ve-tx-texto');
    if (!box) return;
    const velho = box.querySelector('.ve-tx-w.falando');
    if (velho) velho.classList.remove('falando');
    VETX.ativa = i;
    const el = i >= 0 ? box.querySelector(`[data-w="${i}"]`) : null;
    if (el) {
        el.classList.add('falando');
        if (VE.playing) {
            const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
            if (r.top < b.top + 20 || r.bottom > b.bottom - 20) el.scrollIntoView({ block: 'center' });
        }
    }
}

function veTxBuscar(q) {
    VETX.busca = q.trim().toLowerCase();
    const box = $ve('ve-tx-texto');
    box.querySelectorAll('.ve-tx-w.achado').forEach(e => e.classList.remove('achado'));
    VETX.achados = [];
    VETX.achado = -1;
    if (VETX.busca) {
        const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, '');
        const alvo = norm(VETX.busca).split(/\s+/).filter(Boolean);
        const W = VETX.palavras.map(w => norm(w[2]));
        for (let i = 0; i + alvo.length <= W.length; i++) {
            if (alvo.every((a, k) => W[i + k].startsWith(a) && (k === alvo.length - 1 || W[i + k] === a))) {
                VETX.achados.push(i);
                for (let k = 0; k < alvo.length; k++) box.querySelector(`[data-w="${i + k}"]`)?.classList.add('achado');
            }
        }
    }
    $ve('ve-tx-busca-n').textContent = VETX.busca ? `${VETX.achados.length}` : '';
}

function veTxProximoAchado(dir) {
    if (!VETX.achados.length) return;
    VETX.achado = (VETX.achado + dir + VETX.achados.length) % VETX.achados.length;
    const i = VETX.achados[VETX.achado];
    veSeek(VETX.palavras[i][0]);
    $ve('ve-tx-texto').querySelector(`[data-w="${i}"]`)?.scrollIntoView({ block: 'center' });
}

// ─────────────────────────── legendas ───────────────────────────
// Agrupa as palavras em legendas como o "Criar legendas" do Premiere: até `max` caracteres por linha,
// 1 ou 2 linhas, quebra em pausas e fins de frase; duração mínima e intervalo entre legendas (quadros).
function veTxMontarLegendas(o) {
    const cap = o.max * o.linhas, caps = [];
    const tam = ws => ws.map(w => w[2]).join(' ').length;
    const fim = txt => /[.!?…]["')\]]?$/.test(txt), virgula = txt => /[,;:]["')\]]?$/.test(txt);
    let cur = [];
    const fechar = ws => { if (ws.length) caps.push({ st: ws[0][0], en: ws[ws.length - 1][1], palavras: ws.map(w => w[2]) }); };
    for (const w of VETX.palavras) {
        if (cur.length && w[0] - cur[cur.length - 1][1] > 1.2) { fechar(cur); cur = []; }   // pausa longa
        cur.push(w);
        if (tam(cur) > cap) {
            // estourou: corta no fim de frase mais tardio cujo resto caiba inteiro na próxima legenda (mesmo que
            // esta fique curta); senão numa vírgula com a legenda pelo menos meio cheia; senão antes desta palavra
            const cabeResto = j => tam(cur.slice(j + 1)) <= cap;
            let k = -1;
            for (let j = cur.length - 2; j >= 0 && k < 0; j--) if (fim(cur[j][2]) && cabeResto(j)) k = j;
            for (let j = cur.length - 2; j >= 0 && k < 0; j--) if (virgula(cur[j][2]) && cabeResto(j) && tam(cur.slice(0, j + 1)) >= cap * 0.5) k = j;
            if (k < 0) k = cur.length - 2;
            fechar(cur.slice(0, k + 1));
            cur = cur.slice(k + 1);
        } else if (fim(w[2]) && tam(cur) >= cap * 0.7) { fechar(cur); cur = []; }         // fim de frase com a legenda cheia
    }
    fechar(cur);
    // quebra de linha equilibrada (duas linhas de tamanhos parecidos, cada uma com até `max`)
    const quebrar = ps => {
        const txt = ps.join(' ');
        if (o.linhas < 2 || txt.length <= o.max) return txt;
        let melhor = null;
        for (let k = 1; k < ps.length; k++) {
            const a = ps.slice(0, k).join(' '), b = ps.slice(k).join(' ');
            if (a.length > o.max || b.length > o.max) continue;
            const d = Math.abs(a.length - b.length);
            if (!melhor || d < melhor.d) melhor = { d, t: a + '\n' + b };
        }
        return melhor ? melhor.t : txt;
    };
    const gap = (o.gap || 0) / (VE.fps || 30);
    return caps.map((c, i) => {
        const prox = caps[i + 1];
        const limite = prox ? prox.st - gap : Infinity;
        const en = Math.min(Math.max(c.en, c.st + o.minDur), limite);
        return { st: +c.st.toFixed(3), en: +Math.max(c.st + 0.3, en).toFixed(3), texto: quebrar(c.palavras) };
    });
}

function veTxCriarLegendas() {
    if (!VETX.palavras.length) { veToast('Transcreva a sequência primeiro'); return; }
    const o = {
        max: Math.max(7, Math.min(72, +$ve('ve-leg-max').value || 42)),
        linhas: +$ve('ve-leg-linhas').value || 2,
        minDur: Math.max(0.5, Math.min(6, +String($ve('ve-leg-min').value).replace(',', '.') || 3)),
        gap: Math.max(0, Math.min(10, +$ve('ve-leg-gap').value || 0)),
    };
    VETX.opcoes = o;
    vePushHistory();
    VE.legendas = veTxMontarLegendas(o);
    VETX.legSel = -1;
    veToast(`${VE.legendas.length} legendas criadas`);
    veRefresh();
}

function veTxEstilo() { return Object.assign({}, VE_LEG_ESTILO, VE.legEstilo || {}); }

function veTxLegendaEm(t) {
    const L = VE.legendas || [];
    for (let i = 0; i < L.length; i++) if (t >= L[i].st && t < L[i].en) return i;
    return -1;
}

// Altura da linha e topo das letras da fonte (em "em"): o libass usa o Fontsize do .ass como a altura da linha
// (ascendente + descendente), então a prévia mede a fonte escolhida e a exportação recebe a proporção
const VE_LEG_MET = new Map();
function veTxMetricas(e) {
    const k = e.fonte + '|' + !!e.negrito + '|' + !!e.ita;
    if (!VE_LEG_MET.has(k)) {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${e.ita ? 'italic ' : ''}${e.negrito ? 'bold ' : ''}100px "${e.fonte}", Arial`;
        const m = ctx.measureText('Hg');
        const asc = (m.fontBoundingBoxAscent || 90.5) / 100, desc = (m.fontBoundingBoxDescent || 21.2) / 100;
        VE_LEG_MET.set(k, { asc, razao: asc + desc });
    }
    return VE_LEG_MET.get(k);
}

// Desenha a legenda da agulha no monitor (coordenadas do quadro; mesma conta do .ass da exportação)
function veTxDesenhar(ctx) {
    const i = veTxLegendaEm(VE.playhead);
    if (i < 0) return;
    const e = veTxEstilo(), H = VE.seqH, W = VE.seqW, met = veTxMetricas(e);
    const em = Math.max(8, e.tam / 100 * H), alt = em * met.razao, folga = em * 0.22, margem = Math.round(0.06 * H);
    let linhas = String(VE.legendas[i].texto || '').split('\n').filter(l => l.trim());
    if (e.maiusc) linhas = linhas.map(l => l.toUpperCase());
    if (!linhas.length) return;
    ctx.save();
    ctx.font = `${e.ita ? 'italic ' : ''}${e.negrito ? 'bold ' : ''}${em}px "${e.fonte}", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const bloco = linhas.length * alt;
    let topo = e.pos === 'cima' ? margem : e.pos === 'meio' ? (H - bloco) / 2 : H - margem - bloco;
    linhas.forEach((l, k) => {
        const y = topo + k * alt, base = y + em * met.asc;
        const w = ctx.measureText(l).width;
        if (e.fundo === 'caixa') {
            ctx.fillStyle = 'rgba(0,0,0,0.64)';
            ctx.fillRect(W / 2 - w / 2 - folga, y - folga, w + folga * 2, alt + folga * 2);
        } else if (e.fundo === 'sombra') {
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillText(l, W / 2 + em * 0.07, base + em * 0.07);
            ctx.lineWidth = em * 0.12;
            ctx.strokeStyle = '#000';
            ctx.strokeText(l, W / 2, base);
        }
        ctx.fillStyle = e.cor;
        ctx.fillText(l, W / 2, base);
    });
    ctx.restore();
}

function veTxSrt() {
    const f = t => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
    return (VE.legendas || []).map((c, i) => `${i + 1}\n${f(c.st)} --> ${f(c.en)}\n${c.texto.trim()}\n`).join('\n');
}

function veTxSalvarSrt() {
    if (!(VE.legendas || []).length) { veToast('Crie as legendas primeiro'); return; }
    const base = (VE.path || 'legendas').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    const pasta = (VE.path || '').replace(/[\\/][^\\/]*$/, '');
    window.pywebview.api.ve_salvar_srt(veTxSrt(), base + '.srt', pasta).then(r => {
        if (r && r.success) veToast('Legendas salvas: ' + r.name);
        else if (r && r.error) veToast('Não foi possível salvar: ' + r.error);
    });
}

// Para a exportação: legendas gravadas no vídeo (se ligado)
// faixa {a, b}: exportando só o trecho In→Out, as legendas vão recortadas e trazidas para o zero
function veTxExport(faixa) {
    if (VE.legGravar === false || !(VE.legendas || []).length) return null;
    const e = veTxEstilo();
    const itens = !faixa ? VE.legendas : VE.legendas.filter(l => l.st < faixa.b && l.en > faixa.a)
        .map(l => ({ ...l, st: Math.max(l.st, faixa.a) - faixa.a, en: Math.min(l.en, faixa.b) - faixa.a }));
    return itens.length ? { itens, estilo: { ...e, razao: veTxMetricas(e).razao } } : null;
}

// ─────────────────────────── painel ───────────────────────────
function veTxConstruir() {
    const box = $ve('ve-tx');
    if (!box) return;
    box.innerHTML = `
        <div class="ve-tx-abas">
            <button data-txa="trans">Transcrição</button><button data-txa="leg">Legendas</button>
        </div>
        <div class="ve-tx-corpo" data-txc="trans">
            <div class="ve-tx-vazio" id="ve-tx-vazio">
                <b>Transcrever sequência</b>
                <p>Transforma a fala da timeline em texto, com o tempo de cada palavra. Roda neste computador, sem internet (depois do primeiro uso).</p>
                <label class="ve-tx-campo">Idioma da fala
                    <select id="ve-tx-idioma">
                        <option value="pt">Português (Brasil)</option>
                        <option value="en">Inglês</option>
                        <option value="multi">Outras línguas europeias</option>
                    </select>
                </label>
                <button class="ve-btn ve-btn-primary" data-txacao="transcrever">Transcrever</button>
                <small id="ve-tx-modelo"></small>
            </div>
            <div class="ve-tx-rodando" id="ve-tx-rodando" hidden>
                <div class="ve-tx-prog"><i id="ve-tx-prog-fill"></i></div>
                <span id="ve-tx-prog-msg"></span>
                <button class="ve-btn ve-btn-sm ve-btn-ghost" data-txacao="cancelar">Cancelar</button>
            </div>
            <div class="ve-tx-pronto" id="ve-tx-pronto" hidden>
                <div class="ve-tx-barra">
                    <div class="ve-tx-busca"><svg class="i"><use href="#i-search"/></svg><input id="ve-tx-busca" placeholder="Buscar na transcrição" autocomplete="off"><span id="ve-tx-busca-n"></span></div>
                    <button class="ve-btn ve-btn-sm ve-btn-ghost" data-txacao="refazer" title="Transcrever de novo">↻</button>
                </div>
                <div class="ve-tx-aviso" id="ve-tx-aviso" hidden>A timeline mudou depois da transcrição. <button data-txacao="refazer">Transcrever de novo</button></div>
                <div class="ve-tx-texto" id="ve-tx-texto"></div>
                <div class="ve-tx-dica">Clique numa palavra para ir até ela · duplo clique corrige a palavra</div>
            </div>
        </div>
        <div class="ve-tx-corpo" data-txc="leg" hidden>
            <div class="ve-tx-sec">
                <b>Criar legendas</b>
                <div class="ve-tx-grade">
                    <label>Máx. caracteres por linha<input type="number" id="ve-leg-max" min="7" max="72" step="1"></label>
                    <label>Linhas<select id="ve-leg-linhas"><option value="1">Uma</option><option value="2">Duas</option></select></label>
                    <label>Duração mínima (s)<input type="number" id="ve-leg-min" min="0.5" max="6" step="0.1"></label>
                    <label>Intervalo (quadros)<input type="number" id="ve-leg-gap" min="0" max="10" step="1"></label>
                </div>
                <button class="ve-btn ve-btn-primary" data-txacao="criar">Criar legendas a partir da transcrição</button>
            </div>
            <div class="ve-tx-sec">
                <b>Estilo</b>
                <p class="ve-tx-nota">Fonte, tamanho, cor, fundo e posição das legendas ficam no painel Propriedades (selecione uma legenda).</p>
                <button class="ve-btn ve-btn-sm" data-txacao="estilo">Editar estilo em Propriedades</button>
            </div>
            <div class="ve-tx-sec ve-tx-saida">
                <label class="ve-tx-chk"><input type="checkbox" id="ve-leg-gravar"> Gravar as legendas no vídeo ao exportar</label>
                <button class="ve-btn ve-btn-sm" data-txacao="srt">Salvar .srt</button>
            </div>
            <div class="ve-tx-lista" id="ve-leg-lista"></div>
        </div>`;
    VETX.construido = true;
}

function veTxRender() {
    const box = $ve('ve-tx');
    if (!box) return;
    if (!box.firstChild) veTxConstruir();
    box.querySelectorAll('[data-txa]').forEach(b => b.classList.toggle('on', b.dataset.txa === VETX.aba));
    box.querySelectorAll('[data-txc]').forEach(c => { c.hidden = c.dataset.txc !== VETX.aba; });
    const tem = VETX.palavras.length > 0;
    $ve('ve-tx-vazio').hidden = VETX.rodando || tem;
    $ve('ve-tx-rodando').hidden = !VETX.rodando;
    $ve('ve-tx-pronto').hidden = VETX.rodando || !tem;
    $ve('ve-tx-idioma').value = VETX.idioma;
    if (VETX.modelos) {
        const k = VETX.idioma === 'pt' ? 'pt' : 'multi', m = VETX.modelos[k];
        $ve('ve-tx-modelo').textContent = m && !m.pronto ? `Na primeira vez baixa o modelo de ${m.nome} (${m.baixar_mb >= 1000 ? (m.baixar_mb / 1024).toFixed(1).replace('.', ',') + ' GB' : m.baixar_mb + ' MB'}; fica com ${m.mb} MB).` : '';
    }
    if (tem && !VETX.construidoTexto) veTxRenderTexto();
    $ve('ve-tx-aviso').hidden = !tem || VETX.rodando || !VE.ready || VETX.chave === veTxMixChave();
    veTxRenderLeg();
}

function veTxRenderTexto() {
    const W = VETX.palavras;
    $ve('ve-tx-texto').innerHTML = veTxParagrafos().map(p => `
        <p><span class="ve-tx-tc" data-ir="${p.i0}">${veTxTempo(W[p.i0][0])}</span>${
            W.slice(p.i0, p.i1 + 1).map((w, k) => `<span class="ve-tx-w" data-w="${p.i0 + k}">${veTxEsc(w[2])}</span>`).join(' ')}</p>`).join('');
    VETX.construidoTexto = true;
    VETX.ativa = -1;
    if (VETX.busca) veTxBuscar(VETX.busca);
}

function veTxRenderLeg() {
    if (!$ve('ve-leg-lista')) return;
    const o = VETX.opcoes, e = veTxEstilo();
    const set = (id, v) => { const el = $ve(id); if (el && el.ownerDocument.activeElement !== el) el.value = v; };
    set('ve-leg-max', o.max); set('ve-leg-linhas', o.linhas); set('ve-leg-min', o.minDur); set('ve-leg-gap', o.gap);
    $ve('ve-tx').querySelectorAll('[data-est]').forEach(el => {
        const k = el.dataset.est;
        if (el.type === 'checkbox') el.checked = !!e[k]; else if (el.ownerDocument.activeElement !== el) el.value = e[k];
    });
    $ve('ve-leg-gravar').checked = VE.legGravar !== false;
    const L = VE.legendas || [], lista = $ve('ve-leg-lista');
    const chave = JSON.stringify(L) + VETX.legSel;
    if (lista._chave === chave) return;
    lista._chave = chave;
    lista.innerHTML = !L.length ? `<div class="ve-clips-empty">${VETX.palavras.length ? 'Clique em "Criar legendas" para gerar a partir da transcrição.' : 'Primeiro transcreva a sequência na aba Transcrição.'}</div>`
        : L.map((c, i) => `
        <div class="ve-leg${i === VETX.legSel ? ' sel' : ''}" data-leg="${i}">
            <div class="ve-leg-cab"><button data-legacao="ir" title="Ir para a legenda">${veTxTempo(c.st)} → ${veTxTempo(c.en)}</button><button data-legacao="del" title="Apagar legenda">✕</button></div>
            <textarea rows="${Math.min(3, c.texto.split('\n').length)}" data-legtxt="${i}">${veTxEsc(c.texto)}</textarea>
        </div>`).join('');
}

function veTxInit() {
    const box = $ve('ve-tx');
    if (!box) return;
    veTxConstruir();
    box.addEventListener('click', e => {
        const aba = e.target.closest('[data-txa]');
        if (aba) { VETX.aba = aba.dataset.txa; veTxRender(); return; }
        const ac = e.target.closest('[data-txacao]');
        if (ac) {
            const a = ac.dataset.txacao;
            if (a === 'transcrever' || a === 'refazer') veTxTranscrever();
            else if (a === 'cancelar') veTxCancelar();
            else if (a === 'criar') { if (!(VE.legendas || []).length || veConfirmarTroca()) veTxCriarLegendas(); }
            else if (a === 'srt') veTxSalvarSrt();
            else if (a === 'estilo') {
                if (!(VE.legendas || []).length) { veToast('Crie as legendas primeiro'); return; }
                if (VETX.legSel < 0) VETX.legSel = Math.max(0, veTxLegendaEm(VE.playhead));
                VE.sel = -1;
                vedShow('pp');
                veRefresh();
            }
            return;
        }
        const w = e.target.closest('[data-w]'), ir = e.target.closest('[data-ir]');
        if ((w || ir) && e.detail < 2) { veSeek(VETX.palavras[+(w || ir).dataset[w ? 'w' : 'ir']][0]); return; }
        const lg = e.target.closest('[data-legacao]');
        if (lg) {
            const i = +lg.closest('[data-leg]').dataset.leg;
            if (lg.dataset.legacao === 'ir') { VETX.legSel = i; veSeek(VE.legendas[i].st); veRefresh(); }
            else { vePushHistory(); VE.legendas = VE.legendas.filter((_, k) => k !== i); VETX.legSel = -1; veRefresh(); }
        }
    });
    // duplo clique numa palavra: corrige (como editar a transcrição no Premiere)
    box.addEventListener('dblclick', e => {
        const w = e.target.closest('[data-w]');
        if (!w) return;
        w.contentEditable = 'true';
        w.focus();
        const sel = w.ownerDocument.getSelection(), r = w.ownerDocument.createRange();
        r.selectNodeContents(w); sel.removeAllRanges(); sel.addRange(r);
        const fim = () => {
            w.contentEditable = 'false';
            const txt = w.textContent.trim(), i = +w.dataset.w;
            if (txt && txt !== VETX.palavras[i][2]) { VETX.palavras[i][2] = txt; veMarcarAlterado(); }
            w.textContent = VETX.palavras[i][2];
        };
        w.addEventListener('blur', fim, { once: true });
    });
    box.addEventListener('keydown', e => {
        if (e.target.isContentEditable && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
        if (e.target.id === 've-tx-busca' && e.key === 'Enter') veTxProximoAchado(e.shiftKey ? -1 : 1);
        if (e.target.matches('input, textarea, select') || e.target.isContentEditable) e.stopPropagation();
    });
    box.addEventListener('input', e => {
        if (e.target.id === 've-tx-busca') { veTxBuscar(e.target.value); return; }
        const i = e.target.dataset.legtxt;
        if (i != null) {
            if (!VETX._editando) { vePushHistory(); VETX._editando = true; }
            VE.legendas[+i] = { ...VE.legendas[+i], texto: e.target.value };
            $ve('ve-leg-lista')._chave = JSON.stringify(VE.legendas) + VETX.legSel;   // não recria a lista enquanto digita
            veDrawMonitor(); veDraw();
            return;
        }
        const k = e.target.dataset.est;
        if (k) {
            VE.legEstilo = { ...veTxEstilo(), [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value };
            veMarcarAlterado();
            veDrawMonitorSoon();
        }
    });
    box.addEventListener('change', e => {
        VETX._editando = false;
        if (e.target.id === 've-leg-gravar') { VE.legGravar = e.target.checked; veMarcarAlterado(); }
        if (e.target.dataset.est) veTxRenderLeg();
        if (e.target.id === 've-tx-idioma') { VETX.idioma = e.target.value; veTxRender(); }
    });
    box.addEventListener('focusin', e => {
        const i = e.target.dataset && e.target.dataset.legtxt;
        if (i != null) { VETX.legSel = +i; veSeek(VE.legendas[+i].st); veDraw(); }
    });
    if (window.pywebview && window.pywebview.api && window.pywebview.api.ve_texto_modelos) {
        window.pywebview.api.ve_texto_modelos().then(m => { VETX.modelos = m; veTxRender(); });
    } else {
        window.addEventListener('pywebviewready', () => window.pywebview.api.ve_texto_modelos().then(m => { VETX.modelos = m; veTxRender(); }), { once: true });
    }
    veTxRender();
}

function veConfirmarTroca() {
    if (VETX._trocaAt && Date.now() - VETX._trocaAt < 5000) { VETX._trocaAt = 0; return true; }
    VETX._trocaAt = Date.now();
    veToast('Isso substitui as legendas atuais. Clique de novo para confirmar (dá para desfazer com Ctrl+Z).');
    return false;
}

// Abrir outro vídeo: começa sem transcrição
function veTxReset() {
    VETX.palavras = [];
    VETX.chave = '';
    VETX.legSel = -1;
    VETX.construidoTexto = false;
    VETX.busca = '';
    const b = $ve('ve-tx-busca');
    if (b) b.value = '';
    veTxRender();
}

document.addEventListener('DOMContentLoaded', veTxInit);
