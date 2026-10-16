// =========================================================
// Slider Kanivete — APRESENTAÇÃO: tela cheia, transições entre slides, animações de entrada (as de "esperar o
// clique" viram passos), vídeos tocando sozinhos, GIFs animados, e a visão do apresentador (N): notas, próximo slide,
// cronômetro e relógio. Teclas: → ↓ Espaço PgDn clique = avança · ← ↑ PgUp = volta · Home/End · número + Enter =
// vai ao slide · B/. = tela preta · W/, = tela branca · N = apresentador · Esc = sai.
// =========================================================
const SDS = { on: false, lista: [], i: 0, passo: 0, passos: [], el: null, ini: 0, num: '', soEste: false };
const SD_ANIM_DE = { esmaecer: 'opacity:0', subir: 'opacity:0;transform:translateY(80px)', descer: 'opacity:0;transform:translateY(-80px)',
    esquerda: 'opacity:0;transform:translateX(-160px)', direita: 'opacity:0;transform:translateX(160px)', zoom: 'opacity:0;transform:scale(.6)', girar: 'opacity:0;transform:rotate(-25deg) scale(.7)',
    pular: 'opacity:0;transform:scale(.3)', crescer: 'clip-path:inset(100% 0 0 0)', revelar: 'clip-path:inset(0 100% 0 0)' };
const SD_ANIM_CURVA = { pular: 'cubic-bezier(.34,1.7,.5,1)', crescer: 'cubic-bezier(.25,.8,.25,1)', revelar: 'cubic-bezier(.45,0,.2,1)' };
// quadros-chave de uma animação de entrada (apresentação e prévia na mesa usam os mesmos)
function sdAnimQuadros(c, base = '') {
    // recorte (clip-path) só nas animações de recorte: no resto cortaria a sombra do objeto
    const de = { opacity: c.opac != null && c.opac < 1 ? c.opac : 1, transform: base || 'none' }, para = { ...de };
    for (const d of (SD_ANIM_DE[c.anim.tipo] || 'opacity:0').split(';')) { const [k, v] = d.split(':'); if (k === 'transform') de.transform = (base + ' ' + v).trim(); else if (k === 'clip-path') { de.clipPath = v; para.clipPath = 'inset(0 0 0 0)'; } else de[k] = +v; }
    return [de, para];
}
// transição de slide: [quadros do novo, quadros do velho] (k = escala do palco)
function sdTransQuadros(tipo, sinal = 1, k = 1) {
    const S = `scale(${k})`;
    return { esmaecer: [[{ opacity: 0 }, { opacity: 1 }]], deslizar: [[{ transform: `translateX(${sinal * 100}%) ${S}` }, { transform: `translateX(0) ${S}` }]],
        empurrar: [[{ transform: `translateX(${sinal * 100}%) ${S}` }, { transform: `translateX(0) ${S}` }], [{ transform: `translateX(0) ${S}` }, { transform: `translateX(${-sinal * 100}%) ${S}` }]],
        subir: [[{ transform: `translateY(${sinal * 100}%) ${S}` }, { transform: `translateY(0) ${S}` }]],
        zoom: [[{ opacity: 0, transform: `scale(${k * 1.12})` }, { opacity: 1, transform: S }]],
        cobrir: [[{ clipPath: sinal > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }]],
        revelar: [[{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }]],
        preto: [[{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 1 }], [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }]] }[tipo];
}

