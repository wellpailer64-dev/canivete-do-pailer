// =========================================================
// Pocket Editor — gráficos desenhados pelo próprio editor: Cor sólida, Formas e Pincel
//   Cor sólida (media kind 'cor', item do painel Projeto como a "Cor fosca" do Premiere): m.fill = #rrggbb,
//     do tamanho do quadro; trocar a cor muda todos os clipes dela. (m.cor é a cor do RÓTULO, não confundir.)
//   Forma (media 'forma', uma só e escondida, como a do texto): c.fm = {t: ret|eli|tri|lin, w, h, cor, cOn, cCor,
//     cLarg, raio} — ferramenta Forma (U) na barra: arrastar no monitor cria.
//   Pincel (media 'pincel', escondida): c.br = {w, h, tracos: [{cor, tam, dur, op, pts: [x, y, x, y...]}]} em px do
//     próprio desenho — ferramenta Pincel (B): pintar no monitor cria a camada (ou continua a selecionada).
// Na prévia viram um canvas (veGrafDesenho); na exportação, um PNG (veTxPngs) — valem escala, posição, rotação,
// opacidade, efeitos, animações e transições como qualquer imagem.
// =========================================================

const VE_GRAF = new Set(['cor', 'forma', 'pincel']);
const veEhGrafico = c => { const m = c && veMediaOf(c); return !!m && VE_GRAF.has(m.kind); };
const VE_FORMAS = { ret: 'Retângulo', eli: 'Elipse', tri: 'Triângulo', lin: 'Linha' };
const VEGR = {
    cache: new WeakMap(),
    pincel: { cor: '#ffffff', tam: 24, dur: 80, op: 100 },
    forma: { t: 'ret', cor: '#F97316', cOn: false, cCor: '#ffffff', cLarg: 8, raio: 0 },
    ctx: null,
};
try { Object.assign(VEGR.pincel, JSON.parse(veLsGet('ve-pincel') || '{}')); } catch (e) { /* padrão */ }
try { Object.assign(VEGR.forma, JSON.parse(veLsGet('ve-forma') || '{}')); } catch (e) { /* padrão */ }
const veGrSalvarOpcoes = () => { veLsSet('ve-pincel', JSON.stringify(VEGR.pincel)); veLsSet('ve-forma', JSON.stringify(VEGR.forma)); };

// Mídia escondida única (a do texto funciona igual)
function veGrMidia(kind, nome) {
    let m = VE.media.find(x => x && x.kind === kind && !x.removido);
    if (!m) { m = { id: VE.media.length, kind, name: nome }; VE.media.push(m); }
    return m;
}

function veGrafTamanho(c) {
    const m = veMediaOf(c);
    if (m.kind === 'forma' && c.fm) return { w: Math.max(1, c.fm.w), h: Math.max(1, c.fm.h) };
    if (m.kind === 'pincel' && c.br) return { w: c.br.w || VE.seqW, h: c.br.h || VE.seqH };
    return { w: VE.seqW, h: VE.seqH };
}

// ── desenho (canvas no tamanho do gráfico; guardado enquanto nada mudar) ──
function veGrCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w));
    cv.height = Math.max(1, Math.round(h));
    return cv;
}

function veGrForma(x, fm) {
    const { w, h } = fm, b = fm.cOn ? Math.max(0, +fm.cLarg || 0) : 0, i = b / 2;
    x.beginPath();
    if (fm.t === 'eli') x.ellipse(w / 2, h / 2, Math.max(0.5, w / 2 - i), Math.max(0.5, h / 2 - i), 0, 0, Math.PI * 2);
    else if (fm.t === 'tri') { x.moveTo(w / 2, i); x.lineTo(w - i, h - i); x.lineTo(i, h - i); x.closePath(); }
    else if (fm.t === 'lin') x.rect(0, 0, w, h);
    else x.roundRect(i, i, Math.max(0.5, w - b), Math.max(0.5, h - b), Math.min(w, h) / 2 * Math.max(0, Math.min(100, +fm.raio || 0)) / 100);
    x.fillStyle = fm.cor;
    x.fill();
    if (b > 0 && fm.t !== 'lin') {
        x.lineWidth = b;
        x.lineJoin = 'round';
        x.strokeStyle = fm.cCor;
        x.stroke();
    }
}

