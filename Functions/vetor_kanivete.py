"""Vetor Kanivete (estilo Illustrator): o lado Python do editor vetorial (frontend/js/vetor-*.js).

Modelo (unidade = pt, 1/72"; y para baixo, como no SVG): ver Instructions/vetor-kanivete.md. Aqui:
- texto → curvas (HarfBuzz + fontTools): a MESMA geometria que a tela desenha e que vai para o PDF (o que se vê = o
  que imprime; no fechamento o texto sai em curvas, sem depender de fonte na gráfica)
- operações booleanas do Pathfinder (skia-pathops); Deslocar caminho e Contornar traço (skia-python)
- cores: CMYK ↔ RGB pelo perfil ICC de saída (prova de cor na tela) e conversão RGB → CMYK
- .aknv = zip com documento.json + imagens/ (salvar/abrir); Empacotar (pasta com .aknv, Links, Fontes, relatório)
- imagens colocadas: tamanho, modo (RGB/CMYK), ppi, prévia RGB servida ao painel
"""
import hashlib, io, json, math, os, re, shutil, tempfile, time, zipfile

PT_MM = 72 / 25.4
PASTA_TMP = os.path.join(tempfile.gettempdir(), "vetor_kanivete")
PERFIS = {   # condição de impressão → arquivos ICC conhecidos (pasta de cores do Windows ou %APPDATA%/CaniveteDoPailer/icc)
    "FOGRA39": (["CoatedFOGRA39.icc", "ISOcoated_v2_eci.icc", "ISOcoated_v2_300_eci.icc"], "Coated FOGRA39 (ISO 12647-2:2004)", "FOGRA39"),
    "FOGRA29": (["UncoatedFOGRA29.icc", "PSO_Uncoated_ISO12647_eci.icc"], "Uncoated FOGRA29 (ISO 12647-2:2004)", "FOGRA29"),
    "GRACOL": (["CoatedGRACoL2006.icc", "GRACoL2006_Coated1v2.icc"], "Coated GRACoL 2006 (ISO 12647-2:2004)", "CGATS TR 006"),
    "SWOP": (["USWebCoatedSWOP.icc", "WebCoatedSWOP2006Grade5.icc"], "U.S. Web Coated (SWOP) v2", "CGATS TR 001"),
}


# ─────────────────────────── perfis ICC ───────────────────────────
def _pastas_icc():
    win = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "System32", "spool", "drivers", "color")
    app = os.path.join(os.environ.get("APPDATA", ""), "CaniveteDoPailer", "icc")
    return [app, win]


def perfil_arquivo(cond="FOGRA39"):
    """→ caminho do ICC CMYK da condição (ou None)."""
    nomes = PERFIS.get(cond, PERFIS["FOGRA39"])[0]
    for d in _pastas_icc():
        for n in nomes:
            p = os.path.join(d, n)
            if os.path.isfile(p):
                return p
    return None


def perfis_disponiveis():
    return {k: {"arquivo": perfil_arquivo(k), "nome": v[1], "id": v[2]} for k, v in PERFIS.items()}


_TRANSF = {}


def _transf(cond, para_rgb=True):
    from PIL import ImageCms
    chave = (cond, para_rgb)
    if chave not in _TRANSF:
        icc = perfil_arquivo(cond)
        if not icc:
            _TRANSF[chave] = None
        else:
            cmyk, srgb = ImageCms.getOpenProfile(icc), ImageCms.createProfile("sRGB")
            # tela: colorimétrico relativo + compensação de ponto preto (como a prova do Illustrator/Photoshop; sem ela o preto fica lavado)
            _TRANSF[chave] = (ImageCms.buildTransform(cmyk, srgb, "CMYK", "RGB", ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                                      flags=ImageCms.Flags.BLACKPOINTCOMPENSATION) if para_rgb
                              else ImageCms.buildTransform(srgb, cmyk, "RGB", "CMYK", ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                                           flags=ImageCms.Flags.BLACKPOINTCOMPENSATION))
    return _TRANSF[chave]


def _cmyk_rgb_ingenuo(c, m, y, k):
    return [round(255 * (1 - min(1, c / 100 + k / 100))), round(255 * (1 - min(1, m / 100 + k / 100))), round(255 * (1 - min(1, y / 100 + k / 100)))]


def cores_tela(lista, cond="FOGRA39"):
    """[[c,m,y,k] 0-100] → [[r,g,b]] como a tela deve mostrar (prova de cor pelo perfil de saída)."""
    from PIL import Image, ImageCms
    if not lista:
        return []
    t = _transf(cond, True)
    if not t:
        return [_cmyk_rgb_ingenuo(*v) for v in lista]
    im = Image.new("CMYK", (len(lista), 1))
    im.putdata([tuple(round(max(0, min(100, x)) * 2.55) for x in v) for v in lista])
    return [list(p) for p in ImageCms.applyTransform(im, t).getdata()]


def rgb_para_cmyk(lista, cond="FOGRA39"):
    """[[r,g,b]] → [[c,m,y,k] 0-100, 1 casa] pelo perfil (preto puro vira 0/0/0/100, como a gráfica espera do texto)."""
    from PIL import Image, ImageCms
    out = []
    t = _transf(cond, False)
    if t:
        im = Image.new("RGB", (len(lista), 1))
        im.putdata([tuple(int(x) for x in v) for v in lista])
        conv = list(ImageCms.applyTransform(im, t).getdata())
    for i, (r, g, b) in enumerate(lista):
        if r == g == b and r < 8:
            out.append([0, 0, 0, 100]); continue
        if r == g == b == 255:
            out.append([0, 0, 0, 0]); continue
        if t:
            out.append([round(x / 2.55, 1) for x in conv[i]])
        else:
            k = 1 - max(r, g, b) / 255
            out.append([0, 0, 0, 100] if k >= 1 else [round((1 - r / 255 - k) / (1 - k) * 100, 1), round((1 - g / 255 - k) / (1 - k) * 100, 1),
                                                       round((1 - b / 255 - k) / (1 - k) * 100, 1), round(k * 100, 1)])
    return out


# ─────────────────────────── texto → curvas ───────────────────────────
_FONTES = {}
_ESTILOS = None
_GEO = {}


def _estilos():
    global _ESTILOS
    if _ESTILOS is None:
        from Functions import fontes
        _ESTILOS = fontes.listar() or {}
    return _ESTILOS


# fontes que vieram embutidas num PDF/AI (subconjunto) e não estão instaladas: {fam minúscula: [{fam, estilo, ps, arquivo}]}
_DOC_FONTES = {}


def registrar_fontes(lista):
    """Fontes do documento (doc.fontes = [{fam, estilo, ps, arquivo}]): usadas quando a família não está instalada."""
    novas = 0
    for f in lista or []:
        if not (f.get("arquivo") and os.path.isfile(f["arquivo"])):
            continue
        l = _DOC_FONTES.setdefault(str(f["fam"]).lower(), [])
        if not any(x["estilo"].lower() == str(f["estilo"]).lower() for x in l):
            l.append(dict(f)); novas += 1
    if novas:
        _GEO.clear()
    return novas


def _fonte_doc(fam, estilo):
    l = _DOC_FONTES.get(str(fam).lower())
    if not l:   # nome PostScript
        alvo = str(fam).replace(" ", "").lower()
        l = [x for v in _DOC_FONTES.values() for x in v if (x.get("ps") or "").replace(" ", "").lower() == alvo]
    if not l:
        return None
    return next((x for x in l if x["estilo"].lower() == str(estilo).lower()), l[0])


def fonte_arquivo(fam, estilo="Regular"):
    """→ (arquivo, indice, achou) — família/estilo instalados; senão a embutida do documento (achou="embutida");
    senão Arial (achou=False: o fechamento avisa)."""
    r = _fonte_instalada(fam, estilo)
    if not r[2]:
        e = _fonte_doc(fam, estilo)
        if e:
            return e["arquivo"], 0, "embutida"
    return r


def _fonte_instalada(fam, estilo="Regular"):
    est = _estilos()
    lista = est.get(fam) or next((v for k, v in est.items() if k.lower() == str(fam).lower()), None)
    if not lista:   # nome PostScript (vem do PDF/AI: "Montserrat-Bold")
        alvo = str(fam).replace(" ", "").lower()
        for v in est.values():
            for e in v:
                if (e.get("ps") or "").replace(" ", "").lower() == alvo:
                    return e["arquivo"], e.get("indice", 0), True
    if not lista:   # "Arial Bold": família + estilo juntos
        partes = str(fam).split()
        for i in range(len(partes) - 1, 0, -1):
            base = next((k for k in est if k.lower() == " ".join(partes[:i]).lower()), None)
            if base:
                lista, estilo = est[base], " ".join(partes[i:]); break
    if lista:
        e = next((e for e in lista if e["estilo"].lower() == str(estilo).lower()), None) or next((e for e in lista if e["peso"] == 400 and not e["italico"]), lista[0])
        return e["arquivo"], e.get("indice", 0), True
    return os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arial.ttf"), 0, False


