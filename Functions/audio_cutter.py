"""Editor simples de audio com cortes multiponto via ffmpeg."""

import json
import os
import re
import subprocess
import sys
import uuid

from Functions.convertermp3 import FORMATOS_ENTRADA, FORMATOS_SAIDA, _normalizar_saida, ffmpeg_path


def _project_root():
    if hasattr(sys, "_MEIPASS"):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _preview_dir():
    return os.path.join(_project_root(), "frontend", "_audio_preview")


def _creationflags():
    return subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0


def ffprobe_path():
    ffmpeg = ffmpeg_path()
    if ffmpeg and ffmpeg.lower().endswith("ffmpeg.exe"):
        probe = ffmpeg[:-10] + "ffprobe.exe"
        if os.path.exists(probe):
            return probe
    if ffmpeg and os.path.basename(str(ffmpeg)).lower() == "ffmpeg":
        return "ffprobe"
    return "ffprobe"


def _nome_saida(path, formato_saida):
    cfg = FORMATOS_SAIDA[_normalizar_saida(formato_saida)]
    base = os.path.splitext(path)[0]
    destino = f"{base}_cortado{cfg['ext']}"
    if not os.path.exists(destino):
        return destino
    n = 1
    while True:
        destino = f"{base}_cortado_{n}{cfg['ext']}"
        if not os.path.exists(destino):
            return destino
        n += 1


def _duration_from_ffmpeg(path):
    try:
        r = subprocess.run(
            [ffmpeg_path(), "-i", path],
            capture_output=True,
            text=True,
            timeout=20,
            creationflags=_creationflags(),
        )
        text = (r.stderr or "") + (r.stdout or "")
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
        if not m:
            return 0.0
        h, mnt, sec = m.groups()
        return int(h) * 3600 + int(mnt) * 60 + float(sec)
    except Exception:
        return 0.0


