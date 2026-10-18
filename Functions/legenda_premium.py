"""
legenda_premium.py — a Kani escolhe, lendo o texto, a palavra de destaque de cada título da Legenda Premium
(frontend/js/editor-legenda-premium.js: veLpKani). Quais blocos viram título continua com a montagem automática do
editor (notas por gancho, número, nome, pergunta, palavra longa): no teste do Pailer (2026-10-18) a Kani escolhendo os
títulos ficou pior que a regra — ela marcava poucos e os errados. Aqui ela só refina o destaque, com exemplos.
"""

import json
import re

_SISTEMA = """Você escolhe a palavra de destaque de títulos animados em vídeos curtos em português.
Cada título vem numerado, com as palavras numeradas a partir de 0. Escolha a palavra que carrega o sentido e a emoção do
título: a mais forte, a que a pessoa enfatiza ao falar (adjetivo forte, número, nome, verbo de ação, a palavra nova da
ideia). Nunca artigo, preposição, conjunção, pronome ou verbo fraco (é, ser, ter, ir, fazer).
Exemplos:
0: ninguém(0) odeia(1) editar(2) -> 2
1: legendas(0) dinâmicas(1) -> 1
2: mais(0) de(1) 20(2) títulos(3) -> 2
3: com(0) animações(1) e(2) com(3) personalidade(4) -> 4
4: link(0) na(1) bio(2) -> 2
5: é(0) o(1) tempo(2) que(3) leva(4) -> 2
Responda SÓ com JSON: [{"i":0,"destaque":2}, ...] — um objeto por título recebido."""


def _lote(blocos, idx):
    from Functions.kani_criar import _llm
    linhas = [f"{i}: " + " ".join(f"{w}({j})" for j, w in enumerate(blocos[i])) for i in idx]
    out = _llm(_SISTEMA, "\n".join(linhas), max_tokens=40 + 16 * len(idx), temperatura=0.1)
    if not out:
        return None
    m = re.search(r"\[.*\]", out, re.S)
    if not m:
        return None
    try:
        lista = json.loads(m.group(0))
    except Exception:
        return None
    res = {}
    for o in lista:
        if not isinstance(o, dict):
            continue
        try:
            i, d = int(o.get("i")), int(o.get("destaque", -1))
        except Exception:
            continue
        if i in idx and 0 <= d < len(blocos[i]):
            res[i] = d
    return res


def enfase(clipes, total, palavras):
    """Ênfase de cada palavra na fala: volume (RMS) contra a mediana das vizinhas (±3 s) + quanto ela foi esticada para o
    tamanho dela (a palavra que a pessoa "puxa"). > ~3 = bem marcada. Mixagem = a mesma da transcrição (legendas.py)."""
    import math
    import os
    import wave

    import numpy as np

    from Functions import legendas
    from Functions import video_cutter as vc
    wav = os.path.join(vc._work_dir(), "enfase_legenda.wav")
    legendas._audio_da_timeline(clipes, float(total), wav)
    try:
        with wave.open(wav, "rb") as w:
            sr = w.getframerate()
            x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768.0
    finally:
        vc._apagar(wav)
    P = [(float(p[0]), float(p[1]), str(p[2])) for p in palavras or []]
    nivel, estica = [], []
    for a, b, t in P:
        seg = x[int(a * sr):max(int(a * sr) + 1, int(b * sr))]
        nivel.append(20 * math.log10(float(np.sqrt((seg ** 2).mean())) + 1e-6) if len(seg) else -90.0)
        # alongamento só vale em palavra de 4+ letras (as curtas "esticam" à toa no fim de frase e na pausa)
        letras = sum(ch.isalnum() for ch in t) or 1
        estica.append(math.log2(max(0.7, min(2.0, (b - a) / (0.07 * letras + 0.1)))) if letras >= 4 else 0.0)
    out = []
    for i, (a, b, _) in enumerate(P):
        viz = [nivel[j] for j in range(len(P)) if j != i and abs(P[j][0] - a) <= 3.0]
        ref = float(np.median(viz)) if viz else nivel[i]
        out.append(round((nivel[i] - ref) + 1.5 * estica[i], 2))
    return {"success": True, "enfase": out}


