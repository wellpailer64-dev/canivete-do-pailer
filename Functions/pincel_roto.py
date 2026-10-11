"""
pincel_roto.py — Pincel Roto do Editor Kanivete (o Roto Brush do After Effects): recorta uma pessoa/objeto do vídeo a
partir de traços num quadro-base e segue sozinho pelos outros quadros.

Motor: SAM 2.1 Hiera-Tiny de vídeo em ONNX (square-zero-labs/sam2.1-tiny-video-onnx, Apache-2.0, 182 MB, baixado no
1º uso, revisão fixa), no onnxruntime-DirectML (qualquer placa DX12) ou na CPU. O SAM 2 guarda uma "memória" dos
quadros já vistos: cada quadro novo é lido com ela (memory_attention) e vira memória para o próximo.

Como no After:
- traço verde (soma) / Alt vermelho (tira) num quadro → quadro-base; os traços viram poucos pontos (muitos pontos
  confundem o modelo: medido em D:/kanivete_testes/recorte_video/sam_teste);
- o quadro-base propaga para frente e para trás até o quadro-base vizinho; corrigir um quadro = novo quadro-base,
  que refaz só o trecho entre os vizinhos (o vizinho entra no banco de memória como segundo quadro-base);
- Refinar borda: limpa ilhas, desloca/suaviza o contorno, filtro guiado na faixa da borda (cabelo, dedos), contraste,
  pena e "reduzir tremido" (mistura com o quadro anterior só na faixa da borda).

Pasta do trabalho (<cache de render>/Roto/<rid>): info.json, quadros/f_NNNNN.jpg (quadros do trecho), m/ (probabilidade
1024² do modelo), base/ (memória de cada quadro-base), a/ (alfa refinado, resolução cheia) e p/ (alfa da prévia, metade).
A exportação monta um .mov ProRes 4444 com alfa (video_alfa) e entra na timeline como vídeo transparente (CPU e placa).
Medido (RTX 3050, 1080p): 0,56 s/quadro (codificador 0,20 + memória 0,25); refinar ~0,1 s/quadro.
"""
import hashlib
import json
import os
import shutil
import subprocess
import threading
import time
import urllib.request

import cv2
import numpy as np

REV = "3b2984dd865f6e9d2cc6aed0be6a5a5c2eb352ce"
URL = f"https://huggingface.co/square-zero-labs/sam2.1-tiny-video-onnx/resolve/{REV}/"
ARQUIVOS = {   # caminho no repositório → (bytes, md5)
    "constants.json": (9922, "12ba2b2388e7c13946118b2a36d5b318"),
    "onnx/vision_encoder.onnx": (134335567, "9e4617cbed9bf254a47f64cdb580fef0"),
    "onnx/memory_attention.onnx": (32259165, "d1815c2acf5d8c9604ef955cbfd3e5e7"),
    "onnx/mask_decoder.onnx": (17794355, "612436e7862c16bee55dd88c1208ae67"),
    "onnx/memory_encoder.onnx": (5616496, "8c317b8fe445c5f509fdc44d9b48a813"),
    "onnx/pointer_tpos.onnx": (67289, "1a62d0acfdd9b7aa1ff3c49a7e27719f"),
}
LADO = 1024
MAX_PONTOS = 12          # por quadro-base
PADRAO = {"refinar": 1, "suave": 20, "deslocar": 0, "contraste": 0, "pena": 0, "tremido": 30}


# ───────────────────────── modelo ─────────────────────────
def _pasta_modelo():
    from Functions.midia import modelo_path
    return modelo_path("sam2_tiny_video")


def modelo_ok():
    p = _pasta_modelo()
    return all(os.path.isfile(os.path.join(p, k)) and os.path.getsize(os.path.join(p, k)) == v[0] for k, v in ARQUIVOS.items())


def _md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def garantir_modelo(progresso=lambda p, m: None):
    if modelo_ok():
        return _pasta_modelo()
    p = _pasta_modelo()
    total = sum(v[0] for v in ARQUIVOS.values())
    feito = sum(v[0] for k, v in ARQUIVOS.items() if os.path.isfile(os.path.join(p, k)) and os.path.getsize(os.path.join(p, k)) == v[0])
    for k, (tam, md5) in ARQUIVOS.items():
        dest = os.path.join(p, k)
        if os.path.isfile(dest) and os.path.getsize(dest) == tam:
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        tmp = dest + ".download"
        with urllib.request.urlopen(URL + k, timeout=60) as r, open(tmp, "wb") as out:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                out.write(b)
                feito += len(b)
                progresso(feito / total, f"Baixando o modelo do Pincel Roto… {feito / 1048576:.0f}/{total / 1048576:.0f} MB")
        if _md5(tmp) != md5:
            os.remove(tmp)
            raise RuntimeError(f"o download de {k} veio corrompido")
        os.replace(tmp, dest)
    return p


