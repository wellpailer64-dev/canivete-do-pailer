"""Teste dos modelos 3D baixados de banco na Cena 3D do Editor (app em --agente=9333):
.obj + .mtl com textura numa subpasta, .gltf com .bin/.png separados, .glb com Draco, .fbx com caminho de textura de
outro PC (convertido no Blender) e .stl sem textura (Blender). Confere em cada um a textura xadrez vermelho/verde no
quadro, depois aparência (cor única, imagem com projeção de caixa no STL), duplicar/renomear/zerar/esconder/apagar na
tela 3D, arrastar arquivo (veDropFiles) e o arquivo da exportação (ProRes). Modelos de teste gerados pelo Blender:
  blender -b --factory-startup -P D:/kanivete_testes/scripts/gerar_modelos3d.py   (pasta D:/kanivete_testes/modelos3d)
  blender -b --factory-startup -P D:/kanivete_testes/scripts/gerar_lata3d.py      (lata com 2 partes, .obj sem o .mtl)
Quadros em D:/kanivete_testes/editor3d/modelos_*.png."""
import base64, io, json, os, sys
sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image
from playwright.sync_api import sync_playwright

M = r"D:/kanivete_testes/modelos3d"
SAI = r"D:\kanivete_testes\editor3d"; os.makedirs(SAI, exist_ok=True)
falhas = []


def ok(c, m):
    print(("  ok  " if c else "  FALHOU  ") + m)
    if not c: falhas.append(m)


def cores(pg, nome):
    url = pg.evaluate("(async () => { await ve3dGarantir(ve3dAlvo()); return VE3DAPI.quadro(0, null, 640); })()")
    im = Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGBA"); im.save(os.path.join(SAI, f"modelos_{nome}.png"))
    px = [im.getpixel((x, y)) for x in range(0, im.width, 2) for y in range(0, im.height, 2)]
    op = [c for c in px if c[3] > 240]
    return {"opacos": len(op), "vermelho": sum(1 for c in op if c[0] > c[1] + 60 and c[0] > c[2] + 60),
            "verde": sum(1 for c in op if c[1] > c[0] + 60 and c[1] > c[2] + 60)}


