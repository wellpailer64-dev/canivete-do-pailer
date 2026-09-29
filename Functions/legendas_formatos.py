# =========================================================
# Formatos de legenda do Pocket Editor: ler e escrever SRT, VTT, ASS/SSA, SBV (YouTube) e TXT.
# Itens sempre como [{st, en, texto}] (segundos; texto pode ter quebras de linha).
# TXT: cada linha "[hh:mm:ss.mmm --> hh:mm:ss.mmm] texto" (o que o editor exporta) ou "[hh:mm:ss] texto";
# sem tempos, cada parágrafo vira uma legenda em sequência, com a duração pelo tamanho do texto.
# =========================================================
import os
import re

FORMATOS = {
    "srt": "SubRip",
    "vtt": "WebVTT",
    "ass": "Advanced SubStation Alpha",
    "ssa": "SubStation Alpha",
    "sbv": "YouTube SBV",
    "txt": "Texto",
}
EXTENSOES = tuple("." + f for f in FORMATOS)

_TEMPO = r"(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})"


def _seg(h, m, s, ms):
    return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")[:3]) / 1000


def _limpar(txt):
    txt = re.sub(r"<[^>]+>", "", txt)          # tags HTML/VTT (<i>, <c.cor>, <00:00:01.000>)
    return re.sub(r"\{[^}]*\}", "", txt).strip()  # comandos ASS ({\an8}, {\i1})


def _decodificar(path):
    bruto = open(path, "rb").read()
    for enc in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
        try:
            txt = bruto.decode(enc)
            if enc == "utf-16" and not bruto[:2] in (b"\xff\xfe", b"\xfe\xff"):
                continue
            return txt
        except UnicodeDecodeError:
            continue
    return bruto.decode("latin-1", "replace")


def _ler_blocos(txt, sep=r"\s*-->\s*"):
    """SRT e VTT: blocos separados por linha em branco, com uma linha "início --> fim"."""
    itens = []
    for bloco in re.split(r"\r?\n\s*\r?\n", txt.strip()):
        linhas = bloco.strip().splitlines()
        for k, l in enumerate(linhas):
            m = re.match(_TEMPO + sep + _TEMPO, l.strip())
            if m:
                g = m.groups()
                texto = "\n".join(_limpar(x) for x in linhas[k + 1:] if _limpar(x))
                if texto:
                    itens.append({"st": _seg(*g[:4]), "en": _seg(*g[4:]), "texto": texto})
                break
    return itens


def _ler_sbv(txt):
    itens = []
    for bloco in re.split(r"\r?\n\s*\r?\n", txt.strip()):
        linhas = bloco.strip().splitlines()
        if not linhas:
            continue
        m = re.match(_TEMPO + r"\s*,\s*" + _TEMPO, linhas[0].strip())
        if m:
            g = m.groups()
            texto = "\n".join(_limpar(x) for x in linhas[1:] if _limpar(x))
            if texto:
                itens.append({"st": _seg(*g[:4]), "en": _seg(*g[4:]), "texto": texto})
    return itens


def _ler_ass(txt):
    itens, campos = [], None
    for l in txt.splitlines():
        l = l.strip()
        if l.lower().startswith("format:") and campos is None and "start" in l.lower():
            campos = [c.strip().lower() for c in l.split(":", 1)[1].split(",")]
        elif l.lower().startswith("dialogue:"):
            cols = campos or ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"]
            partes = l.split(":", 1)[1].split(",", len(cols) - 1)
            if len(partes) < len(cols):
                continue
            d = dict(zip(cols, partes))
            ini = re.match(r"(\d+):(\d+):(\d+)[.,](\d+)", d.get("start", "").strip())
            fim = re.match(r"(\d+):(\d+):(\d+)[.,](\d+)", d.get("end", "").strip())
            texto = _limpar(d.get("text", "").replace("\\N", "\n").replace("\\n", "\n").replace("\\h", " "))
            if ini and fim and texto:
                # centésimos no ASS: "0:00:01.50" = 1,5 s (_seg completa "50" → 500 ms)
                itens.append({"st": _seg(*ini.groups()), "en": _seg(*fim.groups()), "texto": texto})
    return itens


