// =========================================================
// Pocket Editor — Ctrl+V com o que foi copiado FORA do editor (Functions/area_transferencia.py)
// Arquivos copiados no Explorer (vídeo, áudio, imagem), imagem copiada (print, navegador) ou texto entram na
// agulha, sempre numa trilha acima da última usada (não sobrepõem nada). Vale a cópia mais nova: um Ctrl+C num
// clipe/legenda do editor guarda o contador da área de transferência do Windows (VE.cbSeq); se ele mudou desde
// então, alguém copiou outra coisa depois e é ela que entra.
// =========================================================

VE.cbSeq = null;
const veCeApi = () => window.pywebview && window.pywebview.api;

// Ctrl+C / Ctrl+X no editor: marca o momento (a cópia interna passa a ser a mais nova)
function veCeMarcarCopia() {
    const api = veCeApi();
    if (api && api.ve_area_seq) api.ve_area_seq().then(r => { VE.cbSeq = r && r.seq; }).catch(() => {});
}

// Primeira trilha acima de todas as usadas na linha V (ou A); nunca a de baixo do vídeo principal
function veCeTrilhaAcima(kind) {
    const usadas = VE.clips.filter(kind === 'a' ? veOcupaA : veOcupaV).map(c => c.tr);
    let tr = usadas.length ? Math.max(...usadas) + 1 : 0;
    while (veTrkLocked(tr)) tr++;
    veEnsureTrackIndex(tr);
    return tr;
}

async function veColarTudo() {
    const api = veCeApi();
    if (!VE.ready || !api || !api.ve_area_transferencia) { veColar(); return; }
    let r = null;
    try { r = await api.ve_area_transferencia(VE.projectPath || ''); } catch (e) { r = null; }
    const externo = r && r.success && r.tipo && (!VE.clipboard || r.seq !== VE.cbSeq);
    if (!externo) {
        if (r && !r.success && r.error) veToast(r.error);
        veColar();
        return;
    }
    if (VE.playing) veStop();
    if (r.tipo === 'texto') veCeTexto(r.texto);
    else await veCeArquivos(r.paths || [], r.tipo === 'imagem');
}

// Texto copiado → clipe de texto centralizado, na trilha de cima
function veCeTexto(txt) {
    if (VE.info && VE.info.audio_only) { veToast('Texto precisa de um vídeo'); return; }
    const m = veTxMidia(), st = veSnapFrame(VE.playhead), tr = veCeTrilhaAcima('v');
    vePushHistory();
    const clip = { tr, st, s: 0, e: VE_TX_DUR, m: m.id, tx: { ...VE_TX_PADRAO, t: txt, alin: 'center' },
                   p: { sc: 100, x: Math.round(VE.seqW / 2), y: Math.round(VE.seqH / 2), rot: 0, op: 100 } };
    VE.clips.push(clip);
    VE.sel = VE.clips.indexOf(clip);
    veRelayout();
    veAfterEdit(VE.playhead);
    veToast(`${veT('Texto colado em')} V${tr + 1}`);
}

// Espera uma condição da mídia (dados do vídeo, tamanho da imagem...) por até `ms`
function veCeEsperar(ok, ms) {
    return new Promise(res => {
        const t0 = performance.now();
        (function f() { if (ok()) res(true); else if (performance.now() - t0 > ms) res(false); else setTimeout(f, 120); })();
    });
}

// Arquivos (ou a imagem colada, já salva como PNG): cada um entra na agulha, um em cima do outro
async function veCeArquivos(paths, imagemColada) {
    const st = veSnapFrame(VE.playhead);
    let n = 0;
    for (const path of paths) {
        const nome = path.split(/[\\/]/).pop();
        let m = VE.media.find(x => x && !x.removido && x.path === path && x.rvDe == null);
        if (!m) {
            const antes = VE.media.length;
            if (!(await vePjImportarArquivo(path, null))) { veToast(`${nome}: ${veT('formato não suportado')}`); continue; }
            m = VE.media.slice(antes).find(x => x && x.path === path) || VE.media[VE.media.length - 1];
            vePjRender && vePjRender();
        }
        if (m.kind === 'image') {
            await veCeEsperar(() => m.w > 0, 5000);
            const tr = veCeTrilhaAcima('v');
            vePushHistory();
            const clip = { tr, st, s: 0, e: VE_IMG_DUR, m: m.id };
            clip.p = veDefProps(clip);
            VE.clips.push(clip);
            VE.sel = VE.clips.indexOf(clip);
            veRelayout();
            veAfterEdit(VE.playhead);
            n++;
        } else if (m.kind === 'audio') {
            await veCeEsperar(() => m.dur > 0, 15000);
            if (vePjAudioEm(m, st, veCeTrilhaAcima('a'))) n++;
        } else if (m.kind === 'video') {
            const dur = () => (m.id === 0 ? VE.srcDur : m.info && m.info.duration);
            if (!dur()) veToast(`${veT('Preparando')} ${nome}…`);
            if (!(await veCeEsperar(() => dur() || m.erro, 60000)) || m.erro) {
                veToast(`${nome}: ${m.erro || veT('demorou demais para preparar; arraste do painel Projeto')}`);
                continue;
            }
            // vídeo ocupa V e A da trilha: acima das duas linhas
            const tr = Math.max(veCeTrilhaAcima('v'), veCeTrilhaAcima('a'));
            const antes = VE.clips.length;
            vePjColocar([m.id], { t: st, tr, rowKind: 'v' });
            if (VE.clips.length > antes) n++;
        }
    }
    if (n) veToast(imagemColada ? `${veT('Imagem colada em')} V${VE.clips[VE.sel] ? VE.clips[VE.sel].tr + 1 : ''}`
                                : `${n} ${veT(n > 1 ? 'arquivos colados na timeline' : 'arquivo colado na timeline')}`);
}
