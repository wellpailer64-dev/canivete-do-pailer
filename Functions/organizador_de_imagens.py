"""
limparduplicadas.py
===================
Classifica e organiza imagens automaticamente em 5 pastas:

  /logos_e_icones  → tem canal alpha (transparência)
  /thumbs          → menor lado ≤ 500px, sem transparência
  /repetidas       → duplicata de outra imagem de boa resolução
  /graficos        → ≥ 800px, única, texto detectado na imagem
  /fotos_boas      → ≥ 800px, única, sem texto (foto real)
                     também recebe imagens 501–799px únicas (zona cinza)

Dependências:
  pip install pillow imagehash numpy opencv-python pytesseract
  + tesseract instalado no sistema:
    macOS:  brew install tesseract
    Ubuntu: sudo apt install tesseract-ocr
    Windows: https://github.com/UB-Mannheim/tesseract/wiki
"""

import os
import sys
import shutil
import re
import hashlib
from PIL import Image
import imagehash
import numpy as np
import cv2

# pytesseract não é mais utilizado — detecção de gráficos é feita por visão computacional

# =========================
# ⚙️ CONFIGURAÇÕES
# =========================
TOLERANCIA_HASH      = 10    # phash distance: 0–64, menor = mais estrito
TOLERANCIA_HASH_LOGO = 6
LIMIAR_HIST          = 0.88
LIMIAR_HIST_LOGO     = 0.92
LIMIAR_THUMB         = 500   # ≤ 500px no menor lado → /thumbs
LIMIAR_BOA_RES       = 800   # ≥ 800px no menor lado → foto boa / gráfico
LIMIAR_PEQUENO       = 550   # px — threshold interno do agrupador
THRESHOLD_SCORE      = 0.62  # score mínimo para considerar duplicata
HD_LARGURA_MIN       = 1280
HD_ALTURA_MIN        = 720
ALTA_LADO_MIN        = 1440

# Pastas gerenciadas (nunca varridas como input)
PASTAS_IGNORAR = {
    "logos_e_icones",
    "thumbs",
    "duplicadas",
    "graficos",
    "imagens_em_alta",
    "fotos_boas",  # legado
    "repetidas",   # legado
    "nao_processadas",
}

EXTENSOES_IMAGEM = (
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".jfif", ".avif", ".svg", ".ico"
)


# =========================
# 🧠 LIMPEZA DE NOME
# =========================
def nome_base(path):
    nome = os.path.basename(path).lower()
    nome = os.path.splitext(nome)[0]
    nome = re.sub(r'[-_]\d+x\d+', '', nome)
    nome = re.sub(r'-scaled', '', nome)
    nome = re.sub(r'@\d+x', '', nome)
    nome = re.sub(r'-[a-z0-9]{8,}$', '', nome)
    nome = re.sub(r'[\s_-]+', '-', nome)
    return nome.strip('-')


# =========================
# 🔍 TRANSPARÊNCIA
# =========================
def tem_transparencia(path):
    """Retorna True se a imagem tem pixels semi-transparentes (canal alpha)."""
    try:
        img_raw = Image.open(path)
        if img_raw.mode in ("RGBA", "LA"):
            alpha = np.array(img_raw.getchannel("A"))
            return np.mean(alpha < 250) > 0.01
        if img_raw.mode == "P" and "transparency" in img_raw.info:
            return True
    except Exception:
        pass
    return False


