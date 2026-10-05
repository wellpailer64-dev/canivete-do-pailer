"""Code Worker / Debug Worker: o Qwen3 8B local faz o trabalho braçal de infraestrutura (buscar, ler, trocar trecho,
rodar teste, ver diff) e devolve UMA linha JSON. O Claude escreve o contrato e revisa o diff, não o processo.
Ferramentas FECHADAS (sem shell livre): buscar_codigo (git grep), ler_arquivo (janela de linhas), aplicar_troca (trecho
exato e único, como o Edit), rodar_teste (só os da lista TESTES), ver_diff. Modo debug = só leitura + diagnóstico.

uso: py -3.13 tools/worker/codigo.py contrato.json
contrato = {"task_id", "modo": "codigo" | "debug", "goal": "...", "arquivos": ["frontend/js/x.js"] (onde pode mexer),
            "testes": ["node:frontend/js/x.js"], "comando": "py:tools/olho.py" (debug: o que falhou), "log": "caminho"}
→ codigo: {"task_id", "status", "files_changed", "tests": "2/2", "diff": "+3 -1", "resumo": "...", "seconds"}
→ debug:  {"task_id", "status", "causa", "arquivo", "funcao", "correcao", "confianca", "seconds"}
Registro completo: D:/kanivete_testes/worker/logs/<task_id>.json"""
import json, os, re, subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
LOGS = r"D:\kanivete_testes\worker\logs"
PROIBIDOS = re.compile(r"(^|[\\/])(\.git|dist|build|node_modules)([\\/]|$)|_credenciais\.py$", re.I)
AMB = {**os.environ, "TEMP": r"D:\kanivete_testes\tmp", "TMP": r"D:\kanivete_testes\tmp", "LOCALAPPDATA": r"D:\kanivete_testes\localappdata"}
# testes permitidos: "node:<arquivo.js>" (sintaxe), "py:<arquivo.py>" (compila), "teste:<nome>" (testes/teste_<nome>.py)
def comando_de(t):
    tipo, _, alvo = t.partition(":")
    if tipo == "node": return ["node", "--check", alvo]
    if tipo == "py": return [sys.executable, "-m", "pyflakes", alvo]   # compila E acusa nome indefinido (py_compile não pega)
    if tipo == "teste" and re.fullmatch(r"\w+", alvo) and os.path.isfile(os.path.join(RAIZ, "testes", f"teste_{alvo}.py")):
        return [sys.executable, os.path.join("testes", f"teste_{alvo}.py")]
    return None

F = lambda n, d, p, r: {"type": "function", "function": {"name": n, "description": d, "parameters": {"type": "object", "properties": p, "required": r}}}
S, N = {"type": "string"}, {"type": "number"}
FERR = [F("buscar_codigo", "Procura um texto/regex no código. Devolve arquivo:linha: trecho (até 30).", {"padrao": S, "arquivos": S}, ["padrao"]),
        F("ler_arquivo", "Lê linhas de um arquivo (no máximo 120 por vez).", {"arquivo": S, "de": N, "ate": N}, ["arquivo", "de"]),
        F("aplicar_troca", "Troca um trecho EXATO (copiado do arquivo, com a indentação) pelo novo. O novo SUBSTITUI o antigo inteiro (repita o que deve continuar). todas=true troca todas as ocorrências; senão o trecho tem que aparecer uma vez só.", {"arquivo": S, "antigo": S, "novo": S, "todas": {"type": "boolean"}}, ["arquivo", "antigo", "novo"]),
        F("rodar_teste", "Roda um teste da lista do contrato e devolve o resultado resumido.", {"teste": S}, ["teste"]),
        F("ver_diff", "Mostra o diff do que foi mudado até agora.", {}, [])]


def rel(p):
    p = os.path.normpath(os.path.join(RAIZ, str(p).replace("/", os.sep)))
    if not p.startswith(RAIZ) or PROIBIDOS.search(os.path.relpath(p, RAIZ)): raise ValueError(f"fora do permitido: {p}")
    return p


def rodar(cmd, limite=240):
    try: r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=limite, env=AMB)
    except subprocess.TimeoutExpired: return 124, "tempo esgotado"
    return r.returncode, ((r.stdout or "") + (r.stderr or ""))


