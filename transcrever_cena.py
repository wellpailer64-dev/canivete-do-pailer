"""
transcrever_cena.py
===================
Analisa frames de vídeos usando CLIP (OpenAI) para detectar
automaticamente o tipo de cena e renomear os arquivos.

Funciona 100% offline após o primeiro download do modelo (~350MB).

Exemplos de resultado:
  001_Sony_14h00m45s_VID001.mp4
  → 001_Sony_14h00m45s_Danca-Festa_VID001.mp4

Categorias detectadas (audiovisual):
  Entrevista, Danca-Festa, Cerimonia, Natureza-Paisagem,
  Pessoas-Reunidas, Performance-Palco, Esporte-Acao,
  Bastidores, Rua-Urbano, Comida-Gastronomia, e mais.

Dependências:
  pip install torch torchvision transformers pillow
"""

import os
import sys
import subprocess
import tempfile
import numpy as np
from PIL import Image

# =========================
# 🎬 CATEGORIAS DE CENA
# Descrições em inglês para o CLIP
# (modelo foi treinado em inglês)
# =========================
CATEGORIAS = {
    # ── Pessoas e interações ──
    "Entrevista":           "a person being interviewed, talking directly to camera, microphone visible",
    "Depoimento":           "emotional personal testimony, person speaking candidly, close up face",
    "Conversa-Informal":    "casual conversation between two or more people, candid chat",
    "Discurso-Apresentacao":"person giving a speech or presentation on stage or podium",
    "Retrato-Pessoa":       "portrait of a single person, close up face, individual character",

    # ── Celebrações e eventos ──
    "Danca-Festa":          "people dancing at a party, nightclub or celebration event",
    "Cerimonia-Casamento":  "wedding ceremony, bride and groom, formal celebration",
    "Festa-Aniversario":    "birthday party, cake, balloons, people celebrating",
    "Formatura-Graduacao":  "graduation ceremony, cap and gown, diploma, academic celebration",
    "Evento-Corporativo":   "corporate event, business meeting, conference room, professionals",

    # ── Artes e performance ──
    "Show-Concerto":        "live music concert, band performing on stage, crowd cheering",
    "Teatro-Performance":   "theater performance, stage acting, dramatic scene",
    "Danca-Artististica":   "artistic dance performance, ballet, contemporary dance",
    "Arte-Exposicao":       "art exhibition, gallery, paintings, sculptures",

    # ── Natureza e exterior ──
    "Natureza-Floresta":    "forest, trees, jungle, nature greenery close up",
    "Praia-Mar":            "beach scene, ocean waves, sand, coastal landscape",
    "Montanha-Campo":       "mountain landscape, countryside, open fields, rural scenery",
    "Drone-Aerea":          "aerial drone shot, bird eye view from high altitude",
    "Por-do-Sol-Amanhecer": "sunset or sunrise, golden hour, colorful sky horizon",

    # ── Esporte e ação ──
    "Esporte-Acao":         "sports in action, athletic performance, physical competition",
    "Aventura-Adrenalina":  "extreme sports, adventure activity, adrenaline, outdoor challenge",

    # ── Gastronomia e lifestyle ──
    "Comida-Gastronomia":   "food close up, plated dish, restaurant, cooking preparation",
    "Lifestyle-Cotidiano":  "everyday life, daily routine, lifestyle moment, candid living",

    # ── Ambiente e locação ──
    "Rua-Urbano":           "urban street scene, city environment, buildings, traffic",
    "Interior-Arquitetura": "indoor architectural space, building interior, design, decor",
    "Noite-Cidade":         "night city scene, neon lights, urban nightlife, dark atmosphere",
    "Predio-Fachada":       "building exterior, facade, architecture outside view",

    # ── Produção e técnico ──
    "Bastidores-Making":    "behind the scenes, film crew working, production setup, backstage",
    "Produto-Publicidade":  "product advertising shot, commercial, object detail, brand",
    "Familia-Criancas":     "family moment together, children playing, kids interaction",
}


# =========================
# 🔍 LOCALIZA FFMPEG
# =========================
def _get_ffmpeg():
    if hasattr(sys, "_MEIPASS"):
        base = sys._MEIPASS
        exe  = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
        exe  = base

    for pasta in [base, exe]:
        path = os.path.join(pasta, "ffmpeg.exe")
        if os.path.exists(path):
            return path
    return "ffmpeg"


