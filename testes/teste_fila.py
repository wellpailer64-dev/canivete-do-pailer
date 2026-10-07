"""Fila de render do Editor (editor-fila.js) — abre um app próprio (porta 9334, dados em D:/kanivete_testes/fila),
monta duas timelines com material gerado, põe as duas na fila de uma vez, roda a fila e confere os arquivos.

    py -3.13 testes/teste_fila.py
"""
import os
import re
import subprocess
import sys
import time
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from Functions.midia import ffmpeg  # noqa: E402

BASE = "D:/kanivete_testes/fila/"
SAIDA = BASE + "saida/"
PORTA = 9334
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def dur(arq):
    o = subprocess.run([ffmpeg(), "-hide_banner", "-i", arq, "-f", "null", "-"], capture_output=True, text=True).stderr
    t = re.findall(r"time=(\d+):(\d+):([\d.]+)", o)[-1]
    return int(t[0]) * 3600 + int(t[1]) * 60 + float(t[2])


def main():
    os.makedirs(SAIDA, exist_ok=True)
    for f in os.listdir(SAIDA):
        os.remove(os.path.join(SAIDA, f))
    vid = BASE + "a.mp4"
    if not os.path.isfile(vid):
        subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=6", "-f", "lavfi", "-i", "sine=f=440:d=6",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", vid], check=True)
    env = dict(os.environ, APPDATA=BASE + "appdata", TEMP=BASE + "tmp", TMP=BASE + "tmp", LOCALAPPDATA=BASE + "localappdata")
    for k in ("appdata", "tmp", "localappdata"):
        os.makedirs(BASE + k, exist_ok=True)
    app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={PORTA}"], cwd=RAIZ, env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORTA}/json", timeout=1)
                break
            except Exception:
                time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORTA}")
            pg = None
            for _ in range(60):
                pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url and x.evaluate("typeof VE") == "object"), None)
                if pg:
                    break
                time.sleep(1)
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.video_cutter_prepare) && window.VEFILA_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            pg.evaluate("p => veOpenPath(p)", vid)
            pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            ok(pg.evaluate("!!document.getElementById('ve-fila-btn')"), "botão Fila no cabeçalho")
            # segunda timeline: só os 3 primeiros segundos
            pg.evaluate("""() => { const c = JSON.parse(JSON.stringify(VE.clips[0])); veCreateTimeline({ name: 'Fila B' });
                c.st = 0; c.s = 0; c.e = 3; VE.clips = [c]; veRelayout(); veAfterEdit(0); veSeqSalvarAtiva(); }""")
            pg.evaluate("s => { veOpenExport(); VE.dest = s; }", SAIDA)
            pg.wait_for_selector("#ve-export-foot .ve-btn:not(.ve-btn-primary):not(.ve-btn-ghost)", timeout=5000)
            ok("Adicionar à fila" in pg.inner_text("#ve-export-foot"), "janela Exportar tem 'Adicionar à fila'")
            pg.evaluate("veCloseExport()")
            n = pg.evaluate("async () => await VEFILA_API.todas()")
            itens = pg.evaluate("VEFILA_API.itens()")
            ok(n == 2 and len(itens) == 2, "adicionar todas as timelines", str([(i["nome"], round(i["dur"], 1)) for i in itens]))
            pg.evaluate("veFilaAbrir(); VEFILA_API.iniciar()")
            pg.wait_for_function("VEFILA_API.itens().every(i => i.estado === 'pronto' || i.estado === 'erro') && !VEFILA.rodando", timeout=300000)
            itens = pg.evaluate("VEFILA_API.itens()")
            ok(all(i["estado"] == "pronto" for i in itens), "fila rodou os dois, um depois do outro", str([(i["nome"], i["estado"], i.get("erro")) for i in itens]))
            ds = sorted(round(dur(i["saida"]), 1) for i in itens if i.get("saida"))
            ok(ds == [3.0, 6.0], "arquivos com a duração de cada timeline", str(ds))
            ok(pg.evaluate("$ve('ve-fila-btn').querySelector('.ve-fila-cont').textContent") == "", "contador da fila zera no fim")
            pg.screenshot(path=BASE + "fila.png")
    finally:
        app.terminate()
    print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
