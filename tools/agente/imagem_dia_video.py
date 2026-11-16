"""Imagem do Dia em vídeo (MagnetUS) numa ação só: monta o .vknv do card a partir do modelo aprovado.

Uso:
  py -3.13 tools/agente/imagem_dia_video.py --card "<pasta do card>" [--duracao 40] [--nome "TEMA"] [--db -22]
        [--trilha arquivo.mp3] [--modelo modelo.vknv] [--transcrever] [--refazer] [--so-ver]

O que faz (tudo em um passo, sem mexer em app aberto):
  1. acha em "<card>/02 - ASSETS" a BASE STORY (png/jpg) e o VIDEO NO MONITOR (mp4);
  2. acha o áudio do cliente (audio-do-cliente.*, baixado pelo panda.py) e, com --transcrever, transcreve (whisper);
  3. copia o modelo (D:/kanivete_biblioteca/modelos/magnetus_imagem_dia_video/modelo.vknv), troca as mídias
     e encaixa: exame 0..duracao, base story, trilha com fades, assinatura "Finalização videos.mp4" logo depois;
  4. salva em "<card>/03 - PROJETO/IMAGEM DO DIA - <TEMA>.vknv" e imprime um JSON com o que usou.
Nunca sobrescreve projeto existente (use --refazer). Não exporta nem entrega.
Abrir no app: MCP kanivete_executar_comando video abrir_projeto, ou veOpenProjectExternal(caminho).
"""
import argparse
import copy
import glob
import json
import os
import re
import subprocess
import sys
import time

MODELO = "D:/kanivete_biblioteca/modelos/magnetus_imagem_dia_video/modelo.vknv"
ASSINATURA = "Finalização videos.mp4"
TRILHA_PADRAO = "ES_Mindscape - Lennon Hutton.mp3"


def _ffprobe_dur(caminho):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", caminho],
                           capture_output=True, text=True, timeout=60)
        return float(r.stdout.strip())
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def _mais_novo(padroes, pasta, preferir=()):
    achados = []
    for p in padroes:
        achados += glob.glob(os.path.join(pasta, p))
    if not achados:
        return None
    for termo in preferir:
        pref = [a for a in achados if termo.lower() in os.path.basename(a).lower()]
        if pref:
            achados = pref
            break
    return max(achados, key=os.path.getmtime).replace("\\", "/")


def _raiz_do_cliente(card):
    """Sobe pelas pastas do card até achar a que tem a assinatura (raiz do cliente)."""
    atual = os.path.abspath(card)
    for _ in range(8):
        if os.path.exists(os.path.join(atual, ASSINATURA)):
            return atual.replace("\\", "/")
        pai = os.path.dirname(atual)
        if pai == atual:
            break
        atual = pai
    return None


def _pasta_projeto(card):
    for nome in sorted(os.listdir(card)):
        if re.match(r"^03\s*-\s*PROJETO", nome, re.I) and os.path.isdir(os.path.join(card, nome)):
            return os.path.join(card, nome)
    return os.path.join(card, "03 - PROJETO")


def _tema(card):
    nome = os.path.basename(os.path.abspath(card))
    nome = re.sub(r"^\d+\s*-\s*", "", nome)
    nome = re.sub(r"^IMAGEM DO DIA\s*-\s*", "", nome, flags=re.I)
    return nome.strip() or "SEM TEMA"


def _audio_cliente(card):
    achados = []
    for raiz, _, arqs in os.walk(card):
        if raiz[len(card):].count(os.sep) > 3:
            continue
        achados += [os.path.join(raiz, a) for a in arqs if a.lower().startswith("audio-do-cliente.")]
    return achados[0].replace("\\", "/") if achados else None


def _transcrever(audio):
    import whisper
    r = whisper.load_model("medium", download_root=r"D:/kanivete_testes/whisper").transcribe(audio, language="pt")
    return " ".join(s["text"].strip() for s in r["segments"])


