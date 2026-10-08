// =========================================================
// Kanivete Encoder (Ke) — a janela do Exportar + fila (editor-fila.js) com identidade própria: logo Ke, janela solta
// (arrasta pelo cabeçalho, redimensiona pelo canto, sem escurecer o editor: dá para continuar editando com ela
// aberta), minimizar para uma barrinha com o progresso da fila (clique restaura), fechar sem parar a fila.
// Posição e tamanho lembrados (localStorage 've-ke-janela'). Plano do encoder: Instructions/agente/plano-kanivete-encoder.md.
// =========================================================
const VEKE = { min: false };
const veKeEl = () => $ve('ve-export');
const veKeBox = () => veKeEl() && veKeEl().querySelector('.ve-modal-box');
function veKeLer() { try { return JSON.parse(veLsGet('ve-ke-janela') || 'null'); } catch (e) { return null; } }
function veKeGravar() {
    const b = veKeBox(); if (!b || veKeEl().hidden) return;
    try { veLsSet('ve-ke-janela', JSON.stringify({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight })); } catch (e) { /* sem storage */ }
}
function veKePosicionar() {
    const el = veKeEl(), b = veKeBox(); if (!el || !b) return;
    const W = el.clientWidth, H = el.clientHeight, j = veKeLer();
    if (j && j.w) { b.style.width = Math.min(j.w, W - 16) + 'px'; b.style.height = Math.min(j.h, H - 16) + 'px'; }
    const w = b.offsetWidth, h = b.offsetHeight;
    const x = j ? j.x : (W - w) / 2, y = j ? j.y : Math.max(8, (H - h) / 2);
    b.style.left = Math.max(0, Math.min(W - Math.min(w, 120), x)) + 'px';
    b.style.top = Math.max(0, Math.min(H - 40, y)) + 'px';
}
function veKeMontar() {
    const el = veKeEl(); if (!el || el.dataset.ke) return;
    el.dataset.ke = '1';
    el.classList.add('ve-ke');
    const head = el.querySelector('.ve-modal-head');
    head.innerHTML = `<span class="ve-ke-tit"><span class="app-logo al-ke app-logo-marca">Ke</span> Kanivete Encoder</span>
        <span class="ve-ke-bts"><button class="ve-icon-btn" data-ke="min" title="Minimizar (a fila continua)">—</button>
        <button class="ve-icon-btn" data-ke="fechar" title="Fechar (a fila continua; o botão Fila reabre)"><svg class="i"><use href="#i-x"/></svg></button></span>`;
    head.querySelector('[data-ke="min"]').onclick = () => veKeMinimizar();
    head.querySelector('[data-ke="fechar"]').onclick = () => veCloseExport();
    // arrastar pelo cabeçalho
    head.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const b = veKeBox(), x0 = e.clientX, y0 = e.clientY, l0 = b.offsetLeft, t0 = b.offsetTop, W = el.clientWidth, H = el.clientHeight;
        head.setPointerCapture(e.pointerId); head.classList.add('arrastando');
        head.onpointermove = ev => {
            b.style.left = Math.max(-b.offsetWidth + 120, Math.min(W - 120, l0 + ev.clientX - x0)) + 'px';
            b.style.top = Math.max(0, Math.min(H - 40, t0 + ev.clientY - y0)) + 'px';
        };
        head.onpointerup = () => { head.onpointermove = null; head.classList.remove('arrastando'); veKeGravar(); };
    });
    head.addEventListener('dblclick', e => { if (!e.target.closest('button')) veKeMinimizar(); });
    // tamanho (canto de baixo à direita) lembrado
    let t = 0;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(veKeGravar, 300); }).observe(veKeBox());
    // barrinha minimizada
    const mini = document.createElement('button');
    mini.className = 've-ke-mini'; mini.id = 've-ke-mini'; mini.hidden = true; mini.title = 'Kanivete Encoder — clique para abrir';
    mini.innerHTML = '<span class="app-logo al-ke">Ke</span><span class="ve-ke-mini-txt" id="ve-ke-mini-txt">Kanivete Encoder</span><span class="ve-ke-mini-barra"><i id="ve-ke-mini-fill"></i></span>';
    mini.onclick = () => veKeRestaurar();
    $ve('ve').appendChild(mini);
}
function veKeMinimizar() { VEKE.min = true; veKeGravar(); veKeEl().hidden = true; veKeMini(); }
function veKeRestaurar() { VEKE.min = false; $ve('ve-ke-mini').hidden = true; veOpenExport(); }
function veKeMini() {   // barrinha: aparece minimizada; com a fila rodando mostra "2 de 5 · 43%"
    const m = $ve('ve-ke-mini'); if (!m) return;
    m.hidden = !VEKE.min;
    const it = VEFILA.atual, total = VEFILA.itens.filter(x => x.estado !== 'cancelado').length;
    const pos = it ? VEFILA.itens.filter(x => x.estado !== 'cancelado').indexOf(it) + 1 : 0;
    $ve('ve-ke-mini-txt').textContent = it ? `${it.cfg.nome} · ${pos} de ${total} · ${Math.round(it.pct)}%`
        : VEFILA.itens.some(x => x.estado === 'espera') ? `Fila: ${VEFILA.itens.filter(x => x.estado === 'espera').length} esperando` : 'Kanivete Encoder';
    $ve('ve-ke-mini-fill').style.width = (it ? it.pct : 0) + '%';
    m.classList.toggle('rodando', !!it);
}

