"""
Transições de sobreposição do editor (estilo Mister Horse / Motion Bro): uma camada de ajuste por cima do corte que
deforma e ilumina o que está embaixo — o clipe que sai até o corte, o que entra depois dele.

Mesmas contas da prévia (frontend/js/editor-ovt.js: veOvtParams + o shader). Cada quadro:
  1. os parâmetros do instante (parametros): K amostras, cada uma com uma matriz 2×2 + deslocamento + redemoinho +
     lente; e os globais (ondulação, pixel, aberração cromática, glitch, flash, flare, vazamento de luz)
  2. o núcleo (aplicar): para cada pixel de saída, K pontos de origem com bordas espelhadas, média (= desfoque de
     movimento: as amostras são instantes vizinhos dentro do "obturador"), depois a luz em modo Tela.
Coordenadas em unidades de S = meia diagonal do quadro, a partir do centro (igual em qualquer resolução).

Exportação: render(): o trecho da camada sai das trilhas de baixo (exportar_video) num intermediário ProRes,
passa quadro a quadro por aqui e vira um H.264 quase sem perda que a exportação usa no lugar da camada.
"""

import math
import os
import shutil
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

NB = 24          # faixas do glitch
K_MAX = 16
_TAU_OURO = 2.399963229728653   # ângulo de ouro (amostras do desfoque em disco)


def _tabela(n=64, seed=12345):
    """Números 0..1 do gerador de Park-Miller (o JS gera a mesma tabela, sem erro de arredondamento)."""
    x, out = seed, []
    for _ in range(n):
        x = (x * 16807) % 2147483647
        out.append(x / 2147483647)
    return out


RND = _tabela()


