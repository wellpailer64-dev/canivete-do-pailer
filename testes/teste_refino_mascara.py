"""Refino de máscara: alfa, fundo externo, prévia, cancelamento, pixels preservados e histórico; sem IA."""
import json
import os
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

SAIDA=Path('D:/kanivete_testes/refino_mascara')
SAIDA.mkdir(parents=True,exist_ok=True)
for chave,pasta in [('TEMP','tmp'),('TMP','tmp'),('APPDATA','appdata'),('LOCALAPPDATA','localappdata')]:
    os.environ[chave]='D:/kanivete_testes/'+pasta
with urlopen('http://127.0.0.1:9333/json/list',timeout=5) as r:
    url=next(p['url'] for p in json.load(r) if p.get('type')=='page' and 'index.html' in p.get('url',''))
with sync_playwright() as p:
    b=p.chromium.launch(channel='msedge',headless=True)
    pg=b.new_page(viewport={'width':1440,'height':900})
    pg.route('https://**',lambda rota:rota.abort())
    pg.goto(url,wait_until='domcontentloaded')
    pg.wait_for_function("typeof ieRefinarMascaraPlano === 'function' && typeof KNV !== 'undefined'")
    pg.locator('#splash-overlay').wait_for(state='hidden')
    resultado=pg.evaluate('''() => {
        const exigir=(v,n)=>{if(!v)throw new Error(n);};
        for (const fundo of [0,255]) {
            const c=ieCanvas(24,24),x=ieCtx(c); if(fundo){x.fillStyle='#fff';x.fillRect(0,0,24,24);}
            const m={c,x:-7,y:13,fundo,solta:true},antes=c.toDataURL();
            exigir(ieRefinarMascaraPlano(m)===m,'neutro altera máscara');
            const r=ieRefinarMascaraPlano(m,{suavidade:4,contraste:20});
            const d=ieCtx(r.c).getImageData(0,0,r.c.width,r.c.height).data;
            exigir(d.every((v,i)=>i%4!==3||v===fundo),'fundo uniforme cria halo nas bordas');
            exigir(r.solta===true && m.c.toDataURL()===antes,'origem ou vínculo alterado');
        }
        const c=ieCanvas(6,1),x=ieCtx(c),d=x.createImageData(6,1);
        [0,64,127,128,192,255].forEach((v,i)=>{d.data[i*4+3]=v;d.data[i*4]=d.data[i*4+1]=d.data[i*4+2]=255;});x.putImageData(d,0,0);
        const m={c,x:10,y:20,fundo:0},r=ieRefinarMascaraPlano(m,{contraste:100});
        const alfa=Array.from(ieCtx(r.c).getImageData(0,0,6,1).data).filter((_,i)=>i%4===3);
        exigir(JSON.stringify(alfa)==='[0,0,0,255,255,255]','contraste não respeita limiar');
        const branco=ieRefinarMascaraPlano({c:null,x:0,y:0,fundo:255},{suavidade:3});
        exigir(ieCtx(branco.c).getImageData(0,0,1,1).data[3]===255,'máscara constante sem canvas');
        // Referência independente: percorre todos os pontos do disco, inclusive fora do canvas original.
        for (const fundo of [0,128,255]) for (const deslocar of [-3,-1,1,3]) {
            const c=ieCanvas(13,11),cx=ieCtx(c),img=cx.createImageData(13,11);
            for(let i=0;i<143;i++){img.data[i*4]=img.data[i*4+1]=img.data[i*4+2]=255;img.data[i*4+3]=(i*73+19)%256;}
            cx.putImageData(img,0,0);
            const m={c,x:-5,y:9,fundo,solta:true},original=c.toDataURL(),r=Math.abs(deslocar);
            const out=ieDeslocarMascaraPlano(m,deslocar),a=ieCtx(out.c).getImageData(0,0,out.c.width,out.c.height).data;
            exigir(out.x===m.x-r && out.y===m.y-r && out.solta && out.fundo===fundo,'posição ou vínculo no deslocamento');
            const ler=(x,y)=>x>=0&&y>=0&&x<13&&y<11?img.data[(y*13+x)*4+3]:fundo;
            for(let y=0;y<out.c.height;y++)for(let x=0;x<out.c.width;x++){
                let esperado=deslocar>0?0:255;
                for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r){
                    const v=ler(x-r+dx,y-r+dy);esperado=deslocar>0?Math.max(esperado,v):Math.min(esperado,v);
                }
                exigir(a[(y*out.c.width+x)*4+3]===esperado,'disco diverge da referência: '+[fundo,deslocar,x,y]);
            }
            exigir(c.toDataURL()===original,'deslocamento alterou a origem');
            const junto=ieRefinarMascaraPlano(m,{deslocar,suavidade:1,contraste:30});
            const separado=ieRefinarMascaraPlano(out,{suavidade:1,contraste:30});
            exigir(junto.c.toDataURL()===separado.c.toDataURL(),'ordem deslocar/suavizar/contraste');
        }
        for(const fundo of [0,255])for(const deslocar of [-2,2]){
            const out=ieDeslocarMascaraPlano({fundo},deslocar),a=ieCtx(out.c).getImageData(0,0,out.c.width,out.c.height).data;
            exigir(a.every((v,i)=>i%4!==3||v===fundo),'fundo constante mudou no deslocamento');
        }
        window.pywebview={api:new Proxy({},{get:()=>async()=>({success:false})})};
        KNV.novo('Teste refino de máscara',256,256,'branco');
        const L=ieAtiva(IE.doc),cx=ieCtx(L.c);cx.fillStyle='#5a9cca';cx.fillRect(0,0,256,256);
        const mascara=ieCanvas(128,128),mx=ieCtx(mascara);mx.fillStyle='#fff';mx.fillRect(24,24,80,80);
        const fundo=ieCanvas(256,256),fx=ieCtx(fundo);fx.fillStyle='#ff00ff';fx.fillRect(0,0,256,256);
        IE.doc.camadas.unshift(ieNovaCamada(IE.doc,{nome:'Fundo da composição',c:fundo}));
        L.m={c:mascara,x:64,y:64,fundo:0,solta:true};L.sujoM=true;IE.doc.mascaraAlvo=true;
        ieCamadaMudou(L);ieHist('Máscara original');ieUiProps();
        window.__original=L.m;window.__pixels=L.c.toDataURL();window.__hist=IE.doc.hist.i;
        return 'PASSOU: neutro, fundos branco/preto, ausência de halos de canvas, contraste e coordenadas.';
    }''')
    print(resultado)
    tempo=pg.evaluate('''() => {
        const c=ieCanvas(1024,1024),x=ieCtx(c);x.fillStyle='#fff';x.fillRect(256,256,512,512);
        const t=performance.now();ieDeslocarMascaraPlano({c,x:0,y:0,fundo:0},10);
        return Math.round(performance.now()-t);
    }''')
    print(f'Deslocamento circular: 1024×1024, raio 10 px, {tempo} ms.')
    assert pg.locator('[onclick="ieCmd(\'mascaraRefinar\')"]').count()==1
    pg.evaluate("() => { window.__refino=ieRefinarMascara(IE.doc); }")
    pg.wait_for_selector('[data-refino-inspecao]')
    pg.wait_for_function("document.querySelector('[data-refino-inspecao]').width > 1")
    antes_inspecao=pg.evaluate('''() => {ieCompor(IE.doc,ieRDoc(IE.doc));return {png:IE.doc.comp.toDataURL(),camadas:IE.doc.camadas.length,vista:[IE.doc.zoom,IE.doc.px,IE.doc.py]};}''')
    amostra="""([dx,dy]) => { const c=document.querySelector('[data-refino-inspecao]');return Array.from(ieCtx(c).getImageData(Math.floor(c.width/2)+dx,Math.floor(c.height/2)+dy,1,1).data); }"""
    for modo,cor in [('branco',[255,255,255,255]),('preto',[0,0,0,255])]:
        pg.locator('[data-id="fundoInspecao"]').select_option(modo)
        pg.wait_for_function("cor => {const c=document.querySelector('[data-refino-inspecao]'),a=ieCtx(c).getImageData(0,0,1,1).data;return a.every((v,i)=>v===cor[i]);}",arg=cor)
        assert pg.evaluate(amostra,[0,0])[:3]==[90,156,202]
    pg.evaluate("() => { window.__seletor=ieSeletorCor;ieSeletorCor=(el,cor,retorno)=>retorno('#204060'); }")
    pg.locator('[data-id="corInspecao"]').click()
    pg.evaluate('() => { ieSeletorCor=window.__seletor; }')
    pg.locator('[data-id="fundoInspecao"]').select_option('cor')
    pg.wait_for_function("() => {const c=document.querySelector('[data-refino-inspecao]'),a=ieCtx(c).getImageData(0,0,1,1).data;return a[0]===32&&a[1]===64&&a[2]===96;}")
    ajustada=pg.locator('[data-refino-inspecao]').evaluate('c=>c.toDataURL()')
    pg.locator('[data-id="zoomInspecao"]').select_option('100')
    pg.wait_for_function("() => document.querySelector('[data-refino-inspecao]') && ieAtiva(IE.doc).m===window.__original")
    pg.wait_for_timeout(90)
    assert pg.evaluate(amostra,[50,0])[:3]==[32,64,96]
    pg.locator('[data-id="zoomInspecao"]').select_option('200')
    pg.wait_for_function("() => {const c=document.querySelector('[data-refino-inspecao]');return ieCtx(c).getImageData(Math.floor(c.width/2)+50,Math.floor(c.height/2),1,1).data[0]===90;}")
    canvas=pg.locator('[data-refino-inspecao]')
    caixa=canvas.bounding_box()
    sem_arrastar=canvas.evaluate('c=>c.toDataURL()')
    pg.mouse.move(caixa['x']+caixa['width']/2,caixa['y']+caixa['height']/2)
    pg.mouse.down();pg.mouse.move(caixa['x']+caixa['width']/2+40,caixa['y']+caixa['height']/2+20,steps=4);pg.mouse.up()
    assert canvas.evaluate('c=>c.toDataURL()')!=sem_arrastar
    pg.locator('[data-id="zoomInspecao"]').select_option('ajustar')
    pg.wait_for_function('antes=>document.querySelector("[data-refino-inspecao]").toDataURL()===antes',arg=ajustada)
    depois_inspecao=pg.evaluate('''() => {ieCompor(IE.doc,ieRDoc(IE.doc));return {png:IE.doc.comp.toDataURL(),camadas:IE.doc.camadas.length,vista:[IE.doc.zoom,IE.doc.px,IE.doc.py]};}''')
    assert antes_inspecao==depois_inspecao
    assert pg.evaluate('IE.doc.hist.i===window.__hist && ieAtiva(IE.doc).m===window.__original')
    print('PASSOU: fundos branco/preto/cor, recorte isolado, zoom 100%/200%, arraste; composição, navegação e histórico intactos.')
    pg.locator('[data-num="deslocar"]').fill('-2')
    pg.wait_for_function('ieAtiva(IE.doc).m.x === 62')
    contraida=pg.evaluate('ieAtiva(IE.doc).m.c.toDataURL()')
    pg.locator('[data-num="deslocar"]').fill('2')
    pg.wait_for_function('(antes) => ieAtiva(IE.doc).m.c.toDataURL() !== antes',arg=contraida)
    assert pg.evaluate('ieAtiva(IE.doc).m.x === 62 && ieAtiva(IE.doc).m.c.width === 132')
    pg.locator('[data-num="deslocar"]').fill('0')
    pg.wait_for_function('ieAtiva(IE.doc).m === window.__original')
    pg.locator('[data-num="suavidade"]').fill('3')
    pg.wait_for_function('ieAtiva(IE.doc).m !== window.__original')
    primeira=pg.evaluate('ieAtiva(IE.doc).m.c.toDataURL()')
    pg.locator('[data-num="suavidade"]').fill('5')
    pg.wait_for_function('ieAtiva(IE.doc).m.x === 47')
    pg.locator('[data-num="suavidade"]').fill('3')
    pg.wait_for_function('ieAtiva(IE.doc).m.x === 53')
    assert pg.evaluate('ieAtiva(IE.doc).m.c.toDataURL()')==primeira
    pg.locator('.ie-dlg-previa').uncheck()
    pg.wait_for_function('ieAtiva(IE.doc).m === window.__original')
    pg.locator('[data-id="fundoInspecao"]').select_option('branco')
    pg.wait_for_function("() => {const c=document.querySelector('[data-refino-inspecao]');return ieCtx(c).getImageData(0,0,1,1).data[0]===255;}")
    assert pg.evaluate('ieAtiva(IE.doc).m===window.__original')
    pg.locator('.ie-dlg-previa').check()
    pg.wait_for_function('ieAtiva(IE.doc).m !== window.__original')
    pg.locator('[data-num="deslocar"]').fill('-2')
    pg.wait_for_function('ieAtiva(IE.doc).m.x === 51')
    pg.screenshot(path=str(SAIDA/'refinar_mascara.png'))
    pg.keyboard.press('Escape')
    pg.wait_for_function('ieAtiva(IE.doc).m === window.__original')
    assert pg.evaluate('IE.doc.hist.i === window.__hist && ieAtiva(IE.doc).c.toDataURL() === window.__pixels')
    pg.evaluate("() => { window.__refino=ieRefinarMascara(IE.doc); }")
    pg.locator('[data-num="suavidade"]').fill('3')
    pg.locator('[data-num="contraste"]').fill('25')
    pg.locator('[data-num="deslocar"]').fill('-2')
    pg.locator('#ie-modal [data-r="1"]').click()
    pg.wait_for_function('IE.doc.hist.i === window.__hist + 1')
    assert pg.evaluate('ieAtiva(IE.doc).c.toDataURL() === window.__pixels && ieAtiva(IE.doc).m.solta')
    final=pg.evaluate('ieAtiva(IE.doc).m.c.toDataURL()')
    pg.evaluate('ieDesfazer()')
    assert pg.evaluate('ieAtiva(IE.doc).m.c.toDataURL() === window.__original.c.toDataURL()')
    pg.evaluate('ieRefazer()')
    assert pg.evaluate('ieAtiva(IE.doc).m.c.toDataURL()')==final
    pg.evaluate("async () => { await KNV.cmd('mascaraRefinar',{suavidade:0,contraste:0}); }")
    assert pg.evaluate('ieAtiva(IE.doc).m.c.toDataURL()')==final
    historico=pg.evaluate('IE.doc.hist.i')
    pg.evaluate("() => { window.__refino=ieRefinarMascara(IE.doc); }")
    pg.locator('[data-id="fundoInspecao"]').select_option('preto')
    pg.locator('[data-id="zoomInspecao"]').select_option('200')
    pg.locator('#ie-modal [data-r="1"]').click()
    pg.wait_for_selector('#ie-modal',state='hidden')
    assert pg.evaluate('IE.doc.hist.i')==historico
    assert pg.evaluate('ieAtiva(IE.doc).m.c.toDataURL()')==final
    assert pg.locator('[data-refino-inspecao]').count()==0
    print('PASSOU: prévia sem acumulação, Visualizar, Cancelar, confirmar, um passo de histórico, pixels intactos e automação; inspeção sozinha não grava histórico.')
    b.close()
