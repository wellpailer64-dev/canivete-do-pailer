"""respiros.py — acha as pausas e respiros de uma fala e devolve os trechos a cortar SEM perder a naturalidade.

Diferente do silencedetect (limiar fixo em dB): o limiar vem do próprio áudio (piso de ruído x nível da voz), a voz é
medida com histerese (borda mais sensível que o miolo, para não comer o fim de "s", "f", "t"), e de cada pausa fica
sempre uma sobra (cauda da palavra + ataque da próxima), então o ritmo continua humano. Pausa curta não se mexe.
Tudo em segundos da FONTE, relativos a `ini`.
"""
import subprocess

try:
    from Functions.video_cutter import ffmpeg_path, _creationflags
except Exception:   # pragma: no cover
    ffmpeg_path = lambda: "ffmpeg"
    _creationflags = lambda: 0

# preset: (pausa mínima que mexe, quanto de pausa sobra, sobra em pausa de frase longa)
PRESETS = {
    "suave":     dict(min_pausa=0.70, sobra=0.38, sobra_longa=0.55),
    "normal":    dict(min_pausa=0.45, sobra=0.24, sobra_longa=0.40),
    "agressivo": dict(min_pausa=0.30, sobra=0.15, sobra_longa=0.28),
}
SR = 16000
HOP = 0.010


def _energia_db(arq, ini, dur):
    import numpy as np
    cmd = [ffmpeg_path(), "-v", "error", "-ss", f"{max(0.0, ini):.3f}"] + (["-t", f"{dur:.3f}"] if dur else []) + \
          ["-i", arq, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "pipe:1"]
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=1800, creationflags=_creationflags())
    x = np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    if len(x) < SR // 2:
        return None
    # passa-altas leve (tira ronco/vento abaixo de ~80 Hz que enganaria o piso de ruído)
    x = x - np.concatenate([[0], x[:-1]]) * 0.985
    hop, jan = int(SR * HOP), int(SR * 0.030)
    n = (len(x) - jan) // hop
    if n < 20:
        return None
    q = x * x
    c = np.concatenate([[0], np.cumsum(q, dtype=np.float64)])
    idx = np.arange(n) * hop
    rms = np.sqrt((c[idx + jan] - c[idx]) / jan)
    return 20 * np.log10(np.maximum(rms, 1e-6))


def detectar(arq, ini=0.0, dur=None, preset="normal", min_pausa=None, sobra=None, sobra_longa=None):
    """→ {success, cortes: [[a, b], ...] (s da fonte, relativos a `ini`), removido, pausas, piso_db, voz_db}"""
    import numpy as np
    p = dict(PRESETS.get(preset, PRESETS["normal"]))
    for k, v in (("min_pausa", min_pausa), ("sobra", sobra), ("sobra_longa", sobra_longa)):
        if v is not None:
            p[k] = float(v)
    db = _energia_db(arq, float(ini), float(dur) if dur else None)
    if db is None:
        return {"success": False, "error": "áudio curto ou sem som"}
    suav = np.convolve(db, np.ones(3) / 3, mode="same")
    piso, voz = float(np.percentile(suav, 8)), float(np.percentile(suav, 92))
    faixa = voz - piso
    if faixa < 14:
        return {"success": True, "cortes": [], "removido": 0.0, "pausas": 0, "piso_db": round(piso, 1), "voz_db": round(voz, 1),
                "aviso": "áudio sem contraste entre voz e pausa (ruído/música contínua): nada cortado"}
    lim_voz, lim_borda = piso + 0.34 * faixa, piso + 0.16 * faixa
    forte = suav > lim_voz
    # fecha vales curtos dentro da palavra (consoantes surdas) e descarta estalos isolados
    n = len(forte)
    def corre(mask):
        d = np.diff(np.concatenate([[0], mask.astype(np.int8), [0]]))
        return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))
    runs = corre(forte)
    fund = []
    for a, b in runs:
        if fund and a - fund[-1][1] <= int(0.09 / HOP):
            fund[-1][1] = b
        else:
            fund.append([a, b])
    fund = [r for r in fund if (r[1] - r[0]) * HOP >= 0.07]
    if not fund:
        return {"success": True, "cortes": [], "removido": 0.0, "pausas": 0, "piso_db": round(piso, 1), "voz_db": round(voz, 1)}
    # histerese: a borda da voz anda para fora enquanto o áudio estiver acima do limiar sensível (até 180 ms)
    mx = int(0.18 / HOP)
    for r in fund:
        k = 0
        while r[0] > 0 and k < mx and suav[r[0] - 1] > lim_borda:
            r[0] -= 1; k += 1
        k = 0
        while r[1] < n and k < mx and suav[r[1]] > lim_borda:
            r[1] += 1; k += 1
    total = n * HOP
    cortes, pausas, removido = [], 0, 0.0
    pares = [(0.0, fund[0][0] * HOP, "ini")] + [(fund[i][1] * HOP, fund[i + 1][0] * HOP, "meio") for i in range(len(fund) - 1)] + [(fund[-1][1] * HOP, total, "fim")]
    for a, b, tipo in pares:
        L = b - a
        if L < p["min_pausa"] and tipo == "meio":
            continue
        if tipo != "meio" and L < 0.55:      # ponta do trecho: só mexe se sobrar silêncio de verdade (e rodar de novo não corta mais)
            continue
        pausas += 1
        if tipo == "ini":   # silêncio antes da 1ª palavra: deixa só um respiro curto
            ca, cb = a, b - 0.25
        elif tipo == "fim":
            ca, cb = a + 0.35, b
        else:
            fica = p["sobra_longa"] if L > 1.2 else p["sobra"]
            cauda = fica * 0.55            # mais cauda da palavra que ataque da próxima
            ca, cb = a + cauda, b - (fica - cauda)
        if cb - ca >= 0.10:
            # a emenda cai no ponto mais quieto perto das bordas (sem estalo nem pedaço de som)
            def quieto(t, folga=0.03):
                i0, i1 = max(0, int((t - folga) / HOP)), min(n, int((t + folga) / HOP) + 1)
                return (i0 + int(np.argmin(suav[i0:i1]))) * HOP if i1 > i0 else t
            ca, cb = quieto(ca), quieto(cb)
            if cb - ca >= 0.10:
                cortes.append([round(ca, 3), round(cb, 3)])
                removido += cb - ca
    return {"success": True, "cortes": cortes, "removido": round(removido, 2), "pausas": pausas,
            "piso_db": round(piso, 1), "voz_db": round(voz, 1), "duracao": round(total, 2)}
