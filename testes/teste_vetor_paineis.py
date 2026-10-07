"""Painéis móveis do Vetor Kanivete (vetor-dock.js, o mecanismo do Photo) — app em --agente=9333, mouse de verdade.

    py -3.13 testes/teste_vetor_paineis.py

Confere: as abas viraram painéis (Camadas, Pranchetas, Amostras... cada um com conteúdo); arrastar o título para o meio
do desenho solta a janela; para a borda esquerda do desenho cria coluna à esquerda; empilhar em outra coluna; recolher;
fechar e reabrir pelo menu Janela; o botão Fechamento abre o painel dele; nomes de camada não são traduzidos pela
interface; o layout volta depois de recarregar a página. No fim redefine os painéis. Sai com 1 se reprovar.
"""
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def arrastar(pg, painel, para):
    b = pg.locator(f"#vk [data-painel={painel}] .ie-painel-cab").bounding_box()
    x0, y0 = b["x"] + 40, b["y"] + 10
    pg.mouse.move(x0, y0); pg.mouse.down()
    for k in range(1, 13):
        pg.mouse.move(x0 + (para[0] - x0) * k / 12, y0 + (para[1] - y0) * k / 12)
    pg.mouse.up(); pg.wait_for_timeout(400)


def pagina(p):
    for _ in range(90):
        try:
            return p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts[0].pages[0]
        except Exception:
            time.sleep(1)


with sync_playwright() as p:
    pg = pagina(p)
    js_erros = []
    pg.on("pageerror", lambda e: js_erros.append(str(e)))
    pg.wait_for_function("typeof switchTool === 'function'", timeout=90000)
    pg.evaluate("switchTool('vetor-kanivete')")
    pg.wait_for_function("window.VKN && typeof VK_DOCK !== 'undefined' && VK_DOCK.prefsOk", timeout=60000)
    pg.evaluate("vkDockRedefinir(); document.getElementById('app-update-banner')?.remove()")   # o aviso de versão nova cobre o canto
    pg.evaluate("VKN.cmd('novo', {larg: 100, alt: 100, pranchetas: 2})")
    pg.evaluate("() => { VK.doc.camadas[0].nome = 'Fundo'; VKN.cmd('nova_camada', {nome: 'Texto'}); }"); pg.wait_for_timeout(400)
    corpos = pg.evaluate("() => ['camadas', 'pranchetas', 'amostras'].map(id => document.getElementById('vk-aba-' + id).innerHTML.length)")
    ok(all(c > 100 for c in corpos), "Camadas, Pranchetas e Amostras são painéis com conteúdo", str(corpos))
    ok(pg.evaluate("() => [...document.querySelectorAll('#vk .vk-cam-nome')].map(e => e.textContent).slice(0, 2)") == ["Texto", "Fundo"], "nomes de camada não são traduzidos pela interface")
    centro = pg.evaluate("() => { const r = document.querySelector('#vk .ie-centro').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
    arrastar(pg, "pranchetas", (centro[0] + centro[2] / 2, centro[1] + 150))
    ok("pranchetas" in pg.evaluate("Object.keys(VK_DOCK.lay.soltos)"), "Pranchetas solta sobre o desenho (janela)")
    arrastar(pg, "camadas", (centro[0] + 20, centro[1] + centro[3] / 2))
    ok(pg.evaluate("VK_DOCK.lay.esq") == [["camadas"]] and pg.evaluate("parseInt(getComputedStyle(document.getElementById('vk')).getPropertyValue('--vk-esq-w'))") > 150,
       "Camadas vira coluna à esquerda do desenho", str(pg.evaluate("VK_DOCK.lay.esq")))
    alvo = pg.locator("#vk [data-painel=props]").bounding_box()
    arrastar(pg, "pranchetas", (alvo["x"] + alvo["width"] / 2, alvo["y"] + alvo["height"] - 10))
    ok(pg.evaluate("VK_DOCK.lay.dir[0]").count("pranchetas") == 1 and "pranchetas" not in pg.evaluate("Object.keys(VK_DOCK.lay.soltos)"), "Pranchetas empilha na coluna da direita", str(pg.evaluate("VK_DOCK.lay.dir")))
    pg.dblclick("#vk [data-painel=amostras] .ie-dock-tit"); pg.wait_for_timeout(200)
    ok("amostras" in pg.evaluate("VK_DOCK.lay.recolhidos"), "duplo clique no título recolhe")
    pg.click("#vk [data-painel=amostras] [data-dock=fechar]"); pg.wait_for_timeout(200)
    ok("amostras" in pg.evaluate("VK_DOCK.lay.fechados") and pg.evaluate("document.querySelector('#vk [data-painel=amostras]').hidden"), "× fecha o painel")
    pg.evaluate("() => VK_MENUS.find(m => m[0] === 'Janela')[1].find(i => i[0] === 'Amostras')[2]()"); pg.wait_for_timeout(200)
    ok("amostras" not in pg.evaluate("VK_DOCK.lay.fechados"), "menu Janela reabre")
    pg.evaluate("vkPainelFechamento()"); pg.wait_for_timeout(400)
    ok("fechamento" not in pg.evaluate("VK_DOCK.lay.fechados") and pg.evaluate("document.getElementById('vk-aba-fechamento').innerHTML.length") > 100, "botão Fechamento abre o painel dele")
    lay = pg.evaluate("JSON.stringify([VK_DOCK.lay.esq, VK_DOCK.lay.dir])")
    pg.wait_for_timeout(1200)   # gravação das preferências (400 ms)
    ok(not js_erros, "sem erros de JavaScript", "; ".join(js_erros[:3]))
subprocess.run([sys.executable, "tools/recarregar.py"], capture_output=True)
time.sleep(5)
with sync_playwright() as p:
    pg = pagina(p)
    pg.wait_for_function("window.VKN && typeof VK_DOCK !== 'undefined' && VK_DOCK.prefsOk", timeout=60000)
    ok(pg.evaluate("JSON.stringify([VK_DOCK.lay.esq, VK_DOCK.lay.dir])") == lay, "layout volta depois de recarregar")
    pg.evaluate("vkDockRedefinir()"); pg.wait_for_timeout(900)
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
