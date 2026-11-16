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
        if (!ev) return null;
        if (!ev.done) { if (!veAgEmbrulhar.t0) veAgEmbrulhar.t0 = Date.now(); return null; }
        // "(60.0 s)" parecia o tempo de exportação: era a duração do vídeo (relato 2026-10-16) — agora os dois, rotulados
        const levou = veAgEmbrulhar.t0 ? ((Date.now() - veAgEmbrulhar.t0) / 1000).toFixed(1) + ' s' : '?';
        veAgEmbrulhar.t0 = 0;
        if (!ev.success) return `FALHOU (após ${levou}): ${ev.error || '?'}`;
        const mb = ev.size ? ` · ${(ev.size / 1048576).toFixed(1)} MB` : '';
        return `concluída: ${ev.output_path} (duração do vídeo ${ev.duration ? ev.duration.toFixed(1) + ' s' : '?'} · exportou em ${levou}`
            + ` · ${ev.placa || ev.turbo ? 'na placa' : 'no processador'}${mb})`;
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

// ── retorno visual das ações do agente (MCP e ponte): um cursor com a bolinha do agente voa até onde a ação acontece ──
// Quem altera o documento chama kvAgenteFx(texto, seletor, {agente, dominio, comando}); o editor anima sozinho (zero tokens).
// Cor e marca por agente; o rótulo é minúsculo e some logo. Sem "reduzir movimento": o cursor aparece direto no lugar.
const KV_AGENTES = {
    claude: { cor: '#D97757', marca: '✦', nome: 'Claude' },
    codex: { cor: '#10A37F', marca: '◎', nome: 'Codex' },
    pickle: { cor: '#4D6BFE', marca: '◆', nome: 'DeepSeek' },
    kani: { cor: '#7CE08A', marca: '●', nome: 'Kani' },
};
// onde o cursor pousa quando a ferramenta não diz: comandos de camada vão à lista; o resto, à área de trabalho do editor
const KV_ALVOS = {
    photo: { camadas: '.ie-cam.ativa', area: '#ie-canvas', cmds: /^(nova_camada|renomear_camada|definir_visibilidade|ativar_camada|duplicar_camada|mover_na_pilha|modo_mesclagem)$/ },
    vetor: { camadas: '.vk-camada.ativa, .vk-lcamada.ativa', area: '#vk-canvas', cmds: /^(nova_camada|camada|mover_para_camada)$/ },
    video: { camadas: null, area: '#ve-tl', cmds: /^$/ },
    cena3d: { camadas: null, area: '#ve-tl', cmds: /^$/ },
    som: { camadas: null, area: '#sk-tl', cmds: /^$/ },
    lux: { camadas: null, area: '#page-lux-kanivete canvas', cmds: /^$/ },
    slider: { camadas: '.sd-slide.ativo, .sd-mini.ativo', area: '#sd-palco', cmds: /^(slide_novo|slide_duplicar|slide_apagar|slide_mover|slide_layout|slide_fundo)$/ },
};
const kvCursor = { el: null, x: null, y: null, fim: 0, t: 0 };

function kvAgenteCursorEl() {
    if (kvCursor.el && kvCursor.el.isConnected) return kvCursor.el;
    const el = document.createElement('div');
    el.className = 'kv-cursor';
    el.innerHTML = '<svg class="kv-seta" width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 17 L7.2 13.2 L10 19.5 L12.6 18.3 L9.8 12 L15.5 12 Z" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>'
        + '<span class="kv-bola"></span><span class="kv-rotulo"></span>';
    document.body.appendChild(el);
    kvCursor.el = el;
    return el;
}

function kvAgentePonto(seletor, dominio, comando) {
    const alvos = KV_ALVOS[dominio] || {};
    const lista = [seletor, alvos.cmds && alvos.cmds.test(comando || '') ? alvos.camadas : null, alvos.area].filter(Boolean);
    for (const sel of lista) {
        const el = document.querySelector(sel);
        const r = el && el.getBoundingClientRect();
        if (r && r.width > 4 && r.height > 4) {
            // linha de lista: aponta para o rótulo; área grande: um ponto confortável dentro dela
            const grande = r.width > 300 && r.height > 200;
            return { el, x: r.left + (grande ? r.width * 0.5 : Math.min(r.width * 0.35, 120)), y: r.top + (grande ? r.height * 0.45 : r.height / 2) };
        }
    }
    return null;
}

