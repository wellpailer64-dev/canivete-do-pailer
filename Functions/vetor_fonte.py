"""Criar fonte própria no Vetor Kanivete: glifos desenhados em pranchetas → OpenType (.otf, contornos CFF cúbicos).

Entrada (vetor-fonte.js já converte para unidades da fonte, y para cima, base = 0):
    {familia, estilo, upm, asc, desc, cap, x, caminho, instalar,
     glifos: [{car, larg, pinturas: [{subs, regra, tira}]}]}
Cada glifo: as pinturas entram em ordem — `tira` (pintura branca por cima) recorta, o resto une (skia-pathops);
depois simplify com fix_winding (contorno externo anti-horário, furo horário: o que o CFF pede). Espaço sai com
larg = 25% do em se não vier desenhado. instalar: copia para as fontes do usuário (sem admin) e avisa o Windows.
"""
import os

from Functions.vetor_kanivete import _para_skia


def _glifo_path(pinturas):
    import pathops
    acc = None
    for p in pinturas:
        f = _para_skia(p.get("subs") or [], p.get("regra") or "nonzero")
        if p.get("tira"):
            if acc is not None:
                acc = pathops.op(acc, f, pathops.PathOp.DIFFERENCE)
        else:
            acc = f if acc is None else pathops.op(acc, f, pathops.PathOp.UNION)
    if acc is None:
        return None
    return pathops.simplify(acc, fix_winding=True, clockwise=False)


def _nome_glifo(cp):
    from fontTools.agl import UV2AGL
    return UV2AGL.get(cp) or (f"uni{cp:04X}" if cp <= 0xFFFF else f"u{cp:05X}")


def _ps(s):
    return "".join(c for c in s if c.isalnum() or c in "-_")[:60] or "MinhaFonte"


def exportar(spec):
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    fam = (spec.get("familia") or "Minha Fonte").strip()
    estilo = (spec.get("estilo") or "Regular").strip()
    upm, asc, desc = int(spec.get("upm") or 1000), int(spec.get("asc") or 800), int(spec.get("desc") or -200)
    caminho = spec.get("caminho")
    if not caminho:
        return {"success": False, "error": "falta o caminho do .otf"}
    ordem, cmap, cs, metr, avisos = [".notdef"], {}, {}, {}, []
    ymin, ymax = desc, asc
    # .notdef: caixa vazada
    pen = T2CharStringPen(upm // 2, None)
    for (x0, y0, x1, y1, sentido) in ((50, 0, upm // 2 - 50, asc, 1), (100, 50, upm // 2 - 100, asc - 50, -1)):
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)][::sentido]
        pen.moveTo(pts[0]); [pen.lineTo(q) for q in pts[1:]]; pen.closePath()
    cs[".notdef"] = pen.getCharString(); metr[".notdef"] = (upm // 2, 50)
    vistos = set()
    for g in spec.get("glifos") or []:
        car = g.get("car") or ""
        if len(car) != 1:
            avisos.append(f"prancheta '{car}': o nome precisa ser UM caractere"); continue
        cp = ord(car)
        if cp in vistos:
            avisos.append(f"'{car}' repetido: ficou o primeiro"); continue
        vistos.add(cp)
        nome = _nome_glifo(cp)
        larg = max(0, int(round(g.get("larg") or upm // 2)))
        path = _glifo_path(g.get("pinturas") or [])
        pen = T2CharStringPen(larg, None)
        lsb = 0
        if path is not None and len(list(path.contours)):
            path.draw(pen)
            b = path.bounds
            lsb = int(round(b[0])); ymin = min(ymin, int(b[1])); ymax = max(ymax, int(b[3]) + 1)
        elif car != " ":
            avisos.append(f"'{car}' sem desenho (glifo vazio)")
        ordem.append(nome); cmap[cp] = nome; cs[nome] = pen.getCharString(); metr[nome] = (larg, lsb)
    if 32 not in cmap:   # espaço
        pen = T2CharStringPen(upm // 4, None)
        ordem.append("space"); cmap[32] = "space"; cs["space"] = pen.getCharString(); metr["space"] = (upm // 4, 0)
    if len(ordem) < 3:
        return {"success": False, "error": "nenhum glifo: nomeie cada prancheta com o caractere (A, b, 1...)", "avisos": avisos}
    ps = f"{_ps(fam)}-{_ps(estilo)}"
    fb = FontBuilder(upm, isTTF=False)
    fb.setupGlyphOrder(ordem)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(ps, {"FullName": f"{fam} {estilo}", "FamilyName": fam, "Weight": estilo}, cs, {})
    fb.setupHorizontalMetrics(metr)
    fb.setupHorizontalHeader(ascent=asc, descent=desc)
    fb.setupNameTable({"familyName": fam, "styleName": estilo, "uniqueFontIdentifier": f"KANIVETE:{ps}",
                       "fullName": f"{fam} {estilo}", "psName": ps, "version": "Version 1.000",
                       "manufacturer": "Feita no Vetor Kanivete"})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=desc, sTypoLineGap=0, usWinAscent=max(asc, ymax), usWinDescent=max(-desc, -ymin),
                sxHeight=int(spec.get("x") or upm // 2), sCapHeight=int(spec.get("cap") or int(upm * 0.7)),
                usWeightClass=700 if "bold" in estilo.lower() or "negrito" in estilo.lower() else 400,
                fsSelection=0x40 if estilo.lower() in ("regular", "normal") else 0, achVendID="KNV ")
    fb.setupPost()
    os.makedirs(os.path.dirname(os.path.abspath(caminho)) or ".", exist_ok=True)
    fb.save(caminho)
    r = {"success": True, "caminho": caminho, "glifos": len(ordem) - 1, "familia": fam, "estilo": estilo, "ps": ps, "avisos": avisos}
    if spec.get("instalar"):
        r["instalada"] = instalar(caminho, fam, estilo)
    return r


def instalar(caminho, fam, estilo):
    """Copia para %LOCALAPPDATA%\\Microsoft\\Windows\\Fonts do perfil real (sem admin), registra em HKCU e avisa o Windows."""
    import ctypes
    import shutil
    from Functions import fontes
    pasta = fontes._pasta_usuario()
    os.makedirs(pasta, exist_ok=True)
    destino = os.path.join(pasta, os.path.basename(caminho))
    try:
        ctypes.windll.gdi32.RemoveFontResourceW(destino)   # versão anterior em uso (refazer a fonte)
    except Exception:
        pass
    if os.path.abspath(destino) != os.path.abspath(caminho):
        shutil.copyfile(caminho, destino)
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts", 0, winreg.KEY_SET_VALUE) as k:
            winreg.SetValueEx(k, f"{fam} {estilo} (OpenType)", 0, winreg.REG_SZ, destino)
        ctypes.windll.gdi32.AddFontResourceW(destino)
        ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001D, 0, 0, 0x0002, 1000, None)   # WM_FONTCHANGE
    except Exception as e:
        return {"ok": False, "erro": str(e), "arquivo": destino}
    with fontes._lock:
        fontes._cache = None
    return {"ok": True, "arquivo": destino}
