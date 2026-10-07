"""Sound Kanivete (Sk) — editor de áudio multipista do KANIVETE (frontend/js/som-*.js).

Projeto .sknv = JSON: {versao, nome, faixas: [{id, nome, vol, mudo, solo, clipes: [{id, arq, ini, de, dur, vol,
fade_in, fade_out, nome}]}], marcadores: [{t, nome}]} — tempos em segundos; `ini` = onde o clipe começa na timeline,
`de` = de onde começa no arquivo, `vol` linear (1 = 0 dB). Os áudios ficam onde estão (o projeto guarda o caminho).

info(): URL local (media_server) + duração + picos para a forma de onda (100 por segundo, 0–255, base64), em cache
(%LOCALAPPDATA%/CaniveteDoPailer/sk_picos). exportar(): ffmpeg monta a mixagem (atrim + volume + fades + adelay por
clipe, volume da faixa, amix) e, se pedido, normaliza em LUFS (loudnorm, 2 passadas).
"""
import base64
import hashlib
import json
import os
import subprocess
import tempfile

from Functions.midia import NO_WINDOW, ffmpeg

PICOS_POR_S = 100
EXT = ".sknv"
FORMATOS = {"mp3": ["-c:a", "libmp3lame", "-b:a", "{br}k"], "wav": ["-c:a", "pcm_s16le"], "aac": ["-c:a", "aac", "-b:a", "{br}k"],
            "m4a": ["-c:a", "aac", "-b:a", "{br}k"], "ogg": ["-c:a", "libvorbis", "-q:a", "6"], "flac": ["-c:a", "flac"], "opus": ["-c:a", "libopus", "-b:a", "{br}k"]}


def _cache_dir():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "CaniveteDoPailer", "sk_picos")
    os.makedirs(d, exist_ok=True)
    return d


def _ffprobe_dur(path):
    from Functions.midia import ffprobe
    try:
        r = subprocess.run([ffprobe(), "-v", "error", "-show_entries", "format=duration:stream=channels,sample_rate", "-select_streams", "a:0",
                            "-of", "json", path], capture_output=True, text=True, timeout=60, creationflags=NO_WINDOW)
        j = json.loads(r.stdout or "{}")
        st = (j.get("streams") or [{}])[0]
        return float((j.get("format") or {}).get("duration") or 0), int(st.get("channels") or 0), int(st.get("sample_rate") or 0)
    except Exception:
        return 0.0, 0, 0


