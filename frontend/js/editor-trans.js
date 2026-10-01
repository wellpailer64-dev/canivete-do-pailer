// =========================================================
// Pocket Editor — transições de vídeo (como as do Premiere / Film Impact) e de áudio (Potência constante)
// Ficam presas ao clipe: c.tin = {t, d} na entrada (no corte com o clipe de antes na mesma trilha, ou do nada
// se não houver), c.tout = {t, d} na saída de um clipe sem vizinho depois. d = duração em segundos.
// No áudio, o mesmo com c.atin / c.atout (Potência constante: o crossfade padrão do Premiere, Ctrl+Shift+D).
// No corte a transição fica centrada (como no Premiere) e usa a mídia que sobra além dos pontos de corte;
// sem sobra suficiente ela se desloca/encurta (veTransJanela).
// Prévia e exportação usam a mesma conta: veTransVirtuais() devolve os clipes com os dois lados estendidos
// e a animação convertida em quadros-chave (posição, escala, opacidade) — o resto do editor não muda.
// O áudio vira fades no mix (veAudFades → veMixClipes): mixer em tempo real e afade do ffmpeg.
// =========================================================

const VE_TR_DUR = 1;   // duração padrão (s), como no Premiere
const veEaseIO = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const veEaseOut = u => 1 - Math.pow(1 - u, 3);
const veEaseBack = u => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2);   // passa do ponto e volta

const VE_TR_SPEED = {
    fast: { nome: 'Rápida', d: 0.45 },
    medium: { nome: 'Média', d: 1.0 },
    slow: { nome: 'Lenta', d: 1.65 },
};
const VE_TR_DIRS = {
    r: ['→', 'Direita', 1, 0], l: ['←', 'Esquerda', -1, 0],
    u: ['↑', 'Cima', 0, -1], d: ['↓', 'Baixo', 0, 1],
    ur: ['↗', 'Diagonal cima-direita', 1, -1], ul: ['↖', 'Diagonal cima-esquerda', -1, -1],
    dr: ['↘', 'Diagonal baixo-direita', 1, 1], dl: ['↙', 'Diagonal baixo-esquerda', -1, 1],
};
function veTrDir(dir) {
    const d = VE_TR_DIRS[dir] || VE_TR_DIRS.r;
    const n = Math.hypot(d[2], d[3]) || 1;
    return { x: d[2] / n, y: d[3] / n };
}
// padrão: Rápida (0,45 s), o mais usado em cortes dinâmicos
function veTrCfgBase() { return Object.assign({ speed: 'fast', dir: 'r' }, VE.trCfg || {}); }
function veTrObj(t, base = veTrCfgBase(), antigo = null) {
    const speed = VE_TR_SPEED[base.speed] ? base.speed : 'fast';
    const def = { t, d: VE_TR_SPEED[speed].d, speed };
    if (VE_TR[t] && VE_TR[t].dir) def.dir = VE_TR_DIRS[base.dir] ? base.dir : 'r';
    return Object.assign(def, antigo && antigo.t === t ? antigo : {});
}
function veTrAnim(t, tr) {
    return Object.assign({}, veTrCfgBase(), tr || {}, { t });
}

// pausa = instante mostrado no cartão parado do painel (padrão: o meio).
// fn(u) → {a, b}: o que muda no clipe que sai (a) e no que entra (b). dx/dy em quadros, s = escala,
// sx/sy = escala só num eixo, op = 0..1. O que entra fica por cima do que sai.
const VE_TR = {
    dissolve: { nome: 'Dissolução cruzada', tag: 'Cross Dissolve', fn: u => ({ a: {}, b: { op: u } }) },
    crossfade: { nome: 'Cross fade', tag: 'Opacity Fade', fn: u => ({ a: { op: 1 - u }, b: { op: u } }) },
    fadeblack: {
        nome: 'Fade para preto', tag: 'Fade to Black', pausa: 0.35,
        fn: u => ({ a: { op: u < 0.5 ? 1 - u * 2 : 0 }, b: { op: u < 0.5 ? 0 : (u - 0.5) * 2 } }),
        solo: u => ({ a: { op: 1 - u }, b: { op: u } }),
    },
    push: {
        nome: 'Empurrar', tag: 'Push', dir: true,
        fn: (u, tr) => { const e = veEaseIO(u), v = veTrDir(tr.dir); return { a: { dx: -v.x * e, dy: -v.y * e }, b: { dx: v.x * (1 - e), dy: v.y * (1 - e) } }; },
    },
    slide: {
        nome: 'Deslizar', tag: 'Slide', dir: true,
        fn: (u, tr) => { const e = veEaseIO(u), v = veTrDir(tr.dir); return { a: {}, b: { dx: v.x * (1 - e), dy: v.y * (1 - e) } }; },
    },
    pull: {
        nome: 'Puxar (zoom)', tag: 'Pull', pausa: 0.3,
        fn: u => ({ a: { s: 1 + 0.35 * veEaseIO(u) }, b: { s: 1 + 1.4 * (1 - veEaseOut(u)), op: Math.min(1, u * 2.5) } }),
    },
    pop: { nome: 'Pop', tag: 'Pop', pausa: 0.3, fn: u => ({ a: {}, b: { s: 0.15 + 0.85 * veEaseBack(u), op: Math.min(1, u * 4) } }) },
    // Chicote (whip pan): os dois quadros correm juntos, quase parados nas pontas e muito rápidos no meio (o meio
    // cai na batida); a imagem estica na direção do movimento na proporção da velocidade, como o borrão de câmera
    chicote: {
        nome: 'Chicote', tag: 'Whip Pan', dir: true, pausa: 0.45,
        fn: (u, tr) => {
            const v = veTrDir(tr.dir);
            const e = u < 0.5 ? 16 * Math.pow(u, 5) : 1 - Math.pow(-2 * u + 2, 5) / 2;   // easeInOutQuint
            const vel = 30 * u * u * (1 - u) * (1 - u) / 1.875;                          // derivada normalizada (pico 1 no meio)
            // esticão pequeno: maior que isso, o quadro que entra cobre o que sai e o chicote vira um salto
            const est = 1 + 0.15 * vel, ax = Math.abs(v.x) >= Math.abs(v.y);
            const estica = ax ? { sx: est } : { sy: est };
            return { a: { dx: -v.x * e, dy: -v.y * e, ...estica }, b: { dx: v.x * (1 - e), dy: v.y * (1 - e), ...estica } };
        },
    },
    // como o Impact Fold: o quadro que sai dobra para a esquerda (escurecendo) e o que entra desdobra da direita
    fold: {
        nome: 'Dobrar', tag: 'Fold', pausa: 0.3, dir: true,
        fn: (u, tr) => {
            const v = veTrDir(tr.dir), horiz = Math.abs(v.x) >= Math.abs(v.y);
            const dobra = sx => horiz ? { sx } : { sy: sx };
            if (u < 0.5) {
                const e = veEaseIO(u * 2), sx = Math.max(0.001, 1 - e);
                return { a: { ...dobra(sx), dx: -v.x * (1 - sx) / 2, dy: -v.y * (1 - sx) / 2, op: 1 - 0.45 * e }, b: { op: 0 } };
            }
            const e = veEaseIO((u - 0.5) * 2), sx = Math.max(0.001, e);
            return { a: { op: 0 }, b: { ...dobra(sx), dx: v.x * (1 - sx) / 2, dy: v.y * (1 - sx) / 2, op: 0.55 + 0.45 * e } };
        },
    },
};
// Transição de áudio (a do Ctrl+Shift+D): ganho seno/cosseno — soma de potência constante no crossfade
const VE_TR_AUD = { cp: { nome: 'Potência constante', tag: 'Constant Power' } };

