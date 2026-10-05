"""Forçar Full HD (painel Projeto): vídeo maior que Full HD (2K, 4K, 8K, em pé ou deitado) vira uma cópia com o lado
menor em 1080 px, na pasta "Otimizados FullHD" ao lado do original. Para editar leve num quadro 1080 sem perda
visível: taxa alta (NVENC cq 17 / x264 crf 16), som copiado sem recodificar, rotação gravada no quadro e os mesmos
tempos de quadro do original (-fps_mode passthrough: os cortes da timeline caem no mesmo lugar).
Com placa NVIDIA: decodifica e reduz na placa (8K → 1080 sem passar o quadro grande pela RAM).
"""
import os
import subprocess

from Functions.video_cutter import ffmpeg_path, probe, _creationflags, _detectar_hw_encoder, _run_progress

PASTA = "Otimizados FullHD"
LADO = 1080


def destino(path):
    pasta, nome = os.path.split(os.path.abspath(path))
    return os.path.join(pasta, PASTA, os.path.splitext(nome)[0] + "_FullHD.mp4")


def _tamanho_saida(w, h):
    """Lado menor em 1080, proporção mantida, sempre par."""
    k = LADO / min(w, h)
    return max(2, int(round(w * k / 2)) * 2), max(2, int(round(h * k / 2)) * 2)


def converter(path, on_pct=None, stop_event=None):
    """{success, saida, w, h, reuso?} | {success: False, error} | {success: True, pulado: motivo}."""
    try:
        info = probe(path)
    except Exception as e:
        return {"success": False, "error": f"não foi possível analisar: {e}"}
    if not info.get("has_video"):
        return {"success": True, "pulado": "sem vídeo"}
    rot = int(info.get("rotation") or 0) % 360
    w, h = info["width"], info["height"]   # já como aparece (girado)
    if not w or not h:
        return {"success": False, "error": "tamanho desconhecido"}
    if min(w, h) <= LADO:
        return {"success": True, "pulado": "já é Full HD ou menor"}
    tw, th = _tamanho_saida(w, h)
    saida = destino(path)
    if os.path.isfile(saida) and os.path.getmtime(saida) >= os.path.getmtime(path):
        return {"success": True, "saida": saida, "w": tw, "h": th, "reuso": True}
    os.makedirs(os.path.dirname(saida), exist_ok=True)
    tmp = saida + ".part.mp4"
    giro = {90: "transpose=cclock", 270: "transpose=clock", 180: "hflip,vflip"}.get(rot)
    audio = ["-map", "0:a:0?", "-c:a", "copy"] if info.get("acodec") in ("aac", "mp3", "alac", "ac3", "eac3", "opus") \
        else ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "320k"]
    # mesmos tempos de quadro do original (celular é VFR): sem a base de tempo da entrada eles iam para a grade de 30 fps
    comum = ["-map_metadata", "0", "-metadata:s:v:0", "rotate=0", "-fps_mode", "passthrough",
             "-enc_time_base:v", "demux", "-video_track_timescale", "90000"] + audio + \
            ["-movflags", "+faststart", tmp]
    nv = ["-c:v", "h264_nvenc", "-preset", "p6", "-tune", "hq", "-rc", "vbr", "-cq", "17", "-b:v", "0",
          "-spatial-aq", "1", "-temporal-aq", "1", "-bf", "3", "-profile:v", "high", "-pix_fmt", "yuv420p"]
    cpu = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p"]
    cor = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
    tentativas = []
    if _detectar_hw_encoder() == "h264_nvenc" and info.get("vcodec") in ("h264", "hevc", "vp9", "av1"):
        sw, sh = (th, tw) if rot in (90, 270) else (tw, th)   # a placa reduz o quadro antes de girar
        vf = f"scale_cuda={sw}:{sh}:format=nv12:interp_algo=lanczos,hwdownload,format=nv12" + (f",{giro}" if giro else "")
        tentativas.append([ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-noautorotate",
                           "-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-i", path, "-map", "0:v:0",
                           "-vf", vf] + nv + cor + comum)
    tentativas.append([ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", path,
                       "-map", "0:v:0", "-vf", f"scale={tw}:{th}:flags=lanczos"] + cpu + cor + comum)
    err = ""
    for cmd in tentativas:
        rc, err = _run_progress(cmd, info["duration"], on_pct or (lambda p: None), stop_event)
        if stop_event is not None and stop_event.is_set():
            break
        if rc == 0 and os.path.isfile(tmp):
            os.replace(tmp, saida)
            return {"success": True, "saida": saida, "w": tw, "h": th}
    try:
        os.remove(tmp)
    except OSError:
        pass
    if stop_event is not None and stop_event.is_set():
        return {"success": False, "cancelled": True, "error": "cancelado"}
    return {"success": False, "error": (err or "").strip().splitlines()[-1] if err else "falha na conversão"}
