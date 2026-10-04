"""Teste do Vetor Kanivete pela API real (app em --agente=9333): monta um cartão de visita pelos comandos (window.VKN),
Pathfinder, deslocar/contornar traço, separações e sobreimpressão, fechamento, PDF/X-4 e PDF/X-1a relidos e conferidos, PNG, salvar/reabrir .aknv, abrir PDF/SVG/PPTX e
desfazer. Sai com 1 se algo reprovar. Amostras em D:/kanivete_testes/vetor/amostras (geradas se faltarem).

    python testes/teste_vetor.py [--porta 9333] [--print saida.png]
"""
import argparse, json, os, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AM = r"D:\kanivete_testes\vetor\amostras"
SAI = r"D:\kanivete_testes\vetor\saida"
ap = argparse.ArgumentParser(); ap.add_argument("--porta", type=int, default=9333); ap.add_argument("--print", default=os.path.join(SAI, "tela.png"))
a = ap.parse_args()
os.makedirs(SAI, exist_ok=True)
if not os.path.isfile(os.path.join(AM, "apresentacao.pptx")):
    subprocess.run([sys.executable, os.path.join(r"D:\kanivete_testes\scripts", "gerar_amostras_vetor.py")], check=False)

falhas = []
def ok(cond, msg):
    print(("  ok  " if cond else "  FALHOU  ") + msg)
    if not cond: falhas.append(msg)

