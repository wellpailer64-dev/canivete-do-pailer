"""
removerfundo.py
===============
Remove o fundo de imagens usando onnxruntime + modelo ISNet (ou U2Net) diretamente.
Não depende do import do rembg em tempo de execução — mais robusto no .exe

Resultado: PNG com fundo transparente salvo em /sem_fundo
"""

import hashlib
import os
import urllib.request
import numpy as np
from PIL import Image, ImageOps, ImageFilter


def _hw_threads_ia():
    """Threads de IA no processador pelo núcleo de hardware (Functions/hardware.py)."""
    from Functions import hardware
    return hardware.threads_ia()


try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass

FORMATOS_SUPORTADOS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".heic", ".heif", ".avif"}


def _abrir(path):
    """Abre já na orientação certa (fotos de celular guardam a rotação no EXIF)."""
    img = Image.open(path)
    return (ImageOps.exif_transpose(img) or img).convert("RGBA")


# =========================
# 📁 PASTA DO MODELO
# =========================
MODELOS = {
    # ISNet recorta cabelo e bordas bem melhor que o U2Net, com custo parecido.
    "isnet": {
        "nome": "ISNet (rápido)",
        "arquivo": "isnet-general-use.onnx",
        "lado": 1024,
        "mean": (0.5, 0.5, 0.5),
        "std": (1.0, 1.0, 1.0),
    },
    "birefnet-lite": {
        "nome": "BiRefNet Lite (qualidade máxima)",
        "arquivo": "birefnet-general-lite.onnx",
        "lado": 1024,
        "mean": (0.485, 0.456, 0.406),
        "std": (0.229, 0.224, 0.225),
        "sigmoid": True,
        "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
        "md5": "4fab47adc4ff364be1713e97b7e66334",
        "tamanho_mb": 214,
    },
    # Matting (alfa fino: cabelo, vapor, borda antisserrilhada) — usado pelo recorte profissional (recorte_pro.py)
    "birefnet-matting": {
        "nome": "BiRefNet Matting (recorte profissional)",
        "arquivo": "birefnet-matting.onnx",
        "lado": 1024,
        "mean": (0.485, 0.456, 0.406),
        "std": (0.229, 0.224, 0.225),
        "sigmoid": True,
        "url": "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-matting-epoch_100.onnx",
        "md5": "95d7129b7abd6120b571e848f269a8ab",
        "tamanho_mb": 928,
    },
    # BEN2 (MIT): segmentação rápida e limpa — na GPU ~1 s (BiRefNet Lite ~5 s), objeto sólido sem mancha no vidro.
    # Usado no recorte de objetos e como "miolo sólido" do recorte de pessoas (2026-10-06, D:/kanivete_testes/recorte2)
    "ben2": {
        "nome": "BEN2 (rápido, objetos)",
        "arquivo": "ben2-base.onnx",
        "lado": 1024,
        "mean": (0.485, 0.456, 0.406),
        "std": (0.229, 0.224, 0.225),
        "url": "https://huggingface.co/PramaLLC/BEN2/resolve/main/BEN2_Base.onnx",
        "md5": "a12dafe4080f53e8818726b298bd90bc",
        "tamanho_mb": 223,
    },
    # Fallback legado: menor qualidade, mas salva o fluxo se só ele existir.
    "u2net": {
        "nome": "U2Net (legado)",
        "arquivo": "u2net.onnx",
        "lado": 320,
        "mean": (0.485, 0.456, 0.406),
        "std": (0.229, 0.224, 0.225),
    },
}
ORDEM_FALLBACK = ("isnet", "u2net")
_sessoes = {}


def _modelo_cfg(modelo_id=None):
    return MODELOS.get(modelo_id or "isnet") or MODELOS["isnet"]


def _modelo_path_cfg(modelo_id=None):
    from Functions.midia import modelo_path
    cfg = _modelo_cfg(modelo_id)
    return modelo_path("u2net", cfg["arquivo"]), cfg


