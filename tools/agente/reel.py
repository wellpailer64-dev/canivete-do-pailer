"""Entrada curta para montar e conferir reels com as ferramentas existentes.

    py -3.13 tools/agente/reel.py resumo projeto.vknv
    py -3.13 tools/agente/reel.py abrir projeto.vknv
    py -3.13 tools/agente/reel.py montar roteiro.json
    py -3.13 tools/agente/reel.py conferir projeto.vknv
    py -3.13 tools/agente/reel.py subir render.mp4 --pasta ID [--simular]

Abrir usa somente o app de teste (9333). Resumo lê o disco, sem abrir app.
Logs completos ficam em D:/Kanivete/Testes/reel; o código de saída é preservado.
"""
import argparse
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile

AQUI = Path(__file__).resolve().parent
LOGS = Path('D:/Kanivete/Testes/reel')
KANICODE = Path('D:/Kanivete/Plugins/kanicode')


def subir(arquivo, pasta, simular=False):
    origem = Path(arquivo).expanduser().resolve()
    if not origem.is_file() or origem.stat().st_size == 0:
        raise ValueError('Informe um arquivo existente e não vazio.')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,256}', pasta):
        raise ValueError('Informe o ID da pasta do Drive ou root, sem URL.')
    tamanho = origem.stat().st_size
    if simular:
        return {'estado': 'simulado', 'arquivo': str(origem), 'pasta': pasta,
                'bytes': tamanho, 'enviado': False}
    sys.path.insert(0, str(KANICODE))
    from google_drive import drive, FalhaDrive
    try:
        resultado = drive.enviar(str(origem), pasta)
    except FalhaDrive as erro:
        raise ValueError(str(erro)) from None
    if (not resultado.get('id') or resultado.get('name') != origem.name
            or str(resultado.get('size')) != str(tamanho)
            or (pasta != 'root' and pasta not in resultado.get('parents', []))):
        raise ValueError('Envio sem confirmação completa. Confira o destino antes de repetir.')
    return {'estado': 'enviado', 'id': resultado['id'], 'nome': resultado['name'],
            'bytes': tamanho, 'pasta': pasta,
            'link': 'https://drive.google.com/file/d/' + resultado['id'] + '/view'}


def resumo(arquivo):
    dados = json.loads(Path(arquivo).read_text(encoding='utf-8-sig'))
    sequencias = dados.get('sequences', [])
    return {'projeto': str(Path(arquivo).resolve()), 'origem': 'disco',
            'ativa': dados.get('activeSequence'), 'midias': len(dados.get('media', [])),
            'timelines': [{'id': s.get('id'), 'nome': s.get('name'),
                           'clipes': len(s.get('clips', [])),
                           'trilhas': sorted({str(c.get('tr')) for c in s.get('clips', [])})}
                          for s in sequencias if not s.get('comp')]}


def executar(ferramenta, argumentos):
    LOGS.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', prefix=ferramenta + '_',
                                     suffix='.log', dir=LOGS, delete=False) as log:
        processo = subprocess.run([sys.executable, str(AQUI / ferramenta), *argumentos],
                                  stdout=log, stderr=subprocess.STDOUT,
                                  env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    linhas = Path(log.name).read_text(encoding='utf-8', errors='replace').splitlines()
    print(json.dumps({'codigo': processo.returncode, 'log': log.name,
                      'linhas': len(linhas), 'final': linhas[-15:]}, ensure_ascii=False))
    return processo.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='acao', required=True)
    envio = sub.add_parser('subir', help='Cria um arquivo novo no Drive conectado ao KaniCode.')
    envio.add_argument('arquivo')
    envio.add_argument('--pasta', required=True, help='ID da pasta de destino ou root.')
    envio.add_argument('--simular', action='store_true', help='Valida os argumentos sem acessar o Drive.')
    for acao in ('resumo', 'abrir', 'montar', 'conferir'):
        comando = sub.add_parser(acao)
        comando.add_argument('arquivo')
        if acao == 'conferir':
            comando.add_argument('--timeline')
            comando.add_argument('--render')
            comando.add_argument('--ouvir', action='store_true')
    args = parser.parse_args()
    try:
        if args.acao == 'subir':
            print(json.dumps(subir(args.arquivo, args.pasta, args.simular), ensure_ascii=False))
            return 0
        if args.acao == 'resumo':
            print(json.dumps(resumo(args.arquivo), ensure_ascii=False))
            return 0
        if args.acao == 'abrir':
            return executar('abrir_teste.py', [str(Path(args.arquivo).resolve())])
        if args.acao == 'montar':
            return executar('reel_fala.py', [str(Path(args.arquivo).resolve())])
        parametros = [str(Path(args.arquivo).resolve())]
        if not args.ouvir:
            parametros.append('--sem-ouvir')
        for chave in ('timeline', 'render'):
            if getattr(args, chave):
                parametros.extend(['--' + chave, getattr(args, chave)])
        return executar('conferir_edicao.py', parametros)
    except (OSError, ValueError) as erro:
        print(json.dumps({'erro': str(erro)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
