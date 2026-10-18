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


def limpar():
    """Ao abrir o app: as criações da sessão anterior saem (ficam só enquanto o app está aberto — o Baixar copia para
    onde a pessoa quiser). Pedido do Pailer: não acumular arquivo à toa."""
    p = os.path.join(kani.pasta(), "criacoes")
    if not os.path.isdir(p):
        return 0
    n = 0
    for f in os.listdir(p):
        try:
            os.remove(os.path.join(p, f))
            n += 1
        except OSError:
            pass
    return n


_CONTINUA = re.compile(r"^\s*(e se|e com|agora|refa[zçc]|de novo|outra|outro|mais |menos |s[oó] que|com |sem |muda|mude|troca|troque|"
                       r"mas |deixa|deixe|coloca|coloque|p[oõ]e|ponha|tira|tire|em vez|ao inv[eé]s|igual|parecid|vers[aã]o)", re.I)


def detectar(texto, anterior=None):
    """{tipo, continua} ou None. Pedido de CRIAR (verbo + tipo): "como gero uma imagem no app?" é pergunta (vai para a
    conversa normal). anterior = tipo da última criação da conversa: "e se fosse uma conversa entre um homem e uma
    mulher?" logo depois de uma vinheta é a mesma criação de novo, com a mudança (continua=True) — antes ia para a
    conversa e a Kani dizia que tinha criado um arquivo que não existia (2026-10-12)."""
    t = (texto or "").strip()
    if not t:
        return None
    tipo = next((tp for tp, rx in _TIPOS if rx.search(t)), None)
    if anterior and _CONTINUA.match(t) and not re.match(r"^\s*(como|onde|qual|quais|por ?que|o que)\b", t, re.I):
        return {"tipo": tipo or anterior, "continua": True}
    # pergunta sobre a criação, não pedido: "me explica como criar uma vinheta", "você sabe fazer narração?"
    if re.match(r"^\s*(como|onde|qual|quais|por ?que|o que|d[aá] pra|tem como|consigo|(me )?explica|(me )?ensina|"
                r"(voc[eê]|vc) sabe|sabe (fazer|criar|gerar)|[eé] poss[ií]vel)\b", t, re.I):
        return None
    if not re.search(_VERBO, t, re.I) and not re.match(r"^\s*(uma?|um)\s", t, re.I):
        return None
    return {"tipo": tipo, "continua": False} if tipo else None


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


_SIS_DIALOGO = """Você escreve diálogos curtos para áudio em português do Brasil, entre um homem (H) e uma mulher (M).
A partir do pedido, escreva de {a} a {b} falas alternadas, cada uma numa linha começando com "H:" ou "M:". Frases curtas e
naturais, sem emojis, sem hashtags, sem aspas, sem narrador, sem rubricas. Responda só com as falas."""
_DIALOGO = re.compile(r"(conversa|di[aá]logo|bate.?papo|entre (?:um )?homem e (?:uma )?mulher|entre (?:uma )?mulher e (?:um )?homem|duas vozes|dois locutores)", re.I)
# o banco de vozes não guarda gênero: o par Fran/Nico foi gravado como diálogo; os outros pelo nome
_VOZES_M = ("nico", "marcos", "rafael")
_VOZES_F = ("fran", "helo ribeiro", "yolanda")


def _falas(texto):
    """[(papel 'H'|'M', fala)] das linhas "H: ..."/"M: ..." (ou Homem:/Mulher:)."""
    out = []
    for l in (texto or "").splitlines():
        m = re.match(r"^\s*(H|M|Homem|Mulher|Ele|Ela)\s*[:\-–]\s*(.+)$", l.strip(), re.I)
        if m and m.group(2).strip():
            out.append(("M" if m.group(1).lower() in ("m", "mulher", "ela") else "H", re.sub(r"[#*_`\[\]\"“”]", "", m.group(2)).strip()))
    return out


