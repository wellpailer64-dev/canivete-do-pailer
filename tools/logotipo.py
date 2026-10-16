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
K = 0.5522847498   # alça do quarto de círculo em cúbica


def gota_bez(rx, ry, altura, meio=28, inclina=0.0, cx=0.0, cy=0.0, folga=0.45):
    """Gota em Bézier, construída como desenhista de letra: a base é meia elipse (2 quartos, pontos nos extremos, alças
    horizontais/verticais) e cada lado sobe até a ponta numa cúbica com curvatura IGUAL à da elipse na emenda (G2: sem
    joelho) e tangente na ponta inclinada `meio` graus do eixo. `altura` = do centro até a ponta. Desenhada reta e
    girada inteira (inclina, graus, sentido horário). Devolve pathops.Path."""
    ph = math.radians(meio)
    c = folga * altura
    p2x = c * math.sin(ph)
    a = math.sqrt(max(1e-9, (2 / 3) * (rx - p2x) * ry * ry / rx))     # κ(0) = rx/ry² (curvatura da elipse no lado)
    pts = {"dir": (rx, 0), "base": (0, -ry), "esq": (-rx, 0), "ponta": (0, altura)}
    t = math.radians(-inclina)
    R = lambda x, y: (cx + x * math.cos(t) - y * math.sin(t), cy + x * math.sin(t) + y * math.cos(t))
    g = pathops.Path()
    g.moveTo(*R(0, altura))
    g.cubicTo(*R(-p2x, altura - c * math.cos(ph)), *R(-rx, a), *R(-rx, 0))            # lado esquerdo desce
    g.cubicTo(*R(-rx, -K * ry), *R(-K * rx, -ry), *R(0, -ry))                         # quarto inferior esquerdo
    g.cubicTo(*R(K * rx, -ry), *R(rx, -K * ry), *R(rx, 0))                            # quarto inferior direito
    g.cubicTo(*R(rx, a), *R(p2x, altura - c * math.cos(ph)), *R(0, altura))           # lado direito sobe
    g.close()
    return g


def gota(p, inclina=12, ponta=1.62, meio=28):
    """'o' vira gota de orvalho: casca e miolo construídos com gota_bez a partir das medidas da letra da fonte (traço
    vertical e horizontal medidos — horizontais mais finas, como na fonte), miolo com a ponta recuada pela espessura /
    seno do meio-ângulo (lados paralelos = traço uniforme)."""
    contornos = list(p.contours)
    ext = max(contornos, key=lambda c: (_bbox(c)[2] - _bbox(c)[0]))
    bx = _bbox(ext)
    rx, ry = (bx[2] - bx[0]) / 2, (bx[3] - bx[1]) / 2
    cx, cy = bx[0] + rx, bx[1] + ry
    internos = [c for c in contornos if c is not ext]
    casca = gota_bez(rx, ry, ponta * ry, meio, inclina, cx, cy)
    if not internos:
        return casca
    bi = _bbox(internos[0])
    tv, th = rx - (bi[2] - bi[0]) / 2, ry - (bi[3] - bi[1]) / 2
    miolo = deslocar(casca, -tv)                                        # traço uniforme = casca deslocada para dentro
    mb = _bbox(miolo); my = (mb[1] + mb[3]) / 2
    k = (ry - th) / max(1e-6, ry - tv)                                  # horizontais um pouco mais finas (como a fonte)
    from fontTools.pens.transformPen import TransformPen
    m2 = pathops.Path(); miolo.draw(TransformPen(m2.getPen(), (1, 0, 0, k, 0, cy - cy * k)))
    miolo = m2
    return pathops.op(casca, miolo, pathops.PathOp.DIFFERENCE)


