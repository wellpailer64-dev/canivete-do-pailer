"""Gera a marca KANIVETE: letras próprias desenhadas aqui (geometria nossa, sem ler fonte nenhuma), no espírito
de uma serifada moderna condensada: haste grossa contra traço fino e pontas que se abrem em cunha, como lâmina.
Depois fatia tudo na horizontal, como um golpe de canivete (fresta reta; DESLIZE > 0 desliza a metade de cima,
mas dá impressão de itálico).

    python tools/gerar_marca.py [--svg saida.svg]

Troca o <symbol id="i-kanivete"> do frontend/index.html e o aspect-ratio de .wordmark no app.css.
Precisa de skia-pathops (pip install skia-pathops) e fontTools.
"""
import argparse
import re
from pathlib import Path

import pathops
from fontTools.pens.svgPathPen import SVGPathPen

RAIZ = Path(__file__).resolve().parent.parent
H = 1000                  # altura das maiúsculas; y cresce para baixo (0 = topo)
GROSSO, FINO = 195, 82    # contraste das hastes
ABRE, ABRE_H = 40, 160    # cunha nas pontas: quanto abre para cada lado e em que altura
ESPACO = 150              # entre letras
CORTE, FRESTA, DESLIZE = 0.5, 50, 0
MARGEM = 30
LARANJA_A_PARTIR = 4      # KANI branco, VETE laranja (na abertura)


def _uniao(paths):
    u = pathops.Path()
    for p in paths:
        u = pathops.op(u, p, pathops.PathOp.UNION)
    return u


def poly(*pts):
    p = pathops.Path()
    p.moveTo(*pts[0])
    for pt in pts[1:]:
        p.lineTo(*pt)
    p.close()
    return p


def haste(x, w, cima=True, baixo=True, y0=0, y1=H, f=ABRE, fh=ABRE_H):
    """Haste vertical que se abre em cunha curva nas pontas."""
    p = pathops.Path()
    if cima:
        p.moveTo(x - f, y0); p.lineTo(x + w + f, y0)
        p.quadTo(x + w, y0 + fh * 0.3, x + w, y0 + fh)
    else:
        p.moveTo(x, y0); p.lineTo(x + w, y0)
    if baixo:
        p.lineTo(x + w, y1 - fh); p.quadTo(x + w, y1 - fh * 0.3, x + w + f, y1)
        p.lineTo(x - f, y1); p.quadTo(x, y1 - fh * 0.3, x, y1 - fh)
    else:
        p.lineTo(x + w, y1); p.lineTo(x, y1)
    if cima:
        p.lineTo(x, y0 + fh); p.quadTo(x, y0 + fh * 0.3, x - f, y0)
    p.close()
    return p


def traco(a, b, w, abre_a=False, abre_b=False, f=ABRE, fh=ABRE_H):
    """Traço reto de a até b com largura horizontal w (pontas cortadas na horizontal), com cunha opcional."""
    (ax, ay), (bx, by) = a, b
    partes = [poly((ax - w / 2, ay), (ax + w / 2, ay), (bx + w / 2, by), (bx - w / 2, by))]
    inclin = (bx - ax) / (by - ay)
    for (ex, ey), sinal, abre in (((ax, ay), 1, abre_a), ((bx, by), -1, abre_b)):
        if not abre:
            continue
        yi = ey + sinal * fh
        xi = ex + inclin * (yi - ey)
        p = pathops.Path()
        p.moveTo(ex - w / 2 - f, ey); p.lineTo(ex + w / 2 + f, ey)
        p.quadTo(xi + w / 2, ey + sinal * fh * 0.3, xi + w / 2, yi)
        p.lineTo(xi - w / 2, yi)
        p.quadTo(xi - w / 2, ey + sinal * fh * 0.3, ex - w / 2 - f, ey)
        p.close()
        partes.append(p)
    return _uniao(partes)


def _x_em(a, b, y):
    (ax, ay), (bx, by) = a, b
    return ax + (bx - ax) * (y - ay) / (by - ay)


# Cada letra devolve (partes, largura). Coordenadas locais (x a partir de 0).
def L_I():
    return [haste(ABRE, GROSSO)], GROSSO + 2 * ABRE


def L_K():
    x = ABRE
    braco_a, braco_b = (x + GROSSO - 10, 520), (510, 0)   # termina dentro da fresta
    larg_braco, larg_perna, pe = FINO + 8, GROSSO - 12, 505
    # a perna nasce de dentro do braço: a borda de cima vai da haste até a borda direita do braço
    y_alto = 430
    x_alto = _x_em(braco_a, braco_b, y_alto) + larg_braco / 2
    perna = poly((x + GROSSO, 560), (x_alto, y_alto), (pe + larg_perna / 2, H), (pe - larg_perna / 2, H))
    return [haste(x, GROSSO),
            traco(braco_a, braco_b, larg_braco, abre_b=True),
            perna, traco(((x + GROSSO + x_alto) / 2, (560 + y_alto) / 2), (pe, H), larg_perna, abre_b=True)], 560


def L_A():
    topo_esq, pe_esq = (300, 0), (78, H)
    topo_dir, pe_dir = (318, 0), (548, H)
    yb0, yb1 = 640, 702
    xb0 = _x_em(topo_esq, pe_esq, (yb0 + yb1) / 2)
    xb1 = _x_em(topo_dir, pe_dir, (yb0 + yb1) / 2)
    return [traco(topo_esq, pe_esq, FINO, abre_b=True),
            traco(topo_dir, pe_dir, GROSSO + 6, abre_b=True),
            poly((xb0, yb0), (xb1, yb0), (xb1, yb1), (xb0, yb1))], 630


