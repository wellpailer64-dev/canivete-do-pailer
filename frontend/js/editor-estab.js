// =========================================================
// Vídeo Kanivete — Estabilizador (o Warp Stabilizer do Premiere): efeito "Estabilizador" no clipe de vídeo.
// Ao aplicar (ou mudar um ajuste, ou aparar além do trecho pronto), o Python analisa o movimento da câmera em segundo
// plano e grava uma cópia estabilizada do trecho (Functions/estabilizador.py: fundo por LK + RANSAC, caminho ideal L1,
// zoom único mínimo). O clipe passa a usar essa cópia como uma mídia comum (oculta no painel Projeto, como a do
// Inverter clipe: m.stDe = mídia original, m.stA / m.stB = trecho, m.stCh = ajustes) — prévia, miniaturas e exportação
// seguem sem nada especial e saem iguais. Tirar ou desligar o efeito volta o clipe para a original na hora.
// Quem decide é um vigia (veStVigiar, 1×/s): para cada clipe compara o que ele usa com o que o efeito pede (sem
// entrar no Ctrl+Z; desfazer/refazer só mexe no efeito e o vigia acompanha).
// =========================================================

const VEST = { jobs: new Map(), n: 0, falhou: new Map(), mudouEm: 0, timer: 0, status: new Map() };
const VE_ST_FOLGA = 1;   // segundos a mais de cada lado do trecho (aparar um pouco não pede outra análise)

VE_FX.estab = {
    nome: 'Estabilizador', cat: 'Distorcer', tag: 'Warp Stabilizer',
    soClipe: true,
    nota: 'Estabilizador: preparando…',
    notaDe: f => VEST.status.get(f.id) || veT('Estabilizador: preparando…'),   // status vivo (veStStatus)
    params: [
        { k: 'res', nome: 'Resultado', tipo: 'lista', opcoes: ['Movimento suave', 'Sem movimento (tripé)'], def: 0 },
        { k: 'suav', nome: 'Suavidade', min: 0, max: 100, step: 1, def: 50, un: '%',
          dica: 'Quanto do movimento lento fica: pouco = segue a câmera de perto; muito = câmera flutuando' },
        { k: 'metodo', nome: 'Método', tipo: 'lista', opcoes: ['Posição', 'Posição, escala e giro'], def: 1 },
        { k: 'corte', nome: 'Corte máximo', min: 2, max: 30, step: 1, def: 10, un: '%',
          dica: 'O quanto pode ampliar para esconder as bordas. Menos corte = mais imagem, menos estável' },
    ],
    // a correção vem na própria mídia (cópia estabilizada): nada a desenhar na prévia nem a mandar para a exportação
    neutro: () => true,
    draw: a => a,
};

const veStFx = c => ((c && c.fx) || []).find(f => f.t === 'estab' && f.on !== false) || null;
const veStOrig = m => (m && m.stDe != null ? VE.media[m.stDe] : m);
const veStOff = m => (m && m.stDe != null ? m.stA : 0);   // instante da original = instante da cópia + stA

function veStCfg(f) {
    const v = (f && f.v) || {}, n = (k, d) => (v[k] == null || isNaN(+v[k]) ? d : +v[k]);
    return { suavidade: n('suav', 50), zoom_max: +(1 + n('corte', 10) / 100).toFixed(3), modo: n('res', 0) === 1 ? 'parado' : 'suave',
             rotacao: n('metodo', 1) === 1, escala: n('metodo', 1) === 1 };
}

// troca a mídia do clipe mantendo o mesmo trecho da original (e os quadros-chave no mesmo lugar da timeline)
function veStTrocar(c, alvo) {
    const atual = veMediaOf(c), d = veStOff(atual) - veStOff(alvo);
    veRvMudarFonte(c, c.s + d, c.e + d);
    if (alvo.id) c.m = alvo.id; else delete c.m;
}

function veStPronta(nm) { return nm && !nm.removido && !veMediaOffline(nm) && !nm.erro && !!(nm.info || nm._stDesde && Date.now() - nm._stDesde > 20000); }

function veStStatus(f, txt) {
    if (!f) return;
    VEST.status.set(f.id, txt);
    const el = document.querySelector(`#ve-fxc [data-fx="${f.id}"] .ve-fxe-nota`);
    if (el && el.textContent !== txt) el.textContent = txt;
}

