"""Pranchetas do Vetor Kanivete como no Illustrator — app em --agente=9333.

    py -3.13 testes/teste_pranchetas.py

Confere: documento novo em grade de 4 descendo; prancheta nova no próximo lugar; duplicar leva a arte e a grade se
refaz; ▲▼ muda a ordem e a arte acompanha; reorganizar vertical; Ctrl+Z; e com o mouse (ferramenta Prancheta): alça
muda o tamanho, arrastar move com a arte (inclusive a que sangra), Alt+arrastar duplica, arrastar no vazio cria.
Sai com 1 se reprovar.
"""
import sys
import time

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
erros = []
MM = 72 / 25.4


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


with sync_playwright() as p:
    b = None
    for _ in range(90):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    js_erros = []
    pg.on("pageerror", lambda e: js_erros.append(str(e)))
    pg.evaluate("switchTool('vetor-kanivete')")
    pg.wait_for_function("window.VKN && document.getElementById('vk-canvas') && typeof vkPrDown === 'function'", timeout=15000)
    pg.evaluate("VKN.curto = false")
    C = lambda n, a=None: pg.evaluate("([n, a]) => VKN.cmd(n, a)", [n, a or {}])
    PR = lambda: pg.evaluate("() => VK.doc.pranchetas.map(p => ({n: p.nome, x: +(p.x / 72 * 25.4).toFixed(1), y: +(p.y / 72 * 25.4).toFixed(1), w: +(p.w / 72 * 25.4).toFixed(1), h: +(p.h / 72 * 25.4).toFixed(1)}))")
    CX = lambda i: pg.evaluate("id => { const b = vkBox(vkObj(id)); return [+(b[0] / 72 * 25.4).toFixed(1), +(b[1] / 72 * 25.4).toFixed(1)]; }", i)

    # 1. grade de 4, descendo
    C("novo", {"nome": "IDV teste", "larg": 100, "alt": 100, "pranchetas": 6, "sangria": 3})
    ps = PR()
    e = 36 / MM
    ok([(q["x"], q["y"]) for q in ps] == [(round(i % 4 * (100 + e), 1), round(i // 4 * (100 + e), 1)) for i in range(6)], "documento novo: 4 por linha, descendo", str([(q["x"], q["y"]) for q in ps]))
    C("nova_prancheta", {})
    ps = PR()
    ok((ps[6]["x"], ps[6]["y"]) == (round(2 * (100 + e), 1), round(100 + e, 1)), "prancheta nova no próximo lugar (7ª = linha 2, coluna 3)", str(ps[6]))

    # 2. arte em cada prancheta (um quadrado com sangria na 2ª) e duplicar a 2ª
    ids = []
    for i in range(7):
        ids.append(C("retangulo", {"prancheta": i + 1, "x": 10, "y": 10, "larg": 30, "alt": 30, "preench": "C0 M0 Y0 K100", "nome": f"q{i + 1}"})["id"])
    fundo = C("retangulo", {"prancheta": 2, "x": -3, "y": -3, "larg": 106, "alt": 60, "preench": "C100 M0 Y0 K0", "nome": "fundo2"})["id"]
    antes_q7 = CX(ids[6])
    r = C("duplicar_prancheta", {"prancheta": "Prancheta 2"})
    ps = PR()
    ok(r["objetos"] == 2 and [q["n"] for q in ps][:3] == ["Prancheta 1", "Prancheta 2", "Prancheta 2 cópia"], "duplicar: cópia logo depois, com a arte (2 objetos)", f"{r}, {[q['n'] for q in ps]}")
    ok((ps[2]["x"], ps[2]["y"]) == (round(2 * (100 + e), 1), 0.0) and (ps[4]["x"], ps[4]["y"]) == (0.0, round(100 + e, 1)), "grade refeita: a cópia é a 3ª, a 4ª desceu para a linha 2", str([(q["x"], q["y"]) for q in ps]))
    q7 = CX(ids[6])
    ok(abs(q7[0] - (ps[7]["x"] + 10)) < 0.2 and abs(q7[1] - (ps[7]["y"] + 10)) < 0.2, "a arte acompanhou a prancheta que andou", f"{antes_q7} → {q7}, prancheta {ps[7]}")

    # 3. ordem ▲▼
    C("ordem_prancheta", {"prancheta": "Prancheta 1", "direcao": "abaixo"})
    ps = PR()
    ok([q["n"] for q in ps][:2] == ["Prancheta 2", "Prancheta 1"] and (ps[0]["x"], ps[0]["y"]) == (0.0, 0.0), "▼: Prancheta 1 vira a 2ª e a 2 assume o canto", str(ps[:2]))
    q2 = CX(ids[1])
    ok(abs(q2[0] - 10) < 0.2 and abs(q2[1] - 10) < 0.2, "arte da Prancheta 2 foi junto para o canto", str(q2))
    pg.evaluate("vkDesfazer()")
    ok([q["n"] for q in PR()][:2] == ["Prancheta 1", "Prancheta 2"] and abs(CX(ids[1])[0] - (100 + e + 10)) < 0.2, "Ctrl+Z volta a ordem e a arte")

    # 4. reorganizar uma abaixo da outra
    C("organizar_pranchetas", {"modo": "vertical", "espaco": 20})
    ps = PR()
    ok(all(q["x"] == 0 for q in ps) and all(abs(ps[i + 1]["y"] - (ps[i]["y"] + 100 + 20)) < 0.2 for i in range(len(ps) - 1)), "reorganizar: uma abaixo da outra, 20 mm", str([q["y"] for q in ps]))
    f2 = CX(fundo)
    ok(abs(f2[0] - (-3)) < 0.2 and abs(f2[1] - (ps[1]["y"] - 3)) < 0.2, "fundo com sangria foi junto com a Prancheta 2", str(f2))
    C("nova_prancheta", {})
    ps = PR()
    ok(ps[-1]["x"] == 0 and abs(ps[-1]["y"] - (ps[-2]["y"] + 120)) < 0.2, "na ordem vertical a nova entra embaixo da última", str(ps[-1]))
    C("organizar_pranchetas", {"modo": "grade", "colunas": 4, "espaco": 36 / MM})

    # 5. mouse com a ferramenta Prancheta
    pg.evaluate("() => { VK.ativa = VK.doc.pranchetas[0].id; vkFerramenta('prancheta'); vkEnquadrar(); const c = vkCanvas().getBoundingClientRect(); vkZoom(0.4, c.width / 2, c.height / 2); }")   # afastado: alças e arrastes cabem na tela
    pg.wait_for_timeout(300)
    tela = lambda x, y: pg.evaluate("([x, y]) => { const r = vkCanvas().getBoundingClientRect(); const [sx, sy] = vkTela(x * 72 / 25.4, y * 72 / 25.4); return [r.left + sx, r.top + sy]; }", [x, y])
    z = pg.evaluate("VK.vista.z") * MM   # px por mm

    def arrastar(de, para, alt=False):
        pg.mouse.move(*de)
        if alt:
            pg.keyboard.down("Alt")
        pg.mouse.down()
        if "--debug" in sys.argv:
            print("   ", pg.evaluate("([x, y]) => [VKA && VKA.modo, VK.ferr, (document.elementFromPoint(x, y) || {}).id, VK.vista.z]", list(de)))
        for k in range(1, 9):
            pg.mouse.move(de[0] + (para[0] - de[0]) * k / 8, de[1] + (para[1] - de[1]) * k / 8)
        pg.mouse.up()
        if alt:
            pg.keyboard.up("Alt")
        pg.wait_for_timeout(200)

    a = tela(100, 100)   # alça do canto inferior direito da Prancheta 1
    arrastar(a, (a[0] + 20 * z, a[1] + 10 * z))
    p1 = PR()[0]
    ok(abs(p1["w"] - 120) < 1 and abs(p1["h"] - 110) < 1, "alça muda o tamanho (100 → 120 × 110)", str(p1))
    pg.evaluate("vkDesfazer()")
    c0 = tela(50, 50)
    arrastar(c0, (c0[0] - 40 * z, c0[1] - 60 * z))
    p1 = PR()[0]
    q1 = CX(ids[0])
    ok(abs(p1["x"] + 40) < 1 and abs(p1["y"] + 60) < 1 and abs(q1[0] - (p1["x"] + 10)) < 0.3, "arrastar move a prancheta com a arte", f"{p1}, arte {q1}")
    n = len(PR())
    c0 = tela(p1["x"] + 50, p1["y"] + 50)
    arrastar(c0, (c0[0], c0[1] - 140 * z), alt=True)
    ps = PR()
    ok(len(ps) == n + 1 and ps[1]["n"] == "Prancheta 1 cópia" and abs(ps[1]["y"] - (p1["y"] - 140)) < 1, "Alt+arrastar duplica a prancheta", str(ps[1]))
    ok(pg.evaluate("() => vkPrArte(VK.doc.pranchetas[1]).length") == 1, "a cópia levou a arte")
    v = tela(-150, 0)
    arrastar(v, (v[0] + 60 * z, v[1] + 40 * z))
    ps = PR()
    ok(len(ps) == n + 2 and abs(ps[-1]["w"] - 60) < 1 and abs(ps[-1]["h"] - 40) < 1, "arrastar no vazio cria prancheta 60 × 40", str(ps[-1]))
    pg.evaluate("vkFerramenta('selecao')")
    pg.screenshot(path="D:/kanivete_testes/scripts/pranchetas.png")
    # 6. Novo documento (modelos como no Illustrator): Identidade visual › Manual de marca 16:9 (12), pelo diálogo
    pg.evaluate("vkNovoDialogo('Identidade visual', 0)"); pg.wait_for_timeout(300)
    pg.click("#vkn-ok"); pg.wait_for_timeout(400)
    ps = PR()
    ok(len(ps) == 12 and abs(ps[0]["w"] - 508) < 0.2 and abs(ps[0]["h"] - 285.8) < 0.2 and pg.evaluate("VK.doc.modoCor") == "rgb", "modelo Manual de marca: 12 pranchetas 1920×1080 px, RGB", str(ps[0]))
    ok(ps[4]["x"] == 0 and ps[4]["y"] > ps[0]["h"] and ps[3]["y"] == 0, "na ordem 4 por linha, descendo", str([(q["x"], q["y"]) for q in ps[:5]]))
    pg.evaluate("vkNovoDialogo('Papelaria', 0)"); pg.wait_for_timeout(300)
    pg.click("#vkn-ok"); pg.wait_for_timeout(400)
    ps = PR()
    ok(len(ps) == 2 and (ps[0]["w"], ps[0]["h"]) == (90, 50) and ps[1]["x"] == 0 and ps[1]["y"] > 50 and pg.evaluate("VK.doc.modoCor") == "cmyk", "Cartão de visita: frente e verso, um abaixo do outro, CMYK", str(ps))
    ok(pg.evaluate("document.querySelectorAll('#vk-inicio .vk-rapido .vk-novo-card').length") == 7, "tela inicial com começo rápido (6 modelos + Mais)")
    ok(not js_erros, "sem erros de JavaScript", "; ".join(js_erros[:3]))
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
