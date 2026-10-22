"""Polimento final da montagem (regras universais do Pailer, 2026-10-22):
1) sem "pisca" de rosto: nada de sair de um B-roll para menos de MIN_ROSTO s da pessoa e já trocar de cena — o B-roll
   estica até a troca (ou o seguinte começa mais cedo);
2) sem "pisca" preto: nenhum buraco (nem de milésimos) sem imagem entre o começo e o fim do vídeo.
polir(clips, media, dur_mid) mexe nos clipes (st/s/e) e devolve a lista do que fez; conferir(...) só relata."""

MIN_ROSTO = 1.5
EPS = 0.0005


def _fim(c):
    return c["st"] + c["e"] - c["s"]


def _visiveis(clips, media):
    kind = {m["id"]: m.get("kind") for m in media if m}
    return [c for c in clips if c["tr"] in (0, 1) and c.get("x") != "a" and not c.get("off")
            and kind.get(c.get("m")) in ("video", "image")]


def _segmentos(vis, fim):
    """[(a, b, clipe por cima)] cobrindo 0..fim; clipe None = preto"""
    bord = sorted({0.0, fim} | {round(c["st"], 4) for c in vis} | {round(_fim(c), 4) for c in vis})
    seg = []
    for a, b in zip(bord, bord[1:]):
        if b - a < 1e-6 or a >= fim: continue
        m = (a + b) / 2
        top = max((c for c in vis if c["st"] <= m < _fim(c)), key=lambda c: c["tr"], default=None)
        if seg and seg[-1][2] is top and abs(seg[-1][1] - a) < 1e-6:
            seg[-1] = (seg[-1][0], b, top)
        else:
            seg.append((a, b, top))
    return seg


def conferir(clips, media, fim=None):
    vis = _visiveis(clips, media)
    fim = fim or max(_fim(c) for c in vis)
    seg = _segmentos(vis, fim)
    pretos = [(round(a, 3), round(b - a, 3)) for a, b, c in seg if c is None]
    piscas = [(round(a, 3), round(b - a, 3)) for i, (a, b, c) in enumerate(seg)
              if c is not None and c["tr"] == 0 and b - a < MIN_ROSTO and 0 < i < len(seg) - 1
              and (seg[i - 1][2] is not None and seg[i - 1][2]["tr"] == 1 or seg[i + 1][2] is not None and seg[i + 1][2]["tr"] == 1)]
    return {"pretos": pretos, "piscas": piscas}


def polir(clips, media, dur_mid, fim=None, voltas=6):
    """dur_mid: id da mídia → duração da fonte (s). Corrige piscas de rosto e buracos pretos."""
    feito = []
    for _ in range(voltas):
        vis = _visiveis(clips, media)
        fim_t = fim or max(_fim(c) for c in vis)
        seg = _segmentos(vis, fim_t)
        mudou = False
        for i, (a, b, c) in enumerate(seg):
            curto = b - a
            ant = seg[i - 1][2] if i > 0 else None
            prox = seg[i + 1][2] if i + 1 < len(seg) else None
            preto = c is None
            pisca = (c is not None and c["tr"] == 0 and curto < MIN_ROSTO and 0 < i < len(seg) - 1
                     and ((ant is not None and ant["tr"] == 1) or (prox is not None and prox["tr"] == 1)))
            if not (preto or pisca): continue
            # 1º: o B-roll de antes estica até o fim do trecho (cobre a troca de cena)
            if ant is not None and (preto or ant["tr"] == 1) and abs(_fim(ant) - a) < 1e-3:
                folga = dur_mid.get(ant["m"], 1e9) - 0.1 - ant["e"]
                if folga >= curto:
                    ant["e"] = round(ant["e"] + curto + EPS, 4); feito.append(("estica", round(a, 2), round(curto, 2))); mudou = True; break
            # 2º: o B-roll de depois começa mais cedo
            if prox is not None and (preto or prox["tr"] == 1) and abs(prox["st"] - b) < 1e-3 and prox["s"] >= curto:
                prox["st"] = round(prox["st"] - curto - EPS, 4); prox["s"] = round(prox["s"] - curto - EPS, 4)
                feito.append(("antecipa", round(a, 2), round(curto, 2))); mudou = True; break
            # 3º (rosto curto entre dois B-rolls ou no fim do B-roll sem folga): o B-roll de antes encolhe e o rosto fica ≥ MIN_ROSTO
            if pisca and ant is not None and ant["tr"] == 1 and (ant["e"] - ant["s"]) - (MIN_ROSTO - curto) >= 1.2:
                d = MIN_ROSTO - curto
                ant["e"] = round(ant["e"] - d, 4); feito.append(("encolhe", round(a, 2), round(curto, 2))); mudou = True; break
        if not mudou:
            break
    return feito


if __name__ == "__main__":
    # py -3.13 tools/agente/polir_montagem.py projeto.vknv  → relata piscas de rosto e buracos pretos da timeline ativa
    import json, sys
    sys.stdout.reconfigure(encoding="utf-8")
    p = json.load(open(sys.argv[1], encoding="utf-8"))
    s = next(x for x in p["sequences"] if x["id"] == p["activeSequence"])
    print(json.dumps(conferir(s["clips"], p["media"]), ensure_ascii=False))
