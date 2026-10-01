"""
Ferramenta Melhorar Áudio (como o Adobe Podcast Enhance): aceita áudio ou vídeo, um arquivo ou uma pasta.

Etapas: transcrição (o mesmo modelo do painel Texto, com o dicionário de nomes) → Sidon (limpa a voz) →
OmniVoice por cima (refaz os detalhes com o texto e a própria voz) → masterização (−16 LUFS). Vídeo: a imagem é
copiada sem recodificar e só o áudio é trocado. Saída ao lado do original: "<nome>_melhorado.<ext>" — o
"Substituir várias" do Pocket Editor acha esse arquivo pelo nome.

O pesado roda no melhorar_audio_runner: num venv externo com placa de vídeo (CUDA), se houver, ou dentro do app.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path

from Functions.midia import NO_WINDOW, app_dir, ffmpeg, nome_livre, probe

EXT_AUDIO = (".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wma", ".aif", ".aiff")
EXT_VIDEO = (".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mts", ".mxf")
SUFIXO = "_melhorado"
MASTER = "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11"
_MOTOR: dict = {}


def _base():
    d = os.path.join(app_dir(), "modelos_ia", "melhorar_audio")
    os.makedirs(os.path.join(d, "tmp"), exist_ok=True)
    return d


def _runner():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "melhorar_audio_runner.py")


def _python_ok(py, cuda):
    code = ("import importlib.util as u, sys\n"
            "ok = all(u.find_spec(m) for m in ('omnivoice', 'soundfile', 'scipy', 'transformers', 'huggingface_hub'))\n"
            + ("import torch; ok = ok and torch.cuda.is_available()\n" if cuda else "")
            + "sys.exit(0 if ok else 1)")
    try:
        return subprocess.run([py, "-c", code], capture_output=True, timeout=60, creationflags=NO_WINDOW).returncode == 0
    except Exception:
        return False


def motor():
    """Onde rodar: venv externo com CUDA (rápido) > dentro do app > venv externo sem CUDA."""
    if _MOTOR:
        return _MOTOR
    from Functions import omnivoice_tool as ovt
    externos = ovt._candidate_external_pythons()
    for py in externos:
        if _python_ok(py, True):
            _MOTOR.update(kind="external", python=py, label="placa de vídeo")
            return _MOTOR
    if ovt._inprocess_engine_ready() and all(ovt._module_available(m) for m in ("scipy", "transformers")):
        _MOTOR.update(kind="inprocess", label="processador")
        return _MOTOR
    for py in externos:
        if _python_ok(py, False):
            _MOTOR.update(kind="external", python=py, label="processador (ambiente externo)")
            return _MOTOR
    return {"kind": "missing", "label": "OmniVoice não instalado"}


def _rodar_externo(py, payload, log, progresso):
    tok = uuid.uuid4().hex
    tmp = os.path.join(_base(), "tmp")
    pp, rp = os.path.join(tmp, f"{tok}.payload.json"), os.path.join(tmp, f"{tok}.result.json")
    Path(pp).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    proc = subprocess.Popen([py, _runner(), pp, rp], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            encoding="utf-8", errors="replace", creationflags=NO_WINDOW, env=env)
    for linha in proc.stdout:
        linha = linha.strip()
        if not linha:
            continue
        try:
            ev = json.loads(linha)
        except json.JSONDecodeError:
            continue   # avisos das bibliotecas
        if ev.get("kind") == "progress":
            progresso(float(ev.get("percent", -1)), ev.get("message"))
        else:
            log(ev.get("message") or linha)
    code = proc.wait()
    r = json.loads(Path(rp).read_text(encoding="utf-8")) if os.path.exists(rp) else {}
    for p in (pp, rp):
        try:
            os.remove(p)
        except OSError:
            pass
    if code != 0 or not r.get("success"):
        raise RuntimeError(r.get("error") or f"O processamento terminou com código {code}.")
    return r


def _ffmpeg(args):
    r = subprocess.run([ffmpeg(), "-hide_banner", "-nostdin", "-y", "-v", "error"] + args,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or "ffmpeg falhou").strip().splitlines()[-1])


def arquivos(caminho):
    if os.path.isfile(caminho):
        return [caminho]
    out = []
    for n in sorted(os.listdir(caminho)):
        p = os.path.join(caminho, n)
        base = os.path.splitext(n)[0]
        if os.path.isfile(p) and n.lower().endswith(EXT_AUDIO + EXT_VIDEO) and not base.endswith(SUFIXO):
            out.append(p)
    return out


def _atraso(info):
    """Quanto o som começa depois da imagem (vídeos de celular: alguns ms). O .wav melhorado ganha esse silêncio
    no início para ficar no tempo do vídeo — ao tocar no editor e ao ser juntado à imagem."""
    try:
        a = float((info.get("audio") or {}).get("start_time") or 0)
        v = float((info.get("video") or {}).get("start_time") or 0) if info.get("video") else a
        return max(0.0, min(5.0, a - v))
    except (TypeError, ValueError):
        return 0.0


def _pasta_previa():
    d = os.path.join(_base(), "tmp", "previa")
    os.makedirs(d, exist_ok=True)
    return d


def limpar_previas():
    d = _pasta_previa()
    for n in os.listdir(d):
        try:
            os.remove(os.path.join(d, n))
        except OSError:
            pass


def melhorar_arquivo(path, log, progresso, frac=(0.0, 1.0), so_audio=False, previas=None):
    """Um arquivo → "<nome>_melhorado.<ext>" ao lado. Devolve o caminho de saída.
    so_audio = Pocket Editor: só o som, "<nome>_melhorado.wav", no tempo do vídeo (a imagem não é tocada).
    previas = lista que recebe {"orig", "mel"}: dois .m4a alinhados para ouvir antes/depois na ferramenta."""
    a0, a1 = frac

    def prog(p, msg=None):
        progresso(a0 + (a1 - a0) * max(0.0, p) if p >= 0 else -1, msg)

    info = probe(path)
    if not info.get("audio"):
        raise RuntimeError(f"{os.path.basename(path)} não tem áudio.")
    eh_video = bool(info.get("video")) and path.lower().endswith(EXT_VIDEO)
    tok = uuid.uuid4().hex[:10]
    tmp = os.path.join(_base(), "tmp")
    wav_in, wav_out = os.path.join(tmp, f"{tok}_in.wav"), os.path.join(tmp, f"{tok}_out.wav")
    mel = os.path.join(tmp, f"{tok}_mel.wav")
    try:
        prog(0.01, "Lendo o áudio...")
        _ffmpeg(["-i", path, "-vn", "-ac", "1", "-ar", "48000", "-c:a", "pcm_f32le", wav_in])
        prog(0.03, "Transcrevendo a fala...")
        from Functions import agente_midia
        t = agente_midia.transcrever(path)
        frases = [[float(a), float(b), str(x)] for a, b, x in (t.get("frases") or [])]
        log(f"{len(frases)} frase(s) reconhecida(s)")

        from Functions import omnivoice_tool as ovt
        hf_omni = ovt._effective_hf_home()
        if frases and not ovt._snapshot_exists(hf_omni):
            log("Baixando o modelo OmniVoice (3 GB, só na primeira vez)...")
            ovt.download_model(log, lambda p, m=None: prog(0.05, m))
            hf_omni = ovt._effective_hf_home()
        payload = {"entrada": wav_in, "saida": wav_out, "frases": frases,
                   "sidon_cache": os.path.join(_base(), "hf_cache"), "omni_hf_home": hf_omni}
        m = motor()
        if m["kind"] == "missing":
            raise RuntimeError("O OmniVoice não está instalado neste Canivete.")
        log(f"Processando ({m['label']})...")

        def prog_runner(p, msg=None):
            prog(0.06 + 0.86 * p / 100 if p >= 0 else -1, msg)

        if m["kind"] == "external":
            _rodar_externo(m["python"], payload, log, prog_runner)
        else:
            from Functions import melhorar_audio_runner as run
            modelo = ovt._load_model_inprocess(hf_omni, log) if frases else None
            run.processar(payload, lambda k, msg, **e: (prog_runner(float(e.get("percent", -1)), msg)
                                                         if k == "progress" else log(msg)), modelo)

        prog(0.93, "Masterizando...")
        atraso = _atraso(info) if eh_video else 0.0
        pad = f"adelay={int(round(atraso * 1000))}:all=1," if atraso > 0.001 else ""
        _ffmpeg(["-i", wav_out, "-af", pad + MASTER, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", mel])
        base, ext = os.path.splitext(path)
        if so_audio:
            saida = nome_livre(base + SUFIXO + ".wav")
            shutil.move(mel, saida)   # a pasta temporária pode estar em outro disco
            mel = saida
        elif eh_video:
            saida = nome_livre(base + SUFIXO + ext)
            ac = ["-c:a", "pcm_s24le"] if ext.lower() in (".mov", ".mxf") else ["-c:a", "aac", "-b:a", "256k"]
            tag = ["-tag:v", "hvc1"] if info.get("codec_video") == "hevc" and ext.lower() in (".mp4", ".mov", ".m4v") else []
            _ffmpeg(["-i", path, "-i", mel, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy"] + tag + ac
                    + ["-map_metadata", "0", "-shortest", saida])
        else:
            saida = nome_livre(base + SUFIXO + (".wav" if ext.lower() in (".wav", ".aif", ".aiff", ".flac") else ".m4a"))
            ac = ["-c:a", "pcm_s24le"] if saida.endswith(".wav") else ["-c:a", "aac", "-b:a", "256k"]
            _ffmpeg(["-i", mel] + ac + [saida])
        if previas is not None:
            prog(0.97, "Preparando a prévia...")
            d, nome = _pasta_previa(), f"{tok}_{os.path.splitext(os.path.basename(path))[0]}"
            orig, novo = os.path.join(d, nome + "_original.m4a"), os.path.join(d, nome + SUFIXO + ".m4a")
            aac = ["-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k"]
            _ffmpeg(["-i", path, "-map", "0:a:0", "-vn"] + (["-af", pad.rstrip(",")] if pad else []) + aac + [orig])
            _ffmpeg(["-i", mel] + aac + [novo])
            previas.append({"arquivo": saida, "orig": orig, "mel": novo})
        prog(1.0, "Pronto")
        return saida
    finally:
        for p in (wav_in, wav_out) + (() if so_audio else (mel,)):
            try:
                os.remove(p)
            except OSError:
                pass


def melhorar(caminho, log, progresso):
    lista = arquivos(caminho)
    if not lista:
        raise RuntimeError("Nenhum áudio ou vídeo encontrado.")
    limpar_previas()
    t0, feitos, falhas, previas = time.time(), [], [], []
    for i, p in enumerate(lista):
        log(f"[{i + 1}/{len(lista)}] {os.path.basename(p)}")
        try:
            feitos.append(melhorar_arquivo(p, log, lambda v, m=None: progresso(v * 100 if v >= 0 else -1, m),
                                           (i / len(lista), (i + 1) / len(lista)), previas=previas))
            log(f"✓ {os.path.basename(feitos[-1])}")
        except Exception as e:
            falhas.append(os.path.basename(p))
            log(f"✗ {os.path.basename(p)}: {e}")
            if len(lista) == 1:
                raise
    return {"feitos": feitos, "falhas": falhas, "previas": previas, "segundos": round(time.time() - t0, 1)}
