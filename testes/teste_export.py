"""
teste_export.py — Confere a exportação do editor contra a prévia, quadro a quadro, e reprova se divergir.

Uso:
    python testes/teste_export.py                      # abre o app sozinho em modo agente (porta 9333) e fecha no fim
    python testes/teste_export.py --casos grade,sobreposicao
    python testes/teste_export.py --4k                 # inclui o caso 4K (lento)
    python testes/teste_export.py --porta 9333 --sem-abrir   # usa um app já aberto (python main.py --agente=9333)

Cada caso monta uma timeline nova com material gerado na hora (cache em %TEMP%/canivete_teste_export), exporta e
compara com o monitor nos quadros perto de cada corte/transição (e um a cada meio segundo):
  - quantidade de quadros = duração × fps (±1)
  - quadro preto na exportação onde a prévia não é preta (o bug dos cortes fora da grade)
  - diferença de imagem (média absoluta, 0..255, em 270×480): RUIM acima de LIMITE_RUIM, aviso acima de LIMITE_AVISO
  - som com a mesma duração do vídeo (quando o caso tem som)
Sai com código 1 se algum caso reprovar. Os pares de quadros com problema ficam em %TEMP%/canivete_teste_export/saida
(prévia à esquerda, exportação à direita). Rodar antes de release quando mexer em exportação, camadas, efeitos,
transições ou AutoFrame. A prévia renderizada e o cache RAM ficam desligados durante o teste (senão o monitor
mostraria o próprio arquivo renderizado e a comparação não valeria nada).
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

import cv2
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

LIMITE_RUIM = 10.0
LIMITE_AVISO = 6.0
CMP_W, CMP_H = 270, 480      # tamanho da comparação (os dois lados reduzidos com INTER_AREA)
VERSAO_MATERIAL = 1


def _ff():
    from Functions.convertermp3 import ffmpeg_path
    return ffmpeg_path()


def _roda(cmd):
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "replace")[-500:])
    return r


def gerar_material(pasta, com_4k):
    """Vídeos, fotos, logo com transparência e uma música com batida (120 BPM)."""
    os.makedirs(pasta, exist_ok=True)
    ff = _ff()
    vid = lambda nome: os.path.join(pasta, nome)
    if not os.path.isfile(vid("a.mp4")):
        _roda([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=5", "-f", "lavfi",
               "-i", "sine=f=440:d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "15", "-c:a", "aac", "-shortest", vid("a.mp4")])
    if not os.path.isfile(vid("b.mp4")):
        _roda([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "mandelbrot=s=1080x1920:r=30,trim=duration=5", "-f", "lavfi",
               "-i", "sine=f=660:d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "15", "-c:a", "aac", "-shortest", vid("b.mp4")])
    if not os.path.isfile(vid("c.mp4")):   # horizontal, para o PiP
        _roda([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=1920x1080:r=30:d=5", "-c:v", "libx264",
               "-pix_fmt", "yuv420p", "-g", "15", vid("c.mp4")])
    if com_4k and not os.path.isfile(vid("k.mp4")):
        _roda([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=2160x3840:r=30:d=4", "-c:v", "libx264",
               "-pix_fmt", "yuv420p", "-preset", "veryfast", "-g", "15", vid("k.mp4")])
    rng = np.random.default_rng(7)
    for i in range(8):
        p = vid(f"foto{i + 1}.jpg")
        if os.path.isfile(p):
            continue
        h, w = (1600, 1200) if i % 2 else (1200, 1600)
        img = np.zeros((h, w, 3), np.uint8)
        img[:] = [int(x) for x in rng.integers(40, 220, 3)]
        for _ in range(10):
            cv2.circle(img, (int(rng.integers(w)), int(rng.integers(h))), int(rng.integers(40, 260)),
                       [int(x) for x in rng.integers(0, 255, 3)], -1)
        cv2.putText(img, f"FOTO {i + 1}", (w // 6, h // 2), cv2.FONT_HERSHEY_DUPLEX, 5, (255, 255, 255), 10)
        cv2.imwrite(p, img)
    if not os.path.isfile(vid("logo.png")):
        logo = np.zeros((300, 500, 4), np.uint8)
        cv2.rectangle(logo, (20, 20), (480, 280), (40, 120, 230, 255), -1)
        cv2.putText(logo, "LOGO", (90, 190), cv2.FONT_HERSHEY_DUPLEX, 4, (255, 255, 255, 255), 8)
        cv2.imwrite(vid("logo.png"), logo)
    if not os.path.isfile(vid("musica.wav")):
        _roda([ff, "-v", "error", "-y", "-f", "lavfi", "-i",
               "aevalsrc='0.8*sin(2*PI*60*t)*exp(-12*mod(t,0.5))+0.25*sin(2*PI*440*t)*exp(-30*mod(t+0.25,0.5))"
               "+0.1*sin(2*PI*220*t)':s=44100:d=20", "-ac", "2", vid("musica.wav")])


# Ajudantes na página: timeline nova com clipes, captura do monitor estável, exportação com o fim avisado
JS_AJUDA = r"""
() => {
  if (window.__te) return;
  const M = nome => { const m = VE.media.find(x => x && (x.path || '').replace(/\\/g, '/').endsWith('/' + nome)); if (!m) throw new Error('mídia ' + nome); return m.id; };
  const clip = (tr, st, s, e, nome, extra) => { const c = { tr, st, s, e, m: nome === 'principal' ? 0 : M(nome), ...(extra || {}) }; c.p = Object.assign(veDefProps(c), (extra && extra.p) || {}); return c; };
  window.__te = {
    M, clip,
    timeline(nome, W, H, clips) {
      veStop();
      const seq = veCreateTimeline({ name: nome });
      veSeqQuadro(W, H); seq.w = W; seq.h = H;
      VE.clips = clips;
      veEnsureTracks(Math.max(4, ...clips.map(c => c.tr + 1)));
      VE_TRK = veSeqTracks(null, VE.clips);
      veBuildHeads(); veRelayout(); veAfterEdit(0); veSeqSalvarAtiva();
    },
    // onde olhar: bordas dos clipes de imagem, janelas de transição e camadas de sobreposição
    bordas() {
      const b = [];
      VE.clips.forEach(c => { if (!veIsAudio(c)) b.push(c.st, veEnd(c)); });
      if (typeof veTransLista === 'function') veTransLista().forEach(j => b.push(j.ws, j.we, (j.ws + j.we) / 2));
      return { bordas: b, dur: VE.dur, fps: VE.fps || 30, temSom: VE.clips.some(c => typeof veTemSom === 'function' && veTemSom(c) && !veMudo(c)) };
    },
    async quadro(t) {
      veSeek(t);
      const cv = $ve('ve-canvas'), mini = document.createElement('canvas');
      mini.width = 36; mini.height = 64;
      const mx = mini.getContext('2d', { willReadFrequently: true });
      let ant = null;
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 110));
        veDrawMonitor();
        await new Promise(r => requestAnimationFrame(() => r()));
        const busy = [veVideo(), ...(typeof VEX !== 'undefined' ? VEX : [])].some(x => x && x.seeking);
        mx.drawImage(cv, 0, 0, 36, 64);
        const d = mx.getImageData(0, 0, 36, 64).data.join(',');
        if (!busy && ant === d && i >= 2) break;
        ant = d;
      }
      return cv.toDataURL('image/jpeg', 0.95);
    },
    // quadros do arquivo exportado decodificados pelo navegador (o mesmo decodificador da prévia: a cor compara igual)
    async abrirArquivo(url) {
      const blob = await (await fetch(url)).blob();
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(blob);
      await new Promise((ok, erro) => { v.onloadeddata = ok; v.onerror = () => erro(new Error('vídeo exportado não abriu')); });
      window.__teVid = v;
      return [v.videoWidth, v.videoHeight, v.duration];
    },
    async quadroArquivo(t) {
      const v = window.__teVid;
      await new Promise(ok => { v.onseeked = ok; v.currentTime = t; });
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return c.toDataURL('image/jpeg', 0.95);
    },
    async exportar(dest, nome) {
      window.__teFim = null;
      if (!window.__teHook) {
        const orig = window.veOnExport;
        window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} } if (e && e.done) window.__teFim = e; try { orig(ev); } catch (x) {} };
        window.__teHook = true;
      }
      if (typeof veCompProntas === 'function') await veCompProntas(() => {});
      if (typeof veOvtProntas === 'function') await veOvtProntas(null);
      if (typeof ve3dProntas === 'function') await ve3dProntas(() => {});
      VE._txPng = null;
      if (VE.clips.some(c => veIsTexto(c) || veEhGrafico(c))) await veTxPngs();
      const plano = veExportPlan(true), lim = veMasterLim();
      await window.pywebview.api.video_cutter_export(VE.path, plano.base, 'mp4', 'medium', 'original', false, dest, false,
        plano.camadas, plano.audio, plano.dur, lim ? [...plano.mix, { master: lim }] : plano.mix, veTxExport(plano.faixa),
        [VE.seqW, VE.seqH], { nome });
      return plano.dur;
    },
  };
  // a prévia renderizada e o cache RAM mostrariam o próprio arquivo renderizado: o monitor tem de compor ao vivo
  window.vePrSegEm = () => null;
  window.vePrAutoTick = () => {};
  window.veCacheGet = () => null;
}
"""

# Casos: (nome, W, H, JS que devolve a lista de clipes usando __te.clip / __te.M; JS extra depois de montar)
CASOS = {
    # cena 3D (editor-3d.js): esfera de cerâmica quicando, cubo girando, câmera orbitando, sombra no chão, sobre o vídeo —
    # a prévia (three.js ao vivo) tem que bater com o arquivo (o mesmo three.js quadro a quadro → ProRes 4444)
    "3d": (1080, 1920, """
        const { clip } = __te;
        const r = VE3DAPI.nova({ dur: 3, st: 0.5 }), m = VE.media[r.midia];
        m.c3d.modelos.push({ id: 'esf', nome: 'esfera', fonte: { tipo: 'primitiva', forma: 'esfera', cor: '#ec6e48', material: 'ceramica' },
            p: { x: -0.55, y: 0, z: 0, rx: 0, ry: 0, rz: 0, esc: 0.8 }, kf: { y: [[0, 0], [1.5, 0.6], [3, 0]] } });
        m.c3d.modelos.push({ id: 'cubo', nome: 'cubo', fonte: { tipo: 'primitiva', forma: 'cubo', cor: '#0e3b4a', material: 'fosco' },
            p: { x: 0.6, y: 0, z: 0, rx: 0, ry: 20, rz: 0, esc: 0.7 }, kf: { ry: [[0, 0], [3, 180, 'linear']] } });
        m.c3d.camera.kf = { azimute: [[0, -20], [3, 40]] };
        const c3 = { tr: 1, st: 0.5, s: 0, e: 3, m: m.id }; c3.p = veDefProps(c3);
        return [clip(0, 0, 0, 4, 'principal'), c3];
    """, ""),
    # cena 3D com estúdio infinito, neblina e foco animado (passa de uma esfera para a outra): desfoque por profundidade
    "3dfoco": (1920, 1080, """
        const W = 1920, H = 1080, r = VE3DAPI.nova({ dur: 2, st: 0 }), m = VE.media[r.midia];
        m.c3d.modelos.push({ id: 'a', nome: 'a', fonte: { tipo: 'primitiva', forma: 'esfera', cor: '#ec6e48', material: 'ceramica' },
            p: { x: -0.8, y: 0, z: 1.2, rx: 0, ry: 0, rz: 0, esc: 0.8 }, kf: {} });
        m.c3d.modelos.push({ id: 'b', nome: 'b', fonte: { tipo: 'primitiva', forma: 'toro', cor: '#0e3b4a', material: 'metal' },
            p: { x: 0.9, y: 0.1, z: -1.5, rx: 0, ry: 0, rz: 0, esc: 0.9 }, kf: { ry: [[0, 0], [2, 120, 'linear']] } });
        Object.assign(m.c3d.camera.p, { abertura: 0.8 }); m.c3d.camera.kf = { foco: [[0, 3.6], [2, 7]] };
        m.c3d.cenario = { p: { estudio: 1, estudioCor: '#e9e4dc', neblina: 0.15, neblinaCor: '#dfe3e8' }, kf: {} };
        Object.assign(m.info, { width: W, height: H });   // a cena nasce no tamanho da timeline anterior
        const c3 = { tr: 0, st: 0, s: 0, e: 2, m: m.id }; c3.p = Object.assign(veDefProps(c3), { sc: 100, x: W / 2, y: H / 2 });
        return [c3];
    """, ""),
    # cortes na batida exata (fora da grade de quadros): o quadro do corte não pode sair preto
    "grade": (1080, 1920, """
        const { clip } = __te;
        return [clip(0, 0, 0, 1.013, 'principal'), clip(0, 1.013, 0, 0.984, 'foto1.jpg'),
                clip(0, 1.997, 0.5, 1.513, 'b.mp4'), clip(0, 3.01, 0, 0.99, 'foto2.jpg')];
    """, ""),
    # camadas: PiP com escala/posição animadas e giro, logo com transparência e opacidade animada, texto
    "camadas": (1080, 1920, """
        const { clip } = __te, W = 1080, H = 1920;
        const pip = clip(1, 0.4, 0.4, 3.6, 'c.mp4', { x: 'v', p: { sc: 35, x: 300, y: 500, rot: 8 } });
        pip.k = { sc: [{ t: 0.4, v: 35, i: 'lin' }, { t: 3.6, v: 50, i: 'lin' }], x: [{ t: 0.4, v: 300, i: 'lin' }, { t: 3.6, v: 760, i: 'lin' }] };
        const logo = clip(2, 0.5, 0, 3, 'logo.png', { p: { sc: 80, x: W / 2, y: 1500, rot: 0, op: 100 } });
        logo.k = { op: [{ t: 0, v: 0, i: 'lin' }, { t: 1, v: 100, i: 'lin' }] };
        const tm = veTxMidia();
        const tx = { tr: 3, st: 1.2, s: 0, e: 2.3, m: tm.id, tx: { ...VE_TX_PADRAO, t: 'TESTE 123', tam: 120, alin: 'center' } };
        tx.p = Object.assign(veDefProps(tx), { sc: 100, x: W / 2, y: H * 0.3 });
        return [clip(0, 0, 0, 4, 'principal'), pip, logo, tx];
    """, ""),
    # efeitos: cor no clipe, desfoque/cantos/corte numa imagem e camada de ajuste com opacidade
    "efeitos": (1080, 1920, """
        const { clip } = __te, id = () => veFxNewId();
        const base = clip(0, 0, 0, 4, 'b.mp4', { fx: [{ id: id(), t: 'bc', on: true, v: { br: 15, ct: 25 } }] });
        const img = clip(1, 0.3, 0, 3.2, 'foto3.jpg', { p: { sc: 45, x: 540, y: 900, rot: 0, op: 100 },
            fx: [{ id: id(), t: 'blur', on: true, v: { amt: 25 } }, { id: id(), t: 'rounded', on: true, v: { raio: 20 } }, { id: id(), t: 'crop', on: true, v: { l: 10, t: 0, r: 0, b: 15 } }] });
        let aj = VE.media.find(x => x.kind === 'ajuste');
        if (!aj) { aj = { id: VE.media.length, kind: 'ajuste', name: 'Camada de ajuste' }; VE.media.push(aj); }
        const adj = { tr: 2, st: 1, s: 0, e: 2, m: aj.id, fx: [{ id: id(), t: 'bc', on: true, v: { br: -30, ct: 40 } }] };
        adj.p = Object.assign(veDefProps(adj), { op: 60 });
        return [base, img, adj];
    """, ""),
    # Luz e Cor completo: Clareza (+ e −, também numa camada de ajuste), curvas de Matiz/Saturação (LUT 65³),
    # as 4 rodas (Lift/Gamma/Gain/Offset), pivô do contraste e rotação de matiz
    "cor": (1080, 1920, """
        const { clip } = __te, id = () => veFxNewId();
        const lc = v => ({ id: id(), t: 'lc', on: true, v: Object.assign(veLcDefaults(), v) });
        const base = clip(0, 0, 0, 4, 'b.mp4', { fx: [lc({ clar: 60, ct: 30, piv: 35, hue: 20,
            hc: { hs: [[0.0, 0.5], [0.12, 0.95], [0.25, 0.5]], hh: [[0.45, 0.5], [0.55, 0.7], [0.65, 0.5]], hl: [[0.55, 0.5], [0.66, 0.2], [0.78, 0.5]],
                  ls: [[0.1, 0.2], [0.9, 0.7]], ss: [[0.2, 0.5], [0.8, 0.35]] },
            cw: { s: [0.3, -0.2], m: [-0.2, 0.25], h: [0.1, 0.3], o: [-0.15, 0.1] }, ls: 10, lm: -15, lh: 12, lo: -8 })] });
        const img = clip(1, 0.3, 0, 3.2, 'foto3.jpg', { p: { sc: 45, x: 540, y: 900, rot: 0, op: 100 },
            fx: [lc({ clar: -70, sat: 130 })] });
        let aj = VE.media.find(x => x.kind === 'ajuste');
        if (!aj) { aj = { id: VE.media.length, kind: 'ajuste', name: 'Camada de ajuste' }; VE.media.push(aj); }
        const adj = { tr: 2, st: 2, s: 0, e: 2, m: aj.id, fx: [lc({ clar: 40, hc: { hs: [[0.6, 0.5], [0.7, 0.1], [0.8, 0.5]] } })] };
        adj.p = Object.assign(veDefProps(adj), { op: 80 });
        return [base, img, adj];
    """, ""),
    # transições de camada: dissolução, empurrar, chicote e dividir em 4
    "transicoes": (1080, 1920, """
        const { clip } = __te;
        const a = clip(0, 0, 0, 1.5, 'principal'), b = clip(0, 1.5, 1, 2.5, 'b.mp4'), a2 = clip(0, 3, 2.5, 4, 'principal'), f = clip(0, 4.5, 0, 1.5, 'foto4.jpg');
        b.tin = { t: 'push', d: 0.45, speed: 'fast', dir: 'r' };
        a2.tin = { t: 'chicote', d: 0.32, speed: 'fast', dir: 'l' };
        f.tin = { t: 'split4', d: 0.45, speed: 'fast' };
        return [a, b, a2, f];
    """, ""),
    # quadro-chave curvo num clipe que também tem transição (a curva fora da transição não pode virar reta)
    "curva": (1080, 1920, """
        const { clip } = __te;
        const f = clip(0, 0, 0, 2, 'foto6.jpg'), g = clip(0, 2, 0, 2, 'foto7.jpg');
        f.k = { sc: [{ t: 0, v: 160, i: 'bez', b: [0.16, 1, 0.3, 1] }, { t: 0.6, v: 110, i: 'lin' }], op: [{ t: 0, v: 0, i: 'ease' }, { t: 0.5, v: 100, i: 'lin' }] };
        g.tin = { t: 'push', d: 0.45, speed: 'fast', dir: 'u' };
        return [f, g];
    """, ""),
    # muitos quadros-chave curvos (como vêm do Premiere): a expressão do ffmpeg passava do limite de aninhamento
    # ("Missing ')' or too many args") — agora é uma árvore balanceada de if (_expr_kf)
    "kfmuitos": (1080, 1920, """
        const { clip } = __te, f = clip(1, 0, 0, 3, 'foto4.jpg', { p: { sc: 50, x: 540, y: 960, rot: 0, op: 100 } });
        const sc = [], x = [];
        for (let i = 0; i <= 150; i++) {
            const t = i * 0.02;
            sc.push({ t, v: 45 + 15 * Math.sin(i / 7), i: 'bez', b: [0.2, 0.9, 0.3, 1] });
            x.push({ t, v: i < 60 || i > 110 ? 540 + 200 * Math.sin(i / 11) : 540, i: 'bez', b: [0.3, 0, 0.7, 1] });
        }
        f.k = { sc, x };
        return [clip(0, 0, 0, 3, 'b.mp4'), f];
    """, ""),
    # modos de mesclagem: uma faixa de foto por modo sobre o vídeo (a fórmula do ffmpeg tem de ser a do navegador)
    "mesclagem": (1080, 1920, """
        const { clip } = __te, modos = ['multiply', 'screen', 'overlay', 'softlight', 'hardlight', 'darken', 'lighten', 'colorburn', 'colordodge', 'add', 'difference', 'exclusion'];
        const out = [clip(0, 0, 0, 2, 'b.mp4')];
        modos.forEach((bm, i) => {
            const c = clip(1 + i, 0, 0, 2, i % 2 ? 'foto3.jpg' : 'foto8.jpg', { bm, p: { sc: 20, x: 270 + (i % 2) * 540, y: 160 * Math.floor(i / 2) + 160, rot: 0, op: i % 3 ? 100 : 70 } });
            c.fx = [{ id: veFxNewId(), t: 'crop', on: true, v: { l: 0, t: 0, r: 0, b: 40 } }];
            out.push(c);
        });
        return out;
    """, ""),
    # sombra projetada: efeito numa imagem girada e com escala, logo com transparência e sombra do texto em ângulo
    "sombra": (1080, 1920, """
        const { clip } = __te, W = 1080, H = 1920, id = () => veFxNewId();
        const f = clip(1, 0, 0, 2, 'foto4.jpg', { p: { sc: 40, x: 520, y: 700, rot: 12, op: 100 },
            fx: [{ id: id(), t: 'sombra', on: true, v: { cor: '#000000', op: 75, ang: 120, dist: 30, tam: 40 } }] });
        const logo = clip(2, 0, 0, 2, 'logo.png', { p: { sc: 90, x: 560, y: 1350, rot: 0, op: 100 },
            fx: [{ id: id(), t: 'sombra', on: true, v: { cor: '#ff2a00', op: 90, ang: 45, dist: 18, tam: 10 } }] });
        const tm = veTxMidia();
        const tx = { tr: 3, st: 0, s: 0, e: 2, m: tm.id, tx: { ...VE_TX_PADRAO, t: 'SOMBRA', tam: 140, sOn: true, sCor: '#102030', sOp: 80, sDist: 14, sBlur: 12, sAng: 60 } };
        tx.p = Object.assign(veDefProps(tx), { sc: 100, x: W / 2, y: 300 });
        return [clip(0, 0, 0, 2, 'b.mp4'), f, logo, tx];
    """, ""),
    # sobreposições: zoom para dentro, giro, lente e flare
    "sobreposicao": (1080, 1920, """
        const { clip } = __te;
        return [clip(0, 0, 0, 1.5, 'principal'), clip(0, 1.5, 0.5, 2, 'b.mp4'), clip(0, 3, 0, 1.5, 'foto5.jpg'), clip(0, 4.5, 1, 2.5, 'principal')];
    """, """
        veOvtAdd('zoomin', 1.5, { d: 0.5, quieto: true });
        veOvtAdd('spin', 3, { d: 0.6, quieto: true });
        veOvtAdd('lens', 4.5, { d: 0.5, quieto: true });
        veOvtAdd('flare', 2.25, { d: 0.6, quieto: true });
    """),
    # velocidade: 2x e 0,5x
    "velocidade": (1080, 1920, """
        const { clip } = __te;
        return [clip(0, 0, 0, 3, 'principal', { v: 2 }), clip(0, 1.5, 0, 1, 'b.mp4', { v: 0.5 })];
    """, ""),
    # 4K: base 4K + PiP (só com --4k)
    "4k": (2160, 3840, """
        const { clip } = __te;
        return [clip(0, 0, 0, 3.5, 'k.mp4'), clip(1, 0.5, 0, 2.5, 'c.mp4', { x: 'v', p: { sc: 70, x: 1080, y: 1200, rot: 0 } })];
    """, ""),
}


class _Servidor:
    """Serve a pasta de saída em 127.0.0.1 com CORS (a página baixa o vídeo exportado e decodifica no navegador)."""
    def __init__(self, pasta):
        import functools
        import http.server
        import threading

        class H(http.server.SimpleHTTPRequestHandler):
            def end_headers(self):
                self.send_header("Access-Control-Allow-Origin", "*")
                super().end_headers()

            def log_message(self, *a):
                pass
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=pasta))
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}/"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()


def _decodificar(arq, w, h):
    raw = subprocess.run([_ff(), "-v", "error", "-i", arq, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
                         capture_output=True).stdout
    n = len(raw) // (w * h * 3)
    fr = np.frombuffer(raw[:n * w * h * 3], np.uint8).reshape(n, h, w, 3)
    return [cv2.resize(f, (CMP_W, CMP_H), interpolation=cv2.INTER_AREA) for f in fr]


def _info(arq):
    from Functions.video_cutter import probe
    return probe(arq)


def _dur_audio(arq):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration",
                            "-of", "csv=p=0", arq], capture_output=True, text=True)
        return float(r.stdout.strip())
    except Exception:
        try:
            from Functions.video_cutter import probe
            i = probe(arq)
            return float(i.get("audio_duration") or i.get("duration") or 0) if i.get("has_audio") else None
        except Exception:
            return None


def _img(data_url):
    b = base64.b64decode(data_url.split(",", 1)[1])
    img = cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR)
    return cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (CMP_W, CMP_H), interpolation=cv2.INTER_AREA)


def rodar_caso(pg, nome, W, H, js_clips, js_depois, saida, srv):
    """js_clips = None: confere a timeline aberta (o AutoFrame cria a dele)."""
    t0 = time.time()
    if js_clips is not None:
        pg.evaluate(f"() => {{ const clips = (() => {{ {js_clips} }})(); __te.timeline('Teste · {nome}', {W}, {H}, clips); }}")
    if js_depois.strip():
        pg.evaluate(f"() => {{ {js_depois} }}")
    pg.wait_for_function("VE.clips.every(c => { const m = VE.media[c.m || 0]; return !m || m.kind !== 'video' || m.url || m.offline || m.erro; })",
                         timeout=600000)
    info = pg.evaluate("__te.bordas()")
    fps, dur = float(info["fps"]), float(info["dur"])
    nq = int(round(dur * fps))
    # quadros a olhar: ±2 em volta de cada borda e um a cada meio segundo
    amostra = set(range(0, nq, max(1, int(fps / 2))))
    for b in info["bordas"]:
        k = int(round(b * fps))
        amostra.update(range(k - 2, k + 3))
    amostra = sorted(k for k in amostra if 0 <= k < nq)
    previa = {k: _img(pg.evaluate("t => __te.quadro(t)", k / fps)) for k in amostra}
    t_prev = time.time() - t0
    arq_nome = f"teste_{nome}_{int(time.time())}"
    pg.evaluate("([d, n]) => __te.exportar(d, n)", [saida, arq_nome])
    pg.wait_for_function("window.__teFim", timeout=900000)
    fim = pg.evaluate("window.__teFim")
    t_exp = time.time() - t0 - t_prev
    res = {"caso": nome, "ok": True, "msgs": [], "t_prev": t_prev, "t_exp": t_exp}
    if not fim.get("success"):
        res["ok"] = False
        res["msgs"].append("exportação falhou: " + str(fim.get("error")))
        return res
    arq = fim["output_path"]
    inf = _info(arq)
    # contagem e quadros pretos: todos os quadros pelo ffmpeg; comparação de imagem: pelo navegador
    todos = _decodificar(arq, int(inf["width"]), int(inf["height"]))
    pg.evaluate("u => __te.abrirArquivo(u)", srv.url + os.path.basename(arq))
    ex = {}
    pega = lambda k: ex.setdefault(k, _img(pg.evaluate("t => __te.quadroArquivo(t)", (k + 0.5) / fps)))
    # 1. quantidade de quadros
    if abs(len(todos) - nq) > 1:
        res["ok"] = False
        res["msgs"].append(f"{len(todos)} quadros exportados, esperado {nq} ({dur:.3f} s × {fps:g})")
    # 2. quadro preto na exportação onde a prévia não é preta
    pretos = [k for k, f in enumerate(todos) if f.mean() < 10]
    ruins_pretos = []
    for k in pretos:
        if k >= nq:
            continue
        if k not in previa:
            previa[k] = _img(pg.evaluate("t => __te.quadro(t)", k / fps))
        if previa[k].mean() >= 10:
            ruins_pretos.append(k)
            cv2.imwrite(os.path.join(saida, f"{nome}_preto_q{k}.png"), cv2.cvtColor(np.hstack([previa[k], todos[k]]), cv2.COLOR_RGB2BGR))
    if ruins_pretos:
        res["ok"] = False
        res["msgs"].append(f"quadros pretos só na exportação: {ruins_pretos[:12]}")
    # 3. diferença de imagem nos quadros da amostra
    difs = []
    for k in amostra:
        if k < len(todos):
            pega(k)
            difs.append((float(np.abs(previa[k].astype(np.int16) - ex[k].astype(np.int16)).mean()), k))
    difs.sort(reverse=True)
    pior = difs[0] if difs else (0.0, -1)
    res["pior"] = pior
    ruins = [(d, k) for d, k in difs if d > LIMITE_RUIM]
    avisos = [(d, k) for d, k in difs if LIMITE_AVISO < d <= LIMITE_RUIM]
    for d, k in (ruins + avisos)[:6]:
        cv2.imwrite(os.path.join(saida, f"{nome}_dif{d:.0f}_q{k}.png"), cv2.cvtColor(np.hstack([previa[k], ex[k]]), cv2.COLOR_RGB2BGR))
    if ruins:
        res["ok"] = False
        res["msgs"].append(f"{len(ruins)} quadro(s) diferentes da prévia (pior {ruins[0][0]:.1f} no quadro {ruins[0][1]}): "
                           + ", ".join(f"q{k}={d:.0f}" for d, k in ruins[:8]))
    elif avisos:
        res["msgs"].append(f"aviso: {len(avisos)} quadro(s) entre {LIMITE_AVISO:g} e {LIMITE_RUIM:g} (pior q{avisos[0][1]}={avisos[0][0]:.1f})")
    # 4. som
    if info.get("temSom"):
        da = _dur_audio(arq)
        if da is not None and abs(da - dur) > 0.15:
            res["ok"] = False
            res["msgs"].append(f"som com {da:.2f} s, vídeo com {dur:.2f} s")
    res["n"] = len(amostra)
    return res


def caso_autoframe(pg, mat, saida, srv):
    """AutoFrame rápido, estilo Dinâmico, com as fotos e a música do material: gera e confere como os outros."""
    fotos = [os.path.join(mat, f"foto{i + 1}.jpg") for i in range(8)]
    pg.evaluate("([f, m]) => { veAfAbrir(); VEAF.musicaPath = m; VEAF.itens = f.map(p => ({path: p, pasta: false})); VEAF.midias = []; veAfAnalisar(); }",
                [fotos, os.path.join(mat, "musica.wav")])
    pg.wait_for_function("VEAF.musica && !VEAF.analisando && VEAF.modelo", timeout=300000)
    pg.evaluate("() => { VEAF.modelo = 'dinamico'; VEAF.dur = 15; }")
    pg.evaluate("veAfGerar()")
    time.sleep(1.5)
    pg.wait_for_function("!VEAF.gerando", timeout=300000)
    return rodar_caso(pg, "autoframe", 0, 0, None, "", saida, srv)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--casos", default="")
    ap.add_argument("--4k", dest="k4", action="store_true")
    ap.add_argument("--sem-abrir", action="store_true", help="usa o app já aberto em modo agente na porta")
    ap.add_argument("--exe", default="", help="testar o exe gerado (ex.: dist/CaniveteDoPailer/CaniveteDoPailer.exe)")
    a = ap.parse_args()
    base = os.path.join(os.environ.get("TEMP") or os.path.expanduser("~"), "canivete_teste_export")
    mat, saida = os.path.join(base, f"material{VERSAO_MATERIAL}"), os.path.join(base, "saida")
    os.makedirs(saida, exist_ok=True)
    for f in os.listdir(saida):
        if f.endswith((".png", ".mp4")):
            try:
                os.remove(os.path.join(saida, f))
            except OSError:
                pass
    print("material...", flush=True)
    gerar_material(mat, a.k4)
    nomes = [n for n in (a.casos.split(",") if a.casos else list(CASOS) + ["autoframe"]) if n]
    if not a.k4 and not a.casos:
        nomes = [n for n in nomes if n != "4k"]
    url = f"http://127.0.0.1:{a.porta}"
    app = None
    if not a.sem_abrir:
        cmd = [a.exe, f"--agente={a.porta}"] if a.exe else [sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={a.porta}"]
        app = subprocess.Popen(cmd, cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    srv = _Servidor(saida)
    resultados = []
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(url + "/json", timeout=1)
                break
            except Exception:
                time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(url)
            pg = None
            for _ in range(60):
                for c in b.contexts:
                    for x in c.pages:
                        try:
                            if "index.html" in x.url and x.evaluate("typeof VE") == "object":
                                pg = x
                        except Exception:
                            pass
                if pg:
                    break
                time.sleep(1)
            if not pg:
                raise SystemExit("não achei a janela do editor")
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.video_cutter_prepare)", timeout=90000)
            principal = os.path.join(mat, "a.mp4")
            aberto = pg.evaluate("VE.ready ? (VE.path || '') : ''")
            if not aberto or os.path.normcase(os.path.abspath(aberto)) != os.path.normcase(principal):
                if aberto and a.sem_abrir:
                    raise SystemExit("o editor aberto tem outro projeto: use uma cópia só para o teste (sem --sem-abrir)")
                pg.evaluate("document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
                time.sleep(1)
                pg.evaluate("p => veOpenPath(p)", principal)
                pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            faltam = [f for f in ["b.mp4", "c.mp4", "logo.png"] + [f"foto{i + 1}.jpg" for i in range(8)] + (["k.mp4"] if "4k" in nomes else [])
                      if not pg.evaluate("n => VE.media.some(m => m && (m.path || '').replace(/\\\\/g, '/').endsWith('/' + n))", f)]
            if faltam:
                pg.evaluate("async (l) => { await vePjImportar(l.map(p => ({path: p}))); }", [os.path.join(mat, f) for f in faltam])
            # (vídeo grande fora da timeline só ganha a prévia leve quando entra nela: cada caso espera os seus)
            pg.evaluate(JS_AJUDA)
            for nome in nomes:
                print(f"· {nome}...", flush=True)
                try:
                    if nome == "autoframe":
                        r = caso_autoframe(pg, mat, saida, srv)
                    else:
                        W, H, js, depois = CASOS[nome]
                        r = rodar_caso(pg, nome, W, H, js, depois, saida, srv)
                except Exception as e:
                    r = {"caso": nome, "ok": False, "msgs": [f"erro no teste: {e}"]}
                resultados.append(r)
                pior = r.get("pior")
                extra = f" · {r.get('n', 0)} quadros comparados · pior {pior[0]:.1f} (q{pior[1]})" if pior else ""
                tempo = f" · prévia {r['t_prev']:.0f} s, exportação {r['t_exp']:.0f} s" if "t_exp" in r else ""
                print(f"  {'OK  ' if r['ok'] else 'RUIM'} {nome}{extra}{tempo}")
                for m in r["msgs"]:
                    print(f"       {m}")
    finally:
        if app:
            subprocess.run(["taskkill", "/PID", str(app.pid), "/T", "/F"], capture_output=True)
    falhou = [r["caso"] for r in resultados if not r["ok"]]
    print(f"\n{len(resultados) - len(falhou)}/{len(resultados)} casos OK" + (f" · reprovados: {', '.join(falhou)}" if falhou else ""))
    if falhou:
        print(f"quadros com problema (prévia | exportação) em {saida}")
    sys.exit(1 if falhou else 0)


if __name__ == "__main__":
    main()