// Traço do pincel: dureza 100 = borda dura; menor = mais esfumado (desfoque proporcional ao tamanho)
function veGrTraco(x, t) {
    const macio = Math.max(0, Math.min(1, (100 - (+t.dur || 0)) / 100));
    const larg = Math.max(0.5, t.tam * (1 - macio * 0.45)), desf = t.tam * macio * 0.35, p = t.pts || [];
    if (p.length < 2) return;
    x.save();
    x.globalAlpha = Math.max(0, Math.min(1, (t.op == null ? 100 : t.op) / 100));
    x.strokeStyle = x.fillStyle = t.cor;
    x.lineWidth = larg;
    x.lineCap = x.lineJoin = 'round';
    if (desf > 0.3) x.filter = `blur(${desf.toFixed(2)}px)`;
    x.beginPath();
    if (p.length === 2) { x.arc(p[0], p[1], larg / 2, 0, Math.PI * 2); x.fill(); x.restore(); return; }
    x.moveTo(p[0], p[1]);
    // curva suave pelos pontos médios (sem "quinas" entre as amostras do mouse)
    for (let k = 2; k < p.length - 2; k += 2) x.quadraticCurveTo(p[k], p[k + 1], (p[k] + p[k + 2]) / 2, (p[k + 1] + p[k + 3]) / 2);
    x.lineTo(p[p.length - 2], p[p.length - 1]);
    x.stroke();
    x.restore();
}

function veGrafDesenho(c) {
    const o = c._o || c, m = veMediaOf(c), sz = veGrafTamanho(c);
    if (m.kind === 'cor') {
        const k = m.fill + '|' + sz.w + 'x' + sz.h;
        let g = VEGR.cache.get(m);
        if (!g || g.k !== k) {
            const cv = veGrCanvas(sz.w, sz.h), x = cv.getContext('2d');
            x.fillStyle = m.fill || '#000000';
            x.fillRect(0, 0, cv.width, cv.height);
            g = { k, cv };
            VEGR.cache.set(m, g);
        }
        return g.cv;
    }
    if (m.kind === 'forma') {
        const k = JSON.stringify(c.fm);
        let g = VEGR.cache.get(o);
        if (!g || g.k !== k) {
            const cv = veGrCanvas(sz.w, sz.h);
            veGrForma(cv.getContext('2d'), { ...c.fm, w: cv.width, h: cv.height });
            g = { k, cv };
            VEGR.cache.set(o, g);
        }
        return g.cv;
    }
    // pincel: os traços prontos ficam guardados; o que está sendo pintado agora é desenhado por cima
    const T = (c.br && c.br.tracos) || [], n = T.length;
    const kBase = sz.w + 'x' + sz.h + '|' + (n - 1) + '|' + T.slice(0, -1).reduce((a, t) => a + t.pts.length, 0);
    let g = VEGR.cache.get(o);
    if (!g || g.kBase !== kBase) {
        const base = veGrCanvas(sz.w, sz.h), x = base.getContext('2d');
        T.slice(0, -1).forEach(t => veGrTraco(x, t));
        g = { kBase, base, cv: veGrCanvas(sz.w, sz.h), kUlt: '' };
        VEGR.cache.set(o, g);
    }
    const ult = T[n - 1], kUlt = ult ? ult.pts.length + '|' + ult.cor + ult.tam + ult.dur + ult.op : '';
    if (g.kUlt !== kUlt) {
        const x = g.cv.getContext('2d');
        x.clearRect(0, 0, g.cv.width, g.cv.height);
        x.drawImage(g.base, 0, 0);
        if (ult) veGrTraco(x, ult);
        g.kUlt = kUlt;
    }
    return g.cv;
}

// ── exportação: cada gráfico vira um PNG (junto com os textos, em veTxPngs) ──
async function veGrafPngs(mapa, filtro, clips = VE.clips) {
    for (const c of clips.filter(c => veEhGrafico(c) && (!filtro || filtro(c)))) {
        const cv = veGrafDesenho(c);
        const r = await window.pywebview.api.ve_salvar_png(cv.toDataURL('image/png'));
        if (r && r.success) mapa.set(c, { path: r.path, f: 1, w: cv.width, h: cv.height });
    }
}

