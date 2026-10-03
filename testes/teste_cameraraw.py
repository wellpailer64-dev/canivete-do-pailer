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
    # camada de ajuste Camera Raw: muda o que está embaixo, ao vivo, sem emenda ao redesenhar só uma região
    pg.evaluate(novo)
    r = pg.evaluate(f"""async () => {{
        const doc = IE.doc, comp = () => {{ ieCompor(doc); return {assin}(doc.comp); }}, a = comp();
        KNV.automacao(true, {{padrao: 'primario'}}); await KNV.ajuste('cameraRaw', {{clar: 60, tex: 40, exp: 0.4, vig: -40, grao: 20, nevoa: 30}}); KNV.automacao(false);
        const L = ieAtiva(doc), t = performance.now(), b = comp(), ms = performance.now() - t;
        L.ajVals.sat = 25; L.ajuste = IE_AJ_CAMADAS.cameraRaw.aj(L.ajVals); const t2 = performance.now(); comp(); const ms2 = performance.now() - t2; L.ajVals.sat = 0; L.ajuste = IE_AJ_CAMADAS.cameraRaw.aj(L.ajVals); comp();
        const cheio = ieCtx(doc.comp).getImageData(300, 400, 200, 200).data.slice();
        ieCompor(doc, {{x: 350, y: 450, w: 100, h: 100}});   // região pequena (como ao pintar)
        const parte = ieCtx(doc.comp).getImageData(300, 400, 200, 200).data;
        let dif = 0; for (let i = 0; i < parte.length; i++) dif = Math.max(dif, Math.abs(parte[i] - cheio[i]));
        L.visivel = false; const c = comp(); L.visivel = true; ieCompor(doc);
        return [L.tipo, L.ajChave, a !== b, c === a, dif, Math.round(ms), Math.round(ms2)]; }}""")
    conferir(r[0] == "ajuste" and r[1] == "cameraRaw", "KNV.ajuste('cameraRaw') cria a camada de ajuste")
    conferir(r[2] and r[3], "muda o que está embaixo e some ao esconder")
    conferir(r[4] <= 2, "sem emenda ao redesenhar só uma região", f"diferença máxima {r[4]}; composição inteira {r[5]} ms, mexendo numa barra {r[6]} ms")
    # Propriedades: barras rápidas mexem ao vivo; o botão abre a janela com o que está embaixo
    pg.evaluate("ieUiProps()"); time.sleep(0.3)
    antes = pg.evaluate(f"{assin}(IE.doc.comp)")
    tr = pg.locator(".ie-cr-props .ie-cr-sl[data-k='sat'] .ie-cr-tr").bounding_box()
    conferir(tr is not None, "barras no painel Propriedades")
    if tr:
        x0, y = tr["x"] + tr["width"] / 2, tr["y"] + tr["height"] / 2
        pg.mouse.move(x0, y); pg.mouse.down()
        for k in range(1, 16): pg.mouse.move(x0 - 6 * k, y); time.sleep(0.01)
        pg.mouse.up(); time.sleep(0.6)
        conferir(pg.evaluate("ieAtiva(IE.doc).ajVals.sat") < -5 and pg.evaluate(f"{assin}(IE.doc.comp)") != antes, "barra do Propriedades muda a imagem ao vivo", f"sat {pg.evaluate('ieAtiva(IE.doc).ajVals.sat')}")
        pg.screenshot(path="D:/kanivete_testes/scripts/cameraraw_camada.png")
        pg.click(".ie-cr-abrir"); pg.wait_for_function("IE._cr && IE._cr.ultimo()", timeout=30000)
        conferir(pg.evaluate("IE._cr.v.clar") == 60, "a janela abre com os valores da camada")
        pg.evaluate("IE._cr.v.clar = 10"); pg.keyboard.press("Enter"); pg.wait_for_function("!IE._cr"); time.sleep(0.3)
        conferir(pg.evaluate("ieAtiva(IE.doc).ajVals.clar") == 10, "OK da janela grava na camada")
    print("  tempos da prévia (ms):", tempos)
    print("erros JS:", erros[:3] or "nenhum")
    print("RESULTADO:", "PASSOU" if not falhas and not erros else f"FALHOU {falhas}")
    sys.exit(1 if falhas or erros else 0)
