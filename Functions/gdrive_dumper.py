"""
gdrive_dumper.py — Módulo do GDRIVE DUMPER para o Canivete do Pailer
Segue o padrão de callbacks do Canivete: callback_log e callback_progresso

Funcionalidades:
- Stats estruturados via --use-json-log (bytes, velocidade, ETA, arquivos em curso)
- Pause / Resume real (mata rclone e relança — rclone copy é idempotente)
- Detecção de travamento por falta de PROGRESSO (não só falta de output)
- Auto-retry com tratamento de erros fatais (cota excedida, não encontrado)
- Suporte a link de pasta e de arquivo único
"""
import subprocess
import threading
import collections
import sys
import os
import re
import json
import time

_current_proc = None
_current_proc_lock = threading.Lock()

MAX_TENTATIVAS = 10
STALL_TIMEOUT = 180      # segundos sem progresso algum antes de reiniciar o rclone
EMIT_INTERVAL = 0.4      # throttle de atualizações para a UI

# Perfis de conexão. Em internet lenta, menos transferências paralelas = arquivos
# terminam antes, menos timeouts e menos re-download de parciais.
PERFIS = {
    "rapida": {"transfers": 8, "streams": 4, "buffer": "64M", "timeout": "300s"},
    "normal": {"transfers": 4, "streams": 4, "buffer": "32M", "timeout": "300s"},
    "lenta":  {"transfers": 2, "streams": 2, "buffer": "16M", "timeout": "600s"},
}


def force_kill():
    """Mata o processo rclone imediatamente, usado no cancelamento/fechamento do app."""
    with _current_proc_lock:
        if _current_proc is not None:
            try:
                _current_proc.kill()
            except Exception:
                pass


def parse_link(link: str):
    """Retorna (tipo, id) onde tipo é 'folder' ou 'file'. (None, None) se inválido."""
    link = (link or "").strip()
    m = re.search(r"/folders/([a-zA-Z0-9_-]+)", link)
    if m:
        return "folder", m.group(1)
    m = re.search(r"/file/d/([a-zA-Z0-9_-]+)", link) or re.search(r"/document/d/([a-zA-Z0-9_-]+)", link)
    if m:
        return "file", m.group(1)
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", link)
    if m:
        # open?id= / uc?id= — "uc" é sempre arquivo; "open" pode ser pasta, tratamos como pasta
        return ("file" if "/uc" in link else "folder"), m.group(1)
    m = re.match(r"^([a-zA-Z0-9_-]{25,})$", link)
    if m:
        return "folder", m.group(1)
    return None, None


def extract_folder_id(link: str):
    """Compatibilidade: retorna apenas o ID (pasta ou arquivo)."""
    return parse_link(link)[1]


def _no_window():
    return subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0


def _rclone_exe():
    """Retorna o caminho do rclone em modelos_ia/ (ao lado do exe ou na raiz do projeto)."""
    candidatos = []
    if hasattr(sys, "_MEIPASS"):
        candidatos.append(os.path.join(os.path.dirname(sys.executable), "modelos_ia", "rclone.exe"))
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidatos.append(os.path.join(base, "modelos_ia", "rclone.exe"))
    for p in candidatos:
        if os.path.exists(p):
            return p
    return "rclone"


def _alta_prioridade():
    """Prioridade de processo acima do normal (Windows) para o rclone não perder CPU/IO."""
    return getattr(subprocess, "ABOVE_NORMAL_PRIORITY_CLASS", 0) if sys.platform == "win32" else 0


def _sistema_arquivos(caminho):
    """Retorna o sistema de arquivos do volume (ex. 'NTFS', 'exFAT', 'FAT32') ou '' se desconhecido."""
    if sys.platform != "win32":
        return ""
    try:
        import ctypes
        raiz = os.path.splitdrive(os.path.abspath(caminho))[0] + "\\"
        buf = ctypes.create_unicode_buffer(64)
        ok = ctypes.windll.kernel32.GetVolumeInformationW(
            ctypes.c_wchar_p(raiz), None, 0, None, None, None, buf, len(buf))
        return buf.value if ok else ""
    except Exception:
        return ""


