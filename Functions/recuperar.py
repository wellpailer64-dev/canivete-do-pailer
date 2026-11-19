"""
recuperar.py — o miolo das ferramentas de recuperação do Photo Kanivete (como as do Photoshop):
  · curar: Pincel de recuperação e Remendo — a textura vem da ORIGEM e a luz/cor da borda do DESTINO
    (correção de luz espalhada da moldura, com peso menor em bordas fortes), por isso o remendo some na pele, no céu, no papel.
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


def _membrana(val, w):
    """Espalha valores conhecidos (val, peso w) por toda a área de forma suave (push-pull em pirâmide):
    a mesma ideia da clonagem de Poisson, mas cada ponto da borda vale pelo seu peso."""
    V, W = [val * w[:, :, None]], [w.copy()]
    while min(W[-1].shape) > 4:
        V.append(cv2.pyrDown(V[-1])); W.append(cv2.pyrDown(W[-1]))
    est = V[-1] / np.maximum(W[-1], 1e-6)[:, :, None]
    for k in range(len(V) - 2, -1, -1):
        h, w_ = W[k].shape
        up = cv2.pyrUp(est, dstsize=(w_, h))
        if up.ndim == 2:
            up = up[:, :, None]
        a = np.clip(W[k] * 4, 0, 1)[:, :, None]
        est = a * (V[k] / np.maximum(W[k], 1e-6)[:, :, None]) + (1 - a) * up
    return est


def curar(regiao_b64, mascara_b64, dx, dy, difusao=0):
    """regiao = trecho da camada (com destino e origem dentro); mascara = onde vai a cura (branco), no mesmo trecho;
    a origem é a mesma forma deslocada (dx, dy). difusao (0-7) amacia a borda da máscara.
    Textura da origem + correção de luz/cor tirada da moldura em volta do destino. Diferente do seamlessClone,
    pontos da moldura sobre bordas fortes ou cores fora do comum (um fio, um cabelo cruzando) quase não pesam,
    então não "escorrem" mancha para dentro do remendo."""
    reg = _bgra(_ler(regiao_b64))
    m = _ler(mascara_b64, cv2.IMREAD_UNCHANGED)
    m = m[:, :, 3] if m.ndim == 3 and m.shape[2] == 4 else (cv2.cvtColor(m, cv2.COLOR_BGR2GRAY) if m.ndim == 3 else m)
    m = (m > 127).astype(np.uint8) * 255
    h, w = m.shape
    ys, xs = np.nonzero(m)
    if not len(xs):
        return {"success": False, "error": "máscara vazia"}
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    dx, dy = int(dx), int(dy)
    if x0 + dx < 0 or y0 + dy < 0 or x1 + dx > w or y1 + dy > h:
        return {"success": False, "error": "a origem sai da imagem"}
    bgr = cv2.cvtColor(reg, cv2.COLOR_BGRA2BGR)
    f = bgr.astype(np.float32)
    # fonte alinhada ao destino: fonte[y, x] = imagem[y + dy, x + dx]
    T = np.float32([[1, 0, dx], [0, 1, dy]])
    fonte = cv2.warpAffine(f, T, (w, h), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    # moldura: anel de 3 px logo fora da área
    anel = (cv2.dilate(m, np.ones((7, 7), np.uint8)) > 0) & (m == 0)
    if not anel.any():
        anel = m > 0
    dif = f - fonte
    # peso de cada ponto da moldura: baixo em borda forte (destino ou fonte) e em diferença fora do comum
    g = lambda im: cv2.magnitude(cv2.Sobel(im, cv2.CV_32F, 1, 0), cv2.Sobel(im, cv2.CV_32F, 0, 1))
    grad = np.maximum(g(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)),
                      g(cv2.cvtColor(fonte.clip(0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)))
    da = dif[anel]
    med = np.median(da, 0)
    mad = np.median(np.abs(da - med), 0) + 2
    desvio = np.abs(dif - med) / (3 * mad)
    peso_anel = (1 / (1 + (grad / 60) ** 2)) * (1 / (1 + (desvio.max(2)) ** 2))
    pw = np.where(anel, peso_anel, 0).astype(np.float32) + np.where(anel, 1e-3, 0).astype(np.float32)
    corr = _membrana(dif.astype(np.float32), pw)
    res = fonte + corr
    peso = m.astype(np.float32) / 255
    if difusao:
        k = int(difusao) * 2 + 1
        peso = cv2.GaussianBlur(peso, (k * 2 + 1, k * 2 + 1), 0)
    peso = peso[:, :, None]
    out = (res * peso + f * (1 - peso)).clip(0, 255).astype(np.uint8)
    return {"success": True, "png": _png(np.dstack([out, reg[:, :, 3]]))}


def _melhor_pedaco(bgr, m):
    """Procura em volta o pedaço REAL que melhor continua a moldura da mancha (como o Photoshop): compara a moldura
    (anel em volta da área) em todas as posições e evita pedaços com borda/objeto (textura diferente da moldura)."""
    h, w = m.shape
    ys, xs = np.nonzero(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    anel_px = max(4, int(max(x1 - x0, y1 - y0) * 0.25))
    dil = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * anel_px + 1,) * 2))
    bx0, by0 = max(0, x0 - anel_px), max(0, y0 - anel_px)
    bx1, by1 = min(w, x1 + anel_px), min(h, y1 + anel_px)
    tpl = bgr[by0:by1, bx0:bx1].astype(np.float32)
    anel = ((dil[by0:by1, bx0:bx1] > 0) & (m[by0:by1, bx0:bx1] == 0)).astype(np.float32)
    th, tw = anel.shape
    if th >= h or tw >= w or anel.sum() < 8:
        return None
    img = bgr.astype(np.float32)
    mask3 = cv2.merge([anel] * 3)
    custo = cv2.matchTemplate(img, tpl, cv2.TM_SQDIFF, mask=mask3) / max(1.0, anel.sum())
    # miolo: o pedaço inteiro (não só a moldura) deve ter a cor média e o grão da moldura, senão traz borda/objeto
    miolo = (m[by0:by1, bx0:bx1] > 0).astype(np.float32)
    k = miolo / miolo.sum()
    ch, cw = custo.shape
    media = cv2.filter2D(img, -1, k, anchor=(0, 0), borderType=cv2.BORDER_CONSTANT)[:ch, :cw]
    quad = cv2.filter2D(img * img, -1, k, anchor=(0, 0), borderType=cv2.BORDER_CONSTANT)[:ch, :cw]
    var = np.maximum(0, quad - media * media).sum(2)
    px_anel = tpl[anel > 0]
    m_anel, v_anel = px_anel.mean(0), px_anel.var(0).sum()
    custo = custo + 3.0 * ((media - m_anel) ** 2).sum(2) + 2.0 * np.maximum(0, var - v_anel * 1.5)
    # proibido: o miolo do candidato não pode cair na mancha (nem colado nela)
    proib = cv2.dilate((dil > 0).astype(np.uint8), miolo.astype(np.uint8), anchor=(0, 0))
    custo[proib[:ch, :cw] > 0] = np.inf
    if not np.isfinite(custo).any():
        return None
    # leve preferência por perto
    yy, xx = np.mgrid[:custo.shape[0], :custo.shape[1]]
    dist = np.hypot(xx - bx0, yy - by0) / max(w, h)
    custo = custo * (1 + 0.5 * dist)
    custo[~np.isfinite(custo)] = np.inf
    cy, cx = np.unravel_index(np.argmin(custo), custo.shape)
    return int(cx - bx0), int(cy - by0)


def preencher(regiao_b64, mascara_b64, raio=6):
    """Reconstrói a área branca da máscara com textura REAL da vizinhança: acha o melhor pedaço em volta
    (_melhor_pedaco) e o mistura por Poisson (curar). Sem pedaço possível, cai no inpaint liso."""
    reg = _bgra(_ler(regiao_b64))
    m = _ler(mascara_b64, cv2.IMREAD_UNCHANGED)
    m = m[:, :, 3] if m.ndim == 3 and m.shape[2] == 4 else (cv2.cvtColor(m, cv2.COLOR_BGR2GRAY) if m.ndim == 3 else m)
    m = (m > 127).astype(np.uint8) * 255
    if not m.any():
        return {"success": False, "error": "máscara vazia"}
    bgr = cv2.cvtColor(reg, cv2.COLOR_BGRA2BGR)
    try:
        d = _melhor_pedaco(bgr, m)
    except cv2.error:
        d = None
    if d:
        r = curar(regiao_b64, mascara_b64, d[0], d[1], 2)
        if r.get("success"):
            return r
    out = cv2.inpaint(bgr, m, max(1, int(raio)), cv2.INPAINT_TELEA)
    alfa = reg[:, :, 3].copy()
    alfa[m > 0] = cv2.inpaint(alfa, m, 3, cv2.INPAINT_TELEA)[m > 0]
    return {"success": True, "png": _png(np.dstack([out, alfa]))}
