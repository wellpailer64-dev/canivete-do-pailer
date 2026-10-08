"""Monitor do Kanivete Encoder: CPU, RAM e placa de vídeo (NVIDIA: uso, encoder, decoder, memória) em tempo real e o
quadro que está sendo exportado (miniatura gravada pelo próprio ffmpeg: video_cutter.saida_miniatura).

A janela do Encoder pergunta ~1×/s (estado()). A placa é lida por UM nvidia-smi que fica rodando com amostra a cada
segundo (abrir um processo por pergunta custava ~100 ms); ele para sozinho 15 s depois da última pergunta.
"""
import os
import subprocess
import threading
import time

try:
    import psutil
except Exception:   # sem psutil: só a placa e a miniatura
    psutil = None

_CAMPOS = "utilization.gpu,utilization.encoder,utilization.decoder,memory.used,memory.total,name"
_trava = threading.Lock()
_gpu = {"dados": None, "proc": None, "ultimo_pedido": 0.0, "sem_nvidia": False}
_url = {"arq": None, "url": None}


def _ler_nvidia(proc):
    for linha in proc.stdout:
        p = [x.strip() for x in linha.split(",")]
        if len(p) >= 6:
            try:
                _gpu["dados"] = {"gpu": float(p[0]), "enc": float(p[1]), "dec": float(p[2]),
                                 "vram": float(p[3]) * 2**20, "vram_total": float(p[4]) * 2**20, "nome": p[5]}
            except ValueError:
                pass
        if time.time() - _gpu["ultimo_pedido"] > 15:
            break
    try:
        proc.kill()
    except Exception:
        pass
    with _trava:
        if _gpu["proc"] is proc:
            _gpu["proc"] = None


def _placa():
    _gpu["ultimo_pedido"] = time.time()
    with _trava:
        if _gpu["proc"] is None and not _gpu["sem_nvidia"]:
            try:
                from Functions.video_cutter import _creationflags
                proc = subprocess.Popen(["nvidia-smi", f"--query-gpu={_CAMPOS}", "--format=csv,noheader,nounits",
                                         "-lms", "1000"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                                        creationflags=_creationflags())
                _gpu["proc"] = proc
                threading.Thread(target=_ler_nvidia, args=(proc,), daemon=True).start()
            except (FileNotFoundError, OSError):
                _gpu["sem_nvidia"] = True   # sem placa NVIDIA (ou sem driver): o monitor mostra só CPU e RAM
    return _gpu["dados"]


def _miniatura():
    from Functions import media_server
    from Functions.video_cutter import arquivo_miniatura
    arq = arquivo_miniatura()
    if not os.path.isfile(arq):
        return None
    if _url["arq"] != arq:
        _url["arq"], _url["url"] = arq, media_server.register(arq)
    return {"url": _url["url"], "t": os.path.getmtime(arq)}


_cpu = {"v": None, "thread": None}


def _amostrar_cpu():
    """CPU medida numa janela de 1 s, numa thread só (cpu_percent(None) depende do intervalo entre chamadas e, chamado
    de vários lugares, devolvia 0); para 15 s depois da última pergunta, junto com o nvidia-smi."""
    while time.time() - _gpu["ultimo_pedido"] < 15:
        try:
            _cpu["v"] = psutil.cpu_percent(interval=1.0)
        except Exception:
            break
    _cpu["thread"] = None


def estado():
    """{cpu, ram, ram_total, gpu, enc, dec, vram, vram_total, placa, quadro: {url, t}} — o que não der para ler fica None."""
    r = {"cpu": None, "ram": None, "ram_total": None}
    if psutil is not None:
        try:
            _gpu["ultimo_pedido"] = time.time()
            with _trava:
                if _cpu["thread"] is None:
                    _cpu["thread"] = threading.Thread(target=_amostrar_cpu, daemon=True)
                    _cpu["thread"].start()
            r["cpu"] = _cpu["v"]
            m = psutil.virtual_memory()
            r["ram"], r["ram_total"] = m.total - m.available, m.total
        except Exception:
            pass
    g = _placa() or {}
    r.update(gpu=g.get("gpu"), enc=g.get("enc"), dec=g.get("dec"), vram=g.get("vram"), vram_total=g.get("vram_total"),
             placa=g.get("nome"))
    try:
        r["quadro"] = _miniatura()
    except Exception:
        r["quadro"] = None
    return r
