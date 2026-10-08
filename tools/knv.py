"""Monta uma peça do Photo Kanivete a partir de HTML/CSS (KNV.cena) no app aberto em modo agente e confere.
uso: py -3.13 tools/knv.py peca.html [--formato feed] [--salvar peca.iknv] [--previa previa.jpg] [--escala 0.5]
     [--de peca.iknv] [--novo] [--depois receita.js] [--refazer] [--porta 9333] [--mapa] [--sem-recarga]
  peca.html   a peça; caminhos relativos de <img> partem da pasta dela. '-' = não roda cena (só --de/--depois)
  --de        abre esse .iknv antes (rodar de novo atualiza as camadas pela chave e não toca no que foi mexido)
  --novo      documento novo mesmo com um aberto; --refazer refaz também as camadas mexidas
  --depois    JS com chamadas KNV.* depois da cena (ajustes de foto, pincel, recorte...)
  --exportar  pasta: carrossel = um arquivo por slide (base_01.png...), senão a peça inteira (--fmt png|jpg|webp)
  --previa    JPEG da composição (padrão: <peca>.jpg ao lado, escala 0.5) para julgar a estética; --sem-previa não grava
  --ver       só um pedaço, barato: "slide:2" ou "x,y,w,h" (escala --escala-ver 0.4) → <peca>_ver.jpg
  --referencia ref.png   imagem de referência como camada oculta e travada (escalada ao documento)
  --comparar  referência (em cima) × peça (embaixo), pequenas → <peca>_comparar.jpg; --comparar slide:2 = só o slide, lado a lado
  --gerar "prompt" [--sementes 7,11,23] [--proporcao 3:4] [--inteiro]  folha de contato do FLUX (recorte de IA, avisa
              corte); rode em segundo plano enquanto escreve o HTML — a cena depois sai do cache (mesmo prompt/semente/tamanho)
  --variacoes var.json   {"camada": "cavalo", "filtro": "aj:matiz", "lista": [{...}, {...}]} ou {"ajuste": "Nome", "lista": [...]}
              → <peca>_variacoes.jpg (lado a lado; o documento volta ao que era)
  --amostras "texto" [--fontes "Chewy,Gluten" | --estilo caixa-unica] → instala as que faltam e monta uma folha
              (estilos em tools/fontes_estilos.json); --estilos lista os estilos e pares
  --biblioteca pasta (padrão D:/kanivete_biblioteca ou %KANIVETE_BIBLIOTECA%): <img src="recurso:nome"> lê
              recursos/nome.png; <img data-guardar="nome"> grava lá o recurso recortado (+ nome.json com prompt/semente)
  --guardar-modelo nome [--nota "..."]  copia html, .iknv, receitas, exportados e prévia para modelos/nome (estudo)
  --listar    recursos e modelos da biblioteca
Recarrega frontend/js/imagem-*.js do disco (mudou o código do editor → não precisa reiniciar o app).
Guia: Instructions/agente/plano-cena.md"""
import argparse, base64, io, json, os, re, sys, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

