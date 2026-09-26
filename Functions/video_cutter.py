"""
video_cutter.py — Motor do Pocket Editor (editor de vídeo do Canivete do Pailer)

- Análise completa via ffprobe (codec, fps, rotação, áudio)
- Pré-visualização: toca o original quando o navegador suporta; senão gera um proxy
  H.264 leve (720p, keyframes frequentes para scrub preciso)
- Miniaturas em paralelo e forma de onda com numpy
- Exportação com precisão de frame: cada trecho mantido vira uma entrada com seek
  (-ss/-t) e tudo é concatenado — rápido (pula os trechos removidos) e sem estourar memória
- Progresso real, cancelamento e aceleração por GPU (NVENC/QSV/AMF) com fallback
"""
import json
import os
import shutil
import subprocess
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

from Functions.audio_cutter import ffmpeg_path, ffprobe_path, _creationflags
from Functions import media_server

FORMATOS_ENTRADA = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".wmv",
    ".m4v", ".ts", ".mts", ".m2ts", ".3gp", ".ogv", ".mpg", ".mpeg",
}

FORMATOS_SAIDA = {
    "mp4":  {"ext": ".mp4",  "vcodec": "h264", "acodec": "aac",     "extra": ["-movflags", "+faststart"]},
    "mov":  {"ext": ".mov",  "vcodec": "h264", "acodec": "aac",     "extra": []},
    "mkv":  {"ext": ".mkv",  "vcodec": "h264", "acodec": "aac",     "extra": []},
    "webm": {"ext": ".webm", "vcodec": "vp9",  "acodec": "libopus", "extra": []},
    "avi":  {"ext": ".avi",  "vcodec": "mpeg4", "acodec": "mp3",    "extra": []},
}

# crf x264 | cq GPU | crf vp9 | bitrate áudio | preset x264
_QUALIDADE = {
    "high":   {"crf": 18, "cq": 20, "vp9": 24, "ab": "256k", "preset": "medium"},
    "medium": {"crf": 21, "cq": 23, "vp9": 30, "ab": "192k", "preset": "fast"},
    "fast":   {"crf": 24, "cq": 26, "vp9": 34, "ab": "160k", "preset": "veryfast"},
    "low":    {"crf": 28, "cq": 30, "vp9": 40, "ab": "128k", "preset": "veryfast"},
}

_RESOLUCOES = {"original": 0, "2160": 2160, "1440": 1440, "1080": 1080, "720": 720, "480": 480}

_NAVEGADOR_VCODECS = {"h264", "vp8", "vp9", "av1"}
_NAVEGADOR_ACODECS = {"aac", "mp3", "opus", "vorbis", "flac"}
_NAVEGADOR_CONTAINERS = {".mp4", ".m4v", ".mov", ".webm"}

_hw_encoder_cache = None
_export_proc = None
_export_lock = threading.Lock()


# ─────────────────────────── utilidades ───────────────────────────

def _work_dir():
    d = os.path.join(tempfile.gettempdir(), "canivete_editor")
    os.makedirs(d, exist_ok=True)
    return d


def limpar_previews():
    """Apaga previews de sessões anteriores (chamado ao abrir um vídeo novo)."""
    d = _work_dir()
    media_server.unregister_prefix(d)
    for nome in os.listdir(d):
        shutil.rmtree(os.path.join(d, nome), ignore_errors=True)


def _fps(txt):
    try:
        num, den = str(txt).split("/")
        return round(float(num) / float(den), 3) if float(den) else 0.0
    except Exception:
        try:
            return float(txt)
        except Exception:
            return 0.0


