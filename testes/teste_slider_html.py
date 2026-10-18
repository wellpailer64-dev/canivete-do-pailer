"""Slider › Exportar › Apresentação (HTML): monta uma apresentação com foto, GIF, vídeo, animações (automática e de
clique), transições, slide oculto e notas no app de teste, exporta o .html e abre num navegador À PARTE (sem o app),
como PC e como celular (toque), conferindo: tela inicial, avançar por PageDown (passos e slides), slide oculto pulado,
ocultar/mostrar na grade, vídeo tocando, GIF carregado, fontes embutidas, notas, sem erro de JS.
    py -3.13 testes/teste_slider_html.py [--porta 9333]   (app em --agente=9333)
"""
import argparse, os, subprocess, sys, time
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument("--porta", type=int, default=9333); a = ap.parse_args()
OUT = "D:/kanivete_testes/slider_html"; os.makedirs(OUT, exist_ok=True)
falhas = []
def ok(cond, nome, extra=""):
    print(("  ok  " if cond else "  FALHOU ") + nome + (f"  ({extra})" if extra else ""), flush=True)
    if not cond: falhas.append(nome)

from Functions.midia import ffmpeg
FF = ffmpeg()
def gerar(arq, args):
    p = f"{OUT}/{arq}"
    if not os.path.isfile(p):
        subprocess.run([FF, "-y", "-loglevel", "error", *args, p], check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return p
PNG = gerar("foto.png", ["-f", "lavfi", "-i", "testsrc2=s=1280x720", "-frames:v", "1"])
GIF = gerar("anim.gif", ["-f", "lavfi", "-i", "testsrc=s=320x240:r=10:d=2"])
MP4 = gerar("clipe.mp4", ["-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=4", "-f", "lavfi", "-i", "sine=f=440:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"])
HTML = f"{OUT}/Palestra teste.html"

with sync_playwright() as p:
    print("montar e exportar (app)")
    pg = next(x for c in p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}").contexts for x in c.pages if "index.html" in x.url)
    pg.set_default_timeout(180000)
    pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.SDK)")
    E = lambda js, arg=None: pg.evaluate(js, arg)
    E("switchTool('slider-kanivete')"); time.sleep(1)
    r = E("""async ([png, gif, mp4]) => {
        await SDK.cmd('modelo', {tema: 'escuro', nome: 'Palestra teste'}); if (window.SDK_UI) SDK_UI.editor();
        const t = await SDK.cmd('texto', {texto: 'Entra no clique', x: 140, y: 820, w: 900, h: 100, tam: 64, slide: 3});
        const i = await SDK.cmd('imagem', {src: png, x: 1100, y: 120, w: 640, h: 360, slide: 3});
        const g = await SDK.cmd('imagem', {src: gif, x: 140, y: 420, w: 320, h: 240, slide: 3});
        const v = await SDK.cmd('video', {src: mp4, x: 1100, y: 560, w: 640, h: 360, slide: 4, loop: true, mudo: true, auto: true});
        await SDK.cmd('animacao', {ids: [i.id], slide: 3, tipo: 'subir', dur: 0.5});
        await SDK.cmd('animacao', {ids: [t.id], slide: 3, tipo: 'esmaecer', dur: 0.4, clique: true});
        await SDK.cmd('slide_transicao', {tipo: 'deslizar', todos: true});
        await SDK.cmd('slide_props', {slide: 5, oculto: true});
        await SDK.cmd('slide_props', {slide: 3, notas: 'Lembrar de falar do GIF'});
        return {t: t.id, i: i.id, v: v.id}; }""", [PNG, GIF, MP4])
    ids = r
    t0 = time.time()
    ex = E("p => SDK.cmd('exportar', {formato: 'html', caminho: p})", HTML)
    ok(ex and os.path.isfile(HTML), "exportou o .html", f"{ex.get('tamanho')} em {time.time() - t0:.1f}s")
    slides_app = E("SD.doc.slides.length"); ocultos_app = E("SD.doc.slides.filter(s => s.oculto).length")

    print("abrir num navegador à parte: PC")
    br = p.chromium.launch(channel="msedge")   # o Edge do Windows: navegador de verdade, fora do app
    ctx = br.new_context(viewport={"width": 1600, "height": 900})
    w = ctx.new_page(); erros = []
    w.on("pageerror", lambda e: erros.append(str(e)))
    w.goto("file:///" + HTML.replace("\\", "/"))
    w.wait_for_function("!!window.SLIDER_PLAYER")
    st = w.evaluate("SLIDER_PLAYER.estado()")
    ok(st["inicio"] and st["total"] == slides_app - ocultos_app, "tela inicial; slide oculto fora da lista", st)
    w.screenshot(path=f"{OUT}/1_inicio.png")
    fams = E("[SD.doc.tema.titulo, SD.doc.tema.texto]")
    emb = w.evaluate("[...new Set([...document.fonts].map(f => f.family.replace(/\"/g, '')))]")
    ok(all(f in emb for f in fams), "fontes do tema embutidas", f"{fams} em {emb}")
    w.click("#i-ir"); time.sleep(1.2)
    st = w.evaluate("SLIDER_PLAYER.estado()")
    ok(not st["inicio"] and st["i"] == 0, "Apresentar começa no 1º slide")
    w.screenshot(path=f"{OUT}/2_capa.png")
    w.keyboard.press("PageDown"); time.sleep(0.9); w.keyboard.press("PageDown"); time.sleep(1.4)
    st = w.evaluate("SLIDER_PLAYER.estado()")
    ok(st["i"] == 2 and st["passo"] == 0, "PageDown passa os slides", st)
    ok(w.evaluate("(() => { const g = [...document.querySelectorAll('#palco .sd-slide:last-child img')].find(i => i.naturalWidth === 320); return !!g; })()"), "GIF carregado")
    ok(w.evaluate(f"getComputedStyle(document.querySelector('#palco .sd-slide:last-child [data-id=\"{ids['t']}\"]')).opacity") == "0", "texto de clique escondido antes do passo")
    w.keyboard.press("PageDown"); time.sleep(0.8)
    ok(w.evaluate("SLIDER_PLAYER.estado().passo") == 1 and float(w.evaluate(f"getComputedStyle(document.querySelector('#palco .sd-slide:last-child [data-id=\"{ids['t']}\"]')).opacity")) > 0.9, "PageDown revela o passo de clique")
    w.screenshot(path=f"{OUT}/3_midias.png")
    w.keyboard.press("n"); time.sleep(0.3)
    ok("GIF" in w.inner_text("#n-txt"), "notas do apresentador (N)")
    w.keyboard.press("n")
    w.keyboard.press("PageDown"); time.sleep(2.5)
    vt = w.evaluate("(() => { const v = document.querySelector('#palco .sd-slide:last-child video'); return v ? [v.currentTime, v.paused, v.readyState, v.videoWidth] : null; })()")
    ok(vt and vt[0] > 0.5 and not vt[1] and vt[3] == 1280, "vídeo toca sozinho (blob H.264)", vt)
    w.screenshot(path=f"{OUT}/4_video.png")
    w.keyboard.press("PageDown"); time.sleep(1.2)
    st = w.evaluate("SLIDER_PLAYER.estado()")
    tit = w.evaluate("(() => { const id = document.querySelector('#palco .sd-slide:last-child').dataset.slide; return id; })()")
    ocultoId = E("SD.doc.slides[4].id")
    ok(tit != ocultoId and st["i"] == 4, "slide oculto pulado na apresentação", st)
    w.keyboard.press("PageUp"); time.sleep(1.2)
    ok(w.evaluate("SLIDER_PLAYER.estado().i") == 3, "PageUp volta")
    print("grade: ocultar e mostrar")
    w.keyboard.press("g"); time.sleep(0.5)
    ok(w.locator("#grade .it").count() == slides_app, "grade mostra todos os slides (inclusive o oculto)")
    w.screenshot(path=f"{OUT}/5_grade.png")
    w.click("#grade .it:nth-child(5) .olho"); time.sleep(0.3)
    ok(w.evaluate("SLIDER_PLAYER.estado().total") == slides_app, "mostrar o oculto volta para a lista")
    w.click("#grade .it:nth-child(2) .olho"); time.sleep(0.3)
    ok(w.evaluate("SLIDER_PLAYER.estado().total") == slides_app - 1, "ocultar um slide tira da lista")
    w.reload(); w.wait_for_function("!!window.SLIDER_PLAYER")
    ok(w.evaluate("SLIDER_PLAYER.estado().total") == slides_app - 1, "ocultos lembrados ao reabrir")
    ok(not erros, "sem erro de JS (PC)", erros[:3])
    ctx.close()

    print("celular (toque)")
    cel = p.devices["iPhone 13"]
    ctx = br.new_context(**{**cel, "viewport": {"width": 844, "height": 390}})   # deitado
    m = ctx.new_page(); erros = []
    m.on("pageerror", lambda e: erros.append(str(e)))
    m.goto("file:///" + HTML.replace("\\", "/")); m.wait_for_function("!!window.SLIDER_PLAYER")
    m.screenshot(path=f"{OUT}/6_cel_inicio.png")
    m.tap("#i-ir"); time.sleep(1.2)
    m.mouse.click(700, 200); time.sleep(1.2)       # toque à direita avança
    ok(m.evaluate("SLIDER_PLAYER.estado().i") == 1, "toque à direita avança")
    m.mouse.click(60, 200); time.sleep(1.2)
    ok(m.evaluate("SLIDER_PLAYER.estado().i") == 0, "toque à esquerda volta")
    pal = m.evaluate("(() => { const r = document.getElementById('palco').getBoundingClientRect(); return [r.width, r.height]; })()")
    ok(abs(pal[0] / pal[1] - 16 / 9) < 0.02 and pal[1] <= 390.5, "slide 16:9 cabe na tela do celular", pal)
    m.screenshot(path=f"{OUT}/7_cel_slide.png")
    ok(not erros, "sem erro de JS (celular)", erros[:3])
    br.close()

print("\nRESULTADO:", "OK" if not falhas else f"{len(falhas)} FALHA(S): " + "; ".join(falhas))
sys.exit(1 if falhas else 0)
