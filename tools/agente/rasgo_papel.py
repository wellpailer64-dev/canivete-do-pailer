"""Faixas de foto com borda de PAPEL RASGADO (PNG com transparência) para colagens no Vídeo Kanivete.

Receita de referência: reel Yerba Madre (6,3-7,0 s e 9,8-10,5 s): faixas de foto com borda branca rasgada e fibra,
sombra leve, entrando em pilha e trocando de foto a cada 2-3 quadros.

    py -3.13 tools/agente/rasgo_papel.py faixa foto.jpg --larg 540 --alt 1920 --lados esq,dir --saida faixa.png [--seed 3]
    py -3.13 tools/agente/rasgo_papel.py colagem fotoA.jpg fotoB.jpg fotoC.jpg --layout v3 --saida pasta [--w 1080 --h 1920]
        -> pasta/faixa_1.png ... + colagem.json (posição final de cada faixa) + previa.jpg (quadro final montado)

--lados: onde a borda é rasgada (esq, dir, topo, base). Lado não rasgado fica reto e corta no limite da faixa.
Layouts: v2 (2 faixas verticais), v3 (3 faixas verticais), h2, h3 (horizontais), mix (1 vertical + 2 empilhadas).
Cada PNG já leva a margem branca de papel, a fibra e a sombra (margem MARGEM px em volta para a sombra não cortar).
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

MARGEM = 28          # px em volta da faixa (sombra e fibra solta)
PAPEL = np.array([246, 243, 236], np.float32)


def _ruido1d(n, rng, base=40, oitavas=5):
    """Ruído suave 1D com várias escalas (borda irregular natural)."""
    r = np.zeros(n, np.float32)
    amp, passo = 1.0, base
    for _ in range(oitavas):
        pts = rng.standard_normal(n // max(2, int(passo)) + 3).astype(np.float32)
        x = np.linspace(0, len(pts) - 1.001, n)
        r += amp * np.interp(x, np.arange(len(pts)), pts)
        amp *= 0.55
        passo = max(2, passo / 2.1)
    return r / (np.abs(r).max() + 1e-6)


def _ruido2d(h, w, rng, escala=6):
    p = rng.random((h // escala + 2, w // escala + 2)).astype(np.float32)
    return ndimage.zoom(p, escala, order=1)[:h, :w]


def _cobrir(img, w, h):
    """Redimensiona e corta a foto para cobrir w x h (como object-fit: cover)."""
    r = max(w / img.width, h / img.height)
    img = img.resize((max(w, round(img.width * r)), max(h, round(img.height * r))), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def faixa(foto, larg, alt, lados=("esq", "dir"), seed=1, borda=15, rugosidade=1.0):
    """Devolve Image RGBA (larg+2*MARGEM, alt+2*MARGEM): foto com borda rasgada, fibra e sombra."""
    rng = np.random.default_rng(seed)
    W, H = larg + 2 * MARGEM, alt + 2 * MARGEM
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    amp = 9.0 * rugosidade

    def desloc(n):
        # ondulação larga + dentes finos
        return amp * 1.6 * _ruido1d(n, rng, base=90, oitavas=4) + amp * 0.5 * rng.standard_normal(n).astype(np.float32) * 0.35

    dist = np.full((H, W), 1e4, np.float32)  # distância até a borda rasgada mais próxima (positivo = dentro do papel)
    if "esq" in lados:
        dist = np.minimum(dist, xx - (MARGEM + desloc(H)[:, None]))
    if "dir" in lados:
        dist = np.minimum(dist, (MARGEM + larg + desloc(H)[:, None]) - xx)
    if "topo" in lados:
        dist = np.minimum(dist, yy - (MARGEM + desloc(W)[None, :]))
    if "base" in lados:
        dist = np.minimum(dist, (MARGEM + alt + desloc(W)[None, :]) - yy)
    # lados retos: recorta exatamente no retângulo
    reto = np.full((H, W), 1e4, np.float32)
    if "esq" not in lados: reto = np.minimum(reto, xx - MARGEM)
    if "dir" not in lados: reto = np.minimum(reto, (MARGEM + larg) - xx)
    if "topo" not in lados: reto = np.minimum(reto, yy - MARGEM)
    if "base" not in lados: reto = np.minimum(reto, (MARGEM + alt) - yy)
    dist_r = dist                                            # só as bordas rasgadas
    dist = np.minimum(dist_r, reto)

    papel = np.clip(dist + 0.5, 0, 1)                         # alfa do papel (antisserrilhado)
    # margem branca de largura variável (fibra): a foto só começa depois dela; lado reto não tem margem
    larg_borda = borda * (0.35 + 1.3 * _ruido2d(H, W, rng, 28))
    foto_a = np.clip(np.minimum(dist_r - larg_borda, reto) + 0.5, 0, 1)

    # fibras soltas: franja fina além da borda, alfa irregular
    fib = _ruido2d(H, W, rng, 3)
    franja = np.clip((dist + 3.5) / 3.5, 0, 1) * (fib > 0.55) * (dist < 0.5)
    papel = np.maximum(papel, franja * 0.9)

    # textura do papel
    grao = (_ruido2d(H, W, rng, 2) - 0.5) * 16 + (_ruido2d(H, W, rng, 12) - 0.5) * 10
    base = PAPEL[None, None, :] + grao[..., None]
    base = np.clip(base, 0, 255)

    # foto
    f = _cobrir(foto.convert("RGB"), larg, alt)
    fb = np.zeros((H, W, 3), np.float32)
    fb[MARGEM:MARGEM + alt, MARGEM:MARGEM + larg] = np.asarray(f, np.float32)
    # onde a foto não cobre (lados rasgados passam do retângulo): estende com borda
    fb = np.pad(np.asarray(f, np.float32), ((MARGEM, MARGEM), (MARGEM, MARGEM), (0, 0)), mode="edge")
    corpo = base * (1 - foto_a[..., None]) + fb * foto_a[..., None]

    # sombra suave (alfa do papel, deslocada e borrada)
    sombra = Image.fromarray((papel * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7))
    sombra = np.asarray(sombra, np.float32) / 255 * 0.38
    sombra = np.roll(np.roll(sombra, 5, axis=0), 3, axis=1)

    # composição: corpo sobre sombra preta
    a_corpo = papel
    a_final = a_corpo + sombra * (1 - a_corpo)
    rgb = np.where(a_final[..., None] > 0,
                   (corpo * a_corpo[..., None]) / np.maximum(a_final[..., None], 1e-4), 0)
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(a_final, 0, 1) * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def layout(nome, w, h):
    """Retângulos (x, y, larg, alt, lados) da colagem final, com leve sobreposição para a rasgada aparecer."""
    ov = 26
    if nome == "v2":
        a = w // 2
        return [(0, 0, a + ov, h, ("dir",)), (a - ov, 0, w - a + ov, h, ("esq",))]
    if nome == "v3":
        a = w // 3
        return [(0, 0, a + ov, h, ("dir",)), (a - ov, 0, a + 2 * ov, h, ("esq", "dir")), (2 * a - ov, 0, w - 2 * a + ov, h, ("esq",))]
    if nome == "h2":
        a = h // 2
        return [(0, 0, w, a + ov, ("base",)), (0, a - ov, w, h - a + ov, ("topo",))]
    if nome == "h3":
        a = h // 3
        return [(0, 0, w, a + ov, ("base",)), (0, a - ov, w, a + 2 * ov, ("topo", "base")), (0, 2 * a - ov, w, h - 2 * a + ov, ("topo",))]
    if nome == "mix":
        a = w * 45 // 100
        b = h // 2
        return [(0, 0, a + ov, h, ("dir",)), (a - ov, 0, w - a + ov, b + ov, ("esq", "base")),
                (a - ov, b - ov, w - a + ov, h - b + ov, ("esq", "topo"))]
    raise SystemExit("layout desconhecido: " + nome)


def colagem(fotos, nome, saida, w=1080, h=1920, seed=1):
    os.makedirs(saida, exist_ok=True)
    ret = layout(nome, w, h)
    if len(fotos) < len(ret):
        fotos = (fotos * len(ret))[:len(ret)]
    tela = Image.new("RGB", (w, h), (24, 24, 24))
    info = []
    for i, ((x, y, lw, lh, lados), f) in enumerate(zip(ret, fotos), 1):
        im = faixa(Image.open(f), lw, lh, lados, seed=seed * 10 + i)
        p = os.path.join(saida, f"faixa_{i}.png")
        im.save(p)
        tela.paste(im, (x - MARGEM, y - MARGEM), im)
        info.append({"arquivo": p, "x": x - MARGEM, "y": y - MARGEM, "larg": im.width, "alt": im.height, "lados": list(lados)})
    json.dump({"layout": nome, "w": w, "h": h, "faixas": info}, open(os.path.join(saida, "colagem.json"), "w"), indent=1)
    tela.save(os.path.join(saida, "previa.jpg"), quality=92)
    return info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    a = sp.add_parser("faixa")
    a.add_argument("foto"); a.add_argument("--larg", type=int, required=True); a.add_argument("--alt", type=int, required=True)
    a.add_argument("--lados", default="esq,dir"); a.add_argument("--saida", required=True)
    a.add_argument("--seed", type=int, default=1); a.add_argument("--borda", type=float, default=15)
    b = sp.add_parser("colagem")
    b.add_argument("fotos", nargs="+"); b.add_argument("--layout", default="v3"); b.add_argument("--saida", required=True)
    b.add_argument("--w", type=int, default=1080); b.add_argument("--h", type=int, default=1920); b.add_argument("--seed", type=int, default=1)
    x = ap.parse_args()
    if x.cmd == "faixa":
        lados = tuple(s.strip() for s in x.lados.split(",") if s.strip())
        faixa(Image.open(x.foto), x.larg, x.alt, lados, x.seed, x.borda).save(x.saida)
        print(x.saida)
    else:
        print(json.dumps(colagem(x.fotos, x.layout, x.saida, x.w, x.h, x.seed), indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
