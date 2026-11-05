// Photo: arrastar o NOME de um parâmetro (Opacidade, Fluxo, Tamanho...) para mudar o número, como no Photoshop.
// Esquerda diminui, direita aumenta; Shift = x10, Ctrl = x0,1. Vale para qualquer <label> com campo numérico em painel/janela do Photo.
(function () {
    const SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='14' viewBox='0 0 22 14'><path d='M1 7l5-5v3.5h10V2l5 5-5 5V8.5H6V12z' fill='white' stroke='black' stroke-width='1.1' stroke-linejoin='round'/></svg>";
    const cursor = `url("data:image/svg+xml,${encodeURIComponent(SVG)}") 11 7, ew-resize`;
    const st = document.createElement('style');
    st.textContent = `.ie-arrastavel { cursor: ${cursor}; } .ie-arrastavel input, .ie-arrastavel select, .ie-arrastavel button { cursor: auto; } body.ie-arrastando-valor, body.ie-arrastando-valor * { cursor: ${cursor} !important; user-select: none !important; }`;
    document.head.appendChild(st);

    const NO_PHOTO = '[class*="ie-"],[id^="ie-"]';
    function campoDe(lab) {
        return lab.querySelector('input[type=number]:not(:disabled)') || lab.querySelector('input[type=range]:not(:disabled)');
    }
    function rotuloAlvo(t) {
        if (!(t instanceof Element)) t = t && t.parentElement;
        if (!t || t.closest('input,select,button,textarea,[contenteditable]')) return null;
        const lab = t.closest('label');
        if (!lab || !lab.closest(NO_PHOTO) || !campoDe(lab)) return null;
        return lab;
    }
    document.addEventListener('pointerover', ev => {
        const lab = rotuloAlvo(ev.target);
        if (lab) lab.classList.add('ie-arrastavel');
    }, true);

    let arr = null;
    document.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        const lab = rotuloAlvo(ev.target);
        if (!lab) return;
        const inp = campoDe(lab);
        arr = { lab, inp, x0: ev.clientX, v0: parseFloat(inp.value) || 0, ativo: false, mudou: false, id: ev.pointerId };
    }, true);

    document.addEventListener('pointermove', ev => {
        if (!arr || ev.pointerId !== arr.id) return;
        const dx = ev.clientX - arr.x0;
        if (!arr.ativo) {
            if (Math.abs(dx) < 3) return;
            arr.ativo = true;
            document.body.classList.add('ie-arrastando-valor');
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        }
        ev.preventDefault();
        const inp = arr.inp;
        const passo = parseFloat(inp.step) > 0 ? parseFloat(inp.step) : 1;
        const mult = ev.shiftKey ? 10 : ev.ctrlKey ? 0.1 : 1;
        let v = arr.v0 + dx * passo * mult;
        const min = inp.min !== '' ? +inp.min : -Infinity, max = inp.max !== '' ? +inp.max : Infinity;
        v = Math.min(max, Math.max(min, v));
        const casas = (String(passo).split('.')[1] || '').length + (mult < 1 ? 1 : 0);
        v = +v.toFixed(casas);
        if (String(v) === inp.value) return;
        inp.value = v;
        arr.mudou = true;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);

    function fim() {
        if (!arr) return;
        const a = arr; arr = null;
        document.body.classList.remove('ie-arrastando-valor');
        if (a.ativo) {
            if (a.mudou) a.inp.dispatchEvent(new Event('change', { bubbles: true }));
            // o clique que fecha o arrasto não deve focar o campo do rótulo
            const nao = e => { e.preventDefault(); e.stopPropagation(); };
            document.addEventListener('click', nao, { capture: true, once: true });
            setTimeout(() => document.removeEventListener('click', nao, true), 0);
        }
    }
    document.addEventListener('pointerup', fim, true);
    document.addEventListener('pointercancel', fim, true);
})();
