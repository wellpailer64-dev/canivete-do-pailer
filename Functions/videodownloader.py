import os
import sys
import shutil
import re
import urllib.request
import time
import base64
import tempfile
import subprocess
import contextlib
import threading

_POPEN_PATCH_LOCK = threading.Lock()

_ultimo_erro = [""]


def _internal_log(msg):
    _ultimo_erro[0] = str(msg)


def explicar_erro(e):
    """Traduz os erros mais comuns do yt-dlp para o usuário."""
    t = str(e)
    tl = t.lower()
    if "sign in to confirm" in tl or "not a bot" in tl:
        return "O YouTube pediu verificação anti-robô. Tente de novo em alguns minutos ou use outra rede."
    if "private video" in tl or "login required" in tl or "requires authentication" in tl:
        return "Vídeo privado ou que exige login."
    if "unsupported url" in tl:
        return "Site ou link não suportado."
    if "unavailable" in tl or "not available" in tl:
        return "Vídeo indisponível (removido ou bloqueado na sua região)."
    if "http error 403" in tl:
        return "O site bloqueou o download (403). Tente novamente — se persistir, o app precisa ser atualizado."
    return re.sub(r"^ERROR:\s*", "", t)[:300]

class _QuietYtdlpLogger:
    def debug(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        _internal_log(msg)

def _deno_path():
    """deno.exe baixado pelo setup (o YouTube exige um runtime JS para liberar os formatos)."""
    try:
        from Functions.midia import modelo_path
        p = modelo_path("deno.exe")
        if os.path.exists(p):
            return p
    except Exception:
        pass
    return shutil.which("deno") or ""


def _opts_base(**extra):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": _QuietYtdlpLogger(),
        "noplaylist": True,
        "retries": 10,
        "fragment_retries": 10,
        "concurrent_fragment_downloads": 4,
        # Scripts do desafio do YouTube: pacote yt-dlp-ejs ou, se faltar, baixados do GitHub
        "remote_components": ["ejs:github"],
    }
    deno = _deno_path()
    if deno:
        opts["js_runtimes"] = {"deno": {"path": deno}}
    opts.update(extra)
    return opts


# Seletores de formato
# compativel: H.264 + AAC (abre em qualquer editor/celular), até 1080p no YouTube
# maxima: melhor imagem disponível (4K/8K em VP9/AV1), juntado em MP4
FORMATO_COMPATIVEL = (
    "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b"
)
FORMATO_MAXIMO = "bv*+ba/b"


def _default_download_dir():
    return os.path.join(os.path.expanduser("~"), "Downloads")

def _resolver_ffmpeg_exe():
    candidatos = []
    try:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        exe_dir = os.path.dirname(sys.executable) if hasattr(sys, "_MEIPASS") else base
        candidatos.append(os.path.join(exe_dir, "modelos_ia", "ffmpeg.exe"))
        candidatos.append(os.path.join(base, "modelos_ia", "ffmpeg.exe"))
    except:
        pass

    for p in candidatos:
        if p and os.path.exists(p):
            return os.path.abspath(p)
    return shutil.which("ffmpeg") or shutil.which("ffmpeg.exe") or ""


def _unique_dest_path(path):
    if not os.path.exists(path):
        return path

    base, ext = os.path.splitext(path)
    i = 2
    while True:
        candidate = f"{base} ({i}){ext}"
        if not os.path.exists(candidate):
            return candidate
        i += 1


def _move_final_file(src_path, destino):
    os.makedirs(destino, exist_ok=True)
    final_path = _unique_dest_path(os.path.join(destino, os.path.basename(src_path)))
    shutil.move(src_path, final_path)
    return final_path


def _find_newest_file(folder, extensions):
    candidates = []
    for name in os.listdir(folder):
        path = os.path.join(folder, name)
        if os.path.isfile(path) and os.path.splitext(name)[1].lower() in extensions:
            candidates.append(path)

    if not candidates:
        return ""
    return max(candidates, key=os.path.getmtime)


@contextlib.contextmanager
def _yt_dlp_no_console():
    """Garante que ffmpeg/ffprobe abertos pelo yt-dlp nao mostrem console no Windows."""
    if sys.platform != "win32":
        yield
        return

    original_popen = subprocess.Popen

    def quiet_popen(*args, **kwargs):
        kwargs["creationflags"] = kwargs.get("creationflags", 0) | subprocess.CREATE_NO_WINDOW
        return original_popen(*args, **kwargs)

    with _POPEN_PATCH_LOCK:
        subprocess.Popen = quiet_popen
        try:
            yield
        finally:
            subprocess.Popen = original_popen


def extrair_info_video(url: str):
    try:
        import yt_dlp
    except Exception as e:
        _internal_log(f"ERRO NO IMPORT: {e}")
        raise

    ydl_opts = _opts_base(skip_download=True)

    with _yt_dlp_no_console():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

    if not info:
        raise RuntimeError("Nao foi possivel extrair dados")

    title = info.get("title") or "Sem titulo"
    thumb_url = info.get("thumbnail") or ""
    duration = int(info.get("duration") or 0)
    vid = info.get("id") or str(int(time.time()))
    
    filesize = info.get("filesize") or info.get("filesize_approx")
    if not filesize and "formats" in info:
        try:
            f = info["formats"][-1]
            filesize = f.get("filesize") or f.get("filesize_approx")
        except: pass
    
    filesize_mb = round(filesize / (1024 * 1024), 1) if filesize else 0

    thumb_base64 = ""
    if thumb_url:
        try:
            opener = urllib.request.build_opener()
            opener.addheaders = [('User-agent', 'Mozilla/5.0')]
            urllib.request.install_opener(opener)
            with urllib.request.urlopen(thumb_url, timeout=5) as response:
                data = response.read()
                b64 = base64.b64encode(data).decode('utf-8')
                thumb_base64 = f"data:image/jpeg;base64,{b64}"
        except:
            thumb_base64 = thumb_url

    return {
        "id": vid,
        "title": title,
        "thumbnail": thumb_base64,
        "thumbnail_url": thumb_url,
        "duration": duration,
        "filesize_mb": filesize_mb,
        "provider": info.get("extractor_key") or "Generic",
        "webpage_url": info.get("webpage_url") or url,
    }

