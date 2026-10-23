"""estabilizador.py — Estabilizar do Vídeo Kanivete (o Warp Stabilizer do Premiere, mais leve e sem gelatina).

Três passos, todos no processador e sem modelo de IA:
1. analisar(): movimento da câmera quadro a quadro. Pontos do cenário seguidos com LK (ida e volta, só os que voltam
   ao lugar), semelhança (posição, giro, escala) por RANSAC. Trilhas que duram vários quadros pesam mais (o cenário
   fica; mão/gente passando entra e sai) e o conjunto que venceu no quadro anterior é a semente do próximo.
2. caminho(): o caminho "ideal" da câmera por otimização L1 (Grundmann 2011, o do YouTube): trechos parados, retas e
   curvas suaves — pan de verdade fica, tremor sai — sem passar do corte máximo (zoom) pedido.
3. renderizar(): aplica a correção em cada quadro direto nos planos YUV (sem converter cor; 10 bits continuam 10)
   com um zoom único que esconde as bordas, e grava uma cópia da mídia (o clipe passa a usá-la, como o Inverter).

Convênio: M_t (3×3) leva pontos do quadro t ao quadro 0. Caminho suave P_t. Quadro de saída = quadro t deformado por
W_t = Z · P_t⁻¹ · M_t (Z = zoom no centro). Parâmetros de uma semelhança no centro c: p' = s·R(θ)(p − c) + c + (tx, ty).
"""
import os
import math
import time
import json
import hashlib
import subprocess

import numpy as np
import cv2

LARG_ANALISE = 640   # largura da análise (px); a correção volta para a resolução real


# ---------------------------------------------------------------- semelhanças
def _sim(tx, ty, th, ls, cx, cy):
    s = math.exp(ls)
    c, n = s * math.cos(th), s * math.sin(th)
    return np.array([[c, -n, cx + tx - c * cx + n * cy], [n, c, cy + ty - n * cx - c * cy], [0, 0, 1.0]])


def _params(M, cx, cy):
    s = math.hypot(M[0, 0], M[1, 0])
    th = math.atan2(M[1, 0], M[0, 0])
    tx = M[0, 2] + M[0, 0] * cx + M[0, 1] * cy - cx
    ty = M[1, 2] + M[1, 0] * cx + M[1, 1] * cy - cy
    return np.array([tx, ty, th, math.log(max(s, 1e-6))])


# ---------------------------------------------------------------- leitura de quadros (ffmpeg)
def _ff():
    from Functions.video_cutter import ffmpeg_path
    return ffmpeg_path()


def _flags():
    from Functions.video_cutter import _creationflags
    return _creationflags() | (0x00004000 if os.name == "nt" else 0)   # abaixo do normal: a edição não engasga


def _ler_cinza(path, a, b, taxa, larg):
    """gerador de quadros em cinza, largura larg, na taxa cravada (mesma contagem de quadros da renderização)"""
    from Functions.video_cutter import probe, _tempo_ffmpeg
    info = probe(path)
    W, H = max(2, info["width"] or 1920), max(2, info["height"] or 1080)
    larg = min(larg, W)
    alt = int(round(H * larg / W / 2)) * 2
    cmd = [_ff(), "-v", "error", "-nostdin", "-ss", _tempo_ffmpeg(a), "-t", _tempo_ffmpeg(b - a), "-i", path, "-an",
           "-vf", f"fps={taxa:.6f},scale={larg}:{alt}:flags=area,format=gray", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=_flags(), bufsize=larg * alt * 4)
    try:
        n = larg * alt
        while True:
            buf = p.stdout.read(n)
            if len(buf) < n:
                break
            yield np.frombuffer(buf, np.uint8).reshape(alt, larg)
    finally:
        p.stdout.close()
        p.kill()
        p.wait()


