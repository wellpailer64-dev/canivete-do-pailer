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
        if path.lower().endswith(EXT_IKNV):
            r = _abrir_iknv(path, doc)
        elif path.lower().endswith(EXT_PSD):
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
    from psd_tools.constants import Tag
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
    try:
        altitude = float(psd.image_resources.get_data(1049) or 30)
    except Exception:
        altitude = 30.0
    luz = {"ang": angulo, "alt": altitude}
    todas = _todas(psd)
    indice = {id(l): i for i, l in enumerate(todas)}
    total = max(1, len(todas))
    feitos = [0]
    links_cache = {}

    def links_do(p):
        k = id(p)
        if k in links_cache:
            return links_cache[k]
        out = {}
        try:
            blocos = p._record.layer_and_mask_information.tagged_blocks
            for nome in ("LINKED_LAYER1", "LINKED_LAYER2", "LINKED_LAYER3", "LINKED_LAYER_EXTERNAL"):
                tag = getattr(Tag, nome, None)
                if tag is not None and tag in blocos:
                    for item in blocos.get_data(tag):
                        u = (getattr(item, "uuid", "") or "").strip("\x00")
                        if u:
                            out[u] = item
        except Exception:
            pass
        links_cache[k] = out
        return out

    def so_uuid(layer):
        try:
            for nome in ("SMART_OBJECT_LAYER_DATA1", "SMART_OBJECT_LAYER_DATA2"):
                tag = getattr(Tag, nome, None)
                if tag is not None and tag in layer.tagged_blocks:
                    desc = layer.tagged_blocks.get_data(tag).data
                    u = desc.get(b"Idnt")
                    if u is not None:
                        return str(getattr(u, "value", u)).strip("\x00")
        except Exception:
            return None
        return None

    def so_transform(layer):
        try:
            for nome in ("SMART_OBJECT_LAYER_DATA1", "SMART_OBJECT_LAYER_DATA2"):
                tag = getattr(Tag, nome, None)
                if tag is not None and tag in layer.tagged_blocks:
                    desc = layer.tagged_blocks.get_data(tag).data
                    sz, tr = desc.get(b"Sz  "), desc.get(b"Trnf")
                    if sz is None or tr is None:
                        continue
                    w = float(sz.get(b"Wdth", 0)); h = float(sz.get(b"Hght", 0))
                    vals = [float(getattr(v, "value", v)) for v in tr]
                    if w <= 0 or h <= 0 or len(vals) != 8:
                        continue
                    x0, y0, x1, y1, x2, y2, x3, y3 = vals
                    a, b = (x1 - x0) / w, (y1 - y0) / w
                    c, d = (x3 - x0) / h, (y3 - y0) / h
                    if abs((x0 + a * w + c * h) - x2) > 1 or abs((y0 + b * w + d * h) - y2) > 1:
                        return None, w, h
                    return [a, b, c, d, x0, y0], w, h
        except Exception:
            return None, 0, 0
        return None, 0, 0

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

    def pixels(layer, raiz):
        im = None
        try:
            im = layer.topil()
        except Exception:
            im = None
        if im is not None and im.size[0] and im.size[1]:
            return im.convert("RGBA"), layer.left, layer.top
        if layer.kind == "solidcolorfill":
            rgb = _cor_soco(layer)
            if rgb:
                return Image.new("RGBA", (raiz.width, raiz.height), rgb + (255,)), 0, 0
        try:
            im = layer.composite(force=True)
            if im is not None:
                bb = layer.bbox
                return im.convert("RGBA"), bb[0], bb[1]
        except Exception:
            pass
        return None, 0, 0

    def smart_conteudo(layer, raiz):
        u = so_uuid(layer)
        item = links_do(raiz).get(u or "")
        dados = getattr(item, "data", None)
        if dados is None:
            try:
                dados = layer.smart_object.data
            except Exception:
                dados = None
        if not dados:
            return None
        dados = bytes(dados)
        if dados[:4] != b"8BPS":
            return None
        # Evita abrir objetos fotográficos pesados sem necessidade; textos/peças pequenas como o "Titulo.psb" entram editáveis.
        if len(dados) > 8 * 1024 * 1024:
            return {"aviso": "grande", "bytes": len(dados)}
        try:
            interno = PSDImage.open(io.BytesIO(dados))
            comp = interno.topil()
            if comp is None:
                comp = interno.composite(force=True)
            if comp is None:
                return None
            tf, sw, sh = so_transform(layer)
            inner_indice = {id(l): i for i, l in enumerate(_todas(interno))}
            return {
                "url": _servir(doc, _png(comp.convert("RGBA")), "smartobject.png"),
                "w": int(interno.width), "h": int(interno.height), "tf": tf, "sw": sw, "sh": sh,
                "camadas": nivel(interno, interno, inner_indice, interno=True),
            }
        except Exception as e:
            logging.debug("smart object %s: %s", layer.name, e, exc_info=True)
            return {"aviso": str(e)}

    def nivel(grupo, raiz=psd, indice_local=indice, interno=False):
        out = []
        for layer in grupo:
            if not interno:
                feitos[0] += 1
            if on_progress and not interno:
                on_progress(min(99, int(feitos[0] * 100 / total)), layer.name)
            k = layer.kind
            no = {"ref": None if interno else indice_local.get(id(layer)), "nome": layer.name, "visivel": bool(layer.visible),
                  "op": round(layer.opacity / 255, 4), "fill": round(layer.fill_opacity / 255, 4),
                  "bm": _bm_key(layer), "clip": bool(layer.clipping), "kind": k}
            no.update(_ler_mescla(layer))
            try:
                lk = layer.locks
                if lk is not None:
                    no["travas"] = int(getattr(lk, "lock_flags", lk) if not isinstance(lk, int) else lk)
            except Exception:
                pass
            if layer.is_group():
                no["tipo"] = "grupo"
                no["aberto"] = bool(getattr(layer, "open_folder", True))
                if k == "artboard":
                    no["prancheta"] = _ler_prancheta(layer)
                no["filhos"] = nivel(layer, raiz, indice_local, interno)
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
            if k == "solidcolorfill":   # a cor fica editável no editor (duplo clique na miniatura)
                cor_pre = _cor_soco(layer)
                if cor_pre:
                    no["pre"] = {"tipo": "cor", "cor": "#%02x%02x%02x" % cor_pre}
            elif k == "gradientfill":   # degradê editável no editor (painel Propriedades)
                pre = _grad_pre(layer)
                if pre:
                    no["pre"] = pre
            im, x0, y0 = pixels(layer, raiz)
            if im is not None:
                no.update({"x": int(x0), "y": int(y0), "w": im.size[0], "h": im.size[1],
                           "url": _servir(doc, _png(im), "camada.png")})
            else:
                no.update({"x": 0, "y": 0, "w": 0, "h": 0})
            if k == "smartobject":
                so = smart_conteudo(layer, raiz)
                if so and so.get("camadas"):
                    no["so"] = {kk: vv for kk, vv in so.items() if kk != "aviso"}
                elif so and so.get("aviso") == "grande":
                    avisos.append(f"{layer.name}: objeto inteligente interno grande ({so['bytes'] // (1024 * 1024)} MB); abre como prévia")
                elif so and so.get("aviso"):
                    avisos.append(f"{layer.name}: conteúdo do objeto inteligente não lido ({so['aviso']})")
            mascara(layer, no)
            try:
                if layer.has_vector_mask() and k not in ("shape", "solidcolorfill", "gradientfill", "patternfill"):
                    avisos.append(f"{layer.name}: máscara vetorial não aparece no editor (fica no arquivo)")
            except Exception:
                pass
            try:
                fx, fx_ligado = _ler_fx(layer, luz)
            except Exception:
                logging.debug("efeitos não lidos", exc_info=True)
                fx, fx_ligado = None, True
            if fx and len(fx) > 1:
                no["fx"] = fx
                no["fx_oculto"] = not fx_ligado
                if any(e.get("psd") and e.get("on") for e in fx.get("padraoSob", [])):
                    avisos.append(f"{layer.name}: Sobreposição de padrão do Photoshop aparece com um padrão do editor (fica no arquivo)")
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
            "psb": int(psd.version) == 2, "camadas": camadas, "achatado": achatado, "avisos": sorted(set(avisos)), "luz": luz,
            "fatias": _ler_fatias(psd), "guias": _ler_guias(psd)}


# ─────────────────────────── estilo de camada: os 10 efeitos do Photoshop ───────────────────────────
# Modelo do editor (frontend/js/imagem-fx.js): {tipo: [instância...]}, tipos chanfro, tracado, sombraInt, brilhoInt,
# acetinado, corSob, degSob, padraoSob, brilho, sombra. No PSD (lfx2): uma chave por efeito (DrSh, IrSh, OrGl, IrGl,
# ebbl, ChFX, SoFi, GrFl, patternFill, FrFX) e, para os que podem repetir, a lista *Multi (dropShadowMulti...).
_FX_CHAVES = {   # tipo: (chave única, chave da lista, classe)
    "sombra": (b"DrSh", b"dropShadowMulti", b"DrSh"), "sombraInt": (b"IrSh", b"innerShadowMulti", b"IrSh"),
    "brilho": (b"OrGl", None, b"OrGl"), "brilhoInt": (b"IrGl", None, b"IrGl"), "chanfro": (b"ebbl", None, b"ebbl"),
    "acetinado": (b"ChFX", None, b"ChFX"), "corSob": (b"SoFi", b"solidFillMulti", b"SoFi"),
    "degSob": (b"GrFl", b"gradientFillMulti", b"GrFl"), "padraoSob": (b"patternFill", None, b"patternFill"),
    "tracado": (b"FrFX", b"frameFXMulti", b"FrFX"),
}


def _bm_codigos():
    from psd_tools.api._descriptor import DESCRIPTOR_BLEND_MODES
    de, para = {}, {}
    for codigo, modo in DESCRIPTOR_BLEND_MODES.items():
        de[codigo] = modo.name
        para.setdefault(modo.name, codigo)
    return de, para


def _v(d, k, padrao=None):
    x = d.get(k) if d is not None and hasattr(d, "get") else None
    if x is None:
        return padrao
    x = getattr(x, "value", x)
    return x