def _dialogo(falas, saida, on):
    """Cada fala com a voz do papel, juntas com 0,25 s de respiro (ffmpeg concat)."""
    from Functions.omnivoice_tool import list_voices, synthesize
    vozes = list_voices()
    por = lambda nomes: next((v for n in nomes for v in vozes if (v.get("name") or "").strip().lower() == n), None)
    vh, vm = por(_VOZES_M), por(_VOZES_F)
    if not (vh and vm):
        raise RuntimeError("para conversa preciso de uma voz de homem e uma de mulher salvas (Geração de Voz)")
    partes = []
    for i, (papel, fala) in enumerate(falas):
        on(15 + 60 * i / max(1, len(falas)), f"Gravando a fala {i + 1} de {len(falas)} ({vh['name'] if papel == 'H' else vm['name']})...")
        r = synthesize((vh if papel == "H" else vm)["id"], kani.para_voz(fala),
                       {"num_step": 32, "language": "pt", "speed": 1.0, "normalize_text": True, "respiro": True})
        partes.append(r["output_path"])
    ent = sum((["-i", p] for p in partes), [])
    g = "".join(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur=0.25[p{i}];" for i in range(len(partes)))
    g += "".join(f"[p{i}]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=0:a=1[o]"
    rr = subprocess.run([_ffmpeg(), "-y", "-v", "error", *ent, "-filter_complex", g, "-map", "[o]", saida], capture_output=True, text=True,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if rr.returncode != 0:
        raise RuntimeError("não consegui juntar as falas: " + (rr.stderr or "")[-200:])
    return saida


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


def _liberar_placa():
    """Imagem e efeito precisam da placa quase inteira: com o chat aberto a voz da Kani fica carregada (OmniVoice, para
    o Ouvir sair rápido) e o gerador de imagem falhava com "generate_image returned no results" (2026-10-12).
    Solta a voz e o motor de conversa; o chat recarrega a voz quando a criação termina (kaniCriacao → kani_voz)."""
    try:
        from Functions import omnivoice_tool
        omnivoice_tool.descarregar()
    except Exception:
        pass
    try:
        kani.parar()
    except Exception:
        pass


class FaltaModelo(RuntimeError):
    """o gerador ainda não foi baixado: o cartão da Kani mostra o botão "Baixar" (kani_baixar_modelo) e refaz o pedido"""
    def __init__(self, tipo, gb, msg):
        super().__init__(msg)
        self.tipo, self.gb = tipo, gb


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
                    raise FaltaModelo("imagem", gerador_imagem.estado().get("tamanho_gb"), "o gerador de imagem ainda não foi baixado")
                on(3, "Escrevendo o pedido para o gerador...")
                prompt = _llm(_SIS_IMAGEM, pedido, 160) or pedido
                w, h = _proporcao(pedido)
                _liberar_placa()
                on(10, "Gerando a imagem (cerca de 40 s)...")
                r = gerador_imagem.gerar({"prompt": prompt, "largura": w, "altura": h, "semente": -1},
                                         lambda d: on(10 + 88 * float(d.get("pct", 0)) / 100 if isinstance(d, dict) and d.get("pct") is not None else 50,
                                                      (d.get("msg") if isinstance(d, dict) else None) or "Gerando a imagem..."))
                try:
                    gerador_imagem.parar()   # solta a placa para a voz e a conversa voltarem
                except Exception:
                    pass
                if not r.get("success"):
                    raise RuntimeError(r.get("error") or "o gerador não devolveu a imagem")
                path = os.path.join(pasta(), f"imagem_{nome}.png")
                shutil.copy(r["path"], path)
                texto = prompt
            elif tipo == "efeito":
                from Functions import gerador_sfx
                if not gerador_sfx.instalado():
                    raise FaltaModelo("efeito", gerador_sfx.estado().get("tamanho_gb"), "o gerador de efeitos sonoros ainda não foi baixado")
                pronto = threading.Event()
                res = {}

                def ev(d):
                    if d.get("fim") or d.get("erro"):
                        res.update(d)
                        pronto.set()
                    else:
                        on(d.get("pct", 0), d.get("msg") or "Gerando o efeito...")
                _liberar_placa()
                r = gerador_sfx.gerar_arquivo(pedido, _segundos(pedido), ev)
                if not r.get("success"):
                    raise RuntimeError(r.get("error"))
                pronto.wait()
                if res.get("erro"):
                    raise RuntimeError(res["erro"])
                path = os.path.join(pasta(), f"efeito_{nome}.wav")
                shutil.copy(res["path"], path)
                texto = res.get("texto_en") or pedido
            elif tipo in ("narracao", "vinheta") and _DIALOGO.search(pedido):
                # conversa entre um homem e uma mulher: a Kani escreve as falas (ou vêm no pedido como "H: ..."/"M: ...")
                falas = _falas(pedido)
                if not falas:
                    on(5, "Escrevendo a conversa...")
                    a, b = (2, 4) if tipo == "vinheta" else (4, 8)
                    falas = _falas(_llm(_SIS_DIALOGO.replace("{a}", str(a)).replace("{b}", str(b)), pedido, 420, 0.7) or "")
                if len(falas) < 2:
                    raise RuntimeError('não consegui escrever a conversa (mande as falas assim: "H: ..." e "M: ...", uma por linha)')
                voz = _dialogo(falas, os.path.join(pasta(), f"_voz_{nome}.wav"), on)
                texto = "\n".join(f"{'Homem' if p == 'H' else 'Mulher'}: {f}" for p, f in falas)
                path = _finalizar(tipo, voz, nome, on, pedido)
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
                path = _finalizar(tipo, voz, nome, on, pedido)
            else:
                raise RuntimeError("não sei criar isso ainda")
            from Functions import media_server
            on_evento({"job": job, "fim": True, "tipo": tipo, "path": path, "url": media_server.register(path),
                       "nome": os.path.basename(path), "texto": texto,
                       "musica": {k: _ultima_musica.get(k) for k in ("titulo", "artista", "credito", "licenca")} if tipo == "vinheta" and _ultima_musica else None})
        except FaltaModelo as e:
            on_evento({"job": job, "erro": str(e), "falta": e.tipo, "gb": e.gb})
        except Exception as e:
            on_evento({"job": job, "erro": str(e)})
        finally:
            _ocupado.release()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def _finalizar(tipo, voz, nome, on, pedido="", musica=None):
    """Narração: a voz como está. Vinheta: MÚSICA DE FUNDO da biblioteca (clima do pedido; começa no refrão) por baixo da
    voz (sidechain) e o impacto na abertura, −14 LUFS. Biblioteca vazia: o jingle do Soundboard faz a vez da música."""
    if tipo == "narracao":
        path = os.path.join(pasta(), f"narracao_{nome}.wav")
        os.replace(voz, path)
        return path
    on(80, "Escolhendo a música e mixando...")
    from Functions import video_cutter, musicas
    dvoz = float(video_cutter.probe(voz).get("duration") or 4)
    jingle, imp = _jingle()
    mus = musica   # o agente já escolheu (kani_agente: buscar_musica)
    if mus is None:
        try:   # da biblioteca; sem nenhuma que sirva, baixa uma do Openverse
            mus = musicas.garantir(musicas.clima_do_pedido(pedido), dvoz + 4, on)
        except Exception:
            pass
    if not (mus or jingle):
        raise RuntimeError("a vinheta precisa de música: ponha músicas na Biblioteca de músicas (ou baixe o pack do Soundboard)")
    path = os.path.join(pasta(), f"vinheta_{nome}.mp3")
    # música (do refrão, entrando suave) ou jingle; a voz entra aos 0,9 s com a música abaixando por baixo
    ini = max(0.0, float((mus or {}).get("refrao") or 0) - 0.5) if mus else 0.0
    ent = (["-ss", f"{ini:.2f}", "-i", mus["path"]] if mus else ["-i", jingle]) + ["-i", voz] + (["-i", imp] if imp else [])
    # níveis em números: voz em −16 LUFS e a música ~10 dB abaixo (−26), que ainda abaixa ~4 dB quando a voz fala
    g = (f"[0:a]aresample=48000,{'loudnorm=I=-26:TP=-6:LRA=11,' if mus else 'volume=0.9,'}apad=pad_dur=30,afade=t=in:d={0.6 if mus else 0}[m];"
         "[1:a]aresample=48000,loudnorm=I=-16:TP=-2:LRA=7,adelay=900|900,apad=pad_dur=30,asplit[v][sc];"
         "[m][sc]sidechaincompress=threshold=0.05:ratio=3:attack=30:release=400[md];"
         + ("[2:a]aresample=48000,volume=0.7[i];[md][v][i]amix=inputs=3:duration=longest:normalize=0" if imp
            else "[md][v]amix=inputs=2:duration=longest:normalize=0")
         + ",loudnorm=I=-14:TP=-1.5,afade=t=out:st=0:d=0.01[o]")
    # duração: atraso + voz + 2,4 s (a música respira no fim); tudo com apad e cortado no atrim
    dur = dvoz + 0.9 + 1.4   # abertura + voz + um respiro curto no fim (com fade)
    g = g.replace("afade=t=out:st=0:d=0.01", f"atrim=0:{dur:.2f},afade=t=out:st={max(0, dur - 1.0):.2f}:d=1.0")
    rr = subprocess.run([_ffmpeg(), "-y", "-v", "error", *ent, "-filter_complex", g, "-map", "[o]", "-c:a", "libmp3lame",
                         "-b:a", "192k", path], capture_output=True, text=True,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if rr.returncode != 0 or not os.path.isfile(path):
        raise RuntimeError("a mixagem falhou: " + (rr.stderr or "")[-200:])
    try:
        os.remove(voz)
    except OSError:
        pass
    _ultima_musica.clear()
    _ultima_musica.update(mus or {})
    return path


_ultima_musica = {}   # a música usada na última vinheta (o chat mostra título e crédito)


def url(path):
    from Functions import media_server
    return {"success": bool(path and os.path.isfile(path)), "url": media_server.register(path) if path and os.path.isfile(path) else None}
