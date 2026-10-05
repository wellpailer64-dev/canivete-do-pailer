"""Roda DENTRO do Blender (blender -b -P blender_cena.py -- cena.json): monta a cena dos objetos 3D do Vetor Kanivete e
renderiza em Cycles. Espaço do Vetor: x direita, y para baixo, z para quem olha (pt). Os vértices nascem no espaço do
objeto do Vetor (× escala) e a matriz do objeto = C·R (R = rotação do Vetor, C = Vetor → Blender), então o ângulo é o
mesmo da prévia vetorial. cena = {saida, largura, altura, amostras, escala, R (3×3), persp (pt ou 0), luz {dir, forca},
fundo (null = transparente), chao_y, sombra, objetos: [girar | extrudar]} (ver vetor-blender.js)."""
import json, math, sys
import bpy
from mathutils import Matrix, Vector

cena = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
S = float(cena.get("escala", 0.01))
print("KANIVETE: montando a cena no Blender", flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
R = Matrix([cena["R"][0], cena["R"][1], cena["R"][2]])
C = Matrix(((1, 0, 0), (0, 0, -1), (0, -1, 0)))   # Vetor (x, y↓, z→quem olha) → Blender (X, Y fundo, Z cima)
CR = (C @ R).to_4x4()


def material(nome, cor, tipo, rotulo=None):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*[c ** 2.2 for c in cor], 1)   # sRGB → linear
    P = {"papel": dict(r=0.82), "fosco": dict(r=0.65), "plastico": dict(r=0.32), "ceramica": dict(r=0.12, coat=0.7),
         "metal": dict(r=0.22, met=0.35, coat=1.0), "vidro": dict(r=0.02, tr=1.0)}.get(tipo, dict(r=0.4))   # metal = alumínio pintado com verniz
    b.inputs["Roughness"].default_value = P["r"]
    if "met" in P: b.inputs["Metallic"].default_value = P["met"]
    if "coat" in P: b.inputs["Coat Weight"].default_value = P["coat"]; b.inputs["Coat Roughness"].default_value = 0.04
    if "tr" in P: b.inputs["Transmission Weight"].default_value = P["tr"]; b.inputs["IOR"].default_value = 1.45
    if rotulo:   # rótulo/arte rasterizada pelo Vetor por cima da cor base (alfa da imagem = onde tem tinta)
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(rotulo); tex.extension = "CLIP"
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.inputs["A"].default_value = b.inputs["Base Color"].default_value
        nt.links.new(tex.outputs["Alpha"], mix.inputs["Factor"]); nt.links.new(tex.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        if tipo == "metal":   # tinta sobre metal não é metálica
            inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
            nt.links.new(tex.outputs["Alpha"], inv.inputs[1]); nt.links.new(inv.outputs[0], b.inputs["Metallic"])
    return m


def objeto_malha(nome, verts, faces, uvs=None, mat=None, suave=True):
    me = bpy.data.meshes.new(nome); me.from_pydata([Vector(v) * S for v in verts], [], faces); me.update()
    if uvs:
        uv = me.uv_layers.new(name="UV")
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices): uv.data[li].uv = uvs[vi]
    if suave:
        for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(nome, me); sc.collection.objects.link(ob); ob.matrix_world = CR
    if mat: ob.data.materials.append(mat)
    return ob


