// =========================================================
// Vídeo Kanivete — Importar MOGRT (Motion Graphics Template do Premiere, feito no After Effects)
//   Functions/mogrt.py lê o .aep de dentro do .mogrt; aqui cada composição vira uma Comp (como o PSD em
//   editor-psd.js): uma trilha por camada, Cor sólida / imagem / texto / Comp, transformar com âncora,
//   quadros-chave com a Bézier do After, camada mãe (c.pai) e fosco de trilha (c.mt) do editor-motion.js.
//   Os campos do Gráficos essenciais ficam na mídia da Comp (m.mogrt.controles) com o alvo de cada um.
// =========================================================

const VE_EXT_MOGRT = /\.mogrt$/i;

// Texto do After → texto do editor; a origem do After (linha de base da 1ª linha, no ponto do alinhamento) vira a
// âncora do clipe, então Posição/Âncora/Escala do After valem iguais.
function veMogrtTexto(cam, estilos, avisos) {
    const t = cam.texto, f = vePsdAcharFonte(t.fonte, estilos);
    if (!f) avisos.push(`${cam.nome}: ${veT('fonte')} ${t.fonte} ${veT('não instalada')}`);
    else if (!f.exata) avisos.push(`${cam.nome}: ${veT('fonte')} ${t.fonte} ${veT('não instalada, usei')} ${f.fam} ${f.e.estilo}`);
    const x = { ...VE_TX_PADRAO, t: t.caixaAlta ? t.t.toUpperCase() : t.t, tam: t.tam, alin: t.alin, esp: t.esp, ent: t.ent, cor: t.cor || '#ffffff' };
    if (f) Object.assign(x, { fonte: f.e.gdi, fam: f.fam, peso: f.e.peso, neg: false, ita: !!(f.e.italico || f.e.gdi_italico) });
    if (t.contorno) Object.assign(x, { cOn: true, cCor: t.contorno.cor, cLarg: t.contorno.larg });
    return x;
}

function veMogrtAncTexto(x, ax, ay) {
    const L = veTxLayout(x);
    const ox = x.alin === 'center' ? L.m + L.tw / 2 : x.alin === 'right' ? L.m + L.tw : L.m;
    return { ax: ox + ax, ay: L.m + L.asc + ay };
}

