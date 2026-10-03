"""Monta uma peça do Photo Kanivete a partir de HTML/CSS (KNV.cena) no app aberto em modo agente e confere.
uso: py -3.13 tools/knv.py peca.html [--formato feed] [--salvar peca.iknv] [--previa previa.jpg] [--escala 0.5]
     [--de peca.iknv] [--novo] [--depois receita.js] [--refazer] [--porta 9333] [--mapa] [--sem-recarga]
  peca.html   a peça; caminhos relativos de <img> partem da pasta dela. '-' = não roda cena (só --de/--depois)
  --de        abre esse .iknv antes (rodar de novo atualiza as camadas pela chave e não toca no que foi mexido)
  --novo      documento novo mesmo com um aberto; --refazer refaz também as camadas mexidas
  --depois    JS com chamadas KNV.* depois da cena (ajustes de foto, pincel, recorte...)
  --exportar  pasta: carrossel = um arquivo por slide (base_01.png...), senão a peça inteira (--fmt png|jpg|webp)
  --previa    JPEG da composição (padrão: <peca>.jpg ao lado, escala 0.5) para julgar a estética
Recarrega frontend/js/imagem-*.js do disco (mudou o código do editor → não precisa reiniciar o app).
Guia: Instructions/agente/plano-cena.md"""
import argparse, base64, io, json, os, re, sys, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

JS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "js")
ap = argparse.ArgumentParser()
ap.add_argument("html"); ap.add_argument("--formato"); ap.add_argument("--nome")
ap.add_argument("--salvar"); ap.add_argument("--previa"); ap.add_argument("--escala", type=float, default=0.5)
ap.add_argument("--de"); ap.add_argument("--novo", action="store_true"); ap.add_argument("--refazer", action="store_true")
ap.add_argument("--depois"); ap.add_argument("--porta", type=int, default=9333); ap.add_argument("--margem", type=float)
ap.add_argument("--exportar", help="pasta: um arquivo por slide (ou a peça inteira)"); ap.add_argument("--fmt", default="png")
ap.add_argument("--mapa", action="store_true"); ap.add_argument("--sem-recarga", action="store_true")
a = ap.parse_args()
barra = lambda p: os.path.abspath(p).replace("\\", "/") if p else p


def recarga_js():
    """Funções de nível superior e tabelas const IE_* = {...} de cada imagem-*.js; a API por último."""
    partes = []
    for nome in sorted(os.listdir(JS)):
        if not (nome.startswith("imagem-") and nome.endswith(".js")) or nome == "imagem-api.js": continue
        src = open(os.path.join(JS, nome), encoding="utf-8").read().splitlines()
        i = 0
        while i < len(src):
            m = re.match(r"(async )?function \w+\s*\(", src[i]); t = re.match(r"const (IE_[A-Z0-9_]+) = \{\s*$", src[i])
            if m or t:
                j = i
                while j < len(src) and not re.match(r"\}\)?;?\s*$", src[j]): j += 1
                bloco = "\n".join(src[i:j + 1])
                if t: bloco = f"if (typeof {t.group(1)} !== 'undefined') Object.assign({t.group(1)}, ({bloco[len(t.group(0)) - 1:].rstrip().rstrip(';')}));"
                partes.append(bloco); i = j + 1
            else: i += 1
    api = open(os.path.join(JS, "imagem-api.js"), encoding="utf-8").read().replace("const KNV =", "var KNV =")
    return "\n".join(partes), "(() => {" + api + "})()"


html = open(a.html, encoding="utf-8").read() if a.html != "-" else None
opc = {"base": barra(os.path.dirname(os.path.abspath(a.html))) if html else None}
for k in ("formato", "nome", "margem"):
    if getattr(a, k) is not None: opc[k] = getattr(a, k)
if a.novo: opc["novo"] = True
if a.refazer: opc["refazer"] = True
if a.de: opc["novo"] = False
depois = open(a.depois, encoding="utf-8").read() if a.depois else ""

with sync_playwright() as p:
    for _ in range(60):
        try: b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}"); break
        except Exception: time.sleep(1)
    else: sys.exit(f"app não está aberto em --agente={a.porta}")
    pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url), None)
    pg.wait_for_function("typeof ieCmd === 'function'", timeout=90000)
    funcs, api = recarga_js()
    if not a.sem_recarga:
        erro = pg.evaluate("src => { try { (0, eval)(src); return null } catch (e) { return String(e) } }", funcs)
        if erro: print("!! recarga:", erro)
    pg.evaluate("src => (0, eval)(src)", api)
    if pg.evaluate("window.KNV.dialogo()"): pg.evaluate("window.KNV.responder('cancelar')")
    pg.evaluate("window.KNV.automacao(true, {respostas: {'Salvar as alterações': 'Não salvar', 'Salvar alterações': 'Não salvar'}})")
    pg.evaluate("if (!document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem')")
    t = time.time()
    try:
        r = pg.evaluate("""async ({html, opc, de, depois, salvar, exportar, fmt}) => {
            const KNV = window.KNV; const out = {};
            if (de) { await KNV.fecharTudo(); await KNV.abrir(de); if (!IE.doc || !IE.doc.path) throw new Error('não abriu ' + de); }
            if (html != null) out.cena = await KNV.cena(html, opc);
            if (depois) { const f = new Function('KNV', 'return (async () => {' + depois + '\\n})()'); out.depois = await f(KNV); }
            if (salvar) out.salvo = await KNV.salvar(salvar);
            if (exportar) out.exportados = await KNV.exportar(exportar, {fmt});
            return out; }""", {"html": html, "opc": opc, "de": barra(a.de), "depois": depois, "salvar": barra(a.salvar), "exportar": os.path.abspath(a.exportar) if a.exportar else None, "fmt": a.fmt})
    except Exception as e:
        print("!! erro:", str(e).splitlines()[0][:600]); r = None
    finally:
        pg.evaluate("window.KNV.automacao(false)")
    if r:
        c = r.get("cena") or {}
        if c: print(f"cena {c['w']}x{c['h']}" + (f" ({c['slides']} slides)" if c.get("slides") else "") + f": {c['camadas']} camadas em {c['ms']} ms" + (f"; mantidas (mexidas): {', '.join(c['mantidas'])}" if c.get("mantidas") else ""))
        for av in c.get("avisos", []): print("  aviso:", av)
        for f in r.get("exportados") or []: print("exportado:", f)
        if r.get("depois") is not None: print("depois:", json.dumps(r["depois"], ensure_ascii=False)[:800])
        print(f"total {time.time() - t:.1f}s")
    if a.mapa: print(pg.evaluate("window.KNV.mapa()"))
    png = base64.b64decode(pg.evaluate("e => window.KNV.png(e)", a.escala))

previa = a.previa or (os.path.splitext(a.html)[0] + ".jpg" if html else None)
if previa:
    from PIL import Image
    Image.open(io.BytesIO(png)).convert("RGB").save(previa, quality=85)
    print("prévia:", previa)