// Clipes de imagem que dão para transição (áudio e camada de ajuste não); de áudio: os que têm som
const veTransPode = c => !!c && !veIsAudio(c) && !veIsAdj(c);
const veAudPode = c => !!c && veOcupaA(c) && veTemSom(c);
const veVizAntes = (c, aud) => VE.clips.find(o => o !== c && o.tr === c.tr && (aud ? veAudPode : veTransPode)(o) && Math.abs(veEnd(o) - c.st) < 1e-3);
const veVizDepois = (c, aud) => VE.clips.find(o => o !== c && o.tr === c.tr && (aud ? veAudPode : veTransPode)(o) && Math.abs(o.st - veEnd(c)) < 1e-3);
// Mídia que sobra (em tempo da timeline) antes do início / depois do fim do clipe. Imagem e texto: à vontade.
const veSobra = (c, lado) => veIsImage(c) ? Infinity : lado === 'ini' ? c.s / veVel(c) : Math.max(0, veDurMidia(c) - c.e) / veVel(c);
// Campo do clipe que guarda a transição
const veTrCampo = (lado, aud) => aud ? (lado === 'in' ? 'atin' : 'atout') : (lado === 'in' ? 'tin' : 'tout');

// Trecho da timeline que a transição ocupa: {t, A, B, ws, we, c, lado, aud} ou null
function veTransJanela(c, lado, aud) {
    const tr = c && c[veTrCampo(lado, aud)];
    if (!tr || !(aud ? VE_TR_AUD : VE_TR)[tr.t] || !(aud ? veAudPode : veTransPode)(c)) return null;
    let d = Math.max(veFrame(), Math.min(tr.d || VE_TR_DUR, veLen(c)));
    if (lado === 'out') return { t: tr.t, tr, A: c, B: null, ws: veEnd(c) - d, we: veEnd(c), c, lado, aud };
    const A = veVizAntes(c, aud);
    if (!A) return { t: tr.t, tr, A: null, B: c, ws: c.st, we: c.st + d, c, lado, aud };
    const cut = c.st, hA = veSobra(A, 'fim'), hB = veSobra(c, 'ini');
    // áudio sem mídia sobrando (ex.: duas músicas inteiras coladas): como no Premiere, aplica mesmo assim —
    // cada lado só se estende pelo que tem (aFim / bIni) e o fade usa o próprio trecho do clipe
    const semSobra = aud && hA + hB < d;
    d = Math.min(d, veLen(A), semSobra ? Infinity : hA + hB);
    if (d < veFrame() * 0.99) return null;
    const lo = Math.max(cut - hB, cut - d), hi = Math.min(cut, cut + hA - d);
    const ws = semSobra ? cut - d / 2 : Math.min(Math.max(cut - d / 2, lo), hi), we = ws + d;
    return { t: tr.t, tr, A, B: c, ws, we, aFim: Math.min(we, cut + hA), bIni: Math.max(ws, cut - hB), c, lado, aud };
}

// Transições de vídeo (comAudio: também as de áudio, para desenhar e clicar na timeline)
function veTransLista(comAudio) {
    const out = [];
    VE.clips.forEach(c => {
        if (c.tin) { const j = veTransJanela(c, 'in'); if (j) out.push(j); }
        if (c.tout) { const j = veTransJanela(c, 'out'); if (j) out.push(j); }
        if (comAudio && c.atin) { const j = veTransJanela(c, 'in', true); if (j) out.push(j); }
        if (comAudio && c.atout) { const j = veTransJanela(c, 'out', true); if (j) out.push(j); }
    });
    return out;
}
const veTransAtiva = t => VE.clips.some(c => c.tin || c.tout) && veTransLista().some(j => t >= j.ws - VE_EPS && t <= j.we + VE_EPS);

// Fades de áudio de cada clipe: Map(clipe → {st, s, e, fi, fo}) — no crossfade os dois lados se estendem pela sobra
function veAudFades() {
    const m = new Map();
    if (!VE.clips.some(c => c.atin || c.atout)) return m;
    const pega = c => { if (!m.has(c)) m.set(c, { st: c.st, s: c.s, e: c.e, fi: 0, fo: 0 }); return m.get(c); };
    veTransLista(true).filter(j => j.aud).forEach(j => {
        const d = j.we - j.ws, bIni = j.A ? j.bIni : j.ws, aFim = j.B ? j.aFim : j.we;
        if (j.B) {
            const f = pega(j.B);
            if (bIni < f.st) { f.s -= (f.st - bIni) * veVel(j.B); f.st = bIni; }
            f.fi = j.A ? j.we - bIni : d;
        }
        if (j.A) {
            const f = pega(j.A), fim = f.st + (f.e - f.s) / veVel(j.A);
            if (aFim > fim) f.e += (aFim - fim) * veVel(j.A);
            f.fo = j.B ? aFim - j.ws : d;
        }
    });
    return m;
}

