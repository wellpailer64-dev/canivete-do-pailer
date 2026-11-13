"""Asset em HTML -> Comp NATIVA na timeline aberta do app (ao vivo), no lugar do .mov renderizado.

    py -3.13 tools/agente/comp_html.py cena.html --nome "LETTERING_BAIRRO (Comp)" --fonte PASTA [--alvo LETTERING_BAIRRO.mov] [--porta 9222] [--so-plano]

- cena.html: precisa de <meta name="kv" content="w=1920;h=1080;fps=30;dur=17"> e camadas marcadas com data-kv
  (texto|caixa|img). Guia: Instructions/agente/motion-html.md.
- --fonte: pasta do asset (ex.: _IDENTIDADE/pecas/LETTERING_BAIRRO_fonte). Recebe plano.json, assets/ (PNGs das camadas
  que viram imagem) e a cópia do HTML: é o projeto editável que fica junto do render.
- O que faz no app (porta 9222 = app do Pailer): monta as camadas numa timeline provisória (montador do motion_html),
  transforma tudo numa Comp (veCompDeClipes), volta para a timeline que estava aberta, põe a Comp na trilha livre logo
  acima do --alvo, no mesmo tempo, e DESATIVA o alvo (fica embaixo para comparar; Ctrl+Shift+E reativa). Apaga a
  timeline provisória. NÃO salva: quem salva é o Pailer. Duplo clique na faixa abre a Comp.
- Sem --alvo: a Comp entra na posição da agulha, na primeira trilha livre.
"""
import argparse, json, os, shutil, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MONTADOR = os.path.join(RAIZ, "tools", "motion_html", "montador.js")
KANIVETE = "D:/Kanivete/Plugins/kanicode/plugins/kanivete/kanivete.py"

POS = r"""
const NOME = %(nome)s, ALVO = %(alvo)s, MAE = window.__kvMae;
const comp = VE.clips.slice();
const m = veCompDeClipes(comp, NOME, { quieto: true, semHistorico: true });
if (!m) return { erro: 'Comp não criada', montagem: R };
const prov = VE.activeSequence;
veSeqAplicar(VE.sequences.find(s => s.id === MAE), { silent: true });
veDeleteTimeline(prov);
const nm = x => (VE.media.find(q => q && q.id === x.m) || {}).name || '';
const alvo = ALVO ? VE.clips.find(c => nm(c) === ALVO && !c.off) : null;
if (ALVO && !alvo) return { erro: 'alvo não achado na timeline aberta: ' + ALVO, comp: m.id };
vePushHistory();
const st = alvo ? alvo.st : VE.playhead, dur = alvo ? Math.min(m.info.duration, alvo.e - alvo.s) : m.info.duration;
const novo = { tr: alvo ? alvo.tr + 1 : 0, st, s: 0, e: +dur.toFixed(6), m: m.id, cor: VE_COMP_COR };
while (veTrkLocked(novo.tr) || !veTrackFree(novo.tr, st, st + dur, novo)) novo.tr++;
veEnsureTrackIndex(novo.tr, { refresh: true });
VE.clips.push(novo);
if (alvo) alvo.off = true;
veCacheInvalidate(); if (typeof vePrInvalidar === 'function') vePrInvalidar();
veRelayout(); veSelDefinir([novo], novo); veSeqSalvarAtiva(); veAfterEdit(VE.playhead); veRefresh();
veToast(`Comp ${NOME} na timeline · duplo clique para abrir`);
return { comp: m.id, seqComp: m.sequenceId, clipe: { tr: novo.tr, st: novo.st, dur: novo.e }, alvo_desativado: !!alvo, camadas: R.clips, erros: R.erros };
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html"); ap.add_argument("--nome", required=True); ap.add_argument("--fonte", required=True)
    ap.add_argument("--alvo", default=""); ap.add_argument("--porta", type=int, default=9222)
    ap.add_argument("--so-plano", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.fonte, exist_ok=True)
    html = os.path.abspath(a.html)
    copia = os.path.join(a.fonte, os.path.basename(html))
    if os.path.normcase(copia) != os.path.normcase(html):
        shutil.copy2(html, copia)
    r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "motion_html.py"), copia, "--so-plano", "--saida", a.fonte],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(r.stdout.strip()[-400:])
    if r.returncode:
        sys.exit("motion_html falhou:\n" + r.stderr[-1500:])
    plano = json.load(open(os.path.join(a.fonte, "plano.json"), encoding="utf-8"))
    plano["nome"] = "_prov_" + a.nome; plano["salvar"] = None
    if a.so_plano:
        print(json.dumps([(c["id"], c["tipo"]) for c in plano["clips"]], ensure_ascii=False)); return
    mont = open(MONTADOR, encoding="utf-8").read()
    js = ("async () => { window.__plano = %s; window.__kvMae = VE.activeSequence; veSnapshot && veSnapshot();\n"
          "const R = await (async () => {\n%s\n})();\n%s }") % (
        json.dumps(plano, ensure_ascii=False), mont,
        POS % {"nome": json.dumps(a.nome, ensure_ascii=False), "alvo": json.dumps(a.alvo or None, ensure_ascii=False)})
    sys.path.insert(0, os.path.dirname(KANIVETE))
    import kanivete
    res = kanivete.js(js, a.porta)
    print(json.dumps(res, ensure_ascii=False))
    if not res or res.get("erro"):
        sys.exit(1)


if __name__ == "__main__":
    main()
