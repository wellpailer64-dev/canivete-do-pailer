"""
Ferramenta OmniVoice: geração e sintese de voz sob demanda.

O modelo pesado fica fora do primeiro uso do app. Quando disponivel, este
modulo usa o pacote `omnivoice` embutido; caso contrario, pode chamar um venv
externo ja existente com OmniVoice instalado.
"""
from __future__ import annotations

import datetime as _dt
import importlib.util
import json
import os
import re
import shutil
import subprocess
import threading
import time
import unicodedata
import uuid
from pathlib import Path
from typing import Any, Callable

from Functions.midia import NO_WINDOW, app_dir, ffmpeg, nome_livre, probe

MODEL_ID = "k2-fsa/OmniVoice"
MAX_NUM_STEP = 32

LogFn = Callable[[str], None] | None
ProgressFn = Callable[[float, str | None], None] | None

_MODEL_CACHE: dict[tuple[str, str, str], Any] = {}
REFERENCE_SECONDS = 8.0
REFERENCE_TREATMENT = "leve"
PREPARED_REFERENCE = "preparada"


def _log(cb: LogFn, msg: str) -> None:
    if cb:
        cb(msg)


def _progress(cb: ProgressFn, pct: float, status: str | None = None) -> None:
    if cb:
        cb(pct, status)


def _base_dir() -> str:
    return os.path.join(app_dir(), "modelos_ia", "omnivoice")


def _hf_home() -> str:
    return os.path.join(_base_dir(), "models", "hf_cache")


def _voices_dir() -> str:
    return os.path.join(_base_dir(), "voices")


def _prompts_dir() -> str:
    return os.path.join(_base_dir(), "prompts")


def _references_dir() -> str:
    return os.path.join(_base_dir(), "references")


def _outputs_dir() -> str:
    return os.path.join(_base_dir(), "outputs")


def _tmp_dir() -> str:
    return os.path.join(_base_dir(), "tmp")


def _db_path() -> str:
    return os.path.join(_voices_dir(), "voices.json")


def _ensure_dirs() -> None:
    for path in (_hf_home(), _voices_dir(), _prompts_dir(), _references_dir(), _outputs_dir(), _tmp_dir()):
        os.makedirs(path, exist_ok=True)


def _configure_hf(hf_home: str | None = None) -> str:
    home = hf_home or _hf_home()
    os.makedirs(home, exist_ok=True)
    os.environ["HF_HOME"] = home
    os.environ["HF_HUB_CACHE"] = os.path.join(home, "hub")
    os.environ["TRANSFORMERS_CACHE"] = os.path.join(home, "transformers")
    return home


def _slug(text: str) -> str:
    clean = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    clean = re.sub(r"[^a-zA-Z0-9]+", "-", clean).strip("-").lower()
    return clean[:48] or "voz"


def _normalize_tts_text(text: str) -> str:
    text = str(text or "").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    def _lower_caps(match):
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
                tokens = re.split(r"(?<=,)\s+|\s+", sentence)
                tiny = ""
                for token in tokens:
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
    return max(1.4, min(28.0, spoken_chars / 12.5 / max(speed, 0.5) * 1.12 + 0.25))


