// J/L-cut: separa o som do vídeo e estende só por um trecho que o detector confirma como pausa.
// veJcutPlano(opc) calcula as emendas; veJcutAplicar(opc) altera a timeline num único desfazer.

function veJcutDuracao(opc) {
    const ms = Number(opc && opc.ms);
    return Math.max(120, Math.min(400, Number.isFinite(ms) && ms > 0 ? ms : 200)) / 1000;
}

function veJcutPath(c) {
    const m = veMediaOf(c);
    return m && (m.path || (m.id === 0 ? VE.path : ''));
}

function veJcutMesmaMidia(a, b) {
    const ma = veMediaOf(a), mb = veMediaOf(b);
    if (!ma || !mb) return false;
    if (ma === mb || ma.id === mb.id) return true;
    const pa = veJcutPath(a), pb = veJcutPath(b);
    return !!pa && !!pb && String(pa).replace(/\\/g, '/').toLowerCase() === String(pb).replace(/\\/g, '/').toLowerCase();
}

function veJcutPares(opc) {
    const escolhidos = Array.isArray(opc && opc.clips) ? opc.clips : null;
    const falados = VE.clips.filter(c => c && veTemSom(c) && !veLocked(c) && veMediaOf(c) && veMediaOf(c).kind !== 'image');
    const trilhaBase = escolhidos && escolhidos.length ? null : (falados.length ? Math.min(...falados.map(c => +c.tr || 0)) : null);
    const visuais = VE.clips.filter(c => c && c.x !== 'a' && !veLocked(c) && veMediaOf(c) && veMediaOf(c).kind === 'video' &&
        (escolhidos ? true : +c.tr === trilhaBase));
    visuais.sort((a, b) => (+a.tr - +b.tr) || (a.st - b.st));
    const tol = Math.max(0.012, veFrame() * 0.55), pares = [];
    for (let i = 0; i < visuais.length; i++) {
        const a = visuais[i], fim = veEnd(a);
        const b = visuais.find(o => o !== a && +o.tr === +a.tr && Math.abs(o.st - fim) <= tol && veJcutMesmaMidia(a, o));
        if (!b || (escolhidos && !escolhidos.includes(a) && !escolhidos.includes(b))) continue;
        const corte = (fim + b.st) / 2;
        if (pares.some(p => p.a === a && p.b === b)) continue;
        pares.push({ a, b, corte });
    }
    return pares;
}

async function veJcutTrechoSeguro(c, fonteIni, dur) {
    const path = veJcutPath(c), midiaDur = veDurMidia(c);
    if (!path || !Number.isFinite(midiaDur) || fonteIni < -0.001 || fonteIni + dur > midiaDur + 0.001) return false;
    // Uma janela curta demais pode conter só silêncio e não dar contraste ao detector.
    const ini = Math.max(0, fonteIni - 0.85), fim = Math.min(midiaDur, fonteIni + dur + 0.85);
    const r = await window.pywebview.api.ve_respiros(path, ini, fim - ini, 'normal');
    if (!r || !r.success) return false;
    const alvoA = fonteIni - ini, alvoB = alvoA + dur;
    return (r.cortes || []).some(([a, b]) => a <= alvoA + 0.025 && b >= alvoB - 0.025);
}

function veJcutItem(c, papel) {
    return { papel, m: veMid(c), tr: +c.tr || 0, st: +c.st, s: +c.s, e: +c.e, v: veVel(c), x: c.x || '' };
}

async function veJcutPlano(opc) {
    opc = opc || {};
    const dur = veJcutDuracao(opc), pedido = /^(j|l|auto)$/.test(opc.modo) ? opc.modo : 'auto';
    const emendas = [];
    for (const p of veJcutPares(opc)) {
        const { a, b, corte } = p, tentativas = pedido === 'auto' ? ['j', 'l'] : [pedido];
        for (const modo of tentativas) {
            const c = modo === 'j' ? b : a, vel = veVel(c);
            if (!(vel > 0)) continue;
            const fonteIni = modo === 'j' ? c.s - dur * vel : c.e;
            if (modo === 'j' ? fonteIni < 0 : fonteIni + dur * vel > veDurMidia(c) + 0.001) continue;
            if (!await veJcutTrechoSeguro(c, fonteIni, dur * vel)) continue;
            emendas.push({ modo, ms: Math.round(dur * 1000), tr: +a.tr || 0, corte,
                a: veJcutItem(a, 'anterior'), b: veJcutItem(b, 'próximo'), fonte: [fonteIni, fonteIni + dur * vel] });
            break;
        }
    }
    return { emendas, tratadas: emendas.length, ms: Math.round(dur * 1000) };
}

function veJcutAudio(c) {
    if (c.x === 'a') return c;
    if (c.x === 'v') return VE.clips.find(o => o.x === 'a' && o.lk && o.lk === c.lk) || null;
    if (typeof veSeparar !== 'function') return null;
    const par = veSeparar(c);
    return par && par[1];
}

async function veJcutAplicar(opc) {
    if (!VE.ready) return { ok: false, motivo: 'editor não está pronto', tratadas: 0 };
    const plano = await veJcutPlano(opc);
    if (!plano.emendas.length) return { ok: true, tratadas: 0, emendas: [] };
    const n0 = VE.history.length;
    vePushHistory();
    let feitas = 0;
    for (const e of plano.emendas) {
        const a = VE.clips.find(c => c && veMid(c) === e.a.m && (+c.tr || 0) === e.a.tr && c.st === e.a.st && c.s === e.a.s && c.e === e.a.e && c.x !== 'a');
        const b = VE.clips.find(c => c && veMid(c) === e.b.m && (+c.tr || 0) === e.b.tr && c.st === e.b.st && c.s === e.b.s && c.e === e.b.e && c.x !== 'a');
        if (!a || !b) continue;
        const alvo = e.modo === 'j' ? b : a, audio = veJcutAudio(alvo);
        if (!audio) continue;
        const delta = e.ms / 1000, vel = veVel(alvo);
        if (e.modo === 'j') {
            if (audio.s - delta * vel < -0.001) continue;
            audio.st -= delta;
            audio.s = Math.max(0, audio.s - delta * vel);
        } else {
            if (audio.e + delta * vel > veDurMidia(alvo) + 0.001) continue;
            audio.e += delta * vel;
        }
        feitas++;
    }
    if (!feitas) { VE.history.splice(n0); veUpdateUndo(); return { ok: true, tratadas: 0, emendas: [] }; }
    if (VE.history.length > n0 + 1) VE.history.splice(n0 + 1);
    veRelayout();
    veAfterEdit(Math.min(...plano.emendas.map(e => e.corte)));
    veUpdateUndo();
    veToast(`J-cut: ${feitas} ${feitas === 1 ? 'emenda' : 'emendas'} tratadas`);
    return { ok: true, tratadas: feitas, emendas: plano.emendas.slice(0, feitas) };
}
