"""Kani — bateria de respostas (alucinação, fatos do app, contas, memória da conversa, tela, rotas e tempo da 1ª palavra).
Nasceu da rodada de 2026-10-17: estabilizador "pendente" inventado, caminho de arquivo .js citado, Slider "abre no
PowerPoint", 17% de 2.350 = 419,5, "não tenho acesso à localização" logo depois de a pessoa dizer a cidade, 1ª palavra
em ~4 s por causa da checagem do Ollama. App de teste em --agente=9333 com a IA da Kani instalada.
    py -3.13 testes/teste_kani_respostas.py [--porta 9333]
"""
import argparse, re, sys, time
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument("--porta", type=int, default=9333); a = ap.parse_args()
falhas = []
def ok(c, nome, extra=""):
    print(("  ok  " if c else "  FALHOU ") + nome + (f"  ({extra})" if extra else ""), flush=True)
    if not c: falhas.append(nome)

ROTAS = {   # texto → rota esperada (criar = tipo | etapas | None = conversa)
    "gera uma imagem de um gato astronauta": "imagem", "cria um som de porta rangendo": "efeito", "faz uma vinheta sobre café": "vinheta",
    "como eu gero uma imagem no Photo?": None, "me explica como criar uma vinheta": None, "você sabe fazer narração?": None,
    "pesquisa na internet o preço do iPhone 16": "etapas",
}
# (pergunta ou lista de turnos, verificação na ÚLTIMA resposta, nome)
CASOS = [
    ("O Kanivete tem estabilizador de vídeo, tipo o Warp Stabilizer?", lambda r: re.search(r"\bnão\b", r, re.I) and not re.search(r"pendente|desenvolvimento|planos?", r, re.I), "estabilizador: diz que não tem, sem plano interno"),
    ("O Vetor Kanivete exporta DXF pra corte a laser?", lambda r: re.search(r"\bnão\b", r, re.I), "DXF: não tem"),
    ("Dá pra usar o Ata Kanivete pra gravar reunião do Zoom?", lambda r: "Meet" in r and re.search(r"\bnão\b", r, re.I), "Ata: só Google Meet"),
    ("Consigo exportar uma apresentação do Slider pra abrir no celular?", lambda r: ".html" in r or "qualquer aparelho" in r, "Slider: exportar .html"),
    ("Qual arquivo .js controla o Slider Kanivete? Quero mexer no código.", lambda r: not re.search(r"[\w-]+\.(js|py)\b", r), "código: não cita arquivo"),
    ("Quem criou o Kanivete?", lambda r: "Wellington Pailer" in r, "criador"),
    ("Quanto custa a assinatura do Kanivete?", lambda r: re.search(r"gratuit|não tem assinatura|sem assinatura", r, re.I), "preço: gratuito"),
    ("Quanto é 17% de 2.350?", lambda r: "399,5" in r, "conta pelo app (399,5)"),
    ("Que dia é hoje?", lambda r: time.strftime("%d/%m") in r or str(int(time.strftime("%d"))) in r, "data de hoje"),
    (["Meu nome é Carla e tenho uma loja de roupas em Curitiba.", "Sugere um nome de promoção de inverno.", "Qual é o meu nome e onde fica a loja?"],
     lambda r: "Carla" in r and "Curitiba" in r, "memória da conversa (nome e cidade)"),
    ("Escreve uma legenda curta pra post de Instagram de uma padaria artesanal", lambda r: "```texto" in r, "texto pronto no bloco (botão Copiar)"),
]

with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}").contexts for x in c.pages if "index.html" in x.url)
    pg.set_default_timeout(300000)
    pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.KANI_API)")
    E = lambda js, arg=None: pg.evaluate(js, arg)
    print("rotas")
    for t, esp in ROTAS.items():
        r = E("async t => ({etapas: await pywebview.api.kani_agente_precisa(t), criar: await pywebview.api.kani_criar_tipo(t, null)})", t)
        got = "etapas" if r["etapas"] else (r["criar"] or {}).get("tipo") if r["criar"] else None
        ok(got == esp, f"rota: {t}", f"{got} (esperado {esp})")
    print("respostas")
    E("switchTool('home')")
    tempos = []
    for perg, conf, nome in CASOS:
        E("async () => { await KANI_API.abrir(); kaniNova(); }")
        for m in (perg if isinstance(perg, list) else [perg]):
            t0, primeira = time.time(), None
            E("t => KANI_API.perguntar(t)", m)
            while True:
                time.sleep(0.15)
                st = E("(() => { const c = KANI_API.conversa(), u = c.msgs[c.msgs.length - 1]; return {g: KANI_API.gerando(), t: (u && u.content) || ''}; })()")
                if primeira is None and st["t"]: primeira = time.time() - t0
                if (not st["g"] and time.time() - t0 > 0.6) or time.time() - t0 > 180: break
            tempos.append(primeira or 99)
        ok(bool(conf(st["t"])), nome, re.sub(r"\s+", " ", st["t"])[:110])
    tempos.sort()
    med = tempos[len(tempos) // 2]
    ok(med < 2.0, "1ª palavra rápida (mediana < 2 s)", f"mediana {med:.1f} s, pior {tempos[-1]:.1f} s")

print("\nRESULTADO:", "OK" if not falhas else f"{len(falhas)} FALHA(S): " + "; ".join(falhas))
sys.exit(1 if falhas else 0)
