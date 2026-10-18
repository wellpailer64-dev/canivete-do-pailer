"""Pincel Roto (editor-roto.js + Functions/pincel_roto.py) no app de verdade: vídeo de entrevista na V1, texto animado
na V2 e o MESMO vídeo recortado na V3 (o texto passa ATRÁS da pessoa). Traços pela API (quadro-base 0: cabeça e corpo
somam, microfone tira) e uma correção com o MOUSE na tela do Pincel Roto (mão no quadro 180). Confere: tudo
recortado, print da tela, exportação na CPU e na placa (vídeo transparente), texto escondido atrás da pessoa e visível fora
dela, prévia × arquivo.

    py -3.13 testes/teste_roto.py [--video trecho.mp4] [--dur 15] [--porta 9336] [--sem-abrir] [--sem-placa]

Precisa do modelo (baixado no 1º uso, 182 MB) e de um trecho com uma pessoa: o padrão é D:/kanivete_testes/roto/trecho.mp4
(entrevista 1920×1080; os pontos dos traços são para ele).
"""
import argparse
import base64
import io
import os
import subprocess
import sys
import time
import urllib.request

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from Functions.midia import ffmpeg  # noqa: E402

BASE = "D:/kanivete_testes/roto/"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def quadro(arq, t, w=960, h=540):
    r = subprocess.run([ffmpeg(), "-v", "error", "-ss", f"{t:.3f}", "-i", arq, "-frames:v", "1", "-vf", f"scale={w}:{h}",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(h, w, 3).astype(np.float32)


MONTAR = """([dur, w, h]) => {
    veStop();
    const base = VE.clips.find(c => !veIsAudio(c)), tm = veTxMidia();
    vePushHistory();
    VE.clips = VE.clips.filter(c => c === base || veIsAudio(c));
    base.e = Math.min(base.e, base.s + dur);
    VE.clips.filter(veIsAudio).forEach(a => { a.e = Math.min(a.e, a.s + dur); });
    // texto atrás da pessoa: entra subindo e aparecendo (0,4 → 1,2 s)
    const tx = { tr: 1, st: 0, s: 0, e: dur, m: tm.id, tx: { ...VE_TX_PADRAO, t: 'KANIVETE', tam: 300, alin: 'center', cor: '#ffffff' },
                 p: { sc: 100, x: VE.seqW / 2, y: VE.seqH * 0.26, rot: 0, op: 100 },
                 k: { op: [{ t: 0.4, v: 0 }, { t: 1.2, v: 100 }], y: [{ t: 0.4, v: VE.seqH * 0.34, i: 'ease' }, { t: 1.2, v: VE.seqH * 0.26 }] } };
    const pes = JSON.parse(JSON.stringify(base)); delete pes.uid; delete pes.fx; pes.tr = 2;
    VE.clips.push(tx, pes);
    veEnsureTrackIndex(2); veRelayout(); VE.sel = VE.clips.indexOf(pes); veSeek(0); veRefresh();
    return VE.clips.indexOf(pes);
}"""

EXPORTAR = """async ([dest, nome, placa]) => {
    window.__rtFim = null;
    if (!window.__rtHook) {
        const orig = window.veOnExport;
        window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} } if (e && e.done) window.__rtFim = e; if (e && !e.done && /^Processador/.test(e.message || '')) window.__rtCpu = e.message; try { orig(ev); } catch (x) {} };
        window.__rtHook = true;
    }
    window.__rtCpu = '';
    VE._txPng = null;
    if (VE.clips.some(veTxPrecisa)) await veTxPngs();
    const plano = veExportPlan(true), lim = veMasterLim();
    const ro = plano.camadas.find(c => /recorte_/.test(c.path || ''));
    window.pywebview.api.video_cutter_export(VE.path, plano.base, 'mp4', 'medium', 'original', placa, dest, false,
        plano.camadas, plano.audio, plano.dur, lim ? [...plano.mix, { master: lim }] : plano.mix, veTxExport(plano.faixa),
        [VE.seqW, VE.seqH], { nome });
    return { recorte: ro ? ro.path : '', camadas: plano.camadas.length };
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=BASE + "trecho.mp4")
    ap.add_argument("--dur", type=float, default=7.0)
    ap.add_argument("--porta", type=int, default=9336)
    ap.add_argument("--sem-abrir", action="store_true")
    ap.add_argument("--sem-placa", action="store_true")
    a = ap.parse_args()
    vid = a.video.replace("\\", "/")
    if not os.path.isfile(vid):
        print("falta o vídeo de teste:", vid)
        return 2
    saida = BASE + "saida/"
    os.makedirs(saida, exist_ok=True)
    app = None
    if not a.sem_abrir:
        env = dict(os.environ, APPDATA=BASE + "appdata", TEMP=BASE + "tmp", TMP=BASE + "tmp", LOCALAPPDATA=BASE + "localappdata")
        for k in ("appdata", "tmp", "localappdata"):
            os.makedirs(BASE + k, exist_ok=True)
        app = subprocess.Popen([sys.executable, os.path.join(RAIZ, "main.py"), f"--agente={a.porta}"], cwd=RAIZ, env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    from playwright.sync_api import sync_playwright
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{a.porta}/json", timeout=1)
                break
            except Exception:
                time.sleep(1)
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
            pg = None
            for _ in range(60):
                pg = next((x for c in b.contexts for x in c.pages if "index.html" in x.url and x.evaluate("typeof VE") == "object"), None)
                if pg:
                    break
                time.sleep(1)
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.ve_roto_abrir) && window.VEROTO_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            if pg.evaluate("VE.ready ? (VE.path || '').replace(/\\\\/g, '/') : ''") != vid:
                pg.evaluate("p => veOpenPath(p)", vid)
                pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            pg.evaluate("window.vePrSegEm = () => null; window.vePrAutoTick = () => {}; window.veCacheGet = () => null;")
            ci = pg.evaluate(MONTAR, [a.dur, 1920, 1080])
            # 1) abre a tela (cria o efeito) e pinta o quadro-base 0 pela API
            pg.evaluate("i => VEROTO_API.abrir(VE.clips[i])", ci)
            pg.wait_for_function("(() => { const s = VEROTO_API.estado(); return s && !s.rodando && s.n > 0; })()", timeout=600000)
            jan = pg.evaluate("(() => { const r = document.querySelector('.vero-jan').getBoundingClientRect(); return [r.width / innerWidth, r.height / innerHeight, getComputedStyle(VERO.tela.el).backdropFilter]; })()")
            ok(jan[0] < 0.95 and jan[1] < 0.95 and "blur" in jan[2], "tela do Roto em janela por cima do editor desfocado", str(jan))
            pg.evaluate("VEROTO_API.seguir(false)")   # Freeze: pintar só faz o quadro-base
            t0 = time.time()
            pg.evaluate("""() => {
                const c = VE.clips[VE.sel];
                VEROTO_API.tracar(c, 0, [[0.4375, 0.2], [0.4375, 0.5], [0.4375, 0.85]], true);
                VEROTO_API.tracar(c, 0, [[0.64, 0.83]], false);
            }""")
            time.sleep(1)
            pg.evaluate("VEROTO_API.esperar()")
            time.sleep(1)
            e = pg.evaluate("VEROTO_API.estado()")
            ok(e["prontos"] <= 2 and 0 in e["pend"], "sem Freeze: só o quadro-base", f"{e['prontos']} prontos, pendentes {e['pend']}, {time.time() - t0:.1f} s")
            fz = pg.evaluate("(() => { const r = VERO.tela.freeze.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, VERO.tela.freeze.classList.contains('vero-pend')]; })()")
            ok(fz[2], "botão Freeze aceso com quadro-base pendente")
            t0 = time.time()
            pg.mouse.click(fz[0], fz[1])
            time.sleep(1.5)
            pg.wait_for_function("(() => { const s = VEROTO_API.estado(); return s && (!!s.erro || (!s.rodando && s.prontos === s.n)); })()", timeout=3600000, polling=1000)
            e = pg.evaluate("VEROTO_API.estado()")
            seg = time.time() - t0
            ok(e["prontos"] == e["n"] and not e["erro"], "propagou o quadro-base 0 em todos os quadros", f"{e['prontos']}/{e['n']} em {seg:.0f} s = {seg / e['n']:.2f} s/quadro")
            # 2) correção com o mouse: a mão esquerda no quadro 180 (se o trecho chegar lá)
            if e["n"] > 190:
                pg.evaluate("""() => { const c = VE.clips[VE.sel], st = Object.values(VERO.st)[0];
                    veSeek(c.st + (st.a + 180.5 / st.fps - c.s)); }""")
                time.sleep(1.5)
                bx = pg.evaluate("(() => { const r = VERO.tela.cv.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
                X = lambda u: bx[0] + u * bx[2]
                Y = lambda v: bx[1] + v * bx[3]
                pg.mouse.move(X(0.22), Y(0.80))
                pg.mouse.down()
                for k in range(1, 9):
                    pg.mouse.move(X(0.22 + k * 0.0075), Y(0.80 + k * 0.01875), steps=2)
                pg.mouse.up()
                time.sleep(0.5)
                bases = pg.evaluate("VEROTO_API.estado().bases")
                ok(180 in bases, "traço com o mouse virou quadro-base", str(bases))
                time.sleep(1)
                pg.keyboard.press("f")   # F = Freeze
                time.sleep(1)
                pg.evaluate("VEROTO_API.esperar()")   # consulta o Python direto (o vigia da tela pode estar 1 passo atrás)
                time.sleep(1)
                e = pg.evaluate("VEROTO_API.estado()")
                ok(not e["pend"] and e["prontos"] == e["n"], "F seguiu a correção", f"pendentes {e['pend']}")
            # ✨ Selecionar assunto num quadro do meio
            meio = pg.evaluate("VEROTO_API.estado().n") // 2
            pg.evaluate("""m => { const c = VE.clips[VE.sel], st = Object.values(VERO.st)[0];
                veSeek(c.st + (st.a + (m + 0.5) / st.fps - c.s)); }""", meio)
            time.sleep(1)
            t0 = time.time()
            pg.evaluate("VEROTO_API.assunto()")
            time.sleep(1)
            pg.evaluate("VEROTO_API.esperar()")
            time.sleep(1)
            e = pg.evaluate("VEROTO_API.estado()")
            ok(meio in e["bases"] and not e["erro"], "Selecionar assunto virou quadro-base", f"{time.time() - t0:.1f} s {e['erro']}")
            pg.evaluate("VEROTO_API.freeze()")
            time.sleep(1)
            pg.evaluate("VEROTO_API.esperar()")
            time.sleep(1)
            # Borda na própria tela: Nitidez (arrastar o controle), Descontaminar e Proteger rosto ligados por padrão
            bd = pg.evaluate("""(() => { const q = s => VERO.tela.el.querySelector(s), r = q('.vero-borda').getBoundingClientRect();
                return [r.height > 10, +q('[data-roparam=nitidez]').value, q('[data-roparam=descont]').checked, q('[data-roparam=rosto]').checked]; })()""")
            ok(bd == [True, 50, True, True], "controles de Borda na tela do Roto (nitidez 50, descontaminar, rosto)", str(bd))
            pg.evaluate("(() => { const i = VERO.tela.el.querySelector('[data-roparam=nitidez]'); i.value = 70; i.dispatchEvent(new Event('input')); })()")
            time.sleep(1.5)
            pg.evaluate("VEROTO_API.esperar()")
            time.sleep(1)
            nv = pg.evaluate("(() => { const f = veRotoFx(VE.clips[VE.sel]); return [f.v.nitidez, VERO.st[f.v.rd.rid].params && VERO.st[f.v.rd.rid].params.nitidez]; })()")
            pyp = pg.evaluate("r => window.pywebview.api.ve_roto_estado(r).then(e => e.params.nitidez)", pg.evaluate("Object.keys(VERO.st)[0]"))
            ok(nv[0] == 70 and pyp == 70, "Nitidez da tela chega ao efeito e ao Python", f"{nv} {pyp}")
            # 3) print da tela no quadro 180 (ou no meio) e volta para a timeline
            pg.screenshot(path=saida + "tela_roto.png")
            ok(os.path.getsize(saida + "tela_roto.png") > 10000, "print da tela do Pincel Roto", saida + "tela_roto.png")
            pg.keyboard.press("Escape")
            ok(pg.evaluate("VERO.tela.el.hidden"), "Esc volta à timeline")
            # 4) exportar (CPU e placa) e conferir: texto atrás da pessoa
            for placa in ([False] if a.sem_placa else [False, True]):
                nome = "roto_placa" if placa else "roto_cpu"
                dest = saida
                for f in os.listdir(dest):
                    if f.startswith(nome):
                        os.remove(dest + f)
                r = pg.evaluate(EXPORTAR, [dest, nome, placa])
                ok(bool(r["recorte"]), f"{nome}: clipe recortado entra como vídeo transparente", r["recorte"][-40:])
                pg.wait_for_function("window.__rtFim", timeout=1800000, polling=1000)
                fim = pg.evaluate("window.__rtFim")
                arq = (fim.get("output_path") or fim.get("path") or "") if isinstance(fim, dict) else ""
                if not arq:
                    arq = next((dest + f for f in os.listdir(dest) if f.startswith(nome) and f.endswith(".mp4")), "")
                ok(bool(arq) and os.path.isfile(arq), f"{nome}: exportou", arq)
                if placa:
                    ok(not pg.evaluate("window.__rtCpu"), f"{nome}: montado na placa", pg.evaluate("window.__rtCpu"))
                if not arq or not os.path.isfile(arq):
                    continue
                # quadro em 3 s: na faixa do texto, onde a pessoa está o quadro é o original; fora dela, texto branco
                T = 3.0
                exp, ori = quadro(arq, T), quadro(vid, T)
                i3 = pg.evaluate(f"VEROTO_API.quadro(null, {T})")
                rid = pg.evaluate("VERO.tela.rid")
                import glob
                pasta = glob.glob(BASE + f"localappdata/**/Roto/{rid}", recursive=True) or glob.glob(f"{BASE}**/Roto/{rid}", recursive=True)
                alfa = None
                if pasta:
                    from PIL import Image
                    alfa = np.asarray(Image.open(os.path.join(pasta[0], "a", f"a_{i3:05d}.png")).convert("L").resize((960, 540)), np.float32) / 255
                faixa = slice(int(540 * 0.16), int(540 * 0.36))
                dif = np.abs(exp - ori).mean(axis=2)[faixa]
                if alfa is not None:
                    pessoa = alfa[faixa] > 0.98
                    fora = alfa[faixa] < 0.02
                    branco = (exp[faixa].min(axis=2) > 225)
                    d_p = float(dif[pessoa].mean()) if pessoa.any() else -1
                    br_fora = float(branco[fora].mean()) if fora.any() else 0
                    br_pes = float(branco[pessoa].mean()) if pessoa.any() else 1
                    ok(d_p < 8, f"{nome}: pessoa por cima do texto (igual ao original)", f"dif {d_p:.1f}")
                    ok(br_fora > 0.04, f"{nome}: texto aparece fora da pessoa", f"{br_fora * 100:.1f}% branco")
                    ok(br_pes < 0.01, f"{nome}: texto escondido atrás da pessoa", f"{br_pes * 100:.2f}% branco")
                # prévia × arquivo
                url = pg.evaluate(f"""async () => {{ veSeek({T}); for (let k = 0; k < 40; k++) {{ await new Promise(r => setTimeout(r, 150)); veDrawMonitor(); }}
                    const cv = $ve('ve-canvas'), m = document.createElement('canvas'); m.width = 960; m.height = 540;
                    m.getContext('2d').drawImage(cv, 0, 0, 960, 540); return m.toDataURL('image/png'); }}""")
                from PIL import Image
                prev = np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB"), np.float32)
                dpv = float(np.abs(prev - exp).mean())
                ok(dpv < 10, f"{nome}: prévia × arquivo", f"dif média {dpv:.1f}")
                Image.fromarray(np.concatenate([prev, exp], 1).astype(np.uint8)).save(saida + f"{nome}_previa_arquivo.jpg")
    finally:
        if app:
            app.terminate()
    print("\n" + ("TUDO OK" if not erros else f"{len(erros)} FALHA(S): " + "; ".join(erros)))
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
