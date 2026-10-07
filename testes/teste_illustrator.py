"""Compatibilidade Vetor Kanivete ↔ Adobe Illustrator (Functions/ponte_illustrator.py) — app em --agente=9333 e o
Illustrator instalado (pula sem ele; deixa o Illustrator aberto no fim).

    py -3.13 testes/teste_illustrator.py

IDA: monta uma IDV no Vetor (4 pranchetas em grade, 3 camadas, anel composto, Pantone, degradê, opacidade, tracejado,
texto de ponto e de área com trecho em negrito, foto em máscara, símbolo, sombra), salva .ai NATIVO pelo Illustrator e
confere lá: pranchetas (nome/posição), camadas na ordem, textos editáveis (tipo e conteúdo com acento), cor especial,
degradê, máscara, símbolos; compara o PNG do Illustrator com o do Vetor prancheta a prancheta.
VOLTA: cria um .ai no Illustrator (3 pranchetas, uma EMBAIXO, camadas, texto de área com trechos, Pantone, máscara) e
abre no Vetor: posição das pranchetas, ordem das camadas, texto de área inteiro (sem duplicata), cor especial e imagem.
Saída em D:/kanivete_testes/compat. Sai com 1 se reprovar.
"""
import json
import os
import sys
import time

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from Functions import ponte_illustrator as PI   # noqa: E402

SAI = "D:/kanivete_testes/compat/teste"
os.makedirs(SAI, exist_ok=True)
FOTO = "D:/kanivete_testes/humanos/corpo.png"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


if not PI.disponivel():
    print("Illustrator não instalado: teste pulado"); sys.exit(0)
import win32com.client  # noqa: E402

AI = win32com.client.Dispatch("Illustrator.Application")
LER = r"""
(function () {
  function js(v) { if (v === null || v === undefined) return 'null'; if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'string') { var s = ''; for (var c = 0; c < v.length; c++) { var cc = v.charCodeAt(c), ch = v.charAt(c); if (cc === 34) ch = String.fromCharCode(92, 34); else if (cc === 92) ch = String.fromCharCode(92, 92); else if (cc === 13 || cc === 10) ch = String.fromCharCode(92) + 'n'; else if (cc < 32) ch = ' '; else if (cc > 126) ch = String.fromCharCode(92) + 'u' + ('000' + cc.toString(16)).slice(-4); s += ch; } return '"' + s + '"'; }   /* sem ternário encadeado: o ExtendScript agrupa pela esquerda */
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(js(v[i])); return '[' + a.join(',') + ']'; }
    var o = []; for (var k in v) o.push(js(k) + ':' + js(v[k])); return '{' + o.join(',') + '}'; }
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS; app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  var d = app.open(new File(%ARQ%)), r = { pr: [], cam: [], tx: [], spots: [], n: {} };
  for (var i = 0; i < d.artboards.length; i++) { var q = d.artboards[i].artboardRect; r.pr.push([d.artboards[i].name, Math.round(q[0]), Math.round(-q[1]), Math.round(q[2] - q[0]), Math.round(q[1] - q[3])]); }
  for (var i = 0; i < d.layers.length; i++) r.cam.push(d.layers[i].name);
  for (var i = 0; i < d.textFrames.length; i++) r.tx.push([String(d.textFrames[i].kind), d.textFrames[i].contents]);
  for (var i = 0; i < d.spots.length; i++) r.spots.push(d.spots[i].name);
  var cl = 0, gr = 0; for (var i = 0; i < d.groupItems.length; i++) if (d.groupItems[i].clipped) cl++;
  for (var i = 0; i < d.pathItems.length; i++) { try { if (d.pathItems[i].filled && d.pathItems[i].fillColor.typename === 'GradientColor') gr++; } catch (e) {} }
  r.n = { cortes: cl, degrades: gr, simbolos: d.symbolItems.length, compostos: d.compoundPathItems.length, imagens: d.rasterItems.length + d.placedItems.length };
  for (var i = 0; i < d.artboards.length; i++) { d.artboards.setActiveArtboardIndex(i); var o = new ExportOptionsPNG24(); o.artBoardClipping = true; o.transparency = false;
    d.exportFile(new File(%PNG% + '/ai_' + (i + 1) + '.png'), ExportType.PNG24, o); }
  d.close(SaveOptions.DONOTSAVECHANGES); return js(r);
})();
"""


