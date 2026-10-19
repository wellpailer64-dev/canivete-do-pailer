// =========================================================
// Sound Kanivete — plugins de áudio VST3 na faixa (carregador próprio Functions/vst3.py, cada plugin num processo à parte).
// f.plug = [{id, caminho, cid, nome, fab, estado (base64 do ajuste), on}] no FIM da cadeia da faixa (depois do reverb),
// antes do volume. Painel da faixa › Plugins VST3: + escolhe entre os instalados (os arquivados no Vídeo ficam de fora),
// liga/desliga, ▲▼, abrir a janela do plugin (dentro do app, numa caixa solta) e tirar.
// Prévia = faixa CONGELADA (como nos programas de áudio): o Python monta os clipes + a cadeia do Kanivete e passa pelos
// plugins (sound_kanivete.congelar_faixa), e o motor toca esse arquivo no lugar dos clipes, sem a cadeia ao vivo (já está
// nele). Mexeu na faixa ou no plugin: enquanto refaz (~1 s por 10 s de faixa), toca sem o plugin e o painel avisa.
// A exportação usa o MESMO arquivo (cache pelo conteúdo).
// =========================================================
SK.plg = { lista: null, procurando: false, frz: {}, jan: null, timer: 0 };

const skPlgChave = p => p.caminho + '|' + (p.cid || '');
const skPlgAtivos = f => ((f && f.plug) || []).filter(p => p.on !== false && p.caminho && p.cid);
// os do Vídeo arquivados (editor-plugins.js) também somem aqui
const skPlgVisivel = p => !p.erro && !(typeof vePlgArquivado === 'function' && vePlgArquivado(p));

function skPlgProcurar(atualizar) {
    const api = skApi();
    if (!api || !api.ve_vst3_lista || SK.plg.procurando) return;
    SK.plg.procurando = true;
    api.ve_vst3_lista(!!atualizar).then(r => {
        SK.plg.procurando = false; SK.plg.lista = (r && r.plugins) || [];
        if (typeof VEPLG !== 'undefined') VEPLG.lista = SK.plg.lista;   // a mesma lista do Vídeo
        skUiProps();
    }).catch(() => { SK.plg.procurando = false; SK.plg.lista = []; });
}

// ── congelar ──
// o que muda o som congelado: clipes, cadeia e plugins ligados com os ajustes
const skFrzChave = f => JSON.stringify([f.clipes, f.fx || null, skPlgAtivos(f).map(p => [p.caminho, p.cid, p.estado || ''])]);
function skFrzPronto(f) {
    const z = SK.plg.frz[f.id];
    return !!(z && z.arq && z.ok === z.atual && skPlgAtivos(f).length);
}
// motor (som-motor.js): os clipes que tocam da faixa — o arquivo congelado, ou os clipes de verdade
function skFaixaTocar(f) {
    if (!skFrzPronto(f)) return f;
    const z = SK.plg.frz[f.id];
    return { ...f, fx: {}, clipes: [{ id: 'frz-' + f.id + '-' + z.n, arq: z.arq, ini: 0, de: 0, dur: z.dur, vol: 1, fade_in: 0, fade_out: 0, frz: true }] };
}
function skFrzVigiar() {
    if (!SK.proj) return;
    const api = skApi(); if (!api || !api.sk_congelar) return;
    for (const f of SK.proj.faixas) {
        const z = SK.plg.frz[f.id] = SK.plg.frz[f.id] || { n: 0 };
        if (!skPlgAtivos(f).length) { if (z.ok) { z.ok = null; skMotorMudou(); } continue; }
        const ch = skFrzChave(f);
        if (ch !== z.atual) {
            const estava = skFrzPronto(f);
            z.atual = ch; z.desde = Date.now();
            if (estava) skMotorMudou();   // ficou velho: volta a tocar sem o plugin até refazer
            skUiPlgStatus();
        }
        // espera a faixa parar de mudar (1,2 s; com a janela do plugin aberta, 1,5 s depois do último ajuste)
        if (z.ok === z.atual || z.fazendo || Date.now() - z.desde < 1200) continue;
        if (SK.plg.jan && SK.plg.jan.f === f.id && Date.now() - (SK.plg.jan.mexeu || 0) < 1500) continue;
        z.fazendo = ch; skUiPlgStatus();
        api.sk_congelar(JSON.parse(JSON.stringify(f)), 48000).then(r => {
            z.fazendo = null;
            if (!r || !r.success) { z.erro = (r && r.error) || '?'; z.ok = ch; z.arq = null; skToast(`Plugin na faixa ${f.nome}: ${z.erro}`); skUiPlgStatus(); return; }
            z.erro = ''; z.arq = r.arq; z.dur = r.dur; z.n++;
            z.ok = ch;
            if (z.atual === ch) skMotorMudou();
            skUiPlgStatus();
        }).catch(e => { z.fazendo = null; z.erro = String(e); });
    }
}

