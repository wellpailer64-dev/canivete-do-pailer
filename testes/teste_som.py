"""Sound Kanivete (som.js + Functions/sound_kanivete.py) — app em --agente=9333, mouse de verdade.

    py -3.13 testes/teste_som.py

Gera áudios de teste (ffmpeg), monta um podcast pela SKN (importar, cortar, fades, marcador), confere a forma de onda,
a reprodução (agulha anda no tempo), mover/aparar com o mouse e desfazer, salvar/abrir .sknv, exportar com duração
exata e no volume pedido (LUFS medido de novo no arquivo). Saída em D:/kanivete_testes/sound. Sai com 1 se reprovar.
"""
import os
import re
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from Functions.midia import ffmpeg  # noqa: E402

D = "D:/kanivete_testes/sound/"
os.makedirs(D, exist_ok=True)
FF = ffmpeg()
subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=12,volume=0.6", D + "voz.wav"], check=True)
subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=d=8:c=pink:a=0.3", "-ac", "2", D + "ruido.mp3"], check=True)
erros = []


def ok(c, nome, det=""):
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not c:
        erros.append(nome)


def dur_lufs(arq):
    o = subprocess.run([FF, "-hide_banner", "-i", arq, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    t = re.findall(r"time=(\d+):(\d+):([\d.]+)", o)[-1]
    i = re.findall(r"I:\s+(-?[\d.]+) LUFS", o)[-1]
    return int(t[0]) * 3600 + int(t[1]) * 60 + float(t[2]), float(i)


with sync_playwright() as p:
    b = None
    for _ in range(120):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333"); break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    js_erros = []
    pg.on("pageerror", lambda e: js_erros.append(str(e)))
    pg.wait_for_function("typeof switchTool === 'function' && window.SKN", timeout=90000)
    pg.evaluate("switchTool('sound-kanivete'); document.getElementById('app-update-banner')?.remove(); SK.proj = null; skParar(); skUi()")
    pg.wait_for_timeout(400)
    ok(pg.evaluate("!document.getElementById('sk-inicio').hidden"), "tela inicial do Sound Kanivete")
    pg.evaluate("SKN.novo('podcast', 'Teste Sk')")
    e = pg.evaluate("""async () => { const a = await SKN.importar('%svoz.wav'); const f = SKN.estado().faixas[2].id;
        const b = await SKN.importar('%sruido.mp3', {faixa: f, ini: 1}); SKN.alterarClipe(b[0], {vol: 0.5, fade_in: 1.5, fade_out: 2});
        SKN.cortar(6, a); SKN.marcador(3, 'Intro'); return SKN.estado(); }""" % (D, D))
    v = e["faixas"][0]["clipes"]
    ok(len(v) == 2 and v[1]["ini"] == 6 and v[1]["de"] == 6 and e["fim"] == 12, "importar e cortar na agulha (2 clipes, o 2º continua do 6 s)", str(v))
    ok(pg.evaluate("['voz.wav', 'ruido.mp3'].every(n => Object.values(SK.picos).some(p => p.nome === n && p.d.length > 700))"), "forma de onda carregada (picos)")
    pg.evaluate("SKN.ir(0); SKN.tocar()"); pg.wait_for_timeout(1500)
    ag = pg.evaluate("SKN.estado().agulha"); pg.evaluate("SKN.parar()")
    ok(1.2 < ag < 1.9, "tocando: a agulha anda no tempo", f"{ag} s depois de 1,5 s")
    # mouse: arrastar o clipe da trilha e aparar a borda direita; desfazer
    pos = pg.evaluate("""() => { const cv = document.getElementById('sk-tl'), r = cv.getBoundingClientRect(), c = SKN.estado().faixas[2].clipes[0];
        const X = t => r.left + (t - SK.x0) * SK.z, y = r.top + SK_REGUA + 2 * SK_H + SK_H / 2 - SK.y0; return { meio: [X(c.ini + c.dur / 2), y + 20], dir: [X(c.ini + c.dur), y + 20], z: SK.z }; }""")
    pg.evaluate("SK.encaixe = false")
    pg.mouse.move(*pos["meio"]); pg.mouse.down(); pg.mouse.move(pos["meio"][0] + pos["z"] * 2, pos["meio"][1], steps=8); pg.mouse.up()
    c = pg.evaluate("SKN.estado().faixas[2].clipes[0]")
    ok(abs(c["ini"] - 3) < 0.05, "arrastar move o clipe 2 s", str(c["ini"]))
    pos = pg.evaluate("""() => { const cv = document.getElementById('sk-tl'), r = cv.getBoundingClientRect(), c = SKN.estado().faixas[2].clipes[0];
        return [r.left + (c.ini + c.dur - SK.x0) * SK.z - 1, r.top + SK_REGUA + 2 * SK_H + SK_H / 2 - SK.y0 + 20]; }""")
    pg.mouse.move(*pos); pg.mouse.down(); pg.mouse.move(pos[0] - pos_z if (pos_z := pg.evaluate("SK.z") * 3) else pos[0], pos[1], steps=8); pg.mouse.up()
    c = pg.evaluate("SKN.estado().faixas[2].clipes[0]")
    ok(abs(c["dur"] - 5) < 0.06, "borda direita apara 3 s (8 → 5)", str(c["dur"]))
    pg.evaluate("SKN.desfazer(); SKN.desfazer()")
    c = pg.evaluate("SKN.estado().faixas[2].clipes[0]")
    ok(abs(c["ini"] - 1) < 0.01 and abs(c["dur"] - 8) < 0.01, "Ctrl+Z desfaz o aparo e o arraste", str(c))
    pg.screenshot(path=D + "teste_som.png")
    # salvar / abrir
    pg.evaluate(f"async () => await SKN.salvar('{D}teste.sknv')")
    pg.evaluate("SKN.novo('vazio')")
    pg.evaluate(f"async () => await SKN.abrir('{D}teste.sknv')")
    e2 = pg.evaluate("SKN.estado()")
    ok(len(e2["faixas"]) == 4 and len(e2["faixas"][0]["clipes"]) == 2 and e2["faixas"][2]["clipes"][0]["fade_out"] == 2, "salvar e abrir o .sknv", e2["nome"])
    # exportar
    r = pg.evaluate(f"async () => await SKN.exportar('{D}teste_export.mp3', {{lufs: -16}})")
    d, i = dur_lufs(r["caminho"])
    ok(abs(d - 12) < 0.1, "exportação com a duração do projeto", f"{d:.2f} s")
    ok(abs(i - -16) < 1.0, "exportação no volume pedido (-16 LUFS)", f"{i} LUFS")
    r = pg.evaluate(f"async () => await SKN.exportar('{D}so_trilha.wav', {{formato: 'wav', faixas: ['{e2['faixas'][2]['id']}']}})")
    d, _ = dur_lufs(r["caminho"])
    ok(abs(d - 9) < 0.1, "exportar só uma faixa (termina no fim dela: 1 + 8 s)", f"{d:.2f} s")
    # fase 2: limpar ruído (rápido); com --ia também voz (OmniVoice) e Melhorar voz (minutos)
    pg.set_default_timeout(1800000)
    c0 = e2["faixas"][0]["clipes"][0]["id"]
    s = pg.evaluate("async (id) => await SKN.limpar(id, 90)", c0)
    cl = pg.evaluate("(id) => skClipe(id)[0]", c0)
    ok(s.endswith("_limpo90.wav") and os.path.isfile(s) and cl["orig"].endswith("voz.wav") and all(c["arq"] == s for c in pg.evaluate("() => SK.proj.faixas[0].clipes")),
       "limpar ruído: arquivo novo ao lado, vale para os clipes da gravação", s)
    pg.evaluate("(id) => SKN.original(id)", c0)
    ok(pg.evaluate("(id) => skClipe(id)[0].arq", c0).endswith("voz.wav"), "voltar ao original")
    # fase 3: transcrever (fala gerada pelo OmniVoice no --ia: "Teste do Sound Kanivete."), sons, atalhos
    fala = D + "fala.wav"
    if os.path.isfile(fala):
        pg.evaluate("SKN.novo('vazio', 'Texto')")
        pg.evaluate(f"async () => await SKN.importar('{fala}')")
        n = pg.evaluate("async () => await SKN.transcrever('pt')")
        txt = pg.evaluate("SKN.texto()") or ""
        ok(n >= 3 and "teste" in txt.lower(), "transcrever a mixagem (palavras com tempo)", txt)
        leg = pg.evaluate("SKN.legendas()")
        ok(leg and leg[0]["st"] >= 0 and leg[-1]["en"] > leg[0]["st"], "legendas agrupadas em linhas", str(leg)[:120])
        pg.click("#sk-props .sk-texto span[data-i='1']")
        ok(abs(pg.evaluate("SKN.estado().agulha") - pg.evaluate("SK.texto.palavras[1][0]")) < 0.01, "clicar na palavra leva a agulha")
    sb = pg.evaluate("async () => await skApi().ve_sb_estado()")
    if sb.get("instalado"):
        som = next(s for c in sb["categorias"] for s in c["sons"])
        ids = pg.evaluate("async (p) => await SKN.importar(p, {ini: 0.5})", som["path"])
        ok(len(ids) == 1, "som do soundboard entra na timeline", som.get("nome") or som["arq"])
    ok(pg.evaluate("document.querySelectorAll('.sk-atalho').length") == 4 and pg.evaluate("document.querySelectorAll('.menu-item.menu-sub').length") == 4,
       "as 4 ferramentas de áudio viraram atalhos agrupados sob o Sk")
    # fase 4: igualar volume, cortar silêncios, EQ/compressor da faixa, ponte com o Editor
    subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=4,volume=0.12", D + "baixo.wav"], check=True)
    subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=1,volume=0.5", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1.5",
                    "-f", "lavfi", "-i", "sine=frequency=330:duration=1,volume=0.5", "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", D + "pausas.wav"], check=True)
    pg.evaluate("SKN.novo('vazio', 'Fase 4')")
    ids = pg.evaluate(f"async () => await SKN.importar(['{D}baixo.wav'])")
    pg.evaluate("async (ids) => await SKN.igualar(ids, -16)", ids)
    d, i = dur_lufs(pg.evaluate(f"async () => (await SKN.exportar('{D}igualado.wav', {{formato: 'wav'}})).caminho"))
    ok(abs(i - -16) < 1.0, "igualar volume do clipe a -16 LUFS (só o ganho)", f"{i} LUFS, vol {pg.evaluate('SKN.estado().faixas[0].clipes[0].vol'):.2f}")
    pg.evaluate("SKN.novo('vazio', 'Pausas')")
    ids = pg.evaluate(f"async () => await SKN.importar(['{D}pausas.wav'])")
    n = pg.evaluate("async (id) => await SKN.cortarSilencios(id, {minimo: 0.5})", ids[0])
    cl = pg.evaluate("SKN.estado().faixas[0].clipes")
    ok(n == 1 and len(cl) == 2 and abs(sum(c["dur"] for c in cl) - (3.5 - 1.5 + 0.24)) < 0.1 and abs(cl[1]["ini"] - (cl[0]["ini"] + cl[0]["dur"])) < 0.01,
       "cortar silêncios: 2 pedaços colados, a pausa de 1,5 s sai (fica o respiro)", str([(c["ini"], c["dur"]) for c in cl]))
    f0 = pg.evaluate("SKN.estado().faixas[0].id")
    pg.evaluate("(id) => SKN.fxFaixa(id, 'voz')", f0)
    _, i_fx = dur_lufs(pg.evaluate(f"async () => (await SKN.exportar('{D}fx_voz.wav', {{formato: 'wav'}})).caminho"))
    pg.evaluate("(id) => SKN.fxFaixa(id, 'nenhum')", f0)
    _, i_0 = dur_lufs(pg.evaluate(f"async () => (await SKN.exportar('{D}fx_nada.wav', {{formato: 'wav'}})).caminho"))
    ok(abs(i_fx - i_0) > 0.5, "EQ e compressor da faixa mudam a exportação", f"{i_0} → {i_fx} LUFS")
    c = pg.evaluate("async () => { await SKN.enviarEditor('D:/kanivete_testes/sound/para_editor.wav'); await new Promise(r => setTimeout(r, 4000)); return { ok: VE.ready, aud: (VE.clips || []).length + (VE.audios || VE.audioClips || []).length }; }")
    ok(c["ok"], "mixagem enviada ao Editor de vídeo (abre/entra na timeline)", str(c))
    pg.evaluate("switchTool('sound-kanivete')")
    if "--ia" in sys.argv:
        v = pg.evaluate("async () => await SKN.vozes()")
        if v.get("vozes"):
            vid = pg.evaluate("async (v) => await SKN.voz(v, 'Teste do Sound Kanivete.', {ini: 1})", v["vozes"][0]["id"])
            ok(bool(vid) and any(f["nome"] == "Voz IA" for f in pg.evaluate("SKN.estado()")["faixas"]), "voz por IA entra na faixa Voz IA")
        m = pg.evaluate("async (id) => await SKN.melhorar(id)", c0)
        ok(os.path.isfile(m), "melhorar voz (IA) gera arquivo", m)
    ok(not js_erros, "sem erros de JavaScript", "; ".join(js_erros[:3]))
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
