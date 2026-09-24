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
    {"nome": "favicon-128x128.png",        "size": (128, 128), "formato": "PNG"},
    {"nome": "favicon-48x48.ico",          "size": (48,  48),  "formato": "ICO"},
    {"nome": "favicon-180x180.ico",        "size": (180, 180), "formato": "ICO"},
    {"nome": "apple-touch-icon.png",       "size": (180, 180), "formato": "PNG"},
    {"nome": "android-chrome-192x192.png", "size": (192, 192), "formato": "PNG"},
    {"nome": "android-chrome-512x512.png", "size": (512, 512), "formato": "PNG"},
]


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

    total    = len(ARQUIVOS) + 2  # +2 para .ico e .webmanifest
    gerados  = []
    etapa    = 0

    try:
        img_original = Image.open(path_imagem).convert("RGBA")
        w, h = img_original.size

        if w != h:
            if callback_log:
                callback_log(f"⚙️  Ajustando imagem ({w}x{h}) para 1:1...")

            size = min(w, h)
            left = (w - size) // 2
            top = (h - size) // 2
            right = left + size
            bottom = top + size
            img_original = img_original.crop((left, top, right, bottom))

            if callback_log:
                callback_log(f"✅ Imagem cropada para {size}x{size}")
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao abrir imagem: {e}")
        return {"sucesso": False, "arquivos": [], "pasta": None}

    # --- PNGs ---
    for arq in ARQUIVOS:
        etapa += 1
        try:
            img_redim = img_original.resize(arq["size"], Image.LANCZOS)

            # Preencher com fundo branco se tiver transparência (para ícones de pasta Windows)
            if img_redim.mode == "RGBA":
                background = Image.new("RGBA", arq["size"], (255, 255, 255, 255))
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

    # --- ICO multi-tamanho (sem transparência para compatibilidade Windows) ---
    etapa += 1
    try:
        ico_sizes  = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        ico_frames = []
        for s in ico_sizes:
            img_resized = img_original.resize(s, Image.LANCZOS)
            if img_resized.mode == "RGBA":
                background = Image.new("RGBA", s, (255, 255, 255, 255))
                background.paste(img_resized, (0, 0), img_resized)
                ico_frames.append(background)
            else:
                ico_frames.append(img_resized.convert("RGBA"))
        
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
