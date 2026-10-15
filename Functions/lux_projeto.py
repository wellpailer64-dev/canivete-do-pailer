"""lux_projeto.py — projeto da Lux Kanivete (.lknv).

Zip com:
  cena.json   — {formato: 'lknv', versao, nome, c3d (a cena 3D inteira: modelos, luzes, câmera, cenário, ◆),
                 largura, altura, fps, duracao}
  recursos/   — artes de rótulo, texturas, imagens de relevo e modelos importados COPIADOS para dentro (o projeto
                anda sozinho: abre em outro PC); dentro da cena os caminhos viram 'recursos/<nome>'
  previa.png  — miniatura (recentes, Windows)
Ao abrir, os recursos saem numa pasta de trabalho em <raiz de dados>/Lux/<hash> e os caminhos voltam a ser absolutos.
"""
import base64, hashlib, json, os, zipfile

from Functions.midia import raiz_dados

EXTENSAO = ".lknv"
VERSAO = 1


def _referencias(c3d):
    """(dicionário, chave) de cada caminho de arquivo dentro da cena"""
    for md in (c3d or {}).get("modelos", []):
        f = md.get("fonte") or {}
        for k in ("rotulo", "path", "textura"):
            if isinstance(f.get(k), str) and f[k]:
                yield f, k
        for parte in list((f.get("materiais") or {}).values()) + list((f.get("partes") or {}).values()):
            if isinstance(parte, dict):
                for k in ("textura", "relevo_img"):
                    if isinstance(parte.get(k), str) and parte[k]:
                        yield parte, k


def salvar(caminho, dados, previa=None):
    """dados = {nome, c3d, largura, altura, fps, duracao}; previa = data URL PNG (opcional)"""
    if not caminho.lower().endswith(EXTENSAO):
        caminho += EXTENSAO
    dados = json.loads(json.dumps(dados))   # cópia: os caminhos mudam só no arquivo
    copiar = {}
    for obj, k in _referencias(dados.get("c3d")):
        p = obj[k]
        if p.startswith("recursos/"):
            continue
        if os.path.isfile(p):
            if p not in copiar:
                copiar[p] = f"{len(copiar):03d}_{os.path.basename(p)}"
            obj[k] = "recursos/" + copiar[p]
    tmp = caminho + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("cena.json", json.dumps({"formato": "lknv", "versao": VERSAO, **dados}, ensure_ascii=False))
        for orig, nome in copiar.items():
            z.write(orig, "recursos/" + nome)
        if previa and "," in previa:
            try:
                z.writestr("previa.png", base64.b64decode(previa.split(",", 1)[1]))
            except Exception:
                pass
    os.replace(tmp, caminho)
    return {"success": True, "path": caminho, "recursos": len(copiar)}


def abrir(caminho):
    if not os.path.isfile(caminho):
        return {"success": False, "error": "arquivo não encontrado"}
    st = os.stat(caminho)
    pasta = os.path.join(raiz_dados(), "Lux", hashlib.sha1(f"{os.path.abspath(caminho)}|{st.st_mtime}".encode()).hexdigest()[:12])
    with zipfile.ZipFile(caminho) as z:
        dados = json.loads(z.read("cena.json").decode("utf-8"))
        for n in z.namelist():
            if n.startswith("recursos/") and not n.endswith("/"):
                destino = os.path.join(pasta, n)
                if not os.path.exists(destino):
                    os.makedirs(os.path.dirname(destino), exist_ok=True)
                    with z.open(n) as a, open(destino, "wb") as b:
                        b.write(a.read())
    if dados.get("formato") != "lknv":
        return {"success": False, "error": "não é um projeto da Lux Kanivete"}
    for obj, k in _referencias(dados.get("c3d")):
        if obj[k].startswith("recursos/"):
            obj[k] = os.path.join(pasta, obj[k]).replace("\\", "/")
    return {"success": True, "dados": dados, "pasta": pasta, "path": os.path.abspath(caminho)}
