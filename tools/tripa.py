"""
tripa.py — a timeline inteira numa "tripa" de quadrinhos para o agente LER a montagem barato (ideia do Pailer).

    py -3.13 tools/tripa.py "Montagem Pailer v7"            # timeline do app aberto (modo agente, porta 9222)
    py -3.13 tools/tripa.py --json montagem.json             # ou um JSON {clips, markers} já salvo (+ --porta p/ mídias)
    opções: --passo 2 (s por quadrinho) --linhas 8 (minutos por imagem) --de 0 --ate 0 (s) --transcricoes PASTA

Cada linha = 1 minuto: régua com timecode e o ato (marcadores), 30 quadrinhos 64×36 do vídeo que está por cima
naquele instante (escurecido onde a camada de "escuta"/ajuste age; T = texto na tela), risco vermelho em cada corte,
faixas finas do que existe em cada camada (fala, cobertura, texto, ajuste, som) e, embaixo, o que é falado.
Quadros: ffmpeg só do instante, minúsculo, em paralelo e com cache (D:/Canivete Media Cache/agente/tripa). Fala: só
transcrições que já existem (cache do agente_midia ou --transcricoes com <nome do arquivo>.json) — nada é transcrito.
Saída: caminhos das PNGs (≈2 mil tokens cada para ler).
"""
import argparse, hashlib, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
TW, TH, POR_LINHA = 64, 36, 30
FAIXAS = [("fala", (91, 110, 225)), ("cobertura", (168, 85, 247)), ("texto", (219, 39, 119)), ("ajuste", (20, 184, 166)), ("som", (34, 197, 94))]
_BAIXA = 0x00004000 | 0x08000000


def limpo(p):
    """Tira o prefixo de caminho longo do Windows (\\\\?\\ com qualquer número de barras)."""
    return re.sub(r"^[\\/]+\?[\\/]+", "", p or "")


def ler_app(nome, porta):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}")
        pg = next(x for c in b.contexts for x in c.pages if x.evaluate("typeof VE==='object' && !!window.pywebview"))
        return pg.evaluate("""nome => { veSeqSalvarAtiva();
            const s = nome ? VE.sequences.find(s => s.name === nome) : VE.sequences.find(s => s.id === VE.activeSequence);
            if (!s) return null;
            const cl = s.id === VE.activeSequence ? VE.clips : s.clips;
            return { nome: s.name, clips: cl, markers: s.markers || [],
                     media: Object.fromEntries(VE.media.filter(Boolean).map(m => [m.id, {kind: m.kind, path: m.path || '', nome: m.nome || m.name || '', comp: !!m.comp}])) }; }""", nome)


def fim(c): return c["st"] + (c["e"] - c["s"]) / (c.get("v") or 1)


def tipo(c, M):
    m = M.get(str(c.get("m") or 0), {})
    k = m.get("kind")
    if c.get("tx") or k == "texto": return "texto"
    if k == "ajuste": return "ajuste"
    if k == "audio" or c.get("x") == "a": return "som"
    if k in ("video", "image"): return "fala" if (c["tr"] == 0 and c.get("x") != "v") else "cobertura"
    return "outro"


def quadro(path, t, cache):
    arq = os.path.join(cache, hashlib.md5(f"{path}|{round(t, 1)}".encode()).hexdigest()[:16] + ".png")
    if not os.path.isfile(arq) or os.path.getsize(arq) == 0:   # vazio = tentativa que falhou: tenta de novo
        if path.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            Image.open(path).convert("RGB").resize((TW, TH)).save(arq)
        else:
            from Functions.audio_cutter import ffmpeg_path      # o do app: "ffmpeg" do PATH não existe em todo PC (tripa saía cinza)
            subprocess.run([ffmpeg_path(), "-v", "error", "-ss", f"{max(0, t):.2f}", "-i", limpo(path), "-frames:v", "1",
                            "-vf", f"scale={TW}:{TH}", "-y", arq], capture_output=True, creationflags=_BAIXA)
    try: return Image.open(arq).convert("RGB")
    except Exception: return None


