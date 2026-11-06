"""Folha com quadros do monitor do Vídeo Kanivete, sem exportar: conferir enquadramento, legenda e tarjas.
    py -3.13 tools/agente/quadros_monitor.py 1.5,20,45 saida.jpg [--porta 9333] [--timeline "Reels A"]
"""
import sys as _sys_pa, os as _os_pa; _sys_pa.path.append(_os_pa.path.join(_os_pa.path.dirname(_os_pa.path.abspath(__file__)), '..')); from porta_agente import porta as _porta_agente  # porta viva (agente.json)
import argparse
import io

from PIL import Image
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("tempos")
ap.add_argument("saida")
ap.add_argument("--porta", type=int, default=_porta_agente(9333))
ap.add_argument("--timeline", default="")
a = ap.parse_args()
ALTURA = 430

with sync_playwright() as pw:
    nav = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
    pg = [p for c in nav.contexts for p in c.pages if "index.html" in p.url and p.evaluate("typeof VE") != "undefined"][0]   # duas index.html: só a do editor tem VE
    if a.timeline:
        pg.evaluate("n => { const q = VE.sequences.find(s => s.name === n); if (!q) throw new Error('timeline não achada'); if (VE.activeSequence !== q.id) veSeqAplicar(q); }", a.timeline)
    w, h = pg.evaluate("[VE.seqW, VE.seqH]")
    ims = []
    for t in (float(x) for x in a.tempos.split(",")):
        pg.evaluate("t => { VE.playhead = t; if (typeof veSeek === 'function') veSeek(t); veRefresh(); }", t)
        pg.wait_for_timeout(1300)
        im = Image.open(io.BytesIO(pg.locator("#ve-screen").screenshot())).convert("RGB")
        meia = int(im.height * w / h / 2)   # o #ve-screen tem margem escura dos lados
        ims.append(im.crop((im.width // 2 - meia, 0, im.width // 2 + meia, im.height)).resize((int(ALTURA * w / h), ALTURA)))
    nav.close()
folha = Image.new("RGB", (sum(i.width for i in ims), ALTURA))
x = 0
for i in ims:
    folha.paste(i, (x, 0))
    x += i.width
folha.save(a.saida, quality=82)
print(a.saida, folha.size)
