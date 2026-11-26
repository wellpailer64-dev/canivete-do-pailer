"""Abas de projeto no app de teste 9333, com vídeo e áudio reais; saídas no D."""
import ast
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
PASTA = Path('D:/Kanivete/Testes/abas_projeto')
PASTA.mkdir(parents=True, exist_ok=True)
os.environ['PYTHONPYCACHEPREFIX'] = 'D:/Kanivete/Testes/pycache'


class AbasProjetoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.pw = sync_playwright().start()
        cls.addClassCleanup(cls.pw.stop)
        cls.browser = cls.pw.chromium.connect_over_cdp('http://127.0.0.1:9333')
        cls.pg = next(pg for contexto in cls.browser.contexts for pg in contexto.pages
            if 'index.html' in pg.url and pg.evaluate("typeof VE === 'object' && !!window.pywebview"))
        estado = cls.pg.evaluate('''async () => ({agente:await pywebview.api.ve_agente_porta(),
            ready:VE.ready, abas:VEAP.abas.length})''')
        if not estado['agente'].get('teste') or estado['ready'] or estado['abas']:
            raise RuntimeError('Use uma instância de teste vazia na porta 9333; nenhum projeto será substituído.')
        cls.addClassCleanup(lambda: cls.pg.evaluate('''async () => { await veApSuspender(); veCloseProject(); }'''))
        cls.erros = []
        cls.pg.on('pageerror', lambda erro: cls.erros.append(str(erro)))
        for nome, cor, frequencia in [('primeiro', 'red', 440), ('segundo', 'blue', 660)]:
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                '-f', 'lavfi', '-i', f'color=c={cor}:s=160x90:r=24:d=2',
                '-f', 'lavfi', '-i', f'sine=frequency={frequencia}:duration=2',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
                str(PASTA / f'{nome}.mp4')], check=True, timeout=30)
        cls.pg.evaluate("switchTool('video-cutter'); VEPRA.pausado = true")

    def pronto(self):
        self.pg.wait_for_function('VE.ready && !VE._pendingProject && !VEAP.trocando && veVideo().readyState >= 2', timeout=30000)

    def test_projetos_com_midia_desfazer_bloqueios_e_falhas(self):
        self.pg.evaluate('caminho => veOpenPath(caminho)', str(PASTA / 'primeiro.mp4'))
        self.pronto()
        primeiro = self.pg.evaluate('''async caminho => {
            vePushHistory(); VE.clips[0].st = .25; VE.playhead = .75;
            VE.dirty = true; veUpdateTitle();
            const d = veProjectData();
            await pywebview.api.ve_project_save(caminho, JSON.stringify(d), false, null);
            VE.projectPath = caminho; veUpdateTitle();
            return {id:VEAP.ativa,history:VE.history.length,seq:VE.activeSequence};
        }''', str(PASTA / 'primeiro.vknv'))
        self.pg.evaluate('caminho => veAbrirArquivoEscolhido(caminho, false, false)', str(PASTA / 'segundo.mp4'))
        self.pronto()
        segundo = self.pg.evaluate('''() => {
            vePushHistory(); VE.clips[0].st = .5; VE.dirty = true; veUpdateTitle();
            return VEAP.ativa;
        }''')
        self.assertEqual(self.pg.evaluate('VEAP.abas.length'), 2)
        self.assertTrue(self.pg.evaluate('id => veApAtivar(id)', primeiro['id']))
        self.pronto()
        self.assertEqual(self.pg.evaluate('[VE.clips[0].st, VE.dirty, VE.history.length]'), [.25, True, primeiro['history']])
        self.pg.wait_for_function('Math.abs(VE.playhead - .75) < .1')
        self.assertTrue(self.pg.evaluate('VEAP.abas.find(a => a.id === VEAP.ativa).snap === null'))
        self.pg.evaluate('veUndo()')
        self.assertEqual(self.pg.evaluate('VE.clips[0].st'), 0)
        self.pg.evaluate('veRedo()')
        self.assertEqual(self.pg.evaluate('VE.clips[0].st'), .25)
        self.assertTrue(self.pg.evaluate('id => veApAtivar(id)', segundo))
        self.pronto()
        self.assertEqual(self.pg.evaluate('VE.clips[0].st'), .5)
        self.assertTrue(self.pg.evaluate('id => veApAtivar(id)', primeiro['id']))
        self.pronto()
        self.assertEqual(self.pg.evaluate('VE.clips[0].st'), .25)
        self.pg.evaluate('VEFILA.preparando = 1')
        self.assertFalse(self.pg.evaluate('id => veApAtivar(id)', segundo))
        self.assertFalse(self.pg.evaluate('veNovoProjeto()'))
        self.pg.evaluate('VEFILA.preparando = 0; VE.exportRunning = true')
        self.assertFalse(self.pg.evaluate('id => veApAtivar(id)', segundo))
        self.pg.evaluate('VE.exportRunning = false')
        self.assertTrue(self.pg.evaluate('caminho => veOpenProject(caminho)', str(PASTA / 'primeiro.vknv')))
        self.assertEqual(self.pg.evaluate('VEAP.abas.length'), 2)
        self.assertFalse(self.pg.evaluate('caminho => veOpenProject(caminho)', str(PASTA / 'inexistente.vknv')))
        self.assertEqual(self.pg.evaluate('VE.clips[0].st'), .25)
        self.pg.evaluate('''() => {
            window._confirmarAbasOriginal = appConfirm;
            appConfirm = async () => null;
        }''')
        self.pg.evaluate('id => veApFechar(id)', segundo)
        self.assertEqual(self.pg.evaluate('VEAP.abas.length'), 2)
        self.pg.evaluate('() => { appConfirm = _confirmarAbasOriginal; }')
        antes = self.pg.evaluate('JSON.stringify(VE.clips)')
        self.pg.evaluate("veOnPrepare({stage:'peaks',path:'outro.mp4',peaks:[123]}); veOnMidia({id:0,stage:'info',path:'outro.mp4',duration:999})")
        self.assertEqual(self.pg.evaluate('JSON.stringify(VE.clips)'), antes)
        self.assertNotEqual(self.pg.evaluate('VE.srcDur'), 999)
        self.pg.evaluate('''() => {
            veOnPrepare({stage:'peaks',path:VE.path,geracao:VE._projetoGeracao - 1,peaks:[123]});
            veOnMidia({id:0,stage:'info',path:VE.path,geracao:VE._projetoGeracao - 1,duration:999});
        }''')
        self.assertNotEqual(self.pg.evaluate('VE.srcDur'), 999)
        self.pg.evaluate('VE._salvandoProjeto = 1')
        self.assertFalse(self.pg.evaluate('id => veApAtivar(id)', segundo))
        self.pg.evaluate('VE._salvandoProjeto = 0')
        self.pg.screenshot(path=str(PASTA / 'abas.png'))
        abas_timeline = self.pg.evaluate('''() => {
            veCreateTimeline({name:'Outra timeline'});
            VE.media.push({id:VE.media.length,kind:'cor',name:'Removida',fill:'#000000',removido:true});
            const mid = VE.media.length;
            VE.media.push({id:mid,kind:'cor',name:'Camada teste',fill:'#00ff00'});
            vePushHistory();
            VE.clips.push({m:mid,tr:0,st:0,s:0,e:1});
            vePushHistory();
            VE.clips[0].st = .1;
            return VE.openSequences.slice();
        }''')
        self.assertTrue(self.pg.evaluate('id => veApAtivar(id)', segundo))
        self.pronto()
        self.assertTrue(self.pg.evaluate('id => veApAtivar(id)', primeiro['id']))
        self.pronto()
        self.assertEqual(self.pg.evaluate('VE.openSequences'), abas_timeline)
        self.pg.evaluate('veUndo()')
        self.assertEqual(self.pg.evaluate('VE.clips[0].st'), 0)
        self.assertEqual(self.pg.evaluate('veMediaOf(VE.clips[0]).name'), 'Camada teste')
        self.assertTrue(self.pg.evaluate("VE.media.find(m => m.name === 'Removida').removido"))
        self.pg.evaluate('''() => { appConfirm = async () => 'salvar'; }''')
        self.pg.evaluate('id => veApFechar(id)', primeiro['id'])
        self.pronto()
        self.assertEqual(self.pg.evaluate('VEAP.ativa'), segundo)
        self.assertEqual(self.pg.evaluate('VEAP.abas.length'), 1)
        self.pg.evaluate('() => { appConfirm = _confirmarAbasOriginal; }')
        self.assertTrue(self.pg.evaluate('veNovoProjeto()'))
        self.assertEqual(self.pg.evaluate('[VE.ready,VE.path,VE.clips.length,VEAP.abas.length]'), [True, None, 0, 2])
        self.assertTrue(self.pg.evaluate('id => veApAtivar(id)', segundo))
        self.pronto()
        self.assertEqual(self.pg.evaluate('VE.clips[0].st'), .5)
        self.pg.evaluate('caminho => veAbrirArquivoEscolhido(caminho, false, false)', str(PASTA / 'inexistente.mp4'))
        self.pg.wait_for_function('!VE.ready && !VE._pendingProject && VEAP.ativa === null', timeout=15000)
        self.assertTrue(self.pg.evaluate('id => veApAtivar(id)', segundo))
        self.pronto()
        self.assertEqual(self.pg.evaluate('VE.clips[0].st'), .5)
        self.assertEqual(self.erros, [])


