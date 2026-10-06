"""Mapa de direção de arte (para o Claude, o Worker e o roteiro_local): layouts, estilos e técnicas em linhas curtas —
quando usar, como pedir no roteiro do tools/esqueleto.py, ordem das camadas, efeitos e o que evitar. Ler isto em vez dos
guias longos; o guia (Instructions/agente/direcao-carrossel.md) explica o porquê.

uso: py -3.13 tools/direcao_mapa.py                       tudo, compacto
     py -3.13 tools/direcao_mapa.py --tipo layout|estilo|tecnica [--busca termo]
     py -3.13 tools/direcao_mapa.py --para "briefing"     estilo sugerido + sequência de layouts (JSON)"""
import argparse, json, re, sys
sys.stdout.reconfigure(encoding="utf-8")

LAYOUTS = {   # nome: (quando usar, como no roteiro, camadas de baixo p/ cima, evitar)
    "gancho-heroi": ("capa que precisa parar o dedo; tema com objeto-metáfora forte", "gancho, sub, asset{prompt, ponte}",
                     "fundo → mancha de apoio → objeto (atravessa p/ slide 2) → título", "título longo (> 8 palavras); objeto pequeno"),
    "foto-lateral": ("capa/slide humanizado; pessoa é a marca (profissional, especialista)", "gancho, sub, asset{prompt pessoa, lado, pele}, orbita",
                     "fundo → órbita/brilho → pessoa cortada pela borda → texto do outro lado", "rosto cortado pela borda; texto largo"),
    "texto-respiro": ("explicar 1 ideia com 2–3 frases; slide de desenvolvimento", "titulo?, corpo[], asset{canto, lado}",
                      "fundo → (supergráfico) → objeto no canto → coluna de texto", "mais de 40 palavras"),
    "texto-destaque": ("afirmação forte, citação, número; respiro entre slides de foto", "gancho (2 frases com |), corpo curto",
                       "fundo → (eco/luz) → frase enorme", "usar em dois slides seguidos"),
    "eco-pessoa": ("prova/história com pessoa; tema de 1 palavra", "eco, titulo, corpo, asset{pessoa, pb}, orbita, etiquetas",
                   "fundo → palavra-eco (desfoque) → apoio → pessoa → texto/etiquetas", "eco com mais de 1 palavra"),
    "foto-moldura": ("contextualizar com foto real sem tomar o slide (lugar, detalhe, textura, processo)",
                     "moldura_forma faixa-topo|faixa-vertical|circulo|quadrado|retangulo|livre, gancho, corpo, asset{prompt foto}",
                     "fundo → foto na forma (sombra em quadrado/retângulo) → texto no espaço livre", "foto de objeto recortado (aqui é foto inteira)"),
    "papel": ("lista curta, passo a passo, bastidor, tom pessoal", "pre?, gancho, corpo[]",
              "fundo → papel rasgado (sombra) → fita adesiva → texto", "estilo minimalista/tecnológico"),
    "foto-atmosfera": ("virada emocional, cena, lugar; texto curto", "gancho, corpo, asset{prompt cenário sem pessoas}",
                       "foto inteira → véu degradê → texto embaixo", "texto no terço de cima (fica sem leitura)"),
    "objeto-dominante": ("produto, prova visual, fechamento com oferta", "gancho curto, sub, asset{prompt produto}",
                         "fundo → sombra/brilho → objeto grande → texto pequeno no alto", "texto grande disputando com o objeto"),
    "virada-cta": ("último slide: contraste + ação", "gancho 'Menos X. | Mais *Y*.', corpo, cta, asset",
                   "fundo cor → apoio → objeto → texto → pílula + seta à mão", "cta genérico de site ('saiba mais')"),
}
ESTILOS = {   # nome: (temas, fontes, paleta/fundo, decoração que combina, sequência p/ lista: capa, itens..., fim)
    "impacto": ("marketing, opinião forte, educação digital, carreira, vendas", "Anton caixa alta + Inter",
                "neutro escuro/claro + 1 cor viva", "mancha de apoio, marcações à mão, fita, rasgo, eco, grão forte",
                ["gancho-heroi", ["texto-respiro", "papel", "eco-pessoa", "texto-destaque"], "virada-cta"]),
    "elegante": ("estética, harmonização, moda, joias, arquitetura, advocacia premium", "Cormorant Garamond + Montserrat",
                 "bege/marfim + quase-preto quente + dourado", "órbita fina, brilho suave, foto em círculo/forma livre, letra serifada gigante",
                 ["foto-lateral", ["texto-destaque", "foto-moldura:circulo", "foto-moldura:faixa-vertical", "foto-moldura:livre"], "objeto-dominante"]),
    "delicado": ("maternidade, bem-estar, nutrição acolhedora, terapia, papelaria", "Fraunces + Nunito",
                 "pastéis quentes, contraste baixo no fundo", "mancha macia, foto em forma livre, sublinhado à mão",
                 ["gancho-heroi", ["texto-respiro", "foto-moldura:livre", "papel"], "virada-cta"]),
    "tecnologico": ("SaaS, apps, IA, dados, finanças digitais, agências", "Space Grotesk + Inter",
                    "azul-marinho/preto + cor neon da marca", "supergráfico de marca, etiquetas, luz/glow, UI (cards, notificações)",
                    ["foto-lateral", ["texto-respiro", "objeto-dominante", "texto-destaque"], "virada-cta"]),
    "rustico": ("comida caseira, café, artesanal, campo, cerveja, churrasco", "Alfa Slab One caixa alta + Karla",
                "kraft/terra + marrom escuro", "papel rasgado, fita, textura forte, grão, foto em faixa",
                ["gancho-heroi", ["papel", "foto-moldura:faixa-topo", "texto-respiro"], "virada-cta"]),
    "minimalista": ("consultoria, finanças, imóveis, B2B, arquitetura limpa", "Inter 800 + Inter",
                    "branco/cinza + preto + 1 acento", "quase nada: respiro, foto em retângulo, sem textura",
                    ["texto-destaque", ["foto-moldura:retangulo", "texto-respiro", "objeto-dominante"], "virada-cta"]),
}
TECNICAS = {  # nome: (para que serve, quando, como pedir, camadas/efeitos)
    "mancha de apoio": ("assentar e dar contraste ao objeto", "objeto claro em fundo claro; capa", '"forma": "apoio" (padrão na capa)', "atrás do objeto, encostada, 90%"),
    "supergráfico": ("identidade + preencher fundo vazio", "fundo liso, 1 slide, marca com traço", '"supergrafico": true', "tom sobre tom 16–22%, atrás de tudo, sangra p/ direita"),
    "órbita fina": ("emoldurar rosto, elegância", "retrato premium", '"orbita": true', "arco 3px 60% atrás da pessoa, pontos nas pontas"),
    "etiqueta": ("rotular o que a pessoa/objeto representa", "1–2 palavras-chave", '"etiquetas": ["..."]', "por cima, encostada, sombra suave"),
    "palavra-eco": ("profundidade e tema em 1 palavra", "eco-pessoa", '"eco": "PALAVRA"', "7% opacidade, desfoque de movimento no sentido da palavra"),
    "marcação à mão": ("puxar o olho para 1 trecho", "1 por slide no máximo", "[trecho](circulo|sublinhado|risco|tarja|selecao)", "traço liso na cor da marca"),
    "fita": ("ligar slides, chamar p/ salvar", "estilo impacto/rústico; não depois do slide 1 com ponte", '"pontes": [{"depois": n, "tipo": "fita"}]', "na divisa, 90°, decoração"),
    "rasgo": ("trocar o fundo entre slides com textura", "claro ↔ escuro", '"pontes": [{"depois": n, "tipo": "rasgo"}]', "fibra branca + sombra"),
    "traço de ligação": ("puxar o olho p/ o próximo slide", "faixa de baixo livre nos dois slides", '"pontes": [{"depois": n, "tipo": "traco"}]', "traço grosso de caneta atravessando a divisa"),
    "arte-final": ("cara de finalizado", "sempre (intensidade pelo estilo)", '"acabamento": {...} ou false', "sombra → brilho Tela → eco borrado → textura → Camera Raw no topo"),
    "objeto narrativo (pendente)": ("contar a ideia sem texto (vidro quebrado = flop)", "tema com metáfora", "asset extra na frente com desfoque", "atrás e na frente do assunto"),
    "letra gigante entre slides (pendente)": ("ritmo e ligação tipográfica", "estilo elegante, slide só de texto", "—", "pedaço da palavra cortado pela borda"),
}
PALAVRAS = {  # palavra do briefing → estilo
    "elegante": r"estétic|harmoniz|botox|dermat|moda|joia|luxo|arquitet|advoca|noiva|beleza|clínica",
    "delicado": r"matern|bebê|gestant|bem-estar|terapi|acolh|nutri|psicolog|papelaria|floric",
    "tecnologico": r"saas|app|aplicativ|software|\bia\b|intelig[êe]ncia artificial|dados|tech|startup|automa|fintech|crm|lead",
    "rustico": r"caseir|artesan|café|padaria|churras|cervej|campo|fazenda|rústic|vinho|queijo|pizza",
    "minimalista": r"consultor|finan|investim|imóve|imobili|b2b|contab|jurídic|seguro",
}


def sugerir(briefing):
    b = briefing.lower()
    pontos = {e: len(re.findall(p, b)) for e, p in PALAVRAS.items()}
    est = max(pontos, key=pontos.get) if max(pontos.values()) else "impacto"
    return {"estilo": est, "sequencia": ESTILOS[est][4], "por_que": ESTILOS[est][0], "pontos": pontos}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--tipo"); ap.add_argument("--busca"); ap.add_argument("--para")
    a = ap.parse_args()
    if a.para: print(json.dumps(sugerir(a.para), ensure_ascii=False)); sys.exit(0)
    secoes = {"layout": (LAYOUTS, "quando | roteiro | camadas | evitar"), "estilo": (ESTILOS, "temas | fontes | paleta | decoração | sequência"),
              "tecnica": (TECNICAS, "serve | quando | como | camadas/efeitos")}
    for t, (d, cab) in secoes.items():
        if a.tipo and a.tipo != t: continue
        print(f"## {t}s ({cab})")
        for k, v in d.items():
            linha = f"{k}: " + " | ".join(json.dumps(x, ensure_ascii=False) if isinstance(x, list) else x for x in v)
            if not a.busca or a.busca.lower() in linha.lower(): print(linha)
