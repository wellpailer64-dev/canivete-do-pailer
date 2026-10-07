"""Mapa geral do KANIVETE — gera Instructions/MAPA.md (pessoas, Claude) e Instructions/mapa.json (Jr / Worker local).

    py -3.13 tools/mapa_geral.py            # regenera os dois (rode depois de criar ferramenta, comando ou teste)
    py -3.13 tools/mapa_geral.py --busca X  # onde está X (ferramenta, método da API, comando VKN/KNV, arquivo, guia)

O mapa é lido do próprio código (não envelhece): ferramentas do menu do index.html, métodos da classe Api do main.py
(agrupados por ferramenta, com os módulos Functions que cada um usa), comandos do Vetor (vkRegistrar), métodos do
KNV (Photo) e do VE3DAPI, arquivos de frontend/Functions por ferramenta, testes e guias com a 1ª linha de cada.
A parte fixa (arquitetura, onde ficam os dados, como trabalhar) está em CABECALHO, abaixo.
"""
import glob
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ferramenta → arquivos, prefixos da API, guias, testes, automação (o que o nome não deixa adivinhar)
FERR = {
    "video-cutter": {"front": ["editor*.js", "editor.css"], "back": ["video_cutter", "render_cache", "autoframe", "autoframe_modelos", "transicoes", "premiere", "premiere_xml",
                     "cena3d", "blender_cena", "legendas", "legendas_formatos", "agente_midia", "anti_noise", "soundboard", "psd_import", "projeto", "sincronizar", "otimizar", "media_server"],
                     "api": ["ve_", "af_", "afm_", "audio_cutter", "anti_noise"], "guias": ["editor-video.md", "agente/guia-edicao.md", "agente/plano-comp.md", "agente/cena-3d-editor.md",
                     "agente/direcao-de-arte.md", "importar-premiere.md", "agente/ajuste-premiere.md", "agente/teste-4k.md", "agente/mapa-editor.md"],
                     "testes": ["teste_export", "teste_play", "teste_premiere", "teste_premiere_xml", "teste_vetor_editor3d"],
                     "auto": "estado em VE (VE.clips, VE.media, veSeek...), Cena 3D: window.VE3DAPI; Worker: executor_editor.js"},
    "editor-imagem": {"front": ["imagem-*.js", "imagem.css", "ponte-kanivete.js"], "back": ["editor_imagem", "gerador_imagem", "preencher_conteudo", "ceu", "recorte_pro", "ampliar_imagem",
                      "fontes", "psd_texto_modelo", "psd_so_modelo", "amostras", "recuperar"], "api": ["ie_"],
                      "guias": ["editor-imagem.md", "agente/design-photo-kanivete.md", "agente/plano-cena.md", "agente/direcao-carrossel.md", "agente/diretor-de-arte.md", "agente/mapa-imagem.md"],
                      "testes": ["teste_imagem", "teste_psd_*", "teste_caneta", "teste_guias", "teste_dissolver", "teste_galeria", "teste_cameraraw", "teste_pincel", "teste_editar",
                                 "teste_conteudo", "teste_ceu", "teste_generativo", "teste_filtros", "teste_barra", "teste_laco", "teste_corte_alt"],
                      "auto": "window.KNV (imagem-api.js); diagramar: KNV.cena / tools/knv.py; Worker: executor.js"},
    "vetor-kanivete": {"front": ["vetor-*.js", "vetor.css", "ponte-vetor-photo.js"], "back": ["vetor_kanivete", "vetor_importar", "vetor_exportar", "vetor_saida", "vetor_fonte",
                       "ponte_illustrator", "blender_render"], "api": ["vk_"],
                       "guias": ["vetor-kanivete.md", "agente/mapa-vetor.md", "agente/plano-economia-ponte-vetor-photo.md"],
                       "testes": ["teste_vetor", "teste_pranchetas", "teste_fonte", "teste_illustrator", "teste_vetor_paineis", "teste_ponte", "teste_blender"],
                       "auto": "window.VKN (VKN.cmd(nome, args) = os comandos abaixo; VKN.mapa(), VKN.fechamento(), VKN.cena); Worker: executor_vetor.js"},
    "compressor-video": {"back": ["compressor_video"], "api": ["compressor_video", "compressor_"], "guias": []},
    "video-converter": {"back": ["videoconverter"], "api": ["video_conver", "converter_video"], "guias": ["video-converter.md"]},
    "video-downloader": {"back": ["videodownloader"], "api": ["video_down", "video_"], "guias": ["video-downloader.md"]},
    "organizador-videos": {"back": ["organizador_de_videos", "snapshot_logger"], "api": ["organizador_videos", "escanear_cameras"], "guias": []},
    "converter-audio": {"back": ["convertermp3", "audio_cutter"], "api": ["converter_", "audio_"], "guias": []},
    "transcrever-audio": {"back": ["transcreveraudio", "transcrever_cena"], "api": ["transcrever_"], "guias": ["transcrever-audio.md"]},
    "melhorar-audio": {"back": ["melhorar_audio", "melhorar_audio_runner"], "api": ["melhorar_"], "guias": ["melhorar-audio.md"]},
    "omnivoice": {"back": ["omnivoice_tool", "omnivoice_runner"], "api": ["omnivoice_"], "guias": []},
    "converter-imagem": {"back": ["converterimagem"], "api": ["converter_imagem"], "guias": []},
    "compressor-imagem": {"back": ["compressor_imagem"], "api": ["compressor_imagem"], "guias": ["compressor-imagem.md"]},
    "remover-fundo": {"back": ["removerfundo", "recorte_pro"], "api": ["remover_"], "guias": ["remover-fundo.md", "agente/remover-fundo.md"]},
    "organizador-imagens": {"back": ["organizador_de_imagens"], "api": ["organizador_imagens"], "guias": ["organizador-imagens.md"]},
    "favicon": {"back": ["faviconconverter"], "api": ["favicon_"], "guias": ["favicon-generator.md"]},
    "gdrive-dumper": {"back": ["gdrive_dumper"], "api": ["gdrive_"], "guias": ["gdrive-dumper.md"]},
    "web-scraper": {"back": ["webscraper", "cerebro_local"], "api": ["web_", "cerebro_"], "guias": ["webscraper.md", "cerebro.md"]},
}

