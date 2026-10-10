"""Gerador de efeitos sonoros (Functions/gerador_sfx.py): agendador DDIM igual ao do diffusers e uma geração curta.
Uso: py -3.13 testes/teste_sfx.py [pasta_do_modelo]   (sem modelo instalado, só confere o agendador)
Rodar com TEMP no D: (CLAUDE.md). Sai com 1 se algo não bater."""
import os
import sys
import time

import numpy as np

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from Functions import gerador_sfx as g

falhas = []


def confere(nome, ok, info=""):
    print(("ok   " if ok else "FALHA") + f" {nome} {info}")
    if not ok:
        falhas.append(nome)


# 1) agendador: os mesmos números do diffusers.DDIMScheduler (config do EzAudio XL), medidos no PyTorch
ac = g._alphas_cumprod()
confere("SNR zero no último passo", abs(ac[-1]) < 1e-12, f"{ac[-1]:.2e}")
confere("primeiro alpha", abs(ac[0] - 0.99915) < 1e-4, f"{ac[0]:.5f}")
ts = g._passos_trailing(50)
confere("passos trailing (50)", list(ts[:3]) == [999, 979, 959] and ts[-1] == 19, str(list(ts[:3])) + f"…{ts[-1]}")

# 2) geração curta (2 s, 8 passos) com o modelo, se houver
pasta = sys.argv[1] if len(sys.argv) > 1 else g.pasta_modelo()
if g.instalado(pasta):
    t = time.time()
    r = g.gerar("a dog barking in the distance", segundos=2, passos=8, semente=1, pasta=pasta)
    a = r["audio"]
    confere("áudio gerado", a.shape[0] == 2 * g.SR and np.isfinite(a).all() and np.abs(a).max() > 1e-3,
            f"{a.shape[0]} amostras, pico {np.abs(a).max():.3f}, {time.time() - t:.1f} s")
    r2 = g.gerar("a dog barking in the distance", segundos=2, passos=8, semente=1, pasta=pasta)
    confere("segundo efeito na mesma sessão (DirectML não cai)", np.isfinite(r2["audio"]).all())
    g.liberar()
else:
    print("(modelo não instalado em", pasta, "— só o agendador foi conferido)")

print("\nREPROVADO:" if falhas else "\nAPROVADO", ", ".join(falhas))
sys.exit(1 if falhas else 0)
