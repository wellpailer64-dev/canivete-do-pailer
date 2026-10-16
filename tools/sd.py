"""Slider Kanivete pela linha de comando, no app ABERTO (não fecha nem recarrega nada). Para o agente gastar pouco:
    py -3.13 tools/sd.py texto [slide]              roteiro compacto (uma linha por camada)
    py -3.13 tools/sd.py folha saida.jpg [--largura 240] [--colunas 4]   todas as páginas numa imagem pequena
    py -3.13 tools/sd.py foto 3 saida.jpg [--largura 960]
    py -3.13 tools/sd.py revisar [slide]            problemas (estouro, contraste, letra pequena, sobreposição…)
    py -3.13 tools/sd.py cmd nome '{"arg": 1}'      um comando de SDK.comandos()
    py -3.13 tools/sd.py lote comandos.json         [["nome", {args}], ...] com um desfazer só
    py -3.13 tools/sd.py cena pagina.html [--substituir N]   cada <section class="slide"> vira um slide (HTML/CSS 1920×1080)
    py -3.13 tools/sd.py js "SDK.mapa()"            qualquer expressão (await automático)
    py -3.13 tools/sd.py comandos | ajuda
Porta: --porta (padrão: 9222, o app do usuário; senão 9333, o de teste)."""
import argparse, json, os, re, sys, urllib.request
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")


def _porta(p):
    for x in ([p] if p else [9222, 9333]):
        try:
            if "index.html" in urllib.request.urlopen(f"http://127.0.0.1:{x}/json/list", timeout=2).read().decode():
                return x
        except Exception:
            pass
    sys.exit("app do Kanivete não encontrado (abra com --agente)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("acao"); ap.add_argument("args", nargs="*")
    ap.add_argument("--porta", type=int); ap.add_argument("--largura", type=int); ap.add_argument("--colunas", type=int)
    ap.add_argument("--substituir", type=int, help="cena: troca a partir deste slide em vez de acrescentar")
    a = ap.parse_args()
    porta = _porta(a.porta)
    with sync_playwright() as p:
        pg = next(x for c in p.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}").contexts for x in c.pages if "index.html" in x.url)
        pg.set_default_timeout(300000)
        E = lambda js, arg=None: pg.evaluate(js, arg)
        if not E("typeof SDK !== 'undefined'"):
            sys.exit("esta versão do app não tem o Slider")
        if a.acao not in ("comandos", "ajuda"):
            E("() => { if (!SD.doc) { sdCarregar(sdNovoDoc()); } if (document.querySelector('.menu-item.active')?.dataset.tool !== 'slider-kanivete') switchTool('slider-kanivete'); SDK_UI.editor(); }")
        x = a.args
        if a.acao == "texto":
            print(E("(n) => SDK.texto(n == null ? {} : {slide: n})", int(x[0]) if x else None))
        elif a.acao == "folha":
            r = E("(o) => SDK.folha(o)", {"caminho": os.path.abspath(x[0]).replace("\\", "/"), "largura": a.largura or 240, "colunas": a.colunas})
            print(json.dumps(r, ensure_ascii=False))
        elif a.acao == "foto":
            d = E("([n, l]) => SDK.foto(n, l)", [int(x[0]), a.largura or 960])
            r = E("([c, d]) => window.pywebview.api.sd_gravar_imagem(c, d)", [os.path.abspath(x[1]).replace("\\", "/"), d])
            print(r.get("path"))
        elif a.acao == "revisar":
            r = E("(n) => SDK.revisar(n == null ? {} : n)", int(x[0]) if x else None)
            print("ok" if r["ok"] else "\n".join(f"#{q['slide']} {q.get('id') or ''} [{q['tipo']}] {q['msg']}" for q in r["problemas"]))
        elif a.acao == "cmd":
            print(json.dumps(E("([n, a]) => SDK.cmd(n, a)", [x[0], json.loads(x[1]) if len(x) > 1 else {}]), ensure_ascii=False, default=str)[:4000])
        elif a.acao == "lote":
            print(json.dumps(E("(l) => SDK.lote(l)", json.load(open(x[0], encoding="utf-8"))), ensure_ascii=False)[:4000])
        elif a.acao == "cena":
            html = open(x[0], encoding="utf-8").read()
            estilo = "".join(re.findall(r"<style[^>]*>.*?</style>", html, re.S | re.I))
            partes = re.findall(r"<section[^>]*class=\"[^\"]*\bslide\b[^\"]*\"[^>]*>.*?</section>", html, re.S | re.I) or [html]
            out = []
            for i, h in enumerate(partes):   # a <section> inteira é a raiz: o fundo dela vira o fundo do slide
                op = {"slide": a.substituir + i} if a.substituir else {"novo": True}
                out.append(E("([h, o]) => SDK.cena(h, o)", [estilo + h, op])["slide"])
            print("slides:", out)
        elif a.acao == "js":
            print(json.dumps(E(f"async () => {{ return await ({x[0]}); }}"), ensure_ascii=False, default=str)[:6000])
        elif a.acao == "comandos":
            for k, v in E("SDK.comandos()").items():
                print(f"{k}: {v}")
        elif a.acao == "ajuda":
            print(E("SDK.ajuda()"))
        else:
            sys.exit("ação desconhecida; veja --help")


if __name__ == "__main__":
    main()
