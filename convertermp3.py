"""
convertermp3.py
===============
Converte arquivos de áudio/vídeo para MP3 usando ffmpeg.

Formatos suportados: WAV, OGG, FLAC, AAC, MP4 (e variantes)
Comportamento: substitui o arquivo original pelo MP3 gerado.

Dependências:
  pip install ffmpeg-python
  + ffmpeg instalado no sistema (embutido no .exe via build.bat)
"""

import os
import sys
import subprocess

FORMATOS_SUPORTADOS = {".wav", ".ogg", ".flac", ".aac", ".mp4", ".m4a", ".m4v", ".webm", ".mkv", ".avi", ".mov"}


# =========================
# 🔍 HELPER: localiza ffmpeg
# dentro do .exe ou na pasta
# =========================
def ffmpeg_path():
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, "ffmpeg.exe")
    # Tenta achar na pasta do script
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ffmpeg.exe")
    if os.path.exists(local):
        return local
    # Tenta no PATH do sistema
    return "ffmpeg"


# =========================
# 🎵 CONVERTER UM ARQUIVO
# =========================
def converter_arquivo(path, callback_log=None):
    """
    Converte um único arquivo para MP3.
    Substitui o original após conversão bem-sucedida.
    Retorna True se converteu, False se falhou.
    """
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_SUPORTADOS:
        if callback_log:
            callback_log(f"⏭️  Ignorado (formato não suportado): {os.path.basename(path)}")
        return False

    if ext == ".mp3":
        if callback_log:
            callback_log(f"⏭️  Já é MP3: {os.path.basename(path)}")
        return False

    mp3_path = os.path.splitext(path)[0] + ".mp3"
    ffmpeg   = ffmpeg_path()

    try:
        resultado = subprocess.run(
            [
                ffmpeg, "-y",           # sobrescreve sem perguntar
                "-i", path,             # input
                "-vn",                  # ignora stream de vídeo
                "-ar", "44100",         # sample rate padrão
                "-ac", "2",             # stereo
                "-b:a", "192k",         # bitrate 192kbps
                mp3_path
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=120
        )

        if resultado.returncode == 0 and os.path.exists(mp3_path):
            os.remove(path)  # remove original
            if callback_log:
                callback_log(f"✅ Convertido: {os.path.basename(path)} → {os.path.basename(mp3_path)}")
            return True
        else:
            if callback_log:
                callback_log(f"❌ Falha ao converter: {os.path.basename(path)}")
            return False

    except subprocess.TimeoutExpired:
        if callback_log:
            callback_log(f"⏱️  Timeout: {os.path.basename(path)}")
        return False
    except FileNotFoundError:
        if callback_log:
            callback_log("❌ ffmpeg não encontrado. Verifique a instalação.")
        return False
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro em {os.path.basename(path)}: {e}")
        return False


# =========================
# 📁 CONVERTER PASTA
# =========================
def converter_pasta(pasta, callback_progresso=None, callback_log=None):
    """
    Varre uma pasta recursivamente e converte todos os arquivos suportados.
    """
    arquivos = []
    for root, dirs, files in os.walk(pasta):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in FORMATOS_SUPORTADOS and ext != ".mp3":
                arquivos.append(os.path.join(root, file))

    total      = len(arquivos)
    convertidos = 0
    falhas      = 0

    if callback_log:
        callback_log(f"📥 {total} arquivo(s) encontrado(s) para converter")

    if total == 0:
        if callback_progresso:
            callback_progresso(100, "Nenhum arquivo para converter")
        return {"total": 0, "convertidos": 0, "falhas": 0}

    for i, path in enumerate(arquivos):
        sucesso = converter_arquivo(path, callback_log=callback_log)
        if sucesso:
            convertidos += 1
        else:
            falhas += 1

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Convertendo... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {
        "total":       total,
        "convertidos": convertidos,
        "falhas":      falhas,
    }


# =========================
# 📄 CONVERTER LISTA DE ARQUIVOS
# =========================
def converter_arquivos(lista_paths, callback_progresso=None, callback_log=None):
    """
    Converte uma lista específica de arquivos.
    """
    total       = len(lista_paths)
    convertidos = 0
    falhas      = 0

    if callback_log:
        callback_log(f"📥 {total} arquivo(s) selecionado(s) para converter")

    for i, path in enumerate(lista_paths):
        sucesso = converter_arquivo(path, callback_log=callback_log)
        if sucesso:
            convertidos += 1
        else:
            falhas += 1

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Convertendo... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {
        "total":       total,
        "convertidos": convertidos,
        "falhas":      falhas,
    }


# =========================
# 🖥️ CLI
# =========================
if __name__ == "__main__":
    if len(sys.argv) > 1:
        alvo = sys.argv[1]
        if os.path.isdir(alvo):
            r = converter_pasta(alvo, callback_log=print)
        elif os.path.isfile(alvo):
            r = converter_arquivos([alvo], callback_log=print)
        else:
            print("Caminho inválido.")
            sys.exit(1)

        print("\n🔥 FINALIZADO")
        print(f"  Total     : {r['total']}")
        print(f"  Convertidos: {r['convertidos']}")
        print(f"  Falhas    : {r['falhas']}")
    else:
        print("Uso: python convertermp3.py <pasta_ou_arquivo>")
