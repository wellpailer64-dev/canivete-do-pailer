"""
google_fotos.py — álbum compartilhado do Google Fotos no GDRIVE DUMPER (photos.app.goo.gl / photos.google.com/share).

Sem login e sem rclone: a página pública do álbum dá a chave; a lista de itens vem da mesma chamada que o site usa
(batchexecute "snAcKc", página a página até o token acabar). Cada item baixa com o sufixo do botão "Baixar" do
Google Fotos: foto `=d` (a versão do álbum, editada se alguém editou), vídeo `=dv` (o vídeo original, com o nome
original no Content-Disposition). Formato medido em 2026-10-13 num álbum de 161 fotos + 26 vídeos.

Retomável: `.kanivete_fotos.json` no destino guarda chave → arquivo; o que já baixou é pulado. Grava em .part e só
renomeia no fim. Progresso no mesmo formato de stats do gdrive_dumper (a tela é a mesma).
"""
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
RPC = "https://photos.google.com/_/PhotosUi/data/batchexecute"
MANIFESTO = ".kanivete_fotos.json"
PARALELOS = {"rapida": 6, "normal": 4, "lenta": 2}
_LINK = re.compile(r"(photos\.app\.goo\.gl/|goo\.gl/photos/|photos\.google\.com/(u/\d+/)?share/)", re.I)


def e_link(url):
    return bool(_LINK.search(url or ""))


def _abrir(req, timeout=60):
    return urllib.request.urlopen(req, timeout=timeout)


def _album(url):
    """Segue o link curto → (id do álbum, chave de acesso, título da página)."""
    r = _abrir(urllib.request.Request(url.strip(), headers=UA))
    final = r.geturl()
    html = r.read().decode("utf-8", "ignore")
    m = re.search(r"/share/([A-Za-z0-9_-]+)", final)
    if not m:
        raise ValueError("Link do Google Fotos inválido (não é um álbum compartilhado).")
    chave = urllib.parse.parse_qs(urllib.parse.urlparse(final).query).get("key", [None])[0]
    t = re.search(r"<title>(.*?)</title>", html, re.S)
    titulo = t.group(1).replace(" - Google Photos", "").replace(" - Google Fotos", "").strip() if t else ""
    import html as _h
    return m.group(1), chave, _h.unescape(titulo)


