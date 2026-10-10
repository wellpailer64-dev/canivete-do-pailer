"""Núcleo de hardware do KANIVETE: identifica o PC uma vez e diz a cada parte do app quanto ela pode usar.

Antes, cada módulo adivinhava sozinho (os.cpu_count() de jeitos diferentes, memória da placa só na NVIDIA — 4 GB
"no chute" nas outras —, cache do editor pela memória do navegador). Agora: `detectar()` lê o PC (rápido, sem
subprocesso: psutil + registro do Windows), `plano()` traduz em números (threads, cache, memória da placa, IA na placa
ou no processador, tempo para soltar modelo parado) e os módulos perguntam aqui.

Piso que o app precisa atender bem: 8 GB de RAM com placa integrada (Intel/AMD), 4 núcleos.

Simular outro PC (testes; o app inteiro passa a acreditar nele):
    CANIVETE_HW_SIMULAR=leve | medio | forte | {"threads": 4, "ram_gb": 8, "placa": "integrada"}
O aperto de verdade (CPU limitada a N núcleos e RAM ocupada por um "balão") fica em tools/hw_simular.py.
Modo escolhido pela pessoa (Preferências › Desempenho): automatico | economia | maximo — `definir_modo()`.
"""
import json
import os
import threading

NIVEIS = ("leve", "medio", "forte")
MODOS = ("automatico", "economia", "maximo")
_GPU_CLASSE = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
_VIRTUAIS = ("microsoft basic", "remote", "parsec", "virtual", "citrix", "vmware", "hyper-v", "idd", "spacedesk", "displaylink")
_FABRICANTE = {"10de": "nvidia", "1002": "amd", "8086": "intel", "1414": "microsoft", "5143": "qualcomm"}
SIMULADOS = {
    "leve": {"threads": 4, "nucleos": 4, "ram_gb": 8, "placa": "integrada"},
    "medio": {"threads": 8, "nucleos": 4, "ram_gb": 16, "placa": "entrada"},
    "forte": {"threads": 16, "nucleos": 8, "ram_gb": 32, "placa": "dedicada"},
}
_cache = {"hw": None}
_lock = threading.Lock()


def _pasta():
    p = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "CaniveteDoPailer")
    os.makedirs(p, exist_ok=True)
    return p


# ── leitura do PC ─────────────────────────────────────────────────────────────
def _placas():
    """Todas as placas de vídeo (qualquer marca) com a memória DEDICADA de verdade (HardwareInformation.qwMemorySize do
    driver; o Win32_VideoController trava em 4 GB). Integrada = Intel (menos Arc) ou AMD sem memória própria."""
    out = []
    try:
        import winreg
        raiz = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, _GPU_CLASSE)
    except OSError:
        return out
    i = 0
    while True:
        try:
            sub = winreg.EnumKey(raiz, i)
        except OSError:
            break
        i += 1
        if not sub.isdigit():
            continue
        try:
            k = winreg.OpenKey(raiz, sub)
        except OSError:
            continue

        def v(nome, padrao=None):
            try:
                return winreg.QueryValueEx(k, nome)[0]
            except OSError:
                return padrao
        nome = v("DriverDesc")
        if not nome or any(x in nome.lower() for x in _VIRTUAIS):
            continue
        mem = v("HardwareInformation.qwMemorySize") or v("HardwareInformation.MemorySize") or 0
        if isinstance(mem, bytes):
            mem = int.from_bytes(mem[:8], "little")
        ident = (v("MatchingDeviceId") or "").lower()
        fab = next((f for c, f in _FABRICANTE.items() if f"ven_{c}" in ident), None) or \
            next((f for f in ("nvidia", "amd", "intel") if f in nome.lower() or (f == "amd" and "radeon" in nome.lower())), "outra")
        vram = round(int(mem) / 2**30, 1)
        integrada = (fab == "intel" and "arc" not in nome.lower()) or (fab == "amd" and vram < 1.5) or fab in ("microsoft", "qualcomm")
        out.append({"nome": nome, "fabricante": fab, "vram_gb": vram, "integrada": integrada, "driver": v("DriverVersion", "")})
    # a dedicada mais forte primeiro (é ela que o app usa)
    out.sort(key=lambda p: (not p["integrada"], p["vram_gb"]), reverse=True)
    return out