// ── Cor sólida (painel Projeto) ──
// Seletor de cor do próprio editor (como o "Seletor de cores" do Premiere): quadrado de saturação/brilho, faixa de
// matiz, hex, R/G/B, amostras rápidas, Cancelar e OK. Abre no meio do painel Projeto, na janela dele (pode estar solta),
// sempre inteiro na tela. Antes era o seletor do Windows aberto por um input escondido fora da tela: aparecia num
// canto e sem botões à vista.
const VE_CP_AMOSTRAS = ['#000000', '#FFFFFF', '#808080', '#F97316', '#D4814A', '#EF4444', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'];
function veGrEscolherCor(inicial, pronto, doc = document, { titulo = 'Cor sólida', ok = 'OK', aoVivo = null } = {}) {
    doc.getElementById('ve-cp')?.remove();
    const hex2 = n => Math.round(n).toString(16).padStart(2, '0');
    const paraHex = (r, g, b) => ('#' + hex2(r) + hex2(g) + hex2(b)).toUpperCase();
    const deHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const hsvRgb = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; }; return [f(5), f(3), f(1)]; };
    const rgbHsv = (r, g, b) => {
        const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
        let h = 0;
        if (d) h = mx === r / 255 ? ((g - b) / 255 / d) % 6 : mx === g / 255 ? (b - r) / 255 / d + 2 : (r - g) / 255 / d + 4;
        return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx];
    };
    const ini = /^#[0-9a-f]{6}$/i.test(inicial || '') ? inicial.toUpperCase() : '#F97316';
    let [H, S, V] = rgbHsv(...deHex(ini)), atual = ini;
    const box = doc.createElement('div');
    box.id = 've-cp';
    box.className = 've-cp-fundo';
    box.innerHTML = `<div class="ve-cp" role="dialog">
        <div class="ve-cp-tit">${veT(titulo)}</div>
        <div class="ve-cp-corpo">
            <canvas class="ve-cp-sv" width="220" height="170"></canvas><canvas class="ve-cp-h" width="18" height="170"></canvas>
            <div class="ve-cp-lado">
                <div class="ve-cp-comp"><i class="ve-cp-novo" title="${veT('Nova')}"></i><i class="ve-cp-velho" style="background:${ini}" title="${veT('Atual')}"></i></div>
                <label>#<input class="ve-cp-hex" maxlength="7" spellcheck="false"></label>
                ${['R', 'G', 'B'].map((n, i) => `<label>${n}<input type="number" class="ve-cp-c" data-c="${i}" min="0" max="255"></label>`).join('')}
            </div>
        </div>
        <div class="ve-cp-amostras">${VE_CP_AMOSTRAS.map(c => `<button style="background:${c}" data-cor="${c}" title="${c}"></button>`).join('')}</div>
        <div class="ve-cp-pe"><button class="ve-btn ve-btn-ghost" data-cp="nao">${veT('Cancelar')}</button><button class="ve-btn ve-btn-primary" data-cp="ok">${veT(ok)}</button></div>
    </div>`;
    doc.body.appendChild(box);
    const sv = box.querySelector('.ve-cp-sv'), hc = box.querySelector('.ve-cp-h');
    const desenhar = () => {
        const x = sv.getContext('2d'), W = sv.width, Hh = sv.height;
        const [hr, hg, hb] = hsvRgb(H, 1, 1);
        x.fillStyle = `rgb(${hr},${hg},${hb})`; x.fillRect(0, 0, W, Hh);
        let gr = x.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, W, Hh);
        gr = x.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); x.fillStyle = gr; x.fillRect(0, 0, W, Hh);
        x.lineWidth = 2; x.strokeStyle = V > 0.55 ? '#000' : '#fff'; x.beginPath(); x.arc(S * W, (1 - V) * Hh, 6, 0, Math.PI * 2); x.stroke();
        const y = hc.getContext('2d'), gh = y.createLinearGradient(0, 0, 0, hc.height);
        for (let k = 0; k <= 6; k++) { const [a, b2, c] = hsvRgb(k * 60, 1, 1); gh.addColorStop(k / 6, `rgb(${a},${b2},${c})`); }
        y.fillStyle = gh; y.fillRect(0, 0, hc.width, hc.height);
        y.strokeStyle = '#fff'; y.lineWidth = 2; y.strokeRect(1, H / 360 * hc.height - 2, hc.width - 2, 4);
        const rgb = hsvRgb(H, S, V).map(Math.round);
        atual = paraHex(...rgb);
        box.querySelector('.ve-cp-novo').style.background = atual;
        const hx = box.querySelector('.ve-cp-hex');
        if (doc.activeElement !== hx) hx.value = atual.slice(1);
        box.querySelectorAll('.ve-cp-c').forEach(i => { if (doc.activeElement !== i) i.value = rgb[+i.dataset.c]; });
        if (aoVivo) aoVivo(atual);
    };
    const usarRgb = rgb => { [H, S, V] = rgbHsv(...rgb); desenhar(); };
    const arrastar = (el, fn) => el.addEventListener('pointerdown', ev => {
        el.setPointerCapture(ev.pointerId);
        const mv = e => { const rc = el.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (e.clientX - rc.left) / rc.width)), Math.min(1, Math.max(0, (e.clientY - rc.top) / rc.height))); desenhar(); };
        mv(ev);
        el.onpointermove = mv;
        el.onpointerup = () => { el.onpointermove = null; };
    });
    arrastar(sv, (u, v) => { S = u; V = 1 - v; });
    arrastar(hc, (u, v) => { H = Math.min(359.9, v * 360); });
    box.querySelector('.ve-cp-hex').addEventListener('input', e => { const v = e.target.value.replace('#', ''); if (/^[0-9a-f]{6}$/i.test(v)) usarRgb(deHex('#' + v)); });
    box.querySelectorAll('.ve-cp-c').forEach(i => i.addEventListener('input', () => {
        const rgb = deHex(atual); rgb[+i.dataset.c] = Math.min(255, Math.max(0, +i.value || 0)); usarRgb(rgb);
    }));
    const fechar = escolheu => {
        box.remove();
        doc.removeEventListener('keydown', teclas, true);
        if (escolheu) pronto(atual);
        else if (aoVivo) aoVivo(ini);   // cancelou: volta a cor de antes
    };
    const teclas = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fechar(true); }
        else if (box.contains(e.target)) e.stopPropagation();   // digitar no hex não dispara atalhos do editor
    };
    doc.addEventListener('keydown', teclas, true);
    box.addEventListener('click', e => {
        const a = e.target.closest('[data-cor]');
        if (a) { usarRgb(deHex(a.dataset.cor)); return; }
        const b = e.target.closest('[data-cp]');
        if (b) fechar(b.dataset.cp === 'ok');
        else if (e.target === box) fechar(false);   // clique fora da caixa
    });
    // no meio do painel Projeto (ou da janela), sem sair da tela
    const cx = box.querySelector('.ve-cp'), pj = $ve('ve-pj');
    const ref = pj && pj.ownerDocument === doc && pj.offsetParent ? pj.getBoundingClientRect() : { left: 0, top: 0, width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight };
    const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight, w = cx.offsetWidth, h = cx.offsetHeight;
    cx.style.left = Math.max(8, Math.min(vw - w - 8, ref.left + (ref.width - w) / 2)) + 'px';
    cx.style.top = Math.max(8, Math.min(vh - h - 8, ref.top + (ref.height - h) / 2)) + 'px';
    desenhar();
    box.querySelector('[data-cp="ok"]').focus();
}