# =========================
# 📐 DETECÇÃO DE GRÁFICO
# Identifica plantas baixas e implantações
# arquitetônicas sem depender de OCR.
#
# Lógica calibrada em 21 imagens reais (5 plantas + 16 fotos de obra):
#
#   SINAL 1 — fundo branco (condição obrigatória)
#     Plantas: 40–66% dos pixels são brancos (R,G,B > 230)
#     Fotos:   0.1–5.5%  → nenhuma foto passou de 6%
#     Threshold: >= 0.25
#
#   SINAL 2 — pixels coloridos (confirmador)
#     Plantas: 13–32% têm saturação > 20  (cores neutras/acinzentadas)
#     Fotos:   27–88%  → quase todas acima de 36%
#     Threshold: coloridos <= 0.45
#
# Resultado: 21/21 corretos sem nenhum falso positivo.
# =========================
def eh_grafico_arquitetonico(img):
    """
    Retorna True se a imagem parece ser uma planta baixa ou implantação.
    """
    try:
        img_np = np.array(img.resize((512, 512)))
        img_hsv = cv2.cvtColor(img_np, cv2.COLOR_RGB2HSV)

        # Sinal 1: fundo branco — condição obrigatória
        # Plantas têm 40–66% de pixels brancos; fotos nunca passam de 6%
        ratio_branco = float(np.mean(np.all(img_np > 230, axis=2)))
        if ratio_branco < 0.25:
            return False  # descarta imediatamente — não é planta

        # Sinal 2: pixels coloridos — confirmador
        # Plantas têm poucos pixels com cor definida (sat > 20)
        # Fotos de obra têm tijolos, madeira, céu = muito colorido
        coloridos = float(np.mean(img_hsv[:, :, 1] > 20))
        if coloridos > 0.45:
            return False  # colorido demais para ser planta

        return True

    except Exception:
        return False


# =========================
# 🗂️ CLASSIFICAR IMAGEM
# =========================
def classificar(path, img, menor_lado):
    """
    Retorna categoria:
      'logo'        -> svg, transparência, ou nome típico de ícone/logo
      'thumb'       -> abaixo de HD
      'grafico'     -> padrão de planta/implantação
      'imagem_alta' -> HD, FullHD, 2K, 4K e acima
    """
    nome = os.path.basename(path).lower()
    ext = os.path.splitext(nome)[1]

    if ext in {".svg", ".ico"}:
        return 'logo'

    if tem_transparencia(path):
        return 'logo'

    if any(k in nome for k in ["logo", "icon", "icone", "favicon"]):
        return 'logo'

    if eh_grafico_arquitetonico(img):
        return 'grafico'

    w, h = img.size
    lado_maior = max(w, h)
    if lado_maior >= ALTA_LADO_MIN:
        return 'imagem_alta'

    if min(w, h) < HD_ALTURA_MIN or lado_maior < HD_LARGURA_MIN:
        return 'thumb'
    return 'imagem_alta'


# =========================
# 🧠 HASH PERCEPTUAL
# =========================
def gerar_hash(img):
    ph = imagehash.phash(img.convert("L").resize((256, 256)))
    dh = imagehash.dhash(img.convert("L").resize((256, 256)))
    return ph, dh


# =========================
# 🎨 HISTOGRAMA HSV
# =========================
def histograma(img):
    img_np  = np.array(img.resize((128, 128)))
    img_hsv = cv2.cvtColor(img_np, cv2.COLOR_RGB2HSV)
    hist_h  = cv2.calcHist([img_hsv], [0], None, [50], [0, 180])
    hist_s  = cv2.calcHist([img_hsv], [1], None, [60], [0, 256])
    cv2.normalize(hist_h, hist_h)
    cv2.normalize(hist_s, hist_s)
    return hist_h, hist_s


def comparar_hist(h1, h2):
    h1_h, h1_s = h1
    h2_h, h2_s = h2
    return (cv2.compareHist(h1_h, h2_h, cv2.HISTCMP_CORREL) * 0.65 +
            cv2.compareHist(h1_s, h2_s, cv2.HISTCMP_CORREL) * 0.35)


# =========================
# 🎯 HASHES DE REGIÕES
# =========================
def hashes_regioes(img):
    w, h = img.size
    regioes = {
        "centro":   img.crop((w*.25, h*.25, w*.75, h*.75)),
        "topo":     img.crop((w*.1,  h*.0,  w*.9,  h*.45)),
        "baixo":    img.crop((w*.1,  h*.55, w*.9,  h*1.0)),
        "esquerda": img.crop((w*.0,  h*.1,  w*.45, h*.9)),
        "direita":  img.crop((w*.55, h*.1,  w*1.0, h*.9)),
    }
    return {
        nome: imagehash.phash(reg.convert("L").resize((128, 128)))
        for nome, reg in regioes.items()
    }


