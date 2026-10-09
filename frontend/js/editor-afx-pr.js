// =========================================================
// Pocket Editor — Efeitos de áudio do Premiere (os 53 nativos do Premiere Pro 26.5)
// Dados: frontend/dados/premiere_audio.js (window.VE_PR_DADOS, gerado por tools/premiere_audio_dados.py a partir do
// catálogo lido no Premiere pelo plugin Kanivete Ponte). Cada efeito entra no VE_AFX como "pr_<nome>" e guarda os
// valores COMO O PREMIERE (0..1 por parâmetro, f.v.p0, p1...): a ida e volta não perde nada. Na tela o slider anda em
// 0..1 (o controle do Premiere) e o número mostra a unidade real pela régua medida (Hz, dB, ms).
// Som: os efeitos marcados "som" tocam na prévia (aqui, com estado por clipe) e saem na exportação
// (Functions/efeitos_pr.py) com as MESMAS contas: biquads RBJ, Linkwitz-Riley, delay com realimentação, compressor
// igual ao acompressor do ffmpeg. Hard Limiter vira o 'limiter' do Kanivete. Os outros passam intactos (sem som).
// Medições: Instructions/agente/ponte-premiere.md.
// =========================================================
const VEAPR = { porTipo: {}, porMatch: {} };

