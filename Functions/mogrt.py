"""
Importar MOGRT (Motion Graphics Template do Premiere) no Vídeo Kanivete como Comp editável.

O .mogrt é um zip: definition.json (os campos do painel Gráficos essenciais), thumb e o projeto. Feito no After
Effects, o projeto é project.aegraphic = outro zip com um .aep e as mídias ((Footage)/...). O Premiere não lê o .aep:
chama o motor do After por baixo. Aqui o .aep é LIDO (py-aep, MIT) e vira a mesma estrutura das Comps do editor
(frontend/js/editor-mogrt.js monta): uma Comp por composição, uma trilha por camada, na mesma ordem.

O que entra: sólidos (Cor sólida), imagens, texto de ponto (fonte, tamanho, cor, alinhamento, entrelinha), Comps
aninhadas, Posição/Âncora/Escala (inclusive X≠Y)/Rotação/Opacidade fixas e com quadros-chave (a velocidade e a
influência do After viram a Bézier do editor), camada mãe, fosco de trilha (alfa/luma), camada oculta, tempo da
camada e Comp tocada ao contrário (vira uma cópia espelhada no tempo). Os campos do definition.json voltam com o alvo
(Comp, camada, propriedade) para o painel Gráficos essenciais.
O resto (efeitos, máscaras, formas, expressões, animadores de texto, 3D) vai para os avisos.

Arquivos em <raiz_dados>/MOGRT importados/<nome>-<hash>/ (importar de novo sem mudanças reaproveita).
"""

import hashlib
import json
import math
import os
import re
import zipfile

VERSAO = 2

# py-aep devolve os enums do After como int (ou IntEnum)
_FOSCO = {5013: "alfa", 5014: "alfainv", 5015: "luma", 5016: "lumainv"}
_BM = {5212: "normal", 5216: "multiply", 5220: "screen", 5221: "overlay", 5222: "softlight", 5223: "hardlight",
       5214: "darken", 5218: "lighten", 5226: "difference", 5242: "exclusion", 5219: "colordodge", 5215: "colorburn",
       5217: "add"}
_INTERP_LIN, _INTERP_BEZ, _INTERP_HOLD = 6612, 6613, 6614
_ALIN = {7413: "left", 7414: "right", 7415: "center"}
# campos com acento estragado pelo After (o .mogrt grava "Posi��o")
_ACENTO = {"Posi��o": "Posição", "Rota��o": "Rotação", "Op��o": "Opção",
           "Anima��o": "Animação", "T�tulo": "Título", "Fun��o": "Função"}


def pasta_base():
    from Functions.midia import raiz_dados
    return os.path.join(raiz_dados(), "MOGRT importados")


def _pasta(path):
    st = os.stat(path)
    h = hashlib.sha1(f"{os.path.abspath(path)}|{st.st_size}|{st.st_mtime_ns}|{VERSAO}".encode("utf-8", "replace")).hexdigest()[:10]
    nome = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", os.path.splitext(os.path.basename(path))[0]).strip(" .")[:40] or "mogrt"
    return os.path.join(pasta_base(), f"{nome}-{h}")


def _nome(s):
    s = str(s or "")
    for a, b in _ACENTO.items():
        s = s.replace(a, b)
    return s.replace("�", "?")


def _loc(d):
    """{strDB: [{localeString, str}]} → texto (pt_BR, en_US ou o primeiro)."""
    try:
        lst = d["strDB"]
        for loc in ("pt_BR", "en_US"):
            for x in lst:
                if x.get("localeString") == loc:
                    return x.get("str", "")
        return lst[0].get("str", "") if lst else ""
    except (KeyError, TypeError, IndexError):
        return d if isinstance(d, str) else ""


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _hex(rgb):
    r, g, b = [max(0, min(255, round(float(x) * 255))) for x in list(rgb)[:3]]
    return f"#{r:02x}{g:02x}{b:02x}"


def _r(v, n=4):
    return round(float(v), n)


