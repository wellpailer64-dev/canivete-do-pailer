"""Sound Kanivete (Sk) — editor de áudio multipista do KANIVETE (frontend/js/som-*.js).

Projeto .sknv = JSON: {versao, nome, faixas: [{id, nome, vol, mudo, solo, clipes: [{id, arq, ini, de, dur, vol,
fade_in, fade_out, nome}]}], marcadores: [{t, nome}]} — tempos em segundos; `ini` = onde o clipe começa na timeline,
`de` = de onde começa no arquivo, `vol` linear (1 = 0 dB). Os áudios ficam onde estão (o projeto guarda o caminho).

info(): URL local (media_server) + duração + picos para a forma de onda (100 por segundo, 0–255, base64), em cache
(pasta_cache("sk_picos"): a pasta de cache das Preferências, senão %LOCALAPPDATA%). exportar(): ffmpeg monta a mixagem (atrim + volume + fades + adelay por
clipe, volume da faixa, amix) e, se pedido, normaliza em LUFS (loudnorm, 2 passadas).
"""
import base64
import hashlib
import json
import os
import subprocess
import tempfile
import threading

from Functions.midia import NO_WINDOW, ffmpeg

PICOS_POR_S = 100
EXT = ".sknv"
FORMATOS = {"mp3": ["-c:a", "libmp3lame", "-b:a", "{br}k"], "wav": ["-c:a", "pcm_s16le"], "aac": ["-c:a", "aac", "-b:a", "{br}k"],
            "m4a": ["-c:a", "aac", "-b:a", "{br}k"], "ogg": ["-c:a", "libvorbis", "-q:a", "6"], "flac": ["-c:a", "flac"], "opus": ["-c:a", "libopus", "-b:a", "{br}k"]}


def _cache_dir():
    from Functions.midia import pasta_cache
    return pasta_cache("sk_picos")


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
    # lido em blocos de 60 s (gravações de horas não sobem tudo para a memória)
    n = 8000 // PICOS_POR_S
    pr = subprocess.Popen([ffmpeg(), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, creationflags=NO_WINDOW)
    partes, resto = [], b""
    while True:
        b = pr.stdout.read(8000 * 2 * 60)
        if not b:
            break
        b = resto + b
        k = len(b) // (2 * n) * (2 * n)
        resto = b[k:]
        if k:
            a = np.abs(np.frombuffer(b[:k], dtype=np.int16).astype(np.int32)).reshape(-1, n).max(axis=1)
            partes.append(np.clip(np.sqrt(a / 32768.0) * 255, 0, 255).astype(np.uint8))   # raiz: o quieto ainda aparece
    pr.wait()
    out = np.concatenate(partes).tobytes() if partes else bytes([0])
    open(arq, "wb").write(out)
    return out


def _pcm_dir():
    from Functions.midia import pasta_cache
    return pasta_cache("sk_pcm")


_podado = [0.0]


def _podar_pcm(limite=1.5e9):
    """Cache de trechos com teto (~1,5 GB): apaga os usados há mais tempo. No máximo uma vez por minuto."""
    import time
    if time.time() - _podado[0] < 60:
        return
    _podado[0] = time.time()
    d = _pcm_dir()
    arqs = sorted((os.path.join(d, n) for n in os.listdir(d)), key=os.path.getatime)
    total = sum(os.path.getsize(p) for p in arqs)
    for p in arqs:
        if total <= limite:
            break
        try:
            total -= os.path.getsize(p)
            os.remove(p)
        except OSError:
            pass


def trecho(arq, k, sr=48000, seg=10):
    """Trecho k (seg segundos) do áudio como PCM cru s16le estéreo em sr — a prévia (som-motor.js) agenda esses
    pedaços no WebAudio com precisão de amostra, sem carregar o arquivo inteiro (serve para gravações de horas).
    Cache em pasta_cache("sk_pcm") (a pasta de cache das Preferências)."""
    st = os.stat(arq)
    chave = hashlib.sha1(f"{os.path.abspath(arq)}|{st.st_size}|{st.st_mtime}|{sr}|{seg}".encode()).hexdigest()[:16]
    out = os.path.join(_pcm_dir(), f"{chave}_{int(k)}.pcm")
    if not os.path.isfile(out):
        tmp = out + f".{os.getpid()}.{threading.get_ident()}.tmp"
        subprocess.run([ffmpeg(), "-y", "-hide_banner", "-nostdin", "-v", "error", "-ss", f"{int(k) * seg}", "-t", f"{seg}", "-i", arq,
                        "-vn", "-af", _ESTEREO(arq), "-ar", str(int(sr)), "-f", "s16le", tmp], capture_output=True, timeout=120, creationflags=NO_WINDOW)
        if not os.path.isfile(tmp):
            raise RuntimeError("não leu o trecho")
        os.replace(tmp, out)
        _podar_pcm()
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


def _auto_dir():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "CaniveteDoPailer", "sk_auto")
    os.makedirs(d, exist_ok=True)
    return d


