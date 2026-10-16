// =========================================================
// Lux Kanivete (Lk, magenta) — a Cena 3D como ferramenta própria: embalagens, luzes (softbox, spot, ponto, sol),
// materiais do Blender e render fotorrealista. Entra pela barra lateral (categoria 3D) e pela Home SEM o Editor: a cena
// mora numa casa própria (LUXC: cena, tempo, tamanho, desfazer), fora do projeto do Editor. O motor é o mesmo da Cena 3D
// (editor-3d*.js), que lê tudo pela tomada V3 (editor-3d.js). Do Editor, duplo clique numa cena 3D da timeline abre a
// mesma tela com a cena da timeline; "Enviar ao Editor" copia a cena da Lux para a timeline.
// =========================================================

const LUX = { de: 'home', nome: 'Lux Kanivete', sigla: 'Lk' };
const LUX_RASCUNHO = 'lux-rascunho';   // a cena aberta volta depois de fechar o app (até salvar um .lknv)
const LUXC = {
    m: null, c: null, t: 0, w: 1920, h: 1080, fps: 30, sujo: false, desfazer: [], refazer: [],
    hist() { this.desfazer.push(luxFoto()); if (this.desfazer.length > 100) this.desfazer.shift(); this.refazer = []; this.sujo = true; luxGuardarLogo(); },
};
const luxFoto = () => JSON.stringify({ c3d: LUXC.m.c3d, dur: LUXC.m.dur });

// monta a casa com uma cena (dados de um .lknv, do rascunho ou nova)
function luxCasa(dados = {}, arquivo = null) {
    LUXC.w = +dados.largura || 1920; LUXC.h = +dados.altura || 1080; LUXC.fps = +dados.fps || 30;
    const dur = +dados.duracao || 5;
    const m = { id: 'lux', kind: 'video', c3d: dados.c3d || ve3dPadrao(), name: dados.nome || (arquivo ? luxNomeArq(arquivo) : veT('Cena') + ' 1'),
        cor: VE3D_COR, path: null, dur, _lux: true, info: { duration: dur, width: LUXC.w, height: LUXC.h, fps: LUXC.fps, has_audio: false, alfa: true } };
    if (arquivo) m.lux = { arquivo };
    LUXC.m = m; LUXC.c = { tr: 0, st: 0, s: 0, get e() { return +m.dur || 5; }, m: m.id, _m: m };
    LUXC.t = 0; LUXC.desfazer = []; LUXC.refazer = []; LUXC.sujo = false;
}
function luxGuardar() {
    if (!LUXC.m) return;
    const m = LUXC.m, d = { nome: m.name, c3d: m.c3d, largura: LUXC.w, altura: LUXC.h, fps: LUXC.fps, duracao: m.dur };
    try { localStorage.setItem(LUX_RASCUNHO, JSON.stringify({ dados: d, arquivo: m.lux && m.lux.arquivo, sujo: LUXC.sujo })); } catch (e) { /* só nesta sessão */ }
}
function luxGuardarLogo() { clearTimeout(LUXC.tg); LUXC.tg = setTimeout(luxGuardar, 1500); }
function luxRascunho() { try { return JSON.parse(localStorage.getItem(LUX_RASCUNHO) || 'null'); } catch (e) { return null; } }