def _suporta_sparse(caminho):
    """Sem sparse (exFAT/FAT32), o download multi-thread força o Windows a preencher o
    arquivo com zeros a cada gravação fora de ordem — derruba a velocidade para KB/s."""
    fs = _sistema_arquivos(caminho).upper()
    return fs in ("", "NTFS", "REFS")


def _logs_dir():
    base = os.path.dirname(sys.executable) if hasattr(sys, "_MEIPASS") else \
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    d = os.path.join(base, "logs")
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        d = os.path.join(os.path.expanduser("~"), "CaniveteDoPailer_logs")
        os.makedirs(d, exist_ok=True)
    return d


def verificar_rclone():
    """Retorna (ok: bool, versao: str)"""
    try:
        r = subprocess.run([_rclone_exe(), "version"], capture_output=True, text=True, timeout=5,
                           creationflags=_no_window())
        if r.returncode == 0:
            return True, r.stdout.split("\n")[0]
    except Exception:
        pass
    return False, ""


def verificar_gdrive_configurado():
    """Verifica se o remote gdrive já está configurado."""
    try:
        r = subprocess.run([_rclone_exe(), "listremotes"], capture_output=True, text=True, timeout=5,
                           creationflags=_no_window())
        return "gdrive:" in r.stdout
    except Exception:
        return False


# Credencial OAuth própria (projeto "canivete-do-pailer" no Google Cloud). O client_id padrão
# do rclone é compartilhado por todos os usuários do mundo e vive estourando o limite do Google.
# Em apps desktop o secret não é confidencial; fica fatiado só para não disparar scanners.
CLIENT_ID = "1080880442408-4n2ncnfnrl80qrcu4tps2mk1qkjji936.apps.googleusercontent.com"
OAUTH_TIMEOUT = 600      # tempo para o usuário autorizar no navegador

# O secret não fica no repositório público: vem de Functions/_credenciais.py (fora do git;
# no build, o GitHub Actions gera esse arquivo a partir do secret GDRIVE_CLIENT_SECRET).
try:
    from Functions._credenciais import CLIENT_SECRET
except Exception:  # ausente ou com defeito: nunca derruba o app
    CLIENT_SECRET = os.environ.get("GDRIVE_CLIENT_SECRET", "")


def _config_gdrive():
    """Retorna o dict de config do remote 'gdrive' (ou None se não existir)."""
    try:
        r = subprocess.run([_rclone_exe(), "config", "dump"], capture_output=True, text=True,
                           timeout=10, encoding="utf-8", errors="replace", creationflags=_no_window())
        return json.loads(r.stdout or "{}").get("gdrive")
    except Exception:
        return None


def usa_client_proprio():
    cfg = _config_gdrive()
    return bool(cfg) and cfg.get("client_id") == CLIENT_ID and bool(cfg.get("token"))


def garantir_conexao(callback_log=None):
    """
    Garante o remote 'gdrive' com a credencial própria. Cria ou migra se preciso —
    o rclone abre o navegador e espera o usuário clicar em "Permitir".
    Retorna (ok, erro).
    """
    log = callback_log or (lambda m: None)
    cfg = _config_gdrive()
    if cfg and cfg.get("client_id") == CLIENT_ID and cfg.get("token"):
        return True, None
    if not CLIENT_SECRET:
        # Build sem a credencial própria: segue com o remote que existir (credencial padrão do rclone)
        if cfg and cfg.get("token"):
            return True, None
        return False, "Google Drive não configurado e esta versão está sem a credencial do app."

    if cfg:
        log("Atualizando a conexão com o Google Drive (só desta vez)...")
        cmd = [_rclone_exe(), "config", "update", "gdrive",
               "client_id", CLIENT_ID, "client_secret", CLIENT_SECRET, "config_refresh_token", "true"]
    else:
        log("Conectando ao Google Drive pela primeira vez...")
        cmd = [_rclone_exe(), "config", "create", "gdrive", "drive", "scope", "drive",
               "client_id", CLIENT_ID, "client_secret", CLIENT_SECRET]
    log("🌐 Uma página do Google vai abrir. Escolha sua conta e clique em Permitir. "
        "Se aparecer 'O Google não verificou este app', clique em Avançado → Acessar Canivete do Pailer.")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=OAUTH_TIMEOUT,
                           stdin=subprocess.DEVNULL, encoding="utf-8", errors="replace",
                           creationflags=_no_window())
    except subprocess.TimeoutExpired:
        return False, "Tempo esgotado esperando a autorização no navegador. Tente de novo."
    except FileNotFoundError:
        return False, "rclone não encontrado. Rode o setup inicial do app para baixá-lo."

    if usa_client_proprio():
        log("✅ Google Drive conectado!")
        return True, None
    erro = (r.stderr or r.stdout or "").strip()
    return False, f"Não foi possível conectar ao Google Drive. {erro[-300:]}"


