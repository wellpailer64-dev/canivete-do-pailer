"""Núcleo de hardware (Functions/hardware.py): o PC lido, o plano de cada nível, o modo, o balanceador de memória e,
com --app, o editor seguindo o plano num app simulado (tools/hw_simular.py).

    py -3.13 testes/teste_hardware.py           # só Python (segundos)
    py -3.13 testes/teste_hardware.py --app     # + app de teste como PC leve com e sem placa na tela (~1 min)
"""
import json
import os
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
erros = 0


def ok(c, nome, det=""):
    global erros
    erros += not c
    print(("  ok    " if c else "  FALHOU ") + nome + (f" ({det})" if det else ""), flush=True)


def com_sim(perfil, codigo):
    """Roda `codigo` num Python novo com CANIVETE_HW_SIMULAR=perfil e devolve o JSON que ele imprime."""
    env = dict(os.environ, CANIVETE_HW_SIMULAR=perfil, APPDATA=tempfile.mkdtemp(dir="D:/kanivete_testes/tmp"))
    r = subprocess.run([sys.executable, "-c", "import sys,json;sys.path.insert(0,r'%s');from Functions import hardware as h\n%s" % (RAIZ, codigo)],
                       env=env, capture_output=True, text=True)
    return json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else {"erro": r.stderr[-400:]}


def python():
    from Functions import hardware
    hw = hardware.detectar()
    ok(hw["threads"] >= 1 and hw["ram_gb"] > 1 and hw["cpu"], "lê processador e RAM", f"{hw['cpu']} · {hw['threads']} threads · {hw['ram_gb']} GB")
    ok(all(p["vram_gb"] >= 0 and p["fabricante"] for p in hw["placas"]), "lê as placas (qualquer marca)", str([(p["nome"], p["vram_gb"]) for p in hw["placas"]]))
    pl = hardware.plano()
    ok(set(pl) >= {"nivel", "threads_trabalho", "threads_ia", "cache_editor_mb", "soltar_modelo_s", "ia_na_placa", "export_na_placa"}, "plano completo", pl["nivel"])

    leve = com_sim("leve", "print(json.dumps([h.plano(), h.cpus(), h.threads_ia()]))")
    p, cpus, tia = leve if isinstance(leve, list) else ({}, 0, 0)
    ok(p.get("nivel") == "leve" and cpus == 4 and tia == 3, "PC leve: 4 threads, IA com 3", str(leve)[:200])
    ok(p.get("cache_editor_mb") == 512 and p.get("previa_altura") == 720 and p.get("soltar_modelo_s") == 60 and not p.get("ia_na_placa") and not p.get("export_na_placa"),
       "PC leve: cache 512 MB, prévias 720p, modelo sai em 1 min, IA e export no processador")
    med = com_sim("medio", "print(json.dumps(h.plano()))")
    ok(med.get("nivel") == "medio" and med.get("ia_na_placa") and med.get("cache_editor_mb") == 768, "PC médio (placa de 4 GB): IA na placa, cache 768 MB", str(med)[:160])
    eco = com_sim("medio", "h.definir_modo('economia'); print(json.dumps(h.plano()))")
    ok(eco.get("efetivo") == "leve" and eco.get("modo") == "economia", "modo Economia desce um nível", str(eco.get("efetivo")))
    maxi = com_sim("leve", "h.definir_modo('maximo'); print(json.dumps(h.plano()))")
    ok(maxi.get("efetivo") == "medio" and not maxi.get("ia_na_placa"), "modo Máximo sobe um nível, mas sem placa a IA fica no processador")
    # export pela placa: integrada não vai
    exp = com_sim("leve", "from Functions import export_placa as e\nprint(json.dumps(e.motivo([], [{}], None, {}, 'h264', 8)))")
    ok(exp == "placa integrada ou pequena", "export: placa integrada não monta na GPU", str(exp))
    # balanceador de memória
    mem = com_sim("leve", "from Functions import memoria as m\nm.usado('x', lambda: None)\nprint(json.dumps(m._REG['x']['limite']))")
    ok(mem == 60, "memória: no PC leve o modelo parado sai em 60 s (era 300)", str(mem))
    mem = com_sim("forte", "from Functions import memoria as m\nm.usado('x', lambda: None, m.GPU)\nprint(json.dumps(m._REG['x']['limite']))")
    ok(mem == 180, "memória: no PC forte continua igual (placa 180 s)", str(mem))
    ap = com_sim("leve", """from Functions import memoria as m
import time
soltos = []
m._ram_apertada = lambda: True
m.usado('a', lambda: soltos.append('a'))
m._REG['a']['ultimo'] -= 30
agora = time.monotonic()
venc = [n for n, r in m._REG.items() if agora - r['ultimo'] > (m.PARADO_MIN if m._ram_apertada() else r['limite'])]
print(json.dumps(venc))""")
    ok(ap == ["a"], "memória: RAM apertada solta o que está parado há 20 s", str(ap))


def app():
    sonda = os.path.join(tempfile.mkdtemp(dir="D:/kanivete_testes/tmp"), "sonda.py")
    open(sonda, "w", encoding="utf-8").write("""import json, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp('http://127.0.0.1:9342')
    pg = next(x for c in b.contexts for x in c.pages if 'index.html' in x.url)
    pg.wait_for_function('typeof VEHW === "object" && !!VEHW.plano', timeout=90000)
    if pg.evaluate("localStorage.getItem('ve.previewRes')") is not None:   # escolha de outro teste: limpa e recarrega
        pg.evaluate("localStorage.removeItem('ve.previewRes')"); pg.reload()
        pg.wait_for_function('typeof VEHW === "object" && !!VEHW.plano', timeout=90000)
    print('SONDA ' + json.dumps(pg.evaluate('({nivel: VEHW.plano.nivel, cacheMb: veCache().maxBytes / 1048576, res: VEM.res, semPlaca: veTelaSemPlaca()})')))
""")
    for extra, esperado in (([], {"nivel": "leve", "cacheMb": 512, "res": 1}), (["--sem-gpu-tela"], {"nivel": "leve", "cacheMb": 512, "res": 0.5})):
        # preferência de prévia limpa: a 1/2 automática só vale sem escolha da pessoa
        r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "hw_simular.py"), "leve", "--porta", "9342", "--limpo", *extra, "--",
                            sys.executable, sonda], capture_output=True, text=True, encoding="utf-8", errors="replace")
        linha = next((l for l in r.stdout.splitlines() if l.startswith("SONDA ")), None)
        d = json.loads(linha[6:]) if linha else {}
        nome = "tela sem placa" if extra else "integrada"
        ok(all(d.get(k) == v for k, v in esperado.items()), f"editor no PC leve ({nome}): cache {esperado['cacheMb']} MB, prévia {esperado['res']}", str(d or r.stdout[-300:]))


if __name__ == "__main__":
    python()
    if "--app" in sys.argv:
        app()
    print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
    sys.exit(1 if erros else 0)
