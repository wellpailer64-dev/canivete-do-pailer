"""
fontes.py — famílias de fonte instaladas no Windows e os estilos de cada uma (Light, Regular, Semibold,
Bold, Black, Itálico...), como o seletor de fonte do Premiere/Photoshop.

Lê direto as tabelas 'name' e 'OS/2' dos arquivos (.ttf/.otf/.ttc), sem dependências:
  · família tipográfica (nome 16, ou 1) agrupa os estilos; estilo = nome 17 (ou 2)
  · peso = OS/2 usWeightClass; itálico = OS/2 fsSelection bit 0 (ou bit 9 oblíquo)
  · nome "de sistema" (1) + negrito/itálico (2): é por ele que o libass acha a fonte nas legendas gravadas
O navegador desenha com a família tipográfica + peso + itálico (DirectWrite).
"""

import os
import struct
import threading

_cache = None
_lock = threading.Lock()


def _pasta_usuario():
    """Pasta das fontes instaladas "só para mim" (perfil real do usuário, mesmo com LOCALAPPDATA trocado)."""
    return os.path.join(os.path.expanduser("~"), "AppData", "Local", "Microsoft", "Windows", "Fonts")


def _pastas():
    win = os.environ.get("WINDIR", r"C:\Windows")
    out = [os.path.join(win, "Fonts"), _pasta_usuario()]
    loc = os.environ.get("LOCALAPPDATA")
    if loc:
        out.append(os.path.join(loc, "Microsoft", "Windows", "Fonts"))
    try:   # o Windows registra cada fonte do usuário com o caminho (instaladores podem usar outras pastas)
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts") as k:
            for i in range(winreg.QueryInfoKey(k)[1]):
                v = winreg.EnumValue(k, i)[1]
                if isinstance(v, str) and os.path.isabs(v):
                    out.append(os.path.dirname(v))
    except Exception:
        pass
    vistos, res = set(), []
    for p in out:
        n = os.path.normcase(os.path.abspath(p))
        if n not in vistos and os.path.isdir(p):
            vistos.add(n); res.append(p)
    return res


def _nomes(dados, off, extra=()):
    """Tabela 'name' → {id: texto} (prefere Windows/Unicode, inglês). extra = outros ids (instâncias da fonte variável)."""
    _, n, base = struct.unpack_from(">HHH", dados, off)
    melhor = {}
    for k in range(n):
        plat, enc, lang, nid, tam, pos = struct.unpack_from(">HHHHHH", dados, off + 6 + k * 12)
        if nid not in (1, 2, 4, 6, 16, 17) and nid not in extra:
            continue
        bruto = dados[off + base + pos: off + base + pos + tam]
        if plat == 3 and enc in (0, 1, 10):
            nota = 3 if lang == 0x409 else 2
            try:
                txt = bruto.decode("utf-16-be")
            except Exception:
                continue
        elif plat == 1 and enc == 0:
            nota = 1
            txt = bruto.decode("latin-1")
        else:
            continue
        if nid not in melhor or nota > melhor[nid][0]:
            melhor[nid] = (nota, txt.strip())
    return {k: v[1] for k, v in melhor.items()}


def _instancias(dados, pos):
    """Tabela 'fvar' (fonte variável) → (faixa do peso, [(id do nome, peso, id do nome PostScript)]) ou None."""
    _, _, ax_off, _, n_ax, ax_tam, n_inst, inst_tam = struct.unpack_from(">HHHHHHHH", dados, pos)
    eixos = []
    for k in range(n_ax):
        tag, mn, dv, mx = struct.unpack_from(">4siii", dados, pos + ax_off + k * ax_tam)
        eixos.append((tag, mn / 65536, dv / 65536, mx / 65536))
    iw = next((i for i, e in enumerate(eixos) if e[0] == b"wght"), None)
    if iw is None:
        return None
    out, base = [], pos + ax_off + n_ax * ax_tam
    for k in range(n_inst):
        q = base + k * inst_tam
        nid = struct.unpack_from(">H", dados, q)[0]
        coords = struct.unpack_from(f">{n_ax}i", dados, q + 4)
        ps = struct.unpack_from(">H", dados, q + 4 + 4 * n_ax)[0] if inst_tam >= 6 + 4 * n_ax else 0
        out.append((nid, coords[iw] / 65536, ps))
    return (eixos[iw][1], eixos[iw][3]), out


