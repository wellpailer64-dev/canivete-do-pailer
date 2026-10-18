"""
legenda_premium.py — a Kani escolhe, lendo o texto, a palavra de destaque de cada título da Legenda Premium
(frontend/js/editor-legenda-premium.js: veLpKani). Quais blocos viram título continua com a montagem automática do
editor (notas por gancho, número, nome, pergunta, palavra longa): no teste do Pailer (2026-10-18) a Kani escolhendo os
títulos ficou pior que a regra — ela marcava poucos e os errados. Aqui ela só refina o destaque, com exemplos.
"""

import json
import re

_SISTEMA = """Você escolhe a palavra de destaque de títulos animados em vídeos curtos em português.
Cada título vem numerado, com as palavras numeradas a partir de 0. Escolha a palavra que carrega o sentido e a emoção do
título: a mais forte, a que a pessoa enfatiza ao falar (adjetivo forte, número, nome, verbo de ação, a palavra nova da
ideia). Nunca artigo, preposição, conjunção, pronome ou verbo fraco (é, ser, ter, ir, fazer).
Exemplos:
0: ninguém(0) odeia(1) editar(2) -> 2
1: legendas(0) dinâmicas(1) -> 1
2: mais(0) de(1) 20(2) títulos(3) -> 2
3: com(0) animações(1) e(2) com(3) personalidade(4) -> 4
4: link(0) na(1) bio(2) -> 2
5: é(0) o(1) tempo(2) que(3) leva(4) -> 2
Responda SÓ com JSON: [{"i":0,"destaque":2}, ...] — um objeto por título recebido."""


def _lote(blocos, idx):
    from Functions.kani_criar import _llm
    linhas = [f"{i}: " + " ".join(f"{w}({j})" for j, w in enumerate(blocos[i])) for i in idx]
    out = _llm(_SISTEMA, "\n".join(linhas), max_tokens=40 + 16 * len(idx), temperatura=0.1)
    if not out:
        return None
    m = re.search(r"\[.*\]", out, re.S)
    if not m:
        return None
    try:
        lista = json.loads(m.group(0))
    except Exception:
        return None
    res = {}
    for o in lista:
        if not isinstance(o, dict):
            continue
        try:
            i, d = int(o.get("i")), int(o.get("destaque", -1))
        except Exception:
            continue
        if i in idx and 0 <= d < len(blocos[i]):
            res[i] = d
    return res


def refinar(blocos, titulos=None):
    """blocos = [[palavra, ...], ...]; titulos = índices dos blocos que são título →
    {success, destaques: {índice: palavra}} (em lotes de 30 títulos)."""
    blocos = [[str(w) for w in b][:12] for b in (blocos or [])][:600]
    idx = [int(i) for i in (titulos or []) if 0 <= int(i) < len(blocos) and len(blocos[int(i)]) >= 2]
    if not idx:
        return {"success": False, "error": "Nenhum título com mais de uma palavra para refinar"}
    saida, algum = {}, False
    for k in range(0, len(idx), 30):
        r = _lote(blocos, idx[k:k + 30])
        if r is None:
            if not algum:
                return {"success": False, "error": "A Kani não está disponível (abra a Kani uma vez para baixar o modelo)"}
            continue
        algum = True
        saida.update(r)
    return {"success": True, "destaques": {str(i): d for i, d in saida.items()}}
