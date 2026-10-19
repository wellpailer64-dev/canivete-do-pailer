// Plugins VST3 no Vídeo Kanivete (Functions/vst3.py — carregador próprio, num processo à parte).
// Menu Janela › Plugins: os efeitos de áudio VST3 instalados no PC (C:\Program Files\Common Files\VST3); clicar abre a
// janela do próprio plugin. A lista é procurada uma vez (abre cada DLL num processo separado) e guardada;
// "Procurar de novo" refaz. Próxima etapa: o plugin no Rack de efeitos da trilha (som da timeline passando por ele).

const VEPLG = { lista: null, procurando: false, erro: '' };

// Plugin VST3 num espaço do Rack de efeitos da trilha (editor-mixer.js). v = {caminho, cid, nome, fab, estado (base64:
// o ajuste do plugin, vai no projeto)}; o espaço (slot) é o id do efeito. Um processo por espaço (main.py ve_vst3_slot):
// ele processa o som da prévia (veVst*, abaixo) e mostra a janela do plugin num painel.
VE_AFX.vst3 = { nome: 'Plugin VST3', cat: 'Plugins VST3', tag: 'VST3', livre: true, params: [], neutro: () => false };

// o efeito do espaço sid nas trilhas de áudio → {k (trilha), f}
function vePlgSlot(sid) {
    for (let k = 0; k < (VE_TRK.a || []).length; k++) {
        const f = ((VE_TRK.a[k] || {}).fx || []).find(x => x.id === sid);
        if (f) return { k, f };
    }
    return null;
}

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

// item "Plugins ›" do menu Janela: passar o mouse abre a lista ao lado (como o Premiere). editor-dock.js chama e redesenha
// o menu com `redesenhar` quando a lista chega
function vePlgMenuHtml(redesenhar) {
    if (VEPLG.lista == null && !VEPLG.procurando) vePlgProcurar(false, () => { redesenhar(); vePlgReabrir(); });
    const esc = s => veEsc(String(s || ''));
    let itens;
    if (VEPLG.lista == null) itens = '<div class="ve-menu-empty">Procurando plugins…</div>';
    else if (!VEPLG.lista.length) itens = '<div class="ve-menu-empty">Nenhum plugin VST3 instalado</div>';
    else {
        itens = VEPLG.lista.map((p, i) => p.erro
            ? `<button disabled title="${esc(p.erro)}"><b>!</b>${esc(p.nome)} <small>(não abriu)</small></button>`
            : `<button data-m="plg:${i}" title="${esc(p.caminho)}"><b>♪</b>${esc(p.nome)} <small>${esc(p.fabricante)}</small></button>`).join('');
    }
    const n = VEPLG.lista ? VEPLG.lista.filter(p => !p.erro).length : 0;
    return `<hr><div class="ve-plg-wrap" onmouseenter="vePlgFly(this, true)" onmouseleave="vePlgFly(this, false)">
        <button data-m="plg-sub" class="ve-plg-sub"><b>♪</b>Plugins${n ? ` <small>${n}</small>` : ''}<i>›</i></button>
        <div class="ve-menu ve-plg-fly" hidden><div class="ve-menu-h">VST3</div>${itens}<hr>
        <button data-m="plg-procurar"><b>↻</b>${VEPLG.procurando ? 'Procurando…' : 'Procurar plugins de novo'}</button></div></div>`;
}

// abre/fecha a lista ao lado do item (fixa na tela: o menu tem rolagem e cortaria uma lista "absoluta")
function vePlgFly(wrap, abrir) {
    const fly = wrap && wrap.querySelector('.ve-plg-fly'); if (!fly) return;
    clearTimeout(VEPLG.tFly);
    if (!abrir) { VEPLG.tFly = setTimeout(() => { fly.hidden = true; VEPLG.fly = false; wrap.classList.remove('on'); }, 450); return; }   // folga para ir em diagonal até a lista
    VEPLG.fly = true; wrap.classList.add('on');
    fly.hidden = false;
    const r = wrap.getBoundingClientRect(), w = fly.offsetWidth, h = fly.offsetHeight, W = window.innerWidth, H = window.innerHeight;
    fly.style.left = (r.right + 2 + w > W - 6 ? Math.max(6, r.left - w - 2) : r.right + 2) + 'px';
    fly.style.top = Math.max(6, Math.min(r.top - 6, H - h - 8)) + 'px';
}
// a lista chegou com o mouse em cima: reabre a lista no menu redesenhado
function vePlgReabrir() { if (VEPLG.fly) vePlgFly(document.querySelector('.ve-menu .ve-plg-wrap'), true); }

