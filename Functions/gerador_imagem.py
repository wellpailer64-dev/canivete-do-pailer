"""
gerador_imagem.py — Gerar imagem com IA no Photo Kanivete (texto → imagem e edição com imagens de referência).

Motor: stable-diffusion.cpp (sd-server.exe, sem Python/torch), dois modelos em GGUF:
- "zimage" (PADRÃO, texto → imagem): Tongyi-MAI/Z-Image-Turbo 6B quantizado em Q4_K (leejet/Z-Image-Turbo-GGUF, ~3,9 GB)
  + Qwen3-4B-Instruct-2507 Q4_K_M lendo o prompt (~2,5 GB) + VAE do FLUX.1 (~0,3 GB). Turbo: 8 passos, cfg 1 (sem CFG).
  Escolhido no lugar de Diffusers/BF16 porque o app já roda tudo no sd.cpp (o checkpoint oficial tem 30+ GB e pediria
  torch+CUDA no build); o Q4_K é o "Q4_K_M" do ecossistema GGUF e cabe com folga em 8 GB com --offload-to-cpu.
- "klein" (edição com imagens de referência, que o Z-Image-Turbo não faz): FLUX.2 [klein] 4B Q8_0 (~4,3 GB) + Qwen3-4B
  Q4_K_M + VAE do FLUX.2. Só é baixado quando a edição guiada é usada.
Nada disso vem no build: é baixado sob demanda (Arquivo > Gerar imagem) para <app>/modelos_ia/gerador_imagem/.
Placa: build Vulkan (30 MB, NVIDIA/AMD/Intel; na RTX 3050 empatou com o CUDA de 1,1 GB: ~20 s por 1024², 4 passos);
`--offload-to-cpu` + `--vae-tiling` cabem em 8 GB de VRAM (o VAE inteiro em 1024² pede ~10 GB).

O servidor sobe na 1ª geração (carrega o modelo uma vez), atende pela API nativa assíncrona (/sdcpp/v1/img_gen +
consulta do job) e sai sozinho OCIOSO segundos depois da última geração, devolvendo a memória da placa (trocar de modelo
também fecha o anterior; Worker/ampliar chamam parar() antes de usar a placa).
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
MOTORES = {
    # (arquivo, url, bytes aproximados — para a barra de progresso antes do Content-Length)
    "zimage": {"nome": "Z-Image-Turbo 6B (Q4_K)", "passos": 8, "cfg": 1.0, "refs": False, "modelos": [
        ("z_image_turbo-Q4_K.gguf", _HF + "leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf", 3_860_000_000),
        ("Qwen3-4B-Instruct-2507-Q4_K_M.gguf", _HF + "unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf", 2_500_000_000),
        ("flux1_ae.safetensors", _HF + "Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors", 335_304_388)]},
    "klein": {"nome": "FLUX.2 klein 4B (Q8_0)", "passos": 4, "cfg": 1.0, "refs": True, "modelos": [
        ("flux-2-klein-4b-Q8_0.gguf", _HF + "leejet/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q8_0.gguf", 4_300_000_000),
        ("qwen3-4b-Q4_K_M.gguf", _HF + "unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf", 2_500_000_000),
        ("flux2_vae.safetensors", _HF + "Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors", 336_213_556)]},
}
PADRAO = "zimage"
MODELOS = MOTORES[PADRAO]["modelos"]   # compatibilidade
OCIOSO = 90           # segundos depois da última geração até soltar a placa (gerações seguidas não recarregam)
PASSOS = MOTORES[PADRAO]["passos"]
LADO_MAX = 2048

_baixando = threading.Lock()
_srv_lock = threading.Lock()
_srv = {"proc": None, "porta": 0, "uso": 0.0, "log": [], "passo": None, "motor": None, "modelo": None}
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


def _qual(modelo):
    return modelo if modelo in MOTORES else PADRAO


def instalado(modelo=None):
    return os.path.isfile(_bin(_motor())) and all(os.path.isfile(_modelo(n)) for n, _, _ in MOTORES[_qual(modelo)]["modelos"])


def estado(modelo=None):
    m = _qual(modelo)
    p = _srv["proc"]
    srv = "parado" if not p or p.poll() is not None else ("pronto" if _srv["porta"] and _srv.get("ok") else "carregando")
    falta = sum(t for n, _, t in MOTORES[m]["modelos"] if not os.path.isfile(_modelo(n))) + (0 if os.path.isfile(_bin(_motor())) else 30_000_000)
    return {"success": True, "instalado": instalado(m), "baixando": _baixando.locked(), **_estado_dl,
            "servidor": srv, "motor": _motor(), "modelo": m, "nome_modelo": MOTORES[m]["nome"], "carregado": _srv.get("modelo"),
            "modelos": {k: instalado(k) for k in MOTORES}, "tamanho_gb": round(falta / 1e9, 1), "pasta": pasta()}


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


def baixar(on_progress, modelo=None):
    """Baixa motor + arquivos do modelo (padrão Z-Image) em segundo plano. on_progress({pct, msg}) / {fim: True} / {erro}."""
    m = _qual(modelo)
    if not _baixando.acquire(blocking=False):
        return {"success": False, "error": "Já está baixando."}

    def run():
        try:
            os.makedirs(os.path.join(pasta(), "modelos"), exist_ok=True)
            os.makedirs(os.path.join(pasta(), "bin"), exist_ok=True)
            itens = [(os.path.join(pasta(), "bin", os.path.basename(u)), u, 30_000_000) for u in MOTOR_ZIP[_motor()]]
            itens += [(_modelo(n), u, t) for n, u, t in MOTORES[m]["modelos"]]
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
            if not instalado(m):
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
        if not _srv.get("ocupado") and time.time() - _srv["uso"] > OCIOSO:   # solta a placa logo depois de gerar
            parar()
            return


def _subir(on_progress, modelo=None):
    m = _qual(modelo)
    with _srv_lock:
        p = _srv["proc"]
        if p and p.poll() is None and _srv.get("ok") and _srv.get("modelo") == m:
            return
        if p and p.poll() is None:   # outro modelo carregado: sai da placa antes
            p.kill(); p.wait(timeout=20)
        if not instalado(m):
            raise RuntimeError("Gerador não instalado: baixe em Arquivo > Gerar imagem.")
        _srv.update(porta=_porta_livre(), ok=False, log=[], passo=None, modelo=m)
        M = MOTORES[m]["modelos"]
        # --offload-to-cpu: pesos na RAM, cada parte (leitor do prompt, transformer, VAE) sobe à placa só na sua etapa
        args = [_bin(_motor()), "--listen-port", str(_srv["porta"]),
                "--diffusion-model", _modelo(M[0][0]), "--llm", _modelo(M[1][0]), "--vae", _modelo(M[2][0]),
                "--offload-to-cpu", "--fa", "--vae-tiling", "--steps", str(MOTORES[m]["passos"]), "--cfg-scale", str(MOTORES[m]["cfg"])]
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
    _srv.update(proc=None, ok=False, modelo=None)
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
    """spec: {prompt, largura, altura, semente (-1 = aleatória), passos, refs: [caminho|b64...], motor: zimage|klein, sem_cache}.
    Sem motor: Z-Image-Turbo; com referências: FLUX.2 klein (o Turbo não edita a partir de imagem).
    Devolve {success, path, semente, cache, motor} — PNG no cache em disco."""
    prompt = (spec.get("prompt") or "").strip()
    if not prompt:
        return {"success": False, "error": "Escreva o que gerar."}
    w, h = _lado(spec.get("largura")), _lado(spec.get("altura"))
    _liberar_gpu_ollama()
    semente = int(spec.get("semente", -1))
    if semente < 0:
        semente = int.from_bytes(os.urandom(4), "little") & 0x7FFFFFFF
    refs = [_b64_de(r) for r in (spec.get("refs") or [])]
    m = _qual(spec.get("motor") or ("klein" if refs else PADRAO))
    if refs and not MOTORES[m]["refs"]:
        m = "klein"
    if not instalado(m):
        return {"success": False, "error": f"{MOTORES[m]['nome']} não instalado: baixe em Arquivo > Gerar imagem.", "instalar": m}
    passos = max(1, min(50, int(spec.get("passos") or MOTORES[m]["passos"])))
    chave = hashlib.sha1(json.dumps([m, prompt, w, h, semente, passos, [hashlib.sha1(r.encode()).hexdigest() for r in refs]]).encode()).hexdigest()
    os.makedirs(_cache_dir(), exist_ok=True)
    saida = os.path.join(_cache_dir(), chave + ".png")
    if os.path.isfile(saida) and not spec.get("sem_cache"):
        return {"success": True, "path": saida, "semente": semente, "cache": True, "motor": m}
    try:
        _srv["ocupado"] = True
        _subir(on_progress, m)
        corpo = {"prompt": prompt, "negative_prompt": "", "width": w, "height": h, "seed": semente, "batch_count": 1,
                 "ref_images": refs, "embed_image_metadata": False, "output_format": "png",
                 "sample_params": {"sample_method": "euler", "sample_steps": passos, "guidance": {"txt_cfg": MOTORES[m]["cfg"]}}}
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
        return {"success": True, "path": saida, "semente": semente, "segundos": round(time.time() - t0, 1), "motor": m}
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
    """Apaga motor e modelos (libera ~7–14 GB)."""
    parar()
    shutil.rmtree(pasta(), ignore_errors=True)
    return {"success": True}
