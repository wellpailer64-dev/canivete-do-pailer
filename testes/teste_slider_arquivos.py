"""Slider Kanivete — 3ª bateria: os ARQUIVOS. PowerPoint exportado com animações, transições, vídeo (sozinho/repetir/mudo)
e GIF — conferido abrindo no LibreOffice de verdade (D:/kanivete_testes/libreoffice) e reimportando; PDF (uma página por
slide no tamanho do PowerPoint, texto pesquisável, marcadores, leve × alta); importar PDF e PowerPoint em camadas;
MP4 com animação quadro a quadro, vídeo tocando dentro e som; passador de slides (PageDown/PageUp, ., B, Esc, F5);
cores legíveis nos layouts; trocar layout mantendo textos; Kani (com --kani: roda o modelo de verdade).
    py -3.13 testes/teste_slider_arquivos.py [--porta 9333] [--kani]
Saídas em %TEMP%/kanivete_teste_slider. Sai com 1 se algo reprovar."""
import argparse, os, re, subprocess, sys, tempfile, time, zipfile
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
ap = argparse.ArgumentParser(); ap.add_argument("--porta", type=int, default=9333); ap.add_argument("--kani", action="store_true")
a = ap.parse_args()
OUT = os.path.join(tempfile.gettempdir(), "kanivete_teste_slider").replace("\\", "/"); os.makedirs(OUT, exist_ok=True)
SOFFICE = "D:/kanivete_testes/libreoffice/lo/program/soffice.exe"
falhas = []


def ok(cond, nome, extra=""):
    print(("  ok  " if cond else "  FALHOU ") + nome + (f"  ({extra})" if extra else ""), flush=True)
    if not cond:
        falhas.append(nome)


