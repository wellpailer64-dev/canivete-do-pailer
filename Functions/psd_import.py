"""
Importar PSD/PSB no editor com as camadas separadas (como o "Composição — manter tamanhos das camadas" do After
Effects). Cada camada vira um PNG com transparência no tamanho dela (inclusive o que passa da borda do documento) e
o JS (frontend/js/editor-psd.js) monta uma Comp no tamanho do documento, uma trilha por camada, na mesma ordem;
grupos viram Comps dentro da Comp.

O que vai para o PNG da camada (o editor não tem esses recursos por camada):
  - a máscara de pixel (multiplica a transparência) e o recorte (camada com "Criar máscara de corte" usa a
    transparência da camada base);
  - os efeitos de camada mais usados, desenhados aqui (a biblioteca psd-tools não desenha): Sobreposição de cor,
    Sombra projetada, Brilho externo e Traçado (por fora). Os outros entram na lista de avisos.
O que vira propriedade do clipe: posição, opacidade, modo de mesclagem, visibilidade (oculta = clipe desativado).
Camada de ajuste: Brilho/Contraste vira camada de ajuste do editor; as outras entram nos avisos.
Texto e objeto inteligente: entram com os pixels que o Photoshop guardou (o texto vem junto, para referência).

Os PNGs ficam em %LOCALAPPDATA%/CaniveteDoPailer/PSD importados/<nome>-<hash>/ (fora do cache que é limpo sozinho);
importar de novo o mesmo arquivo sem mudanças reaproveita a pasta.
"""

import hashlib
import json
import logging
import math
import os
import re
import warnings

import cv2
import numpy as np
from PIL import Image

VERSAO = 4

# modo de mesclagem do Photoshop → o do editor (VE_BM em editor-fx.js); fora da lista = normal + aviso
_BM = {
    "NORMAL": "normal", "PASS_THROUGH": "normal", "DISSOLVE": None,
    "DARKEN": "darken", "MULTIPLY": "multiply", "COLOR_BURN": "colorburn", "LINEAR_BURN": None, "DARKER_COLOR": None,
    "LIGHTEN": "lighten", "SCREEN": "screen", "COLOR_DODGE": "colordodge", "LINEAR_DODGE": "add", "LIGHTER_COLOR": None,
    "OVERLAY": "overlay", "SOFT_LIGHT": "softlight", "HARD_LIGHT": "hardlight", "VIVID_LIGHT": None, "LINEAR_LIGHT": None,
    "PIN_LIGHT": None, "HARD_MIX": None, "DIFFERENCE": "difference", "EXCLUSION": "exclusion", "SUBTRACT": None,
    "DIVIDE": None, "HUE": None, "SATURATION": None, "COLOR": None, "LUMINOSITY": None,
}
_AJUSTES = {"brightnesscontrast", "levels", "curves", "exposure", "vibrance", "huesaturation", "colorbalance",
            "blackandwhite", "photofilter", "channelmixer", "colorlookup", "invert", "posterize", "threshold",
            "selectivecolor", "gradientmap"}


def pasta_base():
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, "CaniveteDoPailer", "PSD importados")


def _pasta(path):
    st = os.stat(path)
    h = hashlib.sha1(f"{os.path.abspath(path)}|{st.st_size}|{st.st_mtime_ns}|{VERSAO}".encode("utf-8", "replace")).hexdigest()[:10]
    nome = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", os.path.splitext(os.path.basename(path))[0]).strip(" .")[:40] or "psd"
    return os.path.join(pasta_base(), f"{nome}-{h}")


def _bm(layer):
    nome = str(layer.blend_mode).split(".")[-1]
    return nome, _BM.get(nome, None)


def _desc(d, *chaves, padrao=None):
    """Valor de um descritor do psd-tools (chaves de 4 letras, com ou sem a unidade)."""
    try:
        for k in chaves:
            for cand in (k, k.encode() if isinstance(k, str) else k):
                if cand in d:
                    v = d[cand]
                    return getattr(v, "value", v)
    except Exception:
        pass
    return padrao


