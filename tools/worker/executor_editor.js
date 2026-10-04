// Executor do Canivete Worker no Editor Kanivete (window.VEW): as ferramentas reais sobre VE.clips. Clipe = "trilha@tempo"
// ("V2@12.4" = o clipe da trilha de vídeo 2 que passa por 12,4 s; "A1@3" = áudio; "T@5" = texto/gráfico em qualquer
// trilha). Referência por tempo não envelhece depois de cortar/apagar (índice envelheceria). Erros ensinam (listam o
// que existe naquela trilha). Toda operação passa por vePushHistory (Ctrl+Z desfaz) e pelo aviso roxo do agente.
(() => {
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const r2 = n => Math.round(n * 100) / 100;
    const nomeMidia = c => { const m = veMediaOf(c); return veIsTexto(c) ? 'texto: ' + veNomeTexto(c).slice(0, 30) : (m && (m.nome || m.name)) || veNomeClipe(c); };
    const tipo = c => veIsAudio(c) ? 'audio' : veIsTexto(c) ? 'texto' : veIsAdj(c) ? 'ajuste' : veIsImage(c) ? 'imagem' : 'video';
    const trilha = c => (veIsAudio(c) ? 'A' : 'V') + (c.tr + 1);
    const ref = c => `${trilha(c)}@${r2(c.st)}`;
    const resumo = c => ({ clipe: ref(c), midia: nomeMidia(c), tipo: tipo(c), inicio: r2(c.st), fim: r2(veEnd(c)),
        ...(c.g ? { ganho: c.g } : {}), ...(c.v && c.v !== 1 ? { velocidade: c.v } : {}),
        ...(c.fx && c.fx.length ? { efeitos: c.fx.map(f => f.t) } : {}), ...(c.tin ? { entrada: c.tin.t } : {}), ...(c.tout ? { saida: c.tout.t } : {}) });
    const daTrilha = (k, n) => VE.clips.filter(c => k === 'T' ? (veIsTexto(c) || (typeof veEhGrafico === 'function' && veEhGrafico(c)))
        : (k === 'A' ? veIsAudio(c) || (!veIsImage(c) && c.x !== 'v') : !veIsAudio(c)) && c.tr + 1 === n);
    const acha = s => {
        const m = /^\s*([VAT])\s*(\d*)\s*@\s*(-?[\d.,]+)/i.exec(String(s || ''));
        if (!m) throw new Error(`clipe "${s}" inválido: use trilha@tempo, ex. V1@3.5, A2@10, T@5 (veja listar_clipes)`);
        const k = m[1].toUpperCase(), n = +(m[2] || 1), t = +m[3].replace(',', '.');
        const lista = daTrilha(k, n);
        const c = lista.find(c => t >= c.st - 0.05 && t < veEnd(c) - 0.001) || lista.find(c => Math.abs(c.st - t) < 0.3);
        if (!c) throw new Error(`nada em ${k}${k === 'T' ? '' : n} no tempo ${t}; clipes lá: ${lista.slice(0, 12).map(ref).join(', ') || 'nenhum'}`);
        return c;
    };
    const editar = (desc, fn) => { vePushHistory(); const r = fn(); veRelayout(); veAfterEdit(VE.playhead); return r; };
    const timelineAtiva = () => (VE.sequences || []).find(s => s.id === VE.activeSequence);
    const somKey = busca => {
        const d = VESB.dados, q = norm(busca);
        if (!d || !d.instalado) throw new Error('pack de sons não instalado (peça ao usuário: Baixar sons no painel Soundboard)');
        let melhor = null;
        d.categorias.forEach((cat, ci) => cat.sons.forEach((s, si) => {
            const alvo = norm(`${cat.id} ${cat.nome} ${s.nome} ${s.orig}`);
            const pts = q.split(/\s+/).filter(w => alvo.includes(w)).length;
            if (pts && (!melhor || pts > melhor[0])) melhor = [pts, `${ci}:${si}`, s.nome];
        }));
        if (!melhor) throw new Error(`nenhum som com "${busca}"; categorias: ${d.categorias.map(c => c.id).join(', ')}`);
        return melhor;
    };
    const f = {
        listar_timelines: () => (VE.sequences || []).map(s => ({ nome: s.name, ativa: s.id === VE.activeSequence, duracao: r2(veSeqDur(s)) })),
        abrir_timeline: a => {
            const s = (VE.sequences || []).find(s => norm(s.name) === norm(a.nome));
            if (!s) throw new Error(`timeline "${a.nome}" não existe; há: ${(VE.sequences || []).map(s => s.name).join(', ')}`);
            veOpenTimeline(s.id); return { ativa: s.name, clipes: VE.clips.length };
        },
        duplicar_timeline: a => {
            const atual = timelineAtiva();
            const s = veCreateTimeline({ cloneId: atual && atual.id, name: a.nome }); if (!s) throw new Error('não deu para duplicar');
            return { ativa: s.name };
        },
        listar_clipes: a => {
            let ls = VE.clips;
            if (a && a.trilha) { const m = /^([VAT])(\d*)$/i.exec(a.trilha.trim()); if (m) ls = daTrilha(m[1].toUpperCase(), +(m[2] || 1)); }
            return ls.slice(0, 40).map(resumo);
        },
        info_clipe: a => { const c = acha(a.clipe); return { ...resumo(c), fonte: [r2(c.s), r2(c.e)], props: veStaticProps(c), ...(veIsTexto(c) ? { texto: veTxt(c).t } : {}) }; },
        cortar: a => {
            const t = +a.tempo, c = a.clipe ? acha(a.clipe) : null;
            if (!veSplitAt(t, true, c ? [c] : undefined)) throw new Error(`nenhum clipe para cortar em ${t} s (fora de clipe ou já há corte aí)`);
            return { cortado_em: t };
        },
        apagar_clipe: a => {
            const c = acha(a.clipe), i = VE.clips.indexOf(c);
            veDeleteClip(i, !!a.fechar_espaco); return { apagado: ref(c), clipes: VE.clips.length };
        },
        mover_clipe: a => {
            const c = acha(a.clipe);
            return editar('mover clipe', () => {
                if (a.inicio != null) c.st = Math.max(0, veSnapFrame(+a.inicio));
                if (a.trilha) { const m = /(\d+)/.exec(a.trilha); if (m) c.tr = Math.max(0, +m[1] - 1); }
                return resumo(c);
            });
        },
        aparar: a => {
            const c = acha(a.clipe), vel = c.v || 1;
            return editar('aparar clipe', () => {
                if (a.inicio != null) { const d = +a.inicio - c.st; c.s = Math.max(0, c.s + d * vel); c.st = +a.inicio; }
                if (a.fim != null) { const e = c.s + (+a.fim - c.st) * vel; if (e <= c.s) throw new Error('fim antes do início'); c.e = e; }
                return resumo(c);
            });
        },
        ganho: a => { const c = acha(a.clipe); return editar('ganho', () => { c.g = +a.db; return { clipe: ref(c), ganho: c.g }; }); },
        velocidade: a => {
            const c = acha(a.clipe); if (!(+a.fator > 0)) throw new Error('fator > 0 (1 = normal, 2 = dobro)');
            return editar('velocidade', () => { c.v = +a.fator; return resumo(c); });
        },
        transicao: a => {
            if (!VE_TR[a.tipo]) throw new Error(`transição "${a.tipo}" não existe; use: ${Object.keys(VE_TR).filter(k => VE_TR[k].fn).join(', ')}`);
            const c = acha(a.clipe);
            return editar('transição', () => {
                const tr = veTrObj(a.tipo); if (a.duracao) tr.d = +a.duracao; if (a.direcao) tr.dir = a.direcao;
                if (a.lado !== 'saida') c.tin = { ...tr };
                if (a.lado === 'saida' || a.lado === 'ambas') c.tout = { ...tr };
                return resumo(c);
            });
        },
        tirar_transicao: a => { const c = acha(a.clipe); return editar('tirar transição', () => { delete c.tin; delete c.tout; return resumo(c); }); },
        sobreposicao: a => {
            if (!VE_OVT[a.tipo]) throw new Error(`sobreposição "${a.tipo}" não existe; use: ${Object.keys(VE_OVT).join(', ')}`);
            const r = veOvtAdd(a.tipo, +a.tempo, a.duracao ? { d: +a.duracao } : {});
            if (!r) throw new Error('não entrou (precisa de vídeo no tempo)'); return { sobreposicao: a.tipo, tempo: +a.tempo };
        },
        efeito: a => {
            const k = Object.keys(VE_FX).find(k => norm(k) === norm(a.tipo) || norm(VE_FX[k].nome) === norm(a.tipo));
            if (!k) throw new Error(`efeito "${a.tipo}" não existe; use: ${Object.keys(VE_FX).slice(0, 40).join(', ')}`);
            const c = acha(a.clipe); VE.sel = VE.clips.indexOf(c); veFxAdd(VE.sel, k);
            if (a.valores && c.fx) { const fx = c.fx.filter(x => x.t === k).pop(); if (fx) Object.assign(fx.v, a.valores); }
            veAfterEdit(VE.playhead); return resumo(c);
        },
        tirar_efeito: a => {
            const c = acha(a.clipe);
            return editar('tirar efeito', () => { const n = (c.fx || []).length; c.fx = (c.fx || []).filter(x => norm(x.t) !== norm(a.tipo)); if (c.fx.length === n) throw new Error(`o clipe não tem "${a.tipo}"; tem: ${n ? (c.fx || []).map(x => x.t).join(', ') : 'nenhum'}`); return resumo(c); });
        },
        transformar: a => {
            const c = acha(a.clipe);
            return editar('transformar', () => {
                const p = { ...veStaticProps(c) };
                for (const [k, pk] of [['escala', 'sc'], ['x', 'x'], ['y', 'y'], ['rotacao', 'rot'], ['opacidade', 'op']]) if (a[k] != null) p[pk] = +a[k];
                c.p = p; return { clipe: ref(c), escala: p.sc, x: p.x, y: p.y, rotacao: p.rot, opacidade: p.op };
            });
        },
        alterar_texto: a => {
            const c = acha(a.clipe); if (!veIsTexto(c)) throw new Error(`${ref(c)} não é texto; textos: ${daTrilha('T').map(ref).join(', ')}`);
            return editar('texto', () => { c.tx = { ...veTxt(c), t: String(a.texto) }; return { clipe: ref(c), texto: c.tx.t }; });
        },
        estilo_texto: a => {
            const c = acha(a.clipe); if (!veIsTexto(c)) throw new Error(`${ref(c)} não é texto`);
            return editar('estilo do texto', () => {
                const tx = { ...veTxt(c) };
                if (a.cor) tx.cor = a.cor; if (a.tamanho) tx.tam = +a.tamanho; if (a.fonte) tx.fam = a.fonte;
                c.tx = tx; return { clipe: ref(c), cor: tx.cor, tamanho: tx.tam, fonte: tx.fam };
            });
        },
        trocar_na_legenda: a => {
            const de = new RegExp(`\\b${String(a.de).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            let n = 0;
            vePushHistory();
            (VE.legendas || []).forEach(l => { const novo = l.texto.replace(de, () => (n++, a.para)); l.texto = novo; });
            if (!n) throw new Error(`"${a.de}" não aparece nas legendas`);
            veAfterEdit(VE.playhead); return { trocas: n };
        },
        efeito_sonoro: async a => {
            if (!VESB.dados) { veSbCarregar(); for (let i = 0; i < 40 && !VESB.dados; i++) await new Promise(r => setTimeout(r, 100)); }
            const [, k, nome] = somKey(a.busca);
            VE.playhead = Math.max(0, +a.tempo);
            const n = VE.clips.length; await veSbInserir(k);
            const c = VE.clips[VE.sel];
            if (VE.clips.length === n || !c) throw new Error('o som não entrou');
            const t = Math.max(0, veSnapFrame(+a.tempo));   // o import do pack (1ª vez) mexe na agulha: crava no tempo pedido
            if (Math.abs(c.st - t) > 0.02 && !VE.clips.some(o => o !== c && o.tr === c.tr && veIsAudio(o) && o.st < t + veLen(c) && veEnd(o) > t)) { c.st = t; veRelayout(); }
            if (a.ganho != null) { c.g = +a.ganho; veAfterEdit(VE.playhead); }
            return { som: nome, ...resumo(c) };
        },
        exportar: async (a, ctx) => {
            if (!ctx.pasta) throw new Error('o contrato não tem pasta_exportacao');
            window.__vewFim = null;
            if (!window.__vewHook) {
                const orig = window.veOnExport;
                window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} } if (e && e.done) window.__vewFim = e; try { orig(ev); } catch (x) {} };
                window.__vewHook = true;
            }
            if (typeof veCompProntas === 'function') await veCompProntas(() => {});
            if (typeof veOvtProntas === 'function') await veOvtProntas(null);
            VE._txPng = null;
            if (VE.clips.some(c => veIsTexto(c) || veEhGrafico(c))) await veTxPngs();
            const plano = veExportPlan(true), lim = veMasterLim();
            await window.pywebview.api.video_cutter_export(VE.path, plano.base, 'mp4', a.qualidade || 'medium', 'original', false, ctx.pasta, false,
                plano.camadas, plano.audio, plano.dur, lim ? [...plano.mix, { master: lim }] : plano.mix, veTxExport(plano.faixa),
                [VE.seqW, VE.seqH], { nome: a.nome || (timelineAtiva() || {}).name || 'video' });
            for (let i = 0; i < 3600 && !window.__vewFim; i++) await new Promise(r => setTimeout(r, 500));
            const e = window.__vewFim || {};
            if (!e.success) throw new Error('exportação falhou: ' + (e.error || 'sem resposta'));
            window.__vewExportado = true; return { exportado: true };
        },
    };
    // condições do contrato (o worker.py confere antes de aceitar "FEITO")
    const conferir = conds => conds.map(cond => {
        const [k, resto = ''] = String(cond).split(/:(.*)/s), [alvo, val = ''] = resto.split(/=(.*)/s);
        let ok = false, visto;
        try {
            if (k === 'exportado') ok = !!window.__vewExportado;
            else if (k === 'timeline') ok = norm((timelineAtiva() || {}).name) === norm(alvo);
            else if (k === 'clipes') { visto = VE.clips.filter(c => !veIsAudio(c) || c.x === 'a').length; ok = visto === +alvo; }
            else if (k === 'sem_clipe') { try { acha(alvo); } catch (e) { ok = true; } }
            else if (k === 'legenda_contem') ok = (VE.legendas || []).some(l => norm(l.texto).includes(norm(alvo)));
            else if (k === 'legenda_sem') ok = !(VE.legendas || []).some(l => norm(l.texto).includes(norm(alvo)));
            else if (k === 'som_em') ok = VE.clips.some(c => veIsAudio(c) && (veMediaOf(c) || {}).pasta === ((VE.bins || []).find(b => b.nome === 'Soundboard') || {}).id && Math.abs(c.st - +alvo) < 0.6);
            else if (k === 'sobreposicao') ok = VE.clips.some(c => veIsAdj(c) && Math.abs(c.st + veLen(c) / 2 - +alvo) < 0.3);
            else {
                const c = acha(alvo);
                if (k === 'ganho') { visto = c.g || 0; ok = Math.abs(visto - +val) < 0.2; }
                else if (k === 'velocidade') { visto = c.v || 1; ok = Math.abs(visto - +val) < 0.01; }
                else if (k === 'transicao') { visto = [c.tin && c.tin.t, c.tout && c.tout.t]; ok = visto.includes(val); }
                else if (k === 'efeito') { visto = (c.fx || []).map(x => x.t); ok = visto.some(t => norm(t) === norm(val)); }
                else if (k === 'texto') { visto = veTxt(c).t; ok = norm(visto) === norm(val); }
                else if (k === 'cor') { visto = veTxt(c).cor; ok = norm(visto) === norm(val); }
                else if (k === 'escala') { visto = veStaticProps(c).sc; ok = Math.abs(visto - +val) < 0.5; }
                else if (k === 'opacidade') { visto = veStaticProps(c).op; ok = Math.abs(visto - +val) < 0.5; }
                else if (k === 'inicio') { visto = r2(c.st); ok = Math.abs(c.st - +val) < 0.05; }
                else if (k === 'fim') { visto = r2(veEnd(c)); ok = Math.abs(veEnd(c) - +val) < 0.05; }
                else if (k === 'existe') ok = true;
                else visto = 'condição desconhecida';
            }
        } catch (e) { visto = e.message; }
        return { condicao: cond, ok, ...(ok || visto === undefined ? {} : { visto: String(JSON.stringify(visto)).slice(0, 120) }) };
    });
    window.VEW = { f, conferir, refs: () => VE.clips.map(ref), exec: async (n, a, ctx) => {
        if (!f[n]) throw new Error(`ferramenta ${n} não existe`);
        return veAgente ? await veAgente('Worker: ' + n, () => f[n](a || {}, ctx || {})) : await f[n](a || {}, ctx || {});
    } };
})();