def deslocar(p, d):
    """Deslocamento do contorno (offset do Illustrator) por d unidades; d < 0 = para dentro. Feito com o traçador do
    skia (contorno do traço de largura 2|d|, quinas em ponta) e operação booleana."""
    import skia
    sp = skia.Path()
    from fontTools.pens.basePen import BasePen

    class _P(BasePen):
        def _moveTo(self, a): sp.moveTo(*a)
        def _lineTo(self, a): sp.lineTo(*a)
        def _qCurveToOne(self, a, b): sp.quadTo(*a, *b)
        def _curveToOne(self, a, b, c): sp.cubicTo(*a, *b, *c)
        def _closePath(self): sp.close()
    p.draw(_P(None))
    pinta = skia.Paint(Style=skia.Paint.kStroke_Style, StrokeWidth=2 * abs(d), StrokeJoin=skia.Paint.kMiter_Join, StrokeMiter=20)
    faixa = skia.Path(); pinta.getFillPath(sp, faixa)
    r = skia.Op(sp, faixa, skia.PathOp.kDifference_PathOp if d < 0 else skia.PathOp.kUnion_PathOp)
    out = pathops.Path(); pen = out.getPen()
    for verbo, pts in r:
        if verbo == skia.Path.kMove_Verb: pen.moveTo(tuple(pts[0]))
        elif verbo == skia.Path.kLine_Verb: pen.lineTo(tuple(pts[1]))
        elif verbo == skia.Path.kQuad_Verb: pen.qCurveTo(tuple(pts[1]), tuple(pts[2]))
        elif verbo == skia.Path.kConic_Verb: pen.qCurveTo(tuple(pts[1]), tuple(pts[2]))
        elif verbo == skia.Path.kCubic_Verb: pen.curveTo(tuple(pts[1]), tuple(pts[2]), tuple(pts[3]))
        elif verbo == skia.Path.kClose_Verb: pen.closePath()
    return pathops.simplify(out, fix_winding=True)


def nos_extremos(p):
    """Acrescenta âncoras nos extremos horizontais/verticais de cada cúbica (divide no t do extremo, de Casteljau),
    como 'Adicionar âncoras' do Illustrator: regra de desenhista de letra mesmo depois de girar a peça."""
    from fontTools.pens.recordingPen import RecordingPen
    from fontTools.misc.bezierTools import splitCubicAtT
    rec = RecordingPen(); p.draw(rec)
    out = pathops.Path(); pen = out.getPen(); cur = None
    for op, pts in rec.value:
        if op == "curveTo" and len(pts) == 3:
            a, b, c, d = cur, *pts
            ts = []
            for i in (0, 1):   # raízes de B'(t) = 0 em x e em y
                A = -a[i] + 3 * b[i] - 3 * c[i] + d[i]; B = 2 * (a[i] - 2 * b[i] + c[i]); C = b[i] - a[i]
                if abs(A) < 1e-12:
                    rs = [-C / B] if abs(B) > 1e-12 else []
                else:
                    D = B * B - 4 * A * C
                    rs = [] if D < 0 else [(-B + s_ * D ** 0.5) / (2 * A) for s_ in (1, -1)]
                ts += [t for t in rs if 0.02 < t < 0.98]
            ts = sorted(set(round(t, 6) for t in ts))
            for seg in (splitCubicAtT(a, b, c, d, *ts) if ts else [(a, b, c, d)]):
                pen.curveTo(*seg[1:])
            cur = d
        elif op == "qCurveTo" and pts[-1] is not None:   # quadráticas (miolo do deslocamento): extremo em t = −B/2A
            from fontTools.pens.basePen import decomposeQuadraticSegment
            from fontTools.misc.bezierTools import splitQuadraticAtT
            for b, c in decomposeQuadraticSegment(pts):
                a = cur
                ts = sorted(t for t in ((a[i] - b[i]) / (a[i] - 2 * b[i] + c[i]) for i in (0, 1)
                                        if abs(a[i] - 2 * b[i] + c[i]) > 1e-12) if 0.02 < t < 0.98)
                for seg in (splitQuadraticAtT(a, b, c, *ts) if ts else [(a, b, c)]):
                    pen.qCurveTo(*seg[1:])
                cur = c
        else:
            getattr(pen, op)(*pts)
            cur = pts[-1] if pts else cur
    return out


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
    logo, simb = nos_extremos(logo), nos_extremos(simb)
    (out / "logotipo.svg").write_text(svg_de(logo), encoding="utf-8")
    (out / "simbolo.svg").write_text(svg_de(simb), encoding="utf-8")
    folha(logo, simb, met, cores, out / "folha.png")
    x0, y0, x1, y1 = _bbox(logo)
    print(json.dumps({"larg": round(x1 - x0), "alt": round(y1 - y0), "xh": met["xh"], "pasta": str(out)}))


if __name__ == "__main__":
    main()
