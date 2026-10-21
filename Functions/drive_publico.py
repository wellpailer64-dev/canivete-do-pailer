"""
drive_publico.py — GDRIVE DUMPER sem login: pasta/arquivo do Google Drive compartilhado como "qualquer pessoa com o link".

O login do Google (rclone + OAuth) pede o escopo "drive", que o Google só libera sem a tela "O Google não verificou este
app" depois de uma auditoria paga. Link PÚBLICO não precisa de login: a API do Drive v3 lê e baixa com uma CHAVE DE API
(projeto canivete-do-pailer, restrita à Google Drive API). Link privado continua no caminho com login (gdrive_dumper).

Chave: Functions/_credenciais.py › API_KEY (fora do git; no release vem do secret GDRIVE_API_KEY) ou a variável de
ambiente GDRIVE_API_KEY. Retomável: pula o arquivo que já está no destino com o mesmo tamanho, grava em .part e continua
de onde parou (Range). Docs/Planilhas/Apresentações do Google saem em .docx/.xlsx/.pptx. Andamento no MESMO formato de
stats do gdrive_dumper (a tela é a mesma). Teste: py -3.13 testes/teste_drive_publico.py
"""
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://www.googleapis.com/drive/v3/files"
PASTA = "application/vnd.google-apps.folder"
ATALHO = "application/vnd.google-apps.shortcut"
EXPORTAR = {"application/vnd.google-apps.document": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"),
            "application/vnd.google-apps.spreadsheet": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"),
            "application/vnd.google-apps.presentation": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"),
            "application/vnd.google-apps.drawing": ("image/png", ".png")}
PARALELOS = {"rapida": 6, "normal": 4, "lenta": 2}
CAMPOS = "id,name,mimeType,size,md5Checksum,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)"


def chave():
    try:
        from Functions._credenciais import API_KEY
        if API_KEY:
            return API_KEY.strip()
    except Exception:
        pass
    return os.environ.get("GDRIVE_API_KEY", "").strip()


def disponivel():
    return bool(chave())


def resource_key(url):
    """links antigos trazem ?resourcekey=... (sem ele a API responde "não encontrado")"""
    m = re.search(r"[?&]resourcekey=([\w-]+)", url or "", re.I)
    return m.group(1) if m else None


class SemAcesso(Exception):
    """o item não é público (ou não existe): vai pelo login. str(e) = explicação para o usuário"""


class Bloqueado(Exception):
    """o Google barrou os downloads ANÔNIMOS desta rede ("Sorry... automated queries"): a pasta continua pública,
    a listagem funciona, mas o alt=media volta 403 com uma página HTML. Passa sozinho em algumas horas; pelo login
    (rclone/OAuth) baixa na hora — quem chama cai para o login."""


class Definitivo(RuntimeError):
    """erro que não adianta tentar de novo agora (cota, download bloqueado pelo dono, documento grande demais)"""


BLOQUEIO = ("O Google barrou por um tempo os downloads sem login desta rede (acha que são consultas automáticas — "
            "costuma acontecer depois de baixar muita coisa seguida). Não é falta de permissão: a pasta está pública.")

# motivo do Google (error.errors[].reason) → explicação; os do 2º grupo não adianta repetir
_MOTIVOS = {
    "notFound": "não encontrado — o arquivo não está público, foi apagado/movido ou o link precisa do resourcekey",
    "insufficientFilePermissions": "esse arquivo tem compartilhamento próprio, mais fechado que o da pasta",
    "forbidden": "o Google negou o acesso a esse arquivo (compartilhamento próprio, mais fechado que o da pasta)",
    "appNotAuthorizedToFile": "o dono restringiu o acesso a esse arquivo",
}
_FINAIS = {
    "cannotDownloadFile": "O dono desse arquivo bloqueou o download (só dá para ver no navegador). Peça para liberar o download.",
    "downloadQuotaExceeded": "Cota de download do Google excedida para este arquivo (muita gente baixou). Tente em ~24h ou pelo login.",
    "exportSizeLimitExceeded": "Documento do Google grande demais para exportar sem login (limite de 10 MB). Baixe pelo login.",
    "cannotDownloadAbusiveFile": "O Google marcou esse arquivo como suspeito (vírus/abuso) e só libera para o dono.",
}


