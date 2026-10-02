"""
AutoFrame — vídeos no ritmo da música a partir de uma pasta de fotos e vídeos (no espírito dos modelos do CapCut).

1) Música  → batidas, compassos, energia, seções e acentos
   Algoritmo de Ellis (2007), o mesmo do librosa: força de ataque (fluxo espectral do espectrograma mel em dB),
   andamento pela autocorrelação com peso log-gaussiano em torno de 120 BPM e batidas por programação dinâmica
   (casam com os ataques e mantêm o intervalo do andamento). O "1" de cada compasso é a fase de 4 batidas com mais
   energia grave (bumbo). Energia por compasso separa calmo / médio / alto; o drop é o maior salto de energia.
2) Mídias  → nota de 0 a 1 por foto e por trecho de vídeo: nitidez (variância do Laplaciano), exposição, cor
   (Hasler–Süsstrunk), rostos (Haar do OpenCV), movimento (diferença entre quadros); ponto de interesse para o
   enquadramento 9:16 (rosto ou saliência por resíduo espectral); hash perceptual contra repetidas.
3) Modelos → receita de ritmo (batidas por slot conforme a energia) + animação + transição.
4) Encaixe → algoritmo húngaro (scipy) numa matriz slot × candidato: mídia forte/com movimento nos slots de energia
   alta, a melhor na abertura, trechos de vídeo sem sobreposição; troca local contra repetidas lado a lado.
O JS (editor-autoframe.js) transforma o plano numa timeline normal do editor (clipes, quadros-chave, transições).
"""

import os
import json
import math
import collections
import time
import hashlib
import subprocess
import threading

import numpy as np

from Functions.video_cutter import ffmpeg_path, probe, _creationflags

SR = 22050
HOP = 512
NFFT = 2048
EXT_FOTO = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic", ".tif", ".tiff"}
EXT_VIDEO = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mts", ".m2ts", ".3gp", ".wmv"}
_cache_mem = {}
_lock = threading.Lock()


# ─────────────────────────── cache em disco ───────────────────────────
def _pasta_cache():
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
    p = os.path.join(base, "CaniveteDoPailer", "autoframe_cache")
    os.makedirs(p, exist_ok=True)
    return p


def _chave(path, tipo):
    try:
        st = os.stat(path)
        k = f"{os.path.abspath(path)}|{st.st_size}|{int(st.st_mtime)}|{tipo}|v5"   # v5: caixa dos rostos e hash fino
    except OSError:
        k = f"{path}|{tipo}"
    return hashlib.sha1(k.encode("utf-8", "replace")).hexdigest()


def _cache_ler(path, tipo):
    """Análise guardada do arquivo; sempre com o caminho escrito como agora (o mesmo arquivo pode chegar com barra normal ou invertida)."""
    k = _chave(path, tipo)
    d = _cache_mem.get(k)
    if d is None:
        f = os.path.join(_pasta_cache(), k + ".json")
        try:
            with open(f, "r", encoding="utf-8") as fh:
                d = json.load(fh)
            _cache_mem[k] = d
        except Exception:
            return None
    return dict(d, path=path)


def _cache_gravar(path, tipo, dados):
    k = _chave(path, tipo)
    _cache_mem[k] = dados
    try:
        with open(os.path.join(_pasta_cache(), k + ".json"), "w", encoding="utf-8") as fh:
            json.dump(dados, fh)
    except Exception:
        pass


