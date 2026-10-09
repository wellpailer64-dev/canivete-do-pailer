"""Efeitos de áudio do Premiere no Kanivete (frontend/dados/premiere_audio.json, gerado por tools/premiere_audio_dados.py).
O clipe guarda o efeito como o Premiere: {"t": "pr_<nome>", "v": {"p0": 0..1, "p1": ...}} (valores normalizados, na ordem
dos Params) — a ida e volta não perde nada. Aqui: régua (0..1 → unidade real, medida renderizando no Premiere) e a
montagem do som na exportação (filtros do ffmpeg com os MESMOS coeficientes da prévia: editor-afx-pr.js).
Medições e modelos: Instructions/agente/ponte-premiere.md."""
import json
import math
import os
import re

_ARQ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dados", "premiere_audio.json")
_CACHE = {}
SR = 48000


def dados():
    if "d" not in _CACHE:
        with open(_ARQ, encoding="utf-8") as f:
            _CACHE["d"] = json.load(f)["efeitos"]
        _CACHE["tipo"] = {tipo_de(e["nome"]): (m, e) for m, e in _CACHE["d"].items()}
    return _CACHE["d"]


def tipo_de(nome):
    """'Single-band Compressor' → 'pr_single_band_compressor' (o t do efeito no clipe)."""
    return "pr_" + re.sub(r"[^a-z0-9]+", "_", nome.lower()).strip("_")


def por_tipo(t):
    dados()
    return _CACHE["tipo"].get(t)


def real(regua, v):
    """Valor normalizado (0..1) → unidade real pela régua."""
    if not regua:
        return v
    k = regua[0]
    if k == "lin":
        return regua[1] + (regua[2] - regua[1]) * v
    if k == "quad":
        return regua[1] + (regua[2] - regua[1]) * v * v
    if k == "gain":
        return 20 * math.log10(v * regua[1]) if v > 0 else -200.0
    if k == "tab":
        t = regua[1]
        if v <= t[0][0]:
            return t[0][1]
        for (a, ra), (b, rb) in zip(t, t[1:]):
            if v <= b:
                return ra + (rb - ra) * (v - a) / (b - a)
        return t[-1][1]
    if k == "bool":
        return 1 if v >= 0.5 else 0
    return v


def valores(t, v):
    """{nome do parâmetro: valor real} do efeito t com os normalizados v ({"p0": ...})."""
    m, e = por_tipo(t)
    out = {}
    for i, p in enumerate(e["p"]):
        x = v.get(f"p{i}", p["d"])
        try:
            x = float(x)
        except (TypeError, ValueError):
            x = float(p["d"] or 0)
        out[p["n"]] = real(p.get("m"), x)
    return out


# ── filtros (fórmulas RBJ, as mesmas de editor-afx-pr.js) ──
def _biquad(b, a):
    return "biquad=" + ":".join(f"{k}={x:.12g}" for k, x in zip(("b0", "b1", "b2", "a0", "a1", "a2"), (*b, *a)))


