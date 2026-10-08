// =========================================================
// Pocket Editor — painel Desempenho: CPU, RAM, placa de vídeo, memória da placa e encoder ao vivo (o mesmo monitor da
// janela do Kanivete Encoder: Functions/encoder_monitor.py, API ve_encoder_estado). Encaixa em qualquer canto do layout
// (editor-dock.js): alto e estreito = medidores empilhados; largo e baixo = lado a lado; bem pequeno = só os números.
// Lê 1×/s e só enquanto está visível na tela (aba ativa, editor aberto).
// =========================================================
const VEDES = { el: null, timer: null, ocupado: false };
const VEDES_ITENS = [
    ['cpu', 'CPU', 'Processador'], ['ram', 'RAM', 'Memória RAM'], ['gpu', 'GPU', 'Placa de vídeo'],
    ['vram', 'VRAM', 'Memória da placa'], ['enc', 'ENC', 'Encoder da placa (gravação de vídeo)'],
];

function veDesMontar() {
    const el = document.getElementById('ve-desemp');
    if (!el || VEDES.el) return;
    VEDES.el = el;
    el.innerHTML = VEDES_ITENS.map(([k, n, t]) => `<div class="ve-des-m" data-k="${k}" title="${veT(t)}">
        <span class="ve-des-n">${n}</span><b class="ve-des-v">—</b><small class="ve-des-s"></small>
        <span class="ve-des-b"><i></i></span></div>`).join('');
    // o formato acompanha o lugar onde o painel foi encaixado
    new ResizeObserver(() => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        const horiz = w > h * 1.4;
        el.classList.toggle('horiz', horiz);
        el.classList.toggle('vert', !horiz);
        el.classList.toggle('mini', horiz ? h < 46 : w < 74);
    }).observe(el);
    VEDES.timer = setInterval(veDesTick, 1000);
}

const veDesGB = b => (b / 2 ** 30).toFixed(1).replace('.', ',');
function veDesMed(k, pct, valor, sub, dica) {
    const m = VEDES.el.querySelector(`.ve-des-m[data-k="${k}"]`); if (!m) return;
    const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    m.classList.toggle('sem', pct == null);
    m.classList.toggle('alto', p >= 85);
    m.querySelector('.ve-des-v').textContent = pct == null ? '—' : valor;
    m.querySelector('.ve-des-s').textContent = pct == null ? '' : sub || '';
    m.querySelector('.ve-des-b i').style.width = p + '%';
    if (dica) m.title = dica;
}

async function veDesTick() {
    const el = VEDES.el;
    if (!el || VEDES.ocupado || !el.isConnected || !el.offsetWidth || !el.offsetHeight) return;   // fechado, aba de trás ou outra ferramenta
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_encoder_estado) return;
    VEDES.ocupado = true;
    let r = null;
    try { r = await api.ve_encoder_estado(); } catch (e) { /* app fechando */ }
    VEDES.ocupado = false;
    if (!r) return;
    veDesMed('cpu', r.cpu, r.cpu == null ? '' : `${Math.round(r.cpu)}%`, '', veT('Processador'));
    veDesMed('ram', r.ram_total ? r.ram / r.ram_total * 100 : null, r.ram_total ? `${veDesGB(r.ram)} GB` : '',
        r.ram_total ? `/ ${veDesGB(r.ram_total)}` : '', r.ram_total ? `${veT('Memória RAM')}: ${veDesGB(r.ram)} / ${veDesGB(r.ram_total)} GB` : '');
    veDesMed('gpu', r.gpu, r.gpu == null ? '' : `${Math.round(r.gpu)}%`, '', r.placa || veT('Sem placa NVIDIA: só CPU e RAM'));
    veDesMed('vram', r.vram_total ? r.vram / r.vram_total * 100 : null, r.vram_total ? `${veDesGB(r.vram)} GB` : '',
        r.vram_total ? `/ ${veDesGB(r.vram_total)}` : '', r.vram_total ? `${veT('Memória da placa')}: ${veDesGB(r.vram)} / ${veDesGB(r.vram_total)} GB` : '');
    veDesMed('enc', r.enc, r.enc == null ? '' : `${Math.round(r.enc)}%`, '', veT('Encoder da placa (gravação de vídeo)'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', veDesMontar); else veDesMontar();
window.VEDES_API = { tick: () => veDesTick(), modo: () => VEDES.el && [...VEDES.el.classList].filter(c => ['horiz', 'vert', 'mini'].includes(c)) };
