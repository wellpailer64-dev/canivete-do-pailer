// =========================================================
// Sound Kanivete — painel Texto para Voz (OmniVoice). Duas colunas quando o painel é largo (área de baixo, por padrão):
// esquerda = o que falar (Uma voz: texto, um clipe por parágrafo; Conversa: personagens + falas, cada personagem na sua
// faixa), onde entra, Gerar e histórico; direita = vozes (Minhas vozes, Banco de vozes desenhadas, Desenhar uma voz)
// e os ajustes de fala. Estreito, empilha. Estado em SK.tts (lembrado em localStorage 'sk-tts').
// =========================================================
const SK_TTS_PADRAO = { modo: 'uma', idioma: 'pt', speed: 1, qualidade: 'normal', guidance_scale: 2, pause_seconds: 0.18, normalize_text: true, denoise: true,
    paragrafos: true, destino: 'voz', onde: 'agulha', aba: 'minhas', pausaFalas: 0.35, pers: [], falas: [], persSel: null,
    desenho: { genero: 'female', idade: 'young adult', tom: 'moderate pitch', sussurro: false } };
const SK_TTS_PASSOS = { rapido: 16, normal: 32, maximo: 64 };
const SK_PERS_CORES = ['#ffd166', '#7cc6fe', '#ff8c42', '#9be564', '#f28dd8', '#c3a6ff'];
function skTtsOp() {
    if (!SK.tts) { let s = {}; try { s = JSON.parse(localStorage.getItem('sk-tts') || '{}'); } catch (e) { /* sem storage */ } SK.tts = Object.assign(JSON.parse(JSON.stringify(SK_TTS_PADRAO)), s); }
    return SK.tts;
}
function skTtsGuardar() { try { localStorage.setItem('sk-tts', JSON.stringify(SK.tts)); } catch (e) { /* sem storage */ } }
function skTtsRedesenhar() { SK.ttsVer = (SK.ttsVer || 0) + 1; skDockRender(['tts']); }
const skPers = id => skTtsOp().pers.find(p => p.id === id);
function skPersGarantir(vozes) {   // conversa começa com 2 personagens, cada um com uma voz diferente
    const o = skTtsOp();
    if (!o.pers.length) o.pers = [0, 1].map(i => ({ id: skId('p'), nome: `Pessoa ${i + 1}`, voz: (vozes[i] || vozes[0] || {}).id, cor: SK_PERS_CORES[i] }));
    for (const p of o.pers) if (!vozes.some(v => v.id === p.voz)) p.voz = (vozes[0] || {}).id;
    if (!o.falas.length) o.falas = [{ p: o.pers[0].id, texto: '' }, { p: o.pers[1 % o.pers.length].id, texto: '' }];
    if (!skPers(o.persSel)) o.persSel = o.pers[0].id;
}

