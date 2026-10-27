"""Motion em HTML → timeline nativa: monta cada cena de testes/motion_html no app (--agente=9333), exporta e compara
quadro a quadro com o HTML. Passa se a diferença ficar no piso da compressão (o próprio HTML em H.264).

    py -3.13 testes/teste_motion_html.py [teste1 teste2 ...] [--cpu]   (padrão: placa, a regra do Pailer)

Limites: acima do piso na média ≤ 0,4 e no pior quadro ≤ 1,5 (0..255). Saídas em D:/kanivete_testes/motion_html_teste/.
Rodar ao mexer em tools/motion_html*, nas formas/textos/máscaras do editor ou na camada desenhada da exportação.
"""
import glob, json, os, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CENAS = os.path.join(RAIZ, "testes", "motion_html")
SAIDA = "D:/kanivete_testes/motion_html_teste"
MEDIA, PIOR = 0.4, 1.5


def main():
    a = sys.argv[1:]
    nomes = [x for x in a if not x.startswith("--")] or sorted(os.path.splitext(os.path.basename(f))[0] for f in glob.glob(os.path.join(CENAS, "*.html")))
    env = dict(os.environ, TEMP="D:/kanivete_testes/tmp", TMP="D:/kanivete_testes/tmp")
    ruins = []
    for n in nomes:
        pasta = os.path.join(SAIDA, n)
        cmd = [sys.executable, os.path.join(RAIZ, "tools", "motion_html.py"), os.path.join(CENAS, n + ".html"), "--saida", pasta, "--comparar"]
        if "--cpu" in a:
            cmd.append("--cpu")
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=1200)
        try:
            res = json.load(open(os.path.join(pasta, "comparacao.json")))["resumo"]
        except Exception:
            print(f"  ERRO {n}: {(r.stdout + r.stderr)[-600:]}")
            ruins.append(n); continue
        ok = res["acima_do_piso"] <= MEDIA and res["acima_pior"] <= PIOR and not res["sem_par"]
        print(f"  {'OK  ' if ok else 'RUIM'} {n} · acima do piso {res['acima_do_piso']} (pior {res['acima_pior']}) · "
              f"{res['quadros']} quadros · folha {os.path.join(pasta, 'comparacao_piores.jpg')}")
        if not ok:
            ruins.append(n)
    print(f"{len(nomes) - len(ruins)}/{len(nomes)} cenas OK" + (f" · reprovadas: {', '.join(ruins)}" if ruins else ""))
    return 1 if ruins else 0


if __name__ == "__main__":
    sys.exit(main())