def _bez(k0, k1, d0, d1, dim=0):
    """Segmento k0→k1 → interpolação do editor: 'lin' | 'hold' | 'bez' com b=[x1,y1,x2,y2].
    Velocidade (unidades/s) e influência (%) do After: x1 = inf/100, y1 = vel·x1·D/Δ (Δ = distância andada)."""
    if _int(k0.out_interpolation_type) == _INTERP_HOLD:
        return "hold", None
    dt = k1.time - k0.time
    if _int(k0.out_interpolation_type) == _INTERP_LIN and _int(k1.in_interpolation_type) == _INTERP_LIN:
        return "lin", None
    dv = d1 - d0
    if abs(dv) < 1e-9 or dt <= 0:
        return "lin", None
    try:
        eo, ei = k0.out_temporal_ease[min(dim, len(k0.out_temporal_ease) - 1)], k1.in_temporal_ease[min(dim, len(k1.in_temporal_ease) - 1)]
        so, fo, si, fi = float(eo.speed), float(eo.influence) / 100, float(ei.speed), float(ei.influence) / 100
    except (AttributeError, IndexError, TypeError):
        return "lin", None
    if _int(k0.out_interpolation_type) == _INTERP_LIN:
        so, fo = dv / dt, 1 / 3
    if _int(k1.in_interpolation_type) == _INTERP_LIN:
        si, fi = dv / dt, 1 / 3
    x1, x2 = max(0.0, min(1.0, fo)), max(0.0, min(1.0, 1 - fi))
    y1 = so * fo * dt / abs(dv)
    y2 = 1 - si * fi * dt / abs(dv)
    return "bez", [_r(x1), _r(y1), _r(x2), _r(y2)]


def _quadros(prop, t0, comp_t, avisos, nome, multi=None):
    """Quadros-chave → {chave: [{t, v, i, b?}]}. multi: lista de chaves por dimensão (posição/escala não separadas,
    a distância do caminho decide a curva) ou None (uma dimensão). t0 = início da camada (tempo da fonte = t − t0)."""
    kf = list(prop.keyframes or [])
    if not kf:
        return {}
    if prop.expression and getattr(prop, "expression_enabled", True):
        avisos.append(f"{nome}: expressão em {prop.match_name} não entrou")
    out = {}
    vals = [list(k.value) if isinstance(k.value, (list, tuple)) else [k.value] for k in kf]
    if multi:
        dist = [0.0]
        for a, b in zip(vals, vals[1:]):
            dist.append(dist[-1] + math.dist(a[:len(multi)], b[:len(multi)]))
        for j, ch in enumerate(multi):
            if ch is None:
                continue
            lst = []
            for n, k in enumerate(kf):
                q = {"t": _r(comp_t(k.time) - t0), "v": _r(vals[n][j])}
                if n + 1 < len(kf):
                    i, b = _bez(k, kf[n + 1], dist[n], dist[n + 1])
                    q["i"] = i
                    if b:
                        q["b"] = b
                lst.append(q)
            out[ch] = lst
        return out
    lst = []
    for n, k in enumerate(kf):
        q = {"t": _r(comp_t(k.time) - t0), "v": _r(vals[n][0])}
        if n + 1 < len(kf):
            i, b = _bez(k, kf[n + 1], vals[n][0], vals[n + 1][0])
            q["i"] = i
            if b:
                q["b"] = b
        lst.append(q)
    return {"_": lst}


