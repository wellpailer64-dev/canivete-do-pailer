"""Misturar se: campos numéricos, arraste, canais, prévia e histórico; fonte do app 9333 em Edge sem janela."""
import json
import os
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

SAIDA = Path('D:/kanivete_testes/misturar_se')
SAIDA.mkdir(parents=True, exist_ok=True)
for nome, pasta in [('TEMP', 'tmp'), ('TMP', 'tmp'), ('APPDATA', 'appdata'), ('LOCALAPPDATA', 'localappdata')]:
    destino = Path('D:/kanivete_testes') / pasta
    destino.mkdir(parents=True, exist_ok=True)
    os.environ[nome] = str(destino)
with urlopen('http://127.0.0.1:9333/json/list', timeout=5) as resposta:
    url = next(p['url'] for p in json.load(resposta) if p.get('type') == 'page' and 'index.html' in p.get('url', ''))

with sync_playwright() as p:
    navegador = p.chromium.launch(channel='msedge', headless=True)
    contexto = navegador.new_context(viewport={'width': 1280, 'height': 960})
    contexto.route('https://**', lambda rota: rota.abort())
    pagina = contexto.new_page()
    pagina.goto(url, wait_until='domcontentloaded')
    pagina.wait_for_function("typeof KNV !== 'undefined' && typeof ieEstiloCamada === 'function'")
    pagina.evaluate("""async () => {
        window.pywebview = {api: {}};
        I18N.lang = 'pt';
        KNV.novo('Teste Misturar se', 256, 128, 'branco');
        const d = IE.doc, fundo = ieAtiva(d), x = ieCtx(fundo.c);
        x.fillStyle = '#000'; x.fillRect(0, 0, 256, 128); ieCamadaMudou(fundo);
        const c = ieCanvas(256, 128), cx = ieCtx(c);
        for (let v = 0; v < 256; v++) { cx.fillStyle = `rgb(${v},${v},${v})`; cx.fillRect(v, 0, 1, 128); }
        const L = ieNovaCamada(d, {nome: 'Rampa', c});
        ieInserirAcima(d, L, fundo); ieAtivar(L.id, d); ieCamadaMudou(L); ieHist('Rampa');
        await ieEstiloCamada(L);
    }""")

    def campo(faixa, indice):
        return pagina.locator(f'[data-ms-valor="{faixa}"][data-ms-indice="{indice}"]')

    def definir(faixa, valores):
        for i, valor in enumerate(valores):
            campo(faixa, i).fill(str(valor))

    def valores(faixa):
        return pagina.locator(f'[data-ms-valor="{faixa}"]').evaluate_all('(campos) => campos.map(c => +c.value)')

    assert pagina.locator('[data-ms-valor]').count() == 8
    definir('atual', [20, 80, 180, 230])
    assert valores('atual') == [20, 80, 180, 230]
    assert valores('baixo') == [0, 0, 255, 255]
    pagina.wait_for_function('ieAtiva(IE.doc).mescSe?.cinza?.atual[1] === 80')
    amostras = pagina.evaluate("""() => {
        ieLsAplicar(true); ieCompor(IE.doc, ieRDoc(IE.doc));
        const d = ieCtx(IE.doc.comp).getImageData(0, 0, 256, 128).data;
        return [0, 50, 128, 250].map(v => d[(64 * 256 + v) * 4]);
    }""")
    assert all(abs(a - b) <= 1 for a, b in zip(amostras, [0, 25, 128, 0])), amostras

    # Cursor dividido já existente acompanha a edição numérica, e vice-versa.
    canvas = pagina.locator('canvas[data-ms="atual"]')
    caixa = canvas.bounding_box()
    def pos(valor):
        return caixa['x'] + (8 + valor / 255 * 344) / 360 * caixa['width']
    pagina.mouse.move(pos(80), caixa['y'] + 24)
    pagina.mouse.down()
    pagina.mouse.move(pos(96), caixa['y'] + 24, steps=4)
    pagina.mouse.up()
    assert abs(valores('atual')[1] - 96) <= 1
    campo('atual', 1).press('ArrowUp')
    assert abs(valores('atual')[1] - 97) <= 1
    assert pagina.locator('#ie-modal').is_visible()

    # Valores extremos, decimais e campo vazio não deixam a faixa inválida.
    campo('atual', 0).fill('999')
    assert valores('atual') == [255, 255, 255, 255]
    campo('atual', 3).fill('-12')
    assert valores('atual') == [0, 0, 0, 0]
    campo('atual', 2).fill('100.6')
    assert valores('atual') == [0, 0, 101, 101]
    campo('atual', 2).fill('')
    campo('atual', 2).press('Tab')
    assert valores('atual') == [0, 0, 101, 101]
    definir('atual', [20, 80, 180, 230])
    definir('baixo', [0, 0, 240, 255])
    assert valores('baixo') == [0, 0, 240, 255]

    # Canais guardam seus próprios limites; Alt continua separando as metades.
    pagina.locator('[data-mescse]').select_option('g')
    assert valores('atual') == [0, 0, 255, 255]
    caixa = pagina.locator('canvas[data-ms="atual"]').bounding_box()
    pagina.keyboard.down('Alt')
    pagina.mouse.move(pos(0), caixa['y'] + 24)
    pagina.mouse.down()
    pagina.mouse.move(pos(30), caixa['y'] + 24, steps=4)
    pagina.mouse.up()
    pagina.keyboard.up('Alt')
    assert valores('atual')[:2] == [0, 30], valores('atual')
    pagina.locator('[data-mescse]').select_option('r')
    definir('baixo', [10, 40, 210, 250])
    pagina.locator('[data-mescse]').select_option('b')
    assert valores('baixo') == [0, 0, 255, 255]
    pagina.locator('[data-mescse]').select_option('cinza')
    assert valores('atual') == [20, 80, 180, 230]
    assert valores('baixo') == [0, 0, 240, 255]
    pagina.locator('.ie-ls-meio').evaluate('(el) => { el.scrollTop = el.scrollHeight; }')
    pagina.locator('.ie-ls').screenshot(path=str(SAIDA / 'misturar_se.png'))

    # Visualizar desliga a alteração; Cancelar restaura; OK cria só um passo.
    pagina.locator('[data-ls="previa"]').uncheck()
    pagina.wait_for_function('ieMescSeNeutro(ieAtiva(IE.doc).mescSe)')
    pagina.locator('[data-ls="previa"]').check()
    pagina.wait_for_function('ieAtiva(IE.doc).mescSe?.cinza?.atual[1] === 80')
    pagina.keyboard.press('Escape')
    assert pagina.evaluate('ieMescSeNeutro(ieAtiva(IE.doc).mescSe)')
    pagina.evaluate('() => ieEstiloCamada()')
    definir('atual', [20, 80, 180, 230])
    historico = pagina.evaluate('IE.doc.hist.i')
    campo('atual', 3).press('Enter')
    assert pagina.evaluate('IE.doc.hist.i') == historico + 1
    assert pagina.evaluate('ieAtiva(IE.doc).mescSe.cinza.atual') == [20, 80, 180, 230]
    pagina.evaluate('ieDesfazer()')
    assert pagina.evaluate('ieMescSeNeutro(ieAtiva(IE.doc).mescSe)')
    pagina.evaluate('ieRefazer()')
    assert pagina.evaluate('ieAtiva(IE.doc).mescSe.cinza.atual') == [20, 80, 180, 230]
    pagina.evaluate('() => ieEstiloCamada()')
    assert valores('atual') == [20, 80, 180, 230]
    pagina.keyboard.press('Escape')
    pagina.evaluate("() => { I18N.lang = 'en'; return ieEstiloCamada(); }")
    assert campo('atual', 0).get_attribute('aria-label') == 'This Layer: Black: start'
    pagina.keyboard.press('Escape')
    print('PASSOU: números, pixels, arraste/Alt, teclado, limites, canais, prévia, cancelar, confirmar, histórico e tradução.')
    navegador.close()