// Efeito da transição no instante T para o papel ('a' sai / 'b' entra)
function veTransFx(j, papel, T) {
    const u = Math.min(1, Math.max(0, (T - j.ws) / (j.we - j.ws))), tipo = VE_TR[j.t], fn = tipo.fn;
    const tr = veTrAnim(j.t, j.tr || (j.c && j.c[veTrCampo(j.lado, j.aud)]) || j);
    if (papel === 'a' && !j.B) return ((tipo.solo || fn)(1 - u, tr).b || {});   // saída para o nada: o contrário da entrada
    if (papel === 'b' && !j.A && tipo.solo) return tipo.solo(u, tr).b || {};
    return fn(u, tr)[papel] || {};
}

// Clipes com as transições aplicadas: os envolvidos viram cópias (só a imagem; o som fica numa cópia à parte,
// no lugar de sempre) estendidas pela mídia que sobra e com quadros-chave da animação. c._o = clipe original.
function veTransVirtuais() {
    const lista = veTransLista();
    if (!lista.length) return VE.clips;
    const mapa = new Map(), W = VE.seqW, H = VE.seqH, passo = veFrame();
    const virt = c => {
        if (!mapa.has(c)) {
            const v = JSON.parse(JSON.stringify(c));
            v._o = c; v._tr = []; v._base = JSON.parse(JSON.stringify(c));
            if (!v.x && !veIsImage(c) && veTemSom(c)) v.x = 'v';
            mapa.set(c, v);
        }
        return mapa.get(c);
    };
    lista.forEach(j => {
        if (j.B) {
            const v = virt(j.B);
            if (j.ws < v.st) { v.s -= (v.st - j.ws) * veVel(v); v.st = j.ws; }
            v._tr.push([j, 'b']);
        }
        if (j.A) {
            const v = virt(j.A);
            if (j.we > veEnd(v)) v.e += (j.we - veEnd(v)) * veVel(v);
            v._tr.push([j, 'a']);
        }
    });
    mapa.forEach(v => {
        // valores originais (sem a transição) em cada instante, a partir do clipe como era, reposicionado
        const base = Object.assign(v._base, { st: v.st, s: v.s, e: v.e });
        const ts = new Set();
        v._tr.forEach(([j]) => {
            for (let T = j.ws; T < j.we; T += passo) ts.add(+T.toFixed(4));
            ts.add(+j.ws.toFixed(4)); ts.add(+j.we.toFixed(4));
        });
        VE_KF_PROPS.forEach(k => { if (veKfOn(base, k)) base.k[k].forEach(q => ts.add(+veTlAt(base, q.t).toFixed(4))); });
        const tempos = [...ts].sort((a, b) => a - b);
        const k = {};
        let usaSx = false, usaSy = false;
        ['sc', 'x', 'y', 'op', 'sx', 'sy'].forEach(p => { k[p] = []; });
        tempos.forEach(T => {
            const p = veProps(base, T);
            let x = p.x, y = p.y, sc = p.sc, op = p.op, sx = p.sx == null ? 1 : p.sx, sy = p.sy == null ? 1 : p.sy;
            v._tr.forEach(([j, papel]) => {
                if (T < j.ws - VE_EPS || T > j.we + VE_EPS) return;
                const f = veTransFx(j, papel, T), s = f.s == null ? 1 : f.s, fx = f.sx == null ? 1 : f.sx, fy = f.sy == null ? 1 : f.sy;
                if (f.sx != null) usaSx = true;
                if (f.sy != null) usaSy = true;
                x = W / 2 + (f.dx || 0) * W + s * fx * (x - W / 2);
                y = H / 2 + (f.dy || 0) * H + s * fy * (y - H / 2);
                sc *= s;
                sx *= fx;
                sy *= fy;
                op *= f.op == null ? 1 : f.op;
            });
            const t = Math.round(veSrcAt(v, T) * 1e4) / 1e4;
            k.sc.push({ t, v: sc, i: 'lin' }); k.x.push({ t, v: x, i: 'lin' });
            k.y.push({ t, v: y, i: 'lin' }); k.op.push({ t, v: op, i: 'lin' });
            k.sx.push({ t, v: sx, i: 'lin' }); k.sy.push({ t, v: sy, i: 'lin' });
        });
        if (!usaSx) delete k.sx;
        if (!usaSy) delete k.sy;
        v.k = Object.assign({}, v.k || {}, k);
        delete v._base;
    });
    // o som dos clipes que viraram só imagem continua numa cópia no trecho original
    const sons = [...mapa.values()].filter(v => v.x === 'v' && !v._o.x).map(v => ({ ...v._o, x: 'a' }));
    return VE.clips.map(c => mapa.get(c) || c).concat(sons);
}

// ── adicionar / remover / duração ──
function veTransAdd(c, lado, t, aud) {
    if (!(aud ? veAudPode : veTransPode)(c)) {
        veToast(aud ? 'Esse clipe não tem som' : 'Transições de vídeo não se aplicam a áudio nem a camada de ajuste');
        return;
    }
    if (veLocked(c)) { veAvisoBloqueio(); return; }
    vePushHistory();
    const campo = veTrCampo(lado, aud);
    c[campo] = aud ? { t, d: VE_TR_DUR } : veTrObj(t);
    const j = veTransJanela(c, lado, aud);
    if (!j) {
        veUndo();
        veToast('Sem mídia sobrando nos dois lados do corte para a transição');
        return;
    }
    VE.trSel = { c, lado, aud };
    VE.sel = -1;
    veRefresh();
    const d = j.we - j.ws;
    veTrRenderControls();
    const durPadrao = aud ? VE_TR_DUR : c[campo].d || VE_TR_DUR;
    veToast(`${(aud ? VE_TR_AUD : VE_TR)[t].nome} (${veShort(d)})` + (d < durPadrao - 0.01 ? ' · encurtada: pouca mídia sobrando' : ''));
}