def cor_do_video(caminho, opcoes):
    """Das cores `opcoes` (#rrggbb), a que mais se separa das cores do vídeo: matiz longe do matiz dominante das cenas
    (8 quadros espalhados), com saturação e brilho para aparecer."""
    import colorsys
    import subprocess

    import numpy as np

    from Functions import video_cutter as vc
    from Functions.audio_cutter import ffmpeg_path, _creationflags
    try:
        dur = float(vc.probe(caminho).get("duration") or 0)
    except Exception:
        dur = 0
    passo = max(0.5, dur / 8) if dur else 1.0
    r = subprocess.run([ffmpeg_path(), "-v", "error", "-i", caminho, "-vf", f"fps=1/{passo:.3f},scale=64:64", "-frames:v", "8",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, timeout=120, creationflags=_creationflags())
    px = np.frombuffer(r.stdout, np.uint8).reshape(-1, 3).astype(np.float32) / 255.0
    if not len(px):
        return {"success": False, "error": "não consegui ler quadros do vídeo"}
    mx, mn = px.max(1), px.min(1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    rr, gg, bb = px[:, 0], px[:, 1], px[:, 2]
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == rr, ((gg - bb) / d) % 6, np.where(mx == gg, (bb - rr) / d + 2, (rr - gg) / d + 4)) / 6.0
    peso = s * mx * (s > 0.2) * (mx > 0.2)
    hist = np.bincount((h * 36).astype(int) % 36, weights=peso, minlength=36) + 1e-6
    hist = np.convolve(np.concatenate([hist[-2:], hist, hist[:2]]), np.ones(5) / 5, "valid")
    h_dom = (int(np.argmax(hist)) + 0.5) / 36.0
    colorido = float(peso.mean())
    melhor, nota = None, -1e9
    for c in opcoes or []:
        try:
            cr, cg, cb = (int(str(c)[k:k + 2], 16) / 255.0 for k in (1, 3, 5))
        except Exception:
            continue
        ch, _, cs = colorsys.rgb_to_hls(cr, cg, cb)
        dist = min(abs(ch - h_dom), 1 - abs(ch - h_dom))      # 0..0,5
        # vídeo pouco colorido: qualquer cor viva serve, vale mais a saturação; colorido: vale a distância do matiz
        n = dist * (2.0 if colorido > 0.05 else 0.6) + cs * 0.6
        # o matiz que já domina a cena (±30°) apaga o destaque
        hb = int(ch * 36) % 36
        n -= 1.5 * float(hist[hb] / hist.max())
        if n > nota:
            melhor, nota = c, n
    return {"success": True, "cor": melhor, "dominante": round(h_dom * 360), "colorido": round(colorido, 3)}


def refinar(blocos, titulos=None):
    """blocos = [[palavra, ...], ...]; titulos = índices dos blocos que são título →
    {success, destaques: {índice: palavra}} (em lotes de 30 títulos)."""
    blocos = [[str(w) for w in b][:12] for b in (blocos or [])][:600]
    idx = [int(i) for i in (titulos or []) if 0 <= int(i) < len(blocos) and len(blocos[int(i)]) >= 2]
    if not idx:
        return {"success": False, "error": "Nenhum título com mais de uma palavra para refinar"}
    saida, algum = {}, False
    for k in range(0, len(idx), 30):
        r = _lote(blocos, idx[k:k + 30])
        if r is None:
            if not algum:
                return {"success": False, "error": "A Kani não está disponível (abra a Kani uma vez para baixar o modelo)"}
            continue
        algum = True
        saida.update(r)
    return {"success": True, "destaques": {str(i): d for i, d in saida.items()}}
