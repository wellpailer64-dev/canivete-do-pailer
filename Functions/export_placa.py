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
import math
import os
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
    """Memória da placa em bytes (NVIDIA pelo nvidia-smi; sem como saber: 4 GB, o comum das placas de entrada)."""
    global _vram
    if _vram is None:
        _vram = 4 * 2**30
        try:
            r = subprocess.run(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
                               capture_output=True, text=True, timeout=10, creationflags=vc._creationflags())
            if r.returncode == 0 and r.stdout.strip():
                _vram = int(float(r.stdout.split()[0])) * 2**20
        except Exception:
            pass
    return _vram


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
        bpp = 3.0 if "10" in str(i.get("pix_fmt", "")) else 1.5
        total += (i.get("width") or 1920) * (i.get("height") or 1080) * bpp * 20
    return total


def _lc_ok(fx):
    return all(f.get("t") == "lc" or f.get("on") is False for f in fx or [])


def motivo(segmentos, lay, legendas, cfg, vcodec, bits, reduz=False, alfa=False):
    """Por que esta timeline ainda não vai pela placa (texto curto), ou None se vai."""
    if os.environ.get("CANIVETE_PLACA") == "0":
        return "desligado (CANIVETE_PLACA=0)"
    if alfa:
        return "fundo transparente"
    if vcodec not in ("h264", "hevc") or bits != 8:
        return f"formato {vcodec} {bits} bits"
    if reduz:
        return "saída reduzida"
    if legendas and legendas.get("itens"):
        return "legendas"
    if not lay:
        return "sem camadas"
    for c in lay:
        if c.get("bm"):
            return "modo de mesclagem"
        if c["rot"] or "rot" in c["kf"]:
            return "rotação"
        if any(f.get("t") == "ca_rot" for f in c.get("ca") or []):
            return "Girar constante"
        if c["tipo"] == "ajuste":
            if not _lc_ok(c["fx"]) or c["op"] < 0.999 or "op" in c["kf"]:
                return "camada de ajuste com efeito/opacidade fora do Luz e Cor"
        elif c["tipo"] == "video":
            if not _lc_ok(c["fx"]):
                return "vídeo com efeito fora do Luz e Cor"
            if vc._clipe_tem_alfa(c["path"]):
                return "vídeo com transparência"
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


def _passos_lc(g, fx, mw, mh, pasta, tag):
    """Luz e Cor (uma ou mais instâncias) como passadas do libplacebo: LUT e o shader de Clareza/Vinheta/Nitidez.
    mw/mh = tamanho em que o efeito mede (a mídia, num clipe; o quadro, na camada de ajuste)."""
    passos = []
    for j, f in enumerate(fx or []):
        if f.get("on") is False or f.get("t") != "lc":
            continue
        v = f.get("v") or {}
        if v.get("lut"):
            cube = vc._lut_cube(v.get("n"), v["lut"])
            if cube:
                passos.append(f"libplacebo=lut={vc._caminho_filtro(cube)}:lut_type=2:format=yuv420p")
        sh = _shader_lc(vc._num(v.get("clar_s"), 0, 0.2) * min(mw, mh), vc._num(v.get("clar"), -2, 2),
                        vc._num(v.get("sharp"), 0, 5), vc._num(v.get("vig"), 0, 1.5708), mw, mh)
        if sh:
            arq = os.path.join(pasta, f"lc_{tag}_{j}.glsl")
            with open(arq, "w", encoding="utf-8") as fh:
                fh.write(sh)
            passos.append(f"libplacebo=custom_shader_path={vc._caminho_filtro(arq)}:format=yuv420p")
    return passos


def _expr(c, prop, fixo, tl):
    return vc._expr_kf(c["kf"][prop], tl) if prop in c["kf"] else f"{fixo:.6f}"


