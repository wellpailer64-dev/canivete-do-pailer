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

VERSAO = 4   # v2 (2026-10-18): pack novo cortado de vídeos sem copyright (tools/fatiar_sfx.py + tools/pack_sfx.py --zip N);
             # v3: + 22 whooshes suaves curtos (os da Legenda Premium); v4: + 8 sub drops sintetizados no KANIVETE
URL_PACK = (f"https://github.com/wellpailer64-dev/canivete-do-pailer/releases/download/"
            f"soundboard-v{VERSAO}/soundboard-v{VERSAO}.zip")

_baixando = threading.Lock()
_picos = {"rodando": False}
PICOS_N = 48   # barrinhas da forma de onda de cada card


def _picos_arq():
    return os.path.join(pasta(), "picos.json")


def _picos_de(p):
    """Forma de onda de um som: PICOS_N picos 0..100 (o mais alto do som = 100)."""
    import subprocess
    import numpy as np
    from Functions.midia import ffmpeg, NO_WINDOW
    r = subprocess.run([ffmpeg(), "-v", "error", "-i", p, "-ac", "1", "-ar", "4000", "-f", "f32le", "-"],
                       capture_output=True, creationflags=NO_WINDOW)
    x = np.abs(np.frombuffer(r.stdout, np.float32))
    if not len(x):
        return [0] * PICOS_N
    k = max(1, len(x) // PICOS_N)
    pk = np.array([x[i * k:(i + 1) * k].max() if i * k < len(x) else 0 for i in range(PICOS_N)])
    return [int(v) for v in np.round(pk / (pk.max() + 1e-9) * 100)]


def _picos_cache():
    try:
        with open(_picos_arq(), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _picos_gerar(faltam):
    """Calcula em segundo plano as formas de onda que faltam e guarda em picos.json (uma vez por pack)."""
    try:
        cache = _picos_cache()
        for arq, p in faltam:
            try:
                cache[arq] = _picos_de(p)
            except Exception:
                cache[arq] = [0] * PICOS_N
        with open(_picos_arq(), "w", encoding="utf-8") as f:
            json.dump(cache, f)
    finally:
        _picos["rodando"] = False


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
    picos, faltam = _picos_cache(), []
    for c in cat.get("categorias", []):
        sons = []
        for s in c.get("sons", []):
            p = os.path.join(base, *s["arq"].split("/"))
            if os.path.isfile(p):
                sons.append({**s, "path": p, "url": media_server.register(p), "pk": picos.get(s["arq"])})
                if s["arq"] not in picos:
                    faltam.append((s["arq"], p))
        c["sons"] = sons
    if faltam and not _picos["rodando"]:   # formas de onda: na 1ª vez, em segundo plano (o painel pede de novo)
        _picos["rodando"] = True
        threading.Thread(target=_picos_gerar, args=(faltam,), daemon=True).start()
    return {"success": True, "instalado": True, "versao": cat.get("versao", 0), "picos_faltam": bool(faltam),
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