def palavras_de(path, pasta_tr):
    path = limpo(path)
    try:
        from Functions import agente_midia as am
        st = os.stat(path)
        cache = os.path.join(am._pasta(), f"fala_{am._chave(f'{os.path.abspath(path)}|{st.st_mtime}|{st.st_size}', 'pt', '')}.json")
        if os.path.isfile(cache): return json.load(open(cache, encoding="utf-8")).get("palavras") or []
    except Exception:
        pass
    base = os.path.basename(path).split(".")[0]
    for pasta in (pasta_tr or "").split(";"):
        for f in (base + ".json", base.upper() + ".json", "tr_" + base + ".json"):
            p = os.path.join(pasta, f)
            if pasta and os.path.isfile(p):
                d = json.load(open(p, encoding="utf-8")); return d.get("palavras", d) if isinstance(d, dict) else d
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("nome", nargs="?", default="")
    ap.add_argument("--json"); ap.add_argument("--porta", type=int, default=9222)
    ap.add_argument("--passo", type=float, default=2.0); ap.add_argument("--linhas", type=int, default=8)
    ap.add_argument("--de", type=float, default=0); ap.add_argument("--ate", type=float, default=0)
    ap.add_argument("--transcricoes", default=r"D:\kanivete_testes\edgar\transcricoes;D:\kanivete_testes\edgar\v4",
                    help="pastas (separadas por ;) com <arquivo>.json ou tr_<arquivo>.json de transcrições já feitas")
    a = ap.parse_args()
    if a.json:
        d = json.load(open(a.json, encoding="utf-8"))
        if "media" not in d:
            d["media"] = ler_app(None, a.porta)["media"]
        d.setdefault("nome", os.path.splitext(os.path.basename(a.json))[0])
    else:
        d = ler_app(a.nome, a.porta)
    C, M, MK = d["clips"], {str(k): v for k, v in d["media"].items()}, sorted(d.get("markers") or [], key=lambda m: m["t"])
    dur = max(fim(c) for c in C)
    t0, t1 = a.de, (a.ate or dur)
    from Functions import video_cutter as vc
    cache = os.path.join(vc._midia_dir(), "agente", "tripa"); os.makedirs(cache, exist_ok=True)

    def tapa(c):
        """camada que de fato cobre o quadro: grão/textura em mesclagem (Sobrepor, Luz direta...), quase transparente,
        desligada ou letreiro (Comp/MOGRT) não contam — o grão Kodak por cima de tudo deixava a tripa inteira cinza"""
        m = M.get(str(c.get("m") or 0), {})
        return not (c.get("off") or (c.get("bm") or "normal") != "normal" or (c.get("p") or {}).get("op", 100) < 50
                    or m.get("comp"))

    def topo(t):
        vis = [c for c in C if c["st"] <= t < fim(c) and tipo(c, M) in ("fala", "cobertura") and tapa(c)]
        return max(vis, key=lambda c: c["tr"]) if vis else None
    amostras = [t0 + i * a.passo for i in range(int((t1 - t0) / a.passo) + 1)]
    pedidos = {}
    for t in amostras:
        c = topo(t + a.passo / 2)
        if c: pedidos[t] = (M.get(str(c.get("m") or 0), {}).get("path", ""), c["s"] + (t + a.passo / 2 - c["st"]) * (c.get("v") or 1), c)
    with ThreadPoolExecutor(6) as ex:
        imgs = dict(zip(pedidos, ex.map(lambda v: quadro(v[0], v[1], cache) if v[0] else None, pedidos.values())))

    # fala: palavras de cada clipe com som na trilha principal, levadas para o tempo da timeline
    fala = []
    for c in C:
        if tipo(c, M) == "fala" or (tipo(c, M) == "som" and c["tr"] == 0):
            path = M.get(str(c.get("m") or 0), {}).get("path", "")
            for w in palavras_de(path, a.transcricoes) if path else []:
                ws, txt = (w[0], w[2]) if isinstance(w, list) else (w.get("a", w.get("s")), w.get("w", w.get("t")))
                if c["s"] <= ws < c["e"]: fala.append((c["st"] + (ws - c["s"]) / (c.get("v") or 1), txt))
    for c in C:
        if tipo(c, M) == "texto" and c.get("tx"): fala.append((c["st"], "[T: " + c["tx"]["t"].replace("\n", " ")[:40] + "]"))
    fala.sort()

    try: fnt = ImageFont.truetype("segoeui.ttf", 12); fnt_b = ImageFont.truetype("segoeuib.ttf", 12)
    except Exception: fnt = fnt_b = ImageFont.load_default()
    LW, RH = TW * POR_LINHA, 14 + TH + 5 * 3 + 2 + 32
    seg_linha = POR_LINHA * a.passo
    linhas = [t0 + i * seg_linha for i in range(int((t1 - t0) // seg_linha) + 1)]
    saidas = []
    for n in range(0, len(linhas), a.linhas):
        bloco = linhas[n:n + a.linhas]
        img = Image.new("RGB", (LW, RH * len(bloco)), (18, 18, 20)); dr = ImageDraw.Draw(img)
        for li, L in enumerate(bloco):
            y = li * RH; X = lambda t: int((t - L) / a.passo * TW)
            ato = next((m.get("nome", "") for m in reversed(MK) if m["t"] <= L + seg_linha / 2), "")
            dr.text((2, y), f"{int(L // 60):02d}:{int(L % 60):02d}", fill=(250, 204, 21), font=fnt_b)
            for s in range(10, int(seg_linha), 10): dr.text((X(L + s) + 2, y), f"+{s}", fill=(120, 120, 120), font=fnt)
            for m in MK:
                if L <= m["t"] < L + seg_linha: dr.text((X(m["t"]) + 40, y), "▼ " + m.get("nome", "")[:40], fill=(253, 186, 116), font=fnt)
            if not any(L <= m["t"] < L + seg_linha for m in MK) and ato: dr.text((60, y), ato[:50], fill=(110, 110, 110), font=fnt)
            for i in range(POR_LINHA):
                t = L + i * a.passo
                if t > t1: break
                q = imgs.get(t)
                x = i * TW
                if q:
                    tc = t + a.passo / 2
                    if any(tipo(c, M) == "ajuste" and c["st"] <= tc < fim(c) for c in C): q = Image.blend(q, Image.new("RGB", q.size), 0.55)
                    img.paste(q, (x, y + 14))
                    if any(tipo(c, M) == "texto" and c["st"] <= tc < fim(c) for c in C): dr.text((x + 2, y + 14), "T", fill=(255, 255, 255), font=fnt_b)
                else:
                    dr.rectangle([x, y + 14, x + TW - 1, y + 14 + TH - 1], fill=(30, 30, 34))
            for c in C:   # cortes do que está por cima
                if tipo(c, M) in ("fala", "cobertura") and L < c["st"] < L + seg_linha and topo(c["st"] + 0.01) is c:
                    dr.line([X(c["st"]), y + 14, X(c["st"]), y + 14 + TH], fill=(239, 68, 68), width=1)
            for fi, (nm, cor) in enumerate(FAIXAS):
                yy = y + 14 + TH + 1 + fi * 3
                for c in C:
                    if tipo(c, M) == nm and c["st"] < L + seg_linha and fim(c) > L:
                        dr.rectangle([max(0, X(c["st"])), yy, max(max(0, X(c["st"])), min(LW, X(fim(c))) - 1), yy + 1], fill=cor)
            txt = " ".join(w for tt, w in fala if L <= tt < L + seg_linha)
            yy = y + 14 + TH + 17
            for k in range(2):
                parte = txt[k * 290:(k + 1) * 290]
                if parte: dr.text((2, yy + k * 14), parte, fill=(220, 220, 220), font=fnt)
        out = os.path.join(cache, f"tripa_{hashlib.md5(d['nome'].encode()).hexdigest()[:6]}_{n // a.linhas + 1}.png")
        img.save(out); saidas.append(out)
    print(json.dumps({"timeline": d["nome"], "duracao": round(dur, 1), "imagens": saidas}, ensure_ascii=False))


if __name__ == "__main__":
    main()