def auto_salvar(proj, caminho=None):
    """Cópia de segurança do projeto (a cada minuto com mudanças); some quando o projeto é salvo de verdade."""
    import time
    pid = "".join(ch for ch in str(proj.get("id") or "sem_id") if ch.isalnum() or ch in "_-")
    arq = os.path.join(_auto_dir(), pid + EXT)
    tmp = arq + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"proj": proj, "caminho": caminho, "quando": time.time()}, f, ensure_ascii=False)
    os.replace(tmp, arq)
    return {"success": True, "arq": arq}


def auto_lista():
    out = []
    for n in os.listdir(_auto_dir()):
        if not n.endswith(EXT):
            continue
        p = os.path.join(_auto_dir(), n)
        try:
            j = json.load(open(p, encoding="utf-8"))
            out.append({"id": n[:-len(EXT)], "nome": j["proj"].get("nome"), "caminho": j.get("caminho"), "quando": j.get("quando")})
        except Exception:
            continue
    return sorted(out, key=lambda x: -(x["quando"] or 0))


def auto_ler(pid):
    return json.load(open(os.path.join(_auto_dir(), pid + EXT), encoding="utf-8"))


def auto_apagar(pid):
    try:
        os.remove(os.path.join(_auto_dir(), pid + EXT))
    except OSError:
        pass
    return {"success": True}


def abrir(caminho):
    try:
        proj = json.load(open(caminho, encoding="utf-8"))
    except Exception as e:
        return {"success": False, "error": f"não abriu o projeto: {e}"}
    faltando = sorted({c["arq"] for f in proj.get("faixas", []) for c in f.get("clipes", []) if not os.path.isfile(c.get("arq", ""))})
    return {"success": True, "proj": proj, "caminho": caminho, "faltando": faltando}


_CANAIS = {}


def _canais(arq):
    k = (arq, os.path.getmtime(arq) if os.path.isfile(arq) else 0)
    if k not in _CANAIS:
        _CANAIS[k] = _ffprobe_dur(arq)[1]
    return _CANAIS[k]


def _ESTEREO(arq):
    """Filtro para estéreo: mono é copiado nos dois canais (o aformat/-ac 2 abririam com -3 dB)."""
    return "pan=stereo|c0=c0|c1=c0" if _canais(arq) == 1 else "aformat=channel_layouts=stereo"


MICRO_FADE = 0.005   # 5 ms em toda borda de clipe: corte sem estalo (a prévia, som-motor.js, faz igual)


def fades_efetivos(c, clipes):
    """(fade_in, fade_out) que valem de fato: o pedido, no mínimo o micro-fade, e crossfade automático onde o clipe
    se sobrepõe a outro da mesma faixa (o que começa depois entra enquanto o de antes sai). Igual a skFades (JS)."""
    ini, dur = float(c["ini"]), max(0.01, float(c["dur"]))
    fi, fo = float(c.get("fade_in", 0) or 0), float(c.get("fade_out", 0) or 0)
    for o in clipes:
        if o is c:
            continue
        oi, of = float(o["ini"]), float(o["ini"]) + float(o["dur"])
        if oi < ini < of:
            fi = max(fi, min(of, ini + dur) - ini)
        if ini < oi < ini + dur < of:
            fo = max(fo, ini + dur - oi)
    fi, fo = max(fi, MICRO_FADE), max(fo, MICRO_FADE)
    if fi + fo > dur:
        k = dur / (fi + fo)
        fi, fo = fi * k, fo * k
    return fi, fo


