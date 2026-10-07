"""Ponte com o Adobe Illustrator instalado (COM + ExtendScript) — .ai NATIVO, com todas as pranchetas.

Por que: o .ai "compatível" (PDF) do Vetor abre no Illustrator só com a 1ª página como vetor (pedir todas as páginas
importa cada uma como IMAGEM — testado no Illustrator 30.8) e o texto quebrava em letras. Com o Illustrator na máquina,
o Vetor monta o documento lá: pranchetas (nome, tamanho, posição), camadas (nome, visível, travada, imprime), caminhos
e caminhos compostos (par-ímpar), cores CMYK/RGB/especiais (tinta), degradê linear/radial, traço (espessura, pontas,
cantos, tracejado), opacidade, mesclagem, sobreimpressão, grupos e máscaras de corte, texto de ponto e de área
EDITÁVEL (fonte, corpo, entrelinha, tracking, alinhamento, trechos com cor/estilo), imagens incorporadas e símbolos
(definição + instâncias). O que não tem par direto (efeitos vivos, aparência, malha, padrão, texto em caminho, 3D...)
entra como PDF vetorial daquele objeto incorporado no lugar (fica com a mesma cara; edita como grupo).
"""
import json
import math
import os
import tempfile

from Functions import vetor_exportar as vx
from Functions import vetor_kanivete as vk

_BM = {"multiplicacao": "MULTIPLY", "divisao": "SCREEN", "sobrepor": "OVERLAY", "luz_suave": "SOFTLIGHT", "luz_forte": "HARDLIGHT",
       "escurecer": "DARKEN", "clarear": "LIGHTEN", "diferenca": "DIFFERENCE", "exclusao": "EXCLUSION", "subexposicao": "COLORDODGE",
       "superexposicao": "COLORBURN", "matiz": "HUE", "saturacao": "SATURATIONBLEND", "cor": "COLORBLEND", "luminosidade": "LUMINOSITY"}


def disponivel():
    try:
        import winreg
        winreg.CloseKey(winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r"Illustrator.Application\CLSID"))
        return True
    except Exception:
        return False


def _app():
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    return win32com.client.Dispatch("Illustrator.Application")


