"""
slider_html.py — Slider Kanivete › Exportar › "Apresentação (HTML)": UM arquivo .html que apresenta em qualquer aparelho
(PC, Mac, celular, tablet, navegador da TV), sem instalar nada.

O slide é montado no app (frontend/js/slider-html.js: o mesmo desenho da apresentação, com as mídias trocadas por
marcas data-m) e chega aqui num pacote. Aqui: as mídias vão para dentro do arquivo em base64 (fotos enxutas a 2× o tamanho
em que aparecem, GIF como está, vídeo em MP4 H.264 — o único que toca em todo celular), as fontes usadas vão embutidas
só com as letras do texto (subconjunto WOFF2) e tudo entra no reprodutor frontend/slider-player/player.html.
"""

import base64
import io
import json
import os
import sys
import time

from Functions import slider_kanivete as sk

MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
        ".svg": "image/svg+xml", ".bmp": "image/bmp", ".avif": "image/avif", ".mp4": "video/mp4", ".m4v": "video/mp4"}


def _modelo():
    base = getattr(sys, "_MEIPASS", None) or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(base, "frontend", "slider-player", "player.html"), encoding="utf-8") as f:
        return f.read()


def _midia(caminho, info):
    """(arquivo pronto, mime): foto enxuta (_img_otim), vídeo em H.264 (_video_pptx)."""
    if info.get("tipo") == "video":
        arq = sk._video_pptx(caminho)[0]
        return arq, "video/mp4"
    arq = sk._img_otim(caminho, info.get("w") or 1920, info.get("h") or 1080, 2.0)
    ext = os.path.splitext(arq)[1].lower()
    if ext in (".bmp", ".avif", ".tif", ".tiff"):        # o celular não abre: vira PNG
        from PIL import Image
        buf = io.BytesIO()
        Image.open(arq).save(buf, "PNG", optimize=True)
        return buf.getvalue(), "image/png"
    return arq, MIME.get(ext, "image/png")


def _arquivos_fonte(familia, pesos, italico):
    """[(arquivo, peso css, estilo css)] da família: variável = um arquivo para todos os pesos; estática = o arquivo mais
    perto de cada peso usado (e o itálico, se houver texto itálico)."""
    from Functions import fontes
    est = fontes.listar() or {}
    lista = est.get(familia) or est.get(next((k for k in est if k.lower() == (familia or "").lower()), ""), [])
    out, vistos = [], set()
    for ital in ([False, True] if italico else [False]):
        cands = [e for e in lista if e.get("arquivo") and not e.get("indice") and bool(e.get("italico")) == ital]
        if not cands and ital:
            continue
        cands = cands or [e for e in lista if e.get("arquivo") and not e.get("indice")]
        var = next((e for e in cands if e.get("var")), None)
        if var:
            if var["arquivo"] not in vistos:
                vistos.add(var["arquivo"])
                out.append((var["arquivo"], f"{int(var['var'][0])} {int(var['var'][1])}", "italic" if ital else "normal"))
            continue
        for p in pesos or [400]:
            e = min(cands, key=lambda e: abs((e.get("peso") or 400) - p)) if cands else None
            if e and e["arquivo"] not in vistos:
                vistos.add(e["arquivo"])
                out.append((e["arquivo"], str(e.get("peso") or 400), "italic" if ital else "normal"))
    return out


def _subconjunto(arquivo, texto):
    """WOFF2 só com as letras usadas (+ básicas): Inter de 800 KB vira ~20 KB. Falhou: o arquivo inteiro."""
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
        op = subset.Options()
        op.flavor = "woff2"
        op.layout_features = ["*"]
        op.name_IDs = ["*"]
        op.notdef_outline = True
        f = TTFont(arquivo)
        s = subset.Subsetter(op)
        s.populate(text=texto + "0123456789 .,;:!?-–—()\"'%/+&@#…“”‘’ºª")
        s.subset(f)
        buf = io.BytesIO()
        f.flavor = "woff2"
        f.save(buf)
        return buf.getvalue(), "font/woff2", "woff2"
    except Exception:
        with open(arquivo, "rb") as fh:
            dados = fh.read()
        ext = os.path.splitext(arquivo)[1].lower()
        return dados, "font/otf" if ext == ".otf" else "font/ttf", "opentype" if ext == ".otf" else "truetype"