async function veMogrtMontar(r, pastaPai) {
    const api = window.pywebview.api, bin = vePjNovoBin('MOGRT · ' + r.nome, pastaPai || null);
    const estilos = await vePsdEstilos(), avisos = r.avisos.slice(), feitas = {}, cores = {}, imgs = {};
    const lote = Math.random().toString(36).slice(2, 6);   // uid único por importação
    const uid = u => u && `${u}_${lote}`;
    const porId = Object.fromEntries(r.comps.map(c => [c.id, c]));
    for (const fam of r.fontes || []) {
        const f = vePsdAcharFonte(fam, estilos);
        if (f) try { await document.fonts.load(veTxFonte({ ...VE_TX_PADRAO, fonte: f.e.gdi, fam: f.fam, peso: f.e.peso, tam: 40 }, 40)); } catch (e) { /* do sistema */ }
    }
    const cor = fill => cores[fill] || (cores[fill] = vePjAddMidia({ kind: 'cor', name: 'Cor sólida', fill, nome: `${veT('Cor sólida')} ${fill}` }, bin.id));
    const imagem = async arq => {
        if (imgs[arq]) return imgs[arq];
        const a = await api.video_cutter_add_media(arq);
        if (!a || !a.success) return null;
        const m = vePjAddMidia({ kind: 'image', path: a.path, url: a.url, name: arq.split(/[\\/]/).pop(), img: new Image() }, bin.id);
        m.img.crossOrigin = 'anonymous';
        m.img.src = a.url;
        await new Promise(ok => { m.img.onload = ok; m.img.onerror = ok; });
        m.w = m.img.naturalWidth; m.h = m.img.naturalHeight;
        return (imgs[arq] = m);
    };
    const comp = async id => {
        if (feitas[id]) return feitas[id];
        const C = porId[id], clips = [];
        // camada-fosco oculta no After continua recortando (no editor ela some sozinha: fica ligada)
        const foscos = new Set(C.camadas.filter(x => x.fosco).map(x => x.fosco.uid));
        for (const cam of C.camadas) {
            const c = { tr: clips.length, st: cam.ini, nome: cam.nome, uid: uid(cam.uid) };
            const len = cam.fim - cam.ini;
            // tempo da fonte: Comp = o do After (t − início da camada); parados começam em 0 (quadros-chave deslocados)
            let s = cam.ini - cam.start, desloca = 0;
            if (cam.tipo === 'comp') c.m = (await comp(cam.comp)).id;
            else {
                desloca = -s; s = 0;
                if (cam.tipo === 'cor' || cam.tipo === 'nulo') {
                    c.m = cor(cam.cor || '#000000').id;
                    if (cam.w !== C.w || cam.h !== C.h) { c.p0 = { sx: cam.w / C.w, sy: cam.h / C.h }; }
                } else if (cam.tipo === 'imagem') {
                    const m = await imagem(cam.arquivo);
                    if (!m) { avisos.push(`${cam.nome}: ${veT('imagem não abriu')}`); continue; }
                    c.m = m.id;
                } else if (cam.tipo === 'texto') {
                    c.m = veTxMidia().id;
                    c.tx = veMogrtTexto(cam, estilos, avisos);
                }
            }
            Object.assign(c, { s, e: s + len });
            if (cam.v) { c.v = cam.v; c.e = s + len * cam.v; }
            const p = { ...cam.p };
            if (c.tx) { c.mgAnc = [p.ax || 0, p.ay || 0]; Object.assign(p, veMogrtAncTexto(c.tx, p.ax || 0, p.ay || 0)); }
            if (c.p0) { p.sx = (p.sx ?? 1) * c.p0.sx; p.sy = (p.sy ?? 1) * c.p0.sy; delete c.p0; }
            c.p = Object.assign(veDefProps(c), p);
            const k = {};
            Object.entries(cam.k || {}).forEach(([ch, lst]) => {
                k[ch] = lst.map(q => { const o = { t: q.t + desloca, v: q.v, i: q.i || 'lin' }; if (q.b) o.b = q.b; return o; });
            });
            if (c.tx && (k.ax || k.ay)) avisos.push(`${cam.nome}: ${veT('âncora animada em texto ficou aproximada')}`);
            if (Object.keys(k).length) c.k = k;
            if (cam.pai) c.pai = uid(cam.pai);
            if (cam.fosco) c.mt = { uid: uid(cam.fosco.uid), modo: cam.fosco.modo };
            if (cam.bm && cam.bm !== 'normal') c.bm = cam.bm;
            if (cam.off && !foscos.has(cam.uid)) c.off = true;
            clips.push(c);
        }
        const seq = {
            id: veSeqId(), name: C.nome, comp: true, dur: C.dur, clips, trilhas: veTrkNovo(Math.max(VE_MIN_TRACKS, clips.length)),
            texto: { palavras: [], idioma: 'pt', chave: '' }, legendas: [], legEstilo: null, legGravar: true, inPt: null,
            outPt: null, markers: [], guias: [], playhead: 0, view: { pps: 0, x: 0 }, w: C.w, h: C.h, master: null,
        };
        VE.sequences.push(seq);
        const m = {
            id: VE.media.length, kind: 'video', comp: true, sequenceId: seq.id, name: C.nome, cor: VE_COMP_COR, pasta: bin.id,
            path: null, dur: C.dur, _criada: true, mgPlano: true,
            // taxa da timeline (cravada): a Comp do After em 29,97 cortava as pontas um quadro antes na exportação
            info: { duration: C.dur, width: C.w, height: C.h, fps: VE.fps || 30, has_audio: false, alfa: true, provisoria: true },
        };
        VE.media.push(m);
        return (feitas[id] = m);
    };
    const raiz = await comp(r.raiz);
    raiz.name = r.nome;
    VE.sequences.find(s => s.id === raiz.sequenceId).name = r.nome;
    raiz.mogrt = {
        controles: r.controles.map(ct => ct.alvo ? { ...ct, alvo: { ...ct.alvo, uid: uid(ct.alvo.uid), seq: feitas[ct.alvo.comp] && feitas[ct.alvo.comp].sequenceId } } : ct),
        // a Comp tocada ao contrário (saída) tem as mesmas camadas: os campos valem para as duas
        espelhos: r.comps.filter(c => / \(volta\)$/.test(c.nome)).map(c => feitas[c.id] && feitas[c.id].sequenceId).filter(Boolean),
    };
    raiz.mogrtAvisos = avisos;
    return { m: raiz, avisos };
}

