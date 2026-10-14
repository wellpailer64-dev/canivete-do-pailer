// =========================================================
// Editor Kanivete — Motion (recursos do After Effects que o motion profissional usa)
//   Máscaras na camada (retângulo, elipse, caneta; modo, inverter, pena, opacidade, expansão; caminho animável)
//   Fosco de trilha (alfa / luma, normal ou invertido) apontando para qualquer camada; a camada-fosco some da tela
//   Camada mãe (parentesco) e Nulo (camada de controle que não aparece)
//   Desfoque de movimento por camada (obturador 180°, amostras conforme o quanto anda no quadro)
//   Quadros-chave em qualquer parâmetro de efeito, de máscara e de forma (cronômetro, ◆, faixas na timeline)
//
// Modelo (no clipe):
//   c.uid              identificador fixo da camada (camada mãe e fosco apontam para ele; os pedaços de um corte
//                      ficam com o mesmo uid: valem como a mesma camada, como no AE)
//   c.pai = uid        camada mãe: herda posição, escala e rotação dela (opacidade não, como no AE)
//   c.mt = {uid, modo} fosco de trilha; modo: alfa | alfainv | luma | lumainv
//   c.mb = 1           desfoque de movimento
//   c.mk = [{id, nome, modo, inv, on, fech, pts, pena, op, exp}]   máscaras em px da mídia (antes dos efeitos, como no
//                      AE). pts = [x, y, ix, iy, ox, oy, ...]: vértice e alças de entrada/saída (relativas ao vértice)
//   c.k['fx.<id>.<parâmetro>'], c.k['mk.<id>.<cam|pena|op|exp>'], c.k['fm.<parâmetro>']   quadros-chave novos
//                      (mesmo formato dos de Movimento: [{t (fonte), v, i, b}]; o caminho anima ponto a ponto)
// Nulo: mídia 'nulo' (100×100), não aparece no monitor nem na exportação.
//
// Exportação ("camada desenhada"): a camada que usa qualquer recurso daqui é desenhada quadro a quadro pelo MESMO
// desenhista da prévia (veDesenharItens) num canvas do tamanho do quadro, e o cena3d.py monta o .mov ProRes 4444 com
// alfa (cache por hash do conteúdo: exportar de novo sem mudar nada reaproveita). Ela entra na exportação no lugar da
// camada, já pronta (sem escala/posição), com o modo de mesclagem dela. Camada-fosco e nulo não saem.
// =========================================================

const VEMO = {
    telas: new WeakMap(),       // clipe → canvases de trabalho (camada, amostra, fosco, máscara)
    ferr: 'ret',                // ferramenta Máscara: ret | eli
    caneta: null,               // máscara sendo desenhada com a Caneta: {c, id}
    selMk: null,                // máscara selecionada no monitor: {c, id}
    drag: null,
    assando: 0,
};
const VE_MO_MODOS = { add: 'Adicionar', sub: 'Subtrair', inter: 'Interseção', dif: 'Diferença', nenhum: 'Nenhum' };
const VE_MO_FOSCOS = { alfa: 'Fosco alfa', alfainv: 'Fosco alfa invertido', luma: 'Fosco luma', lumainv: 'Fosco luma invertido' };
const VE_MO_MK = {
    cam: { nome: 'Caminho', lista: true },
    pena: { nome: 'Pena', un: 'px', min: 0, max: 1000, passo: 0.5, casas: 1, def: 0 },
    op: { nome: 'Opacidade', un: '%', min: 0, max: 100, passo: 0.5, casas: 1, def: 100 },
    exp: { nome: 'Expansão', un: 'px', min: -1000, max: 1000, passo: 0.5, casas: 1, def: 0 },
};
// propriedades animáveis da Forma (editor-grafico.js)
const VE_MO_FM = {
    w: { nome: 'Largura', un: 'px', min: 1, max: 20000, passo: 1, casas: 0, def: 100 },
    h: { nome: 'Altura', un: 'px', min: 1, max: 20000, passo: 1, casas: 0, def: 100 },
    raio: { nome: 'Arredondamento', un: '%', min: 0, max: 100, passo: 0.5, casas: 1, def: 0 },
    cLarg: { nome: 'Espessura do contorno', un: 'px', min: 0, max: 400, passo: 0.5, casas: 1, def: 8 },
    apIni: { nome: 'Aparar: início', un: '%', min: 0, max: 100, passo: 0.5, casas: 1, def: 0 },
    apFim: { nome: 'Aparar: fim', un: '%', min: 0, max: 100, passo: 0.5, casas: 1, def: 100 },
    apDesl: { nome: 'Aparar: deslocamento', un: '°', min: -3600, max: 3600, passo: 1, casas: 0, def: 0 },
    tLen: { nome: 'Tracejado: traço', un: 'px', min: 0, max: 2000, passo: 0.5, casas: 1, def: 0 },
    tVao: { nome: 'Tracejado: vão', un: 'px', min: 0, max: 2000, passo: 0.5, casas: 1, def: 20 },
    tDesl: { nome: 'Tracejado: deslocamento', un: 'px', min: -100000, max: 100000, passo: 1, casas: 0, def: 0 },
    pontas: { nome: 'Pontas', un: '', min: 3, max: 64, passo: 1, casas: 0, def: 5 },
    raioInt: { nome: 'Raio interno', un: '%', min: 1, max: 100, passo: 0.5, casas: 1, def: 45 },
};
const veMoClamp = (v, a, b) => Math.max(a, Math.min(b, v));
// versão do desenhista: entra no hash da camada desenhada (mudou o desenho, o cache antigo não serve)
const VE_MO_VERSAO = 'v7';

// ─────────────────────────── camadas: uid, nulo, procura ───────────────────────────
function veMoUid(c) {
    const o = c._o || c;
    if (!o.uid) o.uid = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    if (c !== o) c.uid = o.uid;
    return o.uid;
}
const veMoEhNulo = c => { const m = c && veMediaOf(c); return !!m && m.kind === 'nulo'; };

// A camada com esse uid: a que está no instante T; senão a primeira (a mãe vale mesmo fora do trecho dela, como no AE)
function veMoAchar(uid, T, lista = VE.clips) {
    if (!uid) return null;
    let primeira = null;
    for (const o of lista) {
        if (o.uid !== uid || veIsAudio(o)) continue;
        if (T >= o.st - VE_EPS && T < veEnd(o) - VE_EPS) return o;
        if (!primeira) primeira = o;
    }
    return primeira;
}

function veMoNome(c) {
    const m = veMediaOf(c);
    const n = c.nome ? c.nome : veIsTexto(c) ? veNomeTexto(c) : m && (m.kind === 'image' || m.kind === 'video' || m.comp) ? vePjNome(m) : veNomeClipe(c);
    return `${String(n).slice(0, 28)} · V${c.tr + 1}`;
}

// Camadas que outra camada usa como fosco de trilha (não aparecem)
function veMoFoscos() {
    const s = new Set();
    VE.clips.forEach(c => { if (c.mt && c.mt.uid && !veOculto(c)) s.add(c.mt.uid); });
    return s;
}

// ─────────────────────────── propriedades animáveis ───────────────────────────
// chave → {tipo, id, prop}
function veMoChave(chave) {
    const p = String(chave).split('.');
    if (p[0] === 'fx' && p.length === 3) return { tipo: 'fx', id: p[1], prop: p[2] };
    if (p[0] === 'mk' && p.length === 3) return { tipo: 'mk', id: p[1], prop: p[2] };
    if (p[0] === 'fm' && p.length === 2) return { tipo: 'fm', prop: p[1] };
    return null;
}

// Valor sem quadro-chave (o que fica guardado no efeito / máscara / forma)
function veMoFixoLer(c, chave) {
    const k = veMoChave(chave);
    if (!k) return 0;
    if (k.tipo === 'fx') {
        const f = (c.fx || []).find(x => x.id === k.id);
        return f && VE_FX[f.t] ? veFxValues(f)[k.prop] : 0;
    }
    if (k.tipo === 'mk') {
        const m = (c.mk || []).find(x => x.id === k.id);
        if (!m) return k.prop === 'cam' ? [] : 0;
        if (k.prop === 'cam') return m.pts || [];
        return m[k.prop] != null ? +m[k.prop] : VE_MO_MK[k.prop].def;
    }
    const d = VE_MO_FM[k.prop];
    return c.fm && c.fm[k.prop] != null ? +c.fm[k.prop] : d ? d.def : 0;
}

// Grava o valor fixo (cronômetro desligado, último ◆ apagado)
function veMoFixo(c, chave, v) {
    const k = veMoChave(chave);
    if (!k) return;
    if (k.tipo === 'fx') c.fx = (c.fx || []).map(f => f.id === k.id ? { ...f, v: { ...f.v, [k.prop]: v } } : f);
    else if (k.tipo === 'mk') c.mk = (c.mk || []).map(m => m.id === k.id ? { ...m, [k.prop === 'cam' ? 'pts' : k.prop]: v } : m);
    else c.fm = { ...(c.fm || {}), [k.prop]: v };
}

// Valor no instante T (sequência)
function veMoValor(c, chave, T = VE.playhead) {
    const ks = c && c.k && c.k[chave];
    if (ks && ks.length) return veKfValue(ks, veSrcAt(c, T));
    return veMoFixoLer(c, chave);
}

// Grupo da faixa de quadros-chave (editor-keyframes.js) de uma propriedade do motion
function veMoGrupo(g, c = typeof veKlDono === 'function' ? veKlDono() : null) {
    const k = veMoChave(g);
    if (!k) return null;
    let nome = g, d = { un: '', min: -1e9, max: 1e9, passo: 1, casas: 1 };
    if (k.tipo === 'fx') {
        const f = c && (c.fx || []).find(x => x.id === k.id), fd = f && VE_FX[f.t], p = fd && fd.params.find(x => x.k === k.prop);
        if (p) { nome = `${fd.nome} › ${p.nome}`; d = { un: p.un || '', min: p.min, max: p.max, passo: p.step || 1, casas: (p.step || 1) < 1 ? 1 : 0 }; }
    } else if (k.tipo === 'mk') {
        const m = c && (c.mk || []).find(x => x.id === k.id), md = VE_MO_MK[k.prop];
        if (md) { nome = `${m ? m.nome : 'Máscara'} › ${md.nome}`; d = md; }
    } else if (VE_MO_FM[k.prop]) { nome = `Forma › ${VE_MO_FM[k.prop].nome}`; d = VE_MO_FM[k.prop]; }
    return { g, nome, keys: [g], tecla: '', un: d.un || '', passo: d.passo || 1, casas: d.casas ?? 1, min: d.min, max: d.max, lista: !!d.lista };
}
// Grupos animados do clipe (para as faixas e o U)
function veMoGruposDe(c) {
    return Object.keys((c && c.k) || {}).filter(k => veMoChave(k) && veKfOn(c, k)).map(k => veMoGrupo(k, c)).filter(Boolean);
}
const veMoAnimado = (c, chave) => veKfOn(c, chave);

// Cronômetro de uma propriedade do motion: liga (◆ na agulha com o valor atual) ou desliga (fica o valor atual)
function veMoCronometro(c, chave) {
    if (!c || (typeof veKlPodeEditar === 'function' && !veKlPodeEditar(c))) return;
    vePushHistory();
    const v = veMoValor(c, chave), G = veMoGrupo(chave, c);
    if (veKfOn(c, chave)) {
        const k2 = { ...c.k };
        delete k2[chave];
        c.k = k2;
        if (!veHasKf(c)) delete c.k;
        veMoFixo(c, chave, v);
        VEKL.grupos.delete(chave);
        veToast(`${veT('Animação desligada')}: ${G ? G.nome : chave}`);
    } else {
        c.k = { ...(c.k || {}), [chave]: [{ t: veKfTime(c), v, i: 'lin' }] };
        VEKL.grupos.add(chave);   // como no AE: a propriedade animada aparece na timeline
        veToast(`${G ? G.nome : chave} ${veT('animada: mude o valor em outro ponto para criar movimento')}`);
    }
    VEKL.chave = '';
    veRefresh();
}