def _transform(l, t0, comp_t, avisos):
    """Grupo Transformar → (p fixos, k quadros-chave) no formato do editor (escala 100 = sc; X≠Y = sx/sy em fração)."""
    tf = l.transform
    p, k = {}, {}

    def prop(nome):
        try:
            return tf.property(nome)
        except (AttributeError, KeyError, ValueError, IndexError):
            return None
    anc, pos, esc, rot, op = (prop("ADBE Anchor Point"), prop("ADBE Position"), prop("ADBE Scale"), prop("ADBE Rotate Z"),
                              prop("ADBE Opacity"))
    if anc is not None:
        v = list(anc.value)
        p["ax"], p["ay"] = _r(v[0]), _r(v[1])
        if anc.keyframes:
            k.update(_quadros(anc, t0, comp_t, avisos, l.name, ["ax", "ay"]))
    if pos is not None:
        if getattr(pos, "dimensions_separated", False):
            for nm, ch in (("ADBE Position_0", "x"), ("ADBE Position_1", "y")):
                pr = prop(nm)
                if pr is None:
                    continue
                p[ch] = _r(pr.value)
                q = _quadros(pr, t0, comp_t, avisos, l.name)
                if q:
                    k[ch] = q["_"]
        else:
            v = list(pos.value)
            p["x"], p["y"] = _r(v[0]), _r(v[1])
            if pos.keyframes:
                k.update(_quadros(pos, t0, comp_t, avisos, l.name, ["x", "y"]))
    if esc is not None:
        v = list(esc.value)
        if esc.keyframes:
            q = _quadros(esc, t0, comp_t, avisos, l.name, ["sx", "sy"])
            uni = all(a["v"] == b["v"] for a, b in zip(q["sx"], q["sy"]))
            if uni:
                k["sc"] = q["sx"]
            else:
                p["sc"] = 100
                for ch in ("sx", "sy"):
                    k[ch] = [{**a, "v": _r(a["v"] / 100)} for a in q[ch]]
        elif abs(v[0] - v[1]) < 1e-6:
            p["sc"] = _r(v[0])
        else:
            p["sc"], p["sx"], p["sy"] = 100, _r(v[0] / 100), _r(v[1] / 100)
    if rot is not None:
        p["rot"] = _r(rot.value)
        q = _quadros(rot, t0, comp_t, avisos, l.name)
        if q:
            k["rot"] = q["_"]
    if op is not None:
        p["op"] = _r(op.value)
        q = _quadros(op, t0, comp_t, avisos, l.name)
        if q:
            k["op"] = q["_"]
    for pr in (anc, pos, esc, rot, op):
        if pr is not None and pr.expression and getattr(pr, "expression_enabled", True) and not pr.keyframes:
            avisos.append(f"{l.name}: expressão em {pr.match_name} não entrou")
    return p, k


def _texto(l, avisos):
    try:
        d = l.text.source_text.value
    except AttributeError:
        return None
    if l.text.source_text.keyframes:
        avisos.append(f"{l.name}: texto animado (quadros-chave do texto) entrou só com o primeiro")
    if getattr(d, "box_text", False):
        avisos.append(f"{l.name}: texto de caixa entrou como texto de ponto")
    t = str(d.text or "").replace("\x03", "\n").replace("\r\n", "\n").replace("\r", "\n")
    tam = float(d.font_size or 50)
    lead = float(getattr(d, "leading", 0) or 0)
    x = {
        "t": t, "fonte": str(d.font or ""), "tam": _r(tam, 2), "cor": _hex(d.fill_color) if getattr(d, "apply_fill", True) else None,
        "alin": _ALIN.get(_int(d.justification), "left"), "esp": _r(float(getattr(d, "tracking", 0) or 0), 2),
        "ent": _r(lead / tam * 100, 2) if lead > 0 and not getattr(d, "auto_leading", False) else 120,
        "caixaAlta": bool(getattr(d, "all_caps", False)), "negrito": bool(getattr(d, "faux_bold", False)),
        "italico": bool(getattr(d, "faux_italic", False)),
    }
    if getattr(d, "apply_stroke", False):
        try:
            x["contorno"] = {"cor": _hex(d.stroke_color), "larg": _r(float(d.stroke_width), 2)}
        except (AttributeError, TypeError):
            pass
    try:
        if len(l.text.animators or []):
            avisos.append(f"{l.name}: animadores de texto não entraram")
    except (AttributeError, TypeError):
        pass
    return x