pontos = []   # para enquadrar a câmera (espaço de vista do Vetor, pt)
for i, o in enumerate(cena["objetos"]):
    if o["tipo"] == "girar":
        perf, K = o["perfil"], int(o.get("K", 160))
        ytop, ybase = min(p[1] for p in perf), max(p[1] for p in perf)
        verts, uvs = [], []
        for r, y in perf:
            for j in range(K + 1):   # coluna K = costura duplicada (UV contínuo)
                t = 2 * math.pi * j / K
                verts.append((r * math.cos(t), y, r * math.sin(t))); uvs.append((1 - j / K, 1 - (y - ytop) / max(1e-6, ybase - ytop)))   # u cresce para a direita de quem olha
        faces = [(a * (K + 1) + j, a * (K + 1) + j + 1, (a + 1) * (K + 1) + j + 1, (a + 1) * (K + 1) + j) for a in range(len(perf) - 1) for j in range(K)]
        ob = objeto_malha(f"girar{i}", verts, faces, uvs, material(f"m{i}", o["cor"], o.get("material", "plastico"), o.get("rotulo")))
        if o.get("espessura"):
            mod = ob.modifiers.new("espessura", "SOLIDIFY"); mod.thickness = o["espessura"] * S; mod.offset = -1
        pontos += [R @ Vector(v) for v in verts[:: max(1, len(verts) // 400)]]
    elif o["tipo"] == "extrudar":
        cu = bpy.data.curves.new(f"forma{i}", "CURVE"); cu.dimensions = "2D"; cu.fill_mode = "BOTH"
        ch_ = (o.get("chanfro") or 0) * S   # no Vetor o chanfro é para DENTRO: o contorno e a profundidade não crescem
        cu.extrude = max(1e-5, o["prof"] / 2 * S - ch_); cu.bevel_depth = ch_; cu.bevel_resolution = 4 if ch_ else 0; cu.offset = -ch_
        for sub in o["subs"]:
            sp = cu.splines.new("BEZIER"); sp.bezier_points.add(len(sub) - 1); sp.use_cyclic_u = True
            for bp, q in zip(sp.bezier_points, sub):   # local: (x, -y) — o Vetor tem y para baixo
                bp.co = (q[0] * S, -q[1] * S, 0); bp.handle_left = (q[2] * S, -q[3] * S, 0); bp.handle_right = (q[4] * S, -q[5] * S, 0)
                bp.handle_left_type = bp.handle_right_type = "FREE"
        ob = bpy.data.objects.new(f"extrudar{i}", cu); sc.collection.objects.link(ob)
        Sm = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, 1))).to_4x4()   # local Blender da curva → objeto do Vetor
        ob.matrix_world = CR @ Sm
        ob.data.materials.append(material(f"m{i}", o["cor"], o.get("material", "fosco")))
        for q in [p for s_ in o["subs"] for p in s_]:
            for z in (-o["prof"] / 2, o["prof"] / 2): pontos.append(R @ Vector((q[0], q[1], z)))
    for k, d in enumerate(o.get("decals") or []):   # arte numa face plana: placa com a imagem, colada na face
        cs = [Vector(c) for c in d["cantos"]]; n = (cs[1] - cs[0]).cross(cs[3] - cs[0]).normalized()
        if n.dot(Vector(d.get("normal", (0, 0, 1)))) < 0: n = -n
        cs = [c + n * 0.35 for c in cs]
        objeto_malha(f"arte{i}_{k}", [tuple(c) for c in cs], [(0, 1, 2, 3)], {0: (0, 1), 1: (1, 1), 2: (1, 0), 3: (0, 0)},
                     material(f"a{i}_{k}", o["cor"], o.get("material", "fosco"), d["png"]), suave=False)
        bpy.data.materials[f"a{i}_{k}"].blend_method = "HASHED" if hasattr(bpy.data.materials[f"a{i}_{k}"], "blend_method") else None
        # a placa só mostra a arte: fora dela, transparente
        nt = bpy.data.materials[f"a{i}_{k}"].node_tree; tex = [n_ for n_ in nt.nodes if n_.type == "TEX_IMAGE"][0]
        nt.links.new(tex.outputs["Alpha"], nt.nodes["Principled BSDF"].inputs["Alpha"])

# chão que só recebe sombra (fica transparente no PNG)
if cena.get("sombra", True):
    y0, L = cena["chao_y"], max(2000.0, max(abs(c) for p in pontos for c in p) * 12)
    ch = objeto_malha("chao", [(-L, y0, -L), (L, y0, -L), (L, y0, L), (-L, y0, L)], [(0, 1, 2, 3)], suave=False)
    ch.is_shadow_catcher = True
    mch = bpy.data.materials.new("chao"); mch.use_nodes = True
    mch.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)   # sem luz rebatida: só sombra
    ch.data.materials.append(mch)

# câmera (mesmo enquadramento da vista do Vetor) e luz
W, H = int(cena["largura"]), int(cena["altura"])
if cena.get("quadro"):   # o mesmo quadro que o Vetor usa para colocar a imagem (com folga para a sombra)
    q = cena["quadro"]; cx, cy, larg, alt = q["cx"], q["cy"], q["larg"], q["alt"]
else:
    xs, ys = [p.x for p in pontos], [p.y for p in pontos]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    larg, alt = (max(xs) - min(xs)) * 1.12, (max(ys) - min(ys)) * 1.12
    if larg / alt > W / H: alt = larg * H / W
    else: larg = alt * W / H
