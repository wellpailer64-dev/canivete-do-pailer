"""
compressor_video.py — Compressor de Vídeo para o Canivete do Pailer
Recomprime vídeos para H.265 (HEVC) mantendo qualidade e resolução originais.
Usa ffmpeg embutido.
"""

import os
import sys
import re
import json
import subprocess
import threading
import time

# Extensões de vídeo suportadas
EXTENSOES_VIDEO = {
    ".mp4", ".mov", ".avi", ".mkv", ".mxf", ".r3d", ".braw",
    ".wmv", ".flv", ".webm", ".m4v", ".3gp", ".ts", ".mts",
    ".m2ts", ".mpg", ".mpeg", ".vob", ".ogv", ".dv"
}

# Qualidade CRF — quanto menor, melhor qualidade e maior arquivo
# 18 = quase imperceptível, 23 = padrão, 28 = menor tamanho
QUALIDADE_PADRAO = 23

_ENCODERS_CACHE = None


def resource_path(filename):
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, filename)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)


def get_ffmpeg():
    """Retorna o caminho do ffmpeg — embutido ou do sistema."""
    local = resource_path("ffmpeg.exe")
    if os.path.exists(local):
        return local
    return "ffmpeg"


def get_ffprobe():
    """Retorna o caminho do ffprobe (embutido, ao lado do ffmpeg ou do sistema)."""
    local = resource_path("ffprobe.exe")
    if os.path.exists(local):
        return local

    ffmpeg_local = resource_path("ffmpeg.exe")
    ffprobe_ao_lado = os.path.join(os.path.dirname(ffmpeg_local), "ffprobe.exe")
    if os.path.exists(ffprobe_ao_lado):
        return ffprobe_ao_lado

    return "ffprobe"


def _fps_from_fraction(frac):
    try:
        if not frac:
            return 0.0
        if "/" in str(frac):
            a, b = str(frac).split("/", 1)
            a = float(a)
            b = float(b)
            if b != 0:
                return a / b
            return 0.0
        return float(frac)
    except Exception:
        return 0.0


def _probe_info_ffprobe(caminho, timeout_sec=12):
    """Lê metadados via ffprobe (mais confiável para resolução)."""
    try:
        ffprobe = get_ffprobe()
        cmd = [
            ffprobe,
            "-v", "error",
            "-show_streams",
            "-show_format",
            "-of", "json",
            caminho,
        ]
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )

        data = json.loads(r.stdout or "{}")
        streams = data.get("streams") or []
        fmt = data.get("format") or {}

        v = next((s for s in streams if s.get("codec_type") == "video"), None)
        a = next((s for s in streams if s.get("codec_type") == "audio"), None)

        dur = 0.0
        try:
            dur = float(fmt.get("duration") or 0.0)
        except Exception:
            dur = 0.0
        if dur <= 0 and v:
            try:
                dur = float(v.get("duration") or 0.0)
            except Exception:
                dur = 0.0

        resultado = {
            "duracao": dur,
            "largura": int(v.get("width") or 0) if v else 0,
            "altura": int(v.get("height") or 0) if v else 0,
            "fps": _fps_from_fraction(v.get("avg_frame_rate") if v else 0),
            "codec_video": (v.get("codec_name") or "") if v else "",
            "codec_audio": (a.get("codec_name") or "") if a else "",
            "tamanho_mb": os.path.getsize(caminho) / 1024 / 1024,
        }

        if resultado["largura"] > 0 and resultado["altura"] > 0:
            return resultado
        return None
    except Exception:
        return None


