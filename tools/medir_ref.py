"""Medidor de referência: lê uma imagem de referência (print de carrossel/flyer) SEM o Claude olhar e devolve as medidas
já convertidas para o documento final, mais um rascunho de HTML para a cena (KNV.cena).
  - textos (OCR local, RapidOCR): linhas agrupadas em blocos, posição/tamanho/cor da letra
  - paleta (k-means) e formas grandes de cor lisa (card, painel, papel), com a caixa
  - escala e slides (ref 738×327 com 3 slides retrato → ×4,39 → 3 × 1080×1440)

uso: py -3.13 tools/medir_ref.py ref.png --slides 3 --formato retrato [--html rascunho.html] [--json medidas.json]
O resumo impresso (um bloco por linha) é o que o Claude lê; o HTML é o ponto de partida (refinar fontes, imagens, ícones)."""
import argparse, json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
import cv2, numpy as np

FORMATOS = {"feed": (1080, 1350), "retrato": (1080, 1440), "story": (1080, 1920), "quadrado": (1080, 1080), "feed4x5": (1080, 1350)}
ap = argparse.ArgumentParser()
ap.add_argument("ref"); ap.add_argument("--slides", type=int, default=1); ap.add_argument("--formato", default="retrato")
ap.add_argument("--html"); ap.add_argument("--json"); ap.add_argument("--textos-ia", action="store_true", help="transcrever os blocos com o olho local (gemma4)"); ap.add_argument("--min-forma", type=float, default=0.03, help="área mínima da forma (fração do slide)")
a = ap.parse_args()

img = cv2.imdecode(np.fromfile(a.ref, np.uint8), cv2.IMREAD_COLOR)
H0, W0 = img.shape[:2]
SW, SH = FORMATOS.get(a.formato, FORMATOS["retrato"])
k = SW * a.slides / W0                     # px da referência → px do documento
ky = SH / H0
hexc = lambda bgr: "#%02x%02x%02x" % (int(bgr[2]), int(bgr[1]), int(bgr[0]))