def _filtro_clipe(c, i, sr, clipes=()):
    """atrim do trecho → volume (com curva) → fades (+ micro-fade e crossfade) → adelay até o início na timeline."""
    de, dur = max(0.0, float(c.get("de", 0))), max(0.01, float(c["dur"]))
    # mono vira estéreo copiando o canal (o aformat abriria com -3 dB e a exportação sairia mais baixa que a prévia)
    f = [f"atrim=start={de:.4f}:duration={dur:.4f}", "asetpts=PTS-STARTPTS", f"aresample={sr}", _ESTEREO(c["arq"])]
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
    fi, fo = fades_efetivos(c, clipes or [c])
    f.append(f"afade=t=in:st=0:d={min(fi, dur):.4f}")
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
            filtros.append(f"[{idx[c['arq']]}:a]{_filtro_clipe(c, n, sr, f.get('clipes', []))}[c{n}]")
            rot.append(f"[c{n}]")
            fim = max(fim, float(c["ini"]) + float(c["dur"]))
        if not rot:
            continue
        k = len(saidas)
        junta = f"{''.join(rot)}amix=inputs={len(rot)}:normalize=0:dropout_transition=0," if len(rot) > 1 else rot[0]
        fx = ",".join(_filtros_faixa(f)).replace("[dsa]", f"[dsa{k}]").replace("[dsk]", f"[dsk{k}]").replace("[dsk2]", f"[dsk2{k}]")   # cadeia da faixa (a mesma da prévia)
        rv = ((f.get("fx") or {}).get("rev") or {})
        if rv.get("ativo") and float(rv.get("mix", 0)) > 0.001:   # reverb: seco + molhado (afir com a IR da prévia)
            ir = ir_reverb(rv.get("tamanho", 1.2))
            if ir not in idx:
                idx[ir] = len(entradas) // 2
                entradas += ["-i", ir]
            m = float(rv["mix"])
            filtros.append(f"{junta}{fx + ',' if fx else ''}asplit=2[rd{k}][rw{k}]")
            filtros.append(f"[{idx[ir]}:a]aresample={sr}[ir{k}]")
            filtros.append(f"[rw{k}][ir{k}]afir=irnorm=-1:dry=1:wet=1[rv{k}]")
            filtros.append(f"[rd{k}][rv{k}]amix=inputs=2:weights='{1 - m:.4f} {m:.4f}':normalize=0:duration=first,volume={float(f.get('vol', 1)):.5f}[f{k}]")
        else:
            filtros.append(f"{junta}{fx + ',' if fx else ''}volume={float(f.get('vol', 1)):.5f}[f{k}]")
        saidas.append(f"[f{k}]")
    if not saidas:
        return None
    # base de silêncio do tamanho do projeto como 1ª entrada: a mixagem começa no 0 (sem ela começava no 1º clipe e o
    # silêncio do início sumia — saía 0,5 s mais curta) e termina no fim do último clipe
    filtros.append(f"anullsrc=r={sr}:cl=stereo,atrim=duration={fim:.4f}[base]")
    # master: volume e limitador (teto em dBFS; o da prévia é o DynamicsCompressor do som-motor.js)
    ms = proj.get("master") or {}
    mf = []
    if abs(float(ms.get("vol", 1)) - 1) > 1e-4:
        mf.append(f"volume={float(ms['vol']):.5f}")
    lim = ms.get("lim") or {}
    if lim.get("ativo"):
        mf.append(f"alimiter=limit={max(0.0625, 10 ** (float(lim.get('teto', -1)) / 20)):.5f}:attack=5:release=50:level=0:latency=1")
    filtros.append(f"[base]{''.join(saidas)}amix=inputs={len(saidas) + 1}:normalize=0:dropout_transition=0:duration=first{',' + ','.join(mf) if mf else ''}[mix]")
    return entradas, ";".join(filtros), "[mix]", fim


