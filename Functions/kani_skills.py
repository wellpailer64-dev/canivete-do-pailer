"""
kani_skills.py — habilidades do dia a dia da Kani (ferramentas do modo em etapas, kani_agente.py):
- documento: TXT, Markdown, Word (.docx) e PDF caprichado (PyMuPDF Story: HTML/CSS → PDF, A4, faixa de título, seções na
  cor do app, listas, tabelas simples, rodapé com data e página);
- ler: texto de um PDF, Word, TXT/MD anexado (para resumir, revisar, usar);
- remover_fundo: recorte do app (recorte_pro: pessoa → matting, objeto → BEN2) → PNG transparente;
- pesquisar: busca na web (DuckDuckGo, sem chave), lê as melhores páginas, a Kani resume cada uma e junta num resumo
  estruturado com as fontes.
Tudo grava em <modelos_ia/kani>/criacoes (apagado ao reabrir o app; o chat tem Baixar).
"""
import html
import os
import re
import time
import urllib.parse
import urllib.request

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")


def _pasta():
    from Functions import kani_criar
    return kani_criar.pasta()


def _nome(titulo, ext):
    base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", (titulo or "documento")).strip(" .")[:60] or "documento"
    p = os.path.join(_pasta(), f"{base}{ext}")
    n = 2
    while os.path.exists(p):
        p = os.path.join(_pasta(), f"{base} ({n}){ext}")
        n += 1
    return p