// clique num item: true = fecha o menu
function vePlgMenuClique(k, redesenhar) {
    if (k === 'plg-sub') { vePlgFly(document.querySelector('.ve-menu .ve-plg-wrap'), true); return false; }
    if (k === 'plg-procurar') { vePlgProcurar(true, () => { redesenhar(); vePlgReabrir(); }); redesenhar(); vePlgReabrir(); return false; }
    const p = VEPLG.lista && VEPLG.lista[+k.slice(4)];
    if (!p) return true;
    vePlgPainel(p);
    return true;
}

// ── plugin num PAINEL do editor (encaixar, soltar, maximizar, como os outros) ──
// O painel é registrado na hora no sistema de painéis (editor-dock.js: VED.ids/VED.el; não volta sozinho ao reabrir o
// app). A área .ve-plg-area é vigiada: posição/tamanho em px reais, janela onde está e se está à vista — o processo do
// plugin (Functions/vst3.py encaixar) põe a janela dele exatamente ali, como subjanela da janela do KANIVETE.
// Janela nativa fica por cima da página: menu, janelinha ou aviso do KANIVETE por cima da área esconde o plugin.
const VEPLG_P = {};   // id do painel → {p (plugin), ultimo (JSON do último envio), estado, saiu}

function vePlgId(p) {
    let h = 0; const s = p.caminho + '|' + p.cid;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'plg-' + (h >>> 0).toString(36);
}
// janela do plugin de um espaço do Rack, num painel (o processo do espaço continua tocando quando o painel fecha)
async function vePlgSlotPainel(sid) {
    const s = vePlgSlot(sid); if (!s) return;
    const id = 'plgs-' + sid;
    if (VED.el[id]) { vedShow(id); return; }
    const api = window.pywebview && window.pywebview.api; if (!api || !api.ve_vst3_slot) return;
    const p = { caminho: s.f.v.caminho, cid: s.f.v.cid, nome: s.f.v.nome };
    vePlgPainelCriar(id, `${p.nome} · A${s.k + 1}`, p, sid);
    const r = await api.ve_vst3_slot(sid, { caminho: p.caminho, cid: p.cid }, s.f.v.estado || '');
    if (!r || !r.success) vePlgMsg(id, `${p.nome}: ${(r && r.error) || '?'}`);
    else if (r.janela === false) vePlgMsg(id, `${p.nome} ${veT('não tem janela')}`);
}
function vePlgSlotFechar(sid) {
    const api = window.pywebview && window.pywebview.api;
    const id = 'plgs-' + sid;
    if (VEPLG_P[id]) { VEPLG_P[id].slotFechando = true; vePlgFechar(id); }
    if (api && api.ve_vst3_slot_fechar) api.ve_vst3_slot_fechar(sid);
    if (typeof veVstLaneFechar === 'function') veVstLaneFechar(sid);
}
function vePlgPainelCriar(id, titulo, p, slot) {
    const el = document.createElement('div');
    el.className = 've-panel ve-plg-painel';
    el.dataset.panel = id;
    el.dataset.title = titulo;
    el.innerHTML = `<div class="ve-plg-area"><div class="ve-plg-msg">${veEsc(veT('Abrindo'))} ${veEsc(p.nome)}…</div></div>`;
    document.getElementById('ve-dock-store').appendChild(el);
    VED.ids.push(id); VED.el[id] = el;
    VEPLG_P[id] = { p, slot: slot || null, ultimo: '', estado: 'abrindo', saiu: 0 };
    if (!vedFloat(id, { x: window.screenX + 160, y: window.screenY + 140, w: 980, h: 620 })) vedShow(id);
    vePlgVigiar();
}
function vePlgPainel(p) {
    const id = vePlgId(p);
    if (!VED.el[id]) vePlgPainelCriar(id, p.nome, p, null);   // abre solto (como no Premiere); a aba encaixa no layout
    else vedShow(id);
    vePlgVigiar();
}