// ◆ ao lado da propriedade: põe (valor atual) ou tira o quadro-chave da agulha; sem animação, liga o cronômetro
function veMoKfPorTirar(c, chave) {
    if (!c) return;
    if (!veKfOn(c, chave)) { veMoCronometro(c, chave); return; }
    if (!veInClip(c)) { veToast('Leve a agulha para dentro do clipe'); return; }
    vePushHistory();
    const t = veKfTime(c), v = veMoValor(c, chave), ks = c.k[chave].map(q => ({ ...q })), j = veKfIndex(ks, t);
    if (j >= 0) ks.splice(j, 1); else { ks.push({ t, v, i: 'lin' }); ks.sort((a, b) => a.t - b.t); }
    const k2 = { ...c.k };
    if (ks.length) k2[chave] = ks; else { delete k2[chave]; veMoFixo(c, chave, v); }
    c.k = k2;
    if (!veHasKf(c)) delete c.k;
    veRefresh();
}

// Muda o valor (na agulha: com animação vira ◆; sem, muda o fixo)
function veMoDefinir(c, chave, v) {
    if (veKfOn(c, chave)) veApplyProps(c, { [chave]: v });
    else veMoFixo(c, chave, v);
}

// Botões ⏱ ◆ para pôr antes do nome de um parâmetro
function veMoSwHtml(chave) {
    const sw = typeof VE_KL_SW !== 'undefined' ? VE_KL_SW : '⏱';
    return `<span class="ve-mo-kfb"><button class="ve-mo-sw" data-mosw="${chave}" title="${veT('Animar (cronômetro)')}">${sw}</button>` +
        `<button class="ve-mo-kf" data-mokf="${chave}" title="${veT('Pôr/tirar quadro-chave na agulha')}"><i></i></button></span>`;
}
// Estado dos ⏱ ◆ (aceso = animado; ◆ cheio = há quadro-chave na agulha)
function veMoSwPintar(box, c) {
    const t = veKfTime(c), dentro = veInClip(c);
    box.querySelectorAll('[data-mosw]').forEach(b => {
        const ch = b.dataset.mosw, anim = veKfOn(c, ch);
        b.classList.toggle('on', anim);
        const kf = b.parentElement && b.parentElement.querySelector('[data-mokf]');
        if (kf) kf.classList.toggle('on', anim && dentro && veKfIndex(c.k[ch], t) >= 0);
    });
}

// Forma com as propriedades animadas no instante (editor-grafico.js veGrafDesenho)
function veMoFormaEm(c, T = VE.playhead) {
    if (!c.fm || !c.k) return c.fm;
    let fm = c.fm;
    Object.keys(VE_MO_FM).forEach(k => {
        const ks = c.k['fm.' + k];
        if (ks && ks.length) { if (fm === c.fm) fm = { ...c.fm }; fm[k] = veKfValue(ks, veSrcAt(c, T)); }
    });
    return fm;
}

// ─────────────────────────── matrizes (camada mãe) ───────────────────────────
// Camada → espaço da mãe (ou do quadro, sem mãe): Posição · Rotação · Escala · (−âncora)
function veMoLocal(c, T) {
    const p = veCaAplicar(c, veProps(c, T), T), sz = veMediaSize(c), [ax, ay] = veAnc(c, p, sz), k = p.sc / 100;
    return new DOMMatrix().translateSelf(p.x, p.y).rotateSelf(p.rot).scaleSelf(k * (p.sx == null ? 1 : p.sx), k * (p.sy == null ? 1 : p.sy)).translateSelf(-ax, -ay);
}
// Espaço da mãe → quadro (identidade sem mãe)
function veMoPaiMatriz(c, T = VE.playhead, d = 0) {
    const pai = c && c.pai && d < 24 ? veMoAchar(c.pai, T) : null;
    if (!pai || pai.uid === c.uid) return new DOMMatrix();
    return veMoPaiMatriz(pai, T, d + 1).multiply(veMoLocal(pai, T));
}
const veMoMundo = (c, T = VE.playhead) => veMoPaiMatriz(c, T).multiply(veMoLocal(c, T));

// a vira descendente de b se b for mãe dela? (não deixa fazer laço)
function veMoDescende(a, uidPai) {
    let u = uidPai, n = 0;
    while (u && n++ < 32) {
        if (u === a.uid) return true;
        const p = VE.clips.find(x => x.uid === u);
        u = p && p.pai;
    }
    return false;
}

// Liga/desliga a camada mãe sem a filha pular (como no AE): Posição, Escala e Rotação (fixas e ◆) passam para o
// espaço da mãe nova. Escala com mãe distorcida (escala diferente em X e Y) fica aproximada.
function veMoDefinirPai(c, uidPai) {
    if (!c) return false;
    const o = c._o || c;
    veMoUid(o);
    if (uidPai && (uidPai === o.uid || veMoDescende(o, uidPai))) { veToast('A camada mãe não pode ser a própria camada nem uma filha dela'); return false; }
    const T = VE.playhead;
    const antes = veMoPaiMatriz(o, T);                  // espaço atual → quadro
    const novo = { ...o, pai: uidPai || undefined };
    const depois = veMoPaiMatriz(novo, T);               // espaço novo → quadro
    const M = depois.inverse().multiply(antes);          // espaço atual → espaço novo
    const giro = Math.atan2(M.b, M.a) * 180 / Math.PI, esc = Math.hypot(M.a, M.b);
    const ponto = (x, y) => { const q = M.transformPoint({ x, y }); return [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100]; };
    const p = veStaticProps(o), [nx, ny] = ponto(p.x, p.y);
    o.p = { ...p, x: nx, y: ny, rot: Math.round((p.rot + giro) * 100) / 100, sc: Math.round(p.sc * esc * 100) / 100 };
    if (o.k) {
        const k2 = { ...o.k };
        // posição: cada ◆ de X ou de Y vira o ponto (x, y) daquele instante levado ao espaço novo
        const tx = (k2.x || []).map(q => q.t), ty = (k2.y || []).map(q => q.t);
        if (tx.length || ty.length) {
            const val = (k, t) => veKfOn(o, k) ? veKfValue(o.k[k], t) : p[k];
            if (k2.x) k2.x = k2.x.map(q => ({ ...q, v: ponto(q.v, val('y', q.t))[0] }));
            if (k2.y) k2.y = k2.y.map(q => ({ ...q, v: ponto(val('x', q.t), q.v)[1] }));
        }
        if (k2.rot) k2.rot = k2.rot.map(q => ({ ...q, v: Math.round((q.v + giro) * 100) / 100 }));
        if (k2.sc) k2.sc = k2.sc.map(q => ({ ...q, v: Math.round(q.v * esc * 100) / 100 }));
        o.k = k2;
    }
    if (uidPai) o.pai = uidPai; else delete o.pai;
    return true;
}

// ─────────────────────────── máscaras ───────────────────────────
const VE_MO_K = 0.5522847498;   // alça da elipse em Bézier (4 arcos)
function veMoPtsRet(x, y, w, h) { return [x, y, 0, 0, 0, 0, x + w, y, 0, 0, 0, 0, x + w, y + h, 0, 0, 0, 0, x, y + h, 0, 0, 0, 0]; }
function veMoPtsEli(x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = rx * VE_MO_K, ky = ry * VE_MO_K;
    // começa em cima e segue no sentido horário (como a elipse do AE)
    return [cx, y, -kx, 0, kx, 0, x + w, cy, 0, -ky, 0, ky, cx, y + h, kx, 0, -kx, 0, x, cy, 0, ky, 0, -ky];
}

// Monta o caminho no contexto: s = px do canvas por px da mídia, (ox, oy) = deslocamento
function veMoCaminho(x, pts, fech, s = 1, ox = 0, oy = 0) {
    const n = Math.floor((pts || []).length / 6);
    if (n < 2) return false;
    const P = j => [pts[j * 6] * s + ox, pts[j * 6 + 1] * s + oy];
    x.moveTo(...P(0));
    const seg = (a, b) => {
        const [ax, ay] = P(a), [bx, by] = P(b);
        const c1x = ax + pts[a * 6 + 4] * s, c1y = ay + pts[a * 6 + 5] * s, c2x = bx + pts[b * 6 + 2] * s, c2y = by + pts[b * 6 + 3] * s;
        if (c1x === ax && c1y === ay && c2x === bx && c2y === by) x.lineTo(bx, by);
        else x.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by);
    };
    for (let j = 1; j < n; j++) seg(j - 1, j);
    if (fech) { seg(n - 1, 0); x.closePath(); }
    return true;
}

function veMoTela(c, nome, w, h) {
    const o = c._o || c;
    let t = VEMO.telas.get(o);
    if (!t) { t = {}; VEMO.telas.set(o, t); }
    let cv = t[nome];
    if (!cv) { cv = t[nome] = document.createElement('canvas'); }
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return cv;
}

const veMoMkAtivas = c => (c.mk || []).filter(m => m.on !== false && m.modo !== 'nenhum' && m.fech && (m.pts || []).length >= 18);

// Aplica as máscaras no quadro da camada (antes dos efeitos): devolve um canvas novo (ou src, sem máscara ativa).
// szd = tamanho desenhado (mídia + margem pd do texto animado); as máscaras ficam em px da mídia.
function veMoMascarar(c, src, szd, pd, T) {
    const ms = veMoMkAtivas(c);
    if (!ms.length || !src) return src;
    const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
    if (!sw || !sh) return src;
    // resolução de trabalho: a do quadro que veio, até 2048 no lado maior
    const q = Math.min(1, 2048 / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * q)), h = Math.max(1, Math.round(sh * q));
    const s = w / szd.w, o = pd * s;
    const M = veMoTela(c, 'mk', w, h), mx = M.getContext('2d');
    const F = veMoTela(c, 'mkf', w, h), fx = F.getContext('2d');
    mx.setTransform(1, 0, 0, 1, 0, 0);
    mx.globalCompositeOperation = 'source-over';
    mx.globalAlpha = 1;
    mx.clearRect(0, 0, w, h);
    // começa cheia se a primeira máscara tira (Subtrair/Interseção), como no AE
    if (ms[0].modo === 'sub' || ms[0].modo === 'inter') { mx.fillStyle = '#fff'; mx.fillRect(0, 0, w, h); }
    ms.forEach(m => {
        const pts = veMoValor(c, `mk.${m.id}.cam`, T), pena = Math.max(0, veMoValor(c, `mk.${m.id}.pena`, T)) * s;
        const op = veMoClamp(veMoValor(c, `mk.${m.id}.op`, T), 0, 100) / 100, exp = veMoValor(c, `mk.${m.id}.exp`, T) * s;
        if (op <= 0) return;
        fx.setTransform(1, 0, 0, 1, 0, 0);
        fx.globalCompositeOperation = 'source-over';
        fx.clearRect(0, 0, w, h);
        fx.beginPath();
        if (!veMoCaminho(fx, pts, true, s, o, o)) return;
        fx.fillStyle = fx.strokeStyle = '#fff';
        fx.lineJoin = 'round';
        fx.fill();
        if (exp > 0.01) { fx.lineWidth = exp * 2; fx.stroke(); }
        else if (exp < -0.01) { fx.globalCompositeOperation = 'destination-out'; fx.lineWidth = -exp * 2; fx.stroke(); fx.globalCompositeOperation = 'source-over'; }
        if (m.inv) { fx.globalCompositeOperation = 'xor'; fx.fillRect(0, 0, w, h); fx.globalCompositeOperation = 'source-over'; }
        mx.globalAlpha = op;
        mx.globalCompositeOperation = { sub: 'destination-out', inter: 'destination-in', dif: 'xor' }[m.modo] || 'source-over';
        if (pena >= 0.3) mx.filter = `blur(${(pena / 2).toFixed(2)}px)`;
        mx.drawImage(F, 0, 0);
        mx.filter = 'none';
        mx.globalAlpha = 1;
        mx.globalCompositeOperation = 'source-over';
    });
    const R = veMoTela(c, 'mkr', w, h), rx = R.getContext('2d');
    rx.setTransform(1, 0, 0, 1, 0, 0);
    rx.globalCompositeOperation = 'source-over';
    rx.clearRect(0, 0, w, h);
    rx.drawImage(src, 0, 0, w, h);
    rx.globalCompositeOperation = 'destination-in';
    rx.drawImage(M, 0, 0);
    rx.globalCompositeOperation = 'source-over';
    if (src._pad) R._pad = src._pad;
    return R;
}

