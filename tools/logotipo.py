"""Logotipo a partir de uma fonte livre (OFL) com letras redesenhadas: técnica de agência "fonte de base + ajustes".

    py -3.13 tools/logotipo.py --fonte F.ttf --eixos SOFT=100,WONK=0,opsz=144,wght=560 --texto sereno
        --troca o=gota --rastreio -10 --saida pasta [--cores marca.json]

Saídas na pasta: logotipo.svg (curvas, y para baixo, 1 unidade = 1 unidade da fonte), simbolo.svg (letra trocada sozinha),
folha.png (construção: linha de base, altura-x, área de proteção = altura-x, versões positiva/negativa, redução mínima).
Trocas disponíveis em TROCAS (cada uma recebe o caminho da letra e devolve o novo); crie novas aqui.
Precisa de fontTools, skia-pathops e skia-python.
"""
import argparse
import json
import math
from pathlib import Path

import pathops
import skia
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


def _caminho_letra(gs, nome):
    p = pathops.Path()
    gs[nome].draw(p.getPen())
    return pathops.simplify(p, fix_winding=True)


def _bbox(p):
    return p.bounds  # (xmin, ymin, xmax, ymax), y para cima


# ---------- trocas de letra ----------
def gota(p, inclina=30, ponta=1.78, raio_ponta=0.06, concavo=0.05):
    """'o' vira gota de orvalho: a casca externa ganha uma ponta (inclinada para a direita) tangente à elipse;
    o miolo continua o da fonte (contraste de peso fica na ponta, como gota cheia)."""
    x0, y0, x1, y1 = _bbox(p)
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    a = math.radians(inclina)
    # ponta no espaço do círculo unitário (elipse → círculo: dividir por rx, ry)
    ux, uy = math.sin(a) * ponta, math.cos(a) * ponta
    d = math.hypot(ux, uy)
    base = math.atan2(uy, ux)
    abre = math.acos(1 / d)
    tang = [(math.cos(base + s * abre), math.sin(base + s * abre)) for s in (1, -1)]
    E = lambda u, v: (cx + u * rx, cy + v * ry)
    ap = E(ux, uy)
    t1, t2 = E(*tang[0]), E(*tang[1])
    # ponta levemente arredondada: corta a quina com uma curva
    r = raio_ponta
    q1 = (ap[0] + (t1[0] - ap[0]) * r, ap[1] + (t1[1] - ap[1]) * r)
    q2 = (ap[0] + (t2[0] - ap[0]) * r, ap[1] + (t2[1] - ap[1]) * r)
    tri = pathops.Path()
    tri.moveTo(*E(0, 0)); tri.lineTo(*t1); tri.lineTo(*q1); tri.quadTo(*ap, *q2); tri.lineTo(*t2); tri.close()
    # tira o miolo da fonte de dentro da ponta
    miolo = pathops.Path()
    contornos = list(p.contours)
    externo = max(contornos, key=lambda c: (_bbox(c)[2] - _bbox(c)[0]))
    for c in contornos:
        if c is not externo:
            miolo = pathops.op(miolo, c, pathops.PathOp.UNION)
    casca = pathops.op(externo, tri, pathops.PathOp.UNION)
    casca = pathops.simplify(casca, fix_winding=True)
    return pathops.op(casca, miolo, pathops.PathOp.DIFFERENCE)


TROCAS = {"gota": gota}


# ---------- montagem ----------
def montar(fonte, eixos, texto, trocas, rastreio):
    f = TTFont(fonte)
    if eixos and "fvar" in f:
        f = instancer.instantiateVariableFont(f, eixos)
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    os2 = f["OS/2"]
    xh, cap = os2.sxHeight, os2.sCapHeight
    kern = {}
    # par de kerning simples pelo GPOS não é lido aqui: o rastreio e o ajuste por par (abaixo) resolvem o óptico
    total = pathops.Path()
    x = 0
    letras = []
    for i, ch in enumerate(texto):
        nome = cmap[ord(ch)]
        p = _caminho_letra(gs, nome)
        if ch in trocas:
            p = TROCAS[trocas[ch]](p)
        adv = hmtx[nome][0]
        letras.append((ch, p, x))
        x += adv + rastreio + kern.get(texto[i:i + 2], 0)
    for ch, p, dx in letras:
        q = pathops.Path()
        pen = q.getPen()
        from fontTools.pens.transformPen import TransformPen
        p.draw(TransformPen(pen, (1, 0, 0, 1, dx, 0)))
        total = pathops.op(total, q, pathops.PathOp.UNION)
    return total, letras, {"xh": xh, "cap": cap, "upm": f["head"].unitsPerEm}


def svg_de(p, cor="#000"):
    x0, y0, x1, y1 = _bbox(p)
    pen = SVGPathPen(None)
    from fontTools.pens.transformPen import TransformPen
    p.draw(TransformPen(pen, (1, 0, 0, -1, -x0, y1)))
    w, h = x1 - x0, y1 - y0
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">'
            f'<path fill="{cor}" d="{pen.getCommands()}"/></svg>')