// janela (nativa) onde está um documento: a principal ou o título da janela solta
function vePlgJanelaDe(doc) {
    if (doc === document) return 'principal';
    const h = vedFloats().find(h => { try { return h.win && h.win.document === doc; } catch (e) { return false; } });
    return h ? vedWinTitle(h) : null;
}
function vePlgCoberto(doc, r) {
    return [...doc.querySelectorAll('.ve-menu, .ve-mbar-menu, .ve-modal:not([hidden]), .ve-ctx, .vero:not([hidden]), .ve-toast')].some(m => {
        const b = m.getBoundingClientRect();
        return b.width > 0 && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
    });
}
function vePlgVigiar() {
    if (VEPLG.vig) return;
    VEPLG.vig = setInterval(() => {
        const api = window.pywebview && window.pywebview.api; if (!api || !api.ve_vst3_painel) return;
        const ids = Object.keys(VEPLG_P);
        if (!ids.length) { clearInterval(VEPLG.vig); VEPLG.vig = 0; return; }
        ids.forEach(id => {
            const s = VEPLG_P[id], el = VED.el[id], area = el && el.querySelector('.ve-plg-area');
            if (!area) return;
            // aba fechada (fora do layout) por um tempo: fecha o plugin e tira o painel
            if (!vedLocate(id)) {
                if (!s.saiu) s.saiu = Date.now();
                else if (Date.now() - s.saiu > 800) { vePlgFechar(id); return; }
            } else s.saiu = 0;
            const doc = area.ownerDocument, w = doc.defaultView, r = area.getBoundingClientRect(), dpr = w.devicePixelRatio || 1;
            const janela = vePlgJanelaDe(doc);
            const vis = !!janela && area.offsetParent !== null && doc.visibilityState === 'visible' && r.width > 30 && r.height > 30 && !vePlgCoberto(doc, r);
            const rect = [r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr].map(Math.round);
            const chave = JSON.stringify([janela, rect, vis]);
            if (chave !== s.ultimo && !(s.enviando)) {
                s.ultimo = chave; s.enviando = true;
                const pedido = s.slot ? api.ve_vst3_slot_painel(s.slot, janela || 'principal', rect, vis)
                    : api.ve_vst3_painel(id, { caminho: s.p.caminho, cid: s.p.cid }, janela || 'principal', rect, vis);
                pedido.then(res => {
                    s.enviando = false;
                    if (res && res.caiu) vePlgMsg(id, `${s.p.nome}: ${res.error}`);
                    if (s.slot && res && !res.success && !res.caiu) s.ultimo = '';   // processo ainda subindo: manda de novo
                    if (s.slot && res && res.tam && !s.ajustou) { s.ajustou = true; s.estado = 'pronto'; vePlgCaber(id, res.tam); }
                    // o tamanho do plugin chega depois que a janela dele abre: pergunta de novo até saber
                    if (s.slot && !s.ajustou) setTimeout(() => { s.ultimo = ''; }, 400);
                }).catch(() => { s.enviando = false; });
            }
            // mensagem "Abrindo…" some quando o plugin aparece (fica embaixo dele de qualquer jeito)
            if (!s.slot && s.estado !== 'pronto' && !s.consultando) {
                s.consultando = true;
                api.ve_vst3_painel_estado(id).then(e => {
                    s.consultando = false;
                    if (!e) return;
                    s.estado = e.estado;
                    if (e.estado === 'caiu') vePlgMsg(id, `${s.p.nome} ${veT('fechou')}: ${e.erro || ''}`);
                    if (e.estado === 'pronto' && e.tam && !s.ajustou) { s.ajustou = true; vePlgCaber(id, e.tam); }
                });
            }
        });
    }, 120);
}
// 1ª abertura, sozinho numa janela solta: a janela cresce/encolhe para caber o plugin (tam em px reais)
function vePlgCaber(id, tam) {
    const h = vedFloats().find(h => h.win && vedPanelsOf(h.root).length === 1 && vedPanelsOf(h.root)[0] === id);
    const area = VED.el[id] && VED.el[id].querySelector('.ve-plg-area');
    if (!h || !area) return;
    const api = vedApi();
    if (!api.ve_win_rect || !api.ve_win_place) return;
    const titulo = vedWinTitle(h), w = h.win, dpr = w.devicePixelRatio || 1, r = area.getBoundingClientRect();
    // a janela solta é nativa (o resizeTo da página não vale): mede em px reais e reposiciona pelo Python
    api.ve_win_rect(titulo).then(b => {
        if (!b || b.max) return;
        const dw = tam[0] - r.width * dpr, dh = tam[1] - r.height * dpr;   // quanto falta (ou sobra) na área
        const W = Math.max(480, Math.min(w.screen.availWidth * dpr - 40, b.w + dw)), H = Math.max(320, Math.min(w.screen.availHeight * dpr - 40, b.h + dh));
        api.ve_win_place(titulo, b.x, b.y, Math.round(W), Math.round(H), false);
    }).catch(() => {});
}
function vePlgMsg(id, txt) {
    const m = VED.el[id] && VED.el[id].querySelector('.ve-plg-msg');
    if (m) m.textContent = txt;
}
function vePlgFechar(id) {
    const api = window.pywebview && window.pywebview.api, s = VEPLG_P[id];
    // painel de um espaço do Rack: só a janela some (o processo continua processando o som da trilha)
    if (s && s.slot) { if (api && api.ve_vst3_slot_fechar_painel && !s.slotFechando) api.ve_vst3_slot_fechar_painel(s.slot); }
    else if (api && api.ve_vst3_painel_fechar) api.ve_vst3_painel_fechar(id);
    const el = VED.el[id];
    delete VEPLG_P[id];
    if (vedLocate(id)) { vedClose(id); }
    VED.ids = VED.ids.filter(x => x !== id);
    delete VED.el[id];
    if (el) el.remove();
}