# ─────────────────────────── markdown simples → blocos ───────────────────────────
def _blocos(md):
    """[(tipo, conteúdo)]: h1/h2/h3, p, ul/ol (lista de itens), tabela (linhas de células), hr."""
    out, lista, tab = [], None, None
    for linha in (md or "").replace("\r", "").split("\n"):
        l = linha.rstrip()
        if tab is not None and not l.strip().startswith("|"):
            out.append(("tabela", tab)); tab = None
        if l.strip().startswith("|"):
            cel = [c.strip() for c in l.strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-{2,}:?", c) for c in cel if c):
                tab = (tab or []) + [cel]
            continue
        m = re.match(r"^\s*([-*•]|\d+[.)])\s+(.*)", l)
        if m:
            tipo = "ol" if m.group(1)[0].isdigit() else "ul"
            if not lista or lista[0] != tipo:
                if lista:
                    out.append(lista)
                lista = (tipo, [])
            lista[1].append(m.group(2))
            continue
        if lista:
            out.append(lista); lista = None
        if not l.strip():
            continue
        m = re.match(r"^(#{1,3})\s+(.*)", l)
        if m:
            out.append((f"h{len(m.group(1))}", m.group(2)))
        elif re.fullmatch(r"\s*(-{3,}|\*{3,})\s*", l):
            out.append(("hr", ""))
        else:
            out.append(("p", l.strip()))
    if lista:
        out.append(lista)
    if tab is not None:
        out.append(("tabela", tab))
    return out


def _inline_html(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!\*)\*(?!\s)(.+?)\*", r"<i>\1</i>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2">\1</a>', s)
    return s


def _limpo(s):
    return re.sub(r"\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`", lambda m: next(g for g in m.groups() if g), s)


# ─────────────────────────── documento ───────────────────────────
_CSS = """
body { font-family: sans-serif; font-size: 10.5pt; color: #1f2328; line-height: 1.5; }
h1 { font-size: 22pt; color: #ffffff; background-color: #D4814A; padding: 14pt 16pt; margin: 0 0 6pt 0; }
.sub { color: #8a6a55; font-size: 9.5pt; margin: 0 0 16pt 0; }
h2 { font-size: 14.5pt; color: #b5602b; margin: 16pt 0 4pt 0; padding-bottom: 3pt; border-bottom: 1px solid #ecd2bf; }
h3 { font-size: 12pt; color: #1f2328; margin: 12pt 0 3pt 0; }
p { margin: 0 0 7pt 0; text-align: justify; }
ul, ol { margin: 0 0 8pt 0; padding-left: 16pt; }
li { margin: 0 0 3pt 0; }
table { border-collapse: collapse; margin: 6pt 0 10pt 0; width: 100%; }
th { background-color: #f6e6da; color: #8a4a1f; font-weight: bold; padding: 4pt 6pt; border: 1px solid #e3c4ad; text-align: left; }
td { padding: 4pt 6pt; border: 1px solid #ead8ca; }
code { font-family: monospace; background-color: #f4f1ee; }
a { color: #b5602b; }
hr { border: 0; border-top: 1px solid #ecd2bf; margin: 10pt 0; }
"""


def _html(titulo, md):
    corpo = []
    for t, c in _blocos(md):
        if t == "h1" and _limpo(c).strip().lower() == (titulo or "").strip().lower():
            continue   # o título já está na faixa
        if t in ("h1", "h2", "h3"):
            corpo.append(f"<{'h2' if t == 'h1' else t}>{_inline_html(c)}</{'h2' if t == 'h1' else t}>")
        elif t == "p":
            corpo.append(f"<p>{_inline_html(c)}</p>")
        elif t in ("ul", "ol"):
            corpo.append(f"<{t}>" + "".join(f"<li>{_inline_html(i)}</li>" for i in c) + f"</{t}>")
        elif t == "tabela":
            cab, *linhas = c
            corpo.append("<table><tr>" + "".join(f"<th>{_inline_html(x)}</th>" for x in cab) + "</tr>"
                         + "".join("<tr>" + "".join(f"<td>{_inline_html(x)}</td>" for x in l) + "</tr>" for l in linhas) + "</table>")
        elif t == "hr":
            corpo.append("<hr/>")
    return (f"<h1>{html.escape(titulo or 'Documento')}</h1><p class='sub'>Feito pela Kani · KANIVETE · {time.strftime('%d/%m/%Y')}</p>"
            + "".join(corpo))


def _pdf(path, titulo, md):
    import fitz
    story = fitz.Story(html=_html(titulo, md), user_css=_CSS)
    A4 = fitz.paper_rect("a4")
    area = A4 + (48, 50, -48, -56)
    w = fitz.DocumentWriter(path)
    mais, n = True, 0
    while mais:
        dev = w.begin_page(A4)
        mais, _ = story.place(area)
        story.draw(dev)
        w.end_page()
        n += 1
    w.close()
    # rodapé: título · página X de N
    doc = fitz.open(path)
    for i, pg in enumerate(doc):
        pg.insert_text((48, A4.height - 28), f"{(titulo or '')[:70]}", fontsize=8, color=(0.55, 0.45, 0.4))
        pg.insert_text((A4.width - 110, A4.height - 28), f"página {i + 1} de {len(doc)}", fontsize=8, color=(0.55, 0.45, 0.4))
    doc.saveIncr()
    doc.close()


def _docx(path, titulo, md):
    import docx
    from docx.shared import Pt, RGBColor
    d = docx.Document()
    st = d.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(11)
    h = d.add_heading(titulo or "Documento", 0)
    for r in h.runs:
        r.font.color.rgb = RGBColor(0xB5, 0x60, 0x2B)

    def runs(par, texto):
        for parte in re.split(r"(\*\*.+?\*\*)", texto):
            if parte.startswith("**") and parte.endswith("**"):
                par.add_run(parte[2:-2]).bold = True
            elif parte:
                par.add_run(_limpo(parte))
    for t, c in _blocos(md):
        if t in ("h1", "h2", "h3"):
            if t == "h1" and _limpo(c).strip().lower() == (titulo or "").strip().lower():
                continue
            d.add_heading(_limpo(c), {"h1": 1, "h2": 1, "h3": 2}[t])
        elif t == "p":
            runs(d.add_paragraph(), c)
        elif t in ("ul", "ol"):
            for i in c:
                runs(d.add_paragraph(style="List Bullet" if t == "ul" else "List Number"), i)
        elif t == "tabela":
            tb = d.add_table(rows=len(c), cols=max(len(l) for l in c))
            tb.style = "Light Grid Accent 2"
            for r, linha in enumerate(c):
                for k, x in enumerate(linha):
                    tb.cell(r, k).text = _limpo(x)
    d.save(path)


def documento(formato, titulo, conteudo):
    """Grava o conteúdo (markdown simples) no formato pedido. Devolve o caminho."""
    f = (formato or "pdf").lower().strip(". ")
    f = {"word": "docx", "doc": "docx", "texto": "txt", "markdown": "md"}.get(f, f)
    if f not in ("pdf", "docx", "txt", "md"):
        raise ValueError("formato precisa ser pdf, docx, txt ou md")
    if not (conteudo or "").strip():
        raise ValueError("falta o conteúdo")
    path = _nome(titulo, "." + f)
    if f == "pdf":
        _pdf(path, titulo, conteudo)
    elif f == "docx":
        try:
            _docx(path, titulo, conteudo)
        except ImportError:   # sem python-docx: entrega em PDF, que sempre funciona
            path = _nome(titulo, ".pdf")
            _pdf(path, titulo, conteudo)
    elif f == "md":
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(f"# {titulo}\n\n{conteudo.strip()}\n")
    else:
        texto = "\n".join(_limpo(re.sub(r"^#{1,3}\s+", "", l)) for l in conteudo.replace("\r", "").split("\n"))
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(f"{titulo}\n{'=' * len(titulo or '')}\n\n{texto.strip()}\n")
    return path


# ─────────────────────────── ler um anexo ───────────────────────────
def ler(path, max_chars=12000):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        import fitz
        with fitz.open(path) as d:
            t = "\n".join(p.get_text() for p in d)
    elif ext == ".docx":
        import docx
        t = "\n".join(p.text for p in docx.Document(path).paragraphs)
    elif ext in (".txt", ".md", ".csv", ".json", ".srt"):
        with open(path, encoding="utf-8", errors="replace") as f:
            t = f.read()
    else:
        raise ValueError("só leio PDF, Word (.docx) e texto (.txt/.md/.csv/.srt)")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    return t[:max_chars] + ("\n[...texto cortado...]" if len(t) > max_chars else "")


# ─────────────────────────── remover fundo ───────────────────────────
def remover_fundo(path, tipo=None):
    import numpy as np
    from PIL import Image, ImageOps
    from Functions import recorte_pro
    from Functions.removerfundo import garantir_modelo
    for m in ("birefnet-matting", "ben2"):
        try:
            garantir_modelo(m)
        except Exception:
            pass
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    F, a = recorte_pro.recortar(np.array(img), tipo)
    out = Image.fromarray(np.dstack([F, a]), "RGBA")
    caixa = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if caixa:   # apara o vazio em volta (com folga)
        f = 12
        out = out.crop((max(0, caixa[0] - f), max(0, caixa[1] - f), min(out.width, caixa[2] + f), min(out.height, caixa[3] + f)))
    p = _nome(os.path.splitext(os.path.basename(path))[0] + "_sem_fundo", ".png")
    out.save(p)
    return p


# ─────────────────────────── pesquisa na web ───────────────────────────
def _baixar(url, timeout=12, limite=1_500_000):
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        tipo = r.headers.get("Content-Type", "")
        dados = r.read(limite)
    enc = re.search(r"charset=([\w-]+)", tipo)
    return dados.decode(enc.group(1) if enc else "utf-8", "replace"), tipo


def buscar(consulta, n=6):
    """[{titulo, url, trecho}] pelo DuckDuckGo (versão HTML, sem chave)."""
    from lxml import html as lh
    pagina, _ = _baixar("https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": consulta, "kl": "br-pt"}))
    doc = lh.fromstring(pagina)
    out = []
    for r in doc.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " result ")]'):
        a = r.xpath('.//a[contains(@class,"result__a")]')
        if not a:
            continue
        href = a[0].get("href") or ""
        m = re.search(r"uddg=([^&]+)", href)
        url = urllib.parse.unquote(m.group(1)) if m else href
        if not url.startswith("http") or "duckduckgo.com" in url:
            continue
        sn = r.xpath('.//*[contains(@class,"result__snippet")]')
        out.append({"titulo": a[0].text_content().strip(), "url": url, "trecho": sn[0].text_content().strip() if sn else ""})
        if len(out) >= n:
            break
    return out


