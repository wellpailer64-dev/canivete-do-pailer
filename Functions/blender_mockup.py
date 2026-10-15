# Roda DENTRO do Blender: blender -b --factory-startup -P Functions/blender_mockup.py -- spec.json
# Produto de embalagem (pote | bastao) modelado por revolução, em estúdio, renderizado em PASSES para o mockup
# profissional (Instructions/agente/mockup-profissional.md): beleza neutra (PNG), e em EXR linear: difusa
# (sombreado → Multiplicar), especular (brilhos → Tela), oclusão (contraste), sombra no chão (shadow catcher),
# índice do objeto (máscara por parte) e UV (para colar a arte no rótulo fora do Blender). Render em 2× (o
# montador tools/mockup3d.py reduz: máscaras de índice saem suaves). Passes de luz com redução de ruído (OIDN).
import bpy, bmesh, json, math, os, sys

spec = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
saida = spec["saida"]; os.makedirs(saida, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ── produtos: perfil (r, z) de baixo para cima; sx/sy achatam (bastão oval); rótulo = faixa de z e de u ──
PRODUTOS = {
    "pote": {
        "partes": [
            {"nome": "corpo", "idx": 1, "rug": 0.34, "perfil": [(0.001, 0), (0.94, 0), (0.985, 0.012), (1.0, 0.045), (1.0, 1.0), (0.97, 1.0), (0.001, 1.0)]},
            {"nome": "tampa", "idx": 2, "rug": 0.2, "perfil": [(0.001, 0.996), (1.035, 0.996), (1.035, 1.36), (1.022, 1.395), (0.99, 1.41), (0.001, 1.41)]},
        ],
        "sx": 1.0, "sy": 1.0, "altura": 1.41, "rotulo": {"parte": 1, "z": [0.1, 0.92], "u": [0.22, 0.78]},
    },
    "bastao": {
        "partes": [
            {"nome": "corpo", "idx": 1, "rug": 0.34, "perfil": [(0.001, 0), (0.9, 0), (0.97, 0.025), (1.0, 0.08), (1.0, 2.0), (0.96, 2.0), (0.001, 2.0)]},
            {"nome": "tampa", "idx": 2, "rug": 0.2, "perfil": [(0.001, 1.994), (1.025, 1.994), (1.025, 2.62), (1.0, 2.74), (0.93, 2.83), (0.75, 2.89), (0.45, 2.92), (0.001, 2.93)]},
        ],
        "sx": 0.62, "sy": 0.36, "altura": 2.93, "rotulo": {"parte": 1, "z": [0.22, 1.84], "u": [0.29, 0.71]},
    },
}
P = PRODUTOS[spec.get("produto", "pote")]
ALT = P["altura"]


def revolver(nome, perfil, idx, rug, seg=192):
    """malha de revolução com UV: u = volta (0,5 = frente, virada para −Y), v = z / altura do produto"""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
    aneis = []
    for r, z in perfil:
        anel = []
        for i in range(seg):
            a = 2 * math.pi * i / seg - math.pi   # i = seg/2 → a = 0 → frente
            anel.append(bm.verts.new((r * P["sx"] * math.sin(a), -r * P["sy"] * math.cos(a), z)))
        aneis.append(anel)
    for j in range(len(perfil) - 1):
        for i in range(seg):
            i2 = (i + 1) % seg
            f = bm.faces.new((aneis[j][i], aneis[j][i2], aneis[j + 1][i2], aneis[j + 1][i]))
            f.smooth = True
            for lp, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uv].uv = (ii / seg, perfil[jj][1] / ALT)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(nome, me); sc.collection.objects.link(ob); ob.pass_index = idx
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.82, 0.82, 0.82, 1); b.inputs["Roughness"].default_value = rug
    me.materials.append(m)
    # suavizar pelo ângulo (aresta viva nas quinas do perfil, liso na volta)
    try:
        mod = ob.modifiers.new("liso", "SMOOTH_BY_ANGLE") if hasattr(bpy.types, "SmoothByAngleModifier") else None
    except Exception:
        mod = None
    if mod is None:
        me.shade_smooth()
    return ob


for p in P["partes"]:
    revolver(p["nome"], p["perfil"], p["idx"], p["rug"])

# chão que só recebe sombra
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0)); chao = bpy.context.object; chao.is_shadow_catcher = True

# ── câmera: olha o meio do produto; az (°) gira em volta, el (°) de cima; enquadra a altura × folga ──
cam_d = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.lens = float(spec.get("lente", 85)); cam_d.sensor_fit = "VERTICAL"; cam_d.sensor_height = 24
W, H = int(spec.get("largura", 1600)), int(spec.get("altura", 1600))
fov_v = 2 * math.atan(12 / cam_d.lens)
alvo = (0, 0, ALT * 0.5)
larg = 2 * max(max(r for r, _ in pp["perfil"]) for pp in P["partes"]) * P["sx"]   # o maior entre altura e largura (× proporção do quadro)
tam = max(ALT, larg * H / W)
dist = float(spec.get("dist") or (tam * float(spec.get("folga", 1.6)) / 2) / math.tan(fov_v / 2) + larg * P["sy"] / 2)
az, el = math.radians(float(spec.get("az", -22))), math.radians(float(spec.get("el", 10)))
cam.location = (alvo[0] + dist * math.cos(el) * math.sin(az), alvo[1] - dist * math.cos(el) * math.cos(az), alvo[2] + dist * math.sin(el))
dirv = [alvo[i] - cam.location[i] for i in range(3)]
from mathutils import Vector
cam.rotation_euler = Vector(dirv).to_track_quat("-Z", "Y").to_euler()

