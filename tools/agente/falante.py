"""Quem está falando, quadro a quadro: rostos (YuNet) + movimento da boca (descontado o movimento da cabeça) + trocas
de plano. Entrada: vídeo, trechos [[a, b], ...] (s da fonte) e palavras [[ini, fim, txt]]. Saída JSON por trecho:
segmentos [t0, t1, cx, cy, fw] em pixels da fonte (cx None = sem rosto: centro).
uso: py -3.13 falante.py video.mp4 plano.json saida.json
"""
import json
import subprocess
import sys

import numpy as np

import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from Functions.midia import ffmpeg  # noqa: E402
from Functions.recorte_pro import _yunet  # noqa: E402
import cv2  # noqa: E402

FPS, W, H, FW = 8, 960, 540, 1920   # amostragem e escala de análise (fonte 1920x1080)


def quadros(video, a, b):
    pr = subprocess.Popen([ffmpeg(), "-v", "error", "-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", video, "-vf", f"fps={FPS},scale={W}:{H}",
                           "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    n = W * H * 3
    i = 0
    while True:
        buf = pr.stdout.read(n)
        if len(buf) < n:
            break
        yield a + i / FPS, np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        i += 1


def patch(g, cx, cy, w, h):
    x0, y0 = int(max(0, cx - w / 2)), int(max(0, cy - h / 2))
    p = g[y0:int(min(H, cy + h / 2)), x0:int(min(W, cx + w / 2))]
    return cv2.resize(p, (32, 16)).astype(np.float32) if p.size > 20 else None


def analisar(video, a, b):
    det = _yunet()
    det.setInputSize((W, H))
    amostras, ant_g, faixas, prox_id = [], None, [], 0   # faixas: rastros de rosto do plano atual
    for t, f in quadros(video, a, b):
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
        corte = ant_g is not None and float(np.abs(cv2.resize(g, (96, 54)).astype(np.float32) - cv2.resize(ant_g, (96, 54)).astype(np.float32)).mean()) > 28
        if corte:
            faixas = []
        _, fs = det.detect(f)
        rostos = []
        for r in (fs if fs is not None else []):
            x, y, w, h = r[:4]
            if w < W * 0.04:
                continue
            mx, my = (r[10] + r[12]) / 2, (r[11] + r[13]) / 2   # cantos da boca
            ex, ey = (r[4] + r[6]) / 2, (r[5] + r[7]) / 2       # olhos
            boca, olhos = patch(g, mx, my + h * 0.04, w * 0.55, h * 0.3), patch(g, ex, ey, w * 0.8, h * 0.22)
            c = (x + w / 2, y + h / 2)
            tr = min(faixas, key=lambda q: np.hypot(q["c"][0] - c[0], q["c"][1] - c[1]), default=None)
            if tr is None or np.hypot(tr["c"][0] - c[0], tr["c"][1] - c[1]) > w * 0.6 or any(tr is ro["tr"] for ro in rostos):
                tr = {"id": prox_id, "c": c}
                prox_id += 1
                faixas.append(tr)
            mov = 0.0
            if tr.get("boca") is not None and boca is not None and olhos is not None and tr.get("olhos") is not None:
                mov = max(0.0, float(np.abs(boca - tr["boca"]).mean()) - 0.7 * float(np.abs(olhos - tr["olhos"]).mean()))
            tr.update(c=c, boca=boca, olhos=olhos)
            rostos.append({"tr": tr, "id": tr["id"], "cx": c[0] * FW / W, "cy": c[1] * FW / W, "fw": w * FW / W, "mov": mov})
        amostras.append({"t": t, "corte": corte, "rostos": [{k: v for k, v in r.items() if k != "tr"} for r in rostos]})
        ant_g = g
    return amostras


def decidir(amostras, palavras, a, b, minimo=1.2):
    """Para cada palavra, o rosto com mais boca mexendo; segmentos com duração mínima; troca de plano força corte."""
    cortes = [s["t"] for s in amostras if s["corte"]]
    pal = [w for w in palavras if a <= w[0] < b]
    escolha = []   # (t0, rosto)
    for w0, w1, _ in pal:
        janela = [s for s in amostras if w0 - 0.05 <= s["t"] <= w1 + 0.05] or [min(amostras, key=lambda s: abs(s["t"] - w0))]
        soma = {}
        for s in janela:
            for r in s["rostos"]:
                soma.setdefault(r["id"], [0.0, r])[0] += r["mov"]
                soma[r["id"]][1] = r
        if soma:
            escolha.append((w0, max(soma.values(), key=lambda v: (v[0], v[1]["fw"]))[1]))
    # segmentos: junta palavras seguidas do mesmo rosto; troca só depois de `minimo` s (salvo troca de plano)
    seg = []
    for t, r in escolha:
        if seg and (seg[-1]["id"] == r["id"] or (t - seg[-1]["t0"] < minimo and not any(seg[-1]["t0"] < c <= t for c in cortes))):
            if seg[-1]["id"] == r["id"]:
                seg[-1]["r"] = r
            continue
        seg.append({"t0": max(a, t - 0.1), "id": r["id"], "r": r})
    # trocas de plano no meio de um segmento: abre segmento novo com o maior rosto do plano novo
    for c in cortes:
        for i, s in enumerate(seg):
            fim = seg[i + 1]["t0"] if i + 1 < len(seg) else b
            if s["t0"] < c < fim - 0.3:
                am = next((x for x in amostras if x["t"] >= c and x["rostos"]), None)
                if am:
                    r = max(am["rostos"], key=lambda q: q["fw"])
                    seg.insert(i + 1, {"t0": c, "id": r["id"], "r": r})
                break
    out = []
    for i, s in enumerate(seg):
        t1 = seg[i + 1]["t0"] if i + 1 < len(seg) else b
        r = s["r"]
        out.append([round(s["t0"] if i else a, 3), round(t1, 3), round(r["cx"], 1), round(r["cy"], 1), round(r["fw"], 1)])
    return out or [[a, b, None, None, None]]


if __name__ == "__main__":
    video, plano, saida = sys.argv[1:4]
    p = json.load(open(plano, encoding="utf-8"))
    res = []
    for tr in p["trechos"]:
        am = analisar(video, tr[0], tr[1])
        res.append({"trecho": tr, "segmentos": decidir(am, p["palavras"], tr[0], tr[1]),
                    "rostos_por_amostra": round(float(np.mean([len(s["rostos"]) for s in am])), 2), "cortes_de_plano": sum(s["corte"] for s in am)})
        print(tr, len(res[-1]["segmentos"]), "segmentos", flush=True)
    json.dump(res, open(saida, "w", encoding="utf-8"), indent=1)
