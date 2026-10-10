"""Forçar Full HD (painel Projeto): vídeo maior que Full HD (2K, 4K, 8K, em pé ou deitado) vira uma cópia com o lado
menor em 1080 px, na pasta "Otimizados FullHD" ao lado do original. Para editar leve num quadro 1080 sem perda
visível: taxa alta (NVENC cq 17 / x264 crf 16), som copiado sem recodificar, rotação gravada no quadro e os mesmos
tempos de quadro do original (-fps_mode passthrough: os cortes da timeline caem no mesmo lugar).
Com placa NVIDIA: decodifica e reduz na placa (8K → 1080 sem passar o quadro grande pela RAM).

Cópia de EDIÇÃO (como os proxies do Premiere/DaVinci): quadro-chave a cada ~0,25 s e sem quadros B. Com o padrão do
codificador (quadro-chave a cada 4–8 s), mostrar um quadro qualquer obrigava a decodificar centenas desde o último
quadro-chave: no player do editor, pular para um ponto levava 180 ms e arrastar a agulha 75 ms por passo; com 0,25 s,
18 e 17 ms (2026-10-10, D:/kanivete_testes/webcodecs/medir_gop.py). O arquivo fica ~40% maior; quadros B não
economizaram espaço e deixaram o pulo mais lento (27 ms). Cópias antigas (gop_longo) são refeitas, não reaproveitadas.
"""
import os
import subprocess
import time

from Functions.video_cutter import ffmpeg_path, ffprobe_path, probe, _detectar_hw_encoder, _run_progress, _creationflags

PASTA = "Otimizados FullHD"
LADO = 1080
GOP_S = 0.25            # segundos entre quadros-chave na cópia de edição
GOP_LONGO_S = 1.0       # acima disso a cópia é "antiga" (lenta para editar) e é refeita
_EXT_VIDEO = (".mp4", ".mov", ".m4v", ".mkv", ".avi", ".mts", ".m2ts", ".webm", ".3gp", ".hevc", ".insv")
_gop_cache = {}


def gop_longo(path):
    """True se o vídeo tem quadros-chave mais espaçados que GOP_LONGO_S (olha os primeiros 12 s; ffprobe ~0,1 s)."""
    try:
        st = os.stat(path)
    except OSError:
        return False
    ch = (os.path.abspath(path), st.st_mtime_ns, st.st_size)
    if ch in _gop_cache:
        return _gop_cache[ch]
    try:
        r = subprocess.run([ffprobe_path(), "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey",
                            "-show_entries", "frame=pts_time", "-of", "csv=p=0", "-read_intervals", "%+12", path],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30, creationflags=_creationflags())
        ks = sorted(float(x.strip(",")) for x in r.stdout.split() if x.strip(", "))
        gaps = [b - a for a, b in zip(ks, ks[1:])]
        longo = (max(gaps) > GOP_LONGO_S) if gaps else (len(ks) <= 1 and probe(path).get("duration", 0) > 12)
    except Exception:
        longo = False
    _gop_cache[ch] = longo
    return longo


def original_de(copia):
    """Cópia "Otimizados FullHD/<nome>_FullHD.mp4" → o vídeo original ao lado da pasta (None se não achar)."""
    pasta, nome = os.path.split(os.path.abspath(copia))
    if os.path.basename(pasta) != PASTA or not nome.lower().endswith("_fullhd.mp4"):
        return None
    radical, pai = nome[:-len("_FullHD.mp4")], os.path.dirname(pasta)
    try:
        for f in os.listdir(pai):
            r, e = os.path.splitext(f)
            if r == radical and e.lower() in _EXT_VIDEO and os.path.isfile(os.path.join(pai, f)):
                return os.path.join(pai, f)
    except OSError:
        pass
    return None


def copias_antigas(paths):
    """Das mídias de um projeto, as cópias Full HD no formato antigo (lentas para editar) com o original ainda ao lado."""
    out = []
    for p in paths or []:
        if p and os.path.isfile(p) and gop_longo(p):
            o = original_de(p)
            if o:
                out.append({"path": p, "original": o})
    return out