class BloqueiosSaidaTest(unittest.TestCase):
    def test_saida_e_fechamento_durante_preparacao(self):
        from playwright.sync_api import sync_playwright
        os.environ['PLAYWRIGHT_BROWSERS_PATH'] = 'D:/Kanivete/Testes/playwright'
        with sync_playwright() as pw, pw.chromium.launch(headless=True) as browser:
            pagina = browser.new_page()
            pagina.add_script_tag(content='''
                const VE = {ready:true}, VEAP = {fechando:false}, VEFILA = {preparando:1};
                let _saindo = false;
                const _menuInfo = () => ({}), _abaRodando = () => false, veT = t => t, veToast = () => {};
                const veCloseProject = () => { throw Error('Fechou durante a preparação'); };
                window.pywebview = {api:{sair_app:() => { throw Error('Saiu durante o salvamento'); }}};
            ''')
            for arquivo, nome in [('editor-abas-projeto.js', 'veApBloqueado'), ('app.js', 'fecharAba'), ('app.js', 'appSair')]:
                texto = (RAIZ / 'frontend/js' / arquivo).read_text(encoding='utf-8')
                funcao = re.search(r'(?ms)^(?:async )?function ' + nome + r'\([^\n]*\) \{.*?^\}', texto)
                self.assertIsNotNone(funcao)
                pagina.add_script_tag(content=funcao.group())
            pagina.evaluate("fecharAba('video-cutter', null, true)")
            pagina.evaluate('VE._salvandoProjeto = 1')
            pagina.evaluate('appSair()')
            self.assertFalse(pagina.evaluate('_saindo'))