def _enum(d, k, padrao=""):
    x = d.get(k) if d is not None else None
    e = getattr(x, "enum", None)
    return e.decode("latin1", "ignore") if isinstance(e, bytes) else (padrao if e is None else str(e))


def _hex(cor, padrao="#000000"):
    try:
        if cor is None:
            return padrao
        cls = getattr(cor, "classID", b"")
        if cls in (b"Grsc", b"GRYC") or b"Gry " in cor:
            g = 255 - float(_v(cor, b"Gry ", 0)) * 2.55
            return "#%02x%02x%02x" % ((int(round(g)),) * 3)
        r, g, b = (float(_v(cor, k, 0)) for k in (b"Rd  ", b"Grn ", b"Bl  "))
        return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(x)))) for x in (r, g, b))
    except Exception:
        return padrao


def _grad_ler(g):
    """Degradê do PSD (Grdn) → {cores: [[pos, hex]], ops: [[pos, %]]}."""
    try:
        cores = [[float(_v(c, b"Lctn", 0)) / 4096, _hex(c.get(b"Clr "))] for c in g.get(b"Clrs", [])]
        ops = [[float(_v(t, b"Lctn", 0)) / 4096, float(_v(t, b"Opct", 100))] for t in g.get(b"Trns", [])]
        if cores:
            # suavidade (Intr: 4096 = 100%, o padrão do Photoshop): o editor desenha linear (= 0%); guardada para voltar igual
            return {"cores": cores, "ops": ops or [[0, 100], [1, 100]], "nome": str(_v(g, b"Nm  ", "")).strip("\x00"),
                    "suave": round(float(_v(g, b"Intr", 4096)) / 40.96, 2)}
    except Exception:
        pass
    return {"cores": [[0, "#000000"], [1, "#ffffff"]], "ops": [[0, 100], [1, 100]]}


def _ler_fx(layer, luz):
    """Efeitos da camada no modelo do editor (todos os 10 tipos, inclusive os desligados)."""
    from psd_tools.constants import Tag
    blk = None
    for t in (Tag.OBJECT_BASED_EFFECTS_LAYER_INFO, Tag.OBJECT_BASED_EFFECTS_LAYER_INFO_V0, Tag.OBJECT_BASED_EFFECTS_LAYER_INFO_V1):
        if t in layer.tagged_blocks:
            blk = layer.tagged_blocks.get_data(t)
            break
    if blk is None or not hasattr(blk, "items"):
        return None, True
    de, _ = _bm_codigos()
    bm = lambda d, k=b"Md  ", p="NORMAL": de.get((d.get(k).enum if d.get(k) is not None else b""), p)
    out = {"_v2": True}
    for tipo, (unico, multi, _cls) in _FX_CHAVES.items():
        itens = list(blk[multi]) if multi and multi in blk else ([blk[unico]] if unico in blk else [])
        lista = []
        for d in itens:
            if not hasattr(d, "get") or not _v(d, b"present", True):
                continue
            e = {"on": bool(_v(d, b"enab", False))}
            glob = bool(_v(d, b"uglg", False))
            ang = luz["ang"] if glob else float(_v(d, b"lagl", 120))
            if tipo in ("sombra", "sombraInt"):
                e.update(bm=bm(d, p="MULTIPLY"), cor=_hex(d.get(b"Clr ")), op=float(_v(d, b"Opct", 75)), ang=ang, global_=glob,
                         dist=float(_v(d, b"Dstn", 0)), tam=float(_v(d, b"blur", 0)))
                e["spread" if tipo == "sombra" else "choke"] = float(_v(d, b"Ckmt", 0))
                if tipo == "sombra":
                    e["ocultar"] = bool(_v(d, b"layerConceals", True))
            elif tipo in ("brilho", "brilhoInt"):
                e.update(bm=bm(d, p="SCREEN"), cor=_hex(d.get(b"Clr "), "#ffffbe"), op=float(_v(d, b"Opct", 75)),
                         tam=float(_v(d, b"blur", 0)), tecnica="precisa" if _enum(d, b"GlwT") == "PrBL" else "suave")
                e["spread" if tipo == "brilho" else "choke"] = float(_v(d, b"Ckmt", 0))
                if tipo == "brilhoInt":
                    e["fonte"] = "centro" if _enum(d, b"glwS") == "SrcC" else "borda"
                if d.get(b"Grad") is not None and d.get(b"Clr ") is None:
                    e["cor"] = _grad_ler(d.get(b"Grad"))["cores"][0][1]
            elif tipo == "chanfro":
                est = {"OtrB": "externo", "InrB": "interno", "Embs": "entalhe", "PlEb": "almofada", "strokeEmboss": "traco"}
                tec = {"SfBL": "suave", "PrBL": "cinzelDuro", "Slmt": "cinzelSuave"}
                e.update(estilo=est.get(_enum(d, b"bvlS"), "interno"), tecnica=tec.get(_enum(d, b"bvlT"), "suave"),
                         prof=float(_v(d, b"srgR", 100)), dir="baixo" if _enum(d, b"bvlD") == "Out " or _enum(d, b"bvlD").startswith("Out") else "cima",
                         tam=float(_v(d, b"blur", 5)), suav=float(_v(d, b"Sftn", 0)), ang=ang, global_=glob,
                         alt=luz["alt"] if glob else float(_v(d, b"Lald", 30)),
                         hBm=bm(d, b"hglM", "SCREEN"), hCor=_hex(d.get(b"hglC"), "#ffffff"), hOp=float(_v(d, b"hglO", 50)),
                         sBm=bm(d, b"sdwM", "MULTIPLY"), sCor=_hex(d.get(b"sdwC")), sOp=float(_v(d, b"sdwO", 50)),
                         contorno={"on": bool(_v(d, b"useShape", False)), "forma": "linear", "intervalo": float(_v(d, b"Inpr", 50))},
                         textura={"on": bool(_v(d, b"useTexture", False)), "padrao": "xadrez", "escala": float(_v(d, b"Scl ", 100)),
                                  "prof": float(_v(d, b"textureDepth", 100)), "inverter": bool(_v(d, b"InvT", False))})
            elif tipo == "acetinado":
                e.update(bm=bm(d, p="MULTIPLY"), cor=_hex(d.get(b"Clr ")), op=float(_v(d, b"Opct", 50)), ang=float(_v(d, b"lagl", 19)),
                         dist=float(_v(d, b"Dstn", 11)), tam=float(_v(d, b"blur", 14)), inverter=bool(_v(d, b"Invr", True)))
            elif tipo == "corSob":
                e.update(bm=bm(d), cor=_hex(d.get(b"Clr ")), op=float(_v(d, b"Opct", 100)))
            elif tipo == "degSob":
                tipos = {"Lnr ": "linear", "Rdl ": "radial", "Angl": "angulo", "Rflc": "refletido", "Dmnd": "diamante"}
                of = d.get(b"Ofst")
                e.update(bm=bm(d), op=float(_v(d, b"Opct", 100)), grad=_grad_ler(d.get(b"Grad")), estilo=tipos.get(_enum(d, b"Type"), "linear"),
                         ang=float(_v(d, b"Angl", 90)), escala=float(_v(d, b"Scl ", 100)), inverter=bool(_v(d, b"Rvrs", False)),
                         alinhar=bool(_v(d, b"Algn", True)), ofx=float(_v(of, b"Hrzn", 0)), ofy=float(_v(of, b"Vrtc", 0)))
            elif tipo == "padraoSob":
                e.update(bm=bm(d), op=float(_v(d, b"Opct", 100)), padrao="xadrez", escala=float(_v(d, b"Scl ", 100)), psd=True)
            elif tipo == "tracado":
                pos = {"OutF": "fora", "InsF": "dentro", "CtrF": "centro"}.get(_enum(d, b"Styl"), "fora")
                pt = {"SClr": "cor", "GrFl": "degrade", "Ptrn": "padrao"}.get(_enum(d, b"PntT"), "cor")
                e.update(tam=float(_v(d, b"Sz  ", 3)), pos=pos, bm=bm(d), op=float(_v(d, b"Opct", 100)), tipo=pt, cor=_hex(d.get(b"Clr ")))
                if pt == "degrade":
                    tipos = {"Lnr ": "linear", "Rdl ": "radial", "Angl": "angulo", "Rflc": "refletido", "Dmnd": "diamante"}
                    e.update(grad=_grad_ler(d.get(b"Grad")), estilo=tipos.get(_enum(d, b"Type"), "linear"), ang=float(_v(d, b"Angl", 90)),
                             escala=float(_v(d, b"Scl ", 100)), inverter=bool(_v(d, b"Rvrs", False)))
            e["global"] = e.pop("global_", False) if "global_" in e else False
            lista.append(e)
        if lista:
            out[tipo] = lista
    return out, bool(_v(blk, b"masterFXSwitch", True))


def _ler_mescla(layer):
    """Opções de mesclagem avançadas: canais, vazamento, misturar interior/cortadas, máscaras e Misturar se."""
    from psd_tools.constants import Tag
    tb = layer.tagged_blocks
    out = {}
    try:
        k = tb.get_data(Tag.KNOCKOUT_SETTING) if Tag.KNOCKOUT_SETTING in tb else 0
        out["vazamento"] = {1: "raso", 2: "profundo"}.get(int(getattr(k, "value", k) or 0), "nenhum")
        for tag, chave, padrao in ((Tag.BLEND_INTERIOR_ELEMENTS, "misturaInterior", False), (Tag.BLEND_CLIPPING_ELEMENTS, "misturaCorte", True),
                                   (Tag.TRANSPARENCY_SHAPES_LAYER, "formaTransp", True), (Tag.LAYER_MASK_AS_GLOBAL_MASK, "mascaraOcultaFx", False),
                                   (Tag.VECTOR_MASK_AS_GLOBAL_MASK, "vetorOcultaFx", False)):
            v = tb.get_data(tag) if tag in tb else None
            out[chave] = bool(getattr(v, "value", v)) if v is not None else padrao
        if Tag.CHANNEL_BLENDING_RESTRICTIONS_SETTING in tb:
            fora = set(int(x) for x in tb.get_data(Tag.CHANNEL_BLENDING_RESTRICTIONS_SETTING))
            out["canais"] = {"r": 0 not in fora, "g": 1 not in fora, "b": 2 not in fora}
        rg = layer._record.blending_ranges

        def faixa(par16):
            (b, w) = par16
            return [b >> 8, b & 255, w >> 8, w & 255]
        if rg is not None and rg.composite_ranges:
            m = {"cinza": {"atual": faixa(rg.composite_ranges[0]), "baixo": faixa(rg.composite_ranges[1])}}
            for nome, cr in zip(("r", "g", "b"), rg.channel_ranges or []):
                m[nome] = {"atual": faixa(cr[0]), "baixo": faixa(cr[1])}
            out["mescSe"] = m
    except Exception:
        logging.debug("opções de mesclagem não lidas", exc_info=True)
    return out


