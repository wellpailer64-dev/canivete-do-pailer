"""Onde a música deve começar no vídeo: pula intro lenta/sem ritmo e acha o drop.

Mede, por compasso (4 batidas), a energia (RMS), a densidade de ataques e o brilho; classifica cada compasso
como calmo ou agitado; devolve `inicio` (batida forte onde o ritmo realmente entra, ou o drop se a intro for longa),
`drop` (maior salto de energia) e as seções. Uso: py -3.13 tools/agente/musica_ponto.py musica.mp3 [--min-cena 60]
"""
import os, sys, json, subprocess
import numpy as np

CAN = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, CAN)


def _pcm(path, sr=22050):
    from Functions.agente_midia import ffmpeg_path
    r = subprocess.run([ffmpeg_path(), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "pipe:1"],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=600)
    return np.frombuffer(r.stdout, dtype=np.float32), sr


def analisar(path, batidas, bpm):
    """Seções por compasso. `batidas` = lista de batidas (s) da música (agente_midia.batidas)."""
    x, sr = _pcm(path)
    comp = 4 * 60 / bpm
    b0 = batidas[0]
    # compassos alinhados na primeira batida (grade fixa)
    n = int((len(x) / sr - b0) // comp)
    hop, nf = 512, 2048
    jan = np.hanning(nf).astype(np.float32)
    quad = 1 + (len(x) - nf) // hop
    idx = np.arange(nf)[None, :] + hop * np.arange(quad)[:, None]
    esp = np.abs(np.fft.rfft(x[idx] * jan, axis=1))
    freq = np.fft.rfftfreq(nf, 1 / sr)
    fluxo = np.concatenate([[0], np.maximum(0, np.diff(np.log1p(esp * 10), axis=0)).sum(axis=1)])
    rms = np.sqrt((x[idx] ** 2).mean(axis=1))
    brilho = (esp * freq).sum(axis=1) / (esp.sum(axis=1) + 1e-9)
    fps = sr / hop
    linhas = []
    for i in range(n):
        a, b = int((b0 + i * comp) * fps), int((b0 + (i + 1) * comp) * fps)
        b = min(b, quad)
        if b <= a:
            break
        f = fluxo[a:b]
        linhas.append({"t": round(b0 + i * comp, 3), "rms": float(rms[a:b].mean()), "ataque": float(f.mean()),
                       "picos": int((f > f.mean() + f.std()).sum()), "brilho": float(brilho[a:b].mean())})
    rm = np.array([l["rms"] for l in linhas]); at = np.array([l["ataque"] for l in linhas])
    # energia combinada, normalizada pelo percentil 90 da música inteira
    e = 0.5 * rm / (np.percentile(rm, 90) + 1e-9) + 0.5 * at / (np.percentile(at, 90) + 1e-9)
    # suaviza 2 compassos (evita um estalo isolado virar "entrada")
    es = np.convolve(e, np.ones(2) / 2, mode="same")
    for l, v in zip(linhas, es):
        l["energia"] = round(float(v), 3)
        l["tipo"] = "agitado" if v >= 0.75 else ("medio" if v >= 0.45 else "calmo")
    return linhas, comp


def ponto(path, batidas, bpm, duracao_min=60.0):
    """-> {inicio, drop, motivo, secoes}. `inicio` = onde o vídeo deve começar na música."""
    linhas, comp = analisar(path, batidas, bpm)
    en = np.array([l["energia"] for l in linhas])
    dur_mus = linhas[-1]["t"] + comp
    # primeiro compasso em que o ritmo entra de verdade: energia >= 0,45 e mantida nos 3 compassos seguintes
    entrada = next((i for i in range(len(en) - 3) if en[i:i + 4].min() >= 0.45), 0)
    # drop = maior salto de energia (média dos 2 compassos seguintes menos a dos 2 anteriores), com ritmo sustentado
    salto = [(en[i:i + 2].mean() - en[max(0, i - 2):i].mean(), i) for i in range(2, len(en) - 3) if en[i:i + 4].min() >= 0.55]
    drop = max(salto)[1] if salto and max(salto)[0] > 0.25 else None
    # a duração do vídeo precisa caber a partir do ponto escolhido
    escolhido, motivo = entrada, "ritmo entra"
    if linhas[entrada]["t"] < 1.0:
        motivo = "a música já abre com ritmo"
    elif drop is not None and drop <= entrada + 8:
        # drop logo depois de uma intro curta: abrir no drop deixa o começo dinâmico
        escolhido, motivo = drop, "abre no drop"
    ini = linhas[escolhido]["t"]
    if duracao_min and dur_mus - ini < duracao_min:   # sem espaço: recua para a entrada, depois para o começo
        ini, motivo = linhas[entrada]["t"], "ritmo entra (sem espaço para o drop)"
        if dur_mus - ini < duracao_min:
            ini, motivo = 0.0, "música curta: começa do início"
    return {"inicio": round(ini, 3), "drop": round(linhas[drop]["t"], 3) if drop is not None else None,
            "entrada_ritmo": round(linhas[entrada]["t"], 3), "motivo": motivo, "bpm": bpm,
            "secoes": [{"t": l["t"], "tipo": l["tipo"], "energia": l["energia"]} for l in linhas]}


if __name__ == "__main__":
    from Functions.agente_midia import batidas as _bat
    p = sys.argv[1]
    mn = float(sys.argv[sys.argv.index("--min-cena") + 1]) if "--min-cena" in sys.argv else 60.0
    b = _bat(p)
    r = ponto(p, b["batidas"], b["bpm"], mn)
    print(json.dumps({k: v for k, v in r.items() if k != "secoes"}, ensure_ascii=False))
    print(" ".join(f"{s['t']:.0f}:{s['tipo'][0]}" for s in r["secoes"]))
