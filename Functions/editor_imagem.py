"""
Editor de Imagem (frontend/js/imagem-*.js): abrir e salvar PSD/PSB e imagens comuns.

Abrir: cada camada vai para a página como PNG servido da memória (media_server.register_bytes, nada em disco: os
discos do usuário vivem cheios), com tudo o que o editor precisa para refazer o documento: posição, opacidade,
preenchimento, modo de mesclagem, máscara de corte, máscara de pixel (separada, editável), efeitos de camada
(Sombra projetada, Brilho externo, Traçado, Sobreposição de cor: a página desenha), camadas de ajuste (parâmetros
para a página aplicar) e texto (para editar).

Salvar é "de ida e volta": o PSD original é relido e só muda o que mudou no editor. Camada que não foi pintada fica
como estava no arquivo (texto continua texto, objeto inteligente continua objeto inteligente, efeitos e ajustes
continuam editáveis no Photoshop); mexer na posição/transformação de texto, objeto inteligente e forma atualiza a
matriz/os caminhos delas; pintar troca só os pixels (os efeitos ficam). Camada nova vira camada de pixels. Documento
que não veio de um PSD RGB (PNG, JPG, CMYK...) é montado do zero.

Referência das camadas: a posição em list(psd.descendants()) do arquivo de origem; depois de salvar, a página recebe
as novas referências (o arquivo salvo vira a origem).
"""

import io
import logging
import math
import os
import time
import uuid
import warnings

import numpy as np
from PIL import Image

from Functions import media_server

_DOCS = {}   # id -> {"path", "mtime", "rgb", "tokens"}
EXT_PSD = (".psd", ".psb")

# chaves do PSD que dizem o que a camada É (não vão junto quando ela vira pixels)
_TAGS_CONTEUDO = {
    "TYPE_TOOL_OBJECT_SETTING", "TYPE_TOOL_INFO", "PLACED_LAYER1", "PLACED_LAYER2", "PLACED_LAYER_DATA",
    "SMART_OBJECT_LAYER_DATA1", "SMART_OBJECT_LAYER_DATA2", "VECTOR_MASK_SETTING1", "VECTOR_MASK_SETTING2",
    "VECTOR_ORIGINATION_DATA", "VECTOR_ORIGINATION_UNKNOWN", "VECTOR_STROKE_DATA", "VECTOR_STROKE_CONTENT_DATA",
    "SOLID_COLOR_SHEET_SETTING", "GRADIENT_FILL_SETTING", "PATTERN_FILL_SETTING", "CONTENT_GENERATOR_EXTRA_DATA",
    "UNICODE_LAYER_NAME", "SECTION_DIVIDER_SETTING", "NESTED_SECTION_DIVIDER_SETTING", "LAYER_ID",
}


def _silenciar():
    warnings.filterwarnings("ignore")
    logging.getLogger("psd_tools").setLevel(logging.ERROR)


def _png(arr_ou_img, nivel=1):
    im = arr_ou_img if isinstance(arr_ou_img, Image.Image) else Image.fromarray(arr_ou_img)
    b = io.BytesIO()
    im.save(b, "PNG", compress_level=nivel)
    return b.getvalue()


def _servir(doc, dados, nome):
    tok, url = media_server.register_bytes(dados, nome, "image/png")
    doc["tokens"].append(tok)
    return url


def fechar(doc_id):
    """A página fechou o documento: solta a memória dos PNGs."""
    d = _DOCS.pop(doc_id, None)
    if d:
        media_server.unregister_bytes(d.get("tokens"))
    return {"success": True}


def liberar(doc_id):
    """A página já carregou as camadas: os PNGs saem da memória (o documento continua conhecido para salvar)."""
    d = _DOCS.get(doc_id)
    if d:
        media_server.unregister_bytes(d.get("tokens"))
        d["tokens"] = []
    return {"success": True}


def _todas(psd):
    return list(psd.descendants())


def _bm_key(layer):
    return str(layer.blend_mode).split(".")[-1]


def _dpi(psd):
    try:
        from psd_tools.constants import Resource
        r = psd.image_resources.get_data(Resource.RESOLUTION_INFO)
        v = float(getattr(r, "horizontal", 72) or 72)
        return round(v / 65536 if v > 10000 else v, 2)
    except Exception:
        return 72


# ─────────────────────────── camadas de ajuste ───────────────────────────
def _lab_rgb(L, a, b):
    """Lab (D50, como o Photoshop) → sRGB 0..255."""
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    f = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    X, Y, Z = 0.9642 * f(fx), 1.0 * f(fy), 0.8249 * f(fz)
    # D50 → sRGB (Bradford)
    r = 3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z
    g = -0.9787684 * X + 1.9161415 * Y + 0.0334540 * Z
    bb = 0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z
    gam = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return [max(0, min(255, round(gam(max(0.0, c)) * 255))) for c in (r, g, bb)]


def _s16(v):
    v = int(v)
    return v - 65536 if v > 32767 else v


