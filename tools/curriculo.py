"""curriculo.py — currículo A4 no Slider, editável (.dknv) e em PDF vetorial legível por robôs de triagem.

    py -3.13 tools/curriculo.py extrair arquivo.psd --pasta P       textos, foto e logos de um PSD para preencher a ficha
    py -3.13 tools/curriculo.py faltas ficha.json                   o que falta perguntar antes de montar
    py -3.13 tools/curriculo.py montar ficha.json --saida BASE [--porta 9222] [--sem-exportar]
                                                                    troca as camadas no app aberto, salva e exporta BASE.dknv e BASE.pdf
    py -3.13 tools/curriculo.py conferir BASE.pdf [--ficha ficha.json] [--png pasta]   A4, fonte real, texto completo; devolve 1 se reprovar

Ficha (JSON em UTF-8):
{"nome", "area", "foto", "contato": [{"icone": "email|fone|linkedin|local", "texto"}], "objetivo",
 "habilidades": [{"nome", "nivel": "Avançado|Intermediário|Básico", "icone": "word|excel|...|caminho"}],
 "cursos": [{"titulo", "itens": [["curso", "instituição", "ano"]]}],
 "formacao": [{"curso", "tipo", "instituicao", "periodo"}], "idiomas": [["Inglês", "Básico"]],
 "experiencias": [{"cargo", "empresa", "periodo", "logo", "abertura", "itens": ["tópico", "Grupo:"], "corte": 8}],
 "ordem": ["objetivo", "habilidades", "cursos", "formacao", "idiomas"]}
Tópico = uma ideia por linha. Item terminado em ":" vira subtítulo. "corte" = onde começa a 2ª coluna (sem = equilibra).

Regras: nunca inventar cargo, data ou nível (use `faltas`); nada de texto dentro de imagem; só um emprego "Atual".
"""
import sys as _sys_pa, os as _os_pa; _sys_pa.path.append(_os_pa.path.join(_os_pa.path.dirname(_os_pa.path.abspath(__file__)), '')); from porta_agente import porta as _porta_agente  # porta viva (agente.json)
import argparse, json, html, os, re, subprocess, sys, tempfile, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONES = "D:/kanivete_biblioteca/recursos/curriculo_icones"
ICONIFY = {"word": "vscode-icons:file-type-word", "excel": "vscode-icons:file-type-excel", "powerpoint": "vscode-icons:file-type-powerpoint",
           "onenote": "vscode-icons:file-type-onenote", "copilot": "ri:copilot-fill", "photoshop": "logos:adobe-photoshop", "python": "logos:python",
           "microsoft": "logos:microsoft-icon", "sap": "logos:sap", "totvs": "simple-icons:totvs", "documento": "mdi:file-account", "saude": "mdi:heart-pulse",
           "email": "mdi:email", "fone": "mdi:phone", "linkedin": "mdi:linkedin", "local": "mdi:map-marker"}
CLAROS = {"email", "fone", "linkedin", "local"}   # sobre a faixa colorida
TER, ESC, INK, LIN, CRE = "#A8522B", "#94461F", "#2B2320", "#E8D8CD", "#FBF3EE"
L, A, X = 1191, 1684, 80
W = L - 2 * X
LIMITE = A - 40
NB = '<span style="white-space:nowrap">%s</span>'


