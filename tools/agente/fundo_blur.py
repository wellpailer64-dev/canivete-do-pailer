"""Fundo desfocado para fotos com barra preta na timeline de vídeo.

Gera o plano de lotes (executar_lote) para o app de teste, sem tocar no projeto original.
Ordem certa: duplicar primeiro (a cópia de cima herda a escala de encaixe), depois dar
escala de capa e blur no original (que vira o fundo). Usa ids (clp_...), nunca índices,
porque duplicar_clipe reordena a lista.

Uso:
  py -3.13 tools/agente/fundo_blur.py PROJETO.vknv LINHA.json --saida plano.json [--amt 60] [--pular-ids id1,id2]

LINHA.json = resultado de linha_do_tempo (dados.resultado, JSON) salvo em arquivo.
Saída: lista de lotes de até 25 passos, cada um com a revisão a usar (preencher antes de enviar).
"""
import argparse
import json
import sys


def cover_sc(w, h, W=1080, H=1920):
    # escala em % do tamanho nativo que cobre o quadro inteiro
    return round(max(W / w, H / h) * 100 + 1, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("projeto")
    ap.add_argument("linha")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--amt", type=int, default=60)
    ap.add_argument("--pular-ids", default="")
    a = ap.parse_args()

    proj = json.load(open(a.projeto, encoding="utf-8"))
    media = {m["id"]: m for m in proj["media"]}
    # sc atual por (início, mídia): vem do próprio projeto salvo
    sc_por = {}
    for c in proj["clips"]:
        if "p" in c and c.get("tr") == 0:
            sc_por[(round(c["st"], 3), c["m"])] = c["p"]["sc"]

    lin = json.load(open(a.linha, encoding="utf-8"))
    pular = set(x for x in a.pular_ids.split(",") if x)
    alvo = []
    for c in lin["clipes"]:
        if c["tr"] != 0 or c["id"] in pular:
            continue
        m = media.get(c["m"])
        if not m or m.get("kind") != "image":
            continue
        sc_fit = sc_por.get((round(c["st"], 3), c["m"]))
        if sc_fit is None:
            continue
        sc_cov = cover_sc(m["w"], m["h"])
        if sc_cov <= sc_fit + 0.5:  # já cobre o quadro
            continue
        alvo.append((c, sc_cov))

    # ordem decrescente de início: evita que a cópia desloque o próximo alvo
    alvo.sort(key=lambda x: -x[0]["st"])
    passos = []
    for c, sc_cov in alvo:
        passos.append({"comando": "duplicar_clipe", "argumentos": {"id": c["id"], "tr": 1, "st": c["st"]}})
        passos.append({"comando": "propriedades_clipe", "argumentos": {"id": c["id"], "sc": sc_cov}})
        passos.append({"comando": "adicionar_efeito", "argumentos": {"id": c["id"], "efeito": "blur", "params": {"amt": a.amt}}})
    # cada clipe ocupa 3 passos; mantém o clipe inteiro no mesmo lote (máx. 25 passos)
    lotes = []
    atual = []
    for i in range(0, len(passos), 3):
        if len(atual) + 3 > 25:
            lotes.append(atual)
            atual = []
        atual.extend(passos[i:i + 3])
    if atual:
        lotes.append(atual)

    out = {"clipes": len(alvo), "lotes": lotes, "obs": "transacional=true; reler revisao antes de cada lote; dup antes do ajuste"}
    json.dump(out, open(a.saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(alvo)} clipes, {len(lotes)} lotes -> {a.saida}")


if __name__ == "__main__":
    sys.exit(main())
