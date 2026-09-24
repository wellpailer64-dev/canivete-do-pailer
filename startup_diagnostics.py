"""
Diagnosticos de inicializacao do Canivete do Pailer.

Este modulo nao importa pywebview/pythonnet. A ideia e conseguir mostrar uma
mensagem amigavel mesmo quando o Windows bloqueia Python.Runtime.dll ou quando
o .NET Framework exigido ainda nao esta disponivel.
"""
import os
import sys
import traceback


DOTNET_472_RELEASE = 461808


def app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _candidate_runtime_dlls(base_dir):
    candidates = [
        os.path.join(base_dir, "_internal", "Python.Runtime.dll"),
        os.path.join(base_dir, "Python.Runtime.dll"),
    ]
    for root_name in ("_internal", "."):
        root = os.path.join(base_dir, root_name)
        if not os.path.isdir(root):
            continue
        for current_root, _, files in os.walk(root):
            for name in files:
                if name.lower() == "python.runtime.dll":
                    candidates.append(os.path.join(current_root, name))

    seen = set()
    for path in candidates:
        normalized = os.path.normcase(os.path.abspath(path))
        if normalized not in seen:
            seen.add(normalized)
            yield path


def _has_mark_of_the_web(path):
    try:
        with open(path + ":Zone.Identifier", "r", encoding="utf-8", errors="ignore") as stream:
            return "ZoneId=" in stream.read()
    except OSError:
        return False


def blocked_files(base_dir=None):
    base_dir = base_dir or app_dir()
    paths = [sys.executable] if getattr(sys, "frozen", False) else []
    paths.extend(_candidate_runtime_dlls(base_dir))
    return [path for path in paths if os.path.exists(path) and _has_mark_of_the_web(path)]


def dotnet_release():
    if os.name != "nt":
        return None
    try:
        import winreg

        key_path = r"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            release, _ = winreg.QueryValueEx(key, "Release")
            return int(release)
    except Exception:
        return None


def has_dotnet_472_or_newer():
    release = dotnet_release()
    return release is not None and release >= DOTNET_472_RELEASE


def preflight_problem():
    if os.name != "nt":
        return None

    blocked = blocked_files()
    if blocked:
        return (
            "O Windows esta bloqueando arquivos do Canivete do Pailer.",
            _format_blocked_files_message(blocked),
        )

    if not has_dotnet_472_or_newer():
        return (
            ".NET Framework ausente ou antigo.",
            _format_dotnet_message(),
        )

    return None


def format_webview_import_error(error):
    blocked = blocked_files()
    details = []
    if blocked:
        details.append(_format_blocked_files_message(blocked))
    elif not has_dotnet_472_or_newer():
        details.append(_format_dotnet_message())
    else:
        details.append(
            "Nao consegui confirmar automaticamente a causa, mas este erro costuma acontecer "
            "quando o Windows bloqueia Python.Runtime.dll ou quando o .NET Framework esta ausente."
        )

    details.append("")
    details.append("Erro tecnico:")
    details.append(str(error))
    details.append("")
    details.append("Traceback:")
    details.append(traceback.format_exc())
    return "\n".join(details)


def _format_blocked_files_message(paths):
    base_dir = app_dir()
    lines = [
        "Arquivos baixados da internet podem vir com o bloqueio de seguranca do Windows.",
        "",
        "Como resolver:",
        "1. Se voce ainda tem o ZIP/RAR original, clique nele com o botao direito, abra Propriedades, marque Desbloquear, aplique e extraia novamente.",
        "2. Se nao tem mais o ZIP/RAR, abra a pasta do programa, entre em _internal, clique em Python.Runtime.dll com o botao direito, abra Propriedades e marque Desbloquear.",
        "3. Depois abra o CaniveteDoPailer.exe novamente.",
        "",
        "Pasta do programa:",
        base_dir,
        "",
        "Arquivos detectados como bloqueados:",
    ]
    lines.extend(f"- {path}" for path in paths)
    return "\n".join(lines)


def _format_dotnet_message():
    return "\n".join(
        [
            "O pywebview/pythonnet precisa do .NET Framework 4.7.2 ou superior no Windows.",
            "",
            "Como resolver:",
            "1. Rode o Windows Update e instale as atualizacoes pendentes.",
            "2. Se o Windows for antigo, instale o .NET Framework 4.7.2 ou superior pelo instalador oficial da Microsoft.",
            "3. Reinicie o computador e abra o CaniveteDoPailer.exe novamente.",
        ]
    )


def show_startup_error(title, message):
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(title, message)
        root.destroy()
    except Exception:
        print(title, file=sys.stderr)
        print(message, file=sys.stderr)
