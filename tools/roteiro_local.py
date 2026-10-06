"""Briefing → roteiro JSON do tools/esqueleto.py pelo modelo LOCAL (Ollama; o Jr). O modelo só escreve o roteiro curto;
diagramação, acabamento e conferência ficam com o esqueleto.py + revisor (sem gastar token do Claude).

uso: py -3.13 tools/roteiro_local.py "briefing" --saida roteiro.json [--modelo qwen3:8b] [--slides 5] [--montar] [--exportar pasta]
  valida (esqueleto existe, gancho ≤ 8 palavras, corpo ≤ 40, sem esqueleto repetido em sequência, prompt de asset em
  inglês) e devolve os erros ao modelo uma vez para corrigir."""
import argparse, json, os, re, subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from esqueleto import ESQUELETOS
import direcao_mapa

REGRAS = """Você é diretor de arte de carrossel de Instagram. Responda SÓ com um JSON no formato do exemplo.
Regras:
- 1 ideia por slide. Slide 1 = gancho que prende (pergunta ou afirmação forte). Último = virada + ação (salvar/compartilhar).
- "gancho": até 6–8 palavras, com 1–2 palavras de destaque entre *asteriscos*. Use | para quebrar a linha entre frases.
- "sub": 1 frase curta. "corpo": lista de 1–3 frases curtas (até 40 palavras no slide), **negrito** só no essencial.
- Marque no máximo 1 trecho por slide com [trecho](circulo|sublinhado|tarja).
- "esqueleto" por papel: capa=gancho-heroi; explicação=texto-respiro ou papel; prova/história/pessoa=eco-pessoa ou
  foto-atmosfera; fechamento=virada-cta. Nunca o mesmo esqueleto em dois slides seguidos.
- "fundo": alterne claro/escuro/cor para dar ritmo (virada-cta costuma ser "cor").
- "asset.prompt" EM INGLÊS: objeto ou pessoa que seja METÁFORA do slide, realista, "studio product photo, soft light"
  para objeto; "editorial portrait ..., waist up" para pessoa. papel e foto-atmosfera: foto-atmosfera usa cenário
  sem pessoas. Nada de ícone ou ilustração genérica.
- eco-pessoa leva "eco" (1 palavra-tema) e "titulo" em vez de "gancho".
- Formas só com função: capa já tem mancha de apoio; "orbita": true só em retrato elegante; "etiquetas": até 2
  palavras curtas que rotulam a pessoa/objeto; "supergrafico": true no máximo em 1 slide de texto com fundo vazio.
- "pontes": 1 ou 2 entre slides ({"depois": n, "tipo": "fita|rasgo"}), nunca depois do slide 1 (a capa já atravessa
  com "ponte": true no asset).
- O texto é SEU, sobre o briefing: não copie frases do exemplo, não descreva a imagem no texto, nada de "saiba mais".
- Todo item do briefing aparece (ex.: as 3 trocas, cada uma com espaço). "marca" só com "primaria" (cor)."""


def chat(modelo, msgs, timeout=600):
    corpo = json.dumps({"model": modelo, "messages": msgs, "stream": False, "format": "json", "think": False,
                        "options": {"temperature": 0.4, "num_ctx": 8192}}).encode()
    rq = urllib.request.Request("http://127.0.0.1:11434/api/chat", corpo, {"Content-Type": "application/json"})
    with urllib.request.urlopen(rq, timeout=timeout) as f: return json.load(f)["message"]["content"]


