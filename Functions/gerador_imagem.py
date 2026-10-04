"""
gerador_imagem.py — Gerar imagem com IA no Photo Kanivete (texto → imagem e edição com imagens de referência).

Motor: stable-diffusion.cpp (sd-server.exe, sem Python/torch) com FLUX.2 [klein] 4B em GGUF (Apache 2.0):
modelo de difusão Q8_0 (~4,3 GB) + Qwen3-4B Q4_K_M lendo o prompt (~2,5 GB) + VAE do FLUX.2 (~0,3 GB).
Nada disso vem no build: é baixado na primeira vez (Arquivo > Gerar imagem) para <app>/modelos_ia/gerador_imagem/.
Placa: build Vulkan (30 MB, NVIDIA/AMD/Intel; na RTX 3050 empatou com o CUDA de 1,1 GB: ~20 s por 1024², 4 passos);
`--offload-to-cpu` + `--vae-tiling` cabem em 8 GB de VRAM (o VAE inteiro em 1024² pede ~10 GB).

O servidor sobe na 1ª geração (carrega o modelo uma vez), atende pela API nativa assíncrona (/sdcpp/v1/img_gen +
consulta do job) e sai sozinho depois de OCIOSO segundos parado, devolvendo a memória da placa.
Mesmo pedido (prompt, tamanho, semente, referências) = mesma imagem: guardada em cache no disco, uma receita refeita
não gera de novo.
"""
import base64
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
import zipfile

from Functions.midia import NO_WINDOW, app_dir

SD_TAG = "master-929-3f8527a"
_GH = f"https://github.com/leejet/stable-diffusion.cpp/releases/download/{SD_TAG}/"
_HF = "https://huggingface.co/"
MOTOR_ZIP = {"vulkan": [_GH + "sd-master-3f8527a-bin-win-vulkan-x64.zip"]}
MODELOS = [
    # (arquivo, url, bytes aproximados — para a barra de progresso antes do Content-Length)
    ("flux-2-klein-4b-Q8_0.gguf", _HF + "leejet/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q8_0.gguf", 4_300_000_000),
    ("qwen3-4b-Q4_K_M.gguf", _HF + "unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf", 2_500_000_000),
    ("flux2_vae.safetensors", _HF + "Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors", 336_213_556),
]
OCIOSO = 300          # segundos sem gerar até soltar a placa
PASSOS = 4            # klein é destilado: 4 passos, guidance 1
LADO_MAX = 2048

_baixando = threading.Lock()
_srv_lock = threading.Lock()
_srv = {"proc": None, "porta": 0, "uso": 0.0, "log": [], "passo": None, "motor": None}
_estado_dl = {"pct": 0, "msg": ""}


def pasta():
    return os.path.join(app_dir(), "modelos_ia", "gerador_imagem")


def _bin(motor="vulkan"):
    return os.path.join(pasta(), "bin", motor, "sd-server.exe")


def _modelo(nome):
    return os.path.join(pasta(), "modelos", nome)


def _cache_dir():
    return os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "CaniveteDoPailer", "cache_gerador")


def _motor():
    return "vulkan"


def instalado():
    return os.path.isfile(_bin(_motor())) and all(os.path.isfile(_modelo(n)) for n, _, _ in MODELOS)


def estado():
    p = _srv["proc"]
    srv = "parado" if not p or p.poll() is not None else ("pronto" if _srv["porta"] and _srv.get("ok") else "carregando")
    return {"success": True, "instalado": instalado(), "baixando": _baixando.locked(), **_estado_dl,
            "servidor": srv, "motor": _motor(), "tamanho_gb": round(sum(t for _, _, t in MODELOS) / 1e9 + 0.03, 1),
            "pasta": pasta()}


# ───────────────────────── instalação (download com retomada) ─────────────────────────

