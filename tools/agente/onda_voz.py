"""Borda de corte de fala lida na onda, como o editor lê a waveform (regra do Pailer, 2026-11-13).
Corte seco só abre e fecha em VALE (onda baixa); onda alta encostada na borda = palavra comida no início ou no fim.

Duas leituras a cada 10 ms, cada uma relativa ao próprio nível típico da fonte:
  cheia  = energia total (vogais);
  aguda  = energia depois de 2 derivadas (realça 4-8 kHz: s, x, f, t).
A cheia sozinha quase some no "s": "impre-SS-ão" parecia pausa e o corte caía no meio da palavra (Casa Morumbi).
voz = maior das duas. Vale = trecho de pelo menos VALE_MIN com voz abaixo de VALE_LIM.

Uso no gerador (reel_fala.py) e na conferência (checar_cortes.py):
    o = Onda(caminho)          # ou Onda(caminho, ss=..., t=...)
    o.voz_na_borda(t, "fim")   # média da voz nos 30 ms do lado que fica, em múltiplos do limite
    o.ajustar_fim(t, palavra_fim, prox_inicio)   -> (instante no vale, limpo)
    o.ajustar_inicio(t, palavra_ini, ant_fim)    -> (instante no vale, limpo)
limpo=False: não há vale (duas vozes emendadas); o corte vai ao ponto mais baixo e leva fade de áudio de FADE s.
"""
import subprocess

import numpy as np

SR = 16000
PASSO = 0.01
VALE_LIM = 2.0     # voz abaixo de 2x o limite = vale (o limite é 25% do nível típico da fonte)
VALE_MIN = 0.06    # vale mais curto é a oclusão de uma consoante (o "t" de "pon-te" tem 50 ms e virava "ponto")
BORDA_LIM = VALE_LIM   # voz média nos 30 ms da borda acima do nível de vale = onda encostada no corte
CAUDA = 0.07       # o fim entra no vale até 70 ms depois da última onda: a palavra respira
CABECA = 0.08      # o início abre até 80 ms antes da primeira onda
FADE = 0.04        # sem vale (vozes emendadas): corte no ponto mais baixo com fade de áudio curto, nunca onda seca


def ler(p, ss=0.0, t=None):
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", f"{ss:.3f}"] if ss else []) + ["-i", p] + (["-t", f"{t:.3f}"] if t else []) + ["-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.float32)


def _env(x):
    return np.sqrt(np.convolve(x.astype(np.float64) ** 2, np.ones(320) / 320, "same"))[::160]


