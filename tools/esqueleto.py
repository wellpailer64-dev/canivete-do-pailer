"""Roteiro (JSON curto) → carrossel diagramado (HTML do KNV.cena) pelos ESQUELETOS aprovados. O agente só escreve o
roteiro: hierarquia, margens, moldura, respiro e pontes entre slides já vêm resolvidos (Instructions/agente/direcao-carrossel.md).

uso: py -3.13 tools/esqueleto.py roteiro.json [--saida peca.html] [--montar] [--exportar pasta] [--porta 9333]
     py -3.13 tools/esqueleto.py --listar
  --montar  roda tools/knv.py (cena + revisor + prévia) no app de teste; --exportar passa adiante

Roteiro:
{
  "marca": {"primaria": "#ff3b22", "escuro": "#1c1c1e", "claro": "#ecebe7", "titulo": "Anton", "texto": "Inter", "mao": "Caveat"},
  "perfil": {"nome": "Ana Lima", "cargo": "Designer", "foto": "gerar:..."},   (opcional; sem foto = só nome)
  "usuario": "@analima",
  "slides": [
    {"esqueleto": "gancho-heroi", "fundo": "claro", "gancho": "Sabe *defender* o seu design?", "sub": "Porque um dia [alguém vai questionar](sublinhado)",
     "asset": {"prompt": "astronaut ...", "semente": 7, "ponte": true}},
    {"esqueleto": "texto-respiro", "corpo": ["Vou contar um [caso real](tarja).", "..."]}
  ],
  "pontes": [{"depois": 1, "tipo": "fita|rasgo"}]       (depois = nº do slide; asset com "ponte": true já atravessa)
}
Marcação no texto: *destaque* (cor primária), **negrito**, [trecho](circulo|sublinhado|risco|tarja|selecao), | = quebra.
Limites (o revisor confere): gancho ≤ 8 palavras, corpo ≤ 40 palavras por slide, 1 ideia por slide.
Fundos: escuro | claro | cor. Asset: {"prompt", "semente", "lado": "direita|esquerda", "ponte", "frente", "pb", "pele"}.
Formas COM FUNÇÃO (por slide; nunca em todos): "forma": "apoio" (mancha atrás do objeto; padrão só na capa),
"supergrafico": true (traço de marca enorme tom sobre tom no fundo), "orbita": true (arco fino na cabeça da pessoa),
"etiquetas": ["tendências", "novidades"] (chips apontando para o objeto); pontes tipo "traco" ligam slides."""
import argparse, html, json, os, re, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")

W, H, M = 1080, 1350, 80          # feed 4:5; margem 80 (7%) — a moldura fica a 60
ESQUELETOS = {
    "gancho-heroi": "capa: gancho gigante no alto à esquerda + objeto grande saindo pela borda (pode atravessar p/ o próximo)",
    "texto-respiro": "desenvolvimento: coluna de corpo com respiro + objeto cortado no canto (opcional: título curto)",
    "eco-pessoa": "palavra-eco gigante clarinha atrás + pessoa/objeto recortado na frente + título e corpo na coluna livre",
    "papel": "título no alto + papel rasgado com fita adesiva como caixa do corpo",
    "foto-atmosfera": "foto de fundo inteira escurecida (degradê p/ leitura) + título e corpo embaixo à esquerda",
    "virada-cta": "fechamento: frase grande na cor de destaque + corpo curto + pílula de ação com seta à mão + objeto da série",
}