// Projeto salvo antes de o .vknv guardar o MOGRT (2026-10-21): os campos do Gráficos essenciais sumiam ao reabrir (cada
// faixa voltava ao nome do modelo). Relê o .mogrt e religa às Comps já montadas (mesmos nomes; uid = do After + o lote)
async function veMogrtReligar(path) {
    const r = await window.pywebview.api.ve_mogrt_importar(path);
    if (!r || !r.success) throw new Error((r && r.error) || 'não leu o MOGRT');
    const nomeDe = c => (c.id === r.raiz ? r.nome : c.nome);
    const seqDe = {}, midias = [];
    for (const c of r.comps) {
        const m = VE.media.find(x => x && x.comp && !x.removido && x.ovDe == null && x.name === nomeDe(c));
        if (!m) throw new Error(`Comp "${nomeDe(c)}" não está no projeto`);
        seqDe[c.id] = m.sequenceId;
        midias.push(m);
    }
    const u0 = (VE.sequences.find(s => s.id === seqDe[r.raiz]) || {}).clips || [];
    const algum = VE.sequences.filter(s => Object.values(seqDe).includes(s.id)).flatMap(s => s.clips).find(c => c.uid && /_[a-z0-9]{4}$/.test(c.uid));
    if (!algum) throw new Error('sem as camadas da importação');
    const lote = algum.uid.split('_').pop(), uid = u => u && `${u}_${lote}`;
    const raiz = midias[r.comps.findIndex(c => c.id === r.raiz)];
    raiz.mogrt = {
        controles: r.controles.map(ct => ct.alvo ? { ...ct, alvo: { ...ct.alvo, uid: uid(ct.alvo.uid), seq: seqDe[ct.alvo.comp] } } : ct),
        espelhos: r.comps.filter(c => / \(volta\)$/.test(c.nome)).map(c => seqDe[c.id]).filter(Boolean),
    };
    midias.forEach(m => { m.mgPlano = true; });
    VE_MG_PLANO.clear();
    VE.dirty = true;
    return { comps: midias.map(m => m.name), controles: raiz.mogrt.controles.length, lote, n: u0.length };
}