def _gop(info):
    try:
        fps = float(info.get("fps_timeline") or info.get("fps") or 30)
    except (TypeError, ValueError):
        fps = 30.0
    return max(2, int(round((fps or 30) * GOP_S)))


def _trocar(tmp, saida):
    """Põe a cópia nova no lugar. O editor pode estar lendo a antiga (Windows não deixa trocar arquivo aberto): tenta
    por alguns segundos; se não der, grava ao lado com outro nome (o editor troca a mídia para ela)."""
    for _ in range(30):
        try:
            os.replace(tmp, saida)
            return saida
        except PermissionError:
            time.sleep(0.5)
    alt = saida[:-4] + "_r.mp4"
    os.replace(tmp, alt)
    return alt


def destino(path):
    pasta, nome = os.path.split(os.path.abspath(path))
    return os.path.join(pasta, PASTA, os.path.splitext(nome)[0] + "_FullHD.mp4")


def _tamanho_saida(w, h):
    """Lado menor em 1080, proporção mantida, sempre par."""
    k = LADO / min(w, h)
    return max(2, int(round(w * k / 2)) * 2), max(2, int(round(h * k / 2)) * 2)


def converter(path, on_pct=None, stop_event=None, on_motor=None):
    """{success, saida, w, h, reuso?} | {success: False, error} | {success: True, pulado: motivo}.
    on_motor("GPU" | "CPU") avisa por onde cada tentativa converte (barra do painel Projeto)."""
    try:
        info = probe(path)
    except Exception as e:
        return {"success": False, "error": f"não foi possível analisar: {e}"}
    if not info.get("has_video"):
        return {"success": True, "pulado": "sem vídeo"}
    rot = int(info.get("rotation") or 0) % 360
    w, h = info["width"], info["height"]   # já como aparece (girado)
    if not w or not h:
        return {"success": False, "error": "tamanho desconhecido"}
    if min(w, h) <= LADO:
        return {"success": True, "pulado": "já é Full HD ou menor"}
    tw, th = _tamanho_saida(w, h)
    saida = destino(path)
    if os.path.isfile(saida) and os.path.getmtime(saida) >= os.path.getmtime(path) and not gop_longo(saida):
        return {"success": True, "saida": saida, "w": tw, "h": th, "reuso": True}
    g = str(_gop(info))
    os.makedirs(os.path.dirname(saida), exist_ok=True)
    tmp = saida + ".part.mp4"
    giro = {90: "transpose=cclock", 270: "transpose=clock", 180: "hflip,vflip"}.get(rot)
    audio = ["-map", "0:a:0?", "-c:a", "copy"] if info.get("acodec") in ("aac", "mp3", "alac", "ac3", "eac3", "opus") \
        else ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "320k"]
    # mesmos tempos de quadro do original (celular é VFR): sem a base de tempo da entrada eles iam para a grade de 30 fps
    comum = ["-map_metadata", "0", "-metadata:s:v:0", "rotate=0", "-fps_mode", "passthrough",
             "-enc_time_base:v", "demux", "-video_track_timescale", "90000"] + audio + \
            ["-movflags", "+faststart", tmp]
    nv = ["-c:v", "h264_nvenc", "-preset", "p6", "-tune", "hq", "-rc", "vbr", "-cq", "17", "-b:v", "0",
          "-spatial-aq", "1", "-temporal-aq", "1", "-bf", "0", "-g", g, "-profile:v", "high", "-pix_fmt", "yuv420p"]
    cpu = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-bf", "0", "-g", g, "-keyint_min", g,
           "-profile:v", "high", "-pix_fmt", "yuv420p"]
    cor = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
    tentativas = []
    if _detectar_hw_encoder() == "h264_nvenc" and info.get("vcodec") in ("h264", "hevc", "vp9", "av1"):
        sw, sh = (th, tw) if rot in (90, 270) else (tw, th)   # a placa reduz o quadro antes de girar
        vf = f"scale_cuda={sw}:{sh}:format=nv12:interp_algo=lanczos,hwdownload,format=nv12" + (f",{giro}" if giro else "")
        # rotação zerada na ENTRADA (não só -noautorotate): o ffmpeg novo copia a matriz de rotação do original para a
        # saída e o quadro, já girado pelo transpose, girava de novo no player (vídeo de cabeça para baixo, 2026-10-08)
        tentativas.append([ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-display_rotation:v:0", "0",
                           "-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-i", path, "-map", "0:v:0",
                           "-vf", vf] + nv + cor + comum)
    tentativas.append([ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", path,
                       "-map", "0:v:0", "-vf", f"scale={tw}:{th}:flags=lanczos"] + cpu + cor + comum)
    err = ""
    for cmd in tentativas:
        if on_motor:
            on_motor("GPU" if "h264_nvenc" in cmd else "CPU")
        rc, err = _run_progress(cmd, info["duration"], on_pct or (lambda p: None), stop_event)
        if stop_event is not None and stop_event.is_set():
            break
        if rc == 0 and os.path.isfile(tmp):
            return {"success": True, "saida": _trocar(tmp, saida), "w": tw, "h": th}
    try:
        os.remove(tmp)
    except OSError:
        pass
    if stop_event is not None and stop_event.is_set():
        return {"success": False, "cancelled": True, "error": "cancelado"}
    return {"success": False, "error": (err or "").strip().splitlines()[-1] if err else "falha na conversão"}