def texto_da_pagina(url, max_chars=6000):
    """Texto principal de uma página (parágrafos e títulos; sem menu, script, rodapé)."""
    from lxml import html as lh
    pagina, tipo = _baixar(url)
    if "html" not in tipo and "<html" not in pagina[:500].lower():
        return pagina[:max_chars]
    doc = lh.fromstring(pagina)
    for ruim in doc.xpath("//script|//style|//nav|//footer|//header|//aside|//form|//noscript|//svg"):
        ruim.drop_tree()
    # parágrafos e itens com frase de verdade (menu, tags e links soltos têm poucas palavras); títulos curtos ficam
    partes = []
    for e in doc.xpath("//h1|//h2|//h3|//p|//li|//td"):
        t = re.sub(r"\s+", " ", e.text_content()).strip()
        if (e.tag in ("h1", "h2", "h3") and 3 <= len(t) <= 160) or len(t.split()) >= 8:
            if not partes or partes[-1] != t:
                partes.append(t)
    return "\n".join(partes)[:max_chars]


_SIS_RESUMO_PAG = """Resuma em português do Brasil, em até 8 tópicos objetivos, o que esta página diz sobre a pergunta. Só fatos
que estão no texto (números, datas, nomes). Se a página não falar do assunto, responda só: NADA."""
_SIS_RESUMO_FINAL = """Você escreve um resumo de pesquisa em português do Brasil, bem estruturado, em markdown:
## Resumo (3 a 5 linhas respondendo direto à pergunta)
## Pontos principais (tópicos)
## Detalhes (se houver números, datas, comparações — use uma tabela simples quando ajudar)
## Fontes (lista com o título de cada fonte usada)
Use SÓ o que está nas anotações abaixo; se as fontes discordarem, diga. Não invente."""


