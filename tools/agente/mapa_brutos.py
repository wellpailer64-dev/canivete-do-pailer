"""Índice persistente de brutos, folhas, falas e cenas anotadas pelo editor."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

EXTENSOES = {'.mp4', '.mov', '.mkv', '.avi', '.mxf', '.mts', '.m4v', '.webm'}
KANICODE = Path(__file__).resolve().parents[3] / 'KaniCode'


def gravar(caminho, dados):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fd, nome = tempfile.mkstemp(prefix='.mapa_', suffix='.tmp', dir=caminho.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
        os.replace(nome, caminho)
    finally:
        if os.path.exists(nome):
            os.unlink(nome)


def hash_arquivo(caminho):
    h = hashlib.sha256()
    with caminho.open('rb') as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b''):
            h.update(bloco)
    return h.hexdigest()


def carregar(indice, raiz):
    if not indice.exists():
        return {'versao': 1, 'raiz': str(raiz), 'arquivos': {}}
    dados = json.loads(indice.read_text(encoding='utf-8'))
    if dados.get('versao') != 1 or Path(dados['raiz']).resolve() != raiz:
        raise ValueError('Índice pertence a outra pasta ou versão.')
    return dados


def atualizar(raiz, destino, analisar):
    raiz, destino = raiz.resolve(), destino.resolve()
    if not raiz.is_dir() or raiz.drive.upper() != 'D:' or destino.drive.upper() != 'D:':
        raise ValueError('Informe pasta existente e destino no disco D.')
    if destino == raiz or raiz in destino.parents:
        raise ValueError('O destino do mapa deve ficar fora da pasta de brutos.')
    indice = destino / 'mapa.json'
    dados = carregar(indice, raiz)
    arquivos = dados['arquivos']
    vistos = set()
    resumo = {'novos': 0, 'alterados': 0, 'reutilizados': 0, 'ausentes': 0, 'erros': 0}
    for caminho in sorted(raiz.rglob('*')):
        if not caminho.is_file() or caminho.suffix.lower() not in EXTENSOES:
            continue
        rel = caminho.relative_to(raiz).as_posix()
        vistos.add(rel)
        anterior = arquivos.get(rel)
        try:
            antes = caminho.stat()
            assinatura = hash_arquivo(caminho)
            depois = caminho.stat()
            if (antes.st_size, antes.st_mtime_ns) != (depois.st_size, depois.st_mtime_ns):
                raise RuntimeError('Arquivo mudou durante a leitura.')
            if anterior and anterior.get('sha256') == assinatura and anterior.get('analise') and all(
                    Path(anterior['analise'].get(k, '')).is_file() for k in ('folha', 'leitura')):
                anterior['estado'] = 'disponivel'
                anterior.pop('erro', None)
                resumo['reutilizados'] += 1
                continue
            resultado = analisar(caminho, destino / 'analises')
            if not resultado.get('ok'):
                raise RuntimeError(resultado.get('mensagem', 'Análise falhou'))
            if hash_arquivo(caminho) != assinatura:
                raise RuntimeError('Arquivo mudou durante a análise.')
            alterado = bool(anterior and anterior.get('sha256') and anterior['sha256'] != assinatura)
            arquivos[rel] = {'arquivo': str(caminho), 'sha256': assinatura, 'estado': 'disponivel',
                             'analise': resultado, 'cenas': [] if alterado else (anterior or {}).get('cenas', []),
                             'anotacoes_anteriores': ((anterior or {}).get('anotacoes_anteriores', []) +
                                 ([{'sha256': anterior['sha256'], 'cenas': anterior.get('cenas', [])}] if alterado and anterior.get('cenas') else []))}
            resumo['alterados' if alterado else 'novos'] += 1
        except Exception as e:
            if anterior:
                anterior['estado'] = 'erro'
                anterior['erro'] = str(e)
            else:
                arquivos[rel] = {'arquivo': str(caminho), 'estado': 'erro', 'erro': str(e), 'cenas': []}
            resumo['erros'] += 1
        gravar(indice, dados)
    for rel, item in arquivos.items():
        if rel not in vistos:
            item['estado'] = 'ausente'
            resumo['ausentes'] += 1
    gravar(indice, dados)
    return resumo


def analisar_video(caminho, destino):
    sys.path.insert(0, str(KANICODE))
    import video_download
    return video_download.chamar({'acao': 'analisar', 'arquivo': str(caminho), 'destino': str(destino),
                                 'quantidade': 8, 'metodo': 'uniforme', 'transcricao': 'auto'})


def buscar(dados, termo):
    termo = termo.casefold()
    encontrados = []
    for rel, item in dados['arquivos'].items():
        if item.get('estado') != 'disponivel':
            continue
        base = {'arquivo': item['arquivo'], 'folha': item.get('analise', {}).get('folha')}
        if termo in rel.casefold():
            encontrados.append({**base, 'tipo': 'arquivo', 'texto': rel})
        for cena in item.get('cenas', []):
            if termo in cena['descricao'].casefold():
                encontrados.append({**base, 'tipo': 'cena', **cena})
        transcricao = item.get('analise', {}).get('transcricao', {}).get('arquivo')
        if transcricao and Path(transcricao).is_file():
            fala = json.loads(Path(transcricao).read_text(encoding='utf-8'))
            for trecho in fala.get('segmentos', []):
                if termo in trecho.get('texto', '').casefold():
                    encontrados.append({**base, 'tipo': 'fala', **trecho})
    return encontrados


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('acao', choices=['atualizar', 'buscar', 'anotar'])
    p.add_argument('--brutos', required=True, type=Path)
    p.add_argument('--destino', required=True, type=Path)
    p.add_argument('--termo')
    p.add_argument('--arquivo', help='Caminho relativo à pasta dos brutos')
    p.add_argument('--inicio', type=float)
    p.add_argument('--fim', type=float)
    p.add_argument('--descricao')
    a = p.parse_args()
    try:
        raiz, destino = a.brutos.resolve(), a.destino.resolve()
        if a.acao == 'atualizar':
            resultado = atualizar(raiz, destino, analisar_video)
        else:
            indice = destino / 'mapa.json'
            if not indice.is_file():
                raise ValueError('Mapa não encontrado; execute atualizar primeiro.')
            dados = carregar(indice, raiz)
            if a.acao == 'buscar':
                if not a.termo or not a.termo.strip():
                    raise ValueError('Informe --termo.')
                resultado = buscar(dados, a.termo.strip())
            else:
                import math
                item = dados['arquivos'].get(a.arquivo or '')
                if not item or item.get('estado') != 'disponivel':
                    raise ValueError('Arquivo não está disponível no mapa.')
                if (a.inicio is None or a.fim is None or not math.isfinite(a.inicio) or not math.isfinite(a.fim)
                        or a.inicio < 0 or a.fim <= a.inicio or a.fim > item['analise']['duracao'] or not a.descricao or not a.descricao.strip()):
                    raise ValueError('Informe início e fim válidos em segundos e descrição observada.')
                cena = {'inicio': a.inicio, 'fim': a.fim, 'descricao': a.descricao.strip()}
                if cena not in item['cenas']:
                    item['cenas'].append(cena)
                gravar(indice, dados)
                resultado = cena
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
        return 1 if isinstance(resultado, dict) and resultado.get('erros') else 0
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
