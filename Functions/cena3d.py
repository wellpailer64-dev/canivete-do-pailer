"""
cena3d.py — Cena 3D do Editor Kanivete (frontend/js/editor-3d.js): a página renderiza cada quadro com three.js (o MESMO
motor da prévia) e manda os PNGs em lotes pela caixa de envio do media_server; aqui os lotes vão para o disco e, no fim,
o ffmpeg monta um .mov ProRes 4444 com alfa em <cache de render>/Cenas3D/<hash>.mov (hash do conteúdo da cena: serve a
qualquer projeto e desfazer reaproveita, como as Comps). Lote em disco: 300 quadros 1080p não ficam na memória.
"""
import os, shutil, time

from Functions import media_server, render_cache
from Functions.midia import rodar_ffmpeg


def _pasta(base):
    p = os.path.join(render_cache._raiz(base), "Cenas3D"); os.makedirs(p, exist_ok=True); return p


def inicio(base, h):
    """Já renderizada (mesmo hash): devolve o arquivo. Senão abre a caixa de envio e a pasta temporária dos quadros."""
    if not render_cache._HASH_OK.match(str(h)):
        return {"success": False, "error": "hash inválido"}
    final = os.path.join(_pasta(base), h + ".mov")
    if os.path.isfile(final):
        return {"success": True, "pronto": True, "path": final, "url": media_server.register(final)}
    # pasta POR SESSÃO: a prévia renderizada e a exportação podiam desenhar a mesma camada juntas e a segunda apagava
    # a pasta da primeira no meio (FileNotFoundError q00000.png no lote — intro Carlinhos, 2026-10-12)
    sessao, url = media_server.abrir_envio()
    tmp = os.path.join(_pasta(base), f"{h}.{sessao}.quadros")
    shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp, exist_ok=True)
    return {"success": True, "pronto": False, "sessao": sessao, "url": url, "pasta": tmp}


def lote(sessao, pasta):
    """Grava no disco os quadros que chegaram e deixa a caixa aberta para o próximo lote."""
    arquivos = media_server.fechar_envio(sessao)
    for nome, dados in arquivos.items():
        if not nome.endswith(".png") or "/" in nome or "\\" in nome:
            continue
        with open(os.path.join(pasta, nome), "wb") as f:
            f.write(dados)
    with media_server._lock:
        media_server._envios[sessao] = {}
    return {"success": True, "gravados": len(arquivos)}


def fim(base, h, sessao, pasta, fps, n, on_progress=lambda p: None):
    """Quadros q00000.png... → ProRes 4444 com alfa (yuva444p10le). Apaga a pasta dos quadros."""
    lote(sessao, pasta); media_server.fechar_envio(sessao)
    faltam = [i for i in range(int(n)) if not os.path.isfile(os.path.join(pasta, f"q{i:05d}.png"))]
    if faltam:
        return {"success": False, "error": f"faltaram {len(faltam)} quadro(s) (ex.: {faltam[:3]})"}
    final = os.path.join(_pasta(base), h + ".mov"); parte = os.path.join(_pasta(base), f"{h}.{sessao}.part.mov")
    args = ["-framerate", str(fps), "-i", os.path.join(pasta, "q%05d.png"),
            "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0", parte]
    ok, erros = rodar_ffmpeg(args, duracao=int(n) / float(fps), on_progress=on_progress)
    ok = ok and os.path.isfile(parte) and os.path.getsize(parte) > 0
    shutil.rmtree(pasta, ignore_errors=True)
    if not ok:
        return {"success": False, "error": "o ffmpeg não montou o vídeo da cena 3D: " + " | ".join((erros or [])[-3:])}
    # o antivírus/indexador às vezes segura o arquivo recém-gravado por um instante: tenta de novo
    for n in range(30):
        try:
            os.replace(parte, final)
            break
        except PermissionError:
            if n == 29:
                raise
            time.sleep(0.25)
    return {"success": True, "path": final, "url": media_server.register(final)}


def pasta_vetor(base):
    """Pasta dos rótulos/artes dos objetos 3D que vêm do Vetor (enviar_editor_3d): fica com o cache de render."""
    p = os.path.join(_pasta(base), "vetor"); os.makedirs(p, exist_ok=True)
    return {"success": True, "pasta": p}


def url(caminho):
    """Modelo 3D (.glb/.gltf/.obj) do disco → URL do servidor local (o three.js carrega por URL)."""
    if not caminho or not os.path.isfile(caminho):
        return {"success": False, "error": "arquivo não encontrado"}
    return {"success": True, "url": media_server.register(caminho), "nome": os.path.basename(caminho)}
