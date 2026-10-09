"""Teste da exportação para o Premiere (XML do Final Cut Pro 7): Functions/premiere_xml.py.

    py -3.13 testes/teste_premiere_xml.py ["<projeto.vknv>"]

Sem projeto, monta um caso sintético (velocidade, quadros-chave, imagem, sequência aninhada, ganho, clipe desligado,
vínculo, transição). Exporta, relê o XML e confere: XML válido, cada clipe do .vknv vira os itens esperados no tempo
certo (início/fim na sequência, entrada na mídia), vínculos recíprocos, <file>/<sequence> referenciados definidos,
nenhuma sobreposição na mesma faixa e os valores de Movimento/Opacidade/Velocidade/Nível. Sai com 1 se reprovar.
"""
import json
import os
import sys
import tempfile
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from Functions import premiere_xml as px  # noqa: E402

erros = []
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def falha(msg):
    erros.append(msg)
    print("  ✗", msg)


def probe_falso(path):
    nome = os.path.basename(path).lower()
    if nome.endswith(".png"):
        return {"largura": 3000, "altura": 2000}
    if nome == "girado.mp4":   # celular: gravado 1920×1080 com a marca de girar 90°
        return {"duracao": 30, "largura": 1920, "altura": 1080, "audio": {},
                "video": {"avg_frame_rate": "30/1", "side_data_list": [{"rotation": -90}]}}
    if nome.endswith(".wav"):
        return {"duracao": 60, "audio": {"sample_rate": "48000", "channels": 2}}
    return {"duracao": 120, "largura": 3840, "altura": 2160, "video": {"avg_frame_rate": "30/1"},
            "audio": {"sample_rate": "48000", "channels": 2}}


def caso_sintetico(pasta):
    for n in ("a.mp4", "b.mp4", "foto.png", "musica.wav", "girado.mp4"):
        open(os.path.join(pasta, n), "wb").close()
    j = lambda n: os.path.join(pasta, n)
    seq_filha = {"id": "s2", "name": "Aninhada", "w": 1920, "h": 1080, "trilhas": {"v": [{}], "a": [{}]},
                 "clips": [{"tr": 0, "st": 0, "s": 10, "e": 14, "m": 1}]}
    principal = {"id": "s1", "name": "Principal", "w": 1920, "h": 1080,
                 "trilhas": {"v": [{}, {"hide": True}], "a": [{}, {"mute": True}]},
                 "markers": [{"t": 2, "nome": "batida"}],
                 "clips": [
                     {"tr": 0, "st": 0, "s": 5, "e": 9, "m": 0, "g": -6, "tin": {"t": "dissolve", "d": 0.5},
                      "fx": [{"t": "key", "on": True}]},
                     {"tr": 0, "st": 4, "s": 20, "e": 24, "m": 1, "v": 2, "x": "v", "lk": "L1",
                      "p": {"sc": 80, "x": 1200, "y": 300, "rot": 15, "op": 70}},
                     {"tr": 0, "st": 4, "s": 20, "e": 24, "m": 1, "v": 2, "x": "a", "lk": "L1"},
                     {"tr": 1, "st": 1, "s": 0, "e": 3, "m": 2,
                      "k": {"x": [{"t": 0, "v": 960, "i": "lin"}, {"t": 3, "v": 1500, "i": "ease"}],
                            "op": [{"t": 0, "v": 0, "i": "lin"}, {"t": 1, "v": 100, "i": "lin"}]}},
                     {"tr": 1, "st": 6, "s": 0, "e": 4, "m": 4, "off": True},
                     {"tr": 2, "st": 0, "s": 0, "e": 8, "m": 3},
                     {"tr": 2, "st": 8, "s": 0, "e": 2, "m": 5},
                     {"tr": 3, "st": 0, "s": 0, "e": 2, "m": 6, "x": "v"},
                 ]}
    return {"video": j("a.mp4"), "fps": 30, "w": 1920, "h": 1080, "activeSequence": "s1",
            "media": [{"id": 1, "kind": "video", "path": j("b.mp4"), "name": "b.mp4"},
                      {"id": 2, "kind": "image", "path": j("foto.png"), "w": 3000, "h": 2000},
                      {"id": 3, "kind": "audio", "path": j("musica.wav")},
                      {"id": 4, "kind": "timeline", "sequenceId": "s2"},
                      {"id": 5, "kind": "texto", "name": "Texto"},
                      {"id": 6, "kind": "video", "path": j("girado.mp4"), "name": "girado.mp4"}],
            "sequences": [principal, seq_filha]}