def _get_modelo(modelo_id=None):
    path, cfg = _modelo_path_cfg(modelo_id)
    if os.path.exists(path):
        return path, cfg
    for mid in ORDEM_FALLBACK:
        path, cfg = _modelo_path_cfg(mid)
        if os.path.exists(path):
            return path, cfg
    return path, cfg


_md5_ok = set()   # (caminho, tamanho, data) já conferidos — refazer o MD5 de 1 GB a cada recorte custava segundos


def _verificar_md5(path, esperado):
    if not esperado or not os.path.exists(path):
        return True
    chave = (path, os.path.getsize(path), os.path.getmtime(path))
    if chave in _md5_ok:
        return True
    h = hashlib.md5()
    with open(path, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    ok = h.hexdigest().lower() == esperado.lower()
    if ok:
        _md5_ok.add(chave)
    return ok


def garantir_modelo(modelo_id="isnet", callback_log=None, callback_progresso=None):
    """Garante o modelo pedido. Modelos opcionais são baixados na primeira vez."""
    path, cfg = _modelo_path_cfg(modelo_id)
    if os.path.exists(path) and _verificar_md5(path, cfg.get("md5")):
        if callback_log:
            callback_log(f"Modelo: {cfg['nome']}")
        return path, cfg

    url = cfg.get("url")
    if not url:
        fallback_path, fallback_cfg = _get_modelo(None)
        if callback_log:
            callback_log(f"Modelo solicitado não encontrado; usando {fallback_cfg['nome']}.")
        return fallback_path, fallback_cfg

    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".download"
    total = int(cfg.get("tamanho_mb", 0) * 1024 * 1024)
    if callback_log:
        callback_log(f"Baixando {cfg['nome']} (~{cfg.get('tamanho_mb', '?')} MB) na primeira utilização...")
    try:
        with urllib.request.urlopen(url, timeout=30) as resp, open(tmp, "wb") as out:
            total = int(resp.headers.get("Content-Length") or total or 0)
            baixado = 0
            while True:
                bloco = resp.read(1024 * 1024)
                if not bloco:
                    break
                out.write(bloco)
                baixado += len(bloco)
                if callback_progresso and total:
                    callback_progresso(min(100, baixado / total * 100), f"Baixando modelo... {baixado / 1048576:.0f}/{total / 1048576:.0f} MB")
        if not _verificar_md5(tmp, cfg.get("md5")):
            raise RuntimeError("download do modelo falhou na verificação")
        os.replace(tmp, path)
        if callback_log:
            callback_log("Modelo BiRefNet pronto.")
        return path, cfg
    except Exception:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
        raise


_dispositivo = {"atual": None}   # "gpu" (DirectML) | "cpu" — decidido na primeira sessão; CANIVETE_RECORTE_CPU=1 força CPU
_gpu_ok = {}                     # modelo → (nível, desligadas) que já rodou na placa: a troca de modelo não repete o teste (~6 s)


def dispositivo():
    return _dispositivo["atual"] or "?"


import threading
_trava_sessao = threading.RLock()   # aquecer (thread) e recortar (chamada) não criam a mesma sessão em dobro


def _get_sessao(modelo_path):
    with _trava_sessao:
        return _get_sessao_(modelo_path)


def _get_sessao_(modelo_path):
    """Carregar o modelo leva segundos: a sessão é criada uma vez e reaproveitada.
    GPU automática: onnxruntime-directml (qualquer placa DX12) com a otimização de grafo DESLIGADA — ligada, o BiRefNet
    quebra no DirectML (fusão de operadores). A sessão nova roda uma inferência de teste; se falhar, fica na CPU (e a
    máquina passa a usar CPU nas próximas). Medido (RTX 3050): BEN2 0,9 s × 14,5 s na CPU; matting 6 s × 21 s."""
    if modelo_path not in _sessoes:   # uma por modelo (o recorte profissional usa dois em seguida)
        import onnxruntime as ort
        s = None
        if _dispositivo["atual"] != "cpu" and not os.environ.get("CANIVETE_RECORTE_CPU") and "DmlExecutionProvider" in ort.get_available_providers():
            # UMA sessão por vez na placa: com o matting aberto, o BEN2 caía de 0,9 s para 5–8 s e o matting de 6 para
            # 14 s (8 GB transbordam para a memória compartilhada). Trocar de modelo solta o anterior.
            if _sessoes:
                import gc
                _sessoes.clear(); gc.collect()
            # o que quebra o BiRefNet no DirectML é só a ConstantFolding: nível básico sem ela carrega em ~4 s (sem
            # otimização nenhuma: ~16 s); se ainda falhar, sem otimização; se falhar de novo, CPU
            niveis = [(ort.GraphOptimizationLevel.ORT_ENABLE_BASIC, ["ConstantFolding"]), (ort.GraphOptimizationLevel.ORT_DISABLE_ALL, [])]
            for nivel, desligadas in ([_gpu_ok[modelo_path]] if modelo_path in _gpu_ok else niveis):
                try:
                    so = ort.SessionOptions()
                    so.enable_mem_pattern = False
                    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                    so.graph_optimization_level = nivel
                    s = ort.InferenceSession(modelo_path, so, providers=["DmlExecutionProvider", "CPUExecutionProvider"], disabled_optimizers=desligadas)
                    if modelo_path not in _gpu_ok:
                        i = s.get_inputs()[0]
                        lado = i.shape[2] if isinstance(i.shape[2], int) else 320
                        s.run(None, {i.name: np.random.rand(1, 3, lado, lado).astype(np.float32)})   # teste: falha aqui → próximo
                        _gpu_ok[modelo_path] = (nivel, desligadas)
                    _dispositivo["atual"] = "gpu"
                    break
                except Exception as e:
                    print(f"[recorte] GPU ({nivel}) falhou: {type(e).__name__}")
                    s = None
            if s is None:
                print("[recorte] GPU indisponível; usando CPU")
                _dispositivo["atual"] = "cpu"
        if s is None:
            so = ort.SessionOptions()
            so.intra_op_num_threads = _hw_threads_ia()
            s = ort.InferenceSession(modelo_path, so, providers=["CPUExecutionProvider"])
            _dispositivo["atual"] = _dispositivo["atual"] or "cpu"
        _sessoes[modelo_path] = s
    from Functions import memoria
    memoria.usado("remover fundo", liberar_sessoes, memoria.GPU)   # VRAM: parado 3 min, sai
    return _sessoes[modelo_path]


def liberar_sessoes():
    """Solta a memória (VRAM/RAM) dos modelos de recorte — antes de gerar imagem, que também usa a placa."""
    if _sessoes:
        import gc
        with _trava_sessao:
            _sessoes.clear()
        gc.collect()


def _estimar_cor_fundo(rgb_np, alpha_np):
    """Estima a cor do fundo original usando áreas que a máscara removeu."""
    candidatos = alpha_np <= 8
    if np.count_nonzero(candidatos) < 64:
        candidatos = alpha_np <= 24

    if np.count_nonzero(candidatos) < 64:
        h, w = alpha_np.shape
        borda = max(4, min(h, w) // 40)
        candidatos = np.zeros_like(alpha_np, dtype=bool)
        candidatos[:borda, :] = True
        candidatos[-borda:, :] = True
        candidatos[:, :borda] = True
        candidatos[:, -borda:] = True

    pixels = rgb_np[candidatos]
    if pixels.size == 0:
        return np.array((255, 255, 255), dtype=np.float32)
    return np.median(pixels, axis=0).astype(np.float32)


def _descontaminar_borda(img_rgb, alpha_np):
    """Remove a cor do fundo antigo dos pixels semi-transparentes e da franja."""
    rgb_np = np.array(img_rgb, dtype=np.float32)
    foreground = alpha_np > 0
    if not np.any(foreground):
        return img_rgb

    cor_fundo = _estimar_cor_fundo(rgb_np, alpha_np)
    alpha = alpha_np.astype(np.float32) / 255.0

    fundo_expandido = Image.fromarray(255 - alpha_np).filter(ImageFilter.MaxFilter(9))
    perto_do_fundo = np.array(fundo_expandido, dtype=np.float32) / 255.0

    rgb_c = rgb_np - rgb_np.mean(axis=2, keepdims=True)
    fundo_c = cor_fundo - cor_fundo.mean()
    fundo_norm = max(float(np.linalg.norm(fundo_c)), 1e-6)
    rgb_norm = np.maximum(np.linalg.norm(rgb_c, axis=2), 1e-6)
    cos = np.sum(rgb_c * fundo_c, axis=2) / (rgb_norm * fundo_norm)
    similaridade_cor = np.clip((cos - 0.45) / 0.55, 0.0, 1.0)

    distancia = np.linalg.norm(rgb_np - cor_fundo, axis=2) / 441.7
    similaridade_luz = np.clip(1.0 - distancia / 0.85, 0.0, 1.0)
    similaridade = similaridade_cor * similaridade_luz

    luma = rgb_np[..., 0] * 0.2126 + rgb_np[..., 1] * 0.7152 + rgb_np[..., 2] * 0.0722
    protecao_pele = np.where((alpha > 0.9) & (luma > 90), 0.35, 1.0)

    vazamento_alpha = (1.0 - alpha) * 0.95
    vazamento_borda = perto_do_fundo * similaridade * 0.42 * protecao_pele
    vazamento = np.maximum(vazamento_alpha, vazamento_borda)
    vazamento = np.clip(vazamento * foreground.astype(np.float32), 0.0, 0.72)

    if not np.any(vazamento > 0.01):
        return img_rgb

    denominador = np.clip(1.0 - vazamento, 0.12, 1.0)[..., None]
    rgb_limpo = (rgb_np - vazamento[..., None] * cor_fundo) / denominador
    rgb_limpo = np.clip(rgb_limpo, 0, 255)

    peso = np.clip(vazamento * 1.35, 0.0, 0.95)[..., None]
    saida = rgb_np * (1.0 - peso) + rgb_limpo * peso
    return Image.fromarray(np.clip(saida, 0, 255).astype(np.uint8), "RGB")


# =========================
# 🧠 INFERÊNCIA DIRETA VIA ONNX
# =========================
def _remover_fundo_onnx(img_pil, modelo_path, cfg=None):
    """
    Remove o fundo usando onnxruntime diretamente.
    Retorna imagem PIL RGBA com fundo transparente.
    """
    cfg = cfg or next((m for m in MODELOS.values() if m["arquivo"] == os.path.basename(modelo_path)), MODELOS["u2net"])
    lado, mean, std = cfg["lado"], cfg["mean"], cfg["std"]

    img = img_pil.convert("RGB").resize((lado, lado), Image.LANCZOS)
    img_np = np.array(img, dtype=np.float32)
    img_np = img_np / max(float(img_np.max()), 1e-6)
    img_np = (img_np - np.array(mean)) / np.array(std)

    # HWC → CHW → NCHW
    img_np = img_np.transpose(2, 0, 1)[np.newaxis, :].astype(np.float32)

    sess    = _get_sessao(modelo_path)
    input_n = sess.get_inputs()[0].name
    output  = sess.run(None, {input_n: img_np})[0]

    # Máscara → imagem original
    mask = output[0, 0]
    if cfg.get("sigmoid"):
        mask = 1 / (1 + np.exp(-mask))
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)

    # Redimensiona máscara para tamanho original
    w, h  = img_pil.size
    mask_img = Image.fromarray((mask * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    mask_np  = np.array(mask_img)

    # Aplica máscara como canal alpha e limpa halos coloridos na franja.
    img_original = img_pil.convert("RGB")
    img_limpa = _descontaminar_borda(img_original, mask_np)
    r, g, b = img_limpa.split()
    resultado = Image.merge("RGBA", (r, g, b, Image.fromarray(mask_np)))

    return resultado


def mascara_assunto_b64(png_b64, modelo_id="ben2"):
    """Photo Kanivete (Remover plano de fundo / Selecionar assunto): recebe a camada em PNG (base64) e devolve a
    máscara do assunto em PNG cinza (base64, branco = fica), no tamanho da camada. Só a máscara: a camada continua
    com os pixels dela (máscara de camada, como o Photoshop faz)."""
    import base64
    import io
    path, cfg = garantir_modelo(modelo_id)
    img = Image.open(io.BytesIO(base64.b64decode(png_b64.split(",", 1)[-1])))
    alfa_original = img.getchannel("A") if img.mode in ("RGBA", "LA") else None
    fundo = Image.new("RGB", img.size, (255, 255, 255))
    if alfa_original is not None:
        fundo.paste(img.convert("RGB"), mask=alfa_original)   # transparente vira branco (o modelo não vê alfa)
    else:
        fundo = img.convert("RGB")
    mascara = _remover_fundo_onnx(fundo, path, cfg).getchannel("A")
    if alfa_original is not None:   # onde a camada já era transparente continua fora
        mascara = Image.fromarray(np.minimum(np.array(mascara), np.array(alfa_original)))
    buf = io.BytesIO()
    mascara.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# =========================
# ✂️ REMOVER FUNDO DE UM ARQUIVO
# =========================
def remover_fundo_arquivo(path, pasta_saida, callback_log=None, modelo_id="isnet"):
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_SUPORTADOS:
        if callback_log:
            callback_log(f"Ignorado: {os.path.basename(path)} (formato nao suportado)")
        return False

    modelo_path, modelo_cfg = _get_modelo(modelo_id)
    if not os.path.exists(modelo_path):
        if callback_log:
            callback_log(f"❌ Modelo nao encontrado: {modelo_path}")
        return False

    os.makedirs(pasta_saida, exist_ok=True)
    nome_base  = os.path.splitext(os.path.basename(path))[0]
    nome_saida = nome_base + "_sem_fundo.png"
    path_saida = os.path.join(pasta_saida, nome_saida)

    try:
        if callback_log:
            callback_log(f"🔄 Processando: {os.path.basename(path)}...")

        img_pil   = _abrir(path)
        resultado = _remover_fundo_onnx(img_pil, modelo_path, modelo_cfg)
        resultado.save(path_saida, format="PNG")

        if callback_log:
            callback_log(f"✅ Pronto: {nome_saida}")
        return True

    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro em {os.path.basename(path)}: {e}")
        return False


# =========================
# 🖼️ MODO PREVIEW (sem salvar em disco)
# =========================
def _img_para_b64(img_pil, max_px=1100, fmt="PNG"):
    import base64
    from io import BytesIO
    w, h = img_pil.size
    if max(w, h) > max_px:
        ratio = max_px / max(w, h)
        img_pil = img_pil.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = BytesIO()
    if fmt == "JPEG":
        img_pil.convert("RGB").save(buf, format="JPEG", quality=88)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    else:
        img_pil.save(buf, format="PNG")
        return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


def processar_imagem_preview(path, callback_log=None, modelo_id="isnet"):
    """Processa sem salvar. Retorna dict com previews b64 e resultado PIL full-res."""
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_SUPORTADOS:
        if callback_log:
            callback_log(f"⏭️ Ignorado: {os.path.basename(path)}")
        return None

    modelo_path, modelo_cfg = _get_modelo(modelo_id)
    if not os.path.exists(modelo_path):
        if callback_log:
            callback_log(f"❌ Modelo não encontrado: {modelo_path}")
        return None

    try:
        if callback_log:
            callback_log(f"🔄 Processando: {os.path.basename(path)}...")
        img_original = _abrir(path)
        img_resultado = _remover_fundo_onnx(img_original, modelo_path, modelo_cfg)
        if callback_log:
            callback_log(f"✅ Pronto: {os.path.basename(path)}")
        return {
            "nome": os.path.basename(path),
            "path_original": path,
            "original_b64":  _img_para_b64(img_original.convert("RGB"), fmt="JPEG"),
            "resultado_b64": _img_para_b64(img_resultado, fmt="PNG"),
            "resultado_pil": img_resultado,
        }
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro em {os.path.basename(path)}: {e}")
        return None
