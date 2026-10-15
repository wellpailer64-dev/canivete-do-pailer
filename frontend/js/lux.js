// =========================================================
// Lux Kanivete (Lk, amarelo) — a Cena 3D como ferramenta própria: embalagens, luzes (softbox, spot, ponto, sol),
// materiais do Blender e render fotorrealista. Entra pela barra lateral (categoria 3D) e pela Home sem passar pelo
// Editor; do Editor, duplo clique numa cena 3D abre a mesma ferramenta. O motor é o mesmo da Cena 3D
// (editor-3d*.js: a cena mora no projeto do Editor — histórico, Ctrl+S, timeline); aqui só a porta de entrada, a marca
// e a volta. Abrir: a cena selecionada, a última cena 3D da timeline ou uma nova (5 s, fundo transparente e Estúdio 3 pontos).
// =========================================================

const LUX = { de: 'home', nome: 'Lux Kanivete', sigla: 'Lk' };

async function luxAbrir(op = {}) {
    const antes = document.querySelector('.menu-item.active')?.dataset.tool;
    if (antes && antes !== 'lux-kanivete') LUX.de = antes;
    switchTool('video-cutter');   // o motor da cena mora no Editor (fica atrás da janela da Lux)
    document.querySelectorAll('.menu-item').forEach(i => i.classList.toggle('active', i.dataset.tool === 'lux-kanivete'));
    const tt = document.getElementById('tool-title'); if (tt) tt.textContent = LUX.nome;
    await new Promise(r => setTimeout(r, 30));
    try {
        const nova = op.nova || op.dados;
        let c = nova ? null : VE.clips[VE.sel];
        if (!(c && ve3dEh(veMediaOf(c)))) c = nova ? null : [...VE.clips].reverse().find(x => ve3dEh(veMediaOf(x)));
        if (!c) c = op.dados ? luxCenaDe(op.dados, op.arquivo) : await luxNovaCena();
        VE3T.lux = true;
        await ve3dTelaAbrir(c);
    } catch (e) { VE3T.lux = false; veToast(e.message || String(e)); }
}
// cena nova pronta para produto: um pote no centro, fundo transparente e as quatro softboxes do estúdio de agência
async function luxNovaCena() {
    const n = VE.media.filter(m => m && !m.removido && ve3dEh(m)).length;
    const r = ve3dNova({ dur: 5, st: 0, nome: `${veT('Cena')} ${n + 1}` }), m = VE.media[r.midia];
    // fundo transparente (padrão do Kanivete: PNG com sombra, pronto para compor); estúdio infinito é opção no Cenário
    await VE3DAPI.modelo({ embalagem: 'pote', cena: m.id });   // começa com um produto no centro (troca no painel)
    await VE3DAPI.estudio3pontos({ cena: m.id });
    return VE.clips[r.clipe];
}
// cena vinda de um .lknv (lux-ui.js luxAbrirArquivo): entra na timeline e lembra o arquivo (Ctrl+S grava nele)
function luxCenaDe(dados, arquivo) {
    const r = ve3dNova({ dur: +dados.duracao || 5, st: 0, nome: dados.nome || luxNomeArq(arquivo), cena: dados.c3d }), m = VE.media[r.midia];
    m.lux = { arquivo };
    return VE.clips[r.clipe];
}
// a janela da Lux fechou (Fechar / Esc): volta para onde estava (ou a Home)
function luxSaiu() {
    const para = LUX.de && LUX.de !== 'video-cutter' && LUX.de !== 'lux-kanivete' ? LUX.de : 'home';
    switchTool(para);
}
// da Lux para o Editor: a cena continua na timeline
function luxParaEditor() {
    VE3T.lux = false; ve3dTelaFechar(); switchTool('video-cutter');
}
window.LUX_API = { abrir: luxAbrir, nova: () => luxAbrir({ nova: true }) };
