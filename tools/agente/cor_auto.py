"""Correção de cor automática por medição (escopos), no efeito Luz e Cor ('lc').

Mede quadros do vídeo como um colorista lê os escopos e ajusta os controles do Luz e Cor até a imagem cair nas faixas:
  - forma de onda: branco sem estourar (p99,5 da luma até ~0,95; menos pixel estourado), preto sem esmagar
    (p0,5 entre ~0,02 e 0,06; quase nada abaixo de 0,015), meio-tom num lugar confortável;
  - parade/vetorscópio: o que é neutro (cinza, branco, parede) sem puxar para laranja/vermelho/azul/verde;
  - pele (rosto achado pelo YuNet): luma da pele numa faixa boa e matiz perto da linha de pele; pele vermelha ou
    saturada demais vira correção no HSL secundário (só na faixa da pele), sem mexer no resto.
O ponto de partida é o "look" (a grade do cliente): a correção só sai dele o quanto for preciso.
Cada tentativa é medida com a MESMA LUT do app (tools/agente/lc_lut.js roda o editor-lc.js no node).

    py -3.13 tools/agente/cor_auto.py video.mp4 [outro.mp4 ...] [--look '{"ct":22}'] [--folha antes_depois.jpg]
Imprime os valores por vídeo (JSON) e as medidas antes/depois. Uso no reel: reel_fala.py chama ajustar() por fonte.
"""
import argparse
import json
import os
import struct
import subprocess
import sys

import cv2  # noqa: F401  (o YuNet precisa dele carregado)
import numpy as np
from scipy.ndimage import map_coordinates

CAN = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, CAN)
from Functions.recorte_pro import _yunet  # noqa: E402

N = 33
VARS = {                         # controle: (mínimo, máximo, passo inicial)
    "temp": (-40, 40, 8), "tint": (-40, 40, 8), "exp": (-1.2, 1.2, 0.2),
    "hi": (-70, 50, 15), "wh": (-70, 50, 15), "sh": (-50, 50, 12), "bl": (-60, 50, 12),
    "qs": (40, 130, 15), "qr": (-20, 20, 6),
}
ESCALA = {"temp": 20, "tint": 20, "exp": 0.5, "hi": 40, "wh": 40, "sh": 40, "bl": 40, "qs": 40, "qr": 15}


class Lut:
    """Processo node que devolve a LUT do Luz e Cor para um conjunto de valores."""
    def __init__(self):
        self.p = subprocess.Popen(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "lc_lut.js")],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.cache = {}

    def __call__(self, v):
        k = json.dumps(v, sort_keys=True)
        if k not in self.cache:
            self.p.stdin.write((json.dumps({"v": v, "n": N}) + "\n").encode()); self.p.stdin.flush()
            n = struct.unpack("<I", self.p.stdout.read(4))[0]
            buf = b""
            while len(buf) < n * 4:
                buf += self.p.stdout.read(n * 4 - len(buf))
            self.cache[k] = np.frombuffer(buf, np.float32).reshape(N, N, N, 3)   # [b, g, r, canal]
        return self.cache[k]

    def fechar(self):
        self.p.stdin.close(); self.p.wait(5)


def aplicar(lut, px):
    """px (n, 3) RGB 0..1 → passa pela LUT com interpolação trilinear (como o lut3d do ffmpeg)."""
    c = (px[:, [2, 1, 0]] * (N - 1)).T
    return np.stack([map_coordinates(lut[..., i], c, order=1, mode="nearest") for i in range(3)], 1)


def _duracao(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                                capture_output=True, text=True).stdout.strip() or 0)


def quadros(p, n=8, ini=0.0, fim=None):
    """n quadros espalhados no trecho, RGB 0..1 (n, h, w, 3) na largura LARG, mais o quadro em 540 de largura p/ o rosto."""
    fim = fim or _duracao(p)
    out = []
    for i in range(n):
        t = ini + (fim - ini) * (i + 0.5) / n
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", p, "-frames:v", "1", "-vf", "scale=540:-2",
                              "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        if not raw:
            continue
        h = len(raw) // (540 * 3)
        out.append(np.frombuffer(raw, np.uint8).reshape(h, 540, 3))
    return out


