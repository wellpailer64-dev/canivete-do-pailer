"""
video_cutter.py — Motor do Pocket Editor (editor de vídeo do Canivete do Pailer)

- Análise completa via ffprobe (codec, fps, rotação, áudio)
- Pré-visualização: toca o original quando o navegador suporta; senão gera um proxy
  H.264 leve (720p, keyframes frequentes para scrub preciso)
- Miniaturas em paralelo e forma de onda com numpy
- Exportação com precisão de frame: cada trecho mantido vira uma entrada com seek
  (-ss/-t) e tudo é concatenado — rápido (pula os trechos removidos) e sem estourar memória
- Progresso real, cancelamento e aceleração por GPU (NVENC/QSV/AMF) com fallback
"""
import array
import base64
import contextlib
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from Functions.audio_cutter import ffmpeg_path, ffprobe_path, _creationflags
from Functions import media_server

FORMATOS_ENTRADA = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".wmv",
    ".m4v", ".ts", ".mts", ".m2ts", ".3gp", ".ogv", ".mpg", ".mpeg",
    ".mxf", ".asf", ".m2v", ".f4v",
    # RAW/profissional: passa pela mesma análise/proxy do FFmpeg; alguns codecs proprietários
    # podem falhar se o decoder não existir na build local.
    ".r3d", ".braw", ".ari", ".arx",
    # só áudio: o editor também corta/ajusta áudio e exporta em MP3/WAV
    ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif",
}
# imagem também abre o editor: a sequência nasce com o tamanho dela (_base_imagem)
FORMATOS_IMAGEM = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".avif", ".tif", ".tiff"}
# áudio que o player do app toca direto (o resto ganha uma prévia .m4a)
_NAVEGADOR_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"}

FORMATOS_SAIDA = {
    "mp4":  {"ext": ".mp4",  "vcodec": "h264", "acodec": "aac",     "extra": ["-movflags", "+faststart"]},
    "mov":  {"ext": ".mov",  "vcodec": "h264", "acodec": "aac",     "extra": []},
    "mkv":  {"ext": ".mkv",  "vcodec": "h264", "acodec": "aac",     "extra": []},
    "webm": {"ext": ".webm", "vcodec": "vp9",  "acodec": "libopus", "extra": []},
    "avi":  {"ext": ".avi",  "vcodec": "mpeg4", "acodec": "mp3",    "extra": []},
    # só áudio
    "mp3":  {"ext": ".mp3",  "vcodec": None, "acodec": "libmp3lame", "extra": [], "audio_only": True},
    "wav":  {"ext": ".wav",  "vcodec": None, "acodec": "pcm_s16le",  "extra": [], "audio_only": True},
}

# crf x264 | cq GPU | crf vp9 | bitrate áudio | preset x264
_QUALIDADE = {
    "high":   {"crf": 18, "cq": 20, "vp9": 24, "ab": "256k", "preset": "medium"},
    "medium": {"crf": 21, "cq": 23, "vp9": 30, "ab": "192k", "preset": "fast"},
    "fast":   {"crf": 24, "cq": 26, "vp9": 34, "ab": "160k", "preset": "veryfast"},
    "low":    {"crf": 28, "cq": 30, "vp9": 40, "ab": "128k", "preset": "veryfast"},
}

_RESOLUCOES = {"original": 0, "2160": 2160, "1440": 1440, "1080": 1080, "720": 720, "480": 480}

_NAVEGADOR_VCODECS = {"h264", "vp8", "vp9", "av1"}
_NAVEGADOR_ACODECS = {"aac", "mp3", "opus", "vorbis", "flac"}
_NAVEGADOR_CONTAINERS = {".mp4", ".m4v", ".mov", ".webm"}

_hw_encoder_cache = None
_ultimo_motivo_placa = [""]   # por que a última exportação não foi (ou não terminou) na placa (export_placa)
_hw_motivo = ""   # por que a placa NVIDIA não grava (ex.: driver antigo para o ffmpeg); vazio = sem problema conhecido
_export_proc = None
_export_procs = set()   # ffmpegs dos blocos em paralelo (_exportar_em_blocos)
_export_lock = threading.Lock()


# ─────────────────────────── utilidades ───────────────────────────

_RAIZ_TEMP = os.path.join(tempfile.gettempdir(), "canivete_editor")


def _work_dir():
    """Arquivos de sessão DESTA cópia do app (cada cópia tem a sua pasta: abrir um vídeo numa não apaga os da outra)."""
    d = os.path.join(_RAIZ_TEMP, f"s{os.getpid()}")
    os.makedirs(d, exist_ok=True)
    return d


def _pid_vivo(pid):
    if pid == os.getpid():
        return True
    if os.name != "nt":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    import ctypes
    from ctypes import wintypes
    k = ctypes.windll.kernel32
    h = k.OpenProcess(0x1000, False, pid)   # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return False
    cod = wintypes.DWORD()
    ok = k.GetExitCodeProcess(h, ctypes.byref(cod))
    k.CloseHandle(h)
    return bool(ok) and cod.value == 259   # STILL_ACTIVE


# ── preferências (as mesmas do app: Preferências → Cache e Disco), lidas do arquivo e relidas quando ele muda ──
_prefs_lidas = [None, {}]


def _prefs():
    arq = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "CaniveteDoPailer", "preferencias.json")
    try:
        mt = os.path.getmtime(arq)
        if _prefs_lidas[0] != mt:
            with open(arq, encoding="utf-8") as f:
                _prefs_lidas[:] = [mt, json.load(f) or {}]
    except Exception:
        pass
    return _prefs_lidas[1]


def _cache_cfg():
    c = _prefs().get("cache") or {}
    try:
        lado = int(c.get("altura") or 1080)
    except (TypeError, ValueError):
        lado = 1080
    try:
        dias, max_gb = int(c.get("dias") or 30), float(c.get("maxGB") or 20)
    except (TypeError, ValueError):
        dias, max_gb = 30, 20.0
    return {"dir": str(c.get("dir") or "").strip(), "lado": lado if lado in (540, 720, 1080) else 1080,
            "dias": dias, "max_gb": max_gb, "junto": bool(c.get("proxyJunto"))}


def _midia_dir():
    """Prévias leves, miniaturas e áudio conformado dos vídeos do projeto: na pasta de cache das Preferências
    (o %TEMP% é limpo pelo Windows e as prévias tinham de ser refeitas). Uma pasta por arquivo+data."""
    from Functions import render_cache
    base = _cache_cfg()["dir"] or render_cache.base_padrao()
    d = os.path.join(base, "Canivete Media Cache")
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:   # disco escolhido não está conectado: usa a pasta padrão
        d = os.path.join(render_cache.base_padrao(), "Canivete Media Cache")
        os.makedirs(d, exist_ok=True)
    return d


def _linhas_ffmpeg(err, n=8):
    linhas = [l.strip() for l in (err or "").splitlines() if l.strip()]
    if not linhas:
        return []
    return linhas[-n:]


def _salvar_falha_export(cmd, script, err, saida):
    try:
        arq = os.path.join(_work_dir(), f"export_fail_{uuid.uuid4().hex[:8]}.log")
        with open(arq, "w", encoding="utf-8") as f:
            f.write("Saida:\n")
            f.write(str(saida or "") + "\n\n")
            f.write("Comando:\n")
            f.write(json.dumps(cmd or [], ensure_ascii=False, indent=2) + "\n\n")
            if script and os.path.isfile(script):
                f.write("Filtro:\n")
                with open(script, "r", encoding="utf-8", errors="replace") as sf:
                    f.write(sf.read())
                f.write("\n\n")
            f.write("FFmpeg stderr:\n")
            f.write(err or "")
            f.write("\n")
        return arq
    except Exception:
        return None


def _eh_imagem(path):
    return os.path.splitext(str(path))[1].lower() in FORMATOS_IMAGEM


def _base_imagem(path):
    """
    Timeline começando por uma imagem: o editor precisa de um vídeo base (tamanho, qps, fundo da exportação).
    Gera um vídeo preto mudo de 1 s no tamanho da imagem (par), guardado fora da pasta de prévias (que é limpa a
    cada abertura) e reaproveitado por tamanho. A imagem em si entra na timeline como clipe comum.
    """
    info = probe(path)
    return _base_preta(info.get("width") or 1920, info.get("height") or 1080)


def _base_preta(w, h):
    """Vídeo preto mudo de 1 s w×h (par), reaproveitado por tamanho: fundo da timeline sem vídeo principal."""
    w, h = max(16, int(w)), max(16, int(h))
    w, h = w + (w % 2), h + (h % 2)
    pasta = os.path.join(tempfile.gettempdir(), "canivete_editor_bases")
    os.makedirs(pasta, exist_ok=True)
    saida = os.path.join(pasta, f"base_{w}x{h}.mp4")
    if not os.path.isfile(saida):
        tmp = saida + ".tmp.mp4"
        r = subprocess.run([ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
                            "-f", "lavfi", "-i", f"color=c=black:s={w}x{h}:r=30:d=1",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", tmp],
                           capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=60, creationflags=_creationflags())
        if r.returncode != 0 or not os.path.isfile(tmp):
            raise RuntimeError((r.stderr or "falha ao gerar a base").strip().splitlines()[-1])
        os.replace(tmp, saida)
    return saida


def _apagar_item(p):
    if os.path.isdir(p):
        shutil.rmtree(p, ignore_errors=True)
    else:
        try:
            os.remove(p)
        except OSError:
            pass


def limpar_previews():
    """Chamado ao abrir um vídeo novo: apaga os arquivos de sessão desta cópia do app, as pastas de cópias que já
    fecharam e sobras do formato antigo (tudo solto em canivete_editor). As prévias dos vídeos do projeto ficam na
    pasta de cache (manutencao_midia): reabrir o projeto não converte tudo de novo."""
    d = _work_dir()
    media_server.unregister_prefix(d)
    for nome in os.listdir(d):
        _apagar_item(os.path.join(d, nome))
    manutencao_midia()


def _limpar_temp_antigo():
    """%TEMP%/canivete_editor: pastas de cópias do app que já fecharam e sobras do formato antigo (tudo solto ali;
    arquivo ainda aberto por outra cópia não sai: o Windows não deixa)."""
    os.makedirs(_RAIZ_TEMP, exist_ok=True)
    dias = _cache_cfg()["dias"]
    agora = time.time()
    for nome in os.listdir(_RAIZ_TEMP):
        p = os.path.join(_RAIZ_TEMP, nome)
        if re.fullmatch(r"s[0-9]+", nome):
            if not _pid_vivo(int(nome[1:])):
                _apagar_item(p)
            continue
        try:
            idade = agora - os.path.getmtime(p)
        except OSError:
            continue
        if nome.startswith("m_"):   # prévia do formato antigo: ainda serve (vai para a pasta de cache quando usada)
            if idade < dias * 86400:
                continue
        elif idade < 12 * 3600:     # pode ser de uma cópia da versão anterior ainda aberta
            continue
        _apagar_item(p)


def _tamanho(p):
    if not os.path.isdir(p):
        return os.path.getsize(p)
    return sum(os.path.getsize(os.path.join(p, f)) for f in os.listdir(p))


def manutencao_midia():
    """Pasta de cache dos vídeos do projeto: sai o que não é usado há mais dias que o das Preferências e, passando
    do tamanho máximo, os menos usados primeiro (mesmas regras do cache de render)."""
    try:
        _limpar_temp_antigo()
    except Exception:
        pass
    cfg = _cache_cfg()
    raiz = _midia_dir()
    agora = time.time()
    guardadas = []
    for nome in os.listdir(raiz):
        p = os.path.join(raiz, nome)
        try:
            idade, tam = agora - os.path.getmtime(p), _tamanho(p)
        except OSError:
            continue
        if idade > cfg["dias"] * 86400:
            _apagar_item(p)
        else:
            guardadas.append((idade, tam, p))
    total = sum(t for _, t, _ in guardadas)
    for idade, tam, p in sorted(guardadas, reverse=True):   # mais antigas primeiro
        if total <= cfg["max_gb"] * 1024 ** 3:
            break
        _apagar_item(p)
        total -= tam
    return {"success": True, "total": total}


def limpar_midia():
    """Preferências → "Limpar todo o cache em disco": leva junto as prévias dos vídeos do projeto."""
    raiz = _midia_dir()
    liberado = 0
    for nome in os.listdir(raiz):
        p = os.path.join(raiz, nome)
        try:
            liberado += _tamanho(p)
        except OSError:
            pass
        _apagar_item(p)
    return liberado


def _pasta_midia(path):
    """Pasta de cache do vídeo (arquivo+data). Uma prévia antiga do %TEMP% vem junto (não converte de novo)."""
    nome = "m_" + hashlib.md5(f"{os.path.abspath(path)}|{os.path.getmtime(path)}".encode()).hexdigest()[:12]
    work = os.path.join(_midia_dir(), nome)
    velha = os.path.join(_RAIZ_TEMP, nome)
    if not os.path.isdir(work) and os.path.isdir(velha):
        try:
            shutil.move(velha, work)
        except Exception:
            shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work, exist_ok=True)
    return work


def _hevc_direto(info):
    """H.265 toca direto no painel? Só se a opção foi ligada (Preferências; padrão = converter), o teste do app
    passou neste PC (amostra em frontend/assets; veHevcTestar), é 8 bits 4:2:0 e não é maior que a qualidade das
    prévias. Padrão desligado: medido no editor, um H.265 exportado (quadro-chave a cada ~4 s) buscou 4x mais e
    travou 9x mais nos cortes que a prévia leve (quadro-chave a cada 0,5 s)."""
    pr = _prefs()
    if pr.get("hevcDireto") is not True or pr.get("hevcModo") != "direto":
        return False
    if info.get("pix_fmt") not in ("yuv420p", "yuvj420p"):
        return False
    lados = [x for x in (info.get("width"), info.get("height")) if x]
    return bool(lados) and min(lados) <= _cache_cfg()["lado"]


# Taxa da timeline CRAVADA (decisão do usuário, 2026-10-08): nunca a média de um vídeo de celular (59,18; 59,24...).
_TAXAS_NTSC = (24000 / 1001, 30000 / 1001, 60000 / 1001)
_TAXAS_INTEIRAS = (24.0, 25.0, 30.0, 50.0, 60.0)


def taxa_timeline(media, nominal=0.0):
    """Taxa padrão da timeline a partir do 1º vídeo: 23,976 / 29,97 / 59,94 só quando a fonte é CONSTANTE nessa taxa
    (câmera: média colada na NTSC, ±0,05%); qualquer outra (celular com taxa variável: 59,18 → 60; ~29,6 → 30) vai para
    a inteira mais próxima entre 24, 25, 30, 50 e 60. Os vídeos de fonte se adaptam a ela (filtro fps), nunca o contrário."""
    try:
        media = float(media or 0)
        nominal = float(nominal or 0)
    except (TypeError, ValueError):
        return 30.0
    if media <= 0:
        media = nominal if nominal > 0 else 30.0
    for n in _TAXAS_NTSC:
        if abs(media - n) / n <= 0.0005:
            return n
    return min(_TAXAS_INTEIRAS, key=lambda t: abs(t - media))


def _fps(txt):
    try:
        num, den = str(txt).split("/")
        return round(float(num) / float(den), 3) if float(den) else 0.0
    except Exception:
        try:
            return float(txt)
        except Exception:
            return 0.0


def _tem_alfa(pix_fmt, tags=None):
    """Vídeo com transparência (ProRes 4444, PNG/Animation no .mov, VP9 com alfa...)."""
    p = str(pix_fmt or "").lower()
    if p.startswith(("yuva", "rgba", "bgra", "argb", "abgr", "gbrap", "ya8", "ya16")):
        return True
    return str((tags or {}).get("alpha_mode") or (tags or {}).get("ALPHA_MODE") or "") == "1"   # VP8/VP9 no WebM


def _rotaciona_lados(rot):
    return abs(int(rot or 0)) % 180 == 90


def _tem_rotacao(info):
    return int((info or {}).get("rotation") or 0) % 360 != 0


def _probe_ffmpeg(path):
    """Plano B sem ffprobe: interpreta a saída de 'ffmpeg -i'."""
    import re
    r = subprocess.run([ffmpeg_path(), "-hide_banner", "-i", path], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=30, creationflags=_creationflags())
    txt = r.stderr or ""
    info = {"duration": 0.0, "has_video": False, "width": 0, "height": 0, "fps": 30.0, "vcodec": "",
            "pix_fmt": "", "rotation": 0, "has_audio": False, "acodec": "", "channels": 0, "bitrate": 0,
            "size": os.path.getsize(path)}
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", txt)
    if m:
        info["duration"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    linha_v = next((ln for ln in txt.splitlines() if "Video:" in ln and "attached pic" not in ln), "")
    if linha_v:
        info["has_video"] = True
        m = re.search(r"Video:\s*(\w+)", linha_v)
        info["vcodec"] = m.group(1) if m else ""
        m = re.search(r"\),\s*(\w+)\(|,\s*(yuv\w+|nv12|rgb\w*|gbr\w*|gray\w*)", linha_v)
        if m:
            info["pix_fmt"] = m.group(1) or m.group(2)
        info["alfa"] = _tem_alfa(info["pix_fmt"]) or "alpha_mode" in linha_v.lower()
        m = re.search(r"\b(\d{2,5})x(\d{2,5})\b", linha_v)
        if m:
            info["width"], info["height"] = int(m.group(1)), int(m.group(2))
        m = re.search(r"([\d.]+)\s*fps", linha_v)
        if m:
            info["fps"] = float(m.group(1))
    ma = re.search(r"Stream #\S+.*?Audio:\s*(\w+)", txt)
    if ma:
        info.update(has_audio=True, acodec=ma.group(1))
    mr = re.search(r"rotation of (-?[\d.]+)", txt)
    if mr:
        rot = int(float(mr.group(1)))
        info["rotation"] = rot
        if _rotaciona_lados(rot):
            info["width"], info["height"] = info["height"], info["width"]
    return info


_fps_cache = {}


def _fps_fonte(path):
    """Quadros por segundo nominais do vídeo (r_frame_rate), guardados por arquivo+data; 0 se não souber."""
    try:
        chave = (path, os.path.getmtime(path))
    except OSError:
        return 0.0
    if chave not in _fps_cache:
        fq = 0.0
        try:
            r = subprocess.run([ffprobe_path(), "-v", "error", "-select_streams", "v:0", "-show_entries",
                                "stream=r_frame_rate", "-of", "csv=p=0", path], capture_output=True, text=True,
                               timeout=20, creationflags=_creationflags())
            n, _, d = r.stdout.strip().partition("/")
            fq = float(n) / float(d or 1)
        except Exception:
            pass
        _fps_cache[chave] = fq if 1 <= fq <= 1000 else 0.0
    return _fps_cache[chave]


def probe(path):
    """Análise completa do vídeo com um único ffprobe (ou ffmpeg, se o ffprobe faltar)."""
    try:
        r = _probe_ffprobe(path)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        r = _probe_ffmpeg(path)
    # fps = média da fonte (o que o arquivo tem); fps_timeline = a taxa cravada que a timeline e a exportação usam
    r["fps_timeline"] = taxa_timeline(r.get("fps"), r.get("fps_nominal"))
    return r


def _probe_ffprobe(path):
    r = subprocess.run(
        [ffprobe_path(), "-v", "error", "-show_format", "-show_streams", "-of", "json", path],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=30, creationflags=_creationflags(),
    )
    data = json.loads(r.stdout or "{}")
    streams = data.get("streams", [])
    fmt = data.get("format", {})
    v = next((s for s in streams if s.get("codec_type") == "video"
              and not (s.get("disposition") or {}).get("attached_pic")), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)

    dur = 0.0
    for cand in (fmt.get("duration"), (v or {}).get("duration"), (a or {}).get("duration")):
        try:
            if cand and float(cand) > 0:
                dur = float(cand)
                break
        except Exception:
            pass

    rot = 0
    if v:
        try:
            rot = int((v.get("tags") or {}).get("rotate", 0))
        except Exception:
            rot = 0
        for sd in v.get("side_data_list") or []:
            if "rotation" in sd:
                try:
                    rot = int(sd["rotation"])
                except Exception:
                    pass
    w, h = (v or {}).get("width", 0), (v or {}).get("height", 0)
    if _rotaciona_lados(rot):
        w, h = h, w

    fps = _fps((v or {}).get("avg_frame_rate")) or _fps((v or {}).get("r_frame_rate")) or 30.0
    if dur <= 0 and v:
        dur = _duration_by_counting_frames(path, fps)
    return {
        "duration": dur,
        "has_video": v is not None,
        "width": w,
        "height": h,
        "fps": fps if 1 <= fps <= 240 else 30.0,
        "fps_nominal": _fps((v or {}).get("r_frame_rate")),
        "vcodec": (v or {}).get("codec_name", ""),
        "pix_fmt": (v or {}).get("pix_fmt", ""),
        "alfa": _tem_alfa((v or {}).get("pix_fmt"), (v or {}).get("tags")),
        # cor da fonte (a saída leva as mesmas marcas; sem elas o player chuta e a cor pode mudar)
        "color_space": (v or {}).get("color_space", ""),
        "color_primaries": (v or {}).get("color_primaries", ""),
        "color_transfer": (v or {}).get("color_transfer", ""),
        "color_range": (v or {}).get("color_range", ""),
        "rotation": rot,
        "has_audio": a is not None,
        "acodec": (a or {}).get("codec_name", ""),
        "channels": (a or {}).get("channels", 0),
        "bitrate": int(fmt.get("bit_rate") or 0),
        "size": int(fmt.get("size") or 0),
    }


def _duration_by_counting_frames(path, fps):
    """Fallback para streams elementares, como .m2v, que podem nao trazer duração no container."""
    try:
        r = subprocess.run(
            [ffprobe_path(), "-v", "error", "-count_frames", "-select_streams", "v:0",
             "-show_entries", "stream=nb_read_frames,nb_read_packets", "-of", "json", path],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=300, creationflags=_creationflags(),
        )
        data = json.loads(r.stdout or "{}")
        stream = (data.get("streams") or [{}])[0]
        frames = int(stream.get("nb_read_frames") or stream.get("nb_read_packets") or 0)
        if frames > 0 and fps > 0:
            return frames / fps
    except Exception:
        pass
    return 0.0


def _navegador_toca(path, info):
    ext = os.path.splitext(path)[1].lower()
    if ext not in _NAVEGADOR_CONTAINERS:
        return False
    if _tem_rotacao(info):
        return False
    if info["vcodec"] == "hevc":
        if not _hevc_direto(info):
            return False
    elif info["vcodec"] not in _NAVEGADOR_VCODECS:
        return False
    if info["vcodec"] == "h264" and info["pix_fmt"] not in ("yuv420p", "yuvj420p"):
        return False  # H.264 10-bit / 4:2:2 não decodifica no navegador
    # Maior que a qualidade das prévias (4K): prévia leve. Medido (teste 4K, 2026-10-01): H.264 4K direto travou a
    # página 130–200 ms ~1 s antes de cada corte (a reserva buscando e decodificando o GOP em 4K); a prévia 1080p
    # com quadro-chave a cada 0,5 s tocou limpa com corte e dissolução a cada 2 s.
    lados = [x for x in (info.get("width"), info.get("height")) if x]
    if lados and min(lados) > _cache_cfg()["lado"]:
        return False
    if info["has_audio"] and info["acodec"] not in _NAVEGADOR_ACODECS:
        return False
    return True


def _run_progress(cmd, total, on_pct, stop_event=None, proc_holder=None):
    """Roda ffmpeg com -progress pipe:1 e chama on_pct(0-100). Retorna (rc, stderr_tail)."""
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace", creationflags=_creationflags(),
    )
    if proc_holder is not None:
        proc_holder(proc)
    err_tail = []

    def _drain():
        for ln in proc.stderr:
            err_tail.append(ln.rstrip())
            if len(err_tail) > 40:
                err_tail.pop(0)

    t = threading.Thread(target=_drain, daemon=True)
    t.start()
    ultimo = -1
    for ln in proc.stdout:
        if stop_event is not None and stop_event.is_set():
            proc.kill()
            break
        if ln.startswith("out_time_us=") or ln.startswith("out_time_ms="):
            try:
                seg = int(ln.split("=", 1)[1]) / 1_000_000
            except ValueError:
                continue
            if total > 0:
                pct = max(0, min(99, int(seg * 100 / total)))
                if pct != ultimo:
                    ultimo = pct
                    on_pct(pct)
    proc.wait()
    t.join(timeout=2)
    return proc.returncode, "\n".join(err_tail)


# ─────────────────────────── pré-visualização ───────────────────────────

def gerar_thumbs(path, duration, outdir, count):
    """Gera miniaturas em paralelo (seek rápido por keyframe). Retorna [{t, url}]."""
    if duration <= 0 or count <= 0:
        return []
    step = duration / count
    tempos = [min(duration - 0.05, step * i + step / 2) for i in range(count)]

    def _um(i_t):
        i, t = i_t
        out = os.path.join(outdir, f"th_{i:04d}.jpg")
        try:
            subprocess.run(
                [ffmpeg_path(), "-y", "-v", "error", "-skip_frame", "nokey", "-ss", f"{t:.3f}", "-i", path,
                 "-frames:v", "1", "-vf", "scale=-2:96", "-q:v", "6", out],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=30, creationflags=_creationflags(),
            )
        except Exception:
            pass
        if not os.path.exists(out):
            # fallback sem skip_frame (alguns codecs não suportam)
            try:
                subprocess.run(
                    [ffmpeg_path(), "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", path,
                     "-frames:v", "1", "-vf", "scale=-2:96", "-q:v", "6", out],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=30, creationflags=_creationflags(),
                )
            except Exception:
                pass
        if os.path.exists(out):
            return {"t": round(t, 3), "url": media_server.register(out), "arq": out}
        return None

    with ThreadPoolExecutor(max_workers=min(8, (os.cpu_count() or 4))) as ex:
        res = list(ex.map(_um, enumerate(tempos)))
    return [r for r in res if r]


