"""Camadas em profundidade na Cena 3D (editor-3d-placas.js + editor-3d-mexer.js), app em --agente=9333:
  1. camadas (forma + texto) → Cena 3D: o 1º quadro igual ao 2D;
  2. VE3DAPI.colocar / naTela / folha (olhos e mãos do agente);
  3. tela 3D com mouse de verdade: arrastar a placa acompanha o mouse; Alt+rodinha, [ ] e o mapa de profundidade mudam
     o Z SEM mudar a caixa na tela; Ctrl+Z volta tudo;
  4. leveza: um motor (contexto WebGL) para todas as cenas, no máximo 4 montadas, acrescentar placa sem reler as outras.
Uso: py -3.13 testes/teste_3d_placas.py   (sai com 1 se algo falhar)"""
import sys, time, json
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
falhas = []
def conferir(ok, msg):
    print(("OK   " if ok else "RUIM ") + msg); (None if ok else falhas.append(msg))

with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    pg.set_default_timeout(120000)
    pg.wait_for_function("typeof ve3dDeCamadas === 'function' && typeof ve3dEmpurrar === 'function'")
    pg.evaluate("switchTool('video-cutter')"); time.sleep(1)
    # 1. camadas → cena: forma e texto sobre fundo liso
    r = json.loads(pg.evaluate("""async () => {
        veCriarProjetoVazio({ w: 1920, h: 1080, fps: 30, quieto: true });
        const fm = veGrMidia('forma', 'Forma'), tm = veTxMidia();
        VE.clips = [
            { tr: 0, st: 0, s: 0, e: 4, m: fm.id, nome: 'Fundo', fm: { t: 'ret', w: 1920, h: 1080, cor: '#e9e0c8', cOn: false }, p: { sc: 100, x: 960, y: 540, rot: 0, op: 100 } },
            { tr: 1, st: 0, s: 0, e: 4, m: fm.id, nome: 'Caixa', fm: { t: 'ret', w: 600, h: 260, cor: '#c41e1c', cOn: false, raio: 12 }, p: { sc: 100, x: 700, y: 700, rot: -4, op: 100 } },
            { tr: 2, st: 0, s: 0, e: 4, m: tm.id, nome: 'Titulo', tx: { ...VE_TX_PADRAO, t: 'Profundidade', tam: 110, cor: '#111111' }, p: { sc: 100, x: 700, y: 700, rot: -4, op: 100 } }];
        veRelayout(); veAfterEdit(0);
        const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080; const itens = [];
        for (const c of VE.clips.slice().sort((a, b) => a.tr - b.tr)) itens.push({ c, src: await veMoFonte(c, 1, 1) });
        const ph = VE.playhead; VE.playhead = 1; veDesenharItens(cv.getContext('2d'), cv, itens, 1, 1); VE.playhead = ph;
        const res = await ve3dDeCamadas(VE.clips.slice()), c3 = VE.clips[0], m = VE.media[c3.m]; await ve3dGarantir(m);
        const d = ve3dQuadro(c3, 1, 1), e = document.createElement('canvas'); e.width = 1920; e.height = 1080; e.getContext('2d').drawImage(d, 0, 0, 1920, 1080);
        const a = cv.getContext('2d').getImageData(0, 0, 1920, 1080).data, b = e.getContext('2d').getImageData(0, 0, 1920, 1080).data;
        let s = 0, n = 0; for (let i = 0; i < a.length; i += 16) { s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; n++; }
        return JSON.stringify({ placas: m.c3d.modelos.length, dif: s / n, mid: m.id }); }"""))
    mid = r["mid"]
    conferir(r["placas"] == 3, f"3 camadas viraram {r['placas']} placas")
    conferir(r["dif"] < 4, f"1º quadro 2D × cena 3D: diferença média {r['dif']:.2f} (< 4)")
    # 2. colocar pela tela e naTela
    caixa = pg.evaluate(f"""async () => {{ await VE3DAPI.colocar({mid}, 'Caixa', {{ x: 30, y: 60, h: 20, z: -0.5 }}, 0);
        await ve3dGarantir(VE.media[{mid}]); return (await VE3DAPI.naTela({mid}, 0)).find(o => o.nome === 'Caixa'); }}""")
    cx = [(caixa["caixa"][0] + caixa["caixa"][2]) / 2, (caixa["caixa"][1] + caixa["caixa"][3]) / 2]
    conferir(abs(cx[0] - 30) < 1.5 and abs(cx[1] - 60) < 1.5 and caixa["z"] == -0.5, f"colocar(x 30, y 60, z -0.5) → centro {cx}, z {caixa['z']}")
    folha = pg.evaluate(f"() => VE3DAPI.folha({mid}, [0, 1, 2], 320)")
    conferir(folha.startswith("data:image/jpeg") and len(folha) > 5000, "folha de quadros numa chamada")
    # 3. tela 3D com mouse
    pg.evaluate(f"async () => {{ const c = VE.clips.find(c => c.m === {mid}); veSeek(c.st + 1); await ve3dTelaAbrir(c); ve3dTelaSelecionar('camera'); }}"); time.sleep(1.5)
    naTela = lambda: next(o for o in pg.evaluate(f"() => VE3DAPI.naTela({mid}, ve3dTelaT(ve3dTelaClipe()))") if o["nome"] == "Titulo")
    t0 = naTela(); bx = pg.evaluate("() => { const b = VE3T.cv.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }")
    x = bx[0] + bx[2] * (t0["caixa"][0] + t0["caixa"][2]) / 200; y = bx[1] + bx[3] * (t0["caixa"][1] + t0["caixa"][3]) / 200
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 100, y - 50, steps=8); pg.mouse.up(); time.sleep(0.4)
    t1 = naTela(); dx = t1["caixa"][0] - t0["caixa"][0]; dy = t1["caixa"][1] - t0["caixa"][1]
    conferir(abs(dx - 100 / bx[2] * 100) < 0.6 and abs(dy + 50 / bx[3] * 100) < 0.6, f"arrastar a placa acompanha o mouse ({dx:.2f}%, {dy:.2f}%)")
    so = pg.evaluate("() => VE3T.so"); outras = pg.evaluate(f"() => JSON.stringify(VE.media[{mid}].c3d.modelos.filter(m => m.nome !== 'Titulo').map(m => m.p))")
    conferir(so == pg.evaluate(f"() => VE.media[{mid}].c3d.modelos.find(m => m.nome === 'Titulo').id"), "o clique selecionou a placa arrastada")
    igual = lambda a, b: all(abs(a["caixa"][i] - b["caixa"][i]) < 0.3 for i in range(4))
    pg.mouse.move(x + 100, y - 50); pg.keyboard.down("Alt"); pg.mouse.wheel(0, 300); pg.keyboard.up("Alt"); time.sleep(0.6)
    t2 = naTela(); conferir(t2["z"] < t1["z"] - 0.1 and igual(t1, t2), f"Alt+rodinha: z {t1['z']} → {t2['z']}, mesma caixa na tela")
    pg.keyboard.press("BracketLeft"); time.sleep(0.6)
    t3 = naTela(); conferir(t3["z"] > t2["z"] and igual(t2, t3), f"[: z {t2['z']} → {t3['z']}, mesma caixa")
    g = pg.evaluate("""() => { const g = VE3T.mapaGeo, l = g.camadas.find(l => l.id === VE3T.so), b = VE3T.mapa.getBoundingClientRect();
        return [b.left + (g.px(l.x0) + g.px(l.x1)) / 2 * b.width / VE3T.mapa.width, b.top + g.py(l.z) * b.height / VE3T.mapa.height]; }""")
    pg.mouse.move(*g); pg.mouse.down(); pg.mouse.move(g[0], g[1] - 20, steps=5); pg.mouse.up(); time.sleep(0.6)
    t4 = naTela(); conferir(t4["z"] < t3["z"] and igual(t3, t4), f"mapa de profundidade ↑: z {t3['z']} → {t4['z']}, mesma caixa")
    conferir(outras == pg.evaluate(f"() => JSON.stringify(VE.media[{mid}].c3d.modelos.filter(m => m.nome !== 'Titulo').map(m => m.p))"), "as outras placas não mexeram")
    for _ in range(4): pg.keyboard.press("Control+z"); time.sleep(0.3)
    t5 = naTela(); conferir(igual(t0, t5) and abs(t5["z"] - t0["z"]) < 1e-3, "Ctrl+Z ×4 volta ao começo")
    pg.evaluate("() => ve3dTelaFechar()")
    # 4. leveza
    med = pg.evaluate(f"""async () => {{ const m = VE.media[{mid}], c = VE.clips.find(c => c.m === {mid}), base = m.c3d.modelos[0];
        m.c3d.modelos.push({{ ...JSON.parse(JSON.stringify(base)), id: 'extra', nome: 'copia' }});
        const objs = (await ve3dGarantir(m)).objs.slice(0, 3).map(o => o.raiz); let t0 = performance.now(); ve3dMudou(m); const rt = await ve3dGarantir(m);
        const acr = performance.now() - t0, reaproveitou = objs.every((r, i) => rt.objs[i].raiz === r);
        for (let i = 0; i < 6; i++) {{ const r = VE3DAPI.nova({{ dur: 1, st: 0 }}); await ve3dGarantir(VE.media[r.midia]); VE.clips.pop(); }}
        return {{ acr, reaproveitou, cenas: VE3D.rt.size }}; }}""")
    conferir(med["reaproveitou"], f"acrescentar placa reaproveita as outras ({med['acr']:.0f} ms)")
    conferir(med["cenas"] <= 4, f"6 cenas novas: {med['cenas']} montadas na memória (≤ 4), um motor só")
print(f"\n{'tudo OK' if not falhas else str(len(falhas)) + ' falha(s)'}")
sys.exit(1 if falhas else 0)
