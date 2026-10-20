"""Agrupar cenas em Comps preserva exportação, monitor e desfazer (app em --agente=9333)."""
import argparse
import base64
import io
import math
import sys
import time

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright


EXPORTACAO = r"""() => {
    // números arredondados também dentro das listas (quadros-chave das transições variam na 12ª casa)
    const arred = v => typeof v === 'number' ? +v.toFixed(3) : Array.isArray(v) ? v.map(arred)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, arred(x)])) : v;
    const key0 = o => JSON.stringify(Object.fromEntries(Object.entries(o)
        .map(([k, v]) => k === 'path' && /canivete_editor/.test(v || '') ? [k, 'T'] : [k, v])
        .map(([k, v]) => [k, arred(v)])));
    const numerar = l => {
        const n = {};
        return l.map(o => { const k = key0(o); n[k] = (n[k] || 0) + 1; return k + '#' + n[k]; });
    };
    const g = veExportPlan(false);
    veUndo();
    let o;
    try { o = veExportPlan(false); }
    finally { veRedo(); }
    const kg = numerar(g.camadas), ko = numerar(o.camadas);
    const pos = new Map(kg.map((k, i) => [k, i]));
    const sob = (a, b) => Math.min(a.st + (a.e - a.s) / (a.v || 1),
        b.st + (b.e - b.s) / (b.v || 1)) - Math.max(a.st, b.st) > 1e-3;
    let invertidos = 0, pares = 0;
    for (let i = 0; i < o.camadas.length; i++) {
        for (let j = i + 1; j < o.camadas.length; j++) {
            if (!sob(o.camadas[i], o.camadas[j])) continue;
            pares++;
            if (pos.get(ko[i]) > pos.get(ko[j])) invertidos++;
        }
    }
    const mix = x => JSON.stringify(x.mix.map(m => m.slice(0, 9)).sort());
    return {
        camadas: [o.camadas.length, g.camadas.length],
        faltando: ko.filter(k => !pos.has(k)).length,
        sobrando: kg.filter(k => !ko.includes(k)).length,
        pares, invertidos,
        baseIgual: JSON.stringify(g.base.filter(x => !x.gap)) ===
            JSON.stringify(o.base.filter(x => !x.gap)),
        mixIgual: mix(g) === mix(o)
    };
}"""

MONITOR = """async t => {
    const prAnt = window.vePrSegEm;
    window.vePrSegEm = () => null;
    try {
        VE.playhead = t;
        for (let k = 0; k < 20; k++) {
            await new Promise(r => setTimeout(r, 150));
            veCacheInvalidate();
            veDrawMonitor();
        }
        return $ve('ve-canvas').toDataURL('image/png');
    } finally { window.vePrSegEm = prAnt; }
}"""

ESTADO = """() => ({clipes: VE.clips.length, faixas: veTrackCount(), historico: VE.history.length})"""
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


def imagem(url):
    with Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))) as img:
        return img.convert('RGB')


