"""Gera no Photoshop camadas de preenchimento de cor sólida (sem seleção e com seleção → máscara): molde."""
import win32com.client
SAIDA = "D:/kanivete_testes/psd_pre/modelo_pre.psd"
ps = win32com.client.Dispatch("Photoshop.Application"); ps._FlagAsMethod("DoJavaScript")
jsx = r'''
app.displayDialogs = DialogModes.NO; app.preferences.rulerUnits = Units.PIXELS;
var doc = app.documents.add(1000, 600, 72, "modelo_pre_kanivete", NewDocumentMode.RGB, DocumentFill.WHITE);
function preenchimento(nome, r, g, b) {
  var d = new ActionDescriptor(), ref = new ActionReference(); ref.putClass(stringIDToTypeID("contentLayer")); d.putReference(charIDToTypeID("null"), ref);
  var u = new ActionDescriptor(), cor = new ActionDescriptor(), rgb = new ActionDescriptor();
  rgb.putDouble(charIDToTypeID("Rd  "), r); rgb.putDouble(charIDToTypeID("Grn "), g); rgb.putDouble(charIDToTypeID("Bl  "), b);
  cor.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), rgb);
  u.putObject(charIDToTypeID("Type"), stringIDToTypeID("solidColorLayer"), cor);
  d.putObject(charIDToTypeID("Usng"), stringIDToTypeID("contentLayer"), u);
  executeAction(charIDToTypeID("Mk  "), d, DialogModes.NO);
  doc.activeLayer.name = nome;
}
try {
  doc.selection.deselect();
  preenchimento("cheio", 30, 120, 220);
  doc.selection.select([[600, 100], [900, 100], [900, 500], [600, 500]]);
  preenchimento("com selecao", 220, 60, 30);
  doc.selection.deselect();
  var o = new PhotoshopSaveOptions(); o.layers = true; doc.saveAs(new File("%s"), o, true);
} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }
"ok";
''' % SAIDA
print(ps.DoJavaScript(jsx))
