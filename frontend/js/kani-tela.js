// =========================================================
// Kani fora da Home (2026-10-16):
// 1. Bolinha flutuante (avatar) em qualquer ferramenta: arrastar leva para onde quiser (posição guardada), clicar abre
//    a gaveta. Some com a gaveta aberta; na Home continua a pílula "Pergunte à Kani".
// 2. Contexto da tela: a cada mensagem a Kani recebe um RESUMO EM TEXTO do que está aberto (documento, seleção,
//    camada, timeline, slide...). Só é lido na hora de enviar (nada roda parado), ~100–300 tokens, no fim do prompt
//    (a parte fixa continua no cache do llama.cpp). O pé da gaveta mostra o que ela está vendo; clicar desliga.
// Cada ferramenta: KANI_TELA['<id da página>'] = () => texto. Erro numa leitura não impede a conversa.
// =========================================================
const KANI_TELA_MAX = 1600;
const kaniNomeArq = p => String(p || '').split(/[\\/]/).pop();
const kaniSeg = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const kaniCurto = (s, n = 80) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const KANI_TELA = {
    'editor-imagem': () => {   // Photo Kanivete
        const doc = IE.doc; if (!doc) return 'Nenhum documento aberto.';
        const todas = ieTodas(doc), ativa = ieAtiva(doc), sel = ieSelecionadas(doc);
        const desc = L => `${L.nome}${L.txt || L.texto ? ` (texto: "${kaniCurto(L.txt ? L.txt.s : L.texto && (L.texto.s || L.texto.texto || ''), 70)}")` : L.tipo && L.tipo !== 'pixel' ? ` (${L.tipo})` : ''}`;
        const l = [`Documento: ${doc.nome} — ${doc.w}×${doc.h} px, ${todas.length} camadas${doc.fatias && doc.fatias.length ? `, ${doc.fatias.length} slides/fatias` : ''}${IE.docs.length > 1 ? `; outros abertos: ${IE.docs.filter(d => d !== doc).map(d => d.nome).join(', ')}` : ''}.`];
        l.push(`Ferramenta: ${(IE_FERR[IE.ferr] && IE_FERR[IE.ferr].nome) || IE.ferr}.`);
        if (IE.edTexto) l.push(`Editando o texto: "${kaniCurto(IE.edTexto.L.txt.s, 160)}".`);
        if (sel.length > 1) l.push(`Selecionadas: ${sel.slice(0, 8).map(desc).join('; ')}.`);
        else if (ativa) l.push(`Camada ativa: ${desc(ativa)}.`);
        // o que está ESCRITO na peça, slide por slide (sem isto a Kani inventava a partir dos nomes das camadas)
        const txtDe = L => String(L.txt ? L.txt.s : (L.textoNovo || (L.texto && (L.texto.s || L.texto.texto)) || '')).replace(/\s+/g, ' ').trim();
        const fat = doc.fatias && doc.fatias.length > 1 ? doc.fatias : null;
        const textos = todas.filter(L => (L.txt || L.texto) && L.visivel !== false && txtDe(L)).map(L => {
            const R = ieRCamada(L) || { x: 0, y: 0, w: 0, h: 0 }, cx = R.x + R.w / 2;
            const s = fat ? Math.max(0, fat.findIndex(F => cx >= F.x && cx < F.x + F.w)) : 0;
            return { s, y: R.y, x: R.x, t: txtDe(L) };
        }).sort((a, b) => a.s - b.s || a.y - b.y || a.x - b.x);
        if (textos.length) {
            // uma linha por slide (ou uma só, sem slides): "Slide 2: título | subtítulo | ..."
            const linhas = [];
            for (const k of textos) {
                const rot = fat ? `Slide ${k.s + 1}: ` : '';
                const atual = linhas.length && linhas[linhas.length - 1].s === k.s ? linhas[linhas.length - 1] : null;
                if (atual) atual.t += ' | ' + kaniCurto(k.t, 140); else linhas.push({ s: k.s, t: rot + kaniCurto(k.t, 140) });
            }
            let bloco = 'Textos da peça (o que está escrito, em ordem):';
            for (const x of linhas) { if ((bloco + '\n' + x.t).length > 1000) { bloco += '\n…'; break; } bloco += '\n' + x.t; }
            l.push(bloco);
        } else l.push('A peça não tem camadas de texto.');
        const topo = [...todas].reverse().slice(0, 10).map(L => L.nome);
        if (topo.length) l.push(`Nomes das camadas (de cima): ${topo.join(', ')}${todas.length > 10 ? '…' : ''}.`);
        return l.join('\n');
    },
    'video-cutter': () => {   // Vídeo Kanivete
        if (!VE.clips || (!VE.clips.length && !VE.projectPath)) return 'Editor de vídeo sem projeto aberto.';
        const seq = typeof veSeqAtiva === 'function' ? veSeqAtiva() : null;
        const nomeClipe = c => c && (c.name || c.nome || (VE.media.find(m => m.id === (c.mid ?? c.m ?? c.media)) || {}).name || `trilha ${c.tr}`);
        const l = [`Projeto: ${VE.projectPath ? kaniNomeArq(VE.projectPath) : 'não salvo'}${seq ? `, timeline "${seq.name}"` : ''} — ${VE.seqW}×${VE.seqH}, ${VE.fps} qps, duração ${kaniSeg(VE.dur)}, ${VE.clips.length} clipes.`];
        l.push(`Agulha em ${kaniSeg(VE.playhead)}.`);
        const c = VE.clips[VE.sel];
        if (c) l.push(`Clipe selecionado: ${kaniCurto(nomeClipe(c), 60)} (trilha ${c.tr}, começa em ${kaniSeg(c.st)}, dura ${kaniSeg((c.e - c.s) || 0)}).`);
        const sob = VE.clips.filter(k => VE.playhead >= k.st && VE.playhead < k.st + ((k.e - k.s) || 0)).slice(0, 5).map(nomeClipe);
        if (sob.length) l.push(`Na agulha: ${sob.map(n => kaniCurto(n, 40)).join(', ')}.`);
        if (VE.markers && VE.markers.length) l.push(`${VE.markers.length} marcadores.`);
        return l.join('\n');
    },
    'vetor-kanivete': () => {   // Vetor Kanivete
        if (!VK.doc) return 'Vetor sem documento aberto.';
        const l = [`Documento: ${VK.path ? kaniNomeArq(VK.path) : 'não salvo'}${VK.doc.pranchetas ? `, ${VK.doc.pranchetas.length} pranchetas` : ''}.`];
        const objs = (VK.sel || []).map(id => typeof vkObj === 'function' ? vkObj(id) : null).filter(Boolean);
        if (objs.length) l.push(`Selecionados (${objs.length}): ${objs.slice(0, 6).map(o => `${o.nome || o.tipo}${o.texto || o.s ? ` "${kaniCurto(o.texto || o.s, 50)}"` : ''}`).join('; ')}.`);
        else l.push('Nada selecionado.');
        return l.join('\n');
    },
    'sound-kanivete': () => {   // Sound Kanivete
        if (!SK.proj) return 'Sound sem projeto aberto.';
        const f = SK.proj.faixas || [];
        return `Projeto: ${SK.proj.nome || 'sem nome'} — ${f.length} faixas (${f.slice(0, 8).map(x => `${x.nome}: ${(x.clipes || []).length} clipes`).join('; ')}). Agulha em ${kaniSeg(SK.ph)}.`;
    },
    'slider-kanivete': () => {   // Slider Kanivete
        if (!SD.doc) return 'Slider sem apresentação aberta.';
        const n = SD.doc.slides.length, i = SD.atual;
        let txt = ''; try { txt = String(SDK.texto({ slide: i + 1 }) || ''); } catch (e) { }
        return `Apresentação: ${SD.arquivo ? kaniNomeArq(SD.arquivo) : 'não salva'} — ${n} slides, no slide ${i + 1}.\nTexto do slide:\n${kaniCurto(txt, 700)}`;
    },
};

