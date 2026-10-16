"""slider_pptx.py — o que o python-pptx não faz no PowerPoint do Slider Kanivete: TRANSIÇÕES, ANIMAÇÕES de entrada e
VÍDEO tocando sozinho/repetindo/mudo (XML <p:transition> e <p:timing> como o PowerPoint grava), e a volta (ler esses
mesmos nós de um PPTX para o documento do Slider). Usado por Functions/slider_kanivete.py (pptx_nativo, importar_pptx).

Animação no PowerPoint = "comportamentos" (set visibility, animEffect fade/wipe, anim ppt_x/ppt_y/ppt_w/ppt_h,
style.rotation) agrupados em <p:par> dentro da sequência principal (mainSeq). O presetID só dá o NOME no painel
Animação do PowerPoint; quem desenha são os comportamentos. Guia: Instructions/slider-kanivete.md › PowerPoint.
"""
import re
from lxml import etree

NS = {"p": "http://schemas.openxmlformats.org/presentationml/2006/main",
      "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
      "p14": "http://schemas.microsoft.com/office/powerpoint/2010/main"}
_DECL = " ".join(f'xmlns:{k}="{v}"' for k, v in NS.items())
P = "{%s}" % NS["p"]

# ───────────── transições ─────────────
TRANS = {"esmaecer": "<p:fade/>", "deslizar": '<p:cover dir="l"/>', "empurrar": '<p:push dir="l"/>', "subir": '<p:push dir="u"/>',
         "zoom": "<p:zoom/>", "cobrir": '<p:wipe dir="l"/>', "revelar": "<p:circle/>", "preto": '<p:fade thruBlk="1"/>'}


def _xml(s):
    return etree.fromstring(f'<raiz {_DECL}>{s}</raiz>')[0]


def transicao(sld, tr):
    """<p:transition> com a duração em ms (p14:dur, PowerPoint 2010+) e a velocidade antiga como reserva."""
    tipo = (tr or {}).get("tipo")
    if tipo not in TRANS:
        return False
    ms = int(round(float(tr.get("dur") or 0.5) * 1000))
    spd = "fast" if ms <= 500 else "med" if ms <= 1000 else "slow"
    el = _xml(f'<mc:AlternateContent><mc:Choice Requires="p14"><p:transition spd="{spd}" p14:dur="{ms}">{TRANS[tipo]}</p:transition></mc:Choice>'
              f'<mc:Fallback><p:transition spd="{spd}">{TRANS[tipo]}</p:transition></mc:Fallback></mc:AlternateContent>')
    _inserir_depois(sld, el, ("cSld", "clrMapOvr"))
    return True


def _inserir_depois(sld, el, nomes):
    """filhos do <p:sld> têm ordem fixa: cSld, clrMapOvr, transition, timing, extLst"""
    ult = None
    for f in sld:
        if etree.QName(f).localname in nomes or (etree.QName(f).localname == "AlternateContent" and "transition" in etree.tostring(f).decode()):
            ult = f
    if ult is None:
        sld.insert(0, el)
    else:
        ult.addnext(el)


# ───────────── animações de entrada ─────────────
# tipo do Slider → (presetID, subtipo, comportamentos). Deslocamentos em fração do slide (80 px / 1920 ≈ .042).
EFEITOS = {
    "esmaecer": (10, 0, [("fade",)]),
    "subir": (42, 0, [("fade",), ("mover", 0, .074)]),
    "descer": (47, 0, [("fade",), ("mover", 0, -.074)]),
    "esquerda": (42, 0, [("fade",), ("mover", -.083, 0)]),
    "direita": (42, 0, [("fade",), ("mover", .083, 0)]),
    "zoom": (53, 16, [("fade",), ("escala", .6)]),
    "pular": (53, 16, [("fade",), ("escala", .3)]),
    "girar": (31, 0, [("fade",), ("escala", .7), ("giro", -25)]),
    "crescer": (22, 4, [("wipe", "up")]),
    "revelar": (22, 8, [("wipe", "right")]),
}


class _Ids:
    def __init__(self):
        self.n = 2

    def __call__(self):
        self.n += 1
        return self.n


def _bhvr(ids, spid, ms, extra=""):
    return f'<p:cBhvr{extra}><p:cTn id="{ids()}" dur="{ms}" fill="hold"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'


def _anim(ids, spid, ms, attr, de, para, valor="str"):
    v = (lambda x: f'<p:strVal val="{x}"/>') if valor == "str" else (lambda x: f'<p:fltVal val="{x}"/>')
    return (f'<p:anim calcmode="lin" valueType="num">{_bhvr(ids, spid, ms, " additive=\"base\"")}<p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr>'
            f'<p:tavLst><p:tav tm="0"><p:val>{v(de)}</p:val></p:tav><p:tav tm="100000"><p:val>{v(para)}</p:val></p:tav></p:tavLst></p:anim>')