def coef(tipo, f0, q, db=0.0):
    f0 = min(max(f0, 10.0), SR * 0.499)
    a_ = 10 ** (db / 40)
    w = 2 * math.pi * f0 / SR
    c, s = math.cos(w), math.sin(w)
    al = s / (2 * q)
    if tipo == "hp":
        b, a = [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]
    elif tipo == "lp":
        b, a = [(1 - c) / 2, 1 - c, (1 - c) / 2], [1 + al, -2 * c, 1 - al]
    elif tipo == "bp":
        b, a = [al, 0, -al], [1 + al, -2 * c, 1 - al]
    elif tipo == "notch":
        b, a = [1, -2 * c, 1], [1 + al, -2 * c, 1 - al]
    elif tipo == "peak":
        b, a = [1 + al * a_, -2 * c, 1 - al * a_], [1 + al / a_, -2 * c, 1 - al / a_]
    elif tipo in ("low", "high"):
        sa = 2 * math.sqrt(a_) * al
        if tipo == "low":
            b = [a_ * ((a_ + 1) - (a_ - 1) * c + sa), 2 * a_ * ((a_ - 1) - (a_ + 1) * c), a_ * ((a_ + 1) - (a_ - 1) * c - sa)]
            a = [(a_ + 1) + (a_ - 1) * c + sa, -2 * ((a_ - 1) + (a_ + 1) * c), (a_ + 1) + (a_ - 1) * c - sa]
        else:
            b = [a_ * ((a_ + 1) + (a_ - 1) * c + sa), -2 * a_ * ((a_ - 1) + (a_ + 1) * c), a_ * ((a_ + 1) + (a_ - 1) * c - sa)]
            a = [(a_ + 1) - (a_ - 1) * c + sa, 2 * ((a_ - 1) - (a_ + 1) * c), (a_ + 1) - (a_ - 1) * c - sa]
    else:
        raise ValueError(tipo)
    return [x / a[0] for x in b], [1.0, a[1] / a[0], a[2] / a[0]]


def _interp(pontos, x):
    if x <= pontos[0][0]:
        return pontos[0][1]
    for (a, ra), (b, rb) in zip(pontos, pontos[1:]):
        if x <= b:
            return ra + (rb - ra) * (x - a) / (b - a)
    return pontos[-1][1]


# Bass/Treble: prateleira com o Q que muda com o ganho (medido no Premiere 26.5)
Q_BASS = [(-24, 0.71), (-12, 1.0), (0, 1.4), (12, 2.0), (24, 2.0)]
Q_TREBLE = [(-24, 0.3), (-12, 0.3), (0, 0.4), (12, 0.5), (24, 0.71)]
# Single-band Compressor → acompressor do ffmpeg: ataque/release que mais se aproximam do Premiere (v normalizado → ms
# do acompressor, que mede diferente do Audition; ajuste conjunto nos 22 renders: erro médio 1,2 dB, pior 3,9 dB)
ATK_FF = [(0, 0.01), (0.1, 0.125), (0.5, 0.442), (1, 1.025)]
REL_FF = [(0, 0.5), (0.1, 40.4), (0.5, 156.1), (1, 1185.3)]


def _interp_log(pontos, x):
    return math.exp(_interp([(a, math.log(max(b, 1e-6))) for a, b in pontos], x))


def _pan(gl, gr, cruz=None):
    if cruz:
        return "pan=stereo|" + cruz
    return f"pan=stereo|c0={gl:.8g}*c0|c1={gr:.8g}*c1"


