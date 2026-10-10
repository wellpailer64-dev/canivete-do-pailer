"""Preenchimento sensível ao conteúdo (Photo Kanivete: Editar › Preenchimento sensível ao conteúdo, como o Photoshop).

Tira o que está na seleção e reconstrói com o que está em volta usando o LaMa (big-lama, Apache-2.0; ONNX da Carve,
entrada fixa 512×512 — https://huggingface.co/Carve/LaMa-ONNX). Roda na CPU (~2 s por bloco de 512): no DirectML a parte
de Fourier do modelo falha (MatMul do FFC, testado 2026-10-07). O modelo (~200 MB) é baixado na primeira vez.

Como o Photoshop, a área é EXPANDIDA alguns pixels: com a borda do objeto de fora (halo, sombra, antisserrilhado) o LaMa
"reconstrói" o objeto a partir do contorno que sobrou (medido: o exemplo da Carve com a máscara cortada em >127 em vez
de >0 deixava a pessoa como um fantasma). Regiões distantes são feitas uma por vez, cada uma com o seu entorno, na
resolução original quando cabem em 512 px (senão, reduzidas para o LaMa e ampliadas de volta — mais macias).
"""
import base64
import hashlib
import os
import threading
import urllib.request

import cv2
import numpy as np


def _hw_threads_ia():
    """Threads de IA no processador pelo núcleo de hardware (Functions/hardware.py)."""
    from Functions import hardware
    return hardware.threads_ia()


MODELO = {
    "arquivo": "lama_fp32.onnx",
    "url": "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx",
    "md5": "2777748dc5275b27dafc63c5d4f1f730",
    "tamanho_mb": 199,
}
LADO = 512
_trava = threading.RLock()
_sessao = {"s": None}


def modelo_path():
    from Functions.midia import modelo_path as mp
    return mp("lama", MODELO["arquivo"])


def _md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest().lower()


def modelo_pronto():
    return os.path.exists(modelo_path())


def garantir_modelo(progresso=None):
    """Baixa o LaMa na primeira vez (conferindo o MD5). progresso(pct, texto)."""
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
                    progresso(min(99, baixado / total * 100), f"Baixando o modelo de preenchimento (só na primeira vez)... {baixado / 1048576:.0f}/{total / 1048576:.0f} MB")
        if _md5(tmp) != MODELO["md5"]:
            raise RuntimeError("o download do modelo de preenchimento veio corrompido; tente de novo")
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
            so.intra_op_num_threads = _hw_threads_ia()
            _sessao["s"] = ort.InferenceSession(garantir_modelo(), so, providers=["CPUExecutionProvider"])
        from Functions import memoria
        memoria.usado("preencher (LaMa)", liberar)   # parado 5 min: sai da memória
        return _sessao["s"]


def liberar():
    """Solta a memória do modelo (~800 MB na CPU)."""
    with _trava:
        _sessao["s"] = None
    import gc
    gc.collect()


def _lama(rgb512, mask512):
    """Uma passada do LaMa: rgb uint8 512×512×3 e máscara (0/1) 512×512 → rgb uint8."""
    x = (rgb512.astype(np.float32) / 255).transpose(2, 0, 1)[None]
    m = (mask512 > 0).astype(np.float32)[None, None]
    out = _sess().run(None, {"image": x, "mask": m})[0][0].transpose(1, 2, 0)
    return np.clip(out, 0, 255).astype(np.uint8)


def _regioes(m, margem_min=48):
    """Retângulos das partes da máscara (as próximas juntas), cada um com o entorno que o LaMa vai ver."""
    n, _, st, _ = cv2.connectedComponentsWithStats(m, 8)
    rets = [[int(st[i, 0]), int(st[i, 1]), int(st[i, 0] + st[i, 2]), int(st[i, 1] + st[i, 3])] for i in range(1, n)]

    def com_margem(r):
        mg = max(margem_min, int(0.6 * max(r[2] - r[0], r[3] - r[1])))
        return [r[0] - mg, r[1] - mg, r[2] + mg, r[3] + mg]

    juntou = True
    while juntou and len(rets) > 1:   # junta as que se tocam com o entorno (um objeto partido não vira dois)
        juntou = False
        for i in range(len(rets)):
            for j in range(i + 1, len(rets)):
                a, b = com_margem(rets[i]), com_margem(rets[j])
                if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                    rets[i] = [min(rets[i][0], rets[j][0]), min(rets[i][1], rets[j][1]), max(rets[i][2], rets[j][2]), max(rets[i][3], rets[j][3])]
                    del rets[j]
                    juntou = True
                    break
            if juntou:
                break
    return [com_margem(r) for r in rets]


