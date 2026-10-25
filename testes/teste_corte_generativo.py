"""Corte C e expansão: testa em navegador isolado, com IA sintética."""
import ast
import json
import os
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

for chave, pasta in [('APPDATA', 'appdata'), ('LOCALAPPDATA', 'localappdata'), ('TEMP', 'tmp'), ('TMP', 'tmp')]:
    os.environ[chave] = str(Path('D:/kanivete_testes') / pasta)

ENSAIO = r"""async () => {
    const exigir = (ok, nome) => { if (!ok) throw Error(nome); };
    const api = ieApi();
    let chamadas = 0, falhar = false, pendente = null;
    ieGeradorPronto = async () => true;
    api.ie_gerar = async () => {
        chamadas++;
        if (pendente) await pendente;
        return {success: !falhar, path: 'sintetico', semente: 123, error: 'cancelado'};
    };
    ieCanvasDeArquivo = async () => { const c = ieCanvas(200, 200); ieCtx(c).fillStyle = '#ab7856'; ieCtx(c).fillRect(0, 0, 200, 200); return c; };
    const novo = () => { KNV.novo('Corte teste', 160, 120, 'branco'); IE.ferr = 'corte'; IE_CORTE.ativar(IE.doc); return IE.doc; };
    let d = novo();
    ieOpcoesRender();
    const seletor = document.querySelector('[data-o="corte"][data-k="preenchimento"]');
    exigir(seletor && seletor.options.length === 2, 'seletor ausente');
    seletor.value = 'generativo'; seletor.dispatchEvent(new Event('change', {bubbles:true}));
    exigir(IE.op.corte.preenchimento === 'generativo', 'seletor sem efeito');
    for (const caixa of [{x:-40,y:-30,w:240,h:180}, {x:20,y:-30,w:180,h:120}, {x:-20,y:0,w:160,h:120}]) {
        d = novo(); IE.op.corte.preenchimento = 'generativo';
        const n = d.hist.i;
        exigir(await ieCorteAplicar(d, caixa), 'corte generativo falhou');
        exigir(d.w === caixa.w && d.h === caixa.h && d.hist.i === n + 1, 'dimensões/histórico');
        const L = ieAtiva(d);
        exigir(L.generativo && L.generativo.alfa, 'sem camada de geração');
        const a = ieCtx(L.c).getImageData(0, 0, d.w, d.h).data;
        exigir(a.some((v, i) => i % 4 === 3 && v === 255), 'expansão vazia');
        ieDesfazer(); exigir(d.w === 160 && d.h === 120, 'undo dimensões');
        ieRefazer(); exigir(d.w === caixa.w && d.h === caixa.h, 'redo dimensões');
    }
    d = novo(); IE.op.corte.preenchimento = 'transparente';
    let n = chamadas;
    await ieCorteAplicar(d, {x:-40,y:-30,w:240,h:180});
    ieCompor(d, ieRDoc(d));
    exigir(chamadas === n && ieCtx(d.comp).getImageData(0,0,1,1).data[3] === 0, 'transparente chamou IA ou preencheu canto');
    d = novo(); IE.op.corte.preenchimento = 'generativo';
    n = chamadas;
    await ieCorteAplicar(d, {x:10,y:10,w:100,h:80});
    exigir(chamadas === n && d.w === 100, 'corte interno chamou IA');
    d = novo(); const h = d.hist.i, original = d.camadas[0]; falhar = true;
    exigir(!await ieCorteAplicar(d, {x:-40,y:0,w:200,h:120}), 'falha aceita');
    exigir(d.w === 160 && d.hist.i === h && d.camadas[0] === original && !IE._corteGerando, 'falha alterou documento');
    falhar = false;
    exigir(!await ieCorteAplicar(d, {x:200,y:0,w:200,h:120}), 'sem interseção aceito');
    let liberar; pendente = new Promise(r => liberar = r);
    const tarefa = ieCorteAplicar(d, {x:-40,y:0,w:200,h:120});
    await new Promise(r => setTimeout(r, 20)); n = chamadas;
    exigir(!await ieCorteAplicar(d, {x:-20,y:0,w:180,h:120}) && chamadas === n, 'geração duplicada');
    ieHist('Mudança durante geração', d); liberar();
    exigir(!await tarefa && d.w === 160, 'geração sobrescreveu edição');
    return 'PASSOU: seletor, expansão livre/mista, transparência, undo/redo, cancelamento, concorrência.';
}"""

with urlopen('http://127.0.0.1:9333/json/list', timeout=5) as resposta:
    url = next(item['url'] for item in json.load(resposta) if item.get('type') == 'page' and 'index.html' in item['url'])
with sync_playwright() as p:
    navegador = p.chromium.launch(channel='msedge', headless=True)
    pagina = navegador.new_page()
    pagina.route('https://**', lambda rota: rota.abort())
    pagina.goto(url, wait_until='domcontentloaded')
    pagina.wait_for_function("typeof ieCorteAplicar === 'function' && typeof KNV !== 'undefined'")
    pagina.evaluate("() => { window.pywebview = {api: new Proxy({}, {get: (o,k) => o[k] || (o[k] = async () => ({success:false}))})}; }")
    print(pagina.evaluate(ENSAIO))
    # Reaproveita a regressão da máscara sem executar seu conector ao app aberto.
    arvore = ast.parse(Path('testes/teste_generativo_mascara.py').read_text(encoding='utf-8-sig'))
    regressao = next(ast.literal_eval(no.value) for no in arvore.body if isinstance(no, ast.Assign) and any(isinstance(a, ast.Name) and a.id == 'ENSAIO' for a in no.targets))
    pagina.evaluate(regressao)
    print('PASSOU: regressão das máscaras e variações generativas.')
    navegador.close()
