"""slider_kanivete.py — Slider Kanivete (Sd, verde-água): apresentações 16:9 (PowerPoint/Canva/Figma no Kanivete).

Projeto .dknv = zip:
  documento.json — {formato: 'dknv', versao, nome, largura, altura, slides: [{id, fundo, transicao, dur, notas, oculto,
                    camadas: [{id, tipo: texto|forma|imagem|video, x, y, w, h, rot, opac, ...}]}]}
  midias/        — imagens, GIFs e vídeos COPIADOS para dentro (o projeto anda sozinho); no JSON viram 'midias/<nome>'
  previa.png     — miniatura do 1º slide
Ao abrir, as mídias saem em <raiz de dados>/Slider/<hash> e os caminhos voltam a ser absolutos.

Exportar: o front fotografa cada slide (o próprio DOM → SVG foreignObject → canvas, igual à tela) e manda quadro a
quadro (`quadro`) para uma pasta de trabalho; `exportar` junta em PDF, PNGs, MP4 (ffmpeg, com transições xfade) ou
PPTX. PPTX sai EDITÁVEL (texto, formas, imagens, vídeos e notas como objetos do PowerPoint, `pptx_nativo`) ou como
imagens (fiel ao pixel). Importar PPTX (`importar_pptx`): textos, formas, imagens, fundo e notas viram camadas.
Guia: Instructions/slider-kanivete.md
"""
import base64, hashlib, html as _html, json, os, re, shutil, subprocess, tempfile, uuid, zipfile

from Functions.midia import raiz_dados

EXTENSAO = ".dknv"
VERSAO = 1
PX_EMU = 6350          # 1920 px = 13,333 pol (slide 16:9 do PowerPoint) → 1 px = 0,5 pt = 6350 EMU


# ───────────────────────── projeto ─────────────────────────
def _midias(doc):
    """(dicionário, chave) de cada caminho de mídia dentro do documento"""
    for s in doc.get("slides", []):
        f = s.get("fundo") or {}
        if isinstance(f.get("img"), str) and f["img"]:
            yield f, "img"
        for c in _todas(s.get("camadas", [])):
            if isinstance(c.get("src"), str) and c["src"]:
                yield c, "src"


def _todas(camadas):
    for c in camadas:
        yield c
        if c.get("tipo") == "grupo":
            yield from _todas(c.get("itens", []))


def salvar(caminho, doc, previa=None):
    if not caminho.lower().endswith(EXTENSAO):
        caminho += EXTENSAO
    doc = json.loads(json.dumps(doc))
    copiar = {}
    for obj, k in _midias(doc):
        p = obj[k]
        if p.startswith("midias/") or not os.path.isfile(p):
            continue
        if p not in copiar:
            copiar[p] = f"{len(copiar):03d}_{os.path.basename(p)}"
        obj[k] = "midias/" + copiar[p]
    # mídias que já vinham de um .dknv aberto (pasta de trabalho) continuam dentro
    tmp = caminho + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("documento.json", json.dumps({**doc, "formato": "dknv", "versao": VERSAO}, ensure_ascii=False))
        for orig, nome in copiar.items():
            ext = os.path.splitext(nome)[1].lower()
            z.write(orig, "midias/" + nome, compress_type=zipfile.ZIP_STORED if ext in (".mp4", ".mov", ".webm", ".jpg", ".jpeg", ".png", ".gif", ".webp") else zipfile.ZIP_DEFLATED)
        if previa and "," in str(previa):
            try:
                z.writestr("previa.png", base64.b64decode(previa.split(",", 1)[1]))
            except Exception:
                pass
    os.replace(tmp, caminho)
    return {"success": True, "path": os.path.abspath(caminho), "midias": len(copiar)}


def abrir(caminho):
    if not os.path.isfile(caminho):
        return {"success": False, "error": "arquivo não encontrado"}
    st = os.stat(caminho)
    pasta = os.path.join(raiz_dados(), "Slider", hashlib.sha1(f"{os.path.abspath(caminho)}|{st.st_mtime}".encode()).hexdigest()[:12])
    with zipfile.ZipFile(caminho) as z:
        doc = json.loads(z.read("documento.json").decode("utf-8"))
        if doc.get("formato") != "dknv":
            return {"success": False, "error": "não é um projeto do Slider Kanivete"}
        for n in z.namelist():
            if n.startswith("midias/") and not n.endswith("/"):
                destino = os.path.join(pasta, n)
                if not os.path.exists(destino):
                    os.makedirs(os.path.dirname(destino), exist_ok=True)
                    with z.open(n) as a, open(destino, "wb") as b:
                        shutil.copyfileobj(a, b)
    for obj, k in _midias(doc):
        if obj[k].startswith("midias/"):
            obj[k] = os.path.join(pasta, obj[k]).replace("\\", "/")
    return {"success": True, "doc": doc, "path": os.path.abspath(caminho)}


def gravar_midia(data_url, nome="colado"):
    """imagem colada (Ctrl+V) ou arrastada sem caminho → arquivo em <raiz de dados>/Slider/colados"""
    cab, b64 = data_url.split(",", 1)
    ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "video/mp4": ".mp4"}.get(
        cab.split(";")[0].split(":")[-1], ".png")
    pasta = os.path.join(raiz_dados(), "Slider", "colados"); os.makedirs(pasta, exist_ok=True)
    dados = base64.b64decode(b64)
    base = re.sub(r"[^\w-]", "_", nome)[:30]
    caminho = os.path.join(pasta, f"{base}_{hashlib.sha1(dados).hexdigest()[:10]}{ext}")
    if not os.path.isfile(caminho):
        with open(caminho, "wb") as f:
            f.write(dados)
    return {"success": True, "path": caminho.replace("\\", "/")}


def gravar_imagem(caminho, data_url):
    """imagem do agente (folha de contato, foto de slide) num caminho escolhido"""
    b64 = data_url.split(",", 1)[1]
    os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    with open(caminho, "wb") as f:
        f.write(base64.b64decode(b64))
    return {"success": True, "path": caminho.replace("\\", "/")}


# ───────────────────────── exportar ─────────────────────────
def _pasta_job(job):
    p = os.path.join(tempfile.gettempdir(), "kanivete_slider", re.sub(r"[^\w-]", "", str(job))[:40] or "job")
    os.makedirs(p, exist_ok=True)
    return p


def quadro(job, i, data_url):
    """grava o quadro i (PNG/JPEG em data URL) do job de exportação"""
    cab, b64 = data_url.split(",", 1)
    ext = ".jpg" if "jpeg" in cab else ".png"
    nome = f"slide_{int(i):03d}" if str(i).isdigit() else "slide_" + re.sub(r"[^\w]", "", str(i))[:20]   # "003_a0012" = quadro de animação
    caminho = os.path.join(_pasta_job(job), nome + ext)
    with open(caminho, "wb") as f:
        f.write(base64.b64decode(b64))
    return {"success": True, "path": caminho}


def _quadros(job):
    p = _pasta_job(job)
    return sorted(os.path.join(p, f) for f in os.listdir(p) if re.fullmatch(r"slide_\d{3}\.(jpg|png)", f))


def _texto_puro(c):
    h = re.sub(r"<br\s*/?>|</(div|p)>", "\n", c.get("html") or _html.escape(c.get("texto") or ""), flags=re.I)
    return _html.unescape(re.sub(r"<[^>]+>", "", h)).strip()


