"""Rastreador de movimento (editor-rastro.js + Functions/rastreador.py) no app de verdade, com GABARITO: um quadro
parado tremido com tremor conhecido (tools/rastreador/bancada.py gera D:/kanivete_testes/estab/sint/3129_congelado_tremido.mp4).
Abre o vídeo, põe uma cor sólida pequena na V2, abre o rastreador, caixa num canto forte, rastreia para frente, confere
o erro do caminho, aplica num Nulo novo e na cor sólida (quadros-chave seguem o ponto), rastreia para trás do meio,
print do monitor e exportação (a cor sólida acompanha o ponto no arquivo).

    py -3.13 testes/teste_rastro.py [--porta 9341] [--sem-abrir]
"""
import argparse
import os
import subprocess
import sys
import time
import urllib.request

import numpy as np
import cv2

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from Functions import estabilizador as E  # noqa: E402

SINT = "D:/kanivete_testes/estab/sint/"
VID = SINT + "3129_congelado_tremido.mp4"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""), flush=True)
    if not c:
        erros.append(nome)


def tremor_mao():
    src = open(os.path.join(RAIZ, "tools/estabilizador/bancada3.py"), encoding="utf-8").read().split("\nres = []")[0]
    g = {"__file__": os.path.join(RAIZ, "tools/estabilizador/bancada3.py")}
    argv = sys.argv
    sys.argv = [argv[0]]
    exec(src, g)
    sys.argv = argv
    return g["tremor_mao"](240, 30, 2)   # 3129 é a 2ª base da bancada (semente 2)


def gabarito():
    f = cv2.imread(SINT + "3129_congelado.png", cv2.IMREAD_GRAYSCALE)
    pts = cv2.goodFeaturesToTrack(f, 50, 0.05, 100).reshape(-1, 2)
    p0 = next(p for p in pts if 400 < p[0] < 1520 and 300 < p[1] < 780)
    S = tremor_mao()
    return np.array([(E._sim(*s, 960, 540) @ [p0[0], p0[1], 1])[:2] for s in S])


MONTAR = """() => {
    if (VE.playing) veStop();
    const iv = VE.clips.findIndex(c => !veIsAudio(c) && !veIsImage(c));
    const m = vePjAddMidia({ kind: 'cor', name: 'Cor sólida', fill: '#ff00ff', nome: 'alvo rastro' }, null);
    veEnsureTrackIndex(1);
    const c = { tr: 1, st: 0, s: 0, e: VE.clips[iv].e - VE.clips[iv].s, m: m.id };
    c.p = { ...veDefProps(c), sc: 4 };
    VE.clips.push(c);
    veRefresh();
    return { iv, ic: VE.clips.indexOf(c), fps: VE.fps };
}"""

