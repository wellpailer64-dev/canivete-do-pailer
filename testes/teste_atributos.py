"""Remover atributos e ajuste em grupo (editor-atributos.js) — abre um app próprio (porta 9334, dados em
D:/kanivete_testes/fila), monta 3 clipes com efeitos diferentes e confere: lista com contagem, menu do botão direito,
janela com caixinhas, remover só o marcado de todos, Ctrl+Z, e mudar um efeito com vários selecionados.

    py -3.13 testes/teste_atributos.py
"""
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

BASE = "D:/kanivete_testes/fila/"
PORTA = 9334
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def main():
    vid = BASE + "a.mp4"
    os.makedirs(BASE, exist_ok=True)
    if not os.path.isfile(vid):
        subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=6", "-f", "lavfi", "-i", "sine=f=440:d=6",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", vid], check=True)
    env = dict(os.environ, APPDATA=BASE + "appdata", TEMP=BASE + "tmp", TMP=BASE + "tmp", LOCALAPPDATA=BASE + "localappdata")
    for k in ("appdata", "tmp", "localappdata"):
        os.makedirs(BASE + k, exist_ok=True)
    app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={PORTA}"], cwd=RAIZ, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.video_cutter_prepare) && window.VEATR_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            pg.evaluate("p => veOpenPath(p)", vid)
            pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            info = pg.evaluate("""() => {
                const fx = Object.keys(VE_FX).filter(k => !VE_FX[k].soClipe || true), afx = Object.keys(VE_AFX);
                const base = VE.clips.find(c => !veIsAudio(c));
                const mk = (st, s, e) => ({ ...JSON.parse(JSON.stringify(base)), st, s, e, lk: undefined });
                const c0 = mk(0, 0, 2), c1 = mk(2, 2, 4), c2 = mk(4, 4, 6);
                const novo = (t, v) => ({ id: veFxNewId(), t, on: true, v: v || {} });
                const blur = 'blur' in VE_FX ? 'blur' : fx[0], outro = fx.find(k => k !== blur);
                c0.fx = [novo(blur, { amt: 10 })]; c1.fx = [novo(blur, { amt: 30 }), novo(outro)]; c2.afx = [novo(afx[0])];
                c0.p = { ...veDefProps(c0), sc: 140 }; c1.g = -6; c2.tin = veTrObj('push');
                vePushHistory(); VE.clips = [c0, c1, c2]; veRelayout(); veRefresh();
                veSelDefinir([c0, c1, c2], c0); veRefresh();
                return { blur, outro, afx: afx[0], nomeBlur: VE_FX[blur].nome };
            }""")
            lista = pg.evaluate("VEATR_API.lista()")
            ks = {a["k"]: a["n"] for a in lista}
            ok(ks.get("fx:" + info["blur"]) == 2 and ks.get("fx:" + info["outro"]) == 1 and ks.get("afx:" + info["afx"]) == 1 and ks.get("mov") == 1 and ks.get("vol") == 1 and ks.get("trv") == 1,
               "lista os atributos dos 3 clipes, com em quantos está", str(ks))
            pg.evaluate("veClipMenu(VE.sel, 400, 300, document)")
            ok("Remover atributos… (3 clipes)" in pg.inner_text(".ve-ctx"), "botão direito: Remover atributos… (3 clipes)")
            pg.click(".ve-ctx [data-atr]")
            pg.wait_for_selector("#ve-atr", timeout=5000)
            ok(pg.evaluate("document.querySelectorAll('#ve-atr [data-k]').length") == len(lista) and pg.evaluate("[...document.querySelectorAll('#ve-atr [data-k]')].every(x => x.checked)"),
               "janela com uma caixinha por atributo, todas marcadas")
            # desmarca tudo pelos grupos e marca só o desfoque e o movimento
            for g in pg.evaluate("[...document.querySelectorAll('#ve-atr [data-grupo]')].map(x => x.dataset.grupo)"):
                pg.click(f"#ve-atr [data-grupo='{g}']")
            pg.click(f"#ve-atr [data-k='fx:{info['blur']}']")
            pg.click("#ve-atr [data-k='mov']")
            pg.click("#ve-atr [data-ok]")
            r = pg.evaluate("VE.clips.map(c => ({ fx: (c.fx || []).map(f => f.t), afx: (c.afx || []).map(f => f.t), sc: c.p && c.p.sc, g: c.g || 0, tin: !!c.tin }))")
            ok(all(info["blur"] not in c["fx"] for c in r) and r[1]["fx"] == [info["outro"]] and r[2]["afx"] == [info["afx"]] and r[1]["g"] == -6 and r[2]["tin"],
               "remove só o marcado (desfoque) de todos; o resto fica", str(r))
            ok(abs(pg.evaluate("VE.clips[0].p.sc") - pg.evaluate("veDefProps(VE.clips[0]).sc")) < 0.01, "movimento volta ao padrão")
            pg.evaluate("veUndo ? veUndo() : document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z', ctrlKey: true}))")
            ok(pg.evaluate("VE.clips.filter(c => (c.fx || []).some(f => f.t === '%s')).length" % info["blur"]) == 2, "Ctrl+Z traz os atributos de volta")
            # ajuste em grupo: os 2 com desfoque selecionados, muda no principal → vai para o outro
            g = pg.evaluate("""(blur) => { const [c0, c1] = VE.clips; veSelDefinir([c0, c1], c0); veRefresh();
                const id = c0.fx.find(f => f.t === blur).id; veFxSetParam(id, 'amt', 55);
                return VE.clips.slice(0, 2).map(c => c.fx.find(f => f.t === blur).v.amt); }""", info["blur"])
            ok(g == [55, 55], "ajuste em grupo: mudar o efeito no principal muda nos selecionados", str(g))
            s = pg.evaluate("""(blur) => { const [c0, c1] = VE.clips; veSelDefinir([c0], c0); veRefresh();
                veFxSetParam(c0.fx.find(f => f.t === blur).id, 'amt', 12); return VE.clips.slice(0, 2).map(c => c.fx.find(f => f.t === blur).v.amt); }""", info["blur"])
            ok(s == [12, 55], "com um clipe só, muda só ele", str(s))
            pg.evaluate("veSelDefinir([...VE.clips], VE.clips[0]); veClipMenu(VE.sel, 400, 300, document)")
            pg.click(".ve-ctx [data-atr]")
            pg.wait_for_selector("#ve-atr", timeout=5000)
            pg.screenshot(path=BASE + "atributos.png")
    finally:
        app.terminate()
    print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