def _probe_ffmpeg(path):
    """Plano B sem ffprobe: interpreta a saída de 'ffmpeg -i'."""
    import re
    r = subprocess.run([ffmpeg_path(), "-hide_banner", "-i", path], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=30, creationflags=_creationflags())
    txt = r.stderr or ""
    info = {"duration": 0.0, "has_video": False, "width": 0, "height": 0, "fps": 30.0, "vcodec": "",
            "pix_fmt": "", "rotation": 0, "has_audio": False, "acodec": "", "channels": 0, "bitrate": 0,
            "size": os.path.getsize(path)}
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", txt)
    if m:
        info["duration"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    linha_v = next((ln for ln in txt.splitlines() if "Video:" in ln and "attached pic" not in ln), "")
    if linha_v:
        info["has_video"] = True
        m = re.search(r"Video:\s*(\w+)", linha_v)
        info["vcodec"] = m.group(1) if m else ""
        m = re.search(r"\),\s*(\w+)\(|,\s*(yuv\w+|nv12|rgb\w*|gbr\w*|gray\w*)", linha_v)
        if m:
            info["pix_fmt"] = m.group(1) or m.group(2)
        m = re.search(r"\b(\d{2,5})x(\d{2,5})\b", linha_v)
        if m:
            info["width"], info["height"] = int(m.group(1)), int(m.group(2))
        m = re.search(r"([\d.]+)\s*fps", linha_v)
        if m:
            info["fps"] = float(m.group(1))
    ma = re.search(r"Stream #\S+.*?Audio:\s*(\w+)", txt)
    if ma:
        info.update(has_audio=True, acodec=ma.group(1))
    mr = re.search(r"rotation of (-?[\d.]+)", txt)
    if mr and abs(int(float(mr.group(1)))) in (90, 270):
        info["width"], info["height"] = info["height"], info["width"]
    return info


def probe(path):
    """Análise completa do vídeo com um único ffprobe (ou ffmpeg, se o ffprobe faltar)."""
    try:
        return _probe_ffprobe(path)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return _probe_ffmpeg(path)


def _probe_ffprobe(path):
    r = subprocess.run(
        [ffprobe_path(), "-v", "error", "-show_format", "-show_streams", "-of", "json", path],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=30, creationflags=_creationflags(),
    )
    data = json.loads(r.stdout or "{}")
    streams = data.get("streams", [])
    fmt = data.get("format", {})
    v = next((s for s in streams if s.get("codec_type") == "video"
              and not (s.get("disposition") or {}).get("attached_pic")), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)

    dur = 0.0
    for cand in (fmt.get("duration"), (v or {}).get("duration"), (a or {}).get("duration")):
        try:
            if cand and float(cand) > 0:
                dur = float(cand)
                break
        except Exception:
            pass

    rot = 0
    if v:
        try:
            rot = int((v.get("tags") or {}).get("rotate", 0))
        except Exception:
            rot = 0
        for sd in v.get("side_data_list") or []:
            if "rotation" in sd:
                try:
                    rot = int(sd["rotation"])
                except Exception:
                    pass
    w, h = (v or {}).get("width", 0), (v or {}).get("height", 0)
    if abs(rot) in (90, 270):
        w, h = h, w

    fps = _fps((v or {}).get("avg_frame_rate")) or _fps((v or {}).get("r_frame_rate")) or 30.0
    return {
        "duration": dur,
        "has_video": v is not None,
        "width": w,
        "height": h,
        "fps": fps if 1 <= fps <= 240 else 30.0,
        "vcodec": (v or {}).get("codec_name", ""),
        "pix_fmt": (v or {}).get("pix_fmt", ""),
        "rotation": rot,
        "has_audio": a is not None,
        "acodec": (a or {}).get("codec_name", ""),
        "channels": (a or {}).get("channels", 0),
        "bitrate": int(fmt.get("bit_rate") or 0),
        "size": int(fmt.get("size") or 0),
    }


def _navegador_toca(path, info):
    ext = os.path.splitext(path)[1].lower()
    if ext not in _NAVEGADOR_CONTAINERS:
        return False
    if info["vcodec"] not in _NAVEGADOR_VCODECS:
        return False
    if info["vcodec"] == "h264" and info["pix_fmt"] not in ("yuv420p", "yuvj420p"):
        return False  # H.264 10-bit / 4:2:2 não decodifica no navegador
    if info["has_audio"] and info["acodec"] not in _NAVEGADOR_ACODECS:
        return False
    return True


def _run_progress(cmd, total, on_pct, stop_event=None, proc_holder=None):
    """Roda ffmpeg com -progress pipe:1 e chama on_pct(0-100). Retorna (rc, stderr_tail)."""
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace", creationflags=_creationflags(),
    )
    if proc_holder is not None:
        proc_holder(proc)
    err_tail = []

    def _drain():
        for ln in proc.stderr:
            err_tail.append(ln.rstrip())
            if len(err_tail) > 40:
                err_tail.pop(0)

    t = threading.Thread(target=_drain, daemon=True)
    t.start()
    ultimo = -1
    for ln in proc.stdout:
        if stop_event is not None and stop_event.is_set():
            proc.kill()
            break
        if ln.startswith("out_time_us=") or ln.startswith("out_time_ms="):
            try:
                seg = int(ln.split("=", 1)[1]) / 1_000_000
            except ValueError:
                continue
            if total > 0:
                pct = max(0, min(99, int(seg * 100 / total)))
                if pct != ultimo:
                    ultimo = pct
                    on_pct(pct)
    proc.wait()
    t.join(timeout=2)
    return proc.returncode, "\n".join(err_tail)