def _motivo(corpo):
    try:
        e = json.loads(corpo).get("error") or {}
        return ((e.get("errors") or [{}])[0].get("reason") or e.get("status") or ""), e.get("message", "")
    except Exception:
        return "", ""


def _pedir(url, params=None, chaves_rk=None, cabecalhos=None, timeout=60):
    q = {**(params or {}), "key": chave(), "supportsAllDrives": "true"}
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(q), headers={"User-Agent": "KANIVETE", **(cabecalhos or {})})
    if chaves_rk:
        req.add_header("X-Goog-Drive-Resource-Keys", ",".join(f"{i}/{k}" for i, k in chaves_rk.items()))
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        corpo = e.read().decode("utf-8", "replace")
        if e.code in (403, 429) and re.search(r"automated queries|<title>Sorry", corpo, re.I):
            raise Bloqueado(BLOQUEIO)
        motivo, msg = _motivo(corpo)
        if motivo in _FINAIS:
            raise Definitivo(_FINAIS[motivo])
        if e.code in (401, 403, 404) and not re.search(r"quota|rateLimit|keyInvalid|API key|accessNotConfigured", corpo, re.I):
            raise SemAcesso(_MOTIVOS.get(motivo) or f"o Google negou ({e.code}{' ' + motivo if motivo else ''}: {msg[:120] or 'sem detalhe'})")
        raise RuntimeError(_explicar(corpo) or f"Google Drive respondeu {e.code}: {msg or corpo[:200]}")


def _explicar(corpo):
    t = corpo.lower()
    if "cannotdownloadfile" in t:
        return "O dono desse arquivo bloqueou o download (só dá para ver no navegador). Peça para liberar o download."
    if "downloadquotaexceeded" in t:
        return "Cota de download do Google excedida para este arquivo (muita gente baixou). Tente em ~24h."
    if "ratelimit" in t or "userratelimitexceeded" in t:
        return "Limite de pedidos do Google atingido; tentando de novo."
    if "api key not valid" in t or "keyinvalid" in t:
        return "A chave de API do Drive não é válida (Functions/_credenciais.py › API_KEY)."
    if "accessnotconfigured" in t or "has not been used in project" in t:
        return "A Google Drive API não está ativada no projeto da chave."
    return None


def _json(url, params=None, rk=None):
    with _pedir(url, params, rk) as r:
        return json.loads(r.read().decode("utf-8"))


def info(item_id, url=""):
    """metadados se o item é público; levanta SemAcesso se não for"""
    rk = resource_key(url)
    return _json(f"{API}/{item_id}", {"fields": CAMPOS}, {item_id: rk} if rk else None)


def acessivel(item_id, url=""):
    """{'name', 'mimeType', ...} se dá para baixar sem login; None se é privado/inexistente"""
    if not disponivel():
        return None
    try:
        return info(item_id, url)
    except SemAcesso:
        return None


def _seguro(n):
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", n or "").strip(" .") or "sem_nome"


def listar(item_id, url="", incluir=None, callback_log=None):
    """[{id, nome (caminho relativo), tam, mime, rk}] de tudo dentro (recursivo), sem pastas"""
    log = callback_log or (lambda m: None)
    raiz = info(item_id, url)
    rk0 = resource_key(url)
    exts = {e.lower().lstrip(".") for e in incluir} if incluir else None
    saida, aviso = [], [300]

    def entra(f, caminho, rk):
        mime, fid = f.get("mimeType"), f["id"]
        if mime == ATALHO and f.get("shortcutDetails"):
            sd = f["shortcutDetails"]; mime, fid, rk = sd.get("targetMimeType"), sd.get("targetId"), sd.get("targetResourceKey")
        nome = _seguro(f.get("name"))
        if mime == PASTA:
            pasta(fid, caminho + nome + "/", rk)
            return
        exp = EXPORTAR.get(mime)
        if mime and mime.startswith("application/vnd.google-apps.") and not exp:
            return   # formulário, mapa, site: não há arquivo para baixar
        if exp and not nome.lower().endswith(exp[1]):
            nome += exp[1]
        if exts and os.path.splitext(nome)[1].lower().lstrip(".") not in exts:
            return
        saida.append({"id": fid, "nome": caminho + nome, "tam": int(f.get("size") or 0), "mime": mime, "rk": rk, "exportar": exp[0] if exp else None})

    def pasta(pid, caminho, rk):
        token = None
        while True:
            p = {"q": f"'{pid}' in parents and trashed = false", "fields": f"nextPageToken,files({CAMPOS})", "pageSize": 1000,
                 "includeItemsFromAllDrives": "true", "orderBy": "folder,name"}
            if token:
                p["pageToken"] = token
            d = _json(API, p, {pid: rk} if rk else None)
            for f in d.get("files", []):
                entra(f, caminho, f.get("resourceKey"))
            token = d.get("nextPageToken")
            if not token:
                break
        if len(saida) >= aviso[0]:
            log(f"Listando… {len(saida)} arquivos")
            aviso[0] = len(saida) + 300

    if raiz.get("mimeType") == PASTA:
        pasta(raiz["id"], "", rk0)
    else:
        entra(raiz, "", rk0)
    return raiz.get("name") or item_id, saida


