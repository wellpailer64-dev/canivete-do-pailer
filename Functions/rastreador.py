"""rastreador.py — Rastrear movimento do Vídeo Kanivete (o Tracker do After Effects).

Uma caixa no vídeo (centro, largura, altura em px da mídia) é seguida quadro a quadro, para frente ou para trás:
1. pontos dentro da caixa seguidos com LK (ida e volta, só os que voltam ao lugar); posição pela mediana do
   deslocamento ("pos") ou semelhança por RANSAC ("rot": posição + giro, "esc": posição + giro + escala);
2. com poucos pontos (parede lisa, desfoque de movimento), procura o MODELO (a caixa do 1º quadro, girada/escalada
   como está agora) na área de busca, com ajuste subpixel;
3. contra a deriva: a cada quadro o modelo é conferido perto do ponto achado e, se bater bem (correlação alta), puxa
   a posição para ele.
Saída: um item por quadro [t (fonte), x, y, escala, giro (graus), confiança 0..1]. Leve: só cinza, ≤ 1920 px de
largura, sem IA.
"""
import math

import numpy as np
import cv2

LARG_MAX = 1920
LK = dict(winSize=(21, 21), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))


def _ff():
    from Functions.video_cutter import ffmpeg_path
    return ffmpeg_path()


def _flags():
    from Functions.video_cutter import _creationflags
    return _creationflags()


def _ler(path, a, n, taxa, larg, alt):
    """n quadros em cinza a partir do instante a (na taxa cravada)"""
    import subprocess
    from Functions.video_cutter import _tempo_ffmpeg
    cmd = [_ff(), "-v", "error", "-nostdin", "-ss", _tempo_ffmpeg(max(0.0, a)), "-i", path, "-an", "-frames:v", str(n),
           "-vf", f"fps={taxa:.6f},scale={larg}:{alt}:flags=bicubic,format=gray", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=_flags())
    tam = larg * alt
    try:
        while True:
            buf = p.stdout.read(tam)
            if len(buf) < tam:
                break
            yield np.frombuffer(buf, np.uint8).reshape(alt, larg)
    finally:
        p.stdout.close()
        p.kill()
        p.wait()


def _quadros(path, t0, t1, taxa, larg, alt, bloco=48):
    """(t, quadro) de t0 até t1 (inclusive), para frente ou para trás (para trás: lê blocos e devolve ao contrário)"""
    dt = 1.0 / taxa
    n = int(round(abs(t1 - t0) * taxa)) + 1
    if t1 >= t0:
        for k, g in enumerate(_ler(path, t0, n, taxa, larg, alt)):
            yield t0 + k * dt, g
        return
    feitos = 0
    while feitos < n:
        m = min(bloco, n - feitos)
        ini = t0 - (feitos + m - 1) * dt   # o bloco termina no quadro t0 - feitos·dt
        fr = list(_ler(path, ini, m, taxa, larg, alt))
        for j in range(len(fr) - 1, -1, -1):
            yield ini + j * dt, fr[j]
        feitos += m
        if len(fr) < m:
            break