def _posicao(c, k, wv, hv, tl, dx=0.0, dy=0.0):
    """pos_x/pos_y/pos_w/pos_h (canto, em px do quadro) — as contas do overlay do exportador (sem rotação)."""
    px, py = _expr(c, "x", c["x"], tl), _expr(c, "y", c["y"], tl)
    if abs(c["ox"]) > 0.01 or abs(c["oy"]) > 0.01:
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
def _entrada_video(g, c, info, pasta, n_cam):
    """Clipe lido na placa (ou na CPU e enviado uma vez); tempos idênticos aos do exportador de CPU."""
    vk = info.get("vcodec") in _CODECS_VK and info.get("pix_fmt", "") in ("yuv420p", "yuvj420p", "nv12", "yuv420p10le", "p010le")
    ss = max(0.0, c["s"] - 3.0)
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
    red = min(1.0, k_max * 1.02) if k_max < 0.9 else 1.0
    rw, rh = max(2, int(round(c["mw"] * red / 2)) * 2), max(2, int(round(c["mh"] * red / 2)) * 2)
    giro = ""
    if vk and (rot in _GIRO or red < 1):
        giro = ("libplacebo=" + (f"rotate={_GIRO[rot]}:" if rot in _GIRO else "")
                + (f"w={rw}:h={rh}:" if red < 1 else "") + "format=yuv420p:disable_linear=1,")
    sobe = ("" if vk else (f"scale={rw}:{rh}:flags=bicubic," if red < 1 else "") + "format=yuv420p,hwupload,")
    # os efeitos medem em % da mídia: no quadro reduzido, as medidas do quadro reduzido
    efeito = "".join(p + "," for p in _passos_lc(g, c["fx"], rw, rh, pasta, f"v{n_cam}"))
    opac = ""
    if not _opaca(c):
        # fade de um clipe: só ele desce para receber a transparência (sendcmd no tempo da timeline) e sobe de volta
        a = (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@vop{n_cam}", c["st"])
             if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
        opac = f"hwdownload,format=pix_fmts=nv12|yuv420p,scale=in_color_matrix=bt709,format=rgba,{a},hwupload,"
    r = g.rotulo("v")
    g.filtros.append(f"[{k}:v:0]{vc._marca_hd(c['path'])}trim=start={vc._tempo_ffmpeg(c['s'] - ss)}:"
                     f"end={vc._tempo_ffmpeg(c['s'] - ss + c['fonte'])},"
                     + ("setpts=PTS-STARTPTS," if c.get("base") else f"setpts=(PTS-{c['s'] - ss:.6f}/TB)/{c['v']:.6f},")
                     + f"fps=fps={g.fps:.3f}:start_time=0,tpad=stop_mode=clone:stop_duration={vc._tempo_ffmpeg(g.fd)},"
                     f"settb=AVTB,setpts=PTS-STARTPTS+round({c['st'] - g.fd / 4:.9f}/TB),"
                     f"trim=end={min(g.total, c['st'] + c['dur']) - g.fd / 2:.6f},{sobe}{giro}{efeito}{opac}null[{r}]")
    tl = f"(ot-{c['st']:.6f})"   # ot = tempo do quadro de SAÍDA (o t do libplacebo é o da entrada)
    kx = _escala(c, tl)
    return [(f"[{r}]", _posicao(c, kx, *_tam(c, c["mw"], c["mh"], kx, tl), tl))]


def _entrada_imagem(g, c, n_cam):
    """Imagem (PNG parado ou sequência de texto animado) preparada na CPU como no exportador e enviada pequena.
    Devolve [(rótulo, posição)] — a sombra projetada, se houver, vem antes (por baixo)."""
    seq = c.get("seq")
    efeitos = [e for e in vc._filtros_fx(c["fx"], c["mw"], c["mh"], f"p{n_cam}") if not e.startswith(vc._NIT_NO_YUV)]
    bw, bh = c["mw"], c["mh"]
    recorte = []
    if not seq and not any(f.get("t") in ("blur", "b3d") and f.get("on") is not False for f in c["fx"]):
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
    if seq:
        k = g.entrada(["-f", "concat", "-safe", "0", "-i", seq])
        cadeia = (f"[{k}:v:0]trim=start={vc._tempo_ffmpeg(c['s'])}:end={vc._tempo_ffmpeg(c['s'] + c['fonte'])},"
                  f"setpts=PTS-STARTPTS,{PARA_RGB_IMG}," + ",".join(efeitos + [f"scale={tw}:{th}:flags=lanczos",
                                                                           f"fps=fps={g.fps:.3f}:start_time=0"]))
    else:
        k = g.entrada(["-i", c["path"]])
        cadeia = (f"[{k}:v:0]{PARA_RGB_IMG}," + ",".join(efeitos + recorte + [f"scale={tw}:{th}:flags=lanczos",
                                                                             f"loop=loop={n_q - 1}:size=1:start=0",
                                                                             "settb=AVTB", f"setpts=N/({g.fps:.3f}*TB)"]))
    if not _opaca(c):
        cadeia += "," + (vc._opacidade_animada(c["kf"]["op"], c["dur"], g.fps, f"colorchannelmixer@pop{n_cam}")
                         if "op" in c["kf"] else f"colorchannelmixer=aa={c['op']:.4f}")
    fim = min(g.total, c["st"] + c["dur"])
    # base de tempo em µs: a do PNG (1/25 s) arredondava o início para múltiplos de 0,04 s e o 1º quadro sumia (preto)
    cadeia += f",format=rgba,settb=AVTB,setpts=PTS-STARTPTS+round({c['st'] - g.fd / 4:.9f}/TB),trim=end={fim - g.fd / 2:.6f}"
    tl = f"(ot-{c['st']:.6f})"   # ot = tempo do quadro de SAÍDA (o t do libplacebo é o da entrada)
    kx = _escala(c, tl)
    wv, hv = _tam(c, bw, bh, kx, tl)
    sombra = vc._sombra_camada(c)
    r = g.rotulo("i")
    if not sombra:
        g.filtros.append(f"{cadeia},hwupload[{r}]")
        return [(f"[{r}]", _posicao(c, kx, wv, hv, tl))]
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
    wsv, hsv = f"(({tw}+{2 * m})*{esc})", f"(({th}+{2 * m})*{esc})"
    return [(f"[{rs}]", _posicao(c, kx, wsv, hsv, tl, dx, dy)), (f"[{r}]", _posicao(c, kx, wv, hv, tl))]


def _arvore(vals, padrao):
    """if(lt(in_idx, …)) balanceado: o avaliador do ffmpeg aceita ~100 níveis de aninhamento."""
    def rec(lo, hi):
        if lo == hi:
            return vals.get(lo, padrao)
        m = (lo + hi) // 2
        return f"if(lte(in_idx,{m}),{rec(lo, m)},{rec(m + 1, hi)})"
    return rec(0, max(vals) if vals else 0)


def _compor(g, fundo, itens):
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
                     f"fps={g.fps:.3f}:format=yuv420p:disable_linear=1:"
                     f"pos_x='{_arvore(px, '0')}':pos_y='{_arvore(py, '0')}':"
                     f"pos_w='{_arvore(pw, 'ow')}':pos_h='{_arvore(ph, 'oh')}'[{r}]")
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


