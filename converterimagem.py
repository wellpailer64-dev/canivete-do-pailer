"""
converterimagem.py
==================
Converte imagens entre qualquer formato suportado pelo Pillow.

Formatos suportados (entrada e saída):
  WEBP, PNG, JPG/JPEG, BMP, TIFF, GIF, ICO, AVIF, TGA, PPM

Comportamento:
  - Original é mantido
  - Arquivo convertido salvo em /convertidas dentro da mesma pasta

Dependências:
  pip install pillow
"""

import os
import sys
from PIL import Image

FORMATOS_ENTRADA = {
    ".webp", ".png", ".jpg", ".jpeg",
    ".bmp", ".tiff", ".tif", ".gif",
    ".ico", ".tga", ".ppm", ".avif"
}

FORMATOS_SAIDA = {
    "WEBP":  ".webp",
    "PNG":   ".png",
    "JPEG":  ".jpg",
    "BMP":   ".bmp",
    "TIFF":  ".tiff",
    "GIF":   ".gif",
    "ICO":   ".ico",
    "TGA":   ".tga",
    "PPM":   ".ppm",
}

# Formatos que NÃO suportam canal alpha — precisam de fundo branco
FORMATOS_SEM_ALPHA = {"JPEG", "BMP", "PPM", "TGA"}


# =========================
# 🖼️ CONVERTER UM ARQUIVO
# =========================
def converter_imagem(path, formato_saida, pasta_saida, callback_log=None):
    """
    Converte uma única imagem para o formato especificado.
    Salva o resultado em pasta_saida.
    Retorna True se converteu, False se falhou.

    formato_saida: string uppercase ex: "WEBP", "PNG", "JPEG"
    """
    ext_entrada = os.path.splitext(path)[1].lower()

    if ext_entrada not in FORMATOS_ENTRADA:
        if callback_log:
            callback_log(f"⏭️  Ignorado (formato não suportado): {os.path.basename(path)}")
        return False

    ext_saida  = FORMATOS_SAIDA.get(formato_saida, f".{formato_saida.lower()}")
    nome_base  = os.path.splitext(os.path.basename(path))[0]
    nome_saida = nome_base + ext_saida
    path_saida = os.path.join(pasta_saida, nome_saida)

    # Evita converter para o mesmo formato
    if ext_entrada == ext_saida:
        if callback_log:
            callback_log(f"⏭️  Já está em {formato_saida}: {os.path.basename(path)}")
        return False

    try:
        img = Image.open(path)

        # Converte modo para compatibilidade
        if formato_saida in FORMATOS_SEM_ALPHA:
            # Formatos sem alpha: achata transparência com fundo branco
            if img.mode in ("RGBA", "LA", "P"):
                fundo = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                fundo.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                img = fundo
            else:
                img = img.convert("RGB")
        else:
            # Formatos com alpha: mantém transparência se existir
            if img.mode == "P":
                img = img.convert("RGBA")
            elif img.mode not in ("RGB", "RGBA", "L", "LA"):
                img = img.convert("RGBA")

        # Opções específicas por formato
        opcoes = {}
        if formato_saida == "WEBP":
            opcoes = {"quality": 90, "method": 6}
        elif formato_saida == "JPEG":
            opcoes = {"quality": 92, "optimize": True}
        elif formato_saida == "PNG":
            opcoes = {"optimize": True}
        elif formato_saida == "ICO":
            # ICO suporta múltiplos tamanhos
            opcoes = {"sizes": [(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)]}

        img.save(path_saida, format=formato_saida, **opcoes)

        if callback_log:
            callback_log(f"✅ {os.path.basename(path)} → {nome_saida}")
        return True

    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro em {os.path.basename(path)}: {e}")
        return False


# =========================
# 📁 CONVERTER PASTA
# =========================
def converter_pasta(pasta, formato_saida, callback_progresso=None, callback_log=None):
    """
    Varre uma pasta e converte todas as imagens suportadas.
    """
    pasta_saida = os.path.join(pasta, "convertidas")
    os.makedirs(pasta_saida, exist_ok=True)

    arquivos = [
        os.path.join(pasta, f) for f in os.listdir(pasta)
        if os.path.isfile(os.path.join(pasta, f))
        and os.path.splitext(f)[1].lower() in FORMATOS_ENTRADA
    ]

    total       = len(arquivos)
    convertidos = 0
    falhas      = 0

    if callback_log:
        callback_log(f"📥 {total} imagem(ns) encontrada(s) para converter para {formato_saida}")

    if total == 0:
        if callback_progresso:
            callback_progresso(100, "Nenhuma imagem encontrada")
        return {"total": 0, "convertidos": 0, "falhas": 0}

    for i, path in enumerate(arquivos):
        sucesso = converter_imagem(path, formato_saida, pasta_saida, callback_log=callback_log)
        if sucesso:
            convertidos += 1
        else:
            falhas += 1

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Convertendo... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {"total": total, "convertidos": convertidos, "falhas": falhas}


# =========================
# 📄 CONVERTER LISTA DE ARQUIVOS
# =========================
def converter_arquivos(lista_paths, formato_saida, callback_progresso=None, callback_log=None):
    """
    Converte uma lista específica de arquivos.
    Salva em /convertidas dentro da pasta do primeiro arquivo.
    """
    if not lista_paths:
        return {"total": 0, "convertidos": 0, "falhas": 0}

    pasta_saida = os.path.join(os.path.dirname(lista_paths[0]), "convertidas")
    os.makedirs(pasta_saida, exist_ok=True)

    total       = len(lista_paths)
    convertidos = 0
    falhas      = 0

    if callback_log:
        callback_log(f"📥 {total} arquivo(s) selecionado(s) para converter para {formato_saida}")

    for i, path in enumerate(lista_paths):
        sucesso = converter_imagem(path, formato_saida, pasta_saida, callback_log=callback_log)
        if sucesso:
            convertidos += 1
        else:
            falhas += 1

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Convertendo... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {"total": total, "convertidos": convertidos, "falhas": falhas}


# =========================
# 🖥️ CLI
# =========================
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python converterimagem.py <pasta_ou_arquivo> <FORMATO>")
        print(f"Formatos disponíveis: {', '.join(FORMATOS_SAIDA.keys())}")
        sys.exit(1)

    alvo    = sys.argv[1]
    formato = sys.argv[2].upper()

    if formato not in FORMATOS_SAIDA:
        print(f"Formato inválido. Use: {', '.join(FORMATOS_SAIDA.keys())}")
        sys.exit(1)

    if os.path.isdir(alvo):
        r = converter_pasta(alvo, formato, callback_log=print)
    elif os.path.isfile(alvo):
        r = converter_arquivos([alvo], formato, callback_log=print)
    else:
        print("Caminho inválido.")
        sys.exit(1)

    print("\n🔥 FINALIZADO")
    print(f"  Total      : {r['total']}")
    print(f"  Convertidos: {r['convertidos']}")
    print(f"  Falhas     : {r['falhas']}")