// ferramentas sem leitor próprio: título da página e arquivos escolhidos nos campos (nada de conteúdo pessoal além disso)
function kaniTelaGenerica(pg) {
    const titulo = pg.querySelector('h1, h2, .page-title, .tool-title');
    const arqs = [...pg.querySelectorAll('input[type=text], input:not([type])')].map(i => i.value).filter(v => /[\\/].+\.\w{2,5}$/.test(v)).slice(0, 4).map(kaniNomeArq);
    return [titulo ? `Tela: ${kaniCurto(titulo.textContent, 80)}.` : '', arqs.length ? `Arquivos escolhidos: ${arqs.join(', ')}.` : ''].filter(Boolean).join('\n');
}

function kaniContextoTela() {
    if (localStorage.getItem('kani-ver-tela') === '0') return '';
    const pg = document.querySelector('.tool-page.active'); if (!pg) return '';
    const id = pg.id.replace(/^page-/, ''); if (id === 'home') return '';
    let t = '';
    try { t = KANI_TELA[id] ? KANI_TELA[id]() : kaniTelaGenerica(pg); } catch (e) { console.warn('[Kani] contexto da tela:', e); t = ''; }
    if (!t) return '';
    // a regra vai junto do resumo (vale também com o back antigo, que ainda não tem a instrução no prompt)
    return String(t).slice(0, KANI_TELA_MAX - 160) + '\n(Isto é tudo o que a Kani sabe da tela. Use só estes dados; o que não estiver aqui, diga que não sabe ou pergunte — nunca invente o conteúdo.)';
}

