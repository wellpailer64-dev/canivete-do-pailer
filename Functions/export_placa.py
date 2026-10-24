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
import tempfile
import threading
import uuid

from Functions import video_cutter as vc

_vk = None
_vk_le = None    # o decodificador Vulkan devolve a imagem certa? (Iris Xe de notebook: quadro todo verde)
_vk_idx = None   # índice Vulkan da placa usada
_trava_vk = threading.Lock()
PARA_RGB_IMG = "scale=in_color_matrix=bt601,format=rgba"   # foto/PNG: o mesmo do exportador (BT.601)
# rotação do celular (probe: rotation % 360) → rotate do libplacebo (medido contra o autorotate da CPU: 45,8 dB). O
# transpose_vulkan falhava em vídeo de celular girado (e ignora o recorte do quadro decodificado)
_GIRO = {90: 270, 270: 90, 180: 180}
_CODECS_VK = ("h264", "hevc", "av1")


def _ler_na_placa(info):
    """Decodificar na placa: o que ela lê (H.264/HEVC/AV1 em 4:2:0); o resto é lido na CPU e sobe."""
    if not _vk_le:
        return False
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
# Redimensionar com qualidade de master (Nautic Bay, 2026-10-24): o padrão do libplacebo reduz em Mitchell (macio) e o
# 4K do drone chegava ao 1080 com 1/3 da nitidez de um Lanczos (Laplaciano 520 × 1830; reduzir + zoom = 2 passagens
# macias). Todo passo que muda o tamanho usa Lanczos para reduzir e EWA Lanczos para ampliar.
_ESC = "downscaler=lanczos:upscaler=ewa_lanczos"
_FMT_MEIO = "yuv444p16le"
_FMT_ALFA = "rgba64le"   # camada com transparência feita na placa (fade de clipe)


def _vk_dev():
    """Índice Vulkan da placa: a dedicada (discrete), não a 0. Em notebook híbrido a 0 costuma ser a integrada (Iris Xe),
    e o export "na placa" saía todo verde nela com a GTX parada (relato do notebook i5-11300H + GTX 1650, 2026-10-16)."""
    global _vk_idx
    if _vk_idx is None:
        _vk_idx = 0
        try:
            r = subprocess.run([vc.ffmpeg_path(), "-v", "verbose", "-init_hw_device", "vulkan=vk:99", "-f", "lavfi",
                                "-i", "nullsrc", "-frames:v", "1", "-f", "null", "-"],
                               capture_output=True, text=True, timeout=30, creationflags=vc._creationflags())
            gpus = re.findall(r"^\[Vulkan[^\]]*\]\s+(\d+): (.+?) \((\w+)\)", r.stderr or "", re.M)
            dedicadas = [int(i) for i, _n, t in gpus if t == "discrete"]
            if dedicadas:
                _vk_idx = dedicadas[0]
        except Exception:
            pass
    return _vk_idx


def _vk_arg():
    return f"vulkan=vk:{_vk_dev()}"


def _cor_ok(cmd):
    """Roda o ffmpeg e confere que o quadro de saída (1×1 rgb24) é o vermelho de entrada (200, 40, 30), não verde/preto."""
    r = subprocess.run(cmd, capture_output=True, timeout=60, creationflags=vc._creationflags())
    px = r.stdout[:3]
    return r.returncode == 0 and len(px) == 3 and abs(px[0] - 200) < 30 and abs(px[1] - 40) < 30 and abs(px[2] - 30) < 30


def _quadros_zerados(video, total):
    """O vídeo saiu com quadros YUV zerados (tela verde)? Lê 3 quadros pequenos: com U e V quase todos abaixo de 16 (fora
    da faixa de vídeo; nenhuma imagem de verdade fica assim) em 2 deles, a placa devolveu quadros vazios. Visto num
    notebook com Iris Xe: 140 kb/s, tudo verde e o log dizendo "concluída" (relato 2026-10-16)."""
    ruins = 0
    for f in (0.1, 0.5, 0.9):
        try:
            r = subprocess.run([vc.ffmpeg_path(), "-v", "error", "-ss", f"{max(0.0, total * f):.3f}", "-i", video,
                                "-frames:v", "1", "-vf", "scale=32:18,format=yuv420p", "-f", "rawvideo", "-"],
                               capture_output=True, timeout=30, creationflags=vc._creationflags())
        except Exception:
            continue
        d = r.stdout
        if r.returncode != 0 or len(d) < 864:
            continue
        uv = d[576:864]
        if sum(1 for i in range(144) if uv[i] < 16 and uv[144 + i] < 16) > 0.8 * 144:
            ruins += 1
    return ruins >= 2


def disponivel():
    """A placa faz Vulkan + libplacebo com este ffmpeg? (testado uma vez por sessão). Confere a COR que volta (o teste
    antigo usava preto e passava com a placa devolvendo quadro zerado) e, à parte, a leitura de H.264 pelo Vulkan:
    se só ela falha, os vídeos são lidos na CPU e sobem (_ler_na_placa)."""
    global _vk, _vk_le
    with _trava_vk:
        if _vk is None:
            ff, dev = vc.ffmpeg_path(), ["-init_hw_device", _vk_arg(), "-filter_hw_device", "vk"]
            sai = ["-frames:v", "1", "-f", "rawvideo", "-"]
            try:
                _vk = _cor_ok([ff, "-v", "error"] + dev + [
                    "-f", "lavfi", "-i", "color=0xC8281E:s=64x64:d=0.1",
                    "-vf", "format=yuv420p,hwupload,libplacebo=format=yuv420p,hwdownload,format=yuv420p,"
                           "scale=1:1,format=rgb24"] + sai)
            except Exception:
                _vk = False
            _vk_le = False
            if _vk:
                amostra = os.path.join(tempfile.gettempdir(), f"kn_vk_{uuid.uuid4().hex[:8]}.mp4")
                try:
                    subprocess.run([ff, "-y", "-v", "error", "-f", "lavfi", "-i", "color=0xC8281E:s=256x256:d=0.2:r=30",
                                    "-c:v", "libx264", "-pix_fmt", "yuv420p", amostra],
                                   capture_output=True, timeout=60, creationflags=vc._creationflags())
                    _vk_le = _cor_ok([ff, "-v", "error"] + dev + [
                        "-hwaccel", "vulkan", "-hwaccel_output_format", "vulkan", "-i", amostra,
                        "-vf", "libplacebo=format=yuv420p,hwdownload,format=yuv420p,scale=1:1,format=rgb24"] + sai)
                except Exception:
                    _vk_le = False
                finally:
                    try:
                        os.remove(amostra)
                    except OSError:
                        pass
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


