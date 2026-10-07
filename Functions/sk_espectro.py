"""Sound Kanivete — espectrograma, reparo espectral e separação voz/instrumental.

espectro(): imagem (PNG) do trecho [t0, t1] do arquivo, frequência em escala log (40 Hz → sr/2, de baixo para cima),
lida em fluxo (só as janelas que viram coluna), cache em %LOCALAPPDATA%/CaniveteDoPailer/sk_esp.
reparar(): STFT só no trecho mexido; "preencher" troca a magnitude da área marcada (tempo × frequência) pela
interpolação entre o que vem antes e depois (tira tosse, bipe, celular); "atenuar" baixa a área. O resto do arquivo
é copiado sem mexer. Gera um arquivo novo ao lado (o clipe passa a usá-lo, como Limpar ruído).
separar(): Hybrid Demucs (torchaudio HDEMUCS_HIGH_MUSDB_PLUS, pesos MIT da Meta, ~335 MB baixados uma vez para
modelos_ia/demucs) em trechos de 10 s com 1 s de transição → <nome>_voz.wav e <nome>_instrumental.wav.
"""
import hashlib
import os
import struct
import subprocess

from Functions.midia import NO_WINDOW, app_dir, ffmpeg

FMIN = 40.0


def _cache(nome):
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "CaniveteDoPailer", nome)
    os.makedirs(d, exist_ok=True)
    return d


def _ler(arq, sr, canais, de=0.0, dur=None):
    """Popen do ffmpeg devolvendo float32 intercalado (lê em fluxo)."""
    cmd = [ffmpeg(), "-v", "error", "-nostdin"] + (["-ss", f"{de:.4f}"] if de else []) + (["-t", f"{dur:.4f}"] if dur else []) + \
          ["-i", arq, "-vn", "-ac", str(canais), "-ar", str(sr), "-f", "f32le", "-"]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=NO_WINDOW)


def _lut():
    import numpy as np
    pts = [(0, (12, 9, 8)), (0.35, (70, 20, 90)), (0.6, (200, 60, 40)), (0.8, (255, 140, 40)), (1, (255, 236, 170))]
    x = np.linspace(0, 1, 256)
    return np.stack([np.interp(x, [p[0] for p in pts], [p[1][k] for p in pts]) for k in range(3)], 1).astype(np.uint8)


def espectro(arq, t0, t1, cols=1200, rows=256, sr=44100):
    import numpy as np
    from PIL import Image
    t0, t1 = max(0.0, float(t0)), float(t1)
    cols, rows = int(max(16, min(4096, cols))), int(max(32, min(1024, rows)))
    st = os.stat(arq)
    chave = hashlib.sha1(f"{os.path.abspath(arq)}|{st.st_size}|{st.st_mtime}|{t0:.3f}|{t1:.3f}|{cols}|{rows}|{sr}".encode()).hexdigest()[:20]
    png = os.path.join(_cache("sk_esp"), chave + ".png")
    if os.path.isfile(png):
        return png
    nfft = 2048
    centros = (t0 + (np.arange(cols) + 0.5) * (t1 - t0) / cols - t0) * sr   # em amostras desde t0
    de = max(0.0, t0 - nfft / 2 / sr)
    desl = int(round((t0 - de) * sr))
    pr = _ler(arq, sr, 1, de, (t1 - t0) + nfft / sr)
    janela = np.hanning(nfft).astype(np.float32)
    quadros = np.zeros((cols, nfft), np.float32)
    buf, ini, k = np.zeros(0, np.float32), 0, 0   # buf cobre as amostras [ini, ini + len(buf))
    while k < cols:
        b = pr.stdout.read(sr * 4 * 2)
        fim_arq = not b
        if b:
            buf = np.concatenate([buf, np.frombuffer(b, np.float32)])
        while k < cols:
            c = int(centros[k]) + desl
            a, z = c - nfft // 2, c + nfft // 2
            if z > ini + len(buf) and not fim_arq:
                break
            seg = buf[max(0, a - ini): max(0, z - ini)]
            if a < ini + 0 and a < 0:
                seg = np.concatenate([np.zeros(-a, np.float32), seg])
            quadros[k, :len(seg[:nfft])] = seg[:nfft]
            k += 1
        corte = int(centros[k]) + desl - nfft // 2 - ini if k < cols else len(buf)
        if corte > 0:
            buf, ini = buf[corte:], ini + corte
        if fim_arq:
            break
    pr.kill()
    mag = np.abs(np.fft.rfft(quadros * janela, axis=1))   # cols × (nfft/2+1)
    db = 20 * np.log10(mag / (nfft / 4) + 1e-9)
    freqs = FMIN * (sr / 2 / FMIN) ** (np.arange(rows)[::-1] / (rows - 1))   # linha 0 = agudo
    bins = np.clip(np.round(freqs / (sr / nfft)).astype(int), 0, nfft // 2)
    img = db[:, bins].T   # rows × cols
    v = np.clip((img + 100) / 90, 0, 1)
    Image.fromarray(_lut()[(v * 255).astype(np.uint8)]).save(png)
    return png


# ─────────────────────────── reparo espectral ───────────────────────────
def _stft(x, nfft=2048, hop=512):
    import numpy as np
    w = np.hanning(nfft + 1)[:-1]
    n = 1 + max(0, (len(x) - nfft)) // hop + 1
    pad = np.zeros((n - 1) * hop + nfft)
    pad[:len(x)] = x
    idx = np.arange(nfft)[None, :] + hop * np.arange(n)[:, None]
    return np.fft.rfft(pad[idx] * w, axis=1), w


def _istft(S, w, n_saida, nfft=2048, hop=512):
    import numpy as np
    q = np.fft.irfft(S, n=nfft, axis=1) * w
    out = np.zeros((len(S) - 1) * hop + nfft)
    norma = np.zeros_like(out)
    for i in range(len(S)):
        out[i * hop:i * hop + nfft] += q[i]
        norma[i * hop:i * hop + nfft] += w ** 2
    return (out / np.maximum(norma, 1e-8))[:n_saida]


def _wav_float(caminho, sr, canais):
    f = open(caminho, "wb")
    f.write(b"RIFF" + b"\0" * 4 + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 3, canais, sr, sr * 4 * canais, 4 * canais, 32) + b"data" + b"\0" * 4)
    return f