def _grad_desc(g):
    import psd_tools.psd.descriptor as D
    from psd_tools.psd.descriptor import Unit
    d = D.Descriptor(classID=b"Grdn")
    d[b"Nm  "] = D.String(str(g.get("nome") or "Personalizado"))
    d[b"GrdF"] = D.Enumerated(typeID=b"GrdF", enum=b"CstS")
    # suavidade: degradê feito no editor vai com 0% (mistura linear, que é como o editor desenha; com os 100% padrão do
    # Photoshop as cores entre as paradas saem bem diferentes); vindo do PSD, a suavidade dele volta igual
    d[b"Intr"] = D.Double(round(float(g.get("suave") or 0) * 40.96, 2))
    cores = []
    for pos, cor in g.get("cores") or [[0, "#000000"], [1, "#ffffff"]]:
        c = D.Descriptor(classID=b"Clrt")
        c[b"Clr "] = _cor_desc(cor)
        c[b"Type"] = D.Enumerated(typeID=b"Clry", enum=b"UsrS")
        c[b"Lctn"] = D.Integer(int(round(float(pos) * 4096)))
        c[b"Mdpn"] = D.Integer(50)
        cores.append(c)
    d[b"Clrs"] = D.List(cores)
    trans = []
    for pos, op in g.get("ops") or [[0, 100], [1, 100]]:
        t = D.Descriptor(classID=b"TrnS")
        t[b"Opct"] = D.UnitFloat(unit=Unit.Percent, value=float(op))
        t[b"Lctn"] = D.Integer(int(round(float(pos) * 4096)))
        t[b"Mdpn"] = D.Integer(50)
        trans.append(t)
    d[b"Trns"] = D.List(trans)
    return d


def _cor_desc(hexa):
    import psd_tools.psd.descriptor as D
    h = str(hexa or "#000000").lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    c = D.Descriptor(classID=b"RGBC")
    c[b"Rd  "], c[b"Grn "], c[b"Bl  "] = D.Double(float(r)), D.Double(float(g)), D.Double(float(b))
    return c


def _fx_desc(tipo, p, antigo=None):
    """Descritor de um efeito do Photoshop (lfx2) a partir do efeito do editor."""
    import psd_tools.psd.descriptor as D
    from psd_tools.psd.descriptor import Unit
    _, para = _bm_codigos()

    def curva():
        c = D.Descriptor(classID=b"ShpC")
        c[b"Nm  "] = D.String("Linear")
        pts = []
        for x in (0.0, 255.0):
            q = D.Descriptor(classID=b"CrPt")
            q[b"Hrzn"], q[b"Vrtc"] = D.Double(x), D.Double(x)
            pts.append(q)
        c[b"Crv "] = D.List(pts)
        return c

    px = lambda v: D.UnitFloat(unit=Unit.Pixels, value=float(v or 0))
    pc = lambda v, pad=100: D.UnitFloat(unit=Unit.Percent, value=float(pad if v is None else v))
    ang = lambda v: D.UnitFloat(unit=Unit.Angle, value=float(v if v is not None else 120))
    modo = lambda m, pad="NORMAL": D.Enumerated(typeID=b"BlnM", enum=para.get(m or pad, para["NORMAL"]))
    en = lambda t, e: D.Enumerated(typeID=t, enum=e)
    d = D.Descriptor(classID=_FX_CHAVES[tipo][2])
    d[b"enab"], d[b"present"], d[b"showInDialog"] = D.Bool(bool(p.get("on", True))), D.Bool(True), D.Bool(True)
    if tipo in ("sombra", "sombraInt"):
        d[b"Md  "] = modo(p.get("bm"), "MULTIPLY")
        d[b"Clr "] = _cor_desc(p.get("cor"))
        d[b"Opct"] = pc(p.get("op"), 75)
        d[b"uglg"] = D.Bool(bool(p.get("global")))
        d[b"lagl"] = ang(p.get("ang"))
        d[b"Dstn"] = px(p.get("dist"))
        d[b"Ckmt"] = px(p.get("spread" if tipo == "sombra" else "choke"))
        d[b"blur"] = px(p.get("tam"))
        d[b"Nose"] = pc(0, 0)
        d[b"AntA"] = D.Bool(False)
        d[b"TrnS"] = curva()
        if tipo == "sombra":
            d[b"layerConceals"] = D.Bool(p.get("ocultar", True) is not False)
    elif tipo in ("brilho", "brilhoInt"):
        d[b"Md  "] = modo(p.get("bm"), "SCREEN")
        d[b"Clr "] = _cor_desc(p.get("cor") or "#ffffbe")
        d[b"Opct"] = pc(p.get("op"), 75)
        d[b"GlwT"] = en(b"BETE", b"PrBL" if p.get("tecnica") == "precisa" else b"SfBL")
        d[b"Ckmt"] = px(p.get("spread" if tipo == "brilho" else "choke"))
        d[b"blur"] = px(p.get("tam"))
        d[b"Nose"] = pc(0, 0)
        d[b"ShdN"] = pc(0, 0)
        d[b"AntA"] = D.Bool(False)
        d[b"TrnS"] = curva()
        d[b"Inpr"] = pc(50)
        if tipo == "brilhoInt":
            d[b"glwS"] = en(b"IGSr", b"SrcC" if p.get("fonte") == "centro" else b"SrcE")
    elif tipo == "chanfro":
        est = {"externo": b"OtrB", "interno": b"InrB", "entalhe": b"Embs", "almofada": b"PlEb", "traco": b"strokeEmboss"}
        tec = {"suave": b"SfBL", "cinzelDuro": b"PrBL", "cinzelSuave": b"Slmt"}
        d[b"hglM"] = modo(p.get("hBm"), "SCREEN")
        d[b"hglC"] = _cor_desc(p.get("hCor") or "#ffffff")
        d[b"hglO"] = pc(p.get("hOp"), 50)
        d[b"sdwM"] = modo(p.get("sBm"), "MULTIPLY")
        d[b"sdwC"] = _cor_desc(p.get("sCor") or "#000000")
        d[b"sdwO"] = pc(p.get("sOp"), 50)
        d[b"bvlT"] = en(b"bvlT", tec.get(p.get("tecnica"), b"SfBL"))
        d[b"bvlS"] = en(b"BESl", est.get(p.get("estilo"), b"InrB"))
        d[b"uglg"] = D.Bool(bool(p.get("global")))
        d[b"lagl"] = ang(p.get("ang"))
        d[b"Lald"] = ang(p.get("alt") if p.get("alt") is not None else 30)
        d[b"srgR"] = pc(p.get("prof"), 100)
        d[b"blur"] = px(p.get("tam"))
        d[b"bvlD"] = en(b"BESs", b"Out " if p.get("dir") == "baixo" else b"In  ")
        d[b"TrnS"] = curva()
        d[b"antialiasGloss"] = D.Bool(False)
        d[b"Sftn"] = px(p.get("suav"))
        cont, tex = p.get("contorno") or {}, p.get("textura") or {}
        d[b"useShape"] = D.Bool(bool(cont.get("on")))
        d[b"MpgS"] = curva()
        d[b"AntA"] = D.Bool(False)
        d[b"Inpr"] = pc(cont.get("intervalo"), 50)
        d[b"useTexture"] = D.Bool(False)   # a textura do editor usa padrões próprios (não vão para o PSD)
    elif tipo == "acetinado":
        d[b"Md  "] = modo(p.get("bm"), "MULTIPLY")
        d[b"Clr "] = _cor_desc(p.get("cor"))
        d[b"AntA"] = D.Bool(False)
        d[b"Invr"] = D.Bool(bool(p.get("inverter", True)))
        d[b"Opct"] = pc(p.get("op"), 50)
        d[b"lagl"] = ang(p.get("ang") if p.get("ang") is not None else 19)
        d[b"Dstn"] = px(p.get("dist"))
        d[b"blur"] = px(p.get("tam"))
        d[b"MpgS"] = curva()
    elif tipo == "corSob":
        d[b"Md  "] = modo(p.get("bm"))
        d[b"Clr "] = _cor_desc(p.get("cor"))
        d[b"Opct"] = pc(p.get("op"))
    elif tipo in ("degSob", "tracado"):
        tipos = {"linear": b"Lnr ", "radial": b"Rdl ", "angulo": b"Angl", "refletido": b"Rflc", "diamante": b"Dmnd"}
        if tipo == "tracado":
            d[b"Styl"] = en(b"FStl", {"dentro": b"InsF", "centro": b"CtrF"}.get(p.get("pos"), b"OutF"))
            d[b"PntT"] = en(b"FrFl", b"GrFl" if p.get("tipo") == "degrade" else b"SClr")
            d[b"Md  "] = modo(p.get("bm"))
            d[b"Opct"] = pc(p.get("op"))
            d[b"Sz  "] = px(p.get("tam", 3))
            d[b"Clr "] = _cor_desc(p.get("cor"))
            d[b"overprint"] = D.Bool(False)
        else:
            d[b"Md  "] = modo(p.get("bm"))
            d[b"Opct"] = pc(p.get("op"))
        if tipo == "degSob" or p.get("tipo") == "degrade":
            d[b"Grad"] = _grad_desc(p.get("grad") or {})
            d[b"Angl"] = ang(p.get("ang") if p.get("ang") is not None else 90)
            d[b"Type"] = en(b"GrdT", tipos.get(p.get("estilo"), b"Lnr "))
            d[b"Rvrs"] = D.Bool(bool(p.get("inverter")))
            d[b"Dthr"] = D.Bool(False)
            d[b"Algn"] = D.Bool(p.get("alinhar", True) is not False)
            d[b"Scl "] = pc(p.get("escala"))
            of = D.Descriptor(classID=b"Pnt ")
            of[b"Hrzn"] = D.UnitFloat(unit=Unit.Percent, value=float(p.get("ofx") or 0))
            of[b"Vrtc"] = D.UnitFloat(unit=Unit.Percent, value=float(p.get("ofy") or 0))
            d[b"Ofst"] = of
    elif tipo == "padraoSob":
        if antigo is not None:   # padrão vindo do PSD: mantém o desenho dele, troca o resto
            d = antigo
            d[b"enab"] = D.Bool(bool(p.get("on", True)))
            d[b"Md  "] = modo(p.get("bm"))
            d[b"Opct"] = pc(p.get("op"))
            d[b"Scl "] = pc(p.get("escala"))
        else:
            return None   # padrão novo do editor: o PSD precisa do padrão gravado no arquivo (fica só no editor)
    return d


