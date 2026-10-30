"""Atalho do KANIVETE pelo código (o Runapp sem console): pythonw + main.py, ícone do app e o AppUserModelID do processo
(main.py), para a janela aberta e o ícone fixado na barra de tarefas serem o mesmo.

Cria no menu Iniciar e na área de trabalho. Com --fixado CAMINHO.lnk, regrava também um atalho já fixado na barra
(User Pinned\\TaskBar), que o Windows 11 não deixa fixar por programa; guarda a cópia em <CAMINHO>.bak.
Rodar: py -3.13 tools/atalho_runapp.py [--fixado "...\\Python 3.13 (64-bit).lnk"]
"""
import os, shutil, sys

import pythoncom
from win32com.propsys import propsys, pscon
from win32com.shell import shell, shellcon

AUMID = "Kanivete.RunApp"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOME = "KANIVETE.lnk"


def gravar(destino):
    pyw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    lnk = pythoncom.CoCreateInstance(shell.CLSID_ShellLink, None, pythoncom.CLSCTX_INPROC_SERVER, shell.IID_IShellLink)
    lnk.SetPath(pyw)
    lnk.SetArguments(f'"{os.path.join(RAIZ, "main.py")}"')
    lnk.SetWorkingDirectory(RAIZ)
    lnk.SetIconLocation(os.path.join(RAIZ, "identidade", "icone.ico"), 0)
    lnk.SetDescription("KANIVETE (pelo código)")
    ps = lnk.QueryInterface(propsys.IID_IPropertyStore)
    ps.SetValue(pscon.PKEY_AppUserModel_ID, propsys.PROPVARIANTType(AUMID))
    ps.Commit()
    lnk.QueryInterface(pythoncom.IID_IPersistFile).Save(destino, 0)
    print("ok:", destino)


if __name__ == "__main__":
    for pasta in (shellcon.CSIDL_PROGRAMS, shellcon.CSIDL_DESKTOPDIRECTORY):
        gravar(os.path.join(shell.SHGetFolderPath(0, pasta, None, 0), NOME))
    if "--fixado" in sys.argv:
        fixado = sys.argv[sys.argv.index("--fixado") + 1]
        shutil.copy2(fixado, fixado + ".bak")
        gravar(fixado)
    shell.SHChangeNotify(shellcon.SHCNE_ASSOCCHANGED, shellcon.SHCNF_IDLIST, None, None)
