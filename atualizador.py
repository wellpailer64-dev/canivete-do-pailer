"""
atualizador.py — Auto-update do Canivete do Pailer
Verifica versão no GitHub e baixa novo .exe se disponível.

Como funciona:
1. Lê version.txt local (ao lado do .exe)
2. Lê version.txt no GitHub (raw)
3. Se versão remota > local → exibe popup
4. Usuário clica "Atualizar" → baixa novo .exe, substitui, reinicia
"""

import os
import sys
import threading
import subprocess
import urllib.request
import tempfile
from packaging.version import Version

# ── CONFIGURAÇÕES — ajuste para o seu repositório ────────────
GITHUB_USER    = "wellpailer64-dev"      # ← seu usuário do GitHub
GITHUB_REPO    = "canivete-do-pailer"   # ← nome do repositório
VERSION_URL    = f"https://raw.githubusercontent.com/{GITHUB_USER}/{GITHUB_REPO}/main/version.txt"
RELEASE_URL    = f"https://github.com/{GITHUB_USER}/{GITHUB_REPO}/releases/latest/download/Canivete.do.Pailer.exe"
VERSAO_LOCAL   = "1.0.0"               # ← atualizar a cada release
# ─────────────────────────────────────────────────────────────


def get_versao_local():
    """Lê version.txt ao lado do .exe. Fallback para VERSAO_LOCAL."""
    try:
        if hasattr(sys, "_MEIPASS"):
            base = os.path.dirname(sys.executable)
        else:
            base = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(base, "version.txt")
        if os.path.exists(path):
            with open(path, "r") as f:
                return f.read().strip()
    except Exception:
        pass
    return VERSAO_LOCAL


def get_versao_remota():
    """Busca version.txt no GitHub. Retorna None se falhar."""
    try:
        req = urllib.request.Request(
            VERSION_URL,
            headers={"User-Agent": "CaniveteDoPatler-Updater/1.0"}
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.read().decode().strip()
    except Exception:
        return None


def tem_atualizacao():
    """Retorna (tem_update: bool, versao_nova: str)."""
    local  = get_versao_local()
    remota = get_versao_remota()
    if remota is None:
        return False, local
    try:
        return Version(remota) > Version(local), remota
    except Exception:
        return remota != local, remota or local


def baixar_e_aplicar(versao_nova, callback_progresso=None, callback_log=None):
    """
    Baixa o novo .exe, substitui o atual e reinicia o app.
    Retorna True se sucesso, False se falhou.
    """
    if callback_log:
        callback_log(f"⬇  Baixando Canivete do Pailer v{versao_nova}…")

    try:
        # Destino temporário
        tmp = tempfile.mktemp(suffix=".exe", prefix="canivete_update_")

        # Download com progresso
        req = urllib.request.Request(
            RELEASE_URL,
            headers={"User-Agent": "CaniveteDoPatler-Updater/1.0"}
        )
        with urllib.request.urlopen(req, timeout=120) as response:
            total = int(response.headers.get("Content-Length", 0))
            baixado = 0
            chunk = 1024 * 64  # 64KB

            with open(tmp, "wb") as f:
                while True:
                    buffer = response.read(chunk)
                    if not buffer:
                        break
                    f.write(buffer)
                    baixado += len(buffer)
                    if total > 0 and callback_progresso:
                        pct   = int(baixado / total * 100)
                        mb_b  = baixado / 1024 / 1024
                        mb_t  = total   / 1024 / 1024
                        callback_progresso(pct, f"{mb_b:.1f} MB / {mb_t:.1f} MB ({pct}%)")
                    elif callback_progresso:
                        mb_b = baixado / 1024 / 1024
                        callback_progresso(-1, f"{mb_b:.1f} MB baixados…")

        if callback_log:
            callback_log("✅ Download concluído! Aplicando atualização…")

        # Caminho do executável atual
        if hasattr(sys, "_MEIPASS"):
            exe_atual = sys.executable
        else:
            # Rodando como .py — atualiza o próprio .py (dev mode)
            if callback_log:
                callback_log("⚠️  Modo dev — atualização só funciona no .exe compilado.")
            os.remove(tmp)
            return False

        # Script batch que substitui o .exe e reinicia
        # (necessário pois Windows não permite sobrescrever executável em uso)
        bat = tempfile.mktemp(suffix=".bat", prefix="canivete_patch_")
        exe_dir = os.path.dirname(exe_atual)
        version_file = os.path.join(exe_dir, "version.txt")

        with open(bat, "w") as f:
            f.write(f"""@echo off
timeout /t 2 /nobreak >nul
move /y "{tmp}" "{exe_atual}"
echo {versao_nova}> "{version_file}"
start "" "{exe_atual}"
del "%~f0"
""")

        subprocess.Popen(bat, shell=True,
                         creationflags=subprocess.CREATE_NO_WINDOW)
        return True

    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro na atualização: {e}")
        return False


def verificar_em_background(callback_quando_disponivel):
    """
    Verifica atualização em thread separada.
    Chama callback_quando_disponivel(versao_nova) se houver update.
    Não bloqueia o app.
    """
    def _check():
        try:
            tem, versao = tem_atualizacao()
            if tem:
                callback_quando_disponivel(versao)
        except Exception:
            pass
    threading.Thread(target=_check, daemon=True).start()