// Abre/importa um .mogrt (as mesmas opções do vePsdAbrir: pasta, inserir, soProjeto, abrir)
async function veMogrtAbrir(path, opts = {}) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_mogrt_importar) return false;
    if (!VE.ready) { veToast(veT('Abra um vídeo ou projeto antes de importar este MOGRT')); return false; }
    veToast(`${veT('Lendo o MOGRT')}: ${path.split(/[\\/]/).pop()}...`);
    const r = await api.ve_mogrt_importar(path);
    if (!r || !r.success) { veToast(`MOGRT: ${(r && r.error) || veT('não consegui ler o arquivo')}`); return false; }
    if (VE.playing) veStop();
    veSeqSalvarAtiva();
    vePushHistory();
    const { m, avisos } = await veMogrtMontar(r, opts.pasta !== undefined ? opts.pasta : (typeof vePjDestino === 'function' ? vePjDestino() : null));
    if (!opts.soProjeto && opts.inserir) {
        const st = veSnapFrame(VE.playhead), clip = { st, s: 0, e: r.dur, m: m.id, cor: VE_COMP_COR };
        let tr = veTrackIndexes().find(k => !veTrkLocked(k) && veTrackFree(k, st, st + r.dur, clip));
        if (tr == null) tr = veTrackCount();
        clip.tr = tr;
        veEnsureTrackIndex(tr, { refresh: true });
        clip.p = veDefProps(clip);
        VE.clips.push(clip);
        veRelayout();
        veSelDefinir([clip], clip);
    }
    veSeqSalvarAtiva();
    veAfterEdit(VE.playhead);
    vePjRender();
    if (typeof veCompVerificar === 'function') veCompVerificar();
    veToast(`MOGRT ${r.nome}: ${r.controles.length} ${veT('campos editáveis')}` + (avisos.length ? ` · ${avisos.length} ${veT('aviso(s)')}` : ''));
    if (avisos.length) console.warn('[MOGRT] ' + r.nome + ':\n' + avisos.join('\n'));
    if (opts.abrir !== false && !opts.soProjeto && !opts.inserir) veCompAbrir(m);
    return m;
}

// ─────────── Gráficos essenciais (como no Premiere): valor próprio por faixa ───────────
// A faixa guarda c.ov = {idDoCampo: {v} | {x, y}} e usa uma variação da Comp (veCompVariantePara, editor-comp.js).
// A variação aplica os remendos por uid em todas as Comps de dentro (ov.__mg), inclusive na saída espelhada.
const VE_MG_TIPOS = new Set(['texto', 'ponto', 'numero', 'multi', 'cor']);

// Valor do campo na Comp (o do After), no formato do ov
function veMogrtItem(base, id) {
    const ct = base.mogrt.controles.find(x => x.id === id);
    if (!ct) return null;
    const v = ct.valor;
    // texto: + tamanho da letra em % do modelo (Gráficos essenciais › Tamanho; o Premiere não tem, o título longo do
    // CULTSP 04 "ROADIE, DIREÇÃO E PALCO" estourava o lower, que não cresce com o texto — 2026-10-23)
    return ct.tipo === 'ponto' ? { x: v.x, y: v.y } : ct.tipo === 'texto' ? { v: Array.isArray(v) ? v[0] : v, tam: 100 }
        : { v: Array.isArray(v) ? v[0] : v };
}

function veMogrtPatch(ct, o) {
    const p = ct.alvo.prop, it = ct.tipo === 'ponto' ? { x: ct.valor.x, y: ct.valor.y, ...o } : o;
    if (p === 'texto') return it.tam != null && +it.tam !== 100 ? { t: it.v, tam: +it.tam } : { t: it.v };
    if (p === 'pos') return { x: +it.x, y: +it.y };
    if (p === 'esc') return { sc: +it.v };
    if (['x', 'y', 'op', 'rot'].includes(p)) return { [p]: +it.v };
    return {};
}

function veMogrtRemendar(c, pt) {
    const n = vePlain(c, {});
    const tam = pt.tam != null && isFinite(pt.tam) && +pt.tam > 0 ? +pt.tam : null;
    if (n.tx && (pt.t != null || tam)) {
        if (pt.t != null) n.tx.t = String(pt.t);
        if (tam) n.tx.tam = +(n.tx.tam * tam / 100).toFixed(2);
        if (n.mgAnc) Object.assign(n.p, veMogrtAncTexto(n.tx, n.mgAnc[0], n.mgAnc[1]));
    }
    ['x', 'y', 'sc', 'op', 'rot'].forEach(k => {
        if (pt[k] == null || !isFinite(pt[k])) return;
        const ks = n.k && n.k[k];
        // animada: a animação inteira anda junto (o valor do campo é o do 1º quadro-chave)
        if (ks && ks.length) { const d = pt[k] - ks[0].v; n.k[k] = ks.map(q => ({ ...q, v: q.v + d })); }
        else n.p[k] = pt[k];
    });
    return n;
}

