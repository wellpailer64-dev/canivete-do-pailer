/* Espelha o localStorage num arquivo em %APPDATA%/CaniveteDoPailer/localstorage.json (via ponte do Python).
   O WebView roda em modo privado e com porta nova a cada abertura: sem isto, recentes e preferências somem
   (e o app em Python direto fica diferente do .exe). O Python devolve o arquivo no before_load (antes dos scripts). */
(function () {
    const LIMITE = 1500000;      // valor maior que isto (miniaturas, dados pesados) fica só na sessão
    let timer = null;
    function salvar() {
        timer = null;
        const api = window.pywebview && window.pywebview.api;
        if (!api || !api.ls_save) { timer = setTimeout(salvar, 1500); return; }
        const o = {};
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i), v = localStorage.getItem(k);
                if (v != null && v.length <= LIMITE) o[k] = v;
            }
            api.ls_save(JSON.stringify(o)).catch(() => {});
        } catch (e) { /* sem storage */ }
    }
    function agendar() { if (!timer) timer = setTimeout(salvar, 800); }
    try {
        const S = Storage.prototype, set = S.setItem, rem = S.removeItem, lim = S.clear;
        S.setItem = function () { const r = set.apply(this, arguments); if (this === localStorage) agendar(); return r; };
        S.removeItem = function () { const r = rem.apply(this, arguments); if (this === localStorage) agendar(); return r; };
        S.clear = function () { const r = lim.apply(this, arguments); if (this === localStorage) agendar(); return r; };
    } catch (e) { /* sem storage */ }
    window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); salvar(); } });
})();
