"""Reel falado de cliente em um comando: roteiro JSON -> .vknv com cortes, zooms em camada de ajuste, cor, legenda, tarjas, trilha e finalização.
    py -3.13 tools/agente/reel_fala.py roteiro.json              gera o projeto (recusa sobrescrever: nunca apaga ajuste do Pailer)
    py -3.13 tools/agente/reel_fala.py roteiro.json --abrir 9333 abre no app, põe as transições e salva
Exemplo de roteiro: Instructions/agente/exemplos/reel_fala_gordinhos.json. Campos no guia-edicao.md, seção REEL FALADO.
Transcrição e batidas ficam em cache na pasta "trabalho". Depois: tools/agente/checar_cortes.py e exportar_conferencia.py.
"""
import json
import os
import re
import subprocess
import sys
import unicodedata

import cv2  # noqa: F401  (o YuNet precisa dele carregado)
import numpy as np
from PIL import ImageFont

sys.stdout.reconfigure(encoding="utf-8")
CAN = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, CAN)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from Functions.recorte_pro import _yunet  # noqa: E402
from polir_montagem import polir  # noqa: E402

W, H, FPS = 1080, 1920, 30
PADRAO = {"sc": 100, "x": W / 2, "y": H / 2, "rot": 0, "op": 100}
COR = {"temp": 2, "ct": 22, "hi": 10, "sh": -4, "wh": 7, "bl": -6, "sat": 106, "vib": 17, "clar": 20}   # grade que o Pailer acertou (2026-11-01); sem bloom
GANHO = {"voz": -6, "musica": -21, "musica_fim": -5, "whoosh": -15, "whoosh_fim": -10, "impacto": -13, "impacto_fim": -11, "pop": -13}
LEG = {"fonte": "SF Pro Display", "tam": 3.5, "cor": "#ffffff", "fundo": "sombra", "pos": "baixo", "maiusc": False, "negrito": True, "ita": False, "sOn": True,
       "sCor": "#000000", "sOp": 100, "sDist": 5, "sBlur": 6, "entrada": "nenhum", "px": 0, "py": 13, "cLarg": 0, "dOn": True, "dCor": "#e0162b", "dTxt": "#ffffff",
       "dOp": 100, "dRaio": 30, "dPad": 12, "caixaOp": 0}
CONEC = {"um", "uma", "a", "o", "as", "os", "de", "do", "da", "que", "e", "no", "na", "em", "com", "para", "pra", "se", "já"}
JUNTAS = [(("um", "ponto", "três"), "1.3"), (("um", "ponto", "oito"), "1.8"), (("dez", "por", "cento"), "10%"), (("up", "grade"), "upgrade")]
# a fonte instalada só para o usuário fica fora de C:/Windows/Fonts; sem achar, a largura da tarja vira chute e o brasão cobre letra
FONTE_TARJA = next((f for f in (os.path.join(r, "FontsFree-Net-SFProDisplay-Black.ttf") for r in (r"C:/Windows/Fonts", os.path.expandvars(r"%USERPROFILE%/AppData/Local/Microsoft/Windows/Fonts"))) if os.path.exists(f)), "")
D_TARJA, Y_TARJA, D_FIM = 2.9, 1240, 3.4
SOM = os.path.join(CAN, "soundboard")

CFG = json.load(open(sys.argv[1], encoding="utf-8"))
PASTA = CFG["pasta_card"].rstrip("/\\")
BR = PASTA + "/01 - BRUTO/"
TRAB = CFG["trabalho"]
SAIDA = CFG["saida"]
FONTES = CFG["fontes"]
NOMES = {k.lower(): v for k, v in CFG.get("nomes", {}).items()}
os.makedirs(TRAB + "/tx", exist_ok=True)
GANHO.update(CFG.get("ganhos", {}))
COR.update(CFG.get("cor", {}))