class _Motor:
    """As 5 partes do SAM 2.1 de vídeo. Placa (DirectML) se houver; senão CPU."""

    def __init__(self):
        import onnxruntime as ort
        p = garantir_modelo()
        self.C = json.load(open(os.path.join(p, "constants.json"), encoding="utf-8"))
        self.tpe = np.array(self.C["memory_temporal_positional_encoding"], np.float32)
        self.mean = np.array(self.C["image_mean"], np.float32)[:, None, None]
        self.std = np.array(self.C["image_std"], np.float32)[:, None, None]
        try:   # uma sessão de IA por vez na placa (recriar sessão DirectML com outra aberta derruba o processo)
            from Functions import removerfundo
            removerfundo.liberar_sessoes()
        except Exception:
            pass
        dml = "DmlExecutionProvider" in ort.get_available_providers() and not os.environ.get("CANIVETE_ROTO_CPU")
        self.s, self.disp = {}, "placa" if dml else "cpu"
        for n in ("vision_encoder", "mask_decoder", "memory_encoder", "memory_attention", "pointer_tpos"):
            so = ort.SessionOptions()
            so.enable_mem_pattern = False
            arq = os.path.join(p, "onnx", n + ".onnx")
            try:
                self.s[n] = ort.InferenceSession(arq, so, providers=(["DmlExecutionProvider"] if dml else []) + ["CPUExecutionProvider"])
            except Exception:
                self.s[n] = ort.InferenceSession(arq, so, providers=["CPUExecutionProvider"])
                self.disp = "cpu"
        self.nomes = {n: [o.name for o in s.get_outputs()] for n, s in self.s.items()}

    def _run(self, n, ent):
        return dict(zip(self.nomes[n], self.s[n].run(None, ent)))

    def codificar(self, bgr):
        im = cv2.resize(bgr, (LADO, LADO), interpolation=cv2.INTER_LINEAR)[..., ::-1].astype(np.float32) / 255
        return self._run("vision_encoder", {"pixel_values": ((im.transpose(2, 0, 1) - self.mean) / self.std)[None].astype(np.float32)})

    def decodificar(self, e, f2, pts=None):
        """pts: [(x, y, rótulo)] em 0..1 (1 soma, 0 tira); None = quadro seguido só pela memória."""
        if pts:
            p = np.array([[[(x * LADO, y * LADO) for x, y, _ in pts]]], np.float32)
            lb = np.array([[[int(r) for *_, r in pts]]], np.int32)
        else:
            p, lb = np.zeros((1, 1, 1, 2), np.float32), -np.ones((1, 1, 1), np.int32)
        d = self._run("mask_decoder", {"feats0": e["feats0"], "feats1": e["feats1"], "feats2_cond": f2, "input_points": p, "input_labels": lb})
        return d["high_res_mask"][:, :1], d["object_score_logits"].reshape(1, 1), d["object_pointer"].reshape(256)

    def memorizar(self, e, hr, sc, base):
        m = self._run("memory_encoder", {"feats2": e["feats2"], "high_res_mask": hr, "object_score_logits": sc,
                                         "binarize": np.array(1.0 if base else 0.0, np.float32)})
        return m["memory_tokens"], m["memory_pos"]

    def condicionar(self, e, conds, recentes, i, n_total):
        """conds: [(quadro, tokens, pos, ponteiro)] (quadros-base); recentes: [(quadro, tokens, pos, ponteiro)] do passe,
        do mais antigo ao mais novo. Banco fixo: 7 memórias + 16 ponteiros (4 fichas cada), completados repetindo."""
        seq = lambda x: x.reshape(1, x.shape[1], -1).transpose(2, 0, 1)
        ms = [(6, c[1], c[2]) for c in conds]
        for q, tk, ps, _ in recentes[-(7 - len(ms)):]:
            ms.append((min(abs(i - q), 6) - 1 if abs(i - q) >= 1 else 0, tk, ps))
        while len(ms) < 7:
            ms.append(ms[-1])
        mem = np.concatenate([tk for _, tk, _ in ms])
        mpos = np.concatenate([ps + self.tpe[r][None, None] for r, _, ps in ms])
        ptrs = [(abs(i - c[0]), c[3]) for c in conds] + [(abs(i - q), p) for q, _, _, p in recentes][-(16 - len(conds)):]
        while len(ptrs) < 16:
            ptrs.append(ptrs[-1])
        d = np.array([x for x, _ in ptrs], np.float32) / max(1, min(n_total, 16) - 1)
        ppos = np.repeat(self._run("pointer_tpos", {"normalized_diffs": d})["pointer_pos"], 4, axis=0)[:, None]
        ptok = np.concatenate([p.reshape(4, 1, 64) for _, p in ptrs])
        return self._run("memory_attention", {
            "current_vision_features": seq(e["feats2"]), "current_vision_position_embeddings": seq(e["vision_pos_embed"]),
            "memory": np.concatenate([mem, ptok]).astype(np.float32), "memory_pos": np.concatenate([mpos, ppos]).astype(np.float32)})["conditioned_feats"]


