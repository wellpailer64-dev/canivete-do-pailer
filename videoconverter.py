import os
import sys
import subprocess


ENTRADA_VIDEO = {
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv", ".mpeg", ".mpg"
}

FORMATOS_SAIDA_VIDEO_PARA_GIF = ["GIF"]
FORMATOS_SAIDA_GIF_PARA_VIDEO = ["MP4", "MOV", "WEBM"]


def ffmpeg_path():
    if hasattr(sys, "_MEIPASS"):
        emb = os.path.join(sys._MEIPASS, "ffmpeg.exe")
        if os.path.exists(emb):
            return emb
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ffmpeg.exe")
    if os.path.exists(local):
        return local
    return "ffmpeg"


def detectar_tipo_arquivo(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".gif":
        return "gif"
    if ext in ENTRADA_VIDEO:
        return "video"
    return "invalido"


def _nome_saida(path, ext_saida):
    base = os.path.splitext(path)[0]
    destino = f"{base}_convertido{ext_saida}"
    if not os.path.exists(destino):
        return destino
    n = 1
    while True:
        destino = f"{base}_convertido_{n}{ext_saida}"
        if not os.path.exists(destino):
            return destino
        n += 1


def converter_arquivo(path, formato_saida, loop_gif=True, callback_progresso=None, callback_log=None):
    tipo = detectar_tipo_arquivo(path)
    if tipo == "invalido":
        return {"sucesso": False, "erro": "Formato de entrada nao suportado"}

    ffmpeg = ffmpeg_path()
    saida = None

    if callback_progresso:
        callback_progresso(8, "Preparando conversao...")

    try:
        fmt = str(formato_saida or "").strip().upper()

        if tipo == "video":
            if fmt != "GIF":
                return {"sucesso": False, "erro": "Para video, a saida deve ser GIF"}

            saida = _nome_saida(path, ".gif")
            loop_val = "0" if loop_gif else "-1"
            filtro = (
                "fps=12,scale='min(720,iw)':-2:flags=lanczos,"
                "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer"
            )
            cmd = [
                ffmpeg, "-y", "-i", path,
                "-filter_complex", filtro,
                "-loop", loop_val,
                saida,
            ]

        else:  # gif -> video
            ext_map = {"MP4": ".mp4", "MOV": ".mov", "WEBM": ".webm"}
            if fmt not in ext_map:
                return {"sucesso": False, "erro": "Saida invalida para GIF"}

            saida = _nome_saida(path, ext_map[fmt])

            if fmt in ("MP4", "MOV"):
                cmd = [
                    ffmpeg, "-y", "-stream_loop", "-1", "-i", path,
                    "-t", "15",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    saida,
                ]
            else:  # WEBM
                cmd = [
                    ffmpeg, "-y", "-stream_loop", "-1", "-i", path,
                    "-t", "15",
                    "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p",
                    saida,
                ]

        if callback_log:
            callback_log(f"Convertendo: {os.path.basename(path)} -> {os.path.basename(saida)}")

        proc = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3600,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )

        if proc.returncode == 0 and saida and os.path.exists(saida):
            if callback_progresso:
                callback_progresso(100, "Finalizado")
            return {
                "sucesso": True,
                "saida": saida,
                "tipo_entrada": tipo,
                "formato_saida": fmt,
            }

        return {"sucesso": False, "erro": "Falha na conversao"}

    except subprocess.TimeoutExpired:
        return {"sucesso": False, "erro": "Timeout na conversao"}
    except FileNotFoundError:
        return {"sucesso": False, "erro": "ffmpeg nao encontrado"}
    except Exception as e:
        return {"sucesso": False, "erro": str(e)}
