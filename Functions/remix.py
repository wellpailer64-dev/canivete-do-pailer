"""
remix.py — Remix de música (o "Remix" do Premiere): esticar ou encurtar uma trilha para a duração pedida,
preservando o COMEÇO e o FINAL de verdade, com saltos entre compassos parecidos e emendas inaudíveis.

Como faz (2026-10-11):
1. Batidas e compassos: librosa.beat (tempo + grade de batidas por programação dinâmica). O compasso é escolhido entre
   3 e 4 batidas pela regularidade dos acentos; as emendas caem sempre em começo de compasso.
2. Retrato de cada compasso: cromas (harmonia: 12 notas), MFCC (timbre) e energia; dois compassos "parecidos" têm as
   três coisas perto. A semelhança de um salto A→B olha o compasso DEPOIS do ponto de saída e o do ponto de chegada,
   e também os anteriores (contexto), como o caminho de uma música repetida.
3. Encurtar: um salto para frente (pula um trecho do meio) com o tamanho mais perto do que falta tirar; se um salto
   só não chega, dois. Esticar: um laço para trás (repete um trecho) uma ou mais vezes; o laço mais parecido ganha.
   Nota = semelhança − castigo pelo erro de duração (em compassos). Saltos nos 8 s do começo e do fim são evitados.
4. Montagem: pedaços do áudio original (estéreo, 48 kHz) colados no começo dos compassos com crossfade de potência
   constante de 40 ms, alinhado no ataque. Duração final = a mais perto possível do pedido (o clipe na timeline apara o
   resto). Devolve também os pontos de emenda (para desenhar a "ondinha" na timeline, como no Premiere).
"""
import json
import os
import subprocess

import numpy as np

SR = 48000
SR_AN = 22050
HOP = 512
XFADE = 0.04
MARGEM = 8.0


def _ler(arq, sr, mono):
    from Functions.midia import ffmpeg, NO_WINDOW
    r = subprocess.run([ffmpeg(), "-v", "error", "-i", arq, "-vn", "-ac", "1" if mono else "2", "-ar", str(sr), "-f", "f32le", "-"],
                       capture_output=True, creationflags=NO_WINDOW)
    x = np.frombuffer(r.stdout, np.float32)
    return x.copy() if mono else x.reshape(-1, 2).copy()


def analisar(arq):
    """Batidas, compassos e o retrato de cada compasso. Fica em cache ao lado (arq + '.remix.json' na pasta de cache)."""
    import librosa
    y = _ler(arq, SR_AN, True)
    if len(y) < SR_AN * 5:
        raise ValueError("música curta demais para remixar")
    tempo, beats = librosa.beat.beat_track(y=y, sr=SR_AN, hop_length=HOP, units="frames", trim=False)
    tempo = float(np.atleast_1d(tempo)[0])
    bt = librosa.frames_to_time(beats, sr=SR_AN, hop_length=HOP)
    if len(bt) < 16:
        raise ValueError("não achei o ritmo desta música")
    onset = librosa.onset.onset_strength(y=y, sr=SR_AN, hop_length=HOP)
    # compasso de 3 ou 4: a batida 1 tem acento mais forte; escolhe métrica e fase pela soma dos acentos
    forca = onset[np.clip(beats, 0, len(onset) - 1)]
    melhor = (-1, 4, 0)
    for m in (4, 3):
        for f in range(m):
            s = forca[f::m].mean() - forca.mean()
            if s > melhor[0] + 1e-6 or (m == 4 and s > melhor[0] * 0.92):   # empate: 4/4 (o mais comum)
                melhor = (s, m, f)
    _, metro, fase = melhor
    barras = bt[fase::metro]
    # retrato por compasso
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    chroma = librosa.feature.chroma_stft(S=S ** 2, sr=SR_AN)
    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(librosa.feature.melspectrogram(S=S ** 2, sr=SR_AN)), n_mfcc=13)
    rms = librosa.feature.rms(S=S)[0]
    fr = librosa.time_to_frames(barras, sr=SR_AN, hop_length=HOP)
    feats = []
    for a, b in zip(fr[:-1], fr[1:]):
        b = max(b, a + 1)
        c = chroma[:, a:b].mean(1); c /= np.linalg.norm(c) + 1e-9
        m = mfcc[1:, a:b].mean(1); m /= np.linalg.norm(m) + 1e-9
        e = float(np.log(rms[a:b].mean() + 1e-6))
        feats.append(np.concatenate([c, m * 0.8, [e * 0.15]]))
    return {"tempo": tempo, "metro": int(metro), "barras": [float(t) for t in barras], "dur": len(y) / SR_AN,
            "feats": [list(map(float, f)) for f in feats]}


def _sim(F, i, j, ctx=2):
    """Semelhança de saltar do começo do compasso i para o começo do compasso j: os compassos i..i+ctx-1 contra
    j..j+ctx-1 (o que vem depois) e i-1 contra j-1 (o que vem antes), média dos cossenos."""
    n = len(F)
    pares = [(i + k, j + k) for k in range(ctx) if i + k < n and j + k < n] + [(i - 1, j - 1)] * (i > 0 and j > 0)
    if not pares:
        return -1.0
    s = [float(np.dot(F[a], F[b]) / (np.linalg.norm(F[a]) * np.linalg.norm(F[b]) + 1e-9)) for a, b in pares]
    # volume: o cosseno quase não vê diferença de energia (trecho calmo × refrão); castiga 0,025 por dB de diferença
    # entre os compassos de cada par (último valor do retrato = ln(rms) × 0,15 → dB = 8,686 × ln)
    ddb = np.mean([abs(F[a][-1] - F[b][-1]) / 0.15 * 8.686 for a, b in pares])
    return float(np.mean(s)) - 0.025 * float(ddb)


