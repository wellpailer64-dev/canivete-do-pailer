"""Cor cinema (camada de ajuste com Luz e Cor + Brilho + Aberração + Granulação) no export, sem abrir o app do Pailer.

O bug (2026-11-17): a Granulação (mo_grao) não tinha ajusteFF; o editor desenhava a camada de ajuste inteira como vídeo
(vazio, caixa 2×2) e descartava TODOS os efeitos dela. Aqui:
  - o editor não manda mais camada de ajuste para o desenho (veMoTem) e o cache vazio de um clipe de vídeo é detectado;
  - os quatro efeitos, na ordem real e com os parâmetros reais, viram passos na placa e filtros na CPU (nenhum descartado);
  - placa x CPU: vinheta (não pode escurecer em dobro), grão (mesmo desvio da conta da prévia) e a cadeia dos quatro.
Roda com: py -3.13 testes/teste_cor_cinema.py   (TEMP/saídas no D; precisa do Vulkan só para os casos da placa)."""
import json
import os
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
SAIDA = Path("D:/Kanivete/Testes/cor_cinema_136/teste")
SAIDA.mkdir(parents=True, exist_ok=True)
for nome in ("TEMP", "TMP", "APPDATA", "LOCALAPPDATA"):
    pasta = SAIDA / nome.lower()
    pasta.mkdir(exist_ok=True)
    os.environ[nome] = str(pasta)
sys.pycache_prefix = "D:/Kanivete/Testes/pycache"
sys.path.insert(0, str(RAIZ))
from Functions import export_placa as ep, video_cutter as vc  # noqa: E402

W, H = 640, 360
# Os parâmetros reais da camada "Cor cinema" do projeto do Pailer (Luz e Cor sai do editor já como LUT + sharp/vig/clar)
FX_REAIS = [
    {"id": "a", "t": "lc", "on": True, "v": {"sharp": 1.2, "vig": 0.5, "clar": 0.6, "clar_s": 0.015}},
    {"id": "b", "t": "mo_glow", "on": True, "v": {"lim": 35.5, "raio": 18.5, "int": 60, "usaCor": 1, "cor": "#D4814A", "soma": 1}},
    {"id": "c", "t": "ca", "on": True, "v": {"r": -2, "g": 0, "b": 2, "raio": 106, "foco": 43, "suave": 62}},
    {"id": "d", "t": "mo_grao", "on": True, "v": {"amt": 8, "tam": 1.5, "cor": 0, "anim": 1}},
]


def ffmpeg(args, **kw):
    r = subprocess.run([vc.ffmpeg_path(), "-v", "error", *args], capture_output=True, timeout=180, **kw)
    assert r.returncode == 0, r.stderr.decode(errors="replace")[-800:]
    return r.stdout


