"""Modelos de IA carregados sob demanda saem da memória quando ficam parados.

Antes, cada um (LaMa, SkySeg, remover fundo, CLIP, reconhecimento de fala, OmniVoice) ficava na RAM/VRAM a sessão
inteira depois do primeiro uso — o OmniVoice sozinho segura vários GB na placa. Agora quem carrega avisa `usado(nome,
liberar)` a cada uso; um vigia libera o que passou `limite` segundos sem uso (padrão 5 min; GPU 3 min). Liberar no meio
de um uso longo é seguro: o código em andamento segura a própria referência; a memória volta quando ele termina.
"""
import gc
import threading
import time

_REG = {}   # nome -> {"liberar": fn, "ultimo": t, "limite": s}
_lock = threading.Lock()
_vigia = {"t": None}
PADRAO, GPU = 300, 180


def usado(nome, liberar, limite=PADRAO):
    with _lock:
        _REG[nome] = {"liberar": liberar, "ultimo": time.monotonic(), "limite": limite}
        if _vigia["t"] is None:
            _vigia["t"] = threading.Thread(target=_vigiar, name="memoria-vigia", daemon=True)
            _vigia["t"].start()


def _soltar(nome, r):
    try:
        r["liberar"]()
    except Exception:
        pass
    gc.collect()
    try:
        import sys
        if "torch" in sys.modules:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    except Exception:
        pass


def _vigiar():
    while True:
        time.sleep(20)
        agora = time.monotonic()
        with _lock:
            vencidos = [(n, r) for n, r in _REG.items() if agora - r["ultimo"] > r["limite"]]
            for n, _ in vencidos:
                del _REG[n]
        for n, r in vencidos:
            _soltar(n, r)


def liberar_tudo():
    """Libera já tudo o que está carregado (ex.: antes de um render pesado na GPU)."""
    with _lock:
        itens = list(_REG.items())
        _REG.clear()
    for n, r in itens:
        _soltar(n, r)
    return [n for n, _ in itens]


def estado():
    agora = time.monotonic()
    with _lock:
        return {n: {"parado_s": round(agora - r["ultimo"]), "limite_s": r["limite"]} for n, r in _REG.items()}