class Onda:
    def __init__(self, fonte, ss=0.0, t=None):
        x = ler(fonte, ss, t) if isinstance(fonte, str) else np.asarray(fonte, np.float32)
        self.x = x
        cheia = _env(x)
        aguda = _env(np.diff(np.diff(x, prepend=0), prepend=0))
        self.lim = max(0.012, float(np.percentile(cheia, 60)) * 0.25) if len(cheia) else 0.012
        self.lim_a = max(1e-4, float(np.percentile(aguda, 60)) * 0.25) if len(aguda) else 1e-4
        self.cheia = cheia / self.lim
        self.voz = np.maximum(self.cheia, aguda / self.lim_a)
        self.dur = len(self.voz) * PASSO

    def _i(self, t):
        return int(round(t / PASSO))

    def media(self, t0, t1):
        a, b = max(0, self._i(t0)), min(len(self.voz), self._i(t1))
        return float(self.voz[a:b].mean()) if b > a else 0.0

    def voz_na_borda(self, t, lado):
        """lado 'fim': os 30 ms antes do corte (o que fica); 'inicio': os 30 ms depois."""
        return self.media(t - 0.03, t) if lado == "fim" else self.media(t, t + 0.03)

    def vales(self, t0, t1):
        """[(a, b)] em segundos: trechos de pelo menos VALE_MIN com voz abaixo de VALE_LIM entre t0 e t1"""
        a0, b0 = max(0, self._i(t0)), min(len(self.voz), self._i(t1))
        out, ini = [], None
        for i in range(a0, b0 + 1):
            baixo = i < b0 and self.voz[i] < VALE_LIM
            if baixo and ini is None:
                ini = i
            elif not baixo and ini is not None:
                if (i - ini) * PASSO >= VALE_MIN - 1e-9:
                    out.append((ini * PASSO, i * PASSO))
                ini = None
        return out

    def sibilantes(self, t0, t1, minimo=0.04):
        """[(a, b)]: energia cheia baixa e agudo alto = "s", "x", "ch" no começo da palavra seguinte (sem silêncio antes)"""
        a0, b0 = max(0, self._i(t0)), min(len(self.voz), self._i(t1))
        m = [(self.cheia[i] < VALE_LIM <= self.voz[i]) for i in range(a0, b0)] + [False]
        out, ini = [], None
        for j, x in enumerate(m):
            if x and ini is None:
                ini = j
            elif not x and ini is not None:
                fim_s = a0 + j
                # só conta se uma vogal vem colada depois: "s" seguido de silêncio é o fim da nossa palavra
                # ("pon-tchi" paulista, "nós"), não o começo da próxima
                if (j - ini) * PASSO >= minimo - 1e-9 and self.cheia[fim_s:fim_s + 6].max(initial=0) >= 2.4:
                    out.append(((a0 + ini) * PASSO, fim_s * PASSO))
                ini = None
        return out

    def _no_vale(self, v, lado, folga):
        a, b = v
        meio = (b - a) / 2
        return round(a + min(folga, meio), 3) if lado == "fim" else round(b - min(folga, meio), 3)

    def _mais_baixo(self, t, raio=0.12):
        a, b = max(0, self._i(t - raio)), min(len(self.voz), self._i(t + raio))
        return round((a + int(np.argmin(self.voz[a:b]))) * PASSO, 3) if b > a else t

    def ajustar_fim(self, t, palavra_fim=None, prox_inicio=None, alcance=0.5):
        """Fim do corte num vale -> (instante, limpo). A onda que encosta na borda é da palavra que fica (vai até o
        vale seguinte) ou do começo da que sai (volta para o vale anterior). limpo=False: vozes emendadas, sem vale
        (ou a próxima começa num "s" colado); o corte fica no ponto mais baixo e pede fade de áudio de FADE s."""
        if self.voz_na_borda(t, "fim") < BORDA_LIM:
            return t, True
        ref = palavra_fim if palavra_fim is not None else t
        teto = t + alcance if prox_inicio is None else max(t + 0.15, min(t + alcance + 0.4, prox_inicio + 0.35))
        # candidatos: silêncio (corte dentro, com cauda) ou "s" da palavra seguinte (corte logo antes dele)
        cand = [(a, b, "v") for a, b in self.vales(t - alcance, teto)]
        cand += [(a, a + 0.02, "s") for a, b in self.sibilantes(t - alcance, teto) if a >= ref - 0.15]
        antes = sorted([c for c in cand if c[1] <= t + 1e-9], key=lambda c: c[1])
        depois = sorted([c for c in cand if c[0] >= t - 1e-9], key=lambda c: c[0])
        gb, gf = (antes[-1] if antes else None), (depois[0] if depois else None)
        volta = False
        if gb and gf:
            onda = gf[0] - gb[1]            # a onda que atravessa o corte
            if onda < 0.12 and gb[2] == "v" and gb[1] - gb[0] >= 0.15:
                volta = True                # estalo ou respiração solta depois de um silêncio: fica de fora
            elif prox_inicio is not None and gb[1] >= ref - 0.15 and prox_inicio <= gb[1] + 0.2:
                volta = True                # a onda nasce onde a próxima palavra começa: é ela, não a nossa
        elif gb and not gf:
            volta = True
        g = gb if (volta and gb) else gf
        if g is None:
            return self._mais_baixo(t), False
        if g[2] == "s":     # a próxima palavra começa num "s" colado: sem silêncio entre as duas, leva fade curto
            return round(g[0] + 0.01, 3), False
        return self._no_vale(g[:2], "fim", CAUDA), True

    def ajustar_inicio(self, t, palavra_ini=None, ant_fim=None, alcance=0.5):
        """Início do corte num vale, antes da primeira onda da palavra que entra -> (instante, limpo).
        Onda que já vinha de antes do corte é o rabo da palavra anterior: o início pula para o vale depois dela."""
        if self.voz_na_borda(t, "inicio") < BORDA_LIM and self.media(t - 0.03, t) < BORDA_LIM:
            return t, True
        antes = [v for v in self.vales(max(0.0, t - alcance), t) if v[1] <= t + 1e-9]
        depois = [v for v in self.vales(t, t + alcance) if v[0] >= t - 1e-9]
        gb, gf = (antes[-1] if antes else None), (depois[0] if depois else None)
        ref = palavra_ini if palavra_ini is not None else t
        rabo = gb is not None and gf is not None and gb[1] < ref - 0.25 and gf[1] <= ref + 0.1
        if rabo or (gb is None and gf is not None):
            return self._no_vale(gf, "inicio", CABECA), True
        if gb:
            return self._no_vale(gb, "inicio", CABECA), True
        return self._mais_baixo(t), False
