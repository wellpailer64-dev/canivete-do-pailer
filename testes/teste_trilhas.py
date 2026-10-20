"""Faixas da timeline (editor-trilhas.js): adicionar, excluir, excluir vazias e Ctrl+Z (app JÁ aberto em --agente=9333)."""
import argparse
import sys

from playwright.sync_api import sync_playwright


# Timeline nova com cores sólidas: V1 vermelho, V2 vazia, V3 verde, V4 azul, V5 amarelo (o mínimo é 4 faixas; nomes em c._tt para seguir cada clipe)
MONTAR = """() => {
    if (!VE.ready) veCriarProjetoVazio({ quieto: true });
    if (VE.playing) veStop();
    const seq = veCreateTimeline({ name: veSeqNomeDisponivel('Teste faixas') });
    if (!seq) return null;
    const cor = (fill, nome) => vePjAddMidia({ kind: 'cor', name: 'Cor sólida', fill, nome }, null).id;
    const mk = (tt, tr, st, dur, fill) => {
        const c = { tr, st, s: 0, e: dur, m: cor(fill, 'teste ' + tt), _tt: tt };
        c.p = veDefProps(c);
        return c;
    };
    VE.clips = [mk('vermelho', 0, 0, 4, '#ff0000'), mk('verde', 2, 1, 2, '#00ff00'), mk('azul', 3, 0, 2, '#0000ff'),
        mk('amarelo', 4, 2, 2, '#ffff00')];
    VE.history = []; VE.future = [];
    veEnsureTracks(veTrackCount());
    veRebuildTracks(veTrackCount());
    veBuildHeads();
    veRelayout();
    veSeqSalvarAtiva();
    veRefresh();
    return seq.id;
}"""

# Estado: nº de faixas, faixa de cada clipe e a pilha (de baixo para cima)
ESTADO = """() => {
    const cs = VE.clips.filter(c => c._tt);
    const tr = Object.fromEntries(cs.map(c => [c._tt, c.tr]));
    const pilha = cs.slice().sort((a, b) => a.tr - b.tr).map(c => c._tt);
    return { faixas: veTrackCount(), clipes: VE.clips.length, tr, pilha, hist: VE.history.length };
}"""

falhas = []


def verificar(condicao, mensagem):
    print(('ok ' if condicao else 'FALHOU ') + mensagem, flush=True)
    if not condicao:
        falhas.append(mensagem)
    return condicao


def pagina_principal(browser):
    for contexto in browser.contexts:
        for pagina in contexto.pages:
            if 'index.html' in pagina.url and pagina.evaluate("typeof VE === 'object'"):
                return pagina
    raise RuntimeError('página principal do editor não encontrada')


def mesma_pilha(antes, depois, rotulo):
    # a ordem relativa dos clipes que sobraram não pode mudar
    resto = [n for n in antes['pilha'] if n in depois['pilha']]
    verificar(depois['pilha'] == resto, f'{rotulo}: pilha {depois["pilha"]} (antes {antes["pilha"]})')


def desfazer(j, base, rotulo):
    j('veUndo()')
    d = j(ESTADO)
    verificar(d['faixas'] == base['faixas'], f'{rotulo} + Ctrl+Z: faixas {d["faixas"]} (esperado {base["faixas"]})')
    verificar(d['clipes'] == base['clipes'] and d['tr'] == base['tr'],
              f'{rotulo} + Ctrl+Z: clipes de volta {d["tr"]}')
    verificar(d['pilha'] == base['pilha'], f'{rotulo} + Ctrl+Z: pilha {d["pilha"]}')


