"""
Melhorar áudio (estilo Adobe Podcast) — o trabalho pesado, em duas etapas:

1. Sidon (sarulab-speech/sidon-v0.1): limpa a voz (lê o conteúdo da fala com w2v-BERT e sintetiza de novo, 48 kHz).
2. OmniVoice "por cima": o áudio do Sidon vira tokens do codec (8 camadas); as 2 primeiras (o que é dito, a entonação
   e o tempo) ficam e as outras 6 são geradas de novo pelo OmniVoice com o texto da fala e a própria voz como
   referência (<|denoise|> = referência suja, saída limpa). A duração não muda: a boca continua sincronizada.

Roda dentro do app (torch embutido) ou num venv externo (`python melhorar_audio_runner.py payload.json result.json`,
mesmo esquema do omnivoice_runner). Não importa nada de Functions — o venv externo não tem o Canivete.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
import traceback
from pathlib import Path

SIDON_REPO = "sarulab-speech/sidon-v0.1"
W2V_REPO = "facebook/w2v-bert-2.0"
OMNI_REPO = "k2-fsa/OmniVoice"
BLOCO_MAX = 12.0     # segundos de fala por passada do OmniVoice
MARGEM = 0.25        # folga antes/depois da fala em cada bloco
_MODELOS: dict = {}


def _emit_stdout(kind, message, **extra):
    print(json.dumps({"kind": kind, "message": message, **extra}, ensure_ascii=False), flush=True)


def _ler_wav(path):
    import numpy as np
    import soundfile as sf
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    return np.ascontiguousarray(x.mean(axis=1)), sr


# ─────────────────────────── 1. Sidon ───────────────────────────

def sidon(x48, cache_dir, device, emit):
    """Voz limpa a 48 kHz (mesmo comprimento da entrada)."""
    import numpy as np
    import torch
    import transformers
    from huggingface_hub import hf_hub_download
    from scipy.signal import butter, resample_poly, sosfilt

    tipo = "cuda" if device.startswith("cuda") else "cpu"
    chave = ("sidon", tipo)
    if chave not in _MODELOS:
        emit("progress", "Baixando/carregando o Sidon (1 GB na primeira vez)...", percent=-1)
        fe = hf_hub_download(SIDON_REPO, f"feature_extractor_{tipo}.pt", cache_dir=cache_dir)
        dec = hf_hub_download(SIDON_REPO, f"decoder_{tipo}.pt", cache_dir=cache_dir)
        pre = transformers.SeamlessM4TFeatureExtractor.from_pretrained(W2V_REPO, cache_dir=cache_dir)
        _MODELOS[chave] = (torch.jit.load(fe, map_location=device).to(device),
                           torch.jit.load(dec, map_location=device).to(device), pre)
    fe, dec, pre = _MODELOS[chave]

    n = len(x48)
    pico = float(np.abs(x48).max()) or 1.0
    x = 0.9 * x48 / pico
    x = sosfilt(butter(2, 50, "highpass", fs=48000, output="sos"), x).astype(np.float32)
    w16 = resample_poly(x, 1, 3).astype(np.float32)
    w16 = np.pad(w16, (0, 24000))
    pedacos, cache = [], None
    passo = 16000 * 96
    with torch.inference_mode():
        for i in range(0, len(w16), passo):
            emit("progress", "Limpando a voz (Sidon)...", percent=5 + 25 * i / len(w16))
            ch = np.pad(w16[i:i + passo], (160, 160))
            entrada = pre(ch, sampling_rate=16000, return_tensors="pt")["input_features"].to(device)
            f = fe(entrada)["last_hidden_state"]
            if cache is not None:
                f = torch.cat([cache, f], dim=1)
            pedacos.append(dec(f.transpose(1, 2)).view(-1)[:-960].float().cpu())
            cache = f[:, -1:]
    y = torch.cat(pedacos).numpy()[:n]
    return np.pad(y, (0, max(0, n - len(y))))


# ─────────────────────────── 2. OmniVoice por cima ───────────────────────────

def _carregar_omni(device, hf_home):
    import torch
    chave = ("omni", device)
    if chave not in _MODELOS:
        if hf_home:
            os.environ["HF_HOME"] = hf_home
            os.environ["HF_HUB_CACHE"] = os.path.join(hf_home, "hub")
        from omnivoice import OmniVoice
        dtype = torch.float16 if device.startswith("cuda") else torch.float32
        _MODELOS[chave] = OmniVoice.from_pretrained(OMNI_REPO, device_map=device, dtype=dtype)
    return _MODELOS[chave]


def _blocos(frases, dur):
    """Frases [[ini, fim, texto]] juntas em blocos de até BLOCO_MAX s → [(a, b, texto)] sem sobrepor."""
    grupos, cur = [], []
    for f in frases:
        if cur and f[1] - cur[0][0] > BLOCO_MAX:
            grupos.append(cur)
            cur = []
        cur.append(f)
    if cur:
        grupos.append(cur)
    out = []
    for i, g in enumerate(grupos):
        a, b = g[0][0] - MARGEM, g[-1][1] + MARGEM
        if i:
            a = max(a, (grupos[i - 1][-1][1] + g[0][0]) / 2)
        if i < len(grupos) - 1:
            b = min(b, (g[-1][1] + grupos[i + 1][0][0]) / 2)
        out.append((max(0.0, a), min(dur, b), " ".join(f[2] for f in g).strip()))
    return [o for o in out if o[1] - o[0] > 0.3 and o[2]]


def omnivoice_por_cima(x48, frases, device, hf_home, emit, model=None, camadas=2, num_step=32):
    """Refaz as camadas finas do codec com o OmniVoice. Devolve 48 kHz, mesmo comprimento."""
    import numpy as np
    import torch
    from scipy.signal import resample_poly
    from omnivoice.models import omnivoice as ov

    n48 = len(x48)
    emit("progress", "Carregando o OmniVoice...", percent=32)
    m = model or _carregar_omni(device, hf_home)
    dev = str(m.device)
    sr = int(m.sampling_rate)
    x = resample_poly(x48, sr, 48000).astype(np.float32)
    rms = float(np.sqrt(np.mean(x ** 2))) or 1e-6
    x = x * (0.1 / rms)
    hop = int(m.audio_tokenizer.config.hop_length)
    C, MASK = m.config.num_audio_codebook, m.config.audio_mask_id
    cfg = ov.OmniVoiceGenerationConfig()

    def enc(w):
        w = w[: len(w) // hop * hop]
        t = torch.from_numpy(w).view(1, 1, -1).to(m.audio_tokenizer.device)
        return m.audio_tokenizer.encode(t).audio_codes.squeeze(0).to(dev)

    blocos = _blocos(frases, len(x) / sr)
    if not blocos:
        return x48
    # referência: a frase de 3–10 s mais longa (a própria voz, já limpa pelo Sidon)
    boas = [f for f in frases if 3 <= f[1] - f[0] <= 10] or sorted(frases, key=lambda f: f[1] - f[0])[-1:]
    ref = max(boas, key=lambda f: f[1] - f[0])
    ref_tok = enc(x[int(ref[0] * sr): int(min(ref[1], ref[0] + 10) * sr)])
    ref_txt = ref[2]

    @torch.inference_mode()
    def refaz(tok_src, texto, passo):
        T = tok_src.shape[1]
        inp = m._prepare_inference_inputs(texto, T, ref_txt, ref_tok, None, None, True)
        ids = inp["input_ids"]
        L = ids.shape[2]
        init = tok_src.clone()
        init[camadas:] = MASK
        ids[0, :, L - T:] = init
        ids2 = torch.cat([ids, torch.full_like(ids, MASK)], 0)   # [condicionado, sem condição] (guidance)
        ids2[1, :, :T] = init
        am = torch.zeros(2, L, dtype=torch.bool, device=dev)
        am[0] = inp["audio_mask"][0]
        am[1, :T] = True
        att = torch.zeros(2, 1, L, L, dtype=torch.bool, device=dev)
        att[0] = True
        att[1, :, :T, :T] = True
        d = torch.arange(T, L, device=dev)
        att[1, :, d, d] = True
        tokens = init.unsqueeze(0)
        total = int((tokens == MASK).sum())
        ts = ov._get_time_steps(t_start=0.0, t_end=1.0, num_step=num_step, t_shift=cfg.t_shift).tolist()
        rest, sched = total, []
        for s in range(num_step):
            k = rest if s == num_step - 1 else min(math.ceil(total * (ts[s + 1] - ts[s])), rest)
            sched.append(k)
            rest -= k
        lid = torch.arange(C, device=dev).view(1, -1, 1)
        for s in range(num_step):
            if sched[s] <= 0:
                continue
            passo(s / num_step)
            lg = m(input_ids=ids2, audio_mask=am, attention_mask=att).logits.float()
            pred, sc = m._predict_tokens_with_scoring(lg[0:1, :, L - T:L], lg[1:2, :, :T], cfg)
            sc = sc - lid * cfg.layer_penalty_factor
            sc = ov._gumbel_sample(sc, cfg.position_temperature)
            sc.masked_fill_(tokens != MASK, -float("inf"))
            _, idx = torch.topk(sc.flatten(), sched[s])
            ft = tokens.flatten()
            ft[idx] = pred.flatten()[idx]
            tokens = ft.view_as(tokens)
            ids2[0, :, L - T:] = tokens[0]
            ids2[1, :, :T] = tokens[0]
        y = m.audio_tokenizer.decode(tokens.to(m.audio_tokenizer.device)).audio_values[0]
        return y.float().cpu().numpy().reshape(-1)

    saida = x.copy()
    fade = int(0.02 * sr)
    for i, (a, b, texto) in enumerate(blocos):
        msg = f"Reconstruindo a voz (OmniVoice) {i + 1}/{len(blocos)}..."
        ia = int(a * sr) // hop * hop
        w = x[ia: int(b * sr)]
        if len(w) < hop * 4:
            continue
        # progresso a cada passo (32 por bloco): a barra anda mesmo num bloco longo
        y = refaz(enc(w), texto, lambda f, i=i, msg=msg: emit("progress", msg, percent=35 + 60 * (i + f) / len(blocos)))
        y = y[: len(w) // hop * hop]
        nb = len(y)
        # cola com uma rampa curta nas bordas (o resto do áudio fica o do Sidon)
        r = np.ones(nb, dtype=np.float32)
        f = min(fade, nb // 4)
        if f:
            r[:f] = np.linspace(0, 1, f)
            r[-f:] = np.linspace(1, 0, f)
        saida[ia: ia + nb] = saida[ia: ia + nb] * (1 - r) + y * r
    y48 = resample_poly(saida, 48000, sr).astype(np.float32)[:n48]
    return np.pad(y48, (0, max(0, n48 - len(y48))))


# ─────────────────────────── tudo junto ───────────────────────────

def processar(payload, emit=_emit_stdout, model=None):
    """payload: entrada (wav 48 kHz mono), saida (wav), frases [[ini, fim, texto]], sidon_cache, omni_hf_home,
    device ('auto'|'cpu'|'cuda'), camadas (2), num_step (32)."""
    import numpy as np
    import soundfile as sf
    import torch

    t0 = time.time()
    dev = payload.get("device") or "auto"
    if dev == "auto":
        dev = "cuda:0" if torch.cuda.is_available() else "cpu"
    if model is not None:
        dev = str(model.device)
    emit("log", f"Melhorar áudio em {dev}")
    x, sr = _ler_wav(payload["entrada"])
    if sr != 48000:
        from scipy.signal import resample_poly
        x = resample_poly(x, 48000, sr).astype(np.float32)
    y = sidon(x, payload["sidon_cache"], dev, emit)
    if dev.startswith("cuda"):
        # o Sidon (w2v-BERT, ~2,5 GB) sai da placa antes do OmniVoice: os dois juntos lotavam uma placa de 8 GB e o
        # Windows passava a usar a RAM como memória de vídeo — cada passo levava minutos (parecia travado)
        _MODELOS.pop(("sidon", "cuda"), None)
        import gc
        gc.collect()
        torch.cuda.empty_cache()
    frases = [f for f in (payload.get("frases") or []) if f[2].strip()]
    if frases and payload.get("omnivoice", True):
        y = omnivoice_por_cima(y, frases, dev, payload.get("omni_hf_home"), emit, model,
                               int(payload.get("camadas") or 2), int(payload.get("num_step") or 32))
    else:
        emit("log", "Sem fala reconhecida: só a limpeza do Sidon")
    pico = float(np.abs(y).max()) or 1.0
    sf.write(payload["saida"], (0.9 * y / pico).astype(np.float32), 48000, subtype="PCM_24")
    return {"success": True, "saida": payload["saida"], "segundos": round(time.time() - t0, 1), "device": dev}


def main():
    if len(sys.argv) != 3:
        print("Uso: melhorar_audio_runner.py <payload.json> <resultado.json>", file=sys.stderr)
        return 2
    payload_path, result_path = sys.argv[1:]
    payload = json.loads(Path(payload_path).read_text(encoding="utf-8"))
    try:
        r = processar(payload)
        code = 0
    except Exception as exc:
        _emit_stdout("error", str(exc))
        r, code = {"success": False, "error": str(exc), "traceback": traceback.format_exc()}, 1
    Path(result_path).write_text(json.dumps(r, ensure_ascii=False), encoding="utf-8")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
