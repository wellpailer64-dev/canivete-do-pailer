"""
removerfundo.py
===============
Remove o fundo de imagens usando onnxruntime + modelo u2net diretamente.
Não depende do import do rembg em tempo de execução — mais robusto no .exe

Resultado: PNG com fundo transparente salvo em /sem_fundo
"""

import os
import sys
import numpy as np
from PIL import Image

FORMATOS_SUPORTADOS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}


# =========================
# 📁 PASTA DO MODELO
# =========================
def _get_modelo_path():
    if hasattr(sys, "_MEIPASS"):
        exe_dir = os.path.dirname(sys.executable)
    else:
        exe_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(exe_dir, "modelos_ia", "u2net", "u2net.onnx")


# =========================
# 🧠 INFERÊNCIA DIRETA VIA ONNX
# Sem depender do rembg como pacote
# =========================
def _remover_fundo_onnx(img_pil, modelo_path):
    """
    Remove o fundo usando onnxruntime diretamente.
    Retorna imagem PIL RGBA com fundo transparente.
    """
    import onnxruntime as ort

    # Prepara a imagem
    img = img_pil.convert("RGB").resize((320, 320), Image.LANCZOS)
    img_np = np.array(img, dtype=np.float32) / 255.0

    # Normalização padrão do u2net
    mean = np.array([0.485, 0.456, 0.406])
    std  = np.array([0.229, 0.224, 0.225])
    img_np = (img_np - mean) / std

    # HWC → CHW → NCHW
    img_np = img_np.transpose(2, 0, 1)[np.newaxis, :].astype(np.float32)

    # Inferência
    sess    = ort.InferenceSession(modelo_path, providers=["CPUExecutionProvider"])
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
    r, g, b, a   = img_original.split()
    resultado     = Image.merge("RGBA", (r, g, b, Image.fromarray(mask_np)))

    return resultado


# =========================
# ✂️ REMOVER FUNDO DE UM ARQUIVO
# =========================
def remover_fundo_arquivo(path, pasta_saida, callback_log=None):
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_SUPORTADOS:
        if callback_log:
            callback_log(f"⏭️  Ignorado: {os.path.basename(path)}")
        return False

    modelo_path = _get_modelo_path()
    if not os.path.exists(modelo_path):
        if callback_log:
            callback_log(f"❌ Modelo não encontrado: {modelo_path}")
            callback_log("   Feche e abra o app novamente para baixar os modelos.")
        return False

    nome_base  = os.path.splitext(os.path.basename(path))[0]
    nome_saida = nome_base + "_sem_fundo.png"
    path_saida = os.path.join(pasta_saida, nome_saida)

    try:
        if callback_log:
            callback_log(f"🔄 Processando: {os.path.basename(path)}...")

        img_pil   = Image.open(path).convert("RGBA")
        resultado = _remover_fundo_onnx(img_pil, modelo_path)
        resultado.save(path_saida, format="PNG")

        if callback_log:
            callback_log(f"✅ {os.path.basename(path)} → {nome_saida}")
        return True

    except Exception as e:
        import traceback
        if callback_log:
            callback_log(f"❌ Erro em {os.path.basename(path)}: {e}")
            callback_log(traceback.format_exc()[-300:])
        return False


# =========================
# 📁 REMOVER FUNDO DE PASTA
# =========================
def remover_fundo_pasta(pasta, callback_progresso=None, callback_log=None):
    pasta_saida = os.path.join(pasta, "sem_fundo")
    os.makedirs(pasta_saida, exist_ok=True)

    arquivos = [
        os.path.join(pasta, f) for f in os.listdir(pasta)
        if os.path.isfile(os.path.join(pasta, f))
        and os.path.splitext(f)[1].lower() in FORMATOS_SUPORTADOS
    ]

    total       = len(arquivos)
    processados = 0
    falhas      = 0

    if callback_log:
        callback_log(f"📥 {total} imagem(ns) encontrada(s)")

    if total == 0:
        if callback_progresso:
            callback_progresso(100, "Nenhuma imagem encontrada")
        return {"total": 0, "processados": 0, "falhas": 0}

    for i, path in enumerate(arquivos):
        sucesso = remover_fundo_arquivo(path, pasta_saida, callback_log=callback_log)
        if sucesso: processados += 1
        else:       falhas      += 1

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Processando... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {"total": total, "processados": processados, "falhas": falhas}


# =========================
# 📄 REMOVER FUNDO DE LISTA
# =========================
def remover_fundo_arquivos(lista_paths, callback_progresso=None, callback_log=None):
    if not lista_paths:
        return {"total": 0, "processados": 0, "falhas": 0}

    pasta_saida = os.path.join(os.path.dirname(lista_paths[0]), "sem_fundo")
    os.makedirs(pasta_saida, exist_ok=True)

    total       = len(lista_paths)
    processados = 0
    falhas      = 0

    if callback_log:
        callback_log(f"📥 {total} arquivo(s) selecionado(s)")

    for i, path in enumerate(lista_paths):
        sucesso = remover_fundo_arquivo(path, pasta_saida, callback_log=callback_log)
        if sucesso: processados += 1
        else:       falhas      += 1

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Processando... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {"total": total, "processados": processados, "falhas": falhas}


# =========================
# 🖥️ CLI
# =========================
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Uso: python removerfundo.py <pasta_ou_arquivo>")
        sys.exit(1)

    alvo = sys.argv[1]
    if os.path.isdir(alvo):
        r = remover_fundo_pasta(alvo, callback_log=print)
    elif os.path.isfile(alvo):
        r = remover_fundo_arquivos([alvo], callback_log=print)
    else:
        print("Caminho inválido.")
        sys.exit(1)

    print(f"\n🔥 FINALIZADO")
    print(f"  Total      : {r['total']}")
    print(f"  Processados: {r['processados']}")
    print(f"  Falhas     : {r['falhas']}")