function vePlgAbrir(p) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_vst3_abrir) return;
    veToast(`Abrindo ${p.nome}…`);
    api.ve_vst3_abrir(p.caminho, p.cid, p.nome).then(r => {
        if (!r || !r.success) veToast(`Não abriu ${p.nome}: ${(r && r.error) || '?'}`);
    });
}

// Mexeram na janela de um plugin do Rack: o ajuste novo vai para o projeto (sem entrar no desfazer, como o Mixer);
// espaço que caiu avisa uma vez. Consulta a cada 0,6 s enquanto houver plugin no Rack.
function vePlgNovidades() {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_vst3_slot_novidades || VEPLG.consultandoN) return;
    VEPLG.consultandoN = true;
    api.ve_vst3_slot_novidades().then(nov => {
        VEPLG.consultandoN = false;
        Object.entries(nov || {}).forEach(([sid, d]) => {
            const s = vePlgSlot(sid); if (!s) return;
            if (d.estado) {
                s.f.v = { ...s.f.v, estado: d.estado };
                if (VEVST.slots[sid]) VEVST.slots[sid].estado = d.estado;   // o processo já tem esse ajuste
                if (!VE.dirty) { VE.dirty = true; veUpdateTitle(); }
            }
            if (d.caiu) { veToast(`${s.f.v.nome} ${veT('fechou')}: ${d.caiu}`); veVstLaneFechar(sid); }
        });
    }).catch(() => { VEPLG.consultandoN = false; });
}
setInterval(() => {
    if (typeof VE_TRK === 'undefined') return;
    const fx = (VE_TRK.a || []).flatMap(t => (t && t.fx) || []).filter(f => f.t === 'vst3');
    if (!fx.length) return;
    vePlgNovidades();
    // o processo de cada plugin do Rack sobe JÁ (abrir um plugin leva 1–2 s): o play não espera por ele
    fx.filter(f => f.on !== false && !VEVST.slots[f.id]).forEach(f => veVstSlot({ v: { ...f.v, slot: f.id } }));
}, 600);