JS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "js")
ap = argparse.ArgumentParser()
ap.add_argument("html", nargs="?", default="-"); ap.add_argument("--formato"); ap.add_argument("--nome")
ap.add_argument("--salvar"); ap.add_argument("--previa"); ap.add_argument("--escala", type=float, default=0.5)
ap.add_argument("--de"); ap.add_argument("--novo", action="store_true"); ap.add_argument("--refazer", action="store_true")
ap.add_argument("--depois"); ap.add_argument("--porta", type=int, default=9333); ap.add_argument("--margem", type=float)
ap.add_argument("--exportar", help="pasta: um arquivo por slide (ou a peça inteira)"); ap.add_argument("--fmt", default="png")
ap.add_argument("--mapa", action="store_true"); ap.add_argument("--sem-recarga", action="store_true")
ap.add_argument("--sem-previa", action="store_true"); ap.add_argument("--ver"); ap.add_argument("--escala-ver", type=float, default=0.4)
ap.add_argument("--referencia"); ap.add_argument("--comparar", nargs="?", const="tudo"); ap.add_argument("--variacoes")
ap.add_argument("--gerar"); ap.add_argument("--sementes", default="7,11,23"); ap.add_argument("--proporcao", default="1:1"); ap.add_argument("--inteiro", action="store_true")
ap.add_argument("--amostras"); ap.add_argument("--fontes"); ap.add_argument("--estilo"); ap.add_argument("--estilos", action="store_true")
ap.add_argument("--biblioteca", default=os.environ.get("KANIVETE_BIBLIOTECA", r"D:\kanivete_biblioteca"))
ap.add_argument("--revisar", action="store_true", help="revisor (tools/revisor.py): corte, contraste, sombra dura, avatar");
ap.add_argument("--guardar-modelo"); ap.add_argument("--nota", default=""); ap.add_argument("--listar", action="store_true")
a = ap.parse_args()
if a.formato and not a.de and a.html != "-": a.novo = True   # sem --de, montar com formato é peça nova (não remonta a cena aberta)
BIB = os.path.abspath(a.biblioteca)
ESTILOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fontes_estilos.json")
if a.exportar: os.makedirs(a.exportar, exist_ok=True)   # a pasta de exportação pode não existir
barra = lambda p: os.path.abspath(p).replace("\\", "/") if p else p


def recarga_js():
    """Funções de nível superior e tabelas const IE_* = {...} de cada imagem-*.js; a API por último."""
    partes, arquivos = [], [n for n in sorted(os.listdir(JS)) if n.startswith("imagem-") and n.endswith(".js") and n != "imagem-api.js"]
    textos = {n: open(os.path.join(JS, n), encoding="utf-8").read() for n in arquivos}
    # funções que outro módulo embrulha (ieDesenharSobre = function () { orig(); ... }): recarregar a original
    # apagaria o embrulho (guias, fatias, réguas, painéis somem) — essas ficam como estão
    embrulhadas = {m for s in textos.values() for m in re.findall(r"^\s*(\w+) = (?:async )?function\b", s, re.M)}
    for nome in arquivos:
        src = textos[nome].splitlines()
        i = 0
        while i < len(src):
            m = re.match(r"(async )?function (\w+)\s*\(", src[i]); t = re.match(r"const (IE_[A-Z0-9_]+) = \{\s*$", src[i])
            if m and m.group(2) in embrulhadas:
                j = i
                while j < len(src) and not re.match(r"\}\)?;?\s*$", src[j]): j += 1
                i = j + 1; continue
            if m or t:
                j = i
                while j < len(src) and not re.match(r"\}\)?;?\s*$", src[j]): j += 1
                bloco = "\n".join(src[i:j + 1])
                # tabela existente: só as entradas com valor (texto: null em IE_FERR é preenchido por outro arquivo —
                # copiar o null apagava a ferramenta Texto da barra); tabela nova: cria
                if t: bloco = (f"if (typeof {t.group(1)} !== 'undefined') Object.entries(({bloco[len(t.group(0)) - 1:].rstrip().rstrip(';')}))"
                               f".forEach(([k, v]) => {{ if (v != null) {t.group(1)}[k] = v; }}); else window.{t.group(1)} = ({bloco[len(t.group(0)) - 1:].rstrip().rstrip(';')});")
                partes.append(bloco); i = j + 1
            else: i += 1
    api = open(os.path.join(JS, "imagem-api.js"), encoding="utf-8").read().replace("const KNV =", "var KNV =")
    return "\n".join(partes), "(() => {" + api + "})()"


def estilos():
    try: return json.load(open(ESTILOS, encoding="utf-8"))
    except Exception: return {"estilos": {}, "pares": []}