def _cor_fx(e):
    """Cor de um efeito (RGB 0..255)."""
    try:
        c = e.color
        r, g, b = (_desc(c, "Rd  "), _desc(c, "Grn "), _desc(c, "Bl  "))
        if r is not None:
            return [float(r), float(g), float(b)]
    except Exception:
        pass
    return [0.0, 0.0, 0.0]


def _num(v, padrao=0.0):
    try:
        return float(getattr(v, "value", v))
    except (TypeError, ValueError):
        return padrao


def _alfa_com_mascara(layer, rgba, x0, y0):
    """Multiplica a transparência pela máscara de pixel da camada (fora do retângulo da máscara vale a cor padrão)."""
    try:
        if not layer.has_mask():
            return rgba
        m = layer.mask
        if getattr(m, "disabled", False):
            return rgba
        h, w = rgba.shape[:2]
        fundo = 255 if int(getattr(m, "background_color", 0) or 0) else 0
        alfa_m = np.full((h, w), fundo, np.uint8)
        im = m.topil()
        if im is not None:
            mm = np.asarray(im.convert("L"))
            ml, mt = m.left - x0, m.top - y0
            ax0, ay0 = max(0, ml), max(0, mt)
            ax1, ay1 = min(w, ml + mm.shape[1]), min(h, mt + mm.shape[0])
            if ax1 > ax0 and ay1 > ay0:
                alfa_m[ay0:ay1, ax0:ax1] = mm[ay0 - mt:ay1 - mt, ax0 - ml:ax1 - ml]
        out = rgba.copy()
        out[:, :, 3] = (out[:, :, 3].astype(np.uint16) * alfa_m // 255).astype(np.uint8)
        return out
    except Exception:
        return rgba


def _pixels(layer):
    """(RGBA uint8, x0, y0) da camada sozinha, sem opacidade nem mesclagem (essas viram propriedades do clipe)."""
    im = None
    try:
        im = layer.topil()
    except Exception:
        im = None
    x0, y0 = layer.left, layer.top
    if im is None or im.size[0] == 0:
        # preenchimento (cor sólida, degradê, padrão) e forma sem pixels guardados: desenhada pela biblioteca
        try:
            im = layer.composite(force=True)
            x0, y0 = layer.left, layer.top
        except Exception:
            im = None
    if im is None:
        return None, x0, y0
    rgba = np.asarray(im.convert("RGBA")).copy()
    return rgba, x0, y0


def _pad(rgba, x0, y0, m):
    if m <= 0:
        return rgba, x0, y0
    return cv2.copyMakeBorder(rgba, m, m, m, m, cv2.BORDER_CONSTANT, value=(0, 0, 0, 0)), x0 - m, y0 - m


def _sobre(cima, baixo):
    """Composição "normal" de dois RGBA do mesmo tamanho (cima por cima de baixo)."""
    a1 = cima[:, :, 3:4].astype(np.float32) / 255
    a2 = baixo[:, :, 3:4].astype(np.float32) / 255
    a = a1 + a2 * (1 - a1)
    rgb = (cima[:, :, :3] * a1 + baixo[:, :, :3] * a2 * (1 - a1)) / np.maximum(a, 1e-6)
    return np.dstack([np.clip(rgb + 0.5, 0, 255), np.clip(a * 255 + 0.5, 0, 255)]).astype(np.uint8)


def _sombra_brilho(alfa, tamanho, espalhar):
    """Transparência da sombra/brilho: expande (espalhar %) e desfoca (tamanho px), como o Photoshop (aproximado)."""
    a = alfa.astype(np.float32) / 255
    raio = max(0.0, tamanho)
    nucleo = int(round(raio * espalhar / 100))
    if nucleo > 0:
        a = cv2.dilate(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * nucleo + 1, 2 * nucleo + 1)))
    resto = raio - nucleo
    if resto > 0.5:
        a = cv2.GaussianBlur(a, (0, 0), sigmaX=resto / 2.0)
    return np.clip(a, 0, 1)