# ─────────────────────────── música ───────────────────────────
def _decodificar_audio(path):
    r = subprocess.run([ffmpeg_path(), "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                       capture_output=True, creationflags=_creationflags())
    y = np.frombuffer(r.stdout, dtype=np.float32)
    if y.size < SR:
        raise ValueError("áudio curto ou ilegível")
    return y


def _mel_filtros(n_mel=64, fmin=30.0, fmax=8000.0):
    hz2mel = lambda f: 2595 * np.log10(1 + f / 700)
    mel2hz = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = mel2hz(np.linspace(hz2mel(fmin), hz2mel(fmax), n_mel + 2))
    bins = np.floor((NFFT + 1) * pts / SR).astype(int)
    fb = np.zeros((n_mel, NFFT // 2 + 1), dtype=np.float32)
    for m in range(1, n_mel + 1):
        a, c, b = bins[m - 1], bins[m], bins[m + 1]
        if c > a:
            fb[m - 1, a:c] = (np.arange(a, c) - a) / (c - a)
        if b > c:
            fb[m - 1, c:b] = (b - np.arange(c, b)) / (b - c)
    return fb, pts[1:-1]


def _espectro(y):
    n = 1 + (len(y) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    quadros = y[idx] * np.hanning(NFFT).astype(np.float32)
    return np.abs(np.fft.rfft(quadros, axis=1)) ** 2   # [n, NFFT/2+1]


def _ellis(env, bpm_centro=120.0, aperto=100.0, periodo_forcado=None):
    """Andamento (autocorrelação ponderada) + batidas (programação dinâmica). env: força de ataque por quadro."""
    fps = SR / HOP
    env = env - env.mean()
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    lags = np.arange(len(ac))
    with np.errstate(divide="ignore"):
        bpm_lag = 60.0 * fps / np.maximum(lags, 1)
    valido = (bpm_lag >= 50) & (bpm_lag <= 220)
    peso = np.exp(-0.5 * (np.log2(np.maximum(bpm_lag, 1) / bpm_centro) / 1.0) ** 2)
    score = np.where(valido, ac * peso, -np.inf)
    periodo = int(np.argmax(score))
    # refina o período no pico parabólico
    if 1 <= periodo < len(ac) - 1:
        a, b, c = ac[periodo - 1], ac[periodo], ac[periodo + 1]
        d = (a - c) / (2 * (a - 2 * b + c)) if (a - 2 * b + c) != 0 else 0
        periodo_f = periodo + float(np.clip(d, -0.5, 0.5))
    else:
        periodo_f = float(max(periodo, 1))
    # erro de oitava: bumbo e caixa alternados fazem o padrão de 2 batidas pesar mais que a batida. Abaixo de
    # 80 BPM, se há pulso forte no meio (meia batida), o andamento real é o dobro (140 lido como 70)
    dobrou = False
    if periodo_forcado is None and 60.0 * fps / periodo_f < 80:
        meio = int(round(periodo_f / 2))
        if meio > 1 and ac[meio] > 0.35 * ac[int(round(periodo_f))]:
            periodo_f /= 2
            dobrou = True
    if periodo_forcado:
        periodo_f = periodo_forcado
    bpm = 60.0 * fps / periodo_f
    # programação dinâmica (Ellis): C(t) = O(t) + max_τ [C(τ) − α (log((t−τ)/P))²]
    P = periodo_f
    local = np.convolve(env / (env.std() + 1e-9), np.exp(-0.5 * ((np.arange(-int(P), int(P) + 1)) / (P / 32)) ** 2), "same")
    n = len(local)
    cum = np.zeros(n)
    ant = -np.ones(n, dtype=int)
    janela = np.arange(-int(round(2 * P)), -int(round(P / 2)) + 1)
    custo = -aperto * np.log(-janela / P) ** 2
    for t in range(n):
        idx = t + janela
        ok = idx >= 0
        if ok.any():
            cand = cum[idx[ok]] + custo[ok]
            k = int(np.argmax(cand))
            cum[t] = local[t] + cand[k]
            ant[t] = idx[ok][k]
        else:
            cum[t] = local[t]
    # começa no maior acumulado perto do fim (um período) e volta
    fim = n - 1 - int(np.argmax(cum[::-1][:max(1, int(P))]))
    beats = []
    t = fim
    while t >= 0:
        beats.append(t)
        t = ant[t]
    beats = np.array(beats[::-1])
    # tira batidas nas pontas sem ataque (silêncio no começo/fim)
    forte = local[beats] > 0.25 * np.median(local[beats]) if len(beats) else beats
    if len(beats):
        i0 = int(np.argmax(forte)) if forte.any() else 0
        i1 = len(beats) - int(np.argmax(forte[::-1])) if forte.any() else len(beats)
        beats = beats[i0:i1]
    # desempate do dobro: se as batidas alternadas ficam bem mais fracas (chimbal no contratempo), o andamento
    # real era a metade (balada a 70 com colcheias não vira 140)
    if dobrou and len(beats) >= 8:
        par, impar = local[beats[0::2]].mean(), local[beats[1::2]].mean()
        if min(par, impar) < 0.45 * max(par, impar):
            return _ellis(env + env.mean(), bpm_centro, aperto, periodo_forcado=periodo_f * 2)
    return bpm, beats


def analisar_musica(path, on_pct=None):
    d = _cache_ler(path, "musica")
    if d:
        return d
    prog = on_pct or (lambda p: None)
    prog(5)
    y = _decodificar_audio(path)
    dur = len(y) / SR
    prog(20)
    S = _espectro(y)
    prog(45)
    fb, freqs = _mel_filtros()
    mel = S @ fb.T                                   # [n, 64]
    db = 10 * np.log10(np.maximum(mel, 1e-10))
    db = np.maximum(db, db.max() - 80)
    fluxo = np.maximum(0, np.diff(db, axis=0))
    env = np.concatenate([[0], fluxo.mean(axis=1)])
    grave = np.concatenate([[0], fluxo[:, freqs < 150].mean(axis=1)])   # bumbo
    # tira a tendência lenta (passa-alta) e normaliza
    k = 16
    tend = np.convolve(env, np.ones(k) / k, "same")
    env = np.maximum(0, env - tend)
    prog(60)
    bpm, beats = _ellis(env)
    prog(85)
    fps = SR / HOP
    t_beats = beats / fps
    # compassos: fase de 4 batidas com mais grave + ataque
    fase, melhor = 0, -1
    for f in range(4):
        sel = beats[f::4]
        v = float(grave[sel].sum() + 0.5 * env[sel].sum()) if len(sel) else 0
        if v > melhor:
            fase, melhor = f, v
    downbeats = t_beats[fase::4]
    # energia por batida (RMS no espectro) e brilho (centroide)
    pot = S.sum(axis=1)
    rms = np.sqrt(pot / S.shape[1])
    energia = []
    for i in range(len(beats)):
        a = beats[i]
        b = beats[i + 1] if i + 1 < len(beats) else min(len(rms), a + int(round(fps * 60 / max(bpm, 1))))
        energia.append(float(rms[a:max(a + 1, b)].mean()))
    energia = np.array(energia) if energia else np.zeros(1)
    lo, hi = np.percentile(energia, 10), np.percentile(energia, 95)
    e_norm = np.clip((energia - lo) / max(hi - lo, 1e-9), 0, 1)
    # seções por compasso (a partir do "1"): média de 2 compassos → nível 0/1/2 pela faixa dinâmica da música.
    # Música com energia parelha fica toda "média" (sem seções inventadas).
    e_c = e_norm[fase:]
    por_compasso = np.array([float(e_c[i:i + 4].mean()) for i in range(0, len(e_c), 4)] or [0.5])
    suave = np.convolve(por_compasso, np.ones(2) / 2, "same") if len(por_compasso) > 2 else por_compasso
    faixa = float(np.percentile(suave, 95) - np.percentile(suave, 5)) if len(suave) > 2 else 0
    if faixa < 0.25:
        nivel = [1] * len(suave)
    else:
        base = float(np.percentile(suave, 5))
        nivel = [0 if v < base + 0.4 * faixa else 1 if v < base + 0.72 * faixa else 2 for v in suave]
    for i in range(1, len(nivel) - 1):   # sem seção de um compasso só
        if nivel[i - 1] == nivel[i + 1] != nivel[i]:
            nivel[i] = nivel[i - 1]
    secoes = []
    for i, nv in enumerate(nivel):
        ini = float(t_beats[min(fase + i * 4, len(t_beats) - 1)])
        if secoes and secoes[-1]["nivel"] == nv:
            continue
        secoes.append({"t": ini, "nivel": nv})
    # drop: o compasso onde a energia dos 2 compassos seguintes mais supera a dos 2 anteriores (sem média móvel,
    # que atrasava um compasso); só vale se for um salto grande e levar ao nível alto
    drop = None
    pc = por_compasso
    if len(pc) >= 6 and faixa >= 0.25:
        salto = [pc[i:i + 2].mean() - pc[max(0, i - 2):i].mean() for i in range(2, len(pc) - 1)]
        i = int(np.argmax(salto)) + 2
        if salto[i - 2] > 0.3 and pc[i:i + 2].mean() >= float(np.percentile(pc, 60)):
            # afina para a batida exata do salto (±4 batidas em volta do compasso)
            k0 = fase + i * 4
            cands = range(max(4, k0 - 4), min(len(e_norm) - 4, k0 + 5))
            k = max(cands, key=lambda k: e_norm[k:k + 4].mean() - e_norm[k - 4:k].mean()) if len(cands) else k0
            drop = float(t_beats[min(k, len(t_beats) - 1)])
    # estrutura (refrão): cada compasso vira um vetor de cromagrama (as 12 notas) + timbre (mel); a matriz de
    # autossimilaridade entre compassos mostra o que se repete. Refrão = trecho que se repete E tem energia alta.
    compassos_t, refrao = [], None
    try:
        nb = NFFT // 2 + 1
        f_bin = np.arange(nb) * SR / NFFT
        ok = (f_bin >= 55) & (f_bin <= 4000)
        pc = (np.round(12 * np.log2(f_bin[ok] / 440.0)) + 9).astype(int) % 12
        M12 = np.zeros((ok.sum(), 12), dtype=np.float32)
        M12[np.arange(ok.sum()), pc] = 1
        croma = S[:, ok] @ M12
        croma /= croma.sum(axis=1, keepdims=True) + 1e-9
        timbre = db[:, ::4]
        idx_b = beats[fase::4]
        feats = []
        for k in range(len(idx_b)):
            a = idx_b[k]
            b = idx_b[k + 1] if k + 1 < len(idx_b) else min(len(croma), a + (a - idx_b[k - 1] if k else 32))
            if b <= a:
                break
            feats.append(np.concatenate([croma[a:b].mean(axis=0), timbre[min(a, len(timbre) - 1):min(b, len(timbre))].mean(axis=0)]))
            compassos_t.append(float(t_beats[fase + 4 * k]))
        if len(feats) >= 12:
            F = np.array(feats)
            F = (F - F.mean(axis=0)) / (F.std(axis=0) + 1e-6)
            F[:, :12] *= 1.5   # harmonia pesa mais que o timbre para "é a mesma parte"
            F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-9
            SSM = F @ F.T
            nC = len(F)
            L = 4   # compara sequências de 4 compassos (uma frase curta)
            rep_ = np.zeros(nC)
            for i in range(nC - L + 1):
                melhor = 0.0
                for j in range(nC - L + 1):
                    if abs(i - j) >= L:
                        melhor = max(melhor, float(np.mean([SSM[i + k, j + k] for k in range(L)])))
                rep_[i] = melhor
            en = np.array(por_compasso[:nC]) if len(por_compasso) >= nC else np.pad(por_compasso, (0, nC - len(por_compasso)))
            rn = (rep_ - rep_.min()) / max(1e-9, rep_.max() - rep_.min())
            score = 0.55 * rn + 0.45 * en
            # melhor frase de 8 compassos começando numa frase (múltiplo de 4 compassos) ou numa troca de seção
            inicios_secao = {int(round((sc["t"] - compassos_t[0]) / max(1e-6, compassos_t[1] - compassos_t[0]))) for sc in secoes}
            cand = [i for i in range(nC - 4) if i % 4 == 0 or i in inicios_secao]
            if cand:
                i0 = max(cand, key=lambda i: float(score[i:i + 8].mean()))
                # onde mais essa parte aparece (as outras vezes do refrão)
                oc = [i0]
                for j in cand:
                    if all(abs(j - o) >= 8 for o in oc):
                        sim = float(np.mean([SSM[i0 + k, j + k] for k in range(min(8, nC - max(i0, j)))]))
                        if sim > 0.55 and en[j:j + 4].mean() > 0.5 * en[i0:i0 + 4].mean():
                            oc.append(j)
                fim = compassos_t[min(nC - 1, i0 + 8)] if i0 + 8 < nC else dur
                refrao = {"t": compassos_t[i0], "fim": round(float(fim), 3),
                          "ocorrencias": sorted(round(compassos_t[o], 3) for o in oc)}
    except Exception as e:
        print("[autoframe] estrutura:", e)
    # acentos: ataques muito fortes perto de uma batida
    lim = np.percentile(env, 97)
    picos = [i for i in range(1, len(env) - 1) if env[i] > lim and env[i] >= env[i - 1] and env[i] >= env[i + 1]]
    acentos = sorted({float(round(i / fps, 3)) for i in picos})[:400]
    d = {
        "path": path, "dur": round(dur, 3), "bpm": round(float(bpm), 2),
        "beats": [round(float(t), 4) for t in t_beats],
        "downbeats": [round(float(t), 4) for t in downbeats],
        "energia": [round(float(v), 3) for v in e_norm],
        "secoes": secoes, "drop": drop, "acentos": acentos,
        "compassos": [round(t, 4) for t in compassos_t], "energia_compasso": [round(float(v), 3) for v in por_compasso],
        "refrao": refrao,
    }
    _cache_gravar(path, "musica", d)
    prog(100)
    return d


# ─────────────────────────── mídias ───────────────────────────
_haar = None


def _rostos(gray):
    global _haar
    import cv2
    if _haar is None:
        try:
            _haar = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
            if _haar.empty():
                _haar = False
        except Exception:
            _haar = False
    if not _haar:
        return []
    m = min(gray.shape[:2])
    r = _haar.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=6, minSize=(max(20, m // 14), max(20, m // 14)))
    return [tuple(int(v) for v in f) for f in (r if len(r) else [])]


def _saliencia(gray):
    """Ponto de interesse (0..1) por resíduo espectral (Hou & Zhang, 2007)."""
    import cv2
    g = cv2.resize(gray, (64, 64)).astype(np.float32)
    F = np.fft.fft2(g)
    amp = np.log(np.abs(F) + 1e-6)
    fase = np.angle(F)
    res = amp - cv2.blur(amp, (3, 3))
    s = np.abs(np.fft.ifft2(np.exp(res + 1j * fase))) ** 2
    s = cv2.GaussianBlur(s, (9, 9), 2.5)
    lim = np.percentile(s, 90)
    ys, xs = np.nonzero(s >= lim)
    if not len(xs):
        return 0.5, 0.5
    w = s[ys, xs]
    return float((xs * w).sum() / w.sum() / 63), float((ys * w).sum() / w.sum() / 63)


def _notas(img_bgr):
    """nitidez, exposição, cor, rostos, foco (x, y) e hash de uma imagem pequena (BGR)."""
    import cv2
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    lap = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    nit = float(np.clip(math.log10(lap + 1) / 3.0, 0, 1))           # var 1000 → 1
    media = float(gray.mean()) / 255
    estouro = float(((gray > 250) | (gray < 5)).mean())
    expo = float(np.clip(1 - abs(media - 0.5) * 1.3 - estouro * 1.5, 0, 1))
    b, g, r = [c.astype(np.float32) for c in cv2.split(img_bgr)]
    rg, yb = r - g, 0.5 * (r + g) - b
    cor = float(np.clip((math.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * math.sqrt(rg.mean() ** 2 + yb.mean() ** 2)) / 100, 0, 1))
    faces = _rostos(gray)
    h, w = gray.shape[:2]
    if faces:
        x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        foco = ((x + fw / 2) / w, (y + fh * 0.45) / h)
        area_rosto = sum(f[2] * f[3] for f in faces) / (w * h)
    else:
        foco = _saliencia(gray)
        area_rosto = 0.0
    peq = cv2.resize(gray, (9, 8))
    dh = sum(1 << i for i, v in enumerate((peq[:, 1:] > peq[:, :-1]).flatten()) if v)
    # caixa que não pode ser cortada no enquadramento: todas as cabeças (com o topo do cabelo) até o peito
    caixa = None
    if faces:
        x0 = min(x - fw * 0.45 for x, y, fw, fh in faces)
        x1 = max(x + fw * 1.45 for x, y, fw, fh in faces)
        y0 = min(y - fh * 0.6 for x, y, fw, fh in faces)
        y1 = max(y + fh * 2.2 for x, y, fw, fh in faces)
        caixa = [round(max(0.0, x0 / w), 3), round(max(0.0, y0 / h), 3), round(min(1.0, x1 / w), 3), round(min(1.0, y1 / h), 3)]
    # repetidas: dHash 16x16 (256 bits) + histograma de cor (o de 64 bits confunde fotos diferentes no mesmo cenário)
    p16 = cv2.resize(gray, (17, 16), interpolation=cv2.INTER_AREA)
    h256 = np.packbits((p16[:, 1:] > p16[:, :-1]).flatten()).tobytes().hex()
    hsv = cv2.cvtColor(cv2.resize(img_bgr, (64, 64), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [12, 6], [0, 180, 0, 256]).flatten()
    hist = hist / max(1.0, float(hist.sum()))
    return {"nit": round(nit, 3), "expo": round(expo, 3), "cor": round(cor, 3), "rostos": len(faces),
            "area_rosto": round(area_rosto, 4), "fx": round(foco[0], 3), "fy": round(foco[1], 3), "hash": str(dh),
            "caixa": caixa, "h256": h256, "hist": [round(float(v), 4) for v in hist]}


def _ler_imagem(path, lado=640):
    import cv2
    from PIL import Image, ImageOps
    try:
        im = Image.open(path)
        data = None
        try:
            ex = im.getexif()
            data = ex.get(36867) or ex.get(306)
        except Exception:
            pass
        im = ImageOps.exif_transpose(im).convert("RGB")
        W, H = im.size
        im.thumbnail((lado, lado))
        return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR), W, H, data
    except Exception:
        return None, 0, 0, None


def _miniatura(path, tipo, img):
    """JPG pequeno (240 px) para a grade do painel."""
    import cv2
    f = os.path.join(_pasta_cache(), _chave(path, tipo) + ".jpg")
    try:
        h, w = img.shape[:2]
        k = 240 / max(h, w)
        cv2.imencode(".jpg", cv2.resize(img, (max(1, int(w * k)), max(1, int(h * k)))), [cv2.IMWRITE_JPEG_QUALITY, 82])[1].tofile(f)
        return f
    except Exception:
        return None


def analisar_foto(path):
    d = _cache_ler(path, "foto")
    if d and d.get("thumb") and os.path.isfile(d["thumb"]):
        return d
    img, W, H, data = _ler_imagem(path)
    if img is None:
        return None
    n = _notas(img)
    nota = 0.45 * n["nit"] + 0.3 * n["expo"] + 0.15 * n["cor"] + 0.1 * min(1, n["rostos"])
    d = {"path": path, "tipo": "foto", "w": W, "h": H, "data": data, **n, "nota": round(nota, 3),
         "thumb": _miniatura(path, "foto", img)}
    _cache_gravar(path, "foto", d)
    return d


def analisar_video(path, on_pct=None):
    """Amostra a 2 quadros/s em 320 px: nitidez, movimento, exposição, cor e rostos a cada instante."""
    d = _cache_ler(path, "video")
    if d and d.get("thumb") and os.path.isfile(d["thumb"]):
        if d.get("dims") != 2:
            # análise antiga trocava largura/altura de vídeo girado: conserta só as dimensões (sem reanalisar)
            info = probe(path)
            if info.get("width") and info.get("height"):
                d["w"], d["h"] = int(info["width"]), int(info["height"])
            d["dims"] = 2
            _cache_gravar(path, "video", {k: v for k, v in d.items()})
        return d
    import cv2
    info = probe(path)
    dur = float(info.get("duration") or 0)
    W, H = int(info.get("width") or 0), int(info.get("height") or 0)
    if dur < 0.5 or not info.get("has_video"):
        return None
    fps_a = 2.0 if dur <= 600 else max(0.25, 1200 / dur)
    w = 320
    h = max(2, int(round(H * w / max(W, 1) / 2)) * 2) if W and H else 180
    cmd = [ffmpeg_path(), "-v", "error", "-i", path, "-vf", f"fps={fps_a},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=_creationflags())
    tam = w * h * 3
    amostras, ant, i = [], None, 0
    melhor, melhor_img = -1.0, None
    while True:
        buf = proc.stdout.read(tam)
        if len(buf) < tam:
            break
        img = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mov = float(np.abs(gray.astype(np.int16) - ant).mean()) / 40 if ant is not None else 0.0
        ant = gray.astype(np.int16)
        n = _notas(img)
        amostras.append({"t": round(i / fps_a, 2), "mov": round(min(1.0, mov), 3), **{k: n[k] for k in ("nit", "expo", "cor", "rostos", "fx", "fy", "hash")}})
        nt = _nota_amostra(amostras[-1])
        if nt > melhor:
            melhor, melhor_img = nt, img.copy()
        i += 1
        if on_pct and dur:
            on_pct(min(99, int(i / fps_a / dur * 100)))
    proc.wait()
    if not amostras:
        return None
    # probe() já devolve largura/altura com a rotação aplicada (vídeo em pé do celular/DJI = retrato)
    d = {"path": path, "tipo": "video", "dur": round(dur, 3), "w": W, "h": H, "dims": 2,
         "fps": info.get("fps"), "tem_audio": bool(info.get("has_audio")), "amostras": amostras,
         "nota": round(float(np.mean([_nota_amostra(a) for a in amostras])), 3),
         "thumb": _miniatura(path, "video", melhor_img) if melhor_img is not None else None}
    _cache_gravar(path, "video", d)
    return d


def _nota_amostra(a):
    # tremido (movimento muito alto com nitidez baixa) conta contra
    tremido = max(0.0, a["mov"] - 0.6) * (1 - a["nit"])
    return 0.4 * a["nit"] + 0.25 * a["expo"] + 0.15 * a["cor"] + 0.1 * min(1, a["rostos"]) + 0.1 * min(1, a["mov"] * 2) - tremido


def listar(itens):
    """[{path, pasta}] → arquivos de foto/vídeo (pastas com subpastas)."""
    out = []
    for it in itens or []:
        p = it.get("path") if isinstance(it, dict) else str(it)
        if not p:
            continue
        if os.path.isdir(p):
            for raiz, _, fs in os.walk(p):
                for f in sorted(fs):
                    if os.path.splitext(f)[1].lower() in EXT_FOTO | EXT_VIDEO:
                        out.append(os.path.join(raiz, f))
        elif os.path.splitext(p)[1].lower() in EXT_FOTO | EXT_VIDEO:
            out.append(p)
    vistos, uniq = set(), []
    for p in out:
        k = os.path.normcase(os.path.abspath(p))
        if k not in vistos:
            vistos.add(k)
            uniq.append(p)
    return uniq


def analisar_midia(path, on_pct=None):
    ext = os.path.splitext(path)[1].lower()
    if ext in EXT_FOTO:
        return analisar_foto(path)
    if ext in EXT_VIDEO:
        return analisar_video(path, on_pct)
    return None


# ─────────────────────────── modelos ───────────────────────────
# ritmo: batidas por slot em cada nível de energia (0 calmo, 1 médio, 2 alto); anim: animação dos slots;
# trans: transição entre slots; ideal: fração de vídeos; bpm: faixa ideal; drop: segura cortes longos até o drop
# Transições (o que editores usam de verdade em vídeo com batida):
#   corte   – seco na batida (o principal)          flash  – clarão branco de impacto no drop / acento no "1"
#   chicote – whip pan: o meio da transição NA batida  zoom  – puxar (zoom) nas viradas de seção
#   dissolve – memórias / cenas longas                  preto  – mergulho no preto entre seções do cinemático
MODELOS = [
    {"id": "batida", "nome": "Batida", "desc": "Corte em toda batida, zoom-soco no tempo. Energia máxima.",
     "ritmo": [2, 1, 1], "anim": "soco", "trans": "corte", "ideal": 0.7, "bpm": [100, 180], "cor": "vivo"},
    {"id": "memorias", "nome": "Memórias", "desc": "Fotos com zoom lento (Ken Burns) e dissolução. Calmo e emotivo.",
     "ritmo": [8, 8, 4], "anim": "kenburns", "trans": "dissolve", "ideal": 0.15, "bpm": [60, 125], "cor": "suave"},
    {"id": "drop", "nome": "Drop", "desc": "Cortes longos até o drop; depois, um corte por batida.",
     "ritmo": [8, 4, 1], "anim": "soco", "trans": "corte", "ideal": 0.55, "bpm": [90, 180], "drop": True, "cor": "vivo"},
    {"id": "viagem", "nome": "Viagem", "desc": "Um compasso por cena, pan suave e empurrar na virada.",
     "ritmo": [4, 4, 2], "anim": "pan", "trans": "push", "ideal": 0.6, "bpm": [80, 150], "cor": "quente"},
    {"id": "cinematico", "nome": "Cinemático", "desc": "Cenas longas, zoom lento, barras de cinema e cor de filme.",
     "ritmo": [8, 8, 8], "anim": "kenburns", "trans": "dissolve", "ideal": 0.85, "bpm": [50, 130], "barras": True, "cor": "filme"},
    {"id": "dinamico", "nome": "Dinâmico", "desc": "Ritmo de reel: 1 a 2 batidas por cena, movimento variado e transição na virada do compasso.",
     "ritmo": [4, 2, 1], "anim": "misto", "trans": "misto", "ideal": 0.4, "bpm": [60, 180], "cor": "vivo"},
]


def melhor_inicio(musica, modo="inicio", dur_alvo=None, manual=None):
    """Onde o vídeo começa na música (sempre num "1" de compasso):
    inicio  = primeiro compasso · refrao = refrão detectado · agitada = janela de maior energia com a duração pedida
    manual  = o compasso mais perto do instante escolhido."""
    downs = musica.get("downbeats") or musica["beats"][:1]
    if not downs:
        return 0.0
    perto = lambda t: min(downs, key=lambda d: abs(d - t))
    if modo == "manual" and manual is not None:
        return perto(float(manual))
    if modo == "refrao" and musica.get("refrao"):
        return perto(musica["refrao"]["t"])
    if modo in ("agitada", "refrao"):
        bars, en = musica.get("compassos") or downs, musica.get("energia_compasso") or []
        if not en:
            return downs[0]
        per_bar = (bars[1] - bars[0]) if len(bars) > 1 else 2.0
        n = max(4, int(round((dur_alvo or 30) / per_bar)))
        drop = musica.get("drop")
        melhor, t_melhor = -1.0, bars[0]
        for i in range(0, max(1, len(en) - n + 1)):
            v = float(np.mean(en[i:i + n]))
            if i % 4 == 0:
                v += 0.04   # começa numa frase
            if drop is not None and bars[i] <= drop <= bars[i] + 4 * per_bar:
                v += 0.08   # o drop logo no começo prende quem assiste
            if v > melhor + 1e-6:
                melhor, t_melhor = v, bars[i]
        return t_melhor
    return downs[0]


def _slots(musica, modelo, dur_alvo=None, inicio=None):
    """Grade de slots sobre as batidas. Cada slot: {a, b, nivel, acento}."""
    beats = musica["beats"]
    if len(beats) < 4:
        return []
    drop_t = musica.get("drop")
    per = 60.0 / max(musica["bpm"], 1)

    def nivel_em(t):
        nv = max([s["nivel"] for s in musica["secoes"] if s["t"] <= t + 1e-6] or [0])
        if drop_t is not None and drop_t - 0.05 <= t < drop_t + 16 * per:
            nv = max(nv, 2)   # os 4 compassos depois do drop são energia alta
        return nv
    downs = set(round(t, 3) for t in musica["downbeats"])
    fim_musica = musica["dur"]
    alvo = fim_musica
    # começa no "1" de compasso pedido (sem pedido: o primeiro; a introdução em silêncio fica de fora)
    ini_t = inicio if inicio is not None else -1
    i = next((k for k, t in enumerate(beats) if round(t, 3) in downs and t >= ini_t - 0.05), 0)
    # fim: o "1" de compasso que fecha uma frase (múltiplo de 4 compassos) mais perto da duração pedida
    if dur_alvo:
        lista_d = [t for t in musica["downbeats"] if t >= beats[i] - 0.01]
        if lista_d:
            per_bar = (lista_d[1] - lista_d[0]) if len(lista_d) > 1 else 2.0
            alvo_bruto = beats[i] + dur_alvo
            frases = [t for k, t in enumerate(lista_d) if k % 4 == 0 and k > 0] or lista_d
            fim_frase = min(frases, key=lambda t: abs(t - alvo_bruto))
            alvo = fim_frase if abs(fim_frase - alvo_bruto) <= 2 * per_bar else min(lista_d, key=lambda t: abs(t - alvo_bruto))
            alvo = min(alvo, fim_musica)
    drop = musica.get("drop") if modelo.get("drop") else None
    slots = []
    while i < len(beats) - 1:
        t = beats[i]
        nv = nivel_em(t)
        passo = modelo["ritmo"][nv]
        if drop is not None and t < drop - 0.05:
            passo = max(passo, 4)   # antes do drop, segura
            j = i + passo
            # não passa por cima do drop: corta exatamente nele
            k_drop = next((k for k in range(i + 1, min(len(beats), j + 1)) if beats[k] >= drop - 0.05), None)
            if k_drop is not None:
                j = k_drop
        else:
            j = i + passo
        j = min(j, len(beats) - 1)
        if j <= i:
            break
        b = beats[j]
        if b > alvo + 0.05:
            break
        acento = any(t - 0.03 <= a <= t + 0.08 for a in musica.get("acentos", []))
        slots.append({"a": round(t, 4), "b": round(b, 4), "nivel": nv, "acento": acento})
        i = j
    # sem slot minúsculo no fim (menos de 1 batida): junta no anterior
    if len(slots) > 1 and slots[-1]["b"] - slots[-1]["a"] < per * 0.95:
        slots[-2]["b"] = slots[-1]["b"]
        slots.pop()
    return slots


def _unidades(midias, dur_slot):
    """Quantos slots as mídias cobrem sem repetir: foto = 1; vídeo = trechos bons de dur_slot (até 4)."""
    n = 0.0
    for m in midias:
        if m["tipo"] == "foto":
            n += 1 if m["nota"] >= 0.25 else 0.4
        else:
            n += min(4, max(1, m["dur"] / max(dur_slot * 1.5, 0.5)))
    return n


def _transicoes(M, sl, musica):
    """Transição de entrada de cada slot conforme o modelo (o primeiro não tem). Marca flash onde cabe."""
    downs = set(round(t, 3) for t in musica.get("downbeats") or [])
    drop = musica.get("drop")
    per = 60.0 / max(musica["bpm"], 1)
    ult_flash = -1e9
    for i, s in enumerate(sl):
        s["trans"], s["flash"] = "corte", False
        if i == 0:
            continue
        no_1 = round(s["a"], 3) in downs
        troca = s["nivel"] != sl[i - 1]["nivel"]
        e_drop = drop is not None and abs(s["a"] - drop) < 0.08
        mid = M["id"]
        if mid == "batida":
            if (e_drop or (troca and s["nivel"] == 2) or (s["acento"] and no_1)) and s["a"] - ult_flash >= 8 * per:
                s["flash"] = True
            if troca and not s["flash"]:
                s["trans"] = "zoom"
        elif mid == "drop":
            if drop is not None and s["a"] < drop - 0.05:
                s["trans"] = "dissolve"
            elif e_drop:
                s["flash"] = True
            elif no_1 and s["a"] - ult_flash >= 16 * per and s["acento"]:
                s["flash"] = True
            elif troca:
                s["trans"] = "zoom"
        elif mid == "memorias":
            s["trans"] = "dissolve"
        elif mid == "viagem":
            s["trans"] = "chicote" if (i % 2 == 0 or troca) else "corte"
            if e_drop:
                s["flash"] = True
        elif mid == "cinematico":
            s["trans"] = "preto" if troca else "dissolve"
        elif mid == "dinamico":
            # transição na virada do compasso (1 sim, 1 não) e em toda troca de energia; flash no drop e em acentos fortes
            if (e_drop or (troca and s["nivel"] == 2)) and s["a"] - ult_flash >= 8 * per:
                s["flash"] = True
            elif no_1 or troca:
                s["trans"] = "misto"
        if s["flash"]:
            ult_flash = s["a"]
    return sl


def dur_para_cobrir(musica, modelo_id, n, inicio=None, extra=0.0):
    """Duração (s) para que n mídias entrem ao menos uma vez com o ritmo do modelo, mais `extra` (intro e
    encerramento). A música inteira se não couber."""
    M = next((x for x in MODELOS if x["id"] == modelo_id), MODELOS[0])
    sl = _slots(musica, M, None, inicio)
    if not sl:
        return None
    precisa = max(1, int(n))
    fim = sl[min(precisa, len(sl)) - 1]["b"]
    return round(min(musica["dur"] - sl[0]["a"], fim - sl[0]["a"] + extra), 2)


def repetidas(midias, max_bits=60, min_cor=0.85):
    """Fotos repetidas ou quase iguais (rajada, a mesma foto mandada 2 vezes): {path: path da que fica}.
    Fica a de melhor nota de cada grupo. Calibrado em fotos reais: mesma pose/pessoas dá ≤ 57 bits de 256;
    pessoas diferentes no mesmo cenário e na mesma pose, ≥ 69."""
    fotos = [m for m in midias if m.get("tipo") == "foto" and m.get("h256") and m.get("hist")]
    bits = [np.unpackbits(np.frombuffer(bytes.fromhex(m["h256"]), dtype=np.uint8)) for m in fotos]
    hist = [np.asarray(m["hist"], dtype=np.float32) for m in fotos]
    pai = list(range(len(fotos)))

    def raiz(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i
    for i in range(len(fotos)):
        for j in range(i + 1, len(fotos)):
            if int((bits[i] != bits[j]).sum()) <= max_bits and float(np.minimum(hist[i], hist[j]).sum()) >= min_cor:
                pai[raiz(i)] = raiz(j)
    grupos = collections.defaultdict(list)
    for i, m in enumerate(fotos):
        grupos[raiz(i)].append(m)
    out = {}
    for g in grupos.values():
        if len(g) < 2:
            continue
        fica = max(g, key=lambda m: (m["nota"], m.get("rostos") or 0))
        for m in g:
            if m is not fica:
                out[m["path"]] = fica["path"]
    return out


def recomendar(musica, midias, dur_alvo=None, inicio=None):
    fotos = [m for m in midias if m["tipo"] == "foto"]
    videos = [m for m in midias if m["tipo"] == "video"]
    frac_video = len(videos) / max(1, len(midias))
    retrato = sum(1 for m in midias if m["h"] > m["w"]) / max(1, len(midias))
    bpm = musica["bpm"]
    out = []
    for M in MODELOS:
        sl = _slots(musica, M, dur_alvo, inicio)
        if not sl:
            continue
        dur_media = float(np.mean([s["b"] - s["a"] for s in sl]))
        un = _unidades(midias, dur_media)
        cobertura = min(1.0, un / len(sl))
        tipo = 1 - abs(frac_video - M["ideal"])
        lo, hi = M["bpm"]
        # dobro/metade do andamento contam (100 BPM "cabe" num modelo de 200)
        andamento = max(1.0 if lo <= b <= hi else math.exp(-((min(abs(b - lo), abs(b - hi))) / 25) ** 2) for b in (bpm, bpm * 2, bpm / 2))
        formato = 0.75 + 0.25 * retrato
        nota = 0.42 * cobertura + 0.23 * tipo + 0.2 * andamento + 0.15 * formato
        aviso = None
        if un < len(sl) * 0.8:
            falta = len(sl) - int(un)
            dur_ok = sl[max(0, int(un) - 1)]["b"] - sl[0]["a"]
            aviso = f"Pede ~{len(sl)} cenas; suas mídias cobrem ~{int(un)}. Dá para encurtar para {dur_ok:.0f} s ou repetir as melhores ({falta} repetidas)."
        out.append({"id": M["id"], "nome": M["nome"], "desc": M["desc"], "nota": round(nota, 3), "slots": len(sl),
                    "dur": round(sl[-1]["b"] - sl[0]["a"], 2), "cobertura": round(cobertura, 2), "aviso": aviso})
    out.sort(key=lambda r: -r["nota"])
    return out


# ─────────────────────────── encaixe ───────────────────────────
def _hamming(a, b):
    try:
        return bin(int(a) ^ int(b)).count("1")
    except Exception:
        return 64


def _candidatos(midias, dur_slot, dur_max):
    """Fotos (1 cada) e trechos de vídeo (as melhores janelas sem sobreposição). Cada um sabe o seu grupo
    (mídia; fotos quase iguais, de rajada, contam como o mesmo grupo) e o seu posto dentro dele (0 = o melhor)."""
    cand = []
    for m in midias:
        if m["tipo"] == "foto":
            cand.append({"path": m["path"], "tipo": "foto", "nota": m["nota"], "mov": 0.0, "rostos": m["rostos"],
                         "fx": m["fx"], "fy": m["fy"], "hash": m["hash"], "w": m["w"], "h": m["h"], "data": m.get("data"),
                         "caixa": m.get("caixa"), "posto": 0})
            continue
        am = m["amostras"]
        if not am:
            continue
        passo = am[1]["t"] - am[0]["t"] if len(am) > 1 else 0.5
        janela = max(1, int(round(dur_slot / max(passo, 1e-3))))
        notas = np.array([_nota_amostra(a) for a in am])
        movs = np.array([a["mov"] for a in am])
        if len(notas) >= janela:
            media = np.convolve(notas, np.ones(janela) / janela, "valid")
        else:
            media = np.array([notas.mean()])
        usados = np.zeros(len(media), dtype=bool)
        n_max = int(min(8, max(1, m["dur"] // max(dur_slot * 1.5, 0.5))))
        for r in range(n_max):
            livres = np.where(~usados)[0]
            if not len(livres):
                break
            k = int(livres[np.argmax(media[livres])])
            ini = am[k]["t"]
            if ini + dur_max > m["dur"]:
                ini = max(0.0, m["dur"] - dur_max - 0.05)
            meio = am[min(len(am) - 1, k + janela // 2)]
            cand.append({"path": m["path"], "tipo": "video", "ini": round(ini, 3), "dur_fonte": m["dur"],
                         "nota": float(media[k]), "mov": float(movs[k:k + janela].mean()),
                         "rostos": meio["rostos"], "fx": meio["fx"], "fy": meio["fy"], "hash": meio["hash"],
                         "w": m["w"], "h": m["h"], "data": None, "posto": r})
            usados[max(0, k - janela):k + janela] = True
    # grupos: mesma mídia, ou fotos quase iguais (rajada) — repetir o grupo é repetir a cena
    # (vídeo copiado com outro nome, "arquivo(1).mp4": mesma duração e mesmo primeiro quadro)
    def assinatura(m):
        if m["tipo"] == "foto":
            return ("foto", m.get("hash"), 0)
        am = m.get("amostras") or [{}]
        return ("video", am[0].get("hash"), m.get("dur", 0))

    def igual(a, b):
        if a[0] != b[0]:
            return False
        if a[0] == "foto":
            return _hamming(a[1], b[1]) < 8
        return abs(a[2] - b[2]) < 0.05 and _hamming(a[1], b[1]) < 6
    reps = []
    for m in midias:
        sg = assinatura(m)
        g = next((i for i, r in enumerate(reps) if igual(r, sg)), None)
        if g is None:
            reps.append(sg)
            g = len(reps) - 1
        m["_grupo"] = g
    grupo = {m["path"]: m["_grupo"] for m in midias}
    for c in cand:
        c["grupo"] = grupo.get(c["path"], -1)
    # posto dentro do grupo (duas fotos da mesma rajada: a melhor é a 0)
    por_g = {}
    for c in sorted(cand, key=lambda c: (c["posto"], -c["nota"])):
        c["posto"] = por_g.get(c["grupo"], 0)
        por_g[c["grupo"]] = c["posto"] + 1
    return cand


# ─────────────────────────── telas divididas ───────────────────────────
# Quadro 9:16 (1080×1920) com fundo preto; as células entram uma por batida (estilo CapCut).
# "m" = minimalista: margens e respiro; sem "m" = de ponta a ponta com fio preto entre as células.
def _grade(n_lin, n_col, mx=0, my=None, gap=10, cw=None, ch=None):
    W, H = 1080, 1920
    cw = cw or (W - 2 * mx - gap * (n_col - 1)) / n_col
    ch = ch or ((H - 2 * my - gap * (n_lin - 1)) / n_lin if my is not None else (H - gap * (n_lin - 1)) / n_lin)
    tw, th = cw * n_col + gap * (n_col - 1), ch * n_lin + gap * (n_lin - 1)
    x0, y0 = (W - tw) / 2, (H - th) / 2
    return [{"x": round(x0 + c * (cw + gap), 1), "y": round(y0 + l * (ch + gap), 1), "w": round(cw, 1), "h": round(ch, 1)}
            for l in range(n_lin) for c in range(n_col)]


LAYOUTS = {
    "pilha3":  {"deitado": True,  "celulas": _grade(3, 1)},                              # 3 faixas 16:9 de ponta a ponta
    "pilha3m": {"deitado": True,  "celulas": _grade(3, 1, cw=960, ch=540, gap=30)},      # 3 quadros 16:9 com margem
    "pilha2":  {"deitado": True,  "celulas": _grade(2, 1)},
    "pilha2m": {"deitado": True,  "celulas": _grade(2, 1, cw=960, ch=540, gap=40)},      # 2 quadros 16:9 no centro
    "grade4":  {"deitado": False, "celulas": _grade(2, 2)},                              # 4 células 9:16
    "colunas2": {"deitado": False, "celulas": _grade(1, 2)},
    "colunas3m": {"deitado": False, "celulas": _grade(1, 3, cw=320, ch=1200, gap=20)},   # 3 colunas no meio
}
# por modelo: de quantos em quantos compassos entra uma tela dividida, e quais formas combinam
_LAYOUT_MODELO = {
    "batida": {"cada": 12, "passo": 1, "formas": {True: ["pilha3", "pilha2"], False: ["grade4", "colunas2"]}},
    "drop": {"cada": 12, "passo": 1, "formas": {True: ["pilha3", "pilha3m"], False: ["grade4", "colunas3m"]}},
    "viagem": {"cada": 8, "passo": 1, "formas": {True: ["pilha3m", "pilha3"], False: ["colunas3m", "grade4"]}},
    "memorias": {"cada": 12, "passo": 2, "formas": {True: ["pilha2m", "pilha3m"], False: ["colunas3m", "colunas2"]}},
    "cinematico": {"cada": 16, "passo": 2, "formas": {True: ["pilha2m"], False: ["colunas2"]}},
    "dinamico": {"cada": 10, "passo": 1, "formas": {True: ["pilha3", "pilha2m"], False: ["grade4", "colunas3m"]}},
}


def _layouts(M, sl, musica, cand, rng, sobra=1.0):
    """Troca alguns trechos por telas divididas. Cada slot vira {..., layout, celulas:[{a, cel}]}.
    sobra > 1 = mais mídias que cenas: telas divididas mais frequentes (usa mais mídias por compasso)."""
    cfg = _LAYOUT_MODELO.get(M["id"])
    beats = musica["beats"]
    if not cfg or len(sl) < 6 or len(beats) < 8:
        return sl
    downs = set(round(t, 3) for t in musica["downbeats"])
    idx = {round(t, 3): k for k, t in enumerate(beats)}
    drop = musica.get("drop")
    per = 60.0 / max(musica["bpm"], 1)
    # muita mídia para pouca música (ex.: 51 fotos num reel de 30 s): telas divididas bem mais frequentes
    cada = max(4, int(round(cfg["cada"] / min(2.0, max(1.0, sobra))))) if sobra < 1.25 else \
        max(4, int(round(cfg["cada"] / min(3.0, sobra * 2))))
    # margens (em compassos) do começo e do fim sem tela dividida; com mídia sobrando, bem menores
    m_ini, m_fim = (4, 3) if sobra < 1.25 else (1, 1)
    # orientação que sobra: deitado (paisagem) ou em pé
    deitados = sum(1 for c in cand if c["posto"] == 0 and c["w"] > c["h"] * 1.1)
    em_pe = sum(1 for c in cand if c["posto"] == 0 and c["h"] > c["w"] * 1.1)
    usados, ult, out, i = 0, None, [], 0
    fim = sl[-1]["b"]
    while i < len(sl):
        s = sl[i]
        k0 = idx.get(round(s["a"], 3))
        pode = (i >= 2 and k0 is not None and round(s["a"], 3) in downs
                and (ult is None or s["a"] - ult >= cada * 4 * per - 0.05)
                and s["a"] - sl[0]["a"] >= m_ini * 4 * per - 0.05 and fim - s["a"] >= m_fim * 4 * per
                and not (drop is not None and -2 * per <= s["a"] - drop < 8 * per))   # o drop fica em tela cheia
        if not pode:
            out.append(s)
            i += 1
            continue
        deitado = deitados >= em_pe if (deitados + em_pe) else True
        if deitados and em_pe and rng.uniform() < 0.3:
            deitado = not deitado   # às vezes a outra orientação, se houver material
        forma = cfg["formas"][deitado][usados % len(cfg["formas"][deitado])]
        cels = LAYOUTS[forma]["celulas"]
        n, passo = len(cels), cfg["passo"]
        # duração: todas entram, a última ainda fica ~1 batida (fecha em compasso inteiro)
        tot = int(math.ceil((passo * (n - 1) + max(1, passo)) / 4.0) * 4)
        if k0 + tot >= len(beats):
            out.append(s)
            i += 1
            continue
        b = beats[k0 + tot]
        if b > fim - 0.05:
            out.append(s)
            i += 1
            continue
        # consome os slots até b; o que atravessa b é aparado
        j = i
        while j < len(sl) and sl[j]["b"] <= b + 0.05:
            j += 1
        if j < len(sl) and sl[j]["a"] < b - 0.05:
            if sl[j]["b"] - b < per * 0.95:
                out.append(s)
                i += 1
                continue
            sl[j] = dict(sl[j], a=round(b, 4), acento=False)
        out.append({"a": s["a"], "b": round(b, 4), "nivel": s["nivel"], "acento": s["acento"], "layout": forma,
                    "celulas": [{"a": round(beats[k0 + passo * c], 4), "cel": cel} for c, cel in enumerate(cels)]})
        usados += 1
        ult = s["a"]
        i = j
    return out


def _encaixe_custo(c, s, M, dur, i, n):
    """Quanto a mídia c combina com o slot s (quanto maior, melhor)."""
    v = c["nota"]
    # tipo pedido pelo modelo (Memórias quer foto, Cinemático quer vídeo)
    v += 0.18 * ((1 if c["tipo"] == "video" else 0) - 0.5) * (M["ideal"] - 0.5) * 2
    # energia alta pede movimento (vídeo), calma aceita foto
    v += 0.25 * (c["mov"] if s["nivel"] == 2 else (0.5 - abs(c["mov"] - 0.3)) * 0.4)
    if c["tipo"] == "foto" and s["nivel"] == 2 and M["ideal"] > 0.5:
        v -= 0.1
    if c["tipo"] == "video":
        if c["dur_fonte"] < dur - 0.05:
            v -= 5   # curto demais para o slot
        elif c["ini"] + dur > c["dur_fonte"]:
            v -= 0.2
    if s.get("cel"):
        # célula da tela dividida: orientação da mídia parecida com a da célula (menos corte)
        ar_c, ar_m = s["cel"]["w"] / s["cel"]["h"], c["w"] / max(1, c["h"])
        v -= 0.35 * abs(math.log(ar_c / max(ar_m, 1e-3)))
        # célula pede foto: vídeo num quadro pequeno (pior: um reel já editado, com a própria tela dividida dentro)
        # ficava estranho (pedido do cliente, 2026-10-01)
        if c["tipo"] == "video":
            v -= 3
    elif i == 0 or i == n - 1:
        v += 0.3 * c["nota"] + 0.1 * min(1, c["rostos"])   # abertura e fecho: as mais fortes
    return v


def _refinar(item, m, dur, nivel, acento, ocupado):
    """Escolhe o momento exato do vídeo para ESTE slot: bom de ver, com a energia do trecho da música,
    sem corte de cena no meio e sem repetir o trecho já usado desse vídeo."""
    am = m.get("amostras") or []
    if len(am) < 2:
        return item.get("ini", 0.0)
    passo = am[1]["t"] - am[0]["t"]
    jan = max(1, int(round(dur / max(passo, 1e-3))))
    lim = max(0.0, m["dur"] - dur - 0.05)
    notas = np.array([_nota_amostra(a) for a in am])
    movs = np.array([a["mov"] for a in am])
    rost = np.array([min(1.0, a["rostos"]) for a in am])
    # corte de cena dentro do próprio arquivo (vídeo já editado / virada brusca): hash muda muito de uma amostra à outra
    salto = np.array([0.0] + [1.0 if _hamming(am[k - 1]["hash"], am[k]["hash"]) > 22 else 0.0 for k in range(1, len(am))])
    alvo_mov = {0: 0.2, 1: 0.35, 2: 0.6}.get(nivel, 0.35)
    melhor, t_melhor = -1e9, item.get("ini", 0.0)
    for k in range(0, len(am)):
        t = am[k]["t"]
        if t > lim + 1e-6:
            break
        e = min(len(am), k + jan)
        v = notas[k:e].mean() + 0.1 * rost[k:e].mean()
        v -= 0.35 * abs(movs[k:e].mean() - alvo_mov)
        if acento:
            v += 0.15 * movs[k:min(e, k + 2)].mean()   # a ação começa junto com o corte
        v -= 0.4 * salto[k + 1:e].sum()
        if t < 0.3:
            v -= 0.08   # começo do arquivo: câmera ainda ajeitando
        # trecho já usado desse vídeo (ou colado nele) não serve
        for a, b in ocupado:
            sobre = min(b, t + dur) - max(a, t)
            if sobre > -0.3:
                v -= 1.5 * (0.3 + max(0.0, sobre) / dur)
        if v > melhor:
            melhor, t_melhor = v, t
    return round(min(t_melhor, lim), 3)


def planejar(musica, midias, modelo_id, dur_alvo=None, ordem="inteligente", semente=0, inicio=None, telas=True, reserva=None):
    """reserva = [s_inicio, s_fim]: segundos no começo/fim do vídeo que ficam sem cena (intro e encerramento do
    modelo de cliente); as mídias vão todas para o corpo. inicio/fim do plano continuam os da música."""
    from scipy.optimize import linear_sum_assignment
    M = next((x for x in MODELOS if x["id"] == modelo_id), MODELOS[0])
    sl = _slots(musica, M, dur_alvo, inicio)
    if not sl or not midias:
        return {"success": False, "error": "Música sem batidas suficientes ou sem mídias"}
    ini_musica, fim_musica = sl[0]["a"], sl[-1]["b"]

    def corpo(sl):
        if not reserva:
            return sl
        r0, r1 = float(reserva[0] or 0), float(reserva[1] or 0)
        c = [s for s in sl if s["a"] >= ini_musica + r0 - 0.05 and s["b"] <= fim_musica - r1 + 0.05]
        return c if len(c) >= 2 else sl
    sl = corpo(sl)
    # muito mais mídia do que cenas (ex.: 42 fotos num reel de 30 s): o ritmo acelera meio passo
    if len(midias) > len(sl) * 1.3 and max(M["ritmo"]) > 1:
        M = dict(M, ritmo=[max(1, r // 2) for r in M["ritmo"]])
        sl = corpo(_slots(musica, M, dur_alvo, inicio))
    dur_slots = [s["b"] - s["a"] for s in sl]
    cand = _candidatos(midias, float(np.median(dur_slots)), max(dur_slots))
    if not cand:
        return {"success": False, "error": "Nenhuma mídia aproveitável"}
    rng = np.random.default_rng(int(semente) or None)
    n_grupos = len({c["grupo"] for c in cand})
    if telas:
        sl = _layouts(M, sl, musica, cand, rng, sobra=n_grupos / max(1, len(sl)))
    _transicoes(M, sl, musica)
    # linhas do encaixe: um slot normal = 1 linha; tela dividida = 1 linha por célula
    linhas = []
    for si, s in enumerate(sl):
        if s.get("layout"):
            for ci, ce in enumerate(s["celulas"]):
                linhas.append({"slot": si, "cel_i": ci, "a": ce["a"], "b": s["b"], "nivel": s["nivel"], "acento": False, "cel": ce["cel"]})
        else:
            linhas.append({"slot": si, "a": s["a"], "b": s["b"], "nivel": s["nivel"], "acento": s["acento"]})
    n = len(linhas)
    # cobrir tudo: se as mídias cabem, cada uma entra ao menos uma vez (bônus no melhor trecho de cada);
    # repetir só quando faltar, e sempre um trecho diferente do mesmo vídeo
    cobre = n_grupos <= n
    base = sorted(cand, key=lambda x: -x["nota"])
    boas = [c for c in base if c["nota"] >= 0.45] or base
    rodada = 0
    while len(cand) < n + sum(1 for c in base if c["nota"] < 0.45) and rodada < 20:
        rodada += 1
        for c in boas:
            nc = dict(c, repetida=rodada)
            if c["tipo"] == "video":
                passo = max(0.5, float(np.median(dur_slots)) * 0.5)
                nc["ini"] = round((c["ini"] + passo * rodada) % max(0.5, c["dur_fonte"] - max(dur_slots)), 3)
            cand.append(nc)
    # quantas vezes cada vídeo aguenta aparecer sem repetir trecho (vídeo longo aguenta mais)
    dur_med = float(np.median(dur_slots))
    n_jan = collections.Counter(c["path"] for c in cand if not c.get("repetida"))
    C = np.zeros((n, len(cand)))
    for i, s in enumerate(linhas):
        dur = s["b"] - s["a"]
        for j, c in enumerate(cand):
            v = _encaixe_custo(c, s, M, dur, i, n)
            # repetir a mesma cena custa caro: 2º trecho do mesmo vídeo, e mais ainda cópias
            v -= (0.22 if cobre else 0.5) * c["posto"]   # com mídia de sobra, repetir quase nunca compensa
            if c.get("repetida"):
                v -= 0.6 + 0.15 * c["repetida"]
                uso = c["repetida"] * n_jan[c["path"]] + c["posto"] + 1
                cap = max(1.0, c["dur_fonte"] / (dur_med * 1.2)) if c["tipo"] == "video" else 1.0
                v -= 0.3 * max(0.0, uso - cap)
            if cobre and c["posto"] == 0 and not c.get("repetida") and c["nota"] >= 0.2:
                v += 0.6
            v += rng.uniform(0, 0.08)   # "gerar outra versão" muda a escolha entre parecidas
            C[i, j] = -v
    lin, col = linear_sum_assignment(C)
    escolha = [cand[j] for j in col[np.argsort(lin)]]
    # a ordem só mexe nos slots de tela cheia (as células já foram escolhidas pela orientação)
    cheias = [i for i, l in enumerate(linhas) if not l.get("cel")]
    if ordem in ("cronologica", "aleatoria"):
        sub = [escolha[i] for i in cheias]
        if ordem == "cronologica":
            sub.sort(key=lambda c: (c.get("data") or "", c["path"]))
        else:
            rng.shuffle(sub)
        for i, c in zip(cheias, sub):
            escolha[i] = c

    # troca local: a mesma cena (ou quase igual) a menos de 4 linhas de distância troca com uma de mais longe
    def perto(i, c):
        for d in (-3, -2, -1, 1, 2, 3):
            k = i + d
            if 0 <= k < n and k != i and linhas[k]["slot"] != linhas[i]["slot"] and (
                    escolha[k]["grupo"] == c["grupo"] or _hamming(escolha[k]["hash"], c["hash"]) < 10):
                return True
        return False
    if ordem != "cronologica":
        for _ in range(4):
            for i in cheias:
                if not perto(i, escolha[i]):
                    continue
                for j in reversed(cheias):
                    if j == i:
                        continue
                    a, b = escolha[i], escolha[j]
                    escolha[i], escolha[j] = b, a
                    if not perto(i, b) and not perto(j, a):
                        break
                    escolha[i], escolha[j] = a, b
    # momento exato de cada vídeo, na ordem do vídeo final, sem reaproveitar trecho já usado
    por_path = {m["path"]: m for m in midias}
    ocupado = {}
    plano = []
    for l, c in zip(linhas, escolha):
        s = sl[l["slot"]]
        item = {"a": l["a"], "b": l["b"], "nivel": l["nivel"], "acento": l["acento"], "path": c["path"], "tipo": c["tipo"],
                "fx": c["fx"], "fy": c["fy"], "w": c["w"], "h": c["h"], "caixa": c.get("caixa"),
                "trans": "corte" if l.get("cel") else s["trans"], "flash": False if l.get("cel") else s["flash"]}
        if l.get("cel"):
            item.update(layout=s["layout"], cel=l["cel"], cel_i=l["cel_i"], grupo_a=s["a"])
        if c["tipo"] == "video":
            dur = l["b"] - l["a"]
            m = por_path.get(c["path"])
            item["ini"] = round(min(c["ini"], max(0.0, c["dur_fonte"] - dur - 0.02)), 3)
            if m:
                oc = ocupado.setdefault(c["path"], [])
                item["ini"] = _refinar(item, m, dur, l["nivel"], l["acento"], oc)
                oc.append((item["ini"], item["ini"] + dur))
                # foco do momento escolhido
                am = m.get("amostras") or []
                if am:
                    meio = min(am, key=lambda a: abs(a["t"] - (item["ini"] + dur / 2)))
                    item["fx"], item["fy"] = meio["fx"], meio["fy"]
        plano.append(item)
    usados = {p["path"] for p in plano}
    return {"success": True, "modelo": {k: M[k] for k in M if k not in ("ritmo",)}, "slots": plano,
            "inicio": ini_musica, "fim": fim_musica, "bpm": musica["bpm"],
            "uso": {"usadas": len(usados), "total": len(midias), "telas": sum(1 for s in sl if s.get("layout"))}}