def get_folder_name(folder_id, callback_log=None, tipo="folder"):
    """Obtém o nome real da pasta/arquivo pelo ID via página pública do Google Drive."""
    import urllib.request
    import html as _html
    try:
        url = (f"https://drive.google.com/drive/folders/{folder_id}" if tipo == "folder"
               else f"https://drive.google.com/file/d/{folder_id}/view")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            page = resp.read().decode("utf-8", errors="replace")
        m = re.search(r"<title>(.+?)\s*[-–]\s*Google Drive</title>", page, re.IGNORECASE)
        if m:
            return _html.unescape(m.group(1).strip())
        m2 = re.search(r'property="og:title"\s+content="([^"]+)"', page)
        if m2:
            return _html.unescape(m2.group(1).strip())
    except Exception as e:
        if callback_log:
            callback_log(f"Não foi possível obter o nome (pasta privada?): {e}")
    return folder_id


def _explicar_erro(texto):
    """Traduz erros comuns do Google Drive/rclone para mensagens claras."""
    t = (texto or "").lower()
    if "downloadquotaexceeded" in t or "quota for this file has been exceeded" in t:
        return "Cota de download do Google excedida para este arquivo. Tente novamente em ~24h ou faça uma cópia no seu Drive."
    if "userratelimitexceeded" in t or "ratelimitexceeded" in t:
        return "Limite de requisições do Google atingido. O rclone vai aguardar e tentar de novo."
    if "cannotdownloadabusivefile" in t:
        return "Arquivo marcado pelo Google como abusivo/malware."
    if "insufficientfilepermissions" in t or "403" in t and "forbidden" in t:
        return "Sem permissão de acesso. Verifique se o link está compartilhado com sua conta."
    if "no space left" in t or "disk full" in t or "there is not enough space" in t:
        return "Sem espaço em disco no destino."
    if "notfound" in t or "directory not found" in t or "404" in t:
        return "Pasta/arquivo não encontrado (link errado ou sem acesso)."
    if "invalid_grant" in t or "token" in t and "expired" in t:
        return "Login do Google expirado. Rode 'rclone config reconnect gdrive:'."
    return None


def calcular_tamanho_pasta(remote_args, callback_log=None, callback_progresso=None):
    if callback_log:
        callback_log("Calculando tamanho da pasta...")

    for use_shared in (False, True):
        try:
            cmd = [_rclone_exe(), "size", "--json", "--fast-list"]
            if use_shared:
                cmd.append("--drive-shared-with-me")
            cmd += remote_args

            r = subprocess.run(cmd, capture_output=True, text=True, timeout=900,
                               encoding="utf-8", errors="replace", creationflags=_no_window())

            if r.returncode == 0:
                data = json.loads(r.stdout)
                return data.get("bytes", 0), data.get("count", 0), None

            erro_txt = r.stderr.strip() or r.stdout.strip()
            _not_found_hints = ("notfound", "404", "not found", "directory not found", "couldn't find")
            if not use_shared and any(h in erro_txt.lower() for h in _not_found_hints):
                if callback_log:
                    callback_log("Pasta não encontrada. Tentando acesso compartilhado...")
                continue

            return 0, 0, _explicar_erro(erro_txt) or f"Rclone erro: {erro_txt[-400:]}"

        except subprocess.TimeoutExpired:
            return 0, 0, "Tempo esgotado ao listar a pasta (pasta muito grande). Pode baixar mesmo assim."
        except Exception as e:
            return 0, 0, f"Exceção: {str(e)}"

    return 0, 0, "Pasta não encontrada (nem em 'Meu Drive' nem em 'Compartilhado comigo')."