with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}", timeout=20000)
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    erros = []
    pg.on("console", lambda m: m.type == "error" and erros.append(m.text))
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.evaluate("switchTool('vetor-kanivete')")
    pg.wait_for_function("window.VKN && document.getElementById('vk-canvas')", timeout=15000)
    C = lambda nome, args=None: pg.evaluate("([n, a]) => VKN.cmd(n, a)", [nome, args or {}])

    print("cartão 90×50 pelos comandos")
    r = C("novo", {"nome": "Cartao teste", "larg": 90, "alt": 50, "sangria": 3})
    ok(r["larg_mm"] == 90, "novo documento 90×50")
    fundo = C("retangulo", {"x": -3, "y": -3, "larg": 96, "alt": 56, "preench": "C100 M0 Y0 K0", "traco": "nenhum", "nome": "fundo"})
    t = C("texto", {"conteudo": "Vetor Kanivete", "x": 6, "y": 20, "fonte": "Arial", "estilo": "Bold", "tamanho": 16, "preench": "0K", "nome": "titulo"})
    ok(t["fonte_encontrada"] is True, "texto com Arial Bold (geometria do Python)")
    C("texto", {"conteudo": "contato@exemplo.com.br", "x": 6, "y": 40, "tamanho": 8, "preench": "C0 M0 Y0 K0", "nome": "contato"})
    e1 = C("elipse", {"x": 60, "y": 8, "larg": 20, "preench": "spot:PANTONE 1505 C:0,56,90,0", "traco": "nenhum"})
    e2 = C("estrela", {"cx": 78, "cy": 18, "raio": 9, "pontas": 5, "preench": "C0 M100 Y100 K0", "traco": "nenhum"})
    u = C("pathfinder", {"op": "unir", "ids": [e1["id"], e2["id"]]})
    ok(u["caixa_mm"]["larg"] > 20, f"Pathfinder unir ({u['caixa_mm']})")
    C("alterar", {"ids": [u["id"]], "preench": "spot:PANTONE 1505 C:0,56,90,0"})   # Unir fica com a cor do de cima (como no Illustrator)
    C("alinhar", {"ids": [t["id"]], "modo": "centro_h", "relativo": "prancheta"})
    cx = pg.evaluate("id => VKN.cmd('info', {ids: [id]})", t["id"])[0]["caixa_mm"]
    ok(abs(cx["x"] + cx["larg"] / 2 - 45) < 0.2, f"alinhado ao centro da prancheta ({cx})")
    C("linha", {"x1": 6, "y1": 30, "x2": 84, "y2": 30, "traco": "100K", "espessura": 0.1, "nome": "fio"})
    f = pg.evaluate("VKN.fechamento({padrao: 'x4'})")
    cods = [x["cod"] for x in f["erros"] + f["avisos"]]
    ok("traco_fino" in cods, "fechamento acusa traço de 0,1 pt")
    C("engrossar_tracos")
    f = pg.evaluate("VKN.fechamento({padrao: 'x4'})")
    ok(not f["erros"], f"fechamento sem erros depois de corrigir ({[x['msg'] for x in f['erros']]})")
    n_antes = pg.evaluate("vkTodos().length")
    C("duplicar", {"ids": [fundo["id"]]})
    pg.evaluate("vkDesfazer()")
    ok(pg.evaluate("vkTodos().length") == n_antes, "desfazer o duplicar")

    print("deslocar caminho e contornar traço")
    q = C("retangulo", {"x": 10, "y": 10, "larg": 20, "alt": 10, "preench": "C0 M0 Y100 K0", "traco": "100K", "espessura": 2, "nome": "selo"})
    d = C("deslocar", {"ids": [q["id"]], "distancia": 2, "junc": "round", "preench": "0K"})
    cx = pg.evaluate("id => VKN.cmd('info', {ids: [id]})", d["ids"][0])[0]["caixa_mm"]
    ok(abs(cx["larg"] - 24) < 0.6 and abs(cx["alt"] - 14) < 0.6, f"deslocar +2 mm (24×14 + traço: {cx})")
    di = C("deslocar", {"ids": [q["id"]], "distancia": -2})
    cx = pg.evaluate("id => VKN.cmd('info', {ids: [id]})", di["ids"][0])[0]["caixa_mm"]
    ok(abs(cx["larg"] - 16) < 0.6, f"deslocar −2 mm ({cx})")
    tr = C("contornar_traco", {"ids": [q["id"]]})
    o = pg.evaluate("id => vkObj(id)", tr["ids"][0])
    ok(o["tipo"] == "grupo" and len(o["itens"]) == 2 and o["itens"][1]["traco"] is None and o["itens"][1]["preench"]["v"] == [0, 0, 0, 100],
       "contornar traço: grupo [preenchimento, traço vira forma 100K]")
    tr2 = C("contornar_traco", {"ids": [C("linha", {"x1": 6, "y1": 46, "x2": 40, "y2": 46, "traco": "100K", "espessura": 2})["id"]]})
    o = pg.evaluate("id => vkObj(id)", tr2["ids"][0])
    ok(o["tipo"] == "caminho" and o["subs"] and o["subs"][0]["fechado"], "linha com traço vira forma fechada")
    C("apagar", {"ids": [*d["ids"], *di["ids"], *tr["ids"], *tr2["ids"]]})

    print("exportação")
    for padrao in ("x4", "x1a"):
        out = os.path.join(SAI, f"cartao_{padrao}.pdf")
        r = pg.evaluate("([c, p]) => VKN.exportarPdf(c, {padrao: p})", [out, padrao])
        ok(r["verificado"] and os.path.isfile(out), f"PDF/{padrao}: verificado={r['verificado']} {r['problemas']} cores={r['info']['cores']} spots={r['info']['spots']} v{r['info']['versao']}")
        ok("PANTONE 1505 C" in r["info"]["spots"], f"cor especial preservada no {padrao}")
    png = os.path.join(SAI, "cartao.png")
    r = pg.evaluate("c => VKN.exportarImagem(c, {ppi: 150})", png)
    ok(os.path.isfile(png) and os.path.getsize(png) > 2000, "PNG 150 ppi")
    aknv = os.path.join(SAI, "cartao.aknv")
    pg.evaluate("c => VKN.salvar(c)", aknv)
    n = pg.evaluate("vkTodos().length")
    pg.evaluate("c => VKN.abrir(c)", aknv)
    ok(pg.evaluate("vkTodos().length") == n, f"salvar e reabrir .aknv ({n} objetos)")
    pac = os.path.join(SAI, "pacote")
    import shutil; shutil.rmtree(pac, ignore_errors=True)
    r = pg.evaluate("c => VKN.empacotar(c)", pac)
    arqs = os.listdir(r["pasta"]) if os.path.isdir(r.get("pasta", "")) else []
    ok({"Relatório.txt", "Fontes"} <= set(arqs) and any(x.endswith(".aknv") for x in arqs) and r["pdf_verificado"],
       f"empacotar: {arqs} fontes={r['fontes']} pdf={r['pdf_verificado']}")

    print("abrir arquivos de fora")
    for arq, minimo in (("cmyk.pdf", 4), ("illustrator.svg", 6), ("apresentacao.pptx", 4)):
        r = pg.evaluate("c => VKN.abrir(c)", os.path.join(AM, arq))
        ok(r["objetos"] >= minimo, f"{arq}: {r['objetos']} objetos, {r['pranchetas']} prancheta(s), relatório {r['relatorio'][:2]}")
    pg.evaluate("VKN.abrir(arguments[0])" if False else "c => VKN.abrir(c)", os.path.join(AM, "illustrator.svg"))
    r = C("converter_cmyk")
    ok(r["convertidas"] > 0 and pg.evaluate("VKN.fechamento({padrao:'x1a'}).erros.filter(e => e.cod === 'rgb').length") == 0, f"SVG RGB → CMYK ({r['convertidas']} cores)")

    print("separações e sobreimpressão")
    C("novo", {"nome": "Sep teste", "larg": 100, "alt": 60, "sangria": 3})
    C("retangulo", {"x": 0, "y": 0, "larg": 100, "alt": 60, "preench": "C0 M0 Y100 K0", "traco": "nenhum", "nome": "fundo"})
    C("retangulo", {"x": 5, "y": 5, "larg": 20, "alt": 20, "preench": "100K", "traco": "nenhum", "nome": "preto"})
    C("retangulo", {"x": 30, "y": 5, "larg": 20, "alt": 20, "preench": "0K", "traco": "nenhum", "nome": "branco"})
    C("elipse", {"x": 55, "y": 5, "larg": 20, "preench": "spot:PANTONE 286 C:100,75,0,0", "traco": "nenhum", "nome": "especial"})
    C("retangulo", {"x": 80, "y": 5, "larg": 15, "alt": 20, "preench": "#ff0000", "traco": "nenhum", "nome": "rgb"})
    T = lambda x, y: pg.evaluate("([x, y]) => VKN.cmd('tinta_em', {x, y})", [x, y])
    ok(T(15, 15)["K"] == 100 and T(15, 15)["Y"] == 0, f"preto sem sobreimpressão vaza o amarelo ({T(15, 15)})")
    C("alterar", {"nomes": ["preto", "branco"], "sobreimprimir": True})
    ok(T(15, 15)["K"] == 100 and T(15, 15)["Y"] == 100, f"preto sobreimpresso fica sobre o amarelo ({T(15, 15)})")
    ok(T(40, 15)["Y"] == 100, f"branco sobreimpresso some ({T(40, 15)})")
    t = T(65, 15)
    ok(t.get("PANTONE 286 C") == 100 and t["Y"] == 0, f"especial vaza o processo ({t})")
    t = T(87, 15)
    ok(t["M"] > 80 and t["Y"] > 80 and t["C"] < 10, f"RGB vira CMYK pelo perfil ({t})")
    r = C("separacoes", {"ativo": True})
    ok(r["ativo"] and len(r["tintas"]) == 5, f"prévia ligada com 4 + 1 especial ({[x['nome'] for x in r['tintas']]})")
    pg.wait_for_timeout(400)
    pg.locator("#vk").screenshot(path=os.path.join(SAI, "separacoes.png"))
    seps = pg.evaluate("c => VKN.cmd('exportar_separacoes', {caminho: c, ppi: 72})", os.path.join(SAI, "sep.png"))["arquivos"]
    ok(len(seps) == 4 and not any(x.endswith("_C.png") for x in seps) and all(os.path.isfile(x) for x in seps),
       f"exportar separações: só as chapas com tinta ({[os.path.basename(x) for x in seps]})")
    C("separacoes", {"ativo": False})

    pg.evaluate("c => VKN.abrir(c)", aknv)
    pg.wait_for_timeout(600)
    pg.locator("#vk").screenshot(path=a.print)
    print("  print:", a.print)
    ok(not erros, f"sem erros de JS ({erros[:3]})")
print(json.dumps({"falhas": falhas}, ensure_ascii=False))
sys.exit(1 if falhas else 0)
