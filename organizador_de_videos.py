"""
organizador_de_videos.py
========================
Organiza pastas de LOG de vídeos e fotos para edição audiovisual.

Estrutura PAI/FILHO:
  NomeDoProjeto/
    Sony/          videos/   fotos/   audios/
    Canon/         videos/   fotos/
    iPhone/        videos/   fotos/
    Android/       videos/   fotos/
    DJI_GoPro_ActionCam/  videos/  fotos/
    Blackmagic/    videos/
    RED/           videos/
    ARRI/          videos/
    Fuji/          videos/   fotos/
    Lumix/         videos/   fotos/
    Leica/         videos/   fotos/
    Nikon/         videos/   fotos/
    Olympus/       videos/   fotos/
    Sigma/         videos/
    Desconhecido/  videos/   fotos/   audios/
    duplicatas/
    outros/
  relatorio.txt  BACKUP.json  NEXTUP.json
"""

import os, sys, re, shutil, json, subprocess
import concurrent.futures as cf
from datetime import datetime
from snapshot_logger import gerar_backup, gerar_nextup

EXTENSOES_VIDEO = {
    ".mp4",".mov",".avi",".mkv",".mts",".m2ts",".mxf",
    ".wmv",".flv",".webm",".m4v",".3gp",".ts",".vob",
    ".mpg",".mpeg",".dv",".r3d",".braw",".prproj"
}
EXTENSOES_FOTO = {
    ".jpg",".jpeg",".png",".tiff",".tif",".raw",".arw",
    ".cr2",".cr3",".nef",".dng",".heic",".heif",".webp",
    ".bmp",".orf",".rw2",".pef",".srw",".raf"
}
EXTENSOES_AUDIO = {
    ".mp3",".wav",".aac",".flac",".ogg",".m4a",".wma",
    ".aiff",".aif",".opus"
}

_NAO_PROFISSIONAL = {
    "BRUTOS","BRUTO","RAW","FOOTAGE","VIDEOS","VIDEO","FOTOS",
    "PHOTOS","PHOTO","AUDIO","AUDIOS","OUTROS","BACKUP","EXPORTS",
    "EXPORT","IMPORT","LOG","LOGS","CARD","SD","SSD","HDD","USB",
    "CAMERA","CAM","DRONE","GOPRO","IPHONE","SAMSUNG","SONY","CANON",
    "NIKON","DJI","MAVIC","ACTION","CLIP","CLIPS","PROJETO","PROJECT",
    "EDIT","EDITS","MEDIA","MISC","VARIOUS","MIX","MULTI","MULTICAM",
    "PRIVATE","100CANON","100ANDRO","XDROOT","DCIM","STREAM","AVCHD",
    "BDMV","CERTIFICATE","BDAV","BACKUP","NEXTUP","ORGANIZADO",
}

_INVALIDO_METADADO = [
    "lavf","libav","ffmpeg","encoder","handler","video","audio",
    "track","stream","mp4","h264","h265","avc","hevc","codec",
    "quicktime","generic","unknown","mediatek","qualcomm",
]

# Mapa marca → pasta PAI (ordem importa: mais específico primeiro)
_MAPA_PAI = [
    # iPhone/iPad
    ("iphone","iPhone"), ("ipad","iPhone"), ("apple","iPhone"),
    # Android
    ("samsung","Android"),("galaxy","Android"),("pixel","Android"),
    ("xiaomi","Android"),("redmi","Android"),("huawei","Android"),
    ("oneplus","Android"),("motorola","Android"),("oppo","Android"),
    ("vivo","Android"),("realme","Android"),("nokia","Android"),
    ("zte","Android"),("sm-","Android"),("android","Android"),
    # DJI / GoPro / Action
    ("dji","DJI_GoPro_ActionCam"),("mavic","DJI_GoPro_ActionCam"),
    ("osmo","DJI_GoPro_ActionCam"),("phantom","DJI_GoPro_ActionCam"),
    ("gopro","DJI_GoPro_ActionCam"),("insta360","DJI_GoPro_ActionCam"),
    ("action cam","DJI_GoPro_ActionCam"),
    # Sony
    ("sony","Sony"),("ilce-","Sony"),("ilca-","Sony"),("zv-e","Sony"),
    ("fx3","Sony"),("fx6","Sony"),("fx9","Sony"),("pxw-","Sony"),
    ("xdcam","Sony"),("venice","Sony"),
    # Canon
    ("canon","Canon"),("eos","Canon"),("c70","Canon"),
    ("c300","Canon"),("c500","Canon"),("c200","Canon"),
    # Nikon
    ("nikon","Nikon"),("nikkor","Nikon"),
    # Blackmagic
    ("blackmagic","Blackmagic"),("bmpcc","Blackmagic"),
    ("ursa","Blackmagic"),("pocket cinema","Blackmagic"),
    # RED
    ("komodo","RED"),("monstro","RED"),("helium","RED"),
    ("dragon","RED"),("raven","RED"),(" red ","RED"),
    # ARRI
    ("arri","ARRI"),("alexa","ARRI"),("amira","ARRI"),
    # Fuji
    ("fujifilm","Fuji"),("fuji","Fuji"),("x-h2","Fuji"),
    ("x-t","Fuji"),("x-s","Fuji"),("gfx","Fuji"),
    # Lumix / Panasonic
    ("panasonic","Lumix"),("lumix","Lumix"),("gh5","Lumix"),
    ("gh6","Lumix"),("gh7","Lumix"),("ag-","Lumix"),
    # Leica
    ("leica","Leica"),("sl2","Leica"),("m11","Leica"),
    # Olympus / OM System
    ("olympus","Olympus"),("om system","Olympus"),
    ("om-d","Olympus"),("om-1","Olympus"),
    # Sigma
    ("sigma","Sigma"),
]