def _cor_componentes(espaco, comp):
    """Cor do Photoshop (espaço, 4 componentes 16 bits) → RGB 0..255."""
    c = [int(x) for x in comp]
    if espaco == 0:   # RGB 0..65535
        return [round(x / 257) for x in c[:3]]
    if espaco == 7:   # Lab: L 0..10000, a/b -12800..12700
        return _lab_rgb(c[0] / 100, _s16(c[1]) / 100, _s16(c[2]) / 100)
    if espaco == 1:   # HSB
        import colorsys
        r, g, b = colorsys.hsv_to_rgb(c[0] / 65535, c[1] / 65535, c[2] / 65535)
        return [round(r * 255), round(g * 255), round(b * 255)]
    if espaco == 2:   # CMYK (0 = 100% de tinta)
        cc, m, y, k = [1 - x / 65535 for x in c]
        return [round(255 * (1 - cc) * (1 - k)), round(255 * (1 - m) * (1 - k)), round(255 * (1 - y) * (1 - k))]
    if espaco == 8:
        v = round(255 - c[0] / 10000 * 255)
        return [v, v, v]
    return [255, 140, 0]


def _ajuste(layer):
    """Parâmetros de uma camada de ajuste para a página aplicar; None = não sei desenhar (fica, mas sem efeito)."""
    k = layer.kind
    try:
        if k == "brightnesscontrast":
            return {"t": k, "br": int(layer.brightness), "ct": int(layer.contrast), "legado": bool(layer.use_legacy)}
        if k == "colorbalance":
            return {"t": k, "sombras": list(layer.shadows), "medios": list(layer.midtones), "luzes": list(layer.highlights),
                    "lum": bool(layer.luminosity)}
        if k == "vibrance":
            return {"t": k, "vib": int(layer.vibrance or 0), "sat": int(layer.saturation or 0)}
        if k == "huesaturation":
            m = layer.master or (0, 0, 0)
            faixas = []
            for (a, b, c, d), (h, s, l) in (layer.data or []):
                faixas.append({"f": [a, b, c, d], "v": [h, s, l]})
            col = layer.colorization or (0, 25, 0)
            return {"t": k, "h": m[0], "s": m[1], "l": m[2], "faixas": faixas,
                    "colorir": bool(layer.enable_colorization), "col": list(col)}
        if k == "photofilter":
            cor = None
            if layer.xyz:
                x, y, z = [v / 10000 for v in layer.xyz[:3]] if max(layer.xyz[:3]) > 2 else layer.xyz[:3]
                r = 3.2406 * x - 1.5372 * y - 0.4986 * z
                g = -0.9689 * x + 1.8758 * y + 0.0415 * z
                b = 0.0557 * x - 0.2040 * y + 1.0570 * z
                cor = [max(0, min(255, round(v * 255))) for v in (r, g, b)]
            elif layer.color_components:
                cor = _cor_componentes(int(layer.color_space or 0), layer.color_components)
            return {"t": k, "cor": cor or [236, 138, 0], "dens": int(layer.density or 25), "lum": bool(layer.luminosity)}
        if k == "selectivecolor":
            return {"t": k, "abs": int(layer.method or 0) == 1, "dados": [list(map(int, v)) for v in (layer.data or [])]}
        if k == "invert":
            return {"t": k}
        if k == "posterize":
            return {"t": k, "n": int(layer.posterize or 4)}
        if k == "threshold":
            return {"t": k, "n": int(layer.threshold or 128)}
        if k == "exposure":
            return {"t": k, "exp": float(layer.exposure or 0), "off": float(layer.exposure_offset or 0),
                    "gama": float(layer.gamma or 1)}
        if k == "levels":
            canais = []
            for rec in list(layer.data or [])[:4]:
                canais.append([int(rec.input_floor), int(rec.input_ceiling), int(rec.output_floor),
                               int(rec.output_ceiling), int(rec.gamma) / 100])
            return {"t": k, "canais": canais}
        if k == "curves":
            canais = {}
            d = layer.data
            for item in (getattr(d, "items", None) or []):
                pts = [[int(p[1]), int(p[0])] for p in item.points] if hasattr(item, "points") else None
                if pts:
                    canais[int(getattr(item, "channel_id", len(canais)))] = sorted(pts)
            return {"t": k, "canais": canais}
        if k == "blackandwhite":
            tint = None
            try:
                if layer.use_tint and layer.tint_color is not None:
                    c = layer.tint_color
                    tint = [float(getattr(c.get(b"Rd  "), "value", c.get(b"Rd  "))), float(getattr(c.get(b"Grn "), "value", c.get(b"Grn "))),
                            float(getattr(c.get(b"Bl  "), "value", c.get(b"Bl  ")))]
            except Exception:
                tint = None
            return {"t": k, "p": [layer.red, layer.yellow, layer.green, layer.cyan, layer.blue, layer.magenta], "tint": tint}
        if k == "gradientmap":
            stops = []
            for s in layer.color_stops or []:
                try:
                    c = s.get(b"Clr ")
                    rgb = [float(getattr(c.get(x), "value", c.get(x))) for x in (b"Rd  ", b"Grn ", b"Bl  ")]
                    stops.append([float(getattr(s.get(b"Lctn"), "value", s.get(b"Lctn"))) / 4096, rgb])
                except Exception:
                    pass
            if stops:
                return {"t": k, "stops": sorted(stops), "inv": bool(layer.reversed)}
        if k == "channelmixer":
            return {"t": k, "mono": bool(layer.monochrome), "dados": [list(map(int, v)) for v in (layer.data or [])]}
    except Exception as e:
        logging.debug("ajuste %s: %s", k, e)
    return None


