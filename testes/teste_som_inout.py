"""In/Out no Sound: teclas reais, WAV recortado, stems, fila, persistência e desfazer; somente porta 9333."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

import numpy as np
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from Functions.midia import ffmpeg
from Functions.sound_kanivete import _ffprobe_dur

PASTA = Path('D:/kanivete_testes/sound_inout')


class SoundInOutTest(unittest.TestCase):
    def test_intervalo_de_exportacao(self):
        PASTA.mkdir(parents=True, exist_ok=True)
        fonte = (PASTA / 'tres_tons.wav').as_posix()
        subprocess.run([ffmpeg(), '-v', 'error', '-y', '-f', 'lavfi', '-i',
                        r'aevalsrc=0.15*sin(2*PI*if(lt(t\,2)\,440\,if(lt(t\,4)\,880\,1320))*t):s=48000:d=6', fonte], check=True)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp('http://127.0.0.1:9333')
            pg = next(x for x in b.contexts[0].pages if 'index.html' in x.url)
            pg.set_default_timeout(20000)
            backup = pg.evaluate('({proj:SK.proj,caminho:SK.caminho,ph:SK.ph,sel:SK.sel,sujo:SK.sujo,hist:SK.hist,futuro:SK.futuro})')
            (PASTA / 'antes_do_teste.json').write_text(json.dumps(backup, ensure_ascii=False), encoding='utf-8')
            try:
                pg.evaluate('''() => {
                    // Instala só as entradas novas após aplicar funções sem recarregar o projeto.
                    if (!SKN.inOut) document.addEventListener('keydown', skInOutTecla);
                    SKN.exportar = (c, op={}) => skExportarArquivo(c, op);
                    SKN.inOut = () => skInOutEstado();
                    SKN.marcarEntrada = t => skInOutMarcar('entrada',t);
                    SKN.marcarSaida = t => skInOutMarcar('saida',t);
                    SKN.limparInOut = () => skInOutLimpar();
                    switchTool('sound-kanivete'); SKN.novo('vazio','Teste In/Out');
                }''')
                pg.evaluate('arq => SKN.importar(arq)', fonte)
                pg.evaluate("SK.int={a:0.25,b:0.5,faixas:[SK.proj.faixas[0].id]}; SKN.ir(2); document.activeElement?.blur()")
                pg.keyboard.press('i')
                pg.evaluate('SKN.ir(4)')
                pg.keyboard.press('o')
                r = pg.evaluate('SKN.inOut()')
                self.assertEqual((r['a'],r['b'],r['dur']),(2,4,2))
                self.assertEqual(pg.evaluate('[SK.int.a,SK.int.b]'),[0.25,0.5])
                pg.evaluate("skDockMostrar('exportar')")
                self.assertEqual(pg.locator('#ske-area').input_value(),'marcado')
                arq = (PASTA/'recorte.wav').as_posix()
                pg.evaluate('arq => SKN.exportar(arq,{formato:"wav"})',arq)
                self.assertAlmostEqual(_ffprobe_dur(arq)[0],2,delta=.01)
                pcm = subprocess.run([ffmpeg(),'-v','error','-i',arq,'-ac','1','-f','f32le','-'],capture_output=True,check=True).stdout
                a = np.frombuffer(pcm,dtype='<f4')[12000:72000]
                freq = np.argmax(np.abs(np.fft.rfft(a*np.hanning(len(a)))))*48000/len(a)
                self.assertAlmostEqual(freq,880,delta=2)
                pg.locator('#ske-area').select_option('inteiro')
                arq = (PASTA/'inteiro.wav').as_posix()
                pg.evaluate('arq => SKN.exportar(arq,{formato:"wav"})',arq)
                self.assertAlmostEqual(_ffprobe_dur(arq)[0],6,delta=.01)
                pg.locator('#ske-area').select_option('marcado')
                stems = pg.evaluate('arq => SKN.exportarStems(arq)',(PASTA/'stem.wav').as_posix())
                self.assertTrue(stems['success'])
                self.assertAlmostEqual(_ffprobe_dur(stems['arquivos'][0])[0],2,delta=.01)
                fila = pg.evaluate('''() => {
                    const anterior=window.keSomEnviar; let item;
                    window.keSomEnviar=x=>(item=x,'teste');
                    try { skParaKe('D:/kanivete_testes/sound_inout/fila.wav',{f:'wav',k:'192',l:'',fx:'',stems:true,caps:false}); }
                    finally { window.keSomEnviar=anterior; }
                    return item;
                }''')
                self.assertEqual(fila['dur'],2)
                self.assertEqual([fila['chamadas'][0]['op'][k] for k in ('ini','fim')],[2,4])
                projeto=(PASTA/'intervalo.sknv').as_posix()
                pg.evaluate('arq=>SKN.salvar(arq)',projeto)
                pg.evaluate('SKN.limparInOut()')
                self.assertFalse(pg.evaluate('SKN.inOut().marcado'))
                pg.evaluate('SKN.desfazer()')
                self.assertEqual(pg.evaluate('[SKN.inOut().a,SKN.inOut().b]'),[2,4])
                pg.evaluate('SKN.refazer()')
                self.assertFalse(pg.evaluate('SKN.inOut().marcado'))
                pg.evaluate('arq=>SKN.abrir(arq)',projeto)
                self.assertEqual(pg.evaluate('[SKN.inOut().a,SKN.inOut().b]'),[2,4])
                pg.evaluate("SKN.ir(3); document.activeElement?.blur()")
                pg.keyboard.press('Shift+i')
                self.assertIsNone(pg.evaluate('SKN.inOut().entrada'))
                self.assertEqual(pg.evaluate('SKN.inOut().a'),0)
                pg.locator('#ske-modelo').focus()
                pg.keyboard.press('o')
                self.assertEqual(pg.evaluate('SKN.inOut().saida'),4)
                pg.evaluate('SKN.marcarEntrada(5)')
                self.assertIsNone(pg.evaluate('SKN.inOut().saida'))
                pg.evaluate('SKN.marcarEntrada(2);SKN.marcarSaida(4);skEnquadrar()')
                pg.locator('#sk-tl').screenshot(path=str(PASTA/'regua.png'))
                pg.locator('#sk-inout').screenshot(path=str(PASTA/'painel.png'))
            finally:
                pg.evaluate('''async ant => {
                    skParar(); SK.proj=ant.proj; SK.caminho=ant.caminho; SK.ph=ant.ph; SK.sel=ant.sel;
                    SK.sujo=ant.sujo; SK.hist=ant.hist; SK.futuro=ant.futuro;
                    if(SK.proj) for(const f of SK.proj.faixas) for(const c of f.clipes) await skCarregarPicos(c.arq);
                    skUi();skEnquadrar();
                }''',backup)


if __name__=='__main__':
    unittest.main(verbosity=2)
