// Vetor Kanivete — BIBLIOTECAS DE COR (livros Pantone & cia., como Janela › Bibliotecas de amostras do Illustrator).
// Os livros são dados do fabricante: o app não os traz; lê os .acb (Adobe Color Book, da Adobe instalada) e .ase (Swatch
// Exchange, que a gráfica/cliente manda) — Python: ler_biblioteca/bibliotecas_cor. A cor entra como amostra ESPECIAL
// (Separation no PDF) com o CMYK alternativo calculado do Lab pelo perfil do documento.
(() => {
    const ler = async a => {
        let arq = a.arquivo;
        if (!arq) {
            const L = (await vkApi().vk_bibliotecas_cor()).bibliotecas, alvo = String(a.biblioteca || '').toLowerCase();
            const b = L.find(x => x.nome.toLowerCase() === alvo) || L.find(x => x.nome.toLowerCase().includes(alvo));
            if (!b) throw new Error(`biblioteca "${a.biblioteca || ''}" não encontrada; há: ${L.map(x => x.nome).join(', ') || 'nenhuma (passe arquivo: caminho do .acb/.ase)'}`);
            arq = b.arquivo;
        }
        const r = await vkApi().vk_ler_biblioteca(arq, VK.doc.perfil || 'FOGRA39');
        if (!r || !r.success) throw new Error((r && r.error) || 'não leu a biblioteca');
        return r;
    };
    // nome no livro: "286" acha "PANTONE 286 C"; exato tem prioridade
    const achar = (cores, nome) => { const n = String(nome).toLowerCase().trim(), re = new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
        return cores.find(c => c.nome.toLowerCase() === n) || cores.find(c => re.test(c.nome)) || cores.find(c => c.nome.toLowerCase().includes(n)); };
    vkRegistrar('bibliotecas_cor', 'bibliotecas de cor', async () => vkApi().vk_bibliotecas_cor(), true);
    // cores_biblioteca: biblioteca (nome) | arquivo, busca, limite → [{nome, cmyk, especial}]
    vkRegistrar('cores_biblioteca', 'cores da biblioteca', async a => {
        const r = await ler(a), q = String(a.busca || '').toLowerCase();
        const cs = r.cores.filter(c => !q || c.nome.toLowerCase().includes(q)).slice(0, +a.limite || 60);
        return { titulo: r.titulo, total: r.cores.length, cores: cs.map(c => ({ nome: c.nome, cmyk: c.cmyk, especial: !!c.spot, ...(c.grupo ? { grupo: c.grupo } : {}) })) };
    }, true);
    // cor_biblioteca: biblioteca|arquivo, nome (ou nomes: [...] / todas: true) → amostras (especial = Separation);
    // ids/nomes de objetos + preench|traco: true aplica a 1ª
    vkRegistrar('cor_biblioteca', 'cor da biblioteca', async a => {
        const r = await ler(a);
        const lista = a.todas ? r.cores : [].concat(a.nomes_cor || a.cor || a.nome || []).map(n => { const c = achar(r.cores, n); if (!c) throw new Error(`"${n}" não está em ${r.titulo}`); return c; });
        if (!lista.length) throw new Error('cor_biblioteca: diga a cor (nome: "286") ou todas: true');
        const feitas = [];
        for (const c of lista) {
            const cor = c.spot ? { k: 'spot', nome: c.nome, v: c.cmyk.map(x => Math.round(x * 10) / 10), tint: 100 } : { k: 'cmyk', v: c.cmyk };
            let am = VK.doc.amostras.find(x => x.nome === c.nome);
            if (!am) { am = { id: vkId('a'), nome: c.nome, cor }; VK.doc.amostras.push(am); }
            feitas.push(am);
        }
        if ((a.ids || a.objetos_nomes) && (a.preench || a.traco)) {
            const alvo = { ...(a.ids ? { ids: a.ids } : { nomes: a.objetos_nomes }), [a.traco ? 'traco' : 'preench']: vkClone(feitas[0].cor) };
            await VK_CMDS.alterar.fn(alvo);
        }
        return { biblioteca: r.titulo, amostras: feitas.map(x => ({ nome: x.nome, cor: vkCorTexto(x.cor) })) };
    });
})();

