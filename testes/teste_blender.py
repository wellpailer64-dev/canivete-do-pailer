"""Teste do render fotorrealista (Vetor 3D → Blender), app em --agente=9333. Rápido (400 px, 24 amostras): copo (girar) com
rótulo mapeado e caixa (extrudar com chanfro) com arte na frente. Confere: PNG gerado, transparente fora do objeto, cor do
rótulo presente (não desbotada), imagem colocada no lugar do 3D vetorial (oculto). Sem Blender instalado: pula (saída 0)."""
import json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image
from playwright.sync_api import sync_playwright
SAI = r"D:\kanivete_testes\blender\teste"; os.makedirs(SAI, exist_ok=True)
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  FALHOU  ") + m)
    if not c: falhas.append(m)
with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.evaluate("switchTool('vetor-kanivete')"); pg.wait_for_function("window.VKN"); pg.evaluate("VKN.curto = false")
    if not pg.evaluate("vkApi().vk_blender_estado()")["instalado"]:
        print("Blender não instalado: teste pulado"); sys.exit(0)
    C = lambda n, a=None: pg.evaluate("([n, a]) => VKN.cmd(n, a)", [n, a or {}])
    C("novo", {"nome": "Blender", "larg": 200, "alt": 120})
    pf = C("caminho", {"d": "M40 100 L56 100 L62 30 L63 28", "preench": "C2 M3 Y10 K0", "traco": "nenhum"})
    copo = C("girar_3d", {"ids": [pf["id"]], "inclinar": 10, "material": "papel", "nome": "copo"})
    fx = C("retangulo", {"x": 0, "y": 0, "larg": 60, "alt": 14, "preench": "C0 M68 Y72 K0", "traco": "nenhum"})
    C("mapear_arte", {"id3d": copo["id"], "arte": [fx["id"]], "y": 36})
    r = C("render_blender", {"ids": [copo["id"]], "largura": 400, "amostras": 24, "pasta": SAI})["renders"][0]
    im = Image.open(r["caminho"]).convert("RGBA"); w, h = im.size
    ok(os.path.isfile(r["caminho"]) and im.getpixel((2, 2))[3] == 0, f"copo renderizado, fundo transparente ({w}×{h}, {r['segundos']} s)")
    cores = [im.getpixel((x, y)) for x in range(w // 3, 2 * w // 3, 4) for y in range(h // 4, 3 * h // 4, 4)]
    ok(any(c[3] > 200 and c[0] > 170 and c[1] < 140 and c[2] < 120 for c in cores), "rótulo coral visível e saturado no copo")
    ok(pg.evaluate("id => vkObj(id).visivel === false", copo["id"]) and pg.evaluate("id => !!vkObj(id)", r["id"]), "render no lugar do 3D vetorial (vetorial oculto como reserva)")
    cx = C("retangulo", {"x": 120, "y": 30, "larg": 40, "alt": 60, "preench": "C100 M55 Y35 K45", "traco": "nenhum"})
    cx3 = C("extrudar_3d", {"ids": [cx["id"]], "profundidade": 20, "girar": -25, "inclinar": 8, "chanfro": 0.6, "nome": "caixa"})
    t = C("texto", {"conteudo": "MARÉ", "x": 0, "y": 20, "fonte": "Arial", "estilo": "Bold", "tamanho": 30, "preench": "C0 M68 Y72 K0"})
    C("mapear_arte", {"id3d": cx3["id"], "arte": [t["id"]], "face": "frente"})
    r2 = C("render_blender", {"ids": [cx3["id"]], "largura": 400, "amostras": 24, "pasta": SAI})["renders"][0]
    im2 = Image.open(r2["caminho"]).convert("RGBA"); w2, h2 = im2.size
    c2 = [im2.getpixel((x, y)) for x in range(w2 // 4, 3 * w2 // 4, 3) for y in range(h2 // 4, 3 * h2 // 4, 3)]
    ok(any(c[3] > 200 and c[0] > 170 and c[2] < 120 for c in c2) and any(c[3] > 200 and c[2] > c[0] + 20 for c in c2), "caixa azul com a arte coral na frente")
    ok(not erros, f"sem erros de JS ({erros[:2]})")
print(json.dumps({"falhas": falhas}, ensure_ascii=False))
sys.exit(1 if falhas else 0)
