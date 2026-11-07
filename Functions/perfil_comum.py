"""
perfil_comum.py — A cópia de trabalho do Claude (app de teste na 9333, aberta por tools/agente/abrir_teste.py) usa a
MESMA pasta de prévias e alimenta os MESMOS recentes do app do Pailer (2026-11-07).

Antes cada cópia tinha a sua casa (%APPDATA% e cache do D:\\kanivete_testes): as prévias feitas numa eram refeitas
na outra e o projeto editado pelo Claude não aparecia nos recentes do Pailer.

Ligado com CANIVETE_PERFIL_COMUM=1 (só o abrir_teste.py liga; os testes automáticos seguem isolados):
- cache_cfg(): bloco "cache" das preferências REAIS (pasta, qualidade, limites).
- registrar_recente(path): projeto aberto/salvo vai para recentes_comuns.json na pasta real; o app do Pailer junta
  essa lista aos recentes dele ao carregar as preferências (juntar_recentes).
"""
import json
import os
import time

ARQ_RECENTES = "recentes_comuns.json"


def ligado():
    return os.environ.get("CANIVETE_PERFIL_COMUM") == "1"


def pasta_real():
    """%APPDATA%/CaniveteDoPailer do usuário, mesmo com o APPDATA trocado (o app de teste não troca o USERPROFILE)."""
    return os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "CaniveteDoPailer")


def _ler(arq, padrao):
    try:
        with open(arq, encoding="utf-8") as f:
            return json.load(f) or padrao
    except (OSError, ValueError):
        return padrao


def cache_cfg():
    """Bloco "cache" das preferências reais; sem pasta escolhida, a padrão do perfil real (LOCALAPPDATA)."""
    c = dict(_ler(os.path.join(pasta_real(), "preferencias.json"), {}).get("cache") or {})
    if not str(c.get("dir") or "").strip():
        c["dir"] = os.path.join(os.path.expanduser("~"), "AppData", "Local", "CaniveteDoPailer")
    return c


def registrar_recente(path):
    if not ligado() or not path or not str(path).lower().endswith((".vknv", ".vcnvt")):
        return
    path = os.path.abspath(path)
    if os.path.normcase(path).startswith(os.path.normcase("D:\\kanivete_testes")):
        return   # rascunho do agente não entra nos recentes do Pailer
    arq = os.path.join(pasta_real(), ARQ_RECENTES)
    lista = [p for p in _ler(arq, []) if isinstance(p, dict) and os.path.normcase(p.get("path", "")) != os.path.normcase(path)]
    nome = os.path.splitext(os.path.basename(path))[0]
    lista.insert(0, {"path": path, "nome": nome, "video": "", "atualizado": int(time.time() * 1000)})
    try:
        os.makedirs(pasta_real(), exist_ok=True)
        tmp = arq + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(lista[:8], f, ensure_ascii=False)
        os.replace(tmp, arq)
    except OSError as e:
        print("[perfil comum] recente não gravado:", e)


def juntar_recentes(dados):
    """Preferências carregadas pelo app do Pailer: recentes da cópia de trabalho entram (o mais novo vence)."""
    if ligado() or not isinstance(dados, dict):
        return dados
    extra = _ler(os.path.join(pasta_real(), ARQ_RECENTES), [])
    if not extra:
        return dados
    por = {}
    for p in list(dados.get("projetosRecentes") or []) + extra:
        if not isinstance(p, dict) or not p.get("path"):
            continue
        k = os.path.normcase(p["path"])
        if k not in por or (p.get("atualizado") or 0) > (por[k].get("atualizado") or 0):
            por[k] = {**por.get(k, {}), **{c: v for c, v in p.items() if v}}
    dados["projetosRecentes"] = sorted(por.values(), key=lambda p: -(p.get("atualizado") or 0))[:8]
    return dados
