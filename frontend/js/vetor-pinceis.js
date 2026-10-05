// Vetor Kanivete — PINCÉIS (Pincel de arte, de padrão e de dispersão do Illustrator) e MARIONETE (Distorção de marionete).
// doc.pinceis = {nome: {tipo: 'arte'|'padrao'|'dispersao', arte: [objetos], escala %, espaco pt, girar, aleatorio %, colorir}}.
// O caminho guarda o.pincel = {nome, escala?, ...}: é VIVO — a arte é dobrada ao longo do caminho na hora (vkApBase), então
// editar os pontos refaz o pincel; tela, PDF e SVG usam as mesmas pinturas. Espessura do traço multiplica o tamanho (1 pt = 100%).
function vkPinDef(o) { const p = o.pincel; if (!p) return null; const b = (VK.doc.pinceis || {})[p.nome]; return b ? { ...b, ...p } : null; }
VK.pinCache = new WeakMap();
function vkPinTrilha(sub) {   // polilinha com comprimento acumulado + consulta posição/tangente em s
    const pl = vkDsAmostrar(sub, 24, true), L = pl.length ? pl.at(-1)[2] : 0;
    const em = s => {
        if (sub.fechado && L) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
        let lo = 0, hi = pl.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pl[m][2] < s) lo = m; else hi = m; }
        const a = pl[lo], b = pl[hi] || a, d = (b[2] - a[2]) || 1e-9, t = Math.max(0, Math.min(1, (s - a[2]) / d));
        let tx = b[0] - a[0], ty = b[1] - a[1], n = Math.hypot(tx, ty) || 1; tx /= n; ty /= n;
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx, ty };
    };
    return { L, em };
}
function vkPinArte(def) {   // arte do pincel → caminhos (textos viram curvas) + caixa
    const cam = vk3dArteCaminhos(def.arte || []); const b = [Infinity, Infinity, -Infinity, -Infinity];
    cam.forEach(c => c.subs.forEach(s => s.pts.forEach(q => vkBoxAdd(b, q[0], q[1]))));
    return { cam, b, w: (b[2] - b[0]) || 1, h: (b[3] - b[1]) || 1 };
}
function vkPinCor(c, alvo) {   // colorir 'tom': as cores viram tons da cor do traço (branco/papel continua branco)
    if (!c || !alvo) return c; if (c.k === 'grad') return { ...c, paradas: c.paradas.map(p => ({ ...p, cor: vkPinCor(p.cor, alvo) })) };
    const v = vkMalhaCor(c), tinta = Math.min(1, (v[0] + v[1] + v[2] + v[3]) / 100); if (tinta < 0.02) return c;
    const a = vkMalhaCor(alvo); return { k: 'cmyk', v: a.map(x => Math.round(x * tinta * 10) / 10) };
}
function vkPinturasPincel(o, def) {
    const A = vkPinArte(def); if (!A.cam.length) return [];
    const k = ((def.escala ?? 100) / 100) * ((o.traco && o.traco.larg) || 1), out = [], yc = (A.b[1] + A.b[3]) / 2, cor = def.colorir === 'tom' && o.traco ? o.traco.cor : null;
    let s0 = 7 + (def.semente || 0); const rnd = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
    const dobrar = (c, M) => ({ ...c, subs: c.subs.map(s => { const d = vkSubdividir(s, 6); return { fechado: d.fechado, pts: d.pts.map(q => [...M(q[0], q[1]), ...M(q[2], q[3]), ...M(q[4], q[5])]) }; }) });
    const pintar = c => out.push({ subs: c.subs, regra: c.regra || 'nonzero', preench: vkPinCor(c.preench, cor), traco: c.traco ? { ...c.traco, cor: vkPinCor(c.traco.cor, cor), larg: (c.traco.larg ?? 1) * k } : null, ...(c.op != null && c.op < 1 ? { op: c.op } : {}) });
    for (const sub of o.subs) {
        const T = vkPinTrilha(sub); if (T.L < 1e-3) continue;
        const ponto = (s, off) => { const q = T.em(s); return [q.x - q.ty * off, q.y + q.tx * off]; };
        if (def.tipo === 'arte') {   // a arte inteira esticada no comprimento do caminho
            const M = (x, y) => ponto((x - A.b[0]) / A.w * T.L, (y - yc) * k);
            A.cam.forEach(c => pintar(dobrar(c, M)));
        } else if (def.tipo === 'padrao') {   // a peça repetida, dobrando nas curvas; ajusta para fechar inteiro
            const tw = A.w * k, gap = (def.espaco || 0), n = Math.max(1, Math.round(T.L / (tw + gap))), fit = T.L / (n * (tw + gap));
            for (let i = 0; i < n; i++) { const M = (x, y) => ponto((i * (tw + gap) + (x - A.b[0]) * k) * fit, (y - yc) * k); A.cam.forEach(c => pintar(dobrar(c, M))); }
        } else {   // dispersão: cópias rígidas ao longo do caminho, com variação aleatória (semente fixa)
            const tw = A.w * k, passo = tw + (def.espaco ?? tw * 0.5), n = Math.max(1, Math.floor(T.L / passo) + (sub.fechado ? 0 : 1)), al = (def.aleatorio || 0) / 100;
            for (let i = 0; i < n; i++) {
                const q = T.em(i * passo + (sub.fechado ? 0 : 0)), e = k * (1 + (rnd() * 2 - 1) * al * 0.6), off = (rnd() * 2 - 1) * al * A.h * k;
                const ang = (def.girar !== false ? Math.atan2(q.ty, q.tx) : 0) + (rnd() * 2 - 1) * al * Math.PI / 3, cs = Math.cos(ang) * e, sn = Math.sin(ang) * e;
                const cx = q.x - q.ty * off, cy = q.y + q.tx * off, ax = (A.b[0] + A.b[2]) / 2;
                const M = (x, y) => [cx + (x - ax) * cs - (y - yc) * sn, cy + (x - ax) * sn + (y - yc) * cs];
                A.cam.forEach(c => pintar({ ...c, subs: c.subs.map(s => ({ fechado: s.fechado, pts: s.pts.map(p => [...M(p[0], p[1]), ...M(p[2], p[3]), ...M(p[4], p[5])]) })) }));
            }
        }
    }
    return out;
}
const vkApBaseSemPincel = vkApBase;
vkApBase = function (o) {
    const def = o.tipo === 'caminho' && vkPinDef(o); if (!def) return vkApBaseSemPincel(o);
    const chave = JSON.stringify([o.subs, o.pincel, def.arte && def._v, (VK.doc.pinceis || {})[o.pincel.nome] && VK.doc.pinceis[o.pincel.nome]._v, o.traco && [o.traco.larg, o.traco.cor]]);
    const c = VK.pinCache.get(o); if (c && c.chave === chave) return c.r;
    const base = o.preench ? [{ subs: o.subs, regra: o.regra || 'nonzero', preench: o.preench, traco: null }] : [];
    const r = [...base, ...vkPinturasPincel(o, def)]; VK.pinCache.set(o, { chave, r }); return r;
};
const vkApTemSemPincel = vkApTem;
vkApTem = function (o) { return (o.tipo === 'caminho' && !!o.pincel) || vkApTemSemPincel(o); };
const vkCoresSemPincel = vkCores;
vkCores = function (o) { const out = vkCoresSemPincel(o); const d = o.pincel && vkPinDef(o); if (d) (d.arte || []).forEach(a => out.push(...vkCores(a))); return out; };