_EXP = {"p": None, "parar": False}   # ffmpeg do export em andamento: o Parar da fila do Ke encerra (cancelar_export)


def _rodar(cmd, timeout):
    """subprocess.run que o Parar da fila do Kanivete Encoder consegue interromper."""
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=NO_WINDOW)
    _EXP["p"] = p
    try:
        out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        p.kill()
        out, err = p.communicate()
    finally:
        _EXP["p"] = None
    return subprocess.CompletedProcess(cmd, p.returncode, out, err)


def cancelar_export():
    _EXP["parar"] = True
    p = _EXP["p"]
    if p is not None and p.poll() is None:
        p.kill()
    return {"success": True}


def _loudnorm_medir(entradas, fc, rot, alvo, tp, timeout=3600):
    cmd = [ffmpeg(), "-hide_banner", "-nostdin", *entradas, "-filter_complex", f"{fc};{rot}loudnorm=I={alvo}:TP={tp}:LRA=11:print_format=json[o]",
           "-map", "[o]", "-f", "null", "-"]
    r = _rodar(cmd, timeout)
    txt = r.stderr or ""
    i = txt.rfind("{")
    return json.loads(txt[i:txt.rfind("}") + 1]) if i >= 0 else None


def exportar(proj, caminho, op=None):
    """op: {formato mp3|wav|aac|m4a|ogg|flac|opus, kbps, sr, lufs (ex. -14; None = sem), tp (-1), faixas (ids; None = todas),
    ini/fim (s: só um trecho), meta {titulo, artista, album, ano, genero, comentario} (ID3/tags), capitulos [{t, nome}]
    (marcadores viram capítulos no mp3/m4a/ogg/flac/opus)}."""
    op = op or {}
    _EXP["parar"] = False
    if op.get("nao_sobrescrever") and os.path.exists(caminho):
        return {"success": False, "error": "já existe um arquivo com esse nome; escolha outro nome na fila"}
    fmt = (op.get("formato") or os.path.splitext(caminho)[1].lstrip(".") or "mp3").lower()
    if fmt not in FORMATOS:
        return {"success": False, "error": f"formato {fmt}: use {', '.join(FORMATOS)}"}
    sr = int(op.get("sr") or 48000)
    try:
        proj = _com_plugins(proj)   # faixas com plugin VST3: o arquivo congelado (o mesmo da prévia)
    except RuntimeError as e:
        if _EXP["parar"]:
            return {"success": False, "cancelled": True, "error": "parado"}
        return {"success": False, "error": str(e)}
    if _EXP["parar"]:
        return {"success": False, "cancelled": True, "error": "parado"}
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
        if _EXP["parar"]:
            return {"success": False, "cancelled": True, "error": "parado"}
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
    canais = ["-ac", "1"] if op.get("mono") else []
    meta, extra = [], []
    md = op.get("meta") or {}
    for k, ff in (("titulo", "title"), ("artista", "artist"), ("album", "album"), ("ano", "date"), ("genero", "genre"), ("comentario", "comment")):
        if md.get(k):
            meta += ["-metadata", f"{ff}={md[k]}"]
    caps = sorted((c for c in (op.get("capitulos") or []) if a <= float(c["t"]) < b), key=lambda c: float(c["t"]))
    if caps and fmt != "wav":
        esc = lambda s: "".join("\\" + ch if ch in "=;#\\\n" else ch for ch in str(s))
        txt = ";FFMETADATA1\n"
        for i, c in enumerate(caps):
            ini_ms = int(round((float(c["t"]) - a) * 1000))
            fim_ms = int(round(((float(caps[i + 1]["t"]) if i + 1 < len(caps) else b) - a) * 1000))
            txt += f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={ini_ms}\nEND={fim_ms}\ntitle={esc(c.get('nome') or f'Capítulo {i + 1}')}\n"
        mf = os.path.join(os.path.dirname(script), "meta.txt")
        open(mf, "w", encoding="utf-8").write(txt)
        n = len(entradas) // 2
        extra = ["-f", "ffmetadata", "-i", mf]
        meta += ["-map_chapters", str(n)]
    cmd = [ffmpeg(), "-y", "-hide_banner", "-nostdin", *entradas, *extra, "-/filter_complex", script, "-map", rot, "-ar", str(sr), *canais, *codec,
           *meta, *(["-id3v2_version", "3"] if fmt == "mp3" else []), caminho]
    r = _rodar(cmd, 7200)
    if _EXP["parar"]:   # parado pela fila: o arquivo pela metade sai
        try:
            os.remove(caminho)
        except OSError:
            pass
        return {"success": False, "cancelled": True, "error": "parado"}
    if r.returncode != 0 or not os.path.isfile(caminho):
        return {"success": False, "error": (r.stderr or "")[-600:]}
    return {"success": True, "caminho": caminho, "dur": round(b - a, 3)}


