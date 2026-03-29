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

# Pastas gerenciadas (nunca varridas como input)
PASTAS_IGNORAR = {
    "logos_e_icones",
    "thumbs",
    "repetidas",
    "graficos",
    "fotos_boas",
}


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
      'logo'       → tem transparência
      'thumb'      → ≤ 500px sem transparência
      'grafico'    → ≥ 800px com padrão de planta/implantação
      'foto'       → ≥ 800px, foto real
      'zona_cinza' → 501–799px (vai para fotos_boas se única)
    """
    if tem_transparencia(path):
        return 'logo'
    if menor_lado <= LIMIAR_THUMB:
        return 'thumb'
    if menor_lado >= LIMIAR_BOA_RES:
        return 'grafico' if eh_grafico_arquitetonico(img) else 'foto'
    return 'zona_cinza'


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


# =========================
# 🔗 SCORE DE SIMILARIDADE
# =========================
def score_similaridade(img_a, img_b):
    ph_a, dh_a = img_a['hashes']
    ph_b, dh_b = img_b['hashes']
    nome_ok    = img_a['base'] == img_b['base']
    hist_score = comparar_hist(img_a['hist'], img_b['hist'])

    # Alta confiança: nome + histograma
    if nome_ok and hist_score > 0.75:
        return 1.0

    # Crop com proporção diferente
    if nome_ok and proporcoes_diferentes(img_a['size'], img_b['size']):
        maior = img_a if img_a['area'] >= img_b['area'] else img_b
        menor = img_b if maior is img_a else img_a
        try:
            dist = sliding_window_match(
                Image.open(maior['path']).convert("RGB"),
                Image.open(menor['path']).convert("RGB"),
            )
            if dist <= 14:
                return 0.92
        except Exception:
            pass

    dist_ph    = abs(ph_a - ph_b)
    dist_dh    = abs(dh_a - dh_b)
    score_hash = max(0, 1 - dist_ph / 64) * .6 + max(0, 1 - dist_dh / 64) * .4

    score_regioes = 1.0 if regioes_batem(
        img_a['regioes'], img_b['regioes'], TOLERANCIA_HASH
    ) else 0.0

    return (
        score_hash                    * 0.35 +
        hist_score                    * 0.30 +
        score_regioes                 * 0.25 +
        (1.0 if nome_ok else 0.0)     * 0.10
    )


# =========================
# 🚀 FUNÇÃO PRINCIPAL
# =========================
def limpar_pasta(PASTA, callback_progresso=None, callback_log=None):

    # --- Cria pastas de destino ---
    pastas = {
        'logos_e_icones': os.path.join(PASTA, "logos_e_icones"),
        'thumbs':         os.path.join(PASTA, "thumbs"),
        'repetidas':      os.path.join(PASTA, "repetidas"),
        'graficos':       os.path.join(PASTA, "graficos"),
        'fotos_boas':     os.path.join(PASTA, "fotos_boas"),
    }
    for p in pastas.values():
        os.makedirs(p, exist_ok=True)

    contadores = {k: 0 for k in pastas}
    arquivos   = []
    imagens    = []
    grupos     = []

    def mover(path, destino_key, img_size, emoji):
        dest = destino_seguro(pastas[destino_key], os.path.basename(path))
        w, h = img_size
        if callback_log:
            callback_log(f"{emoji} {os.path.basename(path)} ({w}x{h}) → /{destino_key}")
        try:
            shutil.move(path, dest)
            contadores[destino_key] += 1
        except Exception as e:
            if callback_log:
                callback_log(f"   ⚠️ Erro: {e}")

    # --- Coleta (ignora pastas gerenciadas) ---
    for root, dirs, files in os.walk(PASTA):
        dirs[:] = [d for d in dirs if d not in PASTAS_IGNORAR]
        for file in files:
            if file.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                arquivos.append(os.path.join(root, file))

    total = len(arquivos)
    if callback_log:
        callback_log(f"📥 {total} arquivos encontrados. Processando...")


    # =========================
    # 🔍 TRIAGEM INICIAL
    # =========================
    for i, path in enumerate(arquivos):
        try:
            img_pil    = Image.open(path).convert("RGB")
            menor_lado = min(img_pil.size)
            categoria  = classificar(path, img_pil, menor_lado)

            if categoria == 'logo':
                mover(path, 'logos_e_icones', img_pil.size, "🎨")
                continue

            if categoria == 'thumb':
                mover(path, 'thumbs', img_pil.size, "🔹")
                continue

            # foto / grafico / zona_cinza → entram no comparador
            imagens.append({
                'path':       path,
                'hashes':     gerar_hash(img_pil),
                'hist':       histograma(img_pil),
                'regioes':    hashes_regioes(img_pil),
                'size':       img_pil.size,
                'base':       nome_base(path),
                'menor_lado': menor_lado,
                'categoria':  categoria,
                'area':       img_pil.size[0] * img_pil.size[1],
            })

        except Exception as e:
            if callback_log:
                callback_log(f"⚠️ Erro em {os.path.basename(path)}: {e}")
            continue

        if callback_progresso and total > 0:
            callback_progresso(int((i / total) * 40), "Classificando...")

    if callback_log:
        callback_log(f"📸 {len(imagens)} imagens entram no comparador")

    # =========================
    # 🧠 AGRUPAMENTO
    # =========================
    for i, img_a in enumerate(imagens):
        achou = False

        for grupo in grupos:
            ref       = grupo[0]
            score     = score_similaridade(img_a, ref)
            threshold = THRESHOLD_SCORE
            if img_a['menor_lado'] < LIMIAR_PEQUENO:
                threshold = 0.50

            if score >= threshold:
                grupo.append(img_a)
                achou = True
                break

        if not achou:
            grupos.append([img_a])

        if callback_progresso and len(imagens) > 0:
            callback_progresso(
                40 + int((i / len(imagens)) * 50),
                "Comparando..."
            )

    # =========================
    # 📦 DISTRIBUIÇÃO FINAL
    # =========================
    for grupo in grupos:
        # Maior área primeiro; zona_cinza vai para o fim da fila
        grupo.sort(key=lambda x: (x['categoria'] == 'zona_cinza', -x['area']))
        manter = grupo[0]

        # Duplicatas → /repetidas
        if len(grupo) > 1:
            if callback_log:
                w, h = manter['size']
                callback_log(
                    f"\n✅ Mantendo: {os.path.basename(manter['path'])} ({w}x{h})"
                )
            for item in grupo[1:]:
                mover(item['path'], 'repetidas', item['size'], "   📦")

        # Vencedor → destino por categoria
        cat = manter['categoria']
        if cat == 'grafico':
            mover(manter['path'], 'graficos',   manter['size'], "📊")
        else:
            mover(manter['path'], 'fotos_boas', manter['size'], "✨")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {
        "total_analisado":  len(arquivos),
        "logos_icones":     contadores['logos_e_icones'],
        "thumbs":           contadores['thumbs'],
        "repetidas":        contadores['repetidas'],
        "graficos":         contadores['graficos'],
        "fotos_boas":       contadores['fotos_boas'],
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
    print(f"  📦 Repetidas       : {r['repetidas']:>4}  → /repetidas")
    print(f"  📊 Gráficos        : {r['graficos']:>4}  → /graficos")
    print(f"  ✨ Fotos boas      : {r['fotos_boas']:>4}  → /fotos_boas")
    print(f"  Grupos duplicata   : {r['grupos_duplicata']}")
    print("=" * 46)