const veAprTipo = nome => 'pr_' + nome.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function veAprReal(m, v) {
    if (!m) return v;
    const k = m[0];
    if (k === 'lin') return m[1] + (m[2] - m[1]) * v;
    if (k === 'quad') return m[1] + (m[2] - m[1]) * v * v;
    if (k === 'gain') return v > 0 ? 20 * Math.log10(v * m[1]) : -200;
    if (k === 'tab') {
        const t = m[1];
        if (v <= t[0][0]) return t[0][1];
        for (let i = 1; i < t.length; i++) if (v <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (v - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
        return t[t.length - 1][1];
    }
    if (k === 'bool') return v >= 0.5 ? 1 : 0;
    return v;
}
// unidade real → 0..1 (réguas monótonas: bissecção)
function veAprInv(m, real) {
    if (!m || m[0] === 'bool') return real;
    const sobe = veAprReal(m, 1) >= veAprReal(m, 0);
    let a = 0, b = 1;
    for (let i = 0; i < 40; i++) {
        const c = (a + b) / 2;
        if ((veAprReal(m, c) < real) === sobe) a = c; else b = c;
    }
    return (a + b) / 2;
}
function veAprFmt(m, v, un) {
    const r = veAprReal(m, v);
    if (r <= -199) return '-∞';
    const a = Math.abs(r);
    return String(a >= 1000 ? Math.round(r) : a >= 100 ? Math.round(r * 10) / 10 : Math.round(r * 100) / 100);
}

// parâmetros que o Premiere guarda mas não mostra (canais extras, estado interno)
const VE_APR_OCULTOS = /^(|Bypass|Is Processing|Number of Channels|Channel Count|Use Default Setting|Use Positive Cents)$/;

function veAprRegistrar() {
    const D = window.VE_PR_DADOS;
    if (!D || typeof VE_AFX === 'undefined') return;
    for (const [match, e] of Object.entries(D.efeitos)) {
        const t = veAprTipo(e.nome);
        const params = e.p.map((p, i) => {
            const m = p.m, base = { k: 'p' + i, nome: p.n || `#${i}`, def: +p.d || 0, pr: true, m };
            if (VE_APR_OCULTOS.test(p.n) && !(m && m[0] === 'bool' && p.n === 'Bypass')) base.oculto = true;
            if (p.n === 'Bypass') base.oculto = true;
            if (m && m[0] === 'bool') return { ...base, tipo: 'bool' };
            return { ...base, min: 0, max: 1, step: 0.001, un: p.u || '', vis: v => veAprFmt(m, v), inv: x => veAprInv(m, x) };
        });
        VE_AFX[t] = {
            nome: e.nome, cat: 'Áudio · Premiere · ' + e.cat, tag: e.som ? 'Premiere' : 'Premiere (sem prévia: vai e volta intacto)',
            params, pr: match, som: !!e.som,
            neutro: v => !e.som || !!v.p0 && e.p[0] && e.p[0].n === 'Bypass' && v.p0 >= 0.5,
        };
        VEAPR.porTipo[t] = { match, e };
        VEAPR.porMatch[match] = t;
    }
}

// valores reais por nome de parâmetro
function veAprValores(t, v) {
    const { e } = VEAPR.porTipo[t], out = {};
    e.p.forEach((p, i) => { const x = v['p' + i]; out[p.n] = veAprReal(p.m, x == null ? +p.d || 0 : +x); });
    return out;
}

// Efeitos do Premiere que o Kanivete faz com um efeito próprio (mesma conta): Hard Limiter → 'limiter'
function veAprParaKanivete(f) {
    const P = VEAPR.porTipo[f.t];
    if (!P || P.e.nome !== 'Hard Limiter') return f;
    const r = veAprValores(f.t, f.v), cl = (x, a, b) => Math.min(b, Math.max(a, x));
    return { t: 'limiter', v: { ceil: cl(r['Maximum Amplitude'], -30, 0), boost: cl(r['Input Boost'], -12, 30), look: cl(r['Look-Ahead Time'], 0.1, 10),
                                rel: cl(r['Release Time'], 10, 1000), link: r['Link Channels'] ? 1 : 0 } };
}

// ── som da prévia (com estado por clipe: editor-audio.js passa um objeto por clipe e por posição na lista) ──
const VE_APR_SR = 48000;
function veAprCoef(tipo, f0, q, db = 0) {
    f0 = Math.min(Math.max(f0, 10), VE_APR_SR * 0.499);
    const A = Math.pow(10, db / 40), w = 2 * Math.PI * f0 / VE_APR_SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b, a;
    if (tipo === 'hp') { b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]; }
    else if (tipo === 'lp') { b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]; }
    else if (tipo === 'bp') { b = [al, 0, -al]; a = [1 + al, -2 * c, 1 - al]; }
    else if (tipo === 'notch') { b = [1, -2 * c, 1]; a = [1 + al, -2 * c, 1 - al]; }
    else if (tipo === 'peak') { b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]; }
    else {
        const sa = 2 * Math.sqrt(A) * al;
        if (tipo === 'low') {
            b = [A * ((A + 1) - (A - 1) * c + sa), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sa)];
            a = [(A + 1) + (A - 1) * c + sa, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sa];
        } else {
            b = [A * ((A + 1) + (A - 1) * c + sa), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sa)];
            a = [(A + 1) - (A - 1) * c + sa, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sa];
        }
    }
    return [b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]];
}
const veAprInterp = (pts, x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
    return pts[pts.length - 1][1];
};
const VE_APR_QBASS = [[-24, 0.71], [-12, 1.0], [0, 1.4], [12, 2.0], [24, 2.0]];
const VE_APR_QTREB = [[-24, 0.3], [-12, 0.3], [0, 0.4], [12, 0.5], [24, 0.71]];
const VE_APR_ATK = [[0, 0.01], [0.1, 0.125], [0.5, 0.442], [1, 1.025]];      // ms do acompressor (Functions/efeitos_pr.py)
const VE_APR_REL = [[0, 0.5], [0.1, 40.4], [0.5, 156.1], [1, 1185.3]];
const veAprInterpLog = (pts, x) => Math.exp(veAprInterp(pts.map(([a, b]) => [a, Math.log(Math.max(b, 1e-6))]), x));

