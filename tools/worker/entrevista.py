"""Entrevista do assistente local (Canivete Worker): mesmos pedidos para cada modelo do Ollama, mede acerto de
ferramenta + argumentos, chamadas a mais, tempo e memória de vídeo. Uso:
    py -3.13 tools/worker/entrevista.py functiongemma orieg/gemma3-tools:4b-ft gemma4:e4b qwen3:1.7b qwen3:8b
Resultado: tabela no terminal + tools/worker/resultado_entrevista.json (falhas de cada um para olhar depois)."""
import json, os, re, subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
FERR = json.load(open(os.path.join(AQUI, "ferramentas.json"), encoding="utf-8"))
PROVA = json.load(open(os.path.join(AQUI, "prova.json"), encoding="utf-8"))
URL = "http://127.0.0.1:11434/api/chat"
SISTEMA = ("Você é o Canivete Worker, o assistente que opera o Photo Kanivete (editor de imagem). Sua única função é "
           "executar o pedido do usuário chamando as ferramentas fornecidas, com os argumentos certos. Não invente "
           "conteúdo, não tome decisões criativas e não chame ferramenta quando o pedido não for uma operação (agradecimento, "
           "opinião estética: só responda em texto). Pode chamar várias ferramentas quando o pedido tiver várias partes. "
           "Camadas do documento: " + ", ".join(PROVA["camadas"]) + ". Use exatamente esses nomes.")


LEITURA = ("listar_camadas", "info_camada")
VOLTAS = int(os.environ.get("ENTREVISTA_VOLTAS", "0"))   # >0: como o worker.py, devolve a leitura e deixa o modelo seguir


def chamar(modelo, pedido, extra=()):
    corpo = {"model": modelo, "stream": False, "messages": [{"role": "system", "content": SISTEMA}, {"role": "user", "content": pedido}, *extra],
             "tools": FERR, "options": {"temperature": 0, "num_ctx": 4096}, "keep_alive": "10m"}
    if modelo.startswith(("qwen3", "gemma4")): corpo["think"] = False   # sem raciocínio: o worker só executa
    req = urllib.request.Request(URL, data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=300) as r: resp = json.load(r)
    return resp, time.time() - t


def bate(esp, obt):
    """valor esperado (número exato, [mín, máx], texto, lista de textos aceitos, {contem: [...]}, lista de nomes) × obtido"""
    if isinstance(esp, dict) and "contem" in esp: return isinstance(obt, str) and all(p in obt.lower() for p in esp["contem"])
    if isinstance(esp, bool): return obt is esp or str(obt).lower() == str(esp).lower()
    if isinstance(esp, (int, float)):
        try: return abs(float(obt) - esp) < 1e-6
        except Exception: return False
    if isinstance(esp, list) and len(esp) == 2 and all(isinstance(x, (int, float)) for x in esp):
        try: return esp[0] <= float(obt) <= esp[1]
        except Exception: return False
    if isinstance(esp, list) and all(isinstance(x, str) for x in esp):
        if isinstance(obt, list): return sorted(x.lower() for x in obt) == sorted(x.lower() for x in esp)   # lista de camadas
        return str(obt).strip().lower() in [x.lower() for x in esp]                                           # alternativas
    return str(obt).strip().lower() == str(esp).strip().lower()


def nota(esperado, chamadas):
    """1 = ferramentas e argumentos certos, sem sobra; 0,5 = ferramentas certas e algum argumento errado; 0 = resto"""
    if not esperado: return (1.0 if not chamadas else 0.0), ("chamou ferramenta à toa" if chamadas else "")
    nomes_e, nomes_o = sorted(e["tool"] for e in esperado), sorted(c["name"] for c in chamadas)
    if nomes_e != nomes_o: return 0.0, f"ferramentas {nomes_o} (esperado {nomes_e})"
    livres, ok = list(chamadas), True
    erros = []
    for e in esperado:
        cand = [c for c in livres if c["name"] == e["tool"]]
        melhor = max(cand, key=lambda c: sum(bate(v, c["args"].get(k)) for k, v in e["args"].items()))
        livres.remove(melhor)
        for k, v in e["args"].items():
            if not bate(v, melhor["args"].get(k)): ok = False; erros.append(f"{e['tool']}.{k}={melhor['args'].get(k)!r} (esperado {v!r})")
    return (1.0 if ok else 0.5), "; ".join(erros)