# =========================
# 🖼️ EXTRAI FRAMES DO VÍDEO
# =========================
def extrair_frames(path_video, n_frames=5, ffmpeg_bin=None):
    """
    Extrai N frames distribuídos ao longo do vídeo.
    Retorna lista de imagens PIL.
    """
    if not ffmpeg_bin:
        ffmpeg_bin = _get_ffmpeg()

    frames = []
    tmp_dir = tempfile.mkdtemp()

    try:
        # Descobre duração
        cmd_dur = [ffmpeg_bin, "-v", "quiet", "-i", path_video,
                   "-show_entries", "format=duration",
                   "-of", "csv=p=0"]
        try:
            # Tenta ffprobe primeiro
            ffprobe = ffmpeg_bin.replace("ffmpeg", "ffprobe")
            if os.path.exists(ffprobe):
                r = subprocess.run([ffprobe, "-v", "quiet", "-print_format",
                                    "json", "-show_format", path_video],
                                   capture_output=True, text=True, timeout=15)
                import json
                data = json.loads(r.stdout)
                duracao = float(data["format"].get("duration", 10))
            else:
                duracao = 10.0
        except Exception:
            duracao = 10.0

        # Extrai frames em posições distribuídas (evita início e fim)
        posicoes = [duracao * (i + 1) / (n_frames + 1) for i in range(n_frames)]

        for idx, pos in enumerate(posicoes):
            out_path = os.path.join(tmp_dir, f"frame_{idx:03d}.jpg")
            cmd = [
                ffmpeg_bin, "-y", "-ss", str(pos),
                "-i", path_video,
                "-vframes", "1",
                "-q:v", "2",
                out_path
            ]
            subprocess.run(cmd, capture_output=True, timeout=30)
            if os.path.exists(out_path):
                try:
                    img = Image.open(out_path).convert("RGB")
                    frames.append(img)
                except Exception:
                    pass

    except Exception:
        pass
    finally:
        # Limpa temporários
        for f in os.listdir(tmp_dir):
            try:
                os.remove(os.path.join(tmp_dir, f))
            except Exception:
                pass
        try:
            os.rmdir(tmp_dir)
        except Exception:
            pass

    return frames


# =========================
# 🧠 CARREGA MODELO CLIP
# =========================
_clip_model   = None
_clip_processor = None

def _carregar_clip(callback_log=None):
    global _clip_model, _clip_processor

    if _clip_model is not None:
        return True

    try:
        if callback_log:
            callback_log("🧠 Carregando modelo CLIP...")
            callback_log("   (Download ~350MB na 1ª vez — aguarde)")

        from transformers import CLIPProcessor, CLIPModel
        import torch

        # Redireciona stdout para não quebrar no .exe
        import io as _io
        _out, _err = sys.stdout, sys.stderr
        sys.stdout = sys.stderr = _io.StringIO()
        try:
            _clip_model     = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
            _clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
            _clip_model.eval()
        finally:
            sys.stdout = _out
            sys.stderr = _err

        if callback_log:
            callback_log("✅ Modelo CLIP carregado!")
        return True

    except ImportError:
        if callback_log:
            callback_log("❌ transformers não instalado.")
            callback_log("   Rode: pip install transformers torch torchvision")
        return False
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao carregar CLIP: {e}")
        return False


# =========================
# 🔍 DETECTA CENA
# =========================
def detectar_cena(frames, callback_log=None):
    """
    Analisa frames com CLIP e retorna a categoria mais provável.
    Retorna string como "Danca-Festa" ou None se falhar.
    """
    if not frames:
        return None

    if not _carregar_clip(callback_log=callback_log):
        return None

    try:
        import torch

        textos   = list(CATEGORIAS.values())
        categorias_keys = list(CATEGORIAS.keys())

        scores_total = np.zeros(len(textos))

        for frame in frames:
            inputs = _clip_processor(
                text=textos,
                images=frame,
                return_tensors="pt",
                padding=True,
                truncation=True
            )

            with torch.no_grad():
                outputs = _clip_model(**inputs)
                logits  = outputs.logits_per_image[0]
                probs   = logits.softmax(dim=0).numpy()
                scores_total += probs

        # Média dos scores de todos os frames
        scores_medio = scores_total / len(frames)
        melhor_idx   = int(np.argmax(scores_medio))
        melhor_score = float(scores_medio[melhor_idx])

        # Só retorna se confiança >= 15% (evita nome errado com baixa confiança)
        if melhor_score >= 0.15:
            return categorias_keys[melhor_idx]

        return None

    except Exception as e:
        if callback_log:
            callback_log(f"   ⚠️  Erro na detecção: {e}")
        return None


# =========================
# 🎬 ANALISAR UM VÍDEO
# =========================
def analisar_video(path, callback_log=None):
    """
    Extrai frames e detecta a cena de um vídeo.
    Retorna string da categoria ou None.
    """
    ext = os.path.splitext(path)[1].lower()
    extensoes_video = {
        ".mp4", ".mov", ".avi", ".mkv", ".mts", ".m2ts",
        ".mxf", ".wmv", ".flv", ".webm", ".m4v"
    }
    if ext not in extensoes_video:
        return None

    ffmpeg_bin = _get_ffmpeg()
    frames     = extrair_frames(path, n_frames=5, ffmpeg_bin=ffmpeg_bin)

    if not frames:
        if callback_log:
            callback_log(f"   ⚠️  Não foi possível extrair frames de {os.path.basename(path)}")
        return None

    return detectar_cena(frames, callback_log=callback_log)


