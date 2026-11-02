"""Troca uma mídia do projeto por outra versão do mesmo arquivo (ex.: abertura em alta), sem mexer nos cortes.
    py -3.13 tools/agente/trocar_midia.py projeto.vknv "parte do nome antigo" novo.mp4 [--aplicar]
Mede pelo áudio se o novo casa no tempo e recalcula a escala. Sem --aplicar só mede. Com --aplicar faz cópia do projeto antes.
Recusa se o áudio não for o mesmo. Projeto aberto no app: reabrir depois.
"""
import argparse
import copy
import json
import os
import shutil
import subprocess
import sys
import time

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
ap = argparse.ArgumentParser()
ap.add_argument("projeto")
ap.add_argument("antigo")
ap.add_argument("novo")
ap.add_argument("--aplicar", action="store_true")
a = ap.parse_args()
S = 8000


def som(p):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(S), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(r, dtype=np.float32)


def largura(p):
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", p], capture_output=True, text=True).stdout)["streams"][0]
    rot = next((abs(int(x.get("rotation", 0))) for x in j.get("side_data_list", []) if "rotation" in x), 0)
    return j["height"] if rot in (90, 270) else j["width"]


d = json.load(open(a.projeto, encoding="utf-8"))
ms = [m for m in d["media"] if m and m.get("path") and a.antigo.lower() in m.get("name", "").lower()]
if len(ms) != 1:
    sys.exit(f"o nome precisa achar 1 mídia, achou {[m['name'] for m in ms]}")
m = ms[0]
x, y = som(m["path"]), som(a.novo)
n = len(x) + len(y)
c = np.fft.irfft(np.fft.rfft(y, n) * np.conj(np.fft.rfft(x, n)), n)
k = int(np.argmax(np.abs(c)))
k = k - n if k > n / 2 else k
corr = float(np.abs(c).max() / np.sqrt((x ** 2).sum() * (y ** 2).sum() + 1e-9))
ofs = k / S
w0, w1 = largura(m["path"]), largura(a.novo)
print(f"{m['name']} -> {os.path.basename(a.novo)} | desvio {ofs:+.3f} s | igualdade do áudio {corr:.2f} | largura {w0} -> {w1}")
if corr < 0.6:
    sys.exit("RECUSADO: o áudio não é o mesmo; conferir o arquivo")
if not a.aplicar:
    sys.exit(0)
shutil.copy2(a.projeto, f"{a.projeto[:-5]} - antes de trocar mídia {time.strftime('%Y-%m-%d %H%M')}.vknv")
m["path"], m["name"] = a.novo.replace("\\", "/"), os.path.basename(a.novo)
tot = 0
for s in d["sequences"]:
    for cl in s["clips"]:
        if cl.get("m") == m["id"]:
            cl["s"], cl["e"] = round(cl["s"] + ofs, 3), round(cl["e"] + ofs, 3)
            if cl.get("p"):
                cl["p"]["sc"] = round(cl["p"]["sc"] * w0 / w1, 2)
            tot += 1
at = next((s for s in d["sequences"] if s["id"] == d.get("activeSequence")), None)
if at:
    d["clips"] = copy.deepcopy(at["clips"])
json.dump(d, open(a.projeto, "w", encoding="utf-8"), ensure_ascii=False)
print(f"trocado em {tot} clipes")
