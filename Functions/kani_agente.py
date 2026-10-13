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
    "entregar": ("Termina e entrega ao usuário. args: {arquivos: ['A1', ...], mensagem (curta, em português)}", False),
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
- REVISE antes de seguir: se o pedido tem duração (ex.: 15 segundos), compare com a duração que a ferramenta devolveu; se
  passou mais de 20%, use escrever de novo pedindo um texto mais curto (~2,3 palavras por segundo) e grave de novo.
- Na mensagem de entrega não cite A1/A2: diga o que foi feito em uma ou duas frases.
- Termine SEMPRE com "entregar", listando os arquivos que respondem ao pedido (não liste intermediários como a voz crua
  usada numa vinheta, a não ser que peçam). No máximo {max} ações."""

_SCHEMA = {"type": "object", "properties": {
    "plano": {"type": "array", "items": {"type": "string"}},
    "pensamento": {"type": "string"},
    "acao": {"type": "string", "enum": list(FERRAMENTAS)},
    "args": {"type": "object"}},
    "required": ["pensamento", "acao", "args"]}

_COMPLEXO = re.compile(r"(roteiro|campanha|\bkit\b|pacote|s[eé]rie|v[aá]ri[ao]s|e depois|tamb[eé]m|junto com|al[eé]m d|"
                       r"\b(?:\d+|duas|dois|tr[eê]s|quatro)\s+(?:imagens|fotos|vinhetas|narra|efeitos|vers)|"
                       r"(?:imagem|foto).{0,60}(?:narra|vinhet|som|efeito|m[uú]sica)|(?:narra|vinhet|som|efeito).{0,60}(?:imagem|foto))", re.I)


def precisa(texto):
    """Pedido composto (mais de uma coisa, roteiro, campanha, "também"...): vai para o agente, não para a criação direta."""
    return bool(_COMPLEXO.search(texto or ""))


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
    return json.loads(out)


class _Estado:
    def __init__(self, job, on):
        self.job, self.on, self.arq, self.n = job, on, {}, 0

    def novo(self, tipo, path, texto="", extra=None):
        self.n += 1
        k = f"A{self.n}"
        self.arq[k] = {"tipo": tipo, "path": path, "nome": os.path.basename(path) if path else "", "texto": texto, **(extra or {})}
        return k

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
        t = kani_criar._llm("Escreva em português do Brasil exatamente o que for pedido, pronto para usar, sem comentários.", instr, 500, 0.7)
        if not t:
            raise RuntimeError("não consegui escrever")
        return f"Texto escrito:\n{t[:1200]}"
    if acao == "gerar_imagem":
        from Functions import gerador_imagem
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
        m = musicas.escolher(str(a.get("clima") or "") or None, float(a.get("segundos_min") or 10))
        if not m:
            return "A biblioteca de músicas está vazia: a vinheta vai usar o jingle do app."
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
        return f"Vinheta montada: {est.novo('vinheta', path, voz['texto'], {'musica': (mus or {}).get('musica')})} ({d:.1f} s)."
    raise ValueError(f"ferramenta desconhecida: {acao}")


def rodar(job, pedido, on_evento, historico=None):
    """Em thread. historico: últimas mensagens da conversa (contexto curto)."""
    if not _ocupado.acquire(blocking=False):
        return {"success": False, "error": "A Kani já está trabalhando em outro pedido."}

    def run():
        est = _Estado(job, on_evento)
        try:
            ferr = "\n".join(f"- {k}: {d}" for k, (d, _) in FERRAMENTAS.items())
            msgs = [{"role": "system", "content": _SISTEMA.replace("{ferramentas}", ferr).replace("{max}", str(MAX_PASSOS))}]
            for m in (historico or [])[-4:]:
                if m.get("role") in ("user", "assistant") and m.get("content"):
                    msgs.append({"role": m["role"], "content": str(m["content"])[:600]})
            msgs.append({"role": "user", "content": f"Pedido: {pedido}"})
            for n in range(1, MAX_PASSOS + 1):
                if job in _cancelar:
                    raise RuntimeError("parado")
                on_evento({"job": job, "passo": {"n": n, "estado": "pensando"}})
                r = _chamar(msgs, primeiro=(n == 1))
                if n == 1 and r.get("plano"):
                    on_evento({"job": job, "plano": [str(x)[:120] for x in r["plano"]][:8]})
                acao, args = r.get("acao"), r.get("args") or {}
                pens = str(r.get("pensamento") or "")[:300]
                msgs.append({"role": "assistant", "content": json.dumps({"pensamento": pens, "acao": acao, "args": args}, ensure_ascii=False)})
                if acao == "entregar":
                    ids = [str(x) for x in (args.get("arquivos") or []) if str(x) in est.arq]
                    if not ids:   # o modelo esqueceu de listar: entrega os finais
                        ids = [k for k, v in est.arq.items() if v["tipo"] in ("imagem", "vinheta", "efeito")] or list(est.arq)
                    from Functions import media_server
                    arqs = [{**{k: v for k, v in est.arq[i].items() if k in ("tipo", "path", "nome", "texto", "musica")},
                             "url": media_server.register(est.arq[i]["path"])} for i in ids if est.arq[i]["tipo"] != "musica"]
                    on_evento({"job": job, "passo": {"n": n, "pensamento": pens, "acao": acao, "estado": "ok", "resumo": "Entregue"}})
                    msg = re.sub(r"\b(?:o |a |os |as )?(?:arquivo |vinheta |imagem |narra[cç][aã]o )?A\d+\b", lambda m: m.group(0).rsplit(" ", 1)[0] if " " in m.group(0) else "o arquivo",
                                 str(args.get("mensagem") or "Pronto!"))
                    on_evento({"job": job, "fim": True, "mensagem": re.sub(r"\s{2,}", " ", msg)[:600], "arquivos": arqs})
                    return
                on_evento({"job": job, "passo": {"n": n, "pensamento": pens, "acao": acao, "estado": "executando"}})
                try:
                    if FERRAMENTAS.get(acao, ("", False))[1]:
                        kani.parar()   # imagem/efeito: a placa para o motor da criação
                    resumo = _executar(est, acao, args)
                    estado = "ok"
                except Exception as e:
                    resumo, estado = f"ERRO: {e}", "erro"
                on_evento({"job": job, "passo": {"n": n, "pensamento": pens, "acao": acao, "estado": estado, "resumo": resumo[:240]}})
                msgs.append({"role": "user", "content": f"Resultado da ação {n} ({acao}): {resumo}\nArquivos até agora: "
                             + (", ".join(f"{k}={v['tipo']}" for k, v in est.arq.items()) or "nenhum") + ". Qual a próxima ação?"})
            raise RuntimeError("passou do limite de etapas sem entregar")
        except Exception as e:
            from Functions import media_server
            on_evento({"job": job, "erro": str(e), "arquivos": [{**{k: v for k, v in a.items() if k in ("tipo", "path", "nome", "texto")},
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


def parar(job):
    _cancelar.add(job)
    return {"success": True}
