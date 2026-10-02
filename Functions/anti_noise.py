"""
Anti Noise (efeito de áudio do Editor Kanivete): tira o ruído de fundo com o DeepFilterNet3 (rede neural).

Usa o executável oficial do DeepFilterNet (Rust, modelo embutido, só processador: ~8x mais rápido que o tempo
real), baixado na primeira vez para modelos_ia/deepfilter/. Cada arquivo é limpo UMA vez: o .wav limpo fica no
cache de mídia, no mesmo tempo do som conformado do editor (mesma extração, mesmo número de amostras). A Quantidade
do efeito é só a mistura do limpo com o original — na prévia (editor-audio.js: veAudioAmostra) e na exportação
(video_cutter._pre_antinoise) —, por isso a barra responde na hora.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import threading
import urllib.request

from Functions.midia import NO_WINDOW, ffmpeg, modelo_path

VERSAO = "0.5.6"
URL = (f"https://github.com/Rikorose/DeepFilterNet/releases/download/v{VERSAO}/"
       f"deep-filter-{VERSAO}-x86_64-pc-windows-msvc.exe")
SR = 48000
_trava = threading.Lock()      # um arquivo por vez (o DeepFilterNet já usa todos os núcleos)
_baixando = threading.Lock()


def executavel():
    """Caminho do deep-filter.exe (baixa na primeira vez, ~27 MB)."""
    p = modelo_path("deepfilter", f"deep-filter-{VERSAO}.exe")
    if os.path.isfile(p):
        return p
    with _baixando:
        if os.path.isfile(p):
            return p
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + ".part"
        req = urllib.request.Request(URL, headers={"User-Agent": "Kanivete"})
        with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        os.replace(tmp, p)
    return p


def _rodar(args, erro):
    r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       timeout=7200, creationflags=NO_WINDOW)
    if r.returncode != 0:
        msg = (r.stderr or "").strip().splitlines()
        raise RuntimeError(f"{erro}: {msg[-1] if msg else r.returncode}")


def limpo(path):
    """Caminho do .wav limpo de `path` (vídeo ou áudio), feito uma vez por arquivo+data."""
    from Functions.video_cutter import _midia_dir
    if not os.path.isfile(path):
        raise RuntimeError("Arquivo não encontrado.")
    chave = hashlib.md5(f"{os.path.abspath(path)}|{os.path.getmtime(path)}|{VERSAO}".encode()).hexdigest()[:14]
    saida = os.path.join(_midia_dir(), f"an_{chave}.wav")
    with _trava:
        if os.path.isfile(saida):
            try:
                os.utime(saida)   # usado agora: não entra na limpeza dos antigos
            except OSError:
                pass
            return saida
        exe = executavel()
        work = saida + ".tmp"
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        try:
            # a mesma extração do som conformado (video_cutter.adicionar_audio / _mix_fonte_pronta)
            bruto = os.path.join(work, "som.wav")
            _rodar([ffmpeg(), "-y", "-v", "error", "-i", path, "-map", "0:a:0", "-vn", "-ac", "2", "-ar", str(SR),
                    "-c:a", "pcm_s16le", "-bitexact", "-map_metadata", "-1", bruto], "Não foi possível ler o áudio")
            quadros = (os.path.getsize(bruto) - 44) // 4
            # -D: compensa o atraso do modelo (sai alinhado com o original; termina ~30 ms antes)
            _rodar([exe, "-D", "-o", os.path.join(work, "out"), bruto], "DeepFilterNet falhou")
            tmp = saida + ".part.wav"
            _rodar([ffmpeg(), "-y", "-v", "error", "-i", os.path.join(work, "out", "som.wav"),
                    "-af", f"apad=whole_len={quadros},atrim=end_sample={quadros}", "-c:a", "pcm_s16le", tmp],
                   "Não foi possível gravar o som limpo")
            os.replace(tmp, saida)
        finally:
            shutil.rmtree(work, ignore_errors=True)
    return saida


def preparar(path):
    """API do editor: {success, saida} (o editor conforma o .wav e mistura com o original)."""
    try:
        return {"success": True, "saida": limpo(path)}
    except Exception as e:
        return {"success": False, "error": str(e)}
