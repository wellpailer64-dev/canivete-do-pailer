"""Bancada 2 do estabilizador: o motor do app (Functions/estabilizador.py) × vidstab do ffmpeg nos mesmos trechos.
Medidas: tremor residual (alta frequência do caminho, por semelhança robusta no miolo da imagem — não engana com a mão
passando) por eixo (posição px a 640, giro em décimos de grau), zoom real (escala mediana saída × original) e tempo.
uso: py -3.13 tools/estabilizador/bancada2.py [suavidade] [zoom_max]"""
import os, sys, json, time
import numpy as np, cv2
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from Functions import estabilizador as E

O = "D:/kanivete_testes/estab/saida"
TRECHOS = [int(x) for x in os.environ.get("TRECHOS", "3068,3094,1159,3058").split(",")]
SUAV = float(sys.argv[1]) if len(sys.argv) > 1 else 50
ZMAX = float(sys.argv[2]) if len(sys.argv) > 2 else 1.10


def ler(p, w=640):
    cap = cv2.VideoCapture(p); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(cv2.cvtColor(cv2.resize(f, (w, int(f.shape[0] * w / f.shape[1])), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY))
    return fr


def caminho_robusto(fr):
    """semelhança quadro a quadro no miolo (70%), RANSAC estrito → caminho acumulado (x, y, θ)"""
    h, w = fr[0].shape
    m = np.zeros_like(fr[0]); m[int(h * .15):int(h * .85), int(w * .15):int(w * .85)] = 255
    acc, out = np.zeros(3), [np.zeros(3)]
    for a, b in zip(fr, fr[1:]):
        p0 = cv2.goodFeaturesToTrack(a, 600, 0.01, 8, mask=m)
        d = np.zeros(3)
        if p0 is not None and len(p0) > 10:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(a, b, p0, None, winSize=(21, 21), maxLevel=3)
            g = st.ravel() == 1
            if g.sum() > 10:
                M, _ = cv2.estimateAffinePartial2D(p0[g], p1[g], method=cv2.RANSAC, ransacReprojThreshold=1.0)
                if M is not None:
                    d = np.array([M[0, 2], M[1, 2], np.degrees(np.arctan2(M[1, 0], M[0, 0])) * 10])
        acc = acc + d; out.append(acc.copy())
    return np.array(out)


def tremor(p):
    tr = caminho_robusto(ler(p))
    k = 15; ker = np.ones(k) / k
    suave = np.stack([np.convolve(np.pad(tr[:, i], k // 2, mode="edge"), ker, mode="valid")[:len(tr)] for i in range(3)], 1)
    r = tr - suave
    return round(float(np.sqrt((r[:, :2] ** 2).sum(1).mean())), 2), round(float(np.sqrt((r[:, 2] ** 2).mean())), 2)


def zoom_real(orig, saida):
    a, b = ler(orig), ler(saida); esc = []
    for i in range(0, min(len(a), len(b)), 10):
        o = cv2.ORB_create(1500)
        k1, d1 = o.detectAndCompute(a[i], None); k2, d2 = o.detectAndCompute(b[i], None)
        if d1 is None or d2 is None: continue
        mt = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2)
        if len(mt) < 20: continue
        M, _ = cv2.estimateAffinePartial2D(np.float32([k1[x.queryIdx].pt for x in mt]), np.float32([k2[x.trainIdx].pt for x in mt]), method=cv2.RANSAC)
        if M is not None: esc.append(np.hypot(M[0, 0], M[1, 0]))
    return round(float(np.median(esc)), 3) if esc else None


res = []
for n in TRECHOS:
    src = f"{O}/{n}_orig.mp4"; vs = f"{O}/{n}_vidstab.mp4"
    out = f"{O}/{n}_v3_s{int(SUAV)}_z{ZMAX:.2f}.mp4"
    t0 = time.time()
    an = E.analisar(src, 0, 99)
    t1 = time.time()
    Ms, P, z = E.caminho(an, SUAV, ZMAX)
    t2 = time.time()
    if os.path.isfile(out): os.remove(out)
    E.renderizar(src, an, E._quadros_finais(an, Ms, P, z), out)
    t3 = time.time()
    r = {"clipe": n, "orig": tremor(src), "vidstab": tremor(vs), "v3": tremor(out), "zoom_v3": round(z, 3),
         "zoom_vidstab": zoom_real(src, vs), "t_an": round(t1 - t0, 1), "t_lp": round(t2 - t1, 2), "t_render": round(t3 - t2, 1)}
    res.append(r); print(r, flush=True)
json.dump(res, open(f"{O}/resultado_v3.json", "w"), indent=1)
