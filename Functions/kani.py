"""Kani — assistente de conversa do KANIVETE (tipo ChatGPT, local e offline), para tarefas do dia a dia e,
principalmente, dúvidas de como usar o app.

Modelo: Qwen3.5 9B (desde 2026-10-10; antes Qwen3 8B). Escolhido numa bancada com 6 modelos na RTX 3050 — mesma velocidade
e memória do Qwen3 8B, muito mais honesto (não inventa botão que o app não tem): Instructions/agente/kani-motor.md.
Motor, nesta ordem:
  1. Ollama já instalado e rodando com o qwen3.5:9b (ou, se só houver ele, o qwen3:8b antigo) — não baixa nada;
  2. llama.cpp (llama-server, build Vulkan, ~33 MB: NVIDIA/AMD/Intel) + Qwen3.5-9B-Q4_K_M.gguf (unsloth, Apache 2.0, ~5,7 GB),
     baixados sob demanda na 1ª conversa para <app>/modelos_ia/kani/ (nada no C:, nada instalado no Windows). O GGUF do
     Qwen3 8B antigo é apagado depois que o novo chega.
O servidor do llama.cpp sobe quando precisa, fica preso ao app (fecha junto) e sai da placa depois de OCIOSO s parado.
Ajuda do app: frontend/ajuda/kani_kb.json (tools/kani_kb.py) — trechos dos guias; os mais parecidos com a pergunta
(BM25 simples) entram no prompt, para responder sem inventar menus.
"""
import json
import math
import os
import re
import shutil
import subprocess
import threading
import time
import unicodedata
import urllib.request
import zipfile

from Functions.midia import NO_WINDOW, app_dir

NOME = "Kani"
LLAMA_TAG = "b11483"
LLAMA_ZIP = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}/llama-{LLAMA_TAG}-bin-win-vulkan-x64.zip"
GGUF = "Qwen3.5-9B-Q4_K_M.gguf"
GGUF_URL = "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/" + GGUF
GGUF_ANTIGOS = ("Qwen3-8B-Q4_K_M.gguf",)   # modelos anteriores da Kani: apagados quando o novo chega
TAM = {"zip": 33_404_507, "gguf": 5_680_522_464}
OLLAMA = "http://127.0.0.1:11434"
OLLAMA_MODELOS = ("qwen3.5:9b", "qwen3:8b")   # o 1º que o Ollama tiver (o 8B só para quem ainda não baixou o novo)
OLLAMA_MODELO = OLLAMA_MODELOS[0]             # atualizado por _ollama_tem() com o que estiver instalado
OCIOSO = 300          # s parado até soltar a placa
CTX = 8192

_srv = {"proc": None, "porta": None, "uso": 0.0, "ok": False}
_lock = threading.Lock()
_baixando = threading.Lock()
_cancelar = set()
_kb = {"chunks": None}


def pasta():
    return os.path.join(app_dir(), "modelos_ia", "kani")


def _exe():
    return os.path.join(pasta(), "bin", "llama-server.exe")


def _gguf_novo():
    return os.path.join(pasta(), GGUF)


def _gguf_antigo():
    """Modelo anterior ainda no disco (quem baixou a Kani antes da troca), ou None."""
    return next((c for c in (os.path.join(pasta(), a) for a in GGUF_ANTIGOS) if os.path.isfile(c)), None)


def _gguf():
    """O modelo que o motor carrega: o atual; enquanto ele não chega, o anterior (a Kani segue funcionando na troca)."""
    novo = _gguf_novo()
    return novo if os.path.isfile(novo) else (_gguf_antigo() or novo)


def _ollama_tem():
    """True se o Ollama está rodando com um dos modelos da Kani (OLLAMA_MODELOS, nessa preferência); o escolhido fica
    em OLLAMA_MODELO."""
    global OLLAMA_MODELO
    try:
        with urllib.request.urlopen(OLLAMA + "/api/tags", timeout=1.5) as r:
            nomes = [m.get("name", "") for m in json.loads(r.read()).get("models", [])]
        for alvo in OLLAMA_MODELOS:
            if any(n == alvo or n.startswith(alvo + "-") for n in nomes):
                OLLAMA_MODELO = alvo
                return True
        return False
    except Exception:
        return False


