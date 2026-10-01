// =========================================================
// Modo agente (Instructions/modo-agente.md): o que o Claude usa para ver e mexer no app aberto
//   window.__veLog      → os últimos avisos, erros e resultados de exportação que apareceram (veAgLog)
//   veLogTexto(n)       → as n últimas linhas do registro, em texto
//   veAgenteMidia(cmd, [args]) → ferramentas de leitura de mídia (Functions/agente_midia.py) num processo à parte:
//                         'analisar' <projeto> [--nao-usados-em NOME] | 'folha' | 'storyboard' | 'transcrever' | 'batidas'
//   veAgente(acao, fn)  → ação do Claude: mostra o aviso "✦ Claude: ação", registra e roda fn (o desfazer
//                         continua valendo, como qualquer edição)
// =========================================================

window.__veLog = window.__veLog || [];
const VE_AG_MAX = 300;

function veAgLog(tipo, msg) {
    const L = window.__veLog;
    L.push({ t: new Date().toTimeString().slice(0, 8), tipo, msg: String(msg == null ? '' : msg).slice(0, 2000) });
    if (L.length > VE_AG_MAX) L.splice(0, L.length - VE_AG_MAX);
}

function veLogTexto(n = 40) {
    return window.__veLog.slice(-n).map(e => `${e.t} [${e.tipo}] ${e.msg}`).join('\n');
}

// erros de JavaScript e promessas rejeitadas também entram no registro
window.addEventListener('error', e => veAgLog('erro', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', e => veAgLog('erro', 'promessa: ' + ((e.reason && (e.reason.message || e.reason)) || '?')));
(function () {
    const orig = console.error;
    console.error = function (...a) {
        veAgLog('console', a.map(x => (x && x.message) || (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
        return orig.apply(this, a);
    };
})();

// Avisos da tela (toast da tela inicial, veToast do editor) e o fim de cada exportação: embrulha as funções
// depois que os scripts delas carregaram
function veAgEmbrulhar() {
    const envolve = (nome, tipo, fmt) => {
        const f = window[nome];
        if (typeof f !== 'function' || f.__veAg) return;
        const novo = function (...a) {
            try { const m = fmt(...a); if (m) veAgLog(tipo, m); } catch (e) { /* o registro nunca atrapalha */ }
            return f.apply(this, a);
        };
        novo.__veAg = true;
        window[nome] = novo;
    };
    envolve('toast', 'aviso', (m, tipo) => (tipo && tipo !== 'info' ? `(${tipo}) ` : '') + m);
    envolve('veToast', 'aviso', m => (typeof m === 'string' ? m : m && m.msg));
    envolve('veOnExport', 'export', ev => {
        if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return null; } }
        if (!ev || !ev.done) return null;
        return ev.success ? `concluída: ${ev.output_path} (${ev.duration ? ev.duration.toFixed(1) + ' s' : '?'})` : `FALHOU: ${ev.error || '?'}`;
    });
}
document.addEventListener('DOMContentLoaded', () => setTimeout(veAgEmbrulhar, 0));
window.addEventListener('load', veAgEmbrulhar);

// ── aviso "✦ Claude: ..." (canto de cima, some sozinho) ──
function veAgAviso(texto, erro) {
    let box = document.getElementById('ve-agente-avisos');
    if (!box) {
        box = document.createElement('div');
        box.id = 've-agente-avisos';
        box.className = 've-agente-avisos';
        document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 've-agente-aviso' + (erro ? ' erro' : '');
    el.textContent = '✦ Claude: ' + texto;
    box.appendChild(el);
    setTimeout(() => el.classList.add('saindo'), 4500);
    setTimeout(() => el.remove(), 5000);
}

window.veAgente = async function (acao, fn) {
    veAgLog('claude', acao);
    veAgAviso(acao);
    if (typeof fn !== 'function') return undefined;
    try {
        return await fn();
    } catch (e) {
        veAgLog('erro', `Claude: ${acao} — ${(e && e.message) || e}`);
        veAgAviso(`${acao} (falhou)`, true);
        throw e;
    }
};

// Ferramentas de leitura de mídia (rodam fora do editor, prioridade baixa); devolve o texto/JSON do comando
window.veAgenteMidia = async function (cmd, args = []) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.ve_agente_midia) throw new Error('API do agente indisponível');
    veAgLog('claude', `analisando mídia: ${cmd} ${args.join(' ')}`.slice(0, 300));
    const r = await api.ve_agente_midia(cmd, args);
    if (!r || !r.success) throw new Error((r && r.error) || 'falhou');
    try { return JSON.parse(r.saida); } catch (e) { return r.saida; }
};
