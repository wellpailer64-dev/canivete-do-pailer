"""Física da timeline (2026-10-22): centenas de edições aleatórias em várias trilhas (cortes, arrastes, aparos com o
par vinculado e em grupo, apagar, ripple Q/W, In→Out, fechar espaço, cadeado, trilha-alvo, desfazer/refazer) pelas
funções reais do editor, conferindo depois de cada uma: nenhuma sobreposição na trilha, nenhuma fresta de menos de
meio quadro, vídeo e áudio vinculados com as mesmas pontas e em sincronia, corte reto, ripple puxando todas as
trilhas a mesma medida, desfazer/refazer voltando ao estado idêntico. A lógica fica em teste_fisica_timeline.js.
    py -3.13 testes/teste_fisica_timeline.py [--porta 9341] [--sem-abrir] [--sementes 8] [--ops 400]
"""
import argparse
import collections
import os
import subprocess
import sys
import time
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from Functions.midia import ffmpeg  # noqa: E402

BASE = "D:/kanivete_testes/fisica/"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=9341)
    ap.add_argument("--sem-abrir", action="store_true")
    ap.add_argument("--sementes", type=int, default=8)
    ap.add_argument("--ops", type=int, default=400)
    ap.add_argument("--semente0", type=int, default=1000)
    ap.add_argument("--rastrear", type=int, default=None, help="trilha a mostrar nas últimas edições antes do 1º defeito")
    ap.add_argument("--fps", default="29.97,30,25,23.976")
    a = ap.parse_args()
    vid = BASE + "base.mp4"
    os.makedirs(BASE, exist_ok=True)
    if not os.path.isfile(vid):   # 20,02 s a 29,97 (duração fora da grade, como câmera real) com som
        subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30000/1001:d=20.02", "-f", "lavfi",
                        "-i", "sine=f=440:d=20.02:sample_rate=48000", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                        "-shortest", vid], check=True)
    app = None
    if not a.sem_abrir:
        env = dict(os.environ, APPDATA=BASE + "appdata", TEMP=BASE + "tmp", TMP=BASE + "tmp", LOCALAPPDATA=BASE + "localappdata",
                   CANIVETE_TESTE="1")
        for k in ("appdata", "tmp", "localappdata"):
            os.makedirs(BASE + k, exist_ok=True)
        app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={a.porta}"], cwd=RAIZ, env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    total = []
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{a.porta}/json", timeout=1)
                break
            except Exception:
                time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
            pg = None
            for _ in range(60):
                pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url and x.evaluate("typeof VE") == "object"), None)
                if pg:
                    break
                time.sleep(1)
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.video_cutter_prepare) && window.VECN_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            if pg.evaluate("VE.ready ? (VE.path || '').replace(/\\\\/g, '/') : ''") != vid:
                pg.evaluate("p => veOpenPath(p)", vid)
                pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            with open(os.path.join(RAIZ, "testes", "teste_fisica_timeline.js"), encoding="utf-8") as f:
                pg.evaluate(f.read())
            pg.evaluate("window.veToast = () => {}")
            c = pg.evaluate("FIS.cenarioPailer()")
            okc = c["gap"] and abs(c["v1a"]) < 1e-6 and all(abs(c[k] - 1) < 1e-6 for k in ("v1b", "v2", "v3", "mus")) and abs(c["v4"] - 1.4) < 1e-6
            print(("ok    " if okc else "FALHOU ") + "caso do print: espaço da trilha do C0712 fecha até onde todas estão vazias (" + str(c) + ")")
            if not okc:
                total.append({"tipo": "caso do print não fechou o espaço", "op": "cenário", "det": str(c)})
            fpss = [float(x) for x in a.fps.split(",")]
            fpss = [30000 / 1001 if abs(x - 29.97) < 0.01 else 24000 / 1001 if abs(x - 23.976) < 0.01 else x for x in fpss]
            for k in range(a.sementes):
                fps = fpss[k % len(fpss)]
                r = pg.evaluate("([s, n, f, t]) => FIS.rodar(s, n, f, t == null ? null : {tr: t})", [a.semente0 + k, a.ops, fps, a.rastrear])
                for linha in (r.get("rastro") or [])[-3:] if r["achados"] else []:
                    print("    " + linha[:900])
                tipos = collections.Counter(x["tipo"] for x in r["achados"])
                print(f"semente {a.semente0 + k} ({fps:.3f} fps): {sum(r['ops'].values())} edições, {r['clipes']} clipes no fim, "
                      f"{len(r['achados'])} defeitos" + (f" → {dict(tipos)}" if tipos else ""))
                total += r["achados"]
    finally:
        if app:
            app.terminate()
    print()
    if not total:
        print("OK: nenhum defeito de física encontrado")
        return 0
    vistos = collections.OrderedDict()
    for x in total:
        vistos.setdefault(x["tipo"], []).append(x)
    for tipo, l in vistos.items():
        print(f"FALHOU {tipo}: {len(l)}×")
        for x in l[:3]:
            print(f"    {x['op']}: {x['det'][:300]}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
