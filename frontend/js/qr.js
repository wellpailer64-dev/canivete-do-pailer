/* QR Code personalizado (Qr) — Functions/qr_personalizado.py via qr_previa / qr_exportar. */
const QR = { p: { tipo: 'url', texto: '', cor: '#0D4048', fundo: '#FDF1E0', olho: '#0D4048', pontos: 'arredondado', logo: '', logo_pct: 17, senha: '', mensagem: '', seguranca: 'WPA' }, t: null, seq: 0 };
const qrApi = () => window.pywebview && window.pywebview.api;
const qrEl = id => document.getElementById(id);

function qrAoTrocar(toolId) {
    if (toolId !== 'qr-kanivete') return;
    qrMontar();
}

function qrMontar() {
    const pg = qrEl('page-qr-kanivete');
    if (!pg || pg.dataset.ok) return;
    pg.dataset.ok = '1';
    const dicas = { url: 'https://seusite.com', texto: 'Qualquer texto', whatsapp: 'Número com DDD, ex.: 11999998888', wifi: 'Nome da rede (SSID)', pix: 'Pix copia e cola (BR Code)' };
    pg.innerHTML = `
    <div class="qr-app">
      <aside class="qr-lado">
        <div class="qr-marca"><span class="app-logo al-qr app-logo-marca">Qr</span><b>QR Code</b></div>
        <label>Tipo</label>
        <select id="qr-tipo">${[['url', 'Link'], ['wifi', 'Wi-Fi'], ['whatsapp', 'WhatsApp'], ['pix', 'Pix'], ['texto', 'Texto']].map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        <label id="qr-rt">Conteúdo</label>
        <textarea id="qr-texto" rows="3" spellcheck="false" placeholder="${dicas.url}"></textarea>
        <div id="qr-extra-wifi" hidden><label>Senha</label><input id="qr-senha" type="text"></div>
        <div id="qr-extra-wa" hidden><label>Mensagem (opcional)</label><input id="qr-mensagem" type="text"></div>
        <div class="qr-cores">
          <div><label>QR</label><input type="color" id="qr-cor" value="${QR.p.cor}"></div>
          <div><label>Fundo</label><input type="color" id="qr-fundo" value="${QR.p.fundo}"></div>
          <div><label>Olhos</label><input type="color" id="qr-olho" value="${QR.p.olho}"></div>
        </div>
        <label>Pontos</label>
        <div class="qr-seg" id="qr-pontos">${[['quadrado', 'Quadrado'], ['arredondado', 'Arredondado'], ['bolinha', 'Bolinha']].map(([k, n]) => `<button data-v="${k}" class="${k === QR.p.pontos ? 'on' : ''}">${n}</button>`).join('')}</div>
        <label>Logo no centro</label>
        <div class="qr-logo"><button id="qr-logo-bt">Escolher imagem</button><button id="qr-logo-x" hidden>Remover</button></div>
        <div id="qr-logo-tam" hidden><label>Tamanho do logo: <b id="qr-pct-v">17</b>%</label><input type="range" id="qr-pct" min="5" max="22" value="17"></div>
      </aside>
      <main class="qr-meio">
        <div class="qr-tela"><img id="qr-img" alt=""><div id="qr-vazio">Digite o conteúdo para ver o QR</div></div>
        <div id="qr-aviso"></div>
        <div class="qr-exp"><button data-f="png">Salvar PNG</button><button data-f="svg">Salvar SVG</button><button data-f="pdf">Salvar PDF</button><button id="qr-copiar" class="sec">Copiar</button></div>
        <div id="qr-msg"></div>
      </main>
    </div>`;
    const ler = () => {
        const p = QR.p;
        p.tipo = qrEl('qr-tipo').value; p.texto = qrEl('qr-texto').value.trim();
        p.senha = qrEl('qr-senha').value; p.mensagem = qrEl('qr-mensagem').value;
        p.cor = qrEl('qr-cor').value; p.fundo = qrEl('qr-fundo').value; p.olho = qrEl('qr-olho').value;
        p.logo_pct = +qrEl('qr-pct').value; qrEl('qr-pct-v').textContent = p.logo_pct;
        qrEl('qr-extra-wifi').hidden = p.tipo !== 'wifi'; qrEl('qr-extra-wa').hidden = p.tipo !== 'whatsapp';
        qrEl('qr-texto').placeholder = dicas[p.tipo];
        qrEl('qr-rt').textContent = p.tipo === 'wifi' ? 'Nome da rede' : p.tipo === 'whatsapp' ? 'Número' : p.tipo === 'pix' ? 'Copia e cola' : 'Conteúdo';
        qrAgendar();
    };
    pg.querySelectorAll('select,textarea,input').forEach(e => e.addEventListener('input', ler));
    qrEl('qr-pontos').onclick = e => { const b = e.target.closest('button'); if (!b) return; QR.p.pontos = b.dataset.v; qrEl('qr-pontos').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); qrAgendar(); };
    qrEl('qr-logo-bt').onclick = async () => { const r = await qrApi().qr_escolher_logo(); if (r) qrLogo(r); };
    qrEl('qr-logo-x').onclick = () => qrLogo('');
    pg.querySelectorAll('.qr-exp button[data-f]').forEach(b => b.onclick = () => qrExportar(b.dataset.f));
    qrEl('qr-copiar').onclick = qrCopiar;
}

function qrLogo(caminho) {
    QR.p.logo = caminho;
    qrEl('qr-logo-x').hidden = qrEl('qr-logo-tam').hidden = !caminho;
    qrEl('qr-logo-bt').textContent = caminho ? caminho.split(/[\\/]/).pop() : 'Escolher imagem';
    qrAgendar();
}

function qrAgendar() { clearTimeout(QR.t); QR.t = setTimeout(qrPrevia, 250); }

async function qrPrevia() {
    const api = qrApi(); if (!api) return;
    const n = ++QR.seq;
    if (!QR.p.texto) { qrEl('qr-img').removeAttribute('src'); qrEl('qr-vazio').hidden = false; qrEl('qr-aviso').textContent = ''; return; }
    const r = await api.qr_previa(JSON.stringify(QR.p));
    if (n !== QR.seq) return;   // chegou resposta mais nova
    const av = qrEl('qr-aviso');
    if (!r || !r.success) { av.className = 'ruim'; av.textContent = (r && r.error) || 'Falha ao gerar'; return; }
    qrEl('qr-img').src = r.png; qrEl('qr-vazio').hidden = true;
    av.className = r.legivel ? 'bom' : 'ruim';
    av.textContent = r.legivel ? '✔ Leitura conferida em 3 tamanhos' : '⚠ Leitura difícil: aumente o contraste, reduza o logo ou use pontos quadrados';
}

async function qrCopiar() {
    if (!QR.p.texto) return;
    const m = qrEl('qr-msg'); m.textContent = 'Copiando…';
    const r = await qrApi().qr_copiar(JSON.stringify(QR.p));
    m.textContent = r.success ? 'Copiado: é só colar (Ctrl+V) onde quiser' : 'Erro ao copiar: ' + r.error;
}

async function qrExportar(f) {
    if (!QR.p.texto) return;
    const m = qrEl('qr-msg'); m.textContent = 'Salvando…';
    const r = await qrApi().qr_exportar(JSON.stringify(QR.p), f);
    m.textContent = r.cancelado ? '' : r.success ? 'Salvo: ' + r.arquivo + (r.legivel ? '' : ' (atenção: leitura difícil)') : 'Erro: ' + r.error;
}

if (window.KANI_TELA) KANI_TELA['qr-kanivete'] = () => ({ pagina: 'qr', params: QR.p });