# ─────────────────────────── plugins VST3 na faixa ───────────────────────────
# f.plug = [{id, caminho, cid, nome, fab, estado (base64), on}] — no FIM da cadeia da faixa (depois do reverb), antes do
# volume. A faixa com plugin é "congelada" (como nos programas de áudio): os clipes + a cadeia do Kanivete viram um WAV
# desde o 0 e passam pelos plugins num processo à parte (`<app> --vst3 processar`, o mesmo da exportação do Vídeo);
# a prévia toca esse arquivo (som-plugins.js) e a exportação usa o MESMO arquivo (cache pelo conteúdo da faixa).
CAUDA_PLUGIN = 2.0   # s de silêncio no fim para a cauda (reverb/eco do plugin)


def _plugins_ativos(f):
    return [p for p in (f.get("plug") or []) if p.get("on", True) and p.get("caminho") and p.get("cid")]


def _exe_app():
    import sys
    if getattr(sys, "frozen", False):
        return [sys.executable]
    return [sys.executable, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "main.py")]


def congelar_faixa(f, sr=48000):
    """WAV float da faixa `f` com os plugins → {success, arq, dur}. Cache pelo conteúdo (clipes, cadeia, plugins e ajustes)."""
    plugs = _plugins_ativos(f)
    if not plugs:
        return {"success": False, "error": "a faixa não tem plugin ligado"}
    base = {k: f.get(k) for k in ("clipes", "fx")}
    chave = hashlib.sha1(json.dumps([base, [[p["caminho"], p["cid"], p.get("estado") or ""] for p in plugs], sr],
                                    sort_keys=True, default=str).encode()).hexdigest()[:20]
    pasta = os.path.join(_cache_dir(), "congeladas")
    os.makedirs(pasta, exist_ok=True)
    saida = os.path.join(pasta, f"{chave}.wav")
    if os.path.isfile(saida) and os.path.getsize(saida) > 44 and os.path.isfile(saida + ".json"):
        return {"success": True, "arq": saida, "dur": json.load(open(saida + ".json"))["dur"], "cache": True}
    so = {"faixas": [{**f, "vol": 1, "mudo": False, "solo": False, "plug": []}], "master": {}}
    m = _montar(so, sr)
    if not m:
        return {"success": False, "error": "faixa vazia"}
    entradas, fc, rot, fim = m
    seca = os.path.join(pasta, f"{chave}_seca.wav")
    fc += f";{rot}apad=pad_dur={CAUDA_PLUGIN}[sk]"
    script = os.path.join(tempfile.mkdtemp(prefix="skfrz_"), "fc.txt")
    open(script, "w", encoding="utf-8").write(fc)
    r = _rodar([ffmpeg(), "-y", "-hide_banner", "-nostdin", *entradas, "-/filter_complex", script, "-map", "[sk]",
                "-ar", str(sr), "-ac", "2", "-c:a", "pcm_f32le", seca], 3600)
    if r.returncode != 0 or not os.path.isfile(seca):
        return {"success": False, "error": (r.stderr or "")[-400:]}
    cadeia = os.path.join(os.path.dirname(script), "cadeia.json")
    json.dump([{"caminho": p["caminho"], "cid": p["cid"], "estado": p.get("estado") or ""} for p in plugs], open(cadeia, "w", encoding="utf-8"))
    tmp = saida + ".tmp.wav"
    r = _rodar([*_exe_app(), "--vst3", "processar", seca, tmp, cadeia], 3600)
    try:
        os.remove(seca)
    except OSError:
        pass
    if r.returncode != 0 or not os.path.isfile(tmp):
        err = ((r.stderr or "").strip().splitlines() or ["o plugin fechou"])[-1]
        return {"success": False, "error": f"plugin: {err[-300:]}"}
    os.replace(tmp, saida)
    # duração = até onde o plugin ainda soa (cauda de reverb/eco), no mínimo o fim da faixa: sem rabo de silêncio
    dur = fim
    try:
        from Functions.vst3 import _ler_wav_float
        import numpy as np
        a = np.abs(_ler_wav_float(saida)).max(axis=0)
        vivos = np.nonzero(a[int(fim * sr):] > 1e-4)[0]   # -80 dB
        if len(vivos):
            dur = min(fim + CAUDA_PLUGIN, fim + (vivos[-1] + 1) / sr)
    except Exception:
        dur = fim + CAUDA_PLUGIN
    dur = round(float(dur), 4)
    json.dump({"dur": dur}, open(saida + ".json", "w"))
    return {"success": True, "arq": saida, "dur": dur}


