"""Banco de vozes do Texto para Voz (Sound Kanivete).

Vozes DESENHADAS pelo OmniVoice (Apache-2.0): ninguém foi clonado — cada voz nasce de uma descrição (gênero, idade,
tom, sussurro) + uma semente fixa, falando português. As amostras (~10 s) vêm num pacote do release `vozes-vN`
(pré-release, como o soundboard) e ficam em <app>/vozes_banco/; "Adicionar" cria a voz no OmniVoice a partir da
amostra (texto já conhecido, sem transcrever). Gerar o pacote: py -3.13 tools/montar_banco_vozes.py <pasta>.
"""
import json
import os
import zipfile

from Functions.midia import app_dir

VERSAO = 1
URL = f"https://github.com/wellpailer64-dev/canivete-do-pailer/releases/download/vozes-v{VERSAO}/vozes-v{VERSAO}.zip"

# id, nome, descrição, instruct do OmniVoice, semente
CATALOGO = [
    ("ana", "Ana", "Mulher jovem, tom médio — narração e redes", "female, young adult, moderate pitch", 11),
    ("julia", "Júlia", "Mulher jovem, tom alto — animada, comerciais", "female, young adult, high pitch", 12),
    ("carla", "Carla", "Mulher adulta, tom grave — institucional", "female, middle-aged, low pitch", 13),
    ("marta", "Marta", "Mulher adulta, tom médio — jornalismo", "female, middle-aged, moderate pitch", 14),
    ("lucia", "Dona Lúcia", "Senhora, tom médio — histórias, afeto", "female, elderly, moderate pitch", 15),
    ("bia", "Bia", "Adolescente — personagens, conversa jovem", "female, teenager, high pitch", 16),
    ("lia", "Lia", "Criança — personagem infantil", "female, child", 17),
    ("sofia", "Sofia (sussurro)", "Mulher sussurrando — ASMR, suspense", "female, young adult, whisper", 18),
    ("rafael", "Rafael", "Homem jovem, tom médio — narração e redes", "male, young adult, moderate pitch", 21),
    ("thiago", "Thiago", "Homem jovem, tom grave — tutoriais, podcast", "male, young adult, low pitch", 22),
    ("caio", "Caio", "Homem jovem, tom alto — animado, varejo", "male, young adult, high pitch", 23),
    ("marcos", "Marcos", "Homem adulto, tom grave — locutor, trailer", "male, middle-aged, low pitch", 24),
    ("roberto", "Roberto", "Homem adulto, tom muito grave — voz de rádio", "male, middle-aged, very low pitch", 25),
    ("paulo", "Paulo", "Homem adulto, tom médio — corporativo", "male, middle-aged, moderate pitch", 26),
    ("antonio", "Seu Antônio", "Senhor, tom grave — contos, documentário", "male, elderly, low pitch", 27),
    ("pedro", "Pedro", "Adolescente — personagens, games", "male, teenager, moderate pitch", 28),
    ("lucas", "Lucas", "Criança — personagem infantil", "male, child", 29),
    ("davi", "Davi (sussurro)", "Homem sussurrando — ASMR, suspense", "male, young adult, whisper", 30),
]


def pasta():
    return os.path.join(app_dir(), "vozes_banco")


def instalado():
    return os.path.isfile(os.path.join(pasta(), "banco.json"))


def estado():
    from Functions import media_server
    from Functions.omnivoice_tool import list_voices
    ja = {(v.get("name") or "").strip().lower() for v in list_voices()}
    if not instalado():
        return {"success": True, "instalado": False, "vozes": [{"id": i, "nome": n, "descricao": d} for i, n, d, _, _ in CATALOGO]}
    banco = json.load(open(os.path.join(pasta(), "banco.json"), encoding="utf-8"))
    out = []
    for v in banco["vozes"]:
        arq = os.path.join(pasta(), v["arquivo"])
        out.append({**v, "url": media_server.register(arq) if os.path.isfile(arq) else None, "adicionada": v["nome"].strip().lower() in ja})
    return {"success": True, "instalado": True, "vozes": out}


def baixar(prog=lambda *a: None):
    from Functions.gerador_imagem import _baixar_arquivo
    os.makedirs(pasta(), exist_ok=True)
    z = os.path.join(pasta(), f"vozes-v{VERSAO}.zip")
    _baixar_arquivo(URL, z, lambda f, t: prog(5 + 90 * f / max(1, t), "Baixando o banco de vozes"))
    with zipfile.ZipFile(z) as zz:
        zz.extractall(pasta())
    os.remove(z)
    return estado()


def adicionar(vid, log=None, prog=None):
    """Cria a voz no OmniVoice a partir da amostra (a amostra já é limpa: sem tratamento)."""
    from Functions.omnivoice_tool import create_voice
    banco = json.load(open(os.path.join(pasta(), "banco.json"), encoding="utf-8"))
    v = next((x for x in banco["vozes"] if x["id"] == vid), None)
    if not v:
        raise RuntimeError(f"voz {vid} não está no banco")
    return create_voice(v["nome"], os.path.join(pasta(), v["arquivo"]), v["texto"], {"reference_treatment": False},
                        callback_log=log, callback_progresso=prog)