def picos(path):
    """Picos (abs máx. por 1/100 s, 0–255) do arquivo inteiro: ffmpeg decodifica em mono 8 kHz s16."""
    st = os.stat(path)
    chave = hashlib.sha1(f"{os.path.abspath(path)}|{st.st_size}|{st.st_mtime}".encode("utf-8", "replace")).hexdigest()
    arq = os.path.join(_cache_dir(), chave + ".bin")
    if os.path.isfile(arq):
        return open(arq, "rb").read()
    import numpy as np
    r = subprocess.run([ffmpeg(), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True, timeout=1800, creationflags=NO_WINDOW)
    a = np.frombuffer(r.stdout, dtype=np.int16)
    n = 8000 // PICOS_POR_S
    if a.size < n:
        out = bytes([0])
    else:
        a = np.abs(a[: a.size // n * n].astype(np.int32)).reshape(-1, n).max(axis=1)
        out = np.clip(np.sqrt(a / 32768.0) * 255, 0, 255).astype(np.uint8).tobytes()   # raiz: o quieto ainda aparece
    open(arq, "wb").write(out)
    return out


def info(path):
    if not path or not os.path.isfile(path):
        return {"success": False, "error": f"arquivo não encontrado: {path}"}
    from Functions import media_server
    dur, can, sr = _ffprobe_dur(path)
    if not dur:
        return {"success": False, "error": "não é um áudio (ou vídeo com som) que o ffmpeg leia"}
    p = picos(path)
    return {"success": True, "arq": os.path.abspath(path), "nome": os.path.basename(path), "url": media_server.register(path), "dur": round(dur, 4),
            "canais": can, "sr": sr, "picos": base64.b64encode(p).decode("ascii"), "pps": PICOS_POR_S}


def salvar(proj, caminho):
    if not caminho.lower().endswith(EXT):
        caminho += EXT
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dict(proj, versao=1), f, ensure_ascii=False, indent=1)
    os.replace(tmp, caminho)
    return {"success": True, "caminho": caminho}


def abrir(caminho):
    try:
        proj = json.load(open(caminho, encoding="utf-8"))
    except Exception as e:
        return {"success": False, "error": f"não abriu o projeto: {e}"}
    faltando = sorted({c["arq"] for f in proj.get("faixas", []) for c in f.get("clipes", []) if not os.path.isfile(c.get("arq", ""))})
    return {"success": True, "proj": proj, "caminho": caminho, "faltando": faltando}


def _filtro_clipe(c, i, sr):
    """atrim do trecho → volume (com curva) → fades → adelay até o início na timeline."""
    de, dur = max(0.0, float(c.get("de", 0))), max(0.01, float(c["dur"]))
    f = [f"atrim=start={de:.4f}:duration={dur:.4f}", "asetpts=PTS-STARTPTS", f"aresample={sr}", "aformat=channel_layouts=stereo"]
    curva = c.get("curva") or []   # [[t no clipe, vol linear], ...] — envelope de volume
    if len(curva) >= 2:
        pts = sorted(curva)
        partes = []
        for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
            if t1 <= t0:
                continue
            partes.append(f"between(t,{t0:.4f},{t1:.4f})*({v0:.5f}+({v1 - v0:.5f})*(t-{t0:.4f})/{t1 - t0:.4f})")
        expr = "+".join(partes) or "1"
        expr = f"if(lt(t,{pts[0][0]:.4f}),{pts[0][1]:.5f},if(gt(t,{pts[-1][0]:.4f}),{pts[-1][1]:.5f},{expr}))"
        f.append(f"volume='{expr}':eval=frame")
    v = float(c.get("vol", 1))
    if abs(v - 1) > 1e-4:
        f.append(f"volume={v:.5f}")
    fi, fo = float(c.get("fade_in", 0) or 0), float(c.get("fade_out", 0) or 0)
    if fi > 0:
        f.append(f"afade=t=in:st=0:d={min(fi, dur):.4f}")
    if fo > 0:
        f.append(f"afade=t=out:st={max(0, dur - fo):.4f}:d={min(fo, dur):.4f}")
    ms = int(round(float(c["ini"]) * 1000))
    if ms > 0:
        f.append(f"adelay={ms}|{ms}")
    return ",".join(f)


def _montar(proj, sr=48000, faixas_ids=None):
    """→ (entradas ffmpeg, filter_complex, rótulo de saída, duração) ou None se não há o que tocar."""
    faixas = [f for f in proj.get("faixas", []) if not f.get("mudo")]
    if any(f.get("solo") for f in faixas):
        faixas = [f for f in faixas if f.get("solo")]
    if faixas_ids:
        faixas = [f for f in faixas if f["id"] in faixas_ids]
    entradas, filtros, saidas, fim = [], [], [], 0.0
    idx = {}
    for f in faixas:
        rot = []
        for c in f.get("clipes", []):
            if not os.path.isfile(c.get("arq", "")):
                continue
            if c["arq"] not in idx:
                idx[c["arq"]] = len(entradas) // 2   # entradas = ["-i", arq, "-i", arq...]
                entradas += ["-i", c["arq"]]
            n = len(filtros)
            filtros.append(f"[{idx[c['arq']]}:a]{_filtro_clipe(c, n, sr)}[c{n}]")
            rot.append(f"[c{n}]")
            fim = max(fim, float(c["ini"]) + float(c["dur"]))
        if not rot:
            continue
        k = len(saidas)
        junta = f"{''.join(rot)}amix=inputs={len(rot)}:normalize=0:dropout_transition=0," if len(rot) > 1 else rot[0]
        filtros.append(f"{junta}volume={float(f.get('vol', 1)):.5f}[f{k}]")
        saidas.append(f"[f{k}]")
    if not saidas:
        return None
    # base de silêncio do tamanho do projeto como 1ª entrada: a mixagem começa no 0 (sem ela começava no 1º clipe e o
    # silêncio do início sumia — saía 0,5 s mais curta) e termina no fim do último clipe
    filtros.append(f"anullsrc=r={sr}:cl=stereo,atrim=duration={fim:.4f}[base]")
    filtros.append(f"[base]{''.join(saidas)}amix=inputs={len(saidas) + 1}:normalize=0:dropout_transition=0:duration=first[mix]")
    return entradas, ";".join(filtros), "[mix]", fim


def _loudnorm_medir(entradas, fc, rot, alvo, tp, timeout=3600):
    cmd = [ffmpeg(), "-hide_banner", "-nostdin", *entradas, "-filter_complex", f"{fc};{rot}loudnorm=I={alvo}:TP={tp}:LRA=11:print_format=json[o]",
           "-map", "[o]", "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, creationflags=NO_WINDOW)
    txt = r.stderr or ""
    i = txt.rfind("{")
    return json.loads(txt[i:txt.rfind("}") + 1]) if i >= 0 else None


def exportar(proj, caminho, op=None):
    """op: {formato mp3|wav|aac|m4a|ogg|flac|opus, kbps, sr, lufs (ex. -14; None = sem), tp (-1), faixas (ids; None = todas),
    ini/fim (s: só um trecho)}."""
    op = op or {}
    fmt = (op.get("formato") or os.path.splitext(caminho)[1].lstrip(".") or "mp3").lower()
    if fmt not in FORMATOS:
        return {"success": False, "error": f"formato {fmt}: use {', '.join(FORMATOS)}"}
    sr = int(op.get("sr") or 48000)
    m = _montar(proj, sr, op.get("faixas"))
    if not m:
        return {"success": False, "error": "nada para exportar (faixas vazias, mudas ou arquivos faltando)"}
    entradas, fc, rot, fim = m
    a, b = float(op.get("ini") or 0), float(op.get("fim") or fim)
    fc += f";{rot}apad,atrim=start={a:.4f}:end={b:.4f},asetpts=PTS-STARTPTS[corte]"   # apad: a mixagem às vezes acabava antes do último clipe
    rot = "[corte]"
    if op.get("lufs") not in (None, "", False):
        alvo, tp = float(op["lufs"]), float(op.get("tp", -1))
        med = _loudnorm_medir(entradas, fc, rot, alvo, tp)
        if med:
            fc += (f";{rot}loudnorm=I={alvo}:TP={tp}:LRA=11:measured_I={med['input_i']}:measured_TP={med['input_tp']}:measured_LRA={med['input_lra']}"
                   f":measured_thresh={med['input_thresh']}:offset={med['target_offset']}:linear=true,aresample={sr}[ln]")
            rot = "[ln]"
    if not caminho.lower().endswith("." + fmt):
        caminho = os.path.splitext(caminho)[0] + "." + fmt
    os.makedirs(os.path.dirname(os.path.abspath(caminho)) or ".", exist_ok=True)
    codec = [x.replace("{br}", str(int(op.get("kbps") or 192))) for x in FORMATOS[fmt]]
    script = os.path.join(tempfile.mkdtemp(prefix="sk_"), "fc.txt")
    open(script, "w", encoding="utf-8").write(fc)
    cmd = [ffmpeg(), "-y", "-hide_banner", "-nostdin", *entradas, "-/filter_complex", script, "-map", rot, "-ar", str(sr), *codec, caminho]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200, creationflags=NO_WINDOW)
    if r.returncode != 0 or not os.path.isfile(caminho):
        return {"success": False, "error": (r.stderr or "")[-600:]}
    return {"success": True, "caminho": caminho, "dur": round(b - a, 3)}


def medir_lufs(proj, op=None):
    """Loudness integrada da mixagem (LUFS) e pico verdadeiro (dBTP) — para mostrar antes de exportar."""
    m = _montar(proj, 48000, (op or {}).get("faixas"))
    if not m:
        return {"success": False, "error": "nada para medir"}
    entradas, fc, rot, _ = m
    med = _loudnorm_medir(entradas, fc, rot, -14, -1)
    if not med:
        return {"success": False, "error": "o ffmpeg não mediu"}
    return {"success": True, "lufs": float(med["input_i"]), "pico": float(med["input_tp"]), "lra": float(med["input_lra"])}


# ─────────────────────────── efeitos que geram arquivo novo (fase 2) ───────────────────────────
def _saida_ao_lado(arq, sufixo, ext=".wav"):
    """<nome><sufixo>.wav ao lado do original (não no cache, que se limpa sozinho); sem permissão, em Documentos.
    Nome fixo: refazer o mesmo efeito na mesma gravação sobrescreve (não acumula cópias "(2)")."""
    base = os.path.splitext(os.path.basename(arq))[0]
    pasta = os.path.dirname(os.path.abspath(arq))
    if not os.access(pasta, os.W_OK):
        pasta = os.path.join(os.path.expanduser("~"), "Documents", "Sound Kanivete")
        os.makedirs(pasta, exist_ok=True)
    return os.path.join(pasta, base + sufixo + ext)


def limpar_ruido(arq, quantidade=80, log=print, prog=lambda *a: None):
    """Anti-noise (DeepFilterNet3): som limpo misturado ao original na `quantidade` (%), em arquivo novo."""
    from Functions import anti_noise
    q = max(0, min(100, int(quantidade)))
    prog(10, "Limpando o ruído (DeepFilterNet)…")
    limpo = anti_noise.limpo(arq)
    saida = _saida_ao_lado(arq, f"_limpo{q}")
    prog(80, "Gravando…")
    if q >= 100:
        cmd = [ffmpeg(), "-y", "-v", "error", "-i", limpo, "-c:a", "pcm_s16le", saida]
    else:
        a = q / 100
        cmd = [ffmpeg(), "-y", "-v", "error", "-i", arq, "-i", limpo, "-filter_complex",
               f"[0:a]aresample=48000,aformat=channel_layouts=stereo,volume={1 - a:.4f}[o];[1:a]aresample=48000,aformat=channel_layouts=stereo,volume={a:.4f}[l];"
               f"[o][l]amix=inputs=2:normalize=0:duration=first[s]", "-map", "[s]", "-c:a", "pcm_s16le", saida]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600, creationflags=NO_WINDOW)
    if r.returncode != 0:
        raise RuntimeError("não gravou o som limpo: " + (r.stderr or "")[-300:])
    return saida


def melhorar_voz(arq, log=print, prog=lambda *a: None):
    """Melhorar Áudio (Sidon + OmniVoice): só o som, no mesmo tempo do original, em arquivo novo ao lado."""
    from Functions.melhorar_audio import melhorar_arquivo
    return melhorar_arquivo(arq, log, lambda v, m=None: prog(v * 100 if v >= 0 else -1, m), so_audio=True)