// Ctrl+D (vídeo: a transição marcada no painel Transições) / Ctrl+Shift+D ou Ctrl+Shift+9 (áudio: Potência
// constante), como no Premiere: na ponta selecionada ou nas duas pontas dos clipes selecionados.
// Ponta final com clipe colado depois = o corte entre os dois.
function veTransPadrao(aud) {
    const t = aud ? 'cp' : (VE_TR[VE.trEscolhida] ? VE.trEscolhida : 'dissolve');
    const pode = aud ? veAudPode : veTransPode;
    const alvoAud = c => {
        if (veAudPode(c)) return c;
        const par = typeof veVinculados === 'function' ? veVinculados(c).find(o => o !== c && veAudPode(o)) : null;
        return par || null;
    };
    const ponta = (c, lado) => {
        if (lado === 'out') { const n = veVizDepois(c, aud); if (n) return { c: n, lado: 'in' }; }
        return { c, lado };
    };
    const b = veBordaSel();
    let alvos = [];
    if (b) {
        const c = aud ? alvoAud(b.c) : b.c;
        if (pode(c)) alvos.push(ponta(c, b.lado));
    } else veSelLista().map(c => aud ? alvoAud(c) : c).filter(pode).forEach(c => alvos.push(ponta(c, 'in'), ponta(c, 'out')));
    alvos = alvos.filter((a, k) => !veLocked(a.c) && alvos.findIndex(o => o.c === a.c && o.lado === a.lado) === k);
    if (!alvos.length) {
        veToast(aud ? 'Selecione a ponta de um clipe com som (ou o clipe) e aperte Ctrl+Shift+D / Ctrl+Shift+9'
                    : 'Selecione a ponta de um clipe (ou o clipe) e aperte Ctrl+D');
        return;
    }
    vePushHistory();
    let ok = 0, primeiro = null;
    alvos.forEach(a => {
        const campo = veTrCampo(a.lado, aud), antes = a.c[campo];
        a.c[campo] = aud ? { t, d: antes ? antes.d : VE_TR_DUR } : veTrObj(t, veTrCfgBase(), antes);
        if (veTransJanela(a.c, a.lado, aud)) { ok++; if (!primeiro) primeiro = a; }
        else if (antes) a.c[campo] = antes; else delete a.c[campo];
    });
    if (!ok) { VE.history.pop(); veUpdateUndo(); veToast('Sem mídia sobrando para a transição'); return; }
    if (primeiro) { VE.trSel = { c: primeiro.c, lado: primeiro.lado, aud }; VE.sel = -1; }
    veRefresh();
    veTrRenderControls();
    veToast(`${(aud ? VE_TR_AUD : VE_TR)[t].nome}: ${ok} ${ok > 1 ? 'transições aplicadas' : 'transição aplicada'}`);
}

function veTransSelecionada() {
    const s = VE.trSel;
    return s && VE.clips.includes(s.c) && s.c[veTrCampo(s.lado, s.aud)] ? s : null;
}

function veTrSalvarCfg() {
    VE.trCfg = veTrCfgBase();
    veLsSet('ve-tr-cfg', JSON.stringify(VE.trCfg));
}

function veTrSelecionadaObj() {
    const s = veTransSelecionada();
    return s && !s.aud ? s.c[veTrCampo(s.lado, false)] : null;
}

function veTrSpeedAtual(tr) {
    const d = tr && Number.isFinite(+tr.d) ? +tr.d : VE_TR_SPEED[veTrCfgBase().speed].d;
    if (tr && VE_TR_SPEED[tr.speed] && Math.abs(d - VE_TR_SPEED[tr.speed].d) < 0.05) return tr.speed;
    let melhor = 'medium', dist = Infinity;
    Object.entries(VE_TR_SPEED).forEach(([k, v]) => {
        const n = Math.abs(d - v.d);
        if (n < dist) { melhor = k; dist = n; }
    });
    return melhor;
}

function veTrRenderControls() {
    const box = $ve('ve-tr-controls');
    if (!box) return;
    const tr = veTrSelecionadaObj(), tipo = tr && VE_TR[tr.t] ? tr.t : (VE_TR[VE.trEscolhida] ? VE.trEscolhida : 'dissolve');
    const base = tr || veTrObj(tipo, veTrCfgBase());
    const speed = veTrSpeedAtual(base), dir = VE_TR_DIRS[base.dir] ? base.dir : veTrCfgBase().dir;
    box.dataset.mode = tr ? 'selecionada' : 'padrao';
    box.title = veT(tr ? 'Editando a transição selecionada na timeline' : 'Define como as próximas transições do painel serão aplicadas');
    box.querySelectorAll('[data-tr-speed]').forEach(b => b.classList.toggle('active', b.dataset.trSpeed === speed));
    const rowDir = box.querySelector('[data-tr-dir-row]');
    if (rowDir) rowDir.hidden = !(VE_TR[tipo] && VE_TR[tipo].dir);
    box.querySelectorAll('[data-tr-dir]').forEach(b => b.classList.toggle('active', b.dataset.trDir === dir));
}

function veTrSetSpeed(speed) {
    if (!VE_TR_SPEED[speed]) return;
    const tr = veTrSelecionadaObj(), s = veTransSelecionada();
    if (tr && s) {
        if (veLocked(s.c)) { veAvisoBloqueio(); return; }
        vePushHistory();
        tr.speed = speed;
        tr.d = VE_TR_SPEED[speed].d;
        veRefresh();
        veTrRenderControls();
        return;
    }
    VE.trCfg = veTrCfgBase();
    VE.trCfg.speed = speed;
    veTrSalvarCfg();
    veTrRenderControls();
}

function veTrSetDir(dir) {
    if (!VE_TR_DIRS[dir]) return;
    const tr = veTrSelecionadaObj(), s = veTransSelecionada();
    if (tr && s && VE_TR[tr.t] && VE_TR[tr.t].dir) {
        if (veLocked(s.c)) { veAvisoBloqueio(); return; }
        vePushHistory();
        tr.dir = dir;
        veRefresh();
        veTrRenderControls();
        veTrvTodos();
        return;
    }
    VE.trCfg = veTrCfgBase();
    VE.trCfg.dir = dir;
    veTrSalvarCfg();
    veTrRenderControls();
    veTrvTodos();
}

function veTransApagar() {
    const s = veTransSelecionada();
    if (!s) return false;
    if (veLocked(s.c)) { veAvisoBloqueio(); return true; }
    vePushHistory();
    delete s.c[veTrCampo(s.lado, s.aud)];
    VE.trSel = null;
    veRefresh();
    veTrRenderControls();
    veToast('Transição apagada');
    return true;
}

// ── ponta selecionada (clique na borda do clipe, como a seleção de ponto de edição do Premiere) ──
function veBordaSel() {
    const b = VE.bordaSel;
    return b && VE.clips.includes(b.c) ? b : null;
}

