"""Conferência obrigatória do Método de Edição: aplica ao .vknv as regras que dá para medir.
    py -3.13 tools/agente/conferir_edicao.py projeto.vknv [--timeline "Nome"] [--render arquivo.mp4] [--sem-ouvir]
REPROVADO = corrigir antes de mostrar. OUVIR = borda de corte com voz: ouvir antes de dizer que está pronto.
Sai com código 1 se houver REPROVADO. Regras: Instructions/agente/metodo-edicao-video.md
"""
import argparse
import json
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
sys.path.insert(0, os.path.dirname(os.path.dirname(AQUI)))
from polir_montagem import conferir  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("projeto")
ap.add_argument("--timeline", default="")
ap.add_argument("--render", default="")
ap.add_argument("--sem-ouvir", action="store_true")
a = ap.parse_args()
d = json.load(open(a.projeto, encoding="utf-8"))
M = {m["id"]: m for m in d["media"] if m}
seqs = [s for s in d["sequences"] if not s["id"].startswith("seq_m") and M.get(next((m["id"] for m in d["media"] if m and m.get("sequenceId") == s["id"]), None), {}).get("kind") == "timeline"]
if a.timeline:
    seqs = [s for s in seqs if s["name"] == a.timeline]
ruins = 0


def relato(nivel, regra, texto):
    global ruins
    ruins += nivel == "REPROVADO"
    print(f"  {nivel:10} {regra}: {texto}")


if not d.get("fps") or min(abs(float(d["fps"]) - x) for x in (24, 25, 30, 50, 60)) > 0.001:
    relato("OUVIR" if d.get("fps") and abs(float(d["fps"]) - 29.97) < 0.01 else "REPROVADO", "taxa", f"{d.get('fps')}: só câmera constante fica fora da inteira")
for q in seqs:
    print("##", q["name"])
    cs = q["clips"]
    kind = lambda c: M.get(c.get("m"), {}).get("kind")
    video = [c for c in cs if kind(c) == "video" and c.get("x") != "a" and not M.get(c.get("m"), {}).get("comp")]
    com_zoom = [c for c in video if any(p in (c.get("k") or {}) for p in ("sc", "x", "y", "sx", "sy"))]
    if com_zoom:
        relato("REPROVADO", "zoom no clipe", f"{len(com_zoom)} clipes com movimento no próprio vídeo, a começar em {com_zoom[0]['st']:.2f} s; usar camada de ajuste")
    fx_zoom = [c for c in cs if kind(c) == "ajuste" and any(f["t"] == "zoom" for f in c.get("fx", []))]
    print(f"  {'ok':10} camadas de zoom: {len(fx_zoom)}")
    glow = [c for c in cs if any(f["t"] == "mo_glow" and f.get("on") for f in c.get("fx", []) or [])]
    if glow:
        relato("OUVIR", "bloom", "ligado: só com pedido; conferir a pele")
    r = conferir(cs, list(M.values()))
    if r["pretos"]:
        relato("REPROVADO", "buraco preto", str(r["pretos"][:5]))
    if r["piscas"]:
        relato("OUVIR", "pisca de rosto", f"{r['piscas'][:5]} (tempo, duração): olhar")
    e = {**(d.get("legEstilo") or {}), **(q.get("legEstilo") or {})}
    legs = q.get("legendas") or []
    if legs:
        if e.get("fundo") == "caixa" or not e:
            relato("REPROVADO", "legenda", "com caixa ou sem estilo definido")
        if e.get("maiusc") or any(l["texto"].isupper() and len(l["texto"]) > 3 for l in legs):
            relato("REPROVADO", "legenda", "em maiúsculas")
        if e and not (e.get("sOn") and int(e.get("sOp", 0)) == 100):
            relato("REPROVADO", "legenda", "sombra precisa de opacidade 100")
        bases = sorted(c["st"] for c in cs if c["tr"] == 0 and c.get("x") != "v")
        cruz = [l for l in legs for t in bases if l["st"] + 0.05 < t < l["en"] - 0.05]
        # troca de enquadramento no mesmo trecho da fonte não é troca de cena; só avisa
        if cruz:
            relato("OUVIR", "legenda atravessa corte", f"{len(cruz)}, a primeira em {cruz[0]['st']:.2f} s: '{cruz[0]['texto']}'")
        print(f"  {'ok':10} legendas: {len(legs)}")
    falta = [c for c in cs if M.get(c.get("m"), {}).get("path") and not os.path.isfile(M[c["m"]]["path"]) and not M[c["m"]].get("comp")]
    if falta:
        relato("REPROVADO", "mídia offline", M[falta[0]["m"]]["path"])
    if not a.sem_ouvir:
        o = subprocess.run([sys.executable, os.path.join(AQUI, "checar_cortes.py"), a.projeto, "--timeline", q["name"]], capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
        for lin in [x for x in o.splitlines() if " voz na borda " in x and "voz na borda nan" not in x]:
            relato("OUVIR", "fim de corte", lin.strip())
if a.render:
    print("## render", os.path.basename(a.render))
    som = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", a.render, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    i = re.findall(r"^\s+I:\s+(-?[\d.]+) LUFS", som, re.M)
    p = re.findall(r"^\s+Peak:\s+(-?[\d.]+) dBFS", som, re.M)
    if i and not -16.5 <= float(i[-1]) <= -13.5:
        relato("REPROVADO", "volume", f"{i[-1]} LUFS; alvo -14 a -16")
    if p and float(p[-1]) > -1:
        relato("REPROVADO", "pico", f"{p[-1]} dB; máximo -1")
    print(f"  {'medido':10} {i[-1] if i else '?'} LUFS, pico {p[-1] if p else '?'} dB")
print("RESULTADO:", f"REPROVADO ({ruins})" if ruins else "sem reprovação; ouça o que veio marcado")
sys.exit(1 if ruins else 0)
