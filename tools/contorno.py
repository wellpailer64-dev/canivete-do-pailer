"""Qualidade do contorno de um logo (o "pente de curvatura" do RoboFont/Glyphs, para conferir sem olhar a olho).

    py -3.13 tools/contorno.py arte.svg [--png pente.png] [--json]

Aponta: JOELHO (tangente que pula 0,5°–25° num nó que deveria ser liso), SALTO de curvatura entre duas curvas que se
encontram lisas (razão > 1,8 = transição visível; G2 pede ~1), EXTREMO sem ponto (curva passa por topo/base/lado
sem nó ali) e ALÇA desequilibrada (uma alça > 4× a outra no mesmo trecho). Quinas ≥ 25° contam como de propósito.
Também usável como módulo: `avaliar(pathops_path_ou_pen_record)` → lista de achados. Guia: Instructions/agente/direcao-logotipo.md.
"""
import argparse
import json
import math
import re
import sys

from fontTools.pens.recordingPen import RecordingPen


def _segmentos(rec):
    """RecordingPen → contornos com segmentos ('l'|'q'|'c', pontos incluindo o inicial). Passa por um BasePen, que
    já desfaz as quadráticas do TrueType (inclusive o contorno só de pontos fora da curva)."""
    from fontTools.pens.basePen import BasePen
    conts = []

    class Pen(BasePen):
        def _moveTo(self, a): self.cur = []; self.ini = a
        def _lineTo(self, a): self.cur.append(("l", [self._getCurrentPoint(), a]))
        def _qCurveToOne(self, a, b): self.cur.append(("q", [self._getCurrentPoint(), a, b]))
        def _curveToOne(self, a, b, c): self.cur.append(("c", [self._getCurrentPoint(), a, b, c]))
        def _closePath(self):
            p0 = self._getCurrentPoint()
            if p0 and math.dist(p0, self.ini) > 1e-6:
                self.cur.append(("l", [p0, self.ini]))
            cur = [s for s in self.cur if not (s[0] == "l" and math.dist(*s[1]) < 1e-6)]
            if cur:
                conts.append(cur)
        _endPath = _closePath
    pen = Pen(None)
    from fontTools.pens.recordingPen import replayRecording
    replayRecording(rec, pen)
    return conts


def _deriv(tipo, P, t):
    if tipo == "l":
        return (P[1][0] - P[0][0], P[1][1] - P[0][1]), (0.0, 0.0)
    if tipo == "q":
        a, b, c = P
        d1 = tuple(2 * (1 - t) * (b[i] - a[i]) + 2 * t * (c[i] - b[i]) for i in (0, 1))
        d2 = tuple(2 * (c[i] - 2 * b[i] + a[i]) for i in (0, 1))
        return d1, d2
    a, b, c, d = P
    d1 = tuple(3 * (1 - t) ** 2 * (b[i] - a[i]) + 6 * (1 - t) * t * (c[i] - b[i]) + 3 * t * t * (d[i] - c[i]) for i in (0, 1))
    d2 = tuple(6 * (1 - t) * (c[i] - 2 * b[i] + a[i]) + 6 * t * (d[i] - 2 * c[i] + b[i]) for i in (0, 1))
    return d1, d2


def _ponto(tipo, P, t):
    if tipo == "l":
        return tuple(P[0][i] + (P[1][i] - P[0][i]) * t for i in (0, 1))
    if tipo == "q":
        a, b, c = P
        return tuple((1 - t) ** 2 * a[i] + 2 * (1 - t) * t * b[i] + t * t * c[i] for i in (0, 1))
    a, b, c, d = P
    return tuple((1 - t) ** 3 * a[i] + 3 * (1 - t) ** 2 * t * b[i] + 3 * (1 - t) * t * t * c[i] + t ** 3 * d[i] for i in (0, 1))


def _curv(tipo, P, t):
    d1, d2 = _deriv(tipo, P, t)
    n = math.hypot(*d1)
    return 0.0 if n < 1e-9 else (d1[0] * d2[1] - d1[1] * d2[0]) / n ** 3


def _tang(tipo, P, t):
    d1, _ = _deriv(tipo, P, t)
    if math.hypot(*d1) < 1e-9:   # alça recolhida: usa a corda
        d1 = (P[-1][0] - P[0][0], P[-1][1] - P[0][1]) if t == 0 else (P[-1][0] - P[0][0], P[-1][1] - P[0][1])
    return math.atan2(d1[1], d1[0])