# ─────────────────────────── pré-visualização ───────────────────────────

def gerar_thumbs(path, duration, outdir, count):
    """Gera miniaturas em paralelo (seek rápido por keyframe). Retorna [{t, url}]."""
    if duration <= 0 or count <= 0:
        return []
    step = duration / count
    tempos = [min(duration - 0.05, step * i + step / 2) for i in range(count)]

    def _um(i_t):
        i, t = i_t
        out = os.path.join(outdir, f"th_{i:04d}.jpg")
        try:
            subprocess.run(
                [ffmpeg_path(), "-y", "-v", "error", "-skip_frame", "nokey", "-ss", f"{t:.3f}", "-i", path,
                 "-frames:v", "1", "-vf", "scale=-2:96", "-q:v", "6", out],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=30, creationflags=_creationflags(),
            )
        except Exception:
            pass
        if not os.path.exists(out):
            # fallback sem skip_frame (alguns codecs não suportam)
            try:
                subprocess.run(
                    [ffmpeg_path(), "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", path,
                     "-frames:v", "1", "-vf", "scale=-2:96", "-q:v", "6", out],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=30, creationflags=_creationflags(),
                )
            except Exception:
                pass
        if os.path.exists(out):
            return {"t": round(t, 3), "url": media_server.register(out)}
        return None

    with ThreadPoolExecutor(max_workers=min(8, (os.cpu_count() or 4))) as ex:
        res = list(ex.map(_um, enumerate(tempos)))
    return [r for r in res if r]