function veMoNovaMascara(c, forma, x, y, w, h) {
    const o = c._o || c, n = (o.mk || []).length + 1;
    const pts = forma === 'eli' ? veMoPtsEli(x, y, w, h) : veMoPtsRet(x, y, w, h);
    const m = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nome: `${veT('Máscara')} ${n}`, modo: 'add', inv: false,
                on: true, fech: true, pts: pts.map(v => Math.round(v * 100) / 100), pena: 0, op: 100, exp: 0 };
    o.mk = [...(o.mk || []), m];
    return m;
}

// ─────────────────────────── desenho ───────────────────────────
const veMoPrecisa = c => !!(c && (c.pai || (c.mt && c.mt.uid) || c.mb || veMoMkAtivas(c).length || (c.fx && c.fx.some(f => f.t === 'mo_eco' && f.on !== false))));

// A camada sozinha no contexto x (já na escala do quadro), no instante T
function veMoUm(x, c, src, pv, T, fatorOp = 1) {
    const p = veCaAplicar(c, veProps(c, T), T), sz = veMediaSize(c);
    const pd = src && src._pad || 0, szd = pd ? { w: sz.w + 2 * pd, h: sz.h + 2 * pd } : sz;
    let s = src;
    if (s !== 'offline') {
        s = veMoMascarar(c, s, szd, pd, T);
        s = veFxRender(c, s, szd, pv * p.sc / 100, T);
    }
    x.save();
    x.globalAlpha = veMoClamp(p.op / 100 * fatorOp, 0, 1);
    if (s !== 'offline' && typeof veSombraDe === 'function') veSombraAplicar(x, veSombraDe(c, T), pv);
    if (c.pai) { const P = veMoPaiMatriz(c, T); x.transform(P.a, P.b, P.c, P.d, P.e, P.f); }
    x.translate(p.x, p.y);
    x.rotate(p.rot * Math.PI / 180);
    const k = p.sc / 100;
    x.scale(k * (p.sx == null ? 1 : p.sx), k * (p.sy == null ? 1 : p.sy));
    const [ax, ay] = veAnc(c, p, sz);
    if (s === 'offline') { x.translate(-ax, -ay); veDrawOfflineMedia(x, sz.w, sz.h, vePjNome(veMediaOf(c))); }
    else { const mm = s._mais || 0; x.drawImage(s, -ax - pd - mm, -ay - pd - mm, szd.w + 2 * mm, szd.h + 2 * mm); }
    x.restore();
}

// Quantas amostras o desfoque de movimento precisa: o quanto os cantos andam no meio quadro do obturador
function veMoAmostras(c, t, pv) {
    if (!c.mb) return 1;
    const fps = VE.fps || 30, ab = 0.5 / fps, sz = veMediaSize(c);
    const A = veMoMundo(c, t - ab / 2), B = veMoMundo(c, t + ab / 2);
    let d = 0;
    [[0, 0], [sz.w, 0], [sz.w, sz.h], [0, sz.h], [sz.w / 2, sz.h / 2]].forEach(([u, v]) => {
        const a = A.transformPoint({ x: u, y: v }), b = B.transformPoint({ x: u, y: v });
        d = Math.max(d, Math.hypot(a.x - b.x, a.y - b.y) * pv);
    });
    if (d < 0.75) return 1;
    return Math.round(veMoClamp(d / 1.5, 3, VEMO.assando ? 48 : 16));
}

function veMoDesenhar(ctx, cv, c, src, pv, t, itens) {
    const mt = c.mt && c.mt.uid && VE_MO_FOSCOS[c.mt.modo] ? c.mt : null;
    const n = veMoAmostras(c, t, pv), gco = src !== 'offline' && veBmGco(c), eco = src !== 'offline' && veMoEco(c, t);
    // a camada no instante + os ecos: cópias de instantes anteriores, cada vez mais fracas (o 1º com a opacidade dada)
    const comEco = (desenha, d = 0) => {
        if (!eco) { desenha(t + d, 1); return; }
        const n = Math.round(eco.n), a = eco.dec / 100, lista = [];
        for (let j = n; j >= 1; j--) lista.push([t + d - j * eco.dt, a * Math.pow(a, j - 1)]);
        if (!eco.frente) { lista.forEach(([T, f]) => desenha(T, f)); desenha(t + d, 1); }
        else { desenha(t + d, 1); lista.reverse().forEach(([T, f]) => desenha(T, f)); }
    };
    if (!mt && n <= 1) {
        if (gco) { ctx.save(); ctx.globalCompositeOperation = gco; }
        comEco((T, f) => veMoUm(ctx, c, src, pv, T, f));
        if (gco) ctx.restore();
        return;
    }
    const base = ctx.getTransform(), W = cv.width, H = cv.height;
    const L = veMoTela(c, 'L', W, H), lx = L.getContext('2d');
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.globalCompositeOperation = 'source-over';
    lx.globalAlpha = 1;
    lx.clearRect(0, 0, W, H);
    lx.imageSmoothingQuality = 'high';
    if (n <= 1) { lx.setTransform(base); comEco((T, f) => veMoUm(lx, c, src, pv, T, f)); }
    else {
        // obturador de 180° centrado no quadro: média das amostras (somar com peso 1/n no alfa pré-multiplicado)
        const S = veMoTela(c, 'S', W, H), sx = S.getContext('2d'), ab = 0.5 / (VE.fps || 30);
        sx.imageSmoothingQuality = 'high';
        for (let j = 0; j < n; j++) {
            const Tj = t - ab / 2 + ab * (j + 0.5) / n;
            sx.setTransform(1, 0, 0, 1, 0, 0);
            sx.clearRect(0, 0, W, H);
            sx.setTransform(base);
            comEco((T, f) => veMoUm(sx, c, src, pv, T, f), Tj - t);
            lx.setTransform(1, 0, 0, 1, 0, 0);
            lx.globalCompositeOperation = 'lighter';
            lx.globalAlpha = 1 / n;
            lx.drawImage(S, 0, 0);
        }
        lx.globalAlpha = 1;
        lx.globalCompositeOperation = 'source-over';
    }
    if (mt) {
        const M = veMoTela(c, 'M', W, H), mx = M.getContext('2d');
        mx.setTransform(1, 0, 0, 1, 0, 0);
        mx.clearRect(0, 0, W, H);
        const it = (itens || []).find(i => i.c.uid === mt.uid && i.c !== c);
        if (it && it.src) { mx.setTransform(base); mx.imageSmoothingQuality = 'high'; veDesenharItens(mx, M, [it], pv, t, true); }
        if (mt.modo === 'luma' || mt.modo === 'lumainv') {
            // luminância do fosco vira alfa (vezes o alfa dele)
            try {
                const d = mx.getImageData(0, 0, W, H), p = d.data;
                for (let i = 0; i < p.length; i += 4) {
                    const a = p[i + 3];
                    p[i + 3] = a ? Math.round((0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) * a / 255) : 0;
                    p[i] = p[i + 1] = p[i + 2] = 255;
                }
                mx.putImageData(d, 0, 0);
            } catch (e) { /* quadro sem CORS: fica o alfa */ }
        }
        lx.setTransform(1, 0, 0, 1, 0, 0);
        lx.globalCompositeOperation = mt.modo === 'alfainv' || mt.modo === 'lumainv' ? 'destination-out' : 'destination-in';
        lx.drawImage(M, 0, 0);
        lx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (gco) ctx.globalCompositeOperation = gco;
    ctx.drawImage(L, 0, 0);
    ctx.restore();
}

// ─────────────────────────── exportação: camada desenhada ───────────────────────────
// Esta camada precisa ser desenhada quadro a quadro na exportação?
function veMoTem(c) {
    if (!c || veIsAudio(c) || veMoEhNulo(c)) return false;
    if (veMoPrecisa(c)) return true;
    // parâmetro animado: os que a exportação faz sozinha (animaFF, ex. Desfoque) não precisam de camada desenhada
    const soFF = k => {
        const q = veMoChave(k);
        if (!q || q.tipo !== 'fx' || veIsAdj(c)) return false;
        const f = (c.fx || []).find(x => x.id === q.id), d = f && VE_FX[f.t];
        return !!(d && d.animaFF && d.animaFF.includes(q.prop));
    };
    if (c.k && Object.keys(c.k).some(k => veMoChave(k) && veKfOn(c, k) && !soFF(k))) return true;
    // efeito só de desenho; numa camada de ajuste, os que o ffmpeg faz (ajusteFF) seguem pela exportação normal
    return (c.fx || []).some(f => f.on !== false && VE_FX[f.t] && VE_FX[f.t].soDesenho && !(veIsAdj(c) && VE_FX[f.t].ajusteFF));
}
// Não sai na exportação (nulo; camada usada como fosco: vai dentro da camada desenhada)
function veMoFora(c) {
    if (veMoEhNulo(c)) return true;
    return !!c.uid && VE.clips.some(o => o.mt && o.mt.uid === c.uid && !veOculto(o));
}

function veMoHash(s) {
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) {
        const ch = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
        h2 = Math.imul(h2 ^ ch, 2246822519) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

// Tudo o que muda o desenho da camada: ela, a cadeia de mães, o fosco (e a cadeia dele), as mídias
function veMoAssinatura(c, lista) {
    const juntar = new Set(), fila = [c];
    while (fila.length) {
        const x = fila.shift();
        if (!x || juntar.has(x)) continue;
        juntar.add(x);
        if (x.pai) lista.filter(o => o.uid === x.pai).forEach(o => fila.push(o));
        if (x.mt && x.mt.uid) lista.filter(o => o.uid === x.mt.uid).forEach(o => fila.push(o));
    }
    const limpo = (k, v) => (k && k[0] === '_' ? undefined : v);
    return JSON.stringify([...juntar].map(x => {
        const m = veMediaOf(x) || {};
        return [x, { k: m.kind, p: m.path, f: m.fill, w: m.w, h: m.h, d: m.dur }];
    }), limpo);
}

// Vídeo para desenhar a camada fora da prévia: o arquivo original (ou a cópia de edição), quadro exato
async function veMoVideo(m) {
    VEMO.videos = VEMO.videos || new Map();
    if (VEMO.videos.has(m.id)) { const v = VEMO.videos.get(m.id); VEMO.videos.delete(m.id); VEMO.videos.set(m.id, v); return v; }
    // o WebView só abre uns poucos vídeos ao mesmo tempo: com 10 guardados o 11º nunca carregava e a exportação parava
    // ali para sempre (GaIA V2). Ficam só os 3 usados por último; o resto fecha.
    for (const [id, velho] of [...VEMO.videos].slice(0, Math.max(0, VEMO.videos.size - 2))) {
        VEMO.videos.delete(id);
        try { velho.removeAttribute('src'); velho.load(); } catch (e) { /* já fechado */ }
    }
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    let url = null;
    try { const r = m.path && await window.pywebview.api.ve_3d_url(m.path); if (r && r.success) url = r.url; } catch (e) { /* cópia de edição */ }
    const tentar = u => new Promise(res => {
        if (!u) { res(false); return; }
        const ok = () => { limpar(); res(true); }, erro = () => { limpar(); res(false); };
        const to = setTimeout(erro, 30000);   // sem resposta: tenta a outra cópia e, se nada, erro em vez de travar
        const limpar = () => { clearTimeout(to); v.removeEventListener('loadeddata', ok); v.removeEventListener('error', erro); };
        v.addEventListener('loadeddata', ok); v.addEventListener('error', erro);
        v.src = u; v.load();
    });
    if (!(await tentar(url)) && !(await tentar(m.url))) throw new Error(veT('não abriu o vídeo da camada'));
    VEMO.videos.set(m.id, v);
    return v;
}
function veMoBuscar(v, t) {
    return new Promise(res => {
        if (Math.abs(v.currentTime - t) < 1e-3 && v.readyState >= 2) { res(); return; }
        const fim = () => { v.removeEventListener('seeked', fim); clearTimeout(to); res(); };
        const to = setTimeout(fim, 4000);
        v.addEventListener('seeked', fim);
        v.currentTime = Math.max(0, t);
    });
}

// O que desenhar de uma camada fora da prévia (imagem, texto, gráfico; vídeo: busca o quadro)
async function veMoFonte(c, T, f) {
    const m = veMediaOf(c);
    if (!m || veMediaOffline(m)) return 'offline';
    if (m.kind === 'nulo') return 'nulo';
    if (veIsAdj(c)) return 'ajuste';
    // texto animado e forma animada dependem do instante: desenhados com a agulha no quadro (sem esperar nada no meio)
    const noInstante = fn => { const ph = VE.playhead; VE.playhead = T; try { return fn(); } finally { VE.playhead = ph; } };
    if (veIsTexto(c)) return noInstante(() => (typeof veTxaCanvas === 'function' && veTxaCanvas(c, f)) || veTxCanvas(c, f).cv);
    if (veEhGrafico(c)) {
        // o desenho guardado é um só canvas por camada: copia (a camada e o fosco podem ser a mesma forma em instantes diferentes)
        const g = noInstante(() => veGrafDesenho(c)), cp = document.createElement('canvas');
        cp.width = g.width; cp.height = g.height; cp.getContext('2d').drawImage(g, 0, 0);
        return cp;
    }
    if (veIsImage(c)) {
        for (let k = 0; k < 100 && m.img && !(m.img.complete && m.w); k++) await new Promise(r => setTimeout(r, 50));
        return m.img && m.img.complete ? m.img : null;
    }
    const v = await veMoVideo(m);
    await veMoBuscar(v, veSrcAt(c, T));
    return v;
}

// A mesma camada pedida de novo enquanto é desenhada (a prévia renderizada e a exportação ao mesmo tempo): espera a
// que já está rodando em vez de abrir outra na mesma pasta
async function veMoAssarUm(c, lista, como, aviso) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_c3d_inicio) return null;
    const fps = VE.fps || 30;
    const [W, H] = como(() => [VE.seqW, VE.seqH]);
    const sig = 'mo.' + veMoHash(veMoAssinatura(c, lista) + `|${W}x${H}@${fps}|${VE_MO_VERSAO}`);
    VEMO.emCurso = VEMO.emCurso || new Map();
    if (VEMO.emCurso.has(sig)) return VEMO.emCurso.get(sig);
    const p = veMoAssarSig(c, lista, como, aviso, sig, W, H, fps);
    VEMO.emCurso.set(sig, p);
    try { return await p; } finally { VEMO.emCurso.delete(sig); }
}