// para testes e para a Kani: VEPLG_API.lista(atualizar) → Promise, .abrir(nome) (janela à parte), .painel(nome),
// .fechar(nome), .paineis()
const vePlgAchar = nome => (VEPLG.lista || []).find(x => !x.erro && (x.nome || '').toLowerCase().includes(String(nome).toLowerCase()));
window.VEPLG_API = {
    lista: atualizar => new Promise(ok => vePlgProcurar(atualizar, () => ok(VEPLG.lista))),
    abrir: nome => { const p = vePlgAchar(nome); if (p) vePlgAbrir(p); return !!p; },
    painel: nome => { const p = vePlgAchar(nome); if (p) vePlgPainel(p); return p ? vePlgId(p) : null; },
    fechar: nome => { const p = vePlgAchar(nome); if (p && VEPLG_P[vePlgId(p)]) vePlgFechar(vePlgId(p)); },
    paineis: () => Object.entries(VEPLG_P).map(([id, s]) => ({ id, nome: s.p.nome, estado: s.estado, onde: s.ultimo })),
};

// ───────────────────────── som da prévia passando pelos plugins do Rack ─────────────────────────
// Como os DAWs (o plugin num processo à parte, como o Bitwig): para cada trilha com plugin VST3 no Rack, uma "faixa"
// vai À FRENTE da agulha: mixa só os clipes dela (veAudioMixarBruto com `so`), passa a soma pela cadeia do Rack (efeitos
// do Kanivete aqui mesmo, cada VST no processo dele por HTTP local) e guarda o som pronto, alinhado pelo atraso dos
// plugins. O mixador (editor-audio.js) só aplica fader/pan (veVstMixar) e, se a faixa ainda não chegou ao próximo
// pedaço, espera (veVstPronto) — a fila de 0,3 s segura. Começo e edição da trilha: o plugin limpa a cauda (reset) e
// toca 0,5 s antes ("pré-rolagem"), para reverb/compressor entrarem certos. Plugin que cai: a trilha segue sem ele.
const VE_VST_BLOCO = 4096;             // quadros por pedido (85 ms)
const VE_VST_ADIANTE = 0.35 * 48000;   // quadros prontos à frente do que já foi para a placa de som
const VE_VST_PRE = 0.5 * 48000;        // pré-rolagem
const VEVST = { lanes: {}, slots: {}, geracao: 0 };

const veVstSemEstado = (k, v) => (k === 'estado' ? undefined : v);
// a trilha vai pela faixa À FRENTE: plugin VST3 no Rack, ou Hard Limiter no Rack (ele antecipa o som: precisa de
// mixar adiante e compensar, como o do Master)
const veVstPrecisa = bus => !!bus && bus.some(f => f.t === 'vst3' || f.t === 'limiter');
// trilhas com faixa (no que está tocando): tr → v do 'trk' (g, p, bus)
function veVstTrilhas() {
    const out = {};
    for (const cl of VEAU.clipes || []) {
        const trk = (cl[9] || []).find(f => f.t === 'trk');
        if (trk && veVstPrecisa(trk.v.bus)) out[trk.v.tr] = trk.v;
    }
    return out;
}
const veVstTemPlugin = fx => { const trk = fx && fx.find(f => f.t === 'trk'); return !!(trk && veVstPrecisa(trk.v.bus)); };

function veVstReset() { VEVST.lanes = {}; VEVST.geracao++; }
function veVstLaneFechar(sid) {
    delete VEVST.slots[sid];
    Object.values(VEVST.lanes).forEach(l => { if (l.v.bus.some(f => f.v && f.v.slot === sid)) l.reiniciar = true; });
}

