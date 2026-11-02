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

import numpy as np
from PIL import Image, ImageFont

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


def relato(grau, regra, texto):
    global ruins
    ruins += grau == "REPROVADO"
    print(f"  {grau:10} {regra}: {texto}")


SONS = {}


def nivel(p, t0, t1):
    if p not in SONS:
        SONS[p] = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout, dtype=np.float32)
    x = SONS[p][int(t0 * 16000):int(t1 * 16000)]
    return float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)) if len(x) else -99.0


def largura(txt, tam, peso=700):
    nome = f"FontsFree-Net-SFProDisplay-{'Black' if peso == 900 else 'Bold'}.ttf"
    for r in (r"C:/Windows/Fonts", os.path.expandvars(r"%USERPROFILE%/AppData/Local/Microsoft/Windows/Fonts")):
        if os.path.exists(os.path.join(r, nome)):
            return ImageFont.truetype(os.path.join(r, nome), round(tam)).getlength(txt)
    return len(txt) * tam * 0.5


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
    # emenda em que a fonte volta no tempo repete voz ("moto motor", 2026-11-02)
    base = sorted([c for c in cs if c["tr"] == 0 and c.get("x") != "v" and kind(c) == "video"], key=lambda c: c["st"])
    for x, y in zip(base, base[1:]):
        vez = x["e"] - y["s"]
        if x["m"] == y["m"] and vez > 0.01:
            n = nivel(M[x["m"]]["path"], y["s"], x["e"])
            if n > -20:
                relato("REPROVADO" if vez >= 0.12 else "OUVIR", "voz repetida", f"{y['st']:.2f} s volta {vez:.2f} s com voz ({n:.0f} dB): tools/agente/fechar_emenda.py")
    # legenda larga encosta na borda; brasão não cobre o texto da tarja
    tam = float(e.get("tam") or 3.5) * 19.2
    largas = [l for l in legs if largura(l["texto"], tam) > 880]
    if largas:
        relato("REPROVADO", "legenda encosta na borda", "; ".join(f"{l['st']:.1f} '{l['texto']}'" for l in largas[:5]))
    for t_ in [c for c in cs if c.get("tx", {}).get("fOn")]:
        ini = t_["p"]["x"] - largura(t_["tx"]["t"], t_["tx"]["tam"], 900) / 2
        for b_ in [c for c in cs if kind(c) == "image" and c["tr"] != t_["tr"] and c["st"] < t_["st"] + 1 and c["st"] + c["e"] - c["s"] > t_["st"] and abs(c["p"]["y"] - t_["p"]["y"]) < 60]:
            with Image.open(M[b_["m"]]["path"]) as im:
                meio = im.width * b_["p"]["sc"] / 100 * 0.37
            if b_["p"]["x"] + meio > ini:
                relato("REPROVADO", "brasão cobre tarja", f"{t_['st']:.1f} '{t_['tx']['t']}': brasão em x {b_['p']['x']:.0f}, usar {ini - meio - 10:.0f}")
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
