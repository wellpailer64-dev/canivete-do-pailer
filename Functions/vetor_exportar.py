"""Vetor Kanivete: PDF para gráfica (fechamento de arquivo) — escrito à mão (content stream + pikepdf).

Padrões (Instructions/vetor-kanivete.md, "Fechamento"):
- x4  = PDF/X-4:2010 (PDF 1.6): transparência viva, imagens RGB com perfil sRGB, perfil de saída embutido, XMP pdfxid.
- x1a = PDF/X-1a:2001 (PDF 1.3): só CMYK + cores especiais, sem transparência (opacidade/mesclagem ignoradas com aviso).
- cmyk = PDF comum em CMYK (gráfica rápida), rgb = PDF digital (tela).
Em todos os de impressão: textos viram curvas (a mesma geometria da tela), RGB vetorial → CMYK pelo perfil de saída
(preto puro → 0/0/0/100), TrimBox/BleedBox, sangria, marcas de corte em cor de registro (/All), sobreimpressão (OPM 1).
No fim o PDF é RELIDO e conferido (verificar_pdf)."""
import datetime, math, os, zlib

from Functions import vetor_kanivete as vk

MM = 72 / 25.4


def _f(v):
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"


def mmul(m1, m2):
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return [a1 * a2 + b1 * c2, a1 * b2 + b1 * d2, c1 * a2 + d1 * c2, c1 * b2 + d1 * d2, e1 * a2 + f1 * c2 + e2, e1 * b2 + f1 * d2 + f2]