def usar_otimizados(camadas):
    """Exportação: vídeo de camada com a cópia Full HD já feita (pasta "Otimizados FullHD", mais nova que o original) e
    que aparece em até 1080 no lado menor passa a ser lido da cópia — na saída é a mesma imagem e o 4K do celular não
    pesa (no modo placa, 34 leituras 4K não cabiam nos 8 GB). Escala, quadros-chave e âncora acompanham (como no
    Forçar Full HD: 4K a 50% vira Full HD a 100%). Devolve (camadas, quantas trocou)."""
    import copy
    from Functions.video_cutter import _ca_pulso_max
    out, n, infos = [], 0, {}
    for c in camadas or []:
        p = c.get("path") if isinstance(c, dict) else None
        if not p or c.get("tipo") in ("imagem", "ajuste") or not os.path.isfile(p):
            out.append(c)
            continue
        d = destino(p)
        try:
            ok = os.path.isfile(d) and os.path.getmtime(d) >= os.path.getmtime(p)
        except OSError:
            ok = False
        if ok:
            for q in (p, d):
                if q not in infos:
                    try:
                        infos[q] = probe(q)
                    except Exception:
                        infos[q] = {}
            mw, mh = float(c.get("mw") or 0), float(c.get("mh") or 0)
            fw, fh = infos[d].get("width") or 0, infos[d].get("height") or 0
            sc = [float(c.get("sc", 100))] + [float(q[1]) for q in (c.get("kf") or {}).get("sc", []) if len(q) > 1]
            maior = max(sc) / 100.0 * _ca_pulso_max(c.get("ca"))
            # mesma proporção (o mesmo vídeo) e nunca maior na tela que a cópia: senão perderia definição
            ok = (mw > fw > 0 and mh > 0 and fh > 0 and abs(mw / mh - fw / fh) < 0.01 and min(mw, mh) * maior <= min(fw, fh) * 1.001)
        if not ok:
            out.append(c)
            continue
        k = mw / fw
        c = copy.deepcopy(c)
        c["path"], c["mw"], c["mh"] = d, fw, fh
        c["sc"] = float(c.get("sc", 100)) * k
        if (c.get("kf") or {}).get("sc"):
            c["kf"]["sc"] = [[q[0], float(q[1]) * k, *q[2:]] for q in c["kf"]["sc"]]
        for e in ("ox", "oy"):
            if c.get(e):
                c[e] = float(c[e]) / k
        out.append(c)
        n += 1
    return out, n
