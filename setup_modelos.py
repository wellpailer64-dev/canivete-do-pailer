"""
setup_modelos.py
================
Verifica e baixa todos os modelos necessários na primeira execução.
Todos os modelos são salvos em modelos_ia ao lado do .exe.
"""

import os
import sys
import urllib.request
import threading
import subprocess
import io


# =========================
# 📁 PASTA BASE DOS MODELOS
# =========================
def get_base_dir():
    if hasattr(sys, "_MEIPASS"):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def get_modelos_dir():
    path = os.path.join(get_base_dir(), "modelos_ia")
    os.makedirs(path, exist_ok=True)
    return path

def configurar_caminhos():
    modelos_dir = get_modelos_dir()
    whisper_dir = os.path.join(modelos_dir, "whisper")
    rembg_dir   = os.path.join(modelos_dir, "u2net")
    os.makedirs(whisper_dir, exist_ok=True)
    os.makedirs(rembg_dir,   exist_ok=True)
    os.environ["XDG_CACHE_HOME"] = get_base_dir()
    os.environ["WHISPER_CACHE"]  = whisper_dir
    os.environ["U2NET_HOME"]     = rembg_dir
    return modelos_dir, whisper_dir, rembg_dir

_modelos_dir, _whisper_dir, _rembg_dir = configurar_caminhos()


# =========================
# 📦 DEFINIÇÃO DOS MODELOS
# =========================
def get_modelos():
    return [
        {
            "nome":      "Whisper Small",
            "descricao": "Transcrição de áudio — rápido",
            "tamanho":   "~150MB",
            "tamanho_mb": 150,
            "check":     checar_whisper_small,
            "instalar":  instalar_whisper_small,
        },
        {
            "nome":      "Whisper Medium",
            "descricao": "Transcrição de áudio — preciso",
            "tamanho":   "~500MB",
            "tamanho_mb": 500,
            "check":     checar_whisper_medium,
            "instalar":  instalar_whisper_medium,
        },
        {
            "nome":      "rembg u2net",
            "descricao": "Remoção de fundo com IA",
            "tamanho":   "~170MB",
            "tamanho_mb": 170,
            "check":     checar_rembg,
            "instalar":  instalar_rembg,
        },
        {
            "nome":      "CLIP (Detecção de Cenas)",
            "descricao": "Identifica cenas em vídeos — Logger Brabo",
            "tamanho":   "~350MB",
            "tamanho_mb": 350,
            "check":     checar_clip,
            "instalar":  instalar_clip,
        },
        {
            "nome":      "rclone (GDrive Dumper)",
            "descricao": "Download direto do Google Drive",
            "tamanho":   "~27MB",
            "tamanho_mb": 27,
            "check":     checar_rclone,
            "instalar":  instalar_rclone,
        },
        {
            "nome":      "Google Drive — Login",
            "descricao": "Autorização para o GDrive Dumper acessar seu Drive",
            "tamanho":   "login",
            "tamanho_mb": 0,
            "check":     checar_gdrive_configurado,
            "instalar":  configurar_gdrive,
        },
    ]


# =========================
# 🔍 CHECKERS
# =========================
def checar_whisper_small():
    return os.path.exists(os.path.join(_whisper_dir, "small.pt"))

def checar_whisper_medium():
    return os.path.exists(os.path.join(_whisper_dir, "medium.pt"))

def checar_rembg():
    return os.path.exists(os.path.join(_rembg_dir, "u2net.onnx"))

def _get_clip_dir():
    """Retorna o diretório onde o modelo CLIP deve ser salvo."""
    base = get_base_dir()
    clip_dir = os.path.join(base, "modelos_ia", "clip")
    os.makedirs(clip_dir, exist_ok=True)
    return clip_dir

def checar_clip():
    """Verifica se o modelo CLIP já foi baixado na pasta do app."""
    try:
        clip_dir = _get_clip_dir()
        # Verifica se existe pelo menos um arquivo de modelo baixado
        for root, dirs, files in os.walk(clip_dir):
            for f in files:
                if f.endswith((".bin", ".safetensors", ".json")):
                    if "clip" in root.lower() or "clip" in f.lower() or "model" in f.lower():
                        return True
        # Fallback: verifica cache do HuggingFace também
        cache_hf = os.path.join(os.path.expanduser("~"),
                                ".cache", "huggingface", "hub")
        if os.path.exists(cache_hf):
            for item in os.listdir(cache_hf):
                if "clip-vit-base" in item.lower():
                    return True
        return False
    except Exception:
        return False


