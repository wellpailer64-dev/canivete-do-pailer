"""Arquiteto Local B: opcao local para planejar tarefas do Canivete sem substituir o Claude.

Ele conversa com um modelo local no Ollama e gera:
  - contratos para o Worker do Photo Kanivete; ou
  - HTML/CSS para KNV.cena, em flyers/carrosseis simples.

Por padrao ele NAO executa nada: salva os artefatos em D:/kanivete_testes/arquiteto_local.
Use --executar para chamar tools/worker/worker.py ou tools/knv.py depois de gerar.

Uso rapido:
  py -3.13 tools/worker/arquiteto.py contrato "troque o titulo..." --documento D:/peca.iknv --exportar D:/saida --executar
  py -3.13 tools/worker/arquiteto.py cena "carrossel de 3 slides..." --formato retrato --slides 3 --executar
  py -3.13 tools/worker/arquiteto.py chat
"""
import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA_PADRAO = r"D:\kanivete_testes\arquiteto_local"
MODELOS_ARQUITETO = [
    "qwen3:14b",
    "hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS",
    "gemma4:e4b",
    "qwen3:8b",
]
PERFIS_MODELO = {
    "rapido": ["qwen3:8b", "gemma4:e4b"],
    "equilibrado": ["hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS", "gemma4:e4b", "qwen3:8b"],
    "forte": ["qwen3:14b", "hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS", "gemma4:e4b", "qwen3:8b"],
}
MODELO_WORKER = "qwen3:8b"
RESERVA_WORKER = "gemma4:e4b"
OLLAMA = "http://127.0.0.1:11434"
FORMATOS = {
    "feed": (1080, 1350),
    "feed4x5": (1080, 1350),
    "retrato": (1080, 1440),
    "story": (1080, 1920),
    "quadrado": (1080, 1080),
}
SPIN = "|/-\\"


def modelo_label(nome):
    mapa = {
        "qwen3:14b": "qwen3:14b cheio",
        "hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS": "qwen3:14b IQ3",
        "gemma4:e4b": "gemma4:e4b",
        "qwen3:8b": "qwen3:8b",
        "qwen3:1.7b": "qwen3:1.7b",
    }
    return mapa.get(nome, nome.split("/")[-1][:28])


def barra(pct, tam=24):
    pct = max(0, min(100, int(pct)))
    cheio = round(tam * pct / 100)
    return "[" + "#" * cheio + "-" * (tam - cheio) + f"] {pct:3d}%"


def etapa(pct, msg):
    print(f"{barra(pct)} {msg}", file=sys.stderr, flush=True)


def limpar_linha():
    print("\r" + " " * 110 + "\r", end="", file=sys.stderr, flush=True)


class Spinner:
    def __init__(self, pct, msg, modelo=None):
        self.pct = pct
        self.msg = msg
        self.modelo = modelo
        self.fim = threading.Event()
        self.t0 = time.time()
        self.th = threading.Thread(target=self._rodar, daemon=True)

    def __enter__(self):
        self.th.start()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.fim.set()
        self.th.join(timeout=1)
        limpar_linha()

    def _rodar(self):
        i = 0
        avisou_lento = False
        while not self.fim.is_set():
            extra = ""
            if self.modelo and i % 10 == 0:
                ativos = modelos_ativos()
                if ativos:
                    extra = " | ativo: " + ", ".join(modelo_label(x) for x in ativos[:2])
            dt = int(time.time() - self.t0)
            dica = ""
            if dt >= 45 and not avisou_lento:
                dica = " | dica: Ctrl+C e --perfil rapido se quiser iterar"
                avisou_lento = True
            print(f"\r{barra(self.pct)} {SPIN[i % len(SPIN)]} {self.msg} ({dt}s){extra}{dica}"[:130],
                  end="", file=sys.stderr, flush=True)
            i += 1
            self.fim.wait(0.4)


def slug(txt):
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", txt.strip().lower())[:42].strip("_")
    return s or time.strftime("tarefa_%H%M%S")


def ler_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def gravar_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def gravar_texto(path, txt):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(txt)


def aviso(msg):
    print(f"[arquiteto] {msg}", file=sys.stderr, flush=True)