// processo do espaço (sobe na 1ª vez; o ajuste do projeto vai junto)
async function veVstSlot(f) {
    const sid = f.v.slot, S = VEVST.slots[sid];
    if (S && S.porta) {
        // ajuste mudou por fora (desfazer, abrir projeto): o processo recebe o do projeto
        if (f.v.estado && S.estado !== f.v.estado) { S.estado = f.v.estado; window.pywebview.api.ve_vst3_slot_restaurar(sid, f.v.estado); }
        return S;
    }
    if (S && S.subindo) return S.subindo;
    if (S && S.erro) return S;
    const api = window.pywebview.api;
    const prom = api.ve_vst3_slot(sid, { caminho: f.v.caminho, cid: f.v.cid }, f.v.estado || '').then(r => {
        if (!r || !r.success) { veToast(`${f.v.nome}: ${(r && r.error) || '?'}`); return (VEVST.slots[sid] = { erro: (r && r.error) || '?' }); }
        return (VEVST.slots[sid] = { porta: r.porta, token: r.token, atraso: r.atraso || 0, estado: f.v.estado || '', reset: false });
    });
    VEVST.slots[sid] = { subindo: prom };
    return prom;
}

async function veVstProcessar(S, a, l, r) {
    const n = l.length, corpo = new Float32Array(2 * n);
    corpo.set(l, 0); corpo.set(r, n);
    const reset = S.reset ? 1 : 0;
    S.reset = false;
    const resp = await fetch(`http://127.0.0.1:${S.porta}/p?k=${S.token}&a=${a}&reset=${reset}`,
        { method: 'POST', body: corpo, headers: { 'Content-Type': 'text/plain' } });
    if (!resp.ok) throw new Error(await resp.text());
    const out = new Float32Array(await resp.arrayBuffer());
    return [out.subarray(0, n), out.subarray(n)];
}

// enche as faixas até VE_VST_ADIANTE à frente (chamado a cada 20 ms pelo veAudioAlimentar e ao fim de cada pedido)
function veVstAdiantar() {
    if (!VEAU.tocando || VEAU.esperando) return;
    const trs = veVstTrilhas(), passo = VEAU.taxa / VE_AU_SR;
    Object.keys(VEVST.lanes).forEach(tr => { if (!trs[tr]) delete VEVST.lanes[tr]; });
    for (const tr in trs) {
        const v = trs[tr];
        const sig = JSON.stringify([(VEAU.clipes || []).filter(c => { const t = (c[9] || []).find(f => f.t === 'trk'); return t && t.v.tr === +tr; }), VEAU.base, VEAU.taxa], veVstSemEstado);
        let L = VEVST.lanes[tr];
        if (!L || L.sig !== sig || L.reiniciar) {
            if (L && L.pedindo) { L.reiniciar = true; continue; }   // espera o pedido em voo terminar
            // começa (de novo) onde a placa ainda não tocou: pré-rolagem antes, cauda dos plugins limpa
            const ini = VEAU.escritos;
            const novo = { tr: +tr, v, sig, ate: ini - VE_VST_PRE, ini, blocos: [], lat: 0, st: {}, pedindo: false, gen: VEVST.geracao };
            // o que já estava pronto antes do ponto do recomeço continua (a fila da placa ainda vai tocar)
            if (L) novo.blocos = L.blocos.filter(b => b.i + b.l.length <= ini);
            novo.pronto = ini;
            L = VEVST.lanes[tr] = novo;
            v.bus.filter(f => f.t === 'vst3').forEach(f => { const S = VEVST.slots[f.v.slot]; if (S && S.porta) S.reset = true; });
        }
        if (L.pedindo || L.ate - L.lat >= VEAU.escritos + VE_VST_ADIANTE) continue;
        L.pedindo = true;
        veVstBloco(L, passo).catch(e => { L.erro = String(e); console.warn('[vst3]', e); }).finally(() => {
            L.pedindo = false;
            if (VEAU.tocando) veVstAdiantar();
        });
    }
}