async function veMoAssarSig(c, lista, como, aviso, sig, W, H, fps) {
    const api = window.pywebview.api, n = Math.max(1, Math.round(veLen(c) * fps));
    const ini = await api.ve_c3d_inicio(vePrPrefs().dir, sig);
    if (!ini || !ini.success) throw new Error((ini && ini.error) || 'não abriu o render');
    if (ini.pronto) return { mov: ini.path };
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const escalas = [veStaticProps(c).sc].concat(veKfOn(c, 'sc') ? c.k.sc.map(q => q.v) : []);
    const f = Math.min(4, Math.max(1, Math.max(...escalas) / 100));
    const fo = c.mt && c.mt.uid ? lista.find(o => o.uid === c.mt.uid) : null;
    VEMO.assando++;
    try {
        for (let i = 0; i < n; i++) {
            const T = c.st + i / fps;
            const fosco = fo ? veMoAchar(c.mt.uid, T, lista) : null;
            const src = await veMoFonte(c, T, f);
            const srcF = fosco && T >= fosco.st - VE_EPS && T < veEnd(fosco) - VE_EPS ? await veMoFonte(fosco, T, f) : null;
            como(() => {
                const ph = VE.playhead;
                VE.playhead = T;   // quadros-chave, texto animado, gráficos no instante do quadro
                try {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, W, H);
                    ctx.imageSmoothingQuality = 'high';
                    const itens = [{ c, src }];
                    if (srcF) itens.push({ c: fosco, src: srcF });
                    veDesenharItens(ctx, cv, itens, 1, T);
                } finally { VE.playhead = ph; }
            });
            const b = veCanvasPng(cv);
            const rr = await fetch(ini.url + `q${String(i).padStart(5, '0')}.png`, { method: 'POST', body: b, headers: { 'Content-Type': 'image/png' } });
            if (!rr.ok && rr.status !== 204) throw new Error(`envio do quadro ${i}: HTTP ${rr.status}`);
            if (i % 24 === 23) await api.ve_c3d_lote(ini.sessao, ini.pasta);
            if (aviso && i % 6 === 0) aviso(Math.round(i * 100 / n));
        }
    } finally { VEMO.assando--; }
    const r = await api.ve_c3d_fim(vePrPrefs().dir, sig, ini.sessao, ini.pasta, fps, n);
    if (!r || !r.success) throw new Error((r && r.error) || 'não montou o vídeo da camada');
    return { mov: r.path };
}

// Chamado pela preparação da exportação (veTxPngs): cada camada do motion vira o vídeo desenhado
async function veMoAssar(mapa, filtro, clips = VE.clips) {
    const seq = clips === VE.clips ? null : (VE.sequences || []).find(s => s.clips === clips);
    const como = fn => (seq && typeof veCompComo === 'function' ? veCompComo(seq, fn) : fn());
    const lista = como(() => clips.filter(c => veMoTem(c) && !veMoFora(c) && !veOculto(c) && (!filtro || filtro(c))));
    for (let j = 0; j < lista.length; j++) {
        const c = lista[j];
        try {
            const r = await veMoAssarUm(c, clips, como, pct => {
                const msg = `${veT('Desenhando camadas de motion')} ${j + 1}/${lista.length}: ${pct}%`;
                const el = typeof $ve === 'function' && $ve('ve-exp-msg');
                if (typeof veFilaPrepMsg === 'function' && VEFILA.prepAtual) veFilaPrepMsg(msg);   // item em preparo na fila
                else if (el) el.textContent = msg; else if (pct === 0) veToast(msg);
            });
            if (r) mapa.set(c, r);
        } catch (e) {
            veToast(`${veT('Falha ao desenhar a camada')} ${veMoNome(c)}: ${(e && e.message) || e}`);
            throw e;
        }
    }
}

// ─────────────────────────── painel (Controles de efeito) ───────────────────────────
function veMoPainelChave(c) {
    return [c.uid, c.pai, c.mt && c.mt.uid, c.mt && c.mt.modo, c.mb ? 1 : 0, !!c.fm, ...(c.mk || []).map(m => [m.id, m.nome, m.modo, m.inv ? 1 : 0, m.on === false ? 0 : 1, m.fech ? 1 : 0].join(':')),
            VE.clips.filter(o => !veIsAudio(o)).map(o => o.uid + o.tr).join(',')].join('|');
}

function veMoLinhaNum(chave, nome, d) {
    return `<div class="ve-prop ve-mo-num">
        <label>${veMoSwHtml(chave)}${veT(nome)}</label>
        <input type="range" min="${d.min}" max="${d.max}" step="${d.passo}" data-mok="${chave}">
        <span class="ve-prop-num"><input type="number" min="${d.min}" max="${d.max}" step="${d.passo}" data-mok="${chave}"><i>${d.un}</i></span>
    </div>`;
}

