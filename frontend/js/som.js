// =========================================================
// Sound Kanivete (Sk) — editor de áudio multipista. Backend: Functions/sound_kanivete.py (picos, .sknv, exportar).
// Projeto: SK.proj = {nome, faixas: [{id, nome, vol, mudo, solo, cor, clipes: [{id, arq, ini, de, dur, vol, fade_in,
// fade_out, nome}]}], marcadores: [{t, nome}]} (segundos; vol linear). A timeline é um canvas: forma de onda pelos
// picos (100/s), arrastar move (troca de faixa, encaixa em bordas/agulha), bordas aparam, cantos de cima = fades.
// Reprodução: um <audio> por clipe ligado ao WebAudio (ganho = clipe × faixa × fade), a agulha pelo relógio do contexto.
// Automação (Claude/Jr): window.SKN (fim do arquivo).
// =========================================================
const SK = { proj: null, caminho: null, sujo: false, sel: null, faixaSel: null, z: 60, x0: 0, y0: 0, ph: 0, tocando: false,
    picos: {}, hist: [], futuro: [], arr: null, encaixe: true, el: {}, ctx: null, t0: 0 };
const SK_H = 84, SK_REGUA = 26, SK_CORES = ['#ffd166', '#ff8c42', '#ef5f2b', '#ffb45c', '#e9c46a', '#f4a261'];
const skEl = id => document.getElementById(id);
const skApi = () => window.pywebview && window.pywebview.api;
const skId = p => p + Math.random().toString(36).slice(2, 8);
const skTempo = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(2).padStart(5, '0')}`; };
const skDb = v => v <= 0.0001 ? '-∞' : (20 * Math.log10(v)).toFixed(1);
const skToast = m => (typeof toast === 'function' ? toast(m) : console.log(m));
function skFim() { let f = 0; for (const fx of SK.proj?.faixas || []) for (const c of fx.clipes) f = Math.max(f, c.ini + c.dur); return f; }
function skClipe(id) { for (const f of SK.proj.faixas) { const c = f.clipes.find(x => x.id === id); if (c) return [c, f]; } return [null, null]; }

// ── estado, desfazer ──
function skSnap() { return JSON.stringify(SK.proj); }
function skMudou(rotulo) { if (SK._antes != null) { SK.hist.push(SK._antes); if (SK.hist.length > 120) SK.hist.shift(); SK.futuro = []; } SK._antes = null; SK.sujo = true; skUi(); skDesenhar(); }
function skAntes() { if (SK._antes == null) SK._antes = skSnap(); }
function skDesfazer() { if (!SK.hist.length) return; SK.futuro.push(skSnap()); SK.proj = JSON.parse(SK.hist.pop()); SK.sel = null; skParar(); skUi(); skDesenhar(); }
function skRefazer() { if (!SK.futuro.length) return; SK.hist.push(skSnap()); SK.proj = JSON.parse(SK.futuro.pop()); skParar(); skUi(); skDesenhar(); }
const SK_MODELOS = { vazio: ['Faixa 1'], podcast: ['Voz 1', 'Voz 2', 'Trilha', 'Efeitos'], narracao: ['Narração', 'Trilha'], musica: ['Voz', 'Instrumental', 'Backing'], limpar: ['Gravação'] };
function skNovo(modelo = 'vazio', nome = 'Sem título') {
    SK.proj = { nome, faixas: (SK_MODELOS[modelo] || [modelo]).map((n, i) => ({ id: skId('f'), nome: n, vol: 1, mudo: false, solo: false, cor: SK_CORES[i % SK_CORES.length], clipes: [] })), marcadores: [] };
    SK.caminho = null; SK.sujo = false; SK.hist = []; SK.futuro = []; SK.sel = null; SK.faixaSel = SK.proj.faixas[0].id; SK.ph = 0; SK.x0 = 0; SK.y0 = 0;
    skParar(); skUi(); skDesenhar();
}

// ── arquivos ──
async function skCarregarPicos(arq) {
    if (SK.picos[arq]) return SK.picos[arq];
    const r = await skApi().sk_info(arq);
    if (!r || !r.success) throw new Error((r && r.error) || 'não leu ' + arq);
    const bin = atob(r.picos), d = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) d[i] = bin.charCodeAt(i);
    SK.picos[arq] = { d, pps: r.pps, dur: r.dur, url: r.url, nome: r.nome };
    return SK.picos[arq];
}
async function skImportar(paths, { faixa = null, ini = null } = {}) {
    if (!SK.proj) skNovo();
    let f = SK.proj.faixas.find(x => x.id === (faixa || SK.faixaSel)) || SK.proj.faixas[0];
    skAntes();
    const novos = [];
    for (const p of paths) {
        let info;
        try { info = await skCarregarPicos(p); } catch (e) { skToast(e.message); continue; }
        if (f.clipes.length && novos.length && paths.length > 1) {   // vários arquivos: um por faixa
            const prox = SK.proj.faixas[SK.proj.faixas.indexOf(f) + 1];
            f = prox && !prox.clipes.length ? prox : skNovaFaixa(info.nome.replace(/\.[^.]+$/, ''), false);
        }
        const t = ini != null ? ini : (f.clipes.length ? Math.max(...f.clipes.map(c => c.ini + c.dur)) : 0);
        const c = { id: skId('c'), arq: p, ini: t, de: 0, dur: info.dur, vol: 1, fade_in: 0, fade_out: 0, nome: info.nome };
        f.clipes.push(c); novos.push(c.id);
    }
    if (novos.length) { SK.sel = novos[novos.length - 1]; skMudou('importar'); skEnquadrar(); }
    return novos;
}
function skNovaFaixa(nome, registrar = true) {
    if (registrar) skAntes();
    const f = { id: skId('f'), nome: nome || `Faixa ${SK.proj.faixas.length + 1}`, vol: 1, mudo: false, solo: false, cor: SK_CORES[SK.proj.faixas.length % SK_CORES.length], clipes: [] };
    SK.proj.faixas.push(f); SK.faixaSel = f.id;
    if (registrar) skMudou('nova faixa');
    return f;
}
async function skSalvar(como = false) {
    let c = SK.caminho;
    if (!c || como) c = await skApi().sk_dialogo('salvar', ['Projeto do Sound Kanivete (*.sknv)'], (SK.proj.nome || 'Sem titulo') + '.sknv');
    if (!c) return null;
    const r = await skApi().sk_salvar(SK.proj, c);
    if (!r.success) throw new Error(r.error);
    SK.caminho = r.caminho; SK.sujo = false; SK.proj.nome = r.caminho.split(/[\\/]/).pop().replace(/\.sknv$/i, '');
    skRecente(r.caminho); skUi(); skToast('Projeto salvo');
    return r.caminho;
}
async function skAbrir(caminho) {
    if (!caminho) caminho = await skApi().sk_dialogo('abrir', ['Projeto do Sound Kanivete (*.sknv)']);
    if (!caminho) return false;
    const r = await skApi().sk_abrir(caminho);
    if (!r.success) throw new Error(r.error);
    SK.proj = r.proj; SK.caminho = r.caminho; SK.sujo = false; SK.hist = []; SK.futuro = []; SK.sel = null; SK.ph = 0;
    SK.faixaSel = SK.proj.faixas[0]?.id;
    for (const f of SK.proj.faixas) for (const c of f.clipes) { try { await skCarregarPicos(c.arq); } catch (e) { /* faltando */ } }
    if (r.faltando.length) skToast(`${r.faltando.length} arquivo(s) não encontrado(s)`);
    skRecente(caminho); skParar(); skUi(); skEnquadrar();
    return true;
}
function skRecente(c) { try { const l = JSON.parse(localStorage.getItem('sk-recentes') || '[]').filter(x => x !== c); l.unshift(c); localStorage.setItem('sk-recentes', JSON.stringify(l.slice(0, 8))); } catch (e) { /* sem storage */ } }

// ── edição ──
function skCortar(t = SK.ph, ids = null) {   // corta os clipes sob a agulha (os selecionados, ou todos)
    skAntes(); let n = 0;
    for (const f of SK.proj.faixas) for (const c of [...f.clipes]) {
        if ((ids && !ids.includes(c.id)) || (!ids && SK.sel && c.id !== SK.sel)) continue;
        if (t <= c.ini + 0.01 || t >= c.ini + c.dur - 0.01) continue;
        const d = t - c.ini, b = { ...c, id: skId('c'), ini: t, de: c.de + d, dur: c.dur - d, fade_in: 0 };
        c.dur = d; c.fade_out = 0; f.clipes.push(b); n++;
    }
    if (n) skMudou('cortar'); else SK._antes = null;
    return n;
}
function skApagar(id = SK.sel) { const [c, f] = skClipe(id); if (!c) return; skAntes(); f.clipes.splice(f.clipes.indexOf(c), 1); SK.sel = null; skMudou('apagar'); }
function skDuplicar(id = SK.sel) { const [c, f] = skClipe(id); if (!c) return; skAntes(); const d = { ...c, id: skId('c'), ini: c.ini + c.dur }; f.clipes.push(d); SK.sel = d.id; skMudou('duplicar'); }
function skMarcador(t = SK.ph, nome = '') { skAntes(); SK.proj.marcadores.push({ t, nome: nome || `M${SK.proj.marcadores.length + 1}` }); skMudou('marcador'); }

// ── reprodução ──
function skCtx() { if (!SK.ctx) SK.ctx = new (window.AudioContext || window.webkitAudioContext)(); return SK.ctx; }
function skNo(c) {
    let n = SK.el[c.id];
    const info = SK.picos[c.arq];
    if (!info) return null;
    if (!n || n.url !== info.url) {
        const a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; a.src = info.url;
        const ctx = skCtx(), src = ctx.createMediaElementSource(a), g = ctx.createGain();
        src.connect(g); g.connect(ctx.destination);
        n = SK.el[c.id] = { a, g, url: info.url };
    }
    return n;
}
function skGanho(c, f, t) {
    const d = t - c.ini; let g = c.vol * f.vol;
    if (c.fade_in > 0 && d < c.fade_in) g *= Math.max(0, d / c.fade_in);
    if (c.fade_out > 0 && d > c.dur - c.fade_out) g *= Math.max(0, (c.dur - d) / c.fade_out);
    return g;
}
function skTocar() {
    if (!SK.proj || SK.tocando) return;
    const ctx = skCtx(); ctx.resume();
    if (SK.ph >= skFim()) SK.ph = 0;
    SK.tocando = true; SK.t0 = ctx.currentTime - SK.ph;
    const passo = () => {
        if (!SK.tocando) return;
        SK.ph = ctx.currentTime - SK.t0;
        const solo = SK.proj.faixas.some(f => f.solo);
        for (const f of SK.proj.faixas) for (const c of f.clipes) {
            const ativo = !f.mudo && (!solo || f.solo) && SK.ph >= c.ini && SK.ph < c.ini + c.dur;
            const n = ativo ? skNo(c) : SK.el[c.id];
            if (!n) continue;
            if (ativo) {
                const alvo = c.de + (SK.ph - c.ini);
                if (n.a.paused) { n.a.currentTime = alvo; n.a.play().catch(() => {}); }
                else if (Math.abs(n.a.currentTime - alvo) > 0.12) n.a.currentTime = alvo;
                n.g.gain.value = skGanho(c, f, SK.ph);
            } else if (!n.a.paused) n.a.pause();
        }
        if (SK.ph >= skFim() + 0.2) { skParar(); return; }
        skSeguir(); skDesenhar(); skUiTempo();
        SK.raf = requestAnimationFrame(passo);
    };
    SK.raf = requestAnimationFrame(passo);
    skUi();
}
function skParar() {
    SK.tocando = false; cancelAnimationFrame(SK.raf);
    for (const n of Object.values(SK.el)) try { n.a.pause(); } catch (e) { /* já parado */ }
    skUi?.(); skDesenhar?.();
}
function skSeguir() { const cv = skEl('sk-tl'); if (!cv) return; const x = (SK.ph - SK.x0) * SK.z, w = cv.clientWidth; if (x > w * 0.9 || x < 0) SK.x0 = Math.max(0, SK.ph - w * 0.1 / SK.z); }
function skIr(t) { SK.ph = Math.max(0, t); if (SK.tocando) { SK.t0 = SK.ctx.currentTime - SK.ph; for (const n of Object.values(SK.el)) n.a.pause(); } skDesenhar(); skUiTempo(); }

// ── desenho da timeline ──
function skDesenhar() {
    const cv = skEl('sk-tl'); if (!cv) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#161210'; x.fillRect(0, 0, W, H);
    if (!SK.proj) return;
    const X = t => (t - SK.x0) * SK.z, Y = i => SK_REGUA + i * SK_H - SK.y0;
    // régua
    x.fillStyle = '#1f1915'; x.fillRect(0, 0, W, SK_REGUA);
    const passos = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600], p = passos.find(s => s * SK.z >= 70) || 600;
    x.fillStyle = '#a89a8f'; x.font = '10.5px system-ui'; x.strokeStyle = '#3a302a'; x.lineWidth = 1;
    for (let t = Math.floor(SK.x0 / p) * p; X(t) < W; t += p) { const px = Math.round(X(t)) + 0.5; x.beginPath(); x.moveTo(px, SK_REGUA - 8); x.lineTo(px, H); x.stroke(); x.fillText(skTempo(t).replace(/\.00$/, ''), px + 3, 12); }
    // faixas e clipes
    SK.proj.faixas.forEach((f, i) => {
        const y = Y(i);
        if (y > H || y + SK_H < SK_REGUA) return;
        x.fillStyle = f.id === SK.faixaSel ? '#211a15' : (i % 2 ? '#191411' : '#1b1612'); x.fillRect(0, y, W, SK_H);
        x.strokeStyle = '#2b231e'; x.beginPath(); x.moveTo(0, y + SK_H - 0.5); x.lineTo(W, y + SK_H - 0.5); x.stroke();
        for (const c of f.clipes) {
            const cx = X(c.ini), cw = c.dur * SK.z;
            if (cx > W || cx + cw < 0) continue;
            const sel = c.id === SK.sel, ap = f.mudo ? 0.35 : 1;
            x.globalAlpha = ap;
            x.fillStyle = sel ? '#3a2a1d' : '#2a211b'; x.strokeStyle = sel ? f.cor : '#4a3b31'; x.lineWidth = sel ? 2 : 1;
            x.beginPath(); x.roundRect(cx + 0.5, y + 3.5, Math.max(2, cw - 1), SK_H - 7, 5); x.fill(); x.stroke();
            // forma de onda
            const info = SK.picos[c.arq];
            if (info) {
                const meio = y + SK_H / 2 + 6, alt = (SK_H - 26) / 2 * c.vol, a = Math.max(0, -cx), b = Math.min(cw, W - cx);
                x.fillStyle = f.cor; x.beginPath();
                for (let px = a; px < b; px++) {
                    const t0 = c.de + px / SK.z, t1 = c.de + (px + 1) / SK.z;
                    let m = 0; for (let k = Math.floor(t0 * info.pps), k1 = Math.max(k + 1, Math.ceil(t1 * info.pps)); k < k1 && k < info.d.length; k++) m = Math.max(m, info.d[k]);
                    const tt = c.ini + px / SK.z; let g = 1;
                    if (c.fade_in > 0 && tt - c.ini < c.fade_in) g = (tt - c.ini) / c.fade_in;
                    if (c.fade_out > 0 && c.ini + c.dur - tt < c.fade_out) g = Math.min(g, (c.ini + c.dur - tt) / c.fade_out);
                    const h = Math.max(0.5, m / 255 * alt * g);
                    x.rect(cx + px, meio - h, 1, h * 2);
                }
                x.fill();
            }
            // fades (linhas) e alças
            x.strokeStyle = '#fff8'; x.lineWidth = 1;
            if (c.fade_in > 0) { x.beginPath(); x.moveTo(cx, y + SK_H - 4); x.lineTo(cx + c.fade_in * SK.z, y + 16); x.stroke(); }
            if (c.fade_out > 0) { x.beginPath(); x.moveTo(cx + cw, y + SK_H - 4); x.lineTo(cx + cw - c.fade_out * SK.z, y + 16); x.stroke(); }
            if (sel) { x.fillStyle = '#fff'; for (const hx of [cx + c.fade_in * SK.z, cx + cw - c.fade_out * SK.z]) x.fillRect(hx - 4, y + 12, 8, 8); }
            x.fillStyle = '#f1e6dc'; x.font = '11px system-ui';
            if (cw > 30) x.fillText(c.nome.slice(0, Math.floor(cw / 7)), cx + 7, y + 16);
            x.globalAlpha = 1;
        }
    });
    // marcadores e agulha
    for (const m of SK.proj.marcadores) { const mx = Math.round(X(m.t)) + 0.5; x.strokeStyle = '#ffd166'; x.beginPath(); x.moveTo(mx, 0); x.lineTo(mx, H); x.stroke(); x.fillStyle = '#ffd166'; x.fillText(m.nome, mx + 3, SK_REGUA - 3); }
    const hx = Math.round(X(SK.ph)) + 0.5;
    x.strokeStyle = '#ff6a2c'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(hx, 0); x.lineTo(hx, H); x.stroke();
    x.fillStyle = '#ff6a2c'; x.beginPath(); x.moveTo(hx - 6, 0); x.lineTo(hx + 6, 0); x.lineTo(hx, 8); x.fill();
}
function skEnquadrar() { const cv = skEl('sk-tl'); if (!cv || !SK.proj) return; const f = Math.max(10, skFim()); SK.z = Math.max(2, (cv.clientWidth - 40) / f); SK.x0 = 0; skDesenhar(); }

// ── mouse na timeline ──
function skAlvo(px, py) {
    const t = SK.x0 + px / SK.z, i = Math.floor((py - SK_REGUA + SK.y0) / SK_H), f = SK.proj.faixas[i];
    if (py < SK_REGUA) return { regua: true, t };
    if (!f) return { t, i };
    for (const c of [...f.clipes].reverse()) {
        const cx = (c.ini - SK.x0) * SK.z, cw = c.dur * SK.z, y = SK_REGUA + i * SK_H - SK.y0;
        if (px < cx - 4 || px > cx + cw + 4) continue;
        if (c.id === SK.sel && py < y + 24) {
            if (Math.abs(px - (cx + c.fade_in * SK.z)) < 7) return { c, f, t, i, parte: 'fade_in' };
            if (Math.abs(px - (cx + cw - c.fade_out * SK.z)) < 7) return { c, f, t, i, parte: 'fade_out' };
        }
        if (Math.abs(px - cx) < 6) return { c, f, t, i, parte: 'esq' };
        if (Math.abs(px - (cx + cw)) < 6) return { c, f, t, i, parte: 'dir' };
        if (px >= cx && px <= cx + cw) return { c, f, t, i, parte: 'meio' };
    }
    return { t, i, f };
}
function skEncaixar(t, ignorar) {
    if (!SK.encaixe) return t;
    const tol = 8 / SK.z; let melhor = t, d = tol;
    const pontos = [SK.ph, 0, ...SK.proj.marcadores.map(m => m.t)];
    for (const f of SK.proj.faixas) for (const c of f.clipes) if (c.id !== ignorar) pontos.push(c.ini, c.ini + c.dur);
    for (const p of pontos) if (Math.abs(p - t) < d) { d = Math.abs(p - t); melhor = p; }
    return melhor;
}
function skEventos() {
    const cv = skEl('sk-tl');
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
        if (!SK.proj) return;
        cv.setPointerCapture(e.pointerId);
        const [px, py] = pos(e), a = skAlvo(px, py);
        if (a.regua || !a.c) { if (a.f) SK.faixaSel = a.f.id; SK.sel = null; skIr(a.t); SK.arr = { modo: 'agulha' }; skUi(); return; }
        SK.sel = a.c.id; SK.faixaSel = a.f.id;
        skAntes();
        SK.arr = { modo: a.parte, c: a.c, f: a.f, x: px, y: py, ini: a.c.ini, de: a.c.de, dur: a.c.dur, fi: a.c.fade_in, fo: a.c.fade_out, moveu: false };
        if (e.altKey && a.parte === 'meio') {   // Alt+arrastar = cópia
            const d = { ...a.c, id: skId('c') }; a.f.clipes.push(d); SK.arr.c = d; SK.sel = d.id;
        }
        skUi(); skDesenhar();
    });
    cv.addEventListener('pointermove', e => {
        const [px, py] = pos(e);
        if (!SK.arr) { const a = SK.proj && skAlvo(px, py); cv.style.cursor = !a || !a.c ? 'default' : a.parte === 'meio' ? 'grab' : a.parte.startsWith('fade') ? 'crosshair' : 'ew-resize'; return; }
        const A = SK.arr, dt = (px - (A.x ?? px)) / SK.z;
        if (A.modo === 'agulha') { skIr(SK.x0 + px / SK.z); return; }
        A.moveu = true;
        const c = A.c;
        if (A.modo === 'meio') {
            let ini = Math.max(0, A.ini + dt);
            const e1 = skEncaixar(ini, c.id), e2 = skEncaixar(ini + c.dur, c.id) - c.dur;
            ini = Math.abs(e1 - ini) <= Math.abs(e2 - ini) ? e1 : Math.max(0, e2);
            c.ini = ini;
            const i = Math.max(0, Math.min(SK.proj.faixas.length - 1, Math.floor((py - SK_REGUA + SK.y0) / SK_H))), nf = SK.proj.faixas[i];
            if (nf && nf !== A.f) { A.f.clipes.splice(A.f.clipes.indexOf(c), 1); nf.clipes.push(c); A.f = nf; SK.faixaSel = nf.id; }
        } else if (A.modo === 'esq') {
            const max = SK.picos[c.arq]?.dur ?? Infinity;
            let ini = skEncaixar(Math.max(A.ini - A.de, A.ini + dt), c.id); ini = Math.min(ini, A.ini + A.dur - 0.05);
            c.de = A.de + (ini - A.ini); c.dur = A.dur - (ini - A.ini); c.ini = ini;
            if (c.de < 0) { c.dur += c.de; c.ini -= c.de; c.de = 0; }
        } else if (A.modo === 'dir') {
            const max = (SK.picos[c.arq]?.dur ?? Infinity) - c.de;
            c.dur = Math.max(0.05, Math.min(max, skEncaixar(A.ini + A.dur + dt, c.id) - c.ini));
        } else if (A.modo === 'fade_in') c.fade_in = Math.max(0, Math.min(c.dur - c.fade_out, A.fi + dt));
        else if (A.modo === 'fade_out') c.fade_out = Math.max(0, Math.min(c.dur - c.fade_in, A.fo - dt));
        skDesenhar(); skUiProps();
    });
    const solta = () => { const A = SK.arr; SK.arr = null; if (!A || A.modo === 'agulha') return; if (A.moveu) skMudou(A.modo); else SK._antes = null; };
    cv.addEventListener('pointerup', solta); cv.addEventListener('pointercancel', solta);
    cv.addEventListener('wheel', e => {
        e.preventDefault();
        if (e.ctrlKey) { const [px] = pos(e), t = SK.x0 + px / SK.z; SK.z = Math.max(1, Math.min(4000, SK.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); SK.x0 = Math.max(0, t - px / SK.z); }
        else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) SK.x0 = Math.max(0, SK.x0 + (e.deltaX || e.deltaY) / SK.z);
        else { SK.y0 = Math.max(0, Math.min(Math.max(0, SK.proj.faixas.length * SK_H - cv.clientHeight + SK_REGUA + 20), SK.y0 + e.deltaY)); skUiFaixas(); }
        skDesenhar();
    }, { passive: false });
    new ResizeObserver(() => skDesenhar()).observe(cv);
    document.addEventListener('keydown', e => {
        if (!skEl('page-sound-kanivete')?.classList.contains('active') || !SK.proj) return;
        if (e.target.closest('input, textarea, select, [contenteditable]')) return;
        const k = e.key.toLowerCase(), C = e.ctrlKey || e.metaKey;
        const faz = f => { e.preventDefault(); f(); };
        if (k === ' ') return faz(() => SK.tocando ? skParar() : skTocar());
        if (C && k === 'z') return faz(e.shiftKey ? skRefazer : skDesfazer);
        if (C && k === 'y') return faz(skRefazer);
        if (C && k === 's') return faz(() => skSalvar(e.shiftKey).catch(er => skToast(er.message)));
        if (C && k === 'e') return faz(() => skExportarDialogo());
        if (C && k === 'd') return faz(() => skDuplicar());
        if (C && k === 'i') return faz(() => skImportarDialogo());
        if (k === 's' || (C && k === 'k')) return faz(() => skCortar());
        if (k === 'delete' || k === 'backspace') return faz(() => skApagar());
        if (k === 'm') return faz(() => skMarcador());
        if (k === 'home') return faz(() => skIr(0));
        if (k === 'end') return faz(() => skIr(skFim()));
        if (k === '+' || k === '=') return faz(() => { SK.z *= 1.25; skDesenhar(); });
        if (k === '-') return faz(() => { SK.z /= 1.25; skDesenhar(); });
        if (k === '0' && C) return faz(skEnquadrar);
    });
}

// ── interface ──
function skMontar() {
    const raiz = skEl('sk'); if (!raiz || raiz.dataset.ok) return;
    raiz.dataset.ok = '1';
    raiz.innerHTML = `
    <header class="ie-top">
        <div class="ie-brand"><span class="app-logo al-sk app-logo-marca">Sk</span> Sound Kanivete</div>
        <div class="sk-tbar">
            <button class="ie-btn" onclick="skImportarDialogo()" title="Importar áudio (Ctrl+I)">+ Áudio</button>
            <button class="ie-btn" onclick="skNovaFaixa()" title="Nova faixa">+ Faixa</button>
            <button class="ie-btn" onclick="skVozDialogo()" title="Gerar fala com uma voz salva (OmniVoice)">🎙 Voz IA</button>
            <button class="ie-btn" onclick="skSonsDialogo()" title="Sons prontos (CC0) na agulha">🔊 Sons</button>
            <button class="ie-btn" onclick="if (SK.proj) { SK.painel = SK.painel === 'texto' ? 'props' : 'texto'; skUiProps(); }" title="Transcrever e legendas">📝 Texto</button>
            <span class="sk-sep"></span>
            <button class="ie-btn sk-play" id="sk-play" onclick="SK.tocando ? skParar() : skTocar()" title="Tocar/parar (Espaço)">▶</button>
            <span class="sk-tempo" id="sk-tempo">0:00.00</span>
            <button class="ie-btn" onclick="skCortar()" title="Cortar na agulha (S)">✂ Cortar</button>
            <button class="ie-btn" onclick="skMarcador()" title="Marcador (M)">◆</button>
            <label class="sk-chk"><input type="checkbox" id="sk-encaixe" checked onchange="SK.encaixe = this.checked"> Encaixar</label>
            <button class="ie-btn" onclick="skEnquadrar()" title="Ver tudo (Ctrl+0)">⤢</button>
        </div>
        <div class="ie-top-spacer"></div>
        <span class="ie-top-info notranslate" id="sk-info"></span>
        <button class="ie-btn" onclick="skAbrir().catch(e => skToast(e.message))">Abrir</button>
        <button class="ie-btn" onclick="skExportarDialogo()" title="Exportar (Ctrl+E)">Exportar</button>
        <button class="ie-btn ie-btn-primario" onclick="skSalvar().catch(e => skToast(e.message))" title="Salvar .sknv (Ctrl+S)">Salvar</button>
    </header>
    <div class="sk-corpo">
        <div class="sk-faixas notranslate" id="sk-faixas"></div>
        <div class="sk-tl-wrap"><canvas id="sk-tl"></canvas>
            <div class="ie-inicio" id="sk-inicio"><div class="ie-inicio-box">
                <span class="app-logo al-sk app-logo-grande">Sk</span><h2>Sound Kanivete</h2>
                <p>Edite áudio em várias faixas: cortar, juntar, fades, volume, limpar ruído, voz por IA, transcrever e exportar no volume certo.</p>
                <div class="ie-inicio-acoes"><button class="ie-btn ie-btn-primario" onclick="skImportarDialogo()">Importar áudio…</button><button class="ie-btn" onclick="skAbrir().catch(e => skToast(e.message))">Abrir projeto…</button></div>
                <div class="ie-recentes-tit">Começar com</div>
                <div class="sk-modelos">${[['podcast', 'Podcast (2 vozes)'], ['narracao', 'Narração com trilha'], ['musica', 'Música com voz'], ['limpar', 'Limpar gravação'], ['vazio', 'Projeto vazio']].map(([k, n]) => `<button class="ie-btn" onclick="skNovo('${k}')">${n}</button>`).join('')}</div>
                <div class="ie-recentes" id="sk-recentes"></div>
            </div></div>
        </div>
        <aside class="sk-props" id="sk-props"></aside>
    </div>
    <footer class="ie-status sk-status"><span>Espaço tocar · S cortar · Alt+arrastar copia · cantos de cima = fades · Ctrl+roda zoom</span><span id="sk-status-info"></span></footer>`;
    skEventos();
    skUi();
}
function skUiTempo() { const t = skEl('sk-tempo'); if (t) t.textContent = skTempo(SK.ph); }
function skUiFaixas() {
    const el = skEl('sk-faixas'); if (!el) return;
    if (!SK.proj) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="sk-f-topo" style="height:${SK_REGUA}px"></div><div class="sk-f-lista" style="transform:translateY(${-SK.y0}px)">${SK.proj.faixas.map(f => `
        <div class="sk-f${f.id === SK.faixaSel ? ' sel' : ''}" data-f="${f.id}" style="height:${SK_H}px;--cor:${f.cor}">
            <input class="sk-f-nome" value="${(f.nome || '').replace(/"/g, '&quot;')}" data-nome="${f.id}">
            <div class="sk-f-bts"><button class="${f.mudo ? 'on' : ''}" data-mudo="${f.id}" title="Mudo">M</button><button class="${f.solo ? 'on' : ''}" data-solo="${f.id}" title="Solo">S</button><button data-apaga="${f.id}" title="Apagar faixa">×</button></div>
            <label class="sk-f-vol" title="Volume da faixa"><input type="range" min="0" max="2" step="0.01" value="${f.vol}" data-vol="${f.id}"><span>${skDb(f.vol)} dB</span></label>
        </div>`).join('')}</div>`;
}
function skUiProps() {
    const el = skEl('sk-props'); if (!el) return;
    if (!SK.proj) { el.innerHTML = ''; return; }
    const [c] = SK.sel ? skClipe(SK.sel) : [null];
    const num = (r, k, v, passo, uni) => `<label class="sk-p-l">${r}<input type="number" step="${passo}" value="${(+v).toFixed(2)}" data-p="${k}"><small>${uni}</small></label>`;
    el.innerHTML = c ? `<div class="sk-p-tit">Clipe</div><div class="sk-p-nome notranslate">${c.nome}</div>
        ${num('Começa em', 'ini', c.ini, 0.01, 's')}${num('Duração', 'dur', c.dur, 0.01, 's')}${num('Desde', 'de', c.de, 0.01, 's')}
        <label class="sk-p-l">Volume<input type="range" min="0" max="3" step="0.01" value="${c.vol}" data-p="vol"><small>${skDb(c.vol)} dB</small></label>
        ${num('Fade de entrada', 'fade_in', c.fade_in, 0.05, 's')}${num('Fade de saída', 'fade_out', c.fade_out, 0.05, 's')}
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="skCortar()">Cortar na agulha</button><button class="ie-btn ie-btn-mini" onclick="skDuplicar()">Duplicar</button><button class="ie-btn ie-btn-mini" onclick="skApagar()">Apagar</button></div>
        <div class="sk-p-efeitos" id="sk-efeitos"></div>`
        : `<div class="sk-p-tit">Projeto</div><div class="sk-p-nome notranslate">${SK.proj.nome}</div><div class="sk-p-info">${SK.proj.faixas.length} faixa(s) · ${skTempo(skFim())}</div>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" onclick="skMedirLufs()">Medir volume (LUFS)</button></div><div class="sk-p-info" id="sk-lufs"></div>
        <div class="sk-p-info">Clique num clipe para editar. Arraste áudios para a timeline.</div>`;
    if (typeof skUiEfeitos === 'function' && c) skUiEfeitos(c);
}
function skUi() {
    const ini = skEl('sk-inicio'); if (!ini) return;
    ini.hidden = !!SK.proj;
    const play = skEl('sk-play'); if (play) play.textContent = SK.tocando ? '■' : '▶';
    skEl('sk-info').textContent = SK.proj ? `${SK.proj.nome}${SK.sujo ? ' •' : ''}` : '';
    skUiTempo(); skUiFaixas(); skUiProps();
    let l = []; try { l = JSON.parse(localStorage.getItem('sk-recentes') || '[]'); } catch (e) { /* sem storage */ }
    const rc = skEl('sk-recentes'); if (rc) rc.innerHTML = l.length ? `<div class="ie-recentes-tit">Recentes</div>${l.map(c => `<button class="ie-recente notranslate" onclick="skAbrir(${JSON.stringify(c).replace(/"/g, '&quot;')}).catch(e => skToast(e.message))">${c.split(/[\\/]/).pop()}</button>`).join('')}` : '';
}
async function skImportarDialogo() {
    const r = await skApi().sk_dialogo('abrir_varios', ['Áudio e vídeo (*.mp3;*.wav;*.m4a;*.aac;*.ogg;*.opus;*.flac;*.wma;*.aiff;*.mp4;*.mov;*.mkv;*.webm)', 'Todos (*.*)']);
    if (r && r.length) await skImportar(r);
}
async function skMedirLufs() { const el = skEl('sk-lufs'); el.textContent = 'Medindo...'; const r = await skApi().sk_medir(SK.proj); el.textContent = r.success ? `${r.lufs.toFixed(1)} LUFS · pico ${r.pico.toFixed(1)} dBTP` : r.error; }
function skExportarDialogo() {
    if (!SK.proj) return;
    const m = document.createElement('div'); m.className = 'ie-modal'; m.id = 'sk-modal';
    m.innerHTML = `<div class="ie-dlg"><div class="ie-dlg-tit">Exportar áudio</div><div class="ie-dlg-corpo sk-exp">
        <label>Formato <select id="ske-f">${['mp3', 'wav', 'm4a', 'ogg', 'flac', 'opus'].map(f => `<option>${f}</option>`).join('')}</select></label>
        <label>Qualidade <select id="ske-k"><option value="320">320 kbps</option><option value="192" selected>192 kbps</option><option value="128">128 kbps</option></select></label>
        <label>Volume final <select id="ske-l"><option value="">Como está</option><option value="-14">-14 LUFS (YouTube, Spotify, Instagram)</option><option value="-16">-16 LUFS (podcast)</option><option value="-23">-23 LUFS (TV)</option></select></label>
        <label>Faixas <select id="ske-fx"><option value="">Mixagem de todas</option>${SK.proj.faixas.map(f => `<option value="${f.id}">Só "${f.nome}"</option>`).join('')}</select></label>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="ske-ok">Exportar</button></div></div>`;
    skEl('sk').appendChild(m);
    m.onclick = e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); };
    m.querySelector('#ske-ok').onclick = async () => {
        const g = s => m.querySelector(s).value, fmt = g('#ske-f');
        const c = await skApi().sk_dialogo('salvar', [`Áudio (*.${fmt})`], `${SK.proj.nome || 'audio'}.${fmt}`);
        if (!c) return;
        m.remove();
        const r = await SKN.exportar(c, { formato: fmt, kbps: +g('#ske-k'), lufs: g('#ske-l') === '' ? null : +g('#ske-l'), faixas: g('#ske-fx') ? [g('#ske-fx')] : null }).catch(e => ({ success: false, error: e.message }));
        skToast(r.success ? `Exportado: ${r.caminho.split(/[\\/]/).pop()}` : r.error);
    };
}
(function () {   // eventos do painel de faixas e propriedades (delegados)
    document.addEventListener('input', e => {
        const t = e.target;
        if (t.dataset.vol) { const f = SK.proj.faixas.find(x => x.id === t.dataset.vol); skAntes(); f.vol = +t.value; t.nextElementSibling.textContent = skDb(f.vol) + ' dB'; SK.sujo = true; }
        if (t.dataset.p && SK.sel) { const [c] = skClipe(SK.sel); skAntes(); c[t.dataset.p] = Math.max(0, +t.value); if (t.dataset.p === 'vol') t.nextElementSibling.textContent = skDb(c.vol) + ' dB'; skDesenhar(); }
    });
    document.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.nome) { const f = SK.proj.faixas.find(x => x.id === t.dataset.nome); skAntes(); f.nome = t.value; skMudou('nome'); }
        if (t.dataset.vol || (t.dataset.p && SK.sel)) skMudou('valor');
    });
    document.addEventListener('click', e => {
        const b = e.target.closest('#sk [data-mudo], #sk [data-solo], #sk [data-apaga], #sk .sk-f');
        if (!b || !SK.proj) return;
        if (b.dataset.mudo || b.dataset.solo) { const id = b.dataset.mudo || b.dataset.solo, k = b.dataset.mudo ? 'mudo' : 'solo', f = SK.proj.faixas.find(x => x.id === id); skAntes(); f[k] = !f[k]; skMudou(k); return; }
        if (b.dataset.apaga) { const f = SK.proj.faixas.find(x => x.id === b.dataset.apaga); if (f.clipes.length && !confirm(`Apagar a faixa "${f.nome}" e os clipes dela?`)) return; skAntes(); SK.proj.faixas.splice(SK.proj.faixas.indexOf(f), 1); skMudou('apagar faixa'); return; }
        if (b.dataset.f && !e.target.closest('input')) { SK.faixaSel = b.dataset.f; skUiFaixas(); skDesenhar(); }
    });
    const pg = () => skEl('page-sound-kanivete');
    const ver = () => { if (pg()?.classList.contains('active')) { skMontar(); skDesenhar(); } else if (SK.tocando) skParar(); };
    document.addEventListener('DOMContentLoaded', () => { const p = pg(); if (p) new MutationObserver(ver).observe(p, { attributes: true, attributeFilter: ['class'] }); ver(); });
})();