def instalar_clip(callback_log=None, callback_progresso=None):
    """Baixa o modelo CLIP via transformers — salva ao lado do .exe."""
    import io as _io

    if callback_log:
        callback_log("📥 Baixando modelo CLIP (clip-vit-base-patch32)...")
        callback_log("   Isso pode demorar alguns minutos (~350MB)...")

    clip_dir = _get_clip_dir()
    # Configura HuggingFace para salvar na pasta do app
    os.environ["HF_HOME"]            = clip_dir
    os.environ["HUGGINGFACE_HUB_CACHE"] = clip_dir
    os.environ["TRANSFORMERS_CACHE"] = clip_dir

    def _tentar():
        _out, _err = sys.stdout, sys.stderr
        sys.stdout = sys.stderr = _io.StringIO()
        try:
            from transformers import CLIPProcessor, CLIPModel
            CLIPModel.from_pretrained(
                "openai/clip-vit-base-patch32",
                cache_dir=clip_dir)
            CLIPProcessor.from_pretrained(
                "openai/clip-vit-base-patch32",
                cache_dir=clip_dir)
            return True, None
        except Exception as e:
            return False, str(e)
        finally:
            sys.stdout = _out
            sys.stderr = _err

    sucesso, erro = _tentar()
    if sucesso:
        if callback_log:
            callback_log("✅ CLIP instalado!")
        return True

    if callback_log:
        callback_log(f"\n⚠️  Falhou: {erro}")
        callback_log("🔍 Diagnosticando...")

    fixes = []
    if "transformers" in str(erro).lower(): fixes = ["transformers"]
    if "torch"        in str(erro).lower(): fixes += ["torch", "torchvision"]
    if not fixes: fixes = ["transformers", "torch", "torchvision"]

    if callback_log:
        callback_log(f"💡 Solução: reinstalar {', '.join(fixes)}")
    _pip_install(fixes, callback_log=callback_log)

    if callback_log:
        callback_log("🔄 Tentando novamente...")

    sucesso, erro = _tentar()
    if sucesso:
        if callback_log:
            callback_log("✅ CLIP instalado!")
        return True

    if callback_log:
        callback_log(f"❌ Não foi possível instalar CLIP: {erro}")
    return False



# =========================
# 🔍 CHECKER RCLONE
# =========================
def checar_rclone():
    """Verifica se rclone.exe está ao lado do executável ou no PATH."""
    # Ao lado do .exe
    if hasattr(sys, "_MEIPASS"):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))

    if os.path.exists(os.path.join(base, "rclone.exe")):
        return True

    # No PATH do sistema
    try:
        r = subprocess.run(["rclone", "version"], capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


def instalar_rclone(callback_log=None, callback_progresso=None):
    """Baixa rclone.exe para a pasta do executável via winget ou download direto."""
    if callback_log:
        callback_log("📥 Instalando rclone...")

    # Tenta winget primeiro (mais simples)
    try:
        if callback_log:
            callback_log("   Tentando instalar via winget...")
        r = subprocess.run(
            ["winget", "install", "Rclone.Rclone",
             "--silent", "--accept-package-agreements", "--accept-source-agreements"],
            capture_output=True, text=True, timeout=120
        )
        if r.returncode == 0 and checar_rclone():
            if callback_log:
                callback_log("✅ rclone instalado via winget!")
            return True
    except Exception:
        pass

    # Fallback: download direto do rclone.exe para a pasta do app
    if callback_log:
        callback_log("   winget falhou. Baixando rclone.exe diretamente...")

    if hasattr(sys, "_MEIPASS"):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))

    dest = os.path.join(base, "rclone.exe")
    url = "https://downloads.rclone.org/rclone-current-windows-amd64.zip"
    zip_dest = os.path.join(base, "_rclone_tmp.zip")

    ok = _fazer_download(url, zip_dest,
                         callback_log=callback_log,
                         callback_progresso=callback_progresso)
    if not ok:
        if callback_log:
            callback_log("❌ Falha no download do rclone.")
        return False

    # Extrai só o rclone.exe do zip
    try:
        import zipfile
        with zipfile.ZipFile(zip_dest, 'r') as z:
            for name in z.namelist():
                if name.endswith("rclone.exe"):
                    with z.open(name) as src, open(dest, "wb") as dst:
                        dst.write(src.read())
                    break
        os.remove(zip_dest)
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao extrair rclone: {e}")
        return False

    if checar_rclone():
        if callback_log:
            callback_log("✅ rclone.exe instalado na pasta do app!")
        return True

    if callback_log:
        callback_log("❌ Não foi possível instalar o rclone.")
    return False