def filtros(t, v):
    """Filtros do ffmpeg do efeito (lista vazia = sem som no Kanivete: só passa intacto na ida e volta)."""
    item = por_tipo(t)
    if not item:
        return []
    _, e = item
    if not e.get("som"):
        return []
    r = valores(t, v)
    if r.get("Bypass"):
        return []
    n = e["nome"]
    db = lambda x: 10 ** (x / 20)  # noqa: E731
    if n == "Volume":
        return ["volume=0"] if r["Mute"] else [f"volume={r['Level']:.4f}dB"]
    if n == "Channel Volume":
        return [_pan(db(r["Left"]), db(r["Right"]))]
    if n == "Amplify":
        return [_pan(db(r["Left"]), db(r["Right"]))]
    if n == "Balance":
        p = r["Balance"] / 100
        return [_pan(1 - max(0.0, p), 1 + min(0.0, p))]
    if n in ("Bass", "Treble"):
        g = r["Boost"]
        if abs(g) < 0.01:
            return []
        b, a = coef("low", 200, _interp(Q_BASS, g), g) if n == "Bass" else coef("high", 4000, _interp(Q_TREBLE, g), g)
        return [_biquad(b, a)]
    if n in ("Highpass", "Lowpass"):
        b, a = coef("hp" if n == "Highpass" else "lp", r["Cutoff"], 1 / math.sqrt(2))
        return [_biquad(b, a)] * 2        # Linkwitz-Riley de 4ª ordem
    if n == "Bandpass":
        return [_biquad(*coef("bp", r["Cutoff"], r["Q"]))]
    if n == "Simple Notch Filter":
        return [_biquad(*coef("notch", r["Cutoff"], r["Q"]))]
    if n == "Simple Parametric EQ":
        return [_biquad(*coef("peak", r["Center"], r["Q"], r["Boost"]))] if abs(r["Boost"]) > 0.01 else []
    if n == "Delay":
        d, fb, mix = r["Delay"], r["Feedback"] / 100, r["Mix"] / 100
        if d < 1 or mix <= 0:
            return []
        atrasos, ganhos, k = [], [], 0
        while k < 40 and (k == 0 or fb ** k > 1e-3):
            atrasos.append(d * (k + 1))
            ganhos.append(mix * fb ** k)
            k += 1
        # aecho: saída = in_gain·seco + Σ decay·eco (testado: in_gain=0 vale) — os ecos da realimentação viram toques
        return [f"aecho=in_gain={max(1 - mix, 0.0):.6g}:out_gain=1:delays={'|'.join(f'{x:.3f}' for x in atrasos)}:"
                f"decays={'|'.join(f'{x:.6g}' for x in ganhos)}"]
    if n == "Invert":
        return [_pan(0, 0, "c0=-1*c0|c1=-1*c1")]
    if n == "Swap Channels":
        return [_pan(0, 0, "c0=c1|c1=c0")]
    if n == "Fill Left with Right":
        return [_pan(0, 0, "c0=c1|c1=c1")]
    if n == "Fill Right with Left":
        return [_pan(0, 0, "c0=c0|c1=c0")]
    if n == "Mute":
        if r.get("Mute All", 0) >= 0.5:
            return ["volume=0"]
        return [_pan(0 if r.get("Mute Left", 0) >= 0.5 else 1, 0 if r.get("Mute Right", 0) >= 0.5 else 1)]
    if n == "Pitch Shifter":
        q = r["Transpose Ratio"]
        return [f"rubberband=pitch={q:.6g}:formant=preserved"] if abs(q - 1) > 1e-4 else []
    if n == "Single-band Compressor":
        th, ra = db(r["Threshold"]), max(1.0, min(20.0, r["Ratio"]))
        i_atk = next(i for i, p in enumerate(e["p"]) if p["n"] == "Attack")
        i_rel = next(i for i, p in enumerate(e["p"]) if p["n"] == "Release")
        atk = _interp_log(ATK_FF, float(v.get(f"p{i_atk}", e["p"][i_atk]["d"])))
        rel = _interp_log(REL_FF, float(v.get(f"p{i_rel}", e["p"][i_rel]["d"])))
        fs = [f"acompressor=threshold={max(th, 0.000976563):.8g}:ratio={ra:.4g}:attack={max(0.01, atk):.4g}:"
              f"release={max(0.01, min(9000, rel)):.4g}:makeup=1:knee=1"]
        if abs(r["Gain"]) > 0.01:
            fs.append(f"volume={r['Gain']:.3f}dB")
        return fs
    if n == "Hard Limiter":
        return []   # vira o 'limiter' do Kanivete (para_kanivete), que já faz a conta do Audition
    return []


def para_kanivete(t, v):
    """Efeito do Premiere que o Kanivete faz com um efeito próprio (mesma conta): devolve (t, v) ou None."""
    item = por_tipo(t)
    if not item or item[1]["nome"] != "Hard Limiter":
        return None
    r = valores(t, v)
    return "limiter", {"ceil": max(-30.0, min(0.0, r["Maximum Amplitude"])), "boost": max(-12.0, min(30.0, r["Input Boost"])),
                       "look": max(0.1, min(10.0, r["Look-Ahead Time"])), "rel": max(10.0, min(1000.0, r["Release Time"])),
                       "link": 1 if r.get("Link Channels", 1) else 0}
