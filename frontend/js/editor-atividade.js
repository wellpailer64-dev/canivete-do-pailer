// Atividade em segundo plano (como a bolinha do Premiere): no cabeçalho do editor, uma bolinha que gira enquanto o
// app lê/prepara mídias; clique = lista ao vivo do que está carregando, na fila, pronto e com erro.
// Alimentada pelos eventos da preparação (veOnMidia → veAtvEvento) e pela fila da página (VEPJF).
const VEATV = { itens: {}, aberto: false, timer: null };

function veAtvNome(id) {
    const m = VE.media && VE.media[id];
    return m ? (typeof vePjNome === 'function' ? vePjNome(m) : (m.nome || m.name || 'Mídia')) : 'Mídia';
}
function veAtvEvento(ev) {
    const it = VEATV.itens[ev.id] || (VEATV.itens[ev.id] = { id: ev.id, t0: Date.now() });
    it.t = Date.now();
    switch (ev.stage) {
        case 'info':
            it.etapa = ev.leve ? 'miniaturas' : ev.needs_proxy ? 'espera' : 'lendo';
            it.dur = ev.duration;
            break;
        case 'proxy': it.etapa = 'previa'; it.pct = ev.pct; if (ev.tentativa) it.tentativa = ev.tentativa; break;
        case 'audio': it.audio = true; break;
        case 'video':
            if (ev.parcial) { it.parcial = true; it.etapa = 'completa'; }   // trechos prontos: já dá para tocar
            else { it.etapa = 'pronto'; it.parcial = false; it.fim = Date.now(); }
            it.pct = 100;
            break;
        case 'thumbs': it.thumbs = true; break;
        case 'done':
            if (it.parcial) it.etapa = 'completa';               // prévia dos trechos pronta; a inteira sai no fundo
            else if (it.etapa !== 'pronto') { it.etapa = ev.leve ? 'painel' : 'pronto'; it.fim = Date.now(); }
            break;
        case 'error': it.etapa = 'erro'; it.erro = ev.error; it.fim = Date.now(); break;
    }
    veAtvAgendar();
}
window.veAtvEvento = veAtvEvento;

// Conversor de prévias antigas (Sequência › Converter prévias antigas): bloco próprio no topo da lista
function veAtvConversor(ev) {
    VEATV.conv = ev.fim ? { ...ev, t: Date.now() } : ev;
    veAtvAgendar();
}
window.veAtvConversor = veAtvConversor;
function veAtvConvHtml() {
    const c = VEATV.conv;
    if (!c || (c.fim && Date.now() - c.t > 5 * 60000)) return '';
    const bytes = b => typeof veCacheBytesTxt === 'function' ? veCacheBytesTxt(b) : `${(b / 1e9).toFixed(1)} GB`;
    const lib = c.liberado ? ` · ${bytes(c.liberado)} ${veT('liberados')}` : '';
    if (c.fim) return `<div class="ve-atv-conv fim"><b>${veT('Prévias convertidas para leves')}: ${c.feitos} ${veT('de')} ${c.total}</b><small>${lib.slice(3)}</small></div>`;
    const pct = Math.max(0, Math.min(100, c.pct || 0)), geral = (c.feitos + pct / 100) / Math.max(1, c.total) * 100;
    const esc = s => String(s).replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
    return `<div class="ve-atv-conv"><b><i class="ve-atv-gira"></i> ${veT('Convertendo prévias para leves')}: ${c.feitos + 1} ${veT('de')} ${c.total}${lib}</b>
        <span class="ve-atv-barra"><span style="width:${geral.toFixed(1)}%"></span></span>
        <small>${esc(c.nome)} · ${pct}%</small><span class="ve-atv-barra fina"><span style="width:${pct}%"></span></span></div>`;
}

const VEATV_TXT = {
    fila: 'Na fila', lendo: 'Lendo o arquivo', espera: 'Esperando vaga para a prévia', previa: 'Gerando prévia leve',
    parcial: 'Prévia dos trechos da timeline', completa: 'Trechos prontos · prévia completa no fundo',
    miniaturas: 'Miniaturas (só no painel)', painel: 'Pronto no painel (prévia quando for usado)', pronto: 'Pronto', erro: 'Erro',
};
const VEATV_ATIVO = new Set(['fila', 'lendo', 'espera', 'previa', 'parcial', 'completa', 'miniaturas']);

