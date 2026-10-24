"""HSL secundário: seletividade, UI e prévia WebGL × render FFmpeg, sem acessar o app aberto."""
import base64
import os
from pathlib import Path
import subprocess
import sys
import unittest

RAIZ = Path(__file__).resolve().parents[1]
PASTA = Path('D:/kanivete_testes/lc_hsl')
PASTA.mkdir(parents=True, exist_ok=True)
for nome in ('TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA'):
    pasta = PASTA / nome.lower(); pasta.mkdir(exist_ok=True); os.environ[nome] = str(pasta)
sys.path.insert(0, str(RAIZ))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', 'D:/kanivete_testes/playwright')
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np


class HSLTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start(); cls.addClassCleanup(cls.pw.stop)
        cls.browser = cls.pw.chromium.launch(headless=True); cls.addClassCleanup(cls.browser.close)

    def setUp(self):
        self.p = self.browser.new_page(); self.addCleanup(self.p.close)
        self.p.set_content('<div id="ve-lc-body"></div>')
        self.p.add_script_tag(path=str(RAIZ/'frontend/js/editor-fx.js'))
        self.p.add_script_tag(path=str(RAIZ/'frontend/js/editor-lc.js'))
        self.p.evaluate("window.$ve=id=>document.getElementById(id)")

    def test_projeto_antigo_e_selecao_sem_correcao_sao_neutros(self):
        r = self.p.evaluate('''()=>{
            const v=veLcDefaults(), antigo={...v};for(const k of Object.keys(antigo))if(k.startsWith('q'))delete antigo[k];
            const a=veLcBuildLut(antigo,9),b=veLcBuildLut(v,9);
            const key=veLcColorKey(v);Object.assign(v,{qh:240,qw:65,qs0:30});
            return [veLcColorNeutral(antigo),veLcColorNeutral(v),key===veLcColorKey(v),a.every((x,i)=>x===b[i])];
        }''')
        self.assertEqual(r,[True,True,True,True])

    def test_faixa_vermelha_circular_suave_e_cinza_preservado(self):
        r = self.p.evaluate('''()=>{
            const q=veLcSecParams({...veLcDefaults(),qs:0});
            return {red:veLcSecCor(.8,.1,.1,q),blue:veLcSecCor(.1,.1,.8,q),gray:veLcSecCor(.4,.4,.4,q),
              perto:veLcSecPeso(1,0,.1,q),centro:veLcSecPeso(1,.25,0,q),borda:veLcSecPeso(1,5/12,0,q),fora:veLcSecPeso(1,7/12,0,q)};
        }''')
        self.assertLess(max(r['red'])-min(r['red']),1e-6)
        self.assertEqual(r['blue'],[.1,.1,.8]);self.assertEqual(r['gray'],[.4,.4,.4])
        self.assertAlmostEqual(r['perto'],1);self.assertAlmostEqual(r['centro'],1)
        self.assertGreater(r['borda'],0);self.assertLess(r['borda'],1);self.assertEqual(r['fora'],0)

    def test_limites_de_luz_e_saturacao_e_cinza_sem_contaminacao(self):
        r=self.p.evaluate('''()=>{
          const q=veLcSecParams({...veLcDefaults(),qe:1,qs0:50,qs1:100,ql0:30,ql1:70});
          const pesos=[[.8,.2,.2],[.1,0,0],[.6,.5,.5]].map(c=>veLcSecPeso(...c,q));
          const v={...veLcDefaults(),qw:180,qs0:0,qe:.5},lut=veLcLut(v),N=lut.n;
          let erro=0;for(let i=0;i<N;i++){const k=((i*N+i)*N+i)*3;erro=Math.max(erro,Math.abs(lut.f32[k]-lut.f32[k+1]),Math.abs(lut.f32[k]-lut.f32[k+2]));}
          return {pesos,erro,n:N};
        }''')
        self.assertGreater(r['pesos'][0],0);self.assertEqual(r['pesos'][1:],[0,0])
        self.assertEqual(r['erro'],0);self.assertEqual(r['n'],65)

    def test_float16_arredonda_sem_corromper_canais(self):
        valores=np.concatenate([np.linspace(0,1,2049),[.49999,.99999,2**-24,2**-25,2**-14,0]]).astype(np.float32)
        obtido=self.p.evaluate('v=>Array.from(veLcHalf(new Float32Array(v)))',[0 if x == 0 else float(x) for x in valores])
        esperado=valores.astype(np.float16).view(np.uint16).tolist()
        self.assertEqual(obtido,esperado)

    def test_painel_expoe_controles_e_faixas(self):
        self.p.evaluate('veLcBuild()')
        self.assertEqual(self.p.locator('[data-sec=secondary] input[type=range]').count(),10)
        self.assertEqual(self.p.locator('[data-la=secfaixa]').all_text_contents(),['Vermelhos','Verdes','Azuis'])
        self.assertIn('sem reconhecer objetos',self.p.locator('[data-sec=secondary]').inner_text())

    def test_faixa_serializa_e_reset_preserva_ajustes_globais(self):
        r=self.p.evaluate('''()=>{
          window.VE={clips:[{fx:[]}],sel:0};window.veLcClip=()=>VE.clips[0];window.veLcAlvos=()=>VE.clips;
          window.veFxNewId=()=> 'fx-teste';window.vePushHistory=()=>{};window.veRenderFxControls=()=>{};
          window.veLcRender=()=>{};window.veDrawMonitorSoon=()=>{};window.veRefresh=()=>{};
          veLcBuild();veLcAction(document.querySelector('[data-qh="240"]'));
          veLcSet('qe',.5);veLcSet('exp',.25);
          const v=veFxValues(JSON.parse(JSON.stringify(VE.clips[0].fx[0])));
          veLcAction(document.querySelector('[data-sec=secondary] [data-la=resetsec]'));
          const reset=veFxValues(VE.clips[0].fx[0]);
          return [v.qh,v.qe,veLcSecAtivo(v),reset.exp,veLcSecAtivo(reset)];
        }''')
        self.assertEqual(r,[240,.5,True,.25,False])

    def test_previa_webgl_igual_ao_filtro_real_de_exportacao(self):
        from Functions import video_cutter as vc
        from Functions.convertermp3 import ffmpeg_path
        casos=({'qh':0,'qs':20,'qe':.4},{'qh':220,'qw':50,'qr':-25,'qs0':20,'ql1':85},
               {'temp':24,'tint':-10,'exp':.3,'ct':25,'sat':120,'cw':{'s':[.1,-.05],'m':[-.05,.04]},
                'cv':{'m':[[0,0],[.3,.25],[.75,.85],[1,1]]},'hc':{'hs':[[.1,.5],[.3,.7],[.5,.5]]}})
        for n,ajustes in enumerate(casos):
            r=self.p.evaluate('''ajustes=>{
              const v=Object.assign(veLcDefaults(),ajustes),cv=document.createElement('canvas');cv.width=256;cv.height=128;
              const ctx=cv.getContext('2d'),im=ctx.createImageData(cv.width,cv.height);
              for(let y=0;y<128;y++)for(let x=0;x<256;x++){const k=(y*256+x)*4;im.data.set([x,y*2,(x*7+y*3)%256,255],k);}
              ctx.putImageData(im,0,0);
              const out=veLcDraw({cv},v,{w:256,h:128,mw:256,mh:128,q:1});
              if(!VELC.gl)throw Error('WebGL não inicializou');
              return {fonte:cv.toDataURL().split(',')[1],previa:out.cv.toDataURL().split(',')[1],fx:VE_FX.lc.exportar(v)};
            }''',ajustes)
            origem=PASTA/f'fonte{n}.png';previa=PASTA/f'previa{n}.png';saida=PASTA/f'render{n}.png'
            origem.write_bytes(base64.b64decode(r['fonte']));previa.write_bytes(base64.b64decode(r['previa']))
            filtro=','.join(vc._filtros_fx([{'t':'lc','v':r['fx']}],256,128))
            proc=subprocess.run([ffmpeg_path(),'-v','error','-y','-i',str(origem),'-vf',filtro,'-frames:v','1',str(saida)],capture_output=True)
            self.assertEqual(proc.returncode,0,proc.stderr.decode(errors='replace')[-800:])
            a=np.asarray(Image.open(previa).convert('RGB'),dtype=np.int16);b=np.asarray(Image.open(saida).convert('RGB'),dtype=np.int16)
            erro=np.abs(a-b)
            print(f'Caso {n}: erro médio={erro.mean():.3f}, máximo={erro.max()} / 255')
            self.assertLess(float(erro.mean()),1.0);self.assertLessEqual(int(erro.max()),3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
