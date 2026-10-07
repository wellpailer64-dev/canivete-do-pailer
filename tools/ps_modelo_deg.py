"""Gera no Photoshop camadas de preenchimento de DEGRADÊ (linear 3 cores 30°, radial com transparência): molde do GdFl."""
import win32com.client
SAIDA = "D:/kanivete_testes/psd_pre/modelo_deg.psd"
ps = win32com.client.Dispatch("Photoshop.Application"); ps._FlagAsMethod("DoJavaScript")
jsx = r'''
app.displayDialogs = DialogModes.NO; app.preferences.rulerUnits = Units.PIXELS;
var doc = app.documents.add(1000, 600, 72, "modelo_deg_kanivete", NewDocumentMode.RGB, DocumentFill.WHITE);
function cor(r, g, b) { var c = new ActionDescriptor(); c.putDouble(charIDToTypeID("Rd  "), r); c.putDouble(charIDToTypeID("Grn "), g); c.putDouble(charIDToTypeID("Bl  "), b); return c; }
function degrade(nome, tipo, ang, cores, ops) {
  var d = new ActionDescriptor(), ref = new ActionReference(); ref.putClass(stringIDToTypeID("contentLayer")); d.putReference(charIDToTypeID("null"), ref);
  var u = new ActionDescriptor(), g = new ActionDescriptor(), gr = new ActionDescriptor();
  gr.putString(charIDToTypeID("Nm  "), "Kanivete");
  gr.putEnumerated(charIDToTypeID("GrdF"), charIDToTypeID("GrdF"), charIDToTypeID("CstS"));
  gr.putDouble(charIDToTypeID("Intr"), 4096);
  var lc = new ActionList();
  for (var i = 0; i < cores.length; i++) { var s = new ActionDescriptor(); s.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), cor(cores[i][1], cores[i][2], cores[i][3]));
    s.putEnumerated(charIDToTypeID("Type"), charIDToTypeID("Clry"), charIDToTypeID("UsrS")); s.putInteger(charIDToTypeID("Lctn"), cores[i][0]); s.putInteger(charIDToTypeID("Mdpn"), 50); lc.putObject(charIDToTypeID("Clrt"), s); }
  gr.putList(charIDToTypeID("Clrs"), lc);
  var lt = new ActionList();
  for (var i = 0; i < ops.length; i++) { var t = new ActionDescriptor(); t.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), ops[i][1]); t.putInteger(charIDToTypeID("Lctn"), ops[i][0]); t.putInteger(charIDToTypeID("Mdpn"), 50); lt.putObject(charIDToTypeID("TrnS"), t); }
  gr.putList(charIDToTypeID("Trns"), lt);
  g.putObject(charIDToTypeID("Grad"), charIDToTypeID("Grdn"), gr);
  g.putUnitDouble(charIDToTypeID("Angl"), charIDToTypeID("#Ang"), ang);
  g.putEnumerated(charIDToTypeID("Type"), charIDToTypeID("GrdT"), charIDToTypeID(tipo));
  u.putObject(charIDToTypeID("Type"), stringIDToTypeID("gradientLayer"), g);
  d.putObject(charIDToTypeID("Usng"), stringIDToTypeID("contentLayer"), u);
  executeAction(charIDToTypeID("Mk  "), d, DialogModes.NO);
  doc.activeLayer.name = nome;
}
try {
  doc.selection.deselect();
  degrade("linear", "Lnr ", 30, [[0, 30, 120, 220], [2048, 250, 200, 40], [4096, 220, 30, 30]], [[0, 100], [4096, 100]]);
  degrade("radial", "Rdl ", 90, [[0, 255, 255, 255], [4096, 40, 160, 90]], [[0, 100], [4096, 0]]);
  var o = new PhotoshopSaveOptions(); o.layers = true; doc.saveAs(new File("%s"), o, true);
} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }
"ok";
''' % SAIDA
print(ps.DoJavaScript(jsx))