def resumo_saida(txt, n=25):
    ls = [l for l in txt.splitlines() if l.strip() and "DeprecationWarning" not in l and "trace-deprecation" not in l]
    ruim = [l for l in ls if re.search(r"FALHOU|Error|error|Traceback|File \"|REPROVOU|assert", l)]
    return "\n".join((ruim[-n:] if ruim else ls[-n:]))[:2500]


def executar(nome, a, ctx):
    if nome == "buscar_codigo":
        cmd = ["git", "grep", "-n", "-I", "-E", str(a["padrao"]), "--"] + ([x.strip() for x in str(a.get("arquivos") or "").split(",") if x.strip()] or ["."])
        _, out = rodar(cmd, 60)
        ls = out.splitlines()
        return "\n".join(l[:220] for l in ls[:30]) + (f"\n(+{len(ls) - 30} resultados)" if len(ls) > 30 else "") or "nada encontrado"
    if nome == "ler_arquivo":
        ls = open(rel(a["arquivo"]), encoding="utf-8").read().splitlines()
        de = max(1, int(a.get("de") or 1)); ate = min(len(ls), int(a.get("ate") or de + 80), de + 119)
        return "\n".join(f"{i}\t{ls[i - 1][:240]}" for i in range(de, ate + 1)) + f"\n({len(ls)} linhas no arquivo)"
    if nome == "aplicar_troca":
        if ctx["modo"] == "debug": raise ValueError("modo debug não altera arquivos")
        p = rel(a["arquivo"])
        if ctx["arquivos"] and os.path.relpath(p, RAIZ).replace("\\", "/") not in ctx["arquivos"]: raise ValueError(f"o contrato só permite mexer em: {', '.join(ctx['arquivos'])}")
        s = open(p, encoding="utf-8").read(); antigo = str(a["antigo"])
        n = s.count(antigo)
        todas = str(a.get("todas")).lower() in ("true", "1", "sim")
        if not n or (n > 1 and not todas): raise ValueError(("o trecho não existe no arquivo (copie exatamente, com a indentação; use ler_arquivo)" if not n else f"o trecho aparece {n} vezes: use todas=true para trocar todas, ou inclua mais contexto para trocar uma"))
        open(p, "w", encoding="utf-8", newline="").write(s.replace(antigo, str(a["novo"])))
        ctx["mudados"].add(os.path.relpath(p, RAIZ)); return f"trocado ({n}x)"
    if nome == "rodar_teste":
        t = str(a["teste"])
        if t not in ctx["testes"]: raise ValueError(f"teste fora do contrato; use um de: {', '.join(ctx['testes'])}")
        cmd = comando_de(t)
        if not cmd: raise ValueError(f'teste "{t}" não existe')
        cod, out = rodar(cmd)
        if t.startswith("py:") and cod:   # arquivo grande já tem avisos antigos: reprova só o que é NOVO (comparado ao HEAD)
            msg = lambda l: re.sub(r"^.*?:\d+:\d+:? ", "", l).strip()
            base = subprocess.run([sys.executable, "-m", "pyflakes"], input=subprocess.run(["git", "show", "HEAD:" + t[3:]], cwd=RAIZ, capture_output=True).stdout,
                                  capture_output=True, cwd=RAIZ).stdout.decode("utf-8", "replace")
            antigos = {msg(l) for l in base.splitlines()}
            novos = [l for l in out.splitlines() if l.strip() and msg(l) not in antigos]
            cod, out = (1, "\n".join(novos)) if novos else (0, f"sem avisos novos ({len(antigos)} antigos ignorados)")
        ctx["resultados"][t] = cod == 0
        return ("PASSOU" if cod == 0 else f"FALHOU (código {cod})") + "\n" + resumo_saida(out)
    if nome == "ver_diff":
        _, est = rodar(["git", "diff", "--stat"], 30); _, d = rodar(["git", "diff", "-U2"], 30)
        return (est + "\n" + d)[:3000]
    raise ValueError(f'ferramenta "{nome}" não existe')


