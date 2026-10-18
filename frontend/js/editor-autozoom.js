// Autozoom (painel Animação › Autozoom): zooms de ênfase em camadas de ajuste cor-de-rosa na timeline.
// A inteligência é a mesma da Legenda Premium (editor-legenda-premium.js): a transcrição vira ideias curtas (veLpBlocos),
// cada uma ganha nota (número, pergunta, exclamação, nome próprio, palavra marcada na voz — veLpNotaTitulo + a ênfase de
// Functions/legenda_premium.py) e as melhores, espaçadas pela Quantidade, viram zoom. O zoom vai para o rosto do momento
// (YuNet, Functions/autozoom.py).
// Estilos: Seco (punch-in: entra e sai no corte), Suave (entra com curva, respira devagar, sai em S) e Smart (decide por
// momento: frase curta e forte = seco; frase longa = empurrão lento que sustenta; o resto suave; sem repetir 3 iguais).
// Efeito "zoom" (só em camada de ajuste): a curva está em veAzEscala — a MESMA de Functions/autozoom.py (exportação).

const VEAZ = { opc: null, rodando: false };
const VE_AZ_PADRAO = { qtd: 'medio', estilo: 'smart', forca: 'media', mb: 'sim' };
const VE_AZ_ESPACO = { pouco: 12, medio: 7, muito: 4, auto: 0 };       // segundos entre um zoom e outro (alvo)
const VE_AZ_ZOOM = { leve: [108, 112], media: [111, 116], forte: [115, 122] };   // [suave, seco] em %

// ── o efeito ──
VE_FX.zoom = {
    nome: 'Zoom (Autozoom)', cat: 'Distorcer', tag: 'Transform', soAjuste: true,
    params: [
        { k: 'z', nome: 'Zoom', min: 100, max: 250, step: 0.5, def: 115, un: '%' },
        { k: 'ent', nome: 'Entrada', min: 0, max: 5, step: 0.05, def: 0.6, un: 's' },
        { k: 'sai', nome: 'Saída', min: 0, max: 5, step: 0.05, def: 0.5, un: 's' },
        { k: 'suav', nome: 'Suavidade da curva', min: 0, max: 100, step: 1, def: 70, un: '%' },
        { k: 'mola', nome: 'Mola (passa do alvo e volta)', tipo: 'bool', def: 0 },
        { k: 'der', nome: 'Deriva (respira no meio)', min: -20, max: 20, step: 0.5, def: 2, un: '%' },
        { k: 'cx', nome: 'Centro X', min: 0, max: 100, step: 0.5, def: 50, un: '%' },
        { k: 'cy', nome: 'Centro Y', min: 0, max: 100, step: 0.5, def: 45, un: '%' },
        // borra só quando o zoom anda rápido: média de instantes vizinhos dentro do obturador (como o After)
        { k: 'mb', nome: 'Desfoque de movimento', tipo: 'bool', def: 0 },
        { k: 'obt', nome: 'Obturador', min: 0, max: 200, step: 5, def: 100, un: '%' },
    ],
    neutro: v => !(v.z > 100.01),
    draw(a, v, env) {
        const c = env.c; if (!c) return a;
        const D = Math.max(1e-3, veEnd(c) - c.st), u = (env.T == null ? VE.playhead : env.T) - c.st;
        // desfoque de movimento: instantes dentro do obturador (presos à camada, como na exportação)
        const span = +v.mb && +v.obt > 0 ? (+v.obt / 100) / (VE.fps || 30) : 0, N = span ? 7 : 1;
        const ss = Array.from({ length: N }, (_, j) => veAzEscala(v, Math.max(0, Math.min(D, u + (N > 1 ? (j / (N - 1) - 0.5) * span : 0))), D));
        if (ss.every(s => Math.abs(s - 1) < 1e-4)) return a;
        const igual = Math.max(...ss) - Math.min(...ss) < 1e-4;
        const w = a.cv.width, h = a.cv.height, ax = w * v.cx / 100, ay = h * v.cy / 100, g = veFxOther(a, w, h), x = g.ctx;
        x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h);
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        (igual ? [ss[0]] : ss).forEach((s, j) => {   // média corrida: a amostra j entra com peso 1/(j+1)
            x.globalAlpha = 1 / (j + 1);
            x.setTransform(s, 0, 0, s, ax - ax * s, ay - ay * s); x.drawImage(a.cv, 0, 0);
        });
        x.restore();
        return g;
    },
};

