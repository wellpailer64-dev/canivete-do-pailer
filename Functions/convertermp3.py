"""Conversor de áudio (e extração de áudio de vídeos) via ffmpeg."""

import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

from Functions.midia import ffmpeg as ffmpeg_path, probe, rodar_ffmpeg, workers

FORMATOS_AUDIO = {
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus",
    ".aiff", ".aif", ".amr", ".ac3", ".mka", ".caf", ".m4b",
}
# Vídeos também entram: o áudio é extraído.
FORMATOS_VIDEO = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".wmv", ".flv", ".mts", ".m2ts",
    ".ts", ".3gp", ".mpg", ".mpeg", ".mxf",
}
FORMATOS_ENTRADA = FORMATOS_AUDIO | FORMATOS_VIDEO

FORMATOS_SAIDA = {
    "MP3": {"ext": ".mp3", "codec": "libmp3lame", "args": ["-b:a", "320k"]},
    "WAV": {"ext": ".wav", "codec": "pcm_s16le", "args": []},
    "FLAC": {"ext": ".flac", "codec": "flac", "args": []},
    "AAC": {"ext": ".aac", "codec": "aac", "args": ["-b:a", "256k"]},
    "M4A": {"ext": ".m4a", "codec": "aac", "args": ["-b:a", "256k"]},
    "OGG": {"ext": ".ogg", "codec": "libvorbis", "args": ["-q:a", "6"]},
    "OPUS": {"ext": ".opus", "codec": "libopus", "args": ["-b:a", "160k"]},
}


def _normalizar_saida(formato_saida):
    f = str(formato_saida or "mp3").strip().upper().lstrip(".")
    return f if f in FORMATOS_SAIDA else "MP3"


def _nome_saida(path, ext_saida):
    base = os.path.splitext(path)[0]
    destino = base + ext_saida
    n = 1
    while os.path.exists(destino):
        destino = f"{base}_convertido_{n}{ext_saida}"
        n += 1
    return destino


def converter_arquivo(path, formato_saida="mp3", callback_log=None, on_progress=None):
    """Converte um arquivo. O original é mantido. Retorna True se converteu."""
    log = callback_log or (lambda m: None)
    nome = os.path.basename(path)
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_ENTRADA:
        log(f"⏭️ Ignorado (formato não suportado): {nome}")
        return False

    cfg = FORMATOS_SAIDA[_normalizar_saida(formato_saida)]
    if ext == cfg["ext"]:
        log(f"⏭️ Já está em {cfg['ext'][1:].upper()}: {nome}")
        return False

    info = probe(path)
    if info and not info.get("audio"):
        log(f"⏭️ Sem faixa de áudio: {nome}")
        return False

    saida = _nome_saida(path, cfg["ext"])
    # MP3 só aceita até 48 kHz; os demais mantêm a taxa original.
    extra = ["-ar", "48000"] if cfg["ext"] == ".mp3" and int((info.get("audio") or {}).get("sample_rate") or 0) > 48000 else []
    ok, erro = rodar_ffmpeg(
        ["-i", path, "-vn", "-map", "0:a:0", "-c:a", cfg["codec"], *cfg["args"], *extra, saida],
        duracao=info.get("duracao", 0), on_progress=on_progress)
    if ok and os.path.exists(saida):
        log(f"✅ {nome} → {os.path.basename(saida)}")
        return True
    if os.path.exists(saida):
        os.remove(saida)
    log(f"❌ Falha em {nome}: {erro.splitlines()[-1] if erro else 'erro desconhecido'}")
    return False


def converter_arquivos(lista_paths, formato_saida="mp3", callback_progresso=None, callback_log=None):
    """Converte vários arquivos em paralelo; progresso combinado de todos."""
    ext_saida = FORMATOS_SAIDA[_normalizar_saida(formato_saida)]["ext"]
    arquivos = [p for p in lista_paths
                if os.path.splitext(p)[1].lower() in FORMATOS_ENTRADA
                and os.path.splitext(p)[1].lower() != ext_saida]
    total = len(arquivos)
    log = callback_log or (lambda m: None)
    log(f"📥 {total} arquivo(s) para converter para {ext_saida[1:].upper()}")
    if not total:
        return {"total": 0, "convertidos": 0, "falhas": 0}

    progresso = [0.0] * total
    lock = threading.Lock()
    resultados = []

    def _emitir():
        if callback_progresso:
            callback_progresso(int(sum(progresso) / total), f"Convertendo... {sum(1 for p in progresso if p >= 100)}/{total}")

    def _um(i):
        def on_p(p):
            with lock:
                progresso[i] = p
                _emitir()
        ok = converter_arquivo(arquivos[i], formato_saida, callback_log=log, on_progress=on_p)
        with lock:
            progresso[i] = 100.0
            resultados.append(ok)
            _emitir()

    with ThreadPoolExecutor(max_workers=workers(4)) as ex:
        list(ex.map(_um, range(total)))

    convertidos = sum(resultados)
    return {"total": total, "convertidos": convertidos, "falhas": total - convertidos}


def converter_pasta(pasta, formato_saida="mp3", callback_progresso=None, callback_log=None):
    """Converte todos os arquivos suportados da pasta (inclui subpastas)."""
    arquivos = []
    for root, _dirs, files in os.walk(pasta):
        arquivos += [os.path.join(root, f) for f in files]
    return converter_arquivos(sorted(arquivos), formato_saida, callback_progresso, callback_log)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        alvo = sys.argv[1]
        formato = sys.argv[2] if len(sys.argv) > 2 else "mp3"
        fn = converter_pasta if os.path.isdir(alvo) else lambda a, *r, **k: converter_arquivos([a], *r, **k)
        print(fn(alvo, formato, callback_log=print))
    else:
        print("Uso: python -m Functions.convertermp3 <pasta_ou_arquivo> [formato_saida]")