class _Escritor:
    def __init__(self, pdf, doc, op):
        self.pdf, self.doc, self.op = pdf, doc, op
        self.padrao = op.get("padrao", "x4")
        self.impressao = self.padrao != "rgb"
        self.transp = self.padrao in ("x4", "rgb", "cmyk")
        self.perfil = op.get("perfil") or doc.get("perfil") or "FOGRA39"
        self.spots_processo = bool(op.get("spotsParaProcesso"))
        self.avisos = set()
        self.res = {"ExtGState": {}, "ColorSpace": {}, "Shading": {}, "XObject": {}, "Pattern": {}}
        self.D = [1, 0, 0, 1, 0, 0]   # documento → página (definida a cada página)
        self._pad_cache, self._pads_pend = {}, []
        self.cache_rgb = {}
        self._img_cache = {}

    # ── cores ──
    def _rgb_cmyk(self, v):
        k = tuple(int(x) for x in v)
        if k not in self.cache_rgb:
            self.cache_rgb[k] = vk.rgb_para_cmyk([list(k)], self.perfil)[0]
        return self.cache_rgb[k]

    def _sep(self, nome, alt):
        import pikepdf
        chave = "CS" + str(abs(hash((nome, tuple(alt)))) % 10 ** 8)
        if chave not in self.res["ColorSpace"]:
            fn = pikepdf.Dictionary(FunctionType=2, Domain=[0, 1], C0=[0, 0, 0, 0], C1=[round(x / 100, 4) for x in alt], N=1)
            self.res["ColorSpace"][chave] = pikepdf.Array([pikepdf.Name.Separation, pikepdf.Name("/" + nome.replace(" ", "#20") if False else "/" + nome),
                                                           pikepdf.Name.DeviceCMYK, fn])
        return chave

    def cmyk_de(self, c):
        """cor → [c,m,y,k] 0-100 (para degradês e conversões)."""
        if not c: return [0, 0, 0, 0]
        if c["k"] == "cmyk": return list(c["v"])
        if c["k"] == "rgb": return self._rgb_cmyk(c["v"])
        if c["k"] == "spot": t = c.get("tint", 100) / 100; return [x * t for x in c["v"]]
        if c["k"] == "reg": return [100, 100, 100, 100]
        if c["k"] == "grad": return self.cmyk_de(c["paradas"][0]["cor"])
        if c["k"] == "pad":   # padrão: a cor do 1º objeto da peça (efeitos e conversões)
            P = (self.doc.get("padroes") or {}).get(c.get("id")) or {}
            o = next((x for x in P.get("itens", []) if x.get("preench") or (x.get("traco") or {}).get("cor")), None)
            return self.cmyk_de(o.get("preench") or o["traco"]["cor"]) if o else [0, 0, 0, 50]
        return [0, 0, 0, 100]

    def cor_op(self, c, traco=False):
        """→ string de operadores que define a cor (preenchimento ou traço)."""
        if c is None: return ""
        if c["k"] == "pad":
            nome = self._padrao(c)
            return f"/Pattern {'CS' if traco else 'cs'} /{nome} {'SCN' if traco else 'scn'}" if nome else "0 0 0 0.5 " + ("K" if traco else "k")
        if c["k"] == "grad": c = c["paradas"][0]["cor"]; self.avisos.add("traço com degradê saiu na cor da 1ª parada")
        if c["k"] == "rgb" and not self.impressao:
            return " ".join(_f(x / 255) for x in c["v"]) + (" RG" if traco else " rg")
        if c["k"] in ("spot", "reg") and not (c["k"] == "spot" and self.spots_processo):
            nome, alt, t = ("All", [100, 100, 100, 100], 1) if c["k"] == "reg" else (c["nome"], c["v"], c.get("tint", 100) / 100)
            cs = self._sep(nome, alt)
            return f"/{cs} {'CS' if traco else 'cs'} {_f(t)} {'SCN' if traco else 'scn'}"
        v = self.cmyk_de(c)
        if self.impressao or c["k"] != "rgb":
            return " ".join(_f(max(0, min(100, x)) / 100) for x in v) + (" K" if traco else " k")
        return ""

    def _padrao(self, c):
        """Amostra de padrão → tiling pattern colorido (PaintType 1) com a peça em vetor; Matrix = peça → documento → página."""
        import pikepdf
        P = (self.doc.get("padroes") or {}).get(c.get("id"))
        if not P: return None
        s = (c.get("esc") or 100) / 100; r = math.radians(c.get("ang") or 0)
        T = [math.cos(r) * s, math.sin(r) * s, -math.sin(r) * s, math.cos(r) * s, c.get("dx") or 0, c.get("dy") or 0]
        chave = (c["id"], tuple(round(x, 4) for x in T), tuple(round(x, 4) for x in self.D))
        if chave not in self._pad_cache:
            ops = []
            for o in P.get("itens", []): ops += self.objeto(o)
            st = self.pdf.make_stream("\n".join(x for x in ops if x).encode("latin-1"), Type=pikepdf.Name.Pattern, PatternType=1, PaintType=1, TilingType=1,
                                      BBox=[0, 0, P["w"], P["h"]], XStep=P["w"], YStep=P["h"], Matrix=mmul(T, self.D))
            nome = f"P{len(self.res['Pattern']) + 1}"
            self.res["Pattern"][nome] = st; self._pads_pend.append(st); self._pad_cache[chave] = nome
        return self._pad_cache[chave]

    def _gs(self, **kw):
        import pikepdf
        chave = "GS" + str(abs(hash(tuple(sorted(kw.items())))) % 10 ** 8)
        if chave not in self.res["ExtGState"]:
            d = pikepdf.Dictionary(Type=pikepdf.Name.ExtGState)
            for k, v in kw.items():
                d["/" + k] = pikepdf.Name("/" + v) if isinstance(v, str) else v
            self.res["ExtGState"][chave] = d
        return f"/{chave} gs"

    def _shading(self, g):
        import pikepdf
        ps = sorted(g["paradas"], key=lambda p: p["p"])
        if len(ps) == 1: ps = ps + [dict(ps[0], p=1)]
        cores = [[round(x / 100, 4) for x in self.cmyk_de(p["cor"])] for p in ps]
        fns = [pikepdf.Dictionary(FunctionType=2, Domain=[0, 1], C0=cores[i], C1=cores[i + 1], N=1) for i in range(len(ps) - 1)]
        if len(fns) == 1:
            fn = fns[0]
        else:
            fn = pikepdf.Dictionary(FunctionType=3, Domain=[0, 1], Functions=fns, Bounds=[ps[i]["p"] for i in range(1, len(ps) - 1)], Encode=[0, 1] * len(fns))
        if ps[0]["p"] > 0 or ps[-1]["p"] < 1:   # paradas fora das pontas: o Domain cobre [p0, pN]
            fn = pikepdf.Dictionary(FunctionType=3, Domain=[0, 1], Functions=[fn], Bounds=[], Encode=[0, 1]) if False else fn
        if g["tipo"] == "lin":
            a, b = g["a"], g["b"]
            if ps[0]["p"] > 0 or ps[-1]["p"] < 1:
                p0, p1 = ps[0]["p"], ps[-1]["p"]
                a, b = [a[0] + (b[0] - a[0]) * p0, a[1] + (b[1] - a[1]) * p0], [a[0] + (b[0] - a[0]) * p1, a[1] + (b[1] - a[1]) * p1]
            sh = pikepdf.Dictionary(ShadingType=2, ColorSpace=pikepdf.Name.DeviceCMYK, Coords=[a[0], a[1], b[0], b[1]], Function=fn, Extend=[True, True])
        else:
            f = g.get("f") or g["a"]
            sh = pikepdf.Dictionary(ShadingType=3, ColorSpace=pikepdf.Name.DeviceCMYK, Coords=[f[0], f[1], 0, g["a"][0], g["a"][1], g["r"]], Function=fn, Extend=[True, True])
        chave = f"Sh{len(self.res['Shading']) + 1}"
        self.res["Shading"][chave] = self.pdf.make_indirect(sh)
        return chave

    # ── geometria ──
    @staticmethod
    def caminho_ops(subs):
        out = []
        for sb in subs:
            pts = sb["pts"]
            if not pts: continue
            out.append(f"{_f(pts[0][0])} {_f(pts[0][1])} m")
            n = len(pts) if sb.get("fechado") else len(pts) - 1
            for i in range(n):
                a, b = pts[i], pts[(i + 1) % len(pts)]
                if a[4] == a[0] and a[5] == a[1] and b[2] == b[0] and b[3] == b[1]:
                    out.append(f"{_f(b[0])} {_f(b[1])} l")
                else:
                    out.append(f"{_f(a[4])} {_f(a[5])} {_f(b[2])} {_f(b[3])} {_f(b[0])} {_f(b[1])} c")
            if sb.get("fechado"): out.append("h")
        return "\n".join(out)

    def estilo_ops(self, o):
        out = []
        op = o.get("op", 1)
        bm = o.get("bm", "normal")
        sobre = o.get("sobre") or {}
        gs = {}
        if op < 1 or bm != "normal":
            if self.transp:
                if op < 1: gs.update(ca=round(op, 4), CA=round(op, 4))
                if bm != "normal": gs["BM"] = _BM.get(bm, "Normal")
            else:
                self.avisos.add("transparência/mesclagem ignorada (PDF/X-1a não permite: use PDF/X-4)")
        if sobre.get("p") or sobre.get("t"):
            if self.impressao: gs.update(op=bool(sobre.get("p")), OP=bool(sobre.get("t") or sobre.get("p")), OPM=1)
        if gs: out.append(self._gs(**gs))
        return out

    def traco_ops(self, t):
        out = [f"{_f(t.get('larg', 1))} w", f"{['butt', 'round', 'square'].index(t.get('cap', 'butt'))} J",
               f"{['miter', 'round', 'bevel'].index(t.get('junc', 'miter'))} j", f"{_f(t.get('miter', 4))} M"]
        if t.get("tracejado"): out.append("[" + " ".join(_f(x) for x in t["tracejado"]) + f"] {_f(t.get('fase', 0))} d")
        out.append(self.cor_op(t["cor"], True))
        return out

    def pintar(self, subs, regra, preench, traco, est):
        out = ["q"] + est
        geo = self.caminho_ops(subs)
        ev = "*" if regra == "evenodd" else ""
        if preench and preench.get("k") == "grad":
            sh = self._shading(preench)
            out += [geo, f"W{ev} n", f"/{sh} sh", "Q", "q"] + est
            preench = None
        if preench and traco:
            out += [self.cor_op(preench)] + self.traco_ops(traco) + [geo, "B" + ev]
        elif preench:
            out += [self.cor_op(preench), geo, "f" + ev]
        elif traco:
            out += self.traco_ops(traco) + [geo, "S"]
        out.append("Q")
        return out

    def imagem(self, o):
        import pikepdf
        from PIL import Image, ImageCms
        im_d = self.doc.get("imagens", {}).get(o.get("img")) or {}
        arq = im_d.get("arquivo")
        if not arq or not os.path.isfile(arq):
            self.avisos.add("imagem faltando (link quebrado) não saiu no PDF"); return []
        chave = (arq, self.padrao)
        if chave not in self._img_cache:
            im = Image.open(arq); im.load()
            alfa = None
            if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
                im = im.convert("RGBA"); alfa = im.getchannel("A")
                if alfa.getextrema() == (255, 255): alfa = None
                im = im.convert("RGB")
            if im.mode == "CMYK" and im_d.get("mascara") and os.path.isfile(im_d["mascara"]):   # CMYK com transparência (máscara ao lado)
                alfa = Image.open(im_d["mascara"]).convert("L")
                if alfa.size != im.size: alfa = alfa.resize(im.size)
            if im.mode in ("P", "1", "I", "F", "I;16"): im = im.convert("RGB")
            if im.mode == "LA": im = im.convert("L")
            cs = None
            if im.mode == "RGB":
                if self.impressao and self.padrao != "x4":
                    icc = vk.perfil_arquivo(self.perfil)
                    if icc:
                        t = ImageCms.buildTransform(ImageCms.createProfile("sRGB"), ImageCms.getOpenProfile(icc), "RGB", "CMYK", ImageCms.Intent.RELATIVE_COLORIMETRIC, flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)
                        im = ImageCms.applyTransform(im, t)
                    else:
                        im = im.convert("CMYK"); self.avisos.add("sem perfil ICC: imagem convertida para CMYK de forma simples")
                    cs = pikepdf.Name.DeviceCMYK
                else:
                    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
                    cs = pikepdf.Array([pikepdf.Name.ICCBased, self.pdf.make_stream(srgb, N=3, Alternate=pikepdf.Name.DeviceRGB)])
            elif im.mode == "CMYK":
                cs = pikepdf.Name.DeviceCMYK
            elif im.mode == "L":
                cs = pikepdf.Name.DeviceGray
            dados = im.tobytes()
            if im.mode == "CMYK" and arq.lower().endswith((".jpg", ".jpeg")) and False: pass
            xo = self.pdf.make_stream(zlib.compress(dados, 6), Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Image, Width=im.width, Height=im.height,
                                      ColorSpace=cs, BitsPerComponent=8, Filter=pikepdf.Name.FlateDecode)
            if alfa is not None:
                if self.transp:
                    xo["/SMask"] = self.pdf.make_stream(zlib.compress(alfa.tobytes(), 6), Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Image,
                                                        Width=im.width, Height=im.height, ColorSpace=pikepdf.Name.DeviceGray, BitsPerComponent=8, Filter=pikepdf.Name.FlateDecode)
                else:
                    self.avisos.add("imagem com transparência saiu sem a transparência (PDF/X-1a): use PDF/X-4")
            nome = f"Im{len(self.res['XObject']) + 1}"
            self.res["XObject"][nome] = xo
            self._img_cache[chave] = (nome, im.width, im.height)
        nome, W, H = self._img_cache[chave]
        M = mmul([W, 0, 0, -H, 0, H], o["m"])
        return ["q"] + self.estilo_ops(o) + [" ".join(_f(x) for x in M) + " cm", f"/{nome} Do", "Q"]

    # ── efeitos vivos rasterizados (sombra projetada, brilho externo, desfoque) ──
    def _cs_cor(self, c):
        """cor chapada → (espaço de cor, componentes 0-255) para uma imagem; tinta especial continua especial."""
        import pikepdf
        if c and c.get("k") == "grad": c = c["paradas"][0]["cor"]; self.avisos.add("efeito com degradê saiu na cor da 1ª parada")
        if c and c["k"] in ("spot", "reg") and not (c["k"] == "spot" and self.spots_processo):
            nome, alt, t = ("All", [100, 100, 100, 100], 1) if c["k"] == "reg" else (c["nome"], c["v"], c.get("tint", 100) / 100)
            return self.res["ColorSpace"][self._sep(nome, alt)], [round(t * 255)]
        if c and c["k"] == "rgb" and not self.impressao:
            return pikepdf.Name.DeviceRGB, [int(x) for x in c["v"]]
        return pikepdf.Name.DeviceCMYK, [round(max(0, min(100, x)) * 2.55) for x in self.cmyk_de(c or {"k": "cmyk", "v": [0, 0, 0, 100]})]

    def efeito_raster(self, ef, pinturas, cor=None, interno=False):
        """pinturas = [{subs, regra, preench?, traco?}] (pt do documento) → imagem na cor do efeito com a silhueta
        desfocada como SMask (300 ppi). Sombra/brilho: cor do efeito, deslocada; desfoque: cor = a do próprio objeto."""
        import numpy as np, pikepdf, skia
        if not self.transp:
            self.avisos.add("efeitos (sombra/brilho/desfoque) não saem em PDF/X-1a: use PDF/X-4"); return []
        sig = max(0.0, float(ef.get("desfoque") or 0)); dx, dy = float(ef.get("dx") or 0), float(ef.get("dy") or 0)
        xs, ys = [], []
        for p in pinturas:
            w = ((p.get("traco") or {}).get("larg") or 0) / 2
            for sb in p.get("subs") or []:
                for q in sb["pts"]:
                    for i in (0, 2, 4): xs += [q[i] - w, q[i] + w]
                    for i in (1, 3, 5): ys += [q[i] - w, q[i] + w]
        if not xs: return []
        m = 3 * sig + 1
        x0, y0, x1, y1 = min(xs) + dx - m, min(ys) + dy - m, max(xs) + dx + m, max(ys) + dy + m
        esc = float(self.op.get("ppi_efeitos") or 300) / 72
        esc = min(esc, 5000 / max(1e-6, x1 - x0), 5000 / max(1e-6, y1 - y0))
        W, H = max(1, int(math.ceil((x1 - x0) * esc))), max(1, int(math.ceil((y1 - y0) * esc)))
        sup = skia.Surface(W, H); cv = sup.getCanvas(); cv.clear(skia.ColorTRANSPARENT)
        cv.scale(esc, esc); cv.translate(-x0 + dx, -y0 + dy)
        pn = skia.Paint(AntiAlias=True, Color=skia.ColorBLACK)
        if sig > 0 and not interno: pn.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, sig))
        for p in pinturas:
            caminho = vk._sk_path(p["subs"], p.get("regra", "nonzero"))
            if p.get("preench"):
                pn.setStyle(skia.Paint.kFill_Style); cv.drawPath(caminho, pn)
            t = p.get("traco")
            if t and t.get("cor"):
                pn.setStyle(skia.Paint.kStroke_Style); pn.setStrokeWidth(float(t.get("larg") or 1))
                pn.setStrokeCap([skia.Paint.kButt_Cap, skia.Paint.kRound_Cap, skia.Paint.kSquare_Cap][["butt", "round", "square"].index(t.get("cap", "butt"))])
                pn.setStrokeJoin([skia.Paint.kMiter_Join, skia.Paint.kRound_Join, skia.Paint.kBevel_Join][["miter", "round", "bevel"].index(t.get("junc", "miter"))])
                cv.drawPath(caminho, pn)
        alfa = np.ascontiguousarray(sup.makeImageSnapshot().toarray()[:, :, 3])
        if interno:   # brilho interno: o lado de fora desfocado, só dentro da forma
            import cv2
            fora = 255 - alfa
            if sig > 0: fora = cv2.GaussianBlur(fora, (0, 0), sig * esc)
            alfa = np.ascontiguousarray((fora.astype(np.float32) * alfa / 255).astype(np.uint8))
        if not alfa.any(): return []
        cs, comp = self._cs_cor(cor if cor is not None else ef.get("cor") or {"k": "cmyk", "v": [0, 0, 0, 100]})
        cores = np.tile(np.array(comp, dtype=np.uint8), W * H).tobytes()
        mascara = self.pdf.make_stream(zlib.compress(alfa.tobytes(), 6), Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Image, Width=W, Height=H,
                                       ColorSpace=pikepdf.Name.DeviceGray, BitsPerComponent=8, Filter=pikepdf.Name.FlateDecode)
        xo = self.pdf.make_stream(zlib.compress(cores, 9), Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Image, Width=W, Height=H,
                                  ColorSpace=cs, BitsPerComponent=8, Filter=pikepdf.Name.FlateDecode, SMask=mascara)
        nome = f"Im{len(self.res['XObject']) + 1}"
        self.res["XObject"][nome] = xo
        gs = {}
        op = ef.get("op", 1)
        if op < 1: gs.update(ca=round(op, 4), CA=round(op, 4))
        if ef.get("bm") and ef["bm"] != "normal": gs["BM"] = _BM.get(ef["bm"], "Normal")
        M = mmul([W, 0, 0, -H, 0, H], [1 / esc, 0, 0, 1 / esc, x0, y0])
        return ["q"] + ([self._gs(**gs)] if gs else []) + [" ".join(_f(x) for x in M) + " cm", f"/{nome} Do", "Q"]

    def objeto(self, o):
        if o.get("visivel") is False: return []
        efs = [e for e in (o.get("efeitos") or []) if e.get("visivel") is not False and e.get("tipo") in ("sombra", "brilho", "desfoque", "brilho_interno")]
        if efs and o.get("_silh"):   # efeitos vivos: a tela mandou a silhueta (pinturas em pt do documento)
            out = ["q"] + self.estilo_ops(o)
            for e in efs:
                if e["tipo"] in ("sombra", "brilho"): out += self.efeito_raster(e, o["_silh"])
            desf = next((e for e in efs if e["tipo"] == "desfoque"), None)
            if desf:   # o objeto inteiro desfocado: uma imagem por cor
                if any(p.get("img") for p in o["_silh"]): self.avisos.add("desfoque em imagem colocada não sai no PDF (desfoque a foto no Photo Kanivete)")
                for p in o["_silh"]:
                    if p.get("img"): continue
                    if p.get("preench"): out += self.efeito_raster(desf, [dict(p, traco=None)], p["preench"])
                    if p.get("traco") and p["traco"].get("cor"): out += self.efeito_raster(desf, [dict(p, preench=None)], p["traco"]["cor"])
                return out + ["Q"]
            depois = []
            for e in efs:
                if e["tipo"] == "brilho_interno": depois += self.efeito_raster(e, [p for p in o["_silh"] if p.get("preench")], interno=True)
            return out + self.objeto(dict(o, efeitos=None, op=1, bm="normal")) + depois + ["Q"]   # opacidade/mesclagem já valem no q de fora
        if o.get("_pint") is not None:   # Aparência (vários preenchimentos/traços, cantos arredondados): pinturas prontas da tela
            out = []
            for p in o["_pint"]:
                est = self.estilo_ops(dict(op=o.get("op", 1) * p.get("op", 1), bm=p.get("bm") if p.get("bm") not in (None, "normal") else o.get("bm", "normal"), sobre=o.get("sobre")))
                out += self.pintar(p["subs"], p.get("regra", "nonzero"), p.get("preench"), p.get("traco"), est)
            return out
        t = o.get("tipo")
        if t == "grupo" and o.get("opmask"):   # máscara de opacidade: SMask de luminosidade (branco mostra, preto esconde)
            if not self.transp:
                self.avisos.add("máscara de opacidade não sai em PDF/X-1a (transparência): use PDF/X-4")
                return self.objeto(dict(o, opmask=None))
            import pikepdf
            mops = self.objeto(o["opmask"])
            G = 1e5
            form = self.pdf.make_stream("\n".join(x for x in mops if x).encode("latin-1"), Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Form,
                                        BBox=[-G, -G, G, G], Group=pikepdf.Dictionary(S=pikepdf.Name.Transparency, CS=pikepdf.Name.DeviceGray))
            self._pads_pend.append(form)   # recursos da página entram no fim (como os padrões)
            sm = pikepdf.Dictionary(Type=pikepdf.Name.Mask, S=pikepdf.Name.Luminosity, G=form)
            if o.get("opmask_inv"):
                sm["/TR"] = pikepdf.Dictionary(FunctionType=2, Domain=[0, 1], C0=[1], C1=[0], N=1)
            nome = f"GSm{len(self.res['ExtGState']) + 1}"
            self.res["ExtGState"][nome] = pikepdf.Dictionary(Type=pikepdf.Name.ExtGState, SMask=sm)
            out = ["q", f"/{nome} gs"] + self.estilo_ops(o)
            for f in o.get("itens") or []: out += self.objeto(f)
            return out + ["Q"]
        if t == "grupo":
            itens = o.get("itens") or []
            if o.get("clip") and itens:
                cp = itens[0]
                ev = "*" if cp.get("regra") == "evenodd" else ""
                out = ["q", self.caminho_ops(cp.get("subs") or []), f"W{ev} n"]
                for f in itens[1:]: out += self.objeto(f)
                return out + ["Q"]
            out = []
            for f in itens: out += self.objeto(f)
            return out
        if t == "caminho":
            if not (o.get("preench") or o.get("traco")) or not o.get("subs"): return []
            return self.pintar(o["subs"], o.get("regra"), o.get("preench"), o.get("traco"), self.estilo_ops(o))
        if t == "texto":
            geo = vk.texto_geometria(_spec_texto(o))
            if not geo["achou"]: self.avisos.add(f"fonte '{o.get('fam')}' não instalada: saiu em Arial")
            if not geo["subs"]: return []
            m = o.get("m") or [1, 0, 0, 1, 0, 0]
            out = ["q", " ".join(_f(x) for x in m) + " cm"]
            def local(pr):   # degradê do texto está em coordenadas do documento: volta para o espaço local
                if not (pr and pr.get("k") == "grad"): return pr
                inv = _inv(m)
                return dict(pr, a=_pt(inv, pr["a"]), b=_pt(inv, pr.get("b", pr["a"])), **({"f": _pt(inv, pr["f"])} if pr.get("f") else {}),
                            **({"r": pr["r"] / (math.sqrt(abs(m[0] * m[3] - m[1] * m[2])) or 1)} if pr.get("r") else {}))
            tr0 = o.get("traco")
            for pa in geo.get("partes") or [{"subs": geo["subs"]}]:   # trechos com cor própria (estilo de caractere)
                tr = tr0
                if "traco" in pa:
                    tr = (dict(tr0 or {"larg": 1, "cap": "butt", "junc": "miter", "miter": 4}, **pa["traco"]) if pa["traco"] else None)
                out += self.pintar(pa["subs"], "nonzero", local(pa.get("preench", o.get("preench"))), tr, self.estilo_ops(o))
            return out + ["Q"]
        if t == "imagem":
            return self.imagem(o)
        if t == "instancia":   # símbolo: a definição com a matriz da instância
            S = (self.doc.get("simbolos") or {}).get(o.get("simbolo")) or {}
            out = ["q"] + self.estilo_ops(o) + [" ".join(_f(x) for x in (o.get("m") or [1, 0, 0, 1, 0, 0])) + " cm"]
            for f in S.get("itens", []): out += self.objeto(f)
            return out + ["Q"]
        return []


