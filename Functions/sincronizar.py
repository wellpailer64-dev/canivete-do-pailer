"""Sincronizar clipes pelo áudio (como o "Sincronizar › Áudio" do Premiere): duas câmeras gravando a mesma cena.

O áudio dos dois trechos usados na timeline é comparado por correlação cruzada GCC-PHAT (só a fase de cada
frequência conta: microfones diferentes, volumes e timbres diferentes não atrapalham). O resultado é o atraso do
outro em relação à referência: o mesmo som aparece `atraso` segundos depois no trecho do outro clipe. No editor, o
outro clipe vai para st = st_ref - atraso (frontend/js/editor.js: veSincronizarClipes).
"""
import subprocess

from Functions.audio_cutter import ffmpeg_path, _creationflags

TAXA = 8000          # Hz: resolução de 0,125 ms, bem abaixo de um quadro (33 ms)
MAX_SEG = 15 * 60    # trecho mais longo comparado (memória da FFT)


def _pcm(path, s, dur):
    import numpy as np
    # do começo do arquivo, recortado por amostra: a mesma conta do som do editor (_mix_fonte_pronta: amostra 0 =
    # instante 0, mesmo com o áudio começando depois do vídeo — celular: 11 ms). Com -ss o ffmpeg conta pelo
    # carimbo de tempo e o resultado saía ~11 ms fora do que se ouve no editor.
    s = max(0.0, s)
    cmd = [ffmpeg_path(), "-v", "error", "-i", path, "-t", f"{s + dur + 1:.4f}", "-map", "0:a:0", "-vn", "-ac", "1",
           "-ar", str(TAXA), "-f", "s16le", "pipe:1"]
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=600,
                       creationflags=_creationflags())
    a = np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32)
    i = int(round(s * TAXA))
    return a[i:i + int(round(dur * TAXA))]


def atraso(ref_path, ref_s, ref_e, outro_path, outro_s, outro_e):
    """Atraso (s) do som do outro trecho em relação ao da referência + confiança (0..1).
    Retorna {success, atraso, confianca} ou {success: False, error}."""
    try:
        import numpy as np
    except Exception:
        return {"success": False, "error": "numpy não está disponível"}
    try:
        ref_s, ref_e, outro_s, outro_e = float(ref_s), float(ref_e), float(outro_s), float(outro_e)
        r = _pcm(ref_path, ref_s, min(MAX_SEG, ref_e - ref_s))
        o = _pcm(outro_path, outro_s, min(MAX_SEG, outro_e - outro_s))
    except Exception as e:
        return {"success": False, "error": f"Não foi possível ler o áudio: {e}"}
    if len(r) < TAXA or len(o) < TAXA:
        return {"success": False, "error": "Um dos clipes não tem som (ou é curto demais) para sincronizar"}
    if r.std() < 1 or o.std() < 1:
        return {"success": False, "error": "Um dos clipes está em silêncio: não há som para comparar"}
    # pré-ênfase: tira o grave (ronco, vento) que é diferente em cada microfone
    r = np.append(r[0], r[1:] - 0.97 * r[:-1])
    o = np.append(o[0], o[1:] - 0.97 * o[:-1])
    n = 1 << int(np.ceil(np.log2(len(r) + len(o))))
    X = np.fft.rfft(o, n) * np.conj(np.fft.rfft(r, n))
    X /= np.abs(X) + 1e-9
    cc = np.fft.irfft(X, n)
    # cc[k]: o[t] ≈ r[t - k]; índices acima de len(o) são atrasos negativos (o som veio antes no outro)
    lags = np.concatenate([np.arange(0, len(o)), np.arange(-len(r) + 1, 0)])
    vals = np.concatenate([cc[:len(o)], cc[n - len(r) + 1:]])
    i = int(np.argmax(vals))
    pico = float(vals[i])
    # confiança: o pico contra o maior pico fora de ±50 ms dele (sincronia boa: o pico se destaca muito)
    longe = np.abs(lags - lags[i]) > TAXA * 0.05
    segundo = float(vals[longe].max()) if longe.any() else 0.0
    ruido = float(np.std(vals)) or 1e-9
    confianca = max(0.0, min(1.0, (pico - segundo) / (pico + 1e-9))) if pico > 0 else 0.0
    # refino subamostra: parábola nos vizinhos do pico
    k = float(lags[i])
    if 0 < i < len(vals) - 1 and lags[i - 1] == lags[i] - 1 and lags[i + 1] == lags[i] + 1:
        a, b, c = vals[i - 1], vals[i], vals[i + 1]
        den = a - 2 * b + c
        if abs(den) > 1e-12:
            k += 0.5 * (a - c) / den
    # medido (2 celulares na mesma cena × vídeos de outras cenas): mesma cena 0,42–0,66 / destaque 14–58;
    # sem relação ≤ 0,15 / ≤ 7,2
    destaque = pico / ruido
    return {"success": True, "atraso": round(float(k) / TAXA, 5), "confianca": round(confianca, 3),
            "destaque": round(destaque, 1), "ok": confianca >= 0.25 and destaque >= 10}