function veMogrtAplicar(seq, mg) {
    return { ...seq, clips: (seq.clips || []).map(c => {
        let n = c.uid && mg[c.uid] ? veMogrtRemendar(c, mg[c.uid]) : c;
        const mm = VE.media[n.m || 0];
        if (mm && mm.comp && !mm.removido) {
            const v = veCompVariantePara(veCompBase(mm), { __mg: mg });
            if (v !== mm) { if (n === c) n = { ...c }; n.m = v.id; }
        }
        return n;
    }) };
}

// Sequência efetiva de uma variação de MOGRT (editor-comp.js veCompSeqEfetiva chama)
function veMogrtSeqEfetiva(m, seq) {
    const ov = m.ov || {}, base = veCompBase(m);
    let s = seq;
    if (ov.__mg) s = veMogrtAplicar(seq, ov.__mg);
    else if (base.mogrt && Object.keys(ov).length) {
        const mg = {};
        (base.mogrt.controles || []).forEach(ct => {
            const o = ov[ct.id];
            if (!o || !ct.alvo) return;
            mg[ct.alvo.uid] = { ...(mg[ct.alvo.uid] || {}), ...veMogrtPatch(ct, o) };
        });
        if (Object.keys(mg).length) s = veMogrtAplicar(seq, mg);
    }
    return base.mgPlano ? veMogrtPlanoDe(m, s) : s;
}

// Número arrastável como no Premiere: arrastar para os lados muda (Shift ×10, Alt ×0,1), clique digita.
// Barra junto quando o campo tem faixa (tamanho, escala, opacidade); ✥ arrasta X e Y juntos.
function veMogrtEssHtml(c, base) {
    const ov = c.ov || {}, r2 = v => +(+v).toFixed(2);
    const num = (id, campo, v, extra = '') => `<input type="number" class="ve-mg-num" step="any" data-pce="${id}" data-campo="${campo}" value="${veEsc(String(r2(v)))}" title="${veT('Arraste para os lados (Shift = rápido, Alt = fino) ou clique para digitar')}" ${extra}>`;
    const barra = (id, campo, v, mn, mx) => `<input type="range" class="ve-mg-barra" data-pce="${id}" data-campo="${campo}" min="${mn}" max="${mx}" step="1" value="${r2(v)}">`;
    const faixa = ct => ct.min != null && ct.max != null ? [ct.min, ct.max]
        : ct.alvo.prop === 'esc' ? [0, 300] : ct.alvo.prop === 'op' ? [0, 100] : ct.alvo.prop === 'rot' ? [-180, 180] : null;
    const corpo = base.mogrt.controles.filter(ct => VE_MG_TIPOS.has(ct.tipo) && ct.alvo).map(ct => {
        const o = ov[ct.id] || {}, it = { ...veMogrtItem(base, ct.id), ...o }, mudou = Object.keys(o).length > 0, fx = faixa(ct);
        const campo = ct.tipo === 'texto' ? `<textarea class="ve-pp-texto" rows="2" data-pce="${ct.id}" data-campo="v">${veEsc(String(it.v ?? ''))}</textarea>
                <div class="ve-mg-linha"><span>${veT('Tamanho')}</span>${barra(ct.id, 'tam', it.tam ?? 100, 20, 300)}${num(ct.id, 'tam', it.tam ?? 100, 'min="20" max="300"')}<i>%</i></div>`
            : ct.tipo === 'ponto' ? `<div class="ve-mg-linha"><span class="ve-mg-pad" data-mg-pad="${ct.id}" title="${veT('Arraste para mover X e Y juntos')}">✥</span>
                <b>X</b>${num(ct.id, 'x', it.x)}<b>Y</b>${num(ct.id, 'y', it.y)}</div>`
            : ct.tipo === 'cor' ? `<input type="color" data-pce="${ct.id}" data-campo="v" value="${veEsc(String(it.v))}">`
            : `<div class="ve-mg-linha">${fx ? barra(ct.id, 'v', it.v, fx[0], fx[1]) : '<span class="ve-mg-esp"></span>'}${num(ct.id, 'v', it.v, ct.min != null ? `min="${ct.min}" max="${ct.max}"` : '')}</div>`;
        return `<div class="ve-pce${mudou ? ' mudou' : ''}">
            <div class="ve-pce-cab"><label>${veEsc(ct.nome)}</label>
                ${mudou ? `<button class="ve-pce-volta" data-pce-volta="${ct.id}" title="${veT('Voltar ao valor do modelo')}">↺</button>` : ''}</div>
            ${campo}</div>`;
    }).join('') + `<small class="ve-pp-dica">${veT('Vale só para esta faixa, como no Premiere. Para mudar o modelo, abra a Comp (duplo clique).')}</small>`;
    return vePpSec(veT('Gráficos essenciais'), corpo);
}

