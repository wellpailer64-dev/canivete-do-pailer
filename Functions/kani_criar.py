"""
kani_criar.py — a Kani CRIA coisas no chat: imagem (Z-Image, gerador_imagem), efeito sonoro (EzAudio, gerador_sfx),
narração (voz da Kani no OmniVoice) e vinheta (narração + jingle do Soundboard + impacto, mixados no ffmpeg).
O pedido é reconhecido por palavras (detectar), a própria Kani escreve o prompt/texto por baixo (_llm) e sai da placa
antes do motor pesado. Eventos para o chat: {job, pct, msg} / {job, fim, tipo, path, url, nome, texto} / {job, erro}.
Arquivos em <modelos_ia/kani>/criacoes (o chat baixa com "Salvar como" e mostra na pasta).
"""
import json
import os
import random
import re
import shutil
import subprocess
import threading
import time
import urllib.request

from Functions import kani

_ocupado = threading.Lock()
_VERBO = r"(gera|gere|gerar|cria|crie|criar|faz|faça|faca|fazer|desenha|desenhe|produz|produza|quero|preciso|narr[ae]|narrar|leia|grave|me (?:d[aá]|manda))"
_TIPOS = [
    ("vinheta", re.compile(r"\bvinhet", re.I)),
    ("efeito", re.compile(r"(efeito sonoro|efeito de som|\bsfx\b|som de\b|barulho de|ru[ií]do de)", re.I)),
    ("narracao", re.compile(r"(narra[cç][aã]o|\bnarr[ae]\b|\bnarrar\b|locu[cç][aã]o|\blocut|\bleia em voz|\bfale\b.*:|grava(?:r)? (?:uma )?voz)", re.I)),
    ("imagem", re.compile(r"(imagem|\bfoto\b|ilustra[cç][aã]o|desenho|arte\b|\blogo\b|wallpaper|papel de parede|\bpintura)", re.I)),
]


def pasta():
    p = os.path.join(kani.pasta(), "criacoes")
    os.makedirs(p, exist_ok=True)
    return p


def detectar(texto):
    """'imagem' | 'efeito' | 'narracao' | 'vinheta' | None. Só pedido de CRIAR (verbo + tipo): "como gero uma imagem
    no app?" é pergunta (vai para a conversa normal)."""
    t = (texto or "").strip()
    if not t or re.match(r"^\s*(como|onde|qual|quais|por ?que|o que|d[aá] pra|tem como|consigo)\b", t, re.I):
        return None
    if not re.search(_VERBO, t, re.I) and not re.match(r"^\s*(uma?|um)\s", t, re.I):
        return None
    for tipo, rx in _TIPOS:
        if rx.search(t):
            return tipo
    return None


def _llm(sistema, pedido, max_tokens=220, temperatura=0.4):
    """Uma resposta curta da Kani (sem streaming). Ollama com keep_alive 0 ou o llama.cpp dela, parado depois: a placa
    fica livre para o motor da criação. Sem Kani: None."""
    msgs = [{"role": "system", "content": sistema}, {"role": "user", "content": pedido + " /no_think"}]
    try:
        if kani._ollama_tem():
            corpo = {"model": kani.OLLAMA_MODELO, "stream": False, "keep_alive": 0, "messages": msgs, "think": False,
                     "options": {"temperature": temperatura, "num_predict": max_tokens}}
            req = urllib.request.Request(kani.OLLAMA + "/api/chat", data=json.dumps(corpo).encode("utf-8"),
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                out = json.loads(r.read().decode("utf-8")).get("message", {}).get("content", "")
        elif os.path.exists(kani._exe()) and os.path.exists(kani._gguf()):
            kani._subir()
            try:
                corpo = {"messages": msgs, "temperature": temperatura, "max_tokens": max_tokens, "stream": False,
                         "chat_template_kwargs": {"enable_thinking": False}}
                req = urllib.request.Request(f"http://127.0.0.1:{kani._srv['porta']}/v1/chat/completions",
                                             data=json.dumps(corpo).encode("utf-8"), headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=180) as r:
                    out = json.loads(r.read().decode("utf-8"))["choices"][0]["message"]["content"]
            finally:
                kani.parar()
        else:
            return None
        out = re.sub(r"<think>.*?</think>", "", out or "", flags=re.S).strip().strip('"').strip()
        return out or None
    except Exception:
        return None


_SIS_IMAGEM = """Turn the user's request (Portuguese) into ONE English prompt for an image generator.
Describe subject, setting, lighting, style and composition in 20 to 60 words. Keep exactly what was asked; add only
visual details that help. No text, letters, logos or watermarks unless the user asked for text. Answer with the prompt only."""
_SIS_NARRACAO = """Você escreve textos para narração em português do Brasil. A partir do pedido, escreva SÓ o texto que será
falado: frases curtas, naturais, sem emojis, sem hashtags, sem títulos, sem aspas, sem marcações. Até {n} palavras."""


def _citado(texto):
    """Texto já pronto no pedido: entre aspas ou depois de dois-pontos ("narre: Bom dia...")."""
    m = re.search(r"[\"“«']([^\"”»']{6,})[\"”»']", texto)
    if m:
        return m.group(1).strip()
    m = re.search(r":\s*(.{6,})$", texto, re.S)
    return m.group(1).strip() if m else None


def _proporcao(texto):
    t = texto.lower()
    if re.search(r"(story|stories|vertical|9:16|reels|celular|wallpaper de celular)", t):
        return 768, 1344
    if re.search(r"(horizontal|16:9|youtube|banner|capa de v[ií]deo|thumbnail|paisagem)", t):
        return 1344, 768
    if re.search(r"(feed|4:5|retrato)", t):
        return 1024, 1280
    return 1024, 1024


def _segundos(texto, padrao=5.0):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:s\b|seg)", texto, re.I)
    return max(1.0, min(10.0, float(m.group(1).replace(",", ".")) if m else padrao))


