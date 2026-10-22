"""Título editável da fila: cliques reais, cancelamento, redraw e nomes dos WAVs renderizados; só porta 9333."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import unittest

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from Functions.midia import ffmpeg
from Functions import sound_kanivete, ke_arquivos

PASTA = Path('D:/kanivete_testes/ke_renomear')


class RenomearFilaTest(unittest.TestCase):
    def test_edicao_e_arquivos_de_saida(self):
        PASTA.mkdir(parents=True, exist_ok=True)
        fonte = (PASTA/'fonte.wav').as_posix()
        subprocess.run([ffmpeg(),'-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=0.4',fonte],check=True)
        original = hashlib.sha256(Path(fonte).read_bytes()).hexdigest()
        with sync_playwright() as p:
            b=p.chromium.connect_over_cdp('http://127.0.0.1:9333')
            pg=next(x for x in b.contexts[0].pages if 'index.html' in x.url)
            pg.set_default_timeout(20000)
            self.assertFalse(pg.evaluate('VEFILA.rodando || !!VEFILA.atual'))
            backup=pg.evaluate('''({proj:SK.proj,caminho:SK.caminho,sujo:SK.sujo,sel:SK.sel,ph:SK.ph,hist:SK.hist,futuro:SK.futuro,
                fila:VEFILA.itens,seq:VEFILA.seq,tabs:[...appTabs],drive:document.getElementById('ve-drive-link')?.value||''})''')
            (PASTA/'antes.json').write_text(json.dumps(backup,ensure_ascii=False),encoding='utf-8')
            try:
                ids=pg.evaluate('''async ({fonte,pasta})=>{
                    VEFILA.itens=[];VEFILA.sel=null;
                    const d=document.getElementById('ve-drive-link');if(d)d.value='';
                    SKN.novo('vazio','Teste nomes');await SKN.importar(fonte);
                    const op={f:'wav',k:'192',l:'',fx:'',stems:false,caps:false};
                    const som=skParaKe(pasta+'/Inicial.wav',op);
                    const f=SKN.faixa('Voz B');await SKN.importar(fonte,{faixa:f});
                    const stems=skParaKe(pasta+'/Stems.wav',{...op,stems:true});
                    const arq=(await KE_API.adicionar([fonte],'wav'))[0];
                    VEFILA.itens.find(x=>x.id===arq).cfg.dest=pasta;
                    switchTool('kanivete-encoder');veFilaRender();return {som,stems,arq};
                }''',{'fonte':fonte,'pasta':PASTA.as_posix()})

                def editar(id,nome,confirmar=True):
                    pg.locator(f'[data-fila="{id}"] .ve-fila-nome-titulo').click()
                    campo=pg.locator(f'[data-fila-nome="{id}"]')
                    campo.fill(nome)
                    campo.press('Enter' if confirmar else 'Escape')

                editar(ids['som'],'Cancelado',False)
                self.assertEqual(pg.evaluate('id=>VEFILA.itens.find(x=>x.id===id).cfg.nome',ids['som']),'Inicial')
                pg.locator(f'[data-fila="{ids["som"]}"] .ve-fila-nome-titulo').click()
                campo=pg.locator(f'[data-fila-nome="{ids["som"]}"]')
                campo.fill('Reação aprovada')
                pg.evaluate('veFilaRender()')
                self.assertEqual(campo.input_value(),'Reação aprovada')
                self.assertTrue(campo.evaluate('el=>el===document.activeElement'))
                campo.press('Enter')
                self.assertEqual(pg.evaluate('id=>VEFILA.itens.find(x=>x.id===id).chamadas[0].caminho',ids['som']),(PASTA/'Reação aprovada.wav').as_posix())
                editar(ids['som'],'nome/inválido')
                self.assertEqual(pg.locator(f'[data-fila-nome="{ids["som"]}"]').count(),1)
                pg.locator(f'[data-fila-nome="{ids["som"]}"]').press('Escape')
                editar(ids['stems'],'Minhas reações')
                paths=pg.evaluate('id=>VEFILA.itens.find(x=>x.id===id).chamadas.map(x=>x.caminho)',ids['stems'])
                self.assertEqual({Path(x).name for x in paths},{'Minhas reações - Faixa 1.wav','Minhas reações - Voz B.wav'})
                # Blur confirma e não seleciona o item nem abre as configurações da timeline.
                pg.locator(f'[data-fila="{ids["arq"]}"] .ve-fila-nome-titulo').click()
                pg.locator(f'[data-fila-nome="{ids["arq"]}"]').fill('Efeito convertido')
                pg.locator('.ve-fila-cab b').first.click()
                self.assertTrue(pg.evaluate('id=>VEFILA.itens.find(x=>x.id===id).cfg.nomePersonalizado',ids['arq']))
                self.assertIsNone(pg.evaluate('VEFILA.sel'))
                pg.screenshot(path=str(PASTA/'fila.png'))
                pg.evaluate('veFilaIniciar()')
                pg.wait_for_function('VEFILA.itens.every(x=>["pronto","erro"].includes(x.estado))')
                itens=pg.evaluate('VEFILA.itens')
                self.assertTrue(all(x['estado']=='pronto' for x in itens),itens)
                self.assertEqual(Path(itens[0]['saida']).name,'Reação aprovada.wav')
                self.assertTrue(all(Path(x).is_file() for x in paths))
                self.assertTrue(Path(itens[2]['saida']).name.startswith('Efeito convertido'))
                self.assertEqual(pg.locator('.ve-fila-nome-titulo').count(),0)
                self.assertEqual(hashlib.sha256(Path(fonte).read_bytes()).hexdigest(),original)
                extra=pg.evaluate('''()=>{
                    const cfg={nome:'Vídeo',pills:{}};
                    const v={id:++VEFILA.seq,cfg,timeline:'Vídeo',dur:1,estado:'espera',pct:0};
                    const l={id:++VEFILA.seq,tipo:'lux',cfg:{nome:'Cena'},spec:JSON.stringify({nome:'Cena',quadros:[]}),timeline:'Lux',dur:1,estado:'espera',pct:0};
                    VEFILA.itens.push(v,l);veFilaRenomear(v.id,'Vídeo novo');veFilaRenomear(l.id,'Cena nova');
                    return {video:v.cfg.nome,lux:JSON.parse(l.spec).nome};
                }''')
                self.assertEqual(extra,{'video':'Vídeo novo','lux':'Cena nova'})
            finally:
                pg.evaluate('''async ant=>{
                    VEFILA.nomeEditando=null;VEFILA.nomeRascunho=null;VEFILA.itens=ant.fila;VEFILA.seq=ant.seq;VEFILA.sel=null;VEFILA.atual=null;VEFILA.rodando=false;VE.exportRunning=false;
                    const d=document.getElementById('ve-drive-link');if(d)d.value=ant.drive;
                    appTabs.splice(0,appTabs.length,...ant.tabs);
                    SK.proj=ant.proj;SK.caminho=ant.caminho;SK.sujo=ant.sujo;SK.sel=ant.sel;SK.ph=ant.ph;SK.hist=ant.hist;SK.futuro=ant.futuro;SK._antes=null;
                    if(SK.proj)for(const f of SK.proj.faixas)for(const c of f.clipes)await skCarregarPicos(c.arq);
                    switchTool('sound-kanivete');skUi();skEnquadrar();veFilaRender();renderTabs();
                }''',backup)

    def test_saida_existente_e_nome_reservado(self):
        PASTA.mkdir(parents=True,exist_ok=True)
        existente=PASTA/'nao_sobrescrever.wav'
        existente.write_bytes(b'preservar este arquivo')
        r=sound_kanivete.exportar({},str(existente),{'nao_sobrescrever':True})
        self.assertFalse(r['success'])
        self.assertEqual(existente.read_bytes(),b'preservar este arquivo')
        with self.assertRaises(ValueError):
            ke_arquivos._saida('D:/entrada.wav',{'pasta':str(PASTA),'nome':'../outra'},'wav','')
        with self.assertRaises(ValueError):
            ke_arquivos._saida('D:/entrada.wav',{'pasta':str(PASTA),'nome':'CON'},'wav','')


if __name__=='__main__':
    unittest.main(verbosity=2)
