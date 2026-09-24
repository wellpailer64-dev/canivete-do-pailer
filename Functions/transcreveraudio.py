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
import re
import threading
import time

FORMATOS_SUPORTADOS = {
    ".ogg", ".opus", ".mp3", ".wav",
    ".m4a", ".mp4", ".webm", ".flac"
}

MODELOS = {
    "Rápido (small)":   "small",
    "Preciso (medium)": "medium",
}


def configurar_ffmpeg():
    if hasattr(sys, "_MEIPASS"):
        base_dir = sys._MEIPASS
        exe_dir  = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        exe_dir  = base_dir

    # Adiciona modelos_ia/ ao PATH para o ffmpeg ser encontrado pelo whisper
    projeto_raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    candidatos_ffmpeg = [
        os.path.join(exe_dir, "modelos_ia", "ffmpeg.exe"),
        os.path.join(projeto_raiz, "modelos_ia", "ffmpeg.exe"),
    ]
    
    for f in candidatos_ffmpeg:
        if os.path.exists(f):
            diretorio = os.path.dirname(f)
            if diretorio not in os.environ["PATH"]:
                os.environ["PATH"] = diretorio + os.pathsep + os.environ.get("PATH", "")
            break

    # Garante que a pasta de modelos whisper existe (SEMPRE na raiz, nunca em Functions/)
    projeto_raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    whisper_dir = os.path.join(projeto_raiz, "modelos_ia", "whisper")
    os.makedirs(whisper_dir, exist_ok=True)


def transcrever_audios(lista_paths, modelo_key="Rápido (small)", idioma="pt",
                       callback_progresso=None, callback_log=None):
    configurar_ffmpeg()

    try:
        import whisper
        import torch
    except ImportError:
        msg = "❌ whisper ou dependências não instaladas."
        if callback_log: callback_log(msg)
        return {"total": 0, "transcritos": 0, "falhas": 0, "arquivo_txt": None}

    modelo_nome = MODELOS.get(modelo_key, "small")

    if callback_log:
        callback_log(f"🔄 Carregando modelo '{modelo_nome}'...")
    if callback_progresso:
        callback_progresso(2, f"Carregando modelo {modelo_nome}...")

    if hasattr(sys, "_MEIPASS"):
        _exe_dir = os.path.dirname(sys.executable)
    else:
        # SEMPRE busca na raiz (pai de Functions), nunca em Functions/
        base_dir = os.path.dirname(os.path.abspath(__file__))
        _exe_dir = os.path.dirname(base_dir)
    _whisper_dir = os.path.join(_exe_dir, "modelos_ia", "whisper")

    try:
        # Patch: o Whisper busca mel_filters.npz em ASSETS_PATH (relativo ao pacote).
        # No bundle PyInstaller, os assets são copiados para _MEIPASS/whisper/assets/
        # via --add-data no build.bat. Garantimos que ASSETS_PATH aponte para lá.
        try:
            import whisper.audio as wa
            if hasattr(sys, "_MEIPASS"):
                assets_no_bundle = os.path.join(sys._MEIPASS, "whisper", "assets")
                if os.path.isdir(assets_no_bundle):
                    wa.ASSETS_PATH = assets_no_bundle
                else:
                    # Fallback: copia do pacote instalado (caso build antigo sem o --add-data)
                    import shutil
                    import whisper as _w_pkg
                    src_assets = os.path.join(os.path.dirname(_w_pkg.__file__), "assets")
                    if os.path.isdir(src_assets):
                        os.makedirs(assets_no_bundle, exist_ok=True)
                        for _f in os.listdir(src_assets):
                            _src = os.path.join(src_assets, _f)
                            _dst = os.path.join(assets_no_bundle, _f)
                            if not os.path.exists(_dst):
                                shutil.copy2(_src, _dst)
                        wa.ASSETS_PATH = assets_no_bundle
        except Exception:
            pass

        modelo = whisper.load_model(modelo_nome, download_root=_whisper_dir)
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao carregar modelo: {e}")
        return {"total": 0, "transcritos": 0, "falhas": 0, "arquivo_txt": None}

    if callback_log:
        callback_log(f"✅ Modelo '{modelo_nome}' carregado.")

    total       = len(lista_paths)
    transcritos = 0
    falhas      = 0
    linhas      = []

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
            if callback_log: callback_log(f"⏭️  Ignorado: {nome}")
            falhas += 1
            continue

        if callback_log:
            callback_log(f"🎙️  Transcrevendo ({i+1}/{total}): {nome}")
        
        try:
            def fake_progress_loop(stop_event):
                current_sub_pct = 0
                while not stop_event.is_set():
                    time.sleep(2)
                    if current_sub_pct < 0.95:
                        current_sub_pct += 0.05
                        pg = 5 + int(((i + current_sub_pct) / total) * 90)
                        if callback_progresso:
                            callback_progresso(pg, f"🎙️ Transcrevendo {nome}...")

            stop_evt = threading.Event()
            t_prog = threading.Thread(target=fake_progress_loop, args=(stop_evt,))
            t_prog.start()

            try:
                # transcribe() do whisper
                resultado = modelo.transcribe(
                    path,
                    language=idioma if idioma != "auto" else None,
                    task="transcribe",
                    fp16=False,
                    verbose=False
                )
            finally:
                stop_evt.set()
                t_prog.join()

            if callback_progresso:
                pct_geral = 5 + int(((i + 1) / total) * 90)
                callback_progresso(pct_geral, f"✅ {nome} concluído!")

            texto = resultado["text"].strip()
            linhas.append(f"📁 Arquivo: {nome}")
            linhas.append(f"🕐 Duração: {formatar_duracao(resultado)}")
            linhas.append("")
            linhas.append(texto)
            linhas.append("")
            linhas.append("-" * 60)
            linhas.append("")

            if callback_log:
                preview = texto[:80] + "..." if len(texto) > 80 else texto
                callback_log(f"   ✅ Sucesso: {preview}")

            transcritos += 1

        except Exception as e:
            if callback_log: callback_log(f"   ❌ Erro em {nome}: {e}")
            linhas.append(f"📁 Arquivo: {nome}\n❌ Erro: {e}\n" + ("-"*60) + "\n")
            falhas += 1

    if callback_progresso: callback_progresso(100, "Finalizado!")

    # Monta texto limpo (só as transcrições, sem cabeçalho de metadata)
    texto_limpo = _montar_texto_limpo(lista_paths, linhas)

    return {
        "total": total,
        "transcritos": transcritos,
        "falhas": falhas,
        "texto_completo": texto_limpo,
        "pasta_origem": os.path.dirname(lista_paths[0]) if lista_paths else "",
    }


