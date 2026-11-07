"""kaniboard.py — KaniBoard (Kb, amarelo): quadro branco infinito (notas, formas, setas, caneta, imagens, frames).

Cada quadro é uma pasta em <raiz_dados()>/KaniBoard/<id>/:
  board.json  — o documento (itens, câmera, fundo); gravado por arquivo temporário + replace (nunca fica pela metade)
  thumb.png   — prévia para a lista (desenhada pelo frontend em canvas)
  midia/      — imagens e GIFs coladas/arrastadas (o board.json guarda só "midia/<nome>")
Apagar = mover para KaniBoard/_lixeira (restaurável na mão).
"""
import base64
import json
import os
import re
import shutil
import threading
import time
import uuid

from Functions.midia import raiz_dados

_lock = threading.Lock()
EXT_IMG = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif"}


def raiz():
    p = os.path.join(raiz_dados(), "KaniBoard")
    os.makedirs(p, exist_ok=True)
    return p


def _pasta(bid):
    bid = str(bid or "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{4,64}", bid):
        raise ValueError("quadro inválido")
    return os.path.join(raiz(), bid)


def _ler(bid):
    with open(os.path.join(_pasta(bid), "board.json"), encoding="utf-8") as f:
        return json.load(f)


def _gravar_json(caminho, dados):
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, caminho)


def _url_pasta(p):
    try:
        from Functions import media_server
        return media_server.register_pasta(p)
    except Exception:
        return ""


def _thumb_url(bid):
    t = os.path.join(_pasta(bid), "thumb.png")
    if not os.path.isfile(t):
        return ""
    try:
        from Functions import media_server
        return media_server.register(t)
    except Exception:
        return ""


def listar():
    itens = []
    for nome in os.listdir(raiz()):
        if nome.startswith("_"):
            continue
        j = os.path.join(raiz(), nome, "board.json")
        if not os.path.isfile(j):
            continue
        try:
            with open(j, encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            continue
        itens.append({
            "id": nome, "nome": d.get("nome") or "Sem título", "criado": d.get("criado", 0),
            "alterado": d.get("alterado") or os.path.getmtime(j), "favorito": bool(d.get("favorito")),
            "n": len(d.get("itens") or []), "cor": d.get("cor") or "", "thumb": _thumb_url(nome),
        })
    itens.sort(key=lambda b: -b["alterado"])
    return itens


def novo(nome="Sem título", doc=None):
    bid = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    p = _pasta(bid)
    os.makedirs(os.path.join(p, "midia"), exist_ok=True)
    agora = time.time()
    d = dict(doc or {})
    d.update({"v": 1, "id": bid, "nome": (nome or "Sem título").strip()[:120] or "Sem título", "criado": agora, "alterado": agora})
    d.setdefault("itens", [])
    d.setdefault("fundo", "pontos")
    _gravar_json(os.path.join(p, "board.json"), d)
    return {"success": True, "id": bid}


def abrir(bid):
    d = _ler(bid)
    p = _pasta(bid)
    os.makedirs(os.path.join(p, "midia"), exist_ok=True)
    d["id"] = bid
    return {"success": True, "doc": d, "midia_url": _url_pasta(os.path.join(p, "midia"))}


def salvar(bid, doc, thumb=""):
    p = _pasta(bid)
    if not os.path.isdir(p):
        return {"success": False, "error": "quadro não existe mais"}
    if isinstance(doc, str):
        doc = json.loads(doc)
    with _lock:
        try:
            antigo = _ler(bid)
        except Exception:
            antigo = {}
        doc["id"] = bid
        doc["v"] = 1
        doc["criado"] = antigo.get("criado") or doc.get("criado") or time.time()
        doc["favorito"] = bool(antigo.get("favorito"))   # favorito é da lista, não do editor
        doc["alterado"] = time.time()
        _gravar_json(os.path.join(p, "board.json"), doc)
        if thumb and thumb.startswith("data:image/png;base64,"):
            tmp = os.path.join(p, "thumb.png.tmp")
            with open(tmp, "wb") as f:
                f.write(base64.b64decode(thumb.split(",", 1)[1]))
            os.replace(tmp, os.path.join(p, "thumb.png"))
    return {"success": True, "alterado": doc["alterado"]}


def _mexer(bid, **campos):
    with _lock:
        d = _ler(bid)
        d.update(campos)
        _gravar_json(os.path.join(_pasta(bid), "board.json"), d)
    return {"success": True}


def renomear(bid, nome):
    nome = (nome or "").strip()[:120] or "Sem título"
    return _mexer(bid, nome=nome)


def favoritar(bid, fav=True):
    return _mexer(bid, favorito=bool(fav))


def duplicar(bid):
    origem = _pasta(bid)
    d = _ler(bid)
    r = novo((d.get("nome") or "Sem título") + " (cópia)", {k: v for k, v in d.items() if k not in ("id", "nome", "criado", "alterado", "favorito")})
    destino = _pasta(r["id"])
    shutil.copytree(os.path.join(origem, "midia"), os.path.join(destino, "midia"), dirs_exist_ok=True)
    if os.path.isfile(os.path.join(origem, "thumb.png")):
        shutil.copy2(os.path.join(origem, "thumb.png"), os.path.join(destino, "thumb.png"))
    return r


def apagar(bid):
    p = _pasta(bid)
    if not os.path.isdir(p):
        return {"success": True}
    lix = os.path.join(raiz(), "_lixeira")
    os.makedirs(lix, exist_ok=True)
    shutil.move(p, os.path.join(lix, os.path.basename(p)))
    return {"success": True}


def _nome_midia(p, nome, ext):
    base = re.sub(r"[^\w.-]+", "_", os.path.splitext(nome or "imagem")[0])[:40] or "imagem"
    return f"{base}-{uuid.uuid4().hex[:6]}{ext}"


def midia_dados(bid, data_url, nome="colado"):
    """Imagem colada/arrastada (data URL) → midia/<nome>. Devolve {src: 'midia/x.png', url}."""
    m = re.match(r"data:([\w/+.-]+);base64,(.*)$", data_url or "", re.S)
    if not m:
        return {"success": False, "error": "imagem inválida"}
    tipo = m.group(1).lower()
    ext = {"image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg", "image/bmp": ".bmp",
           "image/avif": ".avif"}.get(tipo, ".png")
    p = os.path.join(_pasta(bid), "midia")
    os.makedirs(p, exist_ok=True)
    arq = _nome_midia(p, nome, ext)
    with open(os.path.join(p, arq), "wb") as f:
        f.write(base64.b64decode(m.group(2)))
    return {"success": True, "src": "midia/" + arq}


def midia_arquivo(bid, caminho):
    ext = os.path.splitext(caminho or "")[1].lower()
    if ext not in EXT_IMG or not os.path.isfile(caminho):
        return {"success": False, "error": "formato de imagem não suportado"}
    p = os.path.join(_pasta(bid), "midia")
    os.makedirs(p, exist_ok=True)
    arq = _nome_midia(p, os.path.basename(caminho), ext)
    shutil.copy2(caminho, os.path.join(p, arq))
    return {"success": True, "src": "midia/" + arq}


def exportar_png(caminho, data_url):
    if not caminho or not (data_url or "").startswith("data:image/png;base64,"):
        return {"success": False, "error": "nada para salvar"}
    if not caminho.lower().endswith(".png"):
        caminho += ".png"
    with open(caminho, "wb") as f:
        f.write(base64.b64decode(data_url.split(",", 1)[1]))
    return {"success": True, "caminho": caminho}
