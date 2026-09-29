"""
legendas.py — transcrição da timeline do Pocket Editor (painel Texto: Transcrever / Criar legendas)

Escolha do motor (medida neste PC, só processador — ver Instructions/editor-video.md):
  onnx-asr + NVIDIA Parakeet TDT 0.6B (ONNX, roda no onnxruntime que o app já tem; sem PyTorch)
    · Português (Brasil): modelo TAGARELA (Parakeet v3 ajustado em podcasts brasileiros; erro ~1–2% nos testes,
      melhor que o Whisper large-v3 em fala espontânea). Baixado uma vez em precisão total e comprimido aqui
      para int8 (2,4 GB → 640 MB, mesma precisão).
    · Inglês e outras 24 línguas europeias: Parakeet v3 multilíngue int8.
    ~10x o tempo real no processador (Whisper large-v3-turbo int8: 1–2x), pontuação e tempo de cada palavra.
  Silero VAD divide a fala em trechos; silêncio mínimo de 0,6 s para não quebrar frases em respirações.

Entrada: os clipes com som da timeline (a MESMA mixagem da exportação: _grafo_mix), então áudios soltos e trilhas
mudas contam como no vídeo final. Saída: palavras [início, fim, texto] em segundos da timeline.
"""

import os
import shutil
import subprocess
import sys
import threading
import time

from Functions.audio_cutter import ffmpeg_path, _creationflags
from Functions import video_cutter as vc

MODELOS = {
    "pt": {"repo": "alefiury/parakeet-tdt-0.6b-v3-ptBR-TAGARELA-onnx", "tipo": "nemo-conformer-tdt",
           "baixar": ["config.json", "vocab.txt", "nemo128.onnx", "encoder-model.onnx", "encoder-model.onnx.data",
                      "decoder_joint-model.onnx"],
           "comprimir": True, "mb": 2430, "nome": "Português (Brasil)"},
    "multi": {"repo": "istupakov/parakeet-tdt-0.6b-v3-onnx", "tipo": "nemo-parakeet-tdt-0.6b-v3",
              "baixar": ["config.json", "vocab.txt", "nemo128.onnx", "encoder-model.int8.onnx",
                         "decoder_joint-model.int8.onnx"],
              "comprimir": False, "mb": 670, "nome": "Inglês e outras línguas"},
}
VAD = {"repo": "istupakov/silero-vad-onnx", "arquivo": "silero_vad.onnx"}
VAD_OPCOES = {"min_silence_duration_ms": 600, "speech_pad_ms": 150, "max_speech_duration_s": 20}

_cache = {}          # modelos já carregados (carregar leva alguns segundos)
_lock = threading.Lock()


def _pasta_modelos():
    base = os.path.dirname(sys.executable) if hasattr(sys, "_MEIPASS") else \
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    p = os.path.join(base, "modelos_ia", "asr")
    os.makedirs(p, exist_ok=True)
    return p


def _pasta(chave):
    return os.path.join(_pasta_modelos(), chave)


def modelo_pronto(chave):
    p = _pasta(chave)
    return all(os.path.isfile(os.path.join(p, f)) for f in
               ("config.json", "vocab.txt", "encoder-model.int8.onnx", "decoder_joint-model.int8.onnx"))


def modelos_estado():
    return {k: {"pronto": modelo_pronto(k), "mb": 640 if v["comprimir"] else v["mb"], "baixar_mb": v["mb"],
                "nome": v["nome"]} for k, v in MODELOS.items()}


