"""Gestão de cor do Photo Kanivete: o app trabalha em sRGB; aqui entram e saem os outros espaços pelo perfil ICC.

- para_srgb: imagem que entra (JPG/PNG/TIFF/PSD em Adobe RGB, Display P3, CMYK...) → sRGB pelo perfil embutido. CMYK sem
  perfil usa o FOGRA39 (o padrão de gráfica no Brasil). Antes o app convertia "na mão" e as cores ficavam lavadas.
- lut_prova: tabela 64×64×64 sRGB → (perfil CMYK) → sRGB para a PROVA DE CORES na tela (Ctrl+Y, como no Photoshop) e a
  marca de fora da gama (Shift+Ctrl+Y): cor que muda mais que ΔE 6 na ida e volta.
- cores: conversão de cores avulsas (seletor de cor, conta-gotas).
- salvar_cmyk: JPG/TIFF/PDF/PSD em CMYK com o perfil embutido (PSD achatado escrito direto no formato do Photoshop).
Perfis: os mesmos do Vetor (vetor_kanivete.PERFIS: FOGRA39, FOGRA29, GRACoL, SWOP); intenção colorimétrica relativa com
compensação de ponto preto (o padrão do Photoshop).
"""
import base64
import hashlib
import io
import os
import struct

from PIL import Image, ImageCms

_T = {}


def _srgb():
    return ImageCms.createProfile("sRGB")


def perfil_cmyk(cond="FOGRA39"):
    from Functions import vetor_kanivete as vk
    return vk.perfil_arquivo(cond)


def _eh_srgb(icc):
    try:
        d = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(icc))) or ""
        return "srgb" in d.lower().replace(" ", "") or "iec61966" in d.lower()
    except Exception:
        return True   # perfil ilegível: segue como está


def _transf(chave, de, para, modo_de, modo_para):
    if chave not in _T:
        _T[chave] = ImageCms.buildTransform(de, para, modo_de, modo_para, ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                            flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)
    return _T[chave]


def para_srgb(im, icc=None, cond="FOGRA39"):
    """PIL Image (qualquer modo) → RGBA em sRGB, convertendo pelo perfil (o embutido na imagem ou `icc`)."""
    icc = icc or im.info.get("icc_profile")
    alfa = None
    if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        alfa = im.getchannel("A")
        im = im.convert("RGB")
    try:
        if im.mode == "CMYK":
            if icc:
                h = hashlib.sha1(icc).hexdigest()
                t = _transf(("cmyk", h), ImageCms.ImageCmsProfile(io.BytesIO(icc)), _srgb(), "CMYK", "RGB")
            else:
                arq = perfil_cmyk(cond)
                t = _transf(("cmyk", cond), ImageCms.getOpenProfile(arq), _srgb(), "CMYK", "RGB") if arq else None
            rgb = ImageCms.applyTransform(im, t) if t else im.convert("RGB")
        elif im.mode == "RGB" and icc and not _eh_srgb(icc):
            h = hashlib.sha1(icc).hexdigest()
            rgb = ImageCms.applyTransform(im, _transf(("rgb", h), ImageCms.ImageCmsProfile(io.BytesIO(icc)), _srgb(), "RGB", "RGB"))
        else:
            rgb = im.convert("RGB")
    except Exception:
        rgb = im.convert("RGB")
    out = rgb.convert("RGBA")
    if alfa is not None:
        out.putalpha(alfa)
    return out


def descricao(icc):
    try:
        return ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(icc))).strip()
    except Exception:
        return ""


# ─────────────────────────── prova de cores ───────────────────────────
_LUT = {}
N = 64   # níveis por canal (erro de quantização ≤ 2/255: invisível na prova)


