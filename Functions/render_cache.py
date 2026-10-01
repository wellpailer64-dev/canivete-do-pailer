"""
Cache de render em disco do Pocket Editor (como os "Preview Files" do Premiere).

Cada trecho da timeline entre pontos de edição que tem efeito/camada/transição pode ser renderizado num
arquivo leve (H.264 sem som, GOP curto). O nome do arquivo é o hash do conteúdo do trecho (calculado no JS):
se o trecho voltar a ser igual (desfazer, mover o trecho inteiro), o arquivo volta a valer sem renderizar de novo.

Pastas:  <base>/Canivete Render Cache/<projeto>-<hash8>/<hash>.mp4
         <base> vem das Preferências (Cache e Disco); padrão %LOCALAPPDATA%/CaniveteDoPailer.

Limpeza (manutencao): apaga arquivos não usados há mais de N dias e, se passar do tamanho máximo, os usados há
mais tempo primeiro. "Usar" = abrir o projeto com o trecho válido ou renderizar (o mtime é atualizado).
"""

import os
import re
import time
import shutil
import hashlib
import threading

PASTA_RAIZ = "Canivete Render Cache"
_EXT = ".mp4"
_HASH_OK = re.compile(r"^[0-9a-z.]{6,80}$")

_lock = threading.Lock()
_stop = None
_proc = None


def base_padrao():
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, "CaniveteDoPailer")


def _raiz(base):
    base = (base or "").strip() or base_padrao()
    return os.path.join(base, PASTA_RAIZ)


def _nome_projeto(chave):
    """Pasta do projeto: nome legível + hash do caminho do projeto (ou da mídia, se ainda não foi salvo)."""
    chave = chave or "sem-projeto"
    nome = os.path.splitext(os.path.basename(chave.rstrip("\\/")))[0] or "projeto"
    nome = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", nome).strip(" .")[:40] or "projeto"
    h = hashlib.sha1(os.path.normcase(os.path.abspath(chave)).encode("utf-8", "replace")).hexdigest()[:8]
    return f"{nome}-{h}"


def pasta_projeto(base, chave, criar=True):
    p = os.path.join(_raiz(base), _nome_projeto(chave))
    if criar:
        os.makedirs(p, exist_ok=True)
    return p


def _tamanho_pasta(p):
    total = 0
    for r, _, fs in os.walk(p):
        for f in fs:
            try:
                total += os.path.getsize(os.path.join(r, f))
            except OSError:
                pass
    return total


def listar(base, chave):
    """Arquivos renderizados do projeto: {hash: {path, url, size}}."""
    from Functions import media_server
    pasta = pasta_projeto(base, chave)
    out = {}
    for f in os.listdir(pasta):
        if not f.endswith(_EXT) or f.endswith(".part" + _EXT):
            continue
        h = f[:-len(_EXT)]
        p = os.path.join(pasta, f)
        try:
            out[h] = {"path": p, "url": media_server.register(p), "size": os.path.getsize(p)}
        except OSError:
            pass
    return {"success": True, "dir": pasta, "files": out}


def tocar(base, chave, hashes):
    """Marca os arquivos como usados agora (a limpeza apaga primeiro os usados há mais tempo)."""
    pasta = pasta_projeto(base, chave, criar=False)
    agora = time.time()
    for h in hashes or []:
        if not _HASH_OK.match(str(h)):
            continue
        p = os.path.join(pasta, str(h) + _EXT)
        try:
            os.utime(p, (agora, agora))
        except OSError:
            pass
    return {"success": True}


