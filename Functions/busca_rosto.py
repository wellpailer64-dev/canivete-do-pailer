"""Pessoas do projeto por rosto (pedido do Pailer, GaIA 2026-10-14: GCs sobre a pessoa errada).

Duas coisas, no mesmo índice:
  - ANALISAR o material do projeto em segundo plano → AGRUPAR os rostos em pessoas (um perfil por pessoa, com a melhor
    foto do rosto e todas as cenas em que ela aparece; o nome quem dá é o usuário, guardado no projeto);
  - BUSCAR por uma foto (ou um quadro do monitor): onde essa pessoa aparece.

Regras (o Pailer: "leve, rápido, nada competindo hardware com a edição, nunca na prioridade"):
  - vídeo: só os QUADROS-CHAVE (-skip_frame nokey: 8 min de vídeo H.265 em 6 s em vez de 59 s), no máx. 1 por segundo;
  - ffmpeg em prioridade OCIOSA do Windows, reconhecimento numa thread de prioridade ociosa com 1 núcleo do OpenCV;
  - nada na placa de vídeo; pausar(True) segura tudo (a página pausa no play, no export, no preparo e no render de Comp)
    — o ffmpeg para sozinho com o cano cheio;
  - índice por arquivo em <cache>/rostos/<hash>.npz (caminho + tamanho + data): cada arquivo é analisado uma vez só.
Modelos: YuNet (detector, o mesmo do recorte) + SFace (OpenCV Zoo, Apache-2.0, 37 MB baixado no 1º uso).
Bancada (2026-10-14, material do GaIA): mesma pessoa 0,43–0,89; outras pessoas ≤ 0,30. Limiar do SFace: 0,363.
"""
import ctypes
import hashlib
import os
import queue
import re
import subprocess
import threading
import time
import urllib.request

import numpy as np

from Functions.audio_cutter import ffmpeg_path, _creationflags

SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
LIMIAR = 0.363          # SFace (cosseno): acima disso, mesma pessoa
FORTE = 0.45
GRUPO = 0.42            # juntar um rosto a uma pessoa já vista
JUNTAR = 0.52           # duas pessoas com centros assim parecidos viram uma
PASSO = 1.0             # no máximo 1 quadro-chave por segundo
VERSAO = 3              # 3: guarda confiança, tamanho e "de frente" de cada rosto
_OCIOSA = 0x00000040    # IDLE_PRIORITY_CLASS
_EXTS_IMG = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tif", ".tiff")

_TRAVA = threading.Lock()
_MOD = {}
_JOBS = {}
_SEQ = [0]
_PAUSA = threading.Event()   # setado = pausado


def pausar(sim=True):
    """A página segura a análise enquanto a edição precisa da máquina (play, export, preparo, Comp)."""
    (_PAUSA.set if sim else _PAUSA.clear)()
    return {"success": True, "pausado": _PAUSA.is_set()}


def _esperar_vez(job=None):
    while _PAUSA.is_set() and not (job and job["cancelar"]):
        time.sleep(0.25)


def _thread_ociosa():
    try:
        k = ctypes.windll.kernel32
        k.SetThreadPriority(k.GetCurrentThread(), -15)   # THREAD_PRIORITY_IDLE
    except Exception:
        pass


def _modelos():
    """(detector, reconhecedor) — um par só, protegido pela trava (o OpenCV não é seguro entre threads)."""
    if _MOD:
        return _MOD["det"], _MOD["rec"]
    import cv2
    from Functions.recorte_pro import _yunet
    from Functions.midia import modelo_path
    _yunet()   # baixa o YuNet se faltar
    y = modelo_path("u2net", "yunet-2023mar.onnx")
    s = modelo_path("rosto", "sface-2021dec.onnx")
    if not os.path.exists(s):
        os.makedirs(os.path.dirname(s), exist_ok=True)
        urllib.request.urlretrieve(SFACE_URL, s + ".tmp")
        if os.path.getsize(s + ".tmp") < 30_000_000:
            os.remove(s + ".tmp")
            raise RuntimeError("download do modelo de rosto incompleto")
        os.replace(s + ".tmp", s)
    try:
        cv2.setNumThreads(1)   # um núcleo: a análise nunca disputa a máquina com a edição
    except Exception:
        pass
    _MOD["det"] = cv2.FaceDetectorYN.create(y, "", (320, 320), 0.7, 0.3, 5000)
    _MOD["rec"] = cv2.FaceRecognizerSF.create(s, "")
    return _MOD["det"], _MOD["rec"]