def _cl(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def _eq(x):   # easeInOutQuint: quase parado nas pontas, muito rápido no corte (esconde o corte)
    x = _cl(x)
    return 16 * x ** 5 if x < 0.5 else 1 - (-2 * x + 2) ** 5 / 2


def _ec(x):   # easeInOutCubic
    x = _cl(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def _pico(x):   # 0 nas pontas, 1 no corte
    x = _cl(x)
    return math.sin(math.pi * x) ** 2


def _pico_flash(x):
    x = _cl(x)
    return (1 - abs(2 * x - 1)) ** 3


def _ruido(x, canal):
    """Ruído suave −1..1 (interpolação entre valores da tabela)."""
    i = math.floor(x)
    f = x - i
    f = f * f * (3 - 2 * f)
    a = RND[(i + canal * 17) % 64]
    b = RND[(i + 1 + canal * 17) % 64]
    return (a + (b - a) * f) * 2 - 1


def _num(v, k, lo, hi, padrao):
    try:
        x = float((v or {}).get(k, padrao))
    except (TypeError, ValueError):
        x = padrao
    if not math.isfinite(x):
        x = padrao
    return max(lo, min(hi, x))


def _cor(v, k, padrao):
    s = str((v or {}).get(k) or padrao)
    if len(s) != 7 or s[0] != "#":
        s = padrao
    try:
        return [int(s[1:3], 16) / 255.0, int(s[3:5], 16) / 255.0, int(s[5:7], 16) / 255.0]
    except ValueError:
        return [1.0, 1.0, 1.0]


# Desfoque de movimento padrão de cada uma (0 = sem amostras extras)
MB_PADRAO = {"zoomin": 70, "zoomout": 70, "spin": 70, "panblur": 80, "stretch": 60, "twirl": 50, "lens": 40,
             "shake": 60}
TIPOS = ("zoomin", "zoomout", "spin", "panblur", "stretch", "twirl", "lens", "ripple", "glitch", "pixel",
         "shake", "blurx", "flash", "flare", "leak")


def parametros(t, v, u, uc, dur, fps, W, H):
    """Parâmetros do núcleo no instante u (0..1 da camada); uc = onde fica o corte (0..1)."""
    uc = _cl(uc, 0.02, 0.98)
    dur, fps = max(dur, 1e-3), max(fps, 1.0)
    lado_b = u >= uc - 0.25 / (fps * dur)

    def tau(x):
        x = _cl(x)
        return 0.5 * x / uc if x < uc else 0.5 + 0.5 * (x - uc) / (1 - uc)

    T = tau(u)
    S = 0.5 * math.hypot(W, H)
    p = {"K": 1, "M": [[1, 0, 0, 1]], "W": [[0, 0, 0, 0]], "g1": [0, 0, 0, 0], "g2": [0, 0, 0, 0],
         "flashC": [1, 1, 1], "fl": [0, 0, 0, 0], "flC": [1, 1, 1], "lk": [0, 0, 0, 0, 0, 0],
         "lkC1": [1, 1, 1], "lkC2": [1, 1, 1], "gb": [0.0] * NB, "gl": 0}
    mb = _num(v, "mb", 0, 100, MB_PADRAO.get(t, 0))
    K = 12 if t in MB_PADRAO and mb > 0.5 else 1
    span = mb / 100.0 * 2.0 / (fps * dur)
    tks = [T] if K == 1 else [tau(u + (k / (K - 1) - 0.5) * span) for k in range(K)]
    M, Wv = [], []

    def iso(z):
        return [1 / z, 0, 0, 1 / z]

    if t in ("zoomin", "zoomout"):
        L = math.log(_num(v, "amt", 110, 1000, 300) / 100.0)
        sg = 1 if t == "zoomin" else -1
        for tk in tks:
            s = sg * (2 * L * _eq(tk) - (2 * L if lado_b else 0))
            M.append(iso(math.exp(s)))
            Wv.append([0, 0, 0, 0])
    elif t == "spin":
        ang = math.radians(_num(v, "ang", -1080, 1080, 360))
        zm = _num(v, "zoom", 0, 100, 20) / 100.0
        for tk in tks:
            th = ang * _eq(tk) - (ang if lado_b else 0)
            z = 1 + zm * math.sin(math.pi * _cl(tk))
            c, s = math.cos(th) / z, math.sin(th) / z
            M.append([c, s, -s, c])
            Wv.append([0, 0, 0, 0])
    elif t == "panblur":
        a = math.radians(_num(v, "ang", 0, 360, 0))
        dx, dy = math.cos(a), math.sin(a)
        D = (W * abs(dx) + H * abs(dy)) / S
        for tk in tks:
            o = D * _eq(tk) - (D if lado_b else 0)
            M.append([1, 0, 0, 1])
            Wv.append([-o * dx, -o * dy, 0, 0])
    elif t == "stretch":
        L = math.log(_num(v, "amt", 110, 1000, 400) / 100.0)
        a = math.radians(_num(v, "ang", 0, 180, 0))
        c, s = math.cos(a), math.sin(a)
        for tk in tks:
            k = math.exp(-(2 * L * _ec(tk) - (2 * L if lado_b else 0)))
            M.append([k * c * c + s * s, (k - 1) * c * s, (k - 1) * c * s, k * s * s + c * c])
            Wv.append([0, 0, 0, 0])
    elif t == "twirl":
        A = math.radians(_num(v, "amt", -1080, 1080, 270))
        zm = _num(v, "zoom", 0, 100, 15) / 100.0
        for tk in tks:
            tw = 2 * A * _ec(tk) - (2 * A if lado_b else 0)
            M.append(iso(1 + zm * math.sin(math.pi * _cl(tk))))
            Wv.append([0, 0, tw, 0])
    elif t == "lens":
        a = _num(v, "amt", 0, 100, 60) / 100.0
        for tk in tks:
            P = _pico(tk)
            M.append(iso(1 + 0.3 * a * P))
            Wv.append([0, 0, 0, 1.5 * a * P])
        p["g2"][0] = _num(v, "ca", 0, 100, 30) / 100.0 * 0.04 * _pico(T)
    elif t == "shake":
        a = _num(v, "amt", 0, 100, 60) / 100.0
        for tk in tks:
            P = _pico(tk)
            x = tk * dur * 12
            r = _ruido(x, 2) * 0.06 * a * P
            z = 1 + 0.08 * a * P
            M.append([math.cos(r) / z, math.sin(r) / z, -math.sin(r) / z, math.cos(r) / z])
            Wv.append([_ruido(x, 0) * 0.05 * a * P, _ruido(x, 1) * 0.05 * a * P, 0, 0])
    elif t == "blurx":
        R = 0.05 * _num(v, "amt", 0, 100, 60) / 100.0 * _pico(T)
        if R > 1e-4:
            K = 16
            for k in range(K):
                q = R * math.sqrt((k + 0.5) / K)
                M.append([1, 0, 0, 1])
                Wv.append([q * math.cos(k * _TAU_OURO), q * math.sin(k * _TAU_OURO), 0, 0])
    if not M:
        K, M, Wv = 1, [[1, 0, 0, 1]], [[0, 0, 0, 0]]
    if t == "ripple":
        a = _num(v, "amt", 0, 100, 50) / 100.0
        p["g1"][0:3] = [0.06 * a * _pico(T), _num(v, "freq", 1, 20, 6), T * 3]
    elif t == "glitch":
        gl = _num(v, "amt", 0, 100, 70) / 100.0 * _pico(T)
        seed = int(math.floor(T * dur * 15))
        for b in range(NB):
            r1, r2 = RND[(b * 7 + seed) % 64], RND[(b * 13 + seed * 3 + 5) % 64]
            p["gb"][b] = (r1 - 0.5) * 2 * 0.15 * gl if r2 < 0.35 + 0.4 * gl else 0.0
        p["gl"] = 1 if gl > 1e-4 else 0
        Wv[0] = [(RND[(seed * 5 + 1) % 64] - 0.5) * 0.06 * gl, (RND[(seed * 11 + 2) % 64] - 0.5) * 0.03 * gl, 0, 0]
        p["g2"][0] = _num(v, "ca", 0, 100, 50) / 100.0 * 0.03 * gl
    elif t == "pixel":
        b = 0.15 * _num(v, "amt", 0, 100, 50) / 100.0 * _pico(T)
        p["g1"][3] = b if b >= 0.004 else 0
    elif t == "flash":
        p["g2"][1] = _num(v, "amt", 0, 100, 100) / 100.0 * _pico_flash(T)
        p["flashC"] = _cor(v, "cor", "#ffffff")
    elif t == "flare":
        a = _num(v, "amt", 0, 200, 100) / 100.0
        ang = math.radians(_num(v, "ang", 0, 360, 0))
        pos = (-1.1 + 2.2 * T) * 0.9
        p["g2"][2] = a * (0.25 + 0.75 * _pico(T)) * min(1.0, math.sin(math.pi * T) * 3)
        p["fl"] = [math.cos(ang) * pos, math.sin(ang) * pos, a * _pico_flash(T) * 0.85, 0]
        p["flC"] = _cor(v, "cor", "#ffb060")
    elif t == "leak":
        a = _num(v, "amt", 0, 200, 100) / 100.0
        p["g2"][3] = a * math.sin(math.pi * T) ** 1.5 * 0.8
        p["lk"] = [-0.9 + 1.6 * T, -0.25, 0.85 - 1.5 * T, 0.3, -0.7 + 0.9 * T, 0.35 * _pico_flash(T) * a]
        p["lkC1"] = _cor(v, "cor", "#ff6a20")
        p["lkC2"] = _cor(v, "cor2", "#ffc860")
    p["K"], p["M"], p["W"] = K, M, Wv
    return p


# ── núcleo ──
_grades = {}


def _grade(W, H):
    g = _grades.get((W, H))
    if g is None:
        px, py = np.meshgrid(np.arange(W, dtype=np.float32) + 0.5, np.arange(H, dtype=np.float32) + 0.5)
        g = _grades[(W, H)] = (px, py)
        if len(_grades) > 4:
            _grades.pop(next(iter(_grades)))
    return g


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _luz_flare(nx, ny, p):
    """Lens flare: brilho no ponto de luz, risco anamórfico, anel e fantasmas na linha luz–centro."""
    I, (Lx, Ly, veu, _), C = p["g2"][2], p["fl"], p["flC"]
    dx, dy = nx - Lx, ny - Ly
    d2 = dx * dx + dy * dy
    dist = np.sqrt(d2)
    brilho = np.exp(-d2 / 0.004) + np.exp(-d2 / 0.06) * 0.45 + np.exp(-d2 / 0.5) * 0.15
    brilho += np.exp(-((dist - 0.3) / 0.02) ** 2) * 0.12
    risco = np.exp(-(dy * dy) / 0.00012) * np.exp(-np.abs(dx) / 0.7) * 0.7
    fant = np.zeros_like(nx)
    for g, r, a in ((-0.35, 0.05, 0.22), (-0.7, 0.1, 0.14), (0.45, 0.035, 0.25), (-1.15, 0.16, 0.10)):
        e = np.sqrt((nx - Lx * g) ** 2 + (ny - Ly * g) ** 2)
        fant += (1 - _smooth(r * 0.7, r, e)) * a
    out = []
    for ch, (cr, ri) in enumerate(zip(C, (0.7, 0.82, 1.0))):
        out.append(cr * brilho * I + ri * risco * I + (0.55, 0.85, 1.0)[ch] * fant * I + cr * veu)
    return np.stack(out, axis=-1)


def _luz_leak(nx, ny, p):
    I, lk, C1, C2 = p["g2"][3], p["lk"], p["lkC1"], p["lkC2"]
    b1 = np.exp(-((nx - lk[0]) ** 2 + (ny - lk[1]) ** 2) / 0.36)
    b2 = np.exp(-((nx - lk[2]) ** 2 + (ny - lk[3]) ** 2) / 0.25)
    b3 = np.exp(-((nx - 0.15) ** 2 + (ny - lk[4]) ** 2) / 0.2025)
    out = []
    for ch in range(3):
        c3 = (C1[ch] + C2[ch]) * 0.5
        out.append((C1[ch] * b1 + C2[ch] * b2 + c3 * b3) * I + C2[ch] * lk[5])
    return np.stack(out, axis=-1)


def _meia(W, H):
    """Grade de meia resolução (centros dos pixels em coordenadas do quadro cheio): os mapas de deformação são suaves,
    calculados nela e ampliados com interpolação linear (4x menos conta, diferença bem abaixo de 1 px)."""
    w2, h2 = (W + 1) // 2, (H + 1) // 2
    g = _grades.get(("m", W, H))
    if g is None:
        px, py = np.meshgrid(np.arange(w2, dtype=np.float32) * 2 + 1, np.arange(h2, dtype=np.float32) * 2 + 1)
        g = _grades[("m", W, H)] = (px, py)
    return g


def _ampliar(a, W, H):
    return a if a.shape[1] == W and a.shape[0] == H else cv2.resize(a, (W, H), interpolation=cv2.INTER_LINEAR)


def aplicar(img, p):
    """img = quadro RGB uint8 (H, W, 3) → quadro com a transição."""
    H, W = img.shape[:2]
    S = 0.5 * math.hypot(W, H)
    cx, cy = W / 2.0, H / 2.0
    K = max(1, min(K_MAX, int(p["K"])))
    ca, pix = p["g2"][0], p["g1"][3]
    ripA, ripF, ripPh = p["g1"][0], p["g1"][1], p["g1"][2]
    geral = ripA != 0 or pix > 0 or ca > 0 or p["gl"] or any(w[2] or w[3] for w in p["W"][:K])
    luz = p["g2"][1] > 0 or p["g2"][2] > 0 or p["fl"][2] > 0 or p["g2"][3] > 0 or p["lk"][5] > 0
    identidade = K == 1 and not geral and list(p["M"][0]) == [1, 0, 0, 1] and not any(p["W"][0][:2])
    if identidade and not luz:
        return img
    if identidade:
        acc = img.astype(np.float32)
    elif not geral:
        # só matrizes: warpAffine com borda espelhada (BORDER_REFLECT = o espelho do shader, a qualquer distância)
        acc = np.zeros((H, W, 3), np.float32)
        c0 = np.array([cx - 0.5, cy - 0.5])
        for k in range(K):
            m0, m1, m2, m3 = p["M"][k]
            A = np.array([[m0, m1], [m2, m3]])
            b = c0 - A @ c0 + S * np.array(p["W"][k][:2])
            mat = np.float32([[m0, m1, b[0]], [m2, m3, b[1]]])
            acc += cv2.warpAffine(img, mat, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                                  borderMode=cv2.BORDER_REFLECT)
        acc /= K
    else:
        # pixel e glitch têm degraus: grade cheia; o resto, meia resolução ampliada
        cheia = pix > 0 or p["gl"]
        px, py = _grade(W, H) if cheia else _meia(W, H)
        if pix > 0:
            B = pix * S
            px = (np.floor(px / B) + 0.5) * B
            py = (np.floor(py / B) + 0.5) * B
        nx = (px - cx) / S
        ny = (py - cy) / S
        if p["gl"]:
            faixa = np.clip(np.floor(py / H * NB), 0, NB - 1).astype(np.int32)
            nx = nx + np.asarray(p["gb"], dtype=np.float32)[faixa]
        acc = np.zeros((H, W, 3), np.float32)
        canais = cv2.split(img) if ca > 0 else None

        def amostra(X, Y, fonte):
            # BORDER_REFLECT espelha a qualquer distância, igual ao mirror do shader
            sx = _ampliar(cx - 0.5 + X * S, W, H)
            sy = _ampliar(cy - 0.5 + Y * S, W, H)
            return cv2.remap(fonte, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

        for k in range(K):
            m0, m1, m2, m3 = p["M"][k]
            tx, ty, tw, lk = p["W"][k]
            X = m0 * nx + m1 * ny + tx
            Y = m2 * nx + m3 * ny + ty
            if lk:
                f = 1 + lk * (X * X + Y * Y)
                X, Y = X * f, Y * f
            if tw:
                r = np.sqrt(X * X + Y * Y)
                ph = tw * np.clip(1 - r, 0, 1) ** 2
                c, s = np.cos(ph), np.sin(ph)
                X, Y = X * c - Y * s, X * s + Y * c
            if ripA:
                r = np.sqrt(X * X + Y * Y)
                inv = ripA * np.sin(2 * np.pi * (r * ripF - ripPh)) / np.maximum(r, 1e-6)
                X, Y = X + X * inv, Y + Y * inv
            if canais:
                for ch, sc in ((0, 1 + ca), (1, 1.0), (2, 1 - ca)):
                    acc[:, :, ch] += amostra(X * sc, Y * sc, canais[ch])
            else:
                acc += amostra(X, Y, img)
        acc /= K
    if not luz:
        return np.clip(acc + 0.5, 0, 255).astype(np.uint8)
    c = acc / 255.0
    if p["g2"][1] > 0:
        f = p["g2"][1] * np.asarray(p["flashC"], dtype=np.float32)
        c = 1 - (1 - c) * (1 - f)
    flare = p["g2"][2] > 0 or p["fl"][2] > 0
    leak = p["g2"][3] > 0 or p["lk"][5] > 0
    if flare or leak:
        # luz suave: meia resolução ampliada
        px, py = _meia(W, H)
        nx, ny = (px - cx) / S, (py - cy) / S
        if flare:
            c = 1 - (1 - c) * (1 - _ampliar(np.clip(_luz_flare(nx, ny, p), 0, 1).astype(np.float32), W, H))
        if leak:
            c = 1 - (1 - c) * (1 - _ampliar(np.clip(_luz_leak(nx, ny, p), 0, 1).astype(np.float32), W, H))
    return np.clip(c * 255 + 0.5, 0, 255).astype(np.uint8)


def processar_quadro(img, efeitos, i, fps, dur, uc):
    """Aplica as transições (em ordem) no quadro i do trecho."""
    H, W = img.shape[:2]
    u = (i / fps) / max(dur, 1e-3)
    for f in efeitos:
        if f.get("t") in TIPOS:
            img = aplicar(img, parametros(f["t"], f.get("v") or {}, u, uc, dur, fps, W, H))
    return img


# ── exportação ──
_lock = threading.Lock()
_stop = None


def cancelar():
    with _lock:
        if _stop is not None:
            _stop.set()
    return {"success": True}


def render(base, h, job):
    """job = {path, base, camadas, dur, quadro, fx: [{t, v}], uc}. Devolve {success, path}.
    Arquivo em <raiz do cache>/Transicoes/<hash>.mp4: o hash é do conteúdo, serve de novo se nada mudou."""
    global _stop
    from Functions import render_cache
    from Functions.convertermp3 import ffmpeg_path
    from Functions.video_cutter import exportar_video, probe

    if not render_cache._HASH_OK.match(str(h)):
        return {"success": False, "error": "hash inválido"}
    pasta = os.path.join(render_cache._raiz(base), "Transicoes")
    os.makedirs(pasta, exist_ok=True)
    final = os.path.join(pasta, h + ".mp4")
    if os.path.isfile(final):
        agora = time.time()
        try:
            os.utime(final, (agora, agora))
        except OSError:
            pass
        return {"success": True, "path": final, "reuso": True}
    efeitos = [f for f in (job.get("fx") or []) if isinstance(f, dict) and f.get("t") in TIPOS]
    dur = float(job.get("dur") or 0)
    if not efeitos or dur <= 0:
        return {"success": False, "error": "nada para renderizar"}
    stop = threading.Event()
    with _lock:
        _stop = stop
    meio = os.path.join(pasta, h + ".meio.mov")
    parte = os.path.join(pasta, h + ".part.mp4")
    try:
        # 1. o que está embaixo da camada, só no trecho dela (ProRes: sem perda visível)
        r = exportar_video(job.get("path") or "", job.get("base") or [], "mp4", "high", "original", False, None,
                           stop_event=stop, sem_audio=True, camadas=job.get("camadas") or [],
                           audio_segmentos=None, duracao=dur, audio_clipes=None, legendas=None,
                           quadro=job.get("quadro"), saida=meio, opcoes={"codec": "prores"})
        if not r.get("success"):
            return r
        info = probe(meio)
        W, H = int(info["width"]), int(info["height"])
        fps = float(info.get("fps") or 30)
        uc = _cl(float(job.get("uc", 0.5)), 0.0, 1.0)
        # a mesma matriz de cor na ida para RGB e na volta, e a marca no arquivo (sem ela a exportação lê como BT.709
        # um H.264 gravado em BT.601 e a cor da transição muda)
        cs = str(info.get("color_space") or "").lower()
        mtx = "bt709" if cs == "bt709" or (not cs and min(W, H) >= 720) else "bt601"
        marca = {"bt709": ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"],
                 "bt601": ["-colorspace", "smpte170m", "-color_primaries", "smpte170m", "-color_trc", "smpte170m"]}[mtx]
        ff = ffmpeg_path()
        sem_janela = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        ler = subprocess.Popen([ff, "-v", "error", "-i", meio, "-vf", f"scale=in_color_matrix={mtx},format=rgb24",
                                "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=sem_janela)
        grava = subprocess.Popen([ff, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                                  "-r", f"{fps:.6f}", "-i", "pipe:0", "-vf", f"scale=out_color_matrix={mtx}:out_range=tv,format=yuv420p",
                                  "-c:v", "libx264", "-preset", "fast", "-crf", "10", "-g", "15", "-pix_fmt", "yuv420p"]
                                 + marca + ["-color_range", "tv", "-movflags", "+faststart", parte],
                                 stdin=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=sem_janela)
        tam = W * H * 3
        try:
            with ThreadPoolExecutor(max_workers=max(1, min(4, (os.cpu_count() or 2) - 1))) as pool:
                # só os quadros do trecho: o render das trilhas de baixo pode trazer um quadro a mais no fim (vazio)
                total = max(1, int(round(dur * fps)))
                fila, i = [], 0
                while not stop.is_set() and i < total:
                    buf = ler.stdout.read(tam)
                    if len(buf) < tam:
                        break
                    img = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
                    fila.append(pool.submit(processar_quadro, img, efeitos, i, fps, dur, uc))
                    i += 1
                    while len(fila) > 6 or (fila and fila[0].done()):
                        grava.stdin.write(fila.pop(0).result().tobytes())
                for fut in fila:
                    if stop.is_set():
                        break
                    grava.stdin.write(fut.result().tobytes())
        finally:
            try:
                grava.stdin.close()
            except OSError:
                pass
            ler.kill()
            ler.wait()
            err = grava.stderr.read().decode("utf-8", "replace") if grava.stderr else ""
            grava.wait()
        if stop.is_set():
            return {"success": False, "cancelled": True, "error": "cancelado"}
        if grava.returncode != 0 or not os.path.isfile(parte):
            return {"success": False, "error": "falha ao gravar a transição: " + err.strip()[-300:]}
        os.replace(parte, final)
        return {"success": True, "path": final, "quadros": i}
    finally:
        with _lock:
            _stop = None
        for arq in (meio, parte):
            try:
                if os.path.isfile(arq):
                    os.remove(arq)
            except OSError:
                pass
