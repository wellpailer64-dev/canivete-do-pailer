"""
first_run.py — Tela de primeiro uso do Canivete do Pailer
Verifica e instala modelos/executáveis necessários antes de abrir o app.
"""
import os
import sys
import shutil
import zipfile
import threading
import subprocess
import fnmatch
import tkinter as tk
from tkinter import ttk

# ── Diretório base ──────────────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.getcwd()

INSTALLED_MARKER = os.path.join(BASE_DIR, "models", ".installed")
MARKER_VERSION = "v3-isnet-deno"

# ── Lista de downloads ──────────────────────────────────────────────────────
DOWNLOADS = [
    {
        "label": "Instalando suporte a HEIC/HEIF (pillow-heif)",
        "type": "pip",
        "module": "pillow_heif",
        "package": "pillow-heif",
    },
    {
        "label": "Baixando modelo de transcrição (Whisper Small)",
        "type": "whisper",
        "model": "small",
    },
    {
        "label": "Baixando modelo de transcrição (Whisper Medium)",
        "type": "whisper",
        "model": "medium",
    },
    {
        "label": "Baixando modelo de imagem (CLIP)",
        "type": "huggingface",
        "repo": "openai/clip-vit-base-patch32",
        "dest": "modelos_ia/clip",
    },
    {
        "label": "Baixando modelo de remoção de fundo (U2Net)",
        "type": "url",
        "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
        "dest": "modelos_ia/u2net/u2net.onnx",
    },
    {
        "label": "Baixando modelo de recorte preciso (ISNet)",
        "type": "url",
        "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
        "dest": "modelos_ia/u2net/isnet-general-use.onnx",
    },
    {
        "label": "Baixando motor JavaScript para o YouTube (Deno)",
        "type": "url",
        "github_latest": "https://api.github.com/repos/denoland/deno/releases/latest",
        "asset_pattern": "deno-x86_64-pc-windows-msvc.zip",
        "dest": "modelos_ia/deno.zip",
        "extract": "modelos_ia/deno.exe",
    },
    {
        "label": "Baixando modelo inteligente (Flan-T5)",
        "type": "huggingface",
        "repo": "google/flan-t5-base",
        "dest": "modelos_ia/cerebro/flan_t5_base",
    },
    {
        "label": "Baixando FFmpeg",
        "type": "url",
        "github_latest": "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest",
        "asset_pattern": "*win64-gpl.zip",
        "asset_exclude": ["*shared*", "*7.1.zip", "*8.1.zip"],
        "dest": "modelos_ia/ffmpeg.zip",
        "extract": ["modelos_ia/ffmpeg.exe", "modelos_ia/ffprobe.exe"],
    },
    {
        "label": "Baixando Rclone",
        "type": "url",
        "url": "https://downloads.rclone.org/rclone-current-windows-amd64.zip",
        "dest": "modelos_ia/rclone.zip",
        "extract": "modelos_ia/rclone.exe",
    },
]


# ── Helpers de caminho ──────────────────────────────────────────────────────

def _abs(path: str) -> str:
    """Converte caminho relativo para absoluto a partir de BASE_DIR."""
    if os.path.isabs(path):
        return path
    return os.path.join(BASE_DIR, path)


# ── Verificação de instalação ───────────────────────────────────────────────

def _item_existe(item: dict) -> bool:
    """
    Retorna True se o artefato do item já existe no disco.
    Cada tipo sabe onde seu resultado fica.
    """
    tipo = item["type"]

    if tipo == "whisper":
        model = item["model"]
        local_dir = _abs("modelos_ia/whisper")
        return os.path.exists(os.path.join(local_dir, f"{model}.pt"))

    elif tipo == "huggingface":
        dest = _abs(item["dest"])
        return os.path.isdir(dest) and len(os.listdir(dest)) > 0

    elif tipo == "url":
        if "extract" in item:
            # O que importa é o arquivo extraído, não o zip intermediário
            alvos = item["extract"] if isinstance(item["extract"], list) else [item["extract"]]
            return all(os.path.exists(_abs(a)) for a in alvos)
        else:
            return os.path.exists(_abs(item["dest"]))

    elif tipo == "bundle":
        return os.path.exists(_abs(item["dest"]))

    elif tipo == "pip":
        import importlib.util
        return importlib.util.find_spec(item["module"]) is not None

    return False


