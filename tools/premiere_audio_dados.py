"""Gera frontend/dados/premiere_audio.json: os efeitos de áudio do Premiere (catálogo lido pelo plugin Kanivete Ponte)
+ a régua de cada parâmetro (valor 0..1 do Premiere → unidade real), medida renderizando no próprio Premiere
(Instructions/agente/ponte-premiere.md). Uso: py -3.13 tools/premiere_audio_dados.py [catalogo_efeitos.json]
Réguas: ["lin", a, b] = a + (b−a)·v · ["quad", a, b] = a + (b−a)·v² · ["gain", max] dB = 20·log10(v·max)
        ["tab", [[v, real], ...]] interpolada · ["bool"] · sem régua = número cru 0..1."""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "tools", "ponte_premiere", "catalogo_efeitos.json")
SAIDA = os.path.join(RAIZ, "frontend", "dados", "premiere_audio.json")

GANHO15 = ["gain", 5.6234132519]          # Volume/Channel Volume: 1,0 = +15 dB, 0,1778 = 0 dB
FREQ = ["quad", 20, 24000]                # Highpass, Lowpass, Bandpass, Notch, Simple Parametric EQ
CATEGORIA = {
    "Amplitude and Compression": ["Amplify", "Channel Mixer", "Channel Volume", "DeEsser", "Dynamics", "Dynamics Processing",
                                  "Hard Limiter", "Multiband Compressor", "Single-band Compressor", "Tube-modeled Compressor",
                                  "Volume", "Balance", "Mute"],
    "Delay and Echo": ["Analog Delay", "Delay", "Multitap Delay"],
    "Filter and EQ": ["Bandpass", "Bass", "FFT Filter", "Graphic Equalizer (10 Bands)", "Graphic Equalizer (20 Bands)",
                      "Graphic Equalizer (30 Bands)", "Highpass", "Lowpass", "Notch Filter", "Parametric Equalizer",
                      "Scientific Filter", "Simple Notch Filter", "Simple Parametric EQ", "Treble"],
    "Modulation": ["Chorus/Flanger", "Flanger", "Phaser"],
    "Noise Reduction/Restoration": ["Adaptive Noise Reduction", "Automatic Click Remover", "DeHummer", "DeNoise", "DeReverb"],
    "Reverb": ["Convolution Reverb", "Studio Reverb", "Surround Reverb"],
    "Special": ["Distortion", "Fill Left with Right", "Fill Right with Left", "GuitarSuite", "Invert", "Loudness Meter",
                "Loudness Radar", "Mastering", "Swap Channels", "Vocal Enhancer"],
    "Stereo Imagery": ["Stereo Expander"],
    "Time and Pitch": ["Pitch Shifter"],
}
# régua por (efeito, parâmetro) + "som" = o Kanivete reproduz (prévia e exportação); o resto passa intacto (ida e volta)
REGUAS = {
    "Volume": {"Level": GANHO15, "Mute": ["bool"]},
    "Channel Volume": {"Left": GANHO15, "Right": GANHO15},
    "Balance": {"Balance": ["lin", -100, 100]},
    "Amplify": {"Left": ["lin", -96, 48], "Right": ["lin", -96, 48], "Link Sliders": ["bool"]},
    "Bass": {"Boost": ["lin", -24, 24]},
    "Treble": {"Boost": ["lin", -24, 24]},
    "Highpass": {"Cutoff": FREQ},
    "Lowpass": {"Cutoff": FREQ},
    "Bandpass": {"Cutoff": FREQ, "Q": ["quad", 0.1, 10.1]},
    "Simple Notch Filter": {"Cutoff": FREQ, "Q": ["quad", 0.1, 10.1]},
    "Simple Parametric EQ": {"Center": FREQ, "Boost": ["lin", -24, 24],
                             "Q": ["tab", [[0, 2.56], [0.05, 1.71], [0.1, 0.84], [0.2, 0.289], [0.25, 0.193], [0.35, 0.107],
                                           [0.5, 0.063], [1, 0.05]]]},
    "Delay": {"Delay": ["lin", 0, 2000], "Feedback": ["lin", 0, 100], "Mix": ["lin", 0, 100]},
    "Pitch Shifter": {"Transpose Ratio": ["tab", [[0, 0.4977], [0.25, 0.8739], [0.3333, 1], [0.4, 1.0955], [0.5, 1.2398],
                                                  [0.75, 1.6216], [1, 2.0045]]]},
    "Single-band Compressor": {"Threshold": ["lin", -60, 0], "Ratio": ["lin", 1, 30], "Gain": ["lin", -30, 30],
                               "Attack": ["lin", 0, 500], "Release": ["lin", 0, 5000], "Auto Makeup Gain": ["bool"]},
    "Hard Limiter": {"Maximum Amplitude": ["lin", -100, 0], "Input Boost": ["lin", -100, 50],
                     "Look-Ahead Time": ["lin", 0, 52.5], "Release Time": ["lin", 0, 266.7], "Link Channels": ["bool"]},
    "Parametric Equalizer": {**{f"EQ Band {k} Center Frequency": ["lin", 20, 24000] for k in range(1, 6)},
                             **{f"EQ Band {k} Q": ["lin", 0, 1330] for k in range(1, 6)},
                             **{f"EQ Band {k} Gain": ["lin", -30, 30] for k in range(1, 6)},
                             **{f"EQ Band {k} Enable": ["bool"] for k in range(1, 6)},
                             "Low Shelf Frequency": ["lin", 20, 24000], "High Shelf Frequency": ["lin", 20, 24000]},
    "DeEsser": {"Center Frequency": ["tab", [[0.2, 2000], [0.39, 4000], [0.6, 8000]]]},
}
UNIDADE = {"lin": None, "quad": "Hz", "gain": "dB"}
SOM = {"Volume", "Channel Volume", "Balance", "Amplify", "Bass", "Treble", "Highpass", "Lowpass", "Bandpass",
       "Simple Notch Filter", "Simple Parametric EQ", "Delay", "Invert", "Swap Channels", "Fill Left with Right",
       "Fill Right with Left", "Mute", "Pitch Shifter", "Single-band Compressor", "Hard Limiter"}
