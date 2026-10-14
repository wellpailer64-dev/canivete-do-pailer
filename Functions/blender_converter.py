"""
blender_converter.py — roda DENTRO do Python do Blender (Functions/cena3d.py: converter):
  blender -b --factory-startup -noaudio -P blender_converter.py -- entrada saida.glb
Abre .fbx/.blend/.dae/.stl/.ply/.3mf (o que o Blender importa), acha as texturas que o autor deixou com caminho de outro
computador (procura pelo nome na pasta do modelo e subpastas) e exporta um .glb com tudo dentro (texturas e animação),
que a Cena 3D do Editor lê com o GLTFLoader.
"""
import os
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
entrada, saida = os.path.abspath(args[0]), os.path.abspath(args[1])
ext = os.path.splitext(entrada)[1].lower()
pasta = os.path.dirname(entrada)

if ext == ".blend":
    bpy.ops.wm.open_mainfile(filepath=entrada)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=entrada, use_image_search=True)
    elif ext == ".dae":
        bpy.ops.wm.collada_import(filepath=entrada)
    elif ext == ".stl":
        bpy.ops.wm.stl_import(filepath=entrada)
    elif ext == ".ply":
        bpy.ops.wm.ply_import(filepath=entrada)
    elif ext == ".3mf":
        bpy.ops.import_mesh.threemf(filepath=entrada)
    else:
        raise SystemExit(f"formato não suportado: {ext}")

# texturas com caminho de outro computador: procura pelo nome (sem caixa) na pasta do modelo
achados = {}
for raiz, pastas, nomes in os.walk(pasta):
    if raiz.count(os.sep) - pasta.count(os.sep) > 3:
        pastas[:] = []
        continue
    for n in nomes:
        achados.setdefault(n.lower(), os.path.join(raiz, n))
for img in bpy.data.images:
    if img.packed_file or img.source not in {"FILE", "SEQUENCE", "TILED"}:
        continue
    cam = bpy.path.abspath(img.filepath)
    if not os.path.isfile(cam):
        novo = achados.get(os.path.basename(cam.replace("\\", "/")).lower())
        if novo:
            img.filepath = novo
            try:
                img.reload()
            except Exception:
                pass
            print("KANIVETE: textura achada", novo)
        else:
            print("KANIVETE: textura faltando", cam)

# câmeras e luzes do arquivo não entram (a Cena 3D tem as dela)
for ob in list(bpy.data.objects):
    if ob.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(ob, do_unlink=True)

bpy.ops.export_scene.gltf(filepath=saida, export_format="GLB", export_apply=True, export_animations=True,
                          export_cameras=False, export_lights=False, export_image_format="AUTO")
print("KANIVETE: pronto", saida)
