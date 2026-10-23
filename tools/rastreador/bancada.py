"""Bancada do rastreador: gabarito sintético. Tomadas de tripé tremidas com tremor CONHECIDO (bancada3 do
estabilizador: D:/kanivete_testes/estab/sint/<n>_tremido.mp4). Um ponto do fundo parado vai, no quadro t, para S_t(p0).
Escolhe 5 caixas em cantos fortes do fundo que não mudam na tomada parada, rastreia 8 s e mede o erro (px a 1080p).
uso: py -3.13 tools/rastreador/bancada.py [modo pos|rot|esc] [lado da caixa]"""
import os, sys, time
import numpy as np, cv2
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ); sys.path.insert(0, os.path.join(RAIZ, "tools", "estabilizador"))
sys.stdout.reconfigure(encoding="utf-8")
from Functions import rastreador as R
from Functions import estabilizador as E
import importlib.util
spec = importlib.util.spec_from_file_location("b3", os.path.join(RAIZ, "tools/estabilizador/bancada3.py"))
src = open(spec.origin, encoding="utf-8").read().split("\nres = []")[0]
B3 = {"__file__": spec.origin}; sys_argv = sys.argv; sys.argv = [sys.argv[0]]; exec(src, B3); sys.argv = sys_argv
O = "D:/kanivete_testes/estab/sint"
MODO = sys.argv[1] if len(sys.argv) > 1 else "pos"
LADO = int(sys.argv[2]) if len(sys.argv) > 2 else 60

def caixas(base_p, n=5):
    cap = cv2.VideoCapture(base_p); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY))
    g = fr[0]; H, W = g.shape
    pts = cv2.goodFeaturesToTrack(g, 200, 0.05, 150).reshape(-1, 2)
    bons = []
    for x, y in pts:
        x0, y0 = int(x - LADO / 2), int(y - LADO / 2)
        if x0 < 200 or y0 < 150 or x0 + LADO > W - 200 or y0 + LADO > H - 150: continue
        tpl = g[y0:y0 + LADO, x0:x0 + LADO]
        ncc = min(float(cv2.matchTemplate(f[y0:y0 + LADO, x0:x0 + LADO], tpl, cv2.TM_CCOEFF_NORMED)[0, 0]) for f in fr[::10])
        if ncc > 0.9: bons.append((x, y))
        if len(bons) >= n: break
    return bons, len(fr)

def congelado(n, sem):
    """1º quadro da tomada parada repetido 8 s com o tremor conhecido (gabarito exato: nada se mexe sozinho)"""
    import subprocess
    o = f"{O}/{n}_congelado_tremido.mp4"
    cap = cv2.VideoCapture(f"{O}/{n}_base.mp4"); ok, f = cap.read()
    cv2.imwrite(f"{O}/{n}_congelado.png", f)
    N = 240; S = B3["tremor_mao"](N, 30, sem)
    if not os.path.isfile(o):
        p = subprocess.Popen([B3["FF"], "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", "1920x1080", "-r", "30", "-i", "-",
                              "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-pix_fmt", "yuv420p", o], stdin=subprocess.PIPE)
        rng = np.random.default_rng(sem)
        for s_ in S:
            q = cv2.warpAffine(f, E._sim(*s_, 960, 540)[:2], (1920, 1080), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
            q = np.clip(q.astype(np.float32) + rng.normal(0, 2, q.shape), 0, 255).astype(np.uint8)   # ruído de sensor
            p.stdin.write(q.tobytes())
        p.stdin.close(); p.wait()
    return o, S

for i, (n, _) in enumerate(B3["BASES"]):
    base_p = f"{O}/{n}_base.mp4"
    bons, N = caixas(base_p)
    tre, S = congelado(n, i + 1); N = len(S)
    erros, fins, tt = [], [], 0
    for (x, y) in bons:
        M0 = E._sim(*S[0], 960, 540); p = M0 @ [x, y, 1]
        t0 = time.time()
        res = R.rastrear(tre, 0, (N - 1) / 30, [p[0], p[1], LADO, LADO], MODO, taxa=30)
        tt += time.time() - t0
        gt = np.array([(E._sim(*S[k], 960, 540) @ [x, y, 1])[:2] for k in range(len(res))])
        e = np.linalg.norm(np.array([[r[1], r[2]] for r in res]) - gt, axis=1)
        erros.append(e.mean()); fins.append(e[-1])
    print(n, MODO, "caixas", len(bons), "erro médio", np.round(erros, 2), "fim", np.round(fins, 2), f"{tt / max(1, len(bons)) / N * 1000:.1f} ms/quadro", flush=True)