// ── painel da faixa ──
function skPlgHtml(f) {
    if (SK.plg.lista == null) skPlgProcurar(false);
    const plugs = f.plug || [], inst = (SK.plg.lista || []).filter(skPlgVisivel);
    const linhas = plugs.map((p, i) => `<div class="sk-plg" data-plg="${p.id}">
        <label class="sk-chk"><input type="checkbox" data-plg-on="${p.id}" ${p.on !== false ? 'checked' : ''}></label>
        <span class="notranslate" title="${skEsc(p.fab || '')}">${skEsc(p.nome)}</span>
        <button class="ie-btn ie-btn-mini" data-plg-abrir="${p.id}" title="Abrir a janela do plugin">Abrir</button>
        <button class="ie-btn ie-btn-mini" data-plg-sobe="${p.id}" ${i ? '' : 'disabled'} title="Antes">▲</button>
        <button class="ie-btn ie-btn-mini" data-plg-desce="${p.id}" ${i < plugs.length - 1 ? '' : 'disabled'} title="Depois">▼</button>
        <button class="ie-btn ie-btn-mini" data-plg-tira="${p.id}" title="Tirar da faixa">✕</button></div>`).join('');
    const opcoes = SK.plg.lista == null ? '<option>Procurando plugins…</option>'
        : `<option value="">+ Plugin VST3 (${inst.length} instalados)</option>` + inst.map(p => `<option value="${skEsc(skPlgChave(p))}">${skEsc(p.nome)} — ${skEsc(p.fabricante || '')}</option>`).join('');
    return `<div class="sk-grupo"><div class="sk-p-tit">Plugins VST3 <small id="sk-plg-status"></small></div>
        ${linhas || '<div class="sk-p-info">Nenhum plugin nesta faixa. Entram depois do reverb, antes do volume.</div>'}
        <div class="sk-p-acoes"><select id="sk-plg-add">${opcoes}</select><button class="ie-btn ie-btn-mini" data-plg-procurar="1" title="Procurar plugins de novo">↻</button></div></div>`;
}
function skUiPlgStatus() {
    const el = skEl('sk-plg-status'); if (!el || !SK.proj) return;
    const f = SK.proj.faixas.find(x => x.id === SK.faixaSel) || SK.proj.faixas[0], z = f && SK.plg.frz[f.id];
    el.textContent = !f || !skPlgAtivos(f).length ? '' : z && z.erro ? '· falhou' : skFrzPronto(f) ? '· ✓ no som' : '· ⏳ preparando (toca sem o plugin)';
}
// cliques e mudanças do bloco (som-paineis.js skUiFaixa chama primeiro); true = era do bloco
function skPlgEvento(e, f) {
    const t = e.target, d = t.dataset;
    if (e.type === 'change' && t.id === 'sk-plg-add') {
        const p = (SK.plg.lista || []).find(x => skPlgChave(x) === t.value); t.value = '';
        if (!p) return true;
        skAntes(); f.plug = [...(f.plug || []), { id: skId('pl'), caminho: p.caminho, cid: p.cid, nome: p.nome, fab: p.fabricante || '', estado: '', on: true }];
        skMudou('plugin'); return true;
    }
    if (e.type === 'change' && d.plgOn) { const p = (f.plug || []).find(x => x.id === d.plgOn); if (p) { skAntes(); p.on = t.checked; skMudou('plugin'); } return true; }
    if (e.type !== 'click') return false;
    const id = d.plgAbrir || d.plgSobe || d.plgDesce || d.plgTira;
    if (d.plgProcurar) { SK.plg.lista = null; skPlgProcurar(true); skUiProps(); return true; }
    if (!id) return false;
    const l = f.plug || [], i = l.findIndex(x => x.id === id); if (i < 0) return true;
    if (d.plgAbrir) { skPlgJanela(f, l[i]); return true; }
    skAntes();
    if (d.plgTira) { if (SK.plg.jan && SK.plg.jan.p === id) skPlgJanelaFechar(); l.splice(i, 1); }
    else { const j = d.plgSobe ? i - 1 : i + 1; [l[i], l[j]] = [l[j], l[i]]; }
    skMudou('plugin'); return true;
}

