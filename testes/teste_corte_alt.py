"""Máscara de corte com Alt + clique na divisa entre duas camadas (como no Photoshop), com mouse de verdade no app de
teste (9333): cursor de corte, prende a de cima na de baixo, solta no segundo clique, Ctrl+Z, recorte na composição.
--recarregar recarrega a página antes (pega JS/CSS novos sem reabrir o app)."""
import sys, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

falhas = []
def ok(c, m):
    print(("  ok  " if c else "  FALHOU  ") + m)
    if not c: falhas.append(m)

with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    if "--recarregar" in sys.argv:
        cdp = pg.context.new_cdp_session(pg); cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})   # o WebView2 guarda o JS em cache
        cdp.send('Page.reload', {'ignoreCache': True}); time.sleep(3)
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.wait_for_function("typeof KNV === 'object' && typeof ieCmd === 'function'", timeout=90000)
    pg.evaluate("switchTool('editor-imagem')"); time.sleep(1)
    # documento: fundo branco, círculo (forma) e por cima uma foto (retângulo vermelho cobrindo tudo)
    pg.evaluate("""async () => { KNV.automacao(true, {respostas: {'Salvar': 'Não salvar'}}); await KNV.novo('corte', 400, 400);
        KNV.nova('circulo'); KNV.selecionarPoligono(Array.from({length: 48}, (_, i) => [200 + 100 * Math.cos(i / 48 * 6.283), 200 + 100 * Math.sin(i / 48 * 6.283)]));
        await KNV.preencher('#0000ff'); await KNV.cmd('selNada');
        KNV.nova('foto'); await KNV.preencher('#ff0000'); }""")
    time.sleep(0.5)
    linhas = pg.locator("#ie-cam-lista .ie-cam")
    nomes = [linhas.nth(i).locator(".ie-cam-nome").inner_text() for i in range(linhas.count())]
    ok(nomes[:2] == ["foto", "circulo"], f"pilha no painel: {nomes}")
    r = linhas.nth(0).bounding_box()
    x, y = r["x"] + r["width"] * 0.6, r["y"] + r["height"] - 2   # divisa foto | circulo

    pg.mouse.move(x, y - 20)
    pg.keyboard.down("Alt"); pg.mouse.move(x, y)
    ok(pg.evaluate("document.getElementById('ie-cam-lista').classList.contains('ie-cam-corte')"), "cursor de corte com Alt na divisa")
    pg.mouse.move(x, y - 20)
    ok(not pg.evaluate("document.getElementById('ie-cam-lista').classList.contains('ie-cam-corte')"), "sem cursor de corte no meio da linha")
    pg.mouse.move(x, y); pg.mouse.click(x, y); pg.keyboard.up("Alt"); time.sleep(0.3)
    ok(pg.evaluate("ieTodas(IE.doc).find(L => L.nome === 'foto').clip") is True, "Alt+clique prende a foto no círculo")
    canto, centro = pg.evaluate("KNV.cor(10, 10)"), pg.evaluate("KNV.cor(198, 198)")
    ok(canto[0] > 240 and canto[1] > 240, f"fora do círculo some (canto {canto})")
    ok(centro[0] > 240 and centro[2] < 20, f"dentro do círculo aparece a foto (centro {centro})")
    ok(pg.locator("#ie-cam-lista .ie-cam.clip").count() == 1, "ícone de corte na linha")

    pg.keyboard.down("Alt"); pg.mouse.click(x, y); pg.keyboard.up("Alt"); time.sleep(0.3)
    ok(pg.evaluate("ieTodas(IE.doc).find(L => L.nome === 'foto').clip") is False, "segundo Alt+clique solta")
    pg.keyboard.press("Control+z"); time.sleep(0.3)
    ok(pg.evaluate("ieTodas(IE.doc).find(L => L.nome === 'foto').clip") is True, "Ctrl+Z volta a máscara de corte")
    ok(not erros, f"sem erros na página {erros[:2]}")
print("PASSOU" if not falhas else f"REPROVOU ({len(falhas)})")
sys.exit(1 if falhas else 0)
