"""Referências do Pinterest numa chamada: busca (navegador headless, sem login), baixa, monta folhas de contato,
mede a paleta e a Kani (visão local gemma4:e4b) dá nota a CADA referência para o tema, em JSON. O Claude só olha `top.jpg`.

uso: py -3.13 tools/refs.py "flyer festa black dourado" "flyer virada de lote" --tema "festa black nostalgia, marrom,
         âmbar, dourado; destacar virada de lote" --pasta D:/kanivete_biblioteca/refs/festa_amizade [--n 30] [--top 6]
         [--sem-kani] [--porta 9222]
saída: pasta/NN.jpg, folha_N.jpg (16 por folha, numeradas), refs.json (url, busca, paleta, nota, técnicas), top.jpg
       e uma linha por referência do top no terminal. Técnica aproveitada numa peça → ficha em
       D:/kanivete_biblioteca/tecnicas (ver Instructions/agente/design-photo-kanivete.md, "Técnicas do Pinterest")."""
import argparse, base64, hashlib, io, json, os, sys, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PROMPT = ("Você é diretor de arte. Esta é UMA referência (flyer/peça). A peça que vamos fazer: {tema}. "
          "Responda só JSON: {{\"nota\": 0-10 (o quanto serve de referência para ESSA peça: tema, cores, clima), "
          "\"estilo\": \"3-6 palavras\", \"tecnicas\": [até 3 técnicas CONCRETAS e reproduzíveis vistas nela, cada uma "
          "\"nome: como fazer\" (ex.: 'faixa inclinada: retângulo vermelho -3° atrás da data')], "
          "\"destaque\": \"como ela destaca a informação principal (preço, data, lote), ou ''\"}}")


def buscar(consultas, n):
    from playwright.sync_api import sync_playwright
    urls = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page(user_agent=UA, locale="pt-BR")
        for q in consultas:
            pg.goto("https://br.pinterest.com/search/pins/?q=" + urllib.parse.quote(q), wait_until="domcontentloaded")
            pg.wait_for_timeout(4500)
            achou = []
            for _ in range(6):
                achou += pg.evaluate("""[...document.querySelectorAll('img[src*="pinimg.com"]')].map(i => i.src)
                    .filter(s => !/\\/(60x60|75x75|30x30)/.test(s))""")
                if len(set(achou)) >= n // len(consultas) + 4: break
                pg.mouse.wheel(0, 2500); pg.wait_for_timeout(1500)
            for s in dict.fromkeys(achou):
                u = s.replace("/236x/", "/736x/").replace("/474x/", "/736x/")
                if u not in (x for x, _ in urls): urls.append((u, q))
        b.close()
    return urls


def baixar(urls, pasta, n):
    ims, vistos = [], set()
    for u, q in urls:
        if len(ims) >= n: break
        try:
            dados = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=20).read()
            h = hashlib.md5(dados).hexdigest()
            if h in vistos: continue
            im = Image.open(io.BytesIO(dados)).convert("RGB")
            if min(im.size) < 200: continue
            vistos.add(h); k = len(ims) + 1
            im.save(f"{pasta}/{k:02d}.jpg", quality=90); ims.append({"n": k, "url": u, "busca": q, "im": im})
        except Exception as e:
            print("  falhou", u[-40:], e)
    return ims


def paleta(im, k=5):
    q = im.resize((120, int(120 * im.height / im.width))).quantize(k, method=Image.Quantize.MEDIANCUT)
    pal, cont = q.getpalette(), sorted(q.getcolors(), reverse=True)
    return ["#%02x%02x%02x" % tuple(pal[i * 3:i * 3 + 3]) for _, i in cont]


def folha(itens, destino, rotulo=lambda r: str(r["n"]), W=240, H=340, cols=8):
    rows = (len(itens) + cols - 1) // cols
    s = Image.new("RGB", (cols * W, rows * H), "white"); d = ImageDraw.Draw(s)
    try: f = ImageFont.truetype("arialbd.ttf", 24)
    except Exception: f = ImageFont.load_default()
    for j, r in enumerate(itens):
        im = r["im"].copy(); im.thumbnail((W - 6, H - 6)); x, y = (j % cols) * W + 3, (j // cols) * H + 3
        s.paste(im, (x, y)); t = rotulo(r); d.rectangle((x, y, x + 14 * len(t) + 10, y + 30), fill="black")
        d.text((x + 5, y + 2), t, fill="yellow", font=f)
    s.save(destino, quality=85)


def kani_nota(itens, tema, porta):
    import olho
    olho.liberar_placa(porta)
    for r in itens:
        im = r["im"].copy(); im.thumbnail((768, 768)); b = io.BytesIO(); im.save(b, "JPEG", quality=85)
        try:
            resp = olho._post("/api/generate", {"model": olho.MODELO, "prompt": PROMPT.format(tema=tema), "format": "json",
                                                "images": [base64.b64encode(b.getvalue()).decode()], "stream": False,
                                                "options": {"temperature": 0.2}}, 300)
            r.update(json.loads(resp["response"]))
        except Exception as e:
            r["erro"] = str(e)[:80]
        print(f"  {r['n']:02d} nota {r.get('nota', '?')} · {r.get('estilo', '')}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("consultas", nargs="+"); ap.add_argument("--pasta", required=True); ap.add_argument("--tema", default="")
    ap.add_argument("--n", type=int, default=30); ap.add_argument("--top", type=int, default=6)
    ap.add_argument("--sem-kani", action="store_true"); ap.add_argument("--porta", type=int, default=9333)
    a = ap.parse_args()
    os.makedirs(a.pasta, exist_ok=True)
    itens = baixar(buscar(a.consultas, a.n), a.pasta, a.n)
    print(f"{len(itens)} referências em {a.pasta}")
    for i in range(0, len(itens), 16): folha(itens[i:i + 16], f"{a.pasta}/folha_{i // 16 + 1}.jpg")
    for r in itens: r["paleta"] = paleta(r["im"])
    if not a.sem_kani: kani_nota(itens, a.tema or " ".join(a.consultas), a.porta)
    top = sorted(itens, key=lambda r: -float(r.get("nota") or 0))[:a.top]
    folha(top, f"{a.pasta}/top.jpg", lambda r: f"{r['n']} · {r.get('nota', '')}", W=300, H=430, cols=min(6, len(top)))
    json.dump([{k: v for k, v in r.items() if k != "im"} for r in itens], open(f"{a.pasta}/refs.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("top:")
    for r in top:
        print(f"  {r['n']:02d} [{r.get('nota', '?')}] {r.get('estilo', '')} | {' / '.join(r.get('tecnicas', [])[:3])} | "
              f"destaque: {r.get('destaque', '')} | {' '.join(r['paleta'][:4])}")


if __name__ == "__main__":
    main()
