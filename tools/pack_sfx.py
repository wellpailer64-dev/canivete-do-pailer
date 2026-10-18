"""
pack_sfx.py — converte os mestres WAV do pack novo do Soundboard (montado com tools/fatiar_sfx.py, lista em
manifesto.json) para o formato que vai no app: Opus (.ogg, 48 kHz), volume nivelado, mono quando o som é mono.

Por que não perde qualidade: os sons vieram do YouTube já em Opus de ~105–140 kbps. O WAV de 24 bits só guarda essa
mesma informação num arquivo 10× maior; Opus de 128 kbps (estéreo) / 96 kbps (mono, que é o mesmo que 192 em estéreo
por canal) fica na mesma taxa da fonte e é transparente para efeitos sonoros. Mono = os dois canais iguais (diferença
< 2% do pico): guardar dois canais idênticos é desperdício.

Nivelamento (o mesmo do pack antigo, tools/montar_soundboard.py): média ~-20 dB, pico <= -1 dBFS — os sons do pack
ficam com volume parecido entre si (o "Faah estourado" deixa de estourar).

Uso: py -3.13 tools/pack_sfx.py <pasta_do_pack>   (lê manifesto.json e master/, grava em ogg/ e o relatório)
     --sem-marca   deixa de fora os sons marcados com "licenca" (marca, jogo, filme, biblioteca paga)
     --zip N       monta o pack do app: <pasta>/soundboard/ (catalogo.json versão N + ogg) e <pasta>/soundboard-vN.zip,
                   só com os sons liberados (para o release soundboard-vN; subir VERSAO em Functions/soundboard.py)
"""
import json
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fatiar_sfx as f   # noqa: E402

SR = 48000


def medir(path):
    r = subprocess.run([f._ffmpeg(), "-hide_banner", "-nostats", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr)
    x = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr)
    return (float(m.group(1)), float(x.group(1))) if m and x else (None, None)


def converter(origem, destino):
    x = f.ler(origem)
    mono = float(np.abs(x[:, 0] - x[:, 1]).max()) / (float(np.abs(x).max()) + 1e-9) < 0.02
    media, pico = medir(origem)
    ganho = min(-20.0 - media, -1.0 - pico) if media is not None else 0.0
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    subprocess.run([f._ffmpeg(), "-y", "-v", "error", "-i", origem, "-af", f"volume={ganho:.2f}dB", "-ac", "1" if mono else "2",
                    "-ar", str(SR), "-c:a", "libopus", "-b:a", "96k" if mono else "128k", "-vbr", "on",
                    "-compression_level", "10", "-map_metadata", "-1", destino], check=True)
    return mono, ganho


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    base = sys.argv[1]
    sem_marca = "--sem-marca" in sys.argv
    m = json.load(open(os.path.join(base, "manifesto.json"), encoding="utf-8"))
    tot_wav = tot_ogg = n_mono = 0
    for o in m["sons"]:
        if sem_marca and o.get("licenca"):
            continue
        src = os.path.join(base, "master", o["arq"])
        dst = os.path.join(base, "ogg", o["arq"][:-4] + ".ogg")
        mono, ganho = converter(src, dst)
        o["ogg"] = os.path.relpath(dst, base).replace("\\", "/")
        o["mono"], o["ganho_db"] = mono, round(ganho, 2)
        n_mono += mono
        tot_wav += os.path.getsize(src)
        tot_ogg += os.path.getsize(dst)
    json.dump(m, open(os.path.join(base, "manifesto.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"WAV {tot_wav / 1e6:.1f} MB -> Opus {tot_ogg / 1e6:.1f} MB ({tot_wav / max(1, tot_ogg):.1f}x menor) · {n_mono} em mono")


# ordem das categorias no painel (as que a Legenda Premium usa primeiro)
ORDEM = ["whoosh", "pop", "notificacao", "dinheiro", "impacto", "explosoes", "subdrop", "digital", "tensao", "ambiencia",
         "memes", "gritos", "sinos", "objetos", "trabalho"]


def montar_zip(base, versao):
    import shutil
    import zipfile
    m = json.load(open(os.path.join(base, "manifesto.json"), encoding="utf-8"))
    saida = os.path.join(base, "soundboard")
    shutil.rmtree(saida, ignore_errors=True)
    cats = {}
    for o in m["sons"]:
        if o.get("licenca") or not o.get("ogg"):
            continue
        rel = o["ogg"][len("ogg/"):]
        dst = os.path.join(saida, *rel.split("/"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(base, o["ogg"]), dst)
        s = {"arq": rel, "nome": o["nome"], "dur": o["dur"], "fonte": o.get("fonte", ""), "licenca": "sem copyright (segundo o canal)"}
        if o.get("estilo"):
            s["estilo"] = o["estilo"]
        cats.setdefault(o["cat"], []).append(s)
    nomes = m.get("categorias", {})
    ordem = [c for c in ORDEM if c in cats] + sorted(c for c in cats if c not in ORDEM)
    catalogo = {"versao": versao, "categorias": [{"id": c, "nome": nomes.get(c, c), "sons": cats[c]} for c in ordem]}
    with open(os.path.join(saida, "catalogo.json"), "w", encoding="utf-8") as f2:
        json.dump(catalogo, f2, ensure_ascii=False, indent=1)
    with open(os.path.join(saida, "LEIA-ME.txt"), "w", encoding="utf-8") as f2:
        f2.write("Pack de efeitos sonoros do Soundboard (KANIVETE). Sons cortados de vídeos publicados como sem copyright;\n"
                 "a origem de cada um está no campo \"fonte\" de catalogo.json.\n")
    z = os.path.join(base, f"soundboard-v{versao}.zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_STORED) as zf:   # Opus já é comprimido
        for raiz, _, arqs in os.walk(saida):
            for a in arqs:
                p = os.path.join(raiz, a)
                zf.write(p, os.path.relpath(p, saida).replace("\\", "/"))
    n = sum(len(c["sons"]) for c in catalogo["categorias"])
    print(f"{z}: {n} sons em {len(catalogo['categorias'])} categorias, {os.path.getsize(z) / 1e6:.1f} MB")


if __name__ == "__main__":
    if "--zip" in sys.argv:
        montar_zip(sys.argv[1], int(sys.argv[sys.argv.index("--zip") + 1]))
    else:
        main()
