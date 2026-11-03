"""Exporta uma timeline aberta para conferir e mede o resultado: taxa, LUFS, pico e quadros pretos.
    py -3.13 tools/agente/exportar_conferencia.py "Reels A" D:/kanivete_testes/x/render --nome teste_A [--porta 9333]
Não espera presa ao comando: dispara, acompanha e, se passar de --espera, diz que continua rodando (rodar de novo com --ver).
Comando longo: usar tarefas_soltas.py. Com muitas camadas de zoom com desfoque de movimento, 2:30 levou ~18 min.
"""
import argparse
import os
import re
import subprocess
import time

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("timeline")
ap.add_argument("pasta")
ap.add_argument("--nome", default="conferencia")
ap.add_argument("--porta", type=int, default=9333)
ap.add_argument("--espera", type=int, default=1800)
ap.add_argument("--ver", action="store_true", help="não exporta: só acompanha a exportação em andamento")
a = ap.parse_args()

DISPARA = """async ([nomeTl, pasta, nome]) => {
  const q = VE.sequences.find(s => s.name === nomeTl); if (!q) throw new Error('timeline não achada');
  if (VE.activeSequence !== q.id) veSeqAplicar(q);
  window.__ecFim = null;
  if (!window.__ecHook) { const o = window.veOnExport; window.__ecHook = 1;
    window.veOnExport = ev => { let e = ev; if (typeof e === 'string') { try { e = JSON.parse(e); } catch (x) {} } if (e && e.done) window.__ecFim = e; if (o) o(ev); }; }
  if (typeof veCompProntas === 'function') await veCompProntas(() => {});
  if (typeof veOvtProntas === 'function') await veOvtProntas(null, null, true);
  VE._txPng = null;
  if (VE.clips.some(veTxPrecisa)) await veMoNoTamanho('original', () => veTxPngs());
  const p = veExportPlan(true), lim = veMasterLim();
  window.pywebview.api.video_cutter_export(VE.path, p.base, 'mp4', 'medium', 'original', true, pasta, false, p.camadas, p.audio, p.dur,
    lim ? [...p.mix, { master: lim }] : p.mix, veTxExport(p.faixa), [VE.seqW, VE.seqH], { nome, blocos: false });
}"""

os.makedirs(a.pasta, exist_ok=True)   # sem a pasta o ffmpeg só diz "Error opening output", que parece codec
with sync_playwright() as pw:
    nav = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
    pg = [p for c in nav.contexts for p in c.pages if "index.html" in p.url][0]
    pg.set_default_timeout(0)
    if not a.ver:
        pg.evaluate(DISPARA, [a.timeline, a.pasta, a.nome])
    t0 = time.time()
    fim = None
    while time.time() - t0 < a.espera and not fim:
        pg.wait_for_timeout(5000)
        fim = pg.evaluate("window.__ecFim")
    nav.close()
if not fim:
    raise SystemExit(f"continua exportando depois de {a.espera} s; acompanhe com --ver")
if not fim.get("success"):
    raise SystemExit(f"exportação falhou: {fim.get('error')}")
arq = fim["output_path"]
print(arq, "| pela placa" if fim.get("placa") else "| pela CPU")
sonda = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=r_frame_rate,width,height:format=duration", "-of", "csv=p=0", arq], capture_output=True, text=True).stdout
print("vídeo:", " ".join(sonda.split()))
som = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", arq, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
print("som:", " ".join(re.findall(r"^\s+(?:I|Peak):\s+\S+ \S+", som, re.M)[-2:]), "(alvo -14 a -16 LUFS, pico até -1)")
pretos = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", arq, "-vf", "blackdetect=d=0.04:pix_th=0.04", "-an", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
print("quadros pretos:", pretos.count("black_start"))
