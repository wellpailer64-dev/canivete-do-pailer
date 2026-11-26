"""Abertura segura com agente, app sem CDP e perfil de teste. Não abre nem fecha aplicativos."""
import ast
import contextlib
import ctypes
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
import Functions
from Functions import instancia_unica as unica
from tools import porta_agente


class InstanciaUnicaTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='D:/Kanivete/Testes', prefix='instancia_')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.env = patch.dict(os.environ, {'APPDATA':str(self.base), 'CANIVETE_AGENTE_PORTA':''})
        self.env.start(); self.addCleanup(self.env.stop)
        self.projeto = patch.object(Functions, 'projeto', SimpleNamespace(projeto_na_linha_de_comando=lambda:'D:/teste.vknv'), create=True)
        self.projeto.start(); self.addCleanup(self.projeto.stop)
        arvore = ast.parse((RAIZ/'main.py').read_text(encoding='utf-8'))
        funcoes = [n for n in arvore.body if isinstance(n, ast.FunctionDef) and n.name in ('_porta_agente','_abrir_em_outra_copia')]
        self.ns = {'os':os,'sys':sys}
        exec(compile(ast.Module(body=funcoes,type_ignores=[]), 'main.py', 'exec'),self.ns)

    def abrir(self, args):
        saida=io.StringIO()
        with patch.object(sys,'argv',['main.py',*args]), contextlib.redirect_stdout(saida):
            retorno=self.ns['_abrir_em_outra_copia']()
        return retorno,saida.getvalue()

    def registrar(self, entradas):
        p=self.base/'CaniveteDoPailer/agente.json';p.parent.mkdir(exist_ok=True)
        p.write_text(json.dumps({'instancias':entradas}),encoding='utf-8')

    def test_agente_9222_nao_pula_instancia_unica(self):
        with patch.object(unica,'ja_aberta',return_value=True) as verificar, patch.object(unica,'enviar',return_value=True) as enviar:
            r,_=self.abrir(['--agente'])
        self.assertTrue(r);verificar.assert_called_once();enviar.assert_called_once_with({'projeto':'D:/teste.vknv'})

    def test_sem_resposta_nao_autoriza_nova_janela(self):
        with patch.object(unica,'ja_aberta',return_value=True),patch.object(unica,'enviar',return_value=False):
            r,saida=self.abrir(['--agente=9223'])
        self.assertTrue(r);self.assertIn('não abri outra',saida)

    def test_primeira_copia_inclusive_agente_passa_a_escutar(self):
        for args in ([],['--agente']):
            with patch.object(unica,'ja_aberta',return_value=False),patch.object(unica,'enviar') as enviar:
                r,_=self.abrir(args)
            self.assertIsNone(r);enviar.assert_not_called()

    def test_falha_de_deteccao_nao_abre_copia_por_tentativa(self):
        with patch.object(unica,'ja_aberta',side_effect=OSError('falha simulada')):
            r,saida=self.abrir([])
        self.assertTrue(r);self.assertIn('não abri outra',saida)

    def test_porta_9333_exige_dados_isolados(self):
        with patch.object(unica,'dados_isolados',return_value=False),patch.object(unica,'ja_aberta') as verificar:
            r,saida=self.abrir(['--agente=9333'])
        self.assertTrue(r);self.assertIn('APPDATA isolado',saida);verificar.assert_not_called()

    def test_perfil_de_teste_aceita_porta_9333(self):
        with patch.object(unica,'ja_aberta',return_value=False):
            r,_=self.abrir(['--agente=9333'])
        self.assertIsNone(r)

    def test_mutex_isolado_por_perfil_sem_colidir_com_pailer(self):
        nome=unica._nome_mutex()
        self.assertTrue(nome.startswith(unica._MUTEX+'_teste_'))
        with patch.dict(os.environ,{'APPDATA':str(self.base/'outro')}):self.assertNotEqual(nome,unica._nome_mutex())
        with patch.dict(os.environ,{'APPDATA':'D:/perfil_normal'}):self.assertEqual(unica._nome_mutex(),unica._MUTEX)

    def test_pasta_parecida_nao_e_isolamento(self):
        with patch.dict(os.environ,{'APPDATA':'D:/Kanivete/Testes_falso/appdata'}):self.assertFalse(unica.dados_isolados())

    def test_registro_ativo_sem_porta_conta_como_app_aberto(self):
        self.registrar([{'pid':1234,'porta':None,'estado':'desligado'}])
        with patch.object(unica,'_pid_vivo',return_value=True):
            self.assertEqual([i['pid'] for i in unica.instancias_vivas()],[1234])

    def test_registro_morto_e_proprio_pid_nao_bloqueiam(self):
        self.registrar([{'pid':1234,'porta':9222},{'pid':os.getpid(),'porta':9223}])
        with patch.object(unica,'_pid_vivo',return_value=False):self.assertEqual(unica.instancias_vivas(),[])

    def test_copia_antiga_sem_mutex_e_encontrada_no_registro(self):
        k=SimpleNamespace(CreateMutexW=Mock(return_value=1),GetLastError=Mock(return_value=0))
        with patch.object(ctypes,'windll',SimpleNamespace(kernel32=k)),patch.object(unica,'instancias_vivas',return_value=[{'pid':1234}]):
            self.assertTrue(unica.ja_aberta())

    def test_mutex_falhou_nao_declara_primeira_copia(self):
        k=SimpleNamespace(CreateMutexW=Mock(return_value=0))
        with patch.object(ctypes,'windll',SimpleNamespace(kernel32=k)):
            with self.assertRaises(OSError):unica.ja_aberta()

    def test_cli_nao_lanca_exe_se_python_esta_registrado(self):
        caminho=RAIZ.parent/'KaniCode/plugins/kanivete/kanivete.py'
        spec=importlib.util.spec_from_file_location('plugin_instancia_teste',caminho)
        plugin=importlib.util.module_from_spec(spec);spec.loader.exec_module(plugin)
        with patch.object(unica,'instancias_vivas',return_value=[{'pid':1234,'porta':None}]),patch.object(plugin.subprocess,'run') as executar:
            self.assertTrue(plugin._ja_rodando())
        executar.assert_not_called()

    def plugin(self):
        caminho=RAIZ.parent/'KaniCode/plugins/kanivete/kanivete.py'
        spec=importlib.util.spec_from_file_location('plugin_instancia_teste',caminho)
        plugin=importlib.util.module_from_spec(spec);spec.loader.exec_module(plugin)
        return plugin

    def test_cli_duas_instancias_exige_escolha_sem_trocar_janela(self):
        plugin=self.plugin()
        with patch.object(plugin,'_instancias_do_app',return_value=[{'pid':1,'porta':9222},{'pid':2,'porta':9223}]), \
             patch.object(plugin,'_lancar') as lancar,patch.object(plugin,'frente') as frente:
            with self.assertRaisesRegex(SystemExit,'mais de um'):plugin.abrir()
        lancar.assert_not_called();frente.assert_not_called()

    def test_cli_reutiliza_python_na_porta_9223(self):
        plugin=self.plugin()
        with patch.object(plugin,'_instancias_do_app',return_value=[{'pid':2,'porta':9223}]), \
             patch.object(plugin,'_vivo',return_value=True) as vivo,patch.object(plugin,'frente') as frente, \
             patch.object(plugin,'_lancar') as lancar:
            plugin.abrir()
        vivo.assert_called_once_with(9223);frente.assert_called_once_with(9223);lancar.assert_not_called()

    def test_cli_modo_desligado_nao_espera_tres_minutos_nem_lanca(self):
        plugin=self.plugin()
        with patch.object(plugin,'_instancias_do_app',return_value=[{'pid':2,'porta':None}]), \
             patch.object(plugin,'_lancar') as lancar,patch.object(plugin.time,'sleep') as esperar:
            with self.assertRaisesRegex(SystemExit,'controle desligado'):plugin.abrir()
        lancar.assert_not_called();esperar.assert_not_called()

    def test_resolver_nao_escolhe_copia_mais_recente_em_ambiguidade(self):
        with patch.object(porta_agente, 'instancias', return_value=[{'porta':9223},{'porta':9224}]):
            with self.assertRaisesRegex(RuntimeError, 'Mais de uma'):
                porta_agente.porta(9222)
            self.assertEqual(porta_agente.porta(9223), 9223)

    def test_variavel_de_porta_conflitante_informa_causa(self):
        with patch.dict(os.environ, {'CANIVETE_AGENTE_PORTA':'9222'}), \
             patch.object(porta_agente, 'instancias', return_value=[{'porta':9223}]):
            with self.assertRaisesRegex(RuntimeError, 'conflita'):
                porta_agente.porta(9222)

    def test_resolver_nunca_cruza_producao_e_teste(self):
        with patch.object(porta_agente, 'instancias', return_value=[{'porta':9223}]):
            self.assertEqual(porta_agente.porta(9333), 9333)

    def test_cli_porta_errada_nao_abre_nem_troca_de_janela(self):
        plugin = self.plugin()
        with patch.object(plugin, '_instancias_do_app', return_value=[{'pid':2,'porta':9223}]), \
             patch.object(plugin, '_lancar') as lancar, patch.object(plugin, 'frente') as frente:
            with self.assertRaisesRegex(SystemExit, 'não corresponde'):
                plugin.abrir(9222)
        lancar.assert_not_called();frente.assert_not_called()


if __name__=='__main__':
    unittest.main()
