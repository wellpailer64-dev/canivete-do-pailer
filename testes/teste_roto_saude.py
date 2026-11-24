"""Pincel Roto enxuto (3 s em 720p): VEROTO_API.auto (Selecionar assunto + Freeze num comando) e o autorreparo da
prévia: apaga máscaras da prévia, perde o trabalho no Python e confere que a saúde conserta sozinha.

    py -3.13 testes/teste_roto_saude.py --porta 9334 [--video D:/kanivete_testes/roto_mini/mini.mp4] [--sem-abrir]
Ambiente do app de teste (APPDATA etc.) vem do chamador (vaga). Saída 0 = passou.
"""
import argparse, glob, json, os, subprocess, sys, time, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ap = argparse.ArgumentParser()
ap.add_argument("--porta", type=int, default=9334)
ap.add_argument("--video", default="D:/kanivete_testes/roto_mini/mini.mp4")
ap.add_argument("--sem-abrir", action="store_true")
a = ap.parse_args()
erros = []


def ok(cond, msg):
    print(("OK   " if cond else "FALHA ") + msg)
    if not cond:
        erros.append(msg)


app = None if a.sem_abrir else subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={a.porta}"], cwd=RAIZ,
                                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
from playwright.sync_api import sync_playwright  # noqa: E402
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
        pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_roto_saude) && window.VEROTO_API", timeout=90000)
        pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
        time.sleep(1)
        pg.evaluate("p => veOpenPath(p)", a.video)
        pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
        t0 = time.time()
        r = pg.evaluate("async () => { const c = VE.clips.find(c => !veIsAudio(c)); return await VEROTO_API.auto(c); }")
        print(f"auto: {time.time()-t0:.0f} s", json.dumps({k: r.get(k) for k in ('ok', 'n', 'prontos', 'faltam', 'motivo')}, ensure_ascii=False))
        ok(r.get("ok") and r.get("faltam") == 0, "auto recortou todos os quadros")
        rid = pg.evaluate("veRotoFx(VE.clips.find(c => !veIsAudio(c))).v.rd.rid")
        pasta = next(iter(glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "**", "Roto", rid), recursive=True)), None)
        ok(bool(pasta), "cache do recorte achado")
        # 1) prévia apagada (limpador do cache): a saúde refaz do alfa
        ps = sorted(glob.glob(os.path.join(pasta, "p", "*.png")))[:10]
        for f in ps:
            os.remove(f)
        s = pg.evaluate("async () => await VEROTO_API.saude(VE.clips.find(c => !veIsAudio(c)))")
        ok(s.get("previa_refeita") == len(ps) and s.get("faltam") == 0, f"prévia apagada refeita ({s.get('previa_refeita')}/{len(ps)})")
        # 2) Python perdeu o trabalho (app reiniciou): o preview reabre sozinho
        pg.evaluate(f"() => window.pywebview.api.ve_roto_cancelar('{rid}')")
        pg.evaluate("() => { VERO.st[Object.keys(VERO.st)[0]].url_p = 'http://127.0.0.1:1/x/'; VERO.img.clear(); veSeek(1); veRefresh(); }")
        time.sleep(1)
        for k in range(30):
            pg.evaluate("() => { veSeek(1 + Math.random() * 0.01); veDrawMonitorSoon(); }")
            time.sleep(1)
            if pg.evaluate("() => { const st = Object.values(VERO.st)[0]; return !!(st && !st.url_p.includes('127.0.0.1:1/')); }"):
                break
        ok(pg.evaluate("() => { const st = Object.values(VERO.st)[0]; return !!(st && !st.url_p.includes('127.0.0.1:1/')); }"), "endereço morto da prévia: reabriu sozinho")
        time.sleep(2)
        ok(pg.evaluate("() => { const st = Object.values(VERO.st)[0], i = VEROTO_API.quadro(null, VE.playhead); return !!veRotoImg(st, i, true); }"), "máscara do quadro carregou depois do reparo")
finally:
    if app:
        app.terminate()
print("PASSOU" if not erros else f"REPROVADO: {len(erros)}")
sys.exit(1 if erros else 0)
