"""Regressão do MCP de vídeo (keyframes, easings, animações de clipe, sobreposições, revisão obrigatória).

Precisa do app de teste na porta 9333 (ver CLAUDE.md, seção Testar). Sai com código 1 se algo falhar.
Uso: py -3.13 testes/teste_mcp_video.py
"""
import json
import os
import sys
import time

RAIZ_KANICODE = "D:/Kanivete/Plugins/kanicode"
ARQ = "D:/kanivete_testes/cultsp2/teste.vknv"
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, RAIZ_KANICODE)

import mcp_kanivete as m  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

falhas = []


def conferir(nome, cond, detalhe=""):
    print(("OK   " if cond else "FALHA"), nome, "" if cond else detalhe)
    if not cond:
        falhas.append(nome)


with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    pg.evaluate("a => abrirProjetoExterno(a)", ARQ)
    for _ in range(120):
        time.sleep(2)
        if pg.evaluate("() => !!(VE.ready && (VE.clips||[]).length)"):
            break
    info = pg.evaluate("() => ({st: VE.clips[0].st, dur: veEnd(VE.clips[0]) - VE.clips[0].st})")
    b.close()

ad = m.AdaptadorKanivete()


def revisao():
    _, rev = m._revisao_atual(ad, "video")
    return rev


def run(cmd, args, com_revisao=True):
    a = {"dominio": "video", "comando": cmd, "argumentos": args}
    if com_revisao:
        a["revisao"] = revisao()
    return m._executar_comando(a, ad)


def dados_resultado(r):
    try:
        return json.loads((r.get("dados") or {}).get("resultado") or "{}")
    except (TypeError, ValueError):
        return {}


t = round(info["st"] + min(0.3, info["dur"] / 2), 3)

# 1) revisão obrigatória em escrita de vídeo
r = m._executar_comando({"dominio": "video", "comando": "ganho_clipe", "argumentos": {"indice": 0, "db": -1}}, ad)
conferir("escrita sem revisao recusada", r.get("codigo") == "revisao_necessaria", str(r)[:200])

# 2) keyframe criar, editar com easing novo, listar, remover
r = run("keyframe", {"indice": 0, "prop": "x", "t": t, "valor": 10})
conferir("keyframe criar", r.get("ok") is True, str(r)[:200])
r = run("editar_keyframe", {"indice": 0, "prop": "x", "t": t, "valor": 25, "interp": "elas"})
conferir("editar_keyframe com elas", r.get("ok") is True, str(r)[:200])
lst = dados_resultado(run("listar_keyframes", {"indice": 0}, com_revisao=False))
ks = [k for k in lst.get("keyframes", []) if k.get("prop") == "x" and abs(k.get("tempo_timeline", -9) - t) < 1e-3]
conferir("listar mostra valor 25 e interp elas", bool(ks) and ks[0]["valor"] == 25 and ks[0]["interpolacao"] == "elas", str(lst)[:300])
r = run("editar_keyframe", {"indice": 0, "prop": "x", "t": round(t + 1.7, 3), "valor": 3})
conferir("editar sem keyframe recusado", r.get("ok") is False, str(r)[:200])
r = run("editar_keyframe", {"indice": 0, "prop": "xyz", "t": t, "valor": 3})
conferir("prop invalida recusada", r.get("ok") is False, str(r)[:200])
r = run("editar_keyframe", {"indice": 0, "prop": "x", "t": t, "valor": 3, "interp": "bogus"})
conferir("interp invalida recusada", r.get("ok") is False, str(r)[:200])
r = run("remover_keyframe", {"indice": 0, "prop": "x"})
conferir("limpeza keyframe", r.get("ok") is True, str(r)[:200])

# 3) animação nativa de clipe (catálogo do DeepSeek)
la = dados_resultado(run("listar_animacoes_clipe", {}, com_revisao=False))
lista_an = la.get("animacoes") or []
conferir("listar_animacoes_clipe devolve catálogo", len(lista_an) > 0, str(la)[:200])
if lista_an:
    preset = lista_an[0]["preset"]
    r = run("animacao_clipe", {"indice": 0, "lado": "in", "preset": preset})
    conferir("animacao_clipe entrada", r.get("ok") is True, str(r)[:200])
    r = run("animacao_clipe", {"indice": 0, "lado": "in", "preset": preset, "remover": True})
    conferir("animacao_clipe remove", r.get("ok") is True, str(r)[:200])

# 4) sobreposição nativa (veOvtAdd)
ls = dados_resultado(run("listar_sobreposicoes", {}, com_revisao=False))
tipos = ls.get("sobreposicoes") or ls.get("tipos") or []
conferir("listar_sobreposicoes devolve tipos", len(tipos) > 0, str(ls)[:200])
if tipos:
    tipo = tipos[0] if isinstance(tipos[0], str) else tipos[0].get("tipo") or tipos[0].get("nome")
    r = run("sobreposicao", {"indice": 0, "tipo": tipo})
    conferir("sobreposicao aplica", r.get("ok") is True, str(r)[:200])
    conferir("escrita traz revisao_auto", "revisao_auto" in (r.get("dados") or {}), str(r)[:200])
    r = run("sobreposicao", {"indice": 0, "tipo": tipo, "remover": True})
    conferir("sobreposicao remove", r.get("ok") is True, str(r)[:200])

print()
print("FALHAS:", falhas if falhas else "nenhuma")
sys.exit(1 if falhas else 0)
