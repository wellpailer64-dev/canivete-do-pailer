"""
Monta o pack "vanilla" do Soundboard do Pocket Editor (não roda no app; só para gerar o zip do release).

Fontes (todas CC0, redistribuíveis):
  - Kenney.nl (packs de áudio, CC0)
  - Freesound.org, só sons com licença Creative Commons 0 (prévia HQ em OGG)

Tratamento: corta o silêncio do começo e do fim, nivela o volume (média ~-20 dB, pico <= -1 dBFS),
fade curto nas pontas e grava em Opus (.ogg, 48 kHz; 128 kbps estéreo / 96 kbps mono — transparente para efeitos).

Uso:  python tools/montar_soundboard.py <pasta_de_trabalho>
Saída: <pasta>/soundboard/ (catalogo.json + pastas por categoria) e <pasta>/soundboard-vN.zip
"""
import glob
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import zipfile

VERSAO = 1
UA = {"User-Agent": "Mozilla/5.0 (CaniveteDoPailer soundboard builder)"}

KENNEY = ["interface-sounds", "ui-audio", "impact-sounds", "digital-audio", "casino-audio", "rpg-audio",
          "sci-fi-sounds", "music-jingles", "voiceover-pack", "ui-pack"]

# categoria: (nome, faixa de duração no Freesound, [(busca, quantos, nome_base[, regex de títulos a evitar])], [(glob kenney, quantos, nome_base)])
CATEGORIAS = [
    ("whoosh", "Whoosh e Transição", (0.2, 3.5), [
        ("whoosh", 10, "whoosh"), ("swoosh", 8, "swoosh"), ("swish", 6, "swish"), ("whoosh transition", 6, "whoosh_transicao"), ("cinematic woosh", 6, "whoosh_cinematico"),
    ], []),
    ("riser", "Riser e Tensão", (1.0, 9.0), [
        ("riser", 10, "riser"), ("uplifter", 6, "uplifter"), ("reverse cymbal", 6, "prato_reverso"), ("downlifter", 5, "downlifter"),
    ], []),
    ("impacto", "Impacto e Boom", (0.2, 6.0), [
        ("boom impact", 8, "boom", r"woosh|whoosh|riser"), ("cinematic hit", 8, "riser_hit"), ("bass drop", 5, "bass_drop"),
    ], [
        ("impact-sounds/**/impactPunch_heavy*", 2, "soco_forte"), ("impact-sounds/**/impactPunch_medium*", 2, "soco"),
        ("impact-sounds/**/impactBell_heavy*", 2, "sino_impacto"), ("impact-sounds/**/impactMetal_heavy*", 1, "metal_impacto"),
        ("impact-sounds/**/impactWood_heavy*", 1, "madeira_impacto"), ("sci-fi-sounds/**/lowFrequency_explosion*", 2, "explosao_grave"),
        ("sci-fi-sounds/**/explosionCrunch*", 2, "explosao"),
    ]),
    ("pop", "Pop e Clique", (0.03, 1.5), [
        ("pop", 8, "pop"), ("bubble pop", 5, "bolha"), ("mouth pop", 5, "pop_boca"),
    ], [
        ("interface-sounds/**/click_*", 3, "clique"), ("interface-sounds/**/drop_*", 2, "drop"), ("interface-sounds/**/pluck_*", 2, "pluck"),
        ("interface-sounds/**/select_*", 2, "selecao"), ("interface-sounds/**/tick_*", 2, "tique"), ("interface-sounds/**/toggle_*", 2, "toggle"),
        ("ui-pack/**/tap-*", 2, "toque"), ("ui-pack/**/click-*", 2, "clique_suave"), ("ui-audio/**/rollover*", 2, "rollover"),
    ]),
    ("notificacao", "Notificação e Interface", (0.1, 3.0), [
        ("notification", 8, "notificacao"), ("ding", 6, "ding"), ("bell ding", 4, "sino_ding"), ("success sound", 4, "sucesso"),
    ], [
        ("interface-sounds/**/confirmation_*", 4, "confirmacao"), ("interface-sounds/**/error_*", 3, "erro"),
        ("interface-sounds/**/question_*", 2, "pergunta"), ("interface-sounds/**/bong_*", 1, "bong"), ("interface-sounds/**/glass_*", 3, "vidro"),
    ]),
    ("dinheiro", "Dinheiro e Moedas", (0.2, 4.0), [
        ("cash register", 6, "caixa_registradora", r"beep"), ("coins", 6, "moedas"), ("coin collect", 4, "moeda"),
    ], [
        ("rpg-audio/**/handleCoins*", 2, "moedas_mao"), ("casino-audio/**/chips-stack*", 2, "fichas"), ("casino-audio/**/chips-collide*", 2, "fichas_batendo"),
    ]),
    ("glitch", "Glitch e Digital", (0.1, 3.0), [
        ("glitch", 10, "glitch"), ("digital glitch", 5, "glitch_digital"),
    ], [
        ("interface-sounds/**/glitch_*", 4, "glitch_ui"), ("digital-audio/**/zap*", 2, "zap"), ("digital-audio/**/phaserUp*", 2, "phaser_sobe"),
        ("digital-audio/**/phaserDown*", 2, "phaser_desce"), ("digital-audio/**/powerUp*", 4, "power_up"), ("sci-fi-sounds/**/laserRetro*", 2, "laser_retro"),
        ("sci-fi-sounds/**/computerNoise*", 2, "computador"),
    ]),
    ("cartoon", "Cartoon e Comédia", (0.1, 4.0), [
        ("boing", 6, "boing"), ("slide whistle", 5, "apito_slide"), ("cartoon", 8, "cartoon", r"monster|laugh|SVNHT|[^\x00-\x7f]"), ("bike horn", 4, "buzina_palhaco"),
        ("rimshot", 3, "ba_dum_tss"),
    ], []),
    ("reacoes", "Reações e Plateia", (0.5, 8.0), [
        ("laugh", 6, "risada", r"joker|witch|evil|monster|villain"), ("audience laugh", 5, "plateia_rindo"), ("applause", 5, "aplausos"), ("crowd wow", 4, "plateia_uau"),
        ("gasp", 3, "susto"), ("cheer", 4, "torcida"), ("crickets", 2, "grilos"),
    ], []),
    ("objetos", "Câmera e Objetos", (0.1, 4.0), [
        ("camera shutter", 6, "camera_foto"), ("typing keyboard", 5, "digitando"), ("page turn", 3, "pagina"), ("paper", 3, "papel"),
    ], [
        ("rpg-audio/**/bookFlip*", 2, "livro_folha"), ("rpg-audio/**/doorOpen*", 1, "porta_abrindo"), ("rpg-audio/**/doorClose*", 1, "porta_fechando"),
        ("casino-audio/**/card-slide*", 2, "carta"), ("casino-audio/**/dice-throw*", 1, "dados"), ("rpg-audio/**/metalLatch*", 1, "trava_metal"),
    ]),
    ("jingles", "Vinhetas e Jingles", None, [], [
        ("music-jingles/**/jingles_HIT*", 4, "jingle_hit"), ("music-jingles/**/jingles_NES*", 4, "jingle_8bit"),
        ("music-jingles/**/jingles_PIZZI*", 4, "jingle_pizzicato"), ("music-jingles/**/jingles_SAX*", 4, "jingle_sax"),
        ("music-jingles/**/jingles_STEEL*", 4, "jingle_steel"),
    ]),
    ("vozes", "Vozes (inglês)", None, [], [
        (f"voiceover-pack/{g}/{w}*", 1, f"voz_{w}_{'fem' if g == 'Female' else 'masc'}")
        for w in ("go", "ready", "set", "congratulations", "game_over", "you_win", "you_lose", "level_up", "correct", "wrong",
                  "new_highscore", "hurry_up", "mission_completed")
        for g in ("Female", "Male")
    ]),
]


