"""Gerar efeitos sonoros por texto (EzAudio XL, licença MIT; OpenSound/EzAudio) — local, sem torch, sem login.
Os três pedaços do modelo foram convertidos para ONNX 16 bits (D:/kanivete_testes/sfx/ez: exportar.py + enxugar.py):
  t5.onnx (+ .pesos)       leitor de texto (encoder do flan-t5-xl, Apache 2.0)   ~2,3 GB
  dit.onnx (+ .pesos)      gerador (MaskDiT, 28 blocos)                          ~1,6 GB
  vae_dec.onnx (+ .pesos)  decodificador latente → som 24 kHz                    ~0,1 GB
Roda com onnxruntime-DirectML (qualquer placa de vídeo; sem placa, no processador): o leitor de texto no processador,
o gerador e o decodificador na placa (pico medido: +3,6 GB numa RTX 3050).
O agendador (DDIM com v-prediction, betas reescalados para SNR zero, passos 'trailing', eta 1) e o "guidance" com
reescala são os do diffusers/EzAudio (src/inference.py), refeitos em numpy.
Uso: gerar("old wooden door creaking open slowly", segundos=10, passos=50) → {"sr": 24000, "audio": np.float32 [n]}"""
import gc
import json
import os
import time

import numpy as np

PASSOS_TREINO = 1000
SR = 24000
LATENTE_HZ = 50          # quadros latentes por segundo
MAX_TOKENS = 100


def pasta_modelo():
    try:
        from Functions.midia import app_dir
        base = app_dir()
    except Exception:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.environ.get("CANIVETE_SFX_MODELO") or os.path.join(base, "modelos_ia", "sfx_ezaudio")


def instalado(pasta=None):
    p = pasta or pasta_modelo()
    return all(os.path.exists(os.path.join(p, f)) for f in ("t5.onnx", "dit.onnx", "vae_dec.onnx", "tokenizer.json"))


# ── agendador DDIM (diffusers.DDIMScheduler com a config do EzAudio XL) ──
def _alphas_cumprod():
    betas = np.linspace(0.00085 ** 0.5, 0.012 ** 0.5, PASSOS_TREINO, dtype=np.float64) ** 2   # scaled_linear
    ac = np.cumprod(1.0 - betas)
    # rescale_betas_zero_snr: o último passo vira ruído puro (SNR 0), o primeiro fica igual
    s = np.sqrt(ac)
    s0, sT = s[0], s[-1]
    s = (s - sT) * s0 / (s0 - sT)
    ac = s ** 2
    alphas = np.concatenate([ac[:1], ac[1:] / ac[:-1]])
    return np.cumprod(alphas)


def _passos_trailing(n):
    return (np.round(np.arange(PASSOS_TREINO, 0, -PASSOS_TREINO / n)).astype(np.int64) - 1)


def _ddim_passo(ac, v, t, x, n, eta, rng):
    prev = t - PASSOS_TREINO // n
    a_t = ac[t]
    a_p = ac[prev] if prev >= 0 else 1.0          # set_alpha_to_one
    b_t = 1.0 - a_t
    x0 = np.sqrt(a_t) * x - np.sqrt(b_t) * v      # v-prediction
    eps = np.sqrt(a_t) * v + np.sqrt(b_t) * x
    var = (1 - a_p) / (1 - a_t) * (1 - a_t / a_p) if (1 - a_t) > 0 else 0.0
    std = eta * np.sqrt(max(var, 0.0))
    prev_x = np.sqrt(a_p) * x0 + np.sqrt(max(1 - a_p - std ** 2, 0.0)) * eps
    if eta > 0:
        prev_x = prev_x + std * rng.standard_normal(x.shape).astype(np.float32)
    return prev_x.astype(np.float32)


def _reescala_cfg(cfg, texto, fator):
    eixos = tuple(range(1, cfg.ndim))
    rs = cfg * (texto.std(axis=eixos, keepdims=True) / np.maximum(cfg.std(axis=eixos, keepdims=True), 1e-8))
    return fator * rs + (1 - fator) * cfg