def estado():
    """atualizar=True: quem tem o modelo anterior e não o atual — a interface baixa o novo sozinha, por baixo, e a Kani
    segue no anterior até ele chegar (baixar() apaga o anterior no fim)."""
    llama = os.path.isfile(_exe()) and os.path.isfile(_gguf())
    motor = "ollama" if _ollama_tem() else ("llama" if llama else None)
    falta = (0 if os.path.isfile(_exe()) else TAM["zip"]) + (0 if os.path.isfile(_gguf_novo()) else TAM["gguf"])
    return {"success": True, "nome": NOME, "pronto": bool(motor), "motor": motor, "baixando": _baixando.locked(),
            "atualizar": motor == "llama" and not os.path.isfile(_gguf_novo()), "tamanho_gb": round(falta / 1e9, 1)}


def baixar(on_progress):
    """Motor + modelo em segundo plano. on_progress({pct, msg}) / {fim: True} / {erro}."""
    from Functions.gerador_imagem import _baixar_arquivo
    if not _baixando.acquire(blocking=False):
        return {"success": False, "error": "Já está baixando."}

    def run():
        try:
            os.makedirs(os.path.join(pasta(), "bin"), exist_ok=True)
            if not os.path.isfile(_gguf_novo()) and _gguf_antigo() and shutil.disk_usage(pasta()).free < TAM["gguf"] + 1_000_000_000:
                parar()   # sem espaço para os dois: o anterior sai antes (a Kani fica parada até o novo chegar)
                time.sleep(1)
                _apagar_antigos()
            itens = [(os.path.join(pasta(), "llama.zip"), LLAMA_ZIP, TAM["zip"]), (_gguf_novo(), GGUF_URL, TAM["gguf"])]
            total, antes = sum(t for *_, t in itens), 0
            for destino, url, tam in itens:
                pronto = os.path.isfile(_exe()) if destino.endswith(".zip") else os.path.isfile(destino)
                if not pronto:
                    nome = "o motor" if destino.endswith(".zip") else "o modelo Qwen3.5 9B"

                    def prog(feito, tot, nome=nome, antes=antes):
                        on_progress({"pct": min(99, int((antes + feito) * 100 / total)), "msg": f"Baixando {nome}: {feito / 1e9:.2f} / {max(tot, feito) / 1e9:.2f} GB"})
                    _baixar_arquivo(url, destino, prog)
                if destino.endswith(".zip") and os.path.isfile(destino):
                    with zipfile.ZipFile(destino) as zf:
                        zf.extractall(os.path.join(pasta(), "bin"))
                    os.remove(destino)
                antes += tam
            if not (os.path.isfile(_exe()) and os.path.isfile(_gguf_novo())):
                raise RuntimeError("arquivos incompletos")
            if _gguf_antigo():   # o motor pode estar com o anterior aberto: espera a resposta da vez, desliga e apaga
                for _ in range(240):
                    if not _srv.get("ocupado"):
                        break
                    time.sleep(0.5)
                parar()
                time.sleep(1)
                _apagar_antigos()
            on_progress({"fim": True})
        except Exception as e:
            on_progress({"erro": f"Não foi possível baixar a {NOME}: {e}"})
        finally:
            _baixando.release()
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ─────────────────────────── servidor llama.cpp ───────────────────────────
def _subir():
    from Functions.gerador_imagem import _amarrar, _liberar_gpu_ollama, _porta_livre
    with _lock:
        p = _srv["proc"]
        if p and p.poll() is None and _srv["ok"]:
            return
        _liberar_gpu_ollama()   # um modelo grande por vez na placa: o Ollama (Jr, olho) sai da VRAM antes
        porta = _porta_livre()
        args = [_exe(), "-m", _gguf(), "--host", "127.0.0.1", "--port", str(porta), "-c", str(CTX), "-ngl", "99", "--jinja", "-np", "1"]
        p = subprocess.Popen(args, cwd=os.path.dirname(_exe()), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             stdin=subprocess.DEVNULL, creationflags=NO_WINDOW)
        _amarrar(p)
        _srv.update(proc=p, porta=porta, ok=False, uso=time.time())
        for _ in range(240):   # carregar o modelo na placa: alguns segundos
            if p.poll() is not None:
                raise RuntimeError("o motor da IA fechou ao carregar (memória da placa?)")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{porta}/health", timeout=2) as r:
                    if json.loads(r.read() or b"{}").get("status") == "ok":
                        _srv["ok"] = True
                        break
            except Exception:
                pass
            time.sleep(0.5)
        if not _srv["ok"]:
            raise RuntimeError("o motor da IA não respondeu")
        threading.Thread(target=_vigiar, daemon=True).start()
    try:
        from Functions import memoria
        memoria.usado("kani", parar, OCIOSO)
    except Exception:
        pass