// ── MARIONETE (MLS rígido, Schaefer 2006): pinos p_i → q_i; cada ponto gira/move como o vizinho mais próximo manda ──
function vkMarionete(pinos, destinos) {
    const n = pinos.length;
    return (x, y) => {
        let sw = 0, px = 0, py = 0, qx = 0, qy = 0; const w = [];
        for (let i = 0; i < n; i++) { const d2 = (pinos[i][0] - x) ** 2 + (pinos[i][1] - y) ** 2; if (d2 < 1e-9) return destinos[i].slice(); w[i] = 1 / d2; sw += w[i];
            px += w[i] * pinos[i][0]; py += w[i] * pinos[i][1]; qx += w[i] * destinos[i][0]; qy += w[i] * destinos[i][1]; }
        px /= sw; py /= sw; qx /= sw; qy /= sw;
        let mr = 0, mi = 0;   // M = Σ w conj(p̂) q̂ (complexo) → rotação ótima
        for (let i = 0; i < n; i++) { const ax = pinos[i][0] - px, ay = pinos[i][1] - py, bx = destinos[i][0] - qx, by = destinos[i][1] - qy; mr += w[i] * (ax * bx + ay * by); mi += w[i] * (ax * by - ay * bx); }
        const m = Math.hypot(mr, mi) || 1, c = mr / m, s = mi / m, vx = x - px, vy = y - py;
        return n === 1 ? [x + qx - px, y + qy - py] : [qx + c * vx - s * vy, qy + s * vx + c * vy];
    };
}
(() => {
    const D = a => v => a.un === 'pt' ? +v : vkPT(+v);
    // criar_pincel: arte (ids/nomes, ou seleção) → doc.pinceis[nome]; tipo arte|padrao|dispersao; escala, espaco (mm), girar, aleatorio, colorir 'tom'
    vkRegistrar('criar_pincel', 'criar pincel', a => {
        const arte = a.arte ? [].concat(a.arte).map(n => vkObj(n) || vkTodos().map(x => x.o).find(o => o.nome === n)).filter(Boolean) : vkTxAlvos(a);
        if (!arte.length) throw new Error('criar_pincel: arte = objetos do pincel');
        const tipo = a.tipo || 'arte'; if (!['arte', 'padrao', 'dispersao'].includes(tipo)) throw new Error('criar_pincel: tipo arte | padrao | dispersao');
        const nome = a.nome || `Pincel ${tipo} ${Object.keys(VK.doc.pinceis || {}).length + 1}`;
        VK.doc.pinceis = VK.doc.pinceis || {};
        VK.doc.pinceis[nome] = { tipo, arte: arte.map(vkClone), escala: a.escala ?? 100, ...(a.espaco != null ? { espaco: D(a)(a.espaco) } : {}), girar: a.girar !== false,
            aleatorio: +(a.aleatorio || 0), ...(a.colorir ? { colorir: a.colorir } : {}), _v: Date.now() };
        if (a.apagar_originais) for (const o of arte) { const l = vkListaDe(o.id); if (l) l.splice(l.indexOf(o), 1); }
        return { pincel: nome, tipo };
    });
    // pincel: aplica no(s) caminho(s) (nome do pincel; null tira); escala/espaco/aleatorio por caminho sobrepõem o pincel
    vkRegistrar('pincel', 'aplicar pincel', a => {
        const objs = vkTxAlvos(a).filter(o => o.tipo === 'caminho'); if (!objs.length) throw new Error('pincel: escolha caminhos');
        if (a.nome && !(VK.doc.pinceis || {})[a.nome]) throw new Error(`pincel "${a.nome}" não existe; há: ${Object.keys(VK.doc.pinceis || {}).join(', ') || 'nenhum (use criar_pincel)'}`);
        for (const o of objs) {
            if (!a.nome) { delete o.pincel; continue; }
            o.pincel = { nome: a.nome, ...(a.escala != null ? { escala: +a.escala } : {}), ...(a.espaco != null ? { espaco: D(a)(a.espaco) } : {}), ...(a.aleatorio != null ? { aleatorio: +a.aleatorio } : {}), ...(a.semente != null ? { semente: +a.semente } : {}) };
            if (!o.traco || !o.traco.cor) o.traco = { cor: vkCorDe('100K'), larg: 1, cap: 'round', junc: 'round', miter: 4, tracejado: [], fase: 0 };
        }
        return { caminhos: objs.length, pincel: a.nome || null };
    });
    vkRegistrar('pinceis', 'pincéis', () => ({ pinceis: Object.entries(VK.doc.pinceis || {}).map(([n, p]) => ({ nome: n, tipo: p.tipo, escala: p.escala, objetos: p.arte.length })) }), true);
    // expandir_pincel: o caminho vira grupo com a arte dobrada (sem vínculo)
    vkRegistrar('expandir_pincel', 'expandir pincel', a => {
        const objs = vkTxAlvos(a).filter(o => o.pincel), novos = [];
        for (const o of objs) { const p = vkApBase(o), l = vkListaDe(o.id);
            const g = { id: vkId(), tipo: 'grupo', nome: (o.nome || 'pincel') + ' (expandido)', itens: p.map(q => ({ id: vkId(), tipo: 'caminho', regra: q.regra, subs: q.subs, preench: q.preench || null, traco: q.traco || null, ...(q.op ? { op: q.op } : {}) })) };
            l.splice(l.indexOf(o), 1, g); novos.push(g.id); }
        VK.sel = novos; return { novos };
    });
    // marionete: pinos [[x,y]...] e destinos [[x,y]...] (mm da prancheta). Caminhos e grupos (textos: crie contornos antes)
    vkRegistrar('marionete', 'distorção de marionete', a => {
        const pr = VK.doc.pranchetas.find(q => q.id === VK.ativa) || VK.doc.pranchetas[0], P = v => a.un === 'pt' ? [+v[0], +v[1]] : [pr.x + vkPT(+v[0]), pr.y + vkPT(+v[1])];
        const pinos = (a.pinos || []).map(P), dest = (a.destinos || a.pinos || []).map(P);
        if (!pinos.length || pinos.length !== dest.length) throw new Error('marionete: pinos e destinos com o mesmo número de pontos');
        const F = vkMarionete(pinos, dest), objs = vkTxAlvos(a); let n = 0;
        const fazer = o => { if (o.tipo === 'grupo') return o.itens.forEach(fazer); if (o.tipo !== 'caminho') return;
            o.subs = o.subs.map(s => { const d = vkSubdividir(s, 4); return { fechado: d.fechado, pts: d.pts.map(q => [...F(q[0], q[1]), ...F(q[2], q[3]), ...F(q[4], q[5])]) }; }); n++; };
        objs.forEach(fazer);
        return { caminhos: n };
    });
})();
// painel: escolher o pincel do caminho selecionado
const vkApPainelSemPincel = vkApPainel;
vkApPainel = function (objs) {
    let h = vkApPainelSemPincel(objs); const ps = Object.keys(VK.doc.pinceis || {}); const cs = objs.filter(o => o.tipo === 'caminho'); if (!cs.length || !ps.length) return h;
    const at = cs[0].pincel ? cs[0].pincel.nome : '';
    return h + `<div class="vk-sec"><div class="vk-sec-t">Pincel</div><div class="vk-linha"><select data-pin>${['', ...ps].map(n => `<option value="${vkEsc_(n)}" ${n === at ? 'selected' : ''}>${n ? vkEsc_(n) : '— nenhum (traço normal)'}</option>`).join('')}</select>
        ${at ? '<button class="ie-btn ie-btn-mini" data-pinx>Expandir</button>' : ''}</div></div>`;
};
const vkApPainelEventosSemPincel = vkApPainelEventos;
vkApPainelEventos = function (el) {
    vkApPainelEventosSemPincel(el);
    el.addEventListener('change', e => { if (e.target.dataset && 'pin' in e.target.dataset) { e.stopPropagation(); vkCmdUi('pincel', { nome: e.target.value || null }); } }, true);
    el.addEventListener('click', e => { if (e.target.closest('[data-pinx]')) vkCmdUi('expandir_pincel', {}); });
};
(() => {
    const m = VK_MENUS.find(x => x[0] === 'Objeto'); if (!m) return;
    m[1].push('-', ['Pincel de arte da seleção', '', () => vkCmdUi('criar_pincel', { tipo: 'arte' })], ['Pincel de padrão da seleção', '', () => vkCmdUi('criar_pincel', { tipo: 'padrao' })],
        ['Pincel de dispersão da seleção', '', () => vkCmdUi('criar_pincel', { tipo: 'dispersao', aleatorio: 30 })], ['Expandir pincel', '', () => vkCmdUi('expandir_pincel', {})]);
})();
