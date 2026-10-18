// Ata Kanivete — captura dentro do Meet (Functions/ata_kanivete.py injeta antes da página carregar).
// Faixas: "eu" (o microfone que o Meet pediu) e "outros" (os áudios que chegam pela conexão). Opus 24 kb/s em blocos de 5 s.
// Eventos: legendas (texto com o nome de quem fala), participantes, nível de cada áudio recebido e fontes (CSRC) do Meet.
(() => {
  if (window.__ata) return;
  const A = window.__ata = { remotos: [], mics: [], pcs: [], on: false, t0: 0, ctx: null, auto: !!window.__ataAuto };
  const enviar = (o) => { try { window.ataEnviar(JSON.stringify(o)); } catch (e) {} };
  const t = () => +((performance.now() - A.t0) / 1000).toFixed(2);

  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await gum(c);
    if (s.getAudioTracks().length) { A.mics.push(s); if (A.on) ligar(s, A.dMic); }
    return s;
  };
  const PC = window.RTCPeerConnection;
  function NovoPC(...a) {
    const pc = new PC(...a);
    A.pcs.push(pc);
    pc.addEventListener('track', (e) => {
      if (e.track.kind !== 'audio') return;
      const s = new MediaStream([e.track]);
      A.remotos.push({ s, id: e.track.id, an: null });
      if (A.on) ligarRemoto(A.remotos[A.remotos.length - 1]);
    });
    return pc;
  }
  NovoPC.prototype = PC.prototype;
  Object.setPrototypeOf(NovoPC, PC);
  window.RTCPeerConnection = NovoPC;

  function ligar(s, dest) {
    try { const n = A.ctx.createMediaStreamSource(s); n.connect(dest); return n; } catch (e) { enviar({ ev: 'erro', t: t(), msg: String(e) }); }
  }
  function ligarRemoto(r) {
    const n = ligar(r.s, A.dOut);
    if (!n) return;
    r.an = A.ctx.createAnalyser(); r.an.fftSize = 512; n.connect(r.an);
  }
  function gravador(dest, faixa) {
    const m = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 24000 });
    m.ondataavailable = async (e) => {
      if (!e.data.size) return;
      const b = new Uint8Array(await e.data.arrayBuffer());
      let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      enviar({ faixa, b64: btoa(s) });
    };
    m.start(5000);
    return m;
  }

  function nivel(an) {
    const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d);
    let q = 0; for (const v of d) q += v * v;
    return +(Math.sqrt(q / d.length)).toFixed(4);
  }
  let ultCC = '', ultPart = '';
  function amostrar() {
    if (!A.on) return;
    // nível de cada áudio recebido + fontes do Meet (quem está dentro de cada um dos ~3 áudios)
    const niveis = A.remotos.filter(r => r.an).map(r => [r.id.slice(0, 8), nivel(r.an)]).filter(x => x[1] > 0.003);
    const csrc = [];
    for (const pc of A.pcs) for (const rc of pc.getReceivers()) {
      if (rc.track.kind !== 'audio') continue;
      for (const c of (rc.getContributingSources ? rc.getContributingSources() : []))
        if (performance.now() - c.timestamp < 300 && c.audioLevel > 0.01) csrc.push([c.source, +c.audioLevel.toFixed(3)]);
    }
    const mic = A.anMic ? nivel(A.anMic) : 0;
    if (niveis.length || csrc.length || mic > 0.003) enviar({ ev: 'nivel', t: t(), r: niveis, csrc, eu: mic });
    // legendas: o Meet mostra o nome de quem fala junto do texto
    const cc = document.querySelector('[role="region"][aria-label*="egenda"], [role="region"][aria-label*="aption"]');
    const txt = cc ? cc.innerText.trim() : '';
    if (txt && txt !== ultCC) { ultCC = txt; enviar({ ev: 'cc', t: t(), txt }); }
  }
  function participantes() {
    if (!A.on) return;
    const p = [...document.querySelectorAll('[data-participant-id]')].map(el => [el.getAttribute('data-participant-id'),
      (el.innerText || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 2).join(' | ')]);
    const j = JSON.stringify(p);
    if (j !== ultPart) { ultPart = j; enviar({ ev: 'part', t: t(), p }); }
  }

  A.iniciar = () => {
    A.ctx = new AudioContext({ sampleRate: 48000 });
    A.ctx.resume();
    A.dOut = A.ctx.createMediaStreamDestination();
    A.dMic = A.ctx.createMediaStreamDestination();
    A.anMic = A.ctx.createAnalyser(); A.anMic.fftSize = 512;
    A.t0 = performance.now(); A.on = true; A.viu = false;
    A.remotos.forEach(ligarRemoto);
    A.mics.forEach(s => { const n = ligar(s, A.dMic); if (n) n.connect(A.anMic); });
    A.rec = [gravador(A.dOut, 'outros'), gravador(A.dMic, 'eu')];
    A.timers = [setInterval(amostrar, 200), setInterval(participantes, 2000)];
    enviar({ ev: 'inicio', t: 0, quando: new Date().toISOString(), url: location.href, remotos: A.remotos.length, mics: A.mics.length,
      eu: (document.querySelector('[data-self-name]') || {}).getAttribute?.('data-self-name') || '' });
    participantes();
  };
  A.parar = () => {
    if (!A.on || A.parando) return;
    A.parando = true;
    A.rec.forEach(m => m.stop()); A.timers.forEach(clearInterval);
    setTimeout(() => { A.on = false; A.parando = false; enviar({ ev: 'fim', t: t() }); A.ctx.close(); }, 1500);
  };

  // dentro da chamada = o botão de sair existe. Ao sair (ou a reunião acabar), para sozinho; com "gravar ao entrar"
  // (A.auto), começa sozinho. Se o Meet mudar o rótulo do botão, nada acontece sozinho (o botão manual continua).
  const naChamada = () => !!document.querySelector('button[aria-label*="air da chamada" i], button[aria-label*="eave call" i]');
  let dentro = 0, fora = 0;
  function vigiar() {
    if (!A.botao) return;
    const ok = naChamada();
    dentro = ok ? dentro + 1 : 0; fora = ok ? 0 : fora + 1;
    if (ok && A.on) A.viu = true;
    if (!ok && fora >= 3) A.parouManual = false;
    if (A.auto && ok && dentro >= 2 && !A.on && !A.parando && !A.parouManual) A.botao(true);
    if (A.on && A.viu && fora >= 3) A.botao(false);
  }

  // botão por cima do Meet (sem innerHTML: o Meet usa Trusted Types)
  function painel() {
    if (!document.body || document.getElementById('ata-k')) return;
    const el = (tag, css, txt) => { const e = document.createElement(tag); e.style.cssText = css; if (txt) e.textContent = txt; return e; };
    const box = el('div', 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;' +
      'gap:10px;padding:6px 8px 6px 14px;border-radius:999px;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.18);' +
      'font:500 13px/1 "Segoe UI",system-ui,sans-serif;color:#1F2328');
    box.id = 'ata-k';
    const dot = el('span', 'width:9px;height:9px;border-radius:50%;background:#1FA971');
    const nome = el('span', '', 'Ata Kanivete');
    const tempo = el('span', 'color:#6B7280;font-variant-numeric:tabular-nums;min-width:38px', '');
    const bt = el('button', 'border:0;border-radius:999px;padding:7px 14px;background:#1FA971;color:#fff;font:600 13px/1 "Segoe UI",' +
      'system-ui,sans-serif;cursor:pointer', '● Gravar ATA');
    let rel = null;
    A.botao = (ligar) => { if (ligar !== A.on && !A.parando) bt.onclick(); };
    bt.onclick = () => {
      if (A.parando) return;
      if (!A.on) {
        A.iniciar(); bt.textContent = '■ Parar'; bt.style.background = '#D93025'; dot.style.background = '#D93025';
        rel = setInterval(() => { const s = Math.floor(t()); tempo.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
      } else {
        A.parouManual = naChamada();   // parou ainda na chamada: o "gravar ao entrar" não religa
        A.parar(); clearInterval(rel); bt.textContent = '● Gravar ATA'; bt.style.background = '#1FA971';
        dot.style.background = '#1FA971';
      }
    };
    box.append(dot, nome, tempo, bt);
    document.body.appendChild(box);
  }
  setInterval(() => { painel(); vigiar(); }, 1000);
})();
