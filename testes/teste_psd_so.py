"""Objeto inteligente criado no Photo Kanivete → objeto inteligente INCORPORADO no PSD (Functions/editor_imagem._so_novo).

    py -3.13 testes/teste_psd_so.py [--photoshop]

Monta um PSD com três objetos (sem transformação, 50% e girado 30° + escala), relê com o psd-tools e confere tipo,
cantos, tamanho, o PNG incorporado (idêntico ao original) e o uuid ligando a camada ao arquivo. Com --photoshop abre
no Photoshop (COM), abre o conteúdo de cada um (Editar conteúdo) e confere o tamanho, reduz a 50% e volta a 200% (num
objeto inteligente de verdade isso sai do original, sem perda) e compara a imagem com o esperado. Sai com 1 se reprovar.
"""
import io
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from Functions import editor_imagem as ei  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
W, H = 1200, 800
erros = []


def falha(msg):
    erros.append(msg)
    print("  ✗", msg)


def conteudo(w, h, cor):
    im = Image.new("RGBA", (w, h), cor + (255,))
    d = ImageDraw.Draw(im)
    d.ellipse([w * 0.2, h * 0.15, w * 0.8, h * 0.85], fill=(250, 210, 40, 255))
    d.rectangle([0, 0, w * 0.15, h * 0.15], fill=(220, 30, 30, 255))
    for k in range(0, w, 24):   # listras finas: escala com perda apareceria
        d.line([(k, h - 30), (k + 12, h - 1)], fill=(255, 255, 255, 255), width=3)
    return im


def matriz(cx, cy, esc, ang, x0, y0, w, h):
    """x' = M·x: escala e giro em torno do centro do conteúdo colocado em (x0, y0), centro final em (cx, cy)."""
    a = math.radians(ang)
    c, s = math.cos(a) * esc, math.sin(a) * esc
    ox, oy = x0 + w / 2, y0 + h / 2
    return [c, s, -s, c, cx - (c * ox - s * oy), cy - (s * ox + c * oy)]


CASOS = [
    ("Foto parada", (40, 110, 210), 360, 240, (60, 60), matriz(240, 180, 1.0, 0, 60, 60, 360, 240)),
    ("Foto 50%", (40, 170, 90), 600, 400, (500, 40), matriz(700, 160, 0.5, 0, 500, 40, 600, 400)),
    ("Foto girada", (150, 60, 180), 420, 280, (300, 380), matriz(820, 560, 0.8, 30, 300, 380, 420, 280)),
]


def pt(M, x, y):
    return M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]


def render(im, M, x0, y0):
    """Conteúdo transformado no documento (RGBA do tamanho do documento)."""
    a, b, c, d, e, f = M
    det = a * d - b * c
    # PIL quer o inverso (do destino para a origem), em coordenadas do conteúdo
    ia, ib, ic, id_ = d / det, -c / det, -b / det, a / det
    ie = -(ia * e + ib * f) - x0
    if_ = -(ic * e + id_ * f) - y0
    return im.transform((W, H), Image.AFFINE, (ia, ib, ie, ic, id_, if_), resample=Image.BICUBIC)


def montar(destino):
    from psd_tools import PSDImage
    psd = PSDImage.new("RGB", (W, H), color=(255, 255, 255))
    ei._nova_pixel(psd, Image.new("RGBA", (W, H), (255, 255, 255, 255)), "Fundo", 0, 0)
    esperado = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    pngs = {}
    for nome, cor, w, h, (x0, y0), M in CASOS:
        im = conteudo(w, h, cor)
        buf = io.BytesIO()
        im.save(buf, "PNG")
        pngs[nome] = buf.getvalue()
        camada = render(im, M, x0, y0)
        esperado = Image.alpha_composite(esperado, camada)
        bb = camada.getbbox()
        ob = ei._nova_pixel(psd, camada.crop(bb), nome, bb[0], bb[1])
        cantos = [v for q in ((x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)) for v in pt(M, *q)]
        ei._so_novo(psd, ob, {"w": w, "h": h, "cantos": cantos, "nome": nome}, pngs[nome])
    ei._gravar_achatado(psd, esperado, W, H, novo=True)
    ei._incorporados_v7(psd)   # como o salvamento do editor
    psd.save(destino)
    return esperado.convert("RGB"), pngs


