"""Motion em HTML → timeline NATIVA do Vídeo Kanivete (camadas de texto, forma, cor e imagem com quadros-chave editáveis).

    py -3.13 tools/motion_html.py cena.html [--saida pasta] [--porta 9333] [--nome "Timeline"] [--salvar proj.vknv]
                                             [--so-plano] [--exportar] [--comparar] [--cpu] [--audio sons.json]

A cena é um HTML do tamanho do quadro, animado com CSS (@keyframes, transições), el.animate() ou GSAP; tamanho, taxa e
duração em <meta name="kv" content="w=1080;h=1920;fps=30;dur=6">. O amostrador (motion_html/amostrar.js) roda num
Chromium sem janela, pausa as animações e lê cada camada quadro a quadro; aqui as curvas viram poucos quadros-chave com
Bézier (as do CSS, quando batem) e o plano vai ao montador do editor (motion_html/montador.js) no app em modo agente.
--comparar exporta pelo app e mede quadro a quadro contra o HTML (folha + números): é o laço para chegar a 100%.
Guia: Instructions/agente/motion-html.md.
"""
import json, math, os, re, subprocess, sys, time
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
PASTA_JS = os.path.join(AQUI, "motion_html")

# tolerâncias do ajuste (o que o olho não vê): px, % de escala, graus, % de opacidade, px de desfoque
TOL = {"x": 0.35, "y": 0.35, "sc": 0.2, "rot": 0.15, "op": 0.6, "blur": 0.35, "w": 0.5, "h": 0.5, "sx": 0.004, "sy": 0.004}
ESCALA_MAX = 1800   # o editor prende a escala em 20× (2000%): acima disso a forma cresce no tamanho, não na escala
# curvas comuns do motion (CSS e as do editor); o ajuste parte delas e refina
CURVAS = {"lin": [1 / 3, 1 / 3, 2 / 3, 2 / 3], "ease": [0.25, 0.1, 0.25, 1], "in": [0.42, 0, 1, 1], "out": [0, 0, 0.58, 1],
          "inout": [0.42, 0, 0.58, 1], "expo": [0.16, 1, 0.3, 1], "back": [0.34, 1.56, 0.64, 1], "suave": [1 / 3, 0, 2 / 3, 1],
          "outcubic": [0.33, 1, 0.68, 1], "incubic": [0.32, 0, 0.67, 0], "inoutcubic": [0.65, 0, 0.35, 1], "outquart": [0.25, 1, 0.5, 1],
          "outback": [0.34, 1.56, 0.64, 1], "inback": [0.36, 0, 0.66, -0.56]}
CSS_EASE = {"linear": "lin", "ease": "ease", "ease-in": "in", "ease-out": "out", "ease-in-out": "inout"}


# ───────────────────────── Bézier igual à do editor (veBezY) ─────────────────────────
def _bez(a, b, s):
    r = 1 - s
    return 3 * r * r * s * a + 3 * r * s * s * b + s * s * s


def bez_y(bz, u):
    """vetorizado: u em 0..1 → y (Newton + bisseção, como veBezY)."""
    x1, y1, x2, y2 = bz
    u = np.asarray(u, float)
    s = u.copy()
    for _ in range(8):
        r = 1 - s
        dx = 3 * r * r * x1 + 6 * r * s * (x2 - x1) + 3 * s * s * (1 - x2)
        ok = np.abs(dx) > 1e-6
        s = np.where(ok, np.clip(s - (_bez(x1, x2, s) - u) / np.where(ok, dx, 1), 0, 1), s)
    ruim = np.abs(_bez(x1, x2, s) - u) > 1e-4
    if ruim.any():
        lo, hi = np.zeros_like(u), np.ones_like(u)
        for _ in range(30):
            m = (lo + hi) / 2
            menor = _bez(x1, x2, m) < u
            lo, hi = np.where(menor, m, lo), np.where(menor, hi, m)
        s = np.where(ruim, (lo + hi) / 2, s)
    return _bez(y1, y2, s)


def css_curva(e):
    e = (e or "").strip()
    if e in CSS_EASE:
        return CURVAS[CSS_EASE[e]]
    m = re.match(r"cubic-bezier\(([^)]+)\)", e)
    return [float(v) for v in m.group(1).split(",")] if m else None


