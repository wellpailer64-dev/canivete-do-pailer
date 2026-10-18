"""
autozoom.py — Autozoom do Vídeo Kanivete (frontend/js/editor-autozoom.js): zooms de ênfase em camadas de ajuste.

- rostos(pedidos): onde está o rosto em cada momento escolhido (YuNet, o mesmo do Pincel Roto) → o zoom vai para ele.
- filtro(fx, W, H, st, t0, fps): o efeito "zoom" da camada de ajuste na exportação (CPU e o caminho híbrido da placa):
  `perspective` com eval=frame (recorte sub-pixel com interpolação cúbica: não treme como o zoompan). O perspective não
  tem T: o tempo vem do número do quadro (`in`) — t0 = instante da timeline do 1º quadro que chega ao filtro.

A curva (a MESMA conta de veAzEscala no JS), u = tempo dentro da camada, D = duração:
  entrada (0..ent): s = 1 + (z−1)·E(u/ent), E = expo-out com força pela Suavidade (ou "mola", que passa do alvo e volta)
  meio: deriva linear de z até z·(1+der) (o zoom "respira", sustenta a frase)
  saída (D−sai..D): volta a 1 em S-curva (cúbica in-out)
Âncora: (cx, cy) em % do quadro — escalar em torno de um ponto dentro do quadro nunca mostra borda.
"""
import math
import os
import subprocess

import numpy as np


def _num(v, a, b, padrao=0.0):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return padrao
    return a if x < a else b if x > b else x


def params(v):
    v = v or {}
    return {"z": _num(v.get("z"), 100, 300, 115) / 100, "ent": _num(v.get("ent"), 0, 5, 0.6), "sai": _num(v.get("sai"), 0, 5, 0.5),
            "suav": _num(v.get("suav"), 0, 100, 70), "mola": 1 if v.get("mola") else 0, "der": _num(v.get("der"), -20, 20, 2) / 100,
            "cx": _num(v.get("cx"), 0, 100, 50) / 100, "cy": _num(v.get("cy"), 0, 100, 45) / 100,
            "mb": 1 if v.get("mb") else 0, "obt": _num(v.get("obt"), 0, 200, 100) / 100}


MB_N = 5            # amostras do obturador na exportação (a prévia usa 7)
_rot = [0]          # rótulos únicos no grafo (vários zooms com desfoque)


def _fmt(x):
    return f"{x:.6f}"


def _expr_escala(p, D, u):
    """Expressão do ffmpeg da escala no tempo u (string) — veAzEscala em editor-autozoom.js."""
    z, der = p["z"], p["der"]
    ent, sai = min(p["ent"], D * 0.6), min(p["sai"], D * 0.4)
    zfim = z * (1 + der)
    meio = max(1e-6, D - ent - sai)
    hold = f"({_fmt(z)}+({_fmt(zfim - z)})*clip(({u}-{_fmt(ent)})/{_fmt(meio)},0,1))"
    if ent > 1e-4:
        x = f"clip({u}/{_fmt(ent)},0,1)"
        if p["mola"]:
            e = f"(1+2.70158*pow({x}-1,3)+1.70158*pow({x}-1,2))"
        else:
            k = 1 + p["suav"] / 100 * 11
            e = f"((1-pow(2,-{_fmt(k)}*{x}))/{_fmt(1 - 2 ** -k)})"
        entrada = f"(1+({_fmt(z - 1)})*{e})"
    else:
        entrada = _fmt(z)
    if sai > 1e-4:
        y = f"clip(({_fmt(D)}-{u})/{_fmt(sai)},0,1)"
        saida = f"(1+({_fmt(zfim - 1)})*({y}*{y}*(3-2*{y})))"
    else:
        saida = _fmt(zfim)
    return f"if(lt({u},{_fmt(ent)}),{entrada},if(gt({u},{_fmt(D - sai)}),{saida},{hold}))"


def escala(p, D, u):
    """A mesma curva em Python (testes)."""
    z, der = p["z"], p["der"]
    ent, sai = min(p["ent"], D * 0.6), min(p["sai"], D * 0.4)
    zfim = z * (1 + der)
    if u < ent:
        x = min(1, max(0, u / ent)) if ent > 1e-4 else 1
        if p["mola"]:
            e = 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2
        else:
            k = 1 + p["suav"] / 100 * 11
            e = (1 - 2 ** (-k * x)) / (1 - 2 ** -k)
        return 1 + (z - 1) * e
    if u > D - sai:
        y = min(1, max(0, (D - u) / sai)) if sai > 1e-4 else 1
        return 1 + (zfim - 1) * (y * y * (3 - 2 * y))
    return z + (zfim - z) * min(1, max(0, (u - ent) / max(1e-6, D - ent - sai)))