// aviso no pé da gaveta: o que ela está vendo (clicar liga/desliga)
function kaniTelaChip() {
    const pe = document.getElementById('kani-pe'); if (!pe) return;
    let chip = document.getElementById('kani-tela-chip');
    if (!chip) {
        chip = document.createElement('button'); chip.id = 'kani-tela-chip'; chip.className = 'kani-tela-chip';
        chip.onclick = () => { localStorage.setItem('kani-ver-tela', localStorage.getItem('kani-ver-tela') === '0' ? '1' : '0'); kaniTelaChip(); };
        pe.prepend(chip);
    }
    const pg = document.querySelector('.tool-page.active'), id = pg ? pg.id.replace(/^page-/, '') : 'home';
    const des = localStorage.getItem('kani-ver-tela') === '0';
    chip.hidden = id === 'home';
    const prim = (kaniContextoTela().split('\n')[0] || '').replace(/^(Documento|Projeto|Apresentação|Tela): /, '');
    chip.textContent = des ? '👁 Não está vendo a tela — clique para mostrar' : `👁 Vendo: ${kaniFerramentaAtual()}${prim ? ' · ' + kaniCurto(prim.split(' — ')[0], 40) : ''}`;
    chip.title = des ? 'A Kani não recebe o que está na tela' : 'A Kani recebe um resumo do que está aberto (documento, seleção, timeline). Clique para desligar.';
    chip.classList.toggle('off', des);
}

// ── bolinha flutuante fora da Home ──
function kaniFlutuaPos(b, x, y) {
    const m = 8, w = b.offsetWidth || 52, h = b.offsetHeight || 52;
    x = Math.min(Math.max(m, x), innerWidth - w - m); y = Math.min(Math.max(m, y), innerHeight - h - m);
    b.style.left = x + 'px'; b.style.top = y + 'px';
    return { x, y };
}
function kaniFlutua() {
    if (document.getElementById('kani-flutua')) return;
    const b = document.createElement('button');
    b.id = 'kani-flutua'; b.className = 'kani-flutua'; b.title = 'Kani — clique para conversar, arraste para mudar de lugar';
    b.innerHTML = '<span class="kani-av">K</span>';
    document.body.appendChild(b);
    let pos = null; try { pos = JSON.parse(localStorage.getItem('kani-flutua-pos') || 'null'); } catch (e) { }
    const colocar = () => { const p = pos || { x: innerWidth - 80, y: innerHeight - 96 }; kaniFlutuaPos(b, p.x, p.y); };
    colocar();
    addEventListener('resize', colocar);
    b.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        b.setPointerCapture(ev.pointerId);
        const r = b.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top, x0 = ev.clientX, y0 = ev.clientY;
        let arrastou = false;
        b.onpointermove = e => {
            if (!arrastou && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
            arrastou = true; b.classList.add('arrastando');
            pos = kaniFlutuaPos(b, e.clientX - dx, e.clientY - dy);
        };
        b.onpointerup = () => {
            b.onpointermove = b.onpointerup = null; b.classList.remove('arrastando');
            if (arrastou) { try { localStorage.setItem('kani-flutua-pos', JSON.stringify(pos)); } catch (e) { } }
            else kaniAbrir();
        };
    });
}
document.addEventListener('DOMContentLoaded', kaniFlutua);
if (document.readyState !== 'loading') kaniFlutua();

// o chip acompanha a gaveta abrindo e a troca de ferramenta (só nesses momentos: nada roda com o app parado)
(function () {
    const abrir = kaniAbrir;
    kaniAbrir = async function (...a) { const r = await abrir.apply(this, a); kaniTelaChip(); return r; };
    if (typeof switchTool === 'function') {
        const trocar = switchTool;
        switchTool = function (...a) { const r = trocar.apply(this, a); if (KANI.aberto) setTimeout(kaniTelaChip, 0); return r; };
    }
})();

window.KANI_TELA = KANI_TELA;
window.kaniContextoTela = kaniContextoTela;
