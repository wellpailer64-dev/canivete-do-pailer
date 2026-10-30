"""Peça de cliente no Photo Kanivete, sempre no app do Pailer, à vista. Guia: Instructions/agente/fluxo-peca-cliente.md

  py -3.13 tools/peca.py preset "<preset.psd>" --pasta "<pasta do card>" --nome "NOME"   abre o preset e já grava NOME.iknv na pasta
  py -3.13 tools/peca.py abrir "<arquivo>"                                               abre um arquivo e põe o Photo na frente
  py -3.13 tools/peca.py entregar --pasta "<pasta do card>" --nome "NOME" [--exportar]   guias+fatias à vista, salva, confere, deixa aberto

O preset original nunca é regravado. --paginas N força o carrossel (padrão: largura múltipla de 1080).
Sai com 1 se algo da conferência falhar: não dizer "pronto" nesse caso.
"""
import argparse, json, os, sys

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


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["preset", "abrir", "entregar"])
    ap.add_argument("arquivo", nargs="?")
    ap.add_argument("--pasta"); ap.add_argument("--nome")
    ap.add_argument("--paginas", type=int); ap.add_argument("--exportar", action="store_true")
    a = ap.parse_args()
    porta = 9222
    print(kanivete.abrir())
    q = lambda s: json.dumps(os.path.abspath(s).replace("\\", "/"), ensure_ascii=False)

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
        cod = f"IE.doc.nome={json.dumps(a.nome, ensure_ascii=False)};" + _estado(a.paginas) + f"est.salvo=await KNV.salvar({q(destino)});"
        if a.exportar:
            cod += f"est.exportados=await KNV.exportar({q(a.pasta)},{{fmt:'png',base:{json.dumps(a.nome, ensure_ascii=False)}}});"
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