def _brilho_antigo(layer):
    """Brilho/Contraste do formato antigo ('brit' sem descritor): o psd-tools vê como camada de pixels vazia."""
    try:
        from psd_tools.constants import Tag
        if Tag.BRIGHTNESS_AND_CONTRAST not in layer.tagged_blocks or layer.has_pixels():
            return None
        d = layer.tagged_blocks.get_data(Tag.BRIGHTNESS_AND_CONTRAST)
        return {"t": "brightnesscontrast", "br": int(d.brightness), "ct": int(d.contrast), "legado": True}
    except Exception:
        return None


# ─────────────────────────── abrir ───────────────────────────
def abrir(path, on_progress=None):
    _silenciar()
    if not os.path.isfile(path):
        return {"success": False, "error": "arquivo não encontrado"}
    doc_id = uuid.uuid4().hex[:12]
    doc = {"path": os.path.abspath(path), "mtime": os.stat(path).st_mtime_ns, "rgb": False, "tokens": []}
    try:
        if path.lower().endswith(EXT_PSD):
            r = _abrir_psd(path, doc, on_progress)
        else:
            r = _abrir_imagem(path, doc)
    except Exception as e:
        media_server.unregister_bytes(doc["tokens"])
        logging.exception("editor de imagem: abrir")
        return {"success": False, "error": f"não consegui abrir: {e}"}
    if not r.get("success"):
        media_server.unregister_bytes(doc["tokens"])
        return r
    _DOCS[doc_id] = doc
    r["doc"] = doc_id
    return r


def _abrir_imagem(path, doc):
    try:
        im = Image.open(path)
        from PIL import ImageOps
        im = ImageOps.exif_transpose(im)
    except Exception:
        # RAW e afins: o conversor do app já sabe ler
        try:
            from Functions import converterimagem as ci
            im = ci._abrir(path) if hasattr(ci, "_abrir") else None
        except Exception:
            im = None
        if im is None:
            return {"success": False, "error": "formato de imagem não suportado"}
    dpi = 72
    try:
        dpi = round(float((im.info.get("dpi") or (72, 72))[0]), 2)
    except Exception:
        pass
    rgba = im.convert("RGBA")
    url = _servir(doc, _png(rgba), "fundo.png")
    w, h = rgba.size
    opaco = rgba.getextrema()[3][0] == 255
    nome = os.path.splitext(os.path.basename(path))[0]
    return {"success": True, "nome": nome, "w": w, "h": h, "dpi": dpi, "modo": im.mode, "bits": 8, "psd": False,
            "camadas": [{"tipo": "pixel", "nome": "Fundo" if opaco else "Camada 0", "visivel": True, "op": 1, "fill": 1,
                         "bm": "NORMAL", "clip": False, "x": 0, "y": 0, "w": w, "h": h, "url": url,
                         "fundo": opaco}],
            "avisos": []}