def _montar_texto_limpo(lista_paths, linhas_resultado):
    """Extrai apenas o texto de transcrição das linhas, sem metadata."""
    # Pega só os blocos de texto entre os separadores "📁 Arquivo:" e "---"
    blocos = []
    nome_atual = None
    texto_atual = []
    for linha in linhas_resultado:
        if linha.startswith("📁 Arquivo:"):
            if nome_atual and texto_atual:
                blocos.append((nome_atual, "\n".join(texto_atual).strip()))
            nome_atual = linha.replace("📁 Arquivo:", "").strip()
            texto_atual = []
        elif linha.startswith("🕐 Duração:") or linha.startswith("=" * 10) or linha == "":
            continue
        elif linha.startswith("-" * 10):
            continue
        elif nome_atual is not None:
            texto_atual.append(linha)
    if nome_atual and texto_atual:
        blocos.append((nome_atual, "\n".join(texto_atual).strip()))

    if not blocos:
        return ""
    if len(blocos) == 1:
        return blocos[0][1]
    return "\n\n".join(f"=== {nome} ===\n{texto}" for nome, texto in blocos)


def transcrever_arquivo(audio_path, modelo_key="Rápido (small)", idioma="pt",
                        callback_progresso=None, callback_log=None):
    return transcrever_audios([audio_path], modelo_key, idioma, callback_progresso, callback_log)


def transcrever_pasta(pasta, modelo_key="Rápido (small)", idioma="pt",
                      callback_progresso=None, callback_log=None):
    arquivos = [
        os.path.join(pasta, f) for f in sorted(os.listdir(pasta))
        if os.path.isfile(os.path.join(pasta, f))
        and os.path.splitext(f)[1].lower() in FORMATOS_SUPORTADOS
    ]
    if not arquivos:
        if callback_log: callback_log("⚠️ Nenhum áudio encontrado.")
        if callback_progresso: callback_progresso(100, "Vazio")
        return {"total": 0, "transcritos": 0, "falhas": 0, "arquivo_txt": None}
    
    return transcrever_audios(arquivos, modelo_key, idioma, callback_progresso, callback_log)


def formatar_duracao(resultado):
    try:
        segs = resultado.get("segments", [])
        if segs:
            total = segs[-1]["end"]
            m, s = divmod(int(total), 60)
            return f"{m}min {s}s"
    except: pass
    return "desconhecida"
