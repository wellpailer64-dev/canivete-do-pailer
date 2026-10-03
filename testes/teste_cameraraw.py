"""Filtro Camera Raw em janela própria (app em --agente=9333; não mexa no mouse durante). Arrasta uma barra com o
mouse (resistência: anda metade do mouse), liga cada ajuste (Claridade, Textura, Névoa, Nitidez, Ruído, Granulação,
Vinheta, HSL, rodas, curva) e confere que a prévia muda, mede o tempo, dá OK, testa objeto inteligente, valores antigos
(filtro inteligente salvo antes) e automação. Prints em D:/kanivete_testes/scripts. Uso: python testes/teste_cameraraw.py [--recarregar]"""
import sys, time, json
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

FOTO = "D:/kanivete_testes/cena/foto.jpg"
falhas = []
def conferir(ok, nome, extra=""):
    print(("  ok    " if ok else "  FALHOU ") + nome + (f" ({extra})" if extra else ""))
    if not ok: falhas.append(nome)

with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    if "--recarregar" in sys.argv:
        pg.reload(); time.sleep(2)
    erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.wait_for_function("typeof ieCrJanela === 'function' && typeof KNV === 'object'", timeout=60000)
    pg.add_style_tag(content=".update-banner{display:none!important}")
    novo = """async () => { KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo(); KNV.novo('raw', 900, 1200);
        await KNV.colocar('%s', {nome: 'Foto', x: 0, y: 0, largura: 900}); KNV.automacao(false); }""" % FOTO
    pg.evaluate(novo)
    assin = "(c => { const d = ieCtx(c).getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 997) s = (s * 31 + d[i]) >>> 0; return s; })"
    s0 = pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)")

    pg.evaluate("() => { delete IE.prefs.crAbertas; ieCmd('f:cameraRaw'); }")
    pg.wait_for_function("IE._cr && IE._cr.ultimo()", timeout=30000); time.sleep(0.3)
    # barra com resistência: arrastar 100 px na Exposição (−5..5) anda metade do mouse
    tr = pg.locator(".ie-cr-sl[data-k='exp'] .ie-cr-tr").bounding_box()
    x0, y = tr["x"] + tr["width"] / 2, tr["y"] + tr["height"] / 2
    pg.mouse.move(x0, y); pg.mouse.down()
    for k in range(1, 21): pg.mouse.move(x0 + 5 * k, y); time.sleep(0.01)
    pg.mouse.up(); time.sleep(0.3)
    exp = pg.evaluate("IE._cr.v.exp"); esperado = (100 - 5) / tr["width"] * 10 * 0.5
    conferir(abs(exp - esperado) < 0.2, "barra anda metade do mouse", f"exp {exp:.2f}, esperado ~{esperado:.2f} (largura {tr['width']:.0f}px)")
    pg.dblclick(".ie-cr-sl[data-k='exp'] .ie-cr-tr"); time.sleep(0.2)
    conferir(pg.evaluate("IE._cr.v.exp") == 0, "duplo clique zera")

    # cada ajuste muda a prévia
    base = pg.evaluate(f"(IE._cr.calcular(), {assin}(IE._cr.ultimo().c))")
    casos = {"temp": 40, "clar": 60, "tex": 60, "nevoa": 50, "nitQ": 120, "ruidoL": 60, "ruidoC": 60, "grao": 50, "vig": -60,
             "hsl": {"r": [0, 60, -40]}, "rodas": {"s": [0.3, 0.2], "h": [-0.2, 0.3]}, "curva": [[0, 0], [128, 160], [255, 255]]}
    tempos = {}
    for k, val in casos.items():
        r = pg.evaluate(f"""(() => {{ const v = IE._cr.v, antes = JSON.stringify(v[{json.dumps(k)}]); v[{json.dumps(k)}] = {json.dumps(val)};
            const t = performance.now(); IE._cr.calcular(); const ms = performance.now() - t, s = {assin}(IE._cr.ultimo().c);
            v[{json.dumps(k)}] = JSON.parse(antes); return [s, Math.round(ms)]; }})()""")
        tempos[k] = r[1]
        conferir(r[0] != base, f"{k} muda a prévia", f"{r[1]} ms")
    # tudo ligado: print
    pg.evaluate(f"""(() => {{ const v = IE._cr.v; Object.assign(v, {{temp: 15, clar: 35, tex: 25, vib: 30, vig: -35, grao: 20, nitQ: 60, hi: -40, sh: 30}}); v.rodas.s = [0.25, 0.1]; v.rodas.h = [-0.15, 0.2];
        document.querySelectorAll('.ie-cr-sec').forEach(s => s.classList.add('aberta')); IE._cr.calcular(); }})()""")
    time.sleep(0.5)
    pg.screenshot(path="D:/kanivete_testes/scripts/cameraraw_janela.png")
    pg.keyboard.press("y"); time.sleep(0.3)
    pg.screenshot(path="D:/kanivete_testes/scripts/cameraraw_antes_depois.png")
    pg.keyboard.press("y")
    t = time.time(); pg.keyboard.press("Enter")
    pg.wait_for_function("!IE._cr", timeout=60000); time.sleep(0.2)
    conferir(pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)") != s0, "OK aplica na camada", f"{time.time() - t:.2f} s")

    # objeto inteligente + valores antigos (o formato de antes) + automação
    pg.evaluate(novo)
    pg.evaluate("() => { ieCmd('objetoInteligente'); }"); time.sleep(0.5)
    r = pg.evaluate(f"""async () => {{ const L = ieAtiva(IE.doc), a = {assin}(L.c);
        L.filtrosInt = [{{cmd: 'f:cameraRaw', titulo: 'Filtro Camera Raw', on: true, vals: {{temp: 30, tint: 0, exp: 0.5, ct: 20, hi: 0, sh: 0, wh: 0, bl: 0, vib: 0, sat: 0, fade: 0, sharp: 50, vig: -30, curva: [[0, 0], [255, 255]]}}}}];
        ieIntAtualizar(L); const b = {assin}(ieAtiva(IE.doc).c);
        KNV.automacao(true, {{padrao: 'primario'}}); await KNV.cmd('f:cameraRaw', {{clar: 50, grao: 30}}); KNV.automacao(false);
        const L2 = ieAtiva(IE.doc); return [a !== b, L2.filtrosInt.map(f => f.cmd).join(), {assin}(L2.c) !== b]; }}""")
    conferir(r[0], "valores antigos (filtro inteligente salvo) ainda funcionam")
    conferir(r[1] == "f:cameraRaw,f:cameraRaw" and r[2], "automação num objeto inteligente vira filtro inteligente", r[1])
    print("  tempos da prévia (ms):", tempos)
    print("erros JS:", erros[:3] or "nenhum")
    print("RESULTADO:", "PASSOU" if not falhas and not erros else f"FALHOU {falhas}")
    sys.exit(1 if falhas or erros else 0)