def get_info_video(caminho, timeout_sec=90):
    """
    Retorna dict com informações do vídeo:
    duration, width, height, fps, codec_video, codec_audio, tamanho_mb
    """
    try:
        via_probe = _probe_info_ffprobe(caminho, timeout_sec=min(12, timeout_sec))
        if via_probe:
            return via_probe

        ffmpeg = get_ffmpeg()
        cmd = [ffmpeg, "-i", caminho]

        info = ""
        try:
            r = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_sec,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            info = r.stderr or ""
        except subprocess.TimeoutExpired as e:
            parcial = e.stderr if e.stderr is not None else ""
            if isinstance(parcial, bytes):
                info = parcial.decode("utf-8", errors="replace")
            else:
                info = str(parcial)

        resultado = {
            "duracao": _extrair_duracao(info),
            "largura": 0,
            "altura": 0,
            "fps": 0.0,
            "codec_video": "",
            "codec_audio": "",
            "tamanho_mb": os.path.getsize(caminho) / 1024 / 1024,
        }

        m = re.search(r"(\d{2,5})x(\d{2,5})", info)
        if m:
            resultado["largura"] = int(m.group(1))
            resultado["altura"] = int(m.group(2))

        m_fps = re.search(r"([\d.]+)\s*fps", info)
        if m_fps:
            resultado["fps"] = float(m_fps.group(1))

        m_cv = re.search(r"Video:\s+(\w+)", info)
        if m_cv:
            resultado["codec_video"] = m_cv.group(1)

        m_ca = re.search(r"Audio:\s+(\w+)", info)
        if m_ca:
            resultado["codec_audio"] = m_ca.group(1)

        # Fallback para arquivos pesados/lentos: tenta pegar resolução/FPS via OpenCV.
        if resultado["largura"] <= 0 or resultado["altura"] <= 0:
            try:
                import cv2  # import tardio para não forçar dependência em import de módulo

                cap = cv2.VideoCapture(caminho)
                if cap and cap.isOpened():
                    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
                    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
                    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
                    if w > 0 and h > 0:
                        resultado["largura"] = w
                        resultado["altura"] = h
                    if fps > 0 and resultado["fps"] <= 0:
                        resultado["fps"] = fps
                try:
                    cap.release()
                except Exception:
                    pass
            except Exception:
                pass

        # Só retorna None quando realmente não há nenhuma informação útil.
        if (
            resultado["duracao"] <= 0
            and resultado["largura"] <= 0
            and resultado["altura"] <= 0
            and not resultado["codec_video"]
        ):
            return None
        return resultado
    except Exception:
        return None


def _extrair_duracao(texto):
    """Extrai duração em segundos do output do ffmpeg."""
    m = re.search(r"Duration:\s+(\d+):(\d+):([\d.]+)", texto)
    if m:
        h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
        return h * 3600 + mn * 60 + s
    return 0.0


def _fmt_tamanho(mb):
    if mb >= 1024:
        return f"{mb/1024:.2f} GB"
    return f"{mb:.1f} MB"


