// Monta a timeline a partir do plano (montar.py). Corpo de uma função async: recebe P em window.__plano.
// P = {nome, W, H, fps, salvar, midias: [caminhos], clips: [spec]}
const P = window.__plano;
const norm = p => String(p || '').replace(/\\/g, '/').toLowerCase();
if (!VE.ready) veCriarProjetoVazio({ w: P.W, h: P.H, fps: P.fps });
const falta = P.midias.filter(p => !VE.media.some(m => m && !m.removido && norm(m.path) === norm(p)));
if (falta.length) await vePjImportar(falta.map(path => ({ path, pasta: false })));
const midia = arq => VE.media.find(m => m && !m.removido && (norm(m.path) === norm(arq) || norm(m.path).endsWith('/' + norm(arq))));
for (let k = 0; k < 100 && P.midias.some(p => { const m = midia(p.split(/[\\/]/).pop()); return !m || (m.kind === 'image' && !m.w) || (m.kind === 'audio' && !m.dur); }); k++)
    await new Promise(r => setTimeout(r, 150));
let mNulo = VE.media.find(x => x && x.kind === 'nulo' && !x.removido);
if (!mNulo) { mNulo = { id: VE.media.length, kind: 'nulo', name: 'Nulo' }; VE.media.push(mNulo); }
const cores = {};
const midiaCor = fill => {
    if (cores[fill]) return cores[fill];
    let m = VE.media.find(x => x && x.kind === 'cor' && !x.removido && x.fill === fill);
    if (!m) { m = { id: VE.media.length, kind: 'cor', name: 'Cor ' + fill, fill }; VE.media.push(m); }
    return (cores[fill] = m);
};
const erros = [];
const clips = P.clips.map(s => {
    let m;
    if (s.tipo === 'texto') m = veTxMidia();
    else if (s.tipo === 'forma') m = veGrMidia('forma', 'Forma');
    else if (s.tipo === 'cor') m = midiaCor(s.fill);
    else if (s.tipo === 'nulo') m = mNulo;
    else if (s.tipo === 'ajuste') {
        m = VE.media.find(x => x && x.kind === 'ajuste' && !x.removido);
        if (!m) { m = { id: VE.media.length, kind: 'ajuste', name: 'Camada de ajuste' }; VE.media.push(m); }
    }
    else { m = midia(s.arq); if (!m) { erros.push('sem mídia ' + s.arq); return null; } }
    const c = { tr: s.tr, st: s.st, s: s.s || 0, e: (s.s || 0) + s.dur, m: m.id, uid: s.id, nome: s.nome || s.id };
    if (s.tipo === 'audio') {
        c.e = Math.min(c.e, (m.dur || c.e));
        if (s.g != null) c.g = s.g;
        if (s.fi) c.atin = { t: 'cp', d: s.fi };   // entra/sai suave (potência constante)
        if (s.fo) c.atout = { t: 'cp', d: s.fo };
        return c;
    }
    if (s.tipo === 'img' || s.tipo === 'video') c.x = 'v';
    if (s.tx) c.tx = { ...VE_TX_PADRAO, ...s.tx };
    if (s.fm) c.fm = s.fm;
    // escala base: 'larg' = largura alvo em px (imagens); os quadros-chave de 'sc' vêm em % dessa base
    let base = 1;
    if (s.larg && m.w) base = s.larg / m.w;
    if (s.alt && m.h) base = s.larg && m.w ? Math.min(base, s.alt / m.h) : s.alt / m.h;   // os dois: cabe na caixa
    const p = Object.assign({ sc: 100, x: P.W / 2, y: P.H / 2, rot: 0, op: 100 }, s.p || {});
    p.sc = p.sc * base;
    c.p = p;
    if (s.fx) c.fx = s.fx.map(f => ({ id: f.id, t: f.t, on: true, v: f.v || {} }));
    if (s.mk) c.mk = s.mk;
    if (s.pai) c.pai = s.pai;
    if (s.mt) c.mt = s.mt;
    if (s.mb) c.mb = 1;
    if (s.bm) c.bm = s.bm;
    if (s.k) {
        c.k = {};
        for (const [prop, lista] of Object.entries(s.k)) {
            c.k[prop] = lista.map(([t, v, i]) => {
                const q = { t: Math.round((c.s + t) * 1e4) / 1e4, v: prop === 'sc' ? v * base : v, i: Array.isArray(i) ? 'bez' : (i || 'lin') };
                if (Array.isArray(i)) q.b = i;
                return q;
            }).sort((a, b) => a.t - b.t);
        }
    }
    // recortes do HTML (overflow/clip-path) → máscaras nativas; os pontos vêm em px do elemento e vão para px da mídia
    if (s.mkl && s.mkl.length) {
        const sz = veMediaSize(c), el = s.el || { w: sz.w, h: sz.h };
        const mapa = s.tipo === 'texto' && el.ax != null ? (x, y) => [x - el.ax + sz.w / 2, y - el.ay + sz.h / 2]
            : (x, y) => [x * sz.w / el.w, y * sz.h / el.h];
        const conv = pts => { const o = []; for (let k = 0; k < pts.length; k += 2) { const [x, y] = mapa(pts[k], pts[k + 1]); o.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100, 0, 0, 0, 0); } return o; };
        c.mk = s.mkl.map((m, n) => ({ id: m.id, nome: 'Recorte ' + (n + 1), modo: m.modo || 'add', inv: false, on: true, fech: true, pts: conv(m.pts), pena: 0, op: 100, exp: 0 }));
        s.mkl.forEach(m => {
            if (!m.k) return;
            c.k = c.k || {};
            c.k['mk.' + m.id + '.cam'] = m.k.map(([t, v, i]) => {
                const q = { t: Math.round((c.s + t) * 1e4) / 1e4, v: conv(v), i: Array.isArray(i) ? 'bez' : (i || 'lin') };
                if (Array.isArray(i)) q.b = i;
                return q;
            });
        });
    }
    return c;
}).filter(Boolean);
// timeline: a do plano é refeita (as outras ficam)
veSeqSalvarAtiva();
const velha = (VE.sequences || []).find(s => s.name === P.nome);
if (velha && VE.activeSequence !== velha.id) veSeqAplicar(velha, { silent: true });
if (!velha) { veCreateTimeline({ name: P.nome }); }
veSeqQuadro(P.W, P.H);
const seq = veSeqAtiva(); seq.w = P.W; seq.h = P.H;
VE.clips = clips;
veEnsureTracks(Math.max(4, ...clips.map(c => c.tr + 1)));
VE_TRK = veSeqTracks(null, VE.clips);
if (P.master) VE.master = { ...(VE.master || {}), lim: { on: true, v: P.master } };   // Hard Limiter no Master (volume final)
veBuildHeads(); veRelayout(); veCacheInvalidate(); veAfterEdit(VE.playhead || 0); veSeqSalvarAtiva(); veRefresh();
let salvo = null;
if (P.salvar) { VE.projectPath = P.salvar; salvo = await veSaveProject(false); }
return { clips: clips.length, erros, dur: VE.dur, salvo };
