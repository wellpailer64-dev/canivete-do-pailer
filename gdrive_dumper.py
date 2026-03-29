"""
gdrive_dumper.py — Módulo do GDRIVE DUMPER para o Canivete do Pailer
Segue o padrão de callbacks do Canivete: callback_log e callback_progresso
"""
import subprocess
import threading
import sys
import os
import re
import json


def extract_folder_id(link: str):
    for p in [r"/folders/([a-zA-Z0-9_-]+)", r"id=([a-zA-Z0-9_-]+)", r"^([a-zA-Z0-9_-]{25,})$"]:
        m = re.search(p, link.strip())
        if m:
            return m.group(1)
    return None


def _no_window():
    return subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0


def _rclone_exe():
    """
    Retorna o caminho do rclone.
    Procura: 1) ao lado do .exe (dist/), 2) no PATH do sistema.
    """
    # Ao lado do executável (quando rodando como .exe compilado)
    if hasattr(sys, "_MEIPASS"):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))

    local = os.path.join(base, "rclone.exe")
    if os.path.exists(local):
        return local

    # No PATH do sistema
    return "rclone"


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


def calcular_tamanho_pasta(remote_args, callback_log=None, callback_progresso=None):
    """
    Faz pré-varredura para obter tamanho e quantidade de arquivos reais.
    Retorna (bytes: int, arquivos: int)
    """
    if callback_log:
        callback_log("🔍 Calculando tamanho da pasta...")
    if callback_progresso:
        callback_progresso(-1, "Calculando tamanho...")

    try:
        cmd = [_rclone_exe(), "size", "--json"] + remote_args
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120,
                           creationflags=_no_window())
        if r.returncode == 0:
            data = json.loads(r.stdout)
            total_bytes = data.get("bytes", 0)
            total_files = data.get("count", 0)
            if callback_log:
                callback_log(f"📦 Pasta: {_fmt_size(total_bytes)} em {total_files} arquivo(s)")
            return total_bytes, total_files
    except Exception as e:
        if callback_log:
            callback_log(f"⚠️  Não foi possível calcular tamanho: {e}")
    return 0, 0


def dump_pasta(remote_args, destino, transfers=8,
               callback_log=None, callback_progresso=None,
               stop_event=None):
    """
    Executa o download via rclone.
    callback_progresso(pct, texto) onde pct=-1 = indeterminate
    Retorna True se sucesso, False se erro.
    """
    cmd = [_rclone_exe(), "copy", "--progress",
           f"--transfers={transfers}",
           "--retries=10", "--retries-sleep=30s",
           "--low-level-retries=20", "--stats=2s"] + remote_args + [destino]

    if callback_log:
        callback_log(f"🚀 Iniciando download → {destino}")

    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, encoding="utf-8", errors="replace",
            creationflags=_no_window())

        for line in proc.stdout:
            if stop_event and stop_event.is_set():
                proc.terminate()
                if callback_log:
                    callback_log("⛔ Download cancelado.")
                return False

            line = line.rstrip()
            if not line:
                continue

            stats = _parse_stats(line)
            if stats and callback_progresso:
                pct  = stats.get("pct", -1)
                done = stats.get("done", "")
                total = stats.get("total", "")
                speed = stats.get("speed", "")
                eta   = stats.get("eta", "")
                fd    = stats.get("files_done", "")
                ft    = stats.get("files_total", "")
                texto = ""
                if done and total:
                    texto = f"{done} / {total}"
                if speed:
                    texto += f"  •  {speed}"
                if eta:
                    texto += f"  •  ETA {eta}"
                if fd and ft:
                    texto += f"  •  {fd}/{ft} arquivos"
                callback_progresso(pct if pct >= 0 else -1, texto)

        proc.wait()
        if proc.returncode == 0:
            if callback_log:
                callback_log("✅ Download concluído com sucesso!")
            return True
        else:
            if callback_log:
                callback_log("⚠️  Download finalizado com erros. Rode novamente para completar.")
            return False

    except Exception as e:
        if callback_log:
            callback_log(f"❌ ERRO: {e}")
        return False


def _parse_stats(line):
    result = {}
    m = re.search(r'Transferred:\s+([\d.]+\s*\w+)\s*/\s*([\d.]+\s*\w+),\s*(\d+)%,\s*([\d.]+\s*\w+/s),\s*ETA\s*(\S+)', line)
    if m:
        result.update(done=m.group(1), total=m.group(2), pct=int(m.group(3)),
                      speed=m.group(4), eta=m.group(5))
    m2 = re.search(r'Transferred:\s+(\d+)\s*/\s*(\d+),\s*\d+%', line)
    if m2:
        result.update(files_done=int(m2.group(1)), files_total=int(m2.group(2)))
    return result


def _fmt_size(b):
    for u in ["B", "KB", "MB", "GB", "TB"]:
        if b < 1024:
            return f"{b:.2f} {u}"
        b /= 1024
    return f"{b:.2f} TB"
