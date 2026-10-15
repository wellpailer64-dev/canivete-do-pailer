# Roda DENTRO do Blender: blender -b --factory-startup -P Functions/blender_estudio.py -- spec.json
# Foto herói de produto (estudo 2026-10-15, diferença para os renders de agência): tudo DENTRO do 3D —
#   material de verdade (soft-touch fosco, gel translúcido com bolhas, tampa fosca), rótulo como película com a arte
#   em textura (nítida, sem serrilhado do 2D), chanfro em todas as quinas, cenário curvo na cor da marca (a cor rebate
#   no produto), softboxes compridos (brilhos longos), HDRI de estúdio opcional, AgX (brilho que "rola" como câmera),
#   câmera com inclinação (dutch) e desfoque de profundidade.
# spec: {produto: pote|bastao, saida, largura, altura, amostras, cores: {corpo, tampa, fundo, gel}, material:
#        softtouch|gel, rotulo: png, camera: {az, el, roll, lente, fstop, folga, alvo_z}, hdri, hdri_forca, luz,
#        exposicao, look, ranhuras}
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector, Quaternion

spec = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
saida = spec["saida"]; os.makedirs(saida, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
cores = {"corpo": "#1f5c34", "tampa": "#1f5c34", "fundo": "#5fd93a", "gel": "#9fe3cf", **spec.get("cores", {})}


def lin(h):   # #hex sRGB → RGB linear (o Blender pinta em linear)
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1,)


def arredondar(pts, raio, n=7):
    """perfil (r, z) com cada quina interna trocada por um arco (chanfro de verdade, como produto injetado)"""
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[i + 1])
        a, b = (p0 - p1), (p2 - p1)
        rr = min(raio, a.length * 0.45, b.length * 0.45)
        if rr < 1e-4 or p1.x < 0.01:
            out.append(pts[i]); continue
        a.normalize(); b.normalize()
        q0, q2 = p1 + a * rr, p1 + b * rr
        for k in range(n + 1):   # Bézier quadrática q0 → p1 → q2
            t = k / n
            out.append(tuple((1 - t) ** 2 * q0 + 2 * (1 - t) * t * p1 + t * t * q2))
    out.append(pts[-1])
    return out


_EMB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "embalagens.json")
PROD = {k: {"sx": v["sx"], "sy": v["sy"], "rotulo": v["rotulo"], "partes": [tuple(p[:1]) + ([tuple(x) for x in p[1]], p[2]) for p in v["partes"]]}
        for k, v in json.load(open(_EMB, encoding="utf-8")).items() if not k.startswith("_")} if os.path.exists(_EMB) else None
PROD = PROD or {
    "pote": {"sx": 1.0, "sy": 1.0, "partes": [
        ("corpo", [(0.001, 0), (0.95, 0), (1.0, 0.06), (1.0, 0.98), (0.96, 0.98), (0.001, 0.98)], 0.035),
        ("tampa", [(0.001, 0.97), (1.03, 0.97), (1.03, 1.39), (0.001, 1.39)], 0.06)],
        "rotulo": {"z": [0.13, 0.88], "u": [0.16, 0.84]}},
    "bastao": {"sx": 0.62, "sy": 0.36, "partes": [
        ("base", [(0.001, 0), (0.97, 0), (0.97, 0.16), (0.001, 0.16)], 0.03),
        ("corpo", [(0.001, 0.15), (1.0, 0.15), (1.0, 2.0), (0.001, 2.0)], 0.05),
        ("tampa", [(0.001, 1.99), (1.025, 1.99), (1.025, 2.62), (0.93, 2.86), (0.6, 2.93), (0.001, 2.94)], 0.08)],
        "rotulo": {"z": [0.3, 1.86], "u": [0.29, 0.71]}},
}
P = PROD[spec.get("produto", "pote")]
ALT = max(z for _, perf, _ in P["partes"] for _, z in perf)
SEG = 256


