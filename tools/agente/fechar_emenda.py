"""Tira a voz repetida numa emenda em que a fonte volta no tempo ("moto motor"), sem mudar a duração da timeline.
    py -3.13 tools/agente/fechar_emenda.py projeto.vknv 3.78 [--timeline "Nome"] [--aplicar]
A folga sai de um respiro já existente: antes do trecho contínuo (cabeça) ou depois (cauda), só se ali não houver voz.
Move junto zoom, apoio, tarja, efeito e legendas do trecho. Sem --aplicar só diz o que faria.
"""
import argparse
import copy
import json
import shutil
import subprocess
import sys

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
ap = argparse.ArgumentParser()
ap.add_argument("projeto")
ap.add_argument("tempo", type=float)
ap.add_argument("--timeline", default="")
ap.add_argument("--aplicar", action="store_true")
a = ap.parse_args()
S, SILENCIO = 16000, -20
d = json.load(open(a.projeto, encoding="utf-8"))
M = {m["id"]: m for m in d["media"] if m}
cache = {}


def nivel(mid, t0, t1):
    if mid not in cache:
        cache[mid] = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", M[mid]["path"], "-ac", "1", "-ar", str(S), "-f", "f32le", "-"], capture_output=True).stdout, dtype=np.float32)
    x = cache[mid][max(0, int(t0 * S)):int(t1 * S)]
    return float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)) if len(x) else 0.0


def fim(c):
    return c["st"] + c["e"] - c["s"]


mudou = 0
for q in d["sequences"]:
    if a.timeline and q["name"] != a.timeline:
        continue
    v = sorted([c for c in q["clips"] if c["tr"] == 0 and c.get("x") != "v"], key=lambda c: c["st"])
    i = next((n for n, c in enumerate(v) if abs(c["st"] - a.tempo) < 0.02), None)
    if not i or v[i - 1]["m"] != v[i]["m"] or v[i]["s"] >= v[i - 1]["e"]:
        print(f"{q['name']}: sem emenda repetida em {a.tempo}")
        continue
    t, ov = v[i]["st"], round(v[i - 1]["e"] - v[i]["s"], 3)
    h = i - 1
    while h > 0 and v[h - 1]["m"] == v[h]["m"] and v[h]["s"] <= v[h - 1]["e"]:
        h -= 1
    j = i
    while j + 1 < len(v) and v[j + 1]["m"] == v[j]["m"] and v[j + 1]["s"] <= v[j]["e"]:
        j += 1
    cab = nivel(v[h]["m"], v[h]["s"] - ov, v[h]["s"]) if v[h]["s"] >= ov else 0.0
    cau = nivel(v[j]["m"], v[j]["e"], v[j]["e"] + ov)
    if cab < SILENCIO:
        lado, ini, ate = "cabeça", v[h]["st"], t
    elif cau < SILENCIO and j + 1 < len(v):
        lado, ini, ate = "cauda", t, fim(v[j])
    else:
        print(f"{q['name']}: {t} repete {ov} s, sem respiro livre (cabeça {cab:.0f} dB, cauda {cau:.0f} dB); resolver à mão")
        continue
    print(f"{q['name']}: {t} repete {ov} s; folga na {lado}, trecho {ini:.2f}-{ate:.2f}")
    if not a.aplicar:
        continue

    def mapa(x):
        if lado == "cabeça":
            return min(round(x + ov, 3), t) if ini + 0.001 < x < t - 0.001 else x
        return round(x - ov, 3) if t - 0.001 <= x < ate - 0.001 else x

    # par ligado na trilha 0: imagem da câmera (x="v") + som da lapela (x="a"), mesmo "lk". Mexer só no som deixava a
    # imagem com a duração velha: buraco preto de um lado e dois clipes juntos do outro (Casa Morumbi 2026-11-13)
    par = {id(c): p for c in v if c.get("lk") for p in q["clips"] if p is not c and p.get("lk") == c["lk"] and p["tr"] == c["tr"]}
    antes = {id(c): (c["st"], c["s"], c["e"]) for c in v}
    base = {id(c) for c in v} | {id(p) for p in par.values()}
    for c in q["clips"]:
        if id(c) in base:
            continue
        dur = c["e"] - c["s"]
        if dur < 20 or M.get(c["m"], {}).get("kind") == "ajuste":
            # as duas pontas pelo mesmo mapa: só deslizar empurrava o fim para dentro do vizinho da mesma trilha
            a0, a1 = mapa(c["st"]), mapa(c["st"] + dur)
            c["st"], c["e"] = a0, round(c["s"] + a1 - a0, 3)
    if lado == "cabeça":
        v[h]["s"] = round(v[h]["s"] - ov, 3)
        for c in v[h + 1:i]:
            c["st"] = round(c["st"] + ov, 3)
        v[i - 1]["e"] = round(v[i - 1]["e"] - ov, 3)
    else:
        v[i - 1]["e"] = round(v[i - 1]["e"] - ov, 3)
        for c in v[i:j + 1]:
            c["st"] = round(c["st"] - ov, 3)
        v[j]["e"] = round(v[j]["e"] + ov, 3)
    for c in v:
        p = par.get(id(c))
        if p is not None:
            st0, s0, e0 = antes[id(c)]
            p["st"] = c["st"]
            p["s"], p["e"] = round(p["s"] + c["s"] - s0, 3), round(p["e"] + c["e"] - e0, 3)
    lim = t if lado == "cabeça" else t - ov
    for L in q.get("legendas") or []:
        ant = L["st"] < t - 0.05
        if lado == "cabeça" and not ant:
            continue
        f = (lambda x: min(mapa(x), lim)) if ant else mapa
        L["st"], L["en"] = f(L["st"]), f(L["en"])
        L["pt"] = [[f(x), f(y)] for x, y in L.get("pt", [])]
    mudou += 1
if mudou:
    shutil.copy2(a.projeto, a.projeto[:-5] + " - antes de fechar emenda.vknv")
    at = next((s for s in d["sequences"] if s["id"] == d.get("activeSequence")), None)
    if at:
        d["clips"], d["legendas"] = copy.deepcopy(at["clips"]), copy.deepcopy(at.get("legendas") or [])
    json.dump(d, open(a.projeto, "w", encoding="utf-8"), ensure_ascii=False)
    print("salvo; se o projeto estiver aberto no app, reabrir")
