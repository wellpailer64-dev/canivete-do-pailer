// =========================================================
// Editor de Imagem — ferramenta "Diversos" no grupo das formas (U): setas, visto, erro, alerta, asterisco...
// Cada símbolo é um caminho SVG em 24×24 (s = traço, desenhado com espessura; senão preenchido, evenodd).
// Arrasta para desenhar (Shift: proporcional); vira camada nova com a cor de frente.
// =========================================================

const IE_DIVERSOS = {
    seta: ['Seta', 'M2 9h12V4l8 8-8 8v-5H2z'],
    setaEsq: ['Seta para a esquerda', 'M22 9H10V4l-8 8 8 8v-5h12z'],
    setaCima: ['Seta para cima', 'M9 22V10H4l8-8 8 8h-5v12z'],
    setaBaixo: ['Seta para baixo', 'M9 2v12H4l8 8 8-8h-5V2z'],
    setaDupla: ['Seta dupla', 'M1 12l6-7v4h10V5l6 7-6 7v-4H7v4z'],
    setaFina: ['Seta fina', 'M2 12h19M14 5l7 7-7 7', 1],
    setaCurva: ['Seta curva', 'M4 20V13a6 6 0 0 1 6-6h9M14 2l5 5-5 5', 1],
    setaVolta: ['Seta de retorno', 'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12h-4', 1],
    setaCircular: ['Seta circular', 'M20 12a8 8 0 1 1-2.6-5.9M20 3v6h-6', 1],
    chevron: ['Chevron', 'M5 2h7l8 10-8 10H5l8-10z'],
    chevronDuplo: ['Chevron duplo', 'M1 3h5l8 9-8 9H1l8-9zM10 3h5l8 9-8 9h-5l8-9z'],
    setaBloco: ['Seta em bloco', 'M3 4h10l8 8-8 8H3l8-8z'],
    setaDiag: ['Seta diagonal', 'M5 19 19 5M9 5h10v10', 1],
    visto: ['Visto', 'M4 12.5 9.5 18 20 6', 1],
    vistoCirc: ['Visto no círculo', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm5.3 6.3 1.4 1.4-8.2 8.2-4.7-4.7 1.4-1.4 3.3 3.3z'],
    erro: ['Erro (X)', 'M5 5l14 14M19 5 5 19', 1],
    erroCirc: ['Erro no círculo', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM8.2 6.8 12 10.6l3.8-3.8 1.4 1.4-3.8 3.8 3.8 3.8-1.4 1.4-3.8-3.8-3.8 3.8-1.4-1.4 3.8-3.8-3.8-3.8z'],
    alerta: ['Alerta', 'M12 1.5 23 21.5H1zM11 9v6h2V9zm0 8v2h2v-2z'],
    exclamCirc: ['Exclamação no círculo', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM11 5.5h2v8h-2zm0 10h2v2.5h-2z'],
    sino: ['Alarme (sino)', 'M12 2a1.5 1.5 0 0 0-1.5 1.6A6.5 6.5 0 0 0 5.5 10v5L3 18v1h18v-1l-2.5-3v-5a6.5 6.5 0 0 0-5-6.4A1.5 1.5 0 0 0 12 2zM9.5 20a2.5 2.5 0 0 0 5 0z'],
    relogio: ['Relógio', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 2a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM11 5.5V12.4l4.6 4.6 1.4-1.4-4-4V5.5z'],
    asterisco: ['Asterisco', 'M10.6 1h2.8v8.6l7.5-4.3 1.4 2.4L14.8 12l7.5 4.3-1.4 2.4-7.5-4.3V23h-2.8v-8.6l-7.5 4.3-1.4-2.4L9.2 12 1.7 7.7l1.4-2.4 7.5 4.3z'],
    info: ['Informação', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM11 10h2v8h-2zm0-4h2v2.5h-2z'],
    pergunta: ['Pergunta', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM8.5 9a3.5 3.5 0 1 1 5 3.2c-.9.4-1.5 1-1.5 1.8v.5h-2V14c0-1.7 1-2.8 2.3-3.4A1.5 1.5 0 1 0 10.5 9zM11 16.5h2V19h-2z'],
    mais: ['Mais', 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z'],
    menos: ['Menos', 'M3 10h18v4H3z'],
    proibido: ['Proibido', 'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 3a8 8 0 0 1 4.9 1.7L5.7 16.9A8 8 0 0 1 12 4zm6.3 3.1A8 8 0 0 1 7.1 18.3z'],
    estrela: ['Estrela', 'M12 1.5l3.2 6.9 7.3.8-5.5 5 1.6 7.3L12 17.8l-6.6 3.7L7 14.2l-5.5-5 7.3-.8z'],
    coracao: ['Coração', 'M12 21 3.2 12.4A5.3 5.3 0 0 1 12 5.6a5.3 5.3 0 0 1 8.8 6.8z'],
    raio: ['Raio', 'M14 1 4 14h7l-2 9 11-14h-7z'],
    pin: ['Marcador de local', 'M12 1a8 8 0 0 0-8 8c0 6 8 14 8 14s8-8 8-14a8 8 0 0 0-8-8zm0 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z'],
};
const IE_DIV_P = {};
function ieDivDesenhar(x, k, w, h, cor, contorno) {
    const s = IE_DIVERSOS[k]; if (!s) return;
    const p = IE_DIV_P[k] || (IE_DIV_P[k] = new Path2D(s[1]));
    x.save();
    if (s[2]) {   // traço: deixa margem para a espessura não sair da caixa
        const e = 2.6, m = e / 2;
        x.translate(m * w / 24, m * h / 24); x.scale((w - e * w / 24) / 24, (h - e * h / 24) / 24);
        x.lineWidth = e; x.lineCap = 'round'; x.lineJoin = 'round';
        if (contorno) { x.strokeStyle = contorno; x.lineWidth = Math.max(e, 1.5 * 24 / Math.max(w, 1)); } else x.strokeStyle = cor;
        x.stroke(p);
    } else {
        x.scale(w / 24, h / 24);
        if (contorno) { x.strokeStyle = contorno; x.lineWidth = 1.5 * 24 / Math.max(w, 1); x.stroke(p); }
        else { x.fillStyle = cor; x.fill(p, 'evenodd'); }
    }
    x.restore();
}

IE.op.diversos = { sim: 'seta' };
IE_ICONES.fDiv = '<path d="M3 12h10M9 7l5 5-5 5"/><path d="m16 8 2.5 2.5L22 6" stroke-width="1.6"/>';

IE_FERR.formaDiv = {
    nome: 'Diversos (setas e símbolos)', tecla: 'U', icone: 'fDiv', cursor: 'crosshair',
    down(p) { IE.arr = { p0: { x: Math.round(p.x), y: Math.round(p.y) } }; },
    move(p, ev) { const a = IE.arr; if (!a) return; a.r = ieRetArrasto(a.p0, p, ev, ev.shiftKey); ieDesenharSobre(); },
    up(p, ev, doc) {
        const a = IE.arr; IE.arr = null; ieDesenharSobre();
        if (!a || !a.r || a.r.w < 2 || a.r.h < 2) return;
        const k = IE.op.diversos.sim, r = a.r, c = ieCanvas(r.w, r.h);
        ieDivDesenhar(ieCtx(c), k, r.w, r.h, IE.cor[0]);
        const nome = ieT(IE_DIVERSOS[k][0]);
        const L = ieNovaCamada(doc, { nome: ieNomeLivre(doc, nome), c, x: r.x, y: r.y, sujoPx: true });
        ieInserirAcima(doc, L, ieAtiva(doc));
        doc.ativa = L.id; doc.selIds = [L.id];
        ieCamadaMudou(L); ieHist(nome); ieUiCamadas?.();
    },
    sobre(ctx, doc) {
        const a = IE.arr; if (!a || !a.r) return;
        const s = ieDocTela(a.r.x, a.r.y, doc);
        ctx.save(); ctx.translate(s.x, s.y);
        ieDivDesenhar(ctx, IE.op.diversos.sim, a.r.w * doc.zoom, a.r.h * doc.zoom, null, '#4aa3ff');
        ctx.restore();
    },
};

// entra no fim do grupo das formas
{
    const g = IE_FERR_GRUPOS.find(x => Array.isArray(x) && x[0] === 'forma');
    if (g && !g.includes('formaDiv')) g.push('formaDiv');
    if (!IE_FERR_ORDEM.includes('formaDiv')) IE_FERR_ORDEM.splice(IE_FERR_ORDEM.indexOf('forma') + 1, 0, 'formaDiv');
}

// barra de opções: botão com o símbolo atual que abre a grade de símbolos
function ieDivIcone(k, t = 20) {
    const s = IE_DIVERSOS[k];
    return `<svg viewBox="-1.5 -1.5 27 27" width="${t}" height="${t}">${s[2] ? `<path d="${s[1]}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${s[1]}" fill="currentColor" fill-rule="evenodd"/>`}</svg>`;
}
function ieDivGrade(btn) {
    document.querySelector('.ie-div-pop')?.remove();
    const pop = document.createElement('div');
    pop.className = 'ie-div-pop';
    const b = btn.getBoundingClientRect();
    pop.style.cssText = `position:fixed;left:${b.left}px;top:${b.bottom + 4}px;z-index:9999;display:grid;grid-template-columns:repeat(8,34px);gap:3px;padding:6px;background:#1e1e1e;border:1px solid #444;border-radius:8px;box-shadow:0 6px 20px #0008`;
    pop.innerHTML = Object.keys(IE_DIVERSOS).map(k => `<button data-k="${k}" title="${ieEsc(ieT(IE_DIVERSOS[k][0]))}" style="width:34px;height:34px;display:grid;place-items:center;border-radius:6px;border:1px solid ${k === IE.op.diversos.sim ? 'var(--primary)' : 'transparent'};background:#2a2a2a;color:#ddd;cursor:pointer">${ieDivIcone(k)}</button>`).join('');
    pop.onclick = ev => { const k = ev.target.closest('[data-k]')?.dataset.k; if (!k) return; IE.op.diversos.sim = k; pop.remove(); ieOpcoesRender(); };
    document.body.appendChild(pop);
    setTimeout(() => document.addEventListener('pointerdown', function f(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', f, true); } }, true));
}
(window.IE_OPCOES_EXTRA = window.IE_OPCOES_EXTRA || []).push(f => {
    if (f !== 'formaDiv') return '';
    const k = IE.op.diversos.sim;
    return `<label class="ie-op-campo">${ieT('Símbolo')} <button class="ie-btn ie-btn-mini" style="display:inline-flex;align-items:center;gap:6px" onclick="ieDivGrade(this)">${ieDivIcone(k, 16)} ${ieEsc(ieT(IE_DIVERSOS[k][0]))} ▾</button></label>` +
        `<span class="ie-op-dica">${ieT('Usa a cor de frente · Shift: proporcional')}</span>`;
});
