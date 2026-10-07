"""EXEMPLO (Alessandro/Minasparts, 2026-10-07; caminhos em D:/kanivete_testes/oficina) — copiar e ajustar CORTES/BROLL. Plano dos 3 cortes (Alessandro Barbosa, Minasparts): trechos por palavras, bordas pela energia da voz, legendas
corrigidas, enquadramento em quem fala (falante.py), B-roll e fechamento. Saída: plano_final.json (aplicar no app)."""
import json
import re
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, r"D:/kanivete_testes/oficina")
import falante  # noqa: E402

D = "D:/kanivete_testes/oficina/"
VIDEO = open(D + "video.txt", encoding="utf-8").read().strip()
PAL = json.load(open(D + "palavras.json", encoding="utf-8"))
OFF = 40.0   # entrevista16k.wav começa em 40 s

with wave.open(D + "entrevista16k.wav") as w:
    AUD = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
EN = np.sqrt(np.convolve(AUD ** 2, np.ones(160) / 160, "same"))[::160]   # energia a cada 10 ms
LIM = max(0.01, float(np.percentile(EN, 40)) * 2.2)


def voz(t):
    i = int((t - OFF) * 100)
    return 0 <= i < len(EN) and EN[i] > LIM


# trechos: (primeira palavra, última palavra) pelo início (s da fonte)
CORTES = [
    ("Corte 1 - Administrar tempo", [(118.28, 141.90), (439.26, 450.23)]),
    ("Corte 2 - Hora-homem e preço", [(179.08, 224.76)]),
    ("Corte 3 - As 3 horas e produtividade", [(283.56, 318.03), (340.04, 367.16), (398.47, 408.95)]),
]
FIXP = {}
FIX = {"auxílio": "oficina", "auxília": "oficina", "temparo": "Tempário", "tempária": "Tempário", "tempário": "Tempário", "tempar.": "Tempário.",
       "tempário,": "Tempário,", "tempário.": "Tempário.", "boscha": "Bosch", "cervice": "Service", "multipax,": "multimarcas,", "multipax": "multimarcas",
       "eme": "M", "ó": "O"}


def palavras_de(a_ini, a_fim):
    return [list(p) for p in PAL if a_ini - 0.01 <= p[0] <= a_fim + 0.01]


def bordas(ws):
    a, b = ws[0][0], ws[-1][1]
    ini = a
    while ini > a - 0.21 and voz(ini - 0.01):
        ini -= 0.01
    prox = next((p[0] for p in PAL if p[0] > ws[-1][0] + 0.01), b + 1)
    fim = b
    t, vale = b, 0
    while t < min(b + 0.7, prox - 0.04):
        t += 0.01
        if voz(t):
            fim, vale = t, 0
        else:
            vale += 1
            if vale > 6:
                break
    return round(ini - 0.03, 3), round(min(fim + 0.08, prox - 0.04), 3)


def corrigir(ws):
    out = []
    for i, (a, b, w) in enumerate(ws):
        k = w.lower()
        m = re.match(r"^(.*?)([.,!?;:…]*)$", w)
        base, pont = m.group(1), m.group(2)
        w2 = FIX.get(k) or (FIX[base.lower()] + pont if base.lower() in FIX else w)
        if k in ("tem",) and i + 1 < len(ws) and ws[i + 1][2].lower().startswith("paro"):   # "tem paro" = Tempário
            w2 = "o Tempário" + ("," if ws[i + 1][2].endswith(",") else "")
            ws[i + 1][2] = ""
        if w2.lower().startswith("tempário") and out and out[-1][2].lower() == "a":   # "a Tempário" → "o Tempário"
            out[-1][2] = "o" if out[-1][2] == "a" else "O"
        out.append([a, b, w2])
    return [x for x in out if x[2]]


def main():
    plano = {"video": VIDEO, "cortes": []}
    for nome, trechos in CORTES:
        clips, legs, t = [], [], 0.0
        ws = None
        for a_ini, a_fim in trechos:
            ws = palavras_de(a_ini, a_fim)
            s, e = bordas(ws)
            ws = [w for w in PAL if s <= w[0] < e]
            am = falante.analisar(VIDEO, s, e)
            # falante dominante do trecho: o lado (esq/dir) com mais boca mexendo somada
            lado = {0: 0.0, 1: 0.0}
            for x in am:
                for r in x["rostos"]:
                    lado[int(r["cx"] >= 960)] += r["mov"]
            L = 0   # os trechos escolhidos são falas do Alessandro, que está à esquerda em toda a entrevista (conferido nos quadros)
            # pontos de troca de enquadramento: pausas entre palavras (> 0.25 s) com pelo menos 3.5 s desde a última
            pausas, ult = [s], s
            for i in range(len(ws) - 1):
                g0 = ws[i][1]
                if re.search(r"[.,!?;:…]$", ws[i][2]) and g0 - ult >= 3.0 and e - g0 > 2.0:
                    pausas.append(round((g0 + ws[i + 1][0]) / 2, 3)); ult = pausas[-1]
            pausas.append(e)
            for t0, t1 in zip(pausas, pausas[1:]):
                rs = [r for x in am if t0 <= x["t"] < t1 for r in x["rostos"] if int(r["cx"] >= 960) == L]
                cx = float(np.median([r["cx"] for r in rs])) if rs else None
                cy = float(np.median([r["cy"] for r in rs])) if rs else None
                fw = float(np.median([r["fw"] for r in rs])) if rs else None
                f = lambda v: None if v is None else round(float(v), 2)
                clips.append({"st": round(t + (t0 - s), 3), "s": f(t0), "e": f(t1), "cx": f(cx), "cy": f(cy), "fw": f(fw), "lado": "esq" if L == 0 else "dir",
                              "sc": 177.78 if len(clips) % 2 == 0 else 215.0})
            for a, b, w in corrigir([list(w) for w in ws]):
                legs.append([round(t + a - s, 3), round(t + b - s, 3), w])
            t += e - s
        plano["cortes"].append({"nome": nome, "clips": clips, "palavras": legs, "fala_fim": round(t, 3)})
        print(nome, f"{t:.1f} s", len(clips), "planos;", " ".join(w for _, _, w in legs)[:300], flush=True)
    json.dump(plano, open(D + "plano_final.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
