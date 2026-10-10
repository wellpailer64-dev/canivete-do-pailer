"""Rodada extra: a Kani inventa recurso que o app não tem? (e não nega o que tem). Mesmo sistema real da Kani."""
import json, os, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")
PERG = [
    ("Como eu faço uma live no YouTube pelo Kanivete?", "NAO"),
    ("Onde fica o editor de planilhas do Kanivete?", "NAO"),
    ("Como eu convido meu cliente pra editar o projeto comigo online, em tempo real, no Kanivete?", "NAO"),
    ("Como eu gero uma música inteira com IA no Kanivete?", "NAO"),
    ("Como eu transformo um texto em voz no Kanivete?", "SIM"),
    ("Como eu tiro o fundo de uma imagem no Kanivete?", "SIM"),
]
sys.argv = ["x"]   # impede o laço principal do bench de rodar
src = open(os.path.join(AQUI, "bancada.py"), encoding="utf-8").read().split("\nfor modelo in sys.argv[1:]:")[0]
ns = {}
exec(compile(src, "bench", "exec"), ns)
out = {}
for modelo in ["qwen3:8b", "qwen3.5:9b", "hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS", "llama3.1:8b"]:
    for m in ["qwen3:8b", "qwen3.5:9b", "hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS", "llama3.1:8b"]:
        ns["descarregar"](m)
    out[modelo] = []
    for p, tipo in PERG:
        txt, med = ns["chat"](modelo, [{"role": "system", "content": ns["kani"]._sistema(p, None)}, {"role": "user", "content": p}])
        out[modelo].append({"p": p, "tipo": tipo, "r": txt})
    print("ok", modelo, flush=True)
json.dump(out, open(os.path.join(AQUI, "resultados", "honestidade.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
