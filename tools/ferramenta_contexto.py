"""Ferramenta de contexto — recorte retangular só do corpo da pessoa principal numa pasta de fotos, e escolha das
melhores referências (rosto nítido, ângulos e enquadramentos diferentes) para gerar imagens novas dela numa IA.

    py -3.13 tools/ferramenta_contexto.py "<pasta de fotos>" [--escolher 12] [--saida REFERENCIA]

1) Rostos (YuNet + SFace): a pessoa principal é a identidade que mais aparece na pasta (outras pessoas são ignoradas).
2) Corpo: máscara do assunto (ISNet, placa via DirectML) → só a parte ligada ao rosto dela → caixa + folga.
3) Grava os recortes em <pasta>/REFERENCIA, um indice.json (nitidez do rosto, giro, inclinação, enquadramento) e,
   com --escolher N, copia as N mais variadas e nítidas para REFERENCIA/ESCOLHIDAS + folha de contato.
"""
import argparse
import json
import os
import shutil
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

EXT = (".jpg", ".jpeg", ".png", ".webp")
LADO_ROSTO = 1280   # detecção de rosto numa cópia reduzida


def _ler(caminho):
    im = ImageOps.exif_transpose(Image.open(caminho)).convert("RGB")
    return im


def _rostos(bgr):
    from Functions.busca_rosto import _modelos
    det, rec = _modelos()
    h, w = bgr.shape[:2]
    s = min(1.0, LADO_ROSTO / max(h, w))
    im = cv2.resize(bgr, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else bgr
    det.setInputSize((im.shape[1], im.shape[0]))
    _, f = det.detect(im)
    out = []
    for r in (f if f is not None else []):
        if min(r[2], r[3]) < 30:
            continue
        e = rec.feature(rec.alignCrop(im, r)).ravel().astype(np.float32)
        out.append({"vet": e / (np.linalg.norm(e) + 1e-9), "r": (r[:14] / s).tolist(), "conf": float(r[-1])})
    return out


def _pose(r):
    """Giro (−1 esquerda … 1 direita) e inclinação (cabeça p/ cima/baixo) pelos 5 pontos do YuNet."""
    ex1, ey1, ex2, ey2, nx, ny, mx1, my1, mx2, my2 = r[4:14]
    olhos = max(1.0, abs(ex2 - ex1))
    giro = float(np.clip((nx - (ex1 + ex2) / 2) / (olhos * 0.5), -1, 1))
    oy, my = (ey1 + ey2) / 2, (my1 + my2) / 2
    incl = float((ny - oy) / max(1.0, my - oy))   # ~0,55 de frente; menor = olhando p/ cima
    return giro, incl


def _nitidez(bgr, r):
    x, y, w, h = [int(v) for v in r[:4]]
    x, y = max(0, x), max(0, y)
    roi = cv2.cvtColor(bgr[y:y + h, x:x + w], cv2.COLOR_BGR2GRAY)
    if roi.size == 0:
        return 0.0
    roi = cv2.resize(roi, (160, int(160 * roi.shape[0] / max(1, roi.shape[1]))))
    return float(cv2.Laplacian(roi, cv2.CV_64F).var())


def _mascara(pil):
    from Functions import removerfundo as rf
    cfg = rf.MODELOS["isnet"]
    lado = cfg["lado"]
    x = np.asarray(pil.resize((lado, lado), Image.BILINEAR), dtype=np.float32) / 255.0
    x = ((x - np.array(cfg["mean"])) / np.array(cfg["std"])).transpose(2, 0, 1)[None].astype(np.float32)
    sess = rf._get_sessao(rf._modelo_path_cfg("isnet")[0])
    m = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    m = (m - m.min()) / (m.max() - m.min() + 1e-8)
    return cv2.resize(m, pil.size, interpolation=cv2.INTER_LINEAR)


def _caixa_corpo(masc, rosto, w, h):
    """Caixa da parte da máscara ligada ao rosto; sem máscara útil, estima pelo rosto."""
    fx, fy, fw, fh = rosto[:4]
    b = (masc > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(b, 8)
    cx, cy = int(np.clip(fx + fw / 2, 0, w - 1)), int(np.clip(fy + fh / 2, 0, h - 1))
    alvo = lab[cy, cx]
    if alvo == 0:   # centro do rosto fora da máscara: o componente com mais pixels dentro da caixa do rosto
        sub = lab[int(max(0, fy)):int(fy + fh), int(max(0, fx)):int(fx + fw)]
        v = np.bincount(sub.ravel(), minlength=n)
        v[0] = 0
        alvo = int(v.argmax()) if v.max() > 0 else 0
    if alvo:
        x0, y0, bw, bh = st[alvo][:4]
        x1, y1 = x0 + bw, y0 + bh
        # largura plausível de corpo: no máx. ~5 rostos para cada lado (corta móveis/pessoas grudadas)
        x0, x1 = max(x0, fx + fw / 2 - fw * 5), min(x1, fx + fw / 2 + fw * 5)
        y0 = min(y0, fy)
    else:
        x0, x1, y0, y1 = fx - fw * 2.5, fx + fw * 3.5, fy - fh * 0.5, h
    fol = fw * 0.35
    x0, y0 = max(0, int(x0 - fol)), max(0, int(y0 - fol))
    x1, y1 = min(w, int(x1 + fol)), min(h, int(y1 + fol))
    return x0, y0, x1, y1


def _principal(dados):
    """Identidade que mais aparece: para cada rosto, quantas fotos têm um rosto parecido (> 0,45)."""
    todos = [(i, j, f["vet"]) for i, d in enumerate(dados) for j, f in enumerate(d["rostos"])]
    if not todos:
        return None
    V = np.stack([t[2] for t in todos])
    sim = V @ V.T
    fotos = np.array([t[0] for t in todos])
    voto = [len(set(fotos[sim[k] > 0.45])) for k in range(len(todos))]
    k = int(np.argmax(voto))
    cent = V[sim[k] > 0.45].mean(0)
    return cent / np.linalg.norm(cent)


def _enquadre(cx, rosto):
    """close (rosto domina), meio corpo, corpo inteiro — pela altura do recorte em rostos."""
    alt = (cx[3] - cx[1]) / max(1.0, rosto[3])
    return "close" if alt < 3.2 else ("meio" if alt < 6.5 else "inteiro")


def _aparencia(caminho):
    """Miniatura 12×16 em cor, centrada: separa roupa/cenário/pose parecidos (fotos da mesma rajada)."""
    im = np.asarray(Image.open(caminho).convert("RGB").resize((12, 16), Image.BILINEAR), dtype=np.float32).ravel()
    im = im - im.mean()
    return im / (np.linalg.norm(im) + 1e-6)


def escolher(itens, n, pasta):
    """Só ele na foto, rosto grande e nítido; depois as mais diferentes entre si (pose do rosto, enquadramento e aparência)."""
    ok = [d for d in itens if d["nitidez"] >= np.percentile([x["nitidez"] for x in itens], 40)
          and d["lado_rosto"] >= 90 and d["sim"] >= 0.5 and not d.get("outras_pessoas")
          and 0.4 <= d["incl"] <= 0.68]   # cabeça muito baixa (escrevendo, tablet) esconde o rosto
    if not ok:
        return []
    enq = {"close": 0, "meio": 1, "inteiro": 2}
    F = np.array([[d["giro"] * 2, (d["incl"] - 0.55) * 4, enq[d["enquadre"]] * 0.8] for d in ok])
    F = np.hstack([F, np.stack([_aparencia(os.path.join(pasta, d["arq"])) for d in ok]) * 1.5])
    nota = np.array([d["nitidez"] for d in ok])
    nota = nota / nota.max()
    sel = [int(np.argmax(nota - np.abs(F[:, 0]) * 0.3))]   # começa pela mais nítida de frente
    while len(sel) < min(n, len(ok)):
        dist = np.min(np.linalg.norm(F[:, None] - F[sel][None], axis=2), axis=1)
        dist[sel] = -1
        sel.append(int(np.argmax(dist * (0.5 + nota))))
    return [ok[i] for i in sel]


def folha(caminhos, destino, lado=300, col=4):
    ims = []
    for c in caminhos:
        im = Image.open(c).convert("RGB")
        im.thumbnail((lado, lado))
        q = Image.new("RGB", (lado, lado), (20, 20, 20))
        q.paste(im, ((lado - im.width) // 2, (lado - im.height) // 2))
        ims.append(q)
    lin = (len(ims) + col - 1) // col
    f = Image.new("RGB", (col * lado, max(1, lin) * lado), (20, 20, 20))
    for i, q in enumerate(ims):
        f.paste(q, ((i % col) * lado, (i // col) * lado))
    f.save(destino, quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pasta")
    ap.add_argument("--saida", default="REFERENCIA")
    ap.add_argument("--escolher", type=int, default=0)
    ap.add_argument("--so-escolher", action="store_true", help="refaz só a escolha, lendo o indice.json")
    a = ap.parse_args()
    pasta = a.pasta
    saida = os.path.join(pasta, a.saida)
    os.makedirs(saida, exist_ok=True)
    arqs = [] if a.so_escolher else sorted(f for f in os.listdir(pasta) if f.lower().endswith(EXT))
    print(f"{len(arqs)} fotos", flush=True)

    dados = []
    for i, f in enumerate(arqs):
        bgr = cv2.cvtColor(np.asarray(_ler(os.path.join(pasta, f))), cv2.COLOR_RGB2BGR)
        dados.append({"arq": f, "rostos": _rostos(bgr)})
        if i % 50 == 0:
            print(f"rostos {i}/{len(arqs)}", flush=True)
    cent = _principal(dados)

    itens = []
    for i, d in enumerate(dados):
        if not d["rostos"] or cent is None:
            continue
        sims = [float(r["vet"] @ cent) for r in d["rostos"]]
        k = int(np.argmax(sims))
        if sims[k] < 0.4:
            continue
        r = d["rostos"][k]["r"]
        pil = _ler(os.path.join(pasta, d["arq"]))
        w, h = pil.size
        cx = _caixa_corpo(_mascara(pil), r, w, h)
        nome = os.path.splitext(d["arq"])[0] + ".jpg"
        pil.crop(cx).save(os.path.join(saida, nome), quality=95)
        bgr = cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
        giro, incl = _pose(r)
        itens.append({"arq": nome, "origem": d["arq"], "caixa": list(cx), "sim": round(sims[k], 3),
                      "lado_rosto": round(min(r[2], r[3])), "nitidez": round(_nitidez(bgr, r), 1),
                      "giro": round(giro, 2), "incl": round(incl, 2), "enquadre": _enquadre(cx, r),
                      "outras_pessoas": len(d["rostos"]) - 1})
        if i % 25 == 0:
            print(f"recorte {i}/{len(dados)}", flush=True)
    if a.so_escolher:
        itens = json.load(open(os.path.join(saida, "indice.json"), encoding="utf-8"))
    else:
        json.dump(itens, open(os.path.join(saida, "indice.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(itens)} recortes em {saida}", flush=True)

    if a.escolher:
        esc = escolher(itens, a.escolher, saida)
        d2 = os.path.join(saida, "ESCOLHIDAS")
        shutil.rmtree(d2, ignore_errors=True)
        os.makedirs(d2, exist_ok=True)
        for k, e in enumerate(esc, 1):
            shutil.copy2(os.path.join(saida, e["arq"]), os.path.join(d2, f"{k:02d}_{e['arq']}"))
        folha([os.path.join(saida, e["arq"]) for e in esc], os.path.join(saida, "folha_escolhidas.jpg"))
        print(json.dumps([{k: e[k] for k in ("arq", "giro", "incl", "enquadre", "nitidez")} for e in esc], ensure_ascii=False))


if __name__ == "__main__":
    main()