_TX_CAMPOS = ("conteudo", "fam", "estilo", "tam", "entrelinha", "track", "alin", "caixa")


def _spec_texto(o):
    """o spec que a tela montou (estilos, encadeamento e trilha resolvidos: vkTxSpec) ou o básico do objeto."""
    return o.get("_spec") or {k: o.get(k) for k in _TX_CAMPOS}


_BM = {"multiplicacao": "Multiply", "divisao": "Screen", "sobrepor": "Overlay", "luz_suave": "SoftLight", "luz_forte": "HardLight", "escurecer": "Darken",
       "clarear": "Lighten", "diferenca": "Difference", "exclusao": "Exclusion", "subexposicao": "ColorDodge", "superexposicao": "ColorBurn",
       "matiz": "Hue", "saturacao": "Saturation", "cor": "Color", "luminosidade": "Luminosity"}


def _inv(m):
    a, b, c, d, e, f = m
    det = a * d - b * c or 1e-12
    return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]


def _pt(m, p):
    return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]


def _bbox_obj(o):
    """Caixa aproximada (doc) para saber se o objeto toca a prancheta/sangria."""
    t = o.get("tipo")
    if t == "caminho":
        xs = [p[i] for s in o.get("subs", []) for p in s["pts"] for i in (0, 2, 4)]
        ys = [p[i] for s in o.get("subs", []) for p in s["pts"] for i in (1, 3, 5)]
        if not xs: return None
        w = (o.get("traco") or {}).get("larg", 0) / 2 if o.get("traco") else 0
        return (min(xs) - w, min(ys) - w, max(xs) + w, max(ys) + w)
    if t == "grupo":
        cx = [_bbox_obj(f) for f in (o.get("itens") or [])[:1 if o.get("clip") else None]]
        cx = [c for c in cx if c]
        return (min(c[0] for c in cx), min(c[1] for c in cx), max(c[2] for c in cx), max(c[3] for c in cx)) if cx else None
    m = o.get("m") or [1, 0, 0, 1, 0, 0]
    if t == "instancia":
        S = (o.get("_simbolos") or {}).get(o.get("simbolo")) or {}
        cx = [c for c in (_bbox_obj(f) for f in S.get("itens", [])) if c]
        if not cx: return None
        cantos = [_pt(m, (x, y)) for c in cx for x, y in ((c[0], c[1]), (c[2], c[1]), (c[0], c[3]), (c[2], c[3]))]
        return (min(p[0] for p in cantos), min(p[1] for p in cantos), max(p[0] for p in cantos), max(p[1] for p in cantos))
    if t == "imagem":
        im = o.get("_wh") or (1, 1)
        cantos = [_pt(m, p) for p in ((0, 0), (im[0], 0), (0, im[1]), (im[0], im[1]))]
    else:
        g = vk.texto_geometria(_spec_texto(o))
        xs = [p[0] for s in g["subs"] for p in s["pts"]] or [0]; ys = [p[1] for s in g["subs"] for p in s["pts"]] or [0]
        cantos = [_pt(m, p) for p in ((min(xs), min(ys)), (max(xs), min(ys)), (min(xs), max(ys)), (max(xs), max(ys)))]
    return (min(c[0] for c in cantos), min(c[1] for c in cantos), max(c[0] for c in cantos), max(c[1] for c in cantos))