# ───────────────────────── ajuste das curvas ─────────────────────────
def _prever(v, a, b, bz):
    u = bez_y(bz, np.linspace(0, 1, b - a + 1))[:, None]
    return v[a] + (v[b] - v[a]) * u


def _melhor_curva(v, a, b, dicas, tol):
    """Bézier que leva v[a]→v[b] dentro da tolerância: primeiro a do CSS, depois as conhecidas; senão refina (Nelder-Mead).
    v é (quadros, dimensões): uma curva só para todas (o caminho da máscara anima ponto a ponto com a mesma curva)."""
    alvo = v[a:b + 1]
    if np.all(np.abs(v[b] - v[a]) < 1e-9):
        return None, float(np.max(np.abs(alvo - v[a])))
    cand = list(dicas) + list(CURVAS.values())
    erros = [(float(np.max(np.abs(_prever(v, a, b, c) - alvo))), c) for c in cand]
    boa = next((e for e in erros if e[0] <= tol), None)
    if boa:
        return [round(float(z), 4) for z in boa[1]], boa[0]
    erro, bz = min(erros, key=lambda e: e[0])
    if erro > 1e-3 and b - a >= 3:
        from scipy.optimize import minimize
        f = lambda p: float(np.max(np.abs(_prever(v, a, b, [min(1, max(0, p[0])), p[1], min(1, max(0, p[2])), p[3]]) - alvo)))
        r = minimize(f, bz, method="Nelder-Mead", options={"xatol": 1e-4, "fatol": 1e-4, "maxiter": 600})
        if r.fun < erro:
            erro, bz = r.fun, [min(1, max(0, r.x[0])), r.x[1], min(1, max(0, r.x[2])), r.x[3]]
    return [round(float(z), 4) for z in bz], erro


def ajustar(v, tol, fps, dicas_t=(), dicas_c=()):
    """Série por quadro (ou (quadros, dimensões)) → quadros-chave [[t, v, curva]] (t relativo ao 1º quadro);
    None se for constante."""
    v = np.asarray(v, float)
    um = v.ndim == 1
    if um:
        v = v[:, None]
    n = len(v)
    if n == 0 or float(np.max(v.max(axis=0) - v.min(axis=0))) <= tol:
        return None
    # nós: pontas, instantes declarados no CSS e as bordas dos trechos parados
    nos = {0, n - 1} | {int(round(t * fps)) for t in dicas_t if 0 < round(t * fps) < n - 1}
    mexe = np.max(np.abs(np.diff(v, axis=0)), axis=1) > tol * 0.02
    for f in range(1, n - 1):
        if mexe[f] != mexe[f - 1]:
            nos.add(f)
    nos = sorted(nos)
    ks, fila = [], [(nos[k], nos[k + 1]) for k in range(len(nos) - 1)]
    pronto = {}
    while fila:
        a, b = fila.pop()
        if b - a <= 1:
            pronto[a] = "lin"; continue
        bz, erro = _melhor_curva(v, a, b, dicas_c, tol)
        if bz is None and erro <= tol:
            pronto[a] = "lin"; continue
        if bz is not None and erro <= tol:
            pronto[a] = bz; continue
        # divide no pior quadro (ou no extremo, se a curva vai e volta)
        if bz is None:
            meio = a + int(np.argmax(np.max(np.abs(v[a:b + 1] - v[a]), axis=1)))
        else:
            meio = a + int(np.argmax(np.max(np.abs(_prever(v, a, b, bz) - v[a:b + 1]), axis=1)))
        meio = min(b - 1, max(a + 1, meio))
        fila += [(a, meio), (meio, b)]
    for f in sorted(set(pronto) | {n - 1}):
        c = pronto.get(f, "lin")
        nome = next((k for k, z in CURVAS.items() if c != "lin" and np.allclose(z, c, atol=1e-3) and k in ("in", "out", "back")), None)
        if c != "lin" and np.allclose(c, CURVAS["lin"], atol=1e-3):
            c = "lin"
        val = round(float(v[f, 0]), 3) if um else [round(float(z), 2) for z in v[f]]
        ks.append([round(f / fps, 4), val, "lin" if c == "lin" else (nome if nome in ("in", "out", "back") else c)])
    return ks


