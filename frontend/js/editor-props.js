// =========================================================
// Pocket Editor — painel Propriedades, ferramenta Texto (T) e ferramenta Velocidade (R)
// Como no Premiere Pro 25: o painel Propriedades mostra só os controles mais usados do que está selecionado
// (texto, vídeo, imagem, áudio, legenda) e muda sozinho com a seleção; os quadros-chave e a lista completa de
// efeitos continuam em Controles de efeito. Texto: T e clique no monitor cria um clipe de texto na trilha livre
// acima do vídeo, digitado direto na tela. Velocidade: R e arrastar a borda de um clipe muda a velocidade
// para ele caber no novo tamanho (Rate Stretch).
// Clipe de texto = clipe de imagem (kind 'texto') cujo "arquivo" é desenhado aqui a partir de c.tx; na
// exportação vira PNG do mesmo desenho (fica idêntico à prévia, com qualquer fonte instalada).
// =========================================================

const VE_TX_PADRAO = {
    t: '', fonte: 'Arial', tam: 100, neg: true, ita: false, alin: 'center', esp: 0, ent: 120,
    cor: '#ffffff',
    cOn: false, cCor: '#000000', cLarg: 6,
    fOn: false, fCor: '#000000', fOp: 60, fPad: 24, fRaio: 12,
    sOn: false, sCor: '#000000', sOp: 60, sDist: 6, sBlur: 10,
};
const VE_TX_DUR = 5;

const VEPP = { chave: '', fontes: null, estilos: null, ripple: true, edit: null, cache: new Map() };

// ── família e estilo (Light, Regular, Semibold, Bold, Italic...) ──
// Desenho (prévia e .ass) usa o nome "de sistema" da fonte + negrito/itálico: é como o Windows, o navegador e o
// libass acham cada estilo (Arial Narrow, Segoe UI Semibold...). fam/estilo são só para o seletor.
function veFonteFamilia(o) {
    if (o.fam && (!VEPP.estilos || VEPP.estilos[o.fam])) return o.fam;
    if (VEPP.estilos) for (const [f, lista] of Object.entries(VEPP.estilos)) if (lista.some(e => e.gdi === o.fonte)) return f;
    return o.fonte;
}
function veFonteEstiloAtual(o, neg, ita) {
    const lista = VEPP.estilos && VEPP.estilos[veFonteFamilia(o)];
    const e = lista && lista.find(e => e.gdi === o.fonte && e.gdi_negrito === !!neg && e.gdi_italico === !!ita);
    return e ? e.estilo : '';
}
// Estilo "Regular" da família (ou o mais perto de 400, sem itálico)
function veFontePadrao(fam) {
    const lista = (VEPP.estilos && VEPP.estilos[fam]) || [];
    return lista.find(e => /^(regular|normal|book|roman)$/i.test(e.estilo)) ||
        [...lista].filter(e => !e.italico).sort((a, b) => Math.abs(a.peso - 400) - Math.abs(b.peso - 400))[0] || lista[0];
}
function veFonteEstilos(k) {
    return `<select data-pp="${k}" class="ve-pp-estilo" title="Estilo da fonte"></select>`;
}

function veIsTexto(c) { const m = c && veMediaOf(c); return !!m && m.kind === 'texto'; }
function veTxt(c) { return Object.assign({}, VE_TX_PADRAO, (c && c.tx) || {}); }
function veNomeTexto(c) { return (veTxt(c).t.split('\n').find(l => l.trim()) || veT('Texto')).trim(); }

// ─────────────────────────── desenho do texto ───────────────────────────
let veTxMedidor = null;
function veTxFonte(x, tam) { return `${x.ita ? 'italic ' : ''}${x.neg ? 'bold ' : ''}${tam}px "${x.fonte}", Arial, sans-serif`; }

// Medidas do bloco de texto em pixels do quadro (tamanho "lógico" do clipe)
function veTxLayout(x) {
    if (!veTxMedidor) veTxMedidor = document.createElement('canvas').getContext('2d');
    const ctx = veTxMedidor;
    ctx.font = veTxFonte(x, x.tam);
    ctx.letterSpacing = (x.esp / 1000 * x.tam) + 'px';
    const linhas = String(x.t || '').split('\n');
    const mt = ctx.measureText('Hg');
    const asc = mt.fontBoundingBoxAscent || x.tam * 0.9, desc = mt.fontBoundingBoxDescent || x.tam * 0.22;
    const lh = x.tam * x.ent / 100;
    const larg = linhas.map(l => ctx.measureText(l).width);
    const tw = Math.max(x.tam * 0.35, ...larg), th = (linhas.length - 1) * lh + asc + desc;
    const m = Math.ceil((x.fOn ? x.fPad : 0) + (x.cOn ? x.cLarg : 0) + (x.sOn ? x.sDist + x.sBlur * 1.5 : 0) + 4);
    return { linhas, larg, asc, desc, lh, tw, th, m, w: Math.ceil(tw + 2 * m), h: Math.ceil(th + 2 * m) };
}

