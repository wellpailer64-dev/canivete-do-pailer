"""Substituição de céu (Photo Kanivete: Editar › Substituição de céu, como o Photoshop) — a máscara do céu.

Modelo: SkySeg (U2Net, MIT; github.com/xiongzhu666/Sky-Segmentation-and-Post-processing, ONNX em
huggingface.co/JianyuanWang/skyseg), entrada 320×320 RGB normalizada (ImageNet), saída já em 0..1 (sigmoide) — sem
normalizar pelo mínimo/máximo, que inventava céu numa foto sem céu (testado 2026-10-07). CPU ~0,4 s.
A máscara de 320 px é refinada na resolução da foto (_refinar): cor na faixa de dúvida, buracos fechados e filtro
guiado pela própria foto (He et al.) — a borda acompanha galhos, nuvens baixas e prédios. Modelo (~170 MB) baixado na primeira vez, conferido pelo MD5.
"""
import base64
import hashlib
import os
import threading
import urllib.request

import cv2
import numpy as np

MODELO = {
    "arquivo": "skyseg.onnx",
    "url": "https://huggingface.co/JianyuanWang/skyseg/resolve/main/skyseg.onnx",
    "md5": "0f30538873daccc3732be582491a30fa",
    "tamanho_mb": 168,
}
_trava = threading.RLock()
_sessao = {"s": None}
_cache = {}   # sha1 da foto → máscara base (float32), para os ajustes de borda não rodarem o modelo de novo


def modelo_path():
    from Functions.midia import modelo_path as mp
    return mp("ceu", MODELO["arquivo"])


def garantir_modelo(progresso=None):
    path = modelo_path()
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".download"
    try:
        with urllib.request.urlopen(MODELO["url"], timeout=30) as resp, open(tmp, "wb") as out:
            total = int(resp.headers.get("Content-Length") or MODELO["tamanho_mb"] * 1048576)
            baixado = 0
            while True:
                bloco = resp.read(1024 * 1024)
                if not bloco:
                    break
                out.write(bloco)
                baixado += len(bloco)
                if progresso:
                    progresso(min(99, baixado / total * 100), f"Baixando o modelo de céu (só na primeira vez)... {baixado / 1048576:.0f}/{total / 1048576:.0f} MB")
        h = hashlib.md5()
        with open(tmp, "rb") as f:
            for bloco in iter(lambda: f.read(1024 * 1024), b""):
                h.update(bloco)
        if h.hexdigest().lower() != MODELO["md5"]:
            raise RuntimeError("o download do modelo de céu veio corrompido; tente de novo")
        os.replace(tmp, path)
        return path
    except Exception:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        raise


def _sess():
    with _trava:
        if _sessao["s"] is None:
            import onnxruntime as ort
            so = ort.SessionOptions()
            so.intra_op_num_threads = os.cpu_count() or 4
            _sessao["s"] = ort.InferenceSession(garantir_modelo(), so, providers=["CPUExecutionProvider"])
        return _sessao["s"]


def liberar():
    with _trava:
        _sessao["s"] = None
        _cache.clear()


def _guiado(guia, p, r, eps):
    """Filtro guiado (He, Sun, Tang): p (0..1) seguindo as bordas de guia (cinza 0..1)."""
    caixa = lambda a: cv2.boxFilter(a, -1, (r, r))
    mI, mp_ = caixa(guia), caixa(p)
    cov = caixa(guia * p) - mI * mp_
    var = caixa(guia * guia) - mI * mI
    a = cov / (var + eps)
    b = mp_ - a * mI
    return caixa(a) * guia + caixa(b)


