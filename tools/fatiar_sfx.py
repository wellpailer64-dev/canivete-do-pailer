"""
fatiar_sfx.py — corta um áudio com vários efeitos sonoros (ex.: vídeo "pacote de 5 whoosh") em um arquivo por efeito,
com o mínimo de silêncio nas pontas, para o pack do Soundboard (Functions/soundboard.py).

Uso:
    py -3.13 tools/fatiar_sfx.py <áudio> <pasta_saida> --nomes "Whoosh longo 01,Whoosh longo 02,..." [--limiar -42]
    py -3.13 tools/fatiar_sfx.py <áudio> <pasta_saida> --ver            # só lista os trechos achados (e grava a folha)

Acha cada efeito pelo envelope (RMS em janelas de 5 ms): começa onde passa de `limiar` dB abaixo do pico do arquivo
e termina quando cai abaixo de `limiar - 12` dB e fica lá por `--gap` s. Pontas: 8 ms antes do início, 25 ms
depois do fim, com fade de 3 ms na entrada e 15 ms na saída (sem estalo). Saída: WAV 48 kHz 24 bits (mestre) +
folha.png (forma de onda de cada corte, para conferir).
"""
import argparse
import os
import subprocess
import sys

import numpy as np

SR = 48000


def _ffmpeg():
    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from Functions.midia import ffmpeg
        return ffmpeg()
    except Exception:
        return "ffmpeg"


def ler(arq):
    r = subprocess.run([_ffmpeg(), "-v", "error", "-i", arq, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2)


def trechos(x, limiar=-42.0, gap=0.12, minimo=0.06):
    mono = np.abs(x).max(axis=1)
    j = int(SR * 0.005)
    n = len(mono) // j
    rms = np.sqrt((mono[:n * j].reshape(n, j) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms / (rms.max() + 1e-12))
    ini_lim, fim_lim, gap_j = limiar, limiar - 12, int(gap / 0.005)
    out, i = [], 0
    while i < n:
        if db[i] < ini_lim:
            i += 1
            continue
        a = i
        # recua até o ataque de verdade (o começo do som, abaixo do limiar de fim)
        while a > 0 and db[a - 1] > fim_lim:
            a -= 1
        b, quietos = i, 0
        while b < n and quietos < gap_j:
            quietos = quietos + 1 if db[b] < fim_lim else 0
            b += 1
        b -= quietos
        if (b - a) * 0.005 >= minimo:
            out.append((a * j, b * j))
        i = b + gap_j
    return out


def cortar(x, a, b, fade_saida=0.015):
    a = max(0, a - int(SR * 0.008))
    b = min(len(x), b + int(SR * 0.025))
    y = x[a:b].copy()
    fi, fo = int(SR * 0.003), int(SR * fade_saida)
    y[:fi] *= np.linspace(0, 1, fi)[:, None]
    y[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return y, a / SR, b / SR


def gravar(y, arq):
    subprocess.run([_ffmpeg(), "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                    "-c:a", "pcm_s24le", arq], input=y.astype(np.float32).tobytes(), check=True)


def folha(cortes, arq):
    import cv2
    w, h = 900, 90
    img = np.full((h * len(cortes), w, 3), 18, np.uint8)
    for k, (nome, y) in enumerate(cortes):
        m = np.abs(y).max(axis=1)
        cols = np.array_split(m, w)
        for c, v in enumerate(cols):
            a = int(min(1, v.max() if len(v) else 0) * (h / 2 - 6))
            cv2.line(img, (c, k * h + h // 2 - a), (c, k * h + h // 2 + a), (90, 200, 255), 1)
        cv2.putText(img, f"{nome}  {len(y) / SR:.2f} s", (8, k * h + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 240, 240), 1)
    cv2.imwrite(arq, img)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("saida")
    ap.add_argument("--nomes", default="")
    ap.add_argument("--limiar", type=float, default=-42.0)
    ap.add_argument("--gap", type=float, default=0.12)
    ap.add_argument("--ver", action="store_true")
    ap.add_argument("--fade-saida", type=float, default=0.015, help="fade no fim (s): maior em sons que somem devagar (sinos)")
    ap.add_argument("--cat", default="", help="categoria do pack (pasta): whoosh, pop, impacto...")
    ap.add_argument("--fonte", default="", help="de onde veio (link do vídeo · canal)")
    ap.add_argument("--manifesto", default="", help="JSON do pack em montagem: acrescenta/atualiza um item por corte")
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    x = ler(a.audio)
    T = trechos(x, a.limiar, a.gap)
    nomes = [n.strip() for n in a.nomes.split(",") if n.strip()]
    os.makedirs(a.saida, exist_ok=True)
    cortes = []
    for k, (i0, i1) in enumerate(T):
        y, t0, t1 = cortar(x, i0, i1, a.fade_saida)
        nome = nomes[k] if k < len(nomes) else f"corte_{k + 1:02d}"
        print(f"{k + 1:2d}. {t0:7.3f} → {t1:7.3f}  ({t1 - t0:.2f} s)  {nome}")
        cortes.append((nome, y))
        if not a.ver:
            arq = (nome.lower().replace(" ", "_").replace("é", "e").replace("á", "a").replace("ç", "c").replace("ã", "a")
                   .replace("ó", "o").replace("í", "i").replace("ú", "u").replace("ê", "e").replace("ô", "o"))
            pasta = os.path.join(a.saida, a.cat) if a.cat else a.saida
            os.makedirs(pasta, exist_ok=True)
            gravar(y, os.path.join(pasta, arq + ".wav"))
            if a.manifesto:
                import json
                m = json.load(open(a.manifesto, encoding="utf-8")) if os.path.exists(a.manifesto) else {"sons": []}
                rel = (a.cat + "/" if a.cat else "") + arq + ".wav"
                m["sons"] = [o for o in m["sons"] if o["arq"] != rel] + [
                    {"arq": rel, "nome": nome, "cat": a.cat, "dur": round(len(y) / SR, 3), "fonte": a.fonte,
                     "origem": os.path.basename(a.audio), "t0": round(t0, 3), "t1": round(t1, 3)}]
                json.dump(m, open(a.manifesto, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    folha(cortes, os.path.join(a.saida, "folha.png"))
    if nomes and len(nomes) != len(T):
        print(f"AVISO: {len(T)} trechos achados, {len(nomes)} nomes")


if __name__ == "__main__":
    main()