def mascara_pele(img):
    """Pixels de pele do maior rosto (YuNet): miolo do rosto, filtrado por matiz/saturação de pele. None sem rosto."""
    h, w = img.shape[:2]
    y = _yunet(); y.setInputSize((w, h))
    _, fs = y.detect(np.ascontiguousarray(img[..., ::-1]))
    if fs is None or not len(fs):
        return None
    f = max(fs, key=lambda v: v[2] * v[3] * v[14])
    if f[14] < 0.7 or f[2] < 24:
        return None
    x0, y0, fw, fh = f[:4]
    m = np.zeros((h, w), bool)
    m[int(max(0, y0 + fh * 0.3)):int(min(h, y0 + fh * 0.85)), int(max(0, x0 + fw * 0.2)):int(min(w, x0 + fw * 0.8))] = True
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    hue, sat, val = hsv[..., 0] * 360 / 256, hsv[..., 1] / 255, hsv[..., 2] / 255
    return m & ((hue < 55) | (hue > 340)) & (sat > 0.08) & (sat < 0.8) & (val > 0.15) & (val < 0.98)


def amostra(p, n=8, ini=0.0, fim=None, maxpx=160000):
    """Pixels do vídeo (n, 3) e da pele (m, 3) em 0..1, mais a fração de pixel estourado no original."""
    qs = quadros(p, n, ini, fim)
    tudo, pele = [], []
    for img in qs:
        mk = mascara_pele(img)
        if mk is not None and mk.sum() > 50:
            pele.append(img[mk])
        tudo.append(img[::2, ::2].reshape(-1, 3))
    px = np.concatenate(tudo).astype(np.float32) / 255
    if len(px) > maxpx:
        px = px[np.random.default_rng(1).choice(len(px), maxpx, replace=False)]
    pl = np.concatenate(pele).astype(np.float32) / 255 if pele else None
    return px, pl


def _ycc(px):
    Y = 0.2126 * px[:, 0] + 0.7152 * px[:, 1] + 0.0722 * px[:, 2]
    return Y, (px[:, 2] - Y) / 1.8556, (px[:, 0] - Y) / 1.5748


def _hsv(px):
    mx, mn = px.max(1), px.min(1)
    d = mx - mn
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    h = np.where(mx == r, (g - b) / np.maximum(d, 1e-6) % 6, np.where(mx == g, (b - r) / np.maximum(d, 1e-6) + 2, (r - g) / np.maximum(d, 1e-6) + 4)) * 60
    return h % 360, s


def medir(px, pl, neutro):
    """Leitura de escopos de pixels já corrigidos. neutro: máscara (do original) dos pixels sem cor própria."""
    Y, cb, cr = _ycc(px)
    m = {"preto": float(np.percentile(Y, 0.5)), "branco": float(np.percentile(Y, 99.5)), "meio": float(np.median(Y)),
         "estourado": float((px.max(1) >= 0.995).mean()), "esmagado": float((Y <= 0.015).mean()),
         "cb": float(cb[neutro].mean()) if neutro.any() else 0.0, "cr": float(cr[neutro].mean()) if neutro.any() else 0.0}
    if pl is not None:
        Yp, _, _ = _ycc(pl)
        h, s = _hsv(pl)
        # média circular da matiz da pele
        m["pele_matiz"] = float(np.degrees(np.arctan2(np.sin(np.radians(h)).mean(), np.cos(np.radians(h)).mean())) % 360)
        m["pele_sat"] = float(np.median(s))
        m["pele_luz"] = float(np.median(Yp))
    return m


def _fora(x, a, b):
    return (a - x) if x < a else (x - b) if x > b else 0.0


def custo(m, m0, v, look):
    c = 0.0
    c += 40 * _fora(m["branco"], 0.86, 0.95) ** 2
    c += 400 * max(0.0, m["estourado"] - max(0.002, m0["estourado"] * 0.35)) ** 2
    c += 60 * _fora(m["preto"], 0.018, 0.06) ** 2
    c += 600 * max(0.0, m["esmagado"] - 0.003) ** 2
    c += 4 * _fora(m["meio"], 0.32, 0.62) ** 2
    c += 2500 * (_fora(m["cb"], -0.006, 0.004) ** 2 + _fora(m["cr"], -0.004, 0.006) ** 2)   # neutro, um tico quente
    if "pele_matiz" in m:
        dh = (m["pele_matiz"] - 21 + 180) % 360 - 180            # linha de pele ~ 18–24° na matiz HSV
        c += 0.004 * max(0.0, abs(dh) - 3) ** 2
        c += 30 * _fora(m["pele_sat"], 0.2, 0.46) ** 2
        c += 20 * _fora(m["pele_luz"], 0.45, 0.7) ** 2
    c += 0.02 * sum(((v.get(k, 0) - look.get(k, 0 if k not in ("qs",) else 100)) / ESCALA[k]) ** 2 for k in ESCALA)
    return c


