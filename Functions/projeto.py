"""
projeto.py — Projetos do Pocket Editor (.vcnvt = "vídeo canivete")

O arquivo é um JSON pequeno: guarda a timeline (clipes, trilhas, cortes, ganho, propriedades)
e os CAMINHOS do vídeo e das imagens usadas — as mídias não são copiadas para dentro dele.
"""
import json
import os
import sys

EXTENSAO = ".vcnvt"
FORMATO = "vcnvt"
VERSAO = 1
_PROGID = "CaniveteDoPailer.vcnvt"


def com_extensao(path):
    return path if path.lower().endswith(EXTENSAO) else path + EXTENSAO


def salvar(path, dados):
    """Grava o projeto (escrita atômica: nunca deixa um arquivo pela metade)."""
    path = com_extensao(os.path.abspath(path))
    if isinstance(dados, str):
        dados = json.loads(dados)
    dados["formato"] = FORMATO
    dados["versao"] = VERSAO
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
    return path


def abrir(path):
    """Lê o projeto e lista os arquivos referenciados que não existem mais."""
    with open(path, "r", encoding="utf-8") as f:
        dados = json.load(f)
    if dados.get("formato") != FORMATO:
        raise ValueError("Este arquivo não é um projeto do Canivete do Pailer.")
    if int(dados.get("versao", 1)) > VERSAO:
        raise ValueError("Projeto criado numa versão mais nova do Canivete. Atualize o app para abrir.")
    faltando = []
    video = dados.get("video")
    if not video or not os.path.isfile(video):
        faltando.append(video or "(vídeo)")
    for m in dados.get("media") or []:
        if m.get("path") and not os.path.isfile(m["path"]):
            faltando.append(m["path"])
    return dados, faltando


def registrar_associacao():
    """
    Faz o Windows abrir arquivos .vcnvt com o Canivete (duplo clique), só para o usuário atual
    (HKCU, sem pedir administrador). Só no executável; é idempotente e silencioso se falhar.
    """
    if not getattr(sys, "frozen", False) or os.name != "nt":
        return False
    try:
        import winreg
        exe = sys.executable
        icone = os.path.join(os.path.dirname(exe), "_internal", "identidade", "icone.ico")
        if not os.path.isfile(icone):
            icone = exe
        comando = f'"{exe}" "%1"'
        base = r"Software\Classes"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"{base}\{EXTENSAO}") as k:
            atual = winreg.QueryValue(k, None) if _tem_valor(k) else ""
            if atual != _PROGID:
                winreg.SetValue(k, "", winreg.REG_SZ, _PROGID)
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"{base}\{_PROGID}") as k:
            winreg.SetValue(k, "", winreg.REG_SZ, "Projeto do Canivete do Pailer")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"{base}\{_PROGID}\DefaultIcon") as k:
            winreg.SetValue(k, "", winreg.REG_SZ, icone)
        cmd_key = rf"{base}\{_PROGID}\shell\open\command"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, cmd_key) as k:
            antigo = winreg.QueryValue(k, None) if _tem_valor(k) else ""
            if antigo == comando:
                return True
            winreg.SetValue(k, "", winreg.REG_SZ, comando)
        # avisa o Explorer para atualizar ícones/associações
        import ctypes
        ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
        return True
    except Exception:
        return False


def _tem_valor(chave):
    import winreg
    try:
        winreg.QueryValue(chave, None)
        return True
    except OSError:
        return False


def projeto_na_linha_de_comando(argv=None):
    """Caminho do .vcnvt recebido ao abrir o app por duplo clique (ou None)."""
    for a in (argv if argv is not None else sys.argv[1:]):
        if a.lower().endswith(EXTENSAO) and os.path.isfile(a):
            return os.path.abspath(a)
    return None
