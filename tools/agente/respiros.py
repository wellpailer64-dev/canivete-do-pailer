"""Respiros e pausas: plano de cortes dinâmicos lido na onda, para fala (lapela ou vídeo).
    py -3.13 tools/agente/respiros.py audio.wav transcricao.json [--ini S --fim S] [--prev saida.wav] [--json plano.json] [--ver]

O que faz (em vez de "pausa maior que X = corta tudo"):
  1. acha os trechos de voz na onda (cheia + agudos, `onda_voz.Onda`), não nos tempos da transcrição;
  2. classifica cada vão entre palavras: FRASE (depois de . ? !), VIRGULA (, ; :), MEIO (sem pontuação), e marca respiração
     (inspiração: ruído largo e baixo, sem tom) dentro do vão;
  3. decide quanto do vão FICA (pausa mantida), por tipo e pelo ritmo de fala do trecho (fala rápida = pausa menor):
        FRASE ~0,24 s | VIRGULA ~0,14 s | MEIO ~0,08 s (só se o vão passar de 0,30 s)
     vão curto, abaixo do limite, não se mexe: é respiro natural da fala;
  4. o que sobra do vão sai, mas as duas pontas ficam em VALE da onda (nunca onda encostada), o fim da palavra leva a
     cauda inteira (consoante final e decaimento) e a respiração antes da próxima palavra sai por inteiro (ou a pausa
     mantida só começa depois dela);
  5. cada ponta recebe fade de áudio curto (8 ms) no corte seco, cruzado em zero.
Devolve a lista de trechos [ini, fim] da fonte a manter e um resumo em números. Com --prev grava o áudio já cortado para ouvir.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from onda_voz import PASSO, SR, VALE_LIM, Onda  # noqa: E402

MANTER = {"FRASE": 0.24, "VIRGULA": 0.14, "MEIO": 0.08}
LIMITE = {"FRASE": 0.34, "VIRGULA": 0.30, "MEIO": 0.30}   # vão acima disto é encurtado
CAUDA_MIN = 0.07      # depois do fim da voz fica no mínimo isto (consoante final, decaimento)
CABECA_MIN = 0.06     # antes do começo da voz fica no mínimo isto (a consoante inicial acorda tarde)
FADE_S = 0.008


def tipo_do_vao(palavra):
    p = (palavra or "").strip()
    if p[-1:] in ".?!…":
        return "FRASE"
    if p[-1:] in ",;:":
        return "VIRGULA"
    return "MEIO"


def ritmo(palavras, t, jan=6.0):
    """palavras por segundo na janela em torno de t (fala rápida pede pausa menor, lenta aceita maior)"""
    n = [w for w in palavras if t - jan / 2 <= w[0] <= t + jan / 2]
    return len(n) / jan


def fator_ritmo(r):
    """2 pal/s = lenta (x1,2); 3,5 = normal (x1); 5 pal/s = rápida (x0,75)"""
    return float(np.clip(1.0 - (r - 3.5) * 0.17, 0.75, 1.2))


def respiracao(o, a, b):
    """[(ini, fim)] de respiração dentro do vão a..b: voz baixa mas acima do chão, sem pico (ruído largo), 0,12-0,8 s"""
    i0, i1 = max(0, o._i(a)), min(len(o.voz), o._i(b))
    seg = o.voz[i0:i1]
    if not len(seg):
        return []
    mask = (seg >= 1.1) & (seg < 7.0)
    out, ini = [], None
    for j, m in enumerate(list(mask) + [False]):
        if m and ini is None:
            ini = j
        elif not m and ini is not None:
            d = (j - ini) * PASSO
            if 0.12 <= d <= 0.8 and seg[ini:j].max() < 8:
                out.append((round((i0 + ini) * PASSO, 3), round((i0 + j) * PASSO, 3)))
            ini = None
    return out


def voz_fim(o, t0, t1):
    """último instante com voz (acima do vale) em t0..t1, ou None"""
    i0, i1 = max(0, o._i(t0)), min(len(o.voz), o._i(t1))
    v = np.nonzero(o.voz[i0:i1] >= VALE_LIM)[0]
    return (i0 + v[-1] + 1) * PASSO if len(v) else None


def voz_ini(o, t0, t1):
    i0, i1 = max(0, o._i(t0)), min(len(o.voz), o._i(t1))
    v = np.nonzero(o.voz[i0:i1] >= VALE_LIM)[0]
    return (i0 + v[0]) * PASSO if len(v) else None


def plano(o, palavras, ini=0.0, fim=None):
    """-> (trechos [(ini, fim)], vaos [dict]) da fonte, entre o início da 1ª e o fim da última palavra do intervalo"""
    ws = [w for w in palavras if w[0] >= ini - 1e-6 and (fim is None or w[1] <= fim + 1e-6)]
    if not ws:
        return [], []
    comeco = max(0.0, (voz_ini(o, ws[0][0] - 0.4, ws[0][0] + 0.3) or ws[0][0]) - 0.15)
    trechos, vaos, abre = [], [], comeco
    for k in range(len(ws) - 1):
        a, b = ws[k], ws[k + 1]
        # fim real da voz da palavra a e começo real da voz da b, lidos na onda (a transcrição estica e adianta)
        f = voz_fim(o, a[0] + (a[1] - a[0]) * 0.5, b[0] + 0.05)
        i_b = voz_ini(o, max(f or a[1], a[1] - 0.1), b[1])
        if f is None or i_b is None or i_b <= f:
            continue
        vao = i_b - f
        tp = tipo_do_vao(a[2])
        lim = LIMITE[tp] * fator_ritmo(ritmo(palavras, f))
        resp = respiracao(o, f + 0.03, i_b - 0.01)
        info = {"t": round(f, 3), "vao": round(vao, 3), "tipo": tp, "respiracao": resp, "corta": False}
        if vao > lim:
            manter = MANTER[tp] * fator_ritmo(ritmo(palavras, f))
            cauda = max(CAUDA_MIN, manter * 0.6)
            cabeca = max(CABECA_MIN, manter - cauda)
            fim_trecho = f + cauda
            ini_prox = i_b - cabeca
            # respiração colada antes da palavra: a cabeça só começa depois dela
            for r0, r1 in resp:
                if r1 > ini_prox - 0.02 and r0 < i_b:
                    ini_prox = max(ini_prox, r1 + 0.02)
            ini_prox = min(ini_prox, i_b - CABECA_MIN)
            if ini_prox - fim_trecho >= 0.10:
                # as pontas descem ao ponto mais baixo próximo (vale)
                fim_trecho = o._mais_baixo(fim_trecho, 0.03)
                ini_prox = o._mais_baixo(ini_prox, 0.03)
                trechos.append((round(abre, 3), round(fim_trecho, 3)))
                abre = round(ini_prox, 3)
                info.update(corta=True, tirado=round(ini_prox - fim_trecho, 3), mantido=round(vao - (ini_prox - fim_trecho), 3))
        vaos.append(info)
    ultimo = voz_fim(o, ws[-1][0] + (ws[-1][1] - ws[-1][0]) * 0.5, ws[-1][1] + 0.4) or ws[-1][1]
    trechos.append((round(abre, 3), round(min(o.dur, ultimo + 0.18), 3)))
    return trechos, vaos


def resumo(o, trechos, vaos):
    cort = [v for v in vaos if v["corta"]]
    tir = sum(v["tirado"] for v in cort)
    bordas_ruins = 0
    for a, b in trechos[:-1]:
        if o.voz_na_borda(b, "fim") >= 2.0:
            bordas_ruins += 1
    for a, b in trechos[1:]:
        if o.voz_na_borda(a, "inicio") >= 2.0:
            bordas_ruins += 1
    return {
        "trechos": len(trechos), "vaos": len(vaos), "vaos_cortados": len(cort), "segundos_tirados": round(tir, 2),
        "duracao_antes": round(trechos[-1][1] - trechos[0][0], 2), "duracao_depois": round(sum(b - a for a, b in trechos), 2),
        "bordas_com_onda": bordas_ruins,
        "respiracoes_nos_vaos": sum(len(v["respiracao"]) for v in vaos),
        "pausa_mantida_media": round(float(np.mean([v["mantido"] for v in cort])), 3) if cort else 0,
    }


def gravar_previa(wav, trechos, saida):
    """concatena os trechos com fade de 8 ms em cada ponta (corte seco sem estalo)"""
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", wav, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout, np.float32)
    fd = int(FADE_S * SR)
    partes = []
    for a, b in trechos:
        p = x[int(a * SR):int(b * SR)].copy()
        if len(p) > 2 * fd:
            p[:fd] *= np.linspace(0, 1, fd)
            p[-fd:] *= np.linspace(1, 0, fd)
        partes.append(p)
    y = np.concatenate(partes) if partes else np.zeros(1, np.float32)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", saida], input=y.tobytes(), check=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("transcricao")
    ap.add_argument("--ini", type=float, default=0.0)
    ap.add_argument("--fim", type=float, default=None)
    ap.add_argument("--prev")
    ap.add_argument("--json")
    ap.add_argument("--ver", action="store_true")
    a = ap.parse_args()
    palavras = json.load(open(a.transcricao, encoding="utf-8"))["palavras"]
    o = Onda(a.audio)
    tr, vaos = plano(o, palavras, a.ini, a.fim)
    r = resumo(o, tr, vaos)
    print(json.dumps(r, ensure_ascii=False))
    if a.ver:
        for v in vaos:
            print(f"  {v['t']:7.2f}s vão {v['vao']:.2f} {v['tipo']:7s}" + (f" CORTA tira {v['tirado']:.2f} fica {v['mantido']:.2f}" if v["corta"] else " mantém") + (f" resp {v['respiracao']}" if v["respiracao"] else ""))
    if a.prev:
        gravar_previa(a.audio, tr, a.prev)
    if a.json:
        json.dump({"trechos": tr, "vaos": vaos, "resumo": r}, open(a.json, "w", encoding="utf-8"), ensure_ascii=False)