def lut_prova(cond="FOGRA39"):
    """{lut: base64 de N³×3 bytes (r,g,b da prova), gama: base64 de N³ bytes (1 = fora da gama), n, perfil, simples}."""
    if cond in _LUT:
        return _LUT[cond]
    arq = perfil_cmyk(cond)
    passo = [round(i * 255 / (N - 1)) for i in range(N)]
    dados = bytes(c for r in passo for g in passo for b in passo for c in (r, g, b))
    lado = int((N ** 3) ** 0.5)   # 512 × 512 = 64³
    im = Image.frombytes("RGB", (lado, lado), dados)
    if arq:
        cmyk = ImageCms.getOpenProfile(arq)
        ida = _transf(("ida", cond), _srgb(), cmyk, "RGB", "CMYK")
        volta = _transf(("volta", cond), cmyk, _srgb(), "CMYK", "RGB")
        prova = ImageCms.applyTransform(ImageCms.applyTransform(im, ida), volta)
    else:
        prova = im.convert("CMYK").convert("RGB")
    lab = _transf(("lab",), _srgb(), ImageCms.createProfile("LAB"), "RGB", "LAB")
    a, b = ImageCms.applyTransform(im, lab).tobytes(), ImageCms.applyTransform(prova, lab).tobytes()
    gama = bytearray(N ** 3)
    for i in range(N ** 3):
        j = i * 3
        # L 0..255 (×100/255), a/b com sinal (o PIL guarda deslocado em 128)
        dl = (a[j] - b[j]) * 100 / 255
        da = ((a[j + 1] + 128) % 256) - ((b[j + 1] + 128) % 256)
        db = ((a[j + 2] + 128) % 256) - ((b[j + 2] + 128) % 256)
        if dl * dl + da * da + db * db > 36:   # ΔE76 > 6
            gama[i] = 1
    r = {"success": True, "n": N, "perfil": cond, "simples": not arq,
         "lut": base64.b64encode(prova.tobytes()).decode(), "gama": base64.b64encode(bytes(gama)).decode()}
    _LUT[cond] = r
    return r


def cores(lista, sentido="rgb_cmyk", cond="FOGRA39"):
    """Cores avulsas: rgb_cmyk [[r,g,b]] → [[c,m,y,k] 0-100]; cmyk_rgb [[c,m,y,k]] → [[r,g,b]] (como a tela mostra)."""
    from Functions import vetor_kanivete as vk
    return vk.rgb_para_cmyk(lista, cond) if sentido == "rgb_cmyk" else vk.cores_tela(lista, cond)


# ─────────────────────────── saída em CMYK ───────────────────────────
def _psd_cmyk(cmyk, destino, icc, dpi):
    """PSD achatado em CMYK 8 bits, sem compressão, com o perfil (recurso 1039) e a resolução (1005)."""
    w, h = cmyk.size

    def recurso(rid, dados):
        dados = bytes(dados)
        pad = b"\0" if len(dados) % 2 else b""
        return b"8BIM" + struct.pack(">H", rid) + b"\0\0" + struct.pack(">I", len(dados)) + dados + pad

    res = struct.pack(">IHHIHH", int(dpi * 65536), 1, 1, int(dpi * 65536), 1, 1)   # ResolutionInfo (ppp, polegadas)
    recursos = recurso(1005, res) + (recurso(1039, icc) if icc else b"")
    with open(destino, "wb") as f:
        f.write(b"8BPS" + struct.pack(">H", 1) + b"\0" * 6 + struct.pack(">HIIHH", 4, h, w, 8, 4))
        f.write(struct.pack(">I", 0))                                  # dados de modo de cor
        f.write(struct.pack(">I", len(recursos)) + recursos)
        f.write(struct.pack(">I", 0))                                  # camadas e máscaras: nenhuma (achatado)
        f.write(struct.pack(">H", 0))                                  # sem compressão
        for canal in cmyk.split():                                     # no PSD, CMYK vai invertido (0 = 100% de tinta)
            f.write(bytes(255 - v for v in canal.tobytes()))


def salvar_cmyk(im, destino, cond="FOGRA39", q=95, dpi=300):
    """RGBA/RGB (sRGB) → CMYK pelo perfil e grava pela extensão (.jpg .tif .pdf .psd). Devolve o erro ou None."""
    arq = perfil_cmyk(cond)
    if im.mode == "RGBA":
        fundo = Image.new("RGB", im.size, (255, 255, 255))
        fundo.paste(im, mask=im.getchannel("A"))
        im = fundo
    im = im.convert("RGB")
    if arq:
        cmyk = ImageCms.applyTransform(im, _transf(("ida", cond), _srgb(), ImageCms.getOpenProfile(arq), "RGB", "CMYK"))
        with open(arq, "rb") as f:
            icc = f.read()
    else:
        cmyk, icc = im.convert("CMYK"), None
    ext = os.path.splitext(destino)[1].lower()
    os.makedirs(os.path.dirname(destino) or ".", exist_ok=True)
    try:
        extra = {"icc_profile": icc} if icc else {}
        if ext in (".jpg", ".jpeg"):
            cmyk.save(destino, "JPEG", quality=q, subsampling=0, dpi=(dpi, dpi), **extra)
        elif ext in (".tif", ".tiff"):
            cmyk.save(destino, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi), **extra)
        elif ext == ".pdf":
            cmyk.save(destino, "PDF", resolution=dpi, quality=q)
        elif ext in (".psd",):
            _psd_cmyk(cmyk, destino, icc, dpi)
        else:
            return f"CMYK não sai em {ext}: use JPG, TIFF, PDF ou PSD"
    except Exception as e:
        return str(e)
    return None
