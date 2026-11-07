"""Cortar respiros (editor-respiros.js + Functions/respiros.py) e onda em alta resolução (ve_peaks_faixa) no app de verdade.

    py -3.13 testes/teste_respiros.py [--video fala_pausas.mp4] [--porta 9339] [--sem-abrir]
O vídeo de teste tem 2 pausas plantadas (1,0 s em 2,0 e 0,8 s em 5,5). Confere: cortes feitos, duração menor no esperado,
fala intacta (mesma duração de voz antes e depois), um desfazer só, pausa curta intocada e a onda fina chegando no zoom."""
import argparse, os, subprocess, sys, time, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "D:/kanivete_testes/respiros/"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=BASE + "fala_pausas.mp4")
    ap.add_argument("--porta", type=int, default=9339)
    ap.add_argument("--sem-abrir", action="store_true")
    a = ap.parse_args()
    vid = a.video.replace("\\", "/")
    app = None
    if not a.sem_abrir:
        env = dict(os.environ, APPDATA=BASE + "appdata", TEMP=BASE + "tmp", TMP=BASE + "tmp", LOCALAPPDATA=BASE + "localappdata")
        for k in ("appdata", "tmp", "localappdata"):
            os.makedirs(BASE + k, exist_ok=True)
        app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={a.porta}"], cwd=RAIZ, env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{a.porta}/json", timeout=1); break
            except Exception:
                time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
            pg = None
            for _ in range(60):
                pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url and x.evaluate("typeof VE") == "object"), None)
                if pg: break
                time.sleep(1)
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_respiros) && typeof veRespirosAplicar === 'function'", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            pg.evaluate("p => veOpenPath(p)", vid)
            pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            dur0 = pg.evaluate("veNavDur()")
            n0 = pg.evaluate("VE.clips.length")
            hist0 = pg.evaluate("VE.history.length")
            plano = pg.evaluate("veRespirosPlano({preset:'normal'})")
            ok(len(plano["intervalos"]) == 2, "plano acha as 2 pausas", str(plano))
            # os cortes caem dentro das pausas plantadas (2,0–3,0 e 5,5–6,3), sem entrar na fala
            ok(all((2.0 <= x[0] and x[1] <= 3.0) or (5.5 <= x[0] and x[1] <= 6.3) for x in plano["intervalos"]), "cortes só dentro das pausas")
            r = pg.evaluate("veRespirosAplicar({preset:'normal'})")
            dur1 = pg.evaluate("veNavDur()")
            ok(r["ok"] and r["cortes"] == 2, "aplicou 2 cortes", str(r))
            ok(abs((dur0 - dur1) - plano["removido"]) < 0.15, "duração caiu o planejado", f"{dur0:.2f}→{dur1:.2f} (plano {plano['removido']})")
            ok(pg.evaluate("VE.history.length") == hist0 + 1, "um desfazer só", str(pg.evaluate("VE.history.length - %d" % hist0)))
            # a fala segue inteira: voz medida na fonte = soma dos trechos que sobraram
            ok(pg.evaluate("VE.clips.every(c => veEnd(c) > c.st)"), "sem clipe vazio")
            r2 = pg.evaluate("veRespirosPlano({preset:'normal'})")
            ok(len(r2["intervalos"]) == 0, "rodar de novo não corta mais", str(r2))
            pg.evaluate("veUndo && veUndo()")
            time.sleep(0.5)
            ok(abs(pg.evaluate("veNavDur()") - dur0) < 0.02 and pg.evaluate("VE.clips.length") == n0, "desfazer volta ao original")
            # painel Animação › Respiros com cliques de verdade
            pg.evaluate("vedShow && vedShow('kaniedit')"); time.sleep(0.5)
            pg.evaluate("document.getElementById('ve-rs-sec').open = true")
            def clicar(sel):
                el = pg.locator(sel).first; el.scroll_into_view_if_needed(); bx = el.bounding_box()
                pg.mouse.click(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2); time.sleep(0.3)
            clicar("#ve-rs-corpo [data-rs=agressivo]")
            ok(pg.evaluate("VERS.preset") == "agressivo" and pg.evaluate("!!document.querySelector('#ve-rs-corpo [data-rs=agressivo].on')"), "clique escolhe Ágil")
            clicar("#ve-rs-corpo [data-rs-acao=cortar]")
            pg.wait_for_function("VERS.ultimo && !VERS.rodando", timeout=30000)
            u = pg.evaluate("VERS.ultimo")
            ok(u["cortes"] == 2 and pg.evaluate("veNavDur()") < dur0 - 1.2, "botão Cortar respiros corta", str(u))
            pg.locator("#ve-rs-sec").screenshot(path=BASE + "painel.png")
            clicar("#ve-rs-corpo [data-rs-acao=desfazer]")
            ok(abs(pg.evaluate("veNavDur()") - dur0) < 0.02, "Desfazer do painel volta")
            pg.evaluate("localStorage.setItem('ve-rs-preset','normal')")
            # painel KaniEdit: aba própria, com as seções e o Editar tudo (só respiros aqui: sem transcrição no teste)
            ok(pg.evaluate("['ve-ke-sec','ve-rs-sec','ve-az-sec','ve-jc-sec'].every(id => document.getElementById(id)?.closest('#ve-pane-kaniedit'))"), "seções dentro do painel KaniEdit")
            pg.locator("#ve-pane-kaniedit").screenshot(path=BASE + "kaniedit.png")
            pg.evaluate("VERS.preset='normal'")
            k = pg.evaluate("veKaniEditCompleto({respiros:true, jcut:true, legenda:false, autozoom:false})")
            ok(k["ok"] and k["mudou"] and pg.evaluate("veNavDur()") < dur0 - 1.0 and any("J-cut 2" in e for e in k["etapas"]), "Editar tudo (respiros + J-cut) corta", str(k))
            pg.evaluate("veTab('kaniedit'); document.getElementById('ve-ke-sec').open = true; document.getElementById('ve-ke-rolagem').scrollTop = 0"); time.sleep(0.4)
            clicar("#ve-ke-corpo [data-ke-acao=desfazer]")
            ok(abs(pg.evaluate("veNavDur()") - dur0) < 0.02, "Desfazer do KaniEdit volta")
            # cancelar: respiros rodam, o J-cut é pulado, e ainda é um desfazer só
            c = pg.evaluate("(async()=>{const p=veKaniEditCompleto({respiros:true,jcut:true,legenda:false,autozoom:false}); VEKED.cancelar=true; const r=await p; const d=veNavDur(); veUndo(); return {r, d, d2:veNavDur()}})()")
            ok("cancelado" in " ".join(c["r"]["etapas"]) and not any("J-cut" in e for e in c["r"]["etapas"]) and abs(c["d2"] - dur0) < 0.02, "Cancelar para antes do J-cut e desfaz inteiro", str(c))
            # onda fina no zoom profundo
            pg.evaluate("VE.view = 1.5; veSetPps(4000, 1.5, 0)")
            pg.wait_for_function("!!(VE.media[0] && VE.media[0]._pf) || !!VE._pf", timeout=15000)
            pf = pg.evaluate("(VE.media[0] && VE.media[0]._pf) || VE._pf")
            ok(pf and pf["peaks"] and pf["dens"] > 1000, "onda fina chegou no zoom", f"{len(pf['peaks'])} picos, {pf['dens']:.0f}/s" if pf else "")
            ok(pg.evaluate("VE.pps") == 4000 and pg.evaluate("(veSetPps(16000, 1.5, 0), VE.pps)") == 16000, "zoom vai até 16000 px/s")
    finally:
        if app:
            app.terminate()
    print("\nFALHAS:", erros if erros else "nenhuma")
    sys.exit(1 if erros else 0)


main()
