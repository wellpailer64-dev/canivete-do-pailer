"""Perda real de contexto WebGL e recuperação do player, sem acessar o app aberto."""
import os
from pathlib import Path
import re
import unittest

RAIZ = Path(__file__).resolve().parents[1]
PASTA = Path('D:/Kanivete/Testes/recuperacao_gpu')
PASTA.mkdir(parents=True, exist_ok=True)
for nome in ('TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA'):
    pasta = PASTA / nome.lower()
    pasta.mkdir(exist_ok=True)
    os.environ[nome] = str(pasta)
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', 'D:/Kanivete/Testes/playwright')
from playwright.sync_api import sync_playwright


def funcao(arquivo, nome):
    texto = (RAIZ / 'frontend/js' / arquivo).read_text(encoding='utf-8')
    trecho = re.search(r'(?ms)^function ' + nome + r'\([^\n]*\) \{.*?^\}', texto)
    if not trecho:
        raise AssertionError('Função não encontrada: ' + nome)
    return trecho.group()


class RecuperacaoGpuTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.addClassCleanup(cls.pw.stop)
        cls.browser = cls.pw.chromium.launch(headless=True)
        cls.addClassCleanup(cls.browser.close)

    def setUp(self):
        self.pagina = self.browser.new_page()
        self.addCleanup(self.pagina.close)
        self.pagina.set_content('<div></div>')
        self.pagina.add_script_tag(content='''
            const VE = { ready: true, clips: [], cur: -1, playhead: 0, playing: false };
            const VE_CACHE_MAX_BYTES = 1.5 * 1024 ** 3;
            let limpezas = 0, desenhos = 0, preferencia = 4;
            const veCacheSoltarPlaca = () => limpezas++;
            const veDrawMonitorSoon = () => desenhos++;
            const cache = { maxBytes: 0 };
            const veCache = () => cache;
            const vePrPrefs = () => ({ ramGB: preferencia });
            const veCacheEvict = () => {};
            const veCacheUpdateUi = () => {};
            const veVideo = () => window.playerAtivo;
            const veSrcAt = (clipe, tempo) => clipe.s + tempo - clipe.st;
            const veMediaOf = clipe => VE.media[clipe.m];
            Object.assign(VE, {media: [{kind: 'forma'}, {kind: 'cor', fill: '#194673'}, {kind: 'pincel'}], seqW: 64, seqH: 32});
        ''')
        for nome in ('veGpuObservar', 'veDeckRecuperar', 'veCacheStore'):
            self.pagina.add_script_tag(content=funcao('editor.js', nome))
        self.pagina.add_script_tag(content=funcao('editor-render.js', 'vePrAplicarRam'))
        for arquivo in ('editor-fx.js', 'editor-lc.js', 'editor-ovt.js'):
            self.pagina.add_script_tag(path=str(RAIZ / 'frontend/js' / arquivo))
        self.pagina.add_script_tag(path=str(RAIZ / 'frontend/js/editor-grafico.js'))

    def test_faixas_voltam_apos_perder_pixels_sem_alterar_timeline(self):
        resultado = self.pagina.evaluate('''() => {
            VE.clips = [0, 24].map(y => ({m: 0, st: 0, s: -7.7, e: 192.6,
                fm: {t: 'ret', w: 64, h: 8, cor: '#000000'}, p: {x: 32, y}}));
            const antes = JSON.stringify(VE.clips), antigos = VE.clips.map(veGrafDesenho);
            antigos.forEach(cv => {
                cv.width = cv.width;
                cv.dispatchEvent(new Event('contextlost'));
            });
            const durante = VE.clips.map(veGrafDesenho);
            antigos.forEach(cv => cv.dispatchEvent(new Event('contextrestored')));
            const novos = VE.clips.map(veGrafDesenho);
            return {alfas: novos.map(cv => cv.getContext('2d').getImageData(32, 4, 1, 1).data[3]),
                recriou: novos.every((cv, indice) => cv !== antigos[indice] && cv !== durante[indice]),
                preservou: antes === JSON.stringify(VE.clips), limpezas, desenhos};
        }''')
        self.assertEqual(resultado['alfas'], [255, 255])
        self.assertTrue(resultado['recriou'])
        self.assertTrue(resultado['preservou'])
        self.assertGreaterEqual(resultado['limpezas'], 4)
        self.assertGreaterEqual(resultado['desenhos'], 4)

    def test_cor_solida_recupera_preview_e_png_de_exportacao(self):
        resultado = self.pagina.evaluate('''async () => {
            const clipe = {m: 1}, antigo = veGrafDesenho(clipe);
            const antes = antigo.toDataURL();
            antigo.width = antigo.width;
            antigo.dispatchEvent(new Event('contextrestored'));
            const cv = veGrafDesenho(clipe), imagem = new Image();
            imagem.src = cv.toDataURL(); await imagem.decode();
            const saida = document.createElement('canvas'); saida.width = 64; saida.height = 32;
            const ctx = saida.getContext('2d'); ctx.drawImage(imagem, 0, 0);
            return {igual: antes === cv.toDataURL(), pixel: [...ctx.getImageData(32, 16, 1, 1).data]};
        }''')
        self.assertEqual(resultado, dict(igual=True, pixel=[25, 70, 115, 255]))

    def test_pincel_reconstroi_base_e_ultimo_traco_apos_restauracao(self):
        resultado = self.pagina.evaluate('''() => {
            const clipe = {m: 2, br: {w: 64, h: 32, tracos: [
                {cor: '#ff0000', tam: 4, dur: 100, op: 100, pts: [4, 8, 60, 8]},
                {cor: '#00ff00', tam: 4, dur: 100, op: 100, pts: [4, 24, 60, 24]}]}};
            const antes = veGrafDesenho(clipe).toDataURL(), cache = VEGR.cache.get(clipe);
            cache.base.width = cache.base.width; cache.cv.width = cache.cv.width;
            cache.base.dispatchEvent(new Event('contextlost'));
            cache.cv.dispatchEvent(new Event('contextrestored'));
            return antes === veGrafDesenho(clipe).toDataURL();
        }''')
        self.assertTrue(resultado)

    def test_textura_do_giz_e_aparar_caminho_sao_reconstruidos(self):
        resultado = self.pagina.evaluate('''() => {
            const clipe = {m: 2, br: {w: 64, h: 32, tracos: [
                {cor: '#ffffff', tam: 8, dur: 100, op: 100, ponta: 'giz', pts: [4, 16, 60, 16]}]}};
            const aparado = {...clipe, fm: {apIni: 0, apFim: 65}}, clipes = [clipe, aparado];
            const antes = clipes.map(c => veGrafDesenho(c).toDataURL()), grao = veGrGrao();
            grao.width = grao.width; grao.dispatchEvent(new Event('contextrestored'));
            return {igual: clipes.every((c, indice) => antes[indice] === veGrafDesenho(c).toDataURL()),
                texturaNova: veGrGrao() !== grao};
        }''')
        self.assertEqual(resultado, dict(igual=True, texturaNova=True))

    def test_preferencia_antiga_respeita_teto_e_valor_menor(self):
        resultado = self.pagina.evaluate('''() => {
            vePrAplicarRam(); const maior = cache.maxBytes;
            preferencia = .25; vePrAplicarRam();
            return [maior / 1024 ** 3, cache.maxBytes / 1024 ** 3];
        }''')
        self.assertEqual(resultado, [1.5, .25])

    def test_quatro_nucleos_recriam_recursos_apos_perda_real(self):
        for fabrica in ('veLcGL().gl', 'veB3dGl()', 'veKeyGl()', 'veOvtGl()'):
            with self.subTest(nucleo=fabrica):
                self.pagina.evaluate('''fabrica => {
                    window.graficoAntigo = eval(fabrica);
                    window.perda = graficoAntigo.getExtension('WEBGL_lose_context');
                    if (!perda) throw new Error('WEBGL_lose_context indisponível');
                    perda.loseContext();
                }''', fabrica)
                self.pagina.wait_for_function('VE._gpuPerdidos?.size === 1')
                self.assertTrue(self.pagina.evaluate('graficoAntigo.isContextLost()'))
                self.pagina.evaluate('perda.restoreContext()')
                self.pagina.wait_for_function('VE._gpuPerdidos.size === 0')
                resultado = self.pagina.evaluate('''fabrica => {
                    const novo = eval(fabrica);
                    return !!novo && novo !== graficoAntigo && !novo.isContextLost();
                }''', fabrica)
                self.assertTrue(resultado)
        self.assertGreaterEqual(self.pagina.evaluate('limpezas'), 8)

    def test_cor_da_imagem_volta_igual_depois_da_recuperacao(self):
        self.pagina.evaluate('''() => {
            window.fonte = document.createElement('canvas'); fonte.width = fonte.height = 16;
            const ctx = fonte.getContext('2d'); ctx.fillStyle = '#a54020'; ctx.fillRect(0, 0, 16, 16);
            window.ajuste = { ...veLcDefaults(), exp: .5, sat: 80 };
            window.pixel = () => {
                const saida = veLcDraw({cv: fonte, ctx}, ajuste, {w: 16, h: 16});
                return [...saida.ctx.getImageData(8, 8, 1, 1).data];
            };
            window.antes = pixel();
            window.perda = VELC.gl.gl.getExtension('WEBGL_lose_context');
            perda.loseContext();
        }''')
        self.pagina.wait_for_function('VE._gpuPerdidos?.size === 1')
        self.pagina.evaluate('perda.restoreContext()')
        self.pagina.wait_for_function('VE._gpuPerdidos.size === 0')
        resultado = self.pagina.evaluate('({antes, depois: pixel()})')
        self.assertEqual(resultado['antes'], resultado['depois'])
        self.assertGreater(sum(resultado['depois'][:3]), 0)

    def test_nao_guarda_quadro_durante_perda_da_placa(self):
        self.pagina.evaluate('VE._gpuPerdidos = new Set([{}])')
        self.pagina.evaluate('veCacheStore(null, 10, 10, 1, [], null, false)')

    def test_player_recupera_posicao_sem_repetir_em_ciclo(self):
        resultado = self.pagina.evaluate('''() => {
            const player = new EventTarget();
            Object.assign(player, { error: {code: 3}, fonte: 'video-a', currentTime: 12,
                cargas: 0, getAttribute() { return this.fonte; }, load() { this.cargas++; } });
            window.playerAtivo = player;
            VE.clips = [{st: 0, s: 2}]; VE.cur = 0; VE.playhead = 10;
            const primeira = veDeckRecuperar(player), segunda = veDeckRecuperar(player);
            VE.playhead = 11; player.dispatchEvent(new Event('loadedmetadata'));
            return {primeira, segunda, cargas: player.cargas, tempo: player.currentTime, playing: VE.playing};
        }''')
        self.assertEqual(resultado, dict(primeira=True, segunda=False, cargas=1, tempo=13, playing=False))

    def test_recuperacao_nao_altera_outra_fonte_nem_repete_erro_de_formato(self):
        resultado = self.pagina.evaluate('''() => {
            const player = new EventTarget();
            Object.assign(player, { error: {code: 3}, fonte: 'video-a', currentTime: 12,
                cargas: 0, getAttribute() { return this.fonte; }, load() { this.cargas++; } });
            veDeckRecuperar(player); player.fonte = 'video-b'; player.currentTime = 3;
            player.dispatchEvent(new Event('loadedmetadata'));
            player.error.code = 4; const formato = veDeckRecuperar(player);
            return [player.currentTime, player.cargas, formato];
        }''')
        self.assertEqual(resultado, [3, 1, False])


if __name__ == '__main__':
    unittest.main(verbosity=2)
