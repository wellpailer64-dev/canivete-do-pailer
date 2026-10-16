"""Parar da fila do Ke interrompe o Blender (item da Lux): app em --agente=9333."""
import glob, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

falhas = []
def ok(c, m):
    print(('OK  ' if c else 'FALHA ') + m)
    if not c: falhas.append(m)
def blender_rodando():
    r = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq blender.exe'], capture_output=True, text=True)
    return 'blender.exe' in r.stdout.lower()

with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    pg.on('dialog', lambda d: d.accept())
    J = pg.evaluate
    J("LUX_API.nova()"); time.sleep(6)
    J("VE3DAPI.camera ? 0 : 0")
    J("KE_API.lux('final', {segundos: 2})"); time.sleep(4)
    J("ve3dTelaFechar(); switchTool('kanivete-encoder')"); time.sleep(1)
    J("veFilaIniciar()")
    t0 = time.time()
    while time.time() - t0 < 120 and not J("(VEFILA.atual && VEFILA.atual.pct > 0) || false"):
        time.sleep(1)
    time.sleep(3)
    ok(blender_rodando(), 'Blender rodando o item da Lux')
    J("veFilaParar()")
    t1 = time.time()
    while time.time() - t1 < 30 and J("VEFILA.itens.some(x => x.tipo === 'lux' && x.estado === 'rodando')"):
        time.sleep(0.5)
    est = J("VEFILA.itens.filter(x => x.tipo === 'lux').slice(-1)[0].estado")
    ok(est == 'cancelado', f'item ficou cancelado em {round(time.time() - t1, 1)} s ({est})')
    time.sleep(2)
    ok(not blender_rodando(), 'Blender fechado')
    sobra = glob.glob(r'D:\kanivete_testes\cache_teste\Estudio\*_quadros')
    ok(not sobra, f'sem quadros pela metade ({sobra})')
    J("VEFILA.itens = VEFILA.itens.filter(x => !x.tipo); VEFILA.pausar = false; veFilaRender()")
print('FALHAS:', len(falhas)); sys.exit(1 if falhas else 0)
