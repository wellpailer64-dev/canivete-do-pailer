"""Peça de cliente no Photo Kanivete, sempre no app do Pailer, à vista. Guia: Instructions/agente/fluxo-peca-cliente.md

  py -3.13 tools/peca.py preset "<preset.psd>" --pasta "<pasta do card>" --nome "NOME"   abre o preset e já grava NOME.iknv na pasta
  py -3.13 tools/peca.py abrir "<arquivo>"                                               abre um arquivo e põe o Photo na frente
  py -3.13 tools/peca.py entregar --pasta "<pasta do card>" --nome "NOME" [--exportar] [--saida P]   guias+fatias à vista, salva, confere, deixa aberto
  py -3.13 tools/peca.py enquete --pasta "<card>" --nome "NOME" --exame IMG [--monitor auto|quadrado|horizontal|empe] [--seta X,Y] [--apagar X,Y,W,H] [--refazer]
      Enquete do Dia MagnetUS inteira: escolhe o monitor pela proporção, exame inteiro no limite da tela, nunca amplia por IA, tira letra, põe seta (X,Y = ponto no exame original) e devolve prévia
  py -3.13 tools/peca.py instrucao "<video>"                                             transcreve e gera folha de quadros do vídeo do cliente

O preset original nunca é regravado. --paginas N força o carrossel (padrão: largura múltipla de 1080).
Sai com 1 se algo da conferência falhar: não dizer "pronto" nesse caso.
"""
import argparse, base64, io, json, math, os, subprocess, sys

sys.path.insert(0, r"D:\Kanivete\Plugins\kanicode\plugins\kanivete")
import kanivete


def _js(codigo, porta):
    return json.loads(kanivete.js("(async()=>{" + codigo + "})()", porta))


# documento da frente com guias e fatias por página, ambas à vista; devolve o estado medido
ESTADO = r"""
 const d=IE.doc; if(!d) throw new Error('nenhum documento aberto');
 const n=PAGINAS||(!(d.pranchetas||[]).length&&d.w>1080&&d.w%1080===0?d.w/1080:0);
 if(n>1){ const pg=d.w/n, xs=(d.guias||[]).filter(g=>g.o==='v').map(g=>Math.round(g.p));
  let ok=true; for(let i=1;i<n;i++) if(!xs.includes(Math.round(pg*i))) ok=false;
  if(!ok) ieGuiasLayoutAplicar(d,{colunas:{n,largura:'',medianiz:0}},true);
  if((d.fatias||[]).length!==n||!ok) ieFatiasDasGuias(d,{perguntar:false}); }
 if((d.fatias||[]).length){ IE.verGuias=true; d.verFatias=true; IE.semExtras=false; ieDesenharSobre(); }
 if(!document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem');
 const est={doc:d.nome,w:d.w,h:d.h,paginas:n||1,guias:(d.guias||[]).filter(g=>g.o==='v').map(g=>g.p),
  fatias:(d.fatias||[]).map(f=>[f.x,f.w]),verGuias:!!IE.verGuias,verFatias:!!d.verFatias,
  photoNaFrente:!!document.querySelector('#page-editor-imagem.active')};
"""


def _estado(paginas):
    return ESTADO.replace("PAGINAS", str(int(paginas or 0)))


def _falhas(e):
    f = []
    if not e["photoNaFrente"]: f.append("o Photo não está na aba da frente")
    if e["paginas"] > 1:
        if len(e["fatias"]) != e["paginas"]: f.append(f"{len(e['fatias'])} fatias para {e['paginas']} páginas")
        if not (e["verGuias"] and e["verFatias"]): f.append("guias ou fatias escondidas")
    return f


PRESET_ENQUETE = r"D:/01 - ALL IN CLOUD - HD PAILER/01 - PANDA LAB/01 - CLIENTES/06 - MAGNETUS/PRESSETS/PRESSET ENQUETE DO DIA.psb"
PREVIAS = r"D:/kanivete_testes/pecas"
# medidas do preset: grupo, tela do monitor (x0, y0, x1, y1) e fatia (x, y, w, h)
MONITORES = {
 "horizontal": (("FEED 1", (37, 354, 1050, 947), (2, 5, 1080, 1400)), ("STORY 1", (26, 1967, 1049, 2566), (0, 1534, 1080, 1920))),
 "quadrado": (("FEED 2", (1257, 331, 2176, 1016), (1182, 5, 1080, 1400)), ("STORY 2", (1248, 1956, 2185, 2653), (1180, 1534, 1080, 1920))),
 "empe": (("FEED 2 copy", (2615, 278, 3183, 1245), (2357, 0, 1080, 1400)), ("STORY 2 copy", (2521, 1929, 3252, 3173), (2342, 1532, 1080, 1920))),
}
GRUPOS = ["FEED 1", "FEED 2", "FEED 2 copy", "STORY 1", "STORY 2", "STORY 2 copy"]