EXPORTAR = """async ([dest, nome]) => {
    window.__rtFim = null;
    if (!window.__rtHook) {
        const orig = window.veOnExport;
        window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} } if (e && e.done) window.__rtFim = e; try { orig(ev); } catch (x) {} };
        window.__rtHook = true;
    }
    VE._txPng = null;
    if (VE.clips.some(veTxPrecisa)) await veTxPngs();
    const plano = veExportPlan(true), lim = veMasterLim();
    window.pywebview.api.video_cutter_export(VE.path, plano.base, 'mp4', 'medium', 'original', !!window.__rtPlaca, dest, false,
        plano.camadas, plano.audio, plano.dur, lim ? [...plano.mix, { master: lim }] : plano.mix, veTxExport(plano.faixa),
        [VE.seqW, VE.seqH], { nome });
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=9341)
    ap.add_argument("--sem-abrir", action="store_true")
    ap.add_argument("--placa", action="store_true", help="exporta pela placa (modo placa)")
    a = ap.parse_args()
    if not os.path.isfile(VID):
        print("falta o vídeo do gabarito: rode py -3.13 tools/rastreador/bancada.py")
        return 2
    GT = gabarito()
    saida = "D:/kanivete_testes/rastro/"
    os.makedirs(saida, exist_ok=True)
    app = None
    if not a.sem_abrir:
        B = "D:/kanivete_testes/"
        env = dict(os.environ, APPDATA=B + "appdata", TEMP=B + "tmp", TMP=B + "tmp", LOCALAPPDATA=B + "localappdata")
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
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_rastrear) && !!window.VERT_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            pg.evaluate("p => veOpenPath(p)", VID)
            pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            pg.evaluate("window.vePrSegEm = () => null; window.vePrAutoTick = () => {};")
            info = pg.evaluate(MONTAR)
            iv, ic = info["iv"], info["ic"]
            # 1) abre o rastreador no quadro 0, caixa no ponto do gabarito, rastreia para frente
            pg.evaluate("() => veSeek(0)")
            pg.evaluate("i => VERT_API.abrir(i)", iv)
            vis = pg.evaluate("(() => { const b = document.querySelector('.ve-rt-barra'); if (!b) return false; const r = b.getBoundingClientRect(); return !b.hidden && r.width > 100 && r.height > 10; })()")
            ok(vis, "barra do rastreador visível no monitor")
            pg.evaluate("([x, y]) => VERT_API.caixa(x, y, 60, 60)", [float(GT[0][0]), float(GT[0][1])])
            t0 = time.time()
            pg.evaluate("VERT_API.rastrear(1)")
            pg.wait_for_timeout(500)
            pg.wait_for_function("!VERT_API.rodando()", timeout=300000, polling=300)
            dt = time.time() - t0
            rt = pg.evaluate("VERT_API.dados()")
            pts = np.array(rt["pts"])
            ok(len(pts) >= 235, "rastreou o clipe inteiro", f"{len(pts)} quadros em {dt:.1f} s")
            k = np.clip(np.round(pts[:, 0] * info["fps"]).astype(int), 0, len(GT) - 1)
            err = np.linalg.norm(pts[:, 1:3] - GT[k], axis=1)
            ok(err.mean() < 0.5 and err.max() < 2, "caminho bate com o gabarito", f"erro médio {err.mean():.2f} px, máx {err.max():.2f}")
            pg.evaluate("() => veSeek(3)")
            pg.wait_for_timeout(800)
            pg.screenshot(path=saida + "monitor.png")
            # 2) aplica num Nulo novo: a posição do Nulo = o ponto (vídeo 1920×1080 na sequência 1920×1080)
            pg.evaluate("() => veSeek(0)")
            inulo = pg.evaluate("VERT_API.aplicar('nulo')")
            amostra = pg.evaluate("""i => { const c = VE.clips[i]; return [0, 1, 2.5, 4, 6, 7.9].map(T => { const p = veProps(c, T); return [T, p.x, p.y]; }); }""", inulo)
            e_n = [np.linalg.norm(np.array([x, y]) - GT[min(len(GT) - 1, int(round(T * info["fps"])))]) for T, x, y in amostra]
            nk = pg.evaluate("i => VE.clips[i].k.x.length", inulo)
            ok(max(e_n) < 0.8, "Nulo segue o ponto", f"erro máx {max(e_n):.2f} px, {nk} quadros-chave")
            # 3) aplica na cor sólida (V2): mantém a distância do quadro da agulha
            pg.evaluate("() => veSeek(0)")
            p0 = pg.evaluate("i => { const p = veProps(VE.clips[i], 0); return [p.x, p.y]; }", ic)
            pg.evaluate("i => VERT_API.aplicar(i)", ic)
            am2 = pg.evaluate("""i => { const c = VE.clips[i]; return [0, 2.5, 6].map(T => { const p = veProps(c, T); return [T, p.x, p.y]; }); }""", ic)
            off = np.array(p0) - GT[0]
            e_c = [np.linalg.norm(np.array([x, y]) - (GT[int(round(T * info["fps"]))] + off)) for T, x, y in am2]
            ok(max(e_c) < 0.8, "cor sólida segue o ponto mantendo a distância", f"erro máx {max(e_c):.2f} px")
            # 4) Ctrl+Z tira os quadros-chave da cor sólida
            pg.evaluate("veUndo()")
            ok(not pg.evaluate("i => !!(VE.clips[i].k && VE.clips[i].k.x)", ic), "Ctrl+Z desfaz o Aplicar")
            pg.evaluate("veRedo()")
            # 5) para trás a partir do meio (caixa nova no quadro 120)
            pg.evaluate("() => veSeek(4)")
            pg.wait_for_timeout(300)
            pg.evaluate("([x, y]) => VERT_API.caixa(x, y, 60, 60)", [float(GT[120][0]), float(GT[120][1])])
            pg.evaluate("VERT_API.rastrear(-1)")
            pg.wait_for_timeout(500)
            pg.wait_for_function("!VERT_API.rodando()", timeout=300000, polling=300)
            pts2 = np.array(pg.evaluate("VERT_API.dados()")["pts"])
            antes = pts2[pts2[:, 0] < 4 - 1e-3]
            k2 = np.round(antes[:, 0] * info["fps"]).astype(int)
            e2 = np.linalg.norm(antes[:, 1:3] - GT[k2], axis=1)
            ok(len(antes) >= 115 and e2.mean() < 0.5, "para trás do meio", f"{len(antes)} quadros, erro médio {e2.mean():.2f} px")
            # 6) exportação: a cor sólida (magenta) acompanha o ponto no arquivo
            pg.evaluate("VERT_API.fechar()")
            for f in os.listdir(saida):
                if f.startswith("rastro_export"):
                    os.remove(saida + f)
            pg.evaluate("p => { window.__rtPlaca = p; }", a.placa)
            pg.evaluate(EXPORTAR, [saida, "rastro_export"])
            pg.wait_for_function("window.__rtFim", timeout=900000, polling=1000)
            arq = next((saida + f for f in os.listdir(saida) if f.startswith("rastro_export") and f.endswith(".mp4")), "")
            ok(bool(arq), "exportou", arq)
            if arq:
                cap = cv2.VideoCapture(arq)
                # lido em sequência (a busca do OpenCV erra 1 quadro); a exportação põe camadas em pixel inteiro:
                # tolera o meio pixel de arredondamento por eixo
                C = []
                while True:
                    k_, q = cap.read()
                    if not k_:
                        break
                    mg = (q[:, :, 2] > 200) & (q[:, :, 0] > 200) & (q[:, :, 1] < 60)
                    ys, xs = np.nonzero(mg)
                    C.append([xs.mean() + 0.5, ys.mean() + 0.5] if len(xs) else [np.nan, np.nan])
                C = np.array(C)
                n = min(len(C), len(GT)) - 2
                r = C[2:n] - (GT[2:n] + off)
                ok(not np.isnan(r).any() and np.abs(r).max() < 1.6, "no arquivo a cor sólida acompanha o ponto",
                   f"{len(C)} quadros, desvio médio {np.linalg.norm(r, axis=1).mean():.2f} px, máx por eixo {np.abs(r).max():.2f}")
    finally:
        if app:
            app.kill()
    print("RESULTADO:", "ok" if not erros else f"{len(erros)} falha(s): {erros}")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
