"""Caneta, demarcadores, recuperação e laço magnético com mouse de verdade no app de teste (9333)."""
import sys, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

FALHAS = []
def ok(c, m):
    print(("  ok  " if c else "  FALHOU  ") + m)
    if not c: FALHAS.append(m)

with sync_playwright() as p:
    for _ in range(90):
        try: b = p.chromium.connect_over_cdp("http://127.0.0.1:9333"); break
        except Exception: time.sleep(1)
    pg = None
    for _ in range(90):
        pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url), None)
        if pg: break
        time.sleep(1)
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.wait_for_function("typeof IE_CANETA !== 'undefined' && typeof IE_REMENDO !== 'undefined'", timeout=90000)
    pg.evaluate("switchTool('editor-imagem')"); time.sleep(1)
    pg.evaluate("KNV.automacao(true, {respostas: {'Salvar': 'Não salvar'}, padrao: 'primario'}); KNV.novo('caneta', 800, 600); KNV.ajustar(false); ieAjustarVista()"); time.sleep(0.5)
    T = lambda x, y: pg.evaluate(f"(() => {{ const r = ieEl('ie-sobre').getBoundingClientRect(), s = ieDocTela({x}, {y}, IE.doc); return [r.left + s.x, r.top + s.y]; }})()")
    def clique(x, y, mods=()):
        for m in mods: pg.keyboard.down(m)
        pg.mouse.click(*T(x, y))
        for m in mods: pg.keyboard.up(m)
        time.sleep(0.05)
    def arrastar(x0, y0, x1, y1, mods=(), passos=8):
        for m in mods: pg.keyboard.down(m)
        pg.mouse.move(*T(x0, y0)); pg.mouse.down(); pg.mouse.move(*T(x1, y1), steps=passos); pg.mouse.up()
        for m in mods: pg.keyboard.up(m)
        time.sleep(0.05)

    # 1) Caneta: canto, curva (arrastar), canto, fechar no 1º ponto
    pg.evaluate("ieEscolherFerr('caneta')")
    clique(100, 100); arrastar(300, 100, 380, 160); clique(300, 300); clique(100, 100)
    s = pg.evaluate("(() => { const d = IE.doc.dems[0], s = d.subs[0]; return {n: s.pts.length, fechado: s.fechado, o: s.pts[1].o, i: s.pts[1].i, nome: d.nome}; })()")
    ok(s["n"] == 3 and s["fechado"] and s["o"] and abs(s["o"][0] - 380) < 2 and abs(s["i"][0] - 220) < 2, f"caneta: 3 pontos, curva com alças simétricas, fechado ({s})")
    # 1b) Ctrl+Z no meio do desenho: a caneta continua do ponto que sobrou; ímã do ponto inicial; Enter esconde
    pg.evaluate("IE.doc.demAtivo = null; ieEscolherFerr('caneta')")
    clique(500, 400); clique(600, 400); clique(600, 500)
    pg.evaluate("ieCmd('desfazer')"); time.sleep(0.1)
    clique(650, 520)
    sub = pg.evaluate("(() => { const d = ieDemAtivo(IE.doc), s = d.subs[d.subs.length - 1]; return [d.subs.length, s.pts.length, s.pts.map(q => Math.round(q.x))]; })()")
    ok(sub[1] == 3 and sub[2] == [500, 600, 650], f"depois do Ctrl+Z a caneta continua a mesma linha ({sub})")
    pg.mouse.move(*T(507, 405)); time.sleep(0.05)
    cur = pg.evaluate("IE._canetaCursor")
    clique(507, 405)
    ok(pg.evaluate("(() => { const d = ieDemAtivo(IE.doc); return d.subs[d.subs.length - 1].fechado; })()"), "ímã: clicar perto (7 px) do ponto inicial fecha o demarcador")
    ok('url(' in cur, "cursor da caneta é a própria caneta (não a cruz)")
    pg.keyboard.press("Enter"); time.sleep(0.1)
    ok(pg.evaluate("IE.doc.demAtivo") is None and pg.evaluate("IE.doc.dems.length") >= 1, "Enter esconde o demarcador (continua no painel)")
    pg.evaluate("IE.doc.demAtivo = IE.doc.dems[0].id; IE.canetaRef = null")
    # 2) Ctrl+Enter → seleção
    pg.keyboard.press("Control+Enter"); time.sleep(0.2)

    sb = pg.evaluate("[IE.doc.sel && IE.doc.sel.bbox, IE.doc.demAtivo, IE.ferr, document.activeElement.tagName, KNV.dialogo()]")
    ok(sb[0] and sb[0]["w"] > 200, f"Ctrl+Enter carrega o demarcador como seleção {sb}")
    ok(pg.evaluate("IE.doc.demAtivo") is None, "depois de Fazer seleção, fica só o pontilhado (demarcador sai da tela)")
    pg.evaluate("ieCmd('desselecionar'); IE.doc.demAtivo = IE.doc.dems[0].id")   # como clicar no demarcador no painel
    # 3) Seleção direta: arrastar o ponto (300,300) para (320,340)
    pg.evaluate("ieEscolherFerr('selDireta')")
    arrastar(300, 300, 320, 340)
    q = pg.evaluate("IE.doc.dems[0].subs[0].pts[2]")
    ok(abs(q["x"] - 320) < 2 and abs(q["y"] - 340) < 2, f"seleção direta move o ponto ({q['x']:.0f},{q['y']:.0f})")
    # 4) Alt na caneta sobre ponto suave: vira canto
    pg.evaluate("ieEscolherFerr('caneta'); IE.canetaSub = null")
    clique(300, 100, ("Alt",))
    q = pg.evaluate("IE.doc.dems[0].subs[0].pts[1]")
    ok(q["i"] is None and q["o"] is None, "Alt+clique converte o ponto suave em canto")
    # 5) adicionar automaticamente: clique no meio do segmento (100,100)-(300,100) → 4 pontos
    clique(200, 100)
    ok(pg.evaluate("IE.doc.dems[0].subs[0].pts.length") == 4, "adicionar ponto automaticamente sobre o segmento")
    # 6) Ctrl+Z desfaz
    pg.evaluate("ieCmd('desfazer')"); time.sleep(0.1)
    ok(pg.evaluate("IE.doc.dems[0].subs[0].pts.length") == 3, "Ctrl+Z desfaz o ponto adicionado")
    # 7) modo Forma: triângulo vira camada de forma; Mover leva o vetor junto
    pg.evaluate("IE.op.caneta.modo = 'forma'; IE.op.caneta.cor = '#ff0000'; IE.canetaSub = null; ieAtivar(IE.doc.camadas[0].id); IE.doc.demAtivo = null; ieOpcoesRender()")
    clique(500, 100); clique(700, 300); clique(500, 300); clique(500, 100)
    L = pg.evaluate("(() => { const L = ieAtiva(IE.doc); return {tipo: L.tipo, w: L.c && L.c.width, n: L.vet && L.vet.subs[0].pts.length}; })()")
    ok(L["tipo"] == "forma" and L["n"] == 3 and L["w"] and L["w"] > 150, f"modo Forma cria camada de forma ({L})")
    pg.evaluate("ieEscolherFerr('mover'); IE.op.mover.auto = false")
    arrastar(560, 260, 600, 260)
    v = pg.evaluate("ieAtiva(IE.doc).vet.subs[0].pts[0].x")
    ok(abs(v - 540) < 2, f"Mover leva os pontos da forma junto ({v:.0f})")
    pg.evaluate("IE.op.caneta.modo = 'demarcador'")
    # 8) Caneta de forma livre
    pg.evaluate("IE.doc.demAtivo = IE.doc.dems[0].id; ieAtivar(IE.doc.camadas[0].id); ieEscolherFerr('canetaLivre')")
    n0 = pg.evaluate("IE.doc.dems[0].subs.length")
    pg.mouse.move(*T(100, 400)); pg.mouse.down()
    for k in range(30): pg.mouse.move(*T(100 + k * 10, 400 + 40 * (1 if k % 10 < 5 else -1)))
    pg.mouse.up(); time.sleep(0.1)
    ok(pg.evaluate("IE.doc.dems[0].subs.length") == n0 + 1, "caneta de forma livre cria um subdemarcador")
    # 9) painel Demarcadores
    pg.evaluate("ieCmd('janela:demarcadores')"); time.sleep(0.4)
    pg.screenshot(path="D:/kanivete_testes/scripts/caneta.png")

    # 10) recuperação: fundo degradê com ponto vermelho
    pg.evaluate("""(() => { KNV.novo('rec', 600, 400); const L = ieAtiva(IE.doc); const x = ieCtx(L.c);
        const g = x.createLinearGradient(0, 0, 600, 0); g.addColorStop(0, '#305080'); g.addColorStop(1, '#a0c0e0'); x.fillStyle = g; x.fillRect(0, 0, 600, 400);
        x.fillStyle = '#ff0000'; x.beginPath(); x.arc(300, 200, 12, 0, 7); x.fill(); x.beginPath(); x.arc(150, 100, 10, 0, 7); x.fill(); ieInvalidar(L); ieTudo(IE.doc); ieAjustarVista(); })()""")
    vermelho = lambda x, y: pg.evaluate(f"(() => {{ ieCompor(IE.doc); const d = ieCtx(IE.doc.comp).getImageData({x} - 3, {y} - 3, 7, 7).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80) n++; return n; }})()")
    pg.evaluate("ieEscolherFerr('recManchas'); IE.op.recManchas.tam = 40")
    arrastar(295, 200, 305, 200, passos=3); time.sleep(1.5)
    ok(vermelho(300, 200) == 0, "pincel de recuperação para manchas tira o ponto vermelho")
    # Remendo: seleção em volta do outro ponto, arrastar de dentro dela 80 px para a direita
    pg.evaluate("KNV.selecionar(130, 80, 40, 40); ieEscolherFerr('remendo')")
    arrastar(150, 100, 230, 100); time.sleep(1.5)
    ok(vermelho(150, 100) == 0, "remendo (origem) cobre o ponto com a área boa")
    # 11) laço magnético em volta de um quadrado preto
    pg.evaluate("""(() => { ieCmd('desselecionar'); KNV.novo('mag', 400, 400); const L = ieAtiva(IE.doc), x = ieCtx(L.c); x.fillStyle = '#000'; x.fillRect(100, 100, 200, 200); ieInvalidar(L); ieTudo(IE.doc); ieAjustarVista(); ieEscolherFerr('lacoMag'); })()""")
    rota = [(95, 95), (200, 92), (305, 95), (308, 200), (305, 305), (200, 308), (95, 305), (92, 200)]
    clique(*rota[0])
    for (x0, y0), (x1, y1) in zip(rota, rota[1:] + rota[:1]):
        for k in range(1, 9): pg.mouse.move(*T(x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * k / 8))
        clique(x1, y1) if (x1, y1) != rota[0] else None
    pg.keyboard.press("Enter"); time.sleep(0.2)
    bb = pg.evaluate("IE.doc.sel && IE.doc.sel.bbox")
    ok(bb and abs(bb["x"] - 100) <= 3 and abs(bb["w"] - 200) <= 6, f"laço magnético gruda na borda do quadrado ({bb})")
    pg.evaluate("KNV.automacao(false)")
    ok(not erros, f"sem erros de JavaScript {erros[:3]}")
    print("\nPASSOU" if not FALHAS else f"\nFALHOU ({len(FALHAS)})")
