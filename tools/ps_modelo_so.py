"""Gera no Photoshop um PSD com um PNG colocado como objeto inteligente incorporado (escalado e girado): molde do SoLd."""
import sys, win32com.client
SAIDA = "D:/kanivete_testes/psd_so/modelo_so.psd"; PNG = "D:/kanivete_testes/psd_so/conteudo.png"
ps = win32com.client.Dispatch("Photoshop.Application"); ps._FlagAsMethod("DoJavaScript")
jsx = r'''
app.displayDialogs = DialogModes.NO; app.preferences.rulerUnits = Units.PIXELS;
var doc = app.documents.add(1000, 600, 72, "modelo_so_kanivete", NewDocumentMode.RGB, DocumentFill.WHITE);
try {
  var d = new ActionDescriptor(); d.putPath(charIDToTypeID("null"), new File("%s"));
  d.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
  executeAction(charIDToTypeID("Plc "), d, DialogModes.NO);   // Arquivo > Colocar incorporado
  var l = doc.activeLayer; l.name = "foto";
  l.resize(150, 150, AnchorPosition.MIDDLECENTER); l.rotate(20, AnchorPosition.MIDDLECENTER); l.translate(-150, 40);
  var o = new PhotoshopSaveOptions(); o.layers = true; doc.saveAs(new File("%s"), o, true);
} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }
"ok";
''' % (PNG, SAIDA)
print(ps.DoJavaScript(jsx))
