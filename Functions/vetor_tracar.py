"""Traçado de imagem do Vetor Kanivete (Image Trace do Illustrator, melhorado).

Motor: VTracer (visioncortex, MIT) — curvas por cor com hierarquia empilhada ou recortada. Por cima, o que o Illustrator
não faz: limpeza por IA antes de traçar (Real-ESRGAN "arte" 4× em imagem pequena ou JPEG: o logo do WhatsApp vira
contorno limpo), fundo tirado por preenchimento a partir da borda (sem retângulo branco), N cores exatas (k-means em Lab
antes) e o resultado já em formas soltas por cor (sem Expandir nem Desagrupar). Comparação com o motor antigo e medidas:
Instructions/vetor-kanivete.md › "Traçado de imagem v2"; bancada em D:/kanivete_testes/trace.
"""
import io
import os
import re

# predefinições (nomes como os do Illustrator). Parâmetros do VTracer calibrados na imagem de trabalho (~1600–2400 px)
PREDEF = {
    "logo":      {"nome": "Logo colorido (padrão)", "cor": True, "speckle": 16, "precisao": 6, "camadas": 24, "canto": 60},
    "foto_alta": {"nome": "Foto alta fidelidade", "cor": True, "speckle": 4, "precisao": 7, "camadas": 8, "canto": 60, "limpar": False},
    "foto_baixa": {"nome": "Foto baixa fidelidade", "cor": True, "speckle": 24, "precisao": 5, "camadas": 40, "canto": 60, "limpar": False},
    "cores3":    {"nome": "3 cores", "cores": 3, "speckle": 16, "canto": 60},
    "cores6":    {"nome": "6 cores", "cores": 6, "speckle": 16, "canto": 60},
    "cores16":   {"nome": "16 cores", "cores": 16, "speckle": 12, "canto": 60},
    "cinza":     {"nome": "Tons de cinza", "cores": 8, "cinza": True, "speckle": 12, "canto": 60},
    "pb":        {"nome": "Logo preto e branco", "pb": True, "speckle": 16, "canto": 60},
    "silhueta":  {"nome": "Silhueta", "pb": True, "silhueta": True, "speckle": 48, "canto": 90},
    "traco":     {"nome": "Arte de linha", "pb": True, "speckle": 8, "canto": 45},
    "tecnico":   {"nome": "Desenho técnico", "pb": True, "speckle": 8, "canto": 30, "poligono": True},
}
LADO_MIN, LADO_MAX = 1600, 2400


def predefinicoes():
    return {k: v["nome"] for k, v in PREDEF.items()}


def _carregar(arquivo, limpar):
    """→ (imagem RGBA de trabalho, fator trabalho→original, se limpou com IA)."""
    from PIL import Image
    im = Image.open(arquivo); im.load()
    W0, H0 = im.size
    lado = max(W0, H0)
    jpeg = (im.format or "").upper() in ("JPEG", "WEBP") or os.path.splitext(arquivo)[1].lower() in (".jpg", ".jpeg", ".webp")
    ia = False
    if limpar is True or (limpar == "auto" and (lado < 1200 or jpeg)):
        try:
            from Functions import ampliar_imagem
            esc = 4 if lado <= 600 else 2
            r = ampliar_imagem.ampliar(arquivo, esc, "arte")
            if r.get("success"):
                im = Image.open(r["path"]); im.load(); ia = True
        except Exception:
            pass
    im = im.convert("RGBA")
    lado = max(im.size)
    alvo = LADO_MIN if lado < LADO_MIN else LADO_MAX if lado > LADO_MAX else lado
    if alvo != lado:
        f = alvo / lado
        im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
    return im, W0 / im.width, ia


