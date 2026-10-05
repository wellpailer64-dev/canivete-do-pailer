"""Mapa do código (para o agente achar onde mexer sem abrir arquivo grande): comandos registrados, funções de topo e
pontes Python, com número de linha. Gerado — nunca editar à mão; rode de novo depois de mudanças grandes.
  py -3.13 tools/mapa_codigo.py vetor|imagem|editor   →  Instructions/agente/mapa-<nome>.md
  py -3.13 tools/mapa_codigo.py vetor --busca pincel   →  só as linhas que casam (sem gravar)"""
import glob, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
ALVOS = {   # js (glob em frontend/js), py (glob em Functions), prefixo das pontes em main.py, padrão de comando JS
    "vetor": ("vetor-*.js", "vetor_*.py", ("vk_",), r"vkRegistrar\('([\w]+)'"),
    "imagem": ("imagem-*.js", "*imagem*.py", ("ie_",), r"^\s{4}(?:async\s+)?([a-zA-Z]\w*)\s*\(.*\)\s*\{\s*(?://.*)?$"),
    "editor": ("editor*.js", "video_*.py", ("ve_", "editor_"), r"vkRegistrar\('([\w]+)'"),
}
FUNC_JS = re.compile(r"^(?:async\s+)?function\s+([\w$]+)\s*\(|^(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\(|function|[\w$]+\s*=>)|^([\w$]+)\s*=\s*(?:async\s+)?function\b")
FUNC_PY = re.compile(r"^(?:def|class)\s+(\w+)")


def mapear(nome, busca=None):
    js, py, pontes, cmd_re = ALVOS[nome]
    linhas = [f"# Mapa do código — {nome} (gerado por tools/mapa_codigo.py; nome:linha)", ""]
    def bloco(titulo, itens):
        if busca: itens = [i for i in itens if busca.lower() in i.lower()]
        if not itens: return
        linhas.append(f"## {titulo}")
        linha = ""
        for it in itens:
            if len(linha) + len(it) > 150: linhas.append(linha.rstrip()); linha = ""
            linha += it + "  "
        if linha: linhas.append(linha.rstrip())
    for arq in sorted(glob.glob(os.path.join(RAIZ, "frontend", "js", js))):
        L = open(arq, encoding="utf-8").read().split("\n")
        cmds, funcs = [], []
        for i, l in enumerate(L, 1):
            for m in re.finditer(cmd_re, l): cmds.append(f"{m.group(1)}:{i}")
            m = FUNC_JS.match(l)
            if m: funcs.append(f"{next(g for g in m.groups() if g)}:{i}")
        rel = os.path.relpath(arq, RAIZ).replace("\\", "/")
        if cmds: bloco(f"{rel} ({len(L)} linhas) — comandos", cmds)
        bloco(f"{rel} — funções" if cmds else f"{rel} ({len(L)} linhas) — funções", funcs)
    for arq in sorted(glob.glob(os.path.join(RAIZ, "Functions", py))):
        L = open(arq, encoding="utf-8").read().split("\n")
        bloco(f"{os.path.relpath(arq, RAIZ).replace(chr(92), '/')} ({len(L)} linhas)", [f"{m.group(1)}:{i}" for i, l in enumerate(L, 1) for m in [FUNC_PY.match(l)] if m])
    M = open(os.path.join(RAIZ, "main.py"), encoding="utf-8").read().split("\n")
    bloco("main.py — pontes", [f"{m.group(1)}:{i}" for i, l in enumerate(M, 1) for m in [re.match(r"\s{4}def ((?:" + "|".join(pontes) + r")\w+)\(", l)] if m])
    return "\n".join(linhas) + "\n"


if __name__ == "__main__":
    nome = sys.argv[1] if len(sys.argv) > 1 else "vetor"
    busca = sys.argv[sys.argv.index("--busca") + 1] if "--busca" in sys.argv else None
    txt = mapear(nome, busca)
    if busca: print(txt)
    else:
        dest = os.path.join(RAIZ, "Instructions", "agente", f"mapa-{nome}.md"); open(dest, "w", encoding="utf-8").write(txt)
        print(f"{os.path.relpath(dest, RAIZ)}: {txt.count(chr(10))} linhas, {len(txt) // 1000} kB")