// Arrastar os números/✥ e manter barra e número do mesmo campo juntos (o evento segue para o painel: editor-props.js)
function veMogrtEssIniciar() {
    if (window._veMgArrasto) return;
    window._veMgArrasto = true;
    const avisa = (el, tipo) => el.dispatchEvent(new Event(tipo, { bubbles: true }));
    const par = el => el.closest('.ve-pce') && el.closest('.ve-pce').querySelectorAll(`[data-pce="${el.dataset.pce}"][data-campo="${el.dataset.campo}"]`);
    document.addEventListener('input', e => {
        const el = e.target;
        if (!el.matches || !el.matches('.ve-mg-barra, .ve-mg-num')) return;
        (par(el) || []).forEach(o => { if (o !== el) o.value = el.value; });
    }, true);
    document.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const pad = e.target.closest && e.target.closest('[data-mg-pad]');
        const n = !pad && e.target.closest && e.target.closest('.ve-mg-num');
        if (!pad && (!n || document.activeElement === n)) return;
        e.preventDefault();
        const linha = (pad || n).closest('.ve-mg-linha');
        const alvos = pad ? [...linha.querySelectorAll('.ve-mg-num')] : [n];
        const ini = alvos.map(a => parseFloat(String(a.value).replace(',', '.')) || 0);
        const x0 = e.clientX, y0 = e.clientY;
        let andou = false;
        document.body.classList.add(pad ? 've-mg-movendo' : 've-kl-scrub');
        const mover = ev => {
            const dx = ev.clientX - x0, dy = ev.clientY - y0;
            if (!andou && Math.abs(dx) + Math.abs(dy) < 3) return;
            andou = true;
            const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
            alvos.forEach((a, i) => {
                let v = ini[i] + (pad && i === 1 ? dy : dx) * k;
                if (a.min !== '') v = Math.max(+a.min, v);
                if (a.max !== '') v = Math.min(+a.max, v);
                a.value = +v.toFixed(k < 1 ? 2 : 1);
                avisa(a, 'input');
            });
        };
        const soltar = () => {
            document.removeEventListener('pointermove', mover);
            document.removeEventListener('pointerup', soltar);
            document.body.classList.remove('ve-mg-movendo', 've-kl-scrub');
            if (andou) avisa(alvos[0], 'change');
            else if (n) { n.focus(); n.select(); }
        };
        document.addEventListener('pointermove', mover);
        document.addEventListener('pointerup', soltar);
    }, true);
}
veMogrtEssIniciar();