// ── automação: window.SKN (Claude, Jr, testes) ──
window.SKN = {
    novo: (modelo = 'vazio', nome) => { skMontar(); skNovo(modelo, nome); return SKN.estado(); },
    importar: async (paths, op = {}) => skImportar([].concat(paths), op),
    faixa: (nome) => skNovaFaixa(nome).id,
    alterarFaixa: (id, v) => { const f = SK.proj.faixas.find(x => x.id === id || x.nome === id); skAntes(); Object.assign(f, v); skMudou('faixa'); return f; },
    alterarClipe: (id, v) => { const [c] = skClipe(id); skAntes(); Object.assign(c, v); skMudou('clipe'); return c; },
    mover: (id, ini, faixa) => { const [c, f] = skClipe(id); skAntes(); c.ini = Math.max(0, ini); if (faixa) { const nf = SK.proj.faixas.find(x => x.id === faixa || x.nome === faixa); f.clipes.splice(f.clipes.indexOf(c), 1); nf.clipes.push(c); } skMudou('mover'); },
    cortar: (t, ids) => skCortar(t, ids ? [].concat(ids) : null),
    apagar: id => skApagar(id),
    marcador: (t, nome) => skMarcador(t, nome),
    ir: t => skIr(t), tocar: () => skTocar(), parar: () => skParar(),
    desfazer: () => skDesfazer(), refazer: () => skRefazer(),
    salvar: async caminho => { if (caminho) SK.caminho = caminho; return skSalvar(false); },
    abrir: c => skAbrir(c),
    exportar: async (caminho, op = {}) => { const r = await skApi().sk_exportar(SK.proj, caminho, op); if (!r || !r.success) throw new Error((r && r.error) || 'não exportou'); return r; },
    medir: () => skApi().sk_medir(SK.proj),
    estado: () => SK.proj && ({ nome: SK.proj.nome, caminho: SK.caminho, fim: +skFim().toFixed(3), agulha: +SK.ph.toFixed(3), sel: SK.sel,
        faixas: SK.proj.faixas.map(f => ({ id: f.id, nome: f.nome, vol: f.vol, mudo: f.mudo, solo: f.solo, clipes: f.clipes.map(c => ({ id: c.id, nome: c.nome, ini: +c.ini.toFixed(3), dur: +c.dur.toFixed(3), de: +c.de.toFixed(3), vol: c.vol, fade_in: c.fade_in, fade_out: c.fade_out })) })) }),
};