function veAtvLista() {
    const out = [], vistos = new Set();
    const pj = typeof VEPJF !== 'undefined' ? VEPJF : { fila: [], ativos: new Set() };
    for (const it of Object.values(VEATV.itens)) {
        if (!VE.media || !VE.media[it.id] || VE.media[it.id].removido) continue;
        vistos.add(it.id);
        out.push({ ...it });
    }
    pj.fila.forEach((id, i) => { if (!vistos.has(id)) out.push({ id, etapa: 'fila', ordem: i }); });
    pj.ativos.forEach(id => { if (!vistos.has(id) && !pj.fila.includes(id)) out.push({ id, etapa: 'lendo' }); });
    const peso = e => ({ previa: 0, parcial: 1, espera: 2, lendo: 3, miniaturas: 4, completa: 5, fila: 6, erro: 7 }[e] ?? 8);
    out.sort((a, b) => peso(a.etapa) - peso(b.etapa) || (a.ordem ?? 0) - (b.ordem ?? 0) || (b.fim || 0) - (a.fim || 0));
    return out;
}
// Comps da timeline aberta que ainda não têm o render em dia (o monitor as desenha ao vivo ou mostra "Preparando
// prévia…"): a que está renderizando agora (VECOMP.atual, com %) e as que esperam a vez, na ordem da timeline
function veAtvComps() {
    if (typeof VECOMP === 'undefined' || !VE.media || !VE.clips) return [];
    const vistos = new Set(), out = [];
    const at = VECOMP.atual;
    [...VE.clips].sort((a, b) => a.st - b.st).forEach(c => {
        const m = VE.media[c.m || 0];
        if (!m || m.removido || !m.comp || vistos.has(m.id)) return;
        vistos.add(m.id);
        const agora = at && at.mid === m.id;
        if (!agora && m.url && !m._aoVivo) return;
        out.push({ id: m.id, comp: true, etapa: agora ? 'renderizando' : VECOMP.pausado ? 'pausada' : 'nafila', pct: agora ? at.pct : null, st: c.st });
    });
    return out;
}
function veAtvContagem(lista, comps = veAtvComps()) {
    const conv = VEATV.conv && !VEATV.conv.fim ? 1 : 0;   // a conversão em andamento conta como uma atividade
    return { ativos: lista.filter(x => VEATV_ATIVO.has(x.etapa)).length + conv + comps.length, erros: lista.filter(x => x.etapa === 'erro').length };
}

function veAtvAgendar() {
    if (VEATV.timer) return;
    VEATV.timer = setTimeout(() => { VEATV.timer = null; veAtvRender(); }, 250);   // vários eventos por segundo: 4 telas/s no máximo
}
function veAtvRender() {
    const b = document.getElementById('ve-atv-btn');
    if (!b) return;
    const lista = veAtvLista(), comps = veAtvComps(), n = veAtvContagem(lista, comps);
    b.classList.toggle('girando', n.ativos > 0);
    b.classList.toggle('erro', !n.ativos && n.erros > 0);
    b.hidden = !n.ativos && !n.erros && !lista.length && !veAtvConvHtml();
    b.title = n.ativos ? `Preparando ${n.ativos} item(ns) — clique para ver` : 'Atividade em segundo plano';
    b.querySelector('.ve-atv-n').textContent = n.ativos ? String(n.ativos) : '';
    if (VEATV.aberto) veAtvPopRender(lista, n, comps);
}
const VEATV_PREP = new Set(['fila', 'lendo', 'espera', 'previa', 'parcial', 'completa', 'miniaturas']);
function veAtvPopRender(lista, n, comps = veAtvComps()) {
    const pop = document.getElementById('ve-atv-pop');
    if (!pop) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const linha = it => {
        if (it.comp) {
            const pct = it.pct != null ? Math.max(0, Math.min(100, Math.round(it.pct))) : null;
            const txt = it.etapa === 'renderizando' ? `Renderizando a Comp${pct != null ? ` ${pct}%` : ''}`
                : it.etapa === 'pausada' ? 'Comp na fila · o render espera o play parar' : 'Comp na fila de render';
            return `<div class="ve-atv-item ${it.etapa === 'renderizando' ? 'previa' : 'fila'}" data-id="${it.id}" title="Clique: mostrar no painel Projeto">
            <span class="ve-atv-marca">${it.etapa === 'renderizando' ? '<i class="ve-atv-gira"></i>' : '·'}</span>
            <span class="ve-atv-txt"><b>${esc(veAtvNome(it.id))}</b><small>${esc(txt)}</small>
            ${it.etapa === 'renderizando' ? `<span class="ve-atv-barra"><span style="width:${pct || 0}%"></span></span>` : ''}</span></div>`;
        }
        const pct = it.etapa === 'previa' || it.etapa === 'parcial' ? Math.max(0, Math.min(100, Math.round(it.pct || 0))) : null;
        const txt = VEATV_TXT[it.etapa] || (/^done$/i.test(it.etapa || '') ? 'Pronto' : it.etapa);
        const extra = it.etapa === 'erro' ? `: ${esc(it.erro || '')}` : pct != null ? ` ${pct}%` : it.tentativa ? ` (tentativa ${it.tentativa})` : '';
        const marca = it.etapa === 'pronto' || it.etapa === 'painel' || /^done$/i.test(it.etapa || '') ? '✓' : it.etapa === 'erro' ? '!' : VEATV_ATIVO.has(it.etapa) && it.etapa !== 'fila' ? '<i class="ve-atv-gira"></i>' : '·';
        return `<div class="ve-atv-item ${it.etapa}" data-id="${it.id}" title="Clique: mostrar no painel Projeto">
            <span class="ve-atv-marca">${marca}</span>
            <span class="ve-atv-txt"><b>${esc(veAtvNome(it.id))}</b><small>${esc(txt)}${extra}</small>
            ${pct != null ? `<span class="ve-atv-barra"><span style="width:${pct}%"></span></span>` : ''}</span></div>`;
    };
    // duas colunas: o que já foi carregado (e erros) · o que está sendo preparado (versões leves e Comps)
    const prep = [...lista.filter(x => VEATV_PREP.has(x.etapa)), ...comps];
    const feitos = lista.filter(x => !VEATV_PREP.has(x.etapa));
    const linhas = feitos.slice(0, 200).map(linha).join('');
    const linhasP = prep.slice(0, 200).map(linha).join('');
    const cab = n.ativos ? `Preparando ${n.ativos} item(ns)` : 'Nada sendo preparado agora';
    pop.innerHTML = `<div class="ve-atv-cab"><b>${cab}</b>
        <span class="ve-atv-cab-acoes">${lista.some(x => x.etapa === 'pronto' || x.etapa === 'painel' || x.etapa === 'erro') ? '<button class="ve-btn ve-btn-ghost" id="ve-atv-limpar">Limpar concluídos</button>' : ''}
        <button class="ve-pop-x" id="ve-atv-x" title="Fechar (Esc)">×</button></span></div>
        ${veAtvConvHtml()}
        <div class="ve-atv-cols">
            <div class="ve-atv-col"><div class="ve-atv-coltit">Carregados</div>
                <div class="ve-atv-lista">${linhas || '<div class="ve-atv-vazio">Nenhum arquivo carregado ainda.</div>'}</div></div>
            <div class="ve-atv-col"><div class="ve-atv-coltit">Preparando versões leves e prévias${prep.length ? ` · ${prep.length}` : ''}</div>
                <div class="ve-atv-lista">${linhasP || '<div class="ve-atv-vazio">Tudo pronto: versões leves e Comps em dia.</div>'}</div></div>
        </div>`;
    document.getElementById('ve-atv-x').onclick = e => { e.stopPropagation(); VEATV.aberto = false; pop.hidden = true; };
    const lp = document.getElementById('ve-atv-limpar');
    if (lp) lp.onclick = e => {
        e.stopPropagation();
        for (const [id, it] of Object.entries(VEATV.itens)) if (!VEATV_ATIVO.has(it.etapa)) delete VEATV.itens[id];
        veAtvRender();
    };
    pop.querySelectorAll('.ve-atv-item').forEach(el => el.onclick = () => {
        if (typeof veMostrarNoProjeto === 'function') veMostrarNoProjeto({ m: +el.dataset.id });
    });
}
function veAtvAlternar(e) {
    if (e) e.stopPropagation();
    VEATV.aberto = !VEATV.aberto;
    const pop = document.getElementById('ve-atv-pop');
    pop.hidden = !VEATV.aberto;
    if (VEATV.aberto) veAtvRender();
}