if a.estilos:
    e = estilos()
    for k, v in e["estilos"].items(): print(f"{k}: {', '.join(v['fontes'])}  — {v.get('uso', '')}")
    print("pares:"); [print("  ", " + ".join(p["fontes"]), "—", p.get("uso", "")) for p in e["pares"]]
    sys.exit(0)
if a.listar:
    for sub in ("recursos", "modelos"):
        pasta = os.path.join(BIB, sub); print(f"{sub} ({pasta}):")
        if not os.path.isdir(pasta): print("   (vazio)"); continue
        for n in sorted(os.listdir(pasta)):
            if sub == "recursos" and n.endswith(".png"):
                m = os.path.join(pasta, n[:-4] + ".json"); meta = json.load(open(m, encoding="utf-8")) if os.path.isfile(m) else {}
                print(f"   recurso:{n[:-4]}  {(meta.get('prompt') or meta.get('origem') or '')[:90]}")
            elif sub == "modelos" and os.path.isdir(os.path.join(pasta, n)):
                m = os.path.join(pasta, n, "modelo.json"); meta = json.load(open(m, encoding="utf-8")) if os.path.isfile(m) else {}
                print(f"   {n}: {meta.get('nota', '')[:120]}  fontes: {', '.join(meta.get('fontes', []))}")
    sys.exit(0)

instalar = []
if a.amostras:   # folha de amostras de fontes: um documento novo só para olhar
    lista = [x.strip() for x in (a.fontes or "").split(",") if x.strip()] or estilos()["estilos"].get(a.estilo or "", {}).get("fontes", [])
    if not lista: sys.exit("--amostras pede --fontes \"A,B\" ou --estilo (veja --estilos)")
    instalar = lista
    os.makedirs(os.path.join(BIB, "amostras"), exist_ok=True)
    linhas = "\n".join(f'<div class="l"><span>{n}</span><b style="font-family:\'{n}\'">{a.amostras}</b></div>' for n in lista)
    pasta_am = os.path.join(BIB, "amostras"); a.html = os.path.join(pasta_am, re.sub(r"\W+", "_", (a.estilo or "fontes")) + ".html")
    open(a.html, "w", encoding="utf-8").write(f"""<!doctype html><html><head><style>
body {{ margin: 0; width: 1080px; height: 1350px; background: #fff; padding: 40px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; }}
.l {{ display: flex; flex-direction: column; gap: 2px; }} .l span {{ font: 16px Poppins; color: #999; }}
.l b {{ font-size: {max(36, min(84, int(900 / max(8, len(a.amostras)) * 1.6)))}px; font-weight: 400; line-height: 1.05; color: #111; white-space: nowrap; }}
</style></head><body>{linhas}</body></html>""")
    a.formato = a.formato or "feed"; a.novo = True; a.de = None

if a.gerar:   # folha de contato: uma célula por semente, recortada, com o número da semente
    sem = [s.strip() for s in a.sementes.split(",") if s.strip()]
    pw, ph = (float(x) for x in a.proporcao.split(":"))
    cw = int(1000 / len(sem)) - 20; chh = int(cw * ph / pw)
    os.makedirs(os.path.join(BIB, "amostras"), exist_ok=True)
    cel = "\n".join(f'<div style="display:flex;flex-direction:column;align-items:center;gap:6px"><img id="s{s}" src="gerar:{a.gerar}" data-semente="{s}" data-fundo="branco" data-proporcao="{a.proporcao}" data-lado="1024"{" data-inteiro" if a.inteiro else ""} style="width:{cw}px;height:{chh}px;object-fit:contain;background:#2a2a2a"><span style="font:600 22px Poppins;color:#ddd">semente {s}</span></div>' for s in sem)
    a.html = os.path.join(BIB, "amostras", "gerar_" + re.sub(r"\W+", "_", a.gerar)[:40] + ".html")
    open(a.html, "w", encoding="utf-8").write(f'<!doctype html><html><head><style>body{{margin:0;width:1080px;height:{chh + 140}px;background:#1b1b1b;display:flex;gap:20px;justify-content:center;align-items:center}}</style></head><body>{cel}</body></html>')
    a.novo = True; a.de = None; a.w_gerar = (1080, chh + 140)