async function sdApresentar(de = 0, op = {}) {
    if (!SD.doc) return;
    if (SDU && SDU.editando) sdFimEdicao();
    SDS.lista = op.soEste ? [sdSlide()] : SD.doc.slides.filter(s => !s.oculto);
    if (!SDS.lista.length) { sdToast('Todos os slides estão ocultos', 'aviso'); return; }
    const alvo = SD.doc.slides[de];
    SDS.i = Math.max(0, op.soEste ? 0 : SDS.lista.indexOf(alvo) >= 0 ? SDS.lista.indexOf(alvo) : 0);
    SDS.soEste = !!op.soEste; SDS.on = true; SDS.ini = Date.now(); SDS.num = '';
    await sdPrepararUrls();
    const el = document.createElement('div'); el.className = 'sd-show'; el.tabIndex = -1;
    el.innerHTML = `<div class="sd-show-palco"></div><div class="sd-show-tela" hidden></div>
        <div class="sd-show-ap" hidden><div class="sd-ap-prox"><small>Próximo</small><div class="sd-ap-mini"></div></div>
        <div class="sd-ap-notas"></div><div class="sd-ap-info"><b class="sd-ap-tempo">00:00</b><span class="sd-ap-hora"></span><span class="sd-ap-n"></span></div></div>
        <div class="sd-show-dica">← → para navegar · N notas · Esc sai</div>`;
    document.body.appendChild(el); SDS.el = el;
    el.addEventListener('click', e => { if (!e.target.closest('.sd-show-ap,video[controls]')) sdShowAvancar(); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); sdShowVoltar(); });
    el.addEventListener('mousemove', () => { el.classList.add('mouse'); clearTimeout(SDS.tm); SDS.tm = setTimeout(() => el.classList.remove('mouse'), 1500); });
    document.addEventListener('keydown', sdShowTecla, true);
    addEventListener('resize', sdShowEscala);
    try { if (el.requestFullscreen) await el.requestFullscreen(); else if (sdApi()) sdApi().toggle_fullscreen(); } catch (e) { try { sdApi() && sdApi().toggle_fullscreen(); SDS.cheiaApi = true; } catch (e2) { /* janela normal */ } }
    document.addEventListener('fullscreenchange', sdShowSaiuCheia);
    SDS.relogio = setInterval(sdShowRelogio, 1000);
    sdShowIr(SDS.i, null);
    el.focus();
}
function sdShowSaiuCheia() { if (!document.fullscreenElement && SDS.on && !SDS.cheiaApi) sdShowSair(); }
function sdShowEscala() {
    const pal = SDS.el && SDS.el.querySelector('.sd-show-palco'); if (!pal) return;
    const ap = !SDS.el.querySelector('.sd-show-ap').hidden;
    const W = SD.doc.largura, H = SD.doc.altura, aw = innerWidth * (ap ? 0.66 : 1), ah = innerHeight;
    const k = Math.min(aw / W, ah / H);
    pal.style.setProperty('--k', k);
    pal.style.width = W * k + 'px'; pal.style.height = H * k + 'px';
    pal.querySelectorAll('.sd-slide').forEach(s => { s.style.transform = `scale(${k})`; });
}
const sdTemAnim = c => c.anim && c.anim.tipo && c.anim.tipo !== 'nenhuma';
function sdShowPassos(s) { return s.camadas.filter(c => sdTemAnim(c) && c.anim.clique && !c.oculto); }
function sdShowIr(i, direcao = 1, passo = 0) {
    const s = SDS.lista[i]; if (!s) return;
    const pal = SDS.el.querySelector('.sd-show-palco'), velho = pal.querySelector('.sd-slide:last-child');
    const novo = sdMontarSlide(s, 'show'); novo.style.position = 'absolute'; novo.style.left = '0'; novo.style.top = '0'; novo.style.transformOrigin = '0 0';
    SDS.i = i; SDS.passos = sdShowPassos(s); SDS.passo = 0;
    // animações: as automáticas entram já; as de clique ficam escondidas até o passo
    for (const c of s.camadas) {
        if (!sdTemAnim(c) || c.oculto) continue;
        const e = novo.querySelector(`[data-id="${c.id}"]`); if (!e) continue;
        e.dataset.base = e.style.transform || '';
        sdShowEsconder(e, c);
        if (!c.anim.clique) setTimeout(() => sdShowRevelar(e, c), 60 + (+c.anim.atraso || 0) * 1000);
    }
    pal.appendChild(novo); sdShowEscala();
    const tr = direcao === null ? null : (direcao > 0 ? s.transicao : (SDS.lista[i + 1] || {}).transicao);
    const tipo = tr && tr.tipo && tr.tipo !== 'nenhuma' ? tr.tipo : null, dur = (tr && +tr.dur) || 0.5;
    const ani = velho && tipo && sdTransQuadros(tipo, direcao > 0 ? 1 : -1, +pal.style.getPropertyValue('--k') || 1);
    if (ani) {
        if (tipo === 'preto') pal.style.background = '#000';
        novo.animate(ani[0], { duration: dur * 1000, easing: 'cubic-bezier(.4,0,.2,1)' });
        if (ani[1]) velho.animate(ani[1], { duration: dur * 1000, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
        setTimeout(() => { pal.querySelectorAll('.sd-slide').forEach(x => { if (x !== novo) sdShowLimpar(x); }); pal.style.background = ''; }, dur * 1000 + 30);
    } else pal.querySelectorAll('.sd-slide').forEach(x => { if (x !== novo) sdShowLimpar(x); });
    // vídeos: os de "tocar sozinho" começam; os outros ficam no 1º quadro com controles
    novo.querySelectorAll('video').forEach(v => {
        const c = sdCamada(v.closest('[data-id]').dataset.id, s);
        v.currentTime = +c.ini || 0;
        if (c.auto) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); else v.controls = true;
    });
    // voltando: mostra o slide já com todos os passos
    if (passo === 'fim') while (SDS.passo < SDS.passos.length) sdShowPasso(true);
    sdShowApresentador();
}
function sdShowLimpar(x) { x.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); x.remove(); }
function sdShowEsconder(e, c) {
    e.style.transition = 'none';
    const [de] = sdAnimQuadros(c, e.dataset.base);
    e.style.opacity = de.opacity; e.style.transform = de.transform === 'none' ? '' : de.transform; e.style.clipPath = de.clipPath || '';
}
function sdShowRevelar(e, c, ja = false) {
    void e.offsetWidth;
    const d = c.anim.dur || 0.6, curva = SD_ANIM_CURVA[c.anim.tipo] || 'cubic-bezier(.2,.8,.2,1)';
    e.style.transition = ja ? 'none' : `opacity ${d}s ease, transform ${d}s ${curva}, clip-path ${d}s ${curva}`;
    e.style.opacity = c.opac != null && c.opac < 1 ? c.opac : '1'; e.style.transform = e.dataset.base || '';
    if (e.style.clipPath) {   // recorte: anima até inset(0) (de/para "none" não interpola) e depois solta
        e.style.clipPath = 'inset(0 0 0 0)'; clearTimeout(e._tc); e._tc = setTimeout(() => { e.style.clipPath = ''; }, ja ? 0 : d * 1000 + 60);
    }
    const v = e.querySelector('video'); if (v && c.auto) v.play().catch(() => {});
}
function sdShowPasso(ja = false) {
    const c = SDS.passos[SDS.passo]; if (!c) return false;
    const e = SDS.el.querySelector(`.sd-slide:last-child [data-id="${c.id}"]`);
    if (e) sdShowRevelar(e, c, ja);
    SDS.passo++; sdShowApresentador(); return true;
}
function sdShowAvancar() {
    if (SDS.passo < SDS.passos.length) { sdShowPasso(); return; }
    if (SDS.i + 1 < SDS.lista.length) sdShowIr(SDS.i + 1, 1);
    else if (!SDS.fimMostrado) { SDS.fimMostrado = true; sdShowTela('#000', 'Fim da apresentação. Clique ou Esc para sair.'); }
    else sdShowSair();
}
function sdShowVoltar() {
    if (!SDS.el.querySelector('.sd-show-tela').hidden) { sdShowTela(null); SDS.fimMostrado = false; return; }
    if (SDS.i > 0) sdShowIr(SDS.i - 1, -1, 'fim');
}
function sdShowTela(cor, msg = '') {
    const t = SDS.el.querySelector('.sd-show-tela');
    if (!cor) { t.hidden = true; return; }
    t.hidden = false; t.style.background = cor; t.textContent = msg; t.style.color = cor === '#fff' ? '#000' : '#888';
}
function sdShowTecla(e) {
    if (!SDS.on) return;
    const k = e.key;
    const feito = () => { e.preventDefault(); e.stopPropagation(); };
    if (/^[0-9]$/.test(k)) { feito(); SDS.num += k; return; }
    if (k === 'Enter' && SDS.num) { feito(); const n = Math.max(1, Math.min(SDS.lista.length, +SDS.num)) - 1; SDS.num = ''; sdShowIr(n, n > SDS.i ? 1 : -1); return; }
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(k)) { feito(); if (!SDS.el.querySelector('.sd-show-tela').hidden && !SDS.fimMostrado) { sdShowTela(null); return; } sdShowAvancar(); return; }
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { feito(); sdShowVoltar(); return; }
    if (k === 'Home') { feito(); sdShowIr(0, -1); return; }
    if (k === 'End') { feito(); sdShowIr(SDS.lista.length - 1, 1, 'fim'); return; }
    if (k === 'b' || k === 'B' || k === '.') { feito(); const t = SDS.el.querySelector('.sd-show-tela'); sdShowTela(t.hidden ? '#000' : null); return; }
    if (k === 'w' || k === 'W' || k === ',') { feito(); const t = SDS.el.querySelector('.sd-show-tela'); sdShowTela(t.hidden ? '#fff' : null); return; }
    if (k === 'n' || k === 'N' || k === 's' || k === 'S') { feito(); const a = SDS.el.querySelector('.sd-show-ap'); a.hidden = !a.hidden; SDS.el.classList.toggle('com-ap', !a.hidden); sdShowEscala(); sdShowApresentador(); return; }
    if (k === 'Escape') { feito(); sdShowSair(); return; }
    feito();
}
function sdShowApresentador() {
    const a = SDS.el && SDS.el.querySelector('.sd-show-ap'); if (!a || a.hidden) { sdShowRelogio(); return; }
    const s = SDS.lista[SDS.i], prox = SDS.lista[SDS.i + 1];
    a.querySelector('.sd-ap-notas').textContent = s.notas || '(sem notas neste slide)';
    const m = a.querySelector('.sd-ap-mini'); m.innerHTML = '';
    if (prox) { const k = m.clientWidth / SD.doc.largura || 0.25, el = sdMontarSlide(prox, 'mini'); el.style.transform = `scale(${k})`; el.style.transformOrigin = '0 0'; m.style.height = SD.doc.altura * k + 'px'; m.appendChild(el); }
    else m.innerHTML = '<p>Último slide</p>';
    a.querySelector('.sd-ap-n').textContent = `Slide ${SDS.i + 1} de ${SDS.lista.length}${SDS.passos.length ? ` · passo ${SDS.passo}/${SDS.passos.length}` : ''}`;
    sdShowRelogio();
}
function sdShowRelogio() {
    if (!SDS.el) return;
    const t = Math.floor((Date.now() - SDS.ini) / 1000), a = SDS.el.querySelector('.sd-show-ap');
    a.querySelector('.sd-ap-tempo').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    a.querySelector('.sd-ap-hora').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function sdShowSair() {
    if (!SDS.on) return;
    SDS.on = false; SDS.fimMostrado = false;
    document.removeEventListener('keydown', sdShowTecla, true);
    document.removeEventListener('fullscreenchange', sdShowSaiuCheia);
    removeEventListener('resize', sdShowEscala);
    clearInterval(SDS.relogio);
    const atual = SDS.lista[SDS.i];
    if (SDS.el) { SDS.el.querySelectorAll('.sd-slide').forEach(sdShowLimpar); SDS.el.remove(); SDS.el = null; }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (SDS.cheiaApi && sdApi()) { sdApi().toggle_fullscreen(); SDS.cheiaApi = false; }
    if (atual && !SDS.soEste) { SD.atual = SD.doc.slides.indexOf(atual); SD.sel = []; sdAvisar('atual'); }
}
window.SDS_API = { apresentar: sdApresentar, avancar: () => sdShowAvancar(), voltar: () => sdShowVoltar(), sair: sdShowSair, estado: () => ({ on: SDS.on, i: SDS.i, passo: SDS.passo, total: SDS.lista.length }) };