def mover_projeto(base, chave_antiga, chave_nova):
    """Projeto salvo pela primeira vez (ou "Salvar como"): leva os renders para a pasta do projeto novo."""
    try:
        a = pasta_projeto(base, chave_antiga, criar=False)
        b = pasta_projeto(base, chave_nova, criar=False)
        if a == b or not os.path.isdir(a):
            return {"success": True}
        os.makedirs(b, exist_ok=True)
        for f in os.listdir(a):
            src, dst = os.path.join(a, f), os.path.join(b, f)
            if f.endswith(_EXT) and not os.path.exists(dst):
                shutil.move(src, dst)
        shutil.rmtree(a, ignore_errors=True)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def renderizar(base, chave, h, job, on_progress):
    """Renderiza um trecho. job = argumentos da exportação (JS: vePrJob). Grava em .part e renomeia no fim."""
    global _stop, _proc
    from Functions.video_cutter import exportar_video
    if not _HASH_OK.match(str(h)):
        return {"success": False, "error": "hash inválido"}
    pasta = pasta_projeto(base, chave)
    final = os.path.join(pasta, h + _EXT)
    if os.path.isfile(final):
        return {"success": True, "path": final, "reuso": True}
    parte = os.path.join(pasta, h + ".part" + _EXT)
    stop = threading.Event()
    with _lock:
        _stop = stop

    def _hold(p):
        global _proc
        _proc = p
        _prioridade_baixa(p)

    try:
        r = exportar_video(
            job["path"], job.get("base") or [], "mp4", "medium", "original", False, None,
            on_progress=lambda p, m: on_progress(p),
            stop_event=stop, sem_audio=True, camadas=job.get("camadas") or [],
            audio_segmentos=None, duracao=job.get("dur"), audio_clipes=None,
            legendas=job.get("legendas"), quadro=job.get("quadro"),
            saida=parte, previa_h=int(job.get("altura") or 1080), proc_holder=_hold,
        )
    finally:
        with _lock:
            _stop = None
    if not r.get("success"):
        _apagar(parte)
        return r
    try:
        os.replace(parte, final)
    except OSError as e:
        _apagar(parte)
        return {"success": False, "error": str(e)}
    from Functions import media_server
    return {"success": True, "path": final, "url": media_server.register(final), "size": os.path.getsize(final)}


_comp_lock = threading.Lock()
_comp_stop = None
_comp_proc = None


def renderizar_comp(base, h, job, on_progress):
    """Comp (editor-comp.js): a timeline de dentro vira um .mov ProRes 4444 com alfa (e o som dela, se tiver).
    Fica em <raiz>/Comps/<hash>.mov — o hash é do conteúdo, então serve a qualquer projeto e desfazer reaproveita.
    A limpeza automática pode apagar: o editor renderiza de novo quando o arquivo some."""
    global _comp_stop, _comp_proc
    from Functions.video_cutter import exportar_video
    from Functions import media_server
    if not _HASH_OK.match(str(h)):
        return {"success": False, "error": "hash inválido"}
    pasta = os.path.join(_raiz(base), "Comps")
    os.makedirs(pasta, exist_ok=True)
    final = os.path.join(pasta, h + ".mov")
    if os.path.isfile(final):
        agora = time.time()
        try:
            os.utime(final, (agora, agora))
        except OSError:
            pass
        return {"success": True, "path": final, "url": media_server.register(final), "reuso": True}
    parte = os.path.join(pasta, h + ".part.mov")
    stop = threading.Event()
    with _comp_lock:
        _comp_stop = stop

    def _hold(p):
        global _comp_proc
        _comp_proc = p
        if p is not None:
            _prioridade_baixa(p)   # em segundo plano enquanto se edita/toca: o play fica com a CPU

    try:
        r = exportar_video(
            job.get("path") or "", job.get("base") or [], "mov", "high", "original", False, None,
            on_progress=lambda p, m: on_progress(p),
            stop_event=stop, sem_audio=not job.get("mix"), camadas=job.get("camadas") or [],
            audio_segmentos=None, duracao=job.get("dur"), audio_clipes=job.get("mix") or [],
            legendas=job.get("legendas"), quadro=job.get("quadro"),
            saida=parte, proc_holder=_hold, alfa=True,
        )
    finally:
        with _comp_lock:
            _comp_stop = None
            _comp_proc = None
    if not r.get("success"):
        _apagar(parte)
        return r
    try:
        os.replace(parte, final)
    except OSError as e:
        _apagar(parte)
        return {"success": False, "error": str(e)}
    return {"success": True, "path": final, "url": media_server.register(final), "size": os.path.getsize(final)}