def mascara(rgb):
    """rgb uint8 H×W×3 → máscara do céu float32 0..1 (H×W)."""
    H, W = rgb.shape[:2]
    x = cv2.resize(rgb, (320, 320), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    x = ((x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)).transpose(2, 0, 1)[None]
    s = _sess()
    p = s.run(None, {s.get_inputs()[0].name: x.astype(np.float32)})[0][0, 0]
    p = np.clip(p, 0, 1).astype(np.float32)
    return _refinar(rgb, p).astype(np.float32)


def _refinar(rgb, p320):
    """Máscara de 320 px → resolução da foto (até 2048 no maior lado; acima disso amplia o resultado):
    1) na faixa de dúvida do modelo (0,1 < p < 0,6) decide pela COR — k-means em Lab das cores do céu certo (p > 0,9)
       e do não-céu certo (p < 0,05, afastado da borda): entra o azul entre galhos e as nuvens baixas, sem levar o
       carro branco ou o reflexo do para-brisa (com a faixa até 0,98 a cor do carro furava as nuvens; abaixo de 0,1 o
       reflexo virava céu — testado 2026-10-07);
    2) não-céu cercado de céu que não encosta na base da foto vira céu (miolo de nuvem, vão fechado);
    3) filtro guiado fino pela foto (borda antisserrilhada)."""
    H, W = rgb.shape[:2]
    esc = min(1.0, 2048 / max(H, W))
    w2, h2 = max(1, round(W * esc)), max(1, round(H * esc))
    img = cv2.resize(rgb, (w2, h2), interpolation=cv2.INTER_AREA) if esc < 1 else rgb
    p = cv2.resize(p320, (w2, h2), interpolation=cv2.INTER_LINEAR)
    lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    certo_ceu = (p > 0.9).ravel()
    certo_chao = (cv2.erode((p < 0.05).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0).ravel()
    rng = np.random.default_rng(1)

    def centros(sel, k):
        idx = np.nonzero(sel)[0]
        if len(idx) < k * 20:
            return None
        amostra = lab[rng.choice(idx, min(len(idx), 20000), replace=False)]
        _, _, c = cv2.kmeans(amostra, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5), 2, cv2.KMEANS_PP_CENTERS)
        return c

    q = p.copy()
    cs, cn = centros(certo_ceu, 6), centros(certo_chao, 10)
    if cs is not None and cn is not None:
        banda = ((p > 0.1) & (p < 0.6)).ravel()
        if banda.any():
            L = lab[banda]
            ds = np.min(np.linalg.norm(L[:, None] - cs[None], axis=2), 1)
            dn = np.min(np.linalg.norm(L[:, None] - cn[None], axis=2), 1)
            pc = np.clip((dn / (ds + dn + 1e-6) - 0.35) / 0.3, 0, 1)
            qq = q.ravel()
            qq[banda] = pc
            q = qq.reshape(h2, w2)
    nao = (q < 0.5).astype(np.uint8)
    n, rot, st, _ = cv2.connectedComponentsWithStats(nao, 8)
    na_base = set(np.unique(rot[-max(2, h2 // 50):, :]).tolist())
    for i in range(1, n):
        if i not in na_base and st[i, 4] < 0.03 * h2 * w2:
            q[rot == i] = 1.0
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    q = np.clip(_guiado(g, q.astype(np.float32), 3, 1e-4), 0, 1)
    if (w2, h2) != (W, H):
        q = cv2.resize(q, (W, H), interpolation=cv2.INTER_LINEAR)
    return q


def ajustar(m, deslocar=0, esmaecer=0):
    """Deslocar borda (px; + aumenta o céu, − diminui) e esmaecer borda (px de suavização), como no Photoshop."""
    d = int(round(deslocar))
    if d:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * abs(d) + 1, 2 * abs(d) + 1))
        m = cv2.dilate(m, k) if d > 0 else cv2.erode(m, k)
    e = float(esmaecer or 0)
    if e > 0:
        m = cv2.GaussianBlur(m, (0, 0), e / 2)
    return np.clip(m, 0, 1)


def _ler(b64, modo=cv2.IMREAD_UNCHANGED):
    s = b64.split(",", 1)[1] if "," in b64[:80] else b64
    return cv2.imdecode(np.frombuffer(base64.b64decode(s), np.uint8), modo)


def mascara_b64(foto_b64, deslocar=0, esmaecer=0, progresso=None):
    """Para a página: foto (PNG) → {png: máscara do céu (cinza), cobertura (0..1), caixa [x, y, w, h], cor (hex média
    do céu da foto)}; sem céu (cobertura < 1%) → success False."""
    chave = hashlib.sha1(foto_b64.encode()).hexdigest()
    bgr = _ler(foto_b64, cv2.IMREAD_COLOR)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    if chave not in _cache:
        if progresso:
            progresso(30, "Procurando o céu...")
        _cache.clear()
        _cache[chave] = mascara(rgb)
    m = ajustar(_cache[chave], deslocar, esmaecer)
    cob = float((m > 0.5).mean())
    if cob < 0.01:
        return {"success": False, "semCeu": True, "error": "não encontrei céu nesta imagem: selecione o céu e use de novo"}
    ys, xs = np.nonzero(m > 0.5)
    ok, buf = cv2.imencode(".png", (m * 255).round().astype(np.uint8))
    cor = rgb[m > 0.8].mean(0) if (m > 0.8).any() else rgb[m > 0.5].mean(0)
    return {"success": True, "png": base64.b64encode(buf.tobytes()).decode("ascii"), "cobertura": round(cob, 4),
            "caixa": [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)],
            "cor": "#%02x%02x%02x" % tuple(int(v) for v in cor)}


def cor_horizonte_b64(ceu_b64):
    """Cor média da parte de baixo do céu novo (a luz que ele joga no primeiro plano)."""
    bgr = _ler(ceu_b64, cv2.IMREAD_COLOR)
    h = bgr.shape[0]
    b, g, r = bgr[int(h * 0.55):].reshape(-1, 3).mean(0)
    return "#%02x%02x%02x" % (int(r), int(g), int(b))