def _ler_txt(txt):
    itens = []
    for l in txt.splitlines():
        m = re.match(r"\s*\[?" + _TEMPO + r"\s*-->\s*" + _TEMPO + r"\]?\s*(.+)", l)
        if m:
            g = m.groups()
            itens.append({"st": _seg(*g[:4]), "en": _seg(*g[4:8]), "texto": _limpar(g[8])})
            continue
        m = re.match(r"\s*\[?(?:(\d+):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?\]?\s+(.+)", l)
        if m:
            itens.append({"st": _seg(m[1], m[2], m[3], m[4] or "0"), "en": None, "texto": _limpar(m[5])})
    if itens:
        # "[hh:mm:ss] texto": cada uma vai até a próxima (a última, pelo tamanho do texto)
        for i, it in enumerate(itens):
            if it["en"] is None:
                prox = itens[i + 1]["st"] if i + 1 < len(itens) else None
                it["en"] = prox if prox and prox > it["st"] else it["st"] + _dur_leitura(it["texto"])
        return [it for it in itens if it["texto"]]
    # sem tempos: um parágrafo (ou linha) por legenda, em sequência
    pars = [p.strip() for p in re.split(r"\r?\n\s*\r?\n", txt.strip()) if p.strip()]
    if len(pars) <= 1:
        pars = [l.strip() for l in txt.splitlines() if l.strip()]
    t = 0.0
    for p in pars:
        d = _dur_leitura(p)
        itens.append({"st": round(t, 3), "en": round(t + d, 3), "texto": p})
        t += d
    return itens


def _dur_leitura(texto):
    return round(min(7.0, max(1.5, len(texto) / 15)), 3)   # ~15 caracteres por segundo


def ler(path):
    """Arquivo de legenda → {success, itens, nome}."""
    try:
        ext = os.path.splitext(path)[1].lower().lstrip(".")
        txt = _decodificar(path)
        if ext in ("srt", "vtt"):
            itens = _ler_blocos(txt)
        elif ext == "sbv":
            itens = _ler_sbv(txt)
        elif ext in ("ass", "ssa"):
            itens = _ler_ass(txt)
        elif ext == "txt":
            itens = _ler_txt(txt)
        else:
            return {"success": False, "error": "Formato de legenda não suportado."}
        itens = sorted(({"st": round(i["st"], 3), "en": round(max(i["en"], i["st"] + 0.1), 3), "texto": i["texto"]}
                        for i in itens), key=lambda i: i["st"])
        return {"success": True, "itens": itens, "nome": os.path.basename(path)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _tc(t, sep=",", horas=True, casas=3):
    ms = max(0, round(t * 1000))
    h, m, s, r = ms // 3600000, ms // 60000 % 60, ms // 1000 % 60, ms % 1000
    frac = str(r).zfill(3)[:casas]
    return (f"{h:02d}:" if horas else "") + f"{m:02d}:{s:02d}{sep}{frac}"


def escrever(itens, formato):
    """[{st, en, texto}] → texto do arquivo no formato pedido."""
    formato = (formato or "srt").lower()
    itens = [i for i in itens if str(i.get("texto", "")).strip()]
    if formato == "srt":
        return "\n".join(f"{k + 1}\n{_tc(i['st'])} --> {_tc(i['en'])}\n{i['texto'].strip()}\n" for k, i in enumerate(itens))
    if formato == "vtt":
        return "WEBVTT\n\n" + "\n".join(f"{_tc(i['st'], '.')} --> {_tc(i['en'], '.')}\n{i['texto'].strip()}\n" for i in itens)
    if formato == "sbv":
        f = lambda t: _tc(t, ".")[1:] if _tc(t, ".").startswith("0") else _tc(t, ".")
        return "\n".join(f"{f(i['st'])},{f(i['en'])}\n{i['texto'].strip()}\n" for i in itens)
    if formato in ("ass", "ssa"):
        f = lambda t: _tc(t, ".", casas=2)[1:]    # 0:00:01.50
        cab = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n"
               "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
               "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
               "Alignment, MarginL, MarginR, MarginV, Encoding\n"
               "Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,60,60,60,1\n\n"
               "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
        quebra = "\\N"
        return cab + "".join(f"Dialogue: 0,{f(i['st'])},{f(i['en'])},Default,,0,0,0,,{i['texto'].strip().replace(chr(10), quebra)}\n"
                             for i in itens)
    if formato == "txt":
        return "\n".join(f"[{_tc(i['st'], '.')} --> {_tc(i['en'], '.')}] {' '.join(i['texto'].split())}" for i in itens) + "\n"
    raise ValueError("Formato de legenda não suportado: " + formato)
