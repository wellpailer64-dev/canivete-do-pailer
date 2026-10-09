"""Modo agente: aplica código novo no app aberto SEM reiniciar.
  py -3.13 tools/recarregar.py [--porta 9333] [--py] [--ferramenta vetor-kanivete|editor-imagem|...]
--py recarrega os módulos Functions.* (importlib.reload pela ponte vk_recarregar); depois a página recarrega sem cache e a
ferramenta reabre. Mudança em main.py (a ponte em si) ainda exige reiniciar o app."""
import argparse, json, sys
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument("--porta", type=int, default=9333); ap.add_argument("--py", action="store_true")
ap.add_argument("--ferramenta", default="vetor-kanivete")
ap.add_argument("--forcar", action="store_true", help="recarrega mesmo com projeto aberto no editor de vídeo (perde o que não foi salvo)")
a = ap.parse_args()
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    # recarregar a página FECHA o projeto do editor de vídeo (o que não foi salvo some): no app do usuário, não
    # olha TODAS as janelas (a timeline/painéis soltos são outras páginas index.html, sem o projeto)
    aberto = next((r for c in b.contexts for x in c.pages if "index.html" in x.url for r in [x.evaluate(
        "() => typeof VE === 'object' && VE.ready ? (VE.projectPath || 'sem nome') : null")] if r), None)
    if aberto and not a.forcar:
        sys.exit(f"recusado: projeto aberto no editor ({aberto}); recarregar fecha o projeto. Use --forcar só no app de teste.")
    py = pg.evaluate("() => window.pywebview && pywebview.api.vk_recarregar ? pywebview.api.vk_recarregar() : null") if a.py else None
    cdp = pg.context.new_cdp_session(pg); cdp.send("Network.setCacheDisabled", {"cacheDisabled": True}); cdp.send("Page.reload", {"ignoreCache": True})
    pg.wait_for_function("typeof switchTool === 'function' && window.pywebview && pywebview.api", timeout=30000)
    pg.evaluate("t => switchTool(t)", a.ferramenta); pg.wait_for_timeout(800)
    pg.evaluate("() => document.querySelectorAll('.ie-modal').forEach(m => m.hidden = true)")
    print(json.dumps({"py": py and {k: py[k] for k in ("recarregados", "erros")}, "pagina": "recarregada", "ferramenta": a.ferramenta}, ensure_ascii=False))