def _efeito(ids, spid, anim, no, atraso_ms):
    tipo = anim.get("tipo")
    preset, sub, comps = EFEITOS.get(tipo, EFEITOS["esmaecer"])
    ms = max(50, int(round(float(anim.get("dur") or .6) * 1000)))
    filhos = [f'<p:set><p:cBhvr><p:cTn id="{ids()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
              f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
              f'<p:to><p:strVal val="visible"/></p:to></p:set>']
    for c in comps:
        if c[0] == "fade":
            filhos.append(f'<p:animEffect transition="in" filter="fade">{_bhvr(ids, spid, ms)}</p:cBhvr></p:animEffect>')
        elif c[0] == "wipe":
            filhos.append(f'<p:animEffect transition="in" filter="wipe({c[1]})">{_bhvr(ids, spid, ms)}</p:cBhvr></p:animEffect>')
        elif c[0] == "mover":
            filhos.append(_anim(ids, spid, ms, "ppt_x", f"#ppt_x{c[1]:+.3f}" if c[1] else "#ppt_x", "#ppt_x"))
            filhos.append(_anim(ids, spid, ms, "ppt_y", f"#ppt_y{c[2]:+.3f}" if c[2] else "#ppt_y", "#ppt_y"))
        elif c[0] == "escala":
            filhos.append(_anim(ids, spid, ms, "ppt_w", f"#ppt_w*{c[1]}", "#ppt_w"))
            filhos.append(_anim(ids, spid, ms, "ppt_h", f"#ppt_h*{c[1]}", "#ppt_h"))
        elif c[0] == "giro":
            filhos.append(_anim(ids, spid, ms, "style.rotation", c[1], 0, "flt"))
    return (f'<p:par><p:cTn id="{ids()}" presetID="{preset}" presetClass="entr" presetSubtype="{sub}" fill="hold" grpId="0" nodeType="{no}">'
            f'<p:stCondLst><p:cond delay="{atraso_ms}"/></p:stCondLst><p:childTnLst>{"".join(filhos)}</p:childTnLst></p:cTn></p:par>')


def _video_play(ids, spid, dur_ms, no):
    return (f'<p:par><p:cTn id="{ids()}" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="{no}">'
            f'<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)">'
            f'{_bhvr(ids, spid, max(1, int(dur_ms)))}</p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>')


def timing(sld, efeitos, videos):
    """efeitos = [(spid, anim)] na ordem das camadas; videos = [(spid, {auto, loop, mudo}, dur_ms)].
    As automáticas (e os vídeos que tocam sozinhos) entram no 1º grupo, ao abrir o slide; cada "esperar o clique" é um grupo."""
    for t in sld.findall(P + "timing"):
        sld.remove(t)
    if not efeitos and not videos:
        return False
    ids = _Ids()
    auto = [(s, a) for s, a in efeitos if not a.get("clique")]
    clique = [(s, a) for s, a in efeitos if a.get("clique")]
    grupos = []
    pecas = [_efeito(ids, s, a, "afterEffect" if k == 0 else "withEffect", int(float(a.get("atraso") or 0) * 1000)) for k, (s, a) in enumerate(auto)]
    pecas += [_video_play(ids, s, d, "afterEffect" if not pecas and k == 0 else "withEffect") for k, (s, o, d) in enumerate(v for v in videos if v[1].get("auto"))]
    if pecas:
        grupos.append(("auto", pecas))
    for s, a in clique:
        grupos.append(("clique", [_efeito(ids, s, a, "clickEffect", int(float(a.get("atraso") or 0) * 1000))]))
    seq = ""
    for tipo, pecas in grupos:
        cond = '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' if tipo == "auto" else '<p:cond delay="indefinite"/>'
        seq += (f'<p:par><p:cTn id="{ids()}" fill="hold"><p:stCondLst>{cond}</p:stCondLst><p:childTnLst>'
                f'<p:par><p:cTn id="{ids()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>{"".join(pecas)}</p:childTnLst></p:cTn></p:par>'
                f'</p:childTnLst></p:cTn></p:par>')
    main = ""
    if seq:
        main = (f'<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>{seq}</p:childTnLst></p:cTn>'
                f'<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
                f'<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>')
    midia = "".join(
        f'<p:video><p:cMediaNode vol="{0 if o.get("mudo") else 80000}"{" mute=\"1\"" if o.get("mudo") else ""}>'
        f'<p:cTn id="{ids()}"{" repeatCount=\"indefinite\"" if o.get("loop") else ""} fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>'
        f'<p:endCondLst><p:cond evt="onStopAudio" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:endCondLst></p:cTn>'
        f'<p:tgtEl><p:spTgt spid="{s}"/></p:tgtEl></p:cMediaNode></p:video>' for s, o, d in videos)
    # ids: o mainSeq usa 2 fixo; os outros vêm do contador (começa em 3)
    bld = "".join(f'<p:bldP spid="{s}" grpId="0"/>' for s, a in efeitos if True) if efeitos else ""
    el = _xml(f'<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>{main}{midia}</p:childTnLst></p:cTn></p:par></p:tnLst>'
              + (f"<p:bldLst>{bld}</p:bldLst>" if bld else "") + "</p:timing>")
    _inserir_depois(sld, el, ("cSld", "clrMapOvr", "transition"))
    return True