def _fonte(arq, ind):
    if (arq, ind) not in _FONTES:
        import uharfbuzz as hb
        from fontTools.ttLib import TTFont
        dados = open(arq, "rb").read()
        tt = TTFont(io.BytesIO(dados), fontNumber=ind, lazy=True)
        face = hb.Face(hb.Blob(dados), ind)
        font = hb.Font(face)
        upem = face.upem
        font.scale = (upem, upem)
        hhea, os2 = tt["hhea"], tt.get("OS/2")
        asc = (os2.sTypoAscender if os2 is not None and os2.sTypoAscender else hhea.ascent)
        desc = (os2.sTypoDescender if os2 is not None and os2.sTypoDescender else hhea.descent)
        cap = getattr(os2, "sCapHeight", 0) if os2 is not None else 0
        _FONTES[(arq, ind)] = {"tt": tt, "hb": font, "upem": upem, "gs": tt.getGlyphSet(), "ordem": tt.getGlyphOrder(),
                               "asc": asc, "desc": desc, "cap": cap or asc * 0.7}
    return _FONTES[(arq, ind)]


class _Caneta:
    """fontTools pen → subcaminhos [[x,y,ix,iy,ox,oy]...] em pt do objeto (quadráticas viram cúbicas).
    Ponto da fonte (x, y para cima) → (x·sx, −y·sy) → matriz M (posição; rotação no texto em caminho)."""
    def __init__(self, sx, sy, M):
        self.sx, self.sy, self.M, self.subs, self.cur = sx, sy, M, [], None

    def _p(self, x, y):
        X, Y = x * self.sx, -y * self.sy
        a, b, c, d, e, f = self.M
        return [a * X + c * Y + e, b * X + d * Y + f]

    def moveTo(self, p):
        x, y = self._p(*p); self.cur = {"fechado": False, "pts": [[x, y, x, y, x, y]]}; self.subs.append(self.cur); self._u = p

    def lineTo(self, p):
        x, y = self._p(*p); self.cur["pts"].append([x, y, x, y, x, y]); self._u = p

    def curveTo(self, *pts):
        # cúbicas encadeadas (CFF): de 3 em 3
        for i in range(0, len(pts) - 2, 3):
            c1, c2, p = self._p(*pts[i]), self._p(*pts[i + 1]), self._p(*pts[i + 2])
            ult = self.cur["pts"][-1]; ult[4], ult[5] = c1
            self.cur["pts"].append([p[0], p[1], c2[0], c2[1], p[0], p[1]])
        self._u = pts[-1]

    def qCurveTo(self, *pts):
        from fontTools.pens.basePen import decomposeQuadraticSegment
        if pts[-1] is None:   # contorno só de off-curves (TrueType): fecha no ponto médio
            pts = pts[:-1]
            m = ((pts[-1][0] + pts[0][0]) / 2, (pts[-1][1] + pts[0][1]) / 2)
            self.moveTo(m); pts = pts + (m,)
        for q, p in decomposeQuadraticSegment(pts):
            p0 = self._u
            c1 = (p0[0] + 2 / 3 * (q[0] - p0[0]), p0[1] + 2 / 3 * (q[1] - p0[1]))
            c2 = (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1]))
            self.curveTo(c1, c2, p)

    def closePath(self):
        if self.cur:
            pts = self.cur["pts"]
            if len(pts) > 1 and abs(pts[0][0] - pts[-1][0]) < 1e-6 and abs(pts[0][1] - pts[-1][1]) < 1e-6:
                pts[0][2], pts[0][3] = pts[-1][2], pts[-1][3]; pts.pop()
            self.cur["fechado"] = True; self.cur = None

    endPath = closePath

    def addComponent(self, nome, t):
        from fontTools.pens.transformPen import TransformPen
        self._gs[nome].draw(TransformPen(self, t))


def _tem_feat(F, tag):
    c = F.setdefault("_feats", {})
    if tag not in c:
        try:
            c[tag] = any(r.FeatureTag == tag for r in F["tt"]["GSUB"].table.FeatureList.FeatureRecord)
        except Exception:
            c[tag] = False
    return c[tag]


def _moldar(F, texto, track_em, feats=None):
    import uharfbuzz as hb
    buf = hb.Buffer(); buf.add_str(texto); buf.guess_segment_properties()
    f = {"kern": True, "liga": True}; f.update(feats or {})
    hb.shape(F["hb"], buf, f)
    tr = track_em * F["upem"] / 1000
    return [(F["ordem"][i.codepoint], i.cluster, p.x_advance + tr, p.x_offset, p.y_offset) for i, p in zip(buf.glyph_infos, buf.glyph_positions)]


# atributos de CARACTERE (objeto = base; trechos = [{ini, fim, ...}] por cima, o último vence) e de PARÁGRAFO (objeto)
_CAR = ("fam", "estilo", "tam", "track", "desl", "eh", "ev", "maius", "pos", "liga", "frac", "num", "preench", "traco")
_PAR = ("recuo_esq", "recuo_dir", "recuo_1a", "antes", "depois")
_HIFEN = {}


def _hifenizador(lingua):
    """pyphen (dicionários do LibreOffice); None se a língua não existir."""
    if lingua not in _HIFEN:
        try:
            import pyphen
            _HIFEN[lingua] = pyphen.Pyphen(lang=lingua, left=2, right=3)
        except Exception:
            _HIFEN[lingua] = None
    return _HIFEN[lingua]
_ESPACOS = ("space", "uni0020", "uni00A0", "nbspace")


def _runs(spec, n):
    """[(ini, fim, props)] cobrindo 0..n com os trechos aplicados."""
    base = {k: spec.get(k) for k in _CAR}
    base["fam"] = base["fam"] or "Arial"; base["estilo"] = base["estilo"] or "Regular"; base["tam"] = float(base["tam"] or 12)
    tr = [t for t in (spec.get("trechos") or []) if isinstance(t, dict)]
    if not tr:
        return [(0, n, base)]
    cortes = {0, n}
    for t in tr:
        cortes.add(max(0, min(n, int(t.get("ini", 0))))); cortes.add(max(0, min(n, int(t.get("fim", n)))))
    cs = sorted(cortes); out = []
    for a, b in zip(cs, cs[1:]):
        p = dict(base)
        for t in tr:
            if int(t.get("ini", 0)) <= a and int(t.get("fim", n)) >= b:
                p.update({k: v for k, v in t.items() if k in _CAR and v is not None})
        if out and out[-1][2] == p:
            out[-1] = (out[-1][0], b, p)
        else:
            out.append((a, b, p))
    return out or [(0, n, base)]


def _glifos(texto, ini, fim, p, falta):
    """Glifos de um trecho uniforme (texto[ini:fim]) com os atributos p → lista de dicts em pt."""
    arq, ind, achou = fonte_arquivo(p["fam"], p["estilo"])
    if not achou:
        falta.add(f"{p['fam']} {p['estilo']}")
    elif achou == "embutida":
        falta.add("~embutida")
    F = _fonte(arq, ind)
    tam = float(p["tam"]); desl = float(p.get("desl") or 0)
    if p.get("pos") == "sup": desl += tam * 0.333; tam *= 0.583
    elif p.get("pos") == "sub": desl -= tam * 0.333; tam *= 0.583
    eh = float(p.get("eh") or 100) / 100; ev = float(p.get("ev") or 100) / 100
    feats = {}
    if p.get("liga") is False: feats.update({"liga": False, "clig": False})
    if p.get("frac"): feats["frac"] = True
    num = p.get("num")
    if num: feats[{"old": "onum", "lin": "lnum", "tab": "tnum", "prop": "pnum"}.get(num, num)] = True
    seg = texto[ini:fim]
    pedacos = [(seg, tam, feats)]
    if p.get("maius") == "alta":
        pedacos = [("".join(c.upper() if len(c.upper()) == 1 else c for c in seg), tam, feats)]
    elif p.get("maius") == "versalete":
        if _tem_feat(F, "smcp"):
            pedacos = [(seg, tam, dict(feats, smcp=True))]
        else:   # versalete falso: minúsculas viram maiúsculas a 70%
            grupos = []
            for ch in seg:
                mi = ch.islower() and len(ch.upper()) == 1
                if not grupos or grupos[-1][0] != mi: grupos.append([mi, ""])
                grupos[-1][1] += ch.upper() if mi else ch
            pedacos = [(s_, tam * 0.7 if mi else tam, feats) for mi, s_ in grupos]
    out, pos = [], ini
    for s_, t_, f_ in pedacos:
        sc = t_ / F["upem"]
        for nome, cl, av, ox, oy in _moldar(F, s_, float(p.get("track") or 0), f_):
            ci = pos + cl
            ch = texto[ci] if ci < len(texto) else ""
            out.append({"nome": nome, "ci": ci, "adv": av * sc * eh, "xo": ox * sc * eh, "yo": oy * sc * ev, "F": F, "sx": sc * eh, "sy": sc * ev,
                        "desl": desl, "tam": float(p["tam"]), "asc": F["asc"] * sc * ev, "desc": -F["desc"] * sc * ev,
                        "esp": ch in (" ", "\u00a0") or (nome in _ESPACOS and ch != "\t"), "tab": ch == "\t", "hif": ch in ("-", "‐", "–", "/"),
                        "cor": (p.get("preench"), p.get("traco"))})
        pos += len(s_)
    return out


def _glifo_hifen(g):
    """glifo '-' com a fonte/corpo/cor do glifo g (hífen da hifenização)."""
    nome, _cl, av, ox, oy = _moldar(g["F"], "-", 0)[0]
    return dict(g, nome=nome, adv=av * g["sx"], xo=0, yo=0, esp=False, hif=True)


def _glifo_char(g, ch):
    """glifo do caractere ch com a fonte/corpo/cor do glifo g (pontilhado da tabulação)."""
    nome, _cl, av, ox, oy = _moldar(g["F"], ch, 0)[0]
    return dict(g, nome=nome, adv=av * g["sx"], xo=0, yo=0, esp=False, tab=False, hif=ch == "-")


