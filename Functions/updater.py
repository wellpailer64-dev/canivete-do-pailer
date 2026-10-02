"""
updater.py — Atualização automática via GitHub Releases

Fluxo:
1. check_update(): consulta a última Release do repositório e compara com version.txt
2. apply_update(): baixa o .zip da Release, extrai numa pasta temporária e cria um .bat que
   espera o app fechar, copia os arquivos novos por cima (preservando modelos, cérebros,
   logs e configurações do usuário) e reabre o app.

Só funciona no executável (PyInstaller). Rodando pelo Python, apenas informa a versão nova.
"""
import os
import sys
import json
import tempfile
import zipfile
import subprocess
import time
import urllib.request

GITHUB_REPO = "wellpailer64-dev/canivete-do-pailer"
ASSET_NAME = "CaniveteDoPailer-win64.zip"
API_LATEST = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

# Pastas/arquivos do usuário que a atualização nunca pode apagar/sobrescrever
PRESERVAR_DIRS = ["modelos_ia", "models", "cerebros_md", "logs", "whisper", "huggingface"]
PRESERVAR_ARQS = ["window_state.json", "camera_map.json"]


def _bundle_dir():
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def versao_local():
    for base in (_bundle_dir(), _app_dir()):
        try:
            with open(os.path.join(base, "version.txt"), encoding="utf-8") as f:
                v = f.read().strip()
                if v:
                    return v
        except Exception:
            pass
    return "0.0.0"


def _vtuple(v):
    partes = []
    for p in str(v).lstrip("vV").split("."):
        num = "".join(ch for ch in p if ch.isdigit())
        partes.append(int(num) if num else 0)
    while len(partes) < 3:
        partes.append(0)
    return tuple(partes[:3])


