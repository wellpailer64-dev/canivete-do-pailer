"""Mockup profissional a partir de um produto 3D (pilha dos estúdios, Instructions/agente/mockup-profissional.md).

1) Blender (Functions/blender_mockup.py) renderiza o produto em passes, em 2×.
2) Aqui os passes viram as camadas do mockup, no tamanho final (reduzidas por área → bordas suaves):
   base.png (objeto neutro), parte_<nome>.png (máscara por parte), sombra_chao.png (máscara da sombra),
   sombras.png (Multiplicar), brilhos.png (Tela), contraste.png (Multiplicar leve), rotulo.png (máscara do rótulo)
   e arte.png (a arte plana colada no rótulo pelo UV — a curvatura e a perspectiva saem do 3D).
3) previa.png: a pilha montada aqui mesmo (para conferir sem abrir o app); manifesto.json para o Photo
   (KNV.mockup monta as camadas editáveis: cores por parte, sombra recolorível, arte, mapas).

Uso: py -3.13 tools/mockup3d.py --produto pote|bastao --saida PASTA [--arte rotulo.png] [--largura 1600 --altura 1600]
     [--az -22 --el 12 --lente 85 --amostras 64 --luz 1] [--cores fundo=#d9ead3,corpo=#1f6b3a,tampa=#f1eee6,sombra=#33402f]
     [--so-montar]   (reaproveita os passes já renderizados na pasta)
"""
import argparse, glob, json, os, subprocess, sys, time
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
import cv2
import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.stdout.reconfigure(encoding="utf-8")


