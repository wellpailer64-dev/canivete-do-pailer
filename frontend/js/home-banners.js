// =========================================================
// Início: banners deslizantes no topo (um por ferramenta, troca a cada 5 s) e, embaixo, o trilho com o ícone, o nome e a
// info de cada uma. A troca segue a barrinha do item ativo (animationend), então pausar a barrinha pausa o carrossel:
// mouse em cima do banner ou do trilho pausa; passar o mouse num item mostra o banner dele; clicar abre a ferramenta.
// Artes em img/home/banner-<id>.webp (Z-Image local; script em D:/kanivete_testes/scripts/gerar_banners.py).
// =========================================================
const HB_ITENS = [
    { id: 'vd', sig: 'Vd', nome: 'Vídeo Kanivete', info: 'Edição, camadas, motion e 3D', abrir: () => switchTool('video-cutter'),
      head: 'Edite vídeos como um profissional', sub: 'Timeline, camadas, motion e cor',
      corpo: 'Corte, monte e finalize com efeitos, legendas, áudio multipista e cenas 3D. Tudo no seu PC, sem enviar nada para a nuvem.' },
    { id: 'ke', sig: 'Ke', nome: 'Kanivete Encoder', info: 'Fila de render na placa', abrir: () => switchTool('kanivete-encoder'),
      head: 'Exporte rápido, direto na placa', sub: 'Fila de render, como o Media Encoder',
      corpo: 'Ponha várias timelines na fila, acompanhe o render ao vivo e continue editando. Quando termina, a Fran avisa.' },
    { id: 'pk', sig: 'Pk', nome: 'Photo Kanivete', info: 'PSD, retoque e IA local', abrir: () => switchTool('editor-imagem'),
      head: 'Retoque e crie com camadas', sub: 'PSD, máscaras, filtros e IA local',
      corpo: 'Abra e salve PSD editável, recorte fundos, gere imagens com IA e monte carrosséis e flyers prontos para postar.' },
    { id: 'vk', sig: 'Vk', nome: 'Vetor Kanivete', info: 'Identidade visual e gráfica', abrir: () => switchTool('vetor-kanivete'),
      head: 'Vetores prontos para a gráfica', sub: 'Logos, identidade visual e impressão',
      corpo: 'Desenhe com curvas, organize pranchetas e feche PDF/X com sangria, marcas de corte e CMYK conferido.' },
    { id: 'sk', sig: 'Sk', nome: 'Sound Kanivete', info: 'Faixas, limpeza e voz', abrir: () => switchTool('sound-kanivete'),
      head: 'Áudio limpo, com voz de estúdio', sub: 'Multipista, limpeza e voz por IA',
      corpo: 'Grave, corte e mixe em faixas, tire ruídos, acerte o volume pelo LUFS e gere narrações com as suas vozes salvas.' },
    { id: 'lk', sig: 'Lk', nome: 'Lux Kanivete', info: 'Produto em 3D e render', abrir: () => luxAbrir(),
      head: 'Seu produto em 3D, como foto', sub: 'Embalagens, luzes e render no Blender',
      corpo: 'Monte a cena com pote ou bastão, rótulo, materiais e luzes de estúdio e renderize fotos e vídeos fotorrealistas.' },
    { id: 'sd', sig: 'Sd', nome: 'Slider Kanivete', info: 'Apresentações 16:9', abrir: () => switchTool('slider-kanivete'),
      head: 'Apresentações que prendem a plateia', sub: 'Slides, camadas, vídeo e modo apresentação',
      corpo: 'Monte palestras com temas prontos, vídeos e GIFs no slide, animações e transições. Abra PowerPoint e exporte em PDF, PPTX ou vídeo.' },
    { id: 'at', sig: 'At', nome: 'Ata Kanivete', info: 'Reunião do Meet vira ATA (Beta)', abrir: () => switchTool('ata-kanivete'),
      head: 'Reuniões viram ATA sozinhas', sub: 'Google Meet, transcrição e Kani',
      corpo: 'Grave a call do Meet direto pelo Kanivete. No fim, a Kani escreve a ATA com decisões, tarefas e prazos para você revisar e baixar em PDF.' },
    { id: 'kani', sig: '', nome: 'Kani', info: 'Assistente que cria', abrir: () => kaniAbrir(),
      head: 'Peça, e a Kani cria pra você', sub: 'Assistente local, sem internet',
      corpo: 'Converse, tire dúvidas do app e peça imagens, efeitos sonoros, narrações e vinhetas, tudo gerado no seu computador.' },
];
const HB = { i: 0 };
const hbEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hbLogo = it => it.sig ? `<span class="app-logo al-${it.id}">${it.sig}</span>` : '<span class="app-logo hb-kani-logo"></span>';

function hbMontar() {
    const box = document.getElementById('home-banners'); if (!box || box.dataset.ok) return;
    box.dataset.ok = '1';
    box.innerHTML = `<div class="hb-palco">${HB_ITENS.map((it, i) => `
        <button class="hb-slide hb-${it.id}" data-hb="${i}" tabindex="-1" aria-label="${hbEsc(it.nome)}">
            ${it.id === 'kani' ? '<span class="hb-arte hb-arte-kani"><i></i></span>' : `<img class="hb-arte" src="img/home/banner-${it.id}.webp" alt="" decoding="async">`}
            <span class="hb-veu"></span>
            <span class="hb-txt">
                <span class="hb-marca">${hbLogo(it)}<b>${hbEsc(it.nome)}</b><i>·</i><em>${hbEsc(it.sub)}</em></span>
                <span class="hb-head">${hbEsc(it.head)}</span>
                <span class="hb-corpo">${hbEsc(it.corpo)}</span>
                <span class="hb-cta">Abrir ${hbEsc(it.nome)}<svg class="hb-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
            </span>
        </button>`).join('')}</div>
        <div class="hb-trilho">${HB_ITENS.map((it, i) => `
            <button class="hb-chip hb-${it.id}" data-hbc="${i}" title="${hbEsc(it.nome)}: ${hbEsc(it.info)}">
                ${hbLogo(it)}<span class="hb-chip-txt"><b>${hbEsc(it.nome)}</b><small>${hbEsc(it.info)}</small></span>
                <span class="hb-prog"><i></i></span>
            </button>`).join('')}</div>`;
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-hb],[data-hbc]'); if (!b) return;
        const it = HB_ITENS[+(b.dataset.hb ?? b.dataset.hbc)];
        try { it.abrir(); } catch (er) { console.warn(er); }
    });
    box.addEventListener('mouseover', e => { const c = e.target.closest('[data-hbc]'); if (c && +c.dataset.hbc !== HB.i) hbIr(+c.dataset.hbc); });
    box.addEventListener('animationend', e => { if (e.target.closest('.hb-chip.on .hb-prog')) hbIr(HB.i + 1); });
    hbIr(0);
}
function hbIr(i) {
    const box = document.getElementById('home-banners'); if (!box) return;
    HB.i = (i + HB_ITENS.length) % HB_ITENS.length;
    box.querySelectorAll('.hb-slide').forEach((s, k) => s.classList.toggle('on', k === HB.i));
    box.querySelectorAll('.hb-chip').forEach((c, k) => {
        const p = c.querySelector('.hb-prog i');
        c.classList.remove('on'); p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';   // reinicia a barrinha
        if (k === HB.i) c.classList.add('on');
    });
}
document.addEventListener('DOMContentLoaded', hbMontar);
if (document.readyState !== 'loading') hbMontar();
window.HB_API = { ir: hbIr, atual: () => HB_ITENS[HB.i].id, itens: () => HB_ITENS.map(x => x.id) };
