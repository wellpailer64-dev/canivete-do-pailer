"""App de teste pronto em um comando: sobe na 9333 (no disco D) se preciso e abre o projeto.
    py -3.13 tools/agente/abrir_teste.py projeto.vknv
    py -3.13 tools/agente/abrir_teste.py --fechar
"""
import os
import subprocess
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = "http://127.0.0.1:9333"


def no_ar():
    try:
        urllib.request.urlopen(URL + "/json/version", timeout=2)
        return True
    except OSError:
        return False


if len(sys.argv) < 2:
    sys.exit("uso: abrir_teste.py projeto.vknv")
if sys.argv[1] == "--fechar":
    subprocess.run(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'agente=9333' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"])
    print("app de teste fechado")
    sys.exit()
if not no_ar():
    amb = {**os.environ, "APPDATA": r"D:\Kanivete\Testes\appdata", "TEMP": r"D:\Kanivete\Testes\tmp", "TMP": r"D:\Kanivete\Testes\tmp", "LOCALAPPDATA": r"D:\Kanivete\Testes\localappdata",
           "CANIVETE_PERFIL_COMUM": "1"}   # mesmas prévias e recentes do app do Pailer (Functions/perfil_comum.py)
    processo = subprocess.Popen([sys.executable, "main.py", "--agente=9333"], cwd=RAIZ, env=amb, creationflags=subprocess.CREATE_NO_WINDOW)
    for _ in range(180):
        if no_ar():
            break
        codigo = processo.poll()
        if codigo is not None:
            sys.exit(f"app de teste encerrou durante a abertura (codigo {codigo}); confira o diagnostico de inicializacao")
        time.sleep(1)
    else:
        sys.exit("app de teste não subiu")
from playwright.sync_api import sync_playwright  # noqa: E402

with sync_playwright() as pw:
    nav = pw.chromium.connect_over_cdp(URL)
    pg = None
    fim = time.time() + 120
    while pg is None and time.time() < fim:
        pg = next((p for c in nav.contexts for p in c.pages if "index.html" in p.url), None)
        if pg is None:
            time.sleep(0.5)
    if pg is None:
        sys.exit("app de teste respondeu na porta 9333, mas a janela principal nao apareceu em 120 segundos")
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