// monta o processador do efeito (coeficientes calculados uma vez; estado zerado)
function veAprNovo(f) {
    const P = VEAPR.porTipo[f.t];
    if (!P || !P.e.som) return null;
    const r = veAprValores(f.t, f.v), n = P.e.nome, dbl = x => Math.pow(10, x / 20);
    if (r.Bypass) return null;
    const bq = cs => ({ k: 'bq', cs, z: cs.map(() => [0, 0, 0, 0]) });     // z: L1, L2, R1, R2 por estágio
    const mat = (a, b, c, d) => ({ k: 'mat', m: [a, b, c, d] });           // [L←L, L←R, R←L, R←R]
    if (n === 'Volume') return mat(r.Mute ? 0 : dbl(r.Level), 0, 0, r.Mute ? 0 : dbl(r.Level));
    if (n === 'Channel Volume' || n === 'Amplify') return mat(dbl(r.Left), 0, 0, dbl(r.Right));
    if (n === 'Balance') { const p = r.Balance / 100; return mat(1 - Math.max(0, p), 0, 0, 1 + Math.min(0, p)); }
    if (n === 'Invert') return mat(-1, 0, 0, -1);
    if (n === 'Swap Channels') return mat(0, 1, 1, 0);
    if (n === 'Fill Left with Right') return mat(0, 1, 0, 1);
    if (n === 'Fill Right with Left') return mat(1, 0, 1, 0);
    if (n === 'Mute') {
        if (r['Mute All']) return mat(0, 0, 0, 0);
        return mat(r['Mute Left'] ? 0 : 1, 0, 0, r['Mute Right'] ? 0 : 1);
    }
    if (n === 'Bass') return Math.abs(r.Boost) < 0.01 ? null : bq([veAprCoef('low', 200, veAprInterp(VE_APR_QBASS, r.Boost), r.Boost)]);
    if (n === 'Treble') return Math.abs(r.Boost) < 0.01 ? null : bq([veAprCoef('high', 4000, veAprInterp(VE_APR_QTREB, r.Boost), r.Boost)]);
    if (n === 'Highpass' || n === 'Lowpass') { const c = veAprCoef(n === 'Highpass' ? 'hp' : 'lp', r.Cutoff, Math.SQRT1_2); return bq([c, c]); }
    if (n === 'Bandpass') return bq([veAprCoef('bp', r.Cutoff, r.Q)]);
    if (n === 'Simple Notch Filter') return bq([veAprCoef('notch', r.Cutoff, r.Q)]);
    if (n === 'Simple Parametric EQ') return Math.abs(r.Boost) < 0.01 ? null : bq([veAprCoef('peak', r.Center, r.Q, r.Boost)]);
    if (n === 'Delay') {
        const D = Math.round(r.Delay * VE_APR_SR / 1000);
        if (D < 1 || r.Mix <= 0) return null;
        return { k: 'delay', D, fb: r.Feedback / 100, mix: r.Mix / 100, bl: new Float32Array(D), br: new Float32Array(D), i: 0 };
    }
    if (n === 'Pitch Shifter') {
        const q = r['Transpose Ratio'];
        if (Math.abs(q - 1) < 1e-4) return null;
        const W = 2048;   // janela de ~43 ms: duas cabeças de leitura cruzadas (prévia; a exportação usa o rubberband)
        return { k: 'pitch', q, W, bl: new Float32Array(W * 2), br: new Float32Array(W * 2), w: 0, fase: 0 };
    }
    if (n === 'Single-band Compressor') {
        const pAtk = P.e.p.findIndex(p => p.n === 'Attack'), pRel = P.e.p.findIndex(p => p.n === 'Release');
        const vAtk = f.v['p' + pAtk] != null ? +f.v['p' + pAtk] : +P.e.p[pAtk].d, vRel = f.v['p' + pRel] != null ? +f.v['p' + pRel] : +P.e.p[pRel].d;
        const atk = Math.max(0.01, veAprInterpLog(VE_APR_ATK, vAtk)), rel = Math.max(0.01, Math.min(9000, veAprInterpLog(VE_APR_REL, vRel)));
        return { k: 'comp', thr: Math.log(Math.max(dbl(r.Threshold), 0.000976563)), ratio: Math.max(1, Math.min(20, r.Ratio)),
                 ac: Math.min(1, 1 / (atk * VE_APR_SR / 4000)), rc: Math.min(1, 1 / (rel * VE_APR_SR / 4000)), env: 0, ganho: dbl(r.Gain) };
    }
    return null;
}