def esperado(dados):
    """Para cada sequência: lista de (tipo, faixa, início, fim) em quadros, com o mesmo critério do exportador."""
    ex = px._Exportador(dados, probe_falso if SINTETICO else None)
    out = {}
    for sid, s in ex.seqs.items():
        itens = []
        for c in s.get("clips") or []:
            if c.get("tr", 0) < 0:
                continue
            for it in ex.itens_do_clipe(c, 1920, 1080):
                # áudio estéreo: duas trilhas explodidas por trilha (canal 1 e 2), como o Premiere grava
                faixa = c["tr"] + 1 if it["tipo"] == "video" else c["tr"] * 2 + it.get("canal", 1)
                itens.append((it["tipo"], faixa, it["start"], it["end"]))
        out[s.get("name") or "Sequência"] = sorted(itens)
    return out


def ler_xml(path):
    raiz = ET.parse(path).getroot()
    if raiz.tag != "xmeml":
        falha("raiz não é xmeml")
    seqs, files, ids = {}, set(), {}
    for f in raiz.iter("file"):
        if f.find("pathurl") is not None:
            files.add(f.get("id"))
    for f in raiz.iter("file"):
        if f.find("pathurl") is None and f.get("id") not in files:
            falha(f"<file id={f.get('id')}> referenciado sem definição")
    definidas = {s.get("id") for s in raiz.iter("sequence") if s.find("media") is not None}
    for s in raiz.iter("sequence"):
        if s.find("media") is None and s.get("id") not in definidas:
            falha(f"<sequence id={s.get('id')}> referenciada sem definição")
        if s.find("media") is None:
            continue
        itens = []
        for tipo in ("video", "audio"):
            bloco = s.find(f"media/{tipo}")
            for ti, faixa in enumerate(bloco.findall("track") if bloco is not None else []):
                ultimo = -1
                for ci in faixa.findall("clipitem"):
                    a, b = int(ci.findtext("start")), int(ci.findtext("end"))
                    if a < ultimo:
                        falha(f"{s.findtext('name')}: sobreposição em {tipo} {ti + 1} no quadro {a}")
                    ultimo = b
                    ids[ci.get("id")] = ci
                    itens.append((tipo, ti + 1, a, b))
        seqs[s.findtext("name")] = sorted(itens)
    # vínculos recíprocos
    for cid, ci in ids.items():
        refs = [l.findtext("linkclipref") for l in ci.findall("link")]
        if refs and cid not in refs:
            falha(f"{cid}: links sem ele mesmo")
        for r in refs:
            if r not in ids:
                falha(f"{cid}: link para {r} que não existe")
            elif cid not in [l.findtext("linkclipref") for l in ids[r].findall("link")]:
                falha(f"{cid} → {r}: vínculo não é recíproco")
    return raiz, seqs, ids