# ── sessões do onnxruntime (DirectML se houver) ──
# Tudo fica carregado entre um efeito e outro (liberar() solta): o gerador e o decodificador na placa (~1,8 GB + ~1,8 GB
# de trabalho); o leitor de texto no PROCESSADOR (1,1 s por frase). Medido: destruir e recriar uma sessão do DirectML
# com outra aberta derruba o processo (access violation no 2º efeito) — por isso nada entra e sai da placa.
_CARREGADOS = {}


def liberar():
    _CARREGADOS.clear()
    gc.collect()


def _sessao_fixa(pasta, nome, usar_placa):
    chave = (pasta, nome, usar_placa)
    if chave not in _CARREGADOS:
        _CARREGADOS[chave] = _sessao(os.path.join(pasta, nome), usar_placa)
    return _CARREGADOS[chave]


def _sessao(caminho, usar_placa=True):
    import onnxruntime as ort
    op = ort.SessionOptions()
    op.enable_mem_pattern = False                  # exigência do DirectML
    op.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    op.log_severity_level = 3
    prov = ["DmlExecutionProvider", "CPUExecutionProvider"] if usar_placa and "DmlExecutionProvider" in ort.get_available_providers() \
        else ["CPUExecutionProvider"]
    return ort.InferenceSession(caminho, op, providers=prov)


def _tokens(pasta, textos):
    from tokenizers import Tokenizer
    tk = Tokenizer.from_file(os.path.join(pasta, "tokenizer.json"))
    tk.enable_truncation(MAX_TOKENS)
    tk.enable_padding(length=MAX_TOKENS, pad_id=0, pad_token="<pad>")
    enc = tk.encode_batch(textos)
    ids = np.array([e.ids for e in enc], dtype=np.int64)
    mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
    return ids, mask


def salvar_wav(caminho, audio, sr, normalizar=True):
    """WAV 16 bits mono (sem dependências)."""
    import wave
    a = np.asarray(audio, dtype=np.float32)
    if normalizar:
        a = a / max(1e-6, float(np.abs(a).max())) * 0.95
    with wave.open(caminho, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(a, -1, 1) * 32767).astype("<i2").tobytes())
    return caminho


def gerar(texto, segundos=10.0, passos=50, guia=5.0, reescala=0.75, semente=None, pasta=None, usar_placa=True, progresso=None):
    """Gera o efeito. progresso(fração 0..1, rótulo) é chamado a cada etapa/passo."""
    pasta = pasta or pasta_modelo()
    if not instalado(pasta):
        raise RuntimeError("modelo de efeitos sonoros não instalado")
    prog = progresso or (lambda f, r: None)
    medidas = {}
    t0 = time.time()
    # 1) leitor de texto: a frase e a frase vazia (o "sem texto" do guidance); depois sai da placa
    prog(0.0, "Lendo o pedido")
    ids, mask = _tokens(pasta, [texto, ""])
    h = _sessao_fixa(pasta, "t5.onnx", False).run(["h"], {"ids": ids, "mask": mask})[0].astype(np.float16)
    medidas["texto_s"] = round(time.time() - t0, 2)
    ctx_mask = mask.astype(bool)
    # 2) gerador: passos do DDIM, o par (com texto, sem texto) num lote só
    t1 = time.time()
    dit = _sessao_fixa(pasta, "dit.onnx", usar_placa)
    medidas["carregar_gerador_s"] = round(time.time() - t1, 2)
    rng = np.random.default_rng(semente)
    L = int(round(segundos * LATENTE_HZ))
    x = rng.standard_normal((1, 128, L)).astype(np.float32)
    ac = _alphas_cumprod()
    ts = _passos_trailing(passos)
    t2 = time.time()
    for k, t in enumerate(ts):
        xx = np.concatenate([x, x]).astype(np.float16)
        v = dit.run(["v"], {"x": xx, "t": np.array([t, t], dtype=np.int64), "ctx": h, "ctx_mask": ctx_mask})[0].astype(np.float32)
        v_txt, v_vazio = v[:1], v[1:]
        v = v_vazio + guia * (v_txt - v_vazio)
        if reescala > 0:
            v = _reescala_cfg(v, v_txt, reescala)
        x = _ddim_passo(ac, v, int(t), x, passos, 1.0, rng)
        prog(0.05 + 0.9 * (k + 1) / len(ts), f"Gerando ({k + 1}/{len(ts)})")
    medidas["passos_s"] = round(time.time() - t2, 2)
    # 3) decodificador: latente → som
    t3 = time.time()
    vae = _sessao_fixa(pasta, "vae_dec.onnx", usar_placa)
    audio = vae.run(["audio"], {"z": x.astype(np.float32)})[0].reshape(-1).astype(np.float32)
    medidas["decodificar_s"] = round(time.time() - t3, 2)
    medidas["total_s"] = round(time.time() - t0, 2)
    prog(1.0, "Pronto")
    return {"sr": SR, "audio": audio[: int(segundos * SR)], "medidas": medidas}


