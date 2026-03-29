"""
organizador_de_videos.py
========================
Organiza pastas de LOG de vídeos e fotos para edição audiovisual.

O que faz:
  - Lê metadados EXIF (fotos) e ffprobe (vídeos) para obter data/hora real de criação
  - Ordena todos os arquivos cronologicamente
  - Move para estrutura organizada por data → tipo → sequência numérica
  - Detecta duplicatas de vídeo por tamanho + duração + nome base
  - Gera relatório .txt com resumo completo

Estrutura gerada:
  /organizado/
    /2025-03-26/
      /fotos/   001_14h00m32s_original.jpg
      /videos/  001_14h00m45s_original.mp4
    /duplicatas/
    /outros/
  relatorio.txt

Dependências:
  pip install pillow       (metadados EXIF de fotos)
  ffprobe embutido via ffmpeg.exe (metadados de vídeo)
"""

import os
import sys
import re
import shutil
import json
import subprocess
import hashlib
from datetime import datetime
from pathlib import Path
from snapshot_logger import gerar_backup, gerar_nextup

# =========================
# 📋 EXTENSÕES POR TIPO
# =========================
EXTENSOES_VIDEO = {
    ".mp4", ".mov", ".avi", ".mkv", ".mts", ".m2ts", ".mxf",
    ".wmv", ".flv", ".webm", ".m4v", ".3gp", ".ts", ".vob",
    ".mpg", ".mpeg", ".dv", ".r3d", ".braw"
}

EXTENSOES_FOTO = {
    ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".raw", ".arw",
    ".cr2", ".cr3", ".nef", ".dng", ".heic", ".heif", ".webp",
    ".bmp", ".gif"
}

EXTENSOES_AUDIO = {
    ".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma", ".aiff"
}


# =========================
# 🔍 LOCALIZA FFPROBE
# =========================
def _get_ffprobe():
    """Retorna caminho do ffprobe/ffmpeg para extrair metadados de vídeo."""
    if hasattr(sys, "_MEIPASS"):
        base = sys._MEIPASS
        exe  = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
        exe  = base

    for pasta in [base, exe]:
        for nome in ["ffprobe.exe", "ffmpeg.exe"]:
            path = os.path.join(pasta, nome)
            if os.path.exists(path):
                return path, nome == "ffmpeg.exe"

    # Tenta no PATH do sistema
    for nome in ["ffprobe", "ffmpeg"]:
        try:
            subprocess.run([nome, "-version"],
                           capture_output=True, timeout=3)
            return nome, nome == "ffmpeg"
        except Exception:
            pass

    return None, False