def ajustar(p, look=None, lut=None, ini=0.0, fim=None, falar=False):
    """Valores do Luz e Cor para o vídeo p, partindo do look. Devolve (valores, medida_antes, medida_depois)."""
    look = dict(look or {})
    dono = lut is None
    lut = lut or Lut()
    px, pl = amostra(p, ini=ini, fim=fim)
    Y0, cb0, cr0 = _ycc(px)
    neutro = (np.hypot(cb0, cr0) < 0.035) & (Y0 > 0.12) & (Y0 < 0.92)
    cru = medir(px, pl, neutro)

    v = dict(look)
    usa_pele = pl is not None and len(pl) > 200
    if usa_pele:   # faixa da pele no HSL secundário: centro na matiz medida com o look, correção começa neutra
        mlook = medir(aplicar(lut(look), px), aplicar(lut(look), pl), neutro)
        v.update({"qh": round(mlook["pele_matiz"]), "qw": 24, "qf": 60, "qs0": 12, "qs1": 70, "ql0": 15, "ql1": 92,
                  "qs": 100, "qr": 0, "qe": 0})
    nomes = [k for k in VARS if usa_pele or not k.startswith("q")]

    def avalia(vv):
        L = lut(vv)
        return custo(medir(aplicar(L, px), aplicar(L, pl) if usa_pele else None, neutro), cru, vv, look)

    melhor = avalia(v)
    passo = {k: VARS[k][2] for k in nomes}
    for _ in range(10):
        mudou = False
        for k in nomes:
            for s in (+1, -1):
                t = dict(v)
                t[k] = round(min(VARS[k][1], max(VARS[k][0], v.get(k, 0 if k != "qs" else 100) + s * passo[k])), 2)
                c = avalia(t)
                if c < melhor - 1e-6:
                    v, melhor, mudou = t, c, True
                    break
        if not mudou:
            passo = {k: x / 2 for k, x in passo.items()}
            if max(passo[k] / VARS[k][2] for k in nomes) < 0.1:
                break
    for k in list(v):   # inteiros onde o painel usa passo 1 (rodas "cw" e curva "cv" da grade do cliente passam como vieram)
        if k != "exp" and isinstance(v[k], (int, float)):
            v[k] = int(round(v[k]))
    if usa_pele and v.get("qs", 100) == 100 and v.get("qr", 0) == 0:
        for k in ("qh", "qw", "qf", "qs0", "qs1", "ql0", "ql1", "qs", "qr", "qe"):
            v.pop(k, None)
    L = lut(v)
    depois = medir(aplicar(L, px), aplicar(L, pl) if usa_pele else None, neutro)
    antes = medir(aplicar(lut(look), px), aplicar(lut(look), pl) if usa_pele else None, neutro)
    if dono:
        lut.fechar()
    if falar:
        print(os.path.basename(p), json.dumps(v, ensure_ascii=False))
        for nome, m in (("cru", cru), ("só look", antes), ("corrigido", depois)):
            print(f"  {nome:10s}", " ".join(f"{k}={x:.3f}" if isinstance(x, float) and abs(x) < 10 else f"{k}={x:.0f}" for k, x in m.items()))
    return v, antes, depois


def folha(p, v, look, saida, lut, n=3):
    """Folha antes (só look) / depois (corrigido), n quadros, para conferir de olho."""
    qs = quadros(p, n)
    lin = []
    for vv in (look, v):
        L = lut(vv)
        lin.append(np.hstack([(aplicar(L, q.reshape(-1, 3).astype(np.float32) / 255).reshape(q.shape) * 255).clip(0, 255).astype(np.uint8) for q in qs]))
    img = np.vstack(lin)
    img = cv2.resize(img, (img.shape[1] // 2, img.shape[0] // 2), interpolation=cv2.INTER_AREA)
    cv2.imwrite(saida, img[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 85])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--look", default="{}", help="grade do cliente (JSON de valores do lc) usada como ponto de partida")
    ap.add_argument("--folha", help="prefixo das folhas antes/depois (.jpg): uma por vídeo")
    a = ap.parse_args()
    look = json.loads(a.look)
    lut = Lut()
    res = {}
    for p in a.videos:
        v, _, _ = ajustar(p, look, lut, falar=True)
        res[p] = v
        if a.folha:
            folha(p, v, look, f"{a.folha}_{os.path.splitext(os.path.basename(p))[0]}.jpg", lut)
    lut.fechar()
    print(json.dumps(res, ensure_ascii=False))