def _fmt_tempo(segundos):
    s = max(0, int(segundos))
    h = s // 3600
    m = (s % 3600) // 60
    s = s % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _encoders_disponiveis():
    global _ENCODERS_CACHE
    if _ENCODERS_CACHE is not None:
        return _ENCODERS_CACHE

    saida = ""
    try:
        ffmpeg = get_ffmpeg()
        r = subprocess.run(
            [ffmpeg, "-encoders"],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        saida = (r.stdout or "") + "\n" + (r.stderr or "")
    except Exception:
        saida = ""

    txt = saida.lower()
    _ENCODERS_CACHE = {
        "libx265": "libx265" in txt,
        "libx264": "libx264" in txt,
        "hevc_nvenc": "hevc_nvenc" in txt,
        "hevc_qsv": "hevc_qsv" in txt,
        "hevc_amf": "hevc_amf" in txt,
    }
    return _ENCODERS_CACHE


def detectar_encoders_disponiveis():
    """Retorna dict com encoders de CPU/GPU disponíveis no ffmpeg local."""
    return dict(_encoders_disponiveis())


def _escolher_encoder(usar_gpu=False):
    enc = _encoders_disponiveis()

    if usar_gpu:
        if enc.get("hevc_nvenc"):
            return "hevc_nvenc", "GPU (NVIDIA NVENC)"
        if enc.get("hevc_qsv"):
            return "hevc_qsv", "GPU (Intel Quick Sync)"
        if enc.get("hevc_amf"):
            return "hevc_amf", "GPU (AMD AMF)"

    if enc.get("libx265"):
        return "libx265", "CPU (libx265)"
    if enc.get("libx264"):
        return "libx264", "CPU (libx264 fallback)"
    return "libx264", "CPU (fallback)"


def listar_videos(pasta):
    """Lista todos os arquivos de vídeo em uma pasta (não recursivo)."""
    videos = []
    try:
        for f in os.listdir(pasta):
            ext = os.path.splitext(f)[1].lower()
            if ext in EXTENSOES_VIDEO:
                videos.append(os.path.join(pasta, f))
    except Exception:
        pass
    return sorted(videos)


def comprimir_video(
    entrada,
    saida,
    qualidade_crf=QUALIDADE_PADRAO,
    usar_gpu=False,
    forcar_fullhd=False,
    callback_progresso=None,
    callback_log=None,
    stop_event=None
):
    """
    Comprime um vídeo para H.265 mantendo qualidade visual.
    
    - entrada: caminho do arquivo original
    - saida: caminho do arquivo comprimido
    - qualidade_crf: 18=ótima, 23=boa, 28=menor arquivo
    - forcar_fullhd: reduz para no máximo 1920x1080 sem distorcer
    - callback_progresso(pct, texto): progresso 0-100
    - callback_log(msg): mensagens de log
    - stop_event: threading.Event para cancelar
    
    Retorna (sucesso: bool, tamanho_original_mb, tamanho_final_mb)
    """
    ffmpeg = get_ffmpeg()
    tamanho_original = os.path.getsize(entrada) / 1024 / 1024

    # Pega duração para calcular progresso
    info = get_info_video(entrada, timeout_sec=90)
    duracao = info["duracao"] if info else 0
    duracao_dyn = {"valor": duracao}

    if callback_log:
        nome = os.path.basename(entrada)
        callback_log(f"🎬 Comprimindo: {nome}")
        if info:
            callback_log(f"   {info['largura']}x{info['altura']} • "
                        f"{info['fps']:.2f}fps • "
                        f"{info['codec_video']} → H.265 • "
                        f"{_fmt_tamanho(tamanho_original)}")
        else:
            callback_log("   ⚠️ Não foi possível ler duração rapidamente; progresso ficará em modo atividade.")

    aplicar_fullhd = bool(forcar_fullhd)
    if callback_log and aplicar_fullhd:
        callback_log("   Resolução: forçar Full HD (máx. 1920x1080)")

    # Comando ffmpeg:
    # -c:v libx265     → codec H.265 (HEVC)
    # -crf 23          → qualidade (23 = padrão excelente)
    # -preset medium   → equilíbrio velocidade/compressão
    # -c:a copy        → áudio copiado SEM recompressão (qualidade original)
    # -map_metadata 0  → preserva metadados (data, GPS, etc)
    # -movflags +faststart → otimizado para streaming
    codec_video, perfil_codec = _escolher_encoder(usar_gpu=usar_gpu)
    if callback_log:
        callback_log(f"   Codec: {codec_video}  •  {perfil_codec}")

    cmd = [
        ffmpeg, "-y",
        "-i", entrada,
        "-c:v", codec_video,
    ]

    if codec_video in ("libx265", "libx264"):
        cmd += ["-crf", str(qualidade_crf), "-preset", "medium"]
    elif codec_video == "hevc_nvenc":
        cmd += ["-preset", "p5", "-cq", str(qualidade_crf), "-rc", "vbr", "-b:v", "0"]
    elif codec_video == "hevc_qsv":
        cmd += ["-global_quality", str(qualidade_crf)]
    elif codec_video == "hevc_amf":
        qp = max(1, min(int(qualidade_crf), 51))
        cmd += ["-rc", "cqp", "-qp_i", str(qp), "-qp_p", str(qp)]

    if aplicar_fullhd:
        cmd += ["-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease"]

    cmd += [
        "-c:a", "copy",
        "-map_metadata", "0",
        "-movflags", "+faststart",
        "-progress", "pipe:1",
        "-nostats",
        saida
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )

        # Lê stderr em thread separada para não bloquear stdout
        import threading as _th
        stderr_lines = []

        def _ler_stderr():
            for line in proc.stderr:
                linha = line.rstrip()
                stderr_lines.append(linha)
                if duracao_dyn["valor"] <= 0:
                    d = _extrair_duracao(linha)
                    if d > 0:
                        duracao_dyn["valor"] = d
        _th.Thread(target=_ler_stderr, daemon=True).start()

        tempo_atual = 0.0
        speed_atual = 0.0
        inicio_wall = time.time()
        for line in proc.stdout:
            if stop_event and stop_event.is_set():
                proc.terminate()
                if callback_log:
                    callback_log("⛔ Cancelado.")
                # Remove arquivo incompleto
                if os.path.exists(saida):
                    os.remove(saida)
                return False, tamanho_original, 0

            line = line.strip()

            m_speed = re.match(r"speed=([\d.]+)x", line)
            if m_speed:
                try:
                    speed_atual = float(m_speed.group(1))
                except Exception:
                    speed_atual = 0.0

            # ffmpeg -progress pipe:1 emite linhas como "out_time_ms=123456789"
            m = re.match(r"out_time_ms=(\d+)", line)
            if not m:
                m = re.match(r"out_time_us=(\d+)", line)
            if m:
                tempo_atual = int(m.group(1)) / 1_000_000
                if callback_progresso:
                    duracao_atual = duracao_dyn["valor"]
                    tempo_decorrido_wall = time.time() - inicio_wall
                    tempo_proc_txt = _fmt_tempo(tempo_atual)
                    if duracao_atual > 0:
                        pct = min((tempo_atual / duracao_atual) * 100.0, 99.9)
                        restante_media = max(duracao_atual - tempo_atual, 0.0)
                        if speed_atual > 0.01:
                            eta_sec = restante_media / speed_atual
                        elif tempo_atual > 1.0:
                            eta_sec = restante_media * (tempo_decorrido_wall / tempo_atual)
                        else:
                            eta_sec = 0.0
                        callback_progresso(
                            pct,
                            f"{pct:.1f}%  •  {tempo_proc_txt} / {_fmt_tempo(duracao_atual)}  •  "
                            f"decorrido {_fmt_tempo(tempo_decorrido_wall)}  •  "
                            f"falta ~{_fmt_tempo(eta_sec)}"
                        )
                    else:
                        callback_progresso(
                            -1,
                            f"Processando... timeline {tempo_proc_txt}  •  "
                            f"decorrido {_fmt_tempo(tempo_decorrido_wall)}"
                        )

            m_size = re.match(r"total_size=(\d+)", line)
            if m_size and callback_progresso and duracao_dyn["valor"] <= 0:
                mb_saida = int(m_size.group(1)) / 1024 / 1024
                callback_progresso(
                    -1,
                    f"Processando... {_fmt_tamanho(mb_saida)} gerados  •  "
                    f"decorrido {_fmt_tempo(time.time() - inicio_wall)}"
                )

        proc.wait()

        if proc.returncode == 0 and os.path.exists(saida):
            tamanho_final = os.path.getsize(saida) / 1024 / 1024
            reducao = (1 - tamanho_final / tamanho_original) * 100

            if callback_log:
                callback_log(
                    f"   ✅ {_fmt_tamanho(tamanho_original)} → "
                    f"{_fmt_tamanho(tamanho_final)} "
                    f"(-{reducao:.0f}%)"
                )
            if callback_progresso:
                callback_progresso(100, f"100%  •  -{reducao:.0f}% de peso")

            return True, tamanho_original, tamanho_final
        else:
            # Mostra erro do stderr para diagnóstico
            erro_txt = "\\n".join(stderr_lines[-5:]) if stderr_lines else "falha desconhecida"
            if callback_log:
                callback_log(f"   ❌ Erro ffmpeg: {erro_txt[:300]}")
            if os.path.exists(saida):
                os.remove(saida)
            return False, tamanho_original, 0

    except Exception as e:
        if callback_log:
            callback_log(f"   ❌ Erro: {e}")
        if os.path.exists(saida):
            os.remove(saida)
        return False, tamanho_original, 0


def comprimir_lista(
    arquivos,
    pasta_saida,
    qualidade_crf=QUALIDADE_PADRAO,
    usar_gpu=False,
    forcar_fullhd=False,
    manter_original=True,
    callback_progresso=None,
    callback_log=None,
    callback_arquivo=None,
    stop_event=None
):
    """
    Comprime uma lista de vídeos.
    
    - manter_original=True  → salva comprimido em pasta_saida, mantém original
    - manter_original=False → substitui original pelo comprimido
    
    callback_arquivo(idx, total, nome): chamado a cada novo arquivo
    
    Retorna dict com estatísticas.
    """
    total        = len(arquivos)
    ok           = 0
    erros        = 0
    total_orig   = 0.0
    total_final  = 0.0

    os.makedirs(pasta_saida, exist_ok=True)

    for i, entrada in enumerate(arquivos):
        if stop_event and stop_event.is_set():
            break

        nome      = os.path.basename(entrada)
        base, ext = os.path.splitext(nome)

        # Saída sempre em .mp4 (H.265 em container MP4)
        nome_saida = base + "_comprimido.mp4"
        saida_tmp  = os.path.join(pasta_saida, nome_saida)

        if callback_arquivo:
            callback_arquivo(i + 1, total, nome)

        if callback_log:
            callback_log(f"\n[{i+1}/{total}] {nome}")

        sucesso, orig, final = comprimir_video(
            entrada, saida_tmp,
            qualidade_crf=qualidade_crf,
            usar_gpu=usar_gpu,
            forcar_fullhd=forcar_fullhd,
            callback_progresso=callback_progresso,
            callback_log=callback_log,
            stop_event=stop_event
        )

        if sucesso:
            ok += 1
            total_orig  += orig
            total_final += final

            if not manter_original:
                # Substitui original
                try:
                    os.remove(entrada)
                    # Renomeia comprimido para o nome original
                    destino_final = os.path.join(
                        os.path.dirname(entrada),
                        base + ".mp4"
                    )
                    os.rename(saida_tmp, destino_final)
                    if callback_log:
                        callback_log(f"   🗑️  Original apagado — arquivo substituído.")
                except Exception as e:
                    if callback_log:
                        callback_log(f"   ⚠️  Não foi possível substituir: {e}")
        else:
            erros += 1

    reducao_total = (1 - total_final / total_orig) * 100 if total_orig > 0 else 0

    return {
        "total":         total,
        "ok":            ok,
        "erros":         erros,
        "total_orig_mb": total_orig,
        "total_final_mb": total_final,
        "reducao_pct":   reducao_total,
    }
