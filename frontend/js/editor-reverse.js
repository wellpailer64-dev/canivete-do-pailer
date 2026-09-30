// =========================================================
// Pocket Editor — Inverter clipe (Reverse Speed do Premiere): o clipe toca do fim para o começo.
// O navegador não toca vídeo ao contrário: o Python gera uma cópia invertida do trecho [A, B] da mídia
// (inverter_midia em Functions/video_cutter.py; instante r da cópia = fonte B - r) e o clipe passa a usar essa
// cópia como uma mídia comum (oculta no painel Projeto: m.rvDe = mídia original, m.rvA / m.rvB = trecho).
// Prévia, som, miniaturas e exportação seguem sem nada especial. Desligar volta o clipe para a mídia original.
// Os quadros-chave ficam no mesmo lugar da timeline (como no Premiere): só mudam de referência na fonte.
// =========================================================

const VERV = { jobs: new Map(), n: 0 };
const VE_RV_INTEIRA = 90;   // mídia até 90 s: inverte inteira (aparar depois não esbarra no fim da cópia)
const VE_RV_FOLGA = 5;      // mais longa: só o trecho usado, com 5 s de folga de cada lado

const veInvertido = c => { const m = c && veMediaOf(c); return !!(m && m.rvDe != null); };
const veRvPode = c => !!c && !veIsImage(c) && !veMediaOffline(veMediaOf(c)) && !!veMediaOf(c).path;

// Os quadros-chave são em tempo da fonte: acompanham a troca de referência sem mudar de lugar na timeline
function veRvMudarFonte(c, s, e) {
    const d = s - c.s;
    if (c.k) {
        const k = {};
        Object.keys(c.k).forEach(p => { k[p] = Array.isArray(c.k[p]) ? c.k[p].map(q => ({ ...q, t: q.t + d })) : c.k[p]; });
        c.k = k;
    }
    c.s = s;
    c.e = e;
}

function veRvAplicar(c, nm) {
    const B = nm.rvB, s = B - c.e, e = B - c.s;
    veRvMudarFonte(c, s, e);
    c.m = nm.id;
}

function veRvDesfazer(c) {
    const nm = veMediaOf(c), B = nm.rvB, s = B - c.e, e = B - c.s;
    veRvMudarFonte(c, s, e);
    if (nm.rvDe) c.m = nm.rvDe; else delete c.m;
}

// Menu Clipe → Inverter clipe: liga (ou desliga, se todos já estão invertidos) nos selecionados e no par vinculado
function veInverterClipes() {
    const base = veSelLista().length ? veSelLista() : (VE.clips[VE.sel] ? [VE.clips[VE.sel]] : []);
    const lista = [...new Set(base.flatMap(c => veVinculados(c)))].filter(c => !veLocked(c) && (veInvertido(c) || veRvPode(c)));
    if (!lista.length) { veToast(veT('Selecione um clipe de vídeo ou de áudio para inverter')); return; }
    if (lista.every(veInvertido)) {
        vePushHistory();
        lista.forEach(veRvDesfazer);
        veRefresh();
        veToast(veT('Clipe voltou ao normal'));
        return;
    }
    // por mídia: um trecho que cobre todos os clipes dela
    const grupos = new Map();
    lista.filter(c => !veInvertido(c)).forEach(c => {
        const id = veMid(c);
        if (!grupos.has(id)) grupos.set(id, []);
        grupos.get(id).push(c);
    });
    const prontos = [];
    grupos.forEach((clips, id) => {
        const m = VE.media[id], dur = veDurMidia(clips[0]);
        const lo = Math.min(...clips.map(c => c.s)), hi = Math.max(...clips.map(c => c.e));
        const A = dur <= VE_RV_INTEIRA ? 0 : Math.max(0, lo - VE_RV_FOLGA);
        const B = +(dur <= VE_RV_INTEIRA ? dur : Math.min(dur, hi + VE_RV_FOLGA)).toFixed(3);
        const feito = VE.media.find(x => x && !x.removido && x.rvDe === id && x.rvA <= lo + 1e-3 && x.rvB >= hi - 1e-3 && !veMediaOffline(x));
        if (feito) { prontos.push([clips, feito]); return; }
        veRvGerar(m, +A.toFixed(3), B, nm => {
            const vivos = clips.filter(c => VE.clips.includes(c) && veMid(c) === id && c.s >= nm.rvA - 1e-3 && c.e <= nm.rvB + 1e-3);
            if (!vivos.length) return;
            vePushHistory();
            vivos.forEach(c => veRvAplicar(c, nm));
            veRefresh();
            veToast(veT('Clipe invertido'));
        });
    });
    if (prontos.length) {
        vePushHistory();
        prontos.forEach(([clips, nm]) => clips.forEach(c => veRvAplicar(c, nm)));
        veRefresh();
        veToast(veT('Clipe invertido'));
    }
}

// Pede a cópia invertida ao Python; pronto(nm) recebe a mídia nova (já na lista, preparando a prévia)
function veRvGerar(m, A, B, pronto, nmExistente) {
    const job = 'rv' + (++VERV.n);
    VERV.jobs.set(job, { m, A, B, pronto, nm: nmExistente || null });
    window.pywebview.api.ve_inverter_midia(m.path, A, B, job);
    veToast(veT('Invertendo o clipe…'));
}

function veOnInverter(ev) {
    const j = VERV.jobs.get(ev.job);
    if (!j) return;
    if (ev.stage === 'pct') { if (j.nm) j.nm.pct = ev.pct; return; }
    VERV.jobs.delete(ev.job);
    if (ev.stage === 'error') { if (j.nm) delete j.nm._rvGerando; veToast(`${veT('Não foi possível inverter o clipe')}: ${ev.error}`); return; }
    const nm = j.nm || { id: VE.media.length, name: `${vePjNome(j.m)} (${veT('invertido')})` };
    Object.assign(nm, { kind: j.m.kind === 'audio' || /\.wav$/i.test(ev.path) ? 'audio' : 'video', path: ev.path, rvDe: j.m.id, rvA: j.A, rvB: j.B });
    delete nm.offline; delete nm.missing; delete nm.lost; delete nm.erro; delete nm._rvGerando; delete nm.info;
    if (!j.nm) VE.media.push(nm);
    veRvCarregar(nm);
    j.pronto && j.pronto(nm);
}

function veRvCarregar(nm) {
    if (nm.kind === 'video') { veMidiaPreparar(nm, true); return; }
    window.pywebview.api.video_cutter_add_audio(nm.path).then(r => {
        if (!r || !r.success) { nm.erro = (r && r.error) || 'erro'; return; }
        Object.assign(nm, { dur: r.dur, peaks: r.peaks || [], url: r.url, quadros: r.quadros });
        veAudioRegistrar(nm.id, r.url, r.quadros);
        veRefresh();
        if (veMixAtivo()) veAudioEditou();
    });
}

// Projeto aberto: cópia invertida apagada (limpeza do cache) com a original presente → gera de novo
function veRvRestaurar(nm) {
    const orig = VE.media[nm.rvDe];
    if (!orig || veMediaOffline(orig) || !orig.path) return false;
    nm.offline = true;
    nm._rvGerando = true;   // não entra na lista de mídias offline para religar
    veRvGerar(orig, nm.rvA, nm.rvB, () => veRefresh(), nm);
    return true;
}
