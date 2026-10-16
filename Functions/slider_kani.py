"""slider_kani.py — a Kani (modelo local) ajudando no Slider Kanivete. Ela só escreve o CONTEÚDO numa ficha JSON travada
(schema); quem monta os slides é o código do Slider (layouts do tema, frontend/js/slider-kani.js). Assim um modelo de 4B
dá conta: não desenha nada, só pensa o texto.
    roteiro(pedido, n)  → {titulo, subtitulo, slides: [{layout, titulo, texto, topicos, numero, legenda, citacao, autor, notas}]}
    notas(slide)        → texto para o apresentador falar
    reescrever(t, modo) → 'topicos' | 'curto' | 'titulo' | 'revisar'
Usa o mesmo motor da Kani (Ollama ou llama.cpp, kani_maos._llm_json). Guia: Instructions/slider-kanivete.md › Kani."""
import json
import re

from Functions import kani

LAYOUTS = ["titulo", "secao", "titulo_texto", "lista", "duas_colunas", "numero", "citacao", "imagem_lateral", "encerramento"]

SISTEMA_ROTEIRO = (
    "Você é roteirista de palestras e designer de apresentações. Escreva o CONTEÚDO de uma apresentação em português do Brasil "
    "a partir do pedido. Regras: um slide = uma ideia; títulos com no máximo 6 palavras; tópicos com no máximo 8 palavras, de 2 a 4 "
    "por slide; nada de parágrafos longos (texto com no máximo 25 palavras); NÃO invente números, nomes, datas ou citações que o "
    "pedido não traz — use 'numero' e 'citacao' só com o que está no pedido; o 1º slide é layout 'titulo' (capa) e o último "
    "'encerramento'; use 'secao' para abrir blocos quando houver mais de 6 slides; varie os layouts; 'notas' = o que o palestrante "
    "fala nesse slide, 2 ou 3 frases naturais. Layouts: titulo (capa: titulo + texto curto), secao (titulo do bloco), titulo_texto "
    "(titulo + texto), lista (titulo + topicos), duas_colunas (titulo + topicos: metade em cada coluna), numero (numero grande + "
    "legenda), citacao (citacao + autor), imagem_lateral (titulo + texto, espaço para foto), encerramento (titulo + texto de contato).")

SCHEMA_ROTEIRO = {
    "type": "object", "required": ["titulo", "slides"],
    "properties": {
        "titulo": {"type": "string"}, "subtitulo": {"type": "string"},
        "slides": {"type": "array", "minItems": 3, "items": {
            "type": "object", "required": ["layout", "titulo", "notas"],
            "properties": {"layout": {"type": "string", "enum": LAYOUTS}, "titulo": {"type": "string"}, "texto": {"type": "string"},
                           "topicos": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
                           "numero": {"type": "string"}, "legenda": {"type": "string"}, "citacao": {"type": "string"}, "autor": {"type": "string"},
                           "notas": {"type": "string"}},
            "anyOf": [{"required": ["texto"]}, {"required": ["topicos"]}, {"required": ["numero"]}, {"required": ["citacao"]}]}}}}


def _llm(sistema, usuario, schema, max_tokens=1600):
    from Functions.kani_maos import _llm_json
    st = kani.estado()
    if not st.get("pronto"):
        raise RuntimeError("a Kani ainda não está instalada: abra a Kani (barra lateral › IA › Kani) uma vez para baixar o modelo")
    return _llm_json(sistema, usuario, schema, max_tokens)


def _curto(t, n):
    t = re.sub(r"\s+", " ", str(t or "")).strip()
    ps = t.split(" ")
    return t if len(ps) <= n else " ".join(ps[:n]).rstrip(",;:") + "…"


def _frase(t):
    """'Regras De Ouro Do Atendimento' → 'Regras de ouro do atendimento' (em português só a 1ª maiúscula); mantém
    siglas e nomes com maiúscula no meio (WhatsApp, LinkedIn, ONG) e palavras que o pedido escreve com maiúscula"""
    ps = t.split(" ")
    if len(ps) < 2:
        return t
    fica = lambda p: (p.isupper() and len(p) > 1) or re.search(r"[a-zà-ÿ][A-Z]", p) or re.sub(r"\W", "", p) in _frase.proprios or re.sub(r"\W", "", p) in _frase.sempre
    baixa = lambda p: "-".join(q if fica(q) else q[:1].lower() + q[1:] for q in p.split("-"))   # "pré-Saída" → "pré-saída"
    return " ".join([ps[0].split("-")[0] + "".join("-" + (q if fica(q) else q[:1].lower() + q[1:]) for q in ps[0].split("-")[1:])] + [p if fica(p) else baixa(p) for p in ps[1:]])


_frase.proprios = set()
_frase.sempre = {"Brasil", "Kanivete", "KANIVETE", "Kani", "Instagram", "Google", "YouTube", "TikTok", "Facebook", "LinkedIn", "Pix", "Natal", "Deus"}


def _inventado(t, pedido):
    """contato/site/@ que o pedido não traz = inventado"""
    for m in re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+|www\.[\w.-]+|@\w+|\(?\d{2}\)?\s?\d{4,5}-?\d{4}", t or ""):
        if m.lower() not in pedido.lower():
            return True
    return False