def quadro(fonte_args, vf, extra=()):
    saida = ffmpeg([*extra, *fonte_args, "-vf", vf, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    return np.frombuffer(saida, np.uint8).reshape(H, W, 3).astype(float)


FONTE = ["-f", "lavfi", "-i", f"testsrc2=s={W}x{H}:r=10:d=0.2"]


def cpu(fx):
    efs = vc._filtros_fx(fx, W, H, "a0")
    nit = ",".join(e[len(vc._NIT_NO_YUV):] for e in efs if e.startswith(vc._NIT_NO_YUV))
    efs = [e for e in efs if not e.startswith(vc._NIT_NO_YUV)]
    vf = "format=rgba" + ("," + ",".join(efs) if efs else "")
    if nit:
        vf += f",scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,{nit},scale=in_color_matrix=bt709:in_range=tv"
    return quadro(FONTE, vf + ",format=rgb24")


def placa(fx):
    pasta = SAIDA / "glsl"
    pasta.mkdir(exist_ok=True)
    passos = ep._passos_lc(None, fx, W, H, str(pasta), "a0")
    vf = ("scale=out_color_matrix=bt709:out_range=tv,format=yuv444p,hwupload,"
          f"libplacebo=format={ep._FMT_MEIO}:disable_linear=1," + "".join(p + "," for p in passos) +
          "libplacebo=format=yuv444p:disable_linear=1,hwdownload,format=yuv444p,"
          "scale=in_color_matrix=bt709:in_range=tv,format=rgb24")
    return quadro(FONTE, vf, ["-init_hw_device", ep._vk_arg(), "-filter_hw_device", "vk"])


class PlanoNaoDescartaEfeitos(unittest.TestCase):
    def test_quatro_efeitos_ficam_na_placa(self):
        self.assertTrue(ep._lc_ok(FX_REAIS), "um dos quatro efeitos ficou fora da placa (cairia na CPU)")
        self.assertFalse(ep._fx_hibrido(FX_REAIS))

    def test_cada_efeito_vira_passo_na_placa(self):
        pasta = SAIDA / "passos"
        shutil.rmtree(pasta, ignore_errors=True)
        pasta.mkdir()
        # Luz e Cor sem LUT aqui (só shader), Brilho, Aberração e Granulação: um passo de libplacebo cada, na ordem do plano
        passos = ep._passos_lc(None, FX_REAIS, W, H, str(pasta), "a0")
        arquivos = sorted(p.name for p in pasta.iterdir())
        self.assertEqual(len(passos), 4, passos)
        for prefixo in ("lc_", "glow_", "ca_", "grao_"):
            self.assertTrue(any(a.startswith(prefixo) for a in arquivos), f"sem passo {prefixo}: {arquivos}")
        ordem = [re.search(r"/(\w+?)_a0", p.replace("\\", "/")).group(1) for p in passos]
        self.assertEqual(ordem, ["lc", "glow", "ca", "grao"])

    def test_cada_efeito_vira_filtro_na_cpu(self):
        efs = vc._filtros_fx(FX_REAIS, W, H, "a0")
        texto = " | ".join(efs)
        self.assertIn("unsharp", texto)            # Luz e Cor: nitidez
        self.assertIn("movie=", texto)             # Luz e Cor: vinheta (máscara)
        self.assertIn("gblur", texto)              # Brilho
        self.assertIn("extractplanes", texto)      # Aberração
        self.assertIn("geq=r=", texto)             # Granulação
        # sem a Granulação o filtro dela não aparece (os outros três seguem)
        sem = [f for f in FX_REAIS if f["t"] != "mo_grao"]
        self.assertNotIn("geq=r=", " | ".join(vc._filtros_fx(sem, W, H, "a0")))

    def test_granulacao_neutra_nao_gera_filtro(self):
        self.assertIsNone(ep._shader_grao({"amt": 0}))
        self.assertEqual(vc._filtros_fx([{"t": "mo_grao", "on": True, "v": {"amt": 0}}], W, H, "a0"), [])
        # num clipe (tag "x") a Granulação é camada desenhada: o exportador não a repete
        self.assertEqual(vc._filtros_fx([{"t": "mo_grao", "on": True, "v": {"amt": 8}}], W, H, "x0"), [])


class BrilhoDoClipe(unittest.TestCase):
    """O Brilho (mo_glow) de um clipe de vídeo comum (o c10 do Dago) é feito pelo exportador, não por um .mov desenhado."""
    GLOW = FX_REAIS[1]

    def test_clipe_na_placa_sem_descer_para_cpu(self):
        self.assertTrue(ep._lc_ok([FX_REAIS[0], self.GLOW]))

    def test_cpu_gera_o_filtro_num_clipe(self):
        for tag in ("l0", "h0", "t0", "p0"):
            self.assertIn("gblur", " | ".join(vc._filtros_fx([self.GLOW], 1080, 1920, tag)), tag)

    def test_placa_gera_o_passo_num_clipe_e_o_raio_acompanha_a_reducao(self):
        pasta = SAIDA / "glow_clipe"
        shutil.rmtree(pasta, ignore_errors=True)
        pasta.mkdir()
        self.assertEqual(len(ep._passos_lc(None, [self.GLOW], 1080, 1920, str(pasta), "v0", ep._FMT_CAM, 1.0)), 1)
        inteiro = (pasta / "glow_v0_0.glsl").read_text(encoding="utf-8")
        ep._passos_lc(None, [self.GLOW], 540, 960, str(pasta), "v1", ep._FMT_CAM, 0.5)
        meio = (pasta / "glow_v1_0.glsl").read_text(encoding="utf-8")
        self.assertLess(meio.count("BRILHO_texOff"), inteiro.count("BRILHO_texOff"), "o raio não encolheu com o quadro reduzido")

    def test_brilho_neutro_nao_gera_passo(self):
        neutro = {"t": "mo_glow", "on": True, "v": {"lim": 50, "raio": 30, "int": 0}}
        self.assertEqual(vc._filtros_fx([neutro], 640, 360, "l0"), [])
        self.assertIsNone(ep._shader_glow(neutro["v"]))


class CpuMesmaContaQuePlaca(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not ep.disponivel():
            raise unittest.SkipTest("sem Vulkan/libplacebo")

    def test_vinheta_nao_escurece_em_dobro_na_cpu(self):
        # Luz e Cor na frente de outros efeitos (a nitidez não vem por último): a vinheta entrava duas vezes na CPU
        fx = [{"t": "lc", "on": True, "v": {"sharp": 0, "vig": 0.5, "clar": 0, "clar_s": 0.015}}]
        a, b = cpu(fx), placa(fx)
        self.assertLess(abs(a.mean() - b.mean()), 3.0, (a.mean(), b.mean()))
        self.assertLess(np.abs(a - b).mean(), 4.0)

    def test_granulacao_mesmo_desvio_da_conta_da_prevista(self):
        def suave(cb, cs):
            d = np.where(cb <= .25, ((16 * cb - 12) * cb + 4) * cb, np.sqrt(cb))
            return np.where(cs <= .5, cb - (1 - 2 * cs) * cb * (1 - cb), cb + (2 * cs - 1) * (d - cb))
        base = 128
        v = {"amt": 8, "tam": 1.5, "cor": 0, "anim": 1}
        ref = 255 * (base / 255 + 0.16 * (suave(np.full((H, W, 3), base / 255), np.random.default_rng(7).random((H, W, 3))) - base / 255))
        cinza = ["-f", "lavfi", "-i", f"color=c=0x808080:s={W}x{H}:r=10:d=0.2"]
        shader = SAIDA / "grao.glsl"
        shader.write_text(ep._shader_grao(v), encoding="utf-8")
        vf_placa = ("scale=out_color_matrix=bt709:out_range=tv,format=yuv444p,hwupload,"
                    f"libplacebo=format={ep._FMT_MEIO}:disable_linear=1,"
                    f"libplacebo=custom_shader_path={vc._caminho_filtro(str(shader))}:format={ep._FMT_MEIO}:disable_linear=1,"
                    "libplacebo=format=yuv444p:disable_linear=1,hwdownload,format=yuv444p,"
                    "scale=in_color_matrix=bt709:in_range=tv,format=rgb24")
        g_placa = quadro(cinza, vf_placa, ["-init_hw_device", ep._vk_arg(), "-filter_hw_device", "vk"])
        g_cpu = quadro(cinza, "format=rgba," + vc._filtros_fx([{"t": "mo_grao", "on": True, "v": v}], W, H, "a0")[0] + ",format=rgb24")
        for nome, g in (("placa", g_placa), ("cpu", g_cpu)):
            self.assertAlmostEqual(g.std(), ref.std(), delta=0.6, msg=f"desvio do grão na {nome}: {g.std():.2f} x {ref.std():.2f}")
            self.assertAlmostEqual(g.mean(), ref.mean(), delta=1.2, msg=nome)
            self.assertLess(float(np.abs(g[..., 0] - g[..., 1]).mean()), 1.0, f"grão cinza saiu colorido ({nome})")

    def test_brilho_de_clipe_placa_x_cpu_inteiro_e_reduzido(self):
        # o Brilho do c10 (colorido, somando) como num clipe: CPU na mídia e shader na placa, também com o quadro reduzido
        # (ep._passos_lc esc): sem o esc o raio ficava 2× maior na placa
        glow = [FX_REAIS[1]]
        for esc in (1.0, 0.5):
            w, h = int(W * esc), int(H * esc)
            # quadro "de foto": o testsrc2 tem borda dura demais (o limite do Brilho no quadro reduzido x reduzir o brilho
            # difere por natureza); com leve desfoque o c10 medido no quadro real dá ~1,8
            fonte = ["-f", "lavfi", "-i", f"testsrc2=s={W}x{H}:r=10:d=0.2"]
            pre = "gblur=sigma=3,"
            efs = ",".join(vc._filtros_fx(glow, W, H, "l0"))
            cpu_ = np.frombuffer(ffmpeg([*fonte, "-vf", f"{pre}format=rgba,{efs},scale={w}:{h}:flags=area,format=rgb24", "-frames:v", "1",
                                          "-f", "rawvideo", "-"]), np.uint8).reshape(h, w, 3).astype(float)
            pasta = SAIDA / f"glsl_clipe_{int(esc * 10)}"
            pasta.mkdir(exist_ok=True)
            passos = ep._passos_lc(None, glow, w, h, str(pasta), "v0", ep._FMT_CAM, esc)
            vf = (f"{pre}scale={w}:{h}:flags=area,scale=out_color_matrix=bt709:out_range=tv,format=yuv444p,hwupload,"
                  f"libplacebo=format={ep._FMT_CAM}:disable_linear=1," + "".join(p + "," for p in passos) +
                  "libplacebo=format=yuv444p:disable_linear=1,hwdownload,format=yuv444p,scale=in_color_matrix=bt709:in_range=tv,format=rgb24")
            pla = np.frombuffer(ffmpeg(["-init_hw_device", ep._vk_arg(), "-filter_hw_device", "vk", *fonte, "-vf", vf,
                                        "-frames:v", "1", "-f", "rawvideo", "-"]), np.uint8).reshape(h, w, 3).astype(float)
            orig = np.frombuffer(ffmpeg([*fonte, "-vf", f"{pre}scale={w}:{h}:flags=area,format=rgb24", "-frames:v", "1", "-f", "rawvideo", "-"]),
                                 np.uint8).reshape(h, w, 3).astype(float)
            self.assertGreater(np.abs(pla - orig).mean(), 0.5, f"a placa não aplicou o Brilho (esc {esc})")
            self.assertLess(np.abs(cpu_ - pla).mean(), 4.0, f"esc {esc}: {np.abs(cpu_ - pla).mean():.2f}")

    def test_cadeia_dos_quatro_efeitos_placa_x_cpu(self):
        a, b = cpu(FX_REAIS), placa(FX_REAIS)
        original = quadro(FONTE, "format=rgb24")
        self.assertGreater(np.abs(a - original).mean(), 1.0, "a CPU não aplicou os efeitos")
        self.assertGreater(np.abs(b - original).mean(), 1.0, "a placa não aplicou os efeitos")
        self.assertLess(np.abs(a - b).mean(), 6.0, np.abs(a - b).mean())   # o grão é ruído diferente nas duas: ~3 de diferença


NODE = r"""
const fs = require('fs');
const fonte = fs.readFileSync(process.argv[2], 'utf8');
const pega = n => {
  const k = fonte.search(new RegExp('^(?:async )?function ' + n + '[(]|^const ' + n + ' = ', 'm'));
  if (k < 0) throw new Error('sem ' + n);
  if (fonte.startsWith('const', k)) return fonte.slice(k, k + fonte.slice(k).search(/;\r?\n/) + 1);
  let d = 0, i = fonte.indexOf('{', k);
  for (; i < fonte.length; i++) { if (fonte[i] === '{') d++; else if (fonte[i] === '}' && --d === 0) break; }
  return fonte.slice(k, i + 1);
};
const VE_FX = { lc: {}, mo_glow: { soDesenho: true, ajusteFF: true, clipeFF: true }, ca: {}, mo_grao: { soDesenho: true, ajusteFF: true }, mo_dir: { soDesenho: true } };
const m = { ajuste: { kind: 'ajuste' }, video: { kind: 'video' }, videoalfa: { kind: 'video', info: { alfa: true } }, imagem: { kind: 'image' }, nulo: { kind: 'nulo' } };
const veMediaOf = c => m[c.m]; const veIsAudio = () => false; const veIsAdj = c => c.m === 'ajuste';
const veMoMkAtivas = c => c.mk || []; const veMoChave = () => null; const veKfOn = () => false;
const veStaticProps = c => Object.assign({ op: 100 }, c.p || {});
eval(['veMoEhNulo', 'veMoPrecisa', 'veMoFFClipe', 'veMoTem', 'veMoSaiuVazia'].map(pega).join('\n') + `
const T = (c) => veMoTem(c);
const cor = [{ t: 'lc', on: true }, { t: 'mo_glow', on: true }, { t: 'ca', on: true }, { t: 'mo_grao', on: true }];
console.log(JSON.stringify({
  cor_cinema_nao_vai_para_desenho: T({ m: 'ajuste', fx: cor }),
  ajuste_com_mo_dir_tambem_nao: T({ m: 'ajuste', fx: [{ t: 'lc', on: true }, { t: 'mo_dir', on: true }] }),
  clipe_com_grao_continua_desenhado: T({ m: 'video', fx: [{ t: 'mo_grao', on: true }] }),
  clipe_video_com_glow_vai_pelo_exportador: T({ m: 'video', fx: [{ t: 'lc', on: true }, { t: 'mo_glow', on: true }] }),
  clipe_video_alfa_com_glow_continua_desenhado: T({ m: 'videoalfa', fx: [{ t: 'mo_glow', on: true }] }),
  imagem_com_glow_continua_desenhada: T({ m: 'imagem', fx: [{ t: 'mo_glow', on: true }] }),
  clipe_glow_com_grao_continua_desenhado: T({ m: 'video', fx: [{ t: 'mo_glow', on: true }, { t: 'mo_grao', on: true }] }),
  clipe_glow_desligado_e_mo_dir: T({ m: 'video', fx: [{ t: 'mo_glow', on: false }, { t: 'mo_dir', on: true }] }),
  clipe_so_lc_nao: T({ m: 'video', fx: [{ t: 'lc', on: true }] }),
  video_caixa_vazia: veMoSaiuVazia({ m: 'video' }, { box: { x: 0, y: 0, w: 2, h: 2 } }),
  video_caixa_normal: veMoSaiuVazia({ m: 'video' }, { box: { x: 0, y: 0, w: 640, h: 360 } }),
  video_sem_caixa_quadro_inteiro: veMoSaiuVazia({ m: 'video' }, { box: null }),
  video_opacidade_zero_pode_ser_vazio: veMoSaiuVazia({ m: 'video', p: { op: 0 } }, { box: { w: 2, h: 2 } }),
  ajuste_vazio_e_normal: veMoSaiuVazia({ m: 'ajuste' }, { box: { w: 2, h: 2 } }),
}));`);
"""


class EditorNaoApagaCorCinema(unittest.TestCase):
    def test_decisoes_do_editor_motion(self):
        (SAIDA / "node_motion.js").write_text(NODE, encoding="utf-8")
        r = subprocess.run(["node", str(SAIDA / "node_motion.js"), str(RAIZ / "frontend/js/editor-motion.js")],
                           capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr[-1500:])
        res = json.loads(r.stdout.strip().splitlines()[-1])
        self.assertFalse(res["cor_cinema_nao_vai_para_desenho"], "a camada de ajuste ainda é desenhada (vazia) e perde os efeitos")
        self.assertFalse(res["ajuste_com_mo_dir_tambem_nao"])
        self.assertTrue(res["clipe_com_grao_continua_desenhado"])
        self.assertFalse(res["clipe_video_com_glow_vai_pelo_exportador"], "o Brilho do clipe de vídeo ainda é desenhado como .mov (memória)")
        self.assertTrue(res["clipe_video_alfa_com_glow_continua_desenhado"])
        self.assertTrue(res["imagem_com_glow_continua_desenhada"])
        self.assertTrue(res["clipe_glow_com_grao_continua_desenhado"])
        self.assertTrue(res["clipe_glow_desligado_e_mo_dir"])
        self.assertFalse(res["clipe_so_lc_nao"])
        self.assertTrue(res["video_caixa_vazia"], "cache envenenado de clipe de vídeo não é detectado")
        self.assertFalse(res["video_caixa_normal"])
        self.assertFalse(res["video_sem_caixa_quadro_inteiro"])
        self.assertFalse(res["video_opacidade_zero_pode_ser_vazio"])
        self.assertFalse(res["ajuste_vazio_e_normal"])

    def test_granulacao_marcada_para_o_exportador(self):
        texto = (RAIZ / "frontend/js/editor-motion.js").read_text(encoding="utf-8")
        bloco = texto[texto.index("    mo_grao: {"):texto.index("    mo_dir: {")]
        self.assertIn("ajusteFF: true", bloco)


if __name__ == "__main__":
    unittest.main(verbosity=2)