def gerar_peaks(path, duration):
    """Forma de onda (pico por bloco) com numpy. Resolução ~40 pontos/segundo."""
    try:
        import numpy as np
    except Exception:
        return []
    try:
        r = subprocess.run(
            [ffmpeg_path(), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "4000",
             "-f", "s16le", "pipe:1"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=900, creationflags=_creationflags(),
        )
        if not r.stdout:
            return []
        pcm = np.frombuffer(r.stdout, dtype=np.int16)
        n = int(min(20000, max(800, duration * 40)))
        bloco = max(1, len(pcm) // n)
        usable = pcm[: bloco * n] if len(pcm) >= bloco * n else np.pad(pcm, (0, bloco * n - len(pcm)))
        picos = np.abs(usable.reshape(n, bloco).astype(np.int32)).max(axis=1) / 32768.0
        # compressão leve para falas baixas ficarem visíveis
        picos = np.sqrt(np.clip(picos, 0, 1))
        return [round(float(x), 3) for x in picos]
    except Exception:
        return []


# Prévia leve: lado CURTO até `lado` px (Preferências → Qualidade das prévias: 1080/720/540; vídeo em pé
# 2160x3840 → 1080x1920; deitado 4K → 1920x1080). Limitar a ALTURA deixava um 4K vertical borrado (405x720).
def _proxy_escala(lado=1080):
    return f"'if(gte(iw,ih),-2,min({lado},iw))':'if(gte(iw,ih),min({lado},ih),-2)'"


def _nome_proxy(lado, alfa=False):
    # com transparência: WebM VP9 com alfa (o H.264 não tem alfa; o que era transparente ficava preto)
    if alfa:
        return "proxy_alfa_v1.webm" if lado == 1080 else f"proxy_alfa_v1_{lado}.webm"
    return "proxy_v2.mp4" if lado == 1080 else f"proxy_v2_{lado}.mp4"


def _proxy_junto(path, lado, alfa=False):
    """Prévia leve na pasta Proxy ao lado do vídeo (Preferências › proxy junto aos vídeos; desligado por padrão)."""
    pasta, nome = os.path.split(os.path.abspath(path))
    return os.path.join(pasta, "Proxy", f"{os.path.splitext(nome)[0]}_proxy{lado}" + (".webm" if alfa else ".mp4"))


def _arquivo_proxy(path, work, lado, alfa=False):
    """Onde está (ou vai ficar) a prévia leve: uma já feita — no cache ou na pasta Proxy, mais nova que o vídeo — ou
    onde a nova vai: Proxy ao lado do vídeo com a opção ligada, senão o cache."""
    cache = os.path.join(work, _nome_proxy(lado, alfa))
    junto = _proxy_junto(path, lado, alfa)
    if os.path.isfile(cache):
        return cache
    try:
        if os.path.isfile(junto) and os.path.getmtime(junto) >= os.path.getmtime(path):
            return junto
    except OSError:
        pass
    return junto if _cache_cfg()["junto"] else cache


def _instalar_proxy(tmp, proxy, work):
    """Prévia convertida (no cache) vai para o lugar final; a pasta Proxy sem permissão (ou disco fora) fica no cache."""
    try:
        if os.path.normcase(os.path.dirname(os.path.abspath(proxy))) != os.path.normcase(os.path.abspath(work)):
            os.makedirs(os.path.dirname(proxy), exist_ok=True)
            shutil.move(tmp, proxy)   # outro disco: os.replace não atravessa volumes
        else:
            os.replace(tmp, proxy)
        return proxy
    except OSError as e:
        print("[proxy] pasta Proxy indisponível, fica no cache:", e)
        cache = os.path.join(work, os.path.basename(proxy))
        _apagar_item(proxy)
        os.replace(tmp, cache)
        return cache


_proxy_dims = {}


def _proxy_pronto(path):
    """Prévia leve H.264 já feita deste vídeo (qualquer qualidade, a maior primeiro): (arquivo, w, h) ou None."""
    try:
        work = _pasta_midia(path)
        mt = os.path.getmtime(path)
    except OSError:
        return None
    lados = sorted({_cache_cfg()["lado"], 1080, 720, 540}, reverse=True)
    for lado in lados:
        for arq in (os.path.join(work, _nome_proxy(lado)), _proxy_junto(path, lado)):
            try:
                if not os.path.isfile(arq) or (arq != os.path.join(work, _nome_proxy(lado)) and os.path.getmtime(arq) < mt):
                    continue
                chave = (arq, os.path.getmtime(arq))
                if chave not in _proxy_dims:
                    i = _probe_ffprobe(arq)
                    _proxy_dims[chave] = (int(i.get("width") or 0), int(i.get("height") or 0))
                w, h = _proxy_dims[chave]
                if w > 1 and h > 1:
                    return arq, w, h
            except Exception:
                continue
    return None


def _camada_no_proxy(c):
    """Prévia renderizada: o clipe de vídeo pesado (8K/4K do celular) lê a prévia leve dele em vez do original quando
    ela basta — a camada nunca aparece maior que a prévia leve. Escala e âncora passam para px da prévia; os efeitos
    medem em % da mídia (mw/mh). A exportação final continua lendo o original."""
    if c["tipo"] != "video" or not c["path"] or "sx" in c["kf"] or "sy" in c["kf"]:
        return
    px = _proxy_pronto(c["path"])
    if not px:
        return
    arq, pw, ph = px
    r = c["mw"] / pw
    if r < 1.2 or abs(c["mw"] / c["mh"] - pw / ph) > 0.02:
        return
    maior = max([c["sc"]] + [p[1] for p in c["kf"].get("sc", [])])
    if maior * r > 1.05:
        return
    c["path"] = arq
    c["sc"] *= r
    if "sc" in c["kf"]:
        c["kf"]["sc"] = [(t, v * r, i, bz) for t, v, i, bz in c["kf"]["sc"]]
    c["mw"], c["mh"] = pw, ph
    c["ox"] /= r
    c["oy"] /= r


def _camada_reduz_na_placa(c):
    """Clipe bem maior que o tamanho em que aparece (8K do celular num quadro 1080): a placa decodifica e reduz ao
    tamanho máximo da camada (+10% de folga) antes de baixar o quadro; girar e o resto do grafo trabalham no quadro
    pequeno. Escala e âncora passam para px do quadro reduzido; os efeitos medem em % da mídia (mw/mh). Antes, o 8K
    baixava inteiro e o processador girava e reduzia (trecho de 9,5 s: CPU 95 s mesmo decodificando na placa)."""
    if c["tipo"] != "video" or not c["path"] or "sx" in c["kf"] or "sy" in c["kf"] or c.get("gpu_red"):
        return
    maior = max([c["sc"]] + [p[1] for p in c["kf"].get("sc", [])]) * 1.1
    if maior >= 0.6:
        return
    try:
        info = probe(c["path"])
    except Exception:
        return
    if info.get("vcodec") not in ("h264", "hevc", "vp9", "av1") or info.get("pix_fmt") not in (
            "yuv420p", "yuvj420p", "yuv420p10le", "nv12", "p010le"):
        return
    rot = int(info.get("rotation") or 0) % 360
    giro = {270: "transpose=clock", 90: "transpose=cclock", 180: "hflip,vflip"}.get(rot)
    if rot and not giro:
        return
    tw, th = max(2, int(round(c["mw"] * maior / 2)) * 2), max(2, int(round(c["mh"] * maior / 2)) * 2)
    r = c["mw"] / tw
    gw, gh = (th, tw) if rot in (90, 270) else (tw, th)
    fmt_g = "p010le" if "10" in str(info.get("pix_fmt")) else "nv12"
    c["gpu_red"] = (gw, gh, giro, fmt_g)
    c["sc"] *= r
    if "sc" in c["kf"]:
        c["kf"]["sc"] = [(t, v * r, i, bz) for t, v, i, bz in c["kf"]["sc"]]
    c["mw"], c["mh"] = tw, th
    c["ox"] /= r
    c["oy"] /= r


def gerar_proxy(path, info, out, on_pct, stop_event=None, thumbs_dir=None, thumbs_n=0, lado=1080):
    """Gera a prévia leve e, na MESMA passada, as miniaturas da timeline (decodificar um 4K HEVC
    várias vezes em paralelo era o que mais atrasava a abertura). Com placa NVIDIA tudo roda na GPU
    (decodifica, reduz e codifica); se falhar, refaz pelo processador. Retorna (ok, err, thumbs)."""
    fps_gop = max(1, int(round(info["fps"] / 2)))  # keyframe a cada ~0,5s → scrub preciso
    dur = max(0.1, info["duration"])
    rotacionado = _tem_rotacao(info)
    _PROXY_ESCALA = _proxy_escala(lado)
    passo = dur / thumbs_n if thumbs_n else 0
    th_saida = []
    if thumbs_n and thumbs_dir:
        # um quadro a cada `passo`, começando no meio do primeiro intervalo (mesmos tempos de gerar_thumbs)
        th_saida = ["-map", "[t]", "-q:v", "6", "-fps_mode", "passthrough", os.path.join(thumbs_dir, "th_%04d.jpg")]
    th_filtro = f";[b]fps=fps={1 / passo:.6f}:start_time={passo / 2:.4f},scale=-2:96[t]" if th_saida else ""
    comum = ["-map", "0:a:0?", "-g", str(fps_gop), "-c:a", "aac", "-b:a", "128k", "-ac", "2",
             "-metadata:s:v:0", "rotate=0",
             "-movflags", "+faststart", out] + th_saida

    def _cpu():
        return [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", path,
                "-filter_complex", f"[0:v:0]scale={_PROXY_ESCALA}:flags=fast_bilinear,format=yuv420p"
                + (",split[p][b]" + th_filtro if th_saida else "[p]"),
                "-map", "[p]", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "fastdecode", "-crf", "25"] + comum

    def _cuda():
        return [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1",
                "-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-i", path,
                "-filter_complex", f"[0:v:0]scale_cuda={_PROXY_ESCALA}:format=yuv420p,hwdownload,format=yuv420p"
                + (",split[p][b]" + th_filtro if th_saida else "[p]"),
                "-map", "[p]", "-c:v", "h264_nvenc", "-preset", "p1", "-rc", "vbr", "-cq", "24", "-b:v", "0",
                "-bf", "0"] + comum

    def _cuda_girado():
        # vídeo em pé do celular (rotação nos metadados): a GPU decodifica e reduz o 4K; só o quadro já
        # pequeno desce para o processador e é girado ali (2,7x mais rápido que tudo no processador)
        rot = int(info.get("rotation") or 0) % 360
        giro = {270: "transpose=clock", 90: "transpose=cclock", 180: "hflip,vflip"}.get(rot)
        if not giro:
            return None
        # rotação zerada na entrada: com -noautorotate a matriz do original ia para a prévia e girava de novo
        return [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-display_rotation:v:0", "0",
                "-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-i", path,
                "-filter_complex", f"[0:v:0]scale_cuda={_PROXY_ESCALA}:format=yuv420p,hwdownload,format=yuv420p,{giro}"
                + (",split[p][b]" + th_filtro if th_saida else "[p]"),
                "-map", "[p]", "-c:v", "h264_nvenc", "-preset", "p1", "-rc", "vbr", "-cq", "24", "-b:v", "0",
                "-bf", "0"] + comum

    def _alfa():
        # VP9 com alfa (yuva420p) no WebM: o navegador toca com a transparência. Só no processador (o NVENC não
        # tem alfa); realtime/cpu-used 8 para a conversão não demorar. As miniaturas saem sobre preto.
        return [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", path,
                "-filter_complex", f"[0:v:0]scale={_PROXY_ESCALA}:flags=fast_bilinear,format=yuva420p"
                + (",split[p][b]" + th_filtro if th_saida else "[p]"),
                "-map", "[p]", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
                "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "32", "-b:v", "0",
                "-map", "0:a:0?", "-g", str(fps_gop), "-c:a", "libopus", "-b:a", "128k", "-ac", "2",
                "-f", "webm", out] + th_saida

    gpu = _detectar_hw_encoder() == "h264_nvenc"
    if info.get("alfa"):
        tentativas = [_alfa]
    else:
        tentativas = ([_cuda_girado] if rotacionado else [_cuda]) if gpu else []
        tentativas.append(_cpu)
    rc, err = 1, ""
    for fazer in tentativas:
        cmd = fazer()
        if cmd is None:
            continue
        rc, err = _run_progress(cmd, dur, on_pct, stop_event)
        if rc == 0 or (stop_event is not None and stop_event.is_set()):
            break
    ok = rc == 0 and os.path.exists(out)
    thumbs = []
    if ok and th_saida:
        for i in range(thumbs_n):
            arq = os.path.join(thumbs_dir, f"th_{i + 1:04d}.jpg")
            if os.path.exists(arq):
                thumbs.append({"t": round(min(dur - 0.05, passo * i + passo / 2), 3), "url": media_server.register(arq), "arq": arq})
    return ok, err, thumbs


def _preparar_audio(path, info, work, emit, stop_event):
    """Arquivo só de áudio: timeline com forma de onda, monitor preto; quadro padrão 1280x720."""
    info = {**info, "width": 1280, "height": 720, "fps": 30.0, "audio_only": True}
    _conformar_audio(path, work)
    ext = os.path.splitext(path)[1].lower()
    direto = ext in _NAVEGADOR_AUDIO
    emit({"stage": "info", "path": path, "file_name": os.path.basename(path), "needs_proxy": not direto, **info})
    t = threading.Thread(target=lambda: emit({"stage": "peaks", "peaks": gerar_peaks(path, info["duration"])}), daemon=True)
    t.start()
    if direto:
        emit({"stage": "video", "url": media_server.register(path), "proxy": False})
    else:
        prev = os.path.join(work, "previa.m4a")
        cmd = [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", path,
               "-vn", "-c:a", "aac", "-b:a", "160k", "-ac", "2", prev]
        rc, err = _run_progress(cmd, info["duration"], lambda p: emit({"stage": "proxy", "pct": p}), stop_event)
        if stop_event is not None and stop_event.is_set():
            return
        if rc != 0 or not os.path.exists(prev):
            emit({"stage": "error", "error": "Falha ao preparar o áudio: " + (err.splitlines()[-1] if err else "?")})
            return
        emit({"stage": "video", "url": media_server.register(prev), "proxy": True})
    t.join()
    emit({"stage": "done"})


def preparar(path, emit, stop_event=None):
    """
    Prepara o vídeo para o editor, emitindo eventos progressivos:
      {stage:'info', ...}  → a UI já monta a timeline
      {stage:'video', url} → player pronto
      {stage:'proxy', pct} → progresso do proxy
      {stage:'peaks', peaks}
      {stage:'thumbs', thumbs}
      {stage:'done'} | {stage:'error', error}
    """
    if not os.path.isfile(path):
        emit({"stage": "error", "error": "Arquivo não encontrado."})
        return
    aberto = path   # o que o usuário abriu (numa imagem, a mídia de verdade é a base preta)
    if _eh_imagem(path):
        try:
            path = _base_imagem(path)
        except Exception as e:
            emit({"stage": "error", "error": f"Não foi possível abrir a imagem: {e}"})
            return
    ext = os.path.splitext(path)[1].lower()
    if ext not in FORMATOS_ENTRADA:
        emit({"stage": "error", "error": f"Formato não suportado: {ext or 'sem extensão'}"})
        return
    try:
        info = probe(path)
    except Exception as e:
        emit({"stage": "error", "error": f"Não foi possível analisar o vídeo: {e}"})
        return
    if info["duration"] <= 0 or not (info["has_video"] or info["has_audio"]):
        emit({"stage": "error", "error": "Arquivo sem vídeo/áudio ou com duração inválida."})
        return

    limpar_previews()
    work = os.path.join(_work_dir(), uuid.uuid4().hex[:10])
    os.makedirs(work, exist_ok=True)

    if not info["has_video"]:
        _preparar_audio(path, info, work, emit, stop_event)
        return

    direto = _navegador_toca(path, info)
    if info["has_audio"]:
        _conformar_audio(path, work)
    emit({"stage": "info", "path": aberto, "file_name": os.path.basename(aberto),
          "needs_proxy": not direto, **info, "base_imagem": aberto != path})

    # Forma de onda em paralelo; miniaturas em paralelo (toca direto) ou junto com a prévia leve
    count = int(min(180, max(24, info["duration"] / 2)))

    def _thumbs():
        emit({"stage": "thumbs", "thumbs": gerar_thumbs(path, info["duration"], work, count)})

    def _peaks():
        if info["has_audio"]:
            emit({"stage": "peaks", "peaks": gerar_peaks(path, info["duration"])})

    threads = [threading.Thread(target=_peaks, daemon=True)]
    if direto:
        threads.append(threading.Thread(target=_thumbs, daemon=True))
    for t in threads:
        t.start()

    if direto:
        emit({"stage": "video", "url": media_server.register(path), "proxy": False})
    else:
        # prévia na pasta de cache do vídeo (a mesma de preparar_midia): reabrir o projeto não converte de novo.
        # Medido (teste 4K): reconverter o vídeo aberto levava ~13 s a cada abertura de um projeto 4K.
        lado = _cache_cfg()["lado"]
        pasta = _pasta_midia(path)
        try:
            os.utime(pasta)
        except OSError:
            pass
        proxy = _arquivo_proxy(path, pasta, lado, info.get("alfa"))
        thumbs = None
        if os.path.isfile(proxy):
            ok, err = True, ""
        else:
            tmp = os.path.join(pasta, f"{os.path.basename(proxy)}.{os.getpid()}.tmp{os.path.splitext(proxy)[1]}")
            with _VAGAS_PROXY.vaga(os.path.abspath(path), 0):
                ok, err, thumbs = gerar_proxy(path, info, tmp, lambda p: emit({"stage": "proxy", "pct": p}), stop_event,
                                              thumbs_dir=pasta, thumbs_n=count, lado=lado)
            if ok:
                proxy = _instalar_proxy(tmp, proxy, pasta)
            else:
                _apagar_item(tmp)
        if stop_event is not None and stop_event.is_set():
            return
        if ok:
            emit({"stage": "video", "url": media_server.register(proxy), "proxy": True})
            if thumbs:
                th = _guardar_thumbs(pasta, lado, thumbs)
            else:
                th = _thumbs_guardadas(pasta, lado) or _thumbs_guardadas(pasta, "fonte")
                if th is None:
                    th = _guardar_thumbs(pasta, lado, gerar_thumbs(proxy, info["duration"], pasta, count))
            emit({"stage": "thumbs", "thumbs": th})
        else:
            emit({"stage": "error", "error": "Falha ao gerar pré-visualização: " + (err.splitlines()[-1] if err else "?")})
            return

    for t in threads:
        t.join()
    emit({"stage": "done"})


class _Vagas:
    """Poucas vagas para trabalho pesado, atendidas por PRIORIDADE (0 = urgente) e depois por ordem de chegada.
    Um semáforo comum acorda quem chegar primeiro por sorte: ao abrir um projeto com 30 vídeos no painel,
    o único que está na timeline podia ser o último a ganhar prévia (monitor preto por minutos)."""

    def __init__(self, n):
        self._cv = threading.Condition()
        self._livres = n
        self._fila = {}    # chave -> [prioridade, ordem]
        self._ordem = 0

    def priorizar(self, chave):
        with self._cv:
            if chave in self._fila:
                self._fila[chave][0] = 0
                self._cv.notify_all()

    @contextlib.contextmanager
    def vaga(self, chave, prioridade=1):
        with self._cv:
            self._ordem += 1
            eu = [prioridade, self._ordem]
            while chave in self._fila:   # mesmo arquivo pedido duas vezes: espera o anterior
                self._cv.wait()
            self._fila[chave] = eu
            # prioridade 2 (prévia no fundo de vídeo que só está no painel) deixa sempre uma vaga livre: o vídeo
            # solto na timeline não espera a conversão de outro terminar
            while (self._livres <= (1 if eu[0] >= 2 else 0)) or min(self._fila.values()) is not eu:
                self._cv.wait()
            del self._fila[chave]
            self._livres -= 1
            self._cv.notify_all()
        try:
            yield
        finally:
            with self._cv:
                self._livres += 1
                self._cv.notify_all()


# miniaturas, áudio e prévias dos vídeos do projeto: no máximo 2 de cada vez (importar 40 vídeos não trava o PC),
# os que estão na timeline primeiro
_VAGAS_EXTRAS = _Vagas(2)
_VAGAS_PROXY = _Vagas(2)


_travas_proxy: dict = {}
_travas_proxy_lock = threading.Lock()


def _trava_proxy(proxy):
    """Uma conversão por arquivo de prévia (dentro desta cópia do app)."""
    with _travas_proxy_lock:
        return _travas_proxy.setdefault(os.path.abspath(proxy), threading.Lock())


def priorizar_midia(path):
    """O vídeo foi para a timeline enquanto esperava na fila: passa na frente dos que só estão no painel."""
    chave = os.path.abspath(path)
    _VAGAS_PROXY.priorizar(chave)
    _VAGAS_EXTRAS.priorizar(chave + "|audio")
    _VAGAS_EXTRAS.priorizar(chave + "|thumbs")


def _thumbs_guardadas(work, tipo):
    """Miniaturas já feitas deste vídeo (thumbs_<tipo>.json): reabrir o projeto não extrai tudo de novo."""
    try:
        with open(os.path.join(work, f"thumbs_{tipo}.json"), encoding="utf-8") as f:
            itens = json.load(f)
        arqs = [os.path.join(work, x["arq"]) for x in itens]
        if itens and all(os.path.isfile(a) for a in arqs):
            return [{"t": x["t"], "url": media_server.register(a)} for x, a in zip(itens, arqs)]
    except Exception:
        pass
    return None


def _guardar_thumbs(work, tipo, thumbs):
    try:
        itens = [{"t": x["t"], "arq": os.path.basename(x["arq"])} for x in thumbs if x.get("arq")]
        if itens:
            with open(os.path.join(work, f"thumbs_{tipo}.json"), "w", encoding="utf-8") as f:
                json.dump(itens, f)
    except Exception:
        pass
    return [{"t": x["t"], "url": x["url"]} for x in thumbs]


def preparar_midia(path, emit, stop_event=None, prioridade=1, leve=False):
    """
    Outro vídeo do projeto (além do aberto): mesma preparação, sem limpar a sessão nem mexer no áudio da fonte
    principal. Cada vídeo tem o seu áudio conformado (como os .cfa do Premiere; adicionar_audio) e a sua prévia.
      {stage:'info', ...} → {stage:'audio', url, quadros, peaks} → {stage:'video', url, proxy} → {stage:'thumbs'}
      → {stage:'done'} | {stage:'error', error}
    leve = vídeo só no painel (não está na timeline): se ele precisaria de prévia leve e ela ainda não existe, só
    lê os dados e faz as miniaturas ({stage:'info', leve: true}); a prévia sai quando ele for usado (a página pede
    de novo, sem `leve`). Abrir um projeto com 30 vídeos no painel não converte os 30.
    """
    if not os.path.isfile(path):
        emit({"stage": "error", "error": "Arquivo não encontrado."})
        return
    try:
        info = probe(path)
    except Exception as e:
        emit({"stage": "error", "error": f"Não foi possível analisar o vídeo: {e}"})
        return
    if info["duration"] <= 0 or not info["has_video"]:
        emit({"stage": "error", "error": "Arquivo sem vídeo ou com duração inválida."})
        return
    chave = os.path.abspath(path)
    work = _pasta_midia(path)
    try:
        os.utime(work)   # usada agora: não entra na limpeza das antigas
    except OSError:
        pass
    lado = _cache_cfg()["lado"]
    direto = _navegador_toca(path, info)
    proxy = _arquivo_proxy(path, work, lado, info.get("alfa"))
    count = int(min(180, max(24, info["duration"] / 2)))
    if leve and not direto and not os.path.isfile(proxy):
        emit({"stage": "info", "needs_proxy": True, "leve": True, **info})
        th = _thumbs_guardadas(work, "fonte")
        if th is None:
            with _VAGAS_EXTRAS.vaga(chave + "|thumbs", prioridade):
                th = _guardar_thumbs(work, "fonte", gerar_thumbs(path, info["duration"], work, count))
        emit({"stage": "thumbs", "thumbs": th})
        emit({"stage": "done", "leve": True})
        return
    emit({"stage": "info", "needs_proxy": not direto, **info})

    def _audio():
        if info["has_audio"]:
            with _VAGAS_EXTRAS.vaga(chave + "|audio", prioridade):
                r = adicionar_audio(path)
            if r.get("success"):
                emit({"stage": "audio", "url": r["url"], "quadros": r["quadros"], "peaks": r["peaks"]})

    ta = threading.Thread(target=_audio, daemon=True)
    ta.start()
    if direto:
        emit({"stage": "video", "url": media_server.register(path), "proxy": False})
        th = _thumbs_guardadas(work, "fonte")
        if th is None:
            with _VAGAS_EXTRAS.vaga(chave + "|thumbs", prioridade):
                th = _guardar_thumbs(work, "fonte", gerar_thumbs(path, info["duration"], work, count))
        emit({"stage": "thumbs", "thumbs": th})
    else:
        ok, err, thumbs = True, "", None
        if not os.path.isfile(proxy):
            # o mesmo vídeo pedido de novo (estava fazendo a prévia no fundo e foi para a timeline): espera a
            # conversão que já anda — passando-a na frente — em vez de converter duas vezes ao mesmo tempo
            if prioridade == 0:
                _VAGAS_PROXY.priorizar(chave)
            with _trava_proxy(proxy):
                if not os.path.isfile(proxy):
                    # por cópia do app: duas abrindo o mesmo vídeo não se atropelam; converte no cache e só a prévia
                    # pronta vai para a pasta Proxy (o sync da nuvem não pega o arquivo pela metade)
                    tmp = os.path.join(work, f"{os.path.basename(proxy)}.{os.getpid()}.tmp{os.path.splitext(proxy)[1]}")
                    with _VAGAS_PROXY.vaga(chave, prioridade):   # 2 conversões por vez (os que tocam direto não esperam)
                        ok, err, thumbs = gerar_proxy(path, info, tmp, lambda p: emit({"stage": "proxy", "pct": p}),
                                                      stop_event, thumbs_dir=work, thumbs_n=count, lado=lado)
                    if ok:
                        proxy = _instalar_proxy(tmp, proxy, work)   # interrompida no meio não vira prévia "pronta" quebrada
                    else:
                        _apagar_item(tmp)
        if stop_event is not None and stop_event.is_set():
            return
        if not ok:
            emit({"stage": "error", "error": "Falha ao gerar pré-visualização: " + (err.splitlines()[-1] if err else "?")})
            return
        emit({"stage": "video", "url": media_server.register(proxy), "proxy": True})
        if thumbs:
            th = _guardar_thumbs(work, lado, thumbs)
        else:
            th = _thumbs_guardadas(work, lado) or _thumbs_guardadas(work, "fonte")
            if th is None:
                th = _guardar_thumbs(work, lado, gerar_thumbs(proxy, info["duration"], work, count))
        emit({"stage": "thumbs", "thumbs": th})
    ta.join()
    emit({"stage": "done"})


# ─────────────────────────── clipe invertido (Reverse Speed) ───────────────────────────

def inverter_midia(path, a, b, on_pct=None, stop_event=None):
    """Cópia do trecho [a, b] da mídia tocando de trás para frente (instante r da cópia = fonte b - r). O navegador
    não toca vídeo ao contrário: o clipe invertido do editor passa a usar esta cópia como uma mídia comum.
    O filtro reverse guarda o trecho inteiro na memória: o vídeo é invertido em pedaços de até ~300 MB de quadros
    (do último para o primeiro) e juntado sem recodificar; o áudio sai inteiro com areverse.
    Qualidade de exportação (H.264 CRF 16; com transparência, ProRes 4444). Retorna {success, path} ou {error}."""
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo não encontrado."}
    info = probe(path)
    dur = info["duration"]
    a, b = max(0.0, float(a)), min(dur, float(b)) if dur > 0 else float(b)
    if b - a < 0.04:
        return {"success": False, "error": "Trecho curto demais para inverter."}
    work = _pasta_midia(path)
    so_audio = not info["has_video"]
    alfa = bool(info.get("alfa"))
    ext = ".wav" if so_audio else ".mov" if alfa else ".mp4"
    out = os.path.join(work, f"rev_{a:.3f}_{b:.3f}{ext}")
    if os.path.isfile(out):
        return {"success": True, "path": out}
    ff = ffmpeg_path()
    base = [ff, "-y", "-v", "error", "-nostats"]
    pct = on_pct or (lambda p: None)

    def _rodar(cmd):
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           creationflags=_creationflags())
        return r.returncode, (r.stderr or "").strip()

    if so_audio:
        tmp = out + ".tmp.wav"
        rc, err = _rodar(base + ["-ss", _tempo_ffmpeg(a), "-t", _tempo_ffmpeg(b - a), "-i", path, "-vn",
                                 "-af", "areverse", "-c:a", "pcm_s16le", tmp])
        if rc != 0 or not os.path.isfile(tmp):
            _apagar_item(tmp)
            return {"success": False, "error": err.splitlines()[-1] if err else "Falha ao inverter o áudio."}
        os.replace(tmp, out)
        pct(100)
        return {"success": True, "path": out}

    fps = info["fps"] or 30.0
    w, h = max(2, info["width"] or 1920), max(2, info["height"] or 1080)
    # pedaço com um número inteiro de quadros e no máximo ~300 MB de quadros na memória (4K 30p: ~1 s)
    quadros = max(4, min(int(fps * 4), int(300e6 / (w * h * (4 if alfa else 1.5)))))
    passo = quadros / fps
    pasta = os.path.join(work, f"rev_{uuid.uuid4().hex[:8]}")
    os.makedirs(pasta, exist_ok=True)
    gop = str(max(1, int(round(fps / 2))))   # quadro-chave a cada ~0,5 s: busca rápida no editor
    if alfa:
        venc = ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"]
    else:
        venc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-g", gop, "-pix_fmt", "yuv420p"]
    try:
        pedacos, n = [], max(1, math.ceil((b - a) / passo - 1e-6))
        for k in range(n):
            if stop_event is not None and stop_event.is_set():
                return {"success": False, "error": "Cancelado."}
            ini = a + k * passo
            arq = os.path.join(pasta, f"p{k:05d}{'.mov' if alfa else '.mp4'}")
            rc, err = _rodar(base + ["-ss", _tempo_ffmpeg(ini), "-t", _tempo_ffmpeg(min(passo, b - ini)), "-i", path,
                                     "-an", "-vf", f"fps={fps:.6f},reverse", *venc, arq])
            if rc != 0 or not os.path.isfile(arq):
                return {"success": False, "error": err.splitlines()[-1] if err else "Falha ao inverter o vídeo."}
            pedacos.append(arq)
            pct(int((k + 1) * 90 / n))
        lista = os.path.join(pasta, "lista.txt")
        with open(lista, "w", encoding="utf-8") as f:
            for arq in reversed(pedacos):
                f.write("file '" + arq.replace("\\", "/").replace("'", r"'\''") + "'\n")
        tmp = out + ".tmp" + ext
        aud = (["-ss", _tempo_ffmpeg(a), "-t", _tempo_ffmpeg(b - a), "-i", path, "-map", "1:a:0", "-af", "areverse",
                *(["-c:a", "pcm_s16le"] if alfa else ["-c:a", "aac", "-b:a", "256k"])] if info["has_audio"] else [])
        rc, err = _rodar(base + ["-f", "concat", "-safe", "0", "-i", lista, *aud, "-map", "0:v:0", "-c:v", "copy",
                                 *([] if alfa else ["-movflags", "+faststart"]), *(["-shortest"] if aud else []), tmp])
        if rc != 0 or not os.path.isfile(tmp):
            _apagar_item(tmp)
            return {"success": False, "error": err.splitlines()[-1] if err else "Falha ao juntar o vídeo invertido."}
        os.replace(tmp, out)
        pct(100)
        return {"success": True, "path": out}
    finally:
        shutil.rmtree(pasta, ignore_errors=True)


# ─────────────────────────── exportação ───────────────────────────

def _detectar_hw_encoder(codec="h264", bits=8):
    """Testa uma vez os encoders de GPU do codec (h264/hevc; hevc 10 bits testa em p010).
    Retorna 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'hevc_*' | None."""
    global _hw_encoder_cache, _hw_motivo
    if not isinstance(_hw_encoder_cache, dict):
        _hw_encoder_cache = {}
    chave = f"{codec}{bits}"
    # driver velho: refaz o teste a cada minuto (depois de atualizar o driver a placa volta sem reiniciar o app)
    if chave in _hw_encoder_cache and not (_hw_motivo and not _hw_encoder_cache[chave]
                                           and time.time() - _hw_encoder_cache.get(chave + "_t", 0) > 60):
        return _hw_encoder_cache[chave] or None
    achado, incerto = "", False
    px = ["-pix_fmt", "p010le"] if bits == 10 else []
    for enc in (f"{codec}_nvenc", f"{codec}_qsv", f"{codec}_amf"):
        try:
            r = subprocess.run(
                [ffmpeg_path(), "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.2",
                 *px, "-c:v", enc, "-f", "null", "-"],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, errors="replace",
                timeout=30, creationflags=_creationflags(),
            )
            if r.returncode == 0:
                achado = enc
                if enc.endswith("_nvenc"):
                    _hw_motivo = ""
                break
            if enc.endswith("_nvenc"):
                # placa NVIDIA presente, mas o driver é mais velho que o exigido pelo ffmpeg (2026-10: ffmpeg pedia
                # 610+ e o usuário tinha 591 → exportava tudo pela CPU sem avisar)
                m = re.search(r"minimum required Nvidia driver for nvenc is ([\d.]+)", r.stderr or "")
                if m or "nvenc API version" in (r.stderr or ""):
                    _hw_motivo = ("Driver NVIDIA antigo: a placa de vídeo não está sendo usada. Atualize o driver"
                                  + (f" para {m.group(1)} ou mais novo" if m else "") + " (NVIDIA App ou nvidia.com).")
        except subprocess.TimeoutExpired:
            incerto = True   # máquina ocupada (outra exportação): não conclui que não há placa
        except Exception:
            pass
    # "não tem placa" só fica guardado quando o teste respondeu; um teste que estourou o tempo é refeito na próxima
    # (antes a sessão inteira exportava pela CPU depois de uma detecção com o computador carregado)
    if achado or not incerto:
        _hw_encoder_cache[chave] = achado
        _hw_encoder_cache[chave + "_t"] = time.time()
    return achado or None


def motivo_sem_gpu():
    """Texto para o usuário quando a placa NVIDIA existe mas não pode gravar (vazio se não há problema conhecido)."""
    _detectar_hw_encoder()
    return _hw_motivo


def _args_video(cfg, q, usar_gpu, bits=8, mbps=0):
    """Argumentos do encoder de vídeo.
    Qualidade constante (padrão): CRF/CQ pelo preset de qualidade — o tamanho do arquivo acompanha a cena.
    mbps > 0: taxa de bits alvo (VBR com teto de 1,5x e buffer de 2x) — tamanho previsível.
    bits = 10: H.265 Main10 / ProRes; H.264 fica em 8 bits (10 bits em H.264 quase nenhum player toca)."""
    vc = cfg["vcodec"]
    if vc == "vp9":
        return ["-c:v", "libvpx-vp9", "-crf", str(q["vp9"]), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"]
    if vc == "mpeg4":
        return ["-c:v", "mpeg4", "-q:v", "3"]
    if vc == "prores":
        # ProRes 422 HQ (Apple): intermediário de altíssima qualidade para finalizar em outro programa
        return ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-bits_per_mb", "8000", "-pix_fmt", "yuv422p10le"]
    hevc = vc == "hevc"
    if not hevc:
        bits = 8
    taxa = []
    if mbps and mbps > 0:
        b = max(0.2, float(mbps))
        taxa = ["-b:v", f"{b:.2f}M", "-maxrate", f"{b * 1.5:.2f}M", "-bufsize", f"{b * 2:.2f}M"]
    enc = _detectar_hw_encoder("hevc" if hevc else "h264", bits) if usar_gpu else None
    tag = ["-tag:v", "hvc1"] if hevc else []   # hvc1: o H.265 toca no QuickTime/iPhone/Premiere
    if enc and enc.endswith("_nvenc"):
        # recomendações da NVIDIA para qualidade: AQ espacial/temporal, lookahead, B-frames como referência
        a = ["-c:v", enc, "-preset", "p6", "-tune", "hq", "-multipass", "qres", "-rc-lookahead", "20",
             "-spatial-aq", "1", "-temporal-aq", "1", "-bf", "3", "-b_ref_mode", "middle"]
        a += (["-rc", "vbr"] + taxa) if taxa else ["-rc", "vbr", "-cq", str(q["cq"]), "-b:v", "0"]
        if hevc:
            a += ["-profile:v", "main10" if bits == 10 else "main", "-pix_fmt", "p010le" if bits == 10 else "yuv420p"]
        else:
            a += ["-profile:v", "high", "-pix_fmt", "yuv420p"]
        return a + tag
    if enc and enc.endswith("_qsv"):
        a = ["-c:v", enc, "-preset", "slow", "-look_ahead", "1"]
        a += taxa if taxa else ["-global_quality", str(q["cq"])]
        return a + ["-pix_fmt", "p010le" if bits == 10 else "nv12"] + tag
    if enc and enc.endswith("_amf"):
        a = ["-c:v", enc, "-quality", "quality"]
        a += (["-rc", "vbr_peak"] + taxa) if taxa else ["-rc", "cqp", "-qp_i", str(q["cq"]), "-qp_p", str(q["cq"] + 2)]
        return a + ["-pix_fmt", "p010le" if bits == 10 else "yuv420p"] + tag
    if hevc:
        # x265: CRF ~2-3 acima do x264 dá a mesma qualidade com ~40% menos bits
        a = ["-c:v", "libx265", "-preset", q["preset"], "-x265-params", "log-level=error"]
        a += taxa if taxa else ["-crf", str(q["crf"] + 3)]
        return a + ["-pix_fmt", "yuv420p10le" if bits == 10 else "yuv420p"] + tag
    a = ["-c:v", "libx264", "-preset", q["preset"], "-profile:v", "high"]
    a += taxa if taxa else ["-crf", str(q["crf"])]
    return a + ["-pix_fmt", "yuv420p"]


def _args_cor(info, altura):
    """Marca de cor da saída: a da fonte (bt709, bt2020...) ou bt709 para HD sem marca (o padrão de vídeo HD)."""
    ok = lambda v: v and v not in ("unknown", "unspecified", "reserved")
    cs, cp, ct = info.get("color_space"), info.get("color_primaries"), info.get("color_transfer")
    if ok(cs) or ok(cp) or ok(ct):
        a = []
        if ok(cs):
            a += ["-colorspace", cs]
        if ok(cp):
            a += ["-color_primaries", cp]
        if ok(ct):
            a += ["-color_trc", ct]
        return a + ["-color_range", "pc" if info.get("color_range") == "pc" else "tv"]
    if altura >= 720:
        return ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
    return []


def _nome_saida(path, ext, pasta=None, nome=None):
    """nome = o que o usuário digitou na exportação (sem extensão); sem ele, <vídeo>_editado.
    Nunca sobrescreve: se já existir, ganha _1, _2..."""
    pasta = pasta or os.path.dirname(path)
    base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(nome or "")).strip(" .")
    if base.lower().endswith(ext.lower()):
        base = base[: -len(ext)].rstrip(" .")
    if not base:
        base = os.path.splitext(os.path.basename(path))[0] + "_editado"
    destino = os.path.join(pasta, f"{base}{ext}")
    n = 1
    while os.path.exists(destino):
        destino = os.path.join(pasta, f"{base}_{n}{ext}")
        n += 1
    return destino


def _tempo_ffmpeg(t):
    return f"{max(0.0, float(t)):.6f}"


def _normalizar_segmentos(segmentos, duracao):
    """
    Peças da timeline, na ordem: (a, b, ganho_db) = trecho do original; ("gap", d) = espaço vazio
    (preto/silêncio). A ordem é a da timeline (clipes podem ser reordenados); só junta trechos
    colados com o mesmo ganho e vazios seguidos.
    """
    pecas = []
    for s in segmentos or []:
        try:
            if s.get("gap") is not None:
                d = float(s["gap"])
                if d >= 0.02:
                    if pecas and pecas[-1][0] == "gap":
                        pecas[-1][1] += d
                    else:
                        pecas.append(["gap", d])
                continue
            a = max(0.0, float(s.get("start", 0)))
            b = min(float(s.get("end", 0)), duracao)
            g = max(-60.0, min(30.0, float(s.get("gain") or 0)))
        except Exception:
            continue
        if b - a < 0.04:
            continue
        if pecas and pecas[-1][0] != "gap" and abs(a - pecas[-1][1]) <= 0.001 and pecas[-1][2] == g:
            pecas[-1][1] = b
        else:
            pecas.append([a, b, g])
    # espaço vazio no fim não entra no vídeo
    while pecas and pecas[-1][0] == "gap":
        pecas.pop()
    return [tuple(p) for p in pecas]


def _dur_peca(p):
    return p[1] if p[0] == "gap" else p[1] - p[0]


def cancelar_exportacao():
    with _export_lock:
        for p in [_export_proc] + list(_export_procs):   # blocos em paralelo: um ffmpeg por bloco
            if p is not None:
                try:
                    p.kill()
                except Exception:
                    pass


# Quadros-chave: mesma conversão das propriedades fixas (escala e opacidade viram fração)
_KF_CONV = {
    "sc": lambda v: max(0.5, min(2000.0, v)) / 100.0,
    "sx": lambda v: max(0.0005, min(20.0, v)),   # escala só na horizontal (multiplica a largura; transição Dobrar)
    "sy": lambda v: max(0.0005, min(20.0, v)),   # escala só na vertical (multiplica a altura; transição Dobrar)
    "x": lambda v: v,
    "y": lambda v: v,
    "rot": lambda v: v,
    "op": lambda v: max(0.0, min(100.0, v)) / 100.0,
}


def _curva_kf(q):
    """Alças [x1, y1, x2, y2] da curva de Bézier do quadro-chave (4º item), ou None."""
    try:
        b = [float(v) for v in q[3]]
        if len(b) == 4:
            return (min(1.0, max(0.0, b[0])), b[1], min(1.0, max(0.0, b[2])), b[3])
    except Exception:
        pass
    return None


def _normalizar_kf(kf):
    """{prop: [[t, v, interp, bezier?], ...]} (t = segundos desde o início da camada) → listas ordenadas."""
    out = {}
    for k, conv in _KF_CONV.items():
        pts = []
        for q in (kf or {}).get(k) or []:
            try:
                pts.append((float(q[0]), conv(float(q[1])), str(q[2]) if len(q) > 2 else "lin",
                            _curva_kf(q) if len(q) > 3 else None))
            except Exception:
                continue
        if pts:
            out[k] = sorted(pts, key=lambda p: p[0])
    return out


def _bez_y(bz, u):
    """y da Bézier (0,0)-(x1,y1)-(x2,y2)-(1,1) no tempo u — igual a veBezY da prévia."""
    x1, y1, x2, y2 = bz
    b = lambda a, c, s: 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * c + s ** 3
    lo, hi, s = 0.0, 1.0, u
    for _ in range(40):
        s = (lo + hi) / 2
        if b(x1, x2, s) < u:
            lo = s
        else:
            hi = s
    return b(y1, y2, s)


_KF_AMOSTRAS = 24   # curva vira trechos retos no ffmpeg (a expressão não tem laço para resolver a Bézier)


def _expr_kf(pts, tv):
    """Expressão do ffmpeg que interpola os quadros-chave no tempo `tv` (igual à prévia do editor):
    antes do 1º e depois do último o valor fica parado; 'ease' = smoothstep, 'hold' = degrau,
    curva de Bézier = trechos retos (_KF_AMOSTRAS por segmento).
    Os trechos viram uma árvore BALANCEADA de if(lt(t, início), ...): o avaliador do ffmpeg aceita só ~100 níveis
    de aninhamento, e a corrente de antes (um if por trecho) quebrava a exportação de camadas com muitos
    quadros-chave curvos ("Missing ')' or too many args")."""
    f = lambda v: f"{v:.6f}"
    trechos = [(None, f(pts[0][1]))]   # (a partir de quando vale, expressão); o 1º vale antes de tudo
    for j in range(len(pts) - 1):
        (ta, va, ia, bz), (tb, vb, _, _) = pts[j], pts[j + 1]
        d = tb - ta
        if d < 1e-6 or ia == "hold" or abs(vb - va) < 1e-9:
            trechos.append((ta, f(va)))
        elif ia in ("lin", "ease") or bz is None:
            u = f"clip(({tv}-{ta:.4f})/{d:.4f},0,1)"
            curva = f"{u}*{u}*(3-2*{u})" if ia == "ease" else u
            trechos.append((ta, f"({f(va)}+{f(vb - va)}*{curva})"))
        else:
            n = _KF_AMOSTRAS
            ys = [_bez_y(bz, i / n) for i in range(n + 1)]
            for i in range(n):
                t0, t1 = ta + d * i / n, ta + d * (i + 1) / n
                v0, v1 = va + (vb - va) * ys[i], va + (vb - va) * ys[i + 1]
                trechos.append((t0, f"({f(v0)}+{f(v1 - v0)}*({tv}-{t0:.5f})/{t1 - t0:.5f})"))
    trechos.append((pts[-1][0], f(pts[-1][1])))
    # trechos vizinhos com a mesma expressão (quadro-chave a cada quadro com o mesmo valor, comum vindo do Premiere)
    # viram um só
    trechos = [x for k, x in enumerate(trechos) if k == 0 or x[1] != trechos[k - 1][1]]

    def arvore(lo, hi):
        if lo == hi:
            return trechos[lo][1]
        meio = (lo + hi + 1) // 2
        return f"if(lt({tv},{trechos[meio][0]:.5f}),{arvore(lo, meio - 1)},{arvore(meio, hi)})"

    return arvore(0, len(trechos) - 1)


def _valor_kf(pts, t):
    """Valor que a expressão de _expr_kf dá no tempo t (mesmas regras, calculado aqui)."""
    if t < pts[0][0]:
        return pts[0][1]
    for j in range(len(pts) - 1):
        (ta, va, ia, bz), (tb, vb, _, _) = pts[j], pts[j + 1]
        if t >= tb:
            continue
        d = tb - ta
        if d < 1e-6 or ia == "hold" or abs(vb - va) < 1e-9:
            return va
        u = min(1.0, max(0.0, (t - ta) / d))
        if ia in ("lin", "ease") or bz is None:
            return va + (vb - va) * (u * u * (3 - 2 * u) if ia == "ease" else u)
        n = _KF_AMOSTRAS
        i = min(n - 1, int(u * n))
        y0, y1 = _bez_y(bz, i / n), _bez_y(bz, (i + 1) / n)
        return va + (vb - va) * (y0 + (y1 - y0) * (u * n - i))
    return pts[-1][1]


def _opacidade_animada(pts, dur, fps, nome, inicio=0.0):
    """Opacidade com quadros-chave: um valor por quadro mandado por sendcmd ao colorchannelmixer.
    (O geq fazia a mesma conta pixel a pixel e deixava a exportação ~3x mais lenta.)"""
    fps = float(fps)
    arq = os.path.join(_work_dir(), f"op_{uuid.uuid4().hex[:8]}.txt")
    linhas = []
    for i in range(int(dur * fps) + 2):
        # meio quadro antes: o comando já vale no quadro i (evita cair um quadro depois por arredondamento)
        linhas.append(f"{max(0.0, inicio + (i - 0.5) / fps):.5f} {nome} aa {_valor_kf(pts, i / fps):.5f};")
    with open(arq, "w", encoding="ascii") as f:
        f.write("\n".join(linhas) + "\n")
    return f"sendcmd=f={_caminho_filtro(arq)},{nome}=aa={_valor_kf(pts, 0):.5f}"


# ─────────────────────────── mixagem das trilhas de áudio ───────────────────────────
# Todas as trilhas tocam juntas (soma, como no Premiere): cada clipe com som entra com o próprio ganho no
# instante dele. A prévia do editor faz a MESMA conta em tempo real (mixer de editor-audio.js, sobre o áudio
# conformado): soma com o ganho em dB, posições em amostras de 48 kHz.

def _normalizar_mix(clipes, dur_fonte):
    """[[st, s, e, ganho_db, arquivo?, velocidade?, manter_tom?, fi?, fo?, efeitos?], ...] da timeline → tuplas
    (st, s, e, ganho, arquivo, velocidade, manter_tom, fi, fo, efeitos). arquivo None = o vídeo aberto (limitado à duração dele);
    senão um áudio extra solto na timeline. Na timeline o clipe dura (e - s) / velocidade."""
    out = []
    for c in clipes or []:
        try:
            st, s0, e0 = float(c[0]), float(c[1]), float(c[2])
            g = float(c[3]) if len(c) > 3 and c[3] else 0.0
            arq = c[4] if len(c) > 4 and c[4] else None
            vel = max(0.05, min(20.0, float(c[5]))) if len(c) > 5 and c[5] else 1.0
            tom = not (len(c) > 6 and c[6] in (0, False))
            fi = max(0.0, float(c[7])) if len(c) > 7 and c[7] else 0.0   # fades (Potência constante), em s da timeline
            fo = max(0.0, float(c[8])) if len(c) > 8 and c[8] else 0.0
            afx = _normalizar_afx(c[9] if len(c) > 9 else None)
        except Exception:
            continue
        if arq is not None and not os.path.isfile(str(arq)):
            continue
        s0 = max(0.0, s0)
        if arq is None and dur_fonte:
            e0 = min(float(dur_fonte), e0)
        if st >= 0 and e0 - s0 > 0.005:
            out.append((st, s0, e0, max(-60.0, min(30.0, g)), arq, vel, tom, fi, fo, afx))
    return out


def _fim_mix(c):
    """Fim do clipe de som na timeline."""
    return c[0] + (c[2] - c[1]) / c[5]


def _filtro_velocidade(vel, tom):
    """Velocidade do som: atempo (mantém o tom; cada estágio aceita 0,5 a 100) ou, sem manter o tom,
    reamostragem (como fita mais rápida)."""
    if abs(vel - 1) < 1e-4:
        return ""
    if not tom:
        return f",asetrate={48000 * vel:.3f},aresample=48000"
    partes, v = [], vel
    while v < 0.5:
        partes.append("atempo=0.5")
        v /= 0.5
    partes.append(f"atempo={v:.6f}")
    return "," + ",".join(partes)


def _afx_num(v, padrao=0.0):
    try:
        return float(v)
    except Exception:
        return padrao


def _afx_lim(v, a, b, padrao=0.0):
    return max(a, min(b, _afx_num(v, padrao)))


def _normalizar_afx(efeitos):
    out = []
    for f in efeitos or []:
        if not isinstance(f, dict):
            continue
        t, v = str(f.get("t") or ""), f.get("v") or {}
        if not isinstance(v, dict):
            v = {}
        if t == "antinoise":   # Anti Noise (_pre_antinoise)
            amt = _afx_lim(v.get("amt"), 0.0, 100.0, 100.0)
            if amt > 0:
                out.append((t, {"amt": amt}))
        elif t == "denoise":
            amt = _afx_lim(v.get("amt"), 0.0, 100.0, 35.0)
            if amt > 0:
                out.append((t, {"amt": amt, "floor": _afx_lim(v.get("floor"), -75.0, -25.0, -50.0)}))
        elif t == "limiter":   # Hard Limiter (_hard_limiter)
            out.append((t, {"ceil": _afx_lim(v.get("ceil"), -30.0, 0.0, -1.0),
                            "boost": _afx_lim(v.get("boost"), -12.0, 30.0, 0.0),
                            "look": _afx_lim(v.get("look"), 0.1, 10.0, 3.0),
                            "rel": _afx_lim(v.get("rel"), 10.0, 1000.0, 80.0),
                            "link": 0 if v.get("link") in (0, False) else 1}))
        elif t == "dereverb":
            amt = _afx_lim(v.get("amt"), 0.0, 100.0, 40.0)
            if amt > 0:
                out.append((t, {"amt": amt}))
        elif t == "reverb":
            mix = _afx_lim(v.get("mix"), 0.0, 60.0, 18.0)
            if mix > 0:
                out.append((t, {"mix": mix, "size": _afx_lim(v.get("size"), 0.0, 100.0, 45.0)}))
        elif t == "eq":
            vals = {k: _afx_lim(v.get(k), -12.0, 12.0, 0.0) for k in ("lo", "mid", "hi")}
            if any(abs(x) > 0.01 for x in vals.values()):
                out.append((t, vals))
    return out


def _filtros_afx(efeitos):
    fs = []
    for t, v in efeitos or []:
        if t == "denoise":
            nr = min(97.0, max(0.01, 4.0 + v["amt"] * 0.25))
            fs.append(f"afftdn=nr={nr:.3f}:nf={v['floor']:.3f}:tn=1")
        # limiter: não é filtro do ffmpeg — o clipe passa pelo _hard_limiter antes do grafo (_pre_limitar)
        elif t == "dereverb":
            a = v["amt"] / 100.0
            fs.append(f"dialoguenhance=original={max(0.35, 1.0 - a * 0.45):.4f}:enhance={1.0 + a * 1.6:.4f}:voice={2.0 + a * 20.0:.4f}")
        elif t == "reverb":
            wet, size = v["mix"] / 100.0, v["size"] / 100.0
            atrasos = [30 + size * 50, 70 + size * 90, 120 + size * 150]
            decays = [wet * 0.55, wet * 0.35, wet * 0.22]
            fs.append("aecho=0.90:1.0:" + "|".join(f"{d:.1f}" for d in atrasos)
                      + ":" + "|".join(f"{d:.4f}" for d in decays))
        elif t == "eq":
            for freq, width, gain in ((120, 2.0, v["lo"]), (1000, 1.0, v["mid"]), (6500, 2.0, v["hi"])):
                if abs(gain) > 0.01:
                    fs.append(f"equalizer=frequency={freq}:width_type=o:width={width:.3f}:gain={gain:.3f}")
    return fs


def _max_janela(a, w):
    """Máximo de a[i-w+1 .. i] para cada i (antes do início conta 0), em O(n) (van Herk / Gil-Werman)."""
    import numpy as np
    if w <= 1:
        return a.copy()
    p = np.concatenate([np.zeros(w - 1), a])
    m = -(-len(p) // w) * w
    p = np.concatenate([p, np.zeros(m - len(p))]).reshape(-1, w)
    g = np.maximum.accumulate(p, axis=1).ravel()                   # máximo do começo do bloco até ali
    h = np.maximum.accumulate(p[:, ::-1], axis=1)[:, ::-1].ravel()  # dali até o fim do bloco
    k = len(a)
    return np.maximum(h[:k], g[w - 1:w - 1 + k])


def _hard_limiter(x, ceil=-1.0, boost=0.0, look=3.0, rel=80.0, link=1):
    """Hard Limiter (Premiere/Audition) — a MESMA conta do VeLimitador do editor (editor-audio.js), para a prévia
    soar igual ao arquivo. x = amostras (n, 2) em float.
      ganho de entrada → atenuação necessária A = max(0, dB(|x|/teto)) (L e R juntos se vinculados)
      H = maior A na janela de antecipação [i−L, i]; soltura: R = max(H, R − 12 dB/soltura) (sobe no máximo isso)
      ganho = média móvel de 10^(−R/20) na janela; saída[m] = x[m] × ganho[m + L] (antecipado, sem atraso final)
    No pico toda a janela da média tem ganho ≤ o necessário: a saída nunca passa do teto."""
    import numpy as np
    x = np.asarray(x, dtype=np.float64) * (10.0 ** (boost / 20.0))
    teto = 10.0 ** (min(0.0, ceil) / 20.0)
    L = max(0, int(round(look * AUDIO_SR / 1000.0)))
    d = 12.0 / max(1.0, rel * AUDIO_SR / 1000.0)
    n, w = len(x), L + 1
    if not n:
        return x.astype(np.float32)
    xp = np.concatenate([x, np.zeros((L, 2))])   # depois do fim: silêncio (o ganho do fim também antecipa)
    envs = [np.abs(xp).max(axis=1)] if link else [np.abs(xp[:, 0]), np.abs(xp[:, 1])]
    ganhos = []
    for a in envs:
        A = np.where(a > teto, 20.0 * np.log10(np.maximum(a, 1e-30) / teto), 0.0)
        H = _max_janela(A, w)
        passo = np.arange(len(A)) * d
        R = np.maximum.accumulate(H + passo) - passo   # R[i] = máx(H[j] − (i − j)·d), j ≤ i
        G = 10.0 ** (-R / 20.0)
        cs = np.concatenate([[0.0], np.cumsum(np.concatenate([np.ones(L), G]))])   # antes do início: ganho 1
        Gs = (cs[w:] - cs[:-w]) / w
        ganhos.append(Gs[L:L + n])
    y = x * (ganhos[0][:, None] if link else np.stack(ganhos, axis=1))
    return np.clip(y, -teto, teto).astype(np.float32)


def _pre_limitar(mix, path, tem_audio_fonte, work):
    """Clipes com Hard Limiter: o som do clipe (trecho, velocidade, ganho e efeitos antes do limitador) sai do ffmpeg,
    passa pelo _hard_limiter e vira um PCM próprio (.f32); no grafo ele só leva os efeitos de depois e os fades."""
    import numpy as np
    out = []
    for c in mix:
        st, s0, e0, g, arq, vel, tom, fi, fo, afx = c
        k = next((j for j, (t, _) in enumerate(afx) if t == "limiter"), None)
        if k is None or (arq is None and not tem_audio_fonte):
            out.append(c)
            continue
        pre, lim = afx[:k], afx[k][1]
        pos = [f for f in afx[k + 1:] if f[0] != "limiter"]
        dur = (e0 - s0) / vel
        fs = ["aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo",
              f"atrim=start={s0:.5f}:end={e0:.5f}", "asetpts=PTS-STARTPTS"]
        velf = _filtro_velocidade(vel, tom)
        if velf:
            fs.append(velf.lstrip(","))
        if g:
            fs.append(f"volume={g:.2f}dB")
        fs += _filtros_afx(pre)
        fs.append(f"apad=whole_dur={dur:.5f},atrim=0:{dur:.5f}")
        r = subprocess.run([ffmpeg_path(), "-v", "error", "-i", path if arq is None else arq, "-map", "0:a:0",
                            "-af", ",".join(fs), "-f", "f32le", "-ac", "2", "-ar", str(AUDIO_SR), "-"],
                           capture_output=True, timeout=3600, creationflags=_creationflags())
        if r.returncode != 0 or not r.stdout:
            raise RuntimeError("Hard Limiter: não foi possível ler o áudio do clipe: "
                               + (r.stderr.decode("utf-8", "replace").strip().splitlines() or ["?"])[-1])
        x = np.frombuffer(r.stdout[:len(r.stdout) // 8 * 8], dtype=np.float32).reshape(-1, 2)
        y = _hard_limiter(x, **lim)
        raw = os.path.join(work, f"lim_{uuid.uuid4().hex[:10]}.f32")
        y.tofile(raw)
        out.append((st, 0.0, len(y) / AUDIO_SR, 0.0, raw, 1.0, True, fi, fo, pos))
    return out


def _pre_antinoise(mix, path, tem_audio_fonte, work):
    """Clipes com Anti Noise: o som limpo (DeepFilterNet3, anti_noise.limpo: feito uma vez por arquivo) misturado
    com o original na Quantidade do efeito, só no trecho do clipe. É a mesma mistura do mixer da prévia
    (editor-audio.js: veAudioAmostra). O clipe passa a ler esse .wav, sem o efeito."""
    from Functions import anti_noise
    out = []
    for c in mix:
        st, s0, e0, g, arq, vel, tom, fi, fo, afx = c
        an = next((v for t, v in afx if t == "antinoise"), None)
        if an is None or (arq is None and not tem_audio_fonte):
            out.append(c)
            continue
        fonte = path if arq is None else arq
        limpo = anti_noise.limpo(fonte)
        # peso do limpo: a Quantidade anda em dB de ruído tirado (editor-audio.js: veAnPeso)
        q = an["amt"] / 100.0
        a = 1.0 if q >= 1 else 1.0 - 10.0 ** (-q * 36.0 / 20.0)
        cadeia = ("aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                  f"atrim=start={s0:.5f}:end={e0:.5f},asetpts=PTS-STARTPTS")
        grafo = (f"[0:a:0]{cadeia},volume={1 - a:.5f}[o];[1:a:0]{cadeia},volume={a:.5f}[l];"
                 "[o][l]amix=inputs=2:normalize=0:duration=first[s]")
        wav = os.path.join(work, f"an_{uuid.uuid4().hex[:10]}.wav")
        r = subprocess.run([ffmpeg_path(), "-y", "-v", "error", "-i", fonte, "-i", limpo, "-filter_complex", grafo,
                            "-map", "[s]", "-c:a", "pcm_f32le", wav],
                           capture_output=True, timeout=3600, creationflags=_creationflags())
        if r.returncode != 0 or not os.path.isfile(wav):
            raise RuntimeError("Anti Noise: não foi possível misturar o som limpo: "
                               + (r.stderr.decode("utf-8", "replace").strip().splitlines() or ["?"])[-1])
        out.append((st, 0.0, e0 - s0, g, wav, vel, tom, fi, fo, [f for f in afx if f[0] != "antinoise"]))
    return out


def _entrada_audio(arq, path):
    """Opções de entrada do ffmpeg de um arquivo do mix (o PCM cru de um clipe já limitado precisa do formato)."""
    if arq and str(arq).endswith(".f32"):
        return ["-f", "f32le", "-ar", str(AUDIO_SR), "-ch_layout", "stereo", "-i", arq]
    return ["-i", path if arq is None else arq]


def _limitar_master(mix, path, tem_audio_fonte, total, lim, work):
    """Hard Limiter no Master (a soma de todas as trilhas, como no Mixer de trilhas do Premiere): o ffmpeg soma o mix
    (o mesmo _grafo_mix da exportação), a soma passa pelo _hard_limiter e volta como um PCM só."""
    import numpy as np
    if not tem_audio_fonte:
        mix = [c for c in mix if c[4]]
    if not mix:
        return mix
    arqs = ([None] if tem_audio_fonte else []) + sorted({c[4] for c in mix if c[4]})
    cmd, entradas = [ffmpeg_path(), "-v", "error"], {}
    for k, arq in enumerate(arqs):
        cmd += _entrada_audio(arq, path)
        entradas[arq] = f"[{k}:a:0]"
    script = os.path.join(work, f"master_{uuid.uuid4().hex[:8]}.txt")
    with open(script, "w", encoding="utf-8") as f:
        f.write(";\n".join(_grafo_mix(mix, total, entradas, "ac")))
    cmd += [_opcao_filtro_script(), script, "-map", "[ac]", "-f", "f32le", "-ac", "2", "-ar", str(AUDIO_SR), "-"]
    r = subprocess.run(cmd, capture_output=True, timeout=7200, creationflags=_creationflags())
    if r.returncode != 0 or not r.stdout:
        raise RuntimeError("Hard Limiter no Master: não foi possível somar o áudio: "
                           + (r.stderr.decode("utf-8", "replace").strip().splitlines() or ["?"])[-1])
    x = np.frombuffer(r.stdout[:len(r.stdout) // 8 * 8], dtype=np.float32).reshape(-1, 2)
    y = _hard_limiter(x, **lim)
    raw = os.path.join(work, f"master_{uuid.uuid4().hex[:10]}.f32")
    y.tofile(raw)
    return [(0.0, 0.0, len(y) / AUDIO_SR, 0.0, raw, 1.0, True, 0.0, 0.0, [])]


def _grafo_mix(clipes, total, entradas, rotulo):
    """Filtros que somam os clipes (st, s, e, ganho, arquivo) e terminam em [rotulo] com a duração exata `total`.
    entradas = {arquivo: "[i:a:0]"} (arquivo None = vídeo aberto). Um decodificador por arquivo (asplit),
    atraso em amostras (preciso), soma pura (amix normalize=0)."""
    clipes = [c for c in clipes if c[4] in entradas]
    if not clipes:
        return [f"anullsrc=r=48000:cl=stereo,atrim=0:{total:.4f}[{rotulo}]"]
    f, nomes = [], {}
    for j, (arq, ent) in enumerate(entradas.items()):
        ks = [k for k, c in enumerate(clipes) if c[4] == arq]
        if not ks:
            continue
        for k in ks:
            nomes[k] = f"{rotulo}s{k}"
        f.append(f"{ent}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asplit={len(ks)}"
                 + "".join(f"[{nomes[k]}]" for k in ks))
    for k, (st, s0, e0, g, _, vel, tom, *fd) in enumerate(clipes):
        fi, fo, afx = (fd + [0.0, 0.0, []])[:3]
        vol = f",volume={g:.2f}dB" if g else ""
        audio_fx = _filtros_afx(afx)
        efeitos = ("," + ",".join(audio_fx)) if audio_fx else ""
        # fades de Potência constante (seno/cosseno = curve=qsin), no tempo da timeline (depois da velocidade)
        fades = ""
        dur = (e0 - s0) / vel
        if fi > 0.001:
            fades += f",afade=t=in:st=0:d={min(fi, dur):.4f}:curve=qsin"
        if fo > 0.001:
            fades += f",afade=t=out:st={max(0.0, dur - fo):.4f}:d={min(fo, dur):.4f}:curve=qsin"
        corta = f",atrim=0:{dur:.5f}" if audio_fx else ""
        f.append(f"[{nomes[k]}]atrim=start={s0:.5f}:end={e0:.5f},asetpts=PTS-STARTPTS"
                 f"{_filtro_velocidade(vel, tom)}{vol}{efeitos}{fades}{corta},"
                 f"adelay={int(round(st * 48000))}S:all=1[{rotulo}m{k}]")
    n = len(clipes)
    f.append("".join(f"[{rotulo}m{k}]" for k in range(n))
             + f"amix=inputs={n}:normalize=0:duration=longest:dropout_transition=0,"
             + f"apad=whole_dur={total:.4f},atrim=0:{total:.4f}[{rotulo}]")
    return f


# Áudio "conformado" (como os .cfa do Premiere): ao abrir, o som da fonte vira PCM puro em disco
# (48 kHz, estéreo, 16 bits, sem cabeçalho). O mixer em tempo real do editor (editor-audio.js) lê trechos dele
# por HTTP Range e soma as trilhas a cada bloco — nada é renderizado de novo quando a timeline muda.
AUDIO_SR = 48000
_THREADS_CLIPE = 4   # threads de decodificação de cada clipe por cima da base (exportar_video)
_conf = {"fonte": None, "pcm": None, "evento": None}


def _conformar_audio(path, work):
    """Conforma o áudio da fonte (uma vez por abertura). Registra o pedido ANTES de voltar — a interface pede
    o áudio logo que recebe o 'info' e não pode pegar o da abertura anterior — e converte em segundo plano."""
    pcm = os.path.join(work, "fonte_audio.pcm")
    ev = threading.Event()
    _conf.update(fonte=path, pcm=pcm, evento=ev)
    threading.Thread(target=_mix_fonte_pronta, args=(path, pcm, ev), daemon=True).start()


def _mix_fonte_pronta(path, pcm, ev):
    try:
        subprocess.run([ffmpeg_path(), "-y", "-v", "error", "-i", path, "-map", "0:a:0", "-vn", "-ac", "2",
                        "-ar", str(AUDIO_SR), "-f", "s16le", "-c:a", "pcm_s16le", pcm],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3600, creationflags=_creationflags())
    except Exception:
        pass
    ev.set()


def adicionar_audio(path):
    """Áudio solto na timeline (MP3, WAV...): conforma em PCM (para o mixer em tempo real), gera a forma de onda
    e devolve a duração. Um arquivo só é convertido uma vez por sessão."""
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo não encontrado."}
    try:
        info = probe(path)
    except Exception as e:
        return {"success": False, "error": f"Não foi possível analisar o áudio: {e}"}
    if not info["has_audio"] or info["duration"] <= 0:
        return {"success": False, "error": "Este arquivo não tem som."}
    chave = hashlib.md5(f"{os.path.abspath(path)}|{os.path.getmtime(path)}".encode()).hexdigest()[:14]
    pcm = os.path.join(_midia_dir(), f"aud_{chave}.pcm")   # guardado com as prévias (não se perde no %TEMP%)
    tmp = f"{pcm}.{os.getpid()}.{threading.get_ident()}.tmp"   # único: duas leituras juntas não se atropelam
    if not os.path.isfile(pcm):
        r = subprocess.run([ffmpeg_path(), "-y", "-v", "error", "-i", path, "-map", "0:a:0", "-vn", "-ac", "2",
                            "-ar", str(AUDIO_SR), "-f", "s16le", "-c:a", "pcm_s16le", tmp],
                           capture_output=True, text=True, timeout=3600, creationflags=_creationflags())
        if r.returncode != 0 or not os.path.isfile(tmp):
            _apagar(tmp)
            return {"success": False, "error": "Não foi possível ler o áudio."}
        os.replace(tmp, pcm)
    else:
        try:
            os.utime(pcm)   # usado agora: não entra na limpeza dos antigos
        except OSError:
            pass
    quadros = os.path.getsize(pcm) // 4
    return {"success": True, "path": path, "name": os.path.basename(path), "dur": quadros / AUDIO_SR,
            "url": media_server.register(pcm), "quadros": quadros, "peaks": gerar_peaks(path, quadros / AUDIO_SR)}


def audio_conformado(espera=600):
    """{url, sr, canais, quadros} do PCM conformado da fonte aberta (espera a conversão terminar)."""
    ev, pcm = _conf["evento"], _conf["pcm"]
    if ev is None or not pcm:
        return {"success": False, "error": "sem áudio"}
    ev.wait(espera)
    if _conf["pcm"] != pcm or not os.path.isfile(pcm) or os.path.getsize(pcm) < 4:
        return {"success": False, "error": "falha ao preparar o áudio"}
    return {"success": True, "url": media_server.register(pcm), "sr": AUDIO_SR, "canais": 2,
            "quadros": os.path.getsize(pcm) // 4}


# ─────────────────────────── legendas gravadas no vídeo ───────────────────────────
# O editor desenha a legenda na prévia com as mesmas contas (editor-texto.js: veTxDesenhar). O "Fontsize" do
# ASS é a altura da linha (ascendente + descendente da fonte; 1,117 em no Arial): a prévia mede a fonte
# escolhida e manda a proporção em estilo["razao"].

def _ass_tempo(t):
    t = max(0.0, float(t))
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _ass_cor(hexcor, alfa=0):
    """#RRGGBB + transparência (0 = opaco, 255 = invisível) → &HAABBGGRR do ASS."""
    try:
        hx = str(hexcor).lstrip("#")
        rr, gg, bb = int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)
    except Exception:
        rr = gg = bb = 255
    return f"&H{int(alfa):02X}{bb:02X}{gg:02X}{rr:02X}"


def _gerar_ass(itens, estilo, W, H):
    estilo = estilo or {}
    estilos, eventos, cache = [], [], {}

    def montar(est, leg, legs):
        em = max(4.0, float(est.get("tam", 5.5)) / 100.0 * H)
        razao = _num(est.get("razao"), 0.6, 2.5, 1.117)
        fonte = "".join(ch for ch in str(est.get("fonte") or "Arial") if ch not in ",{}\\\n\r").strip() or "Arial"
        fundo = est.get("fundo", "caixa")
        pos = est.get("pos", "baixo")
        alinhamento = {"baixo": 2, "meio": 5, "cima": 8}.get(pos, 2)
        margem = int(round(0.06 * H))
        negrito = -1 if est.get("negrito", True) else 0
        italico = -1 if est.get("ita") else 0
        cor = _ass_cor(est.get("cor", "#ffffff"))
        folga = em * 0.22
        caixa_alfa = round((1 - _num(est.get("caixaOp"), 0, 100, 64) / 100) * 255)
        caixa_cor = _ass_cor(est.get("caixaCor", "#000000"), caixa_alfa)
        raio = _num(est.get("caixaRaio"), 0, 100, 0) if fundo == "caixa" else 0
        cont_cor = _ass_cor(est.get("cCor", "#000000"))
        if fundo == "caixa" and not raio:
            borda, contorno, sombra, fundo_cor = 3, round(folga, 1), 0, caixa_cor
        elif fundo == "sombra":
            largura = _num(est.get("cLarg"), 0, 40, 12) / 200
            borda, contorno, sombra, fundo_cor = 1, round(em * largura, 1), round(em * 0.07, 1), _ass_cor("#000000", 0x40)
        else:
            borda, contorno, sombra, fundo_cor = 1, 0, 0, _ass_cor("#000000", 0xFF)
        s_on = bool(est.get("sOn"))
        s_alfa = round((1 - _num(est.get("sOp"), 0, 100, 75) / 100) * 255)
        s_cor = _ass_cor(est.get("sCor", "#000000"), s_alfa)
        s_d = _num(est.get("sDist"), 0, 200, 6) * 0.7071
        s_blur = _num(est.get("sBlur"), 0, 200, 8) / 2
        camada_sombra = s_on and borda != 3
        if s_on and borda == 3:
            sombra, fundo_cor_sombra = round(s_d, 1), s_cor
        else:
            fundo_cor_sombra = fundo_cor
        if camada_sombra:
            sombra = 0
        if raio:
            camada_sombra = False
        entrada = {
            "fade": r"\fad(120,0)",
            "pop": r"\fscx80\fscy80\t(0,117,\fscx106\fscy106)\t(117,180,\fscx100\fscy100)\fad(60,0)",
        }.get(est.get("entrada"), "")
        cx = W / 2 + _num(est.get("px"), -100, 100, 0) / 100 * W
        ancora_y = ({"baixo": H - margem, "meio": H / 2, "cima": margem}.get(pos, H - margem)
                    - _num(est.get("py"), -100, 100, 0) / 100 * H)
        alt = em * razao
        caixa_y = ancora_y + {"baixo": folga, "cima": -folga}.get(pos, 0)
        caixa_sombra = f"\\shad{s_d:.1f}\\4c&H{s_cor[4:]}&\\4a&H{s_alfa:02X}&" if s_on else "\\shad0"
        return {
            "style": f"Style: {leg},{fonte},{em * razao:.1f},{cor},{cor},{fundo_cor if borda == 3 else cont_cor},{fundo_cor_sombra},"
                     f"{negrito},{italico},0,0,100,100,0,0,{borda},{contorno},{sombra},{alinhamento},{margem},{margem},{margem},1",
            "style_s": f"Style: {legs},{fonte},{em * razao:.1f},{s_cor},{s_cor},{s_cor},{s_cor},"
                       f"{negrito},{italico},0,0,100,100,0,0,1,0,0,{alinhamento},{margem},{margem},{margem},1",
            "leg": leg,
            "legs": legs,
            "tag_sombra": f"{{\\an{alinhamento}\\pos({cx + s_d:.1f},{ancora_y + s_d:.1f})\\blur{s_blur:.1f}{entrada}}}",
            "tag_texto": f"{{\\an{alinhamento}\\pos({cx:.1f},{ancora_y:.1f}){entrada}}}",
            "tag_caixa": (f"{{\\an{alinhamento}\\pos({cx:.1f},{caixa_y:.1f})\\bord0{caixa_sombra}"
                          f"\\1c&H{caixa_cor[4:]}&\\1a&H{caixa_alfa:02X}&{entrada}\\p1}}"),
            "tag_texto_fixo": f"{{\\an{alinhamento}\\pos({cx:.1f},{ancora_y:.1f})}}",
            # destaque da palavra falada (veTxDesenhar): cor/transparência do retângulo e cor da palavra
            "d_on": bool(est.get("dOn")),
            "d_cor": _ass_cor(est.get("dCor", "#22c55e"))[4:],
            "d_alfa": round((1 - _num(est.get("dOp"), 0, 100, 100) / 100) * 255),
            "d_txt": _ass_cor(est.get("dTxt") or est.get("cor", "#ffffff"))[4:],
            "cor": cor[4:],
            "caixa_reta": fundo == "caixa" and not raio,
            "camada_sombra": camada_sombra,
            "raio": raio,
            "alt": alt,
            "folga": folga,
            "maiusc": bool(est.get("maiusc")),
        }

    def info_estilo(item):
        est = dict(estilo)
        if isinstance(item.get("estilo"), dict):
            est.update(item["estilo"])
        chave = json.dumps(est, sort_keys=True, ensure_ascii=False, default=str)
        if chave in cache:
            return cache[chave]
        sufixo = "" if not cache else str(len(cache))
        info = montar(est, f"Leg{sufixo}", f"LegS{sufixo}")
        estilos.extend([info["style"], info["style_s"]])
        cache[chave] = info
        return info

    n = 0
    for it in itens:
        if not isinstance(it, dict):
            continue
        try:
            st, en = float(it["st"]), float(it["en"])
        except Exception:
            continue
        txt = str(it.get("texto", "")).strip()
        if en - st < 0.02 or not txt:
            continue
        info = info_estilo(it)
        if info["maiusc"]:
            txt = txt.upper()
        cru = txt
        txt = _ass_escapar(txt)
        # destaque da palavra falada: precisa dos retângulos medidos pela prévia, um por palavra
        linhas_tk = [re.findall(r"\S+", ln) for ln in cru.replace("\r", "").split("\n") if ln.strip()]
        pal = it.get("pal") if info["d_on"] else None
        destaque = isinstance(pal, list) and pal and len(pal) == sum(len(ln) for ln in linhas_tk)
        if info["camada_sombra"]:
            eventos.append(f"Dialogue: 0,{_ass_tempo(st)},{_ass_tempo(en)},{info['legs']},,0,0,0,,{info['tag_sombra']}{txt}")
        # caixa reta com destaque: vira desenho embaixo (a caixa do próprio texto cobriria o retângulo da palavra)
        if info["raio"] or (destaque and info["caixa_reta"]):
            forma = _ass_caixa_redonda(it.get("larg"), txt.count("\\N") + 1, info["alt"], info["folga"], info["raio"])
            if forma:
                tag = info["tag_caixa"] if info["raio"] else info["tag_caixa"].replace("\\p1}", "\\3a&HFF&\\p1}")
                eventos.append(f"Dialogue: 0,{_ass_tempo(st)},{_ass_tempo(en)},{info['leg']},,0,0,0,,{tag}{forma}")
        if destaque:
            eventos.extend(_ass_destaque(pal, linhas_tk, st, en, info))
        else:
            eventos.append(f"Dialogue: 1,{_ass_tempo(st)},{_ass_tempo(en)},{info['leg']},,0,0,0,,{info['tag_texto']}{txt}")
        n += 1
    if not n:
        return None
    linhas = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "WrapStyle: 2",
        "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding",
        *estilos,
        "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        *eventos,
    ]
    arq = os.path.join(_work_dir(), f"legendas_{uuid.uuid4().hex[:8]}.ass")
    with open(arq, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    return arq


def _ass_escapar(txt):
    return txt.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\r", "").replace("\n", "\\N")


def _ass_retangulo(w, h, r):
    """Desenho ASS (\\p1) de um retângulo w×h com cantos de raio r, começando em (0, 0)."""
    r = max(0.0, min(r, w / 2, h / 2))
    c = r * (1 - 0.5523)

    def f(*v):
        return " ".join(f"{a:.1f}" for a in v)
    return (f"m {f(r, 0)} l {f(w - r, 0)} b {f(w - c, 0, w, c, w, r)} l {f(w, h - r)} b {f(w, h - c, w - c, h, w - r, h)} "
            f"l {f(r, h)} b {f(c, h, 0, h - c, 0, h - r)} l {f(0, r)} b {f(0, c, c, 0, r, 0)}")


def _ass_destaque(pal, linhas_tk, st, en, info):
    """Legenda com a palavra falada destacada (veTxDesenhar): um trecho por palavra, do começo dela até o começo da
    próxima, com o retângulo atrás dela (camada 1) e o texto por cima com ela na cor de destaque (camada 2).
    Os retângulos chegam medidos pela prévia, em px do quadro."""
    ev = []
    # caixa reta: a do texto some (\3a) — ela foi desenhada à parte, embaixo do retângulo da palavra
    sem_caixa = "{\\3a&HFF&}" if info["caixa_reta"] else ""
    for j, p in enumerate(pal):
        try:
            a = st if j == 0 else max(st, float(p["a"]))
            b = en if j == len(pal) - 1 else min(en, max(a, float(pal[j + 1]["a"])))
            x, y, w, h, r = (float(p[k]) for k in ("x", "y", "w", "h", "r"))
        except Exception:
            continue
        if b - a < 0.01:
            continue
        ev.append(f"Dialogue: 1,{_ass_tempo(a)},{_ass_tempo(b)},{info['leg']},,0,0,0,,"
                  f"{{\\an7\\pos({x:.1f},{y:.1f})\\bord0\\shad0\\1c&H{info['d_cor']}&\\1a&H{info['d_alfa']:02X}&\\p1}}"
                  f"{_ass_retangulo(w, h, r)}")
        k, partes = 0, []
        for ln in linhas_tk:
            pl = []
            for tk in ln:
                t = _ass_escapar(tk)
                pl.append(f"{{\\1c&H{info['d_txt']}&}}{t}{{\\1c&H{info['cor']}&}}" if k == j else t)
                k += 1
            partes.append(" ".join(pl))
        tag = info["tag_texto"] if j == 0 else info["tag_texto_fixo"]   # a entrada (pop/fade) só no começo
        texto = "\\N".join(partes)
        ev.append(f"Dialogue: 2,{_ass_tempo(a)},{_ass_tempo(b)},{info['leg']},,0,0,0,,{tag}{sem_caixa}{texto}")
    return ev


def _ass_caixa_redonda(larg, n, alt, folga, raio):
    """Desenho ASS (\\p1) da caixa de cantos arredondados: um retângulo por linha, centralizados, que se
    sobrepõem na folga e viram uma forma só (a mesma da prévia, veTxCaixa). Começa em (0, 0)."""
    try:
        larg = [max(0.0, float(w)) for w in larg][:n]
    except Exception:
        return ""
    if not larg:
        return ""
    k = 1 - 0.5523   # quarto de círculo por Bézier
    h = alt + folga * 2
    w_max = max(larg) + folga * 2

    def f(*v):
        return " ".join(f"{a:.1f}" for a in v)
    partes = []
    for i, w in enumerate(larg):
        w += folga * 2
        x0, y0 = (w_max - w) / 2, i * alt
        x1, y1 = x0 + w, y0 + h
        r = min(h, w) / 2 * raio / 100
        c = r * k
        partes.append(
            f"m {f(x0 + r, y0)} l {f(x1 - r, y0)} b {f(x1 - c, y0, x1, y0 + c, x1, y0 + r)} "
            f"l {f(x1, y1 - r)} b {f(x1, y1 - c, x1 - c, y1, x1 - r, y1)} "
            f"l {f(x0 + r, y1)} b {f(x0 + c, y1, x0, y1 - c, x0, y1 - r)} "
            f"l {f(x0, y0 + r)} b {f(x0, y0 + c, x0 + c, y0, x0 + r, y0)}")
    return " ".join(partes)


def _num(v, lo, hi, padrao=0.0):
    try:
        return max(lo, min(hi, float(v)))
    except Exception:
        return padrao


def _lut_cube(n, b64):
    """LUT 3D do Luz e Cor (calculada na interface, editor-lc.js: Uint16 little-endian, r mais rápido)
    gravada como .cube. Mesmo conteúdo = mesmo arquivo (clipes cortados compartilham a LUT)."""
    n = int(n)
    if not 2 <= n <= 65:
        return None
    raw = base64.b64decode(b64)
    if len(raw) != n * n * n * 3 * 2:
        return None
    nome = os.path.join(_work_dir(), f"lc_{hashlib.md5(raw).hexdigest()[:16]}.cube")
    if not os.path.isfile(nome):
        v = array.array("H")
        v.frombytes(raw)
        if sys.byteorder != "little":
            v.byteswap()
        linhas = [f"LUT_3D_SIZE {n}"]
        for i in range(0, len(v), 3):
            linhas.append(f"{v[i] / 65535:.6f} {v[i + 1] / 65535:.6f} {v[i + 2] / 65535:.6f}")
        with open(nome, "w", encoding="ascii") as f:
            f.write("\n".join(linhas) + "\n")
    return nome


def _caminho_filtro(p):
    """Caminho de arquivo como valor de opção no grafo de filtros (Windows: 'C\\:/...')."""
    return "'" + p.replace("\\", "/").replace(":", "\\:").replace("'", "'\\''") + "'"


def _b3d_cantos(v, w, h, folga=0):
    """Básico 3D: cantos do quadro na tela (sup. esq., sup. dir., inf. esq., inf. dir.) — mesma conta de
    veB3dCantos (frontend/js/editor-fx.js). None se algum canto ficar atrás da câmera."""
    f = math.hypot(w, h)
    gi = _num(v.get("giro"), -180, 180) * math.pi / 180
    it = _num(v.get("incl"), -180, 180) * math.pi / 180
    dz = _num(v.get("dist"), -50, 200) / 100.0 * f
    hw, hh = w / 2 + folga, h / 2 + folga
    out = []
    for x, y in ((-hw, -hh), (hw, -hh), (-hw, hh), (hw, hh)):
        y1, z1 = y * math.cos(it), -y * math.sin(it)
        x2, z2 = x * math.cos(gi) + z1 * math.sin(gi), -x * math.sin(gi) + z1 * math.cos(gi) + dz
        p = f + z2
        if p < f * 0.05:
            return None
        out.append((w / 2 + x2 * f / p, h / 2 + y1 * f / p))
    return out


_bbox_cache = {}


def _bbox_alfa(path, margem=2):
    """(x, y, w, h, W, H) da parte visível (alfa > 0) de uma imagem, com margem e lados pares; None se ocupa quase tudo,
    não tem alfa ou não deu para ler. Texto e logo em PNG do tamanho da tela inteira: o grafo trabalhava o quadro
    todo (zoom, opacidade e overlay de 1080×1920) por umas poucas linhas de letra."""
    try:
        chave = (path, os.path.getmtime(path))
    except OSError:
        return None
    if chave in _bbox_cache:
        return _bbox_cache[chave]
    r = None
    try:
        from PIL import Image
        with Image.open(path) as im:
            if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
                W, H = im.size
                bb = im.convert("RGBA").getchannel("A").getbbox()
                if bb:
                    x0, y0 = max(0, bb[0] - margem) // 2 * 2, max(0, bb[1] - margem) // 2 * 2
                    x1, y1 = min(W, bb[2] + margem), min(H, bb[3] + margem)
                    w, h = (x1 - x0 + 1) // 2 * 2, (y1 - y0 + 1) // 2 * 2
                    w, h = min(w, W - x0), min(h, H - y0)
                    if w * h < 0.8 * W * H and w >= 2 and h >= 2:
                        r = (x0, y0, w, h, W, H)
    except Exception:
        r = None
    _bbox_cache[chave] = r
    return r


# efeito que a camada de ajuste aplica depois da volta para YUV (nitidez do Luz e Cor): marcado na lista de _filtros_fx
_NIT_NO_YUV = "@yuv:"
_mascaras_vinheta = {}


def _mascara_vinheta(w, h, ang):
    """PNG w×h com o fator da vinheta (o próprio filtro vignette num quadro branco, faixa cheia): multiplicar o quadro
    por ela é a vinheta do Luz e Cor (±1 nível). Feita uma vez por tamanho/ângulo; None se não der para gerar."""
    w, h = int(w), int(h)
    chave = (w, h, round(ang, 5))
    p = _mascaras_vinheta.get(chave)
    if p and os.path.isfile(p):
        return p
    p = os.path.join(_work_dir(), f"vinheta_{w}x{h}_{chave[2]:.5f}.png")
    try:
        r = subprocess.run([ffmpeg_path(), "-y", "-v", "error", "-f", "lavfi", "-i",
                            f"color=c=white:s={w}x{h}:d=0.04,format=gbrp,vignette=angle={chave[2]:.5f}:dither=0",
                            "-frames:v", "1", p], capture_output=True, timeout=30, creationflags=_creationflags())
        if r.returncode != 0 or not os.path.isfile(p):
            return None
    except Exception:
        return None
    _mascaras_vinheta[chave] = p
    return p


def _filtros_fx(fx, mw, mh, tag="x"):
    """Efeitos do clipe (mesma ordem e mesmas contas da prévia do editor, em frontend/js/editor-fx.js).
    Rodam no tamanho original da mídia, antes de escala/posição/rotação/opacidade (como no Premiere).
    tag = prefixo único para rótulos internos do grafo."""
    out = []
    crop_rect = None
    for cf in fx or []:
        if str(cf.get("t")) != "crop" or cf.get("on") is False:
            continue
        cv = cf.get("v") or {}
        l, tp, r, bt = (_num(cv.get(k), 0, 99.5) / 100.0 for k in ("l", "t", "r", "b"))
        cx, cy = mw * l, mh * tp
        crop_rect = (cx, cy, max(1.0, mw * (1.0 - r) - cx), max(1.0, mh * (1.0 - bt) - cy))
        break
    for j, f in enumerate(fx or []):
        t, v = str(f.get("t")), f.get("v") or {}
        if t == "blur":
            # desfoque em % do lado menor da mídia: 100% = sigma de 5% do lado menor
            sigma = _num(v.get("amt"), 0, 100) * max(2, min(mw, mh)) / 2000.0
            if sigma >= 0.05:
                out.append(f"gblur=sigma={min(sigma, 1000):.3f}:steps=3")
        elif t == "ca":
            # aberração cromática (frontend/js/editor-fx.js "ca"): cada canal ampliado a partir do centro e
            # recortado ao tamanho; o alfa fica o original
            ss = [1 + _num(v.get(k), -10, 10) * 0.0045 for k in ("r", "g", "b")]
            mn = min(ss)
            ss = [s / mn for s in ss]
            W, H = int(mw) // 2 * 2, int(mh) // 2 * 2
            if max(ss) > 1.0001 and W > 2 and H > 2:
                r = f"{tag}f{j}c"
                ramos = []
                for c, s in zip("rgb", ss):
                    sw, sh = max(W, int(round(W * s / 2)) * 2), max(H, int(round(H * s / 2)) * 2)
                    ramos.append(f"[{r}{c}]scale={sw}:{sh}:flags=bicubic,crop={W}:{H},setsar=1,format=gbrap,extractplanes={c}[{r}{c}p]")
                ca = (f"[{r}i]split=4[{r}r][{r}g][{r}b][{r}a];" + ";".join(ramos) +
                      f";[{r}a]setsar=1,extractplanes=a[{r}ap];[{r}gp][{r}bp][{r}rp][{r}ap]mergeplanes=0x00102030:gbrap")
                raio = _num(v.get("raio"), 0, 200) / 100.0
                if raio <= 0:   # sem queda: a camada toda
                    out.append(f"scale={W}:{H},setsar=1,format=gbrap[{r}i];" + ca + ",format=rgba")
                else:   # queda radial (bordas sem franja): cheio até meio raio, nada no raio; máscara pequena ampliada
                    q = f"255*clip(2-2*hypot(X-W/2\\,Y-H/2)/(min(W\\,H)*{raio:.4f})\\,0\\,1)"
                    out.append(f"scale={W}:{H},setsar=1,format=gbrap,split=3[{r}i][{r}o][{r}k];" + ca + f"[{r}x];"
                               f"[{r}k]scale=64:{max(2, round(64 * H / W))},format=gray,geq=lum='{q}',"
                               f"scale={W}:{H}:flags=bilinear,setsar=1,format=gbrap[{r}m];[{r}o][{r}x][{r}m]maskedmerge,format=rgba")
        elif t == "bc":
            b = 1 + _num(v.get("br"), -100, 100) / 100.0
            c = 1 + _num(v.get("ct"), -100, 100) / 100.0
            if abs(b - 1) > 1e-4 or abs(c - 1) > 1e-4:
                # igual ao filtro brightness()+contrast() do navegador
                e = f"clip((clip(val*{b:.4f},0,255)-127.5)*{c:.4f}+127.5,0,255)"
                out.append(f"lutrgb=r='{e}':g='{e}':b='{e}'")
        elif t == "key":
            # Chroma Key por diferença de cor (mesmas contas da prévia: veKeyDraw em editor-fx.js)
            if tag.startswith("a"):
                continue   # não vale em camada de ajuste
            ar, ag, ab = (_num(v.get(k), -2, 2) for k in ("ar", "ag", "ab"))
            dk, ganho = _num(v.get("dk"), 0.05, 1, 0.5), _num(v.get("ganho"), 0, 2, 1)
            cb, cw = _num(v.get("cb"), 0, 0.99), _num(v.get("cw"), 0.01, 1, 1)
            cw = max(cw, cb + 0.01)
            eq, spill = _num(v.get("eq"), 0, 1, 0.5), _num(v.get("spill"), 0, 1, 1)
            choke, suave = int(round(_num(v.get("choke"), -10, 10))), _num(v.get("suave"), 0, 20)
            a = f"clip(((1-{ganho:.5f}*(1-2*val/255)/{dk:.5f})-{cb:.5f})/{cw - cb:.5f},0,1)*255"
            cadeia = [f"colorchannelmixer=ar={ar:.5f}:ag={ag:.5f}:ab={ab:.5f}:aa=0.5",
                      # o alfa bruto sai do vídeo opaco; a imagem com transparência própria multiplica depois
                      f"lutrgb=a='{a}'"]
            if spill > 0.001:
                azul = 1 if v.get("azul") else 0
                cadeia.append(f"despill=type={azul}:mix={eq:.5f}:expand=0:red=0:green={-spill if not azul else 0:.4f}"
                              f":blue={-spill if azul else 0:.4f}:brightness=0:alpha=0")
            if choke or suave >= 0.05:
                cadeia.append("format=gbrap")
                morf = "erosion" if choke > 0 else "dilation"
                cadeia += [f"{morf}=threshold0=0:threshold1=0:threshold2=0"] * abs(choke)
                if suave >= 0.05:
                    cadeia.append(f"gblur=sigma={suave:.3f}:planes=8")
                cadeia.append("format=rgba")
            out.append(",".join(cadeia))
        elif t == "crop":
            l, tp, r, bt = (_num(v.get(k), 0, 100) / 100.0 for k in ("l", "t", "r", "b"))
            # a área cortada fica transparente (a camada de baixo aparece), sem mudar o tamanho
            caixa = "drawbox=x={x}:y={y}:w={w}:h={h}:color=black@0:t=fill:replace=1"
            if l > 0:
                out.append(caixa.format(x=0, y=0, w=f"'max(1,trunc(iw*{l:.5f}))'", h="ih"))
            if r > 0:
                out.append(caixa.format(x=f"'iw-max(1,trunc(iw*{r:.5f}))'", y=0, w=f"'max(1,trunc(iw*{r:.5f}))'", h="ih"))
            if tp > 0:
                out.append(caixa.format(x=0, y=0, w="iw", h=f"'max(1,trunc(ih*{tp:.5f}))'"))
            if bt > 0:
                out.append(caixa.format(x=0, y=f"'ih-max(1,trunc(ih*{bt:.5f}))'", w="iw", h=f"'max(1,trunc(ih*{bt:.5f}))'"))
        elif t == "luma":
            # Luma Key (veFx luma): luminância Rec.709 no alfa (colorchannelmixer), rampa Limite→Suavidade (lutrgb)
            # e multiplicada pelo alfa que a imagem já tinha
            if tag.startswith("a"):
                continue   # não vale em camada de ajuste
            lim = _num(v.get("lim"), 0, 100) / 100.0
            s = max(1 / 255.0, _num(v.get("suave"), 0, 100) / 100.0)
            k = f"clip((val/255-{lim:.5f})/{s:.5f},0,1)"
            if v.get("inv"):
                k = f"(1-{k})"
            r = f"{tag}f{j}"
            out.append(f"format=rgba,split[{r}a][{r}b];"
                       f"[{r}b]colorchannelmixer=ar=0.2126:ag=0.7152:ab=0.0722:aa=0,lutrgb=a='{k}*255',alphaextract[{r}m];"
                       f"[{r}a]split[{r}c][{r}d];[{r}d]alphaextract[{r}o];[{r}o][{r}m]blend=all_mode=multiply[{r}k];"
                       f"[{r}c][{r}k]alphamerge,format=rgba")
        elif t == "rounded":
            # cantos arredondados (veFxRaio): alfa × máscara com borda suavizada de 1 px, como o roundRect da prévia
            cx, cy, cw, ch = crop_rect or (0.0, 0.0, mw, mh)
            R = _num(v.get("raio"), 0, 100) / 100.0 * min(cw, ch) / 2.0
            if R >= 0.5:
                r = f"{tag}f{j}"
                if crop_rect is None:
                    dx = f"max(0,max({R:.3f}-X-0.5,X+0.5-W+{R:.3f}))"
                    dy = f"max(0,max({R:.3f}-Y-0.5,Y+0.5-H+{R:.3f}))"
                else:
                    x = f"(X-{cx:.3f})"
                    y = f"(Y-{cy:.3f})"
                    dx = f"max(0,max({R:.3f}-{x}-0.5,{x}+0.5-{cw:.3f}+{R:.3f}))"
                    dy = f"max(0,max({R:.3f}-{y}-0.5,{y}+0.5-{ch:.3f}+{R:.3f}))"
                out.append(f"format=rgba,split[{r}a][{r}b];[{r}b]alphaextract,"
                           f"geq=lum='p(X,Y)*clip({R + 0.5:.3f}-hypot({dx},{dy}),0,1)'[{r}m];"
                           f"[{r}a][{r}m]alphamerge,format=rgba")
        elif t == "b3d":
            # Básico 3D (veB3dCantos/veB3dDraw): os cantos projetados vão para o perspective. Borda transparente de
            # 2 px antes (o perspective repete a borda: repete transparente) e corte de volta ao tamanho da mídia.
            folga = 2
            k = _b3d_cantos(v, mw, mh, folga)
            if k is None:
                out.append("format=rgba,colorchannelmixer=aa=0")   # atrás da câmera: não aparece
            elif any(abs(_num(v.get(n), -1000, 1000)) > 1e-4 for n in ("giro", "incl", "dist")):
                pts = ":".join(f"{x + folga:.3f}:{y + folga:.3f}" for x, y in k)
                out.append(f"format=rgba,pad=iw+{2 * folga}:ih+{2 * folga}:{folga}:{folga}:color=black@0,"
                           f"format=gbrap,perspective={pts}:interpolation=linear:sense=destination,"
                           f"crop={mw}:{mh}:{folga}:{folga},format=rgba")
        elif t == "lc":
            # Luz e Cor: cor pela LUT (trilinear, igual à textura 3D da prévia), depois nitidez e vinheta
            if v.get("lut"):
                try:
                    cube = _lut_cube(v.get("n"), v["lut"])
                except Exception:
                    cube = None
                if cube:
                    out.append(f"lut3d=file={_caminho_filtro(cube)}:interp=trilinear")
            # Clareza (editor-lc.js: VE_LC_FS_CLAR): Y += k·(Y − gaussiano de Y)·4Y(1−Y), só na luma (BT.709, faixa
            # cheia, como a prévia); a cor (U/V) fica como está
            kc = _num(v.get("clar"), -2, 2)
            sig = _num(v.get("clar_s"), 0, 0.2) * min(mw, mh)
            if abs(kc) > 1e-4 and sig > 0.3:
                r = f"{tag}f{j}k"
                # em 10 bits: menos arredondamento nas duas conversões (a prévia faz em ponto flutuante)
                ida = "scale=out_color_matrix=bt709:out_range=pc,format=yuv444p10le"
                volta = "scale=in_color_matrix=bt709:in_range=pc,format=rgba"
                expr = f"clip(x+{kc:.5f}*(x-y)*4*x*(1023-x)/1046529,0,1023)"
                miolo = (f"{ida},split[{r}a][{r}b];[{r}b]gblur=sigma={sig:.3f}:planes=1[{r}c];"
                         f"[{r}a][{r}c]lut2=c0='{expr}':c1=x:c2=x,{volta}")
                if tag.startswith("a"):   # camada de ajuste: sem alfa para guardar
                    out.append(miolo)
                else:
                    out.append(f"format=rgba,split[{r}A][{r}B];[{r}B]alphaextract[{r}M];[{r}A]{miolo}[{r}C];"
                               f"[{r}C][{r}M]alphamerge,format=rgba")
            nit = _num(v.get("sharp"), 0, 5)
            ang = _num(v.get("vig"), 0, 1.5708)
            nit_depois = 0.0
            if nit > 0.001 and tag.startswith("a") and j == len(fx) - 1:
                # camada de ajuste com o Luz e Cor por último: a nitidez (só na luma) vai depois da volta para YUV
                # (_NIT_NO_YUV, ver exportar_video). Em RGBA o ffmpeg convertia para YUV e voltava só para ela
                # (7 ms/quadro em 1080×1920; no YUV, 3,6). A vinheta antes dela: varia devagar no quadro, a ordem
                # não muda a imagem (medido: 51 dB contra a cadeia antiga)
                nit_depois = nit
            elif nit > 0.001:
                # unsharp 5×5 só na luma (a prévia usa o mesmo núcleo binomial)
                out.append(f"unsharp=5:5:{nit:.4f}:5:5:0,format=rgba")
            if ang > 0.001 and tag.startswith("a"):
                # camada de ajuste: o vídeo embaixo é opaco, não há alfa para guardar. A vinheta é uma máscara feita
                # uma vez pelo próprio vignette (num quadro branco) e multiplicada (blend, em paralelo): o vignette
                # refazia a conta em ponto flutuante numa thread só (10 ms/quadro em 1080×1920; o blend, ~2)
                mascara = _mascara_vinheta(mw, mh, ang)
                if mascara:
                    r = f"{tag}f{j}v"
                    out.append(f"format=gbrp[{r}a];movie={_caminho_filtro(mascara)},format=gbrp,loop=-1:size=1[{r}m];"
                               f"[{r}a][{r}m]blend=all_mode=multiply:shortest=1,format=rgba")
                else:
                    out.append(f"format=gbrp,vignette=angle={ang:.5f}:dither=0,format=rgba")
            if nit_depois:
                out.append(_NIT_NO_YUV + f"unsharp=5:5:{nit_depois:.4f}:5:5:0")
            elif ang > 0.001:
                # vignette não trabalha com alfa: escurece o RGB e devolve o alfa original
                r = f"{tag}f{j}"
                out.append(f"format=rgba,split[{r}a][{r}b];[{r}a]format=gbrp,vignette=angle={ang:.5f}:dither=0[{r}c];"
                           f"[{r}b]alphaextract[{r}m];[{r}c][{r}m]alphamerge,format=rgba")
    return out


# Modos de mesclagem (VE_BM em frontend/js/editor-fx.js) → blend do ffmpeg com a CAMADA como 1ª entrada. Medido
# contra as fórmulas do canvas: o overlay/hardlight do ffmpeg testam a outra entrada, por isso vão trocados.
_BLEND_FF = {
    "darken": "darken", "multiply": "multiply", "colorburn": "burn", "lighten": "lighten", "screen": "screen",
    "colordodge": "dodge", "add": "addition", "overlay": "hardlight", "softlight": "softlight",
    "hardlight": "overlay", "difference": "difference", "exclusion": "exclusion",
}


def _ca_exprs(ca, tv):
    """Animações constantes do clipe (painel Animação → Constante; veCaAplicar em editor-fx.js faz a mesma conta),
    no tempo `tv` (segundos desde o início do clipe): multiplica a escala, soma à rotação (graus) e à posição (px)."""
    sc, rot, dx, dy = [], [], [], []

    def onda(f, r, fase):   # −1..1: balanço suave (r = 0) até tremida nervosa (r = 1), a mesma de veCaOnda
        a = f"(2*PI*{f:.5f}*{tv})"
        return (f"((1-{r:.4f})*sin({a}+{fase:.4f})+{r:.4f}*(0.6*sin({a}*2.37+{fase * 1.7 + 1.3:.4f})"
                f"+0.4*sin({a}*4.11+{fase * 2.3 + 2.9:.4f})))")
    for f in ca or []:
        t, v = f.get("t"), f.get("v") or {}
        if t == "ca_rot":
            vel = _num(v.get("vel"), 0, 20)
            if vel > 0:
                rot.append(f"({-1 if v.get('esq') else 1}*{vel * 360:.5f}*{tv})")
        elif t == "ca_pul":
            tam, vel = _num(v.get("tam"), 0, 300) / 100, _num(v.get("vel"), 0, 30)
            if tam > 0 and vel > 0:
                sc.append(f"(1+{tam:.5f}*(0.5-0.5*cos(2*PI*{vel:.5f}*{tv})))")
        elif t == "ca_wig":
            area, vel, r = _num(v.get("area"), 0, 5000), _num(v.get("vel"), 0, 60), _num(v.get("int"), 0, 100) / 100
            if area > 0 and vel > 0:
                dx.append(f"({area:.3f}*{onda(vel, r, 0.3)})")
                dy.append(f"({area:.3f}*{onda(vel, r, 2.1)})")
    junta = lambda xs, op: op.join(xs) if xs else None
    return {"sc": junta(sc, "*"), "rot": junta(rot, "+"), "dx": junta(dx, "+"), "dy": junta(dy, "+")}


def _ca_pulso_max(ca):
    """Maior fator de escala das animações constantes (só Pulsar mexe na escala): 1 + tam de cada pulso."""
    k = 1.0
    for f in ca or []:
        if f.get("t") == "ca_pul":
            v = f.get("v") or {}
            if _num(v.get("vel"), 0, 30) > 0:
                k *= 1 + _num(v.get("tam"), 0, 300) / 100
    return k


_alfa_cache = {}


_marca_cache = {}


def _marca_hd(path):
    """'setparams=...,' que marca como BT.709 um vídeo HD sem marca de cor (a convenção do navegador, ou seja, da prévia,
    e dos players). Sem ela o ffmpeg novo trata a entrada como BT.601 e converte ao gravar a saída marcada BT.709: a
    exportação saía mais saturada que a prévia (teste_export: até 30 níveis em vermelho/verde/ciano)."""
    try:
        chave = (path, os.path.getmtime(path))
    except (OSError, TypeError):
        return ""
    if chave not in _marca_cache:
        marca = ""
        try:
            if not _eh_imagem(path):
                i = probe(path)
                cs = str(i.get("color_space") or "").lower()
                if cs in ("", "unknown", "unspecified", "reserved") and min(int(i.get("width") or 0), int(i.get("height") or 0)) >= 720:
                    marca = "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709,"
        except Exception:
            pass
        _marca_cache[chave] = marca
    return _marca_cache[chave]


def _clipe_tem_alfa(path):
    """Clipe com transparência (o arquivo é consultado uma vez enquanto não mudar)."""
    try:
        chave = (path, os.path.getmtime(path))
    except OSError:
        return True
    if chave not in _alfa_cache:
        try:
            _alfa_cache[chave] = bool(probe(path).get("alfa"))
        except Exception:
            _alfa_cache[chave] = True   # na dúvida, o caminho em RGBA (mais lento, mas guarda o alfa)
    return _alfa_cache[chave]


def _normalizar_camadas(camadas, path_video):
    """Camadas por cima da base, de baixo para cima: imagens e clipes de vídeo transformados."""
    out = []
    for c in camadas or []:
        try:
            tipo = c.get("tipo")
            st = max(0.0, float(c["st"]))
            s, e = float(c.get("s", 0)), float(c.get("e", 0))
            vel = max(0.05, min(20.0, float(c.get("v") or 1)))
            if e - s < 0.04:
                continue
            item = {
                "tipo": tipo if tipo in ("imagem", "ajuste") else "video",
                "path": c.get("path") if tipo == "imagem" else None if tipo == "ajuste" else (c.get("path") or path_video),
                "st": st, "s": max(0.0, s), "dur": (e - s) / vel, "fonte": e - s, "v": vel,
                "sc": max(0.5, min(2000.0, float(c.get("sc", 100)))) / 100.0,
                "x": float(c.get("x", 0)), "y": float(c.get("y", 0)),
                "rot": float(c.get("rot", 0)) % 360,
                "op": max(0.0, min(100.0, float(c.get("op", 100)))) / 100.0,
                "kf": _normalizar_kf(c.get("kf")),
                "fx": [f for f in (c.get("fx") or []) if isinstance(f, dict)],
                "mw": _num(c.get("mw"), 2, 20000, 1920), "mh": _num(c.get("mh"), 2, 20000, 1080),
                # ponto de ancoragem: do ponto até o centro da mídia, em px da mídia (0 = âncora no centro)
                "ox": _num(c.get("ox"), -1e5, 1e5, 0), "oy": _num(c.get("oy"), -1e5, 1e5, 0),
                # texto animado: lista de quadros PNG (demuxer concat) no lugar da imagem parada
                "seq": c.get("seq") if tipo == "imagem" and c.get("seq") and os.path.isfile(str(c.get("seq"))) else None,
                "bm": c.get("bm") if c.get("bm") in _BLEND_FF and tipo != "ajuste" else None,
                "ca": [f for f in (c.get("ca") or []) if isinstance(f, dict) and tipo != "ajuste"],
            }
        except Exception:
            continue
        if item["tipo"] in ("imagem", "video") and not (item["path"] and os.path.isfile(item["path"])):
            continue
        out.append(item)
    return out


def _camadas_na_grade(lay, fps):
    """Início e fim de cada camada no quadro em que a prévia passa a mostrá-la (o 1º quadro com t >= início).
    Fora da grade (corte na batida exata, 1,997 s; ou 0,2333340 por arredondamento num trecho recortado) a camada
    que sai e a que entra não cobriam o quadro do corte: saía um quadro preto. O que anda junto (trecho da fonte,
    quadros-chave) acompanha o deslocamento, que é menor que um quadro."""
    fps = max(1.0, float(fps or 30))
    for c in lay:
        a = math.ceil(c["st"] * fps - 1e-3) / fps
        b = math.ceil((c["st"] + c["dur"]) * fps - 1e-3) / fps
        if b - a < 0.5 / fps:
            continue
        d = a - c["st"]
        c["s"] = max(0.0, c["s"] + d * c["v"])
        c["kf"] = {k: [(t - d, v, i, bz) for t, v, i, bz in pts] for k, pts in c["kf"].items()}
        c["st"], c["dur"] = a, b - a
        c["fonte"] = c["dur"] * c["v"]


def _sombra_camada(c):
    """Sombra projetada da camada (efeito 'sombra'): (R, G, B, opacidade 0..1, dx, dy, desvio do desfoque) ou None."""
    if c.get("tipo") == "ajuste":
        return None
    for f in c.get("fx") or []:
        if f.get("t") != "sombra" or f.get("on") is False:
            continue
        v = f.get("v") or {}
        op = _num(v.get("op"), 0, 100, 60) / 100
        if op <= 0.001:
            return None
        cor = str(v.get("cor") or "#000000")
        try:
            R, G, B = int(cor[1:3], 16), int(cor[3:5], 16), int(cor[5:7], 16)
        except ValueError:
            R = G = B = 0
        a = math.radians(_num(v.get("ang"), -720, 720, 135))
        d = _num(v.get("dist"), 0, 5000, 12)
        return R, G, B, op, -math.cos(a) * d, math.sin(a) * d, _num(v.get("tam"), 0, 2500, 16) / 2
    return None


def _reduzir_camada(c, k):
    """Camada normalizada (_normalizar_camadas) num quadro k vezes menor: px do quadro × k."""
    c["sc"] *= k
    c["x"] *= k
    c["y"] *= k
    for p in ("sc", "x", "y"):
        if p in c["kf"]:
            c["kf"][p] = [(t, v * k, i, bz) for t, v, i, bz in c["kf"][p]]
    for f in c.get("ca") or []:
        v = f.get("v")
        if f.get("t") == "ca_wig" and isinstance(v, dict):
            f["v"] = dict(v, area=_num(v.get("area"), 0, 5000) * k)
    for f in c.get("fx") or []:   # a sombra é medida em px do quadro
        v = f.get("v")
        if f.get("t") == "sombra" and isinstance(v, dict):
            f["v"] = dict(v, dist=_num(v.get("dist"), 0, 5000, 12) * k, tam=_num(v.get("tam"), 0, 2500, 16) * k)


_opcao_script = None


def _opcao_filtro_script():
    """ffmpeg 7+ lê o grafo de arquivo com '-/filter_complex'; o '-filter_complex_script'
    antigo foi removido nas versões novas. Detecta uma vez qual o ffmpeg instalado aceita."""
    global _opcao_script
    if _opcao_script is None:
        try:
            r = subprocess.run([ffmpeg_path(), "-hide_banner", "-f", "lavfi", "-i", "nullsrc=d=0.04",
                                "-/filter_complex", os.devnull, "-f", "null", "-"],
                               capture_output=True, text=True, timeout=15, creationflags=_creationflags())
            antigo = "unrecognized option" in (r.stderr or "").lower()
        except Exception:
            antigo = False
        _opcao_script = "-filter_complex_script" if antigo else "-/filter_complex"
    return _opcao_script


def _export_usa_fonte(segmentos, audio_segmentos=None, camadas=None, audio_clipes=None, sem_audio=False):
    """True quando o plano ainda precisa ler o arquivo aberto em `path`."""
    def trecho_fonte(lista):
        for s in lista or []:
            if isinstance(s, dict):
                if s.get("gap") is None:
                    return True
            elif isinstance(s, (list, tuple)) and (not s or s[0] != "gap"):
                return True
        return False

    if trecho_fonte(segmentos):
        return True
    if not sem_audio and audio_segmentos is not None and trecho_fonte(audio_segmentos):
        return True
    for c in camadas or []:
        if not isinstance(c, dict):
            continue
        tipo = c.get("tipo")
        if tipo not in ("imagem", "ajuste") and not c.get("path"):
            return True
    if not sem_audio:
        for c in audio_clipes or []:
            if isinstance(c, dict):
                continue
            if isinstance(c, (list, tuple)) and (len(c) <= 4 or not c[4]):
                return True
    return False


def exportar_video(path, segmentos, formato_saida="mp4", qualidade="medium", resolucao="original",
                   usar_gpu=True, pasta_saida=None, on_progress=None, stop_event=None, sem_audio=False,
                   camadas=None, audio_segmentos=None, duracao=None, audio_clipes=None, legendas=None, quadro=None,
                   saida=None, previa_h=0, proc_holder=None, opcoes=None, alfa=False, alfa_leve=False, janela=None):
    """
    Exporta a timeline do editor.
    saida/previa_h  = prévia renderizada (render_cache.py): arquivo fixo, sem som, H.264 leve de decodificar
                      (GOP curto: buscar é rápido), lado menor até previa_h px; proc_holder guarda o processo
    alfa            = Comp (render_cache.renderizar_comp): fundo transparente, ProRes 4444 com alfa em .mov
                      (som em PCM), no tamanho do quadro; vazios e sobras ficam transparentes
    quadro          = [largura, altura] da sequência (Configurações da sequência); sem ele, o tamanho do vídeo aberto
    segmentos       = base de vídeo em ordem ([{start, end, gain}] do original ou {gap: s})
    audio_segmentos = trilha de áudio (mesmo formato); se None, usa os segmentos da base
    camadas         = imagens/clipes transformados por cima da base (de baixo para cima)
    audio_clipes    = [[st, s, e, ganho_db]] de TODOS os clipes com som: as trilhas são somadas (_grafo_mix).
    legendas        = {itens: [{st, en, texto}], estilo: {...}}: gravadas no vídeo (arquivo .ass + subtitles)
                      Com ele, audio_segmentos é ignorado.
    opcoes          = {nome, codec: h264|hevc|prores, bits: 8|10, mbps: taxa alvo (0 = qualidade constante)}
    on_progress(pct, mensagem)
    """
    global _export_proc
    prog = on_progress or (lambda p, m: None)
    if path and not os.path.isfile(path) and not _export_usa_fonte(segmentos, audio_segmentos, camadas, audio_clipes, sem_audio):
        path = ""
    if not path:
        # projeto sem vídeo principal (tudo veio do painel Projeto): fundo preto no tamanho da sequência;
        # a saída leva o nome e a pasta do projeto
        try:
            w, h = (int(quadro[0]), int(quadro[1])) if quadro else (1920, 1080)
            path = _base_preta(w, h)
        except Exception as e:
            return {"success": False, "error": f"Não foi possível preparar o fundo da exportação: {e}"}
        projeto = str((opcoes or {}).get("projeto") or "")
        aberto = (os.path.splitext(projeto)[0] + ".mp4" if projeto
                  else os.path.join(os.path.expanduser("~"), "Videos", "Video editado.mp4"))
    elif not os.path.isfile(path):
        return {"success": False, "error": "Arquivo não encontrado."}
    else:
        aberto = path   # nome e pasta da saída vêm do que o usuário abriu
    if _eh_imagem(path):
        path = _base_imagem(path)   # timeline que começou por uma imagem: fundo preto no tamanho dela
    # Modo placa (Functions/export_placa.py): a timeline inteira montada na placa de vídeo (Vulkan + libplacebo), como
    # o Premiere. O que ele ainda não sabe fazer (motivo) ou uma falha na placa seguem pela CPU, abaixo
    if (janela is None and camadas and not saida and not previa_h and not alfa and usar_gpu
            and not (isinstance(opcoes, dict) and opcoes.get("blocos"))
            and not FORMATOS_SAIDA.get(str(formato_saida).lower(), {}).get("audio_only")):
        from Functions import export_placa
        args_placa = dict(path=path, segmentos=segmentos, formato_saida=formato_saida, qualidade=qualidade,
                          resolucao=resolucao, usar_gpu=usar_gpu, sem_audio=sem_audio, camadas=camadas,
                          audio_segmentos=audio_segmentos, duracao=duracao, audio_clipes=audio_clipes, legendas=legendas,
                          quadro=quadro, opcoes=opcoes)
        try:
            r = export_placa.exportar(args_placa, aberto, pasta_saida, prog, stop_event, proc_holder)
        except Exception as e:
            r = {"success": False, "error": f"placa: {e}"}
        if r is not None and (r.get("success") or r.get("cancelled")):
            return r
        if r is not None:
            prog(0, "A placa não conseguiu; exportando pela CPU...")
            _ultimo_motivo_placa[0] = r.get("error") or ""
        else:
            _ultimo_motivo_placa[0] = args_placa.get("_motivo") or ""
    # por blocos só com a base de fundo (sequência noutro tamanho: tudo vira camada). Base com trechos do vídeo
    # principal: cada trecho é arredondado em quadros desde o zero e um bloco no meio dela saía um quadro deslocado
    if (janela is None and isinstance(opcoes, dict) and opcoes.get("blocos") and camadas and not saida and not previa_h
            and not alfa and not FORMATOS_SAIDA.get(str(formato_saida).lower(), {}).get("audio_only")
            and all(isinstance(s, dict) and s.get("gap") is not None for s in segmentos or [])):
        return _exportar_em_blocos(dict(
            path=path, segmentos=segmentos, formato_saida=formato_saida, qualidade=qualidade, resolucao=resolucao,
            usar_gpu=usar_gpu, sem_audio=sem_audio, camadas=camadas, audio_segmentos=audio_segmentos,
            duracao=duracao, audio_clipes=audio_clipes, legendas=legendas, quadro=quadro, opcoes=opcoes),
            aberto, pasta_saida, prog, stop_event)

    formato_saida = str(formato_saida).lower()
    cfg = FORMATOS_SAIDA.get(formato_saida, FORMATOS_SAIDA["mp4"])
    q = _QUALIDADE.get(str(qualidade).lower(), _QUALIDADE["medium"])
    alvo_h = _RESOLUCOES.get(str(resolucao), 0)
    previa = bool(saida and previa_h)
    if previa:
        cfg, alvo_h, sem_audio, usar_gpu = FORMATOS_SAIDA["mp4"], int(previa_h), True, False
    op = opcoes if isinstance(opcoes, dict) and not previa else {}
    codec = str(op.get("codec") or "h264").lower()
    if cfg.get("vcodec") == "h264" and codec == "prores":
        cfg = dict(FORMATOS_SAIDA["mov"], vcodec="prores", acodec="pcm_s16le")   # ProRes só em .mov, som sem perda
    elif cfg.get("vcodec") == "h264" and codec == "hevc":
        cfg = dict(cfg, vcodec="hevc")
    bits = 10 if str(op.get("bits")) == "10" and cfg.get("vcodec") in ("hevc", "prores") else 8
    try:
        mbps = max(0.0, min(500.0, float(op.get("mbps") or 0)))
    except (TypeError, ValueError):
        mbps = 0.0
    # formato de pixel do grafo: 10 bits de ponta a ponta quando a saída é 10 bits (fonte 10 bits não vira 8)
    pixfmt = "yuv422p10le" if cfg.get("vcodec") == "prores" else "yuv420p10le" if bits == 10 else "yuv420p"
    if alfa:
        # Comp: o grafo inteiro com alfa (o overlay "auto" compõe o alfa da base com o das camadas)
        cfg = dict(FORMATOS_SAIDA["mov"], vcodec="prores4444", acodec="pcm_s16le")
        alvo_h, usar_gpu, previa, pixfmt = 0, False, False, "yuva444p"
    fundo = "black@0" if alfa else "black"

    info = probe(path)
    # a timeline (e a saída) roda na taxa CRAVADA, não na média do arquivo base (taxa_timeline)
    info = {**info, "fps": info.get("fps_timeline") or taxa_timeline(info.get("fps"))}
    audio_only = bool(cfg.get("audio_only")) or not info["has_video"]
    # som de clipes soltos na mixagem (projeto sem vídeo principal: a base é o fundo preto mudo) também conta
    som_solto = any(isinstance(c, (list, tuple)) and len(c) > 4 and c[4] for c in audio_clipes or [])
    if audio_only and not info["has_audio"] and not som_solto:
        return {"success": False, "error": "Este arquivo não tem som para exportar em áudio."}
    if audio_only and not cfg.get("audio_only"):
        cfg = FORMATOS_SAIDA["mp3"]   # fonte só de áudio sempre sai como áudio
    if audio_only:
        camadas = None
        sem_audio = False
    W0, H0 = info["width"] or 1920, info["height"] or 1080
    W0, H0 = W0 + (W0 % 2), H0 + (H0 % 2)
    W, H = W0, H0
    try:
        if quadro:
            W, H = max(16, min(8192, int(quadro[0]))), max(16, min(8192, int(quadro[1])))
    except (TypeError, ValueError, IndexError):
        pass
    W, H = W + (W % 2), H + (H % 2)
    fps = f'{info["fps"]:.3f}'
    frame_dur = 1.0 / max(float(info["fps"] or 30), 1.0)

    pecas = _normalizar_segmentos(segmentos, info["duration"])
    pecas_a = pecas if audio_segmentos is None else _normalizar_segmentos(audio_segmentos, info["duration"])
    lay = _normalizar_camadas(camadas, path)
    _camadas_na_grade(lay, info["fps"])
    if janela and janela.get("t0"):
        # bloco da exportação por blocos: a timeline começa no início dele. Camada que já vinha tocando fica com início
        # negativo e o mesmo tempo interno (animações iguais); o vídeo dela é lido só a partir do bloco ("pula")
        for c in lay:
            c["st"] -= janela["t0"]
            if c["st"] < -1e-6 and c["tipo"] == "video":
                c["pula"] = -c["st"]
    # Saída menor que o quadro (4K → 1080p) com camadas: compõe direto no tamanho da saída em vez de compor em 4K e
    # reduzir no fim. Posição, escala, quadros-chave e tremida das camadas são em px do quadro e vão na mesma
    # proporção; os efeitos já medem em % da mídia. Medido (teste 4K, 3 PiPs + texto + ajuste, 20 s): 4K e 1080p
    # levavam o mesmo tempo (~140 s). Legendas continuam medidas no quadro original (o libass escala o .ass).
    Wq, Hq = W, H
    red = 1.0
    if lay and alvo_h and not audio_only and min(W, H) > alvo_h:
        red = alvo_h / min(W, H)
        W, H = int(round(W * red / 2)) * 2, int(round(H * red / 2)) * 2
        for c in lay:
            _reduzir_camada(c, red)
    if previa:
        for c in lay:
            _camada_no_proxy(c)
    if (previa or (janela and janela.get("nvdec"))) and _detectar_hw_encoder() == "h264_nvenc":
        for c in lay:
            _camada_reduz_na_placa(c)
    # Hard Limiter no Master: vem no fim da lista do mix como {"master": {...}} (editor.js: veExportar)
    master_lim = None
    if audio_clipes is not None:
        for c in audio_clipes:
            if isinstance(c, dict) and isinstance(c.get("master"), dict):
                master_lim = (_normalizar_afx([{"t": "limiter", "v": c["master"]}]) or [(None, None)])[0][1]
        audio_clipes = [c for c in audio_clipes if not isinstance(c, dict)]
    mix = _normalizar_mix(audio_clipes, info["duration"]) if audio_clipes is not None else None
    segs = [p for p in pecas if p[0] != "gap"]
    if not segs and not lay and not any(p[0] != "gap" for p in pecas_a) and not mix and not janela:   # bloco vazio = preto
        return {"success": False, "error": "Nada para exportar: todos os trechos foram removidos."}

    # duração final: a maior entre base, áudio, camadas e a informada pela timeline
    # (com o mix, os trechos de áudio antigos não valem: medem a fonte, não a timeline, se houver velocidade)
    total = max([sum(_dur_peca(p) for p in pecas)] + ([] if mix is not None else [sum(_dur_peca(p) for p in pecas_a)])
                + [c["st"] + c["dur"] for c in lay] + [float(duracao or 0)]
                + [_fim_mix(c) for c in (mix or [])])
    if total < 0.04:
        return {"success": False, "error": "Nada para exportar."}
    # bloco da exportação por blocos: o progresso é o do pedaço
    total_prog = janela["quadros"] / max(1.0, float(fps)) if janela else total

    def _completar(lista):
        falta = total - sum(_dur_peca(p) for p in lista)
        return list(lista) + ([("gap", falta)] if falta > 0.02 else [])

    simples = not lay and audio_segmentos is None and mix is None
    if not simples or janela:   # bloco sem nada: o vazio completa até a duração (preto)
        pecas, pecas_a = _completar(pecas), _completar(pecas_a)
    saida = saida or _nome_saida(aberto, cfg["ext"], pasta_saida, op.get("nome"))
    # o ffmpeg grava num temporário ao lado (nome.part.mp4) e só no fim ele vira o arquivo: falha, cancelamento ou
    # app fechado no meio nunca deixam um vídeo pela metade com o nome final (nem apagam um anterior de mesmo nome)
    destino = saida
    if not janela:
        b, e = os.path.splitext(destino)
        saida = b + ".part" + e
    if mix and not sem_audio and any(t == "antinoise" for c in mix for t, _ in c[9]):
        prog(0, "Aplicando Anti Noise...")
        mix = _pre_antinoise(mix, path, info["has_audio"], _work_dir())
    if mix and not sem_audio and any(t == "limiter" for c in mix for t, _ in c[9]):
        prog(0, "Aplicando Hard Limiter...")
        mix = _pre_limitar(mix, path, info["has_audio"], _work_dir())
    if mix and not sem_audio and master_lim:
        prog(0, "Aplicando Hard Limiter no Master...")
        mix = _limitar_master(mix, path, info["has_audio"], total, master_lim, _work_dir())
    # áudios soltos na timeline dão som ao vídeo mesmo que o vídeo aberto não tenha
    extras = sorted({c[4] for c in (mix or []) if c[4]})
    if mix is not None and not info["has_audio"]:
        mix = [c for c in mix if c[4]]
    has_audio = (info["has_audio"] or bool(extras)) and not sem_audio
    audio_junto = pecas_a == pecas and mix is None   # mesmas peças: o áudio sai das mesmas entradas do vídeo

    tem_ganho = any(p[2] for p in segs)
    tem_vazio = len(segs) != len(pecas)
    em_ordem = all(segs[k][0] >= segs[k - 1][1] - 0.001 for k in range(1, len(segs)))
    # select/aselect só serve para o caso simples: em ordem, sem vazios, sem ganho e sem camadas
    # quadro da sequência diferente do vídeo: cada trecho precisa ser encaixado (o select não redimensiona)
    outro_quadro = (W, H) != (W0, H0)
    usar_inputs = (not simples or len(pecas) <= 150 or not em_ordem or tem_vazio or (tem_ganho and has_audio)
                   or outro_quadro)
    if audio_only:
        # só o áudio: nenhuma cadeia de vídeo no grafo
        usar_inputs, audio_junto = True, False
        pecas = pecas_a = _completar(pecas_a)
    # Matriz YUV↔RGB das camadas (clipes com efeito/transformação, imagens, textos). Sem ela o ffmpeg usa BT.601 e
    # vídeo HD (BT.709, o que a prévia mostra) perdia as cores saturadas na ida para RGB (até ~27 níveis de 255).
    cs = str(info.get("color_space") or "").lower()
    mtx = ("bt2020" if cs.startswith("bt2020") else "bt601" if cs in ("bt470bg", "smpte170m")
           else "bt709" if cs == "bt709" or min(W0, H0) >= 720 else "bt601")
    para_rgb = f"scale=in_color_matrix={mtx},format=rgba"
    # foto (JPEG, WebP): YUV em BT.601 (faixa cheia no JPEG) seja qual for o vídeo; com a matriz HD as fotos saíam mais
    # escuras e saturadas que na prévia (teste_export, caso grade: verde 8 níveis). PNG é RGB: não muda nada
    para_rgb_img = "scale=in_color_matrix=bt601,format=rgba"
    de_rgb = f"scale=out_color_matrix={mtx}:out_range=tv,format=yuva420p"
    # Camada com mesclagem ou de ajuste leva o quadro inteiro para RGB e de volta: em 4:2:0 a cor perdia um pouco a
    # cada camada (12 camadas = faixas e ~12 níveis de diferença no teste_export). Com elas a composição trabalha em
    # 4:4:4 e só a saída volta para o formato do arquivo.
    pixfmt_saida = pixfmt
    if pixfmt == "yuv420p" and any(c.get("bm") or c["tipo"] == "ajuste" for c in lay):
        pixfmt = "yuv444p"
    de_rgb_t = f"scale=out_color_matrix={mtx}:out_range=tv,format={'yuva444p' if pixfmt == 'yuv444p' else 'yuva420p'}"
    # Modo turbo: timeline só de cortes (sem camadas, textos, legendas, efeitos) com NVENC → a fonte é decodificada
    # na placa e fica na memória dela até o encoder (sem descer para a RAM). Mesma velocidade ou mais, com a CPU
    # quase parada. Fonte girada, 4:2:2/4:4:4 ou quadro com outra proporção ficam no modo normal.
    tem_legenda = bool(legendas and legendas.get("itens"))
    enc_gpu = _detectar_hw_encoder(cfg["vcodec"], bits) if (usar_gpu and not audio_only and cfg["vcodec"] in ("h264", "hevc")) else None
    mesma_proporcao = abs(W / H - W0 / H0) < 0.01
    turbo = bool(enc_gpu and enc_gpu.endswith("_nvenc") and not previa and usar_inputs and not lay and not tem_legenda
                 and info.get("vcodec") in ("h264", "hevc", "vp9", "av1", "mpeg2video", "vp8") and not info.get("rotation")
                 and info.get("pix_fmt", "") in ("yuv420p", "yuvj420p", "yuv420p10le", "nv12", "p010le")
                 and mesma_proporcao and any(p[0] != "gap" for p in pecas))
    fmt_cuda = "p010le" if bits == 10 else "nv12"
    # clipes decodificados na placa (NVDEC): prévia renderizada e blocos com poucos vídeos ao mesmo tempo (na exportação
    # inteira eram 25 leituras 8K abertas juntas: não cabem nos 8 GB da placa)
    nvdec_previa = (previa or bool(janela and janela.get("nvdec"))) and _detectar_hw_encoder() == "h264_nvenc"

    def _montar(turbo):
        """Comando e grafo de filtros. turbo = tudo na placa de vídeo (NVDEC → scale_cuda → NVENC)."""
        cmd = [ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1"]
        filtros = []
        entrada = 0

        def _entrada_peca(p, video):
            """Adiciona a entrada de uma peça (trecho ou vazio) e devolve o índice."""
            nonlocal entrada
            if p[0] == "gap":
                src = f"color=c=black:s={W}x{H}:r={fps}" if video else "anullsrc=r=48000:cl=stereo"
                cmd.extend(["-f", "lavfi", "-t", _tempo_ffmpeg(p[1]), "-i", src])
            else:
                cmd.extend(["-ss", _tempo_ffmpeg(p[0]), "-t", _tempo_ffmpeg(p[1] - p[0]), "-i", path])
            entrada += 1
            return entrada - 1

        def _filtro_audio(idx, p, rotulo):
            vol = f",volume={p[2]:.2f}dB" if p[0] != "gap" and p[2] else ""
            filtros.append(f"[{idx}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                           f"asetpts=PTS-STARTPTS{vol}[{rotulo}]")

        if usar_inputs:
            # Uma única leitura da fonte + trim por trecho evita frames pretos/danificados no começo de cortes
            # em vídeos long-GOP/VFR (comuns em arquivos de celular/WhatsApp). Espaços vazios ainda viram preto.
            # Velocidade: cada grupo de trechos próximos (até 20 s entre eles) tem a sua leitura, que começa 3 s antes
            # do grupo (-ss antes do -i pula direto para lá). Antes a fonte era decodificada desde o começo até o último
            # corte — num vídeo longo com poucos trechos, quase tudo era jogado fora. O corte exato continua no trim
            # (os 3 s de folga garantem quadros bons no ponto de corte). Muitos grupos: volta à leitura única.
            junto = has_audio and audio_junto
            pares = ""
            grupos = []   # [índice da entrada, início da leitura, primeiro trecho, fim do último]
            if not audio_only:
                for a, b in sorted((p[0], p[1]) for p in pecas if p[0] != "gap"):
                    if grupos and a <= grupos[-1][3] + 20:
                        grupos[-1][3] = max(grupos[-1][3], b)
                    else:
                        grupos.append([None, max(0.0, a - 3.0), a, b])
                if len(grupos) > 32:
                    grupos = [[None, 0.0, min(g[2] for g in grupos), max(g[3] for g in grupos)]]
                for g in grupos:
                    # turbo: decodifica na placa (NVDEC) e os quadros ficam na memória dela até o NVENC
                    cmd += (["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"] if turbo else []) + \
                           (["-ss", _tempo_ffmpeg(g[1])] if g[1] > 0 else []) + ["-i", path]
                    g[0] = entrada
                    entrada += 1

            def _grupo(a):
                for g in grupos:
                    if g[2] - 1e-6 <= a <= g[3] + 1e-6:
                        return g
                return grupos[0]

            for k, p in enumerate([] if audio_only else pecas):
                if p[0] == "gap":
                    filtros.append(f"color=c={fundo}:s={W}x{H}:r={fps}:d={_tempo_ffmpeg(p[1])},"
                                   + (f"format={fmt_cuda},hwupload_cuda[v{k}]" if turbo else f"format={pixfmt}[v{k}]"))
                elif turbo:
                    g = _grupo(p[0])
                    filtros.append(f"[{g[0]}:v:0]trim=start={_tempo_ffmpeg(p[0] - g[1])}:end={_tempo_ffmpeg(p[1] - g[1])},"
                                   f"setpts=PTS-STARTPTS,scale_cuda={W}:{H}:format={fmt_cuda},"
                                   f"fps=fps={fps}:start_time=0[v{k}]")
                else:
                    g = _grupo(p[0])
                    filtros.append(f"[{g[0]}:v:0]{_marca_hd(path)}trim=start={_tempo_ffmpeg(p[0] - g[1])}:end={_tempo_ffmpeg(p[1] - g[1])},"
                                   f"setpts=PTS-STARTPTS,scale={W}:{H}:force_original_aspect_ratio=decrease"
                                   + (":flags=lanczos," if red < 1 else ",")
                                   + (f"format={pixfmt}," if alfa else "")
                                   + f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color={fundo},setsar=1,"
                                   f"fps=fps={fps}:start_time=0,format={pixfmt}[v{k}]")
                pares += f"[v{k}]"
                if junto:
                    if p[0] == "gap":
                        filtros.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{_tempo_ffmpeg(p[1])},"
                                       f"asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo[a{k}]")
                    else:
                        vol = f",volume={p[2]:.2f}dB" if p[2] else ""
                        g = _grupo(p[0])
                        filtros.append(f"[{g[0]}:a:0]atrim=start={_tempo_ffmpeg(p[0] - g[1])}:end={_tempo_ffmpeg(p[1] - g[1])},"
                                       f"asetpts=PTS-STARTPTS,aresample=48000,"
                                       f"aformat=sample_fmts=fltp:channel_layouts=stereo{vol}[a{k}]")
                    pares += f"[a{k}]"
            if not audio_only:
                filtros.append(f"{pares}concat=n={len(pecas)}:v=1:a={1 if junto else 0}[vc]" + ("[ac]" if junto else ""))
            if has_audio and not audio_junto and mix is None:
                pares_a = ""
                for k, p in enumerate(pecas_a):
                    _filtro_audio(_entrada_peca(p, False), p, f"ax{k}")
                    pares_a += f"[ax{k}]"
                filtros.append(f"{pares_a}concat=n={len(pecas_a)}:v=0:a=1[ac]")
        else:
            # Muitos trechos: um único select (baixa memória)
            cond = "+".join(f"between(t,{p[0]:.3f},{p[1]:.3f})" for p in segs)
            cmd += ["-i", path]
            entrada += 1
            filtros.append(f"[0:v:0]{_marca_hd(path)}select='{cond}',setpts=N/FRAME_RATE/TB[vc]")
            if has_audio and mix is None:
                filtros.append(f"[0:a:0]aselect='{cond}',asetpts=N/SR/TB[ac]")
        if has_audio and mix is not None:
            # todas as trilhas de áudio somadas (a mesma conta que o mixer em tempo real da prévia faz)
            entradas = {}
            for arq in ([None] if info["has_audio"] else []) + extras:
                cmd += _entrada_audio(arq, path)   # clipe/master já limitado (_pre_limitar/_limitar_master): PCM cru
                entradas[arq] = f"[{entrada}:a:0]"
                entrada += 1
            filtros.extend(_grafo_mix(mix, total, entradas, "ac"))

        # Camadas por cima (imagens e clipes com escala/posição/rotação/opacidade), de baixo para cima
        vf = "[vc]"
        for n, c in enumerate(lay):
            if c["tipo"] == "ajuste":
                # Camada de ajuste: os efeitos valem para o que já foi composto (as trilhas de baixo) no trecho dela.
                # Um ramo do vídeo composto passa pelos efeitos (só no trecho) e volta por cima com a opacidade da camada.
                efeitos = _filtros_fx(c["fx"], W, H, f"a{n}")
                # nitidez do Luz e Cor marcada para depois da volta a YUV (_NIT_NO_YUV); na Comp (alfa) fica no RGBA
                nit_yuv = ",".join(e[len(_NIT_NO_YUV):] for e in efeitos if e.startswith(_NIT_NO_YUV))
                efeitos = [e for e in efeitos if not e.startswith(_NIT_NO_YUV)]
                if nit_yuv and alfa:
                    efeitos.append(nit_yuv + ",format=rgba")
                    nit_yuv = ""
                de_aj = de_rgb_t + ("," + nit_yuv if nit_yuv else "")
                if not (efeitos or nit_yuv) or (c["op"] <= 0.001 and "op" not in c["kf"]):
                    continue
                ini, fim = max(0.0, c["st"]), min(c["st"] + c["dur"], total)
                if fim - ini < 1e-3:
                    continue
                if "op" in c["kf"]:
                    opac = [_opacidade_animada(c["kf"]["op"], c["dur"], fps, f"colorchannelmixer@op{n}", c["st"])]
                else:
                    opac = [f"colorchannelmixer=aa={c['op']:.4f}"] if c["op"] < 0.999 else []
                # O vídeo é cortado em antes / trecho / depois e emendado de volta (concat): cada parte é consumida
                # em sequência. Antes era split + overlay: o ramo de cima só tinha quadro no trecho e o overlay
                # guardava na RAM todos os quadros de baixo até ele chegar (GBs e a CPU parada esperando).
                r, partes = f"aj{n}", []
                antes, depois = ini > 1e-3, fim < total - 1e-3
                nseg = 1 + antes + depois
                filtros.append(f"{vf}split={nseg}" + "".join(f"[{r}s{j}]" for j in range(nseg)))
                j = 0
                if antes:
                    filtros.append(f"[{r}s{j}]trim=end={ini:.4f},setpts=PTS-STARTPTS,format={pixfmt}[{r}p{j}]")
                    j += 1
                trecho = f"[{r}s{j}]trim=start={ini:.4f}:end={fim:.4f}"

                def _com_efeitos(entrada, depois):
                    """Os efeitos no trecho. Comp (alfa): o alfa é separado antes e volta depois — efeitos de cor
                    (lut, curvas...) saem opacos e deixavam o fundo transparente da Comp preto."""
                    if not alfa:
                        filtros.append(f"{entrada}{para_rgb}," + ",".join(efeitos + depois))
                        return
                    filtros.append(f"{entrada}{para_rgb},split[{r}c][{r}m]")
                    filtros.append(f"[{r}m]alphaextract[{r}k]")
                    filtros.append(f"[{r}c]" + ",".join(efeitos) + f",format=rgba[{r}f]")
                    filtros.append(f"[{r}f][{r}k]alphamerge" + "".join("," + d for d in depois))

                if opac:
                    # com opacidade: os efeitos por cima do próprio trecho (o tempo ainda é o da timeline: o sendcmd
                    # da opacidade animada conta a partir do início da camada)
                    filtros.append(f"{trecho},split[{r}x][{r}y]")
                    _com_efeitos(f"[{r}y]", opac + [f"{de_aj}[{r}z]"])
                    filtros.append(f"[{r}x][{r}z]overlay=0:0:eof_action=pass:format=auto,"
                                   f"setpts=PTS-STARTPTS,format={pixfmt}[{r}p{j}]")
                else:
                    _com_efeitos(f"{trecho},", [de_aj, f"setpts=PTS-STARTPTS,format={pixfmt}[{r}p{j}]"])
                j += 1
                if depois:
                    filtros.append(f"[{r}s{j}]trim=start={fim:.4f},setpts=PTS-STARTPTS,format={pixfmt}[{r}p{j}]")
                    j += 1
                filtros.append("".join(f"[{r}p{k}]" for k in range(nseg)) + f"concat=n={nseg}:v=1:a=0[o{n}]")
                vf = f"[o{n}]"
                continue
            if c["tipo"] == "imagem" and c.get("seq"):
                cmd += ["-f", "concat", "-safe", "0", "-i", c["seq"]]
            elif c["tipo"] == "imagem":
                # um quadro só: decodificado uma vez e repetido no grafo (filtro loop). Com "-loop 1" o PNG era
                # lido e decodificado de novo a cada quadro do vídeo — caro em PNG grande (textos, logos)
                cmd += ["-i", c["path"]]
            else:
                # o arquivo do clipe, lido a partir de 3 s antes do trecho (-ss antes do -i: não decodifica o começo
                # do arquivo à toa) e só até 1 s depois dele (-t: não decodifica o resto); o corte exato fica no
                # trim, o que evita flash preto em cortes. Poucas threads por clipe: com 20+ clipes cada
                # decodificador abria uma por núcleo (1000+ threads, GBs de quadros na RAM) e eles brigavam pela CPU
                c["ss"] = max(0.0, c["s"] + c.get("pula", 0.0) * c["v"] - 3.0)
                # na grade de quadros da fonte: com base de tempo grossa (.mov 25 fps = 1/25) um -ss no meio de dois
                # quadros deslocava os tempos em até meio quadro e o fps pegava o vizinho (bloco 1 quadro atrasado)
                fq = _fps_fonte(c["path"] or path)
                if fq and c["ss"] > 0:
                    c["ss"] = math.floor(c["ss"] * fq + 1e-6) / fq
                leitura = c["s"] - c["ss"] + c["fonte"] + 1.0
                # prévia renderizada com placa NVIDIA: o clipe decodifica na placa (NVDEC; sem ela, o ffmpeg volta
                # sozinho ao processador). Celular 8K HEVC em pé: trecho de 9,5 s 38 s → 11 s
                gpu_red = c.get("gpu_red")
                hw = (["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"] + (["-display_rotation:v:0", "0"] if gpu_red[2] else [])
                      if gpu_red else ["-hwaccel", "cuda"] if nvdec_previa else [])
                cmd += ["-threads", str(_THREADS_CLIPE)] + hw \
                    + (["-ss", _tempo_ffmpeg(c["ss"])] if c["ss"] > 0 else []) \
                    + ["-t", _tempo_ffmpeg(leitura), "-i", c["path"] or path]
            idx = entrada
            entrada += 1
            kf = c["kf"]
            # Dentro da cadeia da camada o tempo começa em 0 (t / T); no overlay é o tempo do vídeo final.
            # Propriedade animada vira expressão avaliada a cada quadro.
            sx = _expr_kf(kf["sx"], "t") if "sx" in kf else None
            sy = _expr_kf(kf["sy"], "t") if "sy" in kf else None
            ca = _ca_exprs(c.get("ca"), "t")   # Rotação / Tremer / Pulsar em loop (tempo da camada)
            # Zoom animado de um vídeo (PiP 4K a 30–40%): a fonte é reduzida UMA vez ao maior tamanho que a camada
            # chega a ter e o zoom por quadro trabalha nesse quadro menor. Medido (teste 4K, 3 PiPs 4K): o scale com
            # tamanho mudando a cada quadro sobre o 4K inteiro era ~130 s de 140 s numa exportação de 20 s.
            # Com efeitos não (os parâmetros deles são em px da mídia).
            pre_red = None
            # imagem parada: os efeitos rodam antes, uma vez, no tamanho da mídia (a redução vem depois deles). Logo
            # girando com zoom: o rotate girava o PNG inteiro (1557 px, 8,9% na tela) a cada quadro, ~11 ms/quadro
            img_fixa = c["tipo"] == "imagem" and not c.get("seq")
            # com Pulsar (Animação → Constante) também: reduz ao maior tamanho que a camada chega a ter (escala × pico
            # do pulso). Logo de 1817 px a 11,5% pulsando era redimensionado inteiro a cada quadro: 31 s a cada 30 s de
            # vídeo (mais que os 13 cortes juntos; projeto Depoimentos do Carlinhos, 2026-10-08)
            pulso = _ca_pulso_max(c.get("ca"))
            if (c["tipo"] == "video" and not c["fx"] or img_fixa) and ("sc" in kf or pulso > 1) and not sx and not sy \
                    and (not ca["sc"] or pulso > 1):
                maior = (max(p[1] for p in kf["sc"]) if "sc" in kf else c["sc"]) * pulso
                if maior < 0.95:
                    pre_red = max(0.01, maior)
            if "sc" in kf or sx or sy or ca["sc"]:
                e = _expr_kf(kf["sc"], "t") if "sc" in kf else f"{c['sc']:.5f}"
                # imagem parada já reduzida: o tamanho final sai das dimensões da MÍDIA (mw/mh), não da cópia reduzida
                # (arredondada a par: 224 px no lugar de 225,7 deixava o logo 0,7% menor e 1–2 px fora do lugar)
                base_w, base_h = ("@BW@", "@BH@") if (pre_red and img_fixa) else ("iw", "ih")   # ver o recorte, abaixo
                if pre_red and not img_fixa:
                    e = f"({e})/{pre_red:.6f}"
                if ca["sc"]:
                    e = f"({e})*{ca['sc']}"
                ew = f"({e})*({sx})" if sx else e
                eh = f"({e})*({sy})" if sy else e
                # tamanho sempre par: com metade inteira o centro não "treme" meio pixel a cada quadro do zoom
                escala = (f"scale=w='max(2,2*trunc({base_w}*({ew})/2))':h='max(2,2*trunc({base_h}*({eh})/2))'"
                          f":eval=frame:flags=bicubic")
            else:
                k = c["sc"]
                # tamanho original: sem scale (ele converte o quadro inteiro mesmo com fator 1)
                escala = (None if abs(k - 1) < 1e-5 else
                          f"scale='max(2,trunc(iw*{k:.5f}))':'max(2,trunc(ih*{k:.5f}))':flags=bicubic")
            giro = None
            if "rot" in kf or ca["rot"]:
                # quadro fixo do tamanho da diagonal: cabe em qualquer ângulo
                e = _expr_kf(kf["rot"], "t") if "rot" in kf else f"{c['rot']:.5f}"
                if ca["rot"]:
                    e = f"({e})+{ca['rot']}"
                giro = f"rotate=a='({e})*PI/180':c=black@0:ow='hypot(iw,ih)':oh='hypot(iw,ih)'"
            elif c["rot"]:
                rad = c["rot"] * 3.141592653589793 / 180
                giro = f"rotate={rad:.6f}:c=black@0:ow='rotw({rad:.6f})':oh='roth({rad:.6f})'"
            if "op" in kf:
                opac = _opacidade_animada(kf["op"], c["dur"], fps, f"colorchannelmixer@op{n}")
            elif c["op"] < 0.999:
                opac = f"colorchannelmixer=aa={c['op']:.4f}"
            else:
                opac = None
            # escala animada vai por último (tamanho muda a cada quadro; o resto trabalha em tamanho fixo)
            escala_animada = "sc" in kf or sx or sy or ca["sc"]
            ordem = [giro, opac, escala] if escala_animada else [escala, giro, opac]
            efeitos = _filtros_fx(c["fx"], c["mw"], c["mh"], f"l{n}")
            # imagem parada com muito transparente em volta (texto, logo): recortada à parte visível depois dos efeitos
            # (que rodam no tamanho da mídia) e antes do resto; o centro da camada anda junto pela âncora (ox/oy:
            # do ponto de ancoragem até o centro, em px da mídia). Desfoque e Básico 3D podem levar o alfa para fora
            # do recorte: com eles, não recorta
            recorte = []
            if c["tipo"] == "imagem" and not c.get("seq") and not any(
                    f.get("t") in ("blur", "b3d") and f.get("on") is not False for f in c["fx"]):
                bb = _bbox_alfa(c["path"])
                if bb and abs(bb[4] - c["mw"]) <= 1 and abs(bb[5] - c["mh"]) <= 1:
                    x0, y0, w0, h0, Wi, Hi = bb
                    recorte = [f"crop={w0}:{h0}:{x0}:{y0}"]
                    c["ox"] += x0 + w0 / 2 - Wi / 2
                    c["oy"] += y0 + h0 / 2 - Hi / 2
            bm = _BLEND_FF.get(c.get("bm") or "")
            # velocidade do clipe (como no Premiere): o tempo da fonte é comprimido/esticado antes de tudo
            if c["tipo"] == "imagem" and c.get("seq"):
                # quadros do texto animado: o trecho do clipe que entra na exportação
                src = (f"[{idx}:v:0]trim=start={_tempo_ffmpeg(c['s'])}:end={_tempo_ffmpeg(c['s'] + c['fonte'])},"
                       f"setpts=PTS-STARTPTS,")
                vel = ""
            elif c["tipo"] == "imagem":
                src = f"[{idx}:v:0]"   # montado abaixo: o que é fixo roda uma vez, antes de repetir o quadro
                vel = ""
            else:
                ss = c.get("ss", 0.0)
                red_gpu = ""
                if c.get("gpu_red"):
                    # reduzido na placa e só então baixado (e girado) no processador
                    gw, gh, giro, fmt_g = c["gpu_red"]
                    red_gpu = f"scale_cuda={gw}:{gh}:format={fmt_g}:interp_algo=lanczos,hwdownload,format={fmt_g}," + (f"{giro}," if giro else "")
                src = (f"[{idx}:v:0]{red_gpu}{_marca_hd(c['path'] or path)}trim=start={_tempo_ffmpeg(max(0.0, c['s'] - ss))}:"
                       f"end={_tempo_ffmpeg(c['s'] - ss + c['fonte'])},")
                # o tempo interno conta do ponto exato do corte na fonte (c["s"]), como a prévia (currentTime), e não do
                # 1º quadro lido (STARTPTS, até um quadro da fonte depois): fonte 60 fps numa saída 30 fps pegava o
                # quadro vizinho conforme a leitura começasse — e um bloco (que começa a ler no meio do clipe) não
                # batia com a exportação inteira
                vel = f"setpts=(PTS-{c['s'] - ss:.6f}/TB)/{c['v']:.6f},"
            if escala and "@BW@" in escala:
                # tamanho da mídia que chega ao scale: o recorte à parte visível, se houve, senão a mídia inteira
                bw, bh = (recorte[0].split("=")[1].split(":")[:2]) if recorte else (c["mw"], c["mh"])
                nova = escala.replace("@BW@", str(bw)).replace("@BH@", str(bh))
                ordem = [nova if f is escala else f for f in ordem]
                escala = nova
            filtros_clip = efeitos + [f for f in ordem if f]
            fixa = False
            if c["tipo"] == "imagem" and not c.get("seq"):
                # imagem parada: efeitos, escala, giro e opacidade fixos são aplicados uma vez no único quadro
                # (ex.: LUT num PNG grande antes de reduzir); só o que anima com o tempo roda a cada quadro
                animados = [f for f, anima in ((escala, escala_animada), (giro, "rot" in kf or ca["rot"]),
                                                (opac, "op" in kf)) if f and anima]
                k = 0
                while k < len(filtros_clip) and filtros_clip[k] not in animados:
                    k += 1
                n_q = int(math.ceil(c["dur"] * float(fps))) + 1
                # nada anima: o quadro já vai pronto (YUV com alfa) para o loop. Antes cada um dos quadros repetidos
                # passava por RGBA → YUV de novo (texto em PNG 4K: ~40 s numa exportação de 20 s)
                fixa = len(filtros_clip) == k
                # zoom animado: o quadro já reduzido uma vez ao maior tamanho que a camada chega a ter
                red_img = ([f"scale=w='max(2,2*trunc(iw*{pre_red:.6f}/2))':h='max(2,2*trunc(ih*{pre_red:.6f}/2))'"
                            f":flags=lanczos"] if pre_red else [])
                src += ",".join([para_rgb_img] + filtros_clip[:len(efeitos)] + recorte + filtros_clip[len(efeitos):k] + red_img + ([de_rgb] if fixa else [])
                                + [f"loop=loop={n_q - 1}:size=1:start=0", f"setpts=N/({fps}*TB)"]) + ","
                filtros_clip = filtros_clip[k:]
            reducao = (f"scale=w='2*trunc(iw*{pre_red:.6f}/2)':h='2*trunc(ih*{pre_red:.6f}/2)':flags=bicubic"
                       if pre_red and not img_fixa else None)
            if c["tipo"] != "imagem":
                filtros_clip.append(f"tpad=stop_mode=clone:stop_duration={_tempo_ffmpeg(frame_dur)}")
            if c["tipo"] == "imagem" and not c.get("seq") and fixa:
                cadeia = f"{src}fps=fps={fps}:start_time=0"
            elif c["tipo"] == "video" and not efeitos and not giro and not opac and not bm \
                    and pixfmt in ("yuv420p", "yuv444p") and not _clipe_tem_alfa(c["path"] or path):
                # clipe opaco só cortado/redimensionado/posicionado: fica em YUV do começo ao fim. A ida e volta para
                # RGBA (quadro inteiro, 2 conversões por quadro) não muda nada na imagem e era o mais caro do grafo.
                # Clipe com transparência (ProRes 4444, Animation/qtrle...) não: em YUV o alfa some e o fundo fica preto
                if escala_animada:
                    # a conversão (e a redução) vem ANTES do zoom: um scale depois fixaria o tamanho no do 1º quadro
                    conv = (reducao + ":out_range=tv" if reducao else "scale=out_range=tv") + ",format=yuv420p"
                    cadeia = f"{src}{vel}" + ",".join([f"fps=fps={fps}:start_time=0", conv] + filtros_clip)
                else:
                    cadeia = f"{src}{vel}" + ",".join([f"fps=fps={fps}:start_time=0"] + filtros_clip
                                                      + ["scale=out_range=tv,format=yuv420p"])
            else:
                # zoom animado: a volta para YUV vem ANTES dele. Um scale de conversão depois fixa o tamanho de saída
                # no do 1º quadro e a escala animada (Ken Burns, zoom-soco, pop) ficava parada na exportação
                if escala_animada and escala in filtros_clip:
                    k = filtros_clip.index(escala)
                    fim_cadeia = filtros_clip[:k] + [de_rgb] + filtros_clip[k:]
                else:
                    fim_cadeia = filtros_clip + [de_rgb]
                cadeia = f"{src}{vel}" + ",".join([f"fps=fps={fps}:start_time=0"] + ([reducao] if reducao else [])
                                                  + [para_rgb] + fim_cadeia)
            if c.get("pula"):
                # quadros só a partir do bloco (sem refazer o começo); o tempo interno já é o do clipe
                cadeia = cadeia.replace(f"fps=fps={fps}:start_time=0", f"fps=fps={fps}:start_time={c['pula']:.6f}")
                cadeia += f",setpts=PTS+round({c['st']:.9f}/TB)[l{n}]"
            else:
                # round: em segundos o deslocamento era truncado (0,233333/TB = 6,99999 → 6) e o último quadro sumia
                cadeia += f",setpts=PTS-STARTPTS+round({c['st']:.9f}/TB)[l{n}]"
            i_cadeia = len(filtros)
            filtros.append(cadeia)
            fim = c["st"] + c["dur"]
            tl = f"(t-{c['st']:.4f})"
            px = _expr_kf(kf["x"], tl) if "x" in kf else f"{c['x']:.2f}"
            py = _expr_kf(kf["y"], tl) if "y" in kf else f"{c['y']:.2f}"
            ca_tl = _ca_exprs(c.get("ca"), tl)
            if abs(c["ox"]) > 0.01 or abs(c["oy"]) > 0.01:
                # Posição = onde fica o ponto de ancoragem; o centro da camada gira/escala em volta dele
                if "sc" in kf or "rot" in kf or ca_tl["sc"] or ca_tl["rot"]:
                    k = _expr_kf(kf["sc"], tl) if "sc" in kf else f"{c['sc']:.6f}"
                    if ca_tl["sc"]:
                        k = f"({k})*{ca_tl['sc']}"
                    ag = _expr_kf(kf["rot"], tl) if "rot" in kf else f"{c['rot']:.5f}"
                    if ca_tl["rot"]:
                        ag = f"({ag})+{ca_tl['rot']}"
                    a = f"(({ag})*PI/180)"
                    px = f"({px})+({k})*({c['ox']:.3f}*cos({a})-{c['oy']:.3f}*sin({a}))"
                    py = f"({py})+({k})*({c['ox']:.3f}*sin({a})+{c['oy']:.3f}*cos({a}))"
                else:
                    a = c["rot"] * 3.141592653589793 / 180
                    dx = c["sc"] * (c["ox"] * math.cos(a) - c["oy"] * math.sin(a))
                    dy = c["sc"] * (c["ox"] * math.sin(a) + c["oy"] * math.cos(a))
                    px, py = f"({px})+{dx:.3f}", f"({py})+{dy:.3f}"
            if ca_tl["dx"]:   # Tremer: desloca a posição
                px, py = f"({px})+{ca_tl['dx']}", f"({py})+{ca_tl['dy']}"
            # quadros com t em [início, fim), com meia-quadro de folga: igual à prévia (a camada aparece de t >= início até
            # antes do fim). O between exato perdia o 1º quadro (o t do quadro chega arredondado para baixo)
            ena = f"gte(t,{c['st'] - frame_dur / 2:.6f})*lt(t,{fim - frame_dur / 2:.6f})"
            sombra = _sombra_camada(c)
            if sombra:
                # Sombra projetada (VE_FX.sombra; veSombraAplicar faz a mesma conta na prévia): a transparência da camada
                # já transformada, na cor da sombra, com margem para o desfoque, desfocada só no alfa e posta por baixo,
                # deslocada (o desvio não gira nem escala com a camada, como a luz global do Photoshop)
                filtros[i_cadeia] = filtros[i_cadeia][:-len(f"[l{n}]")] + f"[l{n}r]"
                r, (R, G, B, op, dx, dy, sig) = f"sh{n}", sombra
                m = int(math.ceil(3 * sig)) + 2
                filtros.append(f"[l{n}r]split[l{n}][{r}a]")
                filtros.append(f"[{r}a]format=rgba,pad=iw+{2 * m}:ih+{2 * m}:{m}:{m}:color=black@0,"
                               f"lutrgb=r={R}:g={G}:b={B}:a='val*{op:.4f}'"
                               + (f",format=gbrap,gblur=sigma={sig:.3f}:planes=8,format=rgba" if sig >= 0.3 else "") + f"[{r}b]")
                filtros.append(f"{vf}[{r}b]overlay=x='({px})+{dx:.3f}-w/2':y='({py})+{dy:.3f}-h/2'"
                               f":enable='{ena}':eof_action=pass:format=auto[{r}o]")
                vf = f"[{r}o]"
            if bm:
                # Modo de mesclagem: a camada é posicionada num quadro transparente do tamanho do vídeo, misturada
                # com o fundo (blend) e aplicada pela transparência dela (maskedmerge) — como o canvas da prévia.
                # Só o trecho da camada passa por isso (antes/trecho/depois emendados, como na camada de ajuste): antes o
                # vídeo inteiro ia para RGB e voltava a cada camada mesclada (exportação ~4x mais lenta).
                # yuv → gbrp direto deixava as últimas 8 colunas pretas no ffmpeg atual: passa por rgba antes.
                r = f"bm{n}"
                ini, fim_bm = max(0.0, c["st"]), min(c["st"] + c["dur"], total)
                if fim_bm - ini < 1e-3:
                    filtros.append(f"[l{n}]nullsink")
                    continue
                antes, depois = ini > 1e-3, fim_bm < total - 1e-3
                nseg = 1 + antes + depois
                filtros.append(f"{vf}split={nseg}" + "".join(f"[{r}s{j}]" for j in range(nseg)))
                j = 0
                if antes:
                    filtros.append(f"[{r}s{j}]trim=end={ini:.4f},setpts=PTS-STARTPTS,format={pixfmt}[{r}p{j}]")
                    j += 1
                filtros.append(f"[{r}s{j}]trim=start={ini:.4f}:end={fim_bm:.4f},"
                               f"scale=in_color_matrix={mtx},format=rgba,format=gbrp,split=3[{r}a][{r}b][{r}c]")
                filtros.append(f"[{r}c]format=rgba,colorchannelmixer=aa=0[{r}z]")
                filtros.append(f"[{r}z][l{n}]overlay=x='{px}-w/2':y='{py}-h/2':enable='{ena}'"
                               f":eof_action=pass:format=rgb,split[{r}d][{r}e]")
                filtros.append(f"[{r}d]format=gbrp[{r}t]")
                filtros.append(f"[{r}e]alphaextract,format=gbrp[{r}k]")
                if bm == "softlight":
                    # Luz suave: a fórmula do navegador/W3C (= Photoshop); a do blend do ffmpeg é outra e clareava
                    # demais (teste_export, caso mesclagem: 28 níveis). x = camada, y = fundo, tabela 256×256 por canal
                    d = "if(lte(y,63.75),((16*y/255-12)*y/255+4)*y,sqrt(y/255)*255)"
                    e = f"if(lte(x,127.5),y-(255-2*x)*y*(255-y)/65025,y+(2*x-255)*({d}-y)/255)"
                    filtros.append(f"[{r}t][{r}a]lut2=c0='{e}':c1='{e}':c2='{e}'[{r}x]")
                else:
                    filtros.append(f"[{r}t][{r}a]blend=all_mode={bm}[{r}x]")
                filtros.append(f"[{r}b][{r}x][{r}k]maskedmerge,{de_rgb_t},setpts=PTS-STARTPTS,format={pixfmt}[{r}p{j}]")
                j += 1
                if depois:
                    filtros.append(f"[{r}s{j}]trim=start={fim_bm:.4f},setpts=PTS-STARTPTS,format={pixfmt}[{r}p{j}]")
                    j += 1
                filtros.append("".join(f"[{r}p{k}]" for k in range(nseg)) + f"concat=n={nseg}:v=1:a=0[o{n}]")
            else:
                filtros.append(f"{vf}[l{n}]overlay=x='{px}-w/2':y='{py}-h/2'"
                               f":enable='{ena}':eof_action=pass:format=auto[o{n}]")
            vf = f"[o{n}]"
        if lay:
            filtros.append(f"{vf}format={pixfmt_saida}[vlay]")
            vf = "[vlay]"

        # legendas gravadas no vídeo (mesmo estilo da prévia do editor), antes de reduzir a resolução
        ass = None
        if legendas and legendas.get("itens") and not audio_only:
            ass = _gerar_ass(legendas["itens"], legendas.get("estilo") or {}, Wq, Hq)
            if ass and janela and janela.get("t0"):
                # bloco: as legendas são as da timeline inteira, no relógio dela (a que já vinha na tela continua no
                # meio da animação; com o tempo do bloco ela recomeçava a entrada a cada emenda)
                t0 = janela["t0"]
                filtros.append(f"{vf}setpts=PTS+{t0:.6f}/TB,subtitles=filename={_caminho_filtro(ass)},"
                               f"setpts=PTS-{t0:.6f}/TB[vsub]")
            elif ass:
                filtros.append(f"{vf}subtitles=filename={_caminho_filtro(ass)}[vsub]")
            if ass:
                vf = "[vsub]"

        # resolução pelo lado menor do quadro: "1080p" vertical = 1080×1920
        if alvo_h and not audio_only and min(W, H) > alvo_h:
            if turbo:
                k = alvo_h / min(W, H)
                filtros.append(f"{vf}scale_cuda={int(round(W * k / 2)) * 2}:{int(round(H * k / 2)) * 2}:format={fmt_cuda}[vs]")
            else:
                escala = f"{alvo_h}:-2" if W < H else f"-2:{alvo_h}"
                filtros.append(f"{vf}scale={escala}:flags=lanczos[vs]")
            vf = "[vs]"

        # marca de cor nos próprios quadros (o encoder do ffmpeg 7 usa a dos quadros; só a opção de saída não basta)
        args_cor = [] if audio_only or previa else _args_cor(info, min(W, H) if not alvo_h else min(alvo_h, min(W, H)))
        if args_cor:
            m = dict(zip(args_cor[::2], args_cor[1::2]))
            filtros.append(f"{vf}setparams=range={m.get('-color_range', 'tv')}"
                           + (f":colorspace={m['-colorspace']}" if "-colorspace" in m else "")
                           + (f":color_primaries={m['-color_primaries']}" if "-color_primaries" in m else "")
                           + (f":color_trc={m['-color_trc']}" if "-color_trc" in m else "") + "[vcor]")
            vf = "[vcor]"
        return cmd, filtros, vf, ass, args_cor

    prep = {"scripts": [], "ass": []}

    def _preparar(tb):
        cmd, filtros, vf, ass, args_cor = _montar(tb)
        script = os.path.join(_work_dir(), f"filtro_{uuid.uuid4().hex[:8]}.txt")
        with open(script, "w", encoding="utf-8") as f:
            f.write(";\n".join(filtros))
        base_cmd = cmd + [_opcao_filtro_script(), script] + ([] if audio_only else ["-map", vf])
        if has_audio:
            base_cmd += ["-map", "[ac]", "-c:a", cfg["acodec"]]
            if not cfg["acodec"].startswith("pcm_"):
                base_cmd += ["-b:a", "320k" if audio_only and q["ab"] == "256k" else q["ab"]]
        prep.update(base_cmd=base_cmd, args_cor=args_cor, script=script, turbo=tb)
        prep["scripts"].append(script)
        if ass:
            prep["ass"].append(ass)

    ultimo_cmd = None

    def _tentar(gpu):
        nonlocal ultimo_cmd
        global _export_proc
        if previa:
            video_args = ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "fastdecode", "-crf", "20",
                          "-g", "10", "-pix_fmt", "yuv420p"]
        elif alfa and alfa_leve:
            # Comp sem nada animado (PSD, arte parada): QuickTime Animation guarda só o que muda entre quadros, sem
            # perda e com alfa. Uma arte de 5 s em 1080×1920: ~3 MB (em ProRes 4444 eram ~130 MB). Quadro-chave a cada
            # 10 s: buscar decodifica do começo, e RLE decodifica rápido
            video_args = ["-c:v", "qtrle", "-g", "300", "-pix_fmt", "argb"] + prep["args_cor"]
        elif alfa:
            video_args = ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"] + prep["args_cor"]
        else:
            video_args = ["-vn"] if audio_only else _args_video(cfg, q, gpu, bits, mbps) + prep["args_cor"]
            if prep["turbo"] and "-pix_fmt" in video_args:
                # quadros já na placa, no formato certo (nv12/p010): converter faria o ffmpeg descer para a RAM
                i = video_args.index("-pix_fmt")
                del video_args[i:i + 2]
        if janela:
            # só os quadros do bloco (o grafo é o da timeline inteira: tempos das camadas iguais aos da exportação
            # normal); o contêiner do pedaço vem da extensão (.ts/.mov/.mkv), sem as opções do formato final
            # sem quadros B: cada quadro com o próprio tempo, sem reordenar. Com eles (NVENC -bf 3) o começo de cada
            # pedaço saía deslocado e a emenda perdia ou repetia um quadro (medido com um vídeo numerado)
            va = list(video_args)
            for op_b in ("-bf", "-b_ref_mode"):
                while op_b in va:
                    i = va.index(op_b)
                    del va[i:i + 2]
            full = prep["base_cmd"] + va + ["-bf", "0", "-ss", f"{janela['ss']:.6f}", "-frames:v",
                                            str(janela["quadros"]), "-an", saida]
        else:
            full = prep["base_cmd"] + video_args + cfg["extra"] + [saida]
        ultimo_cmd = full

        def _hold(p):
            global _export_proc
            if proc_holder is not None:
                proc_holder(p)
                return
            with _export_lock:
                _export_proc = p

        rc, err = _run_progress(full, total_prog, lambda p: prog(p, f"Exportando{' (turbo)' if prep['turbo'] else ''}... {p}%"),
                                stop_event, _hold)
        if proc_holder is not None:
            proc_holder(None)
        else:
            with _export_lock:
                _export_proc = None
        return rc, err

    try:
        enc = enc_gpu
        rc, err = 1, ""
        if turbo:
            prog(0, "Iniciando exportação (turbo: tudo na placa de vídeo)...")
            _preparar(True)
            rc, err = _tentar(True)
            if stop_event is not None and stop_event.is_set():
                _apagar(saida)
                return {"success": False, "cancelled": True, "error": "Exportação cancelada."}
            if rc != 0:
                prog(0, "Turbo não serviu para este arquivo, exportando no modo normal...")
                _apagar(saida)
        if not turbo or rc != 0:
            prog(0, "Iniciando exportação" + (f" (GPU: {enc.split('_')[1].upper()})" if enc else "") + "...")
            _preparar(False)
            rc, err = _tentar(usar_gpu)
        if stop_event is not None and stop_event.is_set():
            _apagar(saida)
            return {"success": False, "cancelled": True, "error": "Exportação cancelada."}
        if rc != 0 and enc:
            prog(0, "GPU falhou, exportando pela CPU...")
            _apagar(saida)
            rc, err = _tentar(False)
        if rc != 0 or not os.path.exists(saida):
            _apagar(saida)
            linhas = _linhas_ffmpeg(err)
            detalhe = "\n".join(linhas) if linhas else f"código {rc}"
            log = _salvar_falha_export(ultimo_cmd, prep.get("script"), err, saida)
            if log:
                detalhe += f"\nLog: {log}"
            return {"success": False, "error": "Falha ao exportar: " + detalhe}
    except FileNotFoundError:
        return {"success": False, "error": "ffmpeg não encontrado."}
    finally:
        for arq in prep["scripts"] + prep["ass"]:
            _apagar(arq)

    if saida != destino:
        try:
            os.replace(saida, destino)
        except OSError as e:
            _apagar(saida)
            return {"success": False, "error": f"Não foi possível gravar {os.path.basename(destino)}: {e}"}
        saida = destino
    prog(100, "Concluído!")
    return {
        "success": True,
        "output_path": saida,
        "output_folder": os.path.dirname(saida),
        "duration": round(total, 2),
        "size": os.path.getsize(saida),
        "turbo": bool(prep.get("turbo")),
    }


def _apagar(p):
    try:
        if os.path.exists(p):
            os.remove(p)
    except Exception:
        pass


# ─────────────────────────── exportação por blocos (opção da tela de exportação) ───────────────────────────
# A exportação inteira abre a leitura de TODOS os clipes de uma vez (projeto de 2 min com 8K do celular: 25 leituras
# HEVC 8K, ~19 GB de RAM, tudo no processador). Por blocos, cada pedaço da timeline leva só as camadas que aparecem
# nele — o grafo e os tempos são os da exportação normal (animações, quadros-chave e textos iguais) — e grava só os
# quadros dele; com poucos vídeos juntos, eles decodificam na placa. O som sai numa passada só (a mesma mixagem) e os
# pedaços se juntam sem recodificar.
_BLOCO_SEG = float(os.environ.get("CANIVETE_BLOCO_SEG") or 15)   # tamanho alvo de cada bloco (s; o teste usa 1)
_BLOCO_NVDEC_MAX = 4     # vídeos ao mesmo tempo num bloco para decodificar na placa


def _spans_camadas(camadas):
    out = []
    for c in camadas or []:
        try:
            v = max(0.05, min(20.0, float(c.get("v") or 1)))
            st = max(0.0, float(c["st"]))
            out.append((st, st + (float(c.get("e", 0)) - float(c.get("s", 0))) / v,
                        c.get("tipo") not in ("imagem", "ajuste")))
        except Exception:
            out.append((0.0, 1e9, True))   # sem conseguir ler: vai em todos os blocos
    return out


def _cortes_blocos(spans, n_quadros, fpsv, alvo_seg=None):
    """Quadros onde cada bloco começa: perto de cada alvo_seg (padrão _BLOCO_SEG), de preferência num corte da
    timeline (início/fim de camada) que nenhum vídeo atravessa — o bloco não abre a leitura de um clipe só para
    alguns quadros, e o quadro-chave do começo do bloco cai onde a imagem já muda. Sem corte bom por perto, o ponto
    (±3 s) atravessado por menos vídeos."""
    alvo_seg = alvo_seg or _BLOCO_SEG
    cortes, k, passo = [0], 0, max(2, int(round(alvo_seg * fpsv)))
    folga = min(int(3 * fpsv), passo // 3)
    minimo, maximo = max(2, int(passo * 0.5)), int(passo * 1.6)

    def cruzam(qd):
        t = qd / fpsv
        return sum(1 for a, b, vid in spans if vid and a + 0.05 < t < b - 0.05)

    cand = sorted({int(round(x * fpsv)) for a, b, _ in spans for x in (a, b) if b < 1e8} - {0})
    while n_quadros - k > passo * 1.4:
        alvo, melhor = k + passo, None
        for qd in cand:
            if k + minimo <= qd <= min(k + maximo, n_quadros - minimo):
                chave = (cruzam(qd), abs(qd - alvo))
                if melhor is None or chave < melhor[0]:
                    melhor = (chave, qd)
        if melhor is None or melhor[0][0] > 0:
            for qd in range(alvo - folga, alvo + folga + 1, max(1, min(int(fpsv / 6), folga // 3 or 1))):
                chave = (cruzam(qd), abs(qd - alvo))
                if melhor is None or chave < melhor[0]:
                    melhor = (chave, qd)
        k = melhor[1]
        cortes.append(k)
    return cortes + [n_quadros]


def _blocos_paralelos():
    """Quantos blocos renderizam ao mesmo tempo: cada ffmpeg já usa várias threads (filtros, decodificação, encoder)."""
    try:
        n = int(os.environ.get("CANIVETE_BLOCOS_PAR") or 0)
    except ValueError:
        n = 0
    return n if n > 0 else max(2, min(4, (os.cpu_count() or 4) // 4))


def _base_na_janela(segmentos, a, b):
    """Base do bloco: começa em `a` (o que vem antes sai; o trecho que atravessa `a` começa no meio) e o que passa de
    `b` vira vazio (não é lido)."""
    out, t = [], 0.0
    for s in segmentos or []:
        try:
            gap = s.get("gap") is not None
            d = float(s["gap"]) if gap else float(s.get("end", 0)) - float(s.get("start", 0))
        except Exception:
            continue
        ini, fim = max(t, a), t + d
        t += d
        if fim <= a + 1e-6:
            continue
        if gap or ini >= b:
            out.append({"gap": fim - ini})
        else:
            out.append(dict(s, start=float(s["start"]) + (ini - (fim - d))))
    return out


def _legendas_na_janela(legendas, a, b):
    """Só as legendas que aparecem no bloco [a, b], com os tempos da timeline (o bloco desloca o relógio para elas)."""
    if not isinstance(legendas, dict) or not legendas.get("itens"):
        return legendas
    itens = [l for l in legendas["itens"] if float(l["en"]) > a - 0.1 and float(l["st"]) < b + 0.1]
    return dict(legendas, itens=itens) if itens else None


def _exportar_em_blocos(args, aberto, pasta_saida, prog, stop_event):
    global _export_proc
    op = dict(args.get("opcoes") or {})
    op.pop("blocos", None)
    fmt = str(args["formato_saida"]).lower()
    cfg = FORMATOS_SAIDA.get(fmt, FORMATOS_SAIDA["mp4"])
    codec = str(op.get("codec") or "h264").lower()
    prores = cfg.get("vcodec") == "h264" and codec == "prores"
    if prores:
        cfg = dict(FORMATOS_SAIDA["mov"], vcodec="prores", acodec="pcm_s16le")
    vcodec = "hevc" if cfg.get("vcodec") == "h264" and codec == "hevc" else cfg.get("vcodec")
    ext_bloco = ".ts" if vcodec in ("h264", "hevc") else ".mov" if prores else ".mkv"
    q = _QUALIDADE.get(str(args["qualidade"]).lower(), _QUALIDADE["medium"])
    saida = _nome_saida(aberto, cfg["ext"], pasta_saida, op.get("nome"))
    try:
        info = probe(args["path"])
    except Exception as e:
        return {"success": False, "error": f"Não foi possível analisar o vídeo: {e}"}
    fpsv = float(f'{(info.get("fps_timeline") or taxa_timeline(info["fps"])):.3f}')
    camadas = args["camadas"]
    spans = _spans_camadas(camadas)
    base_dur = 0.0
    for s in args["segmentos"] or []:
        try:
            base_dur += float(s["gap"]) if s.get("gap") is not None else float(s.get("end", 0)) - float(s.get("start", 0))
        except Exception:
            pass
    total = max([base_dur, float(args["duracao"] or 0)] + [b for a, b, _ in spans if b < 1e8])
    n_quadros = int(round(total * fpsv))
    if n_quadros < 2:
        return {"success": False, "error": "Nada para exportar."}
    # blocos curtos o bastante para todos os núcleos trabalharem (um reels de 40 s em ~8 pedaços); vídeo longo: 15 s
    par = _blocos_paralelos()
    alvo = max(3.0, min(_BLOCO_SEG, total / (par * 2.5))) if "CANIVETE_BLOCO_SEG" not in os.environ else _BLOCO_SEG
    cortes = _cortes_blocos(spans, n_quadros, fpsv, alvo)
    nb = len(cortes) - 1
    pasta = os.path.join(_midia_dir(), "blocos_" + uuid.uuid4().hex[:10])
    os.makedirs(pasta, exist_ok=True)
    margem = 2.0 / fpsv
    _detectar_hw_encoder()   # uma vez antes das threads (o teste do encoder grava no cache)
    feitos = [0.0] * nb       # quadros prontos de cada bloco (progresso)
    som_pct = [0]
    trava = threading.Lock()
    falha = []

    def _progresso():
        pct = min(98, int((sum(feitos) / max(1, n_quadros) * 0.97 + som_pct[0] / 100 * 0.03) * 100))
        prog(pct, f"Exportando ({nb} blocos, {min(par, nb)} ao mesmo tempo)... {pct}%")

    def _holder(p, lista):
        with _export_lock:
            if p is None:
                for q in lista:
                    _export_procs.discard(q)
                lista.clear()
            else:
                lista.append(p)
                _export_procs.add(p)

    def _bloco(i):
        if falha or (stop_event is not None and stop_event.is_set()):
            return None
        k0, k1 = cortes[i], cortes[i + 1]
        a, b = k0 / fpsv, k1 / fpsv
        sub = [c for c, (ca, cb, _) in zip(camadas, spans) if ca < b + margem and cb > a - margem]
        n_vid = sum(1 for ca, cb, vid in spans if vid and ca < b + margem and cb > a - margem)
        parte = os.path.join(pasta, f"b{i:03d}{ext_bloco}")
        # o bloco começa no próprio zero (t0): sem refazer a timeline desde o início a cada bloco (medido: bloco em
        # 120 s levava 35 s só de pré-rolagem com 2 PNGs; o 8K longo era decodificado de novo em cada bloco)
        janela = {"ss": 0.0, "t0": a, "quadros": k1 - k0, "nvdec": n_vid <= _BLOCO_NVDEC_MAX}
        procs = []

        def _p(p, m):
            with trava:
                feitos[i] = (k1 - k0) * p / 100
                _progresso()
        kw = dict(sem_audio=True, camadas=sub, audio_segmentos=None, duracao=total - a + 2 / fpsv, audio_clipes=None,
                  legendas=_legendas_na_janela(args["legendas"], a, b), quadro=args["quadro"], opcoes=op, saida=parte,
                  janela=janela, on_progress=_p, stop_event=stop_event, proc_holder=lambda p: _holder(p, procs))
        base = _base_na_janela(args["segmentos"], a, b + margem)
        r = exportar_video(args["path"], base, fmt, args["qualidade"], args["resolucao"], args["usar_gpu"], None, **kw)
        if not r.get("success") and janela["nvdec"] and not (stop_event is not None and stop_event.is_set()):
            janela["nvdec"] = False   # placa sem memória para estes vídeos: o mesmo bloco pelo processador
            r = exportar_video(args["path"], base, fmt, args["qualidade"], args["resolucao"], args["usar_gpu"], None, **kw)
        if not r.get("success") and not (stop_event is not None and stop_event.is_set()):
            falha.append(f"Bloco {i + 1}/{nb} ({a:.1f}–{b:.1f} s): " + str(r.get("error") or "falhou"))
            return None
        with trava:
            feitos[i] = k1 - k0
        return parte

    audio = os.path.join(pasta, "som.wav") if not args["sem_audio"] else None
    res_som, procs_som = {}, []

    def _som():
        # o som (a mesma mixagem da exportação normal) sai ao mesmo tempo que os blocos: é leve e não espera o vídeo
        res_som["r"] = exportar_video(args["path"], args["segmentos"], "wav", args["qualidade"], "original", False, None,
                                      sem_audio=False, camadas=None, audio_segmentos=args["audio_segmentos"], duracao=total,
                                      audio_clipes=args["audio_clipes"], quadro=args["quadro"], saida=audio,
                                      stop_event=stop_event, on_progress=lambda p, m: som_pct.__setitem__(0, p),
                                      proc_holder=lambda p: _holder(p, procs_som))
    t_som = threading.Thread(target=_som, daemon=True) if audio else None
    temp = None
    try:
        if t_som:
            t_som.start()
        prog(0, f"Exportando ({nb} blocos)...")
        # os blocos mais pesados (camadas × quadros) primeiro: não sobram sozinhos para o fim
        ordem = sorted(range(nb), key=lambda i: -sum(1 for ca, cb, _ in spans
                                                       if ca < cortes[i + 1] / fpsv and cb > cortes[i] / fpsv)
                       * (cortes[i + 1] - cortes[i]))
        with ThreadPoolExecutor(max_workers=min(par, nb)) as ex:
            res = dict(zip(ordem, ex.map(_bloco, ordem)))
        if t_som:
            t_som.join()
        if stop_event is not None and stop_event.is_set():
            return {"success": False, "cancelled": True, "error": "Exportação cancelada."}
        if falha:
            return {"success": False, "error": falha[0]}
        partes = [(res[i], cortes[i + 1] - cortes[i]) for i in range(nb)]
        if audio:
            r = res_som.get("r") or {}
            if not r.get("success") or not os.path.isfile(audio):
                audio = None   # timeline sem som
        lista = os.path.join(pasta, "lista.txt")
        prog(99, "Juntando os blocos...")
        # duração exata de cada pedaço (quadros / fps): o ffmpeg não estima pelo arquivo
        with open(lista, "w", encoding="utf-8") as f:
            f.writelines(f"file '{p.replace(chr(92), '/')}'\nduration {n / fpsv:.6f}\n" for p, n in partes)
        # grava num temporário ao lado e só então troca: nunca fica um arquivo pela metade com o nome final
        temp = os.path.splitext(saida)[0] + ".part" + cfg["ext"]
        cmd = [ffmpeg_path(), "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lista]
        if audio:
            cmd += ["-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:a", cfg["acodec"]]
            if not cfg["acodec"].startswith("pcm_"):
                cmd += ["-b:a", q["ab"]]
        else:
            cmd += ["-map", "0:v:0"]
        cmd += ["-c:v", "copy"] + (["-tag:v", "hvc1"] if vcodec == "hevc" and cfg["ext"] in (".mp4", ".mov") else []) \
            + cfg["extra"] + [temp]
        p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, encoding="utf-8",
                             errors="replace", creationflags=_creationflags())
        with _export_lock:
            _export_proc = p
        _, err = p.communicate()
        with _export_lock:
            _export_proc = None
        if p.returncode != 0 or not os.path.isfile(temp):
            return {"success": False, "error": "Falha ao juntar os blocos: " + "\n".join(_linhas_ffmpeg(err) or [str(p.returncode)])}
        os.replace(temp, saida)
        temp = None
    finally:
        if t_som and t_som.is_alive():
            if stop_event is not None:
                stop_event.set()
            t_som.join(timeout=5)
        if temp:
            _apagar(temp)
        shutil.rmtree(pasta, ignore_errors=True)
    prog(100, "Concluído!")
    return {"success": True, "output_path": saida, "output_folder": os.path.dirname(saida), "duration": round(total, 2),
            "size": os.path.getsize(saida), "turbo": False, "blocos": nb}
