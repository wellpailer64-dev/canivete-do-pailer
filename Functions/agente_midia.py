"""
agente_midia.py — ferramentas para um agente (Claude) entender as mídias de um projeto sem assistir/ouvir tudo.

Rodam FORA do app (processo próprio, prioridade baixa), então não atrapalham a edição manual:
    python -m Functions.agente_midia midias  <projeto.vcnvt> [--nao-usados-em "V1 MAIOR"]
    python -m Functions.agente_midia folha   <projeto.vcnvt | vídeos...> [--nao-usados-em NOME] [--quadros 5] [--por-folha 8]
    python -m Functions.agente_midia storyboard <vídeo> [--passo 1.5] [--inicio 0] [--fim 0] [--colunas 8]
    python -m Functions.agente_midia transcrever <arquivo> [--idioma pt]
    python -m Functions.agente_midia batidas <áudio>

  midias       lista os vídeos/áudios/imagens do projeto (caminho, duração, tamanho, em quais timelines estão)
  folha        folha de contato: uma imagem com vários vídeos por linha (nome, duração, N quadros espaçados)
  storyboard   um vídeo em quadros a cada `passo` segundos, numa grade com o tempo de cada um
  transcrever  a fala do arquivo, com o tempo de cada palavra (o mesmo modelo do painel Texto)
  batidas      BPM e o tempo de cada batida (e das fortes, de 4 em 4) para cortar no ritmo

Saída: JSON no stdout (caminhos das imagens geradas, palavras, batidas). Tudo fica em cache em
<pasta de cache do editor>/agente — rodar de novo no mesmo arquivo (mesma data) é instantâneo.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from Functions.audio_cutter import ffmpeg_path
from Functions import video_cutter as vc

_BAIXA = 0x00004000 | 0x08000000   # BELOW_NORMAL_PRIORITY_CLASS | CREATE_NO_WINDOW
EXT_VIDEO = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mts", ".m2ts", ".3gp", ".wmv", ".mxf"}
EXT_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma"}


def _prioridade_baixa():
    try:
        import ctypes
        ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000)
    except Exception:
        pass


def _pasta():
    p = os.path.join(vc._midia_dir(), "agente")
    os.makedirs(p, exist_ok=True)
    return p


def _chave(*partes):
    txt = "|".join(str(x) for x in partes)
    return hashlib.md5(txt.encode("utf-8")).hexdigest()[:12]


def _assinatura(path):
    st = os.stat(path)
    return f"{os.path.abspath(path)}|{st.st_mtime}|{st.st_size}"


def _tc(t):
    t = max(0.0, float(t))
    return f"{int(t // 60)}:{t % 60:04.1f}"


# ─────────────────────────── projeto ───────────────────────────

def midias(projeto, nao_usados_em=None):
    """Vídeos, áudios e imagens do projeto, com as timelines em que cada um aparece."""
    with open(projeto, "r", encoding="utf-8") as f:
        d = json.load(f)
    nomes_seq = {}
    for m in d.get("media") or []:
        if m.get("kind") == "timeline":
            nomes_seq[m.get("sequenceId")] = m.get("nome") or m.get("name")
    for s in d.get("sequences") or []:
        nomes_seq.setdefault(s.get("id"), s.get("name"))
    uso = {}
    for s in d.get("sequences") or [{"id": "seq", "clips": d.get("clips") or []}]:
        nome = nomes_seq.get(s.get("id")) or s.get("name") or s.get("id")
        for c in s.get("clips") or []:
            uso.setdefault(c.get("m") or 0, set()).add(nome)
    lista = []
    principal = d.get("video")
    itens = [{"id": 0, "kind": "video", "path": principal, "name": os.path.basename(principal)}] if principal else []
    itens += [m for m in d.get("media") or [] if m.get("kind") in ("video", "audio", "image") and m.get("path")]
    for m in itens:
        if m.get("rvDe") is not None:
            continue   # cópia invertida (Reverse Speed): vem junto com a original
        path = m["path"]
        item = {"id": m["id"], "tipo": m["kind"], "nome": m.get("nome") or m.get("name") or os.path.basename(path),
                "path": path, "existe": os.path.isfile(path), "timelines": sorted(uso.get(m["id"], []))}
        lista.append(item)
    if nao_usados_em:
        lista = [x for x in lista if nao_usados_em not in x["timelines"]]
    # duração e tamanho (em paralelo; ffprobe é rápido)
    def _info(x):
        if x["existe"] and x["tipo"] in ("video", "audio"):
            try:
                i = vc.probe(x["path"])
                x["dur"] = round(i["duration"], 2)
                if x["tipo"] == "video":
                    x["tam"] = f"{i['width']}x{i['height']}"
                    x["som"] = i["has_audio"]
            except Exception as e:
                x["erro"] = str(e)
        return x
    with ThreadPoolExecutor(max_workers=6) as ex:
        return list(ex.map(_info, lista))


# ─────────────────────────── quadros ───────────────────────────

def _quadro(path, t, altura, destino):
    """Um quadro (busca rápida pelo quadro-chave mais próximo) em JPEG de `altura` px."""
    if os.path.isfile(destino):
        return destino
    cmd = [ffmpeg_path(), "-y", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", path, "-frames:v", "1",
           "-vf", f"scale=-2:{altura}", "-q:v", "4", destino]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, creationflags=_BAIXA)
    return destino if os.path.isfile(destino) else None


def _fonte(tam):
    from PIL import ImageFont
    for nome in ("segoeui.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(nome, tam)
        except Exception:
            continue
    return ImageFont.load_default()


def folha(fontes, quadros=5, por_folha=8, altura=170, nao_usados_em=None):
    """Folha de contato: cada linha = um vídeo (nº, nome, duração) + `quadros` quadros espaçados.
    fontes = um projeto .vcnvt (todos os vídeos, ou os que não estão na timeline `nao_usados_em`) ou vídeos."""
    from PIL import Image, ImageDraw
    if len(fontes) == 1 and fontes[0].lower().endswith(".vcnvt"):
        vids = [x for x in midias(fontes[0], nao_usados_em) if x["tipo"] == "video" and x["existe"]]
    else:
        vids = []
        for p in fontes:
            i = vc.probe(p)
            vids.append({"id": None, "nome": os.path.basename(p), "path": p, "dur": i["duration"]})
    pasta = _pasta()
    # quadros de todos os vídeos em paralelo (busca rápida, só o necessário)
    pedidos = []
    for k, v in enumerate(vids):
        dur = max(0.1, v.get("dur") or 0.1)
        v["tempos"] = [dur * (j + 0.5) / quadros for j in range(quadros)]
        base = _chave(_assinatura(v["path"]), altura)
        v["quadros"] = [os.path.join(pasta, f"q_{base}_{j}.jpg") for j in range(quadros)]
        pedidos += [(v["path"], t, altura, q) for t, q in zip(v["tempos"], v["quadros"])]
    with ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as ex:
        list(ex.map(lambda a: _quadro(*a), pedidos))
    rot_l, pad = 230, 6
    f_nome, f_info = _fonte(15), _fonte(13)
    saidas = []
    for n0 in range(0, len(vids), max(1, por_folha)):
        grupo = vids[n0:n0 + por_folha]
        imgs = [[Image.open(q) if q and os.path.isfile(q) else None for q in v["quadros"]] for v in grupo]
        larg_q = max((im.width for linha in imgs for im in linha if im), default=altura)
        W = rot_l + quadros * (larg_q + pad) + pad
        H = len(grupo) * (altura + pad) + pad
        folha_img = Image.new("RGB", (W, H), (18, 18, 18))
        dr = ImageDraw.Draw(folha_img)
        for r, (v, linha) in enumerate(zip(grupo, imgs)):
            y = pad + r * (altura + pad)
            dr.text((8, y + 4), f"#{n0 + r + 1}  id {v.get('id')}", fill=(249, 115, 22), font=f_nome)
            nome = v["nome"]
            for k in range(0, min(len(nome), 84), 28):
                dr.text((8, y + 26 + k // 28 * 18), nome[k:k + 28], fill=(235, 235, 235), font=f_info)
            dr.text((8, y + altura - 22), f"{_tc(v.get('dur') or 0)}  {v.get('tam', '')}", fill=(160, 160, 160), font=f_info)
            for j, im in enumerate(linha):
                x = rot_l + pad + j * (larg_q + pad)
                if im:
                    folha_img.paste(im, (x + (larg_q - im.width) // 2, y))
                    dr.text((x + 4, y + altura - 18), _tc(v["tempos"][j]), fill=(255, 255, 255), font=f_info)
        out = os.path.join(pasta, f"folha_{_chave(*[v['path'] for v in grupo], quadros, altura)}.jpg")
        folha_img.save(out, quality=85)
        saidas.append({"imagem": out, "videos": [{"n": n0 + r + 1, "id": v.get("id"), "nome": v["nome"], "path": v["path"],
                                                  "dur": v.get("dur")} for r, v in enumerate(grupo)]})
    return saidas


def storyboard(path, passo=1.5, inicio=0.0, fim=0.0, colunas=8, altura=200):
    """Quadros a cada `passo` s entre `inicio` e `fim` (0 = até o fim), numa grade com o tempo de cada um."""
    from PIL import Image, ImageDraw
    dur = vc.probe(path)["duration"]
    fim = dur if not fim or fim > dur else fim
    tempos, t = [], max(0.0, inicio)
    while t < fim - 0.05 and len(tempos) < 120:
        tempos.append(round(t, 2))
        t += max(0.2, passo)
    pasta, base = _pasta(), _chave(_assinatura(path), altura)
    quadros = [os.path.join(pasta, f"s_{base}_{int(t * 100)}.jpg") for t in tempos]
    with ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as ex:
        list(ex.map(lambda a: _quadro(path, a[0], altura, a[1]), zip(tempos, quadros)))
    imgs = [Image.open(q) if os.path.isfile(q) else None for q in quadros]
    larg = max((im.width for im in imgs if im), default=altura)
    pad, linhas = 4, (len(tempos) + colunas - 1) // colunas
    W, H = colunas * (larg + pad) + pad, linhas * (altura + pad) + pad
    img = Image.new("RGB", (W, max(H, 10)), (18, 18, 18))
    dr, fnt = ImageDraw.Draw(img), _fonte(14)
    for k, (t, im) in enumerate(zip(tempos, imgs)):
        x, y = pad + (k % colunas) * (larg + pad), pad + (k // colunas) * (altura + pad)
        if im:
            img.paste(im, (x + (larg - im.width) // 2, y))
        dr.rectangle([x, y + altura - 20, x + 58, y + altura], fill=(0, 0, 0))
        dr.text((x + 4, y + altura - 19), _tc(t), fill=(249, 115, 22), font=fnt)
    out = os.path.join(pasta, f"story_{_chave(_assinatura(path), passo, inicio, fim, colunas, altura)}.jpg")
    img.save(out, quality=85)
    return {"imagem": out, "dur": round(dur, 2), "tempos": tempos}


# ─────────────────────────── fala ───────────────────────────

def transcrever(path, idioma="pt"):
    """Palavras [início, fim, texto] do arquivo (o mesmo modelo do painel Texto), com cache."""
    cache = os.path.join(_pasta(), f"fala_{_chave(_assinatura(path), idioma)}.json")
    if os.path.isfile(cache):
        with open(cache, "r", encoding="utf-8") as f:
            return json.load(f)
    from Functions import legendas
    chave = "pt" if idioma == "pt" else "multi"
    if not legendas.modelo_pronto(chave):
        legendas.preparar_modelo(chave)
    wav = os.path.join(_pasta(), f"fala_{os.getpid()}.wav")
    r = subprocess.run([ffmpeg_path(), "-y", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", wav],
                       capture_output=True, text=True, timeout=3600, creationflags=_BAIXA)
    if r.returncode != 0 or not os.path.isfile(wav):
        return {"erro": (r.stderr or "falha ao ler o áudio").strip().splitlines()[-1] if r.stderr else "sem áudio"}
    palavras = []
    try:
        for seg in legendas._carregar(chave).recognize(wav):
            palavras.extend(legendas._palavras(seg))
    finally:
        try:
            os.remove(wav)
        except OSError:
            pass
    # frases: palavras juntas até uma pausa de 0,7 s ou fim de frase (fácil de ler e de achar o trecho)
    frases, atual = [], []
    for w in palavras:
        if atual and (w[0] - atual[-1][1] > 0.7 or atual[-1][2][-1:] in ".!?"):
            frases.append([atual[0][0], atual[-1][1], " ".join(x[2] for x in atual)])
            atual = []
        atual.append(w)
    if atual:
        frases.append([atual[0][0], atual[-1][1], " ".join(x[2] for x in atual)])
    res = {"arquivo": path, "frases": frases, "palavras": palavras}
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    return res


# ─────────────────────────── batidas ───────────────────────────

def batidas(path, sr=22050):
    """BPM e batidas (s) da música: força de ataque (fluxo espectral), andamento pela autocorrelação (70–180 BPM)
    e a grade de batidas na fase que mais coincide com os ataques; `fortes` = de 4 em 4 a partir da mais forte."""
    import numpy as np
    cache = os.path.join(_pasta(), f"batidas_{_chave(_assinatura(path))}.json")
    if os.path.isfile(cache):
        with open(cache, "r", encoding="utf-8") as f:
            return json.load(f)
    r = subprocess.run([ffmpeg_path(), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "pipe:1"],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=600, creationflags=_BAIXA)
    x = np.frombuffer(r.stdout, dtype=np.float32)
    if x.size < sr:
        return {"erro": "áudio curto demais"}
    hop, n = 512, 2048
    janela = np.hanning(n).astype(np.float32)
    quadros = 1 + (x.size - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(quadros)[:, None]
    esp = np.abs(np.fft.rfft(x[idx] * janela, axis=1))
    esp = np.log1p(esp * 10)
    fluxo = np.maximum(0, np.diff(esp, axis=0)).sum(axis=1)
    fluxo = np.concatenate([[0], fluxo])
    fluxo -= np.convolve(fluxo, np.ones(16) / 16, mode="same")   # tira a tendência (volume geral)
    fluxo = np.maximum(fluxo, 0)
    fps = sr / hop
    # andamento: autocorrelação, com preferência suave por ~120 BPM (evita escolher metade/dobro)
    ac = np.correlate(fluxo, fluxo, mode="full")[fluxo.size - 1:]
    lags = np.arange(int(np.ceil(fps * 60 / 180)), int(fps * 60 / 70) + 1)
    bpm_lag = 60 * fps / lags
    peso = np.exp(-0.5 * (np.log2(bpm_lag / 115) / 0.6) ** 2)
    lag = int(lags[int(np.argmax(ac[lags] * peso))])
    # dobro/metade se confundem: acima de 160 BPM, fica a metade se ela também marca bem (andamento mais comum)
    alternativa = None
    if 60 * fps / lag > 160 and 2 * lag < ac.size and ac[2 * lag] >= 0.5 * ac[lag]:
        alternativa, lag = round(60 * fps / lag, 1), 2 * lag
    elif 60 * fps / lag < 80 and lag // 2 >= 1 and ac[lag // 2] >= 0.5 * ac[lag]:
        alternativa = round(60 * fps / (lag // 2), 1)
    # andamento fino: interpolação parabólica do pico da autocorrelação
    if 1 <= lag < ac.size - 1:
        y0, y1, y2 = ac[lag - 1], ac[lag], ac[lag + 1]
        den = y0 - 2 * y1 + y2
        lag_f = lag + (0.5 * (y0 - y2) / den if den else 0)
    else:
        lag_f = lag
    bpm = 60 * fps / lag_f
    # fase: a grade que soma mais ataques
    melhor, fase = -1, 0
    for f0 in range(int(lag)):
        s = fluxo[f0::lag].sum() if lag >= 1 else 0
        if s > melhor:
            melhor, fase = s, f0
    grade = np.arange(fase, fluxo.size, lag)
    # ajuste fino de cada batida ao ataque mais próximo (±10% do intervalo)
    viz = max(1, int(lag * 0.1))
    bat = []
    for g in grade:
        a, b = max(0, int(g) - viz), min(fluxo.size, int(g) + viz + 1)
        bat.append((a + int(np.argmax(fluxo[a:b]))) / fps)
    forca = [float(fluxo[int(round(t * fps))]) for t in bat]
    # o ataque aparece no quadro em que a janela de análise começa a cobri-lo: compensa (n − hop) amostras
    bat = [t + (n - hop) / sr for t in bat]
    inicio_forte = int(np.argmax([sum(forca[k::4]) for k in range(4)])) if len(bat) >= 4 else 0
    res = {"arquivo": path, "bpm": round(float(bpm), 1), "bpm_alternativo": alternativa, "dur": round(x.size / sr, 2),
           "batidas": [round(t, 3) for t in bat], "fortes": [round(t, 3) for t in bat[inicio_forte::4]]}
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(res, f)
    return res


# ─────────────────────────── linha de comando ───────────────────────────

def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    _prioridade_baixa()
    ap = argparse.ArgumentParser(prog="agente_midia")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("midias"); a.add_argument("projeto"); a.add_argument("--nao-usados-em")
    a = sub.add_parser("folha"); a.add_argument("fontes", nargs="+"); a.add_argument("--nao-usados-em")
    a.add_argument("--quadros", type=int, default=5); a.add_argument("--por-folha", type=int, default=8)
    a.add_argument("--altura", type=int, default=170)
    a = sub.add_parser("storyboard"); a.add_argument("video"); a.add_argument("--passo", type=float, default=1.5)
    a.add_argument("--inicio", type=float, default=0); a.add_argument("--fim", type=float, default=0)
    a.add_argument("--colunas", type=int, default=8); a.add_argument("--altura", type=int, default=200)
    a = sub.add_parser("transcrever"); a.add_argument("arquivo"); a.add_argument("--idioma", default="pt")
    a = sub.add_parser("batidas"); a.add_argument("audio")
    o = ap.parse_args(argv)
    if o.cmd == "midias":
        r = midias(o.projeto, o.nao_usados_em)
    elif o.cmd == "folha":
        r = folha(o.fontes, o.quadros, o.por_folha, o.altura, o.nao_usados_em)
    elif o.cmd == "storyboard":
        r = storyboard(o.video, o.passo, o.inicio, o.fim, o.colunas, o.altura)
    elif o.cmd == "transcrever":
        r = transcrever(o.arquivo, o.idioma)
    else:
        r = batidas(o.audio)
    print(json.dumps(r, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