// um quadro (l, r) pelo processador; devolve [l, r]
function veAprPasso(P, l, r) {
    if (P.k === 'mat') { const m = P.m; return [m[0] * l + m[1] * r, m[2] * l + m[3] * r]; }
    if (P.k === 'bq') {
        for (let j = 0; j < P.cs.length; j++) {
            const [b0, b1, b2, a1, a2] = P.cs[j], z = P.z[j];
            const yl = b0 * l + z[0]; z[0] = b1 * l - a1 * yl + z[1]; z[1] = b2 * l - a2 * yl; l = yl;
            const yr = b0 * r + z[2]; z[2] = b1 * r - a1 * yr + z[3]; z[3] = b2 * r - a2 * yr; r = yr;
        }
        return [l, r];
    }
    if (P.k === 'delay') {
        // y[n] = x[n−D] + fb·y[n−D] (o mesmo que os toques do aecho da exportação)
        const i = P.i, yl = P.bl[i], yr = P.br[i];
        P.bl[i] = l + P.fb * yl; P.br[i] = r + P.fb * yr;
        P.i = (i + 1) % P.D;
        return [(1 - P.mix) * l + P.mix * yl, (1 - P.mix) * r + P.mix * yr];
    }
    if (P.k === 'pitch') {
        const N = P.bl.length, W = P.W;
        P.bl[P.w] = l; P.br[P.w] = r;
        P.fase = (P.fase + (1 - P.q) + W) % W;          // atraso que anda: lê mais rápido (agudo) ou mais devagar (grave)
        let ol = 0, or = 0;
        for (const desloc of [0, W / 2]) {
            const d = (P.fase + desloc) % W, g = Math.sin(Math.PI * d / W);   // janela: zero nas pontas do atraso
            let pos = P.w - d - 1; if (pos < 0) pos += N;
            const i0 = Math.floor(pos), fr = pos - i0, i1 = (i0 + 1) % N;
            ol += g * g * (P.bl[i0] + (P.bl[i1] - P.bl[i0]) * fr);
            or += g * g * (P.br[i0] + (P.br[i1] - P.br[i0]) * fr);
        }
        P.w = (P.w + 1) % N;
        return [ol, or];
    }
    if (P.k === 'comp') {
        // acompressor do ffmpeg: detecção RMS, canais pela média, sem joelho (knee=1)
        const a = (Math.abs(l) + Math.abs(r)) / 2, s = a * a;
        P.env += (s - P.env) * (s > P.env ? P.ac : P.rc);
        let g = 1;
        if (P.env > 0) {
            const slope = 0.5 * Math.log(P.env);
            if (slope > P.thr) g = Math.exp((slope - P.thr) / P.ratio + P.thr - slope);
        }
        g *= P.ganho;
        return [l * g, r * g];
    }
    return [l, r];
}

// chamado por veAudioFxProcess (editor-audio.js) para efeitos 'pr_*'; st = estado do clipe, j = posição na lista
function veAprProcessar(f, j, l, r, st) {
    if (!st) return [l, r];
    let P = st[j];
    if (P === undefined || (P && P._f !== f)) { P = st[j] = veAprNovo(f); if (P) P._f = f; }
    return P ? veAprPasso(P, l, r) : [l, r];
}

veAprRegistrar();
window.VEAPR_API = { real: veAprReal, inv: veAprInv, tipo: veAprTipo, valores: veAprValores, porMatch: m => VEAPR.porMatch[m] };