# ---------------------------------------------------------------- 1. análise
def _pontos(g, mascara, n=500):
    """cantos espalhados numa grade 8×6 (sem amontoar onde tem mais textura)"""
    h, w = g.shape
    gx, gy = 8, 6
    por = max(4, n // (gx * gy))
    tudo = []
    for j in range(gy):
        for i in range(gx):
            x0, x1, y0, y1 = w * i // gx, w * (i + 1) // gx, h * j // gy, h * (j + 1) // gy
            m = None if mascara is None else mascara[y0:y1, x0:x1]
            p = cv2.goodFeaturesToTrack(g[y0:y1, x0:x1], por, 0.01, 8, mask=m)
            if p is not None:
                tudo.append(p.reshape(-1, 2) + (x0, y0))
    return np.concatenate(tudo).astype(np.float32) if tudo else np.zeros((0, 2), np.float32)


def analisar(path, a, b, taxa=None, on_pct=None, stop=None, mascaras=None):
    """movimento quadro a quadro: {"taxa", "W", "H", "esc", "d": [[tx,ty,th,ls]...] (quadro t-1 → t, px reais),
    "conf": [0..1]}. mascaras(t, shape) → uint8 (255 = pode usar) opcional (ex.: pessoas tiradas pelo recorte)."""
    from Functions.video_cutter import probe
    info = probe(path)
    W, H = max(2, info["width"] or 1920), max(2, info["height"] or 1080)
    taxa = float(taxa or info.get("fps_timeline") or 30.0)
    larg = min(LARG_ANALISE, W)
    esc = W / larg
    tot = max(1, int(round((b - a) * taxa)))
    d, conf = [[0.0, 0.0, 0.0, 0.0]], [1.0]
    ant = None
    trilhas = None   # pontos que vêm de quadros anteriores e sua idade
    idade = None
    lk = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    for k, g in enumerate(_ler_cinza(path, a, b, taxa, larg)):
        if stop is not None and stop.is_set():
            raise InterruptedError("Cancelado.")
        if ant is None:
            ant = g
            h, w = g.shape
            cx, cy = w / 2, h / 2
            continue
        msk = mascaras(k - 1, ant.shape) if mascaras else None
        # renova: mantém as trilhas vivas e completa com pontos novos onde faltam
        novos = _pontos(ant, msk)
        if trilhas is not None and len(trilhas):
            if len(novos):
                dist = np.min(np.linalg.norm(novos[:, None, :] - trilhas[None, :, :], axis=2), axis=1) if len(trilhas) < 3000 else np.full(len(novos), 99)
                novos = novos[dist > 6]
            p0 = np.concatenate([trilhas, novos]).astype(np.float32)
            id0 = np.concatenate([idade, np.zeros(len(novos))])
        else:
            p0, id0 = novos, np.zeros(len(novos))
        res = [0.0, 0.0, 0.0, 0.0]
        c = 0.0
        if len(p0) >= 10:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(ant, g, p0.reshape(-1, 1, 2), None, **lk)
            pv, st2, _ = cv2.calcOpticalFlowPyrLK(g, ant, p1, None, **lk)
            fb = np.linalg.norm(pv.reshape(-1, 2) - p0, axis=1)
            ok = (st.ravel() == 1) & (st2.ravel() == 1) & (fb < 0.7)
            p1 = p1.reshape(-1, 2)
            if ok.sum() >= 10:
                A, B, I = p0[ok], p1[ok], id0[ok]
                # trilhas antigas primeiro: o RANSAC prefere o conjunto do cenário que persiste
                peso = np.minimum(I, 10) + 1
                ordem = np.argsort(-peso, kind="stable")
                A, B, I = A[ordem], B[ordem], I[ordem]
                m, inl = cv2.estimateAffinePartial2D(A, B, method=cv2.RANSAC, ransacReprojThreshold=1.0,
                                                     maxIters=3000, confidence=0.999)
                if m is not None:
                    inl = inl.ravel().astype(bool)
                    # refina: só os inliers, pesando as trilhas longas (mínimos quadrados ponderados)
                    m2, _ = cv2.estimateAffinePartial2D(A[inl], B[inl], method=cv2.LMEDS)
                    if m2 is not None:
                        m = m2
                    M = np.vstack([m, [0, 0, 1]])
                    # M leva o quadro t-1 ao t; guardamos t-1 → t
                    pr = _params(M, cx, cy)
                    res = [pr[0] * esc, pr[1] * esc, pr[2], pr[3]]
                    c = float(inl.mean()) * min(1.0, inl.sum() / 40)
                    trilhas = B[inl].astype(np.float32)
                    idade = I[inl] + 1
                else:
                    trilhas, idade = None, None
            else:
                trilhas, idade = None, None
        else:
            trilhas, idade = None, None
        if trilhas is not None:   # fora da imagem: some
            dentro = (trilhas[:, 0] > 2) & (trilhas[:, 1] > 2) & (trilhas[:, 0] < g.shape[1] - 3) & (trilhas[:, 1] < g.shape[0] - 3)
            trilhas, idade = trilhas[dentro], idade[dentro]
        d.append(res)
        conf.append(c)
        ant = g
        if on_pct and k % 10 == 0:
            on_pct(min(99, int(k * 100 / tot)))
    return {"taxa": taxa, "W": W, "H": H, "esc": esc, "d": d, "conf": conf, "a": a, "b": b}


def trajetoria(an):
    """M_t (quadro t → quadro 0) acumulado e os parâmetros do caminho C_t"""
    W, H = an["W"], an["H"]
    cx, cy = W / 2, H / 2
    Ms, C = [np.eye(3)], [np.zeros(4)]
    for k in range(1, len(an["d"])):
        tx, ty, th, ls = an["d"][k]
        if an["conf"][k] < 0.05:   # quadro sem cenário confiável: segue o anterior (sem pulo)
            tx = ty = th = ls = 0.0
        D = _sim(tx, ty, th, ls, cx, cy)   # t-1 → t
        M = Ms[-1] @ np.linalg.inv(D)       # t → 0
        Ms.append(M)
        C.append(_params(M, cx, cy))
    return Ms, np.array(C)


# ---------------------------------------------------------------- 2. caminho ideal (L1)
JANELA, SOBRA = 300, 60   # caminho em janelas de 10 s (a conta cresce mais que linear); emenda fixando 3 quadros


def _lp_janela(Cn, ativos, w, mx, my, fr_fs, fixo):
    """uma janela do L1: minimiza w1|D1 p| + w2|D2 p| + w3|D3 p| com |p − c| dentro do corte. fixo = primeiros
    quadros já decididos (emenda com a janela anterior) ou None"""
    from scipy.optimize import linprog
    from scipy import sparse
    N, k = len(Cn), len(ativos)
    ns = [max(0, N - 1), max(0, N - 2), max(0, N - 3)]
    off = [N * k, N * k + ns[0] * k, N * k + (ns[0] + ns[1]) * k]
    nv = N * k + sum(ns) * k
    cobj = np.zeros(nv)
    for o, n, wi in zip(off, ns, w):
        cobj[o:o + n * k] = wi
    blocos, ub = [], []
    for ordem, (o, n) in enumerate(zip(off, ns), 1):
        if n <= 0:
            continue
        coef = {1: [-1, 1], 2: [1, -2, 1], 3: [-1, 3, -3, 1]}[ordem]
        D = sparse.diags([float(x) for x in coef], list(range(len(coef))), shape=(n, N))
        Dk = sparse.kron(D, sparse.eye(k))
        E_ = sparse.eye(n * k)
        Z0 = sparse.csr_matrix((n * k, o - N * k)) if o > N * k else None
        Z1 = sparse.csr_matrix((n * k, nv - o - n * k)) if nv - o - n * k > 0 else None
        for sgn in (1, -1):
            partes = [sgn * Dk] + ([Z0] if Z0 is not None else []) + [-E_] + ([Z1] if Z1 is not None else [])
            blocos.append(sparse.hstack(partes))
            ub.append(np.zeros(n * k))
    # corte linearizado: s1·(p−c)_eixo + s2·fr·(p−c)_θ + s3·fs·(p−c)_ls ≤ m
    jt = ativos.index(2) if 2 in ativos else None
    js = ativos.index(3) if 3 in ativos else None
    (fyx, fxx), (fxy, fyy) = fr_fs
    for (jp, m, fr, fs) in ((0, mx, fyx, fxx), (1, my, fxy, fyy)):
        for s1 in (1, -1):
            for s2 in ((1, -1) if jt is not None else (0,)):
                for s3 in ((1, -1) if js is not None else (0,)):
                    linha = np.zeros(k)
                    linha[jp] = s1
                    if jt is not None:
                        linha[jt] = s2 * fr
                    if js is not None:
                        linha[js] = s3 * fs
                    A = sparse.kron(sparse.eye(N), sparse.csr_matrix(linha[None, :]))
                    blocos.append(sparse.hstack([A, sparse.csr_matrix((N, nv - N * k))]))
                    ub.append(m + Cn[:, ativos] @ linha)
    A = sparse.vstack(blocos).tocsr()
    lb = np.full(nv, -np.inf); hb = np.full(nv, np.inf)
    lb[N * k:] = 0
    if fixo is not None:
        nf = len(fixo)
        lb[:nf * k] = fixo.ravel(); hb[:nf * k] = fixo.ravel()
    sol = linprog(cobj, A_ub=A, b_ub=np.concatenate(ub), bounds=np.stack([lb, hb], 1), method="highs-ipm")
    return sol.x[:N * k].reshape(N, k) if sol.status == 0 else None


def caminho(an, suavidade=50, zoom_max=1.10, modo="suave", rotacao=True, escala=True):
    """P_t por programação linear (scipy/HiGHS), em janelas emendadas. suavidade 0..100 (Warp: 50 padrão); modo
    "parado" = câmera fixa (tripé) se couber no corte. Devolve (Ms, P, zoom_final)."""
    Ms, C = trajetoria(an)
    N = len(C)
    W, H = an["W"], an["H"]
    if N < 4:
        return Ms, C.copy(), 1.0
    f = max(1, suavidade) / 50.0
    w = (10.0 * f, 1.0, 100.0 * f) if modo != "parado" else (1000.0, 1.0, 1.0)
    R = math.hypot(W, H) / 2
    unid = np.array([1.0, 1.0, R, R])
    ativos = [0, 1] + ([2] if rotacao else []) + ([3] if escala else [])
    Cn = C * unid
    fr_fs = (((H / 2) / R, (W / 2) / R), ((W / 2) / R, (H / 2) / R))
    folga = 1.0
    for _ in range(3):   # a conta linearizada pode passar um pouco do corte: aperta e refaz
        mx, my = W * (1 - 1 / zoom_max) / 2 * folga, H * (1 - 1 / zoom_max) / 2 * folga
        P = Cn.copy()
        x_tudo = np.zeros((N, len(ativos)))
        ini, ok = 0, True
        while ini < N:
            fim = min(N, ini + JANELA)
            if N - fim < SOBRA:
                fim = N
            fixo = x_tudo[ini:ini + 3] if ini > 0 else None
            x = _lp_janela(Cn[ini:fim], ativos, w, mx, my, fr_fs, fixo)
            if x is None:
                ok = False
                break
            guarda = fim if fim == N else fim - SOBRA
            x_tudo[ini:guarda] = x[:guarda - ini]
            if fim == N:
                break
            ini = guarda - 3
        if ok:
            for jj, j in enumerate(ativos):
                P[:, j] = x_tudo[:, jj]
        else:   # tremor maior que o corte: gaussiana
            P = _gauss(Cn, 15)
        P = P / unid
        for j in (2, 3):
            if j not in ativos:
                P[:, j] = C[:, j]
        z = _zoom_preciso(Ms, P, W, H, zoom_max * 1.5)
        if z <= zoom_max * 1.003 or not ok:
            break
        folga *= max(0.5, (zoom_max - 1) / (z - 1) * 0.97)
    return Ms, P, min(z, zoom_max * 1.02)


def _gauss(Cn, raio):
    x = np.arange(-raio, raio + 1)
    ker = np.exp(-x ** 2 / (2 * (raio / 2.5) ** 2))
    ker /= ker.sum()
    return np.stack([np.convolve(np.pad(Cn[:, i], raio, mode="edge"), ker, mode="valid") for i in range(Cn.shape[1])], 1)


def correcoes(Ms, P, W, H):
    """W_t = P_t⁻¹ · M_t (sem o zoom)"""
    cx, cy = W / 2, H / 2
    return [np.linalg.inv(_sim(*p, cx, cy)) @ M for p, M in zip(P, Ms)]


def _zoom_preciso(Ms, P, W, H, zoom_max):
    """menor zoom no centro que esconde todas as bordas (conta exata, não a linearizada), no máximo zoom_max.
    Canto da saída com zoom z: c + v/z; volta pela inversa de W_t: A(c + v/z) + b → base + dir·u (u = 1/z) dentro
    de [0, W]×[0, H] ⇒ maior u possível = mínimo das razões."""
    cx, cy = W / 2, H / 2
    vs = np.array([[-cx, -cy], [cx, -cy], [cx, cy], [-cx, cy]])
    lim = np.array([W, H], float)
    u = 1.0
    for Wt in correcoes(Ms, P, W, H):
        inv = np.linalg.inv(Wt)
        A, b = inv[:2, :2], inv[:2, 2]
        base = A @ np.array([cx, cy]) + b
        for v in vs:
            d = A @ v
            for e in range(2):
                if d[e] > 1e-9:
                    u = min(u, (lim[e] + 0.5 - base[e]) / d[e])
                elif d[e] < -1e-9:
                    u = min(u, (base[e] + 0.5) / -d[e])
    return min(1.0 / max(u, 1e-3), zoom_max)


# ---------------------------------------------------------------- 3. renderização
def _quadros_finais(an, Ms, P, zoom):
    W, H = an["W"], an["H"]
    Z = np.array([[zoom, 0, W / 2 * (1 - zoom)], [0, zoom, H / 2 * (1 - zoom)], [0, 0, 1]])
    return [Z @ Wt for Wt in correcoes(Ms, P, W, H)]


def _codificador(dez):
    """placa NVIDIA quando houver (4K: 2× mais rápido que o x264); 10 bits na placa = H.265 Main10"""
    try:
        from Functions.video_cutter import _detectar_hw_encoder
        nv = _detectar_hw_encoder() == "h264_nvenc"
    except Exception:
        nv = False
    if nv:
        return (["-c:v", "hevc_nvenc", "-profile:v", "main10", "-pix_fmt", "p010le"] if dez else
                ["-c:v", "h264_nvenc", "-pix_fmt", "yuv420p"]) + ["-preset", "p5", "-rc", "vbr", "-cq", "16", "-b:v", "0", "-bf", "0"]
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p10le" if dez else "yuv420p"]


def renderizar(path, an, mats, saida, on_pct=None, stop=None):
    """aplica as matrizes (uma por quadro) nos planos YUV (sem converter cor; 10 bits seguem 10) e grava com as marcas
    de cor da fonte e o áudio do trecho. Ler, deformar e gravar andam em paralelo (fila de 4 quadros)."""
    import threading
    import queue
    from Functions.video_cutter import probe, _tempo_ffmpeg, _args_cor
    info = probe(path)
    W, H, taxa, a, b = an["W"], an["H"], an["taxa"], an["a"], an["b"]
    dez = "10" in str(info.get("pix_fmt") or "") or "12" in str(info.get("pix_fmt") or "")
    pf = "yuv420p10le" if dez else "yuv420p"
    bpp = 2 if dez else 1
    dt = np.uint16 if dez else np.uint8
    tamY, tamC = W * H, (W // 2) * (H // 2)
    n = (tamY + 2 * tamC) * bpp
    dec = [_ff(), "-v", "error", "-nostdin", "-ss", _tempo_ffmpeg(a), "-t", _tempo_ffmpeg(b - a), "-i", path, "-an",
           "-vf", f"fps={taxa:.6f}", "-pix_fmt", pf, "-f", "rawvideo", "-"]
    gop = str(max(1, int(round(taxa / 2))))   # quadro-chave a cada ~0,5 s: busca rápida no editor
    tmp = saida + ".tmp.mp4"
    aud = (["-ss", _tempo_ffmpeg(a), "-t", _tempo_ffmpeg(b - a), "-i", path, "-map", "0:v:0", "-map", "1:a:0?",
            "-c:a", "aac", "-b:a", "256k"] if info.get("has_audio") else ["-map", "0:v:0"])
    enc = [_ff(), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", pf, "-s", f"{W}x{H}", "-r", f"{taxa:.6f}", "-i", "-",
           *aud, *_codificador(dez), "-g", gop, *_args_cor(info, H), "-movflags", "+faststart", "-shortest", tmp]
    pd = subprocess.Popen(dec, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=_flags(), bufsize=n * 2)
    pe = subprocess.Popen(enc, stdin=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=_flags())
    S, S_inv = np.diag([0.5, 0.5, 1.0]), np.diag([2.0, 2.0, 1.0])
    sh, sh_i = np.array([[1, 0, -0.5], [0, 1, -0.5], [0, 0, 1]]), np.array([[1, 0, 0.5], [0, 1, 0.5], [0, 0, 1]])
    entra, sai = queue.Queue(4), queue.Queue(4)
    erro = []

    def ler():
        try:
            while True:
                buf = pd.stdout.read(n)
                if len(buf) < n:
                    break
                entra.put(buf)
        except Exception as e:
            erro.append(e)
        entra.put(None)

    def gravar():
        try:
            while True:
                x = sai.get()
                if x is None:
                    break
                for p_ in x:
                    pe.stdin.write(p_)
        except Exception as e:
            erro.append(e)

    tl, tg = threading.Thread(target=ler, daemon=True), threading.Thread(target=gravar, daemon=True)
    tl.start(); tg.start()
    k = 0
    try:
        while True:
            if stop is not None and stop.is_set():
                raise InterruptedError("Cancelado.")
            buf = entra.get()
            if buf is None or erro:
                break
            arr = np.frombuffer(buf, dt)
            Y = arr[:tamY].reshape(H, W)
            U = arr[tamY:tamY + tamC].reshape(H // 2, W // 2)
            V = arr[tamY + tamC:].reshape(H // 2, W // 2)
            M = mats[min(k, len(mats) - 1)]
            # coordenadas de pixel no centro (+0.5): o warpAffine usa centros inteiros
            Mp, Mcp = (sh @ M @ sh_i)[:2], (sh @ (S @ M @ S_inv) @ sh_i)[:2]
            y2 = cv2.warpAffine(Y, Mp, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            u2 = cv2.warpAffine(U, Mcp, (W // 2, H // 2), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            v2 = cv2.warpAffine(V, Mcp, (W // 2, H // 2), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            sai.put((y2.tobytes(), u2.tobytes(), v2.tobytes()))
            k += 1
            if on_pct and k % 10 == 0:
                on_pct(min(99, int(k * 100 / max(1, len(mats)))))
        sai.put(None)
        tg.join()
        if erro:
            raise RuntimeError(str(erro[0]))
        pe.stdin.close()
        err = pe.stderr.read().decode("utf-8", "replace")
        rc = pe.wait()
        if rc != 0 or not os.path.isfile(tmp):
            raise RuntimeError(err.strip().splitlines()[-1] if err.strip() else "Falha ao gravar o vídeo estabilizado.")
        os.replace(tmp, saida)
        return k
    finally:
        for pr in (pd, pe):
            try:
                pr.kill()
            except Exception:
                pass
        try:
            sai.put_nowait(None)
        except Exception:
            pass
        if os.path.isfile(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


# ---------------------------------------------------------------- tudo junto (o que o app chama)
def chave(path, a, b, cfg):
    st = os.stat(path)
    txt = json.dumps([os.path.abspath(path).lower(), st.st_size, int(st.st_mtime), round(a, 3), round(b, 3), cfg], sort_keys=True)
    return hashlib.sha1(txt.encode()).hexdigest()[:12]


def estabilizar(path, a, b, cfg=None, on_pct=None, stop=None):
    """cópia estabilizada do trecho [a, b] (instante r da cópia = fonte a + r). cfg: suavidade (0..100), zoom_max
    (1.02..1.5), modo (suave|parado), rotacao, escala. Análise guardada no cache (mudar só a suavidade não analisa de
    novo). Retorna {success, path, zoom, quadros, t_analise, t_render}."""
    from Functions.video_cutter import _pasta_midia, probe
    cfg = dict(cfg or {})
    cfg.setdefault("suavidade", 50)
    cfg.setdefault("zoom_max", 1.10)
    cfg.setdefault("modo", "suave")
    cfg.setdefault("rotacao", True)
    cfg.setdefault("escala", True)
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo não encontrado."}
    info = probe(path)
    if not info.get("has_video"):
        return {"success": False, "error": "Só vídeo pode ser estabilizado."}
    if info.get("alfa"):
        return {"success": False, "error": "Vídeo com transparência ainda não é estabilizado."}
    dur = info["duration"]
    a, b = max(0.0, float(a)), min(dur, float(b)) if dur > 0 else float(b)
    if b - a < 0.2:
        return {"success": False, "error": "Trecho curto demais para estabilizar."}
    work = _pasta_midia(path)
    ch = chave(path, a, b, cfg)
    out = os.path.join(work, f"estab_{a:.3f}_{b:.3f}_{ch}.mp4")
    if os.path.isfile(out):
        try:
            zoom = json.load(open(out + ".json", encoding="utf-8")).get("zoom")
        except Exception:
            zoom = None
        return {"success": True, "path": out, "zoom": zoom}
    pct = on_pct or (lambda p: None)
    arq_an = os.path.join(work, f"estab_{a:.3f}_{b:.3f}_{chave(path, a, b, {})}.json")
    t0 = time.time()
    an = None
    if os.path.isfile(arq_an):
        try:
            an = json.load(open(arq_an, encoding="utf-8"))
        except Exception:
            an = None
    if an is None:
        an = analisar(path, a, b, on_pct=lambda p: pct(int(p * 0.45)), stop=stop)
        with open(arq_an, "w", encoding="utf-8") as f:
            json.dump(an, f)
    t1 = time.time()
    Ms, P, zoom = caminho(an, cfg["suavidade"], cfg["zoom_max"], cfg["modo"], cfg["rotacao"], cfg["escala"])
    mats = _quadros_finais(an, Ms, P, zoom)
    q = renderizar(path, an, mats, out, on_pct=lambda p: pct(45 + int(p * 0.55)), stop=stop)
    pct(100)
    try:
        with open(out + ".json", "w", encoding="utf-8") as f:
            json.dump({"zoom": round(float(zoom), 4), "quadros": q}, f)
    except OSError:
        pass
    return {"success": True, "path": out, "zoom": round(float(zoom), 4), "quadros": q,
            "t_analise": round(t1 - t0, 1), "t_render": round(time.time() - t1, 1)}
