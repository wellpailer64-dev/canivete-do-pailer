"""
Teste do Editor de Imagem (frontend/js/imagem-*.js + Functions/editor_imagem.py) no app de verdade.

    python testes/teste_imagem.py                       # abre o app sozinho em modo agente (porta 9333) e fecha no fim
    python testes/teste_imagem.py --sem-abrir           # usa um app já aberto (python main.py --agente=9333)
    python testes/teste_imagem.py --psd "<arquivo.psd>" # PSD para o teste de ida e volta (padrão: um gerado aqui)

O que faz (com o mouse e o teclado, como uma pessoa):
  1. gera um PSD com texto, objeto inteligente? não dá para gerar: usa camadas de pixels, grupo, máscara e corte;
     com --psd usa o arquivo dado (texto/objeto inteligente/forma de verdade);
  2. abre, compara a composição com o achatado do Photoshop;
  3. move uma camada (ferramenta Mover), pinta numa camada nova (Pincel), faz seleção retangular e apaga,
     adiciona máscara e pinta nela, transforma (Ctrl+T, escala por alça), cria texto, desfaz/refaz;
  4. salva como PSD numa pasta temporária e confere com o psd-tools: quantidade e tipo das camadas (texto continua
     texto, objeto inteligente continua objeto inteligente), posições, máscara e a composição salva;
  5. reabre o PSD salvo no editor e compara de novo.
Sai com 1 se algo falhar.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import warnings
import logging

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

FALHAS = []
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def ok(cond, msg):
    print(("  ok  " if cond else "  FALHOU  ") + msg, flush=True)
    if not cond:
        FALHAS.append(msg)


def gerar_psd(path):
    """PSD de teste: fundo, camada com transparência, grupo com camada, máscara e máscara de corte."""
    import numpy as np
    from PIL import Image
    from psd_tools import PSDImage
    from Functions import editor_imagem as ei
    psd = PSDImage.new("RGB", (800, 600), color=(255, 255, 255))
    fundo = np.zeros((600, 800, 4), np.uint8)
    fundo[..., 0] = np.linspace(30, 220, 800)[None, :]
    fundo[..., 1] = 90
    fundo[..., 2] = np.linspace(200, 40, 600)[:, None]
    fundo[..., 3] = 255
    ei._nova_pixel(psd, Image.fromarray(fundo, "RGBA"), "Fundo", 0, 0)
    circ = np.zeros((200, 200, 4), np.uint8)
    yy, xx = np.mgrid[:200, :200]
    dentro = (xx - 100) ** 2 + (yy - 100) ** 2 < 95 ** 2
    circ[dentro] = (250, 200, 30, 255)
    c = ei._nova_pixel(psd, Image.fromarray(circ, "RGBA"), "Círculo", 100, 120)
    c.create_mask(Image.fromarray(np.where(xx < 140, 255, 0).astype(np.uint8), "L"), top=120, left=100)
    from psd_tools.api.layers import Group
    g = Group.new(psd, "Grupo")
    q = np.zeros((150, 260, 4), np.uint8)
    q[...] = (40, 160, 90, 255)
    base = ei._nova_pixel(g, Image.fromarray(q, "RGBA"), "Base", 450, 300)
    lis = np.zeros((300, 300, 4), np.uint8)
    lis[::20] = (255, 255, 255, 255)
    cl = ei._nova_pixel(g, Image.fromarray(lis, "RGBA"), "Listras", 420, 250)
    cl.clipping = True
    from psd_tools.constants import BlendMode
    cl.blend_mode = BlendMode.OVERLAY
    g.extend([base, cl])
    psd.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--sem-abrir", action="store_true")
    ap.add_argument("--psd", default="")
    a = ap.parse_args()
    pasta = os.path.join(tempfile.gettempdir(), "canivete_teste_imagem")
    os.makedirs(pasta, exist_ok=True)
    origem = a.psd or os.path.join(pasta, "teste.psd")
    if not a.psd:
        gerar_psd(origem)
    salvo = os.path.join(pasta, "salvo.psd")
    if os.path.exists(salvo):
        os.remove(salvo)
    url = f"http://127.0.0.1:{a.porta}"
    app = None
    if not a.sem_abrir:
        app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={a.porta}"], cwd=RAIZ,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(url + "/json", timeout=1)
                break
            except Exception:
                time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(url)
            pg = None
            for _ in range(60):
                pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url), None)
                if pg:
                    break
                time.sleep(1)
            erros = []
            pg.on("pageerror", lambda e: erros.append(str(e)))
            pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
            for _ in range(60):
                if pg.evaluate("typeof ieAbrirArquivo === 'function' && !!window.pywebview?.api?.ie_abrir"):
                    break
                time.sleep(0.5)
            J = lambda code, *args: pg.evaluate(code, *args)
            J("switchTool('editor-imagem')")
            time.sleep(0.5)
            J("(async () => { for (const d of [...IE.docs]) await ieFecharDoc(d, true); })()")
            print("abrir", origem)
            r = J("async (a) => { const d = await ieAbrirArquivo(a); await new Promise(r => setTimeout(r, 300)); return {n: ieTodas(d).length, dif: ieDiferencaAchatado()}; }", origem.replace("\\", "/"))
            ok(r["n"] > 0, f"abriu com {r['n']} camadas")
            ok(r["dif"] is None or r["dif"]["media"] < 5, f"composição igual ao achatado (diferença {r['dif']})")
            n0 = r["n"]

            def tela(x, y):   # ponto do documento → coordenadas da página
                return J("([x, y]) => { const r = document.getElementById('ie-sobre').getBoundingClientRect(); const s = ieDocTela(x, y); return [r.left + s.x, r.top + s.y]; }", [x, y])

            def arrastar(x1, y1, x2, y2, passos=12, mods=()):
                for m in mods:
                    pg.keyboard.down(m)
                pg.mouse.move(*tela(x1, y1))
                pg.mouse.down()
                for k in range(1, passos + 1):
                    pg.mouse.move(*tela(x1 + (x2 - x1) * k / passos, y1 + (y2 - y1) * k / passos))
                pg.mouse.up()
                for m in mods:
                    pg.keyboard.up(m)
                time.sleep(0.15)

            def tecla(k):
                pg.locator("#ie-sobre").focus() if False else None
                pg.keyboard.press(k)
                time.sleep(0.15)

            J("document.getElementById('ie').focus()")
            W, H = J("[IE.doc.w, IE.doc.h]")
            # 1. mover: a camada do topo (ativa) 40 px para a direita
            J("ieEscolherFerr('mover'); IE.op.mover.auto = false; iePrefGravar('ajustar', false)")   # sem encaixe: deslocamento exato
            J("(() => { const t = ieTodas(IE.doc).filter(L => ieRaster0(L) && L.c && L.visivel); if (t.length) ieAtivar(t[t.length - 1].id); })()")
            antes = J("(() => { const L = ieAtiva(); return [L.nome, ieRCamada(L)]; })()")
            cx = antes[1]["x"] + antes[1]["w"] / 2 if antes[1] else W / 2
            cy = antes[1]["y"] + antes[1]["h"] / 2 if antes[1] else H / 2
            arrastar(cx, cy, cx + 40, cy + 10)
            depois = J("ieRCamada(ieAtiva())")
            ok(depois and antes[1] and depois["x"] - antes[1]["x"] == 40 and depois["y"] - antes[1]["y"] == 10, f"Mover: {antes[0]} andou 40,10 ({antes[1]} → {depois})")
            J("iePrefGravar('ajustar', true)")
            # 2. nova camada + pincel
            tecla("Control+Shift+N")
            ok(J("ieTodas(IE.doc).length") == n0 + 1, "Shift+Ctrl+N criou camada")
            J("ieEscolherFerr('pincel'); IE.op.pincel.tam = 30; IE.cor[0] = '#ff0000'")
            arrastar(W * 0.2, H * 0.3, W * 0.6, H * 0.35, passos=20)
            px = J("(() => { const L = ieAtiva(); return L.c ? [L.x, L.y, L.c.width, L.c.height, ieCtx(L.c).getImageData(Math.round(" + str(W * 0.4) + ") - L.x, Math.round(" + str(H * 0.325) + ") - L.y, 1, 1).data[0]] : null; })()")
            ok(px is not None and px[4] > 200, f"Pincel pintou vermelho ({px})")
            # 3. seleção retangular + Delete apaga só ali
            J("ieEscolherFerr('letreiro')")
            arrastar(W * 0.3, H * 0.25, W * 0.4, H * 0.45)
            ok(J("!!IE.doc.sel"), "Letreiro fez seleção")
            tecla("Delete")
            a1 = J(f"(() => {{ const L = ieAtiva(); const g = (x, y) => ieCtx(L.c).getImageData(Math.round(x) - L.x, Math.round(y) - L.y, 1, 1).data[3]; return [g({W*0.35}, {H*0.325}), g({W*0.5}, {H*0.33})]; }})()")
            ok(a1[0] == 0 and a1[1] > 200, f"Delete apagou só a seleção (alfa dentro/fora {a1})")
            tecla("Control+D")
            ok(J("!IE.doc.sel"), "Ctrl+D desmarcou")
            # 4. máscara + pintar de preto na máscara
            J("ieCmd('mascara')")
            ok(J("!!ieAtiva().m && IE.doc.mascaraAlvo"), "máscara adicionada e selecionada")
            J("ieEscolherFerr('pincel'); IE.cor[0] = '#000000'; IE.op.pincel.tam = 60")
            arrastar(W * 0.5, H * 0.2, W * 0.5, H * 0.5)
            vis = J(f"(() => {{ const L = ieAtiva(); const r = ieRaster(L); return ieCtx(r.c).getImageData(Math.round({W*0.5}) - r.x, Math.round({H*0.33}) - r.y, 1, 1).data[3]; }})()")
            ok(vis < 30, f"pintar preto na máscara escondeu os pixels (alfa {vis})")
            # 5. transformação: Ctrl+T e arrastar o canto direito-baixo
            J("IE.doc.mascaraAlvo = false")
            tecla("Control+T")
            ok(J("!!IE.transf"), "Ctrl+T abriu a transformação")
            k = J("(() => { const c = ieTransfCantos(IE.transf); return [c.br.x, c.br.y, c.tl.x, c.tl.y]; })()")
            arrastar(k[0], k[1], k[0] + (k[0] - k[2]) * 0.5, k[1] + (k[1] - k[3]) * 0.5)
            tecla("Enter")
            sx = J("IE.transf ? -1 : (ieAtiva().c ? ieAtiva().c.width : 0)")
            ok(not J("!!IE.transf") and sx > 0, f"transformação aplicada (largura agora {sx})")
            # 6. texto novo
            J("ieEscolherFerr('texto')")
            pg.mouse.click(*tela(W * 0.1, H * 0.85))
            time.sleep(0.6)
            pg.keyboard.type("Olá Canivete")
            pg.keyboard.press("Escape")
            time.sleep(0.4)
            t = J("(() => { const L = ieAtiva(); return {tipo: L.tipo, s: L.txt && L.txt.s, c: !!L.c}; })()")
            ok(t["tipo"] == "texto" and t["s"] == "Olá Canivete" and t["c"], f"texto criado ({t})")
            # 7. desfazer/refazer
            hi = J("IE.doc.hist.i")
            tecla("Control+Z")
            ok(J("IE.doc.hist.i") == hi - 1, "Ctrl+Z desfez")
            tecla("Control+Shift+Z")
            ok(J("IE.doc.hist.i") == hi, "Shift+Ctrl+Z refez")
            ok(J("ieAtiva() && ieAtiva().tipo === 'texto'"), "texto voltou depois de refazer")
            # 8. texto do PSD editado (se houver)
            tem_txt = J("ieTodas(IE.doc).some(L => L.texto && L.ref != null)")
            if tem_txt:
                J("(async () => { const L = ieTodas(IE.doc).find(L => L.texto && L.ref != null); ieEscolherFerr('texto'); await ieTextoEditar(L); document.getElementById('ie-texto-edit').value = 'TEXTO EDITADO'; document.getElementById('ie-texto-edit').dispatchEvent(new Event('input')); ieTextoEncerrar(true); })()")
                time.sleep(0.5)
            # 9. outras ferramentas e comandos (num documento novo, para não mexer no que vai ser salvo)
            extra = J("""async () => {
                const doc0 = IE.doc;
                const d = ieNovoDoc2('extra', 400, 300, 72, 'branco');
                const r = {};
                const L0 = ieAtiva(d);
                const px = (L, x, y) => { const p = ieCtx(L.c).getImageData(x - L.x, y - L.y, 1, 1).data; return [p[0], p[1], p[2], p[3]]; };
                // balde em branco com vermelho
                IE.cor[0] = '#ff0000'; IE_FERR.balde.down({x: 10, y: 10}, {}, d);
                r.balde = px(L0, 200, 150);
                // degradê preto→branco linear
                IE.cor = ['#000000', '#ffffff'];
                IE.deg = {a: {x: 0, y: 0}, b: {x: 400, y: 0}}; IE_FERR.degrade.up({x: 400, y: 0}, {}, d);
                r.degrade = [px(L0, 5, 150)[0], px(L0, 200, 150)[0], px(L0, 395, 150)[0]];
                // varinha na metade esquerda escura (contíguo, tolerância 60)
                IE.op.varinha.tol = 60; IE_FERR.varinha.down({x: 5, y: 150}, {}, d);
                r.varinha = d.sel && d.sel.bbox;
                ieSelNada();
                // laço poligonal
                IE.laco = null;
                for (const p of [{x: 50, y: 50}, {x: 150, y: 50}, {x: 150, y: 150}]) IE_FERR.lacoPoli.down(p, {}, d);
                ieLacoFechar(d);
                r.laco = d.sel && d.sel.bbox;
                ieSelNada();
                // forma retângulo
                IE.cor[0] = '#00ff00'; IE.op.forma.tipo = 'ret';
                IE.arr = {p0: {x: 20, y: 20}, r: {x: 20, y: 20, w: 60, h: 40}}; IE_FERR.forma.up({}, {}, d);
                const F = ieAtiva(d); r.forma = [F.nome, F.c.width, F.c.height, px(F, 50, 40)];
                // carimbo: copia a forma para outro lugar
                ieAtivar(F.id, d); IE.carimboFonte = {x: 50, y: 40}; IE.carimboOff = null; IE.op.carimbo.tam = 20; IE.op.carimbo.alinhado = false;
                ieTracoIniciar({x: 250, y: 200}, {}, d, 'carimbo'); ieTracoFim();
                r.carimbo = px(F, 250, 200);
                // filtro desfoque e ajuste inverter (direto, sem diálogo)
                const Rb = ieProcessarCamada(F, c => ieDesfocar(c, 4), 12, d); r.desfoque = [Rb.c.width > F.c.width];
                await IE_AJUSTES.inverter(); r.inverter = px(F, 50, 40);
                // mesclar para baixo, agrupar, desagrupar
                const nAntes = ieTodas(d).length; await IE_CMDS.mesclarBaixo(d); r.mesclar = [nAntes, ieTodas(d).length];
                IE_CMDS.novaCamada(d); IE_CMDS.agrupar(d); r.agrupar = ieAtiva(d).tipo; IE_CMDS.desagrupar(d); r.desagrupar = ieTodas(d).filter(L => L.tipo === 'grupo').length;
                // tamanho da imagem e girar 90°
                ieTransformarTudo(d, [0.5, 0, 0, 0.5, 0, 0], 200, 150); r.tam = [d.w, d.h];
                ieGirarImagem('g90h'); r.girar = [d.w, d.h];
                // cortar
                IE.corte = {r: {x: 10, y: 10, w: 100, h: 80}}; ieCorteAplicar(d); r.corte = [d.w, d.h];
                // desfazer tudo volta ao começo
                ieIrHist(0, d); r.voltou = [d.w, d.h, ieTodas(d).length];
                await ieFecharDoc(d, true);
                ieMostrarDoc(doc0);
                return r;
            }""")
            print("  extras:", extra)
            ok(extra["balde"][:3] == [255, 0, 0], "balde")
            ok(extra["degrade"][0] < 20 and 100 < extra["degrade"][1] < 160 and extra["degrade"][2] > 235, f"degradê {extra['degrade']}")
            ok(extra["varinha"] and extra["varinha"]["x"] == 0 and extra["varinha"]["w"] < 300, f"varinha {extra['varinha']}")
            ok(extra["laco"] and extra["laco"]["x"] == 50 and extra["laco"]["w"] == 100, f"laço {extra['laco']}")
            ok(extra["forma"][1:3] == [60, 40] and extra["forma"][3][1] == 255, f"forma {extra['forma']}")
            ok(extra["carimbo"][1] > 200, f"carimbo {extra['carimbo']}")
            ok(extra["inverter"][:3] == [255, 0, 255], f"inverter {extra['inverter']}")
            ok(extra["mesclar"][1] == extra["mesclar"][0] - 1, f"mesclar para baixo {extra['mesclar']}")
            ok(extra["agrupar"] == "grupo" and extra["desagrupar"] == 0, "agrupar/desagrupar")
            ok(extra["tam"] == [200, 150] and extra["girar"] == [150, 200] and extra["corte"] == [100, 80], f"tamanho/girar/cortar {extra['tam']} {extra['girar']} {extra['corte']}")
            ok(extra["voltou"] == [400, 300, 1], f"histórico voltou ao início {extra['voltou']}")
            # 8b. novidades: fatias, estilo de camada, controles da ferramenta Mover, miniaturas, fonte de verdade
            J("ieEscolherFerr('fatia')")
            arrastar(W * 0.1, H * 0.1, W * 0.4, H * 0.3)
            arrastar(W * 0.5, H * 0.6, W * 0.9, H * 0.9)
            fat = J("IE.doc.fatias.map(f => [f.x, f.y, f.w, f.h])")
            ok(len(fat) == 2, f"Fatia: duas fatias criadas arrastando ({fat})")
            J("IE.doc.fatias[0].nome = 'topo'")
            novo = J("""async () => {
                const L = ieTodas(IE.doc).filter(X => X.tipo === 'pixel' && X.c).pop();
                ieAtivar(L.id);
                // janela Estilo de camada (imagem-estilo.js): liga Traçado e Sombra projetada pelos itens da lista e dá OK
                await ieEstiloCamada(L);
                await new Promise(r => setTimeout(r, 200));
                for (const t of ['tracado', 'sombra']) document.querySelector(`#ie-modal .ie-ls-item[data-sel*='"${t}"'] span`).click();
                await new Promise(r => setTimeout(r, 100));
                document.querySelector('#ie-modal [data-ls=ok]').click();
                await new Promise(r => setTimeout(r, 100));
                ieEscolherFerr('mover');
                const R = ieCaixaAlvos(IE.doc);
                const mini = document.querySelector(`#ie-cam-lista canvas[data-mini="${L.id}"]`);
                return {nome: L.nome, fx: L.fx, caixa: R, mini: !!mini && mini.width > 34};
            }""")
            ok(novo["fx"] and novo["fx"].get("tracado") and novo["fx"].get("sombra") and J("!IE_LS.st && document.getElementById('ie-modal').hidden"), f"Estilo de camada: traçado e sombra em {novo['nome']} (janela fechou no OK)")
            ok(novo["caixa"] is not None and novo["mini"], f"controles do Mover e miniatura em alta ({novo['caixa']})")
            # alça do canto: arrastar entra na Transformação livre; Esc cancela
            c = novo["caixa"]
            arrastar(c["x"] + c["w"], c["y"] + c["h"], c["x"] + c["w"] * 1.2, c["y"] + c["h"] * 1.2)
            ok(J("!!IE.transf"), "alça da ferramenta Mover abriu a transformação")
            tecla("Escape")
            ok(J("!IE.transf"), "Esc cancelou")
            fonte = J("""async () => { await ieCarregarFontes(); const t = {fam: 'Arial', estilo: 'Regular', tam: 40}; ieAplicarEstiloFonte(t, 'Arial', ieEstiloDe('Arial', 'Regular')); return await ieGarantirFonte(t); }""")
            ok(fonte, "fonte carregada do arquivo (FontFace)")
            n_final = J("ieTodas(IE.doc).length")
            comp = J("(() => { ieCompor(IE.doc); return ieCtx(IE.doc.comp).getImageData(0, 0, IE.doc.w, IE.doc.h).data.reduce((s, v) => s + v, 0); })()")
            # 9. salvar como (o diálogo de arquivo é trocado por um caminho fixo)
            J("(p) => { window.__ieDestino = p; const api = window.pywebview.api; if (!api.__orig) { api.__orig = api.ie_dialogo_salvar; api.ie_dialogo_salvar = async () => ({success: true, path: window.__ieDestino}); } }", salvo.replace("\\", "/"))
            r = J("async () => { const ok = await ieSalvar(true); return {ok, av: IE.doc.avisosSalvar, sujo: IE.doc.sujo}; }")
            ok(r["ok"] and os.path.isfile(salvo), f"salvou PSD ({r})")
            # 10. conferir com o psd-tools
            from psd_tools import PSDImage
            import numpy as np
            sp = PSDImage.open(salvo)
            orig = PSDImage.open(origem)
            ls = list(sp.descendants())
            ok(len(ls) == n_final, f"camadas no arquivo: {len(ls)} (editor {n_final})")
            ko = {}
            for l in orig.descendants():
                ko[l.kind] = ko.get(l.kind, 0) + 1
            ks = {}
            for l in ls:
                ks[l.kind] = ks.get(l.kind, 0) + 1
            for kind in ("type", "smartobject", "shape", "group"):
                if ko.get(kind):
                    ok(ks.get(kind, 0) >= ko[kind] - 0, f"{kind}: {ko.get(kind)} no original, {ks.get(kind, 0)} no salvo (continua editável)")
            if tem_txt:
                textos = [l.text for l in ls if l.kind == "type"]
                ok(any("TEXTO EDITADO" in t for t in textos), "texto do Photoshop trocado e ainda é camada de texto")
            ok(any(l.has_mask() for l in ls), "máscara salva")
            ok(any(l.name.startswith("Olá") for l in ls), "camada de texto nova salva")
            from Functions import editor_imagem as ei, psd_import as pi
            fs = ei._ler_fatias(sp)
            ok(len(fs) == 2 and fs[0]["nome"] == "topo", f"fatias no PSD salvo ({fs})")
            com_fx = [l for l in ls if l.name == novo["nome"]]
            ok(com_fx and "contorno" in pi._params_efeitos(com_fx[0], 120), f"estilo de camada salvo ({com_fx and pi._params_efeitos(com_fx[0], 120)})")
            m = np.asarray(sp.topil().convert("RGB")).astype(int)
            ok(m.shape[0] == orig.height and m.shape[1] == orig.width, "tamanho do documento")
            # 11. reabrir o salvo
            J("(async () => { for (const d of [...IE.docs]) await ieFecharDoc(d, true); })()")
            time.sleep(0.3)
            r = J("async (a) => { const d = await ieAbrirArquivo(a); await new Promise(r => setTimeout(r, 300)); return {n: ieTodas(d).length, dif: ieDiferencaAchatado()}; }", salvo.replace("\\", "/"))
            ok(r["n"] == n_final, f"reabriu com {r['n']} camadas")
            ok(r["dif"] is not None and r["dif"]["media"] < 3, f"reaberto igual ao salvo (diferença {r['dif']})")
            J("(() => { const api = window.pywebview.api; if (api.__orig) { api.ie_dialogo_salvar = api.__orig; delete api.__orig; } })()")
            J("(async () => { for (const d of [...IE.docs]) await ieFecharDoc(d, true); })()")
            ok(not [e for e in erros if "editor de imagem" in e or "imagem-" in e], f"sem erros de JavaScript ({erros[:3]})")

    finally:
        if app:
            subprocess.run(["taskkill", "/PID", str(app.pid), "/T", "/F"], capture_output=True)
    print("\n" + ("PASSOU" if not FALHAS else f"FALHOU ({len(FALHAS)}): " + "; ".join(FALHAS)))
    sys.exit(1 if FALHAS else 0)


if __name__ == "__main__":
    main()
