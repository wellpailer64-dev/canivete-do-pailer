"""Ctrl+Shift+M do Sound: fila real, In/Out congelado, aba em segundo plano e render de áudio; só porta 9333."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from Functions.midia import ffmpeg
from Functions.sound_kanivete import _ffprobe_dur

PASTA = Path('D:/kanivete_testes/sound_atalho_ke')


class SoundAtalhoKeTest(unittest.TestCase):
    def test_atalho_envia_trecho_sem_sair_do_sound(self):
        PASTA.mkdir(parents=True, exist_ok=True)
        fonte = (PASTA/'fonte.wav').as_posix()
        subprocess.run([ffmpeg(),'-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=5',fonte],check=True)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp('http://127.0.0.1:9333')
            pg = next(x for x in b.contexts[0].pages if 'index.html' in x.url)
            pg.set_default_timeout(20000)
            self.assertFalse(pg.evaluate('VEFILA.rodando || !!VEFILA.atual'),'o teste precisa da fila isolada parada')
            backup = pg.evaluate('''({proj:SK.proj,caminho:SK.caminho,sujo:SK.sujo,sel:SK.sel,ph:SK.ph,hist:SK.hist,futuro:SK.futuro,
                fila:VEFILA.itens,seq:VEFILA.seq,tabs:[...appTabs],ready:VE.ready,drive:document.getElementById('ve-drive-link')?.value || ''})''')
            (PASTA/'antes_do_teste.json').write_text(json.dumps(backup,ensure_ascii=False),encoding='utf-8')
            try:
                pg.evaluate('''() => {
                    switchTool('sound-kanivete'); skKeAtalhoInstalar();
                    VEFILA.itens=[]; VEFILA.sel=null; VE.ready=false;
                    const drive=document.getElementById('ve-drive-link');if(drive)drive.value='';
                    SKN.novo('vazio','Atalho Sound');
                    appTabs.splice(0,appTabs.length,...appTabs.filter(t=>t!=='kanivete-encoder'));renderTabs();
                    window.dialogosKe=0;window.dialogoKeOriginal=skApi().sk_dialogo;
                    skApi().sk_dialogo=async()=>{dialogosKe++;throw new Error('atalho tentou abrir diálogo');};
                }''')
                pg.evaluate('arq => SKN.importar(arq)',fonte)
                pg.evaluate('path => {SK.caminho=path;skInOutMarcar("entrada",1);skInOutMarcar("saida",3);SK.expOp={f:"wav",k:"192",l:"",fx:"",stems:false,caps:false};document.activeElement?.blur();}',(PASTA/'projeto.sknv').as_posix())
                marcadores=pg.evaluate('SK.proj.marcadores.length')
                pg.keyboard.press('Control+Shift+m')
                pg.wait_for_function('VEFILA.itens.length===1')
                item=pg.evaluate('VEFILA.itens[0]')
                self.assertEqual(item['tipo'],'som')
                self.assertEqual(item['estado'],'espera')
                self.assertEqual(item['dur'],2)
                self.assertEqual([item['chamadas'][0]['op'][k] for k in ('ini','fim')],[1,3])
                self.assertEqual(pg.evaluate('SK.proj.marcadores.length'),marcadores)
                self.assertEqual(pg.evaluate('dialogosKe'),0)
                self.assertTrue(pg.evaluate("document.getElementById('page-sound-kanivete').classList.contains('active')"))
                self.assertEqual(pg.evaluate("appTabs.filter(t=>t==='kanivete-encoder').length"),1)
                self.assertTrue(pg.locator('#tabbar .tab').filter(has_text='Kanivete Encoder').count())
                self.assertFalse(pg.evaluate('VEFILA.rodando'))
                pg.evaluate('skInOutMarcar("entrada",2);skInOutMarcar("saida",4)')
                self.assertEqual(pg.evaluate('VEFILA.itens[0].chamadas[0].op.ini'),1)
                pg.keyboard.press('Control+Shift+m')
                self.assertEqual(pg.evaluate('VEFILA.itens.length'),2)
                segundo=pg.evaluate('VEFILA.itens[1]')
                self.assertNotEqual(item['chamadas'][0]['caminho'],segundo['chamadas'][0]['caminho'])
                self.assertEqual(pg.evaluate("appTabs.filter(t=>t==='kanivete-encoder').length"),1)
                # Render real do primeiro item: o projeto editado depois não altera o In/Out congelado.
                pg.evaluate('VEFILA.itens=VEFILA.itens.slice(0,1);veFilaIniciar()')
                pg.wait_for_function('VEFILA.itens[0].estado==="pronto" || VEFILA.itens[0].estado==="erro"')
                final=pg.evaluate('VEFILA.itens[0]')
                self.assertEqual(final['estado'],'pronto',final.get('erro'))
                self.assertAlmostEqual(_ffprobe_dur(final['saida'])[0],2,delta=.02)
                self.assertTrue(pg.evaluate("document.getElementById('page-sound-kanivete').classList.contains('active')"))
                pg.locator('#ske-modelo').focus()
                pg.keyboard.press('Control+Shift+m')
                self.assertEqual(pg.evaluate('VEFILA.itens.length'),1)
                pg.evaluate('document.activeElement?.blur()')
                pg.keyboard.press('m')
                self.assertEqual(pg.evaluate('SK.proj.marcadores.length'),marcadores+1)
                pg.keyboard.press('Control+m')
                self.assertEqual(pg.evaluate('VEFILA.itens.length'),2)
                self.assertTrue(pg.evaluate("document.getElementById('page-kanivete-encoder').classList.contains('active')"))
                pg.screenshot(path=str(PASTA/'fila.png'))
            finally:
                pg.evaluate('''async ant => {
                    skApi().sk_dialogo=window.dialogoKeOriginal;
                    VEFILA.itens=ant.fila;VEFILA.seq=ant.seq;VEFILA.sel=null;VEFILA.atual=null;VEFILA.rodando=false;VE.exportRunning=false;VE.ready=ant.ready;
                    const drive=document.getElementById('ve-drive-link');if(drive)drive.value=ant.drive;
                    appTabs.splice(0,appTabs.length,...ant.tabs);
                    SK.proj=ant.proj;SK.caminho=ant.caminho;SK.sujo=ant.sujo;SK.sel=ant.sel;SK.ph=ant.ph;SK.hist=ant.hist;SK.futuro=ant.futuro;SK._antes=null;
                    if(SK.proj) for(const f of SK.proj.faixas) for(const c of f.clipes) await skCarregarPicos(c.arq);
                    switchTool('sound-kanivete');skUi();skEnquadrar();veFilaRender();renderTabs();
                }''',backup)


if __name__=='__main__':
    unittest.main(verbosity=2)
