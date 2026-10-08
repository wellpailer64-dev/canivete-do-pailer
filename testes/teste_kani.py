"""Kani (assistente) — abre um app próprio (porta 9334, dados em D:/kanivete_testes/fila) e confere: bolinha na Home,
item IA › Kani na barra lateral, gaveta, pergunta real respondida pelo Qwen3 8B (Ollama ou llama.cpp baixado), botão
"Abrir <ferramenta>" e contexto da ferramenta aberta. Precisa da IA já disponível (Ollama com qwen3:8b ou o download).

    py -3.13 testes/teste_kani.py
"""
import os
import subprocess
import sys
import time
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "D:/kanivete_testes/fila/"
PORTA = 9334
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def main():
    env = dict(os.environ, APPDATA=BASE + "appdata", TEMP=BASE + "tmp", TMP=BASE + "tmp", LOCALAPPDATA=BASE + "localappdata")
    for k in ("appdata", "tmp", "localappdata"):
        os.makedirs(BASE + k, exist_ok=True)
    app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={PORTA}"], cwd=RAIZ, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORTA}/json", timeout=1)
                break
            except Exception:
                time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORTA}")
            pg = None
            for _ in range(60):
                pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url and x.evaluate("typeof VE") == "object"), None)
                if pg:
                    break
                time.sleep(1)
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.kani_estado) && window.KANI_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); switchTool('home')")
            pg.wait_for_timeout(500)
            ok(pg.is_visible("#kani-bolinha"), "bolinha 'Pergunte à Kani' na Home")
            ok(pg.evaluate("[...document.querySelectorAll('.menu-group')].some(g => g.textContent.trim() === 'IA') && !!document.getElementById('menu-kani')"), "IA › Kani na barra lateral")
            pg.click("#kani-bolinha")
            pg.wait_for_function("KANI_API.estado() && KANI_API.estado().pronto", timeout=30000)
            ok(pg.is_visible("#kani") and not pg.is_visible("#kani-bolinha"), "a bolinha abre a gaveta (e some enquanto ela está aberta)")
            ok("Início" in pg.inner_text("#kani-corpo") and pg.evaluate("document.querySelectorAll('#kani [data-sug]').length") >= 3, "boas-vindas com a ferramenta atual e sugestões")
            t = time.time()
            pg.click("#kani [data-sug]:nth-child(2)")   # "Como tiro o fundo de uma foto?"
            pg.wait_for_function("!KANI_API.gerando() && KANI_API.conversa().msgs.length === 2", timeout=240000)
            resp = pg.evaluate("KANI_API.conversa().msgs[1]")
            ok(len(resp.get("content", "")) > 40 and not resp.get("erro"), "respondeu a pergunta", f"{time.time() - t:.1f} s: {resp.get('content', '')[:160]!r} {resp.get('erro', '')}")
            ok(not any(x in resp.get("content", "") for x in (".js", ".py", "window.", "Functions/")), "não fala de código com o usuário")
            botoes = pg.evaluate("[...document.querySelectorAll('#kani [data-abrir]')].map(b => b.dataset.abrir)")
            ok("remover-fundo" in botoes or "editor-imagem" in botoes, "sugere abrir a ferramenta certa com botão", str(botoes))
            if botoes:
                pg.click(f"#kani [data-abrir='{botoes[0]}']")
                ok(pg.evaluate(f"document.getElementById('page-{botoes[0]}')?.classList.contains('active')"), "o botão abre a ferramenta")
            # texto pronto sai numa caixinha com Copiar só dela; cada resposta tem Copiar e Ouvir
            pg.evaluate("switchTool('home'); kaniAbrir(); kaniNova()")
            caixa = pg.locator("#kani-txt")
            caixa.fill("Escreve uma legenda curta de Instagram para o Dia do Instrutor de autoescola.")
            caixa.press("Enter")
            pg.wait_for_function("!KANI_API.gerando() && KANI_API.conversa().msgs.length === 2", timeout=240000)
            ok(pg.evaluate("!!document.querySelector('#kani .kani-saida [data-copiar-bloco]')"), "texto pronto numa caixinha com Copiar", pg.evaluate("KANI_API.conversa().msgs[1].content")[:200])
            ok(pg.evaluate("!!document.querySelector('#kani [data-copiar-msg]') && !!document.querySelector('#kani [data-ouvir-msg]')"), "botões Copiar e Ouvir na resposta")
            t = time.time()
            pg.click("#kani [data-ouvir-msg]")
            try:
                pg.wait_for_function("document.querySelector('#kani [data-ouvir-msg]')?.classList.contains('tocando')", timeout=120000)
                ok(True, "Ouvir lê com a voz", f"{time.time() - t:.1f} s")
            except Exception:
                ok(False, "Ouvir lê com a voz", pg.inner_text("#kani-corpo")[-200:])
            pg.screenshot(path=BASE + "kani_saida.png")
            pg.click("#kani [data-ouvir-msg]")
            # dentro do Editor, pela barra lateral: a Kani sabe onde a pessoa está
            pg.evaluate("kaniFechar(); switchTool('video-cutter')")
            pg.click("#menu-kani")
            pg.evaluate("kaniNova()")
            ok("Editor Kanivete" in pg.inner_text("#kani-corpo"), "abre de qualquer ferramenta e sabe qual está aberta")
            pg.screenshot(path=BASE + "kani.png")
    finally:
        app.terminate()
    print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
