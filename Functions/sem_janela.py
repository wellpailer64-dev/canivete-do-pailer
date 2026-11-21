"""sem_janela.py — nenhum subprocesso do app abre janela de CMD.

Em Windows, um processo-filho de console (ffmpeg, nvidia-smi, powershell, python...) chamado sem CREATE_NO_WINDOW
pisca ou mantém uma janela preta junto do app. Em vez de depender de cada módulo lembrar da flag (31 não lembravam),
esta trava global soma CREATE_NO_WINDOW em todo subprocess.Popen/run/check_output do processo. Quem pediu console
de propósito (CREATE_NEW_CONSOLE) ou desanexou (DETACHED_PROCESS) continua como pediu.
"""
import subprocess
import sys

CREATE_NO_WINDOW = 0x08000000
_CREATE_NEW_CONSOLE = 0x00000010
_DETACHED_PROCESS = 0x00000008
_instalado = False


def instalar():
    global _instalado
    if _instalado or sys.platform != "win32":
        return
    original = subprocess.Popen.__init__

    def __init__(self, *args, **kw):
        flags = kw.get("creationflags", 0) or 0
        if len(args) > 13:   # creationflags posicional: não mexe
            return original(self, *args, **kw)
        if not flags & (_CREATE_NEW_CONSOLE | _DETACHED_PROCESS):
            kw["creationflags"] = flags | CREATE_NO_WINDOW
        original(self, *args, **kw)

    subprocess.Popen.__init__ = __init__
    _instalado = True
