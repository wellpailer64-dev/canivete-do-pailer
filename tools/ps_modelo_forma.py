"""Gera no Photoshop um PSD com camadas de forma (retângulo, elipse e um demarcador com furo): molde de vmsk/SoCo."""
import os, sys, win32com.client
SAIDA = sys.argv[1] if len(sys.argv) > 1 else r"D:\kanivete_testes\psd_forma\modelo_forma.psd"
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
ps = win32com.client.Dispatch("Photoshop.Application"); ps._FlagAsMethod("DoJavaScript")
jsx = r'''
app.displayDialogs = DialogModes.NO; app.preferences.rulerUnits = Units.PIXELS;
var doc = app.documents.add(1000, 600, 72, "modelo_forma_kanivete", NewDocumentMode.RGB, DocumentFill.WHITE);
function forma(nome, r, g, b, subs) {   // subs: [[op, [[x,y],...]]] → camada de forma com cor sólida
  var lista = [];
  for (var s = 0; s < subs.length; s++) {
    var pts = [];
    for (var k = 0; k < subs[s][1].length; k++) {
      var p = new PathPointInfo(); p.kind = PointKind.CORNERPOINT;
      p.anchor = subs[s][1][k]; p.leftDirection = subs[s][1][k]; p.rightDirection = subs[s][1][k]; pts.push(p);
    }
    var sp = new SubPathInfo(); sp.closed = true; sp.operation = subs[s][0]; sp.entireSubPath = pts; lista.push(sp);
  }
  var path = doc.pathItems.add("tmp_" + nome, lista);
  // camada de forma a partir do demarcador (Camada > Nova camada de preenchimento > Cor sólida com o demarcador)
  var d = new ActionDescriptor(), ref = new ActionReference(); ref.putClass(stringIDToTypeID("contentLayer")); d.putReference(charIDToTypeID("null"), ref);
  var u = new ActionDescriptor(), cor = new ActionDescriptor(), rgb = new ActionDescriptor();
  rgb.putDouble(charIDToTypeID("Rd  "), r); rgb.putDouble(charIDToTypeID("Grn "), g); rgb.putDouble(charIDToTypeID("Bl  "), b);
  cor.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), rgb);
  u.putObject(charIDToTypeID("Type"), stringIDToTypeID("solidColorLayer"), cor);
  d.putObject(charIDToTypeID("Usng"), stringIDToTypeID("contentLayer"), u);
  path.select();
  executeAction(charIDToTypeID("Mk  "), d, DialogModes.NO);
  doc.activeLayer.name = nome;
  path.remove();
}
try {
  forma("retangulo", 30, 120, 220, [[ShapeOperation.SHAPEADD, [[100,100],[400,100],[400,300],[100,300]]]]);
  forma("furo", 220, 60, 30, [[ShapeOperation.SHAPEADD, [[500,100],[900,100],[900,500],[500,500]]], [ShapeOperation.SHAPESUBTRACT, [[600,200],[800,200],[800,400],[600,400]]]]);
  var o = new PhotoshopSaveOptions(); o.layers = true; doc.saveAs(new File("%s"), o, true);
} finally { doc.close(SaveOptions.DONOTSAVECHANGES); }
"ok";
''' % SAIDA.replace("\\", "/")
print(ps.DoJavaScript(jsx))