# ───────────── volta: PPTX → Slider ─────────────
_TRANS_VOLTA = {"fade": "esmaecer", "cover": "deslizar", "push": "empurrar", "zoom": "zoom", "wipe": "cobrir", "circle": "revelar",
                "dissolve": "esmaecer", "randomBar": "esmaecer", "split": "cobrir", "pull": "deslizar", "wheel": "revelar", "fly": "deslizar"}


def ler_transicao(sld):
    tr = sld.find(".//" + P + "transition")
    if tr is None or not len(tr):
        return None
    filho = etree.QName(tr[0]).localname
    tipo = _TRANS_VOLTA.get(filho, "esmaecer")
    if filho == "fade" and tr[0].get("thruBlk") in ("1", "true"):
        tipo = "preto"
    if filho == "push" and tr[0].get("dir") == "u":
        tipo = "subir"
    ms = tr.get("{%s}dur" % NS["p14"])
    dur = int(ms) / 1000 if ms else {"fast": .5, "med": .75, "slow": 1.0}.get(tr.get("spd", "med"), .75)
    return {"tipo": tipo, "dur": round(dur, 2)}


def ler_animacoes(sld):
    """{spid: anim} das entradas da sequência principal; vídeos {spid: {auto, loop, mudo}}"""
    anims, videos = {}, {}
    for grupo_n, grupo in enumerate(sld.findall(".//" + P + "seq/" + P + "cTn/" + P + "childTnLst/" + P + "par")):
        conds = [c.get("evt") for c in grupo.findall(P + "cTn/" + P + "stCondLst/" + P + "cond")]
        auto_grupo = "onBegin" in conds
        for ef in grupo.iter(P + "cTn"):
            classe = ef.get("presetClass")
            alvo = ef.find(".//" + P + "spTgt")
            if alvo is None or not classe:
                continue
            spid = alvo.get("spid")
            if classe == "mediacall":
                videos.setdefault(spid, {})["auto"] = auto_grupo or ef.get("nodeType") in ("afterEffect", "withEffect")
                continue
            if classe != "entr" or spid in anims:
                continue
            x = etree.tostring(ef).decode()
            if "wipe(up)" in x:
                tipo = "crescer"
            elif "wipe(" in x:
                tipo = "revelar"
            elif "style.rotation" in x:
                tipo = "girar"
            elif "ppt_w" in x:
                tipo = "zoom"
            elif re.search(r'#ppt_y[+]', x) or 'val="1+#ppt_h/2"' in x:
                tipo = "subir"
            elif re.search(r'#ppt_y-', x) or "0-#ppt_h/2" in x:
                tipo = "descer"
            elif re.search(r'#ppt_x-', x) or "0-#ppt_w/2" in x:
                tipo = "esquerda"
            elif re.search(r'#ppt_x[+]', x) or "1+#ppt_w/2" in x:
                tipo = "direita"
            else:
                tipo = "esmaecer"
            durs = [int(t.get("dur")) for t in ef.iter(P + "cTn") if (t.get("dur") or "").isdigit() and int(t.get("dur")) > 1]
            atraso = ef.find(P + "stCondLst/" + P + "cond")
            anims[spid] = {"tipo": tipo, "dur": round((max(durs) if durs else 500) / 1000, 2),
                           "atraso": round(int(atraso.get("delay")) / 1000, 2) if atraso is not None and (atraso.get("delay") or "").isdigit() else 0,
                           "clique": not auto_grupo and ef.get("nodeType") == "clickEffect"}
    for mn in sld.iter(P + "cMediaNode"):
        alvo = mn.find(".//" + P + "spTgt")
        if alvo is None:
            continue
        o = videos.setdefault(alvo.get("spid"), {})
        ctn = mn.find(P + "cTn")
        o["loop"] = ctn is not None and ctn.get("repeatCount") == "indefinite"
        o["mudo"] = mn.get("mute") in ("1", "true") or mn.get("vol") == "0"
    return anims, videos