def http_json(path, corpo=None, timeout=120):
    data = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(
        OLLAMA + path,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def modelos_instalados():
    try:
        r = http_json("/api/tags", timeout=5)
    except Exception:
        return []
    return [m.get("name") for m in r.get("models", []) if m.get("name")]


def modelos_ativos():
    try:
        r = http_json("/api/ps", timeout=1)
    except Exception:
        return []
    return [m.get("name") for m in r.get("models", []) if m.get("name")]


def escolher_modelo(preferido="auto", perfil="equilibrado"):
    if preferido and preferido != "auto":
        return [preferido]
    instalados = set(modelos_instalados())
    ordem = PERFIS_MODELO.get(perfil, PERFIS_MODELO["equilibrado"])
    out = []
    for m in ordem:
        if m in instalados:
            out.append(m)
    return out or [MODELO_WORKER]


def ollama(modelo, msgs, temperatura=0.15, timeout=900, pensar=False):
    corpo = {
        "model": modelo,
        "stream": False,
        "messages": msgs,
        "keep_alive": "10m",
        "options": {"temperature": temperatura, "num_ctx": 16384},
    }
    if modelo.startswith(("qwen3", "gemma4")):
        corpo["think"] = bool(pensar)
    return http_json("/api/chat", corpo, timeout=timeout)


def chamar_arquiteto(modelos, msgs, temperatura=0.15, pct=15, timeout=240, pensar=False):
    tentados = []
    lista = modelos if isinstance(modelos, list) else [modelos]
    for m in lista + [x for x in MODELOS_ARQUITETO if x not in lista]:
        tentados.append(m)
        etapa(pct, f"modelo local: {modelo_label(m)}")
        if m == "qwen3:14b":
            aviso("qwen3:14b e o arquiteto mais forte, mas a primeira resposta pode levar alguns minutos")
        elif m == "hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS":
            aviso("perfil equilibrado usa qwen3:14b quantizado; ainda pode demorar mais que o qwen3:8b")
        try:
            with Spinner(pct, f"pensando com {modelo_label(m)}", m):
                r = ollama(m, msgs, temperatura=temperatura, timeout=timeout, pensar=pensar)
            return m, (r.get("message", {}).get("content") or "").strip()
        except (urllib.error.URLError, TimeoutError, Exception) as e:
            aviso(f"{m} nao respondeu ({str(e).splitlines()[0][:120]}), tentando o proximo")
            ultimo = e
    raise RuntimeError(f"nenhum modelo local respondeu: {ultimo}; tentados: {', '.join(tentados)}")


def extrair_json(txt):
    txt = re.sub(r"^```(?:json)?\s*|\s*```$", "", txt.strip(), flags=re.I | re.S)
    try:
        return json.loads(txt)
    except Exception:
        pass
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        raise ValueError("o modelo nao devolveu JSON")
    return json.loads(m.group(0))


def camadas_do_app(porta, documento=None):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}", timeout=20000)
        pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
        pg.evaluate("src => (0, eval)(src)", open(os.path.join(AQUI, "executor.js"), encoding="utf-8").read())
        if documento:
            doc = os.path.abspath(documento).replace("\\", "/")
            pg.evaluate(
                """async d => {
                    KNV.automacao(true, {padrao: 'primario'});
                    await KNV.fecharTudo();
                    await KNV.abrir(d);
                    KNV.automacao(false);
                    if (!document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem');
                }""",
                doc,
            )
        return pg.evaluate("KNVW.f.listar_camadas()")


def sistema_contrato():
    return (
        "Voce e o Arquiteto Local B do KANIVETE. O Claude continua sendo o arquiteto principal; "
        "sua funcao e ser uma opcao local conservadora quando ele estiver indisponivel. "
        "Gere contratos pequenos e verificaveis para tools/worker/worker.py operar o Photo Kanivete. "
        "Nao prometa julgamento estetico perfeito. Nao invente nomes de camadas: use os nomes fornecidos. "
        "Nao execute nada; apenas responda JSON valido, sem markdown, com: "
        "{task_id, goal, constraints, assets, success_conditions}. "
        "O goal deve ser direto, em portugues, com valores concretos. "
        "success_conditions deve ter uma condicao para cada parte importante: texto:N=valor, cor:N=#hex, "
        "tamanho:N=px, opacidade:N=n, visivel:N, oculta:N, efeito:N=tipo, acabamento, finalizada, exportado, no_editor."
    )


