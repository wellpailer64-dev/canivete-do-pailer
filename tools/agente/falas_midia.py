"""Fala de um arquivo bruto com tempo por palavra (para escolher frase de depoimento e cortar no vale).

    py -3.13 tools/agente/falas_midia.py arquivo.mp4 [outro.mp4 ...] [--de 10 --ate 30] [--json]

Saída: frases (quebra em pausa >= 0,45 s ou pontuação final) com início/fim na FONTE e as palavras.
Cache em D:/Kanivete/cache/falas (refaz se o arquivo mudar). Usa o mesmo reconhecedor das
legendas (Functions/legendas.transcrever_wav). Para cortar no vale: tools/agente/onda_voz.py.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ)


def _cache(arq):
    import hashlib
    pasta = r"D:\Kanivete\cache\falas"   # fora da pasta do cliente
    h = hashlib.sha1(os.path.abspath(arq).lower().encode("utf-8")).hexdigest()[:16]
    return pasta, os.path.join(pasta, f"{os.path.splitext(os.path.basename(arq))[0][:60]}_{h}.json")


def palavras(arq):
    """[(ini, fim, palavra)] em segundos da fonte, com cache."""
    st = os.stat(arq)
    chave = f"{st.st_size}:{int(st.st_mtime)}"
    pasta, cj = _cache(arq)
    if os.path.exists(cj):
        try:
            d = json.load(open(cj, encoding="utf-8"))
            if d.get("chave") == chave:
                return [tuple(p) for p in d["palavras"]]
        except Exception:
            pass
    from Functions import legendas
    with tempfile.TemporaryDirectory(dir=os.environ.get("TEMP")) as tmp:
        wav = os.path.join(tmp, "a.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", arq, "-vn", "-ac", "1", "-ar", "16000", wav], check=True)
        import wave
        with wave.open(wav) as w:
            total = w.getnframes() / w.getframerate()
        r = legendas.transcrever_wav(wav, total)
    pal = [(round(float(a), 3), round(float(b), 3), str(t).strip()) for a, b, t, *_ in (r.get("palavras") or [])]
    try:
        os.makedirs(pasta, exist_ok=True)
        json.dump({"chave": chave, "palavras": pal}, open(cj, "w", encoding="utf-8"), ensure_ascii=False)
    except OSError:
        pass
    return pal


def frases(pal, pausa=0.45):
    out, cur = [], []
    for p in pal:
        if cur and (p[0] - cur[-1][1] >= pausa or cur[-1][2][-1:] in ".!?"):
            out.append(cur)
            cur = []
        cur.append(p)
    if cur:
        out.append(cur)
    return [{"ini": f[0][0], "fim": f[-1][1], "texto": " ".join(p[2] for p in f)} for f in out]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("arquivos", nargs="+")
    ap.add_argument("--de", type=float)
    ap.add_argument("--ate", type=float)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    tudo = {}
    for arq in a.arquivos:
        pal = palavras(arq)
        if a.de is not None:
            pal = [p for p in pal if p[1] > a.de]
        if a.ate is not None:
            pal = [p for p in pal if p[0] < a.ate]
        tudo[arq] = {"frases": frases(pal), "palavras": pal}
        if not a.json:
            print("==", os.path.basename(arq))
            for f in tudo[arq]["frases"]:
                print(f"  {f['ini']:7.2f}-{f['fim']:6.2f}  {f['texto']}")
    if a.json:
        sys.stdout.reconfigure(encoding="utf-8")
        print(json.dumps(tudo, ensure_ascii=False))


if __name__ == "__main__":
    main()
