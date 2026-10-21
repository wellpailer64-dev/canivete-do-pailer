"""Vigia de exportação do Vídeo Kanivete (barato em tokens): acompanha o export/fila no app aberto em modo agente,
SÓ LENDO (não clica em nada), e no fim confere o arquivo gerado.

    py -3.13 tools/vigia_export.py                 # app do Pailer (porta 9222), espera começar e terminar
    py -3.13 tools/vigia_export.py --porta 9333 --passo 20 --max 7200
    py -3.13 tools/vigia_export.py --so-conferir "saida.mp4"   # só a conferência de um arquivo pronto
    py -3.13 tools/vigia_export.py --perfil        # + perfil do render: fase × tempo × CPU/placa/codificador/RAM (CSV)

Rodar em segundo plano (run_in_background): imprime uma linha a cada 10% e o resumo final; sai com 1 se falhar.
Conferência do arquivo: resolução/qps/duração (× duração da timeline ativa), quadros pretos (blackdetect, fora do
fade final), silêncio longo, LUFS integrado e pico real (ebur128; referência YouTube −14 a −16 LUFS, pico ≤ −1 dBTP).
Relatório completo em D:/kanivete_testes/vigia/<arquivo>.txt."""
import argparse, json, os, re, subprocess, sys, time

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA_REL = "D:/kanivete_testes/vigia"

ESTADO_JS = """() => {
  const f = (typeof VEFILA === 'object' && VEFILA) ? VEFILA : null;
  const itens = f ? f.itens.map(i => ({ id: i.id, nome: i.nome, estado: i.estado, pct: Math.round(i.pct || 0), saida: i.saida || null,
                                         erro: i.erro || null, tempo: i.tempo || null, faixa: i.faixa ? i.faixa.b - i.faixa.a : null })) : [];
  const dur = (VE.clips || []).reduce((m, c) => Math.max(m, c.st + (c.e - c.s) / (c.v || 1)), 0);
  return { rodando: !!(VE.exportRunning || (f && f.rodando)), pct: (document.getElementById('ve-exp-pct') || {}).textContent || '',
           msg: (document.getElementById('ve-exp-msg') || {}).textContent || '', ultimo: VE.lastOutput || null, itens,
           timeline: (VE.sequences || []).find(s => s.id === VE.activeSequence)?.name || '', dur };
}"""


def ffmpeg():
    for c in (os.path.join(RAIZ, "dist", "CaniveteDoPailer", "modelos_ia", "ffmpeg.exe"), os.path.join(RAIZ, "modelos_ia", "ffmpeg.exe")):
        if os.path.isfile(c): return c
    return "ffmpeg"


