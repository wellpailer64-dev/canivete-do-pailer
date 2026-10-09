// Kanivete Ponte — plugin UXP do Premiere Pro (26.x). Busca comandos no servidor do Kanivete
// (tools/ponte_premiere.py, http://127.0.0.1:8765) e devolve o resultado. Comandos fixos abaixo + "js" (roda um trecho
// com ppro e os ajudantes; útil para explorar a API sem recarregar o plugin).
const ppro = require('premierepro');
const URL_BASE = 'http://127.0.0.1:8765';
const $ = id => document.getElementById(id);
const log = t => { const el = $('log'); el.textContent = (new Date().toLocaleTimeString() + ' ' + t + '\n' + el.textContent).slice(0, 4000); };

function plano(v) {
    if (v == null || typeof v !== 'object') return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return String(v); }
}

async function projetoSeq() {
    const projeto = await ppro.Project.getActiveProject();
    if (!projeto) throw new Error('nenhum projeto aberto no Premiere');
    const seq = await projeto.getActiveSequence();
    if (!seq) throw new Error('nenhuma sequência ativa');
    return { projeto, seq };
}

async function clipesAudio(seq, t) {
    const tr = await seq.getAudioTrack(t);
    return tr ? await tr.getTrackItems(ppro.Constants.TrackItemType.CLIP, false) : [];
}

async function lerParam(p) {
    let valor = null, kfs = 0;
    try { const kf = await p.getStartValue(); valor = plano(kf && kf.value ? kf.value.value : kf); } catch (e) { valor = '?' + e; }
    try { kfs = p.isTimeVarying() ? p.getKeyframeListAsTickTimes().length : 0; } catch (e) { /* sem quadros-chave */ }
    return { nome: p.displayName, valor, kfs };
}

async function lerCadeia(cadeia) {
    const out = [];
    const n = cadeia.getComponentCount();
    for (let i = 0; i < n; i++) {
        const c = cadeia.getComponentAtIndex(i);
        const params = [];
        for (let k = 0; k < c.getParamCount(); k++) params.push(await lerParam(c.getParam(k)));
        out.push({ i, nome: await c.getDisplayName(), match: await c.getMatchName(), params });
    }
    return out;
}

async function acharClipe(seq, t, i) {
    const itens = await clipesAudio(seq, t);
    if (!itens[i]) throw new Error(`não há o clipe ${i} na trilha A${t + 1}`);
    return itens[i];
}

// valores por índice do parâmetro ("3") ou pelo nome mostrado ("Gain"), no efeito de índice c da cadeia do clipe.
// Tudo dentro do lockedAccess e com a cadeia buscada de novo: o objeto do efeito "expira" depois de cada transação.
async function porValores(projeto, it, c, valores) {
    const cadeia = await it.getComponentChain();
    let ok = false, erro = null;
    projeto.lockedAccess(() => {
        try {
            const comp = cadeia.getComponentAtIndex(c), acoes = [];
            for (const [chave, v] of Object.entries(valores || {})) {
                let p = null;
                if (/^\d+$/.test(chave)) p = comp.getParam(+chave);
                else for (let k = 0; k < comp.getParamCount(); k++) if (comp.getParam(k).displayName === chave) { p = comp.getParam(k); break; }
                if (!p) throw new Error(`parâmetro não encontrado: ${chave}`);
                acoes.push(p.createSetValueAction(p.createKeyframe(v), true));
            }
            ok = !acoes.length || projeto.executeTransaction(ca => { acoes.forEach(x => ca.addAction(x)); }, 'Kanivete: valores');
        } catch (e) { erro = e; }
    });
    if (erro) throw erro;
    return ok;
}

