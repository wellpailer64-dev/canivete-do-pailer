"""J-cut após o corte de respiros, no app de teste.

py -3.13 testes/teste_jcut.py [--porta 9340] [--sem-abrir]
Usa D:/kanivete_testes/respiros/fala_pausas.mp4 e mantém temporários em D:/kanivete_testes/jcut/.
"""
import argparse, os, subprocess, sys, time, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "D:/kanivete_testes/jcut/"
VIDEO = "D:/kanivete_testes/respiros/fala_pausas.mp4"
JS = os.path.join(RAIZ, "frontend", "js", "editor-jcut.js")
erros = []


def ok(cond, nome, detalhe=""):
    print(("  ok    " if cond else "  FALHOU ") + nome + (f" ({detalhe})" if detalhe else ""))
    if not cond:
        erros.append(nome)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=9340)
    ap.add_argument("--sem-abrir", action="store_true")
    a = ap.parse_args()
    app = None
    if not os.path.isfile(VIDEO):
        print("FALHOU: vídeo de teste ausente:", VIDEO)
        sys.exit(1)
    if not a.sem_abrir:
        for k in ("appdata", "tmp", "localappdata"):
            os.makedirs(BASE + k, exist_ok=True)
        env = dict(os.environ, APPDATA=BASE + "appdata", TEMP=BASE + "tmp", TMP=BASE + "tmp", LOCALAPPDATA=BASE + "localappdata")
        app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={a.porta}"], cwd=RAIZ, env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
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
            if not pg:
                raise RuntimeError(f"Página index.html não encontrada na porta {a.porta}")
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_respiros) && typeof veRespirosAplicar === 'function'", timeout=90000)
            if pg.evaluate("typeof veJcutAplicar") != "function":
                pg.add_script_tag(path=JS)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            pg.evaluate("p => veOpenPath(p)", VIDEO)
            pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            pg.evaluate("veRespirosAplicar({preset:'normal'})")
            plano = pg.evaluate("veJcutPlano({modo:'j', ms:200})")
            ok(plano["tratadas"] > 0, "plano acha emendas seguras", str(plano["tratadas"]))
            plano_sel = pg.evaluate("veJcutPlano({modo:'j', ms:200, clips:[VE.clips[1]]})")
            ok(plano_sel["tratadas"] == 2, "seleção de um clipe inclui suas emendas", str(plano_sel["tratadas"]))
            estado0 = pg.evaluate("JSON.stringify(VE.clips)")
            hist0 = pg.evaluate("VE.history.length")
            dur0 = pg.evaluate("veNavDur()")
            r = pg.evaluate("veJcutAplicar({modo:'j', ms:200})")
            ok(r["ok"] and r["tratadas"] > 0, "aplicou J-cut", str(r))
            clips = pg.evaluate("VE.clips.map(c => ({m:c.m||0,tr:+c.tr||0,st:c.st,s:c.s,e:c.e,x:c.x||'',lk:c.lk||'',vel:veVel(c),dur:veDurMidia(c)}))")
            dur1 = pg.evaluate("veNavDur()")
            ok(abs(dur1 - dur0) < 0.02, "duração total da timeline igual", f"{dur0:.3f}→{dur1:.3f}")
            ok(pg.evaluate("VE.history.length") == hist0 + 1, "um desfazer só", str(pg.evaluate("VE.history.length - %d" % hist0)))
            pares = r.get("emendas", [])
            deslocados = 0
            for e in pares:
                b0 = e["b"]
                audios = [c for c in clips if c["m"] == b0["m"] and c["tr"] == b0["tr"] and c["x"] == "a"]
                deslocados += sum(1 for c in audios if abs(c["st"] - (b0["st"] - 0.2)) < 0.03 and abs(c["s"] - (b0["s"] - 0.2 * c["vel"])) < 0.03)
            ok(deslocados >= r["tratadas"], "áudio do próximo clipe entra 200 ms antes", f"{deslocados}/{r['tratadas']}")
            ok(all(c["s"] >= -1e-6 and c["e"] <= c["dur"] + 0.002
                   for c in clips if c["x"] == "a"), "áudio permanece dentro da mídia")
            audio_separado = [c for c in clips if c["x"] == "a"]
            ids = [(c["m"], c["tr"], round(c["st"], 4), round(c["s"], 4), round(c["e"], 4)) for c in audio_separado]
            ok(len(ids) == len(set(ids)) and all(any(v["x"] == "v" and v["lk"] == c["lk"] for v in clips) for c in audio_separado)
               and not any(c["x"] == "" and c["m"] == a0["m"] and c["tr"] == a0["tr"] and abs(c["st"] - a0["st"]) < 0.01 for c in clips for a0 in audio_separado),
               "separação sem áudio duplicado")
            pg.evaluate("veUndo()")
            time.sleep(0.5)
            ok(pg.evaluate("JSON.stringify(VE.clips)") == estado0, "um desfazer restaura o estado após respiros")
    finally:
        if app:
            app.terminate()
    print("\nFALHAS:", erros if erros else "nenhuma")
    sys.exit(1 if erros else 0)


main()