def _tabs_layout(gl, tabs, x0=0):
    """Posições x dos glifos de uma linha com tabulação. tabs = [{pos (pt, da margem), alin: esq|dir|centro|decimal, guia: '.'}];
    sem parada definida depois do cursor: a cada 36 pt (½ polegada, como o Illustrator). → (posições, [(glifo da guia, x)])"""
    paradas = sorted((dict(t, pos=float(t.get("pos", 0))) for t in tabs if isinstance(t, dict)), key=lambda t: t["pos"])
    pos, guias, x, i, n = [0.0] * len(gl), [], 0.0, 0, len(gl)
    while i < n:
        g = gl[i]
        if not g.get("tab"):
            pos[i] = x; x += g["adv"]; i += 1; continue
        pos[i] = x
        j = i + 1
        while j < n and not gl[j].get("tab"): j += 1
        seg = gl[i + 1:j]; w = sum(s["adv"] for s in seg)
        t = next((t for t in paradas if t["pos"] - x0 > x + 0.01), None) or {"pos": x0 + (math.floor((x + 0.01) / 36) + 1) * 36, "alin": "esq"}
        p = t["pos"] - x0; al = t.get("alin") or "esq"
        if al == "dir": ini = p - w
        elif al == "centro": ini = p - w / 2
        elif al == "decimal":
            k = next((k for k, s in enumerate(seg) if s.get("nome") in ("period", "comma")), len(seg))
            ini = p - sum(s["adv"] for s in seg[:k])
        else: ini = p
        ini = max(ini, x)
        if t.get("guia") and ini - x > 0:   # pontilhado numa grade fixa (os pontos de linhas diferentes batem)
            gg = _glifo_char(g, str(t["guia"])[0]); passo = max(gg["adv"] * 1.6, 0.1)
            k = math.ceil((x + passo * 0.4) / passo)
            while (k + 1) * passo <= ini - passo * 0.4:
                guias.append((gg, k * passo)); k += 1
        x = ini; i += 1
    return pos, guias


def _desenhar(g, M, partes):
    cn = _Caneta(g["sx"], g["sy"], M); cn._gs = g["F"]["gs"]
    try:
        g["F"]["gs"][g["nome"]].draw(cn)
    except Exception:
        pass
    if cn.subs:
        chave = json.dumps(g["cor"], sort_keys=True)
        partes.setdefault(chave, (g["cor"], []))[1].extend(cn.subs)


def _trilha_pontos(subs, lado=False):
    """1º subcaminho → polilinha [(x, y, s acumulado)] (cúbicas amostradas); lado = do outro lado (invertido)."""
    if not subs or not subs[0].get("pts"):
        return []
    P = subs[0]["pts"]; fechado = subs[0].get("fechado")
    pts = [(P[0][0], P[0][1])]
    n = len(P) if fechado else len(P) - 1
    for i in range(n):
        a, b = P[i], P[(i + 1) % len(P)]
        reta = a[4] == a[0] and a[5] == a[1] and b[2] == b[0] and b[3] == b[1]
        passos = 1 if reta else 32
        for k in range(1, passos + 1):
            t = k / passos; u = 1 - t
            pts.append((u ** 3 * a[0] + 3 * u * u * t * a[4] + 3 * u * t * t * b[2] + t ** 3 * b[0],
                        u ** 3 * a[1] + 3 * u * u * t * a[5] + 3 * u * t * t * b[3] + t ** 3 * b[1]))
    if lado:
        pts.reverse()
    out, s = [], 0.0
    for i, q in enumerate(pts):
        if i: s += math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1])
        out.append((q[0], q[1], s))
    return out


def _trilha_em(pl, s):
    """posição e ângulo a s pt do início da polilinha."""
    import bisect
    i = max(1, min(len(pl) - 1, bisect.bisect_left([q[2] for q in pl], s)))
    a, b = pl[i - 1], pl[i]
    t = (s - a[2]) / ((b[2] - a[2]) or 1e-9)
    return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, math.atan2(b[1] - a[1], b[0] - a[0])


