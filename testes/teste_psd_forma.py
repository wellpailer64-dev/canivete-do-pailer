"""Forma criada no Photo Kanivete → camada de forma EDITÁVEL no PSD (Functions/editor_imagem._forma_nova).

    py -3.13 testes/teste_psd_forma.py [--photoshop]

Monta um PSD com formas novas (retângulo, elipse em Bézier, furo = subtrair, interseção, exclusão, demarcador aberto),
relê com o psd-tools e confere que cada uma é camada de forma com a cor e os pontos certos. Com --photoshop abre no
Photoshop (COM), manda redesenhar cada forma a partir do vetor (troca a cor e volta) e compara a imagem com o desenho
esperado: é o que confere a geometria e o sentido de cada operação. Sai com 1 se reprovar.
"""
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np  # noqa: E402
from PIL import Image, ImageChops, ImageDraw  # noqa: E402

from Functions import editor_imagem as ei  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
W, H = 1200, 800
FUNDO = "--sem-fundo" not in sys.argv
erros = []


def falha(msg):
    erros.append(msg)
    print("  ✗", msg)


def ret(x, y, w, h, op="somar"):
    return {"op": op, "fechado": True, "pts": [{"x": x, "y": y}, {"x": x + w, "y": y}, {"x": x + w, "y": y + h}, {"x": x, "y": y + h}]}


def elipse(cx, cy, rx, ry, op="somar"):
    k = 0.5522847498
    pts = []
    for ang in (0, 90, 180, 270):   # sentido horário na tela (y para baixo)
        a = math.radians(ang)
        ux, uy = math.cos(a), math.sin(a)          # ponto
        tx, ty = -math.sin(a), math.cos(a)         # tangente no sentido do traçado
        x, y = cx + rx * ux, cy + ry * uy
        pts.append({"x": x, "y": y, "i": [x - k * rx * tx, y - k * ry * ty], "o": [x + k * rx * tx, y + k * ry * ty]})
    return {"op": op, "fechado": True, "pts": pts}


CASOS = [
    ("Retângulo", "#1e78dc", [ret(60, 60, 300, 180)]),
    ("Elipse", "#dc3c1e", [elipse(560, 150, 150, 90)]),
    ("Furo", "#2a9d4a", [ret(820, 60, 320, 260), ret(900, 120, 160, 140, "subtrair")]),
    ("Interseção", "#8e44ad", [ret(60, 340, 260, 200), ret(180, 420, 260, 200, "inter")]),
    ("Exclusão", "#e6a700", [ret(520, 340, 260, 200), ret(640, 420, 260, 200, "excluir")]),
    ("Aberta", "#00838f", [{"op": "somar", "fechado": False, "pts": [{"x": 960, "y": 380}, {"x": 1140, "y": 740}, {"x": 900, "y": 740}]}]),
]


def bezier_poligono(s, passos=24):
    pts = s["pts"]
    out = []
    n = len(pts)
    for k in range(n):
        a, b = pts[k], pts[(k + 1) % n]
        p0 = (a["x"], a["y"])
        p1 = tuple(a.get("o") or p0)
        p3 = (b["x"], b["y"])
        p2 = tuple(b.get("i") or p3)
        for t in range(passos):
            t /= passos
            mt = 1 - t
            out.append((mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
                        mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1]))
    return out


def mascara(subs):
    """Desenho esperado (operações na ordem, como o Photoshop e o editor), em 4× para suavizar a borda."""
    E = 4
    m = Image.new("L", (W * E, H * E), 0)
    for s in subs:
        t = Image.new("L", m.size, 0)
        ImageDraw.Draw(t).polygon([(x * E, y * E) for x, y in bezier_poligono(s)], fill=255)
        op = s["op"]
        if op == "somar":
            m = ImageChops.lighter(m, t)
        elif op == "subtrair":
            m = ImageChops.subtract(m, t)
        elif op == "inter":
            m = ImageChops.darker(m, t)
        elif op == "excluir":
            m = ImageChops.difference(m, t)
    return m.resize((W, H), Image.LANCZOS)


