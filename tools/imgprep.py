"""Prepara imagens para a peça numa linha: cortar, ampliar por IA, recortar o fundo, limpar sobras e tapar buracos.
uso: py -3.13 tools/imgprep.py ENTRADA [ENTRADA...] [--corte x,y,w,h] [--ampliar 4] [--tipo arte|foto]
                                [--recortar] [--limpar 0.02] [--tapar 2000] [--branco] [--saida pasta] [--sufixo _ok]
     py -3.13 tools/imgprep.py --folha a.png b.png ... [--fundo "#3580DC"] [-o folha.jpg]
  --corte     recorta um pedaço antes (px da imagem de entrada)
  --ampliar   2, 3 ou 4 (Real-ESRGAN Vulkan; --tipo arte p/ ilustração/ícone, foto p/ foto e exame)
  --recortar [pessoa]  tira o fundo e corta nas bordas (objeto = BEN2; pessoa = BiRefNet matting, cabelo fino)
  --limpar F  apaga ilhas soltas menores que F × a maior (sobras de texto/painel vizinho no recorte); 0 = não limpa
  --tapar N   buracos fechados maiores que N px viram opacos (placa "HELP" vazada, miolo de balão) — 0 = não tapa
  --branco    fundo branco liso vira transparente sem IA (ícone chapado sobre branco), com a cor despremultiplicada
  --folha     confere recortes sobre uma cor de fundo (sobras, halos, buracos) numa imagem só
Saída: <saida>/<nome><sufixo>.png (padrão: ao lado da entrada). Imprime uma linha por imagem com o tamanho final."""
import argparse, os, shutil, sys
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import numpy as np
from PIL import Image


def tirar_branco(im):
    a = np.array(im.convert("RGB")).astype(float); alfa = np.clip((255 - a.min(2)) * 4, 0, 255)
    k = alfa[..., None] / 255
    rgb = np.where(k > 0, (a - 255 * (1 - k)) / np.maximum(k, 1e-3), 0).clip(0, 255)
    return Image.fromarray(np.dstack([rgb, alfa]).astype(np.uint8))


def limpar(im, frac):
    import cv2
    a = np.array(im); al = a[..., 3]
    k, lab, st, _ = cv2.connectedComponentsWithStats((al > 40).astype(np.uint8))
    if k <= 2: return im
    maior = st[1:, 4].max(); manter = np.zeros(al.shape, bool)
    for i in range(1, k):
        if st[i, 4] >= maior * frac: manter |= lab == i
    manter = cv2.dilate(manter.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    a[..., 3] = np.where(manter, al, 0); return Image.fromarray(a)


def tapar(im, minimo):
    import cv2
    a = np.array(im); m = (a[..., 3] > 60).astype(np.uint8); h, w = m.shape
    ff = np.pad(m, 1); cv2.floodFill(ff, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 2)
    buraco = ff[1:-1, 1:-1] == 0
    k, lab, st, _ = cv2.connectedComponentsWithStats(buraco.astype(np.uint8))
    for i in range(1, k):
        if st[i, 4] >= minimo:
            z = lab == i; a[z, :3] = 255; a[z, 3] = 255
    return Image.fromarray(a)


def preparar(ent, o):
    nome = os.path.splitext(os.path.basename(ent))[0]
    pasta = o.saida or os.path.dirname(os.path.abspath(ent)); os.makedirs(pasta, exist_ok=True)
    dest = os.path.join(pasta, nome + o.sufixo + ".png")
    im = Image.open(ent).convert("RGBA")
    if o.corte:
        x, y, w, h = (int(float(v)) for v in o.corte.split(",")); im = im.crop((x, y, x + w, y + h))
    if o.ampliar:
        from Functions import ampliar_imagem
        tmp = dest + ".ent.png"; im.save(tmp)
        r = ampliar_imagem.ampliar(tmp, o.ampliar, o.tipo); os.remove(tmp)
        if not r.get("success"): sys.exit(f"!! {nome}: {r.get('error')}")
        im = Image.open(r["path"]).convert("RGBA")
    if o.branco: im = tirar_branco(im)
    if o.recortar:
        from Functions import recorte_pro
        cores, alfa = recorte_pro.recortar(np.array(im.convert("RGB")), o.recortar)
        im = Image.fromarray(np.dstack([cores, alfa]))
    if o.tapar: im = tapar(im, o.tapar)   # antes de limpar: letras soltas dentro da placa grudam nela e não somem
    if (o.recortar or o.branco) and o.limpar: im = limpar(im, o.limpar)
    bb = im.getbbox()
    if bb and (o.recortar or o.branco): im = im.crop(bb)
    im.save(dest); print(f"{dest}  {im.width}×{im.height}")
    return dest


def conferir(arqs, fundo, dest):
    cel = 300; cols = min(6, len(arqs)); lin = -(-len(arqs) // cols)
    W = Image.new("RGB", (cols * (cel + 10), lin * (cel + 10)), fundo)
    for i, f in enumerate(arqs):
        im = Image.open(f).convert("RGBA"); im.thumbnail((cel, cel))
        W.paste(im, ((i % cols) * (cel + 10), (i // cols) * (cel + 10)), im)
    W.save(dest, quality=85); print("folha:", dest)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("entradas", nargs="+")
    ap.add_argument("--corte"); ap.add_argument("--ampliar", type=int); ap.add_argument("--tipo", default="arte")
    ap.add_argument("--recortar", nargs="?", const="objeto", choices=["objeto", "pessoa"]); ap.add_argument("--limpar", type=float, default=0.02)
    ap.add_argument("--tapar", type=int, default=0); ap.add_argument("--branco", action="store_true")
    ap.add_argument("--saida"); ap.add_argument("--sufixo", default="_ok")
    ap.add_argument("--folha", action="store_true"); ap.add_argument("--fundo", default="#3580DC"); ap.add_argument("-o")
    o = ap.parse_args()
    if o.folha: conferir(o.entradas, o.fundo, o.o or os.path.join(os.path.dirname(os.path.abspath(o.entradas[0])), "folha_conferir.jpg"))
    else:
        for e in o.entradas: preparar(e, o)
