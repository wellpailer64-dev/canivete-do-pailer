"""Bancada do estabilizador: trechos tremidos reais → (a) vidstab do ffmpeg, (b) protótipo OpenCV (fundo robusto por
RANSAC, caminho suavizado, zoom mínimo único). Mede tremor residual (alta frequência), zoom/corte e tempo.
uso: py -3.13 bancada.py"""
import os, sys, json, time, subprocess
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # arqs.py: caminhos dos brutos de teste (CULTSP)
from arqs import arq, FF
sys.stdout.reconfigure(encoding="utf-8")
O = "D:/kanivete_testes/estab/saida"; os.makedirs(O, exist_ok=True)
TRECHOS = [(3068, 0.0, 6.0), (3094, 4.0, 6.0), (1159, 0.0, 6.0), (3058, 4.0, 6.0)]
W, H = 1920, 1080
ZLIM = float(os.environ.get("ZLIM", "1.10"))


def cortar(n, a, d):
    o = f"{O}/{n}_orig.mp4"
    if not os.path.isfile(o):
        subprocess.run([FF, "-v", "error", "-y", "-ss", str(a), "-t", str(d), "-i", arq(n), "-an", "-vf", f"scale={W}:{H}",
                        "-c:v", "libx264", "-crf", "16", "-preset", "fast", o], check=True)
    return o


def ler(p, w=480):
    cap = cv2.VideoCapture(p); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(cv2.resize(f, (w, int(f.shape[0] * w / f.shape[1]))))
    return fr


def tremor(p):
    """RMS da parte de alta frequência do movimento quadro a quadro (px a 480 de largura) — menor = mais estável"""
    fr = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32) for f in ler(p)]
    h, w = fr[0].shape; win = cv2.createHanningWindow((w, h), cv2.CV_32F)
    d = np.array([cv2.phaseCorrelate(a, b, win)[0] for a, b in zip(fr, fr[1:])])
    traj = np.cumsum(d, axis=0)
    k = 15; ker = np.ones(k) / k
    suave = np.stack([np.convolve(np.pad(traj[:, i], k // 2, mode="edge"), ker, mode="valid")[:len(traj)] for i in range(2)], 1)
    return float(np.sqrt(((traj - suave) ** 2).sum(1).mean()))


def vidstab(src):
    o = src.replace("_orig", "_vidstab"); trf = src.replace(".mp4", ".trf").replace("\\", "/")
    t0 = time.time()
    # caminho do .trf: o filtro do ffmpeg quer o ":" escapado
    trf_esc = trf.replace(":", "\\:")
    subprocess.run([FF, "-v", "error", "-y", "-i", src, "-vf", f"vidstabdetect=shakiness=8:accuracy=15:result='{trf_esc}'", "-f", "null", "-"], check=True)
    subprocess.run([FF, "-v", "error", "-y", "-i", src, "-vf", f"vidstabtransform=input='{trf_esc}':smoothing=20:optzoom=1:zoomspeed=0.25,unsharp=5:5:0.6",
                    "-c:v", "libx264", "-crf", "16", "-preset", "fast", o], check=True)
    return o, time.time() - t0


def nosso(src, raio=20):
    """movimento do fundo: cantos + LK, afim parcial (translação+rotação+escala) por RANSAC; caminho suavizado por
    média gaussiana; correção = suave − real; um zoom único que esconde todas as bordas"""
    t0 = time.time()
    cap = cv2.VideoCapture(src); fps = cap.get(cv2.CAP_PROP_FPS); quadros = []
    while True:
        ok, f = cap.read()
        if not ok: break
        quadros.append(f)
    esc = 0.5
    cinza = [cv2.cvtColor(cv2.resize(f, None, fx=esc, fy=esc), cv2.COLOR_BGR2GRAY) for f in quadros]
    tr = [np.zeros(3)]
    for a, b in zip(cinza, cinza[1:]):
        p0 = cv2.goodFeaturesToTrack(a, 400, 0.01, 12)
        dx = dy = da = 0.0
        if p0 is not None and len(p0) >= 8:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(a, b, p0, None, winSize=(21, 21), maxLevel=3)
            g = st.ravel() == 1
            if g.sum() >= 8:
                m, inl = cv2.estimateAffinePartial2D(p0[g], p1[g], method=cv2.RANSAC, ransacReprojThreshold=2.0)
                if m is not None:
                    dx, dy, da = m[0, 2] / esc, m[1, 2] / esc, np.arctan2(m[1, 0], m[0, 0])
        tr.append(np.array([dx, dy, da]))
    traj = np.cumsum(np.array(tr), axis=0)
    x = np.arange(-raio, raio + 1); ker = np.exp(-x ** 2 / (2 * (raio / 2.5) ** 2)); ker /= ker.sum()
    suave = np.stack([np.convolve(np.pad(traj[:, i], raio, mode="edge"), ker, mode="valid") for i in range(3)], 1)
    corr = suave - traj
    zlim = ZLIM
    mx, my = W * (zlim - 1) / 2 * 0.85, H * (zlim - 1) / 2 * 0.85
    corr[:, 0] = np.clip(corr[:, 0], -mx, mx); corr[:, 1] = np.clip(corr[:, 1], -my, my)
    corr[:, 2] = np.clip(corr[:, 2], -0.02, 0.02)
    zmax = zlim
    o = src.replace("_orig", "_nosso")
    vw = cv2.VideoWriter(o + ".avi", cv2.VideoWriter_fourcc(*"MJPG"), fps, (W, H))
    Z = cv2.getRotationMatrix2D((W / 2, H / 2), 0, zmax); Z = np.vstack([Z, [0, 0, 1]])
    for f, (dx, dy, da) in zip(quadros, corr):
        m = np.array([[np.cos(da), -np.sin(da), dx], [np.sin(da), np.cos(da), dy], [0, 0, 1]])
        vw.write(cv2.warpAffine(f, (Z @ m)[:2], (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
    vw.release()
    subprocess.run([FF, "-v", "error", "-y", "-i", o + ".avi", "-c:v", "libx264", "-crf", "16", "-preset", "fast", o], check=True)
    os.remove(o + ".avi")
    return o, time.time() - t0, zmax


res = []
for n, a, d in TRECHOS:
    src = cortar(n, a, d)
    vs = src.replace("_orig", "_vidstab"); tv = 0
    if not os.path.isfile(vs): vs, tv = vidstab(src)
    ns, tn, z = nosso(src)
    r = {"clipe": n, "orig": round(tremor(src), 2), "vidstab": round(tremor(vs), 2), "nosso": round(tremor(ns), 2),
         "zoom_nosso": round(z, 3), "t_vidstab": round(tv, 1), "t_nosso": round(tn, 1)}
    res.append(r); print(r, flush=True)
json.dump(res, open(f"{O}/resultado.json", "w"), indent=1)
