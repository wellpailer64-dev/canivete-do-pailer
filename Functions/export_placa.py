"""Exportação na placa de vídeo ("modo placa", Kanivete Encoder rodada 3): a timeline inteira montada na GPU, como o
Premiere/Resolve — o quadro sobe para a placa uma vez e só desce no encoder.

- vídeos: lidos na placa (decodificação Vulkan; o que a placa não lê é lido na CPU e sobe uma vez), girados nela
  (transpose_vulkan) e compostos pelo libplacebo com VÁRIAS entradas: posição/escala/âncora/quadros-chave/Pulsar/
  Tremer viram expressões por quadro (pos_x/pos_y/pos_w/pos_h); a escolha de quadro é a MESMA da CPU (setpts a partir
  do corte + fps na grade + início arredondado ao quadro) — emendas e blocos batem com o exportador de CPU;
- imagens (textos, logos, sequências de texto animado): preparadas na CPU como no exportador (efeitos, recorte à parte
  visível, redução ao maior tamanho, opacidade) e enviadas pequenas; a sombra projetada vai como outra entrada;
- camada de ajuste com Luz e Cor: LUT no libplacebo (lut_type normalizada = a mesma cor do lut3d) e Clareza/Vinheta/
  Nitidez num shader (as mesmas fórmulas da CPU), só no trecho dela;
- encoder: o mesmo da exportação normal (NVENC/QSV/AMF ou x264), som pela mesma mixagem (wav) e junção sem recodificar.

O que ainda não roda na placa (mesclagem, rotação, opacidade animada em VÍDEO, legendas, base com trechos do vídeo
principal, 10 bits, ProRes, saída reduzida) devolve motivo() ≠ None e a exportação segue pela CPU como sempre; erro na
placa também cai na CPU (video_cutter.exportar_video). Medições e pendências: Instructions/agente/plano-kanivete-encoder.md §7–8.
"""
import copy
import json
import math
import os
import re
import shutil
import subprocess
import threading
import uuid

from Functions import video_cutter as vc

_vk = None
_trava_vk = threading.Lock()
PARA_RGB_IMG = "scale=in_color_matrix=bt601,format=rgba"   # foto/PNG: o mesmo do exportador (BT.601)
# rotação do celular (probe: rotation % 360) → rotate do libplacebo (medido contra o autorotate da CPU: 45,8 dB). O
# transpose_vulkan falhava em vídeo de celular girado (e ignora o recorte do quadro decodificado)
_GIRO = {90: 270, 270: 90, 180: 180}
_CODECS_VK = ("h264", "hevc", "av1")


def _ler_na_placa(info):
    """Decodificar na placa: o que ela lê (H.264/HEVC/AV1 em 4:2:0); o resto é lido na CPU e sobe."""
    if info.get("vcodec") not in _CODECS_VK:
        return False
    if info.get("pix_fmt", "") not in ("yuv420p", "yuvj420p", "nv12", "yuv420p10le", "p010le"):
        return False
    return True   # (ler Full HD H.264 na CPU deixou 13% mais lento e não resolveu a memória: o que enche é a fila adiantada)


def _marca_cor(path, info):
    """Marca de cor do clipe para o libplacebo: a de HD sem marca (vc._marca_hd) e, em vídeo HDR de celular (HLG/PQ,
    BT.2020 — iPhone), a mesma leitura da prévia e do exportador de CPU: a matriz da fonte (BT.2020) e a curva/cores
    tratadas como vídeo comum, sem tone mapping. O iPhone grava também metadados Dolby Vision (perfil 8.4) que o
    libplacebo aplica sozinho (tone mapping, mesmo com a marca trocada): saem os DOVI_METADATA. Sem isso o clipe saía
    ~25 níveis mais escuro e acinzentado que a prévia (Respeite o seu voto, 2026-10-10; com: 128/135/143 = a CPU)."""
    m = vc._marca_hd(path)
    if m:
        return m
    if (str((info or {}).get("color_transfer") or "") in ("arib-std-b67", "smpte2084")
            or str((info or {}).get("color_primaries") or "") == "bt2020"):
        return "sidedata=mode=delete:type=DOVI_METADATA,setparams=color_primaries=bt709:color_trc=bt709,"
    return ""


def _fmt_decodificado(info):
    """Formato do quadro que sai do decodificador Vulkan (o que o hwdownload tem de pedir): p010 nos de 10 bits (HEVC
    da FX30), nv12 nos de 8. Pedir nv12 de um vídeo 10 bits falhava ("Invalid output format nv12 for hwframe download")."""
    return "p010le" if "10" in str(info.get("pix_fmt", "")) else "nv12"


# Precisão na placa (rodada 7): cada passada do libplacebo grava o quadro no formato pedido. Tudo em yuv420p (8 bits)
# arredondava a cada passo (camada → composição → LUT → Luz e Cor → Aberração → Brilho: 5 vezes) e o 10 bits da FX30 virava
# 8 bits ANTES da coloração: no escuro, degraus e manchas em bloco que o encoder ainda piorava. Agora a camada sai em
# 10 bits, a composição e os efeitos em 16 bits 4:4:4, e só a saída volta a 8 bits com pontilhado (blue noise).
_FMT_CAM = "p010le"
_FMT_MEIO = "yuv444p16le"


def disponivel():
    """A placa faz Vulkan + libplacebo com este ffmpeg? (testado uma vez por sessão)."""
    global _vk
    with _trava_vk:
        if _vk is None:
            try:
                r = subprocess.run(
                    [vc.ffmpeg_path(), "-v", "error", "-init_hw_device", "vulkan=vk:0", "-filter_hw_device", "vk",
                     "-f", "lavfi", "-i", "color=black:s=64x64:d=0.1",
                     "-vf", "format=yuv420p,hwupload,libplacebo=format=yuv420p,hwdownload,format=yuv420p",
                     "-f", "null", "-"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, creationflags=vc._creationflags())
                _vk = r.returncode == 0
            except Exception:
                _vk = False
        return _vk


_vram = None


def memoria_placa():
    """Memória da placa em bytes: NVIDIA pelo nvidia-smi; as outras pelo núcleo de hardware (registro do Windows, a
    memória dedicada de verdade); sem como saber: 4 GB, o comum das placas de entrada."""
    global _vram
    if _vram is None:
        _vram = 4 * 2**30
        try:
            from Functions import hardware
            p = hardware.placa()
            if p and not p["integrada"] and p["vram_gb"] > 0:
                _vram = int(p["vram_gb"] * 2**30)
        except Exception:
            pass
        try:
            r = subprocess.run(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
                               capture_output=True, text=True, timeout=10, creationflags=vc._creationflags())
            if r.returncode == 0 and r.stdout.strip():
                _vram = int(float(r.stdout.split()[0])) * 2**20
        except Exception:
            pass
    return _vram


def memoria_em_uso():
    """Memória da placa já ocupada agora (o editor com vídeos abertos, outro programa), em bytes; 0 se não der para ler."""
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                           capture_output=True, text=True, timeout=10, creationflags=vc._creationflags())
        return int(float(r.stdout.split()[0])) * 2**20 if r.returncode == 0 and r.stdout.strip() else 0
    except Exception:
        return 0


def cabe_na_placa(segmentos, lay, path):
    """A exportação cabe na memória livre? Estimativa × 2,6 (medido 2026-10-08: 2,0 → 3,8 GB e, com as cópias Full HD
    automáticas, 2,3 → 5,6 GB além do que já estava ocupado — a fila adiantada de quadros cresce durante o export) + o
    que já está em uso ≤ 92% da placa. Sem caber: vai direto pela CPU em vez de estourar no meio e recomeçar (com ×2, o
    app ocupando ~2 GB passou na conferência e estourou em 21%, perdendo ~90 s)."""
    return memoria_estimada(segmentos, lay, path) * 2.6 + memoria_em_uso() <= 0.92 * memoria_placa()


def memoria_estimada(segmentos, lay, path):
    """Memória dos decodificadores abertos ao mesmo tempo (cada corte é uma leitura): ~20 quadros de referência por
    leitura, no tamanho decodificado. 34 cortes 4K HEVC (Depoimentos do Carlinhos) passavam dos 8 GB e a placa falhava."""
    total, infos = 0, {}
    fontes = [c["path"] for c in lay if c["tipo"] == "video"]
    fontes += [path] * sum(1 for s in segmentos or [] if isinstance(s, dict) and s.get("gap") is None)
    for p in fontes:
        if p not in infos:
            try:
                infos[p] = vc.probe(p)
            except Exception:
                infos[p] = {}
        i = infos[p]
        if not _ler_na_placa(i):
            continue   # lido na CPU: na placa só o quadro que aparece
        bpp = 3.0 if "10" in str(i.get("pix_fmt", "")) else 1.5
        total += (i.get("width") or 1920) * (i.get("height") or 1080) * bpp * 20
        total += 1920 * 1080 * 3 * 6   # a fila de quadros da camada já reduzida, em 10 bits (_FMT_CAM)
    # o que sobe da CPU em RGBA (camada desenhada do motion, Comp, imagens e textos): a textura e a fila de quadros de cada
    # entrada do libplacebo. A propaganda KANIVETE (24 vídeos transparentes do quadro inteiro + 65 imagens) passava na
    # conferência só com os decodificadores e estourava a memória da placa (2026-10-11)
    for c in lay:
        if c["tipo"] == "video" and vc._clipe_tem_alfa(c["path"]):
            total += c["mw"] * c["mh"] * 4 * 12
        elif c["tipo"] == "imagem":
            k = min(1.0, max([c["sc"]] + [p[1] for p in c["kf"].get("sc", [])]))
            total += c["mw"] * c["mh"] * k * k * 4 * 6
    return total


def _lc_ok(fx):
    """Todos os efeitos ativos rodam em shader na placa (_passos_lc): Luz e Cor, Aberração cromática, Desfoque e o
    Brilho da camada de ajuste."""
    return all(f.get("t") in ("lc", "ca", "blur", "mo_glow") or f.get("on") is False for f in fx or [])


# Efeitos que a placa ainda não faz em shader mas o exportador de CPU faz com filtros do ffmpeg: no modo placa o quadro
# DAQUELA camada (ou o trecho da camada de ajuste) desce, passa pelos MESMOS filtros (vc._filtros_fx, mesma ordem e contas)
# e sobe — leitura, redução, montagem das outras camadas e encoder continuam na placa. Respeite o seu voto (72 Chroma Key,
# ajustes com Desfoque e Aberração): ia inteiro pela CPU, 6× a duração (2026-10-10).
# Motion (editor-motion.js): Preenchimento, Inverter e o Brilho da camada de ajuste também têm filtro do ffmpeg
# Cortar, Luma Key, Cantos arredondados e Básico 3D (transições Dividir/Chicote viram esses efeitos) também
_FX_HIBRIDO = ("key", "lc", "blur", "bc", "ca", "mo_fill", "mo_inv", "mo_glow", "crop", "luma", "rounded", "b3d")


def _fx_hibrido(fx):
    """Tem efeito fora do Luz e Cor e todos estão entre os que descem e voltam (_FX_HIBRIDO)."""
    ativos = [f for f in fx or [] if f.get("on") is not False]
    return bool(ativos) and not _lc_ok(fx) and all(f.get("t") in _FX_HIBRIDO for f in ativos)