def _efeitos(layer, rgba, x0, y0, avisos, angulo_global, pular=()):
    """Desenha os efeitos de camada suportados no próprio PNG (aumentando a margem quando precisa).
    pular = efeitos que o editor faz sozinho (Sombra projetada vira o efeito do editor, editável)."""
    try:
        if not layer.has_effects() or not layer.effects.enabled:
            return rgba, x0, y0
        lista = [e for e in layer.effects if getattr(e, "enabled", True) and type(e).__name__ not in pular]
    except Exception:
        return rgba, x0, y0
    nomes = [type(e).__name__ for e in lista]
    margem = 0
    for e in lista:
        n = type(e).__name__
        if n in ("DropShadow", "OuterGlow"):
            margem = max(margem, int(math.ceil(_num(getattr(e, "size", 0)) + (_num(getattr(e, "distance", 0)) if n == "DropShadow" else 0))) + 4)
        elif n == "Stroke":
            margem = max(margem, int(math.ceil(_num(getattr(e, "size", 0)))) + 2)
    rgba, x0, y0 = _pad(rgba, x0, y0, margem)
    base = rgba.copy()
    alfa = base[:, :, 3]
    atras = []   # o que vai por baixo da camada (sombra, brilho, traçado por fora)
    for e in lista:
        n = type(e).__name__
        op = _num(getattr(e, "opacity", 100), 100) / 100
        if n == "ColorOverlay":
            cor = np.array(_cor_fx(e), np.float32)
            rgb = base[:, :, :3].astype(np.float32)
            base[:, :, :3] = np.clip(rgb * (1 - op) + cor * op + 0.5, 0, 255).astype(np.uint8)
        elif n == "DropShadow":
            ang = angulo_global if getattr(e, "use_global_light", False) else _num(getattr(e, "angle", 120), 120)
            d = _num(getattr(e, "distance", 0))
            dx, dy = -d * math.cos(math.radians(ang)), d * math.sin(math.radians(ang))
            a = _sombra_brilho(alfa, _num(getattr(e, "size", 0)), _num(getattr(e, "choke", getattr(e, "spread", 0))))
            a = cv2.warpAffine(a, np.float32([[1, 0, dx], [0, 1, dy]]), (a.shape[1], a.shape[0]))
            atras.append((a * op, _cor_fx(e)))
        elif n == "OuterGlow":
            a = _sombra_brilho(alfa, _num(getattr(e, "size", 0)), _num(getattr(e, "choke", getattr(e, "spread", 0))))
            atras.append((a * op, _cor_fx(e)))
        elif n == "Stroke":
            px = int(round(_num(getattr(e, "size", 0))))
            if px > 0:
                k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
                a = cv2.dilate(alfa, k).astype(np.float32) / 255
                atras.append((a * op, _cor_fx(e)))
        else:
            avisos.append(f"{layer.name}: efeito {n} não desenhado")
    for a, cor in atras[::-1]:
        camada = np.zeros_like(base)
        camada[:, :, :3] = np.array(cor, np.float32).astype(np.uint8)
        camada[:, :, 3] = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
        base = _sobre(base, camada)
    if nomes:
        logging.debug("efeitos %s: %s", layer.name, nomes)
    return base, x0, y0


def _recortar(rgba):
    """Tira a margem totalmente transparente (efeitos podem ter aumentado demais). Devolve (rgba, dx, dy)."""
    a = rgba[:, :, 3]
    ys, xs = np.nonzero(a)
    if not len(xs):
        return None, 0, 0
    x1, x2, y1, y2 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return rgba[y1:y2, x1:x2], int(x1), int(y1)