# ───────────────────────── leitura do HTML ─────────────────────────
def meta(html):
    t = open(html, encoding="utf-8").read()
    m = re.search(r'<meta[^>]+name=["\']kv["\'][^>]+content=["\']([^"\']+)', t)
    d = dict(kv.split("=") for kv in m.group(1).replace(" ", "").split(";") if "=" in kv) if m else {}
    return int(d.get("w", 1920)), int(d.get("h", 1080)), float(d.get("fps", 30)), float(d.get("dur", 5))


def amostrar(html, pasta_assets, quadros_html=None):
    from playwright.sync_api import sync_playwright
    W, H, fps, dur = meta(html)
    n = int(round(dur * fps))
    url = "file:///" + os.path.abspath(html).replace("\\", "/")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        pg.goto(url)
        pg.wait_for_load_state("networkidle")
        pg.evaluate("document.fonts.ready.then(()=>1)")
        pg.add_script_tag(path=os.path.join(PASTA_JS, "amostrar.js"))
        est = pg.evaluate("KV.iniciar()")
        fundo = pg.evaluate("KV.fundo()")
        # camadas que viram imagem isolada (o movimento continua nativo)
        os.makedirs(pasta_assets, exist_ok=True)
        rasters = [d["i"] for d in est if d.get("raster") or d.get("misto") or (d["tipo"] == "texto" and False)]
        if rasters:
            pg.evaluate("ids => ids.forEach(i => { KV._est[i].ancora = null; })", rasters)
        series = pg.evaluate("""([n, fps]) => { const out = []; for (let f = 0; f < n; f++) { KV.ir(f / fps); out.push(KV.ler()); } return out; }""", [n, fps])
        mascaras = [[cam[11] for cam in q] for q in series]      # [quadro][camada] → polígonos no espaço da camada
        series = np.array([[cam[:11] for cam in q] for q in series], float)          # [quadro, camada, campo]
        for i in rasters:
            op = series[:, i, 7]
            f = int(np.argmax(op))
            pg.evaluate(f"KV.ir({f / fps})")
            tam = pg.evaluate(f"KV.isolar({i})")
            # camada maior que o quadro (brilho, fundo vazando): a janela cresce só para a foto dela
            grande = tam["w"] > W or tam["h"] > H
            if grande:
                pg.set_viewport_size({"width": max(W, tam["w"]), "height": max(H, tam["h"])})
            rot = re.sub(r"[^\w]+", "_", est[i]["id"])
            arq = os.path.join(pasta_assets, f"camada_{i:02d}_{rot}.png")
            pg.screenshot(path=arq, clip={"x": 0, "y": 0, "width": max(1, tam["w"]), "height": max(1, tam["h"])}, omit_background=True)
            pg.evaluate(f"KV.soltar({i})")
            if grande:
                pg.set_viewport_size({"width": W, "height": H})
            est[i]["png"] = arq
        if quadros_html:
            os.makedirs(quadros_html, exist_ok=True)
            for f in range(n):
                pg.evaluate(f"KV.ir({f / fps})")
                pg.screenshot(path=os.path.join(quadros_html, f"{f + 1:05d}.png"))
        b.close()
    return {"W": W, "H": H, "fps": fps, "dur": dur, "n": n, "est": est, "series": series, "mascaras": mascaras, "fundo": fundo}


