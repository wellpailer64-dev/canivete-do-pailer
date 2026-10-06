"""
recorte_pro.py — Recorte profissional (Photo Kanivete: Remover plano de fundo; KNV.gerar recortar).

Sem serrilhado, sem resto de cor do fundo, sem borrar a borda:
1. alfa por MATTING (BiRefNet-matting, 1024): transparência fina — cabelo, vapor, borda antisserrilhada;
2. miolo sólido pela SEGMENTAÇÃO (BiRefNet geral lite): o matting às vezes deixa folha clara translúcida; onde a
   segmentação tem certeza (2 px para dentro da borda) e a cor é bem diferente do fundo, o alfa é opaco. Vapor/vidro
   (cor perto do fundo) e toda a borda ficam com o matting;
3. alfa ampliado para a resolução cheia com Fast Guided Filter colorido (He et al.): a borda segue a borda da foto;
4. cor do primeiro plano por Blur-Fusion (Forte & Pitié 2021): tira a mistura do fundo dos pixels de borda e
   semitransparentes (o "Descontaminar cores" do Photoshop). No miolo (alfa 1) a cor não muda.

Comparado no protótipo (D:/kanivete_testes/recorte) com o recorte antigo em cabelo crespo, flor, palmeira, café com
vapor e foto real. ~30 s na CPU para 1024², mais na foto grande (o filtro roda na resolução cheia).
"""
import base64
import io

import cv2
import numpy as np
from PIL import Image

from Functions.removerfundo import _get_sessao, garantir_modelo

MEDIA, DESVIO = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)