def _get_json(url, timeout=10):
    req = urllib.request.Request(url, headers={
        "User-Agent": "CaniveteDoPailer-Updater",
        "Accept": "application/vnd.github+json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def check_update():
    """Retorna dict: {available, current, latest, notes, url, size}"""
    atual = versao_local()
    try:
        rel = _get_json(API_LATEST)
    except Exception as e:
        return {"available": False, "current": atual, "error": str(e)}

    latest = rel.get("tag_name", "").lstrip("vV")
    asset = next((a for a in rel.get("assets", []) if a.get("name") == ASSET_NAME), None)
    disponivel = bool(asset) and _vtuple(latest) > _vtuple(atual)
    return {
        "available": disponivel,
        "current": atual,
        "latest": latest,
        "notes": (rel.get("body") or "")[:2000],
        "url": asset.get("browser_download_url") if asset else "",
        "size": asset.get("size", 0) if asset else 0,
        "frozen": bool(getattr(sys, "frozen", False)),
    }


def _baixar(url, destino, total, callback_progresso=None):
    req = urllib.request.Request(url, headers={"User-Agent": "CaniveteDoPailer-Updater"})
    with urllib.request.urlopen(req, timeout=60) as r, open(destino, "wb") as f:
        total = int(r.headers.get("Content-Length") or total or 0)
        baixado = 0
        ultimo = -1
        while True:
            bloco = r.read(1024 * 1024)
            if not bloco:
                break
            f.write(bloco)
            baixado += len(bloco)
            if callback_progresso and total:
                pct = int(baixado * 100 / total)
                if pct != ultimo:
                    ultimo = pct
                    callback_progresso(pct, f"Baixando atualização... {baixado / 1048576:.0f} / {total / 1048576:.0f} MB")


def apply_update(info, callback_progresso=None):
    """
    Baixa e agenda a instalação. Retorna (ok, mensagem).
    Após ok=True o chamador deve fechar o app — o .bat espera o processo sair.
    """
    if not getattr(sys, "frozen", False):
        return False, "Atualização automática só funciona no executável. Use 'git pull' no código-fonte."
    url = info.get("url")
    if not url:
        return False, "Release sem arquivo para download."

    tmp = tempfile.mkdtemp(prefix="canivete_update_")
    zip_path = os.path.join(tmp, ASSET_NAME)
    try:
        _baixar(url, zip_path, info.get("size", 0), callback_progresso)
        if callback_progresso:
            callback_progresso(100, "Extraindo arquivos...")
        extr = os.path.join(tmp, "novo")
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(extr)
        os.remove(zip_path)
    except Exception as e:
        return False, f"Falha ao baixar/extrair: {e}"

    # O zip contém a pasta CaniveteDoPailer/ — localiza onde está o .exe
    origem = extr
    for raiz, _dirs, arqs in os.walk(extr):
        if "CaniveteDoPailer.exe" in arqs:
            origem = raiz
            break
    else:
        return False, "Pacote inválido: CaniveteDoPailer.exe não encontrado no zip."

    app_dir = _app_dir()
    exe = sys.executable
    # Caminhos completos: um nome solto (ex. "models") casaria com pastas de bibliotecas
    xd_raiz = " ".join(f'"{os.path.join(app_dir, d)}"' for d in PRESERVAR_DIRS)
    xd_int = f'"{os.path.join(app_dir, "_internal", "modelos_ia")}"'
    xf = " ".join(f'"{a}"' for a in PRESERVAR_ARQS)
    log = os.path.join(tmp, "update_log.txt")
    lista_pid = os.path.join(tmp, "pid.txt")
    pid = os.getpid()

    # Regras do .bat (aprendidas na marra):
    # - nada de "tasklist | find": sem console, o find trava para sempre esperando entrada;
    # - nada de "timeout": falha sem console; "ping" serve de pausa em qualquer situação;
    # - espera limitada: se o app não fechar em ~60s, instala assim mesmo (robocopy tenta de novo);
    # - tudo vai para o log desde a primeira linha, para diagnóstico.
    bat = os.path.join(tmp, "aplicar_update.bat")
    with open(bat, "w", encoding="utf-8") as f:
        f.write(f"""@echo off
chcp 65001 >nul
title Atualizando KANIVETE...
echo [%time%] instalador iniciado > "{log}"
echo Aguardando o KANIVETE fechar...
set /a tentativas=0
:espera
tasklist /FI "PID eq {pid}" /FO CSV /NH > "{lista_pid}" 2>nul
findstr /C:"\\"{pid}\\"" "{lista_pid}" >nul 2>&1
if errorlevel 1 goto instalar
set /a tentativas+=1
if %tentativas% geq 60 goto instalar
ping -n 2 127.0.0.1 >nul
goto espera
:instalar
echo [%time%] app fechado (esperas: %tentativas%), copiando arquivos >> "{log}"
echo Instalando nova versao...
rem _internal espelhado (remove bibliotecas antigas), preservando dados do usuario
robocopy "{origem}\\_internal" "{app_dir}\\_internal" /MIR /R:10 /W:2 /NFL /NDL /NP /XD {xd_int} /XF {xf} >> "{log}"
set erro1=%errorlevel%
rem Raiz: copia sem apagar nada do usuario
robocopy "{origem}" "{app_dir}" /E /R:10 /W:2 /NFL /NDL /NP /XD "{origem}\\_internal" {xd_raiz} /XF {xf} >> "{log}"
set erro2=%errorlevel%
echo [%time%] robocopy: %erro1% / %erro2% >> "{log}"
if %erro1% geq 8 goto falhou
if %erro2% geq 8 goto falhou
echo [%time%] reabrindo o app >> "{log}"
start "" "{exe}"
rmdir /s /q "{extr}" >nul 2>&1
exit /b 0
:falhou
echo.
echo ERRO ao copiar os arquivos da atualizacao.
echo Detalhes: {log}
pause
start "" "{exe}"
""")

    # O app reaberto não pode herdar as variáveis internas do PyInstaller deste processo
    env = {k: v for k, v in os.environ.items() if not k.startswith(("_PYI_", "_MEI"))}
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"

    # Console próprio: com DETACHED_PROCESS o .bat trava. A janela mostra o andamento ao usuário.
    base_flags = subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NEW_PROCESS_GROUP
    ultimo_erro = None
    for flags in (base_flags | subprocess.CREATE_BREAKAWAY_FROM_JOB, base_flags):
        try:
            subprocess.Popen(["cmd", "/c", bat], creationflags=flags, close_fds=True, env=env, cwd=tmp)
            break
        except OSError as e:  # sair do job pode ser negado; tenta sem
            ultimo_erro = e
    else:
        return False, f"Falha ao iniciar instalador: {ultimo_erro}"

    # Só manda fechar o app depois de confirmar que o instalador está vivo
    for _ in range(50):
        if os.path.exists(log):
            return True, "Atualização pronta. O app vai fechar e reabrir sozinho."
        time.sleep(0.2)
    return False, f"O instalador não iniciou. Baixe a versão nova manualmente em github.com/{GITHUB_REPO}/releases"
