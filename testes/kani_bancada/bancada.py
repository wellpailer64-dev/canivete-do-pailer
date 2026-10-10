"""Bancada da Kani: o mesmo pedido que o app manda, para cada modelo do Ollama. Quatro provas:
  A) ajuda do app (sistema e trechos reais da Kani: kani._sistema) — fatos esperados, nada de nome técnico, sem inventar
  B) reescrever pedido de efeito sonoro (gerador_sfx.SISTEMA_PEDIDO) — inglês, tamanho, palavras proibidas
  C) seguir formato JSON (estilo contrato do Worker) — JSON válido com os campos e valores certos
  D) velocidade/memória — tokens/s, tempo até a 1ª palavra, carga, memória da placa (api/ps)
Uso: py -3.13 testes/kani_bancada/bancada.py modelo1 modelo2 ...   → testes/kani_bancada/resultados/res_<modelo>.json"""
import json, os, re, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from Functions import kani, gerador_sfx

OLLAMA = "http://127.0.0.1:11434"
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resultados")


def chat(modelo, msgs, temp=0.6, json_fmt=False, num_predict=700):
    num_predict = int(num_predict * float(os.environ.get("NP_MULT", "1")))
    corpo = {"model": modelo, "messages": msgs, "stream": True, "think": False, "keep_alive": "10m",
             "options": {"num_ctx": kani.CTX, "temperature": temp, "seed": 42, "num_predict": num_predict}}
    t0 = time.time(); prim = None; txt = ""; fim = {}
    req = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        for linha in r:
            if not linha.strip():
                continue
            j = json.loads(linha)
            d = (j.get("message") or {}).get("content", "")
            if d and prim is None:
                prim = time.time() - t0
            txt += d
            if j.get("done"):
                fim = j
                break
    txt = re.sub(r"<think>.*?</think>", "", txt, flags=re.S).strip()
    ev = fim.get("eval_count", 0); evd = fim.get("eval_duration", 1) / 1e9
    return txt, {"total_s": round(time.time() - t0, 2), "primeira_s": round(prim or 0, 2), "tokens": ev,
                 "tok_s": round(ev / evd, 1) if evd else 0, "carga_s": round(fim.get("load_duration", 0) / 1e9, 2)}


# ── A) ajuda do app ──
TECNICO = re.compile(r"\b\w+\.(js|py|json|html)\b|\bve[A-Z]\w+|window\.|Functions/|frontend/", re.I)
AJUDA = [
    ("Como eu exporto um vídeo no editor?", "Editor Kanivete", [r"exportar", r"ctrl\s*\+\s*m|encoder|fila"], []),
    ("Quem criou o Kanivete?", None, [r"wellington pailer"], [r"equipe", r"c[oó]digo aberto", r"open.?source", r"www\.|https?://"]),
    ("Como removo o fundo de uma foto?", None, [r"remover fundo"], []),
    ("Consigo abrir um projeto do Premiere no Kanivete?", "Editor Kanivete", [r"\.prproj|premiere"], [r"n[aã]o (é|e) poss[ií]vel abrir"]),
    ("Como faço legenda automática do que as pessoas falam no vídeo?", "Editor Kanivete", [r"transcre|legenda"], []),
    ("O Kanivete precisa de internet pra funcionar?", None, [r"sem internet|no (seu )?computador|offline|local"], [r"precisa (sim )?de internet para (tudo|funcionar)"]),
    ("Como eu mando o vídeo direto pro TikTok pelo Kanivete, sem sair do app?", "Editor Kanivete",
     [r"n[aã]o (tenho certeza|encontrei|h[aá]|existe|tem|d[aá])|n[aã]o.*(op[cç][aã]o|recurso|fun[cç][aã]o)"], [r"bot[aã]o .{0,20}tiktok", r"menu .{0,30}tiktok", r"publicar no tiktok"]),
    ("Escreva uma legenda curta e animada para um reels de academia.", None, [r"```texto"], []),
]


