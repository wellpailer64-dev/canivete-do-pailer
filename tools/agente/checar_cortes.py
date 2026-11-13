"""Lê a onda nas bordas dos cortes de fala, como o editor olha a waveform: onda alta encostada no início ou no fim do
corte = palavra comida (regra do Pailer, 2026-11-13). Não altera o projeto.
    py -3.13 tools/agente/checar_cortes.py projeto.vknv [--timeline "Nome"] [--json saida.json] [--sem-ouvir]
Para cada clipe de voz (trilha 0) cuja ponta não emenda com o vizinho na mesma fonte: mede a voz nos 30 ms da borda
(cheia + agudos, tools/agente/onda_voz.py). Ponta com fade de áudio (atin/atout) passa: é o caso sem vale.
Saída por borda suspeita: tempo na timeline, fonte, lado, voz na borda (x o limite), ponta sugerida no vale e,
no fim, o que se ouve nos últimos 1,6 s. Linha com "voz na borda" = REPROVADO no conferir_edicao.py.
"""
import argparse
import json
import os
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from onda_voz import BORDA_LIM, SR, Onda  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("projeto")
ap.add_argument("--timeline", default="")
ap.add_argument("--json", default="")
ap.add_argument("--sem-ouvir", action="store_true", help="não transcreve o fim dos cortes suspeitos")
a = ap.parse_args()
d = json.load(open(a.projeto, encoding="utf-8"))
M = {m["id"]: m for m in d["media"] if m}
q = next(s for s in d["sequences"] if (a.timeline and s["name"] == a.timeline) or (not a.timeline and s["id"] == d["activeSequence"]))


def ouvir(o, t0, t1):
    sys.path.insert(0, r"D:\Kanivete\Plugins\kanibrowser")
    import wa
    x = o.x[int(max(0, t0) * SR):int(t1 * SR)]
    ogg = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "libopus", "-f", "ogg", "-"],
                         input=x.tobytes(), capture_output=True).stdout
    return wa.transcrever_ogg(ogg)


OND, DUR = {}, {}


def onda_de(c):
    """Lapela vinculada a um vídeo: a régua (nível típico da voz) é medida só no trecho do vídeo, como no reel_fala.py;
    na lapela inteira os silêncios entre tomadas baixavam a régua e a mesma borda dava voz a mais."""
    p = M[c["m"]]["path"]
    v = next((x for x in q["clips"] if c.get("lk") and x is not c and x.get("lk") == c["lk"] and x.get("x") == "v"), None)
    if v is None:
        return OND.setdefault((p, 0.0), Onda(p)), 0.0
    ss = round(c["s"] - v["s"], 3)
    vp = M[v["m"]]["path"]
    dv = DUR.setdefault(vp, float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vp],
                                                 capture_output=True, text=True).stdout.strip() or 0) or None)
    return OND.setdefault((p, ss), Onda(p, ss=max(0.0, ss), t=dv)), max(0.0, ss)


fala = sorted([c for c in q["clips"] if c["tr"] == 0 and c.get("x") != "v" and M.get(c.get("m"), {}).get("kind") in ("video", "audio")], key=lambda c: c["st"])
sus = []
for i, c in enumerate(fala):
    ant, prox = (fala[i - 1] if i else None), (fala[i + 1] if i + 1 < len(fala) else None)
    p = M[c["m"]]["path"]
    o, ss = onda_de(c)
    bordas = []
    for lado_f, t_f, fade_f, nb in (("início", c["s"], c.get("atin"), ant), ("fim", c["e"], c.get("atout"), prox)):
        # fade curto (<= 0,1 s) não protege palavra: borda com voz debaixo dele vai para conferir de ouvido (OUVIR, não REPROVADO)
        if fade_f and fade_f.get("d", 0) <= 0.1 and not (nb and nb["m"] == c["m"] and abs((c["s"] - nb["e"]) if lado_f == "início" else (nb["s"] - c["e"])) < 0.02):
            vf = o.voz_na_borda(t_f - ss, "inicio" if lado_f == "início" else "fim")
            if vf >= BORDA_LIM:
                print(f"OUVIR {c['st'] + (t_f - c['s']):7.2f}s {os.path.basename(p)[-14:]} {lado_f} {t_f:.2f} fade curto com voz {vf:.1f}x: conferir de ouvido se a palavra está inteira")
    if not (ant and ant["m"] == c["m"] and abs(c["s"] - ant["e"]) < 0.02) and not c.get("atin") and c["s"] - ss > 0.05:
        bordas.append(("início", c["s"], o.voz_na_borda(c["s"] - ss, "inicio")))
    if not (prox and prox["m"] == c["m"] and abs(prox["s"] - c["e"]) < 0.02) and not c.get("atout") and c["e"] - ss < o.dur - 0.05:
        bordas.append(("fim", c["e"], o.voz_na_borda(c["e"] - ss, "fim")))
    for lado, t, v in bordas:
        if v < BORDA_LIM:
            continue
        sug, limpo = o.ajustar_fim(t - ss) if lado == "fim" else o.ajustar_inicio(t - ss)
        sug = round(sug + ss, 3)
        ouvido = ""
        if lado == "fim" and not a.sem_ouvir:
            ouvido = ouvir(o, max(c["s"], t - 1.6) - ss, t - ss)
        st = c["st"] + (t - c["s"])
        sus.append({"st": round(st, 2), "fonte": os.path.basename(p), "lado": lado, "t": round(t, 3), "voz": round(v, 1),
                    "sugerido": sug, "vale": limpo, "ouvido": ouvido})
        print(f"{st:7.2f}s {os.path.basename(p)[-14:]} {lado} {t:.2f} voz na borda {v:.1f}x | sugerido {sug:.2f}"
              f"{'' if limpo else ' (sem vale: fade de áudio)'}" + (f" | ouvi: ...{ouvido[-40:]}" if ouvido else ""))
print(len(sus), "bordas com voz, em", len(fala), "clipes de voz")
if a.json:
    json.dump(sus, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
