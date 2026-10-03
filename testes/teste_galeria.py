"""Filtro > Galeria de filtros (app em --agente=9333). Abre a janela, espera as miniaturas, troca de filtro, empilha
duas camadas de efeito e dá OK; depois aplica cada um dos 47 filtros por automação numa foto, medindo o tempo e
conferindo que mudou a imagem; por fim num objeto inteligente (vira filtro inteligente). Prints em D:/kanivete_testes/scripts.
Uso: python testes/teste_galeria.py [--recarregar]"""
import sys, time
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
    pg.wait_for_function("typeof ieGalJanela === 'function' && typeof KNV === 'object'", timeout=60000)
    novo = """async () => { KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo(); KNV.novo('galeria', 900, 1200);
        await KNV.colocar('%s', {nome: 'Foto', x: 0, y: 0, largura: 900}); KNV.automacao(false); }""" % FOTO
    pg.add_style_tag(content='.update-banner{display:none!important}')   # o aviso de versão cobre o canto
    pg.evaluate(novo)
    assin = "(c => { const d = ieCtx(c).getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 997) s = (s * 31 + d[i]) >>> 0; return s; })"
    s0 = pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)")

    pg.evaluate("() => { delete IE.prefs.galeria; ieCmd('f:galeria'); }")   # sem a pilha lembrada da última vez
    pg.wait_for_function("IE._gal && IE._gal.ultimo()", timeout=30000)
    t = time.time()
    pg.wait_for_function("[...document.querySelectorAll('.ie-gal-mini canvas')].every(c => { const d = c.getContext('2d').getImageData(48, 36, 1, 1).data; return d[3] > 0; })", timeout=120000)
    conferir(True, "miniaturas prontas", f"{time.time() - t:.1f} s")
    pg.click(".ie-gal-mini[data-f='aquarela']"); time.sleep(1.5)
    conferir(pg.evaluate("IE._gal.pilha[IE._gal.pilha.length - 1].f") == "aquarela", "clicar na miniatura troca o filtro")
    pg.click("[data-p='nova']"); pg.click(".ie-gal-mini[data-f='texturizador']"); time.sleep(1.5)
    conferir(pg.evaluate("IE._gal.pilha.map(x => x.f).join()") == "aquarela,texturizador", "duas camadas de efeito")
    pg.screenshot(path="D:/kanivete_testes/scripts/galeria_janela.png")
    print("  prévia:", round(pg.evaluate("IE._gal.ultimo().ms")), "ms")
    pg.keyboard.press("Enter")
    pg.wait_for_function("!IE._gal", timeout=60000); time.sleep(0.3)
    conferir(pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)") != s0, "OK aplica na camada")

    # cada filtro por automação
    r = pg.evaluate(f"""async () => {{
        KNV.automacao(true, {{padrao: 'primario'}});
        const base = ieAtiva(IE.doc).c, bx = ieAtiva(IE.doc).x, by = ieAtiva(IE.doc).y, s0 = {assin}(base), out = [];
        for (const id of Object.keys(IE_GAL_F)) {{
            const A = ieAtiva(IE.doc); A.c = base; A.x = bx; A.y = by; ieInvalidar(A);
            const t = performance.now(); let erro = null;
            try {{ await KNV.cmd('f:galeria', {{pilha: [{{f: id}}]}}); }} catch (e) {{ erro = String(e).slice(0, 150); }}
            out.push([id, Math.round(performance.now() - t), erro, {assin}(ieAtiva(IE.doc).c) !== s0]);
        }}
        KNV.automacao(false); return out; }}""")
    for f, ms, erro, mudou in r:
        if erro or not mudou: conferir(False, f"filtro {f}", erro or "não mudou a imagem")
    print(f"  {len(r)} filtros; mais lentos (900×1200): {sorted(r, key=lambda x: -x[1])[:6]}")

    # objeto inteligente
    pg.evaluate(novo)
    pg.evaluate("() => { ieCmd('objetoInteligente'); }"); time.sleep(0.5)
    pg.evaluate("() => { ieCmd('f:galeria'); }"); pg.wait_for_function("IE._gal && IE._gal.ultimo()", timeout=30000)
    pg.evaluate("IE._gal.escolherFiltro('bordasPost')"); time.sleep(0.5)
    pg.keyboard.press("Enter"); pg.wait_for_function("!IE._gal", timeout=60000); time.sleep(0.3)
    fi = pg.evaluate("(() => { const L = ieAtiva(IE.doc); return [L.tipo, (L.filtrosInt || []).map(f => f.cmd + ':' + f.vals.pilha.map(x => x.f))]; })()")
    conferir(fi[0] == "inteligente" and len(fi[1]) == 1 and fi[1][0].startswith("f:galeria:") and fi[1][0].endswith("bordasPost"), "objeto inteligente: filtro inteligente", str(fi))
    print("erros JS:", erros[:3] or "nenhum")
    print("RESULTADO:", "PASSOU" if not falhas and not erros else f"FALHOU {falhas}")
    sys.exit(1 if falhas or erros else 0)
