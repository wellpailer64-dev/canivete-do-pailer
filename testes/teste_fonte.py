"""Criar fonte própria no Vetor Kanivete (Texto › Criar fonte) — app em --agente=9333.

    py -3.13 testes/teste_fonte.py

Monta o modelo de glifos (A O L - I), desenha cada letra com os comandos (furo do O em branco, L de dois retângulos
sobrepostos, hífen de traço), exporta o .otf SEM instalar e confere com o fontTools: mapa de caracteres, avanço =
largura da prancheta, caixa do I nas unidades certas, sentido dos contornos do CFF (externo anti-horário, furo
horário), sobreposição unida, traço contornado; depois usa a fonte num texto do Vetor e desenha com o PIL.
Saída em D:/kanivete_testes/fonte. Sai com 1 se reprovar.
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SAI = "D:/kanivete_testes/fonte"
os.makedirs(SAI, exist_ok=True)
OTF = SAI + "/TesteKanivete-Regular.otf"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


with sync_playwright() as p:
    b = None
    for _ in range(120):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    js_erros = []
    pg.on("pageerror", lambda e: js_erros.append(str(e)))
    pg.evaluate("switchTool('vetor-kanivete')")
    pg.wait_for_function("window.VKN && document.getElementById('vk-canvas') && VK_CMDS.exportar_fonte", timeout=30000)
    pg.evaluate("VKN.curto = false")
    C = lambda n, a=None: pg.evaluate("([n, a]) => VKN.cmd(n, a)", [n, a or {}])

    r = C("fonte_modelo", {"caracteres": "AOL-I", "altura": 50, "largura": 30, "familia": "Teste Kanivete"})
    ok(r["pranchetas"] == 5 and pg.evaluate("VK.doc.camadas[0].nome === 'Métricas' && VK.doc.camadas[0].imprimir === false"), "modelo: 5 pranchetas + camada Métricas que não imprime", str(r))
    # base a 40 mm do topo (80% de 50), versal a 5 mm do topo (700/1000)
    C("caminho", {"prancheta": "A", "d": "M2 40 L15 5 L28 40 L22 40 L15 20 L8 40 Z", "preench": "100K", "traco": "nenhum"})
    C("elipse", {"prancheta": "O", "x": 3, "y": 5, "larg": 24, "alt": 35, "preench": "100K", "traco": "nenhum"})
    C("elipse", {"prancheta": "O", "x": 9, "y": 11, "larg": 12, "alt": 23, "preench": "C0 M0 Y0 K0", "traco": "nenhum"})
    C("retangulo", {"prancheta": "L", "x": 5, "y": 5, "larg": 8, "alt": 35, "preench": "100K", "traco": "nenhum"})
    C("retangulo", {"prancheta": "L", "x": 5, "y": 32, "larg": 20, "alt": 8, "preench": "100K", "traco": "nenhum"})
    C("linha", {"prancheta": "-", "x1": 5, "y1": 25, "x2": 25, "y2": 25, "traco": "100K", "espessura": 11.34})   # 4 mm
    C("retangulo", {"prancheta": "I", "x": 10, "y": 5, "larg": 10, "alt": 35, "preench": "100K", "traco": "nenhum"})
    C("prancheta_caixa", {"prancheta": "I", "larg": 25})   # avanço do I menor
    r = C("exportar_fonte", {"caminho": OTF, "instalar": False})
    ok(r.get("glifos") == 6 and os.path.isfile(OTF) and not r.get("avisos"), "exportou o .otf (5 glifos + espaço)", str(r))

    from fontTools.pens.areaPen import AreaPen
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.pens.recordingPen import DecomposingRecordingPen
    from fontTools.ttLib import TTFont
    f = TTFont(OTF)
    cm, gs, hm = f.getBestCmap(), f.getGlyphSet(), f["hmtx"]
    ok(all(ord(c) in cm for c in "AOL-I ") and f["name"].getDebugName(1) == "Teste Kanivete", "mapa de caracteres e nome da família", str(sorted(cm)))

    def info(c):
        g = gs[cm[ord(c)]]
        bp = BoundsPen(gs); g.draw(bp)
        rp = DecomposingRecordingPen(gs); g.draw(rp)
        areas, ap = [], None
        for op, args in rp.value:   # área por contorno: > 0 = anti-horário
            if op == "moveTo":
                ap = AreaPen(); ap.moveTo(*args)
            elif op in ("closePath", "endPath"):
                ap.closePath(); areas.append(round(ap.value))
            else:
                getattr(ap, op)(*args)
        return [round(v) for v in (bp.bounds or (0, 0, 0, 0))], areas, hm[cm[ord(c)]][0]

    bI, aI, wI = info("I")
    ok(wI == 500 and all(abs(x - y) <= 1 for x, y in zip(bI, [200, 0, 400, 700])), "I: avanço 500 (prancheta de 25 mm) e caixa 200..400 × 0..700", f"{wI}, {bI}")
    bO, aO, wO = info("O")
    ok(wO == 600 and len(aO) == 2 and max(aO) > 0 and min(aO) < 0, "O: furo do branco — 2 contornos, externo anti-horário e furo horário (CFF)", f"áreas {aO}")
    bL, aL, _ = info("L")
    ok(len(aL) == 1 and aL[0] > 0, "L: dois retângulos sobrepostos viram 1 contorno", f"áreas {aL}")
    bH, aH, _ = info("-")
    ok(len(aH) == 1 and abs((bH[3] - bH[1]) - 80) <= 2, "hífen: traço de 4 mm contornado (80 unidades de altura)", f"{bH}")
    bA, aA, _ = info("A")
    ok(len(aA) == 1 and abs(bA[3] - 700) <= 1 and bA[1] == 0, "A: na base e na altura de versal", f"{bA}")

    # usa a fonte num texto do Vetor (registrada para o documento, sem instalar no Windows)
    t = C("texto", {"prancheta": "A", "conteudo": "OLA-I", "x": 0, "y": 45, "fonte": "Teste Kanivete", "estilo": "Regular", "tamanho": 30, "preench": "100K"})
    ok(t.get("fonte_encontrada") in (True, "embutida"), "texto do Vetor com a fonte nova (embutida no documento)", str({k: t.get(k) for k in ("fonte_encontrada", "id")}))
    ok(not js_erros, "sem erros de JavaScript", "; ".join(js_erros[:3]))

from PIL import Image, ImageDraw, ImageFont
im = Image.new("RGB", (900, 220), "white")
ImageDraw.Draw(im).text((30, 20), "OLA-I LOA", font=ImageFont.truetype(OTF, 150), fill="black")
im.save(SAI + "/amostra.png")
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