def _css_fontes(fontes_usadas, texto):
    """(css, famílias sem arquivo neste PC — no outro aparelho entra uma parecida)"""
    css, faltam = [], []
    for fam, o in (fontes_usadas or {}).items():
        arqs = _arquivos_fonte(fam, sorted(set(o.get("pesos") or [400])), o.get("italico"))
        if not arqs:
            faltam.append(fam)
        for arq, peso, estilo in arqs:
            dados, mime, fmt = _subconjunto(arq, texto)
            css.append(f'@font-face{{font-family:"{fam}";src:url(data:{mime};base64,{base64.b64encode(dados).decode()}) '
                       f'format("{fmt}");font-weight:{peso};font-style:{estilo};font-display:block}}')
    return "\n".join(css), faltam


def _gravar_b64(f, origem):
    """base64 em pedaços de 3 MB (múltiplo de 3: os pedaços emendam sem "=" no meio) direto no arquivo, sem segurar o
    vídeo inteiro codificado na memória."""
    if isinstance(origem, bytes):
        f.write(base64.b64encode(origem).decode())
        return
    with open(origem, "rb") as src:
        while True:
            b = src.read(3 * 1024 * 1024)
            if not b:
                break
            f.write(base64.b64encode(b).decode())


def exportar(caminho, pacote, prog=lambda p, m: None):
    """pacote = {nome, largura, altura, slides: [{html, ...meta}], midias: {caminho: {id, w, h, tipo}}, fontes, texto}."""
    midias = pacote.get("midias") or {}
    avisos = []
    prog(0.03, "Fontes")
    css, faltam = _css_fontes(pacote.get("fontes"), pacote.get("texto") or "")
    if faltam:
        avisos.append("fonte não encontrada neste PC (o outro aparelho usa uma parecida): " + ", ".join(faltam))
    dados = {k: pacote.get(k) for k in ("nome", "largura", "altura", "slides")}
    dados["chave"] = f"{pacote.get('nome') or 'apresentacao'}-{int(time.time())}"
    json_txt = json.dumps(dados, ensure_ascii=False).replace("</", "<\\/")
    nome = (pacote.get("nome") or "Apresentação").replace("<", "").replace("&", "e")
    cabeca, cauda = _modelo().split("<!--__MIDIAS__-->")
    cabeca = cabeca.replace("__TITULO__", nome).replace("/*__FONTES__*/", css).replace("__DADOS__", json_txt)
    # gravado em partes (cabeça, cada mídia, reprodutor): uma palestra com vídeos de 300 MB não passa pela memória inteira
    tmp = caminho + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(cabeca)
            for k, (src, info) in enumerate(midias.items()):
                prog(0.05 + 0.9 * k / max(1, len(midias)), f"Mídia {k + 1} de {len(midias)}" + (" (vídeo)" if info.get("tipo") == "video" else ""))
                if not os.path.isfile(src):
                    avisos.append(f"mídia não encontrada: {os.path.basename(src)}")
                    continue
                arq, mime = _midia(src, info)
                f.write(f'<script type="text/plain" id="{info["id"]}" data-tipo="{mime}">')
                _gravar_b64(f, arq)
                f.write("</script>\n")
            f.write(cauda)
        os.replace(tmp, caminho)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    mb = os.path.getsize(caminho) / 1e6
    if mb > 150:
        avisos.append(f"arquivo grande ({mb:.0f} MB): no celular pode demorar para abrir; vídeos mais curtos ajudam")
    return {"success": True, "path": caminho, "tamanho": f"{mb:.1f} MB" if mb >= 1 else f"{mb * 1000:.0f} KB", "avisos": avisos}