def roteiro(pedido, n=8):
    n = max(3, min(20, int(n or 8)))
    r = _llm(SISTEMA_ROTEIRO, f"Pedido: {pedido}\n\nQuantidade de slides: {n}. Responda só com o JSON.", SCHEMA_ROTEIRO, max_tokens=300 + 220 * n)
    _frase.proprios = {w for w in re.findall(r"\b[A-ZÀ-Ý][\wÀ-ÿ]+", pedido) if not pedido.startswith(w)}
    slides = []
    for s in r.get("slides", [])[:n + 2]:
        lay = s.get("layout") if s.get("layout") in LAYOUTS else "titulo_texto"
        # o que o modelo não respeitou, o código corta (o layout não estoura)
        texto = s.get("texto") or ""
        if _inventado(texto, pedido):
            texto = "Obrigado!" if lay == "encerramento" else ""
        topicos = [re.sub(r"^\s*(coluna|lado|parte)\s+\w+\s*:\s*", "", str(t), flags=re.I) for t in (s.get("topicos") or [])]   # "Coluna esquerda: …"
        s2 = {"layout": lay, "titulo": _frase(_curto(s.get("titulo"), 9)), "texto": _curto(texto, 32),
              "topicos": [_curto(t, 12) for t in topicos if t.strip()][:6], "notas": str(s.get("notas") or "").strip()}
        # título com um número do pedido ("62% das vendas") pede o layout de número grande
        m = re.search(r"\d+(?:[.,]\d+)?\s?%|R\$\s?\d[\d.,]*|\d[\d.,]*\s?(?:mil|milhões|bilhões)", s2["titulo"])
        if lay in ("titulo_texto", "lista") and m and m.group(0) in pedido and not s2["topicos"][1:]:
            lay = "numero"; s.update(numero=m.group(0), legenda=(s2["titulo"].replace(m.group(0), "").strip(" :-–") or s2["texto"]))
            s2["layout"] = "numero"
        if lay == "numero":
            num = str(s.get("numero") or "").strip()
            if not num or not re.search(r"\d", num) or num not in pedido:   # número que não está no pedido = inventado
                s2["layout"] = "titulo_texto" if not s2["topicos"] else "lista"
            else:
                s2["numero"], s2["legenda"] = num, _curto(s.get("legenda") or s.get("texto"), 12)
        if lay == "citacao":
            cit = str(s.get("citacao") or "").strip().strip('"“”')
            if not cit or cit[:20].lower() not in pedido.lower():
                s2["layout"] = "titulo_texto"
            else:
                s2["citacao"], s2["autor"] = _curto(cit, 30), _curto(s.get("autor"), 6)
        if s2["layout"] in ("lista", "duas_colunas") and not s2["topicos"]:
            s2["layout"] = "titulo_texto"
        # slide de conteúdo sem corpo: aproveita a fala das notas (a Kani às vezes põe tudo nelas)
        if s2["layout"] in ("titulo_texto", "imagem_lateral") and not s2["texto"]:
            s2["texto"] = "; ".join(s2["topicos"]) if s2["topicos"] else _curto(re.split(r"(?<=[.!?])\s", s2["notas"])[0] if s2["notas"] else "", 25)
        slides.append(s2)
    if slides and slides[0]["layout"] != "titulo":
        slides.insert(0, {"layout": "titulo", "titulo": _frase(_curto(r.get("titulo"), 9)), "texto": _curto(r.get("subtitulo"), 12), "topicos": [], "notas": ""})
    return {"success": True, "titulo": _frase(_curto(r.get("titulo"), 9)), "subtitulo": _curto(r.get("subtitulo"), 14), "slides": slides}


def notas(slide_texto, contexto=""):
    r = _llm("Você ajuda um palestrante. A partir do conteúdo do slide, escreva o que ele fala nesse slide: 2 a 4 frases naturais, "
             "em português do Brasil, sem repetir o slide palavra por palavra e sem inventar números ou fatos.",
             f"Apresentação: {contexto}\nConteúdo do slide:\n{slide_texto}\nResponda só com o JSON.",
             {"type": "object", "required": ["notas"], "properties": {"notas": {"type": "string"}}}, max_tokens=400)
    return {"success": True, "notas": str(r.get("notas") or "").strip()}


MODOS = {
    "topicos": ("Transforme o texto em 2 a 4 tópicos de slide, cada um com no máximo 8 palavras, sem perder a ideia nem inventar nada.",
                {"type": "object", "required": ["topicos"], "properties": {"topicos": {"type": "array", "items": {"type": "string"}, "maxItems": 5}}}),
    "curto": ("Reescreva o texto para caber num slide: no máximo 20 palavras, mesmo sentido, sem inventar nada.",
              {"type": "object", "required": ["texto"], "properties": {"texto": {"type": "string"}}}),
    "titulo": ("Sugira um título de slide para o texto: no máximo 6 palavras, forte e claro, sem dois-pontos.",
               {"type": "object", "required": ["texto"], "properties": {"texto": {"type": "string"}}}),
    "revisar": ("Corrija ortografia, acentos e concordância do texto em português do Brasil, sem mudar o estilo nem o tamanho.",
                {"type": "object", "required": ["texto"], "properties": {"texto": {"type": "string"}}}),
}


def reescrever(texto, modo="curto"):
    sis, schema = MODOS.get(modo, MODOS["curto"])
    r = _llm(sis, f"Texto:\n{texto}\nResponda só com o JSON.", schema, max_tokens=400)
    if modo == "topicos":
        return {"success": True, "topicos": [_curto(t, 12) for t in r.get("topicos") or [] if str(t).strip()][:5]}
    return {"success": True, "texto": str(r.get("texto") or "").strip()}


def pedir(acao, dados):
    """porta única para a ponte (main.py › sd_kani)"""
    try:
        d = json.loads(dados) if isinstance(dados, str) else (dados or {})
        if acao == "roteiro":
            return roteiro(d.get("pedido", ""), d.get("n", 8))
        if acao == "notas":
            return notas(d.get("texto", ""), d.get("contexto", ""))
        if acao == "reescrever":
            return reescrever(d.get("texto", ""), d.get("modo", "curto"))
        return {"success": False, "error": f"ação desconhecida: {acao}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