// ── janela do plugin: caixa solta dentro do app; o processo do plugin põe a janela dele exatamente na área ──
async function skPlgJanela(f, p) {
    const api = skApi(); if (!api || !api.ve_vst3_slot) return;
    if (SK.plg.jan) skPlgJanelaFechar();
    let box = skEl('sk-plg-jan');
    if (!box) {
        box = document.createElement('div'); box.id = 'sk-plg-jan'; box.className = 'sk-plg-jan';
        box.innerHTML = '<div class="sk-plg-jan-cab"><b></b><button title="Fechar">✕</button></div><div class="sk-plg-jan-area"><span>Abrindo…</span></div>';
        document.body.appendChild(box);
        box.querySelector('button').onclick = skPlgJanelaFechar;
        const cab = box.querySelector('.sk-plg-jan-cab');
        cab.onpointerdown = e => {   // arrastar pela barra
            if (e.target.closest('button')) return;
            const r = box.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
            cab.setPointerCapture(e.pointerId);
            cab.onpointermove = ev => { box.style.left = Math.max(0, ev.clientX - dx) + 'px'; box.style.top = Math.max(0, ev.clientY - dy) + 'px'; };
            cab.onpointerup = () => { cab.onpointermove = cab.onpointerup = null; };
        };
    }
    box.hidden = false;
    box.querySelector('b').textContent = `${p.nome} · ${f.nome}`;
    box.querySelector('.sk-plg-jan-area span').textContent = 'Abrindo…';
    const sid = 'sk-' + p.id;
    SK.plg.jan = { f: f.id, p: p.id, sid, ultimo: '', ajustou: false };
    const r = await api.ve_vst3_slot(sid, { caminho: p.caminho, cid: p.cid }, p.estado || '');
    if (!SK.plg.jan || SK.plg.jan.sid !== sid) return;
    if (!r || !r.success) { box.querySelector('.sk-plg-jan-area span').textContent = `Não abriu: ${(r && r.error) || '?'}`; return; }
    if (r.janela === false) box.querySelector('.sk-plg-jan-area span').textContent = `${p.nome} não tem janela`;
}
function skPlgJanelaFechar() {
    const api = skApi(), j = SK.plg.jan;
    SK.plg.jan = null;
    const box = skEl('sk-plg-jan'); if (box) box.hidden = true;
    if (j && api) { api.ve_vst3_slot_fechar_painel(j.sid); setTimeout(() => api.ve_vst3_slot_fechar(j.sid), 300); }
}
function skPlgJanelaVigiar() {
    const j = SK.plg.jan, api = skApi(); if (!j || !api) return;
    const box = skEl('sk-plg-jan'), area = box && box.querySelector('.sk-plg-jan-area');
    const pg = skEl('page-sound-kanivete');
    if (!area) return;
    const r = area.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const vis = !box.hidden && !!pg && pg.classList.contains('active') && document.visibilityState === 'visible' && r.width > 30;
    const rect = [r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr].map(Math.round);
    const chave = JSON.stringify([rect, vis]);
    if (chave !== j.ultimo && !j.enviando) {
        j.ultimo = chave; j.enviando = true;
        api.ve_vst3_slot_painel(j.sid, 'principal', rect, vis).then(res => {
            j.enviando = false;
            if (res && !res.success) j.ultimo = '';   // processo ainda subindo: manda de novo
            if (res && res.tam && !j.ajustou) {       // o tamanho do plugin: a caixa cresce para caber
                j.ajustou = true;
                const cab = box.querySelector('.sk-plg-jan-cab').offsetHeight;
                box.style.width = Math.min(window.innerWidth - 20, res.tam[0] / dpr) + 'px';
                box.style.height = Math.min(window.innerHeight - 20, res.tam[1] / dpr + cab) + 'px';
            }
            if (!j.ajustou) setTimeout(() => { j.ultimo = ''; }, 400);
        }).catch(() => { j.enviando = false; });
    }
}
// ajustes novos da janela do plugin vão para o projeto (sem entrar no desfazer, como no Mixer do Vídeo)
function skPlgNovidades() {
    const api = skApi(); if (!api || !api.ve_vst3_slot_novidades || !SK.proj || SK.plg.consultando) return;
    SK.plg.consultando = true;
    api.ve_vst3_slot_novidades('sk-').then(nov => {
        SK.plg.consultando = false;
        Object.entries(nov || {}).forEach(([sid, d]) => {
            const pid = sid.slice(3);
            for (const f of SK.proj.faixas) for (const p of (f.plug || [])) if (p.id === pid) {
                if (d.estado) { p.estado = d.estado; SK.sujo = true; if (SK.plg.jan && SK.plg.jan.p === pid) SK.plg.jan.mexeu = Date.now(); }
                if (d.caiu) { skToast(`${p.nome} fechou: ${d.caiu}`); if (SK.plg.jan && SK.plg.jan.p === pid) skPlgJanelaFechar(); }
            }
        });
    }).catch(() => { SK.plg.consultando = false; });
}
setInterval(skPlgJanelaVigiar, 150);
setInterval(() => { if (SK.plg.jan) skPlgNovidades(); skFrzVigiar(); }, 500);

