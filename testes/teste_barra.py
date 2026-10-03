"""Barra de tarefas contextual: alça move e lembra, Selecionar assunto / Remover fundo, × esconde só até o próximo clique."""
import sys, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
F = []
def ok(c, m): print(("  ok  " if c else "  FALHOU  ") + m); F.append(m) if not c else None
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333"); pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    pg.wait_for_function("typeof ieBarraCtxAtualizar === 'function'", timeout=60000)
    pg.evaluate("switchTool('editor-imagem')"); time.sleep(1)
    pg.evaluate("KNV.automacao(true, {padrao: 'primario'}); iePrefGravar('barraCtxPos', null); KNV.fecharTudo().then(() => KNV.abrir('D:/kanivete_testes/recorte/foto.jpg')).then(() => { ieAjustarVista(); ieEscolherFerr('mover'); })"); time.sleep(1.5)
    T = lambda x, y: pg.evaluate(f"(() => {{ const r = ieEl('ie-sobre').getBoundingClientRect(), s = ieDocTela({x}, {y}, IE.doc); return [r.left + s.x, r.top + s.y]; }})()")
    pg.mouse.click(*T(1000, 1200)); time.sleep(0.4)
    vis = pg.evaluate("!ieEl('ie-ctb').hidden")
    itens = pg.evaluate("[...document.querySelectorAll('#ie-ctb button')].map(b => b.textContent)")
    ok(vis and 'Selecionar assunto' in itens and 'Remover fundo' in itens, f"barra aparece ao clicar na camada, com Selecionar assunto e Remover fundo ({itens})")
    a = pg.evaluate("(() => { const r = document.querySelector('#ie-ctb .ie-ctb-alca').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    v = pg.evaluate("(() => { const r = ieEl('ie-vista').getBoundingClientRect(); return [r.left, r.top]; })()")
    pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(v[0] + 120, v[1] + 90, steps=12); pg.mouse.up(); time.sleep(0.3)
    pos = pg.evaluate("iePref('barraCtxPos', null)")
    ok(pos and abs(pos['y'] - 90) < 20, f"arrastar pela alça leva a barra e grava o lugar ({pos})")
    pg.mouse.click(*T(600, 2200)); time.sleep(0.4)
    st = pg.evaluate("[ieEl('ie-ctb').style.left, ieEl('ie-ctb').style.top]")
    ok(st[1] == f"{round(pos['y'])}px" or abs(float(st[1][:-2]) - pos['y']) < 2, f"clicar noutra camada/lugar: a barra fica onde foi deixada ({st})")
    pg.click("#ie-ctb .ie-ctb-x"); time.sleep(0.2)
    esc = pg.evaluate("ieEl('ie-ctb').hidden")
    pg.mouse.click(*T(1000, 1200)); time.sleep(0.4)
    ok(esc and not pg.evaluate("ieEl('ie-ctb').hidden"), "× esconde só até o próximo clique numa camada")
    pg.dblclick("#ie-ctb .ie-ctb-alca"); time.sleep(0.3)
    ok(pg.evaluate("iePref('barraCtxPos', null)") is None, "duplo clique na alça volta a seguir a camada")
    pg.screenshot(path="D:/kanivete_testes/scripts/barra.png")
    pg.evaluate("KNV.automacao(false)")
    print("\nPASSOU" if not F else f"\nFALHOU ({len(F)})")
