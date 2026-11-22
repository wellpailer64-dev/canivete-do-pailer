"""Rosto sempre no centro (tracking de caminhada das trends): acha o rosto quadro a quadro (YuNet) e devolve os
quadros-chave x/y/sc do clipe para o rosto ficar parado no ponto escolhido, sem mostrar borda.

Uso: py -3.13 tools/agente/centrar_rosto.py video.mp4 [--ini 0] [--fim 99] [--zoom 130] [--seq 1080x1920]
     [--alvo-y 0.40] [--suave 0.25] [--folha saida.jpg] > k.json
Saída JSON: {"k": {"x": [...], "y": [...], "sc": [...]}, "achados": fração de quadros com rosto}
t dos quadros-chave = tempo da FONTE (como o editor guarda em c.k). `--zoom` é relativo ao "ajustar ao quadro".
"""
import os, sys, json, argparse, subprocess
import numpy as np

CAN = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, CAN)


def _info(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate:stream_side_data=rotation:format=duration", "-of", "json", p],
                       capture_output=True, text=True)
    j = json.loads(r.stdout)
    s = j["streams"][0]
    w, h = s["width"], s["height"]
    rot = 0
    for sd in s.get("side_data_list", []) or []:
        rot = int(sd.get("rotation", 0) or 0)
    if abs(rot) == 90:
        w, h = h, w
    a, b = s["r_frame_rate"].split("/")
    return w, h, float(a) / float(b), float(j["format"]["duration"])


def detectar(path, ini, fim, fps_an=15):
    import cv2
    from Functions.pincel_roto import _rostos_quadro
    W, H, fps, dur = _info(path)
    fim = min(fim, dur)
    lw = 640
    lh = int(round(H * lw / W / 2) * 2)
    pr = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{ini:.3f}", "-i", path, "-t", f"{fim - ini:.3f}",
                           "-vf", f"fps={fps_an},scale={lw}:{lh}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                          stdout=subprocess.PIPE, stdin=subprocess.DEVNULL)
    n, out, prev = 0, [], None
    tam = lw * lh * 3
    while True:
        buf = pr.stdout.read(tam)
        if len(buf) < tam:
            break
        im = np.frombuffer(buf, np.uint8).reshape(lh, lw, 3)
        rs = _rostos_quadro(im)
        t = ini + n / fps_an
        n += 1
        if not rs:
            out.append((t, None)); continue
        if prev is None:
            r = max(rs, key=lambda r: r[2] * r[3])
        else:   # continuidade: o rosto mais perto do anterior (não pula para a amiga)
            r = min(rs, key=lambda r: (r[0] + r[2] / 2 - prev[0]) ** 2 + (r[1] + r[3] / 2 - prev[1]) ** 2 - 4 * r[2] * r[3])
        c = (r[0] + r[2] / 2, r[1] + r[3] / 2, r[3])
        prev = c
        k = W / lw
        out.append((t, (c[0] * k, c[1] * k, c[2] * k)))
    pr.wait()
    return W, H, out


def suavizar(ts, v, seg):
    """Preenche buracos (interpolação) e suaviza com média gaussiana de `seg` s (tira o tranco do passo)."""
    v = np.array([np.nan if x is None else x for x in v], float)
    ok = ~np.isnan(v)
    if ok.sum() < 2:
        return None
    v = np.interp(ts, ts[ok], v[ok])
    dt = ts[1] - ts[0] if len(ts) > 1 else 1
    s = max(1e-3, seg / dt)
    r = int(3 * s)
    ker = np.exp(-0.5 * (np.arange(-r, r + 1) / s) ** 2); ker /= ker.sum()
    vp = np.pad(v, r, mode="edge")
    return np.convolve(vp, ker, mode="valid")


def reduzir(ks, tol):
    if len(ks) < 3:
        return ks
    manter = [0] * len(ks); manter[0] = manter[-1] = 1
    pilha = [(0, len(ks) - 1)]
    while pilha:
        a, b = pilha.pop()
        dm, pior = tol, -1
        for i in range(a + 1, b):
            u = (ks[i]["t"] - ks[a]["t"]) / ((ks[b]["t"] - ks[a]["t"]) or 1)
            d = abs(ks[i]["v"] - (ks[a]["v"] + (ks[b]["v"] - ks[a]["v"]) * u))
            if d > dm:
                dm, pior = d, i
        if pior > 0:
            manter[pior] = 1; pilha += [(a, pior), (pior, b)]
    return [k for k, m in zip(ks, manter) if m]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--ini", type=float, default=0); ap.add_argument("--fim", type=float, default=1e9)
    ap.add_argument("--zoom", type=float, default=130); ap.add_argument("--seq", default="1080x1920")
    ap.add_argument("--alvo-y", type=float, default=0.40); ap.add_argument("--suave", type=float, default=0.25)
    ap.add_argument("--folha")
    a = ap.parse_args()
    SW, SH = map(int, a.seq.lower().split("x"))
    W, H, det = detectar(a.video, a.ini, a.fim)
    ts = np.array([t for t, _ in det])
    xs = suavizar(ts, [d[0] if d else None for _, d in det], a.suave)
    ys = suavizar(ts, [d[1] if d else None for _, d in det], a.suave)
    if xs is None:
        print(json.dumps({"erro": "sem rosto"})); return
    k = min(SW / W, SH / H) * a.zoom / 100       # escala px mídia → px sequência
    mx = max(0, (W * k - SW) / 2); my = max(0, (H * k - SH) / 2)
    KX, KY = [], []
    for t, fx, fy in zip(ts, xs, ys):
        x = SW / 2 - (fx - W / 2) * k
        y = SH * a.alvo_y - (fy - H / 2) * k
        x = min(SW / 2 + mx, max(SW / 2 - mx, x)); y = min(SH / 2 + my, max(SH / 2 - my, y))
        KX.append({"t": round(float(t), 4), "v": round(float(x), 2), "i": "lin"})
        KY.append({"t": round(float(t), 4), "v": round(float(y), 2), "i": "lin"})
    sc = round(100 * k, 3)
    res = {"k": {"x": reduzir(KX, 0.6), "y": reduzir(KY, 0.6),
                 "sc": [{"t": KX[0]["t"], "v": sc, "i": "lin"}, {"t": KX[-1]["t"], "v": sc, "i": "lin"}]},
           "sc": sc, "achados": round(sum(1 for _, d in det if d) / max(1, len(det)), 2), "midia": [W, H]}
    if a.folha:   # conferência: 6 quadros já recortados como o editor mostra
        import cv2
        tiras = []
        for j in np.linspace(0, len(ts) - 1, 6).astype(int):
            t = ts[j]
            raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", a.video, "-frames:v", "1", "-f", "rawvideo",
                                  "-pix_fmt", "bgr24", "-"], capture_output=True, stdin=subprocess.DEVNULL).stdout
            im = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
            M = np.float32([[k, 0, KX[j]["v"] - W / 2 * k], [0, k, KY[j]["v"] - H / 2 * k]])
            q = cv2.warpAffine(im, M, (SW, SH))
            cv2.line(q, (SW // 2, 0), (SW // 2, SH), (0, 255, 255), 2)
            tiras.append(cv2.resize(q, (SW // 6, SH // 6)))
        cv2.imwrite(a.folha, np.hstack(tiras))
    print(json.dumps(res))


if __name__ == "__main__":
    main()