const veGrDocProjeto = () => { const el = $ve('ve-pj-lista'); return (el && el.ownerDocument) || document; };
function vePjNovaCor() {
    if (!VE.ready) return;
    veGrEscolherCor('#F97316', fill => {
        const n = vePjMidia().filter(m => m.kind === 'cor').length + 1;
        const m = vePjAddMidia({ kind: 'cor', name: 'Cor sólida', fill, nome: `${veT('Cor sólida')} ${n}` }, vePjDestino());
        VEPJ.sel = new Set(['m:' + m.id]);
        vePjAlterou();
        veToast(veT('Cor sólida criada: arraste para a timeline'));
    }, veGrDocProjeto(), { titulo: 'Nova cor sólida', ok: 'Criar' });
}

// Trocar a cor: todos os clipes dela mudam juntos (o monitor acompanha enquanto escolhe; Cancelar volta)
function veGrCorEditar(m) {
    const antes = m.fill;
    veGrEscolherCor(m.fill, fill => {
        m.fill = antes;
        if (fill === antes) { veRefresh(); return; }
        vePushHistory();
        m.fill = fill;
        vePjAlterou();
        veRefresh();
    }, veGrDocProjeto(), { titulo: 'Cor da cor sólida', aoVivo: f => { m.fill = f; veDrawMonitorSoon(); } });
}