if __name__ == "__main__":
    import sys
    pasta = sys.argv[2] if len(sys.argv) > 2 else None
    r = gerar(sys.argv[1] if len(sys.argv) > 1 else "a dog barking in the distance", pasta=pasta, semente=1234,
              progresso=lambda f, rot: print(f"\r{rot} {f * 100:.0f}%", end="", flush=True))
    salvar_wav("efeito.wav", r["audio"], r["sr"])
    print("\n", json.dumps(r["medidas"]))


# ── instalação (release "sfx-v1" do GitHub, sem login), tradução e geração em segundo plano ──
import hashlib
import re
import threading
import urllib.request

VERSAO = 1
URL_BASE = f"https://github.com/wellpailer64-dev/canivete-do-pailer/releases/download/sfx-v{VERSAO}/"
PASSOS_PADRAO = 50     # o Pailer comparou 25 × 50: 50 ficou "muito melhor" (≈ 35 s por efeito de 10 s numa RTX 3050)
_baixando = threading.Lock()
_gerando = threading.Lock()


def _ua(url):
    return urllib.request.Request(url, headers={"User-Agent": "CaniveteDoPailer"})


def _sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    return h.hexdigest()


def pasta_saida():
    from Functions.midia import app_dir
    p = os.path.join(app_dir(), "efeitos_gerados")
    os.makedirs(p, exist_ok=True)
    return p


def estado():
    return {"success": True, "instalado": instalado(), "baixando": _baixando.locked(), "gerando": _gerando.locked(),
            "pasta": pasta_modelo(), "tamanho_gb": 4.0, "passos": PASSOS_PADRAO}