def revolver(nome, perfil, u_faixa=(0.0, 1.0), desloc=0.0, uvf=None):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
    u0, u1 = u_faixa; n = max(8, int(SEG * (u1 - u0))); fechado = (u1 - u0) >= 0.999
    aneis = []
    for r, z in perfil:
        anel = []
        for i in range(n + (0 if fechado else 1)):
            u = u0 + (u1 - u0) * i / n; a = 2 * math.pi * u - math.pi
            rr = r + desloc
            anel.append(bm.verts.new((rr * P["sx"] * math.sin(a), -rr * P["sy"] * math.cos(a), z)))
        aneis.append(anel)
    m = len(aneis[0])
    for j in range(len(perfil) - 1):
        for i in range(n if fechado else n):
            i2 = (i + 1) % m
            f = bm.faces.new((aneis[j][i], aneis[j][i2], aneis[j + 1][i2], aneis[j + 1][i])); f.smooth = True
            for lp, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                u = u0 + (u1 - u0) * ii / n; v = perfil[jj][1]
                lp[uvl].uv = uvf(u, v) if uvf else (u, v / ALT)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(nome, me); sc.collection.objects.link(ob)
    return ob


def principled(nome, **kw):
    m = bpy.data.materials.new(nome); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    for k, v in kw.items():
        if k in b.inputs: b.inputs[k].default_value = v
    return m, b


def ranhuras(m, b, v_max, freq=220, forca=0.25):
    """ranhuras verticais da tampa (só na lateral: v < v_max) por relevo — o detalhe que segura a mão"""
    N = m.node_tree.nodes; L = m.node_tree.links
    tc = N.new("ShaderNodeTexCoord"); sp = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["UV"], sp.inputs[0])
    mu = N.new("ShaderNodeMath"); mu.operation = "MULTIPLY"; mu.inputs[1].default_value = freq * 2 * math.pi; L.new(sp.outputs[0], mu.inputs[0])
    si = N.new("ShaderNodeMath"); si.operation = "SINE"; L.new(mu.outputs[0], si.inputs[0])
    lt = N.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = v_max; L.new(sp.outputs[1], lt.inputs[0])
    mm = N.new("ShaderNodeMath"); mm.operation = "MULTIPLY"; L.new(si.outputs[0], mm.inputs[0]); L.new(lt.outputs[0], mm.inputs[1])
    bp = N.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = forca; bp.inputs["Distance"].default_value = 0.01
    L.new(mm.outputs[0], bp.inputs["Height"]); L.new(bp.outputs["Normal"], b.inputs["Normal"])


def gel(nome, cor, aspereza=0.06, densidade=1.2):
    m, b = principled(nome, **{"Base Color": lin(cor), "Transmission Weight": 1.0, "Roughness": aspereza, "IOR": 1.42})
    N = m.node_tree.nodes; va = N.new("ShaderNodeVolumeAbsorption")
    va.inputs["Color"].default_value = lin(cor); va.inputs["Density"].default_value = densidade
    m.node_tree.links.new(va.outputs[0], N["Material Output"].inputs["Volume"])
    return m


# materiais: os mesmos campos da Cena 3D (frontend/materiais.json, Principled em português) — params() é a mesma
# conta do ve3dEmbParams do JS (salvo por parte, ou o acabamento antigo material + cores)
_MATJ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "materiais.json")
_MAT = json.load(open(_MATJ, encoding="utf-8")) if os.path.exists(_MATJ) else {"_campos": {}}


def params(fo, parte):
    base = dict(_MAT.get("_campos", {}))
    salvo = (fo.get("materiais") or {}).get(parte)
    if salvo:
        return {**base, **salvo}
    c = {"corpo": "#1d4a2a", "tampa": "#1d4a2a", "base": "#2f9a78", "gel": "#8fdcc4", **(fo.get("cores") or {})}
    gel_ = fo.get("material") == "gel"
    lib = ("brilhante" if parte == "base" else "gel_fosco" if parte == "tampa" else "gel") if gel_ else "brilhante" if fo.get("material") == "brilho" else "softtouch"
    p = {**base, **_MAT.get(lib, {}), "cor": c["gel"] if gel_ and parte != "base" else c.get(parte, c["corpo"])}
    p.pop("nome", None)
    if not gel_ and parte == "tampa":
        p["rugosidade"] = min(float(p["rugosidade"]), 0.42); p["relevo"] = "ranhuras"
    return p


