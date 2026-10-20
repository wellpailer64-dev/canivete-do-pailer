// =========================================================
// Pocket Editor — Comp que passa direto ("só organiza") e Agrupar cenas em Comps
// Uma Comp com m.passa só ORGANIZA: na prévia e na exportação as camadas de dentro entram na pilha da timeline de fora,
// no lugar da faixa dela (como o "Passar através" do grupo do Photoshop). Mesclagem (Tela...) e camada de ajuste de
// dentro continuam valendo para o que está embaixo: o resultado é o mesmo de antes de agrupar. Vale enquanto a faixa da
// Comp está neutra (sem movimento, opacidade, efeito, mesclagem, transição, velocidade, máscara); mexeu em algo disso,
// ela volta a ser uma Comp comum, desenhada pelo arquivo dela (que continua sendo renderizado: miniatura e esse caso).
// Agrupar cenas: acha os blocos pelos cortes (várias camadas começando juntas, quase nada atravessando), confere que a
// ordem da pilha fica igual (camada de fora entre as de dentro = não dá) e cria uma Comp por cena. Um Ctrl+Z desfaz.
// =========================================================

function veCompPassa(c) {
    if (!c || c._tr || c.tin || c.tout) return false;
    const m = veMediaOf(c);
    if (!veEhComp(m) || !m.passa || !veCompSeqDe(m)) return false;
    if (Math.abs(veVel(c) - 1) > 1e-4 || !veIsPlain(c)) return false;
    return !(typeof veCaExport === 'function' && veCaExport(c).length);
}

const veCompTemPassa = clips => (clips || []).some(veCompPassa);

// Algum clipe (ou camada de dentro de Comp que passa direto) precisa virar PNG/vídeo antes da exportação (veTxPngs)?
function veTxPrecisaEm(clips = VE.clips, d = 0) {
    return (clips || []).some(c => veTxPrecisa(c) ||
        (d < 8 && veCompPassa(c) && veTxPrecisaEm((veCompSeqEfetiva(veMediaOf(c)) || {}).clips, d + 1)));
}

// Estado das trilhas de uma lista de clipes (a timeline aberta ou a de uma Comp)
function veCompTrkDe(clips) {
    if (clips === VE.clips) return VE_TRK;
    const seq = (VE.sequences || []).find(s => s.clips === clips);
    return seq ? veSeqTracks(seq.trilhas, seq.clips) : VE_TRK;
}

