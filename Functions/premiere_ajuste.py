"""Camadas de ajuste depois de importar um XML no Premiere.

O XML (FCP7) não tem camada de ajuste: até o XML que o próprio Premiere exporta leva a camada como um "Black Video"
(Slug) com os efeitos dentro, e ao importar ela vira vídeo PRETO cobrindo a imagem. No .prproj a camada de ajuste é o
mesmo Black Video com duas marcas: <IsAdjustmentLayer> no MasterClip e <AdjustmentLayer> em cada VideoClip.
Este módulo põe essas marcas num .prproj salvo (projeto FECHADO no Premiere) — o exportador do Kanivete
(premiere_xml) manda as camadas de ajuste como Black Video, e o Black Video não aparece de outro jeito no XML dele.
"""
import gzip
import os
import re
import shutil


def _objetos(xml, tag):
    """{ObjectID/ObjectUID: (início, fim)} dos objetos <tag ...>...</tag> de primeiro nível."""
    out = {}
    for m in re.finditer(rf'<{tag} (?:ObjectID|ObjectUID)="([^"]+)"[^>]*>', xml):
        fim = xml.find(f"</{tag}>", m.end())
        if fim > 0:
            out[m.group(1)] = (m.start(), fim)
    return out


def marcar(prproj, titulos=None, backup=True):
    """Marca como camada de ajuste a mídia sintética com um destes títulos (padrão: a do Kanivete). Devolve
    {mestres, clipes}. titulos=("Black Video",) pega também o XML exportado pelo próprio Premiere."""
    if titulos is None:
        from Functions.premiere_xml import NOME_AJUSTE
        titulos = (NOME_AJUSTE,)
    with gzip.open(prproj) as f:
        xml = f.read().decode("utf-8")
    # a mídia sintética (Slug) das camadas de ajuste
    pretas = {uid for uid, (a, b) in _objetos(xml, "Media").items()
              if (m := re.search(r"<Title>([^<]*)</Title>", xml[a:b])) and m.group(1) in titulos}
    # fontes de vídeo que apontam para ela
    fontes = set()
    for oid, (a, b) in _objetos(xml, "VideoMediaSource").items():
        m = re.search(r'<Media ObjectURef="([^"]+)"', xml[a:b])
        if m and m.group(1) in pretas:
            fontes.add(oid)
    # VideoClips com essas fontes
    clipes = {oid for oid, (a, b) in _objetos(xml, "VideoClip").items()
              if (m := re.search(r'<Source ObjectRef="([^"]+)"', xml[a:b])) and m.group(1) in fontes}
    trocas = []   # (posição, texto a inserir)
    for oid, (a, b) in _objetos(xml, "VideoClip").items():
        if oid in clipes and "<AdjustmentLayer>" not in xml[a:b]:
            trocas.append((b, "\t<AdjustmentLayer>true</AdjustmentLayer>\n\t"))
    n_mestres = 0
    for uid, (a, b) in _objetos(xml, "MasterClip").items():
        refs = set(re.findall(r'<Clip Index="\d+" ObjectRef="([^"]+)"', xml[a:b]))
        if refs & clipes and "<IsAdjustmentLayer>" not in xml[a:b]:
            trocas.append((b, "\t<IsAdjustmentLayer>true</IsAdjustmentLayer>\n\t"))
            n_mestres += 1
    if not trocas:
        return {"mestres": 0, "clipes": 0}
    for pos, txt in sorted(trocas, reverse=True):
        xml = xml[:pos] + txt + xml[pos:]
    if backup:
        shutil.copy2(prproj, prproj + ".antes-ajuste")
    tmp = prproj + ".tmp"
    with gzip.open(tmp, "wb") as f:
        f.write(xml.encode("utf-8"))
    os.replace(tmp, prproj)
    return {"mestres": n_mestres, "clipes": len(clipes)}


if __name__ == "__main__":
    import sys
    print(marcar(sys.argv[1], tuple(sys.argv[2:]) or None))