UNID = {"Cutoff": "Hz", "Center": "Hz", "Boost": "dB", "Level": "dB", "Left": "dB", "Right": "dB", "Balance": "",
        "Delay": "ms", "Feedback": "%", "Mix": "%", "Threshold": "dB", "Gain": "dB", "Attack": "ms", "Release": "ms",
        "Maximum Amplitude": "dB", "Input Boost": "dB", "Look-Ahead Time": "ms", "Release Time": "ms",
        "Center Frequency": "Hz", "Ratio": ":1", "Transpose Ratio": "×"}


def main():
    cat = json.load(open(CAT, encoding="utf-8"))
    cat_de = {n: c for c, ns in CATEGORIA.items() for n in ns}
    out = {}
    for nome, e in cat.items():
        if "erro" in e:
            continue
        r = REGUAS.get(nome, {})
        params = []
        for p in e["params"]:
            item = {"n": p["nome"], "d": p["valor"] if not isinstance(p["valor"], bool) else int(p["valor"])}
            if p["nome"] in r:
                item["m"] = r[p["nome"]]
                u = UNID.get(p["nome"]) or ("Hz" if "Frequency" in p["nome"] else "dB" if "Gain" in p["nome"] else "")
                if r[p["nome"]][0] != "bool" and u:
                    item["u"] = u
            elif p["nome"] == "Bypass" or isinstance(p["valor"], bool):
                item["m"] = ["bool"]
            params.append(item)
        out[e["match"]] = {"nome": nome, "cat": cat_de.get(nome, "Special"), "som": nome in SOM, "p": params}
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    tudo = {"versao": 1, "premiere": "26.5", "efeitos": out}
    json.dump(tudo, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    # o mesmo para o front (carregado por <script>, sem fetch): editor-afx-pr.js lê window.VE_PR_DADOS
    with open(SAIDA[:-5] + ".js", "w", encoding="utf-8") as f:
        f.write("// gerado por tools/premiere_audio_dados.py — não editar\nwindow.VE_PR_DADOS = ")
        json.dump(tudo, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"{SAIDA}: {len(out)} efeitos, {sum(1 for e in out.values() if e['som'])} com som no Kanivete")


if __name__ == "__main__":
    main()