def conferir(conds):
    """condições: "contem:arq=texto" / "nao_contem:arq=texto" / "uma_vez:arq=texto" (exatamente 1x) / "max_linhas:arq=N" → o que falta"""
    falta = []
    for cd in conds or []:
        k, _, resto = str(cd).partition(":"); arq, _, txt = resto.partition("=")
        try: s = open(rel(arq), encoding="utf-8").read()
        except Exception: s = ""
        if (k == "contem" and txt not in s) or (k == "nao_contem" and txt in s) or (k == "uma_vez" and s.count(txt) != 1): falta.append(cd)
        # "max_linhas:arquivo=N": o diff do arquivo não pode passar de N linhas (+/-) — pega troca espalhada por "todas"
        if k == "max_linhas":
            _, d = rodar(["git", "diff", "--numstat", "--", arq], 30)
            n = sum(int(a) + int(b) for a, b, *_ in (l.split("	") for l in d.splitlines() if l[:1].isdigit()))
            if n > int(txt or 0): falta.append(f"{cd} (diff tem {n} linhas: desfaça o que trocou a mais, use todas=false)")
    return falta


_GPU_LIVRE = False


def liberar_gpu():
    """Antes do 1º uso do Ollama: fecha o gerador de imagem do Photo (sd-server) se estiver na VRAM — um modelo pesado por vez."""
    global _GPU_LIVRE
    if _GPU_LIVRE: return
    _GPU_LIVRE = True
    try: subprocess.run(["taskkill", "/F", "/IM", "sd-server.exe"], capture_output=True, timeout=15)
    except Exception: pass


def ollama(msgs, modelo="qwen3:8b", pensar=False):
    liberar_gpu()
    corpo = {"model": modelo, "stream": False, "messages": msgs, "tools": FERR, "think": pensar, "keep_alive": "10m",
             "options": {"temperature": 0, "num_ctx": 16384}}
    req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r: return json.load(r)


