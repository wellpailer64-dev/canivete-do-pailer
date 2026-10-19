// Plugins pessoais (Functions/plugins_pessoais.py): cada pasta de <raiz_dados>/Plugins com kanivete.json vira uma aba
// na barra lateral › Pessoais, com a página #page-plugin-<id> vazia para o js do plugin montar.
// O js do plugin recebe `KPLUG` e chama o Python dele por KPLUG.chamar(id, 'funcao', {args}).
const KPLUG = {
    lista: [],
    async chamar(id, funcao, args) {
        const r = await window.pywebview.api.plugin_pessoal(id, funcao, args || {});
        if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
        return r.dados;
    },
    pagina(id) { return document.getElementById('page-plugin-' + id); },
};

async function kplugCarregar() {
    let lista = [];
    try { lista = await window.pywebview.api.plugins_pessoais_listar(); } catch (e) { return; }
    if (!lista || !lista.length) return;
    KPLUG.lista = lista;
    const ata = document.querySelector('.menu-item[data-tool="ata-kanivete"]');
    const paginas = document.getElementById('page-ata-kanivete')?.parentElement;
    if (!ata || !paginas) return;
    let depois = document.getElementById('kplug-grupo');   // grupo "Pessoais" logo depois de Reuniões
    if (!depois) {
        depois = document.createElement('div');
        depois.className = 'menu-group'; depois.id = 'kplug-grupo'; depois.textContent = 'Pessoais';
        ata.after(depois);
    }
    for (const p of lista) {
        if (p.erro) { console.warn('[plugin pessoal]', p.id, p.erro); continue; }
        const tool = 'plugin-' + p.id;
        if (document.querySelector(`.menu-item[data-tool="${tool}"]`)) continue;
        const b = document.createElement('button');
        b.className = 'menu-item'; b.dataset.tool = tool; b.title = p.descricao || p.nome;
        b.onclick = () => switchTool(tool);
        b.innerHTML = `<span class="icon"><span class="app-logo" style="--al:${p.cor};background:${p.cor};color:#fff">${_escHtml(p.sigla)}</span></span>` +
            `<span class="label">${_escHtml(p.nome)}</span>`;
        depois.after(b); depois = b;
        const pg = document.createElement('div');
        pg.className = 'tool-page ve-page'; pg.id = 'page-' + tool;
        paginas.appendChild(pg);
        if (p.css) { const s = document.createElement('style'); s.dataset.kplug = p.id; s.textContent = p.css; document.head.appendChild(s); }
        if (p.js) {
            try { new Function('KPLUG', 'PLUGIN_ID', p.js)(KPLUG, p.id); }
            catch (e) { console.error('[plugin pessoal]', p.id, e); }
        }
    }
}

if (window.pywebview && window.pywebview.api) kplugCarregar();
else window.addEventListener('pywebviewready', kplugCarregar, { once: true });