def icone(nome):
    if not nome:
        return None
    if os.path.isfile(nome):
        return nome.replace("\\", "/")
    p = f"{ICONES}/{nome}.svg"
    if os.path.isfile(p):
        return p
    if nome not in ICONIFY:
        print(f"AVISO: ícone desconhecido, sem logo: {nome}")
        return None
    a, b = ICONIFY[nome].split(":")
    cor = "?color=%23ffffff" if nome in CLAROS else ("?color=%23A8522B" if a == "mdi" else "")
    s = urllib.request.urlopen(urllib.request.Request(f"https://api.iconify.design/{a}/{b}.svg{cor}", headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read().decode()
    os.makedirs(ICONES, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)
    return p


def linhas(t, tam, w):
    from PIL import ImageFont
    f = ImageFont.truetype("C:/Windows/Fonts/Lato-Regular.ttf", int(tam * 4))
    n = 0
    for par in t.split("\n"):
        l = ""
        n += 1
        for p in par.split(" "):
            s = (l + " " + p).strip()
            if f.getlength(s) / 4 > w - 6 and l:
                n += 1
                l = p
            else:
                l = s
    return n


def inteiro(t):
    return html.escape(t).replace("e-mails", NB % "e-mails").replace("e-social", NB % "e-social").replace("e-mail", NB % "e-mail")


class Doc:
    def __init__(self):
        self.ops = []

    def texto(self, s, nome, h, x, y, w, alt, **k):
        self.ops.append(["texto", dict(slide=s, nome=nome, html=h, x=x, y=y, w=w, h=alt, fonte="Lato", **k)])

    def forma(self, s, nome, x, y, w, h, cor, forma="ret", raio=0):
        self.ops.append(["forma", dict(slide=s, nome=nome, forma=forma, x=x, y=y, w=w, h=h, preench=cor, raio=raio)])

    def imagem(self, s, nome, src, x, y, w, h):
        if src:
            self.ops.append(["imagem", dict(slide=s, nome=nome, src=src, x=x, y=y, w=w, h=h, ajuste="conter")])

    def secao(self, s, y, tit):
        self.forma(s, "Marca da seção", X, y + 3, 6, 28, TER, raio=3)
        self.texto(s, "Seção " + tit, tit, X + 18, y, W - 18, 36, tam=25, peso=700, cor=TER, entrelinha=1.2)
        self.forma(s, "Fio", X, y + 39, W, 2, LIN)
        return y + 54

    def cartao(self, s, y, nome, h, alt):
        self.forma(s, "Fundo " + nome, X, y, W, alt, CRE, raio=12)
        self.texto(s, nome, h, X + 20, y + 12, W - 40, alt - 20, tam=20, cor=INK, entrelinha=1.42)
        return y + alt


def nivel(a, b):
    return f'<b>{html.escape(a)}:</b> <span style="color:{TER}">{html.escape(b)}</span>'


def pagina1(d, f):
    d.forma(1, "Faixa", 0, 0, L, 298, TER)
    d.forma(1, "Círculo", 930, -150, 400, 400, ESC, "elipse")
    d.forma(1, "Anel da foto", 70, 29, 240, 240, "#FFFFFF", "elipse")
    d.imagem(1, "Foto", f.get("foto"), 76, 35, 228, 228)
    d.texto(1, "Nome", html.escape(f["nome"]), 350, 34, 760, 84, tam=68, peso=700, cor="#FFFFFF", entrelinha=1.15)
    d.texto(1, "Área", html.escape(f.get("area", "")), 352, 116, 760, 40, tam=27, cor="#FFFFFF", entrelinha=1.2)
    cts = f.get("contato", [])
    for k, c in enumerate(cts):
        d.imagem(1, "Ícone " + c["icone"], icone(c["icone"]), 352, 174 + 27 * k, 20, 20)
    d.texto(1, "Contato", "<br>".join(html.escape(c["texto"]) for c in cts), 382, 170, 720, 116, tam=19, cor="#FFFFFF", entrelinha=1.42)
    y = 324
    for sec in f.get("ordem") or ["objetivo", "habilidades", "cursos", "formacao", "idiomas"]:
        if sec == "objetivo" and f.get("objetivo"):
            y = d.secao(1, y, "Objetivo")
            h = linhas(f["objetivo"], 20, W) * 29 + 4
            d.texto(1, "Objetivo", html.escape(f["objetivo"]), X, y, W, h, tam=20, cor=INK, entrelinha=1.45)
            y += h + 22
        elif sec == "habilidades" and f.get("habilidades"):
            y = d.secao(1, y, "Habilidades")
            cw = (W - 24) // 3
            for k, s in enumerate(f["habilidades"]):
                cx, cy = X + (k % 3) * (cw + 12), y + (k // 3) * 66
                d.forma(1, "Fundo " + s["nome"], cx, cy, cw, 56, CRE, raio=12)
                d.imagem(1, "Logo " + s["nome"], icone(s.get("icone")), cx + 10, cy + 12, 32, 32)
                d.texto(1, "Habilidade " + s["nome"], nivel(s["nome"], s["nivel"]), cx + 50, cy + 15, cw - 54, 30, tam=17.5, cor=INK, entrelinha=1.3)
            y += ((len(f["habilidades"]) + 2) // 3) * 66 + 18
        elif sec == "cursos":
            for g in f.get("cursos", []):
                y = d.secao(1, y, g["titulo"])
                h = "<br>".join(f"<b>{html.escape(c[0])}</b> | {html.escape(c[1])} | {html.escape(c[2])}" for c in g["itens"])
                y = d.cartao(1, y, g["titulo"], h, len(g["itens"]) * 29 + 24) + 22
        elif sec == "formacao" and f.get("formacao"):
            y = d.secao(1, y, "Formação Acadêmica")
            for c in f["formacao"]:
                h = f'<b>{html.escape(c["curso"])} | {html.escape(c["tipo"])}</b><br><span style="color:{TER}">{html.escape(c["instituicao"])} | {html.escape(c["periodo"])}</span>'
                y = d.cartao(1, y, "Formação " + c["curso"], h, 78) + 10
            y += 12
        elif sec == "idiomas" and f.get("idiomas"):
            y = d.secao(1, y, "Idiomas")
            mw = (W - 16) // 2
            for k, (a, b) in enumerate(f["idiomas"]):
                cx, cy = X + (k % 2) * (mw + 16), y + (k // 2) * 62
                d.forma(1, "Fundo " + a, cx, cy, mw, 52, CRE, raio=12)
                d.texto(1, "Idioma " + a, nivel(a, b), cx + 20, cy + 11, mw - 40, 32, tam=20, cor=INK, entrelinha=1.42)
            y += ((len(f["idiomas"]) + 1) // 2) * 62 + 12
    return y


def pagina2(d, f, tam):
    d.forma(2, "Faixa", 0, 0, L, 80, TER)
    d.forma(2, "Círculo", 1030, -120, 200, 200, ESC, "elipse")
    d.texto(2, "Nome", html.escape(f["nome"]), X, 18, W, 46, tam=32, peso=700, cor="#FFFFFF", entrelinha=1.2)
    y = d.secao(2, 100, "Experiência Profissional")
    cw = (W - 30) // 2
    alt = lambda p: sum(linhas(t, tam, cw - 18) for t in p)
    for e in f["experiencias"]:
        nome = e["empresa"]
        d.forma(2, "Fundo " + nome, X, y, W, 80, CRE, raio=12)
        d.forma(2, "Placa do logo " + nome, X + 10, y + 10, 140, 60, "#FFFFFF", raio=9)
        d.imagem(2, "Logo " + nome, icone(e.get("logo")), X + 18, y + 14, 124, 52)
        d.texto(2, "Cargo " + nome, f'<b>{html.escape(e["cargo"])}</b><br><span style="color:{TER}">{html.escape(nome)} | {html.escape(e["periodo"])}</span>', X + 166, y + 9, W - 180, 62, tam=21, cor=INK, entrelinha=1.38)
        y += 90
        if e.get("abertura"):
            d.texto(2, f"Rotinas {nome}: abertura", html.escape(e["abertura"]), X, y, W, 28, tam=tam + .5, cor=INK, entrelinha=1.36)
            y += 28
        it = e["itens"]
        k = e.get("corte") or min(range(1, len(it)), key=lambda c: abs(alt(it[:c]) - alt(it[c:]))) if len(it) > 1 else 1
        hc = 0
        for j, p in enumerate((it[:k], it[k:])):
            if not p:
                continue
            h = round(alt(p) * tam * 1.38) + 6
            hc = max(hc, h)
            x = "".join(f"<div><b>{html.escape(t)}</b></div>" if t.endswith(":") else
                        f'<div style="padding-left:16px;text-indent:-16px"><span style="color:{TER}">•</span> {inteiro(t)}</div>' for t in p)
            d.texto(2, f"Rotinas {nome}: coluna {j + 1}", x, X + j * (cw + 30), y, cw, h, tam=tam, cor=INK, entrelinha=1.38)
        y += hc + 14
    return y


def faltas(f):
    """o que perguntar ANTES de montar: nada aqui se inventa"""
    r = []
    for c in ("nome", "area", "contato", "objetivo", "foto"):
        if not f.get(c):
            r.append(f"falta {c}")
    atuais = [e["empresa"] for e in f.get("experiencias", []) if re.search(r"atual", e.get("periodo", ""), re.I)]
    if len(atuais) > 1:
        r.append("mais de um emprego atual: " + ", ".join(atuais) + " (pedir a data de saída)")
    for e in f.get("experiencias", []):
        nome = e.get("empresa", "?")
        if not e.get("cargo"):
            r.append(f"{nome}: falta o cargo")
        if not re.search(r"\d{4}", e.get("periodo", "")):
            r.append(f"{nome}: falta o início do período")
        if not e.get("logo"):
            r.append(f"{nome}: sem logo")
        if re.search(r"(atuou|atua|trabalhou|trabalha|realizou|realiza|responsável por)", e.get("abertura", ""), re.I):
            r.append(f"{nome}: abertura em terceira pessoa, escrever em primeira (Atuei, Atuo)")
        if not e.get("itens"):
            r.append(f"{nome}: sem tópicos")
        for t in e.get("itens", []):
            if len(t) > 130:
                r.append(f"{nome}: tópico longo, separar em um assunto por linha: {t[:50]}…")
    for s in f.get("habilidades", []):
        if s.get("nivel") not in ("Avançado", "Intermediário", "Básico"):
            r.append(f'{s.get("nome")}: nível inválido')
    return r


def sd(porta, *a):
    r = subprocess.run([sys.executable, "tools/sd.py", *a, "--porta", str(porta)], cwd=RAIZ, capture_output=True, encoding="utf-8", errors="replace", timeout=240)
    if r.returncode or "encontrado" in r.stdout[:80]:
        sys.exit(f"sd.py falhou em {a[0]}: {(r.stdout + r.stderr)[-300:]}")
    return r.stdout.strip()


def montar(a):
    f = json.load(open(a.ficha, encoding="utf-8"))
    for x in faltas(f):
        print("ATENÇÃO:", x)
    y1 = pagina1(Doc(), f)
    if y1 > LIMITE:
        sys.exit(f"a página 1 não cabe (termina em {y1} de {LIMITE}): tire uma seção de 'ordem' ou encurte")
    for tam in (19, 18.5, 18, 17.5, 17, 16.5, 16):   # 16 px = 8 pt, o menor legível no papel
        d = Doc()
        pagina1(d, f)
        y2 = pagina2(d, f, tam)
        if y2 <= LIMITE:
            break
    else:
        sys.exit(f"a página 2 não cabe nem em 8 pt (termina em {y2} de {LIMITE}): encurte os tópicos")
    print(f"p1 até {y1}, p2 até {y2} de {A}; tópicos em {tam / 2} pt")
    st = sd(a.porta, "js", "JSON.stringify({sujo:!!SD.sujo,arq:SD.arquivo||''})")
    alvo = a.saida.replace("\\", "/") + ".dknv"
    if '\\"sujo\\":true' in st and not a.forcar:
        sys.exit("PAROU: há alterações não salvas no app (ajuste manual é sagrado). Salve ou use --forcar.")
    sd(a.porta, "cmd", "novo", json.dumps({"formato": "a4", "nome": f["nome"]}, ensure_ascii=False))
    tema = "(()=>{SD.doc.slides[0].camadas=[];SD.doc.slides[0].fundo={tipo:'cor',cor:'#FFFFFF'};SD.doc.tema.titulo='Lato';SD.doc.tema.texto='Lato';Object.assign(SD.doc.tema.cores,{fundo:'#FFFFFF',tinta:'%s',destaque:'%s'});return 1})()" % (INK, TER)
    sd(a.porta, "js", tema)     # A4 novo nasce com fundo escuro: texto escuro some
    sd(a.porta, "cmd", "slide_duplicar", '{"slide":1}')
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8", dir=os.path.dirname(os.path.abspath(a.ficha))) as t:
        json.dump(d.ops, t, ensure_ascii=False)
    try:
        sd(a.porta, "lote", t.name)
    finally:
        os.unlink(t.name)
    rev = sd(a.porta, "revisar")
    print("revisar:", rev[-400:])
    print(sd(a.porta, "cmd", "salvar", json.dumps({"caminho": alvo}, ensure_ascii=False))[:200])
    if not a.sem_exportar:
        print(sd(a.porta, "cmd", "exportar", json.dumps({"formato": "pdf_vetor", "caminho": a.saida + ".pdf", "autor": f["nome"]}, ensure_ascii=False))[:300])
    return 0


def conferir(a):
    import fitz
    pdf, erros = fitz.open(a.pdf), []
    txt = ""
    for i, pg in enumerate(pdf):
        if abs(pg.rect.width - 595) > 1.5 or abs(pg.rect.height - 842) > 1.5:
            erros.append(f"pág {i + 1} não é A4: {pg.rect}")
        for x in pg.get_fonts():
            if x[2] == "Type3":
                erros.append(f"pág {i + 1}: fonte Type3 {x[3]} (use fonte estática)")
        t = pg.get_text()
        txt += t + "\n"
        if len(t) < 100:
            erros.append(f"pág {i + 1}: quase sem texto vivo (virou imagem?)")
        if a.png:
            os.makedirs(a.png, exist_ok=True)
            pg.get_pixmap(dpi=90).save(os.path.join(a.png, f"pag_{i + 1}.png"))
    if a.ficha:
        f = json.load(open(a.ficha, encoding="utf-8"))
        plano = re.sub(r"\s+", " ", txt)
        ver = [f["nome"], *[c["texto"] for c in f.get("contato", [])], *[s["nome"] + ": " + s["nivel"] for s in f.get("habilidades", [])]]
        for e in f.get("experiencias", []):
            ver += [e["cargo"], e["empresa"] + " | " + e["periodo"], *[t for t in e["itens"]]]
        for v in ver:
            if re.sub(r"\s+", " ", v) not in plano:
                erros.append("texto não encontrado no PDF: " + v[:70])
    print(f"{pdf.page_count} páginas, {len(txt)} letras, {sum(len(p.get_images()) for p in pdf)} imagens")
    for e in erros:
        print("REPROVADO:", e)
    if not erros:
        print("APROVADO")
    return 1 if erros else 0


def extrair(a):
    import io
    from psd_tools import PSDImage
    os.makedirs(a.pasta, exist_ok=True)
    p = PSDImage.open(a.psd)
    p.composite().convert("RGB").save(os.path.join(a.pasta, "original.png"))
    saida = open(os.path.join(a.pasta, "textos.txt"), "w", encoding="utf-8")

    def anda(g):
        for l in g:
            nome = re.sub(r"[^\w-]+", "_", l.name)[:40]
            if l.is_group():
                saida.write(f"## {l.name}\n")
                anda(l)
            elif l.kind == "type":
                saida.write(l.text.replace("\r", "\n").replace("\x03", "\n") + "\n--\n")
            elif l.kind in ("pixel", "smartobject") and l.width > 40:
                img = l.composite()
                if l.kind == "smartobject":     # o original embutido costuma ter resolução bem maior
                    try:
                        img = PSDImage.open(io.BytesIO(l.smart_object.data)).composite()
                        img = img.crop(img.getbbox())
                    except Exception:
                        pass
                img.save(os.path.join(a.pasta, nome + ".png"))
                saida.write(f"[imagem {nome}.png {img.size}]\n--\n")
    anda(p)
    saida.close()
    print("ver", a.pasta, ": textos.txt, original.png e as imagens. Bolinhas/gráficos de nível: contar em original.png (4-5 Avançado, 3 Intermediário, 1-2 Básico)")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = ap.add_subparsers(dest="cmd", required=True)
    x = s.add_parser("extrair"); x.add_argument("psd"); x.add_argument("--pasta", required=True)
    x = s.add_parser("faltas"); x.add_argument("ficha")
    x = s.add_parser("montar"); x.add_argument("ficha"); x.add_argument("--saida", required=True); x.add_argument("--porta", default=_porta_agente(9222), type=int); x.add_argument("--sem-exportar", action="store_true"); x.add_argument("--forcar", action="store_true")
    x = s.add_parser("conferir"); x.add_argument("pdf"); x.add_argument("--ficha"); x.add_argument("--png")
    a = ap.parse_args()
    if a.cmd == "faltas":
        r = faltas(json.load(open(a.ficha, encoding="utf-8")))
        print("\n".join(r) or "nada falta")
        return 1 if r else 0
    return {"extrair": extrair, "montar": montar, "conferir": conferir}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