def _com_plugins(proj, sr=48000):
    """cópia do projeto em que cada faixa com plugin vira um clipe só (o arquivo congelado), sem a cadeia (já está nele)"""
    if not any(_plugins_ativos(f) for f in proj.get("faixas", [])):
        return proj
    out = {**proj, "faixas": []}
    for f in proj.get("faixas", []):
        if not _plugins_ativos(f) or f.get("mudo"):
            out["faixas"].append(f)
            continue
        r = congelar_faixa(f, sr)
        if not r.get("success"):
            raise RuntimeError(f"faixa {f.get('nome', '')}: {r.get('error')}")
        out["faixas"].append({**f, "fx": {}, "plug": [], "clipes": [{"id": "frz", "arq": r["arq"], "ini": 0, "de": 0, "dur": r["dur"], "vol": 1,
                                                                    "fade_in": 0, "fade_out": 0}]})
    return out


def medir_lufs(proj, op=None):
    """Loudness integrada da mixagem (LUFS) e pico verdadeiro (dBTP) — para mostrar antes de exportar."""
    try:
        proj = _com_plugins(proj)
    except RuntimeError as e:
        return {"success": False, "error": str(e)}
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


def transformar_voz(arq, op=None, log=print, prog=lambda *a: None):
    """Tom, tempo e bitcrusher do trecho escolhido; saída persistente no D, sem sobrescrever a gravação."""
    import math
    op = op or {}

    def numero(chave, padrao, minimo, maximo):
        n = float(op.get(chave, padrao))
        if not math.isfinite(n) or not minimo <= n <= maximo:
            raise ValueError(f"valor inválido para {chave}: {n}")
        return n

    arq = os.path.abspath(arq)
    if not os.path.isfile(arq):
        raise FileNotFoundError("gravação não encontrada")
    total = _ffprobe_dur(arq)[0]
    de = numero("de", 0, 0, max(0, total))
    dur = numero("dur", total - de, 0.01, max(0.01, total - de + 0.005))
    tom = numero("tom", 0, -24, 24)
    velocidade = numero("velocidade", 1, 0.25, 4)
    bits = numero("bits", 8, 2, 16)
    amostragem = numero("amostragem", 5500, 1000, 48000)
    mistura = numero("mistura", 90, 0, 100)
    preservar = op.get("preservar", True)
    crusher = op.get("bitcrusher", False)
    previa = op.get("previa", False)
    if any(type(v) is not bool for v in (preservar, crusher, previa)):
        raise ValueError("preservar, bitcrusher e previa precisam ser booleanos")
    if previa:
        dur = min(dur, 6 * velocidade)
    opcoes = dict(de=de, dur=dur, tom=tom, velocidade=velocidade, preservar=preservar,
                  bits=bits, amostragem=amostragem, mistura=mistura, bitcrusher=crusher, previa=previa)
    assinatura = json.dumps([arq, os.stat(arq).st_mtime_ns, os.path.getsize(arq), opcoes], sort_keys=True)
    nome = hashlib.sha256(assinatura.encode("utf-8")).hexdigest()[:20]
    pasta = os.path.join(os.path.splitdrive(os.path.abspath(__file__))[0] + os.sep, "Kanivete", "Sound Kanivete", "Efeitos de voz")
    os.makedirs(pasta, exist_ok=True)
    saida = os.path.join(pasta, f"{'previa' if previa else 'voz'}_{nome}.wav")
    if not os.path.isfile(saida):
        filtros = [f"atrim=start={de:.9f}:duration={dur:.9f}", "asetpts=PTS-STARTPTS", "aresample=48000"]
        fator = 2 ** (tom / 12) * (1 if preservar else velocidade)
        if abs(fator - 1) > 1e-7 or abs(velocidade - 1) > 1e-7:
            filtros.append(f"rubberband=tempo={velocidade:.9f}:pitch={fator:.9f}")
        if crusher and mistura > 0:
            filtros.append(f"acrusher=bits={bits:g}:samples={48000 / amostragem:.9f}:mix={mistura / 100:.6f}:mode=lin:aa=0")
        # Proteção de pico sem normalizar para cima nem mudar o volume escolhido.
        filtros.append("alimiter=limit=0.98:level=0:latency=1")
        prog(15, "Preparando prévia" if previa else "Transformando a voz")
        fd, temporario = tempfile.mkstemp(prefix="voz_", suffix=".wav", dir=pasta)
        os.close(fd)
        try:
            r = subprocess.run([ffmpeg(), "-v", "error", "-y", "-i", arq, "-vn", "-af", ",".join(filtros),
                                "-c:a", "pcm_s24le", temporario], capture_output=True, text=True,
                               timeout=600, creationflags=NO_WINDOW)
            if r.returncode:
                raise RuntimeError("não foi possível transformar a voz: " + (r.stderr or "")[-500:])
            os.replace(temporario, saida)
        finally:
            if os.path.isfile(temporario):
                os.remove(temporario)
    prog(95, "Voz pronta")
    return {"saida": saida, "dur": _ffprobe_dur(saida)[0], "opcoes": opcoes}