def _pagina(album, chave, token):
    freq = json.dumps([[["snAcKc", json.dumps([album, token, None, chave]), None, "generic"]]])
    req = urllib.request.Request(RPC, data=urllib.parse.urlencode({"f.req": freq}).encode(),
                                 headers={**UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"})
    txt = _abrir(req).read().decode("utf-8", "ignore")
    for ln in txt.splitlines():
        if ln.startswith('[["wrb.fr"'):
            bruto = json.loads(ln)[0][2]
            if not bruto:
                break
            return json.loads(bruto)
    raise RuntimeError("O Google Fotos não devolveu a lista do álbum (álbum privado ou link expirado?).")


def listar(url, callback_log=None):
    """→ (título, [{chave, url, video}]) de todos os itens do álbum."""
    log = callback_log or (lambda m: None)
    album, chave, titulo = _album(url)
    itens, token, vistos = [], None, set()
    while True:
        d = _pagina(album, chave, token)
        if not titulo and len(d) > 3 and isinstance(d[3], list) and len(d[3]) > 1:
            titulo = d[3][1] or ""
        for x in d[1] or []:
            try:
                k, base = x[0], x[1][0]
            except (IndexError, TypeError):
                continue
            if k in vistos:
                continue
            vistos.add(k)
            extra = x[-1] if isinstance(x[-1], dict) else {}
            itens.append({"chave": k, "url": base, "video": "76647426" in extra})
        token = d[2] if len(d) > 2 else None
        log(f"Lendo o álbum… {len(itens)} itens")
        if not token:
            break
    return titulo or "Álbum do Google Fotos", itens


def analisar(url, callback_log=None):
    titulo, itens = listar(url, callback_log)
    v = sum(1 for i in itens if i["video"])
    return {"titulo": titulo, "total": len(itens), "fotos": len(itens) - v, "videos": v}


def _fmt(b):
    for u in ("B", "KB", "MB", "GB"):
        if b < 1024 or u == "GB":
            return f"{b:.1f} {u}" if u != "B" else f"{int(b)} B"
        b /= 1024


def _eta(s):
    if s is None:
        return "—"
    s = int(s)
    return f"{s // 3600}h{s % 3600 // 60:02d}m" if s >= 3600 else f"{s // 60}m{s % 60:02d}s" if s >= 60 else f"{s}s"


def _nome(cd, item):
    m = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)", cd or "", re.I)
    n = urllib.parse.unquote(m.group(1)) if m else item["chave"][:16] + (".mp4" if item["video"] else ".jpg")
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", os.path.basename(n)).strip() or item["chave"][:16]


def baixar(url, destino, perfil="rapida", callback_log=None, callback_progresso=None, callback_arquivo=None,
           stop_event=None, pause_event=None):
    """Baixa o álbum inteiro em `destino`. Retorna True se todos os itens ficaram no disco."""
    log = callback_log or (lambda m: None)
    stop = stop_event or threading.Event()
    os.makedirs(destino, exist_ok=True)
    log("Lendo o álbum do Google Fotos…")
    titulo, itens = listar(url, log)
    if not itens:
        log("O álbum está vazio.")
        return False
    log(f"📷 {titulo}: {len(itens)} itens")

    mpath = os.path.join(destino, MANIFESTO)
    try:
        feito = json.load(open(mpath, encoding="utf-8"))
    except Exception:
        feito = {}
    trava = threading.Lock()
    usados = {n.lower() for n in os.listdir(destino)}
    ja = {k for k, n in feito.items() if os.path.isfile(os.path.join(destino, n))}
    faltam = [i for i in itens if i["chave"] not in ja]
    est = {"bytes": 0, "ok": len(itens) - len(faltam), "erros": 0, "curso": {}, "t0": time.time()}

    def salvar_manifesto():
        tmp = mpath + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(feito, f, ensure_ascii=False)
        os.replace(tmp, mpath)

    def reservar(nome):
        base, ext = os.path.splitext(nome)
        n, c = nome, 2
        while n.lower() in usados:
            n, c = f"{base} ({c}){ext}", c + 1
        usados.add(n.lower())
        return n

    def um(item):
        for tent in range(4):
            if stop.is_set():
                return
            part = None
            try:
                r = _abrir(urllib.request.Request(item["url"] + ("=dv" if item["video"] else "=d"), headers=UA), 120)
                tam = int(r.headers.get("Content-Length") or 0)
                with trava:
                    nome = reservar(_nome(r.headers.get("Content-Disposition"), item))
                    est["curso"][item["chave"]] = [nome, 0, tam]
                if callback_arquivo:
                    callback_arquivo(nome, "")
                final = os.path.join(destino, nome)
                part = final + ".part"
                with open(part, "wb") as f:
                    while True:
                        while pause_event is not None and pause_event.is_set() and not stop.is_set():
                            time.sleep(0.3)
                        if stop.is_set():
                            break
                        bloco = r.read(256 * 1024)
                        if not bloco:
                            break
                        f.write(bloco)
                        with trava:
                            est["bytes"] += len(bloco)
                            est["curso"][item["chave"]][1] += len(bloco)
                if stop.is_set():
                    os.remove(part)
                    with trava:
                        est["curso"].pop(item["chave"], None)
                        usados.discard(nome.lower())
                    return
                os.replace(part, final)
                with trava:
                    feito[item["chave"]] = nome
                    est["ok"] += 1
                    est["curso"].pop(item["chave"], None)
                    salvar_manifesto()
                return
            except Exception as e:
                with trava:
                    c = est["curso"].pop(item["chave"], None)
                    if c:
                        usados.discard(c[0].lower())
                if part and os.path.exists(part):
                    try:
                        os.remove(part)
                    except OSError:
                        pass
                if tent == 3:
                    with trava:
                        est["erros"] += 1
                    log(f"❌ Falhou: {item['chave'][:12]}… ({e})")
                    return
                time.sleep(3 * (tent + 1))

    def relatorio():
        while not fim.is_set():
            fim.wait(0.5)
            with trava:
                dec = time.time() - est["t0"]
                feitos = est["ok"]
                vel = est["bytes"] / dec if dec > 0 else 0
                baixados_agora = feitos - (len(itens) - len(faltam))
                resto = len(itens) - feitos
                eta = (dec / baixados_agora * resto) if baixados_agora > 0 else None
                curso = [{"name": n, "pct": int(b * 100 / t) if t else 0, "size": _fmt(t) if t else "—"}
                         for n, b, t in list(est["curso"].values())[:8]]
                pct = int(feitos * 100 / len(itens))
            st = {"done": _fmt(est["bytes"]), "total": f"{feitos}/{len(itens)} itens", "speed": _fmt(vel) + "/s",
                  "eta": "pausado" if pause_event is not None and pause_event.is_set() else _eta(eta),
                  "files_done": feitos, "files_total": len(itens), "checks": len(itens) - len(faltam),
                  "errors": est["erros"], "elapsed": _eta(dec), "transferring": curso}
            if callback_progresso:
                callback_progresso(pct, st)

    fim = threading.Event()
    th = threading.Thread(target=relatorio, daemon=True)
    th.start()
    if len(faltam) < len(itens):
        log(f"{len(itens) - len(faltam)} já estavam na pasta; baixando os {len(faltam)} que faltam.")
    try:
        with ThreadPoolExecutor(max_workers=PARALELOS.get(perfil, 4)) as ex:
            list(ex.map(um, faltam))
    finally:
        fim.set()
        th.join(2)
    if stop.is_set():
        return False
    if est["erros"]:
        log(f"⚠ {est['erros']} item(ns) falharam. Clique em Baixar de novo para tentar só os que faltam.")
        return False
    return True
