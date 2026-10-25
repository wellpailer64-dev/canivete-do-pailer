"""Recuperação limitada do gerador, sem carregar modelos nem usar a GPU; saídas sempre em D."""
import base64
import copy
import sys
import tempfile
import threading
import types
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

RAIZ = Path(__file__).resolve().parents[1]
if not (RAIZ / 'Functions').is_dir():
    RAIZ = Path.cwd()
sys.path.insert(0, str(RAIZ))
from Functions import gerador_imagem as g

PNG = base64.b64encode(b'imagem de teste').decode()
CONCLUIDO = {'status': 'completed', 'result': {'images': [{'b64_json': PNG}]}}


class TesteRecuperacaoGerador(unittest.TestCase):
    def setUp(self):
        self.pilha = ExitStack()
        self.addCleanup(self.pilha.close)
        self.pasta = self.pilha.enter_context(tempfile.TemporaryDirectory(dir='D:/kanivete_testes/variacoes'))
        self.proc = Mock()
        self.estado = {'proc': self.proc, 'log': [], 'passo': None, 'cancelar': None, 'uso': 0, 'ocupado': False}
        self.pilha.enter_context(patch.object(g, '_srv', self.estado))
        self.pilha.enter_context(patch.object(g, '_gerando', threading.Lock()))
        self.pilha.enter_context(patch.object(g, '_cache_dir', return_value=self.pasta))
        self.pilha.enter_context(patch.object(g, 'instalado', return_value=True))
        self.pilha.enter_context(patch.object(g, '_liberar_gpu_ollama', return_value=[]))
        self.pilha.enter_context(patch.dict(sys.modules, {'Functions.removerfundo': types.SimpleNamespace(liberar_sessoes=lambda: None)}))
        self.pilha.enter_context(patch.object(g.time, 'sleep'))
        self.subir = self.pilha.enter_context(patch.object(g, '_subir', side_effect=self.carregar))
        self.parar = self.pilha.enter_context(patch.object(g, 'parar', side_effect=self.liberar))
        self.http = self.pilha.enter_context(patch.object(g, '_http', side_effect=self.responder))
        self.respostas, self.pedidos, self.progresso = [], [], []
        self.spec = {'prompt': 'teste', 'largura': 976, 'altura': 880, 'semente': 1234, 'motor': 'klein',
                     'refs': ['cmVm'], 'init': 'aW5pdA==', 'mascara': 'bWFzY2FyYQ==', 'forca': 0.8, 'sem_cache': True}

    def carregar(self, progresso, modelo):
        self.estado['log'] = [f'carregamento {self.subir.call_count}']

    def liberar(self):
        self.estado['proc'] = None
        return {'success': True}

    def responder(self, metodo, caminho, corpo=None):
        if metodo == 'POST':
            self.pedidos.append(copy.deepcopy(corpo))
        resposta = self.respostas.pop(0)
        return resposta() if callable(resposta) else resposta

    def gerar(self, progresso=None):
        return g.gerar(self.spec, progresso or self.progresso.append)

    def test_recupera_preservando_pedido_e_espera_liberacao(self):
        self.respostas = [{'id': 'a'}, {'status': 'failed', 'error': {'message': 'generate_image returned no results'}}, {'id': 'b'}, CONCLUIDO]
        r = self.gerar()
        self.assertTrue(r['success'], r)
        self.assertEqual(r['tentativas'], 2)
        self.assertEqual(self.pedidos[0], self.pedidos[1])
        self.assertEqual([r['largura'], r['altura'], r['semente']], [976, 880, 1234])
        self.parar.assert_called_once()
        self.proc.wait.assert_called_once_with(timeout=20)
        self.assertIn('carregamento 1', r['falhas'][0]['log'])
        self.assertTrue(any('Tentando novamente' in p['msg'] for p in self.progresso))
        self.assertEqual(Path(r['path']).read_bytes(), b'imagem de teste')
        self.assertFalse(self.estado['ocupado'])
        self.assertFalse(g._gerando.locked())

    def test_memoria_recupera_uma_vez(self):
        for erro in ['out of device memory', 'OutOfDeviceMemory', 'failed to allocate buffer', 'cannot make enough memory available', 'generate_image returned empty results']:
            with self.subTest(erro=erro):
                self.respostas = [{'id': 'a'}, {'status': 'failed', 'error': {'message': erro}}, {'id': 'b'}, CONCLUIDO]
                self.assertTrue(self.gerar()['success'])

    def test_falha_dupla_tem_limite_e_diagnostico(self):
        self.respostas = [{'id': 'a'}, {'status': 'failed', 'error': {'message': 'out of memory'}}, {'id': 'b'}, {'status': 'failed', 'error': {'message': 'generate_image returned no results'}}]
        r = self.gerar()
        self.assertFalse(r['success'])
        self.assertEqual(r['tentativas'], 2)
        self.assertEqual(len(r['falhas']), 2)
        self.assertEqual(self.subir.call_count, 2)
        self.assertFalse(list(Path(self.pasta).glob('*.png')))
        self.assertFalse(g._gerando.locked())

    def test_parametros_invalidos_nao_repetem(self):
        self.respostas = [{'id': 'a'}, {'status': 'failed', 'error': {'message': 'invalid params'}}]
        r = self.gerar()
        self.assertFalse(r['success'])
        self.assertEqual(r['tentativas'], 1)
        self.parar.assert_not_called()

    def test_cancelar_em_execucao_nao_repete(self):
        def pedido():
            self.estado['cancelar'] = 'a'
            return {'id': 'a'}
        self.respostas = [pedido]
        r = self.gerar()
        self.assertFalse(r['success'])
        self.assertEqual(r['error'], 'cancelada')
        self.assertEqual(len(self.pedidos), 1)
        self.assertEqual(self.subir.call_count, 1)

    def test_cancelar_durante_recarga_nao_envia_pedido(self):
        carregar = self.carregar
        def recarregar(progresso, modelo):
            carregar(progresso, modelo)
            if self.subir.call_count == 2:
                self.estado['cancelar'] = 'a'
        self.subir.side_effect = recarregar
        self.respostas = [{'id': 'a'}, {'status': 'failed', 'error': {'message': 'out of memory'}}]
        r = self.gerar()
        self.assertFalse(r['success'])
        self.assertEqual(r['error'], 'cancelada')
        self.assertEqual(len(self.pedidos), 1)

    def test_cancelar_entre_tentativas_nao_recarrega(self):
        self.respostas = [{'id': 'a'}, {'status': 'failed', 'error': {'message': 'out of memory'}}]
        def progresso(d):
            if 'Tentando novamente' in d['msg']:
                self.estado['cancelar'] = 'a'
        r = self.gerar(progresso)
        self.assertEqual(r['error'], 'cancelada')
        self.assertEqual(self.subir.call_count, 1)
        self.assertEqual(len(self.pedidos), 1)

    def test_cancelado_pelo_servidor_nao_repete(self):
        self.respostas = [{'id': 'a'}, {'status': 'cancelled', 'error': {'message': 'generate_image returned no results'}}]
        r = self.gerar()
        self.assertEqual(r['error'], 'cancelada')
        self.assertEqual(self.subir.call_count, 1)
        self.parar.assert_not_called()

    def test_sucesso_direto_nao_recarrega(self):
        self.respostas = [{'id': 'a'}, CONCLUIDO]
        r = self.gerar()
        self.assertTrue(r['success'])
        self.assertEqual(r['tentativas'], 1)
        self.assertEqual(r['falhas'], [])
        self.parar.assert_not_called()

    def test_ocupado_recusa_sem_tocar_no_servidor(self):
        g._gerando.acquire()
        try:
            r = self.gerar()
            self.assertFalse(r['success'])
            self.assertIn('em andamento', r['error'])
            self.http.assert_not_called()
            self.subir.assert_not_called()
            self.parar.assert_not_called()
        finally:
            g._gerando.release()

    def test_semente_aleatoria_e_cache_permanecem_consistentes(self):
        self.spec['semente'] = -1
        self.respostas = [{'id': 'a'}, {'status': 'failed', 'error': {'message': 'out of memory'}}, {'id': 'b'}, CONCLUIDO]
        with patch.object(g.os, 'urandom', return_value=b'\x01\x02\x03\x04'):
            r = self.gerar()
        self.assertTrue(r['success'])
        self.assertEqual(self.pedidos[0]['seed'], self.pedidos[1]['seed'])
        self.spec.update(semente=r['semente'], sem_cache=False)
        cache = self.gerar()
        self.assertTrue(cache['cache'])
        self.assertEqual(cache['path'], r['path'])
        self.assertEqual(len(self.pedidos), 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