(function () {
    const abrir = veOpenExport;
    veOpenExport = function () {
        abrir();
        if (veKeEl().hidden) return;
        veKeMontar();
        VEKE.min = false; $ve('ve-ke-mini').hidden = true;
        veKePosicionar();
    };
    const fechar = veCloseExport;
    veCloseExport = function () { veKeGravar(); VEKE.min = false; const m = $ve('ve-ke-mini'); if (m) m.hidden = true; return fechar(); };
    // a barrinha acompanha a fila
    const r = veFilaRender, ri = veFilaRenderItem;
    veFilaRender = function () { r(); veKeMini(); };
    veFilaRenderItem = function (it) { ri(it); veKeMini(); };
    window.addEventListener('resize', () => { if (veKeEl() && !veKeEl().hidden && veKeEl().dataset.ke) veKePosicionar(); });
})();
// ── Atalhos: Ctrl+M põe a timeline aberta na fila E abre a janela; Ctrl+Shift+M põe na fila sem abrir (aviso + som e a
// barrinha minimizada mostra o andamento). Os dois já começam a renderizar se a fila estava parada. ──
async function veKeFilaAtalho(abrir) {
    if (!VE.ready) return null;
    if (VE.exportRunning && !VEFILA.rodando) { veToast('Espere a exportação atual terminar'); return null; }
    if (veKeEl().hidden) {
        veOpenExport();                                   // monta o formulário (nome, resoluções) desta timeline
        if (!abrir && !veKeEl().hidden) { veKeGravar(); veKeEl().hidden = true; }   // na mesma tarefa: a janela não pisca
    }
    if (VEFILA.sel != null) veFilaSelecionar(null);       // as configurações livres, não as de um item
    if (!abrir) veToast(veT('Preparando para a fila') + '…');
    const id = await veFilaAdicionarAtual(veFilaNomeTimeline());
    if (!id) return null;
    veKeSom('fila');
    const it = VEFILA.itens.find(x => x.id === id), esp = VEFILA.itens.filter(x => x.estado === 'espera').length;
    veToast(`${veT('Na fila do Kanivete Encoder')}: ${it ? it.cfg.nome : ''}` + (VEFILA.rodando ? ` · ${esp} ${veT('esperando')}` : ''));
    if (!VEFILA.rodando) { if (VEFILA.preparando) VEFILA.iniciarDepois = true; else veFilaIniciar().catch(e => veToast(e.message)); }
    if (!abrir && veKeEl().hidden) { VEKE.min = true; veKeMini(); }
    return id;
}