def _escolher_monitor(w, h):
    """O monitor de proporção mais próxima da do exame (comparada em razão, para vertical e horizontal pesarem igual)."""
    r = w / h
    def dist(nome):
        t = MONITORES[nome][0][1]
        return abs(math.log(r * (t[3] - t[1]) / (t[2] - t[0])))
    return min(MONITORES, key=dist)


def _preparar_exame(a, destino):
    """Exame inteiro, sem corte, ampliado até o limite da tela; ampliação comum (Lanczos), nunca por IA, mesmo pequeno.
    Sobra da tela fica preta. Devolve onde o exame caiu na imagem: ox, oy e escala."""
    import cv2, numpy as np
    from PIL import Image
    im = cv2.imdecode(np.fromfile(a.exame, np.uint8), 1)
    if a.apagar:
        x, y, w, h = map(int, a.apagar.split(","))
        m = np.zeros(im.shape[:2], np.uint8)
        m[y:y + h, x:x + w] = (cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)[y:y + h, x:x + w] > 120) * 255
        im = cv2.inpaint(im, cv2.dilate(m, np.ones((5, 5), np.uint8)), 5, cv2.INPAINT_TELEA)
    pil = Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))
    W, H = pil.size
    if a.monitor == "auto": a.monitor = _escolher_monitor(W, H)
    t = MONITORES[a.monitor][1][1]   # story: a tela maior define a resolução
    tw, th = t[2] - t[0], t[3] - t[1]
    k = max(1, W / tw, H / th)   # exame maior que a tela mantém a resolução dele
    cw, ch = round((tw + 8) * k), round((th + 6) * k)   # sobra de 4 e 3 px fica atrás da moldura, sem cobrir o exame
    s = min(tw * k / W, th * k / H)
    nw, nh = round(W * s), round(H * s)
    ox, oy = (cw - nw) // 2, (ch - nh) // 2
    tela = Image.new("RGB", (cw, ch), (0, 0, 0))
    tela.paste(pil.resize((nw, nh), Image.LANCZOS), (ox, oy))
    tela.save(destino)
    return ox, oy, s, cw


def _enquete(a, porta):
    pasta = os.path.abspath(a.pasta); destino = os.path.join(pasta, a.nome + ".iknv")
    if os.path.exists(destino) and not a.refazer: sys.exit(f"já existe {destino}: use --refazer para montar de novo")
    os.makedirs(os.path.join(pasta, "02 - ASSETS"), exist_ok=True)
    tela = os.path.join(pasta, "02 - ASSETS", a.nome + "_tela.png")
    ox, oy, esc, cw = _preparar_exame(a, tela)
    q = lambda s: json.dumps(s.replace("\\", "/"), ensure_ascii=False)
    feed, story = MONITORES[a.monitor]
    cod = f"""const N={json.dumps(a.nome, ensure_ascii=False)}, GR={json.dumps(GRUPOS, ensure_ascii=False)}, MANTER={json.dumps([feed[0], story[0]], ensure_ascii=False)};
 switchTool('editor-imagem');
 for(let i=0;i<150&&!ieApi();i++) await new Promise(r=>setTimeout(r,200));
 const v=IE.docs.find(x=>x.nome===N); if(v) await ieFecharDoc(v,true);
 if(!await ieAbrirArquivo({q(PRESET_ENQUETE)})) throw new Error('preset não abriu');
 const d=IE.doc; d.nome=N;
 const id=(g,n)=>{{const c=KNV.camadas().find(c=>c.pai===g&&c.nome===n); if(!c) throw new Error(n+' não existe em '+g); return c.id}};
"""
    for g, t, _ in (feed, story):
        w = t[2] - t[0] + 8
        cod += f"await KNV.colocar({q(tela)},{{nome:'EXAME {g}',x:{t[0] - 4},y:{t[1] - 3},largura:{w},acima:id({json.dumps(g)},'OPÇÕES FINAIS-15-05')}});\n"
    if a.seta:
        px, py = map(float, a.seta.split(","))
        cod += f"const seta=id({json.dumps(feed[0])},'Arrow065 1 copy 2'); iePercorrer(d.camadas,L=>{{if(L.id===seta)L.visivel=true}}); KNV.ativar(seta); KNV.moverPara('EXAME '+{json.dumps(feed[0])}); const c0=KNV.caixa(seta);\n"
        for i, (g, t, _) in enumerate((story, feed)):
            k = (t[2] - t[0] + 8) / cw
            x, y = t[0] - 4 + (ox + px * esc) * k + 11, t[1] - 3 + (oy + py * esc) * k + 11
            if i == 0:
                cod += f"KNV.ativar(seta); await KNV.duplicar('Seta story'); KNV.moverPara('EXAME '+{json.dumps(g)}); KNV.mover(Math.round({x}-c0.x),Math.round({y}-c0.y));\n"
            else:
                cod += f"KNV.ativar(seta); KNV.renomear('Seta feed'); KNV.mover(Math.round({x}-c0.x),Math.round({y}-c0.y));\n"
    fat = ",".join(f"{{id:++d.seqFatia,nome:{json.dumps(g)},x:{f[0]},y:{f[1]},w:{f[2]},h:{f[3]}}}" for g, _, f in (feed, story))
    cod += f"""for(const g of GR) if(!MANTER.includes(g)) iePercorrer(d.camadas,L=>{{if(L.nome===g&&L.tipo==='grupo')L.visivel=false}});
 d.fatias=[{fat}]; d.verFatias=true; ieTudo(d); await KNV._quadro();
 const png=await KNV.png(1); const est={{doc:d.nome,salvo:await KNV.salvar({q(destino)}),png,fatias:d.fatias.map(f=>[f.nome,f.x,f.y,f.w,f.h])}};
 return JSON.stringify(est);"""
    e = _js(cod, porta)
    from PIL import Image
    im = Image.open(io.BytesIO(base64.b64decode(e.pop("png")))); os.makedirs(PREVIAS, exist_ok=True)
    e["previas"] = []
    for n, x, y, w, h in e["fatias"]:
        p = os.path.join(PREVIAS, f"{a.nome}_{n}.png"); im.crop((x, y, x + w, y + h)).save(p); e["previas"].append(p)
    e["monitor"] = a.monitor; e["janela"] = kanivete.frente(porta)
    print(json.dumps(e, ensure_ascii=False, indent=1))
    return 0