CABECALHO = """# MAPA DO KANIVETE

> Gerado por `py -3.13 tools/mapa_geral.py` (lê o código; rode de novo depois de criar ferramenta, comando ou teste).
> Busca rápida: `py -3.13 tools/mapa_geral.py --busca <termo>`. Versão para o Jr/Worker: `Instructions/mapa.json`.
> Para achar uma função dentro de uma área: `py -3.13 tools/mapa_codigo.py vetor|imagem|editor --busca termo`.

## 1. Como o app funciona (arquitetura)
- **Janela**: `main.py` abre o pywebview (WebView2) com `frontend/index.html`. Toda a interface é HTML/CSS/JS em
  `frontend/` (um `<script>` por arquivo, carregados juntos; cada ferramenta é uma `div.tool-page` mostrada por
  `switchTool(id)` em `app.js`).
- **Ponte JS → Python**: `window.pywebview.api.<metodo>(...)` chama a classe `Api` do `main.py` (seção 5), que importa
  o módulo de `Functions/` só na hora do uso (abrir o app custa ~45 ms de Python). Progresso volta por `_js("funcao", ...)`.
- **Mídia**: `Functions/media_server.py` serve arquivos locais para o `<video>/<img>` (porta local).
- **Modelos de IA**: baixados sob demanda em `modelos_ia/` (ao lado do exe). Carregados só quando usados e soltos da
  memória quando ficam parados (`Functions/memoria.py`: 5 min; os da placa de vídeo, 3 min).
- **Uma instância só**: `Functions/instancia_unica.py`; abrir um arquivo com o app aberto manda para o que está aberto.
- **Atualização**: push na `main` → GitHub Actions gera o release → `Functions/updater.py` nos amigos.

## 2. Onde ficam as coisas
| O quê | Onde |
|---|---|
| Código Python das ferramentas | `Functions/*.py` (um módulo por ferramenta/assunto, seção 10) |
| Interface | `frontend/index.html`, `frontend/js/*.js`, `frontend/css/*.css`, `frontend/img`, `frontend/identidade` |
| Modelos de IA, ffmpeg, Blender, exiftool | `modelos_ia/` (dev) ou `dist/CaniveteDoPailer/modelos_ia/` (instalado) |
| Preferências | `%APPDATA%/CaniveteDoPailer` (`ie_prefs`: painéis, espaços de trabalho, estilos) |
| Caches (prévias de vídeo, render, PSD importados, imagens geradas) | `%LOCALAPPDATA%/CaniveteDoPailer/` (render e mídia: limpeza automática 20 GB / 30 dias) |
| Logs | `logs/` ao lado do exe (`erros.log` com teto de 2 MB) |
| Testes e saídas de teste | `testes/*.py` (código) → saídas sempre em `D:/kanivete_testes` (nunca no C) |
| Ferramentas de desenvolvimento | `tools/` (seção 8), Worker local em `tools/worker/` |
| Guias por assunto | `Instructions/` (seção 9); regras de trabalho em `CLAUDE.md` |
| Biblioteca de design (marcas, modelos, recursos) | `D:/kanivete_biblioteca` |

## 3. Caminhos entre ferramentas (pontes)
| De → Para | Como | Onde |
|---|---|---|
| Photo → Editor | camada/arte animada vira faixa (Animar) | `ponte-kanivete.js` |
| Vetor ↔ Photo | objeto inteligente vetorial no Photo (editar no Vetor, Ctrl+S devolve); vínculo vivo do .iknv no Vetor | `ponte-vetor-photo.js`, `Instructions/vetor-kanivete.md` §12 |
| Vetor → Editor 3D | objeto 3D do Vetor anima na Cena 3D (`enviar_editor_3d`) | `vetor-3d.js`, `editor-3d.js` |
| Vetor → Blender | render fotorrealista com rótulo (`render_blender`) | `vetor-blender.js`, `Functions/blender_render.py` |
| PSD → Editor | PSD/PSB vira Comp com camadas e texto editável | `editor-psd.js`, `Functions/psd_import.py` |
| Premiere ↔ Editor | abre .prproj; volta por XML do FCP7 | `Functions/premiere.py`, `Functions/premiere_xml.py` |
| Vetor ↔ Illustrator | .ai NATIVO montado no Illustrator; volta com pranchetas/camadas/texto | `Functions/ponte_illustrator.py`, `vetor-kanivete.md` §15 |
| Photo ↔ Photoshop | PSD de ida e volta (texto, forma, objeto inteligente, preenchimentos editáveis) | `Functions/editor_imagem.py` |
| Qualquer → IA local | gerar imagem (Z-Image/FLUX klein), preencher, céu, recorte, legendas, voz | seção 5, em cada ferramenta |

**Jr (Worker local, Qwen3 8B)**: recebe um contrato JSON e opera o app pelas mesmas APIs (`VKN.cmd`, `KNV.*`, estado `VE`):
`py -3.13 tools/worker/worker.py contrato.json` (Photo), `"app": "vetor"`/`"editor"` nos outros; código e testes:
`tools/worker/codigo.py`. Ferramentas que ele enxerga: `tools/worker/ferramentas*.json`. Guia: `Instructions/agente/worker.md`.
Para se localizar: este mapa (`mapa.json` é a versão compacta) e `--busca`.

## 4. Testar e operar sem abrir o app à mão
- App de teste: `APPDATA=D:\\kanivete_testes\\appdata TEMP=D:\\kanivete_testes\\tmp TMP=D:\\kanivete_testes\\tmp
  LOCALAPPDATA=D:\\kanivete_testes\\localappdata py -3.13 main.py --agente=9333` → Chrome DevTools em 127.0.0.1:9333
  (Playwright `connect_over_cdp`), rodar JS na página real com a API de verdade.
- Aplicar mudança sem reiniciar: `py -3.13 tools/recarregar.py [--py] [--ferramenta id]` (só `main.py` pede reinício).
- Editar código: `py -3.13 tools/patch.py arquivo.patch` (um `@@ arquivo` por bloco).
"""


