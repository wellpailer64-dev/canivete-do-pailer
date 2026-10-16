"""
kani_agente.py — a Kani trabalhando EM ETAPAS (agente): planeja, usa ferramentas uma de cada vez, olha o resultado,
decide o próximo passo e entrega. Feito para o modelo local pequeno (Qwen3.5 4B):
- cada passo é uma chamada curta com a resposta TRAVADA em JSON (response_format com schema no llama.cpp): o modelo não
  sai do formato e a memória do que já foi feito fica com o app (os arquivos viram A1, A2... — o modelo nunca vê caminho);
- ferramentas "grossas" e já testadas (as da kani_criar), cada uma valida os argumentos e devolve um resumo curto;
- limite de passos e um passo final "entregar" (o que foi pedido, arquivos e uma mensagem).
Eventos para o chat (kaniAgente): {job, plano} / {job, passo: {n, pensamento, acao, estado, resumo}} /
{job, fim, mensagem, arquivos: [{tipo, path, url, nome, texto}]} / {job, erro}.
"""
import json
import os
import re
import shutil
import threading
import time
import urllib.request

from Functions import kani, kani_criar

MAX_PASSOS = 10
_ocupado = threading.Lock()
_cancelar = set()

FERRAMENTAS = {
    "escrever": ("Escreve um texto em português (roteiro, legenda, falas, slogan...). args: {instrucao}", False),
    "gerar_imagem": ("Gera uma imagem realista ou ilustração. args: {descricao (o que mostrar, com detalhes), formato: quadrado|vertical|horizontal|feed}", True),
    "gerar_efeito": ("Gera um efeito sonoro curto (sem fala, sem música). args: {descricao, segundos (1 a 10)}", True),
    "narrar": ("Grava um texto com voz. args: {texto, voz: mulher|homem}", False),
    "conversa": ("Grava uma conversa entre um homem e uma mulher. args: {falas: [{papel: H|M, texto}]}", False),
    "buscar_musica": ("Escolhe uma música de fundo da biblioteca. args: {clima: calma|alegre|animada|intensa|melancolica, segundos_min}", False),
    "montar_vinheta": ("Mixa uma voz gravada (A?) com música de fundo (A? de buscar_musica, opcional) e impacto. args: {voz: 'A1', musica: 'A2'}", False),
    "pesquisar_web": ("Pesquisa na internet, lê as melhores páginas e devolve um resumo estruturado com as fontes (vira um texto A?). args: {pergunta}", False),
    "ler_documento": ("Lê o texto de um PDF, Word ou TXT anexado (vira um texto A?). args: {arquivo: 'A1'}", False),
    "salvar_documento": ("Salva um texto em arquivo bonito. args: {formato: pdf|docx|txt|md, titulo, conteudo (texto em markdown OU o nome de um texto, ex.: 'A2')}", False),
    "remover_fundo": ("Tira o fundo de uma imagem (anexada ou gerada) e devolve PNG transparente. args: {imagem: 'A1'}", True),
    "montar_flyer": ("Monta um FLYER/cartaz/post de divulgação no Photo Kanivete, ao vivo na tela (layout, foto, textos) e salva o projeto editável. "
                     "args: {pedido: o pedido com TODAS as informações (nome, data, hora, local, preço, contato), foto (opcional): 'A1' imagem anexada/criada}", True),
    "entregar": ("Termina e entrega. args: {arquivos: ['A1', ...] (só arquivos), resposta (opcional: texto em markdown para mostrar no chat, ou o nome de um texto 'A3'), mensagem (1 ou 2 frases)}", False),
}