async function veVstBloco(L, passo) {
    const a = L.ate, n = VE_VST_BLOCO, gen = L.gen;
    const t = VEAU.base + a * passo;
    const bus = veAudioMixarBruto(t, n, L.tr);   // a soma dos clipes da trilha, antes do Rack
    let l = bus.l, r = bus.r, lat = 0;
    for (let j = 0; j < L.v.bus.length; j++) {
        const f = L.v.bus[j];
        if (f.t === 'vst3') {
            const S = await veVstSlot(f);
            if (!S || !S.porta) continue;   // plugin fora do ar: a trilha segue sem ele
            try { [l, r] = await veVstProcessar(S, a - lat, l, r); lat += S.atraso || 0; }
            catch (e) { console.warn('[vst3]', f.v.nome, e); }
            continue;
        }
        // efeito do Kanivete no meio da cadeia: aqui mesmo, amostra a amostra (estado e memória continuam de um bloco ao
        // outro); o Hard Limiter atrasa o som pela antecipação dele (entra no atraso total, como um plugin)
        const E = L.st[j] || (L.st[j] = { st: {} }), fx = [f];
        const ol = new Float32Array(n), orr = new Float32Array(n);
        if (f.t === 'limiter') {
            const lim = E.lim || (E.lim = new VeLimitador(f.v));
            for (let i = 0; i < n; i++) { const y = lim.passo(l[i], r[i]); ol[i] = y[0]; orr[i] = y[1]; }
            lat += lim.L;
        } else {
            veBusTap(E);
            for (let i = 0; i < n; i++) { const y = veBusPasso(E, fx, l[i], r[i]); ol[i] = y[0]; orr[i] = y[1]; }
        }
        l = ol; r = orr;
    }
    if (VEVST.lanes[L.tr] !== L || gen !== VEVST.geracao) return;   // a faixa recomeçou enquanto o pedido voava
    L.lat = lat;
    // depois de um recomeço, o que vem antes do ponto (pré-rolagem) não entra: lá vale o som antigo já pronto
    const ini = Math.max(a - lat, L.pronto != null ? L.pronto : -Infinity), corte = ini - (a - lat);
    if (corte < n) L.blocos.push({ i: ini, l: Float32Array.from(l.subarray(corte)), r: Float32Array.from(r.subarray(corte)) });
    L.ate = a + n;
    const velho = VEAU.lidos - VE_AU_SR;   // o que a placa já tocou há mais de 1 s sai
    while (L.blocos.length > 2 && L.blocos[0].i + L.blocos[0].l.length < velho) L.blocos.shift();
}

// a faixa já tem o som pronto para os quadros [i, i + n)?
function veVstPronto(i, n) {
    for (const tr in VEVST.lanes) {
        const L = VEVST.lanes[tr];
        if (L.erro) continue;
        if (L.ate - L.lat < i + n) return false;
    }
    return true;
}

// som pronto das faixas no pedaço que o mixador está fazendo (t, n): fader e pan da trilha, como no veBusMixar
function veVstMixar(t, n, passo, L, R) {
    const i0 = Math.round((t - VEAU.base) / passo);
    for (const tr in VEVST.lanes) {
        const F = VEVST.lanes[tr], v = F.v, g = Math.pow(10, (v.g || 0) / 20), p = (v.p || 0) / 100;
        const gl = g * (p > 0 ? 1 - p : 1), gr = g * (p < 0 ? 1 + p : 1);
        const P = VEAU.pk ? (VEAU.pk[tr] || (VEAU.pk[tr] = [0, 0])) : null;
        for (const b of F.blocos) {
            const ini = Math.max(i0, b.i), fim = Math.min(i0 + n, b.i + b.l.length);
            for (let i = ini; i < fim; i++) {
                const l = b.l[i - b.i] * gl, r = b.r[i - b.i] * gr;
                L[i - i0] += l; R[i - i0] += r;
                if (P) { const x = Math.abs(l), y = Math.abs(r); if (x > P[0]) P[0] = x; if (y > P[1]) P[1] = y; }
            }
        }
    }
}

// antes de começar a tocar: as faixas enchem o começo (no máximo 6 s: o processo do plugin ainda subindo)
async function veVstEsperar() {
    if (!Object.keys(veVstTrilhas()).length) return;
    veVstAdiantar();
    const t0 = performance.now();
    while (VEAU.tocando && !veVstPronto(VEAU.escritos, VE_AU_CHUNK * 4) && performance.now() - t0 < 6000) {
        await new Promise(r => setTimeout(r, 15));
        veVstAdiantar();
    }
}