def _fmt_size(b):
    b = float(b or 0)
    for u in ["B", "KB", "MB", "GB", "TB"]:
        if b < 1024:
            return f"{b:.2f} {u}"
        b /= 1024
    return f"{b:.2f} PB"


def _fmt_eta(seg):
    if seg is None:
        return "calculando..."
    seg = int(seg)
    h, rem = divmod(seg, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m"
    if m:
        return f"{m}m {s:02d}s"
    return f"{s}s"


def _stats_to_ui(st):
    """Converte o objeto 'stats' do rclone em dicionário para a UI."""
    bytes_ = st.get("bytes", 0) or 0
    total = st.get("totalBytes", 0) or 0
    transfers = st.get("transfers", 0) or 0
    total_transfers = st.get("totalTransfers", 0) or 0
    checks = st.get("checks", 0) or 0
    pct = int(bytes_ * 100 / total) if total else 0
    em_curso = st.get("transferring") or []
    arquivos = [
        {
            "name": os.path.basename(t.get("name", "")),
            "pct": t.get("percentage", 0) or 0,
            "size": _fmt_size(t.get("size", 0)),
            "speed": _fmt_size(t.get("speedAvg") or t.get("speed") or 0) + "/s",
        }
        for t in em_curso
    ]
    return {
        "pct": min(pct, 100),
        "done": _fmt_size(bytes_),
        "total": _fmt_size(total) if total else "calculando...",
        "speed": _fmt_size(st.get("speed", 0)) + "/s",
        "eta": _fmt_eta(st.get("eta")),
        "files_done": transfers,
        "files_total": total_transfers,
        "checks": checks,
        "errors": st.get("errors", 0) or 0,
        "elapsed": _fmt_eta(st.get("elapsedTime", 0)),
        "transferring": arquivos[:8],
        "_sig": (bytes_, transfers, checks, st.get("listed", 0)),
        "_idle_ok": total_transfers > 0 and transfers >= total_transfers and not em_curso,
    }


def _montar_cmd(tipo, remote_args, destino, perfil, use_shared):
    cfg = PERFIS.get(perfil, PERFIS["normal"])
    sparse = _suporta_sparse(destino)
    comum = [
        # ── Performance ──
        f"--transfers={cfg['transfers']}",
        f"--checkers={max(4, cfg['transfers'] * 2)}",
        f"--buffer-size={cfg['buffer']}",
        # Sem sparse: 1 stream por arquivo (gravação sequencial, sem preenchimento com zeros)
        f"--multi-thread-streams={cfg['streams'] if sparse else 0}",
        "--multi-thread-cutoff=64M",
        # ── Resiliência ──
        "--retries=10",
        "--retries-sleep=10s",
        "--low-level-retries=20",
        f"--timeout={cfg['timeout']}",
        "--contimeout=60s",
        # ── Google Drive ──
        "--drive-acknowledge-abuse",
        # ── Stats estruturados (JSON) ──
        "--use-json-log",
        "--log-level=INFO",
        "--stats=1s",
        "--stats-log-level=NOTICE",
    ]
    if not sparse:
        comum.append("--local-no-sparse")
    if use_shared:
        comum.append("--drive-shared-with-me")
    if tipo == "file":
        # remote_args = [file_id]
        return [_rclone_exe(), "backend", "copyid", "gdrive:", remote_args[0], destino.rstrip("\\/") + os.sep] + comum
    return [_rclone_exe(), "copy"] + comum + remote_args + [destino]


def dump_pasta(remote_args, destino, perfil="rapida",
               callback_log=None, callback_progresso=None,
               callback_arquivo=None,
               stop_event=None, pause_event=None, tipo="folder"):
    """
    Executa o download via rclone.

    callback_progresso(pct, stats_dict)
    callback_arquivo(nome, progresso_texto)
    callback_log(mensagem)

    stop_event: Event — set para cancelar definitivamente
    pause_event: Event — set para pausar, clear para retomar (a thread espera)

    Retorna True se sucesso, False se erro/cancelado.
    """
    global _current_proc
    log = callback_log or (lambda m: None)
    os.makedirs(destino, exist_ok=True)
    if not _suporta_sparse(destino):
        fs = _sistema_arquivos(destino)
        log(f"Disco de destino em {fs}: usando gravação sequencial (mais rápida nesse formato).")
        if fs.upper() == "FAT32":
            log("⚠ FAT32 não aceita arquivos acima de 4 GB. Prefira um disco NTFS/exFAT.")

    trace = collections.deque(maxlen=3000)   # últimas linhas p/ depuração (memória limitada)
    use_shared = False
    tentativa = 0
    ultimo_erro = ""
    ultimo_ui = {}

    def _salvar_trace():
        try:
            path = os.path.join(_logs_dir(), "gdrive_debug_trace.txt")
            with open(path, "w", encoding="utf-8") as f:
                f.write("\n".join(trace))
        except Exception:
            pass

    while tentativa < MAX_TENTATIVAS:
        if stop_event and stop_event.is_set():
            return False

        # Pausa: espera aqui sem gastar tentativa
        if pause_event and pause_event.is_set():
            log("⏸ Pausado. Clique em Retomar para continuar.")
            if callback_progresso and ultimo_ui:
                callback_progresso(ultimo_ui.get("pct", 0), {**ultimo_ui, "speed": "0 B/s",
                                                             "eta": "pausado", "message": "⏸ Pausado"})
            while pause_event.is_set():
                if stop_event and stop_event.is_set():
                    return False
                time.sleep(0.3)
            log("▶ Retomando download (arquivos já baixados serão pulados)...")

        tentativa += 1
        log("Iniciando download..." if tentativa == 1 else f"Tentativa {tentativa}/{MAX_TENTATIVAS} — retomando...")

        cmd = _montar_cmd(tipo, remote_args, destino, perfil, use_shared)
        pausado = travou = False
        erros_linhas = []

        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1, encoding="utf-8", errors="replace",
                creationflags=_no_window() | _alta_prioridade())
            with _current_proc_lock:
                _current_proc = proc

            linhas = _iter_linhas(proc, stop_event, pause_event)
            ultimo_sig = None
            ultimo_progresso = time.time()
            ultimo_emit = 0.0
            ultimo_arquivo = None

            for line in linhas:
                if line == "__PAUSED__":
                    pausado = True
                    break
                if line == "__STOP__":
                    log("Cancelando download...")
                    _matar(proc)
                    _salvar_trace()
                    return False
                if line == "__TICK__":
                    if time.time() - ultimo_progresso >= STALL_TIMEOUT and not ultimo_ui.get("_idle_ok"):
                        log(f"Sem progresso por {STALL_TIMEOUT}s. Reiniciando conexão...")
                        travou = True
                        break
                    continue

                trace.append(line)
                try:
                    obj = json.loads(line)
                except ValueError:
                    obj = {"level": "info", "msg": line}

                st = obj.get("stats")
                if isinstance(st, dict):
                    ui = _stats_to_ui(st)
                    if ui["_sig"] != ultimo_sig:
                        ultimo_sig = ui["_sig"]
                        ultimo_progresso = time.time()
                    ultimo_ui = ui
                    if ui["files_total"] and ui["files_done"] >= ui["files_total"] and not ui["transferring"]:
                        ui = {**ui, "message": "Finalizando... conferindo arquivos."}
                    agora = time.time()
                    if callback_progresso and agora - ultimo_emit >= EMIT_INTERVAL:
                        ultimo_emit = agora
                        callback_progresso(ui["pct"], {k: v for k, v in ui.items() if not k.startswith("_")})
                    if callback_arquivo and ui["transferring"]:
                        nome = ui["transferring"][0]["name"]
                        if nome != ultimo_arquivo:
                            ultimo_arquivo = nome
                            callback_arquivo(nome, "Transferindo...")
                    continue

                level = obj.get("level", "")
                msg = str(obj.get("msg", "")).strip()
                if level in ("error", "critical"):
                    erros_linhas.append(msg)
                    ultimo_erro = msg
                    amigavel = _explicar_erro(msg)
                    log(f"⚠ {amigavel or msg[:200]}")

            if pausado or travou:
                _matar(proc)
            else:
                proc.wait()
            with _current_proc_lock:
                _current_proc = None
            _salvar_trace()

            if pausado:
                tentativa -= 1   # pausa não conta como tentativa
                continue
            if travou:
                time.sleep(3)
                continue

            rc = proc.returncode
            if rc == 0:
                if callback_progresso:
                    final = {k: v for k, v in ultimo_ui.items() if not k.startswith("_")}
                    callback_progresso(100, {**final, "pct": 100, "eta": "0s",
                                             "message": "✅ Download concluído e verificado."})
                log("Download concluído com sucesso!")
                return True

            texto_erros = "\n".join(erros_linhas).lower()
            # Não encontrado → tenta 'Compartilhado comigo' uma vez
            if rc in (3, 4) or "notfound" in texto_erros or "directory not found" in texto_erros:
                if not use_shared:
                    use_shared = True
                    log("Não encontrado em 'Meu Drive'. Tentando 'Compartilhado comigo'...")
                    continue
                log("❌ Pasta/arquivo não encontrado. Confira o link e se sua conta tem acesso.")
                return False
            # Erros que não adianta repetir
            if "downloadquotaexceeded" in texto_erros or "cannotdownloadabusivefile" in texto_erros \
                    or "no space left" in texto_erros or "not enough space" in texto_erros:
                log("❌ " + (_explicar_erro(texto_erros) or "Erro fatal."))
                return False
            if "invalid_grant" in texto_erros:
                log("❌ " + _explicar_erro("invalid_grant"))
                return False

            log(f"rclone saiu com código {rc}. Retentando em 5s...")
            time.sleep(5)

        except FileNotFoundError:
            log("❌ rclone não encontrado. Rode o setup inicial do app para baixá-lo.")
            return False
        except Exception as e:
            log(f"ERRO: {e}")
            time.sleep(5)

    log(f"Download falhou após {MAX_TENTATIVAS} tentativas. Último erro: "
        f"{_explicar_erro(ultimo_erro) or ultimo_erro[:200] or 'desconhecido'}. "
        "Rode novamente — o rclone retoma de onde parou.")
    return False


def _matar(proc):
    try:
        proc.kill()
        proc.wait(timeout=10)
    except Exception:
        pass


def _iter_linhas(proc, stop_event=None, pause_event=None):
    """
    Gerador de linhas do stdout do rclone (lidas por uma thread).
    Emite '__TICK__' a cada ~1s sem linhas, '__PAUSED__' / '__STOP__' quando sinalizado.
    """
    import queue
    q = queue.Queue()

    def _reader():
        try:
            for ln in proc.stdout:
                q.put(ln)
        except Exception:
            pass
        finally:
            q.put(None)

    threading.Thread(target=_reader, daemon=True).start()

    while True:
        if stop_event and stop_event.is_set():
            yield "__STOP__"
            return
        if pause_event and pause_event.is_set():
            yield "__PAUSED__"
            return
        try:
            ln = q.get(timeout=1)
        except queue.Empty:
            yield "__TICK__"
            continue
        if ln is None:
            return
        ln = ln.strip()
        if ln:
            yield ln
        yield "__TICK__"