def get_duration(path):
    try:
        r = subprocess.run(
            [
                ffprobe_path(),
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=20,
            creationflags=_creationflags(),
        )
        if r.returncode == 0:
            return max(0.0, float((r.stdout or "0").strip()))
    except Exception:
        pass
    return _duration_from_ffmpeg(path)


def gerar_peaks(path, samples=900):
    """Gera uma waveform simplificada lendo PCM mono pelo ffmpeg."""
    try:
        r = subprocess.run(
            [
                ffmpeg_path(),
                "-i",
                path,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "8000",
                "-f",
                "s16le",
                "pipe:1",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=180,
            creationflags=_creationflags(),
        )
        if r.returncode != 0 or not r.stdout:
            return []

        pcm = r.stdout
        total = len(pcm) // 2
        if total <= 0:
            return []
        block = max(1, total // samples)
        peaks = []
        max_i16 = 32768.0
        for i in range(samples):
            start = i * block * 2
            end = min(len(pcm), start + block * 2)
            if end <= start:
                peaks.append(0.0)
                continue
            peak = 0
            for pos in range(start, end, 2):
                val = int.from_bytes(pcm[pos:pos + 2], byteorder="little", signed=True)
                peak = max(peak, abs(val))
            peaks.append(round(min(1.0, peak / max_i16), 4))
        return peaks
    except Exception:
        return []


def preparar_preview(path):
    """Cria um MP3 temporario para o frontend decodificar e desenhar a waveform."""
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo nao encontrado."}

    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_ENTRADA:
        return {"success": False, "error": f"Formato nao suportado: {ext or 'sem extensao'}"}

    preview_dir = _preview_dir()
    os.makedirs(preview_dir, exist_ok=True)
    duration = get_duration(path)
    if duration <= 0:
        return {"success": False, "error": "Nao foi possivel ler a duracao do audio."}

    preview_id = uuid.uuid4().hex
    preview_name = f"preview_{preview_id}.mp3"
    wav_preview_name = f"preview_{preview_id}.wav"
    preview_path = os.path.join(preview_dir, preview_name)
    wav_preview_path = os.path.join(preview_dir, wav_preview_name)
    cmd = [
        ffmpeg_path(),
        "-y",
        "-i",
        path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "22050",
        "-b:a",
        "96k",
        preview_path,
    ]
    wav_cmd = [
        ffmpeg_path(),
        "-y",
        "-i",
        path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "22050",
        "-c:a",
        "pcm_s16le",
        wav_preview_path,
    ]
    try:
        r = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=180,
            creationflags=_creationflags(),
        )
        if r.returncode != 0 or not os.path.exists(preview_path):
            err = (r.stderr or "").strip().splitlines()
            detalhe = err[-1] if err else "falha no ffmpeg"
            return {"success": False, "error": f"Falha ao preparar preview: {detalhe}"}
        subprocess.run(
            wav_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=180,
            creationflags=_creationflags(),
        )
    except FileNotFoundError:
        return {"success": False, "error": "ffmpeg nao encontrado."}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Tempo excedido ao preparar preview."}

    return {
        "success": True,
        "path": path,
        "file_name": os.path.basename(path),
        "duration": duration,
        "peaks": gerar_peaks(path),
        "preview_path": preview_path,
        "preview_url": f"_audio_preview/{preview_name}",
        "preview_fallback_url": f"_audio_preview/{wav_preview_name}" if os.path.exists(wav_preview_path) else "",
    }


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


def _normalizar_faixas_extras(faixas):
    normalizadas = []
    for faixa in faixas or []:
        try:
            p = str(faixa.get("path") or "")
            if not os.path.isfile(p):
                continue
            volume_db = float(faixa.get("volumeDb", 0))
            volume_db = max(-60.0, min(12.0, volume_db))
            offset = max(0.0, float(faixa.get("offset", 0) or 0))
            normalizadas.append({
                "path": p,
                "name": faixa.get("name") or os.path.basename(p),
                "volumeDb": volume_db,
                "offset": offset,
                "cuts": faixa.get("cuts") or [],
                "locked": bool(faixa.get("locked", True)),
            })
        except Exception:
            continue
    return normalizadas


def _filtro_faixa_principal(segmentos):
    return _filtro_faixa("0:a", "main", segmentos)


def _filtro_faixa(input_label, prefix, segmentos):
    filters = []
    labels = []
    for i, (start, end) in enumerate(segmentos):
        label = f"{prefix}{i}"
        filters.append(
            f"[{input_label}]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[{label}]"
        )
        labels.append(f"[{label}]")

    if not labels:
        filters.append(f"[{input_label}]anull,asetpts=PTS-STARTPTS[{prefix}out]")
        return filters, f"[{prefix}out]"

    if len(labels) == 1:
        filters.append(f"{labels[0]}anull[{prefix}out]")
        return filters, f"[{prefix}out]"

    filters.append("".join(labels) + f"concat=n={len(labels)}:v=0:a=1[{prefix}out]")
    return filters, f"[{prefix}out]"


def exportar_audio(path, cortes, formato_saida="mp3", tracks=None, main_offset=0, callback_log=None):
    """Remove trechos da faixa principal e opcionalmente mistura faixas extras."""
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo nao encontrado."}

    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_ENTRADA:
        return {"success": False, "error": f"Formato nao suportado: {ext or 'sem extensao'}"}

    duracao = get_duration(path)
    if duracao <= 0:
        return {"success": False, "error": "Nao foi possivel ler a duracao do audio."}

    cortes_norm = _normalizar_cortes(cortes, duracao)
    segmentos = _segmentos_mantidos(cortes_norm, duracao)
    if not segmentos:
        if cortes_norm:
            return {"success": False, "error": "Os cortes removem o audio inteiro."}
        segmentos = [(0.0, duracao)]

    faixas_extras = _normalizar_faixas_extras(tracks)

    cfg = FORMATOS_SAIDA[_normalizar_saida(formato_saida)]
    saida = _nome_saida(path, formato_saida)

    if callback_log:
        callback_log(f"Arquivo: {os.path.basename(path)}")
        callback_log(f"Cortes: {len(cortes_norm)} | Segmentos mantidos: {len(segmentos)}")
        if faixas_extras:
            callback_log(f"Faixas extras: {len(faixas_extras)}")

    filters, main_label = _filtro_faixa_principal(segmentos)
    main_offset = max(0.0, float(main_offset or 0))
    if main_offset > 0:
        delay_ms = int(round(main_offset * 1000))
        filters.append(f"{main_label}adelay={delay_ms}:all=1[mainshift]")
        main_label = "[mainshift]"
    mix_labels = [main_label]
    input_args = ["-i", path]

    for idx, faixa in enumerate(faixas_extras, start=1):
        input_args.extend(["-i", faixa["path"]])
        label = f"trk{idx}"
        dur_faixa = get_duration(faixa["path"])
        cortes_faixa = _normalizar_cortes(faixa.get("cuts") or [], dur_faixa)
        segmentos_faixa = _segmentos_mantidos(cortes_faixa, dur_faixa) or [(0.0, dur_faixa)]
        track_filters, track_label = _filtro_faixa(f"{idx}:a", f"trkraw{idx}", segmentos_faixa)
        filters.extend(track_filters)
        delay_ms = int(round(faixa.get("offset", 0.0) * 1000))
        delay_filter = f",adelay={delay_ms}:all=1" if delay_ms > 0 else ""
        filters.append(f"{track_label}volume={faixa['volumeDb']:.2f}dB{delay_filter},asetpts=PTS-STARTPTS[{label}]")
        mix_labels.append(f"[{label}]")

    if len(mix_labels) > 1:
        filters.append(
            "".join(mix_labels)
            + f"amix=inputs={len(mix_labels)}:duration=longest:dropout_transition=0,volume={len(mix_labels)}[mixout]"
        )
        mapped_label = "[mixout]"
    else:
        mapped_label = main_label

    cmd = [
        ffmpeg_path(),
        "-y",
        *input_args,
        "-filter_complex",
        ";".join(filters),
        "-map",
        mapped_label,
        "-vn",
        "-c:a",
        cfg["codec"],
        *cfg["args"],
        saida,
    ]

    try:
        if callback_log:
            callback_log("Processando cortes com ffmpeg...")
        r = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=900,
            creationflags=_creationflags(),
        )
        if r.returncode != 0 or not os.path.exists(saida):
            err = (r.stderr or "").strip().splitlines()
            detalhe = err[-1] if err else "falha no ffmpeg"
            return {"success": False, "error": f"Falha ao exportar: {detalhe}"}
    except FileNotFoundError:
        return {"success": False, "error": "ffmpeg nao encontrado."}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Tempo excedido ao exportar audio."}

    if callback_log:
        callback_log(f"Salvo: {os.path.basename(saida)}")

    return {
        "success": True,
        "output_path": saida,
        "output_folder": os.path.dirname(saida) or os.getcwd(),
        "duration": get_duration(saida),
        "cuts": json.dumps(cortes_norm),
    }