def _vigiar():
    while True:
        time.sleep(20)
        p = _srv["proc"]
        if not p or p.poll() is not None:
            return
        if not _srv.get("ocupado") and time.time() - _srv["uso"] > OCIOSO:
            parar()
            return


def _apagar_antigos():
    """O modelo anterior não serve mais: libera os ~5 GB (tenta de novo se o Windows ainda segura o arquivo)."""
    for a in GGUF_ANTIGOS:
        c = os.path.join(pasta(), a)
        for _ in range(10):
            try:
                if os.path.isfile(c):
                    os.remove(c)
                break
            except OSError:
                time.sleep(1)


def parar():
    p = _srv["proc"]
    _srv.update(proc=None, ok=False)
    if p and p.poll() is None:
        try:
            p.terminate()
        except Exception:
            pass


# ─────────────────────────── ajuda do app (busca) ───────────────────────────
def _norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


_PARADAS = set("a o as os de da do das dos e em no na nos nas um uma uns umas para pra por com como que se eu meu minha".split())


def _tok(s):
    # radical simples: o começo da palavra (removo/remover/remoção → remov; exportar/exportação → expor)
    return [w[:5] for w in re.findall(r"[a-z0-9]+", _norm(s)) if len(w) > 2 and w not in _PARADAS]


def _carregar_kb():
    if _kb["chunks"] is None:
        cands = [os.path.join(app_dir(), "frontend", "ajuda", "kani_kb.json"), os.path.join(app_dir(), "_internal", "frontend", "ajuda", "kani_kb.json")]
        dados = {"chunks": [], "ferramentas": []}
        for c in cands:
            if os.path.isfile(c):
                dados = json.load(open(c, encoding="utf-8"))
                break
        docs = [_tok((ch["titulo"] + " ") * 4 + ch["texto"]) for ch in dados["chunks"]]   # título pesa mais
        df = {}
        for d in docs:
            for w in set(d):
                df[w] = df.get(w, 0) + 1
        _kb.update(chunks=dados["chunks"], ferramentas=dados.get("ferramentas", []), barra=dados.get("barra", []), resumos=dados.get("resumos", {}), docs=docs, df=df,
                   media=sum(map(len, docs)) / max(1, len(docs)))
    return _kb


def buscar(pergunta, n=4):
    kb = _carregar_kb()
    q = _tok(pergunta)
    if not q or not kb["chunks"]:
        return []
    N, notas = len(kb["docs"]), []
    for i, d in enumerate(kb["docs"]):
        tf, s = {}, 0.0
        for w in d:
            tf[w] = tf.get(w, 0) + 1
        for w in set(q):
            if w in tf:
                idf = math.log(1 + (N - kb["df"][w] + 0.5) / (kb["df"][w] + 0.5))
                s += idf * tf[w] * 2.2 / (tf[w] + 1.2 * (0.25 + 0.75 * len(d) / kb["media"]))
        if s > 0:
            notas.append((s, i))
    notas.sort(reverse=True)
    return [kb["chunks"][i] for _, i in notas[:n]]


