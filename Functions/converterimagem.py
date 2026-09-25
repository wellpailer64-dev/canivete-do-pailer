"""
converterimagem.py
==================
Converte imagens entre formatos (Pillow + pillow-heif + rawpy).

Entrada: WEBP, PNG, JPG, BMP, TIFF, GIF, ICO, TGA, PPM, AVIF, HEIC/HEIF, CR2/NEF/ARW/DNG
Saída:   WEBP, PNG, JPG, AVIF, BMP, TIFF, GIF, ICO

O original é mantido; o convertido vai para /convertidas ao lado do arquivo.
Perfil de cor (ICC) e EXIF são preservados quando o formato de saída aceita.
"""

import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageOps

from Functions.midia import workers

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIF_DISPONIVEL = True
except ImportError:
    HEIF_DISPONIVEL = False

EXTENSOES_HEIF = {".heic", ".heif", ".hif"}
EXTENSOES_RAW = {".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".orf", ".rw2"}

FORMATOS_ENTRADA = {
    ".webp", ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".gif",
    ".ico", ".tga", ".ppm", ".avif", *EXTENSOES_HEIF, *EXTENSOES_RAW,
}

FORMATOS_SAIDA = {
    "WEBP": ".webp",
    "PNG": ".png",
    "JPEG": ".jpg",
    "AVIF": ".avif",
    "BMP": ".bmp",
    "TIFF": ".tiff",
    "GIF": ".gif",
    "ICO": ".ico",
    "TGA": ".tga",
    "PPM": ".ppm",
}

# Formatos sem canal alpha: transparência vira fundo branco
FORMATOS_SEM_ALPHA = {"JPEG", "BMP", "PPM", "TGA"}
# Formatos que carregam EXIF / perfil ICC
COM_EXIF = {"JPEG", "WEBP", "AVIF", "TIFF", "PNG"}


def _abrir_imagem(path):
    if os.path.splitext(path)[1].lower() in EXTENSOES_RAW:
        import rawpy
        with rawpy.imread(path) as raw:
            return Image.fromarray(raw.postprocess(use_camera_wb=True))
    img = Image.open(path)
    return ImageOps.exif_transpose(img) or img


def _normalizar_formato_saida(formato_saida):
    formato = str(formato_saida or "").strip().upper().lstrip(".")
    return {"JPG": "JPEG", "TIF": "TIFF"}.get(formato, formato)


def converter_imagem(path, formato_saida, pasta_saida, callback_log=None):
    """Converte uma imagem para pasta_saida. Retorna True se converteu."""
    log = callback_log or (lambda m: None)
    nome = os.path.basename(path)
    ext_entrada = os.path.splitext(path)[1].lower()
    formato_saida = _normalizar_formato_saida(formato_saida)

    if ext_entrada not in FORMATOS_ENTRADA:
        log(f"⏭️ Ignorado (formato não suportado): {nome}")
        return False
    if ext_entrada in EXTENSOES_HEIF and not HEIF_DISPONIVEL:
        log(f"❌ HEIC/HEIF precisa do pillow-heif: {nome}")
        return False

    ext_saida = FORMATOS_SAIDA.get(formato_saida, f".{formato_saida.lower()}")
    if ext_entrada == ext_saida or (ext_entrada == ".jpeg" and ext_saida == ".jpg"):
        log(f"⏭️ Já está em {formato_saida}: {nome}")
        return False

    path_saida = os.path.join(pasta_saida, os.path.splitext(nome)[0] + ext_saida)
    try:
        img = _abrir_imagem(path)
        icc = img.info.get("icc_profile")
        exif = img.getexif() if hasattr(img, "getexif") else None

        if formato_saida in FORMATOS_SEM_ALPHA:
            if img.mode in ("RGBA", "LA", "P", "PA"):
                rgba = img.convert("RGBA")
                fundo = Image.new("RGB", img.size, (255, 255, 255))
                fundo.paste(rgba, mask=rgba.split()[-1])
                img = fundo
            else:
                img = img.convert("RGB")
        elif img.mode not in ("RGB", "RGBA", "L", "LA"):
            img = img.convert("RGBA")

        opcoes = {
            "WEBP": {"quality": 90, "method": 6},
            "JPEG": {"quality": 92, "optimize": True, "progressive": True},
            "AVIF": {"quality": 80, "speed": 6},
            "PNG": {"optimize": True},
            "ICO": {"sizes": [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]},
        }.get(formato_saida, {})
        if formato_saida in COM_EXIF:
            if icc:
                opcoes["icc_profile"] = icc
            if exif:
                opcoes["exif"] = exif.tobytes()

        os.makedirs(pasta_saida, exist_ok=True)
        img.save(path_saida, format=formato_saida, **opcoes)
        log(f"✅ {nome} → {os.path.basename(path_saida)}")
        return True
    except Exception as e:
        if os.path.exists(path_saida):
            try:
                os.remove(path_saida)
            except OSError:
                pass
        log(f"❌ Erro em {nome}: {e}")
        return False


def converter_arquivos(lista_paths, formato_saida, callback_progresso=None, callback_log=None, pasta_saida=None):
    """Converte uma lista em paralelo. Saída em /convertidas ao lado de cada arquivo."""
    formato_saida = _normalizar_formato_saida(formato_saida)
    arquivos = [p for p in lista_paths if os.path.splitext(p)[1].lower() in FORMATOS_ENTRADA]
    total = len(arquivos)
    log = callback_log or (lambda m: None)
    log(f"📥 {total} imagem(ns) para converter para {formato_saida}")
    if not total:
        if callback_progresso:
            callback_progresso(100, "Nenhuma imagem encontrada")
        return {"total": 0, "convertidos": 0, "falhas": 0, "pasta_saida": None}

    lock = threading.Lock()
    feitos = [0, 0]  # concluídos, sucessos

    def _um(path):
        destino = pasta_saida or os.path.join(os.path.dirname(path), "convertidas")
        ok = converter_imagem(path, formato_saida, destino, callback_log=log)
        with lock:
            feitos[0] += 1
            feitos[1] += int(ok)
            if callback_progresso:
                callback_progresso(int(feitos[0] / total * 100), f"Convertendo... {feitos[0]}/{total}")

    with ThreadPoolExecutor(max_workers=workers(6)) as ex:
        list(ex.map(_um, arquivos))

    return {"total": total, "convertidos": feitos[1], "falhas": total - feitos[1],
            "pasta_saida": pasta_saida or os.path.join(os.path.dirname(arquivos[0]), "convertidas")}


def converter_pasta(pasta, formato_saida, callback_progresso=None, callback_log=None):
    """Converte as imagens da pasta (não entra em subpastas)."""
    arquivos = sorted(os.path.join(pasta, f) for f in os.listdir(pasta)
                      if os.path.isfile(os.path.join(pasta, f)))
    return converter_arquivos(arquivos, formato_saida, callback_progresso, callback_log,
                              pasta_saida=os.path.join(pasta, "convertidas"))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python -m Functions.converterimagem <pasta_ou_arquivo> <FORMATO>")
        print(f"Formatos: {', '.join(FORMATOS_SAIDA)}")
        sys.exit(1)
    alvo, formato = sys.argv[1], sys.argv[2]
    if os.path.isdir(alvo):
        print(converter_pasta(alvo, formato, callback_log=print))
    else:
        print(converter_arquivos([alvo], formato, callback_log=print))