def _gravar_efeitos(layer, fx, oculto=False, avisos=None):
    """Reescreve no PSD os efeitos do editor (todos os tipos e instâncias). O que não é efeito conhecido fica."""
    import psd_tools.psd.descriptor as D
    from psd_tools.constants import Tag
    from psd_tools.psd.descriptor import Unit
    tb = layer._record.tagged_blocks
    blk = tb.get_data(Tag.OBJECT_BASED_EFFECTS_LAYER_INFO)
    fx = fx or {}
    if "_v2" not in fx and any(k in fx for k in ("contorno", "sobreposicao")) or isinstance(fx.get("sombra"), dict):
        fx = _fx_antigo_para_v2(fx)
    algum = any(fx.get(k) for k in _FX_CHAVES)
    if blk is None:
        if not algum:
            return
        blk = D.DescriptorBlock2(classID=b"null", version=0, data_version=16)
        blk[b"Scl "] = D.UnitFloat(unit=Unit.Percent, value=100.0)
        blk[b"masterFXSwitch"] = D.Bool(True)
    blk[b"masterFXSwitch"] = D.Bool(not oculto)
    for tipo, (unico, multi, _cls) in _FX_CHAVES.items():
        antigos = list(blk[multi]) if multi and multi in blk else ([blk[unico]] if unico in blk else [])
        novos = []
        for i, p in enumerate(fx.get(tipo) or []):
            d = _fx_desc(tipo, p, antigos[i] if i < len(antigos) and tipo == "padraoSob" else None)
            if d is None:
                if avisos is not None:
                    avisos.append(f"{layer.name}: Sobreposição de padrão do editor não vai para o PSD")
                continue
            novos.append(d)
        for k in (unico, multi):
            if k and k in blk:
                del blk[k]
        if not novos:
            continue
        if multi and len(novos) > 1:
            blk[multi] = D.List(novos)
        blk[unico] = novos[0]
    tb.set_data(Tag.OBJECT_BASED_EFFECTS_LAYER_INFO, blk)
    try:
        if Tag.EFFECTS_LAYER in tb:   # o bloco antigo (lrFX) ficaria diferente: o Photoshop refaz a partir do lfx2
            del tb[Tag.EFFECTS_LAYER]
    except Exception:
        pass


def _fx_antigo_para_v2(fx):
    out = {"_v2": True}
    if fx.get("sombra"):
        s = fx["sombra"]
        out["sombra"] = [{"on": True, "bm": "MULTIPLY", "cor": s.get("cor"), "op": s.get("op", 75), "ang": s.get("ang", 120), "dist": s.get("dist", 0), "tam": s.get("tam", 0)}]
    if fx.get("brilho"):
        g = fx["brilho"]
        out["brilho"] = [{"on": True, "bm": "SCREEN", "cor": g.get("cor"), "op": g.get("op", 75), "tam": g.get("tam", 0)}]
    if fx.get("contorno"):
        t = fx["contorno"]
        pos = str(t.get("pos") or "")
        out["tracado"] = [{"on": True, "cor": t.get("cor"), "op": t.get("op", 100), "tam": t.get("larg", 3),
                           "pos": "dentro" if "inside" in pos else "centro" if "center" in pos else "fora"}]
    if fx.get("sobreposicao"):
        o = fx["sobreposicao"]
        out["corSob"] = [{"on": True, "cor": o.get("cor"), "op": o.get("op", 100)}]
    return out


def _gravar_mescla(layer, m):
    """Opções de mesclagem avançadas (blocos knko, infx, clbl, tsly, lmgm, vmgm, brst e Misturar se)."""
    from psd_tools.constants import Tag
    tb = layer._record.tagged_blocks
    if not m:
        return
    vals = {Tag.KNOCKOUT_SETTING: {"raso": 1, "profundo": 2}.get(m.get("vazamento"), 0),
            Tag.BLEND_INTERIOR_ELEMENTS: int(bool(m.get("misturaInterior"))),
            Tag.BLEND_CLIPPING_ELEMENTS: int(m.get("misturaCorte", True) is not False),
            Tag.TRANSPARENCY_SHAPES_LAYER: int(m.get("formaTransp", True) is not False),
            Tag.LAYER_MASK_AS_GLOBAL_MASK: int(bool(m.get("mascaraOcultaFx"))),
            Tag.VECTOR_MASK_AS_GLOBAL_MASK: int(bool(m.get("vetorOcultaFx")))}
    for tag, v in vals.items():
        try:
            tb.set_data(tag, v)
        except Exception as e:
            logging.debug("bloco %s: %s", tag, e)
    can = m.get("canais") or {}
    fora = [i for i, k in enumerate(("r", "g", "b")) if can.get(k) is False]
    try:
        if fora:
            from psd_tools.psd.tagged_blocks import ChannelBlendingRestrictionsSetting
            tb.set_data(Tag.CHANNEL_BLENDING_RESTRICTIONS_SETTING, ChannelBlendingRestrictionsSetting(fora))
        elif Tag.CHANNEL_BLENDING_RESTRICTIONS_SETTING in tb:
            del tb[Tag.CHANNEL_BLENDING_RESTRICTIONS_SETTING]
    except Exception as e:
        logging.debug("canais: %s", e)
    ms = m.get("mescSe")
    if ms:
        try:
            from psd_tools.psd.layer_and_mask import LayerBlendingRanges

            def par(f):
                f = [max(0, min(255, int(round(x)))) for x in (f or [0, 0, 255, 255])]
                return (f[0] << 8 | f[1], f[2] << 8 | f[3])
            cinza = ms.get("cinza") or {}
            canais = [[par((ms.get(k) or {}).get("atual")), par((ms.get(k) or {}).get("baixo"))] for k in ("r", "g", "b")]
            antigo = layer._record.blending_ranges
            extra = list(antigo.channel_ranges[3:]) if antigo is not None and antigo.channel_ranges else []
            layer._record.blending_ranges = LayerBlendingRanges(
                composite_ranges=[par(cinza.get("atual")), par(cinza.get("baixo"))], channel_ranges=canais + extra)
        except Exception as e:
            logging.debug("misturar se: %s", e)


# ─────────────────────────── pranchetas e guias ───────────────────────────
def _ler_prancheta(layer):
    """Retângulo e fundo da prancheta (artb): fundo 1 branco, 2 preto, 3 transparente, 4 cor."""
    from psd_tools.constants import Tag
    try:
        d = None
        for t in (Tag.ARTBOARD_DATA1, Tag.ARTBOARD_DATA2, Tag.ARTBOARD_DATA3):
            d = layer.tagged_blocks.get_data(t)
            if d is not None:
                break
        r = d[b"artboardRect"]
        x, y = float(r[b"Left"]), float(r[b"Top "])
        tipo = int(d.get(b"artboardBackgroundType", 1))
        fundo = {1: "#ffffff", 2: "#000000", 3: None}.get(tipo, "#ffffff")
        if tipo == 4:
            c = d[b"Clr "]
            fundo = "#%02x%02x%02x" % tuple(max(0, min(255, int(round(float(c[k]))))) for k in (b"Rd  ", b"Grn ", b"Bl  "))
        return {"x": int(round(x)), "y": int(round(y)), "w": int(round(float(r[b"Rght"]) - x)), "h": int(round(float(r[b"Btom"]) - y)), "fundo": fundo}
    except Exception:
        x1, y1, x2, y2 = layer.bbox
        return {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1, "fundo": "#ffffff"}


def _gravar_prancheta(layer, p):
    """Atualiza retângulo e fundo da prancheta (artb) que o editor mudou."""
    from psd_tools.constants import Tag
    from psd_tools.psd.descriptor import Double
    for t in (Tag.ARTBOARD_DATA1, Tag.ARTBOARD_DATA2, Tag.ARTBOARD_DATA3):
        d = layer.tagged_blocks.get_data(t)
        if d is None:
            continue
        r = d[b"artboardRect"]
        for k, v in ((b"Left", p["x"]), (b"Top ", p["y"]), (b"Rght", p["x"] + p["w"]), (b"Btom", p["y"] + p["h"])):
            r[k] = Double(float(v))
        f = p.get("fundo")
        if f is None:
            d[b"artboardBackgroundType"] = type(d[b"artboardBackgroundType"])(3)
        elif f.lower() in ("#ffffff", "#000000"):
            d[b"artboardBackgroundType"] = type(d[b"artboardBackgroundType"])(1 if f.lower() == "#ffffff" else 2)
        else:
            d[b"artboardBackgroundType"] = type(d[b"artboardBackgroundType"])(4)
            c = d[b"Clr "]
            for k, i in ((b"Rd  ", 1), (b"Grn ", 3), (b"Bl  ", 5)):
                c[k] = Double(float(int(f[i:i + 2], 16)))
        return


def _ler_guias(psd):
    """Guias do documento: [{o: 'v'|'h', p: px}] (o PSD guarda em 1/32 de pixel)."""
    from psd_tools.constants import Resource
    try:
        g = psd.image_resources.get_data(Resource.GRID_AND_GUIDES_INFO)
        out = []
        for loc, dire in (g.data if g is not None else []):
            loc = loc - (1 << 32) if loc >= (1 << 31) else loc
            out.append({"o": "v" if int(dire) == 0 else "h", "p": round(loc / 32, 3)})
        return out
    except Exception:
        return []