def _duracao(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn"))


def _palavras(k):
    f = f"{TRAB}/tx/{FONTES[k]}.json"
    if not os.path.isfile(f):
        t = subprocess.run([sys.executable, "-m", "Functions.agente_midia", "transcrever", BR + FONTES[k] + ".mp4"], cwd=CAN, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
        open(f, "w", encoding="utf-8").write(t[t.index("{"):])
    return [tuple(w[:3]) for w in json.load(open(f, encoding="utf-8"))["palavras"]]


def _energia(k):
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", BR + FONTES[k] + ".mp4", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout, np.float32)
    return np.sqrt(np.convolve(x ** 2, np.ones(320) / 320, "same"))[::160]


FALADAS = sorted({t[0] for v in CFG["versoes"] for t in v["roteiro"]})
WS = {k: _palavras(k) for k in FALADAS}
EN = {k: _energia(k) for k in FALADAS}
LIM = {k: max(0.012, float(np.percentile(EN[k], 60)) * 0.25) for k in FALADAS}


def achar(k, frase, desde=0.0):
    alvo = [_norm(p) for p in frase.split()]
    ws = WS[k]
    for i in range(len(ws)):
        if ws[i][0] >= desde and all(i + j < len(ws) and _norm(ws[i + j][2]) == a for j, a in enumerate(alvo)):
            return i, i + len(alvo) - 1
    raise SystemExit(f"não achei '{frase}' em {k}: confira a transcrição em {TRAB}/tx")


def fim_voz(k, b):
    """Fim do corte no vale da voz, não na próxima palavra: a transcrição estima o fim da palavra e comeu 'saturado' (2026-11-01)."""
    e, j = EN[k], int(b * 100)
    if j >= len(e):
        return b
    trecho = e[max(0, j - 5):j + 30]
    if not len(trecho):
        return b
    corte = max(0, j - 5) + int(np.argmin(trecho))
    if e[corte] > LIM[k]:      # sem vale: a voz emenda na palavra seguinte; fica no menor ponto, avisando
        print(f"  aviso: {k} {b:.2f} sem silêncio no fim da palavra")
    return corte / 100 + 0.02


def cortes(k, ini, fim):
    i0, _ = achar(k, ini)
    _, i1 = achar(k, fim, WS[k][i0][0])
    ws, ps, atual = WS[k], [], i0
    for i in range(i0 + 1, i1 + 1):
        gap, pont = ws[i][0] - ws[i - 1][1], ws[i - 1][2][-1] in ".,?!;:"
        if gap > (0.30 if pont else 0.45):
            ps.append((atual, i - 1, True)); atual = i
        elif ws[i - 1][1] - ws[atual][0] > (3.0 if pont else 4.6):
            ps.append((atual, i - 1, False)); atual = i    # troca de enquadramento: mesmo tempo da fonte, nada se perde
    ps.append((atual, i1, True))
    out, emenda = [], None
    for a, b, pula in ps:
        comeco = emenda if emenda is not None else max(0.0, ws[a][0] - 0.08)
        final = fim_voz(k, ws[b][1]) if pula else round((ws[b][1] + ws[b + 1][0]) / 2, 3)
        if pula and b < i1:    # o vale pode cair na palavra seguinte e repetir voz ("moto motor", 2026-11-02)
            final = min(final, round(ws[b + 1][0] - 0.08, 3))
        out.append((k, a, b, comeco, final))
        emenda = None if pula else final
    return out


def rosto(k, t, cache={}):
    if (k, t) not in cache:
        p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", BR + FONTES[k] + ".mp4", "-frames:v", "1", "-vf", "scale=540:960", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True).stdout
        y = _yunet(); y.setInputSize((540, 960)); _, fs = y.detect(np.frombuffer(p, np.uint8).reshape(960, 540, 3).copy())
        f = max(fs, key=lambda v: v[2] * v[3] * v[14]) if fs is not None and len(fs) else None
        cache[(k, t)] = (float(f[0] + f[2] / 2) * 2, float(f[1] + f[3] / 2) * 2, float(f[2]) * 2) if f is not None and f[14] > 0.7 else None
    return cache[(k, t)]


def legendas(k, a, b, ofs):
    ws, toks, i = WS[k], [], a
    limpa = lambda x: re.sub(r"[.,?!;:]+$", "", x)
    while i <= b:
        for seq_, novo in JUNTAS:
            n = len(seq_)
            if i + n - 1 <= b and all(limpa(ws[i + j][2]).lower() == seq_[j] for j in range(n)):
                toks.append((ws[i][0], ws[i + n - 1][1], novo, ws[i + n - 1][2][-1] in ".?!,")); i += n
                break
        else:
            x = limpa(ws[i][2])
            toks.append((ws[i][0], ws[i][1], NOMES.get(x.lower(), x.lower()), ws[i][2][-1] in ".?!,")); i += 1
    grupos, g, n = [], [], 0
    for t in toks:
        if g and (n + len(t[2]) > 22 or len(g) >= 5):
            grupos.append(g); g, n = [], 0
        g.append(t); n += len(t[2]) + 1
        if t[3] and n > 10:
            grupos.append(g); g, n = [], 0
    if g:
        grupos.append(g)
    for j in range(len(grupos) - 1):
        while len(grupos[j]) > 1 and grupos[j][-1][2].lower() in CONEC:
            grupos[j + 1].insert(0, grupos[j].pop())
    j = 1
    while j < len(grupos):
        if len(grupos[j]) == 1 and sum(len(x[2]) + 1 for x in grupos[j - 1]) + len(grupos[j][0][2]) <= 24:
            grupos[j - 1] += grupos.pop(j)
        else:
            j += 1
    out = []
    for g in grupos:
        pt = []
        for x in g:
            ps = x[2].split(" "); d = (x[1] - x[0]) / len(ps)
            pt += [[round(x[0] + q * d - ofs, 3), round(x[0] + (q + 1) * d - ofs, 3)] for q in range(len(ps))]
        out.append({"st": round(g[0][0] - ofs, 3), "en": round(g[-1][1] - ofs, 3), "texto": " ".join(x[2] for x in g), "pt": pt})
    return out


media = [{"id": i + 1, "kind": "timeline", "name": v["nome"], "pasta": None, "sequenceId": v["id"]} for i, v in enumerate(CFG["versoes"])]


def add(kind, name, **kw):
    media.append({"id": len(media) + 1, "kind": kind, "name": name, "pasta": None, **kw})
    return len(media)


MID = {k: add("video", v + ".mp4", path=BR + v + ".mp4") for k, v in FONTES.items()}
M_BR = add("image", os.path.basename(CFG["brasao"]), path=CFG["brasao"])
M_TX = add("texto", "Texto")
M_AJ = add("ajuste", "Camada de ajuste")
ASSETS = PASTA + "/02 - ASSETS/"
SONS = {}
for chave, rel in (("whoosh", "whoosh/whoosh_medio_02.ogg"), ("pop", "pop/pop_01.ogg"), ("impacto", "impacto/boom_01.ogg")):
    alvo = ASSETS + os.path.basename(rel)
    if not os.path.isfile(alvo):
        os.makedirs(ASSETS, exist_ok=True)
        with open(os.path.join(SOM, *rel.split("/")), "rb") as o, open(alvo, "wb") as d_:
            d_.write(o.read())
    SONS[chave] = (add("audio", os.path.basename(rel), path=alvo), round(_duracao(alvo), 3))
M_MU = add("audio", os.path.basename(CFG["musica"]), path=CFG["musica"])
DUR_MUS = _duracao(CFG["musica"])
f_bat = TRAB + "/batidas.json"
if not os.path.isfile(f_bat):
    t = subprocess.run([sys.executable, "-m", "Functions.agente_midia", "batidas", CFG["musica"]], cwd=CAN, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    json.dump(json.loads(t[t.index("{"):]), open(f_bat, "w"))
BAT = json.load(open(f_bat))
BPM, BATIDAS = BAT["bpm"], BAT["batidas"]
DURS = {MID[k]: _duracao(BR + v + ".mp4") for k, v in FONTES.items()}
FT = ImageFont.truetype(FONTE_TARJA, 52) if os.path.exists(FONTE_TARJA) else None


def versao(v):
    clips, legs, mapa, zooms, t, n = [], [], [], [], 0.0, 0
    for k, ini, fim_ in v["roteiro"]:
        for kk, a, b, s0, s1 in cortes(k, ini, fim_):
            s0, s1 = round(s0, 3), round(s1, 3)
            f = rosto(kk, (s0 + s1) / 2)
            if f:
                z, ent, mola, der = [(108, 0, 0, 4), (128, 0, 0, 2), (118, 0.3, 1, 2)][n % 3]
                if f[2] > 200:
                    z = 100 + (z - 100) * 0.4
                cx, cy = round(f[0] / 10.8, 1), round(f[1] / 19.2, 1)
            else:
                z, ent, mola, der, cx, cy = (106 if n % 2 else 112), 0, 0, 3, 50, 50
            zooms.append((round(t, 3), round(t + s1 - s0, 3), {"z": z, "ent": ent, "sai": 0, "suav": 80, "mola": mola, "der": der, "cx": cx, "cy": cy, "mb": 0, "obt": 100}))
            sc = round(100 * CFG.get("escala_base", {}).get(kk, 1), 2)   # mídia pequena preenche o quadro; escala fixa, sem animação
            clips.append({"tr": 0, "st": round(t, 3), "s": s0, "e": s1, "m": MID[kk], "g": GANHO["voz"], "p": {**PADRAO, "sc": sc}})
            legs += legendas(kk, a, b, s0 - t)
            mapa.append((kk, a, b, s0, s1, t))
            t += s1 - s0; n += 1
    fim_fala = round(t, 3)
    fim = round(fim_fala + D_FIM, 3)

    def quando(k, frase):
        i, _ = achar(k, frase)
        for kk, a, b, s0, s1, st in mapa:
            if kk == k and a <= i <= b:
                return round(st + WS[k][i][0] - s0, 3)
        return None

    def fim_do_corte(tl):
        return next((st + s1 - s0 for _, _, _, s0, s1, st in mapa if st <= tl < st + s1 - s0), tl)

    for k, frase, fonte, s, d in CFG.get("apoios", []):
        tl = quando(k, frase)
        if tl is None:
            continue
        fc = fim_do_corte(tl + d)
        d = min(fc - tl if fc - (tl + d) < 1.5 else d, 4.2)
        clips.append({"tr": 1, "x": "v", "st": tl, "s": s, "e": round(s + d, 3), "m": MID[fonte], "p": dict(PADRAO)})
    fonte_f, s_f = CFG["finalizacao"]
    clips.append({"tr": 0, "x": "v", "st": fim_fala, "s": s_f, "e": round(s_f + D_FIM, 3), "m": MID[fonte_f], "p": {**PADRAO, "sc": 108},
                  "fx": [{"id": "fxfim", "t": "blur", "on": True, "v": {"amt": 34}}], "k": {"fx.fxfim.amt": [{"t": 0, "v": 0, "i": "ease"}, {"t": 0.5, "v": 34}]}})
    clips.append({"tr": 5, "st": 0, "s": 0, "e": fim_fala, "m": M_BR, "p": {**PADRAO, "sc": 12.5, "x": 930, "y": 175},
                  "k": {"sc": [{"t": 0, "v": 0, "i": "ease"}, {"t": 0.35, "v": 14.2, "i": "ease"}, {"t": 0.5, "v": 12.5}]}})
    clips.append({"tr": 5, "st": fim_fala, "s": 0, "e": D_FIM, "m": M_BR, "p": {**PADRAO, "sc": 44, "x": 540, "y": 900},
                  "k": {"sc": [{"t": 0, "v": 12, "i": "ease"}, {"t": 0.32, "v": 47, "i": "ease"}, {"t": 0.5, "v": 44, "i": "lin"}, {"t": D_FIM, "v": 46}],
                        "op": [{"t": 0, "v": 0, "i": "lin"}, {"t": 0.12, "v": 100}]}})
    # trilha; se for curta, volta 8 compassos numa batida, sob a fala
    bat = lambda x: min(BATIDAS, key=lambda b: abs(b - x))
    if fim > DUR_MUS - 1.5:
        c1 = bat(fim_fala * 0.55); volta = bat(c1 - 8 * 4 * 60 / BPM)
        partes = [(0.0, 0.0, c1), (c1, volta, volta + fim_fala - c1)]
    else:
        partes = [(0.0, 0.0, fim_fala)]
    for st_, s_, e_ in partes:
        clips.append({"tr": 1, "x": "a", "st": round(st_, 3), "s": round(s_, 3), "e": round(e_, 3), "m": M_MU, "g": GANHO["musica"]})
    clips.append({"tr": 1, "x": "a", "st": fim_fala, "s": round(partes[-1][2], 3), "e": round(partes[-1][2] + D_FIM, 3), "m": M_MU, "g": GANHO["musica_fim"], "atout": {"t": "cp", "d": 1.4}})
    print(" polir:", polir(clips, media, DURS))
    apoios = sorted((c["st"], c["st"] + c["e"] - c["s"]) for c in clips if c["tr"] == 1 and c.get("x") == "v")

    def zoom(a, b, val, nome):
        clips.append({"tr": 2, "st": round(a, 3), "s": 0, "e": round(b - a, 3), "m": M_AJ, "cor": "pink", "nome": nome, "az": {"est": "manual"},
                      "fx": [{"id": f"fxz{len(clips)}", "t": "zoom", "on": True, "v": val}]})
    for a, b, val in zooms:
        for x, y in apoios:
            if y > a and x < b:
                if x - a > 0.05:
                    zoom(a, x, val, "Zoom")
                a = max(a, y)
        if b - a > 0.05:
            zoom(a, b, val, "Zoom")
    for x, y in apoios:
        zoom(x, y, {"z": 108, "ent": 0, "sai": 0, "suav": 80, "mola": 0, "der": 3, "cx": 50, "cy": 50, "mb": 0, "obt": 100}, "Zoom apoio")
    clips.append({"tr": 3, "st": 0, "s": 0, "e": fim, "m": M_AJ, "cor": "orange", "nome": "Cor", "fx": [{"id": "fxcor", "t": "lc", "on": True, "v": dict(COR)}]})
    tarjas = [(txt, quando(k, fr), bool(pop)) for txt, k, fr, pop in CFG.get("tarjas", [])]
    for txt, tt, pop in [x for x in tarjas if x[1] is not None]:
        larg = FT.getlength(txt) if FT else len(txt) * 28
        tx = {"t": txt, "fonte": LEG["fonte"], "fam": LEG["fonte"], "peso": 900, "tam": 52, "neg": True, "ita": False, "alin": "center", "esp": 0, "ent": 120, "cor": "#ffffff",
              "cOn": False, "cCor": "#000000", "cLarg": 6, "fOn": True, "fCor": CFG["cor_tarja"], "fOp": 100, "fPad": 26, "fRaio": 44, "sOn": True, "sCor": "#000000", "sOp": 55, "sDist": 5, "sBlur": 12, "sAng": 90}
        clips.append({"tr": 6, "st": tt, "s": 0, "e": D_TARJA, "m": M_TX, "nome": txt, "tx": tx, "p": {**PADRAO, "x": 578, "y": Y_TARJA},
                      "k": {"sc": [{"t": 0, "v": 40, "i": "ease"}, {"t": 0.2, "v": 106, "i": "ease"}, {"t": 0.32, "v": 100, "i": "lin"}, {"t": D_TARJA - 0.14, "v": 100, "i": "ease"}, {"t": D_TARJA, "v": 72}],
                            "op": [{"t": 0, "v": 0, "i": "lin"}, {"t": 0.08, "v": 100, "i": "lin"}, {"t": D_TARJA - 0.12, "v": 100, "i": "lin"}, {"t": D_TARJA, "v": 0}]}})
        clips.append({"tr": 7, "st": tt, "s": 0, "e": D_TARJA, "m": M_BR, "p": {**PADRAO, "sc": 8.6, "x": round(578 - larg / 2 - 96, 1), "y": Y_TARJA},
                      "k": {"sc": [{"t": 0, "v": 0, "i": "ease"}, {"t": 0.22, "v": 10, "i": "ease"}, {"t": 0.36, "v": 8.6, "i": "lin"}, {"t": D_TARJA - 0.14, "v": 8.6, "i": "ease"}, {"t": D_TARJA, "v": 0}]}})
        if pop:
            clips.append({"tr": 2, "x": "a", "st": tt, "s": 0, "e": SONS["pop"][1], "m": SONS["pop"][0], "g": GANHO["pop"]})
    blocos = [m[5] for j, m in enumerate(mapa) if j and mapa[j - 1][0] != m[0]]

    def som(chave, tl, g):
        clips.append({"tr": 2, "x": "a", "st": round(max(tl, 0), 3), "s": 0, "e": SONS[chave][1], "m": SONS[chave][0], "g": g})
    meio = SONS["whoosh"][1] / 2
    for b_ in blocos:
        som("whoosh", b_ - meio, GANHO["whoosh"])
    som("whoosh", fim_fala - meio, GANHO["whoosh_fim"])
    som("impacto", fim_fala + 0.05, GANHO["impacto_fim"])
    chave_ = None
    if CFG.get("momento_chave"):
        chave_ = quando(*CFG["momento_chave"])
        som("impacto", chave_, GANHO["impacto"])
    seq = {"id": v["id"], "name": v["nome"], "clips": clips, "trilhas": {"v": [{} for _ in range(8)], "a": [{}, {}, {}]}, "texto": {"palavras": []}, "legendas": legs,
           "inPt": None, "outPt": None, "markers": [], "guias": [], "playhead": 0, "view": {"pps": 12, "x": 0}, "w": W, "h": H, "legEstilo": LEG}
    print(f"{v['nome']}: fala {fim_fala:.1f} s, total {fim:.1f} s, {sum(1 for c in clips if c['tr'] == 0)} cortes, {len(legs)} legendas")
    return seq, {"blocos": blocos, "fim_fala": fim_fala, "chave": chave_}


def abrir(porta, plano):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        nav = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}")
        pg = [p for c in nav.contexts for p in c.pages if "index.html" in p.url][0]
        pg.set_default_timeout(0)
        if pg.evaluate("VE.dirty"):
            raise SystemExit("o app tem alterações sem salvar: não troquei de projeto")
        pg.evaluate("p => abrirProjetoExterno(p)", SAIDA)
        pg.wait_for_function("p => VE.ready && (VE.projectPath || '').replace(/[\\\\/]/g, '/') === p.replace(/[\\\\/]/g, '/') && VE.clips.length > 5", arg=SAIDA)
        pg.wait_for_timeout(2500)
        print(pg.evaluate("""async pl => { const log = [], ids = VE.sequences.map(s => s.id), ativa = VE.activeSequence;
          for (const sid of ids) { const q = VE.sequences.find(s => s.id === sid), pp = pl[sid]; if (!pp) continue; veSeqAplicar(q);
            await veAgente('Transições: ' + q.name, () => {
              for (const c of VE.clips) for (const f of (c.fx || [])) { const d = {}; ((VE_FX[f.t] || {}).params || []).forEach(p => d[p.k] = p.def); f.v = { ...d, ...f.v }; }
              for (const t of pp.blocos) veOvtAdd('zoomin', t, { d: 0.5, tr: 4 });
              if (pp.chave != null) veOvtAdd('flash', pp.chave, { d: 0.35, tr: 4 });
              veOvtAdd('zoomin', pp.fim_fala, { d: 0.5, tr: 4 }); });
            veSeqSalvarAtiva(); log.push([q.name, VE.clips.length]); }
          veSeqAplicar(VE.sequences.find(s => s.id === ativa)); veRelayout(); veRefresh(); await veSaveProject(false); return { log, dirty: VE.dirty }; }""", plano))
        nav.close()


if __name__ == "__main__":
    if os.path.exists(SAIDA) and "--abrir" not in sys.argv:
        raise SystemExit(f"já existe {SAIDA}: pode ter ajuste manual; use um nome novo ou edite em cima dele")
    plano_f = TRAB + "/plano_reel.json"
    if not os.path.exists(SAIDA):
        seqs, plano = zip(*[versao(v) for v in CFG["versoes"]])
        plano = {s["id"]: p for s, p in zip(seqs, plano)}
        s0 = seqs[0]
        base = BR + FONTES[CFG["video_base"]] + ".mp4"   # a taxa da timeline vem desta mídia: escolher uma com fps_timeline 30
        os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
        json.dump({"app": "KANIVETE", "video": base, "media": media, "bins": [], "m0": {"pasta": None}, "sequences": list(seqs), "activeSequence": s0["id"], "clips": s0["clips"],
                   "trilhas": s0["trilhas"], "texto": s0["texto"], "legendas": s0["legendas"], "legEstilo": LEG, "inPt": None, "outPt": None, "markers": [], "playhead": 0, "view": s0["view"],
                   "fps": FPS, "w": W, "h": H, "formato": "vknv", "versao": 1}, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False)
        json.dump(plano, open(plano_f, "w", encoding="utf-8"), ensure_ascii=False)
        print(SAIDA)
    if "--abrir" in sys.argv:
        abrir(int(sys.argv[sys.argv.index("--abrir") + 1]), json.load(open(plano_f, encoding="utf-8")))