def filtro(fx, W, H, st, dur, t0, fps):
    """Filtros do ffmpeg dos efeitos "zoom" ativos da camada (vários = aplicados em sequência), ou None."""
    zs = [f for f in fx or [] if f.get("t") == "zoom" and f.get("on") is not False]
    if not zs:
        return None
    out = []
    D = max(1e-3, dur)
    q = lambda e: "'" + e.replace(",", "\\,") + "'"

    def persp(p, desloc):
        # instante dentro da camada, preso a [0, D]: o obturador não pega o "antes" (zoom seco não fica fantasma no corte)
        u = f"clip({_fmt(t0 - st)}+(in-1)/{_fmt(fps)}+({_fmt(desloc)}),0,{_fmt(D)})"   # in começa em 1
        s = f"({_expr_escala(p, D, u)})"
        ax, ay = p["cx"] * W, p["cy"] * H
        x0, x1 = f"{_fmt(ax)}-{_fmt(ax)}/{s}", f"{_fmt(ax)}+{_fmt(W - ax)}/{s}"
        y0, y1 = f"{_fmt(ay)}-{_fmt(ay)}/{s}", f"{_fmt(ay)}+{_fmt(H - ay)}/{s}"
        return (f"perspective=x0={q(x0)}:y0={q(y0)}:x1={q(x1)}:y1={q(y0)}:x2={q(x0)}:y2={q(y1)}:x3={q(x1)}:y3={q(y1)}"
                f":interpolation=cubic:sense=source:eval=frame")

    for f in zs:
        p = params(f.get("v"))
        if not (p["mb"] and p["obt"] > 0):
            out.append(persp(p, 0.0))
            continue
        # Desfoque de movimento: média de MB_N instantes dentro do obturador (obt × 1 quadro), como a prévia. Parado,
        # as amostras são iguais (nada borra); no zoom rápido vira o borrão radial do movimento. O trecho com ";" entra
        # no meio da cadeia: split → N perspectivas → mix, e a cadeia segue depois do mix.
        _rot[0] += 1
        r = f"azmb{_rot[0]}"
        span = p["obt"] / fps
        ds = [(j / (MB_N - 1) - 0.5) * span for j in range(MB_N)]
        partes = [f"split={MB_N}" + "".join(f"[{r}i{j}]" for j in range(MB_N))]
        partes += [f"[{r}i{j}]{persp(p, d)}[{r}o{j}]" for j, d in enumerate(ds)]
        partes.append("".join(f"[{r}o{j}]" for j in range(MB_N)) + f"mix=inputs={MB_N}:weights='{' '.join(['1'] * MB_N)}'")
        out.append(";".join(partes))
    return ",".join(out)


# ───────────────────────── rostos ─────────────────────────
def rostos(pedidos):
    """pedidos: [[caminho, segundos da mídia]] → [[cx, cy, lado] em fração do quadro (o maior rosto) ou None]."""
    import cv2
    from Functions.midia import ffmpeg, NO_WINDOW
    from Functions.pincel_roto import _rostos_quadro
    out = []
    for caminho, t in pedidos or []:
        r = None
        try:
            if caminho and os.path.isfile(caminho):
                raw = subprocess.run([ffmpeg(), "-v", "error", "-ss", f"{max(0.0, float(t)):.3f}", "-i", caminho, "-frames:v", "1",
                                      "-vf", "scale=640:-2", "-f", "image2pipe", "-c:v", "png", "-"],
                                     capture_output=True, creationflags=NO_WINDOW, timeout=30).stdout
                img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR) if raw else None
                if img is not None:
                    H, W = img.shape[:2]
                    fs = _rostos_quadro(img)
                    if fs:
                        x, y, w, h = max(fs, key=lambda f: f[2] * f[3])[:4]
                        r = [round((x + w / 2) / W, 4), round((y + h * 0.42) / H, 4), round(max(w / W, h / H), 4)]
        except Exception as e:
            print(f"[autozoom] rosto: {e}")
        out.append(r)
    return {"success": True, "rostos": out}