def _ajuste(g, entrada, c, pasta):
    """Camada de ajuste (Luz e Cor) no trecho dela: o composto de baixo passa pela LUT e pelo shader e volta por cima
    só enquanto a camada existe (uma entrada do libplacebo aparece só enquanto tem quadros)."""
    passos = _passos_lc(g, c["fx"], g.W, g.H, pasta, f"a{g.rot}")
    if not passos:
        return entrada
    ini, fim = max(0.0, c["st"]), min(g.total, c["st"] + c["dur"])
    if ini <= g.fd / 2 and fim >= g.total - g.fd / 2:
        r = g.rotulo("a")
        g.filtros.append(f"{entrada}{','.join(passos)}[{r}]")
        return f"[{r}]"
    a, b = g.rotulo("a"), g.rotulo("a")
    g.filtros.append(f"{entrada}split[{a}][{b}x]")
    g.filtros.append(f"[{b}x]trim=start={ini - g.fd / 2:.6f}:end={fim - g.fd / 2:.6f},{','.join(passos)}[{b}]")
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
    vk = info.get("vcodec") in _CODECS_VK
    mw, mh = info["width"], info["height"]
    kf = min(g.W / mw, g.H / mh) if mw and mh else 1.0
    w, h = max(2, int(mw * kf) // 2 * 2), max(2, int(mh * kf) // 2 * 2)
    partes = []
    for i, p in enumerate(pecas):
        r = g.rotulo("b")
        if p[0] == "gap":
            g.filtros.append(f"color=c=black:s={g.W}x{g.H}:r={g.fps:.3f}:d={vc._tempo_ffmpeg(p[1])},format=yuv420p,"
                             f"hwupload,setsar=1[{r}]")
        else:
            ss = max(0.0, p[0] - 3.0)
            pre = (["-hwaccel", "vulkan", "-hwaccel_output_format", "vulkan"] if vk else []) + ["-threads", "2"]
            if rot and vk:
                pre += ["-display_rotation:v:0", "0"]
            k = g.entrada(pre + (["-ss", vc._tempo_ffmpeg(ss)] if ss > 0 else [])
                          + ["-t", vc._tempo_ffmpeg(p[1] - ss + 1.0), "-i", path])
            giro = f"rotate={_GIRO[rot]}:" if rot in _GIRO and vk else ""
            sobe = "" if vk else "format=yuv420p,hwupload,"
            g.filtros.append(f"[{k}:v:0]{vc._marca_hd(path)}trim=start={vc._tempo_ffmpeg(p[0] - ss)}:"
                             f"end={vc._tempo_ffmpeg(p[1] - ss)},setpts=PTS-STARTPTS,{sobe}"
                             f"libplacebo={giro}w={g.W}:h={g.H}:pos_w={w}:pos_h={h}:format=yuv420p:disable_linear=1,"
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
            atual = _ajuste(g, atual, c, pasta)
            continue
        if c["tipo"] == "video":
            if c["path"] not in infos:
                infos[c["path"]] = vc.probe(c["path"])
            pendentes += _entrada_video(g, c, infos[c["path"]], pasta, n)
        else:
            pendentes += _entrada_imagem(g, c, n)
        if len(pendentes) >= 24:   # libplacebo com muitas entradas: compõe em lotes (a ordem de empilhar se mantém)
            atual = _compor(g, atual, pendentes)
            pendentes = []
    atual = _compor(g, atual, pendentes)
    return g, atual


# ─────────────────────────────── exportação ───────────────────────────────

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
    if m is None and memoria_estimada(args["segmentos"], lay, args["path"]) > 0.7 * memoria_placa():
        m = "vídeos grandes demais para a memória da placa de uma vez (Forçar Full HD resolve)"
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
    try:
        g, final = montar(lay, W, H, fps, total, pasta, args["segmentos"], args["path"], info)
        g.filtros.append(f"{final}hwdownload,format=yuv420p[vbaixo]")
        fm, rot_v, args_min = vc.saida_miniatura("[vbaixo]")   # a miniatura do quadro em render (janela do Encoder)
        g.filtros += fm
        g.filtros.append(f"{rot_v}null[vout]")
        grafo = os.path.join(pasta, "grafo.txt")
        with open(grafo, "w", encoding="utf-8") as f:
            f.write(";\n".join(g.filtros))
        if os.environ.get("CANIVETE_PLACA_DEBUG") == "1":   # guarda o grafo e o comando para depurar
            shutil.copy(grafo, os.path.join(vc._midia_dir(), f"placa_grafo_{uuid.uuid4().hex[:6]}.txt"))
        enc = vc._args_video(dict(cfg, vcodec=vcodec), q, args["usar_gpu"], bits, float(op.get("mbps") or 0))
        cor = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
        cmd = g.cmd + ["-/filter_complex", grafo, "-map", "[vout]", "-t", vc._tempo_ffmpeg(total), *enc, *cor,
                       "-an", video] + args_min
        if t_som:
            t_som.start()
        prog(0, "Exportando na placa de vídeo...")
        rc, err = vc._run_progress(cmd, total, lambda p: (video_pct.__setitem__(0, p), _progresso()), stop_event, _holder)
        if stop_event is not None and stop_event.is_set():
            return {"success": False, "cancelled": True, "error": "Exportação cancelada."}
        if rc != 0 or not os.path.isfile(video):
            log = os.path.join(vc._midia_dir(), f"placa_falhou_{uuid.uuid4().hex[:6]}.txt")
            try:
                with open(log, "w", encoding="utf-8") as f:
                    f.write(" ".join(cmd) + "\n\n" + ";\n".join(g.filtros) + "\n\n" + (err or ""))
            except OSError:
                log = ""
            return {"success": False, "error": "placa: " + "\n".join(vc._linhas_ffmpeg(err) or [str(rc)]), "log": log}
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
        cmd += ["-c:v", "copy"] + (["-tag:v", "hvc1"] if vcodec == "hevc" and cfg["ext"] in (".mp4", ".mov") else []) \
            + cfg["extra"] + [temp]
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
            "size": os.path.getsize(saida), "turbo": False, "placa": True}