def _abrir_psd(path, doc, on_progress):
    from psd_tools import PSDImage
    from Functions import psd_import as pi
    psd = PSDImage.open(path)
    modo = str(psd.color_mode).split(".")[-1]
    doc["rgb"] = modo in ("RGB", "3")
    avisos = []
    if not doc["rgb"]:
        avisos.append(f"Documento em {modo}: o editor trabalha em RGB e salva um PSD novo em RGB")
    try:
        angulo = float(psd.image_resources.get_data(1037) or 120)
    except Exception:
        angulo = 120.0
    todas = _todas(psd)
    indice = {id(l): i for i, l in enumerate(todas)}
    total = max(1, len(todas))
    feitos = [0]

    def mascara(layer, no):
        try:
            if not layer.has_mask():
                return
            m = layer.mask
            im = m.topil()
            info = {"fundo": 255 if int(getattr(m, "background_color", 0) or 0) else 0,
                    "desativada": bool(getattr(m, "disabled", False)), "x": int(m.left), "y": int(m.top), "w": 0, "h": 0}
            if im is not None and im.size[0] and im.size[1]:
                info.update({"w": im.size[0], "h": im.size[1], "url": _servir(doc, _png(im.convert("L")), "mascara.png")})
            no["mascara"] = info
        except Exception as e:
            avisos.append(f"{layer.name}: máscara não lida ({e})")

    def pixels(layer):
        im = None
        try:
            im = layer.topil()
        except Exception:
            im = None
        if im is not None and im.size[0] and im.size[1]:
            return im.convert("RGBA"), layer.left, layer.top
        if layer.kind == "solidcolorfill":
            try:
                d = layer.data
                c = d.get(b"Clr ")
                rgb = tuple(int(round(float(getattr(c.get(x), "value", c.get(x))))) for x in (b"Rd  ", b"Grn ", b"Bl  "))
                return Image.new("RGBA", (psd.width, psd.height), rgb + (255,)), 0, 0
            except Exception:
                pass
        try:
            im = layer.composite(force=True)
            if im is not None:
                bb = layer.bbox
                return im.convert("RGBA"), bb[0], bb[1]
        except Exception:
            pass
        return None, 0, 0

    def nivel(grupo):
        out = []
        for layer in grupo:
            feitos[0] += 1
            if on_progress:
                on_progress(min(99, int(feitos[0] * 100 / total)), layer.name)
            k = layer.kind
            no = {"ref": indice.get(id(layer)), "nome": layer.name, "visivel": bool(layer.visible),
                  "op": round(layer.opacity / 255, 4), "fill": round(layer.fill_opacity / 255, 4),
                  "bm": _bm_key(layer), "clip": bool(layer.clipping), "kind": k}
            try:
                lk = layer.locks
                if lk is not None:
                    no["travas"] = int(getattr(lk, "lock_flags", lk) if not isinstance(lk, int) else lk)
            except Exception:
                pass
            if layer.is_group():
                no["tipo"] = "grupo"
                no["aberto"] = bool(getattr(layer, "open_folder", True))
                no["filhos"] = nivel(layer)
                mascara(layer, no)
                out.append(no)
                continue
            brit = _brilho_antigo(layer) if k == "pixel" else None
            if k in pi._AJUSTES or brit:
                no["tipo"] = "ajuste"
                no["ajuste"] = brit or _ajuste(layer)
                if brit:
                    no["kind"] = "brightnesscontrast"
                if no["ajuste"] is None:
                    avisos.append(f"{layer.name}: ajuste {k} fica no arquivo, mas o editor não mostra o efeito")
                mascara(layer, no)
                out.append(no)
                continue
            no["tipo"] = {"type": "texto", "smartobject": "inteligente", "shape": "forma",
                          "solidcolorfill": "preenchimento", "gradientfill": "preenchimento",
                          "patternfill": "preenchimento"}.get(k, "pixel")
            im, x0, y0 = pixels(layer)
            if im is not None:
                no.update({"x": int(x0), "y": int(y0), "w": im.size[0], "h": im.size[1],
                           "url": _servir(doc, _png(im), "camada.png")})
            else:
                no.update({"x": 0, "y": 0, "w": 0, "h": 0})
            mascara(layer, no)
            try:
                if layer.has_vector_mask() and k not in ("shape", "solidcolorfill", "gradientfill", "patternfill"):
                    avisos.append(f"{layer.name}: máscara vetorial não aparece no editor (fica no arquivo)")
            except Exception:
                pass
            fx = pi._params_efeitos(layer, angulo)
            if fx:
                no["fx"] = fx
                for n in fx.get("outros", []):
                    avisos.append(f"{layer.name}: efeito {n} fica no arquivo, mas o editor não desenha")
            if k == "type":
                t = pi._texto(layer, angulo)
                if t:
                    t.pop("efeitos", None)
                    no["texto"] = t
            out.append(no)
        return out

    camadas = nivel(psd)
    achatado = None
    try:
        im = psd.topil()
        if im is not None:
            achatado = _servir(doc, _png(im.convert("RGBA")), "achatado.png")
    except Exception:
        pass
    return {"success": True, "nome": os.path.splitext(os.path.basename(path))[0], "w": int(psd.width),
            "h": int(psd.height), "dpi": _dpi(psd), "modo": modo, "bits": int(psd.depth), "psd": True,
            "psb": int(psd.version) == 2, "camadas": camadas, "achatado": achatado, "avisos": sorted(set(avisos))}


# ─────────────────────────── salvar ───────────────────────────
def salvar_inicio(doc_id):
    """Abre a caixa de envio. ida_e_volta = dá para aproveitar o arquivo de origem (a página só manda o que mudou)."""
    d = _DOCS.get(doc_id) if doc_id else None
    ida = False
    if d and d["rgb"] and d["path"].lower().endswith(EXT_PSD) and os.path.isfile(d["path"]):
        ida = os.stat(d["path"]).st_mtime_ns == d["mtime"]
    sessao, url = media_server.abrir_envio()
    return {"success": True, "sessao": sessao, "url": url, "ida_e_volta": ida}


def _img(arquivos, chave, modo="RGBA"):
    b = arquivos.get(chave) if chave else None
    if not b:
        return None
    im = Image.open(io.BytesIO(b))
    im.load()
    return im.convert(modo)


def _blend(nome):
    from psd_tools.constants import BlendMode
    try:
        return BlendMode[nome]
    except KeyError:
        return BlendMode.NORMAL


def _nova_pixel(parent, im, nome, x, y):
    """Camada de pixels com transparência de verdade (o frompil do psd-tools transforma o alfa em máscara num PSD RGB)."""
    from psd_tools.api.layers import PixelLayer
    from psd_tools.constants import Compression
    hdr = parent._psd._record.header
    rec, canais = PixelLayer._build_layer_record_and_channels(im, nome, int(x), int(y), Compression.RLE,
                                                               version=hdr.version, depth=hdr.depth)
    layer = PixelLayer(parent, rec, canais)
    parent.append(layer)
    layer.name = nome
    return layer


