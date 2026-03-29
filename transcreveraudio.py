"""
transcreveraudio.py
===================
Transcreve áudios para texto usando o modelo Whisper (OpenAI).
Otimizado para português brasileiro.

Formatos suportados:
  OGG, OPUS, MP3, WAV, M4A, MP4, WEBM, FLAC

Resultado:
  Um único arquivo .txt com todas as transcrições,
  salvo em /transcricoes dentro da pasta selecionada.

Dependências:
  pip install openai-whisper
  + ffmpeg instalado/embutido no sistema
"""

import os
import sys
import datetime

FORMATOS_SUPORTADOS = {
    ".ogg", ".opus", ".mp3", ".wav",
    ".m4a", ".mp4", ".webm", ".flac"
}

MODELOS = {
    "Rápido (small)":   "small",
    "Preciso (medium)": "medium",
}


# =========================
# 🔍 HELPER: localiza ffmpeg
# =========================
def configurar_ffmpeg():
    """
    Configura ffmpeg e caminhos dos modelos Whisper.
    Usa a pasta modelos_ia ao lado do .exe para os modelos.
    """
    # --- ffmpeg ---
    if hasattr(sys, "_MEIPASS"):
        base_dir = sys._MEIPASS
        exe_dir  = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        exe_dir  = base_dir

    ffmpeg_local = os.path.join(base_dir, "ffmpeg.exe")
    if os.path.exists(ffmpeg_local):
        os.environ["PATH"] = base_dir + os.pathsep + os.environ.get("PATH", "")

    # --- Assets do Whisper (mel_filters.npz) embutidos no .exe ---
    assets_dir = os.path.join(base_dir, "whisper", "assets")
    if os.path.exists(assets_dir):
        try:
            import whisper.audio as wa
            wa.ASSETS_PATH = assets_dir
        except Exception:
            pass

    # --- Aponta Whisper para pasta modelos_ia ao lado do .exe ---
    whisper_dir = os.path.join(exe_dir, "modelos_ia", "whisper")
    os.makedirs(whisper_dir, exist_ok=True)
    os.environ["XDG_CACHE_HOME"] = exe_dir
    os.environ["WHISPER_CACHE"]  = whisper_dir