def material_de(nome, p, perfil):
    f = lambda k, d=0.0: float(p.get(k) if p.get(k) is not None else d)
    m, b = principled(nome, **{"Base Color": lin(p.get("cor") or "#d9d4cc"), "Metallic": f("metalico"), "Roughness": f("rugosidade", 0.5),
                               "Specular IOR Level": f("especular", 0.5), "Transmission Weight": f("transmissao"), "IOR": f("ior", 1.45),
                               "Coat Weight": f("verniz"), "Coat Roughness": f("verniz_rug", 0.1), "Sheen Weight": f("sheen"),
                               "Sheen Tint": lin(p.get("cor") or "#ffffff"), "Emission Color": lin(p.get("emissao") or "#ffffff"),
                               "Emission Strength": f("emissao_forca")})
    N, L = m.node_tree.nodes, m.node_tree.links
    if f("transmissao") > 0.01 and f("absorcao") > 0.001:   # a cor tinge por dentro (gel)
        va = N.new("ShaderNodeVolumeAbsorption"); va.inputs["Color"].default_value = lin(p.get("cor") or "#ffffff"); va.inputs["Density"].default_value = f("absorcao")
        L.new(va.outputs[0], N["Material Output"].inputs["Volume"])
    if p.get("textura") and os.path.exists(p["textura"]):   # estampa no lugar da cor, repetida
        tx = N.new("ShaderNodeTexImage"); tx.image = bpy.data.images.load(p["textura"]); tx.interpolation = "Cubic"
        mp = N.new("ShaderNodeMapping"); tc = N.new("ShaderNodeTexCoord"); k = f("textura_escala", 1)
        mp.inputs["Scale"].default_value = (k, k, 1); L.new(tc.outputs["UV"], mp.inputs["Vector"]); L.new(mp.outputs[0], tx.inputs["Vector"])
        L.new(tx.outputs["Color"], b.inputs["Base Color"])
    if p.get("relevo") == "ranhuras":
        zt = max(z for _, z in perfil); ranhuras(m, b, (zt - 0.05) / ALT, forca=f("relevo_forca", 0.25))
    elif p.get("relevo") == "imagem" and p.get("relevo_img") and os.path.exists(p["relevo_img"]):
        tx = N.new("ShaderNodeTexImage"); tx.image = bpy.data.images.load(p["relevo_img"]); tx.image.colorspace_settings.name = "Non-Color"
        bp = N.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = f("relevo_forca", 0.25); bp.inputs["Distance"].default_value = 0.02
        L.new(tx.outputs["Color"], bp.inputs["Height"]); L.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


