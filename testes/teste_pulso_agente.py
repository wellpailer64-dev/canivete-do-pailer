"""Reação visual do agente na timeline (pulso no clipe alterado), testada com o código real de editor.js em Node.

Só as funções novas são extraídas do arquivo; veDraw, veAcc e veRoundRect viram stubs. Não abre o app.
"""
import json
import re
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def _trecho_pulso():
    texto = (RAIZ / "frontend/js/editor.js").read_text(encoding="utf-8")
    inicio = texto.index("const VE_AG_PULSO_MS")
    fim_funcao = texto.index("function veAgPulsoDesenhar")
    fim = texto.index("\n}\n", fim_funcao) + 3
    return texto[inicio:fim]


CODIGO = """
global.VE = {clips: [{st: 0, m: 1}, {st: 5, m: 2}], _agPulsoRodando: false};
let desenhos = 0;
global.veDraw = () => { desenhos++; };
global.veAcc = () => '#f00';
global.veRoundRect = () => {};
global.requestAnimationFrame = cb => setTimeout(cb, 16);
let traços = 0;
const ctx = {save() {}, restore() {}, stroke() { traços++; }};
""" + _trecho_pulso() + """
(async () => {
    const assinar = c => JSON.stringify(c, (k, v) => (k && k[0] === '_' ? undefined : v));
    const antes = new Map(VE.clips.map(c => [c, assinar(c)]));
    VE.clips[0].st = 1;                         // só o primeiro clipe muda
    veAgPulsarMudancas(antes, '#0f0');
    const acesos = VE_AG_ATIVOS.size;
    const marcadoAlterado = VE_AG_ATIVOS.has(VE.clips[0]), marcadoParado = VE_AG_ATIVOS.has(VE.clips[1]);
    veAgPulsoDesenhar(ctx, VE.clips[1], 0, 0, 10, 10);
    const tracosParado = traços;
    veAgPulsoDesenhar(ctx, VE.clips[0], 0, 0, 10, 10);
    const tracosAlterado = traços - tracosParado;
    const desenhosAntes = desenhos;
    await new Promise(r => setTimeout(r, 1400));  // pulso dura 1100 ms; clipe não foi desenhado de novo
    console.log(JSON.stringify({acesos, marcadoAlterado, marcadoParado, tracosParado, tracosAlterado,
        desenhou: desenhos > desenhosAntes, apagou: VE_AG_ATIVOS.size, laco: VE._agPulsoRodando}));
})();
"""


class PulsoAgenteTest(unittest.TestCase):
    def test_pulso_marca_so_o_clipe_alterado_e_some_sozinho(self):
        processo = subprocess.run(["node", "-"], input=CODIGO, text=True, capture_output=True, timeout=20)
        self.assertEqual(processo.returncode, 0, processo.stderr)
        r = json.loads(processo.stdout.strip().splitlines()[-1])
        self.assertEqual(r["acesos"], 1)
        self.assertTrue(r["marcadoAlterado"])
        self.assertFalse(r["marcadoParado"])
        self.assertEqual(r["tracosParado"], 0, "clipe sem alteração não pode ganhar contorno")
        self.assertEqual(r["tracosAlterado"], 1, "clipe alterado desenha o contorno")
        self.assertTrue(r["desenhou"], "o laço de animação redesenha a timeline")
        self.assertEqual(r["apagou"], 0, "pulso expira pelo tempo, mesmo fora da tela")
        self.assertFalse(r["laco"], "laço para quando não há pulsos")


if __name__ == "__main__":
    unittest.main()
