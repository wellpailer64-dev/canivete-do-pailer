"""Borda e avisos por agente, com navegador isolado e sem acessar o projeto aberto."""
import os
from pathlib import Path
import re
import sys
import unittest

RAIZ = Path(__file__).resolve().parents[1]
PASTA = Path('D:/Kanivete/Testes/identidade_agente_132')
PASTA.mkdir(parents=True, exist_ok=True)
for nome in ('TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA'):
    pasta = PASTA / nome.lower()
    pasta.mkdir(exist_ok=True)
    os.environ[nome] = str(pasta)
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', 'D:/Kanivete/Testes/playwright')
from playwright.sync_api import sync_playwright


class IdentidadeAgenteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.addClassCleanup(cls.pw.stop)
        cls.browser = cls.pw.chromium.launch(headless=True)
        cls.addClassCleanup(cls.browser.close)
        texto = (RAIZ / 'frontend/js/app.js').read_text(encoding='utf-8')
        cls.funcoes_borda = '\n'.join(re.search(r'(?ms)^function ' + nome + r'\([^\n]*\) \{.*?^\}', texto).group()
                                     for nome in ('_agenteBordaAplicar', 'agenteBorda'))

    def setUp(self):
        self.pagina = self.browser.new_page()
        self.addCleanup(self.pagina.close)
        self.pagina.set_content('<div></div>')
        self.pagina.add_script_tag(content='const _janelasSoltas = new Set(); let _agenteBordaOn = false, _agenteBordaTimer = null;')
        self.pagina.add_script_tag(content=self.funcoes_borda)
        self.pagina.add_script_tag(path=str(RAIZ / 'frontend/js/agente.js'))

    def test_conexao_tecnica_sozinha_nao_acende(self):
        resultado = self.pagina.evaluate('''() => {
            agenteBorda(true);
            return document.getElementById('agente-borda');
        }''')
        self.assertIsNone(resultado)

    def test_cores_e_nomes_dos_tres_agentes(self):
        for agente, nome, cor in (('claude', 'Claude', '217, 119, 87'),
                                  ('chatgpt', 'ChatGPT', '255, 255, 255'),
                                  ('deepseek', 'DeepSeek', '77, 107, 254')):
            with self.subTest(agente=agente):
                resultado = self.pagina.evaluate('''agente => {
                    agenteBorda(true, agente); veAgAviso('executou um comando', false, agente);
                    return {sombra: document.getElementById('agente-borda').style.boxShadow,
                            aviso: document.querySelector('.ve-agente-aviso:last-child').textContent};
                }''', agente)
                self.assertIn(cor, resultado['sombra'])
                self.assertIn(nome + ': executou um comando', resultado['aviso'])

    def test_identidade_correta_durante_acao_e_limpeza_depois(self):
        resultado = self.pagina.evaluate('''async () => {
            const durante = await veAgente('comando', () => window.kvAgenteAtual, {agente:'deepseek'});
            return {durante, depois: window.kvAgenteAtual || null, log: __veLog.at(-1).tipo,
                    aviso: document.querySelector('.ve-agente-aviso').textContent};
        }''')
        self.assertEqual(resultado['durante'], 'pickle')
        self.assertIsNone(resultado['depois'])
        self.assertEqual(resultado['log'], 'pickle')
        self.assertIn('DeepSeek', resultado['aviso'])

    def test_global_antigo_nao_empresta_nome_a_comando_desconhecido(self):
        resultado = self.pagina.evaluate('''async () => {
            window.kvAgenteAtual = 'claude';
            await veAgente('comando sem identidade', () => 1);
            return {aviso:document.querySelector('.ve-agente-aviso').textContent,
                    borda:!!document.getElementById('agente-borda'), atual:window.kvAgenteAtual || null};
        }''')
        self.assertIn('Agente:', resultado['aviso'])
        self.assertNotIn('Claude', resultado['aviso'])
        self.assertFalse(resultado['borda'])
        self.assertIsNone(resultado['atual'])

    def test_leitura_identificada_nao_acende(self):
        resultado = self.pagina.evaluate('''async () => {
            const durante = await kvComAgente('codex', () => window.kvAgenteAtual, {atividade:false});
            return [durante, !!document.getElementById('agente-borda'), window.kvAgenteAtual || null];
        }''')
        self.assertEqual(resultado, ['codex', False, None])

    def test_borda_expira_mesmo_com_conexao_ociosa(self):
        resultado = self.pagina.evaluate('''() => {
            agenteBorda(true, 'claude'); agenteBorda.estado.fim = Date.now() - 1;
            _agenteBordaAplicar(); agenteBorda(true);
            return [document.getElementById('agente-borda').style.opacity, _agenteBordaTimer];
        }''')
        self.assertEqual(resultado, ['0', None])

    def test_falha_identifica_autor_e_libera_contexto(self):
        resultado = self.pagina.evaluate('''async () => {
            try { await veAgente('falha de teste', () => {throw Error('teste');}, {agente:'codex'}); } catch (erro) {}
            return {atual:window.kvAgenteAtual || null,ativos:KV_AG_ATIVOS.length,
                    erro:__veLog.at(-1).msg,aviso:document.querySelector('.ve-agente-aviso:last-child').textContent};
        }''')
        self.assertIsNone(resultado['atual'])
        self.assertEqual(resultado['ativos'], 0)
        self.assertIn('ChatGPT', resultado['erro'])
        self.assertIn('ChatGPT', resultado['aviso'])

    def test_contextos_concorrentes_nao_restauram_autor_ja_encerrado(self):
        resultado = self.pagina.evaluate('''async () => {
            let concluirClaude, concluirDeepseek;
            const claude = kvComAgente('claude', () => new Promise(resolver => concluirClaude = resolver));
            const deepseek = kvComAgente('pickle', () => new Promise(resolver => concluirDeepseek = resolver));
            concluirClaude(); await claude; const durante = window.kvAgenteAtual;
            concluirDeepseek(); await deepseek;
            return [durante, window.kvAgenteAtual || null, KV_AG_ATIVOS.length];
        }''')
        self.assertEqual(resultado, ['pickle', None, 0])

    def test_janela_solta_recebe_cor_e_desligamento(self):
        resultado = self.pagina.evaluate('''() => {
            const janela = window.open('about:blank'); _janelasSoltas.add(janela);
            agenteBorda(true, 'deepseek');
            const sombra = janela.document.getElementById('agente-borda').style.boxShadow;
            agenteBorda.estado.fim = Date.now()-1; _agenteBordaAplicar();
            const apagada = janela.document.getElementById('agente-borda').style.opacity;
            janela.close(); return [sombra, apagada];
        }''')
        self.assertIn('77, 107, 254', resultado[0])
        self.assertEqual(resultado[1], '0')

    def test_passo_de_desfazer_continua_unico(self):
        resultado = self.pagina.evaluate('''async () => {
            window.VE = {ready:true, clips:[], history:[], future:[1], dirty:false};
            window.veSnapshot = () => JSON.stringify(VE.clips);
            await veAgente('editar', () => VE.clips.push({nome:'clipe'}), {agente:'codex'});
            return [VE.history.length, VE.history[0], VE.future.length, VE.dirty];
        }''')
        self.assertEqual(resultado, [1, '[]', 0, True])

    def test_comando_mcp_completo_identifica_deepseek_sem_deixar_contexto(self):
        sys.path.insert(0, str(RAIZ.parent / 'KaniCode'))
        import mcp_kanivete as mcp
        original = dict(mcp._IDENTIDADE)
        self.addCleanup(mcp._IDENTIDADE.update, original)
        mcp._IDENTIDADE['agente'] = 'pickle'
        capturado = {}
        adaptador = mcp.AdaptadorKanivete(estado_fn=lambda porta: {}, apis_fn=lambda porta: {},
                                         js_fn=lambda codigo, porta: capturado.setdefault('codigo', codigo))
        adaptador._executar_video('ganho_clipe', {'indice': 0, 'db': -3})
        self.pagina.evaluate('''() => {
            window.VE = {ready:true, clips:[{g:0}], history:[], future:[], dirty:false};
            window.veSnapshot = () => JSON.stringify(VE.clips);
            window.vePushHistory = () => VE.history.push(veSnapshot());
            window.veRefresh = () => {};
        }''')
        resultado = self.pagina.evaluate('(' + capturado['codigo'] + ')()')
        self.assertTrue(resultado['ok'])
        estado = self.pagina.evaluate('''() => ({aviso:document.querySelector('.ve-agente-aviso').textContent,
            agente:document.getElementById('agente-borda').dataset.agente,ganho:VE.clips[0].g,
            historico:VE.history.length,ativos:KV_AG_ATIVOS.length,atual:window.kvAgenteAtual || null})''')
        self.assertIn('DeepSeek', estado['aviso'])
        self.assertEqual(estado['agente'], 'pickle')
        self.assertEqual(estado['ganho'], -3)
        self.assertEqual(estado['historico'], 1)
        self.assertEqual(estado['ativos'], 0)
        self.assertIsNone(estado['atual'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
