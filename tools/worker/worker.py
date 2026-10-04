"""Canivete Worker: executa um contrato de tarefa (Task Contract) no Photo Kanivete com um modelo local (Ollama),
sem passar cada operação pelo Claude. Claude escreve o contrato; o Worker conversa com o modelo, valida cada chamada
(esquema + nomes de camada reais), executa nas APIs reais (tools/worker/executor.js → KNV), devolve o erro ao modelo
para ele corrigir, passa para o modelo de reserva se travar e, no fim, imprime UMA linha JSON compacta.
O registro completo (mensagens, chamadas, erros) vai para D:/kanivete_testes/worker/logs/<task_id>.json.

uso: py -3.13 tools/worker/worker.py contrato.json [--modelo qwen3:8b] [--reserva gemma4:e4b] [--porta 9333]
contrato = {"task_id", "goal", "constraints": {"documento": "x.iknv", "salvar": true, "pasta_exportacao": "D:/..."},
            "assets": [], "success_conditions": ["oculta:assinatura", "texto:subtitulo=Só hoje", "exportado"]}"""
import argparse, json, os, re, sys, time, unicodedata, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
FINAIS = ("exportar", "levar_para_editor")
LOGS = r"D:\kanivete_testes\worker\logs"
ap = argparse.ArgumentParser()
ap.add_argument("contrato"); ap.add_argument("--modelo", default="qwen3:8b"); ap.add_argument("--reserva", default="gemma4:e4b")
ap.add_argument("--porta", type=int, default=9333); ap.add_argument("--max-passos", type=int, default=12)
a = ap.parse_args()
contrato = json.load(open(a.contrato, encoding="utf-8")) if os.path.isfile(a.contrato) else json.loads(a.contrato)
tid = contrato.get("task_id") or time.strftime("TAREFA_%H%M%S")
cons = contrato.get("constraints") or {}
# app: "photo" (padrão, Photo Kanivete → KNVW) | "editor" (Editor Kanivete → VEW, clipes por trilha@tempo)
APP = contrato.get("app", "photo")
NS, EXECUTOR, FERR_ARQ = {"photo": ("KNVW", "executor.js", "ferramentas.json"), "editor": ("VEW", "executor_editor.js", "ferramentas_editor.json")}[APP]
FERR = json.load(open(os.path.join(AQUI, FERR_ARQ), encoding="utf-8"))
ESQ = {t["function"]["name"]: t["function"]["parameters"] for t in FERR}
sem_acento = lambda s: unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower().strip()


def ollama(modelo, msgs, pensar=False):
    corpo = {"model": modelo, "stream": False, "messages": msgs, "tools": FERR, "options": {"temperature": 0, "num_ctx": 8192}, "keep_alive": "10m"}
    if modelo.startswith(("qwen3", "gemma4")): corpo["think"] = pensar
    req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r: return json.load(r)


def validar(nome, args, camadas):
    """→ (args corrigidos, erro ou None). Esquema da ferramenta + nomes de camada reais (acento/maiúscula corrigidos)."""
    if nome not in ESQ: return args, f'ferramenta "{nome}" não existe'
    sch, out = ESQ[nome], dict(args or {})
    for req in sch.get("required", []):
        if req not in out: return out, f'falta o argumento "{req}"'
    for k, v in list(out.items()):
        p = sch["properties"].get(k)
        if not p: out.pop(k); continue                      # argumento inventado: tira
        t = p.get("type")
        if t == "number":
            try: out[k] = float(str(v).replace(",", ".").rstrip("%px "))
            except Exception: return out, f'"{k}" tem que ser número'
        elif t == "boolean":
            if isinstance(v, str): out[k] = v.strip().lower() in ("true", "sim", "1", "verdadeiro")
        elif t == "array" and isinstance(v, str): out[k] = [x.strip() for x in v.split(",") if x.strip()]
        if "enum" in p:
            m = {sem_acento(e): e for e in p["enum"]}
            if sem_acento(out[k]) not in m: return out, f'"{k}" tem que ser um de {p["enum"]}'
            out[k] = m[sem_acento(out[k])]
    nomes = {sem_acento(c): c for c in camadas}
    for k in ("camada", "acima"):
        if k in out:
            if sem_acento(out[k]) not in nomes: return out, f'camada "{out[k]}" não existe; use uma de: {", ".join(camadas)}'
            out[k] = nomes[sem_acento(out[k])]
    if "camadas" in out:
        fora = [c for c in out["camadas"] if sem_acento(c) not in nomes]
        if fora: return out, f'camadas {fora} não existem; use: {", ".join(camadas)}'
        out["camadas"] = [nomes[sem_acento(c)] for c in out["camadas"]]
    return out, None