def prova_ajuda(modelo):
    res = []
    for perg, ferr, deve, nao_deve in AJUDA:
        msgs = [{"role": "system", "content": kani._sistema(perg, ferr)}, {"role": "user", "content": perg}]
        txt, m = chat(modelo, msgs)
        baixo = txt.lower()
        ok_deve = [bool(re.search(p, baixo)) for p in deve]
        ruim = [p for p in nao_deve if re.search(p, baixo)]
        tec = TECNICO.findall(txt)
        pts = sum(ok_deve) / len(ok_deve) - 0.5 * bool(ruim) - 0.5 * bool(tec)
        res.append({"pergunta": perg, "resposta": txt, "pontos": round(max(0, pts), 2), "faltou": [p for p, o in zip(deve, ok_deve) if not o],
                    "proibido": ruim, "tecnico": [t if isinstance(t, str) else t[0] for t in tec][:5], "medidas": m})
    return res


# ── B) reescrever pedido de efeito sonoro ──
SFX = [("porta de madeira rangendo", 4), ("whoosh rápido de transição", 2), ("cafeteria cheia de gente", 10),
       ("som de notificação de celular", 2), ("riser de tensão pra antes da virada", 6), ("cachorro latindo longe e carro passando", 8),
       ("impacto pesado tipo trailer de filme", 3), ("vidro quebrando", 3), ("chuva fraca na janela à noite", 10),
       ("passos rápidos numa escada de madeira", 5), ("multidão aplaudindo num estádio", 8), ("teclado digitando rápido", 5)]
PROIBIDAS = re.compile(r"\b(cinematic|high quality|4k|sfx|loop|groan\w*|moan\w*|scream\w*|cry|cries|crying)\b", re.I)
PT = re.compile(r"[ãõçáéíóúâêô]|\b(de|com|uma|um|na|no|que|para|porta|chuva|vidro)\b", re.I)


def prova_sfx(modelo):
    res = []
    for pedido, seg in SFX:
        msgs = [{"role": "system", "content": gerador_sfx.SISTEMA_PEDIDO.replace("{seg}", str(seg))}, {"role": "user", "content": pedido}]
        txt, m = chat(modelo, msgs, temp=0, num_predict=160)
        cap = gerador_sfx._limpa_resposta(txt, "")
        n = len(cap.split())
        falhas = []
        if not cap: falhas.append("vazio")
        if PT.search(cap): falhas.append("não está em inglês")
        if not (6 <= n <= 30): falhas.append(f"{n} palavras")
        if PROIBIDAS.search(cap): falhas.append("palavra proibida: " + PROIBIDAS.search(cap).group(0))
        if len([l for l in txt.splitlines() if l.strip()]) > 1: falhas.append("mais de uma linha")
        res.append({"pedido": pedido, "seg": seg, "saida": cap, "bruto": txt[:300], "falhas": falhas, "medidas": m})
    return res


# ── C) formato JSON (contrato) ──
JSON_CASOS = [
    ("Extraia os dados do pedido e responda SÓ com JSON no formato {\"cliente\": texto, \"valor\": número, \"data\": \"AAAA-MM-DD\", \"itens\": [texto]}.\n\n"
     "Pedido: a Padaria Sol fechou ontem, dia 3 de março de 2026, 2 banners e 1 adesivo de vitrine, total de R$ 1.250,50.",
     {"cliente": lambda v: "sol" in str(v).lower(), "valor": lambda v: abs(float(v) - 1250.5) < 0.01, "data": lambda v: v == "2026-03-03",
      "itens": lambda v: isinstance(v, list) and len(v) >= 2}),
    ("Transforme o pedido em comandos do editor. Ações permitidas: cortar(t), mover(clipe, t), volume(trilha, db), texto(t, conteudo). "
     "Responda SÓ com JSON: {\"comandos\": [{\"acao\": nome, \"args\": {...}}]}.\n\nPedido: corta em 12 segundos, baixa a trilha A2 em 6 dB e "
     "põe o texto 'Promoção' em 3 segundos.",
     {"comandos": lambda v: isinstance(v, list) and {c.get("acao") for c in v} == {"cortar", "volume", "texto"}}),
    ("Classifique cada comentário como positivo, negativo ou neutro. Responda SÓ com JSON {\"rotulos\": [..]} na mesma ordem.\n"
     "1) amei o vídeo!! 2) o som ficou horrível 3) postado às 14h 4) não gostei da cor 5) incrível, parabéns",
     {"rotulos": lambda v: [str(x).lower() for x in v] == ["positivo", "negativo", "neutro", "negativo", "positivo"]}),
    ("Some os valores e responda SÓ com JSON {\"total\": número, \"maior\": texto}.\nCâmera 3200, lente 1850,50, tripé 349,90.",
     {"total": lambda v: abs(float(v) - 5400.4) < 0.01, "maior": lambda v: "c" in str(v).lower() and "mera" in str(v).lower()}),
    ("Responda SÓ com JSON {\"ok\": booleano, \"motivo\": texto}: a resolução 1080x1920 é vertical (9:16)?",
     {"ok": lambda v: v is True, "motivo": lambda v: isinstance(v, str) and len(v) > 3}),
    ("Separe nome e sobrenome de cada pessoa e responda SÓ com JSON {\"pessoas\": [{\"nome\": texto, \"sobrenome\": texto}]}.\n"
     "Ana Lúcia Ferreira; Carlos Eduardo de Souza; Bia Lima",
     {"pessoas": lambda v: isinstance(v, list) and len(v) == 3 and v[2].get("nome", "").lower().startswith("bia")}),
]