def montar(destino):
    from psd_tools import PSDImage
    psd = PSDImage.new("RGB", (W, H), color=(255, 255, 255))
    esperado = Image.new("RGB", (W, H), (255, 255, 255))
    if FUNDO:   # como um documento do editor: camada de fundo de pixels embaixo das formas
        ei._nova_pixel(psd, Image.new("RGBA", (W, H), (255, 255, 255, 255)), "Fundo", 0, 0)
    for nome, cor, subs in CASOS:
        m = mascara(subs)
        bb = m.getbbox()
        rgb = tuple(int(cor[k:k + 2], 16) for k in (1, 3, 5))
        camada = Image.new("RGBA", (W, H), rgb + (0,))
        camada.putalpha(m)
        esperado.paste(Image.new("RGB", (W, H), rgb), (0, 0), m)
        ob = ei._nova_pixel(psd, camada.crop(bb), nome, bb[0], bb[1])
        ei._forma_nova(ob, {"cor": cor, "subs": subs}, W, H)
    # achatado como o salvamento do editor grava (sem fundo = transparente: 4 canais e contagem negativa)
    comp = Image.new("RGBA", (W, H), (255, 255, 255, 255 if FUNDO else 0))
    for nome, cor, subs in CASOS:
        rgb = tuple(int(cor[k:k + 2], 16) for k in (1, 3, 5))
        camada = Image.new("RGBA", (W, H), rgb + (0,))
        camada.putalpha(mascara(subs))
        comp = Image.alpha_composite(comp, camada)
    ei._gravar_achatado(psd, comp, W, H, novo=True)
    psd.save(destino)
    return esperado


def conferir_psd_tools(path):
    from psd_tools import PSDImage
    from psd_tools.constants import Tag
    por_nome = {l.name: l for l in PSDImage.open(path)}
    for nome, cor, subs in CASOS:
        l = por_nome.get(nome)
        if l is None or l.kind != "shape":
            falha(f"{nome}: não é camada de forma ({l.kind if l else 'sumiu'})")
            continue
        so = l.tagged_blocks.get_data(Tag.SOLID_COLOR_SHEET_SETTING)
        c = "#%02x%02x%02x" % tuple(int(round(float(so[b"Clr "][k]))) for k in (b"Rd  ", b"Grn ", b"Bl  "))
        if c != cor:
            falha(f"{nome}: cor {c}")
        vm = l.tagged_blocks.get_data(Tag.VECTOR_MASK_SETTING1)
        caminhos = [p for p in vm.path if type(p).__name__ in ("ClosedPath", "OpenPath")]
        if len(caminhos) != len(subs):
            falha(f"{nome}: {len(caminhos)} subdemarcadores (esperado {len(subs)})")
            continue
        for p, s in zip(caminhos, subs):
            if (type(p).__name__ == "ClosedPath") != s["fechado"]:
                falha(f"{nome}: fechado/aberto trocado")
            if p.operation != ei._OP_DEMARCADOR[s["op"]]:
                falha(f"{nome}: operação {p.operation}")
            for k, q in zip(p, s["pts"]):
                y, x = k.anchor
                if abs(x * W - q["x"]) > 0.05 or abs(y * H - q["y"]) > 0.05:
                    falha(f"{nome}: ponto {x * W:.2f},{y * H:.2f} (esperado {q['x']},{q['y']})")
                    break
        print(f"  ✓ {nome}: forma, cor, {len(subs)} subdemarcador(es) com operação e pontos")