CRIAR = r"""
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
var d = app.documents.add(DocumentColorSpace.CMYK, 500, 300);
d.artboards[0].artboardRect = [0, 0, 500, -300]; d.artboards[0].name = 'Marca';
d.artboards.add([540, 0, 1040, -300]).name = 'Papelaria';
d.artboards.add([0, -340, 500, -640]).name = 'Redes';
function cmyk(c, m, y, k) { var x = new CMYKColor(); x.cyan = c; x.magenta = m; x.yellow = y; x.black = k; return x; }
var sp = d.spots.add(); sp.name = 'PANTONE 286 C'; sp.color = cmyk(100, 75, 0, 0); sp.colorType = ColorModel.SPOT;
var spc = new SpotColor(); spc.spot = sp; spc.tint = 100;
var L0 = d.layers[0]; L0.name = 'Fundo';
var L1 = d.layers.add(); L1.name = 'Logo';
var L2 = d.layers.add(); L2.name = 'Textos';
// fundo com degradê
var r = L0.pathItems.rectangle(0, 0, 500, 300); r.stroked = false;
var G = d.gradients.add(); G.type = GradientType.LINEAR; G.gradientStops[0].color = cmyk(0, 0, 10, 0); G.gradientStops[1].color = cmyk(10, 0, 30, 0);
var gc = new GradientColor(); gc.gradient = G; r.fillColor = gc;
// logo: anel composto em Pantone + estrela + máscara
var cp = L1.compoundPathItems.add();
var a1 = cp.pathItems.ellipse(-60, 40, 120, 120); var a2 = cp.pathItems.ellipse(-90, 70, 60, 60);
a1.fillColor = spc; a1.stroked = false;
var st = L1.pathItems.star(260, -120, 50, 22, 5); st.fillColor = cmyk(0, 60, 100, 0); st.stroked = false; st.opacity = 70;
var gq = L1.groupItems.add();
var listras = []; for (var i = 0; i < 6; i++) { var b = gq.pathItems.rectangle(-60 - i * 20, 330, 140, 10); b.fillColor = cmyk(0, 100, 0, 0); b.stroked = false; }
var cl = gq.pathItems.ellipse(-60, 340, 120, 120); cl.clipping = true; gq.clipped = true;
var ln = L1.pathItems.add(); ln.setEntirePath([[40, -270], [460, -270]]); ln.filled = false; ln.stroked = true; ln.strokeColor = cmyk(0, 0, 0, 100); ln.strokeWidth = 1.5; ln.strokeDashes = [4, 2];
// símbolo em 3 pranchetas
var sg = L1.groupItems.add(); var s1 = sg.pathItems.ellipse(0, 0, 20, 20); s1.fillColor = cmyk(0, 100, 100, 0); s1.stroked = false;
var sym = d.symbols.add(sg); sym.name = 'Ponto'; sg.remove();
var i1 = L1.symbolItems.add(sym); i1.position = [580, -40];
var i2 = L1.symbolItems.add(sym); i2.position = [40, -380];
// textos
var t1 = L2.textFrames.pointText([40, -230]); t1.contents = 'Aurora Café';
t1.textRange.characterAttributes.textFont = app.textFonts.getByName('Arial-BoldMT'); t1.textRange.characterAttributes.size = 36;
t1.textRange.characterAttributes.fillColor = cmyk(0, 0, 0, 90);
var bx = L2.pathItems.rectangle(-60, 600, 380, 120); var t2 = L2.textFrames.areaText(bx);
t2.contents = 'Rua das Flores, 123 — Centro\rTelefone (11) 5555-0000\rwww.auroracafe.com.br';
t2.textRange.characterAttributes.textFont = app.textFonts.getByName('ArialMT'); t2.textRange.characterAttributes.size = 14;
t2.paragraphs[0].characterAttributes.textFont = app.textFonts.getByName('Arial-BoldMT');
t2.paragraphs[2].characterAttributes.fillColor = spc;
var t3 = L2.textFrames.pointText([250, -520]); t3.contents = 'Siga @auroracafe';
t3.textRange.characterAttributes.size = 28; t3.textRange.paragraphAttributes.justification = Justification.CENTER;
t3.textRange.characterAttributes.fillColor = cmyk(0, 60, 100, 0);
var cc = L2.pathItems.ellipse(-400, 330, 140, 140); var tp = L2.textFrames.pathText(cc); tp.contents = 'TEXTO NO CAMINHO';
tp.textRange.characterAttributes.size = 16; tp.textRange.characterAttributes.fillColor = cmyk(0, 0, 0, 100);
var so = new IllustratorSaveOptions(); so.pdfCompatible = true;
d.saveAs(new File('%SAI%/ai_original.ai'), so);
for (var i = 0; i < d.artboards.length; i++) { d.artboards.setActiveArtboardIndex(i); var o = new ExportOptionsPNG24(); o.artBoardClipping = true; o.transparency = false;
  d.exportFile(new File('%SAI%/ai_' + (i + 1) + '.png'), ExportType.PNG24, o); }
d.close(SaveOptions.DONOTSAVECHANGES);
'ok';
"""