def _gravar_guias(psd, guias):
    from psd_tools.constants import Resource
    import psd_tools.psd.image_resources as ir
    res = psd._record.image_resources
    dados = [((int(round(float(g["p"]) * 32))) & 0xFFFFFFFF, 0 if g["o"] == "v" else 1) for g in guias or []]
    if Resource.GRID_AND_GUIDES_INFO in res:
        res[Resource.GRID_AND_GUIDES_INFO].data.data = dados
    else:
        res[Resource.GRID_AND_GUIDES_INFO] = ir.ImageResource(key=Resource.GRID_AND_GUIDES_INFO.value, name="",
                                                              data=ir.GridGuidesInfo(version=1, horizontal=576, vertical=576, data=dados))


# ─────────────────────────── fatias (ferramenta Fatia) ───────────────────────────
def _ler_fatias(psd):
    """Fatias criadas pelo usuário (as automáticas o Photoshop refaz): [{x, y, w, h, nome, url, alt}]."""
    from psd_tools.constants import Resource
    try:
        r = psd.image_resources.get_data(Resource.SLICES)
    except Exception:
        return []
    if r is None:
        return []
    out = []
    try:
        if r.version == 6:
            import attrs
            for it in attrs.asdict(r.data, recurse=False)["items"]:
                if it.origin != 2:   # 0 = automática, 1 = da camada, 2 = do usuário
                    continue
                x1, y1, x2, y2 = it.bbox
                out.append({"x": int(x1), "y": int(y1), "w": int(x2 - x1), "h": int(y2 - y1), "nome": it.name or "",
                            "url": it.url or "", "alt": it.alt_tag or ""})
        else:   # 7/8: descritor (Photoshop CS2+)
            def val(v):
                return getattr(v, "value", v)

            for it in r.data.get(b"slices", []):
                origem = str(val(it.get(b"origin", "")))
                if "user" not in origem.lower():
                    continue
                b = it.get(b"bounds")
                x1, y1 = int(val(b.get(b"Left"))), int(val(b.get(b"Top ")))
                x2, y2 = int(val(b.get(b"Rght"))), int(val(b.get(b"Btom")))
                out.append({"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1, "nome": str(val(it.get(b"Nm  ", ""))).strip("\x00"),
                            "url": str(val(it.get(b"url ", ""))).strip("\x00"), "alt": str(val(it.get(b"altTag", ""))).strip("\x00")})
    except Exception:
        logging.debug("fatias do PSD não lidas", exc_info=True)
    return out


def _gravar_fatias(psd, fatias, W, H, nome):
    """Troca o recurso de fatias (versão 6, que o Photoshop lê): a automática do documento + as do usuário."""
    import psd_tools.psd.image_resources as ir
    from psd_tools.constants import Resource
    res = psd._record.image_resources
    itens = [ir.SliceV6(slice_id=0, group_id=0, origin=0, name="", slice_type=1, bbox=[0, 0, W, H])]
    for i, f in enumerate(fatias or [], 1):
        x, y = max(0, int(f["x"])), max(0, int(f["y"]))
        x2, y2 = min(W, int(f["x"] + f["w"])), min(H, int(f["y"] + f["h"]))
        if x2 <= x or y2 <= y:
            continue
        itens.append(ir.SliceV6(slice_id=i, group_id=0, origin=2, name=str(f.get("nome") or ""), slice_type=1,
                                bbox=[x, y, x2, y2], url=str(f.get("url") or ""), alt_tag=str(f.get("alt") or "")))
    dado = ir.Slices(version=6, data=ir.SlicesV6(bbox=[0, 0, H, W], name=nome or "", items=itens))
    res[Resource.SLICES] = ir.ImageResource(key=Resource.SLICES.value, name="", data=dado)


def exportar_fatias(spec):
    """spec = {sessao, fatias: [{arquivo, destino}], qualidade, dpi}: grava cada recorte enviado pela página."""
    arquivos = media_server.fechar_envio(spec.get("sessao"))
    feitos, erros = [], []
    for f in spec.get("fatias") or []:
        im = _img(arquivos, f.get("arquivo"))
        if im is None:
            erros.append(f.get("destino"))
            continue
        r = _gravar_imagem(im, f["destino"], int(spec.get("qualidade", 92)), float(spec.get("dpi") or 72))
        (feitos if r is None else erros).append(f["destino"])
    return {"success": bool(feitos) and not erros, "feitos": feitos, "erros": erros}


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
    td[b"Txt "] = String(novo + chr(0))   # o Photoshop grava o texto terminado em nulo
    raiz = td[b"EngineData"].value
    edd = raiz["EngineDict"]
    n = len(novo) + 1   # o EngineData conta a quebra final
    _ed_set(edd["Editor"], "Text", E.String(novo + chr(13)))
    for run in ("StyleRun", "ParagraphRun"):
        r = edd[run]
        _ed_set(r, "RunArray", E.List([r["RunArray"][0]]))
        _ed_set(r, "RunLengthArray", E.List([E.Integer(n)]))
    if estilo:
        _estilo_caractere(raiz, edd["StyleRun"]["RunArray"][0]["StyleSheet"]["StyleSheetData"], estilo)
        props = edd["ParagraphRun"]["RunArray"][0]["ParagraphSheet"]["Properties"]
        if estilo.get("alin"):
            _ed_set(props, "Justification", E.Integer({"left": 0, "right": 1, "center": 2, "justify": 3, "justify-left": 3,
                                                       "justify-right": 4, "justify-center": 5, "justify-all": 6}.get(estilo["alin"], 0)))
        for k, chave in (("recuoEsq", "StartIndent"), ("recuoDir", "EndIndent"), ("recuo1", "FirstLineIndent"),
                         ("espAntes", "SpaceBefore"), ("espDepois", "SpaceAfter")):
            if k in estilo:
                _ed_set(props, chave, E.Float(float(estilo[k] or 0)))
        if "hifen" in estilo:
            _ed_set(props, "AutoHyphenate", E.Bool(bool(estilo["hifen"])))
    return True


def _estilo_caractere(raiz, sd, estilo):
    """Painel Caractere do editor → StyleSheetData de um trecho do EngineData (fonte, tamanho, cor, espaçamento...)."""
    from psd_tools.psd import engine_data as E
    if True:
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
            # o EngineData tem DUAS listas de fontes (ResourceDict e DocumentResources) e o índice da fonte vale para as
            # duas: fonte nova só numa delas derruba o Photoshop ao abrir (2026-10-06)
            listas = [raiz[s]["FontSet"] for s in ("ResourceDict", "DocumentResources") if s in raiz and "FontSet" in raiz[s]]
            nomes = [str(getattr(f["Name"], "value", f["Name"])).strip("'\"()") for f in listas[0]]
            if ps not in nomes:
                for fs in listas:
                    fs.append(_ed_dict([("Name", E.String(ps)), ("Script", E.Integer(0)), ("FontType", E.Integer(1)), ("Synthetic", E.Integer(0))]))
                nomes.append(ps)
            _ed_set(sd, "Font", E.Integer(nomes.index(ps)))
        # resto do painel Caractere
        for k, chave, conv in (("escH", "HorizontalScale", lambda v: E.Float(float(v) / 100)),
                               ("escV", "VerticalScale", lambda v: E.Float(float(v) / 100)),
                               ("desloc", "BaselineShift", lambda v: E.Float(float(v))),
                               ("negFalso", "FauxBold", lambda v: E.Bool(bool(v))),
                               ("itaFalso", "FauxItalic", lambda v: E.Bool(bool(v))),
                               ("pos", "FontBaseline", lambda v: E.Integer({"sobrescrito": 1, "subscrito": 2}.get(v, 0))),
                               ("sublinhado", "Underline", lambda v: E.Bool(bool(v))),
                               ("tachado", "Strikethrough", lambda v: E.Bool(bool(v))),
                               ("kern", "AutoKerning", lambda v: E.Bool(v == "metricas" or v == "optico"))):
            if k in estilo:
                _ed_set(sd, chave, conv(estilo[k]))
        if "caixaAlta" in estilo or "versalete" in estilo:
            _ed_set(sd, "FontCaps", E.Integer(2 if estilo.get("caixaAlta") else 1 if estilo.get("versalete") else 0))


def _incorporados_v7(psd):
    """Arquivos incorporados dos objetos inteligentes (lnk2/lnkD/lnk3) gravados na versão 7. O Photoshop 2026 grava a 8,
    que tem um descritor a mais no fim (contentID) que o psd-tools lê mas NÃO escreve: o item sai curto e o Photoshop
    recusa o PSD inteiro ("as opções de abertura estão incorretas", 2026-10-07). A 7 não tem esse campo e o Photoshop
    abre normalmente; o contentID (só para Bibliotecas) se perde."""
    from psd_tools.constants import Tag
    blocos = psd._record.layer_and_mask_information.tagged_blocks
    if not blocos:
        return
    for nome in ("LINKED_LAYER1", "LINKED_LAYER2", "LINKED_LAYER3"):
        tag = getattr(Tag, nome, None)
        if tag is not None and tag in blocos:
            for item in blocos.get_data(tag):
                if getattr(item, "version", 0) > 7:
                    item.version = 7


