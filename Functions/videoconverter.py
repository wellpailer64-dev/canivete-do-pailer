import os
import sys
import subprocess


ENTRADA_VIDEO = {
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv", ".mpeg", ".mpg"
}

FORMATOS_SAIDA_VIDEO = ["GIF", "MP3", "MP4", "AVI", "MKV", "MOV", "WEBM"]
FORMATOS_SAIDA_GIF_PARA_VIDEO = ["MP4", "MOV", "WEBM"]


def ffmpeg_path():
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

    return "ffmpeg"


def detectar_tipo_arquivo(path):
    if not path or not os.path.exists(path):
        return "invalido"
    if os.path.isdir(path):
        return "pasta"
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
    if tipo == "pasta":
        return {"sucesso": False, "erro": "Caminho e uma pasta"}

    ffmpeg = ffmpeg_path()
    saida = None

    try:
        fmt = str(formato_saida or "").strip().upper()

        if tipo == "video":
            if fmt == "GIF":
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
            elif fmt == "MP3":
                saida = _nome_saida(path, ".mp3")
                cmd = [
                    ffmpeg, "-y", "-i", path,
                    "-vn", "-acodec", "libmp3lame", "-ab", "192k",
                    saida,
                ]
            else:
                # Outros formatos de vídeo (transcoding simples)
                ext_map = {"MP4": ".mp4", "AVI": ".avi", "MKV": ".mkv", "MOV": ".mov", "WEBM": ".webm"}
                ext = ext_map.get(fmt)
                if not ext:
                    return {"sucesso": False, "erro": f"Formato {fmt} nao suportado para video"}
                
                saida = _nome_saida(path, ext)
                cmd = [
                    ffmpeg, "-y", "-i", path,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    "-c:a", "aac",
                    saida,
                ]

        else:  # gif -> video
            ext_map = {"MP4": ".mp4", "MOV": ".mov", "WEBM": ".webm"}
            if fmt not in ext_map:
                return {"sucesso": False, "erro": "Saida invalida para GIF (use MP4, MOV ou WEBM)"}

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
            callback_log(f"Processando: {os.path.basename(path)}")

        proc = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3600,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )

        if proc.returncode == 0 and saida and os.path.exists(saida):
            return {
                "sucesso": True,
                "saida": saida,
                "tipo_entrada": tipo,
                "formato_saida": fmt,
            }

        return {"sucesso": False, "erro": f"FFmpeg erro ({proc.returncode})"}

    except Exception as e:
        return {"sucesso": False, "erro": str(e)}


def converter_pasta(pasta, formato_saida, loop_gif=True, callback_progresso=None, callback_log=None):
    if not os.path.isdir(pasta):
        return {"sucesso": False, "erro": "Nao e uma pasta"}

    arquivos = []
    for f in os.listdir(pasta):
        p = os.path.join(pasta, f)
        if os.path.isfile(p):
            t = detectar_tipo_arquivo(p)
            if t != "invalido":
                arquivos.append(p)

    if not arquivos:
        return {"sucesso": False, "erro": "Nenhum arquivo conversivel encontrado"}

    total = len(arquivos)
    sucessos = 0
    
    if callback_log:
        callback_log(f"Encontrados {total} arquivos para conversao.")

    for i, path in enumerate(arquivos):
        if callback_progresso:
            callback_progresso(int(i / total * 100), f"Convertendo {i+1}/{total}...")
        
        res = converter_arquivo(path, formato_saida, loop_gif, callback_log=callback_log)
        if res.get("sucesso"):
            sucessos += 1

    if callback_progresso:
        callback_progresso(100, "Concluido")

    return {"sucesso": sucessos > 0, "total": total, "sucessos": sucessos}