// ── achatar: cada faixa de Comp que passa direto vira as camadas de dentro, na pilha daqui ──
// As cópias são sempre os MESMOS objetos para o mesmo clipe (PNGs dos textos e camadas desenhadas do motion da
// exportação ficam guardados por clipe: VE._txPng). Trilhas renumeradas na ordem da pilha: as de dentro de uma Comp
// entram logo acima da trilha dela, na ordem delas.
// VECOMP.planas: lista achatada → { clips, trk } (veMoAssar desenha as camadas com ela no lugar)
function veCompPlana(clips = VE.clips, trk = VE_TRK) {
    if (!veCompTemPassa(clips)) return null;
    if (!VECOMP.ids) Object.assign(VECOMP, { ids: new WeakMap(), idN: 0, copias: new Map(), planas: new WeakMap() });
    const id = o => { let n = VECOMP.ids.get(o); if (!n) VECOMP.ids.set(o, n = ++VECOMP.idN); return n; };
    const ents = [], uids = new Set(clips.map(c => c.uid).filter(Boolean));
    let inst = 0;
    const juntar = (lista, tk, pre, herda, dono, remap, d) => {
        const solo = (tk.a || []).some(t => t && t.solo);
        lista.forEach(c => {
            const o = c._o || c, chave = pre.concat(+c.tr || 0);
            const v = { ...((tk.v || [])[c.tr] || {}) }, a = { ...((tk.a || [])[c.tr] || {}) };
            if (herda) { delete a.solo; if (herda.hide) v.hide = true; if (herda.mute) a.mute = true; }
            else if (solo && !a.solo && veCompPassa(c)) a.mute = true;   // calada pelo solo de outra trilha daqui
            if (d < 8 && veCompPassa(c)) {
                if (veClipOff(c)) return;
                const seq = veCompSeqEfetiva(veMediaOf(c));
                const dentro = veRecortarClips(seq.clips || [], c.s, c.e).map(n => { n.st = +(n.st + c.st).toFixed(6); return n; });
                // a mesma Comp usada mais de uma vez: as camadas mãe/fosco de cada cópia se acham entre elas
                let rm = null;
                if (dentro.some(n => n.uid && uids.has(n.uid))) {
                    inst++;
                    rm = new Map(dentro.filter(n => n.uid).map(n => [n.uid, n.uid + '~' + inst]));
                }
                dentro.forEach(n => uids.add(rm && rm.get(n.uid) || n.uid));
                juntar(dentro, veSeqTracks(seq.trilhas, seq.clips), chave, { hide: !!v.hide, mute: !!a.mute }, dono + '/' + id(o), rm, d + 1);
                return;
            }
            ents.push({ c, k: dono + '/' + id(o), chave, v, a, rm: remap });
        });
    };
    juntar(clips, trk, [], null, '', null, 0);
    const cmp = (x, y) => {
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
            if (x[i] == null) return -1;
            if (y[i] == null) return 1;
            if (x[i] !== y[i]) return x[i] - y[i];
        }
        return 0;
    };
    const chaves = [...new Map(ents.map(e => [e.chave.join(','), e.chave])).values()].sort(cmp);
    const idx = new Map(chaves.map((k, i) => [k.join(','), i]));
    const out = { clips: [], trk: veTrkNovo(Math.max(VE_MIN_TRACKS, chaves.length)) };
    const novas = new Map();
    ents.forEach(e => {
        const i = idx.get(e.chave.join(','));
        out.trk.v[i] = e.v;
        out.trk.a[i] = e.a;
        const cp = VECOMP.copias.get(e.k) || {};
        for (const p in cp) delete cp[p];
        for (const p in e.c) if (p !== '_o') cp[p] = e.c[p];
        cp.tr = i;
        if (e.rm) {
            if (cp.uid && e.rm.has(cp.uid)) cp.uid = e.rm.get(cp.uid);
            if (cp.pai && e.rm.has(cp.pai)) cp.pai = e.rm.get(cp.pai);
            if (cp.mt && cp.mt.uid && e.rm.has(cp.mt.uid)) cp.mt = { ...cp.mt, uid: e.rm.get(cp.mt.uid) };
        }
        novas.set(e.k, cp);
        out.clips.push(cp);
    });
    VECOMP.copias = novas;
    VECOMP.planas.set(out.clips, out);
    return out;
}

// A lista achatada no lugar da aberta, só durante fn (síncrono)
function veCompPlanaComo(pl, fn) {
    const g = { clips: VE.clips, trk: VE_TRK, sel: VE.sel, selx: VE.selx };
    try {
        VE.clips = pl.clips;
        VE_TRK = pl.trk;
        VE.sel = -1;
        VE.selx = null;
        return fn();
    } finally {
        VE.clips = g.clips; VE_TRK = g.trk; VE.sel = g.sel; VE.selx = g.selx;
    }
}

// ── monitor: as camadas de dentro desenhadas no MESMO quadro da timeline de fora (pegam o que está embaixo) ──
function veCompPassaDesenhar(ctx, cv, c, pv, T) {
    const seq = veCompSeqEfetiva(veMediaOf(c));
    if (!seq || (VECOMP.prof || 0) > 8) return;
    const tc = veSrcAt(c, T);
    VECOMP.prof = (VECOMP.prof || 0) + 1;
    try {
        veCompComo(seq, () => {
            const ph = VE.playhead;
            VE.playhead = tc;   // quadros-chave e animações no tempo da Comp
            try {
                // transições de dentro (editor-trans.js): os clipes estendidos e animados, como na pilha de fora
                const temTr = VE.clips.some(o => o.tin || o.tout), trans = temTr && veTransAtiva(tc);
                const lista = trans ? veTransVirtuais() : VE.clips;
                const itens = lista.filter(ic => !veIsAudio(ic) && !veOculto(ic) && tc >= ic.st - VE_EPS && tc < veEnd(ic) - VE_EPS)
                    .sort((x, y) => x.tr - y.tr || (x._z || 0) - (y._z || 0) || x.st - y.st).map(ic => {
                    const src = veCompSrc(seq, ic, tc, pv, 1, VECOMP.prof);
                    if (!src) VECOMP.parcial = true;
                    return { c: ic, src };
                });
                veDesenharItens(ctx, cv, itens, pv, tc);
            } finally { VE.playhead = ph; }
        });
    } finally { VECOMP.prof--; }
}