// escala no instante u (s dentro da camada de duração D): entrada expo-out (ou mola), deriva linear, saída em S
function veAzEscala(v, u, D) {
    const z = (+v.z || 100) / 100, der = (+v.der || 0) / 100, ent = Math.min(+v.ent || 0, D * 0.6), sai = Math.min(+v.sai || 0, D * 0.4);
    const zf = z * (1 + der), cl = x => Math.max(0, Math.min(1, x));
    if (u < ent) {
        const x = ent > 1e-4 ? cl(u / ent) : 1;
        let e;
        if (+v.mola) e = 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
        else { const k = 1 + (+v.suav || 0) / 100 * 11; e = (1 - 2 ** (-k * x)) / (1 - 2 ** -k); }
        return 1 + (z - 1) * e;
    }
    if (u > D - sai) {
        const y = sai > 1e-4 ? cl((D - u) / sai) : 1;
        return 1 + (zf - 1) * (y * y * (3 - 2 * y));
    }
    return z + (zf - z) * cl((u - ent) / Math.max(1e-6, D - ent - sai));
}

// ── opções (lembradas) ──
function veAzOpc() {
    if (!VEAZ.opc) { try { VEAZ.opc = { ...VE_AZ_PADRAO, ...JSON.parse(localStorage.getItem('ve-autozoom') || '{}') }; } catch (e) { VEAZ.opc = { ...VE_AZ_PADRAO }; } }
    return VEAZ.opc;
}
function veAzSetOpc(k, v) {
    veAzOpc()[k] = v;
    try { localStorage.setItem('ve-autozoom', JSON.stringify(VEAZ.opc)); } catch (e) { /* sem armazenamento */ }
    veAzRender();
}

const veAzCamadas = () => VE.clips.filter(c => c.az && veIsAdj(c));

// ── ênfase da voz (a mesma análise da Legenda Premium; guardada em VELP.enf para as duas) ──
async function veAzEnfase() {
    if (typeof VELP === 'undefined' || typeof veTxMixChave !== 'function') return;
    const chave = veTxMixChave();
    if (VELP.enf && VELP.enfChave === chave) return;
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_leg_premium_enfase) return;
    const orig = VE.clips;
    let mix;
    try { VE.clips = orig.filter(c => !c.lpSfx); mix = veExportPlan().mix; } finally { VE.clips = orig; }
    const r = await api.ve_leg_premium_enfase(mix, VE.dur, VETX.palavras.map(w => [w[0], w[1], w[2]]));
    if (r && r.success) { VELP.enf = new Map(VETX.palavras.map((w, k) => [(+w[0]).toFixed(2), r.enfase[k]])); VELP.enfChave = chave; }
}

// clipe de vídeo/imagem visível no instante t (o de cima; nada de ajuste, texto ou gráfico)
function veAzClipeEm(t) {
    return VE.clips.filter(c => !veIsAudio(c) && !veIsAdj(c) && !veIsTexto(c) && !(typeof veEhGrafico === 'function' && veEhGrafico(c))
        && !veOculto(c) && t >= c.st && t < veEnd(c)).sort((a, b) => b.tr - a.tr)[0] || null;
}

