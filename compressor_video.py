"""
compressor_video.py — Compressor de Vídeo para o Canivete do Pailer
Recomprime vídeos para H.265 (HEVC) mantendo qualidade e resolução originais.
Usa ffmpeg embutido.
"""

import os
import sys
import re
import subprocess
import threading

# Extensões de vídeo suportadas
EXTENSOES_VIDEO = {
    ".mp4", ".mov", ".avi", ".mkv", ".mxf", ".r3d", ".braw",
    ".wmv", ".flv", ".webm", ".m4v", ".3gp", ".ts", ".mts",
    ".m2ts", ".mpg", ".mpeg", ".vob", ".ogv", ".dv"
}

# Qualidade CRF — quanto menor, melhor qualidade e maior arquivo
# 18 = quase imperceptível, 23 = padrão, 28 = menor tamanho
QUALIDADE_PADRAO = 23


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


def get_info_video(caminho):
    """
    Retorna dict com informações do vídeo:
    duration, width, height, fps, codec_video, codec_audio, tamanho_mb
    """
    try:
        ffmpeg = get_ffmpeg()
        cmd = [ffmpeg, "-i", caminho]
        r = subprocess.run(cmd, capture_output=True, text=True,
                           creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        info = r.stderr  # ffmpeg manda info pro stderr

        resultado = {
            "duracao":      _extrair_duracao(info),
            "largura":      0,
            "altura":       0,
            "fps":          0.0,
            "codec_video":  "",
            "codec_audio":  "",
            "tamanho_mb":   os.path.getsize(caminho) / 1024 / 1024,
        }

        # Resolução e FPS
        m = re.search(r"(\d{2,5})x(\d{2,5})", info)
        if m:
            resultado["largura"]  = int(m.group(1))
            resultado["altura"]   = int(m.group(2))

        m_fps = re.search(r"([\d.]+)\s*fps", info)
        if m_fps:
            resultado["fps"] = float(m_fps.group(1))

        # Codec de vídeo
        m_cv = re.search(r"Video:\s+(\w+)", info)
        if m_cv:
            resultado["codec_video"] = m_cv.group(1)

        # Codec de áudio
        m_ca = re.search(r"Audio:\s+(\w+)", info)
        if m_ca:
            resultado["codec_audio"] = m_ca.group(1)

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
    callback_progresso=None,
    callback_log=None,
    stop_event=None
):
    """
    Comprime um vídeo para H.265 mantendo qualidade visual.
    
    - entrada: caminho do arquivo original
    - saida: caminho do arquivo comprimido
    - qualidade_crf: 18=ótima, 23=boa, 28=menor arquivo
    - callback_progresso(pct, texto): progresso 0-100
    - callback_log(msg): mensagens de log
    - stop_event: threading.Event para cancelar
    
    Retorna (sucesso: bool, tamanho_original_mb, tamanho_final_mb)
    """
    ffmpeg = get_ffmpeg()
    tamanho_original = os.path.getsize(entrada) / 1024 / 1024

    # Pega duração para calcular progresso
    info = get_info_video(entrada)
    duracao = info["duracao"] if info else 0

    if callback_log:
        nome = os.path.basename(entrada)
        callback_log(f"🎬 Comprimindo: {nome}")
        if info:
            callback_log(f"   {info['largura']}x{info['altura']} • "
                        f"{info['fps']:.2f}fps • "
                        f"{info['codec_video']} → H.265 • "
                        f"{_fmt_tamanho(tamanho_original)}")

    # Comando ffmpeg:
    # -c:v libx265     → codec H.265 (HEVC)
    # -crf 23          → qualidade (23 = padrão excelente)
    # -preset medium   → equilíbrio velocidade/compressão
    # -c:a copy        → áudio copiado SEM recompressão (qualidade original)
    # -map_metadata 0  → preserva metadados (data, GPS, etc)
    # -movflags +faststart → otimizado para streaming
    cmd = [
        ffmpeg, "-y",
        "-i", entrada,
        "-c:v", "libx265",
        "-crf", str(qualidade_crf),
        "-preset", "medium",
        "-c:a", "copy",
        "-map_metadata", "0",
        "-movflags", "+faststart",
        "-progress", "pipe:1",
        "-loglevel", "error",
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

        tempo_atual = 0.0
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

            # ffmpeg -progress pipe:1 emite linhas como "out_time_ms=123456789"
            m = re.match(r"out_time_ms=(\d+)", line)
            if m:
                tempo_atual = int(m.group(1)) / 1_000_000
                if duracao > 0 and callback_progresso:
                    pct = min(int(tempo_atual / duracao * 100), 99)
                    mins = int(tempo_atual // 60)
                    segs = int(tempo_atual % 60)
                    callback_progresso(
                        pct,
                        f"{pct}%  •  {mins:02d}:{segs:02d} / "
                        f"{int(duracao//60):02d}:{int(duracao%60):02d}"
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
            erro = proc.stderr.read() if proc.stderr else ""
            if callback_log:
                callback_log(f"   ❌ Erro: {erro[:200] if erro else 'falha desconhecida'}")
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
