"""Pincel do Photo Kanivete: traço macio liso e pintura fluida em documento grande (app em --agente=9333).

    py -3.13 testes/teste_pincel.py

1. Traço com dureza 0/30 na máscara: a ondulação ao longo do traço (o "colar de bolinhas" da ponta antiga) tem de ficar
   abaixo de 3/255 (antes: 18) e o traço macio largo (no meio da borda, 25 px de um pincel de 100, acima de 150).
2. Arraste de verdade com o mouse pintando a máscara num 8640×1440 (um carrossel): soma das tarefas longas do navegador
   abaixo de 1,5 s (antes: 8,2 s — status lendo a cor sob o mouse a cada movimento, miniatura e cache da camada).
Sai com 1 se reprovar.
"""
import base64
import math
import sys
import time

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
FOTO = "D:/kanivete_testes/cena/foto.jpg"
erros = []


def conferir(ok, nome, det=""):
    print(("  ok    " if ok else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not ok:
        erros.append(nome)


with sync_playwright() as p:
    b = None
    for _ in range(90):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    pg.wait_for_function("window.KNV && typeof ieTracoIniciar === 'function'", timeout=90000)
    pg.evaluate("() => { if (typeof abrirFerramenta === 'function') abrirFerramenta('editor-imagem'); }")
    time.sleep(2)

    # 1. traço macio
    r = pg.evaluate("""async () => {
        KNV.automacao(true, {padrao: 'primario'});
        KNV.novo('pincel', 1200, 400, 'branco');
        const d = IE.doc, L = ieAtiva(d);
        await ieCmd('mascaraOcultar'); d.mascaraAlvo = true; IE.cor = ['#ffffff', '#000000'];
        for (const [dureza, y] of [[0, 100], [30, 280]]) {
            Object.assign(IE.op.pincel, { tam: 100, dureza, opac: 100, fluxo: 100, espaco: 18, varTam: 0, varAng: 0, dispersao: 0 });
            ieTracoIniciar({ x: 100, y }, {}, d, 'pincel');
            for (let i = 1; i <= 50; i++) ieTracoPara({ x: 100 + 1000 * i / 50, y });
            ieTracoFim();
        }
        const c = ieCanvas(d.w, d.h), x = ieCtx(c); x.fillStyle = '#000'; x.fillRect(0, 0, d.w, d.h); x.drawImage(L.m.c, L.m.x, L.m.y);
        KNV.automacao(false);
        return c.toDataURL('image/png');
    }""")
    a = np.asarray(Image.open(__import__("io").BytesIO(base64.b64decode(r.split(",", 1)[1]))).convert("L")).astype(float)
    for dureza, y in ((0, 100), (30, 280)):
        meio = a[y, 300:900]
        conferir(meio.max() - meio.min() < 3, f"dureza {dureza}: traço liso, sem bolinhas", f"ondulação {meio.max() - meio.min():.0f}")
    conferir(a[125, 300:900].mean() > 150, "dureza 0: traço macio largo (25 px do centro)", f"{a[125, 300:900].mean():.0f}")

    # 2. arraste num documento grande
    pg.evaluate(f"""async () => {{
        KNV.automacao(true, {{padrao: 'primario'}});
        KNV.novo('grande', 8640, 1440, 'branco');
        const d = IE.doc; await KNV.colocar('{FOTO}', {{x: 0, y: 0, largura: 4320}}); ieRasterizar(ieAtiva(d));
        await ieCmd('mascaraOcultar'); d.mascaraAlvo = true; IE.cor = ['#ffffff', '#000000'];
        Object.assign(IE.op.pincel, {{ tam: 300, dureza: 0, opac: 100, fluxo: 100, espaco: 18, varTam: 0 }});
        ieEscolherFerr('pincel'); ieAjustarVista(d);
        KNV.automacao(false);
        window._longas = [];
        new PerformanceObserver(l => {{ for (const e of l.getEntries()) window._longas.push(e.duration); }}).observe({{ type: 'longtask' }});
    }}""")
    time.sleep(1)
    x0, y0, w, h = pg.evaluate("() => { const r = document.getElementById('ie-vista').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
    pg.evaluate("() => { window._longas = []; }")
    pg.mouse.move(x0 + w * 0.15, y0 + h * 0.5)
    pg.mouse.down()
    for i in range(1, 121):
        pg.mouse.move(x0 + w * (0.15 + 0.7 * i / 120), y0 + h * (0.5 + 0.25 * math.sin(i / 10)))
        time.sleep(1 / 120)
    pg.mouse.up()
    time.sleep(0.6)
    longas = pg.evaluate("() => window._longas")
    conferir(sum(longas) < 1500, "documento 8640×1440: pincel na máscara sem travar", f"tarefas longas {sum(longas):.0f} ms em {len(longas)}")
    erros_js = pg.evaluate("() => (window._ieErros || []).length")
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