def _now() -> str:
    return _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _load_db() -> list[dict[str, Any]]:
    try:
        data = json.loads(Path(_db_path()).read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [v for v in data if isinstance(v, dict)]
    except Exception:
        pass
    return []


def _save_db(voices: list[dict[str, Any]]) -> None:
    _ensure_dirs()
    path = Path(_db_path())
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(voices, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _public_voice(item: dict[str, Any]) -> dict[str, Any]:
    ref = item.get("reference_audio") or ""
    prompt = item.get("prompt_path") or ""
    return {
        "id": item.get("id"),
        "name": item.get("name") or "Voz sem nome",
        "ref_text": item.get("ref_text") or "",
        "reference_name": os.path.basename(ref) if ref else "",
        "reference_audio": ref,
        "prompt_path": prompt,
        "has_prompt": bool(prompt and os.path.exists(prompt)),
        "created_at": item.get("created_at") or "",
        "updated_at": item.get("updated_at") or "",
        "duration": item.get("duration"),
        "reference_treatment": item.get("reference_treatment") or "",
    }


def list_voices() -> list[dict[str, Any]]:
    return [_public_voice(v) for v in _load_db()]


def _snapshot_exists(hf_home: str | None = None) -> bool:
    home = hf_home or _hf_home()
    root = Path(home) / "hub" / "models--k2-fsa--OmniVoice" / "snapshots"
    if not root.is_dir():
        return False
    for snap in root.iterdir():
        if (snap / "model.safetensors").exists() and (snap / "config.json").exists():
            return True
    return False


def _candidate_external_hf_homes() -> list[str]:
    candidates = []
    env = os.environ.get("CANIVETE_OMNIVOICE_HF_HOME")
    if env:
        candidates.append(env)

    candidates.append(os.path.join(_base_dir(), "models", "hf_cache"))
    candidates.append(
        r"D:\01 - ALL IN CLOUD - HD PAILER\DESENVOLVIMENTOS EM PYTHON\Pailer FM\Pailer FM\_broadcast-boletins-local\voice_models\omnivoice\models\hf_cache"
    )

    seen = set()
    out = []
    for path in candidates:
        norm = os.path.abspath(path)
        if norm.lower() in seen:
            continue
        seen.add(norm.lower())
        out.append(norm)
    return out


def _external_hf_home() -> str | None:
    own = os.path.abspath(_hf_home())
    for path in _candidate_external_hf_homes():
        if os.path.abspath(path).lower() == own.lower():
            continue
        if _snapshot_exists(path):
            return path
    return None


def _effective_hf_home() -> str:
    if _snapshot_exists(_hf_home()):
        return _hf_home()
    return _external_hf_home() or _hf_home()


def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _inprocess_engine_ready() -> bool:
    return all(_module_available(name) for name in ("omnivoice", "soundfile", "torch"))


def _candidate_external_pythons() -> list[str]:
    candidates = []
    env = os.environ.get("CANIVETE_OMNIVOICE_PYTHON")
    if env:
        candidates.append(env)
    candidates.extend(
        [
            os.path.join(_base_dir(), "omnivoice_env", "Scripts", "python.exe"),
            os.path.join(app_dir(), "omnivoice_env", "Scripts", "python.exe"),
            r"D:\01 - ALL IN CLOUD - HD PAILER\DESENVOLVIMENTOS EM PYTHON\Pailer FM\Pailer FM\_broadcast-boletins-local\omnivoice_env\Scripts\python.exe",
        ]
    )

    seen = set()
    out = []
    for path in candidates:
        norm = os.path.abspath(path)
        if norm.lower() in seen:
            continue
        seen.add(norm.lower())
        if os.path.exists(norm):
            out.append(norm)
    return out


def _external_python_ready(path: str) -> bool:
    code = "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('omnivoice') and importlib.util.find_spec('soundfile') else 1)"
    try:
        r = subprocess.run([path, "-c", code], capture_output=True, timeout=12, creationflags=NO_WINDOW)
        return r.returncode == 0
    except Exception:
        return False


def _select_engine() -> dict[str, Any]:
    if _inprocess_engine_ready():
        return {"kind": "inprocess", "label": "embutido no Kanivete"}
    for py in _candidate_external_pythons():
        if _external_python_ready(py):
            return {"kind": "external", "python": py, "label": os.path.dirname(os.path.dirname(py))}
    return {"kind": "missing", "label": "OmniVoice nao instalado"}


def status() -> dict[str, Any]:
    _ensure_dirs()
    engine = _select_engine()
    own_model = _snapshot_exists(_hf_home())
    external_cache = _external_hf_home()
    return {
        "success": True,
        "installed": bool(engine["kind"] != "missing" and (own_model or external_cache)),
        "engine_ready": engine["kind"] != "missing",
        "engine": engine,
        "model_installed": own_model,
        "model_available": bool(own_model or external_cache),
        "external_model_cache": external_cache or "",
        "base_dir": _base_dir(),
        "voices": list_voices(),
        "max_num_step": MAX_NUM_STEP,
    }


def _runner_path() -> str:
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "omnivoice_runner.py")


def _run_external(action: str, payload: dict[str, Any], callback_log: LogFn = None,
                  callback_progresso: ProgressFn = None, timeout: int | None = None) -> dict[str, Any]:
    engine = _select_engine()
    if engine.get("kind") != "external":
        raise RuntimeError("OmniVoice nao esta instalado neste Kanivete e nenhum ambiente externo foi encontrado.")

    _ensure_dirs()
    token = uuid.uuid4().hex
    payload_path = os.path.join(_tmp_dir(), f"{token}.payload.json")
    result_path = os.path.join(_tmp_dir(), f"{token}.result.json")
    Path(payload_path).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    cmd = [engine["python"], _runner_path(), action, payload_path, result_path]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=NO_WINDOW,
    )
    started = time.time()
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            evt = json.loads(line)
        except json.JSONDecodeError:
            _log(callback_log, line)
            continue
        if evt.get("kind") == "progress":
            _progress(callback_progresso, float(evt.get("percent", -1)), evt.get("message") or None)
        elif evt.get("kind") == "error":
            _log(callback_log, f"Erro OmniVoice: {evt.get('message')}")
        else:
            _log(callback_log, evt.get("message") or line)
        if timeout and time.time() - started > timeout:
            proc.kill()
            raise TimeoutError("OmniVoice demorou demais e foi interrompido.")

    code = proc.wait()
    if os.path.exists(result_path):
        result = json.loads(Path(result_path).read_text(encoding="utf-8"))
    else:
        result = {"success": False, "error": "O OmniVoice nao retornou resultado."}
    if code != 0 or not result.get("success"):
        raise RuntimeError(result.get("error") or f"OmniVoice terminou com codigo {code}.")
    return result