def conferir_psd_tools(path, pngs):
    from psd_tools import PSDImage
    from psd_tools.constants import Tag
    psd = PSDImage.open(path)
    arquivos = {it.uuid: it for it in psd._record.layer_and_mask_information.tagged_blocks.get_data(Tag.LINKED_LAYER2)}
    por_nome = {l.name: l for l in psd}
    for nome, cor, w, h, (x0, y0), M in CASOS:
        l = por_nome.get(nome)
        if l is None or l.kind != "smartobject":
            falha(f"{nome}: não é objeto inteligente ({l.kind if l else 'sumiu'})")
            continue
        d = l.tagged_blocks.get_data(Tag.SMART_OBJECT_LAYER_DATA1).data
        u = d[b"Idnt"].value.strip("\x00")
        it = arquivos.get(u)
        if it is None:
            falha(f"{nome}: arquivo incorporado {u} não está no lnk2")
        elif bytes(it.data) != pngs[nome]:
            falha(f"{nome}: PNG incorporado diferente do original")
        if (float(d[b"Sz  "][b"Wdth"]), float(d[b"Sz  "][b"Hght"])) != (w, h):
            falha(f"{nome}: tamanho {d[b'Sz  ']}")
        cantos = [float(v) for v in d[b"Trnf"]]
        esp = [v for q in ((x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)) for v in pt(M, *q)]
        if any(abs(a - b) > 1e-6 for a, b in zip(cantos, esp)):
            falha(f"{nome}: cantos {cantos}")
        pl = l.tagged_blocks.get_data(Tag.PLACED_LAYER2)
        if pl.uuid.decode().strip("\x00") != u:
            falha(f"{nome}: uuid do PlLd diferente do SoLd")
        print(f"  ✓ {nome}: objeto inteligente, cantos, tamanho {w}×{h}, PNG incorporado idêntico")
    if len(arquivos) != len(CASOS) or len({l.tagged_blocks.get_data(Tag.SMART_OBJECT_LAYER_DATA1).data[b"Idnt"].value for l in psd if l.kind == 'smartobject'}) != len(CASOS):
        falha("uuid repetido ou arquivo a mais/menos no lnk2")