// ─────────── plano rápido (o que a exportação faz sem desenhar quadro a quadro) ───────────
// A Comp guardada continua como a do After (mãe, fosco: editável igual); a sequência EFETIVA (prévia e exportação)
// troca o que dá por igual: mãe parada → posição/escala direto na filha; Cor sólida esticada → retângulo do tamanho
// certo; fosco alfa de um retângulo → Cortar animado (os lados acompanham o retângulo; fora do tempo dele, nada).
function veMogrtTam(c, W, H) {
    const m = VE.media[c.m || 0];
    if (c.tx) { const L = veTxLayout(c.tx); return { w: L.w, h: L.h }; }
    if (m && m.kind === 'forma' && c.fm) return { w: c.fm.w, h: c.fm.h };
    if (m && m.kind === 'image') return { w: m.w, h: m.h };
    if (m && m.comp) return { w: m.info.width, h: m.info.height };
    return { w: W, h: H };
}

function veMogrtPlano(clips, W, H) {
    const L = clips.map(c => vePlain(c, {})), por = uid => L.find(o => o.uid === uid);
    const temK = (c, ks) => !!c.k && ks.some(k => c.k[k] && c.k[k].length);
    const anc = (c, sz) => [c.p.ax ?? sz.w / 2, c.p.ay ?? sz.h / 2];
    // 1) mãe parada (sem quadros-chave nem rotação; a mãe da mãe primeiro)
    for (let volta = 0, mudou = true; mudou && volta < 8; volta++) {
        mudou = false;
        L.forEach(c => {
            if (!c.pai) return;
            const P = por(c.pai);
            if (!P) { delete c.pai; return; }
            if (P.pai || (P.k && Object.keys(P.k).some(k => P.k[k] && P.k[k].length)) || (P.p.rot || 0)) return;
            const k = (P.p.sc ?? 100) / 100, Sx = k * (P.p.sx ?? 1), Sy = k * (P.p.sy ?? 1), uni = Math.abs(Sx - Sy) < 1e-9;
            if (!uni && ((c.p.rot || 0) || temK(c, ['rot', 'sc']))) return;
            const [pax, pay] = anc(P, veMogrtTam(P, W, H));
            const fx = v => P.p.x + Sx * (v - pax), fy = v => P.p.y + Sy * (v - pay);
            c.p.x = fx(c.p.x ?? W / 2); c.p.y = fy(c.p.y ?? H / 2);
            if (c.k && c.k.x) c.k.x = c.k.x.map(q => ({ ...q, v: fx(q.v) }));
            if (c.k && c.k.y) c.k.y = c.k.y.map(q => ({ ...q, v: fy(q.v) }));
            if (uni) { c.p.sc = (c.p.sc ?? 100) * Sx; if (c.k && c.k.sc) c.k.sc = c.k.sc.map(q => ({ ...q, v: q.v * Sx })); }
            else { c.p.sx = (c.p.sx ?? 1) * Sx; c.p.sy = (c.p.sy ?? 1) * Sy; }
            delete c.pai;
            mudou = true;
        });
    }
    // 2) Cor sólida esticada → retângulo (vira PNG uma vez, como qualquer forma)
    L.forEach(c => {
        const m = VE.media[c.m || 0];
        if (!m || m.kind !== 'cor' || c.pai || temK(c, ['sc'])) return;
        const sx = c.p.sx ?? 1, sy = c.p.sy ?? 1;
        if (sx === 1 && sy === 1) return;
        const k = (c.p.sc ?? 100) / 100, [ax, ay] = anc(c, { w: W, h: H });
        c.m = veGrMidia('forma', 'Forma').id;
        c.fm = { t: 'ret', w: W * sx * k, h: H * sy * k, cor: m.fill || '#000000', cOn: false, cCor: '#ffffff', cLarg: 0, raio: 0 };
        Object.assign(c.p, { ax: ax * sx * k, ay: ay * sy * k, sc: 100 });
        delete c.p.sx; delete c.p.sy;
    });
    // 3) fosco alfa de um retângulo parado no ângulo → Cortar animado na camada (que não pode estar animada)
    const usados = new Set();
    L.forEach(c => {
        if (!c.mt || c.mt.modo !== 'alfa' || c.pai || (c.p.rot || 0) || (c.k && Object.keys(c.k).some(k => c.k[k] && c.k[k].length))) return;
        const M = por(c.mt.uid), mm = M && VE.media[M.m || 0];
        if (!M || M.pai || !mm) return;
        const ret = mm.kind === 'cor' ? !(M.p.sx != null && M.p.sx !== 1) && !(M.p.sy != null && M.p.sy !== 1)
            : mm.kind === 'forma' && M.fm && M.fm.t === 'ret' && !M.fm.raio && M.fm.pOn !== false;
        if (!ret || (M.p.rot || 0) || temK(M, ['sc', 'rot', 'op']) || (M.p.op ?? 100) < 100 || (M.fx || []).length || (M.mk || []).length || M.mt) return;
        const msz = veMogrtTam(M, W, H), Mk = (M.p.sc ?? 100) / 100, [max, may] = anc(M, msz);
        const csz = veMogrtTam(c, W, H), ck = (c.p.sc ?? 100) / 100, cx = ck * (c.p.sx ?? 1), cy = ck * (c.p.sy ?? 1), [cax, cay] = anc(c, csz);
        const lx = X => cax + (X - c.p.x) / cx, ly = Y => cay + (Y - c.p.y) / cy;
        const lados = {
            l: x => 100 * lx(x - max * Mk) / csz.w, r: x => 100 * (csz.w - lx(x + (msz.w - max) * Mk)) / csz.w,
            t: y => 100 * ly(y - may * Mk) / csz.h, b: y => 100 * (csz.h - ly(y + (msz.h - may) * Mk)) / csz.h,
        };
        const id = veFxNewId(), mx0 = M.p.x ?? W / 2, my0 = M.p.y ?? H / 2;
        const v = { l: lados.l(mx0), r: lados.r(mx0), t: lados.t(my0), b: lados.b(my0) };
        // tempo da fonte do fosco → tempo da fonte da camada
        const dt = (c.s - c.st) - (M.s - M.st);
        c.k = c.k || {};
        [['x', 'l'], ['x', 'r'], ['y', 't'], ['y', 'b']].forEach(([ch, lado]) => {
            const ks = M.k && M.k[ch];
            if (ks && ks.length) c.k[`fx.${id}.${lado}`] = ks.map(q => ({ ...q, t: q.t + dt, v: lados[lado](q.v) }));
        });
        Object.keys(v).forEach(n => { v[n] = Math.max(0, Math.min(100, v[n])); });
        c.fx = [...(c.fx || []), { id, t: 'crop', on: true, v }];
        // fora do tempo do fosco a camada não aparece (como no After)
        const a = Math.max(c.st, M.st), b = Math.min(veEnd(c), veEnd(M));
        if (b <= a + 1e-6) c.off = true;
        else { const vel = veVel(c); c.s += (a - c.st) * vel; c.st = a; c.e = c.s + (b - a) * vel; }
        delete c.mt;
        usados.add(M.uid);
    });
    usados.forEach(u => { if (!L.some(o => o.mt && o.mt.uid === u)) L.filter(o => o.uid === u).forEach(o => { o.off = true; }); });
    return L;
}

const VE_MG_PLANO = new Map();
function veMogrtPlanoDe(m, seq) {
    const sig = JSON.stringify(seq.clips) + '|' + seq.w + 'x' + seq.h;
    const o = VE_MG_PLANO.get(m.id);
    if (o && o.sig === sig) return o.seq;
    const out = { ...seq, clips: veMogrtPlano(seq.clips || [], seq.w || VE.seqW, seq.h || VE.seqH) };
    VE_MG_PLANO.set(m.id, { sig, seq: out });
    return out;
}