def _pdf(qs, caminho, doc):
    """uma página por slide no tamanho do PowerPoint (1920 px = 960 pt), a foto do slide por cima e o TEXTO DE VERDADE
    invisível por baixo (buscar, selecionar e copiar funcionam), marcadores com o título de cada slide e metadados."""
    import fitz
    slides = [s for s in doc.get("slides", []) if not s.get("oculto")]
    W, H = float(doc.get("largura", 1920)) * .5, float(doc.get("altura", 1080)) * .5
    pdf, toc = fitz.open(), []
    for k, q in enumerate(qs):
        pg = pdf.new_page(width=W, height=H)
        s = slides[k] if k < len(slides) else {}
        titulo = ""
        for c in s.get("camadas", []):
            if c.get("tipo") != "texto" or c.get("oculto"):
                continue
            t = _texto_puro(c)
            if not t:
                continue
            titulo = titulo or t.split("\n")[0][:80]
            r = fitz.Rect(float(c.get("x", 0)) * .5, float(c.get("y", 0)) * .5, (float(c.get("x", 0)) + float(c.get("w", 100))) * .5, (float(c.get("y", 0)) + float(c.get("h", 40)) + 400) * .5)
            fz = max(4.0, float(c.get("tam", 40)) * .5)
            for _ in range(8):   # insert_textbox não escreve nada se não couber: diminui até caber
                if pg.insert_textbox(r, t, fontsize=fz, fontname="helv", render_mode=3, align={"centro": 1, "dir": 2, "just": 3}.get(c.get("alin"), 0)) >= 0:
                    break
                fz *= .8
        with open(q, "rb") as f:
            pg.insert_image(pg.rect, stream=f.read())
        toc.append([1, f"{k + 1}. {titulo}" if titulo else f"Slide {k + 1}", k + 1])
    pdf.set_toc(toc)
    pdf.set_metadata({"title": doc.get("nome") or "", "creator": "Slider Kanivete", "producer": "KANIVETE"})
    pdf.save(caminho, garbage=3, deflate=True)


def _ffmpeg():
    from Functions.midia import ffmpeg
    return ffmpeg()


def exportar(job, formato, caminho, doc=None, opcoes=None):
    """junta os quadros do job: pdf | png (pasta) | mp4 | pptx (imagens) | pptx_nativo (editável, usa doc)"""
    op = opcoes or {}
    qs = _quadros(job) if formato != "pptx_nativo" else []
    try:
        if formato == "pdf":
            if not qs:
                return {"success": False, "error": "nenhum slide"}
            _pdf(qs, caminho, doc or {})
        elif formato == "png":
            os.makedirs(caminho, exist_ok=True)
            base = op.get("base") or "slide"
            for k, q in enumerate(qs, 1):
                shutil.copyfile(q, os.path.join(caminho, f"{base}_{k:02d}{os.path.splitext(q)[1]}"))
        elif formato == "mp4":
            _mp4(qs, caminho, doc or {}, op)
        elif formato == "pptx":
            _pptx_imagens(qs, caminho, doc or {})
        elif formato == "pptx_nativo":
            avisos = pptx_nativo(doc, caminho)
            return {"success": True, "path": caminho, "avisos": avisos}
        else:
            return {"success": False, "error": f"formato desconhecido: {formato}"}
    finally:
        if formato != "pptx_nativo":
            shutil.rmtree(_pasta_job(job), ignore_errors=True)
    return {"success": True, "path": caminho}