function veBordaDesenhar(ctx, rows) {
    const b = veBordaSel();
    if (!b) return;
    const c = b.c, x = ((b.lado === 'in' ? c.st : veEnd(c)) - VE.view) * VE.pps;
    const ids = [];
    if (veOcupaV(c)) ids.push('V' + (c.tr + 1));
    if (veOcupaA(c)) ids.push('A' + (c.tr + 1));
    ctx.save();
    ctx.strokeStyle = '#D4814A';
    ctx.lineWidth = 3;
    ids.forEach(id => {
        const r = rows.find(r => r.id === id);
        if (!r) return;
        const y0 = r.y + 3, y1 = r.y + r.h - 3, dx = b.lado === 'in' ? 6 : -6;
        ctx.beginPath();   // colchete [ na entrada, ] na saída
        ctx.moveTo(x + dx, y0); ctx.lineTo(x, y0); ctx.lineTo(x, y1); ctx.lineTo(x + dx, y1);
        ctx.stroke();
    });
    ctx.restore();
}

// ── timeline: desenho, clique e arrastar a borda (duração) ──
function veTransRetangulo(j, rows) {
    const r = rows.find(r => r.id === (j.aud ? 'A' : 'V') + (j.c.tr + 1));
    if (!r) return null;
    const x1 = (j.ws - VE.view) * VE.pps, x2 = (j.we - VE.view) * VE.pps;
    const w = Math.max(8, x2 - x1), x = x2 - x1 < 8 ? (x1 + x2) / 2 - 4 : x1;
    const h = Math.max(8, Math.min(22, r.h - 8));
    return { x, w, y: r.y + r.h - h - 3, h };
}

function veTransDesenhar(ctx, rows) {
    const sel = veTransSelecionada(), lista = veTransLista(true);
    const hov = VE.trHover && VE.trHover.prev;
    if (hov) lista.push(Object.assign(hov, { _prev: true }));
    lista.forEach(j => {
        const b = veTransRetangulo(j, rows);
        if (!b || b.x > ctx.canvas.width || b.x + b.w < 0) return;
        const on = sel && sel.c === j.c && sel.lado === j.lado && !!sel.aud === !!j.aud;
        const cor = j.aud ? ['rgba(10,40,34,0.9)', 'rgba(110,231,183,0.55)', '#10b981', '#d1fae5'] : ['rgba(30,24,60,0.88)', 'rgba(196,181,253,0.55)', '#8b5cf6', '#ede9fe'];
        ctx.save();
        ctx.globalAlpha = j._prev ? 0.7 : 1;
        ctx.fillStyle = cor[0];
        veRoundRect(ctx, b.x, b.y, b.w, b.h, 2); ctx.fill();
        // diagonal, como o bloco de transição do Premiere
        ctx.strokeStyle = cor[1];
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (!j.A) { ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y); }
        else if (!j.B) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); }
        else { ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); }
        ctx.stroke();
        ctx.strokeStyle = on ? '#D4814A' : j._prev ? '#c4b5fd' : cor[2];
        ctx.lineWidth = on ? 2 : 1;
        if (j._prev) ctx.setLineDash([4, 3]);
        veRoundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 2); ctx.stroke();
        if (b.w > 46 && b.h >= 12) {
            ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
            ctx.font = '600 10px Segoe UI';
            const txt = veT((j.aud ? VE_TR_AUD : VE_TR)[j.t].nome), tw = ctx.measureText(txt).width;
            ctx.fillStyle = cor[0];
            ctx.fillRect(b.x + b.w / 2 - tw / 2 - 4, b.y + b.h / 2 - 7, tw + 8, 13);
            ctx.fillStyle = cor[3];
            ctx.fillText(txt, b.x + b.w / 2 - tw / 2, b.y + b.h / 2 + 3.5);
        }
        ctx.restore();
    });
    veBordaDesenhar(ctx, rows);
}

// Transição sob o ponto (x, y do canvas): {c, lado, aud, j, borda: 'l'|'r'|null}
function veTransAt(x, y) {
    const rows = veTrackRows();
    for (const j of veTransLista(true)) {
        const b = veTransRetangulo(j, rows);
        if (!b || y < b.y || y > b.y + b.h || x < b.x - 3 || x > b.x + b.w + 3) continue;
        const borda = b.w >= 14 && Math.abs(x - b.x) <= 4 ? 'l' : b.w >= 14 && Math.abs(x - b.x - b.w) <= 4 ? 'r' : null;
        return { c: j.c, lado: j.lado, aud: !!j.aud, j, borda };
    }
    return null;
}

// A transição da batida (veTransAt) é a selecionada agora?
const veTransEhSelecionada = h => !!(h && VE.trSel && VE.trSel.c === h.c && VE.trSel.lado === h.lado && !!VE.trSel.aud === !!h.aud);

// Clique numa transição: seleciona; pela borda (só se já estava selecionada: editor.js), arrastar muda a duração
function veTransPointer(hit, t) {
    VE.trSel = { c: hit.c, lado: hit.lado, aud: hit.aud };
    VE.sel = -1;
    VE.bordaSel = null;
    VETX.legSel = -1;
    if (hit.borda && !veLocked(hit.c)) {
        const j = hit.j;
        // ponto fixo: no corte fica o centro; do nada / para o nada, a borda do clipe
        const fixo = !j.A ? j.ws : !j.B ? j.we : (j.ws + j.we) / 2;
        VE.drag = { mode: 'trdur', c: hit.c, lado: hit.lado, aud: hit.aud, fixo, meio: !!(j.A && j.B), started: false };
    }
    veRefresh();
    veTrRenderControls();
}

function veTransArrastar(t) {
    const d = VE.drag;
    if (!d.started) { vePushHistory(); d.started = true; }
    const dur = Math.min(10, Math.max(veFrame(), Math.abs(veSnapFrame(t) - d.fixo) * (d.meio ? 2 : 1)));
    const tr = d.c[veTrCampo(d.lado, d.aud)];
    tr.d = Math.round(dur * 1000) / 1000;
    delete tr.speed;
    veTrRenderControls();
    veDraw();
    veDrawMonitorSoon();
    if (d.aud && typeof veAudioEditou === 'function') veAudioEditou();
}

// ── arrastar do painel: onde a transição cairia ──
// Metade inicial do clipe = entrada dele; metade final = entrada do próximo (ou saída, se não houver próximo)
function veTransAlvo(x, y, doc) {
    const i = veClipAtClient(x, y, doc);
    const c = VE.clips[i];
    if (!veTransPode(c)) return null;
    const r = $ve('ve-tl-wrap').getBoundingClientRect(), t = VE.view + (x - r.left) / VE.pps;
    if (t - c.st <= veEnd(c) - t) return { c, lado: 'in' };
    const n = veVizDepois(c);
    return n ? { c: n, lado: 'in' } : { c, lado: 'out' };
}