with sync_playwright() as p:
    pg = next(x for c in p.chromium.connect_over_cdp("http://127.0.0.1:9333").contexts for x in c.pages if "index.html" in x.url)
    erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_3d_preparar)", timeout=60000)
    pg.evaluate("switchTool('video-cutter')")
    # 1) cada formato: textura xadrez no quadro
    for nome, arq in [("obj", "obj/cubo.obj"), ("gltf", "gltf/cubo.gltf"), ("draco", "draco/cubo_draco.glb"), ("fbx", "fbx/cubo.fbx")]:
        pg.evaluate("n => VE3DAPI.nova({ dur: 1, nome: n })", nome)
        r = pg.evaluate("a => VE3DAPI.modelo({ arquivo: a, ry: 30, rx: 20 }).then(r => r, e => ({ erro: e.message }))", f"{M}/{arq}")
        ok("erro" not in r, f"{nome}: entrou na cena ({r})")
        c = cores(pg, nome)
        ok(c["vermelho"] > 200 and c["verde"] > 200, f"{nome}: textura xadrez aparece ({c})")
    # 1b) .obj como o do tênis Air Jordan (Blender/Substance): arestas soltas "l" no mesmo objeto das faces (o OBJLoader
    # virava tudo em fios), nome com espaço e mapa NORMAL em map_Bump, rugosidade em map_Ns e metal em refl
    import shutil
    dl = f"{M}/linhas"; os.makedirs(dl, exist_ok=True)
    src = open(f"{M}/obj/cubo.obj", encoding="utf-8").read().replace("mtllib cubo.mtl", "mtllib cubo com espaco.mtl")
    open(f"{dl}/cubo com espaco.obj", "w", encoding="utf-8").write(src + "l 1 2\nl 2 3\n")
    for k in ("BaseColor", "Normal", "Roughness", "Metallic"): shutil.copy(f"{M}/obj/textures/xadrez.png", f"{dl}/cubo com espaco_{k}.png")
    open(f"{dl}/cubo com espaco.mtl", "w", encoding="utf-8").write("newmtl xadrez\nNs 250\nKd 0.8 0.8 0.8\nmap_Bump cubo com espaco_Normal.png\n"
        "map_Kd cubo com espaco_BaseColor.png\nmap_Ns cubo com espaco_Roughness.png\nrefl cubo com espaco_Metallic.png\n")
    pg.evaluate("VE3DAPI.nova({ dur: 1, nome: 'linhas' })")
    r = pg.evaluate("a => VE3DAPI.modelo({ arquivo: a, ry: 30, rx: 20 }).then(r => r, e => ({ erro: e.message }))", f"{dl}/cubo com espaco.obj")
    mats = pg.evaluate("""() => { const o = VE3D.rt.get(ve3dAlvo().id).rt.objs[0], ms = []; let fios = 0;
        o.raiz.traverse(x => { if (x.isLine) fios++; if (x.isMesh) [].concat(x.material).forEach(m => ms.push({ map: !!(m.map && m.map.image), normal: !!m.normalMap, bump: !!m.bumpMap,
            rug: !!m.roughnessMap, metal: !!m.metalnessMap, cor: m.color.getHexString() })); }); return { ms, fios }; }""")
    ok(len(mats["ms"]) == 1 and mats["fios"] == 0, f"arestas soltas não viram fios: superfície inteira ({mats})")
    m0 = (mats["ms"] or [{}])[0]
    ok(m0.get("map") and m0.get("normal") and not m0.get("bump") and m0.get("rug") and m0.get("metal") and m0.get("cor") == "ffffff",
       f"textura carregada antes de desenhar; Normal em map_Bump vira normal; rugosidade e metal ({m0})")
    # 2) STL (sem textura) + aparência: imagem com projeção de caixa; depois cor única no .obj
    pg.evaluate("VE3DAPI.nova({ dur: 1, nome: 'stl' })")
    r = pg.evaluate("a => VE3DAPI.modelo({ arquivo: a, ry: 30, rx: 20 }).then(r => r, e => ({ erro: e.message }))", f"{M}/stl/cubo.stl")
    ok("erro" not in r, f"stl: entrou (Blender) ({r})")
    c = cores(pg, "stl_cinza"); ok(c["opacos"] > 500 and c["vermelho"] < 50, f"stl: cinza, sem textura ({c})")
    pg.evaluate("([id, t]) => VE3DAPI.aparencia(id, { textura: t, texRep: 1 })", [r.get("id"), f"{M}/obj/textures/xadrez.png"])
    c = cores(pg, "stl_textura"); ok(c["vermelho"] > 200 and c["verde"] > 200, f"stl: imagem aplicada por lado ({c})")
    pg.evaluate("([id]) => VE3DAPI.aparencia(id, { textura: null, cor: '#2050ff', material: 'metal' })", [r.get("id")])
    c = cores(pg, "stl_cor"); ok(c["vermelho"] < 50 and c["verde"] < 50, f"stl: cor única azul ({c})")
    # 2b) partes: lata (.obj sem o .mtl) com "corpo" e "tampa" — imagem só no corpo, tampa continua cinza
    pg.evaluate("VE3DAPI.nova({ dur: 1, nome: 'lata' })")
    rl = pg.evaluate("a => VE3DAPI.modelo({ arquivo: a, rx: 25 }).then(r => r, e => ({ erro: e.message }))", f"{M}/partes/lata.obj")
    ok("erro" not in rl, f"lata: entrou ({rl})")
    pr = pg.evaluate("a => window.pywebview.api.ve_3d_preparar(a)", f"{M}/partes/lata.obj")
    ok(pr.get("faltando") == ["lata.mtl"], f"avisa o .mtl que não veio ({pr.get('faltando')})")
    partes = pg.evaluate("id => VE3DAPI.partes(id)", rl.get("id"))
    ok(sorted(partes) == ["corpo", "tampa"], f"partes do modelo ({partes})")
    pg.evaluate("([id, t]) => VE3DAPI.aparencia(id, { parte: 'corpo', textura: t })", [rl.get("id"), f"{M}/obj/textures/xadrez.png"])
    pg.evaluate("([id]) => VE3DAPI.aparencia(id, { parte: 'tampa', cor: '#ffd000', material: 'metal' })", [rl.get("id")])
    c = cores(pg, "lata")
    amarelo = pg.evaluate("""(async () => { await ve3dGarantir(ve3dAlvo()); const u = VE3DAPI.quadro(0, null, 640); const i = new Image(); i.src = u; await i.decode();
        const cv = document.createElement('canvas'); cv.width = i.width; cv.height = i.height; const x = cv.getContext('2d'); x.drawImage(i, 0, 0);
        const d = x.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let k = 0; k < d.length; k += 8) if (d[k + 3] > 240 && d[k] > 150 && d[k + 1] > 110 && d[k + 2] < 80 && d[k] - d[k + 1] < 90) n++; return n; })()""")
    ok(c["vermelho"] > 200 and c["verde"] > 200 and amarelo > 100, f"imagem no corpo e tampa amarela ({c}, amarelo {amarelo})")
    # 3) ferramentas de edição (API + tela 3D com teclado)
    mid = pg.evaluate("ve3dAlvo().id")
    d = pg.evaluate("id => VE3DAPI.duplicar(id)", rl.get("id"))
    ok(pg.evaluate("ve3dAlvo().c3d.modelos.length") == 2, "duplicar: 2 modelos")
    ok(pg.evaluate("id => VE3DAPI.renomear(id, 'Peça B')", d["id"]) == "Peça B", "renomear")
    pg.evaluate("id => { VE3DAPI.definir(id, { x: 1.5, y: 0.7, ry: 45 }); VE3DAPI.zerar(id, { chao: true }); }", d["id"])
    p2 = pg.evaluate("id => VE3DAPI.info().modelos.find(m => m.id === id).p", d["id"])
    ok(p2["y"] == 0 and p2["x"] == 1.5, f"apoiar no chão mantém x ({p2})")
    pg.evaluate("ve3dTelaAbrir(VE.clips.find(c => veMediaOf(c) === ve3dAlvo()))")
    pg.wait_for_function("VE3T.el && !VE3T.el.hidden && !!VE3T.rt", timeout=30000)
    pg.evaluate("id => ve3dTelaSelecionar(id)", d["id"])
    pg.keyboard.press("h")
    ok(pg.evaluate("id => ve3dAlvo().c3d.modelos.find(m => m.id === id).p.visivel", d["id"]) == 0, "H esconde")
    pg.keyboard.press("h")
    n3d = "VE.media[VE3T.mid].c3d.modelos.length"   # a cena da tela (depois de desfazer, a seleção da timeline muda)
    pg.keyboard.press("Control+d")
    ok(pg.evaluate(n3d) == 3, "Ctrl+D duplica na tela")
    pg.keyboard.press("Delete")
    ok(pg.evaluate(n3d) == 2, "Delete tira o selecionado")
    pg.keyboard.press("f")
    ok(pg.evaluate("VE3T.livre"), "F enquadra (vista livre)")
    esp0 = pg.evaluate("VE3T.tc.space")
    pg.keyboard.press("q")
    ok(pg.evaluate("VE3T.tc.space") != esp0, f"Q troca o eixo (objeto/mundo) ({esp0} → {pg.evaluate('VE3T.tc.space')})")
    pg.keyboard.press("Control+z")
    ok(pg.evaluate(n3d) == 3, "Ctrl+Z desfaz o Delete")
    vis = pg.evaluate("""() => { const b = VE3T.el.querySelector('[data-3tolho]'), r = b && b.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; }""")
    ok(vis, "olho de esconder visível na lista")
    pg.screenshot(path=os.path.join(SAI, "modelos_tela.png"))
    pg.keyboard.press("Escape")
    # 4) arrastar um arquivo 3D para o editor (o caminho chega pelo Python → veDropFiles)
    n0 = pg.evaluate("ve3dMidias().length")
    pg.evaluate("VE.sel = -1; veSelDefinir && veSelDefinir([], null)")
    pg.evaluate("p => veDropFiles([{ path: p, pasta: false }])", f"{M}/gltf/cubo.gltf")
    pg.wait_for_function(f"ve3dMidias().length > {n0} && ve3dMidias().at(-1).c3d.modelos.length === 1", timeout=60000)
    ok(True, "soltar .gltf cria uma cena nova com o modelo")
    # 5) arquivo da exportação
    rr = pg.evaluate("VE3DAPI.renderizar()")
    ok(bool(rr.get("ok") and rr.get("path")), f"cena renderizada para a exportação ({rr})")
    ok(not erros, f"sem erros de JS ({erros[:2]})")
print(json.dumps({"falhas": falhas}, ensure_ascii=False))
sys.exit(1 if falhas else 0)