# ───────────────────────── plano para o montador ─────────────────────────
def plano(A, nome):
    W, H, fps, n = A["W"], A["H"], A["fps"], A["n"]
    S, clips, midias, avisos = A["series"], [], [], []
    tr = 0
    if A["fundo"]:
        clips.append({"id": "fundo", "tipo": "cor", "tr": 0, "st": 0, "dur": round(n / fps, 4), "fill": A["fundo"], "nome": "Fundo"})
        tr = 1
    for d in A["est"]:
        i = d["i"]
        # escala ~0 (bolinha que ainda vai crescer, carta virada de lado) = invisível: no editor a forma tem no mínimo
        # 1 px e ficava à vista (bolinha no meio da tela antes da hora, listra no quadrado que vira)
        some = np.minimum(np.abs(S[:, i, 4]), np.abs(S[:, i, 5])) < 0.6
        S[:, i, 7] = np.where(some, 0.0, S[:, i, 7])
        op = S[:, i, 7]
        vis = np.where(op > 0.3)[0]
        if not len(vis):
            continue
        # um quadro invisível em cada ponta: a curva começa/termina inteira (o 0% de opacidade é o quadro-chave do CSS)
        f0, f1 = max(0, int(vis[0]) - 1), min(n - 1, int(vis[-1]) + 1)
        st, dur = round(f0 / fps, 4), round((f1 - f0 + 1) / fps, 4)
        dicas_t = [c["t"] - f0 / fps for c in d.get("chaves", [])]
        dicas_c = [c for c in (css_curva(k.get("e")) for k in d.get("chaves", [])) if c]
        avisos += [f"{d['id']}: {w}" for w in d.get("avisos", [])]
        sl = slice(f0, f1 + 1)
        sx, sy = S[sl, i, 4], S[sl, i, 5]
        partes = []
        if d.get("png") or d.get("src"):
            partes.append(("img", 0))
        else:
            if d.get("forma"):
                partes.append(("forma", 0))
            elif "caixa" in (d["tipo"] or "") and not d.get("texto"):
                partes.append(("img", 0))
            if d.get("texto"):
                partes.append(("texto", 2))
        for tipo, o in partes:
            c = {"id": f"{d['id']}" + ("_txt" if tipo == "texto" and len(partes) > 1 else ""), "tipo": tipo, "tr": tr, "st": st, "dur": dur, "nome": d["id"]}
            tr += 1
            serie = {"x": S[sl, i, o], "y": S[sl, i, o + 1], "rot": np.degrees(np.unwrap(np.radians(S[sl, i, 6]))), "op": op[sl]}
            sc = (sx + sy) / 2
            if tipo == "forma":
                c["fm"] = dict(d["forma"])
            muda_tam = float(np.ptp(S[sl, i, 9])) > TOL["w"] or float(np.ptp(S[sl, i, 10])) > TOL["h"]
            if tipo == "forma" and (muda_tam or float(np.max(np.abs(sx - sy))) > TOL["sc"] * 2):
                # forma esticada só num eixo: largura/altura animadas (fm.w/fm.h), escala fica 100
                serie["fm.w"], serie["fm.h"] = S[sl, i, 9] * sx / 100, S[sl, i, 10] * np.abs(sy) / 100
            elif float(np.max(np.abs(sx - np.abs(sy)))) > TOL["sc"] * 2:
                # escala diferente em X e Y (virar uma carta, esticar): Escala = a maior e as escalas só na horizontal/vertical
                # (k.sx/k.sy do editor, multiplicadores; prévia, processador e placa já entendem)
                m = np.maximum(sx, np.abs(sy))
                seg = np.where(m > 1e-6, m, 1)
                serie["sc"] = m
                serie["sx"] = np.clip(np.where(m > 1e-6, sx / seg, 1), .0005, 20)
                serie["sy"] = np.clip(np.where(m > 1e-6, np.abs(sy) / seg, 1), .0005, 20)
            else:
                serie["sc"] = sc
            if tipo == "forma" and "sc" in serie and float(np.max(serie["sc"])) > 100:
                # forma ampliada (bolinha que cresce até cobrir a tela): a forma é desenhada já no tamanho maior e a escala
                # desce na mesma conta — ampliar o desenho pequeno borrava a borda e o editor prende a escala em 20×
                F = float(np.max(serie["sc"])) / 100
                F = round(max(1.0, min(F, 4200 / max(c["fm"]["w"], c["fm"]["h"], 1))), 3)
                c["fm"]["w"], c["fm"]["h"] = round(c["fm"]["w"] * F, 2), round(c["fm"]["h"] * F, 2)
                if c["fm"].get("cLarg"):
                    c["fm"]["cLarg"] = round(c["fm"]["cLarg"] * F, 2)
                serie["sc"] = serie["sc"] / F
            elif "sc" in serie and float(np.max(serie["sc"])) > ESCALA_MAX:
                avisos.append(f"{d['id']}: escala acima de 20× (o editor prende em 2000%)")
            if tipo == "texto":
                c["tx"] = d["texto"]
            if tipo == "img":
                arq = d.get("png") or d.get("src")
                c["arq"] = arq
                c["larg"] = d["w"]
                midias.append(arq)
            # desfoque CSS (px no espaço do elemento) → efeito Desfoque gaussiano (% de 5% do menor lado da mídia)
            bl = S[sl, i, 8]
            if float(bl.max()) > TOL["blur"]:
                lado = min(d.get("cw") or d["w"], d.get("ch") or d["h"]) if tipo == "texto" else min(d["w"], d["h"])
                serie["fx.bl.amt"] = bl * 2000 / max(1, lado)
                c["fx"] = [{"id": "bl", "t": "blur", "v": {"amt": 0}}]
            # recortes (pai com overflow escondido, clip-path) → máscaras no espaço do elemento
            M = A["mascaras"]
            qtd = {len(M[f][i]) for f in range(f0, f1 + 1)}
            if len(qtd) > 1:
                avisos.append(f"{d['id']}: o número de recortes muda no tempo (máscara ignorada)")
            elif qtd and max(qtd):
                c["mkl"], c["el"] = [], {"w": d["w"], "h": d["h"]}
                if tipo == "texto" and d.get("ancora"):
                    c["el"].update(ax=d["ancora"]["x"], ay=d["ancora"]["y"])
                for j in range(max(qtd)):
                    tam = {len(M[f][i][j]) for f in range(f0, f1 + 1)}
                    if len(tam) > 1:
                        avisos.append(f"{d['id']}: recorte {j + 1} muda de forma (pontos) no tempo"); continue
                    pts = np.array([M[f][i][j] for f in range(f0, f1 + 1)], float)
                    m = {"id": f"r{j + 1}", "modo": "add" if j == 0 else "int", "pts": [round(float(z), 2) for z in pts[0]]}
                    ks = ajustar(pts, 0.5, fps, dicas_t, dicas_c)
                    if ks:
                        m["k"] = ks
                    c["mkl"].append(m)
            p, k = {}, {}
            for prop, v in serie.items():
                tol = TOL.get(prop.split(".")[-1] if prop.startswith("fm.") else ("blur" if prop.startswith("fx.") else prop), 0.5)
                if prop == "fx.bl.amt":
                    tol = TOL["blur"] * 2000 / max(1, lado)
                ks = ajustar(v, tol, fps, dicas_t, dicas_c)
                if not ks and prop in ("sx", "sy") and abs(float(v[0]) - 1) > 1e-3:
                    ks = [[0, round(float(v[0]), 4), "lin"], [round((len(v) - 1) / fps, 4), round(float(v[0]), 4), "lin"]]   # só por quadro-chave a exportação lê
                if ks:
                    k[prop] = ks
                elif prop in ("sx", "sy"):
                    continue
                elif prop.startswith("fm."):
                    c["fm"][prop[3:]] = round(float(v[0]), 2)
                elif prop.startswith("fx."):
                    c["fx"][0]["v"]["amt"] = round(float(v[0]), 2)
                else:
                    p[prop] = round(float(v[0]), 3)
            c["p"] = p
            if k:
                c["k"] = k
            clips.append(c)
    return {"nome": nome, "W": W, "H": H, "fps": fps, "midias": sorted(set(midias)), "clips": clips}, avisos