def validar(r, n, exemplo="", itens=()):
    e = []
    # trechos de 4 palavras iguais aos do exemplo = cópia
    tri = lambda t: {" ".join(w[i:i + 4]) for w in [re.findall(r"[\wÀ-ú]+", t.lower())] for i in range(len(w) - 3)}
    textos = lambda ss: " | ".join(t for s in ss for k in ("pre", "gancho", "titulo", "sub", "corpo", "eco")
                                   for t in ([s[k]] if isinstance(s.get(k), str) else s.get(k) or []))   # só o texto (não campos nem CTA padrão)
    txt = textos(r.get("slides") or [])
    try: ex_txt = textos(json.loads(exemplo).get("slides", []))
    except (ValueError, AttributeError): ex_txt = exemplo
    copiados = tri(txt) & tri(ex_txt)
    if copiados: e.append("copiou frases do exemplo: " + "; ".join(sorted(copiados)[:3]))
    if re.search(r"saiba mais|clique|confira", txt, re.I): e.append("tire 'saiba mais/clique/confira' (cara de site)")
    for it in itens:
        if it.lower() not in txt.lower(): e.append(f"faltou o item do briefing: {it}")
    if any(p.get("depois") == 1 for p in r.get("pontes") or []): e.append("ponte depois do slide 1 bate no objeto que atravessa: use outro slide")
    ss = r.get("slides") or []
    if len(ss) != n: e.append(f"são {n} slides, vieram {len(ss)}")
    pal = lambda t: len(re.findall(r"[\wÀ-ú]+", re.sub(r"\[([^\]]+)\]\([a-z]+\)", r"\1", t or "")))
    for i, s in enumerate(ss, 1):
        es = s.get("esqueleto")
        if es not in ESQUELETOS: e.append(f"slide {i}: esqueleto '{es}' não existe ({', '.join(ESQUELETOS)})")
        if i > 1 and es == ss[i - 2].get("esqueleto"): e.append(f"slide {i}: mesmo esqueleto do slide anterior")
        g = s.get("gancho") or s.get("titulo") or ""
        if pal(g) > 9: e.append(f"slide {i}: gancho com {pal(g)} palavras (máx. 8)")
        c = s.get("corpo") or []
        if sum(pal(x) for x in ([c] if isinstance(c, str) else c)) > 40: e.append(f"slide {i}: corpo passa de 40 palavras")
        p = (s.get("asset") or {}).get("prompt", "")
        if p and re.search(r"[ãõçéêáíóú]| de | para | com ", p): e.append(f"slide {i}: asset.prompt tem que ser em inglês")
        if es in ("gancho-heroi", "eco-pessoa") and not p: e.append(f"slide {i}: {es} precisa de asset.prompt")
    if ss and ss[0].get("esqueleto") != "gancho-heroi": e.append("slide 1 tem que ser gancho-heroi")
    if ss and ss[-1].get("esqueleto") != "virada-cta": e.append("último slide tem que ser virada-cta")
    return e


def pedir(modelo, instr, campos):
    """microtarefa: uma instrução curta → JSON com os campos pedidos (modelo pequeno rende mais assim)"""
    msgs = [{"role": "system", "content": "Você é redator de carrossel de Instagram em português do Brasil. Frases curtas, "
             "concretas, tom de conversa. Não descreva imagens. Responda só JSON com os campos: " + campos},
            {"role": "user", "content": instr}]
    try: return json.loads(chat(modelo, msgs))
    except (json.JSONDecodeError, KeyError): return {}


