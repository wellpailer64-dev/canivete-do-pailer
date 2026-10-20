"""Briefing barato de uma pasta do cliente: lê PDF/imagens/áudios/vídeos e devolve UM resumo em texto + poucas folhas.
uso: py -3.13 tools/briefing.py "<pasta do cliente>" [--saida pasta] [--modelo medium|small] [--quadros 10] [--sem-midia]
  PDF        texto de cada página (no .md), folha das páginas (paginas.jpg) e as imagens embutidas extraídas em
             imagens/ (p02_01.png...) com tamanho e posição — para reaproveitar no HTML sem olhar página por página
  áudio/vídeo  transcrição com tempo (Whisper; cache por arquivo: rodar de novo é instantâneo) e, nos vídeos de tela,
             quadros nos momentos em que a pessoa APONTA ("aqui", "esse", "isso", "coloca", "tira"...) com a fala
             embaixo de cada quadro (quadros_<video>.jpg) — junta "o que ele diz" com "onde ele aponta"
  imagens    folha das imagens soltas da pasta (imagens_soltas.jpg)
Saída (padrão D:/kanivete_testes/briefing/<pasta>): briefing.md (ler primeiro: só texto) e as folhas.
Olhe as folhas só quando o texto não bastar. Whisper na CPU: medium ~1 min por minuto de fala (rode em segundo plano)."""
import argparse, hashlib, json, os, re, subprocess, sys, textwrap
sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = (".ogg", ".opus", ".mp3", ".wav", ".m4a", ".flac", ".aac")
VID = (".mp4", ".mov", ".webm", ".mkv", ".avi")
IMG = (".png", ".jpg", ".jpeg", ".webp")
APONTA = re.compile(r"\b(aqui|ali|esse|essa|isso|este|esta|desse|dessa|disso|coloca|colocar|põe|por|tira|tirar|troca|"
                    r"trocar|muda|mudar|mant[eé]m|manter|embaixo|em cima|do lado|pra cá|para cá)\b", re.I)


def ffmpeg():
    for c in (os.path.join(RAIZ, "dist", "CaniveteDoPailer", "modelos_ia", "ffmpeg.exe"), os.path.join(RAIZ, "modelos_ia", "ffmpeg.exe")):
        if os.path.isfile(c): return c
    return "ffmpeg"


def fonte(t):
    for f in ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.isfile(f): return ImageFont.truetype(f, t)
    return ImageFont.load_default()


