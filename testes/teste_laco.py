"""Laço: Shift soma, Alt subtrai, Shift+Alt cruza; o mesmo no magnético; Ctrl+clique na miniatura seleciona a camada."""
import sys, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
F = []
def ok(c, m): print(("  ok  " if c else "  FALHOU  ") + m); F.append(m) if not c else None
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333"); pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    pg.wait_for_function("typeof IE_LACO !== 'undefined'", timeout=60000); pg.evaluate("switchTool('editor-imagem')"); time.sleep(1)
    pg.evaluate("KNV.automacao(true, {padrao: 'primario'}); KNV.fecharTudo().then(() => { KNV.novo('laco', 800, 600); KNV.ajustar(false); ieAjustarVista(); IE.op.laco.modo = 'livre'; ieEscolherFerr('laco'); })"); time.sleep(1)
    T = lambda x, y: pg.evaluate(f"(() => {{ const r = ieEl('ie-sobre').getBoundingClientRect(), s = ieDocTela({x}, {y}, IE.doc); return [r.left + s.x, r.top + s.y]; }})()")
    def laco(pts, mods=()):
        for m in mods: pg.keyboard.down(m)
        pg.mouse.move(*T(*pts[0])); pg.mouse.down()
        for q in pts[1:] + [pts[0]]: pg.mouse.move(*T(*q), steps=4)
        pg.mouse.up()
        for m in mods: pg.keyboard.up(m)
        time.sleep(0.2)
    area = lambda: pg.evaluate("(() => { if (!IE.doc.sel) return 0; const d = ieCtx(IE.doc.sel.c).getImageData(0, 0, IE.doc.w, IE.doc.h).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; })()")
    quad = lambda x, y, s: [(x, y), (x + s, y), (x + s, y + s), (x, y + s)]
    laco(quad(100, 100, 200)); a1 = area()
    laco(quad(400, 100, 200), ("Shift",)); a2 = area()
    ok(a2 > a1 * 1.8, f"Shift soma ({a1} → {a2})")
    laco(quad(150, 150, 100), ("Alt",)); a3 = area()
    ok(a3 < a2 - 8000, f"Alt subtrai ({a2} → {a3})")
    laco(quad(250, 120, 300), ("Shift", "Alt")); a4 = area()
    ok(0 < a4 < a3, f"Shift+Alt cruza ({a3} → {a4})")
    # cursor com o sinal
    pg.keyboard.down("Shift"); pg.mouse.move(*T(600, 500)); time.sleep(0.15); c1 = pg.evaluate("ieEl('ie-sobre').style.cursor"); pg.keyboard.up("Shift")
    pg.keyboard.down("Alt"); pg.mouse.move(*T(610, 500)); time.sleep(0.15); c2 = pg.evaluate("ieEl('ie-sobre').style.cursor"); pg.keyboard.up("Alt")
    ok('url(' in c1 and c1 != c2, f"cursor do laço mostra + com Shift e − com Alt ({c1[:40]}... / {c2[:40]}...)")
    # botões da barra de opções: Subtrair sem tecla nenhuma
    pg.click(".ie-sel-modos [data-v='subtrair']"); time.sleep(0.2)
    s0 = area(); laco(quad(260, 130, 60)); s1 = area()
    ok(s1 < s0 and pg.evaluate("IE.op.sel.modo") == 'subtrair', f"botão Subtrair da barra de opções ({s0} → {s1})")
    pg.click(".ie-sel-modos [data-v='nova']"); time.sleep(0.2)
    # magnético: Alt na hora do 1º clique subtrai
    pg.evaluate("ieCmd('selNada') ; KNV.selecionar(100, 100, 600, 400); const L = ieAtiva(IE.doc), x = ieCtx(L.c); x.fillStyle = '#000'; x.fillRect(300, 200, 200, 200); ieInvalidar(L); ieTudo(IE.doc); ieEscolherFerr('lacoMag')")
    b0 = area()
    pg.keyboard.down("Alt"); pg.mouse.click(*T(296, 196)); pg.keyboard.up("Alt")
    for (x0, y0), (x1, y1) in zip([(296, 196), (504, 196), (504, 404), (296, 404)], [(504, 196), (504, 404), (296, 404), (296, 196)]):
        for k in range(1, 7): pg.mouse.move(*T(x0 + (x1 - x0) * k / 6, y0 + (y1 - y0) * k / 6))
        if (x1, y1) != (296, 196): pg.mouse.click(*T(x1, y1))
    pg.keyboard.press("Enter"); time.sleep(0.2)
    b1 = area()
    ok(b1 < b0 - 30000, f"laço magnético com Alt subtrai ({b0} → {b1})")
    # Ctrl+clique na miniatura da camada
    pg.evaluate("ieCmd('selNada'); KNV.nova('Bola'); const L = ieAtiva(IE.doc), x = ieCtx(L.c || (L.c = ieCanvas(800, 600))); L.x = 0; L.y = 0; x.fillStyle = '#f00'; x.beginPath(); x.arc(400, 300, 100, 0, 7); x.fill(); ieInvalidar(L); ieTudo(IE.doc); ieUiCamadas()")
    time.sleep(0.3)
    pg.keyboard.down("Control"); pg.click(".ie-cam.sel [data-alvo='px']"); pg.keyboard.up("Control"); time.sleep(0.3)
    bb = pg.evaluate("IE.doc.sel && IE.doc.sel.bbox")
    ok(bb and abs(bb["w"] - 200) < 6, f"Ctrl+clique na miniatura seleciona o conteúdo da camada ({bb})")
    pg.evaluate("KNV.automacao(false)")
    print("\nPASSOU" if not F else f"\nFALHOU ({len(F)})")
