"""Escolher o MOMENTO certo dentro de um bruto e o ponto de corte certo na música.

Estudo que originou (Teaser ExpoCatadores, 2026-11-24, Instructions/agente/estudo-teaser-expocatadores.md): nitidez e
tremor quase não explicam o trecho que o Pailer escolhe; o que decide é o momento (auge do gesto, reação, contexto
com gente e marca do evento). Por isso a ferramenta NÃO escolhe sozinha: descarta o tecnicamente ruim, aponta os
candidatos (auges e pausas do movimento) e monta uma tira para o olho decidir com o checklist do estudo.

  take  BRUTO.mov [--dur 0.5] [--passo 2] [--saida tira.jpg]
        → JSON: um candidato limpo por fatia de 2 s + lista de defeitos + tira do bruto INTEIRO (verde = candidato,
          risco vermelho = defeito: borrado, câmera procurando, rosto cortado, estouro). A escolha é no olho.
  grade MUSICA [--inicio S] [--de A --ate B] [--top 12]
        → batida, colcheia e semicolcheia com a força do ataque; os mais fortes são os melhores pontos de corte
          (no teaser, 92% dos cortes caem a ≤2 quadros da semicolcheia, sempre num ataque real).
          --inicio = segundo da música que fica no 0 da timeline.
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np

CAN = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, CAN)
from Functions.agente_midia import ffmpeg_path, batidas  # noqa: E402

FPS, W = 6, 240


def _quadros(path):
    tmp = os.path.join(tempfile.gettempdir(), "escolher_take_dim.png")
    subprocess.run([ffmpeg_path(), "-v", "error", "-i", path, "-frames:v", "1", "-vf", f"scale={W}:-2", "-y", tmp],
                   timeout=120)
    import cv2
    H = cv2.imread(tmp).shape[0]   # altura real depois da rotação do celular (calcular à mão erra)
    raw = subprocess.run([ffmpeg_path(), "-v", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo",
                          "-pix_fmt", "bgr24", "-"], capture_output=True, timeout=1800).stdout
    n = len(raw) // (W * H * 3)
    return np.frombuffer(raw[:n * W * H * 3], np.uint8).reshape(n, H, W, 3), H


def medir(path):
    import cv2
    from Functions.recorte_pro import _yunet
    fr, H = _quadros(path)
    det = _yunet(); det.setInputSize((W, H))
    m, ant = [], None
    for f in fr:
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)
        nit = float(cv2.Laplacian(g, cv2.CV_32F).var())
        est = float(((g > 250) | (g < 5)).mean())
        mov = dif = 0.0
        if ant is not None:
            (dx, dy), _ = cv2.phaseCorrelate(ant, g); mov = float(np.hypot(dx, dy))
            dif = float(np.abs(g - ant).mean())
        ant = g
        _, fs = det.detect(f)
        fs = [] if fs is None else [x for x in fs if x[2] > W * 0.06]
        area = borda = 0.0
        if fs:
            b = max(fs, key=lambda x: x[2] * x[3]); x, y, w, h = b[:4]
            area = float(w * h / (W * H)); borda = float(x < 2 or y < 2 or x + w > W - 2 or y + h > H - 2)
        m.append(dict(nit=nit, est=est, mov=mov, dif=dif, rostos=len(fs), area=area, borda=borda))
    return m


def _rank(v):
    v = np.asarray(v, float); o = np.argsort(np.argsort(v)); return o / max(1, len(v) - 1)


def take(path, dur=0.5, saida=None, passo=2.0):
    """Filtro de defeitos + um candidato limpo por fatia de `passo` s (a janela mais firme da fatia). Sem nota de
    qualidade: medido em 104 escolhas do Pailer, nenhuma métrica de imagem acertou mais que o acaso (45% x 44%)."""
    m = medir(path)
    N = len(m)
    if N < 4:
        return {"erro": "bruto curto demais"}
    nit = np.array([x["nit"] for x in m]); mov = np.array([x["mov"] for x in m])
    rn, rm = _rank(nit), _rank(mov)
    defeito = []
    for i, x in enumerate(m):
        d = []
        if rn[i] < 0.12 and nit[i] < 0.5 * np.median(nit): d.append("borrado")
        if rm[i] > 0.85 and mov[i] > 6: d.append("câmera procurando")
        if x["borda"]: d.append("rosto cortado na borda")
        if x["est"] > 0.25: d.append("estouro/preto")
        defeito.append(d)
    L = max(1, int(round(dur * FPS))); P = max(L, int(passo * FPS))
    cand = []
    for s0 in range(0, N - L + 1, P):
        ok = [i for i in range(s0, min(s0 + P, N - L + 1)) if not any(defeito[k] for k in range(i, i + L))]
        if ok:
            i = min(ok, key=lambda i: float(np.mean(mov[i:i + L])))
            cand.append({"inicio": round(i / FPS, 2), "fim": round((i + L) / FPS, 2),
                         "rostos": int(max(m[k]["rostos"] for k in range(i, i + L)))})
    limpo = 1 - sum(1 for d in defeito if d) / N
    out = {"arquivo": path, "duracao": round(N / FPS, 2), "limpo": round(limpo, 2), "candidatos": cand,
           "defeitos": _faixas(defeito),
           "decidir_no_olho": "auge do gesto/reação; mini-história (ação→resultado→reação); contexto com gente e marca do "
                              "evento; plano aberto que aguente punch-in; ver Instructions/agente/estudo-teaser-expocatadores.md"}
    out["tira"] = _tira(path, out, saida)
    return out


def _faixas(defeito):
    """Defeitos por quadro → faixas [início, fim, motivos] (curto no chat)."""
    out = []
    for i, d in enumerate(defeito):
        if not d:
            continue
        t = round(i / FPS, 2)
        if out and t - out[-1][1] <= 1.5 / FPS:
            out[-1][1] = t; out[-1][2] |= set(d)
        else:
            out.append([t, t, set(d)])
    return [[a, round(b + 1 / FPS, 2), ", ".join(sorted(m))] for a, b, m in out]


def _tira(path, res, saida):
    from PIL import Image, ImageDraw, ImageFont
    dur = res["duracao"]; passo = max(0.5, dur / 40)
    ts = sorted(set([round(k * passo, 2) for k in range(int(dur / passo) + 1)] +
                    [round((c["inicio"] + c["fim"]) / 2, 2) for c in res["candidatos"]]))
    ruins = [(a, b) for a, b, _ in res["defeitos"]]
    try:
        fnt = ImageFont.truetype("arial.ttf", 15)
    except OSError:
        fnt = ImageFont.load_default()
    tmpd = tempfile.mkdtemp(prefix="tira_take_"); ims = []
    for t in ts:
        q = os.path.join(tmpd, f"{t:.2f}.jpg")
        subprocess.run([ffmpeg_path(), "-v", "error", "-ss", str(t), "-i", path, "-frames:v", "1", "-vf", "scale=-2:220", "-y", q],
                       timeout=60)
        if not os.path.exists(q):
            continue
        im = Image.open(q).convert("RGB"); d = ImageDraw.Draw(im)
        c = next((c for c in res["candidatos"] if c["inicio"] - 0.05 <= t <= c["fim"] + 0.05), None)
        if c:
            d.rectangle([0, 0, im.width - 1, im.height - 1], outline=(0, 255, 0), width=6)
        elif any(a <= t <= b for a, b in ruins):
            d.line([0, 0, im.width, im.height], fill=(255, 0, 0), width=4)
        d.rectangle([0, 0, 92, 18], fill=0); d.text((2, 1), f"{t:.1f}s",
                                                   fill="lime" if c else "white", font=fnt)
        ims.append(im)
    Wd, Hd = ims[0].size; C = 12
    sh = Image.new("RGB", (Wd * C, Hd * ((len(ims) + C - 1) // C)))
    for k, im in enumerate(ims):
        sh.paste(im, ((k % C) * Wd, (k // C) * Hd))
    saida = saida or os.path.join(tmpd, "tira.jpg")
    sh.save(saida, quality=78)
    return saida


def grade(musica, inicio=0.0, de=0.0, ate=None, top=12):
    b = batidas(musica)
    if "erro" in b:
        return b
    B = np.array(b["batidas"]); per = float(np.median(np.diff(B)))
    sr, hop, nf = 22050, 256, 1024
    x = np.frombuffer(subprocess.run([ffmpeg_path(), "-v", "error", "-i", musica, "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                                     capture_output=True, timeout=600).stdout, np.float32)
    q = 1 + (len(x) - nf) // hop
    idx = np.arange(nf)[None, :] + hop * np.arange(q)[:, None]
    E = np.log1p(np.abs(np.fft.rfft(x[idx] * np.hanning(nf), axis=1)) * 10)
    fl = np.r_[0, np.maximum(0, np.diff(E, axis=0)).sum(1)]; fl = fl / (np.percentile(fl, 99) or 1)
    fps = sr / hop
    ate = ate if ate is not None else len(x) / sr - inicio
    pontos = []
    passos = int(B[0] / (per / 4))
    t = B[0] - passos * per / 4
    k = (-passos) % 4          # k % 4 == 0 cai na batida
    while t < len(x) / sr:
        tl = t - inicio
        if de <= tl <= ate:
            i = int(t * fps); forca = float(fl[max(0, i - 2):i + 3].max()) if i < len(fl) else 0.0
            tipo = "batida" if k % 4 == 0 else ("colcheia" if k % 2 == 0 else "semicolcheia")
            pontos.append({"t": round(tl, 3), "quadro30": int(round(tl * 30)), "tipo": tipo, "ataque": round(forca, 2)})
        t += per / 4; k += 1
    fortes = sorted(pontos, key=lambda p: -p["ataque"])[:top]
    return {"bpm": b["bpm"], "batida_s": round(per, 3), "semicolcheia_s": round(per / 4, 3),
            "mais_fortes": sorted(fortes, key=lambda p: p["t"]), "pontos": pontos}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="acao", required=True)
    a = sub.add_parser("take"); a.add_argument("bruto"); a.add_argument("--dur", type=float, default=0.5)
    a.add_argument("--passo", type=float, default=2.0); a.add_argument("--saida")
    g = sub.add_parser("grade"); g.add_argument("musica"); g.add_argument("--inicio", type=float, default=0.0)
    g.add_argument("--de", type=float, default=0.0); g.add_argument("--ate", type=float); g.add_argument("--top", type=int, default=12)
    g.add_argument("--tudo", action="store_true", help="lista também todos os pontos da grade")
    o = ap.parse_args()
    if o.acao == "take":
        r = take(o.bruto, o.dur, o.saida, o.passo)
    else:
        r = grade(o.musica, o.inicio, o.de, o.ate, o.top)
        if not o.tudo:
            r.pop("pontos", None)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