def _frente():
    """traz a janela do Illustrator para a frente (Abrir no Illustrator)."""
    try:
        import win32con
        import win32gui
        achou = []
        win32gui.EnumWindows(lambda h, _: achou.append(h) if win32gui.IsWindowVisible(h) and "Adobe Illustrator" in win32gui.GetWindowText(h) else None, None)
        if achou:
            win32gui.ShowWindow(achou[0], win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(achou[0])
    except Exception:
        pass


_PS = {}


def _ps(fam, estilo):
    k = (fam, estilo)
    if k not in _PS:
        try:
            from fontTools.ttLib import TTFont
            arq, ind, _ = vk.fonte_arquivo(fam, estilo or "Regular")
            _PS[k] = TTFont(arq, fontNumber=ind, lazy=True)["name"].getDebugName(6) or ""
        except Exception:
            _PS[k] = ""
    return _PS[k]


# ─────────────────────────── o que vai nativo × PDF incorporado ───────────────────────────
def _cor_ok(c):
    return c is None or (isinstance(c, dict) and c.get("k") in ("cmyk", "rgb", "spot", "reg"))


def _sombra_preta(e):
    c = e.get("cor") or {"k": "cmyk", "v": [0, 0, 0, 100]}
    if c.get("k") == "cmyk":
        return c["v"][3] >= 70 and max(c["v"][:3]) <= 30
    if c.get("k") == "rgb":
        return max(c["v"]) <= 60
    return False


def _sombras(o):
    """efeitos que viram Sombra projetada VIVA no Illustrator (só sombras pretas; o resto vai incorporado)."""
    efs = [e for e in (o.get("efeitos") or []) if e.get("visivel") is not False]
    if efs and all(e.get("tipo") == "sombra" and _sombra_preta(e) for e in efs):
        return efs
    return None


def _nativo(o, simbolos):
    if o.get("_pint") is not None or (o.get("efeitos") and not _sombras(o)) or o.get("aparencia") or o.get("pincel") or o.get("mescla"):
        return False
    t = o.get("tipo")
    if t == "caminho":
        p, tr = o.get("preench"), o.get("traco")
        if not (_cor_ok(p) or (p.get("k") == "grad" and p.get("tipo") in ("lin", "rad"))):
            return False
        if tr and (not _cor_ok(tr.get("cor")) or tr.get("perfil") or tr.get("seta_ini") or tr.get("seta_fim")):
            return False
        return bool(o.get("subs"))
    if t == "grupo":
        its = o.get("itens") or []
        if o.get("clip") and (not its or its[0].get("tipo") != "caminho"):
            return False
        return True   # filhos decidem um a um
    if t == "texto":
        if o.get("traco") or o.get("trilha") or o.get("anterior") or o.get("seguinte") or not _cor_ok(o.get("preench")) or o.get("eixos"):
            return False
        sp = vx._spec_texto(o)
        if any(not _cor_ok(tr.get("preench", None)) or tr.get("traco") for tr in sp.get("trechos") or []):
            return False
        return True
    if t == "imagem":
        return True
    if t == "instancia":
        return (o.get("simbolo") in simbolos)
    return False


def _alin(a):
    return {"centro": "CENTER", "dir": "RIGHT", "just": "FULLJUSTIFYLASTLINELEFT", "just_tudo": "FULLJUSTIFY"}.get(a or "esq", "LEFT")


class _Montador:
    def __init__(self, doc, tmp):
        self.doc, self.tmp, self.n_pdf, self.avisos, self.cont = doc, tmp, 0, set(), {"nativos": 0, "pdf": 0}
        self.simbolos = doc.get("simbolos") or {}

    def pdf_obj(self, o):
        """o objeto sozinho num PDF do tamanho da caixa (com folga para efeitos) → item 'pdf' para incorporar."""
        b = vx._bbox_obj(dict(o, _simbolos=self.simbolos, _wh=((self.doc.get("imagens") or {}).get(o.get("img")) or {}).get("_wh")))
        if not b:
            return None
        fol = 40.0 if (o.get("efeitos") or o.get("_silh")) else 4.0
        x0, y0, x1, y1 = b[0] - fol, b[1] - fol, b[2] + fol, b[3] + fol
        self.n_pdf += 1
        arq = os.path.join(self.tmp, f"obj{self.n_pdf}.pdf")
        d = dict(self.doc, pranchetas=[{"id": "pp", "nome": "o", "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}],
                 camadas=[{"id": "cc", "nome": "c", "visivel": True, "trava": False, "itens": [o]}], sangria=0)
        r = vx.exportar_pdf(d, arq, {"padrao": "rgb" if self.doc.get("modoCor") == "rgb" else "cmyk", "marcas": False, "sangria": 0, "textoEditavel": True})
        if not r.get("success"):
            self.avisos.add(f"um objeto ({o.get('tipo')}) não foi: {r.get('error')}")
            return None
        self.cont["pdf"] += 1
        return {"t": "pdf", "arq": arq.replace("\\", "/"), "x": x0, "y": y0, "nome": o.get("nome") or ""}

    def item(self, o):
        if o.get("visivel") is False:
            pass   # vai oculto
        if not _nativo(o, self.simbolos):
            r = self.pdf_obj(o)
            if r and o.get("visivel") is False:
                r["oculto"] = True
            return r
        t, base = o.get("tipo"), {"nome": o.get("nome") or "", "op": o.get("op"), "bm": _BM.get(o.get("bm") or ""), "oculto": o.get("visivel") is False,
                                   "trava": bool(o.get("trava")), "sobre": o.get("sobre") or {}}
        self.cont["nativos"] += 1
        sb = _sombras(o)
        if sb:
            base["sombras"] = [{"dx": e.get("dx", 4), "dy": e.get("dy", 4), "desf": e.get("desfoque", 3), "op": e.get("op", 0.75)} for e in sb]
        if t == "caminho":
            return dict(base, t="caminho", subs=o["subs"], par=o.get("regra") == "evenodd", preench=o.get("preench"), traco=o.get("traco"))
        if t == "grupo":
            its = [self.item(f) for f in (o.get("itens") or [])]
            return dict(base, t="grupo", clip=bool(o.get("clip")), itens=[i for i in its if i])
        if t == "texto":
            sp = vx._spec_texto(o)
            trechos = []
            for tr in sp.get("trechos") or []:
                x = {"ini": tr.get("ini", 0), "fim": tr.get("fim", 0)}
                if tr.get("preench") is not None: x["preench"] = tr["preench"]
                if tr.get("fam") or tr.get("estilo"): x["ps"] = _ps(tr.get("fam") or sp.get("fam"), tr.get("estilo") or sp.get("estilo"))
                if tr.get("tam"): x["tam"] = tr["tam"]
                if tr.get("track") is not None: x["track"] = tr["track"]
                trechos.append(x)
            geo = vk.texto_geometria(sp)
            alt = sp.get("caixa_alt") or (geo.get("alt") if sp.get("caixa") else None)
            return dict(base, t="texto", conteudo=str(sp.get("conteudo") or ""), ps=_ps(sp.get("fam"), sp.get("estilo")), fam=sp.get("fam"),
                        tam=float(sp.get("tam") or 12), entrelinha=sp.get("entrelinha"), track=float(sp.get("track") or 0), alin=_alin(sp.get("alin")),
                        caixa=sp.get("caixa"), caixa_alt=(alt + 2) if alt else None, m=o.get("m") or [1, 0, 0, 1, 0, 0], preench=o.get("preench"), trechos=trechos)
        if t == "imagem":
            im = (self.doc.get("imagens") or {}).get(o.get("img")) or {}
            arq = im.get("arquivo")
            if not arq or not os.path.isfile(arq):
                self.avisos.add("imagem com link quebrado ficou de fora"); self.cont["nativos"] -= 1
                return None
            return dict(base, t="imagem", arq=arq.replace("\\", "/"), w=im.get("w") or 1, h=im.get("h") or 1, m=o.get("m"))
        if t == "instancia":
            return dict(base, t="instancia", simbolo=o["simbolo"], m=o.get("m") or [1, 0, 0, 1, 0, 0])
        return None

    def dados(self):
        d = self.doc
        sims = {}
        for sid, S in self.simbolos.items():
            sims[sid] = {"nome": S.get("nome") or sid, "itens": [i for i in (self.item(f) for f in S.get("itens") or []) if i]}
        cams = [{"nome": c.get("nome") or "Camada", "visivel": c.get("visivel") is not False, "trava": bool(c.get("trava")), "imprimir": c.get("imprimir") is not False,
                 "itens": [i for i in (self.item(o) for o in c.get("itens") or []) if i]} for c in d.get("camadas") or []]
        return {"cor": "rgb" if d.get("modoCor") == "rgb" else "cmyk", "pranchetas": [{"nome": p.get("nome") or "", "x": p["x"], "y": p["y"], "w": p["w"], "h": p["h"]} for p in d["pranchetas"]],
                "camadas": cams, "simbolos": sims, "amostras": [{"nome": a.get("nome"), "cor": a.get("cor")} for a in d.get("amostras") or [] if (a.get("cor") or {}).get("k") == "spot"]}


def exportar(doc_py, caminho, op=None):
    """doc_py = vkDocPy() → .ai nativo salvo pelo próprio Illustrator. op: {abrir (deixa aberto no Illustrator)}."""
    op = op or {}
    if not disponivel():
        return {"success": False, "error": "Illustrator não encontrado neste computador", "sem_illustrator": True}
    tmp = tempfile.mkdtemp(prefix="vk_ponte_")
    M = _Montador(doc_py, tmp)
    dados = M.dados()
    jsx = os.path.join(tmp, "montar.jsx")
    with open(jsx, "w", encoding="ascii", errors="backslashreplace") as f:
        # tudo em ASCII (\uXXXX): o DoJavaScriptFile lê o .jsx na página de código do sistema e estragava os acentos
        f.write("var DADOS = " + json.dumps(dados, ensure_ascii=True) + ";\nvar SAIDA = " + json.dumps(os.path.abspath(caminho).replace("\\", "/"), ensure_ascii=True)
                + ";\nvar ABRIR = " + ("true" if op.get("abrir") else "false") + ";\n" + _JSX)
    try:
        res = _app().DoJavaScriptFile(jsx)
    except Exception as e:
        return {"success": False, "error": f"o Illustrator recusou: {e}"}
    try:
        r = json.loads(res)
    except Exception:
        return {"success": False, "error": f"resposta inesperada do Illustrator: {str(res)[:300]}"}
    if op.get("abrir"):
        _frente()
    r.update(success=bool(r.get("ok")), arquivo=caminho, nativos=M.cont["nativos"], incorporados_pdf=M.cont["pdf"], avisos=sorted(M.avisos | set(r.get("avisos") or [])))
    return r


_JSX = r"""
(function () {
  var avisos = [];
  function js(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'string') { var s = ''; for (var c = 0; c < v.length; c++) { var cc = v.charCodeAt(c), ch = v.charAt(c); if (cc === 34) ch = String.fromCharCode(92, 34); else if (cc === 92) ch = String.fromCharCode(92, 92); else if (cc === 13 || cc === 10) ch = String.fromCharCode(92) + 'n'; else if (cc < 32) ch = ' '; else if (cc > 126) ch = String.fromCharCode(92) + 'u' + ('000' + cc.toString(16)).slice(-4); s += ch; } return '"' + s + '"'; }   /* sem ternário encadeado: o ExtendScript agrupa pela esquerda */
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(js(v[i])); return '[' + a.join(',') + ']'; }
    var o = []; for (var k in v) o.push(js(k) + ':' + js(v[k])); return '{' + o.join(',') + '}';
  }
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  try { app.preferences.PDFFileOptions.pDFCropToBox = PDFBoxType.PDFMEDIABOX; app.preferences.PDFFileOptions.pageToOpen = 1; } catch (e) {}
  var D = DADOS;
  var doc = app.documents.add(D.cor === 'rgb' ? DocumentColorSpace.RGB : DocumentColorSpace.CMYK, 612, 792);
  // pranchetas (y do Vetor para baixo → Illustrator para cima)
  for (var i = 0; i < D.pranchetas.length; i++) {
    var p = D.pranchetas[i], r = [p.x, -p.y, p.x + p.w, -(p.y + p.h)];
    var ab = i === 0 ? doc.artboards[0] : doc.artboards.add(r);
    if (i === 0) ab.artboardRect = r;
    if (p.nome) ab.name = p.nome;
  }
  var spots = {};
  function spot(nome, v) {
    if (spots[nome]) return spots[nome];
    var s = null; try { s = doc.spots.getByName(nome); } catch (e) {}
    if (!s) { s = doc.spots.add(); s.name = nome; var k = new CMYKColor(); k.cyan = v[0]; k.magenta = v[1]; k.yellow = v[2]; k.black = v[3]; s.color = k; s.colorType = ColorModel.SPOT; }
    spots[nome] = s; return s;
  }
  function cor(c) {
    if (!c) return new NoColor();
    if (c.k === 'cmyk') { var x = new CMYKColor(); x.cyan = c.v[0]; x.magenta = c.v[1]; x.yellow = c.v[2]; x.black = c.v[3]; return x; }
    if (c.k === 'rgb') { var x = new RGBColor(); x.red = c.v[0]; x.green = c.v[1]; x.blue = c.v[2]; return x; }
    if (c.k === 'spot') { var x = new SpotColor(); x.spot = spot(c.nome, c.v || [0, 0, 0, 100]); x.tint = c.tint == null ? 100 : c.tint; return x; }
    if (c.k === 'reg') { var x = new SpotColor(); try { x.spot = doc.spots.getByName('[Registration]'); } catch (e) { return cor({ k: 'cmyk', v: [100, 100, 100, 100] }); } x.tint = 100; return x; }
    if (c.k === 'grad' && c.paradas && c.paradas.length) return cor(c.paradas[0].cor);
    return new NoColor();
  }
  function degrade(item, g) {
    var G = doc.gradients.add(); G.type = g.tipo === 'rad' ? GradientType.RADIAL : GradientType.LINEAR;
    var ps = g.paradas.slice(0).sort(function (a, b) { return a.p - b.p; });
    while (G.gradientStops.length < ps.length) G.gradientStops.add();
    for (var i = 0; i < ps.length; i++) { var s = G.gradientStops[i]; s.rampPoint = Math.max(0, Math.min(100, ps[i].p * 100)); s.color = cor(ps[i].cor);
      if (ps[i].op != null) s.opacity = ps[i].op * 100; if (ps[i].meio != null) s.midPoint = Math.max(13, Math.min(87, ps[i].meio * 100)); }
    var gc = new GradientColor(); gc.gradient = G;
    item.fillColor = gc;
    // geometria: origem, ângulo e comprimento (Illustrator: y para cima)
    try {
      var a = g.a, b = g.tipo === 'rad' ? [g.a[0] + g.r, g.a[1]] : g.b;
      var dx = b[0] - a[0], dy = -(b[1] - a[1]);
      var f = item.fillColor; f.origin = [a[0], -a[1]]; f.angle = Math.atan2(dy, dx) * 180 / Math.PI; f.length = Math.sqrt(dx * dx + dy * dy);
      item.fillColor = f;
    } catch (e) { avisos.push('degradê: geometria aproximada'); }
  }
  var CAP = { butt: StrokeCap.BUTTENDCAP, round: StrokeCap.ROUNDENDCAP, square: StrokeCap.PROJECTINGENDCAP };
  var JUN = { miter: StrokeJoin.MITERENDJOIN, round: StrokeJoin.ROUNDENDJOIN, bevel: StrokeJoin.BEVELENDJOIN };
  function pinta(it, o) {
    if (o.preench) { it.filled = true; if (o.preench.k === 'grad') degrade(it, o.preench); else it.fillColor = cor(o.preench); } else it.filled = false;
    var t = o.traco;
    if (t && t.cor && t.larg > 0) {
      it.stroked = true; it.strokeColor = cor(t.cor); it.strokeWidth = t.larg;
      if (CAP[t.cap]) it.strokeCap = CAP[t.cap]; if (JUN[t.junc]) it.strokeJoin = JUN[t.junc]; if (t.miter) it.strokeMiterLimit = Math.max(1, t.miter);
      if (t.tracejado && t.tracejado.length) { it.strokeDashes = t.tracejado; if (t.fase) it.strokeDashOffset = t.fase; }
    } else it.stroked = false;
    if (o.sobre) { if (o.sobre.p) it.fillOverprint = true; if (o.sobre.t) it.strokeOverprint = true; }
  }
  function comum(it, o) {
    if (o.nome) it.name = o.nome;
    if (o.op != null && o.op < 1) it.opacity = o.op * 100;
    if (o.bm) try { it.blendingMode = BlendModes[o.bm]; } catch (e) {}
  }
  function pontos(p, s) {
    var P = s.pts;
    for (var i = 0; i < P.length; i++) { var q = P[i], pp = p.pathPoints.add(); pp.anchor = [q[0], -q[1]]; pp.leftDirection = [q[2], -q[3]]; pp.rightDirection = [q[4], -q[5]]; pp.pointType = PointType.CORNER; }
    p.closed = s.fechado !== false;
  }
  function matriz(m) { var M = app.getIdentityMatrix(); M.mValueA = m[0]; M.mValueB = -m[1]; M.mValueC = -m[2]; M.mValueD = m[3]; M.mValueTX = m[4]; M.mValueTY = -m[5]; return M; }
  function aplicaM(it, m) { if (!m) return; if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) { it.translate(m[4], -m[5]); return; }
    it.transform(matriz(m), true, true, true, true, 100, Transformation.DOCUMENTORIGIN); }
  var fontes = {};
  function fonte(ps) { if (!ps) return null; if (fontes[ps] !== undefined) return fontes[ps]; var f = null; try { f = app.textFonts.getByName(ps); } catch (e) { avisos.push('fonte ' + ps + ' não instalada no Illustrator'); } fontes[ps] = f; return f; }
  var sims = {};
  function cria(par, o) {
    var it = null;
    if (o.t === 'caminho') {
      if (o.subs.length > 1 || o.par) {
        it = par.compoundPathItems.add();
        for (var i = 0; i < o.subs.length; i++) { var p = it.pathItems.add(); pontos(p, o.subs[i]); if (o.par) p.evenodd = true; }
        pinta(it.pathItems[0], o);
      } else { it = par.pathItems.add(); pontos(it, o.subs[0]); pinta(it, o); }
    } else if (o.t === 'grupo') {
      it = par.groupItems.add();
      var ini = o.clip ? 1 : 0;
      for (var i = ini; i < o.itens.length; i++) cria(it, o.itens[i]);
      if (o.clip && o.itens.length) { var c = cria(it, o.itens[0]); try { c.clipping = true; } catch (e) { try { c.pathItems[0].clipping = true; } catch (e2) {} } it.clipped = true; }
    } else if (o.t === 'texto') {
      if (o.caixa) { var rp = par.pathItems.rectangle(0, 0, o.caixa, o.caixa_alt || o.tam * 10); it = par.textFrames.areaText(rp); }
      else it = par.textFrames.pointText([0, 0]);
      it.contents = o.conteudo.replace(/\n/g, '\r');
      var ca = it.textRange.characterAttributes, f = fonte(o.ps);
      if (f) ca.textFont = f; ca.size = o.tam; ca.fillColor = cor(o.preench); ca.tracking = o.track || 0;
      if (o.entrelinha) { ca.autoLeading = false; ca.leading = o.entrelinha; }
      it.textRange.paragraphAttributes.justification = Justification[o.alin] || Justification.LEFT;
      for (var i = 0; i < o.trechos.length; i++) {
        var t = o.trechos[i]; if (t.fim <= t.ini) continue;
        try { var rr = it.characters[t.ini]; rr.length = t.fim - t.ini; var a = rr.characterAttributes;
          if (t.preench) a.fillColor = cor(t.preench); if (t.ps) { var f2 = fonte(t.ps); if (f2) a.textFont = f2; } if (t.tam) a.size = t.tam; if (t.track != null) a.tracking = t.track;
        } catch (e) { avisos.push('trecho de texto: ' + e); }
      }
      aplicaM(it, o.m);
    } else if (o.t === 'imagem') {
      it = par.placedItems.add(); it.file = new File(o.arq);
      it.width = o.w; it.height = o.h; it.position = [0, 0];
      aplicaM(it, o.m);
      try { it.embed(); it = null; } catch (e) {}
      if (!it) { it = par.pageItems[0]; }
    } else if (o.t === 'instancia') {
      var S = sims[o.simbolo];
      if (!S) return null;
      it = par.symbolItems.add(S.s); it.position = S.pos; aplicaM(it, o.m);
    } else if (o.t === 'pdf') {
      it = par.placedItems.add(); it.file = new File(o.arq); it.position = [o.x, -o.y];
      try { it.embed(); it = par.pageItems[0]; } catch (e) { avisos.push('PDF incorporado ficou vinculado'); }
    }
    if (it && o.sombras) for (var k = 0; k < o.sombras.length; k++) { var S = o.sombras[k];   // Efeito > Estilizar > Sombra projetada (viva)
      try { it.applyEffect('<LiveEffect name="Adobe Drop Shadow"><Dict data="R horz ' + S.dx + ' R vert ' + S.dy + ' R blur ' + S.desf + ' R opac ' + S.op + ' I mode 1 I csrc 0 B usePSLBlur 1 R dark 0 I blnd 1 B pair 1 "/></LiveEffect>'); }
      catch (e) { avisos.push('sombra: ' + e); } }
    if (it) { comum(it, o); if (o.oculto) it.hidden = true; }
    return it;
  }
  // símbolos: monta a arte numa camada provisória, vira símbolo, guarda a posição (origem do símbolo = 0,0)
  var tmpL = doc.layers.add(); tmpL.name = '__simbolos';
  for (var k in D.simbolos) {
    var S = D.simbolos[k], g = tmpL.groupItems.add();
    for (var i = 0; i < S.itens.length; i++) cria(g, S.itens[i]);
    var pos = g.position, s = doc.symbols.add(g); s.name = S.nome; sims[k] = { s: s, pos: pos }; g.remove();
  }
  tmpL.remove();
  // camadas: a 0 do Vetor é a de baixo; layers.add() põe no topo
  var Ls = [];
  for (var i = 0; i < D.camadas.length; i++) {
    var C = D.camadas[i], L = i === 0 ? doc.layers[0] : doc.layers.add();
    L.name = C.nome;
    for (var j = 0; j < C.itens.length; j++) { try { cria(L, C.itens[j]); } catch (e) { avisos.push(C.nome + ': ' + e); } }
    Ls.push([L, C]);
  }
  for (var i = 0; i < D.amostras.length; i++) { try { spot(D.amostras[i].nome || D.amostras[i].cor.nome, D.amostras[i].cor.v); } catch (e) {} }
  for (var i = 0; i < Ls.length; i++) { var L = Ls[i][0], C = Ls[i][1]; L.printable = C.imprimir; L.visible = C.visivel; L.locked = C.trava; }
  var so = new IllustratorSaveOptions(); so.pdfCompatible = true; so.embedICCProfile = true; so.embedLinkedFiles = true;
  doc.saveAs(new File(SAIDA), so);
  var out = { ok: true, pranchetas: doc.artboards.length, camadas: doc.layers.length, avisos: avisos };
  if (!ABRIR) doc.close(SaveOptions.DONOTSAVECHANGES);
  return js(out);
})();
"""


# ─────────────────────────── volta: textos nativos de um .ai (Illustrator → Vetor) ───────────────────────────
def aberto():
    """Illustrator já rodando (o Vetor não abre o Illustrator sozinho só para ler um arquivo)."""
    try:
        import pythoncom
        import win32com.client
        pythoncom.CoInitialize()
        win32com.client.GetActiveObject("Illustrator.Application")
        return True
    except Exception:
        return False


def _cor_ai(c):
    if not c:
        return None
    k = c.get("k")
    if k == "cmyk":
        return {"k": "cmyk", "v": [round(v, 2) for v in c["v"]]}
    if k == "rgb":
        return {"k": "rgb", "v": [round(v) for v in c["v"]]}
    if k == "cinza":
        return {"k": "cmyk", "v": [0, 0, 0, round(c["v"], 2)]}
    if k == "spot":
        return {"k": "spot", "nome": c["nome"], "v": [round(v, 2) for v in c.get("alt") or [0, 0, 0, 100]], "tint": round(c.get("tint", 100), 2)}
    return None


def _estilo_fonte(fam, estilo):
    """família/estilo do Illustrator (ex.: "Arial", "Bold") → o que o Vetor usa (instalada)."""
    try:
        arq, ind, ok = vk.fonte_arquivo(fam, estilo or "Regular")
        if ok:
            return fam, estilo or "Regular"
    except Exception:
        pass
    return fam, estilo or "Regular"


def textos(caminho):
    """→ {success, pranchetas:[{nome, l, t}], textos:[{camada, prancheta, tipo, conteudo, m, caixa, caixa_alt, alin, entrelinha,
    trechos:[{ini, fim, fam, estilo, tam, track, cor}]}]} lido pelo Illustrator aberto (fecha o arquivo sem salvar)."""
    import win32com.client
    if not aberto():
        return {"success": False, "error": "Illustrator fechado"}
    app = win32com.client.GetActiveObject("Illustrator.Application")
    jsx = os.path.join(tempfile.mkdtemp(prefix="vk_ponte_"), "ler.jsx")
    with open(jsx, "w", encoding="ascii", errors="backslashreplace") as f:
        f.write("var ARQ = " + json.dumps(os.path.abspath(caminho).replace("\\", "/"), ensure_ascii=True) + ";\n" + _JSX_LER)
    try:
        r = json.loads(app.DoJavaScriptFile(jsx))
    except Exception as e:
        return {"success": False, "error": str(e)}
    for t in r.get("textos") or []:
        for tr in t.get("trechos") or []:
            tr["cor"] = _cor_ai(tr.get("cor"))
            tr["fam"], tr["estilo"] = _estilo_fonte(tr.get("fam"), tr.get("estilo"))
    r["success"] = True
    return r


_JSX_LER = r"""
(function () {
  function js(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'string') { var s = ''; for (var c = 0; c < v.length; c++) { var cc = v.charCodeAt(c), ch = v.charAt(c); if (cc === 34) ch = String.fromCharCode(92, 34); else if (cc === 92) ch = String.fromCharCode(92, 92); else if (cc === 13 || cc === 10) ch = String.fromCharCode(92) + 'n'; else if (cc < 32) ch = ' '; else if (cc > 126) ch = String.fromCharCode(92) + 'u' + ('000' + cc.toString(16)).slice(-4); s += ch; } return '"' + s + '"'; }   /* sem ternário encadeado: o ExtendScript agrupa pela esquerda */
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(js(v[i])); return '[' + a.join(',') + ']'; }
    var o = []; for (var k in v) o.push(js(k) + ':' + js(v[k])); return '{' + o.join(',') + '}';
  }
  function cor(c) {
    try {
      if (!c) return null; var t = c.typename;
      if (t === 'CMYKColor') return { k: 'cmyk', v: [c.cyan, c.magenta, c.yellow, c.black] };
      if (t === 'RGBColor') return { k: 'rgb', v: [c.red, c.green, c.blue] };
      if (t === 'GrayColor') return { k: 'cinza', v: c.gray };
      if (t === 'SpotColor') { var a = c.spot.color, alt = a.typename === 'CMYKColor' ? [a.cyan, a.magenta, a.yellow, a.black] : null; return { k: 'spot', nome: c.spot.name, tint: c.tint, alt: alt }; }
    } catch (e) {}
    return null;
  }
  function attrs(ch) {
    var a = ch.characterAttributes, f = null; try { f = a.textFont; } catch (e) {}
    return { fam: f ? f.family : '', estilo: f ? f.style : '', tam: a.size, track: a.tracking, cor: cor(a.fillColor) };
  }
  function igual(a, b) { return a.fam === b.fam && a.estilo === b.estilo && a.tam === b.tam && a.track === b.track && js(a.cor) === js(b.cor); }
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  var d = app.open(new File(ARQ)), out = { pranchetas: [], textos: [] };
  for (var i = 0; i < d.artboards.length; i++) { var q = d.artboards[i].artboardRect; out.pranchetas.push({ nome: d.artboards[i].name, l: q[0], t: q[1], r: q[2], b: q[3] }); }
  var J = { 'Justification.CENTER': 'centro', 'Justification.RIGHT': 'dir', 'Justification.FULLJUSTIFYLASTLINELEFT': 'just', 'Justification.FULLJUSTIFY': 'just_tudo' };
  for (var i = 0; i < d.textFrames.length; i++) {
    var tf = d.textFrames[i], kind = String(tf.kind);
    var n = tf.characters.length, trechos = [], ini = 0, atual = null;
    for (var c = 0; c < n; c++) { var a = attrs(tf.characters[c]); if (!atual) { atual = a; continue; } if (!igual(a, atual)) { atual.ini = ini; atual.fim = c; trechos.push(atual); atual = a; ini = c; } }
    if (atual) { atual.ini = ini; atual.fim = n; trechos.push(atual); }
    var p0 = tf.paragraphs.length ? tf.paragraphs[0] : tf.textRange, ca = tf.textRange.characterAttributes, M = tf.matrix;
    var r = { camada: tf.layer.name, tipo: kind === 'TextType.AREATEXT' ? 'area' : (kind === 'TextType.PATHTEXT' ? 'caminho' : 'ponto'),   /* ExtendScript agrupa ternário encadeado pela esquerda: parênteses */ conteudo: tf.contents, oculto: tf.hidden,
              alin: J[String(p0.paragraphAttributes.justification)] || 'esq', entrelinha: ca.autoLeading ? null : ca.leading, trechos: trechos,
              mat: [M.mValueA, M.mValueB, M.mValueC, M.mValueD], anchor: null, nome: tf.name, bounds: tf.geometricBounds };
    if (kind === 'TextType.POINTTEXT') r.anchor = tf.anchor;   // área não tem âncora (erro 9544)
    if (r.tipo === 'area') { var g = tf.textPath.geometricBounds; r.box = g; }
    if (r.tipo === 'caminho') {   // texto em caminho: o caminho (âncoras e alças) e onde o texto começa (t = segmento + fração)
      var pp = tf.textPath.pathPoints, pts = [];
      for (var k = 0; k < pp.length; k++) { var q = pp[k]; pts.push([q.anchor[0], q.anchor[1], q.leftDirection[0], q.leftDirection[1], q.rightDirection[0], q.rightDirection[1]]); }
      r.pts = pts; r.fechado = tf.textPath.closed; try { r.t0 = tf.startTValue; } catch (e) { r.t0 = 0; }
    }
    out.textos.push(r);
  }
  d.close(SaveOptions.DONOTSAVECHANGES);
  return js(out);
})();
"""


def _comprimento_ate(pts, fechado, t0):
    """comprimento (pt) do caminho até o parâmetro t0 do Illustrator (parte inteira = segmento, fração = dentro dele)."""
    n = len(pts) if fechado else len(pts) - 1
    seg, fr = int(t0), t0 - int(t0)
    total = 0.0
    for i in range(min(seg + 1, n)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        P = [(a[0], a[1]), (a[4], a[5]), (b[2], b[3]), (b[0], b[1])]
        ate = fr if i == seg else 1.0
        passos = 48
        ant = P[0]
        for k in range(1, passos + 1):
            u = ate * k / passos; v = 1 - u
            x = v ** 3 * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u ** 3 * P[3][0]
            y = v ** 3 * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u ** 3 * P[3][1]
            total += math.hypot(x - ant[0], y - ant[1]); ant = (x, y)
    return total


def aplicar_textos(doc, caminho, relatorio):
    """Troca os textos que vieram do PDF (linha a linha) pelos do Illustrator: texto de área inteiro, trechos com fonte/cor,
    alinhamento e entrelinha, na camada certa. Só com o Illustrator aberto; senão fica o do PDF."""
    r = textos(caminho)
    if not r.get("success"):
        return False
    P = doc.get("pranchetas") or []
    AB = r["pranchetas"]
    if len(AB) != len(P):
        return False

    def deslocamento(b):   # cada prancheta tem o seu: o Vetor pode ter posto as pranchetas em outro lugar (fila)
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        i = next((k for k, a in enumerate(AB) if a["l"] - 1 <= cx <= a["r"] + 1 and a["b"] - 1 <= cy <= a["t"] + 1), None)
        if i is None:   # na área de trabalho, fora das pranchetas: o PDF não tem (rótulos do designer) — fica de fora
            return None
        return P[i]["x"] - AB[i]["l"], P[i]["y"] + AB[i]["t"]
    caixas = []
    novos = []
    for t in r["textos"]:
        b = t.get("bounds") or [0, 0, 0, 0]
        off = deslocamento(b)
        if off is None:
            continue
        X = lambda x, off=off: x + off[0]
        Y = lambda y, off=off: -y + off[1]
        caixas.append((X(b[0]) - 2, Y(b[1]) - 2, X(b[2]) + 2, Y(b[3]) + 2, False))
        if not t.get("trechos"):
            continue
        tr0 = t["trechos"][0]
        A, B, C, D = t["mat"]
        trilha = None
        if t["tipo"] == "caminho":
            if not t.get("pts"):
                continue
            pts = [[X(q[0]), Y(q[1]), X(q[2]), Y(q[3]), X(q[4]), Y(q[5])] for q in t["pts"]]
            trilha = {"subs": [{"fechado": bool(t.get("fechado")), "pts": pts}], "ini": _comprimento_ate(pts, bool(t.get("fechado")), float(t.get("t0") or 0))}
            e = f = 0; caixa = caixa_alt = None
        elif t["tipo"] == "area":
            bx = t.get("box") or t["bounds"]; e, f = X(bx[0]), Y(bx[1]); caixa, caixa_alt = bx[2] - bx[0], bx[1] - bx[3]
        else:
            e, f = X(t["anchor"][0]), Y(t["anchor"][1]); caixa = caixa_alt = None
        trechos = []
        for x in t["trechos"]:
            dif = {k: x[k] for k in ("fam", "estilo", "tam", "track") if x.get(k) != tr0.get(k)}
            if x.get("cor") != tr0.get("cor"):
                dif["preench"] = x.get("cor")
            if dif:
                trechos.append(dict(dif, ini=x["ini"], fim=x["fim"]))
        o = {"id": "t" + os.urandom(4).hex(), "tipo": "texto", "conteudo": t["conteudo"].replace("\r\n", "\n").replace("\r", "\n"), "fam": tr0["fam"], "estilo": tr0["estilo"], "tam": round(tr0["tam"], 3),
             "entrelinha": t.get("entrelinha"), "track": tr0.get("track") or 0, "alin": t.get("alin") or "esq", "caixa": caixa,
             "m": [round(A, 6), round(-B, 6), round(-C, 6), round(D, 6), round(e, 3), round(f, 3)], "preench": tr0.get("cor") or {"k": "cmyk", "v": [0, 0, 0, 100]}, "traco": None}
        if caixa_alt:
            o["caixa_alt"] = round(caixa_alt, 3)
        if trilha:   # como o comando texto_caminho do Vetor: o caminho em pt do documento, m identidade
            o["subs"], o["trilha"], o["m"] = trilha["subs"], {"ini": round(trilha["ini"], 3), "lado": False}, [1, 0, 0, 1, 0, 0]
        if trechos:
            o["trechos"] = trechos
        if t.get("nome"):
            o["nome"] = t["nome"]
        if t.get("oculto"):
            o["visivel"] = False
        novos.append((t.get("camada"), o))
    if not novos:
        return False

    def dentro(o):   # texto do PDF que um texto nativo substitui (texto em caminho fica)
        m = o.get("m") or [1, 0, 0, 1, 0, 0]
        return any(c[0] <= m[4] <= c[2] and c[1] <= m[5] <= c[3] and not c[4] for c in caixas)

    def limpa(itens):
        out = []
        for o in itens:
            if o.get("tipo") == "texto" and dentro(o):
                continue
            if o.get("itens"):
                o["itens"] = limpa(o["itens"])
            out.append(o)
        return out
    for c in doc["camadas"]:
        c["itens"] = limpa(c["itens"])
    for nome, o in novos:
        c = next((c for c in doc["camadas"] if c["nome"] == nome), None)
        if not c:
            c = {"id": "c" + os.urandom(3).hex(), "nome": nome or "Texto", "visivel": True, "trava": False, "itens": []}
            doc["camadas"].append(c)
        c["itens"].append(o)
    doc["camadas"] = [c for c in doc["camadas"] if c["itens"]]
    relatorio.append(f"Textos lidos pelo Illustrator aberto: {len(novos)} (texto de área e trechos como no original)")
    return True
