"""
projeto.py — Projetos do KANIVETE: .vknv = editor de vídeo (Pocket Editor), .iknv = editor de imagem.
Os .vcnvt (nome antigo do projeto de vídeo) continuam abrindo; salvar um deles grava um .vknv ao lado.

O arquivo é um JSON pequeno: guarda a timeline (clipes, trilhas, cortes, ganho, propriedades)
e os CAMINHOS do vídeo e das imagens usadas — as mídias não são copiadas para dentro dele.
"""
import json
import os
import sys

EXTENSAO = ".vknv"                      # projeto do editor de vídeo
EXTENSOES_VIDEO = (".vknv", ".vcnvt")   # .vcnvt = nome antigo (abre; salvar grava um .vknv ao lado)
EXTENSAO_IMAGEM = ".iknv"               # projeto do editor de imagem (Functions/editor_imagem.py)
EXTENSAO_VETOR = ".aknv"                # documento do Vetor Kanivete (Functions/vetor_kanivete.py)
EXTENSAO_SOM = ".sknv"                  # projeto do Sound Kanivete (Functions/sound_kanivete.py)
EXTENSAO_LUX = ".lknv"                  # projeto da Lux Kanivete (Functions/lux_projeto.py)
EXTENSAO_SLIDER = ".dknv"               # apresentação do Slider Kanivete (Functions/slider_kanivete.py)
FORMATO = "vknv"
FORMATOS_ACEITOS = ("vknv", "vcnvt")
VERSAO = 1
# tipo do arquivo no Windows (o ProgId antigo do .vcnvt continua valendo para os arquivos velhos) e o ícone de cada um:
# o logo da ferramenta (identidade/arquivos/<logo>.ico, gerado por tools/icones_arquivos.py)
_TIPOS = {".vknv": ("CaniveteDoPailer.vknv", "Projeto do Vídeo Kanivete", "vd"),
          ".vcnvt": ("CaniveteDoPailer.vcnvt", "Projeto do Vídeo Kanivete (antigo)", "vd"),
          ".iknv": ("CaniveteDoPailer.iknv", "Projeto do Photo Kanivete", "pk"),
          ".aknv": ("CaniveteDoPailer.aknv", "Documento do Vetor Kanivete", "vk"),
          ".sknv": ("CaniveteDoPailer.sknv", "Projeto do Sound Kanivete", "sk"),
          ".lknv": ("CaniveteDoPailer.lknv", "Projeto da Lux Kanivete", "lk"),
          ".dknv": ("CaniveteDoPailer.dknv", "Apresentação do Slider Kanivete", "sd")}


def com_extensao(path):
    """Caminho com .vknv (um .vcnvt antigo vira .vknv com o mesmo nome, ao lado)."""
    base, ext = os.path.splitext(path)
    if ext.lower() == ".vcnvt":
        return base + EXTENSAO
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
    if dados.get("formato") not in FORMATOS_ACEITOS:
        raise ValueError("Este arquivo não é um projeto de vídeo do KANIVETE.")
    if int(dados.get("versao", 1)) > VERSAO:
        raise ValueError("Projeto criado numa versão mais nova do KANIVETE. Atualize o app para abrir.")
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
    Faz o Windows abrir .vknv, .iknv, .aknv (e os .vcnvt antigos) com o KANIVETE (duplo clique), só para o usuário atual
    (HKCU, sem pedir administrador). Só no executável; é idempotente e silencioso se falhar.
    """
    if not getattr(sys, "frozen", False) or os.name != "nt":
        return False
    try:
        import winreg
        exe = sys.executable
        ident = os.path.join(os.path.dirname(exe), "_internal", "identidade")
        geral = os.path.join(ident, "icone.ico")
        if not os.path.isfile(geral):
            geral = exe
        comando = f'"{exe}" "%1"'
        base = r"Software\Classes"
        mudou = False
        for ext, (progid, descricao, logo) in _TIPOS.items():
            icone = os.path.join(ident, "arquivos", logo + ".ico")
            if not os.path.isfile(icone):
                icone = geral
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"{base}\{ext}") as k:
                atual = winreg.QueryValue(k, None) if _tem_valor(k) else ""
                if atual != progid:
                    winreg.SetValue(k, "", winreg.REG_SZ, progid)
                    mudou = True
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"{base}\{progid}") as k:
                winreg.SetValue(k, "", winreg.REG_SZ, descricao)
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"{base}\{progid}\DefaultIcon") as k:
                if (winreg.QueryValue(k, None) if _tem_valor(k) else "") != icone:
                    winreg.SetValue(k, "", winreg.REG_SZ, icone)
                    mudou = True   # ícone novo: o Explorer precisa redesenhar
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"{base}\{progid}\shell\open\command") as k:
                antigo = winreg.QueryValue(k, None) if _tem_valor(k) else ""
                if antigo != comando:
                    winreg.SetValue(k, "", winreg.REG_SZ, comando)
                    mudou = True
        if mudou:   # avisa o Explorer para atualizar ícones/associações
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
    """Caminho do projeto (.vknv, .vcnvt, .iknv ou .aknv) recebido ao abrir o app por duplo clique (ou None)."""
    for a in (argv if argv is not None else sys.argv[1:]):
        if a.lower().endswith(EXTENSOES_VIDEO + (EXTENSAO_IMAGEM, EXTENSAO_VETOR, EXTENSAO_SOM, EXTENSAO_LUX, EXTENSAO_SLIDER)) and os.path.isfile(a):
            return os.path.abspath(a)
    return None