// Mostra na timeline onde a transição vai ficar enquanto arrasta
function veTransHover(alvo, t) {
    const velho = VE.trHover;
    if (!alvo) { VE.trHover = null; if (velho) veDraw(); return; }
    if (velho && velho.c === alvo.c && velho.lado === alvo.lado) return;
    const campo = veTrCampo(alvo.lado), antes = alvo.c[campo];
    alvo.c[campo] = veTrObj(t);
    alvo.prev = veTransJanela(alvo.c, alvo.lado);
    if (antes) alvo.c[campo] = antes; else delete alvo.c[campo];
    VE.trHover = alvo;
    veDraw();
}

// ── prévia: players fixos ──
// Cada clipe envolvido numa transição fica com o MESMO player do começo ao fim, e ele se prepara ~1 s antes
// (o que entra espera parado no primeiro quadro; o que sai já toca junto). Trocar de player no meio obrigava a
// buscar o quadro e a imagem piscava ao começar a transição e no corte.
const VE_TR_PL0 = 16;          // VEX[VE_TR_PL0...] são das transições; os de antes, das camadas comuns
const VE_TR_PRE = 1.2;         // segundos de preparo antes da transição
const VETRP = { slot: new Map() };   // clipe original → nº do player

function veTransSoltar(fica) {
    VETRP.slot.forEach((n, o) => {
        if (fica.has(o)) return;
        VETRP.slot.delete(o);
        const x = VEX[VE_TR_PL0 + n];
        if (x && !x.paused) x.pause();
    });
}

// Devolve Map(clipe original → player) dos clipes de transição perto da agulha
function veTransPlayers(t, virt) {
    const mapa = new Map();
    if (!virt || virt === VE.clips) { veTransSoltar(new Set()); return mapa; }
    const pre = VE_TR_PRE * Math.max(1, VE.rate), precisa = new Set();
    veTransLista().filter(j => t >= j.ws - pre && t <= j.we + 0.05)
        .forEach(j => [j.A, j.B].forEach(c => { if (c && !veIsImage(c)) precisa.add(c); }));
    veTransSoltar(precisa);
    const porO = new Map(virt.filter(v => v._o && v._tr).map(v => [v._o, v]));
    precisa.forEach(o => {
        const v = porO.get(o);
        if (!v) return;
        let n = VETRP.slot.get(o);
        if (n == null) {
            const usados = new Set(VETRP.slot.values());
            for (n = 0; usados.has(n); n++);
            VETRP.slot.set(o, n);
        }
        const x = veExtraPlayer(VE_TR_PL0 + n, veMid(v));
        if (t < v.st - VE_EPS) {
            if (!x.paused) x.pause();
            const alvo = veSrcAt(v, v.st);
            if (x.readyState >= 1 && !x.seeking && Math.abs(x.currentTime - alvo) > 0.02) x.currentTime = alvo;
        } else if (t > veEnd(v) + VE_EPS) {
            if (!x.paused) x.pause();
        } else veSyncExtra(x, veSrcAt(v, t), veTaxa(v));
        mapa.set(o, x);
    });
    return mapa;
}

// ── painel Transições: cartões com o exemplo animado (ícone do Canivete) ao passar o mouse ──
const VETRV = { A: null, B: null, anim: new Map() };
const VE_TRV_W = 224, VE_TRV_H = 126;   // canvas 2x (aparece com 112×63)

// Os dois "clipes" do exemplo: o logo do Canivete num quadrado de cantos arredondados, no meio do quadro preto
// (o resto é transparente: dá para ver o quadrado sendo empurrado, girado, apagado...). A = apagado (sai), B = colorido
function veTrvPrep() {
    if (VETRV.A) return;
    VETRV.A = 'carregando';
    const img = new Image();
    img.onload = () => {
        const faz = filtro => {
            const cv = document.createElement('canvas');
            cv.width = VE_TRV_W; cv.height = VE_TRV_H;
            const x = cv.getContext('2d'), l = VE_TRV_H * 0.6;
            x.beginPath();
            x.roundRect((VE_TRV_W - l) / 2, (VE_TRV_H - l) / 2, l, l, l * 0.22);
            x.clip();
            x.filter = filtro;
            x.drawImage(img, (VE_TRV_W - l) / 2, (VE_TRV_H - l) / 2, l, l);
            return cv;
        };
        VETRV.A = faz('grayscale(1) brightness(0.7)');
        VETRV.B = faz('none');
        veTrvTodos();
        veCaRender();
    };
    img.src = 'identidade/splash.png';
}

function veTrvDesenhar(cv, t, u) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height;
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H);
    if (!VETRV.B) return;
    const sel = veTrSelecionadaObj();
    const r = VE_TR[t].fn(u, veTrAnim(t, sel && sel.t === t ? sel : null));
    [[VETRV.A, r.a], [VETRV.B, r.b]].forEach(([src, f]) => {
        f = f || {};
        const s = f.s == null ? 1 : f.s, sx = f.sx == null ? 1 : f.sx, sy = f.sy == null ? 1 : f.sy;
        x.save();
        x.globalAlpha = Math.max(0, Math.min(1, f.op == null ? 1 : f.op));
        x.translate(W / 2 + (f.dx || 0) * W, H / 2 + (f.dy || 0) * H);
        x.scale(s * sx, s * sy);
        x.drawImage(src, -W / 2, -H / 2, W, H);
        x.restore();
    });
}

// Parado: um instante que mostra a transição (o meio, ou o `pausa` dela)
const veTrvPausa = t => VE_TR[t].pausa ?? 0.5;
function veTrvTodos() {
    const box = $ve('ve-tr-list');
    if (box) box.querySelectorAll('[data-trt]').forEach(el => { if (!VETRV.anim.has(el)) veTrvDesenhar(el.querySelector('canvas'), el.dataset.trt, veTrvPausa(el.dataset.trt)); });
}

// Em loop: parado no A, transição de 1 s, parado no B
function veTrvAnimar(el) {
    if (VETRV.anim.has(el)) return;
    const win = el.ownerDocument.defaultView, cv = el.querySelector('canvas'), t0 = performance.now();
    const passo = () => {
        if (!VETRV.anim.has(el)) return;
        const c = ((performance.now() - t0) / 1000) % 2.2;
        veTrvDesenhar(cv, el.dataset.trt, Math.min(1, Math.max(0, c - 0.5)));
        VETRV.anim.set(el, win.requestAnimationFrame(passo));
    };
    VETRV.anim.set(el, win.requestAnimationFrame(passo));
}
function veTrvParar(el) {
    const id = VETRV.anim.get(el);
    if (id == null) return;
    el.ownerDocument.defaultView.cancelAnimationFrame(id);
    VETRV.anim.delete(el);
    veTrvDesenhar(el.querySelector('canvas'), el.dataset.trt, veTrvPausa(el.dataset.trt));
}