def gerar_peaks(path, duration):
    """Forma de onda (pico por bloco) com numpy. Resolução ~40 pontos/segundo."""
    try:
        import numpy as np
    except Exception:
        return []
    try:
        r = subprocess.run(
            [ffmpeg_path(), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "4000",
             "-f", "s16le", "pipe:1"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=900, creationflags=_creationflags(),
        )
        if not r.stdout:
            return []
        pcm = np.frombuffer(r.stdout, dtype=np.int16)
        n = int(min(20000, max(800, duration * 40)))
        bloco = max(1, len(pcm) // n)
        usable = pcm[: bloco * n] if len(pcm) >= bloco * n else np.pad(pcm, (0, bloco * n - len(pcm)))
        picos = np.abs(usable.reshape(n, bloco).astype(np.int32)).max(axis=1) / 32768.0
        # compressão leve para falas baixas ficarem visíveis
        picos = np.sqrt(np.clip(picos, 0, 1))
        return [round(float(x), 3) for x in picos]
    except Exception:
        return []


def gerar_proxy(path, info, out, on_pct, stop_event=None):
    fps_gop = max(1, int(round(info["fps"] / 2)))  # keyframe a cada ~0,5s → scrub preciso
    cmd = [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", path,
           "-map", "0:v:0", "-map", "0:a:0?",
           "-vf", "scale=-2:'min(720,ih)':flags=fast_bilinear,format=yuv420p",
           "-c:v", "libx264", "-preset", "ultrafast", "-tune", "fastdecode", "-crf", "27",
           "-g", str(fps_gop), "-c:a", "aac", "-b:a", "128k", "-ac", "2",
           "-movflags", "+faststart", out]
    rc, err = _run_progress(cmd, info["duration"], on_pct, stop_event)
    return rc == 0 and os.path.exists(out), err


def preparar(path, emit, stop_event=None):
    """
    Prepara o vídeo para o editor, emitindo eventos progressivos:
      {stage:'info', ...}  → a UI já monta a timeline
      {stage:'video', url} → player pronto
      {stage:'proxy', pct} → progresso do proxy
      {stage:'peaks', peaks}
      {stage:'thumbs', thumbs}
      {stage:'done'} | {stage:'error', error}
    """
    if not os.path.isfile(path):
        emit({"stage": "error", "error": "Arquivo não encontrado."})
        return
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_ENTRADA:
        emit({"stage": "error", "error": f"Formato não suportado: {ext or 'sem extensão'}"})
        return
    try:
        info = probe(path)
    except Exception as e:
        emit({"stage": "error", "error": f"Não foi possível analisar o vídeo: {e}"})
        return
    if not info["has_video"] or info["duration"] <= 0:
        emit({"stage": "error", "error": "Arquivo sem vídeo ou duração inválida."})
        return

    limpar_previews()
    work = os.path.join(_work_dir(), uuid.uuid4().hex[:10])
    os.makedirs(work, exist_ok=True)

    direto = _navegador_toca(path, info)
    emit({"stage": "info", "path": path, "file_name": os.path.basename(path),
          "needs_proxy": not direto, **info})

    # Miniaturas e forma de onda em paralelo com o proxy
    def _thumbs():
        count = int(min(180, max(24, info["duration"] / 2)))
        emit({"stage": "thumbs", "thumbs": gerar_thumbs(path, info["duration"], work, count)})

    def _peaks():
        if info["has_audio"]:
            emit({"stage": "peaks", "peaks": gerar_peaks(path, info["duration"])})

    threads = [threading.Thread(target=_thumbs, daemon=True), threading.Thread(target=_peaks, daemon=True)]
    for t in threads:
        t.start()

    if direto:
        emit({"stage": "video", "url": media_server.register(path), "proxy": False})
    else:
        proxy = os.path.join(work, "proxy.mp4")
        ok, err = gerar_proxy(path, info, proxy, lambda p: emit({"stage": "proxy", "pct": p}), stop_event)
        if stop_event is not None and stop_event.is_set():
            return
        if ok:
            emit({"stage": "video", "url": media_server.register(proxy), "proxy": True})
        else:
            emit({"stage": "error", "error": "Falha ao gerar pré-visualização: " + (err.splitlines()[-1] if err else "?")})
            return

    for t in threads:
        t.join()
    emit({"stage": "done"})


# ─────────────────────────── exportação ───────────────────────────

def _detectar_hw_encoder():
    """Testa encoders de GPU uma vez. Retorna 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | None."""
    global _hw_encoder_cache
    if _hw_encoder_cache is not None:
        return _hw_encoder_cache or None
    _hw_encoder_cache = ""
    for enc in ("h264_nvenc", "h264_qsv", "h264_amf"):
        try:
            r = subprocess.run(
                [ffmpeg_path(), "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.2",
                 "-c:v", enc, "-f", "null", "-"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=15, creationflags=_creationflags(),
            )
            if r.returncode == 0:
                _hw_encoder_cache = enc
                break
        except Exception:
            pass
    return _hw_encoder_cache or None


def _args_video(cfg, q, usar_gpu):
    if cfg["vcodec"] == "vp9":
        return ["-c:v", "libvpx-vp9", "-crf", str(q["vp9"]), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"]
    if cfg["vcodec"] == "mpeg4":
        return ["-c:v", "mpeg4", "-q:v", "3"]
    enc = _detectar_hw_encoder() if usar_gpu else None
    if enc == "h264_nvenc":
        return ["-c:v", enc, "-preset", "p5", "-rc", "vbr", "-cq", str(q["cq"]), "-b:v", "0", "-pix_fmt", "yuv420p"]
    if enc == "h264_qsv":
        return ["-c:v", enc, "-global_quality", str(q["cq"]), "-pix_fmt", "nv12"]
    if enc == "h264_amf":
        return ["-c:v", enc, "-rc", "cqp", "-qp_i", str(q["cq"]), "-qp_p", str(q["cq"] + 2), "-pix_fmt", "yuv420p"]
    return ["-c:v", "libx264", "-crf", str(q["crf"]), "-preset", q["preset"], "-pix_fmt", "yuv420p"]


def _nome_saida(path, ext, pasta=None):
    base = os.path.splitext(os.path.basename(path))[0]
    pasta = pasta or os.path.dirname(path)
    destino = os.path.join(pasta, f"{base}_editado{ext}")
    n = 1
    while os.path.exists(destino):
        destino = os.path.join(pasta, f"{base}_editado_{n}{ext}")
        n += 1
    return destino


def _normalizar_segmentos(segmentos, duracao):
    """
    Peças da timeline, na ordem: (a, b, ganho_db) = trecho do original; ("gap", d) = espaço vazio
    (preto/silêncio). A ordem é a da timeline (clipes podem ser reordenados); só junta trechos
    colados com o mesmo ganho e vazios seguidos.
    """
    pecas = []
    for s in segmentos or []:
        try:
            if s.get("gap") is not None:
                d = float(s["gap"])
                if d >= 0.02:
                    if pecas and pecas[-1][0] == "gap":
                        pecas[-1][1] += d
                    else:
                        pecas.append(["gap", d])
                continue
            a = max(0.0, float(s.get("start", 0)))
            b = min(float(s.get("end", 0)), duracao)
            g = max(-60.0, min(30.0, float(s.get("gain") or 0)))
        except Exception:
            continue
        if b - a < 0.04:
            continue
        if pecas and pecas[-1][0] != "gap" and abs(a - pecas[-1][1]) <= 0.001 and pecas[-1][2] == g:
            pecas[-1][1] = b
        else:
            pecas.append([a, b, g])
    # espaço vazio no fim não entra no vídeo
    while pecas and pecas[-1][0] == "gap":
        pecas.pop()
    return [tuple(p) for p in pecas]


def _dur_peca(p):
    return p[1] if p[0] == "gap" else p[1] - p[0]


def cancelar_exportacao():
    with _export_lock:
        if _export_proc is not None:
            try:
                _export_proc.kill()
            except Exception:
                pass


def exportar_video(path, segmentos, formato_saida="mp4", qualidade="medium", resolucao="original",
                   usar_gpu=True, pasta_saida=None, on_progress=None, stop_event=None, sem_audio=False):
    """
    Exporta apenas os `segmentos` mantidos ([{start, end}] em segundos do original).
    on_progress(pct, mensagem)
    """
    global _export_proc
    prog = on_progress or (lambda p, m: None)
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo não encontrado."}

    formato_saida = str(formato_saida).lower()
    cfg = FORMATOS_SAIDA.get(formato_saida, FORMATOS_SAIDA["mp4"])
    q = _QUALIDADE.get(str(qualidade).lower(), _QUALIDADE["medium"])
    alvo_h = _RESOLUCOES.get(str(resolucao), 0)

    info = probe(path)
    pecas = _normalizar_segmentos(segmentos, info["duration"])
    segs = [p for p in pecas if p[0] != "gap"]
    tem_ganho = any(p[2] for p in segs)
    if not segs:
        return {"success": False, "error": "Nada para exportar: todos os trechos foram removidos."}
    total = sum(_dur_peca(p) for p in pecas)
    saida = _nome_saida(path, cfg["ext"], pasta_saida)
    has_audio = info["has_audio"] and not sem_audio

    tem_vazio = len(segs) != len(pecas)
    em_ordem = all(segs[k][0] >= segs[k - 1][1] - 0.001 for k in range(1, len(segs)))
    # select/aselect só serve para trechos em ordem crescente, sem vazios e sem ganho; o resto vai por concat
    usar_inputs = len(pecas) <= 150 or not em_ordem or tem_vazio or (tem_ganho and has_audio)
    cmd = [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1"]
    filtros = []
    if usar_inputs:
        # Uma entrada por trecho com seek preciso → só decodifica o que fica no vídeo.
        # Espaços vazios viram quadro preto + silêncio. Tudo é padronizado antes do concat.
        W, H = info["width"] or 1920, info["height"] or 1080
        W, H = W + (W % 2), H + (H % 2)
        fps = f'{info["fps"]:.3f}'
        entrada = 0
        pares = ""
        for k, p in enumerate(pecas):
            if p[0] == "gap":
                cmd += ["-f", "lavfi", "-t", f"{p[1]:.3f}", "-i", f"color=c=black:s={W}x{H}:r={fps}"]
                vi = entrada; entrada += 1
                if has_audio:
                    cmd += ["-f", "lavfi", "-t", f"{p[1]:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
                    ai = entrada; entrada += 1
            else:
                a, b = p[0], p[1]
                cmd += ["-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", path]
                vi = ai = entrada; entrada += 1
            filtros.append(f"[{vi}:v:0]scale={W}:{H}:force_original_aspect_ratio=decrease,"
                           f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},format=yuv420p[v{k}]")
            pares += f"[v{k}]"
            if has_audio:
                vol = f",volume={p[2]:.2f}dB" if p[0] != "gap" and p[2] else ""
                filtros.append(f"[{ai}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo{vol}[a{k}]")
                pares += f"[a{k}]"
        filtros.append(f"{pares}concat=n={len(pecas)}:v=1:a={1 if has_audio else 0}[vc]" + ("[ac]" if has_audio else ""))
    else:
        # Muitos trechos: um único select (baixa memória)
        cond = "+".join(f"between(t,{p[0]:.3f},{p[1]:.3f})" for p in segs)
        cmd += ["-i", path]
        filtros.append(f"[0:v:0]select='{cond}',setpts=N/FRAME_RATE/TB[vc]")
        if has_audio:
            filtros.append(f"[0:a:0]aselect='{cond}',asetpts=N/SR/TB[ac]")

    vf = "[vc]"
    if alvo_h and info["height"] > alvo_h:
        filtros.append(f"[vc]scale=-2:{alvo_h}:flags=lanczos[vs]")
        vf = "[vs]"

    script = os.path.join(_work_dir(), f"filtro_{uuid.uuid4().hex[:8]}.txt")
    with open(script, "w", encoding="utf-8") as f:
        f.write(";\n".join(filtros))

    base_cmd = cmd + ["-filter_complex_script", script, "-map", vf]
    if has_audio:
        base_cmd += ["-map", "[ac]", "-c:a", cfg["acodec"], "-b:a", q["ab"]]

    def _tentar(gpu):
        global _export_proc
        full = base_cmd + _args_video(cfg, q, gpu) + cfg["extra"] + [saida]

        def _hold(p):
            global _export_proc
            with _export_lock:
                _export_proc = p

        rc, err = _run_progress(full, total, lambda p: prog(p, f"Exportando... {p}%"), stop_event, _hold)
        with _export_lock:
            _export_proc = None
        return rc, err

    try:
        enc = _detectar_hw_encoder() if (usar_gpu and cfg["vcodec"] == "h264") else None
        prog(0, "Iniciando exportação" + (f" (GPU: {enc.split('_')[1].upper()})" if enc else "") + "...")
        rc, err = _tentar(usar_gpu)
        if stop_event is not None and stop_event.is_set():
            _apagar(saida)
            return {"success": False, "cancelled": True, "error": "Exportação cancelada."}
        if rc != 0 and enc:
            prog(0, "GPU falhou, exportando pela CPU...")
            _apagar(saida)
            rc, err = _tentar(False)
        if rc != 0 or not os.path.exists(saida):
            _apagar(saida)
            linhas = [l for l in (err or "").splitlines() if l.strip()]
            return {"success": False, "error": "Falha ao exportar: " + (linhas[-1] if linhas else f"código {rc}")}
    except FileNotFoundError:
        return {"success": False, "error": "ffmpeg não encontrado."}
    finally:
        try:
            os.remove(script)
        except Exception:
            pass

    prog(100, "Concluído!")
    return {
        "success": True,
        "output_path": saida,
        "output_folder": os.path.dirname(saida),
        "duration": round(total, 2),
        "size": os.path.getsize(saida),
    }


def _apagar(p):
    try:
        if os.path.exists(p):
            os.remove(p)
    except Exception:
        pass
