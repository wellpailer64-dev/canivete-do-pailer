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
Marcação no texto: *destaque* (cor primária), **negrito**, [trecho](circulo|sublinhado|risco|tarja|selecao).
Limites (o revisor confere): gancho ≤ 8 palavras, corpo ≤ 40 palavras por slide, 1 ideia por slide.
Fundos: escuro | claro | cor. Asset: {"prompt", "semente", "lado": "direita|esquerda", "ponte", "frente", "pb", "pele"}."""
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
    return s


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
    rod = f'<div class="mold-rod" data-papel="meta">{html.escape(u)}</div>' if u and not r.get("_sem_rodape", {}).get(i) else ""
    return perfil + num + rod


def slide(r, s, i, n):
    e, f = s.get("esqueleto", "texto-respiro"), s.get("fundo", "escuro")
    a, lado = s.get("asset"), (s.get("asset") or {}).get("lado", "direita")
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
            solto = img(a, f"heroi{i}", f"position:absolute;left:{x0 + W - 470}px;top:{H - 1000 + 40}px;width:820px;height:1000px;object-fit:contain;object-position:50% 100%;z-index:3")
            obj = ""
        else: obj = img(a, f"heroi{i}", est)
        meio = f'<div class="bloco-gancho">{g}{sub}</div>{obj}'
    elif e == "texto-respiro":
        tit = f'<h2 class="tit2">{inline(s["titulo"])}</h2>' if s.get("titulo") else ""
        canto = "left:-110px" if lado == "esquerda" else "right:-110px"
        obj = img(a, f"canto{i}", f"position:absolute;{canto};bottom:-90px;width:560px;height:620px;object-fit:contain;object-position:50% 100%")
        lado_txt = "right" if lado == "esquerda" else "left"
        meio = f'<div class="bloco-texto" style="{lado_txt}:{M}px">{tit}{corpo_html(s.get("corpo"))}</div>{obj}'
    elif e == "eco-pessoa":
        eco = f'<div class="k-eco eco-v">{html.escape(s.get("eco", ""))}</div>' if s.get("eco") else ""
        pess = img(a, f"pessoa{i}", f"position:absolute;{'right:-60px' if lado == 'direita' else 'left:-60px'};bottom:0;width:640px;height:1160px;object-fit:contain;object-position:50% 100%", "2:3")
        col = "left" if lado == "direita" else "right"
        tit = f'<h2 class="tit2">{inline(s.get("titulo") or s.get("gancho", ""))}</h2>'
        meio = f'{eco}{pess}<div class="bloco-eco" style="{col}:{M}px">{tit}{corpo_html(s.get("corpo"))}</div>'
    elif e == "papel":
        pre = f'<p class="pre" data-papel="subtitulo">{inline(s["pre"])}</p>' if s.get("pre") else ""
        meio = (f'<div class="bloco-papel-tit">{pre}{g}</div>'
                f'<div class="k-papel caixa-papel" data-rasgado="baixo" data-fita id="papel{i}">{corpo_html(s.get("corpo"), "corpo corpo-papel")}</div>')
    elif e == "foto-atmosfera":
        fundo_img = img({**(a or {}), "fundo_inteiro": True, "proporcao": "4:5"}, f"atmos{i}", "position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover") if a else ""
        meio = f'{fundo_img}<div class="veu"></div><div class="bloco-atmos">{g}{sub}{corpo_html(s.get("corpo"))}</div>'
    elif e == "virada-cta":
        cta = html.escape(s.get("cta", "Salve e compartilhe"))
        obj = img(a, f"fecho{i}", f"position:absolute;{'right:-120px' if lado == 'direita' else 'left:-120px'};top:120px;width:520px;height:640px;object-fit:contain")
        meio = (f'{obj}<div class="bloco-cta">{g}{corpo_html(s.get("corpo"))}'
                f'<div class="cta-linha"><div class="k-pilula" data-papel="cta" data-icone="salvar">{cta}</div>'
                f'<div class="k-seta-mao seta-cta"></div></div></div>')
    else: raise SystemExit(f"esqueleto desconhecido: {e} (veja --listar)")
    return f'<section class="slide {f} e-{e}" data-nome="Slide {i}">{meio}{moldura(r, i, n, f)}</section>', solto


def montar_html(r):
    m = {"primaria": "#ff3b22", "escuro": "#1c1c1e", "claro": "#ecebe7", "titulo": "Anton", "texto": "Inter", "mao": "Caveat", **r.get("marca", {})}
    n = len(r["slides"]); secoes, soltos = [], []
    # objeto-ponte cobre o canto de baixo do slide seguinte: lá o rodapé sai
    r["_sem_rodape"] = {k + 2: True for k, s in enumerate(r["slides"]) if (s.get("asset") or {}).get("ponte")}
    for i, s in enumerate(r["slides"], 1):
        a, b = slide(r, s, i, n); secoes.append(a); soltos.append(b)
    fundos = [s.get("fundo", "escuro") for s in r["slides"]]
    for p in r.get("pontes", []):
        k = p["depois"]                       # entre o slide k e o k+1
        if p.get("tipo") == "fita":
            soltos.append(f'<div class="k-fita" style="left:{k * W + 28}px;top:-20px;transform:rotate(90deg);transform-origin:0 0">{html.escape(p.get("texto", "Salve esse post"))}</div>')
        elif p.get("tipo") == "rasgo":        # o fundo do slide k entra rasgado no começo do k+1
            cor = {"escuro": m["escuro"], "claro": m["claro"], "cor": m["primaria"]}[fundos[k - 1]]
            secoes[k] = secoes[k].replace('">', f'"><div class="k-rasgo" data-lado="direita" data-cor="{cor}" style="left:0;top:0;width:70px;height:{H}px" id="rasgo{k}"></div>', 1)
    css = f"""
