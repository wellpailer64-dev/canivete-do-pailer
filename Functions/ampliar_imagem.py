"""Ampliar foto por IA (super-resolução): Real-ESRGAN ncnn Vulkan (BSD-3, xinntao/Real-ESRGAN), GPU via Vulkan.

Não vem no build: baixado na 1ª vez (~45 MB, com os modelos) para <app>/modelos_ia/ampliar/. Para foto: realesrgan-x4plus
(sempre ×4; para ×2/×3 a saída ×4 é reduzida com Lanczos, que fica melhor que ampliar só ×2). Desenho/arte chapada:
realesrgan-x4plus-anime. Resultado em cache por (arquivo, data, escala, modelo).
"""
import hashlib
import os
import subprocess
import zipfile

from Functions.midia import NO_WINDOW, app_dir

URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip"
MODELOS = {"foto": "realesrgan-x4plus", "arte": "realesrgan-x4plus-anime"}


def pasta():
    return os.path.join(app_dir(), "modelos_ia", "ampliar")


def _exe():
    for raiz, _d, arqs in os.walk(pasta()):
        if "realesrgan-ncnn-vulkan.exe" in arqs:
            return os.path.join(raiz, "realesrgan-ncnn-vulkan.exe")
    return None


def instalado():
    return bool(_exe())


def instalar(on_progress=lambda d: None):
    """Baixa e descompacta o Real-ESRGAN (uma vez)."""
    if instalado():
        return {"success": True, "ja": True}
    from Functions.gerador_imagem import _baixar_arquivo
    os.makedirs(pasta(), exist_ok=True)
    zipf = os.path.join(pasta(), "realesrgan.zip")
    _baixar_arquivo(URL, zipf, lambda f, t: on_progress({"feito": f, "total": t}))
    with zipfile.ZipFile(zipf) as z:
        z.extractall(pasta())
    os.remove(zipf)
    return {"success": instalado()}


def ampliar(arquivo, escala=2, tipo="foto", on_progress=lambda d: None):
    """→ {success, path (PNG), w, h, escala}. escala 2, 3 ou 4; tipo foto | arte."""
    from PIL import Image
    try:   # placa de vídeo para um modelo pesado por vez: o gerador de imagem sai da VRAM
        from Functions import gerador_imagem
        gerador_imagem.parar()
    except Exception:
        pass
    if not os.path.isfile(arquivo):
        return {"success": False, "error": f"arquivo não existe: {arquivo}"}
    if not instalado():
        r = instalar(on_progress)
        if not r.get("success"):
            return {"success": False, "error": "não instalou o Real-ESRGAN"}
    escala = max(2, min(4, int(escala or 2)))
    modelo = MODELOS.get(tipo, MODELOS["foto"])
    st = os.stat(arquivo)
    chave = hashlib.md5(f"{os.path.abspath(arquivo)}|{st.st_mtime}|{st.st_size}|{escala}|{modelo}".encode()).hexdigest()[:16]
    cache = os.path.join(pasta(), "cache"); os.makedirs(cache, exist_ok=True)
    saida = os.path.join(cache, f"{os.path.splitext(os.path.basename(arquivo))[0]}_x{escala}_{chave}.png")
    if not os.path.isfile(saida):
        im = Image.open(arquivo)
        alfa = im.getchannel("A") if im.mode in ("RGBA", "LA") else None
        ent = os.path.join(cache, f"ent_{chave}.png"); im.convert("RGB").save(ent)
        x4 = os.path.join(cache, f"x4_{chave}.png")
        exe = _exe()
        r = subprocess.run([exe, "-i", ent, "-o", x4, "-n", modelo, "-s", "4", "-m", os.path.join(os.path.dirname(exe), "models")],
                           capture_output=True, text=True, timeout=900, creationflags=NO_WINDOW, cwd=os.path.dirname(exe))
        os.remove(ent)
        if r.returncode != 0 or not os.path.isfile(x4):
            return {"success": False, "error": "Real-ESRGAN falhou: " + (r.stderr or r.stdout or "")[-300:]}
        out = Image.open(x4); out.load()
        W, H = im.width * escala, im.height * escala
        if out.size != (W, H):
            out = out.resize((W, H), Image.LANCZOS)
        if alfa is not None:   # transparência: a máscara ampliada (Lanczos)
            out = out.convert("RGBA"); out.putalpha(alfa.resize((W, H), Image.LANCZOS))
        if (im.info.get("dpi") or None):
            dpi = im.info["dpi"]; out.save(saida, dpi=(dpi[0] * escala, dpi[1] * escala))
        else:
            out.save(saida)
        os.remove(x4)
    o = Image.open(saida)
    return {"success": True, "path": saida, "w": o.width, "h": o.height, "escala": escala}
