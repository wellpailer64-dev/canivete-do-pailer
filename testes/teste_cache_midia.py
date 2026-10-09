"""
teste_cache_midia.py — A limpeza do cache de mídia (video_cutter.manutencao_midia) nunca apaga o que está em uso.

Uso:  py -3.13 testes/teste_cache_midia.py          (não precisa do app; usa uma pasta temporária no D:)

Monta um cache falso acima do limite (pastas m_* com uma "prévia" de 1 MB e áudios aud_*.pcm), marca parte como em
uso (como o app marca as mídias do projeto aberto) e roda a limpeza:
  - o que está em uso fica, mesmo velho e mesmo com o cache acima do limite;
  - o que não está em uso sai até caber no limite (os mais antigos primeiro) ou por idade;
  - o estado "em uso" e o registro do servidor de mídia sobrevivem a importlib.reload (modo agente).
Sai com 1 se algo falhar. Bug de 2026-10-09: projeto maior que o limite → a limpeza apagava prévias do próprio
projeto (refeitas a cada abertura) e a pasta de um vídeo no meio da conversão ("Error opening output files").
"""
import importlib
import os
import shutil
import sys
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
BASE = r"D:\kanivete_testes\cache_midia_teste"


def main():
    from Functions import video_cutter as vc, media_server
    shutil.rmtree(BASE, ignore_errors=True)
    os.makedirs(BASE)
    agora = time.time()
    itens = {}
    for i in range(10):   # 10 pastas de 1 MB: 5 em uso, 5 não; metade bem velhas (40 dias)
        p = os.path.join(BASE, f"m_teste{i:02d}")
        os.makedirs(p)
        with open(os.path.join(p, "proxy_v2.mp4"), "wb") as f:
            f.write(b"\0" * 1024 * 1024)
        velho = agora - (40 if i % 2 else 2) * 86400
        os.utime(p, (velho, velho))
        itens[p] = i < 5
    aud = os.path.join(BASE, "aud_teste.pcm")
    with open(aud, "wb") as f:
        f.write(b"\0" * 1024 * 1024)
    os.utime(aud, (agora - 40 * 86400,) * 2)
    itens[aud] = True

    vc._EM_USO.clear()
    for p, uso in itens.items():
        if uso:
            vc._em_uso(p)
    orig_dir, orig_cfg = vc._midia_dir, vc._cache_cfg
    vc._midia_dir = lambda: BASE
    vc._cache_cfg = lambda: {**orig_cfg(), "dias": 30, "max_gb": 3 / 1024}   # limite de 3 MB: força a limpeza por tamanho
    try:
        vc.manutencao_midia()
    finally:
        vc._midia_dir, vc._cache_cfg = orig_dir, orig_cfg

    falhas = []
    for p, uso in itens.items():
        existe = os.path.exists(p)
        if uso and not existe:
            falhas.append(f"apagou o que estava EM USO: {os.path.basename(p)}")
    sobrou_fora = [p for p, uso in itens.items() if not uso and os.path.exists(p)]
    total_fora = sum(os.path.getsize(os.path.join(p, "proxy_v2.mp4")) for p in sobrou_fora)
    if total_fora > 3 * 1024 * 1024:
        falhas.append(f"não liberou espaço: sobraram {len(sobrou_fora)} pastas fora de uso")
    if any(os.path.exists(p) for p, uso in itens.items() if not uso and "m_teste0" in p and int(p[-1]) % 2):
        falhas.append("ficou pasta fora de uso com 40 dias (limite de idade: 30)")

    # recarga do módulo (modo agente) não pode zerar o estado
    vc._em_uso(os.path.join(BASE, "m_teste00"))
    url = media_server.register(os.path.join(BASE, "m_teste00", "proxy_v2.mp4"))
    vc2 = importlib.reload(vc)
    ms2 = importlib.reload(media_server)
    if os.path.normcase(os.path.abspath(os.path.join(BASE, "m_teste00"))) not in vc2._EM_USO:
        falhas.append("importlib.reload zerou o cache em uso (_EM_USO)")
    token = url.rstrip("/").split("/")[-2] if "/m/" in url else None
    if token and token not in ms2._registry:
        falhas.append("importlib.reload zerou o registro do servidor de mídia")

    falhas += retentativa(vc2)
    shutil.rmtree(BASE, ignore_errors=True)
    if falhas:
        print("REPROVADO:")
        for f in falhas:
            print("  -", f)
        sys.exit(1)
    print("OK: em uso fica (por idade e por tamanho), fora de uso sai, e o estado sobrevive à recarga do módulo")


def retentativa(vc):
    """Prévia que falha por acaso (pasta sumiu no meio) é refeita sozinha; arquivo que sumiu não insiste."""
    falhas = []
    os.makedirs(BASE, exist_ok=True)
    video = os.path.join(BASE, "falso.mp4")
    with open(video, "wb") as f:
        f.write(b"\0")
    orig = {k: getattr(vc, k) for k in ("probe", "_navegador_toca", "gerar_proxy", "_pasta_midia", "adicionar_audio")}
    chamadas = []

    def gerar(path, info, out, on_pct, stop_event=None, **kw):
        chamadas.append(out)
        if len(chamadas) < 3:
            return False, "Error opening output files", None
        with open(out, "wb") as f:
            f.write(b"\0")
        return True, "", None

    vc.probe = lambda p: {"duration": 10.0, "has_video": True, "has_audio": False, "alfa": False}
    vc._navegador_toca = lambda p, i: False
    vc.gerar_proxy = gerar
    vc._pasta_midia = lambda p: os.path.join(BASE, "m_falso")
    os.makedirs(os.path.join(BASE, "m_falso"), exist_ok=True)
    try:
        ev = []
        vc.preparar_midia(video, ev.append)
        etapas = [e["stage"] for e in ev]
        if len(chamadas) != 3 or "video" not in etapas or "error" in etapas:
            falhas.append(f"retentativa: {len(chamadas)} conversões, etapas {etapas} (esperado 3 e prévia pronta)")
        chamadas.clear()
        vc.gerar_proxy = lambda *a, **k: (chamadas.append(1), os.remove(video), (False, "falhou", None))[2]
        for x in os.listdir(os.path.join(BASE, "m_falso")):
            os.remove(os.path.join(BASE, "m_falso", x))
        ev = []
        vc.preparar_midia(video, ev.append)
        if len(chamadas) != 1 or ev[-1]["stage"] != "error":
            falhas.append(f"arquivo sumido: {len(chamadas)} conversões (esperado 1 e erro)")
    finally:
        for k, v in orig.items():
            setattr(vc, k, v)
    return falhas


if __name__ == "__main__":
    main()
