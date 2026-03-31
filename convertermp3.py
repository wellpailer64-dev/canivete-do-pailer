"""Conversor de audio com saida configuravel via ffmpeg."""

import os
import sys
import subprocess

FORMATOS_ENTRADA = {
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus",
    ".aiff", ".aif", ".amr", ".ac3", ".webm", ".mka", ".caf"
}

FORMATOS_SAIDA = {
    "MP3": {"ext": ".mp3", "codec": "libmp3lame", "args": ["-b:a", "192k"]},
    "WAV": {"ext": ".wav", "codec": "pcm_s16le", "args": []},
    "FLAC": {"ext": ".flac", "codec": "flac", "args": []},
    "AAC": {"ext": ".aac", "codec": "aac", "args": ["-b:a", "192k"]},
    "M4A": {"ext": ".m4a", "codec": "aac", "args": ["-b:a", "192k"]},
    "OGG": {"ext": ".ogg", "codec": "libvorbis", "args": ["-q:a", "5"]},
    "OPUS": {"ext": ".opus", "codec": "libopus", "args": ["-b:a", "160k"]},
}


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
def _normalizar_saida(formato_saida):
    if not formato_saida:
        return "MP3"
    f = str(formato_saida).strip().upper()
    if f.startswith("."):
        f = f[1:]
    return f if f in FORMATOS_SAIDA else "MP3"


def _nome_saida(path, ext_saida):
    base = os.path.splitext(path)[0]
    destino = base + ext_saida
    if not os.path.exists(destino):
        return destino
    n = 1
    while True:
        destino = f"{base}_convertido_{n}{ext_saida}"
        if not os.path.exists(destino):
            return destino
        n += 1


def converter_arquivo(path, formato_saida="mp3", callback_log=None):
    """
    Converte um único arquivo para MP3.
    Substitui o original após conversão bem-sucedida.
    Retorna True se converteu, False se falhou.
    """
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_ENTRADA:
        if callback_log:
            callback_log(f"⏭️  Ignorado (formato não suportado): {os.path.basename(path)}")
        return False

    cfg = FORMATOS_SAIDA[_normalizar_saida(formato_saida)]
    ext_saida = cfg["ext"]

    if ext == ext_saida:
        if callback_log:
            callback_log(f"⏭️  Já está em {ext_saida.upper()}: {os.path.basename(path)}")
        return False

    saida_path = _nome_saida(path, ext_saida)
    ffmpeg = ffmpeg_path()

    try:
        resultado = subprocess.run(
            [ffmpeg, "-y", "-i", path, "-vn", "-ar", "44100", "-ac", "2",
             "-c:a", cfg["codec"], *cfg["args"], saida_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=120
        )

        if resultado.returncode == 0 and os.path.exists(saida_path):
            if callback_log:
                callback_log(f"✅ Convertido: {os.path.basename(path)} → {os.path.basename(saida_path)}")
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
def converter_pasta(pasta, formato_saida="mp3", callback_progresso=None, callback_log=None):
    """
    Varre uma pasta recursivamente e converte todos os arquivos suportados.
    """
    ext_saida = FORMATOS_SAIDA[_normalizar_saida(formato_saida)]["ext"]
    arquivos = []
    for root, dirs, files in os.walk(pasta):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in FORMATOS_ENTRADA and ext != ext_saida:
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
        sucesso = converter_arquivo(path, formato_saida=formato_saida, callback_log=callback_log)
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
def converter_arquivos(lista_paths, formato_saida="mp3", callback_progresso=None, callback_log=None):
    """
    Converte uma lista específica de arquivos.
    """
    ext_saida = FORMATOS_SAIDA[_normalizar_saida(formato_saida)]["ext"]
    total       = len(lista_paths)
    convertidos = 0
    falhas      = 0

    if callback_log:
        callback_log(f"📥 {total} arquivo(s) selecionado(s) para converter")

    for i, path in enumerate(lista_paths):
        if os.path.splitext(path)[1].lower() == ext_saida:
            if callback_log:
                callback_log(f"⏭️  Já está em {ext_saida.upper()}: {os.path.basename(path)}")
            continue
        sucesso = converter_arquivo(path, formato_saida=formato_saida, callback_log=callback_log)
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
        formato = sys.argv[2] if len(sys.argv) > 2 else "mp3"
        if os.path.isdir(alvo):
            r = converter_pasta(alvo, formato_saida=formato, callback_log=print)
        elif os.path.isfile(alvo):
            r = converter_arquivos([alvo], formato_saida=formato, callback_log=print)
        else:
            print("Caminho inválido.")
            sys.exit(1)

        print("\n🔥 FINALIZADO")
        print(f"  Total     : {r['total']}")
        print(f"  Convertidos: {r['convertidos']}")
        print(f"  Falhas    : {r['falhas']}")
    else:
        print("Uso: python convertermp3.py <pasta_ou_arquivo> [formato_saida]")
