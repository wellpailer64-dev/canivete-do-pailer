"""Tom, velocidade e bitcrusher reais; --interface inclui o app isolado na porta 9333."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from Functions import sound_kanivete as som
from Functions.midia import ffmpeg

INTERFACE = "--interface" in sys.argv
if INTERFACE:
    sys.argv.remove("--interface")
PASTA = Path("D:/kanivete_testes/sound_voz")


def preparar():
    PASTA.mkdir(parents=True, exist_ok=True)
    arq = str(PASTA / "seno.wav")
    subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=48000",
                    "-ac", "2", "-c:a", "pcm_s24le", arq], check=True)
    return arq


def amostras(arq):
    r = subprocess.run([ffmpeg(), "-v", "error", "-i", arq, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype="<f4")


def frequencia(a):
    a = a[round(len(a) * 0.2):round(len(a) * 0.8)]
    return np.argmax(np.abs(np.fft.rfft(a * np.hanning(len(a))))) * 48000 / len(a)


class VozProcessamentoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.arq = preparar()
        cls.hash = hashlib.sha256(Path(cls.arq).read_bytes()).hexdigest()

    def efeito(self, **op):
        r = som.transformar_voz(self.arq, op)
        self.assertNotEqual(Path(r["saida"]), Path(self.arq))
        self.assertEqual(hashlib.sha256(Path(self.arq).read_bytes()).hexdigest(), self.hash)
        return r, amostras(r["saida"])

    def test_tom_independente_do_tempo(self):
        r, a = self.efeito(tom=12)
        self.assertAlmostEqual(r["dur"], 2, delta=0.04)
        self.assertAlmostEqual(frequencia(a), 880, delta=5)

    def test_velocidade_com_e_sem_preservar_tom(self):
        for preservar, esperado in ((True, 440), (False, 880)):
            r, a = self.efeito(velocidade=2, preservar=preservar)
            self.assertAlmostEqual(r["dur"], 1, delta=0.04)
            self.assertAlmostEqual(frequencia(a), esperado, delta=5)

    def test_bitcrusher_e_mistura_seca(self):
        _, seco = self.efeito()
        _, mistura_zero = self.efeito(bitcrusher=True, mistura=0)
        np.testing.assert_array_equal(seco, mistura_zero)
        _, molhado = self.efeito(bitcrusher=True, bits=4, amostragem=2000, mistura=100)
        self.assertLess(np.mean(np.abs(np.diff(molhado)) > 1e-7), 0.15)
        self.assertGreater(float(np.mean(np.abs(molhado - seco[:len(molhado)]))), 0.005)

    def test_trecho_e_previa_curta(self):
        r, _ = self.efeito(de=0.5, dur=0.6)
        self.assertAlmostEqual(r["dur"], 0.6, delta=0.01)
        r, _ = self.efeito(velocidade=0.25, previa=True)
        self.assertLessEqual(r["dur"], 6.04)

    def test_recusa_valores_invalidos(self):
        for op in ({"tom": float("nan")}, {"velocidade": 0}, {"bits": 99}, {"mistura": 101}, {"preservar": "sim"}, {"de": -1}):
            with self.subTest(op=op), self.assertRaises(ValueError):
                som.transformar_voz(self.arq, op)


@unittest.skipUnless(INTERFACE, "use --interface com o app na porta 9333")
class VozInterfaceTest(unittest.TestCase):
    def test_previa_aplicar_desfazer_exportar_e_recortes(self):
        from playwright.sync_api import sync_playwright
        arq = preparar().replace("\\", "/")
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            pg = next(x for x in b.contexts[0].pages if "index.html" in x.url)
            pg.set_default_timeout(20000)
            pg.evaluate("switchTool('sound-kanivete')")
            ids = pg.evaluate("""async arq => {
                SKN.novo('vazio', 'Teste de efeitos da voz');
                const a = await SKN.importar(arq), b = await SKN.importar(arq, {ini:3});
                SK.sel = a[0]; SKN.alterarClipe(a[0], {fade_in:0.2, fade_out:0.4, curva:[[0,0.5],[2,1]]});
                SK.ouvir = new Audio(); SK.ouvir.volume = 0;
                skUiProps(); return [a[0], b[0]];
            }""", arq)
            pg.locator('#sk-voz-bolinha').click()
            self.assertEqual(pg.locator('[data-voz="tom"]').input_value(), "3")
            self.assertTrue(pg.locator('[data-voz="bitcrusher"]').is_checked())
            antes = pg.evaluate("[skSnap(), SK.hist.length]")
            pg.evaluate("id => SKN.previaVoz(id)", ids[0])
            self.assertEqual(pg.evaluate("[skSnap(), SK.hist.length]"), antes)
            pg.evaluate("skVozPararPrevia()")
            self.assertTrue(pg.evaluate("SK.ouvir.paused"))
            pg.evaluate("id => SKN.transformarVoz(id, {tom:12, velocidade:2})", ids[0])
            c = pg.evaluate("id => JSON.parse(JSON.stringify(skClipe(id)[0]))", ids[0])
            self.assertAlmostEqual(c["dur"], 1, delta=0.04)
            self.assertAlmostEqual(c["fade_in"], 0.1)
            self.assertAlmostEqual(c["curva"][1][0], 1)
            self.assertEqual(pg.evaluate("id => skClipe(id)[0].arq", ids[1]), arq)
            pg.evaluate("SKN.desfazer()")
            self.assertEqual(pg.evaluate("id => skClipe(id)[0].arq", ids[0]), arq)
            pg.evaluate("SKN.refazer()")
            self.assertEqual(pg.evaluate("id => skClipe(id)[0].arq", ids[0]), c["arq"])
            projeto = str(PASTA / "voz.sknv").replace("\\", "/")
            pg.evaluate("path => SKN.salvar(path)", projeto)
            pg.evaluate("path => SKN.abrir(path)", projeto)
            self.assertTrue(pg.evaluate("id => !!skClipe(id)[0].voz_base", ids[0]))
            exportado = str(PASTA / "exportado.wav").replace("\\", "/")
            pg.evaluate("async ({id,path}) => { SKN.alterarClipe(id,{ini:10}); await SKN.exportar(path,{formato:'wav',ini:0,fim:1}); }", {"id":ids[1],"path":exportado})
            self.assertAlmostEqual(frequencia(amostras(exportado)), 880, delta=5)
            pg.evaluate("id => { SKN.alterarClipe(id,{de:0.1,dur:0.5}); SKN.restaurarVoz(id); }", ids[0])
            restaurado = pg.evaluate("id => skClipe(id)[0]", ids[0])
            self.assertEqual(restaurado["arq"], arq)
            self.assertAlmostEqual(restaurado["de"], 0.2)
            self.assertAlmostEqual(restaurado["dur"], 1)
            self.assertNotIn("voz_base", restaurado)
            pg.evaluate("id => { SK.sel=id; skUiProps(); }", ids[0])
            pg.locator('#sk-voz-efeitos').screenshot(path=str(PASTA / "painel_voz.png"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
