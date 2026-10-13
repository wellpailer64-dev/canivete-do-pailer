"""Teste das mãos da Kani: abre o app de teste (porta 9338, dados em D:/kanivete_testes), pede um flyer ao agente da
Kani e confere que o Photo montou um documento novo com camadas, salvou o .iknv e a prévia, e que os nomes vieram certos.
uso: py -3.13 testes/teste_kani_maos.py ["pedido"] [--porta 9338] [--manter]   (sai com 1 se reprovar)"""
import argparse, json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("pedido", nargs="?",
    default="Faz um flyer de aula experimental grátis de pilates no Studio Equilíbrio, WhatsApp (11) 98888-7777")
ap.add_argument("--porta", default="9338"); ap.add_argument("--manter", action="store_true")
a = ap.parse_args()

env = dict(os.environ, APPDATA=r"D:\kanivete_testes\appdata", TEMP=r"D:\kanivete_testes\tmp", TMP=r"D:\kanivete_testes\tmp",
           LOCALAPPDATA=r"D:\kanivete_testes\localappdata")
app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={a.porta}"], cwd=RAIZ, env=env)
falhas = []
try:
    with sync_playwright() as p:
        for _ in range(240):
            try: b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}"); break
            except Exception: time.sleep(1)
        else: sys.exit("app não abriu")
        pg = None
        for _ in range(120):   # a página do app nasce depois do about:blank; a conexão antiga não a vê: reconecta
            pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url), None)
            if pg: break
            time.sleep(2)
            try: b.close()
            except Exception: pass
            try: b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
            except Exception: pass
        if not pg: sys.exit("página do app não apareceu")
        pg.wait_for_function("typeof KNV === 'object' && typeof kaniMaos === 'function' && window.pywebview && pywebview.api && typeof pywebview.api.kani_agente === 'function'", timeout=120000)
        docs0 = pg.evaluate("IE.docs.length")
        pg.evaluate("""() => { window._ev = []; const o = window.kaniAgente; window.kaniAgente = d => { window._ev.push(d); try { o && o(d) } catch (e) {} }; }""")
        print("pedido:", a.pedido)
        r = pg.evaluate("p => pywebview.api.kani_agente('t1', p, [], [], [])", a.pedido)
        if r and r.get("success") is False: sys.exit(f"agente recusou: {r}")
        t0, vistos, fim = time.time(), 0, None
        while time.time() - t0 < 900:
            ev = pg.evaluate("window._ev")
            for d in ev[vistos:]:
                if d.get("plano"): print("  plano:", " → ".join(d["plano"]))
                ps = d.get("passo")
                if ps and ps.get("acao"): print(f"  passo {ps.get('n')}: {ps.get('acao')} [{ps.get('estado')}] {str(ps.get('resumo') or '')[:160]}")
                if d.get("fim") or d.get("erro"): fim = d
            vistos = len(ev)
            if fim: break
            time.sleep(2)
        dt = time.time() - t0
        if not fim: falhas.append("não terminou em 15 min")
        elif fim.get("erro"): falhas.append("erro: " + str(fim["erro"]))
        else:
            arqs = fim.get("arquivos") or []
            print(f"  entrega ({dt:.0f} s): {fim.get('mensagem')}")
            for x in arqs: print("   -", x.get("tipo"), x.get("path"))
            if not any((x.get("path") or "").endswith(".iknv") and os.path.isfile(x["path"]) for x in arqs): falhas.append("sem .iknv entregue")
            if not any(x.get("tipo") == "imagem" for x in arqs): falhas.append("sem prévia")
        info = pg.evaluate("(() => { let n = 0, tx = []; if (IE.doc) iePercorrer(IE.doc.camadas, L => { n++; if (L.txt) tx.push(L.txt.s); }); return {docs: IE.docs.length, ferramenta: !!document.querySelector('#page-editor-imagem.active'), camadas: n, textos: tx.join(' | ')}; })()")
        txt = info.pop("textos"); print("  Photo:", info)
        if info["docs"] <= docs0: falhas.append("nenhum documento novo no Photo")
        if info["camadas"] < 3: falhas.append(f"poucas camadas ({info['camadas']})")
        print("  textos:", txt[:300])
        if "Studio Equilíbrio" in a.pedido and "Studio Equilíbrio" not in txt: falhas.append("nome 'Studio Equilíbrio' trocado")
        pg.screenshot(path=r"D:\kanivete_testes\scripts\kani_maos_tela.png")
        if a.manter: input("Enter para fechar o app de teste...")
finally:
    subprocess.run(["taskkill", "/T", "/F", "/PID", str(app.pid)], capture_output=True)
print("REPROVADO: " + "; ".join(falhas) if falhas else "OK")
sys.exit(1 if falhas else 0)
