"""Forçar Full HD (painel Projeto): vídeo maior que Full HD (2K, 4K, 8K, em pé ou deitado) vira uma cópia com o lado
menor em 1080 px, na pasta "Otimizados FullHD" ao lado do original. Para editar leve num quadro 1080 sem perda
visível: taxa alta (NVENC cq 17 / x264 crf 16), som copiado sem recodificar, rotação gravada no quadro e os mesmos
tempos de quadro do original (-fps_mode passthrough: os cortes da timeline caem no mesmo lugar).
Com placa NVIDIA: decodifica e reduz na placa (8K → 1080 sem passar o quadro grande pela RAM).
"""
import os

from Functions.video_cutter import ffmpeg_path, probe, _detectar_hw_encoder, _run_progress

PASTA = "Otimizados FullHD"
LADO = 1080


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
    if os.path.isfile(saida) and os.path.getmtime(saida) >= os.path.getmtime(path):
        return {"success": True, "saida": saida, "w": tw, "h": th, "reuso": True}
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
          "-spatial-aq", "1", "-temporal-aq", "1", "-bf", "3", "-profile:v", "high", "-pix_fmt", "yuv420p"]
    cpu = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p"]
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
            os.replace(tmp, saida)
            return {"success": True, "saida": saida, "w": tw, "h": th}
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