def _avx2():
    try:
        import ctypes
        return bool(ctypes.windll.kernel32.IsProcessorFeaturePresent(40))   # PF_AVX2_INSTRUCTIONS_AVAILABLE
    except Exception:
        return None


def _cpu_nome():
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        return winreg.QueryValueEx(k, "ProcessorNameString")[0].strip()
    except OSError:
        return ""


def _ssd(caminho):
    """True se o disco de `caminho` não tem "busca" (SSD/NVMe); None se não deu para saber."""
    try:
        import ctypes
        from ctypes import wintypes
        letra = os.path.splitdrive(os.path.abspath(caminho))[0]
        h = ctypes.windll.kernel32.CreateFileW(f"\\\\.\\{letra}", 0, 3, None, 3, 0, None)
        if h in (-1, 0xFFFFFFFF, ctypes.c_void_p(-1).value):
            return None
        try:
            q = (ctypes.c_uint32 * 3)(7, 0, 0)   # StorageDeviceSeekPenaltyProperty, PropertyStandardQuery
            r = (ctypes.c_uint32 * 3)()
            n = wintypes.DWORD()
            ok = ctypes.windll.kernel32.DeviceIoControl(h, 0x2D1400, q, 12, r, 12, ctypes.byref(n), None)   # IOCTL_STORAGE_QUERY_PROPERTY
            return (not bool(r[2] & 0xFF)) if ok else None
        finally:
            ctypes.windll.kernel32.CloseHandle(h)
    except Exception:
        return None


def _ler():
    import psutil
    vm = psutil.virtual_memory()
    app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return {
        "cpu": _cpu_nome(),
        "nucleos": psutil.cpu_count(logical=False) or 1,
        "threads": psutil.cpu_count() or 1,
        "avx2": _avx2(),
        "ram_gb": round(vm.total / 2**30, 1),
        "placas": _placas(),
        "ssd_app": _ssd(app_dir),
        "simulado": None,
    }


def _simular(hw, sim):
    """Aplica CANIVETE_HW_SIMULAR por cima do que foi lido."""
    try:
        s = json.loads(sim) if sim.strip().startswith("{") else dict(SIMULADOS[sim.strip().lower()])
    except (ValueError, KeyError):
        return hw
    hw = dict(hw, simulado=s)
    for c in ("threads", "nucleos", "ram_gb"):
        if c in s:
            hw[c] = s[c]
    placa = s.get("placa")
    if placa == "integrada":
        hw["placas"] = [{"nome": "Intel UHD (simulada)", "fabricante": "intel", "vram_gb": 0.1, "integrada": True, "driver": ""}]
    elif placa == "entrada":
        hw["placas"] = [{"nome": "Placa de entrada 4 GB (simulada)", "fabricante": "nvidia", "vram_gb": 4.0, "integrada": False, "driver": ""}]
    elif placa == "nenhuma":
        hw["placas"] = []
    return hw


def detectar(forcar=False):
    """O PC (lido uma vez por sessão; ~10–40 ms). Com CANIVETE_HW_SIMULAR, o PC simulado."""
    with _lock:
        if _cache["hw"] is None or forcar:
            hw = _ler()
            sim = os.environ.get("CANIVETE_HW_SIMULAR")
            _cache["hw"] = _simular(hw, sim) if sim else hw
        return _cache["hw"]


def placa():
    """A placa que o app usa (a dedicada mais forte; senão a integrada; None sem placa)."""
    p = detectar()["placas"]
    return p[0] if p else None


def cpus():
    """Processadores lógicos que o app pode usar — no lugar de os.cpu_count() (no teste, o do PC simulado)."""
    return detectar()["threads"]


def threads_ia():
    """Threads de uma sessão de IA no processador (onnxruntime intra_op): deixa folga para a tela no PC leve."""
    return plano()["threads_ia"]


