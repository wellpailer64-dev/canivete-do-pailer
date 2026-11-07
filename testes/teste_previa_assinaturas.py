"""Prévia guardada x o que muda a imagem: cada controle que altera o quadro precisa trocar as assinaturas da prévia.

    py -3.13 testes/teste_previa_assinaturas.py [--video X.mp4] [--porta 9341] [--sem-abrir]
Duas prévias guardadas: o trecho renderizado em disco (vePrImpressao/vePrSig, editor-render.js) e o quadro da RAM
(veCacheSig, editor.js). Se um controle mexe na imagem e não entra nelas, o monitor segue mostrando a versão antiga.
Foi o olho da trilha: ocultar a V4 da camada de ajuste seguia tocando o trecho renderizado COM a cor (2026-11-07).
Para cada controle: muda, confere que as assinaturas mudaram, desfaz e confere que voltaram iguais."""
import argparse, os, subprocess, sys, time, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "D:/kanivete_testes/previa_sig/"
erros = []

# [nome, código que muda, código que desfaz] — rodam com c = o clipe de vídeo na agulha
CONTROLES = [
    ["olho da trilha", "veTrackState('v', c.tr).hide = true", "veTrackState('v', c.tr).hide = false"],
    ["clipe desativado", "c.off = true", "delete c.off"],
    ["opacidade do clipe", "c._pAnt = c.p; c.p = {...veStaticProps(c), op: 50}",
     "if (c._pAnt === undefined) delete c.p; else c.p = c._pAnt; delete c._pAnt"],
    ["efeito Luz e Cor", "c.fx = [...(c.fx||[]), {t:'lc', v:{exp: 1}}]", "c.fx = c.fx.slice(0, -1); if (!c.fx.length) delete c.fx"],
    ["efeito desligado", "c.fx = [{t:'lc', v:{exp: 1}}]; c._sig1 = null", "c.fx[0].on = false"],
    ["olho das legendas", "window._legEst = VE.legEstilo; VE.legEstilo = {...veTxEstilo(), oculta: true}",
     "VE.legEstilo = window._legEst; delete window._legEst"],
    ["tamanho da sequência", "VE.seqW += 2", "VE.seqW -= 2"],
]

JS_SIG = """() => {
    VEPR.sujo = true;
    const f = Math.round(VE.playhead * (VE.fps || 30));
    return { imp: vePrImpressao(), ram: veCacheSig(f) };
}"""


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default="D:/kanivete_testes/respiros/fala_pausas.mp4")
    ap.add_argument("--porta", type=int, default=9341)
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
                pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url
                           and x.evaluate("typeof VE === 'object' && !document.documentElement.classList.contains('ve-float-html')")), None)
                if pg: break
                time.sleep(1)
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api) && typeof vePrImpressao === 'function'", timeout=90000)
            falhos = pg.evaluate("window.__scriptsFalhos || []")
            ok(not falhos, "todos os scripts da página carregaram", "; ".join(falhos))
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            pg.evaluate("p => veOpenPath(p)", vid)
            pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            pg.evaluate("VE.playhead = Math.min(1, VE.dur / 2)")
            # uma legenda na agulha (o quadro da RAM só leva a legenda do instante)
            pg.evaluate("VE.legendas = [{st: 0, en: VE.dur, texto: 'teste da prévia'}]")
            for nome, muda, desfaz in CONTROLES:
                pre = "const c = VE.clips.find(x => !veIsAudio(x) && x.st <= VE.playhead && veEnd(x) > VE.playhead);"
                s0 = pg.evaluate(JS_SIG)
                pg.evaluate(f"() => {{ {pre} {muda}; }}")
                s1 = pg.evaluate(JS_SIG)
                pg.evaluate(f"() => {{ {pre} {desfaz}; }}")
                s2 = pg.evaluate(JS_SIG)
                if nome == "efeito desligado":   # aqui s1 = com o efeito ligado, s2 = o mesmo efeito desligado
                    ok(s1["imp"] != s2["imp"] and s1["ram"] != s2["ram"], f"{nome}: prévia descartada")
                    pg.evaluate(f"() => {{ {pre} delete c.fx; delete c._sig1; }}")
                    continue
                ok(s1["imp"] != s0["imp"], f"{nome}: trecho renderizado descartado")
                ok(s1["ram"] != s0["ram"], f"{nome}: quadro da RAM descartado")
                ok(s2 == s0, f"{nome}: desfeito volta à mesma prévia")
    finally:
        if app:
            app.terminate()
            try:
                app.wait(15)
            except Exception:
                app.kill()
    print("\nREPROVADO: " + ", ".join(erros) if erros else "\nOK: todas as assinaturas da prévia acompanham os controles")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