def planejar(an, alvo):
    """Caminho = lista de trechos [(t0, t1)] do original (em s) que somados dão ~alvo, começando no 0 e acabando no fim."""
    B, dur, F = an["barras"], an["dur"], np.array(an["feats"])
    n = len(F)
    if n < 6:
        raise ValueError("música curta demais para remixar")
    barra = float(np.median(np.diff(B)))
    ok = [k for k in range(1, n) if B[k] > MARGEM and B[k] < dur - MARGEM] or list(range(1, n))
    if abs(alvo - dur) < barra * 0.5:
        return [(0.0, dur)], dur, 1.0
    cands = []
    if alvo < dur:   # encurtar: pula do começo do compasso i para o j (j > i): tira B[j] − B[i]
        tirar = dur - alvo
        for i in ok:
            for j in ok:
                if j <= i:
                    continue
                d = B[j] - B[i]
                err = abs(d - tirar)
                if err > barra * 2.5:
                    continue
                s = _sim(F, i, j)
                cands.append((s - 0.35 * err / barra, [(0.0, B[i]), (B[j], dur)], s))
        if not cands:   # longe demais para um salto (encurtar muito): dois saltos
            for i in ok:
                for j in ok:
                    if j <= i + 1:
                        continue
                    s1 = _sim(F, i, j)
                    if s1 < 0.6:
                        continue
                    for k in ok:
                        if k <= j:
                            continue
                        for m in ok:
                            if m <= k:
                                continue
                            d = (B[j] - B[i]) + (B[m] - B[k])
                            err = abs(d - tirar)
                            if err > barra * 2.5:
                                continue
                            s = min(s1, _sim(F, k, m))
                            cands.append((s - 0.35 * err / barra, [(0.0, B[i]), (B[j], B[k]), (B[m], dur)], s))
    else:   # esticar: laço do compasso i (fim) de volta ao j (j < i), repetido r vezes
        somar = alvo - dur
        for i in ok:
            for j in ok:
                if j >= i - 1:
                    continue
                L = B[i] - B[j]
                if L < barra * 2:
                    continue
                r = max(1, int(round(somar / L)))
                err = abs(r * L - somar)
                if err > barra * 3:
                    continue
                s = _sim(F, i, j)
                caminho = [(0.0, B[i])] + [(B[j], B[i])] * (r - 1) + [(B[j], dur)]
                cands.append((s - 0.35 * err / barra - 0.02 * (r - 1), caminho, s))
    if not cands:
        raise ValueError("não achei um ponto bom para emendar nessa duração")
    nota, caminho, s = max(cands, key=lambda c: c[0])
    total = sum(b - a for a, b in caminho)
    return caminho, total, s


def montar(arq, caminho, saida):
    """Cola os trechos com crossfade de potência constante (40 ms) centrado em cada emenda; wav 48 kHz estéreo."""
    x = _ler(arq, SR, False)
    X = int(XFADE * SR)
    h = X // 2
    w = np.linspace(0, np.pi / 2, X, dtype=np.float32)
    ent, sai = np.sin(w)[:, None], np.cos(w)[:, None]
    y, emendas = None, []
    for k, (a, b) in enumerate(caminho):
        ia, ib = int(round(a * SR)), int(round(b * SR))
        # meia rampa antes/depois de cada emenda: pega um pouco a mais para o crossfade (centrado no ponto)
        ia2 = max(0, ia - (h if k > 0 else 0))
        ib2 = min(len(x), ib + (h if k < len(caminho) - 1 else 0))
        seg = x[ia2:ib2]
        if y is None:
            y = seg.copy()
            continue
        n = min(X, len(y), len(seg))
        emendas.append((len(y) - n / 2) / SR)
        y = np.concatenate([y[:-n], y[-n:] * sai[-n:] + seg[:n] * ent[:n], seg[n:]])
    from Functions.midia import rodar_ffmpeg
    raw = saida + ".f32"
    y.astype(np.float32).tofile(raw)
    ok, err = rodar_ffmpeg(["-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", raw, "-c:a", "pcm_s16le", saida])
    os.remove(raw)
    if not ok:
        raise RuntimeError("não gravou o remix: " + str(err)[-200:])
    return {"dur": len(y) / SR, "emendas": emendas}


def remixar(arq, alvo, saida, cache=None):
    """Música → remix com ~alvo segundos. Devolve {success, path, dur, emendas, sim, tempo}."""
    an = None
    if cache and os.path.isfile(cache):
        try:
            an = json.load(open(cache, encoding="utf-8"))
        except Exception:
            an = None
    if not an:
        an = analisar(arq)
        if cache:
            json.dump(an, open(cache, "w", encoding="utf-8"))
    caminho, total, s = planejar(an, float(alvo))
    r = montar(arq, caminho, saida)
    return {"success": True, "path": saida, "dur": r["dur"], "emendas": r["emendas"], "sim": round(s, 3),
            "tempo": round(an["tempo"], 1), "metro": an["metro"], "caminho": caminho}