# ── luz de estúdio (principal, preenchimento, recorte, teto) mirando o produto ──
def luz(nome, az_g, el_g, d, tam, w, cor=(1, 1, 1)):
    l = bpy.data.lights.new(nome, "AREA"); l.size = tam; l.energy = w; l.color = cor
    o = bpy.data.objects.new(nome, l); sc.collection.objects.link(o)
    a, e = math.radians(az_g), math.radians(el_g)
    o.location = (d * math.cos(e) * math.sin(a), -d * math.cos(e) * math.cos(a), alvo[2] + d * math.sin(e))
    o.rotation_euler = Vector([alvo[i] - o.location[i] for i in range(3)]).to_track_quat("-Z", "Y").to_euler()
k = ALT / 1.41; E = float(spec.get("luz", 1.0)) * k * k   # watts crescem com o tamanho do produto
luz("principal", -48, 32, 6 * k, 4 * k, 260 * E, (1, 0.98, 0.95))
luz("preench", 62, 12, 7 * k, 6 * k, 70 * E)
luz("recorte", 165, 35, 6 * k, 2.5 * k, 240 * E)
luz("teto", 0, 85, 6 * k, 6 * k, 90 * E)
w = bpy.data.worlds.new("mundo"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.42, 0.42, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.25
w.light_settings.distance = 0.35 * k   # alcance da oclusão (AO)

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
except Exception:
    pass
sc.cycles.samples = int(spec.get("amostras", 64)); sc.cycles.use_denoising = True; sc.cycles.use_adaptive_sampling = True
sc.render.film_transparent = True
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W * 2, H * 2, 100
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"; sc.render.image_settings.color_depth = "16"
sc.render.filepath = os.path.join(saida, "beleza.png")
vl = sc.view_layers[0]
vl.use_pass_diffuse_direct = vl.use_pass_diffuse_indirect = True
vl.use_pass_glossy_direct = vl.use_pass_glossy_indirect = True
vl.use_pass_ambient_occlusion = True; vl.use_pass_object_index = True; vl.use_pass_uv = True
vl.cycles.use_pass_shadow_catcher = True; vl.cycles.denoising_store_passes = True

sc.use_nodes = True; T = sc.node_tree; T.nodes.clear()
rl = T.nodes.new("CompositorNodeRLayers"); comp = T.nodes.new("CompositorNodeComposite"); T.links.new(rl.outputs["Image"], comp.inputs["Image"])
fo = T.nodes.new("CompositorNodeOutputFile"); fo.base_path = saida
fo.format.file_format = "OPEN_EXR"; fo.format.color_depth = "32"; fo.format.exr_codec = "ZIP"; fo.file_slots.clear()


def limpo(sock):   # redução de ruído do passe com albedo/normal do Cycles
    d = T.nodes.new("CompositorNodeDenoise")
    T.links.new(sock, d.inputs["Image"])
    if "Denoising Normal" in rl.outputs: T.links.new(rl.outputs["Denoising Normal"], d.inputs["Normal"])
    if "Denoising Albedo" in rl.outputs: T.links.new(rl.outputs["Denoising Albedo"], d.inputs["Albedo"])
    return d.outputs["Image"]


def soma(a, b):
    m = T.nodes.new("CompositorNodeMixRGB"); m.blend_type = "ADD"; m.inputs[0].default_value = 1
    T.links.new(rl.outputs[a], m.inputs[1]); T.links.new(rl.outputs[b], m.inputs[2]); return m.outputs["Image"]


def sai(nome, sock):
    fo.file_slots.new(nome + "_"); T.links.new(sock, fo.inputs[-1])

sai("difusa", limpo(soma("DiffDir", "DiffInd")))
sai("brilho", limpo(soma("GlossDir", "GlossInd")))
sai("ao", limpo(rl.outputs["AO"]))
sai("sombra", limpo(rl.outputs["Shadow Catcher"]))
sai("indice", rl.outputs["IndexOB"])
def rgb_de_vetor(sock):   # vetor (UV) → imagem RGB comum: canais R/G/B que qualquer leitor de EXR entende
    sx = T.nodes.new("CompositorNodeSeparateXYZ"); cc = T.nodes.new("CompositorNodeCombineColor")
    T.links.new(sock, sx.inputs[0])
    for i in range(3): T.links.new(sx.outputs[i], cc.inputs[i])
    return cc.outputs[0]
sai("uv", rgb_de_vetor(rl.outputs["UV"]))
sai("alfa", rl.outputs["Alpha"])
a_, b_ = P["sx"], P["sy"]   # perímetro da elipse (Ramanujan) × raio do corpo → tamanho real do rótulo
r_corpo = max(r for r, _ in P["partes"][0]["perfil"])
perim = math.pi * r_corpo * (3 * (a_ + b_) - math.sqrt((3 * a_ + b_) * (a_ + 3 * b_)))
json.dump({"rotulo": P["rotulo"], "altura": ALT, "rotulo_larg": perim * (P["rotulo"]["u"][1] - P["rotulo"]["u"][0]), "rotulo_alt": P["rotulo"]["z"][1] - P["rotulo"]["z"][0], "partes": [{"nome": p["nome"], "idx": p["idx"]} for p in P["partes"]]},
          open(os.path.join(saida, "produto.json"), "w", encoding="utf-8"))
bpy.ops.render.render(write_still=True)
print("KANIVETE: mockup pronto", flush=True)