def _baixar(repo, arquivo, destino, on_bytes, stop):
    """Baixa um arquivo do Hugging Face com progresso (bytes) e retomada simples (.parte)."""
    import requests
    from huggingface_hub import hf_hub_url
    if os.path.isfile(destino):
        on_bytes(os.path.getsize(destino))
        return
    parte = destino + ".parte"
    with requests.get(hf_hub_url(repo, arquivo), stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(parte, "wb") as f:
            for bloco in r.iter_content(1 << 20):
                if stop is not None and stop.is_set():
                    raise InterruptedError
                f.write(bloco)
                on_bytes(len(bloco))
    os.replace(parte, destino)


def preparar_modelo(chave, on_prog=None, stop=None):
    """Garante o modelo em modelos_ia/asr/<chave> (baixa na primeira vez; o PT-BR é comprimido para int8)."""
    prog = on_prog or (lambda p, m: None)
    dst = _pasta(chave)
    if modelo_pronto(chave) and os.path.isfile(os.path.join(_pasta_modelos(), VAD["arquivo"])):
        return dst
    cfg = MODELOS[chave]
    tmp = dst + "_baixando"
    os.makedirs(tmp, exist_ok=True)
    os.makedirs(dst, exist_ok=True)
    total = cfg["mb"] * 2 ** 20
    feito = [0]

    def conta(n):
        feito[0] += n
        prog(min(95, int(feito[0] * 100 / total)), f"Baixando o modelo de transcrição ({cfg['nome']})...")

    vad = os.path.join(_pasta_modelos(), VAD["arquivo"])
    _baixar(VAD["repo"], VAD["arquivo"], vad, lambda n: None, stop)
    for f in cfg["baixar"]:
        _baixar(cfg["repo"], f, os.path.join(tmp, f), conta, stop)
    if cfg["comprimir"]:
        # int8 dinâmico: 2,4 GB → 640 MB com a mesma precisão (medido); roda uma vez só
        prog(96, "Otimizando o modelo (uma vez só)...")
        from onnxruntime.quantization import quantize_dynamic, QuantType
        import logging
        logging.getLogger().setLevel(logging.ERROR)
        quantize_dynamic(os.path.join(tmp, "encoder-model.onnx"), os.path.join(dst, "encoder-model.int8.onnx"),
                         weight_type=QuantType.QUInt8)
        quantize_dynamic(os.path.join(tmp, "decoder_joint-model.onnx"),
                         os.path.join(dst, "decoder_joint-model.int8.onnx"), weight_type=QuantType.QUInt8)
        for f in ("config.json", "vocab.txt", "nemo128.onnx"):
            shutil.copy(os.path.join(tmp, f), dst)
    else:
        for f in cfg["baixar"]:
            shutil.move(os.path.join(tmp, f), os.path.join(dst, f))
    shutil.rmtree(tmp, ignore_errors=True)
    prog(100, "Modelo pronto")
    return dst


def _carregar(chave):
    with _lock:
        if chave not in _cache:
            import onnx_asr
            vad = onnx_asr.load_vad("silero", _pasta_modelos())
            m = onnx_asr.load_model(MODELOS[chave]["tipo"], _pasta(chave), quantization="int8")
            _cache[chave] = m.with_vad(vad, **VAD_OPCOES).with_timestamps()
        return _cache[chave]


def _audio_da_timeline(clipes, total, destino):
    """Mixagem da timeline (a mesma conta da exportação) em WAV 16 kHz mono para o reconhecimento."""
    fonte = vc._conf.get("fonte")
    mix = vc._normalizar_mix(clipes, None)
    arquivos = sorted({c[4] for c in mix if c[4]})
    cmd = [ffmpeg_path(), "-y", "-v", "error"]
    entradas = {}
    if fonte and any(c[4] is None for c in mix):
        cmd += ["-i", fonte]
        entradas[None] = f"[{len(entradas)}:a:0]"
    for a in arquivos:
        cmd += ["-i", a]
        entradas[a] = f"[{len(entradas)}:a:0]"
    grafo = ";".join(vc._grafo_mix(mix, total, entradas, "mix"))
    cmd += ["-filter_complex", grafo, "-map", "[mix]", "-ac", "1", "-ar", "16000", destino]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600, creationflags=_creationflags())
    if r.returncode != 0:
        raise RuntimeError((r.stderr or "").strip().splitlines()[-1] if r.stderr else "falha ao preparar o áudio")


def _palavras(seg):
    """Pedaços de palavra (tokens) com tempo → palavras [início, fim, texto] (tempo absoluto no áudio).
    Token que começa com espaço abre palavra; pontuação e sufixos grudam na anterior.
    Ênclise/mesóclise ("lembre-se", "dir-se-ia"): o modelo às vezes manda o hífen com espaço ("lembre", " -se"
    ou "lembre", " -", " se") — o que vem colado a um hífen fica na mesma palavra."""
    out = []
    toks, ts = seg.tokens or [], seg.timestamps or []
    for k, (tok, t) in enumerate(zip(toks, ts)):
        ini = seg.start + t
        txt = tok.strip()
        hifen = out and txt and (txt[0] == "-" or (out[-1][2].endswith("-") and txt[0].isalpha()))
        if (tok.startswith(" ") and not hifen) or not out:
            out.append([ini, None, txt])
        else:
            out[-1][2] += txt
    for k, w in enumerate(out):
        w[1] = out[k + 1][0] if k + 1 < len(out) else seg.end
        # a palavra não "dura" pela pausa seguinte inteira: no máximo ~0,6 s por sílaba longa
        w[1] = round(min(w[1], w[0] + max(0.25, 0.09 * len(w[2]) + 0.35)), 3)
        w[0] = round(w[0], 3)
    return [w for w in out if w[2]]


def transcrever(clipes, total, idioma="pt", on_prog=None, stop=None):
    """Transcreve a timeline. clipes = [[st, s, e, ganho_db, arquivo|None]] (os mesmos da exportação)."""
    prog = on_prog or (lambda p, m: None)
    t0 = time.time()
    chave = "pt" if idioma == "pt" else "multi"
    if not modelo_pronto(chave):
        preparar_modelo(chave, lambda p, m: prog(p, m), stop)
    if stop is not None and stop.is_set():
        return {"success": False, "cancelled": True}
    prog(0, "Preparando o áudio da timeline...")
    wav = os.path.join(vc._work_dir(), "transcricao.wav")
    _audio_da_timeline(clipes, float(total), wav)
    prog(2, "Carregando o modelo...")
    modelo = _carregar(chave)
    palavras, total = [], max(0.1, float(total))
    for seg in modelo.recognize(wav):
        if stop is not None and stop.is_set():
            return {"success": False, "cancelled": True}
        palavras.extend(_palavras(seg))
        prog(min(99, 3 + int(seg.end / total * 96)), "Transcrevendo...")
    vc._apagar(wav)
    return {"success": True, "palavras": palavras, "idioma": idioma, "segundos": round(time.time() - t0, 1)}