def _tirar_fundo(rgba, tol=28):
    """Fundo = cor que domina a borda, alcançada a partir da borda (preenchimento com tolerância) → transparente.
    Só se a borda for quase toda dessa cor (logo sobre fundo liso); o branco DENTRO das letras fica."""
    import cv2, numpy as np
    a = np.array(rgba)
    if (a[..., 3] < 128).mean() > 0.02:   # já tem transparência: o fundo já está fora
        return rgba, False
    rgb = np.ascontiguousarray(a[..., :3])
    borda = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(int)
    med = np.median(borda, 0)
    perto = np.abs(borda - med).max(1) <= tol
    if perto.mean() < 0.6:
        return rgba, False
    # fundo = pixels da cor da borda LIGADOS à borda; antes, o contorno do desenho é fechado (frestas de até ~6 px do
    # antisserrilhado/JPEG): sem isso o branco de fora entrava no branco DE DENTRO das letras e elas saíam ocas
    cand = (np.abs(rgb.astype(int) - med).max(2) <= tol).astype(np.uint8)
    lado = max(rgb.shape[:2]); k = max(5, lado // 300) | 1
    barreira = cv2.morphologyEx(1 - cand, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    livre = cand & (1 - barreira)
    n, rot = cv2.connectedComponents(livre, connectivity=4)
    bordas = np.unique(np.concatenate([rot[0], rot[-1], rot[:, 0], rot[:, -1]]))
    fundo = np.isin(rot, bordas[bordas > 0])
    # devolve ao fundo o anel que o fechamento comeu (só o que é cor de fundo e encosta nele)
    anel = cv2.dilate(fundo.astype(np.uint8), np.ones((k, k), np.uint8)) > 0
    fundo = fundo | (anel & (cand > 0) & (barreira > 0) & ~(cv2.morphologyEx(1 - cand, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0))
    a[fundo, 3] = 0
    from PIL import Image
    return Image.fromarray(a, "RGBA"), True


def _quantizar(rgba, n, cinza=False):
    """N cores exatas (k-means em Lab nos pixels visíveis): o VTracer não escolhe o número de cores."""
    import cv2, numpy as np
    from PIL import Image
    a = np.array(rgba)
    rgb = np.ascontiguousarray(a[..., :3])
    if cinza:
        g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY); rgb = np.dstack([g, g, g])
    rgb = cv2.bilateralFilter(rgb, 7, 40, 7)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    vis = a[..., 3].reshape(-1) > 127
    am = lab[vis]
    if len(am) > 200000:
        am = am[np.random.default_rng(1).choice(len(am), 200000, replace=False)]
    k = max(2, min(32, int(n)))
    _, _, cen = cv2.kmeans(am, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    rot = np.empty(len(lab), np.int32)
    for i in range(0, len(lab), 500000):   # em blocos: 5 Mpx × 32 cores não estoura a memória
        rot[i:i + 500000] = ((lab[i:i + 500000, None, :] - cen[None]) ** 2).sum(-1).argmin(1)
    cen_rgb = cv2.cvtColor(cen.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2RGB).reshape(-1, 3)
    a[..., :3] = cen_rgb[rot].reshape(a.shape[0], a.shape[1], 3)
    a[..., 3] = np.where(a[..., 3] > 127, 255, 0)
    return Image.fromarray(a, "RGBA"), [[int(x) for x in c] for c in cen_rgb]


def _binarizar(rgba, silhueta=False):
    """Preto e branco: o que é escuro (Otsu) vira preto; silhueta = tudo que não é fundo vira preto."""
    import cv2, numpy as np
    from PIL import Image
    a = np.array(rgba)
    vis = a[..., 3] > 127
    if silhueta:
        tinta = vis
    else:
        g = cv2.cvtColor(np.ascontiguousarray(a[..., :3]), cv2.COLOR_RGB2GRAY)
        g = cv2.GaussianBlur(g, (3, 3), 0)
        lim, _ = cv2.threshold(g[vis] if vis.any() else g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        tinta = vis & (g <= lim)
    out = np.zeros_like(a); out[tinta] = (0, 0, 0, 255)
    return Image.fromarray(out, "RGBA")


def tracar(arquivo, op=None):
    """Imagem → formas vetoriais. op = {predef (PREDEF), cores (N, sobrepõe), limpar ('auto'|True|False),
    fundo (True = tira o fundo liso), modo ('empilhado' | 'recortado': formas encostadas, sem sobrepor — plotter/vinil),
    detalhe (0..100: mais = guarda pontinhos), suavidade (0..100: mais = cantos mais redondos), ignorar_branco}
    → {success, w, h (px da imagem original), limpou_ia, fundo_tirado, formas: [{rgb, subs}] de baixo para cima,
       subs em px da imagem original (pts [x, y, inX, inY, outX, outY])}."""
    import vtracer
    from Functions.vetor_importar import svg_path
    op = dict(op or {})
    P = dict(PREDEF.get(op.get("predef") or "logo", PREDEF["logo"]))
    if op.get("cores"): P.update(cores=int(op["cores"]), cor=False)
    if not os.path.isfile(arquivo):
        return {"success": False, "error": f"arquivo não existe: {arquivo}"}
    limpar = op.get("limpar", P.get("limpar", "auto"))
    im, fator, ia = _carregar(arquivo, limpar)
    tirou, paleta = False, [[0, 0, 0]] if P.get("pb") else None
    if op.get("fundo", P.get("limpar", True) is not False):   # foto: o fundo faz parte da imagem
        im, tirou = _tirar_fundo(im)
    if P.get("pb"):
        im = _binarizar(im, P.get("silhueta"))
    elif P.get("cores"):
        im, paleta = _quantizar(im, P["cores"], P.get("cinza"))
    speckle = P.get("speckle", 16)
    if op.get("detalhe") is not None:   # 0..100 → 64..1 px² (logarítmico)
        speckle = max(1, round(64 * (1 / 64) ** (max(0, min(100, float(op["detalhe"]))) / 100)))
    canto = P.get("canto", 60)
    if op.get("suavidade") is not None:
        canto = round(20 + 1.4 * max(0, min(100, float(op["suavidade"]))))
    buf = io.BytesIO(); im.save(buf, "PNG")
    exatas = bool(P.get("pb") or P.get("cores"))
    svg = vtracer.convert_raw_image_to_svg(
        buf.getvalue(), img_format="png", colormode="color",
        hierarchical="cutout" if op.get("modo") == "recortado" else "stacked",
        mode="polygon" if P.get("poligono") else "spline",
        filter_speckle=int(speckle), color_precision=8 if exatas else int(P.get("precisao", 6)),
        layer_difference=1 if exatas else int(P.get("camadas", 24)), corner_threshold=int(canto),
        length_threshold=4.0, splice_threshold=45, path_precision=3)
    formas = []
    for m in re.finditer(r'<path d="([^"]*)" fill="#([0-9A-Fa-f]{6})"(?: transform="translate\(([-\d.]+),([-\d.]+)\)")?', svg):
        d, cor, tx, ty = m.group(1), m.group(2), float(m.group(3) or 0), float(m.group(4) or 0)
        subs = svg_path(d)
        for s in subs:
            s["pts"] = [[round((v + (tx if i % 2 == 0 else ty)) * fator, 3) for i, v in enumerate(p)] for p in s["pts"]]
        if subs:
            rgb = [int(cor[i:i + 2], 16) for i in (0, 2, 4)]
            if paleta:   # o VTracer tira a média ao juntar regiões: volta para a cor exata escolhida
                rgb = min(paleta, key=lambda c: sum((c[i] - rgb[i]) ** 2 for i in range(3)))
            if op.get("ignorar_branco") and min(rgb) >= 240:
                continue   # branco = papel (como o "Ignorar branco" do Illustrator; no modo recortado vira furo de verdade)
            formas.append({"rgb": rgb, "subs": subs})
    from PIL import Image
    W0, H0 = Image.open(arquivo).size
    return {"success": True, "w": W0, "h": H0, "limpou_ia": ia, "fundo_tirado": tirou, "formas": formas}