if __name__ == "__main__":
    c = json.load(open(sys.argv[1], encoding="utf-8-sig")) if os.path.isfile(sys.argv[1]) else json.loads(sys.argv[1])
    tid, modo, t0 = c.get("task_id") or time.strftime("CODIGO_%H%M%S"), c.get("modo", "codigo"), time.time()
    ctx = {"modo": modo, "arquivos": [x.replace("\\", "/") for x in c.get("arquivos") or []], "testes": list(c.get("testes") or []), "mudados": set(), "resultados": {}}
    inicio = ""
    if modo == "debug":   # o que falhou entra já mastigado (só o miolo do erro), não o log inteiro
        if c.get("comando"):
            ctx["testes"].append(c["comando"]); cmd = comando_de(c["comando"])
            if cmd: _, out = rodar(cmd); inicio = "Saída do comando que falhou:\n" + resumo_saida(out, 40)
        if c.get("log") and os.path.isfile(c["log"]): inicio += "\nLog:\n" + resumo_saida(open(c["log"], encoding="utf-8", errors="replace").read(), 40)
    sistema = ("Você é o Code Worker do Kanivete (repositório Python + JavaScript). Faça só o que o contrato pede, com as ferramentas. "
               "Antes de trocar, LEIA o trecho (ler_arquivo) e copie o texto exato. O novo SUBSTITUI o antigo inteiro: ex. trocar 1280 por X em 'lado=1280' = antigo 'lado=1280', novo 'lado=X'. Mudança mínima, no estilo do arquivo. "
               "Depois de mudar, rode os testes do contrato. Se um teste falhar, leia o erro e corrija. "
               "Quando terminar, responda só: FEITO: <resumo de uma linha do que mudou e por quê>. Se for impossível: IMPOSSIVEL: motivo."
               if modo == "codigo" else
               "Você é o Debug Worker do Kanivete. NÃO altera arquivos. Use buscar_codigo e ler_arquivo para achar a causa do erro. "
               "No fim responda SÓ um JSON: {\"causa\": \"...\", \"arquivo\": \"caminho:linha\", \"funcao\": \"...\", \"correcao\": \"o que mudar, concreto\", \"confianca\": 0.0-1.0}")
    msgs = [{"role": "system", "content": sistema},
            {"role": "user", "content": json.dumps({k: c[k] for k in ("goal", "arquivos", "testes") if k in c}, ensure_ascii=False) + ("\n" + inicio if inicio else "")}]
    log, fim, erros, modelo, vistos = {"contrato": c, "passos": []}, "", 0, "qwen3:8b", {}
    for passo in range(int(c.get("max_passos", 16))):
        r = ollama(msgs, modelo, modelo != "qwen3:8b"); m = r.get("message", {}); calls = m.get("tool_calls") or []
        msgs.append({"role": "assistant", "content": m.get("content", ""), "tool_calls": calls})
        log["passos"].append({"texto": (m.get("content") or "")[:600], "chamadas": calls})
        if not calls:
            fim = (m.get("content") or "").strip()
            falta = [t for t in ctx["testes"] if modo == "codigo" and ctx["mudados"] and not ctx["resultados"].get(t)] + conferir(c.get("success_conditions"))
            if modo == "codigo" and falta and not fim.upper().startswith("IMPOSS") and passo < int(c.get("max_passos", 16)) - 1:
                msgs.append({"role": "user", "content": f"Ainda não terminou. Falta: {', '.join(falta)} (contem:arquivo=texto = o arquivo tem que ter esse texto)."}); continue
            break
        for ch in calls:
            nome, args = ch["function"]["name"], ch["function"].get("arguments") or {}
            if isinstance(args, str):
                try: args = json.loads(args)
                except Exception: args = {}
            chave = nome + json.dumps(args, sort_keys=True, ensure_ascii=False)
            vistos[chave] = vistos.get(chave, 0) + 1
            if vistos[chave] > 1 and nome in ("aplicar_troca", "buscar_codigo"):   # mesma chamada de novo: não repete, cobra outra abordagem
                res, ok = "ERRO: você já fez exatamente esta chamada e o resultado não muda. Leia a mensagem anterior e mude a abordagem.", False
            else:
                try: res, ok = executar(nome, args, ctx), True
                except Exception as e: res, ok = f"ERRO: {e}", False
            erros = 0 if ok else erros + 1
            if erros >= 3 and modelo == "qwen3:8b": modelo, erros = "gemma4:e4b", 0; log["escalou"] = True   # travou: o de reserva, pensando, assume
            log["passos"][-1].setdefault("execucao", []).append({"ferramenta": nome, "args": args, "resultado": str(res)[:800]})
            msgs.append({"role": "tool", "content": str(res)[:3500]})
    seg = round(time.time() - t0, 1)
    if modo == "debug":
        mt = re.search(r"\{.*\}", fim, re.S)
        try: d = json.loads(mt.group(0)) if mt else {}
        except Exception: d = {}
        saida = {"task_id": tid, "status": "success" if d.get("causa") else "failed", **{k: d.get(k) for k in ("causa", "arquivo", "funcao", "correcao", "confianca")}, "seconds": seg}
        if not d: saida["resposta"] = fim[:300]
    else:
        _, st = rodar(["git", "diff", "--shortstat", "--"] + sorted(ctx["mudados"]), 30) if ctx["mudados"] else (0, "")
        mais, menos = re.search(r"(\d+) insert", st), re.search(r"(\d+) delet", st)
        ok_t = [t for t in ctx["testes"] if ctx["resultados"].get(t)]
        pend = conferir(c.get("success_conditions"))
        okk = fim.upper().startswith("FEITO") and len(ok_t) == len(ctx["testes"]) and not pend and bool(ctx["mudados"] or c.get("pode_nao_mudar") or not c.get("arquivos"))
        saida = {"task_id": tid, "status": "success" if okk else ("partial" if ctx["mudados"] else "failed"), "worker": modelo, "files_changed": len(ctx["mudados"]),
                 "arquivos": sorted(x.replace("\\", "/") for x in ctx["mudados"]), "tests": f"{len(ok_t)}/{len(ctx['testes'])}",
                 "diff": f"+{mais.group(1) if mais else 0} -{menos.group(1) if menos else 0}", **({"pendente": pend[:4]} if pend else {}), "resumo": re.sub(r"^FEITO:?\s*", "", fim)[:240], "seconds": seg}
    os.makedirs(LOGS, exist_ok=True)
    json.dump({**log, "saida": saida}, open(os.path.join(LOGS, f"{tid}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(saida, ensure_ascii=False))
