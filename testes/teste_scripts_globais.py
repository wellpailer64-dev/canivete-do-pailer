"""Nomes globais repetidos entre os scripts da página (frontend/index.html).

Um `const/let/class X` no topo de um arquivo que já existe no topo de outro (const, let, class ou function) faz o
navegador recusar o SEGUNDO arquivo inteiro ("Identifier 'X' has already been declared"), sem aviso na tela.
Foi assim que o Kanivete Encoder sumiu: editor-kaniedit.js e editor-encoder.js declaravam `const VEKE` (2026-11-07).
Roda sem dependências (também no release.yml, antes do build): py -3.13 testes/teste_scripts_globais.py
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONT = os.path.join(RAIZ, "frontend")
LEX = re.compile(r"^(?:const|let|class)\s+([A-Za-z_$][\w$]*)", re.M)
FUN = re.compile(r"^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)", re.M)


def scripts():
    html = open(os.path.join(FRONT, "index.html"), encoding="utf-8").read()
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, re.S):
        attrs, corpo = m.group(1), m.group(2)
        if 'type="module"' in attrs:
            continue   # módulo tem escopo próprio
        src = re.search(r'src="([^"]+)"', attrs)
        if src:
            s = src.group(1).split("?")[0]
            if s.startswith(("http:", "https:", "//")):
                continue
            p = os.path.join(FRONT, s)
            if os.path.isfile(p):
                yield s, open(p, encoding="utf-8").read()
        elif corpo.strip():
            yield f"index.html (script inline #{m.start()})", corpo


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    lex, fun = {}, {}
    for nome, txt in scripts():
        for n in LEX.findall(txt):
            lex.setdefault(n, []).append(nome)
        for n in FUN.findall(txt):
            fun.setdefault(n, []).append(nome)
    erros = []
    for n, onde in sorted(lex.items()):
        outros = onde + [f for f in fun.get(n, []) if f not in onde]
        if len(outros) > 1:
            erros.append(f"  {n}: {', '.join(outros)}")
    if erros:
        print("REPROVADO: nome global declarado em mais de um script (o segundo arquivo não carrega):")
        print("\n".join(erros))
        return 1
    print(f"OK: {len(lex)} const/let/class globais sem repetição")
    return 0


if __name__ == "__main__":
    sys.exit(main())