// ─────────────────────────── fase 2: limpar, melhorar, voz por IA ───────────────────────────
// O efeito roda no Python (thread) e grava um arquivo novo ao lado do original; ao terminar, todos os clipes daquela
// gravação passam a usar o arquivo novo (c.orig guarda o anterior: "Voltar ao original").
SK.tarefa = null;
function skProgresso(d) {
    const st = skEl('sk-status-info');
    if (d.percent != null && st) st.textContent = `${d.status || 'Processando'}… ${Math.round(d.percent)}%`;
    if (!d.complete) return;
    if (st) st.textContent = d.error ? `Erro: ${d.error}` : '';
    const t = SK.tarefa; SK.tarefa = null;
    if (t) d.error ? t.rej(new Error(d.error)) : t.res(d);
}
function skTarefa(chamada) {
    if (SK.tarefa) return Promise.reject(new Error('já tem um processo rodando; espere terminar'));
    return new Promise((res, rej) => { SK.tarefa = { res, rej }; chamada().then(r => { if (!r || !r.success) { SK.tarefa = null; rej(new Error((r && r.error) || 'falhou')); } }); });
}
async function skEfeito(id, efeito, op = {}) {
    const [c] = skClipe(id || SK.sel); if (!c) throw new Error('escolha um clipe');
    const arq = c.arq;
    const r = await skTarefa(() => skApi().sk_processar(arq, efeito, op));
    await skCarregarPicos(r.saida);
    skAntes();
    for (const f of SK.proj.faixas) for (const x of f.clipes) if (x.arq === arq) { x.orig = x.orig || arq; x.arq = r.saida; x.efeitos = [...(x.efeitos || []), efeito]; }
    skMudou(efeito);
    skToast(efeito === 'limpar' ? 'Ruído limpo' : 'Voz melhorada');
    return r.saida;
}
function skOriginal(id) {
    const [c] = skClipe(id || SK.sel); if (!c || !c.orig) return;
    const atual = c.arq; skAntes();
    for (const f of SK.proj.faixas) for (const x of f.clipes) if (x.arq === atual && x.orig) { x.arq = x.orig; delete x.orig; delete x.efeitos; }
    skMudou('original');
}
async function skVoz(vozId, texto, { faixa = null, ini = null } = {}) {
    const r = await skTarefa(() => skApi().sk_voz(vozId, texto, {}));
    if (!r.saida) throw new Error('a voz não foi gerada');
    let f = SK.proj.faixas.find(x => x.id === faixa) || SK.proj.faixas.find(x => /voz ia/i.test(x.nome)) || skNovaFaixa('Voz IA');
    const ids = await skImportar([r.saida], { faixa: f.id, ini: ini ?? SK.ph });
    return ids[0];
}
function skUiEfeitos(c) {
    const el = skEl('sk-efeitos'); if (!el) return;
    const ocup = !!SK.tarefa;
    el.innerHTML = `<div class="sk-p-tit">Efeitos</div>
        <label class="sk-p-l">Limpar ruído<input type="range" min="10" max="100" step="5" value="${SK.qLimpo || 80}" id="sk-q-limpo"><small id="sk-q-txt">${SK.qLimpo || 80}%</small></label>
        <div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" id="sk-limpar" ${ocup ? 'disabled' : ''}>Limpar ruído</button>
        <button class="ie-btn ie-btn-mini" id="sk-melhorar" ${ocup ? 'disabled' : ''} title="Sidon + OmniVoice: voz de estúdio (leva alguns minutos)">Melhorar voz (IA)</button>
        ${c.orig ? '<button class="ie-btn ie-btn-mini" id="sk-orig">Voltar ao original</button>' : ''}</div>
        ${c.efeitos ? `<div class="sk-p-info">Aplicado: ${c.efeitos.join(', ')}</div>` : ''}
        <div class="sk-p-info">O resultado vira um arquivo novo ao lado do original e vale para todos os clipes dessa gravação.</div>`;
    const q = el.querySelector('#sk-q-limpo');
    q.oninput = () => { SK.qLimpo = +q.value; el.querySelector('#sk-q-txt').textContent = q.value + '%'; };
    el.querySelector('#sk-limpar').onclick = () => skEfeito(c.id, 'limpar', { quantidade: SK.qLimpo || 80 }).catch(e => skToast(e.message));
    el.querySelector('#sk-melhorar').onclick = () => skEfeito(c.id, 'melhorar').catch(e => skToast(e.message));
    const o = el.querySelector('#sk-orig'); if (o) o.onclick = () => skOriginal(c.id);
}
async function skVozDialogo() {
    if (!SK.proj) skNovo('narracao');
    const r = await skApi().sk_vozes();
    if (!r.success || !r.instalado || !r.vozes.length) { skToast('Crie uma voz em Geração de Voz (OmniVoice) primeiro'); return; }
    const m = document.createElement('div'); m.className = 'ie-modal';
    m.innerHTML = `<div class="ie-dlg"><div class="ie-dlg-tit">Voz por IA (OmniVoice)</div><div class="ie-dlg-corpo sk-exp">
        <label>Voz <select id="skv-voz" class="notranslate">${r.vozes.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}</select></label>
        <textarea id="skv-txt" rows="5" placeholder="Texto que a voz vai falar" style="width:100%;box-sizing:border-box"></textarea>
        <div class="sk-p-info">A fala entra na agulha, na faixa "Voz IA".</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Cancelar</button><button class="ie-btn ie-btn-primario" id="skv-ok">Gerar fala</button></div></div>`;
    skEl('sk').appendChild(m);
    m.onclick = e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); };
    m.querySelector('#skv-ok').onclick = () => { const v = m.querySelector('#skv-voz').value, t = m.querySelector('#skv-txt').value.trim(); if (!t) return; m.remove(); skVoz(v, t).catch(e => skToast(e.message)); };
}
Object.assign(window.SKN, {
    limpar: (id, quantidade = 80) => skEfeito(id, 'limpar', { quantidade }),
    melhorar: id => skEfeito(id, 'melhorar'),
    original: id => skOriginal(id),
    vozes: () => skApi().sk_vozes(),
    voz: (vozId, texto, op) => skVoz(vozId, texto, op),
});