// ── janela: escolher biblioteca, buscar, clicar = vira amostra (e aplica na seleção) ──
async function vkCoresJanela(ancora) {
    const pop = vkEl('vk-pop'), rr = vkEl('vk').getBoundingClientRect(), rb = (ancora || vkEl('vk-aba')).getBoundingClientRect();
    const info = await vkApi().vk_bibliotecas_cor(), L = info.bibliotecas;
    let atual = null;
    const grade = (cs, q) => cs.filter(c => !q || c.nome.toLowerCase().includes(q.toLowerCase())).slice(0, 600)
        .map(c => `<button class="vk-am" data-cb="${vkEsc_(c.nome)}" title="${vkEsc_(c.nome)} — C${c.cmyk.join(' ')}">${vkCorSw({ k: 'cmyk', v: c.cmyk })}</button>`).join('');
    pop.innerHTML = `<div class="vk-cb"><div class="vk-gl-cab">Bibliotecas de cor <small>${L.length ? '' : 'nenhuma encontrada'}</small></div>
        <div class="vk-linha vk-mini"><select data-cbl="1"><option value="">— escolha —</option>${L.map(b => `<option value="${vkEsc_(b.arquivo)}">${vkEsc_(b.nome)}</option>`).join('')}</select></div>
        <input type="text" class="vk-gl-busca" placeholder="buscar (ex. 286)"><div class="vk-am-grade vk-cb-grade"></div>
        <div class="vk-nota">Lê os livros da Adobe instalada e os .acb/.ase que você puser em <b>${vkEsc_(info.pasta_usuario)}</b> (o app não traz livros Pantone: são do fabricante).</div></div>`;
    Object.assign(pop.style, { left: Math.max(8, rb.left - rr.left - 300) + 'px', top: Math.max(8, rb.top - rr.top) + 'px' }); pop.hidden = false;
    const busca = pop.querySelector('.vk-gl-busca'), gr = pop.querySelector('.vk-cb-grade');
    pop.onchange = async e => { if (!e.target.dataset.cbl) return; atual = e.target.value ? await vkApi().vk_ler_biblioteca(e.target.value, VK.doc.perfil || 'FOGRA39') : null; gr.innerHTML = atual && atual.success ? grade(atual.cores, busca.value) : ''; };
    busca.oninput = () => { if (atual && atual.success) gr.innerHTML = grade(atual.cores, busca.value); };
    pop.onclick = async e => {
        const b = e.target.closest('[data-cb]'); if (!b || !atual) return;
        await vkCmdUi('cor_biblioteca', { arquivo: atual.arquivo, nome: b.dataset.cb, ...(VK.sel.length ? { ids: VK.sel, [VK.focoTraco ? 'traco' : 'preench']: true } : {}) });
        vkUiAgendar();
    };
    setTimeout(() => document.addEventListener('pointerdown', function fora(e) { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener('pointerdown', fora); } }), 0);
}

