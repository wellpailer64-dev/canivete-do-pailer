"""Revisor da peça do Photo Kanivete: confere, sem o Claude olhar, as regras que vieram dos feedbacks do usuário e
devolve UMA linha JSON. Regras (cada feedback novo vira uma regra aqui ou em KNV.revisarPeca, imagem-api.js):
  corte     foto/recorte com borda reta e dura aparecendo (caixa cortando a lateral, base da pessoa sem degradê)
  contraste texto ilegível sobre o que está atrás das letras (WCAG, pior 10%)
  sombra    sombra projetada dura (pouco desfoque para a força)
  avatar    rosto no círculo: queixo/cabeça cortados ou rosto grande demais (OpenCV, aqui)
  direção   (KNV.revisarDirecao, por slide) hierarquia, gancho, texto, respiro, vetor, asset, ponte, roteiro
  gabarito  (KNV.revisarGabarito) números das peças do usuário (D:/kanivete_biblioteca/gabarito_pailer.json): margem
            ≥ 12%, título ≥ 1,5× o 2º texto, sem brilho/chanfro/degradê em texto, ≤ 3 fontes, ≤ 35 palavras, bordas ≤ 13%

uso: py -3.13 tools/revisor.py [peca.iknv] [--porta 9333] [--sem-corte] [--roteiro roteiro.json]
     roteiro.json = [["frases do slide 1"...], ...] ou {"slides": [{"gancho": "...", "sub": "...", "corpo": "..."}, ...]}
     (sem documento: revisa o que está aberto no app de teste)
→ {"problemas": 2, "itens": ["contraste · s1-legal: contraste 2.1 (mín. 4.5) em 11px → mancha escura ...", ...]}"""
import argparse, base64, json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
import cv2, numpy as np

_FACE = None


def rostos(png_b64):
    global _FACE
    if _FACE is None: _FACE = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    img = cv2.imdecode(np.frombuffer(base64.b64decode(png_b64), np.uint8), cv2.IMREAD_GRAYSCALE)
    esc = 1.0
    if img.shape[1] < 400: esc = 400 / img.shape[1]; img = cv2.resize(img, None, fx=esc, fy=esc, interpolation=cv2.INTER_CUBIC)
    fs = _FACE.detectMultiScale(img, 1.08, 5, minSize=(24, 24))
    return [tuple(v / esc for v in f) for f in fs]


def avatar(a):
    """rosto inteiro dentro do círculo (cabeça ~ +30% acima da caixa do rosto, queixo ~ +12% abaixo) e não gigante"""
    fs = rostos(a["png"])
    c = a["circulo"]; cx, cy, r = c["x"] + c["d"] / 2, c["y"] + c["d"] / 2, c["d"] / 2
    if not len(fs): return f'nenhum rosto achado no círculo de {a["camada"]} (foto fora do círculo?)'
    x, y, w, h = max(fs, key=lambda f: f[2] * f[3] - ((f[0] + f[2] / 2 - cx) ** 2 + (f[1] + f[3] / 2 - cy) ** 2))
    topo, queixo, alt = y - 0.3 * h, y + 1.12 * h, 1.42 * h
    dentro = lambda px, py: (px - cx) ** 2 + (py - cy) ** 2 <= (r * 0.97) ** 2
    pr = []
    if not dentro(x + w / 2, queixo): pr.append("queixo cortado")
    if not dentro(x + w / 2, topo): pr.append("cabeça cortada")
    if alt > 0.9 * c["d"]: pr.append(f"rosto grande ({round(alt / c['d'] * 100)}% do círculo; bom: 60–80%)")
    return ", ".join(pr) or None


def ler_roteiro(caminho):
    """lista de frases por slide (aceita a lista pronta ou {"slides": [{campo: texto}]})"""
    if not caminho: return None
    with open(caminho, encoding="utf-8") as f: r = json.load(f)
    if isinstance(r, dict):   # roteiro do tools/esqueleto.py: só os textos, sem a marcação (*x*, **x**, [x](marca))
        limpa = lambda t: re.sub(r"\*+([^*]+)\*+", r"\1", re.sub(r"\[([^\]]+)\]\([a-z]+\)", r"\1", t))
        r = [[limpa(t) for k in ("pre", "gancho", "titulo", "sub", "corpo", "cta") for t in ([s[k]] if isinstance(s.get(k), str) else s.get(k) or [])]
             for s in r.get("slides", [])]
    return r


def revisar(pg, corte=True, roteiro=None):
    r = pg.evaluate("o => window.KNV.revisarPeca(o)", {"corte": corte, "roteiro": roteiro})
    itens = [f'{a["regra"]} · {a["camada"]}: {a["problema"]} → {a["dica"]}' for a in r["achados"]]
    for a in r["avatares"]:
        p = avatar(a)
        if p: itens.append(f'avatar · {a["camada"]}: {p} → foto menor/mais baixa dentro do círculo (cabeça e ombros)')
    itens.sort(key=lambda t: t.startswith("corte"))   # o resto primeiro; corte costuma repetir por camada
    return {"problemas": len(itens), "itens": itens[:15]}


if __name__ == "__main__":
    from playwright.sync_api import sync_playwright
    ap = argparse.ArgumentParser(); ap.add_argument("doc", nargs="?"); ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--sem-corte", action="store_true"); ap.add_argument("--roteiro")
    a = ap.parse_args()
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
        pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
        if a.doc:
            pg.evaluate("""async d => { KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo(); await KNV.abrir(d); KNV.automacao(false);
                if (!document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem'); }""", os.path.abspath(a.doc).replace("\\", "/"))
        print(json.dumps(revisar(pg, not a.sem_corte, ler_roteiro(a.roteiro)), ensure_ascii=False))
