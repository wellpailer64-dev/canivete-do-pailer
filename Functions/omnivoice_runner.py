"""
Runner isolado para operacoes pesadas do OmniVoice.

Ele nao importa nada do Canivete de proposito: assim pode rodar dentro de um
venv externo com `omnivoice` instalado, enquanto o app principal continua leve.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
from pathlib import Path
from typing import Any


def _emit(kind: str, message: str = "", **extra: Any) -> None:
    data = {"kind": kind, "message": message, **extra}
    print(json.dumps(data, ensure_ascii=False), flush=True)


def _write_result(path: str, data: dict[str, Any]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _configure_hf(hf_home: str) -> None:
    home = Path(hf_home)
    home.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(home)
    os.environ["HF_HUB_CACHE"] = str(home / "hub")
    os.environ["TRANSFORMERS_CACHE"] = str(home / "transformers")


def _choose_device(requested: str | None, torch: Any) -> str:
    if requested in {"cpu", "cuda", "cuda:0"}:
        if requested.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("CUDA foi solicitado, mas nao esta disponivel.")
        return "cuda:0" if requested == "cuda" else requested
    return "cuda:0" if torch.cuda.is_available() else "cpu"


def _choose_dtype(requested: str | None, device: str, torch: Any) -> Any:
    if requested == "float16":
        return torch.float16
    if requested == "bfloat16":
        return torch.bfloat16
    if requested == "float32":
        return torch.float32
    return torch.float16 if device.startswith("cuda") else torch.float32


def _load_model(payload: dict[str, Any]):
    import torch
    from omnivoice import OmniVoice

    device = _choose_device(payload.get("device") or "auto", torch)
    dtype = _choose_dtype(payload.get("dtype") or "auto", device, torch)
    _emit("log", f"Carregando OmniVoice em {device}...")
    start = time.perf_counter()
    model = OmniVoice.from_pretrained(
        payload.get("model") or "k2-fsa/OmniVoice",
        device_map=device,
        dtype=dtype,
    )
    _emit("log", f"Modelo carregado em {time.perf_counter() - start:.1f}s.")
    return model


def _normalize_tts_text(text: str) -> str:
    text = str(text or "").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    def _lower_caps(match: re.Match[str]) -> str:
        word = match.group(0)
        return word.lower() if len(word) >= 2 else word

    text = re.sub(r"\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]{2,}\b", _lower_caps, text)
    if text and text[-1] not in ".!?":
        text += "."
    return text


def _split_text(text: str, max_chars: int = 220) -> list[str]:
    text = _normalize_tts_text(text)
    parts: list[str] = []
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    for paragraph in paragraphs:
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", paragraph) if s.strip()]
        buf = ""
        for sentence in sentences or [paragraph]:
            if len(sentence) > max_chars:
                if buf:
                    parts.append(buf.strip())
                    buf = ""
                chunks = re.split(r"(?<=,)\s+|\s+", sentence)
                tiny = ""
                for token in chunks:
                    candidate = (tiny + " " + token).strip()
                    if len(candidate) > max_chars and tiny:
                        parts.append(tiny.strip())
                        tiny = token
                    else:
                        tiny = candidate
                if tiny:
                    parts.append(tiny.strip())
                continue
            candidate = (buf + " " + sentence).strip()
            if len(candidate) > max_chars and buf:
                parts.append(buf.strip())
                buf = sentence
            else:
                buf = candidate
        if buf:
            parts.append(buf.strip())
    return [p if p[-1] in ".!?" else p + "." for p in parts]


def _pedacos(text: str, options: dict[str, Any]) -> tuple[list[str], list[float]]:
    """Trechos para sintetizar e a pausa depois de cada um. Com options["respiro"], cada frase e cada vírgula vira um
    trecho e a pausa respeita a pontuação (respiro de leitura: menos engasgo e palavra comida nas frases longas)."""
    base = float(options.get("pause_seconds") or 0.18)
    max_chars = int(options.get("max_chunk_chars") or 220)
    if not options.get("respiro"):
        chunks = _split_text(text, max_chars)
        return chunks, [base] * len(chunks)
    virgula, ponto = float(options.get("pausa_virgula") or 0.16), float(options.get("pausa_ponto") or 0.38)
    pecas: list[str] = []
    for frase in _split_text(text, max_chars):
        for f in re.split(r"(?<=[.!?…:;])\s+", frase):
            buf = ""
            for parte in re.split(r"(?<=,)\s+", f.strip()):
                buf = (buf + " " + parte).strip()
                if len(buf) >= 28 or not buf.endswith(","):   # vírgula muito perto (ex.: "Depois,") fica junto
                    pecas.append(buf)
                    buf = ""
            if buf:
                pecas.append(buf)
    pecas = [p for p in pecas if re.search(r"\w", p)]
    pausas = [virgula if p.endswith(",") else ponto * 0.75 if p[-1] in ":;" else ponto for p in pecas]
    return pecas, pausas


def _target_duration(text: str, speed: float) -> float:
    spoken_chars = max(8, len(re.sub(r"\s+", "", text)))
    chars_per_second = 12.5
    margin = 1.12
    return max(1.4, min(28.0, spoken_chars / chars_per_second / max(speed, 0.5) * margin + 0.25))


def _generate_stable_audio(model: Any, prompt: Any, text: str, options: dict[str, Any]) -> Any:
    import numpy as np

    speed = float(options.get("speed") or 1.0)
    chunks, pausas = _pedacos(text, options)
    if not chunks:
        raise RuntimeError("Texto vazio para sintetizar.")

    audios = []
    for index, chunk in enumerate(chunks, 1):
        duration = _target_duration(chunk, speed) if options.get("stable_chunks", True) else None
        _emit(
            "progress",
            f"Sintetizando trecho {index}/{len(chunks)}...",
            percent=max(1, int((index - 1) / len(chunks) * 95)),
        )
        kwargs = {
            "text": chunk,
            "language": options.get("language") or "pt",
            "voice_clone_prompt": prompt,
            "num_step": int(options.get("num_step") or 32),
            "guidance_scale": float(options.get("guidance_scale") or 2.0),
            "t_shift": float(options.get("t_shift") or 0.1),
            "denoise": bool(options.get("denoise", True)),
            "postprocess_output": bool(options.get("postprocess_output", True)),
            "normalize_text": bool(options.get("normalize_text", False)),
        }
        if duration:
            kwargs["duration"] = duration
        else:
            kwargs["speed"] = speed
        generated = model.generate(**kwargs)[0]
        audios.append(generated)

    sample_rate = int(getattr(model, "sampling_rate", 24000) or 24000)
    merged = []
    for idx, audio in enumerate(audios):
        if idx:
            merged.append(np.zeros(int(sample_rate * pausas[idx - 1]), dtype=audio.dtype))
        merged.append(audio)
    return np.concatenate(merged), len(chunks), sample_rate


def action_download(payload: dict[str, Any]) -> dict[str, Any]:
    from huggingface_hub import snapshot_download

    _configure_hf(payload["hf_home"])
    _emit("progress", "Baixando arquivos do modelo...", percent=-1)
    path = snapshot_download(payload.get("model") or "k2-fsa/OmniVoice")
    _emit("progress", "Modelo pronto.", percent=100)
    return {"success": True, "snapshot_path": path}


def action_create_prompt(payload: dict[str, Any]) -> dict[str, Any]:
    _configure_hf(payload["hf_home"])
    model = _load_model(payload)
    prompt_path = Path(payload["prompt_path"])
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    _emit("progress", "Criando assinatura da voz...", percent=-1)
    prompt = model.create_voice_clone_prompt(
        ref_audio=payload["ref_audio"],
        ref_text=payload["ref_text"],
    )
    prompt.save(str(prompt_path))
    _emit("progress", "Voz salva.", percent=100)
    return {"success": True, "prompt_path": str(prompt_path)}


def action_design(payload: dict[str, Any]) -> dict[str, Any]:
    """Voz desenhada (sem referência): instruct = "female, young adult, moderate pitch"...; semente fixa = mesma voz."""
    import soundfile as sf
    import torch

    _configure_hf(payload["hf_home"])
    model = _load_model(payload)
    output_path = Path(payload["output_path"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _emit("progress", "Desenhando a voz...", percent=-1)
    torch.manual_seed(int(payload.get("seed") or 0))
    audio = model.generate(text=payload["text"], language=payload.get("language") or "pt", instruct=payload["instruct"],
                           num_step=int(payload.get("num_step") or 32), guidance_scale=float(payload.get("guidance_scale") or 2.0),
                           denoise=True, postprocess_output=True)[0]
    sf.write(str(output_path), audio, int(getattr(model, "sampling_rate", 24000) or 24000))
    _emit("progress", "Voz desenhada.", percent=100)
    return {"success": True, "output_path": str(output_path)}


def action_synthesize(payload: dict[str, Any]) -> dict[str, Any]:
    import soundfile as sf
    from omnivoice import VoiceClonePrompt

    _configure_hf(payload["hf_home"])
    model = _load_model(payload)
    prompt = VoiceClonePrompt.load(payload["prompt_path"])
    options = payload.get("options") or {}
    output_path = Path(payload["output_path"])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    _emit("progress", "Sintetizando voz...", percent=-1)
    start = time.perf_counter()
    audio, chunks, sample_rate = _generate_stable_audio(model, prompt, payload["text"], options)
    sf.write(str(output_path), audio, sample_rate)
    seconds = time.perf_counter() - start
    _emit("progress", "Audio gerado.", percent=100)
    return {"success": True, "output_path": str(output_path), "seconds": seconds, "chunks": chunks}


def serve(hf_home: str, model_id: str) -> int:
    """Modelo carregado uma vez: lê pedidos JSON por linha no stdin e responde {"kind": "result", ...} no stdout.
    Fecha com {"action": "sair"} ou quando o stdin acaba (o app fechou)."""
    import soundfile as sf
    from omnivoice import VoiceClonePrompt

    for s in (sys.stdin, sys.stdout):
        if hasattr(s, "reconfigure"):
            s.reconfigure(encoding="utf-8")
    _configure_hf(hf_home)
    model = _load_model({"model": model_id})
    prompts: dict[str, Any] = {}
    _emit("pronto")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req: dict[str, Any] = {}
        try:
            req = json.loads(line)
            if req.get("action") == "sair":
                break
            p = req["prompt_path"]
            if p not in prompts:
                prompts[p] = VoiceClonePrompt.load(p)
            start = time.perf_counter()
            audio, chunks, sample_rate = _generate_stable_audio(model, prompts[p], req["text"], req.get("options") or {})
            Path(req["output_path"]).parent.mkdir(parents=True, exist_ok=True)
            sf.write(req["output_path"], audio, sample_rate)
            _emit("result", id=req.get("id"), success=True, output_path=req["output_path"],
                  seconds=time.perf_counter() - start, chunks=chunks)
        except Exception as exc:
            _emit("result", str(exc), id=req.get("id"), success=False, error=str(exc))
    return 0


def main() -> int:
    if len(sys.argv) == 4 and sys.argv[1] == "serve":
        return serve(sys.argv[2], sys.argv[3])
    if len(sys.argv) != 4:
        print("Uso: omnivoice_runner.py <acao> <payload.json> <resultado.json>", file=sys.stderr)
        return 2

    action, payload_path, result_path = sys.argv[1:]
    payload = json.loads(Path(payload_path).read_text(encoding="utf-8"))
    actions = {
        "download": action_download,
        "create_prompt": action_create_prompt,
        "synthesize": action_synthesize,
        "design": action_design,
    }
    try:
        if action not in actions:
            raise ValueError(f"Acao desconhecida: {action}")
        result = actions[action](payload)
        _write_result(result_path, result)
        return 0
    except Exception as exc:
        tb = traceback.format_exc()
        _emit("error", str(exc))
        _write_result(result_path, {"success": False, "error": str(exc), "traceback": tb})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