def _sistema(pergunta, ferramenta):
    kb = _carregar_kb()
    trechos = buscar(pergunta + " " + (ferramenta or ""))
    doc = "\n\n".join(f"### {t['titulo']}\n{t['texto']}" for t in trechos) or "(nada encontrado)"
    ids = ", ".join(f"{i} = {n}" for i, n in kb["ferramentas"])
    barra = "; ".join(f"{g}: {', '.join(n)}" for g, n in kb.get("barra", []))
    resumos = chr(10).join(f"- {n}: {r}" for n, r in kb.get("resumos", {}).items())
    return f"""Você é a {NOME}, assistente do KANIVETE — um app de criação para Windows com Editor Kanivete (vídeo), Photo Kanivete \
(imagem), Vetor Kanivete (vetor/gráfica), Sound Kanivete (áudio) e ferramentas rápidas (converter, comprimir, baixar vídeo, \
remover fundo, transcrever, gerar voz...). Tudo roda no computador da pessoa, sem internet.
FATOS FIXOS (use exatamente assim):
- O KANIVETE foi criado por Wellington Pailer. Não diga que é de uma equipe, nem que é código aberto, nem cite site.
- Barra lateral à esquerda, por seção: {barra}. Preferências fica no fim da barra (engrenagem).
- Exportar vídeo no Editor Kanivete: botão Exportar no canto de cima à direita (ou Ctrl+M) — abre o Kanivete Encoder:
  configurações à esquerda, fila de render à direita; "Adicionar à fila" e ▶ Renderizar (vários vídeos em ordem).
O QUE CADA FERRAMENTA FAZ (palavras da própria tela; vale mais que os trechos lá embaixo):
{resumos}
Regras:
- Responda em português do Brasil, simples e direto, em passos curtos quando for "como faço". Quem pergunta é usuário, não programador:
  NUNCA cite arquivos, código, funções, APIs ou nomes técnicos internos (ex.: .js, .py, veAlgumaCoisa, window.X).
- Sobre o KANIVETE, afirme só o que está na AJUDA abaixo (traduzindo para a linguagem de quem usa). Se a ajuda não cobre,
  diga que não tem certeza e sugira onde procurar no app. Não invente menus nem botões.
- Para outras tarefas (textos, ideias, roteiros, contas, dúvidas gerais) ajude normalmente.
- Quando entregar um texto PRONTO para a pessoa usar (legenda, post, e-mail, mensagem, roteiro, título), coloque só esse
  texto dentro de um bloco ```texto … ``` sem **negrito** nem markdown dentro (emojis e hashtags podem); comentários e
  explicações ficam fora do bloco. SEMPRE com o bloco, mesmo quando a resposta é só o texto — é dele que sai o botão Copiar.
  Só o formato (o assunto é outro): pedido "aviso de fila na padaria" → "Aqui vai:\n```texto\nHoje a fila anda rápido, prometo! 🥖\n```".
  Código vai em ```linguagem … ```.
- Quando a resposta ensina a usar uma ferramenta do app, termine SEMPRE com o marcador [[abrir:ID]] (uma vez, exatamente
  nesse formato, com "abrir:"), usando o ID desta lista: {ids}. Ex.: "...e clique em Salvar. [[abrir:remover-fundo]]".
  Em conversa geral (quem criou, ideias, textos) não ponha.
A pessoa está agora em: {ferramenta or 'tela inicial'}.

AJUDA DO KANIVETE (trechos dos guias):
{doc}"""


# ─────────────────────────── conversa ───────────────────────────
def conversar(cid, mensagens, ferramenta, on_evento):
    """Roda em thread: on_evento({id, delta}) a cada pedaço, {id, fim: True} ou {id, erro}."""
    def run():
        try:
            ult = next((m["content"] for m in reversed(mensagens) if m.get("role") == "user"), "")
            msgs = [{"role": "system", "content": _sistema(ult, ferramenta)}] + [m for m in mensagens[-12:] if m.get("role") in ("user", "assistant")]
            if _ollama_tem():
                corpo = {"model": OLLAMA_MODELO, "messages": msgs, "stream": True, "think": False, "keep_alive": "5m",
                         "options": {"num_ctx": CTX, "temperature": 0.6}}
                req = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=600) as r:
                    for linha in r:
                        if cid in _cancelar:
                            break
                        if linha.strip():
                            j = json.loads(linha)
                            d = (j.get("message") or {}).get("content", "")
                            if d:
                                on_evento({"id": cid, "delta": d})
                            if j.get("done"):
                                break
            else:
                if not (os.path.isfile(_exe()) and os.path.isfile(_gguf())):
                    raise RuntimeError("a IA ainda não foi baixada")
                on_evento({"id": cid, "status": "Acordando a IA…"})
                _subir()
                _srv["ocupado"] = True
                corpo = {"messages": msgs, "stream": True, "temperature": 0.6, "chat_template_kwargs": {"enable_thinking": False}}
                req = urllib.request.Request(f"http://127.0.0.1:{_srv['porta']}/v1/chat/completions", data=json.dumps(corpo).encode(),
                                             headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=600) as r:
                    for linha in r:
                        if cid in _cancelar:
                            break
                        linha = linha.decode("utf-8", "replace").strip()
                        if not linha.startswith("data:"):
                            continue
                        dado = linha[5:].strip()
                        if dado == "[DONE]":
                            break
                        d = ((json.loads(dado).get("choices") or [{}])[0].get("delta") or {}).get("content") or ""
                        if d:
                            on_evento({"id": cid, "delta": d})
            on_evento({"id": cid, "fim": True, "parado": cid in _cancelar})
        except Exception as e:
            on_evento({"id": cid, "erro": str(e)})
        finally:
            _cancelar.discard(cid)
            _srv["ocupado"] = False
            _srv["uso"] = time.time()
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


