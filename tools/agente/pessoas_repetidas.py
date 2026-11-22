"""Mesma pessoa em dois itens de uma sequência (contagem de aprovados, desfile de alunos, mosaico de clientes).

Por quê (Carlinhos, card "Mais um aprovado", 2026-11-19): a aluna dos números 6 e 7 era a mesma; eram dois takes
seguidos (07:35:14 e 07:35:37) e só o áudio tinha sido conferido. Ouvir não mostra quem é: precisa comparar ROSTOS.

    py -3.13 tools/agente/pessoas_repetidas.py projeto.vknv [--timeline "Nome"] [--todos] [--json]

- Itens = os números da contagem (textos "Contador N" ou só dígitos) e o vídeo embaixo de cada um;
  sem contagem, --todos compara todos os clipes de vídeo.
- 3 quadros por item, rostos pelo SFace (Functions/busca_rosto.py, o mesmo da busca de pessoas).
- Quem aparece em metade ou mais dos itens é FIXO (o instrutor que faz a selfie com todos) e não conta.
- Outra pessoa em dois itens = REPETIDA (sai com código 1). Também reprova a mesma mídia usada em dois itens.
"""
import argparse
import json
import os
import re
import sys

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ)

MESMA = 0.50   # cosseno SFace: mesma pessoa em itens diferentes (bancada: mesma 0,43–0,89; outras ≤ 0,30)
FIXO = 0.42    # para achar o rosto que aparece em quase todos (o instrutor)


def _itens(d, seq_nome="", todos=False):
    M = {m["id"]: m for m in d["media"] if m}
    seqs = [s for s in d["sequences"] if not s.get("comp")]
    if seq_nome:
        seqs = [s for s in seqs if s["name"] == seq_nome]
    elif d.get("activeSequence"):
        seqs = [s for s in seqs if s["id"] == d["activeSequence"]] or seqs
    s = seqs[0]
    cs = s.get("clips") or d["clips"]
    def video(c):
        m = M.get(c.get("m"), {})
        p = m.get("path") or ""
        return p.lower().endswith((".mp4", ".mov", ".mkv", ".jpg", ".jpeg", ".png", ".heic", ".webp")) and c.get("x") != "a" \
            and not re.search(r"\.(mp3|wav|ogg|m4a)$", p, re.I) and "recort" not in str(c.get("nome", "")).lower()
    vids = [c for c in cs if video(c)]
    cont = [c for c in cs if c.get("tx", {}).get("t", "").strip().isdigit()
            and (re.search(r"contador|contagem", str(c.get("nome", "")), re.I) or True)]
    cont = sorted(cont, key=lambda c: c["st"])
    out = []
    if cont and not todos:
        for t in cont:
            meio = t["st"] + (t["e"] - t["s"]) / 2
            sob = [c for c in vids if c["st"] <= meio < c["st"] + (c["e"] - c["s"])]
            if sob:
                c = min(sob, key=lambda c: c["tr"])
                out.append((t["tx"]["t"].strip(), c, M[c["m"]]["path"]))
    else:
        for c in sorted(vids, key=lambda c: c["st"]):
            out.append((f"{c['st']:.2f}s", c, M[c["m"]]["path"]))
    return s["name"], out


def _rostos_item(caminho, s, e):
    from Functions.busca_rosto import _rostos, _ler_imagem
    import subprocess
    import cv2
    res = []
    if caminho.lower().endswith((".jpg", ".jpeg", ".png", ".heic", ".webp")):
        imgs = [_ler_imagem(caminho)]
    else:
        imgs = []
        for f in (0.2, 0.5, 0.8):
            t = s + (e - s) * f
            b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", caminho, "-frames:v", "1",
                                "-vf", "scale='min(960,iw)':-2", "-f", "image2pipe", "-vcodec", "png", "-"],
                               capture_output=True).stdout
            if b:
                imgs.append(cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR))
    for im in imgs:
        if im is None:
            continue
        for vet, caixa, info in _rostos(im, minimo=34):
            if info[0] >= 0.8:
                res.append(vet)
    return res


def _cache_rostos(caminho, s, e):
    import hashlib
    pasta = os.path.join(os.environ.get("TEMP") or "D:/kanivete_testes/tmp", "pessoas_repetidas")
    os.makedirs(pasta, exist_ok=True)
    st = os.stat(caminho)
    k = hashlib.md5(f"{caminho}|{st.st_size}|{st.st_mtime}|{s:.3f}|{e:.3f}".encode()).hexdigest()
    arq = os.path.join(pasta, k + ".npy")
    if os.path.exists(arq):
        return list(np.load(arq))
    v = _rostos_item(caminho, s, e)
    np.save(arq, np.array(v, np.float32).reshape(-1, 128))
    return v


