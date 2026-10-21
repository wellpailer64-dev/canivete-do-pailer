"""Exportar pela fila do Kanivete Encoder no app aberto (modo agente), barato em tokens e sem ficar preso.

    py -3.13 tools/ke_fila.py render --nome "Mega V2 FHD" [--res 1080] [--drive LINK] [--dest PASTA] [--porta 9222]
    py -3.13 tools/ke_fila.py estado
    py -3.13 tools/ke_fila.py drive-listar --pasta ID_OU_LINK
    py -3.13 tools/ke_fila.py drive-apagar --pasta ID_OU_LINK --nome "arquivo.mp4"     (vai para a lixeira do Drive)

render: põe a timeline aberta na fila com as configurações do painel (o que for passado substitui), começa o render e
espera o fim do vídeo E do envio ao Drive, uma linha por mudança (fase/10%); no fim confere o arquivo com o vigia
(tools/vigia_export.py --so-conferir: quadros pretos, silêncio, LUFS). Sai com 1 se falhar, travar (sem andar por
--parado s) ou o arquivo tiver quadro preto. Última linha: JSON {saida, link, ok}.
"""
import argparse, json, os, re, subprocess, sys, time

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _pagina(porta):
    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    b = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}", timeout=15000)
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    pg.set_default_timeout(600000)
    return pw, pg


ESTADO = """() => VEFILA.itens.map(i => ({id: i.id, nome: i.cfg && i.cfg.nome, estado: i.estado, pct: Math.round(i.pct || 0),
  msg: i.msg || '', erro: i.erro || null, motivo: i.motivoCpu || null, saida: i.saida || null,
  drive: i.drive ? {fase: i.drive.fase, pct: Math.round(i.drive.pct || 0), link: i.drive.link || null, erro: i.drive.erro || null} : null,
  pedeDrive: !!(i.cfg && i.cfg.drive)}))"""


def _pasta_id(p):
    m = re.search(r"folders/([\w-]+)", p or "")
    return m.group(1) if m else p


def _rclone(args, timeout=120):
    sys.path.insert(0, RAIZ)
    from Functions import drive_envio as de
    return de._rodar(args, timeout)


def render(a):
    pw, pg = _pagina(a.porta)
    try:
        cfg = pg.evaluate("() => veFilaCfgLer()")
        cfg.update({k: v for k, v in (("nome", a.nome), ("res", a.res), ("drive", a.drive), ("dest", a.dest)) if v})
        if a.dest:
            cfg["destLabel"] = a.dest
        antes = pg.evaluate("() => VEFILA.itens.length")
        pg.evaluate("c => VEFILA_API.adicionar(c.nome, c)", cfg)
        itens = pg.evaluate(ESTADO)
        if len(itens) <= antes:
            print("não entrou na fila (veja o aviso no app)"); return 1
        iid = itens[-1]["id"]
        print(f"na fila: #{iid} {cfg['nome']} · {cfg['res']} · placa={cfg['gpu']} · drive={'sim' if cfg.get('drive') else 'não'}", flush=True)
        pg.evaluate("() => VEFILA_API.iniciar()")
        ultimo, marca, t_mud = None, time.time(), time.time()
        while True:
            time.sleep(a.passo)
            it = next((x for x in pg.evaluate(ESTADO) if x["id"] == iid), None)
            if not it:
                print("item sumiu da fila"); return 1
            d = it["drive"] or {}
            chave = (it["estado"], it["pct"] // 10, it["motivo"], d.get("fase"), d.get("pct", 0) // 10)
            if chave != ultimo:
                ultimo, t_mud = chave, time.time()
                print(f"{time.strftime('%H:%M:%S')} {it['estado']} {it['pct']}%"
                      + (f" · processador: {it['motivo']}" if it["motivo"] else "")
                      + (f" · drive {d.get('fase')} {d.get('pct', 0)}%" if d else ""), flush=True)
            if it["estado"] in ("erro", "cancelado") or d.get("fase") in ("erro", "cancelado"):
                print("FALHOU:", it["erro"] or d.get("erro")); return 1
            pronto = it["estado"] == "pronto" and (not it["pedeDrive"] or d.get("fase") == "pronto")
            if pronto:
                break
            if time.time() - t_mud > a.parado:
                print(f"TRAVADO: nada mudou em {a.parado} s ({it['msg']})"); return 1
        saida = it["saida"]
    finally:
        pw.stop()
    r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "vigia_export.py"), "--so-conferir", saida],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1800)
    rel = (r.stdout or "").strip()
    print(rel)
    ok = "quadro preto" not in rel and r.returncode == 0
    print(json.dumps({"saida": saida, "link": d.get("link"), "ok": ok}, ensure_ascii=False))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("acao", choices=["render", "estado", "drive-listar", "drive-apagar"])
    ap.add_argument("--porta", type=int, default=9222)
    ap.add_argument("--nome"); ap.add_argument("--res"); ap.add_argument("--drive"); ap.add_argument("--dest")
    ap.add_argument("--pasta"); ap.add_argument("--passo", type=float, default=5)
    ap.add_argument("--parado", type=float, default=600, help="segundos sem andar = travado")
    a = ap.parse_args()
    if a.acao == "render":
        return render(a)
    if a.acao == "estado":
        pw, pg = _pagina(a.porta)
        try:
            print(json.dumps(pg.evaluate(ESTADO), ensure_ascii=False, indent=1))
        finally:
            pw.stop()
        return 0
    pasta = _pasta_id(a.pasta)
    if a.acao == "drive-listar":
        r = _rclone(["lsjson", "gdrive:", "--drive-root-folder-id", pasta, "--files-only"])
        for x in json.loads(r.stdout or "[]"):
            print(x["Name"], x["Size"], x["ModTime"][:16])
        return r.returncode
    r = _rclone(["deletefile", f"gdrive:{a.nome}", "--drive-root-folder-id", pasta])   # lixeira do Drive (recuperável)
    print("apagado (lixeira)" if r.returncode == 0 else "erro: " + r.stderr[-300:])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