# ── modelo mantido carregado (a Kani liga ao abrir o chat e desliga ao fechar) ──
_serv_lock = threading.RLock()
_serv: dict[str, Any] = {"proc": None}


def _servidor_vivo():
    p = _serv["proc"]
    return p if p is not None and p.poll() is None else None


def manter_carregado() -> dict[str, Any]:
    """Carrega o modelo e deixa na memória: as sínteses seguintes não pagam o carregamento (~10 s)."""
    engine = _select_engine()
    if engine["kind"] == "missing":
        return {"success": False, "error": "OmniVoice nao instalado"}
    hf_home = _ensure_model_available()
    if engine["kind"] == "inprocess":
        _load_model_inprocess(hf_home)
        return {"success": True}
    with _serv_lock:
        if _servidor_vivo():
            return {"success": True}
        proc = subprocess.Popen([engine["python"], "-u", _runner_path(), "serve", hf_home, MODEL_ID],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
        _serv["proc"] = proc
        assert proc.stdout is not None
        for line in proc.stdout:
            if '"kind": "pronto"' in line:
                return {"success": True}
        _serv["proc"] = None
        return {"success": False, "error": "o OmniVoice fechou ao carregar"}


def descarregar() -> dict[str, Any]:
    """Tira o modelo da memória (fecha o processo mantido ou limpa o cache embutido)."""
    p, _serv["proc"] = _serv["proc"], None
    if p is not None and p.poll() is None:
        try:
            p.stdin.write('{"action": "sair"}\n')
            p.stdin.flush()
            p.wait(timeout=5)
        except Exception:
            p.kill()
    if _MODEL_CACHE:
        _MODEL_CACHE.clear()
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:
            pass
    return {"success": True}


def _sintetizar_no_servidor(proc, payload: dict[str, Any]) -> dict[str, Any]:
    with _serv_lock:
        req = dict(payload, id=uuid.uuid4().hex)
        proc.stdin.write(json.dumps(req, ensure_ascii=False) + "\n")
        proc.stdin.flush()
        for line in proc.stdout:
            try:
                evt = json.loads(line)
            except json.JSONDecodeError:
                continue
            if evt.get("kind") == "result" and evt.get("id") == req["id"]:
                if not evt.get("success"):
                    raise RuntimeError(evt.get("error") or "falha na síntese")
                return evt
        raise RuntimeError("o OmniVoice mantido fechou")


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


def _load_model_inprocess(hf_home: str, callback_log: LogFn = None,
                          device: str = "auto", dtype: str = "auto") -> Any:
    import torch
    from omnivoice import OmniVoice

    _configure_hf(hf_home)
    resolved_device = _choose_device(device, torch)
    resolved_dtype = _choose_dtype(dtype, resolved_device, torch)
    key = (hf_home, resolved_device, str(resolved_dtype))
    if key not in _MODEL_CACHE:
        _log(callback_log, f"Carregando OmniVoice em {resolved_device}...")
        start = time.perf_counter()
        _MODEL_CACHE[key] = OmniVoice.from_pretrained(MODEL_ID, device_map=resolved_device, dtype=resolved_dtype)
        _log(callback_log, f"Modelo carregado em {time.perf_counter() - start:.1f}s.")
    from Functions import memoria
    memoria.usado("OmniVoice", _MODEL_CACHE.clear, memoria.GPU)
    return _MODEL_CACHE[key]


def download_model(callback_log: LogFn = None, callback_progresso: ProgressFn = None) -> dict[str, Any]:
    _ensure_dirs()
    if _snapshot_exists(_hf_home()):
        _log(callback_log, "Modelo OmniVoice ja esta na pasta do Kanivete.")
        return status()

    external_cache = _external_hf_home()
    if external_cache:
        _progress(callback_progresso, -1, "Importando modelo local existente...")
        _log(callback_log, f"Cache encontrado fora do Kanivete: {external_cache}")
        _log(callback_log, "Copiando para modelos_ia/omnivoice/models/hf_cache...")
        shutil.copytree(external_cache, _hf_home(), dirs_exist_ok=True)
        _progress(callback_progresso, 100, "Modelo importado.")
        return status()

    engine = _select_engine()
    if engine["kind"] == "missing":
        raise RuntimeError(
            "OmniVoice nao esta instalado. Na proxima build, inclua as dependencias do requirements.txt; "
            "neste PC tambem da para definir CANIVETE_OMNIVOICE_PYTHON apontando para um venv com OmniVoice."
        )

    payload = {"hf_home": _hf_home(), "model": MODEL_ID}
    if engine["kind"] == "inprocess":
        from huggingface_hub import snapshot_download

        _configure_hf(_hf_home())
        _progress(callback_progresso, -1, "Baixando modelo OmniVoice...")
        snapshot_download(MODEL_ID)
        _progress(callback_progresso, 100, "Modelo pronto.")
    else:
        _run_external("download", payload, callback_log, callback_progresso)
    return status()


def _ensure_model_available() -> str:
    hf_home = _effective_hf_home()
    if not _snapshot_exists(hf_home):
        raise RuntimeError("Modelo OmniVoice ainda nao esta baixado. Clique em Baixar modelo primeiro.")
    return hf_home


def _parse_silences(stderr: str) -> list[tuple[float, float]]:
    starts: list[float] = []
    silences: list[tuple[float, float]] = []
    for line in stderr.splitlines():
        m = re.search(r"silence_start:\s*([0-9.]+)", line)
        if m:
            starts.append(float(m.group(1)))
            continue
        m = re.search(r"silence_end:\s*([0-9.]+)", line)
        if m and starts:
            silences.append((starts.pop(0), float(m.group(1))))
    return silences


def _choose_reference_start(path: str, duration: float, clip_len: float, callback_log: LogFn = None) -> float:
    if duration <= clip_len + 0.25:
        return 0.0
    cmd = [
        ffmpeg(), "-hide_banner", "-nostdin", "-i", path,
        "-af", "silencedetect=noise=-35dB:d=0.45",
        "-f", "null", "-",
    ]
    try:
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=max(45, int(duration) + 15),
            creationflags=NO_WINDOW,
        )
        silences = _parse_silences(r.stderr or "")
    except Exception as exc:
        _log(callback_log, f"Nao consegui analisar silencio ({exc}); usando trecho central.")
        return max(0.0, (duration - clip_len) / 2)

    cursor = 0.0
    spoken: list[tuple[float, float]] = []
    for start, end in silences:
        if start - cursor > 0.7:
            spoken.append((cursor, start))
        cursor = max(cursor, end)
    if duration - cursor > 0.7:
        spoken.append((cursor, duration))

    if not spoken:
        return max(0.0, (duration - clip_len) / 2)

    candidates = [r for r in spoken if r[1] - r[0] >= clip_len]
    start, end = (candidates or spoken)[0]
    chosen = start + 0.05
    if end - start < clip_len:
        chosen = max(0.0, min(start, duration - clip_len))
    return max(0.0, min(chosen, max(0.0, duration - clip_len)))


