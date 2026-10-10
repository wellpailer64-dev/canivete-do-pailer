"""Abre o app de teste como se fosse outro PC (núcleo de hardware: Functions/hardware.py).

    py -3.13 tools/hw_simular.py leve [--porta 9340] [--sem-gpu-tela] [-- comando de teste ...]

- CANIVETE_HW_SIMULAR=<perfil>: o app inteiro acredita no PC simulado (hardware.plano()).
- CPU de verdade limitada: a árvore toda (Python, WebView2, ffmpeg, IA) presa a N processadores lógicos (Job Object).
- Memória: teto de memória comprometida da árvore = 70% da RAM simulada (o resto é do Windows e dos outros
  programas). Passar do teto = falha de alocação na hora — sinal de que num PC daquele tamanho ia paginar/travar.
  Só o app sofre: os programas abertos do usuário não são apertados.
- Placa "integrada"/"nenhuma": esconde a NVIDIA do CUDA/NVENC (CUDA_VISIBLE_DEVICES=-1) e do Vulkan do llama.cpp/
  stable-diffusion (GGML_VK_VISIBLE_DEVICES). --sem-gpu-tela desliga também a placa da tela (WebView2), pior que uma integrada.
- --sem-app: não abre o app; roda o próprio `-- comando` dentro da simulação (ex.: um bench de exportação em Python).
- --limpo: pastas de dados novas (como app recém-instalado: sem preferências salvas), em D:/kanivete_testes/tmp.
- Com `-- comando`: roda o comando (ex.: um teste) com o app aberto e fecha tudo no fim; sem ele, espera Enter.
Mede e imprime o pico de memória da árvore. Dados/temporários do app de teste em D:/kanivete_testes (nunca no C:).
"""
import ctypes
import json
import os
import subprocess
import sys
import time
import urllib.request
from ctypes import wintypes

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from Functions import hardware  # noqa: E402

BASE = "D:/kanivete_testes/"
k32 = ctypes.WinDLL("kernel32", use_last_error=True)


class _BASIC(ctypes.Structure):
    _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]


class _IO(ctypes.Structure):
    _fields_ = [(n, ctypes.c_uint64) for n in ("ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
                                              "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]


class _EXT(ctypes.Structure):
    _fields_ = [("BasicLimitInformation", _BASIC), ("IoInfo", _IO), ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t)]


AFINIDADE, MEMORIA_JOB, MATAR_AO_FECHAR = 0x10, 0x200, 0x2000


def criar_job(threads, teto_bytes):
    job = k32.CreateJobObjectW(None, None)
    info = _EXT()
    info.BasicLimitInformation.LimitFlags = AFINIDADE | MEMORIA_JOB | MATAR_AO_FECHAR
    info.BasicLimitInformation.Affinity = (1 << threads) - 1
    info.JobMemoryLimit = teto_bytes
    if not k32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info)):   # JobObjectExtendedLimitInformation
        raise OSError(ctypes.get_last_error(), "SetInformationJobObject")
    return job


def pico(job):
    info = _EXT()
    k32.QueryInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info), None)
    return info.PeakJobMemoryUsed / 2**30


def main():
    a = sys.argv[1:]
    cmd = a[a.index("--") + 1:] if "--" in a else None
    a = a[:a.index("--")] if "--" in a else a
    perfil = a[0] if a and not a[0].startswith("-") else "leve"
    porta = int(a[a.index("--porta") + 1]) if "--porta" in a else 9340
    s = dict(hardware.SIMULADOS[perfil])
    base = BASE
    if "--limpo" in a:
        import tempfile
        os.makedirs(BASE + "tmp", exist_ok=True)
        base = tempfile.mkdtemp(prefix="hw_limpo_", dir=BASE + "tmp").replace("\\", "/") + "/"
    env = dict(os.environ, CANIVETE_HW_SIMULAR=perfil, APPDATA=base + "appdata", TEMP=BASE + "tmp", TMP=BASE + "tmp",
               LOCALAPPDATA=base + "localappdata", CANIVETE_HW_PORTA=str(porta))
    if s.get("placa") in ("integrada", "nenhuma"):
        env.update(CUDA_VISIBLE_DEVICES="-1", GGML_VK_VISIBLE_DEVICES="")
    if "--sem-gpu-tela" in a:
        env["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--disable-gpu"
    for d in ("appdata", "localappdata"):
        os.makedirs(base + d, exist_ok=True)
    os.makedirs(BASE + "tmp", exist_ok=True)
    teto = int(s["ram_gb"] * 0.70 * 2**30)
    job = criar_job(min(s["threads"], os.cpu_count()), teto)
    if "--sem-app" in a:
        t0 = time.time()
        proc = subprocess.Popen(cmd, env=env, creationflags=0x4)
        h = k32.OpenProcess(0x1FFFFF, False, proc.pid)
        if not k32.AssignProcessToJobObject(job, h):
            raise OSError(ctypes.get_last_error(), "AssignProcessToJobObject")
        import psutil
        psutil.Process(proc.pid).resume()
        rc = proc.wait()
        print(json.dumps({"perfil": perfil, "segundos": round(time.time() - t0, 1), "pico_memoria_gb": round(pico(job), 2),
                          "teto_gb": round(teto / 2**30, 1)}), flush=True)
        k32.CloseHandle(job)
        sys.exit(rc)
    app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={porta}"], cwd=RAIZ, env=env,
                           creationflags=0x4)   # CREATE_SUSPENDED: entra no job antes de rodar qualquer coisa
    h = k32.OpenProcess(0x1FFFFF, False, app.pid)
    if not k32.AssignProcessToJobObject(job, h):
        raise OSError(ctypes.get_last_error(), "AssignProcessToJobObject")
    import psutil
    psutil.Process(app.pid).resume()
    print(f"app simulando PC {perfil}: {s} · CPU presa a {min(s['threads'], os.cpu_count())} lógicos · teto {teto / 2**30:.1f} GB · porta {porta}", flush=True)
    for _ in range(120):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{porta}/json", timeout=1)
            break
        except Exception:
            time.sleep(0.5)
    rc = 0
    try:
        if cmd:
            rc = subprocess.call(cmd, env=dict(env, CANIVETE_HW_SIMULAR=""))   # o teste em si roda fora da simulação
        else:
            input("Enter fecha o app… ")
    finally:
        print(json.dumps({"perfil": perfil, "pico_memoria_gb": round(pico(job), 2), "teto_gb": round(teto / 2**30, 1),
                          "app_vivo": app.poll() is None}), flush=True)
        k32.CloseHandle(job)   # MATAR_AO_FECHAR: fecha a árvore inteira
    sys.exit(rc)


if __name__ == "__main__":
    main()