def _trocar_pixels(layer, im, x, y):
    """Troca os pixels da camada mantendo o resto (efeitos, máscara, configurações)."""
    from psd_tools.api.layers import PixelLayer
    from psd_tools.constants import ChannelID, Compression
    hdr = layer._psd._record.header
    rec, canais = PixelLayer._build_layer_record_and_channels(im, "x", int(x), int(y), Compression.RLE,
                                                               version=hdr.version, depth=hdr.depth)
    r = layer._record
    resto = [(ci, cd) for ci, cd in zip(r.channel_info, layer._channels)
             if ci.id in (ChannelID.USER_LAYER_MASK, ChannelID.REAL_USER_LAYER_MASK)]
    r.channel_info = list(rec.channel_info) + [ci for ci, _ in resto]
    while len(layer._channels):
        layer._channels.pop()
    for cd in list(canais) + [cd for _, cd in resto]:
        layer._channels.append(cd)
    r.left, r.top, r.right, r.bottom = rec.left, rec.top, rec.right, rec.bottom
    layer._invalidate_bbox()
    layer._psd.mark_updated()


def _mascara(layer, m, arquivos):
    """Aplica o estado da máscara vindo da página: None = sem máscara; {key?, x, y, fundo, desativada}."""
    from psd_tools.constants import ChannelID
    tem = layer.has_mask()
    if m is None:
        if tem:
            layer.remove_mask()
        return
    im = _img(arquivos, m.get("key"), "L")
    if im is not None:
        if tem:
            layer.remove_mask()
        if im.size[0] == 0 or im.size[1] == 0:
            im = Image.new("L", (1, 1), m.get("fundo", 255))
        layer.create_mask(im, top=int(m["y"]), left=int(m["x"]))
    elif not tem:
        return
    md = layer._record.mask_data
    if md is None:
        return
    if im is None:   # mesma máscara, talvez em outro lugar
        w, h = md.right - md.left, md.bottom - md.top
        md.left, md.top = int(m["x"]), int(m["y"])
        md.right, md.bottom = md.left + w, md.top + h
    md.background_color = 255 if m.get("fundo") else 0
    try:
        md.flags.mask_disabled = bool(m.get("desativada"))
    except Exception:
        pass
    if hasattr(layer, "_mask"):
        del layer._mask


# ── mover/transformar texto, objeto inteligente e forma sem perder o que eles são ──
def _aplica(tf, x, y):
    a, b, c, d, e, f = tf
    return a * x + c * y + e, b * x + d * y + f


def _num_desc(v):
    return float(getattr(v, "value", v))


def _transformar_vivo(layer, tf, W, H, W0=None, H0=None):
    """tf = matriz afim [a, b, c, d, e, f] (x' = a x + c y + e; y' = b x + d y + f) aplicada à camada desde a
    abertura. Devolve False se não souber fazer (a camada vira pixels)."""
    from psd_tools.constants import Tag
    from psd_tools.psd.descriptor import Double
    k = layer.kind
    blocos = layer.tagged_blocks
    try:
        if k == "type":
            t = blocos.get_data(Tag.TYPE_TOOL_OBJECT_SETTING)
            xx, xy, yx, yy, tx, ty = (float(v) for v in t.transform)
            a, b, c, d, e, f = tf
            # matriz do texto (x' = xx x + yx y + tx) composta com a nova
            t.transform = (a * xx + c * xy, b * xx + d * xy, a * yx + c * yy, b * yx + d * yy,
                           a * tx + c * ty + e, b * tx + d * ty + f)
            return True
        if k == "smartobject":
            ok = False
            for nome_tag in ("PLACED_LAYER1", "PLACED_LAYER2", "SMART_OBJECT_LAYER_DATA1", "SMART_OBJECT_LAYER_DATA2"):
                tag = getattr(Tag, nome_tag, None)
                if tag is None or tag not in blocos:
                    continue
                dado = blocos.get_data(tag)
                desc = getattr(dado, "data", dado)
                if hasattr(desc, "transform") and not hasattr(desc, "keys"):
                    pts = list(desc.transform)
                    novo = []
                    for i in range(0, 8, 2):
                        novo += list(_aplica(tf, pts[i], pts[i + 1]))
                    desc.transform = tuple(novo)
                    ok = True
                    continue
                for chave in (b"Trnf", b"nonAffineTransform"):
                    if chave in desc:
                        lst = desc[chave]
                        vals = [_num_desc(v) for v in lst]
                        novo = []
                        for i in range(0, 8, 2):
                            novo += list(_aplica(tf, vals[i], vals[i + 1]))
                        for i, v in enumerate(novo):
                            lst[i] = Double(v)
                        ok = True
            return ok
        if k in ("shape", "solidcolorfill", "gradientfill", "patternfill"):
            vm = None
            for nome_tag in ("VECTOR_MASK_SETTING1", "VECTOR_MASK_SETTING2"):
                tag = getattr(Tag, nome_tag, None)
                if tag is not None and tag in blocos:
                    vm = blocos.get_data(tag)
            if vm is None:
                return k != "shape"   # preenchimento sem forma cobre a tela: não tem o que mover
            for path in vm.path:
                if type(path).__name__ not in ("ClosedPath", "OpenPath"):
                    continue
                for knot in path:
                    for nome in ("preceding", "anchor", "leaving"):
                        p = getattr(knot, nome, None)
                        if p is None:
                            continue
                        y, x = p[0] * (H0 or H), p[1] * (W0 or W)
                        nx, ny = _aplica(tf, x, y)
                        setattr(knot, nome, (ny / H, nx / W))
            # origem da forma ao vivo (retângulo/elipse editáveis): some se não bater com o caminho
            if Tag.VECTOR_ORIGINATION_DATA in blocos and tf[1] == 0 and tf[2] == 0 and tf[0] == tf[3] == 1:
                try:
                    od = blocos.get_data(Tag.VECTOR_ORIGINATION_DATA)
                    for item in od[b"keyDescriptorList"]:
                        bb = item.get(b"keyOriginShapeBBox")
                        if bb is not None:
                            for ch, dlt in ((b"Left", tf[4]), (b"Rght", tf[4]), (b"Top ", tf[5]), (b"Btom", tf[5])):
                                if ch in bb:
                                    bb[ch] = type(bb[ch])(bb[ch].unit, _num_desc(bb[ch]) + dlt) if hasattr(bb[ch], "unit") else Double(_num_desc(bb[ch]) + dlt)
                        cantos = item.get(b"keyOriginBoxCorners")
                        if cantos is not None:
                            for ch in list(cantos.keys()):
                                pt = cantos[ch]
                                if b"Hrzn" in pt and b"Vrtc" in pt:
                                    pt[b"Hrzn"] = Double(_num_desc(pt[b"Hrzn"]) + tf[4])
                                    pt[b"Vrtc"] = Double(_num_desc(pt[b"Vrtc"]) + tf[5])
                except Exception as e:
                    logging.debug("origem da forma: %s", e)
                    del blocos[Tag.VECTOR_ORIGINATION_DATA]
            elif Tag.VECTOR_ORIGINATION_DATA in blocos:
                del blocos[Tag.VECTOR_ORIGINATION_DATA]
            return True
    except Exception as e:
        logging.debug("transformar %s: %s", layer.name, e)
    return False