// ── Sons: entrou na fila (dois toques curtos); o de render concluído é o do app (playConcluido) ──
let veKeAudio = null;
function veKeSom(tipo) {
    try {
        const ctx = veKeAudio || (veKeAudio = new (window.AudioContext || window.webkitAudioContext)());
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime + 0.01;
        const notas = tipo === 'fila' ? [[987.8, 0], [1318.5, 0.075]] : [[659.3, 0], [880, 0.09], [1318.5, 0.18]];
        for (const [f, d] of notas) {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t0 + d);
            g.gain.exponentialRampToValueAtTime(0.14, t0 + d + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
            o.connect(g).connect(ctx.destination);
            o.start(t0 + d); o.stop(t0 + d + 0.25);
        }
    } catch (e) { /* sem áudio: fica só o aviso */ }
}

// ── "Renderizando agora" (miniatura do quadro, barra, tempo, velocidade, placa/CPU) e o monitor ao vivo ──
const VEKE_MON = { timer: null, quadroT: 0, ultimo: null };
const veKeGB = b => (b / 2 ** 30).toFixed(1).replace('.', ',');
function veKeMontarPainel() {
    const col = $ve('ve-fila-col'); if (!col || $ve('ke-agora')) return;
    const agora = document.createElement('div');
    agora.className = 'ke-agora'; agora.id = 'ke-agora';
    agora.innerHTML = `<div class="ke-thumb" id="ke-thumb"><img id="ke-thumb-img" alt=""><span class="ke-thumb-vazio">${veT('Nada renderizando')}</span></div>
        <div class="ke-agora-info">
            <div class="ke-agora-l1"><span class="ke-agora-rot" id="ke-agora-rot">${veT('Pronto para renderizar')}</span><span class="ke-modo" id="ke-modo" hidden></span></div>
            <b class="ke-agora-nome" id="ke-agora-nome">—</b>
            <div class="ke-barra"><i id="ke-agora-fill"></i></div>
            <div class="ke-agora-l2"><span class="ke-pct" id="ke-agora-pct">0%</span><span id="ke-agora-tempo"></span><span id="ke-agora-vel"></span></div>
        </div>`;
    const mon = document.createElement('div');
    mon.className = 'ke-monitor'; mon.id = 'ke-monitor';
    mon.innerHTML = [['cpu', 'CPU'], ['ram', 'RAM'], ['gpu', veT('Placa')], ['vram', veT('Memória da placa')], ['enc', 'Encoder']]
        .map(([k, n]) => `<div class="ke-med" data-k="${k}"><span class="ke-med-n">${n}</span><b class="ke-med-v">—</b><span class="ke-med-b"><i></i></span></div>`).join('');
    col.insertBefore(mon, col.firstChild);
    col.insertBefore(agora, col.firstChild);
}
function veKeMed(k, pct, txt) {
    const el = document.querySelector(`#ke-monitor .ke-med[data-k="${k}"]`); if (!el) return;
    el.classList.toggle('sem', pct == null);
    el.querySelector('.ke-med-v').textContent = pct == null ? '—' : txt;
    const p = Math.max(0, Math.min(100, pct || 0));
    el.querySelector('.ke-med-b i').style.width = p + '%';
    el.classList.toggle('alto', p >= 85);
}
function veKeAgora() {
    if (!$ve('ke-agora')) return;
    const it = VEFILA.atual, ult = it || VEKE_MON.ultimo;
    $ve('ke-agora').classList.toggle('rodando', !!it);
    $ve('ke-agora-rot').textContent = it ? veT('Renderizando agora') : ult ? veT('Último render') : veT('Pronto para renderizar');
    $ve('ke-agora-nome').textContent = ult ? ult.cfg.nome : '—';
    const pct = it ? it.pct : ult ? ult.pct : 0;
    $ve('ke-agora-fill').style.width = pct + '%';
    $ve('ke-agora-pct').textContent = `${Math.round(pct)}%`;
    let tempo = '', vel = '';
    if (it && it.t0) {
        const pass = (Date.now() - it.t0) / 1000;
        tempo = veHuman(pass) + (pct > 3 ? ` · ${veT('falta')} ~${veHuman(pass / pct * (100 - pct))}` : '');
        if (pct > 1 && it.dur) vel = `${(it.dur * pct / 100 / pass).toFixed(2).replace('.', ',')}× ${veT('tempo real')}`;
    } else if (ult && ult.tempo) {
        tempo = `${veT('feito em')} ${veHuman(ult.tempo)}`;
        if (ult.dur) vel = `${(ult.dur / ult.tempo).toFixed(2).replace('.', ',')}× ${veT('tempo real')}`;
    }
    $ve('ke-agora-tempo').textContent = tempo;
    $ve('ke-agora-vel').textContent = vel;
    const m = String((ult && ult.msg) || ''), modo = $ve('ke-modo');
    const placa = /placa/i.test(m) && !/não conseguiu/i.test(m), turbo = /turbo/i.test(m);
    modo.hidden = !m;
    modo.textContent = placa ? veT('Montado na placa') : turbo ? 'Turbo' : veT('Processador');
    modo.className = 'ke-modo ' + (placa || turbo ? 'gpu' : 'cpu');
}
async function veKeMonitorTick() {
    if (veKeEl().hidden) { clearInterval(VEKE_MON.timer); VEKE_MON.timer = null; return; }
    veKeAgora();
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_encoder_estado) return;
    let r;
    try { r = await api.ve_encoder_estado(); } catch (e) { return; }
    if (!r) return;
    veKeMed('cpu', r.cpu, r.cpu == null ? '' : `${Math.round(r.cpu)}%`);
    veKeMed('ram', r.ram_total ? r.ram / r.ram_total * 100 : null, r.ram_total ? `${veKeGB(r.ram)} / ${veKeGB(r.ram_total)} GB` : '');
    veKeMed('gpu', r.gpu, r.gpu == null ? '' : `${Math.round(r.gpu)}%`);
    veKeMed('vram', r.vram_total ? r.vram / r.vram_total * 100 : null, r.vram_total ? `${veKeGB(r.vram)} / ${veKeGB(r.vram_total)} GB` : '');
    veKeMed('enc', r.enc, r.enc == null ? '' : `${Math.round(r.enc)}%`);
    const mon = $ve('ke-monitor');
    if (mon) mon.title = r.placa || veT('Sem placa NVIDIA: só CPU e RAM');
    const q = r.quadro, img = $ve('ke-thumb-img');
    // o quadro do render atual (ou o último, se terminou rápido — render curto acabava antes da 1ª leitura)
    if (q && img && (VEFILA.atual || VEKE_MON.ultimo) && q.t !== VEKE_MON.quadroT) {
        VEKE_MON.quadroT = q.t;
        img.onload = () => $ve('ke-thumb').classList.add('com');
        img.src = `${q.url}?t=${q.t}`;
    }
}
function veKeMonitorLigar() {
    veKeMontarPainel();
    const th = $ve('ke-thumb');
    if (th) th.style.aspectRatio = `${VE.seqW || 1080} / ${VE.seqH || 1920}`;
    if (!VEKE_MON.timer) VEKE_MON.timer = setInterval(veKeMonitorTick, 1000);
    veKeMonitorTick();
}
(function () {
    const abrir = veOpenExport;
    veOpenExport = function () { abrir(); if (!veKeEl().hidden && $ve('ve-fila-col')) veKeMonitorLigar(); };
    // o item que terminou fica no "Último render"; cada render pronto toca o som de concluído
    const ev = veFilaEvento;
    veFilaEvento = function (e) {
        const it = VEFILA.atual;
        if (it && !e.done && e.message) it.msg = e.message;
        if (it && e.done) { VEKE_MON.ultimo = it; if (e.success && typeof playConcluido === 'function') playConcluido(); }
        const r = ev(e);
        veKeAgora();
        return r;
    };
})();

window.VEKE_API = { minimizar: () => veKeMinimizar(), restaurar: () => veKeRestaurar(), estado: () => ({ aberto: !veKeEl().hidden, min: VEKE.min, janela: veKeLer() }),
    filaAtalho: abrir => veKeFilaAtalho(abrir) };