# =========================
# 📅 EXTRAIR DATA DE CRIAÇÃO
# =========================
def extrair_data(path, ffprobe_bin=None, usa_ffmpeg=False):
    """
    Tenta extrair a data/hora real de criação do arquivo.
    Ordem de prioridade:
      1. EXIF (fotos)
      2. Metadados de vídeo via ffprobe
      3. Data de modificação do arquivo (fallback)
    """
    ext = os.path.splitext(path)[1].lower()

    # --- EXIF para fotos ---
    if ext in EXTENSOES_FOTO:
        try:
            from PIL import Image
            from PIL.ExifTags import TAGS
            img  = Image.open(path)
            exif = img._getexif()
            if exif:
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if tag in ("DateTimeOriginal", "DateTime", "DateTimeDigitized"):
                        try:
                            return datetime.strptime(str(value), "%Y:%m:%d %H:%M:%S")
                        except Exception:
                            pass
        except Exception:
            pass

    # --- ffprobe para vídeos e áudios ---
    if ext in EXTENSOES_VIDEO | EXTENSOES_AUDIO and ffprobe_bin:
        try:
            if usa_ffmpeg:
                # ffmpeg pode extrair metadados também
                cmd = [ffprobe_bin, "-v", "quiet", "-print_format", "json",
                       "-show_format", path]
            else:
                cmd = [ffprobe_bin, "-v", "quiet", "-print_format", "json",
                       "-show_format", path]

            resultado = subprocess.run(
                cmd, capture_output=True, text=True, timeout=15
            )
            if resultado.returncode == 0:
                data = json.loads(resultado.stdout)
                tags = data.get("format", {}).get("tags", {})

                for chave in ["creation_time", "date", "com.apple.quicktime.creationdate"]:
                    valor = tags.get(chave) or tags.get(chave.upper())
                    if valor:
                        for fmt in ["%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
                                    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"]:
                            try:
                                return datetime.strptime(valor[:19], fmt[:len(valor[:19])])
                            except Exception:
                                pass
        except Exception:
            pass

    # --- Fallback: data de modificação ---
    try:
        ts = os.path.getmtime(path)
        return datetime.fromtimestamp(ts)
    except Exception:
        return datetime.now()


# =========================
# 📷 EXTRAIR MODELO DA CÂMERA
# =========================
def extrair_camera(path, ffprobe_bin=None):
    """
    Tenta identificar o modelo da câmera/celular/drone.
    Retorna string limpa ex: "Sony", "iPhone", "DJI" ou None.
    """
    ext = os.path.splitext(path)[1].lower()

    # --- EXIF para fotos ---
    if ext in EXTENSOES_FOTO:
        try:
            from PIL import Image as _Img
            from PIL.ExifTags import TAGS
            img  = _Img.open(path)
            exif = img._getexif()
            if exif:
                make  = None
                model = None
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, "")
                    if tag == "Make":  make  = str(value).strip()
                    if tag == "Model": model = str(value).strip()
                if model:
                    # Remove make do model se repetido (ex: "Apple iPhone 14" → "iPhone14")
                    if make and model.startswith(make):
                        model = model[len(make):].strip()
                    return _limpar_nome_camera(model or make)
                if make:
                    return _limpar_nome_camera(make)
        except Exception:
            pass

    # --- ffprobe para vídeos ---
    if ext in EXTENSOES_VIDEO and ffprobe_bin:
        try:
            cmd = [ffprobe_bin, "-v", "quiet", "-print_format", "json",
                   "-show_format", path]
            resultado = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if resultado.returncode == 0:
                data = json.loads(resultado.stdout)
                tags = data.get("format", {}).get("tags", {})
                for chave in ["com.apple.quicktime.model", "model", "Make",
                               "com.android.model", "encoder", "handler_name"]:
                    valor = tags.get(chave) or tags.get(chave.lower()) or tags.get(chave.upper())
                    if valor and len(str(valor)) < 40:
                        limpo = _limpar_nome_camera(str(valor))
                        if limpo:
                            return limpo
        except Exception:
            pass

    return None


def _limpar_nome_camera(nome):
    """Limpa e abrevia o nome da câmera para usar no filename."""
    if not nome:
        return None
    # Remove caracteres inválidos em nomes de arquivo
    nome = re.sub(r'[\/:*?"<>|]', '', nome)
    nome = nome.strip()
    # Abreviações conhecidas
    abreviacoes = {
        "apple":    "Apple",
        "iphone":   "iPhone",
        "ipad":     "iPad",
        "samsung":  "Samsung",
        "sony":     "Sony",
        "canon":    "Canon",
        "nikon":    "Nikon",
        "gopro":    "GoPro",
        "dji":      "DJI",
        "fujifilm": "Fuji",
        "panasonic":"Panasonic",
        "olympus":  "Olympus",
        "blackmagic":"BMPCC",
        "red":      "RED",
        "arri":     "ARRI",
        "insta360": "Insta360",
        "xiaomi":   "Xiaomi",
        "huawei":   "Huawei",
        "google":   "Google",
    }
    nome_lower = nome.lower()
    for chave, abrev in abreviacoes.items():
        if chave in nome_lower:
            return abrev
    # Retorna primeiras 12 chars sem espaços se não reconhecido
    return nome[:12].replace(" ", "")


