"""Texto criado no Photo Kanivete → camada de texto EDITÁVEL no PSD (Functions/editor_imagem._texto_novo).

    py -3.13 testes/teste_psd_texto.py [--photoshop]

Monta um PSD com textos novos (ponto, parágrafo, trechos com outra cor/fonte, girado), relê com o psd-tools e confere
que cada um é camada de texto com o conteúdo, fonte, tamanho, cor, matriz e caixa certos. Com --photoshop abre o
arquivo no Photoshop (COM), lê cada textItem e troca o texto de um deles (força o Photoshop a redesenhar). Sai com 1
se reprovar.
"""
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from PIL import Image  # noqa: E402

from Functions import editor_imagem as ei  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
erros = []


def falha(msg):
    erros.append(msg)
    print("  ✗", msg)


ang = math.radians(-12)
CASOS = [
    ("Título", {"s": "OFICINA\nBRASIL", "m": [1, 0, 0, 1, 120, 200], "ps": "Arial-BoldMT", "tam": 72, "cor": "#1a7f37",
                "esp": 50, "ent": 80, "alin": "left"}, (110, 130, 520, 300)),
    ("Parágrafo", {"s": "Texto de parágrafo que quebra dentro da caixa.", "m": [1, 0, 0, 1, 100, 400],
                   "caixa": [0, 0, 500, 160], "ps": "ArialMT", "tam": 36, "cor": "#202020", "alin": "center"}, (100, 400, 600, 560)),
    ("Trechos", {"s": "Papo Produtivo", "m": [1, 0, 0, 1, 700, 200], "ps": "ArialMT", "tam": 48, "cor": "#ffffff",
                 "trechos": [{"a": 5, "b": 14, "cor": "#ff9900", "ps": "Arial-BoldMT"}]}, (690, 150, 1100, 220)),
    ("Girado", {"s": "Girado", "m": [math.cos(ang), math.sin(ang), -math.sin(ang), math.cos(ang), 700, 500],
                "ps": "ArialMT", "tam": 40, "cor": "#0044cc", "alin": "center"}, (600, 430, 820, 520)),
]


def montar(destino):
    from psd_tools import PSDImage
    psd = PSDImage.new("RGB", (1200, 700), color=(255, 255, 255))
    for nome, tx, (x0, y0, x1, y1) in CASOS:
        im = Image.new("RGBA", (x1 - x0, y1 - y0), (255, 0, 0, 90))   # "pixels do editor" (a prévia)
        ob = ei._nova_pixel(psd, im, nome, x0, y0)
        ei._texto_novo(ob, tx)
        psd.append(ob)
    psd.save(destino)


def conferir_psd_tools(path):
    from psd_tools import PSDImage
    psd = PSDImage.open(path)
    por_nome = {l.name: l for l in psd}
    for nome, tx, _ in CASOS:
        l = por_nome.get(nome)
        if l is None or l.kind != "type":
            falha(f"{nome}: não é camada de texto ({l.kind if l else 'sumiu'})")
            continue
        if str(l.text).replace("\r", "\n") != tx["s"]:
            falha(f"{nome}: texto {l.text!r}")
        fontes = [str(f["Name"]).strip("'\"()") for f in l.resource_dict["FontSet"]]
        # regras que derrubam o Photoshop se quebradas: as duas listas de fontes iguais e o Txt terminado em nulo
        from psd_tools.constants import Tag
        tys = l.tagged_blocks.get_data(Tag.TYPE_TOOL_OBJECT_SETTING)
        raiz = tys.text_data[b"EngineData"].value
        doc_fontes = [str(f["Name"]).strip("'\"()") for f in raiz["DocumentResources"]["FontSet"]]
        if doc_fontes != fontes:
            falha(f"{nome}: listas de fontes diferentes {fontes} × {doc_fontes}")
        usadas = [int(r["StyleSheet"]["StyleSheetData"]["Font"]) for r in l.engine_dict["StyleRun"]["RunArray"]]
        if any(i >= len(doc_fontes) for i in usadas):
            falha(f"{nome}: fonte {usadas} fora da lista ({len(doc_fontes)})")
        if not str(tys.text_data[b"Txt "].value).endswith(chr(0)):
            falha(f"{nome}: Txt sem o nulo final")
        runs = list(l.engine_dict["StyleRun"]["RunArray"])
        sd = runs[0]["StyleSheet"]["StyleSheetData"]
        if fontes[int(sd["Font"])] != tx["ps"]:
            falha(f"{nome}: fonte {fontes[int(sd['Font'])]}")
        if abs(float(sd["FontSize"]) - tx["tam"]) > 0.01:
            falha(f"{nome}: tamanho {sd['FontSize']}")
        cor = "#%02x%02x%02x" % tuple(int(round(float(v) * 255)) for v in list(sd["FillColor"]["Values"])[1:4])
        if cor != tx["cor"]:
            falha(f"{nome}: cor {cor}")
        if any(abs(a - b) > 1e-6 for a, b in zip(l.transform, tx["m"])):
            falha(f"{nome}: matriz {l.transform}")
        lens = [int(v) for v in l.engine_dict["StyleRun"]["RunLengthArray"]]
        if sum(lens) != len(tx["s"]) + 1:
            falha(f"{nome}: runs somam {sum(lens)} (texto {len(tx['s']) + 1})")
        if tx.get("trechos"):
            if len(runs) != 2:
                falha(f"{nome}: {len(runs)} runs (esperado 2)")
            else:
                sd2 = runs[1]["StyleSheet"]["StyleSheetData"]
                cor2 = "#%02x%02x%02x" % tuple(int(round(float(v) * 255)) for v in list(sd2["FillColor"]["Values"])[1:4])
                if cor2 != "#ff9900" or fontes[int(sd2["Font"])] != "Arial-BoldMT":
                    falha(f"{nome}: trecho com {cor2} / {fontes[int(sd2['Font'])]}")
        if tx.get("caixa"):
            forma = l.engine_dict["Rendered"]["Shapes"]["Children"][0]
            bb = [float(v) for v in forma["Cookie"]["Photoshop"]["BoxBounds"]]
            if int(forma["ShapeType"]) != 1 or bb != [float(v) for v in tx["caixa"]]:
                falha(f"{nome}: caixa {bb}")
        print(f"  ✓ {nome}: texto, fonte, tamanho, cor, matriz" + (", caixa" if tx.get("caixa") else "") + (", trechos" if tx.get("trechos") else ""))