// ── ponto do monitor → ponto dentro do gráfico (desfaz posição, rotação e escala do clipe) ──
function veGrLocal(c, pt) {
    const p = veProps(c), [ax, ay] = veAnc(c, p, veMediaSize(c)), k = p.sc / 100;
    const sx = k * (p.sx == null ? 1 : p.sx), sy = k * (p.sy == null ? 1 : p.sy), a = -p.rot * Math.PI / 180;
    const dx = pt.x - p.x, dy = pt.y - p.y;
    return { x: ax + (dx * Math.cos(a) - dy * Math.sin(a)) / sx, y: ay + (dx * Math.sin(a) + dy * Math.cos(a)) / sy };
}

// Trilha livre na agulha, acima das usadas (não sobrepõe nada)
function veGrTrilha(st, b) {
    const tr = typeof veCeTrilhaAcima === 'function' ? veCeTrilhaAcima('v') : Math.max(1, veTrackCount());
    veEnsureTrackIndex(tr);
    return veTrkLocked(tr) || !veTrackFree(tr, st, b, {}) ? Math.max(tr + 1, veTrackCount()) : tr;
}

// ── ferramentas no monitor: Forma (arrastar cria) e Pincel (pintar) ──
function veGrPointer(e) {
    if ((VE.tool !== 'forma' && VE.tool !== 'pincel') || e.button !== 0 || !VE.ready) return;
    if (e.target.closest('button, textarea, input, select, .ve-gr-opcoes, .ve-mzoom')) return;
    if (VE.info && VE.info.audio_only) { veToast('Precisa de um vídeo'); return; }
    e.stopImmediatePropagation();
    e.preventDefault();
    VEM.panned = true;
    if (VE.playing) veStop();
    const scr = $ve('ve-screen'), doc = scr.ownerDocument, win = doc.defaultView, pt0 = veTxPontoQuadro(e);
    if (VE.tool === 'pincel' && e.shiftKey) {
        // Shift+arrastar: muda o tamanho do pincel (direita aumenta, esquerda diminui), sem pintar
        const q = veTxQuadroTela(), x0 = e.clientX, y0 = e.clientY, tam0 = VEGR.pincel.tam;
        const move = ev => {
            VEGR.pincel.tam = Math.round(Math.max(1, Math.min(1200, tam0 + (ev.clientX - x0) / q.s)));
            veGrCursor(x0, y0);
            const box = scr.querySelector('.ve-gr-opcoes');
            if (box) { const r = box.querySelector('[data-gr="p.tam"]'), v = box.querySelector('[data-grv="p.tam"]'); if (r) r.value = VEGR.pincel.tam; if (v) v.textContent = VEGR.pincel.tam; }
        };
        const up = () => { win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); veGrSalvarOpcoes(); };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
        return;
    }
    const st = veSnapFrame(VE.playhead), b = st + VE_IMG_DUR;
    let c;
    vePushHistory();
    if (VE.tool === 'forma') {
        const f = VEGR.forma, tr = veGrTrilha(st, b);
        c = { tr, st, s: 0, e: VE_IMG_DUR, m: veGrMidia('forma', 'Forma').id,
              fm: { t: f.t, w: 1, h: 1, cor: f.cor, cOn: f.cOn, cCor: f.cCor, cLarg: f.cLarg, raio: f.raio },
              p: { sc: 100, x: pt0.x, y: pt0.y, rot: 0, op: 100 } };
        VE.clips.push(c);
    } else {
        // pinta na camada de desenho selecionada (se a agulha está nela); senão cria uma
        const sel = VE.clips[VE.sel];
        if (sel && veMediaOf(sel).kind === 'pincel' && !veLocked(sel) && veInClip(sel)) c = sel;
        else {
            c = { tr: veGrTrilha(st, b), st, s: 0, e: VE_IMG_DUR, m: veGrMidia('pincel', 'Desenho').id,
                  br: { w: VE.seqW, h: VE.seqH, tracos: [] }, p: { sc: 100, x: VE.seqW / 2, y: VE.seqH / 2, rot: 0, op: 100 } };
            VE.clips.push(c);
        }
        const q = veGrLocal(c, pt0), P = VEGR.pincel;
        c.br = { ...c.br, tracos: [...c.br.tracos, { cor: P.cor, tam: P.tam, dur: P.dur, op: P.op, pts: [+q.x.toFixed(1), +q.y.toFixed(1)] }] };
    }
    VE.sel = VE.clips.indexOf(c);
    veRelayout();
    const move = ev => {
        const pt = veTxPontoQuadro(ev);
        if (VE.tool === 'forma') {
            let dx = pt.x - pt0.x, dy = pt.y - pt0.y;
            if (c.fm.t === 'lin') {
                // linha: comprimento = distância, espessura = contorno; gira na direção do arraste
                const len = Math.max(2, Math.hypot(dx, dy)), esp = Math.max(2, +VEGR.forma.cLarg || 8);
                c.fm = { ...c.fm, w: Math.round(len), h: Math.round(esp) };
                c.p = { ...c.p, x: (pt0.x + pt.x) / 2, y: (pt0.y + pt.y) / 2, rot: +(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) };
            } else {
                if (ev.shiftKey) { const l = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * l; dy = Math.sign(dy || 1) * l; }
                c.fm = { ...c.fm, w: Math.max(2, Math.round(Math.abs(dx))), h: Math.max(2, Math.round(Math.abs(dy))) };
                c.p = { ...c.p, x: pt0.x + dx / 2, y: pt0.y + dy / 2 };
            }
        } else {
            const q = veGrLocal(c, pt), T = c.br.tracos, t = T[T.length - 1], p = t.pts;
            if (Math.hypot(q.x - p[p.length - 2], q.y - p[p.length - 1]) < 1.5) return;
            p.push(+q.x.toFixed(1), +q.y.toFixed(1));
        }
        veDrawMonitor();
    };
    const up = () => {
        win.removeEventListener('pointermove', move);
        win.removeEventListener('pointerup', up);
        if (VE.tool === 'forma' && c.fm.w <= 2 && c.fm.h <= 2) {
            // só um clique: forma de tamanho padrão no ponto clicado
            const l = Math.round(Math.min(VE.seqW, VE.seqH) * 0.25);
            c.fm = { ...c.fm, w: l, h: c.fm.t === 'lin' ? Math.max(2, +VEGR.forma.cLarg || 8) : l };
        }
        if (typeof VEPP !== 'undefined') VEPP.chave = '';   // Propriedades: contagem de traços, tamanho da forma
        veRefresh();
    };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
    veDrawMonitor();
}

