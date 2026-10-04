"""Olho local: um modelo de visão no Ollama (gemma4:e4b) olha as imagens no lugar do Claude e devolve TEXTO curto.
  comparar  referência × peça: diferenças de layout, elementos, cores e tamanhos (até 8 itens)
  revisar   uma peça: problemas de design (corte seco, leitura, sombra, hierarquia, margens)
  ler       transcreve o texto de uma imagem (português, com acentos e quebras)

uso: py -3.13 tools/olho.py comparar --ref ref.png --peca tira.png [--foco "slide 1"]
     py -3.13 tools/olho.py revisar --peca peca.png
     py -3.13 tools/olho.py ler recorte.png
Tira o Qwen3 do Worker e o FLUX da placa antes (não cabem juntos nos 8 GB)."""
import argparse, base64, io, json, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")

MODELO = "gemma4:e4b"
OLLAMA = "http://127.0.0.1:11434"


def _post(rota, corpo, timeout=600):
    req = urllib.request.Request(OLLAMA + rota, data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r: return json.load(r)


def liberar_placa(porta=9333):
    try:
        for m in json.load(urllib.request.urlopen(OLLAMA + "/api/ps", timeout=10)).get("models", []):
            if m["name"] != MODELO: _post("/api/generate", {"model": m["name"], "keep_alive": 0}, 60)
    except Exception: pass
    try:   # FLUX do app (servidor do gerador)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}", timeout=3000)
            pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
            pg.evaluate("async () => { try { await window.pywebview.api.ie_gerador_parar(); } catch (e) {} }")
    except Exception: pass


def _b64(img, lado=1024):
    """caminho, bytes ou PIL → JPEG base64 com o lado maior ≤ lado (o modelo vê melhor sem imagem gigante)"""
    from PIL import Image
    im = img if hasattr(img, "size") else Image.open(io.BytesIO(img) if isinstance(img, (bytes, bytearray)) else img)
    im = im.convert("RGB"); im.thumbnail((lado, lado))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def perguntar(imagens, prompt, lado=1024, max_tokens=500):
    r = _post("/api/chat", {"model": MODELO, "stream": False, "think": False, "keep_alive": "5m",
                            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": max_tokens},
                            "messages": [{"role": "user", "content": prompt, "images": [_b64(i, lado) for i in imagens]}]})
    return (r.get("message") or {}).get("content", "").strip()


def ler(img):
    return perguntar([img], "Transcreva EXATAMENTE o texto desta imagem, em português, com acentos, maiúsculas e as quebras de "
                            "linha como aparecem. Responda só o texto, sem comentários.", lado=768, max_tokens=300)


def lado_a_lado(ref, peca, slides=1, i=0, alt=900):
    """slide i da referência (esquerda) e da cópia (direita) na mesma imagem, mesma altura"""
    from PIL import Image, ImageDraw
    abre = lambda x: (x if hasattr(x, "size") else Image.open(x)).convert("RGB")
    R, P = abre(ref), abre(peca)
    cr = lambda im: im.crop((im.width * i // slides, 0, im.width * (i + 1) // slides, im.height))
    r, p = cr(R), cr(P)
    r = r.resize((round(r.width * alt / r.height), alt)); p = p.resize((round(p.width * alt / p.height), alt))
    out = Image.new("RGB", (r.width + p.width + 30, alt + 50), "white"); out.paste(r, (0, 50)); out.paste(p, (r.width + 30, 50))
    d = ImageDraw.Draw(out); d.text((10, 15), "REFERENCIA", fill="black"); d.text((r.width + 40, 15), "COPIA", fill="black")
    return out


def comparar_slides(ref, peca, slides=1, foco=""):
    linhas = []
    for i in range(slides):
        txt = perguntar([lado_a_lado(ref, peca, slides, i)], "Esta imagem tem a REFERÊNCIA (esquerda) e a CÓPIA (direita) do mesmo slide. "
                        + (f"Olhe só: {foco}. " if foco else "")
                        + "Liste até 5 diferenças visuais REAIS e importantes (posição, tamanho, cor, elemento faltando ou sobrando, "
                          "enquadramento da pessoa, peso da fonte, sombras). Uma por linha começando com '- '. Não repita itens, ignore "
                          "o rosto/pessoa ser diferente e pequenas diferenças de texto. Se forem praticamente iguais, responda 'IGUAL'.", lado=1400, max_tokens=300)
        vistos = []
        for l in txt.splitlines():
            l = l.strip()
            if l.startswith("-") and l not in vistos: vistos.append(l)
        linhas.append(f"slide {i + 1}: " + ("IGUAL" if not vistos else " ".join(vistos)))
    return "\n".join(linhas)


def comparar(ref, peca, foco=""):
    return perguntar([ref, peca], "A primeira imagem é a REFERÊNCIA de design; a segunda é a CÓPIA feita a partir dela. "
                     + (f"Olhe só: {foco}. " if foco else "")
                     + "Liste até 8 diferenças visuais que importam para a cópia ficar igual (posição, tamanho, cor, elementos que "
                       "faltam ou sobram, enquadramento de pessoas, fontes, efeitos). Uma por linha, começando com '- ', curtas e "
                       "concretas (ex.: '- slide 1: título menor que na referência'). Ignore o conteúdo do texto e diferenças de "
                       "pessoa/rosto gerado. Se estiverem praticamente iguais, responda só 'IGUAL'.", lado=1280)


def revisar(peca):
    return perguntar([peca], "Você é diretor de arte revisando esta peça de redes sociais antes da entrega. Liste até 6 problemas "
                     "reais, um por linha começando com '- ': pessoa ou objeto com corte seco (borda reta de foto aparecendo), texto "
                     "difícil de ler sobre a imagem, sombra dura ou suja, elementos atropelados, margens, rosto cortado em avatar. "
                     "Diga ONDE está. Se não houver problema, responda só 'OK'.", lado=1280)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("modo", choices=["comparar", "revisar", "ler"]); ap.add_argument("img", nargs="?")
    ap.add_argument("--ref"); ap.add_argument("--peca"); ap.add_argument("--foco", default=""); ap.add_argument("--slides", type=int, default=0); ap.add_argument("--porta", type=int, default=9333)
    a = ap.parse_args()
    t = time.time(); liberar_placa(a.porta)
    out = (comparar_slides(a.ref, a.peca, a.slides, a.foco) if a.slides else comparar(a.ref, a.peca, a.foco)) if a.modo == "comparar" else revisar(a.peca or a.img) if a.modo == "revisar" else ler(a.img)
    print(out); print(f"({time.time() - t:.0f}s, {MODELO})", file=sys.stderr)