def testar_timeline(pagina, prefixo, tempos):
    j = pagina.evaluate
    seq = j("""n => {
        const s = (VE.sequences || []).find(s => !s.comp && (s.name || '').startsWith(n));
        return s ? {id: s.id, nome: s.name} : null;
    }""", prefixo)
    if not verificar(seq is not None, f'{prefixo}: timeline encontrada pelo prefixo'):
        return
    nome = seq['nome']
    j('id => veOpenTimeline(id)', seq['id'])
    time.sleep(4)
    if not verificar(j('id => VE.activeSequence === id', seq['id']), f'{nome}: timeline aberta'):
        return
    j('() => { if (VE.playing) veStop(); }')
    antes = j(ESTADO)
    plano = j('() => { const p = veCompCenasPlano(); return {conflitos: p.conflitos, cenas: p.cenas.length}; }')
    sem_conflitos = verificar(plano['conflitos'] == 0, f"{nome}: conflitos = {plano['conflitos']}")
    tem_cenas = verificar(plano['cenas'] >= 2, f"{nome}: {plano['cenas']} cenas (mínimo 2)")
    if not (sem_conflitos and tem_cenas):
        return
    try:
        criadas = j("""() => {
            const plano = veCompCenasPlano();
            const feitas = veCompAgruparCenas({plano});
            return feitas ? feitas.length : null;
        }""")
        depois = j(ESTADO)
        verificar(criadas == plano['cenas'], f'{nome}: {criadas} Comps criadas para {plano["cenas"]} cenas')
        verificar(depois['faixas'] < antes['faixas'],
                  f'{nome}: faixas {antes["faixas"]} -> {depois["faixas"]}')
        if not verificar(depois['historico'] == antes['historico'] + 1,
                         f'{nome}: agrupamento em uma etapa de desfazer'):
            return

        exp = j(EXPORTACAO)
        verificar(exp['camadas'][0] == exp['camadas'][1] and exp['faltando'] == exp['sobrando'] == 0,
                  f'{nome}: camadas numeradas iguais ({exp["camadas"]}, '
                  f'faltando={exp["faltando"]}, sobrando={exp["sobrando"]})')
        verificar(exp['invertidos'] == 0,
                  f'{nome}: {exp["invertidos"]} pares invertidos entre {exp["pares"]} sobrepostos')
        verificar(exp['baseIgual'], f'{nome}: base da exportação igual')
        verificar(exp['mixIgual'], f'{nome}: mix da exportação igual')

        # aquece os DOIS estados (agrupado e, pelo Ctrl+Z, o original): imagens em resolução cheia e borrão de movimento
        # só ficam estáveis depois da primeira passada (sem isso o 1º quadro dá falso alarme)
        for tempo in tempos:
            pagina.evaluate(MONITOR, tempo)
        j('veUndo()')
        try:
            for tempo in tempos:
                pagina.evaluate(MONITOR, tempo)
        finally:
            j('veRedo()')
        for tempo in tempos:
            try:
                # 2 tentativas: o borrão de movimento do monitor às vezes sai uns pixels diferente numa volta do Ctrl+Z
                # (cache da prévia; a exportação é conferida acima e não tem isso)
                maxima = None
                for _ in range(2):
                    agrupado = imagem(j(MONITOR, tempo))
                    j('veUndo()')
                    try:
                        original = imagem(j(MONITOR, tempo))
                    finally:
                        j('veRedo()')
                    if agrupado.size != original.size:
                        break
                    m = max(limites[1] for limites in ImageChops.difference(agrupado, original).getextrema())
                    maxima = m if maxima is None else min(maxima, m)
                    if maxima <= 2:
                        break
                if not verificar(agrupado.size == original.size,
                                 f'{nome}: monitor em {tempo:g}s com dimensões iguais'):
                    continue
                verificar(maxima <= 2, f'{nome}: monitor em {tempo:g}s, diferença máxima = {maxima} (limite 2)')
            except Exception as exc:
                verificar(False, f'{nome}: monitor em {tempo:g}s: {exc}')
    finally:
        if j(ESTADO)['historico'] > antes['historico']:
            j('veUndo()')
        volta = j(ESTADO)
        verificar(volta['clipes'] == antes['clipes'],
                  f'{nome}: desfazer restaura {antes["clipes"]} clipes (atual {volta["clipes"]})')
        verificar(volta['faixas'] == antes['faixas'],
                  f'{nome}: desfazer restaura {antes["faixas"]} faixas (atual {volta["faixas"]})')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--porta', type=int, default=9333)
    parser.add_argument('--projeto', default=r'D:\kanivete_testes\comp_cenas\reels_bf_carlinhos.vknv')
    parser.add_argument('--timelines', default='Reel A,Reel B', help='prefixos separados por vírgula')
    parser.add_argument('--tempos', default='0.5,2.6,5,7.6,12.5,17.5,21', help='segundos separados por vírgula')
    args = parser.parse_args()
    timelines = [nome.strip() for nome in args.timelines.split(',') if nome.strip()]
    try:
        tempos = [float(t.strip()) for t in args.tempos.split(',')]
    except ValueError:
        parser.error('--tempos deve conter números separados por vírgula')
    if not timelines or not tempos or any(not math.isfinite(t) or t < 0 for t in tempos):
        parser.error('informe ao menos uma timeline e tempos finitos, não negativos')

    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(f'http://127.0.0.1:{args.porta}')
            pagina = pagina_principal(browser)
            pagina.evaluate('() => { location.reload(); }')
            time.sleep(8)
            pagina = pagina_principal(browser)
            verificar(True, 'página recarregada e obtida novamente')
            pagina.evaluate("p => { switchTool('video-cutter'); abrirProjetoExterno(p); }", args.projeto)
            pagina.wait_for_function("""p => VE.ready && !VE._pendingProject && VE.projectPath === p &&
                (VE.sequences || []).length > 0""", arg=args.projeto, timeout=90000)
            verificar(True, f'projeto aberto do zero: {args.projeto}')
            # Impede também as cópias automáticas durante as edições do teste.
            pagina.evaluate('() => { window.__testeCompAutosave = veAutosave; window.veAutosave = () => {}; }')
            try:
                for prefixo in timelines:
                    try:
                        testar_timeline(pagina, prefixo, tempos)
                    except Exception as exc:
                        verificar(False, f'{prefixo}: {exc}')
            finally:
                pagina.evaluate("""() => {
                    clearTimeout(VE._autoLogoT);
                    window.veAutosave = window.__testeCompAutosave;
                    delete window.__testeCompAutosave;
                }""")
    except Exception as exc:
        verificar(False, f'preparação ou conexão com o editor: {exc}')
    return 1 if falhas else 0


if __name__ == '__main__':
    sys.exit(main())