def _so_novo(psd, ob, so, png):
    """Objeto inteligente criado no editor → objeto inteligente incorporado do Photoshop: clona o molde
    (psd_so_modelo, gerado colocando um PNG no Photoshop) e troca uuid, os 4 cantos (sup. esq., sup. dir., inf. dir.,
    inf. esq., em pixels do documento), o tamanho do conteúdo e o PNG incorporado (o original, L.c0, sem transformação).
    O arquivo vai no bloco global lnk2, ligado à camada pelo uuid. Os pixels da camada são os desenhados pelo editor."""
    from psd_tools.constants import Tag
    from psd_tools.psd.descriptor import Double, String
    from psd_tools.psd.linked_layer import LinkedLayers
    from psd_tools.psd.tagged_blocks import PlacedLayerData, SmartObjectLayerData, TaggedBlock, TaggedBlocks
    from Functions import psd_so_modelo as modelo
    if not png:
        raise ValueError("sem o conteúdo original")
    cantos = [float(v) for v in so["cantos"]]
    if len(cantos) != 8:
        raise ValueError("cantos inválidos")
    u = str(uuid.uuid4())
    pl = PlacedLayerData.frombytes(modelo.PLLD)
    pl.uuid = u.encode()
    pl.transform = tuple(cantos)
    sd = SmartObjectLayerData.frombytes(modelo.SOLD)
    d = sd.data
    d[b"Idnt"] = String(u + "\x00")
    d[b"placed"] = String(str(uuid.uuid4()) + "\x00")
    for chave in (b"Trnf", b"nonAffineTransform"):
        for i, v in enumerate(cantos):
            d[chave][i] = Double(v)
    d[b"Sz  "][b"Wdth"] = Double(float(so["w"]))
    d[b"Sz  "][b"Hght"] = Double(float(so["h"]))
    ob.tagged_blocks[Tag.PLACED_LAYER2] = TaggedBlock(key=Tag.PLACED_LAYER2, data=pl)
    ob.tagged_blocks[Tag.SMART_OBJECT_LAYER_DATA1] = TaggedBlock(key=Tag.SMART_OBJECT_LAYER_DATA1, data=sd)
    item = LinkedLayers.frombytes(modelo.LNK2)[0]
    item.uuid = u
    nome = "".join(ch for ch in str(so.get("nome") or "Objeto") if ch not in '<>:"/\\|?*').strip()[:60] or "Objeto"
    item.filename = nome + ".png\x00"
    item.data = png
    lm = psd._record.layer_and_mask_information
    if lm.tagged_blocks is None:
        lm.tagged_blocks = TaggedBlocks()
    if Tag.LINKED_LAYER2 in lm.tagged_blocks:
        lm.tagged_blocks.get_data(Tag.LINKED_LAYER2).append(item)
    else:
        lm.tagged_blocks[Tag.LINKED_LAYER2] = TaggedBlock(key=Tag.LINKED_LAYER2, data=LinkedLayers([item]))
    return True


_OP_DEMARCADOR = {"excluir": 0, "somar": 1, "subtrair": 2, "inter": 3}   # operação do subdemarcador no PSD


def _cor_soco(layer):
    """Cor (r, g, b) de uma camada de preenchimento de cor sólida, lida do bloco SoCo (o layer.data do psd-tools já é a
    cor RGBC, sem o Clr em volta — ler .data.get(b"Clr ") dava None). None se não der."""
    from psd_tools.constants import Tag
    try:
        c = layer.tagged_blocks.get_data(Tag.SOLID_COLOR_SHEET_SETTING)[b"Clr "]
        return tuple(max(0, min(255, int(round(float(getattr(c[k], "value", c[k])))))) for k in (b"Rd  ", b"Grn ", b"Bl  "))
    except Exception as e:
        logging.debug("cor do preenchimento %s: %s", getattr(layer, "name", "?"), e)
        return None


def _soco(cor):
    """Bloco de cor sólida (SoCo) como o Photoshop grava (igual byte a byte ao de uma camada feita nele)."""
    from psd_tools.psd.descriptor import Descriptor, DescriptorBlock, Double
    c = str(cor or "#000000").lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    rgb = [int(c[k:k + 2], 16) for k in (0, 2, 4)]
    clr = Descriptor(classID=b"RGBC", name="\x00")
    for k, v in zip((b"Rd  ", b"Grn ", b"Bl  "), rgb):
        clr[k] = Double(float(v))
    soco = DescriptorBlock(version=16, classID=b"null", name="\x00")
    soco[b"Clr "] = clr
    return soco


_GRAD_TIPOS = {"linear": b"Lnr ", "radial": b"Rdl ", "angulo": b"Angl", "refletido": b"Rflc", "diamante": b"Dmnd"}


def _gdfl(pre):
    """Bloco de preenchimento de degradê (GdFl) como o Photoshop 2026 grava (molde: tools/ps_modelo_deg.py), com o
    degradê no mesmo formato da Sobreposição de degradê (_grad_desc) e os campos do diálogo (escala, inverter, alinhar)."""
    import psd_tools.psd.descriptor as D
    from psd_tools.psd.descriptor import Unit
    d = D.DescriptorBlock(version=16, classID=b"null", name="\x00")
    d[b"gradientsInterpolationMethod"] = D.Enumerated(typeID=b"gradientInterpolationMethodType", enum=b"Gcls")
    d[b"Angl"] = D.UnitFloat(unit=Unit.Angle, value=float(pre.get("ang") if pre.get("ang") is not None else 90))
    d[b"Type"] = D.Enumerated(typeID=b"GrdT", enum=_GRAD_TIPOS.get(pre.get("estilo"), b"Lnr "))
    d[b"Grad"] = _grad_desc(pre.get("grad") or {})
    d[b"Rvrs"] = D.Bool(bool(pre.get("inverter")))
    d[b"Dthr"] = D.Bool(False)
    d[b"Algn"] = D.Bool(pre.get("alinhar", True) is not False)
    d[b"Scl "] = D.UnitFloat(unit=Unit.Percent, value=float(pre.get("escala") or 100))
    of = D.Descriptor(classID=b"Pnt ")
    of[b"Hrzn"] = D.UnitFloat(unit=Unit.Percent, value=float(pre.get("ofx") or 0))
    of[b"Vrtc"] = D.UnitFloat(unit=Unit.Percent, value=float(pre.get("ofy") or 0))
    d[b"Ofst"] = of
    return d


def _preenchimento(ob, pre):
    """Camada de preenchimento (nova do editor ou do PSD com cor/degradê trocado): SoCo (cor sólida) ou GdFl (degradê) +
    a marca de que os pixels são cache, como o Photoshop grava (moldes: tools/ps_modelo_pre.py e ps_modelo_deg.py).
    pre = L.pre do editor ({tipo: 'cor', cor} | {tipo: 'degrade', grad, estilo, ang, ...}) ou só a cor (texto).
    A máscara vai pelo caminho normal das máscaras."""
    from psd_tools.constants import Tag
    from psd_tools.psd.tagged_blocks import TaggedBlock
    if not isinstance(pre, dict):
        pre = {"tipo": "cor", "cor": pre}
    if pre.get("tipo") == "degrade":
        novo, velho, dado = Tag.GRADIENT_FILL_SETTING, Tag.SOLID_COLOR_SHEET_SETTING, _gdfl(pre)
    else:
        novo, velho, dado = Tag.SOLID_COLOR_SHEET_SETTING, Tag.GRADIENT_FILL_SETTING, _soco(pre.get("cor"))
    if velho in ob.tagged_blocks:
        del ob.tagged_blocks[velho]
    ob.tagged_blocks[novo] = TaggedBlock(key=novo, data=dado)
    ob._record.flags.pixel_data_irrelevant = True
    return True


def _grad_pre(layer):
    """Preenchimento de degradê do PSD (GdFl) → L.pre do editor. None se não der."""
    from psd_tools.constants import Tag
    try:
        d = layer.tagged_blocks.get_data(Tag.GRADIENT_FILL_SETTING)
        tipos = {v.decode(): k for k, v in _GRAD_TIPOS.items()}
        of = d.get(b"Ofst")
        return {"tipo": "degrade", "grad": _grad_ler(d.get(b"Grad")), "estilo": tipos.get(_enum(d, b"Type"), "linear"),
                "ang": float(_v(d, b"Angl", 90)), "escala": float(_v(d, b"Scl ", 100)), "inverter": bool(_v(d, b"Rvrs", False)),
                "alinhar": bool(_v(d, b"Algn", True)), "ofx": float(_v(of, b"Hrzn", 0)) if of is not None else 0.0,
                "ofy": float(_v(of, b"Vrtc", 0)) if of is not None else 0.0}
    except Exception as e:
        logging.debug("degradê do preenchimento %s: %s", getattr(layer, "name", "?"), e)
        return None


def _forma_nova(ob, vet, W, H):
    """Forma criada no editor (L.vet = {subs, cor}) → camada de forma do Photoshop: cor sólida (SoCo) + máscara vetorial
    (vmsk), como o Photoshop grava (conferido com uma forma feita nele: os blocos de cor saem iguais byte a byte).
    Os pixels da camada são os desenhados pelo editor. Pontos: (y/A, x/L) do documento; i = alça de chegada, o = de saída."""
    from psd_tools.constants import Tag
    from psd_tools.psd.tagged_blocks import TaggedBlock
    from psd_tools.psd import vector as V
    soco = _soco(vet.get("cor"))

    def pt(xy):
        return (float(xy[1]) / H, float(xy[0]) / W)

    itens = [V.PathFillRule(), V.InitialFillRule(value=0)]
    for idx, s in enumerate(q for q in vet.get("subs") or [] if len(q.get("pts") or []) > 1):
        fechado = s.get("fechado", True) is not False
        nos = []
        for p in s["pts"]:
            a = (p["x"], p["y"])
            i, o = p.get("i") or a, p.get("o") or a
            # alças alinhadas (ponto suave) = nó ligado, como o Photoshop marca; senão, canto
            ligado = p.get("i") and p.get("o") and abs((i[0] - a[0]) * (o[1] - a[1]) - (i[1] - a[1]) * (o[0] - a[0])) < 1e-3 * (
                1 + math.hypot(i[0] - a[0], i[1] - a[1]) * math.hypot(o[0] - a[0], o[1] - a[1]))
            cls = (V.ClosedKnotLinked if ligado else V.ClosedKnotUnlinked) if fechado else (V.OpenKnotLinked if ligado else V.OpenKnotUnlinked)
            nos.append(cls(preceding=pt(i), anchor=pt(a), leaving=pt(o)))
        sub = (V.ClosedPath if fechado else V.OpenPath)(items=nos, operation=_OP_DEMARCADOR.get(s.get("op") or "somar", 1), index=idx)
        itens.append(sub)
    if len(itens) == 2:
        raise ValueError("forma sem demarcador")
    vm = V.VectorMaskSetting(version=3, flags=0, path=V.Path(items=itens))
    ob.tagged_blocks[Tag.SOLID_COLOR_SHEET_SETTING] = TaggedBlock(key=Tag.SOLID_COLOR_SHEET_SETTING, data=soco)
    ob.tagged_blocks[Tag.VECTOR_MASK_SETTING1] = TaggedBlock(key=Tag.VECTOR_MASK_SETTING1, data=vm)
    ob._record.flags.pixel_data_irrelevant = True   # como o Photoshop marca: os pixels são cache, quem manda é o vetor
    return True