def conferir(arq, dur_tl=None):
    """→ (linhas do resumo, ok?)"""
    ff = ffmpeg(); fp = os.path.join(os.path.dirname(ff), "ffprobe.exe")
    fp = fp if os.path.isfile(fp) else "ffprobe"
    r = json.loads(subprocess.run([fp, "-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate",
                                   "-of", "json", arq], capture_output=True, text=True).stdout or "{}")
    v = next((s for s in r.get("streams", []) if s["codec_type"] == "video"), {}); a = next((s for s in r.get("streams", []) if s["codec_type"] == "audio"), None)
    dur = float(r.get("format", {}).get("duration", 0)); mb = int(r.get("format", {}).get("size", 0)) / 1048576
    n, d = (v.get("r_frame_rate", "0/1").split("/") + ["1"])[:2]; qps = float(n) / float(d or 1)
    lin, ok = [f"{os.path.basename(arq)}: {v.get('width')}×{v.get('height')} {qps:.3f} qps {v.get('codec_name')} · {dur:.2f} s · {mb:.0f} MB · som {a['codec_name'] if a else 'NENHUM'}"], True
    if dur_tl and abs(dur - dur_tl) > 0.25: lin.append(f"⚠ duração {dur:.2f} s × timeline {dur_tl:.2f} s"); ok = False
    p = subprocess.run([ff, "-hide_banner", "-nostats", "-i", arq, "-vf", "scale=320:-2,blackdetect=d=0.15:pix_th=0.06", "-af",
                        "ebur128=peak=true,silencedetect=n=-50dB:d=2.5", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    err = p.stderr
    pretos = [(float(x), float(y)) for x, y in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", err)]
    pretos = [(x, y) for x, y in pretos if not (y >= dur - 0.2 and x > dur - 4) and not (x < 0.05 and y < 0.6)]   # fade final / 1º quadro
    for x, y in pretos: lin.append(f"⚠ quadro preto {x:.2f}–{y:.2f} s"); ok = False
    sil = re.findall(r"silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)", err)
    for x, y in sil:
        if float(x) < dur - 3: lin.append(f"⚠ silêncio {float(x):.1f}–{float(y):.1f} s")
    I = re.findall(r"I:\s+(-?[\d.]+) LUFS", err); tp = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)
    if I:
        lufs = float(I[-1]); pk = float(tp[-1]) if tp else None
        lin.append(f"som: {lufs:.1f} LUFS integrado · pico real {pk:.1f} dBTP" if pk is not None else f"som: {lufs:.1f} LUFS")
        if not -17.5 <= lufs <= -12.5: lin.append("⚠ volume fora de −14…−16 LUFS (referência YouTube)")
        if pk is not None and pk > -0.5: lin.append("⚠ pico acima de −0,5 dBTP (pode estourar)"); ok = False
    os.makedirs(SAIDA_REL, exist_ok=True)
    with open(os.path.join(SAIDA_REL, os.path.basename(arq) + ".txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lin) + "\n\n" + err[-6000:])
    return lin, ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", default="9222"); ap.add_argument("--passo", type=float, default=20); ap.add_argument("--max", type=float, default=7200)
    ap.add_argument("--so-conferir"); ap.add_argument("--perfil", action="store_true"); a = ap.parse_args()
    if a.so_conferir:
        lin, ok = conferir(a.so_conferir); print("\n".join(lin)); sys.exit(0 if ok else 1)
    from playwright.sync_api import sync_playwright
    t0, viu, marco, conferidos, falhou = time.time(), False, -10, set(), False
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
        pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url and x.evaluate("typeof VE==='object' && VE.ready"))
        ja_prontos = {i["id"] for i in pg.evaluate(ESTADO_JS)["itens"] if i["estado"] in ("pronto", "erro", "cancelado")}
        print(f"vigiando a porta {a.porta} (só lendo)…", flush=True)
        amostras = []
        while time.time() - t0 < a.max:
            e = pg.evaluate(ESTADO_JS)
            if a.perfil and e["rodando"]:
                # com limite: a ponte do pywebview pode demorar com o export ocupando o Python (travava a vigia inteira)
                try: hw = pg.evaluate("() => Promise.race([window.pywebview.api.ve_encoder_estado(), new Promise(r => setTimeout(() => r({}), 1500))])") or {}
                except Exception: hw = {}
                amostras.append({"t": round(time.time() - t0, 1), "fase": e["msg"], "pct": e["pct"], **{k: hw.get(k) for k in ("cpu", "gpu", "enc", "dec", "vram", "ram")}})
            if e["rodando"] and not viu: viu = True; print(time.strftime("%H:%M ") + f"começou: {e['timeline']} ({e['dur']:.1f} s)", flush=True)
            atual = next((i for i in e["itens"] if i["estado"] == "rodando"), None)
            pct = atual["pct"] if atual else int(re.sub(r"\D", "", e["pct"]) or 0)
            if e["rodando"] and pct >= marco + 10: marco = pct - pct % 10; print(time.strftime("%H:%M ") + f"{pct}% {e['msg'][:80]}", flush=True)
            for i in e["itens"]:
                if i["id"] in ja_prontos or i["id"] in conferidos or i["estado"] not in ("pronto", "erro", "cancelado"): continue
                conferidos.add(i["id"]); marco = -10
                if i["estado"] != "pronto": falhou = True; print(f"✗ {i['nome']}: {i['estado']} {i['erro'] or ''}", flush=True); continue
                t = i["tempo"] or 0; fx = i["faixa"] or e["dur"]
                print(f"✓ {i['nome'] or os.path.basename(i['saida'] or '')} em {int(t) // 60}:{int(t) % 60:02d} ({t / fx:.2f}× a duração)", flush=True)
                if i["saida"] and os.path.isfile(i["saida"]):
                    lin, ok = conferir(i["saida"], fx); falhou |= not ok; print("  " + "\n  ".join(lin), flush=True)
            if viu and not e["rodando"]:
                if not e["itens"] and e["ultimo"] and e["ultimo"] not in conferidos and os.path.isfile(e["ultimo"]):   # export simples (sem fila)
                    conferidos.add(e["ultimo"]); print("✓ " + os.path.basename(e["ultimo"]), flush=True)
                    lin, ok = conferir(e["ultimo"], e["dur"]); falhou |= not ok; print("  " + "\n  ".join(lin), flush=True)
                if "Falhou" in e["msg"] or "Cancelado" in e["msg"]: falhou = True; print("✗ " + e["msg"], flush=True)
                print("fim da vigia", flush=True); break
            time.sleep(a.passo)
        else:
            print("tempo máximo da vigia", flush=True)
    if a.perfil and amostras: perfil(amostras)
    sys.exit(1 if falhou else 0)


def perfil(am):
    """Resumo por fase (o texto da mensagem sem números): tempo e médias de CPU/placa/codificador/decodificador."""
    import csv
    os.makedirs(SAIDA_REL, exist_ok=True)
    arq = os.path.join(SAIDA_REL, time.strftime("perfil_%Y%m%d_%H%M.csv"))
    with open(arq, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(am[0].keys())); w.writeheader(); w.writerows(am)
    fases, ordem = {}, []
    for i, x in enumerate(am):
        k = re.sub(r"[\d.,%/]+|·.*$|falta.*$", "", x["fase"] or "").strip() or "?"
        dt = (am[i + 1]["t"] - x["t"]) if i + 1 < len(am) else 0
        if k not in fases: fases[k] = {"s": 0, "n": 0, **{c: 0.0 for c in ("cpu", "gpu", "enc", "dec")}}; ordem.append(k)
        f = fases[k]; f["s"] += dt; f["n"] += 1
        for c in ("cpu", "gpu", "enc", "dec"): f[c] += float(x.get(c) or 0)
    tot = sum(f["s"] for f in fases.values()) or 1
    print(f"perfil ({arq}):", flush=True)
    for k in ordem:
        f = fases[k]; n = f["n"] or 1
        print(f"  {k[:60]:60} {f['s'] / 60:5.1f} min ({100 * f['s'] / tot:3.0f}%) · CPU {f['cpu'] / n:3.0f}% placa {f['gpu'] / n:3.0f}% "
              f"cod {f['enc'] / n:3.0f}% dec {f['dec'] / n:3.0f}%", flush=True)


if __name__ == "__main__":
    main()