def _arquivo(src, pasta_ae):
    """Mídia de rodapé: o caminho gravado é o do PC de quem fez; procura pelo nome dentro do .aegraphic."""
    f = str(getattr(src, "file", "") or "")
    nome = os.path.basename(f.replace("\\", "/"))
    for raiz, _, arqs in os.walk(pasta_ae):
        if nome in arqs:
            return os.path.join(raiz, nome)
    return f if f and os.path.isfile(f) else None


def _camadas(comp, pasta_ae, avisos, comps):
    """Camadas de uma composição (de BAIXO para cima, como as trilhas)."""
    out = []
    fps = float(comp.frame_rate or 30)
    for l in comp.layers:
        tipo, extra = None, {}
        src = getattr(l, "source", None)
        cls = type(l).__name__
        if cls in ("CameraLayer", "LightLayer"):
            avisos.append(f"{comp.name} › {l.name}: câmera/luz do After não entrou")
            continue
        if cls == "ShapeLayer":
            avisos.append(f"{comp.name} › {l.name}: camada de forma não entrou (próxima etapa)")
            continue
        if l.text is not None:
            tipo, extra["texto"] = "texto", _texto(l, avisos)
        elif getattr(l, "null_layer", False):
            tipo = "nulo"
        elif src is not None and type(src).__name__ == "CompItem":
            tipo, extra["comp"] = "comp", src.id
        elif src is not None:
            ms = getattr(src, "main_source", None)
            if type(ms).__name__ == "SolidSource":
                tipo, extra["cor"] = "cor", _hex(ms.color)
            else:
                arq = _arquivo(ms, pasta_ae)
                if not arq:
                    avisos.append(f"{comp.name} › {l.name}: mídia não encontrada no MOGRT")
                    continue
                tipo, extra["arquivo"] = "imagem", arq
            extra["w"], extra["h"] = int(src.width), int(src.height)
        if not tipo:
            avisos.append(f"{comp.name} › {l.name}: tipo de camada não suportado")
            continue
        stretch = float(l.stretch or 100) / 100
        ini, fim = sorted((float(l.in_point), float(l.out_point)))
        start = float(l.start_time)
        if stretch < 0:
            if tipo != "comp":
                avisos.append(f"{comp.name} › {l.name}: camada ao contrário só vale em Comp")
            extra["reverso"] = True
        elif abs(stretch - 1) > 1e-6:
            extra["v"] = _r(1 / stretch)
        # tempo da fonte = (t − start)·velocidade; o editor guarda quadros-chave no tempo da fonte
        comp_t = (lambda t: t)
        p, k = _transform(l, start, comp_t, avisos)
        if abs(stretch - 1) > 1e-6:
            k = {ch: [{**q, "t": _r(q["t"] / stretch)} for q in lst] for ch, lst in k.items()}
        if l.three_d_layer:
            avisos.append(f"{comp.name} › {l.name}: camada 3D entrou plana")
        if len(l.masks or []):
            avisos.append(f"{comp.name} › {l.name}: {len(l.masks)} máscara(s) não entraram (próxima etapa)")
        fx = [getattr(e, "name", None) or e.match_name for e in (l.effects or [])]
        if fx:
            avisos.append(f"{comp.name} › {l.name}: efeitos não entraram: {', '.join(fx)}")
        bm = _BM.get(_int(l.blending_mode))
        if bm is None:
            avisos.append(f"{comp.name} › {l.name}: modo de mesclagem {l.blending_mode} virou Normal")
        cam = {
            "uid": f"ae{comp.id}_{l.id}", "id": l.id, "nome": _nome(l.name), "tipo": tipo, "ini": _r(ini),
            "fim": _r(fim), "start": _r(start), "p": p, "k": k, "off": not l.enabled, "bm": bm or "normal", **extra,
        }
        if l.parent is not None:
            cam["pai"] = f"ae{comp.id}_{l.parent.id}"
        tm = _FOSCO.get(_int(l.track_matte_type))
        if tm and l.track_matte_layer is not None:
            cam["fosco"] = {"uid": f"ae{comp.id}_{l.track_matte_layer.id}", "modo": tm}
        out.append(cam)
    out.reverse()
    return out