# =========================
# ⏱️ EXTRAIR DURAÇÃO DO VÍDEO
# =========================
def extrair_duracao(path, ffprobe_bin=None):
    """Retorna duração em segundos ou 0 se não conseguir."""
    if not ffprobe_bin:
        return 0
    try:
        cmd = [ffprobe_bin, "-v", "quiet", "-print_format", "json",
               "-show_format", path]
        resultado = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if resultado.returncode == 0:
            data = json.loads(resultado.stdout)
            dur  = data.get("format", {}).get("duration")
            if dur:
                return float(dur)
    except Exception:
        pass
    return 0


# =========================
# 🔁 DETECTAR DUPLICATAS
# =========================
def detectar_duplicatas(arquivos_info):
    """
    Detecta duplicatas de vídeo por: tamanho + duração arredondada + nome base.
    Retorna set de paths que são duplicatas (mantém o primeiro de cada grupo).
    """
    grupos = {}
    duplicatas = set()

    for info in arquivos_info:
        if info["tipo"] != "video":
            continue

        tamanho  = info["tamanho"]
        duracao  = round(info.get("duracao", 0))
        nome_b   = re.sub(r'[-_\s]\d+$', '', os.path.splitext(
                          os.path.basename(info["path"]))[0].lower())

        chave = (tamanho, duracao)

        if chave in grupos:
            duplicatas.add(info["path"])
        else:
            grupos[chave] = info["path"]

    # Também detecta pelo nome base + tamanho similar (±5%)
    by_nome = {}
    for info in arquivos_info:
        if info["tipo"] != "video" or info["path"] in duplicatas:
            continue
        nome_b = re.sub(r'[-_\s]\d+$', '',
                        os.path.splitext(os.path.basename(info["path"]))[0].lower())
        if nome_b in by_nome:
            tam_a = by_nome[nome_b]["tamanho"]
            tam_b = info["tamanho"]
            if tam_a > 0 and abs(tam_a - tam_b) / tam_a < 0.05:
                duplicatas.add(info["path"])
        else:
            by_nome[nome_b] = info

    return duplicatas


# =========================
# 🗂️ NOME SEGURO SEM COLISÃO
# =========================
def nome_seguro(pasta, nome):
    base, ext = os.path.splitext(nome)
    dest = os.path.join(pasta, nome)
    n = 1
    while os.path.exists(dest):
        dest = os.path.join(pasta, f"{base}_{n}{ext}")
        n += 1
    return dest


# =========================
# 🚀 FUNÇÃO PRINCIPAL
# =========================
def _detectar_profissional(path, pasta_raiz):
    """
    Verifica se alguma subpasta entre o arquivo e a raiz
    parece ser nome de profissional (ex: MAYCOM, FERNANDO, FEIJAO).
    Retorna o nome em uppercase ou None.
    """
    try:
        rel = os.path.relpath(path, pasta_raiz)
        partes = rel.replace("\\", "/").split("/")
        # Ignora o nome do arquivo (última parte)
        # e verifica as pastas intermediárias
        for parte in partes[:-1]:
            parte_clean = parte.strip()
            # Considera nome de profissional se:
            # - entre 2 e 20 caracteres
            # - não parece data (não tem números de 4 dígitos)
            # - não é uma extensão conhecida
            # - tem pelo menos uma letra
            if (2 <= len(parte_clean) <= 20
                    and not re.search(r'[0-9]{4}', parte_clean)
                    and re.search(r'[a-zA-Z]', parte_clean)
                    and parte_clean.upper() not in {
                        "BRUTOS", "BRUTO", "RAW", "FOOTAGE", "VIDEOS",
                        "FOTOS", "PHOTOS", "AUDIO", "OUTROS", "BACKUP",
                        "EXPORTS", "IMPORT", "LOG", "CARD", "SD", "SSD",
                        "CAMERA", "CAM", "DRONE", "GOPRO"
                    }):
                return parte_clean.upper()
    except Exception:
        pass
    return None


