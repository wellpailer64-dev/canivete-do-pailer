"""
blender_render.py — render fotorrealista dos objetos 3D do Vetor Kanivete (girar_3d / extrudar_3d) no Blender (Cycles).

Blender 4.5 LTS portátil oficial (GPL, programa à parte: NÃO vai no build) baixado sob demanda para
<app>/modelos_ia/blender/ e rodado sem janela: `blender -b --factory-startup -P blender_cena.py -- cena.json`.
A cena (geometria, rótulos já rasterizados pelo Vetor, materiais, câmera, luz) é montada pelo JS (vetor-blender.js) e
lida por Functions/blender_cena.py dentro do Python do Blender. Saída: PNG com transparência (chão = só sombra).
Um modelo pesado por vez na placa: antes de renderizar, o gerador de imagem e o Ollama saem da VRAM.
"""
import json, os, re, shutil, subprocess, threading, time, urllib.request, zipfile

from Functions.midia import NO_WINDOW, app_dir

VERSAO = "4.5.14"
URL = f"https://download.blender.org/release/Blender4.5/blender-{VERSAO}-windows-x64.zip"
TAMANHO = 398_661_046
_baixando = threading.Lock()
_estado = {"pct": 0, "msg": ""}
_proc = {"p": None}


def pasta():
    return os.path.join(app_dir(), "modelos_ia", "blender")


def exe():
    achados = [os.path.join(r, "blender.exe") for r, _, fs in os.walk(pasta()) if "blender.exe" in fs] if os.path.isdir(pasta()) else []
    return sorted(achados, key=len)[0] if achados else None


def instalado():
    return bool(exe())


def estado():
    return {"success": True, "instalado": instalado(), "baixando": _baixando.locked(), **_estado, "versao": VERSAO,
            "tamanho_gb": round(TAMANHO / 1e9, 2), "pasta": pasta()}


