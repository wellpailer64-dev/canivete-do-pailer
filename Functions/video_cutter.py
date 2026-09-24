"""Editor de vídeo com cortes multiponto via ffmpeg."""

import json
import os
import subprocess
import sys
import uuid

from Functions.audio_cutter import ffmpeg_path, ffprobe_path, _creationflags, get_duration

FORMATOS_ENTRADA = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".wmv",
    ".m4v", ".ts", ".mts", ".m2ts", ".3gp", ".ogv",
}

FORMATOS_SAIDA = {
    "mp4":  {"ext": ".mp4",  "vcodec": "libx264",    "acodec": "aac",     "extra": ["-movflags", "+faststart"]},
    "mov":  {"ext": ".mov",  "vcodec": "libx264",    "acodec": "aac",     "extra": []},
    "mkv":  {"ext": ".mkv",  "vcodec": "libx264",    "acodec": "aac",     "extra": []},
    "webm": {"ext": ".webm", "vcodec": "libvpx-vp9", "acodec": "libopus", "extra": []},
    "avi":  {"ext": ".avi",  "vcodec": "mpeg4",      "acodec": "mp3",     "extra": []},
}

_QUALIDADE = {
    "high":   {"crf": "20", "preset": "slow",     "vp9_crf": "20", "ab": "256k"},
    "medium": {"crf": "23", "preset": "medium",   "vp9_crf": "30", "ab": "192k"},
    "fast":   {"crf": "26", "preset": "fast",     "vp9_crf": "35", "ab": "160k"},
    "low":    {"crf": "28", "preset": "veryfast", "vp9_crf": "40", "ab": "128k"},
}


def _project_root():
    if hasattr(sys, "_MEIPASS"):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _preview_dir():
    return os.path.join(_project_root(), "frontend", "_video_preview")