def render(spec):
    from Functions import blender_render
    b = blender_render.exe()
    if not b:
        raise SystemExit("Blender não instalado (Objeto › 3D: Render fotorrealista instala)")
    try:
        blender_render._liberar_gpu()
    except Exception:
        pass
    os.makedirs(spec["saida"], exist_ok=True)
    jp = os.path.join(spec["saida"], "spec.json"); json.dump(spec, open(jp, "w", encoding="utf-8"))
    t = time.time()
    r = subprocess.run([b, "-b", "--factory-startup", "-noaudio", "-P", os.path.join(RAIZ, "Functions", "blender_mockup.py"), "--", jp],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if "KANIVETE: mockup pronto" not in r.stdout:
        raise SystemExit("Blender falhou:\n" + (r.stdout + r.stderr)[-2500:])
    return time.time() - t


def exr(pasta, nome):
    p = sorted(glob.glob(os.path.join(pasta, nome + "_*.exr")))[-1]
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    if im is None:
        raise SystemExit(f"não li {p}")
    return im[..., :3][..., ::-1].astype(np.float32) if im.ndim == 3 else im.astype(np.float32)   # BGR(A) → RGB


def reduz(a, W, H):
    return cv2.resize(a, (W, H), interpolation=cv2.INTER_AREA)


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def salvar_rgba(path, rgb, a):
    out = np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(path)


def salvar_mascara(path, m):
    Image.fromarray((np.clip(m, 0, 1) * 255 + 0.5).astype(np.uint8), "L").save(path)


def hexrgb(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def montar(pasta, W, H, arte=None, cores=None):
    prod = json.load(open(os.path.join(pasta, "produto.json"), encoding="utf-8"))
    idx = exr(pasta, "indice")[..., 0] if exr(pasta, "indice").ndim == 3 else exr(pasta, "indice")
    uv = exr(pasta, "uv")
    W2, H2 = idx.shape[1], idx.shape[0]
    # máscaras por parte (índice exato em 2×, reduzido por área = borda suave)
    partes = {}
    for p in prod["partes"]:
        partes[p["nome"]] = reduz((np.abs(idx - p["idx"]) < 0.5).astype(np.float32), W, H)
    obj = np.clip(sum(partes.values()), 0, 1)
    # rótulo: parte do rótulo × faixa de u e de v (v = z / altura) no UV
    R = prod["rotulo"]; z0, z1 = R["z"][0] / prod["altura"], R["z"][1] / prod["altura"]; u0, u1 = R["u"]
    try:   # a frente do rótulo vira para a câmera (câmera girada az° em volta do produto)
        az = float(json.load(open(os.path.join(pasta, "spec.json"), encoding="utf-8")).get("az", 0))
    except Exception:
        az = 0
    d_u = az / 360; u0, u1 = u0 + d_u, u1 + d_u
    u, v = uv[..., 0], uv[..., 1]
    no_rot = (np.abs(idx - R["parte"]) < 0.5) & (u >= u0) & (u <= u1) & (v >= z0) & (v <= z1)
    rotulo = reduz(no_rot.astype(np.float32), W, H)
    # arte colada pelo UV (em 2×, depois reduz pré-multiplicada)
    arte_rgb = arte_a = None
    if arte:
        A = np.asarray(Image.open(arte).convert("RGBA")).astype(np.float32) / 255
        ah, aw = A.shape[:2]
        # encaixa a arte na área do rótulo SEM distorcer (proporção real da superfície; centralizada)
        rl, rh = prod.get("rotulo_larg") or aw / ah, prod.get("rotulo_alt") or 1
        k = min(rl / aw, rh / ah); fl, fh = aw * k / rl, ah * k / rh            # fração do rótulo que a arte ocupa
        su = (u - (u0 + u1) / 2) / (u1 - u0) / fl + 0.5; sv = ((v - z0) / (z1 - z0) - 0.5) / fh + 0.5
        mx = (su * (aw - 1)).astype(np.float32); my = ((1 - sv) * (ah - 1)).astype(np.float32)
        Ap = np.dstack([A[..., :3] * A[..., 3:4], A[..., 3]])
        D = cv2.remap(Ap, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        D *= no_rot[..., None]
        D = reduz(D, W, H)
        arte_a = D[..., 3]; arte_rgb = D[..., :3] / np.maximum(arte_a[..., None], 1e-4)
    # mapas de luz (linear → normaliza dentro do objeto → sRGB)
    dif = reduz(exr(pasta, "difusa"), W, H)
    ref = np.percentile(lum(dif)[obj > 0.5], 97) if (obj > 0.5).any() else 1
    sombras = srgb(dif / max(ref, 1e-4) * 0.92)
    gl = reduz(exr(pasta, "brilho"), W, H)
    refg = np.percentile(lum(gl)[obj > 0.5], 99.7) if (obj > 0.5).any() else 1
    brilhos = srgb(np.clip(gl / max(refg, 1e-4), 0, 1) * 0.9)
    ao = reduz(exr(pasta, "ao"), W, H)
    contraste = np.repeat((0.72 + 0.28 * np.clip(lum(ao), 0, 1))[..., None], 3, 2)
    sc = reduz(exr(pasta, "sombra"), W, H)
    tem_chao = reduz((lum(exr(pasta, "ao")) > 0.02).astype(np.float32), W, H)   # onde há chão (fora dele a oclusão é 0)
    perto = cv2.GaussianBlur(obj, (0, 0), W * 0.05); perto = np.clip(perto / max(perto.max(), 1e-4) * 3, 0, 1)
    contato = np.clip((1 - np.clip(lum(ao), 0, 1)) * 2.2, 0, 1) * tem_chao * perto   # oclusão do chão perto do produto = contato
    sombra_chao = np.clip(np.maximum((1 - lum(sc)) * 1.15, contato), 0, 1) * (1 - obj)
    bel = np.asarray(Image.open(os.path.join(pasta, "beleza.png")).convert("RGBA")).astype(np.float32) / 255
    bp = reduz(np.dstack([bel[..., :3] * bel[..., 3:4], bel[..., 3]]), W, H)
    base = bp[..., :3] / np.maximum(bp[..., 3:4], 1e-4)
    # ── camadas ──
    os.makedirs(os.path.join(pasta, "camadas"), exist_ok=True)
    C = lambda n: os.path.join(pasta, "camadas", n)
    salvar_rgba(C("base.png"), base, obj)
    for n, m in partes.items():
        salvar_mascara(C(f"parte_{n}.png"), m)
    salvar_mascara(C("rotulo.png"), rotulo)
    salvar_mascara(C("sombra_chao.png"), sombra_chao)
    salvar_rgba(C("sombras.png"), sombras, obj)
    salvar_rgba(C("brilhos.png"), brilhos, obj)
    salvar_rgba(C("contraste.png"), contraste, obj)
    if arte_a is not None:
        salvar_rgba(C("arte.png"), arte_rgb, arte_a)
    # ── prévia: a mesma pilha do Photo ──
    cores = cores or {}
    fundo = hexrgb(cores.get("fundo", "#dfe7da"))
    img = np.ones((H, W, 3), np.float32) * fundo
    cs = hexrgb(cores.get("sombra", "#2f382c"))
    img = img * (1 - sombra_chao[..., None] * 0.85 * (1 - cs))                                   # Multiplicar pela cor da sombra
    img = img * (1 - obj[..., None]) + base * obj[..., None]
    for n, m in partes.items():
        if n in cores:
            img = img * (1 - m[..., None]) + hexrgb(cores[n]) * m[..., None]
    if arte_a is not None:
        img = img * (1 - arte_a[..., None]) + arte_rgb * arte_a[..., None]
    img = img * (1 - obj[..., None] + sombras * obj[..., None])                                 # Multiplicar
    img = 1 - (1 - img) * (1 - brilhos * obj[..., None])                                         # Tela
    img = img * (1 - obj[..., None] * 0.6 + contraste * obj[..., None] * 0.6)                    # contraste 60%
    pv = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)); destino = os.path.join(pasta, "previa.png")
    try:
        pv.save(destino)
    except OSError:   # aberta num visualizador (o Windows trava o arquivo): grava ao lado
        destino = os.path.join(pasta, time.strftime("previa_%H%M%S.png")); pv.save(destino)
    man = {"previa": destino.replace("\\", "/"), "largura": W, "altura": H, "pasta": os.path.join(pasta, "camadas").replace("\\", "/"), "cores": cores,
           "partes": list(partes), "arte": arte_a is not None}
    json.dump(man, open(os.path.join(pasta, "manifesto.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return man


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--produto", default="pote"); ap.add_argument("--saida", required=True); ap.add_argument("--arte")
    ap.add_argument("--largura", type=int, default=1600); ap.add_argument("--altura", type=int, default=1600)
    ap.add_argument("--az", type=float, default=-22); ap.add_argument("--el", type=float, default=12); ap.add_argument("--lente", type=float, default=85)
    ap.add_argument("--amostras", type=int, default=64); ap.add_argument("--luz", type=float, default=1.0); ap.add_argument("--folga", type=float, default=1.6)
    ap.add_argument("--cores", default=""); ap.add_argument("--so-montar", action="store_true")
    a = ap.parse_args()
    cores = dict(kv.split("=") for kv in a.cores.split(",") if "=" in kv)
    if not a.so_montar:
        seg = render({"produto": a.produto, "saida": a.saida.replace("\\", "/"), "largura": a.largura, "altura": a.altura, "az": a.az, "el": a.el,
                      "lente": a.lente, "amostras": a.amostras, "luz": a.luz, "folga": a.folga})
        print(f"render: {seg:.0f} s")
    t = time.time(); m = montar(a.saida, a.largura, a.altura, a.arte, cores)
    print(f"montagem: {time.time() - t:.1f} s → {m['previa']} · camadas: {m['pasta']}")
