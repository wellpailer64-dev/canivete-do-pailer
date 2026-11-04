"""App de teste pronto em um comando: sobe na 9333 (no disco D) se preciso e abre o projeto.
    py -3.13 tools/agente/abrir_teste.py projeto.vknv
    py -3.13 tools/agente/abrir_teste.py --fechar
"""
import sys as _sys_pa, os as _os_pa; _sys_pa.path.append(_os_pa.path.join(_os_pa.path.dirname(_os_pa.path.abspath(__file__)), '..')); from porta_agente import porta as _porta_agente  # porta viva (agente.json)
import os
import subprocess
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = f"http://127.0.0.1:{_porta_agente(9333)}"


def no_ar():
    try:
        urllib.request.urlopen(URL + "/json/version", timeout=2)
        return True
    except OSError:
        return False


if sys.argv[1] == "--fechar":
    subprocess.run(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'agente=9333' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"])
    print("app de teste fechado")
    sys.exit()
if not no_ar():
    amb = {**os.environ, "APPDATA": r"D:\kanivete_testes\appdata", "TEMP": r"D:\kanivete_testes\tmp", "TMP": r"D:\kanivete_testes\tmp", "LOCALAPPDATA": r"D:\kanivete_testes\localappdata"}
    subprocess.Popen([sys.executable, "main.py", "--agente=9333"], cwd=RAIZ, env=amb, creationflags=subprocess.CREATE_NO_WINDOW)
    for _ in range(60):
        if no_ar():
            break
        time.sleep(3)
    else:
        sys.exit("app de teste não subiu")
from playwright.sync_api import sync_playwright  # noqa: E402

with sync_playwright() as pw:
    nav = pw.chromium.connect_over_cdp(URL)
    pg = None
    fim = time.time() + 120
    while pg is None and time.time() < fim:
        pg = next((p for c in nav.contexts for p in c.pages if "index.html" in p.url), None)
        time.sleep(1)
    pg.set_default_timeout(300000)
    pg.wait_for_function("() => typeof abrirProjetoExterno === 'function' && typeof VE !== 'undefined'")
    if pg.evaluate("VE.dirty"):
        sys.exit("o app de teste tem alterações sem salvar: não troquei de projeto")
    alvo = os.path.basename(sys.argv[1])
    pg.evaluate("p => abrirProjetoExterno(p)", sys.argv[1])
    pg.wait_for_function("a => VE.ready && (VE.projectPath || '').endsWith(a) && VE.clips.length > 0", arg=alvo)
    pg.wait_for_timeout(2500)
    print("aberto:", alvo, pg.evaluate("({clipes: VE.clips.length, timeline: VE.activeSequence})"))
    nav.close()