function veRenderTrList() {
    const box = $ve('ve-tr-list');
    if (!box) return;
    const q = ($ve('ve-tr-q').value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    [...VETRV.anim.keys()].forEach(veTrvParar);
    const lista = Object.entries(VE_TR).filter(([t, d]) => !q || (veT(d.nome) + ' ' + d.nome + ' ' + d.tag).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    box.innerHTML = lista.map(([t, d]) => `<div class="ve-tr-card${t === VE.trEscolhida ? ' escolhida' : ''}" data-trt="${t}" title="Clique marca como a do Ctrl+D · arraste até o corte entre dois clipes (ou o início/fim de um clipe) · duplo clique põe na entrada do clipe selecionado">
        <canvas width="${VE_TRV_W}" height="${VE_TRV_H}"></canvas><span>${d.nome}</span><small>${d.tag}</small></div>`).join('')
        || '<div class="ve-clips-empty">Nenhuma transição encontrada.</div>';
    veTrvPrep();
    veTrvTodos();
    veTrRenderControls();
    veCaRender();
}

// ── aba Constante: cartões de Rotação / Tremer / Pulsar (efeitos com `constante` em editor-fx.js) ──
const VECA = { anim: new Map() };
const veCaTipos = () => Object.keys(VE_FX).filter(t => VE_FX[t].constante);
const veCaNorm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function veCaDesenhar(cv, t, u) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height;
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H);
    if (!VETRV.B || VETRV.B === 'carregando') return;
    const v = {};
    VE_FX[t].params.forEach(p => { v[p.k] = p.def; });
    const p = veCaAplicar({ st: 0, fx: [{ t, on: true, v }] }, { x: 0, y: 0, sc: 100, rot: 0 }, u), k = W / 540;
    x.save();
    x.translate(W / 2 + p.x * k, H / 2 + p.y * k);
    x.rotate(p.rot * Math.PI / 180);
    x.scale(p.sc / 100, p.sc / 100);
    x.drawImage(VETRV.B, -W / 2, -H / 2, W, H);
    x.restore();
}
function veCaRender() {
    const box = $ve('ve-ca-list');
    if (!box) return;
    const q = veCaNorm((($ve('ve-tr-q') || {}).value || '').trim());
    [...VECA.anim.keys()].forEach(veCaParar);
    const lista = veCaTipos().filter(t => !q || veCaNorm(veT(VE_FX[t].nome) + ' ' + VE_FX[t].nome + ' ' + VE_FX[t].tag + ' constante constant loop').includes(q));
    box.innerHTML = lista.map(t => `<div class="ve-tr-card ve-ca-card" data-cat="${t}" title="${veT('Arraste até um clipe · duplo clique aplica no clipe selecionado · os ajustes ficam no Controles de efeito')}">
        <canvas width="${VE_TRV_W}" height="${VE_TRV_H}"></canvas><span>${veT(VE_FX[t].nome)}</span><small>${VE_FX[t].tag}</small></div>`).join('');
    const sec = $ve('ve-ca-sec');
    if (sec) sec.hidden = !lista.length;
    box.querySelectorAll('[data-cat]').forEach(el => veCaDesenhar(el.querySelector('canvas'), el.dataset.cat, 0.45));
}
function veCaAnimar(el) {
    if (VECA.anim.has(el)) return;
    const win = el.ownerDocument.defaultView, cv = el.querySelector('canvas'), t0 = performance.now();
    const passo = () => {
        if (!VECA.anim.has(el)) return;
        veCaDesenhar(cv, el.dataset.cat, (performance.now() - t0) / 1000);
        VECA.anim.set(el, win.requestAnimationFrame(passo));
    };
    VECA.anim.set(el, win.requestAnimationFrame(passo));
}
function veCaParar(el) {
    const id = VECA.anim.get(el);
    if (id == null) return;
    el.ownerDocument.defaultView.cancelAnimationFrame(id);
    VECA.anim.delete(el);
    veCaDesenhar(el.querySelector('canvas'), el.dataset.cat, 0.45);
}
// Clipe da timeline sob o ponteiro de um evento do painel (a timeline pode estar em outra janela)
function veTrAlvoClipe(ev, doc) {
    const wrap = $ve('ve-tl-wrap'), tdoc = wrap && wrap.ownerDocument;
    if (!tdoc) return -1;
    if (tdoc === doc) return veClipAtClient(ev.clientX, ev.clientY, doc);
    const tw = tdoc.defaultView, borda = (tw.outerWidth - tw.innerWidth) / 2;
    return veClipAtClient(ev.screenX - tw.screenX - borda, ev.screenY - tw.screenY - (tw.outerHeight - tw.innerHeight - borda), tdoc);
}
function veCaInit() {
    const box = $ve('ve-ca-list');
    if (!box) return;
    veCaRender();
    box.addEventListener('pointerover', e => { const el = e.target.closest('[data-cat]'); if (el) veCaAnimar(el); });
    box.addEventListener('pointerout', e => { const el = e.target.closest('[data-cat]'); if (el && !el.contains(e.relatedTarget)) veCaParar(el); });
    box.addEventListener('dblclick', e => {
        const el = e.target.closest('[data-cat]');
        if (!el) return;
        if (VE.sel < 0) { veToast(veT('Selecione um clipe na timeline (ou arraste a animação até ele)')); return; }
        veFxAdd(VE.sel, el.dataset.cat);
    });
    // arrastar até um clipe da timeline ou até o Controles de efeito (clipe selecionado)
    box.addEventListener('pointerdown', e => {
        const el = e.target.closest('[data-cat]');
        if (!el || e.button !== 0) return;
        const doc = box.ownerDocument, win = doc.defaultView, t = el.dataset.cat, x0 = e.clientX, y0 = e.clientY;
        let ghost = null;
        const move = ev => {
            if (!ghost) {
                if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
                ghost = doc.createElement('div');
                ghost.className = 've-dghost';
                ghost.textContent = '↻  ' + veT(VE_FX[t].nome);
                doc.body.appendChild(ghost);
                doc.body.classList.add('ve-fx-dragging');
            }
            ghost.style.left = ev.clientX + 12 + 'px';
            ghost.style.top = ev.clientY + 10 + 'px';
            const i = veTrAlvoClipe(ev, doc);
            $ve('ve-tl-wrap').classList.toggle('fx-drop', i >= 0);
            if (i !== VE.fxHover) { VE.fxHover = i; veDraw(); }
        };
        const up = ev => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            VE.fxHover = -1;
            $ve('ve-tl-wrap').classList.remove('fx-drop');
            doc.body.classList.remove('ve-fx-dragging');
            if (!ghost) return;
            ghost.remove();
            veDraw();
            const i = veTrAlvoClipe(ev, doc);
            const props = doc.elementFromPoint(ev.clientX, ev.clientY)?.closest('#ve-pane-props');
            if (i >= 0) veFxAdd(i, t);
            else if (props && VE.sel >= 0) veFxAdd(VE.sel, t);
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });
}

