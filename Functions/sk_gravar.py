"""Sound Kanivete — gravar do microfone (ou interface de áudio) direto num WAV 24 bits.

Um InputStream do sounddevice (PortAudio) por vez. O callback só copia o bloco para uma fila; uma thread grava no
arquivo (o módulo wave reescreve o cabeçalho a cada escrita, então uma queda deixa o WAV válido até ali) e mede o pico.
Sem caminho = só monitorar o nível (aba Gravar aberta). estado() é consultado pela interface ~10x por segundo.
"""
import os
import queue
import threading
import time
import wave

_g = {"st": None, "fila": None, "th": None, "pico": -120.0, "picoMax": -120.0, "quadros": 0, "sr": 48000, "can": 1,
      "caminho": None, "erro": None, "t0": 0.0}
_trava = threading.Lock()


def dispositivos():
    """Entradas de áudio: [{id, nome, canais, sr, api}] — prefere WASAPI/MME (o mesmo aparelho aparece por várias APIs)."""
    import sounddevice as sd
    apis = [a["name"] for a in sd.query_hostapis()]
    out = []
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            out.append({"id": i, "nome": d["name"], "canais": int(d["max_input_channels"]), "sr": int(d["default_samplerate"]),
                        "api": apis[d["hostapi"]]})
    ordem = {"Windows WASAPI": 0, "MME": 1, "Windows DirectSound": 2}
    out.sort(key=lambda d: ordem.get(d["api"], 3))
    try:
        padrao = sd.default.device[0]
    except Exception:
        padrao = None
    return {"success": True, "dispositivos": out, "padrao": padrao}


def _escritor(arq, fila):
    import numpy as np
    w = None
    if arq:
        w = wave.open(arq, "wb")
        w.setnchannels(_g["can"])
        w.setsampwidth(3)
        w.setframerate(_g["sr"])
    while True:
        bloco = fila.get()
        if bloco is None:
            break
        p = float(np.abs(bloco).max()) if bloco.size else 0.0
        db = 20 * np.log10(p) if p > 1e-6 else -120.0
        _g["pico"] = float(db)
        _g["picoMax"] = max(_g["picoMax"], float(db))
        if w:
            i = (np.clip(bloco, -1, 1 - 1 / 8388608) * 8388608).astype("<i4")   # float → 24 bits (3 bytes por amostra)
            w.writeframes(i.view(np.uint8).reshape(-1, 4)[:, :3].tobytes())
            _g["quadros"] += len(bloco)
    if w:
        w.close()


def iniciar(dispositivo=None, caminho=None, sr=48000, canais=1):
    """Abre a entrada; com caminho grava (WAV 24 bits), sem caminho só mede o nível."""
    import sounddevice as sd
    parar()
    with _trava:
        if caminho:
            os.makedirs(os.path.dirname(caminho) or ".", exist_ok=True)
        _g.update(fila=queue.Queue(), pico=-120.0, picoMax=-120.0, quadros=0, sr=int(sr), can=int(canais), caminho=caminho, erro=None)
        fila = _g["fila"]

        def cb(dados, n, t, status):
            fila.put(dados.copy())
        try:
            st = sd.InputStream(device=dispositivo, samplerate=int(sr), channels=int(canais), dtype="float32", blocksize=1024, callback=cb)
        except Exception as e:
            if int(canais) == 2:   # aparelho só mono
                return iniciar(dispositivo, caminho, sr, 1)
            return {"success": False, "error": f"não abriu a entrada: {e}"}
        _g["th"] = threading.Thread(target=_escritor, args=(caminho, fila), daemon=True)
        _g["th"].start()
        st.start()
        _g["st"], _g["t0"] = st, time.time()
    return {"success": True, "gravando": bool(caminho), "sr": _g["sr"], "canais": _g["can"]}


def estado():
    return {"aberto": _g["st"] is not None, "gravando": bool(_g["st"] and _g["caminho"]), "pico": round(_g["pico"], 1),
            "picoMax": round(_g["picoMax"], 1), "seg": _g["quadros"] / _g["sr"] if _g["caminho"] else time.time() - _g["t0"]}


def parar():
    """Fecha a entrada e o arquivo → {caminho, dur} (caminho None se só monitorava)."""
    with _trava:
        st, th, fila = _g["st"], _g["th"], _g["fila"]
        if not st:
            return {"success": True, "caminho": None, "dur": 0}
        try:
            st.stop()
            st.close()
        finally:
            _g["st"] = None
            fila.put(None)
            th.join(10)
        c = _g["caminho"]
        dur = _g["quadros"] / _g["sr"]
        _g["caminho"] = None
        return {"success": True, "caminho": c, "dur": round(dur, 4)}