# nome mostrado no painel (o arquivo fica sem acento); o que não está aqui vira "Base 01"
ROTULOS = {
    "whoosh_transicao": "Transição", "whoosh_cinematico": "Cinemático", "prato_reverso": "Prato reverso",
    "riser_hit": "Riser + hit", "explosao_grave": "Explosão grave", "explosao": "Explosão", "sino_impacto": "Sino impacto",
    "metal_impacto": "Metal impacto", "madeira_impacto": "Madeira impacto", "soco_forte": "Soco forte", "pop_boca": "Pop de boca",
    "selecao": "Seleção", "tique": "Tique", "clique_suave": "Clique suave", "notificacao": "Notificação", "sino_ding": "Sino",
    "confirmacao": "Confirmação", "caixa_registradora": "Caixa registradora", "moedas_mao": "Moedas na mão",
    "fichas_batendo": "Fichas batendo", "glitch_ui": "Glitch UI", "phaser_sobe": "Phaser sobe", "phaser_desce": "Phaser desce",
    "power_up": "Power-up", "laser_retro": "Laser retrô", "apito_slide": "Apito de slide", "buzina_palhaco": "Buzina de palhaço",
    "ba_dum_tss": "Ba dum tss", "plateia_rindo": "Plateia rindo", "plateia_uau": "Plateia uau", "camera_foto": "Câmera (foto)",
    "pagina": "Página", "livro_folha": "Folha de livro", "porta_abrindo": "Porta abrindo", "porta_fechando": "Porta fechando",
    "trava_metal": "Trava de metal", "jingle_8bit": "Jingle 8-bit",
}


