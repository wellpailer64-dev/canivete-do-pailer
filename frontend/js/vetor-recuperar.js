// Vetor Kanivete — SALVAMENTO AUTOMÁTICO e RECUPERAÇÃO (como o "Recuperação de dados" do Illustrator).
// A cada 30 s, se o documento mudou desde a última cópia, guarda o JSON em %APPDATA%/CaniveteDoPailer/vetor_recuperacao/<uid>.json.
// Salvar apaga a cópia; trocar de documento com alteração pendente guarda a cópia antes (sem diálogo que trave).
// Ao abrir o Vetor, cópias que sobraram (queda, fechou sem salvar) aparecem com Recuperar / Descartar.
VK.autosalvo = { versao: -1, uid: null };
function vkUid() { if (VK.doc && !VK.doc.uid) VK.doc.uid = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); return VK.doc && VK.doc.uid; }
async function vkAutosalvar(forcar = false) {
    if (!VK.doc || (!VK.sujo && !forcar)) return false;
    const uid = vkUid();
    if (!forcar && VK.autosalvo.uid === uid && VK.autosalvo.versao === VK.versaoDoc) return false;
    try {
        await vkApi().vk_autosalvar(vkClone(VK.doc), { nome: VK.doc.nome, caminho: VK.path || null });
        VK.autosalvo = { versao: VK.versaoDoc, uid };
        return true;
    } catch (e) { return false; }
}
setInterval(() => { vkAutosalvar(); }, 30000);
(() => {
    // salvar: depois de gravar o .aknv, a cópia de recuperação não é mais necessária
    const salvar = VK_CMDS.salvar.fn;
    VK_CMDS.salvar.fn = async a => { const uid = vkUid(); const r = await salvar(a); if (r && !r.cancelado && uid) { try { await vkApi().vk_descartar_recuperacao(uid); } catch (e) { /* sem cópia */ } } return r; };
    // novo/abrir com alteração pendente: guarda a cópia antes de trocar (nada se perde, sem diálogo)
    for (const nome of ['novo', 'abrir']) {
        const orig = VK_CMDS[nome].fn;
        VK_CMDS[nome].fn = async a => {
            if (VK.doc && VK.sujo && await vkAutosalvar(true)) vkToast(`"${VK.doc.nome}" tinha alterações não salvas: ficou na recuperação`);
            const r = await orig(a); vkUid(); return r;
        };
    }
    // recuperacao: acao listar (padrão) | recuperar (uid) | descartar (uid | todos)
    vkRegistrar('recuperacao', 'recuperação', async a => {
        const api = vkApi(), acao = a.acao || 'listar';
        if (acao === 'listar') return { copias: await api.vk_recuperaveis() };
        if (acao === 'descartar') { const L = a.todos ? (await api.vk_recuperaveis()).map(c => c.uid) : [a.uid]; for (const u of L) await api.vk_descartar_recuperacao(u); return { descartadas: L.length }; }
        const r = await api.vk_recuperar(a.uid); if (!r || !r.success) throw new Error((r && r.error) || 'não recuperou');
        VK.doc = r.doc; VK.path = r.meta.caminho || null; VK.hist = []; VK.futuro = []; VK.sel = []; VK._antes = null;
        VK.ativa = VK.doc.pranchetas[0].id; VK.camadaAtiva = VK.doc.camadas[0].id; VK.sujo = true; VK.geo.clear && VK.geo.clear();
        if (VK.doc.fontes && api.vk_registrar_fontes) { try { await api.vk_registrar_fontes(VK.doc.fontes); } catch (e) { /* sem fontes embutidas */ } }
        setTimeout(() => vkEnquadrar(), 0); vkMudou();
        return { recuperado: VK.doc.nome, caminho: VK.path, objetos: vkTodos().length };
    });
})();
// aviso ao abrir o Vetor
async function vkRecuperacaoVerificar() {
    let L = [];
    try { L = await vkApi().vk_recuperaveis(); } catch (e) { return; }
    if (!L.length) return;
    const quando = t => new Date(t * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    vkModal(`<div class="ie-dlg-tit">Recuperar trabalho não salvo</div><div class="ie-dlg-corpo">
        <div class="vk-nota">O Vetor guardou ${L.length > 1 ? 'estes documentos' : 'este documento'} antes de fechar sem salvar (queda ou fechamento):</div>
        ${L.map(c => `<div class="vk-linha"><span style="flex:1"><b>${vkEsc_(c.nome || 'Sem título')}</b><br><small>${quando(c.quando)}${c.caminho ? ' · ' + vkEsc_(c.caminho) : ' · nunca salvo'}</small></span>
            <button class="ie-btn ie-btn-mini" data-rec="${c.uid}">Recuperar</button><button class="ie-btn ie-btn-mini" data-desc="${c.uid}">Descartar</button></div>`).join('')}
        </div><div class="ie-dlg-pe"><button class="ie-btn" data-x>Depois</button></div>`, (m, fechar) => {
        m.addEventListener('click', async e => {
            const r = e.target.closest('[data-rec]'), d = e.target.closest('[data-desc]');
            if (r) { fechar(); await vkCmdUi('recuperacao', { acao: 'recuperar', uid: r.dataset.rec }); vkToast('Recuperado: salve com Ctrl+S'); }
            if (d) { await vkApi().vk_descartar_recuperacao(d.dataset.desc); d.closest('.vk-linha').remove(); if (!m.querySelector('[data-rec]')) fechar(); }
        });
    });
}
