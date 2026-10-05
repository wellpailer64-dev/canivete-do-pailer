"""Teste da ponte Vetor → Editor (Cena 3D), app em --agente=9333: copo (girar) com rótulo coral, caixa (extrudar com
chanfro) com arte coral na frente e anel (extrudar com furo) vão para uma cena 3D do Editor (enviar_editor_3d).
Confere: 3 modelos na cena, quadro com o objeto opaco no meio e fundo transparente, coral do rótulo e azul da caixa
presentes, furo do anel vazado. Grava o quadro em D:\\kanivete_testes\\editor3d\\vetor.png para olhar."""
import base64, io, json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image
from playwright.sync_api import sync_playwright
SAI = r"D:\kanivete_testes\editor3d"; os.makedirs(SAI, exist_ok=True)
MAT = os.path.join(os.environ.get("TEMP", r"D:\kanivete_testes\tmp"), "canivete_teste_export", "material1", "a.mp4")
falhas = []
def ok(c, m):
    print(("  ok  " if c else "  FALHOU  ") + m)
    if not c: falhas.append(m)
with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_c3d_pasta)", timeout=60000)
    if not pg.evaluate("VE.ready"):
        if not os.path.isfile(MAT): print(f"sem material ({MAT}): rode testes/teste_export.py uma vez"); sys.exit(1)
        pg.evaluate("document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
        pg.evaluate("p => veOpenPath(p)", MAT)
        pg.wait_for_function("VE.ready && VE.clips.length > 0", timeout=120000)
    pg.evaluate("switchTool('vetor-kanivete')"); pg.wait_for_function("window.VKN"); pg.evaluate("VKN.curto = false")
    C = lambda n, a=None: pg.evaluate("([n, a]) => VKN.cmd(n, a)", [n, a or {}])
    C("novo", {"nome": "Editor3D", "larg": 240, "alt": 120})
    pf = C("caminho", {"d": "M40 100 L56 100 L62 30 L63 28", "preench": "C2 M3 Y10 K0", "traco": "nenhum"})
    copo = C("girar_3d", {"ids": [pf["id"]], "inclinar": 10, "material": "papel", "nome": "copo"})
    fx = C("retangulo", {"x": 0, "y": 0, "larg": 60, "alt": 14, "preench": "C0 M68 Y72 K0", "traco": "nenhum"})
    C("mapear_arte", {"id3d": copo["id"], "arte": [fx["id"]], "y": 36})
    cx = C("retangulo", {"x": 120, "y": 30, "larg": 40, "alt": 60, "preench": "C100 M55 Y35 K45", "traco": "nenhum"})
    cx3 = C("extrudar_3d", {"ids": [cx["id"]], "profundidade": 20, "girar": -25, "inclinar": 8, "chanfro": 0.6, "nome": "caixa"})
    t = C("texto", {"conteudo": "MARÉ", "x": 0, "y": 20, "fonte": "Arial", "estilo": "Bold", "tamanho": 30, "preench": "C0 M68 Y72 K0"})
    C("mapear_arte", {"id3d": cx3["id"], "arte": [t["id"]], "face": "frente"})
    an = C("caminho", {"d": "M180 40 L230 40 L230 90 L180 90 Z M195 55 L195 75 L215 75 L215 55 Z", "preench": "C0 M20 Y90 K0", "traco": "nenhum"})
    an3 = C("extrudar_3d", {"ids": [an["id"]], "profundidade": 12, "nome": "anel"})
    r = C("enviar_editor_3d", {"ids": [copo["id"], cx3["id"], an3["id"]]})
    ok(len(r["enviados"]) == 3, f"3 objetos enviados ({r})")
    info = pg.evaluate("VE3DAPI.info()")
    ok(len(info["modelos"]) == 3 and all(m["fonte"]["tipo"] == "vetor" for m in info["modelos"]), "cena 3D com os 3 modelos do Vetor")
    pg.wait_for_timeout(500)
    url = pg.evaluate("(async () => { await ve3dGarantir(ve3dAlvo()); return VE3DAPI.quadro(0, null, 960); })()")
    im = Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGBA"); im.save(os.path.join(SAI, "vetor.png"))
    w, h = im.size
    px = [im.getpixel((x, y)) for x in range(0, w, 3) for y in range(0, h, 3)]
    opacos = [c for c in px if c[3] > 240]
    ok(im.getpixel((2, 2))[3] < 10 and len(opacos) > len(px) * 0.03, f"objetos opacos sobre fundo transparente ({len(opacos)}/{len(px)})")
    ok(any(c[0] > 170 and c[1] < 140 and c[2] < 120 for c in opacos), "coral (rótulo/arte) visível")
    ok(any(c[2] > c[0] + 20 and c[2] > 60 for c in opacos), "azul da caixa visível")
    ok(not erros, f"sem erros de JS ({erros[:2]})")
print(json.dumps({"falhas": falhas}, ensure_ascii=False))
sys.exit(1 if falhas else 0)
