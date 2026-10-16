"""Kanivete Encoder como Media Encoder (ke-arquivos.js + Functions/ke_arquivos.py) — app em --agente=9333:
arquivos do disco na fila da aba do Ke (sem projeto), cada um com a sua predefinição, renderizados em ordem; e um render
curto da Lux mandado para a fila. Uso: py -3.13 testes/teste_ke_media.py [video.mp4] [--sem-lux]"""
import os, sys, time
from playwright.sync_api import sync_playwright

VIDEO = next((a for a in sys.argv[1:] if not a.startswith('--')), r"D:\kanivete_testes\autoframe\quick_misto.mp4")
falhas = []
def ok(c, m):
    print(('OK  ' if c else 'FALHA ') + m)
    if not c: falhas.append(m)

with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    pg.on('dialog', lambda d: d.accept())
    J = pg.evaluate
    J("switchTool('kanivete-encoder')"); time.sleep(2)
    ok(J("!!document.querySelector('.ke-arq-cab select') && !!document.querySelector('.ke-arq-cab button') && !!document.querySelector('.ke-arq-cab button').offsetParent"),
       'predefinição e "+ Arquivos" visíveis no cabeçalho da fila')
    n0 = J("VEFILA.itens.length")
    ids = J(f"KE_API.adicionar([{VIDEO!r}], 'mp4_720')")
    J(f"KE_API.adicionar([{VIDEO!r}], 'mp3')"); time.sleep(1)
    itens = J("VEFILA.itens.filter(x => x.tipo === 'arquivo').map(x => ({p: x.cfg.preset, e: x.estado, d: x.dur}))")
    ok(len(itens) >= 2 and itens[-2]['p'] == 'mp4_720' and itens[-1]['p'] == 'mp3' and itens[-1]['d'] > 1, f'dois arquivos na fila com as suas predefinições {itens[-2:]}')
    ok(J("!!document.querySelector('.ke-item-preset')"), 'predefinição editável no item que espera')
    J("veFilaIniciar()")
    t0 = time.time()
    while time.time() - t0 < 180 and J("VEFILA.itens.some(x => x.tipo === 'arquivo' && (x.estado === 'espera' || x.estado === 'rodando'))"):
        time.sleep(1)
    res = J("VEFILA.itens.filter(x => x.tipo === 'arquivo').slice(-2).map(x => ({e: x.estado, s: x.saida, erro: x.erro}))")
    print(res)
    ok(all(r['e'] == 'pronto' and r['s'] and os.path.isfile(r['s']) for r in res), 'os dois renderizaram e os arquivos existem')
    ok(res[0]['s'].endswith('_720p.mp4') and res[1]['s'].endswith('.mp3'), 'nomes de saída pela predefinição')
    for r in res:
        try: os.remove(r['s'])
        except OSError: pass
    if '--sem-lux' not in sys.argv:
        J("LUX_API.nova()"); time.sleep(6)
        J("KE_API.lux('previa', {segundos: 0.1})"); time.sleep(3)
        it = J("(VEFILA.itens.filter(x => x.tipo === 'lux').slice(-1)[0] || {}).quadros")
        ok(it and it >= 1, f'render da Lux na fila ({it} quadros)')
        J("ve3dTelaFechar(); switchTool('kanivete-encoder')"); time.sleep(1)
        J("veFilaIniciar()")
        t0 = time.time()
        while time.time() - t0 < 400 and J("VEFILA.itens.some(x => x.tipo === 'lux' && (x.estado === 'espera' || x.estado === 'rodando'))"):
            time.sleep(2)
        r = J("(({estado, saida, erro}) => ({estado, saida, erro}))(VEFILA.itens.filter(x => x.tipo === 'lux').slice(-1)[0])")
        print(r)
        ok(r['estado'] == 'pronto' and r['saida'] and os.path.isfile(r['saida']), f'Lux renderizou pela fila do Ke em {round(time.time() - t0)} s')
    J("VEFILA.itens = VEFILA.itens.filter(x => !x.tipo); veFilaRender()")
print('FALHAS:', len(falhas)); sys.exit(1 if falhas else 0)
