"""Pastas padrão de uma peça (card) do Pailer: <mês>/<nn - TIPO - TÍTULO>/ com BRUTO, ASSETS, PROJETO e RENDER.

Os nomes variam ("01 - BRUTO", "BRUTOS", "03 - PROJETO - X", "04 - RENDERS", "RENDER"): a busca é pela palavra.
O card é a pasta que tem a subpasta PROJETO ou RENDER; vale passar o arquivo do projeto, a pasta PROJETO ou o card.
"""
import os
import re

PADRAO = {"bruto": r"BRUTOS?", "assets": r"ASSETS?", "projeto": r"PROJETOS?", "render": r"RENDERS?"}
ORDEM = ("bruto", "assets", "projeto", "render")


def _sub(base, chave):
    """Subpasta de `base` cujo nome (tirando o número do começo) começa pela palavra da chave."""
    rx = re.compile(r"^(\d+\s*-\s*)?" + PADRAO[chave] + r"\b", re.I)
    try:
        nomes = sorted(n for n in os.listdir(base) if rx.match(n) and os.path.isdir(os.path.join(base, n)))
    except OSError:
        return None
    return os.path.join(base, nomes[0]) if nomes else None


def pasta_card(caminho, subir=2):
    """Pasta do card que contém `caminho` (arquivo ou pasta), subindo até `subir` níveis; None fora de um card."""
    if not caminho:
        return None
    atual = caminho if os.path.isdir(caminho) else os.path.dirname(caminho)
    for _ in range(subir + 1):
        if not atual or not os.path.isdir(atual):
            return None
        if _sub(atual, "projeto") or _sub(atual, "render"):
            return atual
        pai = os.path.dirname(atual)
        if pai == atual:
            return None
        atual = pai
    return None


def pasta(caminho, chave):
    """Subpasta `chave` (bruto|assets|projeto|render) do card de `caminho`; None se não existir."""
    card = pasta_card(caminho)
    return _sub(card, chave) if card else None


def pasta_render(caminho):
    return pasta(caminho, "render")


def pasta_projeto(caminho):
    return pasta(caminho, "projeto")


def criar_subpastas(card, nome_projeto=None):
    """Garante as 4 subpastas (mantém as que já existem com outro nome). Devolve {chave: caminho}."""
    out = {}
    for i, k in enumerate(ORDEM, 1):
        p = _sub(card, k)
        if not p:
            nome = {"bruto": "BRUTO", "assets": "ASSETS", "projeto": "PROJETO", "render": "RENDER"}[k]
            if k == "projeto" and nome_projeto:
                nome += " - " + nome_projeto
            p = os.path.join(card, f"{i:02d} - {nome}")
            os.makedirs(p, exist_ok=True)
        out[k] = p
    return out