// Abas do painel Animação: abertas por padrão; a que o usuário fechou continua fechada
function veAnInit() {
    const box = $ve('ve-an-rolagem');
    if (!box) return;
    veCliqueHover(box, '.ve-tr-card');   // tic ao passar o mouse por uma transição/animação
    box.querySelectorAll('details[data-an]').forEach(d => {
        if (veLsGet('ve-an-' + d.dataset.an) === '0') d.open = false;
        d.addEventListener('toggle', () => veLsSet('ve-an-' + d.dataset.an, d.open ? '1' : '0'));
    });
}

// Ponto do evento (na janela do painel) → alvo na timeline, que pode estar em outra janela
function veTrAlvoEvento(ev, doc) {
    const wrap = $ve('ve-tl-wrap'), tdoc = wrap && wrap.ownerDocument;
    if (!tdoc) return null;
    if (tdoc === doc) return veTransAlvo(ev.clientX, ev.clientY, doc);
    const tw = tdoc.defaultView, borda = (tw.outerWidth - tw.innerWidth) / 2;
    return veTransAlvo(ev.screenX - tw.screenX - borda, ev.screenY - tw.screenY - (tw.outerHeight - tw.innerHeight - borda), tdoc);
}

function veTrInit() {
    const box = $ve('ve-tr-list');
    if (!box) return;
    let cfg = {};
    try { cfg = JSON.parse(veLsGet('ve-tr-cfg') || '{}') || {}; } catch (_) { cfg = {}; }
    // Rápida virou o padrão: quem tinha a Média gravada (o padrão antigo) passa uma vez para Rápida
    if (veLsGet('ve-tr-fast') !== '1') { cfg.speed = 'fast'; veLsSet('ve-tr-fast', '1'); veLsSet('ve-tr-cfg', JSON.stringify({ ...cfg })); }
    VE.trCfg = Object.assign({ speed: 'fast', dir: 'r' }, cfg);
    if (!VE_TR_SPEED[VE.trCfg.speed]) VE.trCfg.speed = 'fast';
    if (!VE_TR_DIRS[VE.trCfg.dir]) VE.trCfg.dir = 'r';
    VE.trEscolhida = VE_TR[veLsGet('ve-tr-escolhida')] ? veLsGet('ve-tr-escolhida') : 'dissolve';
    veRenderTrList();
    veCaInit();
    veAnInit();
    $ve('ve-tr-q').addEventListener('input', veRenderTrList);
    $ve('ve-tr-q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; veRenderTrList(); e.target.blur(); } e.stopPropagation(); });
    const controls = $ve('ve-tr-controls');
    if (controls) controls.addEventListener('click', e => {
        const sp = e.target.closest('[data-tr-speed]'), dir = e.target.closest('[data-tr-dir]');
        if (sp) veTrSetSpeed(sp.dataset.trSpeed);
        if (dir) veTrSetDir(dir.dataset.trDir);
    });
    box.addEventListener('pointerover', e => { const el = e.target.closest('[data-trt]'); if (el) veTrvAnimar(el); });
    box.addEventListener('pointerout', e => {
        const el = e.target.closest('[data-trt]');
        if (el && !el.contains(e.relatedTarget)) veTrvParar(el);
    });
    // clique marca a transição do Ctrl+D (contorno laranja), como a "transição padrão" do Premiere
    box.addEventListener('click', e => {
        const el = e.target.closest('[data-trt]');
        if (!el) return;
        VE.trEscolhida = el.dataset.trt;
        veLsSet('ve-tr-escolhida', VE.trEscolhida);
        box.querySelectorAll('[data-trt]').forEach(x => x.classList.toggle('escolhida', x === el));
        veTrRenderControls();
        veTrvTodos();
    });
    box.addEventListener('dblclick', e => {
        const el = e.target.closest('[data-trt]');
        if (!el) return;
        if (VE.sel < 0) { veToast('Selecione um clipe na timeline (ou arraste a transição até o corte)'); return; }
        const c = VE.clips[VE.sel], lado = el.dataset.trt === 'fadeblack' && !veVizDepois(c) ? 'out' : 'in';
        veTransAdd(c, lado, el.dataset.trt);
    });
    // arrastar até a timeline
    box.addEventListener('pointerdown', e => {
        const el = e.target.closest('[data-trt]');
        if (!el || e.button !== 0) return;
        const doc = box.ownerDocument, win = doc.defaultView, t = el.dataset.trt;
        const d = { x0: e.clientX, y0: e.clientY, on: false, ghost: null };
        const move = ev => {
            if (!d.on) {
                if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return;
                d.on = true;
                d.ghost = doc.createElement('div');
                d.ghost.className = 've-dghost';
                d.ghost.textContent = '⇄  ' + veT(VE_TR[t].nome);
                doc.body.appendChild(d.ghost);
                doc.body.classList.add('ve-fx-dragging');
            }
            d.ghost.style.left = ev.clientX + 12 + 'px';
            d.ghost.style.top = ev.clientY + 10 + 'px';
            const alvo = veTrAlvoEvento(ev, doc);
            $ve('ve-tl-wrap').classList.toggle('fx-drop', !!alvo);
            veTransHover(alvo, t);
        };
        const up = ev => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            $ve('ve-tl-wrap').classList.remove('fx-drop');
            doc.body.classList.remove('ve-fx-dragging');
            VE.trHover = null;
            if (!d.on) return;
            d.ghost.remove();
            veDraw();
            const alvo = veTrAlvoEvento(ev, doc);
            if (alvo) veTransAdd(alvo.c, alvo.lado, t);
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });
}

document.addEventListener('DOMContentLoaded', veTrInit);
