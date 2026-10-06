"""PSD salvo por cima (ida e volta) não pode trocar pixels entre camadas (2026-10-06: o carrossel do cliente voltou com
"cena5" carregando o texto de outro slide — referência por posição desencontrada depois de apagar/criar/reordenar).

Cria 6 camadas de cores/posições diferentes, salva PSD; apaga, cria, reordena, renomeia e repinta; salva por cima
(2×); a cada vez relê o arquivo (psd-tools) e confere cor média e caixa de cada camada. Sai com 1 se alguma trocar.
uso: py -3.13 testes/teste_psd_refs.py [--porta 9333]   (app de teste em --agente=9333)"""
import argparse, os, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
from psd_tools import PSDImage

ap = argparse.ArgumentParser(); ap.add_argument("--porta", type=int, default=9333); a = ap.parse_args()
PASTA = os.path.join(os.environ.get("TEMP", "D:/kanivete_testes/tmp"), "teste_psd_refs"); os.makedirs(PASTA, exist_ok=True)
PSD = os.path.join(PASTA, "refs.psd").replace("\\", "/")

PREP = r"""async () => {
  if (!document.querySelector('#page-editor-imagem.active')) switchTool('editor-imagem');
  KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo();
  const d = ieNovoDoc2('refs', 900, 600, 72, 'transp'); d.camadas = [];
  const cores = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#46f0f0'];
  cores.forEach((cor, i) => { const c = ieCanvas(80 + i * 10, 60 + i * 8), x = ieCtx(c); x.fillStyle = cor; x.fillRect(0, 0, c.width, c.height);
      d.camadas.push(ieNovaCamada(d, { nome: 'ABCDEF'[i], c, x: 40 + i * 130, y: 50 + i * 70, sujoPx: true })); });
  d.ativa = d.camadas[0].id; d.selIds = [d.ativa]; ieTudo(d); return true; }"""
MEXER = r"""async () => {   // apaga B, cria G, leva E para o fundo, renomeia D, repinta C
  const d = IE.doc, ach = n => ieTodas(d).find(L => L.nome === n);
  const b = ieAchar(d, ach('B').id); b.lista.splice(b.i, 1);
  const c = ieCanvas(120, 90), x = ieCtx(c); x.fillStyle = '#ffe119'; x.fillRect(0, 0, 120, 90);
  d.camadas.push(ieNovaCamada(d, { nome: 'G', c, x: 700, y: 420, sujoPx: true }));
  const e = ieAchar(d, ach('E').id), E = e.lista.splice(e.i, 1)[0]; d.camadas.unshift(E);
  ach('D').nome = 'D2';
  const C = ach('C'), xc = ieCtx(C.c); xc.fillStyle = '#000075'; xc.fillRect(0, 0, C.c.width, C.c.height); C.sujoPx = true; ieInvalidar(C);
  ieTudo(d); return true; }"""
MEXER2 = r"""async () => { const d = IE.doc; d.camadas.reverse(); ieTudo(d); return true; }"""
SALVAR = r"""async p => { await ieSalvar(false, p); return true; }"""
ESPERADO = r"""() => ieTodas(IE.doc).filter(L => L.c).map(L => { const x = ieCtx(L.c).getImageData(Math.floor(L.c.width / 2), Math.floor(L.c.height / 2), 1, 1).data;
  return [L.nome, L.x, L.y, L.c.width, L.c.height, [x[0], x[1], x[2]]]; })"""


def conferir(esperado, rodada):
    psd = PSDImage.open(PSD); erros = []
    camadas = {L.name: L for L in psd.descendants() if not L.is_group()}
    if len(camadas) != len(esperado): erros.append(f"{len(camadas)} camadas no PSD, esperadas {len(esperado)}")
    for nome, x, y, w, h, cor in esperado:
        L = camadas.get(nome)
        if L is None: erros.append(f"{nome}: sumiu"); continue
        if (L.left, L.top, L.width, L.height) != (x, y, w, h): erros.append(f"{nome}: caixa {L.bbox} ≠ {(x, y, x + w, y + h)}")
        im = L.topil()
        if im is None: erros.append(f"{nome}: sem pixels"); continue
        p = im.convert("RGB").getpixel((w // 2, h // 2))
        if max(abs(p[k] - cor[k]) for k in range(3)) > 6: erros.append(f"{nome}: cor {p} ≠ {tuple(cor)} (pixels de outra camada)")
    print(f"rodada {rodada}: {'ok' if not erros else 'FALHOU'}" + ("" if not erros else " — " + "; ".join(erros[:4])))
    return not erros


with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}"); pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    pg.evaluate(PREP); pg.evaluate(SALVAR, PSD); ok = conferir(pg.evaluate(ESPERADO), 1)
    pg.evaluate(MEXER); pg.evaluate(SALVAR, PSD); ok &= conferir(pg.evaluate(ESPERADO), 2)
    pg.evaluate(MEXER2); pg.evaluate(SALVAR, PSD); ok &= conferir(pg.evaluate(ESPERADO), 3)
    pg.evaluate("() => { KNV.automacao(false); return KNV.fecharTudo(); }")
sys.exit(0 if ok else 1)