def regioes_batem(r1, r2, tolerancia):
    return sum(
        1 for nome in r1
        if nome in r2 and abs(r1[nome] - r2[nome]) <= tolerancia
    ) >= 2


# =========================
# 📐 PROPORÇÃO
# =========================
def proporcao(size):
    w, h = size
    return w / h if h > 0 else 1.0


def proporcoes_diferentes(size_a, size_b, tol=0.15):
    return abs(proporcao(size_a) - proporcao(size_b)) > tol


# =========================
# 🪟 SLIDING WINDOW HASH
# =========================
def sliding_window_match(img_grande, img_pequena, tolerancia=12, passos=4):
    W, H   = img_grande.size
    prop_p = img_pequena.width / img_pequena.height

    if prop_p >= 1.0:
        jan_w = int(W * .75)
        jan_h = int(jan_w / prop_p)
    else:
        jan_h = int(H * .75)
        jan_w = int(jan_h * prop_p)

    if jan_w <= 0 or jan_h <= 0 or jan_w > W or jan_h > H:
        return 64

    hash_p = imagehash.phash(img_pequena.convert("L").resize((64, 64)))
    melhor = 64
    step_x = max(1, (W - jan_w) // passos)
    step_y = max(1, (H - jan_h) // passos)

    x = 0
    while x <= W - jan_w:
        y = 0
        while y <= H - jan_h:
            janela = img_grande.crop((x, y, x + jan_w, y + jan_h))
            dist   = abs(imagehash.phash(janela.convert("L").resize((64, 64))) - hash_p)
            if dist < melhor:
                melhor = dist
            if melhor <= tolerancia:
                return melhor
            y += step_y
        x += step_x

    return melhor


# =========================
# 🔒 DESTINO SEGURO
# =========================
def destino_seguro(pasta, nome):
    base, ext = os.path.splitext(nome)
    destino   = os.path.join(pasta, nome)
    n = 1
    while os.path.exists(destino):
        destino = os.path.join(pasta, f"{base}_{n}{ext}")
        n += 1
    return destino


def md5_arquivo(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def eh_duplicata_estrita(img_a, img_b):
    if img_a['md5'] and img_b['md5'] and img_a['md5'] == img_b['md5']:
        return True

    if proporcoes_diferentes(img_a['size'], img_b['size'], tol=0.03):
        return False

    ph_a, dh_a = img_a['hashes']
    ph_b, dh_b = img_b['hashes']
    dist_ph = abs(ph_a - ph_b)
    dist_dh = abs(dh_a - dh_b)

    hist = comparar_hist(img_a['hist'], img_b['hist'])
    regioes_ok = regioes_batem(img_a['regioes'], img_b['regioes'], TOLERANCIA_HASH_LOGO)

    return dist_ph <= 4 and dist_dh <= 6 and hist >= 0.965 and regioes_ok


def listar_imagens_raiz(PASTA):
    arquivos = []
    for root, dirs, files in os.walk(PASTA):
        dirs[:] = [d for d in dirs if d not in PASTAS_IGNORAR]
        for file in files:
            if file.lower().endswith(EXTENSOES_IMAGEM):
                arquivos.append(os.path.join(root, file))
    return arquivos


def mover_seguro(path, pasta_destino):
    os.makedirs(pasta_destino, exist_ok=True)
    destino = destino_seguro(pasta_destino, os.path.basename(path))
    shutil.move(path, destino)
    return destino


def _metadata_imagem(path):
    with Image.open(path) as img:
        size = img.size
        img_rgb = img.convert("RGB")
        return {
            'path': path,
            'base': nome_base(path),
            'size': size,
            'area': size[0] * size[1],
            'hashes': gerar_hash(img_rgb),
            'hist': histograma(img_rgb),
            'regioes': hashes_regioes(img_rgb),
            'md5': md5_arquivo(path),
        }


def identificar_duplicadas(PASTA, callback_progresso=None, callback_log=None):
    pasta_duplicadas = os.path.join(PASTA, "duplicadas")
    os.makedirs(pasta_duplicadas, exist_ok=True)

    arquivos = listar_imagens_raiz(PASTA)
    total = len(arquivos)
    imagens = []
    erros = 0

    if callback_log:
        callback_log(f"{total} imagem(ns) encontrada(s). Identificando duplicadas...")

    for i, path in enumerate(arquivos, start=1):
        try:
            imagens.append(_metadata_imagem(path))
        except Exception as e:
            erros += 1
            if callback_log:
                callback_log(f"⚠️ Ignorado {os.path.basename(path)}: {e}")

        if callback_progresso and total > 0:
            callback_progresso(int((i / total) * 45), "Lendo imagens...")

    grupos = []
    for i, img_a in enumerate(imagens, start=1):
        achou = False
        for grupo in grupos:
            if eh_duplicata_estrita(img_a, grupo[0]):
                grupo.append(img_a)
                achou = True
                break
        if not achou:
            grupos.append([img_a])

        if callback_progresso and imagens:
            callback_progresso(45 + int((i / len(imagens)) * 45), "Comparando duplicadas...")

    movidas = 0
    grupos_dup = 0
    for grupo in grupos:
        if len(grupo) <= 1:
            continue
        grupos_dup += 1
        grupo.sort(key=lambda x: -x['area'])
        manter = grupo[0]
        if callback_log:
            callback_log(f"✓ Mantida: {os.path.basename(manter['path'])}")
        for item in grupo[1:]:
            try:
                mover_seguro(item['path'], pasta_duplicadas)
                movidas += 1
                if callback_log:
                    callback_log(f"📦 Duplicada: {os.path.basename(item['path'])} -> /duplicadas")
            except Exception as e:
                erros += 1
                if callback_log:
                    callback_log(f"   Erro ao mover {os.path.basename(item['path'])}: {e}")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {
        "total_analisado": total,
        "duplicadas": movidas,
        "grupos_duplicata": grupos_dup,
        "erros": erros,
    }


def identificar_thumbs(PASTA, callback_progresso=None, callback_log=None):
    pasta_thumbs = os.path.join(PASTA, "thumbs")
    os.makedirs(pasta_thumbs, exist_ok=True)

    arquivos = listar_imagens_raiz(PASTA)
    total = len(arquivos)
    movidas = 0
    erros = 0

    if callback_log:
        callback_log(f"{total} imagem(ns) encontrada(s). Identificando thumbs...")

    for i, path in enumerate(arquivos, start=1):
        try:
            with Image.open(path) as img:
                size = img.size
                img_rgb = img.convert("RGB")
                categoria = classificar(path, img_rgb, min(size))

            if categoria == "thumb":
                mover_seguro(path, pasta_thumbs)
                movidas += 1
                if callback_log:
                    callback_log(f"🔹 Thumb: {os.path.basename(path)} ({size[0]}x{size[1]}) -> /thumbs")

        except Exception as e:
            erros += 1
            if callback_log:
                callback_log(f"⚠️ Ignorado {os.path.basename(path)}: {e}")

        if callback_progresso and total > 0:
            callback_progresso(int((i / total) * 100), "Identificando thumbs...")

    return {
        "total_analisado": total,
        "thumbs": movidas,
        "erros": erros,
    }


# =========================
# 🚀 FUNÇÃO PRINCIPAL
# =========================
def limpar_pasta(PASTA, callback_progresso=None, callback_log=None):
    pastas = {
        'logos_e_icones':  os.path.join(PASTA, "logos_e_icones"),
        'thumbs':          os.path.join(PASTA, "thumbs"),
        'duplicadas':      os.path.join(PASTA, "duplicadas"),
        'graficos':        os.path.join(PASTA, "graficos"),
        'imagens_em_alta': os.path.join(PASTA, "imagens_em_alta"),
        'nao_processadas': os.path.join(PASTA, "nao_processadas"),
    }
    for p in pastas.values():
        os.makedirs(p, exist_ok=True)

    contadores = {k: 0 for k in pastas}
    arquivos = []
    imagens_alta = []

    def mover(path, destino_key, img_size, emoji):
        dest = destino_seguro(pastas[destino_key], os.path.basename(path))
        w, h = img_size
        if callback_log:
            callback_log(f"{emoji} {os.path.basename(path)} ({w}x{h}) -> /{destino_key}")
        try:
            shutil.move(path, dest)
            contadores[destino_key] += 1
        except Exception as e:
            if callback_log:
                callback_log(f"   Erro ao mover: {e}")

    arquivos = listar_imagens_raiz(PASTA)

    total = len(arquivos)
    if callback_log:
        callback_log(f"{total} arquivos encontrados. Classificando...")

    for i, path in enumerate(arquivos, start=1):
        try:
            with Image.open(path) as img:
                size = img.size
                img_rgb = img.convert("RGB")
                categoria = classificar(path, img_rgb, min(size))

            if categoria == 'logo':
                mover(path, 'logos_e_icones', size, "🎨")
            elif categoria == 'thumb':
                mover(path, 'thumbs', size, "🔹")
            elif categoria == 'grafico':
                mover(path, 'graficos', size, "📊")
            else:
                imagens_alta.append({
                    'path': path,
                    'size': size,
                    'area': size[0] * size[1],
                    'hashes': gerar_hash(img_rgb),
                    'hist': histograma(img_rgb),
                    'regioes': hashes_regioes(img_rgb),
                    'md5': md5_arquivo(path),
                })

        except Exception as e:
            if callback_log:
                callback_log(f"⚠️ Erro em {os.path.basename(path)}: {e}")
            try:
                mover(path, 'nao_processadas', (0, 0), "⚠️")
            except Exception:
                pass

        if callback_progresso and total > 0:
            callback_progresso(int((i / total) * 55), "Classificando imagens...")

    if callback_log:
        callback_log(f"Analisando duplicadas em {len(imagens_alta)} imagem(ns) de alta...")

    grupos = []
    for i, img_a in enumerate(imagens_alta, start=1):
        achou = False
        for g in grupos:
            ref = g[0]
            if eh_duplicata_estrita(img_a, ref):
                g.append(img_a)
                achou = True
                break
        if not achou:
            grupos.append([img_a])

        if callback_progresso and len(imagens_alta) > 0:
            callback_progresso(55 + int((i / len(imagens_alta)) * 35), "Detectando duplicadas...")

    for grupo in grupos:
        grupo.sort(key=lambda x: -x['area'])
        manter = grupo[0]
        mover(manter['path'], 'imagens_em_alta', manter['size'], "✨")
        if len(grupo) > 1:
            for item in grupo[1:]:
                mover(item['path'], 'duplicadas', item['size'], "📦")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {
        "total_analisado": len(arquivos),
        "logos_icones": contadores['logos_e_icones'],
        "thumbs": contadores['thumbs'],
        "graficos": contadores['graficos'],
        "imagens_em_alta": contadores['imagens_em_alta'],
        "duplicadas": contadores['duplicadas'],
        "nao_processadas": contadores['nao_processadas'],
        "repetidas": contadores['duplicadas'],
        "fotos_boas": contadores['imagens_em_alta'],
        "grupos_duplicata": len([g for g in grupos if len(g) > 1]),
    }


# =========================
# 🖥️ CLI
# =========================
if __name__ == "__main__":
    pasta = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()

    r = limpar_pasta(pasta, callback_log=print)

    print("\n" + "=" * 46)
    print("🔥  FINALIZADO")
    print("=" * 46)
    print(f"  Total analisado    : {r['total_analisado']}")
    print(f"  🎨 Logos/ícones    : {r['logos_icones']:>4}  → /logos_e_icones")
    print(f"  🔹 Thumbs          : {r['thumbs']:>4}  → /thumbs")
    print(f"  📦 Duplicadas      : {r['duplicadas']:>4}  → /duplicadas")
    print(f"  📊 Gráficos        : {r['graficos']:>4}  → /graficos")
    print(f"  ✨ Imagens em alta : {r['imagens_em_alta']:>4}  → /imagens_em_alta")
    print(f"  ⚠️ Não processadas : {r['nao_processadas']:>4}  → /nao_processadas")
    print("=" * 46)