// ── escolher os momentos ──
function veAzMomentos(opc) {
    const W = veTxJuntarHifen(VETX.palavras);
    const L = veLpBlocos(W);
    if (!L.length) return [];
    const nota = L.map((l, i) => {
        const tk = veTxTokens(l.texto), D = l.en - l.st;
        let n = veLpNotaTitulo(l, i);
        const forte = tk.some(w => /\d/.test(w)) || /!["')\]]?$/.test(tk[tk.length - 1] || '')
            || tk.some((w, k) => (veLpEnf((l.pt || [])[k]) || 0) >= 3);
        return { i, st: l.st, en: l.en, D, n, forte, pergunta: /\?["')\]]?$/.test(tk[tk.length - 1] || ''), texto: l.texto };
    });
    const total = L[L.length - 1].en - L[0].st;
    const esp = VE_AZ_ESPACO[opc.qtd] || 0;
    const alvo = esp ? Math.max(1, Math.round(total / esp)) : 999;
    const minNota = opc.qtd === 'auto' ? 4 : 1, folga = opc.qtd === 'muito' ? 1.0 : opc.qtd === 'auto' ? 1.8 : esp * 0.45;
    const esc = [];
    for (const m of [...nota].filter(m => m.n >= minNota).sort((a, b) => b.n - a.n)) {
        if (esc.length >= alvo) break;
        if (esc.some(o => m.st < o.en + folga && o.st < m.en + folga)) continue;
        esc.push(m);
    }
    // automático: no máximo 1 a cada 3,5 s
    if (opc.qtd === 'auto' && esc.length > total / 3.5) esc.splice(Math.max(1, Math.round(total / 3.5)));
    return esc.sort((a, b) => a.st - b.st);
}

// estilo de cada momento → parâmetros do efeito e o trecho da camada
function veAzPlano(m, opc, ultimos) {
    const [zs, zc] = VE_AZ_ZOOM[opc.forca] || VE_AZ_ZOOM.media;
    let est = opc.estilo;
    if (est === 'smart') {
        est = m.forte && m.D <= 2.2 ? 'seco' : m.D >= 2.2 ? 'empurra' : 'suave';
        if (ultimos.length >= 2 && ultimos.slice(-2).every(x => x === est)) est = est === 'seco' ? 'suave' : 'seco';   // sem 3 iguais
    }
    let st, en, v;
    if (est === 'seco') {   // punch-in: entra no corte junto com a palavra e sai no corte
        st = m.st - 0.03; en = Math.max(m.en, st + 1.0);
        v = { z: zc, ent: 0, sai: 0, suav: 70, mola: 0, der: 1 };
    } else if (est === 'empurra') {   // frase longa: empurrão lento que acompanha a frase inteira
        st = m.st - 0.2; en = m.en + 0.15;
        const D = en - st;
        v = { z: zs, ent: +Math.min(D * 0.7, 3).toFixed(2), sai: +Math.min(0.45, D * 0.2).toFixed(2), suav: 30, mola: 0, der: 1.5 };
    } else {   // suave: chega na palavra e respira
        st = m.st - 0.3; en = Math.max(m.en + 0.2, st + 1.3);
        const D = en - st;
        v = { z: zs, ent: +Math.min(0.7, D * 0.45).toFixed(2), sai: +Math.min(0.5, D * 0.3).toFixed(2), suav: 75, mola: m.pergunta ? 1 : 0, der: 2.5 };
    }
    // não atravessa um corte do vídeo de baixo (o rosto muda de lugar na outra cena)
    const cortes = VE.clips.filter(c => !veIsAudio(c) && !veIsAdj(c) && !veIsTexto(c)).flatMap(c => [c.st, veEnd(c)]);
    const corte = cortes.filter(c => c > st + 0.4 && c < en - 0.05).sort((a, b) => a - b)[0];
    if (corte != null) en = corte;
    st = Math.max(0, st); en = Math.min(VE.dur || en, en);
    return { st: +st.toFixed(3), en: +en.toFixed(3), est, v };
}

// ── gerar ──
async function veAzGerar(opc = veAzOpc()) {
    if (!VE.ready || VEAZ.rodando) return null;
    if (typeof veLpBlocos !== 'function') { veToast('Autozoom: falta o módulo de legendas'); return null; }
    if (!VETX.palavras.length) {
        if (VETX.rodando) { veToast('Autozoom: esperando a transcrição terminar…'); }
        else { veToast('Autozoom: transcrevendo a fala primeiro…'); veTxTranscrever(); }
        VEAZ.rodando = true; veAzRender();
        for (let k = 0; k < 1800 && (VETX.rodando || !VETX.palavras.length); k++) {
            await new Promise(r => setTimeout(r, 1000));
            if (!VETX.rodando && !VETX.palavras.length) break;
        }
        VEAZ.rodando = false;
        if (!VETX.palavras.length) { veToast('Autozoom: sem fala transcrita na timeline'); veAzRender(); return null; }
    }
    VEAZ.rodando = true; veAzRender();
    try {
        try { await veAzEnfase(); } catch (e) { /* sem a voz: só o texto */ }
        const momentos = veAzMomentos(opc);
        if (!momentos.length) { veToast('Autozoom: nenhum momento de ênfase encontrado'); return []; }
        const ult = [];
        const planos = momentos.map(m => { const p = veAzPlano(m, opc, ult); ult.push(p.est); return p; }).filter(p => p.en - p.st >= 0.5);
        // rosto de cada momento (no meio do zoom): o zoom vai para ele
        const api = window.pywebview && window.pywebview.api;
        const ped = planos.map(p => { const t = (p.st + p.en) / 2, c = veAzClipeEm(t), m = c && veMediaOf(c); return m && m.path && m.kind === 'video' ? [m.path, veSrcAt(c, t)] : [null, 0]; });
        let ros = [];
        try { const r = api && api.ve_autozoom_rostos && await api.ve_autozoom_rostos(ped); ros = (r && r.rostos) || []; } catch (e) { ros = []; }
        vePushHistory();
        VE.clips = VE.clips.filter(c => !(c.az && veIsAdj(c)));
        let aj = VE.media.find(x => x.kind === 'ajuste' && !x.removido);
        if (!aj) { aj = { id: VE.media.length, kind: 'ajuste', name: 'Camada de ajuste' }; VE.media.push(aj); }
        // trilha: logo acima do vídeo/fotos; se ocupada no trecho, a de cima
        const base = Math.max(0, ...VE.clips.filter(c => !veIsAudio(c) && !veIsAdj(c) && !veIsTexto(c) && !(typeof veEhGrafico === 'function' && veEhGrafico(c))).map(c => c.tr)) + 1;
        const novos = planos.map((p, k) => {
            const r = ros[k];
            const v = { ...p.v, cx: 50, cy: 45, mb: opc.mb === 'nao' ? 0 : 1, obt: 100 };
            if (r) {
                v.cx = +(r[0] * 100).toFixed(1); v.cy = +(r[1] * 100).toFixed(1);
                if (r[2] > 0.42) v.z = +(100 + (v.z - 100) * 0.7).toFixed(1);   // rosto já grande: zoom menor (não corta a testa)
            }
            let tr = base;
            while (VE.clips.some(c => !veIsAudio(c) && c.tr === tr && c.st < p.en && veEnd(c) > p.st)) tr++;
            veEnsureTrackIndex(tr);
            const c = { st: p.st, s: 0, e: +(p.en - p.st).toFixed(3), m: aj.id, tr, cor: 'pink', nome: 'Autozoom', az: { est: p.est },
                        fx: [{ id: veFxNewId(), t: 'zoom', on: true, v }] };
            VE.clips.push(c);
            return c;
        });
        veRelayout(); veRefresh();
        const nomes = { seco: 'secos', suave: 'suaves', empurra: 'empurrões' };
        const cont = Object.entries(novos.reduce((o, c) => { o[c.az.est] = (o[c.az.est] || 0) + 1; return o; }, {})).map(([k, n]) => `${n} ${nomes[k] || k}`).join(', ');
        veToast(`Autozoom: ${novos.length} zoom${novos.length === 1 ? '' : 's'} (${cont})`);
        return novos;
    } finally { VEAZ.rodando = false; veAzRender(); }
}

function veAzRemover() {
    const n = veAzCamadas().length; if (!n) { veToast('Nenhum autozoom na timeline'); return; }
    vePushHistory();
    VE.clips = VE.clips.filter(c => !(c.az && veIsAdj(c)));
    veRelayout(); veRefresh();
    veToast(`${n} autozoom${n === 1 ? '' : 's'} removido${n === 1 ? '' : 's'}`);
    veAzRender();
}

// ── painel Animação › Autozoom ──
function veAzRender() {
    const box = document.getElementById('ve-az-corpo'); if (!box) return;
    const o = veAzOpc(), n = VE.ready ? veAzCamadas().length : 0;
    const grupo = (k, itens) => itens.map(([v, nome, dica]) => `<button type="button" data-az="${k}" data-v="${v}" class="${o[k] === v ? 'active' : ''}" title="${veT(dica)}">${veT(nome)}</button>`).join('');
    box.innerHTML = `
        <div class="ve-tr-control-row"><span>${veT('Quantidade')}</span><div class="ve-tr-speed-buttons">${grupo('qtd', [['pouco', 'Pouco', 'Um a cada ~12 s'], ['medio', 'Médio', 'Um a cada ~7 s'], ['muito', 'Muito', 'Um a cada ~4 s'], ['auto', 'Automático', 'Só onde a fala pede (nota alta), no máximo um a cada 3,5 s']])}</div></div>
        <div class="ve-tr-control-row"><span>${veT('Estilo')}</span><div class="ve-tr-speed-buttons">${grupo('estilo', [['seco', 'Seco', 'Punch-in: entra e sai no corte, junto com a palavra'], ['suave', 'Suave', 'Chega com curva, respira devagar e sai em S'], ['smart', 'Smart', 'Decide por momento: frase curta e forte = seco; frase longa = empurrão lento; o resto suave']])}</div></div>
        <div class="ve-tr-control-row"><span>${veT('Força')}</span><div class="ve-tr-speed-buttons">${grupo('forca', [['leve', 'Leve', '108–112%'], ['media', 'Média', '111–116%'], ['forte', 'Forte', '115–122%']])}</div></div>
        <div class="ve-tr-control-row"><span>${veT('Desfoque')}</span><div class="ve-tr-speed-buttons">${grupo('mb', [['sim', 'Ligado', 'Desfoque de movimento nos zooms rápidos (só borra enquanto o zoom anda)'], ['nao', 'Desligado', 'Zoom sem desfoque de movimento']])}</div></div>
        <div class="ve-az-acoes">
            <button type="button" class="ve-btn ve-btn-sm ve-az-gerar" data-az-acao="gerar"${VEAZ.rodando ? ' disabled' : ''}>${VEAZ.rodando ? '⏳ ' + veT('Analisando a fala…') : '🔍 ' + veT('Gerar autozoom')}</button>
            <button type="button" class="ve-btn ve-btn-sm" data-az-acao="remover"${n ? '' : ' disabled'}>${veT('Remover')}${n ? ` (${n})` : ''}</button>
        </div>
        <div class="ve-az-dica">${veT('Lê a transcrição e a ênfase da voz, escolhe os momentos fortes e cria camadas de ajuste cor-de-rosa com zoom no rosto. Cada uma pode ser ajustada nos Controles de efeito (zoom, curva, centro).')}</div>`;
}
function veAzInit() {
    const sec = document.getElementById('ve-az-sec'); if (!sec || sec._ok) return;
    sec._ok = true;
    sec.addEventListener('click', e => {
        const b = e.target.closest('[data-az],[data-az-acao]'); if (!b) return;
        if (b.dataset.az) return veAzSetOpc(b.dataset.az, b.dataset.v);
        if (b.dataset.azAcao === 'gerar') veAzGerar();
        else if (b.dataset.azAcao === 'remover') veAzRemover();
    });
    veAzRender();
}
document.addEventListener('DOMContentLoaded', veAzInit);
if (document.readyState !== 'loading') setTimeout(veAzInit, 0);

// API (testes e a Kani): VEAZ_API.gerar({qtd, estilo, forca}), .remover(), .lista(), .escala(c, T)
window.VEAZ_API = {
    gerar: o => veAzGerar({ ...veAzOpc(), ...(o || {}) }),
    remover: () => veAzRemover(),
    lista: () => veAzCamadas().map(c => ({ st: c.st, en: veEnd(c), tr: c.tr, est: c.az.est, v: { ...c.fx[0].v } })),
    escala: (c, T) => { const f = c && (c.fx || []).find(x => x.t === 'zoom'); return f ? veAzEscala(veFxValues(f, c, T), T - c.st, veEnd(c) - c.st) : 1; },
};