def _frente(r):
    """0..1: quanto o rosto está de frente — nariz no meio dos olhos e boca abaixo do nariz (pontos do YuNet)."""
    ex1, ey1, ex2, ey2, nx, ny, mx1, my1, mx2, my2 = [float(v) for v in r[4:14]]
    olhos = abs(ex2 - ex1)
    if olhos < 1:
        return 0.0
    meio = (ex1 + ex2) / 2
    lado = 1.0 - min(1.0, abs(nx - meio) / (olhos * 0.5))
    alt = 1.0 if (my1 + my2) / 2 > ny > (ey1 + ey2) / 2 else 0.3
    return max(0.0, lado) * alt


def _rostos(img, minimo=28):
    """[(vetor 128 normalizado, [x, y, w, h] em fração da imagem, [confiança, lado em px, de frente 0..1])] dos rostos
    com lado ≥ minimo px."""
    import cv2
    det, rec = _modelos()
    h, w = img.shape[:2]
    s = min(1.0, 960 / max(h, w))
    im = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else img
    out = []
    with _TRAVA:
        det.setInputSize((im.shape[1], im.shape[0]))
        _, f = det.detect(im)
        for r in (f if f is not None else []):
            if min(r[2], r[3]) < minimo:
                continue
            e = rec.feature(rec.alignCrop(im, r)).ravel().astype(np.float32)
            out.append((e / (np.linalg.norm(e) + 1e-9),
                        [float(r[0] / im.shape[1]), float(r[1] / im.shape[0]), float(r[2] / im.shape[1]), float(r[3] / im.shape[0])],
                        [float(r[-1]), float(min(r[2], r[3])), _frente(r)]))
    return out


def _qualidade(info):
    """Nota para escolher a foto do perfil: nítido, grande e de frente."""
    conf, lado, frente = info[..., 0], info[..., 1], info[..., 2]
    return conf * np.minimum(lado, 160) * (0.15 + frente)


def _bom_para_agrupar(info):
    """Rostos que formam pessoas: confiantes, não minúsculos e não de costas/perfil total (esses só entram na busca)."""
    return (info[..., 0] >= 0.8) & (info[..., 1] >= 34) & (info[..., 2] >= 0.3)


def _ler_imagem(caminho):
    import cv2
    try:
        from PIL import Image, ImageOps
        im = Image.open(caminho)
        if im.getexif().get(0x0112, 1) != 1 or os.path.splitext(caminho)[1].lower() == ".heic":
            return np.array(ImageOps.exif_transpose(im).convert("RGB"))[:, :, ::-1].copy()
    except Exception:
        pass
    img = cv2.imdecode(np.fromfile(caminho, np.uint8), cv2.IMREAD_COLOR)
    return img