def melhorar_voz(arq, log=print, prog=lambda *a: None):
    """Melhorar Áudio (Sidon + OmniVoice): só o som, no mesmo tempo do original, em arquivo novo ao lado."""
    from Functions.melhorar_audio import melhorar_arquivo
    return melhorar_arquivo(arq, log, lambda v, m=None: prog(v * 100 if v >= 0 else -1, m), so_audio=True)


# ─────────────────────────── fase 4: medir/igualar, silêncios, efeitos de faixa ───────────────────────────
def lufs_trecho(arq, de=0.0, dur=None):
    """Loudness integrada (LUFS) de um trecho do arquivo — para igualar o volume dos clipes sem gerar arquivo."""
    import re
    cmd = [ffmpeg(), "-hide_banner", "-nostdin", "-ss", f"{float(de):.3f}"] + (["-t", f"{float(dur):.3f}"] if dur else []) + ["-i", arq, "-vn", "-af", _ESTEREO(arq) + ",ebur128", "-f", "null", "-"]   # medido como entra na mixagem
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, creationflags=NO_WINDOW)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr or "")
    if not m:
        return {"success": False, "error": "não mediu"}
    v = float(m[-1])
    return {"success": True, "lufs": v if v > -70 else None}


def silencios(arq, de=0.0, dur=None, limiar_db=-40, min_s=0.6):
    """Trechos de silêncio [início, fim] (relativos ao começo do trecho) com pelo menos `min_s` segundos."""
    import re
    cmd = [ffmpeg(), "-hide_banner", "-nostdin", "-ss", f"{float(de):.3f}"] + (["-t", f"{float(dur):.3f}"] if dur else []) + \
          ["-i", arq, "-vn", "-af", f"silencedetect=noise={float(limiar_db)}dB:d={float(min_s)}", "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, creationflags=NO_WINDOW)
    ini = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", r.stderr or "")]
    fim = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr or "")]
    total = float(dur) if dur else _ffprobe_dur(arq)[0]
    out = []
    for i, a in enumerate(ini):
        b = fim[i] if i < len(fim) else total
        out.append([round(max(0.0, a), 3), round(min(total, b), 3)])
    return {"success": True, "silencios": out}