def _marcas(W, b, m, larg, alt):
    """Marcas de corte nos 4 cantos (coordenadas da página, origem embaixo à esquerda), cor de registro."""
    ofs = max(b, 6.0); comp = 15.0
    x0, y0, x1, y1 = m, m, m + larg, m + alt
    out = ["q", "0.25 w", "0 J", f"/{W._sep('All', [100, 100, 100, 100])} CS 1 SCN"]
    for x, y, sx, sy in ((x0, y0, -1, -1), (x1, y0, 1, -1), (x0, y1, -1, 1), (x1, y1, 1, 1)):
        out.append(f"{_f(x + sx * ofs)} {_f(y)} m {_f(x + sx * (ofs + comp))} {_f(y)} l S")
        out.append(f"{_f(x)} {_f(y + sy * ofs)} m {_f(x)} {_f(y + sy * (ofs + comp))} l S")
    return out + ["Q"]


def exportar_pdf(doc, caminho, op=None):
    """op = {padrao: x4|x1a|cmyk|rgb, pranchetas: [ids] (vazio = todas), sangria: pt (padrão = doc.sangria), marcas: bool,
    perfil: FOGRA39|FOGRA29|GRACOL|SWOP, spotsParaProcesso: bool, titulo} → {success, path, paginas, avisos, verificacao}"""
    import pikepdf
    op = dict(op or {})
    padrao = op.get("padrao", "x4")
    b = float(op.get("sangria", doc.get("sangria", 3 * MM)) if padrao != "rgb" else op.get("sangria", 0))
    marcas = bool(op.get("marcas", padrao != "rgb"))
    perfil = op.get("perfil") or doc.get("perfil") or "FOGRA39"
    icc = vk.perfil_arquivo(perfil)
    if padrao in ("x4", "x1a") and not icc:
        return {"success": False, "error": f"perfil ICC {perfil} não encontrado (precisa para PDF/X): instale o perfil ou escolha PDF CMYK"}
    pdf = pikepdf.new()
    W = _Escritor(pdf, doc, {**op, "padrao": padrao, "perfil": perfil})
    for iid, im in (doc.get("imagens") or {}).items():
        im.setdefault("_wh", (im.get("w", 1), im.get("h", 1)))
    alvo = set(op.get("pranchetas") or [])
    abs_ = [a for a in doc.get("pranchetas", []) if not alvo or a["id"] in alvo]
    if not abs_:
        return {"success": False, "error": "nenhuma prancheta para exportar"}
    m = b + (6 + 15 + 3 if marcas else 0) if padrao != "rgb" or marcas else b
    if marcas: m = max(b, 6.0) + 15 + 3
    for ab in abs_:
        PW, PH = ab["w"] + 2 * m, ab["h"] + 2 * m
        D = [1, 0, 0, -1, m - ab["x"], PH - m + ab["y"]]
        W.D = D
        corpo = ["q", " ".join(_f(x) for x in D) + " cm"]
        x0, y0, x1, y1 = ab["x"] - b, ab["y"] - b, ab["x"] + ab["w"] + b, ab["y"] + ab["h"] + b
        for cam in doc.get("camadas", []):
            if cam.get("visivel") is False or cam.get("imprimir") is False: continue
            for o in cam.get("itens", []):
                try:
                    bb = _bbox_obj({**o, "_wh": (doc.get("imagens", {}).get(o.get("img"), {}) or {}).get("_wh")} if o.get("tipo") == "imagem" else {**o, "_simbolos": doc.get("simbolos")} if o.get("tipo") == "instancia" else o)
                except Exception:
                    bb = None
                if bb and (bb[2] < x0 or bb[0] > x1 or bb[3] < y0 or bb[1] > y1): continue
                corpo += W.objeto(o)
        corpo.append("Q")
        if marcas: corpo += _marcas(W, b, m, ab["w"], ab["h"])
        res = pikepdf.Dictionary()
        for k, v in W.res.items():
            if v: res["/" + k] = pikepdf.Dictionary({"/" + n: x for n, x in v.items()})
        for st in W._pads_pend: st.Resources = res   # a peça do padrão usa os mesmos recursos (cores especiais, transparência)
        W._pads_pend = []
        pg = pikepdf.Dictionary(Type=pikepdf.Name.Page, MediaBox=[0, 0, PW, PH], CropBox=[0, 0, PW, PH],
                                TrimBox=[m, m, m + ab["w"], m + ab["h"]],
                                BleedBox=[max(0, m - b), max(0, m - b), min(PW, m + ab["w"] + b), min(PH, m + ab["h"] + b)],
                                Resources=res, Contents=pdf.make_stream("\n".join(c for c in corpo if c).encode("latin-1")))
        pdf.pages.append(pikepdf.Page(pg))
    # metadados / PDF/X
    agora = datetime.datetime.now().astimezone()
    data_pdf = agora.strftime("D:%Y%m%d%H%M%S") + agora.strftime("%z")[:3] + "'" + agora.strftime("%z")[3:] + "'"
    titulo = op.get("titulo") or doc.get("nome") or "Vetor Kanivete"
    info = pikepdf.Dictionary(Title=titulo, Creator="Vetor Kanivete", Producer="Vetor Kanivete (pikepdf)", CreationDate=data_pdf, ModDate=data_pdf,
                              Trapped=pikepdf.Name.False_)
    if padrao == "x1a":
        info["/GTS_PDFXVersion"] = "PDF/X-1:2001"; info["/GTS_PDFXConformance"] = "PDF/X-1a:2001"
    elif padrao == "x4":
        info["/GTS_PDFXVersion"] = "PDF/X-4"
    pdf.trailer["/Info"] = pdf.make_indirect(info)
    if icc and padrao != "rgb":
        nome_cond, ident = vk.PERFIS[perfil][1], vk.PERFIS[perfil][2]
        perfil_st = pdf.make_stream(open(icc, "rb").read(), N=4)
        pdf.Root.OutputIntents = pikepdf.Array([pikepdf.Dictionary(Type=pikepdf.Name.OutputIntent, S=pikepdf.Name.GTS_PDFX,
                                                                   OutputConditionIdentifier=ident, OutputCondition=nome_cond, RegistryName="http://www.color.org",
                                                                   Info=nome_cond, DestOutputProfile=perfil_st)])
    if padrao in ("x4", "x1a", "cmyk"):
        import uuid
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            meta["dc:title"] = titulo
            meta["xmp:CreatorTool"] = "Vetor Kanivete"
            meta["pdf:Producer"] = "Vetor Kanivete (pikepdf)"
            meta["pdf:Trapped"] = "False"
            iso = agora.isoformat(timespec="seconds")
            meta["xmp:CreateDate"] = iso; meta["xmp:ModifyDate"] = iso; meta["xmp:MetadataDate"] = iso
            meta["xmpMM:DocumentID"] = "uuid:" + str(uuid.uuid4()); meta["xmpMM:InstanceID"] = "uuid:" + str(uuid.uuid4())
            meta["xmpMM:VersionID"] = "1"; meta["xmpMM:RenditionClass"] = "default"
            if padrao == "x4":
                meta["{http://www.npes.org/pdfx/ns/id/}GTS_PDFXVersion"] = "PDF/X-4"
            elif padrao == "x1a":
                meta["{http://www.npes.org/pdfx/ns/id/}GTS_PDFXVersion"] = "PDF/X-1:2001"
                meta["{http://www.npes.org/pdfx/ns/id/}GTS_PDFXConformance"] = "PDF/X-1a:2001"
    os.makedirs(os.path.dirname(os.path.abspath(caminho)) or ".", exist_ok=True)
    versao = {"x1a": "1.3", "x4": "1.6"}.get(padrao, "1.6")
    pdf.save(caminho, force_version=versao, object_stream_mode=pikepdf.ObjectStreamMode.disable if padrao == "x1a" else pikepdf.ObjectStreamMode.preserve,
             fix_metadata_version=False)
    verif = verificar_pdf(caminho, padrao)
    return {"success": True, "path": caminho, "paginas": len(abs_), "avisos": sorted(W.avisos), "verificacao": verif}