def _uma_fonte(dados, off):
    """Uma fonte (offset da tabela de diretório) → lista de estilos (fonte variável: um por instância nomeada)."""
    _, ntab = struct.unpack_from(">IH", dados, off)
    tabs = {}
    for k in range(ntab):
        tag, _, pos, tam = struct.unpack_from(">4sIII", dados, off + 12 + k * 16)
        tabs[tag] = (pos, tam)
    if b"name" not in tabs:
        return []
    var = None
    if b"fvar" in tabs:
        try:
            var = _instancias(dados, tabs[b"fvar"][0])
        except Exception:
            var = None
    extra = {i[0] for i in var[1]} | {i[2] for i in var[1]} if var else ()
    nm = _nomes(dados, tabs[b"name"][0], extra)
    fam1, est2 = nm.get(1), nm.get(2) or "Regular"
    if not fam1 or fam1.startswith("@"):
        return []
    peso, ita, asc = 400, "italic" in est2.lower(), None
    if b"OS/2" in tabs:
        pos = tabs[b"OS/2"][0]
        peso = struct.unpack_from(">H", dados, pos + 4)[0] or 400
        sel = struct.unpack_from(">H", dados, pos + 62)[0]
        ita = bool(sel & 1 or sel & 0x200)
        # ascendente tipográfico (sTypoAscender ÷ unitsPerEm): é com ele que o Photoshop põe a 1ª linha de um texto
        # de parágrafo abaixo do topo da caixa (medido 2026-10-06: Times 0,693 × tamanho; o do navegador dá 0,891)
        try:
            if b"head" in tabs:
                upm = struct.unpack_from(">H", dados, tabs[b"head"][0] + 18)[0]
                typo = struct.unpack_from(">h", dados, pos + 68)[0]
                if upm and typo > 0:
                    asc = round(typo / upm, 4)
        except struct.error:
            pass
    um = {
        "familia": nm.get(16) or fam1, "estilo": nm.get(17) or est2,
        "gdi": fam1, "gdi_negrito": "bold" in est2.lower(), "gdi_italico": "italic" in est2.lower(),
        "peso": max(100, min(1000, int(peso))), "italico": ita,
        # nome PostScript (é por ele que o PSD guarda a fonte de cada texto: Montserrat-Bold, ArialMT...)
        "ps": nm.get(6) or "", "completo": nm.get(4) or "",
    }
    if asc:
        um["asc"] = asc
    if not var or not var[1]:
        return [um]
    # fonte variável (quase todas as do Google Fonts hoje): cada instância nomeada (Thin...Black) vira um estilo;
    # "var" = faixa do eixo de peso, para o editor carregar o arquivo uma vez e escolher o peso
    out = []
    for nid, w, psid in var[1]:
        est = nm.get(nid) or f"{int(w)}"
        out.append({**um, "estilo": est, "peso": max(1, min(1000, int(round(w)))), "italico": ita or "italic" in est.lower(),
                    "gdi_negrito": False, "ps": nm.get(psid) or (um["ps"].split("-")[0] + "-" + est.replace(" ", "")),
                    "completo": f"{um['familia']} {est}", "var": [var[0][0], var[0][1]]})
    return out


def _ler(caminho):
    try:
        with open(caminho, "rb") as f:
            dados = f.read()
        if dados[:4] == b"ttcf":
            n = struct.unpack_from(">I", dados, 8)[0]
            offs = struct.unpack_from(f">{n}I", dados, 12)
        else:
            offs = (0,)
        out = []
        for i, o in enumerate(offs):
            for f in _uma_fonte(dados, o):
                f["arquivo"], f["indice"] = caminho, i   # para o editor de imagem carregar a fonte (FontFace)
                out.append(f)
        return out
    except Exception:
        return []