window.kvAgenteFx = function (texto, seletor, op = {}) {
    try {
        const info = KV_AGENTES[String(op.agente || window.kvAgenteAtual || 'claude').toLowerCase()] || KV_AGENTES.claude;
        const ponto = kvAgentePonto(seletor, op.dominio, op.comando);
        if (!ponto) { if (texto) veAgAviso(texto); return; }   // sem onde pousar: cai no aviso antigo
        const el = kvAgenteCursorEl();
        el.style.setProperty('--kv-cor', info.cor);
        el.querySelector('.kv-bola').textContent = info.marca;
        el.querySelector('.kv-rotulo').textContent = String(texto || '').replace(/^executou /, '').slice(0, 42);
        const reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const primeira = kvCursor.x == null || !el.classList.contains('visivel');
        // chega de um canto discreto da própria área na primeira vez; depois sai de onde parou
        if (primeira) { kvCursor.x = ponto.x - 90; kvCursor.y = ponto.y - 70; }
        el.style.transition = 'none';
        el.style.transform = `translate(${kvCursor.x}px, ${kvCursor.y}px)`;
        void el.offsetWidth;
        el.classList.add('visivel');
        el.classList.remove('saindo');
        const dist = Math.hypot(ponto.x - kvCursor.x, ponto.y - kvCursor.y);
        el.style.transition = reduzir ? 'none' : `transform ${Math.min(0.9, 0.25 + dist / 1400)}s cubic-bezier(.22,.8,.3,1), opacity .25s`;
        el.style.transform = `translate(${ponto.x}px, ${ponto.y}px)`;
        kvCursor.x = ponto.x; kvCursor.y = ponto.y;
        // chegou: clique (anel) e pulso no elemento
        clearTimeout(kvCursor.t);
        setTimeout(() => {
            el.classList.remove('clicando'); void el.offsetWidth; el.classList.add('clicando');
            if (ponto.el) {
                ponto.el.classList.remove('kv-agente-pulso'); void ponto.el.offsetWidth;
                ponto.el.classList.add('kv-agente-pulso');
                setTimeout(() => ponto.el.classList.remove('kv-agente-pulso'), 1600);
            }
        }, reduzir ? 0 : 320);
        kvCursor.t = setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.classList.remove('visivel', 'saindo'), 400); }, 2600);
    } catch (e) { /* retorno visual nunca pode quebrar a ação */ }
};

// A ação do agente vira um passo do Ctrl+Z e avisa a prévia: antes, mudar um clipe sem mexer no tamanho dele (ex.: o
// trecho da fonte) deixava o monitor tocando o trecho renderizado ANTIGO (quiz Carlinhos: preto que já tinha sido
// corrigido, 2026-10-13). Se a própria ação já gravou o passo (veRippleRemove etc.), não grava de novo.
window.veAgente = async function (acao, fn) {
    veAgLog('claude', acao);
    veAgAviso(acao);
    if (typeof fn !== 'function') return undefined;
    const editor = typeof VE === 'object' && VE.ready && typeof veSnapshot === 'function';
    const antes = editor ? veSnapshot() : null;
    try {
        const r = await fn();
        if (antes != null && VE.ready && veSnapshot() !== antes) {
            if (VE.history[VE.history.length - 1] !== antes) {
                VE.history.push(antes);
                if (VE.history.length > 200) VE.history.shift();
                VE.future = [];
                if (typeof veUpdateUndo === 'function') veUpdateUndo();
            }
            if (!VE.dirty) { VE.dirty = true; if (typeof veUpdateTitle === 'function') veUpdateTitle(); }
            if (typeof veCacheInvalidate === 'function') veCacheInvalidate();
            if (typeof vePrInvalidar === 'function') vePrInvalidar();
        }
        return r;
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