def gerar_contrato(args, pergunta):
    camadas = []
    erro_camadas = None
    if args.porta:
        try:
            aviso(f"lendo camadas do Canivete em http://127.0.0.1:{args.porta}")
            camadas = camadas_do_app(args.porta, args.documento)
        except Exception as e:
            erro_camadas = str(e).splitlines()[0][:240]
            aviso(f"nao consegui ler camadas agora: {erro_camadas}")

    contexto = {
        "pedido": pergunta,
        "documento": os.path.abspath(args.documento) if args.documento else "",
        "pasta_exportacao": os.path.abspath(args.exportar) if args.exportar else "",
        "salvar": bool(args.salvar or args.documento),
        "camadas": camadas,
        "erro_ao_ler_camadas": erro_camadas,
    }
    msgs = [
        {"role": "system", "content": sistema_contrato()},
        {"role": "user", "content": json.dumps(contexto, ensure_ascii=False)},
    ]
    usado, texto = chamar_arquiteto(escolher_modelo(args.modelo, args.perfil), msgs, pct=20, timeout=args.timeout_modelo, pensar=args.pensar)
    contrato = extrair_json(texto)
    contrato.setdefault("task_id", "ARQ_" + time.strftime("%Y%m%d_%H%M%S"))
    contrato.setdefault("assets", [])
    contrato.setdefault("success_conditions", [])
    cons = contrato.setdefault("constraints", {})
    if args.documento:
        cons["documento"] = os.path.abspath(args.documento)
    if args.exportar:
        cons["pasta_exportacao"] = os.path.abspath(args.exportar)
        if "exportado" not in contrato["success_conditions"]:
            contrato["success_conditions"].append("exportado")
    if args.salvar or args.documento:
        cons["salvar"] = True
    return usado, contrato, camadas, erro_camadas


def sistema_cena():
    return (
        "Voce e o Arquiteto Local B do KANIVETE para criar uma peca simples em KNV.cena. "
        "O Claude continua sendo o arquiteto principal; voce e uma opcao local para rascunhos e testes. "
        "Responda SOMENTE JSON valido, sem markdown, com: "
        "{task_id, html, notas, contrato_acab}. "
        "html deve ser um documento HTML completo com CSS inline para Photo Kanivete. "
        "Use body com margin:0, width e height EXATOS em pixels conforme o contexto. Nunca use vh/vw como tamanho "
        "principal do documento. Para carrossel, body deve ter width: calc(var(--slide) * var(--slides)); "
        "height: <altura>px; --slide:<largura>px; --slides:<n>; e cada <section class=\"slide\" id=\"s1\"> "
        "deve ter width:var(--slide); height:100%; position:relative. "
        "e variaveis --slide e --slides. Use ids/data-nome claros em elementos importantes. "
        "Nao use imagens remotas. Se precisar de imagem, use <img src=\"gerar:prompt em ingles\" data-semente=\"7\" "
        "data-fundo=\"branco\" data-recortar=\"ia\" data-inteiro>. Fixe sementes. "
        "Regra de design: entregue uma peca visualmente usavel, nao apenas elementos soltos. Crie hierarquia clara: "
        "marca/tema pequeno no topo, oferta/titulo muito forte, imagem como apoio sem cobrir textos, beneficio legivel, "
        "CTA grande e proximo do rodape. Respeite margem minima de 72px. Nenhum texto pode ficar atras de imagem. "
        "Imagem principal deve ocupar no maximo 48% da altura em flyer feed e ficar em uma area propria. "
        "Use camadas decorativas simples: faixas, cards, circulos, brilho/sombra em CSS, preco/selo quando combinar. "
        "Botao de WhatsApp deve ter pelo menos 360x88px, fonte legivel e destaque alto. "
        "Evite botao pequeno, titulo colado no topo, imagem gigante no centro cobrindo informacao, fundo chapado sem estrutura. "
        "Prefira Poppins, Montserrat, Bebas Neue, Passion One ou fonte generica se nao tiver certeza. "
        "Evite decoracao vazia: monte a peca utilizavel logo de primeira. "
        "contrato_acab pode ser null ou um contrato curto para finalizar_peca/exportar."
    )


def gerar_cena(args, pergunta):
    w, h = FORMATOS[args.formato]
    contexto = {
        "pedido": pergunta,
        "formato": args.formato,
        "largura_px": w,
        "altura_px": h,
        "slides": args.slides,
        "pasta_exportacao": os.path.abspath(args.exportar) if args.exportar else "",
        "salvar": bool(args.salvar),
    }
    msgs = [
        {"role": "system", "content": sistema_cena()},
        {"role": "user", "content": json.dumps(contexto, ensure_ascii=False)},
    ]
    usado, texto = chamar_arquiteto(escolher_modelo(args.modelo, args.perfil), msgs, temperatura=0.25, pct=20, timeout=args.timeout_modelo, pensar=args.pensar)
    pacote = extrair_json(texto)
    pacote.setdefault("task_id", "CENA_" + time.strftime("%Y%m%d_%H%M%S"))
    pacote.setdefault("notas", "")
    return usado, pacote


