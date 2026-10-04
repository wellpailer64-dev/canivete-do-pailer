"""Vetor Kanivete (estilo Illustrator): o lado Python do editor vetorial (frontend/js/vetor-*.js).

Modelo (unidade = pt, 1/72"; y para baixo, como no SVG): ver Instructions/vetor-kanivete.md. Aqui:
- texto → curvas (HarfBuzz + fontTools): a MESMA geometria que a tela desenha e que vai para o PDF (o que se vê = o
  que imprime; no fechamento o texto sai em curvas, sem depender de fonte na gráfica)
- operações booleanas do Pathfinder (skia-pathops)
- cores: CMYK ↔ RGB pelo perfil ICC de saída (prova de cor na tela) e conversão RGB → CMYK
- .aknv = zip com documento.json + imagens/ (salvar/abrir)
- imagens colocadas: tamanho, modo (RGB/CMYK), ppi, prévia RGB servida ao painel
"""
import hashlib, io, json, os, shutil, tempfile, zipfile

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
            _TRANSF[chave] = (ImageCms.buildTransform(cmyk, srgb, "CMYK", "RGB", ImageCms.Intent.RELATIVE_COLORIMETRIC) if para_rgb
                              else ImageCms.buildTransform(srgb, cmyk, "RGB", "CMYK", ImageCms.Intent.RELATIVE_COLORIMETRIC))
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


def fonte_arquivo(fam, estilo="Regular"):
    """→ (arquivo, indice, achou) — família/estilo instalados; senão Arial (achou=False: o fechamento avisa)."""
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
    """fontTools pen → subcaminhos [[x,y,ix,iy,ox,oy]...] já em pt do objeto (quadráticas viram cúbicas)."""
    def __init__(self, s, dx, base):
        self.s, self.dx, self.base, self.subs, self.cur = s, dx, base, [], None

    def _p(self, x, y):
        return [self.dx + x * self.s, self.base - y * self.s]

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


def _moldar(F, texto, track_em):
    import uharfbuzz as hb
    buf = hb.Buffer(); buf.add_str(texto); buf.guess_segment_properties()
    hb.shape(F["hb"], buf, {"kern": True, "liga": True})
    tr = track_em * F["upem"] / 1000
    return [(F["ordem"][i.codepoint], i.cluster, p.x_advance + tr, p.x_offset, p.y_offset) for i, p in zip(buf.glyph_infos, buf.glyph_positions)]