_TX_CARACTERE = ("ps", "tam", "cor", "esp", "ent", "escH", "escV", "desloc", "negFalso", "itaFalso", "pos", "sublinhado",
                 "tachado", "kern", "caixaAlta", "versalete")
_TX_PARAGRAFO = ("alin", "recuoEsq", "recuoDir", "recuo1", "espAntes", "espDepois", "hifen")


def _texto_novo(ob, tx):
    """Texto criado no editor → camada de texto do Photoshop: clona o molde (psd_texto_modelo, gerado pelo Photoshop)
    e troca texto, estilo (com os trechos de estilo diferente), matriz e caixa de parágrafo. Os pixels da camada são
    os desenhados pelo editor; o Photoshop mostra esses até alguém editar o texto (aí redesenha com a fonte dele)."""
    import copy
    from psd_tools.constants import Tag
    from psd_tools.psd import engine_data as E
    from psd_tools.psd.descriptor import Double
    from psd_tools.psd.tagged_blocks import TaggedBlock, TypeToolObjectSetting
    from Functions import psd_texto_modelo as modelo
    s = str(tx.get("s") or "")
    caixa = tx.get("caixa")
    t = TypeToolObjectSetting.frombytes(modelo.PARAGRAFO if caixa else modelo.PONTO)
    m = [float(v) for v in (tx.get("m") or [1, 0, 0, 1, 0, 0])]
    t.transform = tuple(m)
    ob.tagged_blocks[Tag.TYPE_TOOL_OBJECT_SETTING] = TaggedBlock(key=Tag.TYPE_TOOL_OBJECT_SETTING, data=t)
    estilo = {k: tx[k] for k in _TX_CARACTERE + _TX_PARAGRAFO if k in tx and tx[k] is not None}
    estilo.setdefault("ent", 0)
    _trocar_texto(ob, s, estilo)
    raiz = t.text_data[b"EngineData"].value
    edd = raiz["EngineDict"]
    # trechos (estilos diferentes na mesma caixa): uma run de estilo por pedaço, cada uma a partir da do começo
    trechos = [r for r in tx.get("trechos") or [] if r.get("b", 0) > r.get("a", 0)]
    if trechos:
        n = len(s.replace(chr(13) + chr(10), chr(10))) + 1
        for r in trechos:   # trecho até o fim do texto leva junto a quebra final (como o Photoshop grava)
            if int(r["b"]) >= n - 1:
                r["b"] = n
        cortes = sorted({0, n} | {max(0, min(n, int(v))) for r in trechos for v in (r["a"], r["b"])})
        base = edd["StyleRun"]["RunArray"][0]
        runs, lens = [], []
        for a, b in zip(cortes, cortes[1:]):
            if b <= a:
                continue
            sobre = {}
            for r in trechos:
                if r["a"] <= a < r["b"]:
                    sobre.update({k: v for k, v in r.items() if k in _TX_CARACTERE})
            run = copy.deepcopy(base)
            if sobre:
                _estilo_caractere(raiz, run["StyleSheet"]["StyleSheetData"], sobre)
            runs.append(run)
            lens.append(E.Integer(b - a))
        _ed_set(edd["StyleRun"], "RunArray", E.List(runs))
        _ed_set(edd["StyleRun"], "RunLengthArray", E.List(lens))
    td = t.text_data

    def caixa_desc(chave, l, tp, r, b):
        d = td.get(chave)
        if d is None:
            return
        for k, v in ((b"Left", l), (b"Top ", tp), (b"Rght", r), (b"Btom", b)):
            if k in d:
                d[k] = type(d[k])(unit=d[k].unit, value=v) if hasattr(d[k], "unit") else Double(v)

    if caixa:
        l, tp, r, b = (float(v) for v in caixa)
        foto = edd["Rendered"]["Shapes"]["Children"][0]["Cookie"]["Photoshop"]
        _ed_set(foto, "BoxBounds", E.List([E.Float(v) for v in (l, tp, r, b)]))
        caixa_desc(b"bounds", l, tp, r, b)
    # caixa da tinta no espaço do texto (a dos pixels do editor, desfeita a matriz)
    a, b_, c, d, e, f = m
    det = a * d - b_ * c
    if abs(det) > 1e-9:
        x0, y0, x1, y1 = ob.left, ob.top, ob.right, ob.bottom
        pts = []
        for X, Y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
            X, Y = X - e, Y - f
            pts.append(((d * X - c * Y) / det, (-b_ * X + a * Y) / det))
        caixa_desc(b"boundingBox", min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
        if not caixa:
            caixa_desc(b"bounds", min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
    return True


def _gravar_achatado(psd, comp, W, H, novo=False):
    """Imagem achatada (prévia do arquivo) = a composição feita pela página. PSD novo de documento transparente vai
    como o Photoshop grava: 4 canais no cabeçalho e contagem de camadas negativa (a transparência do achatado no 1º
    canal extra). Com 3 canais o Photoshop toma o documento por opaco e, ao redesenhar uma forma que é a camada mais
    de baixo, enche o retângulo de todas as camadas (2026-10-07)."""
    from psd_tools.api import numpy_io
    if comp is None or comp.size != (W, H):
        comp = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    arr = np.asarray(comp.convert("RGBA")).astype(np.float32) / 255
    cor, alfa = arr[:, :, :3], arr[:, :, 3:4]
    hdr = psd._record.header
    if novo and float(alfa.min()) < 0.999 and hdr.channels == 3:
        hdr.channels = 4
        psd._merged_alpha = True
    fundo_branco = cor * alfa + (1 - alfa)   # sem transparência no achatado: sobre branco, como o Photoshop
    usar_alfa = hdr.channels > 3
    psd._record.image_data.set_data(numpy_io.encode_image_data(psd, cor if usar_alfa else fundo_branco, alfa), hdr)


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
        # referências conferidas ANTES de gravar (2026-10-06: referência desencontrada gravou os pixels de uma camada
        # na outra — "cena5" com o texto de outro slide): a camada reaproveitada do arquivo tem que ser a MESMA do
        # último salvamento (mesmo nome, posição existente, sem duas camadas no mesmo ref). Senão o editor grava tudo.
        usadas, ruins = set(), []

        def conferir(nos):
            for no in nos:
                r = no.get("ref")
                if r is not None:
                    o = todas[r] if isinstance(r, int) and 0 <= r < len(todas) else None
                    esperado = no.get("ref_nome") or no.get("nome")
                    if o is None or r in usadas or (esperado and o.name != esperado):
                        ruins.append(no.get("nome"))
                    usadas.add(r)
                conferir(no.get("filhos") or [])
        conferir(spec.get("camadas") or [])
        if ruins:
            return {"success": False, "refaz": True,
                    "error": f"referências desencontradas em {len(ruins)} camada(s) (ex.: {', '.join(map(str, ruins[:3]))}); gravando tudo de novo"}
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
                if no.get("prancheta") and orig is not None:
                    try:
                        _gravar_prancheta(ob, no["prancheta"])
                    except Exception as e:
                        avisos.append(f"{no.get('nome')}: prancheta não atualizada ({e})")
            elif no["tipo"] == "ajuste":
                if orig is None:   # camada de ajuste criada no editor: o psd-tools não cria ajuste novo
                    avisos.append(f"{no.get('nome')}: camada de ajuste nova fica só no projeto .iknv (não vai para o PSD)")
                    continue
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
                    if ob is not None and no.get("pre_ps") and orig.kind in ("solidcolorfill", "gradientfill"):
                        try:   # cor/degradê trocado no editor (os pixels novos vão abaixo, pelo _trocar_pixels)
                            _preenchimento(orig, no["pre_ps"])
                        except Exception as e:
                            avisos.append(f"{no.get('nome')}: cor do preenchimento não salva ({e})")
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
                    if orig is None and no.get("texto_ps"):   # texto criado no editor: vai como texto editável
                        try:
                            _texto_novo(ob, no["texto_ps"])
                        except Exception as e:
                            logging.debug("texto novo %s: %s", no.get("nome"), e)
                            from psd_tools.constants import Tag
                            if Tag.TYPE_TOOL_OBJECT_SETTING in ob.tagged_blocks:
                                del ob.tagged_blocks[Tag.TYPE_TOOL_OBJECT_SETTING]
                            avisos.append(f"{no.get('nome')}: texto salvo como pixels ({e})")
                    if orig is None and no.get("so_ps"):   # objeto inteligente criado no editor: vai como objeto inteligente
                        try:
                            _so_novo(psd, ob, no["so_ps"], arquivos.get(no["so_ps"].get("chave")))
                            if no["so_ps"].get("filtros"):
                                avisos.append(f"{no.get('nome')}: filtros inteligentes do editor não vão para o PSD "
                                              "(o objeto inteligente vai com o original; a imagem da camada já tem os filtros)")
                        except Exception as e:
                            logging.debug("objeto inteligente novo %s: %s", no.get("nome"), e)
                            from psd_tools.constants import Tag
                            for t_ in (Tag.PLACED_LAYER2, Tag.SMART_OBJECT_LAYER_DATA1):
                                if t_ in ob.tagged_blocks:
                                    del ob.tagged_blocks[t_]
                            avisos.append(f"{no.get('nome')}: objeto inteligente salvo como pixels ({e})")
                    if orig is None and no.get("pre_ps"):   # preenchimento criado no editor: camada de preenchimento
                        try:
                            _preenchimento(ob, no["pre_ps"])
                        except Exception as e:
                            logging.debug("preenchimento novo %s: %s", no.get("nome"), e)
                            avisos.append(f"{no.get('nome')}: preenchimento salvo como pixels ({e})")
                    if orig is None and no.get("forma_ps"):   # forma criada no editor: vai como camada de forma
                        try:
                            _forma_nova(ob, no["forma_ps"], W, H)
                        except Exception as e:
                            logging.debug("forma nova %s: %s", no.get("nome"), e)
                            from psd_tools.constants import Tag
                            for t_ in (Tag.SOLID_COLOR_SHEET_SETTING, Tag.VECTOR_MASK_SETTING1):
                                if t_ in ob.tagged_blocks:
                                    del ob.tagged_blocks[t_]
                            avisos.append(f"{no.get('nome')}: forma salva como pixels ({e})")
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
            if "fx" in no and no["tipo"] != "grupo":
                try:
                    _gravar_efeitos(ob, no["fx"], no.get("fx_oculto"), avisos)
                except Exception as e:
                    avisos.append(f"{no.get('nome')}: efeitos não salvos ({e})")
            if no.get("mescla"):
                try:
                    _gravar_mescla(ob, no["mescla"])
                except Exception as e:
                    avisos.append(f"{no.get('nome')}: opções de mesclagem não salvas ({e})")
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
    _gravar_achatado(psd, _img(arquivos, spec.get("composto")), W, H, novo=not ida)
    if spec.get("luz"):   # luz global (ângulo e altitude usados pelos efeitos com "Usar luz global")
        try:
            from psd_tools.constants import Resource
            res = psd._record.image_resources
            for rid, v in ((Resource.GLOBAL_ANGLE, spec["luz"].get("ang")), (Resource.GLOBAL_ALTITUDE, spec["luz"].get("alt"))):
                if v is None:
                    continue
                if rid in res:
                    r_ = res[rid]
                    r_.data = type(r_.data)(int(round(float(v))))
                else:
                    import psd_tools.psd.image_resources as ir
                    from psd_tools.psd.base import IntegerElement
                    res[rid] = ir.ImageResource(key=rid.value, name="", data=IntegerElement(int(round(float(v)))))
        except Exception as e:
            avisos.append(f"luz global não salva ({e})")
    if spec.get("guias") is not None and (spec.get("guias_mudou") or not ida):
        try:
            _gravar_guias(psd, spec["guias"])
        except Exception as e:
            avisos.append(f"guias não salvas ({e})")
    if spec.get("fatias") is not None and (spec.get("fatias_mudou") or not ida):
        try:
            _gravar_fatias(psd, spec["fatias"], W, H, os.path.splitext(os.path.basename(destino))[0])
        except Exception as e:
            avisos.append(f"fatias não salvas ({e})")
    # miniatura antiga sairia errada: o Photoshop refaz
    try:
        from psd_tools.constants import Resource
        for rid in (Resource.THUMBNAIL_RESOURCE, Resource.THUMBNAIL_RESOURCE_PS4):
            if rid in psd.image_resources:
                del psd.image_resources[rid]
    except Exception:
        pass

    _incorporados_v7(psd)
    tmp = destino + ".salvando"
    try:
        with open(tmp, "wb") as f:
            psd._record.write(f)
        # CONFERE O ARQUIVO GRAVADO antes de trocar o do usuário (2026-10-06: um PSD voltou com pixels de uma camada
        # em outra): relê e compara cada camada com o que foi montado (nome, caixa). Não bateu → o original fica intacto
        # e o editor grava tudo de novo do zero.
        try:
            lidas = _todas(PSDImage.open(tmp))
            montadas = _todas(psd)
            ruins = []
            if len(lidas) != len(montadas):
                ruins.append(f"{len(lidas)} camadas lidas × {len(montadas)} montadas")
            else:
                for lida, mont in zip(lidas, montadas):
                    if lida.name != mont.name or (not mont.is_group() and tuple(lida.bbox) != tuple(mont.bbox)):
                        ruins.append(f"{mont.name}: lida {lida.name} {tuple(lida.bbox)} × montada {tuple(mont.bbox)}")
        except Exception as e:
            ruins = [f"não consegui reler ({e})"]
        if ruins:
            os.remove(tmp)
            logging.warning("PSD conferido com erro, original preservado: %s", ruins[:5])
            if ida:
                return {"success": False, "refaz": True, "error": f"o PSD gravado não conferiu ({ruins[0]}); gravando tudo de novo"}
            return {"success": False, "error": f"o PSD gravado não conferiu ({ruins[0]}); o arquivo original não foi alterado"}
        os.replace(tmp, destino)
    except Exception as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return {"success": False, "error": f"não consegui gravar: {e}"}

    # o arquivo salvo vira a origem: referências novas — conferidas RELENDO o arquivo gravado (a ordem em memória e a
    # do arquivo podem divergir); não batendo, nenhuma volta e o próximo salvamento grava tudo
    novas = _todas(psd)
    pos = {id(l): i for i, l in enumerate(novas)}
    refs = {str(no.get("uid")): pos.get(id(ob)) for no, ob in ordem if no.get("uid") is not None}
    try:
        lidas = _todas(PSDImage.open(destino))
        nome_em = {str(no.get("uid")): ob.name for no, ob in ordem if no.get("uid") is not None}
        if len(lidas) != len(novas) or any(i is None or i >= len(lidas) or lidas[i].name != nome_em.get(u) for u, i in refs.items()):
            refs = None
            avisos.append("referências do PSD não conferiram depois de gravar: o próximo salvamento grava todas as camadas")
    except Exception as e:
        refs = None
        avisos.append(f"não consegui conferir o PSD gravado ({e}): o próximo salvamento grava todas as camadas")
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
    erro = _gravar_imagem(im, spec["destino"], int(spec.get("qualidade", 92)), float(spec.get("dpi") or 72))
    if erro:
        return {"success": False, "error": erro}
    return {"success": True, "path": spec["destino"]}


def _gravar_imagem(im, destino, q, dpi):
    """PNG/JPG/WEBP/TIFF pela extensão; devolve o erro ou None."""
    fmt = os.path.splitext(destino)[1].lower()
    try:
        os.makedirs(os.path.dirname(destino) or ".", exist_ok=True)   # pasta nova (ex.: <projeto>.camadas da ponte)
        if fmt in (".jpg", ".jpeg"):
            fundo = Image.new("RGB", im.size, (255, 255, 255))
            fundo.paste(im, mask=im.split()[3])
            fundo.save(destino, "JPEG", quality=q, subsampling=0 if q >= 90 else 2, dpi=(dpi, dpi))
        elif fmt == ".webp":
            im.save(destino, "WEBP", quality=q)
        elif fmt in (".tif", ".tiff"):
            im.save(destino, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi))
        elif fmt == ".pdf":
            im = im.convert("RGBA")
            fundo = Image.new("RGB", im.size, (255, 255, 255))
            fundo.paste(im, mask=im.split()[3])
            fundo.save(destino, "PDF", resolution=dpi)
        elif fmt == ".gif":
            im.save(destino, "GIF")
        else:
            im.save(destino, "PNG", dpi=(dpi, dpi))
    except Exception as e:
        return str(e)
    return None


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


# ─────────────────────────── projeto do editor (.iknv) ───────────────────────────
# Pacote zip: documento.json (a árvore de camadas do editor, com todas as propriedades: texto editável, efeitos,
# máscaras, fatias...) + pixels/<chave>.png (cada canvas uma vez) + previa.png (composição, para miniaturas).
# Se o documento veio de um PSD que não mudou desde então, guarda o vínculo (psd_origem): ao reabrir, "Salvar como
# PSD" continua fazendo a ida e volta (texto e objeto inteligente continuam editáveis no Photoshop).
EXT_IKNV = ".iknv"
FORMATO_IKNV = "iknv"
VERSAO_IKNV = 1


def salvar_iknv(spec):
    """spec = {sessao, destino, documento (JSON), doc (id do documento no Python, opcional)}."""
    import json
    import zipfile
    arquivos = media_server.fechar_envio(spec.get("sessao"))
    destino = spec["destino"]
    if not destino.lower().endswith(EXT_IKNV):
        destino += EXT_IKNV
    try:
        dados = spec["documento"]
        dados = json.loads(dados) if isinstance(dados, str) else dados
        dados.update({"formato": FORMATO_IKNV, "versao": VERSAO_IKNV, "app": "KANIVETE"})
        origem = _DOCS.get(spec.get("doc"))
        dados["psd_origem"] = None
        if origem and origem.get("rgb") and origem["path"].lower().endswith(EXT_PSD) and os.path.isfile(origem["path"]) \
                and os.stat(origem["path"]).st_mtime_ns == origem["mtime"]:
            dados["psd_origem"] = {"path": origem["path"], "mtime": origem["mtime"]}
        tmp = destino + ".salvando"
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as z:
            z.writestr("documento.json", json.dumps(dados, ensure_ascii=False))
            for chave, b in arquivos.items():
                nome = os.path.basename(chave)
                # PNG já é comprimido: guardado sem recomprimir (abre e salva mais rápido)
                z.writestr(zipfile.ZipInfo("pixels/" + nome) if nome != "previa.png" else "previa.png", b,
                           compress_type=zipfile.ZIP_STORED)
        os.replace(tmp, destino)
    except Exception as e:
        try:
            os.remove(destino + ".salvando")
        except OSError:
            pass
        logging.exception("editor de imagem: salvar .iknv")
        return {"success": False, "error": str(e)}
    return {"success": True, "path": destino}


def _abrir_iknv(path, doc):
    import json
    import zipfile
    with zipfile.ZipFile(path) as z:
        dados = json.loads(z.read("documento.json").decode("utf-8"))
        if dados.get("formato") != FORMATO_IKNV:
            return {"success": False, "error": "não é um projeto de imagem do KANIVETE"}
        if int(dados.get("versao", 1)) > VERSAO_IKNV:
            return {"success": False, "error": "projeto criado numa versão mais nova do KANIVETE: atualize o app"}
        urls = {}
        for info in z.infolist():
            if info.filename.startswith("pixels/") and not info.is_dir():
                urls[os.path.basename(info.filename)] = _servir(doc, z.read(info), os.path.basename(info.filename))
    psd = dados.get("psd_origem") or None
    psd_ok = False
    if psd and os.path.isfile(psd.get("path", "")) and os.stat(psd["path"]).st_mtime_ns == psd.get("mtime"):
        # o PSD de origem não mudou: o documento continua ligado a ele (salvar em PSD faz a ida e volta)
        doc.update({"path": psd["path"], "mtime": psd["mtime"], "rgb": True})
        psd_ok = True
    return {"success": True, "iknv": True, "nome": dados.get("nome") or os.path.splitext(os.path.basename(path))[0],
            "w": int(dados["w"]), "h": int(dados["h"]), "dpi": dados.get("dpi", 72), "bits": dados.get("bits", 8),
            "modo": dados.get("modo", "RGB"), "documento": dados, "urls": urls,
            "psd_path": psd["path"] if psd_ok else None, "avisos": []}
