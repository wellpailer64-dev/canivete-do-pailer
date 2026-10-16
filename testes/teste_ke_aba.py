"""Kanivete Encoder na aba própria (editor-encoder.js keAoTrocar) — app em --agente=9333:
sem projeto mostra fila/monitor sem abrir o Vídeo; com projeto mostra o formulário; põe na fila; voltar ao Vídeo devolve
a janela (fechada) e ela abre solta de novo lá."""
import sys, time
from playwright.sync_api import sync_playwright

falhas = []
def ok(c, m):
    print(('OK  ' if c else 'FALHA ') + m)
    if not c: falhas.append(m)

with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    J = pg.evaluate
    estado = """() => { const el = document.getElementById('ve-export'), r = el.getBoundingClientRect();
        return { pai: el.parentNode.id, pagina: el.classList.contains('ke-pagina'), vazio: el.classList.contains('ke-vazio'),
                 oculto: el.hidden, w: r.width, h: r.height, aba: document.querySelector('.menu-item.active')?.dataset.tool,
                 video: document.getElementById('page-video-cutter').classList.contains('active'),
                 form: !!(document.getElementById('ve-export-form') && document.getElementById('ve-export-form').offsetParent),
                 monitor: !!document.getElementById('ke-monitor') }; }"""
    J("switchTool('home')"); time.sleep(0.5)
    if not J("VE.ready"):
        J("switchTool('kanivete-encoder')"); time.sleep(2)
        e = J(estado); print(e)
        ok(e['aba'] == 'kanivete-encoder' and not e['video'], 'aba do Ke sem abrir o Vídeo')
        ok(e['pai'] == 'ke-casa' and e['pagina'] and e['vazio'] and not e['oculto'] and e['w'] > 600, 'sem projeto: janela encaixada na página')
        ok(e['monitor'] and not e['form'], 'sem projeto: monitor sim, formulário não')
        J("switchTool('home')"); time.sleep(0.5)
        J("switchTool('video-cutter')"); time.sleep(1)
        J("veCriarProjetoVazio({quieto: true})"); time.sleep(2)
    ok(J("VE.ready"), 'projeto aberto no Vídeo')
    J("switchTool('kanivete-encoder')"); time.sleep(2)
    e = J(estado); print(e)
    ok(e['pai'] == 'ke-casa' and not e['vazio'] and not e['oculto'] and e['form'], 'com projeto: formulário na aba do Ke')
    n0 = J("VEFILA.itens.length")
    J("VEFILA_API.adicionar('teste_aba')"); time.sleep(4)
    ok(J("VEFILA.itens.length") == n0 + 1, 'item entrou na fila pela aba')
    J("switchTool('video-cutter')"); time.sleep(1)
    e = J(estado); print(e)
    ok(e['pai'] != 'ke-casa' and e['oculto'] and not e['pagina'], 'voltar ao Vídeo devolve a janela fechada')
    J("veOpenExport()"); time.sleep(1)
    e = J(estado)
    ok(not e['oculto'] and not e['pagina'] and e['w'] < 3000, 'no Vídeo ela abre solta como antes')
    J("veCloseExport()")
    J("VEFILA.itens.filter(x => x.estado === 'espera').forEach(x => x.estado = 'cancelado'); veFilaRender()")
print('FALHAS:', len(falhas)); sys.exit(1 if falhas else 0)