function veMoPainelHtml(c) {
    if (veIsAudio(c)) return '';
    const o = c._o || c;
    // candidatas a mãe e a fosco: as outras camadas de imagem (uma por uid; pedaços de um corte valem como uma)
    const vistas = new Set(), outras = [];
    VE.clips.forEach(x => {
        if (veIsAudio(x) || x === o || (x.uid && x.uid === o.uid)) return;
        const u = x.uid || '';
        if (u && vistas.has(u)) return;
        if (u) vistas.add(u);
        outras.push(x);
    });
    outras.sort((a, b) => b.tr - a.tr || a.st - b.st);
    const opc = (sel, fil) => outras.filter(fil || (() => true)).map(x => `<option value="${VE.clips.indexOf(x)}"${x.uid && x.uid === sel ? ' selected' : ''}>${veMoNome(x)}</option>`).join('');
    const mk = (o.mk || []).map(m => `
        <div class="ve-fxe ve-mo-mk${m.on === false ? ' off' : ''}${VEMO.selMk && VEMO.selMk.id === m.id ? ' sel' : ''}" data-mk="${m.id}">
            <div class="ve-fxe-head">
                <button class="ve-fxe-on" data-mka="on" title="${veT('Ligar/desligar máscara')}">mk</button>
                <b data-mka="sel" title="${veT('Selecionar no monitor (arraste os pontos)')}">${m.nome}</b>
                <select data-mkm="modo" title="${veT('Modo da máscara')}">${Object.entries(VE_MO_MODOS).map(([k, n]) => `<option value="${k}"${m.modo === k ? ' selected' : ''}>${veT(n)}</option>`).join('')}</select>
                <label class="ve-mo-inv" title="${veT('Inverter')}"><input type="checkbox" data-mkm="inv"${m.inv ? ' checked' : ''}>${veT('Inv.')}</label>
                <button data-mka="del" title="${veT('Apagar máscara')}">✕</button>
            </div>
            <div class="ve-fxe-body">
                <div class="ve-prop ve-mo-cam"><label>${veMoSwHtml(`mk.${m.id}.cam`)}${veT('Caminho')}${m.fech ? '' : ` <small>(${veT('aberto: feche clicando no 1º ponto')})</small>`}</label></div>
                ${veMoLinhaNum(`mk.${m.id}.pena`, 'Pena', VE_MO_MK.pena)}
                ${veMoLinhaNum(`mk.${m.id}.op`, 'Opacidade', VE_MO_MK.op)}
                ${veMoLinhaNum(`mk.${m.id}.exp`, 'Expansão', VE_MO_MK.exp)}
            </div>
        </div>`).join('');
    const forma = c.fm ? `
        <div class="ve-fxc-title">${veT('Forma')}</div>
        <div class="ve-fxe ve-mo-forma"><div class="ve-fxe-body">
            <div class="ve-mo-linha"><label>${veT('Tipo')}</label><select data-mofm="t">${Object.entries(VE_FORMAS).map(([k, n]) => `<option value="${k}"${c.fm.t === k ? ' selected' : ''}>${veT(n)}</option>`).join('')}</select>
                <label class="ve-mo-inv"><input type="checkbox" data-mofm="pOn"${c.fm.pOn === false ? '' : ' checked'}>${veT('Preenchimento')}</label>
                <label class="ve-mo-inv"><input type="checkbox" data-mofm="cOn"${c.fm.cOn ? ' checked' : ''}>${veT('Contorno')}</label>
                <label class="ve-mo-inv"><input type="checkbox" data-mofm="pontaR"${c.fm.pontaR ? ' checked' : ''}>${veT('Ponta redonda')}</label></div>
            ${['w', 'h', 'raio', 'cLarg'].concat(c.fm.t === 'est' || c.fm.t === 'pol' ? ['pontas'] : []).concat(c.fm.t === 'est' ? ['raioInt'] : [])
                .concat(['apIni', 'apFim', 'apDesl', 'tLen', 'tVao', 'tDesl']).map(k => veMoLinhaNum('fm.' + k, VE_MO_FM[k].nome, VE_MO_FM[k])).join('')}
        </div></div>` : '';
    return `<div class="ve-mo">
        <div class="ve-fxc-title">${veT('Camada (motion)')}</div>
        <div class="ve-mo-linha"><label>${veT('Camada mãe')}</label><select data-mo="pai"><option value="">${veT('Nenhuma')}</option>${opc(o.pai)}</select></div>
        <div class="ve-mo-linha"><label>${veT('Fosco de trilha')}</label>
            <select data-mo="mtmodo"><option value="">${veT('Nenhum')}</option>${Object.entries(VE_MO_FOSCOS).map(([k, n]) => `<option value="${k}"${o.mt && o.mt.modo === k ? ' selected' : ''}>${veT(n)}</option>`).join('')}</select>
            <select data-mo="mtuid"${o.mt ? '' : ' disabled'}><option value="">${veT('(camada acima)')}</option>${opc(o.mt && o.mt.uid, x => !veMoEhNulo(x))}</select></div>
        <label class="ve-prop-bool"><input type="checkbox" data-mo="mb"${o.mb ? ' checked' : ''}> ${veT('Desfoque de movimento')}</label>
        <div class="ve-mo-linha ve-mo-botoes">
            <button class="ve-btn ve-btn-sm" data-moa="mkret" title="${veT('Máscara retangular do tamanho da camada (ou arraste com a ferramenta Máscara)')}">+ ${veT('Máscara')} ▭</button>
            <button class="ve-btn ve-btn-sm" data-moa="mkeli" title="${veT('Máscara elíptica do tamanho da camada')}">+ ${veT('Máscara')} ◯</button>
            <button class="ve-btn ve-btn-sm" data-moa="nulo" title="${veT('Nulo na agulha (camada de controle invisível) e esta camada presa a ele')}">+ ${veT('Nulo')}</button>
        </div>
        ${mk}${forma}
    </div>`;
}

function veMoPainelValores(box, c) {
    box.querySelectorAll('[data-mok]').forEach(inp => {
        if (inp.ownerDocument.activeElement === inp) return;
        const v = veMoValor(c, inp.dataset.mok);
        inp.value = String(Math.round(+v * 100) / 100);
    });
    veMoSwPintar(box, c);
}

function veMoPainelIniciar() {
    const box = $ve('ve-fxc');
    if (!box) return;
    box.addEventListener('click', e => {
        const c = VE.clips[VE.sel];
        if (!c) return;
        const sw = e.target.closest('[data-mosw]'), kf = e.target.closest('[data-mokf]'), a = e.target.closest('[data-moa]'), mka = e.target.closest('[data-mka]');
        if (sw) { veMoCronometro(c, sw.dataset.mosw); return; }
        if (kf) { veMoKfPorTirar(c, kf.dataset.mokf); return; }
        if (a) {
            const sz = veMediaSize(c);
            if (a.dataset.moa === 'mkret' || a.dataset.moa === 'mkeli') {
                if (veLocked(c)) { veAvisoBloqueio(); return; }
                vePushHistory();
                const m = veMoNovaMascara(c, a.dataset.moa === 'mkeli' ? 'eli' : 'ret', 0, 0, sz.w, sz.h);
                VEMO.selMk = { c: c._o || c, id: m.id };
                veRefresh();
            } else if (a.dataset.moa === 'nulo') VEMO_API.nulo({ prender: [VE.sel] });
            return;
        }
        if (mka) {
            const id = mka.closest('[data-mk]').dataset.mk, o = c._o || c;
            if (mka.dataset.mka === 'sel') { VEMO.selMk = { c: o, id }; VEFX.key = ''; veRefresh(); return; }
            vePushHistory();
            if (mka.dataset.mka === 'del') {
                o.mk = (o.mk || []).filter(m => m.id !== id);
                if (!o.mk.length) delete o.mk;
                if (o.k) { const k2 = { ...o.k }; Object.keys(k2).filter(k => k.startsWith(`mk.${id}.`)).forEach(k => delete k2[k]); o.k = k2; if (!veHasKf(o)) delete o.k; }
                if (VEMO.selMk && VEMO.selMk.id === id) VEMO.selMk = null;
            } else if (mka.dataset.mka === 'on') o.mk = o.mk.map(m => m.id === id ? { ...m, on: m.on === false } : m);
            veRefresh();
        }
    });
    box.addEventListener('input', e => {
        const c = VE.clips[VE.sel], el = e.target;
        if (!c) return;
        if (el.dataset.mok != null) {
            const v = parseFloat(String(el.value).replace(',', '.'));
            if (!isFinite(v)) return;
            if (!VE._moEdit) { vePushHistory(); VE._moEdit = true; }
            veMoDefinir(c._o || c, el.dataset.mok, v);
            box.querySelectorAll(`[data-mok="${el.dataset.mok}"]`).forEach(x => { if (x !== el) x.value = String(v); });
            veMoSwPintar(box, c);
            veCacheInvalidate();
            veDrawMonitorSoon();
            if (veHasKf(c)) veDraw();
        }
    });
    box.addEventListener('change', e => {
        const c = VE.clips[VE.sel], el = e.target;
        if (!c) return;
        const o = c._o || c;
        if (el.dataset.mok != null) { VE._moEdit = false; veRefresh(); return; }
        if (el.dataset.mo === 'pai') {
            vePushHistory();
            const alvo = el.value === '' ? null : VE.clips[+el.value];
            if (veMoDefinirPai(o, alvo ? veMoUid(alvo) : null)) veToast(alvo ? `${veT('Camada mãe')}: ${veMoNome(alvo)}` : veT('Sem camada mãe'));
            veRefresh();
        } else if (el.dataset.mo === 'mtmodo') {
            vePushHistory();
            if (!el.value) delete o.mt;
            else {
                let uid = o.mt && o.mt.uid;
                if (!uid) {   // padrão do AE: a camada logo acima
                    const acima = VE.clips.filter(x => !veIsAudio(x) && x.tr > o.tr && x.st < veEnd(o) && veEnd(x) > o.st).sort((a, b) => a.tr - b.tr)[0];
                    if (!acima) { veToast('Ponha a camada que será o fosco na trilha de cima (ou escolha uma na lista)'); }
                    uid = acima ? veMoUid(acima) : null;
                }
                o.mt = { modo: el.value, uid };
            }
            veRefresh();
        } else if (el.dataset.mo === 'mtuid') {
            vePushHistory();
            const alvo = el.value === '' ? null : VE.clips[+el.value];
            o.mt = { modo: (o.mt && o.mt.modo) || 'alfa', uid: alvo ? veMoUid(alvo) : null };
            veRefresh();
        } else if (el.dataset.mo === 'mb') {
            vePushHistory();
            if (el.checked) o.mb = 1; else delete o.mb;
            veRefresh();
        } else if (el.dataset.mkm) {
            const id = el.closest('[data-mk]').dataset.mk;
            vePushHistory();
            o.mk = o.mk.map(m => m.id === id ? { ...m, [el.dataset.mkm]: el.type === 'checkbox' ? el.checked : el.value } : m);
            veRefresh();
        } else if (el.dataset.mofm) {
            vePushHistory();
            o.fm = { ...o.fm, [el.dataset.mofm]: el.type === 'checkbox' ? el.checked : el.value };
            if (typeof VEPP !== 'undefined') VEPP.chave = '';
            veRefresh();
        }
    });
}

// ─────────────────────────── monitor: máscaras e caneta ───────────────────────────
const veMoCor = j => ['#ffd400', '#4fc3ff', '#ff5fd2', '#7dff6a', '#ff8a3d'][j % 5];

