"""Aplica trocas de texto descritas num arquivo .patch simples — sem escapar aspas/barras, tudo ou nada, com conferência.

Formato (blocos repetidos; caminhos relativos à raiz do projeto ou absolutos):

    @@ frontend/js/vetor-api.js
    <<<
    trecho exato que existe UMA vez
    ===
    trecho novo
    >>>

    @@ frontend/js/novo.js          (arquivo novo: <<< vazio cria; precisa não existir)
    <<<
    ===
    conteúdo
    >>>

    @@ arquivo.py *                 (asterisco = troca TODAS as ocorrências, mínimo 1)
    @@ arquivo.js +fim              (anexa o "novo" no fim do arquivo; sem <<< ... ===, só o conteúdo entre <<< e >>>)

Depois de aplicar: `node --check` nos .js e `py_compile` nos .py tocados; se algum quebrar, desfaz TUDO.
Saída: uma linha por bloco + uma linha final (ok/erro). python tools/patch.py mudancas.patch [--seco]
"""
import os, py_compile, re, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")


def rel(c):
    try: return os.path.relpath(c, RAIZ) if os.path.splitdrive(c)[0].lower() == os.path.splitdrive(RAIZ)[0].lower() else c
    except ValueError: return c


def ler(arq):
    txt = open(arq, encoding="utf-8").read().replace("\r\n", "\n")
    blocos, i, L = [], 0, txt.split("\n")
    while i < len(L):
        m = re.match(r"^@@ (.+?)(?:\s+(\*|\+fim))?\s*$", L[i])
        if not m:
            i += 1; continue
        alvo, modo = m.group(1).strip(), m.group(2) or ""
        i += 1
        while i < len(L) and L[i].strip() != "<<<": i += 1
        i += 1; corpo = []
        while i < len(L) and L[i] != ">>>": corpo.append(L[i]); i += 1
        i += 1
        if modo == "+fim":
            blocos.append((alvo, modo, None, "\n".join(corpo))); continue
        if "===" not in corpo:
            raise SystemExit(f"ERRO bloco {alvo}: falta a linha === entre o trecho velho e o novo")
        k = corpo.index("===")
        blocos.append((alvo, modo, "\n".join(corpo[:k]), "\n".join(corpo[k + 1:])))
    return blocos


def checar(caminho):
    if caminho.endswith(".js"):
        r = subprocess.run(["node", "--check", caminho], capture_output=True, text=True)
        if r.returncode == 0: return None
        ls = r.stderr.strip().splitlines(); onde = next((l for l in ls if re.search(r":\d+$", l.strip())), "")
        return (next((l for l in ls if "Error" in l), ls[-1] if ls else "erro").strip() + (f" @ {os.path.basename(onde.strip())}" if onde else ""))[:220]
    if caminho.endswith(".py"):
        try: py_compile.compile(caminho, doraise=True); return None
        except py_compile.PyCompileError as e: return str(e).strip().splitlines()[-1][:200]
    return None


def main():
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    seco = "--seco" in sys.argv
    blocos = ler(sys.argv[1])
    novos, originais, linhas = {}, {}, []
    for alvo, modo, velho, novo in blocos:
        cam = alvo if os.path.isabs(alvo) else os.path.join(RAIZ, alvo)
        if cam not in novos:
            existe = os.path.isfile(cam)
            originais[cam] = open(cam, encoding="utf-8", newline="").read() if existe else None
            novos[cam] = originais[cam].replace("\r\n", "\n") if existe else None
        atual = novos[cam]
        if modo == "+fim":
            if atual is None: raise SystemExit(f"ERRO {alvo}: +fim num arquivo que não existe")
            novos[cam] = atual.rstrip("\n") + "\n" + novo + "\n"; linhas.append(f"  {alvo}: anexado ({novo.count(chr(10)) + 1} linhas)"); continue
        if velho == "":
            if atual is not None: raise SystemExit(f"ERRO {alvo}: arquivo já existe (trecho velho vazio = criar)")
            novos[cam] = novo + "\n"; linhas.append(f"  {alvo}: criado"); continue
        if atual is None: raise SystemExit(f"ERRO {alvo}: arquivo não existe")
        n = atual.count(velho)
        if n == 0:
            dica = velho.strip().splitlines()[0][:70] if velho.strip() else ""
            raise SystemExit(f"ERRO {alvo}: trecho não encontrado (1ª linha: {dica!r}) — nada foi alterado")
        if n > 1 and modo != "*":
            raise SystemExit(f"ERRO {alvo}: trecho aparece {n} vezes; aumente a âncora ou use @@ {alvo} * — nada foi alterado")
        novos[cam] = atual.replace(velho, novo) if modo == "*" else atual.replace(velho, novo, 1)
        linhas.append(f"  {alvo}: {n if modo == '*' else 1} troca(s), {novo.count(chr(10)) - velho.count(chr(10)):+d} linhas")
    if seco:
        print("\n".join(linhas)); print(f"SECO ok: {len(blocos)} bloco(s) conferido(s)"); return
    for cam, txt in novos.items():
        crlf = originais[cam] is not None and "\r\n" in originais[cam]
        os.makedirs(os.path.dirname(cam), exist_ok=True)
        open(cam, "w", encoding="utf-8", newline="").write(txt.replace("\n", "\r\n") if crlf else txt)
    erros = [(cam, e) for cam in novos for e in [checar(cam)] if e]
    if erros:
        for cam, orig in originais.items():
            if orig is None: os.remove(cam)
            else: open(cam, "w", encoding="utf-8", newline="").write(orig)
        raise SystemExit("ERRO de sintaxe, tudo desfeito: " + " | ".join(f"{rel(c)}: {e}" for c, e in erros))
    print("\n".join(linhas)); print(f"ok: {len(blocos)} bloco(s) em {len(novos)} arquivo(s), sintaxe conferida")


if __name__ == "__main__":
    main()
