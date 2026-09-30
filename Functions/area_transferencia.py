"""
area_transferencia.py — o que foi copiado no Windows, para o Ctrl+V da timeline do Pocket Editor.

Arquivos copiados no Explorer (vídeo, áudio, imagem), imagem copiada (print, imagem do navegador: vira PNG numa pasta
"Colados") ou texto. `seq` é o contador do Windows que muda a cada cópia: a página compara com o do momento do
Ctrl+C interno para saber qual das duas cópias é a mais nova.
"""
import ctypes
import os
import time

CF_UNICODETEXT = 13
_ultima_imagem = (None, None)   # (seq, caminho): o mesmo print colado duas vezes não vira dois arquivos


def sequencia():
    try:
        return int(ctypes.windll.user32.GetClipboardSequenceNumber())
    except Exception:
        return 0


def _texto():
    u, k = ctypes.windll.user32, ctypes.windll.kernel32
    u.GetClipboardData.restype = ctypes.c_void_p
    k.GlobalLock.restype = ctypes.c_void_p
    k.GlobalLock.argtypes = [ctypes.c_void_p]
    k.GlobalUnlock.argtypes = [ctypes.c_void_p]
    if not u.IsClipboardFormatAvailable(CF_UNICODETEXT):
        return ""
    for _ in range(10):   # outro programa pode estar com a área aberta
        if u.OpenClipboard(None):
            break
        time.sleep(0.03)
    else:
        return ""
    try:
        h = u.GetClipboardData(CF_UNICODETEXT)
        if not h:
            return ""
        p = k.GlobalLock(h)
        try:
            return ctypes.wstring_at(p) if p else ""
        finally:
            k.GlobalUnlock(h)
    finally:
        u.CloseClipboard()


def _pasta_colados(projeto):
    if projeto and os.path.isdir(os.path.dirname(projeto)):
        return os.path.join(os.path.dirname(projeto), "Colados")
    return os.path.join(os.path.expanduser("~"), "Pictures", "Canivete - Colados")


def ler(projeto=""):
    """{success, seq, tipo: 'arquivos'|'imagem'|'texto'|None, paths?, texto?}"""
    global _ultima_imagem
    seq = sequencia()
    try:
        from PIL import ImageGrab
        dado = ImageGrab.grabclipboard()
    except Exception:
        dado = None
    if isinstance(dado, list):
        arqs = [p for p in dado if isinstance(p, str) and os.path.isfile(p)]
        if arqs:
            return {"success": True, "seq": seq, "tipo": "arquivos", "paths": arqs}
    elif dado is not None:
        if _ultima_imagem[0] == seq and _ultima_imagem[1] and os.path.isfile(_ultima_imagem[1]):
            return {"success": True, "seq": seq, "tipo": "imagem", "paths": [_ultima_imagem[1]]}
        try:
            pasta = _pasta_colados(projeto)
            os.makedirs(pasta, exist_ok=True)
            path = os.path.join(pasta, time.strftime("colado_%Y%m%d_%H%M%S") + ".png")
            n = 1
            while os.path.exists(path):
                path = os.path.join(pasta, time.strftime("colado_%Y%m%d_%H%M%S") + f"_{n}.png")
                n += 1
            dado.save(path, "PNG")
            _ultima_imagem = (seq, path)
            return {"success": True, "seq": seq, "tipo": "imagem", "paths": [path]}
        except Exception as e:
            return {"success": False, "seq": seq, "error": f"Não foi possível salvar a imagem colada: {e}"}
    try:
        txt = _texto().strip()
    except Exception:
        txt = ""
    if txt:
        return {"success": True, "seq": seq, "tipo": "texto", "texto": txt[:2000]}
    return {"success": True, "seq": seq, "tipo": None}
