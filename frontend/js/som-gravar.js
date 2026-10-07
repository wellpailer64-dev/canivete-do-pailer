// =========================================================
// Sound Kanivete — gravar do microfone (Functions/sk_gravar.py: sounddevice → WAV 24 bits gravado direto no disco) e
// salvamento automático/recuperação (Functions/sound_kanivete.auto_*).
// Gravar: entra na faixa escolhida a partir da agulha; as outras faixas tocam junto (sem compensar a latência da
// placa ainda). Aba Gravar aberta = entrada aberta só medindo o nível.
// =========================================================
SK.grav = null; SK.mon = null;

async function skMonitorarEntrada(ligar) {
    if (SK.grav) return;
    clearInterval(SK.monTimer); SK.monTimer = 0;
    if (!ligar) { if (SK.mon) { SK.mon = null; await skApi().sk_gravar('parar'); } return; }
    const r = await skApi().sk_gravar('iniciar', SK.micDev ?? null, null, 48000, SK.micCan || 1);
    if (!r.success) { SK.mon = { erro: r.error }; skDockRender(['gravar']); return; }
    SK.mon = { pico: -120 };
    SK.monTimer = setInterval(skLerEntrada, 100);
}
async function skLerEntrada() {
    const e = await skApi().sk_gravar('estado');
    if (SK.grav) { SK.grav.seg = e.seg; SK.grav.pico = e.pico; SK.grav.picoMax = e.picoMax; }
    if (SK.mon) SK.mon.pico = e.pico;
    const b = skEl('sk-mic-nivel');
    if (b) { const p = SK.grav ? SK.grav.pico : e.pico; b.style.width = Math.max(0, Math.min(100, (p + 60) / 60 * 100)) + '%'; b.classList.toggle('alto', p > -3); }
    const t = skEl('sk-mic-txt'); if (t) t.textContent = `${e.pico > -100 ? e.pico.toFixed(1) : '–'} dB${SK.grav ? ` · gravando ${skTempo(e.seg)}` : ''}`;
}
function skUiGravar(el) {
    if (!SK.mics) {
        el.innerHTML = '<div class="sk-p-info">Procurando entradas…</div>';
        skApi().sk_gravar('dispositivos').then(r => { SK.mics = r.success ? r : { dispositivos: [], erro: r.error }; skDockRender(['gravar']); });
        return;
    }
    try { if (SK.micDev == null) SK.micDev = JSON.parse(localStorage.getItem('sk-mic') ?? 'null'); } catch (e) { /* sem storage */ }
    const ds = SK.mics.dispositivos;
    el.innerHTML = `<label class="sk-p-l2">Entrada <select id="sk-mic" class="notranslate"><option value="">Padrão do Windows</option>${ds.map(d => `<option value="${d.id}"${d.id === SK.micDev ? ' selected' : ''}>${skEsc(d.nome)} (${skEsc(d.api.replace('Windows ', ''))})</option>`).join('')}</select></label>
        <label class="sk-p-l2">Canais <select id="sk-mic-can"><option value="1">Mono</option><option value="2"${SK.micCan === 2 ? ' selected' : ''}>Estéreo</option></select></label>
        <div class="sk-mic"><div class="sk-mic-nivel" id="sk-mic-nivel"></div></div><div class="sk-p-info notranslate" id="sk-mic-txt">${SK.mon?.erro ? skEsc(SK.mon.erro) : '–'}</div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini sk-rec-btn${SK.grav ? ' on' : ''}" id="sk-gravar">${SK.grav ? '■ Parar gravação' : '● Gravar'}</button>
        <button class="ie-btn ie-btn-mini${SK.mon ? ' on' : ''}" id="sk-mic-testar" ${SK.grav ? 'disabled' : ''}>${SK.mon ? 'Parar teste' : 'Testar nível'}</button></div>
        <div class="sk-p-info">Grava na faixa escolhida a partir da agulha (R grava/para); as outras faixas tocam junto. O arquivo (WAV 24 bits) fica ao lado do projeto e é escrito direto no disco: se o app fechar, o que foi gravado fica.</div>`;
    el.querySelector('#sk-mic').onchange = e => { SK.micDev = e.target.value === '' ? null : +e.target.value; try { localStorage.setItem('sk-mic', JSON.stringify(SK.micDev)); } catch (er) { /* sem storage */ } if (SK.mon) skMonitorarEntrada(true); };
    el.querySelector('#sk-mic-can').onchange = e => { SK.micCan = +e.target.value; if (SK.mon) skMonitorarEntrada(true); };
    el.querySelector('#sk-mic-testar').onclick = () => skMonitorarEntrada(!SK.mon).then(() => skDockRender(['gravar']));
    el.querySelector('#sk-gravar').onclick = () => (SK.grav ? skGravarParar() : skGravar()).catch(e => skToast(e.message));
}
async function skGravar({ caminho = null } = {}) {
    if (SK.grav) return;
    if (!SK.proj) skNovo('limpar');
    if (SK.tocando) skParar();
    const f = SK.proj.faixas.find(x => x.id === SK.faixaSel) || SK.proj.faixas[0] || skNovaFaixa('Gravação');
    if (!caminho) {
        const pasta = SK.caminho ? SK.caminho.replace(/[\\/][^\\/]*$/, '') : await skApi().sk_pasta_padrao();
        const d = new Date(), z = n => String(n).padStart(2, '0');
        caminho = `${pasta}/${(SK.proj.nome || 'Gravacao').replace(/[\\/:*?"<>|]/g, '_')}_${f.nome.replace(/[\\/:*?"<>|]/g, '_')}_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.wav`;
    }
    clearInterval(SK.monTimer); SK.mon = null;
    const r = await skApi().sk_gravar('iniciar', SK.micDev ?? null, caminho, 48000, SK.micCan || 1);
    if (!r.success) throw new Error(r.error);
    SK.grav = { ini: SK.ph, faixa: f.id, caminho, seg: 0, pico: -120 };
    SK.monTimer = setInterval(skLerEntrada, 100);
    skTocar();   // as outras faixas tocam junto e a agulha anda
    skUi();
    return caminho;
}
async function skGravarParar() {
    const g = SK.grav; if (!g) return null;
    clearInterval(SK.monTimer); SK.monTimer = 0;
    const r = await skApi().sk_gravar('parar');
    SK.grav = null; skParar();
    if (r.caminho && r.dur > 0.05) {
        SK.ph = g.ini;
        const ids = await skImportar([r.caminho], { faixa: g.faixa, ini: g.ini });
        skToast(`Gravado: ${skTempo(r.dur)}`);
        return ids[0];
    }
    skUi(); return null;
}
function skDesenharGrav(x, X, Y, H) {   // clipe vermelho crescendo enquanto grava
    const g = SK.grav; if (!g) return;
    const i = SK.proj.faixas.findIndex(f => f.id === g.faixa); if (i < 0) return;
    const fim = Math.max(g.seg, SK.ph - g.ini), y = Y(i), cx = X(g.ini), cw = Math.max(2, fim * SK.z);
    x.fillStyle = '#5a1a14cc'; x.strokeStyle = '#ff3b30'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(cx + 0.5, y + 3.5, cw, SK_H - 7, 5); x.fill(); x.stroke();
    x.fillStyle = '#ffd9d4'; x.font = '11px system-ui'; x.fillText('● Gravando', cx + 7, y + 16);
}

