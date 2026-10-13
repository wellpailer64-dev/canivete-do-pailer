"""
musicas.py — Biblioteca de músicas do KANIVETE (fundo de vinhetas, AutoFrame, edição).

Duas fontes, numa pasta só (escolhida em Preferências da biblioteca; padrão Música/Kanivete Músicas):
- o que a pessoa solta lá (ex.: baixado à mão da Biblioteca de Áudio do YouTube, que não tem acesso público);
- o que ela baixa pelo app do Openverse (api.openverse.org: músicas de licença livre — Jamendo, ccMixter, Freesound...),
  com o crédito do autor anotado no índice e em CREDITOS.txt (a maioria das licenças CC pede crédito).
Cada música é analisada uma vez (autoframe.analisar_musica: BPM, energia, refrão, drop — com cache) + brilho e tom
(maior/menor) para o CLIMA: calma, alegre, animada, intensa, melancólica. Índice em <pasta>/.kanivete_musicas.json.
"""
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request

EXT = (".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus")
CLIMAS = ("calma", "alegre", "animada", "intensa", "melancolica")
_lock = threading.Lock()
_analisando = threading.Lock()
_UA = "KANIVETE/1.0 (app de edicao local)"


def _cfg_path():
    from Functions.midia import raiz_dados
    return os.path.join(raiz_dados(), "musicas.json")


def pasta():
    try:
        with open(_cfg_path(), encoding="utf-8") as f:
            p = json.load(f).get("pasta")
        if p and os.path.isdir(p):
            return p
    except (OSError, ValueError):
        pass
    from Functions.midia import raiz_dados
    p = os.path.join(raiz_dados(), "Músicas")   # no disco do app (nunca na pasta do usuário do C)
    os.makedirs(p, exist_ok=True)
    return p


def definir_pasta(p):
    if not p or not os.path.isdir(p):
        return {"success": False, "error": "pasta não encontrada"}
    with open(_cfg_path(), "w", encoding="utf-8") as f:
        json.dump({"pasta": p}, f, ensure_ascii=False)
    return {"success": True, "pasta": p}


def _indice_path():
    return os.path.join(pasta(), ".kanivete_musicas.json")


def _ler():
    try:
        with open(_indice_path(), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _gravar(ind):
    p = _indice_path()
    with open(p + ".tmp", "w", encoding="utf-8") as f:
        json.dump(ind, f, ensure_ascii=False, indent=0)
    os.replace(p + ".tmp", p)


def _tags(path):
    """Título, artista e gênero das etiquetas do arquivo (ID3/Vorbis), quando houver."""
    out = {}
    try:
        import mutagen
        m = mutagen.File(path, easy=True)
        if m and m.tags:
            for k, alvo in (("title", "titulo"), ("artist", "artista"), ("genre", "genero")):
                v = m.tags.get(k)
                if v:
                    out[alvo] = str(v[0])[:80]
    except Exception:
        pass
    return out


def _clima(path, a):
    """Clima pela energia média, BPM, brilho (centroide) e modo (maior/menor pelo croma) de 40 s do meio."""
    import numpy as np
    en = float(np.mean(a.get("energia") or [0.4]))
    bpm = float(a.get("bpm") or 100)
    brilho, maior = 0.5, True
    try:
        import librosa
        meio = max(0.0, float(a.get("dur") or 60) / 2 - 20)
        y, sr = librosa.load(path, sr=22050, mono=True, offset=meio, duration=40)
        brilho = float(np.clip(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)) / 4000, 0, 1))
        ch = np.mean(librosa.feature.chroma_cqt(y=y, sr=sr), axis=1)
        maj = np.roll([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], 0)
        mnr = np.roll([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17], 0)
        cm = max(np.corrcoef(np.roll(maj, k), ch)[0, 1] for k in range(12))
        cn = max(np.corrcoef(np.roll(mnr, k), ch)[0, 1] for k in range(12))
        maior = bool(cm >= cn)
    except Exception:
        pass
    if en < 0.32 or (bpm < 85 and en < 0.45):
        c = "calma" if maior else "melancolica"
    elif en > 0.62 and bpm >= 110:
        c = "intensa"
    elif bpm >= 105 or en > 0.5:
        c = "animada" if maior or brilho > 0.45 else "intensa"
    else:
        c = "alegre" if maior else "melancolica"
    return c, round(en, 3), round(brilho, 3), maior