def ler(f):
    try:
        return open(f, encoding="utf-8", errors="ignore").read()
    except OSError:
        return ""


def primeira_linha(f):
    t = ler(f)
    m = re.search(r'^\s*(?:"""|\'\'\')\s*(.+?)\s*$', t, re.M) if f.endswith(".py") else None
    if m:
        return m.group(1).strip().strip('"').rstrip(".")[:150]
    m = re.search(r"^#+\s*(.+)$", t, re.M)
    return (m.group(1).strip() if m else "")[:150]


def ferramentas_do_menu():
    t = ler("frontend/index.html")
    out, grupo = [], ""
    for m in re.finditer(r'<div class="menu-group">([^<]+)</div>|data-tool="([^"]+)"[^>]*>.*?<span class="label">([^<]+)</span>', t, re.S):
        if m.group(1):
            grupo = m.group(1)
        elif m.group(2) != "home":
            out.append({"id": m.group(2), "nome": m.group(3), "grupo": grupo})
    return out


def api_metodos():
    t = ler("main.py")
    i = t.index("class Api")
    corpo = t[i:]
    out = []
    for m in re.finditer(r"^    def ([a-z]\w*)\(self(?:,\s*)?([^)]*)\):\n((?:(?:        .*|\s*)\n)*)", corpo, re.M):
        nome, args, bloco = m.group(1), m.group(2), m.group(3)
        mods = sorted(set(re.findall(r"from Functions(?:\.(\w+))? import ([\w, ]+)", bloco) and
                          [x for a, b in re.findall(r"from Functions(?:\.(\w+))? import ([\w, ]+)", bloco) for x in ([a] if a else [s.strip() for s in b.split(",")])]))
        doc = re.match(r'\s*"""(.+?)(?:"""|\n)', bloco)
        out.append({"nome": nome, "args": re.sub(r"\s+", " ", args).strip(), "modulos": mods, "doc": (doc.group(1).strip()[:120] if doc else "")})
    return out