// ── salvamento automático (a cada minuto com mudanças) e recuperação na tela inicial ──
setInterval(() => {
    if (!SK.proj || !SK.sujo || !skApi()) return;
    SK.proj.id = SK.proj.id || skId('p');
    skApi().sk_auto('salvar', SK.proj, SK.caminho).catch(() => {});
}, 60000);
async function skUiRecuperar() {
    const el = skEl('sk-recuperar'); if (!el || SK.proj || !skApi()) return;
    const r = await skApi().sk_auto('lista').catch(() => null);
    const l = (r && r.itens) || [];
    el.innerHTML = l.length ? `<div class="ie-recentes-tit">Recuperar (salvo automaticamente)</div>${l.slice(0, 5).map(a => `<div class="sk-recup"><button class="ie-recente notranslate" data-recup="${skEsc(a.id)}">${skEsc(a.nome || 'Sem título')} · ${new Date(a.quando * 1000).toLocaleString()}</button><button class="ie-btn ie-btn-mini" data-descarta="${skEsc(a.id)}" title="Descartar">×</button></div>`).join('')}` : '';
    el.onclick = async e => {
        const d = e.target.closest('[data-descarta]'); if (d) { await skApi().sk_auto('apagar', null, null, d.dataset.descarta); skUiRecuperar(); return; }
        const b = e.target.closest('[data-recup]'); if (b) await skRecuperar(b.dataset.recup);
    };
}
async function skRecuperar(pid) {
    const r = await skApi().sk_auto('ler', null, null, pid);
    if (!r.success) throw new Error(r.error);
    SK.proj = r.proj; SK.caminho = r.caminho || null; SK.sujo = true; SK.hist = []; SK.futuro = []; SK.sel = null; SK.ph = 0; SK.texto = SK.proj.texto || null;
    SK.faixaSel = SK.proj.faixas[0]?.id;
    for (const f of SK.proj.faixas) for (const c of f.clipes) { try { await skCarregarPicos(c.arq); } catch (e) { /* faltando */ } }
    skParar(); skUi(); skEnquadrar();
    return true;
}
Object.assign(window.SKN, {   // rodada C (núcleo em som.js): intervalo, copiar/colar, recortar, curva, ducking
    intervalo: (a, b, faixas = null) => { SK.int = a == null ? null : { a: Math.min(a, b), b: Math.max(a, b), faixas: (faixas || SK.proj.faixas.map(f => f.id)).map(x => (SK.proj.faixas.find(f => f.id === x || f.nome === x) || {}).id).filter(Boolean) }; skUi(); skDesenhar(); return SK.int; },
    apagarIntervalo: (puxar = false) => skIntApagar(puxar),
    copiar: () => skIntCopiar(),
    colar: t => skColar(t ?? SK.ph),
    recortar: () => skIntRecortar(),
    curva: (id, pts) => { const [c] = skClipe(id); skAntes(); if (pts && pts.length >= 2) c.curva = pts.map(p => [+p[0], +p[1]]).sort((x, y) => x[0] - y[0]); else delete c.curva; skMudou('curva'); return c.curva || null; },
    ducking: (faixa, op) => skDucking(faixa, op || {}),
});
Object.assign(window.SKN, {
    gravar: op => skGravar(op || {}),
    pararGravacao: () => skGravarParar(),
    entradas: () => skApi().sk_gravar('dispositivos'),
    autoSalvar: () => { SK.proj.id = SK.proj.id || skId('p'); return skApi().sk_auto('salvar', SK.proj, SK.caminho); },
    recuperaveis: async () => (await skApi().sk_auto('lista')).itens,
    recuperar: pid => skRecuperar(pid),
});