GEQ_FREQS = (31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)   # EQ gráfico de 10 bandas (1 oitava cada)


def ir_reverb(tamanho=1.2, sr=48000):
    """Resposta ao impulso do reverb (ruído estéreo com queda de 60 dB em `tamanho` s, semente fixa, energia 1 por
    canal) em WAV float32 — a mesma para a prévia (ConvolverNode) e a exportação (afir)."""
    import struct
    import numpy as np
    tamanho = round(max(0.2, min(6.0, float(tamanho))), 1)
    from Functions.midia import pasta_cache
    arq = os.path.join(pasta_cache("sk_ir"), f"rev_{tamanho:.1f}_{sr}.wav")
    if os.path.isfile(arq):
        return arq
    os.makedirs(os.path.dirname(arq), exist_ok=True)
    n, pre = int(tamanho * sr), int(0.012 * sr)
    t = np.arange(n) / sr
    canais = []
    for semente in (11, 23):
        x = np.random.default_rng(semente).standard_normal(n) * np.exp(-6.91 * t / tamanho)
        x[:pre] = 0
        canais.append(x / np.sqrt((x ** 2).sum()))
    dados = np.stack(canais, 1).astype("<f4").tobytes()
    cab = b"RIFF" + struct.pack("<I", 36 + len(dados)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 3, 2, sr, sr * 8, 8, 32) + b"data" + struct.pack("<I", len(dados))
    tmp = arq + ".tmp"
    open(tmp, "wb").write(cab + dados)
    os.replace(tmp, arq)
    return arq


def _filtros_faixa(f, ir=None):
    """Cadeia da faixa → filtros do ffmpeg, na ordem da prévia (som-motor.js): passa-alta → gate → EQ (grave 120 Hz,
    médio 2,5 kHz, agudo 8 kHz) → EQ gráfico → de-esser → compressor. O reverb fica em _reverb_faixa (precisa da IR).
    Gate e de-esser na prévia são aproximados (AudioWorklet); aqui agate e sidechaincompress com os mesmos tempos."""
    fx = f.get("fx") or {}
    out = []
    h = fx.get("hpf") or {}
    if h.get("ativo"):
        out.append(f"highpass=f={float(h.get('freq', 80)):.1f}")
    g = fx.get("gate") or {}
    if g.get("ativo"):
        out.append(f"agate=threshold={10 ** (float(g.get('limiar', -50)) / 20):.6f}:range=0.03:ratio=20:attack=5:release=100:detection=peak")
    eq = fx.get("eq") or {}
    for chave, freq, tipo in (("grave", 120, "lowshelf"), ("medio", 2500, "equalizer"), ("agudo", 8000, "highshelf")):
        g = float(eq.get(chave) or 0)
        if abs(g) > 0.05:
            out.append(f"{tipo}=f={freq}:g={g:.2f}" + (":t=q:w=1" if tipo == "equalizer" else ""))
    geq = fx.get("geq") or {}
    if geq.get("ativo"):
        for freq, gd in zip(GEQ_FREQS, geq.get("bandas") or []):
            if abs(float(gd)) > 0.05:
                out.append(f"equalizer=f={freq}:t=o:w=1:g={float(gd):.2f}")
    d = fx.get("deess") or {}
    if d.get("ativo"):
        r = 1 / max(0.05, 1 - float(d.get("quant", 0.5)))   # ganho = (limiar/nível)^quant ⇔ razão 1/(1-quant)
        out.append(f"asplit=2[dsa][dsk];[dsk]highpass=f=5000:p=1[dsk2];[dsa][dsk2]sidechaincompress=threshold=0.05:ratio={r:.3f}:attack=1:release=60:detection=peak:knee=1")
    c = fx.get("comp") or {}
    if c.get("ativo"):
        lim = 10 ** (float(c.get("limiar", -18)) / 20)
        out.append(f"acompressor=threshold={lim:.5f}:ratio={float(c.get('razao', 3)):.2f}:attack=10:release=150:makeup={10 ** (float(c.get('ganho', 0)) / 20):.4f}")
    return out