def _quadros_video(caminho, t0=None, dur=None, todos=False, job=None):
    """Gera (t, imagem BGR): quadros-chave (no máx. 1 por segundo) — ou, com todos=True, 1 quadro por segundo.
    ffmpeg em prioridade ociosa → JPEGs pelo cano; o tempo de cada quadro vem do showinfo (stderr)."""
    import cv2
    # 1 thread no decodificador, nos filtros e no JPEG: sem isso o ffmpeg ocupa todos os núcleos livres (prioridade
    # ociosa cede a vez, mas o medidor de CPU batia 100% e a ventoinha subia — o Pailer reclamou com razão)
    cmd = [ffmpeg_path(), "-hide_banner", "-nostats", "-threads", "1", "-filter_threads", "1"]
    if not todos:
        cmd += ["-skip_frame", "nokey"]
    if t0:
        cmd += ["-ss", f"{t0:.3f}"]
    cmd += ["-i", caminho]
    if dur:
        cmd += ["-t", f"{dur:.3f}"]
    sel = f"fps=1/{PASSO}" if todos else f"select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,{PASSO})'"
    cmd += ["-an", "-sn", "-vf", sel + ",showinfo,scale='if(gt(iw,ih),min(960,iw),-2)':'if(gt(iw,ih),-2,min(960,ih))'",
            "-fps_mode", "passthrough", "-threads", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "5", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=_creationflags() | _OCIOSA)
    tempos = queue.Queue()
    padrao = re.compile(rb"pts_time:\s*(-?[\d.]+)")

    def _ler_err():
        for linha in p.stderr:
            m = padrao.search(linha)
            if m:
                tempos.put(float(m.group(1)))
    threading.Thread(target=_ler_err, daemon=True).start()
    buf, n = b"", 0
    try:
        while True:
            _esperar_vez(job)   # pausado: não lê o cano e o ffmpeg para sozinho
            if job and job["cancelar"]:
                break
            pedaco = p.stdout.read(1 << 16)
            if not pedaco:
                break
            buf += pedaco
            while True:
                a = buf.find(b"\xff\xd8")
                b = buf.find(b"\xff\xd9", a + 2) if a >= 0 else -1
                if a < 0 or b < 0:
                    break
                img = cv2.imdecode(np.frombuffer(buf[a:b + 2], np.uint8), cv2.IMREAD_COLOR)
                buf = buf[b + 2:]
                try:
                    t = tempos.get(timeout=2.0) + (t0 or 0)
                except queue.Empty:
                    t = (t0 or 0) + n * PASSO
                n += 1
                if img is not None:
                    yield t, img
    finally:
        try:
            p.kill()
        except Exception:
            pass


def _chave(caminho):
    st = os.stat(caminho)
    return hashlib.sha1(f"{VERSAO}|{os.path.abspath(caminho).lower()}|{st.st_size}|{int(st.st_mtime)}".encode("utf-8")).hexdigest()[:20]


def _arq_indice(caminho, cache):
    return os.path.join(cache, "rostos", _chave(caminho) + ".npz")


def _indice(caminho, tipo, cache, job=None, so_cache=False):
    """Rostos do arquivo: (tempos[N], caixas[N,4], vetores[N,128], qualidade[N]). Lê do cache ou analisa e guarda."""
    arq = _arq_indice(caminho, cache)
    if os.path.exists(arq):
        try:
            z = np.load(arq)
            return z["t"], z["b"], z["e"], z["q"]
        except Exception:
            pass
    if so_cache:
        return None
    os.makedirs(os.path.dirname(arq), exist_ok=True)
    ts, bs, es, qs = [], [], [], []
    fontes = [(0.0, _ler_imagem(caminho))] if tipo == "image" else _quadros_video(caminho, job=job)
    for t, img in fontes:
        _esperar_vez(job)
        if job and job["cancelar"]:
            return None
        if img is None:
            continue
        t_ini = time.perf_counter()
        for e, b, q in _rostos(img):
            ts.append(t); bs.append(b); es.append(e); qs.append(q)
        if job:   # folga: no máximo ~60% de UM núcleo para o reconhecimento
            time.sleep(min(0.5, (time.perf_counter() - t_ini) * 0.7))
    t = np.array(ts, np.float32); b = np.array(bs, np.float32).reshape(-1, 4)
    e = np.array(es, np.float32).reshape(-1, 128); q = np.array(qs, np.float32).reshape(-1, 3)
    np.savez_compressed(arq + ".tmp.npz", t=t, b=b, e=e, q=q)
    os.replace(arq + ".tmp.npz", arq)
    return t, b, e, q


# ─────────────────────────── referência e busca por foto ───────────────────────────
def _img_ref(caminho, t=None, chave=False):
    """Imagem da foto, ou o quadro t do vídeo. chave=True: o QUADRO-CHAVE em t, lido do mesmo jeito que a análise —
    a busca exata por tempo devolvia outro quadro em vídeo de iPhone (o homem já tinha andado) e a foto do perfil e as
    miniaturas recortavam o lugar errado (uma ferramenta em vez do rosto)."""
    if t is not None and os.path.splitext(caminho)[1].lower() not in _EXTS_IMG:
        if chave:
            for tt, im in _quadros_video(caminho, t0=max(0.0, float(t) - 0.05), dur=3.0):
                if tt >= float(t) - 0.1:
                    return im
        return next((im for _t, im in _quadros_video(caminho, t0=max(0.0, float(t)), dur=0.9, todos=True)), None)
    return _ler_imagem(caminho)