def texto_geometria(spec):
    """spec = {conteudo, fam, estilo, tam (pt), entrelinha (pt|None = 120%), track (1/1000 em), alin: esq|centro|dir|just,
    caixa: largura em pt (texto de área) | None (texto de ponto)}. Origem = linha de base da 1ª linha no x da âncora
    (ponto) ou canto superior esquerdo da caixa (área). → {subs, linhas, larg, alt, achou, fonte}"""
    chave = hashlib.md5(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    if chave in _GEO:
        return _GEO[chave]
    arq, ind, achou = fonte_arquivo(spec.get("fam") or "Arial", spec.get("estilo") or "Regular")
    F = _fonte(arq, ind)
    tam = float(spec.get("tam") or 12); s = tam / F["upem"]
    lead = float(spec.get("entrelinha") or tam * 1.2)
    track = float(spec.get("track") or 0)
    caixa = spec.get("caixa"); alin = spec.get("alin") or "esq"
    # quebra: parágrafos por \n; texto de área quebra nos espaços pela largura
    linhas = []
    for par in str(spec.get("conteudo") or "").split("\n"):
        gl = _moldar(F, par, track)
        if not caixa or not gl:
            linhas.append((gl, True)); continue
        larg_max = float(caixa) / s
        ini, acum, ult_esp = 0, 0, None
        i = 0
        while i < len(gl):
            if par[gl[i][1]: gl[i][1] + 1] == " ":
                ult_esp = i
            acum += gl[i][2]
            if acum > larg_max and i > ini:
                corte = ult_esp if ult_esp is not None and ult_esp > ini else i
                linhas.append((gl[ini:corte], False))
                ini = corte + 1 if ult_esp is not None and corte == ult_esp else corte
                i, acum, ult_esp = ini, 0, None
                continue
            i += 1
        linhas.append((gl[ini:], True))
    subs, info = [], []
    asc = F["asc"] * s
    y0 = asc if caixa else 0
    for n, (gl, ultima) in enumerate(linhas):
        while gl and gl[-1][0] in ("space", "uni0020"):
            gl = gl[:-1]
        larg = sum(g[2] for g in gl) * s
        base = y0 + n * lead
        extra = 0
        if caixa:
            sobra = float(caixa) - larg
            dx = {"centro": sobra / 2, "dir": sobra}.get(alin, 0)
            if alin == "just" and not ultima:
                esp = [k for k, g in enumerate(gl) if g[0] in ("space", "uni0020")]
                extra = sobra / s / len(esp) if esp else 0; dx = 0
        else:
            dx = {"centro": -larg / 2, "dir": -larg}.get(alin, 0)
        x = 0
        for nome, _cl, av, ox, oy in gl:
            caneta = _Caneta(s, dx + (x + ox) * s, base - oy * s)
            caneta._gs = F["gs"]
            try:
                F["gs"][nome].draw(caneta)
            except Exception:
                pass
            subs.extend(caneta.subs)
            x += av + (extra if nome in ("space", "uni0020") else 0)
        info.append({"base": round(base, 3), "x": round(dx, 3), "larg": round(larg, 3)})
    larg_tot = float(caixa) if caixa else max([l["larg"] for l in info] or [0])
    r = {"subs": subs, "linhas": info, "larg": larg_tot, "alt": (len(linhas) - 1) * lead + asc - F["desc"] * s,
         "asc": asc, "desc": -F["desc"] * s, "achou": achou, "fonte": os.path.basename(arq)}
    if len(_GEO) > 2000:
        _GEO.clear()
    _GEO[chave] = r
    return r


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


# ─────────────────────────── imagens ───────────────────────────
def _registrar_previa(arq):
    """URL de exibição: RGB/RGBA servido direto; CMYK/outros → PNG RGB em PASTA_TMP (prova pelo perfil)."""
    from PIL import Image
    from Functions import media_server
    im = Image.open(arq)
    if im.format in ("PNG", "JPEG", "WEBP", "GIF") and im.mode in ("RGB", "RGBA", "L", "P", "LA"):
        return media_server.register(arq)
    os.makedirs(PASTA_TMP, exist_ok=True)
    dest = os.path.join(PASTA_TMP, hashlib.md5(os.path.abspath(arq).encode()).hexdigest()[:16] + ".png")
    if not os.path.isfile(dest) or os.path.getmtime(dest) < os.path.getmtime(arq):
        if im.mode == "CMYK":
            t = _transf("FOGRA39", True)
            from PIL import ImageCms
            im = ImageCms.applyTransform(im, t) if t else im.convert("RGB")
        else:
            im = im.convert("RGBA")
        im.save(dest)
    return media_server.register(dest)


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
            im.pop("url", None)
        z.writestr("documento.json", json.dumps(doc, ensure_ascii=False))
    os.replace(tmp, caminho)
    return {"success": True, "path": caminho, "nome": os.path.basename(caminho)}


def abrir_aknv(caminho):
    pasta = os.path.join(PASTA_TMP, "docs", hashlib.md5(os.path.abspath(caminho).encode()).hexdigest()[:12])
    shutil.rmtree(pasta, ignore_errors=True); os.makedirs(pasta, exist_ok=True)
    with zipfile.ZipFile(caminho) as z:
        doc = json.loads(z.read("documento.json"))
        for iid, im in (doc.get("imagens") or {}).items():
            if im.get("zip"):
                z.extract(im["zip"], pasta)
                im["arquivo"] = os.path.join(pasta, im["zip"])
    for im in (doc.get("imagens") or {}).values():
        if im.get("arquivo") and os.path.isfile(im["arquivo"]):
            im["url"] = _registrar_previa(im["arquivo"])
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
            im["url"] = _registrar_previa(im["arquivo"])
    return r