// Desenha os caminhos das máscaras da camada selecionada (e a caneta em andamento) por cima do monitor
function veMoOverlay(ctx, pv) {
    const c = VE.clips[VE.sel];
    if (!c || veIsAudio(c) || !(c.mk || []).length || !veTfVisivel(c)) return;
    const q = veTxQuadroTela(), tela = pv / q.s, M = veMoMundo(c), o = c._o || c;
    const P = (x, y) => { const r = M.transformPoint({ x, y }); return [r.x * pv, r.y * pv]; };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    (c.mk || []).forEach((m, j) => {
        const pts = veMoValor(c, `mk.${m.id}.cam`), n = Math.floor(pts.length / 6);
        if (n < 1) return;
        const sel = VEMO.selMk && VEMO.selMk.c === o && VEMO.selMk.id === m.id;
        ctx.strokeStyle = veMoCor(j);
        ctx.lineWidth = (sel ? 1.6 : 1.1) * tela;
        ctx.globalAlpha = m.on === false ? 0.4 : 1;
        ctx.beginPath();
        const abs = [];
        for (let i = 0; i < n; i++) abs.push(i * 6);
        const V = i => P(pts[i * 6], pts[i * 6 + 1]);
        const cOut = i => P(pts[i * 6] + pts[i * 6 + 4], pts[i * 6 + 1] + pts[i * 6 + 5]);
        const cIn = i => P(pts[i * 6] + pts[i * 6 + 2], pts[i * 6 + 1] + pts[i * 6 + 3]);
        ctx.moveTo(...V(0));
        const seg = (a, b) => ctx.bezierCurveTo(...cOut(a), ...cIn(b), ...V(b));
        for (let i = 1; i < n; i++) seg(i - 1, i);
        if (m.fech && n > 1) seg(n - 1, 0);
        ctx.stroke();
        if (sel || (VEMO.caneta && VEMO.caneta.id === m.id)) {
            const h = 3.5 * tela;
            for (let i = 0; i < n; i++) {
                const [x, y] = V(i);
                const temAlca = pts[i * 6 + 2] || pts[i * 6 + 3] || pts[i * 6 + 4] || pts[i * 6 + 5];
                if (temAlca) {
                    ctx.lineWidth = 1 * tela;
                    [cIn(i), cOut(i)].forEach(([ax, ay]) => {
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke();
                        ctx.beginPath(); ctx.arc(ax, ay, h * 0.8, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill(); ctx.stroke();
                    });
                }
                ctx.fillStyle = VEMO.drag && VEMO.drag.vi === i && VEMO.drag.id === m.id ? veMoCor(j) : '#111';
                ctx.fillRect(x - h, y - h, h * 2, h * 2);
                ctx.lineWidth = 1.2 * tela;
                ctx.strokeRect(x - h, y - h, h * 2, h * 2);
            }
        }
    });
    ctx.restore();
}

// O que está sob o ponteiro (px do quadro): vértice, alça ou o caminho de uma máscara da camada selecionada
function veMoAlvo(c, pt) {
    const q = veTxQuadroTela(), raio = 7 / q.s, M = veMoMundo(c), ordem = (c.mk || []).map((m, j) => ({ m, j }));
    // a máscara selecionada primeiro
    ordem.sort((a, b) => (VEMO.selMk && b.m.id === VEMO.selMk.id) - (VEMO.selMk && a.m.id === VEMO.selMk.id));
    for (const { m } of ordem) {
        const pts = veMoValor(c, `mk.${m.id}.cam`), n = Math.floor(pts.length / 6);
        const sel = VEMO.selMk && VEMO.selMk.id === m.id;
        for (let i = 0; i < n; i++) {
            const v = M.transformPoint({ x: pts[i * 6], y: pts[i * 6 + 1] });
            if (Math.hypot(v.x - pt.x, v.y - pt.y) <= raio) return { m, tipo: 'v', i };
            if (sel) for (const [lado, a] of [['in', 2], ['out', 4]]) {
                if (!pts[i * 6 + a] && !pts[i * 6 + a + 1]) continue;
                const h = M.transformPoint({ x: pts[i * 6] + pts[i * 6 + a], y: pts[i * 6 + 1] + pts[i * 6 + a + 1] });
                if (Math.hypot(h.x - pt.x, h.y - pt.y) <= raio) return { m, tipo: lado, i };
            }
        }
    }
    // perto do traço: move a máscara inteira
    const cv = document.createElement('canvas'), x = cv.getContext('2d');
    for (const { m } of ordem) {
        const pts = veMoValor(c, `mk.${m.id}.cam`);
        x.setTransform(M);
        x.beginPath();
        if (!veMoCaminho(x, pts, m.fech)) continue;
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.lineWidth = raio * 1.4;
        if (x.isPointInStroke(pt.x, pt.y)) return { m, tipo: 'cam' };
    }
    return null;
}

// Ponto do quadro → px da mídia da camada
const veMoLocalPt = (c, pt) => { const r = veMoMundo(c).inverse().transformPoint({ x: pt.x, y: pt.y }); return { x: r.x, y: r.y }; };

function veMoMudarPts(c, m, pts) {
    const chave = `mk.${m.id}.cam`, r = pts.map(v => Math.round(v * 100) / 100);
    if (veKfOn(c, chave)) veApplyProps(c, { [chave]: r });
    else c.mk = c.mk.map(x => x.id === m.id ? { ...x, pts: r } : x);
}

function veMoPointer(e) {
    if (e.button !== 0 || !VE.ready) return;
    if (e.target.closest('button, textarea, input, select, .ve-gr-opcoes, .ve-mzoom')) return;
    const ferr = VE.tool;
    const c = VE.clips[VE.sel];
    const pt = veTxPontoQuadro(e);
    // editar pontos: com a camada selecionada e máscaras visíveis (Seleção, Máscara ou Caneta)
    const alvo = c && !veIsAudio(c) && veTfVisivel(c) && (c.mk || []).length && ['select', 'mascara', 'caneta'].includes(ferr) && !(ferr === 'caneta' && VEMO.caneta) ? veMoAlvo(c, pt) : null;
    if (!alvo && ferr !== 'mascara' && ferr !== 'caneta') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    VEM.panned = true;
    if (VE.playing) veStop();
    const scr = $ve('ve-screen'), win = scr.ownerDocument.defaultView;
    if (!c || veIsAudio(c) || !veTfVisivel(c)) { veToast('Selecione uma camada visível na agulha para desenhar a máscara'); return; }
    if (veLocked(c)) { veAvisoBloqueio(); return; }
    const o = c._o || c;
    if (alvo) {
        VEMO.selMk = { c: o, id: alvo.m.id };
        const pts0 = veMoValor(c, `mk.${alvo.m.id}.cam`).slice(), l0 = veMoLocalPt(c, pt);
        let hist = false;
        VEMO.drag = { id: alvo.m.id, vi: alvo.tipo === 'v' ? alvo.i : -1 };
        const move = ev => {
            const l = veMoLocalPt(c, veTxPontoQuadro(ev)), dx = l.x - l0.x, dy = l.y - l0.y;
            if (!hist) { if (Math.hypot(dx, dy) < 0.5) return; vePushHistory(); hist = true; }
            const p = pts0.slice(), b = alvo.i * 6;
            if (alvo.tipo === 'cam') for (let i = 0; i < p.length; i += 6) { p[i] += dx; p[i + 1] += dy; }
            else if (alvo.tipo === 'v' && (ev.altKey || ferr === 'caneta')) {
                // Alt (ou Caneta) + arrastar o vértice: puxa as alças (vértice suave)
                p[b + 4] = l.x - pts0[b]; p[b + 5] = l.y - pts0[b + 1]; p[b + 2] = -p[b + 4]; p[b + 3] = -p[b + 5];
            } else if (alvo.tipo === 'v') { p[b] += dx; p[b + 1] += dy; }
            else {
                const a = alvo.tipo === 'in' ? 2 : 4, outra = alvo.tipo === 'in' ? 4 : 2;
                p[b + a] = l.x - pts0[b]; p[b + a + 1] = l.y - pts0[b + 1];
                if (!ev.altKey) {   // alças alinhadas (Alt quebra, como no AE)
                    const len = Math.hypot(pts0[b + outra], pts0[b + outra + 1]), ang = Math.atan2(p[b + a + 1], p[b + a]) + Math.PI;
                    p[b + outra] = Math.cos(ang) * len; p[b + outra + 1] = Math.sin(ang) * len;
                }
            }
            veMoMudarPts(c, alvo.m, p);
            veCacheInvalidate();
            veDrawMonitor();
        };
        const up = () => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            VEMO.drag = null;
            setTimeout(() => { VEM.panned = false; }, 0);
            VEFX.key = '';
            veRefresh();
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
        veDrawMonitor();
        return;
    }
    if (ferr === 'mascara') {
        const l0 = veMoLocalPt(c, pt);
        vePushHistory();
        const m = veMoNovaMascara(c, VEMO.ferr, l0.x, l0.y, 1, 1);
        VEMO.selMk = { c: o, id: m.id };
        const move = ev => {
            let l = veMoLocalPt(c, veTxPontoQuadro(ev)), w = l.x - l0.x, h = l.y - l0.y;
            if (ev.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
            const x = Math.min(l0.x, l0.x + w), y = Math.min(l0.y, l0.y + h);
            const pts = VEMO.ferr === 'eli' ? veMoPtsEli(x, y, Math.abs(w), Math.abs(h)) : veMoPtsRet(x, y, Math.abs(w), Math.abs(h));
            o.mk = o.mk.map(k => k.id === m.id ? { ...k, pts: pts.map(v => Math.round(v * 100) / 100) } : k);
            veCacheInvalidate();
            veDrawMonitor();
        };
        const up = () => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            const mm = o.mk.find(k => k.id === m.id), pts = mm.pts;
            if (Math.abs(pts[6] - pts[0]) < 2 && Math.abs(pts[13] - pts[1]) < 2 && Math.abs(pts[12] - pts[0]) < 2) {
                // só um clique: máscara do tamanho da camada
                const sz = veMediaSize(c);
                mm.pts = (VEMO.ferr === 'eli' ? veMoPtsEli : veMoPtsRet)(0, 0, sz.w, sz.h);
            }
            setTimeout(() => { VEM.panned = false; }, 0);
            veRefresh();
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
        return;
    }
    // Caneta: clique põe ponto (arrastar puxa as alças); clicar no 1º ponto fecha; Enter/Esc termina aberta
    const l = veMoLocalPt(c, pt);
    let m = VEMO.caneta && VEMO.caneta.c === o ? o.mk.find(k => k.id === VEMO.caneta.id) : null;
    vePushHistory();
    if (m && m.pts.length >= 12) {
        const v0 = veMoMundo(c).transformPoint({ x: m.pts[0], y: m.pts[1] }), q = veTxQuadroTela();
        if (Math.hypot(v0.x - pt.x, v0.y - pt.y) <= 8 / q.s) {
            o.mk = o.mk.map(k => k.id === m.id ? { ...k, fech: true } : k);
            VEMO.caneta = null;
            veToast('Máscara fechada');
            setTimeout(() => { VEM.panned = false; }, 0);
            veRefresh();
            return;
        }
    }
    if (!m) {
        m = veMoNovaMascara(c, 'ret', 0, 0, 0, 0);
        o.mk = o.mk.map(k => k.id === m.id ? { ...k, pts: [], fech: false } : k);
        m = o.mk.find(k => k.id === m.id);
        VEMO.caneta = { c: o, id: m.id };
        VEMO.selMk = { c: o, id: m.id };
    }
    const b = m.pts.length;
    const novo = [...m.pts, Math.round(l.x * 100) / 100, Math.round(l.y * 100) / 100, 0, 0, 0, 0];
    o.mk = o.mk.map(k => k.id === m.id ? { ...k, pts: novo } : k);
    const move = ev => {
        const q = veMoLocalPt(c, veTxPontoQuadro(ev)), dx = q.x - l.x, dy = q.y - l.y;
        if (Math.hypot(dx, dy) < 1) return;
        const k = o.mk.find(x => x.id === m.id), p = k.pts.slice();
        p[b + 4] = dx; p[b + 5] = dy; p[b + 2] = -dx; p[b + 3] = -dy;
        o.mk = o.mk.map(x => x.id === m.id ? { ...x, pts: p.map(v => Math.round(v * 100) / 100) } : x);
        veDrawMonitor();
    };
    const up = () => {
        win.removeEventListener('pointermove', move);
        win.removeEventListener('pointerup', up);
        setTimeout(() => { VEM.panned = false; }, 0);
        VEFX.key = '';
        veRefresh();
    };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
    veDrawMonitor();
}

// Enter/Esc com a Caneta: termina a máscara aberta (fechada se tiver 3+ pontos e Enter)
function veMoTecla(e) {
    if (!VEMO.caneta) return false;
    if (e.key !== 'Enter' && e.key !== 'Escape') return false;
    const o = VEMO.caneta.c, id = VEMO.caneta.id, m = (o.mk || []).find(k => k.id === id);
    VEMO.caneta = null;
    if (m && e.key === 'Enter' && m.pts.length >= 18) { o.mk = o.mk.map(k => k.id === id ? { ...k, fech: true } : k); veToast('Máscara fechada'); }
    else if (m && m.pts.length < 18) { o.mk = o.mk.filter(k => k.id !== id); if (!o.mk.length) delete o.mk; veToast('Máscara descartada (precisa de 3 pontos)'); }
    e.preventDefault();
    veRefresh();
    return true;
}

// Opções da ferramenta Máscara (retângulo / elipse), no canto do monitor
function veMoOpcoes() {
    const scr = $ve('ve-screen');
    if (!scr) return;
    let box = scr.querySelector('.ve-mo-opcoes');
    if (VE.tool !== 'mascara' && VE.tool !== 'caneta') { if (box) box.hidden = true; if (VE.tool !== 'caneta' && VEMO.caneta) VEMO.caneta = null; return; }
    if (!box) {
        box = scr.ownerDocument.createElement('div');
        box.className = 've-gr-opcoes ve-mo-opcoes';
        scr.appendChild(box);
        box.addEventListener('pointerdown', e => e.stopPropagation());
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-mof]');
            if (!b) return;
            VEMO.ferr = b.dataset.mof;
            veMoOpcoes();
        });
    }
    box.hidden = false;
    box.innerHTML = VE.tool === 'mascara'
        ? `<span class="ve-gr-tit">${veT('Máscara')}</span><span class="ve-gr-tipos">${[['ret', '▭', 'Retângulo'], ['eli', '◯', 'Elipse']].map(([k, s, n]) => `<button class="${VEMO.ferr === k ? 'on' : ''}" data-mof="${k}" title="${veT(n)}">${s}</button>`).join('')}</span>
           <small>${veT('Selecione a camada e arraste no monitor · Shift: 1:1 · arraste os pontos para ajustar')}</small>`
        : `<span class="ve-gr-tit">${veT('Caneta')}</span><small>${veT('Clique: ponto · arrastar: curva · 1º ponto ou Enter: fecha · Esc: termina · Alt+arrastar ponto: alças')}</small>`;
}