def cancelar_comp():
    with _comp_lock:
        if _comp_stop is not None:
            _comp_stop.set()
        p = _comp_proc
    if p is not None:
        try:
            p.kill()
        except Exception:
            pass
    return {"success": True}


def _prioridade_baixa(p):
    """Render de prévia em segundo plano: cede a CPU ao editor (play e prévia em tempo real)."""
    try:
        if os.name == "nt":
            import ctypes
            ctypes.windll.kernel32.SetPriorityClass(int(p._handle), 0x00004000)   # BELOW_NORMAL_PRIORITY_CLASS
        else:
            os.setpriority(os.PRIO_PROCESS, p.pid, 10)
    except Exception:
        pass


def cancelar():
    with _lock:
        if _stop is not None:
            _stop.set()
        p = _proc
    if p is not None:
        try:
            p.kill()
        except Exception:
            pass
    return {"success": True}


def limpar(base, chave=None):
    """chave = só o projeto; sem chave = todo o cache em disco. Não apaga o que está renderizando agora."""
    alvo = pasta_projeto(base, chave, criar=False) if chave else _raiz(base)
    antes = _tamanho_pasta(alvo) if os.path.isdir(alvo) else 0
    if os.path.isdir(alvo):
        for r, _, fs in os.walk(alvo):
            for f in fs:
                if f.endswith(".part" + _EXT) and _stop is not None:
                    continue
                _apagar(os.path.join(r, f))
        for r, ds, _ in os.walk(alvo, topdown=False):
            for d in ds:
                try:
                    os.rmdir(os.path.join(r, d))
                except OSError:
                    pass
    return {"success": True, "liberado": antes - (_tamanho_pasta(alvo) if os.path.isdir(alvo) else 0)}


def manutencao(base, max_gb=20, dias=30):
    """Apaga o que não foi usado há mais de `dias` e, acima de `max_gb`, os usados há mais tempo primeiro."""
    raiz = _raiz(base)
    if not os.path.isdir(raiz):
        return {"success": True, "total": 0, "apagados": 0}
    arquivos = []
    for r, _, fs in os.walk(raiz):
        for f in fs:
            p = os.path.join(r, f)
            try:
                st = os.stat(p)
            except OSError:
                continue
            arquivos.append([st.st_mtime, st.st_size, p, f])
    agora, apagados = time.time(), 0
    limite_idade = agora - max(1, float(dias or 30)) * 86400
    restantes = []
    for a in arquivos:
        # .part: sobra de render interrompido (app fechado no meio) com mais de 1 dia
        velho_part = a[3].endswith(".part" + _EXT) and a[0] < agora - 86400
        if a[0] < limite_idade or velho_part:
            _apagar(a[2])
            apagados += 1
        else:
            restantes.append(a)
    total = sum(a[1] for a in restantes)
    teto = max(0.5, float(max_gb or 20)) * 1024 ** 3
    for a in sorted(restantes):
        if total <= teto:
            break
        if a[3].endswith(".part" + _EXT):
            continue
        _apagar(a[2])
        total -= a[1]
        apagados += 1
    for r, ds, _ in os.walk(raiz, topdown=False):
        for d in ds:
            try:
                os.rmdir(os.path.join(r, d))   # só as vazias
            except OSError:
                pass
    return {"success": True, "total": total, "apagados": apagados}


def info(base, chave=None):
    raiz = _raiz(base)
    total = _tamanho_pasta(raiz) if os.path.isdir(raiz) else 0
    proj = 0
    if chave:
        p = pasta_projeto(base, chave, criar=False)
        proj = _tamanho_pasta(p) if os.path.isdir(p) else 0
    alvo = raiz
    while alvo and not os.path.isdir(alvo) and os.path.dirname(alvo) != alvo:
        alvo = os.path.dirname(alvo)
    try:
        livre = shutil.disk_usage(alvo).free
    except OSError:
        livre = None
    return {"success": True, "raiz": raiz, "base": (base or "").strip() or base_padrao(), "padrao": base_padrao(),
            "total": total, "projeto": proj, "livre": livre}


def _apagar(p):
    try:
        if os.path.exists(p):
            os.remove(p)
    except OSError:
        pass