def precisa_instalar() -> bool:
    """
    Retorna True se algum modelo/executável ainda precisa ser baixado.
    Se o marcador existir, retorna False imediatamente.
    Se todos os artefatos já existirem no disco, cria o marcador e retorna False.
    """
    # Marcador de versão: quando a lista de downloads ganha itens novos (ex. ffprobe),
    # instalações antigas re-verificam e baixam só o que falta.
    try:
        with open(INSTALLED_MARKER, encoding="utf-8") as f:
            if f.read().strip() == MARKER_VERSION:
                return False
    except OSError:
        pass

    # Verifica se todos os itens já estão presentes (instalação anterior sem marcador)
    if all(_item_existe(item) for item in DOWNLOADS):
        _marcar_instalado()
        return False

    return True


def _marcar_instalado():
    os.makedirs(os.path.dirname(INSTALLED_MARKER), exist_ok=True)
    with open(INSTALLED_MARKER, "w", encoding="utf-8") as f:
        f.write(MARKER_VERSION)


# ── Download de URL com progresso ───────────────────────────────────────────

def _download_url(url: str, dest_path: str, on_progress=None):
    """Baixa arquivo de URL com callback de progresso (0–100)."""
    import requests

    dest_path = _abs(dest_path)
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    resp = requests.get(url, stream=True, timeout=120)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))
    baixado = 0

    # Baixa em .part e só renomeia no fim: um download interrompido não deixa
    # um arquivo quebrado que depois seria tomado como "já instalado".
    parcial = dest_path + ".part"
    with open(parcial, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                f.write(chunk)
                baixado += len(chunk)
                if total and on_progress:
                    on_progress(int(baixado * 100 / total))
    if total and baixado < total:
        os.remove(parcial)
        raise IOError(f"Download incompleto ({baixado} de {total} bytes)")
    os.replace(parcial, dest_path)

    if on_progress:
        on_progress(100)
    return dest_path


# ── Extração de zip ─────────────────────────────────────────────────────────


def _resolver_github_latest_asset(api_url: str, pattern: str, excludes=None):
    """Retorna a URL do primeiro asset do release latest que bate com o padrao."""
    import requests

    excludes = excludes or []
    resp = requests.get(api_url, timeout=30)
    resp.raise_for_status()
    assets = resp.json().get("assets", [])

    candidatos = []
    for asset in assets:
        name = asset.get("name", "")
        if not fnmatch.fnmatch(name, pattern):
            continue
        if any(fnmatch.fnmatch(name, ex) for ex in excludes):
            continue
        url = asset.get("browser_download_url", "")
        if url:
            candidatos.append((name, url))

    if not candidatos:
        raise RuntimeError(f"Nenhum asset encontrado no GitHub para o padrao: {pattern}")

    candidatos.sort(key=lambda item: item[0])
    return candidatos[0][1]

def _extract_from_zip(zip_path: str, dest_path: str, extract_name: str):
    """
    Extrai do zip o arquivo que melhor corresponde a extract_name.

    Estratégias (em ordem):
    1. Termina com o nome exato  — cobre 'bin/ffmpeg.exe' -> 'ffmpeg.exe'
    2. basename == extract_name  — cobre 'rclone-vX/rclone.exe'
    3. basename contém o stem   — cobre 'exiftool(-k).exe' -> 'exiftool.exe'
    """
    stem = os.path.splitext(extract_name)[0].lower()
    ext  = os.path.splitext(extract_name)[1].lower()

    def _write(z, name):
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        with z.open(name) as src, open(dest_path, "wb") as dst:
            dst.write(src.read())

    with zipfile.ZipFile(zip_path, "r") as z:
        candidates = [n for n in z.namelist() if not n.endswith('/')]

        # 1. Termina com nome exato (inclui subpastas, ex: bin/ffmpeg.exe)
        for name in candidates:
            if name.endswith(extract_name) or name.endswith("/" + extract_name):
                _write(z, name)
                return

        # 2. basename exato
        for name in candidates:
            if os.path.basename(name) == extract_name:
                _write(z, name)
                return

        # 3. basename contém stem + extensão correta (ex: exiftool(-k).exe)
        for name in candidates:
            bn = os.path.basename(name).lower()
            if stem in bn and bn.endswith(ext):
                _write(z, name)
                return

    raise FileNotFoundError(f"'{extract_name}' não encontrado em {zip_path}")


# ── Execução de cada item ───────────────────────────────────────────────────

def _run_item(item: dict, on_progress=None, on_label=None,
              on_spinner_start=None, on_spinner_stop=None):
    """Executa o download/instalação de um item da lista."""
    tipo = item["type"]

    if on_label:
        on_label(item["label"])
    if on_progress:
        on_progress(0)

    if tipo == "whisper":
        import whisper
        # load_model não tem callback de progresso — usa barra indeterminate
        if on_spinner_start:
            on_spinner_start()
        whisper.load_model(item["model"], download_root=_abs("modelos_ia/whisper"))
        if on_spinner_stop:
            on_spinner_stop()

    elif tipo == "huggingface":
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id=item["repo"],
            local_dir=_abs(item["dest"]),
            local_dir_use_symlinks=False,
        )

    elif tipo == "url":
        zip_path = _abs(item["dest"])
        url = item.get("url")
        if item.get("github_latest"):
            url = _resolver_github_latest_asset(
                item["github_latest"],
                item["asset_pattern"],
                item.get("asset_exclude"),
            )
        _download_url(url, zip_path, on_progress=on_progress)

        if "extract" in item:
            alvos = item["extract"] if isinstance(item["extract"], list) else [item["extract"]]
            for alvo in alvos:
                extract_dest = _abs(alvo)
                _extract_from_zip(zip_path, extract_dest, os.path.basename(extract_dest))
            try:
                os.remove(zip_path)
            except Exception:
                pass

    elif tipo == "pip":
        if getattr(sys, "frozen", False):
            raise RuntimeError(
                f"Dependencia Python ausente no executavel: {item['package']}. "
                "Recompile o app para embutir essa dependencia."
            )

        if on_spinner_start:
            on_spinner_start()
        try:
            subprocess.check_call([
                sys.executable,
                "-m",
                "pip",
                "install",
                item["package"],
            ])
        finally:
            if on_spinner_stop:
                on_spinner_stop()

    elif tipo == "bundle":
        if on_spinner_start:
            on_spinner_start()
        
        source = item["source"]
        dest = _abs(item["dest"])
        
        # Resolve o caminho do arquivo dentro do bundle (_MEIPASS)
        if hasattr(sys, "_MEIPASS"):
            bundle_path = os.path.join(sys._MEIPASS, source)
        else:
            bundle_path = os.path.join(os.getcwd(), source)
            
        try:
            if os.path.exists(bundle_path):
                os.makedirs(os.path.dirname(dest) or BASE_DIR, exist_ok=True)
                if os.path.isdir(bundle_path):
                    if os.path.exists(dest):
                        shutil.rmtree(dest)
                    shutil.copytree(bundle_path, dest)
                else:
                    shutil.copy2(bundle_path, dest)
            else:
                raise FileNotFoundError(f"Arquivo {source} não encontrado no bundle.")
        finally:
            if on_spinner_stop:
                on_spinner_stop()

    if on_progress:
        on_progress(100)