# Extensões exclusivas de câmeras específicas
_EXT_PAI = {
    ".r3d":  "RED",
    ".braw": "Blackmagic",
    ".ari":  "ARRI",
    # .mts e .mxf são formatos Sony/profissional — fallback Sony se metadado não identificar
    # (não adicionamos aqui pois queremos tentar metadados primeiro — aplicamos no fallback)
}
# Extensões que têm fallback específico se metadados não identificarem
_EXT_FALLBACK = {
    ".mts":  "Sony",   # AVCHD — Sony, Panasonic
    ".m2ts": "Sony",   # AVCHD — Sony, Panasonic
    ".mxf":  "Sony",   # Professional — Sony, Canon, Panasonic
}

# Prefixos de nome de arquivo típicos
_PREFIXO_PAI = {
    "IMG_": "iPhone",    # iPhone/iPad — IMG_XXXX.MOV ou IMG_XXXX(1).MOV
    "MOV_": "Android",
    "VID_": "Android",
    "DSCF": "Fuji",
    "GOPR": "DJI_GoPro_ActionCam",
    "GX": "DJI_GoPro_ActionCam",
    "DJI_": "DJI_GoPro_ActionCam",
    "DJIM": "DJI_GoPro_ActionCam",
    "MVI_": "Canon",
}

# Padrões regex para nomes de arquivo (mais flexíveis que prefixo simples)
import re as _re_mod
_REGEX_PAI = [
    # DJI usa nomes como DJI_0001.MOV, DJIM0001.MOV — deve vir ANTES do iPhone
    # iPhone: IMG_XXXX.MOV — mas NÃO se o nome começar com DJI
    (_re_mod.compile(r'^IMG_\d{4}(?!.*DJI)', _re_mod.IGNORECASE), "iPhone"),
    # iPhone fotos: _MG_XXXX.JPG (Canon também usa, mas com extensão RAW diferente)
    (_re_mod.compile(r'^_MG_\d{4}', _re_mod.IGNORECASE), "Canon"),
    # DJI: DJI_XXXX, DJIM_XXXX
    (_re_mod.compile(r'^DJI[_M]?\d{4}', _re_mod.IGNORECASE), "DJI_GoPro_ActionCam"),
    # GoPro: GOPRXXXX, GXXXXXYYY, GPXXXXYYY
    (_re_mod.compile(r'^(GOPR|GX\d{2}|GP\d{3})\d{4}', _re_mod.IGNORECASE), "DJI_GoPro_ActionCam"),
    # Sony: DSC_XXXX, DSCF_XXXX
    (_re_mod.compile(r'^DSC[FN_]?\d{4}', _re_mod.IGNORECASE), "Sony"),
    # Canon vídeo: MVI_XXXX
    (_re_mod.compile(r'^MVI_\d{4}', _re_mod.IGNORECASE), "Canon"),
    # Android: VID_YYYYMMDD, MOV_YYYYMMDD
    (_re_mod.compile(r'^(VID|MOV)_\d{8}', _re_mod.IGNORECASE), "Android"),
]