def conferir_photoshop(path, esperado, pasta):
    import win32com.client
    ps = win32com.client.Dispatch("Photoshop.Application")
    ps._FlagAsMethod("DoJavaScript")
    png = os.path.join(pasta, "forma_photoshop.png")
    jsx = r'''
app.displayDialogs = DialogModes.NO;
var d = app.open(new File("%s")), out = [];
function corDe(l) { var r = new ActionReference(); r.putIdentifier(charIDToTypeID("Lyr "), l.id); return executeActionGet(r); }
function setCor(rr, gg, bb) {   // troca a cor da camada de forma ativa: o Photoshop redesenha a partir do vetor
  var d2 = new ActionDescriptor(), ref = new ActionReference(); ref.putEnumerated(stringIDToTypeID("contentLayer"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
  d2.putReference(charIDToTypeID("null"), ref);
  var u = new ActionDescriptor(), c = new ActionDescriptor(); c.putDouble(charIDToTypeID("Rd  "), rr); c.putDouble(charIDToTypeID("Grn "), gg); c.putDouble(charIDToTypeID("Bl  "), bb);
  u.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), c);
  d2.putObject(charIDToTypeID("T   "), stringIDToTypeID("solidColorLayer"), u);
  executeAction(charIDToTypeID("setd"), d2, DialogModes.NO);
}
try {
  for (var i = 0; i < d.artLayers.length; i++) {
    var l = d.artLayers[i];
    if (l.isBackgroundLayer) continue;
    d.activeLayer = l;
    var desc = corDe(l), k = desc.hasKey(stringIDToTypeID("layerKind")) ? desc.getInteger(stringIDToTypeID("layerKind")) : -1;
    var adj = desc.hasKey(stringIDToTypeID("adjustment")) ? typeIDToStringID(desc.getList(stringIDToTypeID("adjustment")).getObjectType(0)) : "";
    var vet = desc.hasKey(stringIDToTypeID("hasVectorMask")) && desc.getBoolean(stringIDToTypeID("hasVectorMask"));
    out.push(l.name + "|" + k + "|" + adj + "|" + vet);
    if (adj == "solidColorLayer") {
      var c = desc.getList(stringIDToTypeID("adjustment")).getObjectValue(0).getObjectValue(charIDToTypeID("Clr "));
      var rr = c.getDouble(charIDToTypeID("Rd  ")), gg = c.getDouble(charIDToTypeID("Grn ")), bb = c.getDouble(charIDToTypeID("Bl  "));
      setCor(0, 0, 0); setCor(rr, gg, bb);
    }
  }
  d.saveAs(new File("%s"), new PNGSaveOptions(), true);
} finally { d.close(SaveOptions.DONOTSAVECHANGES); }
out.join("\n");
''' % (path.replace("\\", "/"), png.replace("\\", "/"))
    r = str(ps.DoJavaScript(jsx))
    print("  Photoshop leu:")
    for ln in r.splitlines():
        print("   ", ln)
        nome, k, adj, vet = ln.split("|")
        if nome != "Fundo" and (adj != "solidColorLayer" or vet != "true"):
            falha(f"Photoshop: {nome} não é camada de forma (cor sólida + máscara vetorial)")
    feito = Image.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, 255)), Image.open(png).convert("RGBA"))
    feito = np.asarray(feito.convert("RGB")).astype(int)
    alvo = np.asarray(esperado).astype(int)
    dif = np.abs(feito - alvo).max(2)
    media = float(np.abs(feito - alvo).mean())
    ruins = int((dif > 100).sum())
    print(f"  Photoshop redesenhou: diferença média {media:.3f}, pixels muito diferentes {ruins}")
    Image.fromarray(np.concatenate([alvo, feito], 1).astype(np.uint8)).resize((W, H // 2)).save(os.path.join(pasta, "forma_comparar.png"))
    if media > 1.0 or ruins > 400:   # borda suavizada diferente dá algumas centenas de pixels; forma errada dá milhares
        falha("Photoshop: desenho diferente do esperado (veja forma_comparar.png)")


def main():
    pasta = os.path.join(os.environ.get("TEMP") or tempfile.gettempdir(), "canivete_teste_psd_forma")
    os.makedirs(pasta, exist_ok=True)
    path = os.path.join(pasta, f"formas_novas_{os.getpid()}.psd")
    esperado = montar(path)
    print("PSD:", path)
    conferir_psd_tools(path)
    if "--photoshop" in sys.argv:
        conferir_photoshop(path, esperado, pasta)
    print("REPROVADO" if erros else "OK", f"({len(erros)} erro(s))")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