// para testes e para a Kani: SKN_PLG.lista(atualizar), .por(faixaId, nome), .estado(faixaId)
window.SKN_PLG = {
    lista: atualizar => new Promise(ok => { SK.plg.lista = null; skPlgProcurar(!!atualizar); const t = setInterval(() => { if (SK.plg.lista) { clearInterval(t); ok(SK.plg.lista); } }, 200); }),
    por: (faixaId, nome) => {
        const f = SK.proj && SK.proj.faixas.find(x => x.id === faixaId), p = (SK.plg.lista || []).find(x => skPlgVisivel(x) && (x.nome || '').toLowerCase().includes(String(nome).toLowerCase()));
        if (!f || !p) return null;
        skAntes(); const novo = { id: skId('pl'), caminho: p.caminho, cid: p.cid, nome: p.nome, fab: p.fabricante || '', estado: '', on: true };
        f.plug = [...(f.plug || []), novo]; skMudou('plugin'); return novo.id;
    },
    estado: faixaId => { const f = SK.proj && SK.proj.faixas.find(x => x.id === faixaId), z = f && SK.plg.frz[f.id]; return f ? { pronto: skFrzPronto(f), fazendo: !!(z && z.fazendo), erro: z && z.erro, arq: z && z.arq } : null; },
};
