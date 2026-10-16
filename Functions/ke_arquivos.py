"""
ke_arquivos.py — Kanivete Encoder como Media Encoder: arquivos soltos do disco (e renders de outras ferramentas)
convertidos por predefinição na mesma fila das timelines (frontend/js/editor-fila.js, itens tipo "arquivo").

O andamento sai pelo mesmo canal do export (emit("veOnExport", ...)): a fila, o "Renderizando agora", o Parar
(stop_event), o Drive e a voz da Fran funcionam igual para os dois tipos de item. Placa NVIDIA quando houver (NVENC),
senão o processador.
"""
import os
import re
import subprocess

from Functions.audio_cutter import ffmpeg_path, ffprobe_path, _creationflags

# id: (nome no menu, extensão, vídeo, qualidade, lado menor máximo, sufixo do arquivo)
PRESETS = {
    "mp4_max":  ("MP4 · H.264 · qualidade máxima", "mp4", "h264", "alta", None, "ke"),
    "mp4_1080": ("MP4 · H.264 · 1080p", "mp4", "h264", "alta", 1080, "1080p"),
    "mp4_720":  ("MP4 · H.264 · 720p leve", "mp4", "h264", "leve", 720, "720p"),
    "mp4_h265": ("MP4 · H.265 · arquivo menor", "mp4", "hevc", "alta", None, "h265"),
    "prores":   ("MOV · ProRes 422 HQ (para editar)", "mov", "prores", "alta", None, "prores"),
    "mp3":      ("MP3 · só o áudio (320 kbps)", "mp3", None, "alta", None, ""),
    "wav":      ("WAV · só o áudio", "wav", None, "alta", None, ""),
}
VIDEO_EXT = (".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mxf", ".ts", ".mts", ".m2ts", ".mpg", ".mpeg", ".wmv", ".flv", ".gif")
AUDIO_EXT = (".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wma")


def presets():
    return [{"id": k, "nome": v[0], "ext": v[1], "so_audio": v[2] is None} for k, v in PRESETS.items()]


def _info(path):
    """Duração e se tem vídeo/áudio (ffprobe)."""
    r = subprocess.run([ffprobe_path(), "-v", "error", "-show_entries", "format=duration:stream=codec_type",
                        "-of", "default=nw=1", path], capture_output=True, text=True, timeout=60, creationflags=_creationflags())
    txt = r.stdout or ""
    m = re.search(r"duration=([\d.]+)", txt)
    return {"dur": float(m.group(1)) if m else 0.0, "video": "codec_type=video" in txt, "audio": "codec_type=audio" in txt}


def info(path):
    try:
        i = _info(path)
        return {"success": True, **i, "nome": os.path.basename(path)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _saida(entrada, pasta, ext, sufixo):
    base = os.path.splitext(os.path.basename(entrada))[0]
    pasta = pasta or os.path.dirname(entrada)
    nome = f"{base}_{sufixo}" if sufixo else base
    p = os.path.join(pasta, f"{nome}.{ext}")
    n = 2
    while os.path.exists(p) or os.path.abspath(p) == os.path.abspath(entrada):
        p = os.path.join(pasta, f"{nome} ({n}).{ext}"); n += 1
    return p


def _nvenc():
    try:
        from Functions.compressor_video import _encoders_disponiveis
        from Functions.video_cutter import motivo_sem_gpu
        if motivo_sem_gpu():
            return {}
        return _encoders_disponiveis() or {}
    except Exception:
        return {}


def _comando(entrada, saida, preset, i, usar_gpu):
    _n, ext, v, q, lado, _s = PRESETS[preset]
    cmd = [ffmpeg_path(), "-y", "-hide_banner", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", entrada]
    if v is None:   # só o áudio
        cmd += ["-vn"] + (["-c:a", "libmp3lame", "-b:a", "320k"] if ext == "mp3" else ["-c:a", "pcm_s16le"])
        return cmd + [saida], "áudio"
    filtros = []
    if lado:   # o lado MENOR vai a `lado` (serve para vídeo deitado e em pé); nunca amplia
        filtros.append(f"scale=w='if(gt(iw,ih),-2,min({lado},iw))':h='if(gt(iw,ih),min({lado},ih),-2)'")
    enc = _nvenc() if usar_gpu else {}
    if v == "prores":
        cmd += ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le", "-vendor", "apl0"]
        modo = "processador"
    elif v == "hevc" and enc.get("hevc_nvenc"):
        cmd += ["-c:v", "hevc_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "23", "-b:v", "0", "-tag:v", "hvc1"]
        modo = "placa"
    elif v == "hevc":
        cmd += ["-c:v", "libx265", "-preset", "medium", "-crf", "22", "-tag:v", "hvc1"]
        modo = "processador"
    elif enc.get("h264_nvenc"):
        cmd += ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19" if q == "alta" else "25", "-b:v", "0"]
        modo = "placa"
    else:
        cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "18" if q == "alta" else "23"]
        modo = "processador"
    if v != "prores":
        filtros.append("format=yuv420p")
    if filtros:
        cmd += ["-vf", ",".join(filtros)]
    if i["audio"]:
        cmd += ["-c:a", "pcm_s16le"] if v == "prores" else ["-c:a", "aac", "-b:a", "320k"]
    if ext in ("mp4", "mov"):
        cmd += ["-movflags", "+faststart"]
    return cmd + [saida], modo


def converter(entrada, preset, pasta_saida=None, usar_gpu=True, on_progress=lambda p, m: None, stop_event=None):
    """Converte um arquivo pela predefinição; devolve {success, output_path} como o exportar_video."""
    if preset not in PRESETS:
        return {"success": False, "error": f"predefinição desconhecida: {preset}"}
    if not os.path.isfile(entrada):
        return {"success": False, "error": f"arquivo não encontrado: {entrada}"}
    i = _info(entrada)
    _n, ext, v, _q, _l, sufixo = PRESETS[preset]
    if v and not i["video"]:
        return {"success": False, "error": "esse arquivo não tem vídeo (use MP3 ou WAV)"}
    if not v and not i["audio"]:
        return {"success": False, "error": "esse arquivo não tem áudio"}
    saida = _saida(entrada, pasta_saida, ext, sufixo)
    cmd, modo = _comando(entrada, saida, preset, i, usar_gpu)
    rotulo = {"placa": "Convertendo na placa", "processador": "Convertendo no processador"}.get(modo, "Extraindo o áudio")
    on_progress(0, rotulo)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=_creationflags())
    dur = i["dur"] or 0
    try:
        for linha in proc.stdout:
            if stop_event is not None and stop_event.is_set():
                proc.kill()
                break
            m = re.match(r"out_time_us=(\d+)", linha.strip())
            if m and dur:
                on_progress(min(99.0, int(m.group(1)) / 1e6 / dur * 100), rotulo)
        proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
    if stop_event is not None and stop_event.is_set():
        try:
            os.remove(saida)
        except OSError:
            pass
        return {"success": False, "cancelled": True}
    if proc.returncode != 0 or not os.path.isfile(saida):
        err = (proc.stderr.read() if proc.stderr else "") or "o ffmpeg falhou"
        return {"success": False, "error": err.strip().splitlines()[-1][:300] if err.strip() else "o ffmpeg falhou"}
    on_progress(100, "Concluído!")
    return {"success": True, "output_path": saida, "modo": modo}
