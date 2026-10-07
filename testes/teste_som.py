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
    pg.wait_for_function("typeof switchTool === 'function' && window.SKN && !!window.pywebview?.api?.sk_info", timeout=90000)   # a ponte do pywebview chega depois da página
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
        pg.click("#sk-p-texto .sk-texto span[data-i='1']")
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
    # ── fase A: motor em trechos (precisão), medidores, micro-fade/crossfade na exportação, painéis ──
    subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3,adelay=2000,volume=0.5", D + "bip2s.wav"], check=True)
    pg.evaluate("SKN.novo('vazio', 'Motor')")
    pg.evaluate(f"async () => await SKN.importar(['{D}bip2s.wav'])")
    t_som = pg.evaluate("""async () => { SKN.ir(1.5); await skTocar(); return await new Promise(res => { const ini = performance.now();
        const olha = () => { const m = skMedirAgora(); if (m && m.L.pico > -30) return res(SK.ph); if (performance.now() - ini > 4000) return res(-1); requestAnimationFrame(olha); }; olha(); }); }""")
    pg.wait_for_timeout(500)
    med = pg.evaluate("(m => m && {M: m.M, f: Object.values(m.faixas)[0].pico})(skMedirAgora())")
    pg.evaluate("skParar()")
    ok(abs(t_som - 2.0) < 0.09, "o som sai quando a agulha passa pelo ponto certo (trechos agendados)", f"bip em 2,0 s ouvido com agulha em {t_som:.3f}")
    ok(med and med["M"] > -40 and med["f"] > -30, "medidores: LUFS do master e pico da faixa", str(med))
    pg.evaluate("SKN.novo('vazio', 'Cross')")
    a = pg.evaluate(f"async () => (await SKN.importar(['{D}voz.wav'], {{ini: 0}}))[0]")
    pg.evaluate("(a) => SKN.alterarClipe(a, {dur: 4})", a)
    b2 = pg.evaluate(f"async () => (await SKN.importar(['{D}voz.wav'], {{ini: 3}}))[0]")
    pg.evaluate("(b) => SKN.alterarClipe(b, {dur: 4, de: 3})", b2)   # mesma fase da onda: crossfade linear mantém o nível
    arq = pg.evaluate(f"async () => (await SKN.exportar('{D}cross.wav', {{formato: 'wav'}})).caminho")
    def pico(trecho, a=arq):
        o = subprocess.run([FF, "-hide_banner", "-i", a, "-af", f"atrim={trecho},volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
        return float(re.findall(r"max_volume: (-?[\d.]+) dB", o)[-1])
    mx, ref, orig = pico("3.1:3.9"), pico("0.5:2.5"), pico("0.5:2.5", D + "voz.wav")
    ok(abs(mx - ref) < 1, "crossfade automático na sobreposição (sem somar o volume)", f"sobreposição {mx} dB, fora dela {ref} dB (somando seria +6)")
    ok(abs(ref - orig) < 0.3, "áudio mono exporta no mesmo volume do original", f"{ref} × {orig} dB")
    pg.evaluate("(a) => SKN.alterarClipe(a, {dur: 2.0013, fade_in: 0, fade_out: 0})", a); pg.evaluate("(b) => SKN.apagar(b)", b2)
    arq = pg.evaluate(f"async () => (await SKN.exportar('{D}micro.wav', {{formato: 'wav'}})).caminho")
    import wave, struct
    with wave.open(arq) as w:
        n = w.getnframes(); w.setpos(n - 3); fim = struct.unpack("<6h", w.readframes(3))
    ok(max(abs(x) for x in fim) < 400, "micro-fade no fim do corte (sem estalo)", str(fim))
    pg.evaluate("SK.sel = SKN.estado().faixas[0].clipes[0].id; skUi()")
    for aba, alvo in (("faixa", "data-fx"), ("exportar", "ske-f"), ("texto", "sk-transc"), ("clipe", "data-p=\"ini\"")):
        pg.evaluate(f"skDockMostrar('{aba}')")
        ok(alvo in pg.inner_html(f"#sk-p-{aba}"), f"painel {aba}")
    pg.evaluate("skDockMostrar('midia')")
    n0 = len(pg.evaluate("SKN.estado().faixas[0].clipes"))
    pg.click("#sk-p-midia [data-por]")
    pg.wait_for_function(f"SKN.estado().faixas[0].clipes.length > {n0}", timeout=5000)
    ok(True, "Mídia: + insere o áudio na agulha")
    h0 = pg.evaluate("document.querySelector('#sk .sk-monitor').getBoundingClientRect().height")
    bx = pg.evaluate("(() => { const r = document.getElementById('sk-div').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 3]; })()")
    pg.mouse.move(*bx); pg.mouse.down(); pg.mouse.move(bx[0], bx[1] + 60, steps=5); pg.mouse.up()
    h1 = pg.evaluate("document.querySelector('#sk .sk-monitor').getBoundingClientRect().height")
    ok(abs(h1 - h0 - 60) < 3, "divisória arrasta e redimensiona os painéis", f"{h0} → {h1}")
    pg.mouse.move(bx[0], bx[1] + 60); pg.mouse.down(); pg.mouse.move(*bx, steps=5); pg.mouse.up()
    # painéis móveis: arrastar o título do Texto para Voz para cima da timeline (solto) e de volta para a coluna da esquerda
    pg.evaluate("skDockMostrar('tts')")
    cab = pg.evaluate("(() => { const r = SK_DOCK.el.tts.querySelector('.ie-painel-cab').getBoundingClientRect(); return [r.left + 40, r.top + r.height / 2]; })()")
    alvo = pg.evaluate("(() => { const r = document.getElementById('sk-tl-wrap').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 80]; })()")
    pg.mouse.move(*cab); pg.mouse.down(); pg.mouse.move(*alvo, steps=10); pg.mouse.up()
    solto = pg.evaluate("!!SK_DOCK.lay.soltos.tts && SK_DOCK.el.tts.classList.contains('solto')")
    cab = pg.evaluate("(() => { const r = SK_DOCK.el.tts.querySelector('.ie-painel-cab').getBoundingClientRect(); return [r.left + 40, r.top + r.height / 2]; })()")
    col = pg.evaluate("(() => { const r = document.querySelector('#sk-dock-esq .ie-dock-col').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 10]; })()")
    pg.mouse.move(*cab); pg.mouse.down(); pg.mouse.move(*col, steps=10); pg.mouse.up()
    ok(solto and pg.evaluate("SK_DOCK.lay.esq[0][0] === 'tts' && !SK_DOCK.lay.soltos.tts"), "painéis: arrastar solta sobre a timeline e encaixa de volta na coluna", str(pg.evaluate("SK_DOCK.lay.esq")))
    pg.evaluate("skDockRedefinir()")
    # ── rodada B: gravar do microfone, salvamento automático e recuperação, arquivo longo (--longo) ──
    ent = pg.evaluate("async () => await SKN.entradas()")
    if ent.get("dispositivos"):
        g = D + "grav_teste.wav"
        pg.evaluate("SKN.novo('vazio', 'Gravar')")
        pg.evaluate("async (g) => await SKN.gravar({caminho: g})", g)
        pg.wait_for_timeout(2000)
        ag = pg.evaluate("SK.ph")
        gid = pg.evaluate("async () => await SKN.pararGravacao()")
        cl = pg.evaluate("SKN.estado().faixas[0].clipes")
        import wave
        with wave.open(g) as w:
            bits = w.getsampwidth() * 8
        ok(gid and len(cl) == 1 and cl[0]["ini"] == 0 and 1.6 < cl[0]["dur"] < 2.6 and bits == 24 and 1.6 < ag < 2.6,
           "gravar do microfone: WAV 24 bits entra na faixa a partir da agulha, a agulha anda", f"{cl} {bits} bits, agulha {ag:.2f}")
        os.remove(g)
    else:
        print("  (sem entrada de áudio: gravação não testada)")
    pg.evaluate("SKN.novo('vazio', 'Recuperar')")
    pg.evaluate(f"async () => await SKN.importar(['{D}voz.wav'], {{ini: 1.5}})")
    pid = pg.evaluate("async () => { await SKN.autoSalvar(); return SK.proj.id; }")
    ok(pid in [x["id"] for x in pg.evaluate("async () => await SKN.recuperaveis()")], "salvamento automático grava a cópia")
    pg.evaluate("SKN.novo('vazio')")
    pg.evaluate("async (p) => await SKN.recuperar(p)", pid)
    e3 = pg.evaluate("SKN.estado()")
    ok(e3["nome"] == "Recuperar" and e3["faixas"][0]["clipes"][0]["ini"] == 1.5, "recuperar o projeto salvo automaticamente")
    pg.evaluate(f"async () => await SKN.salvar('{D}recuperado.sknv')")
    pg.wait_for_timeout(300)
    ok(pid not in [x["id"] for x in pg.evaluate("async () => await SKN.recuperaveis()")], "salvar de verdade apaga a cópia automática")
    # ── rodada C: intervalo entre faixas (apagar e puxar, copiar/colar, recortar), curva de volume, ducking ──
    pg.evaluate("SKN.novo('podcast', 'Intervalo')")
    pg.evaluate(f"async () => {{ await SKN.importar(['{D}voz.wav'], {{faixa: SK.proj.faixas[0].id, ini: 0}}); await SKN.importar(['{D}ruido.mp3'], {{faixa: SK.proj.faixas[1].id, ini: 0}}); }}")
    pg.evaluate("SKN.intervalo(2, 4, [SK.proj.faixas[0].id, SK.proj.faixas[1].id])")
    pg.evaluate("SKN.apagarIntervalo(true)")
    e4 = pg.evaluate("SKN.estado()")
    f0 = sorted((c["ini"], c["dur"], c["de"]) for c in e4["faixas"][0]["clipes"]); f1 = sorted((c["ini"], c["dur"], c["de"]) for c in e4["faixas"][1]["clipes"])
    ok(f0 == [(0, 2, 0), (2, 8, 4)] and f1 == [(0, 2, 0), (2, 4, 4)], "apagar intervalo e puxar (2 faixas)", f"{f0} {f1}")
    pg.evaluate("SKN.intervalo(0, 1, [SK.proj.faixas[0].id]); SKN.copiar(); SK.faixaSel = SK.proj.faixas[2].id; SKN.colar(20)")
    c2 = pg.evaluate("SKN.estado().faixas[2].clipes")
    ok(len(c2) == 1 and c2[0]["ini"] == 20 and abs(c2[0]["dur"] - 1) < 1e-6, "copiar o intervalo e colar na agulha em outra faixa", str(c2))
    pg.evaluate("SKN.intervalo(1, 3); SKN.recortar()")
    ok(abs(pg.evaluate("SKN.estado().fim") - 2) < 1e-6, "recortar o projeto ao intervalo", str(pg.evaluate("SKN.estado().fim")))
    pg.evaluate("SKN.desfazer(); SKN.desfazer(); SKN.desfazer()")
    # mouse: Shift+arrastar sobre os clipes marca intervalo pegando 2 faixas
    pos = pg.evaluate("""() => { const r = document.getElementById('sk-tl').getBoundingClientRect(); const X = t => r.left + (t - SK.x0) * SK.z, Y = i => r.top + SK_REGUA + i * SK_H + SK_H / 2 - SK.y0;
        return [X(3), Y(0), X(5), Y(1)]; }""")
    pg.keyboard.down("Shift"); pg.mouse.move(pos[0], pos[1]); pg.mouse.down(); pg.mouse.move(pos[2], pos[3], steps=6); pg.mouse.up(); pg.keyboard.up("Shift")
    it = pg.evaluate("SKN.estado().intervalo")
    ok(it and abs(it["a"] - 3) < 0.1 and abs(it["b"] - 5) < 0.1 and len(it["faixas"]) == 2, "Shift+arrastar marca intervalo em 2 faixas", str(it))
    pg.evaluate("SKN.intervalo(null)")
    # curva de volume: corta em -inf no meio e volta; exportação segue a curva; cortar o clipe mantém a curva presa ao som
    pg.evaluate("SKN.novo('vazio', 'Curva')")
    cid = pg.evaluate(f"async () => (await SKN.importar(['{D}voz.wav']))[0]")
    pg.evaluate("(id) => SKN.curva(id, [[0, 1], [2, 1], [3, 0.05], [5, 0.05], [6, 1], [12, 1]])", cid)
    arq = pg.evaluate(f"async () => (await SKN.exportar('{D}curva.wav', {{formato: 'wav'}})).caminho")
    alto, baixo = pico("0.5:1.5", arq), pico("3.3:4.7", arq)
    ok(alto - baixo > 20, "curva de volume na exportação", f"{alto} dB → {baixo} dB")
    pg.evaluate("SKN.cortar(4)")
    cs = sorted(pg.evaluate("SKN.estado().faixas[0].clipes"), key=lambda c: c["ini"])
    ok(len(cs) == 2 and cs[1]["curva"][0] == [0, 0.05] and abs(cs[0]["curva"][-1][0] - 4) < 1e-6, "cortar divide a curva junto", str([c.get("curva") for c in cs]))
    # ducking: a trilha abaixa onde a voz fala
    pg.evaluate("SKN.novo('narracao', 'Ducking')")
    pg.evaluate(f"async () => {{ await SKN.importar(['{D}pausas.wav'], {{faixa: SK.proj.faixas[0].id, ini: 0}}); await SKN.importar(['{D}ruido.mp3'], {{faixa: SK.proj.faixas[1].id, ini: 0}}); }}")
    n = pg.evaluate("async () => await SKN.ducking(SK.proj.faixas[1].id, {db: -12})")
    tc = pg.evaluate("SKN.estado().faixas[1].clipes[0]")
    em = lambda t: pg.evaluate("([id, t]) => skCurvaEm(skClipe(id)[0], t)", [tc["id"], t])
    ok(n >= 2 and abs(em(0.5) - 0.251) < 0.01 and em(1.9) > 0.9, "ducking: trilha a -12 dB sob a voz e volta na pausa", f"{n} falas, 0,5 s → {em(0.5):.3f}, 1,9 s → {em(1.9):.3f}")
    # ── rodada D: limitador no master e cadeia por faixa (passa-alta, gate, EQ gráfico, de-esser, reverb) ──
    subprocess.run([FF, "-v", "error", "-y", "-i", D + "pausas.wav", "-f", "lavfi", "-i", "anoisesrc=d=3.5:c=white:a=0.004", "-filter_complex",
                    "[0][1]amix=inputs=2:normalize=0:duration=first", D + "gate.wav"], check=True)
    pg.evaluate("SKN.novo('vazio', 'Master')")
    lid = pg.evaluate(f"async () => (await SKN.importar(['{D}voz.wav']))[0]")
    pg.evaluate("(id) => SKN.alterarClipe(id, {vol: 16})", lid)
    arq = pg.evaluate(f"async () => (await SKN.exportar('{D}lim.wav', {{formato: 'wav'}})).caminho")
    pk = pico("0:12", arq)
    pg.evaluate("SK.proj.master.lim.ativo = false")
    pk0 = pico("0:12", pg.evaluate(f"async () => (await SKN.exportar('{D}lim0.wav', {{formato: 'wav'}})).caminho"))
    ok(-1.3 < pk <= -0.8 and pk0 > -0.5, "limitador do master segura o pico no teto (-1 dB)", f"com {pk} dB, sem {pk0} dB")
    def fx_export(fx, nome, arq_in):
        pg.evaluate("SKN.novo('vazio', 'Fx')")
        pg.evaluate(f"async () => await SKN.importar(['{arq_in}'])")
        pg.evaluate("(fx) => SKN.fxFaixa(SK.proj.faixas[0].id, fx)", fx)
        return pg.evaluate(f"async () => (await SKN.exportar('{D}{nome}.wav', {{formato: 'wav'}})).caminho")
    sem = fx_export("nenhum", "fx0", D + "gate.wav")
    gt = fx_export({"gate": {"ativo": True, "limiar": -40}}, "fx_gate", D + "gate.wav")
    ok(pico("1.4:2.2", sem) - pico("1.4:2.2", gt) > 15, "gate tira o ruído de fundo na pausa", f"{pico('1.4:2.2', sem)} → {pico('1.4:2.2', gt)} dB")
    rv = fx_export({"rev": {"ativo": True, "mix": 0.4, "tamanho": 1.2}}, "fx_rev", D + "pausas.wav")
    sem2 = fx_export("nenhum", "fx0b", D + "pausas.wav")
    ok(pico("1.05:1.4", rv) - pico("1.05:1.4", sem2) > 15, "reverb deixa cauda depois da fala", f"{pico('1.05:1.4', sem2)} → {pico('1.05:1.4', rv)} dB")
    _, l0 = dur_lufs(fx_export("nenhum", "fx0c", D + "ruido.mp3"))
    _, lh = dur_lufs(fx_export({"hpf": {"ativo": True, "freq": 300}, "geq": {"ativo": True, "bandas": [0, 0, 0, 0, 0, 0, 0, 0, -12, -12]}, "deess": {"ativo": True, "quant": 0.8}}, "fx_hpf", D + "ruido.mp3"))
    ok(l0 - lh > 1.5, "passa-alta, EQ gráfico e de-esser mudam a exportação", f"{l0} → {lh} LUFS")
    pg.evaluate("(fx) => SKN.fxFaixa(SK.proj.faixas[0].id, fx)", {"hpf": {"ativo": True}, "gate": {"ativo": True, "limiar": -60}, "deess": {"ativo": True}, "geq": {"ativo": True, "bandas": [3, 0, 0, 0, 0, 0, 0, 0, 0, -3]}, "rev": {"ativo": True, "mix": 0.3}})
    r = pg.evaluate("""async () => { SKN.ir(0); await skTocar(); await new Promise(r => setTimeout(r, 1200)); const b = SK.bus[SK.proj.faixas[0].id];
        const m = skMedirAgora(); skParar(); return { dyn: !!b.dyn, ir: !!b.conv.buffer, pico: m.L.pico }; }""")
    ok(r["dyn"] and r["ir"] and r["pico"] > -40, "prévia com a cadeia inteira (gate/de-esser no AudioWorklet, reverb com a IR da exportação)", str(r))
    # ── rodada E: vista de espectro, reparo espectral (Ctrl+arrastar), separar voz/instrumental (--ia) ──
    subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=d=6:c=pink:a=0.2", "-f", "lavfi", "-i", "sine=f=3000:d=6,volume=0.6",
                    "-filter_complex", "[1]volume='between(t,2,3)':eval=frame[b];[0][b]amix=inputs=2:normalize=0", "-ac", "2", D + "bipe.wav"], check=True)
    pg.evaluate("SKN.novo('vazio', 'Espectro')")
    bid = pg.evaluate(f"async () => (await SKN.importar(['{D}bipe.wav']))[0]")
    pg.evaluate("skEnquadrar(); SKN.espectro(true)")
    pg.wait_for_function("(() => { const e = Object.values(SK.esp)[0]; return e && e.img && e.img.naturalWidth > 100; })()", timeout=15000)
    ok(pg.evaluate("SK_H") == 170, "vista de espectro: faixas mais altas e espectrograma do trecho visível")
    pos = pg.evaluate("""() => { const r = document.getElementById('sk-tl').getBoundingClientRect(), y = SK_REGUA - SK.y0;
        const X = t => r.left + (t - SK.x0) * SK.z; return [X(1.95), r.top + skEspY(y, 3500), X(3.05), r.top + skEspY(y, 2600)]; }""")
    pg.keyboard.down("Control"); pg.mouse.move(pos[0], pos[1]); pg.mouse.down(); pg.mouse.move(pos[2], pos[3], steps=6); pg.mouse.up(); pg.keyboard.up("Control")
    rc = pg.evaluate("SK.rect")
    ok(rc and abs(rc["t0"] - 1.95) < 0.05 and abs(rc["t1"] - 3.05) < 0.05 and 2400 < rc["f0"] < 2800 and 3200 < rc["f1"] < 3800, "Ctrl+arrastar marca a área (tempo × frequência)", str(rc))
    pg.click("#sk-rep-p")
    pg.wait_for_function("(id) => /_rep/.test(skClipe(id)[0].arq)", arg=bid, timeout=60000)
    rep = pg.evaluate("(id) => skClipe(id)[0].arq", bid)
    def banda(a):
        o = subprocess.run([FF, "-hide_banner", "-i", a, "-af", "atrim=2.2:2.8,bandpass=f=3000:w=200,volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
        return float(re.findall(r"max_volume: (-?[\d.]+) dB", o)[-1])
    ok(banda(D + "bipe.wav") - banda(rep) > 15 and abs(pico("4:5", rep) - pico("4:5", D + "bipe.wav")) < 0.5, "reparo espectral tira o bipe e não mexe no resto",
       f"bipe {banda(D + 'bipe.wav')} → {banda(rep)} dB")
    pg.evaluate("SKN.espectro(false)")
    if "--ia" in sys.argv and os.path.isfile(D + "fala.wav"):
        subprocess.run([FF, "-v", "error", "-y", "-i", D + "fala.wav", "-f", "lavfi", "-i", "sine=f=220:d=8,volume=0.3", "-f", "lavfi", "-i", "sine=f=330:d=8,volume=0.2",
                        "-filter_complex", "[0]apad=pad_dur=8,atrim=0:8[v];[v][1][2]amix=inputs=3:normalize=0", "-ac", "2", D + "musica_voz.wav"], check=True)
        pg.evaluate("SKN.novo('vazio', 'Separar')")
        sid = pg.evaluate(f"async () => (await SKN.importar(['{D}musica_voz.wav']))[0]")
        sp = pg.evaluate("async (id) => await SKN.separar(id)", sid)
        dv = dur_lufs(sp["voz"])[0]
        fim_fala = dur_lufs(D + "fala.wav")[0]
        ok(abs(dv - 8) < 0.05 and pico(f"{fim_fala + 0.5}:7.5", sp["voz"]) < pico(f"{fim_fala + 0.5}:7.5", sp["instrumental"]) - 15,
           "separar: voz e instrumental alinhados, a voz some onde só há música", str(sp))
    if "--longo" in sys.argv:
        lg = D + "longo_2h.mp3"
        if not os.path.isfile(lg):
            subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=7200,volume=4", "-ac", "1", "-b:a", "48k", lg], check=True)
        pg.evaluate("SKN.novo('vazio', 'Longo')")
        t = time.time(); pg.evaluate(f"async () => await SKN.importar(['{lg}'])"); t_imp = time.time() - t
        ok(abs(pg.evaluate("SKN.estado().fim") - 7200) < 1, "arquivo de 2 h importado (forma de onda)", f"{t_imp:.1f} s")
        t_som = pg.evaluate("""async () => { SKN.ir(6900); const t = performance.now(); await skTocar(); return await new Promise(res => {
            const olha = () => { const m = skMedirAgora(); if (m && m.L.pico > -30) return res((performance.now() - t) / 1000); if (performance.now() - t > 5000) return res(-1); requestAnimationFrame(olha); }; olha(); }); }""")
        pg.wait_for_timeout(3000)
        buf = pg.evaluate("SK.mt.buf.size"); pg.evaluate("skParar()")
        ok(0 < t_som < 1.5 and buf <= 48, "tocar no meio de 2 h: som em menos de 1,5 s, poucos trechos na memória", f"{t_som:.2f} s, {buf} trechos")
    if "--ia" in sys.argv:
        v = pg.evaluate("async () => await SKN.vozes()")
        if v.get("vozes"):
            vid = pg.evaluate("async (v) => await SKN.voz(v, 'Teste do Sound Kanivete.', {ini: 1})", v["vozes"][0]["id"])
            ok(bool(vid) and any(f["nome"] == "Voz IA" for f in pg.evaluate("SKN.estado()")["faixas"]), "voz por IA entra na faixa Voz IA")
        c0 = pg.evaluate(f"async () => {{ SKN.novo('vazio', 'IA'); return (await SKN.importar(['{D}voz.wav']))[0]; }}")
        m = pg.evaluate("async (id) => await SKN.melhorar(id)", c0)
        ok(os.path.isfile(m), "melhorar voz (IA) gera arquivo", m)
    ok(not js_erros, "sem erros de JavaScript", "; ".join(js_erros[:3]))
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
