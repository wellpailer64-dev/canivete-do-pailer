// Bateria de física da timeline (testes/teste_fisica_timeline.py injeta este arquivo no app de teste).
// Monta várias trilhas (vídeo+áudio vinculados, vídeo com som junto, só imagem, música) e faz centenas de edições
// aleatórias pelas funções reais do editor: corte na agulha, corte dos selecionados, arrastar um clipe e grupos
// (com e sem Alt), aparar bordas (com o par vinculado e em grupo), apagar (com e sem ripple), Q/W, In→Out, fechar
// espaço, trancar trilha, desfazer e refazer. Depois de cada edição confere as leis da timeline.
window.FIS = (() => {
    let rnd = Math.random;
    const semente = s => { let x = s >>> 0 || 1; rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); };
    const R = (a, b) => a + rnd() * (b - a);
    const I = (a, b) => Math.floor(R(a, b + 1));
    const P = l => l[Math.floor(rnd() * l.length)];
    const EPS = 1e-6;
    let tid = 0, achados = [], ops = {}, opAtual = '';

    function achar(tipo, det) {
        achados.push({ tipo, op: opAtual, det: typeof det === 'string' ? det : JSON.stringify(det) });
    }

    function montar(fps) {
        veStop();
        window.veCacheGet = () => null; window.vePrSegEm = () => null;
        VE.fps = fps;
        VE.vinculo = true;
        [...VE_TRK.v, ...VE_TRK.a].forEach(t => { if (t) { delete t.lock; delete t.semAlvo; } });
        const base = VE.clips.find(c => !veIsAudio(c)) || VE.clips[0];
        const D = VE.srcDur, f = 1 / fps, q = x => Math.round(x * fps) / fps;
        const novo = (o) => { const c = JSON.parse(JSON.stringify(base)); delete c.uid; delete c.lk; delete c.x; delete c.tin; delete c.tout;
                              Object.assign(c, o); c._tid = ++tid; return c; };
        const out = [];
        // V1/A1: 6 clipes vinculados em sequência, fonte começando fora da grade (como câmera real)
        let t = 0;
        for (let k = 0; k < 6; k++) {
            const s = R(0, D - 4), len = q(R(1, 3.5)), lk = 'L' + tid + 'k' + k;
            out.push(novo({ tr: 0, st: t, s, e: s + len, x: 'v', lk }));
            out.push(novo({ tr: 0, st: t, s, e: s + len, x: 'a', lk }));
            t = q(t + len + (k === 2 ? q(R(0.5, 1.5)) : 0));
        }
        // V2: vídeo com som junto, escalonado (entra uns quadros depois dos de baixo), um deles até o fim da mídia
        t = q(0.4);
        for (let k = 0; k < 4; k++) {
            const fim = k === 2, len = q(R(1.5, 3)), s = fim ? D - len - R(0, f * 0.7) : R(0, D - 4);
            out.push(novo({ tr: 1, st: t, s, e: fim ? D : s + len }));
            t = Math.ceil(veEnd(out[out.length - 1]) * fps - 1e-9) / fps + q(R(0, 1));
        }
        // V3: só imagem (vídeo sem o som, como a camada de ajuste/overlay); A3: música (só o som) longa
        out.push(novo({ tr: 2, st: 0, s: 0, e: q(Math.min(D, 12)), x: 'v' }));
        out.push(novo({ tr: 2, st: q(0.2), s: 1.111, e: 1.111 + q(Math.min(D - 2, 14)), x: 'a' }));
        VE.clips = out;
        veEnsureTrackIndex(3);
        VE.history = []; VE.future = [];
        VE.sel = -1; VE.selx = null; VE.gapSel = null;
        VE.inPt = VE.outPt = null;
        veRelayout(); veRefresh(); veBuildHeads();
        return VE.clips.length;
    }

    // ── as leis ──
    const linhas = () => {
        const m = new Map();
        VE.clips.forEach(c => ['v', 'a'].forEach(l => {
            if (l === 'v' ? !veOcupaV(c) : !veOcupaA(c)) return;
            const k = c.tr + l; if (!m.has(k)) m.set(k, []); m.get(k).push(c);
        }));
        m.forEach(l => l.sort((a, b) => a.st - b.st));
        return m;
    };
    const fmt = c => `${c._tid}${c.x || ''}@tr${c.tr} ${c.st.toFixed(5)}–${veEnd(c).toFixed(5)}`;

    let iguais0 = new Set(), opMove = false;
    const pontasIguais = l => l.every(b => Math.abs(l[0].st - b.st) <= EPS && Math.abs(veEnd(l[0]) - veEnd(b)) <= EPS);
    const gruposLk = () => { const g = new Map(); VE.clips.forEach(c => { if (c.lk) { if (!g.has(c.lk)) g.set(c.lk, []); g.get(c.lk).push(c); } }); return g; };
    // par identificado pelos clipes de origem (os pedaços de um corte herdam): desigual antes = desigual de propósito
    const chavePar = l => [...new Set(l.map(c => c._tid))].sort((a, b) => a - b).join('|');
    let vaos0 = new Set();
    function vaosAgora() {
        const r = new Set(), f = veFrame();
        linhas().forEach(l => { for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], v = b.st - veEnd(a); if (v < -EPS || (v > EPS && v < f * 0.5)) r.add(a._tid + (a.x || '') + '|' + b._tid + (b.x || '') + '|' + (b.st - veEnd(a)).toFixed(5)); } });
        return r;
    }
    // clipe arrastado mais curto que o vão: encostou certinho de um lado, do outro não tem como (geometria, não defeito)
    function naoCabe(l, i) {
        if (!opMove) return false;
        // o vão é o lugar de onde um clipe arrastado saiu (tirar um clipe do meio deixa o buraco dele: é o pedido)
        const v0 = veEnd(l[i - 1]), v1 = l[i].st;
        if (saidas.some(s => s.tr === l[i].tr && s.st <= v0 + EPS && s.en >= v1 - EPS)) return true;
        const sel = new Set(veSelLista()), a = l[i - 1], b = l[i];
        // grupo com espaçamento interno fora da grade: se alguma camada dele já encostou certinho numa parada, o encosto
        // fica travado (andar abriria fresta ali) — é a geometria do grupo
        if ((sel.has(a) || sel.has(b)) && VE.clips.some(o => !sel.has(o) && [...sel].some(m => m.tr === o.tr && veConflita(m, o) && (Math.abs(veEnd(o) - m.st) <= EPS || Math.abs(o.st - veEnd(m)) <= EPS)))) return true;
        return (sel.has(a) && i >= 2 && Math.abs(veEnd(l[i - 2]) - a.st) <= EPS) || (sel.has(b) && i + 1 < l.length && Math.abs(l[i + 1].st - veEnd(b)) <= EPS);
    }
    function leis() {
        const f = veFrame();
        VE.clips.forEach(c => {
            if (![c.st, c.s, c.e].every(Number.isFinite)) achar('número inválido', fmt(c));
            if (c.st < -EPS) achar('clipe antes do zero', fmt(c));
            if (veLen(c) < 1e-3 - 1e-6) achar('clipe com menos de 1 ms', fmt(c) + ` len=${veLen(c).toFixed(5)}`);
            if (c.s < -1e-4) achar('fonte antes do começo da mídia', fmt(c) + ` s=${c.s}`);
            if (c.e > veDurMidia(c) + 1e-4) achar('fonte depois do fim da mídia', fmt(c) + ` e=${c.e} dur=${veDurMidia(c)}`);
        });
        linhas().forEach((l, k) => {
            for (let i = 1; i < l.length; i++) {
                const a = l[i - 1], b = l[i], vao = b.st - veEnd(a);
                const sig = a._tid + (a.x || '') + '|' + b._tid + (b.x || '') + '|' + (b.st - veEnd(a)).toFixed(5);
                if ((vao < -EPS || (vao > EPS && vao < f * 0.5)) && vaos0.has(sig)) continue;   // já estava antes desta edição
                if (vao < -EPS) achar('sobreposição na mesma trilha', `${k}: ${fmt(a)} × ${fmt(b)} (${(-vao * 1000).toFixed(3)} ms)`);
                else if (vao > EPS && vao < f * 0.5 && !bateuNoZero && !naoCabe(l, i)) achar('fresta menor que meio quadro', `${k}: ${fmt(a)} | ${fmt(b)} (${(vao * 1000).toFixed(3)} ms)`);
            }
        });
        if (VE.vinculo) {
            const g = new Map();
            VE.clips.forEach(c => { if (c.lk) { if (!g.has(c.lk)) g.set(c.lk, []); g.get(c.lk).push(c); } });
            g.forEach(l => {
                if (l.length < 2) return;
                const [a] = l;
                l.slice(1).forEach(b => {
                    // sobrescrever só a imagem (ou só o som) deixa o par com pontas diferentes de propósito; as outras
                    // edições não podem desigualar um par que estava igual (nem criar par desigual)
                    if (!opMove && !(iguais0.desig && iguais0.desig.has(chavePar(l))) && (Math.abs(a.st - b.st) > EPS || Math.abs(veEnd(a) - veEnd(b)) > EPS))
                        achar('par vinculado com pontas diferentes', `${fmt(a)} / ${fmt(b)}`);
                    if (Math.abs((a.st - a.s / veVel(a)) - (b.st - b.s / veVel(b))) > EPS)
                        achar('par vinculado fora de sincronia', `${fmt(a)} s=${a.s.toFixed(5)} / ${fmt(b)} s=${b.s.toFixed(5)}`);
                });
            });
        }
    }

    // sincronia de cada pedaço: em que instante da timeline fica o 0 da fonte (muda só se o clipe andou)
    const zero = c => c.st - c.s / veVel(c);
    const mapa = () => VE.clips.map(c => ({ c, tid: c._tid, x: c.x || '', tr: c.tr, z: zero(c), st: c.st, en: veEnd(c) }));

    // ── as edições ──
    const tAleat = () => R(0, Math.max(1, VE.dur));
    const livres = () => VE.clips.filter(c => !veLocked(c));
    const vinc = c => veVinculados(c);

    const E = {
        corteTudo() {
            const t = veSnapFrame(tAleat());
            const antes = VE.clips.filter(c => !veLocked(c) && t - c.st >= veFrame() * 0.99 && veEnd(c) - t >= veFrame() * 0.99).map(c => c._tid + (c.x || ''));
            VE.playhead = t; veSplitAtPlayhead(true);
            antes.forEach(id => {
                const pe = VE.clips.filter(c => c._tid + (c.x || '') === id);
                if (!pe.some(c => Math.abs(veEnd(c) - t) < EPS) || !pe.some(c => Math.abs(c.st - t) < EPS))
                    achar('corte não ficou reto', `clipe ${id} em ${t.toFixed(5)}: ` + pe.map(fmt).join(', '));
            });
        },
        corteSelecionado() {
            const c = P(livres()); if (!c) return;
            const t = veSnapFrame(R(c.st, veEnd(c)));
            veSelDefinir(vinc(c), c); VE.playhead = t; veCortarSelecionados();
        },
        moverClipe() {
            const c = P(livres()); if (!c) return;
            const grupo = vinc(c);
            const z0 = grupo.map(zero);
            anotarSaida(grupo);
            const st = veSnapFrame(Math.max(0, c.st + R(-3, 3)));
            if (grupo.length > 1) { veSelDefinir(grupo, c); veMoverGrupo(grupo, st - c.st, 0, false); }
            else veMoveClip(VE.clips.indexOf(c), c.tr, st);
            const novos = grupo.length > 1 ? veSelLista() : [VE.clips[VE.sel]];
            if (novos.length !== grupo.length || !novos.every(Boolean)) return;
            const dz = new Set(novos.map((o, k) => (zero(o) - z0[k]).toFixed(6)));
            if (dz.size > 1) achar('grupo andou medidas diferentes', [...dz].join(' / '));
        },
        moverSelecao() {
            // vários clipes (2 a 5, várias trilhas) andando juntos, às vezes trocando de trilha, às vezes com Alt (cópia)
            const base = livres(); if (base.length < 2) return;
            let lista = [...new Set(Array.from({ length: I(2, 5) }, () => P(base)).flatMap(vinc))];
            const ref = lista[0], dt = R(-2.5, 2.5), dtr = rnd() < 0.2 ? P([-1, 1]) : 0, alt = rnd() < 0.2;
            const rel0 = lista.map(c => c.st - ref.st);
            anotarSaida(lista);
            veSelDefinir(lista, ref);
            // o grupo que bate no tempo zero para ali: não dá para encostar numa vizinha (fresta aceita nesse caso)
            bateuNoZero = dt < -Math.min(...lista.map(c => c.st)) + veFrame();
            veMoverGrupo(lista, dt, dtr, alt);
            const novos = veSelLista();
            ultimoGrupo = `dt=${dt.toFixed(4)} dtr=${dtr} alt=${alt} :: ` + novos.map(fmt).join(' ; ');
            if (novos.length === lista.length && !dtr) {
                const r = novos.map(c => c.st - novos[0].st);
                if (r.some((x, k) => Math.abs(x - rel0[k]) > EPS))
                    achar('grupo perdeu o espaçamento entre as camadas', rel0.map(x => x.toFixed(5)).join(',') + ' → ' + r.map(x => x.toFixed(5)).join(','));
            }
        },
        aparar() {
            const c = P(livres()); if (!c) return;
            const side = P(['l', 'r']), ed = side === 'l' ? c.st : veEnd(c);
            const grupoSel = rnd() < 0.25;
            let parte = vinc(c);
            if (grupoSel) parte = [...new Set(parte.concat(...Array.from({ length: I(1, 3) }, () => vinc(P(livres())))))];
            const par = parte.filter(o => o !== c && !veLocked(o) && (grupoSel || Math.abs((side === 'l' ? o.st : veEnd(o)) - ed) < 1e-4))
                .map(o => ({ i: VE.clips.indexOf(o), side, c0: { ...o } }));
            const d = { mode: 'trim', i: VE.clips.indexOf(c), side, c0: { ...c }, par, started: true };
            vePushHistory();
            // o mouse passa por vários pontos antes de soltar (às vezes muito além do limite)
            const alvo = ed + R(-4, 4);
            for (let k = 1; k <= 4; k++) veAparoArrastar(d, ed + (alvo - ed) * k / 4);
            const ponta = o => (side === 'l' ? o.st : veEnd(o));
            const mexeu = [d, ...par].map(q => ponta(VE.clips[q.i]) - ponta(q.c0));
            if (mexeu.some(x => Math.abs(x - mexeu[0]) > EPS)) achar('aparo em grupo andou medidas diferentes', mexeu.map(x => x.toFixed(5)).join(' / '));
            veRelayout(); veAfterEdit(VE.playhead);
        },
        apagar() {
            const c = P(livres()); if (!c) return;
            const ripple = rnd() < 0.5;
            VE.sel = VE.clips.indexOf(c); VE.selx = null;
            if (VE.vinculo && vinc(c).length > 1) { veSelDefinir(vinc(c), c); veDeleteSelected(ripple); }
            else veDeleteClip(VE.sel, ripple);
        },
        rippleQW() {
            VE.playhead = veSnapFrame(tAleat());
            const m0 = mapa(), t = VE.playhead, w = rnd() < 0.5;
            const pts = veEditPoints(undefined, true);
            let a = w ? t : [...pts].reverse().find(x => x < t - veFrame() * 0.5), b = w ? pts.find(x => x > t + veFrame() * 0.5) : t;
            if (!w && veClipesDireitaDoCorte(t).length) { a = t; b = t + veFrame(); }   // Q no corte: apara 1 quadro
            const h0 = VE.history.length;
            if (w) veRippleTrimEnd(); else veRippleTrimStart();
            if (a == null || b == null || VE.history.length === h0) return;
            conferirRipple(m0, a, b);
        },
        extrair() {
            const a = veSnapFrame(tAleat()), b = veSnapFrame(a + R(0.1, 3));
            const m0 = mapa();
            VE.inPt = a; VE.outPt = b; veExtractInOut();
            conferirRipple(m0, veSnapFrame(a), veSnapFrame(b));
            VE.inPt = VE.outPt = null;
        },
        fecharEspaco() {
            const rows = veTrackRows().filter(r => r.kind === 'v' || r.kind === 'a');
            for (let k = 0; k < 10; k++) {
                const row = P(rows), g = veGapAt(tAleat(), row);
                if (!g) continue;
                VE.gapSel = g; VE.sel = -1;
                const m0 = mapa();
                veDeleteSelected(false);
                // quem andou, andou a mesma medida; e nada que estava antes do espaço mexeu
                const ds = new Set();
                VE.clips.forEach(c => {
                    const o = m0.find(m => m.c === c); if (!o) return;
                    const d = c.st - o.st;
                    if (Math.abs(d) > EPS) { ds.add(d.toFixed(6)); if (o.st < g.a - EPS) achar('fechar espaço mexeu clipe de antes do espaço', fmt(c)); }
                });
                if (ds.size > 1) achar('fechar espaço puxou trilhas medidas diferentes', [...ds].join(' / '));
                return;
            }
        },
        trancar() {
            const tr = I(0, 2), t = P([VE_TRK.v[tr], VE_TRK.a[tr]].filter(Boolean));
            if (!t) return;
            if (t.lock) delete t.lock; else if (rnd() < 0.4) t.lock = true;
            veBuildHeads();
        },
        alvo() {
            const tr = I(0, 2), t = P([VE_TRK.v[tr], VE_TRK.a[tr]].filter(Boolean));
            if (t) { if (t.semAlvo) delete t.semAlvo; else if (rnd() < 0.3) t.semAlvo = true; }
            VE.playhead = veSnapFrame(tAleat()); veSplitAtPlayhead();
        },
        passoQuadro() {
            // Alt+← / Alt+→ (1 ou 5 quadros) com a seleção
            const c = P(livres()); if (!c) return;
            veSelDefinir(vinc(c), c);
            anotarSaida(vinc(c));
            veMoverSelecao(P([-1, 1]) * veFrame() * P([1, 5]), 0);
        },
    };

    function conferirRipple(m0, a, b) {
        const d = b - a;
        if (!(d > veFrame() * 0.5)) return;
        // tudo o que começava depois do trecho tirado (trilha destrancada) volta exatamente d; trancada não mexe
        m0.forEach(o => {
            if (o.st < b - EPS) return;
            const agora = VE.clips.find(c => c === o.c) || VE.clips.find(c => c._tid === o.tid && (c.x || '') === o.x && Math.abs(zero(c) - o.z) < 1e-4 + d + 1);
            if (!agora) return;
            const esperado = veTrkLocked(o.tr) ? o.st : o.st - d;
            if (Math.abs(agora.st - esperado) > EPS && VE.clips.includes(o.c))
                achar('ripple puxou errado (descompasso entre trilhas)', `${fmt(agora)} esperado ${esperado.toFixed(5)}`);
        });
    }

    let rastro = null, ultimoGrupo = '', bateuNoZero = false, saidas = [];
    const anotarSaida = l => { saidas = l.map(c => ({ tr: c.tr, st: c.st, en: veEnd(c) })); };
    function rodar(seed, n, fps, rastrear) {
        rastro = rastrear ? [] : null;
        semente(seed);
        achados = []; ops = {}; tid = 0;
        VE_TRK.v.length = Math.min(VE_TRK.v.length, 4); VE_TRK.a.length = Math.min(VE_TRK.a.length, 4);
        veRebuildTracks(veTrackCount()); veBuildHeads();
        montar(fps);
        leis();
        if (achados.length) achados.forEach(a => (a.op = 'montagem'));
        const pesos = { corteTudo: 10, corteSelecionado: 5, moverClipe: 10, moverSelecao: 8, aparar: 12, apagar: 6, rippleQW: 6,
                        extrair: 4, fecharEspaco: 6, trancar: 3, alvo: 3, passoQuadro: 5, desfazer: 10 };
        const nomes = Object.keys(pesos), tot = nomes.reduce((s, k) => s + pesos[k], 0);
        for (let i = 0; i < n; i++) {
            let r = rnd() * tot, nome = nomes[0];
            for (const k of nomes) { if ((r -= pesos[k]) < 0) { nome = k; break; } }
            if (VE.clips.length < 8) montar(fps);   // a timeline esvaziou de tanto apagar: monta outra e segue
            opAtual = `#${i} ${nome}`;
            ops[nome] = (ops[nome] || 0) + 1;
            const n0 = achados.length;
            saidas = [];
            bateuNoZero = nome === 'apagar';   // apagar sem ripple deixa o espaço de propósito (é o pedido)
            vaos0 = vaosAgora();
            opMove = ['moverClipe', 'moverSelecao', 'passoQuadro', 'desfazer'].includes(nome);
            iguais0 = new Set(); const desig = new Set(); gruposLk().forEach(l => { if (!pontasIguais(l)) desig.add(chavePar(l)); }); iguais0.desig = desig;
            try {
                if (nome === 'desfazer') {
                    // desfaz 1 a 3 e refaz: cada estado tem que voltar idêntico
                    const k = Math.min(I(1, 3), VE.history.length), est = [veSnapshot()];
                    for (let j = 0; j < k; j++) { veUndo(); est.push(veSnapshot()); }
                    for (let j = k - 1; j >= 0; j--) {
                        veRedo();
                        if (JSON.stringify(JSON.parse(veSnapshot()).clips) !== JSON.stringify(JSON.parse(est[j]).clips)) { achar('refazer não voltou ao mesmo estado', `passo ${j}`); break; }
                    }
                } else {
                    const antes = veSnapshot(), h0 = VE.history.length;
                    E[nome]();
                    // toda edição: desfazer volta exatamente ao antes, refazer volta exatamente ao depois
                    if (VE.history.length > h0 && rnd() < 0.3) {
                        const depois = veSnapshot();
                        veUndo();
                        if (JSON.stringify(JSON.parse(veSnapshot()).clips) !== JSON.stringify(JSON.parse(antes).clips)) achar('desfazer não voltou ao estado de antes', '');
                        veRedo();
                        if (JSON.stringify(JSON.parse(veSnapshot()).clips) !== JSON.stringify(JSON.parse(depois).clips)) achar('refazer não voltou ao estado de depois', '');
                    }
                }
            } catch (e) { achar('erro de JavaScript', String(e && e.stack || e).slice(0, 400)); }
            leis();
            if (rastro) rastro.push(opAtual + ' :: ' + VE.clips.filter(c => c.tr === rastrear.tr).map(fmt).join(' ; '));
            if (rastrear && achados.length > n0) break;
            if (achados.length > n0 + 40) break;
            if (achados.length > 300) break;
        }
        return { achados, ops, clipes: VE.clips.length, rastro: rastro && rastro.slice(-12).concat(['grupo: ' + ultimoGrupo]) };
    }

    // O caso do print do Pailer (2026-10-22): corte reto em todas as trilhas, a parte da esquerda apagada, e o C0712
    // (V4, com crossfade) entra 0,4 s depois dos outros. Clicar no espaço da trilha dele e apertar Delete tem que
    // fechar até onde todas estão vazias (antes: "Não dá para fechar o espaço").
    function cenarioPailer() {
        montar(30);
        const base = VE.clips[0], f = (o) => Object.assign(JSON.parse(JSON.stringify(base)), { lk: undefined, x: 'v', tin: undefined }, o);
        VE.clips = [
            f({ tr: 0, st: 0, s: 0, e: 1 }), f({ tr: 0, st: 2, s: 2, e: 10 }),                 // V1: antes e depois do espaço
            f({ tr: 1, st: 2, s: 3, e: 11 }), f({ tr: 2, st: 2, s: 4, e: 7.6 }),               // V2, V3 começam no corte
            f({ tr: 3, st: 2.4, s: 5, e: 10 }),                                                // V4 (C0712) entra 0,4 s depois
            f({ tr: 0, st: 2, s: 1, e: 19, x: 'a' }),                                          // música
        ];
        VE.clips.forEach((c, k) => { delete c.lk; delete c.tin; c._tid = 900 + k; });
        veEnsureTrackIndex(3); veRelayout(); VE.history = [];
        const row = veTrackRows().find(r => r.kind === 'v' && veTrackIndex(r) === 3);
        VE.gapSel = veGapAt(1.5, row); VE.sel = -1;
        const g = VE.gapSel && { ...VE.gapSel };
        veDeleteSelected(false);
        const st = id => VE.clips.find(c => c._tid === id).st;
        return { gap: g, v1a: st(900), v1b: st(901), v2: st(902), v3: st(903), v4: st(904), mus: st(905) };
    }

    return { rodar, montar, leis, E, cenarioPailer, get achados() { return achados; } };
})();