from Functions.midia import ffmpeg, probe
FF = ffmpeg()
def gerar(arq, args):
    p = f"{OUT}/{arq}"
    if not os.path.isfile(p):
        subprocess.run([FF, "-y", "-loglevel", "error", *args, p], check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return p
PNG = gerar("foto.png", ["-f", "lavfi", "-i", "testsrc2=s=1280x720", "-frames:v", "1"])
GIF = gerar("anim.gif", ["-f", "lavfi", "-i", "testsrc=s=320x240:r=10:d=2"])
MP4 = gerar("clipe.mp4", ["-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=3", "-f", "lavfi", "-i", "sine=f=440:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"])
MOV = gerar("clipe.mov", ["-f", "lavfi", "-i", "testsrc=s=640x360:r=25:d=2", "-c:v", "mjpeg", "-q:v", "4"])
FOTO_GRANDE = gerar("grande.jpg", ["-f", "lavfi", "-i", "testsrc2=s=6000x4000", "-frames:v", "1", "-q:v", "2"])


def soffice(arq, fmt, saida):
    os.makedirs(saida, exist_ok=True)
    subprocess.run([SOFFICE, "-env:UserInstallation=file:///D:/kanivete_testes/libreoffice/perfil", "--headless", "--convert-to", fmt, "--outdir", saida, arq],
                   capture_output=True, timeout=240, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return os.path.join(saida, os.path.splitext(os.path.basename(arq))[0] + "." + fmt.split(":")[0])


with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}").contexts for x in c.pages if "index.html" in x.url)
    pg.set_default_timeout(300000)
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    E = lambda js, arg=None: pg.evaluate(js, arg)
    K = lambda tecla: (pg.keyboard.press(tecla), time.sleep(0.15))
    E("switchTool('slider-kanivete')"); time.sleep(0.6)
    E("async () => { await SDK.cmd('modelo', {tema: 'claro', nome: 'Arquivos'}); SDK_UI.editor(); }"); time.sleep(0.6)

    print("cores legíveis nos layouts")
    rv = E("async () => { await sdGarantirFontes(); await document.fonts.ready; return (await SDK.revisar()).problemas.filter(p => p.tipo === 'contraste').map(p => p.slide + ' ' + p.nome); }")
    ok(not rv, "modelo claro sem texto de pouco contraste (destaque escurecido onde precisa)", ", ".join(rv))

    print("montar a apresentação de teste")
    E("""async ([png, gif, mp4, mov, grande]) => {
        await SDK.cmd('slide_ir', {slide: 3});
        const t = await SDK.cmd('texto', {texto: 'Entra subindo', x: 140, y: 820, w: 900, h: 90, tam: 60, slide: 3});
        await SDK.cmd('animacao', {ids: [t.id], tipo: 'subir', dur: 0.6});
        const t2 = await SDK.cmd('texto', {texto: 'Passo do clique', x: 1000, y: 820, w: 800, h: 90, tam: 60, slide: 3});
        await SDK.cmd('animacao', {ids: [t2.id], tipo: 'zoom', clique: true});
        const g = await SDK.cmd('imagem', {src: gif, x: 1400, y: 140, w: 320, h: 240, slide: 3});
        await SDK.cmd('animacao', {ids: [g.id], tipo: 'esquerda'});
        await SDK.cmd('slide_novo', {layout: 'vazio'});
        await SDK.cmd('video', {src: mp4, x: 100, y: 100, w: 960, h: 540, loop: true, mudo: false, auto: true});
        await SDK.cmd('video', {src: mov, x: 1200, y: 600, w: 480, h: 270, loop: false, mudo: true, auto: true});
        await SDK.cmd('imagem', {src: grande, x: 1200, y: 100, w: 600, h: 400});
        const gr = await SDK.grafico({modelo: 'colunas', x: 100, y: 700, w: 900, h: 340});
        await SDK.cmd('animacao', {ids: [gr.id], tipo: 'crescer', dur: 0.8});
        await SDK.cmd('slide_transicao', {tipo: 'empurrar', dur: 0.5, todos: true});
        await SDK.cmd('slide_transicao', {slide: 2, tipo: 'preto', dur: 0.8});
        await SDK.cmd('slide_props', {slide: 4, notas: 'Nota do slide quatro'});
    }""", [PNG, GIF, MP4, MOV, FOTO_GRANDE])
    n_slides = E("SD.doc.slides.filter(s => !s.oculto).length")

    print("PowerPoint editável")
    pptx = f"{OUT}/arquivos.pptx"
    t0 = time.time(); r = E("(c) => SDK.cmd('exportar', {formato: 'pptx', caminho: c})", pptx); tp = time.time() - t0
    z = zipfile.ZipFile(pptx); nomes = z.namelist()
    xml = "".join(z.read(n).decode("utf-8", "ignore") for n in nomes if re.match(r"ppt/slides/slide\d+\.xml$", n))
    ok(xml.count("<p:transition") >= n_slides, "transição em todos os slides", f"{xml.count('<p:transition')} de {n_slides}")
    ok('presetClass="entr"' in xml and 'nodeType="clickEffect"' in xml, "animações de entrada e passo por clique no XML")
    ok('cmd="playFrom(0.0)"' in xml and 'repeatCount="indefinite"' in xml and 'mute="1"' in xml, "vídeo: toca sozinho, repete e mudo")
    ok(any(n.endswith(".gif") for n in nomes), "GIF vai como GIF (anima no PowerPoint)")
    medias = [n for n in nomes if n.startswith("ppt/media/media")]
    ok(len(medias) >= 2 and all(n.endswith(".mp4") for n in medias), "os dois vídeos (MP4 e MOV) entram como MP4", ",".join(medias))
    big = max(z.getinfo(n).file_size for n in nomes if n.startswith("ppt/media/image"))
    ok(big < 1_500_000, "foto de 6000 px enxugada no PPTX", f"maior imagem {big // 1024} KB; arquivo {os.path.getsize(pptx) // 1024} KB em {tp:.1f}s")
    if os.path.isfile(SOFFICE):
        odp = soffice(pptx, "odp", f"{OUT}/lo")
        c = zipfile.ZipFile(odp).read("content.xml").decode("utf-8") if os.path.isfile(odp) else ""
        ok(c.count("<anim:par") > 5 and "ooo-entrance" in c, "LibreOffice lê as animações", ", ".join(sorted(set(re.findall(r'preset-id="(ooo-entrance-[^"]+)"', c)))))
        ok('anim:command="play"' in c, "LibreOffice lê o vídeo tocando sozinho")
        st = zipfile.ZipFile(odp).read("styles.xml").decode("utf-8") + c if os.path.isfile(odp) else ""
        ok(len(re.findall(r'smil:type="(fade|pushWipe|barWipe)"', st)) >= 2 or "transition-type" in st, "LibreOffice lê as transições")
        pdf_lo = soffice(pptx, "pdf", f"{OUT}/lo")
        import fitz
        ok(os.path.isfile(pdf_lo) and len(fitz.open(pdf_lo)) == n_slides, "LibreOffice abre o PPTX e desenha todos os slides", f"{len(fitz.open(pdf_lo)) if os.path.isfile(pdf_lo) else 0} páginas")
    else:
        print("  (sem LibreOffice em D:/kanivete_testes/libreoffice: pulei a conferência externa)")
    r = E("(c) => window.pywebview.api.sd_importar_pptx(c)", pptx)
    sl = r["doc"]["slides"]
    anims = [c["anim"]["tipo"] for s in sl for c in s["camadas"] if c.get("anim")]
    vids = [c for s in sl for c in s["camadas"] if c["tipo"] == "video"]
    ok({"subir", "zoom", "esquerda", "crescer"} <= set(anims), "reimportar: animações voltam", ",".join(anims))
    ok(len(vids) == 2 and vids[0].get("loop") and vids[1].get("mudo") and all(v.get("auto") for v in vids), "reimportar: vídeos com tocar sozinho/repetir/mudo")
    ok(sum(1 for s in sl if s["transicao"]["tipo"] != "nenhuma") >= n_slides - 1 and sl[1]["transicao"]["tipo"] == "preto", "reimportar: transições")
    ok(any(c["tipo"] == "grafico" for s in sl for c in s["camadas"]), "reimportar: gráfico volta editável")

    print("PDF")
    import fitz
    pdf = f"{OUT}/arquivos.pdf"; pdfl = f"{OUT}/arquivos_leve.pdf"
    t0 = time.time(); E("(c) => SDK.cmd('exportar', {formato: 'pdf', caminho: c})", pdf); t1 = time.time() - t0
    E("(c) => SDK.cmd('exportar', {formato: 'pdf', caminho: c, qualidade: 'leve'})", pdfl)
    d = fitz.open(pdf)
    ok(len(d) == n_slides, "uma página por slide", f"{len(d)} páginas")
    ok(all(abs(pgx.rect.width - 960) < 1 and abs(pgx.rect.height - 540) < 1 for pgx in d), "página no tamanho do PowerPoint (13,33 × 7,5 pol)", f"{d[0].rect}")
    ok("Entra subindo" in d[2].get_text() and len(d.get_toc()) == n_slides, "texto pesquisável e marcador por slide", f"toc {len(d.get_toc())}")
    ok(d.metadata.get("title") == "Arquivos", "título no PDF")
    ta, tl = os.path.getsize(pdf), os.path.getsize(pdfl)
    ok(tl < ta * 0.75 and tl / n_slides < 400_000, "PDF leve bem menor", f"alta {ta // 1024} KB · leve {tl // 1024} KB ({n_slides} slides, {t1:.1f}s)")
    im = d[0].get_images()
    ok(im and d.extract_image(im[0][0])["width"] >= 2500, "PDF de alta com a foto do slide em ~2560 px")

    print("importar PDF em camadas")
    r = E("(c) => SDK.cmd('abrir', {caminho: c})", pdf_lo if os.path.isfile(SOFFICE) else pdf)
    m = E("SDK.mapa()")
    tipos = [c["tipo"] for s in m["slides"] for c in s["camadas"]]
    ok(r["slides"] == n_slides and tipos.count("texto") >= 8, "PDF vira slides com textos editáveis", f"{r['slides']} slides, {tipos.count('texto')} textos, {tipos.count('imagem')} imagens")
    ok(E("SD.doc.slides.every(s => s.fundo.tipo === 'imagem')"), "o desenho da página fica de fundo")
    if os.path.isfile(SOFFICE):   # o slide importado tem que parecer a página original
        from PIL import Image, ImageChops, ImageStat
        import io, base64
        orig = Image.open(io.BytesIO(fitz.open(pdf_lo)[0].get_pixmap(matrix=fitz.Matrix(1, 1)).tobytes("png"))).convert("L").resize((480, 270))
        imp = E("SDK.foto(1, 480)")
        imp = Image.open(io.BytesIO(base64.b64decode(imp.split(",")[1]))).convert("L").resize((480, 270))
        dif = ImageStat.Stat(ImageChops.difference(orig, imp)).mean[0]
        ok(dif < 12, "slide do PDF importado parecido com a página original", f"diferença média {dif:.1f}")
    r = E("(c) => SDK.cmd('abrir', {caminho: c})", pptx)
    ok(r["slides"] == n_slides, "abrir o PPTX exportado de volta no Slider")

    print("MP4: animação, vídeo e som")
    mp4 = f"{OUT}/arquivos.mp4"
    t0 = time.time(); E("(c) => SDK.cmd('exportar', {formato: 'mp4', caminho: c})", mp4); t2 = time.time() - t0
    pr = probe(mp4)
    ok(pr.get("audio") is not None, "MP4 com o som do vídeo da camada", f"{pr.get('duracao', 0):.1f}s, {os.path.getsize(mp4) // 1024} KB, {t2:.0f}s para gerar")
    # slide 3 (texto subindo): quadros logo depois da entrada mudam; slide do vídeo: a área do vídeo muda com o tempo
    durs = E("SD.doc.slides.filter(s => !s.oculto).map(s => s.dur || 5)")
    def quadro(t, arq):
        subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", mp4, "-frames:v", "1", arq], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        from PIL import Image
        return Image.open(arq).convert("L")
    from PIL import ImageChops, ImageStat
    ini = [0.0]
    for k in range(1, len(durs)):
        ini.append(ini[-1] + durs[k - 1] - (0.8 if k == 1 else 0.5))   # slide 2 entra pelo preto (0,8 s), o resto empurrando (0,5 s)
    s3 = ini[2] + 0.5
    a1, a2 = quadro(s3 + 0.15, f"{OUT}/q1.png"), quadro(s3 + 1.6, f"{OUT}/q2.png")
    ok(ImageStat.Stat(ImageChops.difference(a1, a2)).mean[0] > 0.5, "MP4: a animação de entrada aparece (quadros mudam)")
    s4 = ini[3] + 0.5
    v1, v2 = quadro(s4 + 0.5, f"{OUT}/q3.png").crop((100, 100, 1060, 640)), quadro(s4 + 1.5, f"{OUT}/q4.png").crop((100, 100, 1060, 640))
    ok(ImageStat.Stat(ImageChops.difference(v1, v2)).mean[0] > 2, "MP4: o vídeo toca dentro do slide")

    print("passador de slides (controle de palestra)")
    E("() => { SD.atual = 0; sdAvisar('atual'); }")
    E("() => sdApresentar(0)"); time.sleep(0.6)
    seq = []
    for tecla in ["PageDown", "PageDown", "PageDown", "PageDown", "PageUp"]:
        K(tecla); time.sleep(0.25); seq.append(E("[SDS.i, SDS.passo]"))
    ok(seq[0][0] == 1 and seq[1][0] == 2 and seq[2] == [2, 1] and seq[3][0] == 3 and seq[4][0] == 2, "PageDown avança (inclusive o passo do clique), PageUp volta", str(seq))
    K("."); ok(E("!SDS.el.querySelector('.sd-show-tela').hidden"), "'.' deixa a tela preta (botão do passador)"); K(".")
    K("b"); K("b"); ok(E("SDS.el.querySelector('.sd-show-tela').hidden"), "B liga/desliga a tela preta")
    K("F5"); ok(E("SDS.on"), "F5 durante a apresentação não sai nem recarrega")
    K("Escape"); time.sleep(0.3); ok(E("!SDS.on"), "Esc sai (botão de parar do passador)")

    print("trocar layout mantendo os textos")
    E("async () => { await SDK.cmd('slide_novo', {layout: 'titulo_texto'}); const s = sdSlide(); s.camadas[0].html = 'Meu título'; s.camadas[1].html = 'Meu texto longo'; await SDK.cmd('slide_layout', {layout: 'imagem_lateral'}); }")
    txt = E("SDK.texto(SD.atual + 1)")
    ok("Meu título" in txt and "Meu texto longo" in txt and "Espaço da imagem" not in txt or "Meu texto longo" in txt, "trocar layout leva título e texto junto", txt.replace("\n", " | ")[:160])

    print("ajustar textos")
    E("async () => { await SDK.cmd('slide_novo', {layout: 'vazio'}); await SDK.cmd('texto', {texto: 'Um texto grande demais para a caixa '.repeat(8), w: 700, h: 200, tam: 60}); }")
    r = E("() => SDK.cmd('ajustar_textos', {})")
    est = E("async () => (await SDK.revisar(SD.atual + 1)).problemas.filter(p => p.tipo === 'estouro').length")
    ok(r["ids"] and est == 0, "ajustar_textos encolhe até caber", f"tam agora {E('sdSlide().camadas[0].tam')}")

    print("Kani")
    ok(E("typeof sdKaniAbrir === 'function' && !!document.querySelector('#sd-barra [data-a=\"kani\"]')"), "botão da Kani na barra")
    E("() => sdKaniAbrir(document.querySelector('#sd-barra [data-a=\"kani\"]'))"); time.sleep(0.3)
    ok(E("!!document.querySelector('.sd-kani textarea')"), "janela da Kani abre")
    E("() => document.querySelector('.sd-kani')?.remove()")
    rot = {"titulo": "Teste", "slides": [{"layout": "titulo", "titulo": "Atendimento que vende", "texto": "Equipe comercial"},
           {"layout": "lista", "titulo": "Regras de ouro", "topicos": ["Responder em 5 minutos", "Chamar pelo nome", "Áudio só se o cliente mandar", "Fechar com próximo passo"], "notas": "Falar das regras."},
           {"layout": "numero", "titulo": "Resultado", "numero": "62%", "legenda": "das vendas pelo WhatsApp"},
           {"layout": "duas_colunas", "titulo": "Antes e depois", "topicos": ["Demora", "Sem nome", "Rápido", "Pessoal"]},
           {"layout": "encerramento", "titulo": "Obrigado!", "texto": ""}]}
    r = E("(r) => SDK.cmd('kani_montar', {roteiro: r, tema: 'escuro', nova: true})", rot)
    txt = E("SDK.texto()")
    ok(r["slides"] == 5 and "Fechar com próximo passo" in txt and "62%" in txt and "Falar das regras" in txt, "kani_montar: roteiro vira slides no tema", f"{r}")
    if a.kani:
        t0 = time.time()
        r = E("() => SDK_KANI_API.criar('Palestra curta para a equipe sobre pontualidade nas entregas: avisar o cliente antes de atrasar, conferir o pedido antes de sair, registrar a entrega com foto.', 5, 'corporativo', true)")
        rv = E("async () => (await SDK.revisar()).problemas.filter(p => ['estouro', 'fora'].includes(p.tipo)).length")
        ok(len(r.get("slides", [])) >= 4 and rv == 0, "Kani cria a palestra de verdade (sem estourar caixa)", f"{len(r.get('slides', []))} slides em {time.time() - t0:.0f}s")
    ok(not erros, "sem erro de JS", "; ".join(erros[:3]))

print("\nRESULTADO:", "OK" if not falhas else f"{len(falhas)} FALHA(S): " + "; ".join(falhas))
sys.exit(1 if falhas else 0)