def L_N():
    xe, xd = ABRE + 4, 545
    return [haste(xe, FINO, cima=False),
            traco((xe + GROSSO / 2 - 6, 0), (xd + FINO - GROSSO / 2 + 6, H), GROSSO),
            haste(xd, FINO, baixo=False),
            haste(xe, FINO, baixo=False, y1=H / 2)], xd + FINO + ABRE


def L_V():
    return [traco((112, 0), (296, H), GROSSO + 6, abre_a=True),
            traco((500, 0), (318, H), FINO, abre_a=True)], 612


def L_E():
    x, fim = ABRE, 438
    return [haste(x, GROSSO, cima=True, baixo=True),
            poly((x, 0), (fim, 0), (fim, 82), (x, 82)),
            poly((x, 392), (fim - 66, 392), (fim - 66, 470), (x, 470)),                     # braço do meio logo acima da fresta
            poly((x, H - 84), (fim + 8, H - 84), (fim + 8, H), (x, H)),
            poly((fim - 44, 82), (fim, 82), (fim, 250)),                            # cunhas nas pontas dos braços
            poly((fim - 30, H - 84), (fim + 8, H - 84), (fim + 8, H - 210)),
            poly((fim - 66, 392), (fim - 66, 470), (fim - 98, 470), (fim - 98, 330))], fim + 30


def L_T():
    w = 540
    xs = (w - GROSSO) / 2
    return [poly((8, 0), (w - 8, 0), (w - 8, 86), (8, 86)),
            poly((8, 86), (58, 86), (8, 250)),
            poly((w - 8, 86), (w - 58, 86), (w - 8, 250)),
            haste(xs, GROSSO, cima=False)], w


LETRAS = {'K': L_K, 'A': L_A, 'N': L_N, 'I': L_I, 'V': L_V, 'E': L_E, 'T': L_T}


def _fatia(p, x0, x1, corte):
    """Golpe de canivete: fresta na horizontal e a metade de cima deslizada para a direita."""
    r = lambda ya, yb: poly((x0 - 300, ya), (x1 + 300, ya), (x1 + 300, yb), (x0 - 300, yb))
    cima = pathops.op(p, r(0, corte - FRESTA / 2), pathops.PathOp.INTERSECTION)
    baixo = pathops.op(p, r(corte + FRESTA / 2, H), pathops.PathOp.INTERSECTION)
    cima = cima.transform(1, 0, 0, 1, DESLIZE, 0)
    return pathops.op(cima, baixo, pathops.PathOp.UNION)


def _svg(path):
    pen = SVGPathPen(None)
    path.draw(pen)
    return re.sub(r'-?\d+\.\d+', lambda m: str(round(float(m.group()))), pen.getCommands())


def gerar(texto='KANIVETE'):
    x, letras = 0, []
    for ch in texto:
        partes, larg = LETRAS[ch]()
        p = _uniao(partes)
        p = p.transform(1, 0, 0, 1, x, 0)
        p = pathops.op(p, poly((x - 300, 0), (x + larg + 300, 0), (x + larg + 300, H), (x - 300, H)),
                       pathops.PathOp.INTERSECTION)    # nada passa do topo nem da base
        letras.append(_fatia(p, x, x + larg, H * CORTE))
        x += larg + ESPACO
    largura, altura = x - ESPACO + DESLIZE, H + 2 * MARGEM
    vb = f'0 {-MARGEM} {largura} {altura}'
    simbolo = (f'<symbol id="i-kanivete" viewBox="{vb}">'
               f'<path class="wm-a" stroke="none" d="{_svg(_uniao(letras[:LARANJA_A_PARTIR]))}"/>'
               f'<path class="wm-b" stroke="none" d="{_svg(_uniao(letras[LARANJA_A_PARTIR:]))}"/></symbol>')
    return simbolo, vb, largura, altura


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--svg', help='grava também um SVG solto (fundo escuro) para conferir')
    ap.add_argument('--so-svg', action='store_true', help='não mexe no app, só grava o --svg')
    a = ap.parse_args()
    simbolo, vb, w, h = gerar()

    if not a.so_svg:
        html = RAIZ / 'frontend' / 'index.html'
        s = html.read_text(encoding='utf-8')
        s = re.sub(r'<symbol id="i-kanivete".*?</symbol>', lambda m: simbolo, s, flags=re.S)
        s = re.sub(r'(<svg class="wordmark[^"]*" viewBox=")[^"]*', lambda m: m.group(1) + vb, s)
        html.write_bytes(s.encode('utf-8'))
        css = RAIZ / 'frontend' / 'css' / 'app.css'
        c = css.read_text(encoding='utf-8')
        c = re.sub(r'(\.wordmark \{[^}]*aspect-ratio: )[\d ./]+;', lambda m: f'{m.group(1)}{w} / {h};', c)
        css.write_bytes(c.encode('utf-8'))

    if a.svg:
        solto = simbolo.replace('<symbol id="i-kanivete"', '<g').replace('</symbol>', '</g>')
        Path(a.svg).write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="1400" style="background:#0e0e0e">'
            f'<style>.wm-a{{fill:#ebebeb}}.wm-b{{fill:#D4814A}}</style>{solto}</svg>', encoding='utf-8')
    print('marca gerada', vb)


if __name__ == '__main__':
    main()