def _ed_set(d, nome, valor):
    """Grava numa Dict do EngineData (as chaves são Property, não texto)."""
    from psd_tools.psd import engine_data as E
    for k in list(d.keys()):
        if str(getattr(k, "value", k)).strip("/") == nome:
            d[k] = valor
            return
    d[E.Property(nome)] = valor


def _ed_dict(pares):
    from psd_tools.psd import engine_data as E
    d = E.Dict()
    for k, v in pares:
        d[E.Property(k)] = v
    return d


def _trocar_texto(layer, texto, estilo=None):
    """Troca o conteúdo de um texto do Photoshop (continua camada de texto) com o estilo do começo para o texto todo.
    estilo (opcional) = {ps, tam, cor, esp, ent, alin}: o que a página mudou (tamanho, cor, fonte, espaçamento...)."""
    from psd_tools.constants import Tag
    from psd_tools.psd import engine_data as E
    from psd_tools.psd.descriptor import String
    t = layer.tagged_blocks.get_data(Tag.TYPE_TOOL_OBJECT_SETTING)
    td = t.text_data
    novo = texto.replace(chr(13) + chr(10), chr(10)).replace(chr(10), chr(13))
    td[b"Txt "] = String(novo)
    raiz = td[b"EngineData"].value
    edd = raiz["EngineDict"]
    n = len(novo) + 1   # o EngineData conta a quebra final
    _ed_set(edd["Editor"], "Text", E.String(novo + chr(13)))
    for run in ("StyleRun", "ParagraphRun"):
        r = edd[run]
        _ed_set(r, "RunArray", E.List([r["RunArray"][0]]))
        _ed_set(r, "RunLengthArray", E.List([E.Integer(n)]))
    if estilo:
        sd = edd["StyleRun"]["RunArray"][0]["StyleSheet"]["StyleSheetData"]
        if estilo.get("tam"):
            _ed_set(sd, "FontSize", E.Float(float(estilo["tam"])))
        if estilo.get("cor"):
            c = estilo["cor"].lstrip("#")
            rgb = [int(c[k:k + 2], 16) / 255 for k in (0, 2, 4)]
            _ed_set(sd, "FillColor", _ed_dict([("Type", E.Integer(1)), ("Values", E.List([E.Float(1.0)] + [E.Float(v) for v in rgb]))]))
        if estilo.get("esp") is not None:
            _ed_set(sd, "Tracking", E.Integer(int(round(estilo["esp"]))))
        if estilo.get("ent"):
            _ed_set(sd, "AutoLeading", E.Bool(False))
            _ed_set(sd, "Leading", E.Float(float(estilo["ent"])))
        elif "ent" in estilo:
            _ed_set(sd, "AutoLeading", E.Bool(True))
        ps = estilo.get("ps")
        if ps:
            fs = raiz["ResourceDict"]["FontSet"]
            nomes = [str(getattr(f["Name"], "value", f["Name"])).strip("'\"()") for f in fs]
            if ps not in nomes:
                fs.append(_ed_dict([("Name", E.String(ps)), ("Script", E.Integer(0)), ("FontType", E.Integer(1)), ("Synthetic", E.Integer(0))]))
                nomes.append(ps)
            _ed_set(sd, "Font", E.Integer(nomes.index(ps)))
        if estilo.get("alin"):
            props = edd["ParagraphRun"]["RunArray"][0]["ParagraphSheet"]["Properties"]
            _ed_set(props, "Justification", E.Integer({"left": 0, "right": 1, "center": 2}.get(estilo["alin"], 0)))
    return True


