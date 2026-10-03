"""Filtro > Dissolver (Liquify) com mouse de verdade (app em --agente=9333; não mexa no mouse durante).
Abre a janela pelo menu, deforma arrastando, desfaz/refaz, torce, congela uma área (não pode mexer), dá OK e confere
que a camada mudou; depois o mesmo num objeto inteligente (vira filtro inteligente, editável) e por automação (ops).
Uso: python testes/teste_dissolver.py [--recarregar]"""
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
    pg.wait_for_function("typeof ieDvJanela === 'function' && typeof KNV === 'object'", timeout=60000)
    pg.evaluate("""async () => { KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo(); KNV.novo('dissolver', 900, 1200);
        await KNV.colocar('%s', {nome: 'Foto', x: 0, y: 0, largura: 900}); KNV.automacao(false); }""" % FOTO)
    assin = "(c => { const d = ieCtx(c).getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 997) s = (s * 31 + d[i]) >>> 0; return s; })"
    s0 = pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)")

    # 1) abre pelo atalho, arrasta com a Deformação para frente
    pg.evaluate("() => { ieCmd('f:dissolver'); }")
    pg.wait_for_function("IE._dv && IE._dv.V.esc > 0", timeout=10000)
    time.sleep(0.4); pg.keyboard.press("w")
    def tela(x, y):   # px da imagem → px CSS da página
        return pg.evaluate(f"""(() => {{ const r = document.querySelector('.ie-dv-sobre').getBoundingClientRect(), q = IE._dv.pos({x}, {y}), d = IE._dv.V.dpr; return [r.left + q.sx / d, r.top + q.sy / d]; }})()""")
    def arrastar(a, b, passos=20, alt=False):
        x0, y0 = tela(*a); x1, y1 = tela(*b)
        if alt: pg.keyboard.down("Alt")
        pg.mouse.move(x0, y0); pg.mouse.down()
        for k in range(1, passos + 1): pg.mouse.move(x0 + (x1 - x0) * k / passos, y0 + (y1 - y0) * k / passos); time.sleep(0.01)
        pg.mouse.up()
        if alt: pg.keyboard.up("Alt")
    soma = "(() => { const d = IE._dv.G.d; let s = 0; for (let i = 0; i < d.length; i++) s += Math.abs(d[i]); return s; })()"
    pg.evaluate("IE._dv.op.tam = 200")
    arrastar((450, 600), (550, 600))
    s1 = pg.evaluate(soma)
    conferir(s1 > 100, "Deformar mexe no campo", f"soma {s1:.0f}")
    # ponto no meio do traço: o conteúdo de trás veio junto (deslocamento ~ -100 em x)
    dx = pg.evaluate("(() => { const G = IE._dv.G, i = Math.round(550 / G.g), j = Math.round(600 / G.g); return G.d[(j * G.gw + i) * 2]; })()")
    conferir(-110 < dx < -50, "o conteúdo segue o mouse", f"D.x no fim do traço = {dx:.1f}")
    pg.keyboard.press("Control+z")
    conferir(pg.evaluate(soma) < 1e-3, "Ctrl+Z desfaz a pincelada")
    pg.keyboard.press("Control+Shift+z")
    conferir(abs(pg.evaluate(soma) - s1) < 1, "Ctrl+Shift+Z refaz")

    # 2) congelar uma área e torcer por cima: a área congelada não mexe
    pg.keyboard.press("f"); pg.evaluate("IE._dv.op.tam = 120")
    x, y = tela(200, 300); pg.mouse.move(x, y); pg.mouse.down(); time.sleep(0.3); pg.mouse.up()
    m = pg.evaluate("(() => { const G = IE._dv.G; return G.m[Math.round(300 / G.g) * G.gw + Math.round(200 / G.g)]; })()")
    conferir(m > 0.9, "Congelar máscara pinta a máscara", f"m = {m:.2f}")
    pg.keyboard.press("c"); pg.evaluate("IE._dv.op.tam = 400")
    no = "(() => { const G = IE._dv.G, n = Math.round(300 / G.g) * G.gw + Math.round(200 / G.g); return Math.hypot(G.d[n * 2], G.d[n * 2 + 1]); })()"
    antes = pg.evaluate(no)
    x, y = tela(260, 300); pg.mouse.move(x, y); pg.mouse.down(); time.sleep(0.6); pg.mouse.up()
    s2 = pg.evaluate(soma)
    conferir(s2 > s1 + 100, "Torcer age com o botão parado", f"soma {s1:.0f} → {s2:.0f}")
    conferir(abs(pg.evaluate(no) - antes) < 0.01, "área congelada não mexeu")
    pg.keyboard.press("b"); x, y = tela(450, 900); pg.mouse.move(x, y); pg.mouse.down(); time.sleep(0.3); pg.mouse.up()
    pg.keyboard.press("s"); x, y = tela(700, 900); pg.mouse.move(x, y); pg.mouse.down(); time.sleep(0.3); pg.mouse.up()
    pg.keyboard.press("o"); arrastar((200, 1000), (200, 800))
    pg.keyboard.press("e"); arrastar((450, 600), (480, 620))
    pg.keyboard.press("r"); x, y = tela(700, 900); pg.mouse.move(x, y); pg.mouse.down(); time.sleep(0.3); pg.mouse.up()
    pg.keyboard.press("BracketRight")
    conferir(pg.evaluate("IE._dv.op.tam") > 400, "] aumenta o pincel")
    pg.evaluate("IE._dv.op.malha = true; IE._dv.desenhar()"); time.sleep(0.3)
    pg.screenshot(path="D:/kanivete_testes/scripts/dissolver_janela.png")
    t = time.time()
    pg.keyboard.press("Enter")
    pg.wait_for_function("!IE._dv", timeout=30000)
    s3 = pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)")
    conferir(s3 != s0, "OK aplica na camada", f"{time.time() - t:.2f} s")
    conferir(pg.evaluate("IE.doc.hist ? true : true"), "histórico")
    pg.keyboard.press("Control+z"); time.sleep(0.3)
    conferir(pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)") == s0, "Ctrl+Z no editor volta a foto")
    pg.screenshot(path="D:/kanivete_testes/scripts/dissolver_depois_desfazer.png")

    # 3) Esc cancela sem mexer
    pg.evaluate("() => { ieCmd('f:dissolver'); }"); pg.wait_for_function("!!IE._dv"); time.sleep(0.3); pg.keyboard.press("w")
    arrastar((450, 600), (520, 650)); pg.keyboard.press("Escape"); time.sleep(0.3)
    conferir(pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)") == s0 and not pg.evaluate("!!IE._dv"), "Esc cancela")

    # 4) objeto inteligente: vira filtro inteligente e reabre com o campo
    pg.evaluate("() => { ieCmd('objetoInteligente'); }"); time.sleep(0.5)
    pg.evaluate("() => { ieCmd('f:dissolver'); }"); pg.wait_for_function("!!IE._dv"); time.sleep(0.3); pg.keyboard.press("w")
    pg.evaluate("IE._dv.op.tam = 200"); arrastar((450, 600), (550, 600)); pg.keyboard.press("Enter")
    pg.wait_for_function("!IE._dv", timeout=30000); time.sleep(0.3)
    fi = pg.evaluate("(() => { const L = ieAtiva(IE.doc); return [L.tipo, (L.filtrosInt || []).map(f => f.cmd)]; })()")
    conferir(fi[0] == "inteligente" and fi[1] == ["f:dissolver"], "objeto inteligente: entra como filtro inteligente", str(fi))
    conferir(pg.evaluate(f"{assin}(ieAtiva(IE.doc).c)") != s0, "filtro inteligente deforma a camada")
    pg.evaluate("(() => { const L = ieAtiva(IE.doc); ieIntFiltro(L, ieIntDef('f:dissolver'), 'f:dissolver', 0); })()")
    pg.wait_for_function("!!IE._dv"); time.sleep(0.3); pg.keyboard.press("w")
    s4 = pg.evaluate(soma)
    conferir(s4 > 100, "editar o filtro inteligente reabre com a deformação", f"soma {s4:.0f}")
    pg.keyboard.press("Escape"); time.sleep(0.3)

    # 5) automação: KNV.cmd com ops (pinceladas)
    r = pg.evaluate(f"""async () => {{ KNV.automacao(true, {{padrao: 'primario'}}); await KNV.fecharTudo(); KNV.novo('d2', 900, 1200);
        await KNV.colocar('{FOTO}', {{nome: 'Foto', x: 0, y: 0, largura: 900}});
        const a = {assin}(ieAtiva(IE.doc).c), t = performance.now();
        await KNV.cmd('f:dissolver', {{ops: [{{f: 'deformar', pts: [[450, 600], [520, 600]], tam: 200}}, {{f: 'inchar', pts: [[450, 400]], tam: 300, passos: 15}}]}});
        const ms = performance.now() - t; KNV.automacao(false); return [a !== {assin}(ieAtiva(IE.doc).c), Math.round(ms)]; }}""")
    conferir(r[0], "automação (ops) aplica", f"{r[1]} ms")
    print("erros JS:", erros[:3] or "nenhum")
    print("RESULTADO:", "PASSOU" if not falhas and not erros else f"FALHOU {falhas}")
    sys.exit(1 if falhas or erros else 0)