_SISTEMA = """Você é a Kani, assistente do app KANIVETE, trabalhando EM ETAPAS com FERRAMENTAS REAIS que rodam no computador
da pessoa. Você CONSEGUE gerar imagens, efeitos sonoros, narrações, conversas e vinhetas usando as ferramentas abaixo —
nunca diga que não consegue. A cada resposta escolha UMA ação; o app executa e te devolve o resultado; então decida a
próxima. Os arquivos criados recebem nomes A1, A2, A3... use esses nomes nos argumentos.

FERRAMENTAS:
{ferramentas}

REGRAS:
- Na PRIMEIRA resposta preencha "plano" com as etapas (curtas) e já faça a primeira ação.
- Faça só o que foi pedido, bem feito. Textos em português do Brasil, naturais, sem emojis nem hashtags quando forem falados.
- Vinheta = voz (narrar ou conversa) + buscar_musica + montar_vinheta. Narração simples = narrar.
- Se uma ferramenta der erro, tente corrigir os argumentos uma vez; se não der, siga sem ela e explique na entrega.
- REVISE antes de seguir, sem ser rígida: se o pedido tem duração (ex.: 15 segundos), compare com a duração que voltou.
  Entre 75% e 125% do pedido (ex.: 11 a 19 s para 15 s) e com o texto bom, SIGA com ele. Só fora disso reescreva
  (~2,3 palavras por segundo) e grave de novo — no máximo uma vez.
- Vinheta: a música fica por baixo da voz, ~10 dB mais baixa (o montar_vinheta já faz isso); buscar_musica sempre acha uma
  (baixa da internet se a biblioteca não tiver).
- Na mensagem de entrega não cite A1/A2: diga o que foi feito em uma ou duas frases.
- Pesquisa: pesquisar_web e entregue com resposta = o texto da pesquisa (ex.: 'A1'); só salve em PDF/DOC/TXT se pedirem.
- Documento: escreva o conteúdo (escrever, em markdown com ## seções e listas) ou use um texto pronto (pesquisa, leitura)
  e chame salvar_documento com conteudo = o nome do texto (ex.: 'A2'). Título curto e claro.
- Flyer, cartaz, panfleto ou post de divulgação = montar_flyer como PRIMEIRA ação (ele mesmo escreve os textos e gera a
  foto: não use escrever nem gerar_imagem antes; passe foto só se a pessoa anexou ou já criou uma) e depois entregar.
- Imagem anexada ou já criada nesta conversa: use o nome dela (A1...) nas ferramentas (ex.: remover_fundo) — NÃO gere
  outra. Nunca invente arquivo que não existe.
- Termine SEMPRE com "entregar", listando os arquivos que respondem ao pedido (não liste intermediários como a voz crua
  usada numa vinheta, a não ser que peçam). No máximo {max} ações."""

_SCHEMA = {"type": "object", "properties": {
    "plano": {"type": "array", "items": {"type": "string"}},
    "pensamento": {"type": "string"},
    "acao": {"type": "string", "enum": list(FERRAMENTAS)},
    "args": {"type": "object"}},
    "required": ["pensamento", "acao", "args"]}

_COMPLEXO = re.compile(r"(roteiro|campanha|\bkit\b|pacote|s[eé]rie|v[aá]ri[ao]s|e depois|tamb[eé]m|junto com|al[eé]m d|"
                       r"\bpdf\b|\bdocx?\b|\bword\b|\btxt\b|documento|arquivo de texto|apostila|relat[oó]rio|"
                       r"pesquis|procur[ae] na (?:internet|web)|busca na (?:internet|web)|na internet|not[ií]cias|"
                       r"(?:tir[ae]|remov[ae]|apag[ae]|recort[ae]).{0,25}fundo|sem fundo|"
                       r"\bfl[ae]?y[ae]rs?\b|cartaz|panfleto|post de divulga|arte (?:de|para) divulga|"
                       r"resum[aeo].{0,20}(?:pdf|documento|arquivo|anexo|texto)|"
                       r"\b(?:\d+|duas|dois|tr[eê]s|quatro)\s+(?:imagens|fotos|vinhetas|narra|efeitos|vers)|"
                       r"(?:imagem|foto).{0,60}(?:narra|vinhet|som|efeito|m[uú]sica)|(?:narra|vinhet|som|efeito).{0,60}(?:imagem|foto))", re.I)