def _modelo(ref, ref_c, w, h, s, a):
    """recorte do quadro de referência em volta de ref_c, girado/escalado para parecer com o objeto agora"""
    M = cv2.getRotationMatrix2D((float(ref_c[0]), float(ref_c[1])), -math.degrees(a), s)
    M[:, 2] += np.array([w * s / 2, h * s / 2]) - ref_c   # centro do objeto vai para o meio do recorte
    ww, hh = max(8, int(round(w * s))), max(8, int(round(h * s)))
    return cv2.warpAffine(ref, M, (ww, hh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def _casar(g, tpl, c, raio):
    """procura tpl em g perto de c (± raio px) → (centro subpixel, correlação)"""
    th, tw = tpl.shape
    x0, y0 = int(round(c[0] - tw / 2 - raio)), int(round(c[1] - th / 2 - raio))
    x1, y1 = x0 + tw + 2 * raio, y0 + th + 2 * raio
    H, W = g.shape
    if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
        xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        if xb - xa < tw + 2 or yb - ya < th + 2:
            return None, 0.0
        x0, y0, x1, y1 = xa, ya, xb, yb
    r = cv2.matchTemplate(g[y0:y1, x0:x1], tpl, cv2.TM_CCOEFF_NORMED)
    _, mx, _, (px, py) = cv2.minMaxLoc(r)

    def sub(v, i, n, eixo):
        if 0 < i < n - 1:
            a_, b_, c_ = (r[py, i - 1], r[py, i], r[py, i + 1]) if eixo == 0 else (r[i - 1, px], r[i, px], r[i + 1, px])
            d = a_ - 2 * b_ + c_
            if abs(d) > 1e-9:
                return v + 0.5 * (a_ - c_) / d
        return v
    sx = sub(px, px, r.shape[1], 0)
    sy = sub(py, py, r.shape[0], 1)
    return np.array([x0 + sx + tw / 2, y0 + sy + th / 2]), float(mx)


def rastrear(path, t0, t1, caixa, modo="pos", taxa=None, on_quadro=None, stop=None, busca=None):
    """caixa = [cx, cy, w, h] em px da mídia no instante t0. modo: pos | rot | esc. busca = raio da área de busca em px
    da mídia (padrão: maior lado da caixa). on_quadro(item) a cada quadro (para o monitor mostrar ao vivo).
    Devolve a lista de itens [t, x, y, escala, giro°, conf]."""
    from Functions.video_cutter import probe
    info = probe(path)
    W, H = max(2, info["width"] or 1920), max(2, info["height"] or 1080)
    taxa = float(taxa or info.get("fps_timeline") or 30.0)
    larg = min(LARG_MAX, W)
    alt = int(round(H * larg / W / 2)) * 2
    k = larg / W   # mídia → análise
    c = np.array([caixa[0] * k, caixa[1] * k], float)
    w, h = max(8.0, caixa[2] * k), max(8.0, caixa[3] * k)
    raio = int(max(16, (busca * k) if busca else max(w, h)))
    s, a = 1.0, 0.0
    v = np.zeros(2)   # velocidade (px/quadro) para prever onde procurar
    ref = ref_c = rp = None
    s_ref, a_ref, falhas = 1.0, 0.0, 0   # escala/giro do quadro de referência; quadros seguidos sem casar com ele
    ant = None
    out = []

    def pontos_ref(img, cc):
        x0, y0 = int(max(0, cc[0] - w * s / 2)), int(max(0, cc[1] - h * s / 2))
        x1, y1 = int(min(larg, cc[0] + w * s / 2)), int(min(alt, cc[1] + h * s / 2))
        if x1 - x0 < 6 or y1 - y0 < 6:
            return None
        p = cv2.goodFeaturesToTrack(img[y0:y1, x0:x1], 150, 0.01, 3)
        return None if p is None or len(p) < 6 else (p.reshape(-1, 2) + (x0, y0)).astype(np.float32)
    for t, g in _quadros(path, t0, t1, taxa, larg, alt):
        if stop is not None and stop.is_set():
            raise InterruptedError("Cancelado.")
        conf = 1.0
        if ant is None:
            ref, ref_c = g.copy(), c.copy()
            rp = pontos_ref(ref, ref_c)
        else:
            novo = None
            # 1) pontos dentro da caixa (girada/escalada como está agora → usamos o retângulo envolvente)
            ww, hh = w * s, h * s
            x0, y0 = int(max(0, c[0] - ww / 2)), int(max(0, c[1] - hh / 2))
            x1, y1 = int(min(larg, c[0] + ww / 2)), int(min(alt, c[1] + hh / 2))
            pts = None
            if x1 - x0 > 6 and y1 - y0 > 6:
                pts = cv2.goodFeaturesToTrack(ant[y0:y1, x0:x1], 120, 0.01, 3)
            if pts is not None and len(pts) >= 6:
                p0 = (pts.reshape(-1, 2) + (x0, y0)).astype(np.float32)
                p1, st, _ = cv2.calcOpticalFlowPyrLK(ant, g, p0.reshape(-1, 1, 2), (p0 + v).reshape(-1, 1, 2).astype(np.float32),
                                                     flags=cv2.OPTFLOW_USE_INITIAL_FLOW, **LK)
                pv, st2, _ = cv2.calcOpticalFlowPyrLK(g, ant, p1, None, **LK)
                p1 = p1.reshape(-1, 2)
                bom = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm(pv.reshape(-1, 2) - p0, axis=1) < 0.5)
                if bom.sum() >= 5:
                    A, B = p0[bom], p1[bom]
                    if modo == "pos":
                        d = B - A
                        med = np.median(d, 0)
                        inl = np.linalg.norm(d - med, axis=1) < 1.5
                        if inl.sum() >= 4:
                            novo = c + d[inl].mean(0)
                            conf = float(inl.mean())
                    else:
                        M, inl = cv2.estimateAffinePartial2D(A, B, method=cv2.RANSAC, ransacReprojThreshold=1.0)
                        if M is not None and inl.sum() >= 4:
                            novo = M[:, :2] @ c + M[:, 2]
                            da = math.atan2(M[1, 0], M[0, 0])
                            ds = math.hypot(M[0, 0], M[1, 0])
                            a += da
                            if modo == "esc":
                                s *= ds
                            conf = float(inl.mean())
            # 1b) ancorado: os pontos do quadro de REFERÊNCIA direto no atual (sem somar erro quadro a quadro), partindo
            # da estimativa de agora; se casar, manda. Muitos quadros sem casar (o objeto mudou de cara) = nova referência.
            ancorou = False
            if rp is not None:
                est = novo if novo is not None else c + v
                ds_, da_ = s / s_ref, a - a_ref
                R_ = ds_ * np.array([[math.cos(da_), -math.sin(da_)], [math.sin(da_), math.cos(da_)]])
                guess = ((rp - ref_c) @ R_.T + est).astype(np.float32)
                q1, st, _ = cv2.calcOpticalFlowPyrLK(ref, g, rp.reshape(-1, 1, 2), guess.reshape(-1, 1, 2),
                                                     flags=cv2.OPTFLOW_USE_INITIAL_FLOW, winSize=(21, 21), maxLevel=2,
                                                     criteria=LK["criteria"])
                qv, st2, _ = cv2.calcOpticalFlowPyrLK(g, ref, q1, None, winSize=(21, 21), maxLevel=2, criteria=LK["criteria"])
                q1 = q1.reshape(-1, 2)
                bom = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm(qv.reshape(-1, 2) - rp, axis=1) < 0.5) \
                    & (np.linalg.norm(q1 - guess, axis=1) < max(4.0, 0.15 * max(w, h) * s))
                if bom.sum() >= max(6, 0.35 * len(rp)):
                    A, B = rp[bom], q1[bom]
                    if modo == "pos":
                        d = B - A
                        med = np.median(d, 0)
                        inl = np.linalg.norm(d - med, axis=1) < 1.0
                        if inl.sum() >= 5:
                            novo, ancorou = ref_c + d[inl].mean(0), True
                            conf = float(bom.mean())
                    else:
                        M, inl = cv2.estimateAffinePartial2D(A, B, method=cv2.RANSAC, ransacReprojThreshold=0.8)
                        if M is not None and inl.sum() >= 5:
                            novo, ancorou = M[:, :2] @ ref_c + M[:, 2], True
                            a = a_ref + math.atan2(M[1, 0], M[0, 0])
                            if modo == "esc":
                                s = s_ref * math.hypot(M[0, 0], M[1, 0])
                            conf = float(inl.mean())
                falhas = 0 if ancorou else falhas + 1
                if falhas >= 3 and novo is not None and conf > 0.4:   # nova referência no quadro de agora
                    nrp = pontos_ref(g, novo)
                    if nrp is not None:
                        ref, ref_c, rp, s_ref, a_ref, falhas = g.copy(), novo.copy(), nrp, s, a, 0
            # 2) sem pontos bons: procura o modelo
            tpl = _modelo(ref, ref_c, w * s_ref, h * s_ref, s / s_ref, a - a_ref)
            if novo is None:
                achou, cc = _casar(g, tpl, c + v, raio)
                if achou is not None and cc > 0.5:
                    novo, conf = achou, cc * 0.8
                else:
                    novo, conf = c + v, 0.0   # perdeu: segue a última velocidade
            elif not ancorou:
                # 3) contra a deriva: o modelo perto do ponto achado
                achou, cc = _casar(g, tpl, novo, 4)
                if achou is not None and cc > 0.92 and np.linalg.norm(achou - novo) < 3:
                    novo = novo + (achou - novo) * 0.5
            v = 0.7 * v + 0.3 * (novo - c) if conf > 0 else v
            c = novo
        item = [round(t, 6), round(float(c[0] / k), 3), round(float(c[1] / k), 3), round(s, 5), round(math.degrees(a), 4), round(conf, 3)]
        out.append(item)
        if on_quadro:
            on_quadro(item)
        ant = g
    return out
