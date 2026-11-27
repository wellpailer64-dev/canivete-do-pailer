"""Entrada única para ajuste em vídeo já montado: diz qual ferramenta usar pelo sintoma e a chama.
    py -3.13 tools/agente/ajustar.py SINTOMA projeto.vknv [argumentos da ferramenta...]
    py -3.13 tools/agente/ajustar.py ajuda            (lista sintomas)
    py -3.13 tools/agente/ajustar.py indicar "texto do pedido do Pailer"   (sugere o sintoma)
Sintomas: conferir | midia | emenda | corte | pessoas | legenda | abrir
Sempre começa por 'conferir'; o resto vem do conserto que ela imprime. Sem --aplicar as ferramentas só medem.
"""
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
SINTOMAS = {
    "conferir": ("conferir_edicao.py", "listar os problemas (sempre primeiro; --sem-ouvir)", r"conferir|verificar|revisar|tudo certo|pronto"),
    "midia": ("trocar_midia.py", "trocar um arquivo por outra versão: projeto \"parte do nome\" novo.mp4 [--aplicar]", r"troc\w+ (?:o |a )?(?:arquivo|v[ií]deo|abertura|m[ií]dia|clipe)|alta resolu|vers[aã]o (?:nova|melhor)"),
    "emenda": ("fechar_emenda.py", "voz repetida/volta na emenda: projeto TEMPO [--aplicar]", r"voz repetida|repete|ecoa|gagu|volta (?:a )?fala|emenda"),
    "corte": ("checar_cortes.py", "palavra comida no início/fim do corte: projeto [--timeline Nome]", r"comeu|cort\w+ (?:a |as )?(?:palavra|fala|voz)|borda|cortando|corte (?:seco|brusco)"),
    "pessoas": ("pessoas_repetidas.py", "mesma pessoa em dois números de contagem", r"pessoa repetida|mesma pessoa|contagem"),
    "legenda": ("legenda_caixa.py", "maiúsculas/erros de legenda: entrada.srt saida.srt", r"legenda|mai[uú]scula|min[uú]scula"),
    "abrir": ("abrir_teste.py", "abrir no app de teste (--fechar ao terminar)", r"abrir|mostrar no app"),
}


def indicar(txt):
    achou = [k for k, (_, _, rx) in SINTOMAS.items() if re.search(rx, txt, re.I)]
    return achou or ["conferir"]


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] in ("ajuda", "-h", "--help"):
        print(__doc__)
        for k, (f, d, _) in SINTOMAS.items():
            print(f"  {k:9} {f:22} {d}")
        sys.exit(0)
    if a[0] == "indicar":
        for k in indicar(" ".join(a[1:])):
            print(f"{k}: {SINTOMAS[k][0]} — {SINTOMAS[k][1]}")
        sys.exit(0)
    if a[0] not in SINTOMAS:
        sys.exit(f"sintoma desconhecido: {a[0]}. Use: {', '.join(SINTOMAS)}")
    ferramenta = os.path.join(AQUI, SINTOMAS[a[0]][0])
    extra = ["--sem-ouvir"] if a[0] == "conferir" and "--sem-ouvir" not in a else []
    sys.exit(subprocess.run([sys.executable, ferramenta] + a[1:] + extra).returncode)