// ─────────────────────────── efeitos do motion (só desenho: a exportação usa a camada desenhada) ───────────────────────────
// Rodam no canvas da camada (px da mídia × q), antes do movimento, como os outros efeitos (veFxRender). soDesenho: a
// camada com um deles vira camada desenhada na exportação (veMoTem). Eco é do movimento: desenhado em veMoDesenhar.
const veMoFxTela = (n, w, h) => veFxCanvas(5 + n, w, h);
// média de n desenhos (deslocamentos/escalas) de um canvas: desfoques direcional e radial
function veMoMedia(a, w, h, n, desenhar) {
    const b = veFxOther(a, w, h), t = veMoFxTela(0, w, h);
    b.ctx.setTransform(1, 0, 0, 1, 0, 0);
    b.ctx.clearRect(0, 0, w, h);
    for (let j = 0; j < n; j++) {
        t.ctx.setTransform(1, 0, 0, 1, 0, 0);
        t.ctx.clearRect(0, 0, w, h);
        desenhar(t.ctx, j / Math.max(1, n - 1));
        b.ctx.globalCompositeOperation = 'lighter';
        b.ctx.globalAlpha = 1 / n;
        b.ctx.drawImage(t.cv, 0, 0);
    }
    b.ctx.globalAlpha = 1;
    b.ctx.globalCompositeOperation = 'source-over';
    return b;
}
Object.assign(VE_FX, {
    // Preenchimento e Inverter também saem pelo ffmpeg (video_cutter._filtros_fx): sem camada desenhada, valem em ajuste
    mo_fill: {
        nome: 'Preenchimento', cat: 'Gerar', tag: 'Fill',
        params: [{ k: 'cor', nome: 'Cor', tipo: 'cor', def: '#D4814A', gotas: false },
                 { k: 'op', nome: 'Opacidade', min: 0, max: 100, step: 0.5, def: 100, un: '%' }],
        neutro: v => !(v.op > 0),
        draw(a, v) {
            const x = a.ctx;
            x.save(); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = v.op / 100; x.fillStyle = v.cor; x.fillRect(0, 0, a.cv.width, a.cv.height); x.restore();
            return a;
        },
    },
    mo_inv: {
        nome: 'Inverter', cat: 'Canal', tag: 'Invert',
        params: [{ k: 'mix', nome: 'Mistura com o original', min: 0, max: 100, step: 0.5, def: 0, un: '%' }],
        neutro: v => v.mix >= 100,
        // cor = 255 − cor, o alfa fica (como o Invert RGB do AE); mistura = quanto do original volta
        draw(a, v) {
            const w = a.cv.width, h = a.cv.height, o = veFxOther(a, w, h), x = o.ctx;
            x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h); x.drawImage(a.cv, 0, 0);
            x.globalCompositeOperation = 'difference'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
            x.globalCompositeOperation = 'destination-in'; x.drawImage(a.cv, 0, 0);
            x.globalCompositeOperation = 'source-over';
            if (v.mix > 0) { x.globalAlpha = v.mix / 100; x.drawImage(a.cv, 0, 0); x.globalAlpha = 1; }
            return o;
        },
    },
    mo_rampa: {
        nome: 'Rampa de gradiente', cat: 'Gerar', tag: 'Gradient Ramp', soDesenho: true,
        params: [{ k: 'c1', nome: 'Cor inicial', tipo: 'cor', def: '#D4814A', gotas: false }, { k: 'c2', nome: 'Cor final', tipo: 'cor', def: '#111111', gotas: false },
                 { k: 'rad', nome: 'Radial', tipo: 'bool', def: 0 },
                 { k: 'x1', nome: 'Início X', min: -100, max: 200, step: 0.5, def: 50, un: '%' }, { k: 'y1', nome: 'Início Y', min: -100, max: 200, step: 0.5, def: 0, un: '%' },
                 { k: 'x2', nome: 'Fim X', min: -100, max: 200, step: 0.5, def: 50, un: '%' }, { k: 'y2', nome: 'Fim Y', min: -100, max: 200, step: 0.5, def: 100, un: '%' },
                 { k: 'mix', nome: 'Mistura com o original', min: 0, max: 100, step: 0.5, def: 0, un: '%' }],
        neutro: v => v.mix >= 100,
        draw(a, v) {
            const w = a.cv.width, h = a.cv.height, x = a.ctx;
            const X1 = w * v.x1 / 100, Y1 = h * v.y1 / 100, X2 = w * v.x2 / 100, Y2 = h * v.y2 / 100;
            const g = v.rad ? x.createRadialGradient(X1, Y1, 0, X1, Y1, Math.max(1, Math.hypot(X2 - X1, Y2 - Y1))) : x.createLinearGradient(X1, Y1, X2, Y2);
            g.addColorStop(0, v.c1); g.addColorStop(1, v.c2);
            x.save(); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 1 - v.mix / 100; x.fillStyle = g; x.fillRect(0, 0, w, h); x.restore();
            return a;
        },
    },
    // ajusteFF: numa camada de ajuste vai pelo ffmpeg (video_cutter._filtros_fx "mo_glow"): bloom do quadro inteiro
    mo_glow: {
        nome: 'Brilho (Glow)', cat: 'Estilizar', tag: 'Glow', soDesenho: true, ajusteFF: true, margem: (v, env) => (env.c && veIsAdj(env.c) ? 0 : v.raio * 1.5),
        params: [{ k: 'lim', nome: 'Limite', min: 0, max: 100, step: 0.5, def: 50, un: '%' },
                 { k: 'raio', nome: 'Raio', min: 0, max: 500, step: 0.5, def: 30, un: 'px' },
                 { k: 'int', nome: 'Intensidade', min: 0, max: 400, step: 1, def: 100, un: '%' },
                 { k: 'usaCor', nome: 'Brilho colorido', tipo: 'bool', def: 0 },
                 { k: 'cor', nome: 'Cor do brilho', tipo: 'cor', def: '#D4814A', gotas: false },
                 { k: 'soma', nome: 'Somar luz (estoura os claros)', tipo: 'bool', def: 0 }],
        neutro: v => !(v.int > 0) || !(v.raio > 0),
        draw(a, v, env) {
            const w = a.cv.width, h = a.cv.height, B = veMoFxTela(1, w, h), bx = B.ctx, lim = v.lim / 100 * 255;
            bx.setTransform(1, 0, 0, 1, 0, 0); bx.clearRect(0, 0, w, h); bx.drawImage(a.cv, 0, 0);
            if (lim > 0 || v.usaCor) {   // só o que passa do limite brilha (canal a canal, a mesma conta da exportação)
                try {
                    const d = bx.getImageData(0, 0, w, h), p = d.data, k = 255 / Math.max(1, 255 - lim);
                    const cor = v.usaCor ? [1, 3, 5].map(i => parseInt(v.cor.slice(i, i + 2), 16) / 255) : null;
                    for (let i = 0; i < p.length; i += 4) {
                        let r = Math.max(0, Math.min(255, (p[i] - lim) * k)), g = Math.max(0, Math.min(255, (p[i + 1] - lim) * k)), b = Math.max(0, Math.min(255, (p[i + 2] - lim) * k));
                        if (cor) { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = y * cor[0]; g = y * cor[1]; b = y * cor[2]; }
                        p[i] = r; p[i + 1] = g; p[i + 2] = b;
                    }
                    bx.putImageData(d, 0, 0);
                } catch (e) { /* quadro sem CORS */ }
            }
            const C = veMoFxTela(2, w, h), cx = C.ctx;
            cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, w, h);
            cx.filter = `blur(${Math.max(0.1, v.raio * env.q / 2).toFixed(2)}px)`; cx.drawImage(B.cv, 0, 0); cx.filter = 'none';
            const o = veFxOther(a, w, h);
            o.ctx.setTransform(1, 0, 0, 1, 0, 0); o.ctx.clearRect(0, 0, w, h); o.ctx.drawImage(a.cv, 0, 0);
            // Tela (padrão): os claros chegam ao branco sem cortar; Somar luz = o modo antigo (estourava). Exportação: glow_passadas
            o.ctx.globalCompositeOperation = v.soma ? 'lighter' : 'screen';
            for (let k = v.int / 100; k > 0.001; k -= 1) { o.ctx.globalAlpha = Math.min(1, k); o.ctx.drawImage(C.cv, 0, 0); }
            o.ctx.globalAlpha = 1; o.ctx.globalCompositeOperation = 'source-over';
            return o;
        },
    },
    mo_grao: {
        nome: 'Granulação', cat: 'Ruído e granulação', tag: 'Add Grain', soDesenho: true,
        params: [{ k: 'amt', nome: 'Quantidade', min: 0, max: 100, step: 0.5, def: 25, un: '%' },
                 { k: 'tam', nome: 'Tamanho', min: 1, max: 12, step: 0.5, def: 1.5, un: 'px' },
                 { k: 'cor', nome: 'Grão colorido', tipo: 'bool', def: 0 },
                 { k: 'anim', nome: 'Muda a cada quadro', tipo: 'bool', def: 1 }],
        neutro: v => !(v.amt > 0),
        draw(a, v, env) {
            const w = a.cv.width, h = a.cv.height, s = Math.max(1, v.tam * env.q), gw = Math.ceil(w / s), gh = Math.ceil(h / s);
            const N = veMoFxTela(3, gw, gh), nx = N.ctx, d = nx.createImageData(gw, gh), p = d.data;
            let seed = ((v.anim ? Math.round((env.T || 0) * (VE.fps || 30)) : 0) * 2654435761 + 12345) >>> 0;
            const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
            for (let i = 0; i < p.length; i += 4) {
                const g = rnd() * 255;
                p[i] = v.cor ? rnd() * 255 : g; p[i + 1] = v.cor ? rnd() * 255 : g; p[i + 2] = v.cor ? rnd() * 255 : g; p[i + 3] = 255;
            }
            nx.putImageData(d, 0, 0);
            const T = veMoFxTela(4, w, h), tx = T.ctx;
            tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, w, h);
            tx.imageSmoothingEnabled = s > 1.5; tx.drawImage(N.cv, 0, 0, gw * s, gh * s); tx.imageSmoothingEnabled = true;
            tx.globalCompositeOperation = 'destination-in'; tx.drawImage(a.cv, 0, 0); tx.globalCompositeOperation = 'source-over';
            const x = a.ctx;
            x.save(); x.globalCompositeOperation = 'soft-light'; x.globalAlpha = Math.min(1, v.amt / 50); x.drawImage(T.cv, 0, 0); x.restore();
            return a;
        },
    },
    mo_dir: {
        nome: 'Desfoque direcional', cat: 'Desfoque e nitidez', tag: 'Directional Blur', soDesenho: true, margem: (v, env) => (env.c && veIsAdj(env.c) ? 0 : v.comp / 2),
        params: [{ k: 'ang', nome: 'Direção', min: 0, max: 360, step: 1, def: 0, un: '°' },
                 { k: 'comp', nome: 'Comprimento', min: 0, max: 1000, step: 0.5, def: 40, un: 'px' }],
        neutro: v => !(v.comp > 0),
        draw(a, v, env) {
            const w = a.cv.width, h = a.cv.height, L = v.comp * env.q, n = Math.round(veMoClamp(L / 1.5, 2, 48)), r = v.ang * Math.PI / 180;
            return veMoMedia(a, w, h, n, (x, u) => x.drawImage(a.cv, Math.cos(r) * L * (u - 0.5), Math.sin(r) * L * (u - 0.5)));
        },
    },
    mo_zoom: {
        nome: 'Desfoque radial (zoom)', cat: 'Desfoque e nitidez', tag: 'Radial Blur', soDesenho: true, margem: (v, env) => (env.c && veIsAdj(env.c) ? 0 : Math.max(env.mw, env.mh) * v.amt / 200),
        params: [{ k: 'amt', nome: 'Quantidade', min: 0, max: 100, step: 0.5, def: 20, un: '%' },
                 { k: 'cx', nome: 'Centro X', min: -50, max: 150, step: 0.5, def: 50, un: '%' }, { k: 'cy', nome: 'Centro Y', min: -50, max: 150, step: 0.5, def: 50, un: '%' }],
        neutro: v => !(v.amt > 0),
        draw(a, v) {
            const w = a.cv.width, h = a.cv.height, cx = w * v.cx / 100, cy = h * v.cy / 100, k = v.amt / 100;
            const n = Math.round(veMoClamp(Math.max(w, h) * k / 3, 3, 48));
            return veMoMedia(a, w, h, n, (x, u) => { const s = 1 + k * u; x.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s); x.drawImage(a.cv, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0); });
        },
    },
    mo_contorno: {
        nome: 'Contorno', cat: 'Estilizar', tag: 'Stroke', soDesenho: true, margem: (v, env) => (env.c && veIsAdj(env.c) ? 0 : v.larg),
        params: [{ k: 'cor', nome: 'Cor', tipo: 'cor', def: '#ffffff', gotas: false },
                 { k: 'larg', nome: 'Largura', min: 0, max: 200, step: 0.5, def: 8, un: 'px' },
                 { k: 'op', nome: 'Opacidade', min: 0, max: 100, step: 0.5, def: 100, un: '%' }],
        neutro: v => !(v.larg > 0) || !(v.op > 0),
        draw(a, v, env) {
            const w = a.cv.width, h = a.cv.height, L = v.larg * env.q, S = veMoFxTela(1, w, h), sx = S.ctx;
            sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, w, h);
            const n = Math.round(veMoClamp(L * 2, 12, 48));
            for (let j = 0; j < n; j++) { const r = j * 2 * Math.PI / n; sx.drawImage(a.cv, Math.cos(r) * L, Math.sin(r) * L); }
            sx.globalCompositeOperation = 'source-in'; sx.fillStyle = v.cor; sx.fillRect(0, 0, w, h); sx.globalCompositeOperation = 'source-over';
            const o = veFxOther(a, w, h);
            o.ctx.setTransform(1, 0, 0, 1, 0, 0); o.ctx.clearRect(0, 0, w, h);
            o.ctx.globalAlpha = v.op / 100; o.ctx.drawImage(S.cv, 0, 0); o.ctx.globalAlpha = 1; o.ctx.drawImage(a.cv, 0, 0);
            return o;
        },
    },
    mo_eco: {
        nome: 'Eco (rastro do movimento)', cat: 'Tempo', tag: 'Echo', soDesenho: true, aoDesenhar: true,
        params: [{ k: 'n', nome: 'Ecos', min: 1, max: 30, step: 1, def: 5, un: '' },
                 { k: 'dt', nome: 'Intervalo', min: 0.005, max: 1, step: 0.005, def: 0.04, un: 's' },
                 { k: 'dec', nome: 'Opacidade do 1º eco', min: 0, max: 100, step: 0.5, def: 60, un: '%' },
                 { k: 'frente', nome: 'Ecos na frente', tipo: 'bool', def: 0 }],
        neutro: v => !(v.n >= 1) || !(v.dec > 0),
        draw: a => a,
    },
});
const veMoEco = (c, T) => { const f = veFxActive(c, T).find(f => f.t === 'mo_eco'); return f ? veFxValues(f, c, T) : null; };