def construir(fo):
  """uma embalagem (fo: produto, material, cores, rotulo, bolhas) na origem; devolve os objetos criados"""
  global P, ALT
  P = PROD[fo.get("produto", "pote")]; ALT = max(z for _, perf, _ in P["partes"] for _, z in perf)
  cores = {"corpo": "#1d4a2a", "tampa": "#1d4a2a", "base": "#2f9a78", "gel": "#8fdcc4", **(fo.get("cores") or {})}
  mat = fo.get("material", "softtouch"); antes = set(sc.objects)
  for nome, perfil, raio in P["partes"]:
    ob = revolver(nome, arredondar(perfil, raio))
    m = material_de(nome, params(fo, nome), perfil)
    ob.data.materials.append(m)

  # bolhas no translúcido (ar dentro do gel: IOR 1 → aparecem como gotinhas, como no bastão de gel de verdade)
  pc = params(fo, "corpo")
  if float(pc.get("transmissao") or 0) > 0.01 and pc.get("bolhas") and fo.get("bolhas", True):
    random.seed(7); bm = bmesh.new()
    zc = [p for p in P["partes"] if p[0] == "corpo"][0][1]; z0, z1 = zc[0][1] + 0.12, zc[-1][1] - 0.12
    for _ in range(int(spec.get("n_bolhas", 260))):
        a = random.uniform(0, 2 * math.pi); rr = math.sqrt(random.random()) * 0.88; z = random.uniform(z0, z1)
        s = random.uniform(0.006, 0.028)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=s, matrix=__import__("mathutils").Matrix.Translation(
            (rr * P["sx"] * math.sin(a), -rr * P["sy"] * math.cos(a), z)))
    me = bpy.data.meshes.new("bolhas"); bm.to_mesh(me); bm.free()
    for f in me.polygons: f.use_smooth = True
    bo = bpy.data.objects.new("bolhas", me); sc.collection.objects.link(bo)
    m, _ = principled("ar", **{"Base Color": (1, 1, 1, 1), "Transmission Weight": 1.0, "Roughness": 0.0, "IOR": 1.0 / 1.42})
    me.materials.append(m)

  # rótulo: película fina por cima do corpo, com a arte encaixada (contain, centralizada, sem distorcer)
  if fo.get("rotulo") and os.path.exists(fo["rotulo"]):
    R = P["rotulo"]; img = bpy.data.images.load(fo["rotulo"]); aw, ah = img.size
    a_, b_ = P["sx"], P["sy"]; perim = math.pi * (3 * (a_ + b_) - math.sqrt((3 * a_ + b_) * (a_ + 3 * b_)))
    u0, u1 = R["u"]; z0, z1 = R["z"]; rl, rh = perim * (u1 - u0), z1 - z0
    k = min(rl / aw, rh / ah); fl, fh = aw * k / rl, ah * k / rh
    uvf = lambda u, v: (((u - (u0 + u1) / 2) / (u1 - u0)) / fl + 0.5, ((v - z0) / rh - 0.5) / fh + 0.5)
    corpo_perf = [p for p in P["partes"] if p[0] == "corpo"][0][1]
    rmax = max(r for r, _ in corpo_perf)
    perf_rot = [(rmax, z0 + (z1 - z0) * t / 40) for t in range(41)]
    ro = revolver("rotulo", perf_rot, (u0, u1), desloc=0.004, uvf=uvf)
    m = bpy.data.materials.new("rotulo"); m.use_nodes = True; N = m.node_tree.nodes; Lk = m.node_tree.links
    b = N["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.38; b.inputs["Coat Weight"].default_value = 0.2
    tx = N.new("ShaderNodeTexImage"); tx.image = img; tx.extension = "CLIP"; tx.interpolation = "Cubic"
    Lk.new(tx.outputs["Color"], b.inputs["Base Color"]); Lk.new(tx.outputs["Alpha"], b.inputs["Alpha"])
    m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    ro.data.materials.append(m)
    for f in ro.data.polygons: f.use_smooth = True
  return [o for o in sc.objects if o not in antes]


# ── as embalagens: uma (spec simples) ou a cena inteira da Cena 3D (objetos com a matriz de cada um) ──
from mathutils import Matrix
objetos = spec.get("objetos") or [{"produto": spec.get("produto", "pote"), "material": spec.get("material", "softtouch"),
                                   "cores": spec.get("cores"), "rotulo": spec.get("rotulo"), "bolhas": spec.get("bolhas", True)}]
todos = []; PAIS = {}; LUZES = []   # vídeo: quem muda a cada quadro
for i, fo in enumerate(objetos):
    novos = construir(fo); todos += novos
    if fo.get("matriz"):   # posição/giro/escala exatos da Cena 3D (já no espaço do Blender: Z para cima)
        pai = bpy.data.objects.new(f"embalagem_{i}", None); sc.collection.objects.link(pai); PAIS[i] = pai
        pai.matrix_world = Matrix([fo["matriz"][r * 4:r * 4 + 4] for r in range(4)])
        for o in novos: o.parent = pai
bpy.context.view_layer.update()
cantos = [o.matrix_world @ Vector(c) for o in todos if o.type == "MESH" for c in o.bound_box]
bmin = Vector((min(c.x for c in cantos), min(c.y for c in cantos), min(c.z for c in cantos)))
bmax = Vector((max(c.x for c in cantos), max(c.y for c in cantos), max(c.z for c in cantos)))
ALT = max(bmax.z - bmin.z, 0.2)                     # tamanho do conjunto: escala da luz, do cenário e da câmera automática
CENTRO = (bmin + bmax) / 2
C = spec.get("camera", {})
if spec.get("camera_matriz"):
    _cm = Matrix([spec["camera_matriz"][r * 4:r * 4 + 4] for r in range(4)]); _cl = _cm.to_translation()
    CAM_AZ = math.degrees(math.atan2(_cl.x - CENTRO.x, -(_cl.y - CENTRO.y)))
else:
    CAM_AZ = float(C.get("az", -25))

# cenário curvo (ciclorama) na cor da marca: o produto "mora" na cor
def ciclorama(cor, y_fundo=2.6, raio=2.5, larg=600):   # bem largo: a câmera pode girar no vídeo sem ver a ponta da parede
    bm = bmesh.new(); yc = y_fundo - raio; pts = [(-300, 0)]   # chão → curva (centro em yc, raio) → parede
    for kk in range(25):
        t = -math.pi / 2 + (math.pi / 2) * kk / 24
        pts.append((yc + raio * math.cos(t), raio + raio * math.sin(t)))
    pts.append((y_fundo, 300))
    linhas = []
    for x in (-larg / 2, larg / 2):
        linhas.append([bm.verts.new((x, y, z)) for y, z in pts])
    for i in range(len(pts) - 1):
        bm.faces.new((linhas[0][i], linhas[1][i], linhas[1][i + 1], linhas[0][i + 1]))
    me = bpy.data.meshes.new("ciclorama"); bm.to_mesh(me); bm.free()
    for f in me.polygons: f.use_smooth = True
    ob = bpy.data.objects.new("ciclorama", me); sc.collection.objects.link(ob)
    ob.rotation_euler = (0, 0, math.radians(CAM_AZ)); ob.location = (CENTRO.x, CENTRO.y, bmin.z)   # a parede fica atrás, vista da câmera
    m, _ = principled("fundo", **{"Base Color": lin(cor), "Roughness": 0.85, "Specular IOR Level": 0.2}); me.materials.append(m)
if spec.get("cenario", True):
    ciclorama(cores["fundo"], y_fundo=float(spec.get("fundo_dist", 2.6)) * ALT)
else:   # sem cenário: fundo transparente e só a sombra no chão
    bpy.ops.mesh.primitive_plane_add(size=400, location=(CENTRO.x, CENTRO.y, bmin.z)); bpy.context.object.is_shadow_catcher = True

# ── luz: softboxes compridos (brilhos longos) + teto + HDRI de estúdio opcional ──
alvo = Vector((CENTRO.x, CENTRO.y, bmin.z + ALT * float(C.get("alvo_z", 0.5))))
k = ALT / 1.4; E = float(spec.get("luz", 1.0))
def caixa(nome, az_g, el_g, d, lx, ly, w):
    l = bpy.data.lights.new(nome, "AREA"); l.shape = "RECTANGLE"; l.size = lx; l.size_y = ly; l.energy = w
    o = bpy.data.objects.new(nome, l); sc.collection.objects.link(o)
    a, e = math.radians(az_g + CAM_AZ + 25), math.radians(el_g)   # a luz acompanha o lado de onde a câmera olha
    o.location = alvo + Vector((d * math.cos(e) * math.sin(a), -d * math.cos(e) * math.cos(a), d * math.sin(e)))
    o.rotation_euler = (alvo - o.location).to_track_quat("-Z", "Y").to_euler()
LC = spec.get("luz_cena")
if spec.get("luzes"):   # as luzes da Cena 3D, uma a uma (sem estúdio escondido)
    for i, l in enumerate(spec["luzes"]):
        tp = {"softbox": "AREA", "spot": "SPOT", "ponto": "POINT", "sol": "SUN"}.get(l.get("tipo"), "AREA")
        ld = bpy.data.lights.new(f"luz_{i}_{l.get('tipo')}", tp); ld.energy = float(l.get("energia", 500)); ld.color = tuple(l.get("cor", (1, 1, 1)))
        if tp == "AREA": ld.shape = "RECTANGLE"; ld.size = float(l.get("largura", 1)); ld.size_y = float(l.get("altura", 3))
        elif tp == "SPOT": ld.spot_size = math.radians(float(l.get("angulo", 35))); ld.spot_blend = 0.35; ld.shadow_soft_size = 0.15
        elif tp == "POINT": ld.shadow_soft_size = 0.25
        else: ld.angle = math.radians(3)
        ob = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(ob); LUZES.append(ob)
        ob.location = Vector(l["pos"]); ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = (Vector(l["mira"]) - ob.location).to_track_quat("-Z", "Y") @ Quaternion((0, 0, 1), math.radians(-float(l.get("giro", 0))))
elif LC:   # a Luz da Cena 3D: direção/altura/intensidade/cor = softbox principal (no mundo, como a prévia); ambiente =
         # preenchimento + teto; contraluz = recorte; sombra = contraste (menos preenchimento)
    ki, ka, ks, kc = float(LC.get("intensidade", 2.6)) / 2.6, float(LC.get("ambiente", 0.8)) / 0.8, float(LC.get("sombra", 0.5)), float(LC.get("contra", 0))
    h = LC.get("cor", "#ffffff").lstrip("#"); cor_l = tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    caixa("chave", float(LC.get("az", -40)) - CAM_AZ - 25, max(5.0, min(80.0, float(LC.get("el", 50)) * 0.55)), 4.5 * k, 0.9 * k, 5.5 * k, 520 * E * ki * k * k)
    bpy.data.lights["chave"].color = cor_l
    caixa("recorte", 128, 22, 4.5 * k, 0.7 * k, 5.0 * k, 650 * E * (0.7 + kc * 0.4) * k * k)
    caixa("teto", 0, 82, 5.0 * k, 4.0 * k, 4.0 * k, 160 * E * ka * k * k)
    caixa("preench", 35, 5, 6.0 * k, 3.0 * k, 3.0 * k, 60 * E * ka * (1.4 - ks * 0.8) * k * k)
else:
    caixa("chave", -58, 18, 4.5 * k, 0.9 * k, 5.5 * k, 520 * E * k * k)
    caixa("recorte", 128, 22, 4.5 * k, 0.7 * k, 5.0 * k, 650 * E * k * k)
    caixa("teto", 0, 82, 5.0 * k, 4.0 * k, 4.0 * k, 160 * E * k * k)
    caixa("preench", 35, 5, 6.0 * k, 3.0 * k, 3.0 * k, 60 * E * k * k)
w = bpy.data.worlds.new("mundo"); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes["Background"]
if spec.get("hdri") and os.path.exists(spec["hdri"]):
    env = w.node_tree.nodes.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(spec["hdri"])
    mp = w.node_tree.nodes.new("ShaderNodeMapping"); tc = w.node_tree.nodes.new("ShaderNodeTexCoord")
    mp.inputs["Rotation"].default_value[2] = math.radians(float(spec.get("hdri_giro", 0)))
    w.node_tree.links.new(tc.outputs["Generated"], mp.inputs["Vector"]); w.node_tree.links.new(mp.outputs[0], env.inputs[0])
    w.node_tree.links.new(env.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = float(spec.get("hdri_forca", 0.6)) * (0.3 if spec.get("luzes") else 1)
else:
    bg.inputs[0].default_value = (0.5, 0.5, 0.5, 1); bg.inputs[1].default_value = 0.2

# ── câmera: ângulo, inclinação (dutch), lente, desfoque ──
C = spec.get("camera", {})
cd = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
cd.lens = float(C.get("lente", 85)); cd.sensor_fit = "VERTICAL"; cd.sensor_height = 24
W, H = int(spec.get("largura", 1600)), int(spec.get("altura", 1600))
fov = 2 * math.atan(12 / cd.lens); larg = max(bmax.x - bmin.x, bmax.y - bmin.y)
tam = max(ALT, larg * H / W)
dist = float(C.get("dist") or (tam * float(C.get("folga", 1.5)) / 2) / math.tan(fov / 2) + larg / 2)
az, el = math.radians(float(C.get("az", -25))), math.radians(float(C.get("el", 8)))
cam.location = alvo + Vector((dist * math.cos(el) * math.sin(az), -dist * math.cos(el) * math.cos(az), dist * math.sin(el)))
q = (alvo - cam.location).to_track_quat("-Z", "Y") @ Quaternion((0, 0, 1), math.radians(float(C.get("roll", 0))))
cam.rotation_mode = "QUATERNION"; cam.rotation_quaternion = q
if spec.get("camera_matriz"):   # a câmera da Cena 3D, exata (posição, direção, lente)
    cam.matrix_world = _cm
    if spec.get("fov"): cd.lens = 12 / math.tan(math.radians(float(spec["fov"])) / 2)
cd.shift_x = float(C.get("deslocar_x", 0)); cd.shift_y = float(C.get("deslocar_y", 0))   # produto no terço (espaço para texto)
bpy.context.view_layer.update()   # matrix_world da câmera em dia antes de medir o foco
if C.get("fstop"):
    cd.dof.use_dof = True; cd.dof.aperture_fstop = float(C["fstop"])
    cd.dof.focus_distance = float(C.get("foco") or (alvo - cam.matrix_world.to_translation()).length - larg * 0.25)

# ── render ──
sc.render.engine = "CYCLES"
try:
    pr = bpy.context.preferences.addons["cycles"].preferences
    for tipo in ("OPTIX", "CUDA"):
        try:
            pr.compute_device_type = tipo; pr.get_devices()
            if any(d.type == tipo for d in pr.devices):
                for d in pr.devices: d.use = d.type == tipo
                break
        except Exception:
            pass
    sc.cycles.device = "GPU"
    print("KANIVETE: placa " + pr.compute_device_type + ": " + ", ".join(d.name for d in pr.devices if d.use), flush=True)
except Exception:
    pass
cy = sc.cycles
cy.samples = int(spec.get("amostras", 192)); cy.use_denoising = True; cy.use_adaptive_sampling = True; cy.adaptive_threshold = float(spec.get("limiar", 0.004)); cy.denoising_prefilter = "ACCURATE"
pt = int(spec.get("pulos_transmissao", 16))   # quantas vezes a luz atravessa superfícies transparentes (gel, bolhas)
cy.max_bounces = max(8, pt); cy.transmission_bounces = pt; cy.transparent_max_bounces = pt; cy.glossy_bounces = 8
cy.caustics_reflective = False; cy.caustics_refractive = False; cy.blur_glossy = 1.0
if spec.get("quadros"):   # vídeo: a cena (BVH, texturas) fica na placa entre um quadro e outro; ruído limpo na GPU
    sc.render.use_persistent_data = True
    try:
        if pr.compute_device_type == "OPTIX": cy.denoiser = "OPTIX"
        elif hasattr(cy, "denoising_use_gpu"): cy.denoising_use_gpu = True
    except Exception:
        pass
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
if spec.get("motor") == "eevee":   # vídeo: ~1 s/quadro (Cycles ~12 s); vidro/gel por refração em raytracing de tela
    for nome in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            sc.render.engine = nome; break
        except Exception:
            pass
    ee = sc.eevee; ee.taa_render_samples = int(spec.get("amostras_eevee", 64))
    for k, v in (("use_raytracing", True), ("use_shadows", True), ("use_gtao", True), ("use_fast_gi", True)):
        if hasattr(ee, k): setattr(ee, k, v)
    if hasattr(ee, "ray_tracing_options"):
        try: ee.ray_tracing_options.resolution_scale = "1"
        except Exception: pass
    for m in bpy.data.materials:
        b = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
        if b and b.inputs["Transmission Weight"].default_value > 0.01:
            # EEVEE: refração por raytracing exige o modo pontilhado (o mesclado não refrata); a absorção de volume
            # vira névoa opaca no EEVEE — sai, e a cor do gel fica só na superfície
            for k, v in (("surface_render_method", "DITHERED"), ("use_raytrace_refraction", True), ("use_screen_refraction", True), ("thickness_mode", "SPHERE")):
                if hasattr(m, k):
                    try: setattr(m, k, v)
                    except Exception: pass
            out = m.node_tree.nodes.get("Material Output")
            if out and out.inputs["Volume"].is_linked:
                for lk in list(out.inputs["Volume"].links): m.node_tree.links.remove(lk)
sc.render.film_transparent = not spec.get("cenario", True)
VT = spec.get("cor", "neutro")   # neutro = Khronos PBR Neutral (cor de marca fiel); agx = mais cinematográfico
try:
    if VT == "neutro":
        sc.view_settings.view_transform = "Khronos PBR Neutral"; raise StopIteration
    sc.view_settings.view_transform = "AgX"
    looks = [l for l in (spec.get("look"), "AgX - Medium High Contrast", "AgX - Base Contrast") if l]
    for l in looks:
        try:
            sc.view_settings.look = l; break
        except Exception:
            pass
except StopIteration:
    pass
except Exception:
    sc.view_settings.view_transform = "Filmic"
sc.view_settings.exposure = float(spec.get("exposicao", 0))
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGB" if spec.get("cenario", True) else "RGBA"; sc.render.image_settings.color_depth = "16"
sc.render.filepath = os.path.join(saida, spec.get("nome", "heroi") + ".png")
if spec.get("blend"):   # a cena montada, para abrir no Blender com interface (luzes, câmera, materiais editáveis)
    for im in bpy.data.images:
        if im.filepath: im.filepath = bpy.path.abspath(im.filepath)
    bpy.ops.wm.save_as_mainfile(filepath=spec["blend"], compress=True)
    print("KANIVETE: blend salvo " + spec["blend"], flush=True)
if spec.get("quadros"):   # vídeo: a cena montada uma vez; a cada quadro só as matrizes (objetos, câmera, luzes)
    pasta_q = os.path.join(saida, spec.get("nome", "video") + "_quadros"); os.makedirs(pasta_q, exist_ok=True)
    Q = spec["quadros"]
    for n, q in enumerate(Q):
        for i, mz in enumerate(q.get("objetos") or []):
            if i in PAIS and mz: PAIS[i].matrix_world = Matrix([mz[r * 4:r * 4 + 4] for r in range(4)])
        if q.get("camera_matriz"):
            cam.matrix_world = Matrix([q["camera_matriz"][r * 4:r * 4 + 4] for r in range(4)])
            if q.get("fov"): cd.lens = 12 / math.tan(math.radians(float(q["fov"])) / 2)
        for ob, l in zip(LUZES, q.get("luzes") or []):
            ob.location = Vector(l["pos"]); ob.data.energy = float(l.get("energia", ob.data.energy)); ob.data.color = tuple(l.get("cor", ob.data.color))
            ob.rotation_quaternion = (Vector(l["mira"]) - ob.location).to_track_quat("-Z", "Y") @ Quaternion((0, 0, 1), math.radians(-float(l.get("giro", 0))))
        sc.render.filepath = os.path.join(pasta_q, f"q_{n:05d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"KANIVETE: quadro {n + 1}/{len(Q)}", flush=True)
    print("KANIVETE: video pronto " + pasta_q, flush=True)
elif spec.get("renderizar", True):
    bpy.ops.render.render(write_still=True)
    print("KANIVETE: estudio pronto " + sc.render.filepath, flush=True)