def instalar(on_progress=lambda d: None, esperar=False):
    """Baixa (com retomada) e extrai o Blender portátil. esperar=True bloqueia até terminar."""
    if instalado():
        return {"success": True, "ja": True}
    if not _baixando.acquire(blocking=False):
        return {"success": False, "error": "já está baixando"}
    fim = {}

    def run():
        try:
            os.makedirs(pasta(), exist_ok=True)
            zp = os.path.join(pasta(), os.path.basename(URL)); parte = zp + ".part"
            feito = os.path.getsize(parte) if os.path.exists(parte) else 0
            req = urllib.request.Request(URL, headers={"User-Agent": "CaniveteDoPailer", **({"Range": f"bytes={feito}-"} if feito else {})})
            with urllib.request.urlopen(req, timeout=60) as r:
                if feito and r.status != 206: feito = 0
                with open(parte, "ab" if feito else "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b: break
                        f.write(b); feito += len(b)
                        _estado.update(pct=min(95, int(feito * 95 / TAMANHO)), msg=f"Baixando o Blender {VERSAO}: {feito / 1e6:.0f} / {TAMANHO / 1e6:.0f} MB")
                        on_progress(dict(_estado))
            os.replace(parte, zp)
            _estado.update(pct=96, msg="Extraindo o Blender..."); on_progress(dict(_estado))
            from Functions.gerador_imagem import extrair_zip
            extrair_zip(zp, pasta())
            os.remove(zp)
            if not instalado(): raise RuntimeError("blender.exe não apareceu depois de extrair")
            _estado.update(pct=100, msg="Pronto"); on_progress({"fim": True}); fim["ok"] = True
        except Exception as e:
            _estado.update(msg=f"Erro: {e}"); on_progress({"erro": str(e)}); fim["erro"] = str(e)
        finally:
            _baixando.release()

    t = threading.Thread(target=run, daemon=True); t.start()
    if esperar:
        t.join(); return {"success": "ok" in fim, **({"error": fim["erro"]} if "erro" in fim else {})}
    return {"success": True}


def _liberar_gpu():
    try:
        from Functions import gerador_imagem
        gerador_imagem.parar(); gerador_imagem._liberar_gpu_ollama()
    except Exception:
        pass


def render(cena, on_progress=lambda d: None):
    """cena (dict montado pelo Vetor) → {success, path, segundos, log}. Salva cena.json ao lado da saída."""
    b = exe()
    if not b:
        return {"success": False, "error": "Blender não instalado", "instalar": True}
    saida = cena["saida"]; os.makedirs(os.path.dirname(saida), exist_ok=True)
    jp = os.path.splitext(saida)[0] + ".cena.json"
    json.dump(cena, open(jp, "w", encoding="utf-8"))
    _liberar_gpu()
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender_cena.py")
    t0, log = time.time(), []
    p = subprocess.Popen([b, "-b", "--factory-startup", "-noaudio", "-P", script, "--", jp], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    _proc["p"] = p
    for linha in iter(p.stdout.readline, ""):
        linha = linha.rstrip()
        if not linha: continue
        log = (log + [linha])[-80:]
        m = re.search(r"Sample (\d+)/(\d+)", linha)
        if m: on_progress({"pct": int(int(m.group(1)) * 100 / int(m.group(2))), "msg": f"Renderizando no Blender... amostra {m.group(1)}/{m.group(2)}"})
        elif "KANIVETE:" in linha: on_progress({"pct": 2, "msg": linha.split("KANIVETE:", 1)[1].strip()})
    p.wait(); _proc["p"] = None
    if p.returncode != 0 or not os.path.isfile(saida):
        return {"success": False, "error": "o Blender não gerou a imagem", "log": [l for l in log if "Error" in l or "Traceback" in l or "KANIVETE" in l][-8:] or log[-8:]}
    if cena.get("fundo") is None:
        _esmaecer_bordas(saida)
    return {"success": True, "path": saida, "segundos": round(time.time() - t0, 1), "cena": jp}


def _esmaecer_bordas(caminho, frac=0.08):
    """A sombra no chão pode chegar à borda do quadro: o alfa vai a zero suavemente perto das bordas (sem linha reta)."""
    try:
        from PIL import Image, ImageChops
        im = Image.open(caminho).convert("RGBA"); w, h = im.size; m = max(1, int(min(w, h) * frac))
        g = Image.new("L", (w, h), 255); px = g.load()
        for x in range(w):
            for y in (*range(m), *range(h - m, h)):
                d = min(x, w - 1 - x, y, h - 1 - y); px[x, y] = int(255 * min(1, d / m) ** 1.5)
        for y in range(m, h - m):
            for x in (*range(m), *range(w - m, w)):
                d = min(x, w - 1 - x); px[x, y] = int(255 * min(1, d / m) ** 1.5)
        im.putalpha(ImageChops.multiply(im.getchannel("A"), g)); im.save(caminho)
    except Exception:
        pass


def cancelar():
    p = _proc["p"]
    if p and p.poll() is None: p.kill()
    return {"success": True}


def remover():
    cancelar(); shutil.rmtree(pasta(), ignore_errors=True); return {"success": True}


# ── foto de estúdio (Functions/blender_estudio.py): embalagens com material de verdade, cenário, softboxes ──
HDRI_PADRAO = "D:/kanivete_biblioteca/hdri/studio_small_09_2k.hdr"


PROGRESSO = {"feito": 0, "total": 0}
_VIDEO = {"p": None, "parar": False}   # render de vídeo em andamento: o Parar da fila do Ke encerra (cancelar_video)


def cancelar_video():
    """Parar da fila do Kanivete Encoder: encerra o Blender do vídeo; estudio_video apaga os quadros e volta cancelado."""
    _VIDEO["parar"] = True
    p = _VIDEO["p"]
    if p is not None and p.poll() is None:
        p.kill()
    return {"success": True}


def estudio_video(spec):
    """vídeo da cena (spec com 'quadros': matrizes por quadro) → {success, path, segundos, cache}. Blender renderiza os
    quadros (EEVEE por padrão, ~1–2 s cada; Cycles se spec['motor'] == 'cycles'); o ffmpeg junta: MP4 H.264 com fundo,
    MOV ProRes 4444 com alfa quando o fundo é transparente. Progresso em PROGRESSO (ve_3d_estudio_progresso)."""
    import glob, hashlib, shutil
    b = exe()
    if not b:
        return {"success": False, "error": "Blender não instalado", "precisa_blender": True}
    saida = spec.get("saida") or os.path.join(pasta(), "..", "estudio")
    os.makedirs(saida, exist_ok=True)
    if not spec.get("hdri") and os.path.exists(HDRI_PADRAO):
        spec["hdri"] = HDRI_PADRAO
    spec.setdefault("motor", "eevee")
    chave = hashlib.sha1(json.dumps({k: v for k, v in spec.items() if k not in ("saida", "nome")}, sort_keys=True).encode()).hexdigest()[:12]
    nome = f"{spec.get('nome') or 'video'}_{chave}"
    alfa = not spec.get("cenario", True)
    destino = os.path.join(saida, nome + (".mov" if alfa else ".mp4"))
    if os.path.exists(destino):
        return {"success": True, "path": destino, "segundos": 0, "cache": True}
    spec = {**spec, "saida": saida.replace("\\", "/"), "nome": nome}
    jp = os.path.join(saida, nome + ".json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False)
    _liberar_gpu()
    t = time.time(); PROGRESSO.update(feito=0, total=len(spec["quadros"]))
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender_estudio.py")
    _VIDEO["parar"] = False
    p = subprocess.Popen([b, "-b", "--factory-startup", "-noaudio", "-P", script, "--", jp], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    _VIDEO["p"] = p
    log = []
    try:
        for linha in p.stdout:
            log.append(linha); log[:] = log[-60:]
            m = re.match(r"KANIVETE: quadro (\d+)/(\d+)", linha)
            if m: PROGRESSO.update(feito=int(m.group(1)), total=int(m.group(2)))
        p.wait()
    finally:
        _VIDEO["p"] = None
    pasta_q = os.path.join(saida, nome + "_quadros")
    if _VIDEO["parar"]:   # parado pela fila: nada pela metade fica na pasta
        shutil.rmtree(pasta_q, ignore_errors=True)
        try:
            os.remove(jp)
        except OSError:
            pass
        return {"success": False, "cancelled": True, "error": "parado"}
    if not glob.glob(os.path.join(pasta_q, "q_*.png")):
        return {"success": False, "error": "o Blender não renderizou os quadros", "log": "".join(log)[-1500:]}
    from Functions.convertermp3 import ffmpeg_path
    fps = float(spec.get("fps") or 30)
    cmd = [ffmpeg_path(), "-y", "-framerate", f"{fps:g}", "-i", os.path.join(pasta_q, "q_%05d.png")]
    cmd += (["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"] if alfa else ["-c:v", "libx264", "-crf", "15", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])
    r = subprocess.run(cmd + [destino], capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
    if r.returncode != 0 or not os.path.exists(destino):
        return {"success": False, "error": "o ffmpeg não juntou os quadros", "log": (r.stderr or "")[-1500:]}
    if not spec.get("manter_quadros"):
        shutil.rmtree(pasta_q, ignore_errors=True)
    return {"success": True, "path": destino, "segundos": round(time.time() - t, 1), "cache": False, "quadros": PROGRESSO["total"]}


def estudio(spec):
    """spec (montado pela Cena 3D ou pelo agente) → {success, path, segundos, cache}. A mesma cena não renderiza duas
    vezes: o nome do arquivo é o hash do spec (sem a pasta)."""
    import hashlib
    b = exe()
    if not b:
        return {"success": False, "error": "Blender não instalado", "precisa_blender": True}
    saida = spec.get("saida") or os.path.join(pasta(), "..", "estudio")
    os.makedirs(saida, exist_ok=True)
    if not spec.get("hdri") and os.path.exists(HDRI_PADRAO):
        spec["hdri"] = HDRI_PADRAO
    chave = hashlib.sha1(json.dumps({k: v for k, v in spec.items() if k not in ("saida", "nome")}, sort_keys=True).encode()).hexdigest()[:12]
    nome = f"{spec.get('nome') or 'estudio'}_{chave}"
    destino = os.path.join(saida, nome + ".png")
    if os.path.exists(destino):
        return {"success": True, "path": destino, "segundos": 0, "cache": True}
    spec = {**spec, "saida": saida.replace("\\", "/"), "nome": nome}
    jp = os.path.join(saida, nome + ".json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False)
    _liberar_gpu()
    t = time.time()
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender_estudio.py")
    r = subprocess.run([b, "-b", "--factory-startup", "-noaudio", "-P", script, "--", jp], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL, creationflags=NO_WINDOW)
    if "KANIVETE: estudio pronto" not in (r.stdout or "") or not os.path.exists(destino):
        return {"success": False, "error": "o Blender não terminou a foto", "log": ((r.stdout or "") + (r.stderr or ""))[-1500:]}
    return {"success": True, "path": destino, "segundos": round(time.time() - t, 1), "cache": False}