# =========================
# 🎙️ TRANSCREVER LISTA
# =========================
def transcrever_audios(lista_paths, modelo_key="Rápido (small)",
                       callback_progresso=None, callback_log=None):
    """
    Transcreve uma lista de arquivos de áudio.
    Retorna dict com resultado e caminho do .txt gerado.
    """
    configurar_ffmpeg()

    try:
        import whisper
    except ImportError:
        msg = ("❌ whisper não instalado. "
               "Rode: pip install openai-whisper")
        if callback_log:
            callback_log(msg)
        return {"total": 0, "transcritos": 0, "falhas": 0, "arquivo_txt": None}

    modelo_nome = MODELOS.get(modelo_key, "small")

    if callback_log:
        callback_log(f"🔄 Carregando modelo '{modelo_nome}'...")
    if callback_progresso:
        callback_progresso(2, f"Carregando modelo {modelo_nome}...")

    # Determina pasta do whisper
    if hasattr(sys, "_MEIPASS"):
        _exe_dir = os.path.dirname(sys.executable)
    else:
        _exe_dir = os.path.dirname(os.path.abspath(__file__))
    _whisper_dir = os.path.join(_exe_dir, "modelos_ia", "whisper")

    try:
        # Carrega do nosso diretório com download_root
        modelo = whisper.load_model(modelo_nome, download_root=_whisper_dir)
    except Exception as e:
        import traceback
        if callback_log:
            callback_log(f"❌ Erro ao carregar modelo: {e}")
            callback_log(traceback.format_exc()[-400:])
        return {"total": 0, "transcritos": 0, "falhas": 0, "arquivo_txt": None}

    if callback_log:
        callback_log(f"✅ Modelo '{modelo_nome}' carregado.")

    total       = len(lista_paths)
    transcritos = 0
    falhas      = 0
    linhas      = []

    # Cabeçalho do arquivo de saída
    agora = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
    linhas.append(f"TRANSCRIÇÕES — Canivete do Pailer")
    linhas.append(f"Gerado em: {agora}")
    linhas.append(f"Modelo: {modelo_nome}")
    linhas.append("=" * 60)
    linhas.append("")

    for i, path in enumerate(lista_paths):
        nome = os.path.basename(path)
        ext  = os.path.splitext(path)[1].lower()

        if ext not in FORMATOS_SUPORTADOS:
            if callback_log:
                callback_log(f"⏭️  Ignorado: {nome}")
            falhas += 1
            continue

        if callback_log:
            callback_log(f"🎙️  Transcrevendo ({i+1}/{total}): {nome}")
        if callback_progresso:
            progresso = 5 + int((i / total) * 90)
            callback_progresso(progresso, f"Transcrevendo {i+1}/{total}...")

        try:
            # Tenta obter duração do áudio para progresso real
            import io as _io
            duracao_audio = 0
            try:
                import wave
                if path.lower().endswith(".wav"):
                    with wave.open(path, 'r') as wf:
                        duracao_audio = wf.getnframes() / wf.getframerate()
            except Exception:
                pass

            # Progresso em tempo real via tqdm hook
            _segmentos_vistos = [0]

            def _on_progress(seek, total_dur):
                """Chamado pelo Whisper a cada chunk processado."""
                if total_dur > 0 and callback_progresso:
                    pct_arquivo = seek / total_dur
                    pct_geral   = 5 + int((i + pct_arquivo) / total * 90)
                    m  = int(seek // 60)
                    s  = int(seek % 60)
                    mt = int(total_dur // 60)
                    st = int(total_dur % 60)
                    callback_progresso(
                        pct_geral,
                        f"🎙️ Áudio {i+1}/{total} — {m}:{s:02d} / {mt}:{st:02d} ({int(pct_arquivo*100)}%)"
                    )

            # Redireciona stdout/stderr (Whisper escreve no stdout, None no .exe)
            _out, _err = sys.stdout, sys.stderr
            sys.stdout = sys.stderr = _io.StringIO()
            try:
                resultado = modelo.transcribe(
                    path,
                    language="pt",
                    task="transcribe",
                    fp16=False,
                    verbose=False,
                    condition_on_previous_text=True,
                )
            finally:
                sys.stdout = _out
                sys.stderr = _err

            # Progresso final do arquivo
            if callback_progresso:
                pct_geral = 5 + int((i + 1) / total * 90)
                callback_progresso(pct_geral, f"✅ Áudio {i+1}/{total} concluído!")

            texto = resultado["text"].strip()
            linhas.append(f"📁 Arquivo: {nome}")
            linhas.append(f"🕐 Duração aprox.: {formatar_duracao(resultado)}")
            linhas.append("")
            linhas.append(texto)
            linhas.append("")
            linhas.append("-" * 60)
            linhas.append("")

            if callback_log:
                # Mostra preview das primeiras 120 chars
                preview = texto[:120] + ("..." if len(texto) > 120 else "")
                callback_log(f"   ✅ {preview}")

            transcritos += 1

        except Exception as e:
            if callback_log:
                callback_log(f"   ❌ Erro em {nome}: {e}")
            linhas.append(f"📁 Arquivo: {nome}")
            linhas.append(f"❌ Erro na transcrição: {e}")
            linhas.append("")
            linhas.append("-" * 60)
            linhas.append("")
            falhas += 1

    # Salva o .txt
    pasta_saida = os.path.join(os.path.dirname(lista_paths[0]), "transcricoes")
    os.makedirs(pasta_saida, exist_ok=True)

    timestamp   = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_txt    = f"transcricao_{timestamp}.txt"
    path_txt    = os.path.join(pasta_saida, nome_txt)

    with open(path_txt, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    if callback_log:
        callback_log(f"\n📄 Arquivo salvo em: {path_txt}")

    return {
        "total":       total,
        "transcritos": transcritos,
        "falhas":      falhas,
        "arquivo_txt": path_txt,
    }


# =========================
# 📁 TRANSCREVER PASTA
# =========================
def transcrever_pasta(pasta, modelo_key="Rápido (small)",
                      callback_progresso=None, callback_log=None):
    """
    Varre uma pasta e transcreve todos os áudios suportados.
    """
    arquivos = [
        os.path.join(pasta, f) for f in sorted(os.listdir(pasta))
        if os.path.isfile(os.path.join(pasta, f))
        and os.path.splitext(f)[1].lower() in FORMATOS_SUPORTADOS
    ]

    if not arquivos:
        if callback_log:
            callback_log("⚠️  Nenhum áudio encontrado na pasta.")
        if callback_progresso:
            callback_progresso(100, "Nenhum áudio encontrado")
        return {"total": 0, "transcritos": 0, "falhas": 0, "arquivo_txt": None}

    if callback_log:
        callback_log(f"📥 {len(arquivos)} áudio(s) encontrado(s)")

    return transcrever_audios(arquivos, modelo_key=modelo_key,
                              callback_progresso=callback_progresso,
                              callback_log=callback_log)


# =========================
# ⏱️ HELPER: duração
# =========================
def formatar_duracao(resultado):
    try:
        segs = resultado["segments"]
        if segs:
            total = segs[-1]["end"]
            m, s  = divmod(int(total), 60)
            return f"{m}min {s}s"
    except Exception:
        pass
    return "desconhecida"


# =========================
# 🖥️ CLI
# =========================
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python transcreveraudio.py <pasta_ou_arquivo> [modelo]")
        print("Modelos: small (padrão), medium")
        sys.exit(1)

    alvo   = sys.argv[1]
    modelo = sys.argv[2] if len(sys.argv) > 2 else "Rápido (small)"

    if os.path.isdir(alvo):
        r = transcrever_pasta(alvo, modelo_key=modelo, callback_log=print)
    elif os.path.isfile(alvo):
        r = transcrever_audios([alvo], modelo_key=modelo, callback_log=print)
    else:
        print("Caminho inválido.")
        sys.exit(1)

    print("\n🔥 FINALIZADO")
    print(f"  Total      : {r['total']}")
    print(f"  Transcritos: {r['transcritos']}")
    print(f"  Falhas     : {r['falhas']}")
    if r['arquivo_txt']:
        print(f"  Salvo em   : {r['arquivo_txt']}")