def referencia(caminho, t=None):
    """Rostos da referência (foto ou quadro t de um vídeo), o maior primeiro; guarda os vetores em '_vetores'."""
    img = _img_ref(caminho, t)
    if img is None:
        return {"success": False, "error": "não abriu a imagem de referência"}
    rs = _rostos(img, minimo=20)
    if not rs:
        return {"success": False, "error": "nenhum rosto encontrado na referência"}
    rs.sort(key=lambda r: -(r[1][2] * r[1][3]))
    return {"success": True, "rostos": [{"caixa": r[1]} for r in rs], "_vetores": [r[0] for r in rs]}


def _vao(t_todos):
    """Distância normal entre quadros analisados no arquivo (câmera com quadro-chave a cada 8 s ≠ celular a cada 1 s):
    dois quadros seguidos com a pessoa, até 1,6× esse vão, são o MESMO trecho."""
    u = np.unique(np.asarray(t_todos, np.float32))
    if len(u) < 3:
        return 4.0
    return float(min(14.0, max(4.0, np.median(np.diff(u)) * 1.6)))


def _trechos(t, s, b, limiar, dur_max=None, vao=4.0):
    """Tempos com rosto parecido → trechos [ini, fim] juntando quadros próximos (até 'vao' segundos)."""
    out = []
    for i in np.argsort(t):
        if s[i] < limiar:
            continue
        ti, si = float(t[i]), float(s[i])
        if out and ti - out[-1]["fim"] <= vao:
            o = out[-1]; o["fim"] = ti
            if si > o["nota"]:
                o["nota"], o["melhor"], o["caixa"] = si, ti, [float(x) for x in b[i]]
        else:
            out.append({"ini": ti, "fim": ti, "nota": si, "melhor": ti, "caixa": [float(x) for x in b[i]]})
    for o in out:
        o["fim"] = o["fim"] + PASSO if dur_max is None else min(dur_max, o["fim"] + PASSO)
        o["nota"] = round(o["nota"], 3)
    return out


def _ocorrencias(alvo, midias, cache, limiar, job=None, so_cache=False):
    res = []
    for m in midias:
        ind = _indice(m["path"], m.get("kind"), cache, job=job, so_cache=so_cache)
        if ind is None or not len(ind[0]):
            continue
        t, b, e, _q = ind
        tr = _trechos(t, e @ alvo, b, limiar, m.get("dur"), _vao(t))
        if tr:
            res.append({"id": m.get("id"), "path": m["path"], "kind": m.get("kind"), "nota": max(x["nota"] for x in tr), "trechos": tr})
    res.sort(key=lambda r: -r["nota"])
    return res


# ─────────────────────────── trabalhos em segundo plano ───────────────────────────
def _novo_job(tipo, **kw):
    with _TRAVA:
        _SEQ[0] += 1
        jid = _SEQ[0]
    j = {"id": jid, "tipo": tipo, "fase": "iniciando", "feitos": 0, "total": 0, "atual": None, "resultados": [],
         "pessoas": None, "falhas": [], "erro": None, "cancelar": False, "inicio": time.time(), "fim": None, **kw}
    _JOBS[jid] = j
    return j


def _midias_ok(midias):
    return [m for m in (midias or []) if m.get("path") and os.path.exists(m["path"]) and m.get("kind") in ("video", "image")]


def _rodar_analise(j):
    """Analisa o que falta (mais leves primeiro: fotos, depois vídeos curtos) e no fim agrupa as pessoas."""
    _thread_ociosa()
    try:
        j["fase"] = "modelo"
        _modelos()
        ms = j["midias"]
        falta = [m for m in ms if not os.path.exists(_arq_indice(m["path"], j["cache"]))]
        falta.sort(key=lambda m: (m.get("kind") != "image", m.get("dur") or 0))
        j["total"], j["feitos"] = len(ms), len(ms) - len(falta)
        j["fase"] = "analisando"
        for m in falta:
            if j["cancelar"]:
                j["fase"] = "cancelado"; return
            j["atual"] = os.path.basename(m["path"])
            try:
                if _indice(m["path"], m.get("kind"), j["cache"], job=j) is None and j["cancelar"]:
                    j["fase"] = "cancelado"; return
            except Exception as e:
                j["falhas"].append(f"{os.path.basename(m['path'])}: {e}")
            j["feitos"] += 1
        j["atual"] = None
        if j.get("ref"):
            j["fase"] = "procurando"
            ref = referencia(j["ref"], j.get("ref_t"))
            if not ref["success"]:
                raise RuntimeError(ref["error"])
            alvo = ref["_vetores"][min(int(j.get("rosto") or 0), len(ref["_vetores"]) - 1)]
            j["ref_rostos"] = ref["rostos"]
            j["resultados"] = _ocorrencias(alvo, ms, j["cache"], j["limiar"], so_cache=True)
        else:
            j["fase"] = "agrupando"
            j["pessoas"] = agrupar(ms, j["cache"], j.get("nomes"))
        j["fase"] = "pronto"
    except Exception as e:
        j["fase"], j["erro"] = "erro", str(e)
    finally:
        j["fim"] = time.time()


