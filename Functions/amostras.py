"""Amostras de cor (painel Amostras do Editor de Imagem): lê as do Photoshop instalado (Swatches.psp, com os grupos)
e arquivos .aco/.ase. Devolve uma lista na ordem do painel: {"g": nome, "cores": [{"c": "#rrggbb", "n": nome}]} para
grupo, {"c", "n"} para amostra solta."""
import glob
import io
import os
import struct


def _hex(r, g, b):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(v)))) for v in (r, g, b))


def _cor_aco(espaco, a, b, c, d):
    if espaco == 0:   # RGB
        return _hex(a / 257, b / 257, c / 257)
    if espaco == 1:   # HSB
        import colorsys
        r, g, bb = colorsys.hsv_to_rgb(a / 65536, b / 65535, c / 65535)
        return _hex(r * 255, g * 255, bb * 255)
    if espaco == 2:   # CMYK (0 = tinta cheia)
        cc, m, y, k = (1 - v / 65535 for v in (a, b, c, d))
        return _hex(255 * (1 - cc) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k))
    if espaco == 8:   # tons de cinza (0..10000)
        v = 255 - a / 10000 * 255
        return _hex(v, v, v)
    if espaco == 7:   # Lab
        L, A, B = a / 100, struct.unpack(">h", struct.pack(">H", b))[0] / 100, struct.unpack(">h", struct.pack(">H", c))[0] / 100
        return _lab(L, A, B)
    return None


def _lab(L, A, B):
    y = (L + 16) / 116
    x, z = A / 500 + y, y - B / 200
    f = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    X, Y, Z = 0.95047 * f(x), f(y), 1.08883 * f(z)
    r, g, b = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z
    gam = lambda v: 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return _hex(*(max(0, min(1, gam(v))) * 255 for v in (r, g, b)))


def ler_aco(dados):
    """ACO v1 (+ v2 com nomes) e, no Swatches.psp do Photoshop, a hierarquia de grupos que vem depois (8BIMphry)."""
    f = io.BytesIO(dados)
    v, n = struct.unpack(">HH", f.read(4))
    cores = []
    if v == 1:
        v1 = [struct.unpack(">5H", f.read(10)) for _ in range(n)]
        cores = [{"c": _cor_aco(*x), "n": ""} for x in v1]
        cab = f.read(4)
        if len(cab) == 4:
            v, n = struct.unpack(">HH", cab)
    if v == 2:
        cores = []
        for _ in range(n):
            x = struct.unpack(">5H", f.read(10))
            f.read(2)
            ln = struct.unpack(">H", f.read(2))[0]
            nome = f.read(ln * 2).decode("utf-16-be", "replace").rstrip("\x00")
            cores.append({"c": _cor_aco(*x), "n": nome})
    cores = [c for c in cores if c["c"]]
    resto = dados[f.tell():]
    i = resto.find(b"8BIMphry")
    if i < 0:
        return cores
    try:   # hierarquia: Grup (nome) / preset (a próxima cor) / groupEnd
        from psd_tools.psd.descriptor import DescriptorBlock
        d = DescriptorBlock.read(io.BytesIO(resto[i + 12:]))
        out, grupo, k = [], None, 0
        for x in d[b"hierarchy"]:
            cid = x.classID
            if cid == b"Grup":
                nm = x[b"Nm  "]
                grupo = {"g": str(getattr(nm, "value", nm)).rstrip("\x00"), "cores": []}
                out.append(grupo)
            elif cid == b"groupEnd":
                grupo = None
            elif k < len(cores):
                (grupo["cores"] if grupo is not None else out).append(cores[k])
                k += 1
        out += cores[k:]
        return out
    except Exception:
        return cores


def ler_ase(dados):
    """Adobe Swatch Exchange (.ase): grupos e cores RGB/CMYK/Gray/Lab."""
    f = io.BytesIO(dados)
    if f.read(4) != b"ASEF":
        raise ValueError("não é um .ase")
    f.read(4)
    n = struct.unpack(">I", f.read(4))[0]
    out, grupo = [], None
    for _ in range(n):
        tipo, tam = struct.unpack(">HI", f.read(6))
        bloco = io.BytesIO(f.read(tam))
        if tipo == 0xC002:
            grupo = None
            continue
        ln = struct.unpack(">H", bloco.read(2))[0]
        nome = bloco.read(ln * 2).decode("utf-16-be", "replace").rstrip("\x00")
        if tipo == 0xC001:
            grupo = {"g": nome, "cores": []}
            out.append(grupo)
            continue
        modelo = bloco.read(4)
        if modelo == b"RGB ":
            r, g, b = struct.unpack(">3f", bloco.read(12)); c = _hex(r * 255, g * 255, b * 255)
        elif modelo == b"CMYK":
            cc, m, y, k = struct.unpack(">4f", bloco.read(16)); c = _hex(255 * (1 - cc) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k))
        elif modelo == b"Gray":
            v = struct.unpack(">f", bloco.read(4))[0]; c = _hex(v * 255, v * 255, v * 255)
        elif modelo == b"LAB ":
            L, A, B = struct.unpack(">3f", bloco.read(12)); c = _lab(L * 100, A, B)
        else:
            continue
        (grupo["cores"] if grupo is not None else out).append({"c": c, "n": nome})
    return out


def ler_arquivo(path):
    with open(path, "rb") as f:
        dados = f.read()
    return ler_ase(dados) if dados[:4] == b"ASEF" else ler_aco(dados)


def do_photoshop():
    """Amostras do Photoshop mais novo instalado (as que aparecem no painel Amostras dele)."""
    bases = {os.path.join(os.environ.get("APPDATA", ""), "Adobe"), os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "Adobe")}
    achados = []
    for d in [x for b in bases for x in glob.glob(os.path.join(b, "Adobe Photoshop *"))]:
        for arq in glob.glob(os.path.join(d, "*Settings", "Swatches.psp")):
            achados.append(arq)
    if not achados:
        return None, None
    arq = max(set(achados), key=os.path.getmtime)
    return ler_arquivo(arq), os.path.basename(os.path.dirname(os.path.dirname(arq)))