def _get_base_dir():
    if hasattr(sys, "_MEIPASS"):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _carregar_camera_map(callback_log=None):
    """
    Carrega regras locais de classificação de câmera/dispositivo.

    Formato esperado (camera_map.json):
    {
      "contains": {"ilce-7m4": "Sony", "iphone 15": "iPhone"},
      "prefix": {"A0": "Canon"},
      "ext": {".mxf": "Canon"},
      "folder_contains": {"/drone/": "DJI_GoPro_ActionCam"},
      "regex": [{"pattern": "^C\\d{4}", "pai": "Canon"}]
    }
    """
    path = os.path.join(_get_base_dir(), "camera_map.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return None

        norm = {
            "contains": {},
            "prefix": {},
            "ext": {},
            "folder_contains": {},
            "regex": [],
            "_path": path,
        }

        for k in ["contains", "prefix", "ext", "folder_contains"]:
            bloco = data.get(k, {})
            if isinstance(bloco, dict):
                for chave, pai in bloco.items():
                    if isinstance(chave, str) and isinstance(pai, str) and chave.strip() and pai.strip():
                        norm[k][chave.strip().lower()] = pai.strip()

        bloco_regex = data.get("regex", [])
        if isinstance(bloco_regex, list):
            for item in bloco_regex:
                if not isinstance(item, dict):
                    continue
                padrao = str(item.get("pattern", "")).strip()
                pai = str(item.get("pai", "")).strip()
                if not padrao or not pai:
                    continue
                try:
                    norm["regex"].append((re.compile(padrao, re.IGNORECASE), pai))
                except Exception:
                    pass

        if callback_log:
            q = (len(norm["contains"]) + len(norm["prefix"]) + len(norm["ext"]) +
                 len(norm["folder_contains"]) + len(norm["regex"]))
            callback_log(f"🧠 camera_map: {q} regra(s) carregada(s)")
        return norm
    except Exception as e:
        if callback_log:
            callback_log(f"⚠️ camera_map inválido: {e}")
        return None


def _coletar_hints_metadado(path, ffprobe_bin=None, exiftool_bin=None):
    """Coleta pistas de metadado para diagnóstico e regras customizadas."""
    hints = []
    fontes = {}

    if exiftool_bin:
        try:
            cmd = [
                exiftool_bin,
                "-Make", "-Model", "-CameraModelName",
                "-DeviceManufacturer", "-DeviceModelName",
                "-DroneModel", "-VehicleModel",
                "-HandlerVendorID", "-CompressorName",
                "-j", "-q", path,
            ]
            r = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=20,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            if r.returncode == 0 and r.stdout.strip():
                data = json.loads(r.stdout)
                if data:
                    tags = data[0]
                    campos = [
                        "Make", "Model", "CameraModelName",
                        "DeviceManufacturer", "DeviceModelName",
                        "DroneModel", "VehicleModel",
                        "HandlerVendorID", "CompressorName",
                    ]
                    exif_vals = []
                    for c in campos:
                        v = str(tags.get(c, "")).strip()
                        if v and len(v) <= 80:
                            exif_vals.append(v)
                            hints.append(v)
                    if exif_vals:
                        fontes["exiftool"] = exif_vals
        except Exception:
            pass

    if ffprobe_bin:
        try:
            cmd = [ffprobe_bin, "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path]
            r = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=20,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            if r.returncode == 0 and r.stdout.strip():
                data = json.loads(r.stdout)
                tags = (data.get("format") or {}).get("tags") or {}
                streams = data.get("streams") or []
                probe_vals = []
                for chave in [
                    "com.apple.quicktime.model", "com.apple.quicktime.make",
                    "com.android.manufacturer", "com.android.model",
                    "make", "model", "Make", "Model",
                ]:
                    v = tags.get(chave) or tags.get(chave.lower()) or tags.get(chave.upper())
                    if v:
                        vs = str(v).strip()
                        if vs and len(vs) <= 80:
                            probe_vals.append(vs)
                            hints.append(vs)
                for stream in streams:
                    st = stream.get("tags", {})
                    for chave in ["handler_name", "vendor_id", "encoder"]:
                        v = st.get(chave, "")
                        if v:
                            vs = str(v).strip()
                            if vs and len(vs) <= 80:
                                probe_vals.append(vs)
                                hints.append(vs)
                if probe_vals:
                    fontes["ffprobe"] = probe_vals
        except Exception:
            pass

    return {
        "texto": " ".join(hints).strip(),
        "fontes": fontes,
    }


def _aplicar_camera_map(path, mapa_custom, hints_texto=""):
    if not mapa_custom:
        return None

    ext = os.path.splitext(path)[1].lower()
    nome = os.path.basename(path)
    nome_low = nome.lower()
    pasta_low = os.path.dirname(path).replace("\\", "/").lower()
    alvo_texto = f"{nome_low} {pasta_low} {hints_texto.lower()}".strip()

    if ext in mapa_custom.get("ext", {}):
        return mapa_custom["ext"][ext]

    for pref, pai in mapa_custom.get("prefix", {}).items():
        if nome_low.startswith(pref):
            return pai

    for trecho, pai in mapa_custom.get("folder_contains", {}).items():
        if trecho and trecho in pasta_low:
            return pai

    for trecho, pai in mapa_custom.get("contains", {}).items():
        if trecho and trecho in alvo_texto:
            return pai

    for rx, pai in mapa_custom.get("regex", []):
        try:
            if rx.search(nome):
                return pai
        except Exception:
            pass

    return None


def _get_ffprobe():
    base = sys._MEIPASS if hasattr(sys, "_MEIPASS") else os.path.dirname(os.path.abspath(__file__))
    exe  = os.path.dirname(sys.executable) if hasattr(sys, "_MEIPASS") else base
    for pasta in [base, exe]:
        for nome in ["ffprobe.exe", "ffmpeg.exe"]:
            path = os.path.join(pasta, nome)
            if os.path.exists(path):
                return path, nome == "ffmpeg.exe"
    for nome in ["ffprobe", "ffmpeg"]:
        try:
            subprocess.run([nome, "-version"], capture_output=True, timeout=3)
            return nome, nome == "ffmpeg"
        except Exception:
            pass
    return None, False


def _get_exiftool():
    """
    Retorna o caminho do exiftool.exe ou None se não disponível.
    1. _MEIPASS (embutido no .exe pelo PyInstaller)
    2. Pasta ao lado do executável
    3. PATH do sistema
    """
    # 1. Embutido no .exe
    if hasattr(sys, "_MEIPASS"):
        meipass_exe = os.path.join(sys._MEIPASS, "exiftool.exe")
        if os.path.exists(meipass_exe):
            return meipass_exe

    # 2. Ao lado do executável
    base = os.path.dirname(sys.executable) if hasattr(sys, "_MEIPASS") \
           else os.path.dirname(os.path.abspath(__file__))
    local = os.path.join(base, "exiftool.exe")
    if os.path.exists(local):
        return local

    # 3. PATH do sistema
    try:
        r = subprocess.run(["exiftool", "-ver"], capture_output=True, timeout=3)
        if r.returncode == 0:
            return "exiftool"
    except Exception:
        pass
    return None


def _exiftool_pai(path, exiftool_bin):
    """
    Usa ExifTool para extrair Make/Model/etc e identificar o PAI.
    ExifTool conhece campos proprietários de Sony, Canon, DJI, GoPro, etc.
    Retorna string do PAI ou None.
    """
    try:
        cmd = [
            exiftool_bin,
            "-Make", "-Model", "-CameraModelName",
            "-DeviceManufacturer", "-DeviceModelName",
            "-DroneModel", "-VehicleModel",
            "-HandlerVendorID", "-CompressorName",
            "-j",          # output JSON
            "-q",          # quiet
            path
        ]
        r = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=15,
                           creationflags=subprocess.CREATE_NO_WINDOW
                           if sys.platform == "win32" else 0)
        if r.returncode != 0 or not r.stdout.strip():
            return None

        data = json.loads(r.stdout)
        if not data:
            return None

        tags = data[0]  # ExifTool retorna lista com um item por arquivo

        # Campos em ordem de confiança
        campos = [
            "Make", "Model", "CameraModelName",
            "DeviceManufacturer", "DeviceModelName",
            "DroneModel", "VehicleModel",
            "HandlerVendorID", "CompressorName",
        ]

        valores = []
        for campo in campos:
            v = tags.get(campo, "")
            if v and isinstance(v, str) and len(v) <= 60:
                v_lower = v.lower()
                # Filtra valores claramente inválidos
                if not any(p in v_lower for p in _INVALIDO_METADADO):
                    valores.append(v)

        if not valores:
            return None

        texto = " ".join(valores)
        return _texto_para_pai(texto)

    except Exception:
        return None


def _texto_para_pai(texto):
    t = texto.lower().strip()
    for chave, pai in _MAPA_PAI:
        if chave in t:
            return pai
    return None


def identificar_pai(path, ffprobe_bin=None, exiftool_bin=None, mapa_custom=None):
    ext      = os.path.splitext(path)[1].lower()
    nome_arq = os.path.basename(path)
    nome_up  = nome_arq.upper()

    # 0. Regras por nome (forçadas)
    # Lightroom Mobile exportado no celular durante o evento
    if ext in EXTENSOES_FOTO and "COMPARTILHADA DO LIGHTROOM MOBILE" in nome_up:
        return "Lightroom photos"
    # DJI/GoPro/Insta360 no nome devem ter prioridade sobre qualquer outro indício
    if any(k in nome_up for k in ["DJI", "GOPR", "INSTA360"]):
        return "DJI_GoPro_ActionCam"

    # 1. Extensão exclusiva de câmera
    if ext in _EXT_PAI:
        return _EXT_PAI[ext]

    # 2. ExifTool — padrão ouro, conhece campos proprietários de todas as câmeras
    if exiftool_bin:
        pai = _exiftool_pai(path, exiftool_bin)
        if pai:
            return pai

    # 3. EXIF via Pillow para fotos (fallback rápido sem ExifTool)
    if ext in EXTENSOES_FOTO:
        try:
            from PIL import Image as _I
            from PIL.ExifTags import TAGS
            img  = _I.open(path)
            exif = img._getexif()
            if exif:
                make = model = ""
                for tid, v in exif.items():
                    tag = TAGS.get(tid, "")
                    if tag == "Make":  make  = str(v).strip()
                    if tag == "Model": model = str(v).strip()
                pai = _texto_para_pai(f"{make} {model}")
                if pai:
                    return pai
        except Exception:
            pass

    # 4. ffprobe para vídeos/áudios
    if ext in EXTENSOES_VIDEO | EXTENSOES_AUDIO and ffprobe_bin:
        try:
            cmd = [ffprobe_bin, "-v", "quiet", "-print_format", "json",
                   "-show_format", "-show_streams", path]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if r.returncode == 0:
                data    = json.loads(r.stdout)
                tags    = data.get("format", {}).get("tags", {})
                streams = data.get("streams", [])
                valores = []
                for chave in ["com.apple.quicktime.model",
                              "com.apple.quicktime.make",
                              "com.android.manufacturer",
                              "com.android.model",
                              "make", "model", "Make", "Model"]:
                    v = tags.get(chave) or tags.get(chave.lower()) or tags.get(chave.upper())
                    if v:
                        vs = str(v).strip()
                        if len(vs) <= 50 and not any(p in vs.lower() for p in _INVALIDO_METADADO):
                            valores.append(vs)
                # Handler de streams (GoPro, DJI gravam aqui)
                for stream in streams:
                    st = stream.get("tags", {})
                    for chave in ["handler_name", "vendor_id"]:
                        v = st.get(chave, "")
                        if v and len(v) <= 30:
                            if any(m in v.lower() for m in
                                   ["gopro","dji","apple","insta360",
                                    "sony","canon","nikon","blackmagic"]):
                                valores.append(v)
                if valores:
                    pai = _texto_para_pai(" ".join(valores))
                    if pai:
                        return pai
        except Exception:
            pass

    # 5. Prefixo simples do nome do arquivo
    #    DJI tem prioridade sobre iPhone no prefixo IMG_
    if nome_up.startswith("DJI") or nome_up.startswith("DJIM"):
        return "DJI_GoPro_ActionCam"
    for prefixo, pai in _PREFIXO_PAI.items():
        if nome_up.startswith(prefixo):
            return pai

    # 6. Regex mais flexível (cobre IMG_XXXX(1).MOV e variantes)
    nome_sem_ext = os.path.splitext(nome_arq)[0]
    for padrao, pai in _REGEX_PAI:
        if padrao.match(nome_sem_ext):
            return pai

    # 7. Regras customizadas locais (camera_map.json)
    if mapa_custom:
        pai_custom = _aplicar_camera_map(path, mapa_custom)
        if pai_custom:
            return pai_custom

    # 8. Fallback por extensão profissional (.mts, .m2ts, .mxf → Sony)
    if ext in _EXT_FALLBACK:
        return _EXT_FALLBACK[ext]

    # 9. Vídeo com nome IMG_ não identificado → Smartphone
    #    (pode ser iPhone sem metadado ou Android)
    nome_up = nome_arq.upper()
    if ext in EXTENSOES_VIDEO and nome_up.startswith("IMG"):
        # Verifica se já existe pai iPhone para agrupar junto
        return "iPhone"

    return "Desconhecido"


def extrair_data(path, ffprobe_bin=None):
    ext = os.path.splitext(path)[1].lower()
    if ext in EXTENSOES_FOTO:
        try:
            from PIL import Image
            from PIL.ExifTags import TAGS
            img  = Image.open(path)
            exif = img._getexif()
            if exif:
                for tid, v in exif.items():
                    tag = TAGS.get(tid, tid)
                    if tag in ("DateTimeOriginal","DateTime","DateTimeDigitized"):
                        try:
                            return datetime.strptime(str(v), "%Y:%m:%d %H:%M:%S")
                        except Exception:
                            pass
        except Exception:
            pass
    if ext in EXTENSOES_VIDEO | EXTENSOES_AUDIO and ffprobe_bin:
        try:
            cmd = [ffprobe_bin, "-v", "quiet", "-print_format", "json", "-show_format", path]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if r.returncode == 0:
                tags = json.loads(r.stdout).get("format", {}).get("tags", {})
                for chave in ["creation_time","date","com.apple.quicktime.creationdate"]:
                    valor = tags.get(chave) or tags.get(chave.upper())
                    if valor:
                        for fmt in ["%Y-%m-%dT%H:%M:%S.%fZ","%Y-%m-%dT%H:%M:%SZ",
                                    "%Y-%m-%d %H:%M:%S","%Y-%m-%dT%H:%M:%S"]:
                            try:
                                return datetime.strptime(valor[:19], fmt[:len(valor[:19])])
                            except Exception:
                                pass
        except Exception:
            pass
    try:
        return datetime.fromtimestamp(os.path.getmtime(path))
    except Exception:
        return datetime.now()


def extrair_duracao(path, ffprobe_bin=None):
    if not ffprobe_bin:
        return 0
    try:
        bin_low = os.path.basename(str(ffprobe_bin)).lower()

        # Caminho rápido via ffprobe (mais leve que -show_streams completo)
        if "ffprobe" in bin_low:
            cmd = [
                ffprobe_bin, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ]
            r = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            if r.returncode == 0:
                txt = (r.stdout or "").strip().splitlines()
                if txt:
                    try:
                        v = float(txt[0])
                        if v > 0:
                            return v
                    except Exception:
                        pass

            # Fallback: duração por stream
            cmd = [
                ffprobe_bin, "-v", "error",
                "-show_entries", "stream=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ]
            r = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=12,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            if r.returncode == 0:
                for linha in (r.stdout or "").splitlines():
                    try:
                        v = float(str(linha).strip())
                        if v > 0:
                            return v
                    except Exception:
                        pass

        # Fallback quando só existe ffmpeg: parse de "Duration: HH:MM:SS.xx" no stderr
        cmd = [ffprobe_bin, "-i", path]
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=12,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        info = (r.stderr or "") + "\n" + (r.stdout or "")
        m = re.search(r"Duration:\s+(\d+):(\d+):([\d.]+)", info)
        if m:
            h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
            v = h * 3600 + mn * 60 + s
            if v > 0:
                return v
    except Exception:
        pass
    return 0


def _detectar_profissional(path, pasta_raiz):
    try:
        rel    = os.path.relpath(path, pasta_raiz)
        partes = rel.replace("\\", "/").split("/")
        for parte in partes[:-1]:
            pc = parte.strip()
            pu = re.sub(r'\d+', '', pc).upper().strip()
            if (2 <= len(pc) <= 20
                    and not re.search(r'[0-9]{4}', pc)
                    and re.search(r'[a-zA-Z]', pc)
                    and pu not in _NAO_PROFISSIONAL
                    and not pc.startswith(".")):
                return pc.capitalize()
    except Exception:
        pass
    return None


def _tem_sufixo_copia(nome_sem_ext):
    """
    Retorna True APENAS se o nome claramente indica uma cópia do SO.
    MUITO conservador — só padrões que o sistema operacional cria automaticamente.
    NÃO inclui _1, _2 — câmeras Canon/Sony usam isso para clipes sequenciais.
    """
    n = nome_sem_ext.strip()
    if re.search(r'\(\d+\)$', n):           # IMG_1234(1) — macOS/iOS
        return True
    if re.search(r'\s+\(\d+\)$', n):        # IMG_1234 (2) — Windows
        return True
    if re.search(r'[-_\s]+(c[oó]pia|copy|copia|dup|duplicate|backup)\s*(\d*)$',
                 n, re.IGNORECASE):          # arquivo - Copia, arquivo - Copy
        return True
    return False


def _nome_base_canonico(nome_sem_ext):
    """
    Remove sufixos de cópia do SO para obter o nome base.
    NÃO remove _1, _2 — esses são sequências de câmera.
    Retorna (nome_base, tinha_sufixo_copia).
    """
    n = nome_sem_ext.strip()
    orig = n
    n = re.sub(r'\s*\(\d+\)\s*$', '', n)
    n = re.sub(r'\s+\(\d+\)\s*$', '', n)
    n = re.sub(r'[-_\s]+(c[oó]pia|copy|copia|dup|duplicate|backup)\s*\d*$',
               '', n, flags=re.IGNORECASE)
    tinha = n.lower() != orig.lower()
    return n.lower().strip(), tinha


def detectar_duplicatas(arquivos_info):
    """
    Detecta duplicatas de forma CONSERVADORA.

    Um arquivo é duplicata SOMENTE se:
    1. Tem exatamente o mesmo tamanho E mesma duração E
       ao menos um dos dois tem sufixo de cópia do SO: (1), (2), - Copia, - Copy
    OU
    2. Tem exatamente o mesmo tamanho E mesma duração E
       nome base idêntico (sem sufixos de cópia) — ex: IMG_1234.MOV e IMG_1234(1).MOV

    NÃO marca como duplicata:
    - Arquivos com mesmo tamanho mas nomes não relacionados
      (Canon grava muitos clipes com durações iguais por acidente)
    - Arquivos com _1, _2 no nome (são sequências de câmera, não cópias)
    """
    dups = set()

    # Agrupa por tamanho + duração exatos
    grupos = {}  # (tam, dur) → lista de infos
    for info in arquivos_info:
        if info["tipo"] not in ("video", "foto", "audio"):
            continue
        tam = info["tamanho"]
        if tam == 0:
            continue
        dur   = round(info.get("duracao", 0))
        chave = (tam, dur)
        if chave not in grupos:
            grupos[chave] = []
        grupos[chave].append(info)

    # Analisa cada grupo de arquivos com mesmo tamanho+duração
    for chave, grupo in grupos.items():
        if len(grupo) <= 1:
            continue  # único com esse tamanho — não é duplicata

        # Dentro do grupo, compara pares
        for i, info_a in enumerate(grupo):
            if info_a["path"] in dups:
                continue
            for info_b in grupo[i+1:]:
                if info_b["path"] in dups:
                    continue

                nome_a = os.path.splitext(os.path.basename(info_a["path"]))[0]
                nome_b = os.path.splitext(os.path.basename(info_b["path"]))[0]

                base_a, copia_a = _nome_base_canonico(nome_a)
                base_b, copia_b = _nome_base_canonico(nome_b)

                # Caso 1: nomes base idênticos (um tem sufixo de cópia)
                if base_a == base_b and (copia_a or copia_b):
                    if copia_b and not copia_a:
                        dups.add(info_b["path"])
                    elif copia_a and not copia_b:
                        dups.add(info_a["path"])
                    else:
                        # Ambos têm sufixo — mantém o de nome "menor" (mais original)
                        if nome_a <= nome_b:
                            dups.add(info_b["path"])
                        else:
                            dups.add(info_a["path"])
                    continue

                # Caso 2: nomes completamente idênticos (mesmo nome, mesmo tamanho)
                if nome_a.lower() == nome_b.lower():
                    # Mantém o primeiro encontrado
                    dups.add(info_b["path"])

                # Caso 3: nomes diferentes, tamanho igual, duração igual
                # → NÃO marca como duplicata (pode ser coincidência)
                # Câmeras Canon/Sony gravam muitos clipes curtos com mesma duração

    return dups


def nome_seguro(pasta, nome):
    base, ext = os.path.splitext(nome)
    dest = os.path.join(pasta, nome)
    n = 1
    while os.path.exists(dest):
        dest = os.path.join(pasta, f"{base}_{n}{ext}")
        n += 1
    return dest


def _coletar_info_arquivo(path, pasta_raiz, ffprobe_bin, exiftool_bin, mapa_custom):
    """Lê metadados de um único arquivo (usado em paralelo)."""
    ext = os.path.splitext(path)[1].lower()
    tam = os.path.getsize(path)

    if ext in EXTENSOES_VIDEO:
        tipo, dur = "video", extrair_duracao(path, ffprobe_bin)
    elif ext in EXTENSOES_FOTO:
        tipo, dur = "foto", 0
    elif ext in EXTENSOES_AUDIO:
        tipo, dur = "audio", extrair_duracao(path, ffprobe_bin)
    else:
        tipo, dur = "outro", 0

    pai = identificar_pai(path, ffprobe_bin, exiftool_bin, mapa_custom=mapa_custom) if tipo != "outro" else None
    if pai == "Desconhecido":
        pai = None

    hints = None
    if tipo != "outro" and not pai:
        hints = _coletar_hints_metadado(path, ffprobe_bin=ffprobe_bin, exiftool_bin=exiftool_bin)
        pai = _aplicar_camera_map(path, mapa_custom, hints_texto=hints.get("texto", "")) if mapa_custom else None

    data = extrair_data(path, ffprobe_bin)
    prof = _detectar_profissional(path, pasta_raiz)

    info = {
        "path": path, "tipo": tipo, "pai": pai,
        "data": data, "tamanho": tam, "duracao": dur,
        "ext": ext, "profissional": prof,
    }

    dbg = None
    if tipo in ("video", "foto", "audio") and not pai:
        dbg = {
            "path": path,
            "tipo": tipo,
            "ext": ext,
            "tamanho": tam,
            "duracao": round(float(dur or 0), 2),
            "hints": (hints or {"texto": "", "fontes": {}}),
        }

    return info, dbg


def organizar_videos(pasta, nome_projeto=None, callback_progresso=None, callback_log=None, metadata_workers=None):

    nome_pasta = re.sub(r'[\\/:*?"<>|]', '_', nome_projeto or "organizado").strip()

    # Saída FORA da pasta selecionada (ao lado)
    pasta_pai_dir = os.path.dirname(os.path.abspath(pasta))
    pasta_org     = os.path.join(pasta_pai_dir, nome_pasta)
    if os.path.exists(pasta_org):
        n = 1
        while os.path.exists(f"{pasta_org}_{n}"):
            n += 1
        pasta_org = f"{pasta_org}_{n}"

    pasta_dup    = os.path.join(pasta_org, "duplicatas")
    pasta_dup_vid = os.path.join(pasta_dup, "videos")
    pasta_dup_fot = os.path.join(pasta_dup, "fotos")
    pasta_dup_aud = os.path.join(pasta_dup, "audios")
    pasta_dup_out = os.path.join(pasta_dup, "outros")
    pasta_outros = os.path.join(pasta_org, "outros")
    os.makedirs(pasta_org,    exist_ok=True)
    os.makedirs(pasta_outros, exist_ok=True)

    # Marcos de progresso (0-100)
    P_SCAN = 5
    P_META_INI = 5
    P_META_FIM = 55
    P_DUP_FIM = 60
    P_BACKUP_FIM = 68
    P_MOVE_INI = 68
    P_MOVE_FIM = 96
    P_NEXTUP_FIM = 98

    ffprobe_bin, _ = _get_ffprobe()
    exiftool_bin   = _get_exiftool()
    mapa_custom    = _carregar_camera_map(callback_log=callback_log)
    if callback_log:
        callback_log(f"📂 Saída: {pasta_org}")
        callback_log(f"{'✅' if ffprobe_bin else '⚠️ '} ffprobe:  "
                     f"{os.path.basename(ffprobe_bin) if ffprobe_bin else 'não encontrado'}")
        callback_log(f"{'✅' if exiftool_bin else '⚠️ '} exiftool: "
                     f"{os.path.basename(exiftool_bin) if exiftool_bin else 'não encontrado — leitura básica'}")
        if mapa_custom:
            callback_log(f"✅ camera_map: {os.path.basename(mapa_custom.get('_path', 'camera_map.json'))}")
        else:
            callback_log("ℹ️ camera_map: não encontrado (opcional)")

    # Coleta arquivos
    IGNORAR = {os.path.basename(pasta_org), nome_pasta, "organizado"}
    arquivos_raw = []
    for root, dirs, files in os.walk(pasta):
        dirs[:] = [d for d in dirs if d not in IGNORAR and not d.startswith('.')]
        for f in files:
            if not f.startswith('.'):
                arquivos_raw.append(os.path.join(root, f))

    total = len(arquivos_raw)
    if callback_log:
        callback_log(f"📥 {total} arquivo(s) encontrado(s)")
    if callback_progresso:
        callback_progresso(P_SCAN, f"Arquivos encontrados: {total}")
    if total == 0:
        if callback_progresso:
            callback_progresso(100, "Nenhum arquivo encontrado")
        return {"total":0,"videos":0,"fotos":0,"audio":0,
                "outros":0,"duplicatas":0,"movidos":0,"pasta_org":pasta_org}

    # Lê metadados
    if callback_log:
        callback_log("🔍 Identificando câmeras pelos metadados...")
    arquivos_info = []
    desconhecidos_debug = []
    if metadata_workers is None:
        metadata_workers = min(6, max(2, (os.cpu_count() or 4) // 2))
    metadata_workers = max(1, int(metadata_workers))
    metadata_workers = min(metadata_workers, max(1, total))

    if callback_log:
        modo = "paralelo" if metadata_workers > 1 else "sequencial"
        callback_log(f"   ⚙️ Leitura de metadados: {modo} ({metadata_workers} worker(s))")

    if metadata_workers == 1:
        for i, path in enumerate(arquivos_raw):
            try:
                info, dbg = _coletar_info_arquivo(path, pasta, ffprobe_bin, exiftool_bin, mapa_custom)
            except Exception as e:
                if callback_log:
                    callback_log(f"   ⚠️ Falha em metadados ({os.path.basename(path)}): {e}")
                info = {
                    "path": path, "tipo": "outro", "pai": None,
                    "data": datetime.now(), "tamanho": os.path.getsize(path), "duracao": 0,
                    "ext": os.path.splitext(path)[1].lower(), "profissional": None,
                }
                dbg = None

            arquivos_info.append(info)
            if dbg:
                desconhecidos_debug.append(dbg)
            if callback_progresso and total > 0:
                pct = P_META_INI + int((i+1)/total * (P_META_FIM - P_META_INI))
                callback_progresso(pct, f"Lendo metadados... {i+1}/{total}")
    else:
        concluidos = 0
        with cf.ThreadPoolExecutor(max_workers=metadata_workers) as ex:
            fut_map = {
                ex.submit(_coletar_info_arquivo, path, pasta, ffprobe_bin, exiftool_bin, mapa_custom): path
                for path in arquivos_raw
            }
            for fut in cf.as_completed(fut_map):
                path = fut_map[fut]
                try:
                    info, dbg = fut.result()
                except Exception as e:
                    if callback_log:
                        callback_log(f"   ⚠️ Falha em metadados ({os.path.basename(path)}): {e}")
                    info = {
                        "path": path, "tipo": "outro", "pai": None,
                        "data": datetime.now(), "tamanho": os.path.getsize(path), "duracao": 0,
                        "ext": os.path.splitext(path)[1].lower(), "profissional": None,
                    }
                    dbg = None

                arquivos_info.append(info)
                if dbg:
                    desconhecidos_debug.append(dbg)

                concluidos += 1
                if callback_progresso and total > 0:
                    pct = P_META_INI + int(concluidos/total * (P_META_FIM - P_META_INI))
                    callback_progresso(pct, f"Lendo metadados... {concluidos}/{total}")

    # Detecta duplicatas
    if callback_log:
        callback_log("🔁 Detectando duplicatas...")
    dup_paths = detectar_duplicatas(arquivos_info)
    if callback_log and dup_paths:
        callback_log(f"   {len(dup_paths)} duplicata(s)")
    if callback_progresso:
        callback_progresso(P_DUP_FIM, f"Duplicatas detectadas: {len(dup_paths)}")

    nao_dup = [a for a in arquivos_info if a["path"] not in dup_paths]
    nao_dup.sort(key=lambda x: x["data"])

    # Mapa de destinos para BACKUP
    seq_map      = {}
    mapa_backup  = []
    mapa_movidos = []

    for info in nao_dup:
        tipo, ext  = info["tipo"], info["ext"]
        base_ori   = os.path.splitext(os.path.basename(info["path"]))[0]
        pai        = info.get("pai") or "Desconhecido"
        prof       = info.get("profissional")

        if tipo == "outro":
            dest_plan = os.path.join(pasta_outros, os.path.basename(info["path"]))
        else:
            tipo_plural = tipo + "s"
            filho       = f"{tipo_plural}_{prof}" if prof else tipo_plural
            pasta_filho = os.path.join(pasta_org, pai, filho)
            chave_seq   = (pai, filho)
            seq         = seq_map.get(chave_seq, 0) + 1
            seq_map[chave_seq] = seq
            dest_plan = os.path.join(pasta_filho, f"{seq:03d}_{base_ori}{ext}")

        mapa_backup.append({
            "path": info["path"], "destino_planejado": dest_plan,
            "tamanho": info["tamanho"], "tipo": tipo,
        })
        mapa_movidos.append({
            **info, "path_original": info["path"],
            "destino_final": dest_plan, "pasta_org": pasta_org,
        })

    # Salva BACKUP
    if callback_log:
        callback_log("💾 Salvando BACKUP...")
    gerar_backup(pasta, mapa_backup, pasta_org, callback_log=callback_log)
    if callback_progresso:
        callback_progresso(P_BACKUP_FIM, "BACKUP salvo")

    # Move arquivos
    if callback_log:
        callback_log("📦 Organizando arquivos...")

    movidos = ct_video = ct_foto = ct_audio = ct_outros = ct_dup = 0
    seq_mov = {}

    # Move duplicatas
    for info in arquivos_info:
        if info["path"] not in dup_paths:
            continue
        if info.get("tipo") == "video":
            pasta_dest_dup = pasta_dup_vid
        elif info.get("tipo") == "foto":
            pasta_dest_dup = pasta_dup_fot
        elif info.get("tipo") == "audio":
            pasta_dest_dup = pasta_dup_aud
        else:
            pasta_dest_dup = pasta_dup_out

        os.makedirs(pasta_dest_dup, exist_ok=True)
        dest = nome_seguro(pasta_dest_dup, os.path.basename(info["path"]))
        try:
            shutil.move(info["path"], dest)
            ct_dup += 1; movidos += 1
            if callback_log:
                callback_log(f"   🔁 {os.path.basename(info['path'])}")
        except Exception as e:
            if callback_log:
                callback_log(f"   ⚠️  {os.path.basename(info['path'])}: {e}")

    # Move organizados
    total_mover = len(nao_dup)
    for i, info in enumerate(nao_dup):
        tipo, ext  = info["tipo"], info["ext"]
        nome_ori   = os.path.basename(info["path"])
        base_ori   = os.path.splitext(nome_ori)[0]
        pai        = info.get("pai") or "Desconhecido"
        prof       = info.get("profissional")

        if tipo == "outro":
            dest = nome_seguro(pasta_outros, nome_ori)
            ct_outros += 1
        else:
            tipo_plural = tipo + "s"
            filho       = f"{tipo_plural}_{prof}" if prof else tipo_plural
            pasta_filho = os.path.join(pasta_org, pai, filho)
            os.makedirs(pasta_filho, exist_ok=True)
            chave_seq   = (pai, filho)
            seq         = seq_mov.get(chave_seq, 0) + 1
            seq_mov[chave_seq] = seq
            dest = nome_seguro(pasta_filho, f"{seq:03d}_{base_ori}{ext}")
            if tipo == "video":  ct_video += 1
            elif tipo == "foto": ct_foto  += 1
            elif tipo == "audio":ct_audio += 1

        try:
            shutil.move(info["path"], dest)
            movidos += 1
            if callback_log:
                prof_txt = f" [{prof}]" if prof else ""
                callback_log(f"   ✅ [{pai}]{prof_txt} {os.path.basename(dest)}")
        except Exception as e:
            if callback_log:
                callback_log(f"   ⚠️  {nome_ori}: {e}")

        if callback_progresso and total_mover > 0:
            callback_progresso(P_MOVE_INI + int((i+1)/total_mover*(P_MOVE_FIM-P_MOVE_INI)),
                               f"Movendo... {i+1}/{total_mover}")

    # NEXTUP
    if callback_log:
        callback_log("📤 Gerando NEXTUP...")
    gerar_nextup(pasta, mapa_movidos, nome_pasta, callback_log=callback_log)
    if callback_progresso:
        callback_progresso(P_NEXTUP_FIM, "NEXTUP gerado")

    # Relatório
    dur_total = sum(a["duracao"] for a in arquivos_info if a["tipo"] in ("video","audio"))
    h, m, s = int(dur_total//3600), int((dur_total%3600)//60), int(dur_total%60)

    pais_stats = {}
    for info in nao_dup:
        pai  = info.get("pai") or "Desconhecido"
        tipo = info["tipo"]
        if tipo == "outro":
            continue
        if pai not in pais_stats:
            pais_stats[pai] = {"video":0,"foto":0,"audio":0,"dur":0.0}
        pais_stats[pai][tipo] = pais_stats[pai].get(tipo,0) + 1
        if tipo in ("video","audio"):
            pais_stats[pai]["dur"] += info.get("duracao",0)

    linhas = [
        "RELATÓRIO DE ORGANIZAÇÃO — Canivete do Pailer",
        f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        f"Origem: {pasta}",
        f"Saída:  {pasta_org}",
        "="*60, "",
        f"  Total      : {total}",
        f"  🎬 Vídeos  : {ct_video}",
        f"  📷 Fotos   : {ct_foto}",
        f"  🎵 Áudios  : {ct_audio}",
        f"  📁 Outros  : {ct_outros}",
        f"  🔁 Duplic. : {ct_dup}",
        f"  ⏱️  Duração : {h}h {m}m {s}s",
        "", "="*60, "POR CÂMERA/DISPOSITIVO:", "",
    ]
    for pai, sts in sorted(pais_stats.items()):
        dv = sts["dur"]
        hv,mv,sv = int(dv//3600), int((dv%3600)//60), int(dv%60)
        dur_s = f" ({hv}h{mv:02d}m{sv:02d}s)" if dv > 0 else ""
        linhas.append(f"  {pai}: {sts['video']} vídeos, {sts['foto']} fotos, {sts['audio']} áudios{dur_s}")

    qtd_desconhecidos = sum(1 for a in nao_dup if (a.get("pai") or "Desconhecido") == "Desconhecido" and a["tipo"] != "outro")
    linhas.extend([
        "",
        "="*60,
        "DESCONHECIDOS:",
        f"  Total não identificados: {qtd_desconhecidos}",
        "  Dica: crie/ajuste camera_map.json para ensinar modelos específicos.",
    ])

    if desconhecidos_debug:
        linhas.append("")
        linhas.append("  Amostra (até 20 arquivos):")
        for item in desconhecidos_debug[:20]:
            nome = os.path.basename(item["path"])
            htxt = (item.get("hints", {}).get("texto") or "").strip()
            if len(htxt) > 120:
                htxt = htxt[:120] + "..."
            linhas.append(f"   - {nome} [{item['ext']}] -> hints: {htxt or 'sem metadado útil'}")

    relatorio_path = os.path.join(pasta_org, "relatorio.txt")
    with open(relatorio_path, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    diagnostico_path = os.path.join(pasta_org, "desconhecidos_diagnostico.json")
    try:
        with open(diagnostico_path, "w", encoding="utf-8") as f:
            json.dump({
                "gerado_em": datetime.now().isoformat(),
                "origem": pasta,
                "saida": pasta_org,
                "total_desconhecidos": qtd_desconhecidos,
                "camera_map_path": (mapa_custom or {}).get("_path"),
                "items": desconhecidos_debug,
            }, f, ensure_ascii=False, indent=2)
    except Exception:
        diagnostico_path = None

    if callback_progresso:
        callback_progresso(100, "Finalizado!")
    if callback_log:
        callback_log(f"\n📄 Relatório: {relatorio_path}")
        if diagnostico_path:
            callback_log(f"🧪 Diagnóstico desconhecidos: {diagnostico_path}")
        callback_log(f"📂 Saída: {pasta_org}")

    return {
        "total": total, "videos": ct_video, "fotos": ct_foto,
        "audio": ct_audio, "outros": ct_outros, "duplicatas": ct_dup,
        "movidos": movidos, "relatorio": relatorio_path, "pasta_org": pasta_org,
        "desconhecidos": qtd_desconhecidos, "diagnostico": diagnostico_path,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python organizador_de_videos.py <pasta>")
        sys.exit(1)
    r = organizar_videos(sys.argv[1], callback_log=print)
    print(f"\n🔥 Total:{r['total']} Vídeos:{r['videos']} Fotos:{r['fotos']} "
          f"Áudios:{r['audio']} Outros:{r['outros']} Dups:{r['duplicatas']}")