// ─────────────────────────── API (agente, Worker e interface) ───────────────────────────
function veMoClipe(ref) {
    const c = ref == null ? VE.clips[VE.sel] : typeof ref === 'number' ? VE.clips[ref] : ref;
    if (!c || veIsAudio(c)) throw new Error('camada não encontrada (índice do clipe em VE.clips)');
    return c._o || c;
}
function veMoDepois() { VEFX.key = ''; VEKL.chave = ''; veCacheInvalidate(); veRefresh(); }

window.VEMO_API = {
    // máscara: {forma: 'ret'|'eli', x, y, w, h (px da mídia; sem = a camada toda), pts, modo, inv, pena, op, exp, nome}
    mascara(ref, op = {}) {
        const c = veMoClipe(ref), sz = veMediaSize(c);
        vePushHistory();
        const m = veMoNovaMascara(c, op.forma || 'ret', op.x ?? 0, op.y ?? 0, op.w ?? sz.w, op.h ?? sz.h);
        const extra = {};
        ['modo', 'inv', 'pena', 'op', 'exp', 'nome'].forEach(k => { if (op[k] != null) extra[k] = op[k]; });
        if (op.pts) { extra.pts = op.pts; extra.fech = op.fech !== false; }
        c.mk = c.mk.map(k => k.id === m.id ? { ...k, ...extra } : k);
        veMoDepois();
        return { id: m.id };
    },
    mascaraEditar(ref, id, op = {}) {
        const c = veMoClipe(ref);
        vePushHistory();
        c.mk = (c.mk || []).map(k => k.id === id ? { ...k, ...op } : k);
        veMoDepois();
        return true;
    },
    pontosRet: (x, y, w, h) => veMoPtsRet(x, y, w, h),
    pontosEli: (x, y, w, h) => veMoPtsEli(x, y, w, h),
    // quadros-chave de qualquer propriedade: chave 'x'|'y'|'sc'|'rot'|'op'|'fx.<id>.<p>'|'mk.<id>.<p>'|'fm.<p>';
    // lista = [[t (segundos da timeline), valor, interpolação ('lin'|'ease'|'in'|'out'|'hold'|[x1,y1,x2,y2])], ...]
    quadros(ref, chave, lista) {
        const c = veMoClipe(ref);
        vePushHistory();
        const ks = lista.map(([t, v, i]) => {
            const q = { t: Math.round(veSrcAt(c, t) * 1e4) / 1e4, v, i: Array.isArray(i) ? 'bez' : (i || 'lin') };
            if (Array.isArray(i)) q.b = i;
            return q;
        }).sort((a, b) => a.t - b.t);
        c.k = { ...(c.k || {}), [chave]: ks };
        veMoDepois();
        return ks.length;
    },
    semQuadros(ref, chave) {
        const c = veMoClipe(ref);
        if (!c.k || !c.k[chave]) return false;
        vePushHistory();
        const v = veMoChave(chave) ? veMoValor(c, chave) : veProps(c)[chave];
        const k2 = { ...c.k }; delete k2[chave]; c.k = k2;
        if (!veHasKf(c)) delete c.k;
        if (veMoChave(chave)) veMoFixo(c, chave, v); else c.p = { ...veStaticProps(c), [chave]: v };
        veMoDepois();
        return true;
    },
    valor: (ref, chave, t) => { const c = veMoClipe(ref); return veMoChave(chave) ? veMoValor(c, chave, t ?? VE.playhead) : veProps(c, t ?? VE.playhead)[chave]; },
    pai(ref, mae) {
        const c = veMoClipe(ref);
        vePushHistory();
        const ok = veMoDefinirPai(c, mae == null ? null : veMoUid(veMoClipe(mae)));
        veMoDepois();
        return ok;
    },
    // fosco: modo 'alfa'|'alfainv'|'luma'|'lumainv' (null tira); fosco = clipe que recorta
    fosco(ref, fosco, modo = 'alfa') {
        const c = veMoClipe(ref);
        vePushHistory();
        if (!modo || fosco == null) delete c.mt; else c.mt = { modo, uid: veMoUid(veMoClipe(fosco)) };
        veMoDepois();
        return true;
    },
    desfoqueMovimento(ref, on = true) {
        const c = veMoClipe(ref);
        vePushHistory();
        if (on) c.mb = 1; else delete c.mb;
        veMoDepois();
        return true;
    },
    // nulo: {st, dur, tr, x, y, nome, prender: [clipes que passam a ser filhos]} → índice do clipe
    nulo(op = {}) {
        if (!VE.ready) throw new Error('abra um projeto');
        const st = op.st ?? veSnapFrame(VE.playhead), dur = op.dur ?? Math.max(1, VE.dur - st);
        let m = VE.media.find(x => x && x.kind === 'nulo' && !x.removido);
        if (!m) { m = { id: VE.media.length, kind: 'nulo', name: 'Nulo' }; VE.media.push(m); }
        vePushHistory();
        let tr = op.tr ?? Math.max(1, ...VE.clips.filter(c => !veIsAudio(c)).map(c => c.tr + 1));
        veEnsureTrackIndex(tr);
        while (veTrkLocked(tr) || !veTrackFree(tr, st, st + dur, { m: m.id })) { tr++; veEnsureTrackIndex(tr); }
        const n = VE.clips.filter(c => veMoEhNulo(c)).length + 1;
        const c = { tr, st, s: 0, e: dur, m: m.id, nome: op.nome || `Nulo ${n}`, p: { sc: 100, x: op.x ?? VE.seqW / 2, y: op.y ?? VE.seqH / 2, rot: 0, op: 100, ax: 0, ay: 0 } };
        veMoUid(c);
        VE.clips.push(c);
        (op.prender || []).forEach(r => { try { veMoDefinirPai(veMoClipe(r), c.uid); } catch (e) { /* ignora */ } });
        VE.sel = VE.clips.indexOf(c);
        veRelayout();
        veMoDepois();
        return VE.clips.indexOf(c);
    },
    uid: ref => veMoUid(veMoClipe(ref)),
    precisaDesenhar: ref => veMoTem(veMoClipe(ref)),
};

// ─────────────────────────── início ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // no pai do monitor (captura): roda antes da Seleção/Forma/Texto, que escutam no próprio monitor — pegar um ponto
    // de máscara não pode virar arrastar a camada
    const scr = $ve('ve-screen');
    if (scr && scr.parentElement) scr.parentElement.addEventListener('pointerdown', e => { if (scr.contains(e.target)) veMoPointer(e); }, true);
    veMoPainelIniciar();
    // ferramentas Máscara e Caneta, no grupo da Forma (painel Ferramentas)
    if (typeof VE_FERR !== 'undefined') {
        const g = VE_FERR.find(x => x.some(f => f.id === 'forma'));
        if (g && !g.some(f => f.id === 'mascara')) g.push({ id: 'mascara', ic: 'i-mask', nome: 'Máscara (retângulo, elipse)', tecla: '' }, { id: 'caneta', ic: 'i-pen', nome: 'Caneta (máscara no monitor · volume/opacidade na timeline)', tecla: 'P' });
        if (typeof veFerrRender === 'function') veFerrRender();
    }
});