// ─────────────────────────── Agrupar cenas em Comps ───────────────────────────
// Plano (não muda nada): { cenas: [{ a, b, membros, nome }], fora: [clipes que ficam na timeline de fora] }
function veCompCenasPlano(opts = {}) {
    const tol = 2 * veFrame(), total = VE.dur || 1;
    const vis = VE.clips.filter(c => !veIsAudio(c) && !veLocked(c));
    const longo = c => veLen(c) > (opts.longo || 0.4) * total;   // fundo que atravessa as cenas: fica fora
    const curtos = vis.filter(c => !longo(c));
    const sobre = (x, y) => Math.min(veEnd(x), veEnd(y)) - Math.max(x.st, y.st) > tol;
    // cortes: instante em que 2+ camadas começam juntas e no máximo 1 atravessa (uma ponte entre as cenas)
    const cruza = t => curtos.filter(c => c.st < t - tol && veEnd(c) > t + tol).length;
    const cand = [...new Set(curtos.map(c => +c.st.toFixed(3)))].sort((a, b) => a - b)
        .filter(t => t > 0.5 && t < total - 0.5)
        .map(t => ({ t, x: cruza(t), n: curtos.filter(c => Math.abs(c.st - t) <= 0.15).length }))
        .filter(o => o.n >= 2 && o.x <= 1);
    const cortes = [];
    cand.forEach(o => {
        const u = cortes[cortes.length - 1];
        if (u && o.t - u.t < 0.5) { if (o.x < u.x) Object.assign(u, o); return; }
        cortes.push({ ...o });
    });
    const lim = [0, ...cortes.map(o => o.t), Infinity];
    let cenas = lim.slice(0, -1).map((a, i) => ({ a, b: lim[i + 1], membros: [] }));
    const fora = vis.filter(longo);
    curtos.forEach(c => {
        let melhor = null, mx = 0;
        cenas.forEach(s => { const d = Math.min(veEnd(c), s.b) - Math.max(c.st, s.a); if (d > mx) { mx = d; melhor = s; } });
        if (melhor) melhor.membros.push(c); else fora.push(c);
    });
    // ordem da pilha: para cada camada X de fora da cena que aparece junto com ela, as de dentro que aparecem junto
    // precisam estar todas acima ou todas abaixo de X (a Comp é desenhada num lugar só da pilha)
    const conflitos = () => {
        const out = [];
        cenas.forEach(s => {
            const dentro = new Set(s.membros);
            vis.forEach(x => {
                if (dentro.has(x)) return;
                const ys = s.membros.filter(y => sobre(x, y));
                const acima = ys.filter(y => y.tr > x.tr), abaixo = ys.filter(y => y.tr <= x.tr);
                if (acima.length && abaixo.length) out.push({ s, x, acima, abaixo });
            });
        });
        return out;
    };
    const cenaDe = c => cenas.find(s => s.membros.includes(c));
    for (let volta = 0; volta < 300; volta++) {
        const cf = conflitos();
        if (!cf.length) break;
        const { s, x, acima, abaixo } = cf[0], h = cenaDe(x);
        if (h) {
            // ponte entre duas cenas: tenta ela na outra cena, depois fora, por fim junta as duas cenas
            const n0 = cf.length;
            h.membros = h.membros.filter(y => y !== x); s.membros.push(x);
            if (conflitos().length < n0) continue;
            s.membros = s.membros.filter(y => y !== x); fora.push(x);
            if (conflitos().length < n0) continue;
            fora.splice(fora.indexOf(x), 1);
            s.membros = s.membros.concat(h.membros, [x]);
            s.a = Math.min(s.a, h.a); s.b = Math.max(s.b, h.b);
            cenas = cenas.filter(o => o !== h);
        } else {
            // camada de fora no meio da pilha da cena (ex.: a vinheta entre as camadas e um ajuste por cima): o lado
            // com menos camadas fica fora da Comp, no lugar dele
            const sai = acima.length <= abaixo.length ? acima : abaixo;
            s.membros = s.membros.filter(y => !sai.includes(y));
            fora.push(...sai);
        }
    }
    cenas = cenas.filter(s => {
        if (s.membros.length >= 2) return true;
        fora.push(...s.membros);
        return false;
    });
    const resto = conflitos();
    cenas.forEach((s, i) => {
        s.a = Math.min(...s.membros.map(c => c.st));
        s.b = Math.max(...s.membros.map(veEnd));
        s.nome = `${veT('Cena')} ${i + 1}` + (veCompCenaDica(s.membros) ? ` · ${veCompCenaDica(s.membros)}` : '');
    });
    return { cenas, fora, conflitos: resto.length };
}