class SuspensaoTest(unittest.TestCase):
    def test_cancela_preparacoes_e_ignora_retorno_tardio(self):
        arvore = ast.parse((RAIZ / 'main.py').read_text(encoding='utf-8-sig'))
        nomes = {'ve_projeto_suspender', 've_preparar_midia', 'video_cutter_prepare'}
        modulo = ast.Module(body=[no for no in arvore.body if isinstance(no, ast.FunctionDef) and no.name in nomes], type_ignores=[])
        eventos, tarefas = [], []
        class Thread:
            def __init__(self, target, daemon):
                tarefas.append(target)
            def start(self):
                pass
        motor = SimpleNamespace(Event=threading.Event, Thread=Thread)
        contexto = {'threading': motor, '_ve_prepare_stop': None, '_ve_midias_stop': set(), '_ve_projeto_geracao': 0,
            '_ve_midias_trava': threading.Lock(), '_ve_emit': lambda nome, evento: eventos.append((nome, evento))}
        exec(compile(modulo, 'main.py', 'exec'), contexto)
        def preparar(caminho, emitir, stop=None, stop_event=None, **opcoes):
            stop = stop or stop_event
            if not stop.is_set():
                emitir({'stage': 'info'})
            else:
                emitir({'stage': 'video'})
                raise RuntimeError('Cancelado')
        with patch('Functions.video_cutter.preparar', preparar), patch('Functions.video_cutter.preparar_midia', preparar):
            contexto['video_cutter_prepare']('primeiro.mp4')
            contexto['ve_preparar_midia']('segundo.mp4', 1)
            contexto['ve_projeto_suspender']()
            self.assertTrue(contexto['_ve_prepare_stop'].is_set())
            self.assertTrue(all(stop.is_set() for stop in contexto['_ve_midias_stop']))
            for tarefa in tarefas:
                tarefa()
        self.assertEqual(eventos, [])
        self.assertFalse(contexto['_ve_midias_stop'])


if __name__ == '__main__':
    unittest.main()
