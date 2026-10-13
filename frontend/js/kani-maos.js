// kani-maos.js — as "mãos" da Kani na tela (lado do app de Functions/kani_maos.py). O backend manda {id, acao, ...}
// por kaniMaos(); aqui abre a ferramenta, monta com a API pública (KNV.*) num documento NOVO (nada do que está aberto é
// tocado) e responde por kani_maos_resposta(id, {ok, ...}). Guia: Instructions/agente/kani-maos.md.
async function kaniMaosFlyer(d) {
    if (!document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem');
    await KNV._quadro();
    const tem = new Set(await KNV.fontes());
    for (const f of d.fontes || []) if (!tem.has(f)) { try { await KNV.instalarFonte(f); } catch (e) { /* cai na fonte padrão */ } }
    // só durante a montagem: nenhum diálogo trava a Kani (ela nunca salva por cima de nada: documento novo)
    KNV.automacao(true, { respostas: { 'Salvar as alterações': 'Não salvar', 'Salvar alterações': 'Não salvar' }, padrao: 'primario' });
    try {
        const cena = await KNV.cena(d.html, { formato: 'feed', novo: true, nome: d.nome || 'Flyer da Kani' });
        if (d.arteFinal) { try { await KNV.receita.arteFinal(d.arteFinal); } catch (e) { (cena.avisos ||= []).push('arte-final: ' + e.message); } }
        if (d.salvar) await KNV.salvar(d.salvar);
        return { ok: true, avisos: (cena && cena.avisos) || [], png: KNV.png(0.5) };
    } finally { KNV.automacao(false); }
}

async function kaniMaos(d) {
    let res;
    try {
        if (d.acao === 'flyer') res = await kaniMaosFlyer(d);
        else res = { ok: false, erro: 'ação desconhecida: ' + d.acao };
    } catch (e) { res = { ok: false, erro: String(e && e.message || e) }; }
    try { await kaniApi().kani_maos_resposta(d.id, res); } catch (e) { console.error('[kani-maos]', e); }
}