def inline(s, destaque=True):
    """*destaque*, **negrito**, [trecho](marca) → HTML"""
    s = html.escape(s, quote=False)
    s = re.sub(r"\[([^\]]+)\]\((circulo|sublinhado|risco|tarja|selecao)\)", r'<span class="k-marca" data-marca="\2">\1</span>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\*([^*]+)\*", r'<em class="dest">\1</em>' if destaque else r"<b>\1</b>", s)
    return s.replace(" | ", "<br>").replace("|", "<br>")   # | = quebra de linha escolhida (frase não se mistura)


def corpo_html(c, cls="corpo"):
    if not c: return ""
    c = [c] if isinstance(c, str) else c
    return f'<div class="{cls}">' + "".join(f"<p>{inline(p)}</p>" for p in c) + "</div>"


def img(a, nome, estilo, padrao_prop="3:4"):
    """objeto gerado (recortado pela IA) ou foto de fundo (data-recortar=nao)"""
    if not a or not a.get("prompt"): return ""
    src = a["prompt"] if a["prompt"].startswith(("gerar:", "recurso:")) or os.path.isfile(a["prompt"]) else "gerar:" + a["prompt"]
    if a.get("pb") and src.startswith("gerar:"): src += ", black and white photo, monochrome"
    at = [f'id="{nome}"', f'data-semente="{a.get("semente", 7)}"', f'data-proporcao="{a.get("proporcao", padrao_prop)}"']
    if a.get("fundo_inteiro"): at.append('data-recortar="nao"')
    else: at += ['data-fundo="branco"', f'data-pode-cortar="{a.get("pode_cortar", "baixo direita esquerda")}"']
    if a.get("pele"): at.append("data-pele")
    if a.get("cor"): at.append(f'data-cor="{a["cor"]}"')
    return f'<img {" ".join(at)} style="{estilo}" src="{html.escape(src)}">'


def moldura(r, i, n, fundo):
    p, u = r.get("perfil"), r.get("usuario", "")
    perfil = ""
    if p:
        av = (f'<img id="avatar{i}" data-corte data-semente="{p.get("semente", 7)}" data-pele data-proporcao="1:1" src="{html.escape(p["foto"])}">'
              if p.get("foto") else html.escape(p["nome"][:1].upper()))
        perfil = (f'<div class="mold-perfil" data-papel="meta" data-juntos><div class="mold-av" id="av{i}">{av}</div><div>'
                  f'<div class="mold-nome">{html.escape(p["nome"])}</div>'
                  + (f'<div class="mold-cargo">{html.escape(p["cargo"])}</div>' if p.get("cargo") else "") + '</div></div>')
    seta = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>'
    num = f'<div class="mold-num" data-papel="meta">{i:02d}/{n:02d} {seta if i < n else ""}</div>'
    # objeto no canto de baixo à esquerda (texto-respiro com lado esquerda) cobriria o @: vai para a direita
    s = r["slides"][i - 1]; dir_ = s.get("esqueleto") == "texto-respiro" and (s.get("asset") or {}).get("lado") == "esquerda" and (s.get("asset") or {}).get("prompt")
    rod = (f'<div class="mold-rod" data-papel="meta"{" style=&quot;left:auto;right:80px&quot;" if dir_ else ""}>{html.escape(u)}</div>'.replace("&quot;", '"')
           if u and not r.get("_sem_rodape", {}).get(i) else "")
    return perfil + num + rod


def misturar(a, b, t):
    """cor a misturada em b na proporção t (hex) — tom sobre tom"""
    ca, cb = [int(a.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4)], [int(b.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4)]
    return "#" + "".join(f"{round(x * t + y * (1 - t)):02x}" for x, y in zip(ca, cb))


def caixa_asset(e, lado):
    """caixa (x, y, w, h) do objeto no slide, por esqueleto — para órbita e etiquetas acompanharem o objeto"""
    b = {"gancho-heroi": (410, 390, 820, 1000), "texto-respiro": (630, 820, 560, 620),
         "eco-pessoa": (500, 190, 640, 1160), "virada-cta": (720, 110, 500, 600)}.get(e)
    if not b: return None
    x, y, w, h = b
    return (W - x - w, y, w, h) if lado == "esquerda" else b


def forma(tipo, estilo, sem, esp=None, extra=""):
    """forma básica deformada da IDV (k-forma): blob (mancha), anel, onda, traco — atrás do conteúdo"""
    e = f' data-espessura="{esp}"' if esp else ""
    return f'<div class="k-forma" data-forma="{tipo}" data-semente="{sem}"{e} style="{estilo}{extra}"></div>'


def slide(r, s, i, n):
    # forma da IDV só com FUNÇÃO (feedback 2026-10-06: avulsa em todo slide ficou sem nexo): apoio atrás do objeto
    # (padrão só na capa; nos outros com "forma": "apoio"); ligação entre slides = pontes tipo "traco"
    fz = r.get("formas", True) and s.get("forma", "apoio" if s.get("esqueleto") == "gancho-heroi" else None) == "apoio"
    e, f = s.get("esqueleto", "texto-respiro"), s.get("fundo", "escuro")
    a, lado = s.get("asset"), (s.get("asset") or {}).get("lado", "direita")
    if r.get("_sem_rodape", {}).get(i) and e in ("texto-respiro", "eco-pessoa"):
        # o objeto da capa atravessa para o canto esquerdo deste slide: texto à DIREITA e sem outro objeto disputando
        lado, a = "esquerda", None
    # caixa alta condensada: justo (.95) sem acento; acento maiúsculo (Á, Ê, Ç...) sobe ~.25em → abre para 1.12
    acento = lambda t: re.search("[À-ÖØ-Ý]", t.upper())
    lh = lambda t: f' style="line-height:{1.12 if acento(t) else .95}"'
    g = f'<h1 class="gancho"{lh(s["gancho"])}>{inline(s["gancho"])}</h1>' if s.get("gancho") else ""
    sub = f'<p class="sub" data-papel="subtitulo">{inline(s["sub"])}</p>' if s.get("sub") else ""
    solto = ""          # objeto que atravessa a divisa vai solto na tira (por cima dos dois slides)
    x0 = (i - 1) * W
    if e == "gancho-heroi":
        lado_css = "right:-150px" if lado == "direita" else "left:-150px"
        est = f"position:absolute;{lado_css};bottom:-40px;width:820px;height:1000px;object-fit:contain;object-position:50% 100%;z-index:{2 if a and a.get('frente') else 0}"
        if a and a.get("ponte"):
            mancha = forma("blob", f"left:{x0 + W - 420}px;top:700px;width:660px;height:660px;opacity:.9;z-index:2", i) if fz else ""
            solto = mancha + img(a, f"heroi{i}", f"position:absolute;left:{x0 + W - 470}px;top:{H - 1000 + 40}px;width:820px;height:1000px;object-fit:contain;object-position:50% 100%;z-index:3")
            obj = ""
        else:
            lado_f = "right:-60px" if lado == "direita" else "left:-60px"
            obj = (forma("blob", f"{lado_f};bottom:160px;width:600px;height:600px;opacity:.9", i) if fz and a else "") + img(a, f"heroi{i}", est)
        meio = f'{obj}<div class="bloco-gancho">{g}{sub}</div>'
    elif e == "texto-respiro":
        tit = f'<h2 class="tit2">{inline(s["titulo"])}</h2>' if s.get("titulo") else ""
        canto = "left:-110px" if lado == "esquerda" else "right:-110px"
        obj = img(a, f"canto{i}", f"position:absolute;{canto};bottom:-90px;width:560px;height:620px;object-fit:contain;object-position:50% 100%")
        lado_txt = "right" if lado == "esquerda" else "left"
        apoio = forma("blob", f"{canto};bottom:-60px;width:500px;height:500px;opacity:.9", i) if fz and a and a.get("prompt") else ""
        meio = f'{apoio}<div class="bloco-texto" style="{lado_txt}:{M}px">{tit}{corpo_html(s.get("corpo"))}</div>{obj}'
    elif e == "eco-pessoa":
        eco = f'<div class="k-eco eco-v">{html.escape(s.get("eco", ""))}</div>' if s.get("eco") else ""
        pess = img(a, f"pessoa{i}", f"position:absolute;{'right:-60px' if lado == 'direita' else 'left:-60px'};bottom:0;width:640px;height:1160px;object-fit:contain;object-position:50% 100%", "2:3")
        col = "left" if lado == "direita" else "right"
        tit = f'<h2 class="tit2">{inline(s.get("titulo") or s.get("gancho", ""))}</h2>'
        apoio = forma("blob", f"{'right:-20px' if lado == 'direita' else 'left:-20px'};bottom:-140px;width:560px;height:560px;opacity:.9", i) if fz and a else ""   # atrás do tronco
        meio = f'{eco}{apoio}{pess}<div class="bloco-eco" style="{col}:{M}px">{tit}{corpo_html(s.get("corpo"))}</div>'
    elif e == "papel":
        pre = f'<p class="pre" data-papel="subtitulo">{inline(s["pre"])}</p>' if s.get("pre") else ""
        meio = (f'<div class="bloco-papel-tit">{pre}{g}</div>'
                f'<div class="k-papel caixa-papel" data-rasgado="baixo" data-fita id="papel{i}">{corpo_html(s.get("corpo"), "corpo corpo-papel")}</div>')
    elif e == "foto-atmosfera":
        fundo_img = img({**(a or {}), "fundo_inteiro": True, "proporcao": "4:5"}, f"atmos{i}", "position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover") if a else ""
        meio = f'{fundo_img}<div class="veu"></div><div class="bloco-atmos">{g}{sub}{corpo_html(s.get("corpo"))}</div>'
    elif e == "virada-cta":
        cta = html.escape(s.get("cta", "Salve e compartilhe"))
        obj = img(a, f"fecho{i}", f"position:absolute;{'right:-140px' if lado == 'direita' else 'left:-140px'};top:110px;width:500px;height:600px;object-fit:contain")
        sombra_f = forma("blob", f"{'left:690px' if lado == 'direita' else 'left:-60px'};top:300px;width:440px;height:440px;color:rgba(0,0,0,.18)", i) if fz and a else ""   # apoio sob o objeto
        meio = (f'{sombra_f}{obj}<div class="bloco-cta">{g}{corpo_html(s.get("corpo"))}'
                f'<div class="cta-linha"><div class="k-pilula" data-papel="cta" data-icone="salvar">{cta}</div>'
                f'<div class="k-seta-mao seta-cta"></div></div></div>')
    else: raise SystemExit(f"esqueleto desconhecido: {e} (veja --listar)")
    # camadas de fundo com função (referências 2, direcao-carrossel.md §7), ANTES do conteúdo = atrás dele:
    #   supergráfico (traço grosso de marca, enorme, tom sobre tom, sangrando) → órbita fina em volta da cabeça → objeto
    #   etiquetas (chips apontando para o objeto) vão por cima, encostadas nele
    # tom sobre tom calculado aqui (a cena não lê color-mix dentro de SVG); a cena não recorta o slide: forma só
    # sangra para a DIREITA/baixo (o slide seguinte cobre) — sangrar para a esquerda invadiria o slide anterior
    mk = {"primaria": "#ff3b22", "escuro": "#1c1c1e", "claro": "#ecebe7", **r.get("marca", {})}
    tom = {"claro": misturar(mk["primaria"], mk["claro"], 0.16), "escuro": misturar(mk["primaria"], mk["escuro"], 0.22),
           "cor": misturar("#ffffff", mk["primaria"], 0.18)}.get(f, mk["escuro"])
    caixa = caixa_asset(e, lado) if a and a.get("prompt") and not a.get("ponte") else None
    fundo_f, frente = "", ""
    if s.get("supergrafico"):
        fundo_f += forma("supergrafico", f"left:{60 if i > 1 else -300}px;top:-60px;width:1400px;height:1480px;color:{tom}", i, 120)
    if s.get("orbita") and caixa:
        x, y, w, h = caixa; dm = int(w * 0.64)
        fundo_f += forma("orbita", f"left:{int(x + w / 2 - dm / 2)}px;top:{int(y + h * 0.24 - dm / 2)}px;width:{dm}px;height:{dm}px;opacity:.6", i, 3)
    for j, t in enumerate(s.get("etiquetas", [])[:3] if caixa else []):
        x, y, w, h = caixa; esq = lado == "direita"
        pos = f"left:{int(x + w * 0.08)}px" if esq else f"right:{int(W - x - w * 0.92)}px"
        frente += f'<div class="k-etiqueta" data-rabo="{"baixo-esq" if esq else "baixo-dir"}" style="{pos};top:{int(y + h * (0.42 + 0.2 * j))}px;transform:rotate({(-4, 3, -2)[j]}deg)">{html.escape(t)}</div>'
    meio = fundo_f + meio + frente
    k = f' style="--k:{s["_k"]:.3f}"' if s.get("_k") else ""     # --k: escala dos títulos (auto-ajuste do --montar)
    return f'<section class="slide {f} e-{e}" data-nome="Slide {i}"{k}>{meio}{moldura(r, i, n, f)}</section>', solto


def montar_html(r):
    m = {"primaria": "#ff3b22", "escuro": "#1c1c1e", "claro": "#ecebe7", "titulo": "Anton", "texto": "Inter", "mao": "Caveat", **r.get("marca", {})}
    n = len(r["slides"]); secoes, soltos = [], []
    # objeto-ponte cobre o canto de baixo do slide seguinte: lá o rodapé sai
    r["_sem_rodape"] = {k + 2: True for k, s in enumerate(r["slides"]) if (s.get("asset") or {}).get("ponte")}
    for i, s in enumerate(r["slides"], 1):
        a, b = slide(r, s, i, n); secoes.append(a); soltos.append(b)
    fundos = [s.get("fundo", "escuro") for s in r["slides"]]
    # destaque no fundo "cor": escuro se a cor da marca é clara/viva, claro (tom da marca) se ela já é escura (verde-oliva)
    def lum(h):   # luminância relativa (WCAG)
        f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return sum(f(int(h.lstrip("#")[k:k + 2], 16) / 255) * w for k, w in zip((0, 2, 4), (0.2126, 0.7152, 0.0722)))
    razao = lambda a, b: (max(lum(a), lum(b)) + 0.05) / (min(lum(a), lum(b)) + 0.05)
    fundo_cor = misturar(m["primaria"], "#000000", 0.85)
    dest_cor = max(["#1c1c1e", misturar("#ffffff", m["primaria"], 0.7), "#fff3c4"], key=lambda c: razao(c, fundo_cor))
    for p in r.get("pontes", []):
        k = p["depois"]                       # entre o slide k e o k+1
        if p.get("tipo") == "fita":
            soltos.append(f'<div class="k-fita" style="left:{k * W + 28}px;top:-20px;transform:rotate(90deg);transform-origin:0 0">{html.escape(p.get("texto", "Salve esse post"))}</div>')
        elif p.get("tipo") == "traco":        # traço grosso de caneta atravessando a divisa (ligação), na faixa de baixo
            y = p.get("y", H - 360)
            soltos.append(forma("onda", f"left:{k * W - 300}px;top:{y}px;width:600px;height:200px;z-index:1", k, 28))
        elif p.get("tipo") == "rasgo":        # o fundo do slide k entra rasgado no começo do k+1
            cor = {"escuro": m["escuro"], "claro": m["claro"], "cor": m["primaria"]}[fundos[k - 1]]
            secoes[k] = secoes[k].replace('">', f'"><div class="k-rasgo" data-lado="direita" data-cor="{cor}" style="left:0;top:0;width:70px;height:{H}px" id="rasgo{k}"></div>', 1)
    css = f"""
body{{--cor-primaria:{m['primaria']};--cor-fundo:#fff;font-family:'{m['texto']}';}}
.slide{{position:relative;overflow:hidden}}
.escuro{{background:radial-gradient(120% 80% at 70% 10%,#2c2c2f 0%,{m['escuro']} 60%);color:#f1f1f1}}
.claro{{background:radial-gradient(120% 80% at 30% 0%,#ffffff 0%,{m['claro']} 65%);color:#2b2b2b}}
.cor{{background:radial-gradient(120% 80% at 50% 0%,color-mix(in srgb,{m['primaria']} 92%,#000) 0%,color-mix(in srgb,{m['primaria']} 78%,#000) 70%);color:#fff}}
.cor .dest{{color:{dest_cor}}} .cor .mold-rod{{opacity:1}} .cor .k-pilula{{background:#fff;color:color-mix(in srgb,{m['primaria']} 80%,#000)}} .cor .k-seta-mao{{color:#fff}} .cor .k-marca{{--cor-marca:#1c1c1e}} .dest{{font-style:normal;color:var(--cor-primaria)}}
.gancho{{font-family:'{m['titulo']}';font-weight:400;text-transform:uppercase;font-size:calc(150px * var(--k,1));line-height:1.04;letter-spacing:-.5px;margin:0}}
.sub{{font-size:38px;line-height:1.2;margin-top:34px;max-width:620px}}
.pre{{font-size:30px;opacity:.75;margin-bottom:18px}}
.tit2{{font-family:'{m['titulo']}';font-weight:400;text-transform:uppercase;font-size:calc(84px * var(--k,1));line-height:1;margin:0 0 44px}}
.corpo{{font-size:32px;line-height:1.38}} .corpo p+p{{margin-top:30px}} .corpo b{{font-weight:700}}
.mold-perfil{{position:absolute;left:{M}px;top:52px;display:flex;align-items:center;gap:14px}}
.mold-av{{position:relative;width:54px;height:54px;border-radius:50%;background:color-mix(in srgb,var(--cor-primaria) 80%,#000);color:#fff;font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center}}
.mold-av img{{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;border-radius:50%}}
.cor .mold-av{{background:#fff;color:#1c1c1e}}
.mold-nome{{font-size:20px;font-weight:700;line-height:1.2}} .mold-cargo{{font-size:16px;opacity:.7;line-height:1.2}}
.mold-num{{position:absolute;right:{M}px;top:66px;font-size:20px;font-weight:700;display:flex;gap:8px;align-items:center}}
.mold-num svg{{color:var(--cor-primaria)}}
.mold-rod{{position:absolute;left:{M}px;bottom:56px;font-size:20px;font-weight:700}}
.bloco-gancho{{position:absolute;left:{M}px;top:170px;width:880px;z-index:1}}
.bloco-texto{{position:absolute;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center}}
.eco-v{{top:-40px;font-size:340px;transform:rotate(90deg);transform-origin:0 0;left:{W - 60}px;color:currentColor;opacity:.08}}
.bloco-eco{{position:absolute;top:0;bottom:0;width:430px;display:flex;flex-direction:column;justify-content:center}}
.bloco-eco .tit2{{font-size:calc(72px * var(--k,1))}}
.bloco-papel-tit{{position:absolute;left:{M}px;right:{M}px;top:170px;text-align:center}}
.bloco-papel-tit .gancho{{font-size:calc(118px * var(--k,1))}}
.caixa-papel{{position:absolute;left:150px;width:780px;top:620px;padding:80px 70px 110px;color:#2b2b2b}}
.corpo-papel{{font-size:32px}}
.veu{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15) 0%,rgba(0,0,0,.35) 40%,rgba(0,0,0,.88) 100%)}}
.bloco-atmos{{position:absolute;left:{M}px;bottom:150px;width:820px;color:#f4f4f4}}
.bloco-atmos .gancho{{font-size:calc(128px * var(--k,1))}} .bloco-atmos .corpo{{margin-top:36px;max-width:640px}}
.bloco-cta{{position:absolute;left:{M}px;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center;z-index:1}}
.bloco-cta .gancho{{font-size:calc(132px * var(--k,1));color:var(--cor-primaria)}} .cor .bloco-cta .gancho{{color:#fff}}
.bloco-cta .corpo{{margin-top:40px;max-width:600px}}
.cta-linha{{margin-top:60px}} .k-pilula{{height:72px;font-size:26px;font-weight:700;padding:0 32px}}
.cta-linha{{display:flex;align-items:center;gap:26px}}
.seta-cta{{position:relative;width:130px;height:96px;transform:scaleX(-1) rotate(-12deg)}}
"""
    fontes = f'<!-- fontes: {m["titulo"]}, {m["texto"]}, {m["mao"]} -->'
    return f"<style>{css}</style>\n{fontes}\n" + "\n".join(secoes) + "\n" + "\n".join(x for x in soltos if x)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("roteiro", nargs="?"); ap.add_argument("--saida")
    ap.add_argument("--montar", action="store_true"); ap.add_argument("--exportar"); ap.add_argument("--porta", default="9333")
    ap.add_argument("--listar", action="store_true")
    a = ap.parse_args()
    if a.listar or not a.roteiro:
        for k, v in ESQUELETOS.items(): print(f"{k:16} {v}")
        sys.exit(0)
    with open(a.roteiro, encoding="utf-8") as fh: r = json.load(fh)
    saida = a.saida or os.path.splitext(a.roteiro)[0] + ".html"
    with open(saida, "w", encoding="utf-8") as fh: fh.write(montar_html(r))
    print(f"html: {saida} ({len(r['slides'])} slides)")
    if a.montar:
        cmd = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "knv.py"), saida, "--formato", "feed", "--novo",
               "--porta", str(a.porta), "--salvar", os.path.splitext(saida)[0] + ".iknv"]
        if a.exportar: cmd += ["--exportar", a.exportar]
        fin = r.get("acabamento", True)          # finalização: sombra, brilho, eco borrado, textura, Camera Raw
        if fin:
            opc = {"cor": r.get("marca", {}).get("primaria", "#ff3b22"), **(fin if isinstance(fin, dict) else {})}
            js = os.path.splitext(saida)[0] + "_fin.js"
            with open(js, "w", encoding="utf-8") as fh: fh.write(f"return await KNV.receita.arteFinal({json.dumps(opc)});\n")
            cmd += ["--depois", js]
        # auto-ajuste sem gastar token: atropelo/margem/respiro num slide → título 10% menor e monta de novo (até 3x)
        rev = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "revisor.py"), "--porta", str(a.porta), "--roteiro", a.roteiro]
        for volta in range(4):
            rc = subprocess.call(cmd)
            out = subprocess.run(rev, capture_output=True, text=True, encoding="utf-8").stdout.strip().splitlines()
            res = json.loads(out[-1]) if out else {"problemas": -1, "itens": []}
            ruins = {int(m.group(1)) for t in res["itens"] if re.match(r"(atropelo|margem|respiro) ", t) for m in [re.search(r"slide (\d+)", t)] if m}
            if not ruins or volta == 3: break
            for k in ruins:
                s = r["slides"][k - 1]; s["_k"] = round(s.get("_k", 1) * 0.9, 3)
            print(f"auto-ajuste {volta + 1}: títulos menores nos slides {sorted(ruins)}")
            with open(saida, "w", encoding="utf-8") as fh: fh.write(montar_html(r))
        print(json.dumps(res, ensure_ascii=False))
        sys.exit(rc)
