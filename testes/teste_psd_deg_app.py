"""Uso: py -3.13 testes/teste_psd_deg_app.py [--photoshop] (app em --agente=9333).
Photo Kanivete (--agente=9333): um preenchimento de degradê por estilo (+ um com seleção), cada um num PSD; com
'--photoshop' abre cada um no Photoshop, redesenha a partir do GdFl e compara com o desenho do Photo."""
import base64, json, os, sys, time
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
P = os.path.join(os.environ.get("TEMP") or "D:/kanivete_testes/tmp", "canivete_teste_psd_deg") + "/"
os.makedirs(P, exist_ok=True)
G3 = {"cores": [[0, "#1e78dc"], [0.5, "#fac828"], [1, "#dc1e1e"]], "ops": [[0, 100], [1, 100]]}
GT = {"cores": [[0, "#ffffff"], [1, "#28a05a"]], "ops": [[0, 100], [1, 0]]}
CASOS = [("linear30", dict(estilo="linear", ang=30), G3, None), ("radial", dict(estilo="radial", ang=90, escala=80), GT, None),
         ("angulo", dict(estilo="angulo", ang=45), G3, None), ("refletido", dict(estilo="refletido", ang=0), G3, None),
         ("diamante", dict(estilo="diamante", ang=0), G3, None), ("linear_sel", dict(estilo="linear", ang=90), G3, (300, 100, 500, 300))]
with sync_playwright() as p:
    for _ in range(90):
        try: b = p.chromium.connect_over_cdp("http://127.0.0.1:9333"); break
        except Exception: time.sleep(1)
    pg = b.contexts[0].pages[0]
    pg.wait_for_function("window.pywebview && window.pywebview.api && window.KNV", timeout=90000)
    pg.evaluate("() => { if (typeof abrirFerramenta === 'function') abrirFerramenta('editor-imagem'); }"); time.sleep(2)
    for nome, op, g, sel in CASOS:
        r = pg.evaluate(f"""async () => {{
            KNV.automacao(true, {{padrao: 'erro'}});
            KNV.novo({json.dumps(nome)}, 600, 400, 'branco');
            {"KNV.selecionar(%d, %d, %d, %d);" % (sel[0], sel[1], sel[2] - sel[0], sel[3] - sel[1]) if sel else ""}
            await KNV.preenchimentoDegrade({json.dumps(g["cores"])}, {{...{json.dumps(op)}, ops: {json.dumps(g["ops"])}, nome: 'Deg'}});
            ieSelNada();
            const ok = await ieSalvar(false, {json.dumps(P + nome + ".psd")});
            ieCompor(IE.doc, ieRDoc(IE.doc));
            const url = IE.doc.comp.toDataURL('image/png'), L = ieAtiva(IE.doc);
            KNV.automacao(false);
            return {{ ok, url, pre: L.pre, m: !!L.m, avisos: IE.doc.avisosSalvar || [] }};
        }}""")
        open(P + nome + "_photo.png", "wb").write(base64.b64decode(r["url"].split(",", 1)[1]))
        print(f"{nome:11s} salvou={r['ok']} máscara={r['m']} avisos={r['avisos']}")
if "--photoshop" not in sys.argv:
    sys.exit(0)
import win32com.client
ps = win32com.client.Dispatch("Photoshop.Application"); ps._FlagAsMethod("DoJavaScript")
ruins = []
for nome, *_ in CASOS:
    png = P + nome + "_photoshop.png"
    r = ps.DoJavaScript(r'''app.displayDialogs = DialogModes.NO; var res;
try { var d = app.open(new File("%s")); d.saveAs(new File("%s"), new PNGSaveOptions(), true); d.close(SaveOptions.DONOTSAVECHANGES); res = "ok"; } catch (e) { res = "ERRO " + e; } res;''' % (P + nome + ".psd", png))
    a = np.asarray(Image.open(P + nome + "_photo.png").convert("RGB")).astype(int)
    c = np.asarray(Image.open(png).convert("RGB")).astype(int) if os.path.exists(png) else None
    if c is None:
        print(f"{nome:11s} Photoshop: {r}"); continue
    dif = np.abs(a - c)
    print(f"{nome:11s} Photoshop: {r} | diferença média {dif.mean():.2f} | máx {int(dif.max())} | pixels > 24: {int((dif.max(2) > 24).sum())}")
    if dif.mean() > 1.0:   # 2026-10-07: todos ≤ 0,5 (o angular só difere na linha da emenda)
        ruins.append(nome)
    Image.fromarray(np.concatenate([a, c], 1).astype(np.uint8)).save(P + nome + "_comparar.png")
print("REPROVADO: " + ", ".join(ruins) if ruins else "OK")
sys.exit(1 if ruins else 0)
