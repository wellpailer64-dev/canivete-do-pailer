"""
soundboard.py — pack de efeitos sonoros do painel Soundboard do Pocket Editor.

O pack não vem no app: é baixado na primeira vez que o painel é usado (release `soundboard-vN` do GitHub)
e fica em <app>/soundboard/ (catalogo.json + uma pasta por categoria, sons em Opus). Montado por
tools/montar_soundboard.py; todos os sons são CC0.
"""
import json
import os
import shutil
import threading
import urllib.request
import zipfile

from Functions.midia import app_dir

VERSAO = 1
URL_PACK = (f"https://github.com/wellpailer64-dev/canivete-do-pailer/releases/download/"
            f"soundboard-v{VERSAO}/soundboard-v{VERSAO}.zip")

_baixando = threading.Lock()


def pasta():
    return os.path.join(app_dir(), "soundboard")


def _catalogo():
    try:
        with open(os.path.join(pasta(), "catalogo.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def estado():
    """Catálogo instalado, com o caminho e a URL (media_server) de cada som; ou {instalado: False}."""
    from Functions import media_server
    cat = _catalogo()
    if not cat:
        return {"success": True, "instalado": False, "baixando": _baixando.locked()}
    base = pasta()
    for c in cat.get("categorias", []):
        sons = []
        for s in c.get("sons", []):
            p = os.path.join(base, *s["arq"].split("/"))
            if os.path.isfile(p):
                sons.append({**s, "path": p, "url": media_server.register(p)})
        c["sons"] = sons
    return {"success": True, "instalado": True, "versao": cat.get("versao", 0),
            "desatualizado": cat.get("versao", 0) < VERSAO, "categorias": cat.get("categorias", [])}


def baixar(on_progress):
    """Baixa e instala o pack (em segundo plano). on_progress({pct, msg}) / {fim: True} / {erro}."""
    if not _baixando.acquire(blocking=False):
        return {"success": False, "error": "Já está baixando."}

    def run():
        destino = pasta()
        zip_tmp = destino + ".zip.download"
        nova = destino + ".novo"
        try:
            req = urllib.request.Request(URL_PACK, headers={"User-Agent": "CaniveteDoPailer"})
            with urllib.request.urlopen(req, timeout=60) as r, open(zip_tmp, "wb") as f:
                total = int(r.headers.get("Content-Length") or 0)
                feito, ultimo = 0, -1
                while True:
                    bloco = r.read(256 * 1024)
                    if not bloco:
                        break
                    f.write(bloco)
                    feito += len(bloco)
                    pct = int(feito * 100 / total) if total else 0
                    if pct != ultimo:
                        ultimo = pct
                        on_progress({"pct": pct, "msg": f"Baixando sons... {feito / 1048576:.1f} / {total / 1048576:.1f} MB"})
            on_progress({"pct": 100, "msg": "Instalando..."})
            shutil.rmtree(nova, ignore_errors=True)
            with zipfile.ZipFile(zip_tmp) as zf:
                zf.extractall(nova)
            if not os.path.isfile(os.path.join(nova, "catalogo.json")):
                raise RuntimeError("pack sem catálogo")
            shutil.rmtree(destino, ignore_errors=True)
            os.replace(nova, destino)
            on_progress({"fim": True})
        except Exception as e:
            shutil.rmtree(nova, ignore_errors=True)
            on_progress({"erro": f"Não foi possível baixar os sons: {e}"})
        finally:
            try:
                os.remove(zip_tmp)
            except OSError:
                pass
            _baixando.release()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}