# ── modo escolhido pela pessoa ────────────────────────────────────────────────
def modo():
    try:
        m = json.load(open(os.path.join(_pasta(), "desempenho.json"), encoding="utf-8")).get("modo")
        return m if m in MODOS else "automatico"
    except (OSError, ValueError):
        return "automatico"


def definir_modo(m):
    if m not in MODOS:
        raise ValueError(f"modo deve ser um de {MODOS}")
    json.dump({"modo": m}, open(os.path.join(_pasta(), "desempenho.json"), "w", encoding="utf-8"))
    return plano()


# ── o plano: números que os módulos usam ──────────────────────────────────────
def nivel(hw=None):
    hw = hw or detectar()
    p = hw["placas"][0] if hw["placas"] else None
    dedicada = p and not p["integrada"] and p["vram_gb"] >= 3
    if hw["ram_gb"] >= 24 and hw["threads"] >= 12 and dedicada and p["vram_gb"] >= 6:
        return "forte"
    if hw["ram_gb"] >= 12 and hw["threads"] >= 6:
        return "medio"
    return "leve"


def plano():
    """Quanto cada parte do app pode usar neste PC. Economia desce um nível; Máximo sobe um (nunca passa do que existe:
    sem placa dedicada, a IA continua no processador)."""
    hw = detectar()
    n = nivel(hw)
    m = modo()
    i = NIVEIS.index(n) + {"economia": -1, "maximo": 1}.get(m, 0)
    ef = NIVEIS[max(0, min(2, i))]
    p = hw["placas"][0] if hw["placas"] else None
    dedicada = bool(p and not p["integrada"])
    vram = p["vram_gb"] if dedicada else 0.0
    th = hw["threads"]
    return {
        "nivel": n, "modo": m, "efetivo": ef,
        # processador: deixa folga para a interface não travar
        "threads_trabalho": max(1, {"leve": th // 2, "medio": th - 2, "forte": th - 1}[ef]),
        "threads_ia": max(1, {"leve": max(1, hw["nucleos"] - 1), "medio": hw["nucleos"], "forte": th}[ef]),
        # memória
        # cache de quadros do editor (padrão da opção "Cache de quadros na RAM"; a menor opção da tela é 512 MB)
        "cache_editor_mb": int(min(1536, max(512, hw["ram_gb"] * {"leve": 32, "medio": 48, "forte": 64}[ef]))),
        "soltar_modelo_s": {"leve": 60, "medio": 180, "forte": 300}[ef],
        "uma_ia_por_vez": ef != "forte" or vram < 10,
        # placa
        "placa": p["nome"] if p else None,
        "placa_dedicada": dedicada,
        "vram_gb": vram,
        "vram_livre_ia_gb": round(max(0.0, vram - 1.5), 1),   # 1,5 GB ficam para a tela e a prévia
        "ia_na_placa": dedicada and vram >= 4,
        "export_na_placa": dedicada and vram >= 4,           # modo placa (Vulkan) do Kanivete Encoder
        # exportar pelo processador (x264/x265): preset mais rápido no PC leve/médio, com CRF 1 abaixo para a mesma
        # qualidade (medido 2026-10-10, 4 threads: medium crf18 35 s × veryfast crf17 13 s, SSIM igual, tamanho +4%)
        "export_cpu_preset": {"leve": "veryfast", "medio": "faster", "forte": None}[ef],
        # editor
        "previa": {"leve": "metade", "medio": "inteira", "forte": "inteira"}[ef],
        # altura das prévias renderizadas e da prévia leve de edição (padrão de "Qualidade das prévias")
        "previa_altura": 720 if ef == "leve" else 1080,
    }


def estado():
    """Para a tela (Preferências › Desempenho) e para o Claude: o PC, o nível e o plano."""
    return {"success": True, "hardware": detectar(), "plano": plano()}


if __name__ == "__main__":
    import sys
    import time
    sys.stdout.reconfigure(encoding="utf-8")
    t = time.perf_counter()
    hw = detectar()
    print(f"detectar: {1000 * (time.perf_counter() - t):.0f} ms")
    print(json.dumps(estado(), ensure_ascii=False, indent=1))
