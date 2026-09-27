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
    # só áudio: o editor também corta/ajusta áudio e exporta em MP3/WAV
    ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif",
}
# áudio que o player do app toca direto (o resto ganha uma prévia .m4a)
_NAVEGADOR_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"}

FORMATOS_SAIDA = {
    "mp4":  {"ext": ".mp4",  "vcodec": "h264", "acodec": "aac",     "extra": ["-movflags", "+faststart"]},
    "mov":  {"ext": ".mov",  "vcodec": "h264", "acodec": "aac",     "extra": []},
    "mkv":  {"ext": ".mkv",  "vcodec": "h264", "acodec": "aac",     "extra": []},
    "webm": {"ext": ".webm", "vcodec": "vp9",  "acodec": "libopus", "extra": []},
    "avi":  {"ext": ".avi",  "vcodec": "mpeg4", "acodec": "mp3",    "extra": []},
    # só áudio
    "mp3":  {"ext": ".mp3",  "vcodec": None, "acodec": "libmp3lame", "extra": [], "audio_only": True},
    "wav":  {"ext": ".wav",  "vcodec": None, "acodec": "pcm_s16le",  "extra": [], "audio_only": True},
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


def _preparar_audio(path, info, work, emit, stop_event):
    """Arquivo só de áudio: timeline com forma de onda, monitor preto; quadro padrão 1280x720."""
    info = {**info, "width": 1280, "height": 720, "fps": 30.0, "audio_only": True}
    ext = os.path.splitext(path)[1].lower()
    direto = ext in _NAVEGADOR_AUDIO
    emit({"stage": "info", "path": path, "file_name": os.path.basename(path), "needs_proxy": not direto, **info})
    t = threading.Thread(target=lambda: emit({"stage": "peaks", "peaks": gerar_peaks(path, info["duration"])}), daemon=True)
    t.start()
    if direto:
        emit({"stage": "video", "url": media_server.register(path), "proxy": False})
    else:
        prev = os.path.join(work, "previa.m4a")
        cmd = [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", path,
               "-vn", "-c:a", "aac", "-b:a", "160k", "-ac", "2", prev]
        rc, err = _run_progress(cmd, info["duration"], lambda p: emit({"stage": "proxy", "pct": p}), stop_event)
        if stop_event is not None and stop_event.is_set():
            return
        if rc != 0 or not os.path.exists(prev):
            emit({"stage": "error", "error": "Falha ao preparar o áudio: " + (err.splitlines()[-1] if err else "?")})
            return
        emit({"stage": "video", "url": media_server.register(prev), "proxy": True})
    t.join()
    emit({"stage": "done"})


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
    if info["duration"] <= 0 or not (info["has_video"] or info["has_audio"]):
        emit({"stage": "error", "error": "Arquivo sem vídeo/áudio ou com duração inválida."})
        return

    limpar_previews()
    work = os.path.join(_work_dir(), uuid.uuid4().hex[:10])
    os.makedirs(work, exist_ok=True)

    if not info["has_video"]:
        _preparar_audio(path, info, work, emit, stop_event)
        return

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


# Quadros-chave: mesma conversão das propriedades fixas (escala e opacidade viram fração)
_KF_CONV = {
    "sc": lambda v: max(0.5, min(2000.0, v)) / 100.0,
    "x": lambda v: v,
    "y": lambda v: v,
    "rot": lambda v: v,
    "op": lambda v: max(0.0, min(100.0, v)) / 100.0,
}


def _normalizar_kf(kf):
    """{prop: [[t, v, interp], ...]} (t = segundos desde o início da camada) → listas ordenadas."""
    out = {}
    for k, conv in _KF_CONV.items():
        pts = []
        for q in (kf or {}).get(k) or []:
            try:
                pts.append((float(q[0]), conv(float(q[1])), str(q[2]) if len(q) > 2 else "lin"))
            except Exception:
                continue
        if pts:
            out[k] = sorted(pts)
    return out


def _expr_kf(pts, tv):
    """Expressão do ffmpeg que interpola os quadros-chave no tempo `tv` (igual à prévia do editor):
    antes do 1º e depois do último o valor fica parado; 'ease' = smoothstep, 'hold' = degrau."""
    f = lambda v: f"{v:.6f}"
    expr = f(pts[-1][1])
    for j in range(len(pts) - 2, -1, -1):
        (ta, va, ia), (tb, vb, _) = pts[j], pts[j + 1]
        d = tb - ta
        if d < 1e-6 or ia == "hold" or abs(vb - va) < 1e-9:
            seg = f(va)
        else:
            u = f"clip(({tv}-{ta:.4f})/{d:.4f},0,1)"
            curva = f"{u}*{u}*(3-2*{u})" if ia == "ease" else u
            seg = f"({f(va)}+{f(vb - va)}*{curva})"
        expr = f"if(lt({tv},{tb:.4f}),{seg},{expr})"
    return f"if(lt({tv},{pts[0][0]:.4f}),{f(pts[0][1])},{expr})"


def _num(v, lo, hi, padrao=0.0):
    try:
        return max(lo, min(hi, float(v)))
    except Exception:
        return padrao


def _filtros_fx(fx, mw, mh):
    """Efeitos do clipe (mesma ordem e mesmas contas da prévia do editor, em frontend/js/editor-fx.js).
    Rodam no tamanho original da mídia, antes de escala/posição/rotação/opacidade (como no Premiere)."""
    out = []
    for f in fx or []:
        t, v = str(f.get("t")), f.get("v") or {}
        if t == "blur":
            # desfoque em % do lado menor da mídia: 100% = sigma de 5% do lado menor
            sigma = _num(v.get("amt"), 0, 100) * max(2, min(mw, mh)) / 2000.0
            if sigma >= 0.05:
                out.append(f"gblur=sigma={min(sigma, 1000):.3f}:steps=3")
        elif t == "bc":
            b = 1 + _num(v.get("br"), -100, 100) / 100.0
            c = 1 + _num(v.get("ct"), -100, 100) / 100.0
            if abs(b - 1) > 1e-4 or abs(c - 1) > 1e-4:
                # igual ao filtro brightness()+contrast() do navegador
                e = f"clip((clip(val*{b:.4f},0,255)-127.5)*{c:.4f}+127.5,0,255)"
                out.append(f"lutrgb=r='{e}':g='{e}':b='{e}'")
        elif t == "crop":
            l, tp, r, bt = (_num(v.get(k), 0, 100) / 100.0 for k in ("l", "t", "r", "b"))
            # a área cortada fica transparente (a camada de baixo aparece), sem mudar o tamanho
            caixa = "drawbox=x={x}:y={y}:w={w}:h={h}:color=black@0:t=fill:replace=1"
            if l > 0:
                out.append(caixa.format(x=0, y=0, w=f"'max(1,trunc(iw*{l:.5f}))'", h="ih"))
            if r > 0:
                out.append(caixa.format(x=f"'iw-max(1,trunc(iw*{r:.5f}))'", y=0, w=f"'max(1,trunc(iw*{r:.5f}))'", h="ih"))
            if tp > 0:
                out.append(caixa.format(x=0, y=0, w="iw", h=f"'max(1,trunc(ih*{tp:.5f}))'"))
            if bt > 0:
                out.append(caixa.format(x=0, y=f"'ih-max(1,trunc(ih*{bt:.5f}))'", w="iw", h=f"'max(1,trunc(ih*{bt:.5f}))'"))
    return out


def _normalizar_camadas(camadas, path_video):
    """Camadas por cima da base, de baixo para cima: imagens e clipes de vídeo transformados."""
    out = []
    for c in camadas or []:
        try:
            tipo = c.get("tipo")
            st = max(0.0, float(c["st"]))
            s, e = float(c.get("s", 0)), float(c.get("e", 0))
            if e - s < 0.04:
                continue
            item = {
                "tipo": "imagem" if tipo == "imagem" else "video",
                "path": c.get("path") if tipo == "imagem" else path_video,
                "st": st, "s": max(0.0, s), "dur": e - s,
                "sc": max(0.5, min(2000.0, float(c.get("sc", 100)))) / 100.0,
                "x": float(c.get("x", 0)), "y": float(c.get("y", 0)),
                "rot": float(c.get("rot", 0)) % 360,
                "op": max(0.0, min(100.0, float(c.get("op", 100)))) / 100.0,
                "kf": _normalizar_kf(c.get("kf")),
                "fx": [f for f in (c.get("fx") or []) if isinstance(f, dict)],
                "mw": _num(c.get("mw"), 2, 20000, 1920), "mh": _num(c.get("mh"), 2, 20000, 1080),
            }
        except Exception:
            continue
        if item["tipo"] == "imagem" and not (item["path"] and os.path.isfile(item["path"])):
            continue
        out.append(item)
    return out


_opcao_script = None


def _opcao_filtro_script():
    """ffmpeg 7+ lê o grafo de arquivo com '-/filter_complex'; o '-filter_complex_script'
    antigo foi removido nas versões novas. Detecta uma vez qual o ffmpeg instalado aceita."""
    global _opcao_script
    if _opcao_script is None:
        try:
            r = subprocess.run([ffmpeg_path(), "-hide_banner", "-f", "lavfi", "-i", "nullsrc=d=0.04",
                                "-/filter_complex", os.devnull, "-f", "null", "-"],
                               capture_output=True, text=True, timeout=15, creationflags=_creationflags())
            antigo = "unrecognized option" in (r.stderr or "").lower()
        except Exception:
            antigo = False
        _opcao_script = "-filter_complex_script" if antigo else "-/filter_complex"
    return _opcao_script


def exportar_video(path, segmentos, formato_saida="mp4", qualidade="medium", resolucao="original",
                   usar_gpu=True, pasta_saida=None, on_progress=None, stop_event=None, sem_audio=False,
                   camadas=None, audio_segmentos=None, duracao=None):
    """
    Exporta a timeline do editor.
    segmentos       = base de vídeo em ordem ([{start, end, gain}] do original ou {gap: s})
    audio_segmentos = trilha de áudio (mesmo formato); se None, usa os segmentos da base
    camadas         = imagens/clipes transformados por cima da base (de baixo para cima)
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
    audio_only = bool(cfg.get("audio_only")) or not info["has_video"]
    if audio_only and not info["has_audio"]:
        return {"success": False, "error": "Este arquivo não tem som para exportar em áudio."}
    if audio_only and not cfg.get("audio_only"):
        cfg = FORMATOS_SAIDA["mp3"]   # fonte só de áudio sempre sai como áudio
    if audio_only:
        camadas = None
        sem_audio = False
    W, H = info["width"] or 1920, info["height"] or 1080
    W, H = W + (W % 2), H + (H % 2)
    fps = f'{info["fps"]:.3f}'

    pecas = _normalizar_segmentos(segmentos, info["duration"])
    pecas_a = pecas if audio_segmentos is None else _normalizar_segmentos(audio_segmentos, info["duration"])
    lay = _normalizar_camadas(camadas, path)
    segs = [p for p in pecas if p[0] != "gap"]
    if not segs and not lay and not any(p[0] != "gap" for p in pecas_a):
        return {"success": False, "error": "Nada para exportar: todos os trechos foram removidos."}

    # duração final: a maior entre base, áudio, camadas e a informada pela timeline
    total = max([sum(_dur_peca(p) for p in pecas), sum(_dur_peca(p) for p in pecas_a)]
                + [c["st"] + c["dur"] for c in lay] + [float(duracao or 0)])
    if total < 0.04:
        return {"success": False, "error": "Nada para exportar."}

    def _completar(lista):
        falta = total - sum(_dur_peca(p) for p in lista)
        return list(lista) + ([("gap", falta)] if falta > 0.02 else [])

    simples = not lay and audio_segmentos is None
    if not simples:
        pecas, pecas_a = _completar(pecas), _completar(pecas_a)
    saida = _nome_saida(path, cfg["ext"], pasta_saida)
    has_audio = info["has_audio"] and not sem_audio
    audio_junto = pecas_a == pecas   # mesmas peças: o áudio sai das mesmas entradas do vídeo

    tem_ganho = any(p[2] for p in segs)
    tem_vazio = len(segs) != len(pecas)
    em_ordem = all(segs[k][0] >= segs[k - 1][1] - 0.001 for k in range(1, len(segs)))
    # select/aselect só serve para o caso simples: em ordem, sem vazios, sem ganho e sem camadas
    usar_inputs = not simples or len(pecas) <= 150 or not em_ordem or tem_vazio or (tem_ganho and has_audio)
    if audio_only:
        # só o áudio: nenhuma cadeia de vídeo no grafo
        usar_inputs, audio_junto = True, False
        pecas = pecas_a = _completar(pecas_a)
    cmd = [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1"]
    filtros = []
    entrada = 0

    def _entrada_peca(p, video):
        """Adiciona a entrada de uma peça (trecho ou vazio) e devolve o índice."""
        nonlocal entrada
        if p[0] == "gap":
            src = f"color=c=black:s={W}x{H}:r={fps}" if video else "anullsrc=r=48000:cl=stereo"
            cmd.extend(["-f", "lavfi", "-t", f"{p[1]:.3f}", "-i", src])
        else:
            cmd.extend(["-ss", f"{p[0]:.3f}", "-t", f"{p[1] - p[0]:.3f}", "-i", path])
        entrada += 1
        return entrada - 1

    def _filtro_audio(idx, p, rotulo):
        vol = f",volume={p[2]:.2f}dB" if p[0] != "gap" and p[2] else ""
        filtros.append(f"[{idx}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo{vol}[{rotulo}]")

    if usar_inputs:
        # Uma entrada por trecho com seek preciso → só decodifica o que fica no vídeo.
        # Espaços vazios viram quadro preto + silêncio. Tudo é padronizado antes do concat.
        junto = has_audio and audio_junto
        pares = ""
        for k, p in enumerate([] if audio_only else pecas):
            vi = _entrada_peca(p, True)
            filtros.append(f"[{vi}:v:0]scale={W}:{H}:force_original_aspect_ratio=decrease,"
                           f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},format=yuv420p[v{k}]")
            pares += f"[v{k}]"
            if junto:
                ai = _entrada_peca(p, False) if p[0] == "gap" else vi
                _filtro_audio(ai, p, f"a{k}")
                pares += f"[a{k}]"
        if not audio_only:
            filtros.append(f"{pares}concat=n={len(pecas)}:v=1:a={1 if junto else 0}[vc]" + ("[ac]" if junto else ""))
        if has_audio and not audio_junto:
            pares_a = ""
            for k, p in enumerate(pecas_a):
                _filtro_audio(_entrada_peca(p, False), p, f"ax{k}")
                pares_a += f"[ax{k}]"
            filtros.append(f"{pares_a}concat=n={len(pecas_a)}:v=0:a=1[ac]")
    else:
        # Muitos trechos: um único select (baixa memória)
        cond = "+".join(f"between(t,{p[0]:.3f},{p[1]:.3f})" for p in segs)
        cmd += ["-i", path]
        entrada += 1
        filtros.append(f"[0:v:0]select='{cond}',setpts=N/FRAME_RATE/TB[vc]")
        if has_audio:
            filtros.append(f"[0:a:0]aselect='{cond}',asetpts=N/SR/TB[ac]")

    # Camadas por cima (imagens e clipes com escala/posição/rotação/opacidade), de baixo para cima
    vf = "[vc]"
    for n, c in enumerate(lay):
        if c["tipo"] == "imagem":
            cmd += ["-loop", "1", "-framerate", fps, "-t", f"{c['dur']:.3f}", "-i", c["path"]]
        else:
            cmd += ["-ss", f"{c['s']:.3f}", "-t", f"{c['dur']:.3f}", "-i", path]
        idx = entrada
        entrada += 1
        kf = c["kf"]
        # Dentro da cadeia da camada o tempo começa em 0 (t / T); no overlay é o tempo do vídeo final.
        # Propriedade animada vira expressão avaliada a cada quadro.
        if "sc" in kf:
            e = _expr_kf(kf["sc"], "t")
            escala = (f"scale=w='max(2,trunc(iw*({e})))':h='max(2,trunc(ih*({e})))'"
                      f":eval=frame:flags=bicubic")
        else:
            k = c["sc"]
            escala = f"scale='max(2,trunc(iw*{k:.5f}))':'max(2,trunc(ih*{k:.5f}))':flags=bicubic"
        giro = None
        if "rot" in kf:
            # quadro fixo do tamanho da diagonal: cabe em qualquer ângulo
            e = _expr_kf(kf["rot"], "t")
            giro = f"rotate=a='({e})*PI/180':c=black@0:ow='hypot(iw,ih)':oh='hypot(iw,ih)'"
        elif c["rot"]:
            rad = c["rot"] * 3.141592653589793 / 180
            giro = f"rotate={rad:.6f}:c=black@0:ow='rotw({rad:.6f})':oh='roth({rad:.6f})'"
        if "op" in kf:
            e = _expr_kf(kf["op"], "T")
            opac = f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*({e})'"
        elif c["op"] < 0.999:
            opac = f"colorchannelmixer=aa={c['op']:.4f}"
        else:
            opac = None
        # escala animada vai por último (tamanho muda a cada quadro; o resto trabalha em tamanho fixo)
        ordem = [giro, opac, escala] if "sc" in kf else [escala, giro, opac]
        efeitos = _filtros_fx(c["fx"], c["mw"], c["mh"])
        cadeia = f"[{idx}:v:0]fps={fps},format=rgba," + ",".join(efeitos + [f for f in ordem if f])
        cadeia += f",setpts=PTS-STARTPTS+{c['st']:.3f}/TB[l{n}]"
        filtros.append(cadeia)
        fim = c["st"] + c["dur"]
        tl = f"(t-{c['st']:.4f})"
        px = _expr_kf(kf["x"], tl) if "x" in kf else f"{c['x']:.2f}"
        py = _expr_kf(kf["y"], tl) if "y" in kf else f"{c['y']:.2f}"
        filtros.append(f"{vf}[l{n}]overlay=x='{px}-w/2':y='{py}-h/2'"
                       f":enable='between(t,{c['st']:.3f},{fim:.3f})':eof_action=pass:format=auto[o{n}]")
        vf = f"[o{n}]"
    if lay:
        filtros.append(f"{vf}format=yuv420p[vlay]")
        vf = "[vlay]"

    if alvo_h and info["height"] > alvo_h:
        filtros.append(f"{vf}scale=-2:{alvo_h}:flags=lanczos[vs]")
        vf = "[vs]"

    script = os.path.join(_work_dir(), f"filtro_{uuid.uuid4().hex[:8]}.txt")
    with open(script, "w", encoding="utf-8") as f:
        f.write(";\n".join(filtros))

    base_cmd = cmd + [_opcao_filtro_script(), script] + ([] if audio_only else ["-map", vf])
    if has_audio:
        base_cmd += ["-map", "[ac]", "-c:a", cfg["acodec"]]
        if cfg["acodec"] != "pcm_s16le":
            base_cmd += ["-b:a", "320k" if audio_only and q["ab"] == "256k" else q["ab"]]

    def _tentar(gpu):
        global _export_proc
        video_args = ["-vn"] if audio_only else _args_video(cfg, q, gpu)
        full = base_cmd + video_args + cfg["extra"] + [saida]

        def _hold(p):
            global _export_proc
            with _export_lock:
                _export_proc = p

        rc, err = _run_progress(full, total, lambda p: prog(p, f"Exportando... {p}%"), stop_event, _hold)
        with _export_lock:
            _export_proc = None
        return rc, err

    try:
        enc = _detectar_hw_encoder() if (usar_gpu and not audio_only and cfg["vcodec"] == "h264") else None
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