def folha(itens, dest, cel=360, cols=5, legenda_linhas=3):
    """itens = [(imagem PIL, legenda)] → grade com a legenda embaixo de cada célula."""
    if not itens: return None
    f = fonte(15); lh = 19; leg_h = legenda_linhas * lh + 8
    alt = max(int(cel * im.height / im.width) for im, _ in itens)
    alt = min(alt, int(cel * 1.8))
    cols = min(cols, len(itens)); lin = -(-len(itens) // cols)
    W = Image.new("RGB", (cols * (cel + 8), lin * (alt + leg_h + 8)), "white"); d = ImageDraw.Draw(W)
    for i, (im, leg) in enumerate(itens):
        im = im.convert("RGBA"); im.thumbnail((cel, alt))
        x = (i % cols) * (cel + 8); y = (i // cols) * (alt + leg_h + 8)
        fundo = Image.new("RGBA", im.size, (200, 200, 200, 255)); fundo.alpha_composite(im)
        W.paste(fundo.convert("RGB"), (x, y))
        for k, ln in enumerate(textwrap.wrap(leg, width=int(cel / 7.6))[:legenda_linhas]):
            d.text((x + 2, y + alt + 4 + k * lh), ln, fill="black", font=f)
    W.save(dest, quality=82); return dest


def ler_pdf(pdf, saida, md):
    import fitz
    d = fitz.open(pdf); nome = os.path.splitext(os.path.basename(pdf))[0]
    pasta_img = os.path.join(saida, "imagens"); os.makedirs(pasta_img, exist_ok=True)
    md.append(f"\n## PDF: {os.path.basename(pdf)} ({len(d)} páginas, {d[0].rect.width:.0f}×{d[0].rect.height:.0f} pt)"
              "\n(pequena) = menos de 700 px: ampliar com tools/imgprep.py ou achar a original")
    paginas, extraidas = [], []
    for i, p in enumerate(d):
        texto = " ".join(p.get_text().split())
        md.append(f"\n### Página {i + 1}\nTexto: {texto or '(sem texto: só imagens)'}")
        pix = p.get_pixmap(dpi=60); paginas.append((Image.frombytes("RGB", (pix.width, pix.height), pix.samples), f"pág. {i + 1}"))
        for j, info in enumerate(p.get_image_info(xrefs=True)):
            x = info.get("xref")
            if not x: continue
            try:
                px = fitz.Pixmap(d, x)
                if px.n - px.alpha > 3: px = fitz.Pixmap(fitz.csRGB, px)
                sm = d.extract_image(x).get("smask")
                if sm: px = fitz.Pixmap(px, fitz.Pixmap(d, sm))
                arq = os.path.join(pasta_img, f"p{i + 1:02d}_{j:02d}.png"); px.save(arq)
            except Exception as e:
                md.append(f"- imagem {j} da pág. {i + 1}: não extraiu ({e})"); continue
            b = [round(v) for v in info["bbox"]]
            md.append(f"- `imagens/p{i + 1:02d}_{j:02d}.png` {px.width}×{px.height} px, x{b[0]}-{b[2]} y{b[1]}-{b[3]} pt"
                      + (" (pequena)" if max(px.width, px.height) < 700 else ""))
            extraidas.append((Image.open(arq), f"p{i + 1:02d}_{j:02d} {px.width}×{px.height}"))
    md.append(f"\nFolhas: `{os.path.basename(folha(paginas, os.path.join(saida, nome[:30] + '_paginas.jpg'), cel=300))}`"
              + (f", `{os.path.basename(folha(extraidas, os.path.join(saida, nome[:30] + '_imagens.jpg'), cel=220, cols=7, legenda_linhas=1))}`" if extraidas else ""))


def transcrever(arqs, saida, modelo):
    """→ {arquivo: [segmentos]} com cache em <saida>/cache_transcricao/<hash>.json."""
    cache = os.path.join(saida, "cache_transcricao"); os.makedirs(cache, exist_ok=True)
    out, falta = {}, []
    for a in arqs:
        st = os.stat(a); h = hashlib.md5(f"{os.path.abspath(a)}|{st.st_size}|{st.st_mtime}|{modelo}".encode()).hexdigest()[:16]
        c = os.path.join(cache, h + ".json")
        if os.path.isfile(c): out[a] = json.load(open(c, encoding="utf-8"))
        else: falta.append((a, c))
    if falta:
        os.environ["PATH"] = os.path.dirname(ffmpeg()) + os.pathsep + os.environ["PATH"]
        import whisper
        wd = os.path.join(RAIZ, "dist", "CaniveteDoPailer", "modelos_ia", "whisper")
        m = whisper.load_model(modelo, download_root=wd if os.path.isdir(wd) else None)
        for a, c in falta:
            print("transcrevendo:", os.path.basename(a), flush=True)
            try: r = m.transcribe(a, language="pt", fp16=False)
            except Exception: r = {"segments": []}   # vídeo sem som (reel de referência mudo)
            segs = [{"ini": round(s["start"], 1), "fim": round(s["end"], 1), "txt": s["text"].strip()} for s in r["segments"]]
            json.dump(segs, open(c, "w", encoding="utf-8"), ensure_ascii=False); out[a] = segs
    return out


def quadros(video, segs, saida, maximo):
    """Quadros nos momentos em que a pessoa aponta (fala com dêitico), espaçados ≥ 6 s; a fala vai na legenda."""
    marcas, ult = [], -99
    for s in segs:
        if APONTA.search(s["txt"]) and s["ini"] - ult >= 6:
            marcas.append(s); ult = s["ini"]
    if len(marcas) > maximo:   # espalha pelo vídeo inteiro em vez de pegar só o começo
        passo = len(marcas) / maximo; marcas = [marcas[int(i * passo)] for i in range(maximo)]
    if not marcas and segs: marcas = segs[:1]
    if not segs:   # sem fala: quadros espalhados pela duração (reel de referência)
        try:
            p = subprocess.run([ffmpeg(), "-i", video], capture_output=True, text=True, errors="ignore",
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stderr
            h, mi, se = re.search(r"Duration: (\d+):(\d+):([\d.]+)", p).groups(); dur = int(h) * 3600 + int(mi) * 60 + float(se)
        except Exception: dur = 0
        n = max(1, min(maximo, int(dur // 1.5) or 1))
        marcas = [{"ini": dur * (i + 0.5) / n - 1.0, "fim": dur, "txt": ""} for i in range(n)]
    tmp = os.path.join(saida, "tmp_quadros"); os.makedirs(tmp, exist_ok=True)
    itens = []
    for s in marcas:
        t = min(s["ini"] + 1.0, max(s["fim"] - 0.2, s["ini"]))   # 1 s depois de começar a falar: o cursor já chegou
        arq = os.path.join(tmp, f"q{len(itens)}.jpg")
        subprocess.run([ffmpeg(), "-v", "error", "-y", "-ss", str(t), "-i", video, "-frames:v", "1", "-vf", "scale=480:-1", arq],
                       capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if os.path.isfile(arq): itens.append((Image.open(arq).copy(), f"[{int(t)//60}:{int(t)%60:02d}] {s['txt']}"))
    nome = re.sub(r"[^\w\-]+", "_", re.sub(r"(?i)^whatsapp (video|ptt) ", "", os.path.splitext(os.path.basename(video))[0])).strip("_")
    import shutil; shutil.rmtree(tmp, ignore_errors=True)
    return folha(itens, os.path.join(saida, f"quadros_{nome}.jpg"), cel=260, cols=6, legenda_linhas=5)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("pasta"); ap.add_argument("--saida")
    ap.add_argument("--modelo", default="medium"); ap.add_argument("--quadros", type=int, default=10)
    ap.add_argument("--sem-midia", action="store_true", help="pula áudio e vídeo (só PDF e imagens)")
    a = ap.parse_args()
    pasta = os.path.abspath(a.pasta)
    saida = a.saida or os.path.join("D:/kanivete_testes/briefing", re.sub(r"[^\w\-]+", "_", os.path.basename(pasta))[:40])
    os.makedirs(saida, exist_ok=True)
    todos = sorted(os.path.join(r, f) for r, _, fs in os.walk(pasta) for f in fs)
    md = [f"# Briefing: {pasta}", f"{len(todos)} arquivos. Leia o texto primeiro; abra as folhas só se precisar."]
    for f in todos:
        if f.lower().endswith(".pdf"): ler_pdf(f, saida, md)
    soltas = [f for f in todos if f.lower().endswith(IMG)]
    if soltas:
        md.append(f"\n## Imagens soltas ({len(soltas)})")
        itens = []
        for f in soltas:
            try: im = Image.open(f); itens.append((im.copy(), os.path.basename(f))); md.append(f"- `{os.path.relpath(f, pasta)}` {im.width}×{im.height}")
            except Exception: pass
        folha(itens, os.path.join(saida, "imagens_soltas.jpg"), cel=240, cols=6, legenda_linhas=2)
    midia = [f for f in todos if f.lower().endswith(AUD + VID)]
    if midia and not a.sem_midia:
        trans = transcrever(midia, saida, a.modelo)
        md.append(f"\n## Falas do cliente ({len(midia)} arquivos, em ordem de nome = ordem em que mandou)")
        for f in midia:
            segs = trans.get(f, [])
            md.append(f"\n### {os.path.basename(f)}")
            md.extend(f"[{int(s['ini'])//60}:{int(s['ini'])%60:02d}] {s['txt']}" for s in segs)
            if f.lower().endswith(VID):
                fl = quadros(f, segs, saida, a.quadros)
                if fl: md.append(f"Quadros (onde aponta): `{os.path.basename(fl)}`")
    dest = os.path.join(saida, "briefing.md"); open(dest, "w", encoding="utf-8").write("\n".join(md) + "\n")
    print("briefing:", dest)
    for f in sorted(os.listdir(saida)):
        if f.endswith(".jpg"): print("folha:", os.path.join(saida, f))


if __name__ == "__main__":
    main()