_FLYER = re.compile(r"\bfl[ae]?y[ae]rs?\b|cartaz|panfleto|post de divulga|arte (?:de|para) divulga", re.I)


def precisa(texto):
    """Pedido composto (mais de uma coisa, roteiro, campanha, "também"...) ou que usa uma habilidade (PDF/doc/txt, pesquisa
    na web, tirar fundo, resumir documento): vai para o agente, não para a criação direta."""
    t = texto or ""
    if re.match(r"^\s*(como|onde|qual|o que [eé]|por ?que)\b.{0,60}\b(app|kanivete|ferramenta|bot[aã]o|menu)\b", t, re.I):
        return False   # dúvida de como usar o app: conversa normal
    return bool(_COMPLEXO.search(t))


def _chamar(msgs, max_tokens=700, primeiro=False):
    """Um passo: resposta travada no schema (no 1º, o plano é obrigatório). llama.cpp da Kani (ou Ollama com format)."""
    sch = dict(_SCHEMA, required=["plano"] + _SCHEMA["required"]) if primeiro else _SCHEMA
    if kani._ollama_tem():
        corpo = {"model": kani.OLLAMA_MODELO, "stream": False, "messages": msgs, "think": False, "format": sch,
                 "options": {"temperature": 0.3, "num_predict": max_tokens}}
        req = urllib.request.Request(kani.OLLAMA + "/api/chat", data=json.dumps(corpo).encode("utf-8"),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            out = json.loads(r.read().decode("utf-8")).get("message", {}).get("content", "")
    else:
        if not (os.path.exists(kani._exe()) and os.path.exists(kani._gguf())):
            raise RuntimeError("a IA da Kani ainda não foi baixada")
        kani._subir()
        corpo = {"messages": msgs, "temperature": 0.3, "max_tokens": max_tokens, "stream": False,
                 "chat_template_kwargs": {"enable_thinking": False}, "response_format": {"type": "json_object", "schema": sch}}
        req = urllib.request.Request(f"http://127.0.0.1:{kani._srv['porta']}/v1/chat/completions",
                                     data=json.dumps(corpo).encode("utf-8"), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            out = json.loads(r.read().decode("utf-8"))["choices"][0]["message"]["content"]
    try:
        return json.loads(out)
    except ValueError:   # cortou no limite de tokens: o objeto até onde veio fechado
        m = re.search(r"\{.*\}", out or "", re.S)
        if m:
            return json.loads(m.group(0))
        raise


def _chamar_seguro(msgs, primeiro=False):
    """Anti-erro: JSON quebrado ou motor engasgado → tenta de novo uma vez com mais espaço (e o motor reiniciado)."""
    try:
        return _chamar(msgs, 700, primeiro)
    except Exception:
        try:
            kani.parar()
        except Exception:
            pass
        return _chamar(msgs + [{"role": "user", "content": "Responda de novo, só o JSON, curto."}], 1100, primeiro)


class _Estado:
    def __init__(self, job, on):
        self.job, self.on, self.arq, self.n = job, on, {}, 0

    def novo(self, tipo, path, texto="", extra=None):
        self.n += 1
        k = f"A{self.n}"
        self.arq[k] = {"tipo": tipo, "path": path, "nome": os.path.basename(path) if path else "", "texto": texto, **(extra or {})}
        return k

    def texto(self, v):
        """Um texto: o nome de um texto já feito ('A3') vira o conteúdo dele; senão o próprio valor."""
        v = str(v or "").strip()
        a = self.arq.get(v)
        return (a.get("conteudo") or a.get("texto") or "") if a else v

    def arquivo(self, v, tipos):
        a = self.arq.get(str(v or "").strip())
        if not a or not a.get("path") or a["tipo"] not in tipos:
            disp = ", ".join(f"{k} ({x['tipo']})" for k, x in self.arq.items() if x["tipo"] in tipos) or "nenhum"
            raise ValueError(f"precisa de um {'/'.join(tipos)} — disponíveis: {disp}")
        return a

    def pct(self, p, msg):
        self.on({"job": self.job, "progresso": {"pct": int(p), "msg": msg}})


def _executar(est, acao, a):
    """Roda a ferramenta; devolve o resumo que volta para o modelo."""
    nome = time.strftime("%Y%m%d_%H%M%S")
    on = est.pct
    if acao == "escrever":
        instr = str(a.get("instrucao") or "").strip()
        if not instr:
            raise ValueError("falta 'instrucao'")
        t = kani_criar._llm("Escreva em português do Brasil exatamente o que for pedido, pronto para usar, sem comentários. "
                            "Use markdown (## títulos, listas) quando for um documento.", instr, 900, 0.7)
        if not t:
            raise RuntimeError("não consegui escrever")
        k = est.novo("texto", None, t[:300], {"conteudo": t})
        return f"Texto escrito ({k}):\n{t[:1200]}"
    if acao == "pesquisar_web":
        from Functions import kani_skills
        perg = str(a.get("pergunta") or "").strip()
        if not perg:
            raise ValueError("falta 'pergunta'")
        resumo, fontes = kani_skills.pesquisar(perg, on)
        k = est.novo("texto", None, resumo[:300], {"conteudo": resumo})
        return f"Pesquisa pronta ({k}, {len(fontes)} fontes). Início do resumo:\n{resumo[:1500]}"
    if acao == "ler_documento":
        from Functions import kani_skills
        doc = est.arquivo(a.get("arquivo"), ("anexo_doc",))
        t = kani_skills.ler(doc["path"])
        k = est.novo("texto", None, t[:300], {"conteudo": t})
        return f"Documento lido ({k}, {len(t)} caracteres). Começo:\n{t[:1500]}"
    if acao == "salvar_documento":
        from Functions import kani_skills
        conteudo = est.texto(a.get("conteudo"))
        titulo = str(a.get("titulo") or "Documento").strip()[:80]
        path = kani_skills.documento(str(a.get("formato") or "pdf"), titulo, conteudo)
        return f"Documento salvo: {est.novo('documento', path, titulo)} ({os.path.splitext(path)[1][1:].upper()})."
    if acao == "remover_fundo":
        from Functions import kani_skills
        img = est.arquivo(a.get("imagem"), ("imagem", "anexo_imagem"))
        kani_criar._liberar_placa()
        on(20, "Recortando (pessoa: cabelo fio a fio; objeto: borda limpa)...")
        path = kani_skills.remover_fundo(img["path"])
        return f"Fundo removido: {est.novo('imagem', path, 'sem fundo')} (PNG transparente)."
    if acao == "montar_flyer":
        from Functions import kani_maos
        ped = str(a.get("pedido") or "").strip()
        if not ped:
            raise ValueError("falta 'pedido'")
        foto = est.arquivo(a.get("foto"), ("imagem", "anexo_imagem"))["path"] if a.get("foto") else None
        r = kani_maos.montar_flyer(ped, kani_criar.pasta(), foto, on)
        f = r["ficha"]
        k = est.novo("imagem", r["previa"], f["titulo"], {"flyer": True}) if r["previa"] else None
        kp = est.novo("documento", r["iknv"], "projeto editável do Photo (.iknv)", {"flyer": True})
        return (f"Flyer montado no Photo ({f['esqueleto']}, estilo {f['estilo']}, título \"{f['titulo']}\"): "
                f"prévia {k or '(sem prévia)'}, projeto editável {kp}." + (f" Avisos: {'; '.join(r['avisos'][:3])}" if r["avisos"] else ""))
    if acao == "gerar_imagem":
        from Functions import gerador_imagem
        if not gerador_imagem.instalado():
            raise kani_criar.FaltaModelo("imagem", gerador_imagem.estado().get("tamanho_gb"), "o gerador de imagem ainda não foi baixado")
        desc = str(a.get("descricao") or "").strip()
        if not desc:
            raise ValueError("falta 'descricao'")
        prompt = kani_criar._llm(kani_criar._SIS_IMAGEM, desc, 160) or desc
        fmt = str(a.get("formato") or "quadrado")
        w, h = {"vertical": (768, 1344), "horizontal": (1344, 768), "feed": (1024, 1280)}.get(fmt, (1024, 1024))
        kani_criar._liberar_placa()
        on(10, "Gerando a imagem...")
        r = gerador_imagem.gerar({"prompt": prompt, "largura": w, "altura": h, "semente": -1},
                                 lambda d: on(float(d.get("pct", 50)) if isinstance(d, dict) and d.get("pct") is not None else 50, "Gerando a imagem..."))
        try:
            gerador_imagem.parar()
        except Exception:
            pass
        if not r.get("success"):
            raise RuntimeError(r.get("error") or "o gerador não devolveu a imagem")
        path = os.path.join(kani_criar.pasta(), f"imagem_{nome}.png")
        shutil.copy(r["path"], path)
        return f"Imagem criada: {est.novo('imagem', path, prompt)} ({w}x{h})."
    if acao == "gerar_efeito":
        from Functions import gerador_sfx
        if not gerador_sfx.instalado():
            raise kani_criar.FaltaModelo("efeito", gerador_sfx.estado().get("tamanho_gb"), "o gerador de efeitos sonoros ainda não foi baixado")
        desc = str(a.get("descricao") or "").strip()
        if not desc:
            raise ValueError("falta 'descricao'")
        kani_criar._liberar_placa()
        fim, res = threading.Event(), {}
        r = gerador_sfx.gerar_arquivo(desc, max(1.0, min(10.0, float(a.get("segundos") or 5))),
                                      lambda d: (res.update(d), fim.set()) if d.get("fim") or d.get("erro") else on(d.get("pct", 0), d.get("msg") or "Gerando o efeito..."))
        if not r.get("success"):
            raise RuntimeError(r.get("error"))
        fim.wait()
        if res.get("erro"):
            raise RuntimeError(res["erro"])
        path = os.path.join(kani_criar.pasta(), f"efeito_{nome}.wav")
        shutil.copy(res["path"], path)
        return f"Efeito criado: {est.novo('efeito', path, res.get('texto_en') or desc)}."
    if acao == "narrar":
        texto = re.sub(r"[#*_`\[\]]", "", str(a.get("texto") or "")).strip()
        if not texto:
            raise ValueError("falta 'texto'")
        voz = "homem" if str(a.get("voz") or "").strip().lower() in ("homem", "masculina", "masculino", "h", "masculino(a)") else "mulher"
        path = os.path.join(kani_criar.pasta(), f"narracao_{nome}.wav")
        if voz == "homem":
            kani_criar._dialogo([("H", texto)], path, on)
        else:
            kani_criar._falar(texto, path, on)
        from Functions import video_cutter
        d = float(video_cutter.probe(path).get("duration") or 0)
        return f"Narração gravada: {est.novo('narracao', path, texto)} ({d:.1f} s, voz de {voz})."
    if acao == "conversa":
        falas = [("M" if str(f.get("papel", "")).upper().startswith(("M", "E")) and str(f.get("papel")).upper() != "H" else "H",
                  re.sub(r"[#*_`\[\]]", "", str(f.get("texto") or "")).strip()) for f in (a.get("falas") or []) if isinstance(f, dict)]
        falas = [f for f in falas if f[1]]
        if len(falas) < 2:
            raise ValueError("'falas' precisa de pelo menos 2 falas [{papel: H|M, texto}]")
        path = os.path.join(kani_criar.pasta(), f"conversa_{nome}.wav")
        kani_criar._dialogo(falas, path, on)
        from Functions import video_cutter
        d = float(video_cutter.probe(path).get("duration") or 0)
        return f"Conversa gravada: {est.novo('narracao', path, chr(10).join(f'{p}: {t}' for p, t in falas))} ({d:.1f} s)."
    if acao == "buscar_musica":
        from Functions import musicas
        m = musicas.garantir(str(a.get("clima") or "") or None, float(a.get("segundos_min") or 10), est.pct)
        if not m:
            return "Sem música (biblioteca vazia e sem internet): a vinheta vai usar o jingle do app."
        k = est.novo("musica", m["path"], m.get("credito") or "", {"musica": {x: m.get(x) for x in ("titulo", "artista", "credito", "licenca")}, "refrao": m.get("refrao")})
        return f"Música escolhida: {k} = \"{m.get('titulo')}\" ({m.get('clima')}, {m.get('bpm')} BPM, {m.get('dur')} s)."
    if acao == "montar_vinheta":
        voz = est.arq.get(str(a.get("voz") or ""))
        if not voz or voz["tipo"] != "narracao":
            raise ValueError("'voz' precisa ser uma narração ou conversa gravada (ex.: 'A1')")
        mus = est.arq.get(str(a.get("musica") or ""))
        tmp = os.path.join(kani_criar.pasta(), f"_voz_{nome}.wav")
        shutil.copy(voz["path"], tmp)
        path = kani_criar._finalizar("vinheta", tmp, nome, on, "", musica=({"path": mus["path"], "refrao": mus.get("refrao"), **mus.get("musica", {})} if mus else None))
        from Functions import video_cutter
        d = float(video_cutter.probe(path).get("duration") or 0)
        k = est.novo('vinheta', path, voz['texto'], {'musica': (mus or {}).get('musica')})
        return (f"Vinheta montada: {k} ({d:.1f} s no total = abertura + a voz + um respiro no fim; a duração pedida vale para a "
                f"FALA, que já foi conferida). Próxima ação: entregar.")
    raise ValueError(f"ferramenta desconhecida: {acao}")


def rodar(job, pedido, on_evento, historico=None, anexos=None, recentes=None):
    """recentes: arquivos já criados NESTA conversa ([{path, tipo, nome}], o mais recente primeiro) — "remove o fundo
    dessa foto" logo depois de gerar a imagem usa ela (antes o agente não a via e gerava outra, 2026-10-13)."""
    """Em thread. historico: últimas mensagens da conversa (contexto curto)."""
    if not _ocupado.acquire(blocking=False):
        return {"success": False, "error": "A Kani já está trabalhando em outro pedido."}

    def run():
        est = _Estado(job, on_evento)
        try:
            ferr = "\n".join(f"- {k}: {d}" for k, (d, _) in FERRAMENTAS.items())
            from Functions import kani_memoria
            extra = "\n\n".join(x for x in (kani_memoria.bloco_prompt(), kani_memoria.exemplos_para(pedido)) if x)
            msgs = [{"role": "system", "content": _SISTEMA.replace("{ferramentas}", ferr).replace("{max}", str(MAX_PASSOS))
                     + ("\n\n" + extra if extra else "")}]
            _traj[job] = {"pedido": pedido, "passos": []}
            for m in (historico or [])[-4:]:
                if m.get("role") in ("user", "assistant") and m.get("content"):
                    msgs.append({"role": m["role"], "content": str(m["content"])[:600]})
            ids_anexo = []
            for p in anexos or []:
                if p and os.path.isfile(p):
                    ext = os.path.splitext(p)[1].lower()
                    tipo = "anexo_imagem" if ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic") else \
                        "anexo_doc" if ext in (".pdf", ".docx", ".txt", ".md", ".csv", ".srt", ".json") else "anexo"
                    ids_anexo.append(f"{est.novo(tipo, p)} = {os.path.basename(p)} ({tipo.replace('anexo_', '') if '_' in tipo else 'arquivo'})")
            ids_rec = []
            for r in (recentes or [])[:4]:
                p = r.get("path") if isinstance(r, dict) else None
                if p and os.path.isfile(p) and p not in (anexos or []):
                    tipo = {"imagem": "imagem", "vinheta": "vinheta", "efeito": "efeito", "narracao": "narracao", "documento": "documento"}.get(r.get("tipo"), "anexo")
                    k = est.novo(tipo, p, r.get("texto") or "")
                    ids_rec.append(f"{k} = {os.path.basename(p)} ({tipo}{', o MAIS RECENTE' if not ids_rec else ''})")
            contexto = ""
            if ids_rec:
                contexto += ("\nArquivos já criados nesta conversa (quando a pessoa diz \"essa foto\", \"essa imagem\", \"esse áudio\", "
                             "é o mais recente do tipo): " + "; ".join(ids_rec))
            if ids_anexo:
                contexto += f"\nArquivos anexados agora: {'; '.join(ids_anexo)}"
            msgs.append({"role": "user", "content": f"Pedido: {pedido}{contexto}"})
            refeitos = {}
            for n in range(1, MAX_PASSOS + 1):
                if job in _cancelar:
                    raise RuntimeError("parado")
                if n == MAX_PASSOS - 1:   # freio: entrega com o que tem
                    msgs.append({"role": "user", "content": "Limite de etapas chegando: a próxima ação TEM que ser entregar, com os melhores arquivos que você já tem."})
                on_evento({"job": job, "passo": {"n": n, "estado": "pensando"}})
                r = _chamar_seguro(msgs, primeiro=(n == 1))
                if n == 1 and r.get("plano"):
                    on_evento({"job": job, "plano": [str(x)[:120] for x in r["plano"]][:8]})
                acao, args = r.get("acao"), r.get("args") or {}
                if _FLYER.search(pedido) and acao in ("escrever", "gerar_imagem") and not any(v.get("flyer") for v in est.arq.values()):
                    # flyer: a montagem já escreve e gera a foto (recortada); o 4B insistia em escrever/gerar antes (2026-10-13)
                    foto = next((k for k, v in est.arq.items() if v["tipo"] == "anexo_imagem"), None)
                    acao, args = "montar_flyer", {"pedido": pedido, **({"foto": foto} if foto else {})}
                elif acao == "montar_flyer" and any(v.get("flyer") for v in est.arq.values()):
                    acao, args = "entregar", {"mensagem": "Flyer montado no Photo Kanivete, com o projeto editável salvo."}   # não remonta
                pens = str(r.get("pensamento") or "")[:300]
                msgs.append({"role": "assistant", "content": json.dumps({"pensamento": pens, "acao": acao, "args": args}, ensure_ascii=False)})
                _traj[job]["passos"].append({"acao": acao, "args": {k: (v if not isinstance(v, (list, dict)) else json.dumps(v, ensure_ascii=False)[:200])
                                                                   for k, v in args.items()}})
                if acao == "entregar":
                    ids = [str(x) for x in (args.get("arquivos") or []) if str(x) in est.arq and est.arq[str(x)].get("path")
                           and not est.arq[str(x)]["tipo"].startswith("anexo")]
                    ids += [k for k, v in est.arq.items() if v.get("flyer") and k not in ids]   # prévia + .iknv sempre
                    if not ids:   # o modelo esqueceu de listar: entrega os finais
                        ids = [k for k, v in est.arq.items() if v["tipo"] in ("imagem", "vinheta", "efeito", "documento") and v.get("path")]
                    resp = est.texto(args.get("resposta")) if args.get("resposta") else ""
                    if not resp and not ids:   # pesquisa sem arquivo: o último texto feito é a resposta
                        tx = [v for v in est.arq.values() if v["tipo"] == "texto"]
                        resp = tx[-1]["conteudo"] if tx else ""
                    from Functions import media_server
                    arqs = [{**{k: v for k, v in est.arq[i].items() if k in ("tipo", "path", "nome", "texto", "musica")},
                             "url": media_server.register(est.arq[i]["path"])} for i in ids if est.arq[i]["tipo"] != "musica"]
                    on_evento({"job": job, "passo": {"n": n, "pensamento": pens, "acao": acao, "estado": "ok", "resumo": "Entregue"}})
                    msg = re.sub(r"\b(?:o |a |os |as )?(?:arquivo |vinheta |imagem |narra[cç][aã]o )?A\d+\b", lambda m: m.group(0).rsplit(" ", 1)[0] if " " in m.group(0) else "o arquivo",
                                 str(args.get("mensagem") or "Pronto!"))
                    on_evento({"job": job, "fim": True, "mensagem": re.sub(r"\s{2,}", " ", msg)[:600], "arquivos": arqs, "resposta": resp[:8000]})
                    return
                # freio de revisão: cada ferramenta de criação pode ser refeita uma vez; depois disso o app segue
                refeitos[acao] = refeitos.get(acao, 0) + 1
                if acao in ("narrar", "conversa", "montar_vinheta", "buscar_musica", "gerar_imagem", "gerar_efeito") and refeitos[acao] > 2:
                    msgs.append({"role": "user", "content": f"Você já usou {acao} {refeitos[acao] - 1} vezes: não repita. Use o que já tem e siga para a próxima etapa ou entregue."})
                    on_evento({"job": job, "passo": {"n": n, "pensamento": pens, "acao": acao, "estado": "ok", "resumo": "Já feito: seguindo com o que tem"}})
                    continue
                on_evento({"job": job, "passo": {"n": n, "pensamento": pens, "acao": acao, "estado": "executando"}})
                try:
                    if FERRAMENTAS.get(acao, ("", False))[1]:
                        kani.parar()   # imagem/efeito: a placa para o motor da criação
                    resumo = _executar(est, acao, args)
                    estado = "ok"
                except kani_criar.FaltaModelo:
                    raise   # não adianta tentar outro caminho: o cartão oferece baixar o gerador
                except Exception as e:
                    resumo, estado = f"ERRO: {e}", "erro"
                on_evento({"job": job, "passo": {"n": n, "pensamento": pens, "acao": acao, "estado": estado, "resumo": resumo[:240]}})
                msgs.append({"role": "user", "content": f"Resultado da ação {n} ({acao}): {resumo}\nArquivos até agora: "
                             + (", ".join(f"{k}={v['tipo']}" for k, v in est.arq.items()) or "nenhum") + ". Qual a próxima ação?"})
            # passou do limite sem entregar: o app entrega o melhor que tem (a última peça final de cada tipo)
            finais = {}
            for k, v in est.arq.items():
                if v["tipo"] in ("vinheta", "imagem", "efeito", "narracao", "documento") and v.get("path"):
                    finais[v["tipo"]] = k
            ids = [finais[t] for t in ("vinheta", "imagem", "efeito", "documento") if t in finais] or ([finais["narracao"]] if "narracao" in finais else [])
            if not ids:
                raise RuntimeError("passou do limite de etapas sem entregar")
            from Functions import media_server
            on_evento({"job": job, "fim": True, "mensagem": "Pronto! (Parei de ajustar no limite de etapas e entreguei a melhor versão.)",
                       "arquivos": [{**{k: v for k, v in est.arq[i].items() if k in ("tipo", "path", "nome", "texto", "musica")},
                                     "url": media_server.register(est.arq[i]["path"])} for i in ids]})
            return
        except Exception as e:
            from Functions import media_server
            on_evento({"job": job, "erro": str(e), **({"falta": e.tipo, "gb": e.gb} if isinstance(e, kani_criar.FaltaModelo) else {}),
                       "arquivos": [{**{k: v for k, v in a.items() if k in ("tipo", "path", "nome", "texto")},
                                                                    "url": media_server.register(a["path"])} for a in est.arq.values() if a["tipo"] != "musica"]})
        finally:
            _cancelar.discard(job)
            _ocupado.release()
            try:
                kani.parar()
            except Exception:
                pass

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


_traj = {}   # job → {pedido, passos} (o 👍 do chat vira exemplo em kani_memoria)


def avaliar(job, nota):
    t = _traj.get(job)
    if not t:
        return {"success": False, "error": "esse trabalho não está mais na memória (o app foi reaberto)"}
    from Functions import kani_memoria
    kani_memoria.guardar_exemplo(t["pedido"], t["passos"], 1 if nota > 0 else -1)
    return {"success": True}


def parar(job):
    _cancelar.add(job)
    return {"success": True}