def _instrucao(video):
    os.makedirs(PREVIAS, exist_ok=True)
    base = os.path.join(PREVIAS, os.path.splitext(os.path.basename(video))[0])
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", video, "-vf", "fps=1/3,scale=620:-1,tile=4x3", "-frames:v", "1", base + "_quadros.jpg"], check=True)
    import whisper
    r = whisper.load_model("medium", download_root=r"D:/kanivete_testes/whisper").transcribe(video, language="pt")
    for s in r["segments"]: print(round(s["start"]), s["text"].strip())
    print("quadros:", base + "_quadros.jpg")
    return 0


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["preset", "abrir", "entregar", "enquete", "instrucao"])
    ap.add_argument("arquivo", nargs="?")
    ap.add_argument("--pasta"); ap.add_argument("--nome")
    ap.add_argument("--paginas", type=int); ap.add_argument("--exportar", action="store_true")
    ap.add_argument("--saida", help="pasta dos PNGs de --exportar (padrão: a do card)")
    ap.add_argument("--exame"); ap.add_argument("--monitor", default="auto", choices=["auto"] + list(MONITORES))
    ap.add_argument("--seta"); ap.add_argument("--apagar"); ap.add_argument("--refazer", action="store_true")
    a = ap.parse_args()
    porta = 9222
    if a.cmd == "instrucao": return _instrucao(a.arquivo)
    print(kanivete.abrir())
    q = lambda s: json.dumps(os.path.abspath(s).replace("\\", "/"), ensure_ascii=False)

    if a.cmd == "enquete":
        if not (a.pasta and a.nome and a.exame): ap.error("--pasta, --nome e --exame são obrigatórios")
        return _enquete(a, porta)
    if a.cmd in ("preset", "entregar") and not (a.pasta and a.nome):
        ap.error("--pasta e --nome são obrigatórios")
    if a.cmd in ("preset", "abrir"):
        if not a.arquivo or not os.path.isfile(a.arquivo): ap.error("arquivo não encontrado")
        cod = f"switchTool('editor-imagem'); await KNV.abrir({q(a.arquivo)});"
        if a.cmd == "preset":
            destino = os.path.join(a.pasta, a.nome + ".iknv")
            if os.path.exists(destino): sys.exit(f"já existe {destino}: use abrir, para não perder o trabalho")
            cod += f"IE.doc.nome={json.dumps(a.nome, ensure_ascii=False)};" + _estado(a.paginas) + f"est.salvo=await KNV.salvar({q(destino)});"
        else:
            cod += _estado(a.paginas)
        e = _js(cod + "return JSON.stringify(est);", porta)
    else:
        destino = os.path.join(a.pasta, a.nome + ".iknv")
        # traz para a frente o documento desta peça: pode haver outra aba aberta
        cod = f"{{const o=IE.docs.find(x=>x.nome==={json.dumps(a.nome, ensure_ascii=False)}); if(o) ieMostrarDoc(o);}} IE.doc.nome={json.dumps(a.nome, ensure_ascii=False)};" + _estado(a.paginas) + f"est.salvo=await KNV.salvar({q(destino)});"
        if a.exportar:
            cod += f"est.exportados=await KNV.exportar({q(a.saida or a.pasta)},{{fmt:'png',base:{json.dumps(a.nome, ensure_ascii=False)}}});"
        e = _js(cod + "return JSON.stringify(est);", porta)
        if not os.path.getsize(destino): sys.exit("arquivo salvo vazio")
    e["janela"] = kanivete.frente(porta)
    f = _falhas(e)
    if not e["janela"].get("visivel"): f.append("a janela do KANIVETE não está visível")
    e["falhas"] = f
    print(json.dumps(e, ensure_ascii=False, indent=1))
    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())
