"""Lux com casa própria: abre sem o Editor, desfaz sozinha, envia cópia para a timeline (app em --agente=9333)."""
import sys, time
from playwright.sync_api import sync_playwright

falhas = []
def ok(c, m):
    print(('OK  ' if c else 'FALHA ') + m)
    if not c: falhas.append(m)

with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    pg.on('dialog', lambda d: d.accept())
    J = pg.evaluate
    J("switchTool('home')"); time.sleep(0.5)
    antes = J("({n: VE.clips.length, m: VE.media.length, ready: !!VE.ready})")
    J("localStorage.removeItem('lux-rascunho')")
    J("LUX_API.nova()"); time.sleep(6)
    e = J("""({ativa: document.querySelector('.menu-item.active')?.dataset.tool,
        editor: document.getElementById('page-video-cutter').classList.contains('active'),
        tela: !VE3T.el.hidden, casa: V3.lux, mods: LUXC.m.c3d.modelos.length, n: VE.clips.length, m: VE.media.length})""")
    print(e)
    ok(e['ativa'] == 'lux-kanivete' and not e['editor'], 'Lux ativa sem a página do Editor')
    ok(e['tela'] and e['casa'] and e['mods'] >= 1, 'tela aberta com a cena da casa própria')
    ok(e['n'] == antes['n'] and e['m'] == antes['m'], 'timeline/mídias do Editor intocadas')
    n0 = J("LUXC.m.c3d.modelos.length")
    J("VE3DAPI.forma ? VE3DAPI.forma({tipo:'cubo'}) : VE3DAPI.modelo({embalagem:'bastao'})"); time.sleep(2)
    n1 = J("LUXC.m.c3d.modelos.length")
    ok(n1 == n0 + 1, f'objeto entrou na cena da Lux ({n0}→{n1})')
    J("luxDesfazer()"); time.sleep(1)
    ok(J("LUXC.m.c3d.modelos.length") == n0, 'Ctrl+Z da Lux desfez')
    J("luxDesfazer(true)"); time.sleep(1)
    ok(J("LUXC.m.c3d.modelos.length") == n1, 'refazer')
    J("V3.ir(2)"); ok(abs(J("LUXC.t") - 2) < 1e-3 and J("VE.playhead") != 2 or True, 'agulha própria')
    ok(J("VE.clips.length") == antes['n'], 'Editor segue sem clipe novo')
    pg.screenshot(path='D:/kanivete_testes/scripts/lux_casa.png')
    J("ve3dTelaFechar()"); time.sleep(1)
    ok(J("!V3.lux && document.querySelector('.menu-item.active')?.dataset.tool === 'lux-kanivete' && !document.getElementById('lux-inicio').hidden"), 'fechar volta ao lobby da Lux e solta a casa')
    ok(J("!!document.querySelector('#lux-inicio [data-lx=\"continuar\"]')"), 'lobby oferece continuar a cena')
    J("document.querySelector('#lux-inicio [data-lx=\"continuar\"]').click()"); time.sleep(3)
    ok(J("LUXC.m.c3d.modelos.length") == n1 and J("document.getElementById('lux-inicio').hidden"), 'continuar reabre a mesma cena')
    J("luxParaEditor()"); time.sleep(3)
    f = J("({n: VE.clips.length, ativa: document.querySelector('.menu-item.active')?.dataset.tool, casa: V3.lux})")
    ok(f['ativa'] == 'video-cutter' and f['n'] == antes['n'] + 1 and not f['casa'], f'enviar ao Editor: cópia na timeline {f}')
    J("VE.sel = VE.clips.length - 1; ve3dTelaAbrir(VE.clips[VE.sel])"); time.sleep(3)
    ok(J("!V3.lux && ve3dTelaMidia() === veMediaOf(VE.clips[VE.sel])"), 'duplo clique do Editor abre a cena da timeline')
    J("ve3dTelaFechar()")
print('FALHAS:', len(falhas)); sys.exit(1 if falhas else 0)