def progresso_linha(linha, pct):
    s = linha.strip()
    if not s:
        return pct
    baixo = s.lower()
    if baixo.startswith("ollama:"):
        pct = max(pct, 52)
        etapa(pct, s)
    elif baixo.startswith("cena "):
        pct = max(pct, 72)
        etapa(pct, s)
    elif baixo.startswith("  aviso:") or baixo.startswith("aviso:"):
        pct = max(pct, 78)
        print("        " + s, file=sys.stderr, flush=True)
    elif baixo.startswith("depois:"):
        pct = max(pct, 82)
        etapa(pct, s[:110])
    elif baixo.startswith("exportado:"):
        pct = max(pct, 88)
        etapa(pct, s)
    elif baixo.startswith("total "):
        pct = max(pct, 90)
        etapa(pct, s)
    elif baixo.startswith("revisor:"):
        pct = max(pct, 93)
        etapa(pct, s)
    elif baixo.startswith("prévia:") or baixo.startswith("previa:"):
        pct = max(pct, 96)
        etapa(pct, s)
    elif "warning" in baixo or "deprecation" in baixo:
        print("        aviso tecnico: " + s[:110], file=sys.stderr, flush=True)
    else:
        print("        " + s[:130], file=sys.stderr, flush=True)
    return pct


def rodar(cmd, base_pct=50, titulo="executando"):
    etapa(base_pct, titulo)
    p = subprocess.Popen(cmd, cwd=RAIZ, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding="utf-8", errors="replace", bufsize=1)
    linhas, pct = [], base_pct
    assert p.stdout is not None
    for linha in p.stdout:
        linhas.append(linha)
        pct = progresso_linha(linha, pct)
    cod = p.wait()
    return cod, "".join(linhas).strip()


def executar_contrato(path, porta):
    cmd = [
        sys.executable,
        os.path.join(RAIZ, "tools", "worker", "worker.py"),
        path,
        "--modelo",
        MODELO_WORKER,
        "--reserva",
        RESERVA_WORKER,
        "--porta",
        str(porta),
    ]
    return rodar(cmd, 50, "executando contrato no Photo Kanivete")


def executar_cena(html_path, args, salvar_path):
    cmd = [
        sys.executable,
        os.path.join(RAIZ, "tools", "knv.py"),
        html_path,
        "--formato",
        args.formato,
        "--novo",
        "--salvar",
        salvar_path,
        "--porta",
        str(args.porta),
        "--revisar",
    ]
    if args.exportar:
        cmd += ["--exportar", os.path.abspath(args.exportar)]
    return rodar(cmd, 50, "montando cena no Photo Kanivete")


def resumo_planejado(tipo, modelo, itens, json_raw=False):
    obj = {"status": "planned", "tipo": tipo, "modelo": modelo, **itens}
    if json_raw:
        print(json.dumps(obj, ensure_ascii=False))
        return
    print()
    print("KANIVETE - Arquiteto Local B")
    print(f"status : planejado")
    print(f"modelo : {modelo}")
    for k, v in itens.items():
        if v is None:
            continue
        print(f"{k:7}: {v}")
    print()


def modo_contrato(args, pergunta):
    etapa(0, "pedido recebido")
    etapa(8, "planejando contrato")
    usado, contrato, camadas, erro_camadas = gerar_contrato(args, pergunta)
    etapa(36, "plano recebido do modelo")
    pasta = os.path.abspath(args.saida)
    nome = slug(contrato.get("task_id") or pergunta)
    path = os.path.join(pasta, nome + ".contrato.json")
    gravar_json(path, contrato)
    etapa(45, "contrato salvo")
    resumo_planejado("contrato", usado, {"contrato": path, "camadas": len(camadas), "erro": erro_camadas}, args.json)
    if args.executar:
        cod, out = executar_contrato(path, args.porta)
        if cod:
            sys.exit(cod)
        etapa(100, "concluido")