def conferir_photoshop(path, esperado, pasta):
    import win32com.client
    ps = win32com.client.Dispatch("Photoshop.Application")
    ps._FlagAsMethod("DoJavaScript")
    png = os.path.join(pasta, "so_photoshop.png")
    jsx = r'''
app.displayDialogs = DialogModes.NO; app.preferences.rulerUnits = Units.PIXELS;
var d = app.open(new File("%s")), out = [];
try {
  for (var i = 0; i < d.artLayers.length; i++) {
    var l = d.artLayers[i];
    if (l.kind != LayerKind.SMARTOBJECT) { out.push(l.name + "|nao-SO"); continue; }
    d.activeLayer = l;
    executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);
    var c = app.activeDocument, tam = c.width.as("px") + "x" + c.height.as("px"); c.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = d; d.activeLayer = l;
    l.resize(50, 50, AnchorPosition.MIDDLECENTER); l.resize(200, 200, AnchorPosition.MIDDLECENTER);
    out.push(l.name + "|" + tam);
  }
  d.saveAs(new File("%s"), new PNGSaveOptions(), true);
} finally { d.close(SaveOptions.DONOTSAVECHANGES); }
out.join("\n");
''' % (path.replace("\\", "/"), png.replace("\\", "/"))
    r = str(ps.DoJavaScript(jsx))
    print("  Photoshop:")
    tams = {}
    for ln in r.splitlines():
        print("   ", ln)
        nome, v = ln.split("|")
        tams[nome] = v
    for nome, cor, w, h, *_ in CASOS:
        if tams.get(nome) != f"{w}x{h}":
            falha(f"Photoshop: conteúdo de {nome} = {tams.get(nome)} (esperado {w}x{h})")
    feito = np.asarray(Image.open(png).convert("RGB")).astype(int)
    alvo = np.asarray(esperado).astype(int)
    media = float(np.abs(feito - alvo).mean())
    ruins = int((np.abs(feito - alvo).max(2) > 100).sum())
    print(f"  Photoshop (50% e volta a 200%): diferença média {media:.3f}, pixels muito diferentes {ruins}")
    Image.fromarray(np.concatenate([alvo, feito], 1).astype(np.uint8)).resize((W, H // 2)).save(os.path.join(pasta, "so_comparar.png"))
    if media > 1.5 or ruins > 1500:   # reamostragem do Photoshop × PIL dá borda diferente; perda de qualidade dá muito mais
        falha("Photoshop: imagem diferente do esperado (veja so_comparar.png)")


def conferir_regravado(pasta):
    """Caso que já existia: PSD com objeto inteligente feito NO PHOTOSHOP (item do lnk2 na versão 8), regravado pelo
    psd-tools como o salvamento de ida e volta faz. Sem _incorporados_v7 o Photoshop recusa abrir."""
    import win32com.client
    from psd_tools import PSDImage
    ps = win32com.client.Dispatch("Photoshop.Application")
    ps._FlagAsMethod("DoJavaScript")
    png = os.path.join(pasta, "conteudo.png").replace("\\", "/")
    conteudo(300, 200, (30, 120, 220)).save(png)
    molde = os.path.join(pasta, "feito_no_ps.psd").replace("\\", "/")
    regravado = os.path.join(pasta, "feito_no_ps_regravado.psd").replace("\\", "/")
    ps.DoJavaScript(r'''
app.displayDialogs = DialogModes.NO; app.preferences.rulerUnits = Units.PIXELS;
var doc = app.documents.add(800, 500, 72, "so_ps_kanivete", NewDocumentMode.RGB, DocumentFill.WHITE);
try { var d = new ActionDescriptor(); d.putPath(charIDToTypeID("null"), new File("%s"));
  executeAction(charIDToTypeID("Plc "), d, DialogModes.NO);
  var o = new PhotoshopSaveOptions(); o.layers = true; doc.saveAs(new File("%s"), o, true);
} finally { doc.close(SaveOptions.DONOTSAVECHANGES); } "ok";''' % (png, molde))
    p = PSDImage.open(molde)
    ei._incorporados_v7(p)
    p.save(regravado)
    r = str(ps.DoJavaScript(r'''app.displayDialogs = DialogModes.NO; var r;
try { var d = app.open(new File("%s")); r = "abriu " + d.layers.length; d.close(SaveOptions.DONOTSAVECHANGES); } catch (e) { r = "ERRO " + e; } r;''' % regravado))
    if not r.startswith("abriu"):
        falha(f"Photoshop: PSD feito nele e regravado não abre ({r})")
    else:
        print("  ✓ PSD com objeto inteligente feito no Photoshop, regravado pelo Kanivete, abre no Photoshop")


def main():
    pasta = os.path.join(os.environ.get("TEMP") or tempfile.gettempdir(), "canivete_teste_psd_so")
    os.makedirs(pasta, exist_ok=True)
    path = os.path.join(pasta, f"so_novos_{os.getpid()}.psd")
    esperado, pngs = montar(path)
    print("PSD:", path)
    conferir_psd_tools(path, pngs)
    if "--photoshop" in sys.argv:
        conferir_photoshop(path, esperado, pasta)
        conferir_regravado(pasta)
    print("REPROVADO" if erros else "OK", f"({len(erros)} erro(s))")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