def comandos_vkn():
    out = []
    for f in sorted(glob.glob("frontend/js/vetor-*.js")):
        for m in re.finditer(r"vkRegistrar\('([\w]+)',\s*'([^']*)'", ler(f)):
            out.append({"cmd": m.group(1), "desc": m.group(2), "arquivo": os.path.basename(f)})
    return out


def metodos_objeto(arq, inicio):
    t = ler(arq)
    i = t.find(inicio)
    if i < 0:
        return []
    nomes, prof, j = [], 0, t.index("{", i)
    k = j
    while k < len(t):
        c = t[k]
        if c == "{":
            prof += 1
        elif c == "}":
            prof -= 1
            if prof == 0:
                break
        k += 1
    bloco = t[j:k]
    for m in re.finditer(r"^\s{4}(?:async\s+)?([a-zA-Z]\w*)\s*(?:\(|:)", bloco, re.M):
        if m.group(1) not in nomes:
            nomes.append(m.group(1))
    return nomes


def casa(nome, padroes):
    return any(re.fullmatch(p.replace("*", ".*"), nome) for p in padroes)


def gerar():
    menu = ferramentas_do_menu()
    api = api_metodos()
    usados = set()
    js_todos = [os.path.basename(f) for f in glob.glob("frontend/js/*.js")] + [os.path.basename(f) for f in glob.glob("frontend/css/*.css")]
    testes = {os.path.splitext(os.path.basename(f))[0]: primeira_linha(f) for f in sorted(glob.glob("testes/teste_*.py"))}
    ferr = []
    for t in menu:
        cfg = FERR.get(t["id"], {})
        front = [f for f in js_todos if casa(f, cfg.get("front", []))]
        mets = [a for a in api if any(a["nome"].startswith(p) for p in cfg.get("api", []))
                or (cfg.get("back") and set(a["modulos"]) & set(cfg["back"]) and not a["nome"].split("_")[0] in ("ve", "ie", "vk"))]
        if t["id"] in ("video-cutter", "editor-imagem", "vetor-kanivete"):
            mets = [a for a in api if any(a["nome"].startswith(p) for p in cfg.get("api", []))]
        mets = [a for a in mets if a["nome"] not in usados]
        usados |= {a["nome"] for a in mets}
        ts = [n for n in testes if any(re.fullmatch(p.replace("*", ".*"), n) for p in cfg.get("testes", []))]
        ferr.append({**t, "front": front, "back": [f"Functions/{b}.py" for b in cfg.get("back", [])], "api": [a["nome"] for a in mets],
                     "testes": ts, "guias": [f"Instructions/{g}" for g in cfg.get("guias", []) if os.path.exists(f"Instructions/{g}")], "automacao": cfg.get("auto", "")})
    gerais = [a for a in api if a["nome"] not in usados]
    vkn = comandos_vkn()
    knv = metodos_objeto("frontend/js/imagem-api.js", "const KNV = {")
    for f in glob.glob("frontend/js/*.js"):   # métodos que outros arquivos acrescentam (Object.assign(KNV, {...}))
        if "Object.assign(KNV, {" in ler(f):
            knv += [n for n in metodos_objeto(f, "Object.assign(KNV, {") if n not in knv]
    ve3d = metodos_objeto("frontend/js/editor-3d.js", "window.VE3DAPI =")
    tools = {f.replace("\\", "/"): primeira_linha(f) for f in sorted(glob.glob("tools/*.py") + glob.glob("tools/worker/*.py"))}
    guias = {f.replace("\\", "/"): primeira_linha(f) for f in sorted(glob.glob("Instructions/*.md") + glob.glob("Instructions/agente/*.md")) if not f.endswith("MAPA.md")}
    modulos = {f"Functions/{os.path.basename(f)}": primeira_linha(f) for f in sorted(glob.glob("Functions/*.py")) if not f.endswith("_credenciais.py")}
    apid = {a["nome"]: a for a in api}

    L = [CABECALHO, "## 5. Ferramentas (menu do app) — arquivos, API, testes e guias\n"]
    for g in dict.fromkeys(f["grupo"] for f in ferr):
        L.append(f"### {g}")
        for f in [x for x in ferr if x["grupo"] == g]:
            L.append(f"#### {f['nome']} — `switchTool('{f['id']}')`")
            if f["front"]:
                L.append(f"- **Interface**: {', '.join('`' + x + '`' for x in f['front'][:40])}" + (" …" if len(f["front"]) > 40 else ""))
            if f["back"]:
                L.append(f"- **Python**: {', '.join('`' + x + '`' for x in f['back'])}")
            if f["automacao"]:
                L.append(f"- **Automação (agente/Jr)**: {f['automacao']}")
            if f["api"]:
                L.append(f"- **API** (`pywebview.api.*`, {len(f['api'])}): " + ", ".join(f"`{n}({apid[n]['args']})`" for n in f["api"]))
            if f["testes"]:
                L.append(f"- **Testes**: {', '.join('`testes/' + t + '.py`' for t in f['testes'])}")
            if f["guias"]:
                L.append(f"- **Guias**: {', '.join('`' + x + '`' for x in f['guias'])}")
            L.append("")
    L.append(f"### API geral (app, janela, preferências, arquivos) — {len(gerais)} métodos")
    L.append(", ".join(f"`{a['nome']}({a['args']})`" for a in gerais) + "\n")
    L.append(f"## 6. Vetor Kanivete — comandos `VKN.cmd(nome, args)` ({len(vkn)}; a interface, o Claude e o Jr usam os mesmos)")
    for arq in dict.fromkeys(c["arquivo"] for c in vkn):
        L.append(f"- `{arq}`: " + ", ".join(f"`{c['cmd']}` ({c['desc']})" for c in vkn if c["arquivo"] == arq))
    L.append(f"\n## 7. Photo Kanivete — `window.KNV` ({len(knv)} métodos; detalhes em `frontend/js/imagem-api.js`)")
    L.append(", ".join(f"`{n}`" for n in knv))
    if ve3d:
        L.append(f"\n**Editor — Cena 3D `window.VE3DAPI`** ({len(ve3d)}): " + ", ".join(f"`{n}`" for n in ve3d))
    L.append("\n## 8. Ferramentas de desenvolvimento (`tools/`)")
    L += [f"- `{k}` — {v}" for k, v in tools.items()]
    L.append("\n## 9. Guias (`Instructions/`)")
    L += [f"- `{k}` — {v}" for k, v in guias.items()]
    L.append("\n## 10. Módulos Python (`Functions/`)")
    L += [f"- `{k}` — {v}" for k, v in modulos.items()]
    L.append("\n## 11. Testes (`testes/`)")
    L += [f"- `testes/{k}.py` — {v}" for k, v in testes.items()]
    open("Instructions/MAPA.md", "w", encoding="utf-8").write("\n".join(L) + "\n")
    js = {"ferramentas": ferr, "api_geral": [a["nome"] for a in gerais], "api": {a["nome"]: {"args": a["args"], "modulos": a["modulos"]} for a in api},
          "vkn": {c["cmd"]: c["desc"] for c in vkn}, "knv": knv, "ve3d": ve3d, "tools": tools, "guias": guias, "modulos": modulos,
          "testes": testes}
    json.dump(js, open("Instructions/mapa.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return js


def buscar(termo, js):
    t = termo.lower()
    for f in js["ferramentas"]:
        blob = json.dumps(f, ensure_ascii=False).lower()
        if t in blob:
            hits = [x for k in ("front", "back", "api", "testes", "guias") for x in f[k] if t in x.lower()]
            print(f"[ferramenta] {f['nome']} ({f['id']})" + (f": {', '.join(hits[:12])}" if hits else ""))
    for k in ("vkn", "api", "tools", "guias", "modulos", "testes"):
        itens = js[k].items() if isinstance(js[k], dict) else ((x, "") for x in js[k])
        for n, v in itens:
            if t in n.lower() or t in json.dumps(v, ensure_ascii=False).lower():
                print(f"[{k}] {n} — {v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)[:120]}")
    for n in js["knv"]:
        if t in n.lower():
            print(f"[knv] KNV.{n}")


if __name__ == "__main__":
    js = gerar()
    if "--busca" in sys.argv:
        buscar(sys.argv[sys.argv.index("--busca") + 1], js)
    else:
        print(f"MAPA.md e mapa.json: {len(js['ferramentas'])} ferramentas, {len(js['api'])} métodos da API, {len(js['vkn'])} comandos VKN, "
              f"{len(js['knv'])} KNV, {len(js['testes'])} testes, {len(js['guias'])} guias")