def _wav_fechar(f):
    n = f.tell()
    f.seek(4); f.write(struct.pack("<I", n - 8))
    f.seek(40); f.write(struct.pack("<I", n - 44))
    f.close()


def reparar(arq, t0, t1, f0, f1, modo="preencher", ganho_db=-30.0, prog=lambda *a: None):
    """Área [t0, t1] s × [f0, f1] Hz (tempo do ARQUIVO) → arquivo novo ao lado (float 32)."""
    import numpy as np
    from Functions.sound_kanivete import _ffprobe_dur, _saida_ao_lado
    dur, can, sr = _ffprobe_dur(arq)
    can, sr = max(1, min(2, can or 2)), sr or 48000
    t0, t1 = max(0.0, float(t0)), min(dur, float(t1))
    f0, f1 = max(0.0, float(f0)), min(sr / 2, float(f1))
    if t1 - t0 < 0.01 or f1 - f0 < 5:
        raise RuntimeError("área pequena demais")
    marca = hashlib.sha1(f"{t0:.3f}|{t1:.3f}|{f0:.0f}|{f1:.0f}|{modo}|{ganho_db}".encode()).hexdigest()[:6]
    saida = _saida_ao_lado(arq, f"_rep{marca}")
    nfft, hop = 2048, 512
    a, b = max(0, int((t0 - 0.35) * sr)), int((t1 + 0.35) * sr)   # trecho processado (com folga para interpolar)
    pr = _ler(arq, sr, can)
    out = _wav_float(saida + ".tmp", sr, can)
    pos, trecho = 0, []
    prog(5, "Reparando")
    while True:
        bl = pr.stdout.read(sr * can * 4)
        if not bl:
            break
        x = np.frombuffer(bl, np.float32).reshape(-1, can)
        n = len(x)
        antes = x[:max(0, min(n, a - pos))]
        out.write(antes.tobytes())
        meio = x[len(antes):max(len(antes), min(n, b - pos))]
        if len(meio):
            trecho.append(meio)
        if pos + n >= b and trecho is not None and len(trecho):
            seg = np.concatenate(trecho).astype(np.float64)
            trecho = None
            ta = a / sr
            for ch in range(can):
                S, w = _stft(seg[:, ch], nfft, hop)
                tq = ta + (np.arange(len(S)) * hop + nfft / 2) / sr
                fq = np.arange(S.shape[1]) * sr / nfft
                fr = (tq >= t0) & (tq <= t1)
                bi = (fq >= f0) & (fq <= f1)
                if not fr.any() or not bi.any():
                    continue
                mag, fase = np.abs(S), np.angle(S)
                i0, i1 = np.argmax(fr), len(fr) - np.argmax(fr[::-1]) - 1
                if modo == "atenuar":
                    novo = mag[np.ix_(fr, bi)] * 10 ** (float(ganho_db) / 20)
                else:   # preencher: entre a média de 3 quadros antes e 3 depois, linear no tempo
                    ant = mag[max(0, i0 - 3):i0][:, bi].mean(0) if i0 > 0 else mag[i1 + 1:i1 + 4][:, bi].mean(0)
                    dep = mag[i1 + 1:i1 + 4][:, bi].mean(0) if i1 + 1 < len(mag) else ant
                    k = np.linspace(0, 1, i1 - i0 + 1)[:, None]
                    novo = np.minimum(mag[np.ix_(fr, bi)], ant[None, :] * (1 - k) + dep[None, :] * k)
                mag[np.ix_(fr, bi)] = novo
                seg[:, ch] = _istft(mag * np.exp(1j * fase), w, len(seg), nfft, hop)
            out.write(seg.astype(np.float32).tobytes())
        depois = x[len(antes) + len(meio):]
        out.write(depois.tobytes())
        pos += n
        if dur:
            prog(5 + 90 * min(1, pos / sr / dur), "Reparando")
    pr.wait()
    if trecho:   # o arquivo acabou dentro do trecho
        seg = np.concatenate(trecho)
        out.write(seg.tobytes())
    _wav_fechar(out)
    os.replace(saida + ".tmp", saida)
    return saida


