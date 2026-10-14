"""
cena3d.py — Cena 3D do Editor Kanivete (frontend/js/editor-3d.js): a página renderiza cada quadro com three.js (o MESMO
motor da prévia) e manda os PNGs em lotes pela caixa de envio do media_server; aqui os lotes vão para o disco e, no fim,
o ffmpeg monta um .mov ProRes 4444 com alfa em <cache de render>/Cenas3D/<hash>.mov (hash do conteúdo da cena: serve a
qualquer projeto e desfazer reaproveita, como as Comps). Lote em disco: 300 quadros 1080p não ficam na memória.
"""
import hashlib, os, re, shutil, subprocess, time

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
    os.makedirs(pasta, exist_ok=True)   # se alguém apagou a pasta (vazia) no meio, ela volta
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


# ── modelos baixados de bancos (Sketchfab, Poly Pizza, CGTrader, TurboSquid...) ──
DIRETOS = (".glb", ".gltf", ".obj")                                # o three.js lê
PELO_BLENDER = (".fbx", ".blend", ".dae", ".stl", ".ply", ".3mf")   # convertidos para .glb no Blender
_EXT_ANEXO = re.compile(r"\.(png|jpe?g|webp|bmp|tga|tiff?|gif|ktx2|dds|bin|mtl)$", re.I)


def _anexos(pasta):
    """Arquivos ao lado do modelo (texturas, .bin, .mtl) em até 3 níveis de subpasta → {nome em minúsculas: URL}.
    O carregador troca qualquer caminho pedido (relativo, absoluto do PC do autor, com caixa errada) pelo nome."""
    achados, n = {}, 0
    base = pasta.count(os.sep)
    for raiz, pastas, nomes in os.walk(pasta):
        if raiz.count(os.sep) - base >= 3:
            pastas[:] = []
        for nome in nomes:
            if _EXT_ANEXO.search(nome) and nome.lower() not in achados:
                achados[nome.lower()] = media_server.register(os.path.join(raiz, nome))
                n += 1
                if n >= 3000:
                    return achados
    return achados


def _mtllibs(caminho):
    """Bibliotecas de material citadas no .obj ("mtllib x.mtl"); sem nenhuma citada, um .mtl de mesmo nome ao lado."""
    libs = []
    with open(caminho, encoding="utf-8", errors="replace") as f:
        for linha in f:
            if linha.startswith("mtllib "):
                libs += [x for x in linha[7:].strip().replace("\\", "/").split("/")[-1:] if x]
    if not libs:
        irmao = os.path.splitext(caminho)[0] + ".mtl"
        if os.path.isfile(irmao):
            libs = [os.path.basename(irmao)]
    return libs


def converter(caminho, base, on_progress=lambda d: None):
    """.fbx/.blend/.dae/.stl/.ply/.3mf → .glb pelo Blender (cache por arquivo + data + tamanho)."""
    from Functions import blender_render
    from Functions.midia import NO_WINDOW
    b = blender_render.exe()
    if not b:
        return {"success": False, "precisa_blender": True, "tamanho_mb": round(blender_render.TAMANHO / 1e6),
                "error": "para abrir esse formato o app usa o Blender, que ainda não foi baixado"}
    st = os.stat(caminho)
    h = hashlib.sha1(f"{os.path.abspath(caminho)}|{st.st_mtime_ns}|{st.st_size}|1".encode()).hexdigest()[:20]
    pasta = os.path.join(_pasta(base), "convertidos"); os.makedirs(pasta, exist_ok=True)
    saida = os.path.join(pasta, h + ".glb")
    if os.path.isfile(saida):
        return {"success": True, "path": saida}
    parte = os.path.join(pasta, h + ".part.glb")
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender_converter.py")
    on_progress({"msg": "Convertendo o modelo no Blender..."})
    p = subprocess.run([b, "-b", "--factory-startup", "-noaudio", "-P", script, "--", caminho, parte], capture_output=True,
                       text=True, encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL, creationflags=NO_WINDOW, timeout=900)
    log = (p.stdout or "").splitlines() + (p.stderr or "").splitlines()
    if p.returncode != 0 or not os.path.isfile(parte) or os.path.getsize(parte) == 0:
        erro = [l for l in log if "Error" in l or "KANIVETE" in l or "Traceback" in l][-4:] or log[-4:]
        return {"success": False, "error": "o Blender não conseguiu converter o modelo: " + " | ".join(erro)}
    os.replace(parte, saida)
    return {"success": True, "path": saida, "faltando": [l.split("faltando", 1)[1].strip() for l in log if "KANIVETE: textura faltando" in l]}


def preparar(caminho, base=None):
    """Modelo do disco → o que o three.js precisa: URL do arquivo, tipo (glb/gltf/obj), os anexos por nome e os .mtl.
    Formatos que o three.js não lê passam pelo Blender (→ .glb)."""
    if not caminho or not os.path.isfile(caminho):
        return {"success": False, "error": "arquivo não encontrado"}
    ext = os.path.splitext(caminho)[1].lower()
    faltando = []
    if ext in PELO_BLENDER:
        r = converter(caminho, base)
        if not r.get("success"):
            return r
        faltando = r.get("faltando") or []
        return {"success": True, "tipo": "glb", "url": media_server.register(r["path"]), "anexos": {}, "mtl": [],
                "convertido": r["path"], "faltando": faltando}
    if ext not in DIRETOS:
        return {"success": False, "error": f"formato {ext} não é modelo 3D"}
    anexos = _anexos(os.path.dirname(os.path.abspath(caminho))) if ext != ".glb" else {}
    libs = _mtllibs(caminho) if ext == ".obj" else []
    mtl = [anexos[n.lower()] for n in libs if n.lower() in anexos]
    faltando = [n for n in libs if n.lower() not in anexos]   # .obj copiado sem o .mtl: fica sem cor/textura do autor
    return {"success": True, "tipo": ext[1:], "url": media_server.register(caminho), "anexos": anexos, "mtl": mtl, "faltando": faltando}
