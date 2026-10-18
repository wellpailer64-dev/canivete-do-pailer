"""Base de ajuda da Kani (assistente do KANIVETE): junta os guias das ferramentas (Instructions/*.md) e o mapa geral
(Instructions/MAPA.md) em trechos curtos por título, mais a lista de ferramentas da barra lateral (id → nome), em
frontend/ajuda/kani_kb.json — vai junto com o frontend no build. Rodar depois de mudar guias/ferramentas:
    py -3.13 tools/kani_kb.py
"""
import json
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INSTR = os.path.join(RAIZ, "Instructions")
SAIDA = os.path.join(RAIZ, "frontend", "ajuda", "kani_kb.json")
FORA = {"build.md", "howtoeditapp.md", "modo-agente.md", "cerebro.md", "MAPA.md"}   # internos (desenvolvimento)
MAX = 1400
FATOS = os.path.join(RAIZ, "frontend", "ajuda", "kani_fatos.md")   # escrito para quem usa: vem na frente dos guias
# seções de guia que são para quem programa: a Kani citava caminho de arquivo e plano interno ("o estabilizador está
# pendente", "edite slider-kani.js") — medido na bateria de 2026-10-17
SECAO_FORA = re.compile(r"onde fica|para o agente|armadilh|pend[êe]nci|depend[êe]nci|leveza|^modelo$|padr[ãa]o de implementa|"
                        r"estabilidade do sistema|teste|api\b|arquivos? \(|bancada|medi[çc][õo]es|plano|ponte|c[óo]digo|build", re.I)
TECNICO = re.compile(r"`[^`]*(?:[/\\]|\.(?:js|py|json|css|html|md|bat)\b|\(|\)|_[a-z]|[a-z][A-Z]|window\.|=)[^`]*`")


def trechos(texto, fonte):
    out, titulo, buf = [], fonte, []

    def fechar():
        if SECAO_FORA.search(titulo.split(" — ", 1)[-1]):
            return
        corpo = limpar("\n".join(buf)).strip()
        while corpo:
            parte, corpo = corpo[:MAX], corpo[MAX:]
            if len(parte.strip()) > 60 and not re.search(r"window\.|[a-z]{3,}[A-Z][a-z]+[A-Z]|_[a-z]+_[a-z]+", parte):
                out.append({"titulo": titulo, "texto": parte.strip(), "fonte": fonte})
    for linha in texto.splitlines():
        m = re.match(r"^(#{1,3})\s+(.*)", linha)
        if m:
            fechar(); buf = []
            titulo = f"{fonte} — {m.group(2).strip()}"
        else:
            buf.append(linha)
    fechar()
    return out


def limpar(t):
    """tira o que é de programador: blocos de código, `caminhos/funções`, linhas de tabela com arquivo, (arquivo.py)"""
    t = re.sub(r"```.*?```", "", t, flags=re.S)
    t = TECNICO.sub("", t)
    t = re.sub(r"\((?:[^()]*?\.(?:js|py|json|css)\b[^()]*)\)", "", t)
    t = "\n".join(l for l in t.splitlines() if not re.search(r"\.(js|py|json|css)\b|Functions/|frontend/|testes/|tools/|D:/|D:\\\\", l))
    return re.sub(r"[ \t]{2,}", " ", re.sub(r"\n{3,}", "\n\n", t))


def ferramentas():
    html = open(os.path.join(RAIZ, "frontend", "index.html"), encoding="utf-8").read()
    vistos, out = set(), []
    for m in re.finditer(r'<button class="menu-item[^"]*" data-tool="([^"]+)"[^>]*>(.*?)</button>', html, re.S):
        tid, nome = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2))
        nome = re.sub(r"^(Ek|Pk|Vk|Sk|Ke) ", "", re.sub(r"\s+", " ", nome).strip())   # tira o loginho
        if tid not in vistos and nome and tid != "home":
            vistos.add(tid); out.append([tid, nome])
    return out


def barra_lateral():
    """Seções da barra lateral na ordem, com as ferramentas de cada uma (para a Kani dizer onde fica cada coisa)."""
    html = open(os.path.join(RAIZ, "frontend", "index.html"), encoding="utf-8").read()
    nav = html[html.index('<div class="menu-group">'):html.index("</nav>")]
    out, grupo = [], None
    for m in re.finditer(r'<div class="menu-group">([^<]+)</div>|<button class="menu-item[^"]*"[^>]*>(.*?)</button>', nav, re.S):
        if m.group(1):
            grupo = [m.group(1).strip(), []]; out.append(grupo)
        elif grupo:
            nome = re.sub(r"^(Ek|Pk|Vk|Sk|Ke|K) ", "", re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(2))).strip())
            if nome:
                grupo[1].append(nome)
    return out


def resumos():
    """O que cada ferramenta faz e como começar, com as palavras da própria tela (título, descrição, área de soltar) e,
    sem isso, a descrição do cartão da Home."""
    html = open(os.path.join(RAIZ, "frontend", "index.html"), encoding="utf-8").read()
    limpa = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()
    out = {}
    for tid, nome in ferramentas():
        i = html.find(f'id="page-{tid}"')
        partes = []
        # cartão da Home (o 1º botão com essa ferramenta é o da barra lateral, sem descrição: pega o que tem <small>)
        card = next((c for c in re.finditer(r"switchTool\('%s'\)\"\s*>(.{0,700}?)</button>" % re.escape(tid), html, re.S) if "<small>" in c.group(1)), None)
        if card:
            partes.append(limpa(re.search(r"<small>(.*?)</small>", card.group(1), re.S).group(1)) + ".")
        if i >= 0:
            fim = html.find('class="tool-page', i + 10)
            bloco = html[i:min(i + 4000, fim if fim > 0 else i + 4000)]   # só a tela desta ferramenta
            m = re.search(r"<h2>(.*?)</h2>\s*<p>(.*?)</p>", bloco, re.S)
            if m:
                partes.append(limpa(m.group(2)))
            dz = re.search(r'class="dz-title">(.*?)</div>\s*<div class="dz-sub">(.*?)</div>', bloco, re.S)
            if dz:
                partes.append(f"Para começar: {limpa(dz.group(1))} ({limpa(dz.group(2))}).")
        if partes:
            out[nome] = " ".join(partes)
    return out


def main():
    chunks = []
    if os.path.isfile(FATOS):
        chunks += [dict(c, fato=True) for c in trechos(re.sub(r"<!--.*?-->", "", open(FATOS, encoding="utf-8").read(), flags=re.S), "Ajuda")]
    for n in sorted(os.listdir(INSTR)):
        if n.endswith(".md") and n not in FORA:
            fonte = "Mapa geral" if n == "MAPA.md" else n[:-3].replace("-", " ").title()
            chunks += trechos(open(os.path.join(INSTR, n), encoding="utf-8").read(), fonte)
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    json.dump({"chunks": chunks, "ferramentas": ferramentas(), "barra": barra_lateral(), "resumos": resumos()}, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(chunks)} trechos, {len(ferramentas())} ferramentas -> {os.path.relpath(SAIDA, RAIZ)} ({os.path.getsize(SAIDA) // 1024} KB)")


if __name__ == "__main__":
    main()
