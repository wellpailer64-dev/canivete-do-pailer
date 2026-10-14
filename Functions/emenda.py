"""Corrigir um trecho de um vídeo já exportado sem exportar tudo de novo (GaIA 2026-10-14: foto do Jhordano preta em 6 s
de um vídeo de 8:49 — a emenda levou 2 min em vez de 31).

O trecho é trocado entre dois QUADROS-CHAVE do vídeo pronto: [k1, k2). Fora dele é cópia exata (sem recodificar) e o
som do vídeo pronto fica intacto. Receita (medida no GaIA):
  - parte A: os k1×fps primeiros quadros com -frames:v (com -t vinham 3 quadros a mais por causa dos quadros B);
  - trecho novo: exportado pelo app com as MESMAS configurações, sem áudio, e remuxado com a mesma escala de tempo do
    original (-video_track_timescale; com outra escala os 362 quadros caíam todos num instante só);
  - parte C: -ss k2 cópia; concat; áudio do original copiado; confere a contagem de quadros e decodifica a região.
"""
import json
import os
import subprocess

from Functions.audio_cutter import ffmpeg_path, ffprobe_path, _creationflags


def _rodar(args, timeout=900):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
                          creationflags=_creationflags())


def _info(arq):
    r = _rodar([ffprobe_path(), "-v", "error", "-select_streams", "v:0", "-show_entries",
                "stream=codec_name,time_base,r_frame_rate,nb_frames:format=duration", "-of", "json", arq], 60)
    d = json.loads(r.stdout or "{}")
    s = (d.get("streams") or [{}])[0]
    num, den = (s.get("r_frame_rate") or "30/1").split("/")
    tb = (s.get("time_base") or "1/90000").split("/")
    return {"codec": s.get("codec_name"), "fps": float(num) / float(den or 1), "escala": int(tb[1]) if len(tb) == 2 else 90000,
            "quadros": int(s["nb_frames"]) if str(s.get("nb_frames", "")).isdigit() else None,
            "dur": float((d.get("format") or {}).get("duration") or 0)}


def pontos(arquivo, a, b):
    """Quadros-chave do vídeo pronto em volta de [a, b]: k1 ≤ a e k2 ≥ b (k2 = fim se não houver)."""
    a, b = float(a), float(b)
    if not os.path.isfile(arquivo):
        return {"success": False, "error": "vídeo pronto não encontrado"}
    inf = _info(arquivo)
    r = _rodar([ffprobe_path(), "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries",
                "frame=pts_time", "-of", "csv=p=0", "-read_intervals", f"{max(0, a - 60):.3f}%{b + 60:.3f}", arquivo], 120)
    ks = sorted({round(float(x), 6) for x in r.stdout.split() if x.strip() and x.strip() != "N/A"})
    antes = [k for k in ks if k <= a + 1e-3]
    depois = [k for k in ks if k >= b - 1e-3]
    if not antes:
        return {"success": False, "error": "não achou quadro-chave antes do trecho"}
    k1 = antes[-1]
    k2 = depois[0] if depois else inf["dur"]
    return {"success": True, "k1": k1, "k2": k2, "fim": not depois, "fps": inf["fps"], "dur": inf["dur"]}


def emendar(original, trecho, k1, k2, saida=None, pasta_tmp=None):
    """Troca [k1, k2) do 'original' pelo 'trecho' (vídeo sem áudio exportado de k1 a k2). Devolve o arquivo novo."""
    inf = _info(original)
    fps, escala = inf["fps"], inf["escala"]
    base, ext = os.path.splitext(original)
    saida = saida or f"{base} (corrigido){ext}"
    tmp = pasta_tmp or os.path.join(os.path.dirname(saida), ".emenda_kanivete")
    os.makedirs(tmp, exist_ok=True)
    pa, pb, pc, lista = (os.path.join(tmp, n) for n in ("a.mp4", "b.mp4", "c.mp4", "lista.txt"))
    n1 = int(round(float(k1) * fps))
    passos = []
    try:
        if n1 > 0:
            passos.append(_rodar([ffmpeg_path(), "-v", "error", "-y", "-i", original, "-map", "0:v", "-c", "copy", "-frames:v", str(n1), pa]))
        passos.append(_rodar([ffmpeg_path(), "-v", "error", "-y", "-i", trecho, "-map", "0:v", "-c", "copy",
                              "-video_track_timescale", str(escala), pb]))
        fim = float(k2) >= inf["dur"] - 0.5 / fps
        if not fim:
            passos.append(_rodar([ffmpeg_path(), "-v", "error", "-y", "-ss", f"{float(k2):.6f}", "-i", original, "-map", "0:v",
                                  "-c", "copy", pc]))
        ruins = [p for p in passos if p.returncode != 0]
        if ruins:
            return {"success": False, "error": "corte: " + ruins[0].stderr.strip()[-300:]}
        with open(lista, "w", encoding="utf-8") as f:
            for p in ([pa] if n1 > 0 else []) + [pb] + ([] if fim else [pc]):
                f.write("file '" + p.replace("\\", "/").replace("'", "'\\''") + "'\n")
        r = _rodar([ffmpeg_path(), "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lista, "-i", original,
                    "-map", "0:v", "-map", "1:a?", "-c", "copy", "-movflags", "+faststart", saida])
        if r.returncode != 0:
            return {"success": False, "error": "emenda: " + r.stderr.strip()[-300:]}
        # conferência: mesma quantidade de quadros (sincronia com o som) e a região da emenda decodifica sem erro
        cont = lambda arq: _rodar([ffprobe_path(), "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries",
                                   "stream=nb_read_packets", "-of", "csv=p=0", arq], 300).stdout.strip()
        q_orig, q_novo = cont(original), cont(saida)
        dec = _rodar([ffmpeg_path(), "-v", "error", "-ss", f"{max(0.0, float(k1) - 1):.3f}", "-i", saida, "-t",
                      f"{float(k2) - float(k1) + 2:.3f}", "-an", "-f", "null", "-"], 600)
        ok = q_orig == q_novo and not dec.stderr.strip()
        return {"success": ok, "path": saida, "quadros": [q_orig, q_novo],
                "error": None if ok else (f"quadros {q_orig} → {q_novo}" if q_orig != q_novo else "erro ao decodificar: " + dec.stderr.strip()[-200:])}
    finally:
        for p in (pa, pb, pc, lista):
            try:
                os.remove(p)
            except OSError:
                pass
        try:
            os.rmdir(tmp)
        except OSError:
            pass
