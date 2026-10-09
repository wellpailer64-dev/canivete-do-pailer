"""Mixer de trilhas de áudio (editor-mixer.js): Premiere → Kanivete → XML do Premiere e a conta do som na exportação.
Uso: py -3.13 testes/teste_mixer.py ["<projeto.prproj>"]
Sem projeto, usa D:/kanivete_testes/premiere/mixer/mixer.prproj (cópia do "teste audio treck mixer" do Pailer:
A1 −6 dB pan −100 · A2 +3 dB pan 50 solo · A3 mudo · Mix −2 dB). Sai com 1 se algo não bater."""
import math
import os
import re
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from Functions import premiere, premiere_xml, video_cutter as vc

PRPROJ = sys.argv[1] if len(sys.argv) > 1 else r"D:\kanivete_testes\premiere\mixer\mixer.prproj"
falhas = []


def confere(nome, ok, info=""):
    print(("ok   " if ok else "FALHA") + f" {nome} {info}")
    if not ok:
        falhas.append(nome)


# 1) importar: o Mixer vira trilhas.a + master.vol
dados, rel = premiere.converter(PRPROJ)
seq = dados["sequences"][0]
a = (seq.get("trilhas") or {}).get("a") or []
if len(sys.argv) <= 1:
    confere("A1 -6 dB pan -100", a[0] == {"vol": -6.0, "pan": -100.0}, a[0])
    confere("A2 +3 dB pan 50 solo", a[1] == {"vol": 3.0, "pan": 50.0, "solo": True}, a[1])
    confere("A3 mudo", a[2] == {"mute": True}, a[2])
    confere("Mix -2 dB", seq.get("master") == {"vol": -2.0}, seq.get("master"))
else:
    print("trilhas:", a, "master:", seq.get("master"))

# 2) volta pelo XML: volume da trilha + Mix no Audio Levels, pan no Panner, calada pelo solo = desligada
with tempfile.TemporaryDirectory() as tmp:
    path, rx = premiere_xml.exportar(os.path.join(tmp, "volta.xml"), dados)
    x = open(path, encoding="utf-8").read()
# áudio estéreo: 2 trilhas explodidas por trilha do Kanivete (canal 1 e 2) — confere a do canal 1 de cada uma
faixas = re.findall(r"<track[^>]*>.*?</track>", x[x.find("<audio>"):], re.S)[::2]
if len(sys.argv) <= 1:
    def niveis(t):
        return [round(20 * math.log10(float(v)), 2) for v in re.findall(r"<value>([\d.]+)</value>", t)]
    def ligada(t):
        return re.findall(r"<enabled>(\w+)</enabled><locked>", t)[-1] == "TRUE"
    confere("XML A1: -8 dB, pan 0, desligada (solo)", niveis(faixas[0]) == [-8.0] and 'PannerCurrentValue="0"' in faixas[0]
            and not ligada(faixas[0]))
    confere("XML A2: +1 dB, pan 0.75, ligada", niveis(faixas[1]) == [1.0] and 'PannerCurrentValue="0.75"' in faixas[1]
            and ligada(faixas[1]))
    confere("XML A3: -2 dB, desligada (mudo)", niveis(faixas[2]) == [-2.0] and not ligada(faixas[2]))

# 3) exportação: a conta do ffmpeg (volume + balanço) = a da prévia (editor-audio.js: 'trk')
ff = vc.ffmpeg_path()
base = None
for g, p, esperado in ((0, 0, (0, 0)), (-6, -100, (-6, None)), (3, 50, (-3.02, 3)), (-2, 25, (-4.5, -2))):
    fs = vc._filtros_afx(vc._normalizar_afx([{"t": "trk", "v": {"g": g, "p": p}}]))
    cadeia = ",".join(["aformat=channel_layouts=stereo"] + fs + ["astats=metadata=0:measure_overall=none:measure_perchannel=Peak_level"])
    r = subprocess.run([ff, "-hide_banner", "-f", "lavfi", "-i", "sine=f=440:d=1,aformat=channel_layouts=stereo",
                        "-af", cadeia, "-f", "null", "-"], capture_output=True, text=True)
    pk = [float(v) if v != "-inf" else None for v in re.findall(r"Peak level dB: (\S+)", r.stderr)]
    if base is None:
        base = pk[0]
    rel_pk = [None if v is None else round(v - base, 2) for v in pk]
    ok = all((e is None and v is None) or (e is not None and v is not None and abs(v - e) < 0.1) for e, v in zip(esperado, rel_pk))
    confere(f"som g={g} pan={p}", ok, f"L/R = {rel_pk}")

print("\nREPROVADO:" if falhas else "\nAPROVADO", ", ".join(falhas))
sys.exit(1 if falhas else 0)
