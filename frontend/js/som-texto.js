// =========================================================
// Sound Kanivete — rodada F: editar pelo texto (painel Transcrição: clicar/Shift+clicar seleciona palavras, Apagar corta
// o áudio em todas as faixas e fecha o buraco; Tirar vícios corta "ã, hum, ahn..."), Exportar com stems (um arquivo
// por faixa, alinhados), ID3 + capítulos dos marcadores, e modelos de projeto salvos (faixas, efeitos e master, sem
// os áudios). A transcrição fica no projeto (SK.proj.texto): desfazer volta o texto junto.
// =========================================================
SK.texSel = null;   // [i0, i1] palavras escolhidas
const SK_VICIOS_PADRAO = 'ã, ãã, hã, hãã, hum, humm, hmm, hm, ahn, eh, ehh, uh, uhm, éé, ééé';
const skNormPal = w => String(w).toLowerCase().replace(/[.,!?;:…"“”'()\-]/g, '').trim();
function skVicios() { let v = SK_VICIOS_PADRAO; try { v = localStorage.getItem('sk-vicios') || v; } catch (e) { /* sem storage */ } return new Set(v.split(',').map(skNormPal).filter(Boolean)); }

function skTextoCortar(i0, i1, { margem = 0.05, registrar = true } = {}) {
    const P = SK.texto && SK.texto.palavras; if (!P || i0 == null) return 0;
    if (i1 < i0) [i0, i1] = [i1, i0];
    const ant = P[i0 - 1], prox = P[i1 + 1];
    const a = Math.max(ant ? ant[1] : 0, P[i0][0] - margem), b = Math.min(prox ? prox[0] : Infinity, P[i1][1] + margem), d = b - a;
    SK.int = { a, b, faixas: SK.proj.faixas.map(f => f.id) };
    skIntApagar(true);
    P.splice(i0, i1 - i0 + 1);
    for (const p of P) if (p[0] >= b - 1e-6) { p[0] -= d; p[1] -= d; }
    SK.texSel = null;
    if (registrar) skDockRender(['texto']);
    return d;
}
function skTirarVicios() {
    const P = SK.texto && SK.texto.palavras; if (!P) throw new Error('transcreva primeiro');
    const v = skVicios(); let n = 0, t = 0;
    for (let i = P.length - 1; i >= 0; i--) if (v.has(skNormPal(P[i][2]))) { t += skTextoCortar(i, i, { registrar: false }); n++; }
    skDockRender(['texto']);
    return { n, segundos: +t.toFixed(2) };
}
function skUiTexto(el) {
    const P = SK.texto && SK.texto.palavras, v = skVicios(), S = SK.texSel;
    const nv = P ? P.filter(p => v.has(skNormPal(p[2]))).length : 0;
    const dentro = i => S && i >= Math.min(S[0], S[1]) && i <= Math.max(S[0], S[1]);
    let vic = SK_VICIOS_PADRAO; try { vic = localStorage.getItem('sk-vicios') || vic; } catch (e) { /* sem storage */ }
    el.innerHTML = `<div class="sk-p-acoes"><select id="sk-idioma"><option value="pt">Português</option><option value="multi">Outros idiomas</option></select>
        <button class="ie-btn ie-btn-mini" id="sk-transc" ${SK.tarefa ? 'disabled' : ''}>${P ? 'Transcrever de novo' : 'Transcrever'}</button></div>
        ${P ? `<div class="sk-texto notranslate">${P.map(([a, , w], i) => `<span data-t="${a}" data-i="${i}" class="${v.has(skNormPal(w)) ? 'vicio' : ''}${dentro(i) ? ' sel' : ''}">${skEsc(w)}</span>`).join(' ')}</div>
        <div class="sk-p-info">Clique leva a agulha e escolhe a palavra; Shift+clique estende. Apagar corta o áudio em todas as faixas e fecha o buraco (Ctrl+Z volta).</div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" id="sk-tx-apagar" ${S ? '' : 'disabled'}>Apagar ${S ? Math.abs(S[1] - S[0]) + 1 + ' palavra(s)' : 'seleção'}</button>
        <button class="ie-btn ie-btn-mini" id="sk-tx-vicios" ${nv ? '' : 'disabled'}>Tirar ${nv} vício(s)</button></div>
        <label class="sk-p-l2" title="Palavras tratadas como vício (separe por vírgula)">Vícios<input class="sk-busca notranslate" id="sk-tx-lista" value="${skEsc(vic)}"></label>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" data-leg="srt">Salvar SRT</button><button class="ie-btn ie-btn-mini" data-leg="txt">Salvar TXT</button><button class="ie-btn ie-btn-mini" data-leg="vtt">VTT</button></div>`
        : '<div class="sk-p-info">Transcreve a mixagem (faixas mudas ficam de fora). Depois dá para editar o áudio apagando palavras. A primeira vez baixa o modelo de fala.</div>'}`;
    el.oninput = null;
    el.onchange = e => { if (e.target.id === 'sk-tx-lista') { try { localStorage.setItem('sk-vicios', e.target.value); } catch (er) { /* sem storage */ } skDockRender(['texto']); } };
    el.onclick = e => {
        const s = e.target.closest('[data-i]');
        if (s) { const i = +s.dataset.i; SK.texSel = e.shiftKey && SK.texSel ? [SK.texSel[0], i] : [i, i]; skIr(+s.dataset.t); skDockRender(['texto']); return; }
        if (e.target.id === 'sk-transc') return skTranscrever(el.querySelector('#sk-idioma').value).catch(er => skToast(er.message));
        if (e.target.id === 'sk-tx-apagar' && SK.texSel) { const d = skTextoCortar(SK.texSel[0], SK.texSel[1]); skToast(`${d.toFixed(2)} s cortados`); return; }
        if (e.target.id === 'sk-tx-vicios') { const r = skTirarVicios(); skToast(`${r.n} vício(s) tirados (${r.segundos} s)`); return; }
        const lg = e.target.closest('[data-leg]'); if (lg) skApi().ve_salvar_legenda(skLinhas(P), lg.dataset.leg, SK.proj.nome || 'audio');
    };
}

// ── Exportar: mixagem ou stems, ID3 e capítulos ──
function skUiExportar(el) {
    const op = SK.expOp || (SK.expOp = { f: 'mp3', k: '192', l: '', fx: '', stems: false, caps: true });
    const meta = SK.proj.meta || (SK.proj.meta = { titulo: SK.proj.nome || '', artista: '', album: '', ano: '', genero: '', comentario: '' });
    const sel = (id, opcoes, v) => `<select id="${id}">${opcoes.map(([a, b]) => `<option value="${a}"${String(a) === String(v) ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
    const nm = SK.proj.marcadores.length, campo = (k, r) => `<label>${r}<input class="sk-busca notranslate" data-meta="${k}" value="${skEsc(meta[k] || '')}"></label>`;
    el.innerHTML = `<div class="sk-p-nome notranslate">${skEsc(SK.proj.nome)}</div><div class="sk-p-info">${SK.proj.faixas.length} faixa(s) · ${skTempo(skFim())}</div>
        <div class="sk-grupo sk-exp">
        <label>Formato ${sel('ske-f', ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'opus'].map(f => [f, f]), op.f)}</label>
        <label>Qualidade ${sel('ske-k', [['320', '320 kbps'], ['192', '192 kbps'], ['128', '128 kbps']], op.k)}</label>
        <label>Volume final ${sel('ske-l', [['', 'Como está'], ['-14', '-14 LUFS (redes, streaming)'], ['-16', '-16 LUFS (podcast)'], ['-23', '-23 LUFS (TV)']], op.l)}</label>
        <label>Faixas ${sel('ske-fx', [['', 'Mixagem de todas'], ...SK.proj.faixas.map(f => [f.id, `Só "${skEsc(f.nome)}"`])], op.fx)}</label>
        <label class="sk-chk"><input type="checkbox" id="ske-stems" ${op.stems ? 'checked' : ''}> Stems: um arquivo por faixa (mesmo tamanho, alinhados)</label></div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-primario" id="ske-ok">Exportar…</button><button class="ie-btn ie-btn-mini" onclick="skEnviarEditor().catch(e => skToast(e.message))">→ Editor de vídeo</button></div>
        <div class="sk-grupo sk-exp"><div class="sk-p-tit">Informações (ID3) e capítulos</div>
        ${campo('titulo', 'Título')}${campo('artista', 'Artista')}${campo('album', 'Álbum / programa')}${campo('ano', 'Ano')}${campo('genero', 'Gênero')}${campo('comentario', 'Comentário')}
        <label class="sk-chk"><input type="checkbox" id="ske-caps" ${op.caps ? 'checked' : ''} ${nm ? '' : 'disabled'}> Marcadores viram capítulos (${nm})</label>
        <div class="sk-p-info">Vale para mp3, m4a, ogg, flac e opus (o wav não guarda).</div></div>
        ${skUiMaster()}
        <div class="sk-grupo"><div class="sk-p-tit">Medir</div><div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="skMedirLufs()">Medir volume da mixagem (LUFS)</button></div><div class="sk-p-info" id="sk-lufs"></div></div>
        <div class="sk-grupo"><div class="sk-p-tit">Modelo</div><div class="sk-p-acoes"><input class="sk-busca" id="ske-modelo" placeholder="Nome do modelo" value="${skEsc(SK.proj.nome || '')}"><button class="ie-btn ie-btn-mini" id="ske-modelo-ok">Salvar como modelo</button></div>
        <div class="sk-p-info">Guarda as faixas, os efeitos, o master e o artista/álbum (sem os áudios). Aparece em "Começar com".</div></div>`;
    el.oninput = e => { const k = e.target.dataset.meta; if (k) { SK.proj.meta[k] = e.target.value; SK.sujo = true; } };
    el.onchange = e => {
        if (e.target.dataset.meta) return;
        const g = s => el.querySelector(s);
        SK.expOp = { f: g('#ske-f').value, k: g('#ske-k').value, l: g('#ske-l').value, fx: g('#ske-fx').value, stems: g('#ske-stems').checked, caps: g('#ske-caps').checked };
    };
    el.onclick = async e => {
        if (e.target.id === 'ske-modelo-ok') { const n = skSalvarModelo(el.querySelector('#ske-modelo').value); skToast(`Modelo salvo: ${n}`); return; }
        if (e.target.id !== 'ske-ok') return;
        const o = SK.expOp;
        const c = await skApi().sk_dialogo('salvar', [`Áudio (*.${o.f})`], `${SK.proj.nome || 'audio'}.${o.f}`);
        if (!c) return;
        const r = await skExportarTudo(c, o).catch(er => ({ success: false, error: er.message }));
        skToast(r.success ? (r.arquivos ? `${r.arquivos.length} stems exportados` : `Exportado: ${r.caminho.split(/[\\/]/).pop()}`) : r.error);
    };
}
function skOpExport(o) {
    const meta = Object.fromEntries(Object.entries(SK.proj.meta || {}).filter(([, v]) => String(v || '').trim()));
    return { formato: o.f, kbps: +o.k, meta, capitulos: o.caps ? SK.proj.marcadores.map(m => ({ t: m.t, nome: m.nome })) : null };
}
async function skExportarTudo(caminho, o) {
    const base = skOpExport(o);
    if (!o.stems) {
        skEl('sk-status-info').textContent = 'Exportando…';
        try { return await SKN.exportar(caminho, { ...base, lufs: o.l === '' ? null : +o.l, faixas: o.fx ? [o.fx] : null }); } finally { skEl('sk-status-info').textContent = ''; }
    }
    return skExportarStems(caminho, base);
}
async function skExportarStems(caminho, op = {}) {   // um arquivo por faixa com som, do 0 ao fim do projeto (alinham no DAW)
    const raiz = caminho.replace(/\.[^.\\/]+$/, ''), ext = (op.formato || 'wav'), fim = skFim(), arquivos = [];
    const solo = SK.proj.faixas.some(f => f.solo);
    const faixas = SK.proj.faixas.filter(f => f.clipes.length && !f.mudo && (!solo || f.solo));
    for (const [i, f] of faixas.entries()) {
        skEl('sk-status-info').textContent = `Stem ${i + 1} de ${faixas.length}: ${f.nome}…`;
        const r = await SKN.exportar(`${raiz} - ${f.nome.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`, { ...op, faixas: [f.id], ini: 0, fim, capitulos: null });
        arquivos.push(r.caminho);
    }
    skEl('sk-status-info').textContent = '';
    return { success: true, arquivos };
}

// ── modelos do usuário (localStorage 'sk-modelos-usuario') ──
function skModelosUsuario() { try { return JSON.parse(localStorage.getItem('sk-modelos-usuario') || '{}'); } catch (e) { return {}; } }
function skSalvarModelo(nome) {
    nome = (nome || SK.proj.nome || 'Modelo').trim();
    const m = skModelosUsuario();
    m[nome] = { faixas: SK.proj.faixas.map(f => ({ nome: f.nome, cor: f.cor, vol: f.vol, fx: f.fx })), master: SK.proj.master,
        meta: { artista: SK.proj.meta?.artista || '', album: SK.proj.meta?.album || '', genero: SK.proj.meta?.genero || '' } };
    try { localStorage.setItem('sk-modelos-usuario', JSON.stringify(m)); } catch (e) { /* sem storage */ }
    skUiModelosInicio();
    return nome;
}
function skApagarModelo(nome) { const m = skModelosUsuario(); delete m[nome]; try { localStorage.setItem('sk-modelos-usuario', JSON.stringify(m)); } catch (e) { /* sem storage */ } skUiModelosInicio(); }
function skNovoDoModelo(nome) {
    const m = skModelosUsuario()[nome]; if (!m) throw new Error('modelo não encontrado');
    skNovo('vazio', nome);
    SK.proj.faixas = m.faixas.map(f => ({ id: skId('f'), nome: f.nome, vol: f.vol ?? 1, mudo: false, solo: false, cor: f.cor, fx: f.fx ? JSON.parse(JSON.stringify(f.fx)) : undefined, clipes: [] }));
    if (m.master) SK.proj.master = JSON.parse(JSON.stringify(m.master));
    SK.proj.meta = { titulo: '', comentario: '', ano: '', ...m.meta };
    SK.faixaSel = SK.proj.faixas[0]?.id; SK.sujo = false;
    skMasterAplicar(); skUi(); skDesenhar();
    return SKN.estado();
}
function skUiModelosInicio() {
    const box = document.querySelector('#sk-inicio .sk-modelos'); if (!box) return;
    box.querySelectorAll('.sk-modelo-u').forEach(b => b.remove());
    for (const n of Object.keys(skModelosUsuario())) {
        const s = document.createElement('span'); s.className = 'sk-modelo-u';
        const m = skModelosUsuario()[n];
        s.innerHTML = `<button class="sk-start-modelo notranslate" data-mu="${skEsc(n)}"><b>★ ${skEsc(n)}</b><small>${skEsc((m.faixas || []).map(f => f.nome).join(', '))}</small></button><button class="ie-dock-btn" data-mu-x="${skEsc(n)}" title="Apagar modelo">×</button>`;
        box.appendChild(s);
    }
    box.onclick = e => { const a = e.target.closest('[data-mu]'), x = e.target.closest('[data-mu-x]'); if (x) skApagarModelo(x.dataset.muX); else if (a) skNovoDoModelo(a.dataset.mu); };
}
Object.assign(window.SKN, {
    selecionarPalavras: (i0, i1 = i0) => { SK.texSel = [i0, i1]; skDockRender(['texto']); return SK.texto.palavras.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map(p => p[2]).join(' '); },
    apagarPalavras: (i0, i1 = i0) => skTextoCortar(i0, i1),
    tirarVicios: () => skTirarVicios(),
    exportarStems: (caminho, op = {}) => skExportarStems(caminho, { formato: 'wav', ...op }),
    salvarModelo: nome => skSalvarModelo(nome),
    novoDoModelo: nome => skNovoDoModelo(nome),
    modelos: () => Object.keys(skModelosUsuario()),
});