def _reference_filter_chain() -> str:
    return ",".join(
        [
            "highpass=f=75",
            "lowpass=f=12000",
            "afftdn=nf=-25",
            "dynaudnorm=f=150:g=9:p=0.92:m=8",
            "loudnorm=I=-20:TP=-2:LRA=8",
        ]
    )


def _extract_reference(audio_path: str, voice_id: str, name: str, callback_log: LogFn = None,
                       treat_audio: bool = True) -> tuple[str, float, float]:
    info = probe(audio_path)
    duration = float(info.get("duracao") or 0.0)
    if duration <= 0:
        duration = 12.0
    clip_len = min(REFERENCE_SECONDS, max(1.0, duration))
    start = _choose_reference_start(audio_path, duration, clip_len, callback_log)
    out = os.path.join(_references_dir(), f"{_slug(name)}_{voice_id}.wav")
    cmd = [
        ffmpeg(), "-hide_banner", "-nostdin", "-y",
        "-ss", f"{start:.3f}",
        "-i", audio_path,
        "-t", f"{clip_len:.3f}",
    ]
    if treat_audio:
        cmd.extend(["-af", _reference_filter_chain()])
    cmd.extend([
        "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le",
        out,
    ])
    action = "Tratando e separando" if treat_audio else "Separando"
    _log(callback_log, f"{action} {clip_len:.1f}s de referencia a partir de {start:.1f}s...")
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    if treat_audio and (r.returncode != 0 or not os.path.exists(out)):
        _log(callback_log, "O tratamento da amostra falhou; tentando salvar a referencia sem tratamento.")
        cmd = [
            ffmpeg(), "-hide_banner", "-nostdin", "-y",
            "-ss", f"{start:.3f}",
            "-i", audio_path,
            "-t", f"{clip_len:.3f}",
            "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le",
            out,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    if r.returncode != 0 or not os.path.exists(out):
        raise RuntimeError((r.stderr or "Falha ao criar trecho de referencia.")[-700:])
    return out, clip_len, start


def _transcribe_reference(ref_audio: str, callback_log: LogFn = None,
                          callback_progresso: ProgressFn = None) -> str:
    _log(callback_log, "Transcrevendo a amostra curta para alinhar a voz...")
    _progress(callback_progresso, -1, "Transcrevendo amostra...")
    try:
        from Functions.transcreveraudio import configurar_ffmpeg

        configurar_ffmpeg()
        import whisper

        whisper_dir = os.path.join(app_dir(), "modelos_ia", "whisper")
        os.makedirs(whisper_dir, exist_ok=True)
        model = whisper.load_model("small", download_root=whisper_dir)
        result = model.transcribe(ref_audio, language="pt", fp16=False, verbose=False)
        text = (result.get("text") or "").strip()
    except Exception as exc:
        raise RuntimeError(f"Nao consegui transcrever a amostra de voz: {exc}") from exc
    if not text:
        raise RuntimeError("A transcricao da amostra ficou vazia. Use um audio com fala clara.")
    _log(callback_log, f"Texto da amostra: {text}")
    return text


def _create_prompt(ref_audio: str, ref_text: str, prompt_path: str, hf_home: str,
                   callback_log: LogFn = None, callback_progresso: ProgressFn = None) -> None:
    engine = _select_engine()
    payload = {
        "hf_home": hf_home,
        "model": MODEL_ID,
        "ref_audio": ref_audio,
        "ref_text": ref_text,
        "prompt_path": prompt_path,
    }
    if engine["kind"] == "inprocess":
        model = _load_model_inprocess(hf_home, callback_log)
        _progress(callback_progresso, -1, "Criando assinatura da voz...")
        prompt = model.create_voice_clone_prompt(ref_audio=ref_audio, ref_text=ref_text)
        os.makedirs(os.path.dirname(prompt_path), exist_ok=True)
        prompt.save(prompt_path)
        _progress(callback_progresso, 100, "Voz salva.")
    else:
        _run_external("create_prompt", payload, callback_log, callback_progresso)


def create_voice(name: str, audio_path: str, ref_text: str = "", options: dict[str, Any] | None = None,
                 callback_log: LogFn = None, callback_progresso: ProgressFn = None) -> dict[str, Any]:
    _ensure_dirs()
    name = (name or "").strip()
    if not name:
        raise RuntimeError("De um nome para a voz antes de salvar.")
    if not audio_path or not os.path.isfile(audio_path):
        raise RuntimeError("Escolha um arquivo de audio para criar a voz.")
    hf_home = _ensure_model_available()
    if _select_engine()["kind"] == "missing":
        raise RuntimeError("OmniVoice nao esta instalado neste computador.")

    voice_id = uuid.uuid4().hex[:12]
    treatment_enabled = bool((options or {}).get("reference_treatment", True))
    _progress(callback_progresso, 4, "Preparando referencia...")
    ref_audio, clip_len, start = _extract_reference(audio_path, voice_id, name, callback_log, treatment_enabled)
    final_ref_text = (ref_text or "").strip() or _transcribe_reference(ref_audio, callback_log, callback_progresso)

    prompt_path = os.path.join(_prompts_dir(), f"{_slug(name)}_{voice_id}.pt")
    _create_prompt(ref_audio, final_ref_text, prompt_path, hf_home, callback_log, callback_progresso)

    voices = _load_db()
    item = {
        "id": voice_id,
        "name": name,
        "ref_text": final_ref_text,
        "reference_audio": ref_audio,
        "prompt_path": prompt_path,
        "source_audio": os.path.abspath(audio_path),
        "duration": round(clip_len, 2),
        "start": round(start, 2),
        "reference_treatment": REFERENCE_TREATMENT if treatment_enabled else "sem_tratamento",
        "created_at": _now(),
        "updated_at": _now(),
    }
    voices.append(item)
    _save_db(voices)
    return {"success": True, "voice": _public_voice(item), "voices": list_voices()}


def update_voice(voice_id: str, name: str, ref_text: str,
                 callback_log: LogFn = None, callback_progresso: ProgressFn = None) -> dict[str, Any]:
    voices = _load_db()
    item = next((v for v in voices if v.get("id") == voice_id), None)
    if not item:
        raise RuntimeError("Voz nao encontrada.")
    name = (name or "").strip()
    ref_text = (ref_text or "").strip()
    if not name:
        raise RuntimeError("O nome da voz nao pode ficar vazio.")
    if not ref_text:
        raise RuntimeError("O texto da amostra nao pode ficar vazio.")

    changed_text = ref_text != (item.get("ref_text") or "")
    item["name"] = name
    item["ref_text"] = ref_text
    item["updated_at"] = _now()
    if changed_text:
        hf_home = _ensure_model_available()
        _create_prompt(item["reference_audio"], ref_text, item["prompt_path"], hf_home, callback_log, callback_progresso)
    _save_db(voices)
    return {"success": True, "voice": _public_voice(item), "voices": list_voices()}


def _repair_reference_if_needed(item: dict[str, Any], hf_home: str,
                                callback_log: LogFn = None,
                                callback_progresso: ProgressFn = None) -> bool:
    ref_audio = item.get("reference_audio") or ""
    info = probe(ref_audio) if ref_audio and os.path.exists(ref_audio) else {}
    duration = float(info.get("duracao") or item.get("duration") or 0.0)
    ref_text = str(item.get("ref_text") or "").strip()
    needs_text_repair = ref_text.endswith("...") or ref_text.endswith("…")
    if item.get("reference_treatment") == PREPARED_REFERENCE and not needs_text_repair:
        return False
    needs_treatment_repair = item.get("reference_treatment") not in {REFERENCE_TREATMENT, "sem_tratamento"}
    if duration <= REFERENCE_SECONDS + 0.5 and not needs_text_repair and not needs_treatment_repair:
        return False

    source = item.get("source_audio") or ""
    if not source or not os.path.exists(source):
        _log(callback_log, "A voz foi criada com referencia longa; recrie a voz para melhorar a estabilidade.")
        return False

    _log(callback_log, "Atualizando esta voz para uma referencia mais curta e estavel...")
    voice_id = item.get("id") or uuid.uuid4().hex[:12]
    name = item.get("name") or "voz"
    treat_audio = item.get("reference_treatment") != "sem_tratamento"
    new_ref_audio, clip_len, start = _extract_reference(source, voice_id, name, callback_log, treat_audio)
    new_ref_text = _transcribe_reference(new_ref_audio, callback_log, callback_progresso)
    item["reference_audio"] = new_ref_audio
    item["ref_text"] = new_ref_text
    item["prompt_path"] = item.get("prompt_path") or os.path.join(_prompts_dir(), f"{_slug(name)}_{voice_id}.pt")
    item["duration"] = round(clip_len, 2)
    item["start"] = round(start, 2)
    item["reference_treatment"] = REFERENCE_TREATMENT if treat_audio else "sem_tratamento"
    item["updated_at"] = _now()
    _create_prompt(new_ref_audio, new_ref_text, item["prompt_path"], hf_home, callback_log, callback_progresso)
    return True


TEXTO_DESENHO = ("Olá! Esta é uma amostra da minha voz. Eu posso narrar vídeos, apresentar um podcast "
                 "e ler qualquer texto com calma e clareza.")


def design_reference(instruct: str, output_path: str, seed: int = 0, text: str = TEXTO_DESENHO, language: str = "pt",
                     callback_log: LogFn = None, callback_progresso: ProgressFn = None) -> str:
    """Gera a amostra de uma voz DESENHADA (sem pessoa de referência): instruct com gênero, idade, tom, sussurro
    (ex.: "female, young adult, moderate pitch"). A mesma semente dá a mesma voz."""
    hf_home = _ensure_model_available()
    engine = _select_engine()
    if engine["kind"] == "missing":
        raise RuntimeError("OmniVoice nao esta instalado neste computador.")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    if engine["kind"] == "inprocess":
        import soundfile as sf
        import torch
        model = _load_model_inprocess(hf_home, callback_log)
        torch.manual_seed(int(seed))
        _progress(callback_progresso, -1, "Desenhando a voz...")
        audio = model.generate(text=text, language=language, instruct=instruct, num_step=32, guidance_scale=2.0,
                               denoise=True, postprocess_output=True)[0]
        sf.write(output_path, audio, int(getattr(model, "sampling_rate", 24000) or 24000))
    else:
        _run_external("design", {"hf_home": hf_home, "model": MODEL_ID, "instruct": instruct, "seed": int(seed), "text": text,
                                 "language": language, "output_path": output_path}, callback_log, callback_progresso)
    return output_path


def delete_voice(voice_id: str) -> dict[str, Any]:
    voices = _load_db()
    item = next((v for v in voices if v.get("id") == voice_id), None)
    voices = [v for v in voices if v.get("id") != voice_id]
    if item:
        for key in ("prompt_path", "reference_audio"):
            path = item.get(key)
            try:
                if path and os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
    _save_db(voices)
    return {"success": True, "voices": list_voices()}


def _clean_options(options: dict[str, Any] | None) -> dict[str, Any]:
    data = dict(options or {})
    num_step = int(float(data.get("num_step") or MAX_NUM_STEP))
    data["num_step"] = max(1, min(MAX_NUM_STEP, num_step))
    data["speed"] = max(0.5, min(2.0, float(data.get("speed") or 1.0)))
    data["guidance_scale"] = max(0.5, min(5.0, float(data.get("guidance_scale") or 2.0)))
    data["t_shift"] = max(0.0, min(1.0, float(data.get("t_shift") or 0.1)))
    data["language"] = (data.get("language") or "pt").strip() or "pt"
    data["denoise"] = bool(data.get("denoise", True))
    data["postprocess_output"] = bool(data.get("postprocess_output", True))
    data["normalize_text"] = bool(data.get("normalize_text", False))
    data["stable_chunks"] = bool(data.get("stable_chunks", True))
    data["max_chunk_chars"] = max(80, min(360, int(float(data.get("max_chunk_chars") or 220))))
    data["pause_seconds"] = max(0.0, min(1.0, float(data.get("pause_seconds") or 0.18)))
    return data


def _generate_stable_audio_inprocess(model: Any, prompt: Any, text: str,
                                     options: dict[str, Any],
                                     callback_progresso: ProgressFn = None):
    import numpy as np

    speed = float(options.get("speed") or 1.0)
    chunks, pausas = _pedacos(text, options)
    if not chunks:
        raise RuntimeError("Texto vazio para sintetizar.")

    audios = []
    for index, chunk in enumerate(chunks, 1):
        _progress(
            callback_progresso,
            max(1, int((index - 1) / len(chunks) * 95)),
            f"Sintetizando trecho {index}/{len(chunks)}...",
        )
        duration = _target_duration(chunk, speed) if options.get("stable_chunks", True) else None
        kwargs = {
            "text": chunk,
            "language": options["language"],
            "voice_clone_prompt": prompt,
            "num_step": options["num_step"],
            "guidance_scale": options["guidance_scale"],
            "t_shift": options["t_shift"],
            "denoise": options["denoise"],
            "postprocess_output": options["postprocess_output"],
            "normalize_text": options["normalize_text"],
        }
        if duration:
            kwargs["duration"] = duration
        else:
            kwargs["speed"] = speed
        audios.append(model.generate(**kwargs)[0])

    sample_rate = int(getattr(model, "sampling_rate", 24000) or 24000)
    merged = []
    for idx, audio in enumerate(audios):
        if idx:
            merged.append(np.zeros(int(sample_rate * pausas[idx - 1]), dtype=audio.dtype))
        merged.append(audio)
    return np.concatenate(merged), len(chunks), sample_rate


def synthesize(voice_id: str, text: str, options: dict[str, Any] | None = None,
               callback_log: LogFn = None, callback_progresso: ProgressFn = None) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        raise RuntimeError("Digite o texto que sera sintetizado.")
    voices = _load_db()
    item = next((v for v in voices if v.get("id") == voice_id), None)
    if not item:
        raise RuntimeError("Escolha uma voz salva.")
    hf_home = _ensure_model_available()
    if _select_engine()["kind"] == "missing":
        raise RuntimeError("OmniVoice nao esta instalado neste computador.")

    if _repair_reference_if_needed(item, hf_home, callback_log, callback_progresso):
        _save_db(voices)

    prompt_path = item.get("prompt_path") or ""
    if not prompt_path or not os.path.exists(prompt_path):
        _log(callback_log, "Prompt da voz ausente; recriando a partir da referencia...")
        prompt_path = prompt_path or os.path.join(_prompts_dir(), f"{_slug(item.get('name') or 'voz')}_{voice_id}.pt")
        item["prompt_path"] = prompt_path
        _create_prompt(item["reference_audio"], item["ref_text"], prompt_path, hf_home, callback_log, callback_progresso)
        _save_db(voices)

    clean = _clean_options(options)
    timestamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_name = f"{timestamp}_{_slug(item.get('name') or 'voz')}.wav"
    output_path = nome_livre(os.path.join(_outputs_dir(), output_name))
    payload = {
        "hf_home": hf_home,
        "model": MODEL_ID,
        "prompt_path": prompt_path,
        "text": text,
        "output_path": output_path,
        "options": clean,
    }

    engine = _select_engine()
    if engine["kind"] == "inprocess":
        import soundfile as sf
        from omnivoice import VoiceClonePrompt

        model = _load_model_inprocess(hf_home, callback_log)
        prompt = VoiceClonePrompt.load(prompt_path)
        _progress(callback_progresso, -1, "Sintetizando voz...")
        start = time.perf_counter()
        audio, chunks, sample_rate = _generate_stable_audio_inprocess(model, prompt, text, clean, callback_progresso)
        sf.write(output_path, audio, sample_rate)
        seconds = time.perf_counter() - start
    else:
        proc = _servidor_vivo()
        result = None
        if proc is not None:
            try:
                result = _sintetizar_no_servidor(proc, payload)
            except Exception as e:
                _log(callback_log, f"OmniVoice mantido falhou ({e}); rodando avulso.")
        if result is None:
            result = _run_external("synthesize", payload, callback_log, callback_progresso)
        seconds = float(result.get("seconds") or 0.0)
        chunks = int(result.get("chunks") or 1)

    from Functions.media_server import register

    url = register(output_path)
    _progress(callback_progresso, 100, "Audio gerado.")
    return {
        "success": True,
        "resumo": f"Audio gerado em {seconds:.1f}s ({chunks} trecho(s)): {os.path.basename(output_path)}",
        "output_path": output_path,
        "output_folder": _outputs_dir(),
        "output_url": url,
        "voices": list_voices(),
    }