def baixar(on_progress):
    """Baixa o modelo (≈ 4 GB, retoma se cair) e confere cada arquivo pelo SHA-256 do manifesto."""
    if not _baixando.acquire(blocking=False):
        return {"success": False, "error": "Já está baixando."}

    def run():
        destino = pasta_modelo()
        try:
            os.makedirs(destino, exist_ok=True)
            with urllib.request.urlopen(_ua(URL_BASE + "manifesto.json"), timeout=60) as r:
                man = json.loads(r.read().decode("utf-8"))
            arqs = man["arquivos"]
            total = sum(a["tamanho"] for a in arqs.values())
            feito = 0
            for nome, info in arqs.items():
                alvo = os.path.join(destino, nome)
                if os.path.exists(alvo) and os.path.getsize(alvo) == info["tamanho"] and _sha(alvo) == info["sha256"]:
                    feito += info["tamanho"]
                    continue
                parcial = alvo + ".download"
                ja = os.path.getsize(parcial) if os.path.exists(parcial) else 0
                req = _ua(URL_BASE + nome)
                if ja:
                    req.add_header("Range", f"bytes={ja}-")
                with urllib.request.urlopen(req, timeout=60) as r, open(parcial, "ab" if ja else "wb") as f:
                    if ja and r.status != 206:   # o servidor ignorou a retomada: recomeça o arquivo
                        f.seek(0); f.truncate(); ja = 0
                    feito_arq, ultimo = ja, -1
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                        feito_arq += len(b)
                        pct = int((feito + feito_arq) * 100 / total)
                        if pct != ultimo:
                            ultimo = pct
                            on_progress({"pct": pct, "msg": f"Baixando o gerador de efeitos... {(feito + feito_arq) / 2**30:.2f} / {total / 2**30:.2f} GB"})
                if os.path.getsize(parcial) != info["tamanho"] or _sha(parcial) != info["sha256"]:
                    os.remove(parcial)
                    raise RuntimeError(f"{nome} chegou corrompido; tente de novo")
                os.replace(parcial, alvo)
                feito += info["tamanho"]
            on_progress({"pct": 100, "msg": "Montando o modelo..."})
            for nome, partes in (man.get("juntar") or {}).items():
                alvo = os.path.join(destino, nome)
                if not (os.path.exists(alvo) and _sha(alvo) == man["sha_juntos"][nome]):
                    with open(alvo + ".tmp", "wb") as g:
                        for p in partes:
                            with open(os.path.join(destino, p), "rb") as f:
                                for b in iter(lambda: f.read(1 << 24), b""):
                                    g.write(b)
                    if _sha(alvo + ".tmp") != man["sha_juntos"][nome]:
                        raise RuntimeError(f"{nome} não confere depois de juntar")
                    os.replace(alvo + ".tmp", alvo)
                for p in partes:
                    try:
                        os.remove(os.path.join(destino, p))
                    except OSError:
                        pass
            on_progress({"fim": True})
        except Exception as e:
            on_progress({"erro": f"Não foi possível baixar o gerador de efeitos: {e}"})
        finally:
            _baixando.release()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def traduzir(texto):
    """Pedido em português → inglês (o modelo foi treinado em inglês). Usa o Ollama com o modelo do Kani, se houver, e
    manda ele sair da placa logo depois (keep_alive 0) para não disputar memória com o gerador. Sem Ollama: como veio."""
    t = (texto or "").strip()
    if not t:
        return t
    try:
        from Functions import kani
        if not kani._ollama_tem():
            return t
        corpo = json.dumps({"model": kani.OLLAMA_MODELO, "stream": False, "keep_alive": 0, "options": {"temperature": 0},
                            "prompt": "/no_think Translate this sound-effect description to concise English for an audio "
                                      "generation model. If it is already English, return it unchanged. Answer with the "
                                      "English text only.\n\n" + t}).encode("utf-8")
        req = urllib.request.Request(kani.OLLAMA + "/api/generate", data=corpo, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            out = json.loads(r.read().decode("utf-8")).get("response", "")
        out = re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip().strip('"').strip()
        return out.splitlines()[0].strip() if out else t
    except Exception:
        return t


def gerar_arquivo(texto, segundos, on_progress, passos=None, semente=None, traduzir_pedido=True):
    """Em segundo plano: traduz (se der), gera e grava o WAV em efeitos_gerados/. on_progress({pct, msg}) /
    {fim: True, path, nome, texto_en, medidas} / {erro}."""
    if not _gerando.acquire(blocking=False):
        return {"success": False, "error": "Já está gerando um efeito."}
    if not instalado():
        _gerando.release()
        return {"success": False, "error": "O gerador de efeitos ainda não foi baixado."}

    def run():
        try:
            on_progress({"pct": 0, "msg": "Entendendo o pedido..."})
            en = traduzir(texto) if traduzir_pedido else texto
            seg = max(1.0, min(10.0, float(segundos or 5)))
            r = gerar(en, segundos=seg, passos=int(passos or PASSOS_PADRAO), semente=semente,
                      progresso=lambda f, rot: on_progress({"pct": int(f * 100), "msg": rot}))
            slug = re.sub(r"[^a-z0-9]+", "_", (texto or "efeito").lower())[:40].strip("_") or "efeito"
            caminho = os.path.join(pasta_saida(), f"{slug}_{time.strftime('%Y%m%d_%H%M%S')}.wav")
            salvar_wav(caminho, r["audio"], r["sr"])
            on_progress({"fim": True, "path": caminho, "nome": os.path.basename(caminho), "texto_en": en, "medidas": r["medidas"]})
        except Exception as e:
            on_progress({"erro": f"Não foi possível gerar o efeito: {e}"})
        finally:
            _gerando.release()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}