# ── Configuração do rclone ──────────────────────────────────────────────────

def _configurar_rclone(on_label=None, on_progress=None):
    """Configura o rclone para Google Drive automaticamente."""
    rclone = _abs("modelos_ia/rclone.exe")
    if not os.path.exists(rclone):
        return

    if on_label:
        on_label("Verificando acesso ao Google Drive...")
    if on_progress:
        on_progress(0)

    # A conexão com o Google (login no navegador) acontece no primeiro uso do
    # GDrive Dumper — quem não usa o Drive nunca vê a tela de login.
    if on_label:
        on_label("✓ Google Drive: conecta no primeiro uso do GDrive Dumper")
    if on_progress:
        on_progress(100)


# ── Interface Tkinter ───────────────────────────────────────────────────────

def executar_instalacao():
    """Abre janela de instalação Tkinter e bloqueia até concluir."""
    root = tk.Tk()
    root.title("KANIVETE — Instalação")
    root.configure(bg="#0D0D0D")
    root.resizable(False, False)

    w, h = 520, 270
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")

    # Impede fechar durante a instalação
    root.protocol("WM_DELETE_WINDOW", lambda: None)

    # ── Widgets ──────────────────────────────────────────────────────────────
    tk.Label(
        root, text="KANIVETE",
        font=("Segoe UI", 18, "bold"), fg="#00FF88", bg="#0D0D0D",
    ).pack(pady=(20, 4))

    tk.Label(
        root, text="Instalando dependências pela primeira vez...",
        font=("Segoe UI", 10), fg="#888888", bg="#0D0D0D",
    ).pack(pady=(0, 14))

    lbl_item = tk.Label(
        root, text="Preparando...",
        font=("Segoe UI", 10), fg="#FFFFFF", bg="#0D0D0D", wraplength=460,
    )
    lbl_item.pack(pady=(0, 8))

    style = ttk.Style(root)
    style.theme_use("default")
    style.configure(
        "Green.Horizontal.TProgressbar",
        troughcolor="#1A1A1A", background="#00FF88", thickness=18,
    )

    bar = ttk.Progressbar(
        root, style="Green.Horizontal.TProgressbar",
        orient="horizontal", length=460, mode="determinate", maximum=100,
    )
    bar.pack(pady=(0, 6))

    lbl_pct = tk.Label(
        root, text="0%",
        font=("Segoe UI", 10, "bold"), fg="#00FF88", bg="#0D0D0D",
    )
    lbl_pct.pack()

    total_items = len(DOWNLOADS) + 1  # +1 para a etapa de config do rclone
    lbl_geral = tk.Label(
        root, text=f"0 / {total_items} itens",
        font=("Segoe UI", 9), fg="#555555", bg="#0D0D0D",
    )
    lbl_geral.pack(pady=(4, 0))

    # ── Helpers de UI thread-safe ─────────────────────────────────────────────
    def set_label(text):
        root.after(0, lambda: lbl_item.config(text=text))

    def set_progress(pct):
        def _up():
            bar.config(value=pct)
            lbl_pct.config(text=f"{pct}%")
        root.after(0, _up)

    def set_geral(n):
        root.after(0, lambda: lbl_geral.config(text=f"{n} / {total_items} itens"))

    def spinner_start():
        """Ativa barra indeterminate (para downloads sem progresso, ex: Whisper)."""
        def _up():
            bar.config(mode="indeterminate")
            bar.start(15)
            lbl_pct.config(text="...")
        root.after(0, _up)

    def spinner_stop():
        """Volta barra para modo determinate em 100%."""
        def _up():
            bar.stop()
            bar.config(mode="determinate", value=100)
            lbl_pct.config(text="100%")
        root.after(0, _up)

    # ── Thread de instalação ──────────────────────────────────────────────────
    def instalar():
        try:
            falhas = []
            for i, item in enumerate(DOWNLOADS):
                set_geral(i)
                if _item_existe(item):
                    # Já existe — apenas registra e avança sem baixar
                    nome_curto = item["label"].replace("Baixando ", "")
                    set_label(f"✓ Já instalado: {nome_curto}")
                    set_progress(100)
                else:
                    # Um item com problema (rede, GitHub fora) não impede os demais;
                    # ele é tentado de novo na próxima abertura.
                    try:
                        _run_item(item, on_progress=set_progress, on_label=set_label,
                                  on_spinner_start=spinner_start, on_spinner_stop=spinner_stop)
                    except Exception as e:
                        spinner_stop()
                        falhas.append(item["label"])
                        set_label(f"⚠ Falhou: {item['label']} ({e})")
                set_geral(i + 1)

            # Etapa final: configurar rclone
            set_geral(len(DOWNLOADS))
            _configurar_rclone(on_label=set_label, on_progress=set_progress)
            set_geral(total_items)

            if falhas:
                set_label(f"⚠ {len(falhas)} item(ns) não baixaram — tento de novo na próxima abertura.")
            else:
                _marcar_instalado()
                set_label("✅ Instalação concluída! Abrindo o app...")
            set_progress(100)

        except Exception as e:
            set_label(f"❌ Erro durante instalação: {e}")

        finally:
            root.after(2000, root.destroy)

    threading.Thread(target=instalar, daemon=True).start()
    root.mainloop()