# ─────────────────────────── separar voz × instrumental (Hybrid Demucs) ───────────────────────────
URL_DEMUCS = "https://download.pytorch.org/torchaudio/models/hdemucs_high_trained.pt"
_modelo = {"m": None}


def pasta_demucs():
    return os.path.join(app_dir(), "modelos_ia", "demucs")


def _carregar(prog):
    if _modelo["m"] is not None:
        return _modelo["m"]
    import torch
    from torchaudio.models import hdemucs_high
    from Functions.gerador_imagem import _baixar_arquivo
    pt = os.path.join(pasta_demucs(), "hdemucs_high_trained.pt")
    if not os.path.isfile(pt):
        os.makedirs(pasta_demucs(), exist_ok=True)
        _baixar_arquivo(URL_DEMUCS, pt, lambda f, t: prog(2 + 18 * f / max(1, t), f"Baixando o modelo de separação ({f // 1048576} de {t // 1048576} MB)"))
    m = hdemucs_high(sources=["drums", "bass", "other", "vocals"])
    m.load_state_dict(torch.load(pt, map_location="cpu", weights_only=True))
    m.eval()
    _modelo["m"] = m
    try:
        from Functions import memoria
        memoria.usado("demucs", lambda: _modelo.update(m=None))
    except Exception:
        pass
    return m


def separar(arq, prog=lambda *a: None):
    """→ (voz.wav, instrumental.wav) ao lado do original, 44,1 kHz estéreo."""
    import numpy as np
    import torch
    from Functions.sound_kanivete import _ffprobe_dur, _saida_ao_lado
    m = _carregar(prog)
    sr = 44100
    dur = _ffprobe_dur(arq)[0] or 1
    sv, si = _saida_ao_lado(arq, "_voz"), _saida_ao_lado(arq, "_instrumental")
    fv, fi = _wav_float(sv + ".tmp", sr, 2), _wav_float(si + ".tmp", sr, 2)
    L, ov = 10 * sr, sr   # trechos de 10 s, 1 s de transição
    H = L - ov
    pr = _ler(arq, sr, 2)
    buf = np.zeros((0, 2), np.float32)
    cauda, feito, fim = None, 0, False
    rampa = np.linspace(0, 1, ov, dtype=np.float32)[:, None]
    prog(20, "Separando voz e instrumental")
    while not fim or len(buf):
        while len(buf) < L and not fim:
            b = pr.stdout.read(sr * 2 * 4 * 2)
            if not b:
                fim = True
                break
            buf = np.concatenate([buf, np.frombuffer(b, np.float32).reshape(-1, 2)])
        if not len(buf):
            break
        x = buf[:L]
        ref = x.mean(1)
        mu, sd = float(ref.mean()), float(ref.std()) or 1.0
        with torch.inference_mode():
            y = m(torch.from_numpy(((x - mu) / sd).T.copy())[None])[0].numpy() * sd + mu   # (4, 2, n)
        voz = y[3].T
        inst = (y[0] + y[1] + y[2]).T
        if cauda is not None:
            k = min(ov, len(voz))
            voz[:k] = cauda[0][:k] * (1 - rampa[:k]) + voz[:k] * rampa[:k]
            inst[:k] = cauda[1][:k] * (1 - rampa[:k]) + inst[:k] * rampa[:k]
        ultimo = fim and len(buf) <= L
        n_esc = len(x) if ultimo else H
        fv.write(voz[:n_esc].astype(np.float32).tobytes())
        fi.write(inst[:n_esc].astype(np.float32).tobytes())
        cauda = (voz[H:], inst[H:])
        feito += n_esc
        buf = buf[len(x):] if ultimo else buf[H:]
        if ultimo:
            break
        prog(20 + 78 * min(1, feito / sr / dur), "Separando voz e instrumental")
    pr.kill()
    _wav_fechar(fv)
    _wav_fechar(fi)
    os.replace(sv + ".tmp", sv)
    os.replace(si + ".tmp", si)
    return sv, si
