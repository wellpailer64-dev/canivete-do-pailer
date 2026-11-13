"""Refina sozinho o recorte do Pincel Roto de um clipe (sem olhar imagem): compara a máscara do SAM com uma segunda
opinião do BEN2 (o "Selecionar assunto"), acha os pedaços da pessoa que ficaram de fora (topo da cabeça, orelha, ponta
dos óculos, ombro) e, com --aplicar, põe os pontos verdes nesses quadros, congela, espera e mede de novo.

    py -3.13 tools/agente/roto_refinar.py --clip "Gancho recortado esq"                 # só mede (rápido, não muda nada)
    py -3.13 tools/agente/roto_refinar.py --clip "Gancho recortado esq" --aplicar       # corrige e confere
    opções: --porta 9333  --passo 6 (quadros medidos; BEN2 na CPU ~20 s/quadro, guardado em <cache>/ref)  --max-bases 4  --limiar 0.01  --tirar (também pontos vermelhos)
            --qual alta (refaz no modelo grande antes; borda melhor, mais lento)  --folha saida.jpg (1 imagem pequena)

Saída: uma linha por quadro medido (falta = área de fora / área do recorte) e o veredito OK/CORRIGIR. Saída 0 = OK.
As outras pessoas recortadas do mesmo vídeo (outros clipes com Roto na mesma mídia) ficam fora da zona de busca,
para o recorte de uma não puxar a outra. Não salva o projeto.
"""
import argparse, json, os, sys, time
import cv2
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ)
sys.path.insert(0, r"D:/Kanivete/Plugins/kanicode/plugins/kanivete")
sys.stdout.reconfigure(encoding="utf-8")
import kanivete  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--clip", required=True)
ap.add_argument("--porta", type=int, default=9333)
ap.add_argument("--cache", default="")
ap.add_argument("--passo", type=int, default=6)
ap.add_argument("--max-bases", type=int, default=4)
ap.add_argument("--limiar", type=float, default=0.01)
ap.add_argument("--tirar", action="store_true")
ap.add_argument("--aplicar", action="store_true")
ap.add_argument("--qual", default="")
ap.add_argument("--folha", default="")
a = ap.parse_args()
W = 540   # análise em 540 de largura (pedaço de 0,15% do quadro ainda aparece)


def J(s):
    return kanivete.js(s, a.porta).strip().splitlines()[-1]


CL = f"VE.clips.find(c=>c.nome===({json.dumps(a.clip)}))"
info = json.loads(J(f"""(()=>{{const c={CL}; if(!c) return 'null'; const f=(c.fx||[]).find(f=>f.t==='roto'); if(!f||!f.v.rd) return 'null';
  const outros=VE.clips.filter(o=>o!==c&&o.m===c.m&&(o.fx||[]).some(g=>g.t==='roto'&&g.v.rd)).map(o=>o.fx.find(g=>g.t==='roto').v.rd.rid);
  return JSON.stringify({{rid:f.v.rd.rid, outros:[...new Set(outros)]}})}})()"""))
if not info:
    sys.exit("clipe sem Pincel Roto: " + a.clip)
outros = [r for r in info["outros"] if r != info["rid"]]
CACHE = a.cache
if not CACHE:   # mesma pasta de cache do app (teste ou do usuário)
    for c in (r"D:/kanivete_testes/cache_teste/Canivete Render Cache/Roto/", os.path.expandvars(r"%APPDATA%/CaniveteDoPailer/Canivete Render Cache/Roto/")):
        if os.path.isdir(c + info["rid"]):
            CACHE = c
            break
D = CACHE + info["rid"] + "/"
INF = json.load(open(D + "info.json", encoding="utf-8"))
N = INF["n"]


def ler(arq, cinza=True):
    im = cv2.imread(arq, cv2.IMREAD_GRAYSCALE if cinza else cv2.IMREAD_COLOR)
    if im is None:
        return None
    return cv2.resize(im, (W, int(W * im.shape[0] / im.shape[1])), interpolation=cv2.INTER_AREA)