_motor = {"m": None}
_trava_motor = threading.Lock()


def _get_motor():
    with _trava_motor:
        if _motor["m"] is None:
            _motor["m"] = _Motor()
        from Functions import memoria
        memoria.usado("pincel roto", liberar, memoria.GPU)
        return _motor["m"]


def liberar():
    with _trava_motor:
        _motor["m"] = None
    import gc
    gc.collect()


# ───────────────────────── trabalhos ─────────────────────────
_jobs = {}            # rid → Trabalho
_fila = []            # (rid, tarefa, args)
_trava = threading.Lock()
_trava_info = threading.Lock()
_evento = threading.Event()
_operario = {"t": None}


def _pasta_raiz(base):
    from Functions import render_cache
    p = os.path.join(render_cache._raiz(base), "Roto")
    os.makedirs(p, exist_ok=True)
    return p


def _ok_rid(rid):
    return isinstance(rid, str) and 4 <= len(rid) <= 40 and rid.replace("-", "").replace("_", "").isalnum()


def _probe(video):
    from Functions.midia import ffprobe, NO_WINDOW
    r = subprocess.run([ffprobe(), "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate,avg_frame_rate", "-of", "json", video],
                       capture_output=True, text=True, creationflags=NO_WINDOW)
    s = json.loads(r.stdout or "{}").get("streams", [{}])[0]
    def taxa(x):
        try:
            a, b = (x or "0/1").split("/")
            return float(a) / float(b) if float(b) else 0
        except Exception:
            return 0
    fps = taxa(s.get("r_frame_rate")) or taxa(s.get("avg_frame_rate")) or 30
    if fps > 120:
        fps = taxa(s.get("avg_frame_rate")) or 30
    return int(s.get("width") or 0), int(s.get("height") or 0), fps