(function () {
    const exp = document.getElementById('ve-export-btn');
    if (!exp || document.getElementById('ve-atv-btn')) return;
    const caixa = document.createElement('div');
    caixa.className = 've-atv';
    caixa.innerHTML = '<button class="ve-atv-btn" id="ve-atv-btn" hidden><span class="ve-atv-anel"></span><span class="ve-atv-n"></span></button>' +
        '<div class="ve-atv-pop" id="ve-atv-pop" hidden></div>';
    exp.parentNode.insertBefore(caixa, document.getElementById('ve-fila-btn') || exp);
    document.getElementById('ve-atv-btn').onclick = veAtvAlternar;
    document.getElementById('ve-atv-pop').onclick = e => e.stopPropagation();
    // fecha ao clicar fora (pointerdown na CAPTURA: o editor cancela o mousedown em vários painéis) e com Esc
    const fechar = () => { VEATV.aberto = false; document.getElementById('ve-atv-pop').hidden = true; };
    document.addEventListener('pointerdown', e => { if (VEATV.aberto && !caixa.contains(e.target)) fechar(); }, true);
    document.addEventListener('keydown', e => { if (VEATV.aberto && e.key === 'Escape') fechar(); }, true);
    // clique numa janela solta (timeline, painéis) não chega a este documento: a janela perde o foco — fecha também
    window.addEventListener('blur', () => { if (VEATV.aberto) fechar(); });
    setInterval(() => { if (typeof VEPJF !== 'undefined' && (VEPJF.fila.length || VEPJF.ativos.size || VEATV.aberto || (typeof VECOMP !== 'undefined' && VECOMP.atual))) veAtvRender(); }, 1000);
})();
window.VEATV_API = { lista: () => veAtvLista().map(x => ({ ...x, nome: veAtvNome(x.id) })), abrir: () => { if (!VEATV.aberto) veAtvAlternar(); } };