def rotulo(base, n):
    if base.startswith("voz_"):
        _, *palavras, g = base.split("_")
        return f"{' '.join(palavras).capitalize()} ({'fem.' if g == 'fem' else 'masc.'})"
    return f"{ROTULOS.get(base, base.replace('_', ' ').capitalize())} {n:02d}"


def ffmpeg():
    return shutil.which("ffmpeg") or "ffmpeg"


def baixar(url, destino):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(destino, "wb") as f:
        shutil.copyfileobj(r, f)


def kenney(raw):
    for p in KENNEY:
        d = os.path.join(raw, p)
        if os.path.isdir(d):
            continue
        pag = urllib.request.urlopen(urllib.request.Request(f"https://kenney.nl/assets/{p}", headers=UA), timeout=30).read().decode()
        url = re.search(r'https://kenney\.nl/media/pages/assets/[^"]*\.zip', pag).group(0)
        z = d + ".zip"
        baixar(url, z)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(d)


def freesound(busca, faixa, n):
    """Sons CC0 mais baixados para a busca (um por pack), na faixa de duração."""
    q = urllib.parse.urlencode({"q": busca, "f": f'license:"Creative Commons 0" duration:[{faixa[0]} TO {faixa[1]}]',
                                "s": "Downloads desc", "g": "1"})
    pag = urllib.request.urlopen(urllib.request.Request(f"https://freesound.org/search/?{q}", headers=UA), timeout=30).read().decode()
    out = []
    for bloco in re.findall(r'<div\s+class="bw-player"(.*?)tabindex', pag, re.S):
        a = dict(re.findall(r'data-([a-z-]+)="([^"]*)"', bloco))
        if "ogg" not in a or "sound-id" not in a:
            continue
        out.append({"id": a["sound-id"], "autor": html.unescape(a.get("username", "")), "titulo": html.unescape(a.get("title", "")),
                    "url": a["ogg"].replace("-lq.ogg", "-hq.ogg")})
        if len(out) >= n:
            break
    time.sleep(1)
    return out


def medir(path):
    r = subprocess.run([ffmpeg(), "-hide_banner", "-nostats", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr)
    x = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr)
    return (float(m.group(1)), float(x.group(1))) if m and x else (None, None)


def info(path):
    r = subprocess.run([ffmpeg(), "-hide_banner", "-i", path], capture_output=True, text=True)
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    canais = 1 if re.search(r"Audio:.*\bmono\b", r.stderr) else 2
    dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else 0
    return dur, canais


def tratar(origem, destino, tmp):
    """Pico a -1 dBFS, apara silêncio nas pontas (-50 dB), nivela, fade e Opus.
    Devolve a duração final, ou None se ficou vazio/curto demais ou tem pausa no meio (sets com vários sons)."""
    _, pico0 = medir(origem)
    if pico0 is None:
        return None
    apara = (f"volume={-1.0 - pico0:.2f}dB,"
             "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.004,"
             "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse")
    subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", origem, "-af", apara, "-ar", "48000", "-c:a", "pcm_f32le", tmp],
                   check=True)
    dur, canais = info(tmp)
    if dur < 0.05:
        return None
    r = subprocess.run([ffmpeg(), "-hide_banner", "-nostats", "-i", tmp, "-af", "silencedetect=n=-50dB:d=0.35", "-f", "null", "-"],
                       capture_output=True, text=True)
    if "silence_start" in r.stderr:
        return None
    media, pico = medir(tmp)
    if media is None:
        return None
    ganho = min(-20.0 - media, -1.0 - pico)
    fo = min(0.03, dur * 0.1)
    af = f"volume={ganho:.2f}dB,afade=t=in:d=0.003,afade=t=out:st={max(0, dur - fo):.3f}:d={fo:.3f}"
    subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", tmp, "-af", af, "-c:a", "libopus", "-b:a",
                    "96k" if canais == 1 else "128k", "-vbr", "on", "-compression_level", "10", "-map_metadata", "-1",
                    destino], check=True)
    return round(dur, 3)