// ── opções da ferramenta (caixinha no canto do monitor, como a barra de opções do Photoshop) ──
function veGrOpcoes() {
    const scr = $ve('ve-screen');
    if (!scr) return;
    let box = scr.querySelector('.ve-gr-opcoes');
    if (VE.tool !== 'pincel') veGrCursor(null);
    if (VE.tool !== 'pincel' && VE.tool !== 'forma') { if (box) box.hidden = true; return; }
    if (!box) {
        box = scr.ownerDocument.createElement('div');
        box.className = 've-gr-opcoes';
        scr.appendChild(box);
        box.addEventListener('pointerdown', e => e.stopPropagation());
        box.addEventListener('input', e => {
            const el = e.target.closest('[data-gr]');
            if (!el) return;
            const [o, k] = el.dataset.gr.split('.'), alvo = o === 'p' ? VEGR.pincel : VEGR.forma;
            alvo[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? +el.value : el.value;
            const out = box.querySelector(`[data-grv="${el.dataset.gr}"]`);
            if (out) out.textContent = el.value;
            veGrSalvarOpcoes();
            const cur = scr.querySelector('.ve-gr-cursor');
            if (cur && !cur.hidden) veGrCursor(parseFloat(cur.style.left) + cur.offsetWidth / 2 + scr.getBoundingClientRect().left,
                parseFloat(cur.style.top) + cur.offsetHeight / 2 + scr.getBoundingClientRect().top);
        });
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-grt]');
            if (b) { VEGR.forma.t = b.dataset.grt; veGrSalvarOpcoes(); veGrOpcoesRender(box); }
            if (e.target.closest('[data-gracao="nova"]')) { VE.sel = -1; veRefresh(); veToast(veT('Pinte no monitor: o próximo traço vira uma camada nova')); }
        });
    }
    box.hidden = false;
    veGrOpcoesRender(box);
}
function veGrOpcoesRender(box) {
    const P = VEGR.pincel, F = VEGR.forma, faixa = (k, rot, min, max, v, un) =>
        `<label>${veT(rot)}<input type="range" data-gr="${k}" min="${min}" max="${max}" value="${v}"><b data-grv="${k}">${v}</b>${un}</label>`;
    box.innerHTML = VE.tool === 'pincel' ? `
        <span class="ve-gr-tit">${veT('Pincel')}</span>
        <label>${veT('Cor')}<input type="color" data-gr="p.cor" value="${P.cor}"></label>
        ${faixa('p.tam', 'Tamanho', 1, 1200, P.tam, 'px')}
        ${faixa('p.dur', 'Dureza', 0, 100, P.dur, '%')}
        ${faixa('p.op', 'Opacidade', 1, 100, P.op, '%')}
        <small>${veT('Shift+arrastar: tamanho')}</small>
        <button class="ve-btn ve-btn-sm ve-btn-ghost" data-gracao="nova" title="${veT('O próximo traço começa uma camada de desenho nova')}">${veT('Nova camada')}</button>` : `
        <span class="ve-gr-tit">${veT('Forma')}</span>
        <span class="ve-gr-tipos">${Object.entries(VE_FORMAS).map(([t, n]) => `<button class="${F.t === t ? 'on' : ''}" data-grt="${t}" title="${veT(n)}">${{ ret: '▭', eli: '◯', tri: '△', lin: '╱' }[t]}</button>`).join('')}</span>
        <label>${veT('Preenchimento')}<input type="color" data-gr="f.cor" value="${F.cor}"></label>
        <label><input type="checkbox" data-gr="f.cOn"${F.cOn ? ' checked' : ''}>${veT('Contorno')}<input type="color" data-gr="f.cCor" value="${F.cCor}"></label>
        ${faixa('f.cLarg', 'Espessura', 1, 80, F.cLarg, 'px')}
        <small>${veT('Arraste no monitor · Shift: proporção 1:1')}</small>`;
}