def etapas(briefing, itens, modelo, primaria, estilo=None):
    """estrutura 'lista' por regra (capa → 1 slide por item → virada) e cada slide numa chamada curta, sem exemplo
    para copiar; esqueletos, fundos e pontes por regra; prompts de objeto numa chamada própria (em inglês)"""
    n = len(itens) + 2
    capa = pedir(modelo, f"Briefing: {briefing}\nSlide 1 de {n} (capa). Escreva um gancho de no máximo 7 palavras que "
                 "prenda (afirmação forte ou pergunta), com a palavra mais forte entre *asteriscos*, e um sub de 1 frase "
                 "que prometa o que vem nos próximos slides.", '"gancho", "sub"')
    feitos, slides, usadas = [], [], []
    destaque = lambda t: re.findall(r"\*([^*]+)\*", t or "")
    for k, it in enumerate(itens, 1):
        s = pedir(modelo, f"Briefing: {briefing}\nSlide {k + 1} de {n}: item {k} de {len(itens)} = '{it}'.\n"
                  f"Já escritos (não repita frases, estrutura nem ideias): {json.dumps(feitos, ensure_ascii=False)}\n"
                  f"Palavras de destaque já usadas, PROIBIDAS: {usadas or 'nenhuma'}.\n"
                  "Escreva um titulo de no máximo 5 palavras com o item e um benefício DIFERENTE dos anteriores (ex.: saciedade, "
                  "energia, praticidade, sabor), com 1 palavra entre *asteriscos*, e corpo com 2 frases curtas (até 24 palavras) "
                  "com um detalhe concreto desse item (quanto tempo leva, como montar, o que ele resolve); **negrito** em 2 palavras.",
                  '"titulo", "corpo" (lista de 2 frases)')
        usadas += [w.lower() for w in destaque(s.get("titulo"))]
        feitos.append(s); slides.append(s)
    fim = pedir(modelo, f"Briefing: {briefing}\nÚltimo slide ({n} de {n}): virada. Já escritos: {json.dumps([capa] + feitos, ensure_ascii=False)}\n"
                "Escreva o contraste em DUAS palavras-chave: 'menos' = o que a pessoa deve largar (1–2 palavras) e 'mais' = o "
                "que ganha (1–2 palavras); e corpo com 1 frase convidando a salvar o post.", '"menos", "mais", "corpo"')
    if fim.get("menos") and fim.get("mais"):       # a frase de virada é montada por regra: "Menos X. | Mais *Y*."
        fim["gancho"] = f"Menos {fim['menos'].strip(' .').lower()}. | Mais *{fim['mais'].strip(' .*').lower()}*."
    vis = pedir(modelo, f"Briefing: {briefing}\nPara cada item, um objeto REAL que represente o item, em inglês, foto de "
                f"produto: {json.dumps(itens, ensure_ascii=False)}. Mais um objeto-metáfora para a capa e um para o fim.",
                '"capa", "itens" (lista em inglês, mesma ordem), "fim"')
    pt = lambda t: not t or bool(re.search(r"[ãõçéêáíóúâ]|\b(de|para|com|não|que)\b", t, re.I)) or len(t.split()) > 10
    for chave in ("capa", "fim"):
        if pt(vis.get(chave)):    # veio frase em português: pede só o objeto, em inglês
            ideia = capa.get("gancho") if chave == "capa" else fim.get("gancho")
            v = pedir(modelo, f"Um objeto real e fotografável que seja metáfora de: '{ideia}' (tema: {briefing[:120]}). "
                      "Responda o nome do objeto EM INGLÊS, até 6 palavras, sem verbo.", '"objeto"')
            vis[chave] = v.get("objeto") if not pt(v.get("objeto")) else None
    vis["itens"] = [x if not pt(x) else None for x in (vis.get("itens") or [])]
    vis["itens"] += [None] * (len(itens) - len(vis["itens"]))
    for k, it in enumerate(itens):                 # item sem objeto: pede só ele (microtarefa)
        if not vis["itens"][k]:
            v = pedir(modelo, f"Nome em inglês (até 5 palavras) do objeto real que mostra '{it}' numa foto de produto.", '"objeto"')
            vis["itens"][k] = v.get("objeto") if not pt(v.get("objeto")) else None
    boas = [x for x in vis["itens"] if x]          # sem objeto bom para capa/fim: usa os dos itens (regra, não modelo)
    vis["capa"] = vis.get("capa") or (f"breakfast flat lay with {boas[0]}" if boas else "ceramic coffee mug")
    vis["fim"] = vis.get("fim") or (boas[-1] if boas else "ceramic coffee mug")
    for s, it in zip(slides, itens):               # "Pão + ovo *praticidade*" → "Pão + ovo = *praticidade*"
        t = re.sub(r"\s*[:=]+\s*[:=]*\s*", " = ", s.get("titulo") or "", count=1).strip(" =")   # "= :" / ":" → " = "
        if t.lower().startswith(it.lower()) and "=" not in t: s["titulo"] = it[:1].upper() + it[1:] + " = " + t[len(it):].strip()
        elif "=" not in t and "*" in t: s["titulo"] = re.sub(r"\s*\*", " = *", t, count=1)   # "Café com leite *sabor*"
    if fim.get("gancho"):   # virada = 2 frases curtas: corta o que vier depois e quebra entre elas
        fr = [f.strip() for f in re.findall(r"[^.!?|]+[.!?]?", fim["gancho"].replace("|", ".")) if f.strip(" .!?")][:2]
        if len(fr) == 2:   # a 2ª frase acaba no destaque (*palavra*); sem destaque, 3 palavras
            m2 = re.match(r".*?\*[^*]+\*", fr[1])
            fr[1] = (m2.group(0) if m2 else " ".join(fr[1].split()[:3])).rstrip(" .") + "."
        fim["gancho"] = " | ".join(fr)
    obj = lambda t: f"{t}, studio product photo, soft light, isolated" if t else ""
    foto = lambda t: f"editorial photo of {t}, natural light, shallow depth of field, real scene" if t else ""
    # estilo e sequência de layouts pelo mapa de direção de arte (tools/direcao_mapa.py) — cada tema com a sua cara
    sug = direcao_mapa.sugerir(briefing); est = estilo or sug["estilo"]
    capa_l, ciclo, fim_l = direcao_mapa.ESTILOS[est][4]
    lista = lambda c: [c] if isinstance(c, str) else (c or [])
    sl0 = {"esqueleto": capa_l, "fundo": "claro", "gancho": capa.get("gancho", ""), "sub": capa.get("sub", "")}
    if capa_l == "gancho-heroi": sl0["asset"] = {"prompt": obj(vis.get("capa")), "semente": 7, "ponte": True}
    elif capa_l == "foto-lateral":   # pessoa que representa o briefing (microtarefa)
        pe = pedir(modelo, f"Briefing: {briefing}\nDescreva EM INGLÊS, em até 18 palavras, a pessoa para um retrato editorial "
                   "(quem é, idade, roupa, expressão), sem cenário.", '"pessoa"').get("pessoa")
        sl0.update(orbita=est == "elegante", asset={"prompt": f"editorial portrait of {pe or 'a smiling professional woman in her 30s'}, warm studio light, waist up",
                                                     "semente": 7, "pele": True})
    r = {"estilo": est, "marca": {"primaria": primaria}, "slides": [sl0]}
    fundos_ciclo = ["escuro", "claro"]
    for k, s in enumerate(slides):
        lay = ciclo[k % len(ciclo)]; es, _, forma_m = lay.partition(":")
        c, t, p = lista(s.get("corpo")), s.get("titulo", ""), (vis.get("itens") or [None] * len(itens))[k]
        sl = {"esqueleto": es, "fundo": fundos_ciclo[k % 2]}
        if es in ("papel", "texto-destaque", "foto-moldura", "objeto-dominante"): sl["gancho"] = t
        else: sl["titulo"] = t
        if es == "objeto-dominante": sl["sub"] = c[0] if c else ""
        else: sl["corpo"] = c
        if es == "foto-moldura": sl.update(moldura_forma=forma_m or "retangulo", asset={"prompt": foto(p), "semente": 7 + k} if p else None)
        elif es in ("texto-respiro", "objeto-dominante") and p: sl["asset"] = {"prompt": obj(p), "semente": 7 + k, "lado": "esquerda" if k % 2 else "direita"}
        if sl.get("asset") is None: sl.pop("asset", None)
        r["slides"].append(sl)
    fc = lista(fim.get("corpo"))
    if fim_l == "virada-cta":
        r["slides"].append({"esqueleto": "virada-cta", "fundo": "cor", "gancho": fim.get("gancho", ""), "corpo": fc,
                            "cta": "Salve este post", "asset": {"prompt": obj(vis.get("fim")), "semente": 9}})
    else:
        r["slides"].append({"esqueleto": fim_l, "fundo": "claro", "gancho": fim.get("gancho", ""), "sub": fc[0] if fc else "",
                            "asset": {"prompt": obj(vis.get("fim")), "semente": 9}})
    fundos = [s["fundo"] for s in r["slides"]]
    r["pontes"] = [{"depois": k + 1, "tipo": "rasgo"} for k in range(1, n - 1) if fundos[k] != fundos[k + 1] and fundos[k + 1] != "cor"][:1]
    return r


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("briefing"); ap.add_argument("--saida", required=True)
    ap.add_argument("--modelo", default="qwen3:8b"); ap.add_argument("--slides", type=int, default=5)
    ap.add_argument("--itens", default="", help="itens obrigatórios do briefing separados por ; (ex.: 'pão;iogurte;castanhas')")
    ap.add_argument("--montar", action="store_true"); ap.add_argument("--exportar"); ap.add_argument("--exemplo",
        default=r"D:\kanivete_biblioteca\modelos\carrossel-esqueletos-demo\demo.json")
    ap.add_argument("--etapas", action="store_true", help="lista em microtarefas (precisa de --itens)"); ap.add_argument("--primaria", default="#ff3b22")
    ap.add_argument("--perfil", help="nome;cargo;@usuario"); ap.add_argument("--estilo", help="força o estilo (senão o mapa sugere)")
    a = ap.parse_args()
    if a.etapas:
        t0 = time.time()
        r = etapas(a.briefing, [x.strip() for x in a.itens.split(";") if x.strip()], a.modelo, a.primaria, a.estilo)
        print(f"estilo: {r['estilo']} · layouts: {', '.join(s['esqueleto'] for s in r['slides'])}")
        if a.perfil:
            nm, cg, us = (a.perfil.split(";") + ["", "", ""])[:3]
            r["perfil"] = {"nome": nm, "cargo": cg}; r["usuario"] = us
        print(f"etapas: {len(r['slides'])} slides em {time.time() - t0:.0f}s")
        with open(a.saida, "w", encoding="utf-8") as f: json.dump(r, f, ensure_ascii=False, indent=1)
        print(f"roteiro: {a.saida}")
        if a.montar:
            sys.exit(subprocess.call([sys.executable, os.path.join(AQUI, "esqueleto.py"), a.saida, "--montar"] + (["--exportar", a.exportar] if a.exportar else [])))
        sys.exit(0)
    ex = open(a.exemplo, encoding="utf-8").read()
    msgs = [{"role": "system", "content": REGRAS + "\n\nExemplo (outro tema, 6 slides):\n" + ex},
            {"role": "user", "content": f"Briefing: {a.briefing}\nFaça {a.slides} slides."}]
    t0 = time.time()
    for volta in range(2):
        txt = chat(a.modelo, msgs)
        try: r = json.loads(txt)
        except json.JSONDecodeError: r, erros = {}, ["não veio JSON válido"]
        else: erros = validar(r, a.slides, ex, [x.strip() for x in a.itens.split(";") if x.strip()])
        print(f"volta {volta + 1}: {len(erros)} erro(s) em {time.time() - t0:.0f}s" + (": " + "; ".join(erros) if erros else ""))
        if not erros: break
        msgs += [{"role": "assistant", "content": txt}, {"role": "user", "content": "Corrija só isto e devolva o JSON inteiro: " + "; ".join(erros)}]
    r["marca"] = {"primaria": (r.get("marca") or {}).get("primaria", "#ff3b22")}   # fonte/cores extras: só o kit decide
    with open(a.saida, "w", encoding="utf-8") as f: json.dump(r, f, ensure_ascii=False, indent=1)
    print(f"roteiro: {a.saida}")
    if a.montar:
        cmd = [sys.executable, os.path.join(AQUI, "esqueleto.py"), a.saida, "--montar"] + (["--exportar", a.exportar] if a.exportar else [])
        sys.exit(subprocess.call(cmd))
