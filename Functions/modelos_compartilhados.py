"""Modelos compartilhados entre as instalações do app na mesma máquina (o .exe em dist/ e o app rodado pelo código).

Cada abertura anota a pasta do app em %APPDATA%/CaniveteDoPailer/modelos_locais.json e, para cada modelo que OUTRA
instalação já tem e esta não, liga em vez de baixar: pasta → junção (mklink /J), arquivo → link físico (os.link).
Nada é copiado (não gasta disco nem internet) e um download novo numa instalação aparece na outra na abertura seguinte.
Só liga o que falta: um modelo que esta instalação já tem fica como está (versões diferentes não se misturam).
Pastas e arquivos de outro disco não dá para ligar sem administrador: ficam para o download normal.
Link quebrado (a outra instalação apagou o modelo) é tirado e, se outra ainda tiver, ligado de novo.
"""
import json
import os
import subprocess
import sys

PASTAS = ("modelos_ia", "models")
_IGNORAR = (".part", ".tmp", ".download")


def _registro():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, "CaniveteDoPailer", "modelos_locais.json")


def _ler():
    try:
        with open(_registro(), "r", encoding="utf-8") as f:
            return [p for p in (json.load(f) or {}).get("apps") or [] if isinstance(p, str)]
    except Exception:
        return []


def _gravar(apps):
    arq = _registro()
    try:
        os.makedirs(os.path.dirname(arq), exist_ok=True)
        tmp = arq + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"apps": apps}, f, ensure_ascii=False, indent=1)
        os.replace(tmp, arq)
    except OSError:
        pass


def _norm(p):
    return os.path.normcase(os.path.abspath(p))


def _eh_link(p):
    """Junção ou link simbólico (o que esta rotina cria para pastas)."""
    try:
        return os.path.islink(p) or (hasattr(os.path, "isjunction") and os.path.isjunction(p))
    except OSError:
        return False


def _mesmo_disco(a, b):
    return os.path.splitdrive(os.path.abspath(a))[0].lower() == os.path.splitdrive(os.path.abspath(b))[0].lower()


def _juncao(destino, alvo):
    flags = 0x08000000 if os.name == "nt" else 0   # CREATE_NO_WINDOW
    r = subprocess.run(["cmd", "/c", "mklink", "/J", destino, alvo], capture_output=True, text=True, creationflags=flags)
    return r.returncode == 0 and os.path.isdir(destino)


def _tirar_quebrado(p):
    """Link que aponta para algo que não existe mais (a outra instalação apagou): sai, para ligar de novo ou baixar."""
    if os.path.lexists(p) and not os.path.exists(p):
        try:
            os.rmdir(p) if _eh_link(p) else os.remove(p)
        except OSError:
            pass


def sincronizar(app, log=print):
    """Anota esta instalação e liga os modelos que as outras já têm. Devolve {ligados: [...], pulados: [...]}."""
    app = os.path.abspath(app)
    apps = [p for p in _ler() if os.path.isdir(p)]
    if _norm(app) not in [_norm(p) for p in apps]:
        apps.append(app)
    _gravar(apps)
    ligados, pulados = [], []
    if os.name != "nt":
        return {"ligados": ligados, "pulados": pulados}
    # links quebrados desta instalação (a outra apagou o modelo ou foi desinstalada): saem antes de tudo
    for sub in PASTAS:
        base = os.path.join(app, sub)
        if os.path.isdir(base):
            for nome in os.listdir(base):
                _tirar_quebrado(os.path.join(base, nome))
    for outro in apps:
        if _norm(outro) == _norm(app):
            continue
        for sub in PASTAS:
            src_base, dst_base = os.path.join(outro, sub), os.path.join(app, sub)
            if not os.path.isdir(src_base):
                continue
            os.makedirs(dst_base, exist_ok=True)
            for nome in os.listdir(src_base):
                if nome.endswith(_IGNORAR):
                    continue
                s, d = os.path.join(src_base, nome), os.path.join(dst_base, nome)
                _tirar_quebrado(d)
                if os.path.lexists(d) or not os.path.exists(s):
                    continue
                real = os.path.realpath(s)   # liga direto no arquivo de verdade (nunca link de link)
                if not _mesmo_disco(real, d):
                    pulados.append(f"{sub}/{nome} (outro disco)")
                    continue
                try:
                    if os.path.isdir(real):
                        ok = _juncao(d, real)
                    else:
                        os.link(real, d)
                        ok = True
                except OSError as e:
                    ok = False
                    pulados.append(f"{sub}/{nome} ({e})")
                if ok:
                    ligados.append(f"{sub}/{nome}")
    if ligados:
        log(f"[modelos] {len(ligados)} modelo(s) de outra instalação ligados sem baixar: {', '.join(ligados[:8])}"
            + (" ..." if len(ligados) > 8 else ""))
    return {"ligados": ligados, "pulados": pulados}


def app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