def _baixar_arquivo(url, destino, on_bytes):
    """Baixa para destino.part (retoma de onde parou) e renomeia no fim."""
    parte = destino + ".part"
    feito = os.path.getsize(parte) if os.path.exists(parte) else 0
    req = urllib.request.Request(url, headers={"User-Agent": "CaniveteDoPailer", **({"Range": f"bytes={feito}-"} if feito else {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        if feito and r.status != 206:   # servidor não retoma: recomeça
            feito = 0
        total = feito + int(r.headers.get("Content-Length") or 0)
        with open(parte, "ab" if feito else "wb") as f:
            while True:
                bloco = r.read(1024 * 1024)
                if not bloco:
                    break
                f.write(bloco)
                feito += len(bloco)
                on_bytes(feito, total)
    os.replace(parte, destino)


def baixar(on_progress):
    """Baixa motor + modelos em segundo plano. on_progress({pct, msg}) / {fim: True} / {erro}."""
    if not _baixando.acquire(blocking=False):
        return {"success": False, "error": "Já está baixando."}

    def run():
        try:
            os.makedirs(os.path.join(pasta(), "modelos"), exist_ok=True)
            os.makedirs(os.path.join(pasta(), "bin"), exist_ok=True)
            itens = [(os.path.join(pasta(), "bin", os.path.basename(u)), u, 30_000_000) for u in MOTOR_ZIP[_motor()]]
            itens += [(_modelo(n), u, t) for n, u, t in MODELOS]
            total = sum(t for _, _, t in itens)
            antes = 0
            for destino, url, tam in itens:
                if not os.path.isfile(destino) and not (destino.endswith(".zip") and os.path.isfile(_bin(_motor()))):
                    nome = os.path.basename(destino)

                    def prog(feito, tot, nome=nome, antes=antes):
                        pct = min(99, int((antes + feito) * 100 / total))
                        _estado_dl.update(pct=pct, msg=f"Baixando {nome}: {feito / 1e9:.2f} / {max(tot, feito) / 1e9:.2f} GB")
                        on_progress(dict(_estado_dl))
                    _baixar_arquivo(url, destino, prog)
                if destino.endswith(".zip") and os.path.isfile(destino):
                    with zipfile.ZipFile(destino) as zf:
                        zf.extractall(os.path.join(pasta(), "bin", _motor()))
                    os.remove(destino)
                antes += tam
            if not instalado():
                raise RuntimeError("arquivos incompletos")
            _estado_dl.update(pct=100, msg="Pronto")
            on_progress({"fim": True})
        except Exception as e:
            _estado_dl.update(msg=f"Erro: {e}")
            on_progress({"erro": f"Não foi possível baixar o gerador: {e}"})
        finally:
            _baixando.release()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ───────────────────────── servidor ─────────────────────────

def _porta_livre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _http(metodo, caminho, corpo=None, timeout=30):
    data = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:{_srv['porta']}{caminho}", data=data, method=metodo,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


_job = None


def _amarrar(proc):
    """Job do Windows com KILL_ON_JOB_CLOSE: se o app fechar (até de repente), o servidor fecha junto."""
    global _job
    try:
        import ctypes
        from ctypes import wintypes
        k = ctypes.windll.kernel32
        k.CreateJobObjectW.restype = wintypes.HANDLE
        k.OpenProcess.restype = wintypes.HANDLE
        if not _job:
            _job = k.CreateJobObjectW(None, None)

            class _Info(ctypes.Structure):
                _fields_ = [("a", ctypes.c_int64), ("b", ctypes.c_int64), ("LimitFlags", wintypes.DWORD),
                            ("c", ctypes.c_size_t), ("d", ctypes.c_size_t), ("e", wintypes.DWORD), ("f", ctypes.c_size_t),
                            ("g", wintypes.DWORD), ("h", wintypes.DWORD), ("io", ctypes.c_uint64 * 6),
                            ("i", ctypes.c_size_t), ("j", ctypes.c_size_t), ("k", ctypes.c_size_t), ("l", ctypes.c_size_t)]
            info = _Info(LimitFlags=0x2000)   # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            k.SetInformationJobObject(wintypes.HANDLE(_job), 9, ctypes.byref(info), ctypes.sizeof(info))
        h = k.OpenProcess(0x0101, False, proc.pid)   # PROCESS_SET_QUOTA | PROCESS_TERMINATE
        k.AssignProcessToJobObject(wintypes.HANDLE(_job), wintypes.HANDLE(h))
        k.CloseHandle(wintypes.HANDLE(h))
    except Exception:
        pass


def _ler_saida(proc):
    """Guarda as últimas linhas do servidor e o passo da amostragem (para a barra de progresso)."""
    for linha in iter(proc.stdout.readline, ""):
        linha = linha.rstrip()
        if not linha:
            continue
        _srv["log"] = (_srv["log"] + [linha])[-60:]
        m = re.search(r"\|\s*(\d+)/(\d+)\s*-", linha) or re.search(r"\b(\d+)/(\d+)\b.*(s/it|it/s)", linha)
        if m:
            _srv["passo"] = (int(m.group(1)), int(m.group(2)))


def _vigiar_ocioso():
    while True:
        time.sleep(15)
        p = _srv["proc"]
        if not p or p.poll() is not None:
            return
        if not _srv.get("ocupado") and time.time() - _srv["uso"] > OCIOSO:
            parar()
            return


def _subir(on_progress):
    with _srv_lock:
        p = _srv["proc"]
        if p and p.poll() is None and _srv.get("ok"):
            return
        if p and p.poll() is None:
            p.kill()
        if not instalado():
            raise RuntimeError("Gerador não instalado: baixe em Arquivo > Gerar imagem.")
        _srv.update(porta=_porta_livre(), ok=False, log=[], passo=None)
        args = [_bin(_motor()), "--listen-port", str(_srv["porta"]),
                "--diffusion-model", _modelo(MODELOS[0][0]), "--llm", _modelo(MODELOS[1][0]), "--vae", _modelo(MODELOS[2][0]),
                "--offload-to-cpu", "--fa", "--vae-tiling", "--steps", str(PASSOS), "--cfg-scale", "1.0"]
        proc = subprocess.Popen(args, cwd=os.path.dirname(args[0]), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
        _srv["proc"] = proc
        _amarrar(proc)
        threading.Thread(target=_ler_saida, args=(proc,), daemon=True).start()
        t0 = time.time()
        while time.time() - t0 < 600:
            if proc.poll() is not None:
                raise RuntimeError("o gerador fechou ao carregar: " + " | ".join(_srv["log"][-4:]))
            try:
                _http("GET", "/sdcpp/v1/capabilities", timeout=3)
                _srv.update(ok=True, uso=time.time())
                threading.Thread(target=_vigiar_ocioso, daemon=True).start()
                return
            except (urllib.error.URLError, ConnectionError, OSError, ValueError):
                on_progress({"pct": 2, "msg": f"Carregando o modelo na placa... {int(time.time() - t0)} s"})
                time.sleep(1)
        proc.kill()
        raise RuntimeError("o gerador demorou demais para carregar")


def parar():
    """Fecha o servidor (solta a memória da placa)."""
    p = _srv["proc"]
    _srv.update(proc=None, ok=False)
    if p and p.poll() is None:
        p.kill()
    return {"success": True}


# ───────────────────────── gerar ─────────────────────────

def _b64_de(ref):
    """Referência: caminho de arquivo, data URL ou base64 cru."""
    if isinstance(ref, str) and os.path.isfile(ref):
        with open(ref, "rb") as f:
            return base64.b64encode(f.read()).decode()
    return ref.split(",", 1)[1] if ref.startswith("data:") else ref


def _lado(v, padrao=1024):
    v = int(v or padrao)
    return max(256, min(LADO_MAX, round(v / 16) * 16))


def _liberar_gpu_ollama():
    """Modelos do Ollama (Worker local, olho) parados na GPU deixam o FLUX sem VRAM ("cannot make enough memory available"):
    descarrega os que estiverem carregados (keep_alive 0). Sem Ollama rodando, não faz nada."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/ps", timeout=0.5) as r:
            modelos = [m.get("name") for m in json.load(r).get("models") or []]
    except Exception:
        return []
    for m in modelos:
        try:
            req = urllib.request.Request("http://127.0.0.1:11434/api/generate", data=json.dumps({"model": m, "keep_alive": 0}).encode(),
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=20).read()
        except Exception:
            pass
    return modelos


def gerar(spec, on_progress=lambda d: None):
    """spec: {prompt, largura, altura, semente (-1 = aleatória), passos, refs: [caminho|b64...]}.
    Devolve {success, path, semente, cache} — PNG no cache em disco."""
    prompt = (spec.get("prompt") or "").strip()
    if not prompt:
        return {"success": False, "error": "Escreva o que gerar."}
    w, h = _lado(spec.get("largura")), _lado(spec.get("altura"))
    _liberar_gpu_ollama()
    semente = int(spec.get("semente", -1))
    if semente < 0:
        semente = int.from_bytes(os.urandom(4), "little") & 0x7FFFFFFF
    passos = max(1, min(50, int(spec.get("passos") or PASSOS)))
    refs = [_b64_de(r) for r in (spec.get("refs") or [])]
    chave = hashlib.sha1(json.dumps([prompt, w, h, semente, passos, [hashlib.sha1(r.encode()).hexdigest() for r in refs]]).encode()).hexdigest()
    os.makedirs(_cache_dir(), exist_ok=True)
    saida = os.path.join(_cache_dir(), chave + ".png")
    if os.path.isfile(saida):
        return {"success": True, "path": saida, "semente": semente, "cache": True}
    try:
        _srv["ocupado"] = True
        _subir(on_progress)
        corpo = {"prompt": prompt, "negative_prompt": "", "width": w, "height": h, "seed": semente, "batch_count": 1,
                 "ref_images": refs, "embed_image_metadata": False, "output_format": "png",
                 "sample_params": {"sample_method": "euler", "sample_steps": passos, "guidance": {"txt_cfg": 1.0}}}
        job = _http("POST", "/sdcpp/v1/img_gen", corpo)
        jid, t0 = job["id"], time.time()
        _srv.update(passo=None, cancelar=None)
        while True:
            time.sleep(0.5)
            if _srv.get("cancelar") == jid:
                parar()
                raise RuntimeError("cancelada")
            j = _http("GET", f"/sdcpp/v1/jobs/{jid}")
            st = j.get("status")
            if st == "completed":
                img = j["result"]["images"][0]["b64_json"]
                with open(saida, "wb") as f:
                    f.write(base64.b64decode(img))
                break
            if st in ("failed", "cancelled"):
                raise RuntimeError((j.get("error") or {}).get("message") or st)
            # a saída do servidor mostra os passos da amostragem (n/passos) e depois os blocos do VAE (n/blocos)
            ps, seg = _srv["passo"], int(time.time() - t0)
            if ps and ps[1] == passos:
                pct, msg = 5 + int(65 * ps[0] / ps[1]), f"Gerando {w}×{h}... passo {ps[0]}/{ps[1]} ({seg} s)"
            elif ps and ps[1]:
                pct, msg = 70 + int(28 * ps[0] / ps[1]), f"Finalizando a imagem... ({seg} s)"
            else:
                pct, msg = 5, f"Lendo o pedido... ({seg} s)"
            on_progress({"pct": pct, "msg": msg, "job": jid})
        try:
            velhos = sorted((os.path.join(_cache_dir(), n) for n in os.listdir(_cache_dir())), key=os.path.getmtime)
            for v in velhos[:-300]:
                os.remove(v)
        except OSError:
            pass
        return {"success": True, "path": saida, "semente": semente, "segundos": round(time.time() - t0, 1)}
    except Exception as e:
        return {"success": False, "error": str(e), "log": _srv["log"][-6:]}
    finally:
        _srv["ocupado"] = False
        _srv["uso"] = time.time()


def cancelar(jid):
    """O servidor só cancela job na fila; já gerando, gerar() fecha o servidor (solta na hora)."""
    _srv["cancelar"] = jid
    try:
        _http("POST", f"/sdcpp/v1/jobs/{jid}/cancel", {})
    except Exception:
        pass
    return {"success": True}


def remover():
    """Apaga motor e modelos (libera ~7 GB)."""
    parar()
    shutil.rmtree(pasta(), ignore_errors=True)
    return {"success": True}
