"""Remix de música na timeline (editor-remix.js + Functions/remix.py), com mouse de verdade: põe uma música de 3:46
na timeline, liga a ferramenta Remix (Shift+R) e arrasta a ponta direita até 60 s → o clipe passa a usar a música
remixada (começo e final preservados), com as emendas desenhadas; exporta e confere a duração do som e que o final
do arquivo é o final da música original; "voltar à música original" desfaz.
    py -3.13 testes/teste_remix.py [--musica arq.mp3] [--porta 9338] [--sem-abrir]
"""
import argparse
import os
import subprocess
import sys
import time
import urllib.request

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from Functions.midia import ffmpeg  # noqa: E402

BASE = "D:/kanivete_testes/remix/"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def pcm(arq, ss=None, t=None):
    cmd = [ffmpeg(), "-v", "error"] + (["-ss", str(ss)] if ss is not None else []) + ["-i", arq] + (["-t", str(t)] if t else []) + ["-vn", "-ac", "1", "-ar", "22050", "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.float32)


def parecido(a, b, folga=2205):
    """Maior correlação entre a e b deslocando b até ±folga amostras (decodificação de MP3 desloca um pouco)."""
    melhor = -1.0
    for d in range(-folga, folga + 1, 21):
        x = a[folga:-folga]
        y = b[folga + d:len(b) - folga + d]
        n = min(len(x), len(y))
        if n > 1000:
            melhor = max(melhor, float(np.corrcoef(x[:n], y[:n])[0, 1]))
    return melhor


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--musica", default=BASE + "electric.mp3")
    ap.add_argument("--porta", type=int, default=9338)
    ap.add_argument("--sem-abrir", action="store_true")
    a = ap.parse_args()
    mus = a.musica.replace("\\", "/")
    vid = BASE + "base.mp4"
    os.makedirs(BASE + "saida", exist_ok=True)
    if not os.path.isfile(vid):
        subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x223344:s=640x360:r=30:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", vid], check=True)
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
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_remix) && window.VERMX_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            if pg.evaluate("VE.ready ? (VE.path || '').replace(/\\\\/g, '/') : ''") != vid:
                pg.evaluate("p => veOpenPath(p)", vid)
                pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            pg.evaluate("p => { veStop(); VE.clips = VE.clips.filter(c => !veIsAudio(c) || c.m == null); veSeek(0); return veAddAudio(p); }", mus)
            pg.wait_for_function("VE.clips.some(c => veIsAudio(c) && veMid(c))", timeout=120000)
            d0 = pg.evaluate("(() => { const c = VE.clips.find(c => veIsAudio(c) && veMid(c)); return veLen(c); })()")
            pg.evaluate("veZoomFit(); VE.sel = -1; veRefresh();")
            time.sleep(0.5)
            pg.locator("#ve-tl-wrap").hover()
            pg.keyboard.press("Shift+R")
            ok(pg.evaluate("VE.tool") == "remix", "Shift+R liga a ferramenta Remix")
            pos = pg.evaluate("""() => {
                const c = VE.clips.find(c => veIsAudio(c) && veMid(c)), r = $ve('ve-tl-wrap').getBoundingClientRect();
                const row = veTrackRows().find(x => x.id === 'A' + (c.tr + 1));
                return [r.left + (veEnd(c) - VE.view) * VE.pps - 2, r.top + row.y + row.h / 2, r.left + (c.st + 60 - VE.view) * VE.pps];
            }""")
            pg.mouse.move(pos[0], pos[1]); pg.mouse.down()
            for k in range(1, 13):
                pg.mouse.move(pos[0] + (pos[2] - pos[0]) * k / 12, pos[1], steps=2)
            pg.screenshot(path=BASE + "saida/arrastando.png")
            pg.mouse.up()
            pg.wait_for_function("VE.clips.some(c => veIsAudio(c) && VERMX_API.eh(c))", timeout=180000, polling=500)
            st = pg.evaluate("""(() => { const c = VE.clips.find(c => veIsAudio(c) && VERMX_API.eh(c)), m = veMediaOf(c);
                return { len: veLen(c), dur: m.dur, em: m.rmxEm, path: m.path, orig: VE.media[m.rmxDe].path, vis: vePjMidia().includes(m) }; })()""")
            ok(abs(st["len"] - 60) < 1.5, "o clipe ficou com ~60 s", f"{st['len']:.1f} s (antes {d0:.1f} s)")
            ok(len(st["em"]) >= 1, "emendas guardadas para desenhar", str(st["em"]))
            ok(not st["vis"], "a música remixada não aparece solta no painel Projeto")
            time.sleep(0.5)
            pg.screenshot(path=BASE + "saida/remix.png")
            # o FINAL do remix é o final da música original (últimos 5 s iguais)
            y, x = pcm(st["path"]), pcm(st["orig"])
            n, f = 22050 * 15, 22050 * 3   # 12 s antes dos 3 s finais (o fim do MP3 é silêncio)
            cf = parecido(y[-n:-f], x[-n:-f]) if len(y) > n and len(x) > n else -1
            ok(cf > 0.95, "o remix termina com o final de verdade da música", f"correlação {cf:.3f}")
            ci = parecido(y[22050:n], x[22050:n])
            ok(ci > 0.95, "e começa com o começo de verdade", f"correlação {ci:.3f}")
            # voltar ao original
            pg.evaluate("VE.sel = VE.clips.findIndex(c => veIsAudio(c) && VERMX_API.eh(c)); VERMX_API.original()")
            ok(pg.evaluate("!VE.clips.some(c => veIsAudio(c) && VERMX_API.eh(c))"), "voltar à música original")
            pg.keyboard.press("Control+z")
            ok(pg.evaluate("VE.clips.some(c => veIsAudio(c) && VERMX_API.eh(c))"), "Ctrl+Z traz o remix de volta")
    finally:
        if app:
            app.terminate()
    print("\n" + ("TUDO OK" if not erros else f"{len(erros)} FALHA(S): " + "; ".join(erros)))
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