html = open(a.html, encoding="utf-8").read() if a.html != "-" else None
if html and "gerar:" in html:   # o FLUX precisa da placa: tira os modelos do Ollama (Worker) da memória de vídeo antes
    try:
        import urllib.request as _u
        for _m in json.load(_u.urlopen("http://127.0.0.1:11434/api/ps", timeout=3)).get("models", []):
            _u.urlopen(_u.Request("http://127.0.0.1:11434/api/generate", data=json.dumps({"model": _m["name"], "keep_alive": 0}).encode()), timeout=30)
            print("ollama: descarregado", _m["name"])
    except Exception: pass
opc = {"base": barra(os.path.dirname(os.path.abspath(a.html))) if html else None, "biblioteca": barra(BIB)}
if getattr(a, "w_gerar", None): opc["w"], opc["h"] = a.w_gerar
for k in ("formato", "nome", "margem"):
    if getattr(a, k) is not None: opc[k] = getattr(a, k)
if a.novo: opc["novo"] = True
if a.refazer: opc["refazer"] = True
if a.de: opc["novo"] = False
depois = open(a.depois, encoding="utf-8").read() if a.depois else ""
variacoes = json.load(open(a.variacoes, encoding="utf-8")) if a.variacoes and os.path.isfile(a.variacoes) else (json.loads(a.variacoes) if a.variacoes else None)
ver = None
if a.ver:
    if a.ver.startswith("slide:"): ver = {"slide": int(a.ver[6:]), "escala": a.escala_ver}
    else: x, y, w, h = map(float, a.ver.split(",")); ver = {"x": x, "y": y, "w": w, "h": h, "escala": a.escala_ver}