cam_d = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.sensor_fit = "HORIZONTAL"   # ortho_scale/lente valem pela LARGURA (o AUTO usa o lado maior e cortava imagem em pé)
f = cena.get("persp") or 0
dist = (f if f else max(larg, alt) * 4) * S
cam.location = (cx * S, -dist, -cy * S); cam.rotation_euler = (math.pi / 2, 0, 0)
if f: cam_d.type = "PERSP"; cam_d.sensor_width = 36; cam_d.lens = 36 * dist / (larg * S)
else: cam_d.type = "ORTHO"; cam_d.ortho_scale = larg * S
cam_d.clip_end = dist * 20
centro = Vector((cx * S, 0, -cy * S)); tam = max(larg, alt) * S
lz = cena.get("luz", {}); ld = Vector(lz.get("dir", (-0.45, -0.65, 0.62))); ld = (C @ ld).normalized()
for nome, dirv, forca, tamanho in (("principal", ld, 1.0, 1.6), ("preenchimento", Vector((-ld.x, ld.y, ld.z * 0.4)).normalized(), 0.28, 2.5),
                                    ("recorte", Vector((ld.x * 0.3, 0.9, 0.6)).normalized(), 0.45, 1.2),
                                    ("teto", Vector((ld.x * 0.15, -0.1, 1.0)).normalized(), 0.55, 1.4)):   # de cima: sombra de contato
    l = bpy.data.lights.new(nome, "AREA"); l.size = tam * tamanho; l.energy = float(lz.get("base", 38)) * (tam ** 2) * forca * float(lz.get("forca", 1.0))
    lo = bpy.data.objects.new(nome, l); sc.collection.objects.link(lo); lo.location = centro + dirv * tam * 3
    lo.rotation_euler = (centro - lo.location).to_track_quat("-Z", "Y").to_euler()
# softboxes verticais (fotografia de produto): desenham as faixas de brilho em lata, cerâmica, plástico e vidro
if any(o.get("material") in ("metal", "ceramica", "plastico", "vidro") for o in cena["objetos"]):
    for lado in (-1, 1):
        l = bpy.data.lights.new(f"faixa{lado}", "AREA"); l.shape = "RECTANGLE"; l.size = tam * 0.32; l.size_y = tam * 2.2
        l.energy = float(lz.get("base", 38)) * (tam ** 2) * 0.55
        lo = bpy.data.objects.new(f"faixa{lado}", l); sc.collection.objects.link(lo)
        lo.location = centro + Vector((lado * tam * 1.1, -tam * 1.4, tam * 0.15))
        lo.rotation_euler = (centro - lo.location).to_track_quat("-Z", "Y").to_euler()
w = bpy.data.worlds.new("mundo"); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = (0.82, 0.82, 0.84, 1); bg.inputs["Strength"].default_value = 0.55
# estúdio com degradê (chão escuro → faixa clara → teto médio): só com material brilhante (é o que os reflexos desenham);
# em papel/fosco o mundo fica neutro — o degradê roubava luz ambiente e escurecia a cor da marca
if any(o.get("material") in ("metal", "ceramica", "plastico", "vidro") for o in cena["objetos"]):
    _tc = w.node_tree.nodes.new("ShaderNodeTexCoord"); _sep = w.node_tree.nodes.new("ShaderNodeSeparateXYZ"); _rp = w.node_tree.nodes.new("ShaderNodeValToRGB")
    w.node_tree.links.new(_tc.outputs["Generated"], _sep.inputs[0]); w.node_tree.links.new(_sep.outputs["Z"], _rp.inputs["Fac"])
    _el = _rp.color_ramp.elements; _el[0].position, _el[0].color = 0.42, (0.05, 0.05, 0.06, 1); _el[1].position, _el[1].color = 0.62, (0.95, 0.95, 0.96, 1)
    _e3 = _el.new(0.85); _e3.color = (0.45, 0.45, 0.48, 1)
    w.node_tree.links.new(_rp.outputs["Color"], bg.inputs["Color"])

# render: Cycles na GPU (OptiX > CUDA), redução de ruído, cor sem filmic (a cor da marca sai fiel)
sc.render.engine = "CYCLES"
try:
    pr = bpy.context.preferences.addons["cycles"].preferences
    for tipo in ("OPTIX", "CUDA"):
        try:
            pr.compute_device_type = tipo; pr.get_devices()
            if any(d.type == tipo for d in pr.devices): break
        except Exception: continue
    for d in pr.devices: d.use = d.type != "CPU"
    sc.cycles.device = "GPU"
    print(f"KANIVETE: placa {pr.compute_device_type}: " + ", ".join(d.name for d in pr.devices if d.use), flush=True)
except Exception as e:
    print("KANIVETE: sem GPU, usando CPU:", e, flush=True)
sc.cycles.samples = int(cena.get("amostras", 96)); sc.cycles.use_denoising = True
sc.cycles.use_adaptive_sampling = True; sc.cycles.max_bounces = 8
sc.render.film_transparent = cena.get("fundo") is None
if cena.get("fundo") is not None: bg.inputs["Color"].default_value = (*[c ** 2.2 for c in cena["fundo"]], 1); bg.inputs["Strength"].default_value = 1.0
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.render.filepath = cena["saida"]
print("KANIVETE: renderizando", flush=True)
bpy.ops.render.render(write_still=True)
print("KANIVETE: pronto", flush=True)