const COMANDOS = {
    async info() {
        const projeto = await ppro.Project.getActiveProject();
        const seq = projeto ? await projeto.getActiveSequence() : null;
        const r = { uxp: true, projeto: projeto ? projeto.name : null, caminho: projeto ? projeto.path : null, sequencia: seq ? seq.name : null };
        if (seq) r.trilhasAudio = await seq.getAudioTrackCount();
        r.beta = typeof ppro.BetaFeature;
        return r;
    },
    async efeitos_audio() { return await ppro.AudioFilterFactory.getDisplayNames(); },
    // tudo de áudio da sequência ativa: trilhas, clipes e a cadeia de efeitos de cada clipe
    async ler_audio() {
        const { seq } = await projetoSeq();
        const trilhas = [];
        for (let t = 0; t < await seq.getAudioTrackCount(); t++) {
            const tr = await seq.getAudioTrack(t);
            const clipes = [];
            for (const it of await clipesAudio(seq, t)) {
                clipes.push({ nome: await it.getName(), ini: (await it.getStartTime()).seconds, fim: (await it.getEndTime()).seconds,
                              efeitos: await lerCadeia(await it.getComponentChain()) });
            }
            trilhas.push({ t, nome: tr.name, mudo: await tr.isMuted(), clipes });
        }
        return trilhas;
    },
    // {t, i, nome: "Parametric Equalizer", valores: {...}, pos?}
    async aplicar_efeito(a) {
        const { projeto, seq } = await projetoSeq();
        const it = await acharClipe(seq, a.t || 0, a.i || 0);
        const cadeia = await it.getComponentChain();
        const comp = await ppro.AudioFilterFactory.createComponentByDisplayName(a.nome, it);
        let ok = false;
        projeto.lockedAccess(() => {
            ok = projeto.executeTransaction(ca => {
                ca.addAction(a.pos != null ? cadeia.createInsertComponentAction(comp, a.pos) : cadeia.createAppendComponentAction(comp));
            }, 'Kanivete: ' + a.nome);
        });
        if (!ok) throw new Error('o Premiere recusou o efeito ' + a.nome);
        const n = (await it.getComponentChain()).getComponentCount(), c = a.pos != null ? a.pos : n - 1;
        if (a.valores) await porValores(projeto, it, c, a.valores);
        return (await lerCadeia(await it.getComponentChain()))[c];
    },
    // {t, i, c (índice na cadeia), valores}
    async valores(a) {
        const { projeto, seq } = await projetoSeq();
        const it = await acharClipe(seq, a.t || 0, a.i || 0);
        await porValores(projeto, it, a.c, a.valores);
        return (await lerCadeia(await it.getComponentChain()))[a.c];
    },
    async remover_efeito(a) {
        const { projeto, seq } = await projetoSeq();
        const it = await acharClipe(seq, a.t || 0, a.i || 0);
        const cadeia = await it.getComponentChain(), comp = cadeia.getComponentAtIndex(a.c);
        let ok = false;
        projeto.lockedAccess(() => { ok = projeto.executeTransaction(ca => ca.addAction(cadeia.createRemoveComponentAction(comp)), 'Kanivete: remover'); });
        return ok;
    },
    async mudo_trilha(a) {
        const { seq } = await projetoSeq();
        return await (await seq.getAudioTrack(a.t)).setMute(!!a.mudo);
    },
    async salvar() { const p = await ppro.Project.getActiveProject(); return await p.save(); },
    async abrir(a) { const p = await ppro.Project.open(a.caminho); return p ? p.name : null; },
    // trecho livre: recebe ppro e os ajudantes; "return" devolve
    async js(a) {
        // concatenado (não template): um template literal comeria as barras invertidas do código
        const f = new Function('ppro', 'h', 'return (async () => {' + String.fromCharCode(10) + a.codigo + String.fromCharCode(10) + '})();');
        return plano(await f(ppro, { projetoSeq, clipesAudio, lerCadeia, lerParam, acharClipe, porValores }));
    },
};

async function executar(pedido) {
    try {
        const fn = COMANDOS[pedido.cmd];
        if (!fn) throw new Error('comando desconhecido: ' + pedido.cmd);
        const r = { id: pedido.id, ok: true, resultado: plano(await fn(pedido.args || {})) };
        log('✓ ' + pedido.cmd);
        return r;
    } catch (e) {
        log('✗ ' + pedido.cmd + ': ' + e);
        return { id: pedido.id, ok: false, erro: String(e && e.stack || e) };
    }
}

// Pela PASTA (D:\kanivete_testes\ponte_premiere): pedido_<id>.json → resposta_<id>.json. Não depende da regra de rede
// do UXP (http local negado com "Manifest entry not found"); o plugin tem localFileSystem: fullAccess.
const fs = require('fs');
const PASTAS = ['file:/D:/kanivete_testes/ponte_premiere', 'file:///D:/kanivete_testes/ponte_premiere', 'D:/kanivete_testes/ponte_premiere', 'D:\kanivete_testes\ponte_premiere'];
async function acharPasta() {
    const erros = [];
    for (const p of PASTAS) {
        try { await fs.readdir(p); return p; } catch (e) { erros.push(p + ': ' + e); }
    }
    throw new Error(erros.join(' | '));
}
async function lacoPasta() {
    let pasta = null;
    for (;;) {
        try {
            if (!pasta) { pasta = await acharPasta(); $('estado').textContent = 'conectado ao Kanivete (pasta)'; }
            const nomes = (await fs.readdir(pasta)).filter(n => /^pedido_.*\.json$/.test(n)).sort();
            for (const n of nomes) {
                const arq = pasta + '/' + n;
                const pedido = JSON.parse(await fs.readFile(arq, { encoding: 'utf-8' }));
                await fs.unlink(arq);
                const resp = await executar(pedido);
                const tmp = pasta + '/resposta_' + pedido.id + '.tmp';
                await fs.writeFile(tmp, JSON.stringify(resp), { encoding: 'utf-8' });
                await fs.rename(tmp, pasta + '/resposta_' + pedido.id + '.json');
            }
        } catch (e) {
            pasta = null;
            $('estado').textContent = 'pasta: ' + e;
            await new Promise(ok => setTimeout(ok, 2000));
        }
        await new Promise(ok => setTimeout(ok, 150));
    }
}

// Pela rede (servidor tools/ponte_premiere.py); se o UXP negar, fica só a pasta
async function laco() {
    for (;;) {
        let pedido = null;
        try {
            const r = await fetch(URL_BASE + '/proximo');
            if (r.status === 200) pedido = await r.json();
        } catch (e) {
            if (/Permission denied|Manifest/i.test(String(e))) { log('rede negada pelo UXP: usando só a pasta'); return; }
            await new Promise(ok => setTimeout(ok, 2000));
            continue;
        }
        if (!pedido) continue;
        const resp = await executar(pedido);
        try { await fetch(URL_BASE + '/resposta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resp) }); }
        catch (e) { log('não consegui responder: ' + e); }
    }
}
lacoPasta();
laco();