# =========================
# 📁 ANALISAR PASTA
# =========================
def analisar_e_renomear_pasta(pasta, callback_progresso=None, callback_log=None):
    """
    Analisa todos os vídeos de uma pasta (incluindo subpastas)
    e renomeia com a cena detectada.

    Exemplo:
      001_Sony_14h00m45s_VID001.mp4
      → 001_Sony_14h00m45s_Danca-Festa_VID001.mp4
    """
    extensoes_video = {
        ".mp4", ".mov", ".avi", ".mkv", ".mts", ".m2ts",
        ".mxf", ".wmv", ".flv", ".webm", ".m4v"
    }

    arquivos = []
    for root, dirs, files in os.walk(pasta):
        # Ignora pasta duplicatas e outros
        dirs[:] = [d for d in dirs if d not in {"duplicatas", "outros"}]
        for f in files:
            if os.path.splitext(f)[1].lower() in extensoes_video:
                arquivos.append(os.path.join(root, f))

    total       = len(arquivos)
    renomeados  = 0
    sem_cena    = 0

    if callback_log:
        callback_log(f"📥 {total} vídeo(s) encontrado(s) para analisar")

    if total == 0:
        if callback_progresso:
            callback_progresso(100, "Nenhum vídeo encontrado")
        return {"total": 0, "renomeados": 0, "sem_cena": 0}

    # Carrega modelo uma vez
    if not _carregar_clip(callback_log=callback_log):
        return {"total": total, "renomeados": 0, "sem_cena": total}

    for i, path in enumerate(arquivos):
        nome     = os.path.basename(path)
        base     = os.path.splitext(nome)[0]
        ext      = os.path.splitext(nome)[1]
        pasta_f  = os.path.dirname(path)

        if callback_log:
            callback_log(f"\n🎬 Analisando ({i+1}/{total}): {nome}")
        if callback_progresso:
            callback_progresso(
                int((i / total) * 95),
                f"Analisando {i+1}/{total}: {nome[:35]}..."
            )

        # Pula se já tem cena no nome (evita reanalisar)
        if any(cat in base for cat in CATEGORIAS.keys()):
            if callback_log:
                callback_log(f"   ⏭️  Já tem cena no nome, pulando")
            continue

        cena = analisar_video(path, callback_log=callback_log)

        if cena:
            # Insere cena após o último segmento de hora (padrão 001_Sony_14h00m45s_)
            # Se não tiver o padrão, adiciona antes do nome original
            import re
            match = re.match(r'^(\d{3}_(?:[^_]+_)?(?:\d{2}h\d{2}m\d{2}s_))', base)
            if match:
                prefixo   = match.group(1)
                resto     = base[len(prefixo):]
                novo_nome = f"{prefixo}{cena}_{resto}{ext}"
            else:
                novo_nome = f"{base}_{cena}{ext}"

            novo_path = os.path.join(pasta_f, novo_nome)

            # Evita colisão
            n = 1
            while os.path.exists(novo_path):
                novo_path = os.path.join(pasta_f,
                    f"{os.path.splitext(novo_nome)[0]}_{n}{ext}")
                n += 1

            try:
                os.rename(path, novo_path)
                renomeados += 1
                if callback_log:
                    callback_log(f"   ✅ {nome}")
                    callback_log(f"   → {os.path.basename(novo_path)}")
            except Exception as e:
                if callback_log:
                    callback_log(f"   ❌ Erro ao renomear: {e}")
        else:
            sem_cena += 1
            if callback_log:
                callback_log(f"   ⚠️  Cena não identificada com confiança")

    if callback_progresso:
        callback_progresso(100, "Finalizado")

    return {
        "total":      total,
        "renomeados": renomeados,
        "sem_cena":   sem_cena,
    }


# =========================
# 🖥️ CLI
# =========================
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python transcrever_cena.py <pasta_ou_video>")
        sys.exit(1)

    alvo = sys.argv[1]
    if os.path.isdir(alvo):
        r = analisar_e_renomear_pasta(alvo, callback_log=print)
    elif os.path.isfile(alvo):
        cena = analisar_video(alvo, callback_log=print)
        print(f"\nCena detectada: {cena or 'não identificada'}")
        r = {"total": 1, "renomeados": 1 if cena else 0, "sem_cena": 0 if cena else 1}
    else:
        print("Caminho inválido.")
        sys.exit(1)

    print(f"\n🔥 FINALIZADO")
    print(f"  Total     : {r['total']}")
    print(f"  Renomeados: {r['renomeados']}")
    print(f"  Sem cena  : {r['sem_cena']}")
