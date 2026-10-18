"""Autozoom (editor-autozoom.js + Functions/autozoom.py) no app de verdade: entrevista de 15 s, transcrição, gerar
(Médio + Smart e Muito + Seco), conferir as camadas (ajuste cor-de-rosa acima do vídeo, efeito zoom, centro no rosto),
a prévia (zoom de verdade no monitor, igual ao quadro original ampliado pela curva) e a exportação na CPU e na placa
(prévia × arquivo no meio de um zoom).

    py -3.13 testes/teste_autozoom.py [--video trecho.mp4] [--dur 15] [--porta 9338] [--sem-abrir] [--sem-placa]
"""
import argparse
import base64
import io
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
from Functions import autozoom  # noqa: E402

BASE = "D:/kanivete_testes/autozoom/"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def quadro(arq, t, w=960, h=540):
    r = subprocess.run([ffmpeg(), "-v", "error", "-ss", f"{t:.3f}", "-i", arq, "-frames:v", "1", "-vf", f"scale={w}:{h}",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(h, w, 3).astype(np.float32)


def ampliar(img, s, cx, cy):
    """O quadro ampliado s× em torno de (cx, cy) (frações) — o que o zoom deve mostrar."""
    import cv2
    h, w = img.shape[:2]
    ax, ay = cx * w, cy * h
    M = np.float32([[s, 0, ax - ax * s], [0, s, ay - ay * s]])
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC)


MONITOR = """async T => { veSeek(T); for (let k = 0; k < 30; k++) { await new Promise(r => setTimeout(r, 120)); veDrawMonitor(); }
    const cv = $ve('ve-canvas'), m = document.createElement('canvas'); m.width = 960; m.height = 540;
    m.getContext('2d').drawImage(cv, 0, 0, 960, 540); return m.toDataURL('image/png'); }"""

EXPORTAR = """async ([dest, nome, placa]) => {
    window.__azFim = null;
    if (!window.__azHook) {
        const orig = window.veOnExport;
        window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} } if (e && e.done) window.__azFim = e; if (e && !e.done && /^Processador/.test(e.message || '')) window.__azCpu = e.message; try { orig(ev); } catch (x) {} };
        window.__azHook = true;
    }
    window.__azCpu = '';
    VE._txPng = null;
    if (VE.clips.some(veTxPrecisa)) await veTxPngs();
    const plano = veExportPlan(true), lim = veMasterLim();
    window.pywebview.api.video_cutter_export(VE.path, plano.base, 'mp4', 'medium', 'original', placa, dest, false,
        plano.camadas, plano.audio, plano.dur, lim ? [...plano.mix, { master: lim }] : plano.mix, veTxExport(plano.faixa),
        [VE.seqW, VE.seqH], { nome });
    return plano.camadas.filter(c => c.tipo === 'ajuste').length;
}"""


def png(url):
    from PIL import Image
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB"), np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default="D:/kanivete_testes/roto/trecho.mp4")
    ap.add_argument("--dur", type=float, default=15.0)
    ap.add_argument("--porta", type=int, default=9338)
    ap.add_argument("--sem-abrir", action="store_true")
    ap.add_argument("--sem-placa", action="store_true")
    a = ap.parse_args()
    vid = a.video.replace("\\", "/")
    saida = BASE + "saida/"
    os.makedirs(saida, exist_ok=True)
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
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_autozoom_rostos) && window.VEAZ_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            if pg.evaluate("VE.ready ? (VE.path || '').replace(/\\\\/g, '/') : ''") != vid:
                pg.evaluate("p => veOpenPath(p)", vid)
                pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            pg.evaluate("window.vePrSegEm = () => null; window.vePrAutoTick = () => {}; window.veCacheGet = () => null;")
            pg.evaluate("""d => { veStop(); vePushHistory(); VE.clips = VE.clips.filter(c => !(c.az)); VE.clips.forEach(c => { c.e = Math.min(c.e, c.s + d); }); veRelayout(); veRefresh(); }""", a.dur)
            # painel Animação › Autozoom visível
            pg.evaluate("vedShow && vedShow('trans')")
            time.sleep(0.5)
            vis = pg.evaluate("(() => { const s = document.getElementById('ve-az-sec'), r = s && s.getBoundingClientRect(); return !!r && r.height > 40 && !!s.querySelector('[data-az-acao=gerar]'); })()")
            ok(vis, "seção Autozoom no painel Animação")
            # cliques de verdade (mouse) nos controles: as opções mudam e o desenho acompanha
            pg.evaluate("document.getElementById('ve-az-sec').open = true")

            def clicar(sel):
                el = pg.locator(sel).first
                el.scroll_into_view_if_needed()
                bx = el.bounding_box()
                pg.mouse.click(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2)
                time.sleep(0.3)
            antes = pg.evaluate("({ ...veAzOpc() })")
            for s in ("[data-az=qtd][data-v=muito]", "[data-az=estilo][data-v=seco]", "[data-az=forca][data-v=forte]", ".ve-az-chave"):
                clicar("#ve-az-corpo " + s)
            o = pg.evaluate("veAzOpc()")
            on = pg.evaluate("[...document.querySelectorAll('#ve-az-corpo .on')].map(b => b.dataset.v).sort().join(',')")
            ok(o["qtd"] == "muito" and o["estilo"] == "seco" and o["forca"] == "forte" and o["mb"] != antes["mb"] and on == "forte,muito,seco",
               "cliques com o mouse na seção Autozoom", f"{o} · marcados {on}")
            pg.evaluate("a => { localStorage.setItem('ve-autozoom', JSON.stringify(a)); VEAZ.opc = null; veAzRender(); }", antes)
            # 1) Médio + Smart (transcreve sozinho se faltar)
            t0 = time.time()
            n = pg.evaluate("VEAZ_API.gerar({ qtd: 'medio', estilo: 'smart', forca: 'media' }).then(l => (l || []).length)")
            L = pg.evaluate("VEAZ_API.lista()")
            ok(n >= 2, "Médio + Smart gerou zooms", f"{n} em {time.time() - t0:.0f} s: " + ", ".join(f"{z['est']} {z['st']:.1f}–{z['en']:.1f}s {z['v']['z']}%" for z in L))
            info = pg.evaluate("""(() => { const v = VE.clips.filter(c => !veIsAudio(c) && !veIsAdj(c)).map(c => c.tr);
                return VE.clips.filter(c => c.az).map(c => [veIsAdj(c), c.cor, c.tr > Math.max(...v), (c.fx || []).some(f => f.t === 'zoom'), veCor(c)]); })()""")
            ok(info and all(x[0] and x[1] == "pink" and x[2] and x[3] for x in info), "camadas de ajuste pink acima do vídeo com o efeito zoom", str(info[:3]))
            rosto = [z for z in L if abs(z["v"]["cx"] - 50) > 0.5 or abs(z["v"]["cy"] - 45) > 0.5]
            ok(len(rosto) >= 1, "zoom centrado no rosto", ", ".join(f"({z['v']['cx']}, {z['v']['cy']})" for z in L))
            # 2) prévia: no meio do maior zoom o monitor é o quadro original ampliado pela curva
            z = max(L, key=lambda z: z["en"] - z["st"])
            T = round((z["st"] + z["en"]) / 2 * 30) / 30 + 1 / 60
            s = pg.evaluate("T => { const c = VE.clips.find(c => c.az && T >= c.st && T < veEnd(c)); return VEAZ_API.escala(c, T); }", T)
            prev = png(pg.evaluate(MONITOR, T))
            pg.evaluate("() => { VE.clips.filter(c => c.az).forEach(c => { c._hideTeste = c.fx[0].on; c.fx[0].on = false; }); veRefresh(); }")
            sem = png(pg.evaluate(MONITOR, T))
            pg.evaluate("() => { VE.clips.filter(c => c.az).forEach(c => { c.fx[0].on = true; }); veRefresh(); }")
            esperado = ampliar(sem, s, z["v"]["cx"] / 100, z["v"]["cy"] / 100)
            d_sem, d_esp = float(np.abs(prev - sem).mean()), float(np.abs(prev - esperado).mean())
            ok(s > 1.03 and d_sem > 3, "prévia com zoom de verdade", f"escala {s:.3f}, dif sem zoom {d_sem:.1f}")
            ok(d_esp < 6, "prévia = quadro ampliado pela curva no rosto", f"dif {d_esp:.1f}")
            from PIL import Image
            Image.fromarray(np.concatenate([sem, prev], 1).astype(np.uint8)).save(saida + "previa_sem_com.jpg")
            # desfoque de movimento: no começo da entrada (parte rápida) a prévia muda com ele ligado × desligado
            zr = next((x for x in L if x["v"]["ent"] > 0.2), None)
            T2 = None
            if zr:
                T2 = round((zr["st"] + zr["v"]["ent"] * 0.25) * 30) / 30 + 1 / 60
                com_mb = png(pg.evaluate(MONITOR, T2))
                pg.evaluate("() => { VE.clips.filter(c => c.az).forEach(c => { c.fx[0].v.mb = 0; }); veRefresh(); }")
                sem_mb = png(pg.evaluate(MONITOR, T2))
                pg.evaluate("() => { VE.clips.filter(c => c.az).forEach(c => { c.fx[0].v.mb = 1; }); veRefresh(); }")
                ok(all(x["v"].get("mb") == 1 for x in L) and float(np.abs(com_mb - sem_mb).mean()) > 0.3,
                   "desfoque de movimento ligado no zoom rápido", f"dif {float(np.abs(com_mb - sem_mb).mean()):.2f}")
            # 3) exportar CPU e placa: prévia × arquivo no mesmo instante
            for placa in ([False] if a.sem_placa else [False, True]):
                nome = "az_placa" if placa else "az_cpu"
                for f in os.listdir(saida):
                    if f.startswith(nome) and f.endswith(".mp4"):
                        os.remove(saida + f)
                na = pg.evaluate(EXPORTAR, [saida, nome, placa])
                ok(na >= len(L), f"{nome}: camadas de ajuste no plano", str(na))
                pg.wait_for_function("window.__azFim", timeout=1800000, polling=1000)
                fim = pg.evaluate("window.__azFim")
                arq = (fim.get("output_path") or fim.get("path") or "") if isinstance(fim, dict) else ""
                if not arq:
                    arq = next((saida + f for f in os.listdir(saida) if f.startswith(nome) and f.endswith(".mp4")), "")
                ok(bool(arq) and os.path.isfile(arq), f"{nome}: exportou", (fim or {}).get("error", "") if isinstance(fim, dict) else "")
                if placa:
                    ok(not pg.evaluate("window.__azCpu"), f"{nome}: montado na placa", pg.evaluate("window.__azCpu"))
                if not arq or not os.path.isfile(arq):
                    continue
                exp = quadro(arq, T)
                dpv = float(np.abs(prev - exp).mean())
                ok(dpv < 10, f"{nome}: prévia × arquivo no meio do zoom", f"dif {dpv:.1f}")
                Image.fromarray(np.concatenate([prev, exp], 1).astype(np.uint8)).save(saida + f"{nome}_previa_arquivo.jpg")
                if T2 is not None:
                    exp2 = quadro(arq, T2)
                    d2 = float(np.abs(com_mb - exp2).mean())
                    ok(d2 < 10, f"{nome}: prévia × arquivo no zoom rápido (com desfoque)", f"dif {d2:.1f}")
            # 4) Muito + Seco: troca os de antes, todos secos (entram e saem no corte)
            n2 = pg.evaluate("VEAZ_API.gerar({ qtd: 'muito', estilo: 'seco', forca: 'forte' }).then(l => (l || []).length)")
            L2 = pg.evaluate("VEAZ_API.lista()")
            ok(n2 > n and len(L2) == n2, "Muito + Seco: mais zooms, os antigos trocados", f"{n2}")
            ok(all(z["est"] == "seco" and z["v"]["ent"] == 0 and z["v"]["sai"] == 0 for z in L2), "Seco: entrada e saída no corte")
            pg.evaluate("VEAZ_API.remover()")
            ok(not pg.evaluate("VEAZ_API.lista().length"), "Remover tira os autozooms")
            pg.evaluate("veUndo()")
            ok(pg.evaluate("VEAZ_API.lista().length") == n2, "Ctrl+Z traz de volta")
    finally:
        if app:
            app.terminate()
    print("\n" + ("TUDO OK" if not erros else f"{len(erros)} FALHA(S): " + "; ".join(erros)))
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