def _ffmpeg():
    from Functions.midia import ffmpeg
    return ffmpeg()


def _falar(texto, saida, on):
    from Functions.omnivoice_tool import list_voices, synthesize
    vozes = list_voices()
    if not vozes:
        raise RuntimeError("nenhuma voz salva (crie uma em Geração de Voz)")
    v = next((x for x in vozes if (x.get("name") or "").strip().lower() == kani.VOZ), vozes[0])
    on(30, f"Gravando com a voz {v.get('name') or 'da Kani'}...")
    r = synthesize(v["id"], kani.para_voz(texto), {"num_step": 32, "language": "pt", "speed": 1.0, "normalize_text": True, "respiro": True})
    shutil.copy(r["output_path"], saida)
    return saida


def _jingle():
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "soundboard")
    j = sorted(f for f in os.listdir(os.path.join(base, "jingles")) if f.endswith(".ogg")) if os.path.isdir(os.path.join(base, "jingles")) else []
    imp = os.path.join(base, "impacto", "riser_hit_03.ogg")
    return (os.path.join(base, "jingles", random.choice([x for x in j if "hit" not in x] or j)) if j else None,
            imp if os.path.isfile(imp) else None)


def criar(job, tipo, pedido, on_evento):
    """Em thread. Um pedido por vez (os motores dividem a placa)."""
    if not _ocupado.acquire(blocking=False):
        return {"success": False, "error": "A Kani já está criando outra coisa: espere terminar."}

    def on(pct, msg):
        on_evento({"job": job, "pct": int(pct), "msg": msg})

    def run():
        try:
            nome = time.strftime("%Y%m%d_%H%M%S")
            if tipo == "imagem":
                from Functions import gerador_imagem
                if not gerador_imagem.instalado():
                    raise RuntimeError("o gerador de imagem ainda não foi baixado (Photo Kanivete › Gerar imagem)")
                on(3, "Escrevendo o pedido para o gerador...")
                prompt = _llm(_SIS_IMAGEM, pedido, 160) or pedido
                w, h = _proporcao(pedido)
                on(10, "Gerando a imagem (cerca de 40 s)...")
                r = gerador_imagem.gerar({"prompt": prompt, "largura": w, "altura": h, "semente": -1},
                                         lambda d: on(10 + 88 * float(d.get("pct", 0)) / 100 if isinstance(d, dict) and d.get("pct") is not None else 50,
                                                      (d.get("msg") if isinstance(d, dict) else None) or "Gerando a imagem..."))
                if not r.get("success"):
                    raise RuntimeError(r.get("error") or "o gerador não devolveu a imagem")
                path = os.path.join(pasta(), f"imagem_{nome}.png")
                shutil.copy(r["path"], path)
                texto = prompt
            elif tipo == "efeito":
                from Functions import gerador_sfx
                pronto = threading.Event()
                res = {}

                def ev(d):
                    if d.get("fim") or d.get("erro"):
                        res.update(d)
                        pronto.set()
                    else:
                        on(d.get("pct", 0), d.get("msg") or "Gerando o efeito...")
                r = gerador_sfx.gerar_arquivo(pedido, _segundos(pedido), ev)
                if not r.get("success"):
                    raise RuntimeError(r.get("error"))
                pronto.wait()
                if res.get("erro"):
                    raise RuntimeError(res["erro"])
                path = os.path.join(pasta(), f"efeito_{nome}.wav")
                shutil.copy(res["path"], path)
                texto = res.get("texto_en") or pedido
            elif tipo in ("narracao", "vinheta"):
                n = 22 if tipo == "vinheta" else 90
                texto = _citado(pedido)
                if not texto:
                    on(5, "Escrevendo o texto...")
                    texto = _llm(_SIS_NARRACAO.replace("{n}", str(n)), pedido, 260, 0.6)
                if not texto and tipo == "vinheta":
                    # sem a IA: a saudação com o nome do pedido ("vinheta para o canal X" → "Bem-vindos ao canal X!")
                    m = re.search(r"\b(?:para|pro|pra)\s+(?:o\s+|a\s+)?(.{3,60}?)[.!?]*$", pedido, re.I)
                    alvo = m.group(1).strip() if m else ""
                    texto = (f"Bem-vindos ao {alvo}!" if re.match(r"(canal|perfil|podcast|programa)\b", alvo, re.I)
                             else f"Bem-vindos! Aqui é {alvo}." if alvo else "Bem-vindos! Fica com a gente.")
                if not texto:
                    raise RuntimeError("não consegui escrever o texto (mande o texto entre aspas)")
                texto = re.sub(r"[#*_`\[\]]", "", texto).strip()
                voz = _falar(texto, os.path.join(pasta(), f"_voz_{nome}.wav"), on)
                if tipo == "narracao":
                    path = os.path.join(pasta(), f"narracao_{nome}.wav")
                    os.replace(voz, path)
                else:
                    on(80, "Mixando com a música e o impacto...")
                    jingle, imp = _jingle()
                    if not jingle:
                        raise RuntimeError("baixe o pack no painel Soundboard (a vinheta usa os jingles dele)")
                    path = os.path.join(pasta(), f"vinheta_{nome}.mp3")
                    # jingle abre, a voz entra aos 0,9 s com a música abaixando por baixo (sidechain), o impacto fecha
                    ent = ["-i", jingle, "-i", voz] + (["-i", imp] if imp else [])
                    g = ("[0:a]aresample=48000,apad=pad_dur=30,volume=0.9[m];[1:a]aresample=48000,adelay=900|900,apad=pad_dur=30,asplit[v][sc];"
                         "[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[md];"
                         + ("[2:a]aresample=48000,volume=0.7[i];[md][v][i]amix=inputs=3:duration=longest:normalize=0" if imp
                            else "[md][v]amix=inputs=2:duration=longest:normalize=0")
                         + ",loudnorm=I=-14:TP=-1.5,afade=t=out:st=0:d=0.01[o]")
                    # duração: atraso + voz + 2,4 s (a música respira no fim); tudo com apad e cortado no atrim
                    from Functions import video_cutter
                    dur = float(video_cutter.probe(voz).get("duration") or 4) + 0.9 + 2.4   # atraso da voz + respiro
                    g = g.replace("afade=t=out:st=0:d=0.01", f"atrim=0:{dur:.2f},afade=t=out:st={max(0, dur - 1.2):.2f}:d=1.2")
                    rr = subprocess.run([_ffmpeg(), "-y", "-v", "error", *ent, "-filter_complex", g, "-map", "[o]", "-c:a", "libmp3lame",
                                         "-b:a", "192k", path], capture_output=True, text=True,
                                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    if rr.returncode != 0 or not os.path.isfile(path):
                        raise RuntimeError("a mixagem falhou: " + (rr.stderr or "")[-200:])
                    try:
                        os.remove(voz)
                    except OSError:
                        pass
            else:
                raise RuntimeError("não sei criar isso ainda")
            from Functions import media_server
            on_evento({"job": job, "fim": True, "tipo": tipo, "path": path, "url": media_server.register(path),
                       "nome": os.path.basename(path), "texto": texto})
        except Exception as e:
            on_evento({"job": job, "erro": str(e)})
        finally:
            _ocupado.release()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def url(path):
    from Functions import media_server
    return {"success": bool(path and os.path.isfile(path)), "url": media_server.register(path) if path and os.path.isfile(path) else None}
