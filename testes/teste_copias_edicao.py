"""Cópias de edição (Functions/otimizar.py): quadro-chave a cada ~0,25 s e refazer as antigas pelo editor.

Tudo em D:/kanivete_testes/copias_edicao (nunca nos arquivos de um projeto real): gera um "original" 4K e uma cópia
Full HD no formato antigo (quadro-chave a cada ~4 s), monta um projeto que usa a cópia, abre o app de teste (porta
9395), confere a pergunta "Cópias de edição mais rápidas", mede o pulo da agulha, refaz, confere a cópia nova
(gop curto, URL nova, player recarregado) e mede de novo.

    py -3.13 testes/teste_copias_edicao.py
"""
import json, os, subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from Functions import otimizar
from Functions.video_cutter import ffmpeg_path

BASE = "D:/kanivete_testes/"
D = BASE + "copias_edicao/"
PORTA = 9395
erros = 0


def ok(c, nome, det=""):
    global erros
    erros += not c
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""), flush=True)


def preparar():
    os.makedirs(D + otimizar.PASTA, exist_ok=True)
    orig, copia = D + "clip.mp4", D + otimizar.PASTA + "/clip_FullHD.mp4"
    for p in (orig, copia, copia[:-4] + "_r.mp4"):
        if os.path.exists(p):
            os.remove(p)
    F = ffmpeg_path()
    # "original" 4K vertical de 40 s (tem de ser maior que Full HD para o Forçar Full HD converter)
    subprocess.run([F, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=2160x3840:rate=30:duration=40",
                    "-f", "lavfi", "-i", "sine=frequency=330:duration=40", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", orig], check=True)
    # cópia no formato ANTIGO: quadro-chave a cada 4 s (o padrão do codificador antes desta mudança)
    subprocess.run([F, "-v", "error", "-y", "-i", orig, "-vf", "scale=1080:1920", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "18", "-g", "120", "-bf", "3", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", copia], check=True)
    time.sleep(1.1)
    os.utime(copia)   # mais nova que o original (senão o converter refaria por data, não pelo quadro-chave)
    return orig, copia


def projeto(copia):
    proj = D + "teste.vknv"
    d = {"app": "video_cutter", "video": copia, "media": [{"id": 0, "kind": "video", "name": "clip_FullHD.mp4", "path": copia}],
         "clips": [{"tr": 0, "st": 0, "s": 0, "e": 40}], "fps": 30, "w": 1080, "h": 1920}
    json.dump(d, open(proj, "w", encoding="utf-8"))
    return proj


def main():
    orig, copia = preparar()
    ok(otimizar.gop_longo(copia), "cópia antiga reconhecida (quadro-chave espaçado)")
    ok(otimizar.original_de(copia) == os.path.abspath(orig).replace("/", "\\") or os.path.samefile(otimizar.original_de(copia), orig),
       "acha o original a partir da cópia", str(otimizar.original_de(copia)))
    proj = D + "teste.vknv"
    if os.path.exists(proj):
        os.remove(proj)
    env = dict(os.environ, APPDATA=BASE + "appdata_copias", TEMP=BASE + "tmp", TMP=BASE + "tmp", LOCALAPPDATA=BASE + "localappdata_copias")
    for k in ("appdata_copias", "tmp", "localappdata_copias"):
        os.makedirs(BASE + k, exist_ok=True)
    app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={PORTA}"], cwd=RAIZ, env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    try:
        for _ in range(120):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORTA}/json", timeout=1); break
            except Exception:
                time.sleep(0.5)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORTA}")
            pg = None
            for _ in range(120):
                pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url), None)
                if pg: break
                time.sleep(0.5)
            pg.wait_for_function("typeof veOpenProjectExternal === 'function' && !!window.pywebview?.api?.ve_copias_antigas", timeout=120000)
            erros_js = []
            pg.on("pageerror", lambda e: erros_js.append(str(e)))
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); switchTool('video-cutter')")
            # o projeto é gerado pelo próprio app (formato válido): abre a cópia, salva, e reabre o .vknv (como a pessoa faz)
            pg.evaluate("p => veOpenPath(p)", copia)
            pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            r = pg.evaluate("p => window.pywebview.api.ve_project_save(p, JSON.stringify(veProjectData()), false, null)", proj)
            ok(bool(r and r.get("success", True)) and os.path.isfile(proj), "projeto de teste salvo pelo app", str(r)[:120])
            pg.evaluate("p => veOpenProjectExternal(p)", proj)
            pg.wait_for_function("VE.projectPath && !VE._pendingProject && VE.ready && $ve('ve-loading').hidden", timeout=120000)
            # a pergunta aparece sozinha uns segundos depois de abrir
            pg.wait_for_function("(document.getElementById('app-confirm-titulo')?.textContent || '').includes('Cópias de edição')", timeout=30000)
            ok(True, "ao abrir o projeto, oferece refazer a cópia antiga")
            PULO = """async () => { await new Promise(r => setTimeout(r, 1500)); const ts = []; let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
                for (let i = 0; i < 15; i++) { const v0 = veVideo(), t0 = performance.now(); veSeek(1 + rnd() * 37);
                  const v = veVideo(); if (v.seeking) await new Promise(r => v.addEventListener('seeked', r, { once: true })); ts.push(performance.now() - t0); }
                ts.sort((a, b) => a - b); return +ts[7].toFixed(1); }"""
            antes = pg.evaluate(PULO)
            url0 = pg.evaluate("VE.media[0].url")
            pg.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Refazer' && b.offsetParent).click()")
            pg.wait_for_function("!VEFHD.fila", timeout=300000)
            pg.wait_for_timeout(3000)
            m = pg.evaluate("({path: VE.media[0].path, url: VE.media[0].url})")
            ok(not otimizar.gop_longo(m["path"]), "cópia refeita com quadro-chave curto", m["path"])
            ok(m["url"] and m["url"] != url0, "URL nova: o player recarrega o arquivo novo", f"{url0} → {m['url']}")
            pg.wait_for_function("VE.media[0].url && veVideo().readyState >= 2", timeout=60000)
            depois = pg.evaluate(PULO)
            ok(depois < antes, "pular para um ponto ficou mais rápido", f"{antes} → {depois} ms (mediana)")
            pg.evaluate("veSeek(12.5)"); pg.wait_for_timeout(1200)
            dif = pg.evaluate("Math.abs(veVideo().currentTime - 12.5)")
            ok(dif < 0.05, "o player mostra o ponto pedido no arquivo novo", f"{dif:.3f} s")
            ok(not erros_js, "sem erros de JS", "; ".join(erros_js)[:200])
    finally:
        try:
            import psutil
            for c in psutil.Process(app.pid).children(recursive=True):
                c.kill()
        except Exception:
            pass
        app.kill()
    print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
