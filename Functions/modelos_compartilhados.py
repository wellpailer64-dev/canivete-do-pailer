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


def _vizinhas(app):
    """Instalações irmãs que existem mesmo sem registro: o .exe em <código>/dist/CaniveteDoPailer e a pasta do código."""
    out = []
    pai2 = os.path.dirname(os.path.dirname(app))
    if os.path.basename(os.path.dirname(app)).lower() == "dist" and os.path.isfile(os.path.join(pai2, "main.py")):
        out.append(pai2)
    exe = os.path.join(app, "dist", "CaniveteDoPailer")
    if os.path.isdir(os.path.join(exe, "_internal")):
        out.append(exe)
    return out


def _mesclar(src, dst, rel, ligados, pulados, prof=0):
    """Pasta que existe dos dois lados (ex.: um download começou nesta instalação): liga, dentro dela, só o que falta
    (arquivo pronto da outra no lugar do .part que ainda está baixando). Até 4 níveis."""
    if prof > 4:
        return
    for nome in os.listdir(src):
        if nome.endswith(_IGNORAR):
            continue
        s, d = os.path.join(src, nome), os.path.join(dst, nome)
        _tirar_quebrado(d)
        if os.path.isdir(s) and os.path.isdir(d) and not _eh_link(d) and not _eh_link(s):
            _mesclar(s, d, rel + "/" + nome, ligados, pulados, prof + 1)
            continue
        if os.path.lexists(d) or not os.path.exists(s):
            continue
        real = os.path.realpath(s)
        if not _mesmo_disco(real, d):
            pulados.append(f"{rel}/{nome} (outro disco)")
            continue
        try:
            ok = _juncao(d, real) if os.path.isdir(real) else (os.link(real, d) or True)
        except OSError as e:
            ok = False
            pulados.append(f"{rel}/{nome} ({e})")
        if ok:
            ligados.append(f"{rel}/{nome}")


def sincronizar(app, log=print):
    """Anota esta instalação e liga os modelos que as outras já têm. Devolve {ligados: [...], pulados: [...]}."""
    app = os.path.abspath(app)
    apps = [p for p in _ler() if os.path.isdir(p)]
    for p in [app] + _vizinhas(app):
        if _norm(p) not in [_norm(q) for q in apps]:
            apps.append(p)
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
            _mesclar(src_base, dst_base, sub, ligados, pulados)
    if ligados:
        log(f"[modelos] {len(ligados)} modelo(s) de outra instalação ligados sem baixar: {', '.join(ligados[:8])}"
            + (" ..." if len(ligados) > 8 else ""))
    return {"ligados": ligados, "pulados": pulados}


def app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _hash(p, bloco=8 * 2**20):
    import hashlib
    h = hashlib.sha1()
    with open(p, "rb") as f:
        while True:
            b = f.read(bloco)
            if not b:
                return h.hexdigest()
            h.update(b)


def deduplicar(principal, copia, log=print):
    """Cópias IDÊNTICAS (conteúdo inteiro) em `copia` viram links físicos para o arquivo de `principal` — libera o disco
    sem mudar nada para o app (os dois nomes são o mesmo arquivo; apagar um não apaga o outro). Troca atômica (link com
    nome provisório + os.replace); arquivo em uso (app aberto) fica como está. Devolve {trocados, bytes, em_uso, diferentes}."""
    r = {"trocados": 0, "bytes": 0, "em_uso": [], "diferentes": 0}
    for sub in PASTAS:
        a_base, b_base = os.path.join(principal, sub), os.path.join(copia, sub)
        if not (os.path.isdir(a_base) and os.path.isdir(b_base)):
            continue
        for raiz, dirs, arqs in os.walk(b_base):
            dirs[:] = [d for d in dirs if not _eh_link(os.path.join(raiz, d))]   # não entra em pasta já ligada
            for nome in arqs:
                b = os.path.join(raiz, nome)
                a = os.path.join(a_base, os.path.relpath(b, b_base))
                try:
                    if (not os.path.isfile(a) or os.path.islink(b) or os.path.samefile(a, b)
                            or os.path.getsize(a) != os.path.getsize(b) or not _mesmo_disco(a, b)):
                        continue
                    if _hash(a) != _hash(b):
                        r["diferentes"] += 1
                        continue
                    tam, tmp = os.path.getsize(b), b + ".kanivete_link"
                    if os.path.lexists(tmp):
                        os.remove(tmp)
                    os.link(a, tmp)
                    try:
                        os.replace(tmp, b)
                    except OSError:
                        os.remove(tmp)
                        r["em_uso"].append(os.path.relpath(b, copia))
                        continue
                    r["trocados"] += 1
                    r["bytes"] += tam
                except OSError as e:
                    r["em_uso"].append(f"{os.path.relpath(b, copia)} ({e.__class__.__name__})")
    log(f"[modelos] {r['trocados']} cópia(s) idêntica(s) viraram link: {r['bytes'] / 2**30:.2f} GB liberados"
        + (f"; {len(r['em_uso'])} em uso ficaram" if r["em_uso"] else ""))
    return r