raiz = os.path.splitext(a.html)[0] if html else os.path.splitext(a.de or a.salvar or os.path.join(BIB, "peca"))[0]
salvar_jpg = lambda url, sufixo: (open(raiz + sufixo, "wb").write(base64.b64decode(url.split(",")[1])), print(sufixo[1:-4] + ":", raiz + sufixo))

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
    if instalar:
        tem = set(pg.evaluate("async () => KNV.fontes()"))
        for n in instalar:
            if n in tem: continue
            try: pg.evaluate("f => KNV.instalarFonte(f)", n); print("fonte instalada:", n)
            except Exception as e: print("!! fonte", n, str(e).splitlines()[0][:100])
    t = time.time()
    try:
        r = pg.evaluate("""async ({html, opc, de, depois, salvar, exportar, fmt, referencia, variacoes, comparar, ver}) => {
            const KNV = window.KNV; const out = {};
            if (de) { await KNV.fecharTudo(); await KNV.abrir(de); if (!IE.doc || !IE.doc.path) throw new Error('não abriu ' + de); if (IE.doc.cena) IE.doc.cena.biblioteca = opc.biblioteca; }
            if (html != null) out.cena = await KNV.cena(html, opc);
            if (referencia) out.referencia = await KNV.referencia(referencia);
            if (depois) { const f = new Function('KNV', 'return (async () => {' + depois + '\\n})()'); out.depois = await f(KNV); }
            if (variacoes) out.variacoes = KNV.variacoes(variacoes);
            if (comparar) out.comparar = KNV.comparar(comparar.startsWith("slide:") ? {slide: +comparar.slice(6)} : {});
            if (ver) out.ver = KNV.ver(ver);
            out.recursos = KNV.recursosNovos();
            if (salvar) out.salvo = await KNV.salvar(salvar);
            if (exportar) out.exportados = await KNV.exportar(exportar, {fmt});
            return out; }""", {"html": html, "opc": opc, "de": barra(a.de), "depois": depois, "salvar": barra(a.salvar), "exportar": os.path.abspath(a.exportar) if a.exportar else None, "fmt": a.fmt,
                              "referencia": barra(a.referencia), "variacoes": variacoes, "comparar": a.comparar, "ver": ver})
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
        for rc in r.get("recursos") or []:   # data-guardar → biblioteca/recursos
            os.makedirs(os.path.join(BIB, "recursos"), exist_ok=True)
            base_r = os.path.join(BIB, "recursos", re.sub(r"[^\w\-]+", "_", rc["nome"]))
            open(base_r + ".png", "wb").write(base64.b64decode(rc["png"]))
            json.dump({**rc["meta"], "nome": rc["nome"], "data": time.strftime("%Y-%m-%d")}, open(base_r + ".json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print("recurso guardado:", f"recurso:{rc['nome']}", "→", base_r + ".png")
        if r.get("variacoes"): salvar_jpg(r["variacoes"], "_variacoes.jpg")
        if r.get("comparar"): salvar_jpg(r["comparar"], "_comparar.jpg")
        if r.get("ver"): salvar_jpg(r["ver"], "_ver.jpg")
        print(f"total {time.time() - t:.1f}s")
    if a.revisar:   # regras dos feedbacks do usuário, sem olhar a imagem
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from revisor import revisar as _revisar
        rv = _revisar(pg)
        print(f"revisor: {rv['problemas']} problema(s)")
        for it in rv["itens"]: print("  ", it)
    if a.mapa: print(pg.evaluate("window.KNV.mapa()"))
    png = None if a.sem_previa else base64.b64decode(pg.evaluate("e => window.KNV.png(e)", a.escala))

previa = None if a.sem_previa else (a.previa or (os.path.splitext(a.html)[0] + ".jpg" if html else None))
if previa and png:
    from PIL import Image
    Image.open(io.BytesIO(png)).convert("RGB").save(previa, quality=85)
    print("prévia:", previa)

if a.guardar_modelo:   # banco de estudo: o que funcionou, para consultar (não é fôrma: as peças nascem do zero)
    import shutil, glob
    dest = os.path.join(BIB, "modelos", re.sub(r"[^\w\-]+", "_", a.guardar_modelo)); os.makedirs(dest, exist_ok=True)
    pasta_peca = os.path.dirname(os.path.abspath(a.html if html else (a.de or a.salvar)))
    copiados = []
    for arq in glob.glob(os.path.join(pasta_peca, "*")):
        if os.path.isfile(arq) and os.path.splitext(arq)[1].lower() in (".html", ".js", ".iknv", ".jpg", ".md", ".json"):
            shutil.copy2(arq, dest); copiados.append(os.path.basename(arq))
    if a.exportar and os.path.isdir(a.exportar):
        os.makedirs(os.path.join(dest, "export"), exist_ok=True)
        for arq in glob.glob(os.path.join(a.exportar, "*")): shutil.copy2(arq, os.path.join(dest, "export")); copiados.append("export/" + os.path.basename(arq))
    par = os.path.splitext(a.de or a.salvar or "")[0] + ".html"   # o HTML com o nome do .iknv; senão o primeiro da pasta
    fonte_html = html or (open(par, encoding="utf-8").read() if os.path.isfile(par) else next((open(x, encoding="utf-8").read() for x in sorted(glob.glob(os.path.join(pasta_peca, "*.html")))), ""))
    fontes = sorted(set(re.findall(r"font-family\s*:\s*['\"]?([^;'\",}]+)", fonte_html)) | set(re.findall(r"font:[^;]*?\d+px(?:/[\d.]+)?\s+['\"]?([A-Z][^;'\",}]+)", fonte_html)))
    json.dump({"nome": a.guardar_modelo, "data": time.strftime("%Y-%m-%d"), "nota": a.nota, "fontes": fontes, "formato": a.formato,
               "arquivos": copiados}, open(os.path.join(dest, "modelo.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("modelo guardado:", dest, f"({len(copiados)} arquivos)")