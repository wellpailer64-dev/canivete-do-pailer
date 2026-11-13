"""Acha cada tomada da câmera dentro das lapelas (gravador de áudio à parte).

    py -3.13 tools/agente/sincronizar_lapela.py --videos "PASTA_BRUTO" --lapelas "PASTA_BRUTO/LAPELA" [--json saida.json]

Para cada vídeo: qual lapela tem o som dele e onde (atraso = segundo da lapela que corresponde ao início do vídeo).
Mesmo motor do "Sincronizar com lapela" do Editor (Functions/sincronizar.py: localizar_lapela).
"""
import argparse, json, os, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ)
from Functions import sincronizar  # noqa: E402
from Functions.audio_cutter import ffmpeg_path  # noqa: E402

EXT_V = (".mov", ".mp4", ".m4v", ".mkv", ".avi", ".mts")
EXT_A = EXT_V + (".wav", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac")


def arquivos(alvo, ext):
    if os.path.isdir(alvo):
        return sorted(os.path.join(alvo, f) for f in os.listdir(alvo) if f.lower().endswith(ext))
    return [alvo] if os.path.isfile(alvo) else []


def duracao(p):
    ffprobe = os.path.join(os.path.dirname(ffmpeg_path()), "ffprobe.exe")
    if not os.path.exists(ffprobe):
        ffprobe = "ffprobe"
    r = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                       capture_output=True, text=True, timeout=60)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", required=True, help="pasta ou arquivo das tomadas da câmera")
    ap.add_argument("--lapelas", required=True, help="pasta ou arquivo(s) de lapela")
    ap.add_argument("--json", default="", help="salvar o resultado em JSON")
    a = ap.parse_args()
    lap = arquivos(a.lapelas, EXT_A)
    lap_set = {os.path.normcase(os.path.abspath(p)) for p in lap}
    vids = [p for p in arquivos(a.videos, EXT_V) if os.path.normcase(os.path.abspath(p)) not in lap_set]
    if not lap or not vids:
        sys.exit("faltam vídeos ou lapelas")
    out = []
    for v in vids:
        d = duracao(v)
        r = sincronizar.localizar_lapela(v, 0, d, lap)
        item = {"video": os.path.basename(v), "dur": round(d, 2)}
        if r.get("success"):
            item.update(lapela=os.path.basename(lap[r["indice"]]), atraso=r["atraso"], confianca=r["confianca"],
                        destaque=r["destaque"], ok=r["ok"])
            marca = "OK " if r["ok"] else "?? "
            print(f"{marca}{item['video']:<16} {d:7.1f}s -> {item['lapela']} @ {r['atraso']:8.3f}s "
                  f"(conf {r['confianca']:.2f}, destaque {r['destaque']:.0f})", flush=True)
        else:
            item.update(erro=r.get("error"), ok=False)
            print(f"-- {item['video']:<16} {d:7.1f}s  {r.get('error')}", flush=True)
        out.append(item)
    if a.json:
        with open(a.json, "w", encoding="utf8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"{sum(1 for x in out if x.get('ok'))}/{len(out)} tomadas achadas na lapela")


if __name__ == "__main__":
    main()