def modo_cena(args, pergunta):
    etapa(0, "pedido recebido")
    etapa(8, "planejando HTML/CSS da cena")
    usado, pacote = gerar_cena(args, pergunta)
    etapa(36, "HTML recebido do modelo")
    pasta = os.path.abspath(args.saida)
    nome = slug(pacote.get("task_id") or pergunta)
    html_path = os.path.join(pasta, nome + ".html")
    salvar_path = os.path.abspath(args.salvar or os.path.join(pasta, nome + ".iknv"))
    gravar_texto(html_path, pacote["html"])
    meta_path = os.path.join(pasta, nome + ".arquiteto.json")
    gravar_json(meta_path, {k: v for k, v in pacote.items() if k != "html"} | {"modelo": usado, "html": html_path, "salvar": salvar_path})
    etapa(45, "arquivos salvos")
    resumo_planejado("cena", usado, {"html": html_path, "meta": meta_path, "salvar": salvar_path}, args.json)
    if args.executar:
        cod, out = executar_cena(html_path, args, salvar_path)
        if cod:
            sys.exit(cod)
        contrato = pacote.get("contrato_acab")
        if isinstance(contrato, dict):
            contrato.setdefault("task_id", "ACAB_" + nome)
            contrato.setdefault("constraints", {})
            contrato["constraints"]["documento"] = salvar_path
            contrato["constraints"]["salvar"] = True
            if args.exportar:
                contrato["constraints"]["pasta_exportacao"] = os.path.abspath(args.exportar)
            contrato_path = os.path.join(pasta, nome + ".acabamento.json")
            gravar_json(contrato_path, contrato)
            cod2, out2 = executar_contrato(contrato_path, args.porta)
            if cod2:
                sys.exit(cod2)
        etapa(100, "concluido")


def modo_chat(args):
    print("Arquiteto Local B. Digite /sair para fechar.")
    print("Comandos: /contrato <pedido> | /cena <pedido> | qualquer texto = conversa/planejamento.")
    modelo = escolher_modelo(args.modelo, args.perfil)
    hist = [{"role": "system", "content": (
        "Voce e o Arquiteto Local B do KANIVETE. Ajude a planejar tarefas para Photo Kanivete e Editor Kanivete. "
        "Se o usuario quiser executar, oriente a usar /contrato ou /cena. Seja direto e conservador."
    )}]
    while True:
        try:
            pergunta = input("\nvoce> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not pergunta:
            continue
        if pergunta in ("/sair", "/exit", "/quit"):
            break
        if pergunta.startswith("/contrato "):
            modo_contrato(args, pergunta[len("/contrato "):].strip())
            continue
        if pergunta.startswith("/cena "):
            modo_cena(args, pergunta[len("/cena "):].strip())
            continue
        hist.append({"role": "user", "content": pergunta})
        usado, resp = chamar_arquiteto(modelo, hist, temperatura=0.2, pct=20, timeout=args.timeout_modelo, pensar=args.pensar)
        modelo = [usado]
        hist.append({"role": "assistant", "content": resp})
        print(f"\n{usado}> {resp}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("modo", choices=["chat", "contrato", "cena"])
    ap.add_argument("pedido", nargs="*", help="pedido em texto; se vazio, le da entrada padrao")
    ap.add_argument("--modelo", default="auto", help="auto ou nome exato: qwen3:14b, gemma4:e4b, qwen3:8b...")
    ap.add_argument("--perfil", default="equilibrado", choices=["rapido", "equilibrado", "forte"],
                    help="auto: rapido=qwen3:8b; equilibrado=14B quantizado; forte=qwen3:14b cheio")
    ap.add_argument("--timeout-modelo", type=int, default=240,
                    help="segundos maximos por modelo antes de tentar o proximo")
    ap.add_argument("--pensar", action="store_true",
                    help="liga o modo think dos modelos Qwen/Gemma; melhor qualidade, bem mais lento")
    ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--saida", default=SAIDA_PADRAO)
    ap.add_argument("--documento", help=".iknv para abrir/alterar no modo contrato")
    ap.add_argument("--salvar", help="caminho .iknv de saida; no contrato, tambem liga constraints.salvar")
    ap.add_argument("--exportar", help="pasta de exportacao")
    ap.add_argument("--executar", action="store_true", help="depois de planejar, roda o Worker/KNV no app --agente")
    ap.add_argument("--formato", default="feed", choices=["feed", "feed4x5", "retrato", "story", "quadrado"])
    ap.add_argument("--slides", type=int, default=1)
    ap.add_argument("--json", action="store_true", help="imprime o resumo planejado em JSON cru")
    args = ap.parse_args()

    if args.modo == "chat":
        modo_chat(args)
        return
    pergunta = " ".join(args.pedido).strip()
    if not pergunta:
        pergunta = sys.stdin.read().strip()
    if not pergunta:
        sys.exit("sem pedido")
    if args.modo == "contrato":
        modo_contrato(args, pergunta)
    else:
        modo_cena(args, pergunta)


if __name__ == "__main__":
    main()