def _espelhar(c, nova_id):
    """Cópia da Comp tocada ao contrário (Comp com Esticar −100%): tempo t → D − t em cada camada e quadro-chave."""
    D = c["dur"]
    cams = []
    for cam in c["camadas"]:
        n = json.loads(json.dumps(cam))
        n["ini"], n["fim"] = _r(D - cam["fim"]), _r(D - cam["ini"])
        n["start"] = n["ini"]
        k = {}
        for ch, lst in cam["k"].items():
            # tempo da fonte antigo (relativo ao start) → tempo da Comp → espelhado → relativo ao novo início
            tl = [{**q, "t": _r(D - (q["t"] + cam["start"]) - n["ini"])} for q in lst]
            tl.reverse()
            for j in range(len(tl)):
                tl[j].pop("i", None)
                tl[j].pop("b", None)
                if j + 1 < len(tl):
                    seg = lst[len(lst) - 2 - j]   # o mesmo segmento, ao contrário
                    tl[j]["i"] = seg.get("i", "lin")
                    if seg.get("b"):
                        x1, y1, x2, y2 = seg["b"]
                        tl[j]["b"] = [_r(1 - x2), _r(1 - y2), _r(1 - x1), _r(1 - y1)]
            k[ch] = tl
        n["k"] = k
        cams.append(n)
    return {**c, "id": nova_id, "nome": c["nome"] + " (volta)", "camadas": cams}


def _controles(defin, app_proj, comps_por_id):
    """Campos do painel Gráficos essenciais: {id, nome, tipo, valor, alvo: {comp, uid, prop}}."""
    alvos = {}
    for c in comps_por_id.values():
        for ctl in (getattr(c, "motion_graphics_controllers", None) or []):
            try:
                path = [s.match_name for s in ctl.source_property_path]
                alvos[ctl.uuid] = {"comp": ctl.source_comp_id, "camada": ctl.source_layer_id, "prop": path[-1] if path else None}
            except AttributeError:
                continue
    out = []
    props = {"ADBE Text Document": "texto", "ADBE Position": "pos", "ADBE Position_0": "x", "ADBE Position_1": "y",
             "ADBE Scale": "esc", "ADBE Opacity": "op", "ADBE Rotate Z": "rot", "ADBE Anchor Point": "anc"}
    tipos = {1: "caixa", 2: "numero", 4: "cor", 5: "ponto", 6: "texto", 9: "multi", 13: "lista", 10: "grupo", 8: "nota"}
    for cc in defin.get("clientControls", []):
        a = alvos.get(cc.get("id")) or {}
        alvo = None
        if a.get("comp") is not None and a.get("camada") is not None:
            alvo = {"comp": a["comp"], "uid": f"ae{a['comp']}_{a['camada']}", "prop": props.get(a.get("prop"), a.get("prop"))}
        v = cc.get("value")
        if isinstance(v, dict) and "strDB" in v:
            v = _loc(v).replace("\x03", "\n").replace("\r", "\n")
        item = {"id": cc.get("id"), "nome": _nome(_loc(cc.get("uiName", {}))), "tipo": tipos.get(cc.get("type"), str(cc.get("type"))),
                "valor": v, "alvo": alvo}
        for ch in ("min", "max"):
            if ch in cc:
                item[ch] = cc[ch]
        fe = cc.get("fonteditinfo")
        if fe:
            item["fonte"] = {"fonte": fe.get("fontEditValue"), "tam": fe.get("fontSizeEditValue")}
        out.append(item)
    return out