// ─────────────────────────── RECOLORIR ARTE (Editar › Editar cores › Recolorir arte) ───────────────────────────
// Visita TODA cor de um objeto (preench, traço, paradas de degradê, trechos de texto, Aparência, efeitos, grupos):
// fn(cor) → nova cor (ou undefined = mantém)
function vkCadaCor(o, fn) {
    const troca = c => { if (!c) return c; if (c.k === 'grad') { c.paradas.forEach(p => { const n = troca(p.cor); if (n !== undefined) p.cor = n; }); return undefined; } return fn(c); };
    const em = (obj, k) => { const n = troca(obj[k]); if (n !== undefined) obj[k] = n; };
    if (o.itens) o.itens.forEach(f => vkCadaCor(f, fn));
    if (o.preench) em(o, 'preench');
    if (o.traco && o.traco.cor) em(o.traco, 'cor');
    (o.trechos || []).forEach(t => { if (t.preench) em(t, 'preench'); if (t.traco && t.traco.cor) em(t.traco, 'cor'); });
    (o.aparencia || []).forEach(l => { if (l.cor) em(l, 'cor'); });
    (o.efeitos || []).forEach(e => { if (e.cor) em(e, 'cor'); });
}
const vkCorChave = c => !c ? '' : c.k === 'spot' ? `spot:${c.nome}:${Math.round(c.tint ?? 100)}` : c.k === 'reg' ? 'reg' : `${c.k}:${c.v.map(x => Math.round(x)).join(',')}`;
(() => {
    const alvosOuTudo = a => (a.ids || a.nomes || (VK.sel.length && !a.tudo)) ? vkTxAlvos(a) : vkTodos().filter(x => !x.pai).map(x => x.o);
    // cores_arte: as cores da seleção (ou de tudo), da mais usada para a menos
    vkRegistrar('cores_arte', 'cores da arte', a => {
        const m = new Map();
        for (const o of alvosOuTudo(a)) vkCadaCor(o, c => { const k = vkCorChave(c); const r = m.get(k) || { cor: c, usos: 0 }; r.usos++; m.set(k, r); });
        return { cores: [...m.values()].sort((x, y) => y.usos - x.usos).map(r => ({ cor: vkCorTexto(r.cor), usos: r.usos, especial: r.cor.k === 'spot' })) };
    }, true);
    // recolorir: trocas [{de, para}] (cores em texto: "C0 M100 Y0 K0", "#ff0000", "spot:...", nome de amostra);
    // tolerancia (pontos de % por canal, padrão 1) — na seleção ou em tudo (tudo: true)
    vkRegistrar('recolorir', 'recolorir arte', a => {
        const trocas = [].concat(a.trocas || []).map(t => ({ de: vkCorDe(t.de), para: vkCorDe(t.para) }));
        if (!trocas.length) throw new Error('recolorir: trocas = [{de: cor, para: cor}]');
        const tol = a.tolerancia ?? 1;
        const igual = (x, y) => x.k === y.k && (x.k === 'spot' ? x.nome === y.nome : x.k === 'reg' || x.v.every((v, i) => Math.abs(v - y.v[i]) <= tol * (x.k === 'rgb' ? 2.55 : 1)));
        let n = 0;
        for (const o of alvosOuTudo(a)) vkCadaCor(o, c => { const t = trocas.find(t => t.de && igual(c, t.de)); if (t) { n++; return vkClone(t.para); } });
        return { trocadas: n };
    });
})();
// janela: as cores da arte; clique numa = escolhe a nova
async function vkRecolorirJanela(ancora) {
    const r = await vkCmd('cores_arte', {}), pop = vkEl('vk-pop'), rr = vkEl('vk').getBoundingClientRect(), rb = (ancora || vkEl('vk-props')).getBoundingClientRect();
    pop.innerHTML = `<div class="vk-cb"><div class="vk-gl-cab">Recolorir arte <small>${VK.sel.length ? 'seleção' : 'documento inteiro'} · ${r.cores.length} cores</small></div>
        ${r.cores.map((c, i) => `<div class="vk-linha vk-mini"><button class="vk-cor-btn" data-rc="${i}">${vkCorSw(vkCorDe(c.cor))}<span>${vkEsc_(c.cor)}</span><small>${c.usos}×</small></button></div>`).join('')}
        <div class="vk-nota">Clique numa cor para trocar por outra (inclusive Pantone das Amostras).</div></div>`;
    Object.assign(pop.style, { left: Math.max(8, rb.left - rr.left - 300) + 'px', top: Math.max(8, rb.top - rr.top) + 'px' }); pop.hidden = false;
    pop.onchange = null;
    pop.onclick = e => { const b = e.target.closest('[data-rc]'); if (!b) return; const de = r.cores[+b.dataset.rc].cor;
        vkCorPopup(b, vkCorDe(de), nova => vkCmdUi('recolorir', { trocas: [{ de, para: nova }] }).then(() => vkRecolorirJanela(ancora))); };
}
