"""
midia.py — utilidades compartilhadas de mídia (caminhos do app, ffmpeg/ffprobe, progresso).
"""
import os
import re
import sys
import json
import subprocess

NO_WINDOW = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0


def app_dir():
    """Pasta do app: ao lado do .exe (PyInstaller) ou raiz do projeto."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def modelo_path(*partes):
    """
    Caminho de um arquivo em modelos_ia/. Procura primeiro ao lado do .exe (onde o
    setup inicial baixa) e depois em _internal/ (builds antigos baixavam lá).
    """
    candidatos = [os.path.join(app_dir(), "modelos_ia", *partes)]
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidatos.append(os.path.join(meipass, "modelos_ia", *partes))
    for p in candidatos:
        if os.path.exists(p):
            return p
    return candidatos[0]


def logs_dir():
    d = os.path.join(app_dir(), "logs")
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        d = os.path.join(os.path.expanduser("~"), "CaniveteDoPailer_logs")
        os.makedirs(d, exist_ok=True)
    return d


def _exe(nome):
    p = modelo_path(nome + ".exe")
    return p if os.path.exists(p) else nome


def ffmpeg():
    return _exe("ffmpeg")


def ffprobe():
    return _exe("ffprobe")


def probe(caminho, timeout=20):
    """Metadados via ffprobe: duração, streams de vídeo/áudio. {} se falhar."""
    try:
        r = subprocess.run(
            [ffprobe(), "-v", "error", "-show_streams", "-show_format", "-of", "json", caminho],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=timeout, creationflags=NO_WINDOW)
        data = json.loads(r.stdout or "{}")
    except Exception:
        return {}
    streams = data.get("streams") or []
    fmt = data.get("format") or {}
    v = next((s for s in streams if s.get("codec_type") == "video"
              and not (s.get("disposition") or {}).get("attached_pic")), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    try:
        dur = float(fmt.get("duration") or (v or a or {}).get("duration") or 0)
    except (TypeError, ValueError):
        dur = 0.0
    return {
        "duracao": dur,
        "video": v,
        "audio": a,
        "codec_video": (v or {}).get("codec_name", ""),
        "codec_audio": (a or {}).get("codec_name", ""),
        "largura": int((v or {}).get("width") or 0),
        "altura": int((v or {}).get("height") or 0),
        "formato": fmt.get("format_name", ""),
    }


def rodar_ffmpeg(args, duracao=0.0, on_progress=None, stop_event=None):
    """
    Roda o ffmpeg com -progress e chama on_progress(pct 0..100) ao longo do processo.
    Retorna (ok, ultimas_linhas_de_erro).
    """
    cmd = [ffmpeg(), "-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats"] + list(args)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                            encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    erros = []

    def _stderr():
        for ln in proc.stderr:
            erros.append(ln.rstrip())
            del erros[:-20]

    import threading
    threading.Thread(target=_stderr, daemon=True).start()

    for linha in proc.stdout:
        if stop_event is not None and stop_event.is_set():
            proc.kill()
            proc.wait()
            return False, "Cancelado."
        m = re.match(r"out_time_(?:us|ms)=(\d+)", linha)
        if m and on_progress and duracao > 0:
            on_progress(min(99.0, int(m.group(1)) / 1_000_000 / duracao * 100))
    proc.wait()
    return proc.returncode == 0, "\n".join(l for l in erros if l.strip())[-400:]


def nome_livre(caminho):
    """Retorna caminho que não existe ainda: arquivo.ext, arquivo (2).ext, ..."""
    if not os.path.exists(caminho):
        return caminho
    base, ext = os.path.splitext(caminho)
    n = 2
    while os.path.exists(f"{base} ({n}){ext}"):
        n += 1
    return f"{base} ({n}){ext}"


def workers(maximo=4):
    """Nº de tarefas paralelas razoável para a máquina."""
    return max(1, min(maximo, (os.cpu_count() or 2) // 2))