def _json_de(txt):
    t = txt.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
    cerca = bool(m)
    if m: t = m.group(1).strip()
    i, j = t.find("{"), t.rfind("}")
    extra = bool(t[:i].strip() or t[j + 1:].strip()) if i >= 0 else True
    return json.loads(t[i:j + 1]) if i >= 0 else None, cerca, extra


def prova_json(modelo):
    res = []
    for pedido, checks in JSON_CASOS:
        txt, m = chat(modelo, [{"role": "user", "content": pedido}], temp=0, num_predict=500)
        falhas = []
        try:
            obj, cerca, extra = _json_de(txt)
            if obj is None: raise ValueError("sem JSON")
            for k, f in checks.items():
                try:
                    if not f(obj[k]): falhas.append(f"{k} errado")
                except Exception:
                    falhas.append(f"{k} faltando/inválido")
            if extra: falhas.append("texto fora do JSON")
        except Exception as e:
            falhas.append("JSON inválido")
        res.append({"pedido": pedido[:80], "resposta": txt[:400], "falhas": falhas, "medidas": m})
    return res


def vram(modelo):
    try:
        with urllib.request.urlopen(OLLAMA + "/api/ps", timeout=5) as r:
            for x in json.loads(r.read())["models"]:
                if x["name"] == modelo:
                    return round(x.get("size_vram", 0) / 2**30, 2), round(x.get("size", 0) / 2**30, 2)
    except Exception:
        pass
    return None, None


def descarregar(modelo):
    try:
        urllib.request.urlopen(urllib.request.Request(OLLAMA + "/api/generate", data=json.dumps({"model": modelo, "keep_alive": 0}).encode(),
                                                      headers={"Content-Type": "application/json"}), timeout=60).read()
    except Exception:
        pass


for modelo in sys.argv[1:]:
    for outro in sys.argv[1:]:
        descarregar(outro)
    time.sleep(3)
    print(f"\n=== {modelo}", flush=True)
    t = time.time()
    r = {"modelo": modelo}
    r["ajuda"] = prova_ajuda(modelo)
    r["vram_gb"], r["tamanho_gb"] = vram(modelo)
    r["sfx"] = prova_sfx(modelo)
    r["json"] = prova_json(modelo)
    todos = [x["medidas"] for k in ("ajuda", "sfx", "json") for x in r[k]]
    r["resumo"] = {
        "ajuda_pontos": round(sum(x["pontos"] for x in r["ajuda"]) / len(r["ajuda"]) * 10, 1),
        "sfx_ok": sum(1 for x in r["sfx"] if not x["falhas"]), "sfx_total": len(r["sfx"]),
        "json_ok": sum(1 for x in r["json"] if not x["falhas"]), "json_total": len(r["json"]),
        "tok_s": round(sum(x["tok_s"] for x in todos) / len(todos), 1),
        "primeira_s": round(sorted(x["primeira_s"] for x in todos)[len(todos) // 2], 2),
        "carga_s": max(x["carga_s"] for x in todos), "vram_gb": r["vram_gb"], "tempo_total_min": round((time.time() - t) / 60, 1)}
    print(json.dumps(r["resumo"], ensure_ascii=False), flush=True)
    json.dump(r, open(f"{SAIDA}/res{os.environ.get("SUFIXO", "")}_{modelo.replace(':', '_').replace('/', '_')}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    descarregar(modelo)