def _item(p, antigo=None):
    """Entrada do índice de uma música: análise (BPM, energia, refrão, drop) + clima + etiquetas do arquivo."""
    from Functions import autoframe
    a = autoframe.analisar_musica(p)
    clima, en, brilho, maior = _clima(p, a)
    item = dict(antigo or {})
    item.update({"dur": round(float(a.get("dur") or 0), 1), "bpm": round(float(a.get("bpm") or 0)), "energia": en,
                 "brilho": brilho, "maior": maior, "clima": clima, "mtime": int(os.path.getmtime(p)),
                 "refrao": (a.get("refrao") or {}).get("t"), "drop": a.get("drop")})
    for k, v in _tags(p).items():
        item.setdefault(k, v)
    item.setdefault("titulo", os.path.splitext(os.path.basename(p))[0])
    return item


# clima → busca em inglês no Openverse (o acervo é quase todo em inglês)
_BUSCA_CLIMA = {"calma": "calm acoustic", "alegre": "happy upbeat", "animada": "energetic upbeat pop",
                "intensa": "epic cinematic", "melancolica": "sad piano"}


def garantir(clima=None, dur_min=10, on=lambda pct, msg: None):
    """Uma música para o clima: da biblioteca; sem nenhuma que sirva, busca no Openverse (CC0/CC BY primeiro), baixa,
    analisa e devolve — a vinheta nunca fica sem fundo (com a biblioteca vazia ela caía no jingle de 3 s, 2026-10-13).
    None só sem internet e com a biblioteca vazia."""
    # climas vizinhos valem (o classificador é aproximado: uma música "alegre" às vezes sai "animada")
    viz = {"alegre": ("alegre", "animada"), "animada": ("animada", "alegre", "intensa"), "calma": ("calma", "melancolica", "alegre"),
           "intensa": ("intensa", "animada"), "melancolica": ("melancolica", "calma")}.get(clima or "", ())
    import random
    ok = [x for x in listar()["musicas"] if (x.get("dur") or 0) >= dur_min and (not viz or x.get("clima") in viz)]
    if ok:
        return random.choice(ok)
    m = escolher(clima, dur_min)
    tem = {(x.get("titulo") or "").lower() for x in _ler().values()}
    q = _BUSCA_CLIMA.get(clima or "", "happy upbeat")
    on(82, f"Buscando uma música ({q}) no Openverse...")
    for lic in ("cc0,pdm,by", "cc0,pdm,by,by-sa"):
        try:
            import urllib.parse
            params = {"q": q, "category": "music", "license": lic, "page_size": 12, "length": "medium"}
            req = urllib.request.Request("https://api.openverse.org/v1/audio/?" + urllib.parse.urlencode(params), headers={"User-Agent": _UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                res = json.loads(r.read().decode("utf-8")).get("results") or []
        except Exception:
            break
        for x in res:
            if not x.get("url") or (x.get("duration") or 0) / 1000 < dur_min or (x.get("title") or "").lower() in tem:
                continue   # já está na biblioteca (e não serviu): outra
            item = {"titulo": x.get("title") or "Sem título", "artista": x.get("creator") or "", "genero": ", ".join(x.get("genres") or []),
                    "licenca": x.get("license"), "licenca_nome": _LIC.get(x.get("license"), x.get("license")), "fonte": x.get("source"),
                    "url": x["url"], "pagina": x.get("foreign_landing_url") or "", "atribuicao": x.get("attribution") or ""}
            on(85, f"Baixando \"{item['titulo']}\"...")
            b = openverse_baixar(item)
            if not b.get("success"):
                continue
            try:
                rel = os.path.relpath(b["path"], pasta())
                with _lock:
                    ind = _ler()
                    ind[rel] = _item(b["path"], ind.get(rel, {}))
                    _gravar(ind)
                return {"path": b["path"], **ind[rel]}
            except Exception:
                continue
    return m


def analisar(on_progress=lambda d: None):
    """Analisa as músicas novas da pasta (em thread). on_progress({pct, msg}) / {fim, n}."""
    if not _analisando.acquire(blocking=False):
        return {"success": False, "error": "já está analisando"}

    def run():
        try:
            from Functions import autoframe
            base = pasta()
            arqs = [os.path.join(r, f) for r, _, fs in os.walk(base) for f in fs if f.lower().endswith(EXT)]
            with _lock:
                ind = _ler()
            novos = [p for p in arqs if os.path.relpath(p, base) not in ind
                     or ind[os.path.relpath(p, base)].get("mtime") != int(os.path.getmtime(p))]
            for i, p in enumerate(novos):
                rel = os.path.relpath(p, base)
                on_progress({"pct": int(100 * i / max(1, len(novos))), "msg": f"Analisando {i + 1}/{len(novos)}: {os.path.basename(p)}"})
                try:
                    ind[rel] = _item(p, ind.get(rel, {}))
                except Exception as e:
                    ind[rel] = {"erro": str(e)[:120], "mtime": int(os.path.getmtime(p)), "titulo": os.path.basename(p)}
                with _lock:
                    _gravar(ind)
            # arquivos apagados saem do índice
            vivos = {os.path.relpath(p, base) for p in arqs}
            with _lock:
                ind = {k: v for k, v in ind.items() if k in vivos}
                _gravar(ind)
            on_progress({"fim": True, "n": len(novos)})
        except Exception as e:
            on_progress({"erro": str(e)})
        finally:
            _analisando.release()

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def listar(filtros=None):
    """Músicas analisadas, filtradas por texto (título/artista/gênero), gênero, clima e duração mínima/máxima (s)."""
    f = filtros or {}
    base = pasta()
    with _lock:
        ind = _ler()
    txt = (f.get("texto") or "").lower().strip()
    out = []
    for rel, m in ind.items():
        if m.get("erro") or "dur" not in m or not os.path.isfile(os.path.join(base, rel)):
            continue
        if f.get("clima") and m.get("clima") != f["clima"]:
            continue
        if f.get("genero") and f["genero"].lower() not in (m.get("genero") or "").lower():
            continue
        if f.get("dur_min") and (m.get("dur") or 0) < float(f["dur_min"]):
            continue
        if f.get("dur_max") and (m.get("dur") or 0) > float(f["dur_max"]):
            continue
        if txt and txt not in " ".join(str(m.get(k) or "") for k in ("titulo", "artista", "genero", "clima")).lower():
            continue
        out.append({"path": os.path.join(base, rel), **m})
    out.sort(key=lambda m: (m.get("titulo") or "").lower())
    generos = sorted({g.strip().title() for m in ind.values() for g in re.split(r"[,/;]", m.get("genero") or "") if g.strip()})
    return {"success": True, "pasta": base, "musicas": out, "generos": generos,
            "total": sum(1 for m in ind.values() if not m.get("erro")), "pendentes": _pendentes(base, ind)}


def _pendentes(base, ind):
    try:
        return sum(1 for r, _, fs in os.walk(base) for f in fs if f.lower().endswith(EXT)
                   and os.path.relpath(os.path.join(r, f), base) not in ind)
    except OSError:
        return 0


def escolher(clima=None, dur_min=0):
    """A música da biblioteca que combina com o clima pedido (a mais longa que a duração, ao acaso entre as boas)."""
    import random
    ms = [m for m in listar({"clima": clima})["musicas"] if (m.get("dur") or 0) >= dur_min] if clima else []
    if not ms:
        ms = [m for m in listar()["musicas"] if (m.get("dur") or 0) >= dur_min and m.get("clima") in ("alegre", "animada")]
    if not ms:
        ms = [m for m in listar()["musicas"] if (m.get("dur") or 0) >= dur_min]
    return random.choice(ms) if ms else None


def clima_do_pedido(texto):
    t = (texto or "").lower()
    for c, rx in (("calma", r"calm|suave|tranquil|relax|delicad|leve|zen"), ("melancolica", r"triste|melanc|emocion|saudade|nost"),
                  ("intensa", r"intens|[eé]pic|tens[aã]o|forte|a[cç][aã]o|rock|trailer"), ("animada", r"animad|energ|agit|festa|dan[cç]|empolg|esport|futebol"),
                  ("alegre", r"alegr|feliz|divertid|infantil|crian[cç]|positiv|leve")):
        if re.search(rx, t):
            return c
    return None


# ─────────────────────────── Openverse ───────────────────────────
_LIC = {"cc0": "Domínio público (CC0)", "pdm": "Domínio público", "by": "CC BY (dar crédito)", "by-sa": "CC BY-SA (dar crédito)"}


def openverse_buscar(texto="", genero="", duracao="", pagina=1):
    """Músicas de licença livre que permitem uso comercial (CC0, BY, BY-SA). duracao: short (< 30 s) | medium | long."""
    q = " ".join(x for x in (texto, genero) if x).strip() or "music"
    params = {"q": q, "category": "music", "license": "cc0,pdm,by,by-sa", "page_size": 20, "page": int(pagina or 1)}
    if duracao in ("short", "medium", "long"):
        params["length"] = duracao
    try:
        req = urllib.request.Request("https://api.openverse.org/v1/audio/?" + urllib.parse.urlencode(params), headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=25) as r:
            d = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return {"success": False, "error": f"não consegui buscar no Openverse ({e})"}
    out = []
    for x in d.get("results") or []:
        if not x.get("url"):
            continue
        out.append({"id": x.get("id"), "titulo": x.get("title") or "Sem título", "artista": x.get("creator") or "",
                    "dur": round((x.get("duration") or 0) / 1000), "genero": ", ".join(x.get("genres") or []),
                    "licenca": x.get("license"), "licenca_nome": _LIC.get(x.get("license"), x.get("license")),
                    "fonte": x.get("source"), "url": x["url"], "pagina": x.get("foreign_landing_url") or "",
                    "atribuicao": x.get("attribution") or ""})
    return {"success": True, "resultados": out, "total": d.get("result_count", 0)}


def openverse_baixar(item):
    """Baixa para <pasta>/Openverse/ e anota título, artista, gênero, licença e crédito no índice e em CREDITOS.txt."""
    try:
        destino = os.path.join(pasta(), "Openverse")
        os.makedirs(destino, exist_ok=True)
        nome = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", f"{item.get('artista') or 'autor'} - {item.get('titulo') or 'musica'}")[:120].strip(" .")
        ext = ".mp3" if "format=mp3" in item["url"] or item["url"].lower().split("?")[0].endswith(".mp3") else \
            os.path.splitext(item["url"].split("?")[0])[1] or ".mp3"
        arq = os.path.join(destino, nome + ext)
        req = urllib.request.Request(item["url"], headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=120) as r, open(arq + ".part", "wb") as f:
            while True:
                b = r.read(1 << 16)
                if not b:
                    break
                f.write(b)
        os.replace(arq + ".part", arq)
        rel = os.path.relpath(arq, pasta())
        with _lock:
            ind = _ler()
            ind[rel] = {**ind.get(rel, {}), "titulo": item.get("titulo"), "artista": item.get("artista"), "genero": item.get("genero"),
                        "licenca": item.get("licenca_nome"), "credito": item.get("atribuicao"), "fonte": f"Openverse · {item.get('fonte')}",
                        "pagina": item.get("pagina"), "mtime": -1}
            _gravar(ind)
        with open(os.path.join(destino, "CREDITOS.txt"), "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d')} · {nome}{ext}\n  {item.get('atribuicao') or ''}\n  {item.get('pagina') or ''}\n\n")
        return {"success": True, "path": arq}
    except Exception as e:
        return {"success": False, "error": f"não consegui baixar ({e})"}
