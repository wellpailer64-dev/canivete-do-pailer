"""Gera no Photoshop (COM + JSX) um PSD com uma camada de texto de ponto e uma de parágrafo: molde do TySh."""
import os
import sys
import win32com.client

SAIDA = sys.argv[1] if len(sys.argv) > 1 else r"D:\kanivete_testes\psd_texto\modelo_ps.psd"
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
ps = win32com.client.Dispatch("Photoshop.Application")
ps._FlagAsMethod("DoJavaScript")
jsx = r'''
app.preferences.rulerUnits = Units.PIXELS; app.preferences.typeUnits = TypeUnits.PIXELS;
app.displayDialogs = DialogModes.NO;
var doc = app.documents.add(1000, 600, 72, "modelo_texto_kanivete", NewDocumentMode.RGB, DocumentFill.WHITE);
try {
  var p = doc.artLayers.add(); p.kind = LayerKind.TEXT; p.name = "ponto";
  var t = p.textItem; t.contents = "Texto"; t.font = "ArialMT"; t.size = 48; t.position = [100, 200];
  var q = doc.artLayers.add(); q.kind = LayerKind.TEXT; q.name = "paragrafo";
  var u = q.textItem; u.kind = TextType.PARAGRAPHTEXT; u.contents = "Paragrafo"; u.font = "ArialMT"; u.size = 36;
  u.position = [100, 300]; u.width = 400; u.height = 200;
  var o = new PhotoshopSaveOptions(); o.layers = true;
  doc.saveAs(new File("%s"), o, true);
} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }
"ok";
''' % SAIDA.replace("\\", "/")
print(ps.DoJavaScript(jsx))