def analisar(item_id, url="", callback_log=None):
    nome, itens = listar(item_id, url, callback_log=callback_log)
    return nome, sum(i["tam"] for i in itens), len(itens)


def _fmt(b):
    for u in ("B", "KB", "MB", "GB", "TB"):
        if b < 1024 or u == "TB":
            return f"{b:.1f} {u}" if u != "B" else f"{int(b)} B"
        b /= 1024


def _eta(s):
    if s is None:
        return "—"
    s = int(s)
    return f"{s // 3600}h{s % 3600 // 60:02d}m" if s >= 3600 else f"{s // 60}m{s % 60:02d}s" if s >= 60 else f"{s}s"


def baixar(item_id, destino, url="", perfil="rapida", incluir=None, callback_log=None, callback_progresso=None,
           callback_arquivo=None, stop_event=None, pause_event=None):
    """Baixa o item público para `destino` (pasta: a estrutura de subpastas vai junto). True se tudo ficou no disco.
    Levanta Bloqueado se o Google barrar os downloads anônimos da rede (quem chama continua pelo login)."""
    log = callback_log or (lambda m: None)
    stop = stop_event or threading.Event()
    barrado = threading.Event()   # Bloqueado num arquivo = para todos (os outros levariam o mesmo 403)
    falhas = {}                   # explicação → [nomes]
    log("🔓 Link público: baixando sem login (sem a tela do Google).")
    nome_raiz, itens = listar(item_id, url, incluir, log)
    if not itens:
        log("Nada para baixar nesse link" + (" com os tipos de arquivo pedidos." if incluir else "."))
        return False
    os.makedirs(destino, exist_ok=True)
    total = sum(i["tam"] for i in itens)
    log(f"📁 {nome_raiz}: {len(itens)} arquivo(s), {_fmt(total)}")
    feitos_antes = [i for i in itens if not i["exportar"] and i["tam"] and os.path.isfile(os.path.join(destino, i["nome"]))
                    and os.path.getsize(os.path.join(destino, i["nome"])) == i["tam"]]
    ja = {i["id"] for i in feitos_antes}
    faltam = [i for i in itens if i["id"] not in ja]
    trava = threading.Lock()
    est = {"bytes": 0, "ok": len(ja), "erros": 0, "curso": {}, "t0": time.time(), "ja_bytes": sum(i["tam"] for i in feitos_antes)}

    def um(item):
        final = os.path.join(destino, item["nome"])
        os.makedirs(os.path.dirname(final), exist_ok=True)
        part = final + ".part"
        for tent in range(5):
            if stop.is_set() or barrado.is_set():
                return
            try:
                ini = os.path.getsize(part) if os.path.isfile(part) and not item["exportar"] else 0
                cab = {"Range": f"bytes={ini}-"} if ini else None
                rk = {item["id"]: item["rk"]} if item.get("rk") else None
                r = (_pedir(f"{API}/{item['id']}/export", {"mimeType": item["exportar"]}, rk, timeout=120) if item["exportar"]
                     else _pedir(f"{API}/{item['id']}", {"alt": "media"}, rk, cab, timeout=120))
                if ini and getattr(r, "status", 200) != 206:
                    ini = 0   # o servidor não continuou de onde parou: recomeça
                with trava:
                    est["curso"][item["id"]] = [os.path.basename(item["nome"]), ini, item["tam"]]
                if callback_arquivo:
                    callback_arquivo(item["nome"], "")
                with r, open(part, "ab" if ini else "wb") as f:
                    while True:
                        while pause_event is not None and pause_event.is_set() and not stop.is_set():
                            time.sleep(0.3)
                        if stop.is_set() or barrado.is_set():
                            break
                        bloco = r.read(512 * 1024)
                        if not bloco:
                            break
                        f.write(bloco)
                        with trava:
                            est["bytes"] += len(bloco)
                            est["curso"][item["id"]][1] += len(bloco)
                if stop.is_set() or barrado.is_set():
                    with trava:
                        est["curso"].pop(item["id"], None)
                    return   # o .part fica: o próximo "Baixar" continua dele
                if item["tam"] and os.path.getsize(part) < item["tam"]:
                    raise RuntimeError("download interrompido")
                os.replace(part, final)
                with trava:
                    est["ok"] += 1
                    est["curso"].pop(item["id"], None)
                return
            except Bloqueado:
                with trava:
                    est["curso"].pop(item["id"], None)
                barrado.set()
                return
            except (SemAcesso, Definitivo) as e:
                with trava:
                    est["erros"] += 1; est["curso"].pop(item["id"], None)
                    falhas.setdefault(str(e), []).append(item["nome"])
                log(f"❌ {item['nome']}: {e}")
                return
            except Exception as e:
                with trava:
                    est["curso"].pop(item["id"], None)
                if tent == 4:
                    with trava:
                        est["erros"] += 1
                        falhas.setdefault(f"falhou 5 vezes ({e})", []).append(item["nome"])
                    log(f"❌ {item['nome']}: falhou 5 vezes ({e})")
                    return
                log(f"↻ {os.path.basename(item['nome'])}: {e} — tentando de novo ({tent + 2}/5)")
                time.sleep(3 * (tent + 1))

    def relatorio():
        while not fim.is_set():
            fim.wait(0.5)
            with trava:
                dec = time.time() - est["t0"]
                vel = est["bytes"] / dec if dec > 0 else 0
                feito_b = est["ja_bytes"] + est["bytes"]
                eta = (total - feito_b) / vel if vel > 0 and total else None
                curso = [{"name": n, "pct": int(b * 100 / t) if t else 0, "size": _fmt(t) if t else "—"} for n, b, t in list(est["curso"].values())[:8]]
                pct = int(feito_b * 100 / total) if total else int(est["ok"] * 100 / len(itens))
            st = {"done": _fmt(feito_b), "total": _fmt(total), "speed": _fmt(vel) + "/s",
                  "eta": "pausado" if pause_event is not None and pause_event.is_set() else _eta(eta),
                  "files_done": est["ok"], "files_total": len(itens), "checks": len(ja), "errors": est["erros"],
                  "elapsed": _eta(dec), "transferring": curso}
            if callback_progresso:
                callback_progresso(min(100, pct), st)

    fim = threading.Event()
    th = threading.Thread(target=relatorio, daemon=True)
    th.start()
    if ja:
        log(f"{len(ja)} arquivo(s) já estavam na pasta; baixando os {len(faltam)} que faltam.")
    try:
        with ThreadPoolExecutor(max_workers=PARALELOS.get(perfil, 4)) as ex:
            list(ex.map(um, faltam))
    finally:
        fim.set()
        th.join(2)
    if stop.is_set():
        return False
    if barrado.is_set():
        for i in faltam:   # .part pela metade atrapalharia o login (o rclone grava com o nome final)
            p = os.path.join(destino, i["nome"]) + ".part"
            if os.path.isfile(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
        raise Bloqueado(BLOQUEIO)
    if est["erros"]:
        log(f"⚠ {est['erros']} de {len(itens)} arquivo(s) não vieram. Resumo:")
        for motivo, nomes in falhas.items():
            log(f"   • {len(nomes)} — {motivo}" + (f" (ex.: {os.path.basename(nomes[0])})" if nomes else ""))
        log("   Clique em Baixar de novo para tentar só os que faltam" +
            (" — ou entre com a conta Google (o login baixa o que o link público não deixa)." if falhas else "."))
        return False
    return True