def _key_so(fx):
    """Só um Chroma Key ativo no clipe: o recorte roda inteiro num shader da placa (_shader_key)."""
    ativos = [f for f in fx or [] if f.get("on") is not False]
    return len(ativos) == 1 and ativos[0].get("t") == "key"


def _shader_key(v):
    """Chroma Key em passadas de shader do libplacebo (formato mpv), as contas do exportador de CPU (vc._filtros_fx "key"):
    alfa = rampa da diferença de cor (colorchannelmixer + lutrgb, com o valor intermediário em 8 bits como lá), encolher/
    expandir = mínimo/máximo 3×3 repetido (erosion/dilation), suavizar = gaussiano no alfa, e o despill do ffmpeg no
    verde/azul. Roda no RGB da mídia (MAIN, sem luz linear); a saída RGBA leva o alfa direto (não pré-multiplicado).
    No MAIN a cor vem em ponto flutuante SEM trava: o verde da tela tem vermelho −0,06 (BT.709) e o alfa caía de 42 para
    28 — travada em 0..1 como a conversão da CPU/prévia (medido 2026-10-10)."""
    p = vc._key_params(v)
    partes = [f"//!HOOK MAIN\n//!BIND HOOKED\n//!SAVE K0\n//!COMPONENTS 1\n//!DESC chroma alfa\nvec4 hook() {{\n"
              f"    vec3 c = clamp(HOOKED_tex(HOOKED_pos).rgb, 0.0, 1.0);\n"
              f"    float v = clamp({p['ar']:.5f} * c.r + {p['ag']:.5f} * c.g + {p['ab']:.5f} * c.b + 0.5, 0.0, 1.0);\n"
              f"    v = floor(v * 255.0 + 0.5) / 255.0;\n"
              f"    float a = clamp(((1.0 - {p['ganho']:.5f} * (1.0 - 2.0 * v) / {p['dk']:.5f}) - {p['cb']:.5f}) / "
              f"{p['cw'] - p['cb']:.5f}, 0.0, 1.0);\n"
              f"    return vec4(floor(a * 255.0 + 0.5) / 255.0, 0.0, 0.0, 0.0);\n}}\n"]
    n = 0
    viz = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
    for _ in range(abs(p["choke"])):
        op = "min" if p["choke"] > 0 else "max"
        corpo = "\n".join(f"    a = {op}(a, K{n}_texOff(vec2({dx}.0, {dy}.0)).x);" for dx, dy in viz)
        partes.append(f"//!HOOK MAIN\n//!BIND K{n}\n//!SAVE K{n + 1}\n//!COMPONENTS 1\n//!DESC chroma encolher\n"
                      f"vec4 hook() {{\n    float a = K{n}_texOff(vec2(0.0)).x;\n{corpo}\n    return vec4(a, 0.0, 0.0, 0.0);\n}}\n")
        n += 1
    s = p["suave"]
    if s >= 0.05:
        r = max(1, min(64, int(math.ceil(3 * s))))
        pesos = [math.exp(-(i * i) / (2 * s * s)) for i in range(r + 1)]
        tot = pesos[0] + 2 * sum(pesos[1:])
        pesos = [w / tot for w in pesos]
        for dx, dy in ((1, 0), (0, 1)):
            soma = "\n".join(f"    a += {pesos[i]:.8f} * (K{n}_texOff(vec2({dx * i}.0, {dy * i}.0)).x + "
                             f"K{n}_texOff(vec2({-dx * i}.0, {-dy * i}.0)).x);" for i in range(1, r + 1))
            partes.append(f"//!HOOK MAIN\n//!BIND K{n}\n//!SAVE K{n + 1}\n//!COMPONENTS 1\n//!DESC chroma suavizar\n"
                          f"vec4 hook() {{\n    float a = {pesos[0]:.8f} * K{n}_texOff(vec2(0.0)).x;\n{soma}\n"
                          f"    return vec4(a, 0.0, 0.0, 0.0);\n}}\n")
            n += 1
    desp = ""
    if p["spill"] > 0.001:
        # despill do ffmpeg (type, mix = Equilíbrio, expand 0, escala −spill no canal da tela)
        m = p["eq"]
        if p["azul"]:
            desp = (f"    float sm = max(c.b - (c.r * {m:.5f} + c.g * {1 - m:.5f}), 0.0);\n"
                    f"    c.b = max(c.b - {p['spill']:.5f} * sm, 0.0);\n")
        else:
            desp = (f"    float sm = max(c.g - (c.r * {m:.5f} + c.b * {1 - m:.5f}), 0.0);\n"
                    f"    c.g = max(c.g - {p['spill']:.5f} * sm, 0.0);\n")
    partes.append(f"//!HOOK MAIN\n//!BIND HOOKED\n//!BIND K{n}\n//!DESC chroma saida\nvec4 hook() {{\n"
                  f"    vec4 c = clamp(HOOKED_tex(HOOKED_pos), 0.0, 1.0);\n{desp}    c.a = K{n}_tex(HOOKED_pos).x;\n    return c;\n}}\n")
    return "\n".join(partes)


def _mtx(info):
    """Matriz YUV↔RGB das camadas — a mesma regra do exportador de CPU (exportar_video: mtx)."""
    cs = str((info or {}).get("color_space") or "").lower()
    w, h = (info or {}).get("width") or 1920, (info or {}).get("height") or 1080
    return ("bt2020" if cs.startswith("bt2020") else "bt601" if cs in ("bt470bg", "smpte170m")
            else "bt709" if cs == "bt709" or min(w, h) >= 720 else "bt601")


def motivo(segmentos, lay, legendas, cfg, vcodec, bits, reduz=False, alfa=False):
    """Por que esta timeline ainda não vai pela placa (texto curto), ou None se vai."""
    if os.environ.get("CANIVETE_PLACA") == "0":
        return "desligado (CANIVETE_PLACA=0)"
    try:
        from Functions import hardware
        if not hardware.plano()["export_na_placa"]:   # integrada ou dedicada < 4 GB: a montagem na GPU não compensa
            return "placa integrada ou pequena"
    except Exception:
        pass
    if alfa:
        return "fundo transparente"
    # H.265 10 bits também: a cadeia já é 10/16 bits (_FMT_CAM/_FMT_MEIO) e a saída desce em p010
    if vcodec not in ("h264", "hevc") or bits not in (8, 10) or (bits == 10 and vcodec != "hevc"):
        return f"formato {vcodec} {bits} bits"
    if reduz:
        return "saída reduzida"
    # legendas: a placa monta e o libass desenha no quadro que desce para o codificador (_render, 2026-10-11)
    if not lay:
        return "sem camadas"
    for c in lay:
        if c.get("bm") and (c["bm"] != "multiply" or vc._sombra_camada(c)):
            return "modo de mesclagem (fora o Multiplicar)"
        # girado: imagem/texto gira na CPU antes de subir (_entrada_imagem); vídeo desce, gira na CPU e sobe (híbrido)
        gira = c["rot"] or "rot" in c["kf"] or any(f.get("t") == "ca_rot" for f in c.get("ca") or [])
        if gira and (c["tipo"] == "ajuste" or c.get("bm") or "sx" in c["kf"] or "sy" in c["kf"]
                     or (c["tipo"] == "video" and (_key_so(c["fx"]) or vc._clipe_tem_alfa(c["path"])))):
            return "rotação"
        if c["tipo"] == "ajuste":
            if not _lc_ok(c["fx"]) and not _fx_hibrido(c["fx"]):
                return "camada de ajuste com efeito fora do Luz e Cor"
            if (not _opaca(c) and _fx_hibrido(c["fx"])
                    and any(e.startswith(vc._NIT_NO_YUV) for e in vc._filtros_fx(c["fx"], 64, 64, "m"))):
                return "camada de ajuste com Nitidez e opacidade"
        elif c["tipo"] == "video":
            if vc._clipe_tem_alfa(c["path"]):
                continue   # vídeo com transparência (camada desenhada, Comp): lido e tratado na CPU, sobe em RGBA
            if c.get("fxk"):
                return "vídeo com efeito animado"
            if not _lc_ok(c["fx"]) and not _fx_hibrido(c["fx"]):
                return "vídeo com efeito fora do Luz e Cor"
            if _fx_hibrido(c["fx"]) and any(e.startswith(vc._NIT_NO_YUV) for e in vc._filtros_fx(c["fx"], c["mw"], c["mh"], "m")):
                return "Nitidez do Luz e Cor junto com outro efeito no vídeo"
    return None


# ─────────────────────────────── grafo ───────────────────────────────

class _Grafo:
    def __init__(self, W, H, fps, total):
        self.W, self.H, self.fps, self.total = W, H, fps, total
        self.fd = 1.0 / fps
        self.cmd = [vc.ffmpeg_path(), "-y", "-v", "error", "-nostats", "-progress", "pipe:1",
                    "-init_hw_device", "vulkan=vk:0", "-filter_hw_device", "vk"]
        self.filtros = []
        self.n = 0
        self.rot = 0

    def entrada(self, args):
        self.cmd += args
        self.n += 1
        return self.n - 1

    def rotulo(self, p="r"):
        self.rot += 1
        return f"{p}{self.rot}"


def _opaca(c):
    """Opacidade 100% o tempo todo (inclusive quadros-chave que nunca saem de 100)."""
    if "op" in c["kf"]:
        return all(p[1] >= 0.999 for p in c["kf"]["op"])
    return c["op"] >= 0.999