function veTxRGBA(hex, op) {
    const h = String(hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16) || 0;
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${op})`;
}

// Canvas do texto em f pixels por pixel do quadro (a prévia pede o tamanho em que ele aparece na tela)
function veTxDesenho(x, f) {
    const L = veTxLayout(x);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(L.w * f));
    cv.height = Math.max(1, Math.ceil(L.h * f));
    const ctx = cv.getContext('2d');
    ctx.scale(f, f);
    if (x.fOn) {
        ctx.fillStyle = veTxRGBA(x.fCor, x.fOp / 100);
        const r = Math.min(x.fRaio, (L.th + 2 * x.fPad) / 2);
        ctx.beginPath();
        ctx.roundRect(L.m - x.fPad, L.m - x.fPad, L.tw + 2 * x.fPad, L.th + 2 * x.fPad, Math.max(0, r));
        ctx.fill();
    }
    ctx.font = veTxFonte(x, x.tam);
    ctx.letterSpacing = (x.esp / 1000 * x.tam) + 'px';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = x.alin === 'left' ? 'left' : x.alin === 'right' ? 'right' : 'center';
    const px = x.alin === 'left' ? L.m : x.alin === 'right' ? L.m + L.tw : L.m + L.tw / 2;
    // sombra (em pixels do canvas: o shadow* não acompanha a escala)
    const sombra = on => {
        if (on && x.sOn) {
            ctx.shadowColor = veTxRGBA(x.sCor, x.sOp / 100);
            ctx.shadowBlur = x.sBlur * f;
            ctx.shadowOffsetX = ctx.shadowOffsetY = x.sDist * 0.7071 * f;
        } else ctx.shadowColor = 'transparent';
    };
    L.linhas.forEach((l, k) => {
        const y = L.m + L.asc + k * L.lh;
        if (x.cOn && x.cLarg > 0) {
            sombra(true);
            ctx.lineJoin = 'round';
            ctx.lineWidth = x.cLarg * 2;
            ctx.strokeStyle = x.cCor;
            ctx.strokeText(l, px, y);
            sombra(false);
        } else sombra(true);
        ctx.fillStyle = x.cor;
        ctx.fillText(l, px, y);
        sombra(false);
    });
    return { cv, w: L.w, h: L.h };
}

// Com cache (vários quadros seguidos pedem o mesmo desenho)
function veTxCanvas(c, alvo) {
    const x = veTxt(c);
    const f = Math.min(4, Math.max(0.25, Math.ceil((alvo || 1) * 4) / 4));
    const k = JSON.stringify(x) + '|' + f;
    let r = VEPP.cache.get(k);
    if (!r) {
        r = veTxDesenho(x, f);
        VEPP.cache.set(k, r);
        if (VEPP.cache.size > 60) VEPP.cache.delete(VEPP.cache.keys().next().value);
    }
    return r;
}

function veTxTamanho(c) { const L = veTxLayout(veTxt(c)); return { w: L.w, h: L.h }; }

// Exportação: cada clipe de texto vira um PNG no tamanho em que ele aparece (a maior escala dele)
async function veTxPngs() {
    const mapa = new Map();
    for (const c of VE.clips.filter(veIsTexto)) {
        const p = veStaticProps(c);
        const escalas = [p.sc].concat(veKfOn(c, 'sc') ? c.k.sc.map(q => q.v) : []);
        const f = Math.min(4, Math.max(1, Math.max(...escalas) / 100));
        const d = veTxDesenho(veTxt(c), f);
        const r = await window.pywebview.api.ve_salvar_png(d.cv.toDataURL('image/png'));
        if (r && r.success) mapa.set(c, { path: r.path, f, w: d.cv.width, h: d.cv.height });
    }
    VE._txPng = mapa;
}

// ─────────────────────────── ferramenta Texto (T) ───────────────────────────
function veTxMidia() {
    let m = VE.media.find(x => x.kind === 'texto');
    if (!m) { m = { id: VE.media.length, kind: 'texto', name: 'Texto' }; VE.media.push(m); }
    return m;
}

// Onde o quadro aparece na tela: o canvas ocupa o monitor todo e mostra o quadro encaixado (object-fit:
// contain), com faixas nas sobras; o zoom do monitor já vem no retângulo (transform)
function veTxQuadroTela() {
    const r = $ve('ve-canvas').getBoundingClientRect();
    const s = Math.min(r.width / VE.seqW, r.height / VE.seqH);
    return { x0: r.left + (r.width - VE.seqW * s) / 2, y0: r.top + (r.height - VE.seqH * s) / 2, s };
}

// Ponto da tela → pixel do quadro
function veTxPontoQuadro(e) {
    const q = veTxQuadroTela();
    return { x: (e.clientX - q.x0) / q.s, y: (e.clientY - q.y0) / q.s };
}

// Clipe de texto visível sob o ponto (o da trilha mais alta)
function veTxClipeEm(pt) {
    return veTfClipeEm(pt, veIsTexto);
}

function veTxNovo(pt) {
    if (!VE.ready) return;
    if (VE.info && VE.info.audio_only) { veToast('Texto precisa de um vídeo'); return; }
    if (VE.playing) veStop();
    const m = veTxMidia();
    const st = veSnapFrame(VE.playhead), b = st + VE_TX_DUR, novo = { m: m.id };
    let tr = [1, 2, 3].find(k => !veTrkLocked(k) && veTrackFree(k, st, b, novo));
    if (tr == null) tr = [0].find(k => !veTrkLocked(k) && veTrackFree(k, st, b, novo));
    if (tr == null) { veToast('Não há trilha de vídeo livre na agulha para o texto (V1 a V4)'); return; }
    vePushHistory();
    // como no Premiere: o texto novo começa no ponto clicado (alinhado à esquerda) e cresce para a direita
    const clip = { tr, st, s: 0, e: VE_TX_DUR, m: m.id, tx: { ...VE_TX_PADRAO, alin: 'left' }, p: { sc: 100, x: Math.round(pt.x), y: Math.round(pt.y), rot: 0, op: 100 } };
    VE.clips.push(clip);
    VE.sel = VE.clips.indexOf(clip);
    veRelayout();
    veAfterEdit(VE.playhead);
    vedShow('pp');
    veTxEditar(VE.sel, true);
}

// Digitar direto no monitor: uma caixa de texto transparente por cima do desenho (o monitor mostra o
// resultado de verdade a cada tecla; a caixa só dá o cursor e a seleção)
function veTxEditar(i, novo) {
    veTxEditarFim();
    const c = VE.clips[i];
    if (!c || !veIsTexto(c)) return;
    if (VE.playing) veStop();
    if (!veInClip(c)) veSeek(c.st);
    const scr = $ve('ve-screen'), doc = scr.ownerDocument;
    const ta = doc.createElement('textarea');
    ta.className = 've-tx-edit';
    ta.spellcheck = false;
    ta.value = veTxt(c).t;
    scr.appendChild(ta);
    VEPP.edit = { c, ta, novo, hist: !!novo, x0: novo ? c.p.x : null };
    if (novo) veTxAncorar();
    veTxEditarPos();
    ta.focus();
    ta.select();
    ta.addEventListener('input', () => {
        const ed = VEPP.edit;
        if (!ed) return;
        if (!ed.hist) { vePushHistory(); ed.hist = true; }
        ed.c.tx = { ...veTxt(ed.c), t: ta.value };
        veTxAncorar();
        veTxEditarPos();
        veDrawMonitorSoon();
        veDraw();
        vePpRender();
    });
    ta.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); veTxEditarFim(); }
    });
    ta.addEventListener('pointerdown', e => e.stopPropagation());
    ta.addEventListener('blur', () => setTimeout(() => { if (VEPP.edit && VEPP.edit.ta === ta) veTxEditarFim(); }, 0));
}

// Texto recém-criado: a borda esquerda fica no ponto do clique enquanto ele é digitado
function veTxAncorar() {
    const ed = VEPP.edit;
    if (!ed || ed.x0 == null || veKfOn(ed.c, 'x')) return;
    const L = veTxLayout(veTxt(ed.c)), k = veStaticProps(ed.c).sc / 100;
    ed.c.p = { ...veStaticProps(ed.c), x: Math.round(ed.x0 + (L.w / 2 - L.m) * k) };
}

// Posiciona a caixa sobre o texto no monitor (mesma fonte, tamanho e alinhamento, na escala da tela)
function veTxEditarPos() {
    const ed = VEPP.edit;
    if (!ed) return;
    const c = ed.c, x = veTxt(c), L = veTxLayout(x), p = veProps(c);
    const q = veTxQuadroTela(), rs = $ve('ve-screen').getBoundingClientRect();
    const k = q.s * p.sc / 100;
    const s = ed.ta.style;
    const ctr = veTfQuadro(c, p, L.w / 2, L.h / 2, { w: L.w, h: L.h });   // centro do texto no quadro (com a âncora)
    const cx = q.x0 - rs.left + ctr.x * q.s, cy = q.y0 - rs.top + ctr.y * q.s;
    s.width = (L.w * k) + 'px';
    s.height = (L.h * k) + 'px';
    s.left = (cx - L.w * k / 2) + 'px';
    s.top = (cy - L.h * k / 2) + 'px';
    s.transform = `rotate(${p.rot}deg)`;
    s.font = veTxFonte(x, x.tam * k);
    s.letterSpacing = (x.esp / 1000 * x.tam * k) + 'px';
    s.lineHeight = (L.lh * k) + 'px';
    s.textAlign = x.alin;
    // a linha do CSS centraliza o texto na altura da linha; o desenho põe a 1ª linha de base em m + asc
    s.paddingTop = ((L.m - (L.lh - L.asc - L.desc) / 2) * k) + 'px';
    s.paddingLeft = s.paddingRight = (L.m * k) + 'px';
}

function veTxEditarFim() {
    const ed = VEPP.edit;
    if (!ed) return;
    VEPP.edit = null;
    ed.ta.remove();
    const i = VE.clips.indexOf(ed.c);
    // texto vazio não fica na timeline (como no Premiere)
    if (i >= 0 && !veTxt(ed.c).t.trim()) {
        if (ed.novo) { VE.history.pop(); veUpdateUndo(); }
        VE.clips.splice(i, 1);
        VE.sel = -1;
        veRelayout();
    }
    veRefresh();
}

// ─────────────────────────── ferramenta Velocidade (R) ───────────────────────────
// Arrastar a borda muda a duração sem mudar o conteúdo: a velocidade vira (trecho da fonte) / (nova duração)
function veRatePointer(e, x, row) {
    const borda = veEdgeAt(x, row);
    if (!borda) {
        const { t } = veTimeFromEvent(e);
        const i = row && row.kind !== 'l' ? veClipAtTrack(t, veTrackIndex(row), row.kind) : -1;
        VE.sel = i;
        veRenderClips(); veRenderProps(); veDraw();
        if (i >= 0) veToast('Velocidade (R): arraste a borda do clipe para acelerar ou desacelerar');
        return;
    }
    const c = VE.clips[borda.i];
    if (veLocked(c)) { veAvisoBloqueio(); return; }
    if (VE.playing) veStop();
    VE.sel = borda.i;
    VE.drag = { mode: 'rate', i: borda.i, side: borda.side, c0: { ...c }, started: false };
    $ve('ve-tl-wrap').classList.add('trimming');
    veRenderClips(); veRenderProps(); veDraw();
}

function veRateArrastar(t) {
    const d = VE.drag, c = VE.clips[d.i], c0 = d.c0;
    if (!d.started) { vePushHistory(); d.started = true; }
    if (veIsImage(c)) { veTrimTo(d, t); return; }   // imagem/texto/ajuste não têm velocidade: só a duração
    t = veMoveSnap(t, d.i);
    const fonte = c0.e - c0.s, fim0 = veEnd(c0);
    const viz = VE.clips.filter((o, j) => j !== d.i && o.tr === c0.tr && veConflita(o, c0));
    let v;
    if (d.side === 'r') {
        const lim = Math.min(Infinity, ...viz.filter(o => o.st >= fim0 - VE_EPS).map(o => o.st));
        v = fonte / Math.max(veFrame(), Math.min(t, lim) - c0.st);
        v = Math.min(VE_VEL_MAX, Math.max(VE_VEL_MIN, v));
        c.st = c0.st;
    } else {
        const lim = Math.max(0, ...viz.filter(o => veEnd(o) <= c0.st + VE_EPS).map(veEnd));
        v = fonte / Math.max(veFrame(), fim0 - Math.max(t, lim));
        v = Math.min(VE_VEL_MAX, Math.max(VE_VEL_MIN, v));
        c.st = fim0 - fonte / v;
    }
    if (Math.abs(v - 1) < 0.004) { delete c.v; if (d.side === 'l') c.st = fim0 - fonte; } else c.v = v;
}

// Velocidade pelo painel (como Velocidade/Duração do Premiere). ripple: empurra/puxa o que vem depois na
// mesma trilha; sem ripple, se não couber, o clipe é aparado no começo do próximo
function veMudarVelocidade(c, v) {
    v = Math.min(VE_VEL_MAX, Math.max(VE_VEL_MIN, v));
    const fim0 = veEnd(c);
    const depois = VE.clips.filter(o => o !== c && o.tr === c.tr && veConflita(o, c) && o.st >= fim0 - VE_EPS);
    if (Math.abs(v - 1) < 1e-4) delete c.v; else c.v = v;
    const d = veEnd(c) - fim0;
    if (VEPP.ripple) depois.forEach(o => { o.st = Math.max(0, o.st + d); });
    else if (d > 0 && depois.length) {
        const lim = Math.min(...depois.map(o => o.st));
        if (veEnd(c) > lim) c.e = veSrcAt(c, lim);
    }
}

// ─────────────────────────── painel Propriedades ───────────────────────────
function vePpAlvo() {
    const c = VE.clips[VE.sel];
    if (c) return { tipo: veIsTexto(c) ? 'texto' : veIsAudio(c) ? 'audio' : veIsAdj(c) ? 'ajuste' : veIsImage(c) ? 'imagem' : 'video', c };
    if (VETX.legSel >= 0 && (VE.legendas || [])[VETX.legSel]) return { tipo: 'legenda' };
    return { tipo: 'nada' };
}

const vePpNum = (k, rot, min, max, passo, un) => `
    <div class="ve-pp-l"><label>${rot}</label>
        <input type="range" data-pp="${k}" min="${min}" max="${max}" step="${passo}">
        <span class="ve-prop-num"><input type="number" data-pp="${k}" min="${min}" max="${max}" step="${passo}"><i>${un}</i></span></div>`;
const vePpCor = (k, rot) => `<label class="ve-pp-cor">${rot}<input type="color" data-pp="${k}"></label>`;
const vePpChk = (k, rot) => `<label class="ve-pp-chk"><input type="checkbox" data-pp="${k}"> ${rot}</label>`;
const vePpSec = (tit, corpo, fechada) => `<details class="ve-pp-sec"${fechada ? '' : ' open'}><summary>${tit}</summary><div class="ve-pp-corpo">${corpo}</div></details>`;

function vePpFontes(k) {
    const lista = VEPP.fontes || ['Arial', 'Segoe UI', 'Times New Roman', 'Verdana', 'Impact'];
    return `<select data-pp="${k}" class="ve-pp-fonte">${lista.map(f => `<option value="${veTxEsc(f)}">${veTxEsc(f)}</option>`).join('')}</select>`;
}

function vePpHtml(a) {
    const c = a.c;
    const links = alvos => `<div class="ve-pp-links">${alvos.map(([p, r]) => `<button class="ve-btn ve-btn-sm ve-btn-ghost" data-ppir="${p}">${r} ›</button>`).join('')}</div>`;
    const transformar = (alinhar, ajustar) => vePpSec('Alinhar e transformar', `
        ${alinhar ? `<div class="ve-pp-botoes">
            <button class="ve-btn ve-btn-sm" data-ppacao="alin-h" title="Centralizar na horizontal">⇹ Centro H</button>
            <button class="ve-btn ve-btn-sm" data-ppacao="alin-v" title="Centralizar na vertical">⇳ Centro V</button></div>` : ''}
        ${ajustar ? `<div class="ve-pp-botoes">
            <button class="ve-btn ve-btn-sm" data-ppacao="ajustar" title="Mostra o quadro inteiro, com faixas se a proporção for outra">Ajustar ao quadro</button>
            <button class="ve-btn ve-btn-sm" data-ppacao="preencher" title="Cobre o quadro inteiro, cortando o que sobrar">Preencher o quadro</button></div>` : ''}
        ${vePpNum('p.x', 'Posição X', -VE.seqW, VE.seqW * 2, 1, 'px')}
        ${vePpNum('p.y', 'Posição Y', -VE.seqH, VE.seqH * 2, 1, 'px')}
        ${vePpNum('p.sc', 'Escala', 1, 400, 0.5, '%')}
        ${vePpNum('p.rot', 'Rotação', -180, 180, 0.5, '°')}
        ${vePpNum('p.op', 'Opacidade', 0, 100, 1, '%')}
        <div class="ve-pp-anc">
            <div class="ve-pp-grade" title="Ponto de ancoragem: clique para escolher (o objeto não sai do lugar)">
                ${[0, 0.5, 1].map(v => [0, 0.5, 1].map(u => `<button data-ppanc="${u},${v}"></button>`).join('')).join('')}
            </div>
            <div class="ve-pp-anc-num"><label>Ponto de ancoragem</label>
                <span class="ve-prop-num"><input type="number" data-pp="p.ax" step="1"><i>X</i></span>
                <span class="ve-prop-num"><input type="number" data-pp="p.ay" step="1"><i>Y</i></span></div>
        </div>
        <small class="ve-pp-dica">No monitor: arraste as alças para escalar, por fora dos cantos para girar e a mira ⊕ para mudar o ponto de ancoragem.</small>`);
    const velocidade = () => vePpSec('Velocidade', `
        ${vePpNum('vel', 'Velocidade', 10, 400, 1, '%')}
        <div class="ve-pp-l"><label>Duração</label><span></span><span class="ve-prop-num"><input type="number" data-pp="dur" min="0.04" step="0.01"><i>s</i></span></div>
        ${c && !veIsAudio(c) && !(VE.info && VE.info.has_audio) ? '' : vePpChk('tom', 'Manter o tom do áudio')}
        ${vePpChk('ripple', 'Empurrar os clipes seguintes da trilha')}
        <small class="ve-pp-dica">Também dá para arrastar a borda do clipe com a ferramenta Velocidade (R).</small>`);
    const volume = () => vePpSec('Áudio', vePpNum('g', 'Volume', -40, 15, 0.1, 'dB'));
    const cab = (nome, sub) => `<div class="ve-pp-cab"><b>${nome}</b><span>${sub}</span></div>`;

    if (a.tipo === 'nada') {
        return `<div class="ve-clips-empty">${VE.ready
            ? 'Selecione um clipe, texto ou legenda para ver as propriedades dele aqui.<br><br>Dica: <b>T</b> e clique no monitor cria um texto · <b>R</b> e arraste a borda de um clipe muda a velocidade.'
            : 'Abra um vídeo para começar.'}</div>
            ${VE.ready ? `<div class="ve-pp-seq">${VE.seqW}×${VE.seqH} · ${String(+(VE.fps || 30).toFixed(3)).replace('.', ',')} qps · ${veShort(VE.dur)}</div>` : ''}`;
    }
    if (a.tipo === 'legenda') {
        return cab('Legenda', `${VETX.legSel + 1} de ${VE.legendas.length} · trilha LEG`) +
            vePpSec('Texto da legenda', `<textarea class="ve-pp-texto" data-pp="leg.texto" rows="3"></textarea>`) +
            vePpSec('Estilo das legendas (todas)', `
                <div class="ve-pp-l"><label>Fonte</label>${vePpFontes('le.fam')}</div>
                <div class="ve-pp-l"><label>Estilo</label>${veFonteEstilos('le.estilo')}</div>
                <div class="ve-pp-botoes">
                    <button class="ve-pp-tog" data-pptog="le.negrito" title="Negrito"><b>N</b></button>
                    <button class="ve-pp-tog" data-pptog="le.ita" title="Itálico"><i>I</i></button>
                    <button class="ve-pp-tog" data-pptog="le.maiusc" title="CAIXA ALTA">AA</button></div>
                ${vePpNum('le.tam', 'Tamanho', 3, 10, 0.1, '%')}
                <div class="ve-pp-cores">${vePpCor('le.cor', 'Cor do texto')}</div>
                <div class="ve-pp-l"><label>Fundo</label><select data-pp="le.fundo"><option value="caixa">Caixa</option><option value="sombra">Contorno e sombra</option><option value="nenhum">Nenhum</option></select></div>
                <div class="ve-pp-grupo">${vePpChk('le.sOn', 'Sombra projetada')}${vePpCor('le.sCor', '')}
                    <div class="ve-pp-sub" data-ppse="le.sOn">${vePpNum('le.sOp', 'Opacidade', 0, 100, 1, '%')}${vePpNum('le.sDist', 'Distância', 0, 60, 0.5, 'px')}${vePpNum('le.sBlur', 'Desfoque', 0, 80, 0.5, 'px')}</div></div>
                <div class="ve-pp-l"><label>Posição</label><select data-pp="le.pos"><option value="baixo">Embaixo</option><option value="meio">No meio</option><option value="cima">Em cima</option></select></div>
                <div class="ve-pp-l"><label>Entrada</label><select data-pp="le.entrada" title="Efeito rápido quando cada legenda aparece"><option value="nenhum">Seca (sem efeito)</option><option value="pop">Pop</option><option value="fade">Fade</option></select></div>
                ${vePpChk('legGravar', 'Gravar as legendas no vídeo ao exportar')}`) +
            links([['texto', 'Painel Texto']]);
    }
    const nome = `${veNomeClipe(c)} ${VE.sel + 1}`;
    if (a.tipo === 'texto') {
        return cab(nome, `Texto · V${c.tr + 1}`) +
            vePpSec('Texto', `
                <textarea class="ve-pp-texto" data-pp="tx.t" rows="2" placeholder="Digite o texto"></textarea>
                <div class="ve-pp-l"><label>Fonte</label>${vePpFontes('tx.fam')}</div>
                <div class="ve-pp-l"><label>Estilo</label>${veFonteEstilos('tx.estilo')}</div>
                <div class="ve-pp-botoes">
                    <button class="ve-pp-tog" data-pptog="tx.neg" title="Negrito"><b>N</b></button>
                    <button class="ve-pp-tog" data-pptog="tx.ita" title="Itálico"><i>I</i></button>
                    <span class="ve-pp-sep"></span>
                    <button class="ve-pp-tog" data-ppalin="left" title="Alinhar à esquerda">⯇≡</button>
                    <button class="ve-pp-tog" data-ppalin="center" title="Centralizar">≡</button>
                    <button class="ve-pp-tog" data-ppalin="right" title="Alinhar à direita">≡⯈</button></div>
                ${vePpNum('tx.tam', 'Tamanho', 8, 400, 1, 'px')}
                ${vePpNum('tx.esp', 'Espaçamento', -100, 500, 5, '')}
                ${vePpNum('tx.ent', 'Entrelinha', 70, 250, 1, '%')}`) +
            vePpSec('Aparência', `
                <div class="ve-pp-cores">${vePpCor('tx.cor', 'Preenchimento')}</div>
                <div class="ve-pp-grupo">${vePpChk('tx.cOn', 'Contorno')}${vePpCor('tx.cCor', '')}
                    <div class="ve-pp-sub" data-ppse="tx.cOn">${vePpNum('tx.cLarg', 'Largura', 1, 40, 0.5, 'px')}</div></div>
                <div class="ve-pp-grupo">${vePpChk('tx.fOn', 'Fundo')}${vePpCor('tx.fCor', '')}
                    <div class="ve-pp-sub" data-ppse="tx.fOn">${vePpNum('tx.fOp', 'Opacidade', 0, 100, 1, '%')}${vePpNum('tx.fPad', 'Margem', 0, 120, 1, 'px')}${vePpNum('tx.fRaio', 'Cantos', 0, 120, 1, 'px')}</div></div>
                <div class="ve-pp-grupo">${vePpChk('tx.sOn', 'Sombra')}${vePpCor('tx.sCor', '')}
                    <div class="ve-pp-sub" data-ppse="tx.sOn">${vePpNum('tx.sOp', 'Opacidade', 0, 100, 1, '%')}${vePpNum('tx.sDist', 'Distância', 0, 60, 0.5, 'px')}${vePpNum('tx.sBlur', 'Desfoque', 0, 80, 0.5, 'px')}</div></div>`) +
            transformar(true, false) +
            vePpSec('Duração', `<div class="ve-pp-l"><label>Duração</label><span></span><span class="ve-prop-num"><input type="number" data-pp="dur" min="0.04" step="0.01"><i>s</i></span></div>`) +
            `<small class="ve-pp-dica">Duplo clique no texto do monitor para editar ali mesmo. Quadros-chave: Controles de efeito.</small>` +
            links([['props', 'Controles de efeito']]);
    }
    if (a.tipo === 'audio') {
        return cab(nome, `Áudio · ${veEsc(veMediaOf(c).name || '')} · A${c.tr + 1}`) + volume() + velocidade();
    }
    if (a.tipo === 'ajuste') {
        return cab(nome, `Camada de ajuste · V${c.tr + 1}`) +
            vePpSec('Camada de ajuste', vePpNum('p.op', 'Opacidade', 0, 100, 1, '%') +
                `<small class="ve-pp-dica">Os efeitos da camada valem para tudo o que está abaixo dela.</small>`) +
            vePpSec('Duração', `<div class="ve-pp-l"><label>Duração</label><span></span><span class="ve-prop-num"><input type="number" data-pp="dur" min="0.04" step="0.01"><i>s</i></span></div>`) +
            links([['props', 'Controles de efeito'], ['lc', 'Luz e Cor']]);
    }
    if (a.tipo === 'imagem') {
        return cab(nome, `Imagem · ${veEsc(veMediaOf(c).name || '')} · V${c.tr + 1}`) + transformar(true, true) +
            vePpSec('Duração', `<div class="ve-pp-l"><label>Duração</label><span></span><span class="ve-prop-num"><input type="number" data-pp="dur" min="0.04" step="0.01"><i>s</i></span></div>`) +
            links([['props', 'Controles de efeito'], ['lc', 'Luz e Cor']]);
    }
    return cab(nome, `Vídeo · V${c.tr + 1}`) + transformar(true, true) + velocidade() +
        (VE.info && VE.info.has_audio ? volume() : '') +
        links([['props', 'Controles de efeito'], ['lc', 'Luz e Cor']]);
}

// Valor atual de cada controle
function vePpGet(k) {
    const c = VE.clips[VE.sel];
    if (k === 'tx.fam') return veFonteFamilia(veTxt(c));
    if (k === 'tx.estilo') { const x = veTxt(c); return veFonteEstiloAtual(x, x.neg, x.ita); }
    if (k === 'le.fam') return veFonteFamilia(veTxEstilo());
    if (k === 'le.estilo') { const e = veTxEstilo(); return veFonteEstiloAtual(e, e.negrito, e.ita); }
    if (k.startsWith('tx.')) return veTxt(c)[k.slice(3)];
    if (k === 'p.ax' || k === 'p.ay') return veAnc(c)[k === 'p.ax' ? 0 : 1];
    if (k.startsWith('p.')) return veProps(c)[k.slice(2)];
    if (k.startsWith('le.')) return veTxEstilo()[k.slice(3)];
    if (k === 'leg.texto') return (VE.legendas[VETX.legSel] || {}).texto || '';
    if (k === 'legGravar') return VE.legGravar !== false;
    if (k === 'vel') return veVel(c) * 100;
    if (k === 'dur') return veLen(c);
    if (k === 'tom') return c.tom !== false;
    if (k === 'ripple') return VEPP.ripple;
    if (k === 'g') return c.g || 0;
    return '';
}

function vePpSet(k, v) {
    const c = VE.clips[VE.sel];
    if (k === 'tx.fam' || k === 'tx.estilo' || k === 'le.fam' || k === 'le.estilo') {
        const leg = k.startsWith('le.'), atual = leg ? veTxEstilo() : veTxt(c);
        const fam = k.endsWith('.fam') ? v : veFonteFamilia(atual);
        const lista = (VEPP.estilos && VEPP.estilos[fam]) || [];
        const e = k.endsWith('.fam') ? veFontePadrao(fam) : lista.find(x => x.estilo === v);
        const novo = e ? { fam, fonte: e.gdi } : { fam, fonte: fam };
        if (leg) VE.legEstilo = { ...atual, ...novo, negrito: e ? e.gdi_negrito : atual.negrito, ita: e ? e.gdi_italico : atual.ita };
        else {
            c.tx = { ...atual, ...novo, neg: e ? e.gdi_negrito : atual.neg, ita: e ? e.gdi_italico : atual.ita };
            if (VEPP.edit && VEPP.edit.c === c) veTxEditarPos();
        }
        return 'monitor';
    }
    if (k.startsWith('tx.')) {
        const n = k.slice(3);
        c.tx = { ...veTxt(c), [n]: v };
        if (VEPP.edit && VEPP.edit.c === c) { if (n === 't') VEPP.edit.ta.value = v; veTxEditarPos(); }
        return 'monitor';
    }
    if (k.startsWith('p.')) {
        const n = k.slice(2);
        if (!isFinite(v)) return;
        if (n === 'sc') v = Math.max(0.5, Math.min(2000, v));
        if (n === 'op') v = Math.max(0, Math.min(100, v));
        if (n === 'ax' || n === 'ay') { c.p = { ...veStaticProps(c), [n]: v }; return 'props'; }   // como no Premiere: o objeto anda
        if (veKfOn(c, n) && !veInClip(c)) { veToast('Leve a agulha para dentro do clipe para criar o quadro-chave'); return; }
        veApplyProps(c, { [n]: v });
        if (VEPP.edit) veTxEditarPos();
        return 'props';
    }
    if (k.startsWith('le.')) { VE.legEstilo = { ...veTxEstilo(), [k.slice(3)]: v }; return 'monitor'; }
    if (k === 'leg.texto') { VE.legendas[VETX.legSel] = { ...VE.legendas[VETX.legSel], texto: v }; return 'monitor'; }
    if (k === 'legGravar') { VE.legGravar = !!v; return; }
    if (k === 'vel') { if (isFinite(v) && v > 0) veMudarVelocidade(c, v / 100); return 'tudo'; }
    if (k === 'dur') {
        if (!isFinite(v) || v < veFrame()) return;
        if (veIsImage(c)) {
            // duração livre, sem invadir o próximo da trilha
            const prox = Math.min(Infinity, ...VE.clips.filter(o => o !== c && o.tr === c.tr && veConflita(o, c) && o.st >= veEnd(c) - VE_EPS).map(o => o.st));
            c.e = c.s + Math.min(v, prox - c.st);
        } else veMudarVelocidade(c, (c.e - c.s) / v);
        return 'tudo';
    }
    if (k === 'tom') { if (v) delete c.tom; else c.tom = false; return 'tudo'; }
    if (k === 'ripple') { VEPP.ripple = !!v; return; }
    if (k === 'g') { if (isFinite(v)) { v = Math.max(VE_GAIN_MIN, Math.min(VE_GAIN_MAX, v)); if (Math.abs(v) < 0.05) delete c.g; else c.g = +v.toFixed(1); } return 'tudo'; }
}

function vePpRender() {
    const box = $ve('ve-pp');
    if (!box) return;
    const a = vePpAlvo();
    const chave = [a.tipo, VE.sel, VETX.legSel, a.c ? a.c.tr : '', VE.seqW, VE.seqH, !!VEPP.fontes, VE.info && VE.info.has_audio].join('|');
    if (chave !== VEPP.chave) {
        const abertas = [...box.querySelectorAll('details.ve-pp-sec')].map(d => d.open);
        const tipo0 = VEPP.chave.split('|')[0];
        box.innerHTML = vePpHtml(a);
        // seções recolhidas continuam recolhidas enquanto o tipo de seleção for o mesmo
        if (tipo0 === a.tipo) box.querySelectorAll('details.ve-pp-sec').forEach((d, k) => { if (abertas[k] === false) d.open = false; });
        VEPP.chave = chave;
    }
    const ativo = box.ownerDocument.activeElement;
    box.querySelectorAll('select.ve-pp-estilo').forEach(sel => {
        const leg = sel.dataset.pp.startsWith('le.');
        const o = leg ? veTxEstilo() : a.c && veTxt(a.c);
        if (!o) return;
        const fam = veFonteFamilia(o), lista = (VEPP.estilos && VEPP.estilos[fam]) || [];
        const chave = fam + '|' + lista.length;
        if (sel._chave === chave) return;
        sel._chave = chave;
        // estilo que não existe na família (N/I sem a variação de verdade): o navegador simula
        sel.innerHTML = lista.map(e => `<option value="${veTxEsc(e.estilo)}">${veTxEsc(e.estilo)}</option>`).join('') +
            '<option value="">(simulado)</option>';
        sel.disabled = !lista.length;
    });
    box.querySelectorAll('[data-pp]').forEach(el => {
        if (el === ativo) return;
        const v = vePpGet(el.dataset.pp);
        if (el.type === 'checkbox') el.checked = !!v;
        else if (typeof v === 'number') el.value = veRound(v, el.dataset.pp === 'dur' ? 2 : el.step && +el.step < 1 ? 1 : 0);
        else {
            if (el.tagName === 'SELECT' && v && ![...el.options].some(o => o.value === v)) el.add(new Option(v, v));
            el.value = v;
        }
    });
    box.querySelectorAll('[data-pptog]').forEach(b => b.classList.toggle('on', !!vePpGet(b.dataset.pptog)));
    box.querySelectorAll('[data-ppalin]').forEach(b => b.classList.toggle('on', a.c && veTxt(a.c).alin === b.dataset.ppalin));
    box.querySelectorAll('[data-ppse]').forEach(el => { el.hidden = !vePpGet(el.dataset.ppse); });
    if (a.c) {
        const sz = veMediaSize(a.c), [ax, ay] = veAnc(a.c);
        box.querySelectorAll('[data-ppanc]').forEach(b => {
            const [u, v] = b.dataset.ppanc.split(',').map(Number);
            b.classList.toggle('on', Math.abs(ax - u * sz.w) < 0.6 && Math.abs(ay - v * sz.h) < 0.6);
        });
    }
}

// Depois de mudar um valor: redesenha só o que precisa
function vePpDepois(o, fim) {
    if (o === 'tudo') {
        if (fim) { veRelayout(); veRefresh(); return; }
        VE.dur = VE.clips.reduce((m, c) => Math.max(m, veEnd(c)), 0);
        veDrawMonitorSoon(); veDraw(); vePpRender();
        return;
    }
    if (o === 'props') { veRenderProps(); veDraw(); }
    veDrawMonitorSoon();
    vePpRender();
    if (fim) veRefresh();
}

function vePpInit() {
    const box = $ve('ve-pp');
    if (!box) return;
    const valor = el => el.type === 'checkbox' ? el.checked
        : (el.type === 'number' || el.type === 'range') ? parseFloat(String(el.value).replace(',', '.')) : el.value;
    box.addEventListener('input', e => {
        const el = e.target.closest('[data-pp]');
        if (!el || !VE.ready) return;
        if (el.dataset.pp !== 'ripple' && !VE._ppEdit) { vePushHistory(); VE._ppEdit = true; }
        const o = vePpSet(el.dataset.pp, valor(el));
        vePpDepois(o, false);
    });
    box.addEventListener('change', e => {
        const el = e.target.closest('[data-pp]');
        VE._ppEdit = false;
        if (!el) return;
        vePpDepois('tudo', true);
    });
    box.addEventListener('click', e => {
        const anc = e.target.closest('[data-ppanc]');
        if (anc && VE.ready) { const [u, v] = anc.dataset.ppanc.split(',').map(Number); veTfAncoraEm(u, v); return; }
        const tog = e.target.closest('[data-pptog]'), alin = e.target.closest('[data-ppalin]');
        const ac = e.target.closest('[data-ppacao]'), ir = e.target.closest('[data-ppir]');
        if (ir) { vedShow(ir.dataset.ppir); if (ir.dataset.ppir === 'props') veRenderProps(); return; }
        if (!VE.ready) return;
        if (tog) { vePushHistory(); vePpSet(tog.dataset.pptog, !vePpGet(tog.dataset.pptog)); vePpDepois('monitor', true); return; }
        if (alin) { vePushHistory(); vePpSet('tx.alin', alin.dataset.ppalin); vePpDepois('monitor', true); return; }
        if (ac) {
            const c = VE.clips[VE.sel];
            if (!c) return;
            const sz = veMediaSize(c), p = veProps(c);
            vePushHistory();
            const centro = vePosParaCentro(c, p, VE.seqW / 2, VE.seqH / 2);
            if (ac.dataset.ppacao === 'alin-h') veApplyProps(c, { x: centro.x });
            else if (ac.dataset.ppacao === 'alin-v') veApplyProps(c, { y: centro.y });
            else {
                const aj = ac.dataset.ppacao === 'ajustar' ? Math.min : Math.max;
                // gira 90°/270°: a largura vira altura
                const deitado = Math.abs(Math.round(p.rot / 90)) % 2 === 1;
                const w = deitado ? sz.h : sz.w, h = deitado ? sz.w : sz.h;
                const sc = veRound(100 * aj(VE.seqW / w, VE.seqH / h), 2);
                veApplyProps(c, { sc, ...vePosParaCentro(c, { ...p, sc }, VE.seqW / 2, VE.seqH / 2) });
            }
            veRefresh();
        }
    });
    box.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.target.blur();
        e.stopPropagation();
    });
    box.addEventListener('focusin', e => {
        // editar a legenda leva a agulha até ela (para ver no monitor)
        if (e.target.dataset && e.target.dataset.pp === 'leg.texto' && VE.legendas[VETX.legSel]) veSeek(VE.legendas[VETX.legSel].st);
    });
    const carregar = () => window.pywebview.api.ve_fontes().then(r => {
        if (r && r.success && r.fontes.length) { VEPP.fontes = r.fontes; VEPP.estilos = r.estilos || null; VEPP.chave = ''; vePpRender(); }
    });
    if (window.pywebview && window.pywebview.api && window.pywebview.api.ve_fontes) carregar();
    else window.addEventListener('pywebviewready', carregar, { once: true });
    vePpRender();
}

// ─────────────────────────── monitor: ferramenta Texto e duplo clique ───────────────────────────
function veTxInitMonitor() {
    const scr = $ve('ve-screen');
    if (!scr) return;
    // T: clicar no monitor cria (ou edita) um texto; em cima dos outros ouvintes do monitor
    scr.addEventListener('pointerdown', e => {
        if (VE.tool !== 'texto' || e.button !== 0 || !VE.ready || e.target.closest('button, textarea')) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        VEM.panned = true;   // o clique que vem depois não vira play/pausa
        const pt = veTxPontoQuadro(e);
        const i = veTxClipeEm(pt);
        if (i >= 0) {
            if (veLocked(VE.clips[i])) { veAvisoBloqueio(); return; }
            VE.sel = i;
            veRefresh();
            veTxEditar(i);
        } else veTxNovo(pt);
    }, true);
    scr.addEventListener('dblclick', e => {
        if (!VE.ready || e.target.closest('button, textarea')) return;
        const pt = veTxPontoQuadro(e), i = veTxClipeEm(pt);
        if (i < 0) {
            // legenda da trilha LEG na agulha: edita o texto ali mesmo
            const lg = veTxLegendaNoPonto(pt);
            if (lg >= 0) { VE.sel = -1; vedShow('pp'); veTxLegEditar(lg); }
            return;
        }
        if (veLocked(VE.clips[i])) return;
        if (VE.playing) veStop();
        VE.sel = i;
        veRefresh();
        vedShow('pp');
        veTxEditar(i);
    });
    new ResizeObserver(() => { veTxEditarPos(); veTxLegEditarPos(); }).observe(scr);
}

document.addEventListener('DOMContentLoaded', () => { vePpInit(); veTxInitMonitor(); });