def main(trabalho):
    raw = os.path.join(trabalho, "raw")
    cache = os.path.join(trabalho, "freesound")
    saida = os.path.join(trabalho, "soundboard")
    tmp = os.path.join(trabalho, "_tmp.wav")
    os.makedirs(raw, exist_ok=True)
    os.makedirs(cache, exist_ok=True)
    shutil.rmtree(saida, ignore_errors=True)
    kenney(raw)
    catalogo = {"versao": VERSAO, "categorias": []}
    vistos = set()
    for cid, nome, faixa, buscas, globs in CATEGORIAS:
        os.makedirs(os.path.join(saida, cid), exist_ok=True)
        sons, cont = [], {}

        def add(origem, base, fonte, titulo):
            cont[base] = cont.get(base, 0) + 1
            arq = f"{base}_{cont[base]:02d}.ogg"
            try:
                dur = tratar(origem, os.path.join(saida, cid, arq), tmp)
            except subprocess.CalledProcessError:
                dur = None
            if not dur:
                cont[base] -= 1
                return
            sons.append({"arq": f"{cid}/{arq}", "nome": rotulo(base, cont[base]), "dur": dur, "orig": titulo, "fonte": fonte, "licenca": "CC0"})

        for busca, n, base, *fora in buscas:
            try:
                achados = freesound(busca, faixa, n * 3)
            except Exception as e:
                print("  falhou a busca", busca, e)
                continue
            usados = 0
            for s in achados:
                if usados >= n or s["id"] in vistos or (fora and re.search(fora[0], s["titulo"], re.I)):
                    continue
                vistos.add(s["id"])
                arq = os.path.join(cache, s["id"] + ".ogg")
                if not os.path.isfile(arq):
                    try:
                        baixar(s["url"], arq)
                    except Exception as e:
                        print("  falhou", s["url"], e)
                        continue
                antes = len(sons)
                add(arq, base, f"Freesound #{s['id']} por {s['autor']} (freesound.org/s/{s['id']})", s["titulo"])
                usados += len(sons) - antes
        for padrao, n, base in globs:
            achados = sorted(glob.glob(os.path.join(raw, padrao), recursive=True))
            achados = [a for a in achados if a.lower().endswith((".ogg", ".wav"))]
            # espalhados pela família (não só os primeiros, que costumam ser quase iguais)
            passo = max(1, len(achados) // n) if achados else 1
            for a in achados[::passo][:n]:
                pack = os.path.relpath(a, raw).split(os.sep)[0]
                add(a, base, f"Kenney — {pack} (kenney.nl)", os.path.basename(a))
        catalogo["categorias"].append({"id": cid, "nome": nome, "sons": sons})
        print(f"{nome}: {len(sons)} sons")
    if os.path.exists(tmp):
        os.remove(tmp)
    with open(os.path.join(saida, "catalogo.json"), "w", encoding="utf-8") as f:
        json.dump(catalogo, f, ensure_ascii=False, indent=1)
    with open(os.path.join(saida, "LICENCAS.txt"), "w", encoding="utf-8") as f:
        f.write("Soundboard do Canivete do Pailer — todos os sons são CC0 (domínio público).\n"
                "Fontes: Kenney.nl (CC0) e Freesound.org (sons marcados como Creative Commons 0).\n"
                "A origem de cada som está no campo \"fonte\" de catalogo.json.\n")
    z = os.path.join(trabalho, f"soundboard-v{VERSAO}.zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_STORED) as zf:   # Opus já é comprimido
        for raiz, _, arqs in os.walk(saida):
            for a in arqs:
                p = os.path.join(raiz, a)
                zf.write(p, os.path.relpath(p, saida))
    total = sum(len(c["sons"]) for c in catalogo["categorias"])
    print(f"{total} sons · {os.path.getsize(z) / 1048576:.1f} MB · {z}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.getcwd(), "_soundboard"))