def pesquisar(consulta, on=lambda pct, msg: None, paginas=4):
    """Busca, lê as melhores páginas, resume cada uma (chamadas curtas: cabe no contexto do modelo pequeno) e junta.
    Devolve (resumo em markdown, fontes [{titulo, url}])."""
    from Functions import kani_criar
    on(5, "Buscando na web...")
    res = buscar(consulta)
    if not res:
        raise RuntimeError("a busca não trouxe resultados (sem internet?)")
    notas, fontes = [], []
    for i, r in enumerate(res):
        if len(fontes) >= paginas:
            break
        on(10 + 70 * len(fontes) / paginas, f"Lendo: {r['titulo'][:60]}")
        try:
            t = texto_da_pagina(r["url"])
        except Exception:
            t = r.get("trecho") or ""
        if len(t) < 200:
            continue
        s = kani_criar._llm(_SIS_RESUMO_PAG, f"Pergunta: {consulta}\n\nPágina: {r['titulo']}\n\n{t}", 380, 0.2)
        if not s or s.strip().upper().startswith("NADA"):
            continue
        notas.append(f"### Fonte {len(fontes) + 1}: {r['titulo']}\n{s.strip()}")
        fontes.append({"titulo": r["titulo"], "url": r["url"]})
    if not notas:   # nenhuma página legível: os trechos da busca
        notas = [f"### {r['titulo']}\n{r['trecho']}" for r in res[:5] if r.get("trecho")]
        fontes = [{"titulo": r["titulo"], "url": r["url"]} for r in res[:5]]
    on(85, "Juntando o resumo...")
    final = kani_criar._llm(_SIS_RESUMO_FINAL, f"Pergunta: {consulta}\n\nANOTAÇÕES:\n\n" + "\n\n".join(notas), 1100, 0.3)
    if not final:
        final = "## Anotações\n\n" + "\n\n".join(notas)
    # as fontes de verdade (com o link) no fim, no lugar das que o modelo listou
    final = re.split(r"\n#+\s*Fontes", final)[0].rstrip()
    final += "\n\n## Fontes\n" + "\n".join(f"- [{f['titulo']}]({f['url']})" for f in fontes)
    return final, fontes
