"""Diagramar uma prancheta do Vetor Kanivete com HTML/CSS (VKN.cena) usando o sistema da marca.
  py -3.13 tools/vk_cena.py pagina.html --marca marca.json [--prancheta "08 Tipografia"] [--nova 320x180] [--porta 9333]
         [--png saida.png] [--revisar]
marca.json = {"nome": "...", "cores": {"azul": {"hex": "#0e3b4a", "cmyk": "C100 M55 Y35 K45"}, ...},
              "fontes": {"titulo": "Playfair Display", "texto": "Inter"}, "css": "regras extras opcionais"}
Vira :root{--azul:#0e3b4a; --titulo:'Playfair Display'; ...} + a paleta hex→CMYK (a cor sai exata no PDF).
No HTML use var(--azul), var(--titulo) e data-simbolo="Nome do símbolo" (símbolos do documento). Saída: uma linha JSON."""
import argparse, json, sys
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
ap = argparse.ArgumentParser(); ap.add_argument("html"); ap.add_argument("--marca"); ap.add_argument("--prancheta"); ap.add_argument("--nova")
ap.add_argument("--porta", type=int, default=9333); ap.add_argument("--png"); ap.add_argument("--revisar", action="store_true"); a = ap.parse_args()
marca = json.load(open(a.marca, encoding="utf-8")) if a.marca else {}
cores = marca.get("cores", {})
css = ":root{" + "".join(f"--{k}:{v['hex']};" for k, v in cores.items()) + "".join(f"--{k}:'{v}';" for k, v in marca.get("fontes", {}).items()) + "}" + marca.get("css", "")
pal = {v["hex"].lower(): v["cmyk"] for v in cores.values() if v.get("cmyk")}
op = {"paleta": pal, "css": css}
if a.prancheta: op["prancheta"] = a.prancheta
if a.nova:
    l, h = a.nova.lower().split("x"); op["nova"] = {"nome": a.prancheta or "Cena", "larg": float(l), "alt": float(h)}; op.pop("prancheta", None)
with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}").contexts for x in c.pages if "index.html" in x.url)
    r = pg.evaluate("([h, op]) => VKN.cena(h, op)", [open(a.html, encoding="utf-8").read(), op])
    if a.png: pg.evaluate("([c, pr]) => VKN.cmd('exportar_imagem', {caminho: c, ppi: 90, pranchetas: [pr]})", [a.png, r["prancheta"]])
    if a.revisar:
        rv = pg.evaluate("VKN.revisar()"); r["revisor"] = {"erros": rv["erros"], "avisos": rv["avisos"], "itens": [f"{i['nivel']} {i['regra']} {i.get('vezes', 1)}x {i['quem']}: {i['msg']}" for i in rv["itens"] if i["prancheta"] == r["prancheta"] or r["prancheta"] in (i.get("onde") or [])][:8]}
    print(json.dumps(r, ensure_ascii=False))
