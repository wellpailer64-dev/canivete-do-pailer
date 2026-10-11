"""Motion do Editor Kanivete (editor-motion.js) com mouse de verdade: ferramenta Máscara (arrastar no monitor), Caneta
(4 pontos, fecha no 1º), arrastar vértice, máscara recorta a camada no monitor, cronômetro de parâmetro de efeito
(◆ na agulha, valor em outro instante vira 2º ◆), camada mãe pelo painel sem a filha pular, nulo, fosco escolhido
no painel, forma estrela com aparar caminho, Ctrl+Z. A exportação × prévia fica no teste_export (caso motion).

    py -3.13 testes/teste_motion.py [--porta 9335] [--sem-abrir]
"""
import argparse
import os
import subprocess
import sys
import time
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from Functions.midia import ffmpeg  # noqa: E402

BASE = "D:/kanivete_testes/motion/"
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=9335)
    ap.add_argument("--sem-abrir", action="store_true")
    a = ap.parse_args()
    vid = BASE + "base.mp4"
    os.makedirs(BASE, exist_ok=True)
    if not os.path.isfile(vid):
        subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x1e3a8a:s=1080x1920:r=30:d=6", "-f", "lavfi", "-i", "sine=f=440:d=6",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", vid], check=True)
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
            pg.wait_for_function("!!(window.pywebview && window.pywebview.api && window.pywebview.api.video_cutter_prepare) && window.VEMO_API", timeout=90000)
            pg.evaluate("document.getElementById('app-update-banner')?.remove(); document.querySelector('.menu-item[data-tool=\"video-cutter\"]')?.click()")
            time.sleep(1)
            if pg.evaluate("VE.ready ? (VE.path || '').replace(/\\\\/g, '/') : ''") != vid:
                pg.evaluate("p => veOpenPath(p)", vid)
                pg.wait_for_function("VE.ready && VE.clips.length > 0 && $ve('ve-loading').hidden", timeout=120000)
            # camada: forma laranja 600×600 no centro, na trilha 2, 0–5 s
            pg.evaluate("""() => {
                veStop();
                const fm = veGrMidia('forma', 'Forma'), base = VE.clips.find(c => !veIsAudio(c));
                const q = { tr: 1, st: 0, s: 0, e: 5, m: fm.id, fm: { t: 'ret', w: 600, h: 600, cor: '#F97316', cOn: false, cCor: '#ffffff', cLarg: 8, raio: 0 },
                            p: { sc: 100, x: VE.seqW / 2, y: VE.seqH / 2, rot: 0, op: 100 } };
                vePushHistory(); VE.clips = VE.clips.filter(c => c === base || veIsAudio(c)); VE.clips.push(q);
                veEnsureTrackIndex(1); veRelayout(); VE.sel = VE.clips.indexOf(q); veSeek(1); veRefresh();
                window.veCacheGet = () => null;
            }""")
            time.sleep(0.5)

            def tela(x, y):   # px do quadro → px da página
                q = pg.evaluate("veTxQuadroTela()")
                return q["x0"] + x * q["s"], q["y0"] + y * q["s"]

            def pixel(x, y):   # cor do monitor no px do quadro
                return pg.evaluate("""([x, y]) => { veDrawMonitor(); const cv = $ve('ve-canvas'), k = cv.width / VE.seqW;
                    const d = cv.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return [d[0], d[1], d[2]]; }""", [x, y])
            laranja = lambda c: c[0] > 200 and 80 < c[1] < 160 and c[2] < 80
            cx, cy = pg.evaluate("[VE.seqW / 2, VE.seqH / 2]")

            # 1. ferramenta Máscara: arrastar um retângulo na metade de cima da forma
            pg.evaluate("veSetTool('mascara'); VEMO.ferr = 'ret'")
            x0, y0 = tela(cx - 250, cy - 250)
            x1, y1 = tela(cx + 250, cy - 20)
            pg.mouse.move(x0, y0)
            pg.mouse.down()
            pg.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, steps=5)
            pg.mouse.move(x1, y1, steps=5)
            pg.mouse.up()
            time.sleep(0.3)
            mk = pg.evaluate("(() => { const c = VE.clips[VE.sel]; return (c.mk || []).map(m => ({ n: m.pts.length, fech: m.fech, x0: m.pts[0], y0: m.pts[1], x2: m.pts[12], y2: m.pts[13] })); })()")
            ok(len(mk) == 1 and mk[0]["n"] == 24 and mk[0]["fech"], "Máscara: arrastar cria uma máscara retangular fechada", str(mk))
            ok(mk and abs(mk[0]["x0"] - 50) < 6 and abs(mk[0]["y0"] - 50) < 6 and abs(mk[0]["x2"] - 550) < 6 and abs(mk[0]["y2"] - 280) < 6,
               "nas coordenadas da camada (px da mídia)", str(mk))
            ok(laranja(pixel(cx, cy - 150)) and not laranja(pixel(cx, cy + 150)), "monitor: dentro da máscara aparece, fora some",
               f"{pixel(cx, cy - 150)} / {pixel(cx, cy + 150)}")
            # 2. arrastar um vértice (canto de baixo à direita) para baixo
            pg.evaluate("veSetTool('select')")
            vx, vy = tela(cx + 250, cy - 20)
            pg.mouse.move(vx, vy)
            pg.mouse.down()
            pg.mouse.move(vx, vy + 60, steps=4)
            pg.mouse.move(*tela(cx + 250, cy + 200), steps=6)
            pg.mouse.up()
            time.sleep(0.3)
            y2 = pg.evaluate("VE.clips[VE.sel].mk[0].pts[13]")
            ok(abs(y2 - 500) < 8, "arrastar o vértice com a Seleção move só ele", f"y={y2}")
            ok(laranja(pixel(cx + 200, cy + 150)), "o recorte acompanha o ponto", str(pixel(cx + 200, cy + 150)))
            # 3. Caneta: 4 pontos e fecha clicando no primeiro
            pg.evaluate("veSetTool('caneta')")
            pts = [(cx - 280, cy + 230), (cx - 100, cy + 230), (cx - 100, cy + 290), (cx - 280, cy + 290)]
            for (x, y) in pts:
                pg.mouse.click(*tela(x, y))
                time.sleep(0.1)
            pg.mouse.click(*tela(*pts[0]))
            time.sleep(0.3)
            m2 = pg.evaluate("(() => { const m = VE.clips[VE.sel].mk[1]; return m && { n: m.pts.length / 6, fech: m.fech }; })()")
            ok(m2 == {"n": 4, "fech": True}, "Caneta: 4 cliques + clique no 1º ponto = máscara fechada de 4 pontos", str(m2))
            ok(laranja(pixel(cx - 190, cy + 260)), "a máscara da caneta soma (Adicionar)", str(pixel(cx - 190, cy + 260)))
            pg.evaluate("veSetTool('select')")
            # 4. Subtrair pelo painel
            pg.evaluate("vedShow('pp'); VEFX.key = ''; veRenderFxControls()")
            escolher = lambda css, v, n=0: pg.evaluate("([css, v, n]) => { const s = document.querySelectorAll(css)[n]; s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }", [css, v, n])
            escolher("#ve-fxc [data-mk] select[data-mkm='modo']", "sub", 1)
            time.sleep(0.2)
            ok(pg.evaluate("VE.clips[VE.sel].mk[1].modo") == "sub" and not laranja(pixel(cx - 190, cy + 260)), "modo Subtrair pelo painel")
            # 5. cronômetro da Pena: ◆ em 1 s, valor 80 em 3 s vira 2º ◆
            clicar = lambda css: pg.evaluate("css => document.querySelector(css).click()", css)
            clicar("#ve-fxc [data-mosw$='.pena']")
            n1 = pg.evaluate("(() => { const c = VE.clips[VE.sel], k = Object.keys(c.k || {}).find(k => k.endsWith('.pena')); return k ? c.k[k].length : 0; })()")
            pg.evaluate("veSeek(3)")
            time.sleep(0.2)
            pg.evaluate("""() => { const i = document.querySelector("#ve-fxc input[type=number][data-mok$='.pena']"); i.value = '80';
                i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }""")
            kf = pg.evaluate("(() => { const c = VE.clips[VE.sel], k = Object.keys(c.k).find(k => k.endsWith('.pena')); return c.k[k].map(q => [Math.round(q.t * 100) / 100, q.v]); })()")
            ok(n1 == 1 and kf == [[1, 0], [3, 80]], "cronômetro: ◆ na agulha; mudar em outro instante cria o 2º ◆", str(kf))
            meio = pg.evaluate("(() => { const c = VE.clips[VE.sel], k = Object.keys(c.k).find(k => k.endsWith('.pena')); return VEMO_API.valor(VE.sel, k, 2); })()")
            ok(abs(meio - 40) < 0.5, "valor interpolado no meio (linear)", str(meio))
            ok(pg.evaluate("[...document.querySelectorAll('.ve-head-k .ve-kl-nome')].some(e => /Pena/.test(e.textContent))"), "a propriedade animada ganha faixa na timeline")
            # 6. efeito com parâmetro animado
            pg.evaluate("veFxAdd(VE.sel, 'blur')")
            fid = pg.evaluate("VE.clips[VE.sel].fx.find(f => f.t === 'blur').id")
            pg.evaluate("veSeek(1)")
            clicar(f"#ve-fxc [data-mosw='fx.{fid}.amt']")
            pg.evaluate("veSeek(2)")
            pg.evaluate(f"veFxSetParam('{fid}', 'amt', 60)")
            v15 = pg.evaluate(f"veFxValues(VE.clips[VE.sel].fx.find(f => f.id === '{fid}'), VE.clips[VE.sel], 1.5).amt")
            ok(pg.evaluate(f"(VE.clips[VE.sel].k['fx.{fid}.amt'] || []).length") == 2 and abs(v15 - 40) < 0.5, "parâmetro de efeito animado (Desfoque 20→60: 40 no meio)", str(v15))
            # 7. nulo e camada mãe pelo painel: a filha não pula
            antes = pg.evaluate("(() => { const c = VE.clips[VE.sel], p = veMoMundo(c, 1).transformPoint({x: 300, y: 300}); return [p.x, p.y]; })()")
            pg.evaluate("veSeek(1)")
            filha = pg.evaluate("VE.sel")
            n = pg.evaluate(f"VEMO_API.nulo({{ x: 200, y: 300 }})")
            pg.evaluate(f"(() => {{ const c = VE.clips[{n}]; c.p = {{ ...c.p, rot: 30, sc: 150 }}; VE.sel = {filha}; VEFX.key = ''; veRefresh(); }})()")
            escolher("#ve-fxc select[data-mo='pai']", str(n))
            depois = pg.evaluate("(() => { const c = VE.clips[VE.sel], p = veMoMundo(c, 1).transformPoint({x: 300, y: 300}); return [p.x, p.y]; })()")
            ok(pg.evaluate("!!VE.clips[VE.sel].pai") and abs(antes[0] - depois[0]) < 1 and abs(antes[1] - depois[1]) < 1,
               "camada mãe pelo painel: a filha fica onde estava", f"{antes} → {depois}")
            pg.evaluate(f"VE.clips[{n}].p = {{ ...VE.clips[{n}].p, rot: 120 }}")
            girou = pg.evaluate("(() => { const c = VE.clips[VE.sel], p = veMoMundo(c, 1).transformPoint({x: 300, y: 300}); return [p.x, p.y]; })()")
            ok(abs(girou[0] - antes[0]) > 50, "girar o nulo leva a filha junto", f"{girou}")
            ok(pg.evaluate(f"veMoFora(VE.clips[{n}]) && !veExportPlan(false).camadas.some(o => o.path == null && o.tipo === 'imagem' && o.mw === 100)"),
               "nulo não sai na exportação")
            # 8. fosco escolhido no painel (a camada-fosco some da tela)
            info = pg.evaluate("""() => {
                const fm = veGrMidia('forma', 'Forma'), c = VE.clips[VE.sel];
                const fo = { tr: 3, st: 0, s: 0, e: 5, m: fm.id, fm: { t: 'eli', w: 300, h: 300, cor: '#ffffff', cOn: false, cCor: '#fff', cLarg: 8, raio: 0 },
                             p: { sc: 100, x: VE.seqW / 2, y: VE.seqH / 2 - 150, rot: 0, op: 100 } };
                veEnsureTrackIndex(3); VE.clips.push(fo); veRelayout(); VEFX.key = ''; veRefresh();
                return VE.clips.indexOf(fo);
            }""")
            escolher("#ve-fxc select[data-mo='mtmodo']", "alfa")
            escolher("#ve-fxc select[data-mo='mtuid']", str(info))
            mt = pg.evaluate("VE.clips[VE.sel].mt")
            ok(mt and mt["modo"] == "alfa" and mt["uid"] == pg.evaluate(f"VE.clips[{info}].uid"), "fosco alfa escolhido no painel", str(mt))
            # 9. estrela com aparar caminho (só desenha)
            est = pg.evaluate("""() => { const cv = document.createElement('canvas'); cv.width = cv.height = 200; const x = cv.getContext('2d');
                veGrForma(x, { t: 'est', w: 200, h: 200, cor: '#ff0000', pOn: true, cOn: true, cCor: '#fff', cLarg: 6, pontas: 5, raioInt: 40, apIni: 0, apFim: 50 });
                const d = x.getImageData(0, 0, 200, 200).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }""")
            ok(est > 1000, "forma Estrela com aparar caminho desenha", str(est))
            # 10. desfazer volta tudo (a máscara some depois de vários Ctrl+Z)
            for _ in range(30):
                pg.evaluate("veUndo()")
            ok(not pg.evaluate("VE.clips.some(c => (c.mk || []).length)"), "Ctrl+Z desfaz as máscaras")
            log = pg.evaluate("(window.__veLog || []).filter(e => e.tipo === 'erro').map(e => e.msg)")
            ok(not log, "nenhum erro de JavaScript no registro", "; ".join(log[-3:]))
    finally:
        if app:
            subprocess.run(["taskkill", "/PID", str(app.pid), "/T", "/F"], capture_output=True)
    print(f"\n{'OK' if not erros else 'FALHOU'}: {len(erros)} falha(s)")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
