"""
autoframe_modelos.py — modelos de cliente do AutoFrame (aba "AutoFrame Customizado").

Cada modelo guarda a identidade de um cliente para editar sempre no mesmo padrão: nome e cor do card, logo,
paleta, fonte, intro, logo no canto, encerramento, estilo de edição, transições e as músicas que se alternam.
Fica em %APPDATA%/CaniveteDoPailer/autoframe_modelos/<id>/ (modelo.json + os arquivos copiados para lá, para o
modelo não quebrar se o original for movido ou apagado). O JS monta a timeline (editor-autoframe.js).

Arquivos no JSON: nome relativo à pasta do modelo. Ao salvar, o JS manda {"src": caminho} para arquivos novos.
"""
import json
import os
import re
import shutil
import time
import uuid

_CAMPOS_ARQ = (("logo",), ("intro", "video"), ("fim", "video"))


def _base():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    pasta = os.path.join(base, "CaniveteDoPailer", "autoframe_modelos")
    os.makedirs(pasta, exist_ok=True)
    return pasta


def _pasta(mid):
    if not re.fullmatch(r"[a-z0-9]{6,40}", mid or ""):
        raise ValueError("id de modelo inválido")
    return os.path.join(_base(), mid)


def _ler(mid):
    with open(os.path.join(_pasta(mid), "modelo.json"), encoding="utf-8") as f:
        return json.load(f)


def _gravar(m):
    p = os.path.join(_pasta(m["id"]), "modelo.json")
    with open(p + ".tmp", "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
    os.replace(p + ".tmp", p)


def _get(d, chaves):
    for k in chaves[:-1]:
        d = d.get(k) or {}
    return d.get(chaves[-1])


def _set(d, chaves, v):
    for k in chaves[:-1]:
        d = d.setdefault(k, {})
    d[chaves[-1]] = v


def _com_urls(m):
    """Cópia do modelo com caminho absoluto e URL (media_server) de cada arquivo, para o JS."""
    from Functions import media_server
    pasta = _pasta(m["id"])
    out = json.loads(json.dumps(m))
    out["_arq"] = {}
    for chaves in _CAMPOS_ARQ:
        nome = _get(m, chaves)
        p = os.path.join(pasta, nome) if nome else None
        if p and os.path.isfile(p):
            out["_arq"][".".join(chaves)] = {"path": p, "url": media_server.register(p)}
    for mu in out.get("musicas") or []:
        p = os.path.join(pasta, mu["arq"])
        mu["path"] = p if os.path.isfile(p) else None
        mu["url"] = media_server.register(p) if mu["path"] else None
    return out


def listar():
    out = []
    for mid in sorted(os.listdir(_base())):
        try:
            out.append(_com_urls(_ler(mid)))
        except (OSError, ValueError):
            continue
    out.sort(key=lambda m: -(m.get("usado") or m.get("criado") or 0))
    return {"success": True, "modelos": out}


def _copiar(src, pasta, prefixo):
    if not src or not os.path.isfile(src):
        raise FileNotFoundError(src or "")
    base = re.sub(r"[^\w.\- ]", "_", os.path.basename(src))[-80:]
    nome = f"{prefixo}_{uuid.uuid4().hex[:6]}_{base}"
    shutil.copy2(src, os.path.join(pasta, nome))
    return nome


def salvar(modelo):
    """Cria ou atualiza. Arquivos novos chegam como {"src": caminho} e são copiados para a pasta do modelo;
    os que deixaram de ser usados são apagados."""
    try:
        m = dict(modelo or {})
        m.pop("_arq", None)
        novo = not m.get("id")
        if novo:
            m["id"] = uuid.uuid4().hex[:12]
            m["criado"] = time.time()
        pasta = _pasta(m["id"])
        os.makedirs(pasta, exist_ok=True)
        for chaves in _CAMPOS_ARQ:
            v = _get(m, chaves)
            if isinstance(v, dict):
                _set(m, chaves, _copiar(v.get("src"), pasta, chaves[0]))
        musicas = []
        for mu in m.get("musicas") or []:
            if mu.get("src"):
                musicas.append({"arq": _copiar(mu["src"], pasta, "musica"), "nome": mu.get("nome") or os.path.basename(mu["src"])})
            elif mu.get("arq"):
                musicas.append({"arq": mu["arq"], "nome": mu.get("nome") or mu["arq"]})
        m["musicas"] = musicas
        m["atualizado"] = time.time()
        _gravar(m)
        usados = {_get(m, c) for c in _CAMPOS_ARQ} | {mu["arq"] for mu in musicas} | {"modelo.json"}
        for a in os.listdir(pasta):
            if a not in usados and not a.endswith(".tmp"):
                try:
                    os.remove(os.path.join(pasta, a))
                except OSError:
                    pass
        return {"success": True, "modelo": _com_urls(m)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def apagar(mid):
    try:
        shutil.rmtree(_pasta(mid))
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def usou(mid, musica_i):
    """Marca o uso (ordem dos cards) e passa a vez para a próxima música da lista."""
    try:
        m = _ler(mid)
        n = len(m.get("musicas") or [])
        m["musicaProx"] = (int(musica_i) + 1) % n if n else 0
        m["usado"] = time.time()
        _gravar(m)
        return {"success": True, "musicaProx": m["musicaProx"]}
    except Exception as e:
        return {"success": False, "error": str(e)}