def avaliar(rec, escala=1.0):
    """rec = RecordingPen.value ou objeto com .draw(pen). Devolve lista de achados (dicts)."""
    if hasattr(rec, "draw"):
        r = RecordingPen(); rec.draw(r); rec = r.value
    achados = []
    for ci, segs in enumerate(_segmentos(rec)):
        n = len(segs)
        for i in range(n):
            (ta, A), (tb, B) = segs[i], segs[(i + 1) % n]
            no = A[-1]
            ang = abs((math.degrees(_tang(tb, B, 0) - _tang(ta, A, 1)) + 180) % 360 - 180)
            if 0.5 < ang < 25:
                achados.append({"tipo": "JOELHO", "contorno": ci, "no": [round(v) for v in no], "graus": round(ang, 1)})
            elif ang <= 0.5 and ta == "c" and tb == "c":   # quadráticas (TrueType) não fazem G2: só cúbicas
                k1, k2 = abs(_curv(ta, A, 1)), abs(_curv(tb, B, 0))
                lo, hi = sorted((k1, k2))
                if hi > 1e-6 and (lo < 1e-9 or hi / lo > 1.8):
                    achados.append({"tipo": "SALTO", "contorno": ci, "no": [round(v) for v in no],
                                    "razao": round(hi / max(lo, 1e-9), 1) if lo > 1e-9 else "inf"})
        for i, (t, P) in enumerate(segs):
            if t == "l":
                continue
            # extremos internos (derivada x ou y zera dentro do trecho)
            amostras = [_deriv(t, P, k / 40)[0] for k in range(41)]
            for eixo, nome in ((0, "x"), (1, "y")):
                for k in range(2, 39):
                    if amostras[k - 1][eixo] * amostras[k + 1][eixo] < 0 and abs(amostras[k][eixo]) < abs(amostras[k - 1][eixo]):
                        achados.append({"tipo": "EXTREMO", "contorno": ci, "eixo": nome, "em": [round(v) for v in _ponto(t, P, k / 40)]})
                        break
            if t == "c":
                h1, h2 = math.dist(P[0], P[1]), math.dist(P[2], P[3])
                if min(h1, h2) > 1e-6 and max(h1, h2) / min(h1, h2) > 4:
                    achados.append({"tipo": "ALCA", "contorno": ci, "de": [round(v) for v in P[0]], "razao": round(max(h1, h2) / min(h1, h2), 1)})
    return achados


def pente_png(rec, saida, larg=1400):
    """Desenha o contorno com o pente de curvatura (agulhas normais ∝ curvatura) e marca os achados."""
    import skia
    if hasattr(rec, "draw"):
        r = RecordingPen(); rec.draw(r); rec = r.value
    conts = _segmentos(rec)
    xs = [p[0] for c in conts for _, P in c for p in P]; ys = [p[1] for c in conts for _, P in c for p in P]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    m = 0.12 * max(x1 - x0, y1 - y0); esc = larg / (x1 - x0 + 2 * m); alt = int((y1 - y0 + 2 * m) * esc)
    T = lambda p: ((p[0] - x0 + m) * esc, (y1 - p[1] + m) * esc)
    sup = skia.Surface(larg, alt); c = sup.getCanvas(); c.clear(skia.Color(250, 250, 248))
    fio = skia.Paint(Color=skia.Color(30, 40, 70), StrokeWidth=2, Style=skia.Paint.kStroke_Style, AntiAlias=True)
    agulha = skia.Paint(Color=skia.Color(240, 120, 80, 150), StrokeWidth=1, AntiAlias=True)
    kmax = max((abs(_curv(t, P, k / 20)) for cc in conts for t, P in cc if t != "l" for k in range(21)), default=1) or 1
    for cc in conts:
        for t, P in cc:
            pts = [_ponto(t, P, k / 30) for k in range(31)]
            for a, b in zip(pts, pts[1:]):
                c.drawLine(*T(a), *T(b), fio)
            if t == "l":
                continue
            for k in range(31):
                d1, _ = _deriv(t, P, k / 30); nn = math.hypot(*d1) or 1
                kk = _curv(t, P, k / 30) / kmax * 0.08 * max(x1 - x0, y1 - y0)
                p = _ponto(t, P, k / 30); q = (p[0] + d1[1] / nn * kk, p[1] - d1[0] / nn * kk)
                c.drawLine(*T(p), *T(q), agulha)
    alerta = skia.Paint(Color=skia.Color(220, 30, 60), AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=3)
    for a in avaliar(rec):
        p = a.get("no") or a.get("em") or a.get("de")
        c.drawCircle(*T(p), 14, alerta)
    sup.makeImageSnapshot().save(saida, skia.kPNG)


def _de_svg(caminho):
    from fontTools.svgLib.path import parse_path
    r = RecordingPen()
    for d in re.findall(r' d="([^"]+)"', open(caminho, encoding="utf-8").read()):
        parse_path(d, r)
    return r.value


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("svg"); ap.add_argument("--png"); ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    rec = _de_svg(a.svg)
    ach = avaliar(rec)
    if a.png:
        pente_png(rec, a.png)
    if a.json:
        print(json.dumps(ach, ensure_ascii=False))
    else:
        from collections import Counter
        print("achados:", dict(Counter(x["tipo"] for x in ach)) or "nenhum")
        for x in ach[:12]:
            print(" ", x)
    sys.exit(1 if any(x["tipo"] in ("JOELHO", "SALTO") for x in ach) else 0)