def contar_chaves(P):
    return sum(len(v) for c in P["clips"] for v in (c.get("k") or {}).values())


# ───────────────────────── app (modo agente) ─────────────────────────
def montar_no_app(P, porta):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}")
        pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
        pg.evaluate("p => { window.__plano = p; }", P)
        js = open(os.path.join(PASTA_JS, "montador.js"), encoding="utf-8").read()
        return pg.evaluate("async () => { " + js + " }")


def _barra_kanicode(item):
    """Barrinha de renders do KaniCode (progresso.py): o app de teste não tem o observador do plugin, então avisa daqui."""
    import socket
    try:
        with socket.create_connection(("127.0.0.1", 47613), timeout=1.0) as s:
            s.sendall(("progresso " + json.dumps([item], ensure_ascii=False)).encode() + b"\n")
            s.recv(64)
    except OSError:
        pass


def exportar_no_app(destino_pasta, nome, porta, placa=False):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}")
        pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
        pg.evaluate("""([dest, nome, placa]) => { window.__exp = (async () => {
            window.__fim = null;
            if (!window.__ganchoExp) { const o = window.veOnExport; window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} }
                if (e && e.done) window.__fim = e; if (e && (e.pct != null || e.percent != null)) window.__kvpct = e.pct ?? e.percent;
                if (e && !e.done && /^Processador/.test(e.message || '')) window.__cpu = e.message;
                try { o(ev); } catch (x) {} }; window.__ganchoExp = true; }
            window.__kvpct = 0; window.__cpu = '';
            VE._txPng = null;
            if (VE.clips.some(veTxPrecisa)) await veTxPngs();
            const plano = veExportPlan(false), lim = veMasterLim();
            await window.pywebview.api.video_cutter_export(VE.path, plano.base, 'mp4', 'high', 'original', placa, dest, false,
                plano.camadas, plano.audio, plano.dur, lim ? [...plano.mix, { master: lim }] : plano.mix, veTxExport(null), [VE.seqW, VE.seqH], { nome });
        })().catch(e => { window.__fim = { erro: String(e) }; }); return 1; }""", [destino_pasta, nome, placa])
        id_barra, t0 = f"motion_html:{nome}", time.time()
        while True:
            fim, pct = pg.evaluate("[window.__fim, window.__kvpct]")
            if fim:
                fim["cpu_motivo"] = pg.evaluate("window.__cpu || ''")
                _barra_kanicode({"id": id_barra, "tipo": "render", "titulo": f"Render · {nome}",
                                 "estado": "erro" if fim.get("erro") else "concluido", "detalhe": fim.get("erro") or (fim.get("output_path") or "")[-120:]})
                return fim
            _barra_kanicode({"id": id_barra, "tipo": "render", "titulo": f"Render · {nome}", "pct": pct or 0, "estado": "ativo",
                             "detalhe": f"{'placa' if placa else 'processador'} · {int(time.time() - t0)} s"})
            if time.time() - t0 > 3600:
                raise TimeoutError("exportação passou de 1 h")
            time.sleep(1)


