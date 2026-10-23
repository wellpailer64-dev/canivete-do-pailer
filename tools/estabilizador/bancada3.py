"""Bancada 3 do estabilizador: tremor SINTÉTICO com gabarito. Tomadas de tripé (gente se mexendo, fundo parado)
recebem um tremor de mão conhecido (1,5–7 Hz, giro, um pan lento de propósito); cada estabilizador é medido
registrando a saída contra a tomada parada (o fundo é o mesmo): tremor que sobrou (alta frequência, px a 1080p e
décimos de grau) e zoom. Mede também tomadas tremidas reais (sem gabarito: pela medida da bancada 2).
uso: py -3.13 tools/estabilizador/bancada3.py [suavidade] [zoom_max]   (VERSOES=v3,vidstab)"""
import os, sys, json, time, subprocess
import numpy as np, cv2
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from Functions import estabilizador as E
from arqs import FF

O = "D:/kanivete_testes/estab/sint"; os.makedirs(O, exist_ok=True)
B3 = "D:/01 - ALL IN CLOUD - HD PAILER/01 - PANDA LAB/COLAB/DIEGO PORFÍRIO/CULTSP PRO/03 - BANANAL CULTURA E GASTRONOMIA/BRUTOS"
BASES = [(3063, 2.0), (3129, 2.0), (3060, 2.0)]
SUAV = float(sys.argv[1]) if len(sys.argv) > 1 else 50
ZMAX = float(sys.argv[2]) if len(sys.argv) > 2 else 1.10
VERSOES = os.environ.get("VERSOES", "vidstab,v3").split(",")
W, H, DUR = 1920, 1080, 8.0


def tremor_mao(n, fps, sem=1):
    r = np.random.default_rng(sem); t = np.arange(n) / fps
    def onda(amp):
        s = sum(r.uniform(.5, 1) * np.sin(2 * np.pi * r.uniform(1.5, 7) * t + r.uniform(0, 6.3)) for _ in range(4))
        s += np.convolve(r.normal(0, 1, n), np.ones(3) / 3, "same") * .6
        return s / s.std() * amp
    pan = np.linspace(0, 90, n) * (0.5 - 0.5 * np.cos(np.pi * t / t[-1]))[:n] / 90 * 90   # pan lento de 90 px
    return np.stack([onda(14) + pan, onda(10), np.radians(onda(0.5)), onda(0.004)], 1)


def base(n, a):
    o = f"{O}/{n}_base.mp4"
    if not os.path.isfile(o):
        subprocess.run([FF, "-v", "error", "-y", "-ss", str(a), "-t", str(DUR), "-i", f"{B3}/20260928_A7c{n}.MP4", "-an",
                        "-vf", f"fps=30,scale={W}:{H}", "-c:v", "libx264", "-crf", "14", "-preset", "fast", o], check=True)
    return o


def tremer(src, sem):
    o = src.replace("_base", "_tremido")
    cap = cv2.VideoCapture(src); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(f)
    S = tremor_mao(len(fr), 30, sem)
    if not os.path.isfile(o):
        p = subprocess.Popen([FF, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "30", "-i", "-",
                              "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-pix_fmt", "yuv420p", o], stdin=subprocess.PIPE)
        for f, s in zip(fr, S):
            M = E._sim(*s, W / 2, H / 2)
            p.stdin.write(cv2.warpAffine(f, M[:2], (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT).tobytes())
        p.stdin.close(); p.wait()
    return o


def vidstab(src):
    o = src.replace("_tremido", "_vidstab")
    if os.path.isfile(o): return o, 0
    trf = src.replace(".mp4", ".trf").replace("\\", "/").replace(":", "\\:")
    t0 = time.time()
    subprocess.run([FF, "-v", "error", "-y", "-i", src, "-vf", f"vidstabdetect=shakiness=8:accuracy=15:result='{trf}'", "-f", "null", "-"], check=True)
    subprocess.run([FF, "-v", "error", "-y", "-i", src, "-vf", f"vidstabtransform=input='{trf}':smoothing=20:optzoom=1:zoomspeed=0.25",
                    "-c:v", "libx264", "-crf", "14", "-preset", "fast", o], check=True)
    return o, time.time() - t0


def nosso(src, tag):
    o = src.replace("_tremido", f"_{tag}")
    t0 = time.time()
    an = E.analisar(src, 0, 99)
    Ms, P, z = E.caminho(an, SUAV, ZMAX)
    if os.path.isfile(o): os.remove(o)
    E.renderizar(src, an, E._quadros_finais(an, Ms, P, z), o)
    return o, time.time() - t0


def ler(p, w=960):
    cap = cv2.VideoCapture(p); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(cv2.cvtColor(cv2.resize(f, (w, w * 9 // 16), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY))
    return fr


def gabarito(base_p, saida_p):
    """registra cada quadro da saída contra o mesmo quadro da tomada parada → (tremor px@1080, tremor décimos de grau,
    zoom mediano)"""
    A, B = ler(base_p), ler(saida_p)
    orb = cv2.ORB_create(3000); bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    ps = []
    for a, b in zip(A, B):
        k1, d1 = orb.detectAndCompute(a, None); k2, d2 = orb.detectAndCompute(b, None)
        M = None
        if d1 is not None and d2 is not None:
            mt = bf.match(d1, d2)
            if len(mt) >= 20:
                M, _ = cv2.estimateAffinePartial2D(np.float32([k1[m.queryIdx].pt for m in mt]), np.float32([k2[m.trainIdx].pt for m in mt]),
                                                   method=cv2.RANSAC, ransacReprojThreshold=1.5)
        if M is None:
            ps.append([np.nan] * 4); continue
        ps.append([M[0, 2] * 2, M[1, 2] * 2, np.degrees(np.arctan2(M[1, 0], M[0, 0])) * 10, np.hypot(M[0, 0], M[1, 0])])
    ps = np.array(ps)
    ok = ~np.isnan(ps[:, 0]); ps = ps[ok]
    k = 15; ker = np.ones(k) / k
    s = np.stack([np.convolve(np.pad(ps[:, i], k // 2, mode="edge"), ker, mode="valid")[:len(ps)] for i in range(3)], 1)
    r = ps[:, :3] - s
    return round(float(np.sqrt((r[:, :2] ** 2).sum(1).mean())), 2), round(float(np.sqrt((r[:, 2] ** 2).mean())), 2), round(float(np.median(ps[:, 3])), 3)


res = []
for i, (n, a) in enumerate(BASES):
    b = base(n, a); t = tremer(b, i + 1)
    r = {"base": n, "tremido": gabarito(b, t)}
    for v in VERSOES:
        if v == "vidstab":
            o, tt = vidstab(t)
        else:
            o, tt = nosso(t, f"{v}_s{int(SUAV)}_z{ZMAX:.2f}")
        r[v] = gabarito(b, o); r["t_" + v] = round(tt, 1)
    res.append(r); print(r, flush=True)
json.dump(res, open(f"{O}/resultado.json", "w"), indent=1)
