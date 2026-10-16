"""Lobby do Photo/Vetor não cobre a janela Novo documento nem os menus (app 9333)."""
import sys, time
from playwright.sync_api import sync_playwright
falhas = []
def ok(c, m):
    print(('OK  ' if c else 'FALHA ') + m)
    if not c: falhas.append(m)
with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    J = pg.evaluate
    for tool, ini, modal in (('editor-imagem', 'ie-inicio', 'ie-modal'), ('vetor-kanivete', 'vk-inicio', 'vk-modal')):
        J(f"switchTool('{tool}')"); time.sleep(2)
        J(f"document.querySelector('#{ini} [data-kl=\"novo\"]').click()"); time.sleep(1.2)
        topo = J(f"(() => {{ const m = document.getElementById('{modal}'); const d = m && m.querySelector('.ie-dlg'); if (!d || m.hidden) return 'sem janela'; const r = d.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + 20); return d.contains(e) ? 'janela por cima' : 'coberta por ' + (e && (e.id || e.className)); }})()")
        ok(topo == 'janela por cima', f'{tool}: Novo documento aparece por cima do lobby ({topo})')
        J("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))"); time.sleep(0.5)
        J(f"document.getElementById('{modal}').hidden = true")
        J(f"document.querySelector('#page-{tool} .ie-top [data-menu], #page-{tool} .ie-top .ie-menu-item, #page-{tool} .ie-top nav button')?.click()"); time.sleep(0.6)
        menu = J(f"(() => {{ const p = [...document.querySelectorAll('#page-{tool} .ie-pop')].find(x => !x.hidden && x.offsetParent); if (!p) return 'sem menu'; const r = p.getBoundingClientRect(); const e = document.elementFromPoint(r.x + 10, r.y + r.height / 2); return p.contains(e) ? 'menu por cima' : 'coberto por ' + (e && (e.id || e.className)); }})()")
        ok(menu in ('menu por cima', 'sem menu'), f'{tool}: menu do topo ({menu})')
        J("document.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}))"); time.sleep(0.3)
print('FALHAS:', len(falhas)); sys.exit(1 if falhas else 0)