def _make_hook(callback, partes=1):
    """Hook yt-dlp → callback(pct 0..97, msg). Vídeo e áudio separados viram uma barra só."""
    estado = {"fase": 0}

    def _hook(d):
        if not callback:
            return
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            frac = (d.get("downloaded_bytes") or 0) / total if total else 0.0
            geral = min(97.0, (estado["fase"] + frac) / partes * 97)
            vel = d.get("speed") or 0
            vel_txt = f"{vel / 1048576:.1f} MB/s" if vel else ""
            eta = d.get("eta")
            eta_txt = f" • falta {int(eta) // 60}:{int(eta) % 60:02d}" if eta else ""
            callback(geral, f"Baixando {geral:.0f}% • {vel_txt}{eta_txt}")
        elif d.get("status") == "finished":
            estado["fase"] = min(partes, estado["fase"] + 1)
            if estado["fase"] >= partes:
                callback(98.0, "Download concluído. Finalizando arquivo...")
    return _hook


def _make_postprocessor_hook(callback):
    def _hook(d):
        if not callback:
            return

        status = d.get("status")
        pp = d.get("postprocessor") or "pos-processamento"
        if status == "started":
            if str(pp).lower() == "merger":
                callback(99.0, "Juntando audio e video sem reencodar...")
            else:
                callback(99.0, f"Finalizando arquivo ({pp})...")
        elif status == "finished":
            callback(99.0, "Arquivo final gerado. Limpando temporarios...")

    return _hook


def baixar_video_mp4(url: str, destino_dir: str = "", callback=None, qualidade="compativel"):
    """callback(pct: float, msg: str). qualidade: 'compativel' (H.264) ou 'maxima' (até 4K)."""
    import yt_dlp
    destino = os.path.abspath(destino_dir.strip()) if destino_dir.strip() else _default_download_dir()
    os.makedirs(destino, exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix=".canivete_video_", dir=destino)

    ydl_opts = _opts_base(
        format=FORMATO_MAXIMO if qualidade == "maxima" else FORMATO_COMPATIVEL,
        merge_output_format="mp4",
        outtmpl=os.path.join(temp_dir, "%(title).150B [%(id)s].%(ext)s"),
        keepvideo=False,
        progress_hooks=[_make_hook(callback, partes=2)],
        postprocessor_hooks=[_make_postprocessor_hook(callback)],
    )

    ffmpeg_exe = _resolver_ffmpeg_exe()
    if ffmpeg_exe:
        ydl_opts["ffmpeg_location"] = ffmpeg_exe
    else:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError("FFmpeg nao encontrado. Nao e possivel juntar audio e video em MP4.")

    try:
        with _yt_dlp_no_console():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
            if not os.path.exists(filename):
                base = os.path.splitext(filename)[0]
                if os.path.exists(base + ".mp4"):
                    filename = base + ".mp4"
            if not os.path.exists(filename):
                filename = _find_newest_file(temp_dir, {".mp4"})
            if not filename or not os.path.exists(filename):
                raise RuntimeError("Download finalizou, mas o arquivo MP4 final nao foi encontrado.")

            final_path = _move_final_file(filename, destino)
            if callback:
                callback(100.0, f"Concluido: {os.path.basename(final_path)}")
            return final_path
    except Exception as e:
        _internal_log(f"ERRO NO DOWNLOAD: {e}")
        raise RuntimeError(str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def baixar_audio_mp3(url: str, destino_dir: str = "", callback=None):
    """Baixa somente o áudio e converte para MP3 192kbps. callback(pct: float, msg: str)"""
    import yt_dlp
    destino = os.path.abspath(destino_dir.strip()) if destino_dir.strip() else _default_download_dir()
    os.makedirs(destino, exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix=".canivete_audio_", dir=destino)

    ffmpeg_exe = _resolver_ffmpeg_exe()

    ydl_opts = _opts_base(
        format="bestaudio/best",
        outtmpl=os.path.join(temp_dir, "%(title).150B [%(id)s].%(ext)s"),
        progress_hooks=[_make_hook(callback)],
        postprocessor_hooks=[_make_postprocessor_hook(callback)],
        postprocessors=[{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }],
    )

    if ffmpeg_exe:
        ydl_opts["ffmpeg_location"] = ffmpeg_exe
    else:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError("FFmpeg nao encontrado. Nao e possivel converter o audio para MP3.")

    try:
        with _yt_dlp_no_console():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
            mp3_path = os.path.splitext(filename)[0] + ".mp3"
            final_source = mp3_path if os.path.exists(mp3_path) else _find_newest_file(temp_dir, {".mp3"})
            if not final_source or not os.path.exists(final_source):
                raise RuntimeError("Download finalizou, mas o arquivo MP3 final nao foi encontrado.")
            final_path = _move_final_file(final_source, destino)
            if callback:
                callback(100.0, f"Concluido: {os.path.basename(final_path)}")
            return final_path
    except Exception as e:
        raise RuntimeError(str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
