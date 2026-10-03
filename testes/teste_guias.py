"""Teste das guias/fatias como no Photoshop, com mouse de verdade no app de teste (9333)."""
import sys, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

ok = lambda c, m: print(("  ok  " if c else "  FALHOU  ") + m)
with sync_playwright() as p:
    for _ in range(90):
        try: b = p.chromium.connect_over_cdp("http://127.0.0.1:9333"); break
        except Exception: time.sleep(1)
    pg = None
    for _ in range(90):
        pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url), None)
        if pg: break
        time.sleep(1)
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.wait_for_function("typeof ieCmd === 'function' && typeof ieGuiasLayoutAplicar === 'function'", timeout=90000)
    pg.evaluate("switchTool('editor-imagem')"); time.sleep(1)
    pg.evaluate("KNV.automacao(true, {respostas: {'Salvar': 'Não salvar'}}); KNV.novo('carrossel', 5400, 1350)"); time.sleep(0.5)

    # 1) layout: 5 colunas, medianiz 0 → guias em 0..5400 de 1080 em 1080
    g = pg.evaluate("KNV.cmd('layoutGuias', {colunas: {n: 5, largura: '', medianiz: 0}, linhas: null, margem: null}).then(() => KNV.guias())")
    xs = sorted(x["p"] for x in g if x["o"] == "v")
    ok(xs == [0, 1080, 2160, 3240, 4320, 5400], f"layout 5 colunas: {xs}")
    # 2) layout com largura fixa centralizada + margens + linhas
    g2 = pg.evaluate("KNV.layoutGuias({colunas: {n: 2, largura: 400, medianiz: 100}, centralizar: true, linhas: {n: 2, altura: '', medianiz: 50}, margem: {sup: 100, esq: 0, inf: 100, dir: 0}, limpar: true})")
    v2 = sorted(x["p"] for x in g2 if x["o"] == "v"); h2 = sorted(x["p"] for x in g2 if x["o"] == "h")
    ok(v2 == [0, 2250, 2650, 2750, 3150, 5400], f"colunas fixas centralizadas: {v2}")
    ok(h2 == [100, 650, 700, 1250], f"linhas com margem e medianiz: {h2}")
    # 3) desfazer volta ao layout de 5 colunas
    pg.evaluate("IE_CMDS.desfazer ? ieCmd('desfazer') : ieIrHist(IE.doc.hist.i - 1)"); time.sleep(0.3)
    xs3 = sorted(x["p"] for x in pg.evaluate("KNV.guias()") if x["o"] == "v")
    ok(xs3 == xs, f"Ctrl+Z desfaz o layout de guias: {xs3}")
    # 4) janela do layout (abre, prévia, cancela sem mudar nada)
    pg.evaluate("void ieCmd('layoutGuias')"); time.sleep(0.6)
    pg.fill('[data-k="col.n"]', "3"); time.sleep(0.4)
    prev = len([x for x in pg.evaluate("KNV.guias()") if x["o"] == "v"])
    pg.screenshot(path="D:/kanivete_testes/scripts/guias_dialogo.png")
    pg.keyboard.press("Escape"); time.sleep(0.3)
    depois = sorted(x["p"] for x in pg.evaluate("KNV.guias()") if x["o"] == "v")
    ok(prev == 6 and depois == xs, f"prévia ao vivo ({prev} guias v) e Cancelar restaura ({len(depois)})")
    # 5) fatias das guias
    f = pg.evaluate("KNV.fatiasDasGuias()")
    ok(len(f) == 5 and [x["x"] for x in f] == [0, 1080, 2160, 3240, 4320] and all(x["w"] == 1080 and x["h"] == 1350 for x in f), f"fatias das guias: {len(f)}")
    # 6) encaixe com mouse: ferramenta Fatia, arrastar de perto da guia 1080 até perto de 2160 (sem fatias)
    pg.evaluate("ieFatiaExcluir(IE.doc, true); KNV.ajustar(true); ieEscolherFerr('fatia'); ieAjustarVista()"); time.sleep(0.4)
    a = pg.evaluate("(() => { const r = ieEl('ie-sobre').getBoundingClientRect(), d = IE.doc, s1 = ieDocTela(1080 + 3 / d.zoom, 40, d), s2 = ieDocTela(2160 - 3 / d.zoom, 1300, d); return [r.left + s1.x, r.top + s1.y, r.left + s2.x, r.top + s2.y]; })()")
    pg.mouse.move(a[0], a[1]); pg.mouse.down(); pg.mouse.move((a[0] + a[2]) / 2, (a[1] + a[3]) / 2, steps=5); pg.mouse.move(a[2], a[3], steps=5); pg.mouse.up(); time.sleep(0.3)
    fs = pg.evaluate("IE.doc.fatias.map(f => [f.x, f.y, f.w, f.h])")
    ok(len(fs) == 1 and fs[0][0] == 1080 and fs[0][2] == 1080, f"fatia desenhada à mão encaixa nas guias: {fs}")
    # 7) arrastar guia da régua com Alt (vira vertical) e Shift
    pg.evaluate("KNV.nova('Quadrado'); KNV.selecionar(100, 100, 300, 300); KNV.preencher('#ff0000'); ieCmd('desselecionar'); ieEscolherFerr('mover')"); time.sleep(0.3)
    n0 = len(pg.evaluate("KNV.guias()"))
    rh = pg.evaluate("(() => { const r = ieEl('ie-regua-h').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    alvo = pg.evaluate("(() => { const r = ieEl('ie-sobre').getBoundingClientRect(), d = IE.doc, s = ieDocTela(400 + 4 / d.zoom, 600, d); return [r.left + s.x, r.top + s.y]; })()")
    pg.mouse.move(rh[0], rh[1]); pg.mouse.down(); pg.keyboard.down("Alt"); pg.mouse.move(alvo[0], alvo[1], steps=8); pg.mouse.up(); pg.keyboard.up("Alt"); time.sleep(0.3)
    gs = pg.evaluate("KNV.guias()")
    nova = gs[-1] if len(gs) > n0 else None
    ok(nova and nova["o"] == "v" and nova["p"] == 400, f"régua de cima + Alt = guia vertical, encaixada na borda do quadrado: {nova}")
    # 8) mover camada encaixa na guia 1080
    pg.evaluate("KNV.ativar('Quadrado')")
    c0 = pg.evaluate("(() => { const r = ieEl('ie-sobre').getBoundingClientRect(), d = IE.doc, s = ieDocTela(250, 250, d), t = ieDocTela(250 + 680 + 5 / d.zoom, 250, d); return [r.left + s.x, r.top + s.y, r.left + t.x, r.top + t.y]; })()")
    pg.mouse.move(c0[0], c0[1]); pg.mouse.down(); pg.mouse.move(c0[2], c0[3], steps=10); pg.mouse.up(); time.sleep(0.3)
    cx = pg.evaluate("KNV.caixa('Quadrado')")
    ok(abs(cx["x"] + cx["w"] - 1080) < 1 or abs(cx["x"] - 1080) < 1, f"mover encaixa a borda na guia: {cx}")
    # 9) exportar fatias (5 arquivos)
    pg.evaluate("KNV.fatiasDasGuias()")
    feitos = pg.evaluate("KNV.exportar('D:/kanivete_testes/cena/saida_guias', {fmt: 'jpg', base: 'carrossel'})")
    ok(len(feitos) == 6, f"exportou {len(feitos)} arquivos: {feitos[:2]}...")
    # 10) menu Exibir com Ajustar ✓
    pg.evaluate("document.querySelectorAll('.ie-mbar-btn')[[...document.querySelectorAll('.ie-mbar-btn')].findIndex(b => b.textContent.trim() === ieT('Exibir'))].click()"); time.sleep(0.3)
    pg.screenshot(path="D:/kanivete_testes/scripts/guias_menu.png")
    pg.keyboard.press("Escape"); pg.mouse.click(5, 5)
    pg.evaluate("KNV.automacao(false)")
    ok(not erros, f"sem erros de JavaScript {erros[:3]}")
    # 11) Arquivo > Novo > Carrossel 1080 × 1440, 3 páginas → 3240 × 1440 com guias e fatias
    r = pg.evaluate("""(async () => { const i = IE_PREDEF.findIndex(p => p[0].startsWith('Carrossel 1080 × 1440'));
        await KNV.cmd('novo', {pre: String(i), pag: 3}); const d = IE.doc;
        return [d.w, d.h, d.guias.filter(g => g.o === 'v').map(g => g.p), d.fatias.map(f => [f.x, f.w])]; })()""")
    ok(r[0] == 3240 and r[1] == 1440 and r[2] == [0, 1080, 2160, 3240] and len(r[3]) == 3, f"Novo carrossel 1080×1440, 3 páginas: {r}")
