"""Timeline como a do Premiere (2026-10-11): ferramentas no topo da coluna das trilhas, alvo de trilha (Track Targeting),
Caneta na linha de volume/opacidade e o menu de efeitos do Mixer em categorias. Com mouse de verdade no app:
- alvo: clicar no rótulo V2 tira o alvo; Shift+clique liga todas; Ctrl+K corta só as trilhas-alvo; Ctrl+Shift+K todas;
  ↓ pula só pelos cortes das trilhas-alvo; Alt+D seleciona o clipe na agulha das trilhas-alvo;
- Caneta (P): dois cliques na linha de volume do A1 (0 dB e −20 dB) → exportação com o som caindo 20 dB (ffmpeg) e
  a prévia com o mesmo envelope; clique na linha de opacidade do V1 cria ◆ de opacidade;
- Mixer: o menu do espaço vazio abre com "Nenhum" e as categorias do Premiere; passar o mouse abre o submenu.
    py -3.13 testes/teste_timeline_pr.py [--porta 9337] [--sem-abrir]
"""
import argparse
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

BASE = "D:/kanivete_testes/timeline_pr/"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def rms_db(arq, t, d=0.2):
    r = subprocess.run([ffmpeg(), "-v", "error", "-ss", f"{t:.3f}", "-t", f"{d:.3f}", "-i", arq, "-vn", "-f", "f32le", "-ac", "1", "-ar", "48000", "-"],
                       capture_output=True)
    x = np.frombuffer(r.stdout, np.float32)
    return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9) if len(x) else -999


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=9337)
    ap.add_argument("--sem-abrir", action="store_true")
    a = ap.parse_args()
    vid = BASE + "base.mp4"
    os.makedirs(BASE + "saida", exist_ok=True)
    if not os.path.isfile(vid):
        subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x334455:s=1280x720:r=30:d=6", "-f", "lavfi",
                        "-i", "sine=f=440:d=6:sample_rate=48000", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                        "-shortest", vid], check=True)
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
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.video_cutter_prepare) && window.VECN_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            if pg.evaluate("VE.ready ? (VE.path || '').replace(/\\\\/g, '/') : ''") != vid:
                pg.evaluate("p => veOpenPath(p)", vid)
                pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            # V1+A1: o vídeo; V2: uma cópia só da imagem (0–6 s)
            pg.evaluate("""() => {
                veStop(); window.veCacheGet = () => null; window.vePrSegEm = () => null;
                const base = VE.clips.find(c => !veIsAudio(c));
                VE.clips = VE.clips.filter(c => c === base || veIsAudio(c));
                [...VE_TRK.v, ...VE_TRK.a].forEach(t => { if (t) delete t.semAlvo; });
                const c2 = JSON.parse(JSON.stringify(base)); delete c2.uid; delete c2.lk; c2.tr = 1; c2.x = 'v';
                VE.clips.push(c2); veEnsureTrackIndex(1); veRelayout(); VE.sel = -1; veSeek(0); veRefresh(); veBuildHeads();
            }""")
            time.sleep(0.5)
            pg.screenshot(path=BASE + "saida/cabecalho.png", clip=pg.evaluate("(() => { const r = document.querySelector('.ve-tl-heads').getBoundingClientRect(); return {x: r.left, y: r.top, width: 260, height: Math.min(360, r.height)}; })()"))
            ok(pg.evaluate("!!document.querySelector('.ve-head-ruler #ve-snap') && !!document.querySelector('.ve-head-ruler #ve-vinculo')"), "ímã e seleção vinculada no topo da coluna das trilhas")
            # alvo: clique no rótulo V2 tira o alvo
            pg.click('.ve-hb.ve-alvo[data-hkind="v"][data-hk="1"]')
            ok(pg.evaluate("!veTrkAlvo('v', 1) && veTrkAlvo('v', 0)"), "clicar no V2 tira o alvo dele")
            # Ctrl+K em 2 s: só a V1 (e o A1 junto) é cortada
            pg.evaluate("veSeek(2)"); pg.locator("#ve-tl-wrap").hover(); pg.keyboard.press("Control+k")
            n_v1 = pg.evaluate("VE.clips.filter(c => c.tr === 0 && !veIsAudio(c)).length")
            n_v2 = pg.evaluate("VE.clips.filter(c => c.tr === 1).length")
            ok(n_v1 == 2 and n_v2 == 1, "Ctrl+K corta só as trilhas-alvo", f"V1 {n_v1} pedaços, V2 {n_v2}")
            # os dois pedaços do corte são independentes: escala e efeito num não mudam o outro
            indep = pg.evaluate("""() => {
                const [e, d] = VE.clips.filter(c => c.tr === 0 && !veIsAudio(c)).sort((a, b) => a.st - b.st);
                const h0 = VE.history.length;
                VE.sel = VE.clips.indexOf(e); vePushHistory(); veApplyProps(e, { sc: 150 }); veFxAdd(VE.sel, 'blur');
                const r = { dEsc: veProps(d).sc, dFx: (d.fx || []).length, eEsc: veProps(e).sc, eFx: (e.fx || []).length };
                while (VE.history.length > h0) veUndo();
                VE.sel = -1; veRefresh(); return r;
            }""")
            ok(indep["eEsc"] == 150 and indep["eFx"] == 1 and indep["dEsc"] != 150 and indep["dFx"] == 0,
               "pedaços do corte são independentes (escala e efeito)", str(indep))
            # ↓ a partir de 0: vai para o corte da V1 (2 s), não para o fim da V2
            pg.evaluate("veSeek(0)"); pg.keyboard.press("ArrowDown")
            ok(abs(pg.evaluate("VE.playhead") - 2) < 0.05, "↓ pula para o corte das trilhas-alvo", f"agulha {pg.evaluate('VE.playhead'):.2f}")
            # Alt+D em 3 s: seleciona o clipe da V1 (alvo), não o da V2
            pg.evaluate("veSeek(3)"); pg.keyboard.press("Alt+d")
            sel = pg.evaluate("veSelLista().map(c => c.tr)")
            ok(len(sel) >= 1 and all(t == 0 for t in sel), "Alt+D seleciona o clipe na agulha das trilhas-alvo", str(sel))
            # Ctrl+Shift+K em 4 s: corta as duas
            pg.evaluate("veSeek(4)"); pg.keyboard.press("Control+Shift+k")
            ok(pg.evaluate("VE.clips.filter(c => c.tr === 1).length") == 2, "Ctrl+Shift+K corta todas as trilhas")
            # Shift+clique no V1: todas as de vídeo como alvo de novo
            pg.click('.ve-hb.ve-alvo[data-hkind="v"][data-hk="0"]', modifiers=["Shift"])
            v_todas = pg.evaluate("veTrkAlvo('v', 0) && veTrkAlvo('v', 1)")
            if not v_todas:   # o 1º Shift+clique alterna para "nenhuma"; o 2º liga todas
                pg.click('.ve-hb.ve-alvo[data-hkind="v"][data-hk="0"]', modifiers=["Shift"])
            ok(pg.evaluate("veTrkAlvo('v', 0) && veTrkAlvo('v', 1)"), "Shift+clique liga todas as trilhas de vídeo")
            # Caneta na linha de volume do A1: ponto em 4,6 s a 0 dB e em 5,4 s a −20 dB (o último pedaço: 4–6 s)
            pg.keyboard.press("Escape"); pg.keyboard.press("p")   # com clipe selecionado, P abre a Posição (atalho do After)
            ok(pg.evaluate("VE.tool") == "caneta", "P liga a Caneta")
            pos = pg.evaluate("""([t, db, kind]) => {
                const r = $ve('ve-tl-wrap').getBoundingClientRect(), row = veTrackRows().find(x => x.id === (kind === 'a' ? 'A1' : 'V1'));
                const A = veCnArea(kind, row.y + 3, row.h - 6);
                return [r.left + (t - VE.view) * VE.pps, r.top + veCnY(kind, db, A)];
            }""", [4.6, 0, "a"])
            pg.mouse.click(pos[0], pos[1])
            pos = pg.evaluate("""([t, db, kind]) => {
                const r = $ve('ve-tl-wrap').getBoundingClientRect(), row = veTrackRows().find(x => x.id === 'A1');
                const A = veCnArea(kind, row.y + 3, row.h - 6);
                return [r.left + (t - VE.view) * VE.pps, r.top + veCnY(kind, db, A)];
            }""", [5.4, -20, "a"])
            pg.mouse.click(pos[0], pos[1])
            vol = pg.evaluate("(() => { const c = VE.clips.find(c => c.tr === 0 && !veIsAudio(c) && c.st > 3.9); return c && c.k && c.k.vol; })()")
            ok(bool(vol) and len(vol) == 2 and abs(vol[0]["v"]) < 1.5 and abs(vol[1]["v"] + 20) < 1.5, "Caneta: 2 pontos na linha de volume", str(vol))
            mix = pg.evaluate("veMixClipes().filter(x => x.length > 10).map(x => x[10])")
            ok(len(mix) == 1, "o mixer da prévia recebe o envelope de volume", str(mix)[:80])
            # Caneta na linha de opacidade do V1 (pedaço 2–4 s): ponto em 3 s a 50%
            pos = pg.evaluate("""() => {
                const r = $ve('ve-tl-wrap').getBoundingClientRect(), row = veTrackRows().find(x => x.id === 'V1');
                const A = veCnArea('v', row.y + 3, row.h - 6);
                return [r.left + (3 - VE.view) * VE.pps, r.top + veCnY('v', 50, A)];
            }""")
            pg.mouse.click(pos[0], pos[1])
            op = pg.evaluate("(() => { const c = VE.clips.find(c => c.tr === 0 && !veIsAudio(c) && c.st > 1.9 && c.st < 2.1); return c && c.k && c.k.op; })()")
            ok(bool(op) and abs(op[0]["v"] - 50) < 3, "Caneta: ponto na linha de opacidade", str(op))
            pg.screenshot(path=BASE + "saida/caneta.png")
            # exportar e medir o som: 4,3 s ≈ 0 dB do tom; 5,7 s ≈ −20 dB
            for f in os.listdir(BASE + "saida"):
                if f.startswith("vol") and f.endswith(".mp4"):
                    os.remove(BASE + "saida/" + f)
            pg.evaluate("""async (dest) => {
                window.__tpFim = null;
                const orig = window.veOnExport;
                window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} } if (e && e.done) window.__tpFim = e; try { orig(ev); } catch (x) {} };
                VE._txPng = null;
                const plano = veExportPlan(true), lim = veMasterLim();
                window.pywebview.api.video_cutter_export(VE.path, plano.base, 'mp4', 'medium', 'original', false, dest, false,
                    plano.camadas, plano.audio, plano.dur, lim ? [...plano.mix, { master: lim }] : plano.mix, veTxExport(plano.faixa),
                    [VE.seqW, VE.seqH], { nome: 'vol' });
            }""", BASE + "saida/")
            pg.wait_for_function("window.__tpFim", timeout=600000, polling=500)
            arq = next((BASE + "saida/" + f for f in os.listdir(BASE + "saida") if f.startswith("vol") and f.endswith(".mp4")), "")
            ok(bool(arq), "exportou", arq)
            if arq:
                d0, d1, dm = rms_db(arq, 4.3), rms_db(arq, 5.7), rms_db(arq, 5.0)
                ok(abs((d0 - d1) - 20) < 1.5, "exportação: o som cai 20 dB entre os pontos", f"{d0:.1f} → {d1:.1f} dB")
                ok(abs((d0 - dm) - 10) < 2, "exportação: metade do caminho no meio (linear em dB)", f"{d0 - dm:.1f} dB a menos")
            # Mixer: menu do espaço vazio
            pg.keyboard.press("v")
            pg.evaluate("vedShow('mixer'); veMixRackAberto(true); veMixUi()")
            time.sleep(0.6)
            slot = pg.locator(".ve-mix-slot").first
            if slot.count():
                slot.click()
                time.sleep(0.3)
                cats = pg.evaluate("[...document.querySelectorAll('.ve-mix-catit')].map(x => x.textContent.replace('›', '').trim())")
                ok(pg.evaluate("!!document.querySelector('.ve-mix-nenhum')") and len(cats) >= 6, "menu do Mixer: Nenhum + categorias", ", ".join(cats))
                pg.hover(".ve-mix-catit >> nth=0")
                time.sleep(0.3)
                ok(pg.evaluate("document.querySelectorAll('.ve-mix-sub .ve-mix-ef').length") > 0, "passar o mouse abre o submenu")
                pg.screenshot(path=BASE + "saida/mixer_menu.png")
            else:
                ok(False, "espaço de efeito do Mixer não apareceu")
    finally:
        if app:
            app.terminate()
    print("\n" + ("TUDO OK" if not erros else f"{len(erros)} FALHA(S): " + "; ".join(erros)))
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
