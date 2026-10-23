"""Estabilizador (editor-estab.js + Functions/estabilizador.py) no app de verdade: abre um trecho tremido real, aplica o
efeito, espera a cópia estabilizada entrar no clipe, muda o corte (cópia nova), tira o efeito (volta à original), Ctrl+Z
(volta a estabilizada sem analisar de novo), exporta e mede o tremor do arquivo final contra o original.

    py -3.13 testes/teste_estab.py [--video trecho.mp4] [--porta 9333] [--sem-abrir]

Vídeo padrão: D:/kanivete_testes/estab/saida/C0715_orig.mp4 (6 s, 1080p, câmera na mão; gerado por
D:/kanivete_testes/scripts/estab_reais.py).
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

BASE = "D:/kanivete_testes/"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""), flush=True)
    if not c:
        erros.append(nome)


def tremor(p, w=640):
    """alta frequência do caminho (semelhança robusta no miolo) — px a 640 de largura"""
    cap = cv2.VideoCapture(p)
    fr = []
    while True:
        k, f = cap.read()
        if not k:
            break
        fr.append(cv2.cvtColor(cv2.resize(f, (w, w * f.shape[0] // f.shape[1]), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY))
    h = fr[0].shape[0]
    m = np.zeros_like(fr[0]); m[int(h * .15):int(h * .85), int(w * .15):int(w * .85)] = 255
    acc, out = np.zeros(2), [np.zeros(2)]
    for a, b in zip(fr, fr[1:]):
        p0 = cv2.goodFeaturesToTrack(a, 600, 0.01, 8, mask=m)
        d = np.zeros(2)
        if p0 is not None and len(p0) > 10:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(a, b, p0, None, winSize=(21, 21), maxLevel=3)
            g = st.ravel() == 1
            if g.sum() > 10:
                M, _ = cv2.estimateAffinePartial2D(p0[g], p1[g], method=cv2.RANSAC, ransacReprojThreshold=1.0)
                if M is not None:
                    d = M[:, 2]
        acc = acc + d
        out.append(acc.copy())
    tr = np.array(out)
    k = 15
    s = np.stack([np.convolve(np.pad(tr[:, i], k // 2, mode="edge"), np.ones(k) / k, mode="valid")[:len(tr)] for i in range(2)], 1)
    return float(np.sqrt(((tr - s) ** 2).sum(1).mean()))


ESTADO = """() => {
    const i = VE.clips.findIndex(c => !veIsAudio(c) && !veIsImage(c)), c = VE.clips[i], m = veMediaOf(c), f = veStFx(c);
    const nota = f && document.querySelector(`#ve-fxc [data-fx="${f.id}"] .ve-fxe-nota`);
    const vis = nota ? (() => { const r = nota.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(nota).visibility !== 'hidden'; })() : false;
    return { i, m: m.id, stDe: m.stDe == null ? null : m.stDe, stCh: m.stCh || '', pronta: m.stDe != null && veStPronta(m), s: c.s, e: c.e,
             off: veStOff(m), jobs: VEST.jobs.size, fx: !!f, nota: nota ? nota.textContent : '', notaVis: vis, path: m.path || '' };
}"""

EXPORTAR = """async ([dest, nome]) => {
    window.__stFim = null;
    if (!window.__stHook) {
        const orig = window.veOnExport;
        window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} } if (e && e.done) window.__stFim = e; try { orig(ev); } catch (x) {} };
        window.__stHook = true;
    }
    VE._txPng = null;
    const plano = veExportPlan(true), lim = veMasterLim();
    window.pywebview.api.video_cutter_export(VE.path, plano.base, 'mp4', 'medium', 'original', false, dest, false,
        plano.camadas, plano.audio, plano.dur, lim ? [...plano.mix, { master: lim }] : plano.mix, veTxExport(plano.faixa),
        [VE.seqW, VE.seqH], { nome });
    return plano.camadas.map(c => c.path || '');
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=BASE + "estab/saida/C0715_orig.mp4")
    ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--sem-abrir", action="store_true")
    a = ap.parse_args()
    vid = a.video.replace("\\", "/")
    if not os.path.isfile(vid):
        print("falta o vídeo de teste:", vid)
        return 2
    saida = BASE + "estab/app/"
    os.makedirs(saida, exist_ok=True)
    app = None
    if not a.sem_abrir:
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
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_estabilizar) && typeof VEST === 'object'", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            if pg.evaluate("VE.ready ? (VE.path || '').replace(/\\\\/g, '/') : ''") != vid:
                pg.evaluate("p => veOpenPath(p)", vid)
                pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            pg.evaluate("window.vePrSegEm = () => null; window.vePrAutoTick = () => {};")
            e0 = pg.evaluate(ESTADO)
            # 1) aplica o efeito no clipe de vídeo (como o duplo clique no painel Efeitos)
            pg.evaluate("i => { VE.sel = i; veFxAdd(i, 'estab'); VEST.mudouEm = 0; }", e0["i"])
            t0 = time.time()
            pg.wait_for_function("(() => { const c = VE.clips.find(c => !veIsAudio(c) && !veIsImage(c)); const m = veMediaOf(c); return m.stDe != null && veStPronta(m); })()",
                                 timeout=600000, polling=500)
            e1 = pg.evaluate(ESTADO)
            ok(e1["stDe"] == e0["m"], "clipe passou a usar a cópia estabilizada", f"{time.time() - t0:.1f} s, {os.path.basename(e1['path'])}")
            ok(abs((e1["s"] + e1["off"]) - e0["s"]) < 1e-3 and abs((e1["e"] + e1["off"]) - e0["e"]) < 1e-3, "mesmo trecho da original",
               f"s {e0['s']:.3f} → {e1['s']:.3f}+{e1['off']:.3f}")
            pg.wait_for_timeout(1500)
            e1 = pg.evaluate(ESTADO)
            ok(e1["notaVis"] and "Estabilizado" in e1["nota"], "status visível nos Controles de efeito", e1["nota"])
            pg.screenshot(path=saida + "controles.png")
            # 2) muda o corte máximo → cópia nova
            pg.evaluate("""() => { const c = VE.clips.find(c => !veIsAudio(c) && !veIsImage(c)), f = veStFx(c);
                vePushHistory(); c.fx = c.fx.map(x => x.id === f.id ? { ...x, v: { ...x.v, corte: 5 } } : x); VEST.mudouEm = 0; veRefresh(); }""")
            pg.wait_for_function("(() => { const c = VE.clips.find(c => !veIsAudio(c) && !veIsImage(c)); const m = veMediaOf(c); return m.stDe != null && /1\\.05/.test(m.stCh) && veStPronta(m); })()",
                                 timeout=600000, polling=500)
            pg.wait_for_timeout(1500)
            e2 = pg.evaluate(ESTADO)
            ok(e2["m"] != e1["m"] and e2["jobs"] == 0 and "Estabilizado" in e2["nota"], "corte 5%: cópia nova no clipe", f"{e2['nota']} · trabalhos {e2['jobs']}")
            # 3) tira o efeito → original
            pg.evaluate("""() => { const c = VE.clips.find(c => !veIsAudio(c) && !veIsImage(c));
                vePushHistory(); c.fx = c.fx.filter(f => f.t !== 'estab'); if (!c.fx.length) delete c.fx; veRefresh(); }""")
            pg.wait_for_timeout(2500)
            e3 = pg.evaluate(ESTADO)
            ok(e3["m"] == e0["m"] and abs(e3["s"] - e0["s"]) < 1e-3, "sem o efeito: volta à mídia original", f"m {e3['m']} s {e3['s']:.3f}")
            # 4) Ctrl+Z: o efeito volta e o vigia reusa a cópia pronta (sem analisar)
            pg.evaluate("veUndo()")
            pg.wait_for_timeout(2500)
            e4 = pg.evaluate(ESTADO)
            ok(e4["m"] == e2["m"] and e4["jobs"] == 0, "Ctrl+Z: volta a cópia estabilizada sem nova análise", f"m {e4['m']}")
            pg.evaluate("veUndo()")   # de volta ao corte de 10%
            pg.wait_for_timeout(2500)
            e5 = pg.evaluate(ESTADO)
            ok(e5["m"] == e1["m"] and e5["jobs"] == 0, "Ctrl+Z de novo: corte 10% com a 1ª cópia", f"m {e5['m']} · {e5['nota']}")
            # 5) exporta e mede o tremor
            for f in os.listdir(saida):
                if f.startswith("estab_export"):
                    os.remove(saida + f)
            camadas = pg.evaluate(EXPORTAR, [saida, "estab_export"])
            ok(any("estab_" in c for c in camadas), "exportação usa a cópia estabilizada", str([os.path.basename(c) for c in camadas]))
            pg.wait_for_function("window.__stFim", timeout=900000, polling=1000)
            arq = next((saida + f for f in os.listdir(saida) if f.startswith("estab_export") and f.endswith(".mp4")), "")
            ok(bool(arq), "exportou", arq)
            if arq:
                t_o, t_e = tremor(vid), tremor(arq)
                ok(t_e < t_o * 0.6, "arquivo exportado mais estável", f"tremor {t_o:.2f} → {t_e:.2f}")
    finally:
        if app:
            app.kill()
    print("RESULTADO:", "ok" if not erros else f"{len(erros)} falha(s): {erros}")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