t0 = time.time()
log = {"contrato": contrato, "passos": []}
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}", timeout=20000)
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    pg.evaluate("src => (0, eval)(src)", open(os.path.join(AQUI, EXECUTOR), encoding="utf-8").read())
    pg.evaluate("async () => { try { await window.pywebview.api.ie_gerador_parar(); } catch (e) {} }")   # FLUX fora da GPU
    if APP == "editor" and cons.get("projeto"):   # .vknv (use uma CÓPIA): abre e espera; timeline opcional
        pg.evaluate("""async p => { if (!document.querySelector('#page-video-cutter.active')) document.querySelector('.menu-item[data-tool="video-cutter"]')?.click();
            VE.dirty = false; veOpenProject(p); for (let i = 0; i < 600 && !(VE.ready && (VE.projectPath || '').split(String.fromCharCode(92)).join('/') === p); i++) await new Promise(r => setTimeout(r, 100)); }""", cons["projeto"].replace("\\", "/"))
        if cons.get("timeline"): pg.evaluate("n => VEW.f.abrir_timeline({nome: n})", cons["timeline"])
    if APP == "photo" and cons.get("documento"):
        pg.evaluate("""async d => { KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo(); await KNV.abrir(d); KNV.automacao(false);
            if (!document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem'); }""", cons["documento"].replace("\\", "/"))
    camadas = [c["nome"] for c in pg.evaluate("KNVW.f.listar_camadas()")] if APP == "photo" else []
    ctx = {"pasta": (cons.get("pasta_exportacao") or "").replace("/", "\\")}
    sistema = ("Você é o Canivete Worker: executa a tarefa do contrato no Editor Kanivete (editor de vídeo) chamando as ferramentas. "
               "Clipe = trilha@tempo (V1@3.5, A1@10, T@5 para textos): use o tempo que o contrato cita ou veja listar_clipes. Tempos em segundos. "
               "Não invente conteúdo nem tome decisões criativas fora do contrato. Se uma ferramenta devolver erro, leia a mensagem (ela lista o que existe) e tente de novo. "
               "Quando tudo estiver feito, responda só FEITO. Se for impossível, responda IMPOSSIVEL: motivo. Clipes agora: "
               + json.dumps(pg.evaluate("VEW.f.listar_clipes({})"), ensure_ascii=False)[:2500]) if APP == "editor" else ("Você é o Canivete Worker: executa a tarefa do contrato no Photo Kanivete chamando as ferramentas, com os argumentos certos. "
               "Não invente conteúdo nem tome decisões criativas fora do contrato. Use exatamente os nomes de camada da lista. "
               "Se uma ferramenta devolver erro, corrija e tente de novo. Quando tudo do contrato estiver feito, responda só FEITO. "
               "Se for impossível, responda IMPOSSIVEL: motivo. Camadas: " + ", ".join(camadas))
    msgs = [{"role": "system", "content": sistema}, {"role": "user", "content": json.dumps({k: contrato[k] for k in ("goal", "constraints", "assets") if k in contrato}, ensure_ascii=False)}]
    modelo, ops, erros_seguidos, escalou, falhas, fim, eventos, finais = a.modelo, 0, 0, False, [], "", [], {}
    for passo in range(a.max_passos):
        r = ollama(modelo, msgs, pensar=(modelo == a.reserva))
        msg = r.get("message", {})
        calls = msg.get("tool_calls") or []
        msgs.append({"role": "assistant", "content": msg.get("content", ""), "tool_calls": calls})
        log["passos"].append({"modelo": modelo, "texto": msg.get("content", "")[:400], "chamadas": calls})
        if not calls:
            fim = (msg.get("content") or "").strip()
            # disse que terminou: confere antes de aceitar. Pendência = cobra (até 2x); continua = o de reserva assume
            if fim.upper().startswith("IMPOSS"): break
            conds_ = pg.evaluate(f"c => {NS}.conferir(c)", contrato.get("success_conditions") or [])
            abertos_ = [f"{n}: {e}" for i, (n, okk, e) in enumerate(eventos) if not okk and not any(n2 == n and ok2 for n2, ok2, _ in eventos[i + 1:])]
            falta = [c["condicao"] for c in conds_ if not c["ok"] and not (c["condicao"] == "exportado" and "exportar" in finais) and not (c["condicao"] == "no_editor" and "levar_para_editor" in finais)] + abertos_
            if not falta: break
            cobrancas = log.setdefault("cobrancas", 0) + 1; log["cobrancas"] = cobrancas
            if cobrancas > 2:
                if escalou or not a.reserva: break
                modelo, escalou = a.reserva, True
            msgs.append({"role": "user", "content": "Ainda não terminou. Falta: " + " | ".join(falta[:6]) + ". Corrija chamando as ferramentas (leia as mensagens de erro: elas dizem o nome certo)."})
            continue
        houve_erro = False
        for c in calls:
            nome, args = c["function"]["name"], c["function"].get("arguments") or {}
            if isinstance(args, str):
                try: args = json.loads(args)
                except Exception: args = {}
            args, erro = validar(nome, args, camadas)
            if not erro and nome in FINAIS:   # exportar / levar para o editor: uma vez só, no fim, depois de conferir o resto
                finais[nome] = args; saida = {"ok": True, "resultado": "agendado: roda no fim, depois de conferir o resto"}
                eventos.append((nome, True, None)); log["passos"][-1].setdefault("execucao", []).append({"ferramenta": nome, "args": args, **saida})
                msgs.append({"role": "tool", "content": json.dumps(saida, ensure_ascii=False)}); continue
            if not erro:
                try:
                    res = pg.evaluate(f"([n, a, c]) => {NS}.exec(n, a, c)", [nome, args, ctx]); ops += 1
                    if nome == "listar_camadas" and APP == "photo": camadas = [x["nome"] for x in res]
                    saida = {"ok": True, "resultado": res}
                except Exception as e:
                    erro = str(e).split("\n")[0].replace("Page.evaluate: Error: ", "")[:300]
            if erro: saida = {"ok": False, "erro": erro}; houve_erro = True; falhas.append(f"{nome}: {erro}")
            eventos.append((nome, not erro, erro))
            log["passos"][-1].setdefault("execucao", []).append({"ferramenta": nome, "args": args, **saida})
            msgs.append({"role": "tool", "content": json.dumps(saida, ensure_ascii=False)[:1500]})
        erros_seguidos = erros_seguidos + 1 if houve_erro else 0
        if erros_seguidos >= 3 and not escalou and a.reserva:   # travou: o worker de exceção assume a conversa
            modelo, escalou, erros_seguidos = a.reserva, True, 0
    else:
        fim = "sem resposta final (limite de passos)"
        if not escalou and a.reserva:
            modelo, escalou = a.reserva, True
            r = ollama(modelo, msgs, pensar=True); fim = (r.get("message", {}).get("content") or fim).strip()
    if not fim.upper().startswith("IMPOSS"):
        for nome in ("exportar", "levar_para_editor"):   # as finais, na ordem
            if nome in finais:
                try: pg.evaluate(f"([n, a, c]) => {NS}.exec(n, a, c)", [nome, finais[nome], ctx]); ops += 1
                except Exception as e: eventos.append((nome, False, str(e).split("\n")[0][:200])); falhas.append(f"{nome}: {e}")
    conds = pg.evaluate(f"c => {NS}.conferir(c)", contrato.get("success_conditions") or [])
    if cons.get("salvar") and APP == "editor" and cons.get("projeto"): pg.evaluate("veSaveProject()")
    if cons.get("salvar") and APP == "photo" and cons.get("documento"): pg.evaluate("d => KNV.salvar(d)", cons["documento"].replace("\\", "/"))

# erro que nunca foi resolvido (a mesma ferramenta não deu certo depois) não passa batido, mesmo com "FEITO"
abertos = [f"{n}: {e}" for i, (n, okk, e) in enumerate(eventos) if not okk and not any(n2 == n and ok2 for n2, ok2, _ in eventos[i + 1:])]
ok = all(c["ok"] for c in conds) and not fim.upper().startswith("IMPOSS") and not abertos
saida = {"task_id": tid, "status": "success" if ok else ("partial" if ops else "failed"), "worker": modelo, "escalou": escalou, "operations": ops,
         "retries": len(falhas), "seconds": round(time.time() - t0, 1)}
if not ok: saida["pendente"] = ([c["condicao"] for c in conds if not c["ok"]] + [x[:120] for x in abertos])[:5] or [fim[:120]]
os.makedirs(LOGS, exist_ok=True)
json.dump({**log, "saida": saida, "condicoes": conds, "falhas": falhas, "fim": fim}, open(os.path.join(LOGS, f"{tid}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(saida, ensure_ascii=False))