def analisar(midias, cache, nomes=None):
    """Analisa o projeto em segundo plano (pausável) e agrupa as pessoas. nomes: [{nome, c:[128]}] do projeto."""
    ms = _midias_ok(midias)
    j = _novo_job("analise", midias=ms, cache=cache, nomes=nomes or [])
    j["total"] = len(ms)
    threading.Thread(target=_rodar_analise, args=(j,), daemon=True).start()
    return {"success": True, "id": j["id"], "total": len(ms)}


def buscar(ref, midias, cache, ref_t=None, rosto=0, limiar=LIMIAR):
    """Busca por uma foto/quadro: analisa o que faltar (mesmas regras) e procura essa pessoa."""
    if not ref or not os.path.exists(ref):
        return {"success": False, "error": "referência não encontrada"}
    ms = _midias_ok(midias)
    j = _novo_job("busca", midias=ms, cache=cache, ref=ref, ref_t=ref_t, rosto=rosto, limiar=float(limiar))
    j["total"] = len(ms)
    threading.Thread(target=_rodar_analise, args=(j,), daemon=True).start()
    return {"success": True, "id": j["id"], "total": len(ms)}


def estado(jid):
    j = _JOBS.get(int(jid))
    if not j:
        return {"success": False, "error": "trabalho não encontrado"}
    return {"success": True, "pausado": _PAUSA.is_set(), **{k: v for k, v in j.items() if k not in ("midias", "cancelar", "cache", "nomes")}}


def cancelar(jid):
    j = _JOBS.get(int(jid))
    if j:
        j["cancelar"] = True
    return {"success": bool(j)}


