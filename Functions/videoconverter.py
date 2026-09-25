"""
videoconverter.py — converte vídeos entre formatos, vídeo→GIF/MP3 e GIF→vídeo.

Quando os codecs já servem no formato de destino (ex.: MKV H.264 → MP4), só troca o
"envelope" (remux, -c copy): leva segundos e não perde qualidade.
"""
import os

from Functions.midia import probe, rodar_ffmpeg

ENTRADA_VIDEO = {
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv", ".mpeg", ".mpg",
    ".mts", ".m2ts", ".ts", ".3gp", ".mxf",
}

FORMATOS_SAIDA_VIDEO = ["GIF", "MP3", "MP4", "AVI", "MKV", "MOV", "WEBM"]
FORMATOS_SAIDA_GIF_PARA_VIDEO = ["MP4", "MOV", "WEBM"]

EXT = {"MP4": ".mp4", "AVI": ".avi", "MKV": ".mkv", "MOV": ".mov", "WEBM": ".webm", "GIF": ".gif", "MP3": ".mp3"}

# Codecs que cada container aceita sem recodificar
REMUX_OK = {
    "MP4": ({"h264", "hevc", "av1", "mpeg4"}, {"aac", "mp3", "ac3", "eac3", "alac", "opus", ""}),
    "MOV": ({"h264", "hevc", "prores", "mpeg4", "mjpeg"}, {"aac", "mp3", "pcm_s16le", "pcm_s24le", "alac", ""}),
    "MKV": (None, None),  # MKV aceita praticamente tudo
    "WEBM": ({"vp8", "vp9", "av1"}, {"opus", "vorbis", ""}),
    "AVI": ({"h264", "mpeg4", "mjpeg"}, {"mp3", "ac3", "pcm_s16le", ""}),
}

# Recodificação quando precisa (compatível com Premiere / celulares / web)
X264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p"]
VENC = {
    "MP4": X264 + ["-movflags", "+faststart"],
    "MOV": X264 + ["-movflags", "+faststart"],
    "MKV": X264,
    "AVI": X264,
    "WEBM": ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good",
             "-cpu-used", "4", "-pix_fmt", "yuv420p"],
}
AENC = {
    "MP4": ["-c:a", "aac", "-b:a", "192k"],
    "MOV": ["-c:a", "aac", "-b:a", "192k"],
    "MKV": ["-c:a", "aac", "-b:a", "192k"],
    "AVI": ["-c:a", "libmp3lame", "-b:a", "192k"],
    "WEBM": ["-c:a", "libopus", "-b:a", "128k"],
}
# Dimensões pares (exigência do H.264/VP9 em 4:2:0)
PAR = "scale=trunc(iw/2)*2:trunc(ih/2)*2"


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
    n = 1
    while os.path.exists(destino):
        destino = f"{base}_convertido_{n}{ext_saida}"
        n += 1
    return destino


def _pode_remux(info, fmt):
    vcodecs, acodecs = REMUX_OK.get(fmt, (set(), set()))
    if vcodecs is None:
        return bool(info.get("codec_video"))
    return info.get("codec_video") in vcodecs and info.get("codec_audio", "") in acodecs


def converter_arquivo(path, formato_saida, loop_gif=True, callback_progresso=None, callback_log=None,
                      on_progress=None):
    """Converte um arquivo. Retorna {sucesso, saida | erro}."""
    log = callback_log or (lambda m: None)
    tipo = detectar_tipo_arquivo(path)
    if tipo in ("invalido", "pasta"):
        return {"sucesso": False, "erro": "Formato de entrada não suportado"}

    fmt = str(formato_saida or "").strip().upper()
    if fmt not in EXT:
        return {"sucesso": False, "erro": f"Formato {fmt} não suportado"}
    if tipo == "gif" and fmt not in FORMATOS_SAIDA_GIF_PARA_VIDEO:
        return {"sucesso": False, "erro": "GIF só converte para MP4, MOV ou WEBM"}

    info = probe(path)
    saida = _nome_saida(path, EXT[fmt])
    nome = os.path.basename(path)

    if fmt == "GIF":
        filtro = ("fps=15,scale='min(720,iw)':-2:flags=lanczos,split[s0][s1];"
                  "[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a")
        args = ["-i", path, "-filter_complex", filtro, "-loop", "0" if loop_gif else "-1", saida]
        acao = "gerando GIF"
    elif fmt == "MP3":
        if info and not info.get("audio"):
            return {"sucesso": False, "erro": "O vídeo não tem áudio"}
        args = ["-i", path, "-vn", "-c:a", "libmp3lame", "-b:a", "320k", saida]
        acao = "extraindo áudio"
    elif tipo == "gif":
        args = ["-i", path, "-vf", PAR, "-an"] + VENC[fmt] + [saida]
        acao = "convertendo GIF"
    elif info and _pode_remux(info, fmt):
        args = ["-i", path, "-map", "0:v:0", "-map", "0:a?", "-c", "copy"]
        if fmt in ("MP4", "MOV"):
            args += ["-movflags", "+faststart"]
            if info.get("codec_video") == "hevc":
                args += ["-tag:v", "hvc1"]
        args.append(saida)
        acao = "trocando formato sem recodificar"
    else:
        args = ["-i", path, "-map", "0:v:0", "-map", "0:a:0?", "-vf", PAR] + VENC[fmt] + AENC[fmt] + [saida]
        acao = "recodificando"

    log(f"🎬 {nome}: {acao}...")
    ok, erro = rodar_ffmpeg(args, duracao=info.get("duracao", 0), on_progress=on_progress)
    if ok and os.path.exists(saida):
        return {"sucesso": True, "saida": saida, "tipo_entrada": tipo, "formato_saida": fmt}
    if os.path.exists(saida):
        os.remove(saida)
    return {"sucesso": False, "erro": (erro.splitlines() or ["erro do FFmpeg"])[-1]}


def converter_pasta(pasta, formato_saida, loop_gif=True, callback_progresso=None, callback_log=None):
    if not os.path.isdir(pasta):
        return {"sucesso": False, "erro": "Não é uma pasta"}
    arquivos = sorted(os.path.join(pasta, f) for f in os.listdir(pasta)
                      if detectar_tipo_arquivo(os.path.join(pasta, f)) in ("video", "gif"))
    return converter_lista(arquivos, formato_saida, loop_gif, callback_progresso, callback_log)


def converter_lista(arquivos, formato_saida, loop_gif=True, callback_progresso=None, callback_log=None):
    log = callback_log or (lambda m: None)
    total = len(arquivos)
    if not total:
        return {"sucesso": False, "erro": "Nenhum arquivo conversível encontrado"}
    log(f"📥 {total} arquivo(s) para converter para {str(formato_saida).upper()}")
    sucessos = 0
    saidas = []
    for i, path in enumerate(arquivos):
        def on_p(p, i=i):
            if callback_progresso:
                callback_progresso(int((i + p / 100) / total * 100), f"{i + 1}/{total} • {os.path.basename(path)}")
        res = converter_arquivo(path, formato_saida, loop_gif, callback_log=log, on_progress=on_p)
        if res.get("sucesso"):
            sucessos += 1
            saidas.append(res["saida"])
            log(f"✅ {os.path.basename(res['saida'])}")
        else:
            log(f"❌ {os.path.basename(path)}: {res.get('erro')}")
    if callback_progresso:
        callback_progresso(100, "Concluído")
    return {"sucesso": sucessos > 0, "total": total, "sucessos": sucessos, "saidas": saidas}
