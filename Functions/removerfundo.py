"""
removerfundo.py
===============
Remove o fundo de imagens usando onnxruntime + modelo ISNet (ou U2Net) diretamente.
Não depende do import do rembg em tempo de execução — mais robusto no .exe

Resultado: PNG com fundo transparente salvo em /sem_fundo
"""

import os
import sys
import numpy as np
from PIL import Image, ImageOps

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
# Modelos em ordem de preferência: (arquivo, lado da entrada, média, desvio)
# ISNet recorta cabelo e bordas bem melhor que o U2Net, com custo parecido.
MODELOS = [
    ("isnet-general-use.onnx", 1024, (0.5, 0.5, 0.5), (1.0, 1.0, 1.0)),
    ("u2net.onnx", 320, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
]
_sessao = {"path": None, "sess": None}


def _get_modelo():
    from Functions.midia import modelo_path
    for arquivo, lado, mean, std in MODELOS:
        p = modelo_path("u2net", arquivo)
        if os.path.exists(p):
            return p, lado, mean, std
    return modelo_path("u2net", MODELOS[-1][0]), *MODELOS[-1][1:]


def _get_modelo_path():
    return _get_modelo()[0]


def _get_sessao(modelo_path):
    """Carregar o modelo leva segundos: a sessão é criada uma vez e reaproveitada."""
    if _sessao["path"] != modelo_path:
        import onnxruntime as ort
        _sessao["sess"] = ort.InferenceSession(modelo_path, providers=["CPUExecutionProvider"])
        _sessao["path"] = modelo_path
    return _sessao["sess"]


# =========================
# 🧠 INFERÊNCIA DIRETA VIA ONNX
# =========================
def _remover_fundo_onnx(img_pil, modelo_path):
    """
    Remove o fundo usando onnxruntime diretamente.
    Retorna imagem PIL RGBA com fundo transparente.
    """
    lado, mean, std = next((m[1:] for m in MODELOS if m[0] == os.path.basename(modelo_path)), MODELOS[-1][1:])

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
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)

    # Redimensiona máscara para tamanho original
    w, h  = img_pil.size
    mask_img = Image.fromarray((mask * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    mask_np  = np.array(mask_img)

    # Aplica máscara como canal alpha
    img_original = img_pil.convert("RGBA")
    r, g, b, _   = img_original.split()
    resultado     = Image.merge("RGBA", (r, g, b, Image.fromarray(mask_np)))

    return resultado


# =========================
# ✂️ REMOVER FUNDO DE UM ARQUIVO
# =========================
def remover_fundo_arquivo(path, pasta_saida, callback_log=None):
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_SUPORTADOS:
        if callback_log:
            callback_log(f"Ignorado: {os.path.basename(path)} (formato nao suportado)")
        return False

    modelo_path = _get_modelo_path()
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
        resultado = _remover_fundo_onnx(img_pil, modelo_path)
        resultado.save(path_saida, format="PNG")

        if callback_log:
            callback_log(f"✅ Pronto: {nome_saida}")
        return True

    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro em {os.path.basename(path)}: {e}")
        return False


# =========================
# 📁 REMOVER FUNDO DE PASTA
# =========================
def remover_fundo_pasta(pasta, callback_progresso=None, callback_log=None):
    pasta_saida = os.path.join(pasta, "sem_fundo")
    
    arquivos = [
        os.path.join(pasta, f) for f in os.listdir(pasta)
        if os.path.isfile(os.path.join(pasta, f))
        and os.path.splitext(f)[1].lower() in FORMATOS_SUPORTADOS
    ]

    total       = len(arquivos)
    processados = 0
    falhas      = 0

    if total == 0:
        if callback_log:
            callback_log("Nenhuma imagem encontrada na pasta.")
        if callback_progresso:
            callback_progresso(100, "Concluido (vazio)")
        return {"total": 0, "processados": 0, "falhas": 0}

    os.makedirs(pasta_saida, exist_ok=True)

    for i, path in enumerate(arquivos):
        sucesso = remover_fundo_arquivo(path, pasta_saida, callback_log=callback_log)
        if sucesso: processados += 1
        else:       falhas      += 1

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Processando... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "Concluido")

    return {"total": total, "processados": processados, "falhas": falhas}


# =========================
# 📄 REMOVER FUNDO DE LISTA
# =========================
def remover_fundo_arquivos(lista_paths, callback_progresso=None, callback_log=None):
    if not lista_paths:
        return {"total": 0, "processados": 0, "falhas": 0}

    pasta_saida = os.path.join(os.path.dirname(lista_paths[0]), "sem_fundo")
    total       = len(lista_paths)
    processados = 0
    falhas      = 0

    for i, path in enumerate(lista_paths):
        sucesso = remover_fundo_arquivo(path, pasta_saida, callback_log=callback_log)
        if sucesso: processados += 1
        else:       falhas      += 1

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Processando... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "Concluido")

    return {"total": total, "processados": processados, "falhas": falhas}


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


def processar_imagem_preview(path, callback_log=None):
    """Processa sem salvar. Retorna dict com previews b64 e resultado PIL full-res."""
    import base64
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_SUPORTADOS:
        if callback_log:
            callback_log(f"⏭️ Ignorado: {os.path.basename(path)}")
        return None

    modelo_path = _get_modelo_path()
    if not os.path.exists(modelo_path):
        if callback_log:
            callback_log(f"❌ Modelo não encontrado: {modelo_path}")
        return None

    try:
        if callback_log:
            callback_log(f"🔄 Processando: {os.path.basename(path)}...")
        img_original = _abrir(path)
        img_resultado = _remover_fundo_onnx(img_original, modelo_path)
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
