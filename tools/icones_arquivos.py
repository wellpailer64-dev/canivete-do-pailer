"""Gera os ícones dos arquivos de projeto (identidade/arquivos/*.ico): o logo de cada ferramenta como no app
(.app-logo em frontend/css/app.css) — quadrado arredondado escuro, borda e sigla na cor da ferramenta.
Rodar de novo quando mudar cor ou sigla:  py -3.13 tools/icones_arquivos.py
O registro no Windows (DefaultIcon por extensão) fica em Functions/projeto.py (_TIPOS)."""
import os
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "identidade", "arquivos")
# nome do .ico: (sigla, cor, fundo) — as mesmas de .al-* no app.css / som.css
LOGOS = {
    "vd": ("Vd", "#c9a8ff", "#1e1530"),   # Vídeo Kanivete (.vknv)
    "pk": ("Pk", "#4c9bff", "#0a1a2e"),   # Photo Kanivete (.iknv)
    "vk": ("Vk", "#ff8c42", "#2b1408"),   # Vetor Kanivete (.aknv)
    "sk": ("Sk", "#7fd6ff", "#0a2230"),   # Sound Kanivete (.sknv)
    "lk": ("Lk", "#ff4fc8", "#2b0a22"),   # Lux Kanivete (.lknv)
    "sd": ("Sd", "#2ee6c8", "#062a26"),   # Slider Kanivete (.dknv)
}
TAMANHOS = (16, 24, 32, 48, 64, 128, 256)
FONTE = r"C:\Windows\Fonts\segoeuib.ttf"


def desenhar(sigla, cor, fundo, lado):
    k = 8 if lado <= 64 else 4   # desenha grande e reduz: borda e letra lisas
    L = lado * k
    im = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = round(L * 0.04)                                     # respiro em volta
    borda = max(k, round(L * (0.075 if lado <= 24 else 0.055)))   # fica visível até no 16 px
    d.rounded_rectangle([m, m, L - 1 - m, L - 1 - m], radius=round(L * 0.22), fill=fundo, outline=cor, width=borda)
    f = ImageFont.truetype(FONTE, round(L * (0.50 if lado <= 24 else 0.44)))
    x0, y0, x1, y1 = d.textbbox((0, 0), sigla, font=f)
    d.text(((L - (x1 - x0)) / 2 - x0, (L - (y1 - y0)) / 2 - y0), sigla, font=f, fill=cor)
    return im.resize((lado, lado), Image.LANCZOS)


def main():
    os.makedirs(SAIDA, exist_ok=True)
    for nome, (sigla, cor, fundo) in LOGOS.items():
        imgs = [desenhar(sigla, cor, fundo, t) for t in TAMANHOS]
        destino = os.path.join(SAIDA, nome + ".ico")
        imgs[-1].save(destino, format="ICO", sizes=[(t, t) for t in TAMANHOS], append_images=imgs[:-1])
        imgs[-1].save(os.path.join(SAIDA, nome + ".png"))   # prévia
        print(destino)


if __name__ == "__main__":
    main()