def importar(path):
    """Lê o .mogrt. Devolve {success, nome, w, h, fps, dur, raiz, comps: [{id, nome, w, h, fps, dur, camadas}],
    controles, avisos, thumb}. Camadas de baixo para cima; quadros-chave no tempo da fonte (t − início da camada)."""
    if not os.path.isfile(path):
        return {"success": False, "error": "arquivo não encontrado"}
    try:
        import py_aep
    except ImportError:
        return {"success": False, "error": "leitor de projeto do After (py-aep) não instalado"}
    pasta = _pasta(path)
    pronto = os.path.join(pasta, "mogrt.json")
    if os.path.isfile(pronto):
        with open(pronto, encoding="utf-8") as f:
            return json.load(f)
    os.makedirs(pasta, exist_ok=True)
    with zipfile.ZipFile(path) as z:
        z.extractall(pasta)
    with open(os.path.join(pasta, "definition.json"), encoding="utf-8", errors="replace") as f:
        defin = json.load(f)
    if defin.get("authorApp") != "aefx" or not os.path.isfile(os.path.join(pasta, "project.aegraphic")):
        return {"success": False, "error": "MOGRT feito no Premiere (.prgraphic): ainda não suportado"}
    pasta_ae = os.path.join(pasta, "ae")
    with zipfile.ZipFile(os.path.join(pasta, "project.aegraphic")) as z:
        z.extractall(pasta_ae)
    aep = next((os.path.join(r, a) for r, _, aa in os.walk(pasta_ae) for a in aa if a.lower().endswith(".aep")), None)
    if not aep:
        return {"success": False, "error": "projeto do After não encontrado dentro do MOGRT"}
    proj = py_aep.parse(aep)
    itens = proj.project.items
    itens = list(itens.values()) if hasattr(itens, "values") else list(itens)
    comps_ae = {c.id: c for c in itens if type(c).__name__ == "CompItem"}
    avisos, comps = [], {}
    for c in comps_ae.values():
        comps[c.id] = {"id": c.id, "nome": _nome(c.name), "w": int(c.width), "h": int(c.height), "fps": _r(c.frame_rate, 3),
                       "dur": _r(c.duration), "camadas": _camadas(c, pasta_ae, avisos, comps_ae)}
    # Comp com controles = a do modelo (a raiz); sem, a que não está dentro de nenhuma outra
    raiz = next((c.id for c in comps_ae.values() if getattr(c, "motion_graphics_template_controller_count", 0)), None)
    if raiz is None:
        dentro = {cam["comp"] for c in comps.values() for cam in c["camadas"] if cam["tipo"] == "comp"}
        raiz = next((i for i in comps if i not in dentro), next(iter(comps)))
    # Comp tocada ao contrário vira uma cópia espelhada; a camada passa a tocar para a frente
    prox = max(comps) + 1
    espelhos = {}
    for c in list(comps.values()):
        for cam in c["camadas"]:
            if not cam.pop("reverso", False) or cam["tipo"] != "comp":
                continue
            o = cam["comp"]
            if o not in espelhos:
                espelhos[o] = prox
                comps[prox] = _espelhar(comps[o], prox)
                prox += 1
            D = comps[o]["dur"]
            cam["comp"] = espelhos[o]
            cam["start"] = _r(cam["start"] - D)   # fonte espelhada: u' = D − u = t − (start − D)
            cam["k"] = {}
    r = {
        "success": True, "nome": _nome(defin.get("capsuleName") or os.path.splitext(os.path.basename(path))[0]),
        "w": comps[raiz]["w"], "h": comps[raiz]["h"], "fps": comps[raiz]["fps"], "dur": comps[raiz]["dur"], "raiz": raiz,
        "comps": list(comps.values()), "controles": _controles(defin, proj, comps_ae), "avisos": avisos,
        "thumb": os.path.join(pasta, "thumb.mp4") if os.path.isfile(os.path.join(pasta, "thumb.mp4")) else None,
        "fontes": sorted({cam["texto"]["fonte"] for c in comps.values() for cam in c["camadas"] if cam.get("texto")}),
    }
    with open(pronto, "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False)
    return r


if __name__ == "__main__":
    import sys
    print(json.dumps(importar(sys.argv[1]), ensure_ascii=False, indent=1)[:int(sys.argv[2]) if len(sys.argv) > 2 else 20000])