// Pincel e Forma no monitor: antes dos outros ouvintes (Seleção, Texto), como o Texto faz
document.addEventListener('DOMContentLoaded', () => {
    const scr = $ve('ve-screen');
    if (scr) scr.addEventListener('pointerdown', veGrPointer, true);
});

// Silhueta do pincel: um círculo do tamanho real do traço (na escala do monitor) que segue o mouse
function veGrCursor(x, y) {
    const scr = $ve('ve-screen');
    if (!scr) return;
    let el = scr.querySelector('.ve-gr-cursor');
    if (VE.tool !== 'pincel' || x == null) { if (el) el.hidden = true; return; }
    if (!el) {
        el = scr.ownerDocument.createElement('div');
        el.className = 've-gr-cursor';
        scr.appendChild(el);
    }
    const r = scr.getBoundingClientRect(), q = veTxQuadroTela(), d = Math.max(2, VEGR.pincel.tam * q.s);
    el.hidden = false;
    el.style.width = el.style.height = d + 'px';
    el.style.left = (x - r.left - d / 2) + 'px';
    el.style.top = (y - r.top - d / 2) + 'px';
    el.style.borderColor = VEGR.pincel.cor;
}
document.addEventListener('DOMContentLoaded', () => {
    const scr = $ve('ve-screen');
    if (!scr) return;
    scr.addEventListener('pointermove', e => { if (VE.tool === 'pincel') veGrCursor(e.clientX, e.clientY); });
    scr.addEventListener('pointerleave', () => veGrCursor(null));
});
