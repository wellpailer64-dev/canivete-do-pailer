"""Pasta de uma peça nova no método do Pailer, para demanda local (fora do sistema Pandalab).

    py -3.13 tools/agente/nova_peca.py --cliente carlinhos --titulo "Flyer Black Friday" [--tipo estatico] [--criar]

Acha o cliente no mapa do Pandalab (nome ou pasta, sem acento), a pasta do mês das produções, o próximo número na
sequência e o nome no modelo do cliente ("02 - ESTATICO - FLYER BLACK FRIDAY"). Sem --criar só mostra o caminho.
Com --criar monta 01 - BRUTO, 02 - ASSETS, 03 - PROJETO - <nome>, 04 - RENDERS. Peça já existente com o mesmo
título no mês é reaproveitada (não cria outra). Tipos: estatico reels stories carrossel mosaico impressos sites_lp outro.
Demanda do sistema: panda.py baixar já faz o mesmo (pastas.pasta_demanda).
"""
import argparse, json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, r"D:/Kanivete/Plugins/pandalab")
import pastas  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--cliente", required=True)
ap.add_argument("--titulo", required=True)
ap.add_argument("--tipo", default="estatico", choices=sorted(pastas.TIPO_PASTA))
ap.add_argument("--criar", action="store_true")
a = ap.parse_args()

m = pastas.mapa()
alvo = pastas._norm(a.cliente)
achados = [(k, c) for k, c in m.get("clientes", {}).items()
           if alvo and (alvo in pastas._norm(c.get("nome", "")) or alvo in pastas._norm(c.get("pasta", "")))]
if len(achados) != 1:
    print(json.dumps({"erro": "cliente não achado" if not achados else "mais de um cliente",
                      "opcoes": [c.get("nome") for _, c in achados] or sorted(c.get("nome") for c in m.get("clientes", {}).values())},
                     ensure_ascii=False, indent=1))
    sys.exit(1)
k, c = achados[0]
slug = re.sub(r"[^a-z0-9]+", "-", pastas._norm(a.titulo).lower()).strip("-")
d = {"id": f"local-{k}-{slug}", "title": a.titulo, "client": {"id": k, "name": c.get("nome")}, "content_type": a.tipo}
caminho = pastas.pasta_demanda(d, criar=a.criar)
if not caminho:
    print(json.dumps({"erro": "cliente sem pasta no mapa", "cliente": c.get("nome")}, ensure_ascii=False)); sys.exit(1)
sub = sorted(os.listdir(caminho)) if os.path.isdir(caminho) else []
print(json.dumps({"cliente": c.get("nome"), "pasta": caminho, "existe": os.path.isdir(caminho), "subpastas": sub,
                  "criada": a.criar}, ensure_ascii=False, indent=1))
