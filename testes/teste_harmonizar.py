"""Harmonização: análise, isolamento, ajustes editáveis, prévia, cancelamento e histórico; sem IA."""
import json
import os
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

SAIDA=Path('D:/kanivete_testes/harmonizacao')
SAIDA.mkdir(parents=True,exist_ok=True)
for k,pasta in [('TEMP','tmp'),('TMP','tmp'),('APPDATA','appdata'),('LOCALAPPDATA','localappdata')]:
    os.environ[k]='D:/kanivete_testes/'+pasta
with urlopen('http://127.0.0.1:9333/json/list',timeout=5) as r:
    url=next(x['url'] for x in json.load(r) if x.get('type')=='page' and 'index.html' in x.get('url',''))
with sync_playwright() as p:
    b=p.chromium.launch(channel='msedge',headless=True)
    pg=b.new_page(viewport={'width':1440,'height':900})
    pg.route('https://**',lambda r:r.abort())
    pg.goto(url,wait_until='domcontentloaded')
    pg.wait_for_function("typeof ieHarmonizar === 'function' && typeof KNV !== 'undefined'")
    pg.locator('#splash-overlay').wait_for(state='hidden')
    pg.evaluate('''() => {
        window.pywebview={api:new Proxy({},{get:()=>async()=>({success:false})})};
        KNV.novo('Harmonização — teste',128,128,'branco');
        const d=IE.doc,R=ieAtiva(d),x=ieCtx(R.c);R.nome='Cenário';x.fillStyle='#c0a080';x.fillRect(0,0,128,128);ieCamadaMudou(R);
        const c=ieCanvas(64,64),cx=ieCtx(c);cx.fillStyle='#406080';cx.fillRect(0,0,64,64);
        const m=ieCanvas(64,64),mx=ieCtx(m);mx.fillStyle='#fff';mx.fillRect(8,8,48,48);mx.globalAlpha=0.5;mx.fillRect(0,0,8,64);
        const L=ieNovaCamada(d,{nome:'Assunto',c,x:32,y:32,m:{c:m,x:32,y:32,fundo:0}});
        ieInserirAcima(d,L,R);ieCamadaMudou(L);ieHist('Assunto');ieCompor(d,ieRDoc(d));
        window.__harm={L,R,pixels:L.c.toDataURL(),mascara:L.m.c.toDataURL(),antes:d.comp.toDataURL(),hist:d.hist.i,ativa:d.ativa,sel:[...d.selIds]};
        const vazio=ieNovaCamada(d,{c:ieCanvas(4,4)});let recusou=false;
        try{ieHarmAmostra(vazio);}catch(e){recusou=true;}if(!recusou)throw Error('aceitou imagem vazia');
        const amostra=ieHarmAmostra(L);if(!Number.isFinite(amostra.luz))throw Error('estatística inválida');
    }''')
    pg.evaluate('() => { window.__harmPromessa=ieHarmonizar(IE.doc); }')
    pg.locator('[data-num="luz"]').fill('100')
    pg.locator('[data-num="cor"]').fill('0')
    pg.wait_for_function('IE.doc.camadas.some(L=>L.tipo==="grupo")')
    def pixels():
        return pg.evaluate('''() => {ieCompor(IE.doc,ieRDoc(IE.doc));const d=ieCtx(IE.doc.comp).getImageData(0,0,128,128).data;return {fora:Array.from(d.slice(0,4)),dentro:Array.from(d.slice((64*128+64)*4,(64*128+64)*4+4))};}''')
    tonal=pixels()
    assert tonal['fora']==[192,160,128,255],tonal
    assert tonal['dentro'][0]>64 and tonal['dentro'][1]>96,tonal
    pg.locator('[data-num="luz"]').fill('0')
    pg.locator('[data-num="cor"]').fill('100')
    pg.wait_for_function("ieTodas(IE.doc).find(L=>L.ajChave==='exposicao')?.ajVals.exp===0")
    cromatico=pixels()
    assert cromatico['dentro'][0]-cromatico['dentro'][2]>-64,cromatico
    assert pg.evaluate('__harm.L.c.toDataURL()===__harm.pixels && __harm.L.m.c.toDataURL()===__harm.mascara')
    pg.evaluate('''() => {
        const d=IE.doc,camadas=d.camadas,G=camadas.find(L=>L.tipo==='grupo');
        const origem=ieRaster(__harm.L),a=ieCtx(origem.c).getImageData(0,0,64,64).data;
        try{
            d.camadas=[G];ieCompor(d,ieRDoc(d));const r=ieCtx(d.comp).getImageData(32,32,64,64).data;
            for(let i=3;i<a.length;i+=4)if(a[i]!==r[i])throw Error('harmonização alterou alfa');
        }finally{d.camadas=camadas;ieTudo(d);}
    }''')
    pg.locator('.ie-dlg-previa').uncheck()
    pg.wait_for_function('IE.doc.camadas.length===2 && IE.doc.camadas.every(L=>L.tipo!=="grupo")')
    assert pg.evaluate('() => {ieCompor(IE.doc,ieRDoc(IE.doc));return IE.doc.comp.toDataURL()===__harm.antes;}')
    pg.locator('.ie-dlg-previa').check()
    pg.wait_for_function('IE.doc.camadas.some(L=>L.tipo==="grupo")')
    pg.screenshot(path=str(SAIDA/'harmonizar.png'))
    pg.keyboard.press('Escape')
    pg.wait_for_function('IE.doc.camadas.length===2 && IE.doc.camadas.every(L=>L.tipo!=="grupo")')
    assert pg.evaluate('IE.doc.hist.i===__harm.hist && IE.doc.ativa===__harm.ativa && JSON.stringify(IE.doc.selIds)===JSON.stringify(__harm.sel)')
    pg.evaluate("async () => { await KNV.cmd('harmonizar',{assunto:String(__harm.L.id),referencia:String(__harm.R.id),luz:70,cor:40}); }")
    assert pg.evaluate('IE.doc.hist.i===__harm.hist+1 && ieTodas(IE.doc).filter(L=>L.tipo==="ajuste").length===2')
    assert pg.evaluate('ieTodas(IE.doc).find(L=>L.id===__harm.L.id)===__harm.L && __harm.L.c.toDataURL()===__harm.pixels')
    pg.evaluate('ieDesfazer()')
    assert pg.evaluate('IE.doc.camadas.length===2 && IE.doc.camadas.every(L=>L.tipo!=="grupo")')
    pg.evaluate('ieRefazer()')
    assert pg.evaluate('ieTodas(IE.doc).some(L=>L.ajChave==="exposicao") && ieTodas(IE.doc).some(L=>L.ajChave==="equilibrio")')
    pg.evaluate('ieDesfazer()')
    pg.evaluate("async () => { await KNV.cmd('harmonizar',{assunto:String(ieTodas(IE.doc).find(L=>L.nome==='Assunto').id),referencia:String(ieTodas(IE.doc).find(L=>L.nome==='Cenário').id),luz:0,cor:0}); }")
    assert pg.evaluate('IE.doc.hist.i===__harm.hist && IE.doc.camadas.length===2')
    pg.evaluate('''() => {
        const d=IE.doc,L=ieTodas(d).find(L=>L.nome==='Assunto'),R=ieTodas(d).find(L=>L.nome==='Cenário');
        const antes=d.camadas.map(L=>L.id).join(','),hist=d.hist.i;
        const recusa=(a,b)=>{let recusou=false;try{ieHarmMontar(d,a,b,50,50,new Map());}catch(e){recusou=true;}if(!recusou)throw Error('entrada inválida aceita');};
        recusa(L,L);
        L.clip=true;recusa(L,R);L.clip=false;
        L.bm='MULTIPLY';recusa(L,R);L.bm='NORMAL';
        L.op=0;recusa(L,R);L.op=1;
        const pixels=R.c;R.c=ieCanvas(128,128);ieInvalidar(R);recusa(L,R);R.c=pixels;ieInvalidar(R);
        if(d.camadas.map(L=>L.id).join(',')!==antes || d.hist.i!==hist)throw Error('recusa alterou estrutura/histórico');
    }''')
    print('PASSOU: análise, luminosidade/cor independentes, alfa e pixels preservados, cenário intacto, prévia, Cancelar, ajustes editáveis, automação, desfazer/refazer e entradas inválidas.')
    b.close()