def preencher(rgb, mascara, expandir=None, progresso=None):
    """rgb uint8 H×W×3; mascara uint8 H×W (>0 = preencher). Devolve (rgb preenchido, alfa usado 0..255 H×W)."""
    H, W = mascara.shape
    m = (mascara > 0).astype(np.uint8)
    if not m.any():
        raise ValueError("seleção vazia")
    e = int(expandir) if expandir else max(4, round(0.004 * max(H, W)) + 2)
    md = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * e + 1, 2 * e + 1)))
    out = rgb.copy()
    regs = _regioes(md)
    for k, (x0, y0, x1, y1) in enumerate(regs):
        if progresso:
            progresso(int(k / len(regs) * 100), f"Preenchendo pelo conteúdo ({k + 1}/{len(regs)})...")
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        sub, subm = out[y0:y1, x0:x1], md[y0:y1, x0:x1]
        ch, cw = subm.shape
        lado = max(cw, ch)
        esc = 1.0 if lado <= LADO else LADO / lado
        if esc < 1:
            sw, sh = max(1, round(cw * esc)), max(1, round(ch * esc))
            sub_r = cv2.resize(sub, (sw, sh), interpolation=cv2.INTER_AREA)
            m_r = (cv2.resize(subm * 255, (sw, sh), interpolation=cv2.INTER_AREA) > 0).astype(np.uint8)
        else:
            sub_r, m_r, sw, sh = sub, subm, cw, ch
        # completa até 512 espelhando (o espelho não tem nada a preencher)
        img = np.pad(sub_r, ((0, LADO - sh), (0, LADO - sw), (0, 0)), mode="symmetric")
        msk = np.pad(m_r, ((0, LADO - sh), (0, LADO - sw)), mode="constant")
        res = _lama(img, msk)[:sh, :sw]
        if esc < 1:
            res = cv2.resize(res, (cw, ch), interpolation=cv2.INTER_CUBIC)
        # dentro da área: o resultado; borda de ~2 px suave por fora, para não aparecer a emenda
        a = cv2.GaussianBlur(cv2.dilate(subm, np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 1.2)
        a = np.maximum(a, subm.astype(np.float32))[:, :, None]
        out[y0:y1, x0:x1] = (res.astype(np.float32) * a + sub.astype(np.float32) * (1 - a)).round().astype(np.uint8)
    if progresso:
        progresso(100, "Pronto")
    alfa = cv2.GaussianBlur(cv2.dilate(md, np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 1.2)
    alfa = np.maximum(alfa, md.astype(np.float32))
    return out, (alfa * 255).round().astype(np.uint8)


def _ler(b64, modo=cv2.IMREAD_UNCHANGED):
    s = b64.split(",", 1)[1] if "," in b64[:80] else b64
    return cv2.imdecode(np.frombuffer(base64.b64decode(s), np.uint8), modo)


def _png(arr):
    ok, buf = cv2.imencode(".png", arr)
    return base64.b64encode(buf.tobytes()).decode("ascii")


def preencher_b64(regiao_b64, mascara_b64, expandir=None, progresso=None):
    """Para a página: trecho (PNG RGBA) + máscara (PNG, alfa ou cinza = onde preencher) → {png do trecho preenchido
    (RGBA; a transparência da área vem da vizinhança), alfa: PNG da área usada (expandida + borda suave)}."""
    reg = _ler(regiao_b64)
    if reg.ndim == 2:
        reg = cv2.cvtColor(reg, cv2.COLOR_GRAY2BGRA)
    elif reg.shape[2] == 3:
        reg = cv2.cvtColor(reg, cv2.COLOR_BGR2BGRA)
    m = _ler(mascara_b64)
    m = m[:, :, 3] if m.ndim == 3 and m.shape[2] == 4 else (cv2.cvtColor(m, cv2.COLOR_BGR2GRAY) if m.ndim == 3 else m)
    rgb = cv2.cvtColor(reg, cv2.COLOR_BGRA2RGB)
    out, alfa_area = preencher(rgb, m, expandir, progresso)
    a = reg[:, :, 3].copy()
    dentro = alfa_area > 0
    if (a[~dentro] if (~dentro).any() else a).min() < 255 and dentro.any():   # camada com transparência: alfa da vizinhança
        a[dentro] = cv2.inpaint(a, dentro.astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)[dentro]
    else:
        a[dentro] = 255
    bgra = np.dstack([cv2.cvtColor(out, cv2.COLOR_RGB2BGR), a])
    return {"success": True, "png": _png(bgra), "alfa": _png(alfa_area)}
