"""Modelos de IA carregados sob demanda saem da memória quando ficam parados.

Antes, cada um (LaMa, SkySeg, remover fundo, CLIP, reconhecimento de fala, OmniVoice) ficava na RAM/VRAM a sessão
inteira depois do primeiro uso — o OmniVoice sozinho segura vários GB na placa. Agora quem carrega avisa `usado(nome,
liberar)` a cada uso; um vigia libera o que passou `limite` segundos sem uso (padrão 5 min; GPU 3 min). Liberar no meio
de um uso longo é seguro: o código em andamento segura a própria referência; a memória volta quando ele termina.

Núcleo de hardware (Functions/hardware.py): o limite vem multiplicado pelo plano do PC (leve = 1/5: 1 min em vez de
5; médio = 0,6; forte = 1) e, em qualquer PC, se a RAM livre cair abaixo de APERTO (10% ou 1,2 GB), o que está parado há
mais de 20 s sai na hora — o PC de 8 GB com o editor aberto não começa a paginar por causa de um modelo esquecido.
"""
import gc
import threading
import time

_REG = {}   # nome -> {"liberar": fn, "ultimo": t, "limite": s}
_lock = threading.Lock()
_vigia = {"t": None}
PADRAO, GPU = 300, 180
APERTO_FRACAO, APERTO_GB, PARADO_MIN = 0.10, 1.2, 20


def _fator():
    try:
        from Functions import hardware
        return hardware.plano()["soltar_modelo_s"] / PADRAO
    except Exception:
        return 1.0


def _ram_apertada():
    try:
        import psutil
        vm = psutil.virtual_memory()
        return vm.available < max(APERTO_GB * 2**30, vm.total * APERTO_FRACAO)
    except Exception:
        return False


def usado(nome, liberar, limite=PADRAO):
    with _lock:
        _REG[nome] = {"liberar": liberar, "ultimo": time.monotonic(), "limite": max(PARADO_MIN, limite * _fator())}
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
        apertada = _ram_apertada()
        with _lock:
            vencidos = [(n, r) for n, r in _REG.items()
                        if agora - r["ultimo"] > (PARADO_MIN if apertada else r["limite"])]
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
