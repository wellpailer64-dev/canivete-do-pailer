"""
faviconconverter.py
===================
Gera todos os arquivos de favicon necessários para a web
a partir de uma única imagem de entrada.

Arquivos gerados em /favicon_gerados:
  favicon.ico                → multi-tamanho (16, 32, 48px)
  favicon-16x16.png          → 16x16
  favicon-32x32.png          → 32x32
  apple-touch-icon.png       → 180x180 (iOS)
  android-chrome-192x192.png → 192x192 (Android)
  android-chrome-512x512.png → 512x512 (Android/PWA)
  site.webmanifest           → manifest JSON para PWA

Dependências:
  pip install pillow
"""

import os
import sys
import json
import io
from PIL import Image


# Definição de todos os arquivos a gerar
ARQUIVOS = [
    {"nome": "favicon-16x16.png",          "size": (16,  16),  "formato": "PNG"},
    {"nome": "favicon-32x32.png",          "size": (32,  32),  "formato": "PNG"},
    {"nome": "favicon-48x48.png",          "size": (48,  48),  "formato": "PNG"},
    {"nome": "favicon-128x128.png",        "size": (128, 128), "formato": "PNG"},
    # iOS não aceita transparência no ícone: recebe fundo (cor do tema)
    {"nome": "apple-touch-icon.png",       "size": (180, 180), "formato": "PNG", "opaco": True},
    {"nome": "android-chrome-192x192.png", "size": (192, 192), "formato": "PNG"},
    {"nome": "android-chrome-512x512.png", "size": (512, 512), "formato": "PNG"},
]


SNIPPET_HTML = """<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="{cor}">
"""


def _cor_rgba(hex_cor):
    h = str(hex_cor or "#ffffff").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
    except ValueError:
        return (255, 255, 255, 255)