def conferir_sintetico(raiz, ids):
    def clip_por_nome(nome, tipo="video"):
        for ci in ids.values():
            if ci.findtext("name") == nome and (ci.find("sourcetrack") is None) == (tipo == "video"):
                return ci
        falha(f"clipe {nome} ({tipo}) não está no XML")

    def param(ci, pid):
        for p in ci.iter("parameter"):
            if p.findtext("parameterid") == pid:
                return p

    b = clip_por_nome("b.mp4")
    if b is not None:
        if (b.findtext("in"), b.findtext("out")) != ("300", "360"):
            falha(f"b.mp4 a 200%: in/out {b.findtext('in')}/{b.findtext('out')} (esperado 300/360)")
        if abs(float(param(b, "speed").findtext("value")) - 200) > 0.01:
            falha("velocidade não é 200")
        c = param(b, "center").find("value")
        hz, vt = float(c.findtext("horiz")), float(c.findtext("vert"))
        # centro em frações da MÍDIA (3840×2160), não do quadro: (1200−960)/3840, (300−540)/2160
        if abs(hz - 0.0625) > 1e-4 or abs(vt + 0.1111) > 1e-3:
            falha(f"centro {hz},{vt} (esperado 0,0625, −0,111)")
        if float(param(b, "scale").findtext("value")) != 80 or float(param(b, "opacity").findtext("value")) != 70:
            falha("escala/opacidade de b.mp4")
    a_aud = clip_por_nome("a.mp4", "audio")
    if a_aud is not None and abs(float(param(a_aud, "level").findtext("value")) - 0.50119) > 1e-4:
        falha("ganho −6 dB não virou 0,50119")
    foto = clip_por_nome("foto.png")
    if foto is not None:
        ks = param(foto, "center").findall("keyframe")
        if len(ks) != 2 or ks[1].findtext("when") != "90":
            falha("quadros-chave de posição da foto")
        if abs(float(param(foto, "scale").findtext("value")) - 54) > 0.01:
            falha("foto 3000×2000 deveria entrar a 54% (caber no quadro)")
    gir = clip_por_nome("girado.mp4")
    sc_gir = float(param(gir, "scale").findtext("value")) if gir is not None and param(gir, "scale") is not None else 100
    if abs(sc_gir - 56.25) > 0.01:
        falha(f"vídeo girado 90°: escala {sc_gir} (esperado 56,25 = 1080 de altura no quadro)")
    # clipe com escala 100% também leva o Basic Motion (sem ele o Premiere encolhe o vertical)
    sem_motion = [ci.findtext("name") for ci in ids.values() if ci.find("sourcetrack") is None
                  and ci.find("sequence") is None and param(ci, "scale") is None]
    if sem_motion:
        falha(f"clipes de vídeo sem Basic Motion: {sem_motion}")
    off = [ci for ci in ids.values() if ci.find("sequence") is not None]
    if not off or off[0].findtext("enabled") != "FALSE":
        falha("sequência aninhada desligada")
    if not any(t.findtext("effect/name") == "Cross Dissolve" for t in raiz.iter("transitionitem")):
        falha("Cross Dissolve não foi")
    if not raiz.findall(".//marker"):
        falha("marcador não foi")


def main():
    global SINTETICO
    SINTETICO = len(sys.argv) < 2
    base = os.environ.get("TEMP") or tempfile.gettempdir()
    pasta = os.path.join(base, "canivete_teste_premiere_xml")
    os.makedirs(pasta, exist_ok=True)
    if SINTETICO:
        dados = caso_sintetico(pasta)
        destino = os.path.join(pasta, "sintetico.xml")
    else:
        with open(sys.argv[1], encoding="utf-8") as f:
            dados = json.load(f)
        destino = os.path.join(pasta, os.path.splitext(os.path.basename(sys.argv[1]))[0] + ".xml")
    path, rel = px.exportar(destino, dados, probe_falso if SINTETICO else None)
    print("XML:", path)
    print("relatório:", json.dumps(rel, ensure_ascii=False))
    raiz, seqs, ids = ler_xml(path)
    for nome, itens in esperado(dados).items():
        if seqs.get(nome) != itens:
            got = seqs.get(nome) or []
            falha(f"{nome}: {len(got)} itens no XML, {len(itens)} esperados"
                  + (f"; 1º diferente: {next((a, b) for a, b in zip(got, itens) if a != b)}" if got and len(got) == len(itens) else ""))
        else:
            print(f"  ✓ {nome}: {len(itens)} itens no tempo certo")
    if SINTETICO:
        conferir_sintetico(raiz, ids)
        nomes = {i["o_que"] for i in rel["ignorados"]}
        for preciso in ("Textos", "Efeito Chroma Key"):
            if preciso not in nomes:
                falha(f"relatório sem '{preciso}'")
    print("REPROVADO" if erros else "OK", f"({len(erros)} erro(s))")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