def verificar_pdf(caminho, padrao="x4"):
    """Relê o PDF gerado e confere o fechamento: caixas, perfil de saída, espaços de cor, transparência, fontes.
    → {ok, problemas: [..], info: {...}}"""
    import pikepdf
    probs, info = [], {"paginas": 0, "cores": set(), "spots": set(), "imagens": 0, "fontes": 0, "transparencia": False}
    pdf = pikepdf.open(caminho)
    if padrao in ("x4", "x1a"):
        oi = pdf.Root.get("/OutputIntents")
        if not oi or "/DestOutputProfile" not in oi[0]: probs.append("sem OutputIntent com perfil de saída")
        if "/GTS_PDFXVersion" not in pdf.trailer.Info: probs.append("sem GTS_PDFXVersion no Info")
        if pdf.trailer.get("/ID") is None: probs.append("sem /ID no trailer")
    for pg in pdf.pages:
        info["paginas"] += 1
        cx = lambda k: [float(v) for v in pg.obj.get(k, pg.obj.MediaBox)]
        mb, bb, tb = cx("/MediaBox"), cx("/BleedBox"), cx("/TrimBox")
        if "/TrimBox" not in pg.obj: probs.append(f"página {info['paginas']}: sem TrimBox")
        dentro = lambda a, b_: a[0] >= b_[0] - 0.01 and a[1] >= b_[1] - 0.01 and a[2] <= b_[2] + 0.01 and a[3] <= b_[3] + 0.01
        if not dentro(tb, bb) or not dentro(bb, mb): probs.append(f"página {info['paginas']}: caixas fora de ordem (Trim ⊂ Bleed ⊂ Media)")
        for operandos, op in pikepdf.parse_content_stream(pg):
            o = str(op)
            if o in ("rg", "RG"): info["cores"].add("RGB")
            elif o in ("k", "K"): info["cores"].add("CMYK")
            elif o in ("g", "G"): info["cores"].add("Cinza")
        res = pg.Resources
        for nome, cs in (res.get("/ColorSpace") or {}).items():
            if isinstance(cs, pikepdf.Array) and str(cs[0]) == "/Separation":
                info["spots"].add(str(cs[1])[1:])
        for nome, eg in (res.get("/ExtGState") or {}).items():
            if float(eg.get("/ca", 1)) < 1 or float(eg.get("/CA", 1)) < 1 or str(eg.get("/BM", "/Normal")) not in ("/Normal", "/Compatible"):
                info["transparencia"] = True
        for nome, xo in (res.get("/XObject") or {}).items():
            if str(xo.get("/Subtype")) == "/Image":
                info["imagens"] += 1
                cs = xo.get("/ColorSpace")
                csn = str(cs[0]) if isinstance(cs, pikepdf.Array) else str(cs)
                if csn in ("/DeviceRGB",) or (csn == "/ICCBased" and int(cs[1].get("/N", 3)) == 3): info["cores"].add("RGB (imagem)")
                if "/SMask" in xo: info["transparencia"] = True
        info["fontes"] += len(res.get("/Font") or {})
    if padrao == "x1a":
        if any(c.startswith("RGB") for c in info["cores"]): probs.append("PDF/X-1a com RGB")
        if info["transparencia"]: probs.append("PDF/X-1a com transparência")
    if padrao in ("x1a", "cmyk") and "RGB" in info["cores"]: probs.append("cor RGB no PDF de impressão")
    if padrao == "x4" and "RGB" in info["cores"]: probs.append("cor RGB vetorial no PDF/X-4 (devia ter virado CMYK)")
    if info["fontes"]: probs.append(f"{info['fontes']} fontes no PDF (os textos deviam estar em curvas)")
    info["cores"] = sorted(info["cores"]); info["spots"] = sorted(info["spots"])
    info["versao"] = pdf.pdf_version
    return {"ok": not probs, "problemas": probs, "info": info}