# ─────────────────────────── agrupar em pessoas ───────────────────────────
def agrupar(midias, cache, nomes=None, minimo=3):
    """Rostos de todo o material (só o que já está no índice) → pessoas.
    Cada rosto entra na pessoa de centro mais parecido (≥ GRUPO), do mais nítido para o menos; centros parecidos
    (≥ JUNTAR) viram uma pessoa só. Fica quem aparece em ≥ 'minimo' quadros. O nome vem do projeto (centro ≥ 0,5)."""
    ms = _midias_ok(midias)
    E, Q, ORIG, VAO, BOA = [], [], [], {}, []
    for k, m in enumerate(ms):
        ind = _indice(m["path"], m.get("kind"), cache, so_cache=True)
        if ind is None or not len(ind[0]):
            continue
        t, b, e, q = ind
        bons = _bom_para_agrupar(q)
        nota = _qualidade(q)
        VAO[k] = _vao(t)
        for i in np.nonzero(bons)[0]:
            E.append(e[i]); Q.append(nota[i]); ORIG.append((k, float(t[i]), [float(x) for x in b[i]]))
            BOA.append(bool(q[i, 1] >= 60 and q[i, 2] >= 0.55 and q[i, 0] >= 0.88))   # bom para foto de perfil
    if not E:
        return []
    E = np.array(E, np.float32); Q = np.array(Q, np.float32)
    ordem = np.argsort(-Q)
    somas, membros = [], []
    for i in ordem:
        if somas:
            C = np.array(somas); C = C / np.linalg.norm(C, axis=1, keepdims=True)
            s = C @ E[i]; k = int(np.argmax(s))
            if s[k] >= GRUPO:
                somas[k] = somas[k] + E[i]; membros[k].append(int(i)); continue
        somas.append(E[i].copy()); membros.append([int(i)])
    # juntar pessoas duplicadas (mesma pessoa de lado / luz diferente)
    mudou = True
    while mudou and len(somas) > 1:
        mudou = False
        C = np.array(somas); C = C / np.linalg.norm(C, axis=1, keepdims=True)
        S = C @ C.T; np.fill_diagonal(S, -1)
        a, b = np.unravel_index(int(np.argmax(S)), S.shape)
        if S[a, b] >= JUNTAR:
            somas[a] = somas[a] + somas[b]; membros[a] += membros[b]
            del somas[b]; del membros[b]; mudou = True
    salvos = [(n.get("nome") or "", np.array(n["c"], np.float32)) for n in (nomes or []) if n.get("c") and len(n["c"]) == 128]
    pessoas = []
    for soma, mem in zip(somas, membros):
        if len(mem) < minimo:
            continue
        c = soma / np.linalg.norm(soma)
        # foto do perfil: o rosto grande, nítido e bem de frente (se houver), senão o de melhor nota
        boas = [i for i in mem if BOA[i]]
        melhor = max(boas or mem, key=lambda i: Q[i])
        k, tb, cx = ORIG[melhor]
        por_arq = {}
        for i in mem:
            kk, ti, bx = ORIG[i]
            por_arq.setdefault(kk, []).append((ti, float(E[i] @ c), bx))
        ocorr = []
        for kk, lst in por_arq.items():
            m = ms[kk]
            t = np.array([x[0] for x in lst], np.float32); s = np.array([x[1] for x in lst], np.float32)
            bb = np.array([x[2] for x in lst], np.float32)
            tr = _trechos(t, np.maximum(s, LIMIAR), bb, LIMIAR, m.get("dur"), VAO.get(kk, 4.0))
            ocorr.append({"id": m.get("id"), "path": m["path"], "kind": m.get("kind"), "nota": max(x["nota"] for x in tr), "trechos": tr})
        ocorr.sort(key=lambda o: (o["kind"] != "video", -len(o["trechos"])))
        nome, ns = "", 0.0
        for n, v in salvos:
            sv = float(v @ c)
            if sv >= 0.5 and sv > ns:
                nome, ns = n, sv
        if not nome and sum(len(o["trechos"]) for o in ocorr) < 3:
            continue   # aparece em 1–2 cenas: ruído (rosto de passagem, objeto confundido com rosto); a busca ainda acha
        pessoas.append({"chave": hashlib.sha1(np.round(c, 2).tobytes()).hexdigest()[:10], "nome": nome, "n": len(mem),
                        "arquivos": len(ocorr), "cenas": sum(len(o["trechos"]) for o in ocorr),
                        "foto": {"path": ms[k]["path"], "t": tb, "caixa": cx}, "c": [round(float(x), 4) for x in c],
                        "ocorrencias": ocorr})
    pessoas.sort(key=lambda p: (not p["nome"], -p["cenas"]))
    return pessoas


def quem_e(ref, pessoas, t=None):
    """Foto/quadro → pessoa do agrupamento mais parecida (para 'quem é este?')."""
    r = referencia(ref, t)
    if not r["success"]:
        return r
    v = r["_vetores"][0]
    melhor = max(((float(np.array(p["c"], np.float32) @ v), p.get("chave")) for p in pessoas or [] if p.get("c")), default=(0, None))
    return {"success": True, "chave": melhor[1] if melhor[0] >= LIMIAR else None, "nota": round(melhor[0], 3)}


