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


def _pastas():
    win = os.environ.get("WINDIR", r"C:\Windows")
    out = [os.path.join(win, "Fonts")]
    loc = os.environ.get("LOCALAPPDATA")
    if loc:
        out.append(os.path.join(loc, "Microsoft", "Windows", "Fonts"))
    return [p for p in out if os.path.isdir(p)]


def _nomes(dados, off):
    """Tabela 'name' → {id: texto} (prefere Windows/Unicode, inglês)."""
    _, n, base = struct.unpack_from(">HHH", dados, off)
    melhor = {}
    for k in range(n):
        plat, enc, lang, nid, tam, pos = struct.unpack_from(">HHHHHH", dados, off + 6 + k * 12)
        if nid not in (1, 2, 4, 6, 16, 17):
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


def _uma_fonte(dados, off):
    """Uma fonte (offset da tabela de diretório) → dict ou None."""
    _, ntab = struct.unpack_from(">IH", dados, off)
    tabs = {}
    for k in range(ntab):
        tag, _, pos, tam = struct.unpack_from(">4sIII", dados, off + 12 + k * 16)
        tabs[tag] = (pos, tam)
    if b"name" not in tabs:
        return None
    nm = _nomes(dados, tabs[b"name"][0])
    fam1, est2 = nm.get(1), nm.get(2) or "Regular"
    if not fam1 or fam1.startswith("@"):
        return None
    peso, ita = 400, "italic" in est2.lower()
    if b"OS/2" in tabs:
        pos = tabs[b"OS/2"][0]
        peso = struct.unpack_from(">H", dados, pos + 4)[0] or 400
        sel = struct.unpack_from(">H", dados, pos + 62)[0]
        ita = bool(sel & 1 or sel & 0x200)
    return {
        "familia": nm.get(16) or fam1, "estilo": nm.get(17) or est2,
        "gdi": fam1, "gdi_negrito": "bold" in est2.lower(), "gdi_italico": "italic" in est2.lower(),
        "peso": max(100, min(1000, int(peso))), "italico": ita,
        # nome PostScript (é por ele que o PSD guarda a fonte de cada texto: Montserrat-Bold, ArialMT...)
        "ps": nm.get(6) or "", "completo": nm.get(4) or "",
    }


def _ler(caminho):
    try:
        with open(caminho, "rb") as f:
            dados = f.read()
        if dados[:4] == b"ttcf":
            n = struct.unpack_from(">I", dados, 8)[0]
            offs = struct.unpack_from(f">{n}I", dados, 12)
        else:
            offs = (0,)
        return [x for x in (_uma_fonte(dados, o) for o in offs) if x]
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
                        lista.append({k: f[k] for k in ("estilo", "peso", "italico", "gdi", "gdi_negrito", "gdi_italico", "ps", "completo")})
        for lista in fams.values():
            lista.sort(key=lambda e: (e["italico"], e["peso"]))
        _cache = dict(sorted(fams.items(), key=lambda kv: kv[0].lower()))
        return _cache
