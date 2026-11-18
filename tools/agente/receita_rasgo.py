"""Receita 'colagem de papel rasgado' (ref. Yerba Madre): faixas entram em pilha e trocam de foto a cada ~0,1 s.

    py -3.13 tools/agente/receita_rasgo.py --saida PASTA --fotos a.jpg b.jpg c.jpg [d.jpg ...] [--layout v3|v2|h2|h3|mix]
        [--trocas 2] [--intervalo 0.1] [--dur 1.8] [--fundo "#181818"] [--montar --porta 9333 --nome "Colagem rasgada"]

- As 1as N fotos (N = faixas do layout) são as faixas; as demais viram as TROCAS (rotação das fotos em cada faixa).
- Gera PASTA/cena.html + PNGs (rasgo_papel.py). Sem --montar só gera; com --montar roda tools/motion_html.py e a
  colagem vira camadas nativas (imagem + quadros-chave) na timeline do app da porta dada.
- Entrada: cada faixa chega de fora do quadro (esq → topo → dir ...) com 0,10 s de atraso entre elas, curva expo.
"""
import argparse, json, os, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rasgo_papel as rp  # noqa: E402
from PIL import Image  # noqa: E402


def gerar(fotos, layout, saida, trocas, intervalo, dur, fundo, w=1080, h=1920):
    os.makedirs(saida, exist_ok=True)
    ret = rp.layout(layout, w, h)
    n = len(ret)
    if len(fotos) < n:
        fotos = (fotos * n)[:n]
    base, extras = fotos[:n], fotos[n:]
    # entradas: direção de onde cada faixa chega
    entradas = {"dir": (-1, 0), "esq": (1, 0), "base": (0, -1), "topo": (0, 1)}
    css, imgs = [], []
    t0 = 0.0
    chegada = 0.32
    for i, (x, y, lw, lh, lados) in enumerate(ret):
        lado = lados[0]
        dx, dy = entradas[lado]
        if len(lados) > 1:  # faixa do meio: vem de cima/baixo alternando
            dx, dy = (0, -1) if i % 2 else (0, 1)
        atraso = t0 + i * 0.10
        # fotos desta faixa: a base + trocas (rotação das extras)
        seq = [base[i]] + [extras[(i + k) % len(extras)] for k in range(trocas)] if extras else [base[i]]
        for j, f in enumerate(seq):
            im = rp.faixa(Image.open(f), lw, lh, lados, seed=10 + i)  # mesmo seed: a borda não muda na troca
            nome = f"faixa_{i + 1}_{j}.png"
            im.save(os.path.join(saida, nome))
            gx, gy = x - rp.MARGEM, y - rp.MARGEM
            desl = f"translate({dx * (im.width + 40) * -1}px,{dy * (im.height + 40) * -1}px)"
            ini_troca = atraso + chegada + 0.18 + (j - 1) * intervalo if j else None
            if j == 0:
                anim = f"entra{i} {chegada}s cubic-bezier(0.16,1,0.3,1) {atraso:.3f}s both"
                css.append(f"@keyframes entra{i}{{from{{transform:{desl}}}to{{transform:none}}}}")
            else:
                # aparece de vez (corte seco) no instante da troca, mas só depois de a faixa ter chegado
                anim = f"liga{i}_{j} 0.001s linear {ini_troca:.3f}s both"
                css.append(f"@keyframes liga{i}_{j}{{from{{opacity:0}}to{{opacity:1}}}}")
            if j == 0:
                imgs.append(f'<div class="g" style="left:{gx}px;top:{gy}px;width:{im.width}px;height:{im.height}px;animation:{anim}">'
                            f'<img data-kv="img" src="{nome}" style="left:0;top:0;width:{im.width}px;height:{im.height}px"></div>')
            else:
                imgs.append(f'<img data-kv="img" class="t" src="{nome}" style="left:{gx}px;top:{gy}px;width:{im.width}px;height:{im.height}px;'
                            f'animation:{anim}">')
    html = f"""<!doctype html>
<html><head><meta charset="utf-8">
<meta name="kv" content="w={w};h={h};fps=30;dur={dur}">
<style>
html,body{{margin:0;width:{w}px;height:{h}px;overflow:hidden;background:{fundo}}}
.g{{position:absolute}} .g img,.t{{position:absolute}}
{chr(10).join(css)}
</style></head>
<body>
{chr(10).join(imgs)}
</body></html>"""
    p = os.path.join(saida, "cena.html")
    open(p, "w", encoding="utf-8").write(html)
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--saida", required=True); ap.add_argument("--fotos", nargs="+", required=True)
    ap.add_argument("--layout", default="v3"); ap.add_argument("--trocas", type=int, default=2)
    ap.add_argument("--intervalo", type=float, default=0.1); ap.add_argument("--dur", type=float, default=1.8)
    ap.add_argument("--fundo", default="#181818")
    ap.add_argument("--montar", action="store_true"); ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--nome", default="Colagem rasgada")
    a = ap.parse_args()
    p = gerar(a.fotos, a.layout, a.saida, a.trocas, a.intervalo, a.dur, a.fundo)
    print("cena:", p)
    if a.montar:
        r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "motion_html.py"), p, "--saida", a.saida,
                            "--porta", str(a.porta), "--nome", a.nome], capture_output=True, text=True, encoding="utf-8", errors="replace")
        print((r.stdout or "")[-1500:], (r.stderr or "")[-800:])
        sys.exit(r.returncode)


if __name__ == "__main__":
    main()