def salvar(spec):
    """spec = {doc, sessao, destino, w, h, camadas: [nó], composto: chave, ida_e_volta}
    nó = {ref?, tipo, nome, visivel, op, fill, bm, clip, aberto, chave? (pixels novos), x, y, tf?, rasterizar?,
          texto_novo?, mascara: None | {key?, x, y, fundo, desativada}, mascara_igual?, filhos?}
    Devolve {success, path, refs: [ref novo de cada nó na ordem da árvore], avisos}."""
    _silenciar()
    from psd_tools import PSDImage
    from psd_tools.api.layers import Group
    arquivos = media_server.fechar_envio(spec.get("sessao"))
    destino = spec["destino"]
    W, H = int(spec["w"]), int(spec["h"])
    doc = _DOCS.get(spec.get("doc"))
    avisos = []
    ida = bool(spec.get("ida_e_volta")) and doc is not None
    if ida:
        psd = PSDImage.open(doc["path"])
        todas = _todas(psd)
        hdr = psd._record.header
        W0, H0 = hdr.width, hdr.height
        mudou_tela = (W0, H0) != (W, H)
        for g in [psd] + [l for l in todas if l.is_group()]:
            g.clear()
        if mudou_tela:
            hdr.width, hdr.height = W, H
    else:
        psd = PSDImage.new("RGB", (W, H), color=(255, 255, 255))
        todas = []
        mudou_tela = False
        W0, H0 = W, H
    psb = W > 30000 or H > 30000
    if psb:
        psd._record.header.version = 2

    ordem = []   # (nó, objeto) na ordem da árvore, para devolver as referências novas

    def construir(nos, pai):
        objs = []
        for no in nos:
            ob = None
            orig = todas[no["ref"]] if ida and no.get("ref") is not None and no["ref"] < len(todas) else None
            if no["tipo"] == "grupo":
                ob = orig if orig is not None and orig.is_group() else Group.new(pai, no.get("nome") or "Grupo")
                filhos = construir(no.get("filhos") or [], ob)
                ob.clear()
                ob.extend(filhos)
                try:
                    ob.open_folder = bool(no.get("aberto", True))
                except Exception:
                    pass
            elif no["tipo"] == "ajuste":
                if orig is None:
                    continue   # ajuste novo ainda não existe no editor
                ob = orig
            else:
                im = _img(arquivos, no.get("chave"))
                vivo = orig is not None and orig.kind in ("type", "smartobject", "shape", "solidcolorfill",
                                                          "gradientfill", "patternfill")
                if orig is not None and not no.get("rasterizar"):
                    ob = orig
                    if vivo and no.get("tf"):
                        if not _transformar_vivo(orig, no["tf"], W, H, W0, H0):
                            ob = None
                            avisos.append(f"{no.get('nome')}: virou pixels (não deu para mover sem rasterizar)")
                    if ob is not None and no.get("texto_novo") is not None and orig.kind == "type":
                        try:
                            _trocar_texto(orig, no["texto_novo"], no.get("texto_estilo"))
                        except Exception as e:
                            logging.debug("texto %s: %s", no.get("nome"), e)
                            ob = None
                            avisos.append(f"{no.get('nome')}: texto salvo como pixels")
                    if ob is not None:
                        if im is not None:
                            _trocar_pixels(ob, im, no["x"], no["y"])
                        elif "x" in no and (ob._record.left, ob._record.top) != (int(no["x"]), int(no["y"])) and \
                                ob.has_pixels():
                            r_ = ob._record
                            w, h = r_.right - r_.left, r_.bottom - r_.top
                            ob._record.left, ob._record.top = int(no["x"]), int(no["y"])
                            ob._record.right, ob._record.bottom = int(no["x"]) + w, int(no["y"]) + h
                            ob._invalidate_bbox()
                if ob is None:
                    if im is None:
                        im = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
                    ob = _nova_pixel(pai, im, no.get("nome") or "Camada", no.get("x", 0), no.get("y", 0))
                    if orig is not None:   # rasterizada: leva efeitos, configurações e a máscara da original
                        for chave, bloco in list(orig.tagged_blocks.items()):
                            if str(chave).split(".")[-1] not in _TAGS_CONTEUDO:
                                ob.tagged_blocks[chave] = bloco
                        if orig.has_mask():
                            try:
                                mo = orig.mask
                                im_m = mo.topil()
                                if im_m is not None:
                                    ob.create_mask(im_m.convert("L"), top=mo.top, left=mo.left)
                                    ob._record.mask_data.background_color = orig._record.mask_data.background_color
                            except Exception as e:
                                logging.debug("máscara da rasterizada: %s", e)
            if "mascara" in no:
                try:
                    _mascara(ob, no["mascara"], arquivos)
                except Exception as e:
                    avisos.append(f"{no.get('nome')}: máscara não salva ({e})")
            try:
                if no.get("nome") and ob.name != no["nome"]:
                    ob.name = no["nome"]
                ob.visible = bool(no.get("visivel", True))
                ob.opacity = max(0, min(255, int(round(float(no.get("op", 1)) * 255))))
                if no["tipo"] != "grupo":
                    ob.fill_opacity = max(0, min(255, int(round(float(no.get("fill", 1)) * 255))))
                bm = no.get("bm") or ("PASS_THROUGH" if no["tipo"] == "grupo" else "NORMAL")
                if bm == "PASS_THROUGH" and no["tipo"] != "grupo":
                    bm = "NORMAL"
                ob.blend_mode = _blend(bm)
                ob.clipping = bool(no.get("clip"))
            except Exception as e:
                avisos.append(f"{no.get('nome')}: propriedade não salva ({e})")
            objs.append(ob)
            ordem.append((no, ob))
        return objs

    raiz = construir(spec.get("camadas") or [], psd)
    psd.clear()
    psd.extend(raiz)

    # imagem achatada (prévia do arquivo): a composição feita pela página
    comp = _img(arquivos, spec.get("composto"))
    if comp is None or comp.size != (W, H):
        comp = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    arr = np.asarray(comp).astype(np.float32) / 255
    cor, alfa = arr[:, :, :3], arr[:, :, 3:4]
    fundo_branco = cor * alfa + (1 - alfa)   # sem transparência no achatado: sobre branco, como o Photoshop
    from psd_tools.api import numpy_io
    hdr = psd._record.header
    usar_alfa = hdr.channels > 3
    psd._record.image_data.set_data(numpy_io.encode_image_data(psd, cor if usar_alfa else fundo_branco, alfa), hdr)
    # miniatura antiga sairia errada: o Photoshop refaz
    try:
        from psd_tools.constants import Resource
        for rid in (Resource.THUMBNAIL_RESOURCE, Resource.THUMBNAIL_RESOURCE_PS4):
            if rid in psd.image_resources:
                del psd.image_resources[rid]
    except Exception:
        pass

    tmp = destino + ".salvando"
    try:
        with open(tmp, "wb") as f:
            psd._record.write(f)
        os.replace(tmp, destino)
    except Exception as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return {"success": False, "error": f"não consegui gravar: {e}"}

    # o arquivo salvo vira a origem: referências novas
    novas = _todas(psd)
    pos = {id(l): i for i, l in enumerate(novas)}
    refs = {str(no.get("uid")): pos.get(id(ob)) for no, ob in ordem if no.get("uid") is not None}
    novo_id = spec.get("doc") or uuid.uuid4().hex[:12]
    _DOCS[novo_id] = {"path": os.path.abspath(destino), "mtime": os.stat(destino).st_mtime_ns, "rgb": True,
                      "tokens": (doc or {}).get("tokens", [])}
    return {"success": True, "path": destino, "doc": novo_id, "refs": refs, "avisos": avisos}


