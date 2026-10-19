// Plugins VST3 no Vídeo Kanivete (Functions/vst3.py — carregador próprio, num processo à parte).
// Menu Janela › Plugins: os efeitos de áudio VST3 instalados no PC (C:\Program Files\Common Files\VST3); clicar abre a
// janela do próprio plugin. A lista é procurada uma vez (abre cada DLL num processo separado) e guardada;
// "Procurar de novo" refaz. Próxima etapa: o plugin no Rack de efeitos da trilha (som da timeline passando por ele).

const VEPLG = { lista: null, procurando: false, erro: '' };

function vePlgProcurar(atualizar, aoTerminar) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_vst3_lista || VEPLG.procurando) return;
    VEPLG.procurando = true;
    api.ve_vst3_lista(!!atualizar).then(r => {
        VEPLG.procurando = false;
        VEPLG.lista = (r && r.plugins) || [];
        VEPLG.erro = r && !r.success ? (r.error || '?') : '';
        if (aoTerminar) aoTerminar();
    }).catch(e => { VEPLG.procurando = false; VEPLG.erro = String(e); if (aoTerminar) aoTerminar(); });
}

// seção do menu Janela (editor-dock.js chama e redesenha o menu com `redesenhar` quando a lista chega)
function vePlgMenuHtml(redesenhar) {
    if (VEPLG.lista == null && !VEPLG.procurando) vePlgProcurar(false, redesenhar);
    const esc = s => veEsc(String(s || ''));
    let itens;
    if (VEPLG.lista == null) itens = '<div class="ve-menu-empty">Procurando plugins…</div>';
    else if (!VEPLG.lista.length) itens = '<div class="ve-menu-empty">Nenhum plugin VST3 instalado</div>';
    else {
        itens = VEPLG.lista.map((p, i) => p.erro
            ? `<button disabled title="${esc(p.erro)}"><b>!</b>${esc(p.nome)} <small>(não abriu)</small></button>`
            : `<button data-m="plg:${i}" title="${esc(p.fabricante)} · ${esc(p.caminho)}"><b>♪</b>${esc(p.nome)} <small>${esc(p.fabricante)}</small></button>`).join('');
    }
    return '<hr><div class="ve-menu-h">Plugins <small>VST3</small></div>' + itens +
        `<button data-m="plg-procurar"><b>↻</b>${VEPLG.procurando ? 'Procurando…' : 'Procurar plugins de novo'}</button>`;
}

// clique num item da seção: true = fecha o menu
function vePlgMenuClique(k, redesenhar) {
    if (k === 'plg-procurar') { vePlgProcurar(true, redesenhar); redesenhar(); return false; }
    const p = VEPLG.lista && VEPLG.lista[+k.slice(4)];
    if (!p) return true;
    vePlgAbrir(p);
    return true;
}

function vePlgAbrir(p) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_vst3_abrir) return;
    veToast(`Abrindo ${p.nome}…`);
    api.ve_vst3_abrir(p.caminho, p.cid, p.nome).then(r => {
        if (!r || !r.success) veToast(`Não abriu ${p.nome}: ${(r && r.error) || '?'}`);
    });
}

// para testes e para a Kani: VEPLG_API.lista(atualizar) → Promise, .abrir(nome)
window.VEPLG_API = {
    lista: atualizar => new Promise(ok => vePlgProcurar(atualizar, () => ok(VEPLG.lista))),
    abrir: nome => { const p = (VEPLG.lista || []).find(x => (x.nome || '').toLowerCase().includes(String(nome).toLowerCase())); if (p) vePlgAbrir(p); return !!p; },
};