# =========================
# 🌐 GERAR FAVICON
# =========================
def gerar_favicon(path_imagem, nome_site="", cor_tema="#ffffff",
                  callback_progresso=None, callback_log=None):
    """
    Gera todos os arquivos de favicon a partir de uma imagem.

    path_imagem : caminho da imagem de entrada (PNG, JPG, WEBP, etc.)
    nome_site   : nome do site para o site.webmanifest
    cor_tema    : cor do tema para o site.webmanifest (hex)
    """
    if not os.path.exists(path_imagem):
        if callback_log:
            callback_log(f"❌ Arquivo não encontrado: {path_imagem}")
        return {"sucesso": False, "arquivos": [], "pasta": None}

    pasta_saida = os.path.join(os.path.dirname(path_imagem), "favicon_gerados")
    os.makedirs(pasta_saida, exist_ok=True)

    if callback_log:
        callback_log(f"📥 Imagem de entrada: {os.path.basename(path_imagem)}")
        callback_log(f"📁 Salvando em: {pasta_saida}")
        callback_log("")

    total    = len(ARQUIVOS) + 3  # + .ico, .webmanifest e snippet
    gerados  = []
    etapa    = 0

    try:
        img_original = Image.open(path_imagem).convert("RGBA")
        w, h = img_original.size

        if w != h:
            # Centraliza num quadrado transparente: nada da imagem é cortado
            size = max(w, h)
            quadrado = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            quadrado.paste(img_original, ((size - w) // 2, (size - h) // 2))
            img_original = quadrado
            if callback_log:
                callback_log(f"⚙️  Imagem {w}x{h} centralizada em {size}x{size} (sem cortes)")
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao abrir imagem: {e}")
        return {"sucesso": False, "arquivos": [], "pasta": None}

    # --- PNGs ---
    for arq in ARQUIVOS:
        etapa += 1
        try:
            img_redim = img_original.resize(arq["size"], Image.LANCZOS)

            if arq.get("opaco"):
                background = Image.new("RGBA", arq["size"], _cor_rgba(cor_tema))
                background.paste(img_redim, (0, 0), img_redim)
                img_redim = background

            path_saida = os.path.join(pasta_saida, arq["nome"])
            img_redim.save(path_saida, format=arq["formato"], optimize=True)

            gerados.append(arq["nome"])
            if callback_log:
                callback_log(f"✅ {arq['nome']} ({arq['size'][0]}x{arq['size'][1]})")
        except Exception as e:
            if callback_log:
                callback_log(f"❌ Erro ao gerar {arq['nome']}: {e}")

        if callback_progresso:
            callback_progresso(int(etapa / total * 90), f"Gerando {arq['nome']}...")

    # --- ICO multi-tamanho (PNG com transparência dentro do ICO) ---
    etapa += 1
    try:
        ico_sizes  = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        ico_frames = []
        for s in ico_sizes:
            ico_frames.append(img_original.resize(s, Image.LANCZOS).convert("RGBA"))
        
        path_ico = os.path.join(pasta_saida, "favicon.ico")
        
        with open(path_ico, "wb") as f:
            ico_header = bytes([0, 0, 1, 0, len(ico_sizes), 0])
            f.write(ico_header)
            
            image_data = []
            offset = 6 + (16 * len(ico_sizes))
            
            for i, (img, size) in enumerate(zip(ico_frames, ico_sizes)):
                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format="PNG")
                img_data = img_byte_arr.getvalue()
                image_data.append(img_data)
                
                width = 0 if size[0] >= 256 else size[0]
                height = 0 if size[1] >= 256 else size[1]
                
                entry = bytes([width, height, 0, 0, 1, 0, 32, 0]) + \
                        len(img_data).to_bytes(4, "little") + \
                        offset.to_bytes(4, "little")
                f.write(entry)
                offset += len(img_data)
            
            for img_data in image_data:
                f.write(img_data)
        
        gerados.append("favicon.ico")
        if callback_log:
            callback_log(f"✅ favicon.ico (16+32+48+64+128+256)")
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao gerar favicon.ico: {e}")

    if callback_progresso:
        callback_progresso(int(etapa / total * 90), "Gerando site.webmanifest...")

    # --- site.webmanifest ---
    etapa += 1
    try:
        manifest = {
            "name":             nome_site,
            "short_name":       nome_site,
            "icons": [
                {
                    "src":   "/favicon-128x128.png",
                    "sizes": "128x128",
                    "type":  "image/png"
                },
                {
                    "src":   "/android-chrome-192x192.png",
                    "sizes": "192x192",
                    "type":  "image/png"
                },
                {
                    "src":   "/android-chrome-512x512.png",
                    "sizes": "512x512",
                    "type":  "image/png"
                }
            ],
            "theme_color":      cor_tema,
            "background_color": cor_tema,
            "display":          "standalone"
        }

        path_manifest = os.path.join(pasta_saida, "site.webmanifest")
        with open(path_manifest, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False)

        gerados.append("site.webmanifest")
        if callback_log:
            callback_log(f"✅ site.webmanifest")
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao gerar site.webmanifest: {e}")

    try:
        with open(os.path.join(pasta_saida, "COLE-NO-HEAD.html"), "w", encoding="utf-8") as f:
            f.write(SNIPPET_HTML.format(cor=cor_tema))
        gerados.append("COLE-NO-HEAD.html")
        if callback_log:
            callback_log("✅ COLE-NO-HEAD.html (tags prontas para o <head> do site)")
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao gerar COLE-NO-HEAD.html: {e}")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    if callback_log:
        callback_log(f"\n📦 {len(gerados)} arquivos gerados em /favicon_gerados")

    return {
        "sucesso":  len(gerados) > 0,
        "arquivos": gerados,
        "pasta":    pasta_saida,
    }


# =========================
# 🖥️ CLI
# =========================
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python faviconconverter.py <imagem> [nome_site] [cor_tema]")
        print("Exemplo: python faviconconverter.py logo.png 'Meu Site' '#ff6600'")
        sys.exit(1)

    path   = sys.argv[1]
    nome   = sys.argv[2] if len(sys.argv) > 2 else ""
    cor    = sys.argv[3] if len(sys.argv) > 3 else "#ffffff"

    r = gerar_favicon(path, nome_site=nome, cor_tema=cor, callback_log=print)

    print("\n🔥 FINALIZADO")
    print(f"  Arquivos gerados: {len(r['arquivos'])}")
    if r['pasta']:
        print(f"  Pasta: {r['pasta']}")
