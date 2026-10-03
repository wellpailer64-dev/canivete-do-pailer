"""
recuperar.py — o miolo das ferramentas de recuperação do Photo Kanivete (como as do Photoshop):
  · curar: Pincel de recuperação e Remendo — a textura vem da ORIGEM e a luz/cor da borda do DESTINO
    (clonagem de Poisson, cv2.seamlessClone), por isso o remendo some na pele, no céu, no papel.
  · preencher: Pincel de recuperação para manchas e Remendo "sensível ao conteúdo" — reconstrói a área a partir
    do que está em volta (cv2.inpaint, Telea), bom para manchas, fios, poeira, pequenos objetos.
A página manda PNGs (base64) do trecho da camada; a resposta é o trecho pronto, com o alfa original.
"""

import base64

import cv2
import numpy as np


def _ler(b64, flags=cv2.IMREAD_UNCHANGED):
    if "," in b64[:80]:
        b64 = b64.split(",", 1)[1]
    return cv2.imdecode(np.frombuffer(base64.b64decode(b64), np.uint8), flags)


def _png(img):
    ok, buf = cv2.imencode(".png", img)
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _bgra(img):
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    if img.shape[2] == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    return img


def curar(regiao_b64, mascara_b64, dx, dy, difusao=0):
    """regiao = trecho da camada (com destino e origem dentro); mascara = onde vai a cura (branco), no mesmo trecho;
    a origem é a mesma forma deslocada (dx, dy). difusao (0-7) amacia a borda da máscara."""
    reg = _bgra(_ler(regiao_b64))
    m = _ler(mascara_b64, cv2.IMREAD_UNCHANGED)
    m = m[:, :, 3] if m.ndim == 3 and m.shape[2] == 4 else (cv2.cvtColor(m, cv2.COLOR_BGR2GRAY) if m.ndim == 3 else m)
    m = (m > 127).astype(np.uint8) * 255
    h, w = m.shape
    ys, xs = np.nonzero(m)
    if not len(xs):
        return {"success": False, "error": "máscara vazia"}
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    sx0, sy0 = x0 + int(dx), y0 + int(dy)
    if sx0 < 0 or sy0 < 0 or sx0 + (x1 - x0) > w or sy0 + (y1 - y0) > h:
        return {"success": False, "error": "a origem sai da imagem"}
    bgr = cv2.cvtColor(reg, cv2.COLOR_BGRA2BGR)
    fonte = bgr[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)].copy()
    mm = m[y0:y1, x0:x1].copy()
    # o seamlessClone exige a máscara longe da borda da imagem: margem de 2 px
    pad = 2
    destino = cv2.copyMakeBorder(bgr, pad, pad, pad, pad, cv2.BORDER_REFLECT)
    mm[[0, -1], :] = 0
    mm[:, [0, -1]] = 0
    if not mm.any():
        return {"success": False, "error": "área pequena demais"}
    centro = (int(x0 + pad + (x1 - x0) / 2), int(y0 + pad + (y1 - y0) / 2))
    try:
        res = cv2.seamlessClone(fonte, destino, mm, centro, cv2.NORMAL_CLONE)[pad:-pad, pad:-pad]
    except cv2.error as e:
        return {"success": False, "error": str(e)}
    peso = m.astype(np.float32) / 255
    if difusao:
        k = int(difusao) * 2 + 1
        peso = cv2.GaussianBlur(peso, (k * 2 + 1, k * 2 + 1), 0)
    peso = peso[:, :, None]
    out = (res.astype(np.float32) * peso + bgr.astype(np.float32) * (1 - peso)).clip(0, 255).astype(np.uint8)
    return {"success": True, "png": _png(np.dstack([out, reg[:, :, 3]]))}


def preencher(regiao_b64, mascara_b64, raio=6):
    """Reconstrói a área branca da máscara a partir da vizinhança (sensível ao conteúdo)."""
    reg = _bgra(_ler(regiao_b64))
    m = _ler(mascara_b64, cv2.IMREAD_UNCHANGED)
    m = m[:, :, 3] if m.ndim == 3 and m.shape[2] == 4 else (cv2.cvtColor(m, cv2.COLOR_BGR2GRAY) if m.ndim == 3 else m)
    m = (m > 127).astype(np.uint8) * 255
    if not m.any():
        return {"success": False, "error": "máscara vazia"}
    bgr = cv2.cvtColor(reg, cv2.COLOR_BGRA2BGR)
    out = cv2.inpaint(bgr, m, max(1, int(raio)), cv2.INPAINT_TELEA)
    # grão de volta (o inpaint deixa liso): ruído com o desvio da vizinhança
    viz = cv2.dilate(m, np.ones((15, 15), np.uint8)) & ~m
    if viz.any():
        dp = float(np.std(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)[viz > 0] - cv2.GaussianBlur(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), (5, 5), 0)[viz > 0]))
        ruido = np.random.default_rng(7).normal(0, min(dp, 12), out.shape[:2]).astype(np.float32)[:, :, None]
        out = np.where(m[:, :, None] > 0, (out.astype(np.float32) + ruido).clip(0, 255), out).astype(np.uint8)
    alfa = reg[:, :, 3].copy()
    alfa[m > 0] = cv2.inpaint(alfa, m, 3, cv2.INPAINT_TELEA)[m > 0]
    return {"success": True, "png": _png(np.dstack([out, alfa]))}