def _passos_lc(g, fx, mw, mh, pasta, tag, fmt=_FMT_MEIO):
    """Luz e Cor (uma ou mais instâncias) como passadas do libplacebo: LUT e o shader de Clareza/Vinheta/Nitidez.
    mw/mh = tamanho em que o efeito mede (a mídia, num clipe; o quadro, na camada de ajuste). fmt = formato de cada
    passada (_FMT_CAM num clipe, _FMT_MEIO na camada de ajuste)."""
    passos = []
    for j, f in enumerate(fx or []):
        if f.get("on") is not False and f.get("t") == "blur":
            sh = _shader_blur((f.get("v") or {}).get("amt"), mw, mh)
            if sh:
                arq = os.path.join(pasta, f"blur_{tag}_{j}.glsl")
                with open(arq, "w", encoding="utf-8") as fh:
                    fh.write(sh)
                passos.append(f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={fmt}:disable_linear=1")
            continue
        if f.get("on") is not False and f.get("t") == "mo_glow":
            # só na camada de ajuste (num clipe o Brilho vira camada desenhada; o exportador de CPU também ignora)
            sh = _shader_glow(f.get("v") or {}) if tag.startswith("a") else None
            if sh:
                arq = os.path.join(pasta, f"glow_{tag}_{j}.glsl")
                with open(arq, "w", encoding="utf-8") as fh:
                    fh.write(sh)
                passos.append(f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={fmt}:disable_linear=1")
            continue
        if f.get("on") is not False and f.get("t") == "ca":
            sh = _shader_ca(f.get("v") or {}, mw, mh)
            if sh:
                arq = os.path.join(pasta, f"ca_{tag}_{j}.glsl")
                with open(arq, "w", encoding="utf-8") as fh:
                    fh.write(sh)
                passos.append(f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={fmt}:disable_linear=1")
            continue
        if f.get("on") is False or f.get("t") != "lc":
            continue
        v = f.get("v") or {}
        if v.get("lut"):
            cube = vc._lut_cube(v.get("n"), v["lut"])
            if cube:
                passos.append(f"libplacebo=lut={vc._caminho_filtro(cube)}:lut_type=2:format={fmt}")
        sh = _shader_lc(vc._num(v.get("clar_s"), 0, 0.2) * min(mw, mh), vc._num(v.get("clar"), -2, 2),
                        vc._num(v.get("sharp"), 0, 5), vc._num(v.get("vig"), 0, 1.5708), mw, mh)
        if sh:
            arq = os.path.join(pasta, f"lc_{tag}_{j}.glsl")
            with open(arq, "w", encoding="utf-8") as fh:
                fh.write(sh)
            passos.append(f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={fmt}")
    return passos


def _shader_blur(amt, W, H):
    """Desfoque gaussiano (editor-fx.js "blur"; o mesmo σ do exportador de CPU: 100% = 5% do lado menor) em duas
    passadas (horizontal e vertical) no RGB. Até 64 amostras por lado; σ maior amostra de k em k pixels (a leitura
    bilinear da textura cobre o meio). None se não desfoca."""
    sig = vc._num(amt, 0, 100) * max(2, min(W, H)) / 2000.0
    if sig < 0.05:
        return None
    r = max(1, int(math.ceil(3 * sig)))
    passo = max(1, int(math.ceil(r / 64)))
    n = int(math.ceil(r / passo))
    pesos = [math.exp(-((i * passo) ** 2) / (2 * sig * sig)) for i in range(n + 1)]
    tot = pesos[0] + 2 * sum(pesos[1:])
    pesos = [p / tot for p in pesos]
    partes = []
    for dx, dy, nome in ((1, 0, "horizontal"), (0, 1, "vertical")):
        soma = "\n".join(f"    s += {pesos[i]:.8f} * (clamp(HOOKED_texOff(vec2({dx * i * passo}.0, {dy * i * passo}.0)), 0.0, 1.0) + "
                         f"clamp(HOOKED_texOff(vec2({-dx * i * passo}.0, {-dy * i * passo}.0)), 0.0, 1.0));"
                         for i in range(1, n + 1))
        partes.append(f"//!HOOK MAIN\n//!BIND HOOKED\n//!DESC desfoque {nome}\nvec4 hook() {{\n"
                      f"    vec4 s = {pesos[0]:.8f} * clamp(HOOKED_texOff(vec2(0.0)), 0.0, 1.0);\n{soma}\n    return s;\n}}\n")
    return "\n".join(partes)


def _shader_glow(v):
    """Brilho (editor-motion.js "mo_glow") da camada de ajuste com as contas do exportador de CPU (video_cutter._filtros_fx):
    o que passa do limite (canal a canal, esticado para 0..1), com cor = cor × luma, desfoque gaussiano σ = raio/2 em
    duas passadas e soma × intensidade por cima do quadro. Quatro passadas do libplacebo; o brilho fica na textura
    BRILHO (//!SAVE) e o MAIN só muda na soma. Antes descia o quadro inteiro para a CPU (20 min em blocos: 1h40)."""
    lim = vc._num(v.get("lim"), 0, 100) / 100.0
    raio, inten = vc._num(v.get("raio"), 0, 500), vc._num(v.get("int"), 0, 400) / 100.0
    if raio <= 0.01 or inten <= 0.001:
        return None
    k = 1.0 / max(1.0 / 255.0, 1.0 - lim)
    cor = str(v.get("cor") or "#ffffff")
    if v.get("usaCor") and re.match(r"^#[0-9a-fA-F]{6}$", cor):
        cr, cg, cb = (int(cor[i:i + 2], 16) / 255.0 for i in (1, 3, 5))
        tinge = (f"    float y = dot(b, vec3(0.2126, 0.7152, 0.0722));\n"
                 f"    b = clamp(vec3({cr:.5f}, {cg:.5f}, {cb:.5f}) * y, 0.0, 1.0);\n")
    else:
        tinge = ""
    sig = raio / 2.0
    r = max(1, int(math.ceil(3 * sig)))
    passo = max(1, int(math.ceil(r / 64)))
    n = int(math.ceil(r / passo))
    pesos = [math.exp(-((i * passo) ** 2) / (2 * sig * sig)) for i in range(n + 1)]
    tot = pesos[0] + 2 * sum(pesos[1:])
    pesos = [p / tot for p in pesos]
    partes = [f"//!HOOK MAIN\n//!BIND HOOKED\n//!SAVE BRILHO\n//!COMPONENTS 4\n//!DESC brilho: limite\nvec4 hook() {{\n"
              f"    vec3 b = clamp((clamp(HOOKED_tex(HOOKED_pos).rgb, 0.0, 1.0) - {lim:.6f}) * {k:.6f}, 0.0, 1.0);\n"
              f"{tinge}    return vec4(b, 1.0);\n}}\n"]
    for dx, dy, nome in ((1, 0, "horizontal"), (0, 1, "vertical")):
        soma = "\n".join(f"    s += {pesos[i]:.8f} * (BRILHO_texOff(vec2({dx * i * passo}.0, {dy * i * passo}.0)).rgb + "
                         f"BRILHO_texOff(vec2({-dx * i * passo}.0, {-dy * i * passo}.0)).rgb);"
                         for i in range(1, n + 1))
        partes.append(f"//!HOOK MAIN\n//!BIND BRILHO\n//!SAVE BRILHO\n//!COMPONENTS 4\n//!DESC brilho: desfoque {nome}\n"
                      f"vec4 hook() {{\n    vec3 s = {pesos[0]:.8f} * BRILHO_texOff(vec2(0.0)).rgb;\n{soma}\n"
                      f"    return vec4(s, 1.0);\n}}\n")
    if v.get("soma"):   # Somar luz (o modo antigo): estoura os claros
        mistura = f"    o.rgb = clamp(o.rgb + g * {inten:.6f}, 0.0, 1.0);\n"
    else:               # Tela: 1 − (1 − x)·Π(1 − a·g), uma vez por passada da prévia — os claros chegam ao branco sem cortar
        mistura = "".join(f"    o.rgb = 1.0 - (1.0 - o.rgb) * (1.0 - {a:.6f} * g);\n" for a in vc.glow_passadas(inten))
    partes.append(f"//!HOOK MAIN\n//!BIND HOOKED\n//!BIND BRILHO\n//!DESC brilho: mistura\nvec4 hook() {{\n"
                  f"    vec4 o = clamp(HOOKED_tex(HOOKED_pos), 0.0, 1.0);\n"
                  f"    vec3 g = clamp(BRILHO_tex(HOOKED_pos).rgb, 0.0, 1.0);\n{mistura}    return o;\n}}\n")
    return "\n".join(partes)


def _shader_opacidade(c, ini, fim, fps, desde=None):
    """Alfa da camada de ajuste por quadro do trecho [ini, fim) (o contador `frame` do shader começa em 1 no primeiro
    quadro que o libplacebo recebe): tabela com a opacidade de cada quadro (quadros-chave como _valor_kf) — a saída
    RGBA é composta por cima do original, como o overlay da CPU. desde: o ramo começa antes (no início do bloco) e os
    quadros antes de ini ficam com alfa 0 (ver _ajuste: o trim tardio prendia quadros na placa)."""
    desde = ini if desde is None else desde
    n = max(1, int(round((fim - desde) * fps)) + 2)
    if "op" in c["kf"]:
        vals = [max(0.0, min(1.0, vc._valor_kf(c["kf"]["op"], desde - c["st"] + i / fps))) for i in range(n)]
    else:
        vals = [max(0.0, min(1.0, c["op"]))] * n
    if desde < ini:
        vals = [0.0 if desde + i / fps < ini - 0.25 / fps else v for i, v in enumerate(vals)]
    tab = ",".join(f"{v:.4f}" for v in vals)
    return (f"//!HOOK MAIN\n//!BIND HOOKED\n//!DESC opacidade\nconst float OP[{n}] = float[]({tab});\nvec4 hook() {{\n"
            f"    vec4 c = clamp(HOOKED_tex(HOOKED_pos), 0.0, 1.0);\n    c.a = OP[clamp(frame - 1, 0, {n - 1})];\n    return c;\n}}\n")


def _shader_ca(v, W, H):
    """Aberração cromática (editor-fx.js "ca") como o exportador de CPU: cada canal ampliado a partir do centro (escalas
    normalizadas pela menor) e, com Raio, misturado ao original por uma queda radial (cheio até meio raio, nada no raio).
    A cor lida é travada em 0..1 (no MAIN ela vem sem trava, ver _shader_key). None se não muda nada."""
    ss = [1 + vc._num(v.get(k), -10, 10) * 0.0045 for k in ("r", "g", "b")]
    mn = min(ss)
    ss = [s / mn for s in ss]
    if max(ss) <= 1.0001:
        return None
    raio = vc._num(v.get("raio"), 0, 200) / 100.0
    leitura = "\n".join(f"    ca.{c} = clamp(HOOKED_tex(0.5 + (HOOKED_pos - 0.5) / {s:.6f}).{c}, 0.0, 1.0);"
                        for c, s in zip("rgb", ss))
    queda = (f"    float m = clamp(2.0 - 2.0 * length((HOOKED_pos - 0.5) * vec2({W:.1f}, {H:.1f})) / {min(W, H) * raio:.3f}, 0.0, 1.0);\n"
             if raio > 0 else "    float m = 1.0;\n")
    return (f"//!HOOK MAIN\n//!BIND HOOKED\n//!DESC aberracao cromatica\nvec4 hook() {{\n"
            f"    vec4 o = clamp(HOOKED_tex(HOOKED_pos), 0.0, 1.0);\n    vec3 ca;\n{leitura}\n{queda}"
            f"    o.rgb = mix(o.rgb, ca, m);\n    return o;\n}}\n")


def _expr(c, prop, fixo, tl):
    return vc._expr_kf(c["kf"][prop], tl) if prop in c["kf"] else f"{fixo:.6f}"


def _posicao(c, k, wv, hv, tl, dx=0.0, dy=0.0, ang=None):
    """pos_x/pos_y/pos_w/pos_h (canto, em px do quadro) — as contas do overlay do exportador. ang = rotação da camada
    (graus, expressão em tl): o centro gira em volta do ponto de ancoragem, como no exportador de CPU."""
    px, py = _expr(c, "x", c["x"], tl), _expr(c, "y", c["y"], tl)
    if (abs(c["ox"]) > 0.01 or abs(c["oy"]) > 0.01) and ang:
        a = f"(({ang})*PI/180)"
        px = f"({px})+({k})*({c['ox']:.3f}*cos({a})-{c['oy']:.3f}*sin({a}))"
        py = f"({py})+({k})*({c['ox']:.3f}*sin({a})+{c['oy']:.3f}*cos({a}))"
    elif abs(c["ox"]) > 0.01 or abs(c["oy"]) > 0.01:
        px, py = f"({px})+({k})*{c['ox']:.3f}", f"({py})+({k})*{c['oy']:.3f}"
    ca = vc._ca_exprs(c.get("ca"), tl)
    if ca["dx"]:
        px, py = f"({px})+{ca['dx']}", f"({py})+{ca['dy']}"
    return (f"({px})+{dx:.3f}-({wv})/2", f"({py})+{dy:.3f}-({hv})/2", wv, hv)


def _escala(c, tl):
    k = _expr(c, "sc", c["sc"], tl)
    ca = vc._ca_exprs(c.get("ca"), tl)
    return f"({k})*{ca['sc']}" if ca["sc"] else k


def _tam(c, bw, bh, kx, tl):
    """Largura/altura na tela: escala × escala só horizontal/vertical (transição Dobrar: sx/sy)."""
    wv, hv = f"({bw}*({kx}))", f"({bh}*({kx}))"
    if "sx" in c["kf"]:
        wv = f"({wv}*({vc._expr_kf(c['kf']['sx'], tl)}))"
    if "sy" in c["kf"]:
        hv = f"({hv}*({vc._expr_kf(c['kf']['sy'], tl)}))"
    return wv, hv


# Cada camada entra 1/4 de quadro antes do seu início: com o tempo do 1º quadro IGUAL ao do quadro da saída, o
# libplacebo às vezes ainda não a mostrava (arredondamento da base de tempo) — quadro preto no corte (teste_export
# grade/velocidade). Um quarto de quadro não muda a escolha de quadro nem o fim (trim em fim − ½ quadro).
# Leitura começa este tanto antes do trecho (-ss antes do -i) e o corte exato fica no trim. Era 3 s (como no exportador
# de CPU), mas em blocos de 5–12 s isso era decodificar até 60% a mais: um bloco do documentário do Gil (XAVC 4:2:2
# 10 bits, que a placa não lê) caiu de 5,6 s para 4,4 s sem a sobra. O -ss do ffmpeg já decodifica desde o quadro-chave
# anterior e descarta até o ponto; 1 s cobre o arredondamento de tempo dos arquivos (teste_export --placa).
_PREROLL = float(os.environ.get("CANIVETE_PLACA_PREROLL") or 1.0)


def _entra(t0, fd):
    """Tempo do 1º quadro da camada. Começando DENTRO do bloco/timeline: ¼ de quadro antes (ver acima). Já tocando no
    início do bloco (t0 ≤ 0, blocos de plano longo): exato, na grade — com −¼ o quadro do zero ficava em tempo negativo,
    o libplacebo não o mostrava e cada bloco começava com 1 quadro PRETO (documentário do Gil: 20 piscadas a cada 5,96 s)."""
    return t0 if t0 <= 1e-9 else t0 - fd / 4


def _entrada_video(g, c, info, pasta, n_cam):
    """Clipe lido na placa (ou na CPU e enviado uma vez); tempos idênticos aos do exportador de CPU."""
    vk = _ler_na_placa(info)
    # bloco (exportação em blocos): a camada que já vinha tocando é lida só a partir do início do bloco ("pula", em s
    # da timeline); o tempo interno dela (quadros-chave, opacidade) continua contando do início verdadeiro (st < 0)
    pula = c.get("pula", 0.0)
    s0 = c["s"] + pula * c["v"]
    ss = max(0.0, s0 - _PREROLL)
    fq = vc._fps_fonte(c["path"])
    if fq and ss > 0 and not c.get("base"):
        ss = math.floor(ss * fq + 1e-6) / fq
    leitura = c["s"] - ss + c["fonte"] + 1.0
    rot = int(info.get("rotation") or 0) % 360
    pre = (["-hwaccel", "vulkan", "-hwaccel_output_format", "vulkan"] if vk else []) + ["-threads", "2"]
    if rot and vk:
        pre += ["-display_rotation:v:0", "0"]   # gira na placa (libplacebo rotate), não no processador
    k = g.entrada(pre + (["-ss", vc._tempo_ffmpeg(ss)] if ss > 0 else []) + ["-t", vc._tempo_ffmpeg(leitura), "-i", c["path"]])
    # 4K de celular usado a 50%: reduzido logo depois de ler, no mesmo passo do giro, ao maior tamanho que a camada
    # chega a ter — os quadros na fila viram 1080 (34 leituras 4K com quadros 4K na fila estouravam os 8 GB da placa)
    k_max = max([c["sc"]] + [p[1] for p in c["kf"].get("sc", [])]) * vc._ca_pulso_max(c.get("ca"))
    key_gpu = _key_so(c["fx"])
    # vídeo girado: o quadro desce e gira na CPU (como no exportador: quadro do tamanho da diagonal quando o giro anima)
    car = vc._ca_exprs(c.get("ca"), f"(t-{c['st']:.6f})")["rot"]
    gira_v = bool(c["rot"] % 360) or "rot" in c["kf"] or bool(car)
    hib = (_fx_hibrido(c["fx"]) or gira_v) and not key_gpu
    # efeitos que descem para a CPU medem em px da mídia (encolher/suavizar do Chroma Key): sem reduzir antes deles
    red = min(1.0, k_max * 1.02) if k_max < 0.9 and not hib and not key_gpu else 1.0
    rw, rh = max(2, int(round(c["mw"] * red / 2)) * 2), max(2, int(round(c["mh"] * red / 2)) * 2)
    giro = ""
    if vk and (rot in _GIRO or red < 1):
        giro = ("libplacebo=" + (f"rotate={_GIRO[rot]}:" if rot in _GIRO else "")
                + (f"w={rw}:h={rh}:" if red < 1 else "") + f"format={_FMT_CAM}:disable_linear=1,")
    sobe = ("" if vk else (f"scale={rw}:{rh}:flags=bicubic," if red < 1 else "") + "format=yuv420p,hwupload,")
    # os efeitos medem em % da mídia: no quadro reduzido, as medidas do quadro reduzido
    efeito = "" if hib or key_gpu else "".join(p + "," for p in _passos_lc(g, c["fx"], rw, rh, pasta, f"v{n_cam}", _FMT_CAM))
    opac = ""
    if key_gpu:
        # recorte inteiro na placa (shader); a saída já é RGBA. Opacidade: só esta camada desce para recebê-la
        arq = os.path.join(pasta, f"key_v{n_cam}.glsl")
        with open(arq, "w", encoding="utf-8") as fh:
            fh.write(_shader_key(next(f for f in c["fx"] if f.get("on") is not False).get("v") or {}))
        # upscaler=nearest: a cor (4:2:0) ampliada como o swscale do exportador de CPU (pico de diferença 53 → 28 na borda)
        efeito = f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format=rgba:disable_linear=1:upscaler=nearest,"
        if not _opaca(c):
            a = (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@vop{n_cam}", c["st"])
                 if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
            opac = f"hwdownload,format=rgba,{a},hwupload,"
    elif hib:
        # desce, os mesmos filtros do exportador de CPU no tamanho da mídia (com a opacidade, se houver) e sobe com o alfa
        a = ""
        if not _opaca(c):
            a = "," + (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@vop{n_cam}", c["st"])
                       if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
        baixo = _FMT_CAM if giro else "yuv420p" if not vk else _fmt_decodificado(info)
        fx_cpu = ",".join(vc._filtros_fx(c["fx"], c["mw"], c["mh"], f"h{n_cam}"))
        gir = ""
        if gira_v:
            # tempo aqui = o da timeline (setpts com o início da camada; num bloco, st < 0 e o tempo começa no bloco):
            # o giro conta do início da camada, t − st nos dois casos
            tv = f"(t-{c['st']:.6f})"
            if "rot" in c["kf"] or car:
                e = vc._expr_kf(c["kf"]["rot"], tv) if "rot" in c["kf"] else f"{c['rot']:.5f}"
                D = int(math.ceil(math.hypot(c["mw"], c["mh"]))) + 2
                D += D % 2
                gir = f"rotate=a='(({e}){'+' + car if car else ''})*PI/180':c=black@0:ow={D}:oh={D},"
                c["_giro_tam"] = (D, D)
            else:
                rad = math.radians(c["rot"])
                RW = int(math.ceil(c["mw"] * abs(math.cos(rad)) + c["mh"] * abs(math.sin(rad)))) + 2
                RH = int(math.ceil(c["mw"] * abs(math.sin(rad)) + c["mh"] * abs(math.cos(rad)))) + 2
                RW, RH = RW + RW % 2, RH + RH % 2
                gir = f"rotate={rad:.6f}:c=black@0:ow={RW}:oh={RH},"
                c["_giro_tam"] = (RW, RH)
        opac = (f"hwdownload,format={baixo},scale=in_color_matrix={_mtx(info)},format=rgba,"
                + (f"{fx_cpu}," if fx_cpu else "") + f"{gir}{a.lstrip(',') + ',' if a else ''}format=rgba,hwupload,")
    elif not _opaca(c):
        # fade de um clipe: só ele desce para receber a transparência (sendcmd no tempo da timeline) e sobe de volta
        a = (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@vop{n_cam}", c["st"])
             if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
        # formato EXATO na placa: o que passou pelo libplacebo (giro/redução/Luz e Cor) é _FMT_CAM, o que subiu da CPU é
        # yuv420p; direto do decodificador é nv12/p010 (com "nv12|yuv420p" o ffmpeg escolhia errado e a exportação falhava)
        baixo = _FMT_CAM if (giro or efeito) else "yuv420p" if not vk else _fmt_decodificado(info)
        opac = f"hwdownload,format={baixo},scale=in_color_matrix=bt709,format=rgba,{a},hwupload,"
    r = g.rotulo("v")
    g.filtros.append(f"[{k}:v:0]{_marca_cor(c['path'], info)}trim=start={vc._tempo_ffmpeg(s0 - ss)}:"
                     f"end={vc._tempo_ffmpeg(c['s'] - ss + c['fonte'])},"
                     + ("setpts=PTS-STARTPTS," if c.get("base") else f"setpts=(PTS-{s0 - ss:.6f}/TB)/{c['v']:.6f},")
                     + f"fps=fps={g.fps:.3f}:start_time=0,tpad=stop_mode=clone:stop_duration={vc._tempo_ffmpeg(g.fd)},"
                     f"settb=AVTB,setpts=PTS-STARTPTS+round({_entra(c['st'] + pula, g.fd):.9f}/TB),"
                     f"trim=end={min(g.total, c['st'] + c['dur']) - g.fd / 2:.6f},{sobe}{giro}{efeito}{opac}null[{r}]")
    tl = f"(ot-{c['st']:.6f})"   # ot = tempo do quadro de SAÍDA (o t do libplacebo é o da entrada)
    kx = _escala(c, tl)
    if c.get("_giro_tam"):   # girado na CPU: o quadro que sobe é o da caixa girada; o centro gira em volta da âncora
        RW, RH = c["_giro_tam"]
        ang = f"({_expr(c, 'rot', c['rot'], tl)})" + (f"+{vc._ca_exprs(c.get('ca'), tl)['rot']}" if car else "")
        return [(f"[{r}]", _posicao(c, kx, f"({RW}*({kx}))", f"({RH}*({kx}))", tl, ang=ang))]
    return [(f"[{r}]", _posicao(c, kx, *_tam(c, c["mw"], c["mh"], kx, tl), tl))]


def _entrada_video_alfa(g, c, n_cam):
    """Vídeo com transparência (a camada desenhada do motion, Comp em ProRes 4444): lido na CPU com o alfa, nos MESMOS
    tempos do exportador de CPU (trim a partir do corte, fps na grade, início arredondado ao quadro), efeitos e opacidade
    na CPU (vc._filtros_fx, a mesma conta) e enviado em RGBA. Antes, um só destes derrubava a exportação inteira para a
    CPU ("vídeo com transparência"): a propaganda KANIVETE tinha 24."""
    pula = c.get("pula", 0.0)
    s0 = c["s"] + pula * c["v"]
    ss = max(0.0, s0 - _PREROLL)
    leitura = c["s"] - ss + c["fonte"] + 1.0
    k = g.entrada(["-threads", "2"] + (["-ss", vc._tempo_ffmpeg(ss)] if ss > 0 else []) + ["-t", vc._tempo_ffmpeg(leitura), "-i", c["path"]])
    ids_anim = {f.get("id") for f in c.get("fxk") or [] if f.get("id")}
    fx_anim = vc._fx_animados(c.get("fxk"), c["mw"], c["mh"], c["dur"], g.fps, f"tbl{n_cam}")
    fx_cpu = vc._filtros_fx([f for f in c["fx"] if not (fx_anim and f.get("id") in ids_anim)], c["mw"], c["mh"], f"t{n_cam}")
    passos = ["format=rgba"] + [e[len(vc._NIT_NO_YUV):] if e.startswith(vc._NIT_NO_YUV) else e for e in fx_cpu] + ([fx_anim] if fx_anim else [])
    opac = ""
    if not _opaca(c):
        opac = "," + (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@top{n_cam}", c["st"])
                      if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
    r = g.rotulo("t")
    g.filtros.append(f"[{k}:v:0]trim=start={vc._tempo_ffmpeg(s0 - ss)}:end={vc._tempo_ffmpeg(c['s'] - ss + c['fonte'])},"
                     f"setpts=(PTS-{s0 - ss:.6f}/TB)/{c['v']:.6f},"
                     f"fps=fps={g.fps:.3f}:start_time=0,tpad=stop_mode=clone:stop_duration={vc._tempo_ffmpeg(g.fd)},"
                     + ",".join(passos)
                     + f",settb=AVTB,setpts=PTS-STARTPTS+round({_entra(c['st'] + pula, g.fd):.9f}/TB),"
                     f"trim=end={min(g.total, c['st'] + c['dur']) - g.fd / 2:.6f}{opac},format=rgba,hwupload[{r}]")
    tl = f"(ot-{c['st']:.6f})"
    kx = _escala(c, tl)
    return [(f"[{r}]", _posicao(c, kx, *_tam(c, c["mw"], c["mh"], kx, tl), tl))]


def _entrada_imagem(g, c, n_cam):
    """Imagem (PNG parado ou sequência de texto animado) preparada na CPU como no exportador e enviada pequena.
    Devolve [(rótulo, posição)] — a sombra projetada, se houver, vem antes (por baixo)."""
    seq = c.get("seq")
    # efeito com parâmetro animado (Desfoque: gblur + sendcmd, vc._fx_animados) roda a cada quadro, depois do loop
    ids_anim = {f.get("id") for f in c.get("fxk") or [] if f.get("id")}
    tem_anim = any((f.get("p") or {}) for f in c.get("fxk") or [])
    efeitos = [e for e in vc._filtros_fx([f for f in c["fx"] if not (tem_anim and f.get("id") in ids_anim)], c["mw"], c["mh"], f"p{n_cam}")
               if not e.startswith(vc._NIT_NO_YUV)]
    bw, bh = c["mw"], c["mh"]
    recorte = []
    if not seq and not tem_anim and not any(f.get("t") in ("blur", "b3d") and f.get("on") is not False for f in c["fx"]):
        bb = vc._bbox_alfa(c["path"])
        if bb and abs(bb[4] - c["mw"]) <= 1 and abs(bb[5] - c["mh"]) <= 1:
            x0, y0, bw, bh, Wi, Hi = bb
            recorte = [f"crop={bw}:{bh}:{x0}:{y0}"]
            c["ox"] += x0 + bw / 2 - Wi / 2
            c["oy"] += y0 + bh / 2 - Hi / 2
    # reduzida UMA vez ao maior tamanho que chega a ter na tela (escala × pico do Pulsar)
    maior = (max([c["sc"]] + [p[1] for p in c["kf"].get("sc", [])])) * vc._ca_pulso_max(c.get("ca"))
    red = min(1.0, maior * 1.02)
    tw, th = max(2, round(bw * red)), max(2, round(bh * red))
    n_q = int(math.ceil(c["dur"] * g.fps)) + 1
    # o desfoque animado mede em px da mídia: na textura reduzida, o sigma encolhe junto
    fx_anim = vc._fx_animados(c.get("fxk"), c["mw"] * red, c["mh"] * red, c["dur"], g.fps, f"pbl{n_cam}") if tem_anim else None
    # rotação (a placa só posiciona): fixa = a textura girada uma vez; animada = girada a cada quadro num quadro do
    # tamanho da diagonal (como o exportador de CPU). RW×RH = tamanho da textura girada; ang = o ângulo para a âncora
    car_t, car_tl = vc._ca_exprs(c.get("ca"), "t")["rot"], vc._ca_exprs(c.get("ca"), tl_img := f"(ot-{c['st']:.6f})")["rot"]
    giro_fixo = giro_anim = None
    RW, RH, ang = tw, th, None
    if "rot" in c["kf"] or car_t:
        e = vc._expr_kf(c["kf"]["rot"], "t") if "rot" in c["kf"] else f"{c['rot']:.5f}"
        D = int(math.ceil(math.hypot(tw, th))) + 2
        D += D % 2
        giro_anim = f"rotate=a='(({e}){'+' + car_t if car_t else ''})*PI/180':c=black@0:ow={D}:oh={D}"
        RW = RH = D
        ang = f"({_expr(c, 'rot', c['rot'], tl_img)}){'+' + car_tl if car_tl else ''}"
    elif abs(c["rot"] % 360) > 1e-4:
        rad = math.radians(c["rot"])
        RW = int(math.ceil(tw * abs(math.cos(rad)) + th * abs(math.sin(rad)))) + 2
        RH = int(math.ceil(tw * abs(math.sin(rad)) + th * abs(math.cos(rad)))) + 2
        RW, RH = RW + RW % 2, RH + RH % 2
        giro_fixo = f"rotate={rad:.6f}:c=black@0:ow={RW}:oh={RH}"
        ang = f"{c['rot']:.6f}"
    depois = ([fx_anim] if fx_anim else []) + ([giro_anim] if giro_anim else [])
    if seq:
        k = g.entrada(["-f", "concat", "-safe", "0", "-i", seq])
        cadeia = (f"[{k}:v:0]trim=start={vc._tempo_ffmpeg(c['s'])}:end={vc._tempo_ffmpeg(c['s'] + c['fonte'])},"
                  f"setpts=PTS-STARTPTS,{PARA_RGB_IMG}," + ",".join(efeitos + [f"scale={tw}:{th}:flags=lanczos"]
                                                                  + ([giro_fixo] if giro_fixo else [])
                                                                  + [f"fps=fps={g.fps:.3f}:start_time=0"] + depois))
    else:
        k = g.entrada(["-i", c["path"]])
        cadeia = (f"[{k}:v:0]{PARA_RGB_IMG}," + ",".join(efeitos + recorte + [f"scale={tw}:{th}:flags=lanczos"]
                                                          + ([giro_fixo] if giro_fixo else [])
                                                          + [f"loop=loop={n_q - 1}:size=1:start=0",
                                                             "settb=AVTB", f"setpts=N/({g.fps:.3f}*TB)"] + depois))
    fim = min(g.total, c["st"] + c["dur"])
    if not _opaca(c):
        cadeia += "," + (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@pop{n_cam}")
                         if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
    # base de tempo em µs: a do PNG (1/25 s) arredondava o início para múltiplos de 0,04 s e o 1º quadro sumia (preto)
    cadeia += f",format=rgba,settb=AVTB,setpts=PTS-STARTPTS+round({_entra(c['st'], g.fd):.9f}/TB),trim=end={fim - g.fd / 2:.6f}"
    tl = f"(ot-{c['st']:.6f})"   # ot = tempo do quadro de SAÍDA (o t do libplacebo é o da entrada)
    kx = _escala(c, tl)
    if ang is not None:   # textura girada: o tamanho na tela é o dela (em px da mídia = textura ÷ redução) × escala
        wv, hv = f"({RW / red:.5f}*({kx}))", f"({RH / red:.5f}*({kx}))"
    else:
        wv, hv = _tam(c, bw, bh, kx, tl)
    sombra = vc._sombra_camada(c)
    r = g.rotulo("i")
    if not sombra:
        g.filtros.append(f"{cadeia},hwupload[{r}]")
        return [(f"[{r}]", _posicao(c, kx, wv, hv, tl, ang=ang))]
    # sombra: a transparência da imagem na cor da sombra, desfocada (em px da textura: desvio × redução) e posta por
    # baixo, deslocada — como _sombra_camada no exportador
    R, G, B, op, dx, dy, sig = sombra
    sig_t = sig * red / max(1e-3, maior)
    m = int(math.ceil(3 * sig_t)) + 2
    rs = g.rotulo("s")
    g.filtros.append(f"{cadeia},split[{r}a][{rs}a]")
    g.filtros.append(f"[{r}a]hwupload[{r}]")
    g.filtros.append(f"[{rs}a]pad=iw+{2 * m}:ih+{2 * m}:{m}:{m}:color=black@0,lutrgb=r={R}:g={G}:b={B}:a='val*{op:.4f}'"
                     + (f",format=gbrap,gblur=sigma={sig_t:.3f}:planes=8,format=rgba" if sig_t >= 0.3 else "")
                     + f",hwupload[{rs}]")
    esc = f"(({kx})/{red:.6f})"
    wsv, hsv = f"(({RW}+{2 * m})*{esc})", f"(({RH}+{2 * m})*{esc})"
    return [(f"[{rs}]", _posicao(c, kx, wsv, hsv, tl, dx, dy, ang=ang)), (f"[{r}]", _posicao(c, kx, wv, hv, tl, ang=ang))]


def _arvore(vals, padrao):
    """if(lt(in_idx, …)) balanceado: o avaliador do ffmpeg aceita ~100 níveis de aninhamento."""
    def rec(lo, hi):
        if lo == hi:
            return vals.get(lo, padrao)
        m = (lo + hi) // 2
        return f"if(lte(in_idx,{m}),{rec(lo, m)},{rec(m + 1, hi)})"
    return rec(0, max(vals) if vals else 0)


def _compor(g, fundo, itens, fmt=_FMT_MEIO):
    """Um libplacebo: o fundo (entrada 0, tela inteira) + cada item no seu lugar. Devolve o rótulo da saída."""
    if not itens:
        return fundo
    px, py, pw, ph = {0: "0"}, {0: "0"}, {0: "ow"}, {0: "oh"}
    for i, (_, (x, y, w, h)) in enumerate(itens, 1):
        px[i], py[i], pw[i], ph[i] = x, y, w, h
    r = g.rotulo("c")
    # disable_linear: mistura (opacidade, bordas do texto) e redimensiona nos valores de cor como a CPU (overlay/scale).
    # Em luz linear um branco a 50% sobre preto saía Y 176 em vez de 126: fades claros demais, fim sem escurecer
    g.filtros.append(f"{fundo}{''.join(rot for rot, _ in itens)}libplacebo=inputs={len(itens) + 1}:w={g.W}:h={g.H}:"
                     f"fps={g.fps:.3f}:format={fmt}:disable_linear=1:"
                     f"pos_x='{_arvore(px, '0')}':pos_y='{_arvore(py, '0')}':"
                     f"pos_w='{_arvore(pw, 'ow')}':pos_h='{_arvore(ph, 'oh')}'[{r}]")
    return f"[{r}]"


def _multiplicar(g, atual, c, n, info, pasta):
    """Mesclagem Multiplicar como a CPU (RGB): fundo × (camada sobre BRANCO) — onde a camada é transparente o branco não
    muda nada; com alfa a, dá fundo·(1−a) + fundo·camada·a, a conta do blend+maskedmerge do exportador. Só no trecho da
    camada, tudo na placa (blend_vulkan multiplica em RGB; medido: branco × (128,192,64) = (127,191,63))."""
    # sem dividir o vídeo: a máscara (camada sobre branco) cobre a timeline toda e é branca fora do trecho da camada —
    # multiplicar por branco não muda nada. (Dividir e recortar um ramo acumulava quadros na placa: memória esgotada)
    itens = _entrada_video(g, c, info, pasta, n) if c["tipo"] == "video" else _entrada_imagem(g, c, n)
    k = g.entrada(["-f", "lavfi", "-i", f"color=white:s={g.W}x{g.H}:r={g.fps:.3f}:d={g.total:.6f}"])
    w, b = g.rotulo("w"), g.rotulo("m")
    g.filtros.append(f"[{k}:v:0]format=rgba,hwupload[{w}]")
    mascara = _compor(g, f"[{w}]", itens, fmt="rgba")
    g.filtros.append(f"{atual}libplacebo=format=rgba:disable_linear=1[{b}r]")
    g.filtros.append(f"[{b}r]{mascara}blend_vulkan=all_mode=multiply,libplacebo=format={_FMT_MEIO}:disable_linear=1[{b}]")
    return f"[{b}]"


def _shader_lc(sig, k, nit, vig, W, H):
    """Clareza (gaussiano σ na luma + Y += k·(Y−borrado)·4Y(1−Y), faixa cheia), Vinheta (cos⁴ do ângulo, como o
    vignette do ffmpeg, multiplicando o RGB = Y e o afastamento do cinza de U/V) e Nitidez (unsharp 5×5 binomial,
    faixa TV) — as fórmulas do exportador de CPU, em passadas de shader do libplacebo (formato mpv)."""
    partes = []
    ent = "HOOKED"
    if abs(k) > 1e-4 and sig > 0.3:
        # desfoque numa cópia 1/4 (medido: igual a olho, PSNR 68 dB) — a σ cai na mesma proporção
        f = 4 if sig >= 6 else 2 if sig >= 3 else 1
        s = math.sqrt(max(0.09, sig * sig - f * f / 12.0)) / f
        r = max(1, int(math.ceil(3 * s)))
        pesos = [math.exp(-(i * i) / (2 * s * s)) for i in range(r + 1)]
        tot = pesos[0] + 2 * sum(pesos[1:])
        pesos = [p / tot for p in pesos]

        def passada(nome, entrada, dx, dy, tam):
            soma = "\n".join(f"    s += {pesos[i]:.8f} * ({entrada}_texOff(vec2({dx * i}, {dy * i})).x + "
                             f"{entrada}_texOff(vec2({-dx * i}, {-dy * i})).x);" for i in range(1, r + 1))
            return (f"//!HOOK LUMA\n//!BIND {entrada}\n//!SAVE {nome}\n{tam}//!COMPONENTS 1\n//!DESC borra {nome}\n"
                    f"vec4 hook() {{\n    float s = {pesos[0]:.8f} * {entrada}_texOff(vec2(0.0)).x;\n{soma}\n"
                    f"    return vec4(s, 0.0, 0.0, 0.0);\n}}\n")
        tam = f"//!WIDTH HOOKED.w {f} /\n//!HEIGHT HOOKED.h {f} /\n" if f > 1 else ""
        if f > 1:
            partes.append(f"//!HOOK LUMA\n//!BIND HOOKED\n//!SAVE PQ\n{tam}//!COMPONENTS 1\n//!DESC reduz\n"
                          f"vec4 hook() {{ return vec4(HOOKED_tex(HOOKED_pos).x, 0.0, 0.0, 0.0); }}\n")
            partes.append(passada("BH", "PQ", 1, 0, tam))
        else:
            partes.append(passada("BH", "HOOKED", 1, 0, tam))
        partes.append(passada("BV", "BH", 0, 1, tam))
        partes.append(f"//!HOOK LUMA\n//!BIND HOOKED\n//!BIND BV\n//!SAVE CL\n//!COMPONENTS 1\n//!DESC clareza\n"
                      f"vec4 hook() {{\n    float y = HOOKED_tex(HOOKED_pos).x, b = BV_tex(HOOKED_pos).x;\n"
                      f"    float x = (y - 16.0/255.0) * (255.0/219.0), m = (b - 16.0/255.0) * (255.0/219.0);\n"
                      f"    x = clamp(x + {k:.5f} * (x - m) * 4.0 * x * (1.0 - x), 0.0, 1.0);\n"
                      f"    return vec4(x * (219.0/255.0) + 16.0/255.0, 0.0, 0.0, 0.0);\n}}\n")
        ent = "CL"
    fator = ""
    if vig > 0.001:
        # vignette do ffmpeg (modo natural): cos(ângulo × distância/diagonal)⁴, centro no meio do quadro
        fator = (f"    vec2 d = (HOOKED_pos - 0.5) * vec2({W:.1f}, {H:.1f});\n"
                 f"    float c = cos({vig:.5f} * length(d) / {math.hypot(W, H) / 2:.3f}); float f = c * c * c * c;\n")
    if fator or ent != "HOOKED":
        luma = (f"    float x = (y - 16.0/255.0) * (255.0/219.0);\n    x = x * f;\n"
                f"    y = x * (219.0/255.0) + 16.0/255.0;\n") if fator else ""
        partes.append(f"//!HOOK LUMA\n//!BIND HOOKED\n" + (f"//!BIND {ent}\n" if ent != "HOOKED" else "")
                      + f"//!SAVE VG\n//!COMPONENTS 1\n//!DESC vinheta luma\nvec4 hook() {{\n"
                      f"    float y = {ent}_tex(HOOKED_pos).x;\n{fator}{luma}    return vec4(y, 0.0, 0.0, 0.0);\n}}\n")
        ent = "VG"
    if fator:
        partes.append(f"//!HOOK CHROMA\n//!BIND HOOKED\n//!DESC vinheta cor\nvec4 hook() {{\n    vec4 u = HOOKED_tex(HOOKED_pos);\n"
                      f"{fator}    u.xy = 0.5 + (u.xy - 0.5) * f;\n    return u;\n}}\n")
    if nit > 0.001:
        bi = [1, 4, 6, 4, 1]
        termos = " + ".join(f"{bi[i] * bi[j]}.0 * {ent}_texOff(vec2({i - 2}, {j - 2})).x" for i in range(5) for j in range(5))
        partes.append(f"//!HOOK LUMA\n//!BIND {ent}\n//!DESC nitidez\nvec4 hook() {{\n"
                      f"    float c = {ent}_texOff(vec2(0.0)).x;\n    float b = ({termos}) / 256.0;\n"
                      f"    return vec4(clamp(c + {nit:.5f} * (c - b), 0.0, 1.0), 0.0, 0.0, 0.0);\n}}\n")
    elif ent != "HOOKED":
        partes.append(f"//!HOOK LUMA\n//!BIND {ent}\n//!DESC fim\nvec4 hook() {{ return vec4({ent}_tex({ent}_pos).x, 0.0, 0.0, 0.0); }}\n")
    return "\n".join(partes)


def _ajuste(g, entrada, c, pasta, mtx="bt709"):
    """Camada de ajuste (Luz e Cor) no trecho dela: o composto de baixo passa pela LUT e pelo shader e volta por cima
    só enquanto a camada existe (uma entrada do libplacebo aparece só enquanto tem quadros). Com Desfoque/Aberração/
    Brilho (_fx_hibrido) o trecho desce e passa pelos filtros do exportador de CPU (RGB, a Nitidez depois de voltar a YUV).
    Com opacidade (fixa ou animada) o trecho também desce: os efeitos e o alfa da opacidade (sendcmd no tempo da timeline,
    o trim não zera o tempo) em RGBA, e o libplacebo o mistura por cima do composto como faz o overlay da CPU."""
    opaco = _opaca(c)
    if not opaco and c["op"] <= 0.001 and "op" not in c["kf"]:
        return entrada
    if _fx_hibrido(c["fx"]):
        efs = vc._filtros_fx(c["fx"], g.W, g.H, f"a{g.rot}")
        nit = ",".join(e[len(vc._NIT_NO_YUV):] for e in efs if e.startswith(vc._NIT_NO_YUV))
        efs = [e for e in efs if not e.startswith(vc._NIT_NO_YUV)]
        # o que chega pode ser a base (_FMT_CAM), a composição (_FMT_MEIO) ou outro ajuste que subiu da CPU: um passo
        # do libplacebo deixa o formato exato para o hwdownload
        desce = (f"libplacebo=format={_FMT_MEIO}:disable_linear=1,hwdownload,format={_FMT_MEIO},"
                 f"scale=in_color_matrix={mtx},format=rgba")
        if not (efs or nit):
            passos = []
        elif opaco:
            passos = [desce + "," + ",".join(efs) + f",scale=out_color_matrix={mtx}:out_range=tv,format=yuv420p"
                      + (f",{nit}" if nit else "") + ",hwupload"]
        else:
            a = (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@aop{g.rot}", c["st"])
                 if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
            passos = [desce + "," + ",".join(efs + [a]) + ",format=rgba,hwupload"]
    else:
        passos = _passos_lc(g, c["fx"], g.W, g.H, pasta, f"a{g.rot}")
    if not passos:
        return entrada
    ini, fim = max(0.0, c["st"]), min(g.total, c["st"] + c["dur"])
    if fim - ini < g.fd / 2:   # nenhum quadro da saída: um ramo vazio travava filtros que esperam quadro (blend da vinheta)
        return entrada
    # Trecho que começa tarde no bloco: com trim=start o composto não anda até chegar o 1º quadro do trecho, e o outro
    # ramo do split guarda TODOS os quadros até lá na placa (Gil, ajuste aos 9,6 s de um bloco: ~570 quadros; em 16 bits,
    # 6,8 GB → memória esgotada, 2026-10-12). Então o ramo anda desde o início do bloco, com alfa 0 antes do trecho.
    hib = _fx_hibrido(c["fx"])
    tarde = ini > 0.5 and (opaco or not hib)   # híbrido com opacidade já leva o alfa pela CPU (sendcmd): fica como era
    if (not opaco and not hib) or tarde:
        # opacidade na placa: o alfa de cada quadro num shader e o trecho composto por cima do original
        arq = os.path.join(pasta, f"op_a{g.rot}.glsl")
        with open(arq, "w", encoding="utf-8") as fh:
            fh.write(_shader_opacidade(c, ini, fim, g.fps, 0.0 if tarde else None))
        passos = passos + [f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format=rgba:disable_linear=1"]
    if opaco and ini <= g.fd / 2 and fim >= g.total - g.fd / 2:
        r = g.rotulo("a")
        g.filtros.append(f"{entrada}{','.join(passos)}[{r}]")
        return f"[{r}]"
    a, b = g.rotulo("a"), g.rotulo("a")
    g.filtros.append(f"{entrada}split[{a}][{b}x]")
    # o trim decide pelo FIM de cada quadro (fica se termina depois do start e até o end): ±¼ de quadro pega do quadro que
    # começa em ini ao que termina em fim. Com ini − ½ quadro a camada entrava e saía um quadro antes (medido 2026-10-10)
    corte = f"trim=end={fim + g.fd / 4:.6f}" if tarde else f"trim=start={ini + g.fd / 4:.6f}:end={fim + g.fd / 4:.6f}"
    g.filtros.append(f"[{b}x]{corte},{','.join(passos)}[{b}]")
    return _compor(g, f"[{a}]", [(f"[{b}]", ("0", "0", "ow", "oh"))])


def _base(g, segmentos, path, info):
    """Trilha base como na CPU: trechos do vídeo principal (encaixados no quadro, centralizados) e vazios pretos
    emendados com concat — o concat conta os quadros que cada trecho realmente gera (76 para 76,98; 149 para 150,0:
    depende dos tempos da fonte), então emendar igual à CPU é a única forma de cair nos mesmos quadros. Tudo na placa."""
    pecas = vc._normalizar_segmentos(segmentos, info["duration"])
    # vazio do fim (a normalização tira o de depois do último trecho): a base cobre a timeline toda (o -t corta o resto)
    usado = sum(p[1] if p[0] == "gap" else p[1] - p[0] for p in pecas)
    if g.total + 1.0 - usado > 0.02:
        pecas = pecas + [["gap", g.total + 1.0 - usado]]
    if not any(p[0] != "gap" for p in pecas):
        k = g.entrada(["-f", "lavfi", "-i", f"color=black:s={g.W}x{g.H}:r={g.fps:.3f}:d={g.total:.6f}"])
        g.filtros.append(f"[{k}:v:0]format=yuv420p,hwupload[fundo]")
        return "[fundo]"
    rot = int(info.get("rotation") or 0) % 360
    vk = _ler_na_placa(info)
    mw, mh = info["width"], info["height"]
    kf = min(g.W / mw, g.H / mh) if mw and mh else 1.0
    w, h = max(2, int(mw * kf) // 2 * 2), max(2, int(mh * kf) // 2 * 2)
    partes = []
    for i, p in enumerate(pecas):
        r = g.rotulo("b")
        if p[0] == "gap":
            g.filtros.append(f"color=c=black:s={g.W}x{g.H}:r={g.fps:.3f}:d={vc._tempo_ffmpeg(p[1])},format={_FMT_CAM},"
                             f"hwupload,setsar=1[{r}]")
        else:
            ss = max(0.0, p[0] - _PREROLL)
            pre = (["-hwaccel", "vulkan", "-hwaccel_output_format", "vulkan"] if vk else []) + ["-threads", "2"]
            if rot and vk:
                pre += ["-display_rotation:v:0", "0"]
            k = g.entrada(pre + (["-ss", vc._tempo_ffmpeg(ss)] if ss > 0 else [])
                          + ["-t", vc._tempo_ffmpeg(p[1] - ss + 1.0), "-i", path])
            giro = f"rotate={_GIRO[rot]}:" if rot in _GIRO and vk else ""
            sobe = "" if vk else "format=yuv420p,hwupload,"
            g.filtros.append(f"[{k}:v:0]{_marca_cor(path, info)}trim=start={vc._tempo_ffmpeg(p[0] - ss)}:"
                             f"end={vc._tempo_ffmpeg(p[1] - ss)},setpts=PTS-STARTPTS,{sobe}"
                             f"libplacebo={giro}w={g.W}:h={g.H}:pos_w={w}:pos_h={h}:format={_FMT_CAM}:disable_linear=1,"
                             f"setsar=1,fps=fps={g.fps:.3f}:start_time=0[{r}]")
        partes.append(f"[{r}]")
    g.filtros.append(f"{''.join(partes)}concat=n={len(partes)}:v=1:a=0[fundo]")
    return "[fundo]"


def montar(lay, W, H, fps, total, pasta, segmentos=None, path=None, info=None):
    """Grafo da timeline (trilha base + camadas de baixo para cima) → (_Grafo, rótulo final na placa)."""
    g = _Grafo(W, H, fps, total)
    atual, pendentes = _base(g, segmentos, path, info), []
    infos = {}
    for n, c in enumerate(lay):
        if c["tipo"] == "ajuste":
            atual = _compor(g, atual, pendentes)
            pendentes = []
            atual = _ajuste(g, atual, c, pasta, _mtx(info))
            continue
        if c["tipo"] == "video" and c["path"] not in infos:
            infos[c["path"]] = vc.probe(c["path"])
        if c.get("bm"):   # Multiplicar: o que está embaixo é composto antes, e a camada multiplica o resultado
            atual = _compor(g, atual, pendentes)
            pendentes = []
            atual = _multiplicar(g, atual, c, n, infos.get(c["path"]), pasta)
            continue
        if c["tipo"] == "video" and vc._clipe_tem_alfa(c["path"]):
            pendentes += _entrada_video_alfa(g, c, n)
        elif c["tipo"] == "video":
            pendentes += _entrada_video(g, c, infos[c["path"]], pasta, n)
        else:
            pendentes += _entrada_imagem(g, c, n)
        if len(pendentes) >= 24:   # libplacebo com muitas entradas: compõe em lotes (a ordem de empilhar se mantém)
            atual = _compor(g, atual, pendentes)
            pendentes = []
    atual = _compor(g, atual, pendentes)
    return g, atual


# ─────────────────────────────── exportação ───────────────────────────────

# Exportação em blocos na placa: timeline com muitos vídeos (Respeite o seu voto: 117 camadas, FX30 4K) não cabe com
# todas as leituras abertas — o ffmpeg abre todas as entradas no começo (80 s parado em 0% e memória estourada). Como o
# Premiere/Resolve, que só leem o que toca agora: a timeline é cortada em blocos (nos cortes, vc._cortes_blocos), cada
# bloco leva só as camadas que aparecem nele, os blocos rodam um após o outro (a placa é uma só) e são emendados sem
# recodificar. Só com a trilha base de vazios (a mesma condição do exportador de CPU por blocos).
_BLOCO_PLACA_S = float(os.environ.get("CANIVETE_BLOCO_SEG") or 12)   # o teste força blocos de 1 s


def _no_bloco(c, a):
    """Cópia da camada com a timeline começando em `a` (as funções de entrada mudam a camada: âncora do recorte)."""
    c = copy.deepcopy(c)
    c["st"] -= a
    if c["st"] < -1e-6 and c["tipo"] == "video":
        c["pula"] = -c["st"]
    return c


def _blocos(lay, total, fps, path):
    """[(início, fim, quadros, camadas do bloco)] ou None se algum bloco ainda não couber na memória da placa.
    Blocos adaptativos: o bloco que não cabe no tamanho padrão é dividido (metade, até ~1,5 s) — SÓ ele: antes um trecho
    pesado encolhia os blocos da timeline inteira (documentário do Gil, 20 min: tudo em blocos de ~5 s, cada um abrindo
    ffmpeg, placa e encoder de novo). A propaganda KANIVETE tinha 70 camadas nos primeiros 12 s (2026-10-11)."""
    n_q = int(round(total * fps))
    spans = [(c["st"], c["st"] + c["dur"], c["tipo"] == "video") for c in lay]
    # só o que cobre ao menos meio quadro do bloco: camadas fora da grade da saída (30 qps numa saída de 29,97)
    # tocavam a borda por uma fração de quadro e entravam sem nenhum quadro — a vinheta da camada de ajuste
    # (movie em loop + blend) ficava esperando para sempre (Respeite, bloco 1: travado em 3%, 2026-10-10)
    meio = 0.5 / fps

    def dividir(k0, k1, alvo):
        a, b = k0 / fps, k1 / fps
        sub = [_no_bloco(c, a) for c in lay if c["st"] < b - meio and c["st"] + c["dur"] > a + meio]
        if cabe_na_placa(None, sub, path):
            return [(a, b, k1 - k0, sub)]
        if alvo <= 1.5 or k1 - k0 < 4:
            return None
        alvo = max(1.5, alvo / 2)
        sp = [(x - a, y - a, v) for x, y, v in spans if y > a and x < b]
        cortes = vc._cortes_blocos(sp, k1 - k0, fps, alvo)
        if len(cortes) <= 2:   # curto demais para o corte "bom": ao meio
            cortes = [0, (k1 - k0) // 2, k1 - k0]
        out = []
        for c0, c1 in zip(cortes, cortes[1:]):
            r = dividir(k0 + c0, k0 + c1, alvo)
            if r is None:
                return None
            out += r
        return out

    cortes = vc._cortes_blocos(spans, n_q, fps, _BLOCO_PLACA_S)
    out = []
    for k0, k1 in zip(cortes, cortes[1:]):
        r = dividir(k0, k1, _BLOCO_PLACA_S)
        if r is None:
            return None
        out += r
    return out


def _blocos_juntos(blocos, path):
    """Quantos blocos rodam ao mesmo tempo na placa: 2 se os dois maiores cabem juntos na memória livre (a placa e o
    encoder ficavam pela metade — Gil: CPU 19%, placa 57% — com um bloco por vez). CANIVETE_PLACA_PAR força."""
    try:
        n = int(os.environ.get("CANIVETE_PLACA_PAR") or 0)
    except ValueError:
        n = 0
    if n > 0:
        return n
    if len(blocos) < 2:
        return 1
    maiores = sorted((memoria_estimada(None, sub, path) for _, _, _, sub in blocos), reverse=True)[:2]
    return 2 if sum(maiores) * 2.6 + memoria_em_uso() <= 0.92 * memoria_placa() else 1

def exportar(args, aberto, pasta_saida, prog, stop_event, proc_holder=None):
    """Exporta a timeline na placa. None = não é para a placa (motivo em args['_motivo']); senão o resultado de
    exportar_video ({success, ...}). Falha com success False → quem chamou refaz pela CPU."""
    op = dict(args.get("opcoes") or {})
    fmt = str(args["formato_saida"]).lower()
    cfg = vc.FORMATOS_SAIDA.get(fmt, vc.FORMATOS_SAIDA["mp4"])
    codec = str(op.get("codec") or "h264").lower()
    vcodec = "hevc" if cfg.get("vcodec") == "h264" and codec == "hevc" else cfg.get("vcodec")
    bits = 10 if str(op.get("bits")) == "10" else 8
    try:
        info = vc.probe(args["path"])
    except Exception:
        return None
    W, H = (int(args["quadro"][0]), int(args["quadro"][1])) if args.get("quadro") else (info["width"], info["height"])
    W, H = W + (W % 2), H + (H % 2)
    info = {**info, "fps": info.get("fps_timeline") or vc.taxa_timeline(info.get("fps"))}   # taxa cravada da timeline
    lay = vc._normalizar_camadas(args["camadas"], args["path"])
    vc._camadas_na_grade(lay, info["fps"])
    alvo_h = vc._RESOLUCOES.get(str(args["resolucao"]), 0)
    m = None if args.get("usar_gpu") else "placa de vídeo desligada na exportação"
    m = m or motivo(args["segmentos"], lay, args.get("legendas"), cfg, vcodec, bits, bool(alvo_h and min(W, H) > alvo_h))
    if m is None and not disponivel():
        m = "placa sem Vulkan/libplacebo"
    # CANIVETE_PLACA_BLOCOS=1: em blocos mesmo cabendo (teste_export --placa-blocos confere as emendas)
    grande = m is None and (os.environ.get("CANIVETE_PLACA_BLOCOS") == "1" or not cabe_na_placa(args["segmentos"], lay, args["path"]))
    if grande and not all(isinstance(s, dict) and s.get("gap") is not None for s in args["segmentos"] or []):
        m = "memória livre da placa insuficiente (4K bruto: Forçar Full HD resolve; ou feche o que usa a placa)"
    if m:
        args["_motivo"] = m
        return None
    fps = float(f'{info["fps"]:.3f}')
    spans = vc._spans_camadas(args["camadas"])
    base_dur = sum((float(s["gap"]) if s.get("gap") is not None else float(s.get("end", 0)) - float(s.get("start", 0)))
                   for s in args["segmentos"] or [])
    total = max([base_dur, float(args["duracao"] or 0)] + [b for a, b, _ in spans if b < 1e8])
    if total * fps < 2:
        return None
    blocos = _blocos(lay, total, fps, args["path"]) if grande else None
    if grande and not blocos:
        args["_motivo"] = "memória livre da placa insuficiente mesmo em blocos (feche o que usa a placa)"
        return None
    q = vc._QUALIDADE.get(str(args["qualidade"]).lower(), vc._QUALIDADE["medium"])
    saida = vc._nome_saida(aberto, cfg["ext"], pasta_saida, op.get("nome"))
    pasta = os.path.join(vc._midia_dir(), "placa_" + uuid.uuid4().hex[:10])
    os.makedirs(pasta, exist_ok=True)
    video = os.path.join(pasta, "video" + (".mp4" if cfg["ext"] in (".mp4", ".mov") else cfg["ext"]))
    audio = os.path.join(pasta, "som.wav") if not args["sem_audio"] else None
    res_som, som_pct, video_pct = {}, [0], [0]
    procs = []

    def _holder(p):
        if p is not None:
            procs.append(p)
        if proc_holder:
            proc_holder(p)

    def _progresso():
        pct = min(98, int(video_pct[0] * 0.97 + som_pct[0] * 0.03))
        prog(pct, f"Exportando na placa de vídeo... {pct}%")

    def _som():
        res_som["r"] = vc.exportar_video(args["path"], args["segmentos"], "wav", args["qualidade"], "original", False,
                                         None, sem_audio=False, camadas=None, audio_segmentos=args["audio_segmentos"],
                                         duracao=total, audio_clipes=args["audio_clipes"], quadro=args["quadro"],
                                         saida=audio, stop_event=stop_event,
                                         on_progress=lambda p, msg: (som_pct.__setitem__(0, p), _progresso()),
                                         proc_holder=_holder)
    t_som = threading.Thread(target=_som, daemon=True) if audio else None
    temp = None
    enc = vc._args_video(dict(cfg, vcodec=vcodec), q, args["usar_gpu"], bits, float(op.get("mbps") or 0))
    cor = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
    # legendas (o mesmo .ass da exportação pela CPU): desenhadas pelo libass no quadro já montado, ao descer da placa
    leg = args.get("legendas")
    ass = vc._gerar_ass(leg["itens"], leg.get("estilo") or {}, W, H) if leg and leg.get("itens") else None

    def _render(lay_r, total_r, segs_r, arq, feitos, pasta_r=None, on_p=None):
        """Monta e codifica [0, total_r] (a timeline inteira ou um bloco) em arq. None = deu certo; senão o erro.
        pasta_r: a do bloco (blocos ao mesmo tempo não dividem o grafo nem os shaders)."""
        pasta_r = pasta_r or pasta
        os.makedirs(pasta_r, exist_ok=True)
        g, final = montar(lay_r, W, H, fps, total_r, pasta_r, segs_r, args["path"], info)
        sub = ""
        if ass:   # num bloco o relógio começa em `feitos`: as legendas usam o tempo da timeline
            sub = (f",setpts=PTS+{feitos:.6f}/TB,subtitles=filename={vc._caminho_filtro(ass)},setpts=PTS-{feitos:.6f}/TB"
                   if feitos > 1e-6 else f",subtitles=filename={vc._caminho_filtro(ass)}")
        # a saída volta a 8 bits (ou 10, no H.265 10 bits) num passo só, com pontilhado (o último filtro pode deixar
        # 16 bits, RGBA ou yuv420p); o libass desenha as legendas em yuv420p10le, não em p010
        fim = ("p010le", ",format=yuv420p10le") if bits == 10 else ("yuv420p", "")
        g.filtros.append(f"{final}libplacebo=format={fim[0]}:disable_linear=1,hwdownload,format={fim[0]}{fim[1]}{sub}[vbaixo]")
        fm, rot_v, args_min = vc.saida_miniatura("[vbaixo]")   # a miniatura do quadro em render (janela do Encoder)
        g.filtros += fm
        g.filtros.append(f"{rot_v}null[vout]")
        grafo = os.path.join(pasta_r, "grafo.txt")
        with open(grafo, "w", encoding="utf-8") as f:
            f.write(";\n".join(g.filtros))
        if os.environ.get("CANIVETE_PLACA_DEBUG") == "1":   # guarda o grafo e o comando para depurar
            shutil.copy(grafo, os.path.join(vc._midia_dir(), f"placa_grafo_{uuid.uuid4().hex[:6]}.txt"))
        cmd = g.cmd + ["-/filter_complex", grafo, "-map", "[vout]", "-t", vc._tempo_ffmpeg(total_r), *enc, *cor,
                       "-an", arq] + args_min
        if os.environ.get("CANIVETE_PLACA_DEBUG") == "1":   # o bloco inteiro (grafo, shaders, comando), para repetir à mão
            dbg = os.path.join(vc._midia_dir(), "placa_dbg", os.path.basename(pasta) + "_" + os.path.basename(pasta_r))
            shutil.copytree(pasta_r, dbg, dirs_exist_ok=True, ignore=shutil.ignore_patterns("*.ts", "*.wav", "*.mp4", "b0*"))
            with open(os.path.join(dbg, "cmd.json"), "w", encoding="utf-8") as f:
                json.dump(cmd, f, ensure_ascii=False)
        on_p = on_p or (lambda p: (video_pct.__setitem__(0, (feitos + p / 100 * total_r) / total * 100), _progresso()))
        rc, err = vc._run_progress(cmd, total_r, on_p, stop_event, _holder)
        if stop_event is not None and stop_event.is_set():
            return {"success": False, "cancelled": True, "error": "Exportação cancelada."}
        if rc != 0 or not os.path.isfile(arq):
            log = os.path.join(vc._midia_dir(), f"placa_falhou_{uuid.uuid4().hex[:6]}.txt")
            try:
                with open(log, "w", encoding="utf-8") as f:
                    f.write(" ".join(cmd) + "\n\n" + ";\n".join(g.filtros) + "\n\n" + (err or ""))
            except OSError:
                log = ""
            return {"success": False, "error": "placa: " + "\n".join(vc._linhas_ffmpeg(err) or [str(rc)]), "log": log}
        return None

    try:
        if t_som:
            t_som.start()
        prog(0, "Exportando na placa de vídeo" + (f" ({len(blocos)} blocos)..." if blocos else "..."))
        if not blocos:
            r = _render(lay, total, args["segmentos"], video, 0.0)
            if r:
                return r
        else:
            ext_b = ".ts" if vcodec in ("h264", "hevc") else ".mkv"
            partes = [(os.path.join(pasta, f"b{i:03d}{ext_b}"), n_b) for i, (a, b, n_b, sub) in enumerate(blocos)]
            feito = [0.0] * len(blocos)   # fração pronta de cada bloco (vários ao mesmo tempo)
            trava = threading.Lock()
            erro = []

            def _um(i):
                if erro or (stop_event is not None and stop_event.is_set()):
                    return
                a, b, n_b, sub = blocos[i]

                def on_p(p, i=i):
                    with trava:
                        feito[i] = p / 100
                        video_pct[0] = sum(f * n for f, (_, _, n, _) in zip(feito, blocos)) / max(1, n_total) * 100
                    _progresso()
                r = _render(sub, n_b / fps, [{"gap": n_b / fps}], partes[i][0], a, os.path.join(pasta, f"b{i:03d}"), on_p)
                if r:
                    if not r.get("cancelled"):
                        r["error"] = f"bloco {i + 1}/{len(blocos)} ({a:.1f}–{b:.1f} s) " + r["error"]
                    erro.append(r)
                else:
                    on_p(100)
                    shutil.rmtree(os.path.join(pasta, f"b{i:03d}"), ignore_errors=True)

            n_total = sum(n for _, _, n, _ in blocos)
            juntos = _blocos_juntos(blocos, args["path"])
            prog(0, f"Exportando na placa de vídeo ({len(blocos)} blocos" + (f", {juntos} ao mesmo tempo" if juntos > 1 else "") + ")...")
            if juntos > 1:
                from concurrent.futures import ThreadPoolExecutor
                with ThreadPoolExecutor(max_workers=juntos) as ex:
                    list(ex.map(_um, range(len(blocos))))
            else:
                for i in range(len(blocos)):
                    _um(i)
                    if erro:
                        break
            if erro:
                return erro[0]
            lista = os.path.join(pasta, "lista.txt")
            with open(lista, "w", encoding="utf-8") as f:   # duração exata de cada pedaço (quadros / fps)
                f.writelines(f"file '{p.replace(chr(92), '/')}'\nduration {n / fps:.6f}\n" for p, n in partes)
            r = subprocess.run([vc.ffmpeg_path(), "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lista,
                                "-c", "copy", video], capture_output=True, text=True, encoding="utf-8", errors="replace",
                               creationflags=vc._creationflags())
            if r.returncode != 0 or not os.path.isfile(video):
                return {"success": False, "error": "placa (juntar blocos): " + "\n".join(vc._linhas_ffmpeg(r.stderr) or [str(r.returncode)])}
        if t_som:
            t_som.join()
            r = res_som.get("r") or {}
            if not r.get("success") or not os.path.isfile(audio):
                audio = None
        prog(99, "Juntando o som...")
        temp = os.path.splitext(saida)[0] + ".part" + cfg["ext"]
        cmd = [vc.ffmpeg_path(), "-y", "-v", "error", "-i", video]
        if audio:
            cmd += ["-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:a", cfg["acodec"]]
            if not cfg["acodec"].startswith("pcm_"):
                cmd += ["-b:a", q["ab"]]
        else:
            cmd += ["-map", "0:v:0"]
        # a etiqueta de cor BT.709 some ao emendar os blocos (o arquivo saía "sem cor definida" e alguns players mostram
        # outro contraste): regravada no próprio fluxo, sem recodificar
        etiqueta = {"h264": "h264_metadata", "hevc": "hevc_metadata"}.get(vcodec)
        cmd += ["-c:v", "copy"] + (["-tag:v", "hvc1"] if vcodec == "hevc" and cfg["ext"] in (".mp4", ".mov") else []) \
            + (["-bsf:v", f"{etiqueta}=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0"]
               if etiqueta else []) + cfg["extra"] + [temp]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           creationflags=vc._creationflags())
        if r.returncode != 0 or not os.path.isfile(temp):
            return {"success": False, "error": "placa (juntar som): " + "\n".join(vc._linhas_ffmpeg(r.stderr) or [str(r.returncode)])}
        os.replace(temp, saida)
        temp = None
    finally:
        if t_som and t_som.is_alive():
            if stop_event is not None:
                stop_event.set()
            t_som.join(timeout=5)
        if temp:
            vc._apagar(temp)
        shutil.rmtree(pasta, ignore_errors=True)
    prog(100, "Concluído!")
    return {"success": True, "output_path": saida, "output_folder": os.path.dirname(saida), "duration": round(total, 2),
            "size": os.path.getsize(saida), "turbo": False, "placa": True, "blocos": len(blocos) if blocos else 0}