def vram():
    try:
        s = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10).stdout
        return int(s.strip().splitlines()[0])
    except Exception: return None


modelos = sys.argv[1:] or ["functiongemma", "orieg/gemma3-tools:4b-ft", "gemma4:e4b", "qwen3:1.7b", "qwen3:8b"]
resultado = {}
for m in modelos:
    print(f"\n=== {m}")
    try: chamar(m, "esconde o logo")   # aquece (carrega na GPU)
    except Exception as e: print("  não rodou:", e); resultado[m] = {"erro": str(e)}; continue
    v = vram()
    linhas, tempos, toks = [], [], []
    for caso in PROVA["casos"]:
        try:
            r, dt = chamar(m, caso["pedido"])
            msg = r.get("message", {})
            calls = [{"name": c["function"]["name"], "args": c["function"].get("arguments") or {}} for c in msg.get("tool_calls") or []]
            extra, lidas = [], []
            for _ in range(VOLTAS):   # só leu camadas: responde a leitura (como o executor) e pede de novo
                if not calls or any(c["name"] not in LEITURA for c in calls): break
                extra += [{"role": "assistant", "content": msg.get("content", ""), "tool_calls": msg.get("tool_calls")}]
                extra += [{"role": "tool", "content": json.dumps({"camadas": PROVA["camadas"]}, ensure_ascii=False)} for _c in calls]
                lidas += calls
                r, dt2 = chamar(m, caso["pedido"], extra); dt += dt2
                msg = r.get("message", {})
                calls = [{"name": c["function"]["name"], "args": c["function"].get("arguments") or {}} for c in msg.get("tool_calls") or []]
            if lidas and not calls: calls = lidas   # só leu e parou: conta a leitura (vale nos casos de "leitura")
            for c in calls:
                if isinstance(c["args"], str):
                    try: c["args"] = json.loads(c["args"])
                    except Exception: c["args"] = {}
            n, motivo = nota(caso["esperado"], calls)
            if r.get("eval_count") and r.get("eval_duration"): toks.append(r["eval_count"] / (r["eval_duration"] / 1e9))
        except Exception as e:
            dt, n, motivo, calls = 0, 0.0, f"erro: {e}", []
        tempos.append(dt)
        linhas.append({"cat": caso["cat"], "pedido": caso["pedido"], "nota": n, "motivo": motivo, "chamadas": calls, "s": round(dt, 2)})
        print(f"  {'✔' if n == 1 else '½' if n == .5 else '✘'} {caso['pedido'][:48]:48} {dt:5.1f}s  {motivo[:70]}")
    cats = {}
    for l in linhas: cats.setdefault(l["cat"], []).append(l["nota"])
    resultado[m] = {"acerto": round(sum(l["nota"] for l in linhas) / len(linhas) * 100, 1), "por_categoria": {k: round(sum(x) / len(x) * 100) for k, x in cats.items()},
                    "tempo_medio_s": round(sum(tempos) / len(tempos), 2), "tok_s": round(sum(toks) / len(toks), 1) if toks else None, "vram_mb": v, "casos": linhas}
    print(f"  → acerto {resultado[m]['acerto']}% · {resultado[m]['tempo_medio_s']} s/pedido · {resultado[m]['tok_s']} tok/s · VRAM {v} MB")
    try: urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:11434/api/generate", data=json.dumps({"model": m, "keep_alive": 0}).encode()), timeout=60)   # descarrega
    except Exception: pass
    time.sleep(2)

json.dump(resultado, open(os.path.join(AQUI, os.environ.get("ENTREVISTA_SAIDA", "resultado_entrevista.json")), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nRESUMO")
print(f"{'modelo':34} {'acerto':>7} {'s/ped':>6} {'tok/s':>6} {'VRAM':>6}  por categoria")
for m, r in resultado.items():
    if "erro" in r: print(f"{m:34} erro: {r['erro'][:60]}"); continue
    print(f"{m:34} {r['acerto']:6}% {r['tempo_medio_s']:6} {str(r['tok_s']):>6} {str(r['vram_mb']):>6}  " + " ".join(f"{k}:{v}" for k, v in r["por_categoria"].items()))