// ─────────────────────────── fase 3: texto (transcrição), sons (soundboard) ───────────────────────────
SK.texto = null; SK.painel = 'props';
function skLinhas(palavras, max = 42, maxS = 3.5) {   // palavras → linhas de legenda {st, en, texto}
    const out = []; let cur = null;
    for (const [a, b, w] of palavras) {
        if (!cur || (cur.texto + ' ' + w).length > max || b - cur.st > maxS || /[.!?]$/.test(cur.texto)) { if (cur) out.push(cur); cur = { st: a, en: b, texto: w }; }
        else { cur.texto += ' ' + w; cur.en = b; }
    }
    if (cur) out.push(cur);
    return out;
}
async function skTranscrever(idioma = 'pt', faixas = null) {
    if (!SK.proj) throw new Error('abra um projeto');
    const r = await skTarefa(() => skApi().sk_transcrever(SK.proj, idioma, faixas));
    SK.texto = { palavras: r.palavras, idioma };
    SK.painel = 'texto'; skUiProps();
    return r.palavras.length;
}
function skUiTexto() {
    const el = skEl('sk-props'); if (!el) return false;
    if (SK.painel !== 'texto') return false;
    const P = SK.texto && SK.texto.palavras;
    el.innerHTML = `<div class="sk-p-tit">Texto <button class="ie-btn ie-btn-mini" style="float:right" onclick="SK.painel='props';skUiProps()">×</button></div>
        <div class="sk-p-acoes"><select id="sk-idioma"><option value="pt">Português</option><option value="multi">Outros idiomas</option></select>
        <button class="ie-btn ie-btn-mini" id="sk-transc" ${SK.tarefa ? 'disabled' : ''}>${P ? 'Transcrever de novo' : 'Transcrever'}</button></div>
        ${P ? `<div class="sk-p-acoes"><button class="ie-btn ie-btn-mini" data-leg="srt">Salvar SRT</button><button class="ie-btn ie-btn-mini" data-leg="txt">Salvar TXT</button><button class="ie-btn ie-btn-mini" data-leg="vtt">VTT</button></div>
        <div class="sk-texto notranslate">${P.map(([a, , w], i) => `<span data-t="${a}" data-i="${i}">${w.replace(/</g, '&lt;')}</span>`).join(' ')}</div>
        <div class="sk-p-info">Clique numa palavra para levar a agulha até ela.</div>` : '<div class="sk-p-info">Transcreve a mixagem (faixas mudas ficam de fora). A primeira vez baixa o modelo de fala.</div>'}`;
    el.querySelector('#sk-transc').onclick = () => skTranscrever(el.querySelector('#sk-idioma').value).catch(e => skToast(e.message));
    el.querySelectorAll('[data-leg]').forEach(b => b.onclick = () => skApi().ve_salvar_legenda(skLinhas(P), b.dataset.leg, SK.proj.nome || 'audio'));
    el.querySelector('.sk-texto')?.addEventListener('click', e => { const s = e.target.closest('[data-t]'); if (s) skIr(+s.dataset.t); });
    return true;
}
(function () {   // o painel da direita mostra o texto quando pedido
    const props = skUiProps;
    skUiProps = function () { if (!skUiTexto()) props(); };
})();
async function skSonsDialogo() {
    const r = await skApi().ve_sb_estado();
    if (!r || !r.instalado) {
        if (!confirm('O pack de sons (CC0, ~10 MB) ainda não foi baixado. Baixar agora?')) return;
        await skApi().ve_sb_baixar(); skToast('Baixando os sons… abra de novo em alguns segundos'); return;
    }
    const sons = (r.categorias || []).flatMap(c => (c.sons || []).map(s => ({ ...s, categoria: c.nome || c.titulo || c.id || 'Sons', nome: s.nome || s.titulo || String(s.arq || '').split('/').pop() })));
    const m = document.createElement('div'); m.className = 'ie-modal';
    const cats = [...new Set(sons.map(s => s.categoria || s.cat || 'Sons'))];
    m.innerHTML = `<div class="ie-dlg sk-sons"><div class="ie-dlg-tit">Sons (CC0)</div><div class="ie-dlg-corpo"><input id="sks-busca" placeholder="Buscar..." style="width:100%;box-sizing:border-box">
        <div class="sk-sons-lista notranslate">${cats.map(c => `<div class="sk-p-tit">${c}</div>${sons.filter(s => (s.categoria || s.cat || 'Sons') === c).map(s => `<div class="sk-som" data-nome="${(s.nome || '').toLowerCase()}"><button data-ouvir="${s.url}">▶</button><span>${s.nome}</span><button data-por="${s.path || s.caminho}">Inserir</button></div>`).join('')}`).join('')}</div>
        </div><div class="ie-dlg-rod"><button class="ie-btn" data-x>Fechar</button></div></div>`;
    skEl('sk').appendChild(m);
    const audio = new Audio();
    m.onclick = async e => {
        if (e.target === m || e.target.closest('[data-x]')) { audio.pause(); m.remove(); return; }
        const o = e.target.closest('[data-ouvir]'); if (o) { audio.src = o.dataset.ouvir; audio.play(); return; }
        const p = e.target.closest('[data-por]');
        if (p) { if (!SK.proj) skNovo(); const f = SK.proj.faixas.find(x => /efeito|sons/i.test(x.nome)) || skNovaFaixa('Efeitos'); await skImportar([p.dataset.por], { faixa: f.id, ini: SK.ph }); }
    };
    m.querySelector('#sks-busca').oninput = e => { const q = e.target.value.toLowerCase(); m.querySelectorAll('.sk-som').forEach(s => { s.hidden = q && !s.dataset.nome.includes(q); }); };
}
Object.assign(window.SKN, {
    transcrever: (idioma = 'pt', faixas = null) => skTranscrever(idioma, faixas),
    texto: () => SK.texto && SK.texto.palavras.map(p => p[2]).join(' '),
    legendas: () => SK.texto ? skLinhas(SK.texto.palavras) : [],
});
