"""Monta o pacote do banco de vozes (Functions/sk_banco_vozes.py) — não roda no app; só para gerar o zip do release.

Cada voz do CATALOGO é DESENHADA pelo OmniVoice (instruct + semente, falando o TEXTO_DESENHO em português) e conferida
pelo reconhecimento de fala das legendas: se a transcrição não bater (≥ 85% das palavras), tenta a semente seguinte.
Saída: <pasta>/vozes/ (banco.json + <id>.wav) e <pasta>/vozes-vN.zip.  Publicar:
  gh release create vozes-vN <pasta>/vozes-vN.zip --prerelease --title "Banco de vozes vN" --notes "..."
Uso: py -3.13 tools/montar_banco_vozes.py D:/kanivete_testes/banco_vozes
"""
import json
import os
import re
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from Functions import legendas  # noqa: E402
from Functions.midia import ffmpeg  # noqa: E402
from Functions.omnivoice_tool import TEXTO_DESENHO, design_reference  # noqa: E402
from Functions.sk_banco_vozes import CATALOGO, VERSAO  # noqa: E402

norm = lambda s: re.sub(r"[^a-záéíóúâêôãõçà ]", "", s.lower()).split()


def confere(wav):
    w16 = wav[:-4] + "_16.wav"
    subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", wav, "-ac", "1", "-ar", "16000", w16], check=True)
    r = legendas.transcrever_wav(w16, 12, "pt", lambda p, m: None)
    os.remove(w16)
    a, b = norm(TEXTO_DESENHO), norm(" ".join(p[2] for p in r["palavras"]))
    return sum(1 for x in a if x in b) / len(a)


def main(base):
    out = os.path.join(base, "vozes")
    os.makedirs(out, exist_ok=True)
    vozes = []
    for vid, nome, desc, instruct, semente in CATALOGO:
        arq = os.path.join(out, vid + ".wav")
        for s in range(semente, semente + 5):
            design_reference(instruct, arq, s)
            nota = confere(arq)
            print(f"{nome:18} semente {s}: {nota:.0%}", flush=True)
            if nota >= 0.85:
                break
        mp = arq[:-4] + ".tmp.wav"   # nivela (-20 LUFS) para as prévias soarem parecidas
        subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", arq, "-af", "loudnorm=I=-20:TP=-2", "-ar", "24000", "-ac", "1", mp], check=True)
        os.replace(mp, arq)
        vozes.append({"id": vid, "nome": nome, "descricao": desc, "instruct": instruct, "semente": s, "arquivo": vid + ".wav", "texto": TEXTO_DESENHO})
    json.dump({"versao": VERSAO, "licenca": "Vozes sintéticas desenhadas pelo OmniVoice (Apache-2.0); ninguém foi clonado.", "vozes": vozes},
              open(os.path.join(out, "banco.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    z = os.path.join(base, f"vozes-v{VERSAO}.zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zz:
        for n in os.listdir(out):
            zz.write(os.path.join(out, n), n)
    print("ok", z, os.path.getsize(z) // 1024, "KB")


if __name__ == "__main__":
    main(sys.argv[1])