// Um nome que ajude a reconhecer a cena: a imagem mais longa ou o primeiro texto
function veCompCenaDica(membros) {
    const img = membros.filter(c => veIsImage(c) && veMediaOf(c) && veMediaOf(c).kind === 'image')
        .sort((x, y) => veLen(y) - veLen(x))[0];
    const ni = img ? String(vePjNome(veMediaOf(img)) || '').replace(/\.[a-z0-9]{2,4}$/i, '') : '';
    if (ni.length >= 4) return ni.slice(0, 24);   // nome curto demais (ex.: "C"): vale o texto
    const tx = membros.filter(c => veIsTexto(c) && c.tx && c.tx.t).map(c => String(c.tx.t).replace(/\s+/g, ' ').trim())
        .sort((x, y) => y.length - x.length)[0];
    return tx ? tx.slice(0, 24) : '';
}

// Aplica o plano: uma Comp que passa direto por cena, no lugar certo da pilha (abre faixa nova se precisar); no fim
// tira as faixas vazias. Devolve as mídias das Comps criadas.
function veCompAgruparCenas(opts = {}) {
    if (!VE.ready) return null;
    const plano = opts.plano || veCompCenasPlano(opts);
    if (!plano.cenas.length) { veToast(veT('Não achei cenas para agrupar')); return []; }
    if (plano.conflitos) { veToast(veT('Não dá para agrupar sem mudar a ordem das camadas')); return null; }
    if (VE.playing) veStop();
    vePushHistory();
    const tol = 2 * veFrame(), sobre = (x, y) => Math.min(veEnd(x), veEnd(y)) - Math.max(x.st, y.st) > tol;
    const feitas = [];   // { clip, membros }
    const tr0 = new Map(VE.clips.map(c => [c, c.tr]));   // ordem antiga da pilha (faixa nova não muda a ordem)
    const criadas = [];
    plano.cenas.slice().sort((x, y) => x.a - y.a).forEach(s => {
        const M = s.membros.filter(c => VE.clips.includes(c));
        if (M.length < 2) return;
        const dentro = new Set(M), st0 = Math.min(...M.map(c => c.st)), fim = Math.max(...M.map(veEnd));
        let lo = -1, hi = Infinity;
        VE.clips.forEach(x => {
            if (dentro.has(x) || veIsAudio(x)) return;
            const f = feitas.find(o => o.clip === x);
            const ys = f ? M.filter(y => f.membros.some(z => sobre(y, z))) : M.filter(y => sobre(x, y));
            if (!ys.length) return;
            // de outra cena já agrupada: vale a ordem que as camadas tinham (os membros dela guardam a trilha antiga)
            const acima = f ? ys.every(y => f.membros.filter(z => sobre(y, z)).every(z => tr0.get(y) > tr0.get(z))) : ys.every(y => y.tr > x.tr);
            if (acima) lo = Math.max(lo, x.tr); else hi = Math.min(hi, x.tr);
        });
        const livre = tr => !veTrkLocked(tr) && !VE.clips.some(o => !dentro.has(o) && o.tr === tr && veOcupaV(o) &&
            o.st < fim - VE_EPS && veEnd(o) > st0 + VE_EPS);
        let P = -1;
        for (let tr = lo + 1; tr < Math.min(hi, veTrackCount() + 1); tr++) if (livre(tr)) { P = tr; break; }
        if (P < 0) { P = lo + 1; veTrkMexer('v', P, 1); }   // sem lugar entre elas: faixa nova (a pilha não muda)
        // projeto com outras timelines montadas: o nome curto desta vai junto (as Comps de cada uma não se confundem)
        const seqNome = ((VE.sequences || []).find(q => q.id === VE.activeSequence) || {}).name || '';
        const outras = (VE.sequences || []).some(q => !q.comp && q.id !== VE.activeSequence && (q.clips || []).length);
        const nome = outras && seqNome ? `${s.nome} · ${seqNome.split(/\s+/).slice(0, 2).join(' ')}` : s.nome;
        const m = veCompDeClipes(M, nome, { tr: P, passa: true, semHistorico: true, quieto: true });
        if (!m) return;
        feitas.push({ clip: VE.clips.find(c => c.m === m.id), membros: M });
        criadas.push(m);
    });
    if (opts.compactar !== false) veTrkExcluirVazias(true, true);
    veRelayout();
    veSeqSalvarAtiva();
    veAfterEdit(VE.playhead);
    veToast(`${criadas.length} ${veT(criadas.length === 1 ? 'cena agrupada' : 'cenas agrupadas')} ${veT('em Comps (só organizam: o resultado não muda)')} · ${veT('Ctrl+Z desfaz')}`);
    return criadas;
}