def get_video_info(path):
    """Returns dict with width, height, fps, has_audio, codec."""
    info = {"width": 0, "height": 0, "fps": 25.0, "codec": "", "has_audio": False}
    try:
        r = subprocess.run(
            [
                ffprobe_path(), "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height,r_frame_rate,codec_name",
                "-of", "default=noprint_wrappers=1",
                path,
            ],
            capture_output=True, text=True, timeout=20,
            creationflags=_creationflags(),
        )
        for line in r.stdout.splitlines():
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k == "width":
                info["width"] = int(v or 0)
            elif k == "height":
                info["height"] = int(v or 0)
            elif k == "r_frame_rate":
                try:
                    num, den = v.split("/")
                    if float(den) > 0:
                        info["fps"] = round(float(num) / float(den), 3)
                except Exception:
                    pass
            elif k == "codec_name":
                info["codec"] = v

        ra = subprocess.run(
            [
                ffprobe_path(), "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True, text=True, timeout=10,
            creationflags=_creationflags(),
        )
        info["has_audio"] = bool(ra.stdout.strip())
    except Exception:
        pass
    return info


def gerar_thumbnails(path, duration, uid, count=40):
    """Generates N thumbnail JPEGs via a single ffmpeg pass. Returns (urls, interval)."""
    preview_dir = _preview_dir()
    os.makedirs(preview_dir, exist_ok=True)

    if duration <= 0 or count <= 0:
        return [], 0.0

    interval = duration / count
    fps_str = f"1/{interval:.4f}"
    out_pattern = os.path.join(preview_dir, f"thumb_{uid}_%04d.jpg")

    try:
        subprocess.run(
            [
                ffmpeg_path(), "-y",
                "-i", path,
                "-vf", f"fps={fps_str},scale=120:-1",
                "-q:v", "5",
                "-frames:v", str(count + 5),
                out_pattern,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=180,
            creationflags=_creationflags(),
        )
    except Exception:
        pass

    thumbs = []
    for i in range(1, count + 10):
        fname = f"thumb_{uid}_{i:04d}.jpg"
        if os.path.exists(os.path.join(preview_dir, fname)):
            thumbs.append(f"_video_preview/{fname}")
        else:
            break

    return thumbs, interval


def preparar_preview(path):
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo não encontrado."}

    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_ENTRADA:
        return {"success": False, "error": f"Formato não suportado: {ext or 'sem extensão'}"}

    duration = get_duration(path)
    if duration <= 0:
        return {"success": False, "error": "Não foi possível ler a duração do vídeo."}

    info = get_video_info(path)
    uid = uuid.uuid4().hex

    thumb_count = min(60, max(20, int(duration / 2)))
    thumbs, interval = gerar_thumbnails(path, duration, uid, count=thumb_count)

    file_url = "file:///" + path.replace("\\", "/")

    return {
        "success": True,
        "path": path,
        "file_name": os.path.basename(path),
        "file_url": file_url,
        "duration": duration,
        "width": info["width"],
        "height": info["height"],
        "fps": info["fps"],
        "has_audio": info["has_audio"],
        "thumbs": thumbs,
        "thumb_interval": interval,
        "preview_uid": uid,
    }


def _nome_saida(path, formato_saida):
    cfg = FORMATOS_SAIDA[formato_saida]
    base = os.path.splitext(path)[0]
    destino = f"{base}_editado{cfg['ext']}"
    if not os.path.exists(destino):
        return destino
    n = 1
    while True:
        destino = f"{base}_editado_{n}{cfg['ext']}"
        if not os.path.exists(destino):
            return destino
        n += 1


def _normalizar_cortes(cortes, duracao):
    sane = []
    for item in cortes or []:
        try:
            start = max(0.0, float(item.get("start", 0)))
            end = min(float(item.get("end", 0)), duracao)
        except Exception:
            continue
        if end - start >= 0.05:
            sane.append((start, end))
    sane.sort(key=lambda x: x[0])
    merged = []
    for start, end in sane:
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [(a, b) for a, b in merged]


def _segmentos_mantidos(cortes, duracao):
    segmentos = []
    cursor = 0.0
    for start, end in cortes:
        if start > cursor:
            segmentos.append((cursor, start))
        cursor = max(cursor, end)
    if cursor < duracao:
        segmentos.append((cursor, duracao))
    return [(a, b) for a, b in segmentos if b - a >= 0.05]


def exportar_video(path, cortes, formato_saida="mp4", qualidade="medium", callback_log=None):
    """Remove trechos do vídeo e exporta o resultado."""
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo não encontrado."}

    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_ENTRADA:
        return {"success": False, "error": f"Formato não suportado: {ext or 'sem extensão'}"}

    formato_saida = str(formato_saida).lower()
    if formato_saida not in FORMATOS_SAIDA:
        formato_saida = "mp4"

    qualidade = str(qualidade).lower()
    if qualidade not in _QUALIDADE:
        qualidade = "medium"

    duracao = get_duration(path)
    if duracao <= 0:
        return {"success": False, "error": "Não foi possível ler a duração do vídeo."}

    info = get_video_info(path)
    has_audio = info["has_audio"]

    cortes_norm = _normalizar_cortes(cortes, duracao)
    segmentos = _segmentos_mantidos(cortes_norm, duracao)
    if not segmentos:
        if cortes_norm:
            return {"success": False, "error": "Os cortes removem o vídeo inteiro."}
        segmentos = [(0.0, duracao)]

    cfg = FORMATOS_SAIDA[formato_saida]
    q = _QUALIDADE[qualidade]
    saida = _nome_saida(path, formato_saida)

    if callback_log:
        callback_log(f"Arquivo: {os.path.basename(path)}")
        callback_log(f"Cortes: {len(cortes_norm)} | Segmentos: {len(segmentos)}")
        callback_log(f"Formato: {formato_saida.upper()} | Qualidade: {qualidade}")

    n = len(segmentos)
    filters = []
    v_labels = []
    a_labels = []

    for i, (start, end) in enumerate(segmentos):
        vl = f"v{i}"
        filters.append(f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS[{vl}]")
        v_labels.append(f"[{vl}]")
        if has_audio:
            al = f"a{i}"
            filters.append(f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[{al}]")
            a_labels.append(f"[{al}]")

    if n == 1:
        filters.append(f"{v_labels[0]}null[vout]")
        if has_audio:
            filters.append(f"{a_labels[0]}anull[aout]")
    else:
        if has_audio:
            concat_in = "".join(v_labels[i] + a_labels[i] for i in range(n))
            filters.append(f"{concat_in}concat=n={n}:v=1:a=1[vout][aout]")
        else:
            concat_in = "".join(v_labels)
            filters.append(f"{concat_in}concat=n={n}:v=1:a=0[vout]")

    vcodec = cfg["vcodec"]
    if vcodec == "libx264":
        v_enc_args = ["-c:v", "libx264", "-crf", q["crf"], "-preset", q["preset"]]
    elif vcodec == "libvpx-vp9":
        v_enc_args = ["-c:v", "libvpx-vp9", "-crf", q["vp9_crf"], "-b:v", "0"]
    else:
        v_enc_args = ["-c:v", vcodec]

    a_enc_args = ["-c:a", cfg["acodec"], "-b:a", q["ab"]] if has_audio else []

    cmd = [
        ffmpeg_path(), "-y",
        "-i", path,
        "-filter_complex", ";".join(filters),
        "-map", "[vout]",
    ]
    if has_audio:
        cmd += ["-map", "[aout]"]
    cmd += v_enc_args + a_enc_args + cfg["extra"] + [saida]

    try:
        if callback_log:
            callback_log("Processando com ffmpeg...")
        r = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=3600,
            creationflags=_creationflags(),
        )
        if r.returncode != 0 or not os.path.exists(saida):
            err = (r.stderr or "").strip().splitlines()
            detalhe = err[-1] if err else "falha no ffmpeg"
            return {"success": False, "error": f"Falha ao exportar: {detalhe}"}
    except FileNotFoundError:
        return {"success": False, "error": "ffmpeg não encontrado."}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Tempo excedido ao exportar vídeo."}

    if callback_log:
        callback_log(f"Salvo: {os.path.basename(saida)}")

    return {
        "success": True,
        "output_path": saida,
        "output_folder": os.path.dirname(saida) or os.getcwd(),
        "duration": get_duration(saida),
    }