def _mp4(qs, caminho, doc, op):
    """um trecho por slide (a foto parada, ou os quadros da animação + a foto final segurada) com os VÍDEOS das camadas
    tocando por cima no lugar deles (cobrir/caber/esticar, "começar em", repetir; o som entra se não estiver mudo),
    emendados com a transição de cada slide (xfade)."""
    from Functions.midia import probe
    slides = [s for s in doc.get("slides", []) if not s.get("oculto")] or [{}] * len(qs)
    fps = int(op.get("fps", 30))
    durs = [max(0.5, float((slides[k] if k < len(slides) else {}).get("dur") or op.get("dur", 5))) for k in range(len(qs))]
    XF = {"esmaecer": "fade", "deslizar": "slideleft", "empurrar": "slideleft", "zoom": "zoomin", "cobrir": "wipeleft",
          "subir": "slideup", "preto": "fadeblack", "revelar": "circleopen"}
    W, H = int(doc.get("largura", 1920)), int(doc.get("altura", 1080))
    cmd = [_ffmpeg(), "-y", "-hide_banner", "-loglevel", "error"]
    entradas, filtro = 0, ""
    for k, (q, d) in enumerate(zip(qs, durs)):
        s = slides[k] if k < len(slides) else {}
        n_anim = int(s.get("animQuadros") or 0)
        seq = os.path.join(os.path.dirname(q), f"slide_{k:03d}_a%04d" + os.path.splitext(q)[1])
        if n_anim and os.path.isfile(seq % 0):
            cmd += ["-framerate", str(fps), "-i", seq]
            resto = max(0.04, d - n_anim / fps)
            filtro += f"[{entradas}:v]scale={W}:{H},setsar=1,fps={fps},tpad=stop_mode=clone:stop_duration={resto:.3f},trim=duration={d:.3f},format=yuv420p[b{k}];"
        else:
            cmd += ["-loop", "1", "-framerate", str(fps), "-t", f"{d:.3f}", "-i", q]
            filtro += f"[{entradas}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},format=yuv420p[b{k}];"
        entradas += 1
        base = f"[b{k}]"
        for j, c in enumerate(c for c in s.get("camadas", []) if c.get("tipo") == "video" and not c.get("oculto") and c.get("src") and os.path.isfile(c["src"])):
            x, y, w, h = (int(round(float(c.get(n, 0)))) for n in ("x", "y", "w", "h"))
            w, h = max(2, w // 2 * 2), max(2, h // 2 * 2)
            if c.get("loop"):
                cmd += ["-stream_loop", "-1"]
            cmd += ["-ss", f"{max(0.0, float(c.get('ini') or 0)):.3f}", "-t", f"{d:.3f}", "-i", c["src"]]
            aj = c.get("ajuste", "cobrir")
            esc = (f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}" if aj == "cobrir"
                   else f"scale={w}:{h}:force_original_aspect_ratio=decrease" if aj == "conter" else f"scale={w}:{h}")
            ox, oy = (f"{x}+({w}-overlay_w)/2", f"{y}+({h}-overlay_h)/2") if aj == "conter" else (str(x), str(y))
            filtro += f"[{entradas}:v]{esc},setsar=1,fps={fps},format=yuva420p[m{k}_{j}];{base}[m{k}_{j}]overlay=x='{ox}':y='{oy}':eof_action=repeat:shortest=0,trim=duration={d:.3f}[o{k}_{j}];"
            base = f"[o{k}_{j}]"
            if not c.get("mudo") and (probe(c["src"]) or {}).get("audio"):
                c["_ain"] = entradas
            entradas += 1
        filtro += f"{base}null[v{k}];"
    # emendas com a transição, guardando onde cada slide começa (para o som dos vídeos)
    ini, ult, t = [0.0], "[v0]", durs[0]
    for k in range(1, len(qs)):
        tr = (slides[k] if k < len(slides) else {}).get("transicao") or {}
        tipo = XF.get(tr.get("tipo"), None)
        td = min(float(tr.get("dur", 0.5)), durs[k - 1] / 2, durs[k] / 2) if tipo else 0.04
        filtro += f"{ult}[v{k}]xfade=transition={tipo or 'fade'}:duration={td:.3f}:offset={t - td:.3f}[x{k}];"
        ini.append(t - td)
        ult, t = f"[x{k}]", t - td + durs[k]
    sons = []
    for k, s in enumerate(slides[:len(qs)]):
        for c in s.get("camadas", []):
            if c.get("_ain") is not None:
                ms = int(ini[k] * 1000)
                filtro += f"[{c['_ain']}:a]atrim=duration={durs[k]:.3f},afade=t=out:st={max(0, durs[k] - .3):.3f}:d=0.3,adelay={ms}|{ms},aresample=48000[a{len(sons)}];"
                sons.append(f"[a{len(sons)}]")
    mapa = ["-map", ult]
    if sons:
        filtro += f"{''.join(sons)}amix=inputs={len(sons)}:normalize=0:duration=longest,apad,atrim=duration={t:.3f}[aout];"
        mapa += ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-filter_complex", filtro.rstrip(";"), *mapa, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-tune", "stillimage" if not any(int(s.get("animQuadros") or 0) for s in slides) and not sons else "film",
            "-pix_fmt", "yuv420p", "-r", str(fps), "-movflags", "+faststart", "-t", f"{t:.3f}", caminho]
    r = subprocess.run(cmd, capture_output=True, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if r.returncode != 0:
        raise RuntimeError("ffmpeg: " + (r.stderr or "")[-600:])


def _prs(doc):
    from pptx import Presentation
    from pptx.util import Emu
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(int(doc.get("largura", 1920)) * PX_EMU), Emu(int(doc.get("altura", 1080)) * PX_EMU)
    return prs


def _pptx_imagens(qs, caminho, doc):
    prs = _prs(doc)
    slides = [s for s in doc.get("slides", []) if not s.get("oculto")]
    for k, q in enumerate(qs):
        sl = prs.slides.add_slide(prs.slide_layouts[6])
        sl.shapes.add_picture(q, 0, 0, prs.slide_width, prs.slide_height)
        notas = (slides[k] if k < len(slides) else {}).get("notas")
        if notas:
            sl.notes_slide.notes_text_frame.text = notas
    prs.save(caminho)


# ── PPTX editável ──
def _rgb(cor):
    from pptx.dml.color import RGBColor
    m = re.match(r"#?([0-9a-fA-F]{6})", str(cor or ""))
    if m:
        return RGBColor.from_string(m.group(1).upper()), 1.0
    m = re.match(r"rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?", str(cor or ""))
    if m:
        r, g, b = (int(float(v)) for v in m.groups()[:3])
        return RGBColor(r, g, b), float(m.group(4)) if m.group(4) else 1.0
    return None, 1.0


def _alpha(fill_el, a):
    """transparência do preenchimento (python-pptx não tem API): <a:alpha val=…/> dentro da cor"""
    if a >= 0.999:
        return
    from pptx.oxml.ns import qn
    from lxml import etree
    for clr in fill_el.iter(qn("a:srgbClr")):
        al = etree.SubElement(clr, qn("a:alpha")); al.set("val", str(int(max(0, min(1, a)) * 100000)))


def _runs_html(h):
    """html simples do texto (b, i, u, span color/font-size/font-weight, br, div/p) → parágrafos de trechos"""
    paras, cur = [[]], []
    pilha = [{}]
    for tok in re.split(r"(<[^>]+>)", h or ""):
        if not tok:
            continue
        if tok.startswith("<"):
            tag = re.match(r"</?\s*(\w+)", tok)
            nome = tag.group(1).lower() if tag else ""
            fecha = tok.startswith("</")
            if nome == "br" or (nome in ("div", "p") and not fecha and any(paras[-1])):
                paras.append([])
                if nome == "br":
                    continue
            if nome in ("div", "p") and fecha:
                continue
            if fecha:
                if len(pilha) > 1:
                    pilha.pop()
                continue
            st = dict(pilha[-1])
            if nome in ("b", "strong"): st["b"] = True
            if nome in ("i", "em"): st["i"] = True
            if nome == "u": st["u"] = True
            m = re.search(r'style="([^"]*)"', tok)
            if m:
                for dec in m.group(1).split(";"):
                    if ":" in dec:
                        k, v = (x.strip().lower() for x in dec.split(":", 1))
                        if k == "color": st["cor"] = v
                        elif k == "font-weight": st["b"] = v in ("bold", "600", "700", "800", "900")
                        elif k == "font-style": st["i"] = v == "italic"
                        elif k == "font-size" and v.endswith("px"): st["tam"] = float(v[:-2])
                        elif k == "text-decoration" and "underline" in v: st["u"] = True
            if not tok.endswith("/>"):
                pilha.append(st)
        else:
            paras[-1].append((_html.unescape(tok), dict(pilha[-1])))
    return paras


def pptx_nativo(doc, caminho):
    from pptx.util import Emu, Pt
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
    prs = _prs(doc)
    E = lambda v: Emu(int(round(float(v) * PX_EMU)))
    FORMAS = {"ret": MSO_SHAPE.RECTANGLE, "elipse": MSO_SHAPE.OVAL, "tri": MSO_SHAPE.ISOSCELES_TRIANGLE, "losango": MSO_SHAPE.DIAMOND,
              "estrela": MSO_SHAPE.STAR_5_POINT, "seta": MSO_SHAPE.RIGHT_ARROW, "balao": MSO_SHAPE.ROUNDED_RECTANGULAR_CALLOUT,
              "hexagono": MSO_SHAPE.HEXAGON, "coracao": MSO_SHAPE.HEART}
    ALIN = {"esq": PP_ALIGN.LEFT, "centro": PP_ALIGN.CENTER, "dir": PP_ALIGN.RIGHT, "just": PP_ALIGN.JUSTIFY}
    VAL = {"topo": MSO_ANCHOR.TOP, "meio": MSO_ANCHOR.MIDDLE, "base": MSO_ANCHOR.BOTTOM}
    from Functions import slider_pptx
    avisos = []
    W, H = float(doc.get("largura", 1920)), float(doc.get("altura", 1080))
    for s in doc.get("slides", []):
        if s.get("oculto"):
            continue
        sl = prs.slides.add_slide(prs.slide_layouts[6])
        efeitos, videos = [], []
        f = s.get("fundo") or {}
        if f.get("tipo") == "imagem" and f.get("img") and os.path.isfile(f["img"]):
            sl.shapes.add_picture(_img_otim(f["img"], W, H), 0, 0, prs.slide_width, prs.slide_height)
        elif f.get("tipo") == "degrade":
            fill = sl.background.fill; fill.gradient(); fill.gradient_angle = float(f.get("angulo", 90))
            st = fill.gradient_stops
            for k, cor in enumerate((f.get("cor", "#ffffff"), f.get("cor2", "#000000"))):
                c, _ = _rgb(cor)
                if c is not None:
                    st[k].color.rgb = c
        else:
            c, _ = _rgb(f.get("cor", "#ffffff"))
            if c is not None:
                sl.background.fill.solid(); sl.background.fill.fore_color.rgb = c
        for c in _todas(s.get("camadas", [])):
            if c.get("oculto") or c.get("tipo") == "grupo":
                continue
            x, y, w, h = (E(c.get(k, 0)) for k in ("x", "y", "w", "h"))
            sh = None
            t = c.get("tipo")
            if t == "texto":
                sh = sl.shapes.add_textbox(x, y, w, h)
                tf = sh.text_frame; tf.word_wrap = True
                tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
                tf.vertical_anchor = VAL.get(c.get("valin", "topo"), MSO_ANCHOR.TOP)
                cor0, _ = _rgb(c.get("cor", "#000000"))
                for k, par in enumerate(_runs_html(c.get("html") or _html.escape(c.get("texto", "")))):
                    p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
                    p.alignment = ALIN.get(c.get("alin", "esq"))
                    if c.get("entrelinha"):
                        p.line_spacing = float(c["entrelinha"])
                    for txt, st in par:
                        r = p.add_run(); r.text = txt.upper() if c.get("caixa") == "alta" else txt
                        r.font.name = c.get("fonte", "Inter"); r.font.size = Pt(float(st.get("tam", c.get("tam", 40))) * 0.5)
                        r.font.bold = st.get("b", int(c.get("peso", 400)) >= 600); r.font.italic = st.get("i", bool(c.get("italico")))
                        r.font.underline = st.get("u", bool(c.get("sublinhado")))
                        cr, _ = _rgb(st.get("cor")) if st.get("cor") else (cor0, 1)
                        if cr is not None:
                            r.font.color.rgb = cr
            elif t == "forma":
                tipo = c.get("forma", "ret")
                if tipo == "linha":
                    sh = sl.shapes.add_connector(1, x, y + E(c.get("h", 0)) // 2, x + w, y + E(c.get("h", 0)) // 2)
                    cr, _ = _rgb(c.get("traco") or c.get("preench") or "#000000")
                    if cr is not None:
                        sh.line.color.rgb = cr
                    sh.line.width = Pt(max(0.5, float(c.get("espessura", 4)) * 0.5))
                else:
                    mso = FORMAS.get(tipo, MSO_SHAPE.RECTANGLE)
                    if tipo == "ret" and float(c.get("raio", 0)) > 0:
                        mso = MSO_SHAPE.ROUNDED_RECTANGLE
                    sh = sl.shapes.add_shape(mso, x, y, w, h)
                    if mso == MSO_SHAPE.ROUNDED_RECTANGLE:
                        sh.adjustments[0] = min(0.5, float(c["raio"]) / max(1, min(float(c.get("w", 1)), float(c.get("h", 1)))))
                    cr, a = _rgb(c.get("preench"))
                    if cr is not None and c.get("preench") not in ("none", "transparent"):
                        sh.fill.solid(); sh.fill.fore_color.rgb = cr; _alpha(sh.fill._xPr, a * float(c.get("opac", 1)))
                    else:
                        sh.fill.background()
                    tr, _ = _rgb(c.get("traco")) if c.get("traco") and float(c.get("espessura", 0)) > 0 else (None, 1)
                    if tr is not None:
                        sh.line.color.rgb = tr; sh.line.width = Pt(float(c.get("espessura", 2)) * 0.5)
                    else:
                        sh.line.fill.background()
                    sh.shadow.inherit = False
            elif t == "grafico":
                try:
                    sh = _grafico_pptx(sl, c, x, y, w, h)
                except Exception as e:
                    avisos.append(f"gráfico {c.get('nome') or ''} não foi: {e}")
            elif t == "imagem" and c.get("src") and os.path.isfile(c["src"]):
                try:
                    sh = _figura(sl, {**c, "src": _img_otim(c["src"], float(c.get("w", 400)), float(c.get("h", 400)))}, x, y, w, h)
                except Exception as e:
                    avisos.append(f"imagem {os.path.basename(c['src'])} não foi ({e})")
            elif t == "video" and c.get("src") and os.path.isfile(c["src"]):
                src, dur = _video_pptx(c["src"])
                poster = _poster(c["src"], c.get("ini"))
                try:
                    sh = sl.shapes.add_movie(src, x, y, w, h, poster_frame_image=poster, mime_type="video/mp4")
                    videos.append((sh.shape_id, {"auto": c.get("auto", True), "loop": bool(c.get("loop")), "mudo": bool(c.get("mudo"))}, dur * 1000))
                except Exception as e:
                    avisos.append(f"vídeo como imagem: {os.path.basename(c['src'])} ({e})")
                    if poster:
                        sh = sl.shapes.add_picture(poster, x, y, w, h)
            if sh is not None and float(c.get("rot", 0)):
                sh.rotation = float(c["rot"]) % 360
            if sh is not None and (c.get("anim") or {}).get("tipo") not in (None, "", "nenhuma"):
                efeitos.append((sh.shape_id, c["anim"]))
            if c.get("sombra") or c.get("mescla"):
                avisos.append(f"{c.get('nome') or t}: sombra/mesclagem não vão para o PPTX editável")
        if s.get("notas"):
            sl.notes_slide.notes_text_frame.text = s["notas"]
        slider_pptx.transicao(sl._element, s.get("transicao"))
        slider_pptx.timing(sl._element, efeitos, videos)
    prs.core_properties.title = doc.get("nome") or ""
    prs.save(caminho)
    return sorted(set(avisos))


def _cache_pasta():
    p = os.path.join(tempfile.gettempdir(), "kanivete_slider", "cache")
    os.makedirs(p, exist_ok=True)
    return p


def _img_otim(src, w, h, fator=2.0):
    """imagem para o PPTX: no máximo 2× o tamanho em que aparece no slide (1920 de largura), JPEG 90 sem alfa / PNG com
    alfa; WEBP/BMP/AVIF viram PNG/JPEG (o PowerPoint antigo não lê); GIF e SVG passam como estão."""
    ext = os.path.splitext(src)[1].lower()
    if ext in (".gif", ".svg", ".emf", ".wmf"):
        return src
    try:
        from PIL import Image
        st = os.stat(src)
        saida = os.path.join(_cache_pasta(), hashlib.sha1(f"{src}|{st.st_mtime}|{int(w)}x{int(h)}".encode()).hexdigest()[:16])
        for e in (".jpg", ".png"):
            if os.path.isfile(saida + e):
                return saida + e
        im = Image.open(src)
        alvo = (max(64, int(w * fator)), max(64, int(h * fator)))
        grande = im.width > alvo[0] * 1.15 and im.height > alvo[1] * 1.15
        if not grande and ext in (".jpg", ".jpeg", ".png") and st.st_size < 3_000_000:
            return src
        k = max(alvo[0] / im.width, alvo[1] / im.height)   # "cobrir": o lado menor ainda cobre a caixa
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        alfa = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        if alfa:
            im.convert("RGBA").save(saida + ".png", optimize=True)
            return saida + ".png"
        im.convert("RGB").save(saida + ".jpg", quality=90, optimize=True, progressive=True)
        return saida + ".jpg"
    except Exception:
        return src


def _video_pptx(src):
    """(arquivo que o PowerPoint toca, duração em s): MP4 H.264/AAC passa direto; MOV/WEBM/MKV/HEVC viram MP4 (cache)."""
    from Functions.midia import probe
    p = probe(src) or {}
    dur = float(p.get("duracao") or 0) or 5.0
    ok = os.path.splitext(src)[1].lower() in (".mp4", ".m4v") and p.get("codec_video") in ("h264", "") and p.get("codec_audio") in ("aac", "", "mp3")
    if ok:
        return src, dur
    st = os.stat(src)
    saida = os.path.join(_cache_pasta(), hashlib.sha1(f"{src}|{st.st_mtime}".encode()).hexdigest()[:16] + ".mp4")
    if not os.path.isfile(saida):
        r = subprocess.run([_ffmpeg(), "-y", "-loglevel", "error", "-i", src, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                            "-vf", "scale=trunc(min(iw\\,1920)/2)*2:-2", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", saida],
                           capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if r.returncode != 0 or not os.path.isfile(saida):
            return src, dur
    return saida, dur


def _grafico_pptx(sl, c, x, y, w, h):
    """camada 'grafico' → gráfico NATIVO do PowerPoint (dados editáveis no Excel embutido). Anel, trilhas e waffle viram
    rosca/barra empilhada com o resto até o máximo (o mesmo desenho, editável)."""
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE as XT, XL_LEGEND_POSITION, XL_LABEL_POSITION
    from pptx.util import Pt
    tipo, rot = c.get("grafico", "colunas"), [str(r) for r in c.get("rotulos") or []]
    series = [s for s in c.get("series") or [] if s.get("valores") is not None]
    cores = c.get("cores") or ["#16b8a6", "#5b6b7c", "#0f1b2d"]
    tinta, _ = _rgb(c.get("corTexto") or "#222222")
    mx = float(c.get("max") or 100)
    cd = CategoryChartData()
    resto = tipo in ("progresso", "trilhas", "waffle")
    if resto:   # valor + o que falta até o máximo
        vs = [float(v or 0) for v in (series[0]["valores"] if series else [])]
        cd.categories = rot or [""] * len(vs)
        cd.add_series(series[0].get("nome") or "Valor" if series else "Valor", vs)
        cd.add_series("Falta", [max(0.0, mx - v) for v in vs])
        if tipo != "trilhas":   # rosca: uma por categoria não existe; usa a 1ª
            cd = CategoryChartData(); cd.categories = ["Valor", "Falta"]; cd.add_series(rot[0] if rot else "Valor", [vs[0] if vs else 0, max(0.0, mx - (vs[0] if vs else 0))])
    else:
        cd.categories = rot
        for s in (series[:1] if tipo in ("pizza", "rosca", "funil") else series):
            cd.add_series(s.get("nome") or "Série", [float(v or 0) for v in s["valores"]])
    XL = {"colunas": XT.COLUMN_CLUSTERED, "barras": XT.BAR_CLUSTERED, "empilhadas": XT.COLUMN_STACKED, "linha": XT.LINE_MARKERS if c.get("pontos") else XT.LINE,
          "area": XT.AREA, "pizza": XT.PIE, "rosca": XT.DOUGHNUT, "funil": XT.BAR_CLUSTERED, "progresso": XT.DOUGHNUT, "waffle": XT.DOUGHNUT, "trilhas": XT.BAR_STACKED}
    gf = sl.shapes.add_chart(XL.get(tipo, XT.COLUMN_CLUSTERED), x, y, w, h, cd)
    ch = gf.chart
    ch.font.size = Pt(max(8.0, float(c.get("tamTexto") or 22) * 0.5)); ch.font.name = c.get("fonte") or "Inter"
    if tinta is not None:
        ch.font.color.rgb = tinta
    leg = bool(c.get("legenda")) and tipo not in ("progresso", "trilhas", "waffle", "funil")
    ch.has_legend = leg
    if leg:
        ch.legend.position = XL_LEGEND_POSITION.RIGHT if tipo in ("pizza", "rosca") else XL_LEGEND_POSITION.TOP
        ch.legend.include_in_layout = False
    plot = ch.plots[0]
    por_ponto = tipo in ("pizza", "rosca", "funil", "progresso", "waffle")
    for k, s in enumerate(plot.series):
        if por_ponto:
            for i in range(len(rot) if tipo in ("pizza", "rosca", "funil") else 2):
                pt = s.points[i]; pt.format.fill.solid()
                cr, _ = _rgb(cores[(i if tipo != "funil" else 0) % len(cores)] if not (resto and i == 1) else "#d9dde2")
                if cr is not None:
                    pt.format.fill.fore_color.rgb = cr
        else:
            cr, _ = _rgb((series[k].get("cor") if k < len(series) else None) or (cores[k % len(cores)] if not (resto and k == 1) else "#d9dde2"))
            if cr is not None:
                if tipo == "linha":
                    s.format.line.color.rgb = cr; s.format.line.width = Pt(float(c.get("espessura") or 5) * 0.5); s.smooth = bool(c.get("suave"))
                else:
                    s.format.fill.solid(); s.format.fill.fore_color.rgb = cr
    if c.get("valores") or tipo in ("progresso", "waffle"):
        plot.has_data_labels = True
        dl = plot.data_labels; dl.font.size = ch.font.size
        suf = c.get("sufixo") or ""
        dl.number_format = f'{c.get("prefixo") or ""}#,##0{"." + "0" * int(c["casas"]) if c.get("casas") else ""}{suf.replace("%", chr(92) + "%")}'
        dl.number_format_is_linked = False
        if tipo in ("colunas", "barras", "funil"):
            try:
                dl.position = XL_LABEL_POSITION.OUTSIDE_END
            except Exception:
                pass
    if tipo in ("colunas", "barras", "empilhadas", "linha", "area", "funil", "trilhas"):
        try:
            va = ch.value_axis; va.has_major_gridlines = bool(c.get("grade")); va.visible = bool(c.get("grade"))
            if tipo == "trilhas":
                va.maximum_scale = mx
            ca = ch.category_axis; ca.tick_labels.font.size = ch.font.size
            if tipo in ("barras", "funil", "trilhas"):
                ca.reverse_order = True   # PowerPoint desenha barras de baixo para cima
            if tipo in ("colunas", "barras", "empilhadas", "trilhas", "funil"):
                plot.gap_width = 60
                if tipo in ("empilhadas", "trilhas"):
                    plot.overlap = 100
        except Exception:
            pass
    if tipo in ("rosca", "progresso", "waffle"):
        try:
            from lxml import etree
            hs = plot._element.find("{http://schemas.openxmlformats.org/drawingml/2006/chart}holeSize")
            if hs is not None:
                hs.set("val", str(int(max(10, min(90, float(c.get("buraco") or (1 - float(c.get("espessura") or 0.15) * 2)) * 100)))))
        except Exception:
            pass
    return gf


def _figura(sl, c, x, y, w, h):
    """imagem com o ajuste da camada: cobrir = recorte (crop) como o object-fit: cover"""
    from PIL import Image
    pic = sl.shapes.add_picture(c["src"], x, y, w, h)
    if c.get("ajuste", "cobrir") == "cobrir":
        try:
            iw, ih = Image.open(c["src"]).size
            caixa, img = float(c["w"]) / float(c["h"]), iw / ih
            if img > caixa:
                corte = (1 - caixa / img) / 2; pic.crop_left = pic.crop_right = corte
            elif img < caixa:
                corte = (1 - img / caixa) / 2; pic.crop_top = pic.crop_bottom = corte
        except Exception:
            pass
    return pic


def _poster(video, ini=None):
    """quadro do vídeo em JPEG (capa no PPTX): o mesmo "começar em" da camada"""
    t = max(0.05, float(ini or 0.5))
    saida = os.path.join(tempfile.gettempdir(), "kanivete_slider", "poster_" + hashlib.sha1(f"{video}|{t}".encode()).hexdigest()[:10] + ".jpg")
    os.makedirs(os.path.dirname(saida), exist_ok=True)
    if not os.path.isfile(saida):
        subprocess.run([_ffmpeg(), "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", "-q:v", "3", saida],
                       capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return saida if os.path.isfile(saida) else None


# ───────────────────────── importar PDF ─────────────────────────
def importar_pdf(caminho, max_paginas=200):
    """PDF → slides, uma página por slide, em CAMADAS: fundo (o desenho da página sem os textos e sem as fotos, em alta),
    cada foto como camada de imagem e cada bloco de texto como texto editável (fonte, tamanho, cor, negrito/itálico).
    Página escaneada (sem texto) entra só como imagem de fundo."""
    import fitz
    pdf = fitz.open(caminho)
    pasta = os.path.join(raiz_dados(), "Slider", "pdf_" + hashlib.sha1(f"{os.path.abspath(caminho)}|{os.path.getmtime(caminho)}".encode()).hexdigest()[:10])
    os.makedirs(pasta, exist_ok=True)
    p0 = pdf[0].rect
    LARG = 1920
    ALT = int(round(LARG * p0.height / p0.width))
    relat, slides = [], []
    for n, pg in enumerate(pdf):
        if n >= max_paginas:
            relat.append(f"só as primeiras {max_paginas} páginas")
            break
        k = LARG / pg.rect.width
        camadas = []
        # imagens (posição de cada uso na página)
        imgs = []
        for info in pg.get_image_info(xrefs=True):
            b = fitz.Rect(info["bbox"]) & pg.rect
            if b.is_empty or b.width * k < 24 or b.height * k < 24 or not info.get("xref"):
                continue
            try:
                pix = fitz.Pixmap(pdf, info["xref"])
                sm = pdf.xref_get_key(info["xref"], "SMask")
                if sm[0] == "xref":
                    pix = fitz.Pixmap(pix, fitz.Pixmap(pdf, int(sm[1].split()[0])))
                if pix.colorspace and pix.colorspace.n not in (1, 3):
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                arq = os.path.join(pasta, f"p{n + 1:03d}_img{len(imgs):02d}.png")
                pix.save(arq)
                imgs.append((b, arq))
            except Exception as e:
                relat.append(f"página {n + 1}: imagem não lida ({e})")
        # textos: um bloco do PDF = uma camada (trechos com cor/tamanho/negrito próprios)
        textos = []
        for bl in pg.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]:
            if bl.get("type") != 0:
                continue
            linhas, tams, cores, fontes = [], [], [], []
            for ln in bl["lines"]:
                if ln.get("dir", (1, 0)) != (1, 0) and abs(ln["dir"][1]) > .05:
                    continue   # texto girado fica no fundo
                partes = []
                for sp in ln["spans"]:
                    t = sp["text"]
                    if not t.strip() and not partes:
                        continue
                    tams.append(sp["size"]); cores.append(sp["color"]); fontes.append(sp["font"])
                    partes.append((t, sp))
                if partes:
                    linhas.append(partes)
            if not linhas:
                continue
            tam0 = max(set(tams), key=tams.count); cor0 = max(set(cores), key=cores.count); fonte0 = max(set(fontes), key=fontes.count)
            hx = lambda v: "#%06x" % v
            html = []
            for partes in linhas:
                h = ""
                for t, sp in partes:
                    e = _html.escape(t)
                    st = []
                    if sp["color"] != cor0: st.append(f"color:{hx(sp['color'])}")
                    if abs(sp["size"] - tam0) > .6: st.append(f"font-size:{sp['size'] * k:.0f}px")
                    if st: e = f'<span style="{";".join(st)}">{e}</span>'
                    bold, ital = bool(sp["flags"] & 16) or "bold" in sp["font"].lower(), bool(sp["flags"] & 2) or "italic" in sp["font"].lower()
                    b0 = "bold" in fonte0.lower() or "black" in fonte0.lower()
                    if bold and not b0: e = f"<b>{e}</b>"
                    if ital: e = f"<i>{e}</i>"
                    h += e
                html.append(h.rstrip())
            r = fitz.Rect(bl["bbox"])
            fam = re.sub(r"^[A-Z]{6}\+", "", fonte0).split("-")[0].split(",")[0]
            fam = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", fam).replace("MT", "").strip() or "Arial"
            peso = 700 if re.search(r"bold|black|heavy", fonte0, re.I) else 600 if re.search(r"semi|demi", fonte0, re.I) else 300 if re.search(r"light|thin", fonte0, re.I) else 400
            alt_l = (r.height / len(linhas)) / tam0 if len(linhas) > 1 else 1.2
            textos.append(r)
            camadas.append({"id": uuid.uuid4().hex[:8], "nome": re.sub(r"<[^>]+>", "", html[0])[:30] or "Texto", "tipo": "texto", "html": "<br>".join(html),
                            "x": round(r.x0 * k, 1), "y": round(r.y0 * k, 1), "w": round(r.width * k + 6, 1), "h": round(r.height * k + 4, 1), "rot": 0, "opac": 1,
                            "fonte": fam, "tam": round(tam0 * k, 1), "peso": peso, "cor": hx(cor0), "alin": "esq", "valin": "topo",
                            "entrelinha": round(max(.8, min(2.2, alt_l)), 2)})
        # fundo: a página sem os textos que viraram camada e sem as fotos
        fundo_png = os.path.join(pasta, f"p{n + 1:03d}_fundo.jpg")
        try:
            tmp = fitz.open(); tmp.insert_pdf(pdf, from_page=n, to_page=n); tp = tmp[0]
            for r in textos:
                tp.add_redact_annot(r, fill=False)
            if textos:
                tp.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=getattr(fitz, "PDF_REDACT_LINE_ART_NONE", 0))
            for b, _ in imgs:
                tp.add_redact_annot(b, fill=False)
            if imgs:
                tp.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE, graphics=getattr(fitz, "PDF_REDACT_LINE_ART_NONE", 0))
            tp.get_pixmap(matrix=fitz.Matrix(k * 1.5, k * 1.5), alpha=False).pil_save(fundo_png, quality=90)
        except Exception as e:
            relat.append(f"página {n + 1}: fundo inteiro ({e})")
            pg.get_pixmap(matrix=fitz.Matrix(k * 1.5, k * 1.5), alpha=False).pil_save(fundo_png, quality=90)
            camadas = [c for c in camadas if c["tipo"] != "texto"]
        fotos = [{"id": uuid.uuid4().hex[:8], "nome": f"Imagem {i + 1}", "tipo": "imagem", "src": arq.replace("\\", "/"), "x": round(b.x0 * k, 1), "y": round(b.y0 * k, 1),
                  "w": round(b.width * k, 1), "h": round(b.height * k, 1), "rot": 0, "opac": 1, "ajuste": "esticar"} for i, (b, arq) in enumerate(imgs)]
        slides.append({"id": uuid.uuid4().hex[:8], "fundo": {"tipo": "imagem", "img": fundo_png.replace("\\", "/"), "ajuste": "esticar"},
                       "transicao": {"tipo": "nenhuma", "dur": 0.5}, "dur": 5, "notas": "", "camadas": fotos + camadas})
    nome = os.path.splitext(os.path.basename(caminho))[0]
    return {"success": True, "doc": {"nome": nome, "largura": LARG, "altura": ALT, "slides": slides}, "relatorio": relat}


# ───────────────────────── importar PPTX ─────────────────────────
def importar_pptx(caminho):
    """PPTX → documento do Slider (coordenadas no slide de 1920 px de largura), respeitando páginas e camadas:
    textos (trechos com negrito/itálico/cor/tamanho; cores e fontes do TEMA resolvidas), formas, imagens (com o recorte
    do PowerPoint), grupos (com a escala do grupo), tabelas, GRÁFICOS (viram gráficos editáveis), VÍDEOS (tocar sozinho,
    repetir, mudo), fundo (cor, degradê ou foto; herdado do layout/mestre), enfeites do layout/mestre (travados, embaixo),
    notas, transições e animações de entrada (Functions/slider_pptx.py)."""
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    from pptx.enum.text import PP_ALIGN
    from pptx.opc.constants import RELATIONSHIP_TYPE as RT
    from Functions import slider_pptx
    from lxml import etree
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    PN = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
    RN = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    prs = Presentation(caminho)
    k = 1920 / prs.slide_width
    H = int(round(prs.slide_height * k))
    pasta = os.path.join(raiz_dados(), "Slider", "importado_" + hashlib.sha1(f"{os.path.abspath(caminho)}|{os.path.getmtime(caminho)}".encode()).hexdigest()[:10])
    os.makedirs(pasta, exist_ok=True)
    ALIN = {PP_ALIGN.CENTER: "centro", PP_ALIGN.RIGHT: "dir", PP_ALIGN.JUSTIFY: "just"}
    AUTO = {1: "ret", 5: "ret", 9: "elipse", 7: "tri", 4: "losango", 92: "estrela", 33: "seta", 10: "hexagono", 21: "coracao", 105: "balao", 106: "balao"}
    relat, slides = [], []
    cont = [0]

    def gravar(blob, ext, nome="m"):
        cont[0] += 1
        arq = os.path.join(pasta, f"{cont[0]:03d}_{re.sub(r'[^\w-]', '_', nome)[:20]}.{ext.lstrip('.')}")
        with open(arq, "wb") as f:
            f.write(blob)
        return arq.replace("\\", "/")

    # tema: cores (dk1/lt1/accent1..6) e fontes (títulos/textos)
    tema_cor, tema_fonte = {}, {"mj": None, "mn": None}
    try:
        th = etree.fromstring(prs.slide_master.part.part_related_by(RT.THEME).blob)
        for el in th.find(f".//{A}clrScheme"):
            v = el.find(f"{A}srgbClr")
            v = v.get("val") if v is not None else (el.find(f"{A}sysClr").get("lastClr") if el.find(f"{A}sysClr") is not None else None)
            if v:
                tema_cor[etree.QName(el).localname] = "#" + v.lower()
        for q, nm in (("majorFont", "mj"), ("minorFont", "mn")):
            lt = th.find(f".//{A}{q}/{A}latin")
            if lt is not None and lt.get("typeface"):
                tema_fonte[nm] = lt.get("typeface")
    except Exception:
        pass
    TEMA_NOME = {"TEXT_1": "dk1", "DARK_1": "dk1", "BACKGROUND_1": "lt1", "LIGHT_1": "lt1", "TEXT_2": "dk2", "DARK_2": "dk2",
                 "BACKGROUND_2": "lt2", "LIGHT_2": "lt2", "HYPERLINK": "hlink", "FOLLOWED_HYPERLINK": "folHlink",
                 **{f"ACCENT_{i}": f"accent{i}" for i in range(1, 7)}}

    def cor_de(fmt):
        try:
            if fmt.type is None:
                return None
            if fmt.type == 1 and fmt.rgb is not None:     # RGB
                return "#" + str(fmt.rgb).lower()
            if fmt.type == 2:                               # SCHEME (cor do tema)
                nome = str(fmt.theme_color).split()[0].split(".")[-1]
                return tema_cor.get(TEMA_NOME.get(nome, "")) or None
        except Exception:
            return None
        return None

    def fonte_de(nome, titulo=False):
        if not nome or nome.startswith("+mn"):
            return tema_fonte["mn"] if not titulo or not tema_fonte["mj"] else tema_fonte["mj"]
        if nome.startswith("+mj"):
            return tema_fonte["mj"] or tema_fonte["mn"]
        return nome

    def fundo_de(parte_el, parte):
        """<p:bg> da parte (slide/layout/mestre) → fundo do Slider, ou None se herda"""
        bg = parte_el.find(f"{PN}cSld/{PN}bg")
        if bg is None:
            return None
        pr = bg.find(f"{PN}bgPr")
        if pr is None:
            ref = bg.find(f"{PN}bgRef")
            c = ref.find(f"{A}schemeClr") if ref is not None else None
            return {"tipo": "cor", "cor": tema_cor.get({"bg1": "lt1", "bg2": "lt2", "tx1": "dk1", "tx2": "dk2"}.get(c.get("val"), c.get("val")), "#ffffff")} if c is not None else None

        def cor_xml(el):
            if el is None:
                return None
            s = el.find(f"{A}srgbClr")
            if s is not None:
                return "#" + s.get("val").lower()
            s = el.find(f"{A}schemeClr")
            if s is not None:
                return tema_cor.get({"bg1": "lt1", "bg2": "lt2", "tx1": "dk1", "tx2": "dk2"}.get(s.get("val"), s.get("val")))
            return None
        sol = pr.find(f"{A}solidFill")
        if sol is not None:
            return {"tipo": "cor", "cor": cor_xml(sol) or "#ffffff"}
        grad = pr.find(f"{A}gradFill")
        if grad is not None:
            gs = grad.findall(f".//{A}gs")
            if gs:
                lin = grad.find(f"{A}lin")
                return {"tipo": "degrade", "cor": cor_xml(gs[0]) or "#ffffff", "cor2": cor_xml(gs[-1]) or "#000000",
                        "angulo": (int(lin.get("ang", 0)) / 60000 + 90) % 360 if lin is not None else 180}
        blip = pr.find(f".//{A}blip")
        if blip is not None and blip.get(f"{RN}embed"):
            try:
                img = parte.related_part(blip.get(f"{RN}embed"))
                return {"tipo": "imagem", "img": gravar(img.blob, img.partname.ext, "fundo"), "ajuste": "cobrir", "escurecer": 0}
            except Exception:
                return None
        return None

    def recorte(arq, sh):
        """o recorte (crop) da imagem no PowerPoint vira um arquivo já recortado"""
        try:
            cl, cr, ct, cb = (float(getattr(sh, n) or 0) for n in ("crop_left", "crop_right", "crop_top", "crop_bottom"))
        except Exception:
            return arq
        if max(abs(cl), abs(cr), abs(ct), abs(cb)) < 0.001 or arq.lower().endswith((".gif", ".svg", ".emf", ".wmf")):
            return arq
        from PIL import Image
        im = Image.open(arq)
        L, T = int(im.width * max(0, cl)), int(im.height * max(0, ct))
        R, B = int(im.width * (1 - max(0, cr))), int(im.height * (1 - max(0, cb)))
        if R - L > 4 and B - T > 4:
            novo = os.path.splitext(arq)[0] + "_rec" + (".png" if im.mode in ("RGBA", "LA", "P") else ".jpg")
            im.crop((L, T, R, B)).save(novo, quality=92) if novo.endswith(".jpg") else im.crop((L, T, R, B)).save(novo)
            return novo.replace("\\", "/")
        return arq

    def grafico_de(sh, base):
        ch = sh.chart
        nome = str(ch.chart_type).split()[0].split(".")[-1]
        tipo = ("empilhadas" if "STACKED" in nome and "COLUMN" in nome else "colunas" if nome.startswith("COLUMN") or nome.startswith("THREE_D_COLUMN")
                else "barras" if nome.startswith("BAR") or nome.startswith("THREE_D_BAR") else "linha" if nome.startswith("LINE")
                else "area" if nome.startswith("AREA") else "pizza" if "PIE" in nome else "rosca" if "DOUGHNUT" in nome else "colunas")
        plot = ch.plots[0]
        rot = [str(c) for c in plot.categories]
        series, cores = [], []
        for s in plot.series:
            vs = [float(v) if v is not None else 0 for v in s.values]
            item = {"nome": s.name or f"Série {len(series) + 1}", "valores": vs}
            try:
                if s.format.fill.type == 1:
                    item["cor"] = cor_de(s.format.fill.fore_color)
            except Exception:
                pass
            series.append(item)
        if tipo in ("pizza", "rosca") and series:
            try:
                for i in range(len(rot)):
                    pf = plot.series[0].points[i].format.fill
                    cores.append(cor_de(pf.fore_color) if pf.type == 1 else None)
            except Exception:
                cores = []
        c = {**base, "tipo": "grafico", "grafico": tipo, "rotulos": rot, "series": series, "legenda": bool(ch.has_legend),
             "valores": bool(getattr(plot, "has_data_labels", False)), "grade": tipo in ("colunas", "empilhadas", "linha", "area", "barras")}
        if cores and all(cores):
            c["cores"] = cores
        try:
            c["fonte"] = ch.font.name or None
            if ch.font.size:
                c["tamTexto"] = round(ch.font.size.pt * 2)
        except Exception:
            pass
        return c

    def midia_de(sh, base):
        el = sh._element
        vf = el.find(f".//{A}videoFile")
        af = el.find(f".//{A}audioFile")
        rid = None
        for e in el.iter():
            if etree.QName(e).localname == "media" and e.get(f"{RN}embed"):
                rid = e.get(f"{RN}embed")
        rid = rid or (vf.get(f"{RN}link") if vf is not None else None)
        if af is not None and vf is None:
            relat.append(f"áudio não importado: {sh.name}")
            return None
        try:
            parte = sh.part.related_part(rid)
            arq = gravar(parte.blob, parte.partname.ext, sh.name)
        except Exception as e:
            relat.append(f"vídeo não lido: {sh.name} ({e})")
            return None
        return {**base, "tipo": "video", "src": arq, "ajuste": "esticar", "auto": False, "loop": False, "mudo": False, "raio": 0}

    def camadas_de(shapes, tf=(0, 0, 1, 1), trava=False, prefixo=""):
        """tf = (dx, dy, sx, sy): coordenadas do grupo (chOff/chExt) → slide, em EMU"""
        out = []
        for sh in shapes:
            if trava and getattr(sh, "is_placeholder", False):
                continue
            try:
                if sh.left is None or sh.width is None:
                    continue
                X, Y = tf[0] + sh.left * tf[2], tf[1] + sh.top * tf[3]
                x, y, w, h = X * k, Y * k, sh.width * tf[2] * k, sh.height * tf[3] * k
            except Exception:
                continue
            base = {"id": uuid.uuid4().hex[:8], "nome": prefixo + (sh.name or ""), "x": round(x, 1), "y": round(y, 1), "w": round(max(w, 4), 1),
                    "h": round(max(h, 4), 1), "rot": round(float(getattr(sh, "rotation", 0) or 0), 2), "opac": 1, "_spid": str(sh.shape_id)}
            if trava:
                base["trava"] = True
            st = sh.shape_type
            if st == MSO_SHAPE_TYPE.GROUP:
                try:
                    xf = sh._element.grpSpPr.find(f"{A}xfrm")
                    off, ext, choff, chext = (xf.find(f"{A}{n}") for n in ("off", "ext", "chOff", "chExt"))
                    sx = int(ext.get("cx")) / max(1, int(chext.get("cx"))) * tf[2]
                    sy = int(ext.get("cy")) / max(1, int(chext.get("cy"))) * tf[3]
                    ox = tf[0] + int(off.get("x")) * tf[2] - int(choff.get("x")) * sx
                    oy = tf[1] + int(off.get("y")) * tf[3] - int(choff.get("y")) * sy
                    filhos = camadas_de(sh.shapes, (ox, oy, sx, sy), trava, prefixo)
                except Exception:
                    filhos = camadas_de(sh.shapes, tf, trava, prefixo)
                g = uuid.uuid4().hex[:8]
                for c in filhos:
                    c.setdefault("grupo", g)
                out += filhos
                continue
            if getattr(sh, "has_chart", False) and sh.has_chart:
                try:
                    out.append(grafico_de(sh, base))
                except Exception as e:
                    relat.append(f"gráfico não lido: {sh.name} ({e})")
                continue
            if st == MSO_SHAPE_TYPE.MEDIA:
                c = midia_de(sh, base)
                if c:
                    out.append(c)
                continue
            if st == MSO_SHAPE_TYPE.PICTURE or (hasattr(sh, "image") and st != MSO_SHAPE_TYPE.MEDIA):
                try:
                    img = sh.image
                    arq = recorte(gravar(img.blob, img.ext, sh.name), sh)
                    out.append({**base, "tipo": "imagem", "src": arq, "ajuste": "esticar"})
                except Exception as e:
                    relat.append(f"imagem não lida: {sh.name} ({e})")
                continue
            if getattr(sh, "has_table", False) and sh.has_table:   # tabela → células (forma + texto) num grupo
                g = uuid.uuid4().hex[:8]; tb = sh.table
                cws = [c.width * tf[2] * k for c in tb.columns]; rhs = [r.height * tf[3] * k for r in tb.rows]
                yy = y
                for i, row in enumerate(tb.rows):
                    xx = x
                    for j, cell in enumerate(row.cells):
                        cor = None
                        try:
                            if cell.fill.type in (1, 2):
                                cor = cor_de(cell.fill.fore_color)
                        except Exception:
                            pass
                        cab = i == 0
                        out.append({"id": uuid.uuid4().hex[:8], "nome": f"Célula {i + 1}.{j + 1}", "tipo": "forma", "forma": "ret", "x": round(xx, 1), "y": round(yy, 1),
                                    "w": round(cws[j], 1), "h": round(rhs[i], 1), "rot": 0, "opac": 1, "preench": cor or (tema_cor.get("accent1", "#2f6fed") if cab else "#eef2fb" if i % 2 else "#ffffff"),
                                    "traco": "#d0d7e5", "espessura": 2, "raio": 0, "grupo": g})
                        txt = "<br>".join(_html.escape(p.text) for p in cell.text_frame.paragraphs)
                        fz = next((r.font.size.pt * 2 for p in cell.text_frame.paragraphs for r in p.runs if r.font.size), 32)
                        out.append({"id": uuid.uuid4().hex[:8], "nome": f"Texto {i + 1}.{j + 1}", "tipo": "texto", "html": txt, "x": round(xx + 16, 1), "y": round(yy, 1),
                                    "w": round(cws[j] - 32, 1), "h": round(rhs[i], 1), "rot": 0, "opac": 1, "fonte": fonte_de(None), "tam": round(fz), "peso": 700 if cab else 400,
                                    "cor": "#ffffff" if cab and not cor else "#1a1a1a", "alin": "esq", "valin": "meio", "entrelinha": 1.15, "grupo": g})
                        xx += cws[j]
                    yy += rhs[i]
                continue
            cor_forma = None
            try:
                if sh.fill.type in (1, 2):
                    cor_forma = cor_de(sh.fill.fore_color)
            except Exception:
                pass
            tem_texto = getattr(sh, "has_text_frame", False) and sh.text_frame.text.strip()
            if st == MSO_SHAPE_TYPE.AUTO_SHAPE and not tem_texto:
                try:
                    tipo = AUTO.get(int(sh.auto_shape_type), "ret")
                except Exception:
                    tipo = "ret"
                traco, esp = None, 0
                try:
                    if sh.line.fill.type in (1, 2):
                        traco = cor_de(sh.line.color); esp = round((sh.line.width or 12700) / 12700 * 2, 1)
                except Exception:
                    pass
                out.append({**base, "tipo": "forma", "forma": tipo, "preench": cor_forma or ("none" if traco else "#d9d9d9"), "traco": traco, "espessura": esp, "raio": 0})
                continue
            if st == MSO_SHAPE_TYPE.LINE or (st == MSO_SHAPE_TYPE.FREEFORM and not tem_texto):
                try:
                    cor_l = cor_de(sh.line.color) or "#000000"
                    esp = round((sh.line.width or 12700) / 12700 * 2, 1)
                except Exception:
                    cor_l, esp = "#000000", 2
                if st == MSO_SHAPE_TYPE.LINE:
                    out.append({**base, "tipo": "forma", "forma": "linha", "traco": cor_l, "espessura": esp, "h": max(base["h"], esp * 2)})
                else:
                    relat.append(f"desenho livre como retângulo: {sh.name}")
                    out.append({**base, "tipo": "forma", "forma": "ret", "preench": cor_forma or "none", "traco": cor_l, "espessura": esp})
                continue
            if tem_texto:
                if cor_forma:
                    out.append({**base, "id": uuid.uuid4().hex[:8], "nome": base["nome"] + " (fundo)", "tipo": "forma", "forma": "ret",
                                "preench": cor_forma, "traco": None, "espessura": 0, "raio": 0, "_spid": None})
                # o que o modelo do PowerPoint dá por herança (tamanho, centralizado, marcador) quando o texto não diz
                ph = None
                try:
                    ph = int(sh.placeholder_format.type) if sh.is_placeholder else None
                except Exception:
                    ph = None
                TIT, CTIT, SUB, CORPO = 1, 3, 4, (2, 7)   # PP_PLACEHOLDER: TITLE, CENTER_TITLE, SUBTITLE, BODY/OBJECT
                titulo = ph in (TIT, CTIT)
                tam_ph = {TIT: 88, CTIT: 120, SUB: 48}.get(ph, 56 if ph in CORPO else None)
                partes, tam0, fonte0, alin0, cor0, negr = [], None, None, "centro" if ph in (CTIT, SUB) else "esq", None, []
                for p in sh.text_frame.paragraphs:
                    alin0 = ALIN.get(p.alignment, alin0) if p.alignment is not None else alin0
                    linha = ["&nbsp;&nbsp;&nbsp;&nbsp;" * int(p.level or 0) + "• "] if ph in CORPO and p.text.strip() else []
                    for r in p.runs:
                        t = _html.escape(r.text)
                        if not t:
                            continue
                        fz = r.font.size.pt * 2 if r.font.size else None
                        tam0 = tam0 or fz; fonte0 = fonte0 or r.font.name
                        cor = cor_de(r.font.color) if r.font.color else None
                        cor0 = cor0 or cor
                        negr.append(bool(r.font.bold))
                        estilo = []
                        if cor and cor != cor0: estilo.append(f"color:{cor}")
                        if fz and tam0 and abs(fz - tam0) > 0.5: estilo.append(f"font-size:{fz:.0f}px")
                        if estilo: t = f'<span style="{";".join(estilo)}">{t}</span>'
                        if r.font.bold and not all(negr): t = f"<b>{t}</b>"
                        if r.font.italic: t = f"<i>{t}</i>"
                        if r.font.underline: t = f"<u>{t}</u>"
                        linha.append(t)
                    partes.append("".join(linha))
                tudo_negrito = negr and all(negr)
                out.append({**base, "tipo": "texto", "html": "<br>".join(partes).replace("<b>", "").replace("</b>", "") if tudo_negrito else "<br>".join(partes),
                            "fonte": fonte_de(fonte0, titulo) or "Calibri", "tam": round(tam0 or tam_ph or 36),
                            "peso": 700 if tudo_negrito else 400, "cor": cor0 or tema_cor.get("dk1") or "#1a1a1a", "alin": alin0,
                            "valin": "meio" if titulo else "topo", "entrelinha": 1.15})
                continue
            if st not in (MSO_SHAPE_TYPE.PLACEHOLDER,):
                relat.append(f"não importado: {sh.name} ({st})")
        return out

    for n, s in enumerate(prs.slides, 1):
        lay, mestre = s.slide_layout, s.slide_layout.slide_master
        fundo = fundo_de(s._element, s.part) or fundo_de(lay._element, lay.part) or fundo_de(mestre._element, mestre.part) or {"tipo": "cor", "cor": tema_cor.get("lt1", "#ffffff")}
        notas = ""
        try:
            if s.has_notes_slide:
                notas = s.notes_slide.notes_text_frame.text
        except Exception:
            pass
        camadas = []
        # enfeites do mestre e do layout (logo, faixa, rodapé desenhado) — embaixo e travados, como no PowerPoint
        if s._element.get("showMasterSp") not in ("0", "false"):
            if lay._element.get("showMasterSp") not in ("0", "false"):
                camadas += camadas_de(mestre.shapes, trava=True, prefixo="Mestre: ")
            camadas += camadas_de(lay.shapes, trava=True, prefixo="Layout: ")
        camadas += camadas_de(s.shapes)
        anims, videos = slider_pptx.ler_animacoes(s._element)
        for c in camadas:
            sp = c.pop("_spid", None)
            if sp and sp in anims and not c.get("trava"):
                c["anim"] = anims.pop(sp)
            if sp and c.get("tipo") == "video" and sp in videos:
                c.update({kk: vv for kk, vv in videos[sp].items() if kk in ("auto", "loop", "mudo")})
        slides.append({"id": uuid.uuid4().hex[:8], "fundo": fundo, "transicao": slider_pptx.ler_transicao(s._element) or {"tipo": "nenhuma", "dur": 0.5},
                       "dur": 5, "notas": notas, "oculto": s._element.get("show") in ("0", "false") or None, "camadas": camadas})
    nome = os.path.splitext(os.path.basename(caminho))[0]
    tema = None
    if tema_cor:
        tema = {"titulo": tema_fonte["mj"] or "Calibri", "texto": tema_fonte["mn"] or "Calibri",
                "cores": {"fundo": tema_cor.get("lt1", "#ffffff"), "tinta": tema_cor.get("dk1", "#000000"), "destaque": tema_cor.get("accent1", "#2f6fed"),
                          "suave": tema_cor.get("lt2", "#eeeeee"), "apoio": tema_cor.get("dk2", "#555555")}}
    doc = {"nome": nome, "largura": 1920, "altura": H, "slides": slides}
    if tema:
        doc["tema"] = tema
    return {"success": True, "doc": doc, "relatorio": sorted(set(relat))}
