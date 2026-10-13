"""
kani_memoria.py — o que a Kani aprende com a pessoa, sem retreinar o modelo (como as memórias e receitas do Claude):
- PREFERÊNCIAS: "lembra que...", "daqui pra frente...", "prefiro..." viram notas permanentes que entram no prompt da conversa
  e do modo em etapas; "o que você sabe sobre mim?" lista; "esquece ..." apaga.
- EXEMPLOS: trabalho em etapas com 👍 vira exemplo (pedido + sequência de ações que deu certo); nos pedidos parecidos os
  2 mais próximos entram no prompt do agente. Com o tempo, esse acervo também serve de base para um ajuste fino (LoRA).
Arquivos em <disco do app>/Kanivete/Kani (kani_memoria.json e kani_exemplos.json) — nada no C.
"""
import json
import os
import re
import time

_LEMBRAR = re.compile(r"^\s*(?:kani,?\s*)?(?:lembr[ae](?:-se)?(?: de)? que|anot[ae](?: a[ií])? que|guard[ae] que|grav[ae] que|"
                      r"daqui (?:pra|para) frente,?|de agora em diante,?|a partir de agora,?|sempre que|nunca mais|prefiro|eu prefiro|"
                      r"n[aã]o gosto de|gosto (?:mais )?(?:de|que))\s*(.+)$", re.I | re.S)
_ESQUECER = re.compile(r"^\s*(?:kani,?\s*)?(?:esque[cç]a|esquece|apaga|apague|tira|tire)\s+(?:que|a nota|da mem[oó]ria)?\s*(.+)$", re.I | re.S)
_LISTAR = re.compile(r"(o que voc[eê] (?:sabe|lembra) (?:sobre|de) mim|suas? (?:notas|mem[oó]rias)|minhas prefer[eê]ncias)", re.I)


def _dir():
    from Functions.midia import raiz_dados
    p = os.path.join(raiz_dados(), "Kani")
    os.makedirs(p, exist_ok=True)
    return p


def _ler(nome):
    try:
        with open(os.path.join(_dir(), nome), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def _gravar(nome, dados):
    p = os.path.join(_dir(), nome)
    with open(p + ".tmp", "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    os.replace(p + ".tmp", p)


def notas():
    return _ler("kani_memoria.json")


def comando(texto):
    """Mensagem de memória? Devolve a resposta pronta (sem passar pela IA) ou None."""
    t = (texto or "").strip()
    if _LISTAR.search(t):
        ns = notas()
        return ("Ainda não anotei nada. Diga \"lembra que...\" e eu guardo." if not ns else
                "O que eu sei sobre você:\n" + "\n".join(f"- {n['texto']}" for n in ns))
    m = _ESQUECER.match(t)
    if m and notas():
        alvo = m.group(1).strip(" .!").lower()
        ns = notas()
        fica = [n for n in ns if alvo not in n["texto"].lower()]
        if len(fica) < len(ns):
            _gravar("kani_memoria.json", fica)
            return f"Esqueci ({len(ns) - len(fica)} nota{'s' if len(ns) - len(fica) > 1 else ''})."
        return None
    m = _LEMBRAR.match(t)
    if m:
        gatilho = t[:m.start(1)].strip().lower()
        corpo = m.group(1).strip(" .!")
        # "prefiro X" / "não gosto de X" / "sempre que X" guardam a frase inteira (o gatilho faz parte do sentido)
        nota = corpo if re.match(r"^(?:kani,?\s*)?(?:lembr|anot|guard|grav)", gatilho) else t.strip(" .!")
        nota = nota[0].upper() + nota[1:] if nota else nota
        ns = [n for n in notas() if n["texto"].lower() != nota.lower()]
        ns.append({"texto": nota[:300], "quando": time.strftime("%Y-%m-%d")})
        _gravar("kani_memoria.json", ns[-60:])
        return f"Anotado! Daqui pra frente vou levar isso em conta: {nota}"
    return None


def bloco_prompt():
    """As preferências para o prompt (vazio se não houver)."""
    ns = notas()
    return ("PREFERÊNCIAS DA PESSOA (aprendidas na conversa; siga sempre):\n" + "\n".join(f"- {n['texto']}" for n in ns[-25:])) if ns else ""


# ─────────────────────────── exemplos (👍 no modo em etapas) ───────────────────────────
def _tok(s):
    return {w for w in re.findall(r"[a-zà-ú0-9]{4,}", (s or "").lower())}


def guardar_exemplo(pedido, passos, nota):
    """passos: [{acao, args}] na ordem; nota: 1 (👍) ou -1 (👎). Só os 👍 viram exemplo; os 👎 ficam para análise."""
    ex = _ler("kani_exemplos.json")
    ex.append({"pedido": pedido[:400], "passos": passos[:12], "nota": nota, "quando": time.strftime("%Y-%m-%d %H:%M")})
    _gravar("kani_exemplos.json", ex[-200:])


def exemplos_para(pedido, n=2):
    """Os n exemplos 👍 mais parecidos com o pedido (palavras em comum), em texto curto para o prompt."""
    alvo = _tok(pedido)
    bons = [e for e in _ler("kani_exemplos.json") if e.get("nota", 0) > 0]
    bons.sort(key=lambda e: -len(alvo & _tok(e["pedido"])))
    out = []
    for e in bons[:n]:
        if not alvo & _tok(e["pedido"]):
            break
        seq = " → ".join(f"{p['acao']}({', '.join(f'{k}={str(v)[:60]}' for k, v in (p.get('args') or {}).items())})" for p in e["passos"])
        out.append(f"Pedido: {e['pedido']}\nAções que deram certo: {seq}")
    return ("EXEMPLOS QUE A PESSOA APROVOU (use como modelo de passos e de capricho):\n" + "\n\n".join(out)) if out else ""
