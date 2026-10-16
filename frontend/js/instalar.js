// =========================================================
// Tela da 1ª instalação (frontend/instalar.html, aberta pelo first_run.py numa janela do pywebview): os banners das
// ferramentas (o MESMO carrossel da Home, home-banners.js), a barra de progresso na identidade do KANIVETE e a música de
// fundo opcional (audio/instalador/musica.ogg — se o arquivo não existir, o botão some). O Python conta o andamento
// em first_run.py › _ESTADO e a página pergunta a cada 0,4 s (pywebview.api.estado()).
// =========================================================
const IN = { musica: null, mudo: false, fim: false, alvo: 0.38 };
const inEl = id => document.getElementById(id);
const inGB = mb => (mb >= 1000 ? (mb / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' GB' : Math.round(mb) + ' MB');

function inMusica() {
    const a = IN.musica = inEl('in-musica'), b = inEl('in-som');
    try { IN.mudo = localStorage.getItem('in-mudo') === '1'; } catch (e) { /* sem armazenamento */ }
    a.volume = 0;
    a.addEventListener('error', () => { b.hidden = true; inEl('in-credito').hidden = true; });
    const tocar = () => a.play().then(() => { inFade(IN.mudo ? 0 : IN.alvo, 2500); inBotao(); }).catch(() => { b.classList.add('parado'); inBotao(); });
    a.addEventListener('canplay', tocar, { once: true });
    b.addEventListener('click', () => {
        if (a.paused) { IN.mudo = false; a.play().then(() => inFade(IN.alvo, 800)).catch(() => {}); b.classList.remove('parado'); }
        else { IN.mudo = !IN.mudo; inFade(IN.mudo ? 0 : IN.alvo, 500); }
        try { localStorage.setItem('in-mudo', IN.mudo ? '1' : '0'); } catch (e) { /* ok */ }
        inBotao();
    });
}
function inBotao() {
    const b = inEl('in-som'), off = IN.mudo || (IN.musica && IN.musica.paused);
    b.classList.toggle('off', off); b.title = off ? 'Ligar a música' : 'Desligar a música';
    b.querySelector('span').textContent = IN.musica && IN.musica.paused ? 'Tocar música' : off ? 'Música desligada' : 'Música';
}
function inFade(para, ms) {
    const a = IN.musica; if (!a) return;
    cancelAnimationFrame(IN.raf);
    const de = a.volume, t0 = performance.now();
    const passo = t => { const k = Math.min(1, (t - t0) / ms); a.volume = Math.max(0, Math.min(1, de + (para - de) * k)); if (k < 1) IN.raf = requestAnimationFrame(passo); };
    IN.raf = requestAnimationFrame(passo);
}
function inMostrar(e) {
    if (!e) return;
    const pct = Math.max(0, Math.min(100, e.geral || 0));
    inEl('in-barra').style.width = pct.toFixed(1) + '%';
    inEl('in-pct').textContent = Math.floor(pct) + '%';
    inEl('in-item').textContent = e.label || '';
    inEl('in-conta').textContent = e.total ? `${Math.min(e.i + 1, e.total)} de ${e.total}${e.total_mb ? ' · ' + inGB(e.feito_mb || 0) + ' de ' + inGB(e.total_mb) : ''}` : '';
    inEl('in-item-barra').style.width = (e.pct || 0) + '%';
    document.body.classList.toggle('girando', !!e.girando);
    if (e.fim && !IN.fim) {
        IN.fim = true;
        document.body.classList.add('fim');
        inEl('in-item').textContent = e.falhas && e.falhas.length ? `${e.falhas.length} item(ns) não baixaram — tento de novo na próxima abertura. Abrindo o KANIVETE…` : 'Tudo pronto! Abrindo o KANIVETE…';
        inFade(0, 2000);
    }
}
async function inPerguntar() {
    try { inMostrar(await window.pywebview.api.estado()); } catch (e) { /* ponte ainda subindo */ }
    if (!IN.fim) setTimeout(inPerguntar, 400);
}
window.addEventListener('pywebviewready', inPerguntar);
document.addEventListener('DOMContentLoaded', () => {
    inMusica();
    if (window.pywebview && window.pywebview.api && window.pywebview.api.estado) inPerguntar();
    // demonstração no navegador (sem o Python): ?demo
    if (/demo/.test(location.search)) { let g = 0; setInterval(() => { g = (g + 0.6) % 101; inMostrar({ geral: g, pct: (g * 7) % 100, label: 'Baixando modelo de transcrição (Whisper Small)', i: Math.floor(g / 10), total: 10, feito_mb: g * 39, total_mb: 3900 }); }, 120); }
});