def liberar_placa(cabe, prog=None, espera=15.0):
    """Antes de desistir da placa por memória: tira dela o que o próprio app deixou ocupando — render da prévia em
    andamento (o automático para com a exportação, mas o ffmpeg dele leva segundos para sair), a voz da Kani mantida
    carregada, o motor de chat da Kani (llama.cpp), o Pincel Roto e o gerador de efeitos sonoros — e espera a memória
    baixar (até `espera` s), conferindo `cabe()` de novo. Pailer: 6,6 de 8 GB ocupados ao começar o render, e caía no
    processador (2026-10-12). True se passou a caber."""
    import time
    if prog:
        prog(0, "Liberando a memória da placa de vídeo...")
    for mod, fn in (("render_cache", "cancelar"), ("omnivoice_tool", "descarregar"), ("kani", "parar"),
                    ("pincel_roto", "liberar"), ("gerador_sfx", "liberar")):
        try:
            getattr(__import__(f"Functions.{mod}", fromlist=[fn]), fn)()
        except Exception:
            pass
    fim = time.time() + espera
    while time.time() < fim:
        time.sleep(1.0)
        if cabe():
            return True
    return cabe()


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
    Brilho da camada de ajuste — e a Ondulação (_onda_passos, depois deles)."""
    return all(f.get("t") in ("lc", "ca", "blur", "mo_glow", "onda") or f.get("on") is False for f in fx or [])


# Efeitos que a placa ainda não faz em shader mas o exportador de CPU faz com filtros do ffmpeg: no modo placa o quadro
# DAQUELA camada (ou o trecho da camada de ajuste) desce, passa pelos MESMOS filtros (vc._filtros_fx, mesma ordem e contas)
# e sobe — leitura, redução, montagem das outras camadas e encoder continuam na placa. Respeite o seu voto (72 Chroma Key,
# ajustes com Desfoque e Aberração): ia inteiro pela CPU, 6× a duração (2026-10-10).
# Motion (editor-motion.js): Preenchimento, Inverter e o Brilho da camada de ajuste também têm filtro do ffmpeg
# Cortar, Luma Key, Cantos arredondados e Básico 3D (transições Dividir/Chicote viram esses efeitos) também
# Ondulação (Wave Warp): sozinha ou com Luz e Cor/Aberração/Desfoque vai em shader (_onda_passos); junto de um efeito
# que desce, desce com ele (geq a cada quadro, vc._filtro_onda) e sobe na caixa com a margem
_FX_HIBRIDO = ("key", "lc", "blur", "bc", "ca", "mo_fill", "mo_inv", "mo_glow", "crop", "luma", "rounded", "b3d", "onda", "zoom")


def _fx_hibrido(fx):
    """Tem efeito fora do Luz e Cor e todos estão entre os que descem e voltam (_FX_HIBRIDO)."""
    ativos = [f for f in fx or [] if f.get("on") is not False]
    return bool(ativos) and not _lc_ok(fx) and all(f.get("t") in _FX_HIBRIDO for f in ativos)


def _key_so(fx):
    """Chroma Key que roda inteiro na placa (_shader_key): o ÚLTIMO efeito ativo do clipe, com antes dele só efeitos que
    a placa já faz (_lc_ok: Luz e Cor, Aberração, Desfoque) — eles passam no vídeo e o key recorta o resultado, na
    ordem da lista como a CPU. (Respeite o seu voto: 8 clipes "Luz e Cor → Chroma Key" desciam para a CPU.) Key antes do
    Luz e Cor continua híbrido: o shader do Luz e Cor trabalha em luma/croma, não no RGB com transparência."""
    ativos = [f for f in fx or [] if f.get("on") is not False]
    return (bool(ativos) and ativos[-1].get("t") == "key" and not any(f.get("t") in ("key", "onda") for f in ativos[:-1])
            and _lc_ok(ativos[:-1]))


def _shader_key(v):
    """Chroma Key em passadas de shader do libplacebo (formato mpv), as contas do exportador de CPU (vc._filtros_fx "key"):
    alfa = rampa da diferença de cor (colorchannelmixer + lutrgb, com o valor intermediário em 8 bits como lá), encolher/
    expandir = mínimo/máximo 3×3 repetido (erosion/dilation), suavizar = gaussiano no alfa, e o despill do ffmpeg no
    verde/azul. Roda no RGB da mídia (MAIN, sem luz linear); a saída RGBA leva o alfa direto (não pré-multiplicado).
    No MAIN a cor vem em ponto flutuante SEM trava: o verde da tela tem vermelho −0,06 (BT.709) e o alfa caía de 42 para
    28 — travada em 0..1 como a conversão da CPU/prévia (medido 2026-10-10)."""
    p = vc._key_params(v)
    # "Preservar amarelos": outros = o maior dos dois canais (não a mistura do Equilíbrio) — vc._key_geq
    if p["max"]:
        bruto = ("0.5 * max(c.r, c.g) - 0.5 * c.b + 0.5" if p["azul"] else "0.5 * max(c.r, c.b) - 0.5 * c.g + 0.5")
    else:
        bruto = f"{p['ar']:.5f} * c.r + {p['ag']:.5f} * c.g + {p['ab']:.5f} * c.b + 0.5"
    partes = [f"//!HOOK MAIN\n//!BIND HOOKED\n//!SAVE K0\n//!COMPONENTS 1\n//!DESC chroma alfa\nvec4 hook() {{\n"
              f"    vec3 c = clamp(HOOKED_tex(HOOKED_pos).rgb, 0.0, 1.0);\n"
              f"    float v = clamp({bruto}, 0.0, 1.0);\n"
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
    if p["desc"] > 0.001:
        # descontaminar com o alfa da chave antes de encolher/suavizar (K0): C + desc·(C − tela)·(1−a)/a
        t = p["tela"]
        desp += (f"    float ak = K0_tex(HOOKED_pos).x;\n"
                 f"    if (ak < 1.0) {{ float aa = max(ak, 0.08);\n"
                 f"        c.rgb = clamp(c.rgb + {p['desc']:.5f} * (1.0 - aa) / aa * (c.rgb - vec3({t[0]:.5f}, {t[1]:.5f}, {t[2]:.5f})), 0.0, 1.0); }}\n")
    if p["spill"] > 0.001:
        # despill do ffmpeg (type, mix = Equilíbrio, expand 0, escala −spill no canal da tela); "Preservar amarelos": o máx.
        m = p["eq"]
        if p["azul"]:
            o = "max(c.r, c.g)" if p["max"] else f"(c.r * {m:.5f} + c.g * {1 - m:.5f})"
            desp += (f"    float sm = max(c.b - {o}, 0.0);\n"
                     f"    c.b = max(c.b - {p['spill']:.5f} * sm, 0.0);\n")
        else:
            o = "max(c.r, c.b)" if p["max"] else f"(c.r * {m:.5f} + c.b * {1 - m:.5f})"
            desp += (f"    float sm = max(c.g - {o}, 0.0);\n"
                     f"    c.g = max(c.g - {p['spill']:.5f} * sm, 0.0);\n")
    k0 = "//!BIND K0\n" if p["desc"] > 0.001 and n > 0 else ""
    partes.append(f"//!HOOK MAIN\n//!BIND HOOKED\n//!BIND K{n}\n{k0}//!DESC chroma saida\nvec4 hook() {{\n"
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
    for c in lay:   # Ondulação: shader na placa (_onda_passos); imagem girada com onda gira na placa (_giro_passos),
        # menos com giro constante (ca_rot) ou sombra projetada (a sombra ainda gira na CPU)
        if vc._onda_ativa(c.get("fx")) and c["tipo"] == "imagem" and (c["rot"] % 360 or "rot" in c["kf"]) and (
                vc._ca_exprs(c.get("ca"), "t")["rot"] or vc._sombra_camada(c)):
            return "Ondulação em imagem girada com sombra ou giro constante"
        if vc._onda_ativa(c.get("fx")) and c["tipo"] == "imagem" and vc._ca_exprs(c.get("ca"), "t")["rot"]:
            return "Ondulação em imagem com giro constante"
    for c in lay:
        if c.get("bm") and ((c["bm"] != "multiply" and c["bm"] != "add" and c["bm"] not in _BM_GLSL)
                            or vc._sombra_camada(c)):
            return "modo de mesclagem com sombra projetada"
        # girado: imagem/texto gira na CPU antes de subir (_entrada_imagem); vídeo desce, gira na CPU e sobe (híbrido).
        # Imagem/texto girado COM mesclagem também vai: _mesclar/_multiplicar só posicionam a textura já girada
        # (teste_export --casos giromescla --placa; brilhos em Tela do clipe Brasativa, 2026-10-24)
        gira = c["rot"] or "rot" in c["kf"] or any(f.get("t") == "ca_rot" for f in c.get("ca") or [])
        if gira and (c["tipo"] == "ajuste" or (c.get("bm") and c["tipo"] == "video") or "sx" in c["kf"] or "sy" in c["kf"]
                     or (c["tipo"] == "video" and (_key_so(c["fx"]) or vc._clipe_tem_alfa(c["path"])))):
            return "rotação"
        if c["tipo"] == "ajuste":
            # transições de sobreposição: shader na placa (_shader_ovt); precisam do ponto do corte (c["ovt"]["job"])
            ovt = _ovt_fx(c)
            resto = [f for f in c["fx"] if f not in ovt]
            if ovt and _fx_hibrido(resto):
                return "transição de sobreposição sem o plano da placa"
            if not _lc_ok(resto) and not _fx_hibrido(resto):
                return "camada de ajuste com efeito fora do Luz e Cor"
            if (not _opaca(c) and _fx_hibrido(resto)
                    and any(e.startswith(vc._NIT_NO_YUV) for e in vc._filtros_fx(resto, 64, 64, "m"))):
                return "camada de ajuste com Nitidez e opacidade"
        elif c["tipo"] == "video":
            if vc._clipe_tem_alfa(c["path"]):
                continue   # vídeo com transparência (camada desenhada, Comp): lido e tratado na CPU, sobe em RGBA
            # efeito com quadros-chave: o exportador de CPU só anima o Desfoque (vc._fx_animados), e ele vai num shader
            # (_shader_blur_anim); com Chroma Key/híbrido/giro o clipe ainda vai pela CPU
            if c.get("fxk") and any((f.get("p") or {}) for f in c["fxk"]) and (
                    _key_so(c["fx"]) or _fx_hibrido(c["fx"]) or c["rot"] % 360 or "rot" in c["kf"]):
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
                    "-init_hw_device", _vk_arg(), "-filter_hw_device", "vk"]
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


def _trechos(vals, tol, max_trechos=256):
    """Valores por quadro → trechos retos [(início, fim, valor no início, valor no fim)] (a reta de cada trecho passa a
    ±tol de todos os pontos do meio; uma passada só, pela faixa de inclinações). None se passar de max_trechos."""
    n, trechos, a = len(vals), [], 0
    while a < n:
        b, lo, hi = a, -1e9, 1e9
        while b + 1 < n:
            d = b + 1 - a
            s = (vals[b + 1] - vals[a]) / d
            if not lo - 1e-12 <= s <= hi + 1e-12:
                break
            lo, hi = max(lo, (vals[b + 1] - tol - vals[a]) / d), min(hi, (vals[b + 1] + tol - vals[a]) / d)
            b += 1
        trechos.append((a, b, vals[a], vals[b]))
        a = b + 1
        if len(trechos) > max_trechos:
            return None
    return trechos


def _glf(v):
    """float do GLSL com 9 algarismos (a fração de pixel em fração da largura pede mais que 5 casas) e sempre com ponto."""
    t = f"{v:.9g}"
    return t if ("." in t or "e" in t or "n" in t) else t + ".0"


def _glsl_trechos(nome, trechos):
    """Tabelas de trechos e a função float {nome}(int f) que devolve o valor do quadro f (0 = 1º quadro da camada)."""
    m = len(trechos)
    lst = lambda xs: ", ".join(xs)
    return (f"const int {nome}_T0[{m}] = int[]({lst(str(t[0]) for t in trechos)});\n"
            f"const int {nome}_T1[{m}] = int[]({lst(str(t[1]) for t in trechos)});\n"
            f"const float {nome}_V0[{m}] = float[]({lst(_glf(t[2]) for t in trechos)});\n"
            f"const float {nome}_V1[{m}] = float[]({lst(_glf(t[3]) for t in trechos)});\n"
            f"float {nome}(int f) {{\n    for (int k = 0; k < {m}; k++)\n"
            f"        if (f <= {nome}_T1[k]) return {nome}_T1[k] > {nome}_T0[k] ? mix({nome}_V0[k], {nome}_V1[k], "
            f"float(max(f - {nome}_T0[k], 0)) / float({nome}_T1[k] - {nome}_T0[k])) : {nome}_V0[k];\n"
            f"    return {nome}_V1[{m - 1}];\n}}\n")


def _shader_blur_anim(fxk, W, H, dur, fps, pula=0.0):
    """Desfoque com quadros-chave (editor-fx.js "blur", fxk) num CLIPE de vídeo, na placa: o sigma de cada quadro
    (a conta de vc._fx_animados: 100% = 5% do lado menor, aqui do quadro já reduzido W×H) em trechos retos, e os pesos do
    gaussiano calculados no shader (até 64 amostras por lado, de k em k acima disso). Devolve [shader H, shader V] — UM
    arquivo por passada: o contador `frame` do libplacebo avança a cada passada (medido: com as duas no mesmo arquivo a
    curva corria em dobro). Antes um clipe assim mandava a timeline inteira para a CPU. None se não há desfoque animado
    ou a curva é picada demais."""
    for f in fxk or []:
        if f.get("t") != "blur" or not (f.get("p") or {}).get("amt"):
            continue
        pts = []
        for q in f["p"]["amt"]:
            try:
                pts.append((float(q[0]), float(q[1]), str(q[2]) if len(q) > 2 else "lin", vc._curva_kf(q) if len(q) > 3 else None))
            except Exception:
                continue
        if not pts:
            continue
        pts.sort(key=lambda p: p[0])
        base = max(2, min(W, H)) / 2000.0
        n = max(1, int(math.ceil((dur - pula) * fps)) + 2)
        sig = [min(1000.0, max(0.0, vc._valor_kf(pts, pula + i / fps)) * base) for i in range(n)]
        tr = _trechos(sig, 0.02)
        if tr is None:
            return None
        partes = []
        for dx, dy, nome in ((1, 0, "horizontal"), (0, 1, "vertical")):
            partes.append(f"//!HOOK MAIN\n//!BIND HOOKED\n//!DESC desfoque animado {nome}\n{_glsl_trechos('SIG', tr)}"
                          f"vec4 hook() {{\n    float s = SIG(frame - 1);\n"
                          f"    vec4 c0 = clamp(HOOKED_texOff(vec2(0.0)), 0.0, 1.0);\n    if (s < 0.05) return c0;\n"
                          f"    float r = ceil(3.0 * s), passo = max(1.0, ceil(r / 64.0));\n"
                          f"    vec4 soma = c0; float tot = 1.0;\n"
                          f"    for (float i = passo; i <= r; i += passo) {{\n"
                          f"        float w = exp(-(i * i) / (2.0 * s * s));\n"
                          f"        soma += w * (clamp(HOOKED_texOff(vec2({dx}.0 * i, {dy}.0 * i)), 0.0, 1.0) + "
                          f"clamp(HOOKED_texOff(vec2({-dx}.0 * i, {-dy}.0 * i)), 0.0, 1.0));\n"
                          f"        tot += 2.0 * w;\n    }}\n    return soma / tot;\n}}\n")
        return partes
    return None


def _ovt_fx(c):
    """Transições de sobreposição (editor-ovt.js / transicoes.py) da camada de ajuste, na ordem: as do plano
    (c["ovt"]["job"]["fx"], valores completos — o veFxExport tira as transições da lista de efeitos da camada)."""
    from Functions import transicoes as trs
    job = (c.get("ovt") or {}).get("job") or {}
    return [f for f in job.get("fx") or [] if isinstance(f, dict) and f.get("t") in trs.TIPOS]


def _shader_ovt(t, v, uc, dur, fps, W, H, local0, n):
    """Uma transição de sobreposição na placa: o núcleo do shader da prévia (editor-ovt.js VE_OVT_FS) num hook do
    libplacebo, com os parâmetros de CADA quadro (transicoes.parametros, a mesma conta da prévia e do render da CPU)
    numa TEXTURA embutida (//!TEXTURE rgba32f: uma linha por quadro — matrizes M, deslocamentos W, globais, faixas do
    glitch), lida pelo contador `frame` (uma passada por arquivo: o contador anda a cada passada). Tabelas `const` no
    código davam shaders de 490 KB e derrubavam a placa (VK_ERROR_DEVICE_LOST, caso autoframe). Quadro i do ramo =
    tempo local0 + i/fps da camada. Antes: o trecho de baixo ia para um ProRes, cada quadro passava por numpy/OpenCV
    (~130 ms/quadro) e virava um H.264 — 5 transições (3 s) levavam 17 s só de preparo."""
    import struct
    from Functions import transicoes as trs
    ps = [trs.parametros(t, v, (local0 + i / fps) / max(dur, 1e-3), uc, dur, fps, W, H) for i in range(n)]
    K = max(1, min(trs.K_MAX, max(int(p["K"]) for p in ps)))
    glitch = any(p["gl"] for p in ps)
    larg = 2 * K + 5 + (6 if glitch else 0)   # colunas: M[K], W[K], G1, G2, FL, LK1, (lk4, lk5, gl, K), GB[24]/4
    dados = bytearray()
    for p in ps:
        k = max(1, min(K, int(p["K"])))
        linha = [p["M"][j] if j < k else [1, 0, 0, 1] for j in range(K)] + [p["W"][j] if j < k else [0, 0, 0, 0] for j in range(K)]
        linha += [p["g1"], p["g2"], p["fl"], p["lk"][0:4], [p["lk"][4], p["lk"][5], float(p["gl"]), float(k)]]
        if glitch:
            linha += [p["gb"][j:j + 4] for j in range(0, 24, 4)]
        for q in linha:
            dados += struct.pack("<4f", *[float(x) for x in q])
    c0 = ps[0]
    f3 = lambda q: "vec3(" + ", ".join(f"{float(x):.6f}" for x in q) + ")"
    T = "texelFetch(TAB, ivec2({}, f), 0)"
    return (f"//!TEXTURE TAB\n//!SIZE {larg} {n}\n//!FORMAT rgba32f\n//!FILTER NEAREST\n{dados.hex()}\n\n"
            "//!HOOK MAIN\n//!BIND HOOKED\n//!BIND TAB\n//!DESC transicao de sobreposicao\n"
            f"const int NQ = {n};\nconst int KK = {K};\n"
            f"const vec3 FLASHC = {f3(c0['flashC'])};\nconst vec3 FLC = {f3(c0['flC'])};\n"
            f"const vec3 LKC1 = {f3(c0['lkC1'])};\nconst vec3 LKC2 = {f3(c0['lkC2'])};\n"
            "vec2 mir(vec2 p, vec2 R) { vec2 t = mod(p, 2.0 * R); return min(t, 2.0 * R - t); }\n"
            "float disco(vec2 n, vec2 c, float r) { return 1.0 - smoothstep(r * 0.7, r, length(n - c)); }\n"
            "vec4 hook() {\n"
            "    int f = clamp(frame - 1, 0, NQ - 1);\n"
            "    vec2 R = HOOKED_size, p = HOOKED_pos * R;\n"
            "    float S = 0.5 * length(R);\n"
            f"    vec4 G1 = {T.format('2 * KK')}, G2 = {T.format('2 * KK + 1')}, FL = {T.format('2 * KK + 2')}, "
            f"LK1 = {T.format('2 * KK + 3')}, X = {T.format('2 * KK + 4')};\n"
            "    vec2 LK2 = X.xy;\n    int k0 = max(1, int(X.w + 0.5));\n"
            "    vec2 n0 = (p - 0.5 * R) / S, q = p;\n"
            "    if (G1.w > 0.0) { float B = G1.w * S; q = (floor(q / B) + 0.5) * B; }\n"
            "    vec2 n = (q - 0.5 * R) / S;\n"
            + ("    if (X.z > 0.5) { int fb = int(clamp(floor(q.y / R.y * 24.0), 0.0, 23.0)); "
               f"vec4 gb = {T.format('2 * KK + 5 + fb / 4')}; n.x += gb[fb % 4]; }}\n" if glitch else "") +
            "    vec3 acc = vec3(0.0);\n"
            "    for (int k = 0; k < KK; k++) {\n"
            "        if (k >= k0) break;\n"
            f"        vec4 m = {T.format('k')}, w = {T.format('KK + k')};\n"
            "        vec2 P = vec2(m.x * n.x + m.y * n.y + w.x, m.z * n.x + m.w * n.y + w.y);\n"
            "        if (w.w != 0.0) P *= 1.0 + w.w * dot(P, P);\n"
            "        if (w.z != 0.0) { float r = clamp(1.0 - length(P), 0.0, 1.0), ph = w.z * r * r, c = cos(ph), s = sin(ph); "
            "P = vec2(P.x * c - P.y * s, P.x * s + P.y * c); }\n"
            "        if (G1.x != 0.0) { float r = length(P); P += P * (G1.x * sin(6.283185307 * (r * G1.y - G1.z)) / max(r, 1e-6)); }\n"
            "        if (G2.x > 0.0) acc += vec3(clamp(HOOKED_tex(mir(0.5 * R + P * (1.0 + G2.x) * S, R) / R), 0.0, 1.0).r, "
            "clamp(HOOKED_tex(mir(0.5 * R + P * S, R) / R), 0.0, 1.0).g, "
            "clamp(HOOKED_tex(mir(0.5 * R + P * (1.0 - G2.x) * S, R) / R), 0.0, 1.0).b);\n"
            "        else acc += clamp(HOOKED_tex(mir(0.5 * R + P * S, R) / R), 0.0, 1.0).rgb;\n"
            "    }\n"
            "    vec3 c = acc / float(k0);\n"
            "    if (G2.y > 0.0) c = 1.0 - (1.0 - c) * (1.0 - G2.y * FLASHC);\n"
            "    if (G2.z > 0.0 || FL.z > 0.0) {\n"
            "        vec2 L = FL.xy, d = n0 - L; float d2 = dot(d, d), qq = (sqrt(d2) - 0.3) / 0.02;\n"
            "        float br = exp(-d2 / 0.004) + exp(-d2 / 0.06) * 0.45 + exp(-d2 / 0.5) * 0.15 + exp(-qq * qq) * 0.12;\n"
            "        float rs = exp(-(d.y * d.y) / 0.00012) * exp(-abs(d.x) / 0.7) * 0.7;\n"
            "        float fa = disco(n0, L * -0.35, 0.05) * 0.22 + disco(n0, L * -0.7, 0.1) * 0.14 + disco(n0, L * 0.45, 0.035) * 0.25 + disco(n0, L * -1.15, 0.16) * 0.10;\n"
            "        vec3 fl = FLC * br * G2.z + vec3(0.7, 0.82, 1.0) * rs * G2.z + vec3(0.55, 0.85, 1.0) * fa * G2.z + FLC * FL.z;\n"
            "        c = 1.0 - (1.0 - c) * (1.0 - clamp(fl, 0.0, 1.0));\n    }\n"
            "    if (G2.w > 0.0 || LK2.y > 0.0) {\n"
            "        vec2 a = n0 - LK1.xy, b = n0 - LK1.zw, e = n0 - vec2(0.15, LK2.x);\n"
            "        vec3 lk = (LKC1 * exp(-dot(a, a) / 0.36) + LKC2 * exp(-dot(b, b) / 0.25) + (LKC1 + LKC2) * 0.5 * exp(-dot(e, e) / 0.2025)) * G2.w + LKC2 * LK2.y;\n"
            "        c = 1.0 - (1.0 - c) * (1.0 - clamp(lk, 0.0, 1.0));\n    }\n"
            "    return vec4(c, 1.0);\n}\n")


def _shader_alfa(c, fps, pula=0.0, max_trechos=256, multiplica=False):
    """Opacidade de um CLIPE de vídeo na placa (fade, opacidade fixa ou com quadros-chave), no lugar de descer o quadro
    para a CPU (colorchannelmixer + sendcmd). O valor de cada quadro é o mesmo da CPU (_valor_kf no tempo do clipe), mas
    guardado em TRECHOS RETOS (um fade = 1 trecho; constante = 1): uma tabela por quadro de um clipe de 10 min passaria do
    limite do shader. O contador `frame` começa em 1 no 1º quadro da camada (tempo do clipe = pula). None se precisar de
    mais de max_trechos trechos (curva muito picada: fica na CPU)."""
    n = max(1, int(math.ceil((c["dur"] - pula) * fps)) + 2)
    if "op" in c["kf"]:
        vals = [max(0.0, min(1.0, vc._valor_kf(c["kf"]["op"], pula + i / fps))) for i in range(n)]
    else:
        vals = [max(0.0, min(1.0, c["op"]))] * n
    trechos = _trechos(vals, 0.25 / 255, max_trechos)   # um fade = 1 trecho; clipe de 10 min com fades = 18
    if trechos is None:
        return None
    return (f"//!HOOK MAIN\n//!BIND HOOKED\n//!DESC opacidade do clipe\n{_glsl_trechos('ALFA', trechos)}"
            f"vec4 hook() {{\n    vec4 c = clamp(HOOKED_tex(HOOKED_pos), 0.0, 1.0);\n"
            f"    c.a {'*' if multiplica else ''}= ALFA(frame - 1);\n    return c;\n}}\n")


def _shader_onda(v, mw, mh, s, fps, t_ini, margem):
    """Ondulação (Wave Warp; editor-onda.js e vc._filtro_onda fazem a MESMA conta) numa passada do libplacebo. A textura
    está em s px por px da mídia (mw×mh, a camada sem a margem) e já com a margem em volta; a conta é em px da mídia a
    partir do centro (como o X − W/2 do geq). Tempo = t_ini + (frame − 1)/fps, contado do início da camada (o contador
    `frame` começa em 1 no 1º quadro que a passada recebe). Fora da textura: transparente (margem) ou a borda (camada de
    ajuste, sem margem — o geq prende na borda)."""
    alt = vc._num(v.get("alt"), 0, 4000)
    qtd = max(0.05, vc._num(v.get("qtd"), 0.05, 200))
    vel = vc._num(v.get("vel"), -50, 50)
    a = math.radians(vc._num(v.get("dir"), -360, 360))
    ca, sa = math.cos(a), math.sin(a)
    ca, sa = (0.0 if abs(ca) < 1e-9 else ca), (0.0 if abs(sa) < 1e-9 else sa)
    L = max(1.0, abs(mw * ca) + abs(mh * sa))
    k = 0.01 + vc._num(v.get("forma"), 0, 100) / 100 * 6
    fase = math.radians(vc._num(v.get("fase"), -3600, 3600))
    env = f"clamp(s0 / {L:.4f}, 0.0, 1.0)" if v.get("prender") else "1.0"
    fora = ("    if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec4(0.0);\n" if margem
            else "    p = clamp(p, 0.5 / HOOKED_size, 1.0 - 0.5 / HOOKED_size);\n")
    return (f"//!HOOK MAIN\n//!BIND HOOKED\n//!DESC ondulacao\nvec4 hook() {{\n"
            f"    float t = {t_ini:.6f} + float(frame - 1) / {fps:.6f};\n"
            f"    vec2 meio = HOOKED_size / {s:.6f} * 0.5;\n"
            f"    vec2 q = HOOKED_pos * HOOKED_size / {s:.6f} - 0.5 - meio;\n"
            f"    float s0 = q.x * {ca:.6f} + q.y * {sa:.6f} + {L / 2:.4f};\n"
            f"    float ph = 6.28318531 * (s0 / {L / qtd:.5f} - {vel:.5f} * t) + {fase:.6f};\n"
            f"    float d = {alt:.4f} * {env} * tanh({k:.5f} * sin(ph)) / {math.tanh(k):.7f};\n"
            f"    vec2 p = (q + vec2(d * {sa:.6f}, -d * {ca:.6f}) + meio + 0.5) * {s:.6f} / HOOKED_size;\n"
            f"{fora}    return clamp(HOOKED_tex(p), 0.0, 1.0);\n}}\n")


def _onda_passos(fx, mw, mh, s, fps, t_ini, pasta, tag, margem=True, fmt=_FMT_ALFA):
    """Passadas da Ondulação (uma por onda, cada uma no seu arquivo: o `frame` avança a cada passada) e, com margem, a
    textura antes aumentada com borda transparente do tanto que a onda empurra para fora (vc._onda_margem, em px da
    mídia × s). Devolve (passos, margem em px da textura, margem em px da mídia) — a caixa na tela cresce junto."""
    ondas = vc._onda_ativa(fx)
    if not ondas:
        return [], 0, 0.0
    passos, M = [], 0
    if margem:
        M = int(math.ceil(vc._onda_margem(fx) * s))
        passos.append(f"libplacebo=w=iw+{2 * M}:h=ih+{2 * M}:pos_x={M}:pos_y={M}:pos_w=iw:pos_h=ih:fillcolor=black@0:"
                      f"format={fmt}:disable_linear=1:{_ESC}")
    for j, f in enumerate(ondas):
        arq = os.path.join(pasta, f"onda_{tag}_{j}.glsl")
        with open(arq, "w", encoding="utf-8") as fh:
            fh.write(_shader_onda(f.get("v") or {}, mw, mh, s, fps, t_ini, margem))
        passos.append(f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={fmt}:disable_linear=1")
    return passos, M, M / s


def _giro_passos(c, fps, pula, bw, bh, pasta, tag, fmt=_FMT_ALFA):
    """Rotação da camada na placa (no lugar do rotate da CPU, mesma conta: horário na tela, interpolação linear, fora =
    transparente). bw×bh = a textura que chega (px da textura, já com a margem da onda). Fixa: caixa RW×RH do giro;
    com quadros-chave: caixa D×D da diagonal e o ângulo de cada quadro em trechos retos (tempo do clipe = pula no 1º
    quadro). Animação constante de giro (ca_rot) não entra: fica na CPU. Devolve (passos, RW, RH) ou None se a curva é
    picada demais."""
    n = max(1, int(math.ceil((c["dur"] - pula) * fps)) + 2)
    if "rot" in c["kf"]:
        D = int(math.ceil(math.hypot(bw, bh))) + 2
        RW = RH = D + D % 2
        vals = [vc._valor_kf(c["kf"]["rot"], pula + i / fps) for i in range(n)]
    else:
        rad = math.radians(c["rot"])
        RW = int(math.ceil(bw * abs(math.cos(rad)) + bh * abs(math.sin(rad)))) + 2
        RH = int(math.ceil(bw * abs(math.sin(rad)) + bh * abs(math.cos(rad)))) + 2
        RW, RH = RW + RW % 2, RH + RH % 2
        vals = [c["rot"]] * n
    tr = _trechos([math.radians(v) for v in vals], 0.0005)
    if tr is None:
        return None
    arq = os.path.join(pasta, f"giro_{tag}.glsl")
    with open(arq, "w", encoding="utf-8") as fh:
        fh.write(f"//!HOOK MAIN\n//!BIND HOOKED\n//!DESC giro\n{_glsl_trechos('ANG', tr)}vec4 hook() {{\n"
                 f"    float a = ANG(frame - 1), cs = cos(a), sn = sin(a);\n"
                 f"    vec2 q = HOOKED_pos * HOOKED_size - HOOKED_size * 0.5;\n"
                 f"    vec2 p = (vec2(q.x * cs + q.y * sn, -q.x * sn + q.y * cs) + HOOKED_size * 0.5) / HOOKED_size;\n"
                 f"    if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec4(0.0);\n"
                 f"    return clamp(HOOKED_tex(p), 0.0, 1.0);\n}}\n")
    # a textura cresce para a caixa do giro (centrada, borda transparente) e o shader gira dentro dela
    return ([f"libplacebo=w={RW}:h={RH}:pos_x={(RW - bw) / 2:.3f}:pos_y={(RH - bh) / 2:.3f}:pos_w=iw:pos_h=ih:"
             f"fillcolor=black@0:format={fmt}:disable_linear=1:{_ESC}",
             f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={fmt}:disable_linear=1"], RW, RH)


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
    # giro na placa (_giro_passos) quando nada mais faz o clipe descer: antes todo vídeo girado descia a cada quadro.
    # Com giro constante (ca_rot) ou efeito que desce, continua girando na CPU junto com eles
    gira_gpu = gira_v and not car and not _fx_hibrido(c["fx"]) and not key_gpu
    hib = (_fx_hibrido(c["fx"]) or (gira_v and not gira_gpu)) and not key_gpu
    # efeitos que descem para a CPU medem em px da mídia (encolher/suavizar do Chroma Key): sem reduzir antes deles
    red = min(1.0, k_max * 1.02) if k_max < 0.9 and not hib and not key_gpu else 1.0
    rw, rh = max(2, int(round(c["mw"] * red / 2)) * 2), max(2, int(round(c["mh"] * red / 2)) * 2)
    giro = ""
    if vk and (rot in _GIRO or red < 1):
        giro = ("libplacebo=" + (f"rotate={_GIRO[rot]}:" if rot in _GIRO else "")
                + (f"w={rw}:h={rh}:{_ESC}:" if red < 1 else "") + f"format={_FMT_CAM}:disable_linear=1,")
    sobe = ("" if vk else (f"scale={rw}:{rh}:flags=lanczos," if red < 1 else "") + "format=yuv420p,hwupload,")
    # os efeitos medem em % da mídia: no quadro reduzido, as medidas do quadro reduzido
    # desfoque animado (fxk): sai da lista fixa e vai num shader com o sigma de cada quadro (_shader_blur_anim)
    ids_anim = {f.get("id") for f in c.get("fxk") or [] if f.get("id") and (f.get("p") or {})}
    fx_fixos = [f for f in c["fx"] if f.get("id") not in ids_anim]
    efeito = "" if hib or key_gpu else "".join(p + "," for p in _passos_lc(g, fx_fixos, rw, rh, pasta, f"v{n_cam}", _FMT_CAM))
    sh_bl = None if hib or key_gpu else _shader_blur_anim(c.get("fxk"), rw, rh, c["dur"], g.fps, pula)
    for j, sh in enumerate(sh_bl or []):
        arq = os.path.join(pasta, f"blanim_v{n_cam}_{j}.glsl")
        with open(arq, "w", encoding="utf-8") as fh:
            fh.write(sh)
        efeito += f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={_FMT_CAM}:disable_linear=1,"
    # Ondulação na placa, depois dos outros efeitos: a textura ganha a margem transparente e sai em RGBA (antes o
    # clipe descia para a CPU a cada quadro); tempo do clipe = pula no 1º quadro
    po, _, onda_mm = ([], 0, 0.0) if hib or key_gpu else _onda_passos(c["fx"], c["mw"], c["mh"], rw / c["mw"], g.fps, pula,
                                                                       pasta, f"v{n_cam}")
    efeito += "".join(p + "," for p in po)
    if gira_gpu:   # depois dos efeitos e da onda, na caixa com a margem dela (px da textura)
        M = (rw / c["mw"]) * onda_mm
        gp = _giro_passos(c, g.fps, pula, rw + 2 * M, rh + 2 * M, pasta, f"v{n_cam}")
        if gp is None:
            raise RuntimeError("giro com quadros-chave picados demais para a placa")
        efeito += "".join(p + "," for p in gp[0])
        c["_giro_tam"] = (gp[1] * c["mw"] / rw, gp[2] * c["mw"] / rw)   # caixa girada em px da mídia
    opac = ""
    if key_gpu:
        # recorte inteiro na placa (shader); a saída já é RGBA. Antes dele, os efeitos da lista que vêm antes (Luz e Cor…)
        ativos = [f for f in c["fx"] if f.get("on") is not False]
        efeito = "".join(p + "," for p in _passos_lc(g, ativos[:-1], rw, rh, pasta, f"k{n_cam}", _FMT_CAM))
        arq = os.path.join(pasta, f"key_v{n_cam}.glsl")
        with open(arq, "w", encoding="utf-8") as fh:
            fh.write(_shader_key(ativos[-1].get("v") or {}))
        # upscaler=nearest: a cor (4:2:0) ampliada como o swscale do exportador de CPU (pico de diferença 53 → 28 na borda)
        efeito += f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={_FMT_ALFA}:disable_linear=1:upscaler=nearest,"
        # opacidade (fade) na placa: o alfa do recorte × a opacidade de cada quadro (antes a camada descia para a CPU)
        sh_op = None if _opaca(c) else _shader_alfa(c, g.fps, pula, multiplica=True)
        if sh_op:
            arq = os.path.join(pasta, f"kalfa_v{n_cam}.glsl")
            with open(arq, "w", encoding="utf-8") as fh:
                fh.write(sh_op)
            efeito += f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={_FMT_ALFA}:disable_linear=1,"
        elif not _opaca(c):
            a = (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@vop{n_cam}", c["st"])
                 if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
            opac = f"hwdownload,format={_FMT_ALFA},{a},hwupload,"
    elif hib:
        # desce, os mesmos filtros do exportador de CPU no tamanho da mídia (com a opacidade, se houver) e sobe com o alfa
        a = ""
        if not _opaca(c):
            a = "," + (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@vop{n_cam}", c["st"])
                       if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
        baixo = _FMT_CAM if giro else "yuv420p" if not vk else _fmt_decodificado(info)
        fx_cpu = ",".join(vc._filtros_fx(c["fx"], c["mw"], c["mh"], f"h{n_cam}"))
        onda = vc._filtro_onda(c["fx"], c["mw"], c["mh"], c["st"])   # tempo aqui = o da timeline
        bw0, bh0 = c["mw"], c["mh"]   # o quadro que chega ao giro (com a margem da onda, se houver)
        if onda:
            fx_cpu = f"{fx_cpu},{onda}" if fx_cpu else onda
            m = vc._onda_margem(c["fx"])
            bw0, bh0 = int(c["mw"]) + 2 * m, int(c["mh"]) + 2 * m
            c["_giro_tam"] = (bw0, bh0)   # a caixa que sobe, com a margem da onda
        gir = ""
        if gira_v:
            # tempo aqui = o da timeline (setpts com o início da camada; num bloco, st < 0 e o tempo começa no bloco):
            # o giro conta do início da camada, t − st nos dois casos
            tv = f"(t-{c['st']:.6f})"
            if "rot" in c["kf"] or car:
                e = vc._expr_kf(c["kf"]["rot"], tv) if "rot" in c["kf"] else f"{c['rot']:.5f}"
                D = int(math.ceil(math.hypot(bw0, bh0))) + 2
                D += D % 2
                gir = f"rotate=a='(({e}){'+' + car if car else ''})*PI/180':c=black@0:ow={D}:oh={D},"
                c["_giro_tam"] = (D, D)
            else:
                rad = math.radians(c["rot"])
                RW = int(math.ceil(bw0 * abs(math.cos(rad)) + bh0 * abs(math.sin(rad)))) + 2
                RH = int(math.ceil(bw0 * abs(math.sin(rad)) + bh0 * abs(math.cos(rad)))) + 2
                RW, RH = RW + RW % 2, RH + RH % 2
                gir = f"rotate={rad:.6f}:c=black@0:ow={RW}:oh={RH},"
                c["_giro_tam"] = (RW, RH)
        opac = (f"hwdownload,format={baixo},scale=in_color_matrix={_mtx(info)},format=rgba,"
                + (f"{fx_cpu}," if fx_cpu else "") + f"{gir}{a.lstrip(',') + ',' if a else ''}format=rgba,hwupload,")
    elif not _opaca(c) and (sh_alfa := _shader_alfa(c, g.fps, pula, multiplica=bool(po) or gira_gpu)):   # onda/giro: alfa × opacidade
        # fade de um clipe na placa (antes descia para a CPU a cada quadro): o alfa num shader, saída RGBA de 16 bits
        arq = os.path.join(pasta, f"alfa_v{n_cam}.glsl")
        with open(arq, "w", encoding="utf-8") as fh:
            fh.write(sh_alfa)
        opac = f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={_FMT_ALFA}:disable_linear=1,"
    elif not _opaca(c):
        # fade de um clipe: só ele desce para receber a transparência (sendcmd no tempo da timeline) e sobe de volta
        a = (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@vop{n_cam}", c["st"])
             if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
        # formato EXATO na placa: o que passou pelo libplacebo (giro/redução/Luz e Cor) é _FMT_CAM, o que subiu da CPU é
        # yuv420p; direto do decodificador é nv12/p010 (com "nv12|yuv420p" o ffmpeg escolhia errado e a exportação falhava)
        baixo = _FMT_ALFA if po or gira_gpu else _FMT_CAM if (giro or efeito) else "yuv420p" if not vk else _fmt_decodificado(info)
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
    return [(f"[{r}]", _posicao(c, kx, *_tam(c, c["mw"] + 2 * onda_mm, c["mh"] + 2 * onda_mm, kx, tl), tl))]


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
    # Ondulação: já está na CPU, vai junto (geq com a margem); o tempo aqui começa em 0 no 1º quadro (= pula no clipe)
    onda = vc._filtro_onda(c["fx"], c["mw"], c["mh"], -pula)
    mo = vc._onda_margem(c["fx"]) if onda else 0
    if onda:
        passos.append(onda)
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
    return [(f"[{r}]", _posicao(c, kx, *_tam(c, c["mw"] + 2 * mo, c["mh"] + 2 * mo, kx, tl), tl))]


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
    # (Ondulação: sem recorte — a onda mede a partir do centro da imagem inteira, como na CPU)
    if not seq and not tem_anim and not any(f.get("t") in ("blur", "b3d", "onda") and f.get("on") is not False for f in c["fx"]):
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
    # com Ondulação o giro vem DEPOIS da onda: os dois na placa, depois de subir (sem giro constante: motivo())
    giro_placa = bool(vc._onda_ativa(c["fx"])) and ang is not None
    if giro_placa:
        giro_fixo = giro_anim = None
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
    # Ondulação na placa depois de subir (a cada quadro, na textura reduzida; imagem girada não chega aqui: motivo())
    s_tex = tw / bw
    po, _, onda_mm = _onda_passos(c["fx"], c["mw"], c["mh"], s_tex, g.fps, 0.0, g.pasta, f"i{n_cam}")
    onda = "".join("," + p for p in po)
    if giro_placa:
        M = onda_mm * s_tex
        gp = _giro_passos(c, g.fps, 0.0, tw + 2 * M, th + 2 * M, g.pasta, f"i{n_cam}")
        if gp is None:
            raise RuntimeError("giro com quadros-chave picados demais para a placa")
        onda += "".join("," + p for p in gp[0])
        RW, RH = gp[1], gp[2]
    if ang is not None:   # textura girada: o tamanho na tela é o dela (em px da mídia = textura ÷ redução) × escala
        wv, hv = f"({RW / red:.5f}*({kx}))", f"({RH / red:.5f}*({kx}))"
    else:
        wv, hv = _tam(c, bw + 2 * onda_mm, bh + 2 * onda_mm, kx, tl)
    sombra = vc._sombra_camada(c)
    r = g.rotulo("i")
    if not sombra:
        g.filtros.append(f"{cadeia},hwupload{onda}[{r}]")
        return [(f"[{r}]", _posicao(c, kx, wv, hv, tl, ang=ang))]
    # sombra: a transparência da imagem na cor da sombra, desfocada (em px da textura: desvio × redução) e posta por
    # baixo, deslocada — como _sombra_camada no exportador
    R, G, B, op, dx, dy, sig = sombra
    sig_t = sig * red / max(1e-3, maior)
    m = int(math.ceil(3 * sig_t)) + 2
    rs = g.rotulo("s")
    g.filtros.append(f"{cadeia},split[{r}a][{rs}a]")
    g.filtros.append(f"[{r}a]hwupload{onda}[{r}]")
    # a sombra ondula junto (mesma onda, a partir do mesmo centro; a margem dela soma à do desfoque)
    po_s, M_s, _ = _onda_passos(c["fx"], c["mw"], c["mh"], s_tex, g.fps, 0.0, g.pasta, f"s{n_cam}")
    g.filtros.append(f"[{rs}a]pad=iw+{2 * m}:ih+{2 * m}:{m}:{m}:color=black@0,lutrgb=r={R}:g={G}:b={B}:a='val*{op:.4f}'"
                     + (f",format=gbrap,gblur=sigma={sig_t:.3f}:planes=8,format=rgba" if sig_t >= 0.3 else "")
                     + f",hwupload{''.join(',' + p for p in po_s)}[{rs}]")
    esc = f"(({kx})/{red:.6f})"
    wsv, hsv = f"(({RW}+{2 * (m + M_s)})*{esc})", f"(({RH}+{2 * (m + M_s)})*{esc})"
    return [(f"[{rs}]", _posicao(c, kx, wsv, hsv, tl, dx, dy, ang=ang)), (f"[{r}]", _posicao(c, kx, wv, hv, tl, ang=ang))]


def _arvore(vals, padrao):
    """if(lt(in_idx, …)) balanceado: o avaliador do ffmpeg aceita ~100 níveis de aninhamento."""
    def rec(lo, hi):
        if lo == hi:
            return vals.get(lo, padrao)
        m = (lo + hi) // 2
        return f"if(lte(in_idx,{m}),{rec(lo, m)},{rec(m + 1, hi)})"
    return rec(0, max(vals) if vals else 0)


# ─────────────── posição em fração de pixel (como After/Premiere) ───────────────
# O libplacebo (e o overlay da CPU) arredonda pos_x/pos_y para pixel inteiro: um texto que desacelera andava 3, 3, 2, 2,
# 1, 1, 0, 1, 0, 0... px por quadro — "tremida"/"piscada" no fim de cada movimento (Nautic Bay V3, medido no export).
# Agora a camada que se move vai para o pixel inteiro de baixo (floor) e um shader desloca a imagem dela pela fração
# que sobrou (amostragem bilinear), com a fração de cada quadro numa tabela no shader (o mesmo `frame` do desfoque
# animado). Medido num quadrado a 1 px/s: 109,50 109,59 109,69 109,79... em vez de 15 quadros parados e 1 px de salto.
_FN_EXPR = {
    "_if": lambda c, a, b=0.0: a if c else b, "lt": lambda a, b: float(a < b), "lte": lambda a, b: float(a <= b),
    "gt": lambda a, b: float(a > b), "gte": lambda a, b: float(a >= b), "eq": lambda a, b: float(a == b),
    "clip": lambda x, a, b: min(max(x, a), b), "min": min, "max": max, "abs": abs, "floor": math.floor,
    "ceil": math.ceil, "trunc": math.trunc, "sin": math.sin, "cos": math.cos, "exp": math.exp, "sqrt": math.sqrt,
    "pow": pow, "mod": math.fmod, "PI": math.pi, "PHI": (1 + 5 ** 0.5) / 2, "E": math.e,
}
_SUBPX = os.environ.get("CANIVETE_SUBPIXEL", "1") != "0"


def _avaliador(expr):
    """Expressão do ffmpeg (as de _posicao: if/lt/clip/sin… em `ot`) → função Python de ot. None se não souber ler."""
    try:
        cod = compile(re.sub(r"\bif\(", "_if(", expr), "<expr>", "eval")
        f = lambda ot: float(eval(cod, {"__builtins__": {}}, {**_FN_EXPR, "ot": ot}))
        f(0.0)
        return f
    except Exception:
        return None


def _subpixel(g, rot, x, y, w, h):
    """Camada que se move: devolve (rótulo, pos_x, pos_y) com o shader de fração de pixel, ou None (parada, fórmula
    que não sabe ler ou movimento picado demais) — aí fica como antes."""
    if not _SUBPX or ("ot" not in x and "ot" not in y):
        return None
    m = re.search(r"\(ot-(-?[\d.]+)\)", x + y)
    if not m:
        return None
    st = float(m.group(1))
    fx, fy = _avaliador(x), _avaliador(y)
    fw, fh_ = _avaliador(w), _avaliador(h)
    if not (fx and fy and fw and fh_):
        return None
    # o movimento termina no último quadro-chave: depois a posição fica parada (a tabela devolve o último valor)
    fim = max([float(v) for v in re.findall(r"lt\(\(ot-[-\d.]+\),(-?[\d.]+)\)", x + y)] + [0.0]) + 0.2
    fps = float(g.fps)
    n = max(2, int(math.ceil(fim * fps)) + 2)
    if n > 20000:
        return None
    t0 = max(st, 0.0)            # 1º quadro da camada (_entra); no bloco que já vinha tocando, o início do bloco
    fr, fracs = [], []
    for k in range(n):
        ot = t0 + k / fps
        vx, vy = fx(ot), fy(ot)
        dx, dy = vx - math.floor(vx), vy - math.floor(vy)
        fracs.append((dx, dy))
        # deslocamento na textura em fração do TAMANHO NA TELA (pos_w/pos_h): independe da resolução da camada
        fr.append((dx / max(1.0, fw(ot)), dy / max(1.0, fh_(ot))))
    if all(abs(a) < 1e-4 and abs(b) < 1e-4 for a, b in fracs):
        return None
    wmin = max(1.0, min(fw(t0 + k / fps) for k in range(0, n, max(1, n // 50))))
    hmin = max(1.0, min(fh_(t0 + k / fps) for k in range(0, n, max(1, n // 50))))
    trx, tr_y = _trechos([a for a, _ in fr], 0.004 / wmin), _trechos([b for _, b in fr], 0.004 / hmin)
    if trx is None or tr_y is None:
        return None
    arq = os.path.join(g.pasta, f"subpx_{g.rotulo('p')}.glsl")
    with open(arq, "w", encoding="utf-8") as fh:
        fh.write("//!HOOK MAIN\n//!BIND HOOKED\n//!DESC fração de pixel\n" + _glsl_trechos("FX", trx) + _glsl_trechos("FY", tr_y)
                 + "vec4 hook() {\n    int f = frame - 1;\n"
                 # dentro do passo a textura vem com o alfa MULTIPLICADO na cor (amostrar assim mistura certo na borda);
                 # a saída volta ao alfa reto: sem dividir, o fade de entrada saía mais escuro (alfa aplicado duas
                 # vezes; teste_export "curva", quadros 3–5 — teste mínimo: dividindo fica igual ao export sem o passo)
                 + "    vec4 c = HOOKED_tex(HOOKED_pos - vec2(FX(f), FY(f)));\n"
                 + "    return c.a > 1e-5 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);\n}\n")
    r = g.rotulo("u")
    g.filtros.append(f"{rot}libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={_FMT_ALFA}:disable_linear=1[{r}]")
    return f"[{r}]", f"floor({x})", f"floor({y})"


def _compor(g, fundo, itens, fmt=_FMT_MEIO):
    """Um libplacebo: o fundo (entrada 0, tela inteira) + cada item no seu lugar. Devolve o rótulo da saída."""
    if not itens:
        return fundo
    itens = list(itens)
    for j, (rot, (x, y, w, h)) in enumerate(itens):
        sp = _subpixel(g, rot, x, y, w, h)
        if sp:
            itens[j] = (sp[0], (sp[1], sp[2], w, h))
    px, py, pw, ph = {0: "0"}, {0: "0"}, {0: "ow"}, {0: "oh"}
    for i, (_, (x, y, w, h)) in enumerate(itens, 1):
        px[i], py[i], pw[i], ph[i] = x, y, w, h
    r = g.rotulo("c")
    # disable_linear: mistura (opacidade, bordas do texto) e redimensiona nos valores de cor como a CPU (overlay/scale).
    # Em luz linear um branco a 50% sobre preto saía Y 176 em vez de 126: fades claros demais, fim sem escurecer
    g.filtros.append(f"{fundo}{''.join(rot for rot, _ in itens)}libplacebo=inputs={len(itens) + 1}:w={g.W}:h={g.H}:"
                     f"fps={g.fps:.3f}:format={fmt}:disable_linear=1:{_ESC}:"
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


# Modos de mesclagem na placa (rodada 8.2), com as fórmulas do canvas da prévia (W3C Compositing: a = o que está
# embaixo, b = a camada). O blend_vulkan do ffmpeg só tem normal e multiply; aqui o fundo e a camada ficam LADO A LADO
# numa textura de largura 2W (fundo à esquerda, camada à direita sobre transparente) e um shader lê os dois pontos.
_BM_GLSL = {
    "darken": "min(a, b)",
    "colorburn": "vec3(a.r >= 1.0 ? 1.0 : b.r <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - a.r) / b.r), "
                 "a.g >= 1.0 ? 1.0 : b.g <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - a.g) / b.g), "
                 "a.b >= 1.0 ? 1.0 : b.b <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - a.b) / b.b))",
    "lighten": "max(a, b)",
    "screen": "a + b - a * b",
    "colordodge": "vec3(a.r <= 0.0 ? 0.0 : b.r >= 1.0 ? 1.0 : min(1.0, a.r / (1.0 - b.r)), "
                  "a.g <= 0.0 ? 0.0 : b.g >= 1.0 ? 1.0 : min(1.0, a.g / (1.0 - b.g)), "
                  "a.b <= 0.0 ? 0.0 : b.b >= 1.0 ? 1.0 : min(1.0, a.b / (1.0 - b.b)))",
    "overlay": "mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a))",
    "hardlight": "mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, b))",
    "softlight": "mix(a - (1.0 - 2.0 * b) * a * (1.0 - a), "
                 "a + (2.0 * b - 1.0) * (mix(((16.0 * a - 12.0) * a + 4.0) * a, sqrt(a), step(0.25, a)) - a), "
                 "step(0.5, b))",
    "difference": "abs(a - b)",
    "exclusion": "a + b - 2.0 * a * b",
}


def _shader_mesclar(bm):
    """Shader da textura lado a lado (largura 2W): à esquerda, o fundo misturado com a camada pelo modo `bm`, com a
    transparência da camada (resultado = a·(1−α) + modo(a, b)·α). A cor da camada chega multiplicada por α DUAS vezes
    (medido: 0x33 a 50% lido como 12,3 — a composição grava pré-multiplicado e o libplacebo multiplica de novo ao ler;
    alpha_mode não muda): b = rgb/α². "add" é o lighter do canvas: a + b·α."""
    if bm == "add":
        conta = "    o = min(vec3(1.0), a + b * al);\n"
    else:
        conta = f"    o = mix(a, clamp({_BM_GLSL[bm]}, 0.0, 1.0), al);\n"
    return ("//!HOOK MAIN\n//!BIND HOOKED\n//!DESC mesclagem\nvec4 hook() {\n"
            "    vec2 p = HOOKED_pos;\n    if (p.x >= 0.5) return vec4(0.0, 0.0, 0.0, 1.0);\n"
            "    vec3 a = clamp(HOOKED_tex(p).rgb, 0.0, 1.0);\n"
            "    vec4 q = clamp(HOOKED_tex(vec2(p.x + 0.5, p.y)), 0.0, 1.0);\n"
            "    float al = q.a;\n    vec3 b = al > 1e-3 ? clamp(q.rgb / (al * al), 0.0, 1.0) : vec3(0.0);\n    vec3 o;\n"
            f"{conta}    return vec4(o, 1.0);\n}}\n")


def _mesclar(g, atual, c, n, info, pasta):
    """Camada com modo de mesclagem (fora o Multiplicar) toda na placa: fundo e camada lado a lado (_shader_mesclar) e
    a metade da esquerda recortada. A camada cobre a timeline toda como as outras entradas do libplacebo (aparece só
    enquanto tem quadros; fora dela a metade direita é transparente e o fundo passa igual)."""
    # o fundo do libplacebo (fillcolor) já é transparente: a metade direita fica (0,0,0,0) onde não há camada. (Uma
    # entrada color=black@0 NÃO serve: a fonte de cor do ffmpeg ignora o alfa e saía preto opaco — Sobrepor escurecia tudo)
    itens = _entrada_video(g, c, info, pasta, n) if c["tipo"] == "video" else _entrada_imagem(g, c, n)
    r = g.rotulo("m")
    px, py, pw, ph = {0: "0"}, {0: "0"}, {0: str(g.W)}, {0: "oh"}
    for i, (_, (x, y, w, h)) in enumerate(itens, 1):
        px[i], py[i], pw[i], ph[i] = f"({x})+{g.W}", y, w, h
    arq = os.path.join(pasta, f"bm_{n}.glsl")
    with open(arq, "w", encoding="utf-8") as fh:
        fh.write(_shader_mesclar(c["bm"]))
    g.filtros.append(f"{atual}{''.join(rot for rot, _ in itens)}libplacebo=inputs={len(itens) + 1}:w={2 * g.W}:h={g.H}:"
                     f"fps={g.fps:.3f}:format={_FMT_ALFA}:disable_linear=1:{_ESC}:"
                     f"pos_x='{_arvore(px, '0')}':pos_y='{_arvore(py, '0')}':"
                     f"pos_w='{_arvore(pw, 'ow')}':pos_h='{_arvore(ph, 'oh')}',"
                     f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={_FMT_ALFA}:disable_linear=1,"
                     f"libplacebo=w={g.W}:h={g.H}:crop_x=0:crop_y=0:crop_w={g.W}:crop_h={g.H}:"
                     f"format={_FMT_MEIO}:disable_linear=1[{r}]")
    return f"[{r}]"


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
    ovt = _ovt_fx(c)   # transições de sobreposição: shaders próprios, ANTES dos outros efeitos (como o render da CPU)
    resto = [f for f in c["fx"] if f not in ovt]
    if _fx_hibrido(resto):
        efs = vc._filtros_fx(resto, g.W, g.H, f"a{g.rot}")
        nit = ",".join(e[len(vc._NIT_NO_YUV):] for e in efs if e.startswith(vc._NIT_NO_YUV))
        efs = [e for e in efs if not e.startswith(vc._NIT_NO_YUV)]
        onda = vc._filtro_onda(resto, g.W, g.H, c["st"], margem=False)   # desce junto; o trim não zera o tempo
        if onda:
            efs.append(onda)
        # Autozoom: o quadro conta do 1º que desce — o do início do bloco (ramo "tarde", abaixo) ou o do início do trecho
        from Functions import autozoom
        ini0 = max(0.0, c["st"])
        zoom = autozoom.filtro(resto, g.W, g.H, c["st"], c["dur"], 0.0 if (ini0 > 0.5 and opaco) else ini0, g.fps)
        if zoom:
            efs.append(zoom)
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
        passos = _passos_lc(g, resto, g.W, g.H, pasta, f"a{g.rot}")
    ini, fim = max(0.0, c["st"]), min(g.total, c["st"] + c["dur"])
    if fim - ini < g.fd / 2:   # nenhum quadro da saída: um ramo vazio travava filtros que esperam quadro (blend da vinheta)
        return entrada
    # Trecho que começa tarde no bloco: com trim=start o composto não anda até chegar o 1º quadro do trecho, e o outro
    # ramo do split guarda TODOS os quadros até lá na placa (Gil, ajuste aos 9,6 s de um bloco: ~570 quadros; em 16 bits,
    # 6,8 GB → memória esgotada, 2026-10-12). Então o ramo anda desde o início do bloco, com alfa 0 antes do trecho.
    hib = _fx_hibrido(resto)
    tarde = ini > 0.5 and (opaco or not hib)   # híbrido com opacidade já leva o alfa pela CPU (sendcmd): fica como era
    if not hib and vc._onda_ativa(resto):
        # Ondulação na placa, depois dos outros efeitos, sem margem (o quadro inteiro; fora dele, a borda). Tempo da
        # camada no 1º quadro do ramo (a mesma conta das transições abaixo)
        cobre = opaco and ini <= g.fd / 2 and fim >= g.total - g.fd / 2
        t_ramo = 0.0 if (tarde or cobre) else (math.ceil(ini * g.fps + 0.25) - 1) / g.fps
        passos = passos + _onda_passos(resto, g.W, g.H, 1.0, g.fps, t_ramo - c["st"], pasta, f"a{g.rot}",
                                       margem=False, fmt=_FMT_MEIO)[0]
    if ovt:
        # 1º quadro do ramo: o do início do bloco (tarde ou a camada cobrindo tudo) ou o 1º que o trim deixa passar
        cobre = opaco and ini <= g.fd / 2 and fim >= g.total - g.fd / 2
        t0 = 0.0 if (tarde or cobre) else (math.ceil(ini * g.fps + 0.25) - 1) / g.fps
        n_q = max(1, int(math.ceil((fim - t0) * g.fps)) + 2)
        job = (c.get("ovt") or {}).get("job") or {}
        uc = float(job.get("uc", 0.5))
        fx_job = job.get("fx") or [{"t": f["t"], "v": f.get("v") or {}} for f in ovt]
        sh_ovt = []
        for j, f in enumerate(fx_job):
            arq = os.path.join(pasta, f"ovt_a{g.rot}_{j}.glsl")
            with open(arq, "w", encoding="utf-8") as fh:
                fh.write(_shader_ovt(f["t"], f.get("v") or {}, uc, c["dur"], g.fps, g.W, g.H, t0 - c["st"], n_q))
            sh_ovt.append(f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format={_FMT_MEIO}:disable_linear=1")
        passos = sh_ovt + passos
    if not passos:
        return entrada
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
                             f"libplacebo={giro}w={g.W}:h={g.H}:pos_w={w}:pos_h={h}:format={_FMT_CAM}:disable_linear=1:{_ESC},"
                             f"setsar=1,fps=fps={g.fps:.3f}:start_time=0[{r}]")
        partes.append(f"[{r}]")
    g.filtros.append(f"{''.join(partes)}concat=n={len(partes)}:v=1:a=0[fundo]")
    return "[fundo]"


def montar(lay, W, H, fps, total, pasta, segmentos=None, path=None, info=None):
    """Grafo da timeline (trilha base + camadas de baixo para cima) → (_Grafo, rótulo final na placa)."""
    g = _Grafo(W, H, fps, total)
    g.pasta = pasta   # shaders das imagens (Ondulação) também vão para a pasta do render
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
        if c.get("bm"):   # mesclagem: o que está embaixo é composto antes, e a camada se mistura ao resultado
            atual = _compor(g, atual, pendentes)
            pendentes = []
            atual = (_multiplicar if c["bm"] == "multiply" else _mesclar)(g, atual, c, n, infos.get(c["path"]), pasta)
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


def _base_em_camadas(segmentos, camadas, path, W, H, info):
    """Trilha base (trechos do vídeo principal, um atrás do outro) → camadas de vídeo por baixo de todas, ajustadas ao
    quadro como a base (cabe inteiro, centrado). Devolve (segmentos só com vazios, camadas) ou (None, None)."""
    mw, mh = int(info.get("width") or W), int(info.get("height") or H)
    if mw <= 0 or mh <= 0:
        return None, None
    sc = min(W / mw, H / mh) * 100.0
    t, segs, base = 0.0, [], []
    for s in segmentos or []:
        if not isinstance(s, dict):
            return None, None
        if s.get("gap") is not None:
            d = float(s["gap"])
        else:
            a, b = float(s.get("start", 0)), float(s.get("end", 0))
            d = b - a
            base.append({"tipo": "video", "path": path, "seq": None, "st": t, "s": a, "e": b, "sc": sc, "x": W / 2, "y": H / 2,
                         "rot": 0, "op": 100, "kf": {}, "fx": [], "ca": [], "mw": mw, "mh": mh, "v": 1, "bm": None, "ox": 0, "oy": 0})
        segs.append({"gap": d})
        t += d
    return (segs, base + list(camadas or [])) if base else (None, None)


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
    global _vk
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
    m = m or motivo(args["segmentos"], lay, args.get("legendas"), cfg, vcodec, bits)
    # saída menor que o quadro (4K → 1080p): monta direto no tamanho da saída, como a CPU (vc._reduzir_camada) — a base
    # já se encaixa em g.W×g.H na leitura (libplacebo reduz ao subir), as camadas vão em px do quadro × red e os efeitos
    # medem em % da mídia. Legendas medidas no quadro original (o libass escala o .ass). 4 vezes menos pixel por passo
    Wq, Hq, red = W, H, 1.0
    if alvo_h and min(W, H) > alvo_h:
        red = alvo_h / min(W, H)
        W, H = int(round(W * red / 2)) * 2, int(round(H * red / 2)) * 2
        for c in lay:
            vc._reduzir_camada(c, red)
    if m is None and not disponivel():
        m = "placa sem Vulkan/libplacebo"
    # CANIVETE_PLACA_BLOCOS=1: em blocos mesmo cabendo (teste_export --placa-blocos confere as emendas)
    # _blocos: a montagem inteira já estourou a memória da placa (muitas imagens: cada uma reserva quadros próprios —
    # AutoFrame com cartões, 72 imagens, 2026-10-12): de novo, em blocos, cada um só com as camadas do trecho
    grande = m is None and (os.environ.get("CANIVETE_PLACA_BLOCOS") == "1" or args.get("_blocos")
                            or not cabe_na_placa(args["segmentos"], lay, args["path"]))
    if grande and os.environ.get("CANIVETE_PLACA_BLOCOS") != "1" and not args.get("_blocos"):
        # não cabe com o que está ocupado agora: libera o que o app deixou na placa e confere de novo
        grande = not liberar_placa(lambda: cabe_na_placa(args["segmentos"], lay, args["path"]), prog)
    if grande and not all(isinstance(s, dict) and s.get("gap") is not None for s in args["segmentos"] or []):
        # os blocos só dividem camadas: os trechos "lisos" do vídeo principal (trilha base) viram camadas de vídeo no
        # mesmo lugar e a base fica vazia — antes isso caía inteiro no processador (quiz Carlinhos, 37 cortes, 2026-10-13)
        segs, cams = _base_em_camadas(args["segmentos"], args["camadas"], args["path"], Wq, Hq, info)
        if segs is not None:
            args["segmentos"], args["camadas"] = segs, cams   # no lugar: o _motivo e a volta pela CPU usam o mesmo
            lay = vc._normalizar_camadas(args["camadas"], args["path"])
            vc._camadas_na_grade(lay, info["fps"])
            for c in lay if red < 1 else []:
                vc._reduzir_camada(c, red)
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
    ass = vc._gerar_ass(leg["itens"], leg.get("estilo") or {}, Wq, Hq) if leg and leg.get("itens") else None

    def _render(lay_r, total_r, segs_r, arq, feitos, pasta_r=None, on_p=None):
        """Monta e codifica [0, total_r] (a timeline inteira ou um bloco) em arq. None = deu certo; senão o erro.
        pasta_r: a do bloco (blocos ao mesmo tempo não dividem o grafo nem os shaders)."""
        pasta_r = pasta_r or pasta
        os.makedirs(pasta_r, exist_ok=True)
        g, final = montar(lay_r, W, H, fps, total_r, pasta_r, segs_r, args["path"], info)
        sub = ""
        if ass:   # num bloco o relógio começa em `feitos`: as legendas usam o tempo da timeline
            sub = (f",setpts=PTS+{feitos:.6f}/TB,{vc._filtro_sub(ass)},setpts=PTS-{feitos:.6f}/TB"
                   if feitos > 1e-6 else f",{vc._filtro_sub(ass)}")
        # a saída volta a 8 bits (ou 10, no H.265 10 bits) num passo só, com pontilhado (o último filtro pode deixar
        # 16 bits, RGBA ou yuv420p); o libass desenha as legendas em yuv420p10le, não em p010
        fim = ("p010le", ",format=yuv420p10le") if bits == 10 else ("yuv420p", "")
        g.filtros.append(f"{final}libplacebo=format={fim[0]}:disable_linear=1,hwdownload,format={fim[0]}{fim[1]}{sub}[vbaixo]")
        fm, rot_v, args_min = vc.saida_miniatura("[vbaixo]")   # a miniatura do quadro em render (janela do Encoder)
        g.filtros += fm
        # pixel sempre quadrado: camada desenhada estreita (moeda caindo, 54×1562) passa por scale, que mexe na SAR,
        # e o overlay herdava a do fundo — o Reel B saiu com SAR 8:1 (o player mostrava achatado)
        g.filtros.append(f"{rot_v}setsar=1[vout]")
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
        if _quadros_zerados(video, total):   # a placa "exportou" sem erro, mas a imagem saiu vazia (verde)
            _vk = False   # o resto da sessão exporta pela CPU
            return {"success": False, "error": "placa: imagem saiu verde (quadros zerados na placa de vídeo)"}
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
