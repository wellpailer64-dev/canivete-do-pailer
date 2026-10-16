// =========================================================
// Lobbys padronizados (2026-10-16): a tela de entrada de cada ferramenta no padrão do Vídeo Kanivete — cartão com arte,
// logo, título e ações; seções embaixo (modelos, abertos, recentes); "Recuperar" — sobre o vídeo do Início sem cor,
// tingido na cor da ferramenta. Vídeo (#ve-start) e Sound (#sk-inicio) já tinham o lobby: ganham só o fundo. Photo
// (#ie-inicio) e Vetor (#vk-inicio) tinham uma caixa no meio da mesa: aqui ela sai do meio, cobre a área abaixo do menu e
// ganha o cartão (os recentes, os modelos rápidos e os "Abertos" continuam vindo do código de cada um, pelos mesmos ids).
// Lux (#lux-inicio) monta o dela em lux.js com as mesmas classes. Aplicado a cada troca de ferramenta (switchTool).
// =========================================================
const KL_LOBBYS = [
    { sel: '#ve-start', cor: '#c9a8ff', vid: 'vd' },
    { sel: '#sk-inicio', cor: '#7fd6ff', vid: 'sk' },
    { sel: '#lux-inicio', cor: '#ff4fc8', vid: 'lk' },
    { sel: '#sd-inicio', cor: '#2ee6c8', vid: 'sd' },
    { sel: '#ie-inicio', cor: '#4c9bff', vid: 'pk', sig: 'Pk', al: 'al-pk', titulo: 'Comece sua arte', img: 'img/home/banner-pk.webp',
      texto: 'Abra um PSD com as camadas, uma foto ou comece do zero. Retoque, recorte, gere imagens com IA e monte carrosséis e flyers.',
      novo: () => ieNovoDialogo(), abrir: () => ieAbrirDialogo() },
    { sel: '#vk-inicio', cor: '#ff8c42', vid: 'vk', sig: 'Vk', al: 'al-vk', titulo: 'Comece seu vetor', img: 'img/home/banner-vk.webp',
      texto: 'Abra PDF, AI, SVG ou PowerPoint, ou comece de um modelo. Desenhe com curvas e feche o arquivo em PDF/X para a gráfica.',
      novo: () => vkNovoDialogo(), abrir: () => vkCmdUi('abrir', {}) },
];
// o vídeo do Início já gravado na cor de cada ferramenta (video/lobby-<id>.webm, ~60 KB): tingir com mix-blend-mode a
// cada quadro custava ~5–7% de um núcleo com o app parado (medido 2026-10-16). Trocou o vídeo/cor: gerar de novo (ffmpeg
// colorchannelmixer = cinza × cor, ver CLAUDE.md) e subir o ?v=.
const KL_VIDEO = id => `video/lobby-${id}.webm?v=2`;
let klVisto = null;

function klFundo(el, cor, vid) {
    if (el.querySelector(':scope > .kl-fundo')) return;
    el.classList.add('kl-com-fundo');
    el.style.setProperty('--kl-cor', cor);
    const f = document.createElement('div'); f.className = 'kl-fundo'; f.setAttribute('aria-hidden', 'true');
    f.innerHTML = `<video src="${KL_VIDEO(vid)}" muted loop playsinline preload="auto" tabindex="-1"></video><i class="kl-veu"></i>`;
    el.prepend(f);
    const v = f.querySelector('video');
    // só toca com o lobby na tela (lobby escondido ou outra ferramenta: pausa)
    klVisto = klVisto || new IntersectionObserver(es => es.forEach(e => { const vv = e.target; if (e.isIntersecting) vv.play().catch(() => {}); else vv.pause(); }));
    klVisto.observe(v);
}

// Photo/Vetor: a caixa do meio vira o lobby padrão (mesmos ids e a mesma .ie-inicio-box por dentro)
function klPadrao(el, o) {
    if (el.dataset.kl) return;
    const raiz = el.closest('.ie'), box = el.querySelector('.ie-inicio-box'); if (!raiz || !box) return;
    el.dataset.kl = '1';
    raiz.appendChild(el);   // sai da mesa do meio: cobre tudo abaixo do menu
    el.classList.add('kl');
    const topo = raiz.querySelector(':scope > .ie-top');
    el.style.setProperty('--kl-top', ((topo && topo.offsetHeight) || 40) + 'px');
    const recentes = box.querySelector('.ie-recentes');
    [...box.children].forEach(c => { if (c !== recentes && !c.matches('.vk-rapido, .ie-inicio-abertos')) c.remove(); });
    box.classList.add('kl-inner');
    const hero = document.createElement('div'); hero.className = 'kl-hero';
    hero.innerHTML = `<img class="kl-hero-bg" src="${o.img}" alt="" aria-hidden="true" onload="this.classList.add('pronto')">
        <div class="kl-hero-txt"><span class="app-logo ${o.al} app-logo-grande">${o.sig}</span><h2>${o.titulo}</h2><p>${o.texto}</p></div>
        <div class="kl-acoes"><button class="ie-btn ie-btn-primario kl-novo" data-kl="novo"><svg class="i"><use href="#i-file"/></svg> Novo documento</button>
            <div class="kl-mais"><button class="ie-btn" data-kl="abrir"><svg class="i"><use href="#i-folder"/></svg> Abrir...</button></div></div>`;
    hero.onclick = e => { const b = e.target.closest('[data-kl]'); if (b) (b.dataset.kl === 'novo' ? o.novo : o.abrir)(); };
    box.prepend(hero);
}

function klAplicar() {
    for (const o of KL_LOBBYS) {
        const el = document.querySelector(o.sel); if (!el) continue;
        if (o.sig) klPadrao(el, o);
        klFundo(el, o.cor, o.vid);
    }
}
// app minimizado ou em segundo plano: os vídeos dos lobbys param (o IntersectionObserver não vê a janela sumir)
document.addEventListener('visibilitychange', () => document.querySelectorAll('.kl-fundo video').forEach(v => {
    if (document.hidden) v.pause(); else if (v.offsetParent) v.play().catch(() => {});
}));
document.addEventListener('DOMContentLoaded', () => { klAplicar(); setTimeout(klAplicar, 800); });
window.KL_API = { aplicar: klAplicar };
