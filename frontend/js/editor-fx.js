// =========================================================
// Pocket Editor — efeitos (painel "Efeitos" e a parte de efeitos do "Controles de efeito")
// Cada clipe guarda c.fx = [{id, t, on, v: {parâmetro: valor}}], aplicados de cima para baixo no
// tamanho original da mídia, ANTES de escala/posição/rotação/opacidade (como no Premiere).
// Efeito novo: acrescente em VE_FX (parâmetros + draw da prévia) e em _filtros_fx (Functions/video_cutter.py).
// A prévia e a exportação precisam fazer a mesma conta.
// =========================================================

const VE_FX = {
    blur: {
        nome: 'Desfoque gaussiano', cat: 'Desfoque e nitidez', tag: 'Blur',
        params: [{ k: 'amt', nome: 'Desfoque', min: 0, max: 100, step: 0.5, def: 20, un: '%' }],
        neutro: v => !(v.amt > 0),
        // 100% = sigma de 5% do lado menor da mídia; bordas repetidas (não escurecem, igual ao ffmpeg gblur)
        draw(a, v, env) {
            const sp = v.amt * Math.min(env.mw, env.mh) / 2000 * env.q;
            if (sp < 0.05) return a;
            const p = Math.ceil(sp * 3) + 1, { w, h } = env;
            const P = veFxCanvas(2, w + 2 * p, h + 2 * p), x = P.ctx, s = a.cv;
            x.clearRect(0, 0, w + 2 * p, h + 2 * p);
            x.drawImage(s, p, p);
            x.drawImage(s, 0, 0, 1, h, 0, p, p, h);              // esquerda
            x.drawImage(s, w - 1, 0, 1, h, p + w, p, p, h);      // direita
            x.drawImage(s, 0, 0, w, 1, p, 0, w, p);              // cima
            x.drawImage(s, 0, h - 1, w, 1, p, p + h, w, p);      // baixo
            x.drawImage(s, 0, 0, 1, 1, 0, 0, p, p);              // cantos
            x.drawImage(s, w - 1, 0, 1, 1, p + w, 0, p, p);
            x.drawImage(s, 0, h - 1, 1, 1, 0, p + h, p, p);
            x.drawImage(s, w - 1, h - 1, 1, 1, p + w, p + h, p, p);
            const b = veFxOther(a, w, h);
            b.ctx.clearRect(0, 0, w, h);
            b.ctx.filter = `blur(${sp}px)`;
            b.ctx.drawImage(P.cv, -p, -p);
            b.ctx.filter = 'none';
            return b;
        },
    },
    bc: {
        nome: 'Brilho e contraste', cat: 'Correção de cor', tag: 'Cor',
        params: [
            { k: 'br', nome: 'Brilho', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'ct', nome: 'Contraste', min: -100, max: 100, step: 1, def: 0, un: '' },
        ],
        neutro: v => !v.br && !v.ct,
        draw(a, v, env) {
            const b = veFxOther(a, env.w, env.h);
            b.ctx.clearRect(0, 0, env.w, env.h);
            b.ctx.filter = `brightness(${1 + (v.br || 0) / 100}) contrast(${1 + (v.ct || 0) / 100})`;
            b.ctx.drawImage(a.cv, 0, 0);
            b.ctx.filter = 'none';
            return b;
        },
    },
    crop: {
        nome: 'Cortar', cat: 'Transformar', tag: 'Crop',
        params: [
            { k: 'l', nome: 'Esquerda', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 't', nome: 'Superior', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 'r', nome: 'Direita', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 'b', nome: 'Inferior', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
        ],
        neutro: v => !v.l && !v.t && !v.r && !v.b,
        // a área cortada fica transparente: aparece o que estiver na trilha de baixo
        draw(a, v, env) {
            const { w, h } = env, x = a.ctx;
            const px = (f, n) => f > 0 ? Math.max(1, Math.floor(n * f / 100)) : 0;
            const l = px(v.l, w), r = px(v.r, w), t = px(v.t, h), b = px(v.b, h);
            if (l) x.clearRect(0, 0, l, h);
            if (r) x.clearRect(w - r, 0, r, h);
            if (t) x.clearRect(0, 0, w, t);
            if (b) x.clearRect(0, h - b, w, b);
            return a;
        },
    },
};

const VEFX = { pool: [], collapsed: new Set(), key: '', drag: null };

// Canvases reaproveitados (0 e 1 alternam entre os passos; 2 = área com borda do desfoque)
function veFxCanvas(n, w, h) {
    while (VEFX.pool.length <= n) {
        const cv = document.createElement('canvas');
        VEFX.pool.push({ cv, ctx: cv.getContext('2d', { willReadFrequently: false }) });
    }
    const o = VEFX.pool[n];
    if (o.cv.width !== w || o.cv.height !== h) { o.cv.width = w; o.cv.height = h; }
    return o;
}
function veFxOther(a, w, h) { return veFxCanvas(a === VEFX.pool[0] ? 1 : 0, w, h); }

function veFxValues(f) {
    const d = VE_FX[f.t], v = {};
    d.params.forEach(p => { v[p.k] = f.v && isFinite(f.v[p.k]) ? +f.v[p.k] : p.def; });
    return v;
}

// Efeitos que mudam a imagem (ligados, conhecidos e fora do valor neutro)
function veFxActive(c) {
    return ((c && c.fx) || []).filter(f => f.on !== false && VE_FX[f.t] && !VE_FX[f.t].neutro(veFxValues(f)));
}
function veHasFx(c) { return !!(c && c.fx && c.fx.length); }

// Clipe de vídeo "puro": ocupa o quadro todo, sem efeitos (vai direto na base da exportação)
function veIsPlain(c) { return veIsDefaultProps(c) && !veFxActive(c).length; }

// Prévia: aplica os efeitos na mídia e devolve o que desenhar no lugar dela
function veFxRender(c, src, sz) {
    const fx = veFxActive(c);
    if (!fx.length) return src;
    const q = Math.min(1, 1920 / Math.max(sz.w, sz.h));
    const w = Math.max(1, Math.round(sz.w * q)), h = Math.max(1, Math.round(sz.h * q));
    let a = veFxCanvas(0, w, h);
    a.ctx.clearRect(0, 0, w, h);
    a.ctx.drawImage(src, 0, 0, w, h);
    const env = { w, h, q, mw: sz.w, mh: sz.h };
    fx.forEach(f => { a = VE_FX[f.t].draw(a, veFxValues(f), env); });
    return a.cv;
}

// Para a exportação: [{t, v}] só dos efeitos ativos
function veFxExport(c) { return veFxActive(c).map(f => ({ t: f.t, v: veFxValues(f) })); }

// ── aplicar / editar ──
function veFxNewId() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function veFxAdd(i, t) {
    const c = VE.clips[i];
    if (!c || !VE_FX[t]) return;
    if (VE.info && VE.info.audio_only) { veToast('Efeitos de vídeo precisam de um vídeo ou imagem'); return; }
    vePushHistory();
    const v = {};
    VE_FX[t].params.forEach(p => { v[p.k] = p.def; });
    c.fx = [...(c.fx || []), { id: veFxNewId(), t, on: true, v }];
    VE.sel = i;
    vedShow('props');
    veRefresh();
    veToast(`${VE_FX[t].nome} aplicado em ${veIsImage(c) ? 'Imagem' : 'Clipe'} ${i + 1}`);
}

// Troca o efeito `id` do clipe selecionado sem mexer no array antigo (clipes cortados compartilham)
function veFxEdit(id, fn) {
    const c = VE.clips[VE.sel];
    if (!c || !c.fx) return null;
    c.fx = c.fx.map(f => f.id === id ? fn({ ...f, v: { ...f.v } }) : f);
    return c;
}

function veFxAction(id, act) {
    const c = VE.clips[VE.sel];
    if (!c || !c.fx) return;
    const j = c.fx.findIndex(f => f.id === id);
    if (j < 0) return;
    if (act === 'fold') {
        VEFX.collapsed.has(id) ? VEFX.collapsed.delete(id) : VEFX.collapsed.add(id);
        VEFX.key = '';
        veRenderFxControls();
        return;
    }
    vePushHistory();
    if (act === 'on') veFxEdit(id, f => ({ ...f, on: f.on === false }));
    else if (act === 'reset') veFxEdit(id, f => { VE_FX[f.t].params.forEach(p => { f.v[p.k] = p.def; }); return f; });
    else if (act === 'del') { c.fx = c.fx.filter(f => f.id !== id); if (!c.fx.length) delete c.fx; }
    else if (act === 'up' || act === 'down') {
        const k = act === 'up' ? j - 1 : j + 1;
        if (k < 0 || k >= c.fx.length) return;
        const a = [...c.fx];
        [a[j], a[k]] = [a[k], a[j]];
        c.fx = a;
    }
    veRefresh();
}

// ── Controles de efeito: lista dos efeitos do clipe selecionado ──
function veFxFmt(p, v) { return String(veRound(v, p.step < 1 ? 1 : 0)); }

function veRenderFxControls() {
    const box = $ve('ve-fxc');
    if (!box) return;
    const c = VE.clips[VE.sel];
    const fx = (c && c.fx) || [];
    const key = VE.sel + '|' + fx.map(f => f.id + f.t + (f.on !== false) + VEFX.collapsed.has(f.id)).join(',');
    if (key !== VEFX.key) {
        VEFX.key = key;
        box.innerHTML = !fx.length ? '' : '<div class="ve-fxc-title">Efeitos</div>' + fx.map((f, j) => {
            const d = VE_FX[f.t];
            if (!d) return '';
            const off = f.on === false;
            return `<div class="ve-fxe${off ? ' off' : ''}${VEFX.collapsed.has(f.id) ? ' collapsed' : ''}" data-fx="${f.id}">
                <div class="ve-fxe-head">
                    <button class="ve-fxe-on" data-fa="on" title="${off ? 'Ligar' : 'Desligar'} efeito">fx</button>
                    <b data-fa="fold" title="Recolher/expandir">${d.nome}</b>
                    <button data-fa="up" title="Aplicar antes (subir)" ${j ? '' : 'disabled'}>▲</button>
                    <button data-fa="down" title="Aplicar depois (descer)" ${j < fx.length - 1 ? '' : 'disabled'}>▼</button>
                    <button data-fa="reset" title="Restaurar valores">↺</button>
                    <button data-fa="del" title="Remover efeito">✕</button>
                </div>
                <div class="ve-fxe-body">${d.params.map(p => `
                    <div class="ve-prop">
                        <label>${p.nome}</label>
                        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" data-fk="${p.k}">
                        <span class="ve-prop-num"><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" data-fk="${p.k}"><i>${p.un}</i></span>
                    </div>`).join('')}
                </div></div>`;
        }).join('');
    }
    fx.forEach(f => {
        const d = VE_FX[f.t], el = box.querySelector(`[data-fx="${f.id}"]`);
        if (!d || !el) return;
        const v = veFxValues(f);
        d.params.forEach(p => el.querySelectorAll(`[data-fk="${p.k}"]`).forEach(inp => {
            if (inp.ownerDocument.activeElement !== inp) inp.value = veFxFmt(p, v[p.k]);
        }));
    });
}

function veFxSetParam(id, k, val) {
    const c = VE.clips[VE.sel];
    const f = c && c.fx && c.fx.find(x => x.id === id);
    const p = f && VE_FX[f.t] && VE_FX[f.t].params.find(x => x.k === k);
    if (!p || !isFinite(val)) return;
    val = Math.min(Math.max(val, p.min), p.max);
    veFxEdit(id, x => { x.v[k] = val; return x; });
    veRenderFxControls();
    veDrawMonitor();
}

// ── painel Efeitos: lista, busca, arrastar até um clipe ──
function veRenderFxList() {
    const q = ($ve('ve-fx-q').value || '').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cats = {};
    Object.entries(VE_FX).forEach(([t, d]) => {
        const alvo = (d.nome + ' ' + d.tag + ' ' + d.cat).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (q && !alvo.includes(q)) return;
        (cats[d.cat] = cats[d.cat] || []).push([t, d]);
    });
    const html = Object.entries(cats).map(([cat, list]) => `<div class="ve-fx-cat">${cat}</div>` +
        list.map(([t, d]) => `<div class="ve-fx-item" data-fxt="${t}" title="Arraste até um clipe · duplo clique aplica no clipe selecionado"><i>fx</i><span>${d.nome}</span><small>${d.tag}</small></div>`).join('')).join('');
    $ve('ve-fx-list').innerHTML = html || '<div class="ve-clips-empty">Nenhum efeito encontrado.</div>';
}

// Clipe da timeline sob o ponto (-1 se nenhum); doc = documento do ponto (timeline pode estar em janela solta)
function veClipAtClient(x, y, doc) {
    const wrap = $ve('ve-tl-wrap'), r = wrap.getBoundingClientRect();
    if (!VE.ready || wrap.ownerDocument !== doc || !wrap.offsetParent || x < r.left || x > r.right || y < r.top || y > r.bottom) return -1;
    const row = veRowAt(y - r.top);
    if (!row) return -1;
    const i = veClipAtTrack(VE.view + (x - r.left) / VE.pps, veTrackIndex(row));
    return i >= 0 && row.kind === 'a' && veIsImage(VE.clips[i]) ? -1 : i;
}

function veFxInit() {
    veRenderFxList();
    $ve('ve-fx-q').addEventListener('input', veRenderFxList);
    $ve('ve-fx-q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; veRenderFxList(); e.target.blur(); } e.stopPropagation(); });
    const list = $ve('ve-fx-list');
    list.addEventListener('dblclick', e => {
        const it = e.target.closest('[data-fxt]');
        if (!it) return;
        if (VE.sel < 0) { veToast('Selecione um clipe na timeline (ou arraste o efeito até ele)'); return; }
        veFxAdd(VE.sel, it.dataset.fxt);
    });
    // arrastar o efeito: solta num clipe da timeline ou no Controles de efeito (clipe selecionado)
    list.addEventListener('pointerdown', e => {
        const it = e.target.closest('[data-fxt]');
        if (!it || e.button !== 0) return;
        const win = list.ownerDocument.defaultView, doc = list.ownerDocument;   // painel pode estar em janela solta
        VEFX.drag = { t: it.dataset.fxt, x0: e.clientX, y0: e.clientY, on: false, ghost: null };
        const move = ev => {
            const d = VEFX.drag;
            if (!d.on) {
                if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return;
                d.on = true;
                d.ghost = doc.createElement('div');
                d.ghost.className = 've-dghost';
                d.ghost.textContent = 'fx  ' + VE_FX[d.t].nome;
                doc.body.appendChild(d.ghost);
                doc.body.classList.add('ve-fx-dragging');
            }
            d.ghost.style.left = ev.clientX + 12 + 'px';
            d.ghost.style.top = ev.clientY + 10 + 'px';
            const i = veClipAtClient(ev.clientX, ev.clientY, doc);
            $ve('ve-tl-wrap').classList.toggle('fx-drop', i >= 0);
            if (i !== VE.fxHover) { VE.fxHover = i; veDraw(); }
        };
        const up = ev => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            const d = VEFX.drag;
            VEFX.drag = null;
            VE.fxHover = -1;
            $ve('ve-tl-wrap').classList.remove('fx-drop');
            doc.body.classList.remove('ve-fx-dragging');
            if (!d || !d.on) return;
            d.ghost.remove();
            veDraw();
            const i = veClipAtClient(ev.clientX, ev.clientY, doc);
            const props = doc.elementFromPoint(ev.clientX, ev.clientY)?.closest('#ve-pane-props');
            if (i >= 0) veFxAdd(i, d.t);
            else if (props && VE.sel >= 0) veFxAdd(VE.sel, d.t);
            else if (props) veToast('Selecione um clipe na timeline primeiro');
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });

    // Controles: botões e sliders dos efeitos aplicados (um passo de desfazer por gesto)
    const box = $ve('ve-fxc');
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-fa]');
        if (b) veFxAction(b.closest('[data-fx]').dataset.fx, b.dataset.fa);
    });
    box.addEventListener('input', e => {
        const el = e.target.closest('[data-fk]');
        if (!el) return;
        if (!VE._fxEdit) { vePushHistory(); VE._fxEdit = true; }
        veFxSetParam(el.closest('[data-fx]').dataset.fx, el.dataset.fk, parseFloat(String(el.value).replace(',', '.')));
    });
    box.addEventListener('change', () => { VE._fxEdit = false; veRenderClips(); veDraw(); });
}

document.addEventListener('DOMContentLoaded', veFxInit);