def organizar_videos(pasta, nome_projeto=None, callback_progresso=None, callback_log=None):
    """
    Organiza todos os arquivos de mídia de uma pasta recursivamente.
    nome_projeto: nome para a pasta raiz de saída (ex: "Casamento_Joao_Maria")
    """
    nome_pasta   = nome_projeto if nome_projeto else "organizado"
    # Remove caracteres inválidos do nome da pasta
    nome_pasta   = re.sub(r'[\\/:*?"<>|]', '_', nome_pasta).strip()
    pasta_org    = os.path.join(pasta, nome_pasta)
    pasta_dup    = os.path.join(pasta_org, "duplicatas")
    pasta_outros = os.path.join(pasta_org, "outros")

    os.makedirs(pasta_org,    exist_ok=True)
    os.makedirs(pasta_dup,    exist_ok=True)
    os.makedirs(pasta_outros, exist_ok=True)

    ffprobe_bin, usa_ffmpeg = _get_ffprobe()

    if callback_log:
        if ffprobe_bin:
            callback_log(f"✅ ffprobe/ffmpeg encontrado: {os.path.basename(ffprobe_bin)}")
        else:
            callback_log("⚠️  ffprobe não encontrado — metadados de vídeo limitados")

    # --- Coleta todos os arquivos (ignora pasta organizado) ---
    IGNORAR = {"organizado"}
    arquivos_raw = []

    for root, dirs, files in os.walk(pasta):
        dirs[:] = [d for d in dirs if d not in IGNORAR]
        for f in files:
            path = os.path.join(root, f)
            arquivos_raw.append(path)

    total = len(arquivos_raw)
    if callback_log:
        callback_log(f"📥 {total} arquivo(s) encontrado(s)")

    if total == 0:
        if callback_progresso:
            callback_progresso(100, "Nenhum arquivo encontrado")
        return {"total": 0, "videos": 0, "fotos": 0, "audio": 0,
                "outros": 0, "duplicatas": 0, "movidos": 0}

    # --- Extrai metadados de todos ---
    if callback_log:
        callback_log("🔍 Lendo metadados...")

    arquivos_info = []
    for i, path in enumerate(arquivos_raw):
        ext  = os.path.splitext(path)[1].lower()
        tam  = os.path.getsize(path)

        if ext in EXTENSOES_VIDEO:
            tipo  = "video"
            dur   = extrair_duracao(path, ffprobe_bin)
        elif ext in EXTENSOES_FOTO:
            tipo  = "foto"
            dur   = 0
        elif ext in EXTENSOES_AUDIO:
            tipo  = "audio"
            dur   = extrair_duracao(path, ffprobe_bin)
        else:
            tipo  = "outro"
            dur   = 0

        data   = extrair_data(path, ffprobe_bin, usa_ffmpeg)
        camera = extrair_camera(path, ffprobe_bin) if tipo in ("video", "foto") else None

        # Detecta nome do profissional nas subpastas de origem
        # Ex: "...BRUTOS/MAYCOM/arquivo.mp4" → profissional = "MAYCOM"
        profissional = _detectar_profissional(path, pasta)

        arquivos_info.append({
            "path":        path,
            "tipo":        tipo,
            "data":        data,
            "tamanho":     tam,
            "duracao":     dur,
            "ext":         ext,
            "camera":      camera,
            "profissional": profissional,
        })

        if callback_progresso and total > 0:
            callback_progresso(int((i + 1) / total * 30), f"Lendo metadados... {i+1}/{total}")

    # --- Detecta duplicatas ---
    if callback_log:
        callback_log("🔁 Detectando duplicatas...")

    duplicatas_paths = detectar_duplicatas(arquivos_info)
    if callback_log and duplicatas_paths:
        callback_log(f"   {len(duplicatas_paths)} duplicata(s) detectada(s)")

    # --- Ordena por data de criação ---
    nao_duplicatas = [a for a in arquivos_info if a["path"] not in duplicatas_paths]
    nao_duplicatas.sort(key=lambda x: x["data"])

    # --- Mapeia dias únicos → número do dia de gravação ---
    # Ex: dia 02/07, 05/07, 08/07 → DIA-01, DIA-02, DIA-03
    dias_unicos = sorted({a["data"].date() for a in nao_duplicatas
                          if a["tipo"] in ("video", "foto", "audio")})
    mapa_dia = {dia: i+1 for i, dia in enumerate(dias_unicos)}

    # --- Gera sequência numérica por tipo por pasta ---
    contadores_seq = {}  # (pasta_nome, tipo) → contador

    # --- Monta mapa completo ANTES de mover (para BACKUP) ---
    # Primeiro pass: calcula todos os destinos sem mover nada
    mapa_backup  = []
    mapa_movidos = []  # lista completa para NEXTUP

    for info in nao_duplicatas:
        data         = info["data"]
        tipo         = info["tipo"]
        ext          = info["ext"]
        nome_ori     = os.path.basename(info["path"])
        base_ori     = os.path.splitext(nome_ori)[0]
        MESES_PT_MAP = {1:"JAN",2:"FEV",3:"MAR",4:"ABR",5:"MAI",6:"JUN",
                        7:"JUL",8:"AGO",9:"SET",10:"OUT",11:"NOV",12:"DEZ"}
        mes_m        = MESES_PT_MAP[data.month]
        data_fmt_m   = f"{data.day:02d}-{mes_m}-{data.year}"
        camera_m     = info.get("camera")
        prof_m       = info.get("profissional")
        num_dia_m    = mapa_dia.get(data.date(), 1)
        pasta_dia_m  = f"DIA-{num_dia_m:02d}_{data_fmt_m}"
        partes_m     = []
        if prof_m:  partes_m.append(prof_m)
        if camera_m: partes_m.append(camera_m)
        partes_m.append(data_fmt_m)
        pasta_sub_m  = "_".join(partes_m)
        chave_m      = f"{pasta_dia_m}/{pasta_sub_m}"
        seq_m        = contadores_seq.get((chave_m, tipo), 0) + 1
        hora_str_m   = data.strftime("%Hh%Mm%Ss")
        novo_nome_m  = f"{seq_m:03d}_{camera_m}_{hora_str_m}_{base_ori}{ext}" if camera_m                        else f"{seq_m:03d}_{hora_str_m}_{base_ori}{ext}"

        if tipo != "outro":
            dest_dir = os.path.join(pasta_org, pasta_dia_m, pasta_sub_m, tipo + "s")
            dest_m   = os.path.join(dest_dir, novo_nome_m)
        else:
            dest_m   = os.path.join(pasta_outros, nome_ori)

        mapa_backup.append({
            "path":             info["path"],
            "destino_planejado": dest_m,
            "tamanho":          info["tamanho"],
            "tipo":             tipo,
        })
        mapa_movidos.append({
            **info,
            "path_original":  info["path"],
            "destino_final":  dest_m,
            "pasta_org":      pasta_org,
        })

    # Salva BACKUP antes de mover qualquer coisa
    if callback_log:
        callback_log("💾 Salvando BACKUP...")
    gerar_backup(pasta, mapa_backup, pasta_org, callback_log=callback_log)

    # --- Move arquivos ---
    if callback_log:
        callback_log("📦 Organizando arquivos...")

    movidos    = 0
    ct_video   = 0
    ct_foto    = 0
    ct_audio   = 0
    ct_outros  = 0
    ct_dup     = 0

    total_mover = len(arquivos_info)

    # Move duplicatas primeiro
    for i, info in enumerate(arquivos_info):
        if info["path"] not in duplicatas_paths:
            continue

        dest = nome_seguro(pasta_dup, os.path.basename(info["path"]))
        try:
            shutil.move(info["path"], dest)
            ct_dup += 1
            movidos += 1
            if callback_log:
                callback_log(f"   🔁 Duplicata: {os.path.basename(info['path'])}")
        except Exception as e:
            if callback_log:
                callback_log(f"   ⚠️  Erro ao mover {os.path.basename(info['path'])}: {e}")

    # Move arquivos organizados
    for i, info in enumerate(nao_duplicatas):
        data     = info["data"]
        tipo     = info["tipo"]
        ext      = info["ext"]
        nome_ori = os.path.basename(info["path"])
        base_ori = os.path.splitext(nome_ori)[0]

        MESES_PT = {
            1:"JAN",2:"FEV",3:"MAR",4:"ABR",5:"MAI",6:"JUN",
            7:"JUL",8:"AGO",9:"SET",10:"OUT",11:"NOV",12:"DEZ"
        }
        mes_abrev    = MESES_PT[data.month]
        data_str     = data.strftime("%Y-%m-%d")
        camera       = info.get("camera")
        profissional = info.get("profissional")
        num_dia      = mapa_dia.get(data.date(), 1)

        # Estrutura:
        # DIA-01_22-NOV-2025/
        #   MAYCOM_Sony_22-NOV-2025/videos/
        #   FERNANDO_iPhone_22-NOV-2025/fotos/
        data_fmt   = f"{data.day:02d}-{mes_abrev}-{data.year}"
        pasta_dia  = f"DIA-{num_dia:02d}_{data_fmt}"

        # Subpasta do profissional/câmera dentro do dia
        partes_sub = []
        if profissional:
            partes_sub.append(profissional)
        if camera:
            partes_sub.append(camera)
        partes_sub.append(data_fmt)
        pasta_sub  = "_".join(partes_sub)

        # Chave para agrupamento de sequência
        pasta_nome = f"{pasta_dia}/{pasta_sub}"

        if tipo == "outro":
            pasta_dest = pasta_outros
            ct_outros += 1
        else:
            pasta_dest = os.path.join(pasta_org, pasta_dia, pasta_sub, tipo + "s")
            os.makedirs(pasta_dest, exist_ok=True)

        # Sequência por (pasta_nome, tipo)
        chave_seq = (pasta_nome, tipo)
        contadores_seq[chave_seq] = contadores_seq.get(chave_seq, 0) + 1
        seq = contadores_seq[chave_seq]

        # Novo nome: 001_Sony_14h00m32s_original.mp4
        hora_str  = data.strftime("%Hh%Mm%Ss")
        camera    = info.get("camera")
        if camera:
            novo_nome = f"{seq:03d}_{camera}_{hora_str}_{base_ori}{ext}"
        else:
            novo_nome = f"{seq:03d}_{hora_str}_{base_ori}{ext}"
        dest      = nome_seguro(pasta_dest, novo_nome)

        try:
            shutil.move(info["path"], dest)
            movidos += 1

            if tipo == "video":   ct_video += 1
            elif tipo == "foto":  ct_foto  += 1
            elif tipo == "audio": ct_audio += 1

            if callback_log:
                callback_log(f"   ✅ {novo_nome}")

        except Exception as e:
            if callback_log:
                callback_log(f"   ⚠️  Erro: {os.path.basename(info['path'])}: {e}")

        if callback_progresso:
            callback_progresso(
                30 + int((i + 1) / len(nao_duplicatas) * 60),
                f"Movendo... {i+1}/{len(nao_duplicatas)}"
            )

    # --- Gera NEXTUP ---
    if callback_log:
        callback_log("📤 Gerando NEXTUP...")
    gerar_nextup(pasta, mapa_movidos, nome_pasta, callback_log=callback_log)

    # --- Gera relatório ---
    if callback_log:
        callback_log("📄 Gerando relatório...")

    # Duração total: vídeos pela duração real, fotos contam 1s cada
    duracao_total = sum(
        a["duracao"] if a["tipo"] in ("video", "audio") else 1.0
        for a in arquivos_info
        if a["tipo"] in ("video", "audio", "foto")
    )
    h  = int(duracao_total // 3600)
    m  = int((duracao_total % 3600) // 60)
    s  = int(duracao_total % 60)

    linhas_rel = [
        "RELATÓRIO DE ORGANIZAÇÃO — Canivete do Pailer",
        f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        f"Pasta: {pasta}",
        "=" * 60,
        "",
        f"  Total de arquivos : {total}",
        f"  🎬 Vídeos         : {ct_video}",
        f"  📷 Fotos          : {ct_foto}",
        f"  🎵 Áudios         : {ct_audio}",
        f"  📁 Outros         : {ct_outros}",
        f"  🔁 Duplicatas     : {ct_dup}",
        f"  ⏱️  Duração total  : {h}h {m}m {s}s",
        "",
        "=" * 60,
        "ARQUIVOS POR DIA:",
        "",
    ]

    MESES_PT_REL = {
        1:"JAN",2:"FEV",3:"MAR",4:"ABR",5:"MAI",6:"JUN",
        7:"JUL",8:"AGO",9:"SET",10:"OUT",11:"NOV",12:"DEZ"
    }
    dias = {}
    for info in nao_duplicatas:
        cam = info.get("camera")
        mes = MESES_PT_REL[info["data"].month]
        chave_dia = f"{cam}_{info['data'].day:02d}-{mes}-{info['data'].year}" if cam                     else f"{info['data'].day:02d}-{mes}-{info['data'].year}"
        if chave_dia not in dias:
            dias[chave_dia] = {"video": 0, "foto": 0, "audio": 0, "outro": 0,
                               "dur_video": 0.0, "_data": info["data"]}
        dias[chave_dia][info["tipo"]] = dias[chave_dia].get(info["tipo"], 0) + 1
        if info["tipo"] == "video":
            dias[chave_dia]["dur_video"] += info.get("duracao", 0)

    # Ordena por data real
    for pasta_d, cts in sorted(dias.items(), key=lambda x: x[1]["_data"]):
        dv = cts["dur_video"]
        hv, mv, sv = int(dv//3600), int((dv%3600)//60), int(dv%60)
        dur_str = f" ({hv}h{mv:02d}m{sv:02d}s de vídeo)" if dv > 0 else ""
        linhas_rel.append(f"  {pasta_d}: {cts['video']} vídeos, {cts['foto']} fotos, "
                          f"{cts['audio']} áudios, {cts['outro']} outros{dur_str}")

    relatorio_path = os.path.join(pasta_org, "relatorio.txt")
    with open(relatorio_path, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas_rel))

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    if callback_log:
        callback_log(f"\n📄 Relatório salvo em: {relatorio_path}")

    return {
        "total":      total,
        "videos":     ct_video,
        "fotos":      ct_foto,
        "audio":      ct_audio,
        "outros":     ct_outros,
        "duplicatas": ct_dup,
        "movidos":    movidos,
        "relatorio":  relatorio_path,
        "pasta_org":  pasta_org,
    }


# =========================
# 🖥️ CLI
# =========================
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python organizador_de_videos.py <pasta>")
        sys.exit(1)

    r = organizar_videos(sys.argv[1], callback_log=print)

    print("\n🔥 FINALIZADO")
    print(f"  Total     : {r['total']}")
    print(f"  Vídeos    : {r['videos']}")
    print(f"  Fotos     : {r['fotos']}")
    print(f"  Áudios    : {r['audio']}")
    print(f"  Outros    : {r['outros']}")
    print(f"  Duplicatas: {r['duplicatas']}")