VOZ = "fran"          # voz da Kani ao ler em voz alta (OmniVoice; a 1ª salva se não houver)
_falas = {}           # texto → arquivo já sintetizado (não refaz a mesma fala)


def voz_ligar(ligar):
    """Chat aberto: deixa a voz carregada (a 1ª leitura já sai rápida); fechado: libera a memória."""
    from Functions import omnivoice_tool as ov
    if ligar:
        threading.Thread(target=lambda: _tenta(ov.manter_carregado), daemon=True).start()
    else:
        ov.descarregar()
    return {"success": True}


def _tenta(f):
    try:
        f()
    except Exception:
        pass


# como a voz deve dizer nomes do app e siglas (o OmniVoice lê "Photo" em inglês e inventa "Kanivete")
PRONUNCIA = [
    (r"\bPhoto\b", "Fôto"), (r"\bSound\b", "Sáund"), (r"\bKanivete\b", "Canivete"), (r"\bKANIVETE\b", "Canivete"),
    (r"\bKani\b", "Cáni"), (r"\bEncoder\b", "Encôder"), (r"\bPremiere\b", "Premiér"), (r"\bPhotoshop\b", "Fotochóp"),
    (r"\bIllustrator\b", "Ilustreitor"), (r"\bCtrl\b", "Control"), (r"\bShift\b", "Chift"), (r"\bDelete\b", "Delíte"),
    (r"\bPNG\b", "pê ene gê"), (r"\bJPE?G\b", "jota pê gê"), (r"\bPSD\b", "pê esse dê"), (r"\bPDF\b", "pê dê éfe"),
    (r"\bMP4\b", "eme pê quatro"), (r"\bMP3\b", "eme pê três"), (r"\bWAV\b", "uêivi"), (r"\bSVG\b", "esse vê gê"),
    (r"\bIA\b", "I A"), (r"\bGPU\b", "gê pê u"), (r"\b4K\b", "quatro cá"), (r"\s\+\s", " mais "), (r"\s/\s", " ou "),
]


def para_voz(texto):
    for a, b in PRONUNCIA:
        texto = re.sub(a, b, texto)
    return texto


def falar(texto, on_evento, chave):
    """Lê o texto com a voz da Kani (OmniVoice, 12 passos + pronúncia dos nomes do app). on_evento({chave, url} | {chave, erro})."""
    def run():
        try:
            from Functions import media_server
            from Functions.omnivoice_tool import list_voices, synthesize
            arq = _falas.get(texto)
            if not (arq and os.path.isfile(arq)):
                vozes = list_voices()
                if not vozes:
                    raise RuntimeError("nenhuma voz salva (crie uma em Geração de Voz)")
                v = next((x for x in vozes if (x.get("name") or "").strip().lower() == VOZ), vozes[0])
                r = synthesize(v["id"], para_voz(texto), {"num_step": 12, "language": "pt", "speed": 1.0, "normalize_text": True, "respiro": True})
                arq = r.get("output_path")
                _falas[texto] = arq
            on_evento({"chave": chave, "url": media_server.register(arq)})
        except Exception as e:
            on_evento({"chave": chave, "erro": str(e)})
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def cancelar(cid):
    _cancelar.add(cid)
    return {"success": True}
