"""Procura palavra comida no fim dos cortes de fala: ouve o trecho final de cada corte e compara com a fonte.
    py -3.13 tools/agente/checar_cortes.py projeto.vknv [--timeline "Nome"] [--json saida.json]
Para cada corte que não emenda com o seguinte na fonte: mede a voz na borda e acha o vale até a próxima palavra.
Saída: corte suspeito, palavra final ouvida no corte e fim sugerido (no vale de energia). Não altera o projeto.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, r"D:\Kanivete\Plugins\kanibrowser")
sys.stdout.reconfigure(encoding="utf-8")
import wa  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("projeto")
ap.add_argument("--timeline", default="")
ap.add_argument("--json", default="")
a = ap.parse_args()
d = json.load(open(a.projeto, encoding="utf-8"))
M = {m["id"]: m for m in d["media"] if m}
q = next(s for s in d["sequences"] if (a.timeline and s["name"] == a.timeline) or (not a.timeline and s["id"] == d["activeSequence"]))


def audio(p):
    x = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(x, np.float32)


AUD = {}
fala = sorted([c for c in q["clips"] if c["tr"] == 0 and c.get("x") != "v" and M.get(c.get("m"), {}).get("kind") == "video"], key=lambda c: c["st"])
sus = []
for i, c in enumerate(fala):
    if i + 1 < len(fala) and fala[i + 1]["m"] == c["m"] and abs(fala[i + 1]["s"] - c["e"]) < 0.02:
        continue   # emenda na fonte: só troca de enquadramento, nada se perde
    p = M[c["m"]]["path"]
    x = AUD.setdefault(p, audio(p))
    env = np.sqrt(np.convolve(x ** 2, np.ones(320) / 320, "same"))[::160]   # energia em passos de 10 ms
    lim = max(0.012, float(np.percentile(env, 60)) * 0.25)
    j = int(c["e"] * 100)
    borda, depois = env[max(0, j - 3):j].mean() if j else 0, env[j:j + 6].mean() if j < len(env) else 0
    if borda / lim < 1.5:
        continue   # a voz já tinha acabado
    trecho = env[j:j + 45]
    k = int(np.argmin(trecho)) if len(trecho) else 0
    ouvido = wa.transcrever_ogg(subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", "16000", "-ac", "1", "-i", "-", "-c:a", "libopus", "-f", "ogg", "-"],
                                               input=x[int(max(c["s"], c["e"] - 1.6) * 16000):int(c["e"] * 16000)].tobytes(), capture_output=True).stdout)
    sus.append({"st": c["st"], "fonte": os.path.basename(p), "s": c["s"], "e": c["e"], "borda": round(float(borda / lim), 1), "depois": round(float(depois / lim), 1),
                "vale": round((j + k) / 100, 2), "ouvido": ouvido})
    print(f"{c['st']:7.2f}s {os.path.basename(p)[-14:]} fim {c['e']:.2f} voz na borda {borda / lim:.1f}x | vale em {(j + k) / 100:.2f} | ouvi: ...{ouvido[-40:]}")
print(len(sus), "cortes com voz na borda, de", len(fala))
if a.json:
    json.dump(sus, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