# =========================
# 🔑 GOOGLE DRIVE — LOGIN
# =========================
def _rclone_cmd():
    """Retorna o caminho do rclone (ao lado do exe ou no PATH)."""
    base = os.path.dirname(sys.executable) if hasattr(sys, "_MEIPASS") else os.path.dirname(os.path.abspath(__file__))
    local = os.path.join(base, "rclone.exe")
    return local if os.path.exists(local) else "rclone"


def checar_gdrive_configurado():
    """Verifica se o remote gdrive já está autenticado no rclone."""
    try:
        r = subprocess.run(
            [_rclone_cmd(), "listremotes"],
            capture_output=True, text=True, timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        return "gdrive:" in r.stdout
    except Exception:
        return False


def configurar_gdrive(callback_log=None, callback_progresso=None):
    """
    Abre o navegador para o usuário autenticar o Google Drive no rclone.
    Exibe instruções claras sobre o motivo e o que vai acontecer.
    """
    if callback_log:
        callback_log("─" * 45)
        callback_log("☁️  POR QUE PRECISO FAZER LOGIN?")
        callback_log("─" * 45)
        callback_log("")
        callback_log("O Canivete do Pailer tem uma ferramenta")
        callback_log("chamada GDrive Dumper que permite baixar")
        callback_log("pastas inteiras do Google Drive direto")
        callback_log("para o seu computador — sem zip, sem erro,")
        callback_log("na velocidade máxima da sua internet.")
        callback_log("")
        callback_log("Para isso funcionar, o app precisa de")
        callback_log("permissão para acessar o seu Drive.")
        callback_log("O login é feito UMA ÚNICA VEZ pelo")
        callback_log("navegador — depois disso fica salvo.")
        callback_log("")
        callback_log("─" * 45)
        callback_log("🌐 Abrindo o navegador agora...")
        callback_log("   Faça login na sua conta Google e")
        callback_log("   clique em PERMITIR quando solicitado.")
        callback_log("   Depois volte aqui — o resto é automático!")
        callback_log("─" * 45)

    if callback_progresso:
        callback_progresso(-1, "Aguardando login no navegador...")

    try:
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        # rclone config create abre o browser e aguarda a autenticação
        r = subprocess.run(
            [_rclone_cmd(), "config", "create", "gdrive", "drive", "scope=drive"],
            timeout=300,
            creationflags=flags
        )

        if checar_gdrive_configurado():
            if callback_log:
                callback_log("")
                callback_log("✅ Google Drive conectado com sucesso!")
                callback_log("   O GDrive Dumper já está pronto para usar.")
            if callback_progresso:
                callback_progresso(100, "Google Drive conectado!")
            return True
        else:
            if callback_log:
                callback_log("")
                callback_log("⚠️  Login não detectado.")
                callback_log("   Se você cancelou, pode configurar")
                callback_log("   depois abrindo o GDrive Dumper no hub.")
            return False

    except subprocess.TimeoutExpired:
        if callback_log:
            callback_log("⏰ Tempo esgotado. Pode configurar depois")
            callback_log("   abrindo o GDrive Dumper no Canivete.")
        return False
    except Exception as e:
        if callback_log:
            callback_log(f"❌ Erro ao configurar: {e}")
        return False


def verificar_modelos():
    faltando = []
    for m in get_modelos():
        try:
            if not m["check"]():
                faltando.append(m)
        except Exception:
            faltando.append(m)
    return faltando

def tudo_instalado():
    """Considera instalado mesmo se só o login do Drive estiver faltando."""
    faltando = verificar_modelos()
    # Login do Drive é opcional — não bloqueia o app
    obrigatorios = [m for m in faltando if m.get("nome") != "Google Drive — Login"]
    return len(obrigatorios) == 0


# =========================
# 🔧 PIP AUTO-FIX
# =========================
def _pip_install(pacotes, callback_log=None):
    """Roda pip install silenciosamente e retorna True se sucesso."""
    try:
        if callback_log:
            callback_log(f"   🔧 Corrigindo: {', '.join(pacotes)}...")
        resultado = subprocess.run(
            [sys.executable, "-m", "pip", "install",
             "--force-reinstall", "--quiet"] + pacotes,
            capture_output=True, text=True, timeout=300
        )
        if resultado.returncode == 0:
            if callback_log:
                callback_log("   ✅ Correção aplicada!")
            return True
        else:
            stderr = resultado.stderr.strip()
            if callback_log and stderr:
                callback_log(f"   ⚠️  {stderr[-200:]}")
            return False
    except Exception as e:
        if callback_log:
            callback_log(f"   ❌ Erro na correção: {e}")
        return False


# =========================
# 📊 DOWNLOAD COM PROGRESSO
# =========================
def _fazer_download(url, destino, tamanho_esperado_mb=0,
                    callback_log=None, callback_progresso=None):
    """
    Baixa um arquivo mostrando progresso real em MB e %.
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as response:
            total = int(response.headers.get("Content-Length", 0))
            baixado = 0
            chunk  = 1024 * 64  # 64KB por vez

            with open(destino, "wb") as f:
                while True:
                    buffer = response.read(chunk)
                    if not buffer:
                        break
                    f.write(buffer)
                    baixado += len(buffer)

                    if total > 0:
                        pct    = int(baixado / total * 100)
                        mb_bx  = baixado / 1024 / 1024
                        mb_tot = total   / 1024 / 1024
                        if callback_progresso:
                            callback_progresso(
                                pct,
                                f"{mb_bx:.1f} MB / {mb_tot:.1f} MB ({pct}%)"
                            )
                    else:
                        mb_bx = baixado / 1024 / 1024
                        if callback_progresso:
                            callback_progresso(
                                -1,
                                f"{mb_bx:.1f} MB baixados..."
                            )
        return True
    except Exception as e:
        if callback_log:
            callback_log(f"   ❌ Erro no download: {e}")
        return False


# =========================
# 📥 INSTALADORES WHISPER
# =========================
def instalar_whisper_small(callback_log=None, callback_progresso=None):
    return _baixar_whisper("small", callback_log, callback_progresso)

def instalar_whisper_medium(callback_log=None, callback_progresso=None):
    return _baixar_whisper("medium", callback_log, callback_progresso)

def _baixar_whisper(modelo, callback_log=None, callback_progresso=None):

    if callback_log:
        callback_log(f"📥 Baixando Whisper {modelo}...")

    def _tentar():
        _out, _err = sys.stdout, sys.stderr
        sys.stdout = sys.stderr = io.StringIO()
        try:
            import whisper

            # Intercepta o download do whisper para mostrar progresso
            url_map = {
                "small":  "https://openaipublic.azureedge.net/main/whisper/models/"
                          "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794/small.pt",
                "medium": "https://openaipublic.azureedge.net/main/whisper/models/"
                          "345ae4da62f9b3d59415adc60127b97c714f32e89e936602e85993674d08dcb1/medium.pt",
            }
            dest = os.path.join(_whisper_dir, f"{modelo}.pt")

            if not os.path.exists(dest):
                url = url_map.get(modelo)
                if url:
                    sys.stdout, sys.stderr = _out, _err
                    if callback_log:
                        callback_log(f"   Conectando ao servidor...")
                    ok = _fazer_download(
                        url, dest,
                        callback_log=callback_log,
                        callback_progresso=callback_progresso
                    )
                    if not ok:
                        return False, "Falha no download direto"
                    sys.stdout = sys.stderr = io.StringIO()

            # Carrega o modelo do arquivo local
            whisper.load_model(modelo)
            return True, None
        except Exception as e:
            return False, str(e)
        finally:
            sys.stdout, sys.stderr = _out, _err

    # Tentativa 1
    sucesso, erro = _tentar()
    if sucesso:
        if callback_log:
            callback_log(f"✅ Whisper {modelo} pronto!")
        return True

    # Diagnóstico e auto-fix
    if callback_log:
        callback_log(f"\n⚠️  Falhou: {erro}")
        callback_log("🔍 Diagnosticando problema...")

    fixes = []
    if "tiktoken"  in erro: fixes += ["tiktoken"]
    if "numba"     in erro: fixes += ["numba", "llvmlite"]
    if not fixes:           fixes  = ["openai-whisper"]

    if callback_log:
        callback_log(f"💡 Solução: reinstalar {', '.join(fixes)}")

    _pip_install(fixes, callback_log=callback_log)

    if callback_log:
        callback_log("🔄 Tentando novamente...")

    sucesso, erro = _tentar()
    if sucesso:
        if callback_log:
            callback_log(f"✅ Whisper {modelo} pronto!")
        return True

    if callback_log:
        callback_log(f"❌ Não foi possível instalar Whisper {modelo}")
        callback_log(f"   Motivo: {erro}")
    return False


# =========================
# 📥 INSTALADOR REMBG
# =========================
def instalar_rembg(callback_log=None, callback_progresso=None):

    if callback_log:
        callback_log("📥 Baixando modelo rembg (u2net)...")

    def _tentar():
        dest = os.path.join(_rembg_dir, "u2net.onnx")

        # Passo 1: Download do modelo se não existir
        if not os.path.exists(dest):
            urls = [
                "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
                "https://huggingface.co/danielgatis/rembg/resolve/main/u2net.onnx",
            ]
            if callback_log:
                callback_log("   Conectando ao servidor...")

            baixou = False
            for url in urls:
                ok = _fazer_download(
                    url, dest,
                    callback_log=callback_log,
                    callback_progresso=callback_progresso
                )
                if ok:
                    baixou = True
                    break
                elif callback_log:
                    callback_log("   Tentando servidor alternativo...")

            if not baixou:
                return False, "Falha no download do modelo u2net"

        # Passo 2: Verifica se o arquivo é válido (mínimo 100MB)
        tamanho = os.path.getsize(dest)
        if tamanho < 100 * 1024 * 1024:
            os.remove(dest)
            return False, f"Arquivo corrompido ({tamanho/1024/1024:.1f}MB). Será baixado novamente."

        # Passo 3: Testa carregamento com stdout suprimido
        _out, _err = sys.stdout, sys.stderr
        sys.stdout = sys.stderr = io.StringIO()
        try:
            import onnxruntime as ort
            sess = ort.InferenceSession(dest, providers=["CPUExecutionProvider"])
            return True, None
        except Exception as e:
            return False, str(e)
        finally:
            sys.stdout, sys.stderr = _out, _err

    # Tentativa 1
    sucesso, erro = _tentar()
    if sucesso:
        if callback_log:
            callback_log("✅ rembg u2net pronto!")
        return True

    # Diagnóstico e auto-fix
    if callback_log:
        callback_log(f"\n⚠️  Falhou: {erro}")
        callback_log("🔍 Diagnosticando problema...")

    fixes = []
    if "pymatting"   in erro: fixes += ["pymatting", "numpy", "scipy"]
    if "onnxruntime" in erro: fixes += ["onnxruntime"]
    if not fixes:             fixes  = ["rembg", "onnxruntime", "pymatting"]

    if callback_log:
        callback_log(f"💡 Solução: reinstalar {', '.join(fixes)}")

    _pip_install(fixes, callback_log=callback_log)

    if callback_log:
        callback_log("🔄 Tentando novamente...")

    sucesso, erro = _tentar()
    if sucesso:
        if callback_log:
            callback_log("✅ rembg u2net pronto!")
        return True

    if callback_log:
        callback_log("❌ Não foi possível instalar rembg")
        callback_log(f"   Motivo: {erro}")
    return False