def ler_ai(arq, pasta):
    return json.loads(AI.DoJavaScript(LER.replace("%ARQ%", json.dumps(arq)).replace("%PNG%", json.dumps(pasta))))


def comparar(pasta, n, pdf):
    import fitz
    difs = []
    for i, pg in enumerate(fitz.open(pdf)):
        if i >= n: break
        pg.set_cropbox(pg.trimbox); pg.get_pixmap(dpi=72).save(f"{pasta}/vk_{i + 1}.png")
        a = np.asarray(Image.open(f"{pasta}/ai_{i + 1}.png").convert("RGB")).astype(float)
        b = np.asarray(Image.open(f"{pasta}/vk_{i + 1}.png").convert("RGB").resize((a.shape[1], a.shape[0]))).astype(float)
        difs.append(round(float(np.abs(a - b).mean()), 2))
    return difs


with sync_playwright() as p:
    b = None
    for _ in range(120):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333"); break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    pg.wait_for_function("typeof switchTool === 'function'", timeout=90000)
    pg.evaluate("switchTool('vetor-kanivete')")
    pg.wait_for_function("window.VKN && document.getElementById('vk-canvas')", timeout=60000)
    pg.evaluate("VKN.curto = false")
    C = lambda n, a=None: pg.evaluate("([n, a]) => VKN.cmd(n, a)", [n, a or {}])
    cam = lambda nome: pg.evaluate("n => { VK.camadaAtiva = VK.doc.camadas.find(x => x.nome === n).id; }", nome)

    print("IDA: Vetor → .ai nativo")
    C("novo", {"nome": "IDV teste", "larg": 200, "alt": 120, "pranchetas": 5, "sangria": 3})
    for i, n in enumerate(["Capa", "Logo", "Tipografia", "Aplicação", "Verso"]):
        C("prancheta", {"prancheta": i + 1, "novo_nome": n})
    pg.evaluate("() => { VK.doc.camadas[0].nome = 'Fundo'; }"); C("nova_camada", {"nome": "Marca"}); C("nova_camada", {"nome": "Texto"})
    cam("Fundo"); C("retangulo", {"prancheta": "Capa", "x": -3, "y": -3, "larg": 206, "alt": 126, "preench": "C100 M55 Y35 K45", "traco": "nenhum"})
    cam("Marca")
    e1 = C("elipse", {"prancheta": "Capa", "x": 20, "y": 30, "larg": 60, "alt": 60, "preench": "C0 M68 Y72 K0", "traco": "nenhum"})
    e2 = C("elipse", {"prancheta": "Capa", "x": 35, "y": 45, "larg": 30, "alt": 30, "preench": "C0 M68 Y72 K0", "traco": "nenhum"})
    C("composto", {"ids": [e1["id"], e2["id"]]})
    C("estrela", {"prancheta": "Capa", "cx": 150, "cy": 35, "raio": 15, "pontas": 5, "preench": "spot:PANTONE 1505 C:0,56,90,0", "traco": "nenhum"})
    g = C("retangulo", {"prancheta": "Capa", "x": 110, "y": 70, "larg": 70, "alt": 30, "traco": "nenhum"})
    C("degrade", {"ids": [g["id"]], "cores": ["C0 M68 Y72 K0", "C100 M55 Y35 K45"], "angulo": 0})
    C("elipse", {"prancheta": "Capa", "x": 90, "y": 10, "larg": 30, "alt": 30, "preench": "C0 M0 Y0 K0", "traco": "nenhum", "nome": "meia"}); C("alterar", {"nomes": ["meia"], "opacidade": 50})
    C("linha", {"prancheta": "Capa", "x1": 20, "y1": 105, "x2": 180, "y2": 105, "traco": "C2 M3 Y10 K0", "espessura": 2, "nome": "trac"})
    pg.evaluate("() => { vkTodos().map(x => x.o).find(o => o.nome === 'trac').traco.tracejado = [6, 3]; vkMudou(); }")
    im = C("imagem", {"prancheta": "Logo", "arquivo": FOTO, "x": 10, "y": 10, "larg": 80})
    cl = C("elipse", {"prancheta": "Logo", "x": 20, "y": 15, "larg": 60, "alt": 60, "preench": "100K", "traco": "nenhum"})
    C("mascara", {"ids": [im["id"], cl["id"]]})
    st = C("estrela", {"prancheta": "Logo", "cx": 120, "cy": 30, "raio": 8, "pontas": 6, "preench": "C0 M100 Y0 K0", "traco": "nenhum"})
    C("criar_simbolo", {"ids": [st["id"]], "nome": "Gota"})
    C("colocar_simbolo", {"prancheta": "Logo", "nome": "Gota", "x": 150, "y": 80})
    C("retangulo", {"prancheta": "Aplicação", "x": 20, "y": 20, "larg": 70, "alt": 45, "preench": "C2 M3 Y10 K0", "traco": "100K", "espessura": 1, "nome": "cartao"})
    C("efeito", {"nomes": ["cartao"], "tipo": "sombra", "dx": 2, "dy": 2, "desfoque": 2})
    cam("Texto")
    C("texto", {"prancheta": "Capa", "conteudo": "MARÉ", "x": 110, "y": 60, "fonte": "Arial", "estilo": "Bold", "tamanho": 40, "preench": "C2 M3 Y10 K0"})
    C("texto", {"prancheta": "Tipografia", "conteudo": "A marca respira com calma. Cores do mar e do pôr do sol em caixa de área para testar a quebra de linha.",
                "x": 15, "y": 20, "caixa": 170, "fonte": "Arial", "tamanho": 14, "preench": "100K", "nome": "par"})
    C("alterar", {"nomes": ["par"], "trecho": "Cores do mar", "estilo": "Bold", "preench": "C100 M55 Y35 K45"})
    C("texto", {"prancheta": "Verso", "conteudo": "verso", "x": 80, "y": 60, "fonte": "Georgia", "estilo": "Italic", "tamanho": 24, "preench": "C0 M68 Y72 K0"})
    ai_ = SAI + "/ida.ai"
    t = time.time()
    r = C("exportar_ai", {"caminho": ai_})
    print(f"   {time.time() - t:.1f} s", {k: r.get(k) for k in ("nativo", "pranchetas", "camadas", "nativos", "incorporados_pdf", "avisos")})
    ok(r.get("nativo") and r.get("pranchetas") == 5, ".ai nativo pelo Illustrator com as 5 pranchetas", str(r.get("arquivos")))
    vk_pr = pg.evaluate("() => VK.doc.pranchetas.map(p => [p.nome, Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h)])")
    C("exportar_pdf", {"caminho": SAI + "/ida_vetor.pdf", "forcar": True, "padrao": "cmyk", "marcas": False})
    L = ler_ai(ai_, SAI)
    ok(L["pr"] == vk_pr, "pranchetas iguais (nome, posição em grade, tamanho)", f"{L['pr']} × {vk_pr}")
    ok(L["cam"] == ["Texto", "Marca", "Fundo"], "camadas com nome e na ordem", str(L["cam"]))
    tipos = sorted(k.split(".")[-1] for k, _ in L["tx"])
    ok(tipos == ["AREATEXT", "POINTTEXT", "POINTTEXT"] and any(c == "MARÉ" for _, c in L["tx"]), "textos editáveis: 2 de ponto + 1 de área, acento certo", str(L["tx"]))
    ok("PANTONE 1505 C" in L["spots"] and L["n"]["degrades"] >= 1 and L["n"]["cortes"] >= 1 and L["n"]["simbolos"] >= 1 and L["n"]["compostos"] >= 1,
       "Pantone, degradê, máscara, símbolo e caminho composto nativos", str(L["n"]))
    sb = json.loads(AI.DoJavaScript("(function(){ app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS; var d = app.open(new File(" + json.dumps(ai_) + ")), n = 0;"
                                     " for (var i = 0; i < d.pathItems.length; i++) if (d.pathItems[i].name === 'cartao') n++; d.close(SaveOptions.DONOTSAVECHANGES); return '{\"cartao\":' + n + '}'; })()"))
    ok(sb["cartao"] == 1 and r.get("incorporados_pdf") == 0, "cartão com sombra vai como caminho nativo com Sombra projetada viva (nada incorporado)", f"{sb}, incorporados {r.get('incorporados_pdf')}")
    d = comparar(SAI, 5, SAI + "/ida_vetor.pdf")
    ok(max(d) < 6, "aparência igual no Illustrator e no Vetor (diferença média por prancheta)", str(d))

    print("VOLTA: Illustrator → Vetor")
    V = SAI.replace("/teste", "/teste_volta")
    os.makedirs(V, exist_ok=True)
    ok(AI.DoJavaScript(CRIAR.replace("%SAI%", V)) == "ok", "arquivo criado no Illustrator (3 pranchetas, uma embaixo)")
    r = C("abrir", {"caminho": V + "/ai_original.ai"})
    info = pg.evaluate("""() => ({ pr: VK.doc.pranchetas.map(p => [p.nome, Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h)]), cam: VK.doc.camadas.map(c => c.nome),
        tx: vkTodos().map(x => x.o).filter(o => o.tipo === 'texto').map(o => [o.conteudo, !!o.caixa, (o.trechos || []).length]),
        spots: VK.doc.amostras.filter(a => a.cor.k === 'spot').map(a => a.nome) })""")
    ok(info["pr"] == [["Marca", 0, 0, 500, 300], ["Papelaria", 540, 0, 500, 300], ["Redes", 0, 340, 500, 300]], "pranchetas no lugar do Illustrator (a 3ª embaixo)", str(info["pr"]))
    ok(info["cam"] == ["Fundo", "Logo", "Textos"], "camadas na ordem do Illustrator", str(info["cam"]))
    area = [t for t in info["tx"] if t[1]]
    ok(len(info["tx"]) == 4 and len(area) == 1 and area[0][0].count("\n") == 2 and area[0][2] >= 2, "textos: 4 (com o do caminho), o de área inteiro com parágrafos e trechos, sem duplicata", str(info["tx"]))
    ok("PANTONE 286 C" in info["spots"], "cor especial vira amostra", str(info["spots"]))
    sim = pg.evaluate("() => ({ defs: Object.keys(VK.doc.simbolos || {}).length, inst: vkTodos().filter(x => x.o.tipo === 'instancia').length })")
    ok(sim["defs"] >= 1 and sim["inst"] >= 2, "símbolo do Illustrator volta como símbolo (definição + instâncias)", str(sim))
    tc = pg.evaluate("() => vkTodos().map(x => x.o).filter(o => o.tipo === 'texto' && o.trilha).map(o => [o.conteudo, o.subs.length, Math.round(o.trilha.ini)])")
    ok(len(tc) == 1 and tc[0][0] == "TEXTO NO CAMINHO", "texto em caminho volta editável no caminho", str(tc))
    C("exportar_pdf", {"caminho": V + "/volta_vetor.pdf", "forcar": True, "padrao": "cmyk", "marcas": False})
    d = comparar(V, 3, V + "/volta_vetor.pdf")
    ok(max(d) < 6, "aparência igual (Illustrator × Vetor)", str(d))
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
