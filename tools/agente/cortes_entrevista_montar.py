"""EXEMPLO (Alessandro/Minasparts, 2026-10-07; caminhos em D:/kanivete_testes/oficina) — copiar e ajustar CORTES/BROLL. Monta os 3 cortes no Editor do usuário (porta 9333) a partir de plano_final.json: timeline nova por corte, falas do
Alessandro com enquadramento 9:16 nele (aberto/fechado alternando), legenda na identidade da Oficina Produtiva, B-roll
da feira cortado nas batidas da música e a imagem de fechamento."""
import json
from playwright.sync_api import sync_playwright

D = "D:/kanivete_testes/oficina/"
PLANO = json.load(open(D + "plano_final.json", encoding="utf-8"))
BAT = json.load(open(D + "batidas.json", encoding="utf-8"))
BEAT = 60 / BAT["bpm"]                       # ~0,65 s
M_INI = 10.12                                # batida forte da música que cai no fim da fala
BROLL = [(4.0, 0), (3175.6, 0), (3185.6, 0), (3266.0, 0), (3280.0, 0)]   # (início na fonte, deslocamento x)
ESTILO = {"fonte": "SF Pro Display", "tam": 4.6, "cor": "#ffffff", "fundo": "sombra", "pos": "baixo", "maiusc": True, "negrito": True,
          "ita": False, "sOn": True, "sCor": "#0a141a", "sOp": 70, "sDist": 5, "sBlur": 10, "entrada": "pop", "px": 0, "py": 14,
          "caixaCor": "#000000", "caixaOp": 0, "caixaRaio": 0, "cCor": "#0a141a", "cLarg": 10,
          "dOn": True, "dCor": "#e88213", "dTxt": "#ffffff", "dOp": 100, "dRaio": 22, "dPad": 14}


def pos(c):
    k = c["sc"] / 100
    cx, cy = c["cx"] or 960, c["cy"] or 540
    px = max(1080 - 960 * k, min(960 * k, 540 - (cx - 960) * k))
    py = max(1920 - 540 * k, min(540 * k, 730 - (cy - 540) * k))
    return {"sc": c["sc"], "x": round(px, 1), "y": round(py, 1), "rot": 0, "op": 100}


JS = """async ({nome, clips, palavras, estilo, broll, fim, mus}) => {
    const r = {};
    await veAgente('Abrindo ' + nome, () => { const sq = (VE.sequences || []).find(s => s.name === nome); if (sq) { if (sq.id !== VE.activeSequence) veOpenTimeline(sq.id); } else veCreateTimeline({ name: nome }); });
    if (typeof vePushHistory === 'function') vePushHistory();   // Ctrl+Z volta a versão anterior do corte
    await veAgente(nome + ': pergunta do Luciano + falas do Alessandro, câmera em quem fala', () => {
        VE.clips = clips.map(c => ({ tr: 0, st: c.st, s: c.s, e: c.e, m: 19, p: c.p }));
        let t = fim;
        broll.forEach((b, i) => { const c = { tr: 0, st: t, s: b.s, e: b.s + b.d, m: 19, x: 'v', p: { sc: 177.78, x: 540 + b.dx, y: 960, rot: 0, op: 100 } };
            if (i === 0) c.tin = veTrObj('push'); if (i === 3) c.tin = veTrObj('chicote'); VE.clips.push(c); t += b.d; });
        const fech = { tr: 0, st: t, s: 0, e: mus.fech, m: 20, x: 'v', p: { sc: 100, x: 540, y: 960, rot: 0, op: 100 } };
        fech.tin = veTrObj('dissolve'); VE.clips.push(fech);
        const tf = t + mus.fech;
        VE.clips.push({ tr: 1, st: fim - mus.antes, s: mus.s, e: mus.s + (tf - (fim - mus.antes)), m: 21, x: 'a', g: -4, atin: { t: 'cp', d: mus.antes }, atout: { t: 'cp', d: 1.4 } });
        r.fim = tf;
    });
    await veAgente(nome + ': legendas na identidade da Oficina Produtiva', () => {
        VE.legEstilo = estilo;
        VETX.palavras = palavras;
        VE.legendas = veTxMontarLegendas({ max: 16, linhas: 2, minDur: 0.6, gap: 0 });
        r.legendas = VE.legendas.length;
    });
    veRelayout(); veRefresh();
    r.clips = VE.clips.length;
    return r;
}"""

with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
    pg = next(x for c in b.contexts for x in c.pages if x.evaluate("typeof VE === 'object' && !!window.pywebview"))
    for corte in PLANO["cortes"]:
        fim = corte["fala_fim"]
        broll = [{"s": s, "d": round(2 * BEAT, 3), "dx": dx} for s, dx in BROLL]
        clips = [{**{k: c[k] for k in ("st", "s", "e")}, "p": pos(c)} for c in corte["clips"]]
        mus = {"s": round(M_INI - 0.65, 3), "antes": 0.65, "fech": round(6 * BEAT, 3)}
        r = pg.evaluate(JS, {"nome": corte["nome"], "clips": clips, "palavras": corte["palavras"], "estilo": ESTILO, "broll": broll, "fim": fim, "mus": mus})
        print(corte["nome"], r)