def _alfa_modelo(rgb, modelo_id):
    path, cfg = garantir_modelo(modelo_id)
    lado = cfg["lado"]
    s = _get_sessao(path)
    x = cv2.resize(rgb, (lado, lado), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    x = (x - MEDIA) / DESVIO
    y = s.run(None, {s.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[-1][0, 0]
    return y if 0 <= y.min() and y.max() <= 1 else 1 / (1 + np.exp(-y))   # BEN2 já sai em 0–1; BiRefNet sai em logit


def _box(x, r):
    return cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), normalize=True, borderType=cv2.BORDER_REFLECT)


def _guiado(I, p, r, eps):
    """Filtro guiado colorido: q = A·I + b (coeficientes suavizados)."""
    mI, mp = _box(I, r), _box(p, r)
    cov = _box(I * p[..., None], r) - mI * mp[..., None]
    var = np.empty(I.shape[:2] + (3, 3), np.float32)
    for i in range(3):
        for j in range(i, 3):
            var[..., i, j] = var[..., j, i] = _box(I[..., i] * I[..., j], r) - mI[..., i] * mI[..., j]
    var += eps * np.eye(3, dtype=np.float32)
    A = np.linalg.solve(var, cov[..., None])[..., 0]
    b = mp - np.sum(A * mI, axis=2)
    return np.sum(_box(A, r) * I, axis=2) + _box(b, r)


def _alfa_cheio(rgb, aq, eps=1e-5):
    """Alfa do modelo (quadrado) → resolução cheia, refinado pelo filtro guiado só na faixa de transição."""
    H, W = rgb.shape[:2]
    p = cv2.resize(aq.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
    r = max(2, round(max(H, W) / 512))
    faixa = cv2.dilate(((p > 0.01) & (p < 0.99)).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=r + 2).astype(bool)
    if not faixa.any():
        return p
    ys, xs = np.where(faixa)   # filtra só o retângulo da faixa (foto grande: bem mais rápido)
    y0, y1, x0, x1 = max(0, ys.min() - 3 * r), min(H, ys.max() + 3 * r + 1), max(0, xs.min() - 3 * r), min(W, xs.max() + 3 * r + 1)
    q = _guiado(rgb[y0:y1, x0:x1].astype(np.float32) / 255.0, p[y0:y1, x0:x1], r, eps)
    a = p.copy()
    sub = a[y0:y1, x0:x1]
    sub[faixa[y0:y1, x0:x1]] = q[faixa[y0:y1, x0:x1]]
    return np.clip(a, 0, 1)


def _miolo_solido(rgb, a, seg):
    H, W = rgb.shape[:2]
    s = cv2.resize(seg.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
    k = max(2, round(max(H, W) / 512))
    nucleo = cv2.erode((s > 0.9).astype(np.uint8), np.ones((2 * k + 1, 2 * k + 1), np.uint8)).astype(np.float32)
    nucleo = cv2.GaussianBlur(nucleo, (0, 0), k * 0.6)
    fundo = a < 0.02
    B = np.median(rgb[fundo], axis=0).astype(np.float32) if fundo.sum() > 100 else np.array([255, 255, 255], np.float32)
    dist = np.linalg.norm(rgb.astype(np.float32) - B, axis=2) / 255.0
    longe = np.clip((dist - 0.12) / 0.18, 0, 1)
    return np.maximum(a, nucleo * longe)


def _fb(img, F, B, a, r):
    ba = cv2.blur(a, (r, r))
    bF = cv2.blur(F * a[..., None], (r, r)) / (ba[..., None] + 1e-5)
    bB = cv2.blur(B * (1 - a)[..., None], (r, r)) / ((1 - ba)[..., None] + 1e-5)
    return np.clip(bF + a[..., None] * (img - a[..., None] * bF - (1 - a[..., None]) * bB), 0, 1), bB


def _primeiro_plano(rgb, a):
    img = rgb.astype(np.float32) / 255.0
    F, bB = _fb(img, img, img, a, 90)
    F, _ = _fb(img, F, bB, a, 6)
    return (F * 255 + 0.5).astype(np.uint8)


_FACE = None
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"


def _yunet():
    """Detector de rosto YuNet (OpenCV, 230 KB, baixado na 1ª vez) — o Haar via rosto em cozinha e não via mulher real."""
    global _FACE
    if _FACE is None:
        import os, urllib.request
        from Functions.midia import modelo_path
        p = modelo_path("u2net", "yunet-2023mar.onnx")
        if not os.path.exists(p):
            os.makedirs(os.path.dirname(p), exist_ok=True)
            urllib.request.urlretrieve(YUNET_URL, p + ".tmp"); os.replace(p + ".tmp", p)
        _FACE = cv2.FaceDetectorYN.create(p, "", (320, 320), 0.75, 0.3, 5000)
    return _FACE


def tem_pessoa(rgb):
    """Rosto na foto (YuNet, ~15 ms em 640 px)? Decide o caminho do recorte. Sem o detector: trata como objeto."""
    try:
        d = _yunet()
    except Exception as e:
        print(f"[recorte] sem detector de rosto ({e}); tratando como objeto")
        return False
    k = min(1.0, 640 / max(rgb.shape[:2]))
    img = cv2.resize(rgb, None, fx=k, fy=k, interpolation=cv2.INTER_AREA) if k < 1 else rgb
    d.setInputSize((img.shape[1], img.shape[0]))
    _, rostos = d.detect(cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    lado = min(img.shape[:2])
    return rostos is not None and any(r[2] >= lado * 0.06 for r in rostos)   # rosto pequeno no fundo não conta


def aquecer_para(path):
    """Depois de gerar: decide pessoa/objeto (20 ms) e deixa o modelo certo carregado (a carga é 7–16 s na placa;
    a cena pede o recorte logo depois). Falha aqui não importa: o recorte carrega na hora."""
    try:
        rgb = np.array(Image.open(path).convert("RGB"))
        path_m, _ = garantir_modelo("birefnet-matting" if tem_pessoa(rgb) else "ben2")
        _get_sessao(path_m)
    except Exception as e:
        print(f"[recorte] aquecer: {e}")


def recortar(rgb, tipo=None):
    """rgb (H×W×3 uint8) → (cores H×W×3 sem o fundo misturado, alfa H×W uint8).
    tipo: "pessoa" | "objeto" | None (decide pelo rosto). Comparado em 2026-10-06 (D:/kanivete_testes/recorte2):
    pessoa → matting sozinho (cabelo: buracos limpos, fios finos; o miolo sólido por um 2º modelo obrigava dois na
    placa e não mudava o resultado no zoom); objeto → BEN2 sozinho (sólido e limpo; o matting deixava vidro/óleo
    transparentes e o miolo antigo manchava o gargalo). GPU: pessoa ~6 s (1ª vez +16 s de carga), objeto ~1 s."""
    tipo = tipo or ("pessoa" if tem_pessoa(rgb) else "objeto")
    if tipo == "pessoa":
        a = _alfa_cheio(rgb, _alfa_modelo(rgb, "birefnet-matting"))
    else:
        a = _alfa_cheio(rgb, _alfa_modelo(rgb, "ben2"))
    a[a < 0.015] = 0
    a[a > 0.985] = 1
    return _primeiro_plano(rgb, a), (a * 255 + 0.5).astype(np.uint8)


def recorte_b64(png_b64, tipo=None):
    """Camada em PNG (base64) → {png: cores descontaminadas (RGBA, alfa original da camada), mascara: alfa do recorte}.
    Onde a camada já era transparente, a máscara continua 0."""
    img = Image.open(io.BytesIO(base64.b64decode(png_b64.split(",", 1)[-1])))
    alfa0 = np.array(img.getchannel("A")) if img.mode in ("RGBA", "LA") else None
    fundo = Image.new("RGB", img.size, (255, 255, 255))
    fundo.paste(img.convert("RGB"), mask=img.getchannel("A") if alfa0 is not None else None)
    rgb = np.array(fundo)
    F, a = recortar(rgb, tipo)
    if alfa0 is not None:
        a = np.minimum(a, alfa0)
    out = Image.fromarray(np.dstack([F, alfa0 if alfa0 is not None else np.full(a.shape, 255, np.uint8)]), "RGBA")
    b1, b2 = io.BytesIO(), io.BytesIO()
    out.save(b1, format="PNG")
    Image.fromarray(a).save(b2, format="PNG")
    return {"png": base64.b64encode(b1.getvalue()).decode("ascii"), "mascara": base64.b64encode(b2.getvalue()).decode("ascii")}