def montar(card, duracao=None, nome=None, db=-22.0, trilha=None, modelo=MODELO, refazer=False, so_ver=False, transcrever=False):
    card = os.path.abspath(card)
    if not os.path.isdir(card):
        raise SystemExit(f"card inexistente: {card}")
    assets = os.path.join(card, "02 - ASSETS")
    base = _mais_novo(["BASE STORY*.png", "BASE STORY*.jpg", "BASE STORY*.jpeg"], assets, preferir=("AJUSTE FINAL",))
    exame = _mais_novo(["VIDEO NO MONITOR*.mp4"], assets, preferir=("LIMPO",))
    faltam = [n for n, v in (("BASE STORY (png/jpg) em 02 - ASSETS", base), ("VIDEO NO MONITOR*.mp4 em 02 - ASSETS", exame)) if not v]
    if faltam:
        raise SystemExit("faltam assets: " + "; ".join(faltam) + " (gere no Photo a partir do PRESSET IMAGEM DO DIA e do exame do cliente)")
    raiz = _raiz_do_cliente(card)
    if not raiz:
        raise SystemExit(f"não achei '{ASSINATURA}' subindo a partir do card (raiz do cliente)")
    assinatura = raiz + "/" + ASSINATURA
    trilha = (trilha or (raiz + "/" + TRILHA_PADRAO)).replace("\\", "/")
    if not os.path.exists(trilha):
        raise SystemExit(f"trilha inexistente: {trilha}")
    d_exame, d_ass = _ffprobe_dur(exame), _ffprobe_dur(assinatura)
    if not d_exame or not d_ass:
        raise SystemExit("ffprobe não leu a duração do exame ou da assinatura")
    dur = round(min(float(duracao), d_exame), 3) if duracao else round(d_exame, 3)
    audio = _audio_cliente(card)
    tema = nome or _tema(card)
    saida = os.path.join(_pasta_projeto(card), f"IMAGEM DO DIA - {tema}.vknv").replace("\\", "/")
    info = {"card": card.replace("\\", "/"), "tema": tema, "base_story": base, "video_exame": exame, "duracao_exame_s": dur,
            "duracao_total_s": round(dur + d_ass, 3), "assinatura": assinatura, "trilha": trilha, "trilha_db": db,
            "audio_do_cliente": audio, "projeto": saida}
    if duracao and float(duracao) > d_exame:
        info["aviso_duracao"] = f"pediu {duracao}s mas o exame tem só {d_exame:.2f}s; usei o do exame"
    if audio and transcrever:
        info["audio_transcricao"] = _transcrever(audio)
    elif audio:
        info["aviso_audio"] = "há áudio do cliente no card: ouça ou rode com --transcrever para conferir o recorte pedido"
    if so_ver:
        info["so_ver"] = True
        return info
    if os.path.exists(saida) and not refazer:
        raise SystemExit(f"já existe: {saida} (use --refazer para recriar; o antigo vira .antes.vknv)")
    d = json.load(open(modelo, encoding="utf8"))
    por_tipo = {}
    for m in d["media"]:
        if m.get("kind") == "image":
            por_tipo["base"] = m
        elif m.get("kind") == "audio":
            por_tipo["trilha"] = m
        elif m.get("kind") == "video" and "finaliza" in (m.get("name") or "").lower():
            por_tipo["ass"] = m
        elif m.get("kind") == "video":
            por_tipo["exame"] = m
    if len(por_tipo) != 4:
        raise SystemExit("o modelo precisa de 1 imagem, 1 vídeo de exame, a assinatura e 1 áudio")
    for chave, caminho in (("base", base), ("exame", exame), ("ass", assinatura), ("trilha", trilha)):
        m = por_tipo[chave]
        m["path"] = caminho
        m["name"] = os.path.basename(caminho)
        m.pop("info", None)
    try:
        from PIL import Image
        with Image.open(base) as im:
            por_tipo["base"]["w"], por_tipo["base"]["h"] = im.size
    except (ImportError, OSError):
        pass
    d_trilha = _ffprobe_dur(trilha)
    if d_trilha:
        por_tipo["trilha"]["dur"] = d_trilha
    ids = {k: int(v["id"]) for k, v in por_tipo.items()}
    total = round(dur + d_ass, 3)
    if d_trilha and d_trilha < total:
        info["aviso_trilha"] = f"a trilha ({d_trilha:.1f}s) é menor que o vídeo ({total:.1f}s)"
    for c in d["clips"]:
        m = c.get("m")
        if m == ids["exame"]:
            c.update(st=0, s=0, e=dur)
        elif m == ids["base"]:
            c.update(st=0, s=0, e=dur)
        elif m == ids["ass"]:
            c.update(st=dur, s=0, e=round(d_ass, 3))
        elif m == ids["trilha"]:
            c.update(st=0, s=0, e=round(min(total, d_trilha or total), 3), g=float(db))
            c["atin"] = {"t": "cp", "d": 1.0}
            c["atout"] = {"t": "cp", "d": 2.0}
    d["sequences"][0]["clips"] = copy.deepcopy(d["clips"])
    d["sequences"][0]["name"] = f"Imagem do Dia - {tema}"
    for m in d["media"]:
        if m.get("kind") == "timeline":
            m["name"] = d["sequences"][0]["name"]
    d["playhead"] = d["sequences"][0]["playhead"] = 0
    d["salvo_em"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    os.makedirs(os.path.dirname(saida), exist_ok=True)
    if os.path.exists(saida):
        os.replace(saida, saida[:-5] + ".antes.vknv")
    with open(saida, "w", encoding="utf8") as f:
        json.dump(d, f, ensure_ascii=False)
    info["criado"] = True
    return info


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--card", required=True)
    ap.add_argument("--duracao", type=float)
    ap.add_argument("--nome")
    ap.add_argument("--db", type=float, default=-22.0)
    ap.add_argument("--trilha")
    ap.add_argument("--modelo", default=MODELO)
    ap.add_argument("--transcrever", action="store_true")
    ap.add_argument("--refazer", action="store_true")
    ap.add_argument("--so-ver", action="store_true")
    a = ap.parse_args()
    info = montar(a.card, a.duracao, a.nome, a.db, a.trilha, a.modelo, a.refazer, a.so_ver, a.transcrever)
    print(json.dumps(info, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