async function luxAbrir(op = {}) {
    const antes = document.querySelector('.menu-item.active')?.dataset.tool;
    if (antes && antes !== 'lux-kanivete') LUX.de = antes;
    // sem pedido: o lobby (ou a cena que ficou aberta ao trocar de aba)
    if (!(op.nova || op.dados || op.continuar || LUX.naCena)) { luxLobby(); return; }
    if (op.nova && LUXC.m && LUXC.sujo && !confirm(veT('A cena atual tem mudanças não salvas. Começar outra mesmo assim?'))) return;
    if (VE.playing) veStop();
    LUX.abrindo = true; try { switchTool('lux-kanivete'); } finally { LUX.abrindo = false; }
    const lb = document.getElementById('lux-inicio'); if (lb) lb.hidden = true;
    V3.casa = LUXC; VE3T.lux = true;
    try {
        if (op.dados) luxCasa(op.dados, op.arquivo);
        else if (op.nova) await luxNovaCena();
        else if (!LUXC.m) {
            const r = luxRascunho();
            if (r && r.dados) { luxCasa(r.dados, r.arquivo); LUXC.sujo = !!r.sujo; }
            else await luxNovaCena();
        }
        LUX.naCena = true;
        await ve3dTelaAbrir(LUXC.c);
    } catch (e) { VE3T.lux = false; V3.casa = null; veToast(e.message || String(e)); }
}
// lobby da Lux (padrão dos lobbys, lobby.js): Nova cena, Abrir, Continuar (a cena da sessão ou o rascunho) e recentes
function luxLobby() {
    LUX.abrindo = true; try { switchTool('lux-kanivete'); } finally { LUX.abrindo = false; }
    const pg = document.getElementById('page-lux-kanivete'); if (!pg) return;
    let el = document.getElementById('lux-inicio');
    if (!el) {
        el = document.createElement('section'); el.className = 'kl'; el.id = 'lux-inicio'; el.style.setProperty('--kl-top', '0px');
        pg.appendChild(el);
        el.addEventListener('click', e => {
            const b = e.target.closest('[data-lx]'); if (!b) return;
            const a = b.dataset.lx;
            if (a === 'nova') luxAbrir({ nova: true });
            else if (a === 'abrir') luxAbrirDialogo();
            else if (a === 'continuar') luxAbrir({ continuar: true });
            else luxAbrirArquivo(a).catch(er => veToast(er.message || String(er)));
        });
    }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const r = luxRascunho(), nome = LUXC.m ? LUXC.m.name : r && r.dados && r.dados.nome, rec = typeof luxRecentes === 'function' ? luxRecentes() : [];
    el.innerHTML = `<div class="ie-inicio-box kl-inner">
        <div class="kl-hero"><img class="kl-hero-bg" src="img/home/banner-lk.webp" alt="" aria-hidden="true" onload="this.classList.add('pronto')">
            <div class="kl-hero-txt"><span class="app-logo al-lk app-logo-grande">Lk</span><h2>${veT('Comece sua cena')}</h2>
                <p>${veT('Monte o produto em 3D com embalagem, rótulo, materiais e luzes de estúdio, e renderize fotos e vídeos fotorrealistas no Blender.')}</p></div>
            <div class="kl-acoes"><button class="ie-btn ie-btn-primario kl-novo" data-lx="nova"><svg class="i"><use href="#i-file"/></svg> ${veT('Nova cena')}</button>
                <div class="kl-mais"><button class="ie-btn" data-lx="abrir"><svg class="i"><use href="#i-folder"/></svg> ${veT('Abrir...')}</button></div></div></div>
        ${nome ? `<div class="ie-inicio-abertos"><div class="ie-recentes-tit">${veT('Abertos')}</div><div class="ie-inicio-abertos-lista">
            <button class="ie-btn" data-lx="continuar">› ${veT('Continuar')}: ${esc(nome)}${LUXC.sujo || (r && r.sujo) ? ' •' : ''}</button></div></div>` : ''}
        <div class="ie-recentes kl-lista">${rec.length ? `<div class="ie-recentes-tit">${veT('Projetos recentes')}</div>` +
            rec.map(p => `<button class="ie-recente" data-lx="${esc(p)}" title="${esc(p)}">${esc(luxNomeArq(p))}</button>`).join('') : ''}</div>
    </div>`;
    el.hidden = false;
    if (typeof KL_API === 'object') KL_API.aplicar();
}
// cena nova pronta para produto: um pote no centro, fundo transparente e as quatro softboxes do estúdio de agência
async function luxNovaCena() {
    luxCasa({ nome: `${veT('Cena')} 1` });
    // fundo transparente (padrão do Kanivete: PNG com sombra, pronto para compor); estúdio infinito é opção no Cenário
    await VE3DAPI.modelo({ embalagem: 'pote', cena: LUXC.m.id });   // começa com um produto no centro (troca no painel)
    await VE3DAPI.estudio3pontos({ cena: LUXC.m.id });
    LUXC.desfazer = []; LUXC.sujo = false;
}
// Ctrl+Z / Ctrl+Shift+Z da Lux: fotos da cena (c3d + duração), separadas do histórico do Editor
function luxDesfazer(volta = false) {
    const de = volta ? LUXC.refazer : LUXC.desfazer, para = volta ? LUXC.desfazer : LUXC.refazer;
    if (!LUXC.m || !de.length) return;
    para.push(luxFoto());
    const f = JSON.parse(de.pop()), m = LUXC.m;
    m.c3d = f.c3d; m.dur = f.dur; m.info.duration = f.dur; LUXC.sujo = true; luxGuardarLogo();
    const so = VE3T.so, existe = ['camera', 'luz', 'cenario'].includes(so) || m.c3d.modelos.some(x => x.id === so);
    VE3T.chave = ''; ve3dTelaSelecionar(existe ? so : 'camera');
}
// troca de aba (switchTool): entrar na aba da Lux abre a cena; sair dela pausa a tela (a cena fica na casa)
function luxAoTrocar(id) {
    if (LUX.abrindo) return;
    if (id === 'lux-kanivete') { if (!V3.casa) luxAbrir(); return; }
    if (!V3.casa) return;
    luxGuardar(); ve3dTelaParar(); cancelAnimationFrame(VE3T.raf);
    if (VE3T.tc) VE3T.tc.detach();
    VE3T.el.hidden = true; VE3T.lux = false; V3.casa = null;
}
// a janela da Lux fechou (Fechar / Esc): guarda o rascunho e volta ao lobby (como fechar o projeto nas outras)
function luxSaiu() {
    luxGuardar(); V3.casa = null; LUX.naCena = false;
    luxLobby();
}
// da Lux para o Editor: uma CÓPIA da cena entra na timeline, na agulha (a Lux continua com a dela)
function luxParaEditor() {
    const m = LUXC.m; if (!m) return;
    const cena = JSON.parse(JSON.stringify(m.c3d)), dur = +m.dur || 5, nome = m.name;
    VE3T.lux = false; ve3dTelaFechar(); luxGuardar(); V3.casa = null; LUX.naCena = false;
    switchTool('video-cutter');
    setTimeout(() => {
        try { ve3dNova({ cena, dur, nome }); ve3dPainel(); veToast(veT('Cena da Lux na timeline')); }
        catch (e) { veToast(e.message || String(e)); }
    }, 60);
}
window.LUX_API = { abrir: luxAbrir, nova: () => luxAbrir({ nova: true }), casa: () => LUXC };