def conferir_photoshop(path):
    import win32com.client
    ps = win32com.client.Dispatch("Photoshop.Application")
    ps._FlagAsMethod("DoJavaScript")
    copia = os.path.splitext(path)[0] + "_editado_no_ps.psd"
    jsx = r'''
app.displayDialogs = DialogModes.NO;
app.preferences.rulerUnits = Units.PIXELS; app.preferences.typeUnits = TypeUnits.PIXELS;
var d = app.open(new File("%s")), out = [];
try {
  for (var i = 0; i < d.artLayers.length; i++) {
    var l = d.artLayers[i];
    if (l.kind == LayerKind.TEXT) {
      var t = l.textItem;
      out.push(l.name + "|" + t.contents.replace(/\r/g, "\\n") + "|" + t.font + "|" + Math.round(t.size.as("px")) + "|" + t.color.rgb.hexValue + "|" + (t.kind == TextType.PARAGRAPHTEXT ? "par" : "ponto"));
    } else if (l.name != "Background" && !l.isBackgroundLayer) out.push(l.name + "|PIXELS");
  }
  var alvo = d.artLayers.getByName("Título"); alvo.textItem.contents = "EDITADO NO PS";
  var o = new PhotoshopSaveOptions(); o.layers = true; d.saveAs(new File("%s"), o, true);
} finally { d.close(SaveOptions.DONOTSAVECHANGES); }
out.join("\n");
''' % (path.replace("\\", "/"), copia.replace("\\", "/"))
    r = ps.DoJavaScript(jsx)
    linhas = {ln.split("|")[0]: ln.split("|")[1:] for ln in str(r).splitlines()}
    print("  Photoshop leu:")
    for nome, v in linhas.items():
        print("   ", nome, v)
    for nome, tx, _ in CASOS:
        v = linhas.get(nome)
        if not v or v[0] == "PIXELS":
            falha(f"Photoshop: {nome} não é texto ({v})")
            continue
        if v[0].replace("\\n", "\n") != tx["s"]:
            falha(f"Photoshop: {nome} texto {v[0]!r}")
        if v[1] != tx["ps"]:
            falha(f"Photoshop: {nome} fonte {v[1]}")
        if abs(int(v[2]) - tx["tam"]) > 1:
            falha(f"Photoshop: {nome} tamanho {v[2]}")
        if ("#" + v[3].lower()) != tx["cor"]:
            falha(f"Photoshop: {nome} cor #{v[3]}")
        if (v[4] == "par") != bool(tx.get("caixa")):
            falha(f"Photoshop: {nome} tipo {v[4]}")
    from psd_tools import PSDImage
    ed = {l.name: l for l in PSDImage.open(copia)}
    t = ed.get("Título")
    if t is None or t.kind != "type" or "EDITADO NO PS" not in str(t.text):
        falha("Photoshop: editar o texto e salvar não deu certo")
    else:
        print("  ✓ Photoshop editou o texto e salvou:", copia)


def main():
    pasta = os.path.join(os.environ.get("TEMP") or tempfile.gettempdir(), "canivete_teste_psd_texto")
    os.makedirs(pasta, exist_ok=True)
    path = os.path.join(pasta, f"textos_novos_{os.getpid()}.psd")
    montar(path)
    print("PSD:", path)
    conferir_psd_tools(path)
    if "--photoshop" in sys.argv:
        conferir_photoshop(path)
    print("REPROVADO" if erros else "OK", f"({len(erros)} erro(s))")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