class Trabalho:
    def __init__(self, base, rid, video, a, b):
        self.rid, self.dir = rid, os.path.join(_pasta_raiz(base), rid)
        for sub in ("quadros", "m", "base", "a", "p"):
            os.makedirs(os.path.join(self.dir, sub), exist_ok=True)
        info = self._ler()
        if not info or info.get("video") != video or abs(info.get("a", -1) - a) > 1e-3 or abs(info.get("b", -1) - b) > 1e-3:
            for sub in ("quadros", "m", "base", "a", "p"):
                shutil.rmtree(os.path.join(self.dir, sub), ignore_errors=True)
                os.makedirs(os.path.join(self.dir, sub), exist_ok=True)
            w, h, fps = _probe(video)
            n = max(1, int(round((b - a) * fps)))
            info = {"video": video, "a": a, "b": b, "fps": fps, "n": n, "w": w, "h": h, "bases": {}, "params": dict(PADRAO),
                    "ver": [0] * n, "extraido": False}
        self.info = info
        self.estado = {"fase": "", "feito": 0, "total": 0, "msg": "", "erro": "", "t0": 0, "rodando": False}
        self.cancelar = False
        self._salvar()

    def _ler(self):
        try:
            with open(os.path.join(self.dir, "info.json"), encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def _salvar(self):
        # a tela (definir_base) e o operário gravam: uma gravação por vez; antivírus segurando o arquivo → tenta de novo
        with _trava_info:
            tmp = os.path.join(self.dir, f"info.json.{threading.get_ident()}.tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.info, f)
            for n in range(20):
                try:
                    os.replace(tmp, os.path.join(self.dir, "info.json"))
                    return
                except PermissionError:
                    time.sleep(0.1)
            try:
                os.remove(tmp)
            except OSError:
                pass

    def arq(self, sub, i, ext="png"):
        # o limpador do cache de render apaga pasta vazia (render_cache): a subpasta volta na hora de gravar
        d = os.path.join(self.dir, sub)
        if not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
        return os.path.join(d, f"{sub[0]}_{i:05d}.{ext}")

    def quadro(self, i):
        return cv2.imread(self.arq("quadros", i, "jpg"), cv2.IMREAD_COLOR)


def _job(rid):
    j = _jobs.get(rid)
    if not j:
        raise RuntimeError("Pincel Roto: trabalho não aberto (abra a tela do Pincel Roto de novo)")
    return j


def abrir(base, rid, video, a, b):
    """Abre (ou retoma) o trabalho do clipe: a..b = trecho da mídia em segundos. Extrai os quadros em segundo plano."""
    if not _ok_rid(rid):
        return {"success": False, "error": "id inválido"}
    if not video or not os.path.isfile(video):
        return {"success": False, "error": "vídeo não encontrado"}
    with _trava:
        j = _jobs.get(rid)
        if not j or j.info["video"] != video or abs(j.info["a"] - a) > 1e-3 or abs(j.info["b"] - b) > 1e-3:
            j = _jobs[rid] = Trabalho(base, rid, video, float(a), float(b))
    if not j.info.get("extraido"):
        _enfileirar(rid, "extrair")
    from Functions import media_server
    return {"success": True, "rid": rid, "n": j.info["n"], "fps": j.info["fps"], "a": j.info["a"], "w": j.info["w"],
            "h": j.info["h"], "bases": j.info["bases"], "params": j.info["params"], "modelo": modelo_ok(),
            "url_p": media_server.register_pasta(os.path.join(j.dir, "p")),
            "url_q": media_server.register_pasta(os.path.join(j.dir, "quadros"))}


def estado(rid):
    j = _jobs.get(rid)
    if not j:
        return {"success": False, "error": "não aberto"}
    _garantir_operario()   # se o operário caiu com tarefa na fila, volta
    e = dict(j.estado)
    if e["rodando"] and e["feito"] and e["t0"]:
        e["s_quadro"] = round((time.time() - e["t0"]) / e["feito"], 3)
    return {"success": True, "ver": j.info["ver"], "bases": j.info["bases"], "extraido": j.info.get("extraido"),
            "params": j.info["params"], "fila": sum(1 for x in _fila if x[0] == rid), **e}


def definir_base(rid, q, pontos):
    """Traços do quadro q → pontos [(x, y, rótulo)] em 0..1. Lista vazia apaga o quadro-base. Propaga em segundo plano."""
    j = _job(rid)
    q = int(q)
    if not 0 <= q < j.info["n"]:
        return {"success": False, "error": "quadro fora do trecho"}
    pts = [[float(x), float(y), 1 if int(r) else 0] for x, y, r in (pontos or [])][:MAX_PONTOS]
    with _trava:
        if pts:
            j.info["bases"][str(q)] = pts
        else:
            j.info["bases"].pop(str(q), None)
        j._salvar()
        # a tarefa nova do mesmo trabalho substitui a que ainda não começou (traços em sequência)
        _fila[:] = [x for x in _fila if not (x[0] == rid and x[1] == "propagar")]
    _enfileirar(rid, "propagar", q)
    return {"success": True}


def refinar(rid, params):
    j = _job(rid)
    with _trava:
        p = dict(PADRAO)
        p.update({k: float(v) for k, v in (params or {}).items() if k in PADRAO})
        if p == j.info["params"]:
            return {"success": True, "igual": True}
        j.info["params"] = p
        j._salvar()
        _fila[:] = [x for x in _fila if not (x[0] == rid and x[1] == "refinar")]
    _enfileirar(rid, "refinar", None)
    return {"success": True}


def cancelar(rid):
    j = _jobs.get(rid)
    with _trava:
        _fila[:] = [x for x in _fila if x[0] != rid]
    if j:
        j.cancelar = True
    return {"success": True}


def _garantir_operario():
    with _trava:
        if _fila and (_operario["t"] is None or not _operario["t"].is_alive()):
            _operario["t"] = threading.Thread(target=_laco, name="pincel-roto", daemon=True)
            _operario["t"].start()
    _evento.set()


def _enfileirar(rid, tarefa, *args):
    with _trava:
        _fila.append((rid, tarefa, args))
    _garantir_operario()


def _laco():
    while True:
        with _trava:
            item = _fila.pop(0) if _fila else None
        if item is None:
            _evento.clear()
            if not _evento.wait(30):
                with _trava:
                    if not _fila:
                        _operario["t"] = None
                        return
            continue
        rid, tarefa, args = item
        j = _jobs.get(rid)
        if not j:
            continue
        j.cancelar = False
        j.estado.update(rodando=True, erro="", feito=0, total=0, t0=time.time(), fase=tarefa)
        try:
            {"extrair": _extrair, "propagar": _propagar, "refinar": _refinar_tudo}[tarefa](j, *args)
            j.estado["msg"] = "" if not j.cancelar else "cancelado"
        except Exception as e:
            import traceback
            traceback.print_exc()
            j.estado["erro"] = f"{type(e).__name__}: {e}"
        finally:
            j.estado["rodando"] = False
            try:
                j._salvar()
            except Exception as e:   # o operário não pode morrer (a fila ficaria parada)
                print(f"[pincel roto] info.json: {e}")


def _extrair(j):
    i = j.info
    j.estado.update(msg="Lendo os quadros do vídeo…", total=i["n"])
    shutil.rmtree(os.path.join(j.dir, "quadros"), ignore_errors=True)
    os.makedirs(os.path.join(j.dir, "quadros"))
    from Functions.midia import rodar_ffmpeg
    args = ["-ss", f"{i['a']:.6f}", "-i", i["video"], "-t", f"{i['b'] - i['a']:.6f}", "-vf", f"fps={i['fps']:.6f}",
            "-frames:v", str(i["n"]), "-q:v", "2", "-start_number", "0", os.path.join(j.dir, "quadros", "q_%05d.jpg")]
    ok, erros = rodar_ffmpeg(args, duracao=i["b"] - i["a"], on_progress=lambda p, *_: j.estado.update(feito=int(p / 100 * i["n"])))
    n = len([f for f in os.listdir(os.path.join(j.dir, "quadros")) if f.endswith(".jpg")])
    if not n:
        raise RuntimeError("o ffmpeg não leu os quadros: " + str(erros or "")[-200:])
    q0 = j.quadro(0)
    if q0 is not None:   # vídeo de celular girado: o ffmpeg já entrega em pé (a largura/altura do arquivo vêm deitadas)
        i["h"], i["w"] = q0.shape[:2]
    if n < i["n"]:   # o fim do arquivo chegou antes (duração arredondada): o trecho fica com o que existe
        i["n"] = n
        i["ver"] = i["ver"][:n]
    i["extraido"] = True
    j._salvar()
    if not modelo_ok():
        j.estado.update(msg="Baixando o modelo…", fase="modelo")
        garantir_modelo(lambda p, m: j.estado.update(msg=m, feito=int(p * 1000), total=1000))


# ── propagação (como o Roto Brush: do quadro-base até os vizinhos, para os dois lados) ──
def _png_previa(arq, a8):
    """Alfa da prévia: PNG branco com a máscara no canal de transparência (o canvas recorta com destination-in)."""
    cv2.imwrite(arq, np.dstack([np.full_like(a8, 255)] * 3 + [a8]))


def _guardar_mascara(j, i, hr):
    """Probabilidade do modelo (1024²) + prévia rápida (metade da resolução) enquanto o refinamento não passa."""
    pr = (255 / (1 + np.exp(-np.clip(hr[0, 0], -30, 30)))).astype(np.uint8)
    cv2.imwrite(j.arq("m", i), pr)
    w, h = j.info["w"], j.info["h"]
    pv = cv2.resize(pr, (max(2, w // 2), max(2, h // 2)), interpolation=cv2.INTER_LINEAR)
    _png_previa(j.arq("p", i), np.where(pv > 127, 255, 0).astype(np.uint8))
    j.info["ver"][i] = j.info["ver"][i] + 1 if j.info["ver"][i] > 0 else 1


def _pontos_miolo(pre):
    """2 pontos bem dentro do recorte de antes (metade de cima e de baixo): o modelo lembra o objeto inteiro."""
    m = cv2.resize((pre > 127).astype(np.uint8), (256, 256), interpolation=cv2.INTER_NEAREST)
    ys = np.where(m.any(1))[0]
    out = []
    if not len(ys):
        return out
    meio = (ys[0] + ys[-1]) // 2
    for y0, y1 in ((ys[0], meio + 1), (meio, ys[-1] + 1)):
        dt = cv2.distanceTransform(np.pad(m[y0:y1], 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
        if dt.max() >= 3:
            yy, xx = np.unravel_index(dt.argmax(), dt.shape)
            out.append([(xx + 0.5) / 256, (yy + y0 + 0.5) / 256, 1])
    return out


def _somar_tirar(pre, hr, sc, pts):
    """Recorte de antes ∪ pedaços novos que tocam um traço verde; − onde o modelo tirou perto de um traço vermelho."""
    p = np.clip(pre.astype(np.float32) / 255, 1e-4, 1 - 1e-4)
    antes = np.log(p / (1 - p))
    novo = hr[0, 0]
    comb = antes.copy()
    pos = [(x, y) for x, y, r in pts if r]
    neg = [(x, y) for x, y, r in pts if not r]
    if pos:
        nl, lab = cv2.connectedComponents((novo > 0.5).astype(np.uint8), connectivity=8)   # 0,5: sem a franja fraca
        ids = {int(lab[min(LADO - 1, int(y * LADO)), min(LADO - 1, int(x * LADO))]) for x, y in pos} - {0}
        if ids:
            soma = np.isin(lab, list(ids))
            comb = np.where(soma, np.maximum(comb, novo), comb)
    if neg:
        yy, xx = np.mgrid[0:LADO, 0:LADO].astype(np.float32) / LADO
        perto = np.zeros((LADO, LADO), bool)
        for x, y in neg:
            perto |= (xx - x) ** 2 + (yy - y) ** 2 < 0.12 ** 2
        comb = np.where(perto & (novo < 0), np.minimum(comb, novo), comb)
        for x, y in neg:   # o ponto vermelho em si sai sempre
            comb[(xx - x) ** 2 + (yy - y) ** 2 < 0.015 ** 2] = -10
    return comb[None, None].astype(np.float32), np.maximum(sc, 1.0).astype(np.float32)


def _base_mem(j, q):
    f = os.path.join(j.dir, "base", f"b_{q:05d}.npz")
    if not os.path.isfile(f):
        return None
    d = np.load(f)
    return (q, d["tk"].astype(np.float32), d["ps"].astype(np.float32), d["pt"].astype(np.float32))


def _propagar(j, q):
    M = _get_motor()
    info, n = j.info, j.info["n"]
    bases = sorted(int(k) for k in info["bases"])
    ant = max([b for b in bases if b < q], default=None)
    prox = min([b for b in bases if b > q], default=None)
    if str(q) in info["bases"]:
        # o quadro-base: lido com a memória dos quadros-base vizinhos (como a correção do Roto Brush, que parte do que já
        # foi seguido); sem vizinho, do zero só pelos traços
        e = M.codificar(j.quadro(q))
        viz = [c for c in (_base_mem(j, b) for b in (ant, prox) if b is not None) if c is not None]
        f2 = M.condicionar(e, viz, [], q, n) if viz else e["feats2_no_mem"]
        pts = info["bases"][str(q)]
        # correção (já havia recorte seguido aqui): como no After, o traço SOMA/TIRA do que já estava — sozinhos, os
        # pontos da mão viravam "só a pele". Guarda o recorte de antes deste quadro-base (b_NNNNN.png) para refazer
        # sempre a partir dele (desfazer um traço volta ao que era)
        pre_f = j.arq("base", q, "png")
        if viz and not os.path.isfile(pre_f) and os.path.isfile(j.arq("m", q)):
            shutil.copyfile(j.arq("m", q), pre_f)
        pre = cv2.imread(pre_f, cv2.IMREAD_GRAYSCALE) if viz and os.path.isfile(pre_f) else None
        if pre is not None and (pre > 127).any():
            hr, sc, pt = M.decodificar(e, f2, (_pontos_miolo(pre) + pts)[-MAX_PONTOS:])
            # com memória o modelo resiste a pegar parte nova (mão borrada fora do corpo); lido sem memória, só pelos
            # traços, ele pega — o que soma é o maior dos dois (medido: D:/kanivete_testes/roto/sonda_mao.py)
            livre, _, _ = M.decodificar(e, e["feats2_no_mem"], pts)
            hr, sc = _somar_tirar(pre, np.maximum(hr, livre), sc, pts)
        else:
            hr, sc, pt = M.decodificar(e, f2, pts)
        tk, ps = M.memorizar(e, hr, sc, True)
        np.savez(j.arq("base", q, "npz"), tk=tk.astype(np.float16), ps=ps.astype(np.float16), pt=pt.astype(np.float16))
        _guardar_mascara(j, q, hr)
        cq = (q, tk, ps, pt)
        trechos = [(cq, +1, q + 1, (prox - 1) if prox is not None else n - 1, prox), (cq, -1, q - 1, (ant + 1) if ant is not None else 0, ant)]
    else:
        # quadro-base apagado: o vizinho de antes segue até o próximo (ou o de depois volta até o começo)
        for f in (f"b_{q:05d}.npz", f"b_{q:05d}.png"):
            try:
                os.remove(os.path.join(j.dir, "base", f))
            except OSError:
                pass
        ca = _base_mem(j, ant) if ant is not None else None
        cp = _base_mem(j, prox) if prox is not None else None
        if ca:
            trechos = [(ca, +1, ant + 1, (prox - 1) if prox is not None else n - 1, prox)]
        elif cp:
            trechos = [(cp, -1, prox - 1, 0, None)]
        else:   # nenhum quadro-base: some o recorte
            for i in range(n):
                for sub in ("m", "a", "p"):
                    try:
                        os.remove(j.arq(sub, i))
                    except OSError:
                        pass
                info["ver"][i] = 0
            return
    total = sum(abs(fim - ini) + 1 for _, d, ini, fim, _ in trechos if (fim - ini) * d >= 0)
    j.estado.update(msg="Propagando…", total=total + 1, feito=1, t0=time.time())
    feitos = [q] if str(q) in info["bases"] else []
    for cq, d, ini, fim, outro in trechos:
        if (fim - ini) * d < 0:
            continue
        conds = [cq] + ([c] if outro is not None and (c := _base_mem(j, outro)) else [])
        recentes = []   # o quadro-base já está nos conds
        for i in range(ini, fim + d, d):
            if j.cancelar:
                return
            e = M.codificar(j.quadro(i))
            f2 = M.condicionar(e, conds, recentes, i, n)
            hr, sc, pt = M.decodificar(e, f2)
            tk, ps = M.memorizar(e, hr, sc, False)
            recentes = (recentes + [(i, tk, ps, pt)])[-16:]
            _guardar_mascara(j, i, hr)
            feitos.append(i)
            j.estado["feito"] += 1
            if j.estado["feito"] % 15 == 0:
                j._salvar()
    j._salvar()
    _refinar(j, sorted(feitos))


# ── Refinar borda ──
def _guiado(I, p, r, eps):
    m = lambda x: cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1))
    mI, mp = m(I), m(p)
    a = (m(I * p) - mI * mp) / (m(I * I) - mI * mI + eps)
    return m(a) * I + m(mp - a * mI)


def refinar_quadro(bgr, prob, P, anterior=None):
    """prob: probabilidade do modelo (uint8, qualquer tamanho) → alfa float 0..1 no tamanho do quadro."""
    H, W = bgr.shape[:2]
    k = max(1, round(max(W, H) / 1920))          # 4K: mesmos números em pixels de 1080p
    pr = cv2.resize(prob, (W, H), interpolation=cv2.INTER_LINEAR)
    s = P.get("suave", 0)
    if s > 0:   # contorno mais liso: borra a probabilidade antes do corte
        pr = cv2.GaussianBlur(pr, (0, 0), s / 10 * k)
    dura = (pr > 127).astype(np.uint8)
    # ilhas soltas (sobras no fundo) saem; mão separada do corpo fica (área mínima de 0,15% do quadro)
    nl, lab, st, _ = cv2.connectedComponentsWithStats(dura, 8)
    if nl > 1:
        ok = st[:, cv2.CC_STAT_AREA] >= 0.0015 * W * H
        ok[0] = False
        dura = ok[lab].astype(np.uint8)
    # furo fechado pequeno (lente dos óculos, entre os dedos colados) é tapado: o texto de trás não vaza pelo rosto.
    # Furo que encosta na borda do quadro (microfone vindo de baixo) ou grande fica
    nl, lab, st, _ = cv2.connectedComponentsWithStats(1 - dura, 4)
    if nl > 2:
        borda = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
        tapa = np.zeros(nl, bool)
        for c in range(1, nl):
            tapa[c] = c not in borda and st[c, cv2.CC_STAT_AREA] < 0.006 * W * H
        if tapa.any():
            dura = np.maximum(dura, tapa[lab].astype(np.uint8))
    d = int(round(P.get("deslocar", 0) * k))
    if d:
        el = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * abs(d) + 1, 2 * abs(d) + 1))
        dura = cv2.dilate(dura, el) if d > 0 else cv2.erode(dura, el)
    a = dura.astype(np.float32)
    if P.get("refinar", 1):
        # filtro guiado em meia resolução, só na faixa de ±10 px do contorno: a borda segue a foto (cabelo, dedos)
        g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        w2, h2 = max(2, W // 2), max(2, H // 2)
        ref = cv2.resize(_guiado(cv2.resize(g, (w2, h2), interpolation=cv2.INTER_AREA),
                                 cv2.resize(a, (w2, h2), interpolation=cv2.INTER_AREA), 6 * k, 1e-3), (W, H), interpolation=cv2.INTER_LINEAR)
        r = 10 * k
        el = np.ones((2 * r + 1, 2 * r + 1), np.uint8)
        faixa = (cv2.dilate(dura, el) - cv2.erode(dura, el)) > 0
        a = np.where(faixa, np.clip(ref, 0, 1), a)
        a = cv2.GaussianBlur(a, (3, 3), 0)
    else:
        faixa = None
    c = P.get("contraste", 0)
    if c > 0:
        a = np.clip((a - 0.5) * (1 + c / 25) + 0.5, 0, 1)
    pe = P.get("pena", 0)
    if pe > 0:
        a = cv2.GaussianBlur(a, (0, 0), pe / 2 * k)
    t = P.get("tremido", 0) / 100 * 0.6
    if t > 0 and anterior is not None and anterior.shape == a.shape:
        zona = (a > 0.02) & (a < 0.98) | (anterior > 0.02) & (anterior < 0.98)   # só a borda: o miolo não arrasta
        a = np.where(zona, a * (1 - t) + anterior * t, a)
    return a


def _refinar(j, quadros):
    P, w, h = j.info["params"], j.info["w"], j.info["h"]
    j.estado.update(msg="Refinando a borda…", fase="refinar", total=len(quadros), feito=0, t0=time.time())
    ant, ult = None, None
    for i in quadros:
        if j.cancelar:
            return
        prob = cv2.imread(j.arq("m", i), cv2.IMREAD_GRAYSCALE)
        bgr = j.quadro(i)
        if prob is None or bgr is None:
            continue
        if ult is not None and i != ult + 1:
            ant = None
        a = refinar_quadro(bgr, prob, P, ant)
        ant, ult = a, i
        a8 = (a * 255 + 0.5).astype(np.uint8)
        cv2.imwrite(j.arq("a", i), a8)
        _png_previa(j.arq("p", i), cv2.resize(a8, (max(2, w // 2), max(2, h // 2)), interpolation=cv2.INTER_AREA))
        j.info["ver"][i] += 1
        j.estado["feito"] += 1


def _refinar_tudo(j):
    _refinar(j, [i for i in range(j.info["n"]) if os.path.isfile(j.arq("m", i))])


def esperar(rid, limite=3600):
    """Para testes e para a exportação: espera a fila deste trabalho esvaziar."""
    t0 = time.time()
    while time.time() - t0 < limite:
        j = _jobs.get(rid)
        with _trava:
            pend = any(x[0] == rid for x in _fila)
        if not j or (not pend and not j.estado["rodando"]):
            return True
        _garantir_operario()
        time.sleep(0.2)
    return False


# ── exportação: vídeo transparente do trecho ──
def video_alfa(rid, on_progress=lambda p: None):
    """ProRes 4444 com alfa do trecho a..b (quadro original + alfa refinado; quadro sem recorte = opaco).
    Guardado como <pasta>/recorte_<versões>.mov: refeito só quando algo mudou."""
    j = _job(rid)
    esperar(rid)
    info = j.info
    n = info["n"]
    assin = hashlib.sha1(json.dumps([info["ver"], info["params"]]).encode()).hexdigest()[:12]
    final = os.path.join(j.dir, f"recorte_{assin}.mov")
    if os.path.isfile(final):
        return {"success": True, "path": final, "a": info["a"]}
    for f in os.listdir(j.dir):
        if f.startswith("recorte_") and f.endswith(".mov"):
            try:
                os.remove(os.path.join(j.dir, f))
            except OSError:
                pass
    branco = None
    for i in range(n):   # sem recorte (fora dos quadros seguidos): opaco
        if not os.path.isfile(j.arq("a", i)):
            if branco is None:
                branco = np.full((info["h"], info["w"]), 255, np.uint8)
            cv2.imwrite(j.arq("a", i), branco)
    from Functions.midia import rodar_ffmpeg
    parte = final + ".part.mov"
    args = ["-ss", f"{info['a']:.6f}", "-i", info["video"], "-framerate", f"{info['fps']:.6f}", "-start_number", "0",
            "-i", os.path.join(j.dir, "a", "a_%05d.png"), "-filter_complex",
            f"[0:v]fps={info['fps']:.6f},format=rgba[v];[1:v]format=gray[m];[v][m]alphamerge[s]", "-map", "[s]",
            "-frames:v", str(n), "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0",
            "-r", f"{info['fps']:.6f}", parte]
    ok, erros = rodar_ffmpeg(args, duracao=info["b"] - info["a"], on_progress=lambda p, *_: on_progress(p))
    if not ok or not os.path.isfile(parte):
        return {"success": False, "error": "o ffmpeg não montou o recorte: " + str(erros or "")[-300:]}
    os.replace(parte, final)
    return {"success": True, "path": final, "a": info["a"]}