# ── paleta (k-means em Lab, 7 cores) ──
peq = cv2.resize(img, (min(300, W0), int(H0 * min(300, W0) / W0)), interpolation=cv2.INTER_AREA)
lab = cv2.cvtColor(peq, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
_, rot, cen = cv2.kmeans(lab, 7, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
conta = np.bincount(rot.ravel(), minlength=7) / len(rot)
cen_bgr = cv2.cvtColor(cen.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2BGR).reshape(-1, 3)
paleta = sorted(({"cor": hexc(c), "pct": round(float(p) * 100, 1)} for c, p in zip(cen_bgr, conta)), key=lambda x: -x["pct"])

# ── OCR (ampliado: referência pequena) ──
from rapidocr_onnxruntime import RapidOCR
amp = max(1.0, 1800 / W0)
big = cv2.resize(img, None, fx=amp, fy=amp, interpolation=cv2.INTER_CUBIC)
res, _ = RapidOCR()(big)
linhas = []
for caixa, txt, conf in res or []:
    if float(conf) < 0.5 or not txt.strip(): continue
    xs = [p[0] / amp for p in caixa]; ys = [p[1] / amp for p in caixa]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    # cor da letra: dos 3 grupos de cor da caixa, o mais longe do maior (o fundo); a borda suavizada fica no do meio
    reg = big[int(y0 * amp):int(np.ceil(y1 * amp)), int(x0 * amp):int(np.ceil(x1 * amp))]
    px = reg.reshape(-1, 3).astype(np.float32)
    if len(px) < 30: continue
    _, r3, c3 = cv2.kmeans(px, 3, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1), 2, cv2.KMEANS_PP_CENTERS)
    n3 = np.bincount(r3.ravel(), minlength=3); fundo = c3[n3.argmax()]
    li = int(np.argmax([np.linalg.norm(c - fundo) for c in c3])); letra = c3[li]
    if H0 < 700: letra = np.clip(fundo + (letra - fundo) * 1.5, 0, 255)   # referência pequena: a letra vem misturada com o fundo
    # tamanho da fonte pela faixa densa das linhas de pixel (altura-x; só maiúsculas/números = altura das versais)
    m = (r3.reshape(reg.shape[:2]) == li).astype(np.float32).mean(axis=1)
    banda = (m > 0.45 * m.max()).sum() / amp * ky if m.max() > 0 else (y1 - y0) * ky * 0.5
    caixa_alta = not any(ch.islower() for ch in txt)
    fonte = banda / (0.7 if caixa_alta else 0.52)
    linhas.append({"t": txt.strip(), "x": x0 * k, "y": y0 * ky, "w": (x1 - x0) * k, "h": (y1 - y0) * ky, "fonte": fonte, "cor": hexc(letra), "fundo": hexc(fundo),
                   "ref": [x0, y0, x1, y1]})

# ── blocos: linhas do mesmo slide, alinhadas à esquerda (ou ao centro) e coladas em altura ──
linhas.sort(key=lambda l: (int(l["x"] // SW), l["y"]))
blocos = []
for l in linhas:
    s = int((l["x"] + l["w"] / 2) // SW)
    for b in blocos:
        u = b["linhas"][-1]
        mesmo_alin = abs(u["x"] - l["x"]) < 0.4 * l["h"] or abs((u["x"] + u["w"] / 2) - (l["x"] + l["w"] / 2)) < 0.4 * l["h"]
        if b["slide"] == s and mesmo_alin and -0.4 * l["h"] <= l["y"] - (u["y"] + u["h"]) < 0.9 * l["h"] and 0.7 < l["h"] / u["h"] < 1.4:
            b["linhas"].append(l); break
    else:
        blocos.append({"slide": s, "linhas": [l]})
for i, b in enumerate(blocos, 1):
    ls = b["linhas"]; x0 = min(l["x"] for l in ls); y0 = min(l["y"] for l in ls)
    x1 = max(l["x"] + l["w"] for l in ls); y1 = max(l["y"] + l["h"] for l in ls)
    fonte = float(np.median([l["fonte"] for l in ls]))
    passo = (ls[-1]["y"] - ls[0]["y"]) / (len(ls) - 1) if len(ls) > 1 else fonte * 1.25
    alt = float(np.median([l["h"] for l in ls]))
    centro = len(ls) > 1 and np.std([l["x"] for l in ls]) > 0.25 * alt and np.std([l["x"] + l["w"] / 2 for l in ls]) < 0.25 * alt
    b.update({"id": f"b{i}", "x": round(x0 - b["slide"] * SW), "y": round(y0), "w": round(x1 - x0), "h": round(y1 - y0),
              "fonte": round(fonte), "entrelinha": round(passo / fonte, 2),
              "ref": [min(l["ref"][0] for l in ls), min(l["ref"][1] for l in ls), max(l["ref"][2] for l in ls), max(l["ref"][3] for l in ls)], "cor": ls[0]["cor"], "fundo": ls[0]["fundo"],
              "alin": "center" if centro else "left", "texto": "\n".join(l["t"] for l in ls)})

# ── formas grandes de cor lisa (card, painel, papel): por cor da paleta, componentes conexos ──
formas = []
lab_full = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.int16)
for c in cen:
    m = (np.linalg.norm(lab_full - c.astype(np.int16), axis=2) < 14).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, rot2, st, _ = cv2.connectedComponentsWithStats(m)
    for j in range(1, n):
        x, y, w, h, area = st[j]
        if w >= W0 * 0.95 and h >= H0 * 0.95: continue                     # o fundo
        if area * k * ky < a.min_forma * SW * SH or area < 0.55 * w * h: continue   # pequena ou não é um bloco cheio
        X, Y = x * k, y * ky
        s = int((X + w * k / 2) // SW)
        formas.append({"slide": s, "cor": hexc(cv2.cvtColor(c.reshape(1, 1, 3).astype(np.uint8), cv2.COLOR_LAB2BGR)[0, 0]),
                       "x": round(X - s * SW), "y": round(Y), "w": round(w * k), "h": round(h * ky), "cheio": round(area / (w * h), 2)})
formas.sort(key=lambda f: (f["slide"], f["y"]))

if a.textos_ia:   # o OCR come espaço e acento em referência pequena: o olho local (gemma4) transcreve cada bloco
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import olho
    from PIL import Image
    olho.liberar_placa(); R = Image.open(a.ref).convert("RGB")
    for b in blocos:
        x0, y0, x1, y1 = b["ref"]; pad = 0.25 * (y1 - y0) / max(1, len(b["linhas"]))
        cr = R.crop((max(0, x0 - pad), max(0, y0 - pad), min(W0, x1 + pad), min(H0, y1 + pad)))
        cr = cr.resize((max(1, round(cr.width * 600 / max(cr.width, 1))), max(1, round(cr.height * 600 / max(cr.width, 1)))))
        t = olho.ler(cr).strip()
        if t and len(t) < len(b["texto"]) * 2.5 + 10: b["texto"] = chr(10).join(x.strip() for x in t.splitlines() if x.strip())
out = {"ref": [W0, H0], "doc": [SW * a.slides, SH], "escala": [round(k, 3), round(ky, 3)], "slides": a.slides, "paleta": paleta, "blocos": [
    {kk: v for kk, v in b.items() if kk not in ("linhas", "ref")} for b in blocos], "formas": formas}
print(f"ref {W0}×{H0} → {a.slides} × {SW}×{SH} (×{k:.2f})")
print("paleta:", ", ".join(f'{p["cor"]} {p["pct"]}%' for p in paleta))
for f in formas: print(f'forma s{f["slide"] + 1} {f["cor"]} {f["x"]},{f["y"]} {f["w"]}×{f["h"]}')
for b in out["blocos"]:
    print(f'{b["id"]} s{b["slide"] + 1} {b["x"]},{b["y"]} {b["w"]}×{b["h"]} {b["fonte"]}px/{b["entrelinha"]} {b["cor"]} {b["alin"]}: ' + b["texto"].replace("\n", " / "))
if a.json: json.dump(out, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
if a.html:
    sec = []
    for s in range(a.slides):
        el = [f'  <div id="forma-s{s + 1}-{i}" data-livre style="position:absolute;left:{f["x"]}px;top:{f["y"]}px;width:{f["w"]}px;height:{f["h"]}px;background:{f["cor"]}"></div>'
              for i, f in enumerate([f for f in formas if f["slide"] == s], 1)]
        el += [f'  <p id="{b["id"]}" style="position:absolute;left:{b["x"]}px;top:{b["y"]}px;margin:0;font:400 {b["fonte"]}px/{b["entrelinha"]} var(--fonte);color:{b["cor"]};text-align:{b["alin"]}">'
               + b["texto"].replace("\n", "<br>") + "</p>" for b in out["blocos"] if b["slide"] == s]
        sec.append(f'<section class="slide" id="s{s + 1}">\n' + "\n".join(el) + "\n</section>")
    html = (f'<!doctype html><html><head><style>\n:root {{ --fonte: Poppins; }}\nbody {{ margin: 0; background: {paleta[0]["cor"]}; font-family: var(--fonte); }}\n'
            f'.slide {{ position: relative; }}\n</style></head><body>\n<!-- rascunho do medidor ({os.path.basename(a.ref)}): paleta {", ".join(p["cor"] for p in paleta)} -->\n'
            + "\n\n".join(sec) + "\n</body></html>\n")
    open(a.html, "w", encoding="utf-8").write(html)
    print("rascunho:", a.html)