def exportar(spec):
    """Imagem achatada (PNG/JPG/WEBP) a partir da composição enviada pela página."""
    arquivos = media_server.fechar_envio(spec.get("sessao"))
    im = _img(arquivos, spec.get("composto"))
    if im is None:
        return {"success": False, "error": "composição não chegou"}
    destino = spec["destino"]
    fmt = os.path.splitext(destino)[1].lower()
    q = int(spec.get("qualidade", 92))
    try:
        dpi = float(spec.get("dpi") or 72)
        if fmt in (".jpg", ".jpeg"):
            fundo = Image.new("RGB", im.size, (255, 255, 255))
            fundo.paste(im, mask=im.split()[3])
            fundo.save(destino, "JPEG", quality=q, subsampling=0 if q >= 90 else 2, dpi=(dpi, dpi))
        elif fmt == ".webp":
            im.save(destino, "WEBP", quality=q)
        elif fmt in (".tif", ".tiff"):
            im.save(destino, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi))
        else:
            im.save(destino, "PNG", dpi=(dpi, dpi))
    except Exception as e:
        return {"success": False, "error": str(e)}
    return {"success": True, "path": destino}


def colar_windows():
    """Ctrl+V no editor: imagem copiada no Windows (servida da memória) ou arquivos copiados no Explorer."""
    try:
        from PIL import ImageGrab
        dado = ImageGrab.grabclipboard()
    except Exception:
        dado = None
    if isinstance(dado, list):
        arqs = [p for p in dado if isinstance(p, str) and os.path.isfile(p)]
        return {"success": bool(arqs), "tipo": "arquivos", "paths": arqs}
    if isinstance(dado, Image.Image):
        tok, url = media_server.register_bytes(_png(dado.convert("RGBA")), "colado.png", "image/png")
        return {"success": True, "tipo": "imagem", "url": url, "token": tok, "w": dado.size[0], "h": dado.size[1]}
    return {"success": False}