def _folha(pares, projeto):
    """Uma imagem só com cada par lado a lado (rótulo = itens) para conferir de olho em 1 leitura."""
    import subprocess
    import cv2
    linhas = []
    for x in pares[:12]:
        lado = []
        for p, c in x["_pares"]:
            t = float(c["s"]) + (float(c["e"]) - float(c["s"])) / 2
            b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", p, "-frames:v", "1", "-vf",
                                "scale=160:284:force_original_aspect_ratio=increase,crop=160:284", "-f", "image2pipe", "-vcodec", "png", "-"],
                               capture_output=True).stdout
            im = cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR) if b else np.zeros((284, 160, 3), np.uint8)
            lado.append(im)
        lin = np.hstack(lado)
        cv2.putText(lin, " x ".join(x["itens"]), (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        linhas.append(lin)
    cols = [np.vstack(linhas[k::2]) if linhas[k::2] else None for k in (0, 1)]
    if cols[1] is not None and cols[1].shape[0] < cols[0].shape[0]:
        cols[1] = np.vstack([cols[1], np.zeros((cols[0].shape[0] - cols[1].shape[0], cols[1].shape[1], 3), np.uint8)])
    img = np.hstack([c for c in cols if c is not None])
    arq = os.path.join(os.environ.get("TEMP") or "D:/kanivete_testes/tmp", "pessoas_repetidas", "folha.jpg")
    cv2.imencode(".jpg", img)[1].tofile(arq)
    return arq


def conferir(projeto, timeline="", todos=False):
    d = json.load(open(projeto, encoding="utf-8"))
    nome, itens = _itens(d, timeline, todos)
    n = len(itens)
    achados, olhar = [], []
    # mesma mídia em itens seguidos = vídeo de grupo (vários aprovados juntos): só OLHAR; separados = REPROVADO
    por_midia = {}
    for i, (rot, c, p) in enumerate(itens):
        por_midia.setdefault(p, []).append(i)
    for p, ids in por_midia.items():
        if len(ids) > 1:
            seguidos = ids == list(range(ids[0], ids[0] + len(ids)))
            (olhar if seguidos else achados).append({"tipo": "mesma mídia" + (" (grupo?)" if seguidos else ""),
                                                     "itens": [itens[k][0] for k in ids], "arquivos": [os.path.basename(p)]})
    R = [np.array(_cache_rostos(p, float(c["s"]), float(c["e"])), np.float32).reshape(-1, 128) for rot, c, p in itens]
    def sim(a, b):
        return float((R[a] @ R[b].T).max()) if len(R[a]) and len(R[b]) else -1.0
    # rosto FIXO: casa com rostos de muitos itens (o instrutor da selfie); sai da comparação
    lim_fixo = 3   # aluno aparece no máximo em 2 itens; quem casa com 3+ outras mídias é instrutor
    proprios = []
    for i in range(n):
        manter = []
        for f in R[i]:
            casa = sum(1 for j in range(n) if itens[j][2] != itens[i][2] and len(R[j]) and float((R[j] @ f).max()) >= FIXO)
            if casa < lim_fixo:
                manter.append(f)
        proprios.append(np.array(manter, np.float32).reshape(-1, 128))
    R0, R = R, proprios
    # pessoas de cada item (os 3 quadros juntos): um vetor por pessoa
    def pessoas(V):
        out = []
        for f in V:
            for k, g in enumerate(out):
                if float(g @ f) >= FIXO:
                    break
            else:
                out.append(f)
        return out
    P = [pessoas(r) for r in R0]   # todas as pessoas do item (instrutor incluso)
    Q = [pessoas(r) for r in R]    # só as não fixas
    for i in range(n):
        for j in range(i + 1, n):
            if itens[i][2] == itens[j][2] or not P[i] or not P[j]:
                continue
            casa_i = [max(float(g @ h) for h in P[j]) for g in P[i]]
            casa_j = [max(float(h @ g) for g in P[i]) for h in P[j]]
            # precisa casar uma pessoa NÃO fixa (o aluno), senão é só o instrutor de sempre
            x = max([max(float(g @ h) for h in P[j]) for g in Q[i]] or [-1])
            if x < MESMA:
                continue
            todas = min(casa_i) >= FIXO and min(casa_j) >= FIXO   # todo mundo do par é o mesmo
            achados_ = achados if todas else olhar
            achados_.append({"tipo": "mesma pessoa" if todas else "rosto em comum (instrutor?)", "itens": [itens[i][0], itens[j][0]],
                             "sim": round(x, 2), "arquivos": [os.path.basename(itens[i][2]), os.path.basename(itens[j][2])],
                             "_pares": [(itens[i][2], itens[i][1]), (itens[j][2], itens[j][1])]})
    R = [np.array(x, np.float32).reshape(-1, 128) for x in Q]
    folha = ""
    pares = [x for x in achados + olhar if x.get("_pares")]
    if pares:
        folha = _folha(pares, projeto)
    for x in achados + olhar:
        x.pop("_pares", None)
    sem = [itens[i][0] for i in range(n) if not len(R[i])]
    return {"timeline": nome, "itens": n, "repetidas": achados, "olhar": olhar, "sem_rosto_proprio": sem, "folha": folha}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("projeto")
    ap.add_argument("--timeline", default="")
    ap.add_argument("--todos", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    r = conferir(a.projeto, a.timeline, a.todos)
    if a.json:
        print(json.dumps(r, ensure_ascii=False))
    else:
        print(f"## {r['timeline']}: {r['itens']} itens (rosto fixo, como o do instrutor, ignorado)")
        for x in r["repetidas"]:
            print(f"  REPROVADO  {x['tipo']}: itens {', '.join(x['itens'])} ({', '.join(x['arquivos'])}{', sim ' + str(x['sim']) if 'sim' in x else ''})")
        for x in r["olhar"]:
            print(f"  OLHAR      {x['tipo']}: itens {', '.join(x['itens'])} ({', '.join(x['arquivos'])})")
        if r.get("folha"):
            print(f"  folha p/ conferir de olho (1 imagem): {r['folha']}")
        if r["sem_rosto_proprio"]:
            print(f"  OLHAR      sem rosto próprio achado: {', '.join(r['sem_rosto_proprio'][:20])}")
        print("RESULTADO:", "REPROVADO" if r["repetidas"] else "sem pessoa repetida")
    sys.exit(1 if r["repetidas"] else 0)