body{{--cor-primaria:{m['primaria']};--cor-fundo:#fff;font-family:'{m['texto']}';}}
.slide{{position:relative;overflow:hidden}}
.escuro{{background:radial-gradient(120% 80% at 70% 10%,#2c2c2f 0%,{m['escuro']} 60%);color:#f1f1f1}}
.claro{{background:radial-gradient(120% 80% at 30% 0%,#ffffff 0%,{m['claro']} 65%);color:#2b2b2b}}
.cor{{background:radial-gradient(120% 80% at 50% 0%,color-mix(in srgb,{m['primaria']} 92%,#000) 0%,color-mix(in srgb,{m['primaria']} 78%,#000) 70%);color:#fff}}
.cor .dest{{color:#1c1c1e}} .cor .k-pilula{{background:#fff;color:color-mix(in srgb,{m['primaria']} 80%,#000)}} .cor .k-seta-mao{{color:#fff}} .cor .k-marca{{--cor-marca:#1c1c1e}} .dest{{font-style:normal;color:var(--cor-primaria)}}
.gancho{{font-family:'{m['titulo']}';font-weight:400;text-transform:uppercase;font-size:150px;line-height:1.04;letter-spacing:-.5px;margin:0}}
.sub{{font-size:38px;line-height:1.2;margin-top:34px;max-width:620px}}
.pre{{font-size:30px;opacity:.75;margin-bottom:18px}}
.tit2{{font-family:'{m['titulo']}';font-weight:400;text-transform:uppercase;font-size:84px;line-height:1;margin:0 0 44px}}
.corpo{{font-size:32px;line-height:1.38}} .corpo p+p{{margin-top:30px}} .corpo b{{font-weight:700}}
.mold-perfil{{position:absolute;left:{M}px;top:52px;display:flex;align-items:center;gap:14px}}
.mold-av{{position:relative;width:54px;height:54px;border-radius:50%;background:color-mix(in srgb,var(--cor-primaria) 80%,#000);color:#fff;font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center}}
.mold-av img{{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;border-radius:50%}}
.cor .mold-av{{background:#fff;color:#1c1c1e}}
.mold-nome{{font-size:20px;font-weight:700;line-height:1.2}} .mold-cargo{{font-size:16px;opacity:.7;line-height:1.2}}
.mold-num{{position:absolute;right:{M}px;top:66px;font-size:20px;font-weight:700;display:flex;gap:8px;align-items:center}}
.mold-num svg{{color:var(--cor-primaria)}}
.mold-rod{{position:absolute;left:{M}px;bottom:56px;font-size:20px;font-weight:700;opacity:.7}}
.bloco-gancho{{position:absolute;left:{M}px;top:170px;width:880px;z-index:1}}
.bloco-texto{{position:absolute;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center}}
.eco-v{{top:-40px;font-size:340px;transform:rotate(90deg);transform-origin:0 0;left:{W - 60}px;color:currentColor;opacity:.08}}
.bloco-eco{{position:absolute;top:0;bottom:0;width:430px;display:flex;flex-direction:column;justify-content:center}}
.bloco-eco .tit2{{font-size:72px}}
.bloco-papel-tit{{position:absolute;left:{M}px;right:{M}px;top:170px;text-align:center}}
.bloco-papel-tit .gancho{{font-size:118px}}
.caixa-papel{{position:absolute;left:150px;width:780px;top:620px;padding:80px 70px 110px;color:#2b2b2b}}
.corpo-papel{{font-size:32px}}
.veu{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15) 0%,rgba(0,0,0,.35) 40%,rgba(0,0,0,.88) 100%)}}
.bloco-atmos{{position:absolute;left:{M}px;bottom:150px;width:820px;color:#f4f4f4}}
.bloco-atmos .gancho{{font-size:128px}} .bloco-atmos .corpo{{margin-top:36px;max-width:640px}}
.bloco-cta{{position:absolute;left:{M}px;top:0;bottom:0;width:760px;display:flex;flex-direction:column;justify-content:center;z-index:1}}
.bloco-cta .gancho{{font-size:132px;color:var(--cor-primaria)}} .cor .bloco-cta .gancho{{color:#fff}}
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
        rc = subprocess.call(cmd)
        subprocess.call([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "revisor.py"), "--porta", str(a.porta), "--roteiro", a.roteiro])
        sys.exit(rc)