def texto_geometria(spec):
    """spec = {conteudo, fam, estilo, tam (pt), entrelinha (pt|None = 120% do maior corpo da linha), track (1/1000 em),
    alin: esq|centro|dir|just|just_tudo, caixa: largura pt (texto de área) | None (texto de ponto), caixa_alt: altura pt
    (área de altura fixa: o que não cabe sobra → corte), desl (pt, linha de base), eh/ev (% escala), maius: alta|versalete,
    pos: sup|sub, liga (bool), frac (bool), num: old|lin|tab|prop, trechos: [{ini, fim, <atributos de caractere>, preench, traco}],
    recuo_esq, recuo_dir, recuo_1a, antes, depois (pt, parágrafo), trilha: {subs, ini (pt), lado (bool)} (texto em caminho)}.
    Origem = linha de base da 1ª linha no x da âncora (ponto) ou canto superior esquerdo da caixa (área).
    → {subs, partes:[{subs, preench?, traco?}] (só se algum trecho tem cor), linhas:[{base, x, larg, ini, fim, asc, desc}],
       larg, alt, asc, desc, achou, faltam, fonte, corte (índice do 1º caractere que não coube | None), transborda}"""
    chave = hashlib.md5(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    if chave in _GEO:
        return _GEO[chave]
    texto = str(spec.get("conteudo") or "")
    falta = set()
    runs = _runs(spec, len(texto))
    caixa = float(spec["caixa"]) if spec.get("caixa") else None
    caixa_alt = float(spec["caixa_alt"]) if spec.get("caixa_alt") and caixa else None
    alin = spec.get("alin") or "esq"
    lead_fixo = float(spec["entrelinha"]) if spec.get("entrelinha") else None
    par = {k: float(spec.get(k) or 0) for k in _PAR}
    trilha = spec.get("trilha") if isinstance(spec.get("trilha"), dict) else None
    hif = spec.get("hifen")   # True | "pt_BR" | "en_US"...: hifeniza palavras de 6+ letras na quebra (como o Illustrator)
    hif = _hifenizador("pt_BR" if hif is True else str(hif)) if hif and caixa else None
    arq0, ind0, _ = fonte_arquivo(runs[0][2]["fam"], runs[0][2]["estilo"]); F0 = _fonte(arq0, ind0)
    tam0 = float(spec.get("tam") or 12); asc0, desc0 = F0["asc"] * tam0 / F0["upem"], -F0["desc"] * tam0 / F0["upem"]

    def glifos_de(ini, fim, fonte_txt=None):
        out = []
        for a, b, p in runs:
            a2, b2 = max(a, ini), min(b, fim)
            if a2 < b2:
                out += _glifos(fonte_txt if fonte_txt is not None else texto, a2, b2, p, falta)
        return out

    partes, info, corte = {}, [], None
    if trilha:   # ── texto em caminho: uma linha, cada glifo girado na tangente ──
        pl = _trilha_pontos(trilha.get("subs") or [], bool(trilha.get("lado")))
        L = pl[-1][2] if pl else 0
        plano = texto.replace("\n", " ")
        gl = glifos_de(0, len(plano), plano)
        larg = sum(g["adv"] for g in gl)
        x0 = {"centro": (L - larg) / 2, "dir": L - larg}.get(alin, 0) + float(trilha.get("ini") or 0)
        x = 0
        for g in gl:
            meio = x0 + x + g["adv"] / 2
            if meio > L:
                corte = g["ci"]; break
            if meio >= 0 and pl:
                px, py, ang = _trilha_em(pl, meio)
                c, s = math.cos(ang), math.sin(ang)
                dx, dy = -g["adv"] / 2 + g["xo"], -(g["desl"] + g["yo"])
                _desenhar(g, [c, s, -s, c, px + c * dx - s * dy, py + s * dx + c * dy], partes)
            x += g["adv"]
        larg_tot, alt_tot = L, asc0 + desc0
    else:   # ── ponto / área ──
        paragrafos, pos = [], 0
        for p_ in texto.split("\n"):
            paragrafos.append((pos, pos + len(p_))); pos += len(p_) + 1
        linhas = []   # (glifos, última do parágrafo, primeira do parágrafo, 1º caractere)
        for (a, b) in paragrafos:
            gl = glifos_de(a, b)
            if not caixa or not gl:
                linhas.append((gl, True, True, a)); continue
            ini, primeira = 0, True
            while ini < len(gl):
                disp = caixa - par["recuo_esq"] - par["recuo_dir"] - (par["recuo_1a"] if primeira else 0)
                acum, quebra, q, i = 0.0, None, None, ini
                while i < len(gl):
                    g = gl[i]
                    if g["esp"]: quebra = (i, i + 1)   # quebra no espaço (ele some)
                    acum += g["adv"]
                    if acum > disp + 1e-6 and i > ini and not g["esp"]:
                        q = quebra if quebra and quebra[0] > ini else (i, i)
                        if hif:   # tenta quebrar a palavra que estourou com hífen (o maior pedaço que cabe)
                            ws = quebra[1] if quebra and quebra[1] > ini else ini
                            we = i
                            while we < len(gl) and not gl[we]["esp"]: we += 1
                            c0, c1 = gl[ws]["ci"], gl[we - 1]["ci"] + 1
                            palavra = texto[c0:c1]
                            # só o trecho de letras ("so.Authoritatively" → "Authoritatively"; "ratings," → "ratings")
                            m_ = max(re.finditer(r"[^\W\d_]{6,}", palavra), key=lambda m: m.end() - m.start(), default=None)
                            if m_:
                                hg = _glifo_hifen(gl[i])
                                base = sum(x["adv"] for x in gl[ini:ws])
                                for pos in [m_.start() + q for q in reversed(hif.positions(m_.group()))]:
                                    k = next((kk for kk in range(ws, we) if gl[kk]["ci"] >= c0 + pos), None)
                                    if k and k > ws and base + sum(x["adv"] for x in gl[ws:k]) + hg["adv"] <= disp + 1e-6:
                                        q = (k, k, hg); break
                        break
                    if g["hif"]: quebra = (i + 1, i + 1)   # depois do hífen (ele fica)
                    i += 1
                if q is None:
                    linhas.append((gl[ini:], True, primeira, gl[ini]["ci"])); break
                linhas.append((gl[ini:q[0]] + ([dict(q[2], ci=gl[q[0] - 1]["ci"])] if len(q) > 2 else []), False, primeira, gl[ini]["ci"]))
                ini, primeira = q[1], False
                while ini < len(gl) and gl[ini]["esp"]: ini += 1
                if ini >= len(gl):
                    linhas[-1] = (linhas[-1][0], True, linhas[-1][2], linhas[-1][3])
        y = None
        for n, (gl, ultima, primeira, ci0) in enumerate(linhas):
            while gl and gl[-1]["esp"]:
                gl = gl[:-1]
            asc_l = max([g["asc"] for g in gl] or [asc0]); desc_l = max([g["desc"] for g in gl] or [desc0])
            lead = lead_fixo or 1.2 * max([g["tam"] for g in gl] or [tam0])
            if y is None:
                y = asc_l if caixa else 0
            else:
                y += lead + ((par["depois"] + par["antes"]) if primeira else 0)
            if caixa_alt is not None and y + desc_l > caixa_alt + 0.01:
                corte = ci0; break
            larg = sum(g["adv"] for g in gl)
            extra, r1 = 0, (par["recuo_1a"] if primeira else 0)
            if caixa:
                sobra = caixa - par["recuo_esq"] - par["recuo_dir"] - r1 - larg
                dx = par["recuo_esq"] + r1 + {"centro": sobra / 2, "dir": sobra}.get(alin, 0)
                if (alin == "just" and not ultima) or alin == "just_tudo":
                    esp = [g for g in gl if g["esp"]]
                    extra = sobra / len(esp) if esp and sobra > 0 else 0
            else:
                dx = {"centro": -larg / 2, "dir": -larg}.get(alin, 0) + r1
            x = 0
            if any(g.get("tab") for g in gl):   # linha com tabulação: paradas em vez do alinhamento (como no Illustrator)
                dx = (par["recuo_esq"] if caixa else 0) + r1
                pos, guias = _tabs_layout(gl, spec.get("tabs") or [], dx)
                for g, px in zip(gl, pos):
                    if not g.get("tab"): _desenhar(g, [1, 0, 0, 1, dx + px + g["xo"], y - g["desl"] - g["yo"]], partes)
                for g, px in guias: _desenhar(g, [1, 0, 0, 1, dx + px, y - g["desl"]], partes)
                x = (pos[-1] + gl[-1]["adv"]) if gl else 0
            else:
                for g in gl:
                    _desenhar(g, [1, 0, 0, 1, dx + x + g["xo"], y - g["desl"] - g["yo"]], partes)
                    x += g["adv"] + (extra if g["esp"] else 0)
            info.append({"base": round(y, 3), "x": round(dx, 3), "larg": round(x, 3), "ini": ci0, "fim": (gl[-1]["ci"] + 1) if gl else ci0,
                         "asc": round(asc_l, 3), "desc": round(desc_l, 3)})
        larg_tot = caixa if caixa else max([l["larg"] for l in info] or [0])
        if caixa_alt is not None:
            alt_tot = caixa_alt
        elif info:
            alt_tot = info[-1]["base"] + info[-1]["desc"] + (0 if caixa else info[0]["asc"])
        else:
            alt_tot = asc0 + desc0
    lista = list(partes.values())
    r = {"subs": [s for _c, ss in lista for s in ss], "linhas": info, "larg": larg_tot, "alt": alt_tot, "asc": asc0, "desc": desc0,
         "achou": False if any(not f.startswith("~") for f in falta) else ("embutida" if falta else True),
         "faltam": sorted(f for f in falta if not f.startswith("~")), "fonte": os.path.basename(arq0),
         "corte": corte, "transborda": corte is not None}
    if len(lista) > 1 or (lista and (lista[0][0][0] is not None or lista[0][0][1] is not None)):
        r["partes"] = [{"subs": ss, **({"preench": c[0]} if c[0] is not None else {}), **({"traco": c[1]} if c[1] is not None else {})} for c, ss in lista]
    if len(_GEO) > 2000:
        _GEO.clear()
    _GEO[chave] = r
    return r


def fonte_glifos(fam, estilo="Regular", limite=4000):
    """Caracteres que a fonte tem (painel Glifos) → {fam, estilo, achou, cars: [código Unicode...], total}"""
    arq, ind, achou = fonte_arquivo(fam, estilo)
    F = _fonte(arq, ind)
    try:
        cmap = F["tt"].getBestCmap() or {}
    except Exception:
        cmap = {}
    cars = sorted(c for c in cmap if c >= 0x20 and not (0x7f <= c < 0xa0) and not (0xd800 <= c < 0xe000))
    return {"fam": fam, "estilo": estilo, "achou": bool(achou), "cars": cars[:limite], "total": len(cars)}


# ─────────────────────────── Pathfinder ───────────────────────────
def _para_skia(subs, regra="nonzero"):
    import pathops
    p = pathops.Path(fillType=pathops.FillType.EVEN_ODD if regra == "evenodd" else pathops.FillType.WINDING)
    for sb in subs:
        pts = sb["pts"]
        if not pts:
            continue
        p.moveTo(pts[0][0], pts[0][1])
        n = len(pts) if sb.get("fechado") else len(pts) - 1
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            if a[4] == a[0] and a[5] == a[1] and b[2] == b[0] and b[3] == b[1]:
                p.lineTo(b[0], b[1])
            else:
                p.cubicTo(a[4], a[5], b[2], b[3], b[0], b[1])
        if sb.get("fechado"):
            p.close()
    return p


def _de_skia(p):
    subs, cur = [], None
    for verbo, pts in p.segments:
        if verbo == "moveTo":
            x, y = pts[0]; cur = {"fechado": False, "pts": [[x, y, x, y, x, y]]}; subs.append(cur)
        elif verbo == "lineTo":
            x, y = pts[0]; cur["pts"].append([x, y, x, y, x, y])
        elif verbo == "curveTo":
            (c1, c2, q) = pts; u = cur["pts"][-1]; u[4], u[5] = c1; cur["pts"].append([q[0], q[1], c2[0], c2[1], q[0], q[1]])
        elif verbo == "qCurveTo":
            p0 = cur["pts"][-1][:2]
            for k in range(len(pts) - 1):
                q, fim = pts[k], (pts[k + 1] if k + 2 == len(pts) else ((pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2))
                c1 = (p0[0] + 2 / 3 * (q[0] - p0[0]), p0[1] + 2 / 3 * (q[1] - p0[1])); c2 = (fim[0] + 2 / 3 * (q[0] - fim[0]), fim[1] + 2 / 3 * (q[1] - fim[1]))
                u = cur["pts"][-1]; u[4], u[5] = c1; cur["pts"].append([fim[0], fim[1], c2[0], c2[1], fim[0], fim[1]]); p0 = fim
        elif verbo in ("closePath", "endPath"):
            if cur:
                pts_ = cur["pts"]
                if len(pts_) > 1 and abs(pts_[0][0] - pts_[-1][0]) < 1e-6 and abs(pts_[0][1] - pts_[-1][1]) < 1e-6:
                    pts_[0][2], pts_[0][3] = pts_[-1][2], pts_[-1][3]; pts_.pop()
                cur["fechado"] = verbo == "closePath"
            cur = None
    return subs


def booleana(op, formas):
    """op: unir | subtrair (a de cima sai da de baixo) | intersecao | excluir. formas = [{subs, regra}] de baixo para cima.
    → {subs} (regra nonzero)"""
    import pathops
    ps = [_para_skia(f["subs"], f.get("regra", "nonzero")) for f in formas]
    if not ps:
        return {"subs": []}
    OP = {"unir": pathops.PathOp.UNION, "intersecao": pathops.PathOp.INTERSECTION, "excluir": pathops.PathOp.XOR}
    if op == "subtrair":
        r = ps[0]
        for p in ps[1:]:
            r = pathops.op(r, p, pathops.PathOp.DIFFERENCE)
    else:
        r = ps[0]
        for p in ps[1:]:
            r = pathops.op(r, p, OP[op])
    return {"subs": _de_skia(r)}


def _vazio(p):
    b = p.bounds if p is not None else None
    return not b or (b[2] - b[0]) * (b[3] - b[1]) < 1e-6 or not any(True for _ in p.segments)


def _pecas(p):
    """Caminho → peças separadas (cada contorno externo com os seus furos), pela regra nonzero do resultado."""
    import pathops
    subs = _de_skia(p)
    if len(subs) <= 1:
        return [subs] if subs else []
    def area(s):
        pts = s["pts"]; return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2
    def dentro(pt, s):
        return _para_skia([s]).contains((pt[0], pt[1]))
    ext = [s for s in subs if area(s) * area(subs[0]) > 0] or subs   # mesmo sentido do primeiro = externos
    furos = [s for s in subs if s not in ext]
    pecas = [[e] for e in ext]
    for f in furos:
        alvo = next((pc for pc in pecas if dentro(f["pts"][0][:2], pc[0])), pecas[0])
        alvo.append(f)
    return pecas


def regioes(formas):
    """Construtor de formas / Dividir: as áreas atômicas formadas pelas formas sobrepostas.
    formas = [{subs, regra}] de baixo para cima → [{subs, fontes: [índices das formas que cobrem a área]}] (peças separadas)."""
    import pathops
    regs = []   # (path, set(fontes))
    for i, f in enumerate(formas):
        s = pathops.simplify(_para_skia(f["subs"], f.get("regra", "nonzero")))
        novas = []
        resto = s
        for p, fs in regs:
            dentro = pathops.op(p, s, pathops.PathOp.INTERSECTION)
            fora = pathops.op(p, s, pathops.PathOp.DIFFERENCE)
            if not _vazio(dentro): novas.append((dentro, fs | {i}))
            if not _vazio(fora): novas.append((fora, fs))
            resto = pathops.op(resto, p, pathops.PathOp.DIFFERENCE)
        if not _vazio(resto): novas.append((resto, {i}))
        regs = novas
    out = []
    for p, fs in regs:
        for pc in _pecas(p):
            out.append({"subs": pc, "fontes": sorted(fs)})
    return out


def faca(formas, linha, larg=0.02):
    """Faca: corta formas fechadas ao longo de uma linha à mão livre (linha = [[x,y],...] pt). → [[peças (subs)] por forma]"""
    import pathops, skia
    corte = skia.Path(); corte.moveTo(*linha[0])
    for x, y in linha[1:]:
        corte.lineTo(x, y)
    borda = skia.Path()
    _sk_pincel(larg, "butt", "miter").getFillPath(corte, borda, None, 4.0)
    b = _para_skia(_sk_subs(borda))
    out = []
    for f in formas:
        p = pathops.simplify(_para_skia(f["subs"], f.get("regra", "nonzero")))
        r = pathops.op(p, b, pathops.PathOp.DIFFERENCE)
        out.append(_pecas(r))
    return out


# ─────────────── Deslocar caminho e Contornar traço (skia-python: Stroker + PathOps) ───────────────
def _sk_path(subs, regra="nonzero"):
    import skia
    p = skia.Path()
    p.setFillType(skia.PathFillType.kEvenOdd if regra == "evenodd" else skia.PathFillType.kWinding)
    for sb in subs:
        pts = sb["pts"]
        if not pts:
            continue
        p.moveTo(pts[0][0], pts[0][1])
        n = len(pts) if sb.get("fechado") else len(pts) - 1
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            if a[4] == a[0] and a[5] == a[1] and b[2] == b[0] and b[3] == b[1]:
                p.lineTo(b[0], b[1])
            else:
                p.cubicTo(a[4], a[5], b[2], b[3], b[0], b[1])
        if sb.get("fechado"):
            p.close()
    return p


def _sk_subs(p):
    """skia.Path → subs (cônicas viram quadráticas e estas viram cúbicas)."""
    import skia
    subs, cur = [], None
    it = skia.Path.Iter(p, False)

    def quad(p0, q, fim):
        c1 = (p0[0] + 2 / 3 * (q[0] - p0[0]), p0[1] + 2 / 3 * (q[1] - p0[1]))
        c2 = (fim[0] + 2 / 3 * (q[0] - fim[0]), fim[1] + 2 / 3 * (q[1] - fim[1]))
        u = cur["pts"][-1]; u[4], u[5] = c1; cur["pts"].append([fim[0], fim[1], c2[0], c2[1], fim[0], fim[1]])

    while True:
        v, pts = it.next()
        if v == skia.Path.kDone_Verb:
            break
        xy = [(q.x(), q.y()) for q in pts]
        if v == skia.Path.kMove_Verb:
            x, y = xy[0]; cur = {"fechado": False, "pts": [[x, y, x, y, x, y]]}; subs.append(cur)
        elif v == skia.Path.kLine_Verb:
            x, y = xy[1]; cur["pts"].append([x, y, x, y, x, y])
        elif v == skia.Path.kQuad_Verb:
            quad(xy[0], xy[1], xy[2])
        elif v == skia.Path.kConic_Verb:
            qs = skia.Path.ConvertConicToQuads(pts[0], pts[1], pts[2], it.conicWeight(), 2)
            qs = [(q.x(), q.y()) for q in qs]
            for k in range(0, len(qs) - 2, 2):
                quad(qs[k], qs[k + 1], qs[k + 2])
        elif v == skia.Path.kCubic_Verb:
            u = cur["pts"][-1]; u[4], u[5] = xy[1]; cur["pts"].append([xy[3][0], xy[3][1], xy[2][0], xy[2][1], xy[3][0], xy[3][1]])
        elif v == skia.Path.kClose_Verb and cur:
            ps = cur["pts"]
            if len(ps) > 1 and abs(ps[0][0] - ps[-1][0]) < 1e-4 and abs(ps[0][1] - ps[-1][1]) < 1e-4:
                ps[0][2], ps[0][3] = ps[-1][2], ps[-1][3]; ps.pop()
            cur["fechado"] = True
    return [s for s in subs if len(s["pts"]) > 1]


def _sk_pincel(larg, cap="butt", junc="miter", miter=4, tracejado=None, fase=0):
    import skia
    pt = skia.Paint(Style=skia.Paint.kStroke_Style, StrokeWidth=float(larg), AntiAlias=True)
    pt.setStrokeCap({"round": skia.Paint.kRound_Cap, "square": skia.Paint.kSquare_Cap}.get(cap, skia.Paint.kButt_Cap))
    pt.setStrokeJoin({"round": skia.Paint.kRound_Join, "bevel": skia.Paint.kBevel_Join}.get(junc, skia.Paint.kMiter_Join))
    pt.setStrokeMiter(float(miter or 4))
    tr = [float(x) for x in (tracejado or []) if x is not None]
    if tr and sum(tr) > 0:
        if len(tr) % 2:
            tr = tr * 2
        pt.setPathEffect(skia.DashPathEffect.Make(tr, float(fase or 0)))
    return pt


def deslocar(formas, dist, junc="miter", miter=4):
    """Deslocar caminho (Illustrator: Objeto > Caminho > Deslocar caminho). dist em pt (+ para fora, − para dentro).
    formas = [{subs, regra}] → [{subs}] (regra nonzero), uma por forma."""
    import skia
    out = []
    for f in formas:
        p = _sk_path(f["subs"], f.get("regra", "nonzero"))
        if abs(dist) < 1e-6:
            out.append({"subs": _sk_subs(skia.Simplify(p))}); continue
        borda = skia.Path()
        _sk_pincel(2 * abs(dist), "butt", junc, miter).getFillPath(p, borda, None, 4.0)
        r = skia.Op(p, borda, skia.PathOp.kUnion_PathOp if dist > 0 else skia.PathOp.kDifference_PathOp)
        out.append({"subs": _sk_subs(r) if r is not None else []})
    return out


def contornar_traco(formas):
    """Contornar traço: o traço vira uma forma preenchida (com terminais, cantos e tracejado).
    formas = [{subs, traco:{larg,cap,junc,miter,tracejado,fase}}] → [{subs}] (regra nonzero)."""
    import skia
    out = []
    for f in formas:
        t = f.get("traco") or {}
        p = _sk_path(f["subs"])
        borda = skia.Path()
        _sk_pincel(t.get("larg", 1), t.get("cap", "butt"), t.get("junc", "miter"), t.get("miter", 4),
                   t.get("tracejado"), t.get("fase", 0)).getFillPath(p, borda, None, 4.0)
        r = skia.Simplify(borda)
        out.append({"subs": _sk_subs(r if r is not None else borda)})
    return out


# ─────────────────────────── imagens ───────────────────────────
def _registrar_previa(arq, mascara=None):
    """URL de exibição: RGB/RGBA servido direto; CMYK/outros → PNG RGB em PASTA_TMP (prova pelo perfil).
    mascara = PNG L com a transparência de uma imagem CMYK (entra no alfa da prévia)."""
    from PIL import Image
    from Functions import media_server
    im = Image.open(arq)
    if im.format in ("PNG", "JPEG", "WEBP", "GIF") and im.mode in ("RGB", "RGBA", "L", "P", "LA") and not mascara:
        return media_server.register(arq)
    os.makedirs(PASTA_TMP, exist_ok=True)
    dest = os.path.join(PASTA_TMP, hashlib.md5((os.path.abspath(arq) + str(mascara)).encode()).hexdigest()[:16] + ".png")
    if not os.path.isfile(dest) or os.path.getmtime(dest) < os.path.getmtime(arq):
        if im.mode == "CMYK":
            t = _transf("FOGRA39", True)
            from PIL import ImageCms
            im = ImageCms.applyTransform(im, t) if t else im.convert("RGB")
        else:
            im = im.convert("RGBA")
        if mascara and os.path.isfile(mascara):
            ma = Image.open(mascara).convert("L")
            im = im.convert("RGBA"); im.putalpha(ma if ma.size == im.size else ma.resize(im.size))
        im.save(dest)
    return media_server.register(dest)


def canais_imagem(arq, mascara=None, cond="FOGRA39"):
    """Chapas de uma imagem para a Visualização de separações: {C, M, Y, K, vazio} → URL de PNG LA (branco = sem tinta,
    preto = 100%; alfa = transparência). RGB vai para CMYK pelo perfil (como na exportação); cinza vai só no K.
    'vazio' = silhueta branca (a imagem vaza as cores especiais)."""
    from PIL import Image, ImageCms, ImageOps
    from Functions import media_server
    os.makedirs(os.path.join(PASTA_TMP, "chapas"), exist_ok=True)
    base = os.path.join(PASTA_TMP, "chapas", hashlib.md5(f"{os.path.abspath(arq)}|{mascara}|{cond}|{os.path.getmtime(arq)}".encode()).hexdigest()[:16])
    nomes = ["C", "M", "Y", "K", "vazio"]
    if not all(os.path.isfile(f"{base}_{n}.png") for n in nomes):
        im = Image.open(arq); im.load()
        alfa = None
        if mascara and os.path.isfile(mascara):
            alfa = Image.open(mascara).convert("L")
        elif im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
            im = im.convert("RGBA"); alfa = im.getchannel("A")
        if alfa is not None and alfa.size != im.size:
            alfa = alfa.resize(im.size)
        if im.mode in ("L", "LA", "1", "I", "I;16"):
            g = im.convert("L"); branco = Image.new("L", im.size, 255)
            canais = {"C": branco, "M": branco, "Y": branco, "K": g}
        else:
            if im.mode != "CMYK":
                im = im.convert("RGB"); t = _transf(cond, False)
                im = ImageCms.applyTransform(im, t) if t else im.convert("CMYK")
            canais = {n: ImageOps.invert(c) for n, c in zip("CMYK", im.split())}
        canais["vazio"] = Image.new("L", im.size, 255)
        if alfa is None:
            alfa = Image.new("L", im.size, 255)
        for n, c in canais.items():
            Image.merge("LA", (c, alfa)).save(f"{base}_{n}.png", compress_level=1)
    return {n: media_server.register(f"{base}_{n}.png") for n in nomes}


def imagem_info(arq):
    """Imagem colocada: {arquivo, w, h, modo, ppi, url}."""
    from PIL import Image
    im = Image.open(arq)
    dpi = im.info.get("dpi") or (72, 72)
    return {"success": True, "arquivo": os.path.abspath(arq), "w": im.width, "h": im.height, "modo": im.mode,
            "ppi": round(float(dpi[0] or 72)), "alfa": im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info,
            "url": _registrar_previa(arq), "nome": os.path.basename(arq)}


def salvar_png(dados_b64, caminho):
    """Exportação de tela (PNG/JPG feito pelo painel no tamanho/ppi pedido)."""
    import base64
    from PIL import Image
    raw = base64.b64decode(dados_b64.split(",", 1)[-1])
    os.makedirs(os.path.dirname(os.path.abspath(caminho)) or ".", exist_ok=True)
    ext = os.path.splitext(caminho)[1].lower()
    if ext in (".jpg", ".jpeg"):
        Image.open(io.BytesIO(raw)).convert("RGB").save(caminho, quality=95, dpi=(300, 300))
    else:
        open(caminho, "wb").write(raw)
    return {"success": True, "path": caminho}


# ─────────────────────────── .aknv ───────────────────────────
def salvar(doc, caminho):
    """doc (dict) → zip .aknv: documento.json + imagens/ (cópia de cada imagem; o doc guarda o nome no zip)."""
    if not caminho.lower().endswith(".aknv"):
        caminho += ".aknv"
    doc = json.loads(json.dumps(doc))
    tmp = caminho + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for iid, im in (doc.get("imagens") or {}).items():
            arq = im.get("arquivo")
            if arq and os.path.isfile(arq):
                nome = f"imagens/{iid}{os.path.splitext(arq)[1].lower()}"
                z.write(arq, nome, compress_type=zipfile.ZIP_STORED)
                im["zip"] = nome
                if im.get("mascara") and os.path.isfile(im["mascara"]):
                    z.write(im["mascara"], f"imagens/{iid}_mascara.png", compress_type=zipfile.ZIP_STORED)
                    im["zip_mascara"] = f"imagens/{iid}_mascara.png"
            im.pop("url", None)
        for f in doc.get("fontes") or []:   # fontes embutidas (subconjuntos) que vieram do PDF/AI
            if f.get("arquivo") and os.path.isfile(f["arquivo"]):
                f["zip"] = "fontes/" + os.path.basename(f["arquivo"])
                z.write(f["arquivo"], f["zip"])
        z.writestr("documento.json", json.dumps(doc, ensure_ascii=False))
    os.replace(tmp, caminho)
    return {"success": True, "path": caminho, "nome": os.path.basename(caminho)}


def _fontes_usadas(itens, acc):
    for o in itens or []:
        if o.get("tipo") == "texto":
            acc.add((o.get("fam") or "Arial", o.get("estilo") or "Regular"))
        _fontes_usadas(o.get("itens"), acc)
    return acc


def empacotar(doc, pasta, opcoes=None):
    """Empacotar (como no Illustrator): pasta/<nome>/ com <nome>.aknv, Links/ (imagens originais), Fontes/ (opcional)
    e Relatório.txt. O PDF é gravado antes pelo painel (opcoes.pdf = resultado do exportar_pdf, entra no relatório)."""
    op = opcoes or {}
    nome = re.sub(r'[<>:"/\\|?*]+', "_", doc.get("nome") or "Sem titulo").strip() or "Sem titulo"
    dest = os.path.join(pasta, nome) if not op.get("na_pasta") else pasta
    os.makedirs(dest, exist_ok=True)
    doc = json.loads(json.dumps(doc))
    linhas = [f"KANIVETE — pacote de \"{doc.get('nome')}\"", time.strftime("%d/%m/%Y %H:%M"), ""]
    # links
    links, faltam = [], []
    for iid, im in (doc.get("imagens") or {}).items():
        arq = im.get("arquivo")
        if not (arq and os.path.isfile(arq)):
            faltam.append(im.get("nome") or iid); continue
        os.makedirs(os.path.join(dest, "Links"), exist_ok=True)
        base = im.get("nome") or os.path.basename(arq)
        alvo, n = os.path.join(dest, "Links", base), 1
        while os.path.exists(alvo) and not _mesmo_arquivo(alvo, arq):
            b, e = os.path.splitext(base); alvo = os.path.join(dest, "Links", f"{b}_{n}{e}"); n += 1
        if not os.path.exists(alvo):
            shutil.copy2(arq, alvo)
        im["arquivo"] = alvo
        if im.get("mascara") and os.path.isfile(im["mascara"]):
            ma = os.path.splitext(alvo)[0] + "_mascara.png"; shutil.copy2(im["mascara"], ma); im["mascara"] = ma
        links.append(f"  {os.path.basename(alvo)} — {im.get('w')}×{im.get('h')} px, {im.get('modo')}")
    # fontes
    fontes, sem = [], []
    for fam, est in sorted(_fontes_usadas([o for c in doc.get("camadas", []) for o in c.get("itens", [])], set())):
        arq, _, achou = fonte_arquivo(fam, est)
        if not achou:
            sem.append(f"{fam} {est}"); continue
        fontes.append(f"  {fam} {est} — {os.path.basename(arq)}")
        if op.get("fontes", True):
            os.makedirs(os.path.join(dest, "Fontes"), exist_ok=True)
            alvo = os.path.join(dest, "Fontes", os.path.basename(arq))
            if not os.path.exists(alvo):
                shutil.copy2(arq, alvo)
    r = salvar(doc, os.path.join(dest, nome + ".aknv"))
    ps = doc.get("pranchetas") or []
    linhas += [f"Documento: {r['nome']}  ·  {len(ps)} prancheta(s)  ·  {doc.get('modoCor', 'cmyk').upper()} {doc.get('perfil', '')}"
               f"  ·  sangria {round((doc.get('sangria') or 0) * 25.4 / 72, 2)} mm"]
    linhas += [f"  {p.get('nome')}: {round(p['w'] * 25.4 / 72, 1)} × {round(p['h'] * 25.4 / 72, 1)} mm" for p in ps]
    linhas += ["", f"Imagens ({len(links)}):"] + (links or ["  —"])
    if faltam:
        linhas += ["  FALTANDO: " + ", ".join(faltam)]
    linhas += ["", f"Fontes ({len(fontes)}){'' if op.get('fontes', True) else ' (não copiadas)'}:"] + (fontes or ["  —"])
    if sem:
        linhas += ["  NÃO INSTALADAS (saem em Arial): " + ", ".join(sem)]
    linhas += ["  Obs.: no PDF os textos já vão em curvas; as fontes servem para editar o .aknv em outro computador."]
    spots = sorted(set(op.get("spots") or []) - {"All", None})
    if spots:
        linhas += ["", "Cores especiais: " + ", ".join(spots)]
    pdf = op.get("pdf")
    if pdf:
        linhas += ["", f"PDF: {os.path.basename(pdf.get('caminho', ''))}  ·  {str(op.get('padrao', 'x4')).upper()}  ·  "
                   + ("verificado ✓" if pdf.get("verificado") else "verificar: " + "; ".join(pdf.get("problemas") or []))]
    fc = op.get("fechamento") or {}
    if fc:
        linhas += ["", f"Fechamento: {len(fc.get('erros') or [])} erro(s), {len(fc.get('avisos') or [])} alerta(s)"]
        linhas += [f"  [{x.get('nivel', '')}] {x.get('msg', '')}" for x in (fc.get("erros") or []) + (fc.get("avisos") or [])]
    with open(os.path.join(dest, "Relatório.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    return {"success": True, "pasta": dest, "aknv": r["path"], "links": len(links), "faltando": faltam,
            "fontes": len(fontes), "fontes_faltando": sem}


def _mesmo_arquivo(a, b):
    try:
        return os.path.getsize(a) == os.path.getsize(b) and open(a, "rb").read(65536) == open(b, "rb").read(65536)
    except OSError:
        return False


def abrir_aknv(caminho):
    pasta = os.path.join(PASTA_TMP, "docs", hashlib.md5(os.path.abspath(caminho).encode()).hexdigest()[:12])
    shutil.rmtree(pasta, ignore_errors=True); os.makedirs(pasta, exist_ok=True)
    with zipfile.ZipFile(caminho) as z:
        doc = json.loads(z.read("documento.json"))
        for iid, im in (doc.get("imagens") or {}).items():
            if im.get("zip"):
                z.extract(im["zip"], pasta)
                im["arquivo"] = os.path.join(pasta, im["zip"])
            if im.get("zip_mascara"):
                z.extract(im["zip_mascara"], pasta)
                im["mascara"] = os.path.join(pasta, im["zip_mascara"])
        for f in doc.get("fontes") or []:
            if f.get("zip"):
                z.extract(f["zip"], pasta); f["arquivo"] = os.path.join(pasta, f["zip"])
    registrar_fontes(doc.get("fontes"))
    for im in (doc.get("imagens") or {}).values():
        if im.get("arquivo") and os.path.isfile(im["arquivo"]):
            im["url"] = _registrar_previa(im["arquivo"], im.get("mascara"))
        else:
            im["faltando"] = True
    return {"success": True, "doc": doc, "path": os.path.abspath(caminho), "nome": os.path.basename(caminho)}


def abrir(caminho):
    """Qualquer formato: .aknv, .pdf, .ai, .svg, .pptx → {success, doc, relatorio}."""
    ext = os.path.splitext(caminho)[1].lower()
    if ext == ".aknv":
        return abrir_aknv(caminho)
    from Functions import vetor_importar
    r = vetor_importar.importar(caminho)
    for im in (r.get("doc", {}).get("imagens") or {}).values():
        if im.get("arquivo") and os.path.isfile(im["arquivo"]):
            im["url"] = _registrar_previa(im["arquivo"], im.get("mascara"))
    return r


# ─────────────────────────── QR code (vetor) ───────────────────────────
def qr_matriz(texto, correcao="M", borda=0):
    """Texto/URL → matriz do QR code ({linhas: [[0/1,...]], n}) para o Vetor desenhar em módulos vetoriais
    (gráfica: QR em vetor, nunca imagem). correcao: L|M|Q|H."""
    import qrcode
    nivel = {"L": qrcode.constants.ERROR_CORRECT_L, "M": qrcode.constants.ERROR_CORRECT_M,
             "Q": qrcode.constants.ERROR_CORRECT_Q, "H": qrcode.constants.ERROR_CORRECT_H}.get(str(correcao).upper(), qrcode.constants.ERROR_CORRECT_M)
    q = qrcode.QRCode(error_correction=nivel, border=int(borda))
    q.add_data(str(texto)); q.make(fit=True)
    m = q.get_matrix()
    return {"linhas": [[1 if c else 0 for c in l] for l in m], "n": len(m), "versao": q.version}


# ─────────────────────────── ícones (Tabler Icons, MIT, baixados sob demanda) ───────────────────────────
ICONES_URL = "https://cdn.jsdelivr.net/npm/@tabler/icons@3/icons/{estilo}/{nome}.svg"


def icone_svg(nome, estilo="outline"):
    """SVG de um ícone Tabler (tabler.io/icons, licença MIT): baixa uma vez e guarda em
    %APPDATA%/CaniveteDoPailer/icones/tabler/<estilo>/<nome>.svg. estilo: outline (traço) | filled (cheio)."""
    nome = re.sub(r"[^a-z0-9-]", "", str(nome).lower().strip().replace(" ", "-").replace("_", "-"))
    estilo = "filled" if str(estilo).lower().startswith(("fill", "chei")) else "outline"
    if not nome:
        return {"success": False, "error": "nome do ícone vazio"}
    pasta = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "CaniveteDoPailer", "icones", "tabler", estilo)
    arq = os.path.join(pasta, nome + ".svg")
    if not os.path.isfile(arq):
        import urllib.request, urllib.error
        try:
            with urllib.request.urlopen(ICONES_URL.format(estilo=estilo, nome=nome), timeout=15) as r:
                dados = r.read()
        except urllib.error.HTTPError as e:
            outro = "outline" if estilo == "filled" else "filled"
            return {"success": False, "error": f"ícone '{nome}' ({estilo}) não existe" + (f" — tente estilo {outro} ou veja os nomes em tabler.io/icons" if e.code == 404 else f" (HTTP {e.code})")}
        except Exception as e:
            return {"success": False, "error": f"sem internet para baixar o ícone '{nome}': {e}"}
        os.makedirs(pasta, exist_ok=True)
        with open(arq, "wb") as f:
            f.write(dados)
    return {"success": True, "svg": open(arq, encoding="utf-8").read(), "nome": nome, "estilo": estilo, "licenca": "Tabler Icons (MIT)"}


# ─────────────────────────── Traçado de imagem (Image Trace) ───────────────────────────
def vetorizar(arquivo, cores=6, area_min=12, ignorar_fundo=True, lado_max=1600):
    """Imagem (logo/arte) → regiões por cor em contornos de pixel, para o Vetor ajustar curvas.
    k-means em Lab com `cores` cores; cada cor → contornos externos + furos (RETR_CCOMP); máscara dilatada 1 px (as cores
    se sobrepõem um pouco: sem filete branco entre elas). area_min em px². ignorar_fundo: pula a cor que domina a borda e é
    clara (ou transparente). → {w, h, escala, regioes: [{rgb, area, formas: [[contorno externo, furo, ...], ...]}]}
    (contornos = [[x, y], ...] em px da imagem ORIGINAL; maior área primeiro = vai para baixo)."""
    import cv2, numpy as np
    from PIL import Image
    im = Image.open(arquivo)
    alfa = None
    if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA"); alfa = np.array(im.getchannel("A"))
    rgb = np.array(im.convert("RGB"))
    H0, W0 = rgb.shape[:2]
    esc = min(1.0, lado_max / max(W0, H0))
    if esc < 1:
        rgb = cv2.resize(rgb, (int(W0 * esc), int(H0 * esc)), interpolation=cv2.INTER_AREA)
        if alfa is not None: alfa = cv2.resize(alfa, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_AREA)
    H, W = rgb.shape[:2]
    rgb = cv2.bilateralFilter(rgb, 7, 40, 7)   # tira ruído/JPEG sem amolecer as bordas
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    validos = np.ones(H * W, bool) if alfa is None else (alfa.reshape(-1) > 127)
    k = max(2, min(32, int(cores)))
    amostra = lab[validos]
    if len(amostra) > 200000:
        amostra = amostra[np.random.default_rng(1).choice(len(amostra), 200000, replace=False)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, _, centros = cv2.kmeans(amostra, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    d = ((lab[:, None, :] - centros[None, :, :]) ** 2).sum(-1)
    rot = d.argmin(1).astype(np.int32)
    rot[~validos] = -1
    rot = rot.reshape(H, W)
    cent_rgb = cv2.cvtColor(centros.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2RGB).reshape(-1, 3)
    borda = np.concatenate([rot[0], rot[-1], rot[:, 0], rot[:, -1]])
    fundo = None
    if ignorar_fundo:
        vals, cont = np.unique(borda[borda >= 0], return_counts=True)
        if len(vals) and cont.max() > len(borda) * 0.5 and cent_rgb[vals[cont.argmax()]].mean() > 200:
            fundo = int(vals[cont.argmax()])
    s = 1 / esc
    regioes = []
    nucleo = np.ones((3, 3), np.uint8)
    for c in range(k):
        if c == fundo: continue
        m = (rot == c).astype(np.uint8) * 255
        area = int(m.sum() // 255)
        if area < area_min: continue
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, nucleo)   # tira pontinhos soltos
        m = cv2.dilate(m, nucleo)                          # sobreposição de 1 px entre cores
        cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if hier is None: continue
        hier = hier[0]; formas = []
        for i, h in enumerate(hier):
            if h[3] != -1 or cv2.contourArea(cs[i]) < area_min: continue   # só externos (furos vêm como filhos)
            f = [(cs[i][:, 0, :] * s).round(2).tolist()]
            j = h[2]
            while j != -1:
                if cv2.contourArea(cs[j]) >= area_min: f.append((cs[j][:, 0, :] * s).round(2).tolist())
                j = hier[j][0]
            formas.append(f)
        if formas:
            regioes.append({"rgb": [int(x) for x in cent_rgb[c]], "area": area, "formas": formas})
    regioes.sort(key=lambda r: -r["area"])
    return {"success": True, "w": W0, "h": H0, "escala": esc, "fundo_ignorado": fundo is not None, "regioes": regioes}


# ─────────────────────────── bibliotecas de cor (.acb Adobe Color Book, .ase Swatch Exchange) ───────────────────────────
# Pantone e cia. são dados proprietários: o app NÃO traz os livros; lê os que o usuário tem (Illustrator/Photoshop instalados,
# ou .acb/.ase que a gráfica mandar, copiados para %APPDATA%/CaniveteDoPailer/cores).
_BIBLIO = {}


def _lab_para_cmyk(labs, cond="FOGRA39"):
    """[[L 0-100, a, b]] → [[c,m,y,k] 0-100] pelo perfil de saída (colorimétrico relativo + BPC, como a Adobe)."""
    from PIL import Image, ImageCms
    icc = perfil_arquivo(cond)
    if not icc or not labs:
        return [[0, 0, 0, round(100 - L, 1)] for L, a, b in labs]
    t = ImageCms.buildTransform(ImageCms.createProfile("LAB"), ImageCms.getOpenProfile(icc), "LAB", "CMYK",
                                ImageCms.Intent.RELATIVE_COLORIMETRIC, flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)
    im = Image.new("LAB", (len(labs), 1))
    im.putdata([(max(0, min(255, round(L * 2.55))), max(0, min(255, round(a + 128))), max(0, min(255, round(b + 128)))) for L, a, b in labs])
    return [[round(x / 2.55, 1) for x in v] for v in ImageCms.applyTransform(im, t).getdata()]


def _str_acb(d, p):
    import struct
    n = struct.unpack_from(">I", d, p)[0]; p += 4
    s = d[p:p + 2 * n].decode("utf-16-be", "replace").rstrip("\x00"); p += 2 * n
    if s.startswith("$$$/") and "=" in s:   # textos localizados da Adobe: "$$$/colorbook/.../prefix=PANTONE "
        s = s.split("=", 1)[1]
    return s, p


def _ler_acb(d, cond):
    import struct
    p = 8
    titulo, p = _str_acb(d, p); pre, p = _str_acb(d, p); suf, p = _str_acb(d, p); _desc, p = _str_acb(d, p)
    n, _pag, _sel, esp = struct.unpack_from(">HHHH", d, p); p += 8
    tam = {0: 3, 2: 4, 7: 3}.get(esp)
    if tam is None:
        raise ValueError(f"espaço de cor {esp} não suportado no .acb")
    cores = []
    for _ in range(n):
        nome, p = _str_acb(d, p); p += 6   # código de catálogo
        v = list(d[p:p + tam]); p += tam
        if nome.strip():
            cores.append((f"{pre}{nome}{suf}".strip(), v))
    spot = d[p:p + 4] != b"proc"   # livros novos terminam com "spot"/"proc"; os antigos (Pantone) são especiais
    if esp == 7:
        conv = _lab_para_cmyk([[v[0] / 2.55, v[1] - 128, v[2] - 128] for _, v in cores], cond)
    elif esp == 0:
        conv = rgb_para_cmyk([v for _, v in cores], cond)
    else:
        conv = [[round((255 - x) / 2.55, 1) for x in v] for _, v in cores]   # CMYK do .acb: 0 = 100% de tinta
    out = []
    for (nome, v), cmyk in zip(cores, conv):
        c = {"nome": nome, "cmyk": cmyk, "spot": spot}
        if esp == 7: c["lab"] = [round(v[0] / 2.55, 1), v[1] - 128, v[2] - 128]
        out.append(c)
    return titulo or "Livro de cores", out


def _ler_ase(d, cond):
    import struct
    p = 8; nblocos = struct.unpack_from(">I", d, p)[0]; p += 4
    cores, grupo = [], None
    for _ in range(nblocos):
        tipo, tam = struct.unpack_from(">HI", d, p); p += 6
        fim = p + tam
        if tipo == 0xC001:   # início de grupo
            n = struct.unpack_from(">H", d, p)[0]; grupo = d[p + 2:p + 2 + 2 * n].decode("utf-16-be", "replace").rstrip("\x00")
        elif tipo == 0xC002:
            grupo = None
        elif tipo == 0x0001:
            n = struct.unpack_from(">H", d, p)[0]; q = p + 2
            nome = d[q:q + 2 * n].decode("utf-16-be", "replace").rstrip("\x00"); q += 2 * n
            modelo = d[q:q + 4].decode("ascii", "replace").strip(); q += 4
            nv = {"CMYK": 4, "RGB": 3, "LAB": 3, "Gray": 1}.get(modelo, 0)
            vals = struct.unpack_from(">" + "f" * nv, d, q); q += 4 * nv
            tipo_cor = struct.unpack_from(">H", d, q)[0] if q + 2 <= fim else 2
            c = {"nome": nome, "spot": tipo_cor == 1, "global": tipo_cor == 0}
            if grupo: c["grupo"] = grupo
            if modelo == "CMYK": c["cmyk"] = [round(x * 100, 1) for x in vals]
            elif modelo == "RGB": c["rgb"] = [round(x * 255) for x in vals]
            elif modelo == "LAB": c["lab"] = [vals[0] * 100, vals[1], vals[2]]
            elif modelo == "Gray": c["cmyk"] = [0, 0, 0, round((1 - vals[0]) * 100, 1)]
            cores.append(c)
        p = fim
    labs = [c for c in cores if "lab" in c]
    for c, cm in zip(labs, _lab_para_cmyk([c["lab"] for c in labs], cond) if labs else []):
        c["cmyk"] = cm
    rg = [c for c in cores if "rgb" in c and "cmyk" not in c]
    for c, cm in zip(rg, rgb_para_cmyk([c["rgb"] for c in rg], cond) if rg else []):
        c["cmyk"] = cm
    return None, cores


def ler_biblioteca(arquivo, cond="FOGRA39"):
    """.acb / .ase → {titulo, arquivo, cores: [{nome, cmyk (alternativo pelo perfil), spot, lab?, rgb?, grupo?}]}"""
    chave = (os.path.abspath(arquivo), cond, os.path.getmtime(arquivo))
    if chave not in _BIBLIO:
        d = open(arquivo, "rb").read()
        if d[:4] == b"8BCB": titulo, cores = _ler_acb(d, cond)
        elif d[:4] == b"ASEF": titulo, cores = _ler_ase(d, cond)
        else: return {"success": False, "error": "não é biblioteca de cores Adobe (.acb/.ase)"}
        _BIBLIO[chave] = {"success": True, "titulo": titulo or os.path.splitext(os.path.basename(arquivo))[0], "arquivo": os.path.abspath(arquivo), "cores": cores}
    return _BIBLIO[chave]


def bibliotecas_cor():
    """Livros encontrados: Adobe instalada (Presets/.../Color Books) + %APPDATA%/CaniveteDoPailer/cores. → {pasta_usuario, bibliotecas}"""
    import glob
    pastas = [os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "CaniveteDoPailer", "cores")]
    for raiz in (os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")):
        for padrao in ("*/Presets*/Color Books", "*/Presets*/*/Color Books", "*/Presets*/*/*/Color Books"):
            pastas += glob.glob(os.path.join(raiz, "Adobe", padrao))
    out, vistos = [], set()
    for pa in pastas:
        for arq in sorted(glob.glob(os.path.join(pa, "*.acb")) + glob.glob(os.path.join(pa, "*.ase"))):
            n = os.path.splitext(os.path.basename(arq))[0]
            if n.lower() not in vistos:
                vistos.add(n.lower()); out.append({"nome": n, "arquivo": arq})
    return {"pasta_usuario": pastas[0], "bibliotecas": out}


# ─────────────────────────── salvamento automático / recuperação ───────────────────────────
def _pasta_recuperacao():
    p = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "CaniveteDoPailer", "vetor_recuperacao")
    os.makedirs(p, exist_ok=True)
    return p


def autosalvar(doc, meta=None):
    """Cópia leve do documento (só o JSON; as imagens continuam nos arquivos de origem) para recuperar depois de uma queda.
    meta = {nome, caminho} (o arquivo .aknv original, se já foi salvo). Escrita atômica (tmp + replace)."""
    uid = re.sub(r"[^\w-]", "", str(doc.get("uid") or "sem-uid"))[:40]
    pasta = _pasta_recuperacao()
    dados = {"meta": {**(meta or {}), "uid": uid, "quando": time.time(), "nome": (meta or {}).get("nome") or doc.get("nome") or "Sem título"}, "doc": doc}
    tmp = os.path.join(pasta, uid + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(pasta, uid + ".json"))
    return {"success": True, "uid": uid}


def recuperaveis():
    """Cópias deixadas por sessões que não salvaram (queda, fechamento) → [{uid, nome, caminho, quando}] mais nova primeiro."""
    out = []
    for arq in os.listdir(_pasta_recuperacao()):
        if not arq.endswith(".json"):
            continue
        try:
            with open(os.path.join(_pasta_recuperacao(), arq), encoding="utf-8") as f:
                m = json.load(f)["meta"]
            out.append({"uid": m["uid"], "nome": m.get("nome"), "caminho": m.get("caminho"), "quando": m.get("quando")})
        except Exception:
            continue
    return sorted(out, key=lambda m: -(m["quando"] or 0))


def recuperar(uid):
    arq = os.path.join(_pasta_recuperacao(), re.sub(r"[^\w-]", "", str(uid)) + ".json")
    if not os.path.isfile(arq):
        return {"success": False, "error": "cópia de recuperação não existe"}
    with open(arq, encoding="utf-8") as f:
        d = json.load(f)
    return {"success": True, "doc": d["doc"], "meta": d["meta"]}


def descartar_recuperacao(uid):
    arq = os.path.join(_pasta_recuperacao(), re.sub(r"[^\w-]", "", str(uid)) + ".json")
    if os.path.isfile(arq):
        os.remove(arq)
    return {"success": True}