# ─────────────────────────── miniaturas ───────────────────────────
def miniatura(caminho, t, cache, caixa=None, lado=360):
    """JPEG pequeno do quadro t; com 'caixa' recorta o ROSTO (quadrado com folga) para a foto do perfil."""
    pasta = os.path.join(cache, "rostos", "mini")
    os.makedirs(pasta, exist_ok=True)
    h = hashlib.sha1(f"2|{caminho}|{t:.2f}|{caixa}|{lado}".encode("utf-8")).hexdigest()[:16]   # 2: lida no quadro-chave
    arq = os.path.join(pasta, h + ".jpg")
    if os.path.exists(arq):
        return arq
    import cv2
    img = _img_ref(caminho, t, chave=True)   # o tempo veio da análise (quadro-chave)
    if img is None:
        return None
    H, W = img.shape[:2]
    if caixa:
        x, y, w, hh = caixa[0] * W, caixa[1] * H, caixa[2] * W, caixa[3] * H
        lado_q = max(w, hh) * 1.9
        cx, cy = x + w / 2, y + hh / 2 - hh * 0.08
        x0, y0 = int(max(0, cx - lado_q / 2)), int(max(0, cy - lado_q / 2))
        x1, y1 = int(min(W, cx + lado_q / 2)), int(min(H, cy + lado_q / 2))
        img = img[y0:y1, x0:x1]
        H, W = img.shape[:2]
    s = lado / max(H, W)
    img = cv2.resize(img, (max(1, int(W * s)), max(1, int(H * s))), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 84])[1].tofile(arq)
    return arq


# ─────────────────────────── revisor: GC sobre a pessoa certa? ───────────────────────────
def revisar_gc(itens, cache, nomes):
    """itens: [{gc, path, kind, t0, t1}] (o nome do GC e a cena embaixo dele, em tempo da fonte).
    nomes: [{nome, c}] do projeto. Para cada GC: quem aparece na cena (entre as pessoas com nome) e se bate com o GC.
    Só olha o que já está no índice (não analisa nada aqui). estado: 'ok' | 'outra' | 'ninguem' | 'sem_indice'."""
    salvos = [(n.get("nome") or "", np.array(n["c"], np.float32)) for n in (nomes or []) if n.get("nome") and n.get("c") and len(n["c"]) == 128]
    out = []
    for it in itens or []:
        r = {"gc": it.get("gc"), "estado": "sem_indice", "vista": None, "nota": 0.0}
        try:
            ind = _indice(it["path"], it.get("kind"), cache, so_cache=True) if it.get("path") and os.path.exists(it["path"]) else None
        except Exception:
            ind = None
        if ind is not None:
            t, _b, e, _q = ind
            if it.get("kind") == "image":
                sel = np.ones(len(t), bool)
            else:
                vao = _vao(t) / 1.6
                sel = (t >= float(it["t0"]) - vao) & (t <= float(it["t1"]) + 0.5)
            r["estado"] = "ninguem"
            if sel.any() and salvos:
                notas = [(float(np.max(e[sel] @ v)), nome) for nome, v in salvos]
                dele = [x for x in notas if _mesmo_nome(it.get("gc"), x[1])]
                outra = max((x for x in notas if not _mesmo_nome(it.get("gc"), x[1])), default=(0.0, None))
                if dele and max(dele)[0] >= LIMIAR:            # a pessoa do GC está na cena: confirma com o limiar normal
                    r["estado"], r["nota"], r["vista"] = "ok", round(max(dele)[0], 3), max(dele)[1]
                elif outra[0] >= FORTE:                         # outra pessoa com nome, e com certeza: avisa
                    r["estado"], r["nota"], r["vista"] = "outra", round(outra[0], 3), outra[1]
        out.append(r)
    return out


def _mesmo_nome(a, b):
    import unicodedata
    def toks(s):
        s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
        return {w for w in re.split(r"[^a-z]+", s) if len(w) >= 4 and w not in ("prof", "dona", "senhor", "senhora")}
    return bool(toks(a) & toks(b))


def rostos_no_trecho(itens, cache):
    """itens: [{path, kind, t0, t1}] → para cada um, as caixas [x, y, w, h] (fração da mídia) dos rostos nítidos no
    trecho (só o que já está no índice). Para o revisor: texto ou GC em cima de um rosto."""
    out = []
    for it in itens or []:
        caixas = []
        try:
            ind = _indice(it["path"], it.get("kind"), cache, so_cache=True) if os.path.exists(it.get("path") or "") else None
        except Exception:
            ind = None
        if ind is not None and len(ind[0]):
            t, b, _e, q = ind
            sel = np.ones(len(t), bool) if it.get("kind") == "image" else (t >= float(it["t0"]) - 0.5) & (t <= float(it["t1"]) + 0.5)
            sel &= (q[:, 0] >= 0.8) & (q[:, 1] >= 34)
            caixas = [[round(float(x), 4) for x in b[i]] for i in np.nonzero(sel)[0]]
        out.append(caixas)
    return out
