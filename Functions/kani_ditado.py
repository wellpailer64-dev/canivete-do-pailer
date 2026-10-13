"""
kani_ditado.py — 🎤 no chat da Kani: clica, fala, clica de novo e o texto aparece no campo (para revisar e enviar).
Grava pela entrada padrão (sk_gravar, a mesma do Sound Kanivete) e transcreve com o reconhecimento local das legendas
(legendas.segmentos, modelo "pt"). Nada sai do computador.
"""
import os
import subprocess
import time

_estado = {"wav": None, "t0": 0}


def _wav():
    from Functions import kani_criar
    return os.path.join(kani_criar.pasta(), "_ditado.wav")


def iniciar():
    from Functions import sk_gravar
    w = _wav()
    r = sk_gravar.iniciar(caminho=w, sr=48000, canais=1)
    if not r.get("success"):
        return {"success": False, "error": r.get("error") or "não consegui abrir o microfone"}
    _estado.update(wav=w, t0=time.time())
    return {"success": True}


def nivel():
    from Functions import sk_gravar
    e = sk_gravar.estado()
    return {"pico": e.get("pico", -120), "seg": round(time.time() - _estado["t0"], 1) if _estado["wav"] else 0}


def parar(transcrever=True):
    """Para a gravação e devolve {texto}. transcrever=False só descarta (cancelar)."""
    from Functions import sk_gravar, legendas
    from Functions.midia import ffmpeg
    r = sk_gravar.parar()
    w = r.get("caminho") or _estado["wav"]
    _estado["wav"] = None
    if not transcrever or not w or not os.path.isfile(w):
        return {"success": True, "texto": ""}
    if float(r.get("dur") or 0) < 0.4:
        return {"success": False, "error": "não ouvi nada (fale depois de clicar no microfone)"}
    w16 = w.replace(".wav", "_16k.wav")
    subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", w, "-ac", "1", "-ar", "16000", w16], capture_output=True,
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if not legendas.modelo_pronto("pt"):
        legendas.preparar_modelo("pt")
    partes = [str(getattr(seg, "text", "") or "").strip() for seg, _ in legendas.segmentos(w16, "pt")]
    texto = " ".join(p for p in partes if p).strip()
    for f in (w, w16):
        try:
            os.remove(f)
        except OSError:
            pass
    return {"success": True, "texto": texto} if texto else {"success": False, "error": "não entendi o que foi dito"}
