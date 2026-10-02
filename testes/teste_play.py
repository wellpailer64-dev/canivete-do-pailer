"""
teste_play.py — Mede o play do Pocket Editor no app de verdade (modo agente) e reprova se engasgar.

Uso (com o app aberto em modo agente: python main.py --agente=9333):
    python testes/teste_play.py "C:/caminho/projeto.vcnvt" [--porta 9333] [--segundos 20] [--inicio 0]

Abre o projeto (se ainda não estiver aberto), espera os vídeos da timeline ficarem prontos, toca e conta:
  - agulha voltando para trás (relógio quebrado: foi o bug dos vários mixers de áudio)
  - buscas e esperas por dados nos dois players (deck A/B)
  - quadros perdidos pelo decodificador e travadas da página (quadro > 100 ms)
Sai com código 1 se passar dos limites (bom para rodar antes de cada release).
"""
import argparse
import os
import sys
import time
import urllib.request

LIMITES = {
    "voltas": 0,              # a agulha nunca anda para trás tocando
    "buscas_por_10s": 15,     # cortes + ajustes finos; centenas = relógio brigando com o vídeo
    "esperas_por_10s": 10,    # player parado esperando dados
    "perdidos_pct": 2.0,      # quadros descartados pelo decodificador
    "travadas": 3,            # quadros da página acima de 100 ms
}

MEDIR = """async ([seg, ini]) => {
  const log = {buscas: 0, esperas: 0, voltas: [], travadas: [], trocas: 0};
  const A = veDeckA(), B = veDeckB();
  const ouvir = (x, ev, k) => { const f = () => log[k]++; x.addEventListener(ev, f); return () => x.removeEventListener(ev, f); };
  const soltar = [ouvir(A, 'seeking', 'buscas'), ouvir(B, 'seeking', 'buscas'), ouvir(A, 'waiting', 'esperas'), ouvir(B, 'waiting', 'esperas')];
  const q0 = [A.getVideoPlaybackQuality(), B.getVideoPlaybackQuality()];
  veSeek(ini); vePlay();
  let ant = VE.playhead, antT = performance.now();
  const t0 = antT;
  await new Promise(fim => { (function f() {
    const agora = performance.now();
    if (agora - antT > 100) log.travadas.push([+VE.playhead.toFixed(2), Math.round(agora - antT)]);
    if (VE.playhead < ant - 0.01) log.voltas.push([+ant.toFixed(3), +VE.playhead.toFixed(3)]);
    ant = VE.playhead; antT = agora;
    if (agora - t0 < seg * 1000 && VE.playing) requestAnimationFrame(f); else fim();
  })(); });
  const tocou = VE.playhead - ini;
  veStop(); soltar.forEach(s => s());
  const q1 = [A.getVideoPlaybackQuality(), B.getVideoPlaybackQuality()];
  log.quadros = q1[0].totalVideoFrames + q1[1].totalVideoFrames - q0[0].totalVideoFrames - q0[1].totalVideoFrames;
  log.perdidos = q1[0].droppedVideoFrames + q1[1].droppedVideoFrames - q0[0].droppedVideoFrames - q0[1].droppedVideoFrames;
  log.tocou = +tocou.toFixed(2);
  return log;
}"""


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")   # acentos no console do Windows
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("projeto", nargs="?")
    ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--segundos", type=float, default=20)
    ap.add_argument("--inicio", type=float, default=0)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright

    url = f"http://127.0.0.1:{a.porta}"
    for _ in range(60):
        try:
            urllib.request.urlopen(url + "/json", timeout=1)
            break
        except Exception:
            time.sleep(1)
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(url)
        # a janela principal (as soltas do editor também são index.html, mas sem o editor)
        pg = next(pg for c in b.contexts for pg in c.pages if "index.html" in pg.url and pg.evaluate("typeof VE") == "object")
        pg.wait_for_function("!!(window.pywebview && window.pywebview.api && typeof window.pywebview.api.ve_project_open === 'function')",
                             timeout=30000)
        if a.projeto:
            alvo = os.path.normcase(os.path.abspath(a.projeto))
            aberto = pg.evaluate("VE.projectPath")
            if not aberto or os.path.normcase(os.path.abspath(aberto)) != alvo:
                pg.evaluate("p => veOpenProjectExternal(p)", a.projeto)
                pg.wait_for_function("VE.projectPath && VE.clips.length > 0 && !VE._pendingProject", timeout=60000)
        t0 = time.time()
        # o vídeo aberto (mídia 0) também: com prévia leve ele chega depois e a agulha volta ao início
        pg.wait_for_function("VE.ready && $ve('ve-loading').hidden && VE.clips.every(c => { const m = VE.media[veMid(c)]; return !m || !m.id || m.kind !== 'video' || m.url || m.offline || m.erro })",
                             timeout=600000)
        print(f"vídeos da timeline prontos em {time.time() - t0:.1f} s")
        time.sleep(2)
        r = pg.evaluate(MEDIR, [a.segundos, a.inicio])

    dur = max(1.0, r["tocou"])
    res = {
        "voltas": len(r["voltas"]),
        "buscas_por_10s": round(r["buscas"] / dur * 10, 1),
        "esperas_por_10s": round(r["esperas"] / dur * 10, 1),
        "perdidos_pct": round(100 * r["perdidos"] / max(1, r["quadros"]), 2),
        "travadas": len(r["travadas"]),
    }
    print(f"tocou {r['tocou']} s · {r['quadros']} quadros decodificados")
    falhou = False
    for k, v in res.items():
        ok = v <= LIMITES[k]
        falhou |= not ok
        print(f"  {'OK ' if ok else 'RUIM'} {k}: {v} (limite {LIMITES[k]})")
    if r["voltas"]:
        print("  voltas (de → para):", r["voltas"][:10])
    if r["travadas"]:
        print("  travadas (agulha, ms):", r["travadas"][:10])
    sys.exit(1 if falhou else 0)


if __name__ == "__main__":
    main()