def testar(pagina):
    j = pagina.evaluate
    seq = j(MONTAR)
    if not verificar(seq is not None, 'timeline nova montada'):
        return
    pagina.wait_for_timeout(500)
    base = j(ESTADO)
    print(f'  base: {base["faixas"]} faixas (mínimo {j("VE_MIN_TRACKS")}), {base["tr"]}', flush=True)
    verificar(base['tr'] == {'vermelho': 0, 'verde': 2, 'azul': 3, 'amarelo': 4}, 'clipes nas faixas V1, V3, V4 e V5 (V2 vazia)')
    verificar(base['faixas'] == 5, f'5 faixas na base ({base["faixas"]})')
    verificar(j("veTrkVazia('v', 1)") and not j("veTrkVazia('v', 0)"), 'V2 vazia, V1 ocupada')

    # 1) Adicionar faixa acima de V1: verde e azul sobem uma, vermelho fica
    j("veTrkAdicionar('v', 0)")
    d = j(ESTADO)
    verificar(d['faixas'] == base['faixas'] + 1, f'adicionar: faixas {base["faixas"]} -> {d["faixas"]}')
    verificar(d['tr'] == {'vermelho': 0, 'verde': 3, 'azul': 4, 'amarelo': 5}, f'adicionar: clipes acima subiram {d["tr"]}')
    verificar(j("veTrkVazia('v', 1)"), 'adicionar: a faixa nova (V2) está vazia')
    verificar(d['hist'] == base['hist'] + 1, 'adicionar: uma etapa de desfazer')
    mesma_pilha(base, d, 'adicionar')
    desfazer(j, base, 'adicionar')

    # 2) Excluir faixas vazias: só a V2 sai (V1 fica sempre)
    n = j("veTrkExcluirVazias(true)")
    d = j(ESTADO)
    verificar(n == 1, f'excluir vazias: {n} faixa excluída (esperado 1)')
    verificar(d['faixas'] == base['faixas'] - 1, f'excluir vazias: faixas {base["faixas"]} -> {d["faixas"]}')
    verificar(d['tr'] == {'vermelho': 0, 'verde': 1, 'azul': 2, 'amarelo': 3}, f'excluir vazias: clipes desceram {d["tr"]}')
    verificar(d['clipes'] == base['clipes'], 'excluir vazias: nenhum clipe apagado')
    verificar(d['hist'] == base['hist'] + 1, 'excluir vazias: uma etapa de desfazer')
    mesma_pilha(base, d, 'excluir vazias')
    verificar(j("veTrkExcluirVazias(true)") == 0, 'excluir vazias de novo: nada a excluir')
    desfazer(j, base, 'excluir vazias')

    # 3) Excluir a V3 (com o verde): o clipe sai, o azul desce
    j("veTrkExcluir('v', 2)")
    d = j(ESTADO)
    verificar(d['clipes'] == base['clipes'] - 1 and 'verde' not in d['tr'], 'excluir V3: o clipe verde saiu')
    verificar(d['faixas'] == base['faixas'] - 1, f'excluir V3: faixas {base["faixas"]} -> {d["faixas"]}')
    verificar(d['tr'] == {'vermelho': 0, 'azul': 2, 'amarelo': 3}, f'excluir V3: azul desceu {d["tr"]}')
    verificar(d['hist'] == base['hist'] + 1, 'excluir V3: uma etapa de desfazer')
    mesma_pilha(base, d, 'excluir V3')
    desfazer(j, base, 'excluir V3')

    # 4) Excluir a V2 vazia direto: nenhum clipe sai
    j("veTrkExcluir('v', 1)")
    d = j(ESTADO)
    verificar(d['clipes'] == base['clipes'] and d['tr'] == {'vermelho': 0, 'verde': 1, 'azul': 2, 'amarelo': 3},
              f'excluir V2 vazia: clipes {d["tr"]}')
    mesma_pilha(base, d, 'excluir V2')
    desfazer(j, base, 'excluir V2')

    # 5) Ctrl+Z pelo teclado (não só veUndo) depois de duas mudanças
    j("veTrkAdicionar('v', 3)")
    j("veTrkExcluirVazias(true)")
    pagina.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    pagina.keyboard.press('Control+z')
    pagina.wait_for_timeout(200)
    pagina.keyboard.press('Control+z')
    pagina.wait_for_timeout(200)
    d = j(ESTADO)
    verificar(d['faixas'] == base['faixas'] and d['tr'] == base['tr'],
              f'Ctrl+Z no teclado (2×): faixas {d["faixas"]}, clipes {d["tr"]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--porta', type=int, default=9333)
    args = parser.parse_args()
    if args.porta == 9222:
        parser.error('a 9222 é o app do usuário; use o app de teste')
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(f'http://127.0.0.1:{args.porta}')
        pagina = pagina_principal(browser)
        pagina.evaluate("document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
        pagina.wait_for_timeout(800)
        try:
            testar(pagina)
        except Exception as erro:
            verificar(False, f'erro: {erro}')
    print('\n' + ('PASSOU' if not falhas else f'REPROVOU ({len(falhas)} falhas)'), flush=True)
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
