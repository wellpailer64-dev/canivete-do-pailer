"""Atalho .url para uma pasta/arquivo do Drive (duplo clique abre direto no navegador).

Uso: py -3.13 tools/atalho_drive.py upload|download --etapa RENDER|BRUTOS --nome "NOME" --link URL --pasta DESTINO
Gera: "UPLOAD - RENDER - NOME.url" ou "DOWNLOAD - BRUTOS - NOME.url" em DESTINO.
Ler um atalho: py -3.13 tools/atalho_drive.py ler ARQUIVO.url   (aceita também .txt antigo com o link)
"""
import argparse, os, re, sys

PROIBIDOS = re.compile(r'[<>:"/\|?*\x00-\x1f]')


def criar(tipo, etapa, nome, link, pasta):
    if not re.match(r"https?://", link or ""):
        raise ValueError("link inválido")
    nome = PROIBIDOS.sub("-", nome).strip(" .")
    arq = os.path.join(pasta, f"{tipo.upper()} - {etapa.upper()} - {nome}.url")
    os.makedirs(pasta, exist_ok=True)
    with open(arq, "w", encoding="utf-8", newline="\r\n") as f:
        f.write(f"[InternetShortcut]\nURL={link}\n")
    return arq


def ler(arq):
    txt = open(arq, encoding="utf-8", errors="replace").read()
    m = re.search(r"^URL=(\S+)", txt, re.M) or re.search(r"https?://\S+", txt)
    return (m.group(1) if m and m.lastindex else m.group(0)) if m else None


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) > 2 and sys.argv[1] == "ler":
        print(ler(sys.argv[2]) or "sem link"); sys.exit(0)
    p = argparse.ArgumentParser()
    p.add_argument("tipo", choices=["upload", "download"])
    p.add_argument("--etapa", required=True)
    p.add_argument("--nome", required=True)
    p.add_argument("--link", required=True)
    p.add_argument("--pasta", required=True)
    a = p.parse_args()
    print(criar(a.tipo, a.etapa, a.nome, a.link, a.pasta))
