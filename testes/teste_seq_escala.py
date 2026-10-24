"""Configurações da sequência › "Adaptar o conteúdo ao novo tamanho": trocar o quadro (Full HD → 4K → Full HD, e de
proporção) não pode mudar nada no monitor. Compara quadros do monitor (reduzidos à mesma largura) antes × depois.
App de teste aberto (--agente=9333) com um projeto, ou --projeto caminho.vknv (abre uma CÓPIA, não salva).
py -3.13 testes/teste_seq_escala.py [--projeto x.vknv] [--quadros 10] [--porta 9333] [--folha saida.jpg] [--comps]"""
import base64, io, sys
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
a = sys.argv[1:]
arg = lambda k, d=None: a[a.index(k) + 1] if k in a else d
porta, nq, LARG = int(arg("--porta", 9333)), int(arg("--quadros", 10)), 480

CAPTURA = """async ([t, w]) => {
    window.veCacheGet = () => null; window.vePrSegEm = () => null; VEPP.cache.clear(); veSeek(t);
    const cv = $ve('ve-canvas'), m = document.createElement('canvas'); m.width = w; m.height = Math.round(w * VE.seqH / VE.seqW);
    let ant = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 120)); veDrawMonitor(); await new Promise(r => requestAnimationFrame(r));
        m.getContext('2d').drawImage(cv, 0, 0, m.width, m.height);
        const d = m.toDataURL('image/jpeg', 0.6);
        if (d === ant && i > 2) break; ant = d;
    }
    return m.toDataURL('image/png'); }"""

APLICAR = """async ([w, h]) => {
    veSeqConfigAbrir(); const md = $ve('ve-seqcfg');
    md.querySelector('#ve-sq-w').value = w; md.querySelector('#ve-sq-h').value = h; md.querySelector('#ve-sq-adaptar').checked = true;
    veSeqConfigAplicar(); await new Promise(r => setTimeout(r, 400)); return [VE.seqW, VE.seqH]; }"""


def quadros(pg, ts, larg=LARG):
    out = []
    for t in ts:
        u = pg.evaluate(CAPTURA, [t, larg])
        out.append(np.asarray(Image.open(io.BytesIO(base64.b64decode(u.split(",", 1)[1]))).convert("RGB")).astype(np.float32))
    return out


def recorte(im, w0, h0, w1, h1):
    """Quadro novo (outra proporção) → a área onde o quadro antigo cabe, centrada, na largura LARG."""
    f = min(w1 / w0, h1 / h0)
    H, W = im.shape[:2]
    cw, ch = w0 * f / w1 * W, h0 * f / h1 * H
    x, y = (W - cw) / 2, (H - ch) / 2
    p = Image.fromarray(im.astype(np.uint8)).crop((round(x), round(y), round(x + cw), round(y + ch)))
    return np.asarray(p.resize((LARG, round(LARG * h0 / w0)), Image.LANCZOS)).astype(np.float32)


def diferencas(A, B, ts, lim=4.0, sem_base=False):
    ruins = []
    for i, (t, x, y) in enumerate(zip(ts, A, B)):
        if sem_base:   # outra proporção: a legenda vai para a base do quadro novo (de propósito); compara o resto
            # e o quadro em pé fica pequeno no monitor (menos pixels): compara reduzido a 160 px. Vinheta/brilho da camada
            # de ajuste valem para o quadro novo inteiro (o miolo clareia um pouco): limite 20; fora do lugar dá 60+
            red = lambda im: np.asarray(Image.fromarray(im[: int(im.shape[0] * 0.72)].astype(np.uint8)).resize((160, 65), Image.LANCZOS)).astype(np.float32)
            x, y = red(x), red(y)
        if x.shape != y.shape:
            y = np.asarray(Image.fromarray(y.astype(np.uint8)).resize((x.shape[1], x.shape[0]), Image.LANCZOS)).astype(np.float32)
        d = float(np.abs(x - y).mean())
        if d > lim:
            ruins.append((i, f"{t:.1f}s={d:.1f}"))
    return ruins


with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}")
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    if arg("--projeto"):
        pg.evaluate("""async p => { VE.dirty = false; switchTool('video-cutter'); abrirProjetoExterno(p);
            for (let i = 0; i < 120 && !(VE.ready && VE.clips.length && VE.path !== undefined); i++) await new Promise(r => setTimeout(r, 500)); }""", arg("--projeto"))
        pg.wait_for_timeout(3000)
    if "--comps" in a:   # uma Comp por cena (veCompAgruparCenas): as Comps crescem junto com o quadro
        print("Comps:", pg.evaluate("async () => { const r = veCompAgruparCenas(); for (let i = 0; i < 120 && veCompPendentes().length; i++) await new Promise(r => setTimeout(r, 1000)); await new Promise(r => setTimeout(r, 3000)); return VE.media.filter(m => m && m.comp && !m.removido).length; }"))
    w0, h0, dur = pg.evaluate("[VE.seqW, VE.seqH, VE.dur]")
    ts = [round(dur * (i + 0.5) / nq, 2) for i in range(nq)]
    print(f"quadro {w0}×{h0}, {nq} quadros")
    A = quadros(pg, ts)
    ok = True
    for (w, h, nome) in [(w0 * 2, h0 * 2, "×2 (4K)"), (w0, h0, "volta ao original"), (round(w0 * 2 / 3 / 2) * 2, round(h0 * 2 / 3 / 2) * 2, "×2/3 (720p)"),
                         (w0, h0, "volta de novo"), (h0, w0, "proporção trocada (cabe inteiro, centrado)")]:
        r = pg.evaluate(APLICAR, [w, h])
        outra = abs(w / h - w0 / h0) > 1e-3
        larg = round(LARG * w / (w0 * min(w / w0, h / h0))) if outra else LARG
        prep = (lambda L: [recorte(x, w0, h0, w, h) for x in L]) if outra else (lambda L: L)
        B = prep(quadros(pg, ts, larg))
        ruins = diferencas(A, B, ts, 20.0 if outra else 4.0, outra)
        for _ in range(2):   # quadro da Comp/vídeo ainda carregando na captura: tira de novo só os que deram diferença
            if not ruins:
                break
            pg.wait_for_timeout(1500)
            for i, novo in zip([i for i, _ in ruins], prep(quadros(pg, [ts[i] for i, _ in ruins], larg))):
                B[i] = novo
            ruins = diferencas(A, B, ts, 20.0 if outra else 4.0, outra)
        print(f"  {'OK  ' if not ruins else 'RUIM'} {nome} → {r[0]}×{r[1]}" + (f": {', '.join(x for _, x in ruins)}" if ruins else ""))
        ok &= not ruins
    if arg("--folha"):
        Image.fromarray(np.concatenate([np.concatenate(A, 1), np.concatenate([x if x.shape == A[0].shape else A[0] * 0 for x in B], 1)], 0).astype(np.uint8)).save(arg("--folha"))
sys.exit(0 if ok else 1)
