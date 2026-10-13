"""
kani_maos.py — as "mãos" da Kani nos apps: ela preenche uma FICHA curta e o código monta a peça AO VIVO na tela.
Trilho paralelo ao do Claude: só USA as peças prontas (tools/esqueleto.py → HTML, KNV.cena/arteFinal no Photo) e não
muda nenhuma delas. Cada mão nova (Vetor, Editor) entra aqui como mais uma função + ferramenta no kani_agente.
Guia: Instructions/agente/kani-maos.md. Teste: py -3.13 testes/teste_kani_maos.py (porta 9338).

Ida e volta com a tela: enviar({id, acao, ...}) chama kaniMaos(...) no front (frontend/js/kani-maos.js), que roda e
responde por kani_maos_resposta(id, res) → responder(); pedir() espera essa resposta.
"""
import difflib
import importlib.util
import json
import os
import re
import threading
import time
import urllib.request

from Functions import kani

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
enviar = None          # main.py liga: lambda d: _js("kaniMaos", d)
_espera = {}           # id → [Event, resposta]


def _esqueleto():
    spec = importlib.util.spec_from_file_location("esqueleto_kani", os.path.join(RAIZ, "tools", "esqueleto.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def pedir(dados, timeout=900):
    if not enviar:
        raise RuntimeError("a tela do app não está ligada à Kani")
    i = f"m{time.time_ns()}"
    ev = threading.Event()
    _espera[i] = [ev, None]
    enviar({"id": i, **dados})
    try:
        if not ev.wait(timeout):
            raise RuntimeError("a tela demorou demais para responder")
        res = _espera[i][1] or {}
    finally:
        _espera.pop(i, None)
    if not res.get("ok"):
        raise RuntimeError(res.get("erro") or "a tela não conseguiu montar")
    return res


def responder(i, res):
    if i in _espera:
        _espera[i][1] = res
        _espera[i][0].set()
    return {"success": True}


# ── FLYER no Photo ──────────────────────────────────────────────────────────────────────────────────────────────
ESQ = {
    "gancho-heroi": "título gigante no alto + pessoa/objeto grande saindo pela borda",
    "eco-pessoa": "palavra gigante clarinha atrás + pessoa recortada na frente + título e texto ao lado",
    "foto-atmosfera": "foto de fundo inteira escurecida + título e texto embaixo",
    "objeto-dominante": "produto ocupa quase tudo, texto pequeno em cima",
    "texto-destaque": "só tipografia enorme, sem foto (frase forte, preço, número)",
    "foto-moldura": "foto dentro de uma forma (círculo, faixa...) + texto no espaço livre",
    "foto-lateral": "pessoa/objeto surgindo da lateral, texto do outro lado",
}
EST = {"impacto": "forte, esporte, promoção, festa popular", "elegante": "luxo, casamento, gastronomia fina, moda",
       "delicado": "infantil, beleza, chá, floral", "tecnologico": "tech, curso online, app, startup",
       "rustico": "churrasco, country, cerveja, campo", "minimalista": "arquitetura, clínica, consultoria, sóbrio"}
SCHEMA = {"type": "object", "properties": {
    "pensamento": {"type": "string"},
    "esqueleto": {"type": "string", "enum": list(ESQ)},
    "estilo": {"type": "string", "enum": list(EST)},
    "fundo": {"type": "string", "enum": ["escuro", "claro", "cor"]},
    "cor_primaria": {"type": "string"},
    "titulo": {"type": "string"}, "subtitulo": {"type": "string"},
    "infos": {"type": "array", "items": {"type": "string"}},
    "chamada": {"type": "string"},
    "foto_prompt": {"type": "string"}},
    "required": ["pensamento", "esqueleto", "estilo", "fundo", "cor_primaria", "titulo", "subtitulo", "infos", "chamada", "foto_prompt"]}
# teste de 10 pedidos (2026-10-13): 9/10; o exemplo de chamada virou "Garanta já" em 8 — agora sem exemplo
SISTEMA_FICHA = ("Você é a Kani, diretora de arte do app KANIVETE. Para o pedido de FLYER, preencha a ficha em JSON. O app monta.\n"
                 "ESQUELETOS:\n" + "\n".join(f"- {k}: {v}" for k, v in ESQ.items()) +
                 "\nESTILOS:\n" + "\n".join(f"- {k}: {v}" for k, v in EST.items()) +
                 "\nREGRAS: titulo com no máximo 6 palavras, sem inventar dados; infos = TODAS as informações concretas do pedido "
                 "(data, hora, local, preço, telefone, @), copiadas exatas, uma por item, SEM rótulo (ex.: '25/10 às 13h', não 'Data: 25/10'); "
                 "o que o pedido não diz NÃO entra (nunca 'a definir'); nomes próprios exatamente como no pedido; "
                 "chamada = verbo de ação curto que combine com ESTE tema (evite frases genéricas); "
                 "cor_primaria em #rrggbb combinando com o tema; foto_prompt em INGLÊS descrevendo a foto principal "
                 "(vazio só se esqueleto = texto-destaque). Textos em português do Brasil, sem emojis.")


def _llm_json(sistema, usuario, schema, max_tokens=600):
    """Chamada curta com a resposta travada no schema (Ollama ou llama.cpp da Kani)."""
    msgs = [{"role": "system", "content": sistema}, {"role": "user", "content": usuario}]
    if kani._ollama_tem():
        corpo = {"model": kani.OLLAMA_MODELO, "stream": False, "messages": msgs, "think": False, "format": schema,
                 "options": {"temperature": 0.3, "num_predict": max_tokens}}
        req = urllib.request.Request(kani.OLLAMA + "/api/chat", data=json.dumps(corpo).encode("utf-8"),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            out = json.loads(r.read().decode("utf-8")).get("message", {}).get("content", "")
    else:
        kani._subir()
        corpo = {"messages": msgs, "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
                 "chat_template_kwargs": {"enable_thinking": False}, "response_format": {"type": "json_object", "schema": schema}}
        req = urllib.request.Request(f"http://127.0.0.1:{kani._srv['porta']}/v1/chat/completions",
                                     data=json.dumps(corpo).encode("utf-8"), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            out = json.loads(r.read().decode("utf-8"))["choices"][0]["message"]["content"]
    return json.loads(out)


def conferir_nomes(pedido, ficha):
    """Nome próprio do pedido que saiu trocado ("Studio Equilíbrio" → "Estoque Equilíbrio") volta como estava."""
    nomes = re.findall(r"[A-ZÀ-Ý][\wÀ-ÿ'’]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][\wÀ-ÿ'’]+)+", pedido)
    import unicodedata
    sem_acento = lambda s: "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    acentuadas = {sem_acento(w).lower(): w for w in re.findall(r"[\wÀ-ÿ]+", pedido) if sem_acento(w) != w}

    def arrumar(t):
        # palavra do pedido que perdeu o acento ("TROVAO" → "TROVÃO"), na caixa em que veio
        t = re.sub(r"[\wÀ-ÿ]+", lambda m: (lambda w: (w.upper() if m.group(0).isupper() else w) if w else m.group(0))(
            acentuadas.get(m.group(0).lower()) if m.group(0) == sem_acento(m.group(0)) else None), t)
        for nome in nomes:
            if nome.lower() in t.lower():
                continue
            ws = nome.split()
            pad = r"\b" + r"\s+".join([r"[\wÀ-ÿ'’]+"] * len(ws)) + r"\b"
            for m in re.finditer(pad, t):
                vs = m.group(0).split()
                iguais = sum(a.lower() == b.lower() for a, b in zip(vs, ws))
                if 0 < iguais < len(ws) and all(a.lower() == b.lower() or difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio() >= 0.4
                                                for a, b in zip(vs, ws)):
                    t = t[:m.start()] + nome + t[m.end():]
                    break
        return t
    for k in ("titulo", "subtitulo", "chamada"):
        ficha[k] = arrumar(ficha.get(k) or "")
    ficha["infos"] = [arrumar(x) for x in ficha.get("infos") or []]
    return ficha


def ficha_flyer(pedido):
    f = _llm_json(SISTEMA_FICHA, pedido, SCHEMA)
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", f.get("cor_primaria") or ""):
        f["cor_primaria"] = "#ff3b22"
    # número que não está no pedido é dado inventado (o 4B pôs "21h" num show sem hora): sai
    nums = set(re.findall(r"\d+", pedido))
    inventado = lambda t: any(n not in nums for n in re.findall(r"\d+", t or ""))
    f["infos"] = [x for x in f.get("infos") or [] if not inventado(x)]
    for k in ("subtitulo", "chamada"):
        if inventado(f.get(k)):
            f[k] = ""
    return conferir_nomes(pedido, f)


# Composição própria de FLYER (feedback 2026-10-13 no 1º teste: o esqueleto de carrossel pôs o texto corrido em cima
# da pessoa, título sem peso e tudo numa caixa só). Aqui: foto e texto em áreas separadas, título pesado, cada
# informação na sua camada (chips, preço em destaque, botão), margem 7%.
W, H, M = 1080, 1350, 76
FONTES = {   # título, peso, texto, caixa alta, largura média da letra (em "em", para estimar o tamanho do título)
    "impacto": ("Anton", 400, "Inter", True, .46), "elegante": ("Playfair Display", 800, "Montserrat", False, .52),
    "delicado": ("Fraunces", 800, "Nunito", False, .52), "tecnologico": ("Space Grotesk", 700, "Inter", False, .55),
    "rustico": ("Alfa Slab One", 400, "Karla", True, .62), "minimalista": ("Inter", 900, "Inter", False, .56)}
# cena (palco, plateia, ambiente) não se recorta: vai para a foto no alto (show do Trovão virou uma tira, 2026-10-13)
_CENA = re.compile(r"\b(stage|crowd|audience|room|interior|landscape|street|scene|venue|party|restaurant|beach|city|"
                   r"table setting|people|group|outdoor|indoor|background|spread)\b", re.I)
_VAGO = re.compile(r"a definir|a confirmar|n[ãa]o informad|em breve|\?\?", re.I)
_PRECO = re.compile(r"R\$\s*\d|\d+\s*%|gr[áa]tis|\bfree\b|\boff\b", re.I)


def _hex(c):
    c = c.lstrip("#")
    return tuple(int(c[k:k + 2], 16) for k in (0, 2, 4))


def _mix(a, b, t):   # a → b em t (0..1)
    x, y = _hex(a), _hex(b)
    return "#%02x%02x%02x" % tuple(round(x[k] + (y[k] - x[k]) * t) for k in range(3))


def _lum(c):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return sum(f(v / 255) * w for v, w in zip(_hex(c), (0.2126, 0.7152, 0.0722)))


def _contraste(a, b):
    la, lb = _lum(a), _lum(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)


def _legivel(cor, fundo, minimo=3.2):
    alvo = "#ffffff" if _lum(fundo) < .4 else "#000000"
    for t in (0, .15, .3, .45, .6, .75):
        c = _mix(cor, alvo, t)
        if _contraste(c, fundo) >= minimo:
            return c
    return alvo


def _tam_titulo(txt, largura, ratio, maximo):
    n = max(len(txt), 4)
    linhas = 2 if n <= 16 else 3
    return int(min(maximo, largura * linhas / (n * ratio) * .92))


def flyer_html(f, foto=None):
    """Ficha → HTML do KNV.cena (1080×1350). Composição pelo esqueleto escolhido: topo (foto no alto, painel embaixo),
    recorte (pessoa/objeto recortado à direita, coluna de texto à esquerda) ou tipo (só tipografia)."""
    from html import escape as e
    tf, tp, xf, caixa, ratio = FONTES.get(f["estilo"], FONTES["impacto"])
    pri = f["cor_primaria"]
    bg = {"escuro": _mix(pri, "#0b0b0d", .9), "claro": _mix(pri, "#faf7f2", .93), "cor": _mix(pri, "#000000", .25)}.get(f["fundo"], "#141414")
    tinta = "#ffffff" if _lum(bg) < .4 else "#1d1b19"
    dest = _legivel(pri, bg) if f["fundo"] != "cor" else tinta
    esq = f["esqueleto"]
    modo = "tipo" if esq == "texto-destaque" or not (foto or f.get("foto_prompt")) else \
           "topo" if esq in ("foto-atmosfera", "foto-moldura") or _CENA.search(f.get("foto_prompt") or "") or foto else "recorte"
    titulo = f["titulo"].strip().strip("'\"’“”").strip()
    infos = [x.strip() for x in f.get("infos") or [] if x and x.strip() and not _VAGO.search(x) and "!" not in x
             and x.lower() not in (titulo + " " + (f.get("subtitulo") or "")).lower()]
    precos = [x for x in infos if _PRECO.search(x)][:1]
    chips = [x for x in infos if x not in precos][:4]
    src = foto.replace("\\", "/") if foto else "gerar:" + (f.get("foto_prompt") or "").strip()
    alta = "text-transform:uppercase;" if caixa else ""
    css = (f"body{{margin:0;width:{W}px;height:{H}px;background:{bg};color:{tinta};font-family:'{xf}';position:relative;overflow:hidden}}"
           f".tit{{font-family:'{tf}';font-weight:{tp};line-height:1.0;letter-spacing:-1px;margin:0;{alta}}}"
           f".sub{{font-size:36px;line-height:1.25;opacity:.85;margin:0}}"
           f".chips{{display:flex;flex-wrap:wrap;gap:14px}}"
           f".chip{{font-size:30px;font-weight:600;padding:14px 26px;border-radius:40px;background:{_mix(bg, tinta, .12)};color:{tinta}}}"
           f".preco{{font-family:'{tf}';font-weight:{tp};font-size:84px;line-height:1;color:{dest}}}"
           f".cta{{font-size:32px;font-weight:800;padding:22px 44px;border-radius:60px;background:{dest};"
           f"color:{'#111111' if _lum(dest) > .4 else '#ffffff'};{alta}box-shadow:0 10px 30px rgba(0,0,0,.25)}}")
    chips_h = ('<div id="infos" class="chips"{st}>' + "".join(f'<div id="info{k + 1}" class="chip">{e(c)}</div>' for k, c in enumerate(chips))
               + "</div>") if chips else ""
    sub_h = f'<p id="subtitulo" class="sub">{e(f["subtitulo"])}</p>' if f.get("subtitulo") else ""
    preco_h = ""
    if precos:   # valor grande, o resto ("por pessoa") pequeno embaixo
        m = re.match(r"\s*((?:R\$\s*)?[\d.,]+\s*%?(?:\s*off)?|gr[áa]tis)\s*(.*)", precos[0], re.I)
        val, resto = (m.group(1), m.group(2)) if m else (precos[0], "")
        preco_h = (f'<div id="preco" style="display:flex;flex-direction:column;gap:6px"><div id="valor" class="preco">{e(val.strip())}</div>'
                   + (f'<div id="valor-obs" style="font-size:28px;font-weight:600;opacity:.85">{e(resto.strip())}</div>' if resto.strip() else "")
                   + "</div>")
    cta_h = f'<div id="chamada" class="cta">{e(f["chamada"])}</div>' if f.get("chamada") else ""
    rodape = (f'<div id="rodape" style="position:absolute;left:{M}px;right:{M}px;bottom:{M}px;display:flex;align-items:center;'
              f'justify-content:space-between;gap:30px">{preco_h or "<div></div>"}{cta_h}</div>') if preco_h or cta_h else ""
    if modo == "topo":   # foto no alto, painel de texto embaixo; o degradê funde a foto no painel
        alt = 760
        tam = _tam_titulo(titulo, W - 2 * M, ratio, 118)
        corpo = (f'<img id="foto" src="{e(src)}" data-semente="7" data-recortar="nao" style="position:absolute;left:0;top:0;'
                 f'width:{W}px;height:{alt}px;object-fit:cover;object-position:50% 35%">'
                 f'<div id="fusao" style="position:absolute;left:0;top:{alt - 260}px;width:{W}px;height:262px;'
                 f'background:linear-gradient(180deg,{bg}00 0%,{bg} 100%)"></div>'
                 f'<div id="textos" style="position:absolute;left:{M}px;right:{M}px;top:{alt - 110}px;display:flex;flex-direction:column;gap:26px">'
                 f'<h1 id="titulo" class="tit" style="font-size:{tam}px">{e(titulo)}</h1>{sub_h}{chips_h.replace("{st}", "")}</div>')
    elif modo == "recorte":   # pessoa/objeto recortado à direita, texto em coluna à esquerda sobre o fundo liso
        col = 540
        tam = _tam_titulo(titulo, col, ratio, 156)
        corpo = (f'<div id="apoio" style="position:absolute;right:-120px;bottom:140px;width:720px;height:720px;border-radius:50%;'
                 f'background:{_mix(bg, pri, .55)}"></div>'
                 f'<img id="foto" data-livre data-inteiro data-pode-cortar="baixo direita" src="{e(src)}" data-semente="7" data-fundo="branco" data-recortar="ia" data-proporcao="3:4" '
                 f'style="position:absolute;right:-40px;bottom:0;width:640px;height:1060px;object-fit:contain;object-position:50% 100%">'
                 f'<div id="textos" style="position:absolute;left:{M}px;width:{col}px;top:{M + 40}px;display:flex;flex-direction:column;gap:28px">'
                 f'<h1 id="titulo" class="tit" style="font-size:{tam}px">{e(titulo)}</h1>{sub_h}'
                 f'{chips_h.replace("{st}", " style=\"flex-direction:column;align-items:flex-start\"")}</div>')
        if rodape:   # rodapé só na coluna de texto (não passa por cima da pessoa)
            rodape = (f'<div id="rodape" style="position:absolute;left:{M}px;width:{col}px;bottom:{M}px;display:flex;flex-direction:column;'
                      f'align-items:flex-start;gap:26px">{preco_h}{cta_h}</div>')
    else:   # só tipografia: título gigante no meio da altura, faixa de cor na borda
        tam = _tam_titulo(titulo, W - 2 * M, ratio, 190)
        corpo = (f'<div id="faixa" style="position:absolute;left:0;top:0;width:28px;height:{H}px;background:{dest}"></div>'
                 f'<div id="textos" style="position:absolute;left:{M}px;right:{M}px;top:0;bottom:240px;display:flex;flex-direction:column;'
                 f'justify-content:center;gap:34px"><h1 id="titulo" class="tit" style="font-size:{tam}px">{e(titulo)}</h1>{sub_h}'
                 f'{chips_h.replace("{st}", "")}</div>')
    return f"<style>{css}</style>{corpo}{rodape}", (tf, xf), modo


def montar_flyer(pedido, pasta, foto=None, on=None):
    """Pedido → ficha (Kani) → HTML de flyer → monta no Photo, na tela. Devolve {ficha, iknv, previa}."""
    on = on or (lambda *a: None)
    on(5, "Kani preenchendo a ficha do flyer...")
    f = ficha_flyer(pedido)
    html, fontes, modo = flyer_html(f, foto)
    f["_modo"] = modo
    est = _esqueleto().ESTILOS.get(f["estilo"], {})
    fin = {"cor": f["cor_primaria"], **est.get("fin", {})}   # arte-final do estilo (a mesma do carrossel)
    nome = "flyer_" + time.strftime("%Y%m%d_%H%M%S")
    iknv = os.path.join(pasta, nome + ".iknv")
    from Functions import kani_criar
    kani_criar._liberar_placa()         # a foto é gerada na placa: o motor da Kani sai antes
    on(20, f"Montando no Photo: {modo}, estilo {f['estilo']}...")
    res = pedir({"acao": "flyer", "html": html, "nome": f["titulo"][:40], "fontes": list(dict.fromkeys(fontes)),
                 "arteFinal": fin, "salvar": iknv.replace("\\", "/")})
    previa = os.path.join(pasta, nome + ".png")
    if res.get("png"):
        import base64
        with open(previa, "wb") as fh:
            fh.write(base64.b64decode(res["png"].split(",", 1)[-1]))
    return {"ficha": f, "iknv": iknv, "previa": previa if os.path.isfile(previa) else None, "avisos": res.get("avisos") or []}