def comparar(pasta_html, video, pasta, fps, W, H):
    """Quadro a quadro contra o HTML. O 'piso' é o próprio HTML comprimido em H.264 (o que a compressão sozinha já tira):
    acima_do_piso ~0 = igual ao HTML. Folha: piores quadros (HTML / Kanivete / diferença ×4) recortados no pior ponto."""
    from PIL import Image
    kq, pq = os.path.join(pasta, "quadros_kanivete"), os.path.join(pasta, "quadros_piso")
    for q in (kq, pq):
        os.makedirs(q, exist_ok=True)
        for f in os.listdir(q):
            os.remove(os.path.join(q, f))
    subprocess.run([ffmpeg(), "-v", "error", "-y", "-i", video, "-vf", f"scale={W}:{H}", os.path.join(kq, "%05d.png")], check=True)
    piso = os.path.join(pasta, "piso.mp4")
    subprocess.run([ffmpeg(), "-v", "error", "-y", "-framerate", str(fps), "-i", os.path.join(pasta_html, "%05d.png"), "-c:v", "libx264",
                    "-crf", "16", "-pix_fmt", "yuv420p", piso], check=True)
    subprocess.run([ffmpeg(), "-v", "error", "-y", "-i", piso, os.path.join(pq, "%05d.png")], check=True)
    ler = lambda a: np.asarray(Image.open(a).convert("RGB"), float)
    res = []
    for nome in sorted(os.listdir(pasta_html)):
        b = os.path.join(kq, nome)
        if not os.path.exists(b):
            res.append({"q": nome, "dif": None}); continue
        x, y, z = ler(os.path.join(pasta_html, nome)), ler(b), ler(os.path.join(pq, nome))
        d = np.abs(x - y).mean(axis=2)
        dp = float(np.abs(x - z).mean())
        mse = float(np.mean((x - y) ** 2))
        # pior ponto: janela de 64 px com a maior diferença acima do piso
        exc = np.clip(d - np.abs(x - z).mean(axis=2) - 6, 0, None)
        k = 64
        hh, ww = (H // k) * k, (W // k) * k
        blocos = exc[:hh, :ww].reshape(hh // k, k, ww // k, k).mean(axis=(1, 3))
        by, bx = np.unravel_index(int(np.argmax(blocos)), blocos.shape)
        res.append({"q": nome, "dif": float(d.mean()), "piso": dp, "acima": float(d.mean()) - dp,
                    "psnr": 99.0 if mse == 0 else 10 * math.log10(255 ** 2 / mse), "ponto": [int(bx * k + k / 2), int(by * k + k / 2)], "bloco": float(blocos.max())})
    ok = [r for r in res if r["dif"] is not None]
    piores = sorted(ok, key=lambda r: -r["bloco"])[:5]
    lado = 256
    folha = Image.new("RGB", (lado * 3, lado * len(piores)), "white")
    for n, r in enumerate(piores):
        cx, cy = r["ponto"]
        caixa = (max(0, cx - lado // 2), max(0, cy - lado // 2), max(0, cx - lado // 2) + lado, max(0, cy - lado // 2) + lado)
        a = Image.open(os.path.join(pasta_html, r["q"])).convert("RGB").crop(caixa)
        b = Image.open(os.path.join(kq, r["q"])).convert("RGB").crop(caixa)
        dif = Image.fromarray(np.clip(np.abs(np.asarray(a, float) - np.asarray(b, float)) * 4, 0, 255).astype("uint8"))
        for j, im in enumerate((a, b, dif)):
            folha.paste(im, (j * lado, n * lado))
    folha.save(os.path.join(pasta, "comparacao_piores.jpg"), quality=88)
    resumo = {"quadros": len(res), "sem_par": len(res) - len(ok), "dif_media": round(float(np.mean([r["dif"] for r in ok])), 2),
              "piso_medio": round(float(np.mean([r["piso"] for r in ok])), 2),
              "acima_do_piso": round(float(np.mean([r["acima"] for r in ok])), 2), "acima_pior": round(max(r["acima"] for r in ok), 2),
              "psnr_medio": round(float(np.mean([r["psnr"] for r in ok])), 2),
              "piores": [[r["q"], r["ponto"], round(r["bloco"], 1)] for r in piores]}
    json.dump({"resumo": resumo, "quadros": res}, open(os.path.join(pasta, "comparacao.json"), "w"), indent=1)
    return resumo


def ffmpeg():
    for c in (os.path.join(os.path.dirname(AQUI), "dist", "CaniveteDoPailer", "modelos_ia", "ffmpeg.exe"), "ffmpeg"):
        if c == "ffmpeg" or os.path.exists(c):
            return c


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("-"):
        print(__doc__); return 1
    html = os.path.abspath(a[0])
    op = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    pasta = os.path.abspath(op("--saida", os.path.splitext(html)[0] + "_kanivete"))
    nome = op("--nome", os.path.splitext(os.path.basename(html))[0])
    porta = int(op("--porta", 9333))
    os.makedirs(pasta, exist_ok=True)
    t0 = time.time()
    qh = os.path.join(pasta, "quadros_html") if "--comparar" in a else None
    A = amostrar(html, os.path.join(pasta, "assets"), qh)
    P, avisos = plano(A, nome)
    if op("--audio"):
        # trilha e efeitos: [{arq, st, dur, s?, g?, fi?, fo?, tr?}] (tempos da timeline; tr = faixa de áudio)
        for k, x in enumerate(json.load(open(op("--audio"), encoding="utf-8"))):
            P["clips"].append({"id": x.get("id", f"som{k}"), "tipo": "audio", "tr": x.get("tr", 0), **{c: x[c] for c in ("arq", "st", "dur", "s", "g", "fi", "fo") if c in x}})
            P["midias"].append(x["arq"])
        P["midias"] = sorted(set(P["midias"]))
    if op("--salvar"):
        P["salvar"] = os.path.abspath(op("--salvar"))
    json.dump(P, open(os.path.join(pasta, "plano.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"camadas: {len(P['clips'])} · quadros-chave: {contar_chaves(P)} · amostrado em {time.time() - t0:.1f} s")
    for w in avisos:
        print("aviso:", w)
    if "--so-plano" in a:
        print("plano:", os.path.join(pasta, "plano.json")); return 0
    r = montar_no_app(P, porta)
    print("montado:", r)
    if "--exportar" in a or "--comparar" in a:
        # regra do Pailer: SEMPRE pela placa (--cpu só para comparar); caiu no processador = motivo na tela
        f = exportar_no_app(pasta, nome, porta, "--cpu" not in a)
        if "--cpu" not in a and not f.get("placa"):
            print("ATENÇÃO: caiu no PROCESSADOR —", f.get("cpu_motivo") or f.get("erro") or "motivo não informado",
                  "→ ensinar a placa (Functions/export_placa.py) e reexportar")
        print("exportado:", f.get("output_path") or f)
        print("motor:", "PLACA" if f.get("placa") else "PROCESSADOR", f.get("cpu_motivo") or "")
        if "--comparar" in a and f.get("output_path"):
            print("comparação:", json.dumps(comparar(qh, f["output_path"], pasta, A["fps"], A["W"], A["H"]), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