function veStVigiar() {
    if (typeof VE === 'undefined' || !VE.clips) return;
    let mudou = false;
    const pedidos = new Map();   // origId|chave → {o, cfg, ch, lo, hi, fxs}
    VE.clips.forEach(c => {
        if (!c || veIsAudio(c) || veIsImage(c)) return;
        const m = veMediaOf(c), f = veStFx(c);
        if (!f) {   // sem o efeito (ou desligado): volta para a original
            if (m && m.stDe != null && VE.media[m.stDe]) { veStTrocar(c, VE.media[m.stDe]); mudou = true; }
            return;
        }
        const o = veStOrig(m);
        const oPath = o && (o.path || (o.id === 0 ? VE.path : ''));
        if (!o || veMediaOffline(o) || !oPath) { veStStatus(f, veT('Estabilizador: a mídia original está offline')); return; }
        const cfg = veStCfg(f), ch = JSON.stringify(cfg), off = veStOff(m), lo = c.s + off, hi = c.e + off;
        const cobre = x => x && x.stDe === o.id && x.stCh === ch && x.stA <= lo + 1e-3 && x.stB >= hi - 1e-3;
        if (cobre(m) && veStPronta(m)) { veStStatus(f, `${veT('Estabilizado')} · ${veT('corte')} ${Math.round(((m.stZoom || 1) - 1) * 100)}%`); return; }
        const pronta = VE.media.find(x => cobre(x) && veStPronta(x));
        if (pronta) { veStTrocar(c, pronta); mudou = true; return; }
        // cópia gravada, prévia ainda carregando: espera (sem pedir outra)
        if (VE.media.some(x => cobre(x) && !x.removido && !veMediaOffline(x) && !x.erro)) { veStStatus(f, veT('Estabilizador: preparando a prévia…')); return; }
        const k = o.id + '|' + ch, p = pedidos.get(k) || { o, cfg, ch, lo, hi, fxs: [] };
        p.lo = Math.min(p.lo, lo); p.hi = Math.max(p.hi, hi); p.fxs.push(f);
        pedidos.set(k, p);
    });
    // trabalhos que ninguém mais pede (efeito tirado, ajuste mudado): cancela
    VEST.jobs.forEach((j, id) => {
        if (pedidos.has(j.k) && pedidos.get(j.k).lo >= j.A - 1e-3 && pedidos.get(j.k).hi <= j.B + 1e-3) return;
        if (j.nm) return;   // gravando mídia já pedida por outro motivo: deixa terminar
        window.pywebview.api.ve_estab_cancelar(id);
        VEST.jobs.delete(id);
    });
    const espera = Date.now() - VEST.mudouEm < 900;   // arrastando o controle: espera soltar
    pedidos.forEach((p, k) => {
        const rodando = [...VEST.jobs.values()].find(j => j.k === k && p.lo >= j.A - 1e-3 && p.hi <= j.B + 1e-3);
        if (rodando) {
            const fase = rodando.pct < 45 ? veT('analisando') : veT('aplicando');
            p.fxs.forEach(f => veStStatus(f, `${veT('Estabilizador')}: ${fase}… ${Math.round(rodando.pct || 0)}%`));
            return;
        }
        const erro = VEST.falhou.get(k + '|' + p.lo.toFixed(2) + '|' + p.hi.toFixed(2));
        if (erro) { p.fxs.forEach(f => veStStatus(f, `${veT('Estabilizador')}: ${erro}`)); return; }
        if (espera) { p.fxs.forEach(f => veStStatus(f, veT('Estabilizador: na fila…'))); return; }
        const dur = p.o.dur || (p.o.info && p.o.info.duration) || (p.o.id === 0 ? VE.srcDur : 0) || p.hi + VE_ST_FOLGA;
        const A = +Math.max(0, p.lo - VE_ST_FOLGA).toFixed(3), B = +Math.min(dur, p.hi + VE_ST_FOLGA).toFixed(3);
        const job = 'st' + (++VEST.n);
        VEST.jobs.set(job, { k, o: p.o, ch: p.ch, A, B, pct: 0, chave: k + '|' + p.lo.toFixed(2) + '|' + p.hi.toFixed(2) });
        window.pywebview.api.ve_estabilizar(p.o.path || VE.path, A, B, p.cfg, job);
        p.fxs.forEach(f => veStStatus(f, veT('Estabilizador: analisando… 0%')));
    });
    if (mudou) veRefresh();
}

function veOnEstab(ev) {
    const j = VEST.jobs.get(ev.job);
    if (!j) return;
    if (ev.stage === 'pct') { j.pct = ev.pct; return; }
    VEST.jobs.delete(ev.job);
    if (ev.stage === 'error') {
        if (ev.error !== 'Cancelado.') { VEST.falhou.set(j.chave, ev.error); veToast(`${veT('Não foi possível estabilizar')}: ${ev.error}`); }
        return;
    }
    let nm = VE.media.find(x => x && !x.removido && x.path === ev.path);
    if (!nm) {
        nm = { id: VE.media.length, kind: 'video', name: `${vePjNome(j.o)} (${veT('estabilizado')})`, path: ev.path };
        VE.media.push(nm);
    }
    Object.assign(nm, { stDe: j.o.id, stA: j.A, stB: j.B, stCh: j.ch, stZoom: ev.zoom || 1, _stDesde: Date.now() });
    delete nm.offline; delete nm.missing; delete nm.lost; delete nm.erro; delete nm._stGerando;
    veMidiaPreparar(nm, true);
    veToast(veT('Clipe estabilizado'));
    setTimeout(veStVigiar, 50);
}

// projeto aberto: cópia estabilizada apagada do cache → fica offline sem pedir para religar; o vigia vê a mídia
// offline e pede a cópia de novo (o clipe volta a usar a nova sozinho)
function veStRestaurar(nm) { nm._stGerando = true; }

// ajuste mexido nos Controles de efeito: o vigia espera soltar antes de pedir a análise
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#ve-fxc [data-fx]')) VEST.mudouEm = Date.now(); }, true);
VEST.timer = setInterval(() => { try { veStVigiar(); } catch (e) { console.warn('estab', e); } }, 1000);