_ben = None


def ben2(i):
    """Alfa do BEN2 no quadro i (guardado em <cache>/ref/ para não refazer)."""
    global _ben
    arq = D + f"ref/r_{i:05d}.png"
    if os.path.exists(arq):
        return cv2.imread(arq, cv2.IMREAD_GRAYSCALE)
    if _ben is None:
        from Functions import removerfundo
        _ben = (removerfundo,) + tuple(removerfundo.garantir_modelo("ben2"))
    from PIL import Image
    rf, path, cfg = _ben
    bgr = cv2.imread(D + f"quadros/q_{i:05d}.jpg")
    bgr = cv2.resize(bgr, (1080, int(1080 * bgr.shape[0] / bgr.shape[1])), interpolation=cv2.INTER_AREA)
    al = np.array(rf._remover_fundo_onnx(Image.fromarray(bgr[..., ::-1]), path, cfg).getchannel("A"), np.uint8)
    al = cv2.resize(al, (W, int(W * al.shape[0] / al.shape[1])), interpolation=cv2.INTER_AREA)
    os.makedirs(D + "ref", exist_ok=True)
    cv2.imwrite(arq, al)
    return al


def medir(i):
    """Falta (pedaços do BEN2 colados na pessoa e fora do recorte) e sobra (recorte onde o BEN2 diz fundo)."""
    sam = ler(D + f"a/a_{i:05d}.png")
    if sam is None:
        return None
    S = sam > 127
    h = S.shape[0]
    B = ben2(i) > 140
    el = lambda f: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(W * f) | 1,) * 2)
    faixa = cv2.dilate(S.astype(np.uint8), el(0.05)) > 0          # só o que encosta no contorno conta como falta
    for r in outros:   # a outra pessoa não é desta
        o = ler(CACHE + r + f"/a/a_{i:05d}.png")
        if o is not None:
            faixa &= ~(cv2.dilate((o > 127).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0)
    e = np.ones((3, 3), np.uint8)
    cand = cv2.morphologyEx((B & faixa & ~S).astype(np.uint8), cv2.MORPH_OPEN, e)
    falta = np.zeros_like(cand)
    nl, lab, st, _ = cv2.connectedComponentsWithStats(cand, 8)
    for j in range(1, nl):   # pedaço que continua para longe (moto, placa, outra pessoa) é outro objeto, não falta
        bl = (lab == j).astype(np.uint8)
        if st[j, cv2.CC_STAT_AREA] < 0.0004 * W * h:
            continue
        longe = (B & (cv2.dilate(bl, el(0.05)) > 0) & ~faixa).sum()
        if longe <= 0.6 * st[j, cv2.CC_STAT_AREA]:
            falta |= bl
    sobra = cv2.morphologyEx((S & ~(cv2.dilate(B.astype(np.uint8), e, iterations=3) > 0)).astype(np.uint8), cv2.MORPH_OPEN, e, iterations=2)
    area = max(1, S.sum())
    pts = []
    for m, rot in ((falta, 1), (sobra, 0)):
        if rot == 0 and not a.tirar:
            continue
        nl, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
        blobs = sorted([(st[j, cv2.CC_STAT_AREA], j) for j in range(1, nl) if st[j, cv2.CC_STAT_AREA] >= 0.0004 * W * h], reverse=True)
        for ar, j in blobs[:4]:   # ponto no miolo do pedaço (máximo da distância à borda)
            dt = cv2.distanceTransform((lab == j).astype(np.uint8), cv2.DIST_L2, 3)
            y, x = np.unravel_index(dt.argmax(), dt.shape)
            pts.append([round(float(x) / W, 4), round(float(y) / h, 4), rot, int(ar)])
    return {"q": i, "falta": falta.sum() / area, "sobra": sobra.sum() / area, "pts": pts}


def rodada(qs):
    out = []
    for i in qs:
        r = medir(i)
        if r:
            out.append(r)
    return out


def mostrar(res, titulo):
    print(titulo)
    print("  " + "  ".join(f"{r['q']}:{r['falta']*100:.1f}%" + (f"/-{r['sobra']*100:.1f}" if a.tirar else "") for r in res))


def esperar_roto(t_max=900):
    t0 = time.time()
    while time.time() - t0 < t_max:
        e = json.loads(J(f"JSON.stringify(VEROTO_API.estado({CL}))"))
        if e["erro"] or (e["prontos"] == e["n"] and not e["rodando"] and not e["pend"]):
            return e
        time.sleep(4)
    return e


qs = sorted(set(list(range(0, N, a.passo)) + [N - 1]))
t0 = time.time()
antes = rodada(qs)
mostrar(antes, f"antes ({len(qs)} quadros, {time.time()-t0:.0f} s; falta por quadro)")
ruins = sorted([r for r in antes if r["falta"] >= a.limiar or (a.tirar and r["sobra"] >= a.limiar)], key=lambda r: -(r["falta"] + r["sobra"]))
escolha = []
for r in ruins:   # piores primeiro, quadros-base afastados
    if len(escolha) < a.max_bases and all(abs(r["q"] - e["q"]) >= 2 * a.passo for e in escolha):
        escolha.append(r)
pior = max(antes, key=lambda r: r["falta"])
if not escolha:
    print("OK: recorte bate com a segunda opinião (pior %.1f%% no quadro %d)" % (pior["falta"] * 100, pior["q"]))
    sys.exit(0)
print("CORRIGIR em", ", ".join(f"q{e['q']} ({len(e['pts'])} pontos)" for e in sorted(escolha, key=lambda e: e["q"])))
if not a.aplicar:
    for e in sorted(escolha, key=lambda e: e["q"]):
        print("  q%d %s" % (e["q"], e["pts"]))
    sys.exit(1)

J(f"(async()=>{{const c={CL}; VE.sel=VE.clips.indexOf(c); veSeek(c.st); await VEROTO_API.abrir(c); return 'ok'}})()")
esperar_roto(120)
J("(()=>{VEROTO_API.seguir(false); return 'ok'})()")
if a.qual and a.qual != INF.get("qual"):
    J(f"(()=>{{veRotoQualidade({json.dumps(a.qual)}); return 'ok'}})()")
    esperar_roto()
for e in escolha:
    for x, y, rot, _ in e["pts"][:6]:
        J(f"(()=>{{VEROTO_API.tracar({CL},{e['q']},[[{x},{y}]],{'true' if rot else 'false'},0.012); return 'ok'}})()")
time.sleep(2)
J(f"(async()=>{{await VEROTO_API.esperar({CL}); VEROTO_API.freeze(); return 'ok'}})()")
fim = esperar_roto()
J("(()=>{veRotoTelaFechar(); VE.sel=-1; veRefresh(); return 'ok'})()")
depois = rodada(qs)
mostrar(depois, "depois")
pd = max(depois, key=lambda r: r["falta"])
print("pior antes %.1f%% (q%d) → depois %.1f%% (q%d)%s" % (pior["falta"] * 100, pior["q"], pd["falta"] * 100, pd["q"], " | erro: " + fim["erro"] if fim.get("erro") else ""))
if a.folha:   # 1 imagem pequena: o pior quadro de antes, recorte em rosa por cima (antes x depois não dá: o cache foi refeito)
    q = pior["q"]
    fr = ler(D + f"quadros/q_{q:05d}.jpg", False)
    al = ler(D + f"a/a_{q:05d}.png")[..., None] / 255.0
    o = fr * al + (fr * 0.4 + np.array([255, 0, 255]) * 0.6) * (1 - al)
    cv2.imwrite(a.folha, o.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 80])
sys.exit(0 if pd["falta"] < a.limiar else 1)