def listar():
    """{familia: [{estilo, peso, italico, gdi, gdi_negrito, gdi_italico}, ...]} ordenado (lido uma vez)."""
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
        fams = {}
        for pasta in _pastas():
            for nome in os.listdir(pasta):
                if not nome.lower().endswith((".ttf", ".otf", ".ttc")):
                    continue
                for f in _ler(os.path.join(pasta, nome)):
                    lista = fams.setdefault(f["familia"], [])
                    if not any(e["estilo"] == f["estilo"] for e in lista):
                        lista.append({k: f[k] for k in ("estilo", "peso", "italico", "gdi", "gdi_negrito", "gdi_italico", "ps", "completo", "arquivo", "indice", "var", "asc") if k in f})
        for lista in fams.values():
            lista.sort(key=lambda e: (e["italico"], e["peso"]))
        _cache = dict(sorted(fams.items(), key=lambda kv: kv[0].lower()))
        return _cache


def instalar_google(familia):
    """Baixa uma família do Google Fonts (repositório oficial google/fonts: pastas ofl/, apache/, ufl/) e instala
    para o usuário (pasta de fontes do usuário + registro HKCU, sem pedir administrador). A lista é relida na hora."""
    import json
    import re
    import urllib.request
    global _cache
    slug = re.sub(r"[^a-z0-9]", "", familia.lower())
    if not slug:
        return {"success": False, "error": "nome vazio"}
    arquivos = None
    for lic in ("ofl", "apache", "ufl"):
        try:
            req = urllib.request.Request(f"https://api.github.com/repos/google/fonts/contents/{lic}/{slug}", headers={"User-Agent": "KANIVETE"})
            with urllib.request.urlopen(req, timeout=20) as r:
                itens = json.load(r)
            arquivos = [i for i in itens if i.get("name", "").lower().endswith((".ttf", ".otf"))]
            if arquivos:
                break
        except Exception:
            continue
    if not arquivos:
        # sem o GitHub (limite de 60 consultas/hora sem login): a API de CSS do Google Fonts entrega TTF quando o
        # navegador "não conhece" woff2 — um arquivo por peso/itálico
        try:
            pesos = ",".join(f"{p}{i}" for i in ("", "i") for p in range(100, 1000, 100))
            req = urllib.request.Request(f"https://fonts.googleapis.com/css?family={urllib.request.quote(familia)}:{pesos}", headers={"User-Agent": "Mozilla/4.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                css = r.read().decode("utf-8", "replace")
            vistos = set()
            arquivos = []
            for bloco in re.findall(r"@font-face\s*\{(.*?)\}", css, re.S):
                url = re.search(r"url\((https://[^)]+\.ttf)\)", bloco)
                peso = re.search(r"font-weight:\s*(\d+)", bloco)
                ital = "Italic" if re.search(r"font-style:\s*italic", bloco) else ""
                if not url or url.group(1) in vistos:
                    continue
                vistos.add(url.group(1))
                arquivos.append({"name": f"{re.sub(r'[^A-Za-z0-9]', '', familia)}-{peso.group(1) if peso else '400'}{ital}.ttf", "download_url": url.group(1)})
        except Exception:
            arquivos = None
    if not arquivos:
        return {"success": False, "error": f"'{familia}' não encontrada no Google Fonts"}
    pasta = _pasta_usuario()
    os.makedirs(pasta, exist_ok=True)
    feitos = []
    for a in arquivos:
        destino = os.path.join(pasta, a["name"])
        try:
            if not os.path.exists(destino):
                with urllib.request.urlopen(a["download_url"], timeout=60) as r, open(destino, "wb") as f:
                    f.write(r.read())
            nome = (_ler(destino) or [{}])[0].get("completo") or os.path.splitext(a["name"])[0]
            try:
                import winreg
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts", 0, winreg.KEY_SET_VALUE) as k:
                    winreg.SetValueEx(k, f"{nome} ({os.path.splitext(a['name'])[0]}) (TrueType)", 0, winreg.REG_SZ, destino)
                import ctypes
                ctypes.windll.gdi32.AddFontResourceW(destino)   # já vale nesta sessão do Windows
            except Exception:
                pass
            feitos.append(a["name"])
        except Exception as e:
            return {"success": False, "error": f"{a['name']}: {e}", "feitos": feitos}
    with _lock:
        _cache = None
    return {"success": True, "familia": familia, "arquivos": feitos}
