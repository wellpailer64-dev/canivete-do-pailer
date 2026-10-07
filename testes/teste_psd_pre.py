"""Camada de preenchimento de cor sólida do Photo Kanivete → camada de preenchimento no PSD (editor_imagem._preenchimento).

    py -3.13 testes/teste_psd_pre.py [--photoshop]

Monta um PSD com preenchimentos novos (cheio e com máscara) e relê com o psd-tools: tipo e cor. Com --photoshop também
gera no Photoshop um PSD com um preenchimento feito nele, troca a cor pelo caminho da ida e volta e reabre lá; abre o
PSD montado aqui, lê tipo e cor de cada camada e compara a imagem. Sai com 1 se reprovar.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from Functions import editor_imagem as ei  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
W, H = 1000, 600
erros = []
CASOS = [("Fundo azul", "#1e78dc", None), ("Faixa laranja", "#e6a700", (600, 100, 900, 500))]
# degradês (L.pre do editor): o desenho é conferido pelo teste do app; aqui, o que vai e volta do arquivo
DEGRADES = [
    ("Degradê linear", {"tipo": "degrade", "grad": {"cores": [[0, "#1e78dc"], [0.5, "#fac828"], [1, "#dc1e1e"]], "ops": [[0, 100], [1, 100]]},
                        "estilo": "linear", "ang": 30, "escala": 100, "inverter": False, "alinhar": True, "ofx": 0, "ofy": 0}),
    ("Degradê radial", {"tipo": "degrade", "grad": {"cores": [[0, "#ffffff"], [1, "#28a05a"]], "ops": [[0, 100], [1, 0]]},
                        "estilo": "radial", "ang": 90, "escala": 80, "inverter": True, "alinhar": False, "ofx": 10, "ofy": -5}),
]


def falha(msg):
    erros.append(msg)
    print("  ✗", msg)


def cor_de(layer):
    from psd_tools.constants import Tag
    c = layer.tagged_blocks.get_data(Tag.SOLID_COLOR_SHEET_SETTING)[b"Clr "]
    return "#%02x%02x%02x" % tuple(int(round(float(c[k]))) for k in (b"Rd  ", b"Grn ", b"Bl  "))


def montar(destino):
    from psd_tools import PSDImage
    psd = PSDImage.new("RGB", (W, H), color=(255, 255, 255))
    ei._nova_pixel(psd, Image.new("RGBA", (W, H), (255, 255, 255, 255)), "Fundo", 0, 0)
    esperado = Image.new("RGB", (W, H), (255, 255, 255))
    for nome, cor, rect in CASOS:
        rgb = tuple(int(cor[k:k + 2], 16) for k in (1, 3, 5))
        ob = ei._nova_pixel(psd, Image.new("RGBA", (W, H), rgb + (255,)), nome, 0, 0)
        ei._preenchimento(ob, cor)
        if rect:   # máscara como o editor manda (seleção → máscara)
            m = Image.new("L", (rect[2] - rect[0], rect[3] - rect[1]), 255)
            ob.create_mask(m, top=rect[1], left=rect[0])
            ob._record.mask_data.background_color = 0
            esperado.paste(rgb, rect)
        else:
            esperado.paste(rgb, (0, 0, W, H))
    for nome, pre in DEGRADES:   # pixels de mentira: o Photoshop redesenha a partir do GdFl
        ob = ei._nova_pixel(psd, Image.new("RGBA", (W, H), (128, 128, 128, 255)), nome, 0, 0)
        ob.visible = False
        ei._preenchimento(ob, pre)
    ei._gravar_achatado(psd, esperado.convert("RGBA"), W, H, novo=True)
    psd.save(destino)
    return esperado


def conferir_psd_tools(path):
    from psd_tools import PSDImage
    por_nome = {l.name: l for l in PSDImage.open(path)}
    for nome, cor, rect in CASOS:
        l = por_nome.get(nome)
        if l is None or l.kind != "solidcolorfill":
            falha(f"{nome}: não é camada de preenchimento ({l.kind if l else 'sumiu'})")
            continue
        if cor_de(l) != cor:
            falha(f"{nome}: cor {cor_de(l)}")
        print(f"  ✓ {nome}: camada de preenchimento {cor}" + (" com máscara" if rect else ""))
    for nome, pre in DEGRADES:
        l = por_nome.get(nome)
        if l is None or l.kind != "gradientfill":
            falha(f"{nome}: não é preenchimento de degradê ({l.kind if l else 'sumiu'})")
            continue
        lido = ei._grad_pre(l)
        lido["grad"].pop("nome", None)
        if lido["grad"].pop("suave", 0) != 0:
            falha(f"{nome}: suavidade do degradê feito no editor deveria ir 0%")
        if lido != pre:
            falha(f"{nome}: voltou diferente {lido}")
        else:
            print(f"  ✓ {nome}: preenchimento de degradê, volta igual (estilo, ângulo, escala, inverter, alinhar, deslocamento, paradas)")


def ps():
    import win32com.client
    a = win32com.client.Dispatch("Photoshop.Application")
    a._FlagAsMethod("DoJavaScript")
    return a


LER = r'''
function info(l) {
  var r = new ActionReference(); r.putIdentifier(charIDToTypeID("Lyr "), l.id); var d = executeActionGet(r);
  if (!d.hasKey(stringIDToTypeID("adjustment"))) return l.name + "|pixels";
  var a = d.getList(stringIDToTypeID("adjustment")), tipo = typeIDToStringID(a.getObjectType(0)), o = a.getObjectValue(0);
  function h(v) { var s = Math.round(v).toString(16); return s.length < 2 ? "0" + s : s; }
  function hc(c) { return "#" + h(c.getDouble(charIDToTypeID("Rd  "))) + h(c.getDouble(charIDToTypeID("Grn "))) + h(c.getDouble(charIDToTypeID("Bl  "))); }
  if (tipo == "gradientLayer") {
    var g = o.getObjectValue(charIDToTypeID("Grad")), cs = g.getList(charIDToTypeID("Clrs")), ts = g.getList(charIDToTypeID("Trns")), cores = [], ops = [];
    for (var i = 0; i < cs.count; i++) { var s = cs.getObjectValue(i); cores.push(Math.round(s.getInteger(charIDToTypeID("Lctn")) / 40.96) + "%" + hc(s.getObjectValue(charIDToTypeID("Clr ")))); }
    for (var i = 0; i < ts.count; i++) { var t = ts.getObjectValue(i); ops.push(Math.round(t.getInteger(charIDToTypeID("Lctn")) / 40.96) + "%=" + Math.round(t.getUnitDoubleValue(charIDToTypeID("Opct")))); }
    var k = function (id) { return o.hasKey(charIDToTypeID(id)) ? o : null; };
    return l.name + "|" + tipo + "|" + typeIDToStringID(o.getEnumerationValue(charIDToTypeID("Type"))) + " " + Math.round(o.getUnitDoubleValue(charIDToTypeID("Angl"))) + "°" +
      // campo no valor padrão o Photoshop não lista: ausente = padrão (escala 100, sem inverter, alinhado)
      " esc=" + (o.hasKey(charIDToTypeID("Scl ")) ? Math.round(o.getUnitDoubleValue(charIDToTypeID("Scl "))) : 100) +
      " inv=" + (o.hasKey(charIDToTypeID("Rvrs")) ? o.getBoolean(charIDToTypeID("Rvrs")) : false) +
      " alin=" + (o.hasKey(charIDToTypeID("Algn")) ? o.getBoolean(charIDToTypeID("Algn")) : true) + " | " + cores.join(",") + " | " + ops.join(",");
  }
  return l.name + "|" + tipo + "|" + hc(o.getObjectValue(charIDToTypeID("Clr ")));
}'''


def conferir_photoshop(path, esperado, pasta):
    png = os.path.join(pasta, "pre_photoshop.png").replace("\\", "/")
    r = str(ps().DoJavaScript(LER + r'''
app.displayDialogs = DialogModes.NO;
var d = app.open(new File("%s")), out = [];
try { for (var i = 0; i < d.artLayers.length; i++) out.push(info(d.artLayers[i])); d.saveAs(new File("%s"), new PNGSaveOptions(), true); }
finally { d.close(SaveOptions.DONOTSAVECHANGES); } out.join("\n");''' % (path.replace("\\", "/"), png)))
    lidas = {ln.split("|")[0]: ln.split("|")[1:] for ln in r.splitlines()}
    print("  Photoshop leu:")
    for n, v in lidas.items():
        print("    ", n, v)
    for nome, cor, _ in CASOS:
        if lidas.get(nome) != ["solidColorLayer", cor]:
            falha(f"Photoshop: {nome} = {lidas.get(nome)}")
    esperados = {"Degradê linear": ["gradientLayer", "linear 30° esc=100 inv=false alin=true ", " 0%#1e78dc,50%#fac828,100%#dc1e1e ", " 0%=100,100%=100"],
                 "Degradê radial": ["gradientLayer", "radial 90° esc=80 inv=true alin=false ", " 0%#ffffff,100%#28a05a ", " 0%=100,100%=0"]}
    for nome, esp in esperados.items():
        if lidas.get(nome) != esp:
            falha(f"Photoshop: {nome} = {lidas.get(nome)} (esperado {esp})")
    feito = np.asarray(Image.open(png).convert("RGB")).astype(int)
    dif = float(np.abs(feito - np.asarray(esperado).astype(int)).mean())
    print(f"  Photoshop: diferença média da imagem {dif:.3f}")
    if dif > 0.5:
        falha("Photoshop: imagem diferente do esperado")


def conferir_ida_e_volta(pasta):
    """Preenchimento feito NO Photoshop, cor trocada como a ida e volta do editor faz, reaberto lá."""
    from psd_tools import PSDImage
    molde = os.path.join(pasta, "pre_feito_no_ps.psd").replace("\\", "/")
    novo = os.path.join(pasta, "pre_feito_no_ps_cor_nova.psd").replace("\\", "/")
    ps().DoJavaScript(r'''
app.displayDialogs = DialogModes.NO;
var doc = app.documents.add(400, 300, 72, "pre_ps_kanivete", NewDocumentMode.RGB, DocumentFill.WHITE);
try {
  var d = new ActionDescriptor(), ref = new ActionReference(); ref.putClass(stringIDToTypeID("contentLayer")); d.putReference(charIDToTypeID("null"), ref);
  var u = new ActionDescriptor(), cor = new ActionDescriptor(), rgb = new ActionDescriptor();
  rgb.putDouble(charIDToTypeID("Rd  "), 30); rgb.putDouble(charIDToTypeID("Grn "), 120); rgb.putDouble(charIDToTypeID("Bl  "), 220);
  cor.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), rgb); u.putObject(charIDToTypeID("Type"), stringIDToTypeID("solidColorLayer"), cor);
  d.putObject(charIDToTypeID("Usng"), stringIDToTypeID("contentLayer"), u); executeAction(charIDToTypeID("Mk  "), d, DialogModes.NO);
  doc.activeLayer.name = "Cor do PS";
  var o = new PhotoshopSaveOptions(); o.layers = true; doc.saveAs(new File("%s"), o, true);
} finally { doc.close(SaveOptions.DONOTSAVECHANGES); } "ok";''' % molde)
    p = PSDImage.open(molde)
    alvo = [l for l in p if l.name == "Cor do PS"][0]
    ei._preenchimento(alvo, "#e6a700")
    ei._incorporados_v7(p)
    p.save(novo)
    r = str(ps().DoJavaScript(LER + r'''
app.displayDialogs = DialogModes.NO; var r;
try { var d = app.open(new File("%s")); r = info(d.artLayers.getByName("Cor do PS")); d.close(SaveOptions.DONOTSAVECHANGES); } catch (e) { r = "ERRO " + e; } r;''' % novo))
    if r != "Cor do PS|solidColorLayer|#e6a700":
        falha(f"Photoshop: preenchimento feito nele com a cor trocada = {r}")
    else:
        print("  ✓ preenchimento feito no Photoshop, cor trocada pela ida e volta: o Photoshop lê a cor nova")


def main():
    pasta = os.path.join(os.environ.get("TEMP") or tempfile.gettempdir(), "canivete_teste_psd_pre")
    os.makedirs(pasta, exist_ok=True)
    path = os.path.join(pasta, f"pre_novos_{os.getpid()}.psd")
    esperado = montar(path)
    print("PSD:", path)
    conferir_psd_tools(path)
    if "--photoshop" in sys.argv:
        conferir_photoshop(path, esperado, pasta)
        conferir_ida_e_volta(pasta)
    print("REPROVADO" if erros else "OK", f"({len(erros)} erro(s))")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