async function skUiTts(el) {
    if (!SK.vozes) { el.innerHTML = '<div class="sk-p-info">Carregando vozes…</div>'; SK.vozes = await skApi().sk_vozes().catch(() => ({ success: false })); }
    const r = SK.vozes, o = skTtsOp(), vozes = (r && r.vozes) || [];
    if (!r.success || !r.instalado) {
        el.onclick = el.oninput = el.onchange = null;
        el.innerHTML = `<div class="sk-p-info">O OmniVoice ainda não está instalado. Instale em Geração de Voz.</div><div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="switchTool('omnivoice')">Abrir Geração de Voz</button></div>`;
        return;
    }
    if (el.dataset.ver === String(SK.ttsVer || 0) && el.querySelector('.sk-tts')) { skTtsResumo(el); return; }   // já montado: não perde a digitação
    el.dataset.ver = String(SK.ttsVer || 0);
    if (!vozes.some(v => v.id === o.voz)) o.voz = vozes[0]?.id;
    if (o.modo === 'conversa') skPersGarantir(vozes);
    const sel = (k, ops, extra = '') => `<select data-tts="${k}" ${extra}>${ops.map(([v, n]) => `<option value="${v}"${String(o[k]) === String(v) ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    const sl = (rot, k, min, max, passo, fmt) => `<label class="sk-p-l">${rot}<input type="range" min="${min}" max="${max}" step="${passo}" value="${o[k]}" data-tts="${k}"><small data-v="${k}">${fmt(o[k])}</small></label>`;
    const segm = (k, ops) => `<div class="sk-segm">${ops.map(([v, n]) => `<button data-segm="${k}" data-val="${v}" class="${o[k] === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const faixas = SK.proj ? SK.proj.faixas : [];
    const esq = o.modo === 'uma' ? `
        <textarea id="skv-txt" class="sk-txt" rows="8" placeholder="Escreva o que a voz vai falar. Linha em branco separa parágrafos (cada um vira um clipe).">${skEsc(o.texto || '')}</textarea>
        <div class="sk-p-info notranslate" id="skv-resumo"></div>
        <label class="sk-chk"><input type="checkbox" data-tts="paragrafos" ${o.paragrafos ? 'checked' : ''}> Um clipe por parágrafo</label>
        <div class="sk-grupo"><div class="sk-p-tit">Onde entra</div>
            <label class="sk-p-l">Faixa${sel('destino', [['voz', 'Faixa "Texto para Voz"'], ['nova', 'Faixa nova'], ...faixas.map(f => [f.id, skEsc(f.nome)])])}<small></small></label>
            <label class="sk-p-l">Posição${sel('onde', [['agulha', 'Na agulha'], ['fim', 'Depois do último clipe da faixa']])}<small></small></label></div>`
        : skUiConversa(o, vozes);
    const vozNome = id => (vozes.find(v => v.id === id) || {}).nome || '—';
    const alvoConv = o.modo === 'conversa' ? skPers(o.persSel) : null;
    const dir = `${segm('aba', [['minhas', 'Minhas vozes'], ['banco', 'Banco'], ['desenhar', 'Desenhar']])}
        ${o.aba === 'minhas' ? `
            ${alvoConv ? `<div class="sk-p-info">Clique numa voz para dar a <b style="color:${alvoConv.cor}">${skEsc(alvoConv.nome)}</b>.</div>` : ''}
            <div class="sk-vozes notranslate">${vozes.map(v => `<div class="sk-voz${(alvoConv ? alvoConv.voz : o.voz) === v.id ? ' on' : ''}" data-voz="${skEsc(v.id)}"><span class="sk-voz-av">${skEsc((v.nome || '?').trim()[0] || '?').toUpperCase()}</span>
                <span class="sk-voz-n">${skEsc(v.nome)}<small>${o.modo === 'conversa' ? o.pers.filter(p => p.voz === v.id).map(p => skEsc(p.nome)).join(', ') || (v.dur ? v.dur.toFixed(0) + ' s de referência' : 'voz salva') : v.dur ? v.dur.toFixed(0) + ' s de referência' : 'voz salva'}</small></span>
                <span class="sk-voz-bts">${v.ref_url ? `<button class="ie-btn ie-btn-mini" data-amostra="${skEsc(v.ref_url)}" title="Ouvir">▶</button>` : ''}<button class="ie-btn ie-btn-mini sk-voz-x" data-apagar="${skEsc(v.id)}" title="Excluir esta voz">×</button></span></div>`).join('') || '<div class="sk-p-info">Nenhuma voz ainda: pegue no Banco, desenhe uma ou clone com + Nova voz.</div>'}</div>
            <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" id="skv-nova">${SK.ttsNova ? 'Fechar' : '+ Nova voz (clonar)'}</button><button class="ie-btn ie-btn-mini" data-acao="atualizar">Atualizar</button></div>
            ${SK.ttsNova ? skUiNovaVoz() : ''}`
        : o.aba === 'banco' ? skUiBanco() : skUiDesenhar(o)}
        <div class="sk-grupo"><div class="sk-p-tit">Fala</div>
            <label class="sk-p-l">Idioma${sel('idioma', [['pt', 'Português'], ['en', 'Inglês'], ['es', 'Espanhol'], ['fr', 'Francês'], ['it', 'Italiano'], ['de', 'Alemão']])}<small></small></label>
            ${sl('Velocidade', 'speed', 0.5, 2, 0.05, v => (+v).toFixed(2) + '×')}
            ${sl('Expressão', 'guidance_scale', 1, 4, 0.1, v => (+v).toFixed(1))}
            ${sl('Pausa entre frases', 'pause_seconds', 0, 1, 0.02, v => (+v).toFixed(2) + ' s')}
            <label class="sk-p-l">Qualidade${sel('qualidade', [['rapido', 'Rápida'], ['normal', 'Normal'], ['maximo', 'Máxima (mais lenta)']])}<small></small></label>
            <label class="sk-chk"><input type="checkbox" data-tts="normalize_text" ${o.normalize_text ? 'checked' : ''}> Números e siglas por extenso</label>
            <label class="sk-chk"><input type="checkbox" data-tts="denoise" ${o.denoise ? 'checked' : ''}> Fala limpa</label></div>`;
    el.innerHTML = `<div class="sk-tts">
        <div class="sk-tts-esq">${segm('modo', [['uma', 'Uma voz'], ['conversa', 'Conversa']])}
            ${o.modo === 'uma' ? `<div class="sk-p-info">Voz: <b class="notranslate">${skEsc(vozNome(o.voz))}</b> (escolha na lista de vozes)</div>` : ''}
            ${esq}
            <div class="sk-p-acoes"><button class="ie-btn ie-btn-primario" id="skv-ok" ${SK.tarefa ? 'disabled' : ''}>${o.modo === 'conversa' ? 'Gerar conversa' : 'Gerar fala'}</button><span class="sk-p-info" id="skv-prog"></span></div>
            ${(SK.ttsFeitos || []).length ? `<div class="sk-grupo"><div class="sk-p-tit">Geradas nesta sessão</div><div class="sk-lista notranslate">${SK.ttsFeitos.slice(-8).reverse().map(g => skArrastavel(`<button data-ouvir="${skEsc(g.url)}">▶</button><span>${skEsc(g.texto.slice(0, 50))}<small>${skEsc(g.voz)} · ${skTempo(g.dur)}</small></span><button data-por="${skEsc(g.arq)}" title="Inserir de novo na agulha">+</button>`, g.arq)).join('')}</div></div>` : ''}
        </div>
        <div class="sk-tts-dir">${dir}</div></div>`;
    skTtsResumo(el);
    el.oninput = e => skTtsEntrada(el, e);
    el.onchange = e => skTtsEntrada(el, e);
    el.onclick = e => skTtsClique(el, e).catch(er => skToast(er.message));
    el.onkeydown = e => skTtsTecla(el, e);
}

// ── Conversa: personagens (nome + voz + cor) e falas em ordem ──
function skUiConversa(o) {
    return `<div class="sk-grupo"><div class="sk-p-tit">Personagens</div>
        <div class="sk-pers">${o.pers.map(p => `<div class="sk-per${p.id === o.persSel ? ' on' : ''}" data-persel="${p.id}" style="--cor:${p.cor}"><span class="sk-per-cor"></span>
            <input value="${skEsc(p.nome)}" data-pnome="${p.id}" class="notranslate"><small class="notranslate">${skEsc(((SK.vozes.vozes || []).find(v => v.id === p.voz) || {}).nome || 'sem voz')}</small>
            ${o.pers.length > 1 ? `<button class="ie-dock-btn" data-ptirar="${p.id}" title="Tirar personagem">×</button>` : ''}</div>`).join('')}
            <button class="ie-btn ie-btn-mini" data-acao="pers+">+ Personagem</button></div>
        <div class="sk-p-info">Escolha um personagem e clique numa voz à direita para dar a voz a ele.</div></div>
        <div class="sk-grupo"><div class="sk-p-tit">Falas</div>
        <div class="sk-falas">${o.falas.map((f, i) => { const p = skPers(f.p) || o.pers[0]; return `<div class="sk-fala" style="--cor:${p.cor}">
            <button class="sk-fala-p notranslate" data-trocar="${i}" title="Clique para passar a fala para o próximo personagem">${skEsc(p.nome)}</button>
            <textarea rows="1" data-fala="${i}" placeholder="O que ${skEsc(p.nome)} fala…">${skEsc(f.texto)}</textarea>
            <span class="sk-fala-bts"><button class="ie-dock-btn" data-subir="${i}" title="Subir">↑</button><button class="ie-dock-btn" data-ftirar="${i}" title="Tirar fala">×</button></span></div>`; }).join('')}</div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" data-acao="fala+">+ Fala</button><button class="ie-btn ie-btn-mini" data-acao="roteiro">${SK.ttsRoteiro ? 'Fechar roteiro' : 'Colar roteiro…'}</button></div>
        ${SK.ttsRoteiro ? `<textarea class="sk-txt" id="skv-roteiro" rows="6" placeholder="Ana: Oi, tudo bem?\nBeto: Tudo ótimo! E você?\nAna: Também."></textarea>
            <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini ie-btn-primario" data-acao="roteiro-ok">Usar roteiro</button></div>
            <div class="sk-p-info">Uma fala por linha, "Nome: texto". Nomes novos viram personagens.</div>` : ''}
        <div class="sk-p-info">Enter cria a próxima fala (com o próximo personagem); Shift+Enter quebra a linha.</div></div>
        <div class="sk-grupo"><div class="sk-p-tit">Montagem</div>
            <label class="sk-p-l">Entre as falas<input type="range" min="0" max="1.5" step="0.05" value="${o.pausaFalas}" data-tts="pausaFalas"><small data-v="pausaFalas">${(+o.pausaFalas).toFixed(2)} s</small></label>
            <label class="sk-p-l">Começa${`<select data-tts="onde"><option value="agulha"${o.onde === 'agulha' ? ' selected' : ''}>Na agulha</option><option value="fim"${o.onde === 'fim' ? ' selected' : ''}>Depois do fim do projeto</option></select>`}<small></small></label>
            <div class="sk-p-info">Cada personagem vai para a própria faixa (dá para mixar e cortar separado).</div></div>`;
}
function skUiBanco() {
    const b = SK.banco;
    if (!b) { skApi().sk_banco('estado').then(r => { SK.banco = r; skTtsRedesenhar(); }); return '<div class="sk-p-info">Carregando o banco…</div>'; }
    if (!b.instalado) return `<div class="sk-p-info">${b.vozes.length} vozes brasileiras <b>desenhadas</b> pelo OmniVoice (ninguém foi clonado): homens, mulheres, jovens, adultos, idosos, crianças e sussurro. Baixa uma vez (~5 MB).</div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini ie-btn-primario" data-acao="banco-baixar" ${SK.tarefa ? 'disabled' : ''}>Baixar o banco de vozes</button></div>
        <div class="sk-lista notranslate">${b.vozes.map(v => `<div class="sk-banco-v"><b>${skEsc(v.nome)}</b><small>${skEsc(v.descricao)}</small></div>`).join('')}</div>`;
    return `<div class="sk-lista notranslate">${b.vozes.map(v => `<div class="sk-banco-v"><span><b>${skEsc(v.nome)}</b><small>${skEsc(v.descricao)}</small></span>
        <span class="sk-voz-bts">${v.url ? `<button class="ie-btn ie-btn-mini" data-amostra="${skEsc(v.url)}">▶</button>` : ''}${v.adicionada ? '<span class="sk-ok">✓</span>' : `<button class="ie-btn ie-btn-mini" data-banco-add="${skEsc(v.id)}" ${SK.tarefa ? 'disabled' : ''}>Adicionar</button>`}</span></div>`).join('')}</div>`;
}
const SK_DES = { genero: [['female', 'Feminina'], ['male', 'Masculina']], idade: [['child', 'Criança'], ['teenager', 'Adolescente'], ['young adult', 'Jovem'], ['middle-aged', 'Adulta'], ['elderly', 'Idosa']],
    tom: [['very low pitch', 'Muito grave'], ['low pitch', 'Grave'], ['moderate pitch', 'Médio'], ['high pitch', 'Agudo'], ['very high pitch', 'Muito agudo']] };
function skUiDesenhar(o) {
    const d = o.desenho, s = (k) => `<select data-des="${k}">${SK_DES[k].map(([v, n]) => `<option value="${v}"${d[k] === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    const a = SK.ttsAmostra;
    return `<div class="sk-p-info">Descreva a voz e o OmniVoice cria uma pessoa que não existe. Gostou? Dê um nome e salve.</div>
        <label class="sk-p-l">Voz${s('genero')}<small></small></label><label class="sk-p-l">Idade${s('idade')}<small></small></label><label class="sk-p-l">Tom${s('tom')}<small></small></label>
        <label class="sk-chk"><input type="checkbox" data-des="sussurro" ${d.sussurro ? 'checked' : ''}> Sussurrando</label>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" data-acao="desenhar" ${SK.tarefa ? 'disabled' : ''}>${a ? 'Gerar outra' : 'Gerar amostra'}</button>${a ? `<button class="ie-btn ie-btn-mini" data-amostra="${skEsc(a.url)}">▶ Ouvir</button>` : ''}</div>
        ${a ? `<input class="sk-busca" id="skv-des-nome" placeholder="Nome da voz"><div class="sk-p-acoes"><button class="ie-btn ie-btn-mini ie-btn-primario" data-acao="desenho-salvar" ${SK.tarefa ? 'disabled' : ''}>Salvar voz</button></div>` : ''}`;
}

// ── eventos ──
function skTtsEntrada(el, e) {
    const o = skTtsOp(), t = e.target;
    if (t.id === 'skv-txt') { o.texto = t.value; skTtsGuardar(); skTtsResumo(el); return; }
    if (t.dataset.fala != null) { o.falas[+t.dataset.fala].texto = t.value; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; skTtsGuardar(); return; }
    if (t.dataset.pnome) { const p = skPers(t.dataset.pnome); p.nome = t.value || p.nome; skTtsGuardar(); if (e.type === 'change') skTtsRedesenhar(); return; }
    if (t.dataset.des) { o.desenho[t.dataset.des] = t.type === 'checkbox' ? t.checked : t.value; SK.ttsAmostra = null; skTtsGuardar(); if (e.type === 'change') skTtsRedesenhar(); return; }
    const k = t.dataset.tts; if (!k) return;
    o[k] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value;
    const s = el.querySelector(`[data-v="${k}"]`); if (s) s.textContent = k === 'speed' ? o[k].toFixed(2) + '×' : /pause|pausa/.test(k) ? o[k].toFixed(2) + ' s' : o[k].toFixed(1);
    skTtsGuardar(); skTtsResumo(el);
}
function skTtsTecla(el, e) {
    const t = e.target, o = skTtsOp();
    if (t.id === 'skv-txt' && e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); skGerarTts().catch(er => skToast(er.message)); return; }
    if (t.dataset.fala == null) return;
    const i = +t.dataset.fala;
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); skGerarTts().catch(er => skToast(er.message)); return; }
    if (e.key === 'Enter' && !e.shiftKey) {   // próxima fala com o próximo personagem
        e.preventDefault();
        const k = o.pers.findIndex(p => p.id === o.falas[i].p);
        o.falas.splice(i + 1, 0, { p: o.pers[(k + 1) % o.pers.length].id, texto: '' });
        skTtsGuardar(); skTtsRedesenhar(); skEl('sk-p-tts')?.querySelector(`[data-fala="${i + 1}"]`)?.focus(); return;
    }
    if (e.key === 'Backspace' && !t.value && o.falas.length > 1) { e.preventDefault(); o.falas.splice(i, 1); skTtsGuardar(); skTtsRedesenhar(); skEl('sk-p-tts')?.querySelector(`[data-fala="${Math.max(0, i - 1)}"]`)?.focus(); }
}
async function skTtsClique(el, e) {
    const o = skTtsOp(), t = e.target, ds = k => t.closest(`[data-${k}]`);
    let b;
    if ((b = ds('amostra'))) { e.stopPropagation(); skOuvir(b.dataset.amostra); return; }
    if ((b = ds('apagar'))) {
        e.stopPropagation();
        if (!b.classList.contains('confirma')) { b.classList.add('confirma'); b.textContent = 'Excluir?'; setTimeout(() => { if (b.isConnected) { b.classList.remove('confirma'); b.textContent = '×'; } }, 3000); return; }
        return skApagarVoz(b.dataset.apagar);
    }
    if ((b = ds('segm'))) { o[b.dataset.segm] = b.dataset.val; skTtsGuardar(); return skTtsRedesenhar(); }
    if ((b = ds('voz'))) { if (o.modo === 'conversa') { const p = skPers(o.persSel); if (p) p.voz = b.dataset.voz; } else o.voz = b.dataset.voz; skTtsGuardar(); return skTtsRedesenhar(); }
    if ((b = ds('ptirar'))) { e.stopPropagation(); const id = b.dataset.ptirar; o.pers = o.pers.filter(p => p.id !== id); o.falas.forEach(f => { if (f.p === id) f.p = o.pers[0].id; }); skTtsGuardar(); return skTtsRedesenhar(); }
    if ((b = ds('persel')) && !t.closest('input')) { o.persSel = b.dataset.persel; skTtsGuardar(); return skTtsRedesenhar(); }
    if ((b = ds('persel')) && t.closest('input')) { o.persSel = b.dataset.persel; el.querySelectorAll('.sk-per').forEach(x => x.classList.toggle('on', x === b)); return; }
    if ((b = ds('trocar'))) { const f = o.falas[+b.dataset.trocar], k = o.pers.findIndex(p => p.id === f.p); f.p = o.pers[(k + 1) % o.pers.length].id; skTtsGuardar(); return skTtsRedesenhar(); }
    if ((b = ds('subir'))) { const i = +b.dataset.subir; if (i > 0) { [o.falas[i - 1], o.falas[i]] = [o.falas[i], o.falas[i - 1]]; skTtsGuardar(); skTtsRedesenhar(); } return; }
    if ((b = ds('ftirar'))) { o.falas.splice(+b.dataset.ftirar, 1); if (!o.falas.length) o.falas.push({ p: o.pers[0].id, texto: '' }); skTtsGuardar(); return skTtsRedesenhar(); }
    if ((b = ds('banco-add'))) { await skTarefa(() => skApi().sk_banco('adicionar', b.dataset.bancoAdd)); SK.vozes = null; SK.banco = null; skToast('Voz adicionada'); return skTtsRedesenhar(); }
    if ((b = ds('ouvir'))) { skOuvir(b.dataset.ouvir); return; }
    if ((b = ds('por'))) { if (!SK.proj) skNovo('narracao'); return skImportar([b.dataset.por], { ini: SK.ph }); }
    const acao = ds('acao')?.dataset.acao;
    if (acao === 'atualizar') { SK.vozes = null; return skTtsRedesenhar(); }
    if (acao === 'pers+') { const n = o.pers.length, vozes = SK.vozes.vozes; o.pers.push({ id: skId('p'), nome: `Pessoa ${n + 1}`, voz: (vozes[n % vozes.length] || {}).id, cor: SK_PERS_CORES[n % SK_PERS_CORES.length] }); o.persSel = o.pers[n].id; skTtsGuardar(); return skTtsRedesenhar(); }
    if (acao === 'fala+') { const u = o.falas[o.falas.length - 1], k = u ? o.pers.findIndex(p => p.id === u.p) : -1; o.falas.push({ p: o.pers[(k + 1) % o.pers.length].id, texto: '' }); skTtsGuardar(); skTtsRedesenhar(); skEl('sk-p-tts')?.querySelector(`[data-fala="${o.falas.length - 1}"]`)?.focus(); return; }
    if (acao === 'roteiro') { SK.ttsRoteiro = !SK.ttsRoteiro; return skTtsRedesenhar(); }
    if (acao === 'roteiro-ok') { skRoteiro(el.querySelector('#skv-roteiro').value); SK.ttsRoteiro = false; return skTtsRedesenhar(); }
    if (acao === 'banco-baixar') { const r = await skTarefa(() => skApi().sk_banco('baixar')); SK.banco = r.banco; return skTtsRedesenhar(); }
    if (acao === 'desenhar') { await skDesenharVoz(); return; }
    if (acao === 'desenho-salvar') { const nome = el.querySelector('#skv-des-nome').value; await skCriarVoz({ nome, arq: SK.ttsAmostra.arq, refText: SK.ttsAmostra.texto, tratar: false }); SK.ttsAmostra = null; o.aba = 'minhas'; skTtsGuardar(); return skTtsRedesenhar(); }
    if (t.id === 'skv-nova') { SK.ttsNova = !SK.ttsNova; return skTtsRedesenhar(); }
    if (t.id === 'skv-n-arq') { const c = await skApi().sk_dialogo('abrir', ['Áudio e vídeo (*.mp3;*.wav;*.m4a;*.aac;*.ogg;*.opus;*.flac;*.mp4;*.mov;*.mkv)', 'Todos (*.*)']); if (c) { SK.ttsNovaArq = c; const s = el.querySelector('#skv-n-fonte'); if (s) s.textContent = c.split(/[\\/]/).pop(); } return; }
    if (t.id === 'skv-n-ok') return skCriarVoz({ nome: el.querySelector('#skv-n-nome').value, refText: el.querySelector('#skv-n-txt').value, tratar: el.querySelector('#skv-n-tratar').checked });
    if (t.id === 'skv-ok') return skGerarTts();
}
function skRoteiro(txt) {   // "Nome: fala" por linha → personagens + falas
    const o = skTtsOp(), vozes = SK.vozes.vozes || [], falas = [];
    for (const linha of String(txt || '').split(/\n/)) {
        const m = linha.match(/^\s*([^:]{1,40}):\s*(.+?)\s*$/);
        if (!m) { if (linha.trim() && falas.length) falas[falas.length - 1].texto += ' ' + linha.trim(); continue; }
        let p = o.pers.find(x => x.nome.toLowerCase() === m[1].trim().toLowerCase());
        if (!p) { const n = o.pers.filter(x => !/^Pessoa \d+$/.test(x.nome) || o.falas.some(f => f.p === x.id && f.texto.trim())).length; p = { id: skId('p'), nome: m[1].trim(), voz: (vozes[n % Math.max(1, vozes.length)] || {}).id, cor: SK_PERS_CORES[n % SK_PERS_CORES.length] }; o.pers.push(p); }
        falas.push({ p: p.id, texto: m[2] });
    }
    if (!falas.length) throw new Error('nenhuma linha no formato "Nome: texto"');
    const usados = new Set(falas.map(f => f.p));
    o.pers = o.pers.filter(p => usados.has(p.id));
    o.pers.forEach((p, i) => { p.cor = SK_PERS_CORES[i % SK_PERS_CORES.length]; });
    o.falas = falas; o.persSel = o.pers[0].id; skTtsGuardar();
    return falas.length;
}
function skTtsPartes(texto, paragrafos) { const t = (texto || '').trim(); if (!t) return []; return paragrafos ? t.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean) : [t]; }
function skTtsResumo(el) {
    const o = skTtsOp(), r = el.querySelector('#skv-resumo'); if (!r) return;
    const t = (o.texto || '').trim(), pal = t ? t.split(/\s+/).length : 0, partes = skTtsPartes(t, o.paragrafos).length;
    r.textContent = t ? `${t.length} caracteres · ${pal} palavras · ~${skTempo(pal / 2.6 / (o.speed || 1))} de fala${partes > 1 ? ` · ${partes} clipes` : ''} · Ctrl+Enter gera` : 'Ctrl+Enter gera.';
}
const skTtsOpcoes = o => ({ language: o.idioma, speed: o.speed, guidance_scale: o.guidance_scale, pause_seconds: o.pause_seconds, num_step: SK_TTS_PASSOS[o.qualidade] || 32, normalize_text: o.normalize_text, denoise: o.denoise });
function skTtsProg(m) { const p = skEl('skv-prog'); if (p) p.textContent = m; skEl('sk-status-info').textContent = m; }
async function skGerarTts() {
    const o = skTtsOp();
    if (o.modo === 'conversa') return skGerarConversa();
    const partes = skTtsPartes(o.texto, o.paragrafos);
    if (!partes.length) throw new Error('escreva o texto');
    if (!SK.proj) skNovo('narracao');
    const f = o.destino === 'voz' ? (SK.proj.faixas.find(x => /texto para voz|voz ia/i.test(x.nome)) || skNovaFaixa('Texto para Voz'))
        : o.destino === 'nova' ? skNovaFaixa('Texto para Voz') : (SK.proj.faixas.find(x => x.id === o.destino) || skNovaFaixa('Texto para Voz'));
    let t = o.onde === 'fim' ? f.clipes.reduce((m, c) => Math.max(m, c.ini + c.dur), 0) : SK.ph;
    const ids = [];
    for (const [i, txt] of partes.entries()) {
        skTtsProg(partes.length > 1 ? `Gerando parte ${i + 1} de ${partes.length}…` : 'Gerando…');
        const id = await skVoz(o.voz, txt, { faixa: f.id, ini: t, op: skTtsOpcoes(o) });
        t = skTtsFeito(id, txt, o.voz) + (partes.length > 1 ? 0.35 : 0);
        ids.push(id);
    }
    skTtsProg(''); SK.ph = t; skUi(); skTtsRedesenhar();
    return ids;
}
function skTtsFeito(id, txt, voz) {
    const [c] = skClipe(id); if (!c) return SK.ph;
    SK.ttsFeitos = [...(SK.ttsFeitos || []), { arq: c.arq, url: SK.picos[c.arq]?.url, dur: c.dur, texto: txt, voz: ((SK.vozes.vozes || []).find(v => v.id === voz) || {}).nome || 'voz' }];
    return c.ini + c.dur;
}
async function skGerarConversa() {
    const o = skTtsOp(), falas = o.falas.filter(f => f.texto.trim());
    if (!falas.length) throw new Error('escreva as falas');
    for (const f of falas) if (!skPers(f.p)?.voz) throw new Error(`${skPers(f.p)?.nome || 'um personagem'} está sem voz`);
    if (!SK.proj) skNovo('vazio', 'Conversa');
    const faixa = {};   // uma faixa por personagem (a vazia do projeto novo é reaproveitada)
    for (const p of o.pers) {
        if (!falas.some(f => f.p === p.id)) continue;
        let f = SK.proj.faixas.find(x => x.nome === p.nome);
        if (!f) { const livre = SK.proj.faixas.find(x => !x.clipes.length && !Object.values(faixa).includes(x.id) && /^Faixa \d+$/.test(x.nome)); if (livre) { livre.nome = p.nome; f = livre; } else f = skNovaFaixa(p.nome); }
        f.cor = p.cor; faixa[p.id] = f.id;
    }
    let t = o.onde === 'fim' ? skFim() : SK.ph;
    const ids = [];
    for (const [i, fl] of falas.entries()) {
        skTtsProg(`Fala ${i + 1} de ${falas.length} (${skPers(fl.p).nome})…`);
        const id = await skVoz(skPers(fl.p).voz, fl.texto.trim(), { faixa: faixa[fl.p], ini: t, op: skTtsOpcoes(o) });
        t = skTtsFeito(id, fl.texto.trim(), skPers(fl.p).voz) + (+o.pausaFalas || 0);
        ids.push(id);
    }
    skTtsProg(''); SK.ph = t; skUiFaixas(); skUi(); skEnquadrar(); skTtsRedesenhar();
    return ids;
}
async function skDesenharVoz() {
    const d = skTtsOp().desenho;
    const instruct = [d.genero, d.idade, d.sussurro ? 'whisper' : d.tom].join(', ');
    const r = await skTarefa(() => skApi().sk_voz_desenhar(instruct, Math.floor(Math.random() * 1e6)));
    const info = await skCarregarPicos(r.saida);
    SK.ttsAmostra = { arq: r.saida, url: info.url, texto: r.texto, seed: r.seed, instruct };
    skTtsRedesenhar(); skOuvir(info.url);
    return SK.ttsAmostra;
}
function skUiNovaVoz() {   // clonar: referência = clipe escolhido ou arquivo
    const [c] = SK.sel ? skClipe(SK.sel) : [null];
    const fonte = SK.ttsNovaArq ? SK.ttsNovaArq.split(/[\\/]/).pop() : c ? `clipe "${c.nome}" (${Math.min(30, c.dur).toFixed(1)} s)` : 'nenhuma — escolha um clipe na timeline ou um arquivo';
    return `<div class="sk-grupo sk-nova-voz"><div class="sk-p-tit">Nova voz (clonar uma gravação)</div>
        <input class="sk-busca" id="skv-n-nome" placeholder="Nome da voz" value="">
        <div class="sk-p-info">Referência: <b class="notranslate" id="skv-n-fonte">${skEsc(fonte)}</b></div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" id="skv-n-arq">Escolher arquivo…</button>${SK.ttsNovaArq ? '<button class="ie-btn ie-btn-mini" onclick="SK.ttsNovaArq=null;skTtsRedesenhar()">Usar o clipe escolhido</button>' : ''}</div>
        <textarea class="sk-txt" id="skv-n-txt" rows="2" placeholder="O que a pessoa fala na referência (opcional: em branco, transcreve sozinho)"></textarea>
        <label class="sk-chk"><input type="checkbox" id="skv-n-tratar" checked> Limpar a referência antes (ruído, volume)</label>
        <div class="sk-p-info">Melhor com 10–20 s de fala limpa, uma pessoa só, sem música. Só clone vozes com autorização de quem fala.</div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini ie-btn-primario" id="skv-n-ok" ${SK.tarefa ? 'disabled' : ''}>Criar voz</button></div></div>`;
}
async function skCriarVoz({ nome, refText = '', tratar = true, arq = null, de = null, dur = null } = {}) {
    nome = (nome || '').trim(); if (!nome) throw new Error('dê um nome para a voz');
    let op = { ref_text: refText, tratar };
    if (!arq) {
        if (SK.ttsNovaArq) arq = SK.ttsNovaArq;
        else { const [c] = SK.sel ? skClipe(SK.sel) : [null]; if (!c) throw new Error('escolha um clipe na timeline ou um arquivo'); arq = c.arq; op = { ...op, de: c.de, dur: Math.min(30, c.dur) }; }
    } else if (dur) op = { ...op, de: de || 0, dur };
    const r = await skTarefa(() => skApi().sk_voz_criar(nome, arq, op));
    SK.vozes = null; SK.ttsNova = false; SK.ttsNovaArq = null;
    if (r.voz) { const o = skTtsOp(); if (o.modo === 'conversa' && skPers(o.persSel)) skPers(o.persSel).voz = r.voz.id; else o.voz = r.voz.id; }
    skTtsGuardar(); skTtsRedesenhar();
    skToast(`Voz criada: ${nome}`);
    return r.voz;
}
async function skApagarVoz(id) {
    const r = await skApi().sk_voz_apagar(id);
    if (!r || !r.success) throw new Error((r && r.error) || 'não excluiu');
    if (skTtsOp().voz === id) SK.tts.voz = null;
    SK.vozes = null; SK.banco = null; skTtsRedesenhar();
    return true;
}
Object.assign(window.SKN, {
    tts: op => { Object.assign(skTtsOp(), op || {}); skTtsGuardar(); skTtsRedesenhar(); return skGerarTts(); },
    conversa: async (roteiro, op) => { if (!SK.vozes) SK.vozes = await skApi().sk_vozes(); const o = skTtsOp(); o.modo = 'conversa'; Object.assign(o, op || {}); skRoteiro(roteiro); skTtsRedesenhar(); return skGerarConversa(); },
    personagens: () => skTtsOp().pers,
    darVoz: async (personagem, voz) => { if (!SK.vozes) SK.vozes = await skApi().sk_vozes(); const p = skTtsOp().pers.find(x => x.nome === personagem || x.id === personagem); const v = (SK.vozes?.vozes || []).find(x => x.id === voz || x.nome === voz); if (!p || !v) throw new Error('personagem ou voz não encontrada'); p.voz = v.id; skTtsGuardar(); skTtsRedesenhar(); return p; },
    bancoVozes: () => skApi().sk_banco('estado'),
    desenharVoz: d => { Object.assign(skTtsOp().desenho, d || {}); return skDesenharVoz(); },
});