def _skpath(p, esc, dx, dy):
    """pathops (y para cima) → skia (y para baixo), escala e posição."""
    from fontTools.pens.basePen import BasePen
    sp = skia.Path()
    T = lambda x, y: (dx + x * esc, dy - y * esc)

    class _Pen(BasePen):  # BasePen quebra qCurveTo de vários pontos (TrueType) em segmentos simples
        def _moveTo(self, a): sp.moveTo(*T(*a))
        def _lineTo(self, a): sp.lineTo(*T(*a))
        def _qCurveToOne(self, a, b): sp.quadTo(*T(*a), *T(*b))
        def _curveToOne(self, a, b, c): sp.cubicTo(*T(*a), *T(*b), *T(*c))
        def _closePath(self): sp.close()
    p.draw(_Pen(None))
    sp.setFillType(skia.PathFillType.kWinding)
    return sp


def _hex(h):
    h = h.lstrip("#")
    return skia.Color(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def folha(logo, simb, met, cores, saida):
    W, H = 2400, 1800
    sup = skia.Surface(W, H)
    c = sup.getCanvas()
    claro, escuro = _hex(cores[0]), _hex(cores[1])
    acento = _hex(cores[2]) if len(cores) > 2 else escuro
    c.clear(skia.Color(250, 250, 248))
    x0, y0, x1, y1 = _bbox(logo)
    xh = met["xh"]
    # 1) construção grande
    esc = 1500 / (x1 - x0)
    ox, base = 450 - x0 * esc, 520
    fio = skia.Paint(Color=skia.Color(230, 60, 90), StrokeWidth=1.5, Style=skia.Paint.kStroke_Style, AntiAlias=True)
    prot = skia.Paint(Color=skia.Color(80, 140, 230, 60), AntiAlias=True)
    u = xh * esc  # área de proteção = altura-x
    c.drawRect(skia.Rect(ox + x0 * esc - u, base - y1 * esc - u, ox + x1 * esc + u, base - y0 * esc + u), prot)
    c.drawRect(skia.Rect(ox + x0 * esc, base - y1 * esc, ox + x1 * esc, base - y0 * esc),
               skia.Paint(Color=skia.Color(250, 250, 248)))
    c.drawPath(_skpath(logo, esc, ox, base), skia.Paint(Color=escuro, AntiAlias=True))
    for y in (0, xh):
        c.drawLine(ox + x0 * esc - u, base - y * esc, ox + x1 * esc + u, base - y * esc, fio)
    fonte = skia.Font(skia.Typeface("Segoe UI"), 22)
    txt = skia.Paint(Color=skia.Color(120, 120, 120), AntiAlias=True)
    c.drawString("linha de base · altura-x · área de proteção = altura-x", ox + x0 * esc - u, base - y0 * esc + u + 40, fonte, txt)
    # 2) versões
    faixa = 760
    for i, (fundo, tinta) in enumerate(((claro, escuro), (escuro, claro), (acento, claro))):
        L = 80 + i * 760
        c.drawRect(skia.Rect(L, faixa, L + 700, faixa + 520), skia.Paint(Color=fundo))
        e2 = 520 / (x1 - x0)
        c.drawPath(_skpath(logo, e2, L + 90 - x0 * e2, faixa + 300), skia.Paint(Color=tinta, AntiAlias=True))
    # 3) símbolo e redução
    sx0, sy0, sx1, sy1 = _bbox(simb)
    e3 = 300 / (sy1 - sy0)
    c.drawCircle(300, 1530, 200, skia.Paint(Color=escuro, AntiAlias=True))
    c.drawPath(_skpath(simb, e3, 300 - (sx0 + sx1) / 2 * e3, 1530 + (sy0 + sy1) / 2 * e3), skia.Paint(Color=claro, AntiAlias=True))
    for k, larg in enumerate((240, 120, 60)):
        e4 = larg / (x1 - x0)
        c.drawPath(_skpath(logo, e4, 640 + k * 300 - x0 * e4, 1560), skia.Paint(Color=escuro, AntiAlias=True))
    c.drawString("redução: 240 / 120 / 60 px", 640, 1640, fonte, txt)
    sup.makeImageSnapshot().save(str(saida), skia.kPNG)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonte", required=True)
    ap.add_argument("--eixos", default="")
    ap.add_argument("--texto", required=True)
    ap.add_argument("--troca", default="", help="letra=troca,... (ex. o=gota)")
    ap.add_argument("--rastreio", type=float, default=0)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--cores", default="#f6f0e4,#1f2a44,#f08a5d", help="claro,escuro,acento ou marca.json")
    a = ap.parse_args()
    eixos = {k: float(v) for k, v in (e.split("=") for e in a.eixos.split(",") if e)}
    trocas = dict(t.split("=") for t in a.troca.split(",") if t)
    out = Path(a.saida); out.mkdir(parents=True, exist_ok=True)
    logo, letras, met = montar(a.fonte, eixos, a.texto, trocas, a.rastreio)
    simb = next((p for ch, p, _ in letras if ch in trocas), letras[0][1])
    if a.cores.endswith(".json"):
        cs = json.loads(Path(a.cores).read_text(encoding="utf-8"))["cores"]
        cores = [v["hex"] for v in cs.values()]
    else:
        cores = a.cores.split(",")
    (out / "logotipo.svg").write_text(svg_de(logo), encoding="utf-8")
    (out / "simbolo.svg").write_text(svg_de(simb), encoding="utf-8")
    folha(logo, simb, met, cores, out / "folha.png")
    x0, y0, x1, y1 = _bbox(logo)
    print(json.dumps({"larg": round(x1 - x0), "alt": round(y1 - y0), "xh": met["xh"], "pasta": str(out)}))


if __name__ == "__main__":
    main()
