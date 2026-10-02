"""Confere a importação de um projeto do Premiere (Functions/premiere.py) contra o próprio XML do .prproj.

    python testes/teste_premiere.py "<projeto.prproj>"

Só lê o arquivo (nada é gravado nele). Para cada sequência: clipes convertidos + os que o relatório diz que
ficaram de fora = itens das trilhas no Premiere; duração da timeline = fim da sequência (MZ.OutPoint), quando o
Premiere guarda; quadros-chave dentro do trecho do clipe; mídia encontrada. Sai com 1 se algo não bater.
"""
import gzip
import os
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from Functions import premiere  # noqa: E402

TPS = premiere.TPS


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    dados, rel = premiere.converter(path)
    raiz = ET.fromstring(gzip.open(path).read())
    g = premiere._Grafo(raiz)
    falhas = []
    sem_clipe = sum(i['qtd'] for i in rel['ignorados'] if i['o_que'].startswith(('Gráfico', 'Clipe sem mídia')))
    total_pr = total_conv = 0
    for i, seq in enumerate(e for e in raiz if e.tag == 'Sequence'):
        nome = seq.findtext('Name')
        conv = next(s for s in dados['sequences'] if s['id'] == f'seq_pr_{i}')
        itens = 0
        for tg in seq.find('TrackGroups'):
            grupo = g.ref(tg.find('Second'))
            if grupo is None or grupo.tag not in ('VideoTrackGroup', 'AudioTrackGroup'):
                continue
            for tr in grupo.findall('TrackGroup/Tracks/Track'):
                itens += len(g.ref(tr).findall('.//ClipItems/TrackItems/TrackItem'))
        total_pr += itens
        total_conv += len(conv['clips'])
        fim_pr = seq.findtext('Node/Properties/MZ.OutPoint')
        dur = max((c['st'] + (c['e'] - c['s']) / c.get('v', 1) for c in conv['clips']), default=0)
        ok_dur = not fim_pr or int(fim_pr) <= 0 or abs(int(fim_pr) / TPS - dur) < 0.05
        print(f'  {"ok " if ok_dur else "ERRO"} {nome}: {len(conv["clips"])}/{itens} clipes, {dur:.2f}s'
              + ('' if not fim_pr or int(fim_pr) <= 0 else f' (Premiere {int(fim_pr) / TPS:.2f}s)'))
        if not ok_dur:
            falhas.append(f'duração de {nome}')
        for c in conv['clips']:
            for lst in (c.get('k') or {}).values():
                if any(q['t'] < c['s'] - 0.5 or q['t'] > c['e'] + 0.5 for q in lst):
                    falhas.append(f'quadro-chave fora do clipe em {nome} (st {c["st"]})')
                    break
    if total_conv + sem_clipe != total_pr:
        falhas.append(f'clipes: {total_conv} convertidos + {sem_clipe} de fora ≠ {total_pr} no Premiere')
    else:
        print(f'  ok  clipes: {total_conv} convertidos + {sem_clipe} de fora = {total_pr} no Premiere')
    if rel['faltando']:
        print(f'  aviso: {len(rel["faltando"])} mídia(s) não encontrada(s)')
    for i in rel['convertidos'] + rel['ignorados']:
        print(f'  · {i["o_que"]}: {i["qtd"]}')
    if falhas:
        print('\nREPROVOU:\n  ' + '\n  '.join(falhas[:20]))
        return 1
    print('\nPASSOU')
    return 0


if __name__ == '__main__':
    sys.exit(main())