def _clip_base(rgba, x0, y0, base):
    """Recorte: a camada só aparece onde a camada base (abaixo) tem pixel."""
    if base is None:
        return rgba
    b, bx, by = base
    h, w = rgba.shape[:2]
    m = np.zeros((h, w), np.uint8)
    ox, oy = bx - x0, by - y0
    ax0, ay0, ax1, ay1 = max(0, ox), max(0, oy), min(w, ox + b.shape[1]), min(h, oy + b.shape[0])
    if ax1 > ax0 and ay1 > ay0:
        m[ay0:ay1, ax0:ax1] = b[ay0 - oy:ay1 - oy, ax0 - ox:ax1 - ox, 3]
    out = rgba.copy()
    out[:, :, 3] = (out[:, :, 3].astype(np.uint16) * m // 255).astype(np.uint8)
    return out


def _str(v):
    """Texto de um valor do EngineData (o psd-tools devolve com aspas)."""
    v = getattr(v, "value", v)
    return str(v).strip().strip("'\"")


def _vb(v):
    return bool(getattr(v, "value", v))


def _params_efeitos(layer, angulo_global):
    """Efeitos de camada que o editor tem equivalente: {sombra, contorno, sobreposicao, brilho} (px do documento)."""
    out = {}
    try:
        if not layer.has_effects() or not layer.effects.enabled:
            return out
        lista = [e for e in layer.effects if getattr(e, "enabled", True)]
    except Exception:
        return out
    hexa = lambda c: "#%02x%02x%02x" % tuple(max(0, min(255, int(round(x)))) for x in c)
    for e in lista:
        n = type(e).__name__
        op = _num(getattr(e, "opacity", 100), 100)
        if n == "DropShadow" and "sombra" not in out:
            ang = angulo_global if getattr(e, "use_global_light", False) else _num(getattr(e, "angle", 120), 120)
            out["sombra"] = {"cor": hexa(_cor_fx(e)), "op": op, "ang": ang, "dist": _num(getattr(e, "distance", 0)),
                             "tam": _num(getattr(e, "size", 0))}
        elif n == "OuterGlow" and "brilho" not in out:
            out["brilho"] = {"cor": hexa(_cor_fx(e)), "op": op, "tam": _num(getattr(e, "size", 0))}
        elif n == "Stroke" and "contorno" not in out:
            out["contorno"] = {"cor": hexa(_cor_fx(e)), "op": op, "larg": _num(getattr(e, "size", 0)),
                               "pos": str(getattr(e, "position", "")).lower()}
        elif n == "ColorOverlay" and "sobreposicao" not in out:
            out["sobreposicao"] = {"cor": hexa(_cor_fx(e)), "op": op}
        else:
            out.setdefault("outros", []).append(n)
    return out


def _texto(layer, angulo_global):
    """Tudo o que o editor precisa para refazer a camada de texto como texto editável (editor-psd.js)."""
    try:
        ed, rd = layer.engine_dict, layer.resource_dict
        fontes = [_str(f["Name"]) for f in rd["FontSet"]]
        base = {}
        try:
            base = dict(rd["StyleSheetSet"][0]["StyleSheetData"])
        except Exception:
            pass
        texto = str(layer.text).replace(chr(13), chr(10)).replace(chr(3), chr(10))
        runs, pos = [], 0
        lens = list(ed["StyleRun"]["RunLengthArray"])
        for r, n in zip(ed["StyleRun"]["RunArray"], lens):
            d = dict(base)
            d.update(dict(r["StyleSheet"]["StyleSheetData"]))
            trecho = texto[pos:pos + int(n)]
            pos += int(n)
            if not trecho.strip():
                # trecho só de espaço/quebra (o fim do texto costuma ter estilo à parte): vai junto do anterior
                if runs:
                    runs[-1]["trecho"] += trecho
                else:
                    sobra_ini = trecho
                continue
            cor = [float(v) for v in list(d.get("FillColor", {}).get("Values", [1, 0, 0, 0]))]
            if not runs and "sobra_ini" in locals():
                trecho = sobra_ini + trecho
            runs.append({
                "trecho": trecho,
                "fonte": fontes[int(d.get("Font", 0))] if fontes else "",
                "tam": float(d.get("FontSize", 12)),
                "cor": "#%02x%02x%02x" % tuple(max(0, min(255, int(round(x * 255)))) for x in cor[1:4]),
                "esp": float(d.get("Tracking", 0) or 0),
                "auto_ent": _vb(d.get("AutoLeading", True)),
                "ent": float(d.get("Leading", 0) or 0),
                "neg": _vb(d.get("FauxBold", False)), "ita": _vb(d.get("FauxItalic", False)),
                "caixa_alta": int(d.get("FontCaps", 0) or 0) == 2,
            })
        if not runs:
            return None
        chave = lambda r: (r["fonte"], round(r["tam"], 2), r["cor"], r["esp"], r["neg"], r["ita"], r["caixa_alta"])
        par = dict(ed["ParagraphRun"]["RunArray"][0]["ParagraphSheet"]["Properties"])
        just = int(par.get("Justification", 0) or 0)
        caixa = None
        try:
            forma = ed["Rendered"]["Shapes"]["Children"][0]
            if int(forma["ShapeType"]) == 1:
                bb = [float(v) for v in forma["Cookie"]["Photoshop"]["BoxBounds"]]
                caixa = bb
        except Exception:
            pass
        xx, xy, yx, yy, tx, ty = (float(v) for v in layer.transform)
        return {
            "texto": texto.rstrip(chr(10)), "runs": runs, "misto": len({chave(r) for r in runs}) > 1,
            "alin": {1: "right", 2: "center"}.get(just, "left"), "caixa": caixa,
            "tf": [xx, xy, yx, yy, tx, ty], "tinta": [int(v) for v in layer.bbox],
            "efeitos": _params_efeitos(layer, angulo_global),
        }
    except Exception as e:
        logging.debug("texto %s: %s", layer.name, e)
        return None


def _ajuste_bc(layer):
    try:
        br = _num(getattr(layer, "brightness", 0))
        ct = _num(getattr(layer, "contrast", 0))
        return {"t": "bc", "v": {"br": max(-100, min(100, br / 150 * 60)), "ct": max(-100, min(100, ct))}}
    except Exception:
        return None


def importar(path, on_progress=None):
    """Lê o PSD/PSB e grava um PNG por camada. Devolve {success, nome, w, h, camadas: [nó], avisos, achatado}.
    nó = {nome, tipo, visivel, op (0..100), bm, x, y, w, h, png} | grupo {..., filhos: [nó]} | ajuste {..., ajuste}.
    Ordem das listas: de baixo para cima (a primeira fica na trilha de baixo)."""
    warnings.filterwarnings("ignore")
    logging.getLogger("psd_tools").setLevel(logging.ERROR)
    try:
        from psd_tools import PSDImage
    except ImportError:
        return {"success": False, "error": "leitor de PSD (psd-tools) não instalado"}
    if not os.path.isfile(path):
        return {"success": False, "error": "arquivo não encontrado"}
    pasta = _pasta(path)
    pronto = os.path.join(pasta, "camadas.json")
    if os.path.isfile(pronto):
        try:
            with open(pronto, encoding="utf-8") as f:
                r = json.load(f)
            if all(os.path.isfile(p) for p in _pngs(r["camadas"])):
                return r
        except Exception:
            pass
    os.makedirs(pasta, exist_ok=True)
    try:
        psd = PSDImage.open(path)
    except Exception as e:
        return {"success": False, "error": f"não consegui ler o arquivo: {e}"}
    avisos = []
    if str(psd.color_mode).split(".")[-1] not in ("RGB", "3"):
        avisos.append(f"documento em {str(psd.color_mode).split('.')[-1]}: as cores foram convertidas para RGB")
    try:
        angulo = float(psd.image_resources.get_data(1037) or 120)   # luz global
    except Exception:
        angulo = 120.0
    total = max(1, sum(1 for _ in psd.descendants()))
    feitos = [0]
    nomes_usados = set()

    def arquivo(nome):
        base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", nome).strip(" .")[:50] or "camada"
        n, k = base, 2
        while n.lower() in nomes_usados:
            n, k = f"{base} {k}", k + 1
        nomes_usados.add(n.lower())
        return os.path.join(pasta, n + ".png")

    def nivel(grupo):
        out, base_clip = [], None
        for layer in grupo:   # psd-tools percorre de baixo para cima
            feitos[0] += 1
            if on_progress:
                on_progress(min(99, int(feitos[0] * 100 / total)), layer.name)
            nome_bm, bm = _bm(layer)
            if bm is None:
                avisos.append(f"{layer.name}: modo de mesclagem {nome_bm} não existe no editor (ficou Normal)")
                bm = "normal"
            no = {"nome": layer.name, "tipo": layer.kind, "visivel": bool(layer.visible),
                  "op": round(layer.opacity / 255 * 100, 2), "bm": bm}
            if layer.is_group():
                no["filhos"] = nivel(layer)
                if no["filhos"]:
                    out.append(no)
                base_clip = None
                continue
            if layer.kind in _AJUSTES:
                if layer.kind == "brightnesscontrast" and _ajuste_bc(layer):
                    no["ajuste"] = _ajuste_bc(layer)
                    out.append(no)
                else:
                    avisos.append(f"{layer.name}: camada de ajuste ({layer.kind}) não importada")
                continue
            rgba, x0, y0 = _pixels(layer)
            if rgba is None or not rgba[:, :, 3].any():
                continue
            rgba = _alfa_com_mascara(layer, rgba, x0, y0)
            if layer.clipping_layer:
                rgba = _clip_base(rgba, x0, y0, base_clip)
            else:
                base_clip = (rgba, x0, y0)   # base de recorte: sem efeitos (o recorte usa a forma da camada)
            texto = _texto(layer, angulo) if layer.kind == "type" else None
            # texto: o PNG (com todos os efeitos) fica de reserva para quando não der para refazer como texto
            fx = {} if texto else _params_efeitos(layer, angulo)
            pular = ("DropShadow",) if "sombra" in fx else ()
            rgba, x0, y0 = _efeitos(layer, rgba, x0, y0, avisos, angulo, pular)
            rgba, dx, dy = _recortar(rgba)
            if rgba is None:
                continue
            x0, y0 = x0 + dx, y0 + dy
            png = arquivo(layer.name)
            Image.fromarray(rgba, "RGBA").save(png, compress_level=3)   # cv2.imwrite não grava caminho com acento
            no.update({"x": int(x0), "y": int(y0), "w": int(rgba.shape[1]), "h": int(rgba.shape[0]), "png": png})
            if texto:
                no["texto"] = texto
            if "sombra" in fx:
                no["sombra"] = fx["sombra"]
            out.append(no)
        return out

    camadas = nivel(psd)
    achatado = None
    try:
        im = psd.topil() or psd.composite()
        if im is not None:
            achatado = os.path.join(pasta, "_documento.png")
            im.convert("RGBA").save(achatado)
    except Exception:
        achatado = None
    r = {"success": True, "nome": os.path.splitext(os.path.basename(path))[0], "w": int(psd.width), "h": int(psd.height),
         "camadas": camadas, "avisos": sorted(set(avisos)), "achatado": achatado, "pasta": pasta}
    with open(pronto, "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False)
    return r


def _pngs(nos):
    for n in nos:
        if n.get("png"):
            yield n["png"]
        yield from _pngs(n.get("filhos") or [])
